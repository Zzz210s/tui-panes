/**
 * 分屏面板的纯渲染:把终端单元格(字符 + 属性)转成 ANSI 行,并给面板加边框标题
 * 与 xterm 无关,可单测。
 */

export interface CellStyle {
	fg?: number;
	bg?: number;
	/** fg/bg 是否为 RGB(true)还是 256 色索引(false) */
	fgRgb?: boolean;
	bgRgb?: boolean;
	bold?: boolean;
	dim?: boolean;
	inverse?: boolean;
	underline?: boolean;
}

export interface Cell {
	chars: string;
	style: CellStyle;
	/** 单元格宽度(宽字符占 2 列,后续列 chars 为空) */
	width: number;
}

function rgbParts(value: number): [number, number, number] {
	return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

/** 属性 → SGR 序列(纯函数) */
export function styleToSgr(style: CellStyle): string {
	const parts: string[] = [];
	if (style.bold) parts.push("1");
	if (style.dim) parts.push("2");
	if (style.underline) parts.push("4");
	if (style.inverse) parts.push("7");
	if (style.fg !== undefined) {
		if (style.fgRgb) {
			const [r, g, b] = rgbParts(style.fg);
			parts.push(`38;2;${r};${g};${b}`);
		} else {
			parts.push(`38;5;${style.fg}`);
		}
	}
	if (style.bg !== undefined) {
		if (style.bgRgb) {
			const [r, g, b] = rgbParts(style.bg);
			parts.push(`48;2;${r};${g};${b}`);
		} else {
			parts.push(`48;5;${style.bg}`);
		}
	}
	return parts.length ? `\u001b[${parts.join(";")}m` : "";
}

function sameStyle(a: CellStyle, b: CellStyle): boolean {
	return (
		a.fg === b.fg &&
		a.bg === b.bg &&
		Boolean(a.fgRgb) === Boolean(b.fgRgb) &&
		Boolean(a.bgRgb) === Boolean(b.bgRgb) &&
		Boolean(a.bold) === Boolean(b.bold) &&
		Boolean(a.dim) === Boolean(b.dim) &&
		Boolean(a.inverse) === Boolean(b.inverse) &&
		Boolean(a.underline) === Boolean(b.underline)
	);
}

const RESET = "\u001b[0m";

/** 单元格行 → ANSI 字符串(仅在属性变化时输出 SGR,减少转义体积) */
export function cellsToAnsi(cells: Cell[], width: number): string {
	let out = "";
	let current: CellStyle = {};
	let used = 0;
	for (const cell of cells) {
		if (used >= width) break;
		// 宽字符的占位单元格(chars 为空)不输出,否则会多出一个空格导致错位
		if (!cell.chars) continue;
		if (!sameStyle(current, cell.style)) {
			out += RESET + styleToSgr(cell.style);
			current = cell.style;
		}
		out += cell.chars;
		used += cell.width || 1;
	}
	if (used < width) out += " ".repeat(width - used);
	return out + RESET;
}

/** 面板标题栏(纯函数):▏标题 … 尺寸 */
export function paneTitle(title: string, focused: boolean, width: number): string {
	const mark = focused ? "*" : " ";
	const text = `${mark} ${title}`;
	const label = text.length > width ? `${text.slice(0, Math.max(0, width - 1))}~` : text;
	return `\u001b[7m${label.padEnd(width)}\u001b[0m`;
}

export interface PaneFrame {
	title: string;
	lines: string[];
	focused: boolean;
}

/**
 * 把若干面板组合成右侧区域的逐行内容(每个面板占一部分高度)。
 * 返回长度 = height 的行数组;面板不足时用空行补齐。
 */
export function composePanes(frames: PaneFrame[], width: number, height: number): string[] {
	if (frames.length === 0) return Array.from({ length: height }, () => " ".repeat(width));
	const perPane = Math.floor(height / frames.length);
	const out: string[] = [];
	for (const [index, frame] of frames.entries()) {
		const isLast = index === frames.length - 1;
		const rows = isLast ? height - perPane * index : perPane;
		out.push(paneTitle(frame.title, frame.focused, width));
		for (let row = 1; row < rows; row++) {
			out.push(frame.lines[row - 1] ?? "");
		}
	}
	while (out.length < height) out.push("");
	return out.slice(0, height);
}
