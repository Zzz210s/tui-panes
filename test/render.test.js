import assert from "node:assert/strict";
import { test } from "node:test";
import { cellsToAnsi, composePanes, paneTitle, styleToSgr } from "../src/render.ts";

const cell = (chars, style = {}, width = 1) => ({ chars, style, width });

test("styleToSgr:粗体/暗淡/下划线/反显", () => {
	assert.equal(styleToSgr({}), "");
	assert.equal(styleToSgr({ bold: true }), "\u001b[1m");
	assert.equal(styleToSgr({ dim: true, underline: true }), "\u001b[2;4m");
	assert.equal(styleToSgr({ inverse: true }), "\u001b[7m");
});

test("styleToSgr:256 色与 RGB 前景/背景", () => {
	assert.equal(styleToSgr({ fg: 114 }), "\u001b[38;5;114m");
	assert.equal(styleToSgr({ bg: 236 }), "\u001b[48;5;236m");
	assert.equal(styleToSgr({ fg: 0xff8800, fgRgb: true }), "\u001b[38;2;255;136;0m");
	assert.equal(styleToSgr({ bg: 0x112233, bgRgb: true }), "\u001b[48;2;17;34;51m");
});

test("cellsToAnsi:按可见宽度输出,属性变化时才写 SGR", () => {
	const cells = [cell("a"), cell("b"), cell("c", { bold: true }), cell("d", { bold: true })];
	const ansi = cellsToAnsi(cells, 4);
	assert.equal(ansi.replace(/\u001b\[[0-9;]*m/g, ""), "abcd");
	// 只应在粗体开始处出现一次 SGR(前两个默认属性不写)
	assert.equal(ansi.split("\u001b[1m").length - 1, 1);
});

test("cellsToAnsi:不足宽度补空格,超出宽度截断", () => {
	assert.equal(cellsToAnsi([cell("x")], 4).replace(/\u001b\[[0-9;]*m/g, ""), "x   ");
	assert.equal(cellsToAnsi([cell("a"), cell("b"), cell("c")], 2).replace(/\u001b\[[0-9;]*m/g, ""), "ab");
});

test("cellsToAnsi:宽字符占两列(后续空单元格不重复输出)", () => {
	const cells = [cell("中", {}, 2), cell("", {}, 1), cell("x")];
	const ansi = cellsToAnsi(cells, 3).replace(/\u001b\[[0-9;]*m/g, "");
	assert.equal(ansi, "中x");
});

test("paneTitle:聚焦标记与定宽填充", () => {
	const focused = paneTitle("session-a", true, 20);
	const idle = paneTitle("session-a", false, 20);
	assert.ok(focused.startsWith("\u001b[7m"));
	assert.ok(focused.includes("* session-a"));
	assert.ok(idle.includes("  session-a"));
	assert.equal(focused.replace(/\u001b\[[0-9;]*m/g, "").length, 20);
});

test("paneTitle:标题过长时截断", () => {
	const text = paneTitle("a-very-long-pane-title", true, 10).replace(/\u001b\[[0-9;]*m/g, "");
	assert.equal(text.length, 10);
});

test("composePanes:两个面板按高度均分,各带标题栏", () => {
	const frames = [
		{ title: "pane-a", focused: true, lines: ["a1", "a2", "a3"] },
		{ title: "pane-b", focused: false, lines: ["b1", "b2", "b3"] },
	];
	const out = composePanes(frames, 20, 8);
	assert.equal(out.length, 8);
	assert.ok(out[0].includes("pane-a"));
	assert.ok(out[4].includes("pane-b"));
	assert.ok(out[1].includes("a1"));
	assert.ok(out[5].includes("b1"));
});

test("composePanes:无面板时输出空行,行数等于高度", () => {
	const out = composePanes([], 10, 5);
	assert.equal(out.length, 5);
	assert.ok(out.every((line) => line.trim() === ""));
});
