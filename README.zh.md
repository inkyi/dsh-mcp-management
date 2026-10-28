# dsh-mcp-management

> **DeepSeek Harness 的 MCP 管理插件**：让**每个工作区（项目目录）使用自己的 MCP 服务器**，并且
> 只有运行在该工作区的会话才能看到对应的 `mcp__<serverName>__<tool>` 工具。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D22-brightgreen.svg)](package.json)
[![CI](https://github.com/inkyi/dsh-mcp-management/actions/workflows/ci.yml/badge.svg)](https://github.com/inkyi/dsh-mcp-management/actions/workflows/ci.yml)

English: [README.md](README.md)

通常 MCP 服务器是全局配置的：一次配好，所有对话都能看到数据库、GitHub、JetBrains 等工具。
本插件把它们按**工作区**隔离——在 `~/work/api` 里打开的会话只看到 `~/work/api` 配置的服务器，
在 `~/work/docs` 里的会话则是另一组（或者没有）。

## 功能

1. **每个工作区独立的服务器列表**：每个工作区（项目目录）有自己的 MCP 服务器与连接参数；
   会话按自己的工作目录解析服务器，工具只对该会话可见。
2. **全局默认服务器**：`defaultServers` 会被所有工作区继承，适合常用工具。
3. **工作区内的 `.dsh/mcp.json`**：项目自带配置，可提交进 Git；文件中的服务器**优先于** GUI 配置
   （兼容 `{ "mcpServers": { ... } }` 习惯格式）。
4. **真正的设置页**：**设置 → MCP 管理** 中增删改工作区与服务器（stdio 的 command/args/env/cwd，
   streamable-http 的 url/headers，以及启停）。
5. **Agent 工具 `mcp_management`**：模型也可直接管理，支持
   `status` / `list` / `setServer` / `removeServer` / `setEnabled` / `setWorkspace`。
6. **实时生效**：服务器连接建立在各会话自己的注册作用域（`agent.ctx`）上，配置变更会实时重挂，
   无需重启 DSH；新会话在第一步之前就绪。
7. **`${env:NAME}` 展开**：`command`、`args`、`url`、`env`、`headers` 中的 `${env:VAR}` 在连接时
   从 Host 进程环境展开，密钥不必写入配置文件。

## 工作原理

```
会话工作目录 /repo/app
        │
        ▼
解析服务器集合：defaultServers  <  workspaces[path=/repo/app]  <  /repo/app/.dsh/mcp.json
        │
        ▼
把每台服务器挂到该 Agent 的作用域：agent.ctx.plugin('@deepseek-ai/dsh-mcp-client', …)
        │
        ▼
工具 mcp__<serverName>__<tool> 只存在于该会话
```

服务器连接使用官方 `@deepseek-ai/dsh-mcp-client` 桥接插件；配置写入 profile 用户 patch 层的
volatile 字段，变更时通过 `loader/volatile-update` 重新解析并重挂活会话，不重载插件本身。

## 环境要求

- 已安装的 DeepSeek Harness（`dsh` 0.2.x）及一个 profile，且组合中包含 `tools`、`loader`、
  `agents`、`configEditor` 以及 Web 设置界面（标准 `dsh-base` + `dsh-web-app` 组合即可）。
- Node.js 22+（Harness 自带）。
- 无需构建、无需 npm 依赖：插件是纯 ESM，唯一的结构依赖已内置在 `vendor/`。

## 安装

用 `dsh plugin` 把插件装进 DeepSeek Harness 的 profile（这也是 DSH 插件中心使用的命令）：

```bash
dsh plugin --profile web add @inkyi/dsh-mcp-management
```

npm 包发布之前（或想直接跟踪仓库 main），可以从 GitHub 源码安装：

```bash
dsh plugin --profile web add github:inkyi/dsh-mcp-management
```

本地克隆开发时（profile 会链接该目录，重组后重新读取）：

```bash
git clone https://github.com/inkyi/dsh-mcp-management.git
dsh plugin --profile web add link:/绝对路径/dsh-mcp-management
```

命令会把包装进 profile、追加到 `dsh.profile.bundles`，并应用包内
[`cordis.patch.yml`](cordis.patch.yml) 这一层补丁；`dsh web` 已在运行的话重启一次。桌面应用保留的
`desktop` profile 用侧栏 **插件** 页管理，会话内也可以用
`plugin_manager action=install_bundle target=...` 安装。

打开 **设置 → MCP 管理**。若导航里暂时没有这一项，刷新一次页面（客户端模块随页面加载）。

卸载：`dsh plugin --profile web remove @inkyi/dsh-mcp-management`（或会话内
`plugin_manager action=remove_bundle target=@inkyi/dsh-mcp-management`）。

## 使用

### 设置页

1. 「添加工作区」：桌面应用里直接打开系统目录选择器；在普通浏览器打开的 `dsh web` 页面里（没有窗口内选择器桥），会弹出一个页内对话框，粘贴目录绝对路径或直接从侧栏已有工作区中选择。
2. 在该工作区点「添加服务器」，例如：
   - 名称 `idea`、transport `streamable-http`、URL `http://127.0.0.1:64343/stream`，
     「启动失败即报错」关闭（IDE 不一定常开）；
   - 名称 `github`、transport `stdio`、命令 `npx`、参数 `-y @modelcontextprotocol/server-github`、
     环境变量 `GITHUB_TOKEN=${env:GITHUB_TOKEN}`。
3. 保存后对该工作区的活会话立即生效，新会话第一步前就绪。

### `.dsh/mcp.json`（可选，文件优先）

放在工作区目录下，格式与 Claude Desktop 习惯一致：

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

- 含 `url` → `streamable-http`；含 `command` → `stdio`；也可显式写 `"transport"`。
- `disabled: true` 等价于 `enabled: false`。
- 非法条目会被跳过并记录日志，不影响其它服务器。

### 配置优先级

```
全局默认服务器  defaultServers
  ↑ 覆盖
GUI 工作区服务器  workspaces[].servers（最长匹配的工作区路径优先，外层 → 内层）
  ↑ 覆盖
工作区 .dsh/mcp.json  文件优先
```

- 工作区匹配：会话的工作目录等于工作区 `path`，或（默认 `matchSubdirectories: true`）位于其子目录下；
  多个命中时路径最长的生效。
- 同名 `serverName`：后面的来源覆盖前面的来源；不同名则合并。
- `enabled: false` 的服务器保留在配置里但不会连接。

### 让 Agent 管理

```
mcp_management { "action": "status" }                       # 当前会话工作区与服务器状态
mcp_management { "action": "list" }                         # 全局默认 + 各工作区配置
mcp_management { "action": "setServer", "server": { ... } } # 当前工作区 upsert 一台服务器
mcp_management { "action": "setEnabled", "serverName": "idea", "enabled": false }
mcp_management { "action": "setWorkspace", "workspacePath": "/path", "servers": [ ... ] }
```

## 数据存放

- GUI 配置写入 profile 的用户 patch 层（`~/.dsh/profiles/<profile>/cordis.patch.yml` 的
  `mcp-management` 行），其中 `defaultServers` / `workspaces` 是 volatile 字段：修改即时生效且重启后保留。
  也可直接编辑该 YAML。
- 普通字段（`fileConfigEnabled`、`fileConfigPath`、`matchSubdirectories`）在同一行，插件重载后生效：

  ```yaml
  - id: mcp-management
    name: '@inkyi/dsh-mcp-management'
    config:
      fileConfigEnabled: true        # 是否读取 <workspace>/.dsh/mcp.json（默认 true）
      fileConfigPath: .dsh/mcp.json  # 工作区内的相对路径
      matchSubdirectories: true      # 子目录中的会话继承该工作区配置
  ```

## 已知限制

- 每个会话会为该工作区**各启动一份**服务器连接（stdio 服务器 = 每会话一个子进程）；会话很多时注意资源。
- `.dsh/mcp.json` 没有文件监听：修改对已打开的会话不自动重挂，新建会话或保存一次配置后生效。
- 桥接插件默认 `failOnStartupError: false`，初次连接失败时后台会重连，`status` 可能短暂显示
  `connected` 而工具尚不可用——以会话内是否出现 `mcp__*` 工具为准。
- 只管理 MCP 服务器；profile 里另外插入的 `@deepseek-ai/dsh-mcp-client` 行不受本插件控制。
- 设置页样式使用宿主 `--dsw-alias-*` 主题 token，随 Harness 版本可能有细微视觉差异。

## 开发

```bash
npm test            # 静态检查 + 纯逻辑单测（无需安装依赖）
npm run check       # 仅静态检查
npm run fixture     # 无依赖 MCP stdio 夹具冒烟
npm run sdk-smoke   # 可选：真实 MCP SDK 握手（不可用时自动 SKIP）
```

测试套件无需 `npm install`。覆盖矩阵与运行说明见 [test/README.md](test/README.md)；
设计契约与端到端验证记录见 [DESIGN.md](DESIGN.md)；贡献约定见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 目录

| 路径 | 说明 |
|---|---|
| `index.js` | Host 插件：配置解析、按会话挂载 MCP、`mcp_management` 工具 |
| `client.js` | Web 设置页（`settings.section`，configForms 读写） |
| `cordis.patch.yml` | Loader 行：`id: mcp-management` |
| `locale/{en,zh}.json` | 插件标题/描述（插件管理器中显示） |
| `icon.svg` | 插件图标 |
| `vendor/` | 内置的 Schemastery/Cosmokit ESM 构建（MIT，未改动逻辑） |
| `test/` | 离线夹具、单测、静态检查与冒烟脚本 |
| `DESIGN.md` | 设计文档与端到端验证记录 |

## 许可证

[MIT](LICENSE)。内置第三方代码：Schemastery 3.18.5、Cosmokit 1.8.6（均为 MIT，
Copyright © 2021-present Shigma），见 [NOTICE.md](NOTICE.md) 与 `vendor/LICENSE.*.txt`。
