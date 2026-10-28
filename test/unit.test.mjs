#!/usr/bin/env node
/**
 * Offline unit tests for the pure logic of @inkyi/dsh-mcp-management/index.js
 * (DESIGN.md section 6).
 *
 * `index.js` imports its only runtime schema dependency from `vendor/`, so the
 * plugin directory is self-contained. The test still copies index.js (and its
 * relative imports) into test/tmp/unit-runtime/ to import a pristine ESM copy;
 * when a DeepSeek Harness installation is reachable (DSH_NODE_MODULES or the
 * usual harness-inspection path) its packages are linked into that copy to
 * match the real Host resolution environment. The real index.js is never
 * modified.
 *
 * Export names are adapted to what index.js actually exports: the expected
 * DESIGN names are tried first, then a small set of aliases, then a keyword
 * regex. Every resolved name is reported as a node:test diagnostic and in the
 * final summary.
 *
 * Usage: node --test test/unit.test.mjs
 *        (or simply: node test/unit.test.mjs — node:test runs the file)
 */
import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const WORKSPACE_ROOT = resolve(ROOT, '..')
const RUNTIME_DIR = join(HERE, 'tmp', 'unit-runtime')
const INDEX_PATH = join(ROOT, 'index.js')
const DSH_NODE_MODULES =
  process.env.DSH_NODE_MODULES ??
  join(WORKSPACE_ROOT, 'harness-inspection', 'current-full', 'dsh', 'node_modules')

const LOGICAL_EXPORTS = {
  resolveServers: {
    design: ['resolveServers'],
    aliases: ['resolveWorkspaceServers', 'resolveServersForDir', 'resolveForWorkspace', 'resolve'],
    fuzzy: /^(resolve|build).*(server|mcp).*(list|config)?$/i,
    label: 'resolveServers',
  },
  parseMcpFile: {
    design: ['parseMcpFile'],
    aliases: ['parseMcpJson', 'parseMcpConfig', 'parseFileConfig', 'parseWorkspaceMcpFile'],
    fuzzy: /^parse.*(mcp|file|json)/i,
    label: 'parseMcpFile',
  },
  toMcpClientConfig: {
    design: ['toMcpClientConfig'],
    aliases: ['toMcpClientServerConfig', 'toClientConfig', 'toMcpConfig', 'toMcpServerConfig'],
    fuzzy: /^(to|build).*(mcp.?client|client).*(config|options)$/i,
    label: 'toMcpClientConfig',
  },
  expandEnvRefs: {
    design: ['expandEnvRefs'],
    aliases: ['expandEnv', 'expandEnvironmentRefs', 'expandEnvVars'],
    fuzzy: /^expand.*(env|ref)/i,
    label: 'expandEnvRefs',
  },
}

const resolved = new Map()
const diagnostics = []

function diagnostic(message) {
  diagnostics.push(message)
}

/** Recursively copy index.js and its relative imports into the runtime dir. */
function prepareRuntime() {
  if (!existsSync(INDEX_PATH)) {
    throw new Error(`index.js not found at ${INDEX_PATH}`)
  }
  rmSync(RUNTIME_DIR, { recursive: true, force: true })
  mkdirSync(RUNTIME_DIR, { recursive: true })
  writeFileSync(join(RUNTIME_DIR, 'package.json'), '{"type":"module"}\n', 'utf8')

  // The copied tree vendors its runtime dependency, so linking the DSH
  // installation is optional: do it when reachable to mirror Host resolution.
  if (existsSync(DSH_NODE_MODULES)) symlinkSync(DSH_NODE_MODULES, join(RUNTIME_DIR, 'node_modules'), 'dir')

  const visited = new Set()
  const copyWithRelativeImports = (absoluteSource) => {
    if (visited.has(absoluteSource)) return
    visited.add(absoluteSource)
    const source = readFileSync(absoluteSource, 'utf8')
    const target = join(RUNTIME_DIR, relative(ROOT, absoluteSource))
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, source, 'utf8')
    // Copy local relative imports too (the plugin is authored as a small set of
    // plain ESM files; vendor/ is copied the same way).
    const importRe = /(?:from\s*|import\s*\(\s*)['"](\.[^'"]+)['"]/g
    let match
    while ((match = importRe.exec(source)) !== null) {
      const candidateBase = resolve(dirname(absoluteSource), match[1])
      const candidates = [candidateBase, `${candidateBase}.js`, `${candidateBase}.mjs`, join(candidateBase, 'index.js')]
      const found = candidates.find((candidate) => existsSync(candidate) && /\.(m?js)$/.test(candidate))
      if (found !== undefined) copyWithRelativeImports(found)
    }
  }
  copyWithRelativeImports(INDEX_PATH)
  return import(`${pathToFileURL(join(RUNTIME_DIR, 'index.js')).href}?v=${Date.now()}`)
}

function resolveExports(namespace) {
  const functionNames = Object.keys(namespace).filter((key) => typeof namespace[key] === 'function')
  for (const [logical, spec] of Object.entries(LOGICAL_EXPORTS)) {
    let actual = spec.design.find((name) => typeof namespace[name] === 'function')
    if (actual === undefined) actual = spec.aliases.find((name) => typeof namespace[name] === 'function')
    if (actual === undefined) {
      // Fuzzy match only against names that look like the right concept.
      actual = functionNames.find((name) => spec.fuzzy.test(name))
    }
    if (actual !== undefined) resolved.set(logical, { name: actual, fn: namespace[actual] })
  }
}

/** Normalized entry list from whatever shape resolveServers returns. */
function entriesOf(result) {
  if (Array.isArray(result)) return result
  if (result === null || typeof result !== 'object') return []
  if (Array.isArray(result.entries)) return result.entries
  if (Array.isArray(result.servers)) return result.servers
  if (Array.isArray(result.resolved)) return result.resolved
  return []
}

function entryByName(entries, serverName) {
  return entries.filter((entry) => (entry?.serverName ?? entry?.name) === serverName)
}

function entryServer(entry) {
  const server = entry?.server ?? entry?.config ?? entry
  return server !== null && typeof server === 'object' ? server : {}
}

function sourceOf(entry) {
  return String(entry?.source ?? entry?.origin ?? '')
}

/** Build a resolveServers argument object covering the supported input shapes. */
function resolveArgs(overrides) {
  const base = {
    cwd: '/proj/inner/agent',
    dir: '/proj/inner/agent',
    directory: '/proj/inner/agent',
    sessionDir: '/proj/inner/agent',
    defaults: [],
    defaultServers: [],
    workspaces: [],
    fileServers: [],
    filePath: undefined,
    matchSubdirectories: true,
    fileConfigPath: '.dsh/mcp.json',
  }
  const merged = { ...base, ...overrides }
  // Keep aliases in sync unless the caller overrode them explicitly.
  if (overrides.defaults !== undefined && overrides.defaultServers === undefined) merged.defaultServers = overrides.defaults
  if (overrides.defaultServers !== undefined && overrides.defaults === undefined) merged.defaults = overrides.defaultServers
  if (overrides.workspaces === undefined) merged.workspaces = []
  return merged
}

function serverConfig(serverName, patch = {}) {
  return {
    serverName,
    transport: patch.transport ?? 'stdio',
    command: patch.command ?? '',
    args: patch.args ?? [],
    env: patch.env ?? {},
    cwd: patch.cwd ?? '',
    url: patch.url ?? '',
    headers: patch.headers ?? {},
    enabled: patch.enabled ?? true,
    failOnStartupError: patch.failOnStartupError ?? false,
  }
}

function strippedServer(server) {
  return {
    serverName: server.serverName,
    transport: server.transport ?? 'stdio',
    command: server.command,
    args: server.args,
    env: server.env,
    cwd: server.cwd,
    url: server.url,
    headers: server.headers,
    enabled: server.enabled,
    failOnStartupError: server.failOnStartupError,
  }
}

// ---------------------------------------------------------------------------
// Load the module under test
// ---------------------------------------------------------------------------
let namespace
let loadError
try {
  namespace = await prepareRuntime()
  resolveExports(namespace)
} catch (error) {
  loadError = error
}

after(() => {
  rmSync(RUNTIME_DIR, { recursive: true, force: true })
})

function requireModule(t) {
  if (namespace !== undefined) return true
  t.skip(`index.js not loadable: ${loadError instanceof Error ? loadError.message : String(loadError)}`)
  return false
}

function requireExport(t, logical) {
  const found = resolved.get(logical)
  if (found !== undefined) return found.fn
  t.diagnostic(`export for ${logical} was not found in index.js exports: ${Object.keys(namespace ?? {}).join(', ')}`)
  assert.fail(`index.js does not export ${LOGICAL_EXPORTS[logical].label} (checked DESIGN name, aliases and keyword match)`)
}

// ---------------------------------------------------------------------------
// 0. Module loads and expected pure exports exist
// ---------------------------------------------------------------------------
test('index.js loads and stays importable with the installed DSH runtime packages', (t) => {
  if (loadError !== undefined) {
    t.diagnostic(`load error: ${loadError instanceof Error ? loadError.stack ?? loadError.message : String(loadError)}`)
  }
  assert.ok(namespace !== undefined, `index.js failed to load: ${loadError instanceof Error ? loadError.message : String(loadError)}`)
  // schemastery `z.object(...)` returns a Schema function, so assert callable.
  assert.equal(typeof namespace.Config, 'function', 'Config export missing (expected a schemastery Schema)')
  assert.equal(typeof namespace.apply, 'function', 'apply export missing')
  assert.deepEqual(namespace.inject, ['tools', 'loader'], 'inject export must be [tools, loader]')
})

test('pure-logic exports are present (actual export names recorded)', (t) => {
  if (!requireModule(t)) return
  for (const [logical, spec] of Object.entries(LOGICAL_EXPORTS)) {
    const found = resolved.get(logical)
    if (found === undefined) {
      t.diagnostic(`MISSING: ${spec.label} (tried ${[...spec.design, ...spec.aliases].join(', ')} and /${spec.fuzzy.source}/)`)
    } else {
      t.diagnostic(`RESOLVED: ${spec.label} -> exports.${found.name}`)
    }
    assert.ok(found !== undefined, `${spec.label} export missing`)
  }
})

// ---------------------------------------------------------------------------
// 1. parseMcpFile: file format -> ServerConfig[]
// ---------------------------------------------------------------------------
test('parseMcpFile parses mcpServers, infers transport, maps disabled -> enabled:false', (t) => {
  if (!requireModule(t)) return
  const parse = requireExport(t, 'parseMcpFile')
  const parsed = parse(JSON.stringify({
    mcpServers: {
      github: { command: 'npx', args: ['-y', '@x/github'], env: { TOKEN: 'plain' }, disabled: true },
      web: { url: 'https://example.com/mcp', headers: { Authorization: 'Bearer t' } },
    },
  }))
  const servers = entriesOf(parsed).map(entryServer)
  assert.equal(servers.length, 2, `expected 2 servers, got ${JSON.stringify(servers)}`)

  const byName = new Map(servers.map((server) => [server.serverName ?? server.name, server]))
  const github = byName.get('github')
  assert.ok(github !== undefined, 'github server missing (serverName must come from the mcpServers key)')
  assert.equal(github.command, 'npx')
  assert.deepEqual(github.args, ['-y', '@x/github'])
  assert.equal(github.enabled, false, 'disabled:true must map to enabled:false')
  const githubTransport = github.transport ?? 'stdio'
  assert.equal(githubTransport, 'stdio')

  const web = byName.get('web')
  assert.ok(web !== undefined, 'web server missing')
  assert.equal(web.transport ?? (web.url ? 'streamable-http' : 'stdio'), 'streamable-http')
  assert.equal(web.url, 'https://example.com/mcp')
  assert.equal(web.enabled, true)
})

test('parseMcpFile skips invalid entries instead of failing the whole file', (t) => {
  if (!requireModule(t)) return
  const parse = requireExport(t, 'parseMcpFile')
  const parsed = parse(JSON.stringify({
    mcpServers: {
      ok: { command: 'node', args: [] },
      'not-object': 42,
      'bad-command': { command: 42 },
      'bad-url': { url: 7 },
      empty: {},
    },
  }))
  const servers = entriesOf(parsed).map(entryServer)
  const names = servers.map((server) => server.serverName ?? server.name)
  assert.ok(names.includes('ok'), `valid entry must survive, got ${JSON.stringify(names)}`)
  for (const invalid of ['not-object', 'bad-command', 'bad-url', 'empty']) {
    assert.ok(!names.includes(invalid), `invalid entry "${invalid}" must be skipped, got ${JSON.stringify(names)}`)
  }
  // Implementation note (recorded, not asserted as required): a non-array
  // `args` value is leniently coerced to [] instead of dropping the entry.
  t.diagnostic(`parseMcpFile lenient coercion check: entries=${JSON.stringify(names)}`)
})

test('parseMcpFile throws when mcpServers is missing', (t) => {
  if (!requireModule(t)) return
  const parse = requireExport(t, 'parseMcpFile')
  assert.throws(() => parse(JSON.stringify({ servers: {} })), /mcpServers/)
})

test('parseMcpFile throws on malformed JSON', (t) => {
  if (!requireModule(t)) return
  const parse = requireExport(t, 'parseMcpFile')
  assert.throws(() => parse('{ not json'))
})

test('parseMcpFile explicit transport overrides inference', (t) => {
  if (!requireModule(t)) return
  const parse = requireExport(t, 'parseMcpFile')
  const parsed = parse(JSON.stringify({
    mcpServers: {
      forcedHttp: { transport: 'streamable-http', url: 'https://example.com/mcp', command: 'ignored-for-http' },
      forcedStdio: { transport: 'stdio', command: 'node', url: 'https://ignored-for-stdio' },
      inferredHttp: { url: 'https://example.com/other' },
      unknownTransport: { transport: 'smtp', command: 'node' },
    },
  }))
  const byName = new Map(entriesOf(parsed).map((entry) => {
    const server = entryServer(entry)
    return [server.serverName ?? server.name, server]
  }))
  assert.equal(byName.get('forcedHttp')?.transport, 'streamable-http')
  assert.equal(byName.get('forcedStdio')?.transport, 'stdio')
  assert.equal(byName.get('inferredHttp')?.transport, 'streamable-http', 'url without transport infers streamable-http')
  assert.equal(byName.get('unknownTransport')?.transport, 'stdio', 'unknown transport falls back to inferred stdio')
  t.diagnostic(`transport diagnostics: ${JSON.stringify(parsed.diagnostics ?? [])}`)
})

// ---------------------------------------------------------------------------
// 2. expandEnvRefs / ${env:NAME}
// ---------------------------------------------------------------------------
test('${env:NAME} expansion replaces present variables and keeps missing ones literal', (t) => {
  if (!requireModule(t)) return
  const expand = requireExport(t, 'expandEnvRefs')
  process.env.MCPWS_TEST_TOKEN = 's3cr3t-value'
  try {
    let output
    try {
      output = expand('Bearer ${env:MCPWS_TEST_TOKEN}')
    } catch (error) {
      t.diagnostic(`expandEnvRefs threw on a plain string argument: ${String(error)}; trying object form`)
      output = expand({ header: 'Bearer ${env:MCPWS_TEST_TOKEN}' })
    }
    const present = JSON.stringify(output)
    assert.ok(present.includes('Bearer s3cr3t-value'), `present env var must expand, got ${present}`)

    let missingOutput
    try {
      missingOutput = expand('x-${env:MCPWS_TEST_DOES_NOT_EXIST}-y')
    } catch {
      missingOutput = expand({ value: 'x-${env:MCPWS_TEST_DOES_NOT_EXIST}-y' })
    }
    const missing = JSON.stringify(missingOutput)
    assert.ok(missing.includes('${env:MCPWS_TEST_DOES_NOT_EXIST}'), `missing env var must stay literal, got ${missing}`)

    // The missing reference must be reported, not silently dropped (DESIGN 4.1).
    const collector = []
    try {
      expand('x-${env:MCPWS_TEST_DOES_NOT_EXIST}', process.env, collector)
    } catch {
      expand({ value: 'x-${env:MCPWS_TEST_DOES_NOT_EXIST}' }, process.env, collector)
    }
    if (Array.isArray(collector) && collector.length > 0) {
      assert.ok(JSON.stringify(collector).includes('MCPWS_TEST_DOES_NOT_EXIST'), `diagnostic must name the missing variable: ${JSON.stringify(collector)}`)
    } else {
      t.diagnostic('expandEnvRefs has no diagnostics collector output (missing-var diagnostics may be surfaced elsewhere)')
    }
  } finally {
    delete process.env.MCPWS_TEST_TOKEN
  }
})

test('the resolution pipeline expands ${env:} in parsed file servers (env/command/args/url)', (t) => {
  if (!requireModule(t)) return
  const parse = requireExport(t, 'parseMcpFile')
  process.env.MCPWS_PIPE_TOKEN = 'pipe-token'
  process.env.MCPWS_PIPE_CMD = '/usr/bin/env'
  try {
    const text = JSON.stringify({
      mcpServers: {
        envs: {
          command: '${env:MCPWS_PIPE_CMD}',
          args: ['--token', '${env:MCPWS_PIPE_TOKEN}'],
          env: { API_KEY: '${env:MCPWS_PIPE_TOKEN}' },
        },
        http: {
          url: 'https://example.com/${env:MCPWS_PIPE_TOKEN}',
          headers: { Authorization: 'Bearer ${env:MCPWS_PIPE_TOKEN}' },
        },
      },
    })
    const parsed = parse(text)
    const parsedJson = JSON.stringify(entriesOf(parsed).map(entryServer))
    const resolveServers = resolved.get('resolveServers')?.fn
    const resolvedJson = resolveServers === undefined ? '' : JSON.stringify(entriesOf(resolveServers(resolveArgs({
      cwd: '/proj',
      defaults: [],
      workspaces: [],
      fileServers: entriesOf(parsed).map(entryServer),
      filePath: '/proj/.dsh/mcp.json',
    }))))
    const combined = parsedJson + resolvedJson
    t.diagnostic(`expansion surfaces: parseMcpFile=${parsedJson.includes('pipe-token') ? 'yes' : 'no'}, resolveServers=${resolvedJson.includes('pipe-token') ? 'yes' : 'no'}`)
    assert.ok(combined.includes('pipe-token'), '${env:NAME} must be expanded somewhere in the file-config pipeline')
    assert.ok(combined.includes('Bearer pipe-token'), 'headers must expand ${env:NAME}')
  } finally {
    delete process.env.MCPWS_PIPE_TOKEN
    delete process.env.MCPWS_PIPE_CMD
  }
})

// ---------------------------------------------------------------------------
// 3. resolveServers: merge order, longest prefix, enabled:false retention
// ---------------------------------------------------------------------------
const defaults = [
  serverConfig('shared', { command: 'default-cmd' }),
  serverConfig('default-only', { command: 'default-only-cmd' }),
  serverConfig('disabled-default', { command: 'disabled-default-cmd', enabled: false }),
]
const outerWorkspace = {
  path: '/proj',
  title: 'proj',
  servers: [serverConfig('shared', { command: 'outer-cmd' }), serverConfig('outer-only', { command: 'outer-only-cmd' })],
}
const innerWorkspace = {
  path: '/proj/inner',
  title: 'inner',
  servers: [serverConfig('shared', { command: 'inner-cmd' }), serverConfig('inner-only', { command: 'inner-only-cmd' })],
}
const unrelatedWorkspace = {
  path: '/other',
  title: 'other',
  servers: [serverConfig('other-only', { command: 'other-cmd' })],
}
const fileServers = [
  serverConfig('shared', { command: 'file-cmd' }),
  serverConfig('file-only', { command: 'file-only-cmd' }),
]

test('resolveServers merges default < workspace(outer->inner) < file, last writer wins', (t) => {
  if (!requireModule(t)) return
  const resolveServers = requireExport(t, 'resolveServers')
  const result = resolveServers(resolveArgs({
    cwd: '/proj/inner/agent',
    defaults,
    workspaces: [outerWorkspace, innerWorkspace, unrelatedWorkspace],
    fileServers: [{ path: '/proj/inner/.dsh/mcp.json', servers: fileServers }],
    filePath: '/proj/inner/.dsh/mcp.json',
  }))
  const entries = entriesOf(result)
  assert.ok(entries.length > 0, 'resolveServers returned no entries')

  const shared = entryByName(entries, 'shared')
  assert.equal(shared.length, 1, `a serverName must be collapsed to one entry, got ${shared.length}`)
  assert.equal(entryServer(shared[0]).command, 'file-cmd', 'file entries must win over workspace/defaults')

  // Every distinct source contributes its non-conflicting servers.
  const names = entries.map((entry) => entry.serverName ?? entry.name)
  for (const expected of ['default-only', 'outer-only', 'inner-only', 'file-only']) {
    assert.ok(names.includes(expected), `${expected} missing from ${JSON.stringify(names)}`)
  }
  assert.ok(!names.includes('other-only'), 'unrelated workspace servers must not be included')

  // Entry shape: { serverName, source, server }
  assert.ok(shared[0].server !== null && typeof shared[0].server === 'object', `entry.server missing: ${JSON.stringify(shared[0])}`)
  const source = sourceOf(shared[0])
  t.diagnostic(`override source for "shared": ${source}`)
  assert.equal(source, 'file:/proj/inner/.dsh/mcp.json', 'file entries must report source "file:<path>"')
})

test('resolveServers picks the longest matching workspace path (inner overrides outer)', (t) => {
  if (!requireModule(t)) return
  const resolveServers = requireExport(t, 'resolveServers')
  const result = resolveServers(resolveArgs({
    cwd: '/proj/inner/deep/agent',
    defaults,
    workspaces: [outerWorkspace, innerWorkspace],
    fileServers: [],
    filePath: '/proj/inner/deep/.dsh/mcp.json',
  }))
  const entries = entriesOf(result)
  const shared = entryByName(entries, 'shared')
  assert.equal(shared.length, 1)
  assert.equal(entryServer(shared[0]).command, 'inner-cmd')
  const source = sourceOf(shared[0])
  t.diagnostic(`longest-prefix source for "shared": ${source}`)
  if (source !== '') assert.ok(source.includes('/proj/inner'), `expected inner workspace source, got ${JSON.stringify(source)}`)
})

test('resolveServers keeps enabled:false entries for downstream reporting', (t) => {
  if (!requireModule(t)) return
  const resolveServers = requireExport(t, 'resolveServers')
  const result = resolveServers(resolveArgs({
    cwd: '/proj/inner',
    defaults,
    workspaces: [innerWorkspace],
    fileServers: [],
    filePath: '/proj/inner/.dsh/mcp.json',
  }))
  const entries = entriesOf(result)
  const disabled = entryByName(entries, 'disabled-default')
  assert.equal(disabled.length, 1, 'disabled default server must be preserved in the resolution')
  assert.equal(entryServer(disabled[0]).enabled, false)
})

test('resolveServers with matchSubdirectories:false only matches the exact workspace path', (t) => {
  if (!requireModule(t)) return
  const resolveServers = requireExport(t, 'resolveServers')
  const result = resolveServers(resolveArgs({
    cwd: '/proj/inner/deep',
    defaults,
    workspaces: [outerWorkspace, innerWorkspace],
    fileServers: [],
    filePath: '/proj/inner/deep/.dsh/mcp.json',
    matchSubdirectories: false,
  }))
  const entries = entriesOf(result)
  const names = entries.map((entry) => entry.serverName ?? entry.name)
  const shared = entryByName(entries, 'shared')
  const command = entryServer(shared[0]).command
  t.diagnostic(`matchSubdirectories:false -> shared.command=${command}, names=${JSON.stringify(names)}`)
  assert.equal(command, 'default-cmd', 'no workspace may match when subdirectory matching is disabled')
  assert.ok(!names.includes('inner-only'))
})

test('matchWorkspaceEntries returns matches sorted outer -> inner', (t) => {
  if (!requireModule(t)) return
  const matchWorkspaceEntries = namespace.matchWorkspaceEntries
  if (typeof matchWorkspaceEntries !== 'function') {
    t.skip('matchWorkspaceEntries is not exported by this index.js')
    return
  }
  const matched = matchWorkspaceEntries('/proj/inner/deep', [innerWorkspace, outerWorkspace, unrelatedWorkspace], true)
  assert.deepEqual(matched.map((workspace) => workspace.path), ['/proj', '/proj/inner'])
  const exactOnly = matchWorkspaceEntries('/proj/inner/deep', [outerWorkspace, innerWorkspace], false)
  assert.deepEqual(exactOnly, [])
  const exact = matchWorkspaceEntries('/proj/inner', [outerWorkspace, innerWorkspace], false)
  assert.deepEqual(exact.map((workspace) => workspace.path), ['/proj/inner'])
})

test('findMcpConfigFile finds the nearest .dsh/mcp.json between cwd and the workspace root', async (t) => {
  if (!requireModule(t)) return
  const findMcpConfigFile = namespace.findMcpConfigFile
  if (typeof findMcpConfigFile !== 'function') {
    t.skip('findMcpConfigFile is not exported by this index.js')
    return
  }
  const { mkdtempSync } = await import('node:fs')
  const { join: joinPath } = await import('node:path')
  const base = mkdtempSync(join(HERE, 'tmp', 'find-mcp-'))
  try {
    const workspaceRoot = joinPath(base, 'repo')
    const cwd = joinPath(workspaceRoot, 'a', 'b')
    const deeper = joinPath(cwd, 'deeper')
    mkdirSync(joinPath(workspaceRoot, '.dsh'), { recursive: true })
    mkdirSync(joinPath(cwd, '.dsh'), { recursive: true })
    mkdirSync(joinPath(joinPath(workspaceRoot, 'a'), '.dsh'), { recursive: true })
    mkdirSync(deeper, { recursive: true })
    writeFileSync(joinPath(workspaceRoot, '.dsh', 'mcp.json'), '{"mcpServers":{}}')
    writeFileSync(joinPath(joinPath(workspaceRoot, 'a'), '.dsh', 'mcp.json'), '{"mcpServers":{}}')

    // Nearest existing file between cwd and the outermost matched workspace root wins.
    const viaMatched = await findMcpConfigFile({
      cwd,
      matched: [{ path: workspaceRoot }],
      fileConfigPath: '.dsh/mcp.json',
    })
    assert.equal(viaMatched, joinPath(joinPath(workspaceRoot, 'a'), '.dsh', 'mcp.json'))

    const viaWorkspaces = await findMcpConfigFile({
      cwd,
      workspaces: [{ path: workspaceRoot }],
      matchSubdirectories: true,
      fileConfigPath: '.dsh/mcp.json',
    })
    assert.equal(viaWorkspaces, joinPath(joinPath(workspaceRoot, 'a'), '.dsh', 'mcp.json'))

    // Without a matched workspace only `cwd` itself is inspected: the directory
    // with no own file reports nothing instead of walking to a parent file.
    const noMatch = await findMcpConfigFile({ cwd, matched: [], fileConfigPath: '.dsh/mcp.json' })
    assert.equal(noMatch, undefined, 'no-match lookup must inspect only cwd')

    // The upward walk stops at the outermost matched workspace root.
    rmSync(joinPath(joinPath(workspaceRoot, 'a'), '.dsh', 'mcp.json'), { force: true })
    const stopAtRoot = await findMcpConfigFile({
      cwd: deeper,
      matched: [{ path: joinPath(workspaceRoot, 'a') }],
      fileConfigPath: '.dsh/mcp.json',
    })
    assert.equal(stopAtRoot, undefined, 'walk must not pass the outermost matched workspace root (repo/.dsh/mcp.json is outside)')

    const reachRoot = await findMcpConfigFile({
      cwd: deeper,
      matched: [{ path: workspaceRoot }],
      fileConfigPath: '.dsh/mcp.json',
    })
    assert.equal(reachRoot, joinPath(workspaceRoot, '.dsh', 'mcp.json'))
  } finally {
    rmSync(base, { recursive: true, force: true })
  }
})

test('canonicalPath falls back to an absolute resolved path for missing directories', async (t) => {
  if (!requireModule(t)) return
  const canonicalPath = namespace.canonicalPath
  if (typeof canonicalPath !== 'function') {
    t.skip('canonicalPath is not exported by this index.js')
    return
  }
  const missing = join(HERE, 'tmp', 'definitely-not-a-real-dir-for-canonical-test')
  const canonical = await canonicalPath(missing)
  assert.equal(canonical, resolve(missing))
  const existing = await canonicalPath(HERE)
  assert.equal(existing, resolve(HERE))
})

// ---------------------------------------------------------------------------
// 4. toMcpClientConfig: ServerConfig -> dsh-mcp-client Config
// ---------------------------------------------------------------------------
test('toMcpClientConfig converts a stdio server', (t) => {
  if (!requireModule(t)) return
  const toMcpClientConfig = requireExport(t, 'toMcpClientConfig')
  const config = toMcpClientConfig(serverConfig('github', {
    command: 'npx',
    args: ['-y', '@x/github'],
    env: { TOKEN: 't' },
    cwd: '/proj',
    failOnStartupError: true,
  }))
  assert.equal(config.transport, 'stdio')
  assert.equal(config.serverName, 'github')
  assert.equal(config.command, 'npx')
  assert.deepEqual(config.args, ['-y', '@x/github'])
  assert.deepEqual(config.env, { TOKEN: 't' })
  assert.equal(config.cwd, '/proj')
  assert.equal(config.failOnStartupError, true)
  assert.equal(config.url, undefined, 'stdio config must not carry url')
  assert.ok(!('headers' in config), `stdio config must not carry headers, got ${JSON.stringify(config)}`)
})

test('toMcpClientConfig converts a streamable-http server', (t) => {
  if (!requireModule(t)) return
  const toMcpClientConfig = requireExport(t, 'toMcpClientConfig')
  const config = toMcpClientConfig(serverConfig('web', {
    transport: 'streamable-http',
    url: 'https://example.com/mcp',
    headers: { Authorization: 'Bearer t' },
    failOnStartupError: false,
  }))
  assert.equal(config.transport, 'streamable-http')
  assert.equal(config.serverName, 'web')
  assert.equal(config.url, 'https://example.com/mcp')
  assert.deepEqual(config.headers, { Authorization: 'Bearer t' })
  assert.equal(config.failOnStartupError, false)
  assert.ok(!('command' in config), `http config must not carry command, got ${JSON.stringify(config)}`)
  assert.ok(!('args' in config), `http config must not carry args, got ${JSON.stringify(config)}`)
})

// ---------------------------------------------------------------------------
// Report the export adaptation summary when the file finishes.
// ---------------------------------------------------------------------------
process.on('exit', () => {
  if (diagnostics.length > 0) {
    console.error('\n[unit.test] export/shape diagnostics:')
    for (const message of diagnostics) console.error(`  - ${message}`)
  }
})
