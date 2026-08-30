import { TerminalToolId } from "../../../../chat/common/tools/terminalToolIds.js";
import { parseCommand, parseCommandHead as _parseCommandHead, segmentHasFlag, segmentHead } from "./terminalCommandParser.js";
import { TerminalOutputCache } from "./terminalOutputCache.js";
function isTerminalInput(input) {
  if (typeof input !== "object" || input === null) {
    return false;
  }
  const terminalInput = input;
  return terminalInput.command === void 0 || typeof terminalInput.command === "string";
}
const parseCommandHead = _parseCommandHead;
function makeMatcher(opts) {
  const allowedSubs = opts.sub === "*" || opts.sub === void 0 ? void 0 : opts.sub === null ? null : typeof opts.sub === "string" ? /* @__PURE__ */ new Set([opts.sub]) : new Set(opts.sub);
  return (input) => {
    if (!isTerminalInput(input)) {
      return false;
    }
    const parsed = parseCommand(input.command);
    if (!parsed) {
      return false;
    }
    for (const seg of parsed.segments) {
      const head = segmentHead(seg);
      if (!head || head.head !== opts.head) {
        continue;
      }
      if (allowedSubs === null) {
        if (head.sub !== void 0) {
          continue;
        }
      } else if (allowedSubs !== void 0) {
        if (head.sub === void 0 || !allowedSubs.has(head.sub)) {
          continue;
        }
      }
      if (opts.flag && !opts.flag(seg)) {
        continue;
      }
      return true;
    }
    return false;
  };
}
const gitDiffFilter = {
  id: "terminal.git-diff",
  toolIds: [TerminalToolId.RunInTerminal],
  matches: (_toolId, input) => makeMatcher({ head: "git", sub: ["diff", "show"] })(input),
  apply(text) {
    const lines = text.split("\n");
    const out = [];
    const KEEP_CONTEXT = 1;
    let contextRun = 0;
    let inBinaryOrLock = false;
    let pendingHunkHeaderIndex = -1;
    let pendingHunkOldStart = 0;
    let pendingHunkNewStart = 0;
    let pendingOldLines = 0;
    let pendingNewLines = 0;
    const HUNK_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;
    const flushHunk = () => {
      if (pendingHunkHeaderIndex < 0) {
        return;
      }
      out[pendingHunkHeaderIndex] = `@@ -${pendingHunkOldStart},${pendingOldLines} +${pendingHunkNewStart},${pendingNewLines} @@`;
      pendingHunkHeaderIndex = -1;
    };
    const flushContextRun = () => {
      const omitted = contextRun - KEEP_CONTEXT;
      if (omitted > 0) {
        out.push(`... ${omitted} unchanged context line${omitted === 1 ? "" : "s"} omitted ...`);
      }
      contextRun = 0;
    };
    for (const line of lines) {
      if (line.startsWith("diff --git")) {
        flushContextRun();
        flushHunk();
        inBinaryOrLock = /package-lock\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb|\.snap$/.test(line);
        if (inBinaryOrLock) {
          out.push(line);
          out.push("... lockfile/snapshot diff omitted ...");
          continue;
        }
        out.push(line);
        continue;
      }
      if (inBinaryOrLock) {
        continue;
      }
      if (line.startsWith("index ") || line.startsWith("similarity index ") || line.startsWith("dissimilarity index ") || line.startsWith("rename from ") || line.startsWith("rename to ")) {
        continue;
      }
      const hunkMatch = HUNK_RE.exec(line);
      if (hunkMatch) {
        flushContextRun();
        flushHunk();
        pendingHunkOldStart = parseInt(hunkMatch[1], 10);
        pendingHunkNewStart = parseInt(hunkMatch[3], 10);
        pendingOldLines = 0;
        pendingNewLines = 0;
        pendingHunkHeaderIndex = out.length;
        out.push(line);
        continue;
      }
      if (line.startsWith("+++ ") || line.startsWith("--- ") || line.startsWith("Binary files ")) {
        flushContextRun();
        flushHunk();
        out.push(line);
        continue;
      }
      if (line.startsWith("+")) {
        flushContextRun();
        out.push(line);
        pendingNewLines++;
        continue;
      }
      if (line.startsWith("-")) {
        flushContextRun();
        out.push(line);
        pendingOldLines++;
        continue;
      }
      if (!line.startsWith(" ")) {
        flushContextRun();
        out.push(line);
        continue;
      }
      contextRun++;
      if (contextRun <= KEEP_CONTEXT) {
        out.push(line);
        pendingOldLines++;
        pendingNewLines++;
      }
    }
    flushContextRun();
    flushHunk();
    const result = out.join("\n");
    return { text: result, compressed: result.length < text.length };
  }
};
const gitLogFilter = {
  id: "terminal.git-log",
  toolIds: [TerminalToolId.RunInTerminal],
  matches: (_toolId, input) => makeMatcher({ head: "git", sub: ["log", "reflog", "shortlog"] })(input),
  apply(text) {
    const lines = text.split("\n");
    const out = [];
    let blankRun = 0;
    for (const line of lines) {
      if (line.trim() === "") {
        blankRun++;
        if (blankRun <= 1) {
          out.push(line);
        }
        continue;
      }
      blankRun = 0;
      out.push(line);
    }
    while (out.length > 0 && out[out.length - 1].trim() === "") {
      out.pop();
    }
    const result = out.join("\n");
    return { text: result, compressed: result.length < text.length };
  }
};
const gitStatusFilter = {
  id: "terminal.git-status",
  toolIds: [TerminalToolId.RunInTerminal],
  matches: (_toolId, input) => makeMatcher({ head: "git", sub: "status" })(input),
  apply(text) {
    const HINT_PATTERNS = [
      /^\s*\(use "git add.*"\s+to.*\)\s*$/,
      /^\s*\(use "git restore.*"\s+to.*\)\s*$/,
      /^\s*\(use "git rm --cached.*"\s+to.*\)\s*$/,
      /^\s*\(use "git push" to publish.*\)\s*$/,
      /^\s*\(commit or discard.*\)\s*$/
    ];
    const lines = text.split("\n");
    const out = [];
    for (const line of lines) {
      if (HINT_PATTERNS.some((re) => re.test(line))) {
        continue;
      }
      out.push(line);
    }
    const result = out.join("\n");
    return { text: result, compressed: result.length < text.length };
  }
};
const lsFilter = {
  id: "terminal.ls",
  toolIds: [TerminalToolId.RunInTerminal],
  matches(_toolId, input) {
    if (!isTerminalInput(input)) {
      return false;
    }
    const parsed = parseCommand(input.command);
    if (!parsed) {
      return false;
    }
    for (const seg of parsed.segments) {
      const head = segmentHead(seg);
      if (head?.head !== "ls") {
        continue;
      }
      if (segmentHasFlag(seg, ["l"])) {
        return true;
      }
    }
    return false;
  },
  apply(text) {
    const lines = text.split("\n");
    const out = [];
    const longRe = /^[-dlcbpsDLCBPS][rwx\-tTsS@+.]{9,}\s+\d+\s+\S+\s+\S+\s+\d+\s+\S+\s+\S+\s+\S+\s+(.+)$/;
    for (const line of lines) {
      if (!line.trim()) {
        continue;
      }
      if (line.startsWith("total ")) {
        continue;
      }
      const m = longRe.exec(line);
      if (m) {
        const isDir = line.startsWith("d");
        out.push(isDir ? m[1] + "/" : m[1]);
      } else {
        out.push(line);
      }
    }
    const result = out.join("\n");
    return { text: result, compressed: result.length < text.length };
  }
};
const MAX_LIST_LINES = 200;
function capLines(text, max, label) {
  const lines = text.split("\n");
  if (lines.length <= max + 1) {
    return { text, compressed: false };
  }
  const kept = lines.slice(0, max);
  const omitted = lines.length - max;
  kept.push(`... ${omitted} ${label} lines omitted ...`);
  const result = kept.join("\n");
  return { text: result, compressed: result.length < text.length };
}
const findFilter = {
  id: "terminal.find",
  toolIds: [TerminalToolId.RunInTerminal],
  matches(_toolId, input) {
    if (!isTerminalInput(input)) {
      return false;
    }
    const parsed = parseCommand(input.command);
    if (!parsed) {
      return false;
    }
    return parsed.segments.some((seg) => segmentHead(seg)?.head === "find");
  },
  apply: (text) => capLines(text, MAX_LIST_LINES, "find result")
};
const grepFilter = {
  id: "terminal.grep",
  toolIds: [TerminalToolId.RunInTerminal],
  matches(_toolId, input) {
    if (!isTerminalInput(input)) {
      return false;
    }
    const parsed = parseCommand(input.command);
    if (!parsed) {
      return false;
    }
    return parsed.segments.some((seg) => {
      const head = segmentHead(seg);
      return head !== void 0 && (head.head === "grep" || head.head === "rg" || head.head === "ack" || head.head === "ag");
    });
  },
  apply: (text) => capLines(text, MAX_LIST_LINES, "matching")
};
const treeFilter = {
  id: "terminal.tree",
  toolIds: [TerminalToolId.RunInTerminal],
  matches(_toolId, input) {
    if (!isTerminalInput(input)) {
      return false;
    }
    const parsed = parseCommand(input.command);
    if (!parsed) {
      return false;
    }
    return parsed.segments.some((seg) => segmentHead(seg)?.head === "tree");
  },
  apply: (text) => capLines(text, MAX_LIST_LINES, "tree")
};
function compressTestRunnerOutput(text) {
  const lines = text.split("\n");
  const dropPatterns = [
    /^\s*PASS\s+\S+/,
    /^\s*ok\s+\d+\s+/,
    /^\s*\u2713\s/,
    /^\s*[.sSEFx]{10,}\s*$/,
    /^test\s.+ \.\.\. ok\s*$/,
    /^running \d+ tests?$/i
  ];
  const out = [];
  for (const line of lines) {
    if (dropPatterns.some((re) => re.test(line))) {
      continue;
    }
    out.push(line);
  }
  const result = out.join("\n");
  return { text: result, compressed: result.length < text.length };
}
const testRunnerFilter = {
  id: "terminal.test-runner",
  toolIds: [TerminalToolId.RunInTerminal],
  matches(_toolId, input) {
    if (!isTerminalInput(input)) {
      return false;
    }
    const parsed = parseCommand(input.command);
    if (!parsed) {
      return false;
    }
    for (const seg of parsed.segments) {
      const head = segmentHead(seg);
      if (!head) {
        continue;
      }
      if (head.head === "pytest" || head.head === "jest" || head.head === "vitest" || head.head === "playwright" || head.head === "mocha") {
        return true;
      }
      if (head.head === "cargo" && head.sub && /^(test|nextest)$/.test(head.sub)) {
        return true;
      }
      if (head.head === "go" && head.sub === "test") {
        return true;
      }
      if ((head.head === "npm" || head.head === "pnpm" || head.head === "yarn") && head.sub === "test") {
        return true;
      }
      if (head.head === "npx" && head.sub && /^(jest|vitest|playwright|mocha)$/.test(head.sub)) {
        return true;
      }
    }
    return false;
  },
  apply: (text) => compressTestRunnerOutput(text)
};
function compressBuildOutput(text) {
  const dropPatterns = [
    /^\s*Compiling\s+\S+\s+v\S+/,
    /^\s*Downloading\s+\S+/,
    /^\s*Downloaded\s+\S+/,
    /^\s*Updating\s+crates\.io\s+index/,
    /^\s*Finished\s+(dev|release|test)/,
    /^make\[\d+\]: (Entering|Leaving) directory/,
    /^Download(ed|ing) https?:/,
    /^\[INFO\] Downloading from /,
    /^\[INFO\] Downloaded from /,
    /^> Task :/
  ];
  const lines = text.split("\n");
  const out = [];
  for (const line of lines) {
    if (dropPatterns.some((re) => re.test(line))) {
      continue;
    }
    out.push(line);
  }
  const result = out.join("\n");
  return { text: result, compressed: result.length < text.length };
}
const buildToolFilter = {
  id: "terminal.build-tool",
  toolIds: [TerminalToolId.RunInTerminal],
  matches(_toolId, input) {
    if (!isTerminalInput(input)) {
      return false;
    }
    const parsed = parseCommand(input.command);
    if (!parsed) {
      return false;
    }
    for (const seg of parsed.segments) {
      const head = segmentHead(seg);
      if (!head) {
        continue;
      }
      if (head.head === "cargo" && head.sub && /^(build|check|clippy)$/.test(head.sub)) {
        return true;
      }
      if (head.head === "go" && (head.sub === "build" || head.sub === "vet")) {
        return true;
      }
      if (head.head === "make" || head.head === "tsc" || head.head === "gradle" || head.head === "mvn") {
        return true;
      }
      if (head.head === "dotnet" && head.sub === "build") {
        return true;
      }
    }
    return false;
  },
  apply: (text) => compressBuildOutput(text)
};
function compressLinterOutput(text) {
  const lines = text.split("\n");
  const dropPatterns = [
    /^\s*Success: no issues found\s*$/i,
    /^\s*All checks passed\.?\s*$/i,
    /^\s*Success:\s*0 errors/i
  ];
  const out = [];
  for (const line of lines) {
    if (dropPatterns.some((re) => re.test(line))) {
      continue;
    }
    out.push(line);
  }
  const result = out.join("\n");
  return { text: result, compressed: result.length < text.length };
}
const linterFilter = {
  id: "terminal.linter",
  toolIds: [TerminalToolId.RunInTerminal],
  matches(_toolId, input) {
    if (!isTerminalInput(input)) {
      return false;
    }
    const parsed = parseCommand(input.command);
    if (!parsed) {
      return false;
    }
    for (const seg of parsed.segments) {
      const head = segmentHead(seg);
      if (!head) {
        continue;
      }
      if (head.head === "eslint" || head.head === "ruff" || head.head === "mypy" || head.head === "prettier" || head.head === "rubocop" || head.head === "golangci-lint") {
        return true;
      }
      if (head.head === "cargo" && head.sub === "clippy") {
        return true;
      }
      if (head.head === "npx" && head.sub && /^(eslint|prettier|tsc)$/.test(head.sub)) {
        return true;
      }
    }
    return false;
  },
  apply: (text) => compressLinterOutput(text)
};
const npmInstallFilter = {
  id: "terminal.npm-install",
  toolIds: [TerminalToolId.RunInTerminal],
  matches(_toolId, input) {
    if (!isTerminalInput(input)) {
      return false;
    }
    const parsed = parseCommand(input.command);
    if (!parsed) {
      return false;
    }
    for (const seg of parsed.segments) {
      const head = segmentHead(seg);
      if (!head) {
        continue;
      }
      if (head.head === "npm" && head.sub && /^(install|i|ci|add)$/.test(head.sub)) {
        return true;
      }
      if (head.head === "yarn" || head.head === "pnpm") {
        if (head.sub === "install" || head.sub === "add" || head.sub === "i") {
          return true;
        }
        if (head.sub === void 0) {
          return true;
        }
      }
    }
    return false;
  },
  apply(text) {
    const lines = text.split("\n");
    const dropPatterns = [
      /^npm warn deprecated /i,
      /^\s*\[#+>?\s*\] /,
      /^npm http /i,
      /^npm timing /i,
      /^npm sill /i,
      /^npm verb /i,
      /^\s*\d+ packages? are looking for funding/i,
      /run `npm fund`/i,
      /^Run `npm audit/i
    ];
    const out = [];
    for (const line of lines) {
      if (dropPatterns.some((re) => re.test(line))) {
        continue;
      }
      out.push(line);
    }
    const result = out.join("\n");
    return { text: result, compressed: result.length < text.length };
  }
};
const envFilter = {
  id: "terminal.env",
  toolIds: [TerminalToolId.RunInTerminal],
  matches(_toolId, input) {
    if (!isTerminalInput(input)) {
      return false;
    }
    const parsed = parseCommand(input.command);
    if (!parsed) {
      return false;
    }
    for (const seg of parsed.segments) {
      const head = segmentHead(seg);
      if (head?.head === "printenv") {
        return true;
      }
      if (head === void 0 && seg.wrappers.length > 0 && seg.wrappers[seg.wrappers.length - 1] === "env" && seg.tokens.length === 0) {
        return true;
      }
    }
    return false;
  },
  apply(text) {
    const lines = text.split("\n").filter((l) => l.trim() !== "");
    const unique = Array.from(new Set(lines)).sort();
    const result = unique.join("\n");
    return { text: result, compressed: result.length < text.length };
  }
};
function registerTerminalCompressors(compressor) {
  compressor.registerFilter(gitDiffFilter);
  compressor.registerFilter(gitLogFilter);
  compressor.registerFilter(gitStatusFilter);
  compressor.registerFilter(lsFilter);
  compressor.registerFilter(findFilter);
  compressor.registerFilter(grepFilter);
  compressor.registerFilter(treeFilter);
  compressor.registerFilter(testRunnerFilter);
  compressor.registerFilter(buildToolFilter);
  compressor.registerFilter(linterFilter);
  compressor.registerFilter(npmInstallFilter);
  compressor.registerFilter(envFilter);
  compressor.registerCache(new TerminalOutputCache());
}
export {
  buildToolFilter,
  envFilter,
  findFilter,
  gitDiffFilter,
  gitLogFilter,
  gitStatusFilter,
  grepFilter,
  linterFilter,
  lsFilter,
  npmInstallFilter,
  parseCommandHead,
  registerTerminalCompressors,
  testRunnerFilter,
  treeFilter
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsQ29udHJpYlxcY2hhdEFnZW50VG9vbHNcXGJyb3dzZXJcXHRvb2xzXFx0ZXJtaW5hbE91dHB1dENvbXByZXNzb3IudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBUZXJtaW5hbFRvb2xJZCB9IGZyb20gJy4uLy4uLy4uLy4uL2NoYXQvY29tbW9uL3Rvb2xzL3Rlcm1pbmFsVG9vbElkcy5qcyc7XG5pbXBvcnQgeyBJVG9vbFJlc3VsdENvbXByZXNzb3IsIElUb29sUmVzdWx0RmlsdGVyLCBJVG9vbFJlc3VsdEZpbHRlck91dHB1dCB9IGZyb20gJy4uLy4uLy4uLy4uL2NoYXQvY29tbW9uL3Rvb2xzL3Rvb2xSZXN1bHRDb21wcmVzc29yLmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VnbWVudCwgcGFyc2VDb21tYW5kLCBwYXJzZUNvbW1hbmRIZWFkIGFzIF9wYXJzZUNvbW1hbmRIZWFkLCBzZWdtZW50SGFzRmxhZywgc2VnbWVudEhlYWQgfSBmcm9tICcuL3Rlcm1pbmFsQ29tbWFuZFBhcnNlci5qcyc7XG5pbXBvcnQgeyBUZXJtaW5hbE91dHB1dENhY2hlIH0gZnJvbSAnLi90ZXJtaW5hbE91dHB1dENhY2hlLmpzJztcblxuLyoqXG4gKiBJbnB1dCBzaGFwZSB1c2VkIGJ5IHRoZSBjb3JlIGBydW5faW5fdGVybWluYWxgIHRvb2wuIFdlIG9ubHkgZGVwZW5kIG9uIHRoZVxuICogYGNvbW1hbmRgIGZpZWxkOyBldmVyeXRoaW5nIGVsc2UgaXMgaWdub3JlZC5cbiAqL1xuaW50ZXJmYWNlIElUZXJtaW5hbElucHV0IHtcblx0Y29tbWFuZD86IHN0cmluZztcbn1cblxuZnVuY3Rpb24gaXNUZXJtaW5hbElucHV0KGlucHV0OiB1bmtub3duKTogaW5wdXQgaXMgSVRlcm1pbmFsSW5wdXQge1xuXHRpZiAodHlwZW9mIGlucHV0ICE9PSAnb2JqZWN0JyB8fCBpbnB1dCA9PT0gbnVsbCkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRjb25zdCB0ZXJtaW5hbElucHV0ID0gaW5wdXQgYXMgeyBjb21tYW5kPzogdW5rbm93biB9O1xuXHRyZXR1cm4gdGVybWluYWxJbnB1dC5jb21tYW5kID09PSB1bmRlZmluZWQgfHwgdHlwZW9mIHRlcm1pbmFsSW5wdXQuY29tbWFuZCA9PT0gJ3N0cmluZyc7XG59XG5cbi8qKiBCYWNrd2FyZHMtY29tcGF0aWJsZSByZS1leHBvcnQgc28gZXhpc3RpbmcgdGVzdHMvY29uc3VtZXJzIGtlZXAgd29ya2luZy4gKi9cbmV4cG9ydCBjb25zdCBwYXJzZUNvbW1hbmRIZWFkID0gX3BhcnNlQ29tbWFuZEhlYWQ7XG5cbi8qKlxuICogQnVpbGQgYSBmaWx0ZXIgbWF0Y2hlciB0aGF0IGZpcmVzIHdoZW4gYW55IHNlZ21lbnQgb2YgdGhlIGNvbW1hbmQgbGluZVxuICogaGFzIHRoZSBnaXZlbiBgKGhlYWQsIHN1YilgIHNoYXBlLCBvcHRpb25hbGx5IHJlc3RyaWN0ZWQgYnkgYSBmbGFnXG4gKiBwcmVkaWNhdGUuIGBzdWIgPT09ICcqJ2AgbWF0Y2hlcyBhbnkgc3ViY29tbWFuZDsgYHN1YiA9PT0gbnVsbGAgbWF0Y2hlc1xuICogY29tbWFuZHMgd2l0aCBubyBzdWJjb21tYW5kLlxuICovXG5mdW5jdGlvbiBtYWtlTWF0Y2hlcihvcHRzOiB7XG5cdGhlYWQ6IHN0cmluZztcblx0c3ViPzogc3RyaW5nIHwgcmVhZG9ubHkgc3RyaW5nW10gfCAnKicgfCBudWxsO1xuXHRmbGFnPzogKHNlZzogSUNvbW1hbmRTZWdtZW50KSA9PiBib29sZWFuO1xufSkge1xuXHRjb25zdCBhbGxvd2VkU3VicyA9IG9wdHMuc3ViID09PSAnKicgfHwgb3B0cy5zdWIgPT09IHVuZGVmaW5lZCA/IHVuZGVmaW5lZFxuXHRcdDogb3B0cy5zdWIgPT09IG51bGwgPyBudWxsXG5cdFx0XHQ6IHR5cGVvZiBvcHRzLnN1YiA9PT0gJ3N0cmluZycgPyBuZXcgU2V0KFtvcHRzLnN1Yl0pXG5cdFx0XHRcdDogbmV3IFNldChvcHRzLnN1Yik7XG5cdHJldHVybiAoaW5wdXQ6IHVua25vd24pOiBib29sZWFuID0+IHtcblx0XHRpZiAoIWlzVGVybWluYWxJbnB1dChpbnB1dCkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Y29uc3QgcGFyc2VkID0gcGFyc2VDb21tYW5kKGlucHV0LmNvbW1hbmQpO1xuXHRcdGlmICghcGFyc2VkKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGZvciAoY29uc3Qgc2VnIG9mIHBhcnNlZC5zZWdtZW50cykge1xuXHRcdFx0Y29uc3QgaGVhZCA9IHNlZ21lbnRIZWFkKHNlZyk7XG5cdFx0XHRpZiAoIWhlYWQgfHwgaGVhZC5oZWFkICE9PSBvcHRzLmhlYWQpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAoYWxsb3dlZFN1YnMgPT09IG51bGwpIHtcblx0XHRcdFx0aWYgKGhlYWQuc3ViICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIGlmIChhbGxvd2VkU3VicyAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdGlmIChoZWFkLnN1YiA9PT0gdW5kZWZpbmVkIHx8ICFhbGxvd2VkU3Vicy5oYXMoaGVhZC5zdWIpKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGlmIChvcHRzLmZsYWcgJiYgIW9wdHMuZmxhZyhzZWcpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fTtcbn1cblxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4vLyBWQ1Ncbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG4vKipcbiAqIENvbXByZXNzZXMgYGdpdCBkaWZmYCAvIGBnaXQgc2hvd2Agb3V0cHV0IGJ5IHJlZHVjaW5nIGNvbnRleHQgbGluZXMgdG8gYVxuICogdGlnaHRlciB3aW5kb3cgYW5kIGRyb3BwaW5nIHRoZSBodWdlIG5vLW9wIGNodW5rcyB0aGF0IGRpZmZzIG9mIGdlbmVyYXRlZFxuICogZmlsZXMgKGxvY2tmaWxlcywgc25hcHNob3RzKSBwcm9kdWNlLlxuICpcbiAqIE5vdGFibHkgdGhpcyBkb2VzICoqbm90KiogbWF0Y2ggYGdpdCBkaWZmdG9vbGAsIHdoaWNoIHByaW50cyBhIGRpZmZlcmVudFxuICogZm9ybWF0IGFuZCB3b3VsZCBiZSBjb3JydXB0ZWQgYnkgaHVuay1oZWFkZXIgcmV3cml0aW5nLlxuICovXG5leHBvcnQgY29uc3QgZ2l0RGlmZkZpbHRlcjogSVRvb2xSZXN1bHRGaWx0ZXIgPSB7XG5cdGlkOiAndGVybWluYWwuZ2l0LWRpZmYnLFxuXHR0b29sSWRzOiBbVGVybWluYWxUb29sSWQuUnVuSW5UZXJtaW5hbF0sXG5cdG1hdGNoZXM6IChfdG9vbElkLCBpbnB1dCkgPT4gbWFrZU1hdGNoZXIoeyBoZWFkOiAnZ2l0Jywgc3ViOiBbJ2RpZmYnLCAnc2hvdyddIH0pKGlucHV0KSxcblx0YXBwbHkodGV4dCk6IElUb29sUmVzdWx0RmlsdGVyT3V0cHV0IHtcblx0XHRjb25zdCBsaW5lcyA9IHRleHQuc3BsaXQoJ1xcbicpO1xuXHRcdGNvbnN0IG91dDogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCBLRUVQX0NPTlRFWFQgPSAxO1xuXHRcdGxldCBjb250ZXh0UnVuID0gMDtcblx0XHRsZXQgaW5CaW5hcnlPckxvY2sgPSBmYWxzZTtcblxuXHRcdGxldCBwZW5kaW5nSHVua0hlYWRlckluZGV4ID0gLTE7XG5cdFx0bGV0IHBlbmRpbmdIdW5rT2xkU3RhcnQgPSAwO1xuXHRcdGxldCBwZW5kaW5nSHVua05ld1N0YXJ0ID0gMDtcblx0XHRsZXQgcGVuZGluZ09sZExpbmVzID0gMDtcblx0XHRsZXQgcGVuZGluZ05ld0xpbmVzID0gMDtcblxuXHRcdGNvbnN0IEhVTktfUkUgPSAvXkBAIC0oXFxkKykoPzosKFxcZCspKT8gXFwrKFxcZCspKD86LChcXGQrKSk/IEBALztcblxuXHRcdGNvbnN0IGZsdXNoSHVuayA9ICgpID0+IHtcblx0XHRcdGlmIChwZW5kaW5nSHVua0hlYWRlckluZGV4IDwgMCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRvdXRbcGVuZGluZ0h1bmtIZWFkZXJJbmRleF0gPSBgQEAgLSR7cGVuZGluZ0h1bmtPbGRTdGFydH0sJHtwZW5kaW5nT2xkTGluZXN9ICske3BlbmRpbmdIdW5rTmV3U3RhcnR9LCR7cGVuZGluZ05ld0xpbmVzfSBAQGA7XG5cdFx0XHRwZW5kaW5nSHVua0hlYWRlckluZGV4ID0gLTE7XG5cdFx0fTtcblxuXHRcdGNvbnN0IGZsdXNoQ29udGV4dFJ1biA9ICgpID0+IHtcblx0XHRcdGNvbnN0IG9taXR0ZWQgPSBjb250ZXh0UnVuIC0gS0VFUF9DT05URVhUO1xuXHRcdFx0aWYgKG9taXR0ZWQgPiAwKSB7XG5cdFx0XHRcdG91dC5wdXNoKGAuLi4gJHtvbWl0dGVkfSB1bmNoYW5nZWQgY29udGV4dCBsaW5lJHtvbWl0dGVkID09PSAxID8gJycgOiAncyd9IG9taXR0ZWQgLi4uYCk7XG5cdFx0XHR9XG5cdFx0XHRjb250ZXh0UnVuID0gMDtcblx0XHR9O1xuXG5cdFx0Zm9yIChjb25zdCBsaW5lIG9mIGxpbmVzKSB7XG5cdFx0XHRpZiAobGluZS5zdGFydHNXaXRoKCdkaWZmIC0tZ2l0JykpIHtcblx0XHRcdFx0Zmx1c2hDb250ZXh0UnVuKCk7XG5cdFx0XHRcdGZsdXNoSHVuaygpO1xuXHRcdFx0XHRpbkJpbmFyeU9yTG9jayA9IC9wYWNrYWdlLWxvY2tcXC5qc29ufHlhcm5cXC5sb2NrfHBucG0tbG9ja1xcLnlhbWx8YnVuXFwubG9ja2J8XFwuc25hcCQvLnRlc3QobGluZSk7XG5cdFx0XHRcdGlmIChpbkJpbmFyeU9yTG9jaykge1xuXHRcdFx0XHRcdG91dC5wdXNoKGxpbmUpO1xuXHRcdFx0XHRcdG91dC5wdXNoKCcuLi4gbG9ja2ZpbGUvc25hcHNob3QgZGlmZiBvbWl0dGVkIC4uLicpO1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdG91dC5wdXNoKGxpbmUpO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGlmIChpbkJpbmFyeU9yTG9jaykge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGlmIChsaW5lLnN0YXJ0c1dpdGgoJ2luZGV4ICcpIHx8IGxpbmUuc3RhcnRzV2l0aCgnc2ltaWxhcml0eSBpbmRleCAnKSB8fFxuXHRcdFx0XHRsaW5lLnN0YXJ0c1dpdGgoJ2Rpc3NpbWlsYXJpdHkgaW5kZXggJykgfHwgbGluZS5zdGFydHNXaXRoKCdyZW5hbWUgZnJvbSAnKSB8fFxuXHRcdFx0XHRsaW5lLnN0YXJ0c1dpdGgoJ3JlbmFtZSB0byAnKSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGh1bmtNYXRjaCA9IEhVTktfUkUuZXhlYyhsaW5lKTtcblx0XHRcdGlmIChodW5rTWF0Y2gpIHtcblx0XHRcdFx0Zmx1c2hDb250ZXh0UnVuKCk7XG5cdFx0XHRcdGZsdXNoSHVuaygpO1xuXHRcdFx0XHRwZW5kaW5nSHVua09sZFN0YXJ0ID0gcGFyc2VJbnQoaHVua01hdGNoWzFdLCAxMCk7XG5cdFx0XHRcdHBlbmRpbmdIdW5rTmV3U3RhcnQgPSBwYXJzZUludChodW5rTWF0Y2hbM10sIDEwKTtcblx0XHRcdFx0cGVuZGluZ09sZExpbmVzID0gMDtcblx0XHRcdFx0cGVuZGluZ05ld0xpbmVzID0gMDtcblx0XHRcdFx0cGVuZGluZ0h1bmtIZWFkZXJJbmRleCA9IG91dC5sZW5ndGg7XG5cdFx0XHRcdG91dC5wdXNoKGxpbmUpO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGlmIChsaW5lLnN0YXJ0c1dpdGgoJysrKyAnKSB8fCBsaW5lLnN0YXJ0c1dpdGgoJy0tLSAnKSB8fCBsaW5lLnN0YXJ0c1dpdGgoJ0JpbmFyeSBmaWxlcyAnKSkge1xuXHRcdFx0XHRmbHVzaENvbnRleHRSdW4oKTtcblx0XHRcdFx0Zmx1c2hIdW5rKCk7XG5cdFx0XHRcdG91dC5wdXNoKGxpbmUpO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGlmIChsaW5lLnN0YXJ0c1dpdGgoJysnKSkge1xuXHRcdFx0XHRmbHVzaENvbnRleHRSdW4oKTtcblx0XHRcdFx0b3V0LnB1c2gobGluZSk7XG5cdFx0XHRcdHBlbmRpbmdOZXdMaW5lcysrO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGlmIChsaW5lLnN0YXJ0c1dpdGgoJy0nKSkge1xuXHRcdFx0XHRmbHVzaENvbnRleHRSdW4oKTtcblx0XHRcdFx0b3V0LnB1c2gobGluZSk7XG5cdFx0XHRcdHBlbmRpbmdPbGRMaW5lcysrO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGlmICghbGluZS5zdGFydHNXaXRoKCcgJykpIHtcblx0XHRcdFx0Zmx1c2hDb250ZXh0UnVuKCk7XG5cdFx0XHRcdG91dC5wdXNoKGxpbmUpO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnRleHRSdW4rKztcblx0XHRcdGlmIChjb250ZXh0UnVuIDw9IEtFRVBfQ09OVEVYVCkge1xuXHRcdFx0XHRvdXQucHVzaChsaW5lKTtcblx0XHRcdFx0cGVuZGluZ09sZExpbmVzKys7XG5cdFx0XHRcdHBlbmRpbmdOZXdMaW5lcysrO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRmbHVzaENvbnRleHRSdW4oKTtcblx0XHRmbHVzaEh1bmsoKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IG91dC5qb2luKCdcXG4nKTtcblx0XHRyZXR1cm4geyB0ZXh0OiByZXN1bHQsIGNvbXByZXNzZWQ6IHJlc3VsdC5sZW5ndGggPCB0ZXh0Lmxlbmd0aCB9O1xuXHR9LFxufTtcblxuLyoqIFRyaW0gYGdpdCBsb2dgIG91dHB1dDogY29sbGFwc2UgbXVsdGlwbGUgYmxhbmstbGluZSBydW5zLiAqL1xuZXhwb3J0IGNvbnN0IGdpdExvZ0ZpbHRlcjogSVRvb2xSZXN1bHRGaWx0ZXIgPSB7XG5cdGlkOiAndGVybWluYWwuZ2l0LWxvZycsXG5cdHRvb2xJZHM6IFtUZXJtaW5hbFRvb2xJZC5SdW5JblRlcm1pbmFsXSxcblx0bWF0Y2hlczogKF90b29sSWQsIGlucHV0KSA9PiBtYWtlTWF0Y2hlcih7IGhlYWQ6ICdnaXQnLCBzdWI6IFsnbG9nJywgJ3JlZmxvZycsICdzaG9ydGxvZyddIH0pKGlucHV0KSxcblx0YXBwbHkodGV4dCk6IElUb29sUmVzdWx0RmlsdGVyT3V0cHV0IHtcblx0XHRjb25zdCBsaW5lcyA9IHRleHQuc3BsaXQoJ1xcbicpO1xuXHRcdGNvbnN0IG91dDogc3RyaW5nW10gPSBbXTtcblx0XHRsZXQgYmxhbmtSdW4gPSAwO1xuXHRcdGZvciAoY29uc3QgbGluZSBvZiBsaW5lcykge1xuXHRcdFx0aWYgKGxpbmUudHJpbSgpID09PSAnJykge1xuXHRcdFx0XHRibGFua1J1bisrO1xuXHRcdFx0XHRpZiAoYmxhbmtSdW4gPD0gMSkge1xuXHRcdFx0XHRcdG91dC5wdXNoKGxpbmUpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0YmxhbmtSdW4gPSAwO1xuXHRcdFx0b3V0LnB1c2gobGluZSk7XG5cdFx0fVxuXHRcdHdoaWxlIChvdXQubGVuZ3RoID4gMCAmJiBvdXRbb3V0Lmxlbmd0aCAtIDFdLnRyaW0oKSA9PT0gJycpIHtcblx0XHRcdG91dC5wb3AoKTtcblx0XHR9XG5cdFx0Y29uc3QgcmVzdWx0ID0gb3V0LmpvaW4oJ1xcbicpO1xuXHRcdHJldHVybiB7IHRleHQ6IHJlc3VsdCwgY29tcHJlc3NlZDogcmVzdWx0Lmxlbmd0aCA8IHRleHQubGVuZ3RoIH07XG5cdH0sXG59O1xuXG4vKiogRHJvcCB0aGUgbG9uZyBcIih1c2UgLi4uIClcIiBoaW50IGJsb2NrcyBpbiBgZ2l0IHN0YXR1c2AuICovXG5leHBvcnQgY29uc3QgZ2l0U3RhdHVzRmlsdGVyOiBJVG9vbFJlc3VsdEZpbHRlciA9IHtcblx0aWQ6ICd0ZXJtaW5hbC5naXQtc3RhdHVzJyxcblx0dG9vbElkczogW1Rlcm1pbmFsVG9vbElkLlJ1bkluVGVybWluYWxdLFxuXHRtYXRjaGVzOiAoX3Rvb2xJZCwgaW5wdXQpID0+IG1ha2VNYXRjaGVyKHsgaGVhZDogJ2dpdCcsIHN1YjogJ3N0YXR1cycgfSkoaW5wdXQpLFxuXHRhcHBseSh0ZXh0KTogSVRvb2xSZXN1bHRGaWx0ZXJPdXRwdXQge1xuXHRcdGNvbnN0IEhJTlRfUEFUVEVSTlMgPSBbXG5cdFx0XHQvXlxccypcXCh1c2UgXCJnaXQgYWRkLipcIlxccyt0by4qXFwpXFxzKiQvLFxuXHRcdFx0L15cXHMqXFwodXNlIFwiZ2l0IHJlc3RvcmUuKlwiXFxzK3RvLipcXClcXHMqJC8sXG5cdFx0XHQvXlxccypcXCh1c2UgXCJnaXQgcm0gLS1jYWNoZWQuKlwiXFxzK3RvLipcXClcXHMqJC8sXG5cdFx0XHQvXlxccypcXCh1c2UgXCJnaXQgcHVzaFwiIHRvIHB1Ymxpc2guKlxcKVxccyokLyxcblx0XHRcdC9eXFxzKlxcKGNvbW1pdCBvciBkaXNjYXJkLipcXClcXHMqJC8sXG5cdFx0XTtcblx0XHRjb25zdCBsaW5lcyA9IHRleHQuc3BsaXQoJ1xcbicpO1xuXHRcdGNvbnN0IG91dDogc3RyaW5nW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGxpbmUgb2YgbGluZXMpIHtcblx0XHRcdGlmIChISU5UX1BBVFRFUk5TLnNvbWUocmUgPT4gcmUudGVzdChsaW5lKSkpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRvdXQucHVzaChsaW5lKTtcblx0XHR9XG5cdFx0Y29uc3QgcmVzdWx0ID0gb3V0LmpvaW4oJ1xcbicpO1xuXHRcdHJldHVybiB7IHRleHQ6IHJlc3VsdCwgY29tcHJlc3NlZDogcmVzdWx0Lmxlbmd0aCA8IHRleHQubGVuZ3RoIH07XG5cdH0sXG59O1xuXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbi8vIEZpbGUgb3BzXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuLyoqXG4gKiBDb21wcmVzc2VzIGBscyAtbGAgLyBgbHMgLWxhYCBvdXRwdXQgYnkgZHJvcHBpbmcgcGVybWlzc2lvbi9vd25lci9zaXplXG4gKiBjb2x1bW5zIGFuZCBrZWVwaW5nIG9ubHkgdGhlIGVudHJ5IG5hbWUuIFBsYWluIGBsc2AgaXMgYWxyZWFkeSB0ZXJzZSBhbmRcbiAqIHBhc3NlcyB0aHJvdWdoLlxuICovXG5leHBvcnQgY29uc3QgbHNGaWx0ZXI6IElUb29sUmVzdWx0RmlsdGVyID0ge1xuXHRpZDogJ3Rlcm1pbmFsLmxzJyxcblx0dG9vbElkczogW1Rlcm1pbmFsVG9vbElkLlJ1bkluVGVybWluYWxdLFxuXHRtYXRjaGVzKF90b29sSWQsIGlucHV0KSB7XG5cdFx0aWYgKCFpc1Rlcm1pbmFsSW5wdXQoaW5wdXQpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGNvbnN0IHBhcnNlZCA9IHBhcnNlQ29tbWFuZChpbnB1dC5jb21tYW5kKTtcblx0XHRpZiAoIXBhcnNlZCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRmb3IgKGNvbnN0IHNlZyBvZiBwYXJzZWQuc2VnbWVudHMpIHtcblx0XHRcdGNvbnN0IGhlYWQgPSBzZWdtZW50SGVhZChzZWcpO1xuXHRcdFx0aWYgKGhlYWQ/LmhlYWQgIT09ICdscycpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAoc2VnbWVudEhhc0ZsYWcoc2VnLCBbJ2wnXSkpIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fSxcblx0YXBwbHkodGV4dCk6IElUb29sUmVzdWx0RmlsdGVyT3V0cHV0IHtcblx0XHRjb25zdCBsaW5lcyA9IHRleHQuc3BsaXQoJ1xcbicpO1xuXHRcdGNvbnN0IG91dDogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCBsb25nUmUgPSAvXlstZGxjYnBzRExDQlBTXVtyd3hcXC10VHNTQCsuXXs5LH1cXHMrXFxkK1xccytcXFMrXFxzK1xcUytcXHMrXFxkK1xccytcXFMrXFxzK1xcUytcXHMrXFxTK1xccysoLispJC87XG5cdFx0Zm9yIChjb25zdCBsaW5lIG9mIGxpbmVzKSB7XG5cdFx0XHRpZiAoIWxpbmUudHJpbSgpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGxpbmUuc3RhcnRzV2l0aCgndG90YWwgJykpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBtID0gbG9uZ1JlLmV4ZWMobGluZSk7XG5cdFx0XHRpZiAobSkge1xuXHRcdFx0XHRjb25zdCBpc0RpciA9IGxpbmUuc3RhcnRzV2l0aCgnZCcpO1xuXHRcdFx0XHRvdXQucHVzaChpc0RpciA/IG1bMV0gKyAnLycgOiBtWzFdKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdG91dC5wdXNoKGxpbmUpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRjb25zdCByZXN1bHQgPSBvdXQuam9pbignXFxuJyk7XG5cdFx0cmV0dXJuIHsgdGV4dDogcmVzdWx0LCBjb21wcmVzc2VkOiByZXN1bHQubGVuZ3RoIDwgdGV4dC5sZW5ndGggfTtcblx0fSxcbn07XG5cbmNvbnN0IE1BWF9MSVNUX0xJTkVTID0gMjAwO1xuXG5mdW5jdGlvbiBjYXBMaW5lcyh0ZXh0OiBzdHJpbmcsIG1heDogbnVtYmVyLCBsYWJlbDogc3RyaW5nKTogSVRvb2xSZXN1bHRGaWx0ZXJPdXRwdXQge1xuXHRjb25zdCBsaW5lcyA9IHRleHQuc3BsaXQoJ1xcbicpO1xuXHRpZiAobGluZXMubGVuZ3RoIDw9IG1heCArIDEpIHtcblx0XHRyZXR1cm4geyB0ZXh0LCBjb21wcmVzc2VkOiBmYWxzZSB9O1xuXHR9XG5cdGNvbnN0IGtlcHQgPSBsaW5lcy5zbGljZSgwLCBtYXgpO1xuXHRjb25zdCBvbWl0dGVkID0gbGluZXMubGVuZ3RoIC0gbWF4O1xuXHRrZXB0LnB1c2goYC4uLiAke29taXR0ZWR9ICR7bGFiZWx9IGxpbmVzIG9taXR0ZWQgLi4uYCk7XG5cdGNvbnN0IHJlc3VsdCA9IGtlcHQuam9pbignXFxuJyk7XG5cdHJldHVybiB7IHRleHQ6IHJlc3VsdCwgY29tcHJlc3NlZDogcmVzdWx0Lmxlbmd0aCA8IHRleHQubGVuZ3RoIH07XG59XG5cbmV4cG9ydCBjb25zdCBmaW5kRmlsdGVyOiBJVG9vbFJlc3VsdEZpbHRlciA9IHtcblx0aWQ6ICd0ZXJtaW5hbC5maW5kJyxcblx0dG9vbElkczogW1Rlcm1pbmFsVG9vbElkLlJ1bkluVGVybWluYWxdLFxuXHRtYXRjaGVzKF90b29sSWQsIGlucHV0KSB7XG5cdFx0aWYgKCFpc1Rlcm1pbmFsSW5wdXQoaW5wdXQpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGNvbnN0IHBhcnNlZCA9IHBhcnNlQ29tbWFuZChpbnB1dC5jb21tYW5kKTtcblx0XHRpZiAoIXBhcnNlZCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRyZXR1cm4gcGFyc2VkLnNlZ21lbnRzLnNvbWUoc2VnID0+IHNlZ21lbnRIZWFkKHNlZyk/LmhlYWQgPT09ICdmaW5kJyk7XG5cdH0sXG5cdGFwcGx5OiAodGV4dCkgPT4gY2FwTGluZXModGV4dCwgTUFYX0xJU1RfTElORVMsICdmaW5kIHJlc3VsdCcpLFxufTtcblxuZXhwb3J0IGNvbnN0IGdyZXBGaWx0ZXI6IElUb29sUmVzdWx0RmlsdGVyID0ge1xuXHRpZDogJ3Rlcm1pbmFsLmdyZXAnLFxuXHR0b29sSWRzOiBbVGVybWluYWxUb29sSWQuUnVuSW5UZXJtaW5hbF0sXG5cdG1hdGNoZXMoX3Rvb2xJZCwgaW5wdXQpIHtcblx0XHRpZiAoIWlzVGVybWluYWxJbnB1dChpbnB1dCkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Y29uc3QgcGFyc2VkID0gcGFyc2VDb21tYW5kKGlucHV0LmNvbW1hbmQpO1xuXHRcdGlmICghcGFyc2VkKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHJldHVybiBwYXJzZWQuc2VnbWVudHMuc29tZShzZWcgPT4ge1xuXHRcdFx0Y29uc3QgaGVhZCA9IHNlZ21lbnRIZWFkKHNlZyk7XG5cdFx0XHRyZXR1cm4gaGVhZCAhPT0gdW5kZWZpbmVkICYmIChoZWFkLmhlYWQgPT09ICdncmVwJyB8fCBoZWFkLmhlYWQgPT09ICdyZycgfHwgaGVhZC5oZWFkID09PSAnYWNrJyB8fCBoZWFkLmhlYWQgPT09ICdhZycpO1xuXHRcdH0pO1xuXHR9LFxuXHRhcHBseTogKHRleHQpID0+IGNhcExpbmVzKHRleHQsIE1BWF9MSVNUX0xJTkVTLCAnbWF0Y2hpbmcnKSxcbn07XG5cbmV4cG9ydCBjb25zdCB0cmVlRmlsdGVyOiBJVG9vbFJlc3VsdEZpbHRlciA9IHtcblx0aWQ6ICd0ZXJtaW5hbC50cmVlJyxcblx0dG9vbElkczogW1Rlcm1pbmFsVG9vbElkLlJ1bkluVGVybWluYWxdLFxuXHRtYXRjaGVzKF90b29sSWQsIGlucHV0KSB7XG5cdFx0aWYgKCFpc1Rlcm1pbmFsSW5wdXQoaW5wdXQpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGNvbnN0IHBhcnNlZCA9IHBhcnNlQ29tbWFuZChpbnB1dC5jb21tYW5kKTtcblx0XHRpZiAoIXBhcnNlZCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRyZXR1cm4gcGFyc2VkLnNlZ21lbnRzLnNvbWUoc2VnID0+IHNlZ21lbnRIZWFkKHNlZyk/LmhlYWQgPT09ICd0cmVlJyk7XG5cdH0sXG5cdGFwcGx5OiAodGV4dCkgPT4gY2FwTGluZXModGV4dCwgTUFYX0xJU1RfTElORVMsICd0cmVlJyksXG59O1xuXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbi8vIFRlc3QgcnVubmVyc1xuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmZ1bmN0aW9uIGNvbXByZXNzVGVzdFJ1bm5lck91dHB1dCh0ZXh0OiBzdHJpbmcpOiBJVG9vbFJlc3VsdEZpbHRlck91dHB1dCB7XG5cdGNvbnN0IGxpbmVzID0gdGV4dC5zcGxpdCgnXFxuJyk7XG5cdGNvbnN0IGRyb3BQYXR0ZXJuczogUmVnRXhwW10gPSBbXG5cdFx0L15cXHMqUEFTU1xccytcXFMrLyxcblx0XHQvXlxccypva1xccytcXGQrXFxzKy8sXG5cdFx0L15cXHMqXFx1MjcxM1xccy8sXG5cdFx0L15cXHMqWy5zU0VGeF17MTAsfVxccyokLyxcblx0XHQvXnRlc3RcXHMuKyBcXC5cXC5cXC4gb2tcXHMqJC8sXG5cdFx0L15ydW5uaW5nIFxcZCsgdGVzdHM/JC9pLFxuXHRdO1xuXHRjb25zdCBvdXQ6IHN0cmluZ1tdID0gW107XG5cdGZvciAoY29uc3QgbGluZSBvZiBsaW5lcykge1xuXHRcdGlmIChkcm9wUGF0dGVybnMuc29tZShyZSA9PiByZS50ZXN0KGxpbmUpKSkge1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXHRcdG91dC5wdXNoKGxpbmUpO1xuXHR9XG5cdGNvbnN0IHJlc3VsdCA9IG91dC5qb2luKCdcXG4nKTtcblx0cmV0dXJuIHsgdGV4dDogcmVzdWx0LCBjb21wcmVzc2VkOiByZXN1bHQubGVuZ3RoIDwgdGV4dC5sZW5ndGggfTtcbn1cblxuZXhwb3J0IGNvbnN0IHRlc3RSdW5uZXJGaWx0ZXI6IElUb29sUmVzdWx0RmlsdGVyID0ge1xuXHRpZDogJ3Rlcm1pbmFsLnRlc3QtcnVubmVyJyxcblx0dG9vbElkczogW1Rlcm1pbmFsVG9vbElkLlJ1bkluVGVybWluYWxdLFxuXHRtYXRjaGVzKF90b29sSWQsIGlucHV0KSB7XG5cdFx0aWYgKCFpc1Rlcm1pbmFsSW5wdXQoaW5wdXQpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGNvbnN0IHBhcnNlZCA9IHBhcnNlQ29tbWFuZChpbnB1dC5jb21tYW5kKTtcblx0XHRpZiAoIXBhcnNlZCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRmb3IgKGNvbnN0IHNlZyBvZiBwYXJzZWQuc2VnbWVudHMpIHtcblx0XHRcdGNvbnN0IGhlYWQgPSBzZWdtZW50SGVhZChzZWcpO1xuXHRcdFx0aWYgKCFoZWFkKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGhlYWQuaGVhZCA9PT0gJ3B5dGVzdCcgfHwgaGVhZC5oZWFkID09PSAnamVzdCcgfHwgaGVhZC5oZWFkID09PSAndml0ZXN0JyB8fCBoZWFkLmhlYWQgPT09ICdwbGF5d3JpZ2h0JyB8fCBoZWFkLmhlYWQgPT09ICdtb2NoYScpIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAoaGVhZC5oZWFkID09PSAnY2FyZ28nICYmIGhlYWQuc3ViICYmIC9eKHRlc3R8bmV4dGVzdCkkLy50ZXN0KGhlYWQuc3ViKSkge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdGlmIChoZWFkLmhlYWQgPT09ICdnbycgJiYgaGVhZC5zdWIgPT09ICd0ZXN0Jykge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdGlmICgoaGVhZC5oZWFkID09PSAnbnBtJyB8fCBoZWFkLmhlYWQgPT09ICdwbnBtJyB8fCBoZWFkLmhlYWQgPT09ICd5YXJuJykgJiYgaGVhZC5zdWIgPT09ICd0ZXN0Jykge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdGlmIChoZWFkLmhlYWQgPT09ICducHgnICYmIGhlYWQuc3ViICYmIC9eKGplc3R8dml0ZXN0fHBsYXl3cmlnaHR8bW9jaGEpJC8udGVzdChoZWFkLnN1YikpIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fSxcblx0YXBwbHk6ICh0ZXh0KSA9PiBjb21wcmVzc1Rlc3RSdW5uZXJPdXRwdXQodGV4dCksXG59O1xuXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbi8vIEJ1aWxkIHRvb2xzXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuZnVuY3Rpb24gY29tcHJlc3NCdWlsZE91dHB1dCh0ZXh0OiBzdHJpbmcpOiBJVG9vbFJlc3VsdEZpbHRlck91dHB1dCB7XG5cdGNvbnN0IGRyb3BQYXR0ZXJuczogUmVnRXhwW10gPSBbXG5cdFx0L15cXHMqQ29tcGlsaW5nXFxzK1xcUytcXHMrdlxcUysvLFxuXHRcdC9eXFxzKkRvd25sb2FkaW5nXFxzK1xcUysvLFxuXHRcdC9eXFxzKkRvd25sb2FkZWRcXHMrXFxTKy8sXG5cdFx0L15cXHMqVXBkYXRpbmdcXHMrY3JhdGVzXFwuaW9cXHMraW5kZXgvLFxuXHRcdC9eXFxzKkZpbmlzaGVkXFxzKyhkZXZ8cmVsZWFzZXx0ZXN0KS8sXG5cdFx0L15tYWtlXFxbXFxkK1xcXTogKEVudGVyaW5nfExlYXZpbmcpIGRpcmVjdG9yeS8sXG5cdFx0L15Eb3dubG9hZChlZHxpbmcpIGh0dHBzPzovLFxuXHRcdC9eXFxbSU5GT1xcXSBEb3dubG9hZGluZyBmcm9tIC8sXG5cdFx0L15cXFtJTkZPXFxdIERvd25sb2FkZWQgZnJvbSAvLFxuXHRcdC9ePiBUYXNrIDovLFxuXHRdO1xuXHRjb25zdCBsaW5lcyA9IHRleHQuc3BsaXQoJ1xcbicpO1xuXHRjb25zdCBvdXQ6IHN0cmluZ1tdID0gW107XG5cdGZvciAoY29uc3QgbGluZSBvZiBsaW5lcykge1xuXHRcdGlmIChkcm9wUGF0dGVybnMuc29tZShyZSA9PiByZS50ZXN0KGxpbmUpKSkge1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXHRcdG91dC5wdXNoKGxpbmUpO1xuXHR9XG5cdGNvbnN0IHJlc3VsdCA9IG91dC5qb2luKCdcXG4nKTtcblx0cmV0dXJuIHsgdGV4dDogcmVzdWx0LCBjb21wcmVzc2VkOiByZXN1bHQubGVuZ3RoIDwgdGV4dC5sZW5ndGggfTtcbn1cblxuZXhwb3J0IGNvbnN0IGJ1aWxkVG9vbEZpbHRlcjogSVRvb2xSZXN1bHRGaWx0ZXIgPSB7XG5cdGlkOiAndGVybWluYWwuYnVpbGQtdG9vbCcsXG5cdHRvb2xJZHM6IFtUZXJtaW5hbFRvb2xJZC5SdW5JblRlcm1pbmFsXSxcblx0bWF0Y2hlcyhfdG9vbElkLCBpbnB1dCkge1xuXHRcdGlmICghaXNUZXJtaW5hbElucHV0KGlucHV0KSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRjb25zdCBwYXJzZWQgPSBwYXJzZUNvbW1hbmQoaW5wdXQuY29tbWFuZCk7XG5cdFx0aWYgKCFwYXJzZWQpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Zm9yIChjb25zdCBzZWcgb2YgcGFyc2VkLnNlZ21lbnRzKSB7XG5cdFx0XHRjb25zdCBoZWFkID0gc2VnbWVudEhlYWQoc2VnKTtcblx0XHRcdGlmICghaGVhZCkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGlmIChoZWFkLmhlYWQgPT09ICdjYXJnbycgJiYgaGVhZC5zdWIgJiYgL14oYnVpbGR8Y2hlY2t8Y2xpcHB5KSQvLnRlc3QoaGVhZC5zdWIpKSB7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGhlYWQuaGVhZCA9PT0gJ2dvJyAmJiAoaGVhZC5zdWIgPT09ICdidWlsZCcgfHwgaGVhZC5zdWIgPT09ICd2ZXQnKSkge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdGlmIChoZWFkLmhlYWQgPT09ICdtYWtlJyB8fCBoZWFkLmhlYWQgPT09ICd0c2MnIHx8IGhlYWQuaGVhZCA9PT0gJ2dyYWRsZScgfHwgaGVhZC5oZWFkID09PSAnbXZuJykge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdGlmIChoZWFkLmhlYWQgPT09ICdkb3RuZXQnICYmIGhlYWQuc3ViID09PSAnYnVpbGQnKSB7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH0sXG5cdGFwcGx5OiAodGV4dCkgPT4gY29tcHJlc3NCdWlsZE91dHB1dCh0ZXh0KSxcbn07XG5cbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuLy8gTGludGVyc1xuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmZ1bmN0aW9uIGNvbXByZXNzTGludGVyT3V0cHV0KHRleHQ6IHN0cmluZyk6IElUb29sUmVzdWx0RmlsdGVyT3V0cHV0IHtcblx0Y29uc3QgbGluZXMgPSB0ZXh0LnNwbGl0KCdcXG4nKTtcblx0Y29uc3QgZHJvcFBhdHRlcm5zOiBSZWdFeHBbXSA9IFtcblx0XHQvXlxccypTdWNjZXNzOiBubyBpc3N1ZXMgZm91bmRcXHMqJC9pLFxuXHRcdC9eXFxzKkFsbCBjaGVja3MgcGFzc2VkXFwuP1xccyokL2ksXG5cdFx0L15cXHMqU3VjY2VzczpcXHMqMCBlcnJvcnMvaSxcblx0XTtcblx0Y29uc3Qgb3V0OiBzdHJpbmdbXSA9IFtdO1xuXHRmb3IgKGNvbnN0IGxpbmUgb2YgbGluZXMpIHtcblx0XHRpZiAoZHJvcFBhdHRlcm5zLnNvbWUocmUgPT4gcmUudGVzdChsaW5lKSkpIHtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblx0XHRvdXQucHVzaChsaW5lKTtcblx0fVxuXHRjb25zdCByZXN1bHQgPSBvdXQuam9pbignXFxuJyk7XG5cdHJldHVybiB7IHRleHQ6IHJlc3VsdCwgY29tcHJlc3NlZDogcmVzdWx0Lmxlbmd0aCA8IHRleHQubGVuZ3RoIH07XG59XG5cbmV4cG9ydCBjb25zdCBsaW50ZXJGaWx0ZXI6IElUb29sUmVzdWx0RmlsdGVyID0ge1xuXHRpZDogJ3Rlcm1pbmFsLmxpbnRlcicsXG5cdHRvb2xJZHM6IFtUZXJtaW5hbFRvb2xJZC5SdW5JblRlcm1pbmFsXSxcblx0bWF0Y2hlcyhfdG9vbElkLCBpbnB1dCkge1xuXHRcdGlmICghaXNUZXJtaW5hbElucHV0KGlucHV0KSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRjb25zdCBwYXJzZWQgPSBwYXJzZUNvbW1hbmQoaW5wdXQuY29tbWFuZCk7XG5cdFx0aWYgKCFwYXJzZWQpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Zm9yIChjb25zdCBzZWcgb2YgcGFyc2VkLnNlZ21lbnRzKSB7XG5cdFx0XHRjb25zdCBoZWFkID0gc2VnbWVudEhlYWQoc2VnKTtcblx0XHRcdGlmICghaGVhZCkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGlmIChoZWFkLmhlYWQgPT09ICdlc2xpbnQnIHx8IGhlYWQuaGVhZCA9PT0gJ3J1ZmYnIHx8IGhlYWQuaGVhZCA9PT0gJ215cHknIHx8IGhlYWQuaGVhZCA9PT0gJ3ByZXR0aWVyJyB8fCBoZWFkLmhlYWQgPT09ICdydWJvY29wJyB8fCBoZWFkLmhlYWQgPT09ICdnb2xhbmdjaS1saW50Jykge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdGlmIChoZWFkLmhlYWQgPT09ICdjYXJnbycgJiYgaGVhZC5zdWIgPT09ICdjbGlwcHknKSB7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGhlYWQuaGVhZCA9PT0gJ25weCcgJiYgaGVhZC5zdWIgJiYgL14oZXNsaW50fHByZXR0aWVyfHRzYykkLy50ZXN0KGhlYWQuc3ViKSkge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9LFxuXHRhcHBseTogKHRleHQpID0+IGNvbXByZXNzTGludGVyT3V0cHV0KHRleHQpLFxufTtcblxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4vLyBQYWNrYWdlIG1hbmFnZXJzXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuLyoqXG4gKiBDb21wcmVzc2VzIGBucG0gaW5zdGFsbGAgLyBgeWFybmAgLyBgcG5wbSBpbnN0YWxsYCBvdXRwdXQgYnkgc3RyaXBwaW5nXG4gKiBwcm9ncmVzcyBsaW5lcyBhbmQgYXVkaXQgc3VtbWFyeSBub2lzZSwga2VlcGluZyB0aGUgcGFja2FnZSBzdW1tYXJ5IHBsdXNcbiAqIGFueSBlcnJvci93YXJuaW5nIGxpbmVzLlxuICovXG5leHBvcnQgY29uc3QgbnBtSW5zdGFsbEZpbHRlcjogSVRvb2xSZXN1bHRGaWx0ZXIgPSB7XG5cdGlkOiAndGVybWluYWwubnBtLWluc3RhbGwnLFxuXHR0b29sSWRzOiBbVGVybWluYWxUb29sSWQuUnVuSW5UZXJtaW5hbF0sXG5cdG1hdGNoZXMoX3Rvb2xJZCwgaW5wdXQpIHtcblx0XHRpZiAoIWlzVGVybWluYWxJbnB1dChpbnB1dCkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Y29uc3QgcGFyc2VkID0gcGFyc2VDb21tYW5kKGlucHV0LmNvbW1hbmQpO1xuXHRcdGlmICghcGFyc2VkKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGZvciAoY29uc3Qgc2VnIG9mIHBhcnNlZC5zZWdtZW50cykge1xuXHRcdFx0Y29uc3QgaGVhZCA9IHNlZ21lbnRIZWFkKHNlZyk7XG5cdFx0XHRpZiAoIWhlYWQpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAoaGVhZC5oZWFkID09PSAnbnBtJyAmJiBoZWFkLnN1YiAmJiAvXihpbnN0YWxsfGl8Y2l8YWRkKSQvLnRlc3QoaGVhZC5zdWIpKSB7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGhlYWQuaGVhZCA9PT0gJ3lhcm4nIHx8IGhlYWQuaGVhZCA9PT0gJ3BucG0nKSB7XG5cdFx0XHRcdGlmIChoZWFkLnN1YiA9PT0gJ2luc3RhbGwnIHx8IGhlYWQuc3ViID09PSAnYWRkJyB8fCBoZWFkLnN1YiA9PT0gJ2knKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGhlYWQuc3ViID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHQvLyBCYXJlIGB5YXJuYCAvIGBwbnBtYCBpcyBpbXBsaWNpdCBpbnN0YWxsIGluIHRoZSBwcm9qZWN0IHJvb3QuXG5cdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9LFxuXHRhcHBseSh0ZXh0KTogSVRvb2xSZXN1bHRGaWx0ZXJPdXRwdXQge1xuXHRcdGNvbnN0IGxpbmVzID0gdGV4dC5zcGxpdCgnXFxuJyk7XG5cdFx0Y29uc3QgZHJvcFBhdHRlcm5zOiBSZWdFeHBbXSA9IFtcblx0XHRcdC9ebnBtIHdhcm4gZGVwcmVjYXRlZCAvaSxcblx0XHRcdC9eXFxzKlxcWyMrPj9cXHMqXFxdIC8sXG5cdFx0XHQvXm5wbSBodHRwIC9pLFxuXHRcdFx0L15ucG0gdGltaW5nIC9pLFxuXHRcdFx0L15ucG0gc2lsbCAvaSxcblx0XHRcdC9ebnBtIHZlcmIgL2ksXG5cdFx0XHQvXlxccypcXGQrIHBhY2thZ2VzPyBhcmUgbG9va2luZyBmb3IgZnVuZGluZy9pLFxuXHRcdFx0L3J1biBgbnBtIGZ1bmRgL2ksXG5cdFx0XHQvXlJ1biBgbnBtIGF1ZGl0L2ksXG5cdFx0XTtcblx0XHRjb25zdCBvdXQ6IHN0cmluZ1tdID0gW107XG5cdFx0Zm9yIChjb25zdCBsaW5lIG9mIGxpbmVzKSB7XG5cdFx0XHRpZiAoZHJvcFBhdHRlcm5zLnNvbWUocmUgPT4gcmUudGVzdChsaW5lKSkpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRvdXQucHVzaChsaW5lKTtcblx0XHR9XG5cdFx0Y29uc3QgcmVzdWx0ID0gb3V0LmpvaW4oJ1xcbicpO1xuXHRcdHJldHVybiB7IHRleHQ6IHJlc3VsdCwgY29tcHJlc3NlZDogcmVzdWx0Lmxlbmd0aCA8IHRleHQubGVuZ3RoIH07XG5cdH0sXG59O1xuXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbi8vIE1pc2MgdXRpbGl0aWVzXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuLyoqIFNvcnQgKyBkZWR1cGUgYGVudmAgLyBgcHJpbnRlbnZgIG91dHB1dC4gKi9cbmV4cG9ydCBjb25zdCBlbnZGaWx0ZXI6IElUb29sUmVzdWx0RmlsdGVyID0ge1xuXHRpZDogJ3Rlcm1pbmFsLmVudicsXG5cdHRvb2xJZHM6IFtUZXJtaW5hbFRvb2xJZC5SdW5JblRlcm1pbmFsXSxcblx0bWF0Y2hlcyhfdG9vbElkLCBpbnB1dCkge1xuXHRcdGlmICghaXNUZXJtaW5hbElucHV0KGlucHV0KSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRjb25zdCBwYXJzZWQgPSBwYXJzZUNvbW1hbmQoaW5wdXQuY29tbWFuZCk7XG5cdFx0aWYgKCFwYXJzZWQpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Ly8gV2UgZG9uJ3QgZ28gdGhyb3VnaCBtYWtlTWF0Y2hlcigpIGhlcmUgYmVjYXVzZSBgZW52YCBpcyBhbHNvIGFcblx0XHQvLyB3cmFwcGVyIGFuZCBnZXRzIHN0cmlwcGVkIGR1cmluZyBwYXJzaW5nIFx1MjAxNCBvbmx5IGZpcmUgd2hlbiB0aGVyZSdzXG5cdFx0Ly8gbm90aGluZyBlbHNlIChpLmUuIGBlbnZgIGlzIGl0c2VsZiB0aGUgcHJvZ3JhbSkuXG5cdFx0Zm9yIChjb25zdCBzZWcgb2YgcGFyc2VkLnNlZ21lbnRzKSB7XG5cdFx0XHRjb25zdCBoZWFkID0gc2VnbWVudEhlYWQoc2VnKTtcblx0XHRcdGlmIChoZWFkPy5oZWFkID09PSAncHJpbnRlbnYnKSB7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0Ly8gQWZ0ZXIgd3JhcHBlci1zdHJpcHBpbmcsIGJhcmUgYGVudmAgc3Vydml2ZXMgb25seSB3aGVuIHRoZXJlIHdhc1xuXHRcdFx0Ly8gbm8gaW5uZXIgcHJvZ3JhbSAoaS5lLiB0aGUgdXNlciBpbnZva2VkIGBlbnZgIHdpdGggbm8gYXJncykuXG5cdFx0XHRpZiAoaGVhZCA9PT0gdW5kZWZpbmVkICYmIHNlZy53cmFwcGVycy5sZW5ndGggPiAwICYmIHNlZy53cmFwcGVyc1tzZWcud3JhcHBlcnMubGVuZ3RoIC0gMV0gPT09ICdlbnYnICYmIHNlZy50b2tlbnMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH0sXG5cdGFwcGx5KHRleHQpOiBJVG9vbFJlc3VsdEZpbHRlck91dHB1dCB7XG5cdFx0Y29uc3QgbGluZXMgPSB0ZXh0LnNwbGl0KCdcXG4nKS5maWx0ZXIobCA9PiBsLnRyaW0oKSAhPT0gJycpO1xuXHRcdGNvbnN0IHVuaXF1ZSA9IEFycmF5LmZyb20obmV3IFNldChsaW5lcykpLnNvcnQoKTtcblx0XHRjb25zdCByZXN1bHQgPSB1bmlxdWUuam9pbignXFxuJyk7XG5cdFx0cmV0dXJuIHsgdGV4dDogcmVzdWx0LCBjb21wcmVzc2VkOiByZXN1bHQubGVuZ3RoIDwgdGV4dC5sZW5ndGggfTtcblx0fSxcbn07XG5cbmV4cG9ydCBmdW5jdGlvbiByZWdpc3RlclRlcm1pbmFsQ29tcHJlc3NvcnMoY29tcHJlc3NvcjogSVRvb2xSZXN1bHRDb21wcmVzc29yKTogdm9pZCB7XG5cdC8vIFZDU1xuXHRjb21wcmVzc29yLnJlZ2lzdGVyRmlsdGVyKGdpdERpZmZGaWx0ZXIpO1xuXHRjb21wcmVzc29yLnJlZ2lzdGVyRmlsdGVyKGdpdExvZ0ZpbHRlcik7XG5cdGNvbXByZXNzb3IucmVnaXN0ZXJGaWx0ZXIoZ2l0U3RhdHVzRmlsdGVyKTtcblx0Ly8gRmlsZSBvcHNcblx0Y29tcHJlc3Nvci5yZWdpc3RlckZpbHRlcihsc0ZpbHRlcik7XG5cdGNvbXByZXNzb3IucmVnaXN0ZXJGaWx0ZXIoZmluZEZpbHRlcik7XG5cdGNvbXByZXNzb3IucmVnaXN0ZXJGaWx0ZXIoZ3JlcEZpbHRlcik7XG5cdGNvbXByZXNzb3IucmVnaXN0ZXJGaWx0ZXIodHJlZUZpbHRlcik7XG5cdC8vIFRlc3QgLyBidWlsZCAvIGxpbnRcblx0Y29tcHJlc3Nvci5yZWdpc3RlckZpbHRlcih0ZXN0UnVubmVyRmlsdGVyKTtcblx0Y29tcHJlc3Nvci5yZWdpc3RlckZpbHRlcihidWlsZFRvb2xGaWx0ZXIpO1xuXHRjb21wcmVzc29yLnJlZ2lzdGVyRmlsdGVyKGxpbnRlckZpbHRlcik7XG5cdC8vIFBhY2thZ2UgbWFuYWdlcnNcblx0Y29tcHJlc3Nvci5yZWdpc3RlckZpbHRlcihucG1JbnN0YWxsRmlsdGVyKTtcblx0Ly8gTWlzY1xuXHRjb21wcmVzc29yLnJlZ2lzdGVyRmlsdGVyKGVudkZpbHRlcik7XG5cblx0Y29tcHJlc3Nvci5yZWdpc3RlckNhY2hlKG5ldyBUZXJtaW5hbE91dHB1dENhY2hlKCkpO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxzQkFBc0I7QUFFL0IsU0FBMEIsY0FBYyxvQkFBb0IsbUJBQW1CLGdCQUFnQixtQkFBbUI7QUFDbEgsU0FBUywyQkFBMkI7QUFVcEMsU0FBUyxnQkFBZ0IsT0FBeUM7QUFDakUsTUFBSSxPQUFPLFVBQVUsWUFBWSxVQUFVLE1BQU07QUFDaEQsV0FBTztBQUFBLEVBQ1I7QUFDQSxRQUFNLGdCQUFnQjtBQUN0QixTQUFPLGNBQWMsWUFBWSxVQUFhLE9BQU8sY0FBYyxZQUFZO0FBQ2hGO0FBR08sTUFBTSxtQkFBbUI7QUFRaEMsU0FBUyxZQUFZLE1BSWxCO0FBQ0YsUUFBTSxjQUFjLEtBQUssUUFBUSxPQUFPLEtBQUssUUFBUSxTQUFZLFNBQzlELEtBQUssUUFBUSxPQUFPLE9BQ25CLE9BQU8sS0FBSyxRQUFRLFdBQVcsb0JBQUksSUFBSSxDQUFDLEtBQUssR0FBRyxDQUFDLElBQ2hELElBQUksSUFBSSxLQUFLLEdBQUc7QUFDckIsU0FB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
