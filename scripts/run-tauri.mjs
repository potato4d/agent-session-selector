import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const args = process.argv.slice(2);
const cargoBin = path.join(os.homedir(), ".cargo", "bin");

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

run(process.execPath, [pnpmExecPath, "exec", "tauri", ...args], {
  ...process.env,
  PATH: withCargoPath(process.platform === "win32" ? ";" : ":"),
});
