import { spawn } from "child_process";
import { existsSync } from "fs";
import { join } from "../../../../base/common/path.js";
import { DEEPSEEK_WORKER_PROVIDER_ID, GROK_WORKER_PROVIDER_ID } from "../../common/orchestration/orchestrationTypes.js";
import {
  deepSeekCredentialSource,
  findDeepSeekHarnessRoot,
  findGrokBuildBinary,
  grokCredentialSource,
  hasDeepSeekLocalRuntime,
  isExecutablePath,
  probeExecutable,
  resolveNodeNpmCli,
  resolveSpawnCommand
} from "./workerRuntime.js";
function createNodeProcessRunner() {
  return (command, args, options) => new Promise((resolve, reject) => {
    const resolved = resolveSpawnCommand(command);
    const child = spawn(resolved.command, [...resolved.prefixArgs, ...args], {
      cwd: options.cwd,
      env: options.env,
      shell: resolved.shell,
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    const onAbort = () => {
      child.kill();
    };
    if (options.abort.aborted) {
      child.kill();
    } else {
      options.abort.addEventListener("abort", onAbort, { once: true });
    }
    child.stdout?.on("data", (chunk) => {
      const text = String(chunk);
      stdout += text;
      options.onStdout?.(text);
    });
    child.stderr?.on("data", (chunk) => {
      const text = String(chunk);
      stderr += text;
      options.onStderr?.(text);
    });
    child.on("error", (error) => {
      options.abort.removeEventListener("abort", onAbort);
      reject(error);
    });
    child.on("close", (code) => {
      options.abort.removeEventListener("abort", onAbort);
      resolve({ exitCode: code ?? 1, stdout, stderr });
    });
  });
}
function workerPrompt(request) {
  const files = request.task.files.length > 0 ? request.task.files.join(", ") : "(leader did not pin files; stay on the smallest relevant set)";
  return [
    "You are a Forge worker. Execute only this task. Do not act as the leader.",
    `Overall goal: ${request.goal}`,
    `Shared contract:
${request.contract || "(none)"}`,
    `Task: ${request.task.title}`,
    request.task.prompt,
    request.task.workerModel ? `Preferred model: ${request.task.workerModel}` : void 0,
    request.task.thinkingLevel ? `Thinking effort: ${request.task.thinkingLevel}` : void 0,
    request.task.contextSize ? `Context size: ${request.task.contextSize}` : void 0,
    `Allowed / expected files: ${files}`,
    request.task.acceptance ? `Acceptance: ${request.task.acceptance}` : void 0,
    request.task.testCommand ? `Run this test if possible: ${request.task.testCommand}` : "Run a cheap relevant test if one exists.",
    "When finished, reply with a short structured summary only: status, changed files, test result, risks. No chat transcript."
  ].filter(Boolean).join("\n\n");
}
function parseWorkerSummary(stdout, exitCode, startedAt) {
  const text = stdout.trim();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        parsed = JSON.parse(text.slice(start, end + 1));
      } catch {
        parsed = void 0;
      }
    }
  }
  const changedFiles = Array.isArray(parsed?.changedFiles) ? parsed.changedFiles.filter((file) => typeof file === "string") : [];
  const usage = parsed?.usage && typeof parsed.usage === "object" ? parsed.usage : parsed;
  return {
    status: exitCode === 0 && parsed?.status !== "failed" ? "completed" : "failed",
    summary: typeof parsed?.text === "string" ? parsed.text : typeof parsed?.summary === "string" ? parsed.summary : text.slice(0, 2e3),
    changedFiles,
    testOutput: typeof parsed?.testOutput === "string" ? parsed.testOutput : void 0,
    testsPassed: typeof parsed?.testsPassed === "boolean" ? parsed.testsPassed : void 0,
    risk: typeof parsed?.risk === "string" ? parsed.risk : void 0,
    error: exitCode === 0 ? void 0 : typeof parsed?.message === "string" ? parsed.message : text.slice(0, 500) || `exit ${exitCode}`,
    usage: {
      durationMs: Date.now() - startedAt,
      inputTokens: asNumber(usage?.input_tokens ?? usage?.inputTokens),
      outputTokens: asNumber(usage?.output_tokens ?? usage?.outputTokens),
      costUsd: asNumber(usage?.total_cost_usd ?? usage?.costUsd)
    }
  };
}
function asNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : void 0;
}
function resolveDeepSeekCommand(repoRoot, env) {
  if (deepSeekCredentialSource(env) === "none") {
    return void 0;
  }
  const next = { ...env, DSH_PERMISSION_MODE: env.DSH_PERMISSION_MODE ?? "workspace-write" };
  const local = findDeepSeekHarnessRoot(repoRoot);
  if (local && hasDeepSeekLocalRuntime(local)) {
    const binJs = join(local, "apps", "cli", "lib", "bin.js");
    if (existsSync(binJs)) {
      return { command: process.execPath, args: [binJs, "--profile", "headless"], env: next };
    }
    const binTs = join(local, "apps", "cli", "src", "bin.ts");
    const tsx = join(local, "node_modules", "tsx", "dist", "esm", "index.mjs");
    if (existsSync(binTs) && existsSync(tsx)) {
      return { command: process.execPath, args: ["--import", tsx, binTs, "--profile", "headless"], env: next };
    }
    return { command: "pnpm", args: ["--dir", local, "dsh", "--profile", "headless"], env: next };
  }
  const npx = resolveNodeNpmCli("npx");
  return { command: npx.command, args: [...npx.prefixArgs, "--yes", "@deepseek-ai/dsh", "--profile", "headless"], env: next };
}
function resolveGrokCommand(repoRoot, env) {
  if (grokCredentialSource(env) === "none") {
    return void 0;
  }
  const next = {
    ...env,
    GROK_DISABLE_AUTOUPDATER: "1",
    GROK_MEMORY: "0"
  };
  const built = findGrokBuildBinary(repoRoot);
  if (built) {
    return { command: built, prefixArgs: [], env: next };
  }
  return { command: "grok", prefixArgs: [], env: next };
}
class DeepSeekHarnessWorker {
  constructor(_runner, _resolveCommand) {
    this._runner = _runner;
    this._resolveCommand = _resolveCommand;
    this.id = DEEPSEEK_WORKER_PROVIDER_ID;
    this.label = "DeepSeek Harness";
    this.defaultModel = "deepseek-v4-flash";
  }
  async checkAvailability() {
    const resolved = await this._resolveCommand();
    if (!resolved) {
      return { available: false, credentialSource: "none", reason: "missing-credentials" };
    }
    const credentialSource = deepSeekCredentialSource(resolved.env);
    const executable = [resolved.command, ...resolved.args.slice(0, 5)].join(" ");
    if (isExecutablePath(resolved.command)) {
      const imported = resolved.args[0] === "--import" ? resolved.args[1] : resolved.args[0];
      if (imported && /\.(js|mjs|cjs|ts)$/i.test(imported) && !existsSync(imported)) {
        return { available: false, credentialSource, executable, reason: "missing-executable" };
      }
      return { available: true, credentialSource, executable };
    }
    if (resolved.command === "pnpm") {
      const localDir = resolved.args[1];
      if (!localDir || !existsSync(join(localDir, "package.json"))) {
        return { available: false, credentialSource, executable, reason: "missing-executable" };
      }
    }
    const available = await probeExecutable(resolved.command, ["--version"], resolved.env);
    return { available, credentialSource, executable, reason: available ? void 0 : "probe-failed" };
  }
  async isAvailable() {
    return (await this.checkAvailability()).available;
  }
  async run(request) {
    const resolved = await this._resolveCommand();
    if (!resolved) {
      return unavailableResult(this.label, Date.now());
    }
    const startedAt = Date.now();
    let streamed = "";
    const onChunk = (chunk) => {
      streamed += chunk;
      request.hooks?.onProgress?.({ progress: streamed });
    };
    try {
      const result = await this._runner(resolved.command, [...resolved.args, workerPrompt(request)], {
        cwd: request.workspace,
        env: resolved.env,
        abort: request.abort,
        onStdout: onChunk,
        onStderr: onChunk
      });
      return parseWorkerSummary(result.stdout || result.stderr, result.exitCode, startedAt);
    } catch (error) {
      return {
        status: "failed",
        summary: "",
        changedFiles: [],
        error: error instanceof Error ? error.message : String(error),
        usage: { durationMs: Date.now() - startedAt }
      };
    }
  }
}
class GrokBuildWorker {
  constructor(_runner, _resolveCommand, _model) {
    this._runner = _runner;
    this._resolveCommand = _resolveCommand;
    this._model = _model;
    this.id = GROK_WORKER_PROVIDER_ID;
    this.label = "Grok Build";
    this.defaultModel = "grok-4.6";
  }
  async checkAvailability() {
    const resolved = await this._resolveCommand();
    if (!resolved) {
      return { available: false, credentialSource: "none", reason: "missing-credentials" };
    }
    const credentialSource = grokCredentialSource(resolved.env);
    const executable = resolved.command;
    if (isExecutablePath(resolved.command)) {
      return { available: true, credentialSource, executable };
    }
    const available = await probeExecutable(resolved.command, ["--version"], resolved.env);
    return { available, credentialSource, executable, reason: available ? void 0 : "probe-failed" };
  }
  async isAvailable() {
    return (await this.checkAvailability()).available;
  }
  async run(request) {
    const resolved = await this._resolveCommand();
    if (!resolved) {
      return unavailableResult(this.label, Date.now());
    }
    const startedAt = Date.now();
    let streamed = "";
    const onChunk = (chunk) => {
      streamed += chunk;
      request.hooks?.onProgress?.({ progress: streamed });
    };
    try {
      const result = await this._runner(resolved.command, [
        ...resolved.prefixArgs,
        "-p",
        workerPrompt(request),
        "--cwd",
        request.workspace,
        "--permission-mode",
        "auto",
        "--no-auto-update",
        "--output-format",
        "json",
        "-m",
        request.task.workerModel ?? this._model
      ], {
        cwd: request.workspace,
        env: resolved.env,
        abort: request.abort,
        onStdout: onChunk,
        onStderr: onChunk
      });
      return parseWorkerSummary(result.stdout || result.stderr, result.exitCode, startedAt);
    } catch (error) {
      return {
        status: "failed",
        summary: "",
        changedFiles: [],
        error: error instanceof Error ? error.message : String(error),
        usage: { durationMs: Date.now() - startedAt }
      };
    }
  }
}
function unavailableResult(label, startedAt) {
  return {
    status: "failed",
    summary: "",
    changedFiles: [],
    error: `${label} is not installed or its API key is missing.`,
    usage: { durationMs: Date.now() - startedAt }
  };
}
export {
  DeepSeekHarnessWorker,
  GrokBuildWorker,
  createNodeProcessRunner,
  parseWorkerSummary,
  resolveDeepSeekCommand,
  resolveGrokCommand,
  workerPrompt
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFxub2RlXFxvcmNoZXN0cmF0aW9uXFx3b3JrZXJBZGFwdGVycy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxyXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cclxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXHJcblxyXG5pbXBvcnQgeyBzcGF3biB9IGZyb20gJ2NoaWxkX3Byb2Nlc3MnO1xyXG5pbXBvcnQgeyBleGlzdHNTeW5jIH0gZnJvbSAnZnMnO1xyXG5pbXBvcnQgeyBqb2luIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XHJcbmltcG9ydCB0eXBlIHsgSVdvcmtlckF2YWlsYWJpbGl0eSwgSVdvcmtlclByb3ZpZGVyLCBJV29ya2VyUnVuUmVxdWVzdCwgSVdvcmtlclRhc2tSZXN1bHQgfSBmcm9tICcuLi8uLi9jb21tb24vb3JjaGVzdHJhdGlvbi9vcmNoZXN0cmF0aW9uVHlwZXMuanMnO1xyXG5pbXBvcnQgeyBERUVQU0VFS19XT1JLRVJfUFJPVklERVJfSUQsIEdST0tfV09SS0VSX1BST1ZJREVSX0lEIH0gZnJvbSAnLi4vLi4vY29tbW9uL29yY2hlc3RyYXRpb24vb3JjaGVzdHJhdGlvblR5cGVzLmpzJztcclxuaW1wb3J0IHtcclxuXHRkZWVwU2Vla0NyZWRlbnRpYWxTb3VyY2UsXHJcblx0ZmluZERlZXBTZWVrSGFybmVzc1Jvb3QsXHJcblx0ZmluZEdyb2tCdWlsZEJpbmFyeSxcclxuXHRncm9rQ3JlZGVudGlhbFNvdXJjZSxcclxuXHRoYXNEZWVwU2Vla0xvY2FsUnVudGltZSxcclxuXHRpc0V4ZWN1dGFibGVQYXRoLFxyXG5cdHByb2JlRXhlY3V0YWJsZSxcclxuXHRyZXNvbHZlTm9kZU5wbUNsaSxcclxuXHRyZXNvbHZlU3Bhd25Db21tYW5kLFxyXG59IGZyb20gJy4vd29ya2VyUnVudGltZS5qcyc7XHJcblxyXG5leHBvcnQgaW50ZXJmYWNlIElQcm9jZXNzUnVuUmVzdWx0IHtcclxuXHRyZWFkb25seSBleGl0Q29kZTogbnVtYmVyO1xyXG5cdHJlYWRvbmx5IHN0ZG91dDogc3RyaW5nO1xyXG5cdHJlYWRvbmx5IHN0ZGVycjogc3RyaW5nO1xyXG59XHJcblxyXG5leHBvcnQgdHlwZSBQcm9jZXNzUnVubmVyID0gKGNvbW1hbmQ6IHN0cmluZywgYXJnczogcmVhZG9ubHkgc3RyaW5nW10sIG9wdGlvbnM6IHsgY3dkOiBzdHJpbmc7IGVudjogTm9kZUpTLlByb2Nlc3NFbnY7IGFib3J0OiBBYm9ydFNpZ25hbDsgb25TdGRvdXQ/OiAoY2h1bms6IHN0cmluZykgPT4gdm9pZDsgb25TdGRlcnI/OiAoY2h1bms6IHN0cmluZykgPT4gdm9pZCB9KSA9PiBQcm9taXNlPElQcm9jZXNzUnVuUmVzdWx0PjtcclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVOb2RlUHJvY2Vzc1J1bm5lcigpOiBQcm9jZXNzUnVubmVyIHtcclxuXHRyZXR1cm4gKGNvbW1hbmQsIGFyZ3MsIG9wdGlvbnMpID0+IG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcclxuXHRcdGNvbnN0IHJlc29sdmVkID0gcmVzb2x2ZVNwYXduQ29tbWFuZChjb21tYW5kKTtcclxuXHRcdGNvbnN0IGNoaWxkID0gc3Bhd24ocmVzb2x2ZWQuY29tbWFuZCwgWy4uLnJlc29sdmVkLnByZWZpeEFyZ3MsIC4uLmFyZ3NdLCB7XHJcblx0XHRcdGN3ZDogb3B0aW9ucy5jd2QsXHJcblx0XHRcdGVudjogb3B0aW9ucy5lbnYsXHJcblx0XHRcdHNoZWxsOiByZXNvbHZlZC5zaGVsbCxcclxuXHRcdFx0d2luZG93c0hpZGU6IHRydWUsXHJcblx0XHR9KTtcclxuXHRcdGxldCBzdGRvdXQgPSAnJztcclxuXHRcdGxldCBzdGRlcnIgPSAnJztcclxuXHRcdGNvbnN0IG9uQWJvcnQgPSAoKSA9PiB7XHJcblx0XHRcdGNoaWxkLmtpbGwoKTtcclxuXHRcdH07XHJcblx0XHRpZiAob3B0aW9ucy5hYm9ydC5hYm9ydGVkKSB7XHJcblx0XHRcdGNoaWxkLmtpbGwoKTtcclxuXHRcdH0gZWxzZSB7XHJcblx0XHRcdG9wdGlvbnMuYWJvcnQuYWRkRXZlbnRMaXN0ZW5lcignYWJvcnQnLCBvbkFib3J0LCB7IG9uY2U6IHRydWUgfSk7XHJcblx0XHR9XHJcblx0XHRjaGlsZC5zdGRvdXQ/Lm9uKCdkYXRhJywgY2h1bmsgPT4ge1xyXG5cdFx0XHRjb25zdCB0ZXh0ID0gU3RyaW5nKGNodW5rKTtcclxuXHRcdFx0c3Rkb3V0ICs9IHRleHQ7XHJcblx0XHRcdG9wdGlvbnMub25TdGRvdXQ/Lih0ZXh0KTtcclxuXHRcdH0pO1xyXG5cdFx0Y2hpbGQuc3RkZXJyPy5vbignZGF0YScsIGNodW5rID0+IHtcclxuXHRcdFx0Y29uc3QgdGV4dCA9IFN0cmluZyhjaHVuayk7XHJcblx0XHRcdHN0ZGVyciArPSB0ZXh0O1xyXG5cdFx0XHRvcHRpb25zLm9uU3RkZXJyPy4odGV4dCk7XHJcblx0XHR9KTtcclxuXHRcdGNoaWxkLm9uKCdlcnJvcicsIGVycm9yID0+IHtcclxuXHRcdFx0b3B0aW9ucy5hYm9ydC5yZW1vdmVFdmVudExpc3RlbmVyKCdhYm9ydCcsIG9uQWJvcnQpO1xyXG5cdFx0XHRyZWplY3QoZXJyb3IpO1xyXG5cdFx0fSk7XHJcblx0XHRjaGlsZC5vbignY2xvc2UnLCBjb2RlID0+IHtcclxuXHRcdFx0b3B0aW9ucy5hYm9ydC5yZW1vdmVFdmVudExpc3RlbmVyKCdhYm9ydCcsIG9uQWJvcnQpO1xyXG5cdFx0XHRyZXNvbHZlKHsgZXhpdENvZGU6IGNvZGUgPz8gMSwgc3Rkb3V0LCBzdGRlcnIgfSk7XHJcblx0XHR9KTtcclxuXHR9KTtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIHdvcmtlclByb21wdChyZXF1ZXN0OiBJV29ya2VyUnVuUmVxdWVzdCk6IHN0cmluZyB7XHJcblx0Y29uc3QgZmlsZXMgPSByZXF1ZXN0LnRhc2suZmlsZXMubGVuZ3RoID4gMCA/IHJlcXVlc3QudGFzay5maWxlcy5qb2luKCcsICcpIDogJyhsZWFkZXIgZGlkIG5vdCBwaW4gZmlsZXM7IHN0YXkgb24gdGhlIHNtYWxsZXN0IHJlbGV2YW50IHNldCknO1xyXG5cdHJldHVybiBbXHJcblx0XHQnWW91IGFyZSBhIEZvcmdlIHdvcmtlci4gRXhlY3V0ZSBvbmx5IHRoaXMgdGFzay4gRG8gbm90IGFjdCBhcyB0aGUgbGVhZGVyLicsXHJcblx0XHRgT3ZlcmFsbCBnb2FsOiAke3JlcXVlc3QuZ29hbH1gLFxyXG5cdFx0YFNoYXJlZCBjb250cmFjdDpcXG4ke3JlcXVlc3QuY29udHJhY3QgfHwgJyhub25lKSd9YCxcclxuXHRcdGBUYXNrOiAke3JlcXVlc3QudGFzay50aXRsZX1gLFxyXG5cdFx0cmVxdWVzdC50YXNrLnByb21wdCxcclxuXHRcdHJlcXVlc3QudGFzay53b3JrZXJNb2RlbCA/IGBQcmVmZXJyZWQgbW9kZWw6ICR7cmVxdWVzdC50YXNrLndvcmtlck1vZGVsfWAgOiB1bmRlZmluZWQsXHJcblx0XHRyZXF1ZXN0LnRhc2sudGhpbmtpbmdMZXZlbCA/IGBUaGlua2luZyBlZmZvcnQ6ICR7cmVxdWVzdC50YXNrLnRoaW5raW5nTGV2ZWx9YCA6IHVuZGVmaW5lZCxcclxuXHRcdHJlcXVlc3QudGFzay5jb250ZXh0U2l6ZSA/IGBDb250ZXh0IHNpemU6ICR7cmVxdWVzdC50YXNrLmNvbnRleHRTaXplfWAgOiB1bmRlZmluZWQsXHJcblx0XHRgQWxsb3dlZCAvIGV4cGVjdGVkIGZpbGVzOiAke2ZpbGVzfWAsXHJcblx0XHRyZXF1ZXN0LnRhc2suYWNjZXB0YW5jZSA/IGBBY2NlcHRhbmNlOiAke3JlcXVlc3QudGFzay5hY2NlcHRhbmNlfWAgOiB1bmRlZmluZWQsXHJcblx0XHRyZXF1ZXN0LnRhc2sudGVzdENvbW1hbmQgPyBgUnVuIHRoaXMgdGVzdCBpZiBwb3NzaWJsZTogJHtyZXF1ZXN0LnRhc2sudGVzdENvbW1hbmR9YCA6ICdSdW4gYSBjaGVhcCByZWxldmFudCB0ZXN0IGlmIG9uZSBleGlzdHMuJyxcclxuXHRcdCdXaGVuIGZpbmlzaGVkLCByZXBseSB3aXRoIGEgc2hvcnQgc3RydWN0dXJlZCBzdW1tYXJ5IG9ubHk6IHN0YXR1cywgY2hhbmdlZCBmaWxlcywgdGVzdCByZXN1bHQsIHJpc2tzLiBObyBjaGF0IHRyYW5zY3JpcHQuJyxcclxuXHRdLmZpbHRlcihCb29sZWFuKS5qb2luKCdcXG5cXG4nKTtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIHBhcnNlV29ya2VyU3VtbWFyeShzdGRvdXQ6IHN0cmluZywgZXhpdENvZGU6IG51bWJlciwgc3RhcnRlZEF0OiBudW1iZXIpOiBJV29ya2VyVGFza1Jlc3VsdCB7XHJcblx0Y29uc3QgdGV4dCA9IHN0ZG91dC50cmltKCk7XHJcblx0bGV0IHBhcnNlZDogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfCB1bmRlZmluZWQ7XHJcblx0dHJ5IHtcclxuXHRcdHBhcnNlZCA9IEpTT04ucGFyc2UodGV4dCkgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XHJcblx0fSBjYXRjaCB7XHJcblx0XHRjb25zdCBzdGFydCA9IHRleHQuaW5kZXhPZigneycpO1xyXG5cdFx0Y29uc3QgZW5kID0gdGV4dC5sYXN0SW5kZXhPZignfScpO1xyXG5cdFx0aWYgKHN0YXJ0ID49IDAgJiYgZW5kID4gc3RhcnQpIHtcclxuXHRcdFx0dHJ5IHtcclxuXHRcdFx0XHRwYXJzZWQgPSBKU09OLnBhcnNlKHRleHQuc2xpY2Uoc3RhcnQsIGVuZCArIDEpKSBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcclxuXHRcdFx0fSBjYXRjaCB7XHJcblx0XHRcdFx0cGFyc2VkID0gdW5kZWZpbmVkO1xyXG5cdFx0XHR9XHJcblx0XHR9XHJcblx0fVxyXG5cdGNvbnN0IGNoYW5nZWRGaWxlcyA9IEFycmF5LmlzQXJyYXkocGFyc2VkPy5jaGFuZ2VkRmlsZXMpXHJcblx0XHQ/IHBhcnNlZC5jaGFuZ2VkRmlsZXMuZmlsdGVyKChmaWxlKTogZmlsZSBpcyBzdHJpbmcgPT4gdHlwZW9mIGZpbGUgPT09ICdzdHJpbmcnKVxyXG5cdFx0OiBbXTtcclxuXHRjb25zdCB1c2FnZSA9IHBhcnNlZD8udXNhZ2UgJiYgdHlwZW9mIHBhcnNlZC51c2FnZSA9PT0gJ29iamVjdCcgPyBwYXJzZWQudXNhZ2UgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4gOiBwYXJzZWQ7XHJcblx0cmV0dXJuIHtcclxuXHRcdHN0YXR1czogZXhpdENvZGUgPT09IDAgJiYgcGFyc2VkPy5zdGF0dXMgIT09ICdmYWlsZWQnID8gJ2NvbXBsZXRlZCcgOiAnZmFpbGVkJyxcclxuXHRcdHN1bW1hcnk6IHR5cGVvZiBwYXJzZWQ/LnRleHQgPT09ICdzdHJpbmcnID8gcGFyc2VkLnRleHQgOiB0eXBlb2YgcGFyc2VkPy5zdW1tYXJ5ID09PSAnc3RyaW5nJyA/IHBhcnNlZC5zdW1tYXJ5IDogdGV4dC5zbGljZSgwLCAyMDAwKSxcclxuXHRcdGNoYW5nZWRGaWxlcyxcclxuXHRcdHRlc3RPdXRwdXQ6IHR5cGVvZiBwYXJzZWQ/LnRlc3RPdXRwdXQgPT09ICdzdHJpbmcnID8gcGFyc2VkLnRlc3RPdXRwdXQgOiB1bmRlZmluZWQsXHJcblx0XHR0ZXN0c1Bhc3NlZDogdHlwZW9mIHBhcnNlZD8udGVzdHNQYXNzZWQgPT09ICdib29sZWFuJyA/IHBhcnNlZC50ZXN0c1Bhc3NlZCA6IHVuZGVmaW5lZCxcclxuXHRcdHJpc2s6IHR5cGVvZiBwYXJzZWQ/LnJpc2sgPT09ICdzdHJpbmcnID8gcGFyc2VkLnJpc2sgOiB1bmRlZmluZWQsXHJcblx0XHRlcnJvcjogZXhpdENvZGUgPT09IDAgPyB1bmRlZmluZWQgOiAodHlwZW9mIHBhcnNlZD8ubWVzc2FnZSA9PT0gJ3N0cmluZycgPyBwYXJzZWQubWVzc2FnZSA6IHRleHQuc2xpY2UoMCwgNTAwKSB8fCBgZXhpdCAke2V4aXRDb2RlfWApLFxyXG5cdFx0dXNhZ2U6IHtcclxuXHRcdFx0ZHVyYXRpb25NczogRGF0ZS5ub3coKSAtIHN0YXJ0ZWRBdCxcclxuXHRcdFx0aW5wdXRUb2tlbnM6IGFzTnVtYmVyKHVzYWdlPy5pbnB1dF90b2tlbnMgPz8gdXNhZ2U/LmlucHV0VG9rZW5zKSxcclxuXHRcdFx0b3V0cHV0VG9rZW5zOiBhc051bWJlcih1c2FnZT8ub3V0cHV0X3Rva2VucyA/PyB1c2FnZT8ub3V0cHV0VG9rZW5zKSxcclxuXHRcdFx0Y29zdFVzZDogYXNOdW1iZXIodXNhZ2U/LnRvdGFsX2Nvc3RfdXNkID8/IHVzYWdlPy5jb3N0VXNkKSxcclxuXHRcdH0sXHJcblx0fTtcclxufVxyXG5cclxuZnVuY3Rpb24gYXNOdW1iZXIodmFsdWU6IHVua25vd24pOiBudW1iZXIgfCB1bmRlZmluZWQge1xyXG5cdHJldHVybiB0eXBlb2YgdmFsdWUgPT09ICdudW1iZXInICYmIE51bWJlci5pc0Zpbml0ZSh2YWx1ZSkgPyB2YWx1ZSA6IHVuZGVmaW5lZDtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIHJlc29sdmVEZWVwU2Vla0NvbW1hbmQocmVwb1Jvb3Q6IHN0cmluZywgZW52OiBOb2RlSlMuUHJvY2Vzc0Vudik6IHsgY29tbWFuZDogc3RyaW5nOyBhcmdzOiBzdHJpbmdbXTsgZW52OiBOb2RlSlMuUHJvY2Vzc0VudiB9IHwgdW5kZWZpbmVkIHtcclxuXHRpZiAoZGVlcFNlZWtDcmVkZW50aWFsU291cmNlKGVudikgPT09ICdub25lJykge1xyXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcclxuXHR9XHJcblx0Y29uc3QgbmV4dCA9IHsgLi4uZW52LCBEU0hfUEVSTUlTU0lPTl9NT0RFOiBlbnYuRFNIX1BFUk1JU1NJT05fTU9ERSA/PyAnd29ya3NwYWNlLXdyaXRlJyB9O1xyXG5cdGNvbnN0IGxvY2FsID0gZmluZERlZXBTZWVrSGFybmVzc1Jvb3QocmVwb1Jvb3QpO1xyXG5cdGlmIChsb2NhbCAmJiBoYXNEZWVwU2Vla0xvY2FsUnVudGltZShsb2NhbCkpIHtcclxuXHRcdGNvbnN0IGJpbkpzID0gam9pbihsb2NhbCwgJ2FwcHMnLCAnY2xpJywgJ2xpYicsICdiaW4uanMnKTtcclxuXHRcdGlmIChleGlzdHNTeW5jKGJpbkpzKSkge1xyXG5cdFx0XHRyZXR1cm4geyBjb21tYW5kOiBwcm9jZXNzLmV4ZWNQYXRoLCBhcmdzOiBbYmluSnMsICctLXByb2ZpbGUnLCAnaGVhZGxlc3MnXSwgZW52OiBuZXh0IH07XHJcblx0XHR9XHJcblx0XHRjb25zdCBiaW5UcyA9IGpvaW4obG9jYWwsICdhcHBzJywgJ2NsaScsICdzcmMnLCAnYmluLnRzJyk7XHJcblx0XHRjb25zdCB0c3ggPSBqb2luKGxvY2FsLCAnbm9kZV9tb2R1bGVzJywgJ3RzeCcsICdkaXN0JywgJ2VzbScsICdpbmRleC5tanMnKTtcclxuXHRcdGlmIChleGlzdHNTeW5jKGJpblRzKSAmJiBleGlzdHNTeW5jKHRzeCkpIHtcclxuXHRcdFx0cmV0dXJuIHsgY29tbWFuZDogcHJvY2Vzcy5leGVjUGF0aCwgYXJnczogWyctLWltcG9ydCcsIHRzeCwgYmluVHMsICctLXByb2ZpbGUnLCAnaGVhZGxlc3MnXSwgZW52OiBuZXh0IH07XHJcblx0XHR9XHJcblx0XHRyZXR1cm4geyBjb21tYW5kOiAncG5wbScsIGFyZ3M6IFsnLS1kaXInLCBsb2NhbCwgJ2RzaCcsICctLXByb2ZpbGUnLCAnaGVhZGxlc3MnXSwgZW52OiBuZXh0IH07XHJcblx0fVxyXG5cdGNvbnN0IG5weCA9IHJlc29sdmVOb2RlTnBtQ2xpKCducHgnKTtcclxuXHRyZXR1cm4geyBjb21tYW5kOiBucHguY29tbWFuZCwgYXJnczogWy4uLm5weC5wcmVmaXhBcmdzLCAnLS15ZXMnLCAnQGRlZXBzZWVrLWFpL2RzaCcsICctLXByb2ZpbGUnLCAnaGVhZGxlc3MnXSwgZW52OiBuZXh0IH07XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiByZXNvbHZlR3Jva0NvbW1hbmQocmVwb1Jvb3Q6IHN0cmluZywgZW52OiBOb2RlSlMuUHJvY2Vzc0Vudik6IHsgY29tbWFuZDogc3RyaW5nOyBwcmVmaXhBcmdzOiBzdHJpbmdbXTsgZW52OiBOb2RlSlMuUHJvY2Vzc0VudiB9IHwgdW5kZWZpbmVkIHtcclxuXHRpZiAoZ3Jva0NyZWRlbnRpYWxTb3VyY2UoZW52KSA9PT0gJ25vbmUnKSB7XHJcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xyXG5cdH1cclxuXHRjb25zdCBuZXh0ID0ge1xyXG5cdFx0Li4uZW52LFxyXG5cdFx0R1JPS19ESVNBQkxFX0FVVE9VUERBVEVSOiAnMScsXHJcblx0XHRHUk9LX01FTU9SWTogJzAnLFxyXG5cdH07XHJcblx0Y29uc3QgYnVpbHQgPSBmaW5kR3Jva0J1aWxkQmluYXJ5KHJlcG9Sb290KTtcclxuXHRpZiAoYnVpbHQpIHtcclxuXHRcdHJldHVybiB7IGNvbW1hbmQ6IGJ1aWx0LCBwcmVmaXhBcmdzOiBbXSwgZW52OiBuZXh0IH07XHJcblx0fVxyXG5cdHJldHVybiB7IGNvbW1hbmQ6ICdncm9rJywgcHJlZml4QXJnczogW10sIGVudjogbmV4dCB9O1xyXG59XHJcblxyXG5leHBvcnQgY2xhc3MgRGVlcFNlZWtIYXJuZXNzV29ya2VyIGltcGxlbWVudHMgSVdvcmtlclByb3ZpZGVyIHtcclxuXHRyZWFkb25seSBpZCA9IERFRVBTRUVLX1dPUktFUl9QUk9WSURFUl9JRDtcclxuXHRyZWFkb25seSBsYWJlbCA9ICdEZWVwU2VlayBIYXJuZXNzJztcclxuXHRyZWFkb25seSBkZWZhdWx0TW9kZWwgPSAnZGVlcHNlZWstdjQtZmxhc2gnO1xyXG5cclxuXHRjb25zdHJ1Y3RvcihcclxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3J1bm5lcjogUHJvY2Vzc1J1bm5lcixcclxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3Jlc29sdmVDb21tYW5kOiAoKSA9PiBQcm9taXNlPHsgY29tbWFuZDogc3RyaW5nOyBhcmdzOiBzdHJpbmdbXTsgZW52OiBOb2RlSlMuUHJvY2Vzc0VudiB9IHwgdW5kZWZpbmVkPixcclxuXHQpIHsgfVxyXG5cclxuXHRhc3luYyBjaGVja0F2YWlsYWJpbGl0eSgpOiBQcm9taXNlPElXb3JrZXJBdmFpbGFiaWxpdHk+IHtcclxuXHRcdGNvbnN0IHJlc29sdmVkID0gYXdhaXQgdGhpcy5fcmVzb2x2ZUNvbW1hbmQoKTtcclxuXHRcdGlmICghcmVzb2x2ZWQpIHtcclxuXHRcdFx0cmV0dXJuIHsgYXZhaWxhYmxlOiBmYWxzZSwgY3JlZGVudGlhbFNvdXJjZTogJ25vbmUnLCByZWFzb246ICdtaXNzaW5nLWNyZWRlbnRpYWxzJyB9O1xyXG5cdFx0fVxyXG5cdFx0Y29uc3QgY3JlZGVudGlhbFNvdXJjZSA9IGRlZXBTZWVrQ3JlZGVudGlhbFNvdXJjZShyZXNvbHZlZC5lbnYpO1xyXG5cdFx0Y29uc3QgZXhlY3V0YWJsZSA9IFtyZXNvbHZlZC5jb21tYW5kLCAuLi5yZXNvbHZlZC5hcmdzLnNsaWNlKDAsIDUpXS5qb2luKCcgJyk7XHJcblx0XHRpZiAoaXNFeGVjdXRhYmxlUGF0aChyZXNvbHZlZC5jb21tYW5kKSkge1xyXG5cdFx0XHRjb25zdCBpbXBvcnRlZCA9IHJlc29sdmVkLmFyZ3NbMF0gPT09ICctLWltcG9ydCcgPyByZXNvbHZlZC5hcmdzWzFdIDogcmVzb2x2ZWQuYXJnc1swXTtcclxuXHRcdFx0aWYgKGltcG9ydGVkICYmIC9cXC4oanN8bWpzfGNqc3x0cykkL2kudGVzdChpbXBvcnRlZCkgJiYgIWV4aXN0c1N5bmMoaW1wb3J0ZWQpKSB7XHJcblx0XHRcdFx0cmV0dXJuIHsgYXZhaWxhYmxlOiBmYWxzZSwgY3JlZGVudGlhbFNvdXJjZSwgZXhlY3V0YWJsZSwgcmVhc29uOiAnbWlzc2luZy1leGVjdXRhYmxlJyB9O1xyXG5cdFx0XHR9XHJcblx0XHRcdHJldHVybiB7IGF2YWlsYWJsZTogdHJ1ZSwgY3JlZGVudGlhbFNvdXJjZSwgZXhlY3V0YWJsZSB9O1xyXG5cdFx0fVxyXG5cdFx0aWYgKHJlc29sdmVkLmNvbW1hbmQgPT09ICdwbnBtJykge1xyXG5cdFx0XHRjb25zdCBsb2NhbERpciA9IHJlc29sdmVkLmFyZ3NbMV07XHJcblx0XHRcdGlmICghbG9jYWxEaXIgfHwgIWV4aXN0c1N5bmMoam9pbihsb2NhbERpciwgJ3BhY2thZ2UuanNvbicpKSkge1xyXG5cdFx0XHRcdHJldHVybiB7IGF2YWlsYWJsZTogZmFsc2UsIGNyZWRlbnRpYWxTb3VyY2UsIGV4ZWN1dGFibGUsIHJlYXNvbjogJ21pc3NpbmctZXhlY3V0YWJsZScgfTtcclxuXHRcdFx0fVxyXG5cdFx0fVxyXG5cdFx0Y29uc3QgYXZhaWxhYmxlID0gYXdhaXQgcHJvYmVFeGVjdXRhYmxlKHJlc29sdmVkLmNvbW1hbmQsIFsnLS12ZXJzaW9uJ10sIHJlc29sdmVkLmVudik7XHJcblx0XHRyZXR1cm4geyBhdmFpbGFibGUsIGNyZWRlbnRpYWxTb3VyY2UsIGV4ZWN1dGFibGUsIHJlYXNvbjogYXZhaWxhYmxlID8gdW5kZWZpbmVkIDogJ3Byb2JlLWZhaWxlZCcgfTtcclxuXHR9XHJcblxyXG5cdGFzeW5jIGlzQXZhaWxhYmxlKCk6IFByb21pc2U8Ym9vbGVhbj4ge1xyXG5cdFx0cmV0dXJuIChhd2FpdCB0aGlzLmNoZWNrQXZhaWxhYmlsaXR5KCkpLmF2YWlsYWJsZTtcclxuXHR9XHJcblxyXG5cdGFzeW5jIHJ1bihyZXF1ZXN0OiBJV29ya2VyUnVuUmVxdWVzdCk6IFByb21pc2U8SVdvcmtlclRhc2tSZXN1bHQ+IHtcclxuXHRcdGNvbnN0IHJlc29sdmVkID0gYXdhaXQgdGhpcy5fcmVzb2x2ZUNvbW1hbmQoKTtcclxuXHRcdGlmICghcmVzb2x2ZWQpIHtcclxuXHRcdFx0cmV0dXJuIHVuYXZhaWxhYmxlUmVzdWx0KHRoaXMubGFiZWwsIERhdGUubm93KCkpO1xyXG5cdFx0fVxyXG5cdFx0Y29uc3Qgc3RhcnRlZEF0ID0gRGF0ZS5ub3coKTtcclxuXHRcdGxldCBzdHJlYW1lZCA9ICcnO1xyXG5cdFx0Y29uc3Qgb25DaHVuayA9IChjaHVuazogc3RyaW5nKSA9PiB7XHJcblx0XHRcdHN0cmVhbWVkICs9IGNodW5rO1xyXG5cdFx0XHRyZXF1ZXN0Lmhvb2tzPy5vblByb2dyZXNzPy4oeyBwcm9ncmVzczogc3RyZWFtZWQgfSk7XHJcblx0XHR9O1xyXG5cdFx0dHJ5IHtcclxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5fcnVubmVyKHJlc29sdmVkLmNvbW1hbmQsIFsuLi5yZXNvbHZlZC5hcmdzLCB3b3JrZXJQcm9tcHQocmVxdWVzdCldLCB7XHJcblx0XHRcdFx0Y3dkOiByZXF1ZXN0LndvcmtzcGFjZSxcclxuXHRcdFx0XHRlbnY6IHJlc29sdmVkLmVudixcclxuXHRcdFx0XHRhYm9ydDogcmVxdWVzdC5hYm9ydCxcclxuXHRcdFx0XHRvblN0ZG91dDogb25DaHVuayxcclxuXHRcdFx0XHRvblN0ZGVycjogb25DaHVuayxcclxuXHRcdFx0fSk7XHJcblx0XHRcdHJldHVybiBwYXJzZVdvcmtlclN1bW1hcnkocmVzdWx0LnN0ZG91dCB8fCByZXN1bHQuc3RkZXJyLCByZXN1bHQuZXhpdENvZGUsIHN0YXJ0ZWRBdCk7XHJcblx0XHR9IGNhdGNoIChlcnJvcikge1xyXG5cdFx0XHRyZXR1cm4ge1xyXG5cdFx0XHRcdHN0YXR1czogJ2ZhaWxlZCcsXHJcblx0XHRcdFx0c3VtbWFyeTogJycsXHJcblx0XHRcdFx0Y2hhbmdlZEZpbGVzOiBbXSxcclxuXHRcdFx0XHRlcnJvcjogZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBTdHJpbmcoZXJyb3IpLFxyXG5cdFx0XHRcdHVzYWdlOiB7IGR1cmF0aW9uTXM6IERhdGUubm93KCkgLSBzdGFydGVkQXQgfSxcclxuXHRcdFx0fTtcclxuXHRcdH1cclxuXHR9XHJcbn1cclxuXHJcbmV4cG9ydCBjbGFzcyBHcm9rQnVpbGRXb3JrZXIgaW1wbGVtZW50cyBJV29ya2VyUHJvdmlkZXIge1xyXG5cdHJlYWRvbmx5IGlkID0gR1JPS19XT1JLRVJfUFJPVklERVJfSUQ7XHJcblx0cmVhZG9ubHkgbGFiZWwgPSAnR3JvayBCdWlsZCc7XHJcblx0cmVhZG9ubHkgZGVmYXVsdE1vZGVsID0gJ2dyb2stNC42JztcclxuXHJcblx0Y29uc3RydWN0b3IoXHJcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9ydW5uZXI6IFByb2Nlc3NSdW5uZXIsXHJcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9yZXNvbHZlQ29tbWFuZDogKCkgPT4gUHJvbWlzZTx7IGNvbW1hbmQ6IHN0cmluZzsgcHJlZml4QXJnczogc3RyaW5nW107IGVudjogTm9kZUpTLlByb2Nlc3NFbnYgfSB8IHVuZGVmaW5lZD4sXHJcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9tb2RlbDogc3RyaW5nLFxyXG5cdCkgeyB9XHJcblxyXG5cdGFzeW5jIGNoZWNrQXZhaWxhYmlsaXR5KCk6IFByb21pc2U8SVdvcmtlckF2YWlsYWJpbGl0eT4ge1xyXG5cdFx0Y29uc3QgcmVzb2x2ZWQgPSBhd2FpdCB0aGlzLl9yZXNvbHZlQ29tbWFuZCgpO1xyXG5cdFx0aWYgKCFyZXNvbHZlZCkge1xyXG5cdFx0XHRyZXR1cm4geyBhdmFpbGFibGU6IGZhbHNlLCBjcmVkZW50aWFsU291cmNlOiAnbm9uZScsIHJlYXNvbjogJ21pc3NpbmctY3JlZGVudGlhbHMnIH07XHJcblx0XHR9XHJcblx0XHRjb25zdCBjcmVkZW50aWFsU291cmNlID0gZ3Jva0NyZWRlbnRpYWxTb3VyY2UocmVzb2x2ZWQuZW52KTtcclxuXHRcdGNvbnN0IGV4ZWN1dGFibGUgPSByZXNvbHZlZC5jb21tYW5kO1xyXG5cdFx0aWYgKGlzRXhlY3V0YWJsZVBhdGgocmVzb2x2ZWQuY29tbWFuZCkpIHtcclxuXHRcdFx0cmV0dXJuIHsgYXZhaWxhYmxlOiB0cnVlLCBjcmVkZW50aWFsU291cmNlLCBleGVjdXRhYmxlIH07XHJcblx0XHR9XHJcblx0XHRjb25zdCBhdmFpbGFibGUgPSBhd2FpdCBwcm9iZUV4ZWN1dGFibGUocmVzb2x2ZWQuY29tbWFuZCwgWyctLXZlcnNpb24nXSwgcmVzb2x2ZWQuZW52KTtcclxuXHRcdHJldHVybiB7IGF2YWlsYWJsZSwgY3JlZGVudGlhbFNvdXJjZSwgZXhlY3V0YWJsZSwgcmVhc29uOiBhdmFpbGFibGUgPyB1bmRlZmluZWQgOiAncHJvYmUtZmFpbGVkJyB9O1xyXG5cdH1cclxuXHJcblx0YXN5bmMgaXNBdmFpbGFibGUoKTogUHJvbWlzZTxib29sZWFuPiB7XHJcblx0XHRyZXR1cm4gKGF3YWl0IHRoaXMuY2hlY2tBdmFpbGFiaWxpdHkoKSkuYXZhaWxhYmxlO1xyXG5cdH1cclxuXHJcblx0YXN5bmMgcnVuKHJlcXVlc3Q6IElXb3JrZXJSdW5SZXF1ZXN0KTogUHJvbWlzZTxJV29ya2VyVGFza1Jlc3VsdD4ge1xyXG5cdFx0Y29uc3QgcmVzb2x2ZWQgPSBhd2FpdCB0aGlzLl9yZXNvbHZlQ29tbWFuZCgpO1xyXG5cdFx0aWYgKCFyZXNvbHZlZCkge1xyXG5cdFx0XHRyZXR1cm4gdW5hdmFpbGFibGVSZXN1bHQodGhpcy5sYWJlbCwgRGF0ZS5ub3coKSk7XHJcblx0XHR9XHJcblx0XHRjb25zdCBzdGFydGVkQXQgPSBEYXRlLm5vdygpO1xyXG5cdFx0bGV0IHN0cmVhbWVkID0gJyc7XHJcblx0XHRjb25zdCBvbkNodW5rID0gKGNodW5rOiBzdHJpbmcpID0+IHtcclxuXHRcdFx0c3RyZWFtZWQgKz0gY2h1bms7XHJcblx0XHRcdHJlcXVlc3QuaG9va3M/Lm9uUHJvZ3Jlc3M/Lih7IHByb2dyZXNzOiBzdHJlYW1lZCB9KTtcclxuXHRcdH07XHJcblx0XHR0cnkge1xyXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLl9ydW5uZXIocmVzb2x2ZWQuY29tbWFuZCwgW1xyXG5cdFx0XHRcdC4uLnJlc29sdmVkLnByZWZpeEFyZ3MsXHJcblx0XHRcdFx0Jy1wJywgd29ya2VyUHJvbXB0KHJlcXVlc3QpLFxyXG5cdFx0XHRcdCctLWN3ZCcsIHJlcXVlc3Qud29ya3NwYWNlLFxyXG5cdFx0XHRcdCctLXBlcm1pc3Npb24tbW9kZScsICdhdXRvJyxcclxuXHRcdFx0XHQnLS1uby1hdXRvLXVwZGF0ZScsXHJcblx0XHRcdFx0Jy0tb3V0cHV0LWZvcm1hdCcsICdqc29uJyxcclxuXHRcdFx0XHQnLW0nLCByZXF1ZXN0LnRhc2sud29ya2VyTW9kZWwgPz8gdGhpcy5fbW9kZWwsXHJcblx0XHRcdF0sIHtcclxuXHRcdFx0XHRjd2Q6IHJlcXVlc3Qud29ya3NwYWNlLFxyXG5cdFx0XHRcdGVudjogcmVzb2x2ZWQuZW52LFxyXG5cdFx0XHRcdGFib3J0OiByZXF1ZXN0LmFib3J0LFxyXG5cdFx0XHRcdG9uU3Rkb3V0OiBvbkNodW5rLFxyXG5cdFx0XHRcdG9uU3RkZXJyOiBvbkNodW5rLFxyXG5cdFx0XHR9KTtcclxuXHRcdFx0cmV0dXJuIHBhcnNlV29ya2VyU3VtbWFyeShyZXN1bHQuc3Rkb3V0IHx8IHJlc3VsdC5zdGRlcnIsIHJlc3VsdC5leGl0Q29kZSwgc3RhcnRlZEF0KTtcclxuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XHJcblx0XHRcdHJldHVybiB7XHJcblx0XHRcdFx0c3RhdHVzOiAnZmFpbGVkJyxcclxuXHRcdFx0XHRzdW1tYXJ5OiAnJyxcclxuXHRcdFx0XHRjaGFuZ2VkRmlsZXM6IFtdLFxyXG5cdFx0XHRcdGVycm9yOiBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFN0cmluZyhlcnJvciksXHJcblx0XHRcdFx0dXNhZ2U6IHsgZHVyYXRpb25NczogRGF0ZS5ub3coKSAtIHN0YXJ0ZWRBdCB9LFxyXG5cdFx0XHR9O1xyXG5cdFx0fVxyXG5cdH1cclxufVxyXG5cclxuZnVuY3Rpb24gdW5hdmFpbGFibGVSZXN1bHQobGFiZWw6IHN0cmluZywgc3RhcnRlZEF0OiBudW1iZXIpOiBJV29ya2VyVGFza1Jlc3VsdCB7XHJcblx0cmV0dXJuIHtcclxuXHRcdHN0YXR1czogJ2ZhaWxlZCcsXHJcblx0XHRzdW1tYXJ5OiAnJyxcclxuXHRcdGNoYW5nZWRGaWxlczogW10sXHJcblx0XHRlcnJvcjogYCR7bGFiZWx9IGlzIG5vdCBpbnN0YWxsZWQgb3IgaXRzIEFQSSBrZXkgaXMgbWlzc2luZy5gLFxyXG5cdFx0dXNhZ2U6IHsgZHVyYXRpb25NczogRGF0ZS5ub3coKSAtIHN0YXJ0ZWRBdCB9LFxyXG5cdH07XHJcbn1cclxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsWUFBWTtBQUVyQixTQUFTLDZCQUE2QiwrQkFBK0I7QUFDckU7QUFBQSxFQUNDO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxPQUNNO0FBVUEsU0FBUywwQkFBeUM7QUFDeEQsU0FBTyxDQUFDLFNBQVMsTUFBTSxZQUFZLElBQUksUUFBUSxDQUFDLFNBQVMsV0FBVztBQUNuRSxVQUFNLFdBQVcsb0JBQW9CLE9BQU87QUFDNUMsVUFBTSxRQUFRLE1BQU0sU0FBUyxTQUFTLENBQUMsR0FBRyxTQUFTLFlBQVksR0FBRyxJQUFJLEdBQUc7QUFBQSxNQUN4RSxLQUFLLFFBQVE7QUFBQSxNQUNiLEtBQUssUUFBUTtBQUFBLE1BQ2IsT0FBTyxTQUFTO0FBQUEsTUFDaEIsYUFBYTtBQUFBLElBQ2QsQ0FBQztBQUNELFFBQUksU0FBUztBQUNiLFFBQUksU0FBUztBQUNiLFVBQU0sVUFBVSxNQUFNO0FBQ3JCLFlBQU0sS0FBSztBQUFBLElBQ1o7QUFDQSxRQUFJLFFBQVEsTUFBTSxTQUFTO0FBQzFCLFlBQU0sS0FBSztBQUFBLElBQ1osT0FBTztBQUNOLGNBQVEsTUFBTSxpQkFBaUIsU0FBUyxTQUFTLEVBQUUsTUFBTSxLQUFLLENBQUM7QUFBQSxJQUNoRTtBQUNBLFVBQU0sUUFBUSxHQUFHLFFBQVEsV0FBUztBQUNqQyxZQUFNLE9BQU8sT0FBTyxLQUFLO0FBQ3pCLGdCQUFVO0FBQ1YsY0FBUSxXQUFXLElBQUk7QUFBQSxJQUN4QixDQUFDO0FBQ0QsVUFBTSxRQUFRLEdBQUcsUUFBUSxXQUFTO0FBQ2pDLFlBQU0sT0FBTyxPQUFPLEtBQUs7QUFDekIsZ0JBQVU7QUFDVixjQUFRLFdBQVcsSUFBSTtBQUFBLElBQ3hCLENBQUM7QUFDRCxVQUFNLEdBQUcsU0FBUyxXQUFTO0FBQzFCLGNBQVEsTUFBTSxvQkFBb0IsU0FBUyxPQUFPO0FBQ2xELGFBQU8sS0FBSztBQUFBLElBQ2IsQ0FBQztBQUNELFVBQU0sR0FBRyxTQUFTLFVBQVE7QUFDekIsY0FBUSxNQUFNLG9CQUFvQixTQUFTLE9BQU87QUFDbEQsY0FBUSxFQUFFLFVBQVUsUUFBUSxHQUFHLFFBQVEsT0FBTyxDQUFDO0FBQUEsSUFDaEQsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUNGO0FBRU8sU0FBUyxhQUFhLFNBQW9DO0FBQ2hFLFFBQU0sUUFBUSxRQUFRLEtBQUssTUFBTSxTQUFTLElBQUksUUFBUSxLQUFLLE1BQU0sS0FBSyxJQUFJLElBQUk7QUFDOUUsU0FBTztBQUFBLElBQ047QUFBQSxJQUNBLGlCQUFpQixRQUFRLElBQUk7QUFBQSxJQUM3QjtBQUFBLEVBQXFCLFFBQVEsWUFBWSxRQUFRO0FBQUEsSUFDakQsU0FBUyxRQUFRLEtBQUssS0FBSztBQUFBLElBQzNCLFFBQVEsS0FBSztBQUFBLElBQ2IsUUFBUSxLQUFLLGNBQWMsb0JBQW9CLFFBQVEsS0FBSyxXQUFXLEtBQUs7QUFBQSxJQUM1RSxRQUFRLEtBQUssZ0JBQWdCLG9CQUFvQixRQUFRLEtBQUssYUFBYSxLQUFLO0FBQUEsSUFDaEYsUUFBUSxLQUFLLGNBQWMsaUJBQWlCLFFBQVEsS0FBSyxXQUFXLEtBQUs7QUFBQSxJQUN6RSw2QkFBNkIsS0FBSztBQUFBLElBQ2xDLFFBQVEsS0FBSyxhQUFhLGVBQWUsUUFBUSxLQUFLLFVBQVUsS0FBSztBQUFBLElBQ3JFLFFBQVEsS0FBSyxjQUFjLDhCQUE4QixRQUFRLEtBQUssV0FBVyxLQUFLO0FBQUEsSUFDdEY7QUFBQSxFQUNELEVBQUUsT0FBTyxPQUFPLEVBQUUsS0FBSyxNQUFNO0FBQzlCO0FBRU8sU0FBUyxtQkFBbUIsUUFBZ0IsVUFBa0IsV0FBc0M7QUFDMUcsUUFBTSxPQUFPLE9BQU8sS0FBSztBQUN6QixNQUFJO0FBQ0osTUFBSTtBQUNILGFBQVMsS0FBSyxNQUFNLElBQUk7QUFBQSxFQUN6QixRQUFRO0FBQ1AsVUFBTSxRQUFRLEtBQUssUUFBUSxHQUFHO0FBQzlCLFVBQU0sTUFBTSxLQUFLLFlBQVksR0FBRztBQUNoQyxRQUFJLFNBQVMsS0FBSyxNQUFNLE9BQU87QUFDOUIsVUFBSTtBQUNILGlCQUFTLEtBQUssTUFBTSxLQUFLLE1BQU0sT0FBTyxNQUFNLENBQUMsQ0FBQztBQUFBLE1BQy9DLFFBQVE7QUFDUCxpQkFBUztBQUFBLE1BQ1Y7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUNBLFFBQU0sZUFBZSxNQUFNLFFBQVEsUUFBUSxZQUFZLElBQ3BELE9BQU8sYUFBYSxPQUFPLENBQUMsU0FBeUIsT0FBTyxTQUFTLFFBQVEsSUFDN0UsQ0FBQztBQUNKLFFBQU0sUUFBUSxRQUFRLFNBQVMsT0FBTyxPQUFPLFVBQVUsV0FBVyxPQUFPLFFBQW1DO0FBQzVHLFNBQU87QUFBQSxJQUNOLFFBQVEsYUFBYSxLQUFLLFFBQVEsV0FBVyxXQUFXLGNBQWM7QUFBQSxJQUN0RSxTQUFTLE9BQU8sUUFBUSxTQUFTLFdBQVcsT0FBTyxPQUFPLE9BQU8sUUFBUSxZQUFZLFdBQVcsT0FBTyxVQUFVLEtBQUssTUFBTSxHQUFHLEdBQUk7QUFBQSxJQUNuSTtBQUFBLElBQ0EsWUFBWSxPQUFPLFFBQVEsZUFBZSxXQUFXLE9BQU8sYUFBYTtBQUFBLElBQ3pFLGFBQWEsT0FBTyxRQUFRLGdCQUFnQixZQUFZLE9BQU8sY0FBYztBQUFBLElBQzdFLE1BQU0sT0FBTyxRQUFRLFNBQVMsV0FBVyxPQUFPLE9BQU87QUFBQSxJQUN2RCxPQUFPLGFBQWEsSUFBSSxTQUFhLE9BQU8sUUFBUSxZQUFZLFdBQVcsT0FBTyxVQUFVLEtBQUssTUFBTSxHQUFHLEdBQUcsS0FBSyxRQUFRLFFBQVE7QUFBQSxJQUNsSSxPQUFPO0FBQUEsTUFDTixZQUFZLEtBQUssSUFBSSxJQUFJO0FBQUEsTUFDekIsYUFBYSxTQUFTLE9BQU8sZ0JBQWdCLE9BQU8sV0FBVztBQUFBLE1BQy9ELGNBQWMsU0FBUyxPQUFPLGlCQUFpQixPQUFPLFlBQVk7QUFBQSxNQUNsRSxTQUFTLFNBQVMsT0FBTyxrQkFBa0IsT0FBTyxPQUFPO0FBQUEsSUFDMUQ7QUFBQSxFQUNEO0FBQ0Q7QUFFQSxTQUFTLFNBQVMsT0FBb0M7QUFDckQsU0FBTyxPQUFPLFVBQVUsWUFBWSxPQUFPLFNBQVMsS0FBSyxJQUFJLFFBQVE7QUFDdEU7QUFFTyxTQUFTLHVCQUF1QixVQUFrQixLQUFpRztBQUN6SixNQUFJLHlCQUF5QixHQUFHLE1BQU0sUUFBUTtBQUM3QyxXQUFPO0FBQUEsRUFDUjtBQUNBLFFBQU0sT0FBTyxFQUFFLEdBQUcsS0FBSyxxQkFBcUIsSUFBSSx1QkFBdUIsa0JBQWtCO0FBQ3pGLFFBQU0sUUFBUSx3QkFBd0IsUUFBUTtBQUM5QyxNQUFJLFNBQVMsd0JBQXdCLEtBQUssR0FBRztBQUM1QyxVQUFNLFFBQVEsS0FBSyxPQUFPLFFBQVEsT0FBTyxPQUFPLFFBQVE7QUFDeEQsUUFBSSxXQUFXLEtBQUssR0FBRztBQUN0QixhQUFPLEVBQUUsU0FBUyxRQUFRLFVBQVUsTUFBTSxDQUFDLE9BQU8sYUFBYSxVQUFVLEdBQUcsS0FBSyxLQUFLO0FBQUEsSUFDdkY7QUFDQSxVQUFNLFFBQVEsS0FBSyxPQUFPLFFBQVEsT0FBTyxPQUFPLFFBQVE7QUFDeEQsVUFBTSxNQUFNLEtBQUssT0FBTyxnQkFBZ0IsT0FBTyxRQUFRLE9BQU8sV0FBVztBQUN6RSxRQUFJLFdBQVcsS0FBSyxLQUFLLFdBQVcsR0FBRyxHQUFHO0FBQ3pDLGFBQU8sRUFBRSxTQUFTLFFBQVEsVUFBVSxNQUFNLENBQUMsWUFBWSxLQUFLLE9BQU8sYUFBYSxVQUFVLEdBQUcsS0FBSyxLQUFLO0FBQUEsSUFDeEc7QUFDQSxXQUFPLEVBQUUsU0FBUyxRQUFRLE1BQU0sQ0FBQyxTQUFTLE9BQU8sT0FBTyxhQUFhLFVBQVUsR0FBRyxLQUFLLEtBQUs7QUFBQSxFQUM3RjtBQUNBLFFBQU0sTUFBTSxrQkFBa0IsS0FBSztBQUNuQyxTQUFPLEVBQUUsU0FBUyxJQUFJLFNBQVMsTUFBTSxDQUFDLEdBQUcsSUFBSSxZQUFZLFNBQVMsb0JBQW9CLGFBQWEsVUFBVSxHQUFHLEtBQUssS0FBSztBQUMzSDtBQUVPLFNBQVMsbUJBQW1CLFVBQWtCLEtBQXVHO0FBQzNKLE1BQUkscUJBQXFCLEdBQUcsTUFBTSxRQUFRO0FBQ3pDLFdBQU87QUFBQSxFQUNSO0FBQ0EsUUFBTSxPQUFPO0FBQUEsSUFDWixHQUFHO0FBQUEsSUFDSCwwQkFBMEI7QUFBQSxJQUMxQixhQUFhO0FBQUEsRUFDZDtBQUNBLFFBQU0sUUFBUSxvQkFBb0IsUUFBUTtBQUMxQyxNQUFJLE9BQU87QUFDVixXQUFPLEVBQUUsU0FBUyxPQUFPLFlBQVksQ0FBQyxHQUFHLEtBQUssS0FBSztBQUFBLEVBQ3BEO0FBQ0EsU0FBTyxFQUFFLFNBQVMsUUFBUSxZQUFZLENBQUMsR0FBRyxLQUFLLEtBQUs7QUFDckQ7QUFFTyxNQUFNLHNCQUFpRDtBQUFBLEVBSzdELFlBQ2tCLFNBQ0EsaUJBQ2hCO0FBRmdCO0FBQ0E7QUFObEIsU0FBUyxLQUFLO0FBQ2QsU0FBUyxRQUFRO0FBQ2pCLFNBQVMsZUFBZTtBQUFBLEVBS3BCO0FBQUEsRUFFSixNQUFNLG9CQUFrRDtBQUN2RCxVQUFNLFdBQVcsTUFBTSxLQUFLLGdCQUFnQjtBQUM1QyxRQUFJLENBQUMsVUFBVTtBQUNkLGFBQU8sRUFBRSxXQUFXLE9BQU8sa0JBQWtCLFFBQVEsUUFBUSxzQkFBc0I7QUFBQSxJQUNwRjtBQUNBLFVBQU0sbUJBQW1CLHlCQUF5QixTQUFTLEdBQUc7QUFDOUQsVUFBTSxhQUFhLENBQUMsU0FBUyxTQUFTLEdBQUcsU0FBUyxLQUFLLE1BQU0sR0FBRyxDQUFDLENBQUMsRUFBRSxLQUFLLEdBQUc7QUFDNUUsUUFBSSxpQkFBaUIsU0FBUyxPQUFPLEdBQUc7QUFDdkMsWUFBTSxXQUFXLFNBQVMsS0FBSyxDQUFDLE1BQU0sYUFBYSxTQUFTLEtBQUssQ0FBQyxJQUFJLFNBQVMsS0FBSyxDQUFDO0FBQ3JGLFVBQUksWUFBWSxzQkFBc0IsS0FBSyxRQUFRLEtBQUssQ0FBQyxXQUFXLFFBQVEsR0FBRztBQUM5RSxlQUFPLEVBQUUsV0FBVyxPQUFPLGtCQUFrQixZQUFZLFFBQVEscUJBQXFCO0FBQUEsTUFDdkY7QUFDQSxhQUFPLEVBQUUsV0FBVyxNQUFNLGtCQUFrQixXQUFXO0FBQUEsSUFDeEQ7QUFDQSxRQUFJLFNBQVMsWUFBWSxRQUFRO0FBQ2hDLFlBQU0sV0FBVyxTQUFTLEtBQUssQ0FBQztBQUNoQyxVQUFJLENBQUMsWUFBWSxDQUFDLFdBQVcsS0FBSyxVQUFVLGNBQWMsQ0FBQyxHQUFHO0FBQzdELGVBQU8sRUFBRSxXQUFXLE9BQU8sa0JBQWtCLFlBQVksUUFBUSxxQkFBcUI7QUFBQSxNQUN2RjtBQUFBLElBQ0Q7QUFDQSxVQUFNLFlBQVksTUFBTSxnQkFBZ0IsU0FBUyxTQUFTLENBQUMsV0FBVyxHQUFHLFNBQVMsR0FBRztBQUNyRixXQUFPLEVBQUUsV0FBVyxrQkFBa0IsWUFBWSxRQUFRLFlBQVksU0FBWSxlQUFlO0FBQUEsRUFDbEc7QUFBQSxFQUVBLE1BQU0sY0FBZ0M7QUFDckMsWUFBUSxNQUFNLEtBQUssa0JBQWtCLEdBQUc7QUFBQSxFQUN6QztBQUFBLEVBRUEsTUFBTSxJQUFJLFNBQXdEO0FBQ2pFLFVBQU0sV0FBVyxNQUFNLEtBQUssZ0JBQWdCO0FBQzVDLFFBQUksQ0FBQyxVQUFVO0FBQ2QsYUFBTyxrQkFBa0IsS0FBSyxPQUFPLEtBQUssSUFBSSxDQUFDO0FBQUEsSUFDaEQ7QUFDQSxVQUFNLFlBQVksS0FBSyxJQUFJO0FBQzNCLFFBQUksV0FBVztBQUNmLFVBQU0sVUFBVSxDQUFDLFVBQWtCO0FBQ2xDLGtCQUFZO0FBQ1osY0FBUSxPQUFPLGFBQWEsRUFBRSxVQUFVLFNBQVMsQ0FBQztBQUFBLElBQ25EO0FBQ0EsUUFBSTtBQUNILFlBQU0sU0FBUyxNQUFNLEtBQUssUUFBUSxTQUFTLFNBQVMsQ0FBQyxHQUFHLFNBQVMsTUFBTSxhQUFhLE9BQU8sQ0FBQyxHQUFHO0FBQUEsUUFDOUYsS0FBSyxRQUFRO0FBQUEsUUFDYixLQUFLLFNBQVM7QUFBQSxRQUNkLE9BQU8sUUFBUTtBQUFBLFFBQ2YsVUFBVTtBQUFBLFFBQ1YsVUFBVTtBQUFBLE1BQ1gsQ0FBQztBQUNELGFBQU8sbUJBQW1CLE9BQU8sVUFBVSxPQUFPLFFBQVEsT0FBTyxVQUFVLFNBQVM7QUFBQSxJQUNyRixTQUFTLE9BQU87QUFDZixhQUFPO0FBQUEsUUFDTixRQUFRO0FBQUEsUUFDUixTQUFTO0FBQUEsUUFDVCxjQUFjLENBQUM7QUFBQSxRQUNmLE9BQU8saUJBQWlCLFFBQVEsTUFBTSxVQUFVLE9BQU8sS0FBSztBQUFBLFFBQzVELE9BQU8sRUFBRSxZQUFZLEtBQUssSUFBSSxJQUFJLFVBQVU7QUFBQSxNQUM3QztBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQ0Q7QUFFTyxNQUFNLGdCQUEyQztBQUFBLEVBS3ZELFlBQ2tCLFNBQ0EsaUJBQ0EsUUFDaEI7QUFIZ0I7QUFDQTtBQUNBO0FBUGxCLFNBQVMsS0FBSztBQUNkLFNBQVMsUUFBUTtBQUNqQixTQUFTLGVBQWU7QUFBQSxFQU1wQjtBQUFBLEVBRUosTUFBTSxvQkFBa0Q7QUFDdkQsVUFBTSxXQUFXLE1BQU0sS0FBSyxnQkFBZ0I7QUFDNUMsUUFBSSxDQUFDLFVBQVU7QUFDZCxhQUFPLEVBQUUsV0FBVyxPQUFPLGtCQUFrQixRQUFRLFFBQVEsc0JBQXNCO0FBQUEsSUFDcEY7QUFDQSxVQUFNLG1CQUFtQixxQkFBcUIsU0FBUyxHQUFHO0FBQzFELFVBQU0sYUFBYSxTQUFTO0FBQzVCLFFBQUksaUJBQWlCLFNBQVMsT0FBTyxHQUFHO0FBQ3ZDLGFBQU8sRUFBRSxXQUFXLE1BQU0sa0JBQWtCLFdBQVc7QUFBQSxJQUN4RDtBQUNBLFVBQU0sWUFBWSxNQUFNLGdCQUFnQixTQUFTLFNBQVMsQ0FBQyxXQUFXLEdBQUcsU0FBUyxHQUFHO0FBQ3JGLFdBQU8sRUFBRSxXQUFXLGtCQUFrQixZQUFZLFFBQVEsWUFBWSxTQUFZLGVBQWU7QUFBQSxFQUNsRztBQUFBLEVBRUEsTUFBTSxjQUFnQztBQUNyQyxZQUFRLE1BQU0sS0FBSyxrQkFBa0IsR0FBRztBQUFBLEVBQ3pDO0FBQUEsRUFFQSxNQUFNLElBQUksU0FBd0Q7QUFDakUsVUFBTSxXQUFXLE1BQU0sS0FBSyxnQkFBZ0I7QUFDNUMsUUFBSSxDQUFDLFVBQVU7QUFDZCxhQUFPLGtCQUFrQixLQUFLLE9BQU8sS0FBSyxJQUFJLENBQUM7QUFBQSxJQUNoRDtBQUNBLFVBQU0sWUFBWSxLQUFLLElBQUk7QUFDM0IsUUFBSSxXQUFXO0FBQ2YsVUFBTSxVQUFVLENBQUMsVUFBa0I7QUFDbEMsa0JBQVk7QUFDWixjQUFRLE9BQU8sYUFBYSxFQUFFLFVBQVUsU0FBUyxDQUFDO0FBQUEsSUFDbkQ7QUFDQSxRQUFJO0FBQ0gsWUFBTSxTQUFTLE1BQU0sS0FBSyxRQUFRLFNBQVMsU0FBUztBQUFBLFFBQ25ELEdBQUcsU0FBUztBQUFBLFFBQ1o7QUFBQSxRQUFNLGFBQWEsT0FBTztBQUFBLFFBQzFCO0FBQUEsUUFBUyxRQUFRO0FBQUEsUUFDakI7QUFBQSxRQUFxQjtBQUFBLFFBQ3JCO0FBQUEsUUFDQTtBQUFBLFFBQW1CO0FBQUEsUUFDbkI7QUFBQSxRQUFNLFFBQVEsS0FBSyxlQUFlLEtBQUs7QUFBQSxNQUN4QyxHQUFHO0FBQUEsUUFDRixLQUFLLFFBQVE7QUFBQSxRQUNiLEtBQUssU0FBUztBQUFBLFFBQ2QsT0FBTyxRQUFRO0FBQUEsUUFDZixVQUFVO0FBQUEsUUFDVixVQUFVO0FBQUEsTUFDWCxDQUFDO0FBQ0QsYUFBTyxtQkFBbUIsT0FBTyxVQUFVLE9BQU8sUUFBUSxPQUFPLFVBQVUsU0FBUztBQUFBLElBQ3JGLFNBQVMsT0FBTztBQUNmLGFBQU87QUFBQSxRQUNOLFFBQVE7QUFBQSxRQUNSLFNBQVM7QUFBQSxRQUNULGNBQWMsQ0FBQztBQUFBLFFBQ2YsT0FBTyxpQkFBaUIsUUFBUSxNQUFNLFVBQVUsT0FBTyxLQUFLO0FBQUEsUUFDNUQsT0FBTyxFQUFFLFlBQVksS0FBSyxJQUFJLElBQUksVUFBVTtBQUFBLE1BQzdDO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFDRDtBQUVBLFNBQVMsa0JBQWtCLE9BQWUsV0FBc0M7QUFDL0UsU0FBTztBQUFBLElBQ04sUUFBUTtBQUFBLElBQ1IsU0FBUztBQUFBLElBQ1QsY0FBYyxDQUFDO0FBQUEsSUFDZixPQUFPLEdBQUcsS0FBSztBQUFBLElBQ2YsT0FBTyxFQUFFLFlBQVksS0FBSyxJQUFJLElBQUksVUFBVTtBQUFBLEVBQzdDO0FBQ0Q7IiwKICAibmFtZXMiOiBbXQp9Cg==
