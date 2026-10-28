# 设计契约：MCP 管理（按工作区管理 MCP，dsh-mcp-management）

> 本文件是本次开发的唯一契约来源。Host 端（`index.js`）、Client 端（`client.js`）与验证（`test/`）
> 必须按此实现；如需变更契约，先修改本文件并在 PR 中说明。

## 1. 目标与用户选择

用户选择（已确认）：

- **管理模式**：每个工作区独立配置 MCP 服务器（各自的连接参数），另设「全局默认服务器」作为兜底。
- **存储**：两者都支持 —— GUI 管理的配置持久化在 DSH profile（插件 entry 的 volatile config），
  工作区内的 `.dsh/mcp.json` 文件可覆盖/追加（**文件优先**）。

行为：一个会话（Agent）启动时，按它的工作目录解析出应使用的 MCP 服务器集合，只把这些服务器
连接到**该 Agent 的 scoped context**，因此工具 `mcp__<serverName>__<tool>` 只对该会话可见。

## 2. 包与文件所有权

仓库根目录即插件目录（`package.json` 声明 `dsh.bundle.patch`）。

| 文件 | 说明 |
|---|---|
| `package.json` / `cordis.patch.yml` / `locale/*.json` / `icon.svg` | 包清单、Loader 行、插件管理器显示元数据、图标 |
| `index.js` | Host 插件（Loader entry 的 Node 端） |
| `client.js` | Web 设置页（浏览器端模块） |
| `vendor/` | 内置的 Schemastery/Cosmokit ESM 构建（MIT） |
| `NOTICE.md` | 内置第三方代码的许可声明（`LICENSE` 保持纯 MIT 文本，便于 GitHub 识别） |
| `test/` | 离线夹具、单测、静态检查与冒烟脚本 |
| `DESIGN.md` | 本设计文档 |

已固定的标识：

- 包名（npm 发布名）：`@inkyi/dsh-mcp-management`；GitHub 仓库名仍为 `dsh-mcp-management`
- `package.json` 清单元数据：`dsh.manifestVersion: 1`、`dsh.bundle.patch`、`dsh.client`、
  `engines.dsh`、`exports["./package.json"]`、顶层 `icon` 字段
- Loader entry id：`mcp-management`（设置页通过这个 id 读写 config）
- 设置页 slot：`settings.section`，注册 id `mcp-management`，order `16`
- 设置页 locale namespace：`settings.mcpManagement`
- Agent 工具名：`mcp_management`
- 无构建步骤、无新增 npm 依赖；Host/Client 都是手写 ESM/浏览器 JS。

## 3. 配置 Schema（Host `index.js` 导出，Client 依赖它投影出的 volatile 字段）

```js
import z from '@deepseek-ai/schemastery'

const ServerConfig = z.object({
  serverName: z.string().required(),          // [A-Za-z0-9_-]{1,32}
  transport: z.string().default('stdio'),     // 'stdio' | 'streamable-http'（代码里再校验）
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
  path: z.string().required(),                // 绝对目录
  title: z.string().default(''),              // 仅展示用
  servers: z.array(ServerConfig).default([]),
})

export const Config = z.object({
  defaultServers: z.array(ServerConfig).default([]).volatile(),
  workspaces: z.array(WorkspaceConfig).default([]).volatile(),
  fileConfigEnabled: z.boolean().default(true),      // 普通字段（YAML 配置）
  fileConfigPath: z.string().default('.dsh/mcp.json'),
  matchSubdirectories: z.boolean().default(true),
})
```

注意：

- `defaultServers` 与 `workspaces` **必须 volatile**：设置页只能编辑 volatile 字段，且 volatile 变更
  不重启插件（Host 通过 `ctx.on('loader/volatile-update', ...)` 收到变更路径，随后重新绑定活 Agent）。
- 插件 `apply(ctx, config)` 中这两个字段是 **ref 对象**：用 `config.defaultServers.get()` /
  `config.workspaces.get()` 读取（参见 `@deepseek-ai/dsh-agent-default-model` 的用法）。
- 其余字段是普通值；改动它们会触发插件正常 reload（可接受）。
- `cordis.patch.yml` 里 `config: {}`，默认值由 schema 补齐。

## 4. Host 行为（index.js）

### 4.1 纯逻辑（必须可离线测试，放在文件底部具名导出）

```js
// 合并顺序：defaultServers < workspaces 命中项（外层→内层）< .dsh/mcp.json
export function resolveServers({ defaults, workspaces, fileServers }) -> Resolution
export function parseMcpFile(text) -> { servers: ServerConfig[] } | throws
```

- `resolveServers`：返回有序数组 `[{ serverName, source, server }]`，同 `serverName` 后来者覆盖前者
  （`source`: `'default'`、`'workspace:<path>'`、`'file:<path>'`）；保留 `enabled: false` 的项，
  由调用方过滤（工具/状态里要能报告被禁用的项）。
- 工作区命中：把会话目录 `canonical(dir)` 与每个 `workspaces[].path` 比较；`path` 相等或
  （`matchSubdirectories` 为真时）会话目录位于其下即命中；多个命中时**最长 path 优先**且按长度升序
  依次叠加（内层覆盖外层）。
- 文件配置：从命中工作区根（无命中时用会话目录）向上查找到该根为止（含根）的
  `<dir>/<fileConfigPath>`；取**最近**存在的文件。文件格式：
  ```json
  { "mcpServers": { "github": { "command": "npx", "args": [], "env": {}, "disabled": false } } }
  ```
  每个条目：`command`/`args`/`env`/`cwd` 为 stdio；含 `url` 时为 `streamable-http`
  （`headers`）；支持 `disabled: true`（→ `enabled:false`）；`failOnStartupError` 可选；
  `transport` 显式给出时优先。`serverName` 用对象的键。文件里解析失败的条目要跳过并记入诊断，
  不能整体失败。
- `${env:NAME}` 展开：`env` 的值、`headers` 的值、`command`、`args[]`、`url` 中出现时替换为
  `process.env[NAME]`；变量缺失时保留原文并在诊断里记录（连接可能因此失败，但不阻断其它服务器）。
- `canonical(dir)`：`fs.promises.realpath(dir)`，失败时 `path.resolve(dir)`。

### 4.2 会话绑定（核心）

- 监听 `ctx.on('agent/created', async ({ agent }) => { ... })`（serial，会被 await；新会话第一步前
  工具就绪）。
- 取会话目录：`agent.session.header.cwd`（字符串）；为空的 Agent 跳过（记录 `no-cwd`）。
- 解析服务器列表 → 过滤 `enabled !== false` → 若无服务器则不挂载。
- 挂载：先用 `ctx.loader.import('@deepseek-ai/dsh-mcp-client')` 取得模块命名空间（**缓存**结果，
  失败的 import 也要缓存错误避免重试风暴），再逐个：
  ```js
  const config = toMcpClientConfig(server)     // 只保留 mcp-client Config 认识的字段
  const fiber = agent.ctx.plugin(mcpClientPlugin, config)
  await fiber                                  // 等它激活；失败 catch 记录，不抛出
  ```
  `toMcpClientConfig`：stdio → `{transport:'stdio', serverName, command, args, env, cwd,
  failOnStartupError}`；http → `{transport:'streamable-http', serverName, url, headers,
  failOnStartupError}`。去掉空字符串/空对象可省则省（`cwd: ''` 可传，mcp-client 默认即 `''`）。
- 每个 Agent 记录：`{ sessionId, dir, matchedWorkspace, entries: [{serverName, source, state, error}] }`，
  `state` ∈ `'connected' | 'failed'`。供工具 `status` 使用。
- 释放：在 `ctx.effect` 中保存返回的清理函数（按 sessionId 存）；同时监听 `ctx.on('agent/disposed')`
  释放该 Agent 的 fiber（`fiber.dispose()`；agent.ctx 销毁也会自动释放，两处都做，幂等）。
  插件卸载时要释放所有仍挂着的 fiber（避免遗留 scoped 注册）。
- volatile 变更（`ctx.on('loader/volatile-update', (paths) => ...)`）：重新解析所有活 Agent
  （`ctx.agents.list()` 或自己维护的映射），对集合/参数变化的 Agent 先全部 dispose 再挂载。
  简化实现允许：受影响 Agent 全量重挂；无关 Agent 不动。
- 插件加载时可能已有活 Agent（HMR 重载/晚安装）：`apply` 中遍历 `ctx.agents.list()` 补挂（需在
  `inject: ['tools','loader','agents']` 之后；`agents` 不存在则跳过）。
- 健壮性：任何单个服务器连接失败只能影响该服务器，不能抛出到 `agent/created` 之外（否则会话创建
  失败）。日志用 `ctx.logger`。

### 4.3 Agent 工具 `mcp_management`

用**原始 JSON Schema** 定义（与 MCP client 的注册形态一致），`ctx.tools.register({...})`：

```js
{
  name: 'mcp_management',
  description:
    'Inspect and manage the MCP servers used by workspaces. Workspace-scoped MCP tools are visible only to sessions running in that workspace.',
  parameters: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['status', 'list', 'setServer', 'removeServer', 'setEnabled', 'setWorkspace'] },
      workspacePath: { type: 'string', description: '绝对目录；缺省用当前会话的工作目录' },
      title: { type: 'string' },
      server: { type: 'object', description: 'action=setServer 时的完整服务器配置' },
      serverName: { type: 'string' },
      enabled: { type: 'boolean' },
    },
    required: ['action'],
    additionalProperties: false,
  },
  output: { schema: { type: 'object', properties: {}, additionalProperties: true },
            render(_a, value) { return [{ type: 'text', text: JSON.stringify(value, null, 2) }] } },
  async execute(args, exec) { /* exec.agent 可用 */ },
}
```

- `status`（默认）：`{ cwd, workspace: {path,title}|null, fileConfig: {path,exists}|null,
  servers: [{serverName, source, state, error}] }`。
- `list`：`{ defaults: [...], workspaces: [{path,title,servers:[...]}] }`（读 config）。
- `setServer`：在 `workspacePath`（缺省当前会话目录）对应的工作区条目里按 `serverName` upsert
  `args.server`；无该工作区条目则新建（title 缺省取目录名）。
- `removeServer`、`setEnabled`、`setWorkspace`（整条工作区替换/删除：`servers` 省略则删除，
  `title` 可改）。
- **写入路径**：`ctx.configEditor`（`inject` 里加 `configEditor`）。找到自己的 entry：
  `ctx.configEditor.entries().find(e => e.options.id === 'mcp-management')`，调用
  `await ctx.configEditor.edit(entry, (current) => ({ ...current, workspaces: next }))`。
  `current` 是 raw config；`workspaces` 是整个数组的替换。写后无需手动重挂：volatile 事件会触发。
  `configEditor` 不存在时工具要返回明确错误 `"configEditor service is unavailable in this profile"`。
- 错误以 `throw new Error(...)`（工具失败）或返回 `{ ok: false, error }` 表达；不要静默。
- 只在 `workspacePath` 缺省时用 `exec.agent.session.header.cwd`；若两者都没有 → 明确报错。

### 4.4 生命周期与注入

```js
export const inject = ['tools', 'loader']   // agents/configEditor 用 ctx.inject([...]) 可选注入
export const name = 'mcp-management'
export const Config = ...
export async function apply(ctx, config) { ... }
```

- `configEditor`/`agents` 用 `ctx.inject(['configEditor'], (c) => {...})` 可选包裹，缺失时功能降级
  （工具返回明确错误、不遍历已活 Agent），插件本身仍加载。
- 所有注册（事件、工具、fiber）都放进 `ctx.effect(...)` 并由 cleanup 释放。

## 5. Client 设置页（client.js）

参考实现（**必读**）：`harness-inspection/current-full/dsh/node_modules/@deepseek-ai/dsh-client-ui-settings-web-search/lib/client.js`
（configForms + volatile namespace 设置页的官方写法），以及
`harness-inspection/current-full/dsh/node_modules/@deepseek-ai/dsh-client-ui-settings/lib/client.js`
（`ConfigForms` / `ConfigFormController` 的真实 API）。

### 5.1 模块形态

```js
window.__ModuleLoader__.load({
  id: '@inkyi/dsh-mcp-management',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    // ... 组件与控制器 ...
    return {
      inject: ['slots', 'locale', 'configForms', 'uiWorkspace'],
      apply(ctx) { ... },
    }
  },
})
```

- 不得 import 任何 Harness Client 包（`@deepseek-ai/dsh-client-ui-primitives` 等）；只用 `react`。
- 组件样式用内联 style + `<style>` React 元素（组件卸载即移除），只用主题 token
  （`--dsw-alias-*`，见 Theme 快照：bg-base / bg-layer-1 / bg-layer-2 / border-l1 / border-l2 /
  label-primary / label-secondary / brand-primary / state-error-primary / state-success-primary /
  state-warn-primary / state-idle-primary）。

### 5.2 注册

```js
const NS = 'settings.mcpManagement'
const form = ctx.configForms.get('mcp-management')     // 我们 Host entry 的 config 表单

ctx.effect(() => ctx.locale.register(NS, { zh, en }))
ctx.effect(() => ctx.configForms.whileServed(['mcp-management'], () =>
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'mcp-management',
    order: 16,
    label: () => t('title'),
    locale: NS,
    inject: () => ({ hooks: { mcpManagement: controller.store }, /* actions */ ... }),
  }, Page))))
```

- `whileServed(['mcp-management'])`：Host 不 serve 该 namespace（例如插件被禁用）时不显示页面。
- 组件收到的 props：`t`（locale bound）、`hooks` 里的 `useXxx`（如 `props.useMcpWorkspaces(sel)`）、
  inject 返回的其它键、slot owner props（`close`）与标准 props。具体以官方示例为准。
- `controller.store` 必须是 `createSnapshotStore` 风格的 `{getSnapshot, subscribe}`；不要在组件里
  直接持有 ctx。

### 5.3 configForms API（以 ui-settings/lib/client.js 为准）

- `form.getSnapshot()` → `{ status, value, base, user, revision, writable }`；`value` 是本 entry 的
  volatile 字段投影，即 `{ defaultServers: ServerConfig[], workspaces: WorkspaceConfig[] }`。
- `form.subscribe(listener)`；`form.set(field, value)`（JSON 值，如整个数组）、`form.unset(field)`、
  `form.mutate(ops)`；返回 `Promise<boolean>`（Host 是否接受）。
- **写入策略**：本地先算出新的 `defaultServers` / `workspaces` 数组，再 `await form.set(field, next)`；
  失败时展示错误（`status==='unavailable'` / `!writable` 时禁用编辑）。
- 不做「草稿+保存」也可以：每次增删改立即写入并提示结果。避免并发写冲突：串行化（一次一个在途）。

### 5.4 页面内容（MVP）

标题「MCP 管理」+ 一句说明（每个工作区独立；会话只看到本工作区启用的服务器；`.dsh/mcp.json` 文件优先）。

1. **全局默认服务器**（`defaultServers`）：服务器行卡片，显示 `serverName`、transport 摘要
   （`stdio: command + args` 或 `HTTP: url`）、启用开关、编辑、删除；「添加默认服务器」。
2. **工作区**（`workspaces`）：每项显示 title/path、服务器行（同上）、「添加服务器」、「移除工作区」、
   重命名（title 输入）。「添加工作区」按钮 → `await ctx.uiWorkspace.pickDirectory()`，用户选目录后
   新增 `{ path, title: basename, servers: [] }`。
3. **服务器编辑器**：模态对话框/行内表单，字段：`serverName`（必填，校验 `[A-Za-z0-9_-]{1,32}`）、
   transport（stdio / streamable-http 切换）、stdio 的 `command`、`args`（每行一个）、`env`
   （每行 `KEY=VALUE`）、`cwd`；http 的 `url`、`headers`（每行 `Key: Value`）；`enabled`、
   `failOnStartupError`。保存时构造完整 ServerConfig（未用字段给默认值）。
   支持 `${env:NAME}` 提示文案。
4. 空状态、保存失败、只读（`writable === false`）文案齐全；全部文案走 locale（zh + en）。
5. 组件要防御：数据缺失（`status !== 'ready'`）时显示加载/不可用，不崩溃；任何副作用在
   `apply` 的 effect 中注册并清理（组件内 `<style>` 由 React 卸载清理）。

### 5.5 页面可用性要求

- 挂载后 slot 注册可见（`cordis_inspect_query Slots.listSubTree root=settings.section` 能看到
  `mcp-management` occupant）。
- 浏览器控制不可用时，至少保证：模块语法可解析、注册代码路径无 throw、locale 字典 key 全覆盖。

## 6. 验证

- **离线（`npm test` 与 `test/` 脚本）**：
  1. `node --input-type=module --check < index.js/client.js` 语法检查。
  2. 纯逻辑单测（`node --test test/unit.test.mjs`）：`resolveServers` / `parseMcpFile` /
     `toMcpClientConfig` / `expandEnvRefs`，覆盖默认→工作区→文件覆盖、最长前缀、`${env:}` 展开、
     非法条目跳过。
  3. 静态检查（`test/check.mjs`）、MCP stdio 夹具冒烟、浏览器模块注册冒烟，以及可选的
     真实 MCP SDK 握手冒烟。
- **端到端（真实安装）**：`plugin_manager install_bundle` → `Config.listConfigs` 看 entry 生效 →
  用测试 MCP 服务器（`test/mcp-server-fixture.mjs`）配置到某个工作区 → 新建会话验证
  `mcp__<name>__<tool>` 可用 → `mcp_management status` 工具可用 → 设置页 slot occupant 存在。
- 页面视觉渲染无法截图时，报告「渲染未验证」，不得声称视觉成功。

## 7. 风险与约束（务必遵守）

1. `ctx.loader.import('@deepseek-ai/dsh-mcp-client')` 是唯一导入该插件的方式（不要写进
   package.json 依赖、不要 import `@modelcontextprotocol/*`）。
2. 挂载点是 `agent.ctx.plugin(module, config)`；这是官方支持的 agent-scoped 用法（mcp-client 的
   serverName 预留按 scope 隔离）。
3. 不要写 profile 文件、不要跑 pnpm、不要改 `~/.dsh`。
4. 会话日志是唯一真实来源：不要把「当前连接状态」当持久状态；本次不新增 session event 类型。
5. 不要在 `agent/created` 里抛错；MCP 服务器故障不应阻断会话。
6. 不要为了预览另建 HTML/mock；本插件必须作为真实 bundle 安装验证。

## 8. 实现与端到端验证记录（2026-10-28）

### 开发过程中的契约变更

1. **schemastery 改为内置（vendor）**：`index.js` 不再 `import '@deepseek-ai/schemastery'`，改为
   `import './vendor/schemastery.mjs'`（连同 `vendor/cosmokit.mjs`，MIT 许可证文件一并保留，逻辑未
   改动，只把 import 指向本地文件）。原因：profile 安装的 bundle 从其源目录被 Node 直接 import，
   dsh 安装目录中的包无法通过裸 specifier 解析（首次 `install_bundle` 报
   `ERR_MODULE_NOT_FOUND: Cannot find package '@deepseek-ai/schemastery'`）。JSON Schema 与
   volatile 引用协议跨副本兼容（`Symbol.for` 全局符号 + `toJSON()` 往返）。
2. **工具 schema 增补 `servers`（array）**：供 `setWorkspace` 一次性替换整条工作区的服务器列表
   （实现原本已支持 `args.servers`，原契约漏声明；省略 `servers` 仍表示删除该工作区条目）。
3. `package.json` 的 `files` 增加 `vendor/*.mjs` 与 `vendor/LICENSE*.txt`。
4. **显示名称改为「MCP 管理」（英文 MCP Management）**：更新 `locale/{zh,en}.json` 的
   `meta.title`、`client.js` 字典的 `title`、README/DESIGN 标题与设置路径引用；当时内部标识
   保持不变（当时 entry id 仍为 `mcp-workspaces`、Agent 工具名仍为 `mcp_workspaces`）。
5. **二次改名：`dsh-plugin-mcp-management` → `dsh-mcp-management`（全套同步）**：
   - 包名、client 模块 id（浏览器模块身份 = package name）、Loader entry id
     `mcp-workspaces` → `mcp-management`、Agent 工具名 `mcp_workspaces` → `mcp_management`、
     设置页 locale namespace `settings.mcpWorkspaces` → `settings.mcpManagement`、slot hook 名
     `mcpWorkspaces` → `mcpManagement`、日志前缀 `[mcp-workspaces]` 一并更新。
   - `desktop` / `web` 两个 profile 的 patch 行 id/name、`package.json` 依赖与
     `dsh.profile.bundles` 选择、`node_modules` 软链同步迁移；现有工作区配置
     （`path` / `title` / `servers`）原样保留。
   - 配置**数据字段名** `defaultServers` / `workspaces` / `fileConfigEnabled` /
     `fileConfigPath` / `matchSubdirectories` 保持不变：它们描述数据而非插件标识，改名只会
     增加迁移风险。

### 端到端结果（本机 `desktop` profile，真实安装）

- `plugin_manager install_bundle`（首跑失败于上述 import）→ 修复后
  `set_plugin include:mcp-management` → `application: applied`。
- `mcp_management status/list` 正常；`Config.listConfigs` entry `include:mcp-management`，
  `defaultServers` / `workspaces` 带 `x-cordis.volatile: true`。
- `setServer` 写入 profile patch（`cordis.patch.yml` 出现 `mcp-management` 行）→ volatile 重挂
  当前 Agent → 新工具 schema 推送；`mcp__wsfixture__ping` 返回 `pong`。
- 新建会话（subagent）在同一工作区获得 `mcp__wsfixture__*` 并成功 ping/echo → `agent/created`
  挂载路径生效。
- `setEnabled false` → 工具立即不可调用（`unknown tool`），`status` 报 `disabled`；`true` → 工具恢复。
- Client：`Slots.listSubTree root=settings.section` occupants 含
  `{id:"mcp-management", order:16, active:true}`（`whileServed` 生效，页面注册未抛错）。
- 代码热替换：修改 `index.js` 后由一次配置写入触发 HMR 重新 import（新 `servers` 参数出现在 live
  tool schema 中），无需重启桌面端。
- 测试用工作区/服务器配置已清理，临时目录已删除；插件保持安装启用。

### 未覆盖 / 剩余风险

1. **跨工作区负向隔离**未能直接观测：本会话无法创建 header cwd 不同的会话；`subagent.cwd` 只改变
   工具工作目录，不改变会话工作区（这同时确认了按 `session.header.cwd` 绑定工作区是正确的）。
   已由解析层（`status` 对任意路径返回其服务器集合）和 agent-scope 注册机制间接覆盖。
2. **浏览器视觉渲染/交互**未截图验证（仅验证 slot 注册、locale 字典、注册路径无异常）。
3. `.dsh/mcp.json` 在"其它工作区会话"内的实际挂载未观测；解析层已验证
   （`status` 对 `/tmp/...` 返回 `source: file:...`）。
4. `status` 的 `connected` 可能偏乐观（mcp-client `failOnStartupError:false` 会后台重连），
   以会话内 `mcp__*` 工具是否出现为准（已在 README 说明）。
5. `.dsh/mcp.json` 无文件监听，改动需新会话或一次配置写入后生效（已在 README 说明）。
