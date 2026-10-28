# dsh-mcp-management

> **MCP Management for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)** — give
> every workspace (project directory) its own MCP servers, and only expose those tools to sessions
> running in that workspace.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D22-brightgreen.svg)](package.json)
[![CI](https://github.com/inkyi/dsh-mcp-management/actions/workflows/ci.yml/badge.svg)](https://github.com/inkyi/dsh-mcp-management/actions/workflows/ci.yml)

中文说明：[README.zh.md](README.zh.md)

MCP servers are usually configured once for the whole application, so a database tool, a GitHub
tool and a JetBrains tool are all visible in every conversation. This plugin scopes them to the
**workspace**: a session that runs in `~/work/api` sees the servers configured for `~/work/api`,
while a session in `~/work/docs` sees a different set — or none at all.

## Features

- **Per-workspace server lists.** Every workspace has its own server definitions; sessions receive
  only the servers of the workspace that contains the session's working directory.
- **Global defaults.** Optional `defaultServers` are inherited by every workspace (handy for tools
  you always want).
- **`<workspace>/.dsh/mcp.json`.** Project-local configuration that can be committed to the
  repository. File entries take precedence over the GUI-managed list; the familiar
  `{ "mcpServers": { ... } }` shape is supported.
- **A real settings page.** *Settings → MCP Management* edits workspaces and servers in place
  (stdio command/args/env/cwd, streamable-http URL/headers, enable/disable).
- **An agent tool.** `mcp_management` lets the model inspect and manage the mapping
  (`status`, `list`, `setServer`, `removeServer`, `setEnabled`, `setWorkspace`).
- **Live updates.** Servers are mounted on each Agent's own registration scope (`agent.ctx`), so
  tools appear and disappear per session as configuration changes — no restart needed.
- **Secret-friendly.** `${env:NAME}` inside `command`, `args`, `url`, `env` and `headers` is expanded
  from the Host environment when connecting; secrets never need to be written into configuration.

## How it works

```
session works in /repo/app
        │
        ▼
  resolve server set:  defaultServers  <  workspaces[path=/repo/app]  <  /repo/app/.dsh/mcp.json
        │
        ▼
  mount each server on THIS Agent's scope:  agent.ctx.plugin('@deepseek-ai/dsh-mcp-client', …)
        │
        ▼
  tools mcp__<serverName>__<tool> exist only for this session
```

The plugin resolves the server list from the session's recorded working directory (the workspace
identity), connects the configured servers through the official `@deepseek-ai/dsh-mcp-client`
bridge, and mounts each instance on that Agent's context so the resulting tools are scoped to it.
Configuration changes commit to the profile's user patch layer as volatile config fields, which
re-bind live Agents without reloading the plugin.

## Requirements

- An installed DeepSeek Harness (`dsh` 0.2.x) with a profile whose composition provides `tools`,
  `loader`, `agents`, `configEditor`, and the Web settings surface (the standard `dsh-base` +
  `dsh-web-app` composition does).
- Node.js 22+ (bundled with the Harness).
- No build step and no npm dependencies: the plugin is plain ESM, and its one schema dependency is
  vendored under `vendor/`.

## Install

1. Clone this repository somewhere stable:

   ```bash
   git clone https://github.com/inkyi/dsh-mcp-management.git
   ```

2. From a DeepSeek Harness session, install the directory as a bundle (the Harness links it into the
   active profile and recomposes):

   ```
   plugin_manager action=install_bundle target=/absolute/path/to/dsh-mcp-management
   ```

   That is the only install mechanism; do not copy files into `~/.dsh` by hand.

3. Open **Settings → MCP Management**. If the navigation entry is missing, refresh the page once
   (the client half is loaded with the page).

Uninstall with `plugin_manager action=remove_bundle target=dsh-mcp-management`.

## Usage

### Settings page

1. **Add workspace**. In the desktop app this opens the native chooser; in a plain browser (the
   `dsh web` page, which has no in-window chooser bridge) it opens an in-page dialog where you
   paste an absolute directory path or pick a workspace already registered in the sidebar.
2. **Add server** inside that workspace, for example:
   - name `idea`, transport `streamable-http`, URL `http://127.0.0.1:64343/stream`,
     *fail on startup error* off (the IDE is not always running);
   - name `github`, transport `stdio`, command `npx`, args `-y @modelcontextprotocol/server-github`,
     env `GITHUB_TOKEN=${env:GITHUB_TOKEN}`.
3. Changes apply to live sessions of that workspace immediately; new sessions are ready before their
   first step.

### `<workspace>/.dsh/mcp.json` (optional, takes precedence)

```json
{
  "mcpServers": {
    "idea": {
      "url": "http://127.0.0.1:64343/stream",
      "failOnStartupError": false
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": { "GITHUB_TOKEN": "${env:GITHUB_TOKEN}" }
    },
    "disabled-example": {
      "command": "node",
      "args": ["server.mjs"],
      "disabled": true
    }
  }
}
```

A `url` selects `streamable-http`, a `command` selects `stdio`; `transport` may be set explicitly.
`disabled: true` means "configured but not connected". Invalid entries are skipped and logged, and
do not affect the other servers.

### Precedence

```
defaultServers  <  workspaces[].servers (longest matching path wins, outer → inner)  <  .dsh/mcp.json
```

Server identity is `serverName`; a later source overrides an earlier entry with the same name and
adds the rest. `enabled: false` entries stay configured but are not connected.

### Agent tool

```
mcp_management { "action": "status" }                       # this session's workspace, file config, servers
mcp_management { "action": "list" }                         # defaults + all workspace entries
mcp_management { "action": "setServer", "server": { … } }   # upsert one server in the current workspace
mcp_management { "action": "setEnabled", "serverName": "idea", "enabled": false }
mcp_management { "action": "setWorkspace", "workspacePath": "/path", "servers": [ … ] }
```

## Configuration storage

GUI-managed values are written to the active profile's user patch layer
(`~/.dsh/profiles/<profile>/cordis.patch.yml`) in the `mcp-management` row, as the volatile fields
`defaultServers` and `workspaces`. You can also edit that YAML directly; volatile fields apply
without restarting.

Ordinary fields (`fileConfigEnabled`, `fileConfigPath`, `matchSubdirectories`) live in the same row
and take effect on the next plugin reload:

```yaml
- id: mcp-management
  name: 'dsh-mcp-management'
  config:
    fileConfigEnabled: true        # read <workspace>/.dsh/mcp.json (default true)
    fileConfigPath: .dsh/mcp.json  # location inside the workspace
    matchSubdirectories: true      # a session in a subdirectory inherits the workspace config
```

## Limitations

- Each session opens its own connections for its workspace's servers (a stdio server is one child
  process per session). Many concurrent sessions can be resource-heavy by design.
- `.dsh/mcp.json` is not watched: edits apply to new sessions, or after a configuration save
  triggers a re-bind.
- With the bridge's default `failOnStartupError: false`, a failing server keeps reconnecting in the
  background; `status` can briefly report `connected` before the tools are actually usable. Treat
  the presence of `mcp__<name>__*` tools as the source of truth.
- Only MCP servers are managed. `@deepseek-ai/dsh-mcp-client` rows configured elsewhere in the
  profile are unaffected.
- Settings-page styling uses the host's `--dsw-alias-*` theme tokens; fine visual details (focus
  rings, modal placement) may differ slightly between Harness versions.

## Development

```bash
npm test            # static bundle checks + pure-logic unit tests (no dependencies)
npm run check       # static checks only
npm run fixture     # dependency-free MCP stdio fixture smoke
npm run sdk-smoke   # optional real MCP SDK handshake (skips if unavailable)
```

The suite never needs `npm install`. See [test/README.md](test/README.md) for the coverage matrix
and [CONTRIBUTING.md](CONTRIBUTING.md) for the ground rules. The design and the end-to-end
verification record live in [DESIGN.md](DESIGN.md).

## License

[MIT](LICENSE). Vendored third-party code: Schemastery 3.18.5 and Cosmokit 1.8.6 (both MIT,
Copyright © 2021-present Shigma) — see `vendor/LICENSE.*.txt`.
