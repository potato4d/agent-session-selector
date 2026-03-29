import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const args = process.argv.slice(2);
const cargoBin = path.join(os.homedir(), ".cargo", "bin");
const platformConfigPath =
  process.platform === "darwin"
    ? path.join("src-tauri", "tauri.macos.conf.json")
    : process.platform === "win32"
      ? path.join("src-tauri", "tauri.windows.conf.json")
      : process.platform === "linux"
        ? path.join("src-tauri", "tauri.linux.conf.json")
        : null;

function withCargoPath(separator) {
  const currentPath = process.env.PATH ?? "";
  return currentPath
    ? `${cargoBin}${separator}${currentPath}`
    : cargoBin;
}

function run(command, commandArgs, env) {
  const child = spawn(command, commandArgs, {
    cwd: rootDir,
    env,
    stdio: "inherit",
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    process.exit(code ?? 1);
  });
}

const pnpmExecPath = process.env.npm_execpath;

if (!pnpmExecPath) {
  console.error("npm_execpath is not set; run this script through pnpm.");
  process.exit(1);
}

const tauriArgs =
  platformConfigPath &&
  fs.existsSync(path.join(rootDir, platformConfigPath)) &&
  args.length > 0
    ? [args[0], "--config", platformConfigPath, ...args.slice(1)]
    : args;

run(process.execPath, [pnpmExecPath, "exec", "tauri", ...tauriArgs], {
  ...process.env,
  PATH: withCargoPath(process.platform === "win32" ? ";" : ":"),
});
