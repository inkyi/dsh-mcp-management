#!/usr/bin/env node
/**
 * Offline registration smoke test for dsh-plugin-mcp-workspaces/client.js.
 *
 * Per DESIGN 5.5, when real browser rendering is unavailable we must still show
 * that the browser module parses, its registration path does not throw, and its
 * locale dictionaries have full key coverage. This script loads client.js with
 * a fake `window.__ModuleLoader__`, a minimal fake React, and a fake Cordis
 * browser context, then:
 *   1. asserts the exported module shape (`inject` + `apply`),
 *   2. runs `apply(ctx)` and asserts nothing throws,
 *   3. asserts `locale.register('settings.mcpWorkspaces', { zh, en })` happened
 *      and that zh/en leaf keys match,
 *   4. asserts the `settings.section` slot registration (id/order/locale/label),
 *   5. checks every `t("key")` reference in client.js exists in the dictionaries.
 *
 * This is NOT a render test: React components are never mounted.
 *
 * Usage: node test/client-registration-smoke.mjs
 * Exit codes: 0 = pass, 1 = fail.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const CLIENT_PATH = join(ROOT, 'client.js')
const EXPECTED_NS = 'settings.mcpWorkspaces'
const EXPECTED_ENTRY_ID = 'mcp-workspaces'

const source = readFileSync(CLIENT_PATH, 'utf8')

/** Minimal React stand-in: registration never renders components. */
const fakeReact = {
  createElement: (type, props, ...children) => ({ type, props, children }),
  Fragment: Symbol('Fragment'),
  useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
  useEffect: () => {},
  useLayoutEffect: () => {},
  useMemo: (factory) => factory(),
  useCallback: (callback) => callback,
  useRef: (initial) => ({ current: initial }),
  useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
  createContext: (initial) => ({ Provider: Symbol('Provider'), _currentValue: initial }),
  memo: (component) => component,
  forwardRef: (component) => component,
}

let loaded
const fakeWindow = {
  __ModuleLoader__: {
    load(spec) {
      loaded = spec
    },
  },
}

const previousWindow = globalThis.window
globalThis.window = fakeWindow

function fakeRequire(specifier) {
  if (specifier === 'react') return fakeReact
  throw new Error(`client.js requested an unexpected module: ${JSON.stringify(specifier)}`)
}

const disposers = []
let localeRegistration
let slotRegistration
let slotComponent

function makeFakeCtx() {
  const form = {
    getSnapshot() {
      return {
        status: 'ready',
        writable: true,
        value: { defaultServers: [], workspaces: [] },
        revision: 1,
      }
    },
    subscribe() {
      return () => {}
    },
    set() {
      return Promise.resolve(true)
    },
    unset() {
      return Promise.resolve(true)
    },
    mutate() {
      return Promise.resolve(true)
    },
  }
  const ctx = {
    effect(factory) {
      const disposer = factory()
      if (typeof disposer === 'function') disposers.push(disposer)
      return disposer
    },
    locale: {
      register(namespace, dictionaries) {
        localeRegistration = { namespace, dictionaries }
        return () => {}
      },
      bind() {
        return (key) => key
      },
    },
    configForms: {
      get(id) {
        assert.equal(id, EXPECTED_ENTRY_ID, `configForms.get must use the Host entry id, got ${JSON.stringify(id)}`)
        return form
      },
      whileServed(ids, callback) {
        assert.deepEqual(ids, [EXPECTED_ENTRY_ID])
        return callback()
      },
    },
    slots: {
      inject(name, callback) {
        assert.equal(name, 'settings.section')
        return callback()
      },
      register(spec, component) {
        slotRegistration = spec
        slotComponent = component
        return () => {}
      },
    },
    uiWorkspace: {
      pickDirectory: async () => undefined,
    },
  }
  return ctx
}

function flattenKeys(value, prefix = '', out = []) {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value)) flattenKeys(child, prefix === '' ? key : `${prefix}.${key}`, out)
  } else {
    out.push(prefix)
  }
  return out.sort()
}

try {
  assert.ok(/__ModuleLoader__\s*\.\s*load\s*\(/.test(source), 'client.js must call window.__ModuleLoader__.load(...)')

  // Execute the browser module wrapper with the fake loader.
  const load = new Function('window', 'require', 'console', source)
  load(fakeWindow, fakeRequire, console)
  assert.ok(loaded !== undefined, 'window.__ModuleLoader__.load was not called')

  assert.equal(loaded.id, 'dsh-plugin-mcp-workspaces', 'module id mismatch')
  assert.equal(typeof loaded.factory, 'function', 'module factory missing')
  const moduleExports = loaded.factory(fakeRequire)
  assert.equal(typeof moduleExports.apply, 'function', 'module must export apply()')
  assert.deepEqual(
    moduleExports.inject,
    ['slots', 'locale', 'configForms', 'uiWorkspace'],
    'module inject list mismatch',
  )

  // Run the registration path with a fake Cordis browser context.
  const ctx = makeFakeCtx()
  moduleExports.apply(ctx)

  // 1. Locale dictionaries registered with design-fixed namespace + full parity.
  assert.ok(localeRegistration !== undefined, 'locale.register() was not called')
  assert.equal(localeRegistration.namespace, EXPECTED_NS)
  assert.equal(typeof localeRegistration.dictionaries.zh, 'object')
  assert.equal(typeof localeRegistration.dictionaries.en, 'object')
  const enKeys = flattenKeys(localeRegistration.dictionaries.en)
  const zhKeys = flattenKeys(localeRegistration.dictionaries.zh)
  assert.deepEqual(zhKeys, enKeys, `zh/en locale keys differ: only-en=${JSON.stringify(enKeys.filter((key) => !zhKeys.includes(key)))}, only-zh=${JSON.stringify(zhKeys.filter((key) => !enKeys.includes(key)))}`)

  // 2. Slot registration.
  assert.ok(slotRegistration !== undefined, 'slots.register() was not called')
  assert.equal(slotRegistration.name, 'settings.section')
  assert.equal(slotRegistration.id, EXPECTED_ENTRY_ID)
  assert.equal(slotRegistration.order, 16)
  assert.equal(slotRegistration.locale, EXPECTED_NS)
  assert.equal(typeof slotRegistration.label, 'function')
  assert.equal(slotRegistration.label(), 'title', 'slot label must be t("title")')
  assert.equal(typeof slotComponent, 'function', 'slot occupant must be a React component function')
  assert.equal(typeof slotRegistration.inject, 'function')
  const injected = slotRegistration.inject()
  assert.ok(injected !== null && typeof injected === 'object', 'slot inject() must return props')
  assert.ok(injected.hooks?.mcpWorkspaces !== undefined, 'slot props must expose hooks.mcpWorkspaces store')
  assert.equal(typeof injected.hooks.mcpWorkspaces.getSnapshot, 'function')
  assert.equal(typeof injected.hooks.mcpWorkspaces.subscribe, 'function')
  assert.equal(injected.hooks.mcpWorkspaces.getSnapshot().status, 'ready')
  for (const action of ['saveServer', 'removeServer', 'setServerEnabled', 'addWorkspace', 'removeWorkspace', 'renameWorkspace', 'clearError']) {
    assert.equal(typeof injected[action], 'function', `slot inject() must expose action ${action}`)
  }

  // 3. Every t("key") literal in client.js must exist in both dictionaries.
  const tKeyPattern = /\bt\(\s*"([^"]+)"\s*\)/g
  const usedKeys = new Set()
  let match
  while ((match = tKeyPattern.exec(source)) !== null) usedKeys.add(match[1])
  const missingEn = [...usedKeys].filter((key) => !enKeys.includes(key)).sort()
  const missingZh = [...usedKeys].filter((key) => !zhKeys.includes(key)).sort()
  assert.deepEqual(missingEn, [], `t() keys missing from en dictionary: ${JSON.stringify(missingEn)}`)
  assert.deepEqual(missingZh, [], `t() keys missing from zh dictionary: ${JSON.stringify(missingZh)}`)

  // 4. Disposers returned by apply's effects must be callable without throwing.
  for (const disposer of disposers) disposer()

  console.log(JSON.stringify({
    ok: true,
    moduleId: loaded.id,
    inject: moduleExports.inject,
    localeNamespace: localeRegistration.namespace,
    localeLeafKeys: enKeys.length,
    slot: {
      name: slotRegistration.name,
      id: slotRegistration.id,
      order: slotRegistration.order,
      locale: slotRegistration.locale,
      label: slotRegistration.label(),
      component: typeof slotComponent,
      hookStore: 'hooks.mcpWorkspaces',
      actions: Object.keys(injected).filter((key) => key !== 'hooks'),
    },
    tKeysChecked: usedKeys.size,
    note: 'registration path only — React components were not rendered',
  }, null, 2))
} finally {
  if (previousWindow === undefined) delete globalThis.window
  else globalThis.window = previousWindow
}
