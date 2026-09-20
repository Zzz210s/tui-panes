/**
 * ai-session-hub 拓展入口:把分屏引擎接到宿主的拓展接口上
 *
 * 宿主(ai-session-hub)在运行时加载本模块并调用 createHubExtension(),
 * 得到的对象按约定提供:bodyView(接管主体区渲染)、openSelected(Enter 打开)、
 * handleKey / handleRawInput(按键)、onResize、dispose。
 * 本模块只依赖宿主暴露的上下文(会话信息 + 尺寸 + 重绘),不 import 宿主源码。
 */

import { createPaneIntegration, type PaneIntegration } from "./integration.ts";
import { composePanes, type PaneFrame } from "./render.ts";
import type { PaneSpec } from "./pane.ts";

/** 宿主传入的会话信息(约定形状:见 ai-session-hub/src/extensions.ts) */
interface HostSession {
	id: string;
	title: string;
	tool?: string;
	cwd?: string;
	/** 恢复该会话的命令(宿主负责构造) */
	command: string;
	state?: string;
}

interface HostContext {
	selected(): HostSession | undefined;
	metrics(): { leftWidth: number; rightWidth: number; bodyHeight: number };
	notify(message: string): void;
	redraw(): void;
	schedule(): void;
}

interface HostKey {
	readonly char?: string;
}

export interface HubExtensionLike {
	name: string;
	hints: string[];
	bodyView(ctx: HostContext): string[] | undefined;
	openSelected(ctx: HostContext): Promise<void>;
	handleKey(key: unknown, ctx: HostContext): boolean | Promise<boolean>;
	handleRawInput(text: string, ctx: HostContext): boolean;
	onResize(ctx: HostContext): void;
	dispose(): void;
}

/** 创建拓展实例(宿主调用) */
export function createHubExtension(): HubExtensionLike {
	let integration: PaneIntegration | null = null;
	let context: HostContext | null = null;

	/** 惰性创建引擎(首次使用时才知道宿主上下文) */
	const ensure = (ctx: HostContext): PaneIntegration => {
		context = ctx;
		if (integration) return integration;
		integration = createPaneIntegration({
			selectedSpec: () => {
				const session = context?.selected();
				if (!session) return undefined;
				const spec: PaneSpec = { id: session.id, title: session.title, command: session.command, cwd: session.cwd };
				return spec;
			},
			metrics: () => {
				const { rightWidth, bodyHeight } = context?.metrics() ?? { rightWidth: 80, bodyHeight: 20 };
				return { rightWidth, bodyHeight };
			},
			redraw: () => context?.redraw(),
			schedule: () => context?.schedule(),
			notify: (message) => context?.notify(message),
		});
		return integration;
	};

	const keyChar = (key: unknown): string | undefined => {
		if (typeof key === "string") return key.length === 1 ? key : undefined;
		if (key && typeof key === "object") return (key as HostKey).char;
		return undefined;
	};

	return {
		name: "tui-panes",
		hints: ["Enter 分屏打开"],

		/** 接管主体区:把各面板的可见区域合成成整块内容 */
		bodyView(ctx: HostContext) {
			if (!integration || integration.manager.size === 0) return undefined;
			const { rightWidth, bodyHeight } = ctx.metrics();
			const frames: PaneFrame[] = integration.snapshots()!.map((entry) => ({ title: entry.title, focused: entry.focused, lines: entry.lines }));
			return composePanes(frames, rightWidth, bodyHeight);
		},

		/** Enter / p:在分屏里打开选中会话 */
		async openSelected(ctx: HostContext) {
			await ensure(ctx).open();
		},

		async handleKey(key: unknown, ctx: HostContext) {
			const engine = ensure(ctx);
			const ch = keyChar(key);
			if (ch === "p") {
				await engine.open();
				return true;
			}
			if (ch === "x") {
				engine.close();
				return true;
			}
			if (ch === "\t") {
				engine.cycle();
				return true;
			}
			return false;
		},

		/** 面板聚焦时按键直达会话(Ctrl+Q 回到列表 / Ctrl+W 关闭由引擎处理) */
		handleRawInput(text: string) {
			if (!integration || integration.manager.focused < 0) return false;
			return integration.handleFocusedInput(text);
		},

		onResize() {
			integration?.syncSize();
		},

		dispose() {
			integration?.dispose();
			integration = null;
		},
	};
}
