window.__ModuleLoader__.load({
	id: "dsh-mcp-management",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		const React = require("react");
		const h = React.createElement;
		/** Dictionary namespace owned by this page. */
		const NS = "settings.mcpManagement";
		/** Profile entry id of the Host half of this plugin (the config namespace). */
		const ENTRY_ID = "mcp-management";
		/** Accepted server names: they become `mcp__<serverName>__<tool>` tool segments. */
		const SERVER_NAME_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;
		const TRANSPORT_STDIO = "stdio";
		const TRANSPORT_HTTP = "streamable-http";
		/** Shared frozen empties keep derived snapshots reference-stable. */
		const EMPTY_LIST = Object.freeze([]);
		const EMPTY_VALUE = Object.freeze({ defaults: EMPTY_LIST, workspaces: EMPTY_LIST });
		const NO_STATE = Object.freeze({
			status: "unavailable",
			writable: false,
			busy: false,
			picking: false,
			error: null,
			defaults: EMPTY_LIST,
			workspaces: EMPTY_LIST,
		});
		//#region dictionaries
		/** English copy. */
		const en = {
			title: "MCP Management",
			description:
				"Give each workspace its own MCP servers. A session only sees the MCP servers of the workspace it runs in; a .dsh/mcp.json file inside that workspace takes precedence.",
			fileHint: "A .dsh/mcp.json file in the workspace overrides the list below (the file wins).",
			loading: "Loading configuration…",
			unavailable: "This plugin is not loaded, so its settings cannot be shown right now.",
			readOnly: "This deployment stores settings read-only.",
			saving: "Applying changes…",
			"error.name": "Enter 1–32 characters: letters, digits, underscore or hyphen.",
			"error.duplicateServer": "Another server in this scope already uses that name.",
			"error.missingServer": "That server no longer exists. Reload the page and try again.",
			"error.missingWorkspace": "That workspace no longer exists. Reload the page and try again.",
			"error.workspaceExists": "That directory is already a workspace.",
			"error.saveFailed": "The change was not saved. The deployment rejected it; try again.",
			"error.busy": "Another change is still being applied. Wait for it to finish.",
			"error.pickFailed": "The directory picker failed. Choose a workspace directory and try again.",
			"error.notAbsolute": "Enter an absolute directory path, such as /Users/you/project.",
			"defaults.title": "Global default servers",
			"defaults.hint":
				"Used by every session unless a workspace or its .dsh/mcp.json overrides the same server name.",
			"defaults.empty": "No global default servers yet.",
			"defaults.add": "Add default server",
			"workspaces.title": "Workspaces",
			"workspaces.hint":
				"Sessions started in a workspace directory see the servers of that workspace plus the global defaults.",
			"workspaces.empty": "No workspaces yet.",
			"workspaces.add": "Add workspace",
			"addWorkspace.title": "Add workspace",
			"addWorkspace.hint":
				"This browser has no in-window directory chooser. Paste the project directory's absolute path, or pick a workspace that is already registered in the sidebar.",
			"addWorkspace.pathLabel": "Directory path",
			"addWorkspace.pathPlaceholder": "/Users/you/project",
			"addWorkspace.existing": "Or pick an existing workspace",
			"addWorkspace.existingEmpty": "No other registered workspaces to pick.",
			"addWorkspace.submit": "Add",
			"addWorkspace.saving": "Adding…",
			"workspaces.picking": "Choosing a directory…",
			"workspaces.remove": "Remove workspace",
			"workspaces.removeConfirm":
				'Remove workspace "{path}" from this list? Its MCP servers are removed from the saved configuration; session history is untouched.',
			"workspaces.rename": "Workspace title",
			"workspaces.path": "Directory",
			"servers.title": "MCP servers",
			"servers.empty": "No servers configured here yet.",
			"servers.add": "Add server",
			"server.enabled": "Enabled",
			"server.disabled": "Disabled",
			"server.edit": "Edit",
			"server.delete": "Delete",
			"server.deleteConfirm": 'Delete MCP server "{name}"?',
			"server.save": "Save",
			"server.saving": "Saving…",
			"server.cancel": "Cancel",
			"server.unnamed": "(unnamed server)",
			"editor.addTitle": "Add MCP server",
			"editor.editTitle": "Edit MCP server",
			"field.serverName": "Server name",
			"field.serverNameHint":
				'Becomes the tool prefix mcp__<serverName>__<tool>. 1–32 letters, digits, underscore or hyphen.',
			"field.transport": "Transport",
			"field.transport.stdio": "stdio (local command)",
			"field.transport.http": "streamable-http (URL)",
			"field.command": "Command",
			"field.commandHint": "Executable to start, for example npx.",
			"field.args": "Arguments",
			"field.argsHint": "One argument per line.",
			"field.env": "Environment variables",
			"field.envHint":
				"One KEY=VALUE per line. Values, command, arguments, URL and headers may use ${env:NAME} to read a Host environment variable.",
			"field.cwd": "Working directory",
			"field.cwdHint": "Optional absolute directory the process runs in.",
			"field.url": "Server URL",
			"field.urlHint":
				"Streamable HTTP endpoint, for example https://example.com/mcp. May use ${env:NAME}.",
			"field.headers": "HTTP headers",
			"field.headersHint": "One Name: Value per line. Values may use ${env:NAME}.",
			"field.enabled": "Enable this server",
			"field.enabledHint": "Disabled servers keep their configuration but are not connected.",
			"field.failOnStartupError": "Fail the session when this server cannot start",
			"field.failOnStartupErrorHint": "Off by default: a broken MCP server never blocks the session.",
			"common.dismiss": "Dismiss",
			"common.cancel": "Cancel",
		};
		/** Simplified Chinese copy. */
		const zh = {
			title: "MCP 管理",
			description:
				"按工作区管理 MCP 服务器：每个会话只能看到其所在工作区启用的服务器；工作区内的 .dsh/mcp.json 文件优先。",
			fileHint: "工作区内的 .dsh/mcp.json 文件优先于下表（文件优先）。",
			loading: "正在加载配置…",
			unavailable: "该插件当前未加载，暂时无法显示设置。",
			readOnly: "本部署的设置为只读。",
			saving: "正在应用更改…",
			"error.name": "请输入 1–32 个字符：字母、数字、下划线或连字符。",
			"error.duplicateServer": "该范围内已有同名服务器。",
			"error.missingServer": "该服务器已不存在，请刷新页面后重试。",
			"error.missingWorkspace": "该工作区已不存在，请刷新页面后重试。",
			"error.workspaceExists": "该目录已经是工作区。",
			"error.saveFailed": "更改未保存：本部署拒绝了写入，请重试。",
			"error.busy": "还有更改正在应用，请等待完成。",
			"error.pickFailed": "目录选择失败，请重试。",
			"error.notAbsolute": "请输入目录的绝对路径，例如 /Users/你/项目。",
			"defaults.title": "全局默认服务器",
			"defaults.hint": "所有会话都可使用；工作区或 .dsh/mcp.json 中的同名服务器会覆盖它。",
			"defaults.empty": "还没有全局默认服务器。",
			"defaults.add": "添加默认服务器",
			"workspaces.title": "工作区",
			"workspaces.hint": "在工作区目录中启动的会话可以使用该工作区的服务器，以及全局默认服务器。",
			"workspaces.empty": "还没有工作区。",
			"workspaces.add": "添加工作区",
			"addWorkspace.title": "添加工作区",
			"addWorkspace.hint":
				"当前浏览器中没有可用的系统目录选择器。请粘贴项目目录的绝对路径，或从左侧栏已注册的工作区中选择。",
			"addWorkspace.pathLabel": "目录路径",
			"addWorkspace.pathPlaceholder": "/Users/你/项目",
			"addWorkspace.existing": "或选择已有工作区",
			"addWorkspace.existingEmpty": "没有其他已注册的工作区。",
			"addWorkspace.submit": "添加",
			"addWorkspace.saving": "添加中…",
			"workspaces.picking": "正在选择目录…",
			"workspaces.remove": "移除工作区",
			"workspaces.removeConfirm": "从列表中移除工作区「{path}」？其 MCP 服务器配置会一并移除，会话历史不受影响。",
			"workspaces.rename": "工作区标题",
			"workspaces.path": "目录",
			"servers.title": "MCP 服务器",
			"servers.empty": "这里还没有配置服务器。",
			"servers.add": "添加服务器",
			"server.enabled": "已启用",
			"server.disabled": "已停用",
			"server.edit": "编辑",
			"server.delete": "删除",
			"server.deleteConfirm": "删除 MCP 服务器「{name}」？",
			"server.save": "保存",
			"server.saving": "保存中…",
			"server.cancel": "取消",
			"server.unnamed": "（未命名服务器）",
			"editor.addTitle": "添加 MCP 服务器",
			"editor.editTitle": "编辑 MCP 服务器",
			"field.serverName": "服务器名称",
			"field.serverNameHint": "将成为工具名前缀 mcp__<serverName>__<tool>。限 1–32 个字母、数字、下划线或连字符。",
			"field.transport": "传输方式",
			"field.transport.stdio": "stdio（本地命令）",
			"field.transport.http": "streamable-http（URL）",
			"field.command": "命令",
			"field.commandHint": "要启动的可执行程序，例如 npx。",
			"field.args": "参数",
			"field.argsHint": "每行一个参数。",
			"field.env": "环境变量",
			"field.envHint":
				"每行一个 KEY=VALUE。值、命令、参数、URL 与请求头中可用 ${env:NAME} 读取宿主环境变量。",
			"field.cwd": "工作目录",
			"field.cwdHint": "可选，进程运行的绝对目录。",
			"field.url": "服务器 URL",
			"field.urlHint": "streamable HTTP 端点，例如 https://example.com/mcp，可用 ${env:NAME}。",
			"field.headers": "请求头",
			"field.headersHint": "每行一个 Name: Value，值中可用 ${env:NAME}。",
			"field.enabled": "启用此服务器",
			"field.enabledHint": "停用后保留配置，但不会连接。",
			"field.failOnStartupError": "服务器无法启动时使会话失败",
			"field.failOnStartupErrorHint": "默认关闭：MCP 服务器故障不会阻断会话。",
			"common.dismiss": "关闭",
			"common.cancel": "取消",
		};
		//#endregion
		//#region value helpers
		/** Read a trimmed string, or an empty string for anything else. */
		function text(value) {
			return typeof value === "string" ? value.trim() : "";
		}
		/** Read an array as text, or an empty array. */
		function stringList(value) {
			return Array.isArray(value) ? value : EMPTY_LIST;
		}
		/** The global defaults' scope descriptor. */
		const DEFAULT_SCOPE = Object.freeze({ kind: "default" });
		/** Project a config-form snapshot onto the two volatile arrays this page edits. */
		function readValue(snapshot) {
			const output = snapshot !== null && typeof snapshot === "object" ? snapshot.value : void 0;
			if (output === null || typeof output !== "object" || Array.isArray(output)) return EMPTY_VALUE;
			return {
				defaults: Array.isArray(output.defaultServers) ? output.defaultServers : EMPTY_LIST,
				workspaces: Array.isArray(output.workspaces) ? output.workspaces : EMPTY_LIST,
			};
		}
		/** One line per array element. */
		function linesToList(value) {
			if (typeof value !== "string") return EMPTY_LIST;
			const lines = [];
			for (const line of value.split(/\r?\n/)) {
				const trimmed = line.trim();
				if (trimmed.length > 0) lines.push(trimmed);
			}
			return lines;
		}
		/** Parse `KEY=VALUE` or `Name: Value` lines into a plain string record. */
		function recordsFromLines(value, separator) {
			const record = {};
			if (typeof value !== "string") return record;
			for (const line of value.split(/\r?\n/)) {
				const at = line.indexOf(separator);
				if (at < 0) continue;
				const key = line.slice(0, at).trim();
				if (key.length === 0) continue;
				if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
				record[key] = line.slice(at + separator.length).trim();
			}
			return record;
		}
		/** Render a string record as one `KEY=VALUE` / `Name: Value` line per entry. */
		function recordsToLines(value, separator) {
			if (value === null || typeof value !== "object" || Array.isArray(value)) return "";
			const lines = [];
			for (const entry of Object.entries(value)) {
				if (entry[0] === "__proto__" || entry[0] === "constructor" || entry[0] === "prototype") continue;
				lines.push(entry[0] + separator + String(entry[1]));
			}
			return lines.join("\n");
		}
		/** Drop trailing path separators, preserving a bare root. */
		function trimPath(value) {
			let path = String(value);
			while (path.length > 1 && /[\\/]$/.test(path)) path = path.slice(0, -1);
			return path;
		}
		/** The comparison key for a directory path (Windows drive letters fold case). */
		function pathKey(value) {
			const unified = trimPath(value).replace(/\\/g, "/");
			return /^[A-Za-z]:\//.test(unified) ? unified.toLowerCase() : unified;
		}
		/** The last path segment, used as the default workspace title. */
		function baseName(value) {
			const trimmed = trimPath(value);
			const parts = trimmed.split(/[\\/]+/);
			const last = parts.length > 0 ? parts[parts.length - 1] : "";
			return last.length > 0 ? last : trimmed;
		}
		/** Locate a workspace by path in a possibly malformed array. */
		function findWorkspaceIndex(workspaces, path) {
			if (!Array.isArray(workspaces)) return -1;
			const key = pathKey(path);
			return workspaces.findIndex(
				(workspace) =>
					workspace !== null &&
					typeof workspace === "object" &&
					typeof workspace.path === "string" &&
					pathKey(workspace.path) === key,
			);
		}
		/**
		* Pick a workspace directory the way the app's own add-workspace flow does.
		*
		* The Electron desktop preload exposes a native chooser that runs as an
		* app-modal sheet owned by this window (`__DSH_DIRECTORY_PICKER__.pick()`),
		* so its sidebar shortcuts stay interactive. Opening the Host remote picker
		* in a plain browser spawns a separate `osascript` helper whose panel is
		* owned by that process — its sidebar can ignore clicks — so the page only
		* uses this function when the in-window bridge exists.
		* @param ctx - browser plugin context carrying `uiWorkspace`.
		* @returns the picked absolute path, or null when the operator cancels.
		*/
		async function pickWorkspaceDirectory(ctx) {
			const bridge = globalThis.__DSH_DIRECTORY_PICKER__;
			if (bridge !== undefined && bridge !== null && typeof bridge.pick === "function") {
				const picked = await bridge.pick();
				return typeof picked === "string" && picked.trim().length > 0 ? picked : null;
			}
			const picked = await ctx.uiWorkspace.pickDirectory();
			return typeof picked === "string" && picked.trim().length > 0 ? picked : null;
		}
		/** Whether the preload bridge for the in-window native chooser is available. */
		function hasNativeBridge() {
			const bridge = globalThis.__DSH_DIRECTORY_PICKER__;
			return bridge !== undefined && bridge !== null && typeof bridge.pick === "function";
		}
		/**
		* Whether a value is an absolute POSIX or Windows path. The Host resolves a
		* relative path against it own process directory, which is never what the
		* operator means, so the page refuses those.
		* @param value - candidate directory path.
		* @returns true for an absolute path.
		*/
		function isAbsolutePath(value) {
			const path = trimPath(value);
			return /^\//.test(path) || /^[A-Za-z]:[\\/]/.test(path);
		}
		/** Build the complete ServerConfig the Host schema expects from an editor draft. */
		function serverFromDraft(draft) {
			const source = draft !== null && typeof draft === "object" ? draft : {};
			const transport = source.transport === TRANSPORT_HTTP ? TRANSPORT_HTTP : TRANSPORT_STDIO;
			const server = {
				serverName: text(source.serverName),
				transport,
				command: "",
				args: [],
				env: {},
				cwd: "",
				url: "",
				headers: {},
				enabled: source.enabled !== false,
				failOnStartupError: source.failOnStartupError === true,
			};
			if (transport === TRANSPORT_STDIO) {
				server.command = text(source.command);
				server.args = linesToList(source.args);
				server.env = recordsFromLines(source.env, "=");
				server.cwd = text(source.cwd);
			} else {
				server.url = text(source.url);
				server.headers = recordsFromLines(source.headers, ":");
			}
			return server;
		}
		/** Turn a stored ServerConfig back into editable strings. */
		function draftFromServer(server) {
			const source = server !== null && typeof server === "object" && !Array.isArray(server) ? server : {};
			const transport = source.transport === TRANSPORT_HTTP ? TRANSPORT_HTTP : TRANSPORT_STDIO;
			return {
				serverName: text(source.serverName),
				transport,
				command: text(source.command),
				args: stringList(source.args).join("\n"),
				env: recordsToLines(source.env, "="),
				cwd: text(source.cwd),
				url: text(source.url),
				headers: recordsToLines(source.headers, ": "),
				enabled: source.enabled !== false,
				failOnStartupError: source.failOnStartupError === true,
			};
		}
		//#endregion
		//#region store and controller
		/**
		* A minimal snapshot store in the `{getSnapshot, subscribe}` shape the renderer
		* binds `hooks` sources from. Snapshots are replaced only when content changes.
		*/
		function createStore(initial) {
			let snapshot = initial;
			const listeners = new Set();
			return {
				getSnapshot() {
					return snapshot;
				},
				subscribe(listener) {
					listeners.add(listener);
					return () => {
						listeners.delete(listener);
					};
				},
				set(next) {
					if (next === snapshot) return;
					snapshot = next;
					for (const listener of Array.from(listeners)) {
						try {
							listener();
						} catch (error) {
							console.warn("[mcp-management] settings listener failed:", error);
						}
					}
				},
			};
		}
		/** Path identity of a server scope: the global defaults or one workspace. */
		function serverScopeKey(scope) {
			if (scope !== null && typeof scope === "object" && scope.kind === "workspace") return "workspace:" + pathKey(text(scope.path));
			return "default";
		}
		/**
		* Bridges the Host config form of this plugin onto the settings page: derives
		* the page snapshot, validates server drafts, and serializes writes so at most
		* one volatile `set()` is in flight. A write always computes its next full
		* array from the freshest accepted snapshot.
		*/
		var WorkspaceController = class {
			ctx;
			form;
			store;
			unsubscribe;
			tail = Promise.resolve();
			pending = 0;
			picking = false;
			/** True while the browser-side add-workspace dialog is open. */
			addOpen = false;
			error = null;
			disposed = false;
			constructor(ctx, form) {
				this.ctx = ctx;
				this.form = form;
				this.store = createStore(this.derive());
				this.unsubscribe = form.subscribe(() => this.publish());
				this.publish();
			}
			/** @returns the current page snapshot. */
			getSnapshot() {
				return this.store.getSnapshot();
			}
			/** @returns the snapshot's listener disposer. */
			subscribe(listener) {
				return this.store.subscribe(listener);
			}
			/** Derive the page snapshot from the shared config form. */
			derive() {
				const snapshot = this.form.getSnapshot();
				const value = readValue(snapshot);
				return {
					status: typeof snapshot?.status === "string" ? snapshot.status : "loading",
					writable: snapshot?.writable === true,
					busy: this.pending > 0,
					picking: this.picking,
					addOpen: this.addOpen,
					error: this.error,
					defaults: value.defaults,
					workspaces: value.workspaces,
				};
			}
			/** Publish a derived snapshot only when one of its fields changed. */
			publish() {
				if (this.disposed) return;
				const previous = this.store.getSnapshot();
				const next = this.derive();
				if (
					previous.status === next.status &&
					previous.writable === next.writable &&
					previous.busy === next.busy &&
					previous.picking === next.picking &&
					previous.addOpen === next.addOpen &&
					previous.error === next.error &&
					previous.defaults === next.defaults &&
					previous.workspaces === next.workspaces
				)
					return;
				this.store.set(next);
			}
			/** Show one localized failure key in the page banner. */
			fail(key) {
				this.error = key;
				this.publish();
				return { ok: false, error: key };
			}
			/** Clear the page banner. */
			clearError() {
				if (this.error === null) return;
				this.error = null;
				this.publish();
			}
			/**
			* Queue one serialized write. The compute callback runs against the latest
			* accepted value and returns `{field, value}`, `{error}`, or `null` to skip.
			* @returns settlement after the Host accepts or refuses the write.
			*/
			execute(compute) {
				if (this.disposed) return Promise.resolve({ ok: false, error: "error.saveFailed" });
				this.pending += 1;
				this.error = null;
				this.publish();
				const task = this.tail.then(async () => {
					if (this.disposed) return { ok: false, error: "error.saveFailed" };
					try {
						const outcome = compute(readValue(this.form.getSnapshot()));
						if (outcome === null || outcome === void 0) return { ok: true };
						if (outcome.error !== void 0) return this.fail(outcome.error);
						const accepted = await this.form.set(outcome.field, outcome.value);
						if (accepted !== true) return this.fail("error.saveFailed");
						return { ok: true };
					} catch (error) {
						console.warn("[mcp-management] config write failed:", error);
						return this.fail("error.saveFailed");
					} finally {
						this.pending -= 1;
						this.publish();
					}
				});
				this.tail = task.then(
					() => void 0,
					() => void 0,
				);
				return task;
			}
			/** Queue an edit of one scope's `servers` array. */
			updateServers(scope, transform) {
				return this.execute((current) => {
					if (scope !== null && typeof scope === "object" && scope.kind === "workspace") {
						const index = findWorkspaceIndex(current.workspaces, text(scope.path));
						if (index < 0) return { error: "error.missingWorkspace" };
						const workspace = current.workspaces[index];
						const outcome = transform(stringList(workspace?.servers).slice());
						if (!Array.isArray(outcome)) return outcome;
						const workspaces = current.workspaces.slice();
						workspaces[index] = { ...workspace, servers: outcome };
						return { field: "workspaces", value: workspaces };
					}
					const outcome = transform(current.defaults.slice());
					if (!Array.isArray(outcome)) return outcome;
					return { field: "defaultServers", value: outcome };
				});
			}
			/** Queue an edit of the whole `workspaces` array. */
			updateWorkspaces(transform) {
				return this.execute((current) => {
					const outcome = transform(current.workspaces.slice());
					if (!Array.isArray(outcome)) return outcome;
					return { field: "workspaces", value: outcome };
				});
			}
			/** Create or replace one server; `index === null` appends. */
			saveServer(scope, index, draft) {
				const server = serverFromDraft(draft);
				if (!SERVER_NAME_PATTERN.test(server.serverName)) return Promise.resolve({ ok: false, error: "error.name" });
				return this.updateServers(scope, (servers) => {
					const replacing = Number.isInteger(index) && index >= 0 && index < servers.length;
					const duplicate = servers.some(
						(candidate, position) =>
							position !== index &&
							candidate !== null &&
							typeof candidate === "object" &&
							candidate.serverName === server.serverName,
					);
					if (duplicate) return { error: "error.duplicateServer" };
					const next = servers.slice();
					if (Number.isInteger(index) && index >= 0) {
						if (!replacing) return { error: "error.missingServer" };
						next[index] = server;
					} else next.push(server);
					return next;
				});
			}
			/** Remove one server. */
			removeServer(scope, index) {
				return this.updateServers(scope, (servers) => {
					if (!Number.isInteger(index) || index < 0 || index >= servers.length) return { error: "error.missingServer" };
					const next = servers.slice();
					next.splice(index, 1);
					return next;
				});
			}
			/** Switch one server on or off without touching its other fields. */
			setServerEnabled(scope, index, enabled) {
				return this.updateServers(scope, (servers) => {
					const current = servers[index];
					if (!Number.isInteger(index) || index < 0 || current === null || typeof current !== "object")
						return { error: "error.missingServer" };
					const next = servers.slice();
					next[index] = { ...current, enabled: enabled === true };
					return next;
				});
			}
			/**
			* Start adding a workspace.
			*
			* In the desktop app the preload bridge opens the in-window native
			* chooser in one step, exactly like the app's own add-workspace flow. A
			* plain browser has no such bridge, and the Host's macOS helper panel can
			* ignore clicks on its sidebar shortcuts, so there the page opens its own
			* dialog: paste an absolute path, or pick an already-registered workspace.
			* @returns settlement; the dialog path resolves once the dialog opens.
			*/
			async addWorkspace() {
				if (this.disposed) return { ok: false, error: "error.saveFailed" };
				if (hasNativeBridge()) return this.addWorkspaceFromSystemChooser();
				return this.openAddWorkspaceDialog();
			}
			/** Open the browser-side add-workspace dialog. */
			openAddWorkspaceDialog() {
				if (this.disposed) return { ok: false, error: "error.saveFailed" };
				this.addOpen = true;
				this.publish();
				return { ok: true };
			}
			/** Close the browser-side add-workspace dialog without changes. */
			closeAddWorkspaceDialog() {
				if (!this.addOpen) return { ok: true };
				this.addOpen = false;
				this.publish();
				return { ok: true };
			}
			/** Run the in-window native chooser and append the picked directory. */
			async addWorkspaceFromSystemChooser() {
				if (this.disposed) return { ok: false, error: "error.saveFailed" };
				if (this.picking) return { ok: false, error: "error.busy" };
				this.picking = true;
				this.publish();
				let picked;
				try {
					picked = await pickWorkspaceDirectory(this.ctx);
				} catch (error) {
					console.warn("[mcp-management] directory picker failed:", error);
					this.picking = false;
					return this.fail("error.pickFailed");
				}
				this.picking = false;
				this.publish();
				if (typeof picked !== "string" || picked.trim().length === 0) return { ok: true };
				return this.appendWorkspace(trimPath(picked.trim()));
			}
			/**
			* Append one directory typed into (or chosen from) the add-workspace dialog.
			* @param candidate - absolute directory path.
			* @returns settlement; invalid paths fail with `error.notAbsolute`.
			*/
			submitWorkspacePath(candidate) {
				if (this.disposed) return Promise.resolve({ ok: false, error: "error.saveFailed" });
				const path = trimPath(text(candidate));
				if (path.length === 0 || !isAbsolutePath(path)) return Promise.resolve(this.fail("error.notAbsolute"));
				this.addOpen = false;
				this.publish();
				return this.appendWorkspace(path);
			}
			/** Queue the write that appends one workspace entry. */
			appendWorkspace(path) {
				return this.execute((current) => {
					if (findWorkspaceIndex(current.workspaces, path) >= 0) return { error: "error.workspaceExists" };
					const next = current.workspaces.slice();
					next.push({ path, title: baseName(path), servers: [] });
					return { field: "workspaces", value: next };
				});
			}
			/** Remove a workspace (and its server list) from the saved configuration. */
			removeWorkspace(path) {
				const target = text(path);
				return this.updateWorkspaces((workspaces) => {
					const index = findWorkspaceIndex(workspaces, target);
					if (index < 0) return { error: "error.missingWorkspace" };
					const next = workspaces.slice();
					next.splice(index, 1);
					return next;
				});
			}
			/** Rename a workspace; the title is display-only. */
			renameWorkspace(path, title) {
				const target = text(path);
				return this.updateWorkspaces((workspaces) => {
					const index = findWorkspaceIndex(workspaces, target);
					if (index < 0) return { error: "error.missingWorkspace" };
					const next = workspaces.slice();
					next[index] = { ...workspaces[index], title: text(title) };
					return next;
				});
			}
			/** Release the config subscription. */
			dispose() {
				if (this.disposed) return;
				this.disposed = true;
				this.error = null;
				try {
					this.unsubscribe();
				} catch (error) {
					console.warn("[mcp-management] form unsubscribe failed:", error);
				}
			}
			/** The face the settings section injects: snapshot hook plus write actions. */
			inject() {
				return {
					hooks: { mcpManagement: this.store },
					saveServer: (scope, index, draft) => this.saveServer(scope, index, draft),
					removeServer: (scope, index) => this.removeServer(scope, index),
					setServerEnabled: (scope, index, enabled) => this.setServerEnabled(scope, index, enabled),
					addWorkspace: () => this.addWorkspace(),
					submitWorkspacePath: (path) => this.submitWorkspacePath(path),
					closeAddWorkspace: () => this.closeAddWorkspaceDialog(),
					removeWorkspace: (path) => this.removeWorkspace(path),
					renameWorkspace: (path, title) => this.renameWorkspace(path, title),
					clearError: () => this.clearError(),
				};
			}
		};
		//#endregion
		//#region styles
		const STYLE = `
.mcpw-root{display:grid;gap:18px;color:var(--dsw-alias-label-primary);font-size:14px;line-height:1.5;padding-bottom:8px}
.mcpw-head{display:grid;gap:4px}
.mcpw-title{margin:0;font-size:18px;line-height:26px;font-weight:600;color:var(--dsw-alias-label-primary)}
.mcpw-desc{margin:0;color:var(--dsw-alias-label-secondary);font-size:12.5px;line-height:19px}
.mcpw-banner{display:flex;align-items:flex-start;gap:10px;padding:9px 12px;border-radius:8px;border:0.5px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);font-size:12.5px;line-height:18px}
.mcpw-banner>span{flex:1;min-width:0}
.mcpw-banner--error{color:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary)}
.mcpw-banner--warn{color:var(--dsw-alias-state-warn-primary);border-color:var(--dsw-alias-state-warn-primary)}
.mcpw-section{display:grid;gap:10px}
.mcpw-section-head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
.mcpw-section-title{margin:0;font-size:14.5px;line-height:22px;font-weight:600;color:var(--dsw-alias-label-primary)}
.mcpw-hint{margin:0;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}
.mcpw-card{display:grid;padding:2px 14px;border:0.5px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-layer-1)}
.mcpw-empty{color:var(--dsw-alias-label-secondary);font-size:12.5px;line-height:19px;padding:10px 0}
.mcpw-server{display:flex;align-items:center;gap:12px;padding:10px 0;border-top:0.5px solid var(--dsw-alias-border-l2)}
.mcpw-server:first-child{border-top:none}
.mcpw-server-main{display:grid;gap:2px;flex:1;min-width:0}
.mcpw-server-head{display:flex;align-items:center;gap:8px;min-width:0}
.mcpw-name{font-size:13.5px;font-weight:550;color:var(--dsw-alias-label-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mcpw-tag{flex:none;border:0.5px solid var(--dsw-alias-border-l2);border-radius:999px;padding:0 7px;font-size:11px;line-height:17px;color:var(--dsw-alias-label-secondary)}
.mcpw-summary{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mcpw-server-actions{display:flex;align-items:center;gap:8px;flex:none}
.mcpw-btn{appearance:none;border:0.5px solid var(--dsw-alias-border-l1);background:transparent;color:var(--dsw-alias-label-primary);border-radius:7px;padding:5px 11px;font:inherit;font-size:12.5px;line-height:18px;cursor:pointer}
.mcpw-btn:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2)}
.mcpw-btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.mcpw-btn:disabled{opacity:0.45;cursor:default}
.mcpw-btn--primary{border-color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-brand-primary);color:var(--dsw-alias-bg-base)}
.mcpw-btn--primary:hover:not(:disabled){opacity:0.88;background:var(--dsw-alias-brand-primary)}
.mcpw-btn--danger{border-color:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary)}
.mcpw-btn--danger:hover:not(:disabled){background:transparent;opacity:0.8}
.mcpw-btn--ghost{border-color:transparent;padding:2px 8px}
.mcpw-ws{display:grid;gap:10px;padding:12px 14px;border:0.5px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-layer-1)}
.mcpw-ws+.mcpw-ws{margin-top:10px}
.mcpw-ws-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
.mcpw-ws-ident{display:grid;gap:4px;flex:1;min-width:0}
.mcpw-ws-path{color:var(--dsw-alias-label-secondary);font-size:11.5px;line-height:17px;overflow-wrap:anywhere;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
.mcpw-ws-servers{display:grid;gap:8px}
.mcpw-ws-servers-head{display:flex;align-items:center;justify-content:space-between;gap:10px}
.mcpw-subtitle{margin:0;font-size:12.5px;font-weight:600;line-height:18px;color:var(--dsw-alias-label-secondary)}
.mcpw-input,.mcpw-select,.mcpw-textarea{box-sizing:border-box;width:100%;border:1px solid var(--dsw-alias-border-l1);border-radius:7px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);padding:6px 9px;font:inherit;font-size:13px;line-height:19px}
.mcpw-input:focus-visible,.mcpw-select:focus-visible,.mcpw-textarea:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:0;border-color:var(--dsw-alias-brand-primary)}
.mcpw-input:disabled,.mcpw-select:disabled,.mcpw-textarea:disabled{opacity:0.55}
.mcpw-textarea{min-height:68px;resize:vertical;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12.5px}
.mcpw-ws-title{max-width:360px;font-weight:550;padding:3px 7px}
.mcpw-field{display:grid;gap:5px;min-width:0}
.mcpw-field-label{display:flex;align-items:center;gap:4px;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}
.mcpw-required{color:var(--dsw-alias-state-error-primary)}
.mcpw-quickgrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
@media (max-width:560px){.mcpw-quickgrid{grid-template-columns:minmax(0,1fr)}}
.mcpw-checks{display:grid;gap:8px}
.mcpw-check{display:flex;align-items:center;gap:8px;color:var(--dsw-alias-label-primary);font-size:13px;line-height:20px;cursor:pointer}
.mcpw-check input{accent-color:var(--dsw-alias-brand-primary);width:15px;height:15px;margin:0}
.mcpw-switch{display:inline-flex;align-items:center;cursor:pointer}
.mcpw-switch input{position:absolute;opacity:0;width:1px;height:1px}
.mcpw-switch-track{position:relative;width:34px;height:20px;border-radius:999px;background:var(--dsw-alias-border-l2);transition:background 0.15s}
.mcpw-switch input:checked+.mcpw-switch-track{background:var(--dsw-alias-brand-primary)}
.mcpw-switch input:focus-visible+.mcpw-switch-track{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
.mcpw-switch input:disabled+.mcpw-switch-track{opacity:0.5;cursor:default}
.mcpw-switch-thumb{position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:var(--dsw-alias-bg-layer-2);transition:transform 0.15s}
.mcpw-switch input:checked+.mcpw-switch-track .mcpw-switch-thumb{transform:translateX(14px)}
.mcpw-backdrop{position:fixed;inset:0;z-index:1200;display:flex;align-items:center;justify-content:center;padding:24px;background:var(--dsw-alias-bg-mask-1)}
.mcpw-modal{box-sizing:border-box;width:min(620px,100%);max-height:min(86vh,820px);overflow:auto;padding:18px 20px 16px;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);box-shadow:0 18px 48px rgba(0,0,0,0.28)}
.mcpw-modal-title{margin:0;font-size:16px;line-height:24px;font-weight:600}
.mcpw-modal-body{display:grid;gap:12px;padding:12px 0 14px}
.mcpw-modal-footer{display:flex;justify-content:flex-end;gap:8px;padding-top:12px;border-top:0.5px solid var(--dsw-alias-border-l2)}
.mcpw-status{min-height:17px;color:var(--dsw-alias-label-secondary);font-size:11.5px;line-height:17px}
.mcpw-actions-row{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.mcpw-pick-list{display:grid;gap:6px;max-height:220px;overflow:auto}
.mcpw-pick-item{display:grid;gap:1px;text-align:left;appearance:none;border:0.5px solid var(--dsw-alias-border-l1);background:transparent;color:var(--dsw-alias-label-primary);border-radius:7px;padding:7px 10px;font:inherit;font-size:12.5px;line-height:18px;cursor:pointer}
.mcpw-pick-item:hover:not(:disabled){background:var(--dsw-alias-bg-layer-1)}
.mcpw-pick-item:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.mcpw-pick-item:disabled{opacity:0.45;cursor:default}
.mcpw-pick-title{font-weight:500}
.mcpw-pick-path{color:var(--dsw-alias-label-secondary);font-size:11.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
`;
		//#endregion
		//#region UI atoms
		/** A settings-page button. */
		function Button(props) {
			const className = "mcpw-btn" + (props.variant === void 0 ? "" : " mcpw-btn--" + props.variant);
			return h(
				"button",
				{
					type: props.type === void 0 ? "button" : props.type,
					className,
					disabled: props.disabled === true,
					onClick: props.onClick,
					title: props.title,
					"aria-label": props.ariaLabel,
				},
				props.label,
			);
		}
		/** A labeled form field. */
		function Field(props) {
			return h(
				"div",
				{ className: "mcpw-field" },
				h(
					"label",
					{ className: "mcpw-field-label", htmlFor: props.htmlFor },
					props.label,
					props.required === true ? h("span", { className: "mcpw-required", "aria-hidden": "true" }, " *") : null,
				),
				props.children,
				props.hint === void 0 ? null : h("div", { className: "mcpw-hint" }, props.hint),
			);
		}
		/** An accessible switch backed by a checkbox. */
		function Switch(props) {
			return h(
				"label",
				{ className: "mcpw-switch", title: props.label },
				h("input", {
					type: "checkbox",
					role: "switch",
					"aria-checked": props.checked === true ? "true" : "false",
					"aria-label": props.label,
					checked: props.checked === true,
					disabled: props.disabled === true,
					onChange: (event) => {
						props.onChange(event.target.checked);
					},
				}),
				h("span", { className: "mcpw-switch-track", "aria-hidden": "true" }, h("span", { className: "mcpw-switch-thumb" })),
			);
		}
		/** Name, transport tag and endpoint summary of one server. */
		function serverName(server) {
			return typeof server?.serverName === "string" ? server.serverName : "";
		}
		/** Display label for one server name. */
		function serverLabel(t, server) {
			const name = serverName(server);
			return name.length > 0 ? name : t("server.unnamed");
		}
		/** One-line transport summary. */
		function serverSummary(t, server) {
			if (server !== null && typeof server === "object" && server.transport === TRANSPORT_HTTP) {
				const url = text(server.url);
				return url.length > 0 ? t("field.transport.http") + " · " + url : t("field.transport.http");
			}
			const args = stringList(server?.args)
				.filter((arg) => typeof arg === "string")
				.join(" ");
			const head = text(server?.command);
			const line = [head, args].filter((part) => part.length > 0).join(" ");
			return line.length > 0 ? t("field.transport.stdio") + " · " + line : t("field.transport.stdio");
		}
		//#endregion
		//#region section views
		/** One server row with enable/edit/delete controls. */
		function ServerRow(props) {
			const { t, server, index, disabled, onToggle, onEdit, onDelete } = props;
			const enabled = server === null || typeof server !== "object" ? false : server.enabled !== false;
			const transport = server !== null && typeof server === "object" && server.transport === TRANSPORT_HTTP ? TRANSPORT_HTTP : TRANSPORT_STDIO;
			return h(
				"div",
				{ className: "mcpw-server" },
				h(
					"div",
					{ className: "mcpw-server-main" },
					h(
						"div",
						{ className: "mcpw-server-head" },
						h("span", { className: "mcpw-name" }, serverLabel(t, server)),
						h(
							"span",
							{ className: "mcpw-tag" },
							transport === TRANSPORT_HTTP ? t("field.transport.http") : t("field.transport.stdio"),
						),
					),
					h("div", { className: "mcpw-summary" }, serverSummary(t, server)),
				),
				h(
					"div",
					{ className: "mcpw-server-actions" },
					h(Switch, {
						checked: enabled,
						disabled,
						label: enabled ? t("server.enabled") : t("server.disabled"),
						onChange: (next) => onToggle(index, next),
					}),
					h(Button, { label: t("server.edit"), disabled, onClick: () => onEdit(index, server) }),
					h(Button, { label: t("server.delete"), variant: "danger", disabled, onClick: () => onDelete(index, server) }),
				),
			);
		}
		/** The server rows of one scope, with its empty state. */
		function ServersList(props) {
			const { t, servers, scope, state, actions, openEditor } = props;
			const list = Array.isArray(servers) ? servers : EMPTY_LIST;
			const disabled = state.busy === true || state.writable !== true;
			const rows = list.map((server, index) => {
				if (server === null || typeof server !== "object") return null;
				return h(ServerRow, {
					key: serverName(server) + ":" + index,
					t,
					server,
					index,
					disabled,
					onToggle: (at, enabled) => {
						void actions.setServerEnabled(scope, at, enabled);
					},
					onEdit: (at) => openEditor(scope, at, server),
					onDelete: (at, target) => {
						const label = serverLabel(t, target);
						const confirmFn = typeof window !== "undefined" && typeof window.confirm === "function" ? window.confirm.bind(window) : null;
						if (confirmFn !== null && !confirmFn(t("server.deleteConfirm", { name: label }))) return;
						void actions.removeServer(scope, at);
					},
				});
			});
			return h(
				"div",
				{ className: "mcpw-card" },
				list.length === 0 ? h("div", { className: "mcpw-empty" }, t("servers.empty")) : rows,
			);
		}
		/** Global default servers section. */
		function DefaultsSection(props) {
			const { t, state, actions, openEditor } = props;
			const scope = DEFAULT_SCOPE;
			const disabled = state.busy === true || state.writable !== true;
			return h(
				"section",
				{ className: "mcpw-section", "aria-labelledby": "mcpw-defaults-title" },
				h(
					"div",
					{ className: "mcpw-section-head" },
					h("h3", { id: "mcpw-defaults-title", className: "mcpw-section-title" }, t("defaults.title")),
					h(Button, {
						label: t("defaults.add"),
						variant: "primary",
						disabled,
						onClick: () => openEditor(scope, null, null),
					}),
				),
				h("p", { className: "mcpw-hint" }, t("defaults.hint")),
				h(ServersList, { t, servers: state.defaults, scope, state, actions, openEditor }),
			);
		}
		/** One workspace card: rename, remove, and its own server list. */
		function WorkspaceCard(props) {
			const { t, workspace, state, actions, openEditor } = props;
			const path = typeof workspace.path === "string" ? workspace.path : "";
			const scope = { kind: "workspace", path };
			const disabled = state.busy === true || state.writable !== true;
			const storedTitle = typeof workspace.title === "string" ? workspace.title : "";
			const [title, setTitle] = React.useState(storedTitle);
			React.useEffect(() => {
				setTitle(storedTitle);
			}, [storedTitle]);
			const commit = () => {
				const next = title.trim();
				if (next === storedTitle) return;
				void actions.renameWorkspace(path, next);
			};
			const label = storedTitle.length > 0 ? storedTitle : baseName(path);
			return h(
				"div",
				{ className: "mcpw-ws" },
				h(
					"div",
					{ className: "mcpw-ws-head" },
					h(
						"div",
						{ className: "mcpw-ws-ident" },
						h("input", {
							className: "mcpw-input mcpw-ws-title",
							type: "text",
							value: title,
							placeholder: baseName(path),
							"aria-label": t("workspaces.rename"),
							disabled,
							onChange: (event) => setTitle(event.target.value),
							onBlur: commit,
							onKeyDown: (event) => {
								if (event.key !== "Enter") return;
								event.preventDefault();
								event.currentTarget.blur();
							},
						}),
						h("div", { className: "mcpw-ws-path", title: t("workspaces.path") + ": " + path }, path),
					),
					h(Button, {
						label: t("workspaces.remove"),
						variant: "danger",
						disabled,
						title: t("workspaces.remove"),
						onClick: () => {
							const confirmFn = typeof window !== "undefined" && typeof window.confirm === "function" ? window.confirm.bind(window) : null;
							if (confirmFn !== null && !confirmFn(t("workspaces.removeConfirm", { path: path.length > 0 ? path : label })))
								return;
							void actions.removeWorkspace(path);
						},
					}),
				),
				h(
					"div",
					{ className: "mcpw-ws-servers" },
					h(
						"div",
						{ className: "mcpw-ws-servers-head" },
						h("h4", { className: "mcpw-subtitle" }, t("servers.title")),
						h(Button, {
							label: t("servers.add"),
							disabled,
							onClick: () => openEditor(scope, null, null),
						}),
					),
					h(ServersList, { t, servers: workspace.servers, scope, state, actions, openEditor }),
				),
			);
		}
		/** Workspace list section with the directory-picking add action. */
		function WorkspacesSection(props) {
			const { t, state, actions, openEditor } = props;
			const disabled = state.busy === true || state.writable !== true || state.picking === true;
			const workspaces = state.workspaces;
			const cards = workspaces.map((workspace, index) => {
				if (workspace === null || typeof workspace !== "object") return null;
				const path = typeof workspace.path === "string" ? workspace.path : "";
				return h(WorkspaceCard, {
					key: (path.length > 0 ? path : "workspace") + ":" + index,
					t,
					workspace,
					state,
					actions,
					openEditor,
				});
			});
			return h(
				"section",
				{ className: "mcpw-section", "aria-labelledby": "mcpw-workspaces-title" },
				h(
					"div",
					{ className: "mcpw-section-head" },
					h("h3", { id: "mcpw-workspaces-title", className: "mcpw-section-title" }, t("workspaces.title")),
					h(Button, {
						label: state.picking === true ? t("workspaces.picking") : t("workspaces.add"),
						variant: "primary",
						disabled,
						onClick: () => {
							void actions.addWorkspace();
						},
					}),
				),
				h("p", { className: "mcpw-hint" }, t("workspaces.hint")),
				workspaces.length === 0
					? h("div", { className: "mcpw-card" }, h("div", { className: "mcpw-empty" }, t("workspaces.empty")))
					: cards,
			);
		}
		//#endregion
		//#region server editor
		/**
		* The browser-side add-workspace dialog: paste an absolute path or pick an
		* already-registered workspace. Opened when the desktop native chooser
		* bridge is absent (a plain browser tab). Closed with Escape, Cancel, or a
		* backdrop click.
		*/
		function AddWorkspaceDialog(props) {
			const { t, existing, configured, busy, onSubmit, onClose } = props;
			const [draft, setDraft] = React.useState("");
			const [errorKey, setErrorKey] = React.useState(null);
			const [saving, setSaving] = React.useState(false);
			React.useEffect(() => {
				const onKeyDown = (event) => {
					if (event.key !== "Escape") return;
					event.stopPropagation();
					onClose();
				};
				window.addEventListener("keydown", onKeyDown);
				return () => {
					window.removeEventListener("keydown", onKeyDown);
				};
			}, [onClose]);
			React.useEffect(() => {
				const body = document.body;
				const previous = body.style.overflow;
				body.style.overflow = "hidden";
				return () => {
					body.style.overflow = previous;
				};
			}, []);
			const configuredKeys = new Set(
				stringList(configured)
					.filter((workspace) => workspace !== null && typeof workspace === "object" && typeof workspace.path === "string")
					.map((workspace) => pathKey(workspace.path)),
			);
			const candidates = stringList(existing).filter(
				(item) =>
					item !== null &&
					typeof item === "object" &&
					typeof item.path === "string" &&
					item.path.length > 0 &&
					!configuredKeys.has(pathKey(item.path)),
			);
			const submit = async (value) => {
				if (saving) return;
				const path = trimPath(text(value));
				if (path.length === 0 || !isAbsolutePath(path)) {
					setErrorKey("error.notAbsolute");
					return;
				}
				setSaving(true);
				setErrorKey(null);
				try {
					const result = typeof onSubmit === "function" ? await onSubmit(path) : { ok: false, error: "error.saveFailed" };
					if (result !== null && typeof result === "object" && result.ok === false) {
						setErrorKey(typeof result.error === "string" ? result.error : "error.saveFailed");
						setSaving(false);
						return;
					}
					onClose();
				} catch (error) {
					console.warn("[mcp-management] adding workspace failed:", error);
					setErrorKey("error.saveFailed");
					setSaving(false);
				}
			};
			const disabled = saving || busy === true;
			return h(
				"div",
				{
					className: "mcpw-backdrop",
					onMouseDown: (event) => {
						if (event.target === event.currentTarget) onClose();
					},
				},
				h(
					"div",
					{
						className: "mcpw-modal",
						role: "dialog",
						"aria-modal": "true",
						"aria-labelledby": "mcpw-add-workspace-title",
					},
					h("h2", { id: "mcpw-add-workspace-title", className: "mcpw-modal-title" }, t("addWorkspace.title")),
					h(
						"div",
						{ className: "mcpw-modal-body" },
						errorKey === null
							? null
							: h("div", { className: "mcpw-banner mcpw-banner--error", role: "alert" }, h("span", {}, t(errorKey))),
						h("p", { className: "mcpw-hint" }, t("addWorkspace.hint")),
						h(
							Field,
							{ label: t("addWorkspace.pathLabel"), htmlFor: "mcpw-add-workspace-path" },
							h("input", {
								id: "mcpw-add-workspace-path",
								className: "mcpw-input",
								type: "text",
								value: draft,
								disabled,
								autoFocus: true,
								spellCheck: false,
								placeholder: t("addWorkspace.pathPlaceholder"),
								onChange: (event) => {
									setDraft(event.target.value);
									if (errorKey !== null) setErrorKey(null);
								},
								onKeyDown: (event) => {
									if (event.key !== "Enter") return;
									event.preventDefault();
									void submit(draft);
								},
							}),
						),
						h(
							"div",
							{ className: "mcpw-field" },
							h("div", { className: "mcpw-field-label" }, t("addWorkspace.existing")),
							candidates.length === 0
								? h("div", { className: "mcpw-hint" }, t("addWorkspace.existingEmpty"))
								: h(
										"div",
										{ className: "mcpw-pick-list" },
										candidates.map((item) =>
											h(
												"button",
												{
													key: String(item.workspaceId ?? item.path),
													type: "button",
													className: "mcpw-pick-item",
													disabled,
													onClick: () => {
														void submit(item.path);
													},
												},
												h(
													"span",
													{ className: "mcpw-pick-title" },
													typeof item.title === "string" && item.title.length > 0 ? item.title : baseName(item.path),
												),
												h("span", { className: "mcpw-pick-path" }, item.path),
											),
										),
									),
						),
					),
					h(
						"div",
						{ className: "mcpw-modal-footer" },
						h(Button, { label: t("common.cancel"), disabled: saving, onClick: onClose }),
						h(Button, {
							label: saving ? t("addWorkspace.saving") : t("addWorkspace.submit"),
							variant: "primary",
							disabled,
							onClick: () => {
								void submit(draft);
							},
						}),
					),
				),
			);
		}
		/** The add/edit server modal, closed with Escape, the cancel button, or a backdrop click. */
		function ServerEditor(props) {
			const { t, mode, server, onSave, onClose } = props;
			const [draft, setDraft] = React.useState(() => draftFromServer(server));
			const [errorKey, setErrorKey] = React.useState(null);
			const [saving, setSaving] = React.useState(false);
			React.useEffect(() => {
				const onKeyDown = (event) => {
					if (event.key !== "Escape") return;
					event.stopPropagation();
					onClose();
				};
				window.addEventListener("keydown", onKeyDown);
				return () => {
					window.removeEventListener("keydown", onKeyDown);
				};
			}, [onClose]);
			React.useEffect(() => {
				const body = document.body;
				const previous = body.style.overflow;
				body.style.overflow = "hidden";
				return () => {
					body.style.overflow = previous;
				};
			}, []);
			const set = (field, value) => {
				setDraft((previous) => ({ ...previous, [field]: value }));
				if (errorKey !== null) setErrorKey(null);
			};
			const submit = async () => {
				if (saving) return;
				if (!SERVER_NAME_PATTERN.test(draft.serverName.trim())) {
					setErrorKey("error.name");
					return;
				}
				setSaving(true);
				setErrorKey(null);
				try {
					const result = typeof onSave === "function" ? await onSave(draft) : { ok: false, error: "error.saveFailed" };
					if (result !== null && typeof result === "object" && result.ok === false) {
						setErrorKey(typeof result.error === "string" ? result.error : "error.saveFailed");
						setSaving(false);
						return;
					}
					onClose();
				} catch (error) {
					console.warn("[mcp-management] saving server failed:", error);
					setErrorKey("error.saveFailed");
					setSaving(false);
				}
			};
			const nameInvalid = draft.serverName.trim().length > 0 && !SERVER_NAME_PATTERN.test(draft.serverName.trim());
			const stdio = draft.transport !== TRANSPORT_HTTP;
			return h(
				"div",
				{
					className: "mcpw-backdrop",
					onMouseDown: (event) => {
						if (event.target === event.currentTarget) onClose();
					},
				},
				h(
					"div",
					{
						className: "mcpw-modal",
						role: "dialog",
						"aria-modal": "true",
						"aria-labelledby": "mcpw-editor-title",
					},
					h("h2", { id: "mcpw-editor-title", className: "mcpw-modal-title" }, t(mode === "edit" ? "editor.editTitle" : "editor.addTitle")),
					h(
						"div",
						{ className: "mcpw-modal-body" },
						errorKey === null
							? null
							: h("div", { className: "mcpw-banner mcpw-banner--error", role: "alert" }, h("span", {}, t(errorKey))),
						h(
							Field,
							{
								label: t("field.serverName"),
								hint: t("field.serverNameHint"),
								htmlFor: "mcpw-editor-name",
								required: true,
							},
							h("input", {
								id: "mcpw-editor-name",
								className: "mcpw-input",
								type: "text",
								value: draft.serverName,
								disabled: saving,
								autoFocus: true,
								spellCheck: false,
								"aria-invalid": nameInvalid ? "true" : "false",
								onChange: (event) => set("serverName", event.target.value),
							}),
						),
						h(
							Field,
							{ label: t("field.transport"), htmlFor: "mcpw-editor-transport" },
							h(
								"select",
								{
									id: "mcpw-editor-transport",
									className: "mcpw-select",
									value: stdio ? TRANSPORT_STDIO : TRANSPORT_HTTP,
									disabled: saving,
									onChange: (event) => set("transport", event.target.value),
								},
								h("option", { value: TRANSPORT_STDIO }, t("field.transport.stdio")),
								h("option", { value: TRANSPORT_HTTP }, t("field.transport.http")),
							),
						),
						stdio
							? h(
									React.Fragment,
									null,
									h(
										Field,
										{ label: t("field.command"), hint: t("field.commandHint"), htmlFor: "mcpw-editor-command" },
										h("input", {
											id: "mcpw-editor-command",
											className: "mcpw-input",
											type: "text",
											value: draft.command,
											disabled: saving,
											placeholder: "npx",
											onChange: (event) => set("command", event.target.value),
										}),
									),
									h(
										Field,
										{ label: t("field.args"), hint: t("field.argsHint"), htmlFor: "mcpw-editor-args" },
										h("textarea", {
											id: "mcpw-editor-args",
											className: "mcpw-textarea",
											rows: 3,
											value: draft.args,
											disabled: saving,
											onChange: (event) => set("args", event.target.value),
										}),
									),
									h(
										Field,
										{ label: t("field.env"), hint: t("field.envHint"), htmlFor: "mcpw-editor-env" },
										h("textarea", {
											id: "mcpw-editor-env",
											className: "mcpw-textarea",
											rows: 3,
											value: draft.env,
											disabled: saving,
											spellCheck: false,
											placeholder: "API_KEY=${env:MY_API_KEY}",
											onChange: (event) => set("env", event.target.value),
										}),
									),
									h(
										Field,
										{ label: t("field.cwd"), hint: t("field.cwdHint"), htmlFor: "mcpw-editor-cwd" },
										h("input", {
											id: "mcpw-editor-cwd",
											className: "mcpw-input",
											type: "text",
											value: draft.cwd,
											disabled: saving,
											spellCheck: false,
											onChange: (event) => set("cwd", event.target.value),
										}),
									),
								)
							: h(
									React.Fragment,
									null,
									h(
										Field,
										{ label: t("field.url"), hint: t("field.urlHint"), htmlFor: "mcpw-editor-url" },
										h("input", {
											id: "mcpw-editor-url",
											className: "mcpw-input",
											type: "text",
											value: draft.url,
											disabled: saving,
											spellCheck: false,
											placeholder: "https://example.com/mcp",
											onChange: (event) => set("url", event.target.value),
										}),
									),
									h(
										Field,
										{ label: t("field.headers"), hint: t("field.headersHint"), htmlFor: "mcpw-editor-headers" },
										h("textarea", {
											id: "mcpw-editor-headers",
											className: "mcpw-textarea",
											rows: 3,
											value: draft.headers,
											disabled: saving,
											spellCheck: false,
											placeholder: "Authorization: Bearer ${env:MY_TOKEN}",
											onChange: (event) => set("headers", event.target.value),
										}),
									),
								),
						h(
							"div",
							{ className: "mcpw-checks" },
							h(
								"label",
								{ className: "mcpw-check" },
								h("input", {
									type: "checkbox",
									checked: draft.enabled,
									disabled: saving,
									onChange: (event) => set("enabled", event.target.checked),
								}),
								t("field.enabled"),
							),
							h("div", { className: "mcpw-hint" }, t("field.enabledHint")),
							h(
								"label",
								{ className: "mcpw-check" },
								h("input", {
									type: "checkbox",
									checked: draft.failOnStartupError,
									disabled: saving,
									onChange: (event) => set("failOnStartupError", event.target.checked),
								}),
								t("field.failOnStartupError"),
							),
							h("div", { className: "mcpw-hint" }, t("field.failOnStartupErrorHint")),
						),
					),
					h(
						"div",
						{ className: "mcpw-modal-footer" },
						h(Button, { label: t("server.cancel"), disabled: saving, onClick: onClose }),
						h(Button, {
							label: saving ? t("server.saving") : t("server.save"),
							variant: "primary",
							disabled: saving,
							onClick: () => {
								void submit();
							},
						}),
					),
				),
			);
		}
		//#endregion
		//#region page
		/** Stable selector for the page snapshot hook. */
		function selectSnapshot(snapshot) {
			return snapshot;
		}
		/** Selector for the standard `useWorkspaces` hook: the registered workspace list. */
		function selectWorkspaceItems(snapshot) {
			return snapshot !== null && typeof snapshot === "object" && Array.isArray(snapshot.items) ? snapshot.items : EMPTY_LIST;
		}
		/** The Settings → MCP Workspaces page. */
		function Page(props) {
			const t = typeof props.t === "function" ? props.t : (key) => key;
			const useSnapshot = props.useMcpWorkspaces;
			// The injected hook exists for the whole lifetime of this page; the guard is
			// only a defensive fallback for a partially composed deployment.
			const state = typeof useSnapshot === "function" ? useSnapshot(selectSnapshot) : NO_STATE;
			// Standard settings-section prop: registered workspaces, offered as quick picks.
			const workspaceItems = typeof props.useWorkspaces === "function" ? props.useWorkspaces(selectWorkspaceItems) : EMPTY_LIST;
			const [editor, setEditor] = React.useState(null);
			const openEditor = React.useCallback((scope, index, server) => {
				setEditor({ scope, index: index === void 0 ? null : index, server: server === void 0 ? null : server });
			}, []);
			const closeEditor = React.useCallback(() => {
				setEditor(null);
			}, []);
			const submitServer = React.useCallback(
				async (draft) => {
					if (editor === null) return { ok: false, error: "error.saveFailed" };
					if (typeof props.saveServer !== "function") return { ok: false, error: "error.saveFailed" };
					return props.saveServer(editor.scope, editor.index, draft);
				},
				[editor, props.saveServer],
			);
			const ready = state.status === "ready";
			const banners = [];
			if (state.status === "loading")
				banners.push(h("div", { key: "loading", className: "mcpw-banner", role: "status" }, h("span", {}, t("loading"))));
			if (!ready && state.status !== "loading")
				banners.push(
					h(
						"div",
						{ key: "unavailable", className: "mcpw-banner mcpw-banner--error", role: "alert" },
						h("span", {}, t("unavailable")),
					),
				);
			if (ready && state.writable !== true)
				banners.push(h("div", { key: "read-only", className: "mcpw-banner mcpw-banner--warn", role: "status" }, h("span", {}, t("readOnly"))));
			if (state.error !== null && state.error !== void 0)
				banners.push(
					h(
						"div",
						{ key: "error", className: "mcpw-banner mcpw-banner--error", role: "alert" },
						h("span", {}, t(state.error)),
						h(Button, {
							label: t("common.dismiss"),
							variant: "ghost",
							disabled: false,
							onClick: () => {
								if (typeof props.clearError === "function") props.clearError();
							},
						}),
					),
				);
			const actions = {
				setServerEnabled: (scope, index, enabled) => {
					if (typeof props.setServerEnabled === "function") return props.setServerEnabled(scope, index, enabled);
					return Promise.resolve({ ok: false });
				},
				removeServer: (scope, index) => {
					if (typeof props.removeServer === "function") return props.removeServer(scope, index);
					return Promise.resolve({ ok: false });
				},
				addWorkspace: () => {
					if (typeof props.addWorkspace === "function") return props.addWorkspace();
					return Promise.resolve({ ok: false });
				},
				submitWorkspacePath: (path) => {
					if (typeof props.submitWorkspacePath === "function") return props.submitWorkspacePath(path);
					return Promise.resolve({ ok: false });
				},
				closeAddWorkspace: () => {
					if (typeof props.closeAddWorkspace === "function") return props.closeAddWorkspace();
					return Promise.resolve({ ok: true });
				},
				removeWorkspace: (path) => {
					if (typeof props.removeWorkspace === "function") return props.removeWorkspace(path);
					return Promise.resolve({ ok: false });
				},
				renameWorkspace: (path, title) => {
					if (typeof props.renameWorkspace === "function") return props.renameWorkspace(path, title);
					return Promise.resolve({ ok: false });
				},
			};
			const addDialog =
				ready && state.addOpen === true
					? h(AddWorkspaceDialog, {
							t,
							existing: workspaceItems,
							configured: state.workspaces,
							busy: state.busy === true,
							onSubmit: actions.submitWorkspacePath,
							onClose: () => {
								void actions.closeAddWorkspace();
							},
						})
					: null;
			return h(
				"div",
				{ className: "mcpw-root" },
				h("style", { key: "style" }, STYLE),
				h(
					"div",
					{ className: "mcpw-head" },
					h("h2", { className: "mcpw-title" }, t("title")),
					h("p", { className: "mcpw-desc" }, t("description")),
					h("p", { className: "mcpw-hint" }, t("fileHint")),
				),
				banners,
				addDialog,
				ready
					? h(
							React.Fragment,
							null,
							h(DefaultsSection, { t, state, actions, openEditor }),
							h(WorkspacesSection, { t, state, actions, openEditor }),
						)
					: null,
				ready
					? h("div", { className: "mcpw-status", role: "status", "aria-live": "polite" }, state.busy ? t("saving") : "")
					: null,
				ready && editor !== null
					? h(ServerEditor, {
							key:
								serverScopeKey(editor.scope) +
								":" +
								(editor.index === null ? "new" : String(editor.index)) +
								":" +
								(editor.server === null ? "" : serverName(editor.server)),
							t,
							mode: editor.index === null ? "add" : "edit",
							server: editor.server,
							onSave: submitServer,
							onClose: closeEditor,
						})
					: null,
			);
		}
		//#endregion
		//#region plugin
		/** Required Cordis services for this page. */
		const inject = ["slots", "locale", "configForms", "uiWorkspace"];
		/**
		* Register the settings page while the Host serves this plugin's namespace, and
		* bind the config form that backs it.
		* @param ctx - the browser plugin context.
		*/
		function apply(ctx) {
			ctx.effect(
				() =>
					ctx.locale.register(NS, {
						zh,
						en,
					}),
				"mcp-management: dictionaries",
			);
			const t = ctx.locale.bind(NS);
			const form = ctx.configForms.get(ENTRY_ID);
			const controller = new WorkspaceController(ctx, form);
			ctx.effect(
				() => () => {
					controller.dispose();
				},
				"mcp-management: form subscription",
			);
			ctx.effect(
				() =>
					ctx.configForms.whileServed([ENTRY_ID], () =>
						ctx.slots.inject("settings.section", () =>
							ctx.slots.register(
								{
									name: "settings.section",
									id: ENTRY_ID,
									order: 16,
									label: () => t("title"),
									locale: NS,
									inject: () => controller.inject(),
								},
								Page,
							),
						),
					),
				"mcp-management: settings page",
			);
		}
		//#endregion
		exports.NS = NS;
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	},
});
