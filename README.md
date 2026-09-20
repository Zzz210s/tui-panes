# tui-panes

**English** | [简体中文](./README.zh-CN.md)

**Same-page split panes for [ai-session-hub](https://github.com/Zzz210s/ai-session-hub)** — the extension that runs several agent sessions side by side inside the hub's TUI, each pane a real PTY rendered by a headless terminal emulator.

It also works as a standalone engine for any Node TUI: `ai-session-hub` is simply its first host.

Built for TUI tools that need to *watch and drive several long-running CLI processes at once* (AI coding agents, build watchers, log tails) without spawning extra terminal windows.

## Why not just `child_process` + pipes?

| Approach | Problem |
|---|---|
| `child_process` with pipes | The child sees no TTY, so interactive CLIs switch to non-interactive/plain mode; colors, cursor control and full-screen UIs are lost |
| `child_process` with `stdio: inherit` | The child takes over **your** terminal — your TUI is gone until it exits (this is what "attach" does) |
| **tui-panes** | The child gets a real PTY, its screen is emulated off-screen, and you decide where to draw it |

## Requirements

- Node ≥ 24
- `node-pty` (prebuilt ConPTY on Windows — **no MSVC needed**) and `@xterm/headless`

## Install

```bash
npm install tui-panes
# or from git
npm install github:Zzz210s/tui-panes
```

## As an extension of ai-session-hub

The hub loads extensions at startup (default list: `tui-panes`). Install it next to the hub and it is picked up automatically:

```bash
cd ~/ai-session-hub && npm install github:Zzz210s/tui-panes
# then, inside the hub:  Enter / p = open the selected session in a split pane
#                        Tab = cycle focus, x / Ctrl+W = close, Ctrl+Q = back to the list
```

Override the list with `AIS_EXTENSIONS=tui-panes,other` or `~/.ai-session-hub/extensions.json`.

## Quick start

```ts
import { PaneManager, composePanes } from "tui-panes";

const manager = new PaneManager({ onDirty: () => scheduleRedraw() });

// 1) open a pane (a real PTY process)
await manager.open({ id: "build", title: "build", command: "npm run build --watch", cwd: "/path/to/repo" }, cols, rows);

// 2) every frame: compose pane frames into your own screen lines
const frames = manager.snapshots().map((p) => ({ title: p.title, focused: p.focused, lines: p.snapshot.lines }));
const lines = composePanes(frames, width, height);
process.stdout.write(`\x1b[H${lines.join("\r\n")}\x1b[J`);

// 3) forward input to the focused pane
manager.writeFocused(dataFromYourKeyboard);

// 4) close / resize
manager.close(0);
manager.resize(newWidth, newHeight);
```

Or use the host integration helper, which wires open/close/focus/size plus the two escape keys (Ctrl+Q = leave pane focus, Ctrl+W = close pane):

```ts
import { createPaneIntegration } from "tui-panes";

const panes = createPaneIntegration({
  selectedSpec: () => currentSelection && { id: currentSelection.id, title: currentSelection.name, command: `my-cli --resume ${currentSelection.id}`, cwd: currentSelection.cwd },
  metrics: () => ({ rightWidth, bodyHeight }),
  redraw: () => draw(true),
  schedule: () => scheduleRedraw(),
  notify: (message) => showStatus(message),
});

await panes.open();
if (panes.handleFocusedInput(rawKey)) return; // consumed by the pane
```

## API

| Export | Purpose |
|---|---|
| `Pane` | One pane: PTY process + headless terminal buffer. `create(spec, cols, rows, onDirty, onExit)`, `write`, `resize`, `snapshot()`, `kill()` |
| `PaneManager` | Many panes: `open`, `close`, `cycleFocus`, `unfocus`, `resize`, `layoutSize`, `writeFocused`, `snapshots`, `closeAll` |
| `composePanes` | Pure: stack pane frames (title bar + lines) into a fixed-size region |
| `cellsToAnsi` / `styleToSgr` / `paneTitle` | Pure rendering helpers (cell grid → ANSI, SGR from attributes, title bar) |
| `createPaneIntegration` | Host glue: selection → spec, layout metrics, redraw scheduling, notifications, escape keys |
| `createHubExtension` | The ai-session-hub extension entry point (returns `HubExtensionLike`) |
| `defaultShell` | Picks Git Bash on Windows, otherwise `bash` |

`PaneSpec` is deliberately generic — `{ id, title, command, cwd?, shell? }` — so the library does not depend on your domain model.

## Design notes (things that bite you on Windows)

1. **ConPTY rewrites absolute cursor positioning.** Writing per-line `cursorTo(row, col)` sequences makes ConPTY re-emit the stream as text flow, which garbles the screen. Redraw sequentially: `\x1b[H` + lines joined by `\r\n` + `\x1b[J`. (Same rule inside panes.)
2. **Leave the last column empty.** Filling the terminal width exactly puts terminals into "pending wrap", which breaks subsequent positioning; render at `width - 1`.
3. **Avoid ambiguous-width glyphs** (`◐ ▸ · × …`). Fonts/terminals that treat East Asian Ambiguous characters as double-width will shift every column. Stick to ASCII in your own chrome; sanitize data you display.
4. **Throttle redraws.** A busy pane can emit thousands of writes per second; coalesce with an ~80 ms timer and only redraw when the composed screen actually changed.
5. **Suspend your own loops when you hand over the terminal.** If you also support full-terminal "attach", stop your refresh timer, remove `stdin`/`resize` listeners and leave raw mode first — otherwise your TUI and the attached process fight over the screen.
6. **Wide characters** occupy two cells; the trailing cell is a placeholder with empty `chars` and must not be rendered as a space.

## Demo

```bash
npm install
npm run demo                       # a pane running an interactive shell
node demo/demo.ts "npm run dev"    # a pane running your dev server
# Ctrl+Q or Esc to quit
```

## Tests

```bash
npm test        # pure rendering logic (no PTY required)
```

## Local development with the hub

The hub consumes the built output (`dist/`), so rebuild after changing sources, then link this checkout into the hub:

```bash
npm run build
cd ../ai-session-hub && npm run dev:link -- ../tui-panes
```

## Extension of

- [ai-session-hub](https://github.com/Zzz210s/ai-session-hub) — host-level overview of running/historical AI CLI sessions. Helpers: `createHubExtension()` (implements the hub's `HubExtension` contract: `bodyView` / `openSelected` / `handleKey` / `handleRawInput` / `onResize` / `dispose`) for use as an extension, plus the generic `PaneManager` / `composePanes` if you want to embed panes in your own TUI.

## License

MIT
