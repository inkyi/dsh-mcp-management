#!/usr/bin/env node
/**
 * Smoke test for test/mcp-server-fixture.mjs.
 *
 * Spawns the fixture as a child process, performs the legacy `initialize`
 * handshake over newline-delimited JSON-RPC, exercises tools/list + tools/call,
 * asserts the fixture declined `server/discover` (so MCP SDK v2 auto
 * negotiation falls back to `initialize`), and asserts the call log was
 * written. Cleans its own scratch log directory afterwards
 * (test/tmp/smoke/); the shared test/tmp/calls.log is left untouched.
 *
 * Usage: node test/fixture-smoke.mjs
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createInterface } from 'node:readline'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const FIXTURE = join(HERE, 'mcp-server-fixture.mjs')
const SMOKE_DIR = join(HERE, 'tmp', 'smoke')
const SMOKE_LOG = join(SMOKE_DIR, 'calls.log')

const pending = new Map()
let nextId = 1

function startFixture() {
  const child = spawn(process.execPath, [FIXTURE], {
    env: { ...process.env, MCP_FIXTURE_CALLS_LOG: SMOKE_LOG },
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  const stdoutLines = []
  const rl = createInterface({ input: child.stdout, crlfDelay: Infinity })
  rl.on('line', (line) => {
    if (line.trim() === '') return
    let message
    try {
      message = JSON.parse(line)
    } catch (error) {
      console.error(`[smoke] fixture emitted non-JSON stdout: ${line}`)
      process.exitCode = 1
      return
    }
    stdoutLines.push(message)
    const waiter = pending.get(message.id)
    if (waiter !== undefined) {
      pending.delete(message.id)
      waiter(message)
    }
  })
  child.stderr.on('data', (chunk) => process.stderr.write(`[fixture] ${chunk}`))
  child.on('error', (error) => console.error(`[smoke] failed to spawn fixture: ${String(error)}`))
  return { child, stdoutLines }
}

/** Send one JSON-RPC message and resolve with the matching response. */
function send(child, message, timeoutMs = 5000) {
  const key = Object.prototype.hasOwnProperty.call(message, 'id') ? message.id : undefined
  return new Promise((resolve, reject) => {
    if (key === undefined) {
      // Notification: no response is expected, resolve once it is written.
      child.stdin.write(`${JSON.stringify(message)}\n`, (error) => {
        if (error !== null && error !== undefined) reject(error)
        else resolve(undefined)
      })
      return
    }
    const timer = setTimeout(() => {
      pending.delete(key)
      reject(new Error(`timed out waiting for JSON-RPC response to ${String(message.method)}`))
    }, timeoutMs)
    pending.set(key, (response) => {
      clearTimeout(timer)
      resolve(response)
    })
    child.stdin.write(`${JSON.stringify(message)}\n`)
  })
}

async function main() {
  rmSync(SMOKE_DIR, { recursive: true, force: true })
  mkdirSync(SMOKE_DIR, { recursive: true })

  const { child, stdoutLines } = startFixture()

  try {
    // 1. initialize is answered with a negotiated protocol version + tools capability.
    const initialize = await send(child, {
      jsonrpc: '2.0',
      id: nextId++,
      method: 'initialize',
      params: {
        protocolVersion: '2025-11-25',
        capabilities: {},
        clientInfo: { name: 'fixture-smoke', version: '1.0.0' },
      },
    })
    assert.equal(initialize.jsonrpc, '2.0')
    assert.equal(initialize.result.protocolVersion, '2025-11-25', 'initialize should echo the negotiated legacy version')
    assert.ok(initialize.result.capabilities?.tools !== undefined, 'server must advertise tools capability')
    assert.equal(typeof initialize.result.serverInfo?.name, 'string')

    await send(child, { jsonrpc: '2.0', method: 'notifications/initialized' })

    // 2. tools/list exposes ping + echo with inputSchema.
    const toolsList = await send(child, { jsonrpc: '2.0', id: nextId++, method: 'tools/list' })
    const names = toolsList.result.tools.map((tool) => tool.name).sort()
    assert.deepEqual(names, ['echo', 'ping'])
    for (const tool of toolsList.result.tools) {
      assert.equal(tool.inputSchema?.type, 'object', `${tool.name} needs an object inputSchema`)
    }

    // 3. ping -> text "pong".
    const ping = await send(child, {
      jsonrpc: '2.0',
      id: nextId++,
      method: 'tools/call',
      params: { name: 'ping', arguments: {} },
    })
    assert.equal(ping.result.content?.[0]?.type, 'text')
    assert.equal(ping.result.content?.[0]?.text, 'pong')

    // 4. echo -> echoes the arguments.
    const echo = await send(child, {
      jsonrpc: '2.0',
      id: nextId++,
      method: 'tools/call',
      params: { name: 'echo', arguments: { text: 'hello', uppercase: true } },
    })
    assert.equal(echo.result.content?.[0]?.text, 'HELLO')

    // 5. server/discover is declined with a JSON-RPC error so MCP SDK v2's
    //    auto negotiation falls back to the legacy initialize handshake.
    const discover = await send(child, { jsonrpc: '2.0', id: nextId++, method: 'server/discover' })
    assert.equal(discover.error?.code, -32601, 'fixture must decline server/discover to force the legacy fallback')

    // 6. Calls were appended to the scratch log.
    assert.ok(existsSync(SMOKE_LOG), 'expected a tools/call log at ' + SMOKE_LOG)
    const logLines = readFileSync(SMOKE_LOG, 'utf8').trim().split('\n').filter(Boolean)
    assert.equal(logLines.length, 2, 'expected two logged tools/call entries')
    const logged = logLines.map((line) => JSON.parse(line))
    assert.deepEqual(logged.map((entry) => entry.tool), ['ping', 'echo'])
    assert.equal(logged[1].arguments.uppercase, true)

    console.log(JSON.stringify({
      ok: true,
      checked: [
        'initialize -> protocolVersion echo + capabilities.tools + serverInfo',
        'tools/list -> [echo, ping] with object inputSchema',
        'tools/call ping -> "pong"',
        'tools/call echo -> argument echo',
        'server/discover -> -32601 (legacy fallback signal)',
        `calls.log -> ${logLines.length} JSON lines`,
      ],
    }, null, 2))
  } finally {
    child.stdin.end()
    await new Promise((resolvePromise) => {
      const timer = setTimeout(() => {
        child.kill('SIGKILL')
        resolvePromise()
      }, 2000)
      child.once('close', () => {
        clearTimeout(timer)
        resolvePromise()
      })
    })
    // Clean up the scratch copy; the shared test/tmp/calls.log may stay.
    rmSync(SMOKE_DIR, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(`[smoke] FAILED: ${error instanceof Error ? error.stack ?? error.message : String(error)}`)
  process.exitCode = 1
})
