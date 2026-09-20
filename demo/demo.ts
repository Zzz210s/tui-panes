/**
 * 最小演示:整屏一个面板,在面板里跑命令并可直接交互
 *   node demo/demo.ts [command]     默认:进入交互 shell
 * 退出:Ctrl+Q 或 Esc(面板里的会话会被结束)
 */

import { createTuiScreen } from "../src/screen.ts";
import { PaneManager, composePanes } from "../src/index.ts";

const command = process.argv.slice(2).join(" ") || "echo 'hello from a pane'; exec bash";

const stdin = process.stdin;
const stdout = process.stdout;
if (!stdin.isTTY || !stdout.isTTY) {
	console.error("demo 需要交互式终端");
	process.exit(1);
}

const manager = new PaneManager({ onDirty: () => schedule() });
let drawTimer: ReturnType<typeof setTimeout> | null = null;
let lastSignature = "";

const metrics = (): { width: number; height: number } => ({
	width: Math.max(20, (stdout.columns ?? 100) - 1),
	height: Math.max(4, (stdout.rows ?? 24) - 1),
});

const draw = (force = false): void => {
	if (screen.suspended) return;
	const { width, height } = metrics();
	const frames = manager.snapshots().map((entry) => ({ title: entry.title, focused: entry.focused, lines: entry.snapshot.lines }));
	const lines = composePanes(frames, width, height);
	const signature = lines.join("\n");
	if (!force && signature === lastSignature) return;
	lastSignature = signature;
	stdout.write(`\u001b[H${lines.join("\r\n")}\u001b[J`);
};

const schedule = (): void => {
	if (drawTimer) return;
	drawTimer = setTimeout(() => {
		drawTimer = null;
		draw();
	}, 80);
};

const screen = createTuiScreen({
	stdin,
	stdout,
	onData: (chunk) => {
		const text = chunk.toString("utf8");
		if (text === "\u0011" || text === "\u001b") {
			finish();
			return;
		}
		manager.writeFocused(text);
		schedule();
	},
	onResize: () => {
		const { width, height } = metrics();
		manager.resize(width, height);
		draw(true);
	},
});

let finished = false;
const finish = (): void => {
	if (finished) return;
	finished = true;
	if (drawTimer) clearTimeout(drawTimer);
	manager.closeAll();
	screen.leave("demo 结束");
	process.exit(0);
};

screen.enter();
const { width, height } = metrics();
await manager.open({ id: "demo", title: command, command }, width, height);
draw(true);
process.on("SIGINT", finish);
