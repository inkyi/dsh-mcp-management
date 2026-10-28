# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] — 2026-10-28

Initial release.

### Added

- Per-workspace MCP server configuration: each workspace (project directory) has its own server
  list; a session only receives the MCP tools of the workspace it runs in.
- Global default servers inherited by every workspace.
- Workspace-local `.dsh/mcp.json` support (file entries override the GUI-managed list; the format
  follows the familiar `mcpServers` shape and can be committed to the repository).
- Web settings page **Settings → MCP Management** with full server editing (stdio and
  streamable-http), enable/disable, workspace add/remove and rename.
- Agent tool `mcp_workspaces` (`status` / `list` / `setServer` / `removeServer` / `setEnabled` /
  `setWorkspace`) sharing the same configuration storage as the settings page.
- `${env:NAME}` expansion for `command`, `args`, `url`, `env` and `headers`, so secrets can stay in
  the Host environment.
- Live re-binding on configuration change: MCP servers are mounted on each Agent's registration
  scope and updated without restarting the Harness.
- Offline verification suite: static checks, pure-logic unit tests, a dependency-free stdio MCP
  fixture, fixture/client-registration smokes, and an optional real-SDK handshake smoke.

### Notes

- The plugin vendors Schemastery/Cosmokit (MIT) under `vendor/`, because a profile-linked bundle is
  imported from its own directory where the Harness installation's packages are not resolvable
  through plain Node resolution.
