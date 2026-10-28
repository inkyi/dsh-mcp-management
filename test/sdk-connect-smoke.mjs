#!/usr/bin/env node
/**
 * Optional real-SDK handshake test for test/mcp-server-fixture.mjs.
 *
 * Uses the same MCP SDK build the DeepSeek Harness MCP client bridge is built
 * against (`@modelcontextprotocol/client` 2.2.0) and the same negotiation
 * posture (`versionNegotiation: { mode: 'auto' }`), so this proves the fixture
 * works on the real wire path instead of only against a hand-rolled JSON-RPC
 * client:
 *
 *   1. SDK probes `server/discover` on a disposable sibling process
 *      -> fixture answers -32601 -> SDK falls back to the legacy era.
 *   2. Legacy `initialize` handshake (protocolVersion 2025-11-25) succeeds.
 *   3. tools/list returns ping + echo; tools/call ping returns "pong".
 *
 * The SDK is looked up, in order, at `MCP_SDK_ROOT`, a repository-local
 * `node_modules`, and a sibling DeepSeek Harness checkout. Nothing outside
 * test/ is written; the fixture call log is a scratch file removed on exit.
 *
 * Usage: node test/sdk-connect-smoke.mjs
 * Exit codes: 0 = pass or SKIP (SDK not found), 1 = fail.
 */
import { existsSync, readFileSync, rmSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const FIXTURE = join(HERE, 'mcp-server-fixture.mjs')
const SDK_CANDIDATES = [
  process.env.MCP_SDK_ROOT,
  join(ROOT, 'node_modules', '@modelcontextprotocol', 'client'),
  join(ROOT, '..', 'harness-inspection', 'current-full', 'dsh', 'node_modules', '@modelcontextprotocol', 'client'),
].filter((candidate) => typeof candidate === 'string' && candidate.length > 0).map((candidate) => resolve(candidate))
const SDK_ROOT = SDK_CANDIDATES.find((candidate) => existsSync(join(candidate, 'package.json'))) ?? SDK_CANDIDATES[0]
const SCRATCH_DIR = join(HERE, 'tmp', 'sdk-smoke')
const SCRATCH_LOG = join(SCRATCH_DIR, 'calls.log')

async function main() {
  if (!existsSync(join(SDK_ROOT, 'package.json'))) {
    console.log(`SKIP: MCP SDK not found at ${SDK_ROOT} (set MCP_SDK_ROOT to override)`)
    return
  }

  const sdkPackage = JSON.parse(readFileSync(join(SDK_ROOT, 'package.json'), 'utf8'))
  const loadModule = (relativeEntry) => import(pathToFileURL(join(SDK_ROOT, relativeEntry)).href)
  const { Client } = await loadModule('dist/index.mjs')
  const { StdioClientTransport } = await loadModule('dist/stdio.mjs')

  rmSync(SCRATCH_DIR, { recursive: true, force: true })
  mkdirSync(SCRATCH_DIR, { recursive: true })

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [FIXTURE],
    env: { ...process.env, MCP_FIXTURE_CALLS_LOG: SCRATCH_LOG },
    stderr: 'ignore', // keep fixture stderr out of this script's stdout
  })
  const client = new Client(
    { name: 'fixture-sdk-smoke', version: '1.0.0' },
    { capabilities: {}, versionNegotiation: { mode: 'auto' } },
  )

  try {
    await client.connect(transport)
    const protocolVersion = client.getNegotiatedProtocolVersion?.() ?? 'unknown'
    const capabilities = client.getServerCapabilities() ?? {}
    assert.ok(capabilities.tools !== undefined, 'server capabilities.tools missing after initialize')
    assert.ok(protocolVersion !== 'unknown', 'no negotiated protocol version')

    const listed = await client.listTools()
    const names = listed.tools.map((tool) => tool.name).sort()
    assert.deepEqual(names, ['echo', 'ping'])

    const ping = await client.callTool({ name: 'ping', arguments: {} })
    assert.equal(ping.content?.[0]?.type, 'text')
    assert.equal(ping.content?.[0]?.text, 'pong')

    const echo = await client.callTool({ name: 'echo', arguments: { text: 'sdk' } })
    assert.equal(echo.content?.[0]?.text, 'sdk')

    const logLines = existsSync(SCRATCH_LOG)
      ? readFileSync(SCRATCH_LOG, 'utf8').trim().split('\n').filter(Boolean)
      : []
    assert.equal(logLines.length, 2, 'expected two logged tools/call entries')

    console.log(JSON.stringify({
      ok: true,
      sdkRoot: SDK_ROOT,
      sdkVersion: sdkPackage.version,
      negotiation: 'auto -> server/discover declined (-32601) -> legacy initialize',
      protocolVersion,
      tools: names,
      calls: ['ping -> pong', 'echo -> sdk'],
    }, null, 2))
  } finally {
    await client.close().catch(() => {})
    rmSync(SCRATCH_DIR, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(`[sdk-smoke] FAILED: ${error instanceof Error ? error.stack ?? error.message : String(error)}`)
  process.exitCode = 1
})
