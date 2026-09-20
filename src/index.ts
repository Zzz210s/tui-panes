/**
 * tui-panes — 在 Node TUI 内嵌多个终端面板(PTY + 终端仿真 + 视图合成)
 *
 * 用法概览:
 *   import { PaneManager, composePanes } from "tui-panes";
 *
 * 引擎组成:
 *   pane.ts       一个面板 = 一个 PTY 进程 + 一份 @xterm/headless 屏幕缓冲
 *   manager.ts    多面板:打开/关闭/焦点/尺寸
 *   render.ts     纯渲染:单元格 → ANSI、面板标题栏、多面板合成(可单测)
 *   integration.ts 与宿主 TUI 的接线(选中项/布局尺寸/重绘/提示)
 *   screen.ts     宿主屏幕助手:备用屏、顺序重绘、挂起/恢复、刷新计时器
 */

export { Pane, type PaneSnapshot, type PaneSpec } from "./pane.ts";
export { PaneManager, type PaneManagerOptions } from "./manager.ts";
export { cellsToAnsi, composePanes, paneTitle, styleToSgr, type Cell, type CellStyle, type PaneFrame } from "./render.ts";
export { createPaneIntegration, type PaneHost, type PaneIntegration } from "./integration.ts";
export { createTuiScreen, type TuiScreen, type TuiScreenOptions } from "./screen.ts";
