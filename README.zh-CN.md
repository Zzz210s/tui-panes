# tui-panes

[English](./README.md) | **简体中文**

**[ai-session-hub](https://github.com/Zzz210s/ai-session-hub) 的同页分屏拓展** —— 在核心的 TUI 里并排运行多个 agent 会话,每格面板是一个真实 PTY,输出由 headless 终端仿真器解析后渲染进宿主的屏幕。

它也可以作为通用引擎用于其它 Node TUI:`ai-session-hub` 只是它的第一个宿主。

适合需要在**一个 TUI 里同时观察并操作多个长驻 CLI 进程**的场景(AI 编码助手、构建监听、日志跟踪),免去额外开终端窗口。

## 为什么不直接用 `child_process`?

| 做法 | 问题 |
|---|---|
| `child_process` + 管道 | 子进程看不到 TTY,交互式 CLI 会退化成非交互/纯文本模式,颜色、光标控制、全屏界面全丢 |
| `child_process` + `stdio: inherit` | 子进程直接接管**你的**终端,本程序在它退出前完全消失(即"attach"行为) |
| **tui-panes** | 子进程拿到真 PTY,它的屏幕在后台被仿真,画在哪里由你决定 |

## 依赖要求

- Node ≥ 24
- `node-pty`(Windows 上是预编译 ConPTY,**不需要 MSVC**)与 `@xterm/headless`

## 安装

```bash
npm install tui-panes
# 或从 git 安装
npm install github:Zzz210s/tui-panes
```

## 快速上手

```ts
import { PaneManager, composePanes } from "tui-panes";

const manager = new PaneManager({ onDirty: () => scheduleRedraw() });

// 1) 打开面板(真实 PTY 进程)
await manager.open({ id: "build", title: "build", command: "npm run build --watch", cwd: "/path/to/repo" }, cols, rows);

// 2) 每帧:把面板内容合成到自己的屏幕行
const frames = manager.snapshots().map((p) => ({ title: p.title, focused: p.focused, lines: p.snapshot.lines }));
const lines = composePanes(frames, width, height);
process.stdout.write(`\x1b[H${lines.join("\r\n")}\x1b[J`);

// 3) 把键盘输入转发给聚焦面板
manager.writeFocused(dataFromYourKeyboard);

// 4) 关闭 / 调整尺寸
manager.close(0);
manager.resize(newWidth, newHeight);
```

也可以用宿主接线助手,它把"打开/关闭/切换焦点/尺寸同步"以及两个逃生键(Ctrl+Q 离开面板焦点、Ctrl+W 关闭面板)都接好:

```ts
import { createPaneIntegration } from "tui-panes";

const panes = createPaneIntegration({
  selectedSpec: () => current && { id: current.id, title: current.name, command: `my-cli --resume ${current.id}`, cwd: current.cwd },
  metrics: () => ({ rightWidth, bodyHeight }),
  redraw: () => draw(true),
  schedule: () => scheduleRedraw(),
  notify: (message) => showStatus(message),
});

await panes.open();
if (panes.handleFocusedInput(rawKey)) return; // 已被面板消费
```

## API

| 导出 | 作用 |
|---|---|
| `Pane` | 单个面板:PTY 进程 + headless 终端缓冲。`create(spec, cols, rows, onDirty, onExit)`、`write`、`resize`、`snapshot()`、`kill()` |
| `PaneManager` | 多面板:`open`、`close`、`cycleFocus`、`unfocus`、`resize`、`layoutSize`、`writeFocused`、`snapshots`、`closeAll` |
| `composePanes` | 纯函数:把面板帧(标题栏 + 内容行)堆叠进固定尺寸区域 |
| `cellsToAnsi` / `styleToSgr` / `paneTitle` | 纯渲染工具(单元格 → ANSI、属性 → SGR、标题栏) |
| `createPaneIntegration` | 宿主接线:选中项 → 规格、布局尺寸、重绘节流、提示、逃生键 |
| `createHubExtension` | ai-session-hub 拓展入口(返回 `HubExtensionLike`) |
| `defaultShell` | Windows 优先 Git Bash,否则 `bash` |

`PaneSpec` 刻意保持通用——`{ id, title, command, cwd?, shell? }`——因此库不依赖你的业务模型。

## 设计要点(Windows 上最容易踩的坑)

1. **ConPTY 会重写绝对光标定位**。逐行写 `cursorTo(row, col)` 会被 ConPTY 改写成文本流,整屏错乱。要顺序重绘:`\x1b[H` + 行以 `\r\n` 连接 + `\x1b[J`(面板内部同理)。
2. **末列留白**。写满整行会让终端进入"折行挂起",后续定位全乱;按 `width - 1` 渲染。
3. **避免宽度不确定字符**(`◐ ▸ · × …`)。把东亚"歧义宽度"当双宽渲染的字体/终端会让每一列错位。自家 UI 用 ASCII,展示的数据做净化。
4. **重绘要节流**。繁忙面板每秒可能产生上千次写入;用约 80ms 的定时器合并,并且只在合成结果变化时才真正重绘。
5. **交出终端时务必挂起自己的循环**。如果同时支持整屏 "attach",必须先停刷新计时器、摘掉 `stdin`/`resize` 监听、退出 raw 模式,否则本程序会与被接管的进程抢屏。
6. **宽字符**占两格,尾随格是 `chars` 为空的占位格,不能当空格输出。

## Shell 适配

面板里的命令由 shell 承载,而各 shell 的启动参数不同 —— 已替你处理:

| shell(自动探测,或在面板规格里指定 `shell`) | 参数 |
|---|---|
| Git Bash / bash | `-lc "<command>; exec bash"`(面板保持可交互) |
| PowerShell(`powershell.exe` / `pwsh.exe`) | `-NoLogo -NoProfile -NoExit -Command "<command>"` |
| cmd | `/d /s /c "<command>"` |

`defaultShell()` 优先 Git Bash,其次 PowerShell;需要直接使用时,`shellFlavor()` / `shellArgs()` 均有导出。

## 演示

```bash
npm install
npm run demo                       # 面板里跑交互 shell
node demo/demo.ts "npm run dev"    # 面板里跑你的 dev server
# Ctrl+Q 或 Esc 退出
```

## 测试

```bash
npm test        # 纯渲染逻辑(不需要 PTY)
```

## 与核心的本地联调

宿主消费的是编译产物(`dist/`),所以改完源码要先构建,再把本目录链进核心:

```bash
npm run build
cd ../ai-session-hub && npm run dev:link -- ../tui-panes
```

## 作为 ai-session-hub 的拓展

- [ai-session-hub](https://github.com/Zzz210s/ai-session-hub) —— 主机级 AI 会话总览。拓展入口:`createHubExtension()`(实现宿主的 `HubExtension` 约定:`bodyView` / `openSelected` / `handleKey` / `handleRawInput` / `onResize` / `dispose`);若要在自己的 TUI 里用,可直接使用通用的 `PaneManager` / `composePanes`。

安装即启用:

```bash
cd ~/ai-session-hub && npm install github:Zzz210s/tui-panes
# 核心 TUI 内:Enter / p 在分屏里打开选中会话,Tab 切换,x / Ctrl+W 关闭,Ctrl+Q 回到列表
```


## License

MIT
