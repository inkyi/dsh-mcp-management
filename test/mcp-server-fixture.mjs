#!/usr/bin/env node
/**
 * Zero-dependency stdio MCP server fixture for the mcp-management plugin.
 *
 * Wire format: one JSON-RPC 2.0 message per line on stdin/stdout (MCP stdio
 * transport, newline-delimited UTF-8 JSON). Diagnostics go to stderr only.
 *
 * Implemented methods:
 *   - initialize                 -> protocolVersion / capabilities.tools / serverInfo
 *   - notifications/initialized  -> ignored (notification)
 *   - ping                       -> {}
 *   - tools/list                 -> tools: ping, echo (each with inputSchema)
 *   - tools/call                 -> ping => text "pong"; echo => echoes the arguments
 *   - resources/list, prompts/list, logging/setLevel -> empty / {} (harmless extras)
 *   - server/discover            -> JSON-RPC error -32601 on purpose. The bundled
 *                                   MCP client SDK (2.2.0, dsh-mcp-client 0.2.1)
 *                                   auto-negotiates the era with a disposable
 *                                   `server/discover` probe on a sibling process and
 *                                   falls back to the 2025 `initialize` handshake when
 *                                   the probe is not recognized. This fixture is a
 *                                   legacy-era server, so it declines the probe.
 *
 * Every tools/call is appended as one JSON line to test/tmp/calls.log
 * (directory created on demand; override with MCP_FIXTURE_CALLS_LOG).
 *
 * Run directly:
 *   node test/mcp-server-fixture.mjs
 *   printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2026-07-28","capabilities":{},"clientInfo":{"name":"manual","version":"0"}}}' \
 *     | node test/mcp-server-fixture.mjs
 */
import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const DEFAULT_LOG_PATH = join(HERE, 'tmp', 'calls.log')
const LOG_PATH = process.env.MCP_FIXTURE_CALLS_LOG
  ? resolve(process.env.MCP_FIXTURE_CALLS_LOG)
  : DEFAULT_LOG_PATH

/** MCP versions this legacy-era fixture can echo back. */
const SUPPORTED_PROTOCOL_VERSIONS = [
  '2026-07-28',
  '2025-11-25',
  '2025-06-18',
  '2025-03-26',
  '2024-11-05',
  '2024-10-07',
]
/** Fallback when the client sends no (or an unknown) protocolVersion. */
const DEFAULT_PROTOCOL_VERSION = '2026-07-28'

const SERVER_INFO = { name: 'mcp-management-fixture', version: '1.0.0' }
const INSTRUCTIONS = 'Workspace MCP test fixture: tools `ping` (returns pong) and `echo` (echoes arguments).'

/** Negotiated protocol version, set by initialize. */
let negotiatedProtocolVersion
/** Whether the client sent notifications/initialized. */
let initialized = false

const TOOLS = [
  {
    name: 'ping',
    description: 'Health check. Always returns the text "pong".',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: 'echo',
    description: 'Echo the arguments back as text. Optionally uppercases the echoed text.',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Text to echo back.' },
        uppercase: { type: 'boolean', description: 'Uppercase the echoed text.' },
      },
      additionalProperties: false,
    },
  },
]

function stderr(message) {
  try {
    process.stderr.write(`[mcp-fixture] ${message}\n`)
  } catch {
    /* stderr may be closed by the client */
  }
}

function appendCallLog(record) {
  try {
    mkdirSync(dirname(LOG_PATH), { recursive: true })
    appendFileSync(
      LOG_PATH,
      `${JSON.stringify({ ts: new Date().toISOString(), pid: process.pid, ...record })}\n`,
    )
  } catch (error) {
    stderr(`failed to write call log ${LOG_PATH}: ${String(error)}`)
  }
}

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`)
}

function replyResult(id, result) {
  send({ jsonrpc: '2.0', id, result })
}

function replyError(id, code, message, data) {
  const error = { code, message }
  if (data !== undefined) error.data = data
  send({ jsonrpc: '2.0', id, error })
}

function negotiateProtocolVersion(requested) {
  if (typeof requested === 'string' && SUPPORTED_PROTOCOL_VERSIONS.includes(requested)) return requested
  return DEFAULT_PROTOCOL_VERSION
}

function handleInitialize(id, params) {
  negotiatedProtocolVersion = negotiateProtocolVersion(params?.protocolVersion)
  initialized = false
  replyResult(id, {
    protocolVersion: negotiatedProtocolVersion,
    capabilities: { tools: { listChanged: false } },
    serverInfo: SERVER_INFO,
    instructions: INSTRUCTIONS,
  })
}

function handleToolsList(id) {
  replyResult(id, { tools: TOOLS })
}

function handleToolsCall(id, params) {
  const toolName = typeof params?.name === 'string' ? params.name : ''
  const args = params?.arguments !== null && typeof params?.arguments === 'object' ? params.arguments : {}

  if (toolName === 'ping') {
    const result = {
      content: [{ type: 'text', text: 'pong' }],
      isError: false,
    }
    appendCallLog({ tool: 'ping', arguments: args, ok: true, result: 'pong' })
    replyResult(id, result)
    return
  }

  if (toolName === 'echo') {
    let text
    if (typeof args.text === 'string') text = args.text
    else text = JSON.stringify(args)
    if (args.uppercase === true) text = text.toUpperCase()
    const result = {
      content: [{ type: 'text', text }],
      isError: false,
    }
    appendCallLog({ tool: 'echo', arguments: args, ok: true, result: text })
    replyResult(id, result)
    return
  }

  appendCallLog({ tool: toolName, arguments: args, ok: false, error: `Unknown tool: ${toolName || '(missing name)'}` })
  replyError(id, -32602, `Unknown tool: ${toolName || '(missing name)'}`, { knownTools: TOOLS.map((tool) => tool.name) })
}

function handleRequest(message) {
  const { id, method, params } = message
  switch (method) {
    case 'initialize':
      handleInitialize(id, params)
      return
    case 'ping':
      replyResult(id, {})
      return
    case 'tools/list':
      handleToolsList(id)
      return
    case 'tools/call':
      handleToolsCall(id, params)
      return
    case 'resources/list':
      replyResult(id, { resources: [] })
      return
    case 'prompts/list':
      replyResult(id, { prompts: [] })
      return
    case 'logging/setLevel':
      replyResult(id, {})
      return
    case 'server/discover':
      // Legacy-era fixture: decline the modern-era era probe so MCP SDK v2
      // auto-negotiation falls back to the 2025 `initialize` handshake.
      replyError(id, -32601, 'Method not found: this fixture only implements the legacy initialize handshake')
      return
    case 'notifications/initialized':
      // Notification — no response.
      initialized = true
      return
    default:
      replyError(id, -32601, `Method not found: ${String(method)}`)
  }
}

function handleLine(line) {
  const trimmed = line.trim()
  if (trimmed === '') return

  let message
  try {
    message = JSON.parse(trimmed)
  } catch (error) {
    stderr(`failed to parse JSON-RPC line: ${String(error)}`)
    replyError(null, -32700, 'Parse error', { detail: String(error) })
    return
  }

  if (message === null || typeof message !== 'object' || Array.isArray(message)) {
    replyError(null, -32600, 'Invalid Request: expected a JSON-RPC object')
    return
  }

  // Notifications carry no id and must never be answered.
  const isNotification = !Object.prototype.hasOwnProperty.call(message, 'id') || message.id === null
  if (typeof message.method === 'string' && isNotification) {
    if (message.method === 'notifications/initialized') initialized = true
    return
  }

  if (typeof message.method !== 'string') {
    replyError(message.id ?? null, -32600, 'Invalid Request: missing method')
    return
  }

  handleRequest(message)
}

function main() {
  // A client closing our stdout must not crash the fixture.
  process.stdout.on('error', () => {})
  stderr(`ready (pid=${process.pid}, protocol=${negotiatedProtocolVersion ?? 'unnegotiated'}, log=${LOG_PATH})`)

  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity })
  rl.on('line', handleLine)
  rl.on('close', () => {
    stderr('stdin closed, exiting')
    process.exit(0)
  })
}

main()
