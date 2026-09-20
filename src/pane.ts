/**
 * 一个面板 = 一个 PTY 进程 + 一份 @xterm/headless 屏幕缓冲
 * 面板的输出由终端仿真器解析成屏幕,再把可见区域取出来交给宿主 TUI 渲染,
 * 因此面板不占用整屏,可以与列表等其它 UI 并存。
 *
 * shell 适配(参数形态)在 shell.ts:bash / PowerShell / cmd 各不相同。
 */

import { cellsToAnsi, type Cell, type CellStyle } from "./render.ts";
import { defaultShell, shellArgs } from "./shell.ts";

export interface PaneSpec {
	/** 面板标识(宿主用来去重/查找) */
	id: string;
	/** 面板标题(显示在标题栏) */
	title: string;
	/** 要运行的命令(经 shell 执行) */
	command: string;
	/** 工作目录 */
	cwd?: string;
	/** 启动命令用的 shell(默认自动探测 Git Bash / PowerShell) */
	shell?: string;
}

export interface PaneSnapshot {
	lines: string[];
	cols: number;
	rows: number;
	exited: boolean;
	exitCode?: number;
}

interface PtyProcess {
	write(data: string): void;
	resize(cols: number, rows: number): void;
	kill(): void;
	onData(handler: (data: string) => void): void;
	onExit(handler: (event: { exitCode: number }) => void): void;
}

interface PaneInternals {
	pty: PtyProcess;
	term: { write(data: string): void; resize(cols: number, rows: number): void; dispose(): void };
}

export class Pane {
	readonly id: string;
	readonly title: string;
	readonly command: string;
	exited = false;
	exitCode?: number;
	private internals: PaneInternals | null = null;
	private cols: number;
	private rows: number;
	private readonly onDirty: () => void;
	private readonly onExit: (code: number) => void;

	private constructor(spec: PaneSpec, cols: number, rows: number, onDirty: () => void, onExit: (code: number) => void) {
		this.id = spec.id;
		this.title = spec.title;
		this.command = spec.command;
		this.cols = cols;
		this.rows = rows;
		this.onDirty = onDirty;
		this.onExit = onExit;
	}

	/** 创建并启动面板(需要 node-pty 与 @xterm/headless 已安装) */
	static async create(spec: PaneSpec, cols: number, rows: number, onDirty: () => void, onExit: (code: number) => void): Promise<Pane> {
		const pane = new Pane(spec, cols, rows, onDirty, onExit);
		await pane.start(spec);
		return pane;
	}

	private async start(spec: PaneSpec): Promise<void> {
		const [ptyModule, xtermModule] = await Promise.all([import("node-pty"), import("@xterm/headless")]);
		const pty = (ptyModule.default ?? ptyModule) as unknown as {
			spawn: (file: string, args: string[], options: Record<string, unknown>) => PtyProcess;
		};
		const xtermAny = xtermModule as unknown as {
			Terminal?: new (options: Record<string, unknown>) => PaneInternals["term"];
			default?: { Terminal?: new (options: Record<string, unknown>) => PaneInternals["term"] };
		};
		const Terminal = xtermAny.Terminal ?? xtermAny.default?.Terminal;
		if (!pty?.spawn) throw new Error("node-pty 不可用(未安装或原生模块加载失败)");
		if (!Terminal) throw new Error("@xterm/headless 不可用(未安装)");

		const term = new Terminal({ cols: this.cols, rows: this.rows, allowProposedApi: true, scrollback: 2000 });
		const shell = spec.shell ?? defaultShell();
		const child = pty.spawn(shell, shellArgs(shell, spec.command), {
			name: "xterm-256color",
			cols: this.cols,
			rows: this.rows,
			cwd: spec.cwd || process.cwd(),
			env: { ...process.env, TERM: "xterm-256color" } as Record<string, string>,
		});
		child.onData((data: string) => {
			term.write(data);
			this.onDirty();
		});
		child.onExit(({ exitCode }: { exitCode: number }) => {
			this.exited = true;
			this.exitCode = exitCode;
			this.onDirty();
			this.onExit(exitCode);
		});
		this.internals = { pty: child, term };
	}

	write(data: string): void {
		if (this.exited) return;
		this.internals?.pty.write(data);
	}

	resize(cols: number, rows: number): void {
		if (cols === this.cols && rows === this.rows) return;
		this.cols = cols;
		this.rows = rows;
		try {
			this.internals?.pty.resize(cols, rows);
			this.internals?.term.resize(cols, rows);
		} catch {
			/* 已退出 */
		}
	}

	/** 取可见区域的 ANSI 行(交给宿主组合渲染) */
	snapshot(): PaneSnapshot {
		if (!this.internals) return { lines: [], cols: this.cols, rows: this.rows, exited: this.exited, exitCode: this.exitCode };
		const buffer = (this.internals.term as unknown as { buffer: { active: { getLine(y: number): XtermLine | undefined } } }).buffer.active;
		const lines: string[] = [];
		for (let y = 0; y < this.rows; y++) {
			const line = buffer.getLine(y);
			lines.push(line ? cellsToAnsi(readCells(line, this.cols), this.cols) : " ".repeat(this.cols));
		}
		return { lines, cols: this.cols, rows: this.rows, exited: this.exited, exitCode: this.exitCode };
	}

	kill(): void {
		try {
			this.internals?.pty.kill();
		} catch {
			/* 已退出 */
		}
		this.internals?.term.dispose();
		this.internals = null;
	}
}

interface XtermLine {
	getCell(x: number): XtermCell | undefined;
}

interface XtermCell {
	getChars(): string;
	getWidth?(): number;
	getFgColor(): number;
	getBgColor(): number;
	isFgRGB?(): boolean;
	isBgRGB?(): boolean;
	isBold?(): boolean;
	isDim?(): boolean;
	isInverse?(): boolean;
	isUnderline?(): boolean;
	isFgDefault?(): boolean;
	isBgDefault?(): boolean;
}

function readCells(line: XtermLine, width: number): Cell[] {
	const cells: Cell[] = [];
	for (let x = 0; x < width; x++) {
		const cell = line.getCell(x);
		if (!cell) {
			cells.push({ chars: " ", style: {}, width: 1 });
			continue;
		}
		const style: CellStyle = {};
		if (!(cell.isFgDefault?.() ?? false)) {
			style.fg = cell.getFgColor();
			style.fgRgb = cell.isFgRGB?.() ?? false;
		}
		if (!(cell.isBgDefault?.() ?? false)) {
			style.bg = cell.getBgColor();
			style.bgRgb = cell.isBgRGB?.() ?? false;
		}
		if (cell.isBold?.()) style.bold = true;
		if (cell.isDim?.()) style.dim = true;
		if (cell.isInverse?.()) style.inverse = true;
		if (cell.isUnderline?.()) style.underline = true;
		cells.push({ chars: cell.getChars(), style, width: cell.getWidth?.() ?? 1 });
	}
	return cells;
}
