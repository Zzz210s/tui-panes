/**
 * 多面板管理:打开/关闭/切换焦点/统一尺寸,并向宿主汇报脏状态
 */

import { Pane, type PaneSnapshot, type PaneSpec } from "./pane.ts";

export interface PaneManagerOptions {
	/** 面板内容变化或结构变化时回调(宿主据此节流重绘) */
	onDirty: () => void;
	/** 面板数量上限 */
	maxPanes?: number;
}

export class PaneManager {
	private panes: Pane[] = [];
	private focusedIndex = -1;
	private dirty = false;
	private readonly onDirty: () => void;
	private readonly maxPanes: number;

	constructor(options: PaneManagerOptions) {
		this.onDirty = options.onDirty;
		this.maxPanes = options.maxPanes ?? 4;
	}

	get size(): number {
		return this.panes.length;
	}

	/** 当前聚焦的面板下标;-1 表示焦点在宿主(如列表) */
	get focused(): number {
		return this.focusedIndex;
	}

	list(): { id: string; title: string; exited: boolean; focused: boolean }[] {
		return this.panes.map((pane, index) => ({
			id: pane.id,
			title: pane.title,
			exited: pane.exited,
			focused: index === this.focusedIndex,
		}));
	}

	find(id: string): number {
		return this.panes.findIndex((pane) => pane.id === id);
	}

	/** 打开面板;已存在则聚焦。返回 false 表示已达上限 */
	async open(spec: PaneSpec, cols: number, rows: number): Promise<boolean> {
		const existing = this.find(spec.id);
		if (existing >= 0) {
			this.focusedIndex = existing;
			this.onDirty();
			return true;
		}
		if (this.panes.length >= this.maxPanes) return false;
		const pane = await Pane.create(spec, cols, rows, () => this.markDirty(), () => this.markDirty());
		this.panes.push(pane);
		this.focusedIndex = this.panes.length - 1;
		this.onDirty();
		return true;
	}

	close(index = this.focusedIndex): boolean {
		if (index < 0 || index >= this.panes.length) return false;
		this.panes[index].kill();
		this.panes.splice(index, 1);
		this.focusedIndex = this.panes.length === 0 ? -1 : Math.min(index, this.panes.length - 1);
		this.onDirty();
		return true;
	}

	/** 焦点在面板间循环;走到末尾后回到宿主(-1) */
	cycleFocus(): number {
		if (this.panes.length === 0) return -1;
		this.focusedIndex = this.focusedIndex + 1 >= this.panes.length ? -1 : this.focusedIndex + 1;
		this.onDirty();
		return this.focusedIndex;
	}

	unfocus(): void {
		this.focusedIndex = -1;
		this.onDirty();
	}

	/** 尺寸变化:按面板数量平均分配高度 */
	resize(width: number, height: number): void {
		if (this.panes.length === 0) return;
		const rows = Math.max(4, Math.floor(height / this.panes.length) - 1);
		for (const pane of this.panes) pane.resize(Math.max(20, width), rows);
	}

	/** 下一个面板应使用的尺寸(打开前计算) */
	layoutSize(width: number, height: number): { cols: number; rows: number } {
		const count = Math.max(1, this.panes.length + 1);
		return { cols: Math.max(20, width), rows: Math.max(4, Math.floor(height / count) - 1) };
	}

	writeFocused(data: string): boolean {
		const pane = this.panes[this.focusedIndex];
		if (!pane) return false;
		pane.write(data);
		return true;
	}

	snapshots(): { id: string; title: string; focused: boolean; snapshot: PaneSnapshot }[] {
		return this.panes.map((pane, index) => ({
			id: pane.id,
			title: pane.exited ? `${pane.title} (已退出)` : pane.title,
			focused: index === this.focusedIndex,
			snapshot: pane.snapshot(),
		}));
	}

	markDirty(): void {
		this.dirty = true;
		this.onDirty();
	}

	/** 取走脏标记(避免重复重绘) */
	consumeDirty(): boolean {
		const value = this.dirty;
		this.dirty = false;
		return value;
	}

	closeAll(): void {
		for (const pane of this.panes) pane.kill();
		this.panes = [];
		this.focusedIndex = -1;
	}
}
