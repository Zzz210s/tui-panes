/**
 * 与宿主 TUI 的接线:宿主提供"当前选中项 / 可用尺寸 / 重绘 / 提示",
 * 本模块负责面板的打开、关闭、焦点、输入转发与尺寸同步。
 *
 * 逃生键(面板聚焦时):Ctrl+Q 回到宿主焦点,Ctrl+W 关闭面板。
 */

import { PaneManager } from "./manager.ts";
import type { PaneSpec } from "./pane.ts";

export interface PaneHost {
	/** 当前选中项对应的面板规格(无选中返回 undefined) */
	selectedSpec(): PaneSpec | undefined;
	/** 面板可用区域尺寸 */
	metrics(): { rightWidth: number; bodyHeight: number };
	/** 立即重绘 */
	redraw(): void;
	/** 请求节流重绘(面板输出频繁时用) */
	schedule(): void;
	/** 提示信息(宿主展示给用户) */
	notify(message: string): void;
}

export interface PaneIntegration {
	readonly manager: PaneManager;
	open(): Promise<void>;
	close(): void;
	cycle(): void;
	/** 面板聚焦时把按键交给会话;返回 true 表示已消费 */
	handleFocusedInput(text: string): boolean;
	syncSize(): void;
	dispose(): void;
	snapshots(): { title: string; focused: boolean; lines: string[] }[] | undefined;
}

const FOCUS_ESCAPE = "\u0011"; // Ctrl+Q
const CLOSE_ESCAPE = "\u0017"; // Ctrl+W

export function createPaneIntegration(host: PaneHost, maxPanes = 4): PaneIntegration {
	const manager = new PaneManager({ onDirty: () => host.schedule(), maxPanes });

	const syncSize = (): void => {
		if (manager.size === 0) return;
		const { rightWidth, bodyHeight } = host.metrics();
		manager.resize(rightWidth, bodyHeight);
	};

	const open = async (): Promise<void> => {
		const spec = host.selectedSpec();
		if (!spec) return;
		const { rightWidth, bodyHeight } = host.metrics();
		const size = manager.layoutSize(rightWidth, bodyHeight);
		try {
			const ok = await manager.open(spec, size.cols, size.rows);
			host.notify(ok ? `已打开面板「${spec.title}」` : "面板数量已达上限,先关闭一个(Ctrl+W 或 x)");
		} catch (error) {
			host.notify(`面板不可用:${error instanceof Error ? error.message : String(error)}`);
		}
		syncSize();
		host.redraw();
	};

	const close = (): void => {
		if (manager.focused >= 0) {
			manager.close(manager.focused);
			host.notify("已关闭聚焦面板");
		} else {
			const spec = host.selectedSpec();
			const index = spec ? manager.find(spec.id) : -1;
			if (index >= 0) {
				manager.close(index);
				host.notify("已关闭该面板");
			} else {
				host.notify("当前没有可关闭的面板");
			}
		}
		syncSize();
		host.redraw();
	};

	return {
		manager,
		open,
		close,
		cycle: () => {
			manager.cycleFocus();
			host.redraw();
		},
		handleFocusedInput(text) {
			if (manager.focused < 0) return false;
			if (text === FOCUS_ESCAPE) {
				manager.unfocus();
				host.redraw();
				return true;
			}
			if (text === CLOSE_ESCAPE) {
				close();
				return true;
			}
			manager.writeFocused(text);
			host.schedule();
			return true;
		},
		syncSize,
		dispose: () => manager.closeAll(),
		snapshots() {
			if (manager.size === 0) return undefined;
			return manager.snapshots().map((entry) => ({ title: entry.title, focused: entry.focused, lines: entry.snapshot.lines }));
		},
	};
}
