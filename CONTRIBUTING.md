# Contributing

Thanks for taking a look! This is a small, dependency-free DeepSeek Harness plugin; contributions
that keep it small and predictable are very welcome.

## Ground rules

- **Plain ESM, no build step.** `index.js` runs on the Host (Node) and `client.js` runs in the
  browser module loader. Do not introduce bundlers, TypeScript, or a compile step for the shipped
  files.
- **No new runtime dependencies.** The plugin uses Node built-ins plus the vendored Schemastery
  copy under `vendor/`. The MCP client bridge is loaded by the Host from the DSH installation, never
  imported directly.
- **Stay inside the documented extension points.** Host: Cordis services and events
  (`agent/created`, `agent/disposed`, `loader/volatile-update`, `ctx.tools`, `ctx.configEditor`,
  `ctx.loader`). Client: `settings.section` slot, `configForms`, and the locale service. Do not
  import other Harness client packages, and style with the `--dsw-alias-*` theme tokens.
- **Never let MCP failures break a session.** A broken server may only mark itself failed; it must
  not throw out of `agent/created`.
- Keep settings schema fields that the UI edits **volatile**; ordinary fields trigger a plugin reload.

## Development loop

```bash
npm test          # static checks + unit tests
npm run fixture   # MCP stdio fixture smoke
npm run sdk-smoke # optional, real MCP SDK handshake (skips when unavailable)
```

To try the plugin inside a DeepSeek Harness profile, install this directory as a bundle
(`plugin_manager install_bundle` with the absolute path from inside a DSH session). Edits are picked
up after the profile recomposes (for example, after saving a setting), because a linked package is
re-read on recomposition.

## Pull requests

- Keep a change scoped, and say what you verified (offline suite and/or a real installation).
- Update `README.md` (and `README.zh.md` when you touch user-facing text) and `CHANGELOG.md`.
- `node test/check.mjs` must stay green: 0 failures, and preferably 0 warnings.
- UI changes: describe what you saw in the Web UI; a screenshot is ideal, since the offline suite
  cannot render React.
