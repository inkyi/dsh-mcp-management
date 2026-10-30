# 插件提交：dsh-mcp-management

> 用于插件商城提交表单。字段与商城模板一一对应，可直接复制。

**状态：已上架** —— <https://dsh-plugin.org/plugins/inkyi/dsh-mcp-management>（Verified，Listed on 2026-10-29，
分类 Tools & Capabilities）。徽章：

```markdown
[![Listed on dsh-plugin.org](https://dsh-plugin.org/badges/listed.svg)](https://dsh-plugin.org/plugins/inkyi/dsh-mcp-management)
```

## 仓库地址

<https://github.com/inkyi/dsh-mcp-management>

## 一句话价值

让 MCP 工具跟着项目走：安装后每个工作区只挂自己需要的 MCP 服务器，会话只看得见本项目该有的 `mcp__<server>__<tool>` 工具，改配置即时生效、无需重启。

## 能力分类

集成与连接

## 安装命令

```bash
dsh plugin --profile web add @inkyi/dsh-mcp-management
```

- npm：`@inkyi/dsh-mcp-management@1.0.1`（已发布）
- 备选（跟踪仓库 main）：`dsh plugin --profile web add github:inkyi/dsh-mcp-management`

## 兼容与运行要求

- **DSH 版本**：0.2.x（`engines.dsh: ^0.2.1-rc.3`）
- **运行环境**：Node.js ≥ 22（随 DSH 自带）
- **平台**：Web 设置页，`dsh web` 与桌面客户端均可用；纯 ESM、无平台特定代码，已在 macOS 完成端到端验证
- **profile 组合**：需包含 `tools`、`loader`、`agents`、`configEditor` 及 Web 设置界面（标准 `dsh-base` + `dsh-web-app` 组合即可）
- **依赖**：无构建步骤、无 npm 依赖（Schemastery / Cosmokit 已内置在 `vendor/`）

## 许可证

MIT（内置 Schemastery 3.18.5、Cosmokit 1.8.6，均为 MIT，见 [NOTICE.md](NOTICE.md)）

## 截图 / 演示

暂无截图。真实输出示例（本机 `desktop` profile 端到端验证）：

- 设置 → MCP 管理 中为工作区添加 fixture 服务器后，会话内新增工具 `mcp__wsfixture__ping` → 返回 `pong`；
- `mcp_management { "action": "status" }` 返回当前会话工作区命中的服务器与来源（`default` / `workspace` / `file`）。

补图建议（两张）：

1. 设置 → MCP 管理：工作区列表 + 某工作区的服务器配置；
2. 会话内调用 `mcp__*` 工具的真实结果。

## 补充说明

**外部服务**：插件不内置任何服务，MCP 服务器由用户自行配置（如 JetBrains IDE 的 streamable-http 端点、`npx` 启动的 GitHub MCP），插件只负责按工作区连接、启用/停用与重挂。

**权限**：不新增网络或文件权限，不采集遥测；GUI 配置写入 profile 的用户 patch 层；`${env:NAME}` 在连接时从宿主进程环境展开，密钥不必落盘到配置文件。

**已知限制**：

- 每个会话会为该工作区各启动一份服务器连接（stdio 服务器 = 每会话一个子进程），会话多时注意资源；
- 工作区 `.dsh/mcp.json` 无文件监听，修改对新会话或保存一次配置后生效；
- 只管理本插件创建的服务器行，profile 中另行插入的 `@deepseek-ai/dsh-mcp-client` 不受控；
- 桥接默认 `failOnStartupError: false`，`status` 可能短暂显示 `connected` 而工具尚未可用（以会话内是否出现 `mcp__*` 为准）。

## 提交前自查

- [x] 仓库已公开
- [x] 已添加 GitHub topic：dsh-plugin
- [x] README 包含安装命令
- [x] 插件导出 `apply(ctx)` 模块
- [x] 仓库根目录包含 `package.json`

---

## 填写依据（自查记录）

| 项目 | 核对方式 | 结果 |
|---|---|---|
| npm 包已发布 | `registry.npmjs.org/@inkyi%2Fdsh-mcp-management` | `1.0.1`（latest） |
| 仓库公开 | GitHub API `repos/inkyi/dsh-mcp-management` | `visibility: public` |
| topic `dsh-plugin` | GitHub API `topics` | 已包含 |
| README 安装命令 | [README.zh.md](README.zh.md#L59-L63) | 已包含 |
| `apply(ctx)` 导出 | [index.js](index.js#L567) | `export async function apply(ctx, config)` |
| 根目录 `package.json` | 仓库根 | 存在，含 `dsh.manifestVersion: 1` |
