import { execFile } from "child_process";
import { existsSync, readFileSync } from "fs";
import { homedir } from "os";
import { promisify } from "util";
import { dirname, join } from "../../../../base/common/path.js";
import { isWindows } from "../../../../base/common/platform.js";
const execFileAsync = promisify(execFile);
function forgeUserHome() {
  return process.env.FORGE_HOME || homedir();
}
function ancestorDirs(start, max = 8) {
  const dirs = [];
  let current = start;
  for (let i = 0; i < max; i++) {
    dirs.push(current);
    const parent = dirname(current);
    if (!parent || parent === current) {
      break;
    }
    current = parent;
  }
  return dirs;
}
function uniquePaths(paths) {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const path of paths) {
    const key = path.replace(/[\\/]+$/g, "").toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(path);
  }
  return out;
}
function deepSeekHarnessRoots(repoRoot) {
  const home = forgeUserHome();
  const fromAncestors = ancestorDirs(repoRoot).flatMap((base) => [
    join(base, "third_party", "deepseek-harness"),
    join(base, "deepseek-harness"),
    join(base, "deepseek-harness-master")
  ]);
  return uniquePaths([
    ...fromAncestors,
    join(home, ".forge", "deepseek-harness"),
    join(home, ".forge", "deepseek-harness-master")
  ]);
}
function grokBuildBinaryCandidates(repoRoot) {
  const home = forgeUserHome();
  const pager = isWindows ? "xai-grok-pager.exe" : "xai-grok-pager";
  const grok = isWindows ? "grok.exe" : "grok";
  const fromAncestors = ancestorDirs(repoRoot).flatMap((base) => [
    join(base, "third_party", "grok-build", "bin", grok),
    join(base, "third_party", "grok-build", "bin", pager),
    join(base, "third_party", "grok-build", "target", "release", pager),
    join(base, "third_party", "grok-build", "target", "release", grok),
    join(base, "grok-build", "bin", grok),
    join(base, "grok-build-main", "target", "release", pager)
  ]);
  return uniquePaths([
    ...fromAncestors,
    join(home, ".grok", "bin", grok),
    join(home, ".forge", "bin", grok),
    join(home, ".forge", "bin", pager),
    join(home, ".forge", "grok-build-main", "target", "release", pager)
  ]);
}
function findDeepSeekHarnessRoot(repoRoot) {
  for (const candidate of deepSeekHarnessRoots(repoRoot)) {
    if (existsSync(join(candidate, "package.json"))) {
      return candidate;
    }
  }
  return void 0;
}
function findGrokBuildBinary(repoRoot) {
  for (const candidate of grokBuildBinaryCandidates(repoRoot)) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return void 0;
}
function hasDeepSeekLocalRuntime(root) {
  return existsSync(join(root, "apps", "cli", "lib", "bin.js")) || existsSync(join(root, "node_modules"));
}
function resolveNodeNpmCli(kind) {
  const cli = join(dirname(process.execPath), "node_modules", "npm", "bin", `${kind}-cli.js`);
  if (existsSync(cli)) {
    return { command: process.execPath, prefixArgs: [cli] };
  }
  return { command: kind, prefixArgs: [] };
}
function resolveSpawnCommand(command) {
  if (!isWindows) {
    return { command, prefixArgs: [], shell: false };
  }
  const lower = command.toLowerCase();
  if (lower.endsWith(".exe")) {
    return { command, prefixArgs: [], shell: false };
  }
  if (lower.endsWith(".cmd") || lower.endsWith(".bat")) {
    return { command: process.env.ComSpec || "cmd.exe", prefixArgs: ["/d", "/s", "/c", command], shell: false };
  }
  if (command.includes("\\") || command.includes("/")) {
    return { command, prefixArgs: [], shell: false };
  }
  return { command, prefixArgs: [], shell: true };
}
function deepSeekCredentialsPath(userHome = forgeUserHome()) {
  return join(process.env.DSH_HOME || join(userHome, ".dsh"), ".credentials.yaml");
}
function grokAuthPath(userHome = forgeUserHome()) {
  return join(userHome, ".grok", "auth.json");
}
function readDeepSeekApiKeyFromCredentials(userHome = forgeUserHome()) {
  try {
    const text = readFileSync(deepSeekCredentialsPath(userHome), "utf8");
    const match = text.match(/^\s*DEEPSEEK_API_KEY\s*:\s*(.+)\s*$/m);
    const value = match?.[1]?.trim().replace(/^['"]|['"]$/g, "");
    return value || void 0;
  } catch {
    return void 0;
  }
}
function readGrokApiKeyFromAuth(userHome = forgeUserHome()) {
  try {
    const raw = JSON.parse(readFileSync(grokAuthPath(userHome), "utf8"));
    for (const value of Object.values(raw)) {
      if (!value || typeof value !== "object") {
        continue;
      }
      const entry = value;
      if (typeof entry.key === "string" && entry.key.trim() !== "") {
        return entry.key;
      }
    }
  } catch {
    return void 0;
  }
  return void 0;
}
function deepSeekCredentialSource(env, userHome = forgeUserHome()) {
  if (env.DEEPSEEK_API_KEY?.trim()) {
    return "env";
  }
  if (readDeepSeekApiKeyFromCredentials(userHome)) {
    return "saved";
  }
  return "none";
}
function grokCredentialSource(env, userHome = forgeUserHome()) {
  if (env.XAI_API_KEY?.trim() || env.GROK_CODE_XAI_API_KEY?.trim()) {
    return "env";
  }
  if (readGrokApiKeyFromAuth(userHome)) {
    return "saved";
  }
  return "none";
}
function hasDeepSeekWorkerCredentials(env, userHome = forgeUserHome()) {
  return deepSeekCredentialSource(env, userHome) !== "none";
}
function hasGrokWorkerCredentials(env, userHome = forgeUserHome()) {
  return grokCredentialSource(env, userHome) !== "none";
}
function isExecutablePath(command) {
  if (!command) {
    return false;
  }
  if (command.includes("/") || command.includes("\\") || /\.(exe|cmd|bat)$/i.test(command)) {
    return existsSync(command);
  }
  return false;
}
async function probeExecutable(command, args = ["--version"], env = process.env, timeoutMs = 4e3) {
  const resolved = resolveSpawnCommand(command);
  if ((resolved.command.includes("/") || resolved.command.includes("\\") || /\.(exe|cmd|bat)$/i.test(resolved.command)) && !existsSync(resolved.command)) {
    return false;
  }
  try {
    await execFileAsync(resolved.command, [...resolved.prefixArgs, ...args], {
      env,
      timeout: timeoutMs,
      windowsHide: true,
      shell: resolved.shell
    });
    return true;
  } catch {
    try {
      await execFileAsync(resolved.command, [...resolved.prefixArgs, "--help"], {
        env,
        timeout: timeoutMs,
        windowsHide: true,
        shell: resolved.shell
      });
      return true;
    } catch {
      return false;
    }
  }
}
export {
  ancestorDirs,
  deepSeekCredentialSource,
  deepSeekCredentialsPath,
  deepSeekHarnessRoots,
  findDeepSeekHarnessRoot,
  findGrokBuildBinary,
  forgeUserHome,
  grokAuthPath,
  grokBuildBinaryCandidates,
  grokCredentialSource,
  hasDeepSeekLocalRuntime,
  hasDeepSeekWorkerCredentials,
  hasGrokWorkerCredentials,
  isExecutablePath,
  probeExecutable,
  readDeepSeekApiKeyFromCredentials,
  readGrokApiKeyFromAuth,
  resolveNodeNpmCli,
  resolveSpawnCommand
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFxub2RlXFxvcmNoZXN0cmF0aW9uXFx3b3JrZXJSdW50aW1lLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgZXhlY0ZpbGUgfSBmcm9tICdjaGlsZF9wcm9jZXNzJztcbmltcG9ydCB7IGV4aXN0c1N5bmMsIHJlYWRGaWxlU3luYyB9IGZyb20gJ2ZzJztcbmltcG9ydCB7IGhvbWVkaXIgfSBmcm9tICdvcyc7XG5pbXBvcnQgeyBwcm9taXNpZnkgfSBmcm9tICd1dGlsJztcbmltcG9ydCB7IGRpcm5hbWUsIGpvaW4gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCB7IGlzV2luZG93cyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB0eXBlIHsgV29ya2VyQ3JlZGVudGlhbFNvdXJjZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9vcmNoZXN0cmF0aW9uL29yY2hlc3RyYXRpb25UeXBlcy5qcyc7XG5cbmNvbnN0IGV4ZWNGaWxlQXN5bmMgPSBwcm9taXNpZnkoZXhlY0ZpbGUpO1xuXG5leHBvcnQgZnVuY3Rpb24gZm9yZ2VVc2VySG9tZSgpOiBzdHJpbmcge1xuXHRyZXR1cm4gcHJvY2Vzcy5lbnYuRk9SR0VfSE9NRSB8fCBob21lZGlyKCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBhbmNlc3RvckRpcnMoc3RhcnQ6IHN0cmluZywgbWF4ID0gOCk6IHN0cmluZ1tdIHtcblx0Y29uc3QgZGlyczogc3RyaW5nW10gPSBbXTtcblx0bGV0IGN1cnJlbnQgPSBzdGFydDtcblx0Zm9yIChsZXQgaSA9IDA7IGkgPCBtYXg7IGkrKykge1xuXHRcdGRpcnMucHVzaChjdXJyZW50KTtcblx0XHRjb25zdCBwYXJlbnQgPSBkaXJuYW1lKGN1cnJlbnQpO1xuXHRcdGlmICghcGFyZW50IHx8IHBhcmVudCA9PT0gY3VycmVudCkge1xuXHRcdFx0YnJlYWs7XG5cdFx0fVxuXHRcdGN1cnJlbnQgPSBwYXJlbnQ7XG5cdH1cblx0cmV0dXJuIGRpcnM7XG59XG5cbmZ1bmN0aW9uIHVuaXF1ZVBhdGhzKHBhdGhzOiByZWFkb25seSBzdHJpbmdbXSk6IHN0cmluZ1tdIHtcblx0Y29uc3Qgc2VlbiA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRjb25zdCBvdXQ6IHN0cmluZ1tdID0gW107XG5cdGZvciAoY29uc3QgcGF0aCBvZiBwYXRocykge1xuXHRcdGNvbnN0IGtleSA9IHBhdGgucmVwbGFjZSgvW1xcXFwvXSskL2csICcnKS50b0xvd2VyQ2FzZSgpO1xuXHRcdGlmIChzZWVuLmhhcyhrZXkpKSB7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cdFx0c2Vlbi5hZGQoa2V5KTtcblx0XHRvdXQucHVzaChwYXRoKTtcblx0fVxuXHRyZXR1cm4gb3V0O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZGVlcFNlZWtIYXJuZXNzUm9vdHMocmVwb1Jvb3Q6IHN0cmluZyk6IHJlYWRvbmx5IHN0cmluZ1tdIHtcblx0Y29uc3QgaG9tZSA9IGZvcmdlVXNlckhvbWUoKTtcblx0Y29uc3QgZnJvbUFuY2VzdG9ycyA9IGFuY2VzdG9yRGlycyhyZXBvUm9vdCkuZmxhdE1hcChiYXNlID0+IFtcblx0XHRqb2luKGJhc2UsICd0aGlyZF9wYXJ0eScsICdkZWVwc2Vlay1oYXJuZXNzJyksXG5cdFx0am9pbihiYXNlLCAnZGVlcHNlZWstaGFybmVzcycpLFxuXHRcdGpvaW4oYmFzZSwgJ2RlZXBzZWVrLWhhcm5lc3MtbWFzdGVyJyksXG5cdF0pO1xuXHRyZXR1cm4gdW5pcXVlUGF0aHMoW1xuXHRcdC4uLmZyb21BbmNlc3RvcnMsXG5cdFx0am9pbihob21lLCAnLmZvcmdlJywgJ2RlZXBzZWVrLWhhcm5lc3MnKSxcblx0XHRqb2luKGhvbWUsICcuZm9yZ2UnLCAnZGVlcHNlZWstaGFybmVzcy1tYXN0ZXInKSxcblx0XSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBncm9rQnVpbGRCaW5hcnlDYW5kaWRhdGVzKHJlcG9Sb290OiBzdHJpbmcpOiByZWFkb25seSBzdHJpbmdbXSB7XG5cdGNvbnN0IGhvbWUgPSBmb3JnZVVzZXJIb21lKCk7XG5cdGNvbnN0IHBhZ2VyID0gaXNXaW5kb3dzID8gJ3hhaS1ncm9rLXBhZ2VyLmV4ZScgOiAneGFpLWdyb2stcGFnZXInO1xuXHRjb25zdCBncm9rID0gaXNXaW5kb3dzID8gJ2dyb2suZXhlJyA6ICdncm9rJztcblx0Y29uc3QgZnJvbUFuY2VzdG9ycyA9IGFuY2VzdG9yRGlycyhyZXBvUm9vdCkuZmxhdE1hcChiYXNlID0+IFtcblx0XHRqb2luKGJhc2UsICd0aGlyZF9wYXJ0eScsICdncm9rLWJ1aWxkJywgJ2JpbicsIGdyb2spLFxuXHRcdGpvaW4oYmFzZSwgJ3RoaXJkX3BhcnR5JywgJ2dyb2stYnVpbGQnLCAnYmluJywgcGFnZXIpLFxuXHRcdGpvaW4oYmFzZSwgJ3RoaXJkX3BhcnR5JywgJ2dyb2stYnVpbGQnLCAndGFyZ2V0JywgJ3JlbGVhc2UnLCBwYWdlciksXG5cdFx0am9pbihiYXNlLCAndGhpcmRfcGFydHknLCAnZ3Jvay1idWlsZCcsICd0YXJnZXQnLCAncmVsZWFzZScsIGdyb2spLFxuXHRcdGpvaW4oYmFzZSwgJ2dyb2stYnVpbGQnLCAnYmluJywgZ3JvayksXG5cdFx0am9pbihiYXNlLCAnZ3Jvay1idWlsZC1tYWluJywgJ3RhcmdldCcsICdyZWxlYXNlJywgcGFnZXIpLFxuXHRdKTtcblx0cmV0dXJuIHVuaXF1ZVBhdGhzKFtcblx0XHQuLi5mcm9tQW5jZXN0b3JzLFxuXHRcdGpvaW4oaG9tZSwgJy5ncm9rJywgJ2JpbicsIGdyb2spLFxuXHRcdGpvaW4oaG9tZSwgJy5mb3JnZScsICdiaW4nLCBncm9rKSxcblx0XHRqb2luKGhvbWUsICcuZm9yZ2UnLCAnYmluJywgcGFnZXIpLFxuXHRcdGpvaW4oaG9tZSwgJy5mb3JnZScsICdncm9rLWJ1aWxkLW1haW4nLCAndGFyZ2V0JywgJ3JlbGVhc2UnLCBwYWdlciksXG5cdF0pO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZmluZERlZXBTZWVrSGFybmVzc1Jvb3QocmVwb1Jvb3Q6IHN0cmluZyk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdGZvciAoY29uc3QgY2FuZGlkYXRlIG9mIGRlZXBTZWVrSGFybmVzc1Jvb3RzKHJlcG9Sb290KSkge1xuXHRcdGlmIChleGlzdHNTeW5jKGpvaW4oY2FuZGlkYXRlLCAncGFja2FnZS5qc29uJykpKSB7XG5cdFx0XHRyZXR1cm4gY2FuZGlkYXRlO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZmluZEdyb2tCdWlsZEJpbmFyeShyZXBvUm9vdDogc3RyaW5nKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0Zm9yIChjb25zdCBjYW5kaWRhdGUgb2YgZ3Jva0J1aWxkQmluYXJ5Q2FuZGlkYXRlcyhyZXBvUm9vdCkpIHtcblx0XHRpZiAoZXhpc3RzU3luYyhjYW5kaWRhdGUpKSB7XG5cdFx0XHRyZXR1cm4gY2FuZGlkYXRlO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaGFzRGVlcFNlZWtMb2NhbFJ1bnRpbWUocm9vdDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiBleGlzdHNTeW5jKGpvaW4ocm9vdCwgJ2FwcHMnLCAnY2xpJywgJ2xpYicsICdiaW4uanMnKSlcblx0XHR8fCBleGlzdHNTeW5jKGpvaW4ocm9vdCwgJ25vZGVfbW9kdWxlcycpKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlc29sdmVOb2RlTnBtQ2xpKGtpbmQ6ICducHgnIHwgJ25wbScpOiB7IGNvbW1hbmQ6IHN0cmluZzsgcHJlZml4QXJnczogc3RyaW5nW10gfSB7XG5cdGNvbnN0IGNsaSA9IGpvaW4oZGlybmFtZShwcm9jZXNzLmV4ZWNQYXRoKSwgJ25vZGVfbW9kdWxlcycsICducG0nLCAnYmluJywgYCR7a2luZH0tY2xpLmpzYCk7XG5cdGlmIChleGlzdHNTeW5jKGNsaSkpIHtcblx0XHRyZXR1cm4geyBjb21tYW5kOiBwcm9jZXNzLmV4ZWNQYXRoLCBwcmVmaXhBcmdzOiBbY2xpXSB9O1xuXHR9XG5cdHJldHVybiB7IGNvbW1hbmQ6IGtpbmQsIHByZWZpeEFyZ3M6IFtdIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZXNvbHZlU3Bhd25Db21tYW5kKGNvbW1hbmQ6IHN0cmluZyk6IHsgY29tbWFuZDogc3RyaW5nOyBwcmVmaXhBcmdzOiBzdHJpbmdbXTsgc2hlbGw6IGJvb2xlYW4gfSB7XG5cdGlmICghaXNXaW5kb3dzKSB7XG5cdFx0cmV0dXJuIHsgY29tbWFuZCwgcHJlZml4QXJnczogW10sIHNoZWxsOiBmYWxzZSB9O1xuXHR9XG5cdGNvbnN0IGxvd2VyID0gY29tbWFuZC50b0xvd2VyQ2FzZSgpO1xuXHRpZiAobG93ZXIuZW5kc1dpdGgoJy5leGUnKSkge1xuXHRcdHJldHVybiB7IGNvbW1hbmQsIHByZWZpeEFyZ3M6IFtdLCBzaGVsbDogZmFsc2UgfTtcblx0fVxuXHRpZiAobG93ZXIuZW5kc1dpdGgoJy5jbWQnKSB8fCBsb3dlci5lbmRzV2l0aCgnLmJhdCcpKSB7XG5cdFx0cmV0dXJuIHsgY29tbWFuZDogcHJvY2Vzcy5lbnYuQ29tU3BlYyB8fCAnY21kLmV4ZScsIHByZWZpeEFyZ3M6IFsnL2QnLCAnL3MnLCAnL2MnLCBjb21tYW5kXSwgc2hlbGw6IGZhbHNlIH07XG5cdH1cblx0aWYgKGNvbW1hbmQuaW5jbHVkZXMoJ1xcXFwnKSB8fCBjb21tYW5kLmluY2x1ZGVzKCcvJykpIHtcblx0XHRyZXR1cm4geyBjb21tYW5kLCBwcmVmaXhBcmdzOiBbXSwgc2hlbGw6IGZhbHNlIH07XG5cdH1cblx0Ly8gQmFyZSBQQVRIIG5hbWVzIHN1Y2ggYXMgbnB4L3BucG0vZ3JvazogZG8gbm90IHJld3JpdGUgdG8gKi5jbWQgd2l0aFxuXHQvLyBzaGVsbDpmYWxzZS4gTm9kZSAyMCsgcmVqZWN0cyBzcGF3bmluZyBjbWQgc2hpbXMgdGhhdCB3YXkgKEVJTlZBTCkuXG5cdHJldHVybiB7IGNvbW1hbmQsIHByZWZpeEFyZ3M6IFtdLCBzaGVsbDogdHJ1ZSB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZGVlcFNlZWtDcmVkZW50aWFsc1BhdGgodXNlckhvbWUgPSBmb3JnZVVzZXJIb21lKCkpOiBzdHJpbmcge1xuXHRyZXR1cm4gam9pbihwcm9jZXNzLmVudi5EU0hfSE9NRSB8fCBqb2luKHVzZXJIb21lLCAnLmRzaCcpLCAnLmNyZWRlbnRpYWxzLnlhbWwnKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdyb2tBdXRoUGF0aCh1c2VySG9tZSA9IGZvcmdlVXNlckhvbWUoKSk6IHN0cmluZyB7XG5cdHJldHVybiBqb2luKHVzZXJIb21lLCAnLmdyb2snLCAnYXV0aC5qc29uJyk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZWFkRGVlcFNlZWtBcGlLZXlGcm9tQ3JlZGVudGlhbHModXNlckhvbWUgPSBmb3JnZVVzZXJIb21lKCkpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHR0cnkge1xuXHRcdGNvbnN0IHRleHQgPSByZWFkRmlsZVN5bmMoZGVlcFNlZWtDcmVkZW50aWFsc1BhdGgodXNlckhvbWUpLCAndXRmOCcpO1xuXHRcdGNvbnN0IG1hdGNoID0gdGV4dC5tYXRjaCgvXlxccypERUVQU0VFS19BUElfS0VZXFxzKjpcXHMqKC4rKVxccyokL20pO1xuXHRcdGNvbnN0IHZhbHVlID0gbWF0Y2g/LlsxXT8udHJpbSgpLnJlcGxhY2UoL15bJ1wiXXxbJ1wiXSQvZywgJycpO1xuXHRcdHJldHVybiB2YWx1ZSB8fCB1bmRlZmluZWQ7XG5cdH0gY2F0Y2gge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlYWRHcm9rQXBpS2V5RnJvbUF1dGgodXNlckhvbWUgPSBmb3JnZVVzZXJIb21lKCkpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHR0cnkge1xuXHRcdGNvbnN0IHJhdyA9IEpTT04ucGFyc2UocmVhZEZpbGVTeW5jKGdyb2tBdXRoUGF0aCh1c2VySG9tZSksICd1dGY4JykpIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuXHRcdGZvciAoY29uc3QgdmFsdWUgb2YgT2JqZWN0LnZhbHVlcyhyYXcpKSB7XG5cdFx0XHRpZiAoIXZhbHVlIHx8IHR5cGVvZiB2YWx1ZSAhPT0gJ29iamVjdCcpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBlbnRyeSA9IHZhbHVlIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuXHRcdFx0aWYgKHR5cGVvZiBlbnRyeS5rZXkgPT09ICdzdHJpbmcnICYmIGVudHJ5LmtleS50cmltKCkgIT09ICcnKSB7XG5cdFx0XHRcdHJldHVybiBlbnRyeS5rZXk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9IGNhdGNoIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdHJldHVybiB1bmRlZmluZWQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBkZWVwU2Vla0NyZWRlbnRpYWxTb3VyY2UoZW52OiBOb2RlSlMuUHJvY2Vzc0VudiwgdXNlckhvbWUgPSBmb3JnZVVzZXJIb21lKCkpOiBXb3JrZXJDcmVkZW50aWFsU291cmNlIHtcblx0aWYgKGVudi5ERUVQU0VFS19BUElfS0VZPy50cmltKCkpIHtcblx0XHRyZXR1cm4gJ2Vudic7XG5cdH1cblx0aWYgKHJlYWREZWVwU2Vla0FwaUtleUZyb21DcmVkZW50aWFscyh1c2VySG9tZSkpIHtcblx0XHRyZXR1cm4gJ3NhdmVkJztcblx0fVxuXHRyZXR1cm4gJ25vbmUnO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ3Jva0NyZWRlbnRpYWxTb3VyY2UoZW52OiBOb2RlSlMuUHJvY2Vzc0VudiwgdXNlckhvbWUgPSBmb3JnZVVzZXJIb21lKCkpOiBXb3JrZXJDcmVkZW50aWFsU291cmNlIHtcblx0aWYgKGVudi5YQUlfQVBJX0tFWT8udHJpbSgpIHx8IGVudi5HUk9LX0NPREVfWEFJX0FQSV9LRVk/LnRyaW0oKSkge1xuXHRcdHJldHVybiAnZW52Jztcblx0fVxuXHRpZiAocmVhZEdyb2tBcGlLZXlGcm9tQXV0aCh1c2VySG9tZSkpIHtcblx0XHRyZXR1cm4gJ3NhdmVkJztcblx0fVxuXHRyZXR1cm4gJ25vbmUnO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaGFzRGVlcFNlZWtXb3JrZXJDcmVkZW50aWFscyhlbnY6IE5vZGVKUy5Qcm9jZXNzRW52LCB1c2VySG9tZSA9IGZvcmdlVXNlckhvbWUoKSk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gZGVlcFNlZWtDcmVkZW50aWFsU291cmNlKGVudiwgdXNlckhvbWUpICE9PSAnbm9uZSc7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBoYXNHcm9rV29ya2VyQ3JlZGVudGlhbHMoZW52OiBOb2RlSlMuUHJvY2Vzc0VudiwgdXNlckhvbWUgPSBmb3JnZVVzZXJIb21lKCkpOiBib29sZWFuIHtcblx0cmV0dXJuIGdyb2tDcmVkZW50aWFsU291cmNlKGVudiwgdXNlckhvbWUpICE9PSAnbm9uZSc7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc0V4ZWN1dGFibGVQYXRoKGNvbW1hbmQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRpZiAoIWNvbW1hbmQpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0aWYgKGNvbW1hbmQuaW5jbHVkZXMoJy8nKSB8fCBjb21tYW5kLmluY2x1ZGVzKCdcXFxcJykgfHwgL1xcLihleGV8Y21kfGJhdCkkL2kudGVzdChjb21tYW5kKSkge1xuXHRcdHJldHVybiBleGlzdHNTeW5jKGNvbW1hbmQpO1xuXHR9XG5cdHJldHVybiBmYWxzZTtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHByb2JlRXhlY3V0YWJsZShjb21tYW5kOiBzdHJpbmcsIGFyZ3M6IHJlYWRvbmx5IHN0cmluZ1tdID0gWyctLXZlcnNpb24nXSwgZW52OiBOb2RlSlMuUHJvY2Vzc0VudiA9IHByb2Nlc3MuZW52LCB0aW1lb3V0TXMgPSA0XzAwMCk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRjb25zdCByZXNvbHZlZCA9IHJlc29sdmVTcGF3bkNvbW1hbmQoY29tbWFuZCk7XG5cdGlmICgocmVzb2x2ZWQuY29tbWFuZC5pbmNsdWRlcygnLycpIHx8IHJlc29sdmVkLmNvbW1hbmQuaW5jbHVkZXMoJ1xcXFwnKSB8fCAvXFwuKGV4ZXxjbWR8YmF0KSQvaS50ZXN0KHJlc29sdmVkLmNvbW1hbmQpKSAmJiAhZXhpc3RzU3luYyhyZXNvbHZlZC5jb21tYW5kKSkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHR0cnkge1xuXHRcdGF3YWl0IGV4ZWNGaWxlQXN5bmMocmVzb2x2ZWQuY29tbWFuZCwgWy4uLnJlc29sdmVkLnByZWZpeEFyZ3MsIC4uLmFyZ3NdLCB7XG5cdFx0XHRlbnYsXG5cdFx0XHR0aW1lb3V0OiB0aW1lb3V0TXMsXG5cdFx0XHR3aW5kb3dzSGlkZTogdHJ1ZSxcblx0XHRcdHNoZWxsOiByZXNvbHZlZC5zaGVsbCxcblx0XHR9KTtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fSBjYXRjaCB7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IGV4ZWNGaWxlQXN5bmMocmVzb2x2ZWQuY29tbWFuZCwgWy4uLnJlc29sdmVkLnByZWZpeEFyZ3MsICctLWhlbHAnXSwge1xuXHRcdFx0XHRlbnYsXG5cdFx0XHRcdHRpbWVvdXQ6IHRpbWVvdXRNcyxcblx0XHRcdFx0d2luZG93c0hpZGU6IHRydWUsXG5cdFx0XHRcdHNoZWxsOiByZXNvbHZlZC5zaGVsbCxcblx0XHRcdH0pO1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLFlBQVksb0JBQW9CO0FBQ3pDLFNBQVMsZUFBZTtBQUN4QixTQUFTLGlCQUFpQjtBQUMxQixTQUFTLFNBQVMsWUFBWTtBQUM5QixTQUFTLGlCQUFpQjtBQUcxQixNQUFNLGdCQUFnQixVQUFVLFFBQVE7QUFFakMsU0FBUyxnQkFBd0I7QUFDdkMsU0FBTyxRQUFRLElBQUksY0FBYyxRQUFRO0FBQzFDO0FBRU8sU0FBUyxhQUFhLE9BQWUsTUFBTSxHQUFhO0FBQzlELFFBQU0sT0FBaUIsQ0FBQztBQUN4QixNQUFJLFVBQVU7QUFDZCxXQUFTLElBQUksR0FBRyxJQUFJLEtBQUssS0FBSztBQUM3QixTQUFLLEtBQUssT0FBTztBQUNqQixVQUFNLFNBQVMsUUFBUSxPQUFPO0FBQzlCLFFBQUksQ0FBQyxVQUFVLFdBQVcsU0FBUztBQUNsQztBQUFBLElBQ0Q7QUFDQSxjQUFVO0FBQUEsRUFDWDtBQUNBLFNBQU87QUFDUjtBQUVBLFNBQVMsWUFBWSxPQUFvQztBQUN4RCxRQUFNLE9BQU8sb0JBQUksSUFBWTtBQUM3QixRQUFNLE1BQWdCLENBQUM7QUFDdkIsYUFBVyxRQUFRLE9BQU87QUFDekIsVUFBTSxNQUFNLEtBQUssUUFBUSxZQUFZLEVBQUUsRUFBRSxZQUFZO0FBQ3JELFFBQUksS0FBSyxJQUFJLEdBQUcsR0FBRztBQUNsQjtBQUFBLElBQ0Q7QUFDQSxTQUFLLElBQUksR0FBRztBQUNaLFFBQUksS0FBSyxJQUFJO0FBQUEsRUFDZDtBQUNBLFNBQU87QUFDUjtBQUVPLFNBQVMscUJBQXFCLFVBQXFDO0FBQ3pFLFFBQU0sT0FBTyxjQUFjO0FBQzNCLFFBQU0sZ0JBQWdCLGFBQWEsUUFBUSxFQUFFLFFBQVEsVUFBUTtBQUFBLElBQzVELEtBQUssTUFBTSxlQUFlLGtCQUFrQjtBQUFBLElBQzVDLEtBQUssTUFBTSxrQkFBa0I7QUFBQSxJQUM3QixLQUFLLE1BQU0seUJBQXlCO0FBQUEsRUFDckMsQ0FBQztBQUNELFNBQU8sWUFBWTtBQUFBLElBQ2xCLEdBQUc7QUFBQSxJQUNILEtBQUssTUFBTSxVQUFVLGtCQUFrQjtBQUFBLElBQ3ZDLEtBQUssTUFBTSxVQUFVLHlCQUF5QjtBQUFBLEVBQy9DLENBQUM7QUFDRjtBQUVPLFNBQVMsMEJBQTBCLFVBQXFDO0FBQzlFLFFBQU0sT0FBTyxjQUFjO0FBQzNCLFFBQU0sUUFBUSxZQUFZLHVCQUF1QjtBQUNqRCxRQUFNLE9BQU8sWUFBWSxhQUFhO0FBQ3RDLFFBQU0sZ0JBQWdCLGFBQWEsUUFBUSxFQUFFLFFBQVEsVUFBUTtBQUFBLElBQzVELEtBQUssTUFBTSxlQUFlLGNBQWMsT0FBTyxJQUFJO0FBQUEsSUFDbkQsS0FBSyxNQUFNLGVBQWUsY0FBYyxPQUFPLEtBQUs7QUFBQSxJQUNwRCxLQUFLLE1BQU0sZUFBZSxjQUFjLFVBQVUsV0FBVyxLQUFLO0FBQUEsSUFDbEUsS0FBSyxNQUFNLGVBQWUsY0FBYyxVQUFVLFdBQVcsSUFBSTtBQUFBLElBQ2pFLEtBQUssTUFBTSxjQUFjLE9BQU8sSUFBSTtBQUFBLElBQ3BDLEtBQUssTUFBTSxtQkFBbUIsVUFBVSxXQUFXLEtBQUs7QUFBQSxFQUN6RCxDQUFDO0FBQ0QsU0FBTyxZQUFZO0FBQUEsSUFDbEIsR0FBRztBQUFBLElBQ0gsS0FBSyxNQUFNLFNBQVMsT0FBTyxJQUFJO0FBQUEsSUFDL0IsS0FBSyxNQUFNLFVBQVUsT0FBTyxJQUFJO0FBQUEsSUFDaEMsS0FBSyxNQUFNLFVBQVUsT0FBTyxLQUFLO0FBQUEsSUFDakMsS0FBSyxNQUFNLFVBQVUsbUJBQW1CLFVBQVUsV0FBVyxLQUFLO0FBQUEsRUFDbkUsQ0FBQztBQUNGO0FBRU8sU0FBUyx3QkFBd0IsVUFBc0M7QUFDN0UsYUFBVyxhQUFhLHFCQUFxQixRQUFRLEdBQUc7QUFDdkQsUUFBSSxXQUFXLEtBQUssV0FBVyxjQUFjLENBQUMsR0FBRztBQUNoRCxhQUFPO0FBQUEsSUFDUjtBQUFBLEVBQ0Q7QUFDQSxTQUFPO0FBQ1I7QUFFTyxTQUFTLG9CQUFvQixVQUFzQztBQUN6RSxhQUFXLGFBQWEsMEJBQTBCLFFBQVEsR0FBRztBQUM1RCxRQUFJLFdBQVcsU0FBUyxHQUFHO0FBQzFCLGFBQU87QUFBQSxJQUNSO0FBQUEsRUFDRDtBQUNBLFNBQU87QUFDUjtBQUVPLFNBQVMsd0JBQXdCLE1BQXVCO0FBQzlELFNBQU8sV0FBVyxLQUFLLE1BQU0sUUFBUSxPQUFPLE9BQU8sUUFBUSxDQUFDLEtBQ3hELFdBQVcsS0FBSyxNQUFNLGNBQWMsQ0FBQztBQUMxQztBQUVPLFNBQVMsa0JBQWtCLE1BQWdFO0FBQ2pHLFFBQU0sTUFBTSxLQUFLLFFBQVEsUUFBUSxRQUFRLEdBQUcsZ0JBQWdCLE9BQU8sT0FBTyxHQUFHLElBQUksU0FBUztBQUMxRixNQUFJLFdBQVcsR0FBRyxHQUFHO0FBQ3BCLFdBQU8sRUFBRSxTQUFTLFFBQVEsVUFBVSxZQUFZLENBQUMsR0FBRyxFQUFFO0FBQUEsRUFDdkQ7QUFDQSxTQUFPLEVBQUUsU0FBUyxNQUFNLFlBQVksQ0FBQyxFQUFFO0FBQ3hDO0FBRU8sU0FBUyxvQkFBb0IsU0FBNEU7QUFDL0csTUFBSSxDQUFDLFdBQVc7QUFDZixXQUFPLEVBQUUsU0FBUyxZQUFZLENBQUMsR0FBRyxPQUFPLE1BQU07QUFBQSxFQUNoRDtBQUNBLFFBQU0sUUFBUSxRQUFRLFlBQVk7QUFDbEMsTUFBSSxNQUFNLFNBQVMsTUFBTSxHQUFHO0FBQzNCLFdBQU8sRUFBRSxTQUFTLFlBQVksQ0FBQyxHQUFHLE9BQU8sTUFBTTtBQUFBLEVBQ2hEO0FBQ0EsTUFBSSxNQUFNLFNBQVMsTUFBTSxLQUFLLE1BQU0sU0FBUyxNQUFNLEdBQUc7QUFDckQsV0FBTyxFQUFFLFNBQVMsUUFBUSxJQUFJLFdBQVcsV0FBVyxZQUFZLENBQUMsTUFBTSxNQUFNLE1BQU0sT0FBTyxHQUFHLE9BQU8sTUFBTTtBQUFBLEVBQzNHO0FBQ0EsTUFBSSxRQUFRLFNBQVMsSUFBSSxLQUFLLFFBQVEsU0FBUyxHQUFHLEdBQUc7QUFDcEQsV0FBTyxFQUFFLFNBQVMsWUFBWSxDQUFDLEdBQUcsT0FBTyxNQUFNO0FBQUEsRUFDaEQ7QUFHQSxTQUFPLEVBQUUsU0FBUyxZQUFZLENBQUMsR0FBRyxPQUFPLEtBQUs7QUFDL0M7QUFFTyxTQUFTLHdCQUF3QixXQUFXLGNBQWMsR0FBVztBQUMzRSxTQUFPLEtBQUssUUFBUSxJQUFJLFlBQVksS0FBSyxVQUFVLE1BQU0sR0FBRyxtQkFBbUI7QUFDaEY7QUFFTyxTQUFTLGFBQWEsV0FBVyxjQUFjLEdBQVc7QUFDaEUsU0FBTyxLQUFLLFVBQVUsU0FBUyxXQUFXO0FBQzNDO0FBRU8sU0FBUyxrQ0FBa0MsV0FBVyxjQUFjLEdBQXVCO0FBQ2pHLE1BQUk7QUFDSCxVQUFNLE9BQU8sYUFBYSx3QkFBd0IsUUFBUSxHQUFHLE1BQU07QUFDbkUsVUFBTSxRQUFRLEtBQUssTUFBTSxzQ0FBc0M7QUFDL0QsVUFBTSxRQUFRLFFBQVEsQ0FBQyxHQUFHLEtBQUssRUFBRSxRQUFRLGdCQUFnQixFQUFFO0FBQzNELFdBQU8sU0FBUztBQUFBLEVBQ2pCLFFBQVE7QUFDUCxXQUFPO0FBQUEsRUFDUjtBQUNEO0FBRU8sU0FBUyx1QkFBdUIsV0FBVyxjQUFjLEdBQXVCO0FBQ3RGLE1BQUk7QUFDSCxVQUFNLE1BQU0sS0FBSyxNQUFNLGFBQWEsYUFBYSxRQUFRLEdBQUcsTUFBTSxDQUFDO0FBQ25FLGVBQVcsU0FBUyxPQUFPLE9BQU8sR0FBRyxHQUFHO0FBQ3ZDLFVBQUksQ0FBQyxTQUFTLE9BQU8sVUFBVSxVQUFVO0FBQ3hDO0FBQUEsTUFDRDtBQUNBLFlBQU0sUUFBUTtBQUNkLFVBQUksT0FBTyxNQUFNLFFBQVEsWUFBWSxNQUFNLElBQUksS0FBSyxNQUFNLElBQUk7QUFDN0QsZUFBTyxNQUFNO0FBQUEsTUFDZDtBQUFBLElBQ0Q7QUFBQSxFQUNELFFBQVE7QUFDUCxXQUFPO0FBQUEsRUFDUjtBQUNBLFNBQU87QUFDUjtBQUVPLFNBQVMseUJBQXlCLEtBQXdCLFdBQVcsY0FBYyxHQUEyQjtBQUNwSCxNQUFJLElBQUksa0JBQWtCLEtBQUssR0FBRztBQUNqQyxXQUFPO0FBQUEsRUFDUjtBQUNBLE1BQUksa0NBQWtDLFFBQVEsR0FBRztBQUNoRCxXQUFPO0FBQUEsRUFDUjtBQUNBLFNBQU87QUFDUjtBQUVPLFNBQVMscUJBQXFCLEtBQXdCLFdBQVcsY0FBYyxHQUEyQjtBQUNoSCxNQUFJLElBQUksYUFBYSxLQUFLLEtBQUssSUFBSSx1QkFBdUIsS0FBSyxHQUFHO0FBQ2pFLFdBQU87QUFBQSxFQUNSO0FBQ0EsTUFBSSx1QkFBdUIsUUFBUSxHQUFHO0FBQ3JDLFdBQU87QUFBQSxFQUNSO0FBQ0EsU0FBTztBQUNSO0FBRU8sU0FBUyw2QkFBNkIsS0FBd0IsV0FBVyxjQUFjLEdBQVk7QUFDekcsU0FBTyx5QkFBeUIsS0FBSyxRQUFRLE1BQU07QUFDcEQ7QUFFTyxTQUFTLHlCQUF5QixLQUF3QixXQUFXLGNBQWMsR0FBWTtBQUNyRyxTQUFPLHFCQUFxQixLQUFLLFFBQVEsTUFBTTtBQUNoRDtBQUVPLFNBQVMsaUJBQWlCLFNBQTBCO0FBQzFELE1BQUksQ0FBQyxTQUFTO0FBQ2IsV0FBTztBQUFBLEVBQ1I7QUFDQSxNQUFJLFFBQVEsU0FBUyxHQUFHLEtBQUssUUFBUSxTQUFTLElBQUksS0FBSyxvQkFBb0IsS0FBSyxPQUFPLEdBQUc7QUFDekYsV0FBTyxXQUFXLE9BQU87QUFBQSxFQUMxQjtBQUNBLFNBQU87QUFDUjtBQUVBLGVBQXNCLGdCQUFnQixTQUFpQixPQUEwQixDQUFDLFdBQVcsR0FBRyxNQUF5QixRQUFRLEtBQUssWUFBWSxLQUF5QjtBQUMxSyxRQUFNLFdBQVcsb0JBQW9CLE9BQU87QUFDNUMsT0FBSyxTQUFTLFFBQVEsU0FBUyxHQUFHLEtBQUssU0FBUyxRQUFRLFNBQVMsSUFBSSxLQUFLLG9CQUFvQixLQUFLLFNBQVMsT0FBTyxNQUFNLENBQUMsV0FBVyxTQUFTLE9BQU8sR0FBRztBQUN2SixXQUFPO0FBQUEsRUFDUjtBQUNBLE1BQUk7QUFDSCxVQUFNLGNBQWMsU0FBUyxTQUFTLENBQUMsR0FBRyxTQUFTLFlBQVksR0FBRyxJQUFJLEdBQUc7QUFBQSxNQUN4RTtBQUFBLE1BQ0EsU0FBUztBQUFBLE1BQ1QsYUFBYTtBQUFBLE1BQ2IsT0FBTyxTQUFTO0FBQUEsSUFDakIsQ0FBQztBQUNELFdBQU87QUFBQSxFQUNSLFFBQVE7QUFDUCxRQUFJO0FBQ0gsWUFBTSxjQUFjLFNBQVMsU0FBUyxDQUFDLEdBQUcsU0FBUyxZQUFZLFFBQVEsR0FBRztBQUFBLFFBQ3pFO0FBQUEsUUFDQSxTQUFTO0FBQUEsUUFDVCxhQUFhO0FBQUEsUUFDYixPQUFPLFNBQVM7QUFBQSxNQUNqQixDQUFDO0FBQ0QsYUFBTztBQUFBLElBQ1IsUUFBUTtBQUNQLGFBQU87QUFBQSxJQUNSO0FBQUEsRUFDRDtBQUNEOyIsCiAgIm5hbWVzIjogW10KfQo=
