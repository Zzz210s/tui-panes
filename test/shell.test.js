import assert from "node:assert/strict";
import { test } from "node:test";
import { shellArgs, shellFlavor } from "../src/shell.ts";

const GIT_BASH = "C:/Program Files/Git/bin/bash.exe";
const WINDOWS_PS = "C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe";
const PWSH = "C:/Program Files/PowerShell/7/pwsh.exe";

test("shellFlavor:识别 bash / PowerShell / cmd", () => {
	assert.equal(shellFlavor(GIT_BASH), "bash");
	assert.equal(shellFlavor("/usr/bin/bash"), "bash");
	assert.equal(shellFlavor(WINDOWS_PS), "powershell");
	assert.equal(shellFlavor(PWSH), "powershell");
	assert.equal(shellFlavor("C:/Windows/System32/cmd.exe"), "cmd");
});

test("shellFlavor:反斜杠路径同样识别", () => {
	const backslashBash = ["C:", "Program Files", "Git", "bin", "bash.exe"].join("\\");
	const backslashPs = ["C:", "Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe"].join("\\");
	assert.equal(shellFlavor(backslashBash), "bash");
	assert.equal(shellFlavor(backslashPs), "powershell");
});

test("shellArgs:bash 用 -lc 且命令后保持交互", () => {
	const args = shellArgs(GIT_BASH, "pi --session x");
	assert.equal(args[0], "-lc");
	assert.match(args[1], /pi --session x/);
	assert.match(args[1], /exec bash/);
});

test("shellArgs:PowerShell 用 -NoExit -Command(保持面板可交互)", () => {
	const args = shellArgs(WINDOWS_PS, "pi --session x");
	assert.deepEqual(args.slice(0, 3), ["-NoLogo", "-NoProfile", "-NoExit"]);
	assert.equal(args[3], "-Command");
	assert.equal(args[4], "pi --session x");
});

test("shellArgs:cmd 用 /d /s /c", () => {
	assert.deepEqual(shellArgs("cmd.exe", "dir"), ["/d", "/s", "/c", "dir"]);
});
