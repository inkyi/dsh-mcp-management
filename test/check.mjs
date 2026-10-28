#!/usr/bin/env node
/**
 * Static contract checks for the dsh-plugin-mcp-management bundle.
 *
 * Verifies the files/metadata that do NOT require a running DSH Host:
 *   - package.json fields (name/type/exports/files/dsh.bundle.patch/dsh.client)
 *   - cordis.patch.yml entry id + package name
 *   - locale/en.json + locale/zh.json have meta.title / meta.description
 *   - icon.svg parses (xmllint when available, lightweight fallback) and is < 256 KiB
 *   - index.js / client.js exist and pass `node --input-type=module --check`
 *   - advisory: expected Host exports, forbidden imports, client module shape
 *
 * Exit code: 0 when every hard check passes, 1 otherwise. Advisory findings
 * only print WARN and never fail the run.
 *
 * Usage: node test/check.mjs
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const ICON_LIMIT_BYTES = 256 * 1024
const PLUGIN_NAME = 'dsh-plugin-mcp-management'
const ENTRY_ID = 'mcp-workspaces'

const passes = []
const failures = []
const warnings = []

const pass = (name, detail = '') => passes.push({ name, detail })
const fail = (name, detail = '') => failures.push({ name, detail })
const warn = (name, detail = '') => warnings.push({ name, detail })

function readText(relativePath) {
  return readFileSync(join(ROOT, relativePath), 'utf8')
}

function exists(relativePath) {
  return existsSync(join(ROOT, relativePath))
}

function checkFile(relativePath) {
  if (!exists(relativePath)) {
    fail(`file exists: ${relativePath}`, 'missing')
    return false
  }
  const stats = statSync(join(ROOT, relativePath))
  if (!stats.isFile() || stats.size === 0) {
    fail(`file exists: ${relativePath}`, `not a regular non-empty file (size=${stats.size})`)
    return false
  }
  pass(`file exists: ${relativePath}`, `${stats.size} bytes`)
  return true
}

// ---------------------------------------------------------------------------
// 1. Required files
// ---------------------------------------------------------------------------
const REQUIRED_FILES = [
  'index.js',
  'client.js',
  'package.json',
  'cordis.patch.yml',
  'locale/en.json',
  'locale/zh.json',
  'icon.svg',
  'LICENSE',
  'README.md',
]
const present = new Map()
for (const file of REQUIRED_FILES) present.set(file, checkFile(file))

// Design document: advisory for the bundle itself.
if (exists('DESIGN.md')) pass('file exists: DESIGN.md')
else warn('file exists: DESIGN.md', 'design document missing')

// ---------------------------------------------------------------------------
// 2. package.json
// ---------------------------------------------------------------------------
let pkg
if (present.get('package.json')) {
  try {
    pkg = JSON.parse(readText('package.json'))
    pass('package.json parses as JSON')
  } catch (error) {
    fail('package.json parses as JSON', String(error))
  }
}

if (pkg !== undefined) {
  const expectField = (label, actual, expected) => {
    if (actual === expected) pass(`package.json ${label}`, JSON.stringify(actual))
    else fail(`package.json ${label}`, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }

  expectField('name', pkg.name, PLUGIN_NAME)
  expectField('type', pkg.type, 'module')
  expectField('license', pkg.license, 'MIT')

  const repositoryUrl = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url
  if (typeof repositoryUrl === 'string' && repositoryUrl.includes('github.com')) pass('package.json repository', repositoryUrl)
  else fail('package.json repository', `expected a GitHub repository URL, got ${JSON.stringify(repositoryUrl)}`)

  if (typeof pkg.version === 'string' && /^\d+\.\d+\.\d+/.test(pkg.version)) pass('package.json version', pkg.version)
  else fail('package.json version', `expected a semver string, got ${JSON.stringify(pkg.version)}`)

  const exportTarget = (entry) => {
    if (typeof entry === 'string') return entry
    if (entry !== null && typeof entry === 'object') return entry.import ?? entry.default ?? entry.node ?? undefined
    return undefined
  }
  const exportsMap = pkg.exports !== null && typeof pkg.exports === 'object' ? pkg.exports : {}
  const expectedExports = [
    ['.', './index.js'],
    ['./client', './client.js'],
    ['./locale/*.json', './locale/*.json'],
    ['./icon', './icon.svg'],
  ]
  for (const [key, target] of expectedExports) {
    const actual = exportTarget(exportsMap[key])
    if (actual === target) pass(`package.json exports[${JSON.stringify(key)}]`, target)
    else fail(`package.json exports[${JSON.stringify(key)}]`, `expected ${target}, got ${JSON.stringify(actual)}`)
  }

  const files = Array.isArray(pkg.files) ? pkg.files : []
  for (const entry of ['index.js', 'client.js', 'cordis.patch.yml', 'locale/*.json', 'icon.svg']) {
    if (files.includes(entry)) pass(`package.json files contains ${entry}`)
    else fail(`package.json files contains ${entry}`, `got ${JSON.stringify(files)}`)
  }

  if (pkg.dsh !== null && typeof pkg.dsh === 'object') {
    const patch = pkg.dsh.bundle !== null && typeof pkg.dsh.bundle === 'object' ? pkg.dsh.bundle.patch : undefined
    expectField('dsh.bundle.patch', patch, './cordis.patch.yml')
    const client = pkg.dsh.client !== null && typeof pkg.dsh.client === 'object' ? pkg.dsh.client : undefined
    if (client?.platform === 'web') pass('package.json dsh.client.platform', 'web')
    else warn('package.json dsh.client.platform', `expected "web", got ${JSON.stringify(client?.platform)}`)
    if (Array.isArray(client?.inject) && client.inject.length > 0) {
      pass('package.json dsh.client.inject', `${client.inject.length} entries`)
    } else {
      warn('package.json dsh.client.inject', 'expected a non-empty array (browser module injection list)')
    }
  } else {
    fail('package.json dsh', 'missing dsh section (bundle.patch / client)')
  }
}

// ---------------------------------------------------------------------------
// 3. cordis.patch.yml
// ---------------------------------------------------------------------------
if (present.get('cordis.patch.yml')) {
  const yaml = readText('cordis.patch.yml')
  const scalarOf = (key) => {
    for (const rawLine of yaml.split(/\r?\n/)) {
      let line = rawLine.trim()
      if (line === '' || line.startsWith('#')) continue
      // Strip any leading block-sequence markers: "- insert:", "- id: ..."
      while (line.startsWith('- ')) line = line.slice(2).trim()
      const match = new RegExp(`^${key}\\s*:\\s*(.*)$`).exec(line)
      if (match === null) continue
      let value = match[1].trim()
      // Drop trailing YAML comments (values here are plain scalars / quoted).
      if (!value.startsWith("'") && !value.startsWith('"')) value = value.replace(/\s+#.*$/, '')
      if ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"'))) {
        value = value.slice(1, -1)
      }
      if (value !== '') return value
    }
    return undefined
  }

  if (/^\s*-\s*insert\s*:/m.test(yaml)) pass('cordis.patch.yml has insert section')
  else fail('cordis.patch.yml has insert section', 'expected a top-level "- insert:" list')

  const id = scalarOf('id')
  if (id === ENTRY_ID) pass('cordis.patch.yml entry id', id)
  else fail('cordis.patch.yml entry id', `expected ${JSON.stringify(ENTRY_ID)}, got ${JSON.stringify(id)}`)

  const name = scalarOf('name')
  if (name === PLUGIN_NAME) pass('cordis.patch.yml package name', name)
  else fail('cordis.patch.yml package name', `expected ${JSON.stringify(PLUGIN_NAME)}, got ${JSON.stringify(name)}`)
}

// ---------------------------------------------------------------------------
// 4. locale dictionaries
// ---------------------------------------------------------------------------
const localeData = new Map()
for (const lang of ['en', 'zh']) {
  const file = `locale/${lang}.json`
  if (!present.get(file)) continue
  try {
    const data = JSON.parse(readText(file))
    localeData.set(lang, data)
    pass(`${file} parses as JSON`)
    const meta = data?.meta
    for (const key of ['title', 'description']) {
      if (typeof meta?.[key] === 'string' && meta[key].trim() !== '') pass(`${file} meta.${key}`, JSON.stringify(meta[key]))
      else fail(`${file} meta.${key}`, 'expected a non-empty string')
    }
  } catch (error) {
    fail(`${file} parses as JSON`, String(error))
  }
}
if (localeData.size === 2) {
  const flatten = (value, prefix = '', out = []) => {
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      for (const [key, child] of Object.entries(value)) flatten(child, prefix === '' ? key : `${prefix}.${key}`, out)
    } else {
      out.push(prefix)
    }
    return out.sort()
  }
  const enKeys = flatten(localeData.get('en'))
  const zhKeys = flatten(localeData.get('zh'))
  const onlyEn = enKeys.filter((key) => !zhKeys.includes(key))
  const onlyZh = zhKeys.filter((key) => !enKeys.includes(key))
  if (onlyEn.length === 0 && onlyZh.length === 0) pass('locale key parity en<->zh', `${enKeys.length} leaf keys`)
  else fail('locale key parity en<->zh', `only en: ${JSON.stringify(onlyEn)}; only zh: ${JSON.stringify(onlyZh)}`)
}

// ---------------------------------------------------------------------------
// 5. icon.svg
// ---------------------------------------------------------------------------
if (present.get('icon.svg')) {
  const iconPath = join(ROOT, 'icon.svg')
  const stats = statSync(iconPath)
  if (stats.size < ICON_LIMIT_BYTES) pass('icon.svg size < 256 KiB', `${stats.size} bytes`)
  else fail('icon.svg size < 256 KiB', `${stats.size} bytes`)

  const svg = readFileSync(iconPath, 'utf8')
  let parsed = false
  const xmllint = spawnSync('xmllint', ['--noout', '-'], { input: svg, encoding: 'utf8' })
  if (xmllint.error === undefined) {
    if (xmllint.status === 0) {
      parsed = true
      pass('icon.svg parses as XML', 'xmllint')
    } else {
      fail('icon.svg parses as XML', `xmllint: ${(xmllint.stderr ?? '').trim() || `exit ${xmllint.status}`}`)
    }
  } else if (xmllint.error.code === 'ENOENT') {
    // Fallback: lightweight SVG root + tag-balance check.
    const withoutDecl = svg.replace(/^\uFEFF/, '').replace(/<\?xml[\s\S]*?\?>/g, '').replace(/<!--[\s\S]*?-->/g, '').trim()
    const balance = (() => {
      const stack = []
      const tagRe = /<(\/?)([A-Za-z][\w:.-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g
      let match
      while ((match = tagRe.exec(withoutDecl)) !== null) {
        const [, closing, tag, , selfClosing] = match
        if (selfClosing === '/') continue
        if (closing === '/') {
          if (stack.pop() !== tag) return false
        } else {
          stack.push(tag)
        }
      }
      return stack.length === 0
    })()
    const isSvgRoot = /^<svg[\s>]/.test(withoutDecl) && /<\/svg>$/.test(withoutDecl)
    if (isSvgRoot && balance) {
      parsed = true
      pass('icon.svg parses as XML', 'built-in fallback (xmllint unavailable)')
    } else {
      fail('icon.svg parses as XML', `built-in fallback failed (svgRoot=${isSvgRoot}, balanced=${balance})`)
    }
  } else {
    warn('icon.svg parses as XML', `xmllint could not run: ${String(xmllint.error)}`)
    parsed = true
  }

  if (parsed) {
    if (/xmlns\s*=\s*["']http:\/\/www\.w3\.org\/2000\/svg["']/.test(svg)) pass('icon.svg has SVG namespace')
    else fail('icon.svg has SVG namespace', 'missing xmlns="http://www.w3.org/2000/svg"')
    if (/\bviewBox\s*=\s*["'][^"']+["']/.test(svg)) pass('icon.svg has viewBox')
    else warn('icon.svg has viewBox', 'no viewBox attribute (scaling may be wrong)')
  }
}

// ---------------------------------------------------------------------------
// 6. ESM syntax check (node --input-type=module --check < file)
// ---------------------------------------------------------------------------
const ESM_FILES = ['index.js', 'client.js']
for (const file of ESM_FILES) {
  if (!present.get(file)) continue
  const source = readText(file)
  const result = spawnSync(process.execPath, ['--input-type=module', '--check'], {
    input: source,
    encoding: 'utf8',
    timeout: 30_000,
  })
  if (result.error !== undefined) {
    fail(`syntax: ${file}`, `could not run node --check: ${String(result.error)}`)
  } else if (result.status === 0) {
    pass(`syntax: ${file}`, 'node --input-type=module --check OK')
  } else {
    fail(`syntax: ${file}`, (result.stderr ?? '').trim() || `node --check exited ${result.status}`)
  }
}

// ---------------------------------------------------------------------------
// 7. Advisory: Host export surface and wiring constraints
// ---------------------------------------------------------------------------
const indexSource = present.get('index.js') ? readText('index.js') : ''
const clientSource = present.get('client.js') ? readText('client.js') : ''

const hasExport = (source, names) => {
  const listExport = /export\s*\{([\s\S]*?)\}/.exec(source)
  const exportedInList = listExport !== null && names.some((name) => new RegExp(`\\b${name}\\b(?:\\s+as\\s+\\w+)?`).test(listExport[1]))
  return names.some((name) => new RegExp(`export\\s+(?:async\\s+)?(?:const|let|var|function|class)\\s+${name}\\b`).test(source)) || exportedInList
}

if (indexSource !== '') {
  for (const name of ['Config', 'apply', 'inject']) {
    if (hasExport(indexSource, [name])) pass(`index.js exports ${name}`)
    else fail(`index.js exports ${name}`, 'not found via static export scan')
  }
  for (const name of ['resolveServers', 'parseMcpFile', 'toMcpClientConfig', 'expandEnvRefs']) {
    if (hasExport(indexSource, [name])) pass(`index.js exports ${name} (pure logic)`)
    else warn(`index.js exports ${name} (pure logic)`, 'not found via static export scan; unit tests adapt to actual export names and record them')
  }
  if (/^\s*import\s[^;]*['"]@modelcontextprotocol\//m.test(indexSource)) {
    fail('index.js forbidden import', 'must not statically import @modelcontextprotocol/* (DESIGN section 7.1)')
  } else {
    pass('index.js does not statically import @modelcontextprotocol/*')
  }
  if (/^\s*import\s[^;]*['"]@deepseek-ai\/dsh-mcp-client['"]/m.test(indexSource)) {
    fail('index.js mcp-client import', 'must use ctx.loader.import("@deepseek-ai/dsh-mcp-client"), not a static import')
  } else {
    pass('index.js has no static @deepseek-ai/dsh-mcp-client import')
  }
  if (indexSource.includes('dsh-mcp-client')) pass('index.js references @deepseek-ai/dsh-mcp-client')
  else warn('index.js references @deepseek-ai/dsh-mcp-client', 'loader.import target not found')
  if (indexSource.includes('configEditor')) pass('index.js references configEditor service')
  else warn('index.js references configEditor service', 'DESIGN 4.3 requires optional configEditor injection')
  if (/agent\/created/.test(indexSource)) pass('index.js listens to agent/created')
  else warn('index.js listens to agent/created', 'DESIGN 4.2 requires the serial agent/created listener')
}

if (clientSource !== '') {
  if (/__ModuleLoader__\s*\.\s*load\s*\(/.test(clientSource)) pass('client.js uses window.__ModuleLoader__.load')
  else fail('client.js uses window.__ModuleLoader__.load', 'DESIGN 5.1 module shape not found')
  if (clientSource.includes(PLUGIN_NAME)) pass('client.js registers module id', PLUGIN_NAME)
  else fail('client.js registers module id', `expected ${PLUGIN_NAME}`)
  if (/require\(\s*['"]react['"]\s*\)/.test(clientSource)) pass('client.js requires react')
  else warn('client.js requires react', 'require("react") not found')
  if (/@deepseek-ai\//.test(clientSource)) {
    warn('client.js references @deepseek-ai/*', 'DESIGN 5.1 forbids importing Harness Client packages; verify it is not an import')
  } else {
    pass('client.js does not reference @deepseek-ai/*')
  }
  const namespace = /settings\.mcpWorkspaces/.test(clientSource) ? 'settings.mcpWorkspaces' : undefined
  if (namespace !== undefined) pass('client.js declares locale namespace', namespace)
  else warn('client.js declares locale namespace', 'settings.mcpWorkspaces not found')
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log('')
console.log('=== PASS ===')
for (const item of passes) console.log(`PASS  ${item.name}${item.detail === '' ? '' : ` — ${item.detail}`}`)
if (warnings.length > 0) {
  console.log('')
  console.log('=== WARN (advisory, does not fail) ===')
  for (const item of warnings) console.log(`WARN  ${item.name}${item.detail === '' ? '' : ` — ${item.detail}`}`)
}
if (failures.length > 0) {
  console.log('')
  console.log('=== FAIL ===')
  for (const item of failures) console.log(`FAIL  ${item.name}${item.detail === '' ? '' : ` — ${item.detail}`}`)
}
console.log('')
console.log(
  `Summary: ${passes.length} passed, ${warnings.length} warnings, ${failures.length} failed (${REQUIRED_FILES.length} required files checked)`,
)
process.exitCode = failures.length === 0 ? 0 : 1
