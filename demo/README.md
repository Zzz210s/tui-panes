# demo

Minimal host TUI: one pane filling the screen, keys forwarded to the pane.

```bash
npm install
npm run demo                       # interactive shell inside a pane
node demo/demo.ts "npm run dev"    # run anything inside a pane
```

Ctrl+Q or Esc quits (and kills the pane process).
