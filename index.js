/**
 * Workspace-scoped MCP servers (Host plugin).
 *
 * Each live Agent (session) resolves its MCP server set from, in increasing
 * precedence: the plugin's `defaultServers`, the configured workspaces matching
 * the session working directory (outermost first), and the nearest
 * `.dsh/mcp.json` file found between the session directory and the outermost
 * matched workspace root. The resolved servers are mounted on that Agent's own
 * registration scope (`agent.ctx.plugin(mcpClient, config)`), so their
 * `mcp__<serverName>__<tool>` tools are visible only to that session.
 *
 * GUI-managed configuration lives in this plugin entry's volatile config
 * (`defaultServers` and `workspaces`), edited through `ctx.configEditor`.
 *
 * The pure resolution helpers at the bottom are exported so they can be
 * unit-tested without a Cordis runtime.
 *
 * @module dsh-mcp-management
 */

import { readFile, realpath, stat } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path'
// Schemastery is vendored (MIT, unmodified build) instead of a bare package
// import: a profile-installed bundle is imported from its own directory, where
// the dsh installation's packages are not resolvable through Node.
import z from './vendor/schemastery.mjs'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'mcp-management'

/** Services required by this plugin. `agents`/`configEditor` are optional. */
export const inject = ['tools', 'loader']

/** Plugin entry id in the profile patch; the `mcp_management` tool edits this entry. */
const ENTRY_ID = 'mcp-management'

/** Tool exposed to the model. */
const TOOL_NAME = 'mcp_management'

/** Loader specifier for the MCP client plugin (never a package.json dependency). */
const MCP_CLIENT_SPECIFIER = '@deepseek-ai/dsh-mcp-client'

/** Default workspace-relative MCP file path. */
const DEFAULT_FILE_CONFIG_PATH = '.dsh/mcp.json'

/** `serverName` contract shared with mcp-client (namespace of `mcp__<name>__<tool>`). */
const SERVER_NAME_PATTERN = /^[A-Za-z0-9_-]{1,32}$/

/** `${env:NAME}` reference used inside command/args/url/env/headers. */
const ENV_REF_PATTERN = /\$\{env:([A-Za-z_][A-Za-z0-9_]*)\}/g

// ---------------------------------------------------------------------------
// Config schema.
//
// `defaultServers` and `workspaces` MUST stay volatile: the settings UI edits
// only volatile fields, and a volatile change is delivered to this plugin as a
// `loader/volatile-update` event instead of a plugin reload. In `apply()` those
// two fields are Schemastery ref objects (`config.field.get()`).
// ---------------------------------------------------------------------------

const ServerConfig = z.object({
  serverName: z.string().required(),
  transport: z.string().default('stdio'),
  command: z.string().default(''),
  args: z.array(z.string()).default([]),
  env: z.dict(String).default({}),
  cwd: z.string().default(''),
  url: z.string().default(''),
  headers: z.dict(String).default({}),
  enabled: z.boolean().default(true),
  failOnStartupError: z.boolean().default(false),
})

const WorkspaceConfig = z.object({
  path: z.string().required(),
  title: z.string().default(''),
  servers: z.array(ServerConfig).default([]),
})

export const Config = z.object({
  defaultServers: z.array(ServerConfig).default([]).volatile(),
  workspaces: z.array(WorkspaceConfig).default([]).volatile(),
  fileConfigEnabled: z.boolean().default(true),
  fileConfigPath: z.string().default(DEFAULT_FILE_CONFIG_PATH),
  matchSubdirectories: z.boolean().default(true),
})

// ---------------------------------------------------------------------------
// Small shared helpers (defensive: configuration is user-authored data).
// ---------------------------------------------------------------------------

/** Narrow one JSON-ish value to a plain record. */
function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** First argument that is a non-empty string, else `''`. */
function firstString(...values) {
  for (const value of values) if (typeof value === 'string' && value.trim()) return value.trim()
  return ''
}

/** Stable one-line error description. */
function messageOf(error) {
  if (error instanceof Error && error.message) return error.message
  return String(error)
}

/** Detach a JSON value without requiring an extra runtime dependency. */
function cloneJson(value) {
  try {
    return JSON.parse(JSON.stringify(value))
  } catch {
    return value
  }
}

/** Read a value that may be a Schemastery volatile ref. */
function readVolatile(value, fallback) {
  try {
    if (value && typeof value.get === 'function') {
      const current = value.get()
      return Array.isArray(current) ? current : fallback
    }
    if (Array.isArray(value)) return value
  } catch {
    // A malformed ref must not take the plugin down.
  }
  return fallback
}

/** `[A-Za-z0-9_-]`-only strings, copying the array. */
function normalizeStringArray(value) {
  if (!Array.isArray(value)) return []
  return value.filter((item) => typeof item === 'string')
}

/** `Record<string, string>` projection, dropping non-string values. */
function normalizeStringDict(value) {
  if (!isRecord(value)) return {}
  const out = {}
  for (const [key, item] of Object.entries(value)) if (typeof item === 'string') out[key] = item
  return out
}

/** Resolve a directory for lexical comparison, dropping a trailing separator. */
function normalizePathForMatch(value) {
  if (typeof value !== 'string' || !value.trim()) return ''
  let normalized
  try {
    normalized = resolve(value)
  } catch {
    return ''
  }
  if (normalized.length > 1 && normalized.endsWith(sep)) normalized = normalized.slice(0, -1)
  return normalized
}

/** Whether `candidate` is `root` itself or lives underneath it. */
function isWithin(candidate, root) {
  if (!candidate || !root) return false
  if (candidate === root) return true
  const prefix = root.endsWith(sep) ? root : root + sep
  return candidate.startsWith(prefix)
}

// ---------------------------------------------------------------------------
// Pure logic: exported for offline unit tests (no Cordis runtime required).
// ---------------------------------------------------------------------------

/**
 * Expand `${env:NAME}` references recursively inside strings, arrays, and
 * plain objects. A missing variable keeps the original text and appends a
 * diagnostic, so one bad variable cannot invalidate an entire config file.
 *
 * @param {unknown} value - string, array, record, or opaque value.
 * @param {Record<string, string | undefined>} [env] - environment source; defaults to `process.env`.
 * @param {Array<{ path?: string, message: string }>} [diagnostics] - optional collector.
 * @param {string} [path] - diagnostic path prefix.
 * @returns {unknown} the expanded value (never mutated).
 */
export function expandEnvRefs(value, env = process.env, diagnostics, path = '') {
  const lookup = isRecord(env) ? env : process.env
  if (typeof value === 'string') {
    return value.replace(ENV_REF_PATTERN, (match, variable) => {
      const resolved = lookup?.[variable]
      if (typeof resolved === 'string') return resolved
      if (Array.isArray(diagnostics)) {
        diagnostics.push({
          path: path || 'value',
          message: `environment variable "${variable}" is not set; kept "${match}"`,
        })
      }
      return match
    })
  }
  if (Array.isArray(value)) {
    return value.map((item, index) => expandEnvRefs(item, env, diagnostics, path ? `${path}[${index}]` : `[${index}]`))
  }
  if (isRecord(value)) {
    const out = {}
    for (const [key, item] of Object.entries(value)) {
      out[key] = expandEnvRefs(item, env, diagnostics, path ? `${path}.${key}` : key)
    }
    return out
  }
  return value
}

/**
 * Normalize one server config of any source into the canonical shape of the
 * plugin schema. Returns diagnostics instead of throwing for user data.
 *
 * @param {unknown} raw - candidate server object.
 * @param {string} [fallbackName] - server name to use when the record omits `serverName`.
 * @param {boolean} [expandEnv] - expand `${env:NAME}` references (mount-time); writes keep them verbatim.
 * @returns {{ server: { serverName: string, transport: 'stdio' | 'streamable-http', command: string, args: string[], env: Record<string, string>, cwd: string, url: string, headers: Record<string, string>, enabled: boolean, failOnStartupError: boolean } | undefined, diagnostics: Array<{ path?: string, message: string }> }}
 */
function normalizeServer(raw, fallbackName, expandEnv = true) {
  const diagnostics = []
  if (!isRecord(raw)) {
    return { server: undefined, diagnostics: [{ path: 'server', message: 'server entry must be an object' }] }
  }
  const declared = typeof raw.serverName === 'string' ? raw.serverName.trim() : ''
  const fallback = typeof fallbackName === 'string' ? fallbackName.trim() : ''
  const serverName = declared || fallback
  if (!SERVER_NAME_PATTERN.test(serverName)) {
    return {
      server: undefined,
      diagnostics: [{
        path: 'serverName',
        message: `serverName ${JSON.stringify(serverName)} must match ${String(SERVER_NAME_PATTERN)}`,
      }],
    }
  }
  // `${env:NAME}` expansion applies to both GUI-managed and file-managed
  // servers at mount/resolution time; a missing variable is kept verbatim with
  // a diagnostic. Writes keep the references so the profile never stores
  // expanded secrets.
  const expandDiagnostics = []
  let command = typeof raw.command === 'string' ? raw.command.trim() : ''
  let args = normalizeStringArray(raw.args)
  let env = normalizeStringDict(raw.env)
  let url = typeof raw.url === 'string' ? raw.url.trim() : ''
  let headers = normalizeStringDict(raw.headers)
  if (expandEnv) {
    command = expandEnvRefs(command, process.env, expandDiagnostics, 'command')
    args = expandEnvRefs(args, process.env, expandDiagnostics, 'args')
    env = expandEnvRefs(env, process.env, expandDiagnostics, 'env')
    url = expandEnvRefs(url, process.env, expandDiagnostics, 'url').trim()
    headers = expandEnvRefs(headers, process.env, expandDiagnostics, 'headers')
    for (const diagnostic of expandDiagnostics) diagnostics.push(diagnostic)
  }

  const declaredTransport = typeof raw.transport === 'string' ? raw.transport.trim() : ''
  let transport = declaredTransport
  if (transport !== 'stdio' && transport !== 'streamable-http') {
    const inferred = url ? 'streamable-http' : 'stdio'
    if (declaredTransport) {
      diagnostics.push({
        path: 'transport',
        message: `unknown transport ${JSON.stringify(declaredTransport)}; inferred "${inferred}"`,
      })
    }
    transport = inferred
  }
  return {
    server: {
      serverName,
      transport,
      command,
      args,
      env,
      cwd: typeof raw.cwd === 'string' ? raw.cwd.trim() : '',
      url,
      headers,
      enabled: raw.enabled === false ? false : true,
      failOnStartupError: raw.failOnStartupError === true,
    },
    diagnostics,
  }
}

/** Explain why a server cannot be mounted (without starting it), or `undefined`. */
function describeServerProblem(server) {
  if (!isRecord(server) || !SERVER_NAME_PATTERN.test(String(server.serverName ?? ''))) {
    return 'invalid serverName'
  }
  if (server.enabled === false) return undefined
  if (server.transport === 'streamable-http') return server.url ? undefined : 'streamable-http server requires "url"'
  return server.command ? undefined : 'stdio server requires "command"'
}

/**
 * Convert one normalized server into the config accepted by
 * `@deepseek-ai/dsh-mcp-client` (unknown fields are never forwarded).
 *
 * @param {unknown} server - normalized server config.
 * @returns {object} mcp-client plugin config.
 */
export function toMcpClientConfig(server) {
  if (!isRecord(server) || typeof server.serverName !== 'string' || !server.serverName) {
    throw new Error('toMcpClientConfig requires a server configuration object with a serverName')
  }
  if (server.transport === 'streamable-http') {
    return {
      transport: 'streamable-http',
      serverName: server.serverName,
      url: typeof server.url === 'string' ? server.url : '',
      headers: normalizeStringDict(server.headers),
      failOnStartupError: server.failOnStartupError === true,
    }
  }
  return {
    transport: 'stdio',
    serverName: server.serverName,
    command: typeof server.command === 'string' ? server.command : '',
    args: normalizeStringArray(server.args),
    env: normalizeStringDict(server.env),
    cwd: typeof server.cwd === 'string' ? server.cwd : '',
    failOnStartupError: server.failOnStartupError === true,
  }
}

/**
 * Parse one `.dsh/mcp.json` document.
 *
 * The document root must be an object with an `mcpServers` object. Per-entry
 * problems (unknown shape, invalid serverName, missing command/url, bad field
 * types) skip that entry and are reported through `diagnostics`; only an
 * unreadable document throws.
 *
 * @param {string} text - raw JSON text.
 * @returns {{ servers: object[], diagnostics: Array<{ serverName?: string, path?: string, message: string }> }}
 * @throws when the document is not valid JSON or lacks `mcpServers`.
 */
export function parseMcpFile(text) {
  let document
  try {
    document = JSON.parse(String(text ?? ''))
  } catch (error) {
    throw new Error(`invalid MCP configuration JSON: ${messageOf(error)}`)
  }
  if (!isRecord(document)) throw new Error('MCP configuration must be a JSON object')
  const table = document.mcpServers
  if (!isRecord(table)) throw new Error('MCP configuration must contain an "mcpServers" object')
  const diagnostics = []
  const servers = []
  for (const [key, raw] of Object.entries(table)) {
    if (!isRecord(raw)) {
      diagnostics.push({ serverName: key, path: key, message: 'server entry must be an object' })
      continue
    }
    const input = {
      ...raw,
      serverName: key,
      transport: typeof raw.transport === 'string' ? raw.transport : '',
      // `disabled: true` is the file-format spelling of `enabled: false`.
      enabled: raw.disabled === true ? false : raw.enabled !== false,
      failOnStartupError: raw.failOnStartupError === true,
    }
    const normalized = normalizeServer(input, key)
    for (const diagnostic of normalized.diagnostics) diagnostics.push({ serverName: key, ...diagnostic })
    if (!normalized.server) continue
    const problem = describeServerProblem(normalized.server)
    if (problem) {
      diagnostics.push({ serverName: key, message: `skipped: ${problem}` })
      continue
    }
    servers.push(normalized.server)
  }
  return { servers, diagnostics }
}

/**
 * Match workspaces against one session directory.
 *
 * @param {string} cwd - session directory (already canonicalized by callers).
 * @param {Array<{ path?: string }>} workspaces - configured workspaces.
 * @param {boolean} [matchSubdirectories] - also match descendants of a workspace path.
 * @returns {Array<{ path: string }>} matches sorted outer (shortest path) to inner (longest).
 */
export function matchWorkspaceEntries(cwd, workspaces, matchSubdirectories = true) {
  const needle = normalizePathForMatch(cwd)
  const matches = []
  if (!needle || !Array.isArray(workspaces)) return matches
  for (const workspace of workspaces) {
    if (!isRecord(workspace) || typeof workspace.path !== 'string') continue
    const root = normalizePathForMatch(workspace.path)
    if (!root) continue
    if (!isWithin(needle, root)) continue
    if (!matchSubdirectories && needle !== root) continue
    matches.push({ ...workspace, path: root })
  }
  matches.sort((a, b) => a.path.length - b.path.length)
  return matches
}

/** Normalize the several accepted shapes of `fileServers`. */
function normalizeFileSources(input) {
  if (input === undefined || input === null) return []
  const list = Array.isArray(input) ? input : [input]
  const sources = []
  for (const item of list) {
    if (!item) continue
    if (Array.isArray(item.servers)) {
      sources.push({ path: typeof item.path === 'string' ? item.path : undefined, servers: item.servers })
      continue
    }
    if (Array.isArray(item)) {
      sources.push({ path: undefined, servers: item })
      continue
    }
    if (!isRecord(item)) continue
    // A bare parsed file: `{ mcpServers: { ... } }` (optionally with its path).
    if (isRecord(item.mcpServers)) {
      let servers = []
      try {
        servers = parseMcpFile(JSON.stringify({ mcpServers: item.mcpServers })).servers
      } catch {
        servers = []
      }
      sources.push({ path: typeof item.path === 'string' ? item.path : undefined, servers })
      continue
    }
    // A plain server object.
    sources.push({ path: undefined, servers: [item] })
  }
  return sources
}

/** Normalize the argument object of {@link resolveServers}. */
function normalizeResolveInput(input) {
  if (Array.isArray(input)) {
    return {
      cwd: '',
      defaults: input,
      workspaces: [],
      fileServers: [],
      matchSubdirectories: true,
      fileConfigPath: DEFAULT_FILE_CONFIG_PATH,
    }
  }
  const options = isRecord(input) ? input : {}
  let defaults = options.defaults ?? options.defaultServers
  if (isRecord(defaults)) defaults = [defaults]
  return {
    cwd: firstString(options.cwd, options.dir, options.sessionCwd, options.workingDirectory, options.root),
    defaults: Array.isArray(defaults) ? defaults : [],
    workspaces: Array.isArray(options.workspaces) ? options.workspaces : [],
    fileServers: options.fileServers ?? options.files ?? options.file,
    matchSubdirectories: options.matchSubdirectories !== false,
    fileConfigPath: firstString(options.fileConfigPath) || DEFAULT_FILE_CONFIG_PATH,
  }
}

/**
 * Merge the three configuration layers for one session directory.
 *
 * Merge order (later wins on the same `serverName`):
 * `defaultServers` < matched workspaces (outermost to innermost) < file config.
 * Entries keep `enabled: false`; callers filter them when mounting.
 *
 * Accepted shapes:
 * - `resolveServers({ cwd, defaults, workspaces, fileServers, matchSubdirectories, fileConfigPath })`
 * - `resolveServers(defaultsArray)` (legacy positional-ish convenience)
 * - `fileServers` may be an array of server configs, `[{ path, servers }]`,
 *   a single `{ path, servers }`, or one `{ mcpServers }` document.
 *
 * @returns {Array<{ serverName: string, source: string, server: object }>} ordered entries.
 *   A non-enumerable `diagnostics` array is attached for callers that need it.
 */
export function resolveServers(input = {}) {
  const options = normalizeResolveInput(input)
  const merged = new Map()
  const diagnostics = []

  const applyEntry = (raw, source, fallbackName) => {
    const normalized = normalizeServer(raw, fallbackName)
    for (const diagnostic of normalized.diagnostics) diagnostics.push({ ...diagnostic, source })
    if (!normalized.server) return
    merged.set(normalized.server.serverName, {
      serverName: normalized.server.serverName,
      source,
      server: normalized.server,
    })
  }

  for (const raw of options.defaults) applyEntry(raw, 'default')

  const matched = matchWorkspaceEntries(options.cwd, options.workspaces, options.matchSubdirectories)
  for (const workspace of matched) {
    const source = `workspace:${workspace.path}`
    for (const raw of Array.isArray(workspace.servers) ? workspace.servers : []) applyEntry(raw, source)
  }

  for (const file of normalizeFileSources(options.fileServers)) {
    const source = file.path ? `file:${file.path}` : 'file'
    for (const raw of Array.isArray(file.servers) ? file.servers : []) applyEntry(raw, source)
  }

  const entries = [...merged.values()]
  // Non-enumerable so `deepEqual(entries, [...])` in unit tests is unaffected.
  Object.defineProperty(entries, 'diagnostics', { value: diagnostics, enumerable: false, configurable: true })
  return entries
}

/**
 * Resolve one directory through `realpath`, falling back to `path.resolve`
 * when it does not exist or cannot be resolved.
 *
 * @param {string} directory - candidate directory.
 * @returns {Promise<string>} canonical absolute path.
 */
export async function canonicalPath(directory) {
  const fallback = resolve(String(directory ?? ''))
  try {
    return await realpath(fallback)
  } catch {
    return fallback
  }
}

/**
 * Find the nearest `<dir>/<fileConfigPath>` between `cwd` and the outermost
 * matched workspace root (inclusive). Without a match only `cwd` is inspected.
 *
 * @param {{ cwd?: string, matched?: object[], workspaces?: object[], matchSubdirectories?: boolean, fileConfigPath?: string }} [options]
 * @returns {Promise<string | undefined>} absolute file path when it exists.
 */
export async function findMcpConfigFile(options = {}) {
  const start = normalizePathForMatch(firstString(options.cwd, options.dir, options.sessionCwd))
  if (!start) return undefined
  const fileConfigPath = firstString(options.fileConfigPath) || DEFAULT_FILE_CONFIG_PATH
  const matched = Array.isArray(options.matched)
    ? options.matched
    : matchWorkspaceEntries(start, options.workspaces, options.matchSubdirectories !== false)
  const outermost = matched.length > 0 && typeof matched[0]?.path === 'string' ? normalizePathForMatch(matched[0].path) : ''
  const stop = outermost && isWithin(start, outermost) ? outermost : start
  let current = start
  for (;;) {
    const candidate = isAbsolute(fileConfigPath) ? fileConfigPath : join(current, fileConfigPath)
    try {
      const info = await stat(candidate)
      if (info.isFile()) return candidate
    } catch {
      // Missing candidates are expected; keep walking.
    }
    if (current === stop) return undefined
    const parent = dirname(current)
    if (parent === current) return undefined
    current = parent
  }
}

// ---------------------------------------------------------------------------
// Host plugin: config reads, agent binding, and the `mcp_management` tool.
// ---------------------------------------------------------------------------

/**
 * Mount workspace-scoped MCP clients onto live Agents and expose the
 * `mcp_management` management tool.
 *
 * @param {object} ctx - Cordis plugin context (tools + loader injected).
 * @param {object} config - resolved plugin config; volatile fields are refs.
 */
export async function apply(ctx, config) {
  const state = {
    /** sessionId -> { sessionId, agent, dir, matchedWorkspace, fileConfig, entries, fibers, signature } */
    bindings: new Map(),
    /** sessionId -> tail of the serialized bind chain for that Agent. */
    chains: new Map(),
    /** Optional services attached through ctx.inject(). */
    services: { agents: undefined, configEditor: undefined },
    /** Cached mcp-client module namespace and its load failure. */
    mcpClient: undefined,
    mcpClientPromise: undefined,
    mcpClientError: undefined,
    /** Set while the plugin is unloading, so no new generation is published. */
    stopping: false,
  }

  const warn = (message) => {
    try {
      ctx.logger.warn(`[${name}] ${message}`)
    } catch {
      // Logging must never break binding.
    }
  }
  const debug = (message) => {
    try {
      ctx.logger.debug(`[${name}] ${message}`)
    } catch {
      // Ignore.
    }
  }

  /** Read the current config; volatile fields come from their live refs. */
  const readConfig = () => ({
    defaultServers: readVolatile(config?.defaultServers, []),
    workspaces: readVolatile(config?.workspaces, []),
    fileConfigEnabled: config?.fileConfigEnabled !== false,
    fileConfigPath: firstString(config?.fileConfigPath) || DEFAULT_FILE_CONFIG_PATH,
    matchSubdirectories: config?.matchSubdirectories !== false,
  })

  // -- mcp-client import (cached; failures cached too, to avoid retry storms) --

  const loadMcpClient = () => {
    if (state.mcpClient) return Promise.resolve(state.mcpClient)
    if (state.mcpClientError) return Promise.reject(state.mcpClientError)
    if (!state.mcpClientPromise) {
      state.mcpClientPromise = (async () => {
        const loaded = await ctx.loader.import(MCP_CLIENT_SPECIFIER)
        if (!loaded || typeof loaded.apply !== 'function') {
          throw new Error(`${MCP_CLIENT_SPECIFIER} did not export an apply() plugin entry`)
        }
        state.mcpClient = loaded
        return loaded
      })().catch((error) => {
        state.mcpClientError = error
        throw error
      })
    }
    return state.mcpClientPromise
  }

  // -- resolution for one session directory ---------------------------------

  const readFileServers = async (filePath) => {
    try {
      const text = await readFile(filePath, 'utf8')
      return parseMcpFile(text)
    } catch (error) {
      return { servers: [], diagnostics: [{ path: filePath, message: `failed to read or parse MCP file: ${messageOf(error)}` }] }
    }
  }

  const resolveForCwd = async (target) => {
    const current = readConfig()
    const cwd = await canonicalPath(target)
    const workspaces = []
    for (const workspace of current.workspaces) {
      if (!isRecord(workspace) || typeof workspace.path !== 'string' || !workspace.path.trim()) continue
      workspaces.push({ ...workspace, path: await canonicalPath(workspace.path) })
    }
    const matched = matchWorkspaceEntries(cwd, workspaces, current.matchSubdirectories)
    let fileConfig = null
    const fileServers = []
    if (current.fileConfigEnabled) {
      const found = await findMcpConfigFile({ cwd, matched, fileConfigPath: current.fileConfigPath })
      fileConfig = { path: found ?? join(cwd, current.fileConfigPath), exists: found !== undefined }
      if (found) {
        const file = await readFileServers(found)
        for (const diagnostic of file.diagnostics) warn(`MCP config file ${found}: ${diagnostic.message}`)
        fileServers.push({ path: found, servers: file.servers })
      }
    }
    const entries = resolveServers({
      cwd,
      defaults: current.defaultServers,
      workspaces,
      fileServers,
      matchSubdirectories: current.matchSubdirectories,
      fileConfigPath: current.fileConfigPath,
    })
    for (const diagnostic of entries.diagnostics ?? []) {
      warn(`ignored MCP server configuration (${diagnostic.source ?? 'config'}): ${diagnostic.message}`)
    }
    return { cwd, workspaces, matched, fileConfig, entries }
  }

  // -- binding lifecycle -----------------------------------------------------

  const agentId = (agent) => {
    try {
      if (typeof agent?.id === 'string' && agent.id) return agent.id
    } catch {
      // Fall through to the session identity.
    }
    try {
      const id = agent?.session?.id
      if (typeof id === 'string' && id) return id
    } catch {
      // Unavailable.
    }
    return undefined
  }

  const agentCwd = (agent) => {
    try {
      const cwd = agent?.session?.header?.cwd
      if (typeof cwd === 'string' && cwd) return cwd
    } catch {
      // Missing session header.
    }
    return undefined
  }

  const safeClientConfig = (server) => {
    try {
      return toMcpClientConfig(server)
    } catch (error) {
      return { error: messageOf(error) }
    }
  }

  const resolutionSignature = (entries) => JSON.stringify(entries.map((entry) => ({
    serverName: entry.serverName,
    source: entry.source,
    enabled: entry.server?.enabled !== false,
    config: safeClientConfig(entry.server),
  })))

  /** Whether the Agent's registration scope is still active. */
  const isAgentAlive = (agent) => {
    try {
      const fiber = agent?.ctx?.fiber
      if (fiber === undefined || fiber === null) return true
      return fiber.uid !== null
    } catch {
      return false
    }
  }

  const disposeBinding = async (sessionId) => {
    const binding = state.bindings.get(sessionId)
    if (!binding) return
    state.bindings.delete(sessionId)
    const pending = []
    for (const fiber of binding.fibers.values()) {
      try {
        pending.push(Promise.resolve(fiber.dispose()))
      } catch (error) {
        warn(`agent ${sessionId}: failed to dispose an MCP client fiber: ${messageOf(error)}`)
      }
    }
    await Promise.allSettled(pending)
  }

  /**
   * Publish one resolved generation for an Agent, unless the Agent was disposed
   * while it was starting (then release the fibers instead of leaking them).
   */
  const commitBinding = async (binding) => {
    if (!state.stopping && isAgentAlive(binding.agent)) {
      state.bindings.set(binding.sessionId, binding)
      return true
    }
    const pending = []
    for (const fiber of binding.fibers.values()) {
      try {
        pending.push(Promise.resolve(fiber.dispose()))
      } catch {
        // Best-effort cleanup.
      }
    }
    await Promise.allSettled(pending)
    return false
  }

  const runBindAgent = async (agent, reason) => {
    const sessionId = agentId(agent)
    if (!sessionId) return
    if (state.stopping || !isAgentAlive(agent)) return
    try {
      const cwd = agentCwd(agent)
      if (!cwd) {
        debug(`agent ${sessionId}: no session working directory; workspace MCP binding skipped`)
        return
      }
      const resolution = await resolveForCwd(cwd)
      const enabled = resolution.entries.filter((entry) => entry.server && entry.server.enabled !== false)
      // Whatever happens next, the previous generation for this Agent is gone:
      // the resolved set or its parameters changed, so replace it wholesale.
      await disposeBinding(sessionId)
      if (enabled.length === 0) {
        debug(`agent ${sessionId}: no enabled MCP servers for ${resolution.cwd}`)
        return
      }
      const records = []
      const fibers = new Map()
      let mcpClient
      try {
        mcpClient = await loadMcpClient()
      } catch (error) {
        const message = `failed to load ${MCP_CLIENT_SPECIFIER}: ${messageOf(error)}`
        for (const entry of enabled) {
          records.push({ serverName: entry.serverName, source: entry.source, state: 'failed', error: message })
        }
        await commitBinding({
          sessionId,
          agent,
          dir: resolution.cwd,
          matchedWorkspace: resolution.matched.length > 0 ? resolution.matched[resolution.matched.length - 1] : undefined,
          fileConfig: resolution.fileConfig,
          entries: records,
          fibers,
          signature: resolutionSignature(resolution.entries),
          reason,
        })
        warn(`agent ${sessionId}: ${message}`)
        return
      }
      for (const entry of enabled) {
        const record = { serverName: entry.serverName, source: entry.source, state: 'failed', error: null }
        records.push(record)
        const problem = describeServerProblem(entry.server)
        if (problem) {
          record.error = problem
          continue
        }
        let fiber
        try {
          fiber = agent.ctx.plugin(mcpClient, toMcpClientConfig(entry.server))
          await fiber
          fibers.set(entry.serverName, fiber)
          record.state = 'connected'
        } catch (error) {
          record.error = messageOf(error)
          if (fiber) {
            try {
              await fiber.dispose()
            } catch {
              // Best-effort cleanup of a failed activation.
            }
          }
          warn(`agent ${sessionId}: MCP server "${entry.serverName}" failed to start: ${record.error}`)
        }
      }
      const stored = await commitBinding({
        sessionId,
        agent,
        dir: resolution.cwd,
        matchedWorkspace: resolution.matched.length > 0 ? resolution.matched[resolution.matched.length - 1] : undefined,
        fileConfig: resolution.fileConfig,
        entries: records,
        fibers,
        signature: resolutionSignature(resolution.entries),
        reason,
      })
      if (stored) debug(`agent ${sessionId}: bound ${fibers.size}/${enabled.length} MCP server(s) from ${resolution.cwd}`)
    } catch (error) {
      // Never let MCP setup block or fail Agent creation.
      warn(`agent ${sessionId}: MCP binding failed: ${messageOf(error)}`)
    }
  }

  /** Serialize binding per Agent so concurrent events cannot interleave disposals. */
  const bindAgent = (agent, reason) => {
    const sessionId = agentId(agent)
    if (!sessionId) return Promise.resolve()
    const previous = state.chains.get(sessionId) ?? Promise.resolve()
    const next = previous.catch(() => {}).then(() => runBindAgent(agent, reason))
    state.chains.set(sessionId, next)
    const settle = () => {
      if (state.chains.get(sessionId) === next) state.chains.delete(sessionId)
    }
    void next.then(settle, settle)
    return next
  }

  /** Agents we know about: our bindings plus (when available) the registry. */
  const liveAgents = () => {
    const agents = new Map()
    for (const binding of state.bindings.values()) {
      if (binding.agent) agents.set(binding.sessionId, binding.agent)
    }
    const registry = state.services.agents
    if (registry && typeof registry.list === 'function') {
      try {
        for (const agent of registry.list()) {
          const id = agentId(agent)
          if (id) agents.set(id, agent)
        }
      } catch (error) {
        warn(`failed to enumerate live agents: ${messageOf(error)}`)
      }
    }
    return [...agents.entries()]
  }

  /** Re-resolve only the Agents whose effective server set changed. */
  const rebindAll = async (reason) => {
    const agents = liveAgents()
    for (const [sessionId, agent] of agents) {
      const binding = state.bindings.get(sessionId)
      let changed = true
      if (binding) {
        const cwd = agentCwd(agent)
        if (!cwd) changed = false
        else {
          try {
            const resolution = await resolveForCwd(cwd)
            changed = resolutionSignature(resolution.entries) !== binding.signature
          } catch {
            changed = true
          }
        }
      }
      if (!changed) continue
      await bindAgent(agent, reason)
    }
    // Drop bindings whose Agent is gone (agent/disposed normally covers this).
    const liveIds = new Set(agents.map(([sessionId]) => sessionId))
    for (const sessionId of [...state.bindings.keys()]) {
      if (!liveIds.has(sessionId)) await disposeBinding(sessionId)
    }
  }

  // -- Agent events ----------------------------------------------------------

  // Serial and awaited by the agent registry: MCP tools exist before the
  // session's first step. Never throw out of here.
  ctx.on('agent/created', async ({ agent }) => {
    try {
      await bindAgent(agent, 'agent/created')
    } catch (error) {
      warn(`agent/created listener failed: ${messageOf(error)}`)
    }
  })

  ctx.on('agent/disposed', ({ agent }) => {
    const sessionId = agentId(agent)
    if (!sessionId) return
    state.chains.delete(sessionId)
    void disposeBinding(sessionId).catch((error) => warn(`agent ${sessionId}: disposal failed: ${messageOf(error)}`))
  })

  // Volatile-only config change: re-resolve affected Agents without reloading
  // this plugin. `emit` does not await listeners, so swallow rejections here.
  ctx.on('loader/volatile-update', (paths) => {
    let label = 'volatile config'
    try {
      if (Array.isArray(paths)) {
        label = paths.map((path) => (Array.isArray(path) ? path.join('.') : String(path))).join(', ') || label
      }
    } catch {
      // Keep the default label.
    }
    debug(`received loader/volatile-update (${label}); re-resolving live agents`)
    void rebindAll(`loader/volatile-update:${label}`).catch((error) => warn(`volatile re-bind failed: ${messageOf(error)}`))
  })

  // -- Optional services (missing services only degrade features) ------------

  ctx.inject(['agents'], (agentsCtx) => {
    state.services.agents = agentsCtx.agents
    agentsCtx.effect(() => () => {
      if (state.services.agents === agentsCtx.agents) state.services.agents = undefined
    })
    // Late installation / HMR: bind Agents that already exist.
    let existing = []
    try {
      existing = agentsCtx.agents.list()
    } catch (error) {
      warn(`failed to list existing agents: ${messageOf(error)}`)
    }
    for (const agent of existing) void bindAgent(agent, 'backfill')
  })

  ctx.inject(['configEditor'], (editorCtx) => {
    state.services.configEditor = editorCtx.configEditor
    editorCtx.effect(() => () => {
      if (state.services.configEditor === editorCtx.configEditor) state.services.configEditor = undefined
    })
  })

  // -- mcp_management tool ---------------------------------------------------

  const getConfigEditor = () => {
    if (state.services.configEditor) return state.services.configEditor
    try {
      return typeof ctx.get === 'function' ? ctx.get('configEditor') : undefined
    } catch {
      return undefined
    }
  }

  /** Persist a volatile config change through `ctx.configEditor.edit()`. */
  const writeVolatileConfig = async (mutate) => {
    const editor = getConfigEditor()
    if (!editor) throw new Error('configEditor service is unavailable in this profile')
    if (typeof editor.edit !== 'function' || typeof editor.entries !== 'function') {
      throw new Error('configEditor service does not expose the expected entries()/edit() API')
    }
    let entry
    try {
      entry = editor.entries().find((candidate) => candidate?.options?.id === ENTRY_ID)
    } catch (error) {
      throw new Error(`failed to read config editor entries: ${messageOf(error)}`)
    }
    if (!entry) throw new Error(`configuration entry "${ENTRY_ID}" is not available in this profile`)
    await editor.edit(entry, (current) => mutate(isRecord(current) ? current : {}))
  }

  const sessionCwdOf = (exec) => {
    try {
      const cwd = exec?.agent?.session?.header?.cwd
      if (typeof cwd === 'string' && cwd) return cwd
    } catch {
      // Missing session.
    }
    return undefined
  }

  const targetDirectory = (args, exec) => {
    const explicit = typeof args?.workspacePath === 'string' ? args.workspacePath.trim() : ''
    if (explicit) return explicit
    return sessionCwdOf(exec)
  }

  const requireTargetDirectory = (args, exec) => {
    const target = targetDirectory(args, exec)
    if (!target) {
      throw new Error('cannot determine the workspace directory: pass "workspacePath" or call this tool inside a session that has a working directory')
    }
    return target
  }

  const findWorkspaceEntryIndex = async (workspaces, matchedEntries) => {
    for (let matchedIndex = matchedEntries.length - 1; matchedIndex >= 0; matchedIndex -= 1) {
      const matchedPath = matchedEntries[matchedIndex].path
      for (let index = 0; index < workspaces.length; index += 1) {
        const candidate = workspaces[index]
        if (!isRecord(candidate) || typeof candidate.path !== 'string' || !candidate.path.trim()) continue
        if (await canonicalPath(candidate.path) === matchedPath) return index
      }
    }
    return -1
  }

  const toolStatus = async (args, exec) => {
    const target = requireTargetDirectory(args, exec)
    const resolution = await resolveForCwd(target)
    const binding = state.bindings.get(agentId(exec?.agent))
    const known = new Map()
    if (binding) for (const record of binding.entries) known.set(record.serverName, record)
    const servers = resolution.entries.map((entry) => {
      if (entry.server.enabled === false) {
        return { serverName: entry.serverName, source: entry.source, state: 'disabled', error: null }
      }
      const record = known.get(entry.serverName)
      const state = record && (record.state === 'connected' || record.state === 'failed') ? record.state : 'not-mounted'
      return { serverName: entry.serverName, source: entry.source, state, error: record?.error ?? null }
    })
    const workspace = resolution.matched.length > 0 ? resolution.matched[resolution.matched.length - 1] : undefined
    return {
      cwd: resolution.cwd,
      workspace: workspace ? { path: workspace.path, title: typeof workspace.title === 'string' ? workspace.title : '' } : null,
      fileConfig: resolution.fileConfig,
      servers,
    }
  }

  const toolList = () => {
    const current = readConfig()
    return {
      defaults: current.defaultServers.map((server) => cloneJson(server)),
      workspaces: current.workspaces.map((workspace) => ({
        path: typeof workspace?.path === 'string' ? workspace.path : '',
        title: typeof workspace?.title === 'string' ? workspace.title : '',
        servers: (Array.isArray(workspace?.servers) ? workspace.servers : []).map((server) => cloneJson(server)),
      })),
    }
  }

  const prepareServerInput = (args) => {
    if (!isRecord(args?.server)) throw new Error('action=setServer requires a "server" object')
    const normalized = normalizeServer(args.server, undefined, false)
    if (!normalized.server) {
      const detail = normalized.diagnostics.map((diagnostic) => diagnostic.message).join('; ')
      throw new Error(`invalid server configuration: ${detail || 'missing or invalid serverName'}`)
    }
    const problem = describeServerProblem(normalized.server)
    if (problem) throw new Error(`invalid server configuration: ${problem}`)
    return normalized.server
  }

  const toolSetServer = async (args, exec) => {
    const server = prepareServerInput(args)
    const target = requireTargetDirectory(args, exec)
    const resolution = await resolveForCwd(target)
    const current = readConfig()
    const workspaces = current.workspaces.map((workspace) => cloneJson(workspace))
    let index = await findWorkspaceEntryIndex(workspaces, resolution.matched)
    if (index < 0) {
      const title = typeof args.title === 'string' && args.title.trim() ? args.title.trim() : basename(resolution.cwd)
      workspaces.push({ path: resolution.cwd, title, servers: [] })
      index = workspaces.length - 1
    } else if (typeof args.title === 'string' && args.title.trim()) {
      workspaces[index] = { ...workspaces[index], title: args.title.trim() }
    }
    const servers = Array.isArray(workspaces[index].servers) ? workspaces[index].servers.map((item) => cloneJson(item)) : []
    const existing = servers.findIndex((candidate) => candidate?.serverName === server.serverName)
    if (existing >= 0) servers[existing] = server
    else servers.push(server)
    workspaces[index] = {
      ...workspaces[index],
      path: typeof workspaces[index].path === 'string' && workspaces[index].path ? workspaces[index].path : resolution.cwd,
      title: typeof workspaces[index].title === 'string' ? workspaces[index].title : '',
      servers,
    }
    await writeVolatileConfig((raw) => ({ ...raw, workspaces }))
    return { ok: true, workspace: { path: workspaces[index].path, title: workspaces[index].title }, servers }
  }

  const toolRemoveServer = async (args, exec) => {
    const serverName = typeof args.serverName === 'string' ? args.serverName.trim() : ''
    if (!serverName) throw new Error('action=removeServer requires "serverName"')
    const target = requireTargetDirectory(args, exec)
    const resolution = await resolveForCwd(target)
    const current = readConfig()
    const workspaces = current.workspaces.map((workspace) => cloneJson(workspace))
    const index = await findWorkspaceEntryIndex(workspaces, resolution.matched)
    if (index < 0) throw new Error(`no workspace entry matches "${resolution.cwd}"`)
    const servers = Array.isArray(workspaces[index].servers) ? workspaces[index].servers : []
    const next = servers.filter((candidate) => candidate?.serverName !== serverName)
    if (next.length === servers.length) {
      throw new Error(`server "${serverName}" is not configured for workspace "${workspaces[index].path}"`)
    }
    workspaces[index] = { ...workspaces[index], servers: next }
    await writeVolatileConfig((raw) => ({ ...raw, workspaces }))
    return { ok: true, workspace: { path: workspaces[index].path, title: workspaces[index].title ?? '' }, servers: next }
  }

  const toolSetEnabled = async (args, exec) => {
    const serverName = typeof args.serverName === 'string' ? args.serverName.trim() : ''
    if (!serverName) throw new Error('action=setEnabled requires "serverName"')
    if (typeof args.enabled !== 'boolean') throw new Error('action=setEnabled requires boolean "enabled"')
    const explicit = typeof args.workspacePath === 'string' && args.workspacePath.trim() ? args.workspacePath.trim() : ''
    const target = requireTargetDirectory(args, exec)
    const resolution = await resolveForCwd(target)
    const current = readConfig()
    const workspaces = current.workspaces.map((workspace) => cloneJson(workspace))
    const index = await findWorkspaceEntryIndex(workspaces, resolution.matched)
    if (index >= 0) {
      const servers = Array.isArray(workspaces[index].servers) ? workspaces[index].servers : []
      const at = servers.findIndex((candidate) => candidate?.serverName === serverName)
      if (at < 0) throw new Error(`server "${serverName}" is not configured for workspace "${workspaces[index].path}"`)
      servers[at] = { ...servers[at], enabled: args.enabled }
      workspaces[index] = { ...workspaces[index], servers }
      await writeVolatileConfig((raw) => ({ ...raw, workspaces }))
      return { ok: true, scope: 'workspace', workspace: { path: workspaces[index].path, title: workspaces[index].title ?? '' }, serverName, enabled: args.enabled }
    }
    if (explicit) throw new Error(`no workspace entry matches "${target}"`)
    const defaults = current.defaultServers.map((server) => cloneJson(server))
    const at = defaults.findIndex((candidate) => candidate?.serverName === serverName)
    if (at < 0) throw new Error(`server "${serverName}" is not configured in the default servers`)
    defaults[at] = { ...defaults[at], enabled: args.enabled }
    await writeVolatileConfig((raw) => ({ ...raw, defaultServers: defaults }))
    return { ok: true, scope: 'default', serverName, enabled: args.enabled }
  }

  const toolSetWorkspace = async (args, exec) => {
    const target = requireTargetDirectory(args, exec)
    const resolution = await resolveForCwd(target)
    const current = readConfig()
    const workspaces = current.workspaces.map((workspace) => cloneJson(workspace))
    const index = await findWorkspaceEntryIndex(workspaces, resolution.matched)
    const hasServers = args.servers !== undefined || args.server !== undefined
    if (!hasServers) {
      // The contract: omitting `servers` removes the whole workspace entry.
      if (index < 0) throw new Error(`no workspace entry matches "${resolution.cwd}"`)
      const [removed] = workspaces.splice(index, 1)
      await writeVolatileConfig((raw) => ({ ...raw, workspaces }))
      return { ok: true, removed: { path: removed?.path ?? '', title: removed?.title ?? '' } }
    }
    const rawServers = args.servers !== undefined
      ? args.servers
      : (Array.isArray(args.server) ? args.server : [args.server])
    if (!Array.isArray(rawServers)) throw new Error('action=setWorkspace expects "servers" to be an array of server configs')
    const servers = []
    const problems = []
    for (const raw of rawServers) {
      const normalized = normalizeServer(raw, undefined, false)
      if (!normalized.server) {
        problems.push(normalized.diagnostics.map((diagnostic) => diagnostic.message).join('; ') || 'invalid server')
        continue
      }
      const problem = describeServerProblem(normalized.server)
      if (problem) problems.push(`server "${normalized.server.serverName}": ${problem}`)
      else servers.push(normalized.server)
    }
    if (problems.length > 0) throw new Error(`invalid workspace replacement: ${problems.join('; ')}`)
    const title = typeof args.title === 'string'
      ? args.title
      : (index >= 0 && typeof workspaces[index].title === 'string' ? workspaces[index].title : basename(resolution.cwd))
    if (index >= 0) {
      workspaces[index] = { ...workspaces[index], title, servers }
    } else {
      workspaces.push({ path: resolution.cwd, title, servers })
    }
    await writeVolatileConfig((raw) => ({ ...raw, workspaces }))
    const saved = index >= 0 ? workspaces[index] : workspaces[workspaces.length - 1]
    return { ok: true, workspace: { path: saved.path, title: saved.title }, servers }
  }

  const executeTool = async (args, exec) => {
    const input = isRecord(args) ? args : {}
    const action = typeof input.action === 'string' && input.action ? input.action : 'status'
    switch (action) {
      case 'status': return toolStatus(input, exec)
      case 'list': return toolList()
      case 'setServer': return toolSetServer(input, exec)
      case 'removeServer': return toolRemoveServer(input, exec)
      case 'setEnabled': return toolSetEnabled(input, exec)
      case 'setWorkspace': return toolSetWorkspace(input, exec)
      default:
        throw new Error(`unknown action "${action}"; expected status, list, setServer, removeServer, setEnabled, or setWorkspace`)
    }
  }

  const registerTool = () => {
    const definition = {
      name: TOOL_NAME,
      description: 'Inspect and manage the MCP servers used by workspaces. Workspace-scoped MCP tools are visible only to sessions running in that workspace.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['status', 'list', 'setServer', 'removeServer', 'setEnabled', 'setWorkspace'],
          },
          workspacePath: {
            type: 'string',
            description: 'Absolute directory; defaults to the current session working directory',
          },
          title: { type: 'string' },
          server: {
            type: 'object',
            description: 'Complete server configuration for action=setServer',
          },
          serverName: { type: 'string' },
          enabled: { type: 'boolean' },
          servers: {
            type: 'array',
            description:
              'Complete server list for action=setWorkspace (replaces the workspace entry); omit it to delete that workspace entry',
            items: { type: 'object' },
          },
        },
        required: ['action'],
        additionalProperties: false,
      },
      output: {
        schema: { type: 'object', properties: {}, additionalProperties: true },
        render(_args, value) {
          return [{ type: 'text', text: JSON.stringify(value, null, 2) }]
        },
      },
      async execute(args, exec) {
        return executeTool(args, exec)
      },
    }
    try {
      return ctx.tools.register(definition)
    } catch (error) {
      warn(`failed to register tool "${TOOL_NAME}": ${messageOf(error)}`)
      return undefined
    }
  }

  // -- Effect-owned lifecycle ------------------------------------------------

  ctx.effect(() => {
    const disposeTool = registerTool()
    return async () => {
      state.stopping = true
      if (typeof disposeTool === 'function') {
        try {
          disposeTool()
        } catch (error) {
          warn(`failed to unregister tool "${TOOL_NAME}": ${messageOf(error)}`)
        }
      }
      const pending = [...state.bindings.keys()].map((sessionId) => disposeBinding(sessionId))
      await Promise.allSettled(pending)
    }
  }, 'mcp-management.tool-and-bindings')
}
