/**
 * Shell 适配:面板里跑命令时,按 shell 类型给不同的启动参数
 *   bash       -lc "<command>; exec bash"
 *   powershell -NoLogo -NoProfile -NoExit -Command "<command>"
 *   cmd        /d /s /c "<command>"
 */

import { existsSync } from "node:fs";

export type ShellFlavor = "bash" | "powershell" | "cmd";

/** 由可执行文件路径判断 shell 类型(纯函数) */
export function shellFlavor(shellPath: string): ShellFlavor {
	const lower = shellPath.toLowerCase().replace(/\\/g, "/");
	if (lower.includes("powershell") || lower.endsWith("/pwsh") || lower.endsWith("/pwsh.exe")) return "powershell";
	if (lower.includes("bash") || lower.includes("sh.exe") || lower.endsWith("/sh")) return "bash";
	return "cmd";
}

/** 执行命令的启动参数(纯函数);命令结束后保持可交互,便于继续操作 */
export function shellArgs(shellPath: string, command: string): string[] {
	const flavor = shellFlavor(shellPath);
	if (flavor === "powershell") return ["-NoLogo", "-NoProfile", "-NoExit", "-Command", command];
	if (flavor === "cmd") return ["/d", "/s", "/c", command];
	return ["-lc", `${command}; exec "$BASH" || exec bash`];
}

/** 默认 shell:优先 Git Bash(Windows),否则 PowerShell,最后 bash */
export function defaultShell(): string {
	const candidates = [
		`${process.env.ProgramFiles ?? "C:\\Program Files"}\\Git\\bin\\bash.exe`,
		`${process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)"}\\Git\\bin\\bash.exe`,
		`${process.env.ProgramFiles ?? "C:\\Program Files"}\\PowerShell\\7\\pwsh.exe`,
		`${process.env.SystemRoot ?? "C:\\Windows"}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`,
	];
	for (const candidate of candidates) if (existsSync(candidate)) return candidate;
	return "bash";
}
