# Test suite

Offline verification for `dsh-mcp-management`. Everything here runs without a DeepSeek
Harness installation, without `npm install`, and without network access; scripts only read plugin
files and write inside `test/tmp/` (removed on exit, except the fixture call log).

Design background: [DESIGN.md](../DESIGN.md).

```bash
npm test            # static checks + pure-logic unit tests
node test/check.mjs                          # bundle/metadata/syntax checks
node --test test/unit.test.mjs               # 18 pure-logic cases (node:test)
node test/fixture-smoke.mjs                  # hand-rolled JSON-RPC client against the fixture
node test/client-registration-smoke.mjs      # browser-module registration path (no React render)
node test/sdk-connect-smoke.mjs              # optional real MCP SDK handshake (SKIP + exit 0 when absent)
```

Every script is repeatable and exits non-zero on failure.

## 1. Static checks — `check.mjs`

Validates the bundle wiring that a typo would otherwise only expose at install time:

- required files (`index.js`, `client.js`, `package.json`, `cordis.patch.yml`, locales, `icon.svg`,
  `LICENSE`, `README.md`) exist and are non-empty;
- `package.json`: name, `type: module`, MIT license, GitHub repository, semver version, exports map,
  `files` list, and the `dsh.bundle.patch` / `dsh.client` declarations;
- `cordis.patch.yml`: an `- insert:` row with `id: mcp-management` and `name: dsh-mcp-management`;
- locale dictionaries parse, carry non-empty `meta.title`/`meta.description`, and share the same key
  set across languages;
- `icon.svg` parses as SVG and is below the 256 KiB limit;
- `index.js` / `client.js` pass `node --input-type=module --check`, export the expected symbols, and
  respect the import rules (no static `@modelcontextprotocol/*`, no static `@deepseek-ai/dsh-mcp-client`,
  and the client half loads only `react`).

## 2. Pure-logic unit tests — `unit.test.mjs`

`index.js` imports its only runtime schema dependency from `vendor/`, so the plugin directory is
self-contained. The test copies `index.js` (and its relative imports) into `test/tmp/unit-runtime/`
and imports that pristine copy, so the real file is never modified. When a DeepSeek Harness
installation is reachable (`DSH_NODE_MODULES` or the usual `harness-inspection` sibling path), its
packages are linked into the copy to mirror Host resolution; this is optional.

Covered:

- merge order `defaultServers` → matching workspaces (outer → inner) → nearest `.dsh/mcp.json`,
  with the reported `source` of each entry and "last writer wins" per `serverName`;
- longest workspace-path match, and `matchSubdirectories: false` exact match;
- `enabled: false` entries are preserved for reporting but never connected;
- `${env:NAME}` expansion (including a missing-variable diagnostic) and where it is applied;
- `.dsh/mcp.json` parsing: transport inference, `disabled`, invalid entries skipped with diagnostics,
  malformed JSON reported;
- `toMcpClientConfig` stdio/http conversion.

## 3. MCP stdio fixture — `mcp-server-fixture.mjs`

A zero-dependency MCP server over line-delimited JSON-RPC 2.0: `initialize`, `tools/list`
(`ping`, `echo`), `tools/call`, and `server/discover` deliberately answering `-32601` so an
auto-negotiating SDK falls back to the legacy era. Every `tools/call` is appended as one JSON line to
`test/tmp/calls.log` (override with `MCP_FIXTURE_CALLS_LOG`). Diagnostics go to stderr only.

```bash
# manual handshake
printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2026-07-28","capabilities":{},"clientInfo":{"name":"probe","version":"0"}}}' \
  | node test/mcp-server-fixture.mjs
```

`fixture-smoke.mjs` drives it with a hand-rolled client; `sdk-connect-smoke.mjs` drives it with the
real `@modelcontextprotocol/client` 2.2.0 build (the version `@deepseek-ai/dsh-mcp-client` uses),
located through `MCP_SDK_ROOT`, a repository-local `node_modules`, or a sibling Harness checkout.

## 4. Client registration smoke — `client-registration-smoke.mjs`

Loads `client.js` with a fake `window.__ModuleLoader__` and a fake Cordis context, then asserts:

- the module id, exported `inject` list and `apply` shape;
- locale namespace `settings.mcpManagement` with identical zh/en key sets and full `t()` coverage;
- the `settings.section` registration (`id: mcp-management`, order 16, localized label, hooks/actions
  exposed through `inject()`).

React rendering itself is **not** exercised.

## 5. Using the fixture against a real installation

For a manual end-to-end check, add the fixture as a workspace's server (through the settings page or
`mcp_management`), e.g.:

```json
{
  "mcpServers": {
    "fixture": {
      "command": "node",
      "args": ["/absolute/path/to/test/mcp-server-fixture.mjs"]
    }
  }
}
```

Use the absolute path of the same Node binary that runs the Harness (a GUI-launched process may not
inherit a shell's `PATH`). After a session in that workspace starts, `mcp__fixture__ping` should
return `pong` and `test/tmp/calls.log` should gain a line. `mcp_management status` reports the
resolved source of every server.

## What this suite does not cover

- Real browser rendering/interaction of the settings page (styling, modal placement, live writes
  through `settings.describe`/`mutate`).
- A real installation's Agent lifecycle (`agent/created` awaiting, per-session tool visibility,
  live re-binding on volatile config changes). These need a running DeepSeek Harness; see
  `DESIGN.md` §8 for the end-to-end record from the development machine.
- Cross-workspace negative isolation from within one session: a subagent's `cwd` changes its tool
  working directory, not its session workspace, so it cannot produce a "different workspace" session.
