const DEFAULT_LARGE_OUTPUT_THRESHOLD = 3e4;
const DEFAULT_SHELL_GREP_LARGE_OUTPUT_THRESHOLD = 3e4;
const DEFAULT_MIN_SAVED_CHARS = 0;
function compact(command, output, options) {
  const opts = options ?? {};
  const largeOutputThreshold = opts.largeOutputThreshold ?? DEFAULT_LARGE_OUTPUT_THRESHOLD;
  const shellGrepLargeOutputThreshold = opts.shellGrepLargeOutputThreshold ?? DEFAULT_SHELL_GREP_LARGE_OUTPUT_THRESHOLD;
  const minimumSavedChars = opts.minSavedChars ?? DEFAULT_MIN_SAVED_CHARS;
  const classification = classifyCommandResult(command);
  const preview = previewShellOutputCompaction(
    command,
    output,
    largeOutputThreshold,
    shellGrepLargeOutputThreshold,
    minimumSavedChars
  );
  return buildReport(command, classification, output, preview);
}
function classifyCommand(command) {
  const result = classifyCommandResult(command);
  return {
    commandKinds: result.commandKinds.slice(),
    isSourceReadCommand: result.isSourceReadCommand,
    runsGoTest: result.runsGoTest,
    mentionsSavedToolOutput: result.mentionsSavedToolOutput
  };
}
const textEncoder = new TextEncoder();
function byteLength(value) {
  return textEncoder.encode(value).length;
}
function countLines(text) {
  if (text.length === 0) {
    return 0;
  }
  let count = text.split("\n").length;
  if (text.endsWith("\n")) {
    count -= 1;
  }
  return count;
}
function countsOf(text) {
  return {
    chars: text.length,
    bytes: byteLength(text),
    lines: countLines(text)
  };
}
function minusCounts(self, other) {
  return {
    chars: saturatingSub(self.chars, other.chars),
    bytes: saturatingSub(self.bytes, other.bytes),
    lines: saturatingSub(self.lines, other.lines)
  };
}
function reductionOf(saved, original) {
  return {
    charsPct: pct(saved.chars, original.chars),
    bytesPct: pct(saved.bytes, original.bytes),
    linesPct: pct(saved.lines, original.lines)
  };
}
function pct(part, whole) {
  if (whole === 0) {
    return 0;
  }
  return part / whole * 100;
}
function buildReport(command, classification, original, preview) {
  const compactedText = preview ? preview.output : original;
  const originalCounts = countsOf(original);
  const compactedCounts = countsOf(compactedText);
  const saved = minusCounts(originalCounts, compactedCounts);
  const reduction = reductionOf(saved, originalCounts);
  return {
    command,
    applied: preview !== void 0,
    lossless: preview === void 0 ? true : preview.lossless,
    commandKinds: classification.commandKinds.slice(),
    isSourceReadCommand: classification.isSourceReadCommand,
    runsGoTest: classification.runsGoTest,
    mentionsSavedToolOutput: classification.mentionsSavedToolOutput,
    original: originalCounts,
    compacted: compactedCounts,
    saved,
    reduction,
    compactedOutput: compactedText
  };
}
const COMPACTED_REFERENCE_OVERHEAD_BUDGET = 512;
const COMMON_PREFIX_DISPLAY_WIDTH = 120;
const EXTENSION_SUMMARY_INLINE_WIDTH = 160;
const GO_RUNTIME_PANIC_MIN_GOROUTINES = 8;
const CARGO_PROGRESS_PREFIXES = [
  "Updating ",
  "Downloading ",
  "Downloaded ",
  "Compiling ",
  "Checking ",
  "Fresh ",
  "Locking ",
  "Adding ",
  "Building "
];
const COMMAND_COMPACTOR_ORDER = [
  "apt",
  "npm",
  "npm-pack",
  "yarn-berry",
  "pnpm",
  "composer",
  "poetry",
  "pip",
  "uv",
  "maven",
  "dotnet",
  "python-build",
  "go",
  "unittest",
  "js-test",
  "cargo",
  "node",
  "pytest",
  "git",
  "git-clean",
  "nx",
  "python-build-ext",
  "django-test",
  "golangci-lint",
  "clang-format-linter",
  "gradle",
  "cmake",
  "make",
  "shell-grep",
  "python-script"
];
const BENIGN_SEGMENT = { benign: true };
function compactSegment(kind) {
  return { benign: false, kind };
}
function segmentsEqual(a, b) {
  if (a.benign || b.benign) {
    return a.benign === b.benign;
  }
  return a.kind === b.kind;
}
function jsStringLen(value) {
  return value.length;
}
function sliceJsUnits(text, start, len) {
  if (len === 0) {
    return "";
  }
  return text.slice(start, start + len);
}
function splitWhitespace(value) {
  const trimmed = value.trim();
  return trimmed.length === 0 ? [] : trimmed.split(/\s+/);
}
function saturatingSub(a, b) {
  return a > b ? a - b : 0;
}
function arraySliceEqual(arr, aStart, bStart, len) {
  for (let k = 0; k < len; k++) {
    if (arr[aStart + k] !== arr[bStart + k]) {
      return false;
    }
  }
  return true;
}
function isAsciiDigit(ch) {
  return ch >= "0" && ch <= "9";
}
function isAsciiAlphabetic(ch) {
  return ch >= "A" && ch <= "Z" || ch >= "a" && ch <= "z";
}
function trimStartMatchesChars(value, chars) {
  let i = 0;
  while (i < value.length && chars.includes(value[i])) {
    i += 1;
  }
  return value.slice(i);
}
function regexReplaceAll(pattern, input, replacement) {
  return input.replace(new RegExp(pattern, "g"), replacement);
}
function regexTest(pattern, input) {
  return regexTestWithFlags(pattern, input, "");
}
function regexTestWithFlags(pattern, input, flags) {
  return new RegExp(pattern, flags).test(input);
}
function regexFind(pattern, input) {
  const match = new RegExp(pattern).exec(input);
  return match ? match.index : void 0;
}
function regexCaptureFirst(pattern, input) {
  const match = new RegExp(pattern).exec(input);
  if (match && match[1] !== void 0) {
    return match[1];
  }
  return void 0;
}
function regexFindAll(pattern, input) {
  const regex = new RegExp(pattern, "g");
  const matches = [];
  let match;
  while ((match = regex.exec(input)) !== null) {
    matches.push({ start: match.index, end: match.index + match[0].length });
    if (match[0].length === 0) {
      regex.lastIndex += 1;
    }
  }
  return matches;
}
function unchanged(output) {
  return { output, lossless: true };
}
function lossy(output) {
  return { output, lossless: false };
}
function indexAll(items) {
  return items.map((item, index) => ({ index, item }));
}
function joinedLineBytes(lines) {
  let total = 0;
  for (const line of lines) {
    total += byteLength(line);
  }
  return total + saturatingSub(lines.length, 1);
}
function shouldSkipToolOutputCompaction(lines, output, minLines) {
  return lines.length < minLines || lines.length > 2e5 || jsStringLen(output) < 1500 || lines.some((line) => line.startsWith("Error:") || line.startsWith("rg: ") || line.startsWith("grep: "));
}
function fitsLargeOutputThreshold(output, largeOutputThreshold) {
  return byteLength(output) <= largeOutputThreshold;
}
function compactedBodyBudget(largeOutputThreshold) {
  return Math.max(256, saturatingSub(largeOutputThreshold, COMPACTED_REFERENCE_OVERHEAD_BUDGET));
}
function totalGroupItems(groups) {
  let total = 0;
  for (const [, items] of groups) {
    total += items.length;
  }
  return total;
}
function truncateInlineText(text, maxLength) {
  const normalized = normalizeInlineWhitespace(text);
  const normalizedLen = jsStringLen(normalized);
  if (normalizedLen <= maxLength) {
    return normalized;
  }
  const suffix = `... [+${normalizedLen - maxLength} chars]`;
  return `${sliceJsUnits(normalized, 0, saturatingSub(maxLength, suffix.length))}${suffix}`;
}
function excerptInlineText(text, maxLength) {
  const normalized = normalizeInlineWhitespace(text);
  const normalizedLen = jsStringLen(normalized);
  if (normalizedLen <= maxLength) {
    return normalized;
  }
  const markerIndex = highSignalTextIndex(normalized);
  if (markerIndex !== void 0) {
    return excerptAroundIndex(normalized, maxLength, markerIndex);
  }
  const separator = ` ... [+${normalizedLen - maxLength} chars] ... `;
  const available = saturatingSub(maxLength, separator.length);
  const headLength = Math.ceil(available / 2);
  const tailLength = Math.floor(available / 2);
  return `${sliceJsUnits(normalized, 0, headLength)}${separator}${sliceJsUnits(normalized, saturatingSub(normalizedLen, tailLength), tailLength)}`;
}
function normalizeInlineWhitespace(text) {
  return splitWhitespace(text).join(" ");
}
function highSignalTextIndex(text) {
  return regexFind(
    String.raw`\b(?:HF_TOKEN|AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY|SECRET|TOKEN|FINAL_EXIT|RESULT|BEST|Accuracy|Model size|AssertionError|FAIL|ERROR|Rank)\b|hf_[A-Za-z0-9_]+|u=a1[A-Za-z0-9_-]+|https?://`,
    text
  );
}
function excerptAroundIndex(text, maxLength, index) {
  const prefix = index > 0 ? "... " : "";
  const textLen = jsStringLen(text);
  const indexUnits = index;
  const suffix = indexUnits + maxLength < textLen ? " ..." : "";
  const available = saturatingSub(maxLength, prefix.length + suffix.length);
  const start = Math.min(saturatingSub(indexUnits, Math.floor(available / 2)), saturatingSub(textLen, available));
  return `${prefix}${sliceJsUnits(text, start, available)}${suffix}`;
}
function truncatePathMiddle(inputPath, maxLength) {
  if (jsStringLen(inputPath) <= maxLength) {
    return inputPath;
  }
  const ellipsis = "...";
  const minTruncateWithEllipsisLength = ellipsis.length + 2;
  const minMiddleTruncateLength = minTruncateWithEllipsisLength * 2;
  if (maxLength <= minTruncateWithEllipsisLength) {
    return sliceJsUnits(inputPath, 0, maxLength);
  }
  if (maxLength < minMiddleTruncateLength) {
    return `${sliceJsUnits(inputPath, 0, maxLength - ellipsis.length)}${ellipsis}`;
  }
  const separator = inputPath.includes("\\") && !inputPath.includes("/") ? "\\" : "/";
  const [root, segments] = getPathPartsForMiddleTruncation(inputPath, separator);
  const minSegmentsForMiddleTruncation = root.length === 0 ? 3 : 2;
  if (segments.length < minSegmentsForMiddleTruncation) {
    return `${sliceJsUnits(inputPath, 0, maxLength - ellipsis.length)}${ellipsis}`;
  }
  const lastSegment = segments.length > 0 ? segments[segments.length - 1] : "";
  const preservedSegmentCount = root.length === 0 ? 1 : 0;
  const minResult = root.length === 0 ? `${segments[0]}${separator}${ellipsis}${separator}${lastSegment}` : `${root}${ellipsis}${separator}${lastSegment}`;
  if (jsStringLen(minResult) > maxLength) {
    return `${sliceJsUnits(inputPath, 0, maxLength - ellipsis.length)}${ellipsis}`;
  }
  let result = minResult;
  const middleSegments = segments.slice(preservedSegmentCount, segments.length - 1);
  for (let i = 0; i < middleSegments.length; i++) {
    const preservedSegments = segments.slice(0, preservedSegmentCount + i + 1);
    const prefix = root.length === 0 ? preservedSegments.join(separator) : `${root}${preservedSegments.join(separator)}`;
    const candidate = `${prefix}${separator}${ellipsis}${separator}${lastSegment}`;
    if (jsStringLen(candidate) <= maxLength) {
      result = candidate;
    } else {
      break;
    }
  }
  return result;
}
function getPathPartsForMiddleTruncation(inputPath, separator) {
  if (inputPath.length >= 2 && isAsciiAlphabetic(inputPath[0]) && inputPath[1] === ":") {
    let end = 2;
    while (end < inputPath.length && (inputPath[end] === "/" || inputPath[end] === "\\")) {
      end += 1;
    }
    const root = end > 2 ? `${inputPath.slice(0, 2)}${separator}` : inputPath.slice(0, 2);
    return [root, splitPathSegments(inputPath.slice(end))];
  }
  if (inputPath.startsWith("\\\\") || inputPath.startsWith("//")) {
    const uncSegments = splitPathSegments(trimStartMatchesChars(inputPath, ["\\", "/"]));
    if (uncSegments.length >= 2) {
      return [
        `${separator}${separator}${uncSegments[0]}${separator}${uncSegments[1]}${separator}`,
        uncSegments.slice(2)
      ];
    }
  }
  if (inputPath.startsWith("\\") || inputPath.startsWith("/")) {
    return [separator, splitPathSegments(trimStartMatchesChars(inputPath, ["\\", "/"]))];
  }
  return ["", splitPathSegments(inputPath)];
}
function splitPathSegments(inputPath) {
  return inputPath.split(/[\\/]/).filter((part) => part.length > 0);
}
function naturalCmp(a, b) {
  const aChars = Array.from(a);
  const bChars = Array.from(b);
  let ai = 0;
  let bi = 0;
  for (; ; ) {
    const ac = ai < aChars.length ? aChars[ai] : void 0;
    const bc = bi < bChars.length ? bChars[bi] : void 0;
    if (ac === void 0 && bc === void 0) {
      return 0;
    }
    if (ac === void 0) {
      return -1;
    }
    if (bc === void 0) {
      return 1;
    }
    if (isAsciiDigit(ac) && isAsciiDigit(bc)) {
      let aNumber = "";
      while (ai < aChars.length && isAsciiDigit(aChars[ai])) {
        aNumber += aChars[ai];
        ai += 1;
      }
      let bNumber = "";
      while (bi < bChars.length && isAsciiDigit(bChars[bi])) {
        bNumber += bChars[bi];
        bi += 1;
      }
      const aTrimmed = aNumber.replace(/^0+/, "");
      const bTrimmed = bNumber.replace(/^0+/, "");
      let ord = compareNumber(aTrimmed.length, bTrimmed.length);
      if (ord === 0) {
        ord = compareString(aTrimmed, bTrimmed);
      }
      if (ord === 0) {
        ord = compareNumber(aNumber.length, bNumber.length);
      }
      if (ord !== 0) {
        return ord;
      }
    } else {
      ai += 1;
      bi += 1;
      const ord = compareCodePoint(ac, bc);
      if (ord !== 0) {
        return ord;
      }
    }
  }
}
function compareNumber(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}
function compareString(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}
function compareCodePoint(a, b) {
  const ac = a.codePointAt(0) ?? 0;
  const bc = b.codePointAt(0) ?? 0;
  return compareNumber(ac, bc);
}
function classifyCommandResult(command) {
  return {
    commandKinds: classifyCommandKinds(command),
    isSourceReadCommand: isShellSourceReadCommand(command),
    runsGoTest: commandRunsGoTest(command),
    mentionsSavedToolOutput: commandMentionsSavedToolOutput(command)
  };
}
function previewShellOutputCompaction(command, original, largeOutputThreshold, shellGrepLargeOutputThreshold, minimumSavedChars) {
  const classification = classifyCommandResult(command);
  const hasGoRuntimePanic = looksLikeGoRuntimePanic(original);
  const hasNpmPackOutput = looksLikeNpmPackOutput(original);
  const hasJestRunsOutput = hasJestRunsProgress(original);
  const hasDocusaurusOutput = hasDocusaurusProgress(original);
  const hasSphinxProgressOutput = hasSphinxProgress(original);
  const hasGoPassingTestOutput = classification.runsGoTest && hasPassingGoTestOutput(original);
  const hasNeedrestartNoopOutput = hasNeedrestartNoopSummary(original);
  const canCompactSourceReadProgress = hasGoPassingTestOutput && !classification.mentionsSavedToolOutput;
  if (classification.commandKinds.length === 0 && !hasGoRuntimePanic && !hasNpmPackOutput && !hasJestRunsOutput && !hasGoPassingTestOutput && !hasNeedrestartNoopOutput && !hasDocusaurusOutput && !hasSphinxProgressOutput) {
    return void 0;
  }
  if (classification.commandKinds.length === 0 && classification.isSourceReadCommand && !canCompactSourceReadProgress) {
    return void 0;
  }
  const result = compactShellOutput(
    classification.commandKinds,
    original,
    hasGoPassingTestOutput,
    shellGrepLargeOutputThreshold
  ) ?? { output: original, lossless: true };
  const savedChars = saturatingSub(jsStringLen(original), jsStringLen(result.output));
  const originalWouldSpill = !fitsLargeOutputThreshold(original, largeOutputThreshold);
  const savedBytes = saturatingSub(byteLength(original), byteLength(result.output));
  if (savedChars < minimumSavedChars && !(originalWouldSpill && savedBytes > 0)) {
    return void 0;
  }
  return {
    output: result.output,
    savedChars,
    lossless: result.lossless
  };
}
function compactToolOutput(kind, output, largeOutputThreshold) {
  const result = kind === "grep-content" ? compactGrepContentOutput(output, largeOutputThreshold) : kind === "grep-count" ? compactGrepCountOutput(output) : kind === "grep-paths" ? compactPathListOutput(output, "grep-paths", largeOutputThreshold) : compactPathListOutput(output, "glob", largeOutputThreshold);
  if (result.output === output) {
    return void 0;
  }
  return result;
}
function classifyCommandKinds(command) {
  const heredocStrippedCommand = stripHeredocBodies(command);
  if (heredocStrippedCommand === void 0) {
    return [];
  }
  const lineContinuedCommand = regexReplaceAll(String.raw`\s*\\\r?\n\s*`, heredocStrippedCommand.command, " ");
  const commandWithoutAllowedDescriptorRedirects = regexReplaceAll(String.raw`\s+[12]>&[12]\b`, lineContinuedCommand, "");
  const commandWithSafeSubstitutions = replaceSafeCommandSubstitutions(commandWithoutAllowedDescriptorRedirects);
  const safetyCommand = stripQuotedText(commandWithSafeSubstitutions);
  const hasNewline = regexTest(String.raw`\r?\n`, safetyCommand);
  if (regexTest("[;`<>]", safetyCommand) || regexTest(String.raw`(^|[^&])&($|[^&])`, safetyCommand) || safetyCommand.includes("$(")) {
    return [];
  }
  const segments = splitCommandSegments(lineContinuedCommand);
  const segmentKinds = segments.map((segment, index) => classifyCommandSegmentOrPipeline(segment, heredocStrippedCommand.heredocStdinSegmentIndexes.has(index)));
  if (segmentKinds.some((kind) => kind === void 0)) {
    return [];
  }
  const resolvedKinds = segmentKinds;
  if (hasNewline && !hasErrexitBeforeFirstCommand(segments, resolvedKinds)) {
    return [];
  }
  const result = [];
  for (const kind of resolvedKinds) {
    if (!kind.benign) {
      result.push(kind.kind);
    }
  }
  return result;
}
function isShellSourceReadCommand(command) {
  const heredocStrippedCommand = stripHeredocBodies(command);
  if (heredocStrippedCommand === void 0) {
    return true;
  }
  const lineContinuedCommand = regexReplaceAll(String.raw`\s*\\\r?\n\s*`, heredocStrippedCommand.command, " ");
  return splitCommandSegments(lineContinuedCommand).some((segment) => splitUnquotedPipes(segment).some((part) => isSourceReadSegment(part)));
}
function isSourceReadSegment(segment) {
  const normalized = normalizeSegment(segment);
  const withoutEnv = stripSafeCommandWrappers(stripEnvironmentAssignmentPrefix(normalized));
  return regexTest(String.raw`^(?:cat|sed|head|tail|less|more|bat|nl|awk|grep|egrep|fgrep|rg)(?:\s|$)`, withoutEnv);
}
function classifyCommandSegmentOrPipeline(segment, isHeredocStdinSegment) {
  const parts = splitUnquotedPipes(segment);
  if (parts.length === 1) {
    return classifyCommandSegment(parts[0], isHeredocStdinSegment);
  }
  if (parts.length < 2) {
    return void 0;
  }
  const headKind = classifyCommandSegment(parts[0], isHeredocStdinSegment);
  if (headKind === void 0) {
    return void 0;
  }
  if (segmentsEqual(headKind, BENIGN_SEGMENT)) {
    return void 0;
  }
  if (segmentsEqual(headKind, compactSegment("shell-grep"))) {
    return void 0;
  }
  if (parts.slice(1).every((part) => isBenignPipelineTail(part))) {
    return headKind;
  }
  return void 0;
}
function classifyCommandSegment(segment, isHeredocStdinSegment) {
  const normalized = normalizeSegment(segment);
  if (normalized.length === 0 || normalized === "true" || normalized === ":" || isBenignGofmtWriteCommand(normalized) || isBenignTarballCleanupCommand(normalized) || isBenignPythonBuildCleanupCommand(normalized) || normalized.startsWith("#") || regexTest(String.raw`^cd(?:\s+(?:"[^"]*"|'[^']*'|[^\s]+))?$`, normalized) || isBenignSetupCommand(normalized) || regexTest(
    String.raw`^set\s+(?:[-+A-Za-z]+|-o\s+[A-Za-z][A-Za-z0-9_-]*|[A-Za-z][A-Za-z0-9_-]*)(?:\s+(?:[-+A-Za-z]+|-o\s+[A-Za-z][A-Za-z0-9_-]*|[A-Za-z][A-Za-z0-9_-]*))*$`,
    normalized
  )) {
    return BENIGN_SEGMENT;
  }
  if (isAssignmentList(normalized) || normalized.startsWith("export ") && isAssignmentList(normalized.slice("export ".length))) {
    return BENIGN_SEGMENT;
  }
  const withoutEnv = stripSafeCommandWrappers(stripEnvironmentAssignmentPrefix(normalized));
  let kind;
  if (isAptCommand(withoutEnv)) {
    kind = "apt";
  } else if (isPnpmInstallCommand(withoutEnv)) {
    kind = "pnpm";
  } else if (regexTest(String.raw`^npm\s+pack\b`, withoutEnv)) {
    kind = "npm-pack";
  } else if (isYarnBerryCommand(withoutEnv)) {
    kind = "yarn-berry";
  } else if (regexTest(String.raw`^(?:npm\s+(?:ci|install)|yarn\s+install)\b`, withoutEnv)) {
    kind = "npm";
  } else if (isPipInstallCommand(withoutEnv)) {
    kind = "pip";
  } else if (regexTest(String.raw`^composer\s+(?:install|update|require|remove)\b`, withoutEnv)) {
    kind = "composer";
  } else if (regexTest(String.raw`^poetry\s+(?:install|update|add|remove)\b`, withoutEnv)) {
    kind = "poetry";
  } else if (isUvCommand(withoutEnv)) {
    kind = "uv";
  } else if (isBenignVersionCommand(withoutEnv)) {
    return BENIGN_SEGMENT;
  } else if (isGoCommand(withoutEnv)) {
    kind = "go";
  } else if (isJsTestCommand(withoutEnv)) {
    kind = "js-test";
  } else if (regexTest(String.raw`^cargo\s+(?:build|check|test|clippy|doc|fetch)\b`, withoutEnv)) {
    kind = "cargo";
  } else if (regexTest(String.raw`^(?:node|npx|npm\s+exec|pnpm\s+exec|yarn\s+node)\b`, withoutEnv)) {
    kind = "node";
  } else if (isNxCommand(withoutEnv)) {
    kind = "nx";
  } else if (isPytestCommand(withoutEnv)) {
    kind = "pytest";
  } else if (isPythonUnittestCommand(withoutEnv)) {
    kind = "unittest";
  } else if (isPythonBuildCommand(withoutEnv)) {
    kind = "python-build";
  } else if (isBenignGitCommand(withoutEnv)) {
    return BENIGN_SEGMENT;
  } else if (isGitProgressCommand(withoutEnv)) {
    kind = "git";
  } else if (isGitCleanOrResetCommand(withoutEnv)) {
    kind = "git-clean";
  } else if (regexTest(String.raw`^git\s+(?:checkout|switch)\b`, withoutEnv)) {
    kind = "git";
  } else if (isPythonBuildExtCommand(withoutEnv)) {
    kind = "python-build-ext";
  } else if (isDjangoTestCommand(withoutEnv)) {
    kind = "django-test";
  } else if (isGolangciLintCommand(withoutEnv)) {
    kind = "golangci-lint";
  } else if (isClangFormatLinterCommand(withoutEnv)) {
    kind = "clang-format-linter";
  } else if (isGradleCommand(withoutEnv)) {
    kind = "gradle";
  } else if (isCmakeConfigureCommand(withoutEnv)) {
    kind = "cmake";
  } else if (isMavenCommand(withoutEnv)) {
    kind = "maven";
  } else if (isDotnetCommand(withoutEnv)) {
    kind = "dotnet";
  } else if (isSafeShellGrepCommand(withoutEnv)) {
    kind = "shell-grep";
  } else if (regexTest(String.raw`^(?:g?make|ninja)\b`, withoutEnv) || regexTest(String.raw`^\./configure\b`, withoutEnv) || regexTest(String.raw`^cmake\s+--build\b`, withoutEnv)) {
    kind = "make";
  } else if (isPythonScriptCommand(withoutEnv, isHeredocStdinSegment)) {
    kind = "python-script";
  } else {
    return void 0;
  }
  return compactSegment(kind);
}
function splitUnquotedPipes(segment) {
  const parts = [];
  let start = 0;
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < segment.length; i++) {
    const ch = segment[i];
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
    } else if (ch === '"' && !inSingle && !isEscapedByOddBackslashes(segment, i)) {
      inDouble = !inDouble;
    } else if (ch === "|" && !inSingle && !inDouble) {
      pushTrimmedPart(parts, segment.slice(start, i));
      start = i + 1;
    }
  }
  pushTrimmedPart(parts, segment.slice(start));
  return parts;
}
function pushTrimmedPart(parts, part) {
  const trimmed = part.trim();
  if (trimmed.length !== 0) {
    parts.push(trimmed);
  }
}
function isBenignPipelineTail(segment) {
  const normalized = normalizeSegment(segment);
  return normalized === "cat" || regexTest(String.raw`^tee(?:\s+-a)?\s+(?:"[^"]*"|'[^']*'|\S+)$`, normalized) || regexTest(
    String.raw`^(?:head|tail)(?:\s+(?:-[nc]\s*)?[+-]?\d+|\s+-[nc]\s+[+-]?\d+)?$`,
    normalized
  ) || regexTest(
    String.raw`^sed\s+-n\s+(?:"\d+(?:,\d+)?p"|'[\d]+(?:,\d+)?p')$`,
    normalized
  ) || isSafeStreamingGrepTail(normalized) || isSafeStreamingFlagOnlyTail(normalized);
}
function stripPrefix(value, prefix) {
  return value.startsWith(prefix) ? value.slice(prefix.length) : void 0;
}
function stripSuffix(value, suffix) {
  return value.endsWith(suffix) ? value.slice(0, value.length - suffix.length) : void 0;
}
function splitOnce(value, separator) {
  const index = value.indexOf(separator);
  if (index === -1) {
    return void 0;
  }
  return [value.slice(0, index), value.slice(index + separator.length)];
}
function rsplitOnce(value, separator) {
  const index = value.lastIndexOf(separator);
  if (index === -1) {
    return void 0;
  }
  return [value.slice(0, index), value.slice(index + separator.length)];
}
function asciiLowercase(value) {
  let result = "";
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    result += code >= 65 && code <= 90 ? String.fromCharCode(code + 32) : value[i];
  }
  return result;
}
function parseUsize(value) {
  if (!/^\+?\d+$/.test(value)) {
    return void 0;
  }
  return Number(value);
}
function isAptCommand(segment) {
  const withoutSudo = stripPrefix(segment, "sudo ") ?? segment;
  const args = stripPrefix(withoutSudo, "apt-get ") ?? stripPrefix(withoutSudo, "apt ");
  if (args === void 0) {
    return false;
  }
  const tokens = splitWhitespace(args);
  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i];
    if (token === "-o" || token === "--option" || token === "-c" || token === "--config-file") {
      i += 2;
      continue;
    }
    if (token.startsWith("-")) {
      i += 1;
      continue;
    }
    return token === "update" || token === "install";
  }
  return false;
}
function isPnpmInstallCommand(segment) {
  const tokens = splitWhitespace(segment);
  if (tokens[0] !== "pnpm") {
    return false;
  }
  let index = 1;
  while (index < tokens.length) {
    const token = tokens[index];
    if (["--filter", "-F", "--prefix", "-C", "--dir", "--loglevel", "--reporter", "--package-import-method", "--workspace-concurrency"].includes(token)) {
      index += 2;
      continue;
    }
    if (["--recursive", "-r", "--workspace-root", "-w", "--silent", "-s", "--use-stderr", "--color", "--no-color"].includes(token) || regexTest(String.raw`^(?:--filter|--prefix|--dir|--loglevel|--reporter|--package-import-method|--workspace-concurrency|-F|-C)=`, token)) {
      index += 1;
      continue;
    }
    break;
  }
  return tokens[index] === "install" || tokens[index] === "i";
}
function isGitProgressCommand(segment) {
  const tokens = splitWhitespace(segment);
  const index = gitSubcommandIndex(tokens);
  if (index === void 0) {
    return false;
  }
  const subcommand = tokens[index];
  return subcommand === "clone" || subcommand === "fetch" || subcommand === "pull" || subcommand === "submodule" && tokens[index + 1] === "update";
}
function isGitCleanOrResetCommand(segment) {
  const tokens = splitWhitespace(segment);
  const index = gitSubcommandIndex(tokens);
  if (index === void 0) {
    return false;
  }
  const subcommand = tokens[index];
  const args = tokens.slice(index + 1);
  if (subcommand === "reset") {
    return args.includes("--hard");
  }
  return subcommand === "clean" && args.some((arg) => isGitCleanForceOption(arg));
}
function isGitCleanForceOption(arg) {
  return arg === "--force" || regexTest(String.raw`^-[A-Za-z]+$`, arg) && arg.includes("f");
}
function isBenignGitCommand(segment) {
  const tokens = splitWhitespace(segment);
  const index = gitSubcommandIndex(tokens);
  if (index === void 0) {
    return false;
  }
  const subcommand = tokens[index];
  const args = tokens.slice(index + 1);
  if (subcommand === "status") {
    return args.every((arg) => arg === "--short" || arg === "-s" || arg === "--porcelain" || arg.startsWith("--untracked-files"));
  }
  if (subcommand === "diff") {
    const hasSummaryOutput = args.some((arg) => ["--stat", "--shortstat", "--numstat", "--name-only", "--name-status", "--summary", "--compact-summary"].includes(arg));
    return hasSummaryOutput && !args.some((arg) => arg === "-p" || arg === "-u" || arg === "--patch" || arg.startsWith("--patch-") || arg.startsWith("--word-diff") || arg.startsWith("--color-words"));
  }
  return subcommand === "rev-parse" && args.every((arg) => arg === "--show-toplevel" || arg === "--show-prefix");
}
function gitSubcommandIndex(tokens) {
  if (tokens[0] !== "git") {
    return void 0;
  }
  let index = 1;
  while (index < tokens.length) {
    const token = tokens[index];
    if (token === "-C" || token === "--git-dir" || token === "--work-tree") {
      index += 2;
      continue;
    }
    if (token.startsWith("-c")) {
      index += token === "-c" ? 2 : 1;
      continue;
    }
    if (token.startsWith("--")) {
      index += 1;
      continue;
    }
    break;
  }
  return index < tokens.length ? index : void 0;
}
function isJsTestCommand(segment) {
  return !regexTest(
    String.raw`(?:^|\s)(?:-w|--watch(?:[=\s]|$)|--watchAll(?:[=\s]|$)|--watch-all(?:[=\s]|$)|--watch-files(?:[=\s]|$))`,
    segment
  ) && regexTest(
    String.raw`^(?:npx\s+|(?:npm|pnpm|yarn)\s+exec\s+)?(?:vitest|jest|mocha|tap)(?:\s|$)`,
    segment
  );
}
function isYarnBerryCommand(segment) {
  return regexTest(
    String.raw`^(?:yarn|corepack\s+yarn)\s+(?:install|add|workspaces|run\s+install)\b`,
    segment
  ) || regexTest(
    String.raw`^node\s+(?:\./)?script/yarn\.js\s+(?:install|add)\b`,
    segment
  );
}
function isNxCommand(segment) {
  return regexTest(
    String.raw`^(?:nx|(?:yarn|pnpm)\s+(?:nx|release:build|typescript|test:ts|lint))\b`,
    segment
  );
}
function isDjangoTestCommand(segment) {
  const pythonWithOptions = pythonWithOptionsPattern();
  return regexTest(
    String.raw`^${pythonWithOptions}\s+(?:(?:\./)?(?:tests/)?runtests\.py|manage\.py\s+test|-m\s+django\s+test)\b`,
    segment
  ) || regexTest(String.raw`^django-admin\s+test\b`, segment);
}
function isGolangciLintCommand(segment) {
  return regexTest(String.raw`^(?:[A-Za-z0-9_./+-]+/)?golangci-lint\s+run\b`, segment) || regexTest(
    String.raw`^go\s+run\s+github\.com/golangci/golangci-lint/cmd/golangci-lint(?:@\S+)?\s+run\b`,
    segment
  );
}
function isClangFormatLinterCommand(segment) {
  return regexTest(
    String.raw`^${pythonWithOptionsPattern()}\s+\S*tools/linter/adapters/clangformat_linter\.py\b`,
    segment
  );
}
function isGradleCommand(segment) {
  return regexTest(
    String.raw`^(?:(?:\./|/\S+/)?gradlew?|\$GRADLE|\$\{GRADLE\})(?:\s|$)`,
    segment
  );
}
function isCmakeConfigureCommand(segment) {
  return regexTest(String.raw`^cmake(?:\s|$)`, segment) && !splitWhitespace(segment).some((token) => regexTest(String.raw`^(?:--build|--install|-E|-P|--version|-N|-h|--help(?:-.+)?)$`, token));
}
function isMavenCommand(segment) {
  return regexTest(String.raw`^(?:(?:\./)?mvnw?|mvn)(?:\s|$)`, segment);
}
function isDotnetCommand(segment) {
  return regexTest(String.raw`^dotnet\s+(?:build|test|restore|publish|pack)(?:\s|$)`, segment);
}
function isUvCommand(segment) {
  return regexTest(
    String.raw`^(?:uv|(?:python|python3(?:\.\d+)?)\s+-m\s+uv)\s+(?:sync|pip\s+(?:install|sync|compile)|venv|add|lock|run)\b`,
    segment
  );
}
function isPipInstallCommand(segment) {
  return regexTest(
    String.raw`^(?:(?:${pythonExecutablePattern()})\s+-m\s+pip|pip|pip3)\s+install\b`,
    segment
  );
}
function isGoCommand(segment) {
  return regexTest(
    String.raw`^(?:go|/(?:\S+/)*go)\s+(?:test|build|install|get|mod\s+(?:tidy|download|verify|graph)|work\s+sync)\b`,
    segment
  );
}
function isPytestCommand(segment) {
  return regexTest(
    String.raw`^(?:(?:${pythonWithOptionsPattern()})\s+-m\s+pytest|(?:(?:[A-Za-z0-9_./+-]+/)?pytest))(?:\s|$)`,
    segment
  );
}
function isPythonUnittestCommand(segment) {
  return regexTest(String.raw`^${pythonWithOptionsPattern()}\s+-m\s+unittest\b`, segment);
}
function isPythonBuildCommand(segment) {
  return regexTest(String.raw`^${pythonWithOptionsPattern()}\s+-m\s+build(?:\s|$)`, segment);
}
function isPythonBuildExtCommand(segment) {
  return regexTest(String.raw`^${pythonExecutablePattern()}\s+setup\.py\s+build_ext\b`, segment);
}
function isPythonScriptCommand(segment, isHeredocStdinSegment) {
  return isHeredocStdinPythonCommand(segment, isHeredocStdinSegment) || regexTest(
    String.raw`^${pythonWithOptionsPattern()}\s+(?:-c\s+(?:"[^"]*"|'[^']*'|\S+)|(?:"[^"]+\.py"|'[^']+\.py'|[^\s-]\S*\.py))(?:\s|$)`,
    segment
  );
}
function isHeredocStdinPythonCommand(segment, isHeredocStdinSegment) {
  return isHeredocStdinSegment && regexTest(String.raw`^${pythonExecutablePattern()}\s+-$`, segment);
}
function isBenignSetupCommand(segment) {
  return isSourceActivateCommand(segment) || isBenignPythonVenvCommand(segment) || regexTest(
    String.raw`^mkdir\s+-p\s+(?:"[^"]*"|'[^']*'|[^\s]+)(?:\s+(?:"[^"]*"|'[^']*'|[^\s]+))*$`,
    segment
  ) || regexTest(String.raw`^umask\s+[0-7]{3,4}$`, segment) || regexTest(
    String.raw`^unset\s+[A-Za-z_][A-Za-z0-9_]*(?:\s+[A-Za-z_][A-Za-z0-9_]*)*$`,
    segment
  ) || segment === "hash -r" || isBenignCorepackYarnSetupCommand(segment) || isLiteralSeparatorCommand(segment);
}
function isSourceActivateCommand(segment) {
  return regexTest(
    String.raw`^(?:source|\.)\s+(?:"[^"]*(?:^|/)activate"|'[^']*(?:^|/)activate'|\S*(?:^|/)activate)$`,
    segment
  );
}
function isBenignCorepackYarnSetupCommand(segment) {
  return regexTest(String.raw`^corepack\s+(?:enable|prepare\s+yarn@\S+\s+--activate)$`, segment);
}
function isBenignPythonVenvCommand(segment) {
  return regexTest(String.raw`^${pythonExecutablePattern()}\s+-m\s+venv(?:\s+\S+)+$`, segment) && !regexTest(String.raw`\s(?:--help|-h)(?:\s|$)`, segment);
}
function isBenignGofmtWriteCommand(segment) {
  return regexTest(
    String.raw`^gofmt\s+-w(?:\s+(?:"[^"-][^"]*"|'[^'-][^']*'|[^-\s]\S*))+$`,
    segment
  );
}
function isBenignTarballCleanupCommand(segment) {
  return regexTest(
    String.raw`^rm\s+-f\s+(?:"[^"]+\.tgz"|'[^']+\.tgz'|\S+\.tgz)$`,
    segment
  );
}
function isBenignPythonBuildCleanupCommand(segment) {
  return regexTest(String.raw`^rm\s+-rf\s+dist\s+build\s+\*\.egg-info$`, segment);
}
function isBenignVersionCommand(segment) {
  return regexTest(String.raw`^/\S+\s+(?:--version|-version|version)$`, segment);
}
function isAssignmentList(segment) {
  return regexTest(
    String.raw`^(?:[A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|[^\s]+))(?:\s+[A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|[^\s]+))*$`,
    segment
  );
}
function stripEnvironmentAssignmentPrefix(segment) {
  return regexReplaceAll(
    String.raw`^([A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|\S+)\s+)+`,
    segment,
    ""
  );
}
function stripSafeCommandWrappers(segment) {
  let current = segment;
  for (let iteration = 0; iteration < 3; iteration++) {
    const before = current;
    current = stripEnvironmentAssignmentPrefix(regexReplaceAll(
      String.raw`^timeout\s+\d+(?:[smhd])?\s+`,
      current,
      ""
    ));
    current = stripEnvironmentAssignmentPrefix(regexReplaceAll(
      String.raw`^env(?:\s+[A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|\S+))+\s+`,
      current,
      ""
    ));
    if (current === before) {
      return current;
    }
  }
  return current;
}
function isLiteralSeparatorCommand(segment) {
  return regexTest(
    String.raw`^echo(?:\s+-n)?(?:\s+(?:"[\s#=_.:/*+\-[\]]{1,19}"|'[\s#=_.:/*+\-[\]]{1,19}'))+$`,
    segment
  ) || regexTest(
    String.raw`^printf\s+(?:"(?:[\s#=_.:/*+\-[\]]|\\n|\\t){1,19}"|'(?:[\s#=_.:/*+\-[\]]|\\n|\\t){1,19}')$`,
    segment
  );
}
function isSafeShellGrepCommand(segment) {
  const tokens = splitWhitespace(segment);
  const command = tokens[0];
  if (command === void 0) {
    return false;
  }
  if (!(command === "rg" || command === "grep" || command === "egrep" || command === "fgrep")) {
    return false;
  }
  const args = tokens.slice(1);
  let patternCount = 0;
  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg === "--") {
      return i < args.length - 1 && !args.slice(i + 1).some((a) => isSavedToolOutputPath(a));
    }
    if (arg === "-e" || arg === "--regexp") {
      i += 1;
      if (i >= args.length) {
        return false;
      }
      patternCount += 1;
      if (patternCount > 1) {
        return false;
      }
      i += 1;
      continue;
    }
    if (arg.startsWith("-e") && arg.length > 2 || arg.startsWith("--regexp=")) {
      patternCount += 1;
      if (patternCount > 1) {
        return false;
      }
      i += 1;
      continue;
    }
    if (isShellGrepFlagWithValue(arg)) {
      i += 1;
      if (i >= args.length) {
        return false;
      }
      i += 1;
      continue;
    }
    if (regexTest(String.raw`^(?:--glob|--include|--exclude|--exclude-dir)=`, arg)) {
      i += 1;
      continue;
    }
    if (arg.startsWith("-")) {
      if (isUnsafeShellGrepFlag(arg) || !isSafeShellGrepFlag(command, arg)) {
        return false;
      }
      i += 1;
      continue;
    }
    if (isSavedToolOutputPath(arg)) {
      return false;
    }
    if (patternCount === 0) {
      patternCount += 1;
    }
    i += 1;
  }
  return patternCount === 1;
}
function isShellGrepFlagWithValue(arg) {
  return arg === "-g" || arg === "--glob" || arg === "--include" || arg === "--exclude" || arg === "--exclude-dir";
}
function isSafeShellGrepFlag(command, arg) {
  return (command === "rg" ? regexTest(String.raw`^-[nHiwxEFP]+$`, arg) : regexTest(String.raw`^-[nHiwxErRFP]+$`, arg)) || regexTest(
    String.raw`^(?:--line-number|--with-filename|--no-heading|--ignore-case|--word-regexp|--line-regexp|--recursive|--extended-regexp|--fixed-strings|--perl-regexp|--color=never)$`,
    arg
  );
}
function isUnsafeShellGrepFlag(arg) {
  return arg === "-f" || arg === "--file" || arg.startsWith("--file=") || regexTest(
    String.raw`^(?:--json|--vimgrep|--files|--type-list|--heading|--no-line-number|--no-filename|--count|--count-matches|--files-with(?:out)?-matches|--only-matching|--quiet|--null|--null-data|--text|--binary|--context|--before-context|--after-context|--invert-match|--passthru|--replace|--line-buffered|--color=always)$`,
    arg
  ) || regexTest(String.raw`^-[^-]*[A-CLlcoqvZ0]`, arg);
}
function isSafeStreamingGrepTail(segment) {
  const argsText = stripPrefix(segment, "grep ") ?? stripPrefix(segment, "egrep ") ?? stripPrefix(segment, "fgrep ");
  if (argsText === void 0) {
    return false;
  }
  const args = splitWhitespace(argsText);
  let patternCount = 0;
  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg === "--") {
      return i === args.length - 1;
    }
    if (arg === "-e" || arg === "--regexp") {
      i += 1;
      if (i >= args.length) {
        return false;
      }
      patternCount += 1;
      i += 1;
      continue;
    }
    if (arg.startsWith("-e") && arg.length > 2 || arg.startsWith("--regexp=")) {
      patternCount += 1;
      i += 1;
      continue;
    }
    if (arg === "-f" || arg === "--file" || arg.startsWith("--file=") || regexTest(String.raw`^-[^-]*[cCfFPRrLlmoq]`, arg) || regexTest(
      String.raw`^(?:--(?:count|fixed-strings|perl-regexp|recursive|dereference-recursive|files-with-matches|files-without-match|only-matching|quiet|include|exclude|exclude-dir)|--(?:include|exclude|exclude-dir)=)`,
      arg
    )) {
      return false;
    }
    if (arg.startsWith("-")) {
      i += 1;
      continue;
    }
    patternCount += 1;
    if (patternCount > 1) {
      return false;
    }
    i += 1;
  }
  return patternCount === 1;
}
function isSafeStreamingFlagOnlyTail(segment) {
  const tokens = splitWhitespace(segment);
  const command = tokens[0];
  if (command === void 0) {
    return false;
  }
  if (!(command === "wc" || command === "sort" || command === "uniq" || command === "cut")) {
    return false;
  }
  const args = tokens.slice(1);
  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg === "--") {
      return i === args.length - 1;
    }
    if (command === "sort" && (arg === "-o" || arg === "--output" || arg.startsWith("--output="))) {
      return false;
    }
    if (command === "cut" && (arg === "-d" || arg === "-f" || arg === "-c" || arg === "-b")) {
      i += 1;
      if (i >= args.length) {
        return false;
      }
      i += 1;
      continue;
    }
    if (!arg.startsWith("-")) {
      return false;
    }
    i += 1;
  }
  return true;
}
function isSavedToolOutputPath(arg) {
  return regexTest(
    String.raw`(?:^|/)(?:\d+-copilot-tool-output-|copilot-tool-output(?:-original)?-|original-output-\d+-)`,
    arg
  );
}
function normalizeSegment(segment) {
  const trimmed = segment.trim();
  const withoutRedirects = regexReplaceAll(String.raw`\s+(?:2>&1|1>&2)\b`, trimmed, "");
  return regexReplaceAll(String.raw`\s+`, withoutRedirects, " ");
}
function replaceSafeCommandSubstitutions(command) {
  if (!regexTest(String.raw`\btools/linter/adapters/clangformat_linter\.py\b`, command)) {
    return command;
  }
  return regexReplaceAll(
    `\\$\\(\\s*git\\s+--no-pager\\s+ls-files(?:\\s+(?:"[^"\`$()]*"|'[^'\`$()]*'|[^'"\`()$;&<>|\\s]+))*\\s*\\)`,
    command,
    "__SAFE_GIT_LS_FILES__"
  );
}
function splitCommandSegments(command) {
  const segments = [];
  let start = 0;
  let inSingle = false;
  let inDouble = false;
  let idx = 0;
  while (idx < command.length) {
    const ch = command[idx];
    const next = idx + 1 < command.length ? command[idx + 1] : void 0;
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
    } else if (ch === '"' && !inSingle && !isEscapedByOddBackslashes(command, idx)) {
      inDouble = !inDouble;
    } else if (!inSingle && !inDouble && (ch === "&" && next === "&" || ch === "|" && next === "|")) {
      pushCommandSegment(segments, command.slice(start, idx));
      start = idx + 2;
      idx += 1;
    } else if (!inSingle && !inDouble && (ch === "\n" || ch === "\r")) {
      pushCommandSegment(segments, command.slice(start, idx));
      let nextStart = idx + 1;
      if (ch === "\r" && next === "\n") {
        idx += 1;
        nextStart += 1;
      }
      start = nextStart;
    }
    idx += 1;
  }
  pushCommandSegment(segments, command.slice(start));
  return segments;
}
function pushCommandSegment(segments, segment) {
  const trimmed = segment.trim();
  if (trimmed.length !== 0) {
    segments.push(trimmed);
  }
}
function stripQuotedText(command) {
  let stripped = "";
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < command.length; i++) {
    const ch = command[i];
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
      stripped += ch;
    } else if (ch === '"' && !inSingle && !isEscapedByOddBackslashes(command, i)) {
      inDouble = !inDouble;
      stripped += ch;
    } else if (inSingle) {
      stripped += " ";
    } else if (inDouble) {
      stripped += ch === "$" || ch === "(" || ch === "`" ? ch : " ";
    } else {
      stripped += ch;
    }
  }
  return stripped;
}
function isEscapedByOddBackslashes(text, index) {
  let count = 0;
  let i = index;
  while (i > 0) {
    i -= 1;
    if (text[i] === "\\") {
      count += 1;
    } else {
      break;
    }
  }
  return count % 2 === 1;
}
function isWhitespaceChar(ch) {
  return /\s/.test(ch);
}
function startsWithWhitespace(line) {
  return line.length > 0 && isWhitespaceChar(line[0]);
}
function stripHeredocBodies(command) {
  const lines = command.split("\n").map((line) => stripSuffix(line, "\r") ?? line);
  const stripped = [];
  const heredocStdinSegmentIndexes = /* @__PURE__ */ new Set();
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const heredoc = parseHeredocOpener(line);
    if (heredoc === void 0) {
      stripped.push(line);
      i += 1;
      continue;
    }
    const commandBeforeHeredoc = lastChainSegment(heredoc.prefix);
    if (regexTest(
      String.raw`^${pythonExecutablePattern()}\s+-$`,
      normalizeSegment(commandBeforeHeredoc)
    )) {
      let commandThroughHeredocOpener = stripped.join("\n");
      if (commandThroughHeredocOpener.length !== 0) {
        commandThroughHeredocOpener += "\n";
      }
      commandThroughHeredocOpener += heredoc.prefix;
      heredocStdinSegmentIndexes.add(
        saturatingSub(splitCommandSegments(commandThroughHeredocOpener).length, 1)
      );
    }
    stripped.push(`${heredoc.prefix} ${heredoc.suffix}`.trimEnd());
    i += 1;
    while (i < lines.length && lines[i].trim() !== heredoc.delimiter) {
      i += 1;
    }
    if (i >= lines.length) {
      return void 0;
    }
    i += 1;
  }
  return {
    command: stripped.join("\n"),
    heredocStdinSegmentIndexes
  };
}
function parseHeredocOpener(line) {
  let inSingle = false;
  let inDouble = false;
  let index = 0;
  while (index + 1 < line.length) {
    const ch = line[index];
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
      index += 1;
      continue;
    }
    if (ch === '"' && !inSingle && !isEscapedByOddBackslashes(line, index)) {
      inDouble = !inDouble;
      index += 1;
      continue;
    }
    if (!inSingle && !inDouble && ch === "#" && (index === 0 || isWhitespaceChar(line[index - 1]))) {
      return void 0;
    }
    if (inSingle || inDouble || ch !== "<" || line[index + 1] !== "<") {
      index += 1;
      continue;
    }
    let cursor = index + 2;
    if (line[cursor] === "-") {
      cursor += 1;
    }
    while (cursor < line.length && isWhitespaceChar(line[cursor])) {
      cursor += 1;
    }
    let delimiter = "";
    const quote = cursor < line.length ? line[cursor] : void 0;
    if (quote === "'" || quote === '"') {
      cursor += 1;
      const start = cursor;
      while (cursor < line.length && line[cursor] !== quote) {
        cursor += 1;
      }
      if (cursor >= line.length) {
        return void 0;
      }
      delimiter += line.slice(start, cursor);
      cursor += 1;
    } else {
      const start = cursor;
      while (cursor < line.length && !isWhitespaceChar(line[cursor])) {
        cursor += 1;
      }
      delimiter += line.slice(start, cursor);
    }
    if (!regexTest(String.raw`^[A-Za-z_][A-Za-z0-9_]*$`, delimiter)) {
      return void 0;
    }
    return {
      prefix: line.slice(0, index),
      suffix: line.slice(cursor),
      delimiter
    };
  }
  return void 0;
}
function lastChainSegment(commandPrefix) {
  const parts = commandPrefix.split(new RegExp(String.raw`\s*(?:&&|\|\||;)\s*`));
  const last = parts.length > 0 ? parts[parts.length - 1] : commandPrefix;
  return last.trim();
}
function hasErrexitBeforeFirstCommand(segments, segmentKinds) {
  let firstNonBenign = segmentKinds.findIndex((kind) => !segmentsEqual(kind, BENIGN_SEGMENT));
  if (firstNonBenign === -1) {
    firstNonBenign = segmentKinds.length;
  }
  return segments.slice(0, firstNonBenign).some((segment) => isSetECommand(segment));
}
function isSetECommand(segment) {
  const normalized = normalizeSegment(segment);
  return regexTest(
    String.raw`^set\s+-(?=[A-Za-z]*e)[A-Za-z]+(?:\s+[-+A-Za-z]+)*$`,
    normalized
  ) || regexTest(String.raw`\s-o\s+errexit\b`, normalized);
}
function commandRunsGoTest(command) {
  return regexTest(
    String.raw`(?:^|[\s;&|(])go\s+test(?:\s|$)`,
    stripQuotedText(command)
  );
}
function commandMentionsSavedToolOutput(command) {
  return splitWhitespace(command).some((token) => isSavedToolOutputPath(token));
}
function looksLikeNpmPackOutput(output) {
  return output.includes("npm notice Tarball Contents") && output.includes("npm notice Tarball Details");
}
function hasDocusaurusProgress(output) {
  return output.split("\n").some((line) => regexTest(String.raw`^\s*\u25CF\s+Client\s+`, line)) && output.split("\n").some((line) => regexTest(String.raw`^\s*[\u25CF\u25EF]\s+Server(?:\s+|$)`, line));
}
function hasPassingGoTestOutput(output) {
  return !hasGoTestFailureOutput(output) && output.split("\n").some((line) => isGoModuleDownloadChatterLine(line));
}
function hasGoTestFailureOutput(output) {
  return regexTest(
    String.raw`(?:^|\n)(?:--- FAIL:|FAIL(?:\s|$)|panic:|fatal error:|\s*Error Trace:|\S+\.go:\d+:|# \S+|diff \S+|--- (?!PASS:)|\+\+\+ |@@ |.*\[(?:build|setup) failed\])`,
    output
  );
}
function pythonExecutablePattern() {
  return String.raw`(?:(?:[A-Za-z0-9_./+-]+/)?(?:python|python3(?:\.\d+)?))`;
}
function pythonWithOptionsPattern() {
  return String.raw`${pythonExecutablePattern()}(?:\s+(?:-[BEsStuUvVqQ]|-W\S+|-X\s+\S+))*`;
}
function compactShellOutput(commandKinds, output, compactGoPassingTestOutput, shellGrepLargeOutputThreshold) {
  const state = { output, lossless: true };
  applyStringCompactor(state, compactCarriageReturnProgress);
  applyStringCompactor(state, compactNeedrestartNoopProgress);
  applyStringCompactor(state, compactGoRuntimePanicDump);
  if (compactGoPassingTestOutput && !commandKinds.includes("go")) {
    applyStringCompactor(state, compactGoOutput);
  }
  applyStringCompactor(state, compactJestRunsProgress);
  applyStringCompactor(state, compactDocusaurusProgress);
  applyStringCompactor(state, compactSphinxProgressFallback);
  if (!commandKinds.includes("npm-pack")) {
    applyStringCompactor(state, compactNpmPackOutput);
  }
  for (const kind of COMMAND_COMPACTOR_ORDER.filter((candidate) => commandKinds.includes(candidate))) {
    const result = compactCommandEntry(kind, state.output, shellGrepLargeOutputThreshold);
    state.output = result.output;
    state.lossless = state.lossless && result.lossless;
  }
  if (state.output === output) {
    return void 0;
  }
  return {
    output: state.output,
    lossless: state.lossless
  };
}
function applyStringCompactor(state, compact2) {
  const next = compact2(state.output);
  if (next !== state.output) {
    state.lossless = false;
  }
  state.output = next;
}
function compactCommandEntry(kind, output, shellGrepLargeOutputThreshold) {
  if (kind === "shell-grep") {
    return compactToolOutput(
      "grep-content",
      output,
      shellGrepLargeOutputThreshold
    ) ?? unchanged(output);
  }
  const original = output;
  let result;
  switch (kind) {
    case "pip": {
      let next = applyPythonBuildNoise(output);
      next = compactGitProgress(next);
      next = compactPackageManagerOperations(next);
      next = compactPythonNinjaBuildProgress(next);
      result = compactPipInstallProgress(next);
      break;
    }
    case "python-build": {
      let next = applyPythonBuildNoise(output);
      next = compactGitProgress(next);
      next = compactSetuptoolsFileStagingRuns(next);
      next = compactPythonNinjaBuildProgress(next);
      result = compactPipInstallProgress(next);
      break;
    }
    case "pytest": {
      let next = compactPythonEcosystemNoise(output);
      next = compactPytestProgress(next);
      next = compactPytestFailureBlocks(next);
      next = compactPytestWarningsSummary(next);
      next = compactPytestSessionMetadata(next);
      next = compactSphinxProgress(next);
      result = compactRepeatedDiagnosticBlocks(next);
      break;
    }
    case "python-build-ext": {
      let next = applyPythonBuildNoise(output);
      next = compactPythonNinjaBuildProgress(next);
      next = compactPythonBuildExtProgress(next);
      next = compactSphinxProgress(next);
      result = compactRepeatedDiagnosticBlocks(next);
      break;
    }
    case "django-test": {
      let next = compactPythonEcosystemNoise(output);
      next = compactDjangoTestBoilerplate(next);
      next = compactDjangoTestProgress(next);
      next = compactPytestWarningsSummary(next);
      next = compactSphinxProgress(next);
      result = compactRepeatedDiagnosticBlocks(next);
      break;
    }
    case "python-script": {
      let next = applyPythonBuildNoise(output);
      next = compactSphinxProgress(next);
      result = compactRepeatedDiagnosticBlocks(next);
      break;
    }
    case "apt":
      result = compactAptOutput(output);
      break;
    case "npm":
      result = compactNpmOutput(output);
      break;
    case "npm-pack":
      result = compactNpmPackOutput(output);
      break;
    case "yarn-berry":
      result = compactYarnBerryOutput(output);
      break;
    case "pnpm":
      result = compactPnpmOutput(output);
      break;
    case "composer":
    case "poetry":
      result = compactPackageManagerOperations(output);
      break;
    case "uv":
      result = compactUvProgress(compactPackageManagerOperations(output));
      break;
    case "maven":
      result = compactMavenOutput(output);
      break;
    case "dotnet":
      result = compactDotnetTimingProgress(output);
      break;
    case "go":
      result = compactGoCommandOutput(output);
      break;
    case "unittest":
      result = compactUnittestOutput(output);
      break;
    case "js-test":
      result = compactJsTestOutput(output);
      break;
    case "cargo":
      result = compactCargoProgress(output);
      break;
    case "node":
      result = compactRepeatedNodeWarnings(output);
      break;
    case "git":
      result = compactGitProgress(output);
      break;
    case "git-clean":
      result = compactGitCleanRemovingRuns(output);
      break;
    case "nx":
      result = compactNxLernaFrameProgress(output);
      break;
    case "golangci-lint":
      result = compactGolangciLintOutput(output, false);
      break;
    case "clang-format-linter":
      result = compactClangFormatLinterOutput(output);
      break;
    case "gradle":
      result = compactGradleOutput(output);
      break;
    case "cmake":
      result = compactCmakeConfigureProbeRuns(output);
      break;
    case "make":
      result = compactMakeOutput(output);
      break;
    default:
      result = output;
      break;
  }
  return stringCompactionResult(original, result);
}
function stringCompactionResult(original, output) {
  const lossless = output === original;
  return { output, lossless };
}
function applyPythonBuildNoise(output) {
  let next = compactSetuptoolsDeprecationBlocks(output);
  next = compactCythonPerformanceHints(next);
  next = compactCompilerWarningRuns(next);
  next = compactPythonEcosystemNoise(next);
  return compactNumpyDistutilsProbes(next);
}
function compactGoCommandOutput(output) {
  return compactRepeatedDiagnosticBlocks(compactGoOutput(output));
}
function compactMavenOutput(output) {
  return compactMavenInfoBoilerplate(compactMavenPassingTests(
    compactMavenDependencyTransfer(output)
  ));
}
function compactPythonEcosystemNoise(output) {
  return omitNonDiagnosticLines(
    output,
    "python ecosystem noise",
    isPythonEcosystemNoiseLine
  );
}
function compactPipInstallProgress(output) {
  return omitNonDiagnosticLines(output, "pip install progress", isPipInstallProgressLine);
}
function compactPythonNinjaBuildProgress(output) {
  return omitNonDiagnosticLines(
    output,
    "python ninja build progress",
    isPythonNinjaBuildProgressLine
  );
}
function compactPythonBuildExtProgress(output) {
  return omitNonDiagnosticLines(
    output,
    "python build_ext progress",
    isPythonBuildExtProgressLine
  );
}
function compactSphinxProgressFallback(output) {
  if (hasSphinxProgress(output)) {
    return compactSphinxProgress(output);
  }
  return output;
}
function compactPytestSessionMetadata(output) {
  return omitNonDiagnosticLines(
    output,
    "pytest session metadata",
    isPytestSessionMetadataLine
  );
}
function compactDjangoTestBoilerplate(output) {
  return omitNonDiagnosticLines(output, "django test boilerplate", isDjangoTestBoilerplateLine);
}
function compactDjangoTestProgress(output) {
  return omitNonDiagnosticLines(output, "django test progress", isDjangoTestProgressLine);
}
function compactClangFormatLinterOutput(output) {
  return omitNonDiagnosticLines(output, "clang-format debug", isClangFormatDebugLine);
}
function compactDotnetTimingProgress(output) {
  const compacted = [];
  const bufferedProgress = [];
  const timing = { count: 0 };
  for (const line of output.split("\n")) {
    if (line.trim().length === 0 || isDotnetStandaloneTimingLine(line)) {
      bufferedProgress.push(line);
      if (isDotnetStandaloneTimingLine(line)) {
        timing.count += 1;
      }
      continue;
    }
    flushDotnetTimingProgress(compacted, bufferedProgress, timing);
    compacted.push(line);
  }
  flushDotnetTimingProgress(compacted, bufferedProgress, timing);
  return compacted.join("\n");
}
function flushDotnetTimingProgress(compacted, bufferedProgress, timing) {
  if (timing.count >= 3) {
    compacted.push(`[dotnet timing progress: omitted ${timing.count} timing line(s)]`);
  } else {
    for (const line of bufferedProgress) {
      compacted.push(line);
    }
  }
  bufferedProgress.length = 0;
  timing.count = 0;
}
function isDotnetStandaloneTimingLine(line) {
  return regexTest(String.raw`^\s*\(\d+(?:\.\d+)?s\)\s*$`, line);
}
function compactGitCleanRemovingRuns(output) {
  return collapseContiguousRuns(output, isGitCleanRemovingLine, 16, (block) => {
    const keptStart = block.slice(0, Math.min(5, block.length));
    const keptEndStart = saturatingSub(block.length, 5);
    const keptEnd = block.slice(keptEndStart);
    const omitted = saturatingSub(block.length, keptStart.length + keptEnd.length);
    if (omitted === 0) {
      return void 0;
    }
    const lines = [...keptStart];
    lines.push(`[git clean: omitted ${omitted} Removing line(s)]`);
    lines.push(...keptEnd);
    return lines.join("\n");
  });
}
function isGitCleanRemovingLine(line) {
  return regexTest(String.raw`^Removing \S+`, line);
}
function collapseContiguousRuns(output, isMember, minRun, summarize) {
  const lines = output.split("\n");
  const compacted = [];
  let i = 0;
  while (i < lines.length) {
    if (!isMember(lines[i])) {
      compacted.push(lines[i]);
      i += 1;
      continue;
    }
    const start = i;
    while (i < lines.length && isMember(lines[i])) {
      i += 1;
    }
    const block = lines.slice(start, i);
    const summary = block.length >= minRun ? summarize(block) : void 0;
    if (summary !== void 0) {
      compacted.push(summary);
    } else {
      compacted.push(...block);
    }
  }
  return compacted.join("\n");
}
function collapseRunsWithExamples(output, isMember, example, summarize) {
  return collapseContiguousRuns(output, isMember, 5, (block) => {
    const examples = [];
    for (const line of block) {
      const ex = example(line);
      if (ex !== void 0) {
        examples.push(ex);
      }
    }
    if (examples.length !== block.length) {
      return void 0;
    }
    return summarize(
      block.length,
      summarizeWithMore(uniqueStrings(examples), 10)
    );
  });
}
function compactRepeatedNodeWarnings(output) {
  const seen = [];
  return omitMatchingLines(
    output,
    "node warnings",
    (line) => {
      const key = getNodeWarningKey(line);
      if (key === void 0) {
        return false;
      }
      if (seen.includes(key)) {
        return true;
      }
      seen.push(key);
      return false;
    },
    "repeated warning"
  );
}
function getNodeWarningKey(line) {
  if (regexTest(
    String.raw`^\(node:\d+\) (?:\[[A-Z0-9_-]+\] )?(?:ExperimentalWarning|DeprecationWarning|Warning): `,
    line
  )) {
    return regexReplaceAll(String.raw`^\(node:\d+\)`, line, "(node)");
  }
  if (line.startsWith("(Use `node --trace-warnings") || line.startsWith("(Use `node --trace-deprecation")) {
    return line;
  }
  return void 0;
}
function omitMatchingLines(output, label, shouldOmit, summarySuffix) {
  const compacted = [];
  const omitted = { count: 0 };
  for (const line of output.split("\n")) {
    if (shouldOmit(line)) {
      omitted.count += 1;
    } else {
      flushOmittedLines(compacted, label, omitted, summarySuffix);
      compacted.push(line);
    }
  }
  flushOmittedLines(compacted, label, omitted, summarySuffix);
  return compacted.join("\n");
}
function omitNonDiagnosticLines(output, label, shouldOmit) {
  return omitMatchingLines(output, label, shouldOmit, "non-diagnostic");
}
function flushOmittedLines(compacted, label, omitted, summarySuffix) {
  if (omitted.count > 0) {
    compacted.push(`[${label}: omitted ${omitted.count} ${summarySuffix} line(s)]`);
    omitted.count = 0;
  }
}
function compactPackageManagerOperations(output) {
  if (!hasPackageManagerOperations(output)) {
    return output;
  }
  return collapseRunsWithExamples(
    output,
    isPackageManagerOperationLine,
    packageManagerOperationExample,
    (len, examples) => `[package operations: omitted ${len} row(s); examples: ${examples}]`
  );
}
function hasPackageManagerOperations(output) {
  const hasMarker = output.includes("Installing dependencies from lock file") || output.includes("Lock file operations:") || output.includes("Package operations:") || output.includes("Writing lock file") || output.includes("Generating autoload files") || output.includes("Lock file is up to date");
  return hasMarker && output.split("\n").some((line) => isPackageManagerOperationLine(line));
}
function isPackageManagerOperationLine(line) {
  if (regexTestWithFlags(String.raw`(?:Failed|Error|Exception|Traceback|fatal)`, line, "i")) {
    return false;
  }
  return parsePackageManagerOperation(line) !== void 0;
}
function packageManagerOperationExample(line) {
  const parsed = parsePackageManagerOperation(line);
  if (parsed === void 0) {
    return void 0;
  }
  return parsed.version !== void 0 ? `${parsed.pkg} (${parsed.version})` : parsed.pkg;
}
function parsePackageManagerOperation(line) {
  const restAfterDash = stripPrefix(line, "  - ");
  if (restAfterDash === void 0) {
    return void 0;
  }
  const operationSplit = splitOnce(restAfterDash, " ");
  if (operationSplit === void 0) {
    return void 0;
  }
  const operation = operationSplit[0];
  let rest = operationSplit[1];
  if (!["Installing", "Locking", "Updating", "Removing", "Downloading"].includes(operation)) {
    return void 0;
  }
  const packageSplit = splitOnce(rest, " ");
  let pkg;
  if (packageSplit === void 0) {
    pkg = rest;
    rest = "";
  } else {
    pkg = packageSplit[0];
    rest = packageSplit[1];
  }
  if (pkg.length === 0) {
    return void 0;
  }
  if (rest.length === 0) {
    return { operation, pkg, version: void 0 };
  }
  const afterOpen = stripPrefix(rest, "(");
  if (afterOpen !== void 0) {
    const closeSplit = splitOnce(afterOpen, ")");
    if (closeSplit !== void 0) {
      const version = closeSplit[0];
      const afterClose = closeSplit[1];
      if (afterClose.length === 0 || afterClose.startsWith(": ")) {
        return { operation, pkg, version };
      }
    }
  }
  if (rest.startsWith(": ")) {
    return { operation, pkg, version: void 0 };
  }
  return void 0;
}
function uniqueStrings(items) {
  const unique = [];
  for (const item of items) {
    if (!unique.includes(item)) {
      unique.push(item);
    }
  }
  return unique;
}
function summarizeWithMore(items, maxItems) {
  const shown = items.slice(0, maxItems);
  const omitted = saturatingSub(items.length, shown.length);
  if (omitted > 0) {
    return `${shown.join(", ")}, ... +${omitted} more`;
  }
  return shown.join(", ");
}
function compactNpmPackOutput(output) {
  if (!looksLikeNpmPackOutput(output)) {
    return output;
  }
  const compacted = [];
  let inTarballContents = false;
  const omittedFileRows = { count: 0 };
  for (const line of output.split("\n")) {
    const normalizedLine = stripNpmSpinnerPrefix(line);
    if (normalizedLine === "npm notice Tarball Contents") {
      inTarballContents = true;
      compacted.push(line);
      continue;
    }
    if (normalizedLine === "npm notice Tarball Details") {
      flushNpmPackOmitted(compacted, omittedFileRows);
      inTarballContents = false;
      compacted.push(line);
      continue;
    }
    if (inTarballContents && isNpmPackFileListingLine(normalizedLine)) {
      omittedFileRows.count += 1;
      continue;
    }
    compacted.push(line);
  }
  flushNpmPackOmitted(compacted, omittedFileRows);
  return compacted.join("\n");
}
function flushNpmPackOmitted(compacted, omittedFileRows) {
  if (omittedFileRows.count > 0) {
    compacted.push(`[npm pack tarball contents: omitted ${omittedFileRows.count} file listing line(s)]`);
    omittedFileRows.count = 0;
  }
}
function isNpmPackFileListingLine(line) {
  const rest0 = stripPrefix(line, "npm notice ");
  if (rest0 === void 0) {
    return false;
  }
  let numberEnd = rest0.length;
  for (let i = 0; i < rest0.length; i++) {
    const ch = rest0[i];
    if (!isAsciiDigit(ch) && ch !== ".") {
      numberEnd = i;
      break;
    }
  }
  if (numberEnd === 0 || !isDecimalNumber(rest0.slice(0, numberEnd))) {
    return false;
  }
  const rest = rest0.slice(numberEnd).trimStart();
  return ["B", "kB", "MB", "GB"].some((unit) => {
    const value = stripPrefix(rest, unit);
    return value !== void 0 && value.startsWith(" ");
  });
}
function stripNpmSpinnerPrefix(line) {
  const trimmed = trimStartMatchesChars(line, ["|", "/", "-"]);
  if (trimmed.startsWith("npm notice ")) {
    return trimmed;
  }
  return line;
}
function isDecimalNumber(value) {
  if (value.length === 0) {
    return false;
  }
  let hasDigit = false;
  let dotCount = 0;
  for (const ch of value) {
    if (isAsciiDigit(ch)) {
      hasDigit = true;
    } else if (ch === ".") {
      dotCount += 1;
    } else {
      return false;
    }
  }
  return dotCount <= 1 && hasDigit;
}
function compactGoOutput(output) {
  const compacted = [];
  const downloadCount = { count: 0 };
  for (const line of output.split("\n")) {
    if (isGoModuleDownloadChatterLine(line)) {
      downloadCount.count += 1;
    } else {
      flushGoDownloads(compacted, downloadCount);
      compacted.push(line);
    }
  }
  flushGoDownloads(compacted, downloadCount);
  return compacted.join("\n");
}
function flushGoDownloads(compacted, downloadCount) {
  if (downloadCount.count > 0) {
    compacted.push(`[go test: omitted ${downloadCount.count} dependency download line(s)]`);
    downloadCount.count = 0;
  }
}
function isGoModuleDownloadChatterLine(line) {
  if (isDiagnosticLine(line)) {
    return false;
  }
  return line.startsWith("go: downloading ") || line.startsWith("go: finding module for package ") || line.startsWith("go: extracting ") || line.startsWith("go: found ") && line.includes(" in ");
}
function compactRepeatedDiagnosticBlocks(output) {
  const lines = output.split("\n");
  const diagnosticLines = lines.map((line) => isDiagnosticLine(line));
  const compacted = [];
  let i = 0;
  while (i < lines.length) {
    const repeatedBlock = findRepeatedDiagnosticBlock(lines, diagnosticLines, i);
    if (repeatedBlock === void 0) {
      compacted.push(lines[i]);
      i += 1;
      continue;
    }
    compacted.push(...lines.slice(i, i + repeatedBlock.lineCount));
    compacted.push(
      `[repeated diagnostic block: previous ${repeatedBlock.lineCount} line(s) repeated ${repeatedBlock.repetitions} more time(s)]`
    );
    i += repeatedBlock.lineCount * (repeatedBlock.repetitions + 1);
  }
  return compacted.join("\n");
}
function findRepeatedDiagnosticBlock(lines, diagnosticLines, start) {
  for (let lineCount = 6; lineCount >= 2; lineCount--) {
    if (start + lineCount * 2 > lines.length) {
      continue;
    }
    if (!diagnosticLines.slice(start, start + lineCount).some((isDiagnostic) => isDiagnostic)) {
      continue;
    }
    let repetitions = 0;
    while (start + (repetitions + 2) * lineCount <= lines.length) {
      const offset = start + (repetitions + 1) * lineCount;
      if (!arraySliceEqual(lines, start, offset, lineCount)) {
        break;
      }
      repetitions += 1;
    }
    if (repetitions > 0) {
      return { lineCount, repetitions };
    }
  }
  return void 0;
}
function isDiagnosticLine(line) {
  return regexTestWithFlags(
    String.raw`(?:\u2715|\u2717|\u00D7)|\b(?:error|warning|warn|fatal|failed|failure|traceback|exception|panic|assertion|aborted|abort trap|segmentation fault|core dumped)\b|npm ERR!|^E:|^W:|^FAIL\b`,
    line,
    "i"
  );
}
function compactCargoProgress(output) {
  if (!hasCargoProgressOutput(output)) {
    return output;
  }
  return omitMatchingLines(output, "cargo progress", isCargoProgressLine, "progress");
}
function hasCargoProgressOutput(output) {
  return !hasCargoFailure(output) && hasCargoTerminalSummary(output) && hasCargoProgressEvidence(output);
}
function hasCargoProgressEvidence(output) {
  return output.split("\n").some((line) => {
    const trimmed = line.trimStart();
    return CARGO_PROGRESS_PREFIXES.some((prefix) => trimmed.startsWith(prefix));
  });
}
function isCargoProgressLine(line) {
  if (isDiagnosticLine(line)) {
    return false;
  }
  const trimmed = line.trimStart();
  return CARGO_PROGRESS_PREFIXES.some((prefix) => trimmed.startsWith(prefix));
}
function hasCargoFailure(output) {
  return output.split("\n").some((line) => {
    const trimmed = line.trimStart();
    return trimmed.startsWith("error:") || trimmed.startsWith("error[") || trimmed.startsWith("test result: FAILED") || trimmed.startsWith("failures:");
  });
}
function hasCargoTerminalSummary(output) {
  return output.split("\n").some((line) => {
    const trimmed = line.trimStart();
    return trimmed.startsWith("Finished ") && trimmed.includes(" target(s) in") || trimmed.startsWith("test result: ok.");
  });
}
function compactUnittestOutput(output) {
  if (hasPassingUnittestSummary(output)) {
    return omitNonDiagnosticLines(
      output,
      "unittest progress",
      isUnittestSuccessProgressLine
    );
  }
  return output;
}
function hasPassingUnittestSummary(output) {
  return regexTest(
    String.raw`(?:^|\n)Ran \d+ tests? in \d+(?:\.\d+)?s\s*(?:\n|$)`,
    output
  ) && regexTest(String.raw`(?:^|\n)OK(?:\s+\([^)]+\))?\s*(?:\n|$)`, output) && !regexTestWithFlags(
    String.raw`(?:^|\n)(?:FAILED|ERROR|FAIL):|\b(?:failures?|errors?)=\d*[1-9]\d*`,
    output,
    "i"
  );
}
function isUnittestSuccessProgressLine(line) {
  if (isDiagnosticLine(line)) {
    return false;
  }
  const allDashes = [...line].every((ch) => ch === "-") && byteLength(line) >= 20;
  const allProgressChars = line.length > 0 && [...line].every((ch) => ".sSxXuUbB".includes(ch));
  const testLine = regexTest(String.raw`^test_\S+ \([^)]+\) \.\.\. ok$`, line);
  return allDashes || allProgressChars || testLine;
}
function isClangFormatDebugLine(line) {
  return regexTest(String.raw`^<Thread_\d+:DEBUG> (?:\$ .+|took \d+ms)$`, line);
}
function compactCmakeConfigureProbeRuns(output) {
  return collapseContiguousRuns(
    output,
    isCmakeConfigureProbeLine,
    8,
    (block) => `[cmake configure: omitted ${block.length} status probe line(s)]`
  );
}
function isCmakeConfigureProbeLine(line) {
  if (!line.startsWith("-- ") || regexTest(
    String.raw`^-- (?:Configuring done|Generating done|Build files have been written to:)`,
    line
  )) {
    return false;
  }
  return regexTest(String.raw`^-- Performing Test \S+(?: - Success)?$`, line) || isCmakeLookingForProbeLine(line) || regexTest(String.raw`^-- Detecting .+(?: - done)?$`, line) || regexTest(String.raw`^-- Check(?:ing)? .+(?: - done)?$`, line) || regexTest(
    String.raw`^-- Check for working \S+ compiler: .+(?: - (?:skipped|works))?$`,
    line
  );
}
function isCmakeLookingForProbeLine(line) {
  return !line.endsWith(" - not found") && regexTest(String.raw`^-- Looking for .+(?: - found)?$`, line);
}
function compactMavenDependencyTransfer(output) {
  if (!hasMavenDependencyTransfer(output)) {
    return output;
  }
  return collapseRunsWithExamples(
    output,
    isMavenDependencyTransferLine,
    mavenDependencyTransferExample,
    (len, examples) => `[maven dependency transfer: omitted ${len} row(s); examples: ${examples}]`
  );
}
function compactMavenPassingTests(output) {
  if (!hasMavenPassingTests(output)) {
    return output;
  }
  return collapseRunsWithExamples(
    output,
    isMavenPassingTestLine,
    mavenPassingTestExample,
    (len, examples) => `[maven test summary: omitted ${len} passing class row(s); examples: ${examples}]`
  );
}
function compactMavenInfoBoilerplate(output) {
  if (!hasMavenInfoBoilerplate(output)) {
    return output;
  }
  return omitMatchingLines(
    output,
    "maven boilerplate",
    isMavenInfoBoilerplateLine,
    "boilerplate"
  );
}
function hasMavenDependencyTransfer(output) {
  return isMavenOutput(output) && output.split("\n").some((line) => line.startsWith("[INFO] Downloading from ") || line.startsWith("[INFO] Downloaded from "));
}
function hasMavenPassingTests(output) {
  return isMavenOutput(output) && output.split("\n").some((line) => line.startsWith("[INFO] Tests run: ") && line.includes(", Failures: 0, Errors: 0, Skipped: "));
}
function hasMavenInfoBoilerplate(output) {
  return isMavenOutput(output) && output.split("\n").some((line) => isMavenInfoBoilerplateLine(line));
}
function isMavenOutput(output) {
  return output.split("\n").some((line) => line.startsWith("[INFO] Scanning for projects...") || line.startsWith("[INFO] BUILD SUCCESS") || line.startsWith("[INFO] BUILD FAILURE") || line.startsWith("[INFO] Reactor Build Order:") || line.startsWith("[INFO] Total time:"));
}
function isMavenDependencyTransferLine(line) {
  return regexTest(
    String.raw`^\[INFO\] (?:Downloading|Downloaded) from \S+: https?://\S+(?: \([^)]+\))?$`,
    line
  );
}
function mavenDependencyTransferExample(line) {
  const split = rsplitOnce(line, " (");
  const withoutSize = split !== void 0 ? split[0] : line;
  const parts = withoutSize.split("/");
  if (parts.length < 3) {
    return void 0;
  }
  const version = parts[parts.length - 2];
  const name = parts[parts.length - 3];
  return `${name} ${version}`;
}
function isMavenPassingTestLine(line) {
  return regexTest(
    String.raw`^\[INFO\] Tests run: \d+, Failures: 0, Errors: 0, Skipped: \d+, Time elapsed: \S+\s+s(?:\s+(?:--|-)\s+in\s+\S+)?$`,
    line
  );
}
function mavenPassingTestExample(line) {
  return regexCaptureFirst(String.raw`\s(?:--|-)\s+in\s+(\S+)$`, line) ?? "summary";
}
function isMavenInfoBoilerplateLine(line) {
  const trimmed = line.trimEnd();
  return trimmed === "[INFO]" || regexTest(String.raw`^\[INFO\] -{20,}\s*$`, trimmed) || regexTest(String.raw`^\[INFO\] -{20,}\[\s*\S+\s*\]-{20,}\s*$`, trimmed) || regexTest(String.raw`^\[INFO\] -{2,}<\s*[^>\n]+\s*>-{2,}\s*$`, trimmed) || regexTest(String.raw`^\[INFO\] Building .+ \[\d+/\d+\]\s*$`, trimmed) || regexTest(
    String.raw`^\[INFO\] --- \S+(?::\S+)+ (?:\([^)]+\) )?@ \S+ ---\s*$`,
    trimmed
  );
}
function compactGolangciLintOutput(output, requireMarker) {
  if (requireMarker && !hasGolangciLintMarker(output)) {
    return output;
  }
  return omitNonDiagnosticLines(
    output,
    "golangci-lint progress",
    isGolangciLintOmittableLine
  );
}
function hasGolangciLintMarker(output) {
  return output.split("\n").some((line) => regexTest(
    String.raw`^(?:go run github\.com/golangci/golangci-lint/cmd/golangci-lint(?:@\S+)?|(?:[A-Za-z0-9_./+-]+/)?golangci-lint)\s+run\b`,
    line
  )) || (output.includes("level=info") || output.includes("INFO")) && output.split("\n").some((line) => regexTest(String.raw`^(?:level=info\b|INFO\b)`, line)) && output.split("\n").some((line) => hasGolangciLintSafeInfoPrefix(line));
}
function isGolangciLintOmittableLine(line) {
  if (isDiagnosticLine(line)) {
    return false;
  }
  return isGoModuleDownloadChatterLine(line) || regexTest(String.raw`^(?:level=info\b|INFO\b)`, line) && hasGolangciLintSafeInfoPrefix(line);
}
function hasGolangciLintSafeInfoPrefix(line) {
  return regexTest(
    String.raw`\[(?:config_reader|lintersdb|loader|runner|linters_context|filename_unadjuster|uniq_by_line|source_code)\b`,
    line
  );
}
function compactGitProgress(output) {
  const lines = output.split("\n").map((line) => compactGitProgressLine(line));
  const compacted = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const progressKey = getGitProgressLineKey(line.output);
    if (progressKey === void 0) {
      pushCompactedLine(compacted, line);
      i += 1;
      continue;
    }
    let j = i + 1;
    while (j < lines.length && getGitProgressLineKey(lines[j].output) === progressKey) {
      j += 1;
    }
    const omittedLines = j - i - 1;
    if (omittedLines > 0) {
      compacted.push(`[git progress: omitted ${omittedLines} earlier ${progressKey} line(s)]`);
      compacted.push(lines[j - 1].output);
    } else {
      pushCompactedLine(compacted, line);
    }
    i = j;
  }
  return compacted.join("\n");
}
function unchangedLine(line) {
  return { output: line, omittedFrames: 0 };
}
function pushCompactedLine(compacted, line) {
  if (line.omittedFrames > 0) {
    compacted.push(`[git progress: omitted ${line.omittedFrames} earlier frame(s)]`);
  }
  compacted.push(line.output);
}
function compactGitProgressLine(line) {
  return compactProgressPatternsUnlessDiagnostic(
    line,
    [
      String.raw`(?:remote: )?(?:Enumerating|Counting|Compressing) objects:\s+\d+%[^)]*\(\d+/\d+\)(?:, done\.)?`,
      String.raw`(?:remote: )?Receiving objects:\s+\d+%[^)]*\(\d+/\d+\)(?:, [^)]*)?`,
      String.raw`(?:remote: )?Resolving deltas:\s+\d+%[^)]*\(\d+/\d+\)(?:, done\.)?`,
      String.raw`(?:remote: )?Writing objects:\s+\d+%[^)]*\(\d+/\d+\)(?:, [^)]*)?`
    ]
  );
}
function compactProgressPatternsUnlessDiagnostic(line, patterns) {
  if (isDiagnosticLine(line)) {
    return unchangedLine(line);
  }
  return compactProgressPatterns(line, patterns);
}
function compactProgressPatterns(line, patterns) {
  let output = line;
  let omittedFrames = 0;
  for (const pattern of patterns) {
    const result = compactRepeatedProgressFrames(output, pattern);
    output = result.output;
    omittedFrames += result.omittedFrames;
  }
  return { output, omittedFrames };
}
function compactRepeatedProgressFrames(line, pattern) {
  const matches = regexFindAll(pattern, line);
  if (matches.length <= 1) {
    return unchangedLine(line);
  }
  const first = matches[0];
  const last = matches[matches.length - 1];
  const output = line.slice(0, first.start) + line.slice(last.start, last.end) + line.slice(last.end);
  return { output, omittedFrames: matches.length - 1 };
}
function getGitProgressLineKey(line) {
  if (isDiagnosticLine(line)) {
    return void 0;
  }
  const stripped = stripPrefix(line, "remote:");
  const normalized = stripped !== void 0 ? stripped.trimStart() : line;
  const split = splitOnce(normalized, ":");
  if (split === void 0) {
    return void 0;
  }
  const key = split[0];
  const rest = split[1];
  if (![
    "Enumerating objects",
    "Counting objects",
    "Compressing objects",
    "Receiving objects",
    "Writing objects",
    "Resolving deltas"
  ].includes(key)) {
    return void 0;
  }
  if (regexTest(String.raw`^\s+\d+%`, rest)) {
    return key;
  }
  return void 0;
}
function compactJsTestOutput(output) {
  let compacted = compactRepeatedNodeWarnings(output);
  compacted = compactJestRunsProgress(compacted);
  if (hasPassingJsTestSummary(compacted)) {
    compacted = omitNonDiagnosticLines(compacted, "js test progress", isJsTestProgressLine);
  }
  return compacted;
}
function compactJestRunsProgress(output) {
  if (!hasJestRunsProgress(output)) {
    return output;
  }
  return omitMatchingLines(
    output,
    "jest runs progress",
    isJestRunsProgressLine,
    "progress"
  );
}
function hasPassingJsTestSummary(output) {
  if (regexTest(String.raw`(?:^|\n)\s*(?:FAIL|\u2717|\u00D7|\u2716)\s`, output) || regexTestWithFlags(String.raw`\b[1-9]\d*\s+failed\b`, output, "i") || regexTest(String.raw`(?:^|\n)\s*\d+\s+failing\b`, output) || regexTest(String.raw`(?:^|\n)\s*not\s+ok\s+\d+\b`, output) || regexTest(String.raw`(?:^|\n)#\s+fail\s+[1-9]\d*\b`, output) || regexTest(String.raw`(?:^|\n)\s*Bail out!`, output) || regexTest(String.raw`(?:^|\n).*ERR!`, output)) {
    return false;
  }
  return regexTestWithFlags(
    String.raw`(?:^|\n)\s*(?:Test Files|Tests?:|Test Suites:)\s+\d+\s+passed\b`,
    output,
    "i"
  ) || regexTest(String.raw`(?:^|\n)\s+\d+\s+passing\b`, output) || regexTest(String.raw`(?:^|\n)#\s+ok\b`, output) || regexTest(String.raw`(?:^|\n)#\s+pass\s+[1-9]\d*\b`, output);
}
function hasJestRunsProgress(output) {
  return output.split("\n").some((line) => regexTest(String.raw`^\s*RUNS\s+\S`, line)) && hasJestSummaryMarker(output);
}
function hasJestSummaryMarker(output) {
  return output.split("\n").some((line) => line.startsWith("Test Suites:") || line.startsWith("Tests:") || line.startsWith("Snapshots:") || line.startsWith("Ran all test suites"));
}
function isJestRunsProgressLine(line) {
  return regexTest(String.raw`^\s*RUNS\s+\S`, line);
}
function isJsTestProgressLine(line) {
  return !isDiagnosticLine(line) && (regexTest(String.raw`^\s*RUN\s+v?\d+\.\d+\.\d+`, line) || regexTest(String.raw`^\s*(?:\u2713|\u2714|\u221A)\s+.+(?:\s+\d+ms|\s+\(\d+(?:ms|s)\))$`, line) || regexTest(String.raw`^\s*PASS\s+.+$`, line) || regexTest(String.raw`^\s*ok\s+\d+\b`, line) || regexTest(String.raw`^[.]+(?:\s+\[\s*\d+%\])?\s*$`, line));
}
function compactGradleOutput(output) {
  const compacted = compactIntralineProgress(
    output,
    "gradle rich-console progress",
    compactGradleProgressFrames
  );
  return omitNonDiagnosticLines(compacted, "gradle boilerplate", isGradleBoilerplateLine);
}
function compactIntralineProgress(output, label, compactLine) {
  let omittedFrames = 0;
  const compacted = output.split("\n").map((line) => {
    const result = compactLine(line);
    omittedFrames += result.omittedFrames;
    return result.output;
  }).join("\n");
  if (omittedFrames === 0) {
    return output;
  }
  return `[${label}: omitted ${omittedFrames} earlier frame(s)]
${compacted}`;
}
function compactGradleProgressFrames(line) {
  if (isDiagnosticLine(line)) {
    return unchangedLine(line);
  }
  const matches = regexFindAll(
    String.raw`(?:<[-=]+>|\u2502[^\u2502\n]+\u2502)\s+\d+%\s+(?:INITIALIZING|CONFIGURING|EXECUTING|WAITING)\s+\[[^\]\n]+\]`,
    line
  );
  if (matches.length <= 1) {
    return unchangedLine(line);
  }
  let output = "";
  let cursor = 0;
  let omittedFrames = 0;
  let start = 0;
  while (start < matches.length) {
    let end = start;
    while (end + 1 < matches.length && isGradleProgressFrameSeparator(line, matches[end], matches[end + 1])) {
      end += 1;
    }
    const startRange = matches[start];
    const endRange = matches[end];
    if (end > start) {
      output += line.slice(cursor, startRange.start);
      output += line.slice(endRange.start, endRange.end);
      omittedFrames += end - start;
    } else {
      output += line.slice(cursor, endRange.end);
    }
    cursor = endRange.end;
    start = end + 1;
  }
  output += line.slice(cursor);
  return { output, omittedFrames };
}
function isGradleProgressFrameSeparator(line, previous, next) {
  const separator = line.slice(previous.end, next.start);
  if (separator.length === 0) {
    return true;
  }
  for (let i = 0; i < separator.length; i += 6) {
    if (separator.slice(i, i + 6) !== "> IDLE") {
      return false;
    }
  }
  return true;
}
function isGradleBoilerplateLine(line) {
  return line.startsWith("Consider enabling configuration cache to speed up this build: https://docs.gradle.org/") && line.endsWith("/userguide/configuration_cache_enabling.html") || line === "> Run with --stacktrace option to get the stack trace." || line === "> Run with --info or --debug option to get more log output." || line === "> Run with --scan to get full insights from a Build Scan (powered by Develocity)." || line === "> Get more help at https://help.gradle.org.";
}
function compactUvProgress(output) {
  if (!(hasUvSummaryMarker(output) && output.split("\n").some((line) => isUvProgressLine(line)))) {
    return output;
  }
  const compacted = collapseContiguousRuns(output, isUvProgressLine, 4, (block) => {
    const examples = [];
    for (const line of block) {
      const example = uvProgressExample(line);
      if (example !== void 0) {
        examples.push(example);
      }
    }
    if (examples.length !== block.length) {
      return void 0;
    }
    const activityList = [];
    for (const line of block) {
      const activity = uvProgressActivity(line);
      if (activity !== void 0) {
        activityList.push(activity);
      }
    }
    const activities = uniqueStrings(activityList);
    const activitySummary = activities.length === 0 ? "" : `; active: ${summarizeWithMore(activities, 5)}`;
    return `[uv progress: omitted ${block.length} row(s); examples: ${summarizeWithMore(uniqueStrings(examples), 10)}${activitySummary}]`;
  });
  return compacted.replace(/\n+$/, "");
}
function hasUvSummaryMarker(output) {
  return output.split("\n").some((line) => line.startsWith("Using CPython ") && line.includes(" interpreter at:") || regexTest(String.raw`^(?:Resolved|Prepared|Installed|Audited) \d+ packages? in \S+`, line));
}
function isUvProgressLine(line) {
  const normalized = stripAnsi(line).trim();
  if (isDiagnosticLine(normalized)) {
    return false;
  }
  return regexTest(
    String.raw`^[\u2801-\u28FF]\s+(?:Resolving dependencies|Preparing packages|Installing packages|Building|Downloading)\b`,
    normalized
  ) || regexTest(
    String.raw`^[A-Za-z0-9_.-]+\s+-{10,}\s+\d+(?:\.\d+)?\s*(?:B|KiB|MiB|GiB|KB|MB|GB)/\d+(?:\.\d+)?\s*(?:B|KiB|MiB|GiB|KB|MB|GB)(?:\s+.+)?$`,
    normalized
  );
}
function uvProgressExample(line) {
  const normalized = stripAnsi(line).trim();
  const pkg = regexCaptureFirst(String.raw`^([A-Za-z0-9_.-]+)\s+-{10,}`, normalized);
  if (pkg !== void 0) {
    return pkg;
  }
  const firstCodePoint = normalized.codePointAt(0);
  if (firstCodePoint === void 0) {
    return void 0;
  }
  const firstChar = String.fromCodePoint(firstCodePoint);
  if (!(firstChar >= "\u2801" && firstChar <= "\u28FF")) {
    return void 0;
  }
  const withoutSpinner = normalized.slice(firstChar.length).trimStart();
  const dotsIndex = withoutSpinner.indexOf("...");
  const spacesIndex = withoutSpinner.indexOf("  ");
  const candidates = [dotsIndex, spacesIndex].filter((index) => index !== -1);
  const end = candidates.length > 0 ? Math.min(...candidates) : withoutSpinner.length;
  return withoutSpinner.slice(0, end).trim();
}
function uvProgressActivity(line) {
  return regexCaptureFirst(
    String.raw`\s{2,}((?:Building|Downloading|Installing) .+)$`,
    stripAnsi(line).trim()
  );
}
function stripAnsi(text) {
  let output = "";
  const chars = Array.from(text);
  let i = 0;
  while (i < chars.length) {
    const ch = chars[i];
    i += 1;
    if (ch !== "\x1B" || chars[i] !== "[") {
      output += ch;
      continue;
    }
    i += 1;
    while (i < chars.length) {
      const next = chars[i];
      i += 1;
      if (next >= "@" && next <= "~") {
        break;
      }
    }
  }
  return output;
}
function compactNxLernaFrameProgress(output) {
  if (!hasNxLernaFrameProgress(output)) {
    return output;
  }
  const canOmitStaticTaskTable = output.split("\n").some((line) => regexTest(String.raw`^\s*NX\s+Successfully ran target\b`, line));
  const compacted = [];
  const omitted = { count: 0 };
  for (const line of output.split("\n")) {
    if (isNxLernaFrameNoiseLine(line, canOmitStaticTaskTable)) {
      omitted.count += 1;
      continue;
    }
    if (line.trim().length === 0 && omitted.count > 0) {
      continue;
    }
    flushNxLernaOmitted(compacted, omitted);
    compacted.push(line);
  }
  flushNxLernaOmitted(compacted, omitted);
  return compacted.join("\n");
}
function flushNxLernaOmitted(compacted, omitted) {
  if (omitted.count > 0) {
    compacted.push(`[nx frame progress: omitted ${omitted.count} frame line(s)]`);
    omitted.count = 0;
  }
}
function isNxLernaFrameNoiseLine(line, canOmitStaticTaskTable) {
  return regexTest(String.raw`^\u2014{20,}$`, line) || regexTest(
    String.raw`^\s*(?:NX|Lerna \(powered by Nx\))\s+Running target \S+ for \d+ projects?$`,
    line
  ) || regexTest(
    String.raw`^\s*NX\s+Running \d+ \S+ tasks\.\.\.\s+Cache\s+Duration$`,
    line
  ) || canOmitStaticTaskTable && regexTest(
    String.raw`^\s*NX\s+Running \d+ \S+ tasks\.\.\.\s+Cache\s+Duration\s+.+$`,
    line
  ) || regexTest(
    String.raw`^\s+\u2192\s+Executing \d+/\d+ remaining tasks(?: in parallel)?\.\.\.$`,
    line
  ) || regexTest(
    String.raw`^\s+[\u280B\u2819\u2839\u2838\u283C\u2834\u2826\u2827\u2807\u280F]\s+(?:nx run \S+|@[\w.-]+/[\w.-]+:\S+)$`,
    line
  );
}
function hasNxLernaFrameProgress(output) {
  return output.includes("NX   Running target") || output.includes("Lerna (powered by Nx)") || output.split("\n").some((line) => regexTest(String.raw`^\s*NX\s+Running \d+ \S+ tasks\.\.\.\s+Cache\s+Duration`, line));
}
function compactPnpmOutput(output) {
  let compacted = compactRepeatedNodeWarnings(output);
  compacted = compactPackageManagerOperations(compacted);
  return compactPnpmInstallProgress(compacted);
}
function compactPnpmInstallProgress(output) {
  const lines = output.split("\n");
  const lastProgressIndexes = /* @__PURE__ */ new Map();
  const lastDownloadIndexes = /* @__PURE__ */ new Map();
  const lastWarningCounterIndexes = /* @__PURE__ */ new Map();
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (isPnpmProgressLine(line)) {
      lastProgressIndexes.set(pnpmWorkspacePrefix(line), index);
    }
    const packageName = pnpmDownloadPackage(line);
    if (packageName !== void 0) {
      lastDownloadIndexes.set(packageName, index);
    }
    if (isPnpmWarningCounterLine(line)) {
      lastWarningCounterIndexes.set(pnpmWorkspacePrefix(line), index);
    }
  }
  const compacted = [];
  const omittedProgress = { count: 0 };
  const omittedWarningCounters = { count: 0 };
  const omittedDownloads = /* @__PURE__ */ new Map();
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const packageBarSize = pnpmPackageBarSize(index >= 1 ? lines[index - 1] : void 0, line);
    if (packageBarSize !== void 0) {
      compacted.push(`[pnpm install package bar: omitted ${packageBarSize} plus character(s)]`);
      continue;
    }
    const progressPrefix = pnpmWorkspacePrefix(line);
    if (isPnpmProgressLine(line) && lastProgressIndexes.get(progressPrefix) !== index) {
      omittedProgress.count += 1;
      continue;
    }
    const packageName = pnpmDownloadPackage(line);
    if (packageName !== void 0 && lastDownloadIndexes.get(packageName) !== index) {
      omittedDownloads.set(packageName, (omittedDownloads.get(packageName) ?? 0) + 1);
      continue;
    }
    const warningPrefix = pnpmWorkspacePrefix(line);
    if (isPnpmWarningCounterLine(line) && lastWarningCounterIndexes.get(warningPrefix) !== index) {
      omittedWarningCounters.count += 1;
      continue;
    }
    if (isPnpmProgressLine(line)) {
      flushPnpmProgress(compacted, omittedProgress);
    } else if (packageName !== void 0) {
      flushPnpmDownload(compacted, omittedDownloads, packageName);
    } else if (isPnpmWarningCounterLine(line)) {
      flushPnpmWarningCounters(compacted, omittedWarningCounters);
    }
    compacted.push(line);
  }
  return compacted.join("\n");
}
function flushPnpmProgress(compacted, omittedProgress) {
  if (omittedProgress.count > 0) {
    compacted.push(`[pnpm install progress: omitted ${omittedProgress.count} earlier progress line(s)]`);
    omittedProgress.count = 0;
  }
}
function flushPnpmWarningCounters(compacted, omittedWarningCounters) {
  if (omittedWarningCounters.count > 0) {
    compacted.push(`[pnpm install warning counter: omitted ${omittedWarningCounters.count} earlier counter line(s)]`);
    omittedWarningCounters.count = 0;
  }
}
function flushPnpmDownload(compacted, omittedDownloads, packageName) {
  const omitted = omittedDownloads.get(packageName) ?? 0;
  omittedDownloads.delete(packageName);
  if (omitted > 0) {
    compacted.push(`[pnpm install downloads: omitted ${omitted} earlier frame(s) for ${packageName}]`);
  }
}
function isPnpmProgressLine(line) {
  const rest = stripPnpmWorkspacePrefix(line);
  return regexTest(
    String.raw`^Progress: resolved \d+, reused \d+, downloaded \d+, added \d+(?:, done)?$`,
    rest
  );
}
function pnpmDownloadPackage(line) {
  const stripped = stripPnpmWorkspacePrefix(line);
  const rest = stripPrefix(stripped, "Downloading ");
  if (rest === void 0) {
    return void 0;
  }
  const split = splitOnce(rest, ": ");
  if (split === void 0) {
    return void 0;
  }
  const [pkg, sizes] = split;
  if (regexTest(
    String.raw`^\d+(?:\.\d+)? (?:B|kB|MB|GB)/\d+(?:\.\d+)? (?:B|kB|MB|GB)(?:, done)?$`,
    sizes
  )) {
    return pkg;
  }
  return void 0;
}
function isPnpmWarningCounterLine(line) {
  return regexTest(
    String.raw`^\s*WARN\s+\d+ other warnings$`,
    stripPnpmWorkspacePrefix(line)
  );
}
function pnpmPackageBarSize(previousLine, line) {
  if (previousLine === void 0) {
    return void 0;
  }
  const countText = stripPrefix(previousLine, "Packages: +");
  if (countText === void 0) {
    return void 0;
  }
  const count = parseUsize(countText);
  if (count === void 0) {
    return void 0;
  }
  if (line.length > 0 && [...line].every((ch) => ch === "+") && line.length === count) {
    return count;
  }
  return void 0;
}
function pnpmWorkspacePrefix(line) {
  const end = pnpmWorkspacePrefixEnd(line);
  return end !== void 0 ? line.slice(0, end) : "";
}
function stripPnpmWorkspacePrefix(line) {
  const end = pnpmWorkspacePrefixEnd(line);
  return end !== void 0 ? line.slice(end) : line;
}
function pnpmWorkspacePrefixEnd(line) {
  const index = line.indexOf("|");
  if (index === -1) {
    return void 0;
  }
  if (index === 0) {
    return void 0;
  }
  let end = index + 1;
  for (const ch of line.slice(end)) {
    if (!isWhitespaceChar(ch)) {
      break;
    }
    end += ch.length;
  }
  return end;
}
function compactNpmOutput(output) {
  let compacted = compactRepeatedNodeWarnings(output);
  compacted = compactPackageManagerOperations(compacted);
  compacted = compactIntralineProgress(
    compacted,
    "yarn1 install intraline progress",
    compactYarn1ProgressFrames
  );
  return omitNonDiagnosticLines(
    compacted,
    "npm install progress",
    isNpmInstallProgressLine
  );
}
function compactYarn1ProgressFrames(line) {
  return compactProgressPatternsUnlessDiagnostic(line, [String.raw`\[[#-]+\] \d+/\d+`]);
}
function isNpmInstallProgressLine(line) {
  if (isDiagnosticLine(line)) {
    return false;
  }
  const lower = asciiLowercase(line);
  if (regexTest(String.raw`^npm (?:notice|http|timing|info|verb|silly)\b`, lower)) {
    return true;
  }
  if (regexTestWithFlags(
    String.raw`^(?:reify|idealTree|fetchMetadata|extract|rollbackFailedOptional)[:\s]`,
    line,
    "i"
  )) {
    return true;
  }
  const chars = Array.from(line);
  const first = chars[0];
  const second = chars[1];
  return first !== void 0 && first >= "\u2801" && first <= "\u28FF" && second !== void 0 && isWhitespaceChar(second);
}
function compactYarnBerryOutput(output) {
  let compacted = compactYarnBerryProgress(output);
  compacted = compactRepeatedNodeWarnings(compacted);
  compacted = compactPackageManagerOperations(compacted);
  return compactIntralineProgress(
    compacted,
    "yarn1 install intraline progress",
    compactYarn1ProgressFrames
  );
}
function compactYarnBerryProgress(output) {
  if (!hasYarnBerryCompletedOutput(output)) {
    return output;
  }
  return omitMatchingLines(
    output,
    "yarn berry progress",
    isYarnBerryProgressLine,
    "progress"
  );
}
function hasYarnBerryCompletedOutput(output) {
  return output.includes("\u27A4 YN0000:") && output.split("\n").some((line) => line.startsWith("\u27A4 YN0000: \xB7 Done in ") || line.startsWith("\u27A4 YN0000: \xB7 Done with warnings in "));
}
function isYarnBerryProgressLine(line) {
  return line.startsWith("\u27A4 YN0000:") && !line.startsWith("\u27A4 YN0000: \xB7 Done in ") && !line.startsWith("\u27A4 YN0000: \xB7 Done with warnings in ");
}
function compactMakeOutput(output) {
  let compacted = compactIntralineProgress(
    output,
    "ninja build intraline progress",
    compactNinjaProgressFrames
  );
  compacted = compactMakeProgress(compacted);
  compacted = compactGolangciLintOutput(compacted, true);
  return omitNonDiagnosticLines(
    compacted,
    "go module download",
    isGoModuleDownloadChatterLine
  );
}
function compactNinjaProgressFrames(line) {
  return compactProgressPatternsUnlessDiagnostic(
    line,
    [
      String.raw`\[\s*\d+/\d+\]\s+(?:(?:Building|Linking)\s+(?:C|CXX|CUDA|ASM|OBJC|OBJCXX)\s+(?:object|executable|static library|shared library|module)|Generating|Copying|Processing|Re-running CMake|Scanning dependencies of target|Automatic\s+(?:MOC|UIC|RCC))\b[^[]*`
    ]
  );
}
function compactMakeProgress(output) {
  const lines = output.split("\n");
  const compacted = [];
  let i = 0;
  while (i < lines.length) {
    const key = getMakeProgressKey(lines[i]);
    if (key === void 0) {
      compacted.push(lines[i]);
      i += 1;
      continue;
    }
    let j = i + 1;
    while (j < lines.length && getMakeProgressKey(lines[j]) === key) {
      j += 1;
    }
    const count = j - i;
    if (count >= 4) {
      compacted.push(lines[i]);
      compacted.push(`[make progress: omitted ${count - 1} more ${key} line(s)]`);
    } else {
      for (let k = i; k < j; k++) {
        compacted.push(lines[k]);
      }
    }
    i = j;
  }
  return compacted.join("\n");
}
function getMakeProgressKey(line) {
  if (isDiagnosticLine(line)) {
    return void 0;
  }
  const trimmed = line.trim();
  const kind = regexCaptureFirst(String.raw`^\[(Compiling|Linking) .+\]$`, trimmed);
  if (kind !== void 0) {
    return asciiLowercase(kind);
  }
  const rule = splitMakeRuleLine(trimmed);
  if (rule !== void 0) {
    const [ruleName, target] = rule;
    const suffix = regexCaptureFirst(String.raw`(\.[A-Za-z0-9_.-]+)$`, target) ?? "";
    return `${ruleName} ${directoryGlob(target, suffix)}`;
  }
  const preprocessing = regexCaptureFirst(String.raw`^Preprocessing\s+(.+\.vp)$`, trimmed);
  if (preprocessing !== void 0) {
    return `Preprocessing ${directoryGlob(preprocessing, ".vp")}`;
  }
  if (regexTest(
    String.raw`^(?:gcc|g\+\+|cc|c\+\+|clang|clang\+\+|[A-Za-z0-9_-]+-gcc|[A-Za-z0-9_-]+-g\+\+)\b.*\s-c\s`,
    trimmed
  )) {
    return "compile command";
  }
  if (regexTest(
    String.raw`^make(?:\[\d+\])?: (?:Entering|Leaving) directory `,
    trimmed
  )) {
    return "make directory";
  }
  return void 0;
}
function splitMakeRuleLine(line) {
  const rules = [
    "HOSTCC",
    "MKLIB",
    "MKEXE",
    "MKDLL",
    "OCAMLC",
    "OCAMLOPT",
    "COQC",
    "COQDEP",
    "COQCHK",
    "COQDOC",
    "LINK",
    "CXX",
    "CPP",
    "CC",
    "AR",
    "AS",
    "LD",
    "GEN"
  ];
  for (const rule of rules) {
    const target = stripPrefix(line, `${rule} `);
    if (target !== void 0) {
      return [rule, target];
    }
  }
  return void 0;
}
function directoryGlob(target, suffix) {
  const slash = target.lastIndexOf("/");
  if (slash !== -1) {
    return `${target.slice(0, slash)}/*${suffix}`;
  }
  return `*${suffix}`;
}
function compactAptOutput(output) {
  let compacted = compactIntralineProgress(
    output,
    "apt intraline progress",
    compactAptProgressFrames
  );
  compacted = compactNeedrestartNoopProgress(compacted);
  compacted = compactPackageManagerOperations(compacted);
  compacted = compactAptDpkgLifecycleBlocks(compacted);
  return omitNonDiagnosticLines(compacted, "apt progress", isAptProgressLine);
}
function compactAptProgressFrames(line) {
  if (isDiagnosticLine(line)) {
    return unchangedLine(line);
  }
  const result = compactProgressPatterns(
    line,
    [
      String.raw`Reading package lists\.\.\. \d+%`,
      String.raw`Building dependency tree\.\.\. \d+%`,
      String.raw`Reading state information\.\.\. \d+%`,
      String.raw`\(Reading database \.\.\. \d+%`
    ]
  );
  const spinnerResult = removeProgressMatches(
    result.output,
    String.raw`\d+% \[(?:Working|Waiting for headers|Connecting to [^\]]+|Connected to [^\]]+)\]\s*`
  );
  return {
    output: spinnerResult.output,
    omittedFrames: result.omittedFrames + spinnerResult.omittedFrames
  };
}
function removeProgressMatches(line, pattern) {
  const matches = regexFindAll(pattern, line);
  if (matches.length === 0) {
    return unchangedLine(line);
  }
  let output = "";
  let cursor = 0;
  for (const match of matches) {
    output += line.slice(cursor, match.start);
    cursor = match.end;
  }
  output += line.slice(cursor);
  return { output, omittedFrames: matches.length };
}
function compactNeedrestartNoopProgress(output) {
  if (!hasNeedrestartNoopSummary(output) || hasNeedrestartActionableState(output)) {
    return output;
  }
  let omittedFrames = 0;
  const compacted = output.split("\n").map((line) => {
    const result = compactNeedrestartProgressLine(line);
    omittedFrames += result.omittedFrames;
    return result.output;
  }).join("\n");
  if (omittedFrames > 0) {
    return `[needrestart progress: omitted ${omittedFrames} no-op scanning frame(s)]
${compacted}`;
  }
  return output;
}
function hasNeedrestartNoopSummary(output) {
  return output.split("\n").some(isNeedrestartNoopSummaryLine);
}
function isNeedrestartNoopSummaryLine(line) {
  switch (line.trim()) {
    case "Running kernel seems to be up-to-date.":
    case "The processor microcode seems to be up-to-date.":
    case "No services need to be restarted.":
    case "No containers need to be restarted.":
    case "No user sessions are running outdated binaries.":
    case "No VM guests are running outdated hypervisor (qemu) binaries on this host.":
      return true;
    default:
      return false;
  }
}
function hasNeedrestartActionableState(output) {
  return output.split("\n").some((line) => {
    const trimmed = line.trim();
    return !isNeedrestartNoopSummaryLine(trimmed) && regexTestWithFlags(
      String.raw`\b(?:pending|reboot|required|restart-needed|NEEDRESTART-|Outdated Libraries|Services to be restarted|Containers to be restarted|User sessions running outdated|VM guests are running outdated|need restarting)\b`,
      trimmed,
      "i"
    );
  });
}
function compactNeedrestartProgressLine(line) {
  if (!line.includes("Scanning ")) {
    return unchangedLine(line);
  }
  const result = removeProgressMatches(
    line,
    String.raw`Scanning (?:processes|processor microcode|linux images)\.\.\. \[[^\]\n]*\]\s*`
  );
  return {
    output: result.output.trim().length === 0 ? "[needrestart progress]" : result.output,
    omittedFrames: result.omittedFrames
  };
}
function compactAptDpkgLifecycleBlocks(output) {
  return collapseContiguousRuns(output, isAptDpkgLifecycleLine, 4, (block) => {
    const packages = [];
    let triggerCount = 0;
    for (const line of block) {
      const parsed = parseAptPackageLifecycleLine(line);
      if (parsed !== void 0) {
        const [name, version] = parsed;
        const existing = packages.find((candidate) => candidate[0] === name);
        if (existing !== void 0) {
          existing[1] = version;
        } else {
          packages.push([name, version]);
        }
      } else if (line.startsWith("Processing triggers for ")) {
        triggerCount += 1;
      }
    }
    if (packages.length === 0) {
      return void 0;
    }
    const packageSummary = summarizePackages(packages);
    const triggerSummary = triggerCount > 0 ? `; ${triggerCount} trigger line(s)` : "";
    return `[apt packages: installed ${packages.length} package(s): ${packageSummary}; omitted ${block.length} dpkg lifecycle line(s)${triggerSummary}]`;
  });
}
function isAptDpkgLifecycleLine(line) {
  return !isDiagnosticLine(line) && (line.startsWith("Selecting previously unselected package ") || line.startsWith("Preparing to unpack ") || line.startsWith("Unpacking ") || line.startsWith("Setting up ") || line.startsWith("Processing triggers for ") || regexTest(String.raw`^running python (?:pre-|post-)?rtupdate hooks for `, line) || regexTest(
    String.raw`^\(Reading database \.\.\. \d+ files and directories currently installed\.\)$`,
    line
  ));
}
function parseAptPackageLifecycleLine(line) {
  const selecting = stripPrefix(line, "Selecting previously unselected package ");
  if (selecting !== void 0) {
    const name = stripSuffix(selecting, ".");
    if (name !== void 0) {
      return [name, void 0];
    }
  }
  const unpackingOrSetting = stripPrefix(line, "Unpacking ") ?? stripPrefix(line, "Setting up ");
  if (unpackingOrSetting !== void 0) {
    const nameSplit = splitOnce(unpackingOrSetting, " (");
    if (nameSplit !== void 0) {
      const versionSplit = splitOnce(nameSplit[1], ")");
      if (versionSplit !== void 0) {
        return [nameSplit[0], versionSplit[0]];
      }
    }
  }
  const preparing = stripPrefix(line, "Preparing to unpack ");
  if (preparing !== void 0) {
    const debSplit = splitOnce(preparing, " ");
    if (debSplit !== void 0) {
      const debSegments = debSplit[0].split("/");
      const fileName = debSegments[debSegments.length - 1];
      const nameSplit = splitOnce(fileName, "_");
      if (nameSplit !== void 0) {
        const versionSplit = rsplitOnce(nameSplit[1], "_");
        if (versionSplit !== void 0) {
          return [nameSplit[0], versionSplit[0]];
        }
      }
    }
  }
  return void 0;
}
function summarizePackages(packages) {
  return summarizeWithMore(
    packages.map(([name, version]) => version !== void 0 ? `${name} (${version})` : name),
    18
  );
}
function isAptProgressLine(line) {
  return !isDiagnosticLine(line) && (regexTest(String.raw`^\d+% \[`, line) || regexTest(String.raw`\b(?:Hit|Get|Ign):\d+ `, line) || line.includes("Reading package lists...") || line.includes("Building dependency tree...") || line.includes("Reading state information...") || line.startsWith("Selecting previously unselected package ") || line.startsWith("Preparing to unpack ") || line.startsWith("Unpacking ") || line.startsWith("Setting up ") || line.startsWith("Processing triggers for ") || line.startsWith("Fetched ") || line.startsWith("Need to get ") || line.startsWith("After this operation ") || line.startsWith("debconf: ") || line.startsWith("(Reading database "));
}
function isPythonEcosystemNoiseLine(line) {
  return line.startsWith(`WARNING: Running pip as the 'root' user can result in broken permissions`) || line.startsWith("It is recommended to use a virtual environment instead: ") || line.includes("DeprecationWarning: The distutils package is deprecated") || line.includes("SetuptoolsDeprecationWarning:") || line.includes("`numpy.distutils` is deprecated since NumPy 1.23.0") || line.startsWith("Partial import of sklearn during the build process.") || line.startsWith("Matplotlib is not built with the correct FreeType version");
}
function compactSetuptoolsDeprecationBlocks(output) {
  if (!output.includes("SetuptoolsDeprecationWarning") && !output.includes("EasyInstallDeprecationWarning") && !output.includes("DeprecationWarning:")) {
    return output;
  }
  const lines = output.split("\n");
  const compacted = [];
  let i = 0;
  while (i < lines.length) {
    if (!isSetuptoolsDeprecationHeader(lines[i])) {
      compacted.push(lines[i]);
      i += 1;
      continue;
    }
    const start = i;
    i += 1;
    let seenSentinel = false;
    while (i < lines.length && i - start < 30) {
      const line = lines[i];
      if (isStrictCompilerDiagnosticLine(line) || isUnsafeCompactionContextLine(line)) {
        break;
      }
      if (regexTest(String.raw`^\s*!!\s*$`, line)) {
        if (seenSentinel) {
          i += 1;
          break;
        }
        seenSentinel = true;
        i += 1;
        continue;
      }
      if (line.trim().length === 0 && i + 1 < lines.length && regexTest(String.raw`^\S`, lines[i + 1]) && !isSetuptoolsBannerLine(lines[i + 1])) {
        break;
      }
      if (!isSetuptoolsBannerLine(line) && regexTest(String.raw`^\S`, line)) {
        break;
      }
      i += 1;
    }
    const block = lines.slice(start, i);
    if (block.length >= 3 && !block.slice(1).some((line) => isUnsafeCompactionContextLine(line))) {
      compacted.push(`[setuptools deprecation: ${setuptoolsWarningName(block[0])}; omitted ${block.length - 1} banner line(s)]`);
    } else {
      for (const line of block) {
        compacted.push(line);
      }
    }
  }
  return compacted.join("\n");
}
function isSetuptoolsDeprecationHeader(line) {
  return line.includes("SetuptoolsDeprecationWarning:") || line.includes("EasyInstallDeprecationWarning:") || line.includes("DeprecationWarning:");
}
function setuptoolsWarningName(line) {
  return regexCaptureFirst(
    String.raw`([A-Za-z_][A-Za-z0-9_]*DeprecationWarning|DeprecationWarning):`,
    line
  ) ?? "deprecation warning";
}
function isSetuptoolsBannerLine(line) {
  return line.trim().length === 0 || startsWithWhitespace(line) || regexTest(String.raw`^\s*[-!*]{3,}\s*$`, line) || isSetuptoolsDeprecationHeader(line);
}
function compactCythonPerformanceHints(output) {
  if (!output.includes("performance hint:")) {
    return output;
  }
  const lines = output.split("\n");
  const compacted = [];
  let omitted = 0;
  let keptFirstInRun = false;
  const flush = () => {
    if (omitted > 0) {
      compacted.push(`[cython performance hints: omitted ${omitted} hint block(s)]`);
      omitted = 0;
    }
    keptFirstInRun = false;
  };
  let i = 0;
  while (i < lines.length) {
    if (!isCythonPerformanceHintHeader(lines[i])) {
      flush();
      compacted.push(lines[i]);
      i += 1;
      continue;
    }
    const start = i;
    i += 1;
    let hasUnsafeContext = false;
    while (i < lines.length && i - start < 12) {
      const line = lines[i];
      if (isCythonPerformanceHintHeader(line) || isStrictCompilerDiagnosticLine(line) || isUnsafeCompactionContextLine(line)) {
        hasUnsafeContext = isUnsafeCompactionContextLine(line);
        if (hasUnsafeContext) {
          i += 1;
        }
        break;
      }
      if (line.trim().length === 0 && i + 1 < lines.length && !startsWithWhitespace(lines[i + 1])) {
        i += 1;
        break;
      }
      if (!startsWithWhitespace(line) && !line.startsWith("Possible solutions:")) {
        break;
      }
      i += 1;
    }
    const block = lines.slice(start, i);
    if (hasUnsafeContext) {
      flush();
      for (const line of block) {
        compacted.push(line);
      }
    } else if (!keptFirstInRun) {
      for (const line of block) {
        compacted.push(line);
      }
      keptFirstInRun = true;
    } else {
      omitted += 1;
    }
  }
  flush();
  return compacted.join("\n");
}
function isCythonPerformanceHintHeader(line) {
  return regexTest(String.raw`^\S+\.pyx:\d+:\d+:\s+performance hint: `, line);
}
function compactCompilerWarningRuns(output) {
  if (!regexTest(
    String.raw`(?:^|\n)(?:\S+:\d+(?::\d+)?:\s*(?:warning|(?:fatal\s+)?error):|\S+:\s*internal compiler error:|error: command .+ failed\b)`,
    output
  )) {
    return output;
  }
  const inputErrorCount = countCompilerErrorLines(output);
  const lines = output.split("\n");
  const compacted = [];
  let i = 0;
  while (i < lines.length) {
    const run = collectCompilerDiagnosticRun(lines, i);
    if (run === void 0) {
      compacted.push(lines[i]);
      i += 1;
      continue;
    }
    if (run.blocks.length < 4) {
      compacted.push(lines[i]);
      i += 1;
      continue;
    }
    if (run.hasError) {
      for (let k = i; k < run.end; k++) {
        compacted.push(lines[k]);
      }
      i = run.end;
      continue;
    }
    for (const block of run.blocks.slice(0, 2)) {
      compacted.push(...block.lines);
    }
    compacted.push(`[compiler warnings: omitted ${run.blocks.length - 3} warning block(s)]`);
    compacted.push(...run.blocks[run.blocks.length - 1].lines);
    i = run.end;
  }
  const compactedOutput = compacted.join("\n");
  if (countCompilerErrorLines(compactedOutput) === inputErrorCount) {
    return compactedOutput;
  }
  return output;
}
function collectCompilerDiagnosticRun(lines, start) {
  const blocks = [];
  let i = start;
  let hasError = false;
  while (i < lines.length) {
    const kind = compilerDiagnosticKind(lines[i]);
    if (kind === void 0) {
      break;
    }
    const blockStart = i;
    i += 1;
    let contextLines = 0;
    while (i < lines.length && contextLines < 4 && compilerDiagnosticKind(lines[i]) === void 0 && lines[i].trim().length !== 0) {
      if (isDiagnosticLine(lines[i]) || isCompilerContextErrorLine(lines[i])) {
        hasError = true;
        break;
      }
      i += 1;
      contextLines += 1;
    }
    blocks.push({ lines: lines.slice(blockStart, i), kind });
    hasError = hasError || kind === "error";
    if (i < lines.length && lines[i].trim().length === 0) {
      break;
    }
  }
  if (blocks.length === 0) {
    return void 0;
  }
  return { blocks, end: i, hasError };
}
function compilerDiagnosticKind(line) {
  if (isCompilerErrorLine(line)) {
    return "error";
  }
  if (regexTest(String.raw`^\S+:\d+(?::\d+)?:\s*warning:\s`, line)) {
    return "warning";
  }
  return void 0;
}
function isStrictCompilerDiagnosticLine(line) {
  return compilerDiagnosticKind(line) !== void 0 || regexTest(String.raw`^\S+:\d+(?::\d+)?:\s*note:\s`, line);
}
function isCompilerErrorLine(line) {
  return regexTest(String.raw`^\S+:\d+(?::\d+)?:\s*(?:fatal\s+)?error:\s`, line) || regexTest(String.raw`^\S+:\s*internal compiler error:\s`, line) || regexTest(String.raw`^error: command .+ failed\b`, line);
}
function isCompilerContextErrorLine(line) {
  return regexTestWithFlags(String.raw`^(?:fatal error|error):\s`, line, "i") || line.startsWith("Traceback (most recent call last):");
}
function isUnsafeCompactionContextLine(line) {
  return isCompilerContextErrorLine(line.trimStart());
}
function countCompilerErrorLines(output) {
  return output.split("\n").filter((line) => isCompilerErrorLine(line) || isUnsafeCompactionContextLine(line)).length;
}
function isPipInstallProgressLine(line) {
  return isPipRootUserWarning(line) || !isDiagnosticLine(line) && (line.startsWith("Looking in indexes: ") || line.startsWith("Looking in links: ") || line.startsWith("Collecting ") || line.startsWith("Requirement already satisfied: ") || line.startsWith("Discarding http://") || line.startsWith("Discarding https://") || line.startsWith("Downloading http://") || line.startsWith("Downloading https://") || line.startsWith("  Downloading ") || line.startsWith("  Using cached ") || line.startsWith("  Getting requirements to build wheel ") || line.startsWith("  Installing build dependencies ") || line.startsWith("  Preparing metadata ") || line.startsWith("Building wheels for collected packages: ") || line.startsWith("  Building wheel for ") || line.startsWith("  Created wheel for ") || line.startsWith("  Stored in directory: ") || line.startsWith("Installing collected packages: ") || line.startsWith("Successfully installed ") || line.startsWith("Obtaining ") || line.startsWith("[notice] A new release of pip is available: ") || line.startsWith("[notice] To update, run: ") || regexTest(
    String.raw`^\s+[\u2501\u2578\u257A ]*[\u2501\u2578\u257A][\u2501\u2578\u257A ]*\d+(?:\.\d+)?(?:\s*[KMG]?B)?[/ ]`,
    line
  ));
}
function isPipRootUserWarning(line) {
  return line.startsWith(`WARNING: Running pip as the 'root' user can result in broken permissions`) || line.startsWith("It is recommended to use a virtual environment instead: ");
}
function isPythonNinjaBuildProgressLine(line) {
  return regexTest(
    String.raw`^\[\s*\d+/\d+\]\s+Compiling (?:C|C\+\+|Cython) source \S+\.(?:c|cc|cpp|cxx|pyx)$`,
    line
  ) || regexTest(
    String.raw`^\[\s*\d+/\d+\]\s+Generating \S+ with a custom command$`,
    line
  );
}
function isPythonBuildExtProgressLine(line) {
  return !isDiagnosticLine(line) && (regexTest(
    String.raw`^running (?:bdist_wheel|build|build_py|build_ext|egg_info|install(?:_lib|_egg_info|_scripts|_headers)?|sdist|check)\b`,
    line
  ) || regexTest(String.raw`^building '.+' extension$`, line) || line.startsWith("creating build") || line.startsWith("compile options: ") || line.startsWith("extra options: ") || regexTest(String.raw`^copying .+ -> `, line) || regexTest(String.raw`^writing .+\.egg-info/`, line) || line.startsWith("reading manifest file ") || regexTest(
    String.raw`^(?:gcc|g\+\+|cc|c\+\+|clang|clang\+\+)\b.*\s(?:-c|-shared)\s`,
    line
  ) || regexTest(
    String.raw`^Compiling \S+\.pyx because (?:it changed|it depends on )`,
    line
  ) || regexTest(String.raw`^\[\s*\d+/\d+\]\s+Cythonizing \S+\.pyx`, line));
}
function compactSetuptoolsFileStagingRuns(output) {
  return collapseContiguousRuns(output, isSetuptoolsFileStagingLine, 5, (block) => {
    const operations = uniqueStrings(
      block.map((line) => splitWhitespace(line)[0] ?? "staging")
    );
    return `[setuptools file staging: omitted ${block.length} ${operations.join("/")} line(s)]`;
  });
}
function isSetuptoolsFileStagingLine(line) {
  return regexTest(String.raw`^copying .+ -> .+$`, line) || regexTest(String.raw`^creating (?:build\b|[^/\s]+\.egg-info\b).*$`, line) || regexTest(
    String.raw`^creating [A-Za-z0-9_.+-]+-[A-Za-z0-9_.+-]+/[\w./+-]+$`,
    line
  ) || regexTest(String.raw`^adding (?:license file )?(?:'[^']+'|"[^"]+")$`, line) || regexTest(String.raw`^writing .+\.egg-info/.+$`, line) || regexTest(String.raw`^writing manifest file ['"].+['"]$`, line) || regexTest(String.raw`^reading manifest (?:file|template) ['"].+['"]$`, line);
}
function compactNumpyDistutilsProbes(output) {
  if (!output.includes("INFO: ")) {
    return output;
  }
  return collapseContiguousRuns(output, isNumpyDistutilsProbeLine, 4, (block) => `[numpy.distutils probes: omitted ${block.length} BLAS/LAPACK probe line(s)]`);
}
function isNumpyDistutilsProbeLine(line) {
  return !isDiagnosticLine(line) && line.startsWith("INFO: ") && regexTest(
    String.raw`(?:_info:|NOT AVAILABLE|libraries .* not found|Setting PTATLAS|customize |compile options:|extra options:)`,
    line
  );
}
function compactSphinxProgress(output) {
  if (!output.includes("reading sources... [") && !output.includes("writing output... [")) {
    return output;
  }
  return compactIntralineProgress(output, "sphinx progress", compactSphinxProgressLine);
}
function compactSphinxProgressLine(line) {
  if (!line.includes("reading sources... [") && !line.includes("writing output... [")) {
    return unchangedLine(line);
  }
  return compactProgressPatternsUnlessDiagnostic(
    line,
    [
      String.raw`reading sources\.\.\. \[\s*\d+%\]\s+\S+\s*`,
      String.raw`writing output\.\.\. \[\s*\d+%\]\s+\S+\s*`
    ]
  );
}
function hasSphinxProgress(output) {
  return hasSphinxOutputMarker(output) && (output.includes("reading sources... [") || output.includes("writing output... ["));
}
function hasSphinxOutputMarker(output) {
  return output.split("\n").some((line) => line.startsWith("Running Sphinx v") || line.startsWith("Sphinx v") || line.startsWith("loading pickled environment...") || line.startsWith("build succeeded") || line.startsWith("build finished with problems") || line.startsWith("The HTML pages are in "));
}
function compactDocusaurusProgress(output) {
  if (!hasDocusaurusProgress(output)) {
    return output;
  }
  return omitMatchingLines(
    output,
    "docusaurus progress",
    (line) => regexTest(String.raw`^\s*[\u25CF\u25EF]\s+(?:Client|Server)(?:\s+|$)`, line),
    "progress"
  );
}
function compactCarriageReturnProgress(output) {
  if (!output.includes("\r")) {
    return output;
  }
  return output.split("\n").map((line) => {
    const parts = line.split("\r");
    for (let idx = parts.length - 1; idx >= 0; idx--) {
      if (parts[idx].length !== 0) {
        return parts[idx];
      }
    }
    return "";
  }).join("\n");
}
function looksLikeGoRuntimePanic(output) {
  if (jsStringLen(output) < 4 * 1024 || !regexTest(
    String.raw`(?:^|\n)(?:fatal error: |runtime stack:|SIGSEGV|SIGABRT|SIGBUS)`,
    output
  )) {
    return false;
  }
  let count = 0;
  for (const line of output.split("\n")) {
    if (isGoRuntimeGoroutineHeader(line)) {
      count += 1;
      if (count === GO_RUNTIME_PANIC_MIN_GOROUTINES) {
        return true;
      }
    }
  }
  return false;
}
function compactGoRuntimePanicDump(output) {
  if (!looksLikeGoRuntimePanic(output)) {
    return output;
  }
  const lines = output.split("\n");
  const firstHeader = lines.findIndex((line) => isGoRuntimeGoroutineHeader(line));
  if (firstHeader === -1) {
    return output;
  }
  const blocks = collectGoGoroutineBlocks(lines, firstHeader);
  if (blocks.length < GO_RUNTIME_PANIC_MIN_GOROUTINES) {
    return output;
  }
  const compacted = lines.slice(0, firstHeader);
  for (let k = blocks[0].start; k < blocks[0].end; k++) {
    compacted.push(lines[k]);
  }
  let omittedFrameLines = 0;
  const remainingBlocks = [];
  for (const block of blocks.slice(1)) {
    const originalBlock = lines.slice(block.start, block.end);
    const compactedBlock = compactGoGoroutineBlock(originalBlock);
    omittedFrameLines += saturatingSub(originalBlock.length, compactedBlock.length);
    remainingBlocks.push(compactedBlock);
  }
  const groupedBlocks = groupRepeatedGoGoroutineBlocks(remainingBlocks);
  if (omittedFrameLines === 0 && groupedBlocks.omittedBlocks === 0) {
    return output;
  }
  const summary = [];
  if (omittedFrameLines > 0) {
    summary.push(`${blocks.length - 1} goroutine block(s) below were condensed; ${omittedFrameLines} frame line(s) omitted`);
  }
  if (groupedBlocks.omittedBlocks > 0) {
    summary.push(`${groupedBlocks.omittedBlocks} repeated goroutine block(s) grouped`);
  }
  compacted.push(`[go runtime panic: ${summary.join("; ")}]`);
  for (const block of groupedBlocks.blocks) {
    compacted.push(...block);
  }
  return compacted.join("\n");
}
function collectGoGoroutineBlocks(lines, firstHeader) {
  const blocks = [];
  let start = firstHeader;
  for (let i = firstHeader + 1; i < lines.length; i++) {
    if (isGoRuntimeGoroutineHeader(lines[i])) {
      blocks.push({ start, end: i });
      start = i;
    }
  }
  blocks.push({ start, end: lines.length });
  return blocks;
}
function compactGoGoroutineBlock(block) {
  const footerStart = findGoGoroutineFooterStart(block);
  const stack = block.slice(0, footerStart);
  const footer = block.slice(footerStart);
  if (stack.length <= 4) {
    return [...stack, ...footer];
  }
  let createdByIndex;
  for (let idx = stack.length - 1; idx >= 0; idx--) {
    if (stack[idx].startsWith("created by ")) {
      createdByIndex = idx;
      break;
    }
  }
  const kept = stack.slice(0, Math.min(3, stack.length));
  if (createdByIndex !== void 0 && createdByIndex >= kept.length) {
    kept.push(...stack.slice(createdByIndex));
  }
  kept.push(...footer);
  return kept;
}
function groupRepeatedGoGoroutineBlocks(blocks) {
  const signatures = blocks.map((block) => goGoroutineSignature(block));
  const counts = /* @__PURE__ */ new Map();
  for (const signature of signatures) {
    if (signature !== void 0) {
      counts.set(signature.key, (counts.get(signature.key) ?? 0) + 1);
    }
  }
  const grouped = [];
  const seen = [];
  let omittedBlocks = 0;
  for (let index = 0; index < blocks.length; index++) {
    const block = blocks[index];
    const signature = signatures[index];
    if (signature === void 0) {
      grouped.push([...block]);
      continue;
    }
    if ((counts.get(signature.key) ?? 0) < 3) {
      grouped.push([...block]);
      continue;
    }
    if (seen.includes(signature.key)) {
      omittedBlocks += 1;
      continue;
    }
    seen.push(signature.key);
    grouped.push([...block]);
    grouped.push([
      `[go runtime panic: omitted ${(counts.get(signature.key) ?? 1) - 1} similar goroutine block(s): state=${signature.state}, top=${signature.top}${signature.location.length === 0 ? "" : " at "}${signature.location}, created by=${signature.createdBy}]`,
      ""
    ]);
  }
  return { blocks: grouped, omittedBlocks };
}
function goGoroutineSignature(block) {
  if (findGoGoroutineFooterStart(block) < block.length) {
    return void 0;
  }
  const first = block[0];
  if (first === void 0) {
    return void 0;
  }
  const state = regexCaptureFirst(String.raw`\[([^\]]+)\]:$`, first);
  if (state === void 0) {
    return void 0;
  }
  let topIndex;
  for (let index = 0; index < block.length; index++) {
    const line = block[index];
    if (index > 0 && line.length !== 0 && !line.startsWith("	") && !line.startsWith("created by ")) {
      topIndex = index;
      break;
    }
  }
  if (topIndex === void 0) {
    return void 0;
  }
  const top = goFunctionName(block[topIndex]);
  if (top === void 0) {
    return void 0;
  }
  const location = goFileLocation(topIndex + 1 < block.length ? block[topIndex + 1] : void 0);
  const createdByLine = block.find((line) => line.startsWith("created by "));
  const createdBy = (createdByLine !== void 0 ? goCreatedByFunction(createdByLine) : void 0) ?? "<none>";
  return {
    key: `${state}\0${top}\0${location}\0${createdBy}`,
    state,
    top,
    location,
    createdBy
  };
}
function goFunctionName(line) {
  return regexCaptureFirst(String.raw`^([^\s(]+)(?:\(|$)`, line);
}
function goFileLocation(line) {
  if (line === void 0) {
    return "";
  }
  return regexCaptureFirst(String.raw`([^/\s]+\.[A-Za-z0-9]+:\d+)`, line) ?? "";
}
function goCreatedByFunction(line) {
  return regexCaptureFirst(String.raw`^created by (.+?)(?: in goroutine \d+)?$`, line);
}
function findGoGoroutineFooterStart(block) {
  for (let i = 1; i < block.length; i++) {
    if (!isGoGoroutineStackLine(block[i])) {
      return i;
    }
  }
  return block.length;
}
function isGoGoroutineStackLine(line) {
  return line.length === 0 || line.startsWith("	") || line.startsWith("created by ") || regexTest(String.raw`^\S.*\)$`, line);
}
function isGoRuntimeGoroutineHeader(line) {
  return regexTest(
    String.raw`^goroutine \d+(?: gp=\S+)?(?: m=\S+)?(?: mp=\S+)? \[[^\]]+\]:$`,
    line
  );
}
function isDjangoTestBoilerplateLine(line) {
  return !isDiagnosticLine(line) && (line.startsWith("Testing against Django installed in ") || regexTest(String.raw`^Found \d+ test(?:\(s\)|s)?\.$`, line) || line.startsWith("Creating test database for alias ") || line.startsWith("Destroying test database for alias ") || line.startsWith("Skipping setup of unused database") || line.startsWith("System check identified no issues") || line.startsWith("Operations to perform:") || line.startsWith("Apply all migrations:") || regexTest(String.raw`^ {2}Applying \S+\.\S+\.\.\. OK$`, line) || regexTest(String.raw`^test_\S+ \([^)]+\) \.\.\. ok$`, line));
}
function isDjangoTestProgressLine(line) {
  return !isDiagnosticLine(line) && (line.includes(".") || line.includes("s") || line.includes("x") || line.includes("X")) && regexTest(String.raw`^[.sxXEF]+(?:\s+\[\s*\d+%\])?$`, line);
}
function isPytestSessionMetadataLine(line) {
  return !isDiagnosticLine(line) && (regexTestWithFlags(String.raw`^=+\s*test session starts\s*=+$`, line, "i") || regexTest(String.raw`^platform .*\bpytest-.*\bpluggy-`, line) || regexTest(String.raw`^(?:cachedir|rootdir|configfile|plugins): `, line) || line.startsWith("collecting ...") || regexTest(String.raw`^collected \d+ items?`, line));
}
function compactPytestProgress(output) {
  if (hasPytestTerminalSummary(output)) {
    return omitPytestProgressLines(output, isPytestProgressLine);
  }
  if (hasStrictPytestPassedProgressRun(output) && !hasPytestProgressFallbackPoison(output)) {
    return omitPytestProgressLines(output, isStrictPytestPassedProgressLine);
  }
  return output;
}
function omitPytestProgressLines(output, shouldOmit) {
  const compacted = [];
  const omittedLines = [];
  for (const line of output.split("\n")) {
    if (shouldOmit(line)) {
      omittedLines.push(line);
    } else {
      flushPytestProgressLines(compacted, omittedLines);
      compacted.push(line);
    }
  }
  flushPytestProgressLines(compacted, omittedLines);
  return compacted.join("\n");
}
function flushPytestProgressLines(compacted, omittedLines) {
  if (omittedLines.length === 0) {
    return;
  }
  const summary = omittedLines.every((line) => isStrictPytestPassedProgressLine(line)) ? `[pytest progress: omitted ${omittedLines.length} PASSED test result line(s)]` : `[pytest progress: omitted ${omittedLines.length} non-diagnostic line(s)]`;
  compacted.push(summary);
  omittedLines.length = 0;
}
function isPytestProgressLine(line) {
  return !isDiagnosticLine(line) && (regexTest(String.raw`^[-=]{20,}$`, line) || regexTest(String.raw`^[.sxX]+(?:\s+\[\s*\d+%\])?\s*$`, line) || regexTest(
    String.raw`^\S+\.py::\S+\s+(?:PASSED|SKIPPED|XFAIL)\s+\[\s*\d+%\]$`,
    line
  ));
}
function hasPytestProgressFallbackPoison(output) {
  return regexTest(
    String.raw`(?:^|\n)(?:\S+\.py::\S+\s+(?:FAILED|ERROR)\s+\[\s*\d+%\]|(?:FAIL|ERROR|INTERNALERROR)\b)|Traceback \(most recent call last\):`,
    output
  ) || hasHardCrashLine(output);
}
function hasHardCrashLine(output) {
  return regexTestWithFlags(
    String.raw`(?:Fatal Python error:|Aborted|Abort trap|core dumped|segmentation fault)`,
    output,
    "i"
  );
}
function hasStrictPytestPassedProgressRun(output) {
  let runLength = 0;
  for (const line of output.split("\n")) {
    if (isStrictPytestPassedProgressLine(line)) {
      runLength += 1;
      if (runLength >= 5) {
        return true;
      }
    } else {
      runLength = 0;
    }
  }
  return false;
}
function isStrictPytestPassedProgressLine(line) {
  return !isDiagnosticLine(line) && regexTest(String.raw`^\S+\.py::\S+\s+PASSED\s+\[\s*\d+%\]$`, line);
}
function hasPytestTerminalSummary(output) {
  return regexTestWithFlags(
    String.raw`(?:^|\n)(?:=+\s*)?[^=\n]*(?:passed|failed|errors?|warnings?|skipped|xfailed|xpassed)[^=\n]*\bin \d+(?:\.\d+)?s\s*(?:=+)?\s*(?:\n|$)`,
    output,
    "i"
  );
}
function compactPytestFailureBlocks(output) {
  if (!hasPytestTerminalSummary(output)) {
    return output;
  }
  const shortSummaryLines = countPytestShortSummaryLines(output);
  const sectionHeaders = countPytestSectionHeaders(output);
  const lines = output.split("\n");
  const compacted = [];
  let i = 0;
  while (i < lines.length) {
    const section = pytestSectionName(lines[i]);
    if (section !== "FAILURES" && section !== "ERRORS") {
      compacted.push(lines[i]);
      i += 1;
      continue;
    }
    compacted.push(lines[i]);
    const start = i + 1;
    let end = start;
    while (end < lines.length && !isPytestSectionHeader(lines[end])) {
      end += 1;
    }
    compacted.push(...compactPytestFailureRegion(
      lines.slice(start, end),
      asciiLowercase(section ?? "")
    ));
    i = end;
  }
  const result = compacted.join("\n");
  if (countPytestShortSummaryLines(result) === shortSummaryLines && countPytestSectionHeaders(result) === sectionHeaders) {
    return result;
  }
  return output;
}
function compactPytestFailureRegion(lines, label) {
  const entries = [];
  const groups = /* @__PURE__ */ new Map();
  let i = 0;
  while (i < lines.length) {
    const name = parsePytestFailureBlockHeader(lines[i]);
    if (name === void 0) {
      entries.push({ type: "line", line: lines[i] });
      i += 1;
      continue;
    }
    const header = lines[i];
    i += 1;
    const bodyStart = i;
    while (i < lines.length && parsePytestFailureBlockHeader(lines[i]) === void 0 && !isPytestSectionHeader(lines[i])) {
      i += 1;
    }
    const body = lines.slice(bodyStart, i);
    const key = pytestFailureBlockKey(body);
    const block = { header, name, body, key };
    if (key !== void 0) {
      const list = groups.get(key);
      if (list !== void 0) {
        list.push(block);
      } else {
        groups.set(key, [block]);
      }
    }
    entries.push({ type: "block", block });
  }
  const emittedGroups = [];
  const compacted = [];
  for (const entry of entries) {
    if (entry.type === "line") {
      compacted.push(entry.line);
      continue;
    }
    const block = entry.block;
    const group = block.key !== void 0 ? groups.get(block.key) : void 0;
    const alreadyEmitted = block.key !== void 0 && emittedGroups.includes(block.key);
    if (block.key === void 0 || group === void 0 || group.length < 2 || alreadyEmitted) {
      if (block.key === void 0 || group === void 0 || group.length < 2) {
        compacted.push(block.header);
        compacted.push(...block.body);
      }
      continue;
    }
    emittedGroups.push(block.key);
    const first = group[0];
    compacted.push(first.header);
    compacted.push(...first.body);
    const duplicates = group.slice(1);
    compacted.push(`[pytest ${label}: ${duplicates.length} duplicate traceback block(s) match ${first.name}; also: ${summarizeWithMore(duplicates.map((duplicate) => duplicate.name), 8)}]`);
  }
  return compacted;
}
function parsePytestFailureBlockHeader(line) {
  return regexCaptureFirst(String.raw`^_{3,}\s+(.+?)\s+_{3,}\s*$`, line);
}
function pytestFailureBlockKey(body) {
  if (body.length < 3 || body.some((line) => isPytestSummaryLine(line))) {
    return void 0;
  }
  const normalized = body.map((line) => normalizePytestFailureLine(line)).filter((line) => line.trim().length !== 0).join("\n");
  if (normalized.split("\n").length >= 3) {
    return normalized;
  }
  return void 0;
}
function normalizePytestFailureLine(line) {
  const stripped = stripAnsi(line);
  return stripped.replace(new RegExp(String.raw`^\[gw\d+\]\s*`), "");
}
function isPytestSummaryLine(line) {
  return regexTest(String.raw`^(?:FAILED|ERROR)\s+\S`, line);
}
function countPytestShortSummaryLines(output) {
  return output.split("\n").filter((line) => isPytestSummaryLine(line)).length;
}
function countPytestSectionHeaders(output) {
  return output.split("\n").filter((line) => isPytestSectionHeader(line)).length;
}
function isPytestSectionHeader(line) {
  return pytestSectionName(line) !== void 0 || regexTest(String.raw`^=+\s+.*\bin \d+(?:\.\d+)?s\b.*\s*=+\s*$`, line);
}
function pytestSectionName(line) {
  const name = regexCaptureFirst(String.raw`^=+\s+([A-Za-z][A-Za-z ]+)\s+=+\s*$`, line);
  return name !== void 0 ? name.trim() : void 0;
}
function compactPytestWarningsSummary(output) {
  const lines = output.split("\n");
  const compacted = [];
  let i = 0;
  while (i < lines.length) {
    if (!regexTestWithFlags(String.raw`^=+\s*warnings summary\s*=+$`, lines[i], "i")) {
      compacted.push(lines[i]);
      i += 1;
      continue;
    }
    compacted.push(lines[i]);
    let j = i + 1;
    while (j < lines.length && !regexTest(String.raw`^=+\s+.+\s+=+$`, lines[j])) {
      j += 1;
    }
    compacted.push(...compactPytestWarningsSummaryRegion(lines.slice(i + 1, j)));
    i = j;
  }
  return compacted.join("\n");
}
function compactPytestWarningsSummaryRegion(lines) {
  const entries = [];
  const groups = /* @__PURE__ */ new Map();
  let i = 0;
  while (i < lines.length) {
    if (!isPytestWarningTestIdLine(lines[i])) {
      entries.push({ type: "line", line: lines[i] });
      i += 1;
      continue;
    }
    const testIds = [];
    while (i < lines.length && isPytestWarningTestIdLine(lines[i])) {
      testIds.push(lines[i]);
      i += 1;
    }
    const body = [];
    while (i < lines.length && !isPytestWarningTestIdLine(lines[i]) && !lines[i].startsWith("-- Docs: ")) {
      body.push(lines[i]);
      i += 1;
    }
    const parsed = parsePytestWarningBody(body);
    const block = {
      testIds,
      body,
      key: parsed?.key,
      warningClass: parsed?.warningClass,
      message: parsed?.message
    };
    if (block.key !== void 0) {
      const list = groups.get(block.key);
      if (list !== void 0) {
        list.push(block);
      } else {
        groups.set(block.key, [block]);
      }
    }
    entries.push({ type: "block", block });
  }
  const emittedGroups = [];
  const compacted = [];
  for (const entry of entries) {
    if (entry.type === "line") {
      compacted.push(entry.line);
      continue;
    }
    const block = entry.block;
    const group = block.key !== void 0 ? groups.get(block.key) : void 0;
    const shouldGroup = group !== void 0 && (group.length > 1 || group[0].testIds.length > 1);
    const alreadyEmitted = block.key !== void 0 && emittedGroups.includes(block.key);
    if (!shouldGroup || block.key === void 0 || alreadyEmitted) {
      if (!shouldGroup) {
        compacted.push(...formatPytestWarningBlock(block));
      }
      continue;
    }
    if (group === void 0) {
      continue;
    }
    emittedGroups.push(block.key);
    const totalTestIds = group.reduce((sum, item) => sum + item.testIds.length, 0);
    compacted.push(group[0].testIds[0]);
    if (totalTestIds > 1) {
      compacted.push(`[pytest warnings summary: ${totalTestIds} test id line(s) share ${block.warningClass ?? "warning"}: ${block.message ?? ""}]`);
    }
    compacted.push(...group[0].body);
    const duplicateBodies = group.length - 1;
    if (duplicateBodies > 0) {
      const locations = [];
      for (const item of group) {
        const location = parsePytestWarningLocation(item.body);
        if (location !== void 0 && !locations.includes(location)) {
          locations.push(location);
        }
      }
      const locationSummary = locations.length > 1 ? ` from ${locations.length} location(s)` : "";
      compacted.push(`[pytest warnings summary: omitted ${duplicateBodies} duplicate warning block(s)${locationSummary}]`);
    }
  }
  return compacted;
}
function formatPytestWarningBlock(block) {
  if (block.testIds.length <= 1) {
    return [...block.testIds, ...block.body];
  }
  const lines = [block.testIds[0]];
  lines.push(`[pytest warnings summary: omitted ${block.testIds.length - 1} test id line(s)]`);
  lines.push(...block.body);
  return lines;
}
function parsePytestWarningBody(body) {
  const regex = new RegExp(String.raw`^\s+.+?:\d+:\s+([A-Za-z_][A-Za-z0-9_.]*Warning):\s+(.+)$`);
  for (const line of body) {
    const captures = regex.exec(line);
    if (captures === null) {
      continue;
    }
    const warningClass = captures[1];
    const messageRaw = captures[2];
    if (warningClass === void 0 || messageRaw === void 0) {
      return void 0;
    }
    const message = normalizePytestWarningMessage(messageRaw);
    return {
      key: `${warningClass}\0${message}`,
      warningClass,
      message
    };
  }
  return void 0;
}
function parsePytestWarningLocation(body) {
  for (const line of body) {
    const location = regexCaptureFirst(
      String.raw`^\s+(.+?:\d+):\s+[A-Za-z_][A-Za-z0-9_.]*Warning:\s+.+$`,
      line
    );
    if (location !== void 0) {
      return location;
    }
  }
  return void 0;
}
function normalizePytestWarningMessage(message) {
  return splitWhitespace(message).join(" ");
}
function isPytestWarningTestIdLine(line) {
  const trimmed = line.trimEnd();
  return line === trimmed && (!trimmed.includes(" ") && (trimmed.includes(".py::") || regexTest(String.raw`^\S+\.py:\d+$`, trimmed)) || regexTest(String.raw`^\S+\.py:\s+\d+ warnings?$`, trimmed));
}
function compactGrepContentOutput(output, largeOutputThreshold) {
  const lines = splitToolOutputLines(output);
  if (shouldSkipToolOutputCompaction(lines, output, 8)) {
    return unchanged(output);
  }
  const grepLines = lines.filter((line) => line !== "--");
  const parsedMatches = [];
  for (const line of grepLines) {
    const parsed = parseGrepContentLine(line);
    if (parsed !== void 0) {
      parsedMatches.push(parsed);
    }
  }
  if (parsedMatches.length < 8 || parsedMatches.length < 20 && jsStringLen(output) < 4e3) {
    return unchanged(output);
  }
  if (parsedMatches.length !== grepLines.length && (fitsLargeOutputThreshold(output, largeOutputThreshold) || parsedMatches.length / grepLines.length < 0.6)) {
    return unchanged(output);
  }
  const sortedGroups = grepContentGroups(parsedMatches);
  const commonPrefix = commonDirectoryPrefix(parsedMatches.map((m) => m.path));
  const bodyBudget = compactedBodyBudget(largeOutputThreshold);
  const lossless = renderGrepContentGroups(sortedGroups, commonPrefix, sortedGroups.length, indexAll);
  if (byteLength(lossless) >= byteLength(output) && fitsLargeOutputThreshold(output, largeOutputThreshold)) {
    return unchanged(output);
  }
  if (fitsLargeOutputThreshold(lossless, largeOutputThreshold)) {
    return { output: lossless, lossless: true };
  }
  const aggressive = renderGrepContentGroups(sortedGroups, commonPrefix, 12, selectHeadTailToShow);
  if (fitsLargeOutputThreshold(aggressive, bodyBudget)) {
    return lossy(aggressive);
  }
  const fallback = renderBudgetedGrepContentGroups(sortedGroups, commonPrefix, largeOutputThreshold);
  if (byteLength(fallback) < byteLength(aggressive)) {
    return lossy(fallback);
  }
  return lossy(aggressive);
}
function grepContentGroups(matches) {
  const groups = /* @__PURE__ */ new Map();
  for (const m of matches) {
    const list = groups.get(m.path);
    if (list !== void 0) {
      list.push(m);
    } else {
      groups.set(m.path, [m]);
    }
  }
  return [...groups.entries()];
}
function renderGrepContentGroups(sortedGroups, commonPrefix, maxGroups, selectMatches) {
  const totalMatches = totalGroupItems(sortedGroups);
  const compacted = [];
  compacted.push(`[grep content: ${totalMatches} matches across ${sortedGroups.length} file(s)${commonPrefix.length === 0 ? "" : ` under ${commonPrefix}`}]`);
  for (const [filePath, fileMatches] of sortedGroups.slice(0, maxGroups)) {
    const displayPath = displayPathUnderPrefix(filePath, commonPrefix);
    if (fileMatches.length === 1) {
      compacted.push(`${displayPath}:${formatGrepMatch(fileMatches[0])}`);
      continue;
    }
    compacted.push("");
    compacted.push(`${displayPath} (${fileMatches.length} match(es)):`);
    const shown = selectMatches(fileMatches);
    let previousIndex;
    for (const { item: m, index } of shown) {
      if (previousIndex !== void 0 && index > previousIndex + 1) {
        compacted.push(`  ... ${index - previousIndex - 1} more match(es) omitted in this file`);
      }
      compacted.push(`  ${formatGrepMatch(m)}`);
      previousIndex = index;
    }
    const omittedAfterLast = previousIndex !== void 0 ? saturatingSub(fileMatches.length, previousIndex + 1) : fileMatches.length;
    if (omittedAfterLast > 0) {
      compacted.push(`  ... ${omittedAfterLast} more match(es) omitted in this file`);
    }
  }
  if (sortedGroups.length > maxGroups) {
    const omittedMatches = totalGroupItems(sortedGroups.slice(maxGroups));
    compacted.push("");
    compacted.push(`[omitted ${omittedMatches} match(es) in ${sortedGroups.length - maxGroups} file(s); see original output for full results]`);
  }
  return compacted.join("\n");
}
function parseGrepContentLine(line) {
  const numbered = parseNumberedGrepContentLine(line);
  if (numbered !== void 0) {
    return numbered;
  }
  const separatorIndex = line.indexOf(":");
  if (separatorIndex < 0) {
    return void 0;
  }
  if (separatorIndex === 0 || separatorIndex === line.length - 1) {
    return void 0;
  }
  const path = line.slice(0, separatorIndex);
  if (!looksLikeGrepPath(path)) {
    return void 0;
  }
  return {
    path: normalizeDisplayPathSeparators(path),
    lineNumber: void 0,
    separator: ":",
    text: line.slice(separatorIndex + 1)
  };
}
function parseNumberedGrepContentLine(line) {
  const bytes = new TextEncoder().encode(line);
  const decoder = new TextDecoder();
  const sliceStr = (start, end) => decoder.decode(bytes.subarray(start, end));
  const isAsciiDigitByte = (byte) => byte >= 48 && byte <= 57;
  const colon = 58;
  const dash = 45;
  const upperBound = saturatingSub(bytes.length, 2);
  for (let i = 1; i < upperBound; i++) {
    const pathSeparator = bytes[i];
    if (pathSeparator !== colon && pathSeparator !== dash) {
      continue;
    }
    const numberStart = i + 1;
    let numberEnd = numberStart;
    while (numberEnd < bytes.length && isAsciiDigitByte(bytes[numberEnd])) {
      numberEnd += 1;
    }
    if (numberEnd === numberStart) {
      continue;
    }
    if (numberEnd >= bytes.length) {
      return void 0;
    }
    const separator = bytes[numberEnd];
    if (separator !== colon && separator !== dash) {
      continue;
    }
    const path = sliceStr(0, i);
    if (!looksLikeGrepPath(path)) {
      continue;
    }
    return {
      path: normalizeDisplayPathSeparators(path),
      lineNumber: sliceStr(numberStart, numberEnd),
      separator: String.fromCharCode(separator),
      text: sliceStr(numberEnd + 1, bytes.length)
    };
  }
  return void 0;
}
function looksLikeGrepPath(path) {
  return path.includes("/") || path.includes("\\") || regexTest(String.raw`\.[A-Za-z0-9_-]+$`, path);
}
function renderBudgetedGrepContentGroups(sortedGroups, commonPrefix, largeOutputThreshold) {
  const budget = compactedBodyBudget(largeOutputThreshold);
  let smallest = renderBudgetedGrepContentGroupsWithLimit(sortedGroups, commonPrefix, 1, 1);
  for (const maxGroups of [10, 8, 6, 4, 2, 1]) {
    for (const maxMatchesPerGroup of [12, 6, 3, 1]) {
      const candidate = renderBudgetedGrepContentGroupsWithLimit(
        sortedGroups,
        commonPrefix,
        maxGroups,
        maxMatchesPerGroup
      );
      if (fitsLargeOutputThreshold(candidate, budget)) {
        return candidate;
      }
      smallest = candidate;
    }
  }
  return smallest;
}
function renderBudgetedGrepContentGroupsWithLimit(sortedGroups, commonPrefix, maxGroups, maxMatchesPerGroup) {
  const totalMatches = totalGroupItems(sortedGroups);
  const compacted = [];
  compacted.push(`[grep content: ${totalMatches} matches across ${sortedGroups.length} file(s)${commonPrefix.length === 0 ? "" : ` under ${truncatePathMiddle(commonPrefix, COMMON_PREFIX_DISPLAY_WIDTH)}`}; compact summary]`);
  for (const [filePath, fileMatches] of sortedGroups.slice(0, maxGroups)) {
    compacted.push(formatBudgetedGrepGroup(filePath, fileMatches, commonPrefix, maxMatchesPerGroup));
  }
  if (sortedGroups.length > maxGroups) {
    const omittedMatches = totalGroupItems(sortedGroups.slice(maxGroups));
    compacted.push(`[omitted ${omittedMatches} match(es) in ${sortedGroups.length - maxGroups} file(s)]`);
  }
  const extensionSummary = summarizeExtensions(sortedGroups.map(([filePath]) => filePath));
  if (extensionSummary.length !== 0) {
    compacted.push(`[extensions: ${truncateInlineText(extensionSummary, EXTENSION_SUMMARY_INLINE_WIDTH)}]`);
  }
  return compacted.join("\n");
}
function formatBudgetedGrepGroup(filePath, fileMatches, commonPrefix, maxMatches) {
  const displayPath = truncatePathMiddle(displayPathUnderPrefix(filePath, commonPrefix), 140);
  const shown = selectEvenlySpacedGrepMatches(fileMatches, maxMatches);
  const lines = [`${displayPath} (${fileMatches.length} match(es)):`];
  for (const { item: m } of shown) {
    lines.push(`  ${excerptInlineText(formatGrepMatch(m), 180)}`);
  }
  if (fileMatches.length > shown.length) {
    lines.push(`  ... ${fileMatches.length - shown.length} more match(es) omitted in this file`);
  }
  return lines.join("\n");
}
function selectEvenlySpacedGrepMatches(matches, maxMatches) {
  if (matches.length <= maxMatches) {
    return indexAll(matches);
  }
  if (maxMatches <= 1) {
    return [{ item: matches[0], index: 0 }];
  }
  const selected = [];
  const seen = [];
  for (let i = 0; i < maxMatches; i++) {
    const index = Math.round(i * (matches.length - 1) / (maxMatches - 1));
    if (!seen.includes(index)) {
      seen.push(index);
      selected.push({ index, item: matches[index] });
    }
  }
  return selected;
}
function formatGrepMatch(m) {
  if (m.lineNumber !== void 0) {
    return `${m.lineNumber}${m.separator} ${m.text}`;
  }
  return ` ${m.text}`;
}
function compactGrepCountOutput(output) {
  const TOP_COUNT_ROWS = 20;
  const lines = splitToolOutputLines(output);
  if (shouldSkipToolOutputCompaction(lines, output, 30)) {
    return unchanged(output);
  }
  const parsedCounts = [];
  for (const line of lines) {
    const parsed = parseGrepCountLine(line);
    if (parsed !== void 0) {
      parsedCounts.push(parsed);
    }
  }
  if (parsedCounts.length < 30 || parsedCounts.length / lines.length < 0.8) {
    return unchanged(output);
  }
  let totalMatches = 0;
  for (const m of parsedCounts) {
    totalMatches += m.count;
  }
  const sortedCounts = [...parsedCounts];
  sortedCounts.sort((a, b) => b.count - a.count || compareStrings(a.path, b.path));
  const compacted = [`[grep count: ${totalMatches} match(es) across ${parsedCounts.length} file(s) with matches]`];
  compacted.push("");
  compacted.push("Top files by match count:");
  for (const m of sortedCounts.slice(0, TOP_COUNT_ROWS)) {
    compacted.push(`  ${String(m.count).padStart(6)}  ${m.path}`);
  }
  if (sortedCounts.length > TOP_COUNT_ROWS) {
    compacted.push(`  ... ${sortedCounts.length - TOP_COUNT_ROWS} more file(s) omitted`);
  }
  const directoryCounts = summarizeCountDirectories(parsedCounts);
  if (directoryCounts.length !== 0) {
    compacted.push("");
    compacted.push("Top directories by match count:");
    for (const summary of directoryCounts.slice(0, TOP_COUNT_ROWS)) {
      compacted.push(`  ${String(summary.count).padStart(6)} in ${summary.files} file(s)  ${summary.directory}`);
    }
    if (directoryCounts.length > TOP_COUNT_ROWS) {
      const omittedDirectories = directoryCounts.length - TOP_COUNT_ROWS;
      compacted.push(`  ... ${omittedDirectories} more director${omittedDirectories === 1 ? "y" : "ies"} omitted`);
    }
  }
  const extensionSummary = summarizeExtensions(parsedCounts.map((m) => m.path));
  if (extensionSummary.length !== 0) {
    compacted.push("");
    compacted.push(`[extensions: ${extensionSummary}]`);
  }
  return lossy(compacted.join("\n"));
}
function parseGrepCountLine(line) {
  const split = rsplitOnce(line, ":");
  if (split === void 0) {
    return void 0;
  }
  const [path, count] = split;
  if (path.length === 0) {
    return void 0;
  }
  const parsed = parseUsize(count);
  if (parsed === void 0) {
    return void 0;
  }
  return { path, count: parsed };
}
function summarizeCountDirectories(counts) {
  const directories = /* @__PURE__ */ new Map();
  for (const m of counts) {
    const directory = directoryOfPath(m.path);
    let entry = directories.get(directory);
    if (entry === void 0) {
      entry = { directory, count: 0, files: 0 };
      directories.set(directory, entry);
    }
    entry.count += m.count;
    entry.files += 1;
  }
  const values = [...directories.values()];
  values.sort((a, b) => b.count - a.count || b.files - a.files || compareStrings(a.directory, b.directory));
  return values;
}
function compactPathListOutput(output, label, largeOutputThreshold) {
  const paths = splitToolOutputLines(output).map((line) => normalizeDisplayPathSeparators(line));
  if (shouldSkipToolOutputCompaction(paths, output, 25)) {
    return unchanged(output);
  }
  const commonPrefix = commonDirectoryPrefix(paths);
  const groups = /* @__PURE__ */ new Map();
  for (const filePath of paths) {
    const groupPath = pathListGroupPath(filePath, commonPrefix);
    const list = groups.get(groupPath);
    if (list !== void 0) {
      list.push(filePath);
    } else {
      groups.set(groupPath, [filePath]);
    }
  }
  const sortedGroups = [...groups.entries()];
  sortedGroups.sort((a, b) => b[1].length - a[1].length || compareStrings(a[0], b[0]));
  const bodyBudget = compactedBodyBudget(largeOutputThreshold);
  const primary = renderPathListGroups(
    paths,
    label,
    commonPrefix,
    sortedGroups,
    sortedGroups.length,
    false
  );
  if (byteLength(primary) >= byteLength(output) && fitsLargeOutputThreshold(output, largeOutputThreshold)) {
    return unchanged(output);
  }
  if (fitsLargeOutputThreshold(primary, bodyBudget)) {
    return { output: primary, lossless: true };
  }
  return lossy(renderBudgetedFlatPathList(
    paths,
    label,
    commonPrefix,
    largeOutputThreshold
  ));
}
function renderPathListGroups(paths, label, commonPrefix, sortedGroups, maxGroups, compactSelection) {
  const compacted = [`[${label}: ${paths.length} path(s)${commonPrefix.length === 0 ? "" : ` under ${commonPrefix}`}; grouped by directory]`];
  for (const [groupPath, groupPaths] of sortedGroups.slice(0, maxGroups)) {
    const sortedGroupPaths = [...groupPaths];
    sortedGroupPaths.sort((a, b) => naturalCmp(a, b));
    compacted.push("");
    compacted.push(`${groupPath}/ (${groupPaths.length} path(s))`);
    const shown = compactSelection ? selectHeadTailToShow(sortedGroupPaths) : indexAll(sortedGroupPaths);
    let previousIndex;
    for (const { item: filePath, index } of shown) {
      if (previousIndex !== void 0 && index > previousIndex + 1) {
        compacted.push(`  ... ${index - previousIndex - 1} more path(s) in this group`);
      }
      compacted.push(`  ${displayPathInPathListGroup(filePath, groupPath)}`);
      previousIndex = index;
    }
    const omittedAfterLast = previousIndex !== void 0 ? saturatingSub(groupPaths.length, previousIndex + 1) : groupPaths.length;
    if (omittedAfterLast > 0) {
      compacted.push(`  ... ${omittedAfterLast} more path(s) in this group`);
    }
  }
  if (sortedGroups.length > maxGroups) {
    const omittedPaths = totalGroupItems(sortedGroups.slice(maxGroups));
    compacted.push("");
    compacted.push(`[omitted ${omittedPaths} path(s) in ${sortedGroups.length - maxGroups} smaller group(s)]`);
  }
  const extensionSummary = summarizeExtensions(paths);
  if (extensionSummary.length !== 0) {
    compacted.push("");
    compacted.push(`[extensions: ${extensionSummary}]`);
  }
  return compacted.join("\n");
}
function selectHeadTailToShow(items) {
  if (items.length <= 40) {
    return indexAll(items);
  }
  const indexes = [];
  for (let i = 0; i < 12; i++) {
    indexes.push(i);
  }
  for (let i = items.length - 12; i < items.length; i++) {
    indexes.push(i);
  }
  return indexes.map((index) => ({ index, item: items[index] }));
}
function renderBudgetedFlatPathList(paths, label, commonPrefix, largeOutputThreshold) {
  const sortedPaths = sortPathsForConcretePreview(paths);
  const extensionSummary = summarizeExtensions(paths);
  const budget = compactedBodyBudget(largeOutputThreshold);
  const selected = [];
  const lines = [`[${label}: ${paths.length} path(s)${commonPrefix.length === 0 ? "" : ` under ${truncatePathMiddle(commonPrefix, COMMON_PREFIX_DISPLAY_WIDTH)}`}; concrete paths]`];
  let selectedBytes = joinedLineBytes(lines);
  for (const filePath of sortedPaths) {
    let displayPath = displayPathUnderPrefix(filePath, commonPrefix);
    const suffixLines = pathListSuffixLines(selected.length + 1, paths.length, extensionSummary);
    const suffixBytes = joinedLineBytes(suffixLines);
    const separatorBytes = suffixBytes > 0 || lines.length !== 0 ? 1 : 0;
    const nextBytes = selectedBytes + 1 + byteLength(displayPath);
    if (nextBytes + separatorBytes + suffixBytes > budget) {
      if (selected.length !== 0) {
        break;
      }
      if (selectedBytes > budget) {
        break;
      }
      let available = budget - selectedBytes;
      if (separatorBytes > available) {
        break;
      }
      available -= separatorBytes;
      if (suffixBytes > available) {
        break;
      }
      available -= suffixBytes;
      if (available === 0) {
        break;
      }
      displayPath = truncatePathMiddle(displayPath, available);
      if (selectedBytes + 1 + byteLength(displayPath) + separatorBytes + suffixBytes > budget) {
        break;
      }
    }
    selectedBytes += 1 + byteLength(displayPath);
    selected.push(displayPath);
  }
  lines.push(...selected);
  lines.push(...pathListSuffixLines(selected.length, paths.length, extensionSummary));
  return lines.join("\n");
}
function pathListSuffixLines(selectedCount, pathCount, extensionSummary) {
  const lines = [];
  if (selectedCount < pathCount) {
    lines.push(`[omitted ${pathCount - selectedCount} path(s); see original output for full results]`);
  }
  if (extensionSummary.length !== 0) {
    lines.push(`[extensions: ${truncateInlineText(extensionSummary, EXTENSION_SUMMARY_INLINE_WIDTH)}]`);
  }
  return lines;
}
function sortPathsForConcretePreview(paths) {
  const extensionCounts = /* @__PURE__ */ new Map();
  for (const filePath of paths) {
    const extension = pathExtension(filePath);
    extensionCounts.set(extension, (extensionCounts.get(extension) ?? 0) + 1);
  }
  const sorted = [...paths];
  sorted.sort((a, b) => {
    const countA = extensionCounts.get(pathExtension(a)) ?? 0;
    const countB = extensionCounts.get(pathExtension(b)) ?? 0;
    return countA - countB || naturalCmp(a, b);
  });
  return sorted;
}
function displayPathInPathListGroup(filePath, groupPath) {
  if (groupPath === ".") {
    return filePath;
  }
  const prefix = groupPath.endsWith("/") ? groupPath : `${groupPath}/`;
  return stripPrefix(filePath, prefix) ?? filePath;
}
function pathListGroupPath(filePath, commonPrefix) {
  const relative = commonPrefix.length === 0 ? filePath : trimStartMatchesChars(filePath.slice(commonPrefix.length), ["/"]);
  if (relative.length === 0 || !relative.includes("/")) {
    return joinDisplayPath(commonPrefix, ".");
  }
  const segments = trimStartMatchesChars(relative, ["/"]).split("/");
  const firstSegment = segments.length > 0 ? segments[0] : "";
  const segment = firstSegment.length === 0 ? "." : firstSegment;
  return joinDisplayPath(commonPrefix, segment);
}
function commonDirectoryPrefix(paths) {
  if (paths.length === 0) {
    return "";
  }
  const directories = paths.map((filePath) => {
    const index = filePath.lastIndexOf("/");
    return index > 0 ? filePath.slice(0, index) : "";
  });
  const firstParts = directories[0].split("/");
  let prefixLength = firstParts.length;
  for (const directory of directories.slice(1)) {
    const parts = directory.split("/");
    let i = 0;
    while (i < prefixLength && i < parts.length && firstParts[i] === parts[i]) {
      i += 1;
    }
    prefixLength = i;
  }
  return firstParts.slice(0, prefixLength).join("/");
}
function directoryOfPath(filePath) {
  const normalized = normalizeDisplayPathSeparators(filePath);
  const index = normalized.lastIndexOf("/");
  return index > 0 ? normalized.slice(0, index) : ".";
}
function splitToolOutputLines(output) {
  if (output.length === 0) {
    return [];
  }
  const pieces = [];
  let start = 0;
  for (let i = 0; i < output.length; i++) {
    if (output[i] === "\n") {
      pieces.push(output.slice(start, i + 1));
      start = i + 1;
    }
  }
  if (start < output.length) {
    pieces.push(output.slice(start));
  }
  const result = [];
  for (const piece of pieces) {
    let line = piece;
    if (line.endsWith("\r\n")) {
      line = line.slice(0, line.length - 2);
    } else if (line.endsWith("\n")) {
      line = line.slice(0, line.length - 1);
    }
    if (line.length !== 0) {
      result.push(line);
    }
  }
  return result;
}
function joinDisplayPath(prefix, child) {
  if (prefix.length === 0 || child === ".") {
    return prefix.length === 0 ? child : prefix;
  }
  return `${prefix.replace(/\/+$/, "")}/${child}`;
}
function normalizeDisplayPathSeparators(filePath) {
  return filePath.replaceAll("\\", "/");
}
function displayPathUnderPrefix(filePath, commonPrefix) {
  const normalized = normalizeDisplayPathSeparators(filePath);
  if (commonPrefix.length === 0) {
    return normalized;
  }
  const relative = trimStartMatchesChars(normalized.slice(commonPrefix.length), ["/"]);
  return relative.length === 0 ? "." : relative;
}
function summarizeExtensions(paths) {
  const counts = [];
  for (const filePath of paths) {
    const extension = pathExtension(filePath);
    const existing = counts.find((candidate) => candidate.extension === extension);
    if (existing !== void 0) {
      existing.count += 1;
    } else {
      counts.push({ extension, count: 1 });
    }
  }
  counts.sort((a, b) => b.count - a.count);
  return counts.slice(0, 8).map((entry) => `${entry.extension}=${entry.count}`).join(", ");
}
function pathExtension(filePath) {
  const pathOnly = filePath.split("::")[0];
  const slashSegments = pathOnly.split("/");
  const basename = slashSegments[slashSegments.length - 1];
  const index = basename.lastIndexOf(".");
  if (index < 0) {
    return "[no extension]";
  }
  if (index === 0 || index === basename.length - 1) {
    return "[no extension]";
  }
  return basename.slice(index);
}
function compareStrings(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}
export {
  classifyCommand,
  compact,
  compactShellOutput
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsQ29udHJpYlxcY2hhdEFnZW50VG9vbHNcXGJyb3dzZXJcXHRvb2xzXFxjb25zb2xlQ29tcGFjdG9yXFxjb25zb2xlQ29tcGFjdG9yLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuLy8gU2hlbGwtb3V0cHV0IGNvbXBhY3Rvci4gQ2xhc3NpZmllcyBzaGVsbCBjb21tYW5kcyBhbmQgc3RyaXBzIG5vbi1kaWFnbm9zdGljXG4vLyBub2lzZSBmcm9tIHRoZWlyIG91dHB1dC4gVGhpcyBpcyBhIGZhaXRoZnVsIFR5cGVTY3JpcHQgcG9ydCBvZiB0aGUgb3JpZ2luYWxcbi8vIFJ1c3QgaW1wbGVtZW50YXRpb24gKGxpYi5ycywgcmVwb3J0LnJzLCBzaGVsbF9vdXRwdXRfY29tcGFjdG9yLnJzKS5cblxuLy8jcmVnaW9uIFB1YmxpYyBBUEkgdHlwZXNcblxuLyoqIENoYXJhY3RlciAoVVRGLTE2IGNvZGUgdW5pdHMpLCBieXRlIChVVEYtOCksIGFuZCBsaW5lIGNvdW50cyBmb3Igb25lIHRleHQuICovXG5leHBvcnQgaW50ZXJmYWNlIENvdW50cyB7XG5cdC8qKiBVVEYtMTYgY29kZSB1bml0cywgbWF0Y2hpbmcgSmF2YVNjcmlwdCBgU3RyaW5nLmxlbmd0aGAgc2VtYW50aWNzLiAqL1xuXHRyZWFkb25seSBjaGFyczogbnVtYmVyO1xuXHQvKiogVVRGLTggYnl0ZSBsZW5ndGguICovXG5cdHJlYWRvbmx5IGJ5dGVzOiBudW1iZXI7XG5cdHJlYWRvbmx5IGxpbmVzOiBudW1iZXI7XG59XG5cbi8qKiBQZXJjZW50YWdlIG9mIGVhY2ggY291bnQgcmVtb3ZlZCBieSBjb21wYWN0aW9uICgwLTEwMCkuICovXG5leHBvcnQgaW50ZXJmYWNlIFJlZHVjdGlvbiB7XG5cdHJlYWRvbmx5IGNoYXJzUGN0OiBudW1iZXI7XG5cdHJlYWRvbmx5IGJ5dGVzUGN0OiBudW1iZXI7XG5cdHJlYWRvbmx5IGxpbmVzUGN0OiBudW1iZXI7XG59XG5cbi8qKiBIb3cgYSBjb21tYW5kIHN0cmluZyB3YXMgY2xhc3NpZmllZCwgd2l0aG91dCBydW5uaW5nIGNvbXBhY3Rpb24uICovXG5leHBvcnQgaW50ZXJmYWNlIENvbW1hbmRDbGFzc2lmaWNhdGlvbiB7XG5cdC8qKiBDb21wYWN0b3IgdGFncyB0aGF0IG1hdGNoZWQsIGUuZy4gYFtcIm5wbVwiXWAsIGBbXCJjYXJnb1wiXWAsIGBbXCJzaGVsbC1ncmVwXCJdYC4gKi9cblx0cmVhZG9ubHkgY29tbWFuZEtpbmRzOiBzdHJpbmdbXTtcblx0cmVhZG9ubHkgaXNTb3VyY2VSZWFkQ29tbWFuZDogYm9vbGVhbjtcblx0cmVhZG9ubHkgcnVuc0dvVGVzdDogYm9vbGVhbjtcblx0cmVhZG9ubHkgbWVudGlvbnNTYXZlZFRvb2xPdXRwdXQ6IGJvb2xlYW47XG59XG5cbi8qKlxuICogVGhlIGZ1bGwgY29tcGFjdGlvbiByZXBvcnQ6IHN0YXRpc3RpY3MgYWJvdXQgd2hhdCB3YXMgcmVtb3ZlZCwgcGx1cyB0aGVcbiAqIGNvbXBhY3RlZCB0ZXh0IGl0c2VsZi5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBSZXBvcnQge1xuXHRyZWFkb25seSBjb21tYW5kOiBzdHJpbmc7XG5cdC8qKiBXaGV0aGVyIGNvbXBhY3Rpb24gYWN0dWFsbHkgY2hhbmdlZCB0aGUgb3V0cHV0LiAqL1xuXHRyZWFkb25seSBhcHBsaWVkOiBib29sZWFuO1xuXHQvKiogV2hldGhlciB0aGUgY29tcGFjdGlvbiBwcmVzZXJ2ZWQgYWxsIGluZm9ybWF0aW9uIChubyBkYXRhIGRyb3BwZWQpLiAqL1xuXHRyZWFkb25seSBsb3NzbGVzczogYm9vbGVhbjtcblx0cmVhZG9ubHkgY29tbWFuZEtpbmRzOiBzdHJpbmdbXTtcblx0cmVhZG9ubHkgaXNTb3VyY2VSZWFkQ29tbWFuZDogYm9vbGVhbjtcblx0cmVhZG9ubHkgcnVuc0dvVGVzdDogYm9vbGVhbjtcblx0cmVhZG9ubHkgbWVudGlvbnNTYXZlZFRvb2xPdXRwdXQ6IGJvb2xlYW47XG5cdHJlYWRvbmx5IG9yaWdpbmFsOiBDb3VudHM7XG5cdHJlYWRvbmx5IGNvbXBhY3RlZDogQ291bnRzO1xuXHRyZWFkb25seSBzYXZlZDogQ291bnRzO1xuXHRyZWFkb25seSByZWR1Y3Rpb246IFJlZHVjdGlvbjtcblx0LyoqIFRoZSBjb21wYWN0ZWQgb3V0cHV0IHRleHQuIEVxdWFscyB0aGUgaW5wdXQgYG91dHB1dGAgd2hlbiBgYXBwbGllZGAgaXMgZmFsc2UuICovXG5cdHJlYWRvbmx5IGNvbXBhY3RlZE91dHB1dDogc3RyaW5nO1xufVxuXG4vKipcbiAqIFR1bmluZyBrbm9icyBmb3IgYGNvbXBhY3RgLiBFdmVyeSBmaWVsZCBpcyBvcHRpb25hbDsgb21pdHRlZCBmaWVsZHMgdXNlIHRoZVxuICogZG9jdW1lbnRlZCBkZWZhdWx0cy5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBDb21wYWN0T3B0aW9ucyB7XG5cdC8qKiBCeXRlIHRocmVzaG9sZCBhYm92ZSB3aGljaCBvdXRwdXQgaXMgdHJlYXRlZCBhcyBcImxhcmdlXCIuIERlZmF1bHQgMzAwMDAuICovXG5cdHJlYWRvbmx5IGxhcmdlT3V0cHV0VGhyZXNob2xkPzogbnVtYmVyO1xuXHQvKiogQnl0ZSB0aHJlc2hvbGQgdXNlZCBzcGVjaWZpY2FsbHkgZm9yIHNoZWxsIGBncmVwYC9gcmdgIG91dHB1dC4gRGVmYXVsdCAzMDAwMC4gKi9cblx0cmVhZG9ubHkgc2hlbGxHcmVwTGFyZ2VPdXRwdXRUaHJlc2hvbGQ/OiBudW1iZXI7XG5cdC8qKiBNaW5pbXVtIHNhdmVkIGNoYXJzIChVVEYtMTYgdW5pdHMpIGJlZm9yZSBjb21wYWN0aW9uIGlzIGFwcGxpZWQuIERlZmF1bHQgMC4gKi9cblx0cmVhZG9ubHkgbWluU2F2ZWRDaGFycz86IG51bWJlcjtcbn1cblxuLy8jZW5kcmVnaW9uXG5cbmNvbnN0IERFRkFVTFRfTEFSR0VfT1VUUFVUX1RIUkVTSE9MRCA9IDMwXzAwMDtcbmNvbnN0IERFRkFVTFRfU0hFTExfR1JFUF9MQVJHRV9PVVRQVVRfVEhSRVNIT0xEID0gMzBfMDAwO1xuY29uc3QgREVGQVVMVF9NSU5fU0FWRURfQ0hBUlMgPSAwO1xuXG4vKipcbiAqIENvbXBhY3QgdGhlIHJhdyBvdXRwdXQgb2YgYSBzaGVsbCBjb21tYW5kIGFuZCByZXBvcnQgaG93IG11Y2ggd2FzIHNhdmVkLlxuICpcbiAqIENsYXNzaWZpZXMgYGNvbW1hbmRgLCBjb21wYWN0cyBgb3V0cHV0YCBhY2NvcmRpbmdseSwgYW5kIHJldHVybnMgdGhlXG4gKiBzdGF0aXN0aWNzIHBsdXMgdGhlIGNvbXBhY3RlZCB0ZXh0LlxuICovXG5leHBvcnQgZnVuY3Rpb24gY29tcGFjdChjb21tYW5kOiBzdHJpbmcsIG91dHB1dDogc3RyaW5nLCBvcHRpb25zPzogQ29tcGFjdE9wdGlvbnMgfCBudWxsKTogUmVwb3J0IHtcblx0Y29uc3Qgb3B0cyA9IG9wdGlvbnMgPz8ge307XG5cdGNvbnN0IGxhcmdlT3V0cHV0VGhyZXNob2xkID0gb3B0cy5sYXJnZU91dHB1dFRocmVzaG9sZCA/PyBERUZBVUxUX0xBUkdFX09VVFBVVF9USFJFU0hPTEQ7XG5cdGNvbnN0IHNoZWxsR3JlcExhcmdlT3V0cHV0VGhyZXNob2xkID0gb3B0cy5zaGVsbEdyZXBMYXJnZU91dHB1dFRocmVzaG9sZCA/PyBERUZBVUxUX1NIRUxMX0dSRVBfTEFSR0VfT1VUUFVUX1RIUkVTSE9MRDtcblx0Y29uc3QgbWluaW11bVNhdmVkQ2hhcnMgPSBvcHRzLm1pblNhdmVkQ2hhcnMgPz8gREVGQVVMVF9NSU5fU0FWRURfQ0hBUlM7XG5cblx0Y29uc3QgY2xhc3NpZmljYXRpb24gPSBjbGFzc2lmeUNvbW1hbmRSZXN1bHQoY29tbWFuZCk7XG5cdGNvbnN0IHByZXZpZXcgPSBwcmV2aWV3U2hlbGxPdXRwdXRDb21wYWN0aW9uKFxuXHRcdGNvbW1hbmQsXG5cdFx0b3V0cHV0LFxuXHRcdGxhcmdlT3V0cHV0VGhyZXNob2xkLFxuXHRcdHNoZWxsR3JlcExhcmdlT3V0cHV0VGhyZXNob2xkLFxuXHRcdG1pbmltdW1TYXZlZENoYXJzLFxuXHQpO1xuXHRyZXR1cm4gYnVpbGRSZXBvcnQoY29tbWFuZCwgY2xhc3NpZmljYXRpb24sIG91dHB1dCwgcHJldmlldyk7XG59XG5cbi8qKiBDbGFzc2lmeSBhIHNoZWxsIGNvbW1hbmQgd2l0aG91dCBjb21wYWN0aW5nIGFueSBvdXRwdXQuICovXG5leHBvcnQgZnVuY3Rpb24gY2xhc3NpZnlDb21tYW5kKGNvbW1hbmQ6IHN0cmluZyk6IENvbW1hbmRDbGFzc2lmaWNhdGlvbiB7XG5cdGNvbnN0IHJlc3VsdCA9IGNsYXNzaWZ5Q29tbWFuZFJlc3VsdChjb21tYW5kKTtcblx0cmV0dXJuIHtcblx0XHRjb21tYW5kS2luZHM6IHJlc3VsdC5jb21tYW5kS2luZHMuc2xpY2UoKSxcblx0XHRpc1NvdXJjZVJlYWRDb21tYW5kOiByZXN1bHQuaXNTb3VyY2VSZWFkQ29tbWFuZCxcblx0XHRydW5zR29UZXN0OiByZXN1bHQucnVuc0dvVGVzdCxcblx0XHRtZW50aW9uc1NhdmVkVG9vbE91dHB1dDogcmVzdWx0Lm1lbnRpb25zU2F2ZWRUb29sT3V0cHV0LFxuXHR9O1xufVxuXG4vLyNyZWdpb24gcmVwb3J0LnJzXG5cbmNvbnN0IHRleHRFbmNvZGVyID0gbmV3IFRleHRFbmNvZGVyKCk7XG5cbmZ1bmN0aW9uIGJ5dGVMZW5ndGgodmFsdWU6IHN0cmluZyk6IG51bWJlciB7XG5cdHJldHVybiB0ZXh0RW5jb2Rlci5lbmNvZGUodmFsdWUpLmxlbmd0aDtcbn1cblxuLyoqIE51bWJlciBvZiBsaW5lcyB1c2luZyBSdXN0IGBzdHI6OmxpbmVzKClgIHNlbWFudGljcyAoZW1wdHkgc3RyaW5nID0gMCkuICovXG5mdW5jdGlvbiBjb3VudExpbmVzKHRleHQ6IHN0cmluZyk6IG51bWJlciB7XG5cdGlmICh0ZXh0Lmxlbmd0aCA9PT0gMCkge1xuXHRcdHJldHVybiAwO1xuXHR9XG5cdGxldCBjb3VudCA9IHRleHQuc3BsaXQoJ1xcbicpLmxlbmd0aDtcblx0aWYgKHRleHQuZW5kc1dpdGgoJ1xcbicpKSB7XG5cdFx0Y291bnQgLT0gMTtcblx0fVxuXHRyZXR1cm4gY291bnQ7XG59XG5cbmZ1bmN0aW9uIGNvdW50c09mKHRleHQ6IHN0cmluZyk6IENvdW50cyB7XG5cdHJldHVybiB7XG5cdFx0Y2hhcnM6IHRleHQubGVuZ3RoLFxuXHRcdGJ5dGVzOiBieXRlTGVuZ3RoKHRleHQpLFxuXHRcdGxpbmVzOiBjb3VudExpbmVzKHRleHQpLFxuXHR9O1xufVxuXG5mdW5jdGlvbiBtaW51c0NvdW50cyhzZWxmOiBDb3VudHMsIG90aGVyOiBDb3VudHMpOiBDb3VudHMge1xuXHRyZXR1cm4ge1xuXHRcdGNoYXJzOiBzYXR1cmF0aW5nU3ViKHNlbGYuY2hhcnMsIG90aGVyLmNoYXJzKSxcblx0XHRieXRlczogc2F0dXJhdGluZ1N1YihzZWxmLmJ5dGVzLCBvdGhlci5ieXRlcyksXG5cdFx0bGluZXM6IHNhdHVyYXRpbmdTdWIoc2VsZi5saW5lcywgb3RoZXIubGluZXMpLFxuXHR9O1xufVxuXG5mdW5jdGlvbiByZWR1Y3Rpb25PZihzYXZlZDogQ291bnRzLCBvcmlnaW5hbDogQ291bnRzKTogUmVkdWN0aW9uIHtcblx0cmV0dXJuIHtcblx0XHRjaGFyc1BjdDogcGN0KHNhdmVkLmNoYXJzLCBvcmlnaW5hbC5jaGFycyksXG5cdFx0Ynl0ZXNQY3Q6IHBjdChzYXZlZC5ieXRlcywgb3JpZ2luYWwuYnl0ZXMpLFxuXHRcdGxpbmVzUGN0OiBwY3Qoc2F2ZWQubGluZXMsIG9yaWdpbmFsLmxpbmVzKSxcblx0fTtcbn1cblxuZnVuY3Rpb24gcGN0KHBhcnQ6IG51bWJlciwgd2hvbGU6IG51bWJlcik6IG51bWJlciB7XG5cdGlmICh3aG9sZSA9PT0gMCkge1xuXHRcdHJldHVybiAwO1xuXHR9XG5cdHJldHVybiAocGFydCAvIHdob2xlKSAqIDEwMDtcbn1cblxuZnVuY3Rpb24gYnVpbGRSZXBvcnQoXG5cdGNvbW1hbmQ6IHN0cmluZyxcblx0Y2xhc3NpZmljYXRpb246IENvbW1hbmRDbGFzc2lmaWNhdGlvbixcblx0b3JpZ2luYWw6IHN0cmluZyxcblx0cHJldmlldzogU2hlbGxPdXRwdXRQcmV2aWV3UmVzdWx0IHwgdW5kZWZpbmVkLFxuKTogUmVwb3J0IHtcblx0Y29uc3QgY29tcGFjdGVkVGV4dCA9IHByZXZpZXcgPyBwcmV2aWV3Lm91dHB1dCA6IG9yaWdpbmFsO1xuXG5cdGNvbnN0IG9yaWdpbmFsQ291bnRzID0gY291bnRzT2Yob3JpZ2luYWwpO1xuXHRjb25zdCBjb21wYWN0ZWRDb3VudHMgPSBjb3VudHNPZihjb21wYWN0ZWRUZXh0KTtcblx0Y29uc3Qgc2F2ZWQgPSBtaW51c0NvdW50cyhvcmlnaW5hbENvdW50cywgY29tcGFjdGVkQ291bnRzKTtcblx0Y29uc3QgcmVkdWN0aW9uID0gcmVkdWN0aW9uT2Yoc2F2ZWQsIG9yaWdpbmFsQ291bnRzKTtcblxuXHRyZXR1cm4ge1xuXHRcdGNvbW1hbmQsXG5cdFx0YXBwbGllZDogcHJldmlldyAhPT0gdW5kZWZpbmVkLFxuXHRcdGxvc3NsZXNzOiBwcmV2aWV3ID09PSB1bmRlZmluZWQgPyB0cnVlIDogcHJldmlldy5sb3NzbGVzcyxcblx0XHRjb21tYW5kS2luZHM6IGNsYXNzaWZpY2F0aW9uLmNvbW1hbmRLaW5kcy5zbGljZSgpLFxuXHRcdGlzU291cmNlUmVhZENvbW1hbmQ6IGNsYXNzaWZpY2F0aW9uLmlzU291cmNlUmVhZENvbW1hbmQsXG5cdFx0cnVuc0dvVGVzdDogY2xhc3NpZmljYXRpb24ucnVuc0dvVGVzdCxcblx0XHRtZW50aW9uc1NhdmVkVG9vbE91dHB1dDogY2xhc3NpZmljYXRpb24ubWVudGlvbnNTYXZlZFRvb2xPdXRwdXQsXG5cdFx0b3JpZ2luYWw6IG9yaWdpbmFsQ291bnRzLFxuXHRcdGNvbXBhY3RlZDogY29tcGFjdGVkQ291bnRzLFxuXHRcdHNhdmVkLFxuXHRcdHJlZHVjdGlvbixcblx0XHRjb21wYWN0ZWRPdXRwdXQ6IGNvbXBhY3RlZFRleHQsXG5cdH07XG59XG5cbi8vI2VuZHJlZ2lvblxuXG4vLyNyZWdpb24gc2hlbGxfb3V0cHV0X2NvbXBhY3Rvci5ycyBcdTIwMTQgY29uc3RhbnRzIGFuZCB0eXBlc1xuXG5jb25zdCBDT01QQUNURURfUkVGRVJFTkNFX09WRVJIRUFEX0JVREdFVCA9IDUxMjtcbmNvbnN0IENPTU1PTl9QUkVGSVhfRElTUExBWV9XSURUSCA9IDEyMDtcbmNvbnN0IEVYVEVOU0lPTl9TVU1NQVJZX0lOTElORV9XSURUSCA9IDE2MDtcbmNvbnN0IEdPX1JVTlRJTUVfUEFOSUNfTUlOX0dPUk9VVElORVMgPSA4O1xuY29uc3QgQ0FSR09fUFJPR1JFU1NfUFJFRklYRVM6IHJlYWRvbmx5IHN0cmluZ1tdID0gW1xuXHQnVXBkYXRpbmcgJyxcblx0J0Rvd25sb2FkaW5nICcsXG5cdCdEb3dubG9hZGVkICcsXG5cdCdDb21waWxpbmcgJyxcblx0J0NoZWNraW5nICcsXG5cdCdGcmVzaCAnLFxuXHQnTG9ja2luZyAnLFxuXHQnQWRkaW5nICcsXG5cdCdCdWlsZGluZyAnLFxuXTtcbmNvbnN0IENPTU1BTkRfQ09NUEFDVE9SX09SREVSOiByZWFkb25seSBzdHJpbmdbXSA9IFtcblx0J2FwdCcsXG5cdCducG0nLFxuXHQnbnBtLXBhY2snLFxuXHQneWFybi1iZXJyeScsXG5cdCdwbnBtJyxcblx0J2NvbXBvc2VyJyxcblx0J3BvZXRyeScsXG5cdCdwaXAnLFxuXHQndXYnLFxuXHQnbWF2ZW4nLFxuXHQnZG90bmV0Jyxcblx0J3B5dGhvbi1idWlsZCcsXG5cdCdnbycsXG5cdCd1bml0dGVzdCcsXG5cdCdqcy10ZXN0Jyxcblx0J2NhcmdvJyxcblx0J25vZGUnLFxuXHQncHl0ZXN0Jyxcblx0J2dpdCcsXG5cdCdnaXQtY2xlYW4nLFxuXHQnbngnLFxuXHQncHl0aG9uLWJ1aWxkLWV4dCcsXG5cdCdkamFuZ28tdGVzdCcsXG5cdCdnb2xhbmdjaS1saW50Jyxcblx0J2NsYW5nLWZvcm1hdC1saW50ZXInLFxuXHQnZ3JhZGxlJyxcblx0J2NtYWtlJyxcblx0J21ha2UnLFxuXHQnc2hlbGwtZ3JlcCcsXG5cdCdweXRob24tc2NyaXB0Jyxcbl07XG5cbnR5cGUgVG9vbE91dHB1dENvbXBhY3Rpb25LaW5kID0gJ2dyZXAtY29udGVudCcgfCAnZ3JlcC1wYXRocycgfCAnZ3JlcC1jb3VudCcgfCAnZ2xvYic7XG5cbmludGVyZmFjZSBUb29sQ29tcGFjdGlvblJlc3VsdCB7XG5cdG91dHB1dDogc3RyaW5nO1xuXHRsb3NzbGVzczogYm9vbGVhbjtcbn1cblxuaW50ZXJmYWNlIENvbW1hbmRDbGFzc2lmaWNhdGlvblJlc3VsdCB7XG5cdGNvbW1hbmRLaW5kczogc3RyaW5nW107XG5cdGlzU291cmNlUmVhZENvbW1hbmQ6IGJvb2xlYW47XG5cdHJ1bnNHb1Rlc3Q6IGJvb2xlYW47XG5cdG1lbnRpb25zU2F2ZWRUb29sT3V0cHV0OiBib29sZWFuO1xufVxuXG5pbnRlcmZhY2UgU2hlbGxPdXRwdXRQcmV2aWV3UmVzdWx0IHtcblx0b3V0cHV0OiBzdHJpbmc7XG5cdHNhdmVkQ2hhcnM6IG51bWJlcjtcblx0bG9zc2xlc3M6IGJvb2xlYW47XG59XG5cbi8qKiBEaXNjcmltaW5hdGVkIHVuaW9uIG1pcnJvcmluZyBSdXN0IGBDbGFzc2lmaWVkQ29tbWFuZFNlZ21lbnRgLiAqL1xudHlwZSBDbGFzc2lmaWVkQ29tbWFuZFNlZ21lbnQgPSB7IHJlYWRvbmx5IGJlbmlnbjogdHJ1ZSB9IHwgeyByZWFkb25seSBiZW5pZ246IGZhbHNlOyByZWFkb25seSBraW5kOiBzdHJpbmcgfTtcblxuY29uc3QgQkVOSUdOX1NFR01FTlQ6IENsYXNzaWZpZWRDb21tYW5kU2VnbWVudCA9IHsgYmVuaWduOiB0cnVlIH07XG5cbmZ1bmN0aW9uIGNvbXBhY3RTZWdtZW50KGtpbmQ6IHN0cmluZyk6IENsYXNzaWZpZWRDb21tYW5kU2VnbWVudCB7XG5cdHJldHVybiB7IGJlbmlnbjogZmFsc2UsIGtpbmQgfTtcbn1cblxuZnVuY3Rpb24gc2VnbWVudHNFcXVhbChhOiBDbGFzc2lmaWVkQ29tbWFuZFNlZ21lbnQsIGI6IENsYXNzaWZpZWRDb21tYW5kU2VnbWVudCk6IGJvb2xlYW4ge1xuXHRpZiAoYS5iZW5pZ24gfHwgYi5iZW5pZ24pIHtcblx0XHRyZXR1cm4gYS5iZW5pZ24gPT09IGIuYmVuaWduO1xuXHR9XG5cdHJldHVybiBhLmtpbmQgPT09IGIua2luZDtcbn1cblxuaW50ZXJmYWNlIEhlcmVkb2NTdHJpcHBlZENvbW1hbmQge1xuXHRjb21tYW5kOiBzdHJpbmc7XG5cdGhlcmVkb2NTdGRpblNlZ21lbnRJbmRleGVzOiBTZXQ8bnVtYmVyPjtcbn1cblxuaW50ZXJmYWNlIEhlcmVkb2NPcGVuZXIge1xuXHRwcmVmaXg6IHN0cmluZztcblx0c3VmZml4OiBzdHJpbmc7XG5cdGRlbGltaXRlcjogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgSW5kZXhlZDxUPiB7XG5cdGluZGV4OiBudW1iZXI7XG5cdGl0ZW06IFQ7XG59XG5cbmludGVyZmFjZSBQYWNrYWdlTWFuYWdlck9wZXJhdGlvbiB7XG5cdG9wZXJhdGlvbjogc3RyaW5nO1xuXHRwa2c6IHN0cmluZztcblx0dmVyc2lvbjogc3RyaW5nIHwgdW5kZWZpbmVkO1xufVxuXG4vLyNlbmRyZWdpb25cblxuLy8jcmVnaW9uIFByaW1pdGl2ZSBoZWxwZXJzXG5cbi8qKiBMZW5ndGggaW4gVVRGLTE2IGNvZGUgdW5pdHMsIG1hdGNoaW5nIEphdmFTY3JpcHQgYFN0cmluZy5sZW5ndGhgLiAqL1xuZnVuY3Rpb24ganNTdHJpbmdMZW4odmFsdWU6IHN0cmluZyk6IG51bWJlciB7XG5cdHJldHVybiB2YWx1ZS5sZW5ndGg7XG59XG5cbi8qKlxuICogU2xpY2UgYnkgVVRGLTE2IGNvZGUgdW5pdHMgKEphdmFTY3JpcHQgbmF0aXZlIHN0cmluZyBzZW1hbnRpY3MpLiBNaXJyb3JzIHRoZVxuICogUnVzdCBgc2xpY2VfanNfdW5pdHNgIGhlbHBlciwgd2hpY2ggZW11bGF0ZWQgSlMgc2xpY2luZy5cbiAqL1xuZnVuY3Rpb24gc2xpY2VKc1VuaXRzKHRleHQ6IHN0cmluZywgc3RhcnQ6IG51bWJlciwgbGVuOiBudW1iZXIpOiBzdHJpbmcge1xuXHRpZiAobGVuID09PSAwKSB7XG5cdFx0cmV0dXJuICcnO1xuXHR9XG5cdHJldHVybiB0ZXh0LnNsaWNlKHN0YXJ0LCBzdGFydCArIGxlbik7XG59XG5cbi8qKiBSdXN0IGBzdHI6OnNwbGl0X3doaXRlc3BhY2VgOiBzcGxpdCBvbiBydW5zIG9mIHdoaXRlc3BhY2UsIGRyb3BwaW5nIGVtcHRpZXMuICovXG5mdW5jdGlvbiBzcGxpdFdoaXRlc3BhY2UodmFsdWU6IHN0cmluZyk6IHN0cmluZ1tdIHtcblx0Y29uc3QgdHJpbW1lZCA9IHZhbHVlLnRyaW0oKTtcblx0cmV0dXJuIHRyaW1tZWQubGVuZ3RoID09PSAwID8gW10gOiB0cmltbWVkLnNwbGl0KC9cXHMrLyk7XG59XG5cbmZ1bmN0aW9uIHNhdHVyYXRpbmdTdWIoYTogbnVtYmVyLCBiOiBudW1iZXIpOiBudW1iZXIge1xuXHRyZXR1cm4gYSA+IGIgPyBhIC0gYiA6IDA7XG59XG5cbi8qKiBDb21wYXJlIHR3byBlcXVhbC1sZW5ndGggd2luZG93cyBvZiBhbiBhcnJheSBmb3IgZWxlbWVudCBlcXVhbGl0eS4gKi9cbmZ1bmN0aW9uIGFycmF5U2xpY2VFcXVhbChhcnI6IHN0cmluZ1tdLCBhU3RhcnQ6IG51bWJlciwgYlN0YXJ0OiBudW1iZXIsIGxlbjogbnVtYmVyKTogYm9vbGVhbiB7XG5cdGZvciAobGV0IGsgPSAwOyBrIDwgbGVuOyBrKyspIHtcblx0XHRpZiAoYXJyW2FTdGFydCArIGtdICE9PSBhcnJbYlN0YXJ0ICsga10pIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIHRydWU7XG59XG5cbmZ1bmN0aW9uIGlzQXNjaWlEaWdpdChjaDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiBjaCA+PSAnMCcgJiYgY2ggPD0gJzknO1xufVxuXG5mdW5jdGlvbiBpc0FzY2lpQWxwaGFiZXRpYyhjaDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiAoY2ggPj0gJ0EnICYmIGNoIDw9ICdaJykgfHwgKGNoID49ICdhJyAmJiBjaCA8PSAneicpO1xufVxuXG4vKiogUmVtb3ZlIGFsbCBsZWFkaW5nIGNoYXJhY3RlcnMgdGhhdCBhcHBlYXIgaW4gYGNoYXJzYC4gKi9cbmZ1bmN0aW9uIHRyaW1TdGFydE1hdGNoZXNDaGFycyh2YWx1ZTogc3RyaW5nLCBjaGFyczogc3RyaW5nW10pOiBzdHJpbmcge1xuXHRsZXQgaSA9IDA7XG5cdHdoaWxlIChpIDwgdmFsdWUubGVuZ3RoICYmIGNoYXJzLmluY2x1ZGVzKHZhbHVlW2ldKSkge1xuXHRcdGkgKz0gMTtcblx0fVxuXHRyZXR1cm4gdmFsdWUuc2xpY2UoaSk7XG59XG5cbmZ1bmN0aW9uIHJlZ2V4UmVwbGFjZUFsbChwYXR0ZXJuOiBzdHJpbmcsIGlucHV0OiBzdHJpbmcsIHJlcGxhY2VtZW50OiBzdHJpbmcpOiBzdHJpbmcge1xuXHRyZXR1cm4gaW5wdXQucmVwbGFjZShuZXcgUmVnRXhwKHBhdHRlcm4sICdnJyksIHJlcGxhY2VtZW50KTtcbn1cblxuZnVuY3Rpb24gcmVnZXhUZXN0KHBhdHRlcm46IHN0cmluZywgaW5wdXQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gcmVnZXhUZXN0V2l0aEZsYWdzKHBhdHRlcm4sIGlucHV0LCAnJyk7XG59XG5cbmZ1bmN0aW9uIHJlZ2V4VGVzdFdpdGhGbGFncyhwYXR0ZXJuOiBzdHJpbmcsIGlucHV0OiBzdHJpbmcsIGZsYWdzOiBzdHJpbmcpOiBib29sZWFuIHtcblx0cmV0dXJuIG5ldyBSZWdFeHAocGF0dGVybiwgZmxhZ3MpLnRlc3QoaW5wdXQpO1xufVxuXG5mdW5jdGlvbiByZWdleEZpbmQocGF0dGVybjogc3RyaW5nLCBpbnB1dDogc3RyaW5nKTogbnVtYmVyIHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgbWF0Y2ggPSBuZXcgUmVnRXhwKHBhdHRlcm4pLmV4ZWMoaW5wdXQpO1xuXHRyZXR1cm4gbWF0Y2ggPyBtYXRjaC5pbmRleCA6IHVuZGVmaW5lZDtcbn1cblxuZnVuY3Rpb24gcmVnZXhDYXB0dXJlRmlyc3QocGF0dGVybjogc3RyaW5nLCBpbnB1dDogc3RyaW5nKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgbWF0Y2ggPSBuZXcgUmVnRXhwKHBhdHRlcm4pLmV4ZWMoaW5wdXQpO1xuXHRpZiAobWF0Y2ggJiYgbWF0Y2hbMV0gIT09IHVuZGVmaW5lZCkge1xuXHRcdHJldHVybiBtYXRjaFsxXTtcblx0fVxuXHRyZXR1cm4gdW5kZWZpbmVkO1xufVxuXG4vKiogUnVzdCBgUmVnZXg6OmZpbmRfaXRlcmA6IHJldHVybnMgdGhlIGNvZGUtdW5pdCByYW5nZXMgb2YgZXZlcnkgbm9uLW92ZXJsYXBwaW5nIG1hdGNoLiAqL1xuZnVuY3Rpb24gcmVnZXhGaW5kQWxsKHBhdHRlcm46IHN0cmluZywgaW5wdXQ6IHN0cmluZyk6IHsgc3RhcnQ6IG51bWJlcjsgZW5kOiBudW1iZXIgfVtdIHtcblx0Y29uc3QgcmVnZXggPSBuZXcgUmVnRXhwKHBhdHRlcm4sICdnJyk7XG5cdGNvbnN0IG1hdGNoZXM6IHsgc3RhcnQ6IG51bWJlcjsgZW5kOiBudW1iZXIgfVtdID0gW107XG5cdGxldCBtYXRjaDogUmVnRXhwRXhlY0FycmF5IHwgbnVsbDtcblx0d2hpbGUgKChtYXRjaCA9IHJlZ2V4LmV4ZWMoaW5wdXQpKSAhPT0gbnVsbCkge1xuXHRcdG1hdGNoZXMucHVzaCh7IHN0YXJ0OiBtYXRjaC5pbmRleCwgZW5kOiBtYXRjaC5pbmRleCArIG1hdGNoWzBdLmxlbmd0aCB9KTtcblx0XHRpZiAobWF0Y2hbMF0ubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZWdleC5sYXN0SW5kZXggKz0gMTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIG1hdGNoZXM7XG59XG5cbmZ1bmN0aW9uIHVuY2hhbmdlZChvdXRwdXQ6IHN0cmluZyk6IFRvb2xDb21wYWN0aW9uUmVzdWx0IHtcblx0cmV0dXJuIHsgb3V0cHV0LCBsb3NzbGVzczogdHJ1ZSB9O1xufVxuXG5mdW5jdGlvbiBsb3NzeShvdXRwdXQ6IHN0cmluZyk6IFRvb2xDb21wYWN0aW9uUmVzdWx0IHtcblx0cmV0dXJuIHsgb3V0cHV0LCBsb3NzbGVzczogZmFsc2UgfTtcbn1cblxuZnVuY3Rpb24gaW5kZXhBbGw8VD4oaXRlbXM6IHJlYWRvbmx5IFRbXSk6IEluZGV4ZWQ8VD5bXSB7XG5cdHJldHVybiBpdGVtcy5tYXAoKGl0ZW0sIGluZGV4KSA9PiAoeyBpbmRleCwgaXRlbSB9KSk7XG59XG5cbmZ1bmN0aW9uIGpvaW5lZExpbmVCeXRlcyhsaW5lczogcmVhZG9ubHkgc3RyaW5nW10pOiBudW1iZXIge1xuXHRsZXQgdG90YWwgPSAwO1xuXHRmb3IgKGNvbnN0IGxpbmUgb2YgbGluZXMpIHtcblx0XHR0b3RhbCArPSBieXRlTGVuZ3RoKGxpbmUpO1xuXHR9XG5cdHJldHVybiB0b3RhbCArIHNhdHVyYXRpbmdTdWIobGluZXMubGVuZ3RoLCAxKTtcbn1cblxuZnVuY3Rpb24gc2hvdWxkU2tpcFRvb2xPdXRwdXRDb21wYWN0aW9uKGxpbmVzOiByZWFkb25seSBzdHJpbmdbXSwgb3V0cHV0OiBzdHJpbmcsIG1pbkxpbmVzOiBudW1iZXIpOiBib29sZWFuIHtcblx0cmV0dXJuIGxpbmVzLmxlbmd0aCA8IG1pbkxpbmVzXG5cdFx0fHwgbGluZXMubGVuZ3RoID4gMjAwXzAwMFxuXHRcdHx8IGpzU3RyaW5nTGVuKG91dHB1dCkgPCAxNTAwXG5cdFx0fHwgbGluZXMuc29tZShsaW5lID0+IGxpbmUuc3RhcnRzV2l0aCgnRXJyb3I6JykgfHwgbGluZS5zdGFydHNXaXRoKCdyZzogJykgfHwgbGluZS5zdGFydHNXaXRoKCdncmVwOiAnKSk7XG59XG5cbmZ1bmN0aW9uIGZpdHNMYXJnZU91dHB1dFRocmVzaG9sZChvdXRwdXQ6IHN0cmluZywgbGFyZ2VPdXRwdXRUaHJlc2hvbGQ6IG51bWJlcik6IGJvb2xlYW4ge1xuXHRyZXR1cm4gYnl0ZUxlbmd0aChvdXRwdXQpIDw9IGxhcmdlT3V0cHV0VGhyZXNob2xkO1xufVxuXG5mdW5jdGlvbiBjb21wYWN0ZWRCb2R5QnVkZ2V0KGxhcmdlT3V0cHV0VGhyZXNob2xkOiBudW1iZXIpOiBudW1iZXIge1xuXHRyZXR1cm4gTWF0aC5tYXgoMjU2LCBzYXR1cmF0aW5nU3ViKGxhcmdlT3V0cHV0VGhyZXNob2xkLCBDT01QQUNURURfUkVGRVJFTkNFX09WRVJIRUFEX0JVREdFVCkpO1xufVxuXG5mdW5jdGlvbiB0b3RhbEdyb3VwSXRlbXM8VD4oZ3JvdXBzOiBSZWFkb25seUFycmF5PHJlYWRvbmx5IFtzdHJpbmcsIFRbXV0+KTogbnVtYmVyIHtcblx0bGV0IHRvdGFsID0gMDtcblx0Zm9yIChjb25zdCBbLCBpdGVtc10gb2YgZ3JvdXBzKSB7XG5cdFx0dG90YWwgKz0gaXRlbXMubGVuZ3RoO1xuXHR9XG5cdHJldHVybiB0b3RhbDtcbn1cblxuZnVuY3Rpb24gdHJ1bmNhdGVJbmxpbmVUZXh0KHRleHQ6IHN0cmluZywgbWF4TGVuZ3RoOiBudW1iZXIpOiBzdHJpbmcge1xuXHRjb25zdCBub3JtYWxpemVkID0gbm9ybWFsaXplSW5saW5lV2hpdGVzcGFjZSh0ZXh0KTtcblx0Y29uc3Qgbm9ybWFsaXplZExlbiA9IGpzU3RyaW5nTGVuKG5vcm1hbGl6ZWQpO1xuXHRpZiAobm9ybWFsaXplZExlbiA8PSBtYXhMZW5ndGgpIHtcblx0XHRyZXR1cm4gbm9ybWFsaXplZDtcblx0fVxuXHRjb25zdCBzdWZmaXggPSBgLi4uIFsrJHtub3JtYWxpemVkTGVuIC0gbWF4TGVuZ3RofSBjaGFyc11gO1xuXHRyZXR1cm4gYCR7c2xpY2VKc1VuaXRzKG5vcm1hbGl6ZWQsIDAsIHNhdHVyYXRpbmdTdWIobWF4TGVuZ3RoLCBzdWZmaXgubGVuZ3RoKSl9JHtzdWZmaXh9YDtcbn1cblxuZnVuY3Rpb24gZXhjZXJwdElubGluZVRleHQodGV4dDogc3RyaW5nLCBtYXhMZW5ndGg6IG51bWJlcik6IHN0cmluZyB7XG5cdGNvbnN0IG5vcm1hbGl6ZWQgPSBub3JtYWxpemVJbmxpbmVXaGl0ZXNwYWNlKHRleHQpO1xuXHRjb25zdCBub3JtYWxpemVkTGVuID0ganNTdHJpbmdMZW4obm9ybWFsaXplZCk7XG5cdGlmIChub3JtYWxpemVkTGVuIDw9IG1heExlbmd0aCkge1xuXHRcdHJldHVybiBub3JtYWxpemVkO1xuXHR9XG5cdGNvbnN0IG1hcmtlckluZGV4ID0gaGlnaFNpZ25hbFRleHRJbmRleChub3JtYWxpemVkKTtcblx0aWYgKG1hcmtlckluZGV4ICE9PSB1bmRlZmluZWQpIHtcblx0XHRyZXR1cm4gZXhjZXJwdEFyb3VuZEluZGV4KG5vcm1hbGl6ZWQsIG1heExlbmd0aCwgbWFya2VySW5kZXgpO1xuXHR9XG5cdGNvbnN0IHNlcGFyYXRvciA9IGAgLi4uIFsrJHtub3JtYWxpemVkTGVuIC0gbWF4TGVuZ3RofSBjaGFyc10gLi4uIGA7XG5cdGNvbnN0IGF2YWlsYWJsZSA9IHNhdHVyYXRpbmdTdWIobWF4TGVuZ3RoLCBzZXBhcmF0b3IubGVuZ3RoKTtcblx0Y29uc3QgaGVhZExlbmd0aCA9IE1hdGguY2VpbChhdmFpbGFibGUgLyAyKTtcblx0Y29uc3QgdGFpbExlbmd0aCA9IE1hdGguZmxvb3IoYXZhaWxhYmxlIC8gMik7XG5cdHJldHVybiBgJHtzbGljZUpzVW5pdHMobm9ybWFsaXplZCwgMCwgaGVhZExlbmd0aCl9JHtzZXBhcmF0b3J9JHtzbGljZUpzVW5pdHMobm9ybWFsaXplZCwgc2F0dXJhdGluZ1N1Yihub3JtYWxpemVkTGVuLCB0YWlsTGVuZ3RoKSwgdGFpbExlbmd0aCl9YDtcbn1cblxuZnVuY3Rpb24gbm9ybWFsaXplSW5saW5lV2hpdGVzcGFjZSh0ZXh0OiBzdHJpbmcpOiBzdHJpbmcge1xuXHRyZXR1cm4gc3BsaXRXaGl0ZXNwYWNlKHRleHQpLmpvaW4oJyAnKTtcbn1cblxuZnVuY3Rpb24gaGlnaFNpZ25hbFRleHRJbmRleCh0ZXh0OiBzdHJpbmcpOiBudW1iZXIgfCB1bmRlZmluZWQge1xuXHRyZXR1cm4gcmVnZXhGaW5kKFxuXHRcdFN0cmluZy5yYXdgXFxiKD86SEZfVE9LRU58QVdTX0FDQ0VTU19LRVlfSUR8QVdTX1NFQ1JFVF9BQ0NFU1NfS0VZfFNFQ1JFVHxUT0tFTnxGSU5BTF9FWElUfFJFU1VMVHxCRVNUfEFjY3VyYWN5fE1vZGVsIHNpemV8QXNzZXJ0aW9uRXJyb3J8RkFJTHxFUlJPUnxSYW5rKVxcYnxoZl9bQS1aYS16MC05X10rfHU9YTFbQS1aYS16MC05Xy1dK3xodHRwcz86Ly9gLFxuXHRcdHRleHQsXG5cdCk7XG59XG5cbmZ1bmN0aW9uIGV4Y2VycHRBcm91bmRJbmRleCh0ZXh0OiBzdHJpbmcsIG1heExlbmd0aDogbnVtYmVyLCBpbmRleDogbnVtYmVyKTogc3RyaW5nIHtcblx0Y29uc3QgcHJlZml4ID0gaW5kZXggPiAwID8gJy4uLiAnIDogJyc7XG5cdGNvbnN0IHRleHRMZW4gPSBqc1N0cmluZ0xlbih0ZXh0KTtcblx0Ly8gYGluZGV4YCBpcyBhIFVURi0xNiBvZmZzZXQgKEpTIHJlZ2V4IG1hdGNoIGluZGV4KSwgd2hpY2ggZXF1YWxzIHRoZSBSdXN0XG5cdC8vIGBqc19zdHJpbmdfbGVuKCZ0ZXh0Wy4uYnl0ZV9pbmRleF0pYCB2YWx1ZS5cblx0Y29uc3QgaW5kZXhVbml0cyA9IGluZGV4O1xuXHRjb25zdCBzdWZmaXggPSBpbmRleFVuaXRzICsgbWF4TGVuZ3RoIDwgdGV4dExlbiA/ICcgLi4uJyA6ICcnO1xuXHRjb25zdCBhdmFpbGFibGUgPSBzYXR1cmF0aW5nU3ViKG1heExlbmd0aCwgcHJlZml4Lmxlbmd0aCArIHN1ZmZpeC5sZW5ndGgpO1xuXHRjb25zdCBzdGFydCA9IE1hdGgubWluKHNhdHVyYXRpbmdTdWIoaW5kZXhVbml0cywgTWF0aC5mbG9vcihhdmFpbGFibGUgLyAyKSksIHNhdHVyYXRpbmdTdWIodGV4dExlbiwgYXZhaWxhYmxlKSk7XG5cdHJldHVybiBgJHtwcmVmaXh9JHtzbGljZUpzVW5pdHModGV4dCwgc3RhcnQsIGF2YWlsYWJsZSl9JHtzdWZmaXh9YDtcbn1cblxuZnVuY3Rpb24gdHJ1bmNhdGVQYXRoTWlkZGxlKGlucHV0UGF0aDogc3RyaW5nLCBtYXhMZW5ndGg6IG51bWJlcik6IHN0cmluZyB7XG5cdGlmIChqc1N0cmluZ0xlbihpbnB1dFBhdGgpIDw9IG1heExlbmd0aCkge1xuXHRcdHJldHVybiBpbnB1dFBhdGg7XG5cdH1cblxuXHRjb25zdCBlbGxpcHNpcyA9ICcuLi4nO1xuXHRjb25zdCBtaW5UcnVuY2F0ZVdpdGhFbGxpcHNpc0xlbmd0aCA9IGVsbGlwc2lzLmxlbmd0aCArIDI7XG5cdGNvbnN0IG1pbk1pZGRsZVRydW5jYXRlTGVuZ3RoID0gbWluVHJ1bmNhdGVXaXRoRWxsaXBzaXNMZW5ndGggKiAyO1xuXG5cdGlmIChtYXhMZW5ndGggPD0gbWluVHJ1bmNhdGVXaXRoRWxsaXBzaXNMZW5ndGgpIHtcblx0XHRyZXR1cm4gc2xpY2VKc1VuaXRzKGlucHV0UGF0aCwgMCwgbWF4TGVuZ3RoKTtcblx0fVxuXG5cdGlmIChtYXhMZW5ndGggPCBtaW5NaWRkbGVUcnVuY2F0ZUxlbmd0aCkge1xuXHRcdHJldHVybiBgJHtzbGljZUpzVW5pdHMoaW5wdXRQYXRoLCAwLCBtYXhMZW5ndGggLSBlbGxpcHNpcy5sZW5ndGgpfSR7ZWxsaXBzaXN9YDtcblx0fVxuXG5cdGNvbnN0IHNlcGFyYXRvciA9IGlucHV0UGF0aC5pbmNsdWRlcygnXFxcXCcpICYmICFpbnB1dFBhdGguaW5jbHVkZXMoJy8nKSA/ICdcXFxcJyA6ICcvJztcblx0Y29uc3QgW3Jvb3QsIHNlZ21lbnRzXSA9IGdldFBhdGhQYXJ0c0Zvck1pZGRsZVRydW5jYXRpb24oaW5wdXRQYXRoLCBzZXBhcmF0b3IpO1xuXHRjb25zdCBtaW5TZWdtZW50c0Zvck1pZGRsZVRydW5jYXRpb24gPSByb290Lmxlbmd0aCA9PT0gMCA/IDMgOiAyO1xuXHRpZiAoc2VnbWVudHMubGVuZ3RoIDwgbWluU2VnbWVudHNGb3JNaWRkbGVUcnVuY2F0aW9uKSB7XG5cdFx0cmV0dXJuIGAke3NsaWNlSnNVbml0cyhpbnB1dFBhdGgsIDAsIG1heExlbmd0aCAtIGVsbGlwc2lzLmxlbmd0aCl9JHtlbGxpcHNpc31gO1xuXHR9XG5cblx0Y29uc3QgbGFzdFNlZ21lbnQgPSBzZWdtZW50cy5sZW5ndGggPiAwID8gc2VnbWVudHNbc2VnbWVudHMubGVuZ3RoIC0gMV0gOiAnJztcblx0Y29uc3QgcHJlc2VydmVkU2VnbWVudENvdW50ID0gcm9vdC5sZW5ndGggPT09IDAgPyAxIDogMDtcblx0Y29uc3QgbWluUmVzdWx0ID0gcm9vdC5sZW5ndGggPT09IDBcblx0XHQ/IGAke3NlZ21lbnRzWzBdfSR7c2VwYXJhdG9yfSR7ZWxsaXBzaXN9JHtzZXBhcmF0b3J9JHtsYXN0U2VnbWVudH1gXG5cdFx0OiBgJHtyb290fSR7ZWxsaXBzaXN9JHtzZXBhcmF0b3J9JHtsYXN0U2VnbWVudH1gO1xuXG5cdGlmIChqc1N0cmluZ0xlbihtaW5SZXN1bHQpID4gbWF4TGVuZ3RoKSB7XG5cdFx0cmV0dXJuIGAke3NsaWNlSnNVbml0cyhpbnB1dFBhdGgsIDAsIG1heExlbmd0aCAtIGVsbGlwc2lzLmxlbmd0aCl9JHtlbGxpcHNpc31gO1xuXHR9XG5cblx0bGV0IHJlc3VsdCA9IG1pblJlc3VsdDtcblx0Y29uc3QgbWlkZGxlU2VnbWVudHMgPSBzZWdtZW50cy5zbGljZShwcmVzZXJ2ZWRTZWdtZW50Q291bnQsIHNlZ21lbnRzLmxlbmd0aCAtIDEpO1xuXHRmb3IgKGxldCBpID0gMDsgaSA8IG1pZGRsZVNlZ21lbnRzLmxlbmd0aDsgaSsrKSB7XG5cdFx0Y29uc3QgcHJlc2VydmVkU2VnbWVudHMgPSBzZWdtZW50cy5zbGljZSgwLCBwcmVzZXJ2ZWRTZWdtZW50Q291bnQgKyBpICsgMSk7XG5cdFx0Y29uc3QgcHJlZml4ID0gcm9vdC5sZW5ndGggPT09IDBcblx0XHRcdD8gcHJlc2VydmVkU2VnbWVudHMuam9pbihzZXBhcmF0b3IpXG5cdFx0XHQ6IGAke3Jvb3R9JHtwcmVzZXJ2ZWRTZWdtZW50cy5qb2luKHNlcGFyYXRvcil9YDtcblx0XHRjb25zdCBjYW5kaWRhdGUgPSBgJHtwcmVmaXh9JHtzZXBhcmF0b3J9JHtlbGxpcHNpc30ke3NlcGFyYXRvcn0ke2xhc3RTZWdtZW50fWA7XG5cdFx0aWYgKGpzU3RyaW5nTGVuKGNhbmRpZGF0ZSkgPD0gbWF4TGVuZ3RoKSB7XG5cdFx0XHRyZXN1bHQgPSBjYW5kaWRhdGU7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGJyZWFrO1xuXHRcdH1cblx0fVxuXG5cdHJldHVybiByZXN1bHQ7XG59XG5cbmZ1bmN0aW9uIGdldFBhdGhQYXJ0c0Zvck1pZGRsZVRydW5jYXRpb24oaW5wdXRQYXRoOiBzdHJpbmcsIHNlcGFyYXRvcjogc3RyaW5nKTogW3N0cmluZywgc3RyaW5nW11dIHtcblx0aWYgKGlucHV0UGF0aC5sZW5ndGggPj0gMiAmJiBpc0FzY2lpQWxwaGFiZXRpYyhpbnB1dFBhdGhbMF0pICYmIGlucHV0UGF0aFsxXSA9PT0gJzonKSB7XG5cdFx0bGV0IGVuZCA9IDI7XG5cdFx0d2hpbGUgKGVuZCA8IGlucHV0UGF0aC5sZW5ndGggJiYgKGlucHV0UGF0aFtlbmRdID09PSAnLycgfHwgaW5wdXRQYXRoW2VuZF0gPT09ICdcXFxcJykpIHtcblx0XHRcdGVuZCArPSAxO1xuXHRcdH1cblx0XHRjb25zdCByb290ID0gZW5kID4gMiA/IGAke2lucHV0UGF0aC5zbGljZSgwLCAyKX0ke3NlcGFyYXRvcn1gIDogaW5wdXRQYXRoLnNsaWNlKDAsIDIpO1xuXHRcdHJldHVybiBbcm9vdCwgc3BsaXRQYXRoU2VnbWVudHMoaW5wdXRQYXRoLnNsaWNlKGVuZCkpXTtcblx0fVxuXG5cdGlmIChpbnB1dFBhdGguc3RhcnRzV2l0aCgnXFxcXFxcXFwnKSB8fCBpbnB1dFBhdGguc3RhcnRzV2l0aCgnLy8nKSkge1xuXHRcdGNvbnN0IHVuY1NlZ21lbnRzID0gc3BsaXRQYXRoU2VnbWVudHModHJpbVN0YXJ0TWF0Y2hlc0NoYXJzKGlucHV0UGF0aCwgWydcXFxcJywgJy8nXSkpO1xuXHRcdGlmICh1bmNTZWdtZW50cy5sZW5ndGggPj0gMikge1xuXHRcdFx0cmV0dXJuIFtcblx0XHRcdFx0YCR7c2VwYXJhdG9yfSR7c2VwYXJhdG9yfSR7dW5jU2VnbWVudHNbMF19JHtzZXBhcmF0b3J9JHt1bmNTZWdtZW50c1sxXX0ke3NlcGFyYXRvcn1gLFxuXHRcdFx0XHR1bmNTZWdtZW50cy5zbGljZSgyKSxcblx0XHRcdF07XG5cdFx0fVxuXHR9XG5cblx0aWYgKGlucHV0UGF0aC5zdGFydHNXaXRoKCdcXFxcJykgfHwgaW5wdXRQYXRoLnN0YXJ0c1dpdGgoJy8nKSkge1xuXHRcdHJldHVybiBbc2VwYXJhdG9yLCBzcGxpdFBhdGhTZWdtZW50cyh0cmltU3RhcnRNYXRjaGVzQ2hhcnMoaW5wdXRQYXRoLCBbJ1xcXFwnLCAnLyddKSldO1xuXHR9XG5cdHJldHVybiBbJycsIHNwbGl0UGF0aFNlZ21lbnRzKGlucHV0UGF0aCldO1xufVxuXG5mdW5jdGlvbiBzcGxpdFBhdGhTZWdtZW50cyhpbnB1dFBhdGg6IHN0cmluZyk6IHN0cmluZ1tdIHtcblx0cmV0dXJuIGlucHV0UGF0aC5zcGxpdCgvW1xcXFwvXS8pLmZpbHRlcihwYXJ0ID0+IHBhcnQubGVuZ3RoID4gMCk7XG59XG5cbmZ1bmN0aW9uIG5hdHVyYWxDbXAoYTogc3RyaW5nLCBiOiBzdHJpbmcpOiBudW1iZXIge1xuXHRjb25zdCBhQ2hhcnMgPSBBcnJheS5mcm9tKGEpO1xuXHRjb25zdCBiQ2hhcnMgPSBBcnJheS5mcm9tKGIpO1xuXHRsZXQgYWkgPSAwO1xuXHRsZXQgYmkgPSAwO1xuXHRmb3IgKDsgOykge1xuXHRcdGNvbnN0IGFjID0gYWkgPCBhQ2hhcnMubGVuZ3RoID8gYUNoYXJzW2FpXSA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCBiYyA9IGJpIDwgYkNoYXJzLmxlbmd0aCA/IGJDaGFyc1tiaV0gOiB1bmRlZmluZWQ7XG5cdFx0aWYgKGFjID09PSB1bmRlZmluZWQgJiYgYmMgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuIDA7XG5cdFx0fVxuXHRcdGlmIChhYyA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm4gLTE7XG5cdFx0fVxuXHRcdGlmIChiYyA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm4gMTtcblx0XHR9XG5cdFx0aWYgKGlzQXNjaWlEaWdpdChhYykgJiYgaXNBc2NpaURpZ2l0KGJjKSkge1xuXHRcdFx0bGV0IGFOdW1iZXIgPSAnJztcblx0XHRcdHdoaWxlIChhaSA8IGFDaGFycy5sZW5ndGggJiYgaXNBc2NpaURpZ2l0KGFDaGFyc1thaV0pKSB7XG5cdFx0XHRcdGFOdW1iZXIgKz0gYUNoYXJzW2FpXTtcblx0XHRcdFx0YWkgKz0gMTtcblx0XHRcdH1cblx0XHRcdGxldCBiTnVtYmVyID0gJyc7XG5cdFx0XHR3aGlsZSAoYmkgPCBiQ2hhcnMubGVuZ3RoICYmIGlzQXNjaWlEaWdpdChiQ2hhcnNbYmldKSkge1xuXHRcdFx0XHRiTnVtYmVyICs9IGJDaGFyc1tiaV07XG5cdFx0XHRcdGJpICs9IDE7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBhVHJpbW1lZCA9IGFOdW1iZXIucmVwbGFjZSgvXjArLywgJycpO1xuXHRcdFx0Y29uc3QgYlRyaW1tZWQgPSBiTnVtYmVyLnJlcGxhY2UoL14wKy8sICcnKTtcblx0XHRcdGxldCBvcmQgPSBjb21wYXJlTnVtYmVyKGFUcmltbWVkLmxlbmd0aCwgYlRyaW1tZWQubGVuZ3RoKTtcblx0XHRcdGlmIChvcmQgPT09IDApIHtcblx0XHRcdFx0b3JkID0gY29tcGFyZVN0cmluZyhhVHJpbW1lZCwgYlRyaW1tZWQpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKG9yZCA9PT0gMCkge1xuXHRcdFx0XHRvcmQgPSBjb21wYXJlTnVtYmVyKGFOdW1iZXIubGVuZ3RoLCBiTnVtYmVyLmxlbmd0aCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAob3JkICE9PSAwKSB7XG5cdFx0XHRcdHJldHVybiBvcmQ7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGFpICs9IDE7XG5cdFx0XHRiaSArPSAxO1xuXHRcdFx0Y29uc3Qgb3JkID0gY29tcGFyZUNvZGVQb2ludChhYywgYmMpO1xuXHRcdFx0aWYgKG9yZCAhPT0gMCkge1xuXHRcdFx0XHRyZXR1cm4gb3JkO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxufVxuXG5mdW5jdGlvbiBjb21wYXJlTnVtYmVyKGE6IG51bWJlciwgYjogbnVtYmVyKTogbnVtYmVyIHtcblx0cmV0dXJuIGEgPCBiID8gLTEgOiBhID4gYiA/IDEgOiAwO1xufVxuXG5mdW5jdGlvbiBjb21wYXJlU3RyaW5nKGE6IHN0cmluZywgYjogc3RyaW5nKTogbnVtYmVyIHtcblx0cmV0dXJuIGEgPCBiID8gLTEgOiBhID4gYiA/IDEgOiAwO1xufVxuXG5mdW5jdGlvbiBjb21wYXJlQ29kZVBvaW50KGE6IHN0cmluZywgYjogc3RyaW5nKTogbnVtYmVyIHtcblx0Y29uc3QgYWMgPSBhLmNvZGVQb2ludEF0KDApID8/IDA7XG5cdGNvbnN0IGJjID0gYi5jb2RlUG9pbnRBdCgwKSA/PyAwO1xuXHRyZXR1cm4gY29tcGFyZU51bWJlcihhYywgYmMpO1xufVxuXG4vLyNlbmRyZWdpb25cblxuLy8jcmVnaW9uIHNoZWxsX291dHB1dF9jb21wYWN0b3IucnMgXHUyMDE0IGNsYXNzaWZpY2F0aW9uXG5cbmZ1bmN0aW9uIGNsYXNzaWZ5Q29tbWFuZFJlc3VsdChjb21tYW5kOiBzdHJpbmcpOiBDb21tYW5kQ2xhc3NpZmljYXRpb25SZXN1bHQge1xuXHRyZXR1cm4ge1xuXHRcdGNvbW1hbmRLaW5kczogY2xhc3NpZnlDb21tYW5kS2luZHMoY29tbWFuZCksXG5cdFx0aXNTb3VyY2VSZWFkQ29tbWFuZDogaXNTaGVsbFNvdXJjZVJlYWRDb21tYW5kKGNvbW1hbmQpLFxuXHRcdHJ1bnNHb1Rlc3Q6IGNvbW1hbmRSdW5zR29UZXN0KGNvbW1hbmQpLFxuXHRcdG1lbnRpb25zU2F2ZWRUb29sT3V0cHV0OiBjb21tYW5kTWVudGlvbnNTYXZlZFRvb2xPdXRwdXQoY29tbWFuZCksXG5cdH07XG59XG5cbmZ1bmN0aW9uIHByZXZpZXdTaGVsbE91dHB1dENvbXBhY3Rpb24oXG5cdGNvbW1hbmQ6IHN0cmluZyxcblx0b3JpZ2luYWw6IHN0cmluZyxcblx0bGFyZ2VPdXRwdXRUaHJlc2hvbGQ6IG51bWJlcixcblx0c2hlbGxHcmVwTGFyZ2VPdXRwdXRUaHJlc2hvbGQ6IG51bWJlcixcblx0bWluaW11bVNhdmVkQ2hhcnM6IG51bWJlcixcbik6IFNoZWxsT3V0cHV0UHJldmlld1Jlc3VsdCB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IGNsYXNzaWZpY2F0aW9uID0gY2xhc3NpZnlDb21tYW5kUmVzdWx0KGNvbW1hbmQpO1xuXHRjb25zdCBoYXNHb1J1bnRpbWVQYW5pYyA9IGxvb2tzTGlrZUdvUnVudGltZVBhbmljKG9yaWdpbmFsKTtcblx0Y29uc3QgaGFzTnBtUGFja091dHB1dCA9IGxvb2tzTGlrZU5wbVBhY2tPdXRwdXQob3JpZ2luYWwpO1xuXHRjb25zdCBoYXNKZXN0UnVuc091dHB1dCA9IGhhc0plc3RSdW5zUHJvZ3Jlc3Mob3JpZ2luYWwpO1xuXHRjb25zdCBoYXNEb2N1c2F1cnVzT3V0cHV0ID0gaGFzRG9jdXNhdXJ1c1Byb2dyZXNzKG9yaWdpbmFsKTtcblx0Y29uc3QgaGFzU3BoaW54UHJvZ3Jlc3NPdXRwdXQgPSBoYXNTcGhpbnhQcm9ncmVzcyhvcmlnaW5hbCk7XG5cdGNvbnN0IGhhc0dvUGFzc2luZ1Rlc3RPdXRwdXQgPSBjbGFzc2lmaWNhdGlvbi5ydW5zR29UZXN0ICYmIGhhc1Bhc3NpbmdHb1Rlc3RPdXRwdXQob3JpZ2luYWwpO1xuXHRjb25zdCBoYXNOZWVkcmVzdGFydE5vb3BPdXRwdXQgPSBoYXNOZWVkcmVzdGFydE5vb3BTdW1tYXJ5KG9yaWdpbmFsKTtcblx0Y29uc3QgY2FuQ29tcGFjdFNvdXJjZVJlYWRQcm9ncmVzcyA9IGhhc0dvUGFzc2luZ1Rlc3RPdXRwdXQgJiYgIWNsYXNzaWZpY2F0aW9uLm1lbnRpb25zU2F2ZWRUb29sT3V0cHV0O1xuXG5cdGlmIChjbGFzc2lmaWNhdGlvbi5jb21tYW5kS2luZHMubGVuZ3RoID09PSAwXG5cdFx0JiYgIWhhc0dvUnVudGltZVBhbmljXG5cdFx0JiYgIWhhc05wbVBhY2tPdXRwdXRcblx0XHQmJiAhaGFzSmVzdFJ1bnNPdXRwdXRcblx0XHQmJiAhaGFzR29QYXNzaW5nVGVzdE91dHB1dFxuXHRcdCYmICFoYXNOZWVkcmVzdGFydE5vb3BPdXRwdXRcblx0XHQmJiAhaGFzRG9jdXNhdXJ1c091dHB1dFxuXHRcdCYmICFoYXNTcGhpbnhQcm9ncmVzc091dHB1dFxuXHQpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGlmIChjbGFzc2lmaWNhdGlvbi5jb21tYW5kS2luZHMubGVuZ3RoID09PSAwXG5cdFx0JiYgY2xhc3NpZmljYXRpb24uaXNTb3VyY2VSZWFkQ29tbWFuZFxuXHRcdCYmICFjYW5Db21wYWN0U291cmNlUmVhZFByb2dyZXNzXG5cdCkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRjb25zdCByZXN1bHQgPSBjb21wYWN0U2hlbGxPdXRwdXQoXG5cdFx0Y2xhc3NpZmljYXRpb24uY29tbWFuZEtpbmRzLFxuXHRcdG9yaWdpbmFsLFxuXHRcdGhhc0dvUGFzc2luZ1Rlc3RPdXRwdXQsXG5cdFx0c2hlbGxHcmVwTGFyZ2VPdXRwdXRUaHJlc2hvbGQsXG5cdCkgPz8geyBvdXRwdXQ6IG9yaWdpbmFsLCBsb3NzbGVzczogdHJ1ZSB9O1xuXG5cdGNvbnN0IHNhdmVkQ2hhcnMgPSBzYXR1cmF0aW5nU3ViKGpzU3RyaW5nTGVuKG9yaWdpbmFsKSwganNTdHJpbmdMZW4ocmVzdWx0Lm91dHB1dCkpO1xuXHRjb25zdCBvcmlnaW5hbFdvdWxkU3BpbGwgPSAhZml0c0xhcmdlT3V0cHV0VGhyZXNob2xkKG9yaWdpbmFsLCBsYXJnZU91dHB1dFRocmVzaG9sZCk7XG5cdGNvbnN0IHNhdmVkQnl0ZXMgPSBzYXR1cmF0aW5nU3ViKGJ5dGVMZW5ndGgob3JpZ2luYWwpLCBieXRlTGVuZ3RoKHJlc3VsdC5vdXRwdXQpKTtcblx0aWYgKHNhdmVkQ2hhcnMgPCBtaW5pbXVtU2F2ZWRDaGFycyAmJiAhKG9yaWdpbmFsV291bGRTcGlsbCAmJiBzYXZlZEJ5dGVzID4gMCkpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cmV0dXJuIHtcblx0XHRvdXRwdXQ6IHJlc3VsdC5vdXRwdXQsXG5cdFx0c2F2ZWRDaGFycyxcblx0XHRsb3NzbGVzczogcmVzdWx0Lmxvc3NsZXNzLFxuXHR9O1xufVxuXG5mdW5jdGlvbiBjb21wYWN0VG9vbE91dHB1dChcblx0a2luZDogVG9vbE91dHB1dENvbXBhY3Rpb25LaW5kLFxuXHRvdXRwdXQ6IHN0cmluZyxcblx0bGFyZ2VPdXRwdXRUaHJlc2hvbGQ6IG51bWJlcixcbik6IFRvb2xDb21wYWN0aW9uUmVzdWx0IHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgcmVzdWx0ID0ga2luZCA9PT0gJ2dyZXAtY29udGVudCdcblx0XHQ/IGNvbXBhY3RHcmVwQ29udGVudE91dHB1dChvdXRwdXQsIGxhcmdlT3V0cHV0VGhyZXNob2xkKVxuXHRcdDoga2luZCA9PT0gJ2dyZXAtY291bnQnXG5cdFx0XHQ/IGNvbXBhY3RHcmVwQ291bnRPdXRwdXQob3V0cHV0KVxuXHRcdFx0OiBraW5kID09PSAnZ3JlcC1wYXRocydcblx0XHRcdFx0PyBjb21wYWN0UGF0aExpc3RPdXRwdXQob3V0cHV0LCAnZ3JlcC1wYXRocycsIGxhcmdlT3V0cHV0VGhyZXNob2xkKVxuXHRcdFx0XHQ6IGNvbXBhY3RQYXRoTGlzdE91dHB1dChvdXRwdXQsICdnbG9iJywgbGFyZ2VPdXRwdXRUaHJlc2hvbGQpO1xuXG5cdGlmIChyZXN1bHQub3V0cHV0ID09PSBvdXRwdXQpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdHJldHVybiByZXN1bHQ7XG59XG5cbmZ1bmN0aW9uIGNsYXNzaWZ5Q29tbWFuZEtpbmRzKGNvbW1hbmQ6IHN0cmluZyk6IHN0cmluZ1tdIHtcblx0Y29uc3QgaGVyZWRvY1N0cmlwcGVkQ29tbWFuZCA9IHN0cmlwSGVyZWRvY0JvZGllcyhjb21tYW5kKTtcblx0aWYgKGhlcmVkb2NTdHJpcHBlZENvbW1hbmQgPT09IHVuZGVmaW5lZCkge1xuXHRcdHJldHVybiBbXTtcblx0fVxuXHRjb25zdCBsaW5lQ29udGludWVkQ29tbWFuZCA9IHJlZ2V4UmVwbGFjZUFsbChTdHJpbmcucmF3YFxccypcXFxcXFxyP1xcblxccypgLCBoZXJlZG9jU3RyaXBwZWRDb21tYW5kLmNvbW1hbmQsICcgJyk7XG5cdGNvbnN0IGNvbW1hbmRXaXRob3V0QWxsb3dlZERlc2NyaXB0b3JSZWRpcmVjdHMgPSByZWdleFJlcGxhY2VBbGwoU3RyaW5nLnJhd2BcXHMrWzEyXT4mWzEyXVxcYmAsIGxpbmVDb250aW51ZWRDb21tYW5kLCAnJyk7XG5cdGNvbnN0IGNvbW1hbmRXaXRoU2FmZVN1YnN0aXR1dGlvbnMgPSByZXBsYWNlU2FmZUNvbW1hbmRTdWJzdGl0dXRpb25zKGNvbW1hbmRXaXRob3V0QWxsb3dlZERlc2NyaXB0b3JSZWRpcmVjdHMpO1xuXHRjb25zdCBzYWZldHlDb21tYW5kID0gc3RyaXBRdW90ZWRUZXh0KGNvbW1hbmRXaXRoU2FmZVN1YnN0aXR1dGlvbnMpO1xuXHRjb25zdCBoYXNOZXdsaW5lID0gcmVnZXhUZXN0KFN0cmluZy5yYXdgXFxyP1xcbmAsIHNhZmV0eUNvbW1hbmQpO1xuXHRpZiAocmVnZXhUZXN0KCdbO2A8Pl0nLCBzYWZldHlDb21tYW5kKVxuXHRcdHx8IHJlZ2V4VGVzdChTdHJpbmcucmF3YChefFteJl0pJigkfFteJl0pYCwgc2FmZXR5Q29tbWFuZClcblx0XHR8fCBzYWZldHlDb21tYW5kLmluY2x1ZGVzKCckKCcpXG5cdCkge1xuXHRcdHJldHVybiBbXTtcblx0fVxuXG5cdGNvbnN0IHNlZ21lbnRzID0gc3BsaXRDb21tYW5kU2VnbWVudHMobGluZUNvbnRpbnVlZENvbW1hbmQpO1xuXHRjb25zdCBzZWdtZW50S2luZHM6IChDbGFzc2lmaWVkQ29tbWFuZFNlZ21lbnQgfCB1bmRlZmluZWQpW10gPSBzZWdtZW50cy5tYXAoKHNlZ21lbnQsIGluZGV4KSA9PlxuXHRcdGNsYXNzaWZ5Q29tbWFuZFNlZ21lbnRPclBpcGVsaW5lKHNlZ21lbnQsIGhlcmVkb2NTdHJpcHBlZENvbW1hbmQuaGVyZWRvY1N0ZGluU2VnbWVudEluZGV4ZXMuaGFzKGluZGV4KSkpO1xuXHRpZiAoc2VnbWVudEtpbmRzLnNvbWUoa2luZCA9PiBraW5kID09PSB1bmRlZmluZWQpKSB7XG5cdFx0cmV0dXJuIFtdO1xuXHR9XG5cdGNvbnN0IHJlc29sdmVkS2luZHMgPSBzZWdtZW50S2luZHMgYXMgQ2xhc3NpZmllZENvbW1hbmRTZWdtZW50W107XG5cdGlmIChoYXNOZXdsaW5lICYmICFoYXNFcnJleGl0QmVmb3JlRmlyc3RDb21tYW5kKHNlZ21lbnRzLCByZXNvbHZlZEtpbmRzKSkge1xuXHRcdHJldHVybiBbXTtcblx0fVxuXG5cdGNvbnN0IHJlc3VsdDogc3RyaW5nW10gPSBbXTtcblx0Zm9yIChjb25zdCBraW5kIG9mIHJlc29sdmVkS2luZHMpIHtcblx0XHRpZiAoIWtpbmQuYmVuaWduKSB7XG5cdFx0XHRyZXN1bHQucHVzaChraW5kLmtpbmQpO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gcmVzdWx0O1xufVxuXG5mdW5jdGlvbiBpc1NoZWxsU291cmNlUmVhZENvbW1hbmQoY29tbWFuZDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdGNvbnN0IGhlcmVkb2NTdHJpcHBlZENvbW1hbmQgPSBzdHJpcEhlcmVkb2NCb2RpZXMoY29tbWFuZCk7XG5cdGlmIChoZXJlZG9jU3RyaXBwZWRDb21tYW5kID09PSB1bmRlZmluZWQpIHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdGNvbnN0IGxpbmVDb250aW51ZWRDb21tYW5kID0gcmVnZXhSZXBsYWNlQWxsKFN0cmluZy5yYXdgXFxzKlxcXFxcXHI/XFxuXFxzKmAsIGhlcmVkb2NTdHJpcHBlZENvbW1hbmQuY29tbWFuZCwgJyAnKTtcblx0cmV0dXJuIHNwbGl0Q29tbWFuZFNlZ21lbnRzKGxpbmVDb250aW51ZWRDb21tYW5kKS5zb21lKHNlZ21lbnQgPT5cblx0XHRzcGxpdFVucXVvdGVkUGlwZXMoc2VnbWVudCkuc29tZShwYXJ0ID0+IGlzU291cmNlUmVhZFNlZ21lbnQocGFydCkpKTtcbn1cblxuZnVuY3Rpb24gaXNTb3VyY2VSZWFkU2VnbWVudChzZWdtZW50OiBzdHJpbmcpOiBib29sZWFuIHtcblx0Y29uc3Qgbm9ybWFsaXplZCA9IG5vcm1hbGl6ZVNlZ21lbnQoc2VnbWVudCk7XG5cdGNvbnN0IHdpdGhvdXRFbnYgPSBzdHJpcFNhZmVDb21tYW5kV3JhcHBlcnMoc3RyaXBFbnZpcm9ubWVudEFzc2lnbm1lbnRQcmVmaXgobm9ybWFsaXplZCkpO1xuXHRyZXR1cm4gcmVnZXhUZXN0KFN0cmluZy5yYXdgXig/OmNhdHxzZWR8aGVhZHx0YWlsfGxlc3N8bW9yZXxiYXR8bmx8YXdrfGdyZXB8ZWdyZXB8ZmdyZXB8cmcpKD86XFxzfCQpYCwgd2l0aG91dEVudik7XG59XG5cbmZ1bmN0aW9uIGNsYXNzaWZ5Q29tbWFuZFNlZ21lbnRPclBpcGVsaW5lKFxuXHRzZWdtZW50OiBzdHJpbmcsXG5cdGlzSGVyZWRvY1N0ZGluU2VnbWVudDogYm9vbGVhbixcbik6IENsYXNzaWZpZWRDb21tYW5kU2VnbWVudCB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IHBhcnRzID0gc3BsaXRVbnF1b3RlZFBpcGVzKHNlZ21lbnQpO1xuXHRpZiAocGFydHMubGVuZ3RoID09PSAxKSB7XG5cdFx0cmV0dXJuIGNsYXNzaWZ5Q29tbWFuZFNlZ21lbnQocGFydHNbMF0sIGlzSGVyZWRvY1N0ZGluU2VnbWVudCk7XG5cdH1cblx0aWYgKHBhcnRzLmxlbmd0aCA8IDIpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0Y29uc3QgaGVhZEtpbmQgPSBjbGFzc2lmeUNvbW1hbmRTZWdtZW50KHBhcnRzWzBdLCBpc0hlcmVkb2NTdGRpblNlZ21lbnQpO1xuXHRpZiAoaGVhZEtpbmQgPT09IHVuZGVmaW5lZCkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0aWYgKHNlZ21lbnRzRXF1YWwoaGVhZEtpbmQsIEJFTklHTl9TRUdNRU5UKSkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0aWYgKHNlZ21lbnRzRXF1YWwoaGVhZEtpbmQsIGNvbXBhY3RTZWdtZW50KCdzaGVsbC1ncmVwJykpKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRpZiAocGFydHMuc2xpY2UoMSkuZXZlcnkocGFydCA9PiBpc0JlbmlnblBpcGVsaW5lVGFpbChwYXJ0KSkpIHtcblx0XHRyZXR1cm4gaGVhZEtpbmQ7XG5cdH1cblx0cmV0dXJuIHVuZGVmaW5lZDtcbn1cblxuZnVuY3Rpb24gY2xhc3NpZnlDb21tYW5kU2VnbWVudChcblx0c2VnbWVudDogc3RyaW5nLFxuXHRpc0hlcmVkb2NTdGRpblNlZ21lbnQ6IGJvb2xlYW4sXG4pOiBDbGFzc2lmaWVkQ29tbWFuZFNlZ21lbnQgfCB1bmRlZmluZWQge1xuXHRjb25zdCBub3JtYWxpemVkID0gbm9ybWFsaXplU2VnbWVudChzZWdtZW50KTtcblx0aWYgKG5vcm1hbGl6ZWQubGVuZ3RoID09PSAwXG5cdFx0fHwgbm9ybWFsaXplZCA9PT0gJ3RydWUnXG5cdFx0fHwgbm9ybWFsaXplZCA9PT0gJzonXG5cdFx0fHwgaXNCZW5pZ25Hb2ZtdFdyaXRlQ29tbWFuZChub3JtYWxpemVkKVxuXHRcdHx8IGlzQmVuaWduVGFyYmFsbENsZWFudXBDb21tYW5kKG5vcm1hbGl6ZWQpXG5cdFx0fHwgaXNCZW5pZ25QeXRob25CdWlsZENsZWFudXBDb21tYW5kKG5vcm1hbGl6ZWQpXG5cdFx0fHwgbm9ybWFsaXplZC5zdGFydHNXaXRoKCcjJylcblx0XHR8fCByZWdleFRlc3QoU3RyaW5nLnJhd2BeY2QoPzpcXHMrKD86XCJbXlwiXSpcInwnW14nXSonfFteXFxzXSspKT8kYCwgbm9ybWFsaXplZClcblx0XHR8fCBpc0JlbmlnblNldHVwQ29tbWFuZChub3JtYWxpemVkKVxuXHRcdHx8IHJlZ2V4VGVzdChcblx0XHRcdFN0cmluZy5yYXdgXnNldFxccysoPzpbLStBLVphLXpdK3wtb1xccytbQS1aYS16XVtBLVphLXowLTlfLV0qfFtBLVphLXpdW0EtWmEtejAtOV8tXSopKD86XFxzKyg/OlstK0EtWmEtel0rfC1vXFxzK1tBLVphLXpdW0EtWmEtejAtOV8tXSp8W0EtWmEtel1bQS1aYS16MC05Xy1dKikpKiRgLFxuXHRcdFx0bm9ybWFsaXplZCxcblx0XHQpXG5cdCkge1xuXHRcdHJldHVybiBCRU5JR05fU0VHTUVOVDtcblx0fVxuXHRpZiAoaXNBc3NpZ25tZW50TGlzdChub3JtYWxpemVkKVxuXHRcdHx8IChub3JtYWxpemVkLnN0YXJ0c1dpdGgoJ2V4cG9ydCAnKSAmJiBpc0Fzc2lnbm1lbnRMaXN0KG5vcm1hbGl6ZWQuc2xpY2UoJ2V4cG9ydCAnLmxlbmd0aCkpKVxuXHQpIHtcblx0XHRyZXR1cm4gQkVOSUdOX1NFR01FTlQ7XG5cdH1cblxuXHRjb25zdCB3aXRob3V0RW52ID0gc3RyaXBTYWZlQ29tbWFuZFdyYXBwZXJzKHN0cmlwRW52aXJvbm1lbnRBc3NpZ25tZW50UHJlZml4KG5vcm1hbGl6ZWQpKTtcblx0bGV0IGtpbmQ6IHN0cmluZztcblx0aWYgKGlzQXB0Q29tbWFuZCh3aXRob3V0RW52KSkge1xuXHRcdGtpbmQgPSAnYXB0Jztcblx0fSBlbHNlIGlmIChpc1BucG1JbnN0YWxsQ29tbWFuZCh3aXRob3V0RW52KSkge1xuXHRcdGtpbmQgPSAncG5wbSc7XG5cdH0gZWxzZSBpZiAocmVnZXhUZXN0KFN0cmluZy5yYXdgXm5wbVxccytwYWNrXFxiYCwgd2l0aG91dEVudikpIHtcblx0XHRraW5kID0gJ25wbS1wYWNrJztcblx0fSBlbHNlIGlmIChpc1lhcm5CZXJyeUNvbW1hbmQod2l0aG91dEVudikpIHtcblx0XHRraW5kID0gJ3lhcm4tYmVycnknO1xuXHR9IGVsc2UgaWYgKHJlZ2V4VGVzdChTdHJpbmcucmF3YF4oPzpucG1cXHMrKD86Y2l8aW5zdGFsbCl8eWFyblxccytpbnN0YWxsKVxcYmAsIHdpdGhvdXRFbnYpKSB7XG5cdFx0a2luZCA9ICducG0nO1xuXHR9IGVsc2UgaWYgKGlzUGlwSW5zdGFsbENvbW1hbmQod2l0aG91dEVudikpIHtcblx0XHRraW5kID0gJ3BpcCc7XG5cdH0gZWxzZSBpZiAocmVnZXhUZXN0KFN0cmluZy5yYXdgXmNvbXBvc2VyXFxzKyg/Omluc3RhbGx8dXBkYXRlfHJlcXVpcmV8cmVtb3ZlKVxcYmAsIHdpdGhvdXRFbnYpKSB7XG5cdFx0a2luZCA9ICdjb21wb3Nlcic7XG5cdH0gZWxzZSBpZiAocmVnZXhUZXN0KFN0cmluZy5yYXdgXnBvZXRyeVxccysoPzppbnN0YWxsfHVwZGF0ZXxhZGR8cmVtb3ZlKVxcYmAsIHdpdGhvdXRFbnYpKSB7XG5cdFx0a2luZCA9ICdwb2V0cnknO1xuXHR9IGVsc2UgaWYgKGlzVXZDb21tYW5kKHdpdGhvdXRFbnYpKSB7XG5cdFx0a2luZCA9ICd1dic7XG5cdH0gZWxzZSBpZiAoaXNCZW5pZ25WZXJzaW9uQ29tbWFuZCh3aXRob3V0RW52KSkge1xuXHRcdHJldHVybiBCRU5JR05fU0VHTUVOVDtcblx0fSBlbHNlIGlmIChpc0dvQ29tbWFuZCh3aXRob3V0RW52KSkge1xuXHRcdGtpbmQgPSAnZ28nO1xuXHR9IGVsc2UgaWYgKGlzSnNUZXN0Q29tbWFuZCh3aXRob3V0RW52KSkge1xuXHRcdGtpbmQgPSAnanMtdGVzdCc7XG5cdH0gZWxzZSBpZiAocmVnZXhUZXN0KFN0cmluZy5yYXdgXmNhcmdvXFxzKyg/OmJ1aWxkfGNoZWNrfHRlc3R8Y2xpcHB5fGRvY3xmZXRjaClcXGJgLCB3aXRob3V0RW52KSkge1xuXHRcdGtpbmQgPSAnY2FyZ28nO1xuXHR9IGVsc2UgaWYgKHJlZ2V4VGVzdChTdHJpbmcucmF3YF4oPzpub2RlfG5weHxucG1cXHMrZXhlY3xwbnBtXFxzK2V4ZWN8eWFyblxccytub2RlKVxcYmAsIHdpdGhvdXRFbnYpKSB7XG5cdFx0a2luZCA9ICdub2RlJztcblx0fSBlbHNlIGlmIChpc054Q29tbWFuZCh3aXRob3V0RW52KSkge1xuXHRcdGtpbmQgPSAnbngnO1xuXHR9IGVsc2UgaWYgKGlzUHl0ZXN0Q29tbWFuZCh3aXRob3V0RW52KSkge1xuXHRcdGtpbmQgPSAncHl0ZXN0Jztcblx0fSBlbHNlIGlmIChpc1B5dGhvblVuaXR0ZXN0Q29tbWFuZCh3aXRob3V0RW52KSkge1xuXHRcdGtpbmQgPSAndW5pdHRlc3QnO1xuXHR9IGVsc2UgaWYgKGlzUHl0aG9uQnVpbGRDb21tYW5kKHdpdGhvdXRFbnYpKSB7XG5cdFx0a2luZCA9ICdweXRob24tYnVpbGQnO1xuXHR9IGVsc2UgaWYgKGlzQmVuaWduR2l0Q29tbWFuZCh3aXRob3V0RW52KSkge1xuXHRcdHJldHVybiBCRU5JR05fU0VHTUVOVDtcblx0fSBlbHNlIGlmIChpc0dpdFByb2dyZXNzQ29tbWFuZCh3aXRob3V0RW52KSkge1xuXHRcdGtpbmQgPSAnZ2l0Jztcblx0fSBlbHNlIGlmIChpc0dpdENsZWFuT3JSZXNldENvbW1hbmQod2l0aG91dEVudikpIHtcblx0XHRraW5kID0gJ2dpdC1jbGVhbic7XG5cdH0gZWxzZSBpZiAocmVnZXhUZXN0KFN0cmluZy5yYXdgXmdpdFxccysoPzpjaGVja291dHxzd2l0Y2gpXFxiYCwgd2l0aG91dEVudikpIHtcblx0XHRraW5kID0gJ2dpdCc7XG5cdH0gZWxzZSBpZiAoaXNQeXRob25CdWlsZEV4dENvbW1hbmQod2l0aG91dEVudikpIHtcblx0XHRraW5kID0gJ3B5dGhvbi1idWlsZC1leHQnO1xuXHR9IGVsc2UgaWYgKGlzRGphbmdvVGVzdENvbW1hbmQod2l0aG91dEVudikpIHtcblx0XHRraW5kID0gJ2RqYW5nby10ZXN0Jztcblx0fSBlbHNlIGlmIChpc0dvbGFuZ2NpTGludENvbW1hbmQod2l0aG91dEVudikpIHtcblx0XHRraW5kID0gJ2dvbGFuZ2NpLWxpbnQnO1xuXHR9IGVsc2UgaWYgKGlzQ2xhbmdGb3JtYXRMaW50ZXJDb21tYW5kKHdpdGhvdXRFbnYpKSB7XG5cdFx0a2luZCA9ICdjbGFuZy1mb3JtYXQtbGludGVyJztcblx0fSBlbHNlIGlmIChpc0dyYWRsZUNvbW1hbmQod2l0aG91dEVudikpIHtcblx0XHRraW5kID0gJ2dyYWRsZSc7XG5cdH0gZWxzZSBpZiAoaXNDbWFrZUNvbmZpZ3VyZUNvbW1hbmQod2l0aG91dEVudikpIHtcblx0XHRraW5kID0gJ2NtYWtlJztcblx0fSBlbHNlIGlmIChpc01hdmVuQ29tbWFuZCh3aXRob3V0RW52KSkge1xuXHRcdGtpbmQgPSAnbWF2ZW4nO1xuXHR9IGVsc2UgaWYgKGlzRG90bmV0Q29tbWFuZCh3aXRob3V0RW52KSkge1xuXHRcdGtpbmQgPSAnZG90bmV0Jztcblx0fSBlbHNlIGlmIChpc1NhZmVTaGVsbEdyZXBDb21tYW5kKHdpdGhvdXRFbnYpKSB7XG5cdFx0a2luZCA9ICdzaGVsbC1ncmVwJztcblx0fSBlbHNlIGlmIChyZWdleFRlc3QoU3RyaW5nLnJhd2BeKD86Zz9tYWtlfG5pbmphKVxcYmAsIHdpdGhvdXRFbnYpXG5cdFx0fHwgcmVnZXhUZXN0KFN0cmluZy5yYXdgXlxcLi9jb25maWd1cmVcXGJgLCB3aXRob3V0RW52KVxuXHRcdHx8IHJlZ2V4VGVzdChTdHJpbmcucmF3YF5jbWFrZVxccystLWJ1aWxkXFxiYCwgd2l0aG91dEVudilcblx0KSB7XG5cdFx0a2luZCA9ICdtYWtlJztcblx0fSBlbHNlIGlmIChpc1B5dGhvblNjcmlwdENvbW1hbmQod2l0aG91dEVudiwgaXNIZXJlZG9jU3RkaW5TZWdtZW50KSkge1xuXHRcdGtpbmQgPSAncHl0aG9uLXNjcmlwdCc7XG5cdH0gZWxzZSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRyZXR1cm4gY29tcGFjdFNlZ21lbnQoa2luZCk7XG59XG5cbmZ1bmN0aW9uIHNwbGl0VW5xdW90ZWRQaXBlcyhzZWdtZW50OiBzdHJpbmcpOiBzdHJpbmdbXSB7XG5cdGNvbnN0IHBhcnRzOiBzdHJpbmdbXSA9IFtdO1xuXHRsZXQgc3RhcnQgPSAwO1xuXHRsZXQgaW5TaW5nbGUgPSBmYWxzZTtcblx0bGV0IGluRG91YmxlID0gZmFsc2U7XG5cdGZvciAobGV0IGkgPSAwOyBpIDwgc2VnbWVudC5sZW5ndGg7IGkrKykge1xuXHRcdGNvbnN0IGNoID0gc2VnbWVudFtpXTtcblx0XHRpZiAoY2ggPT09ICdcXCcnICYmICFpbkRvdWJsZSkge1xuXHRcdFx0aW5TaW5nbGUgPSAhaW5TaW5nbGU7XG5cdFx0fSBlbHNlIGlmIChjaCA9PT0gJ1wiJyAmJiAhaW5TaW5nbGUgJiYgIWlzRXNjYXBlZEJ5T2RkQmFja3NsYXNoZXMoc2VnbWVudCwgaSkpIHtcblx0XHRcdGluRG91YmxlID0gIWluRG91YmxlO1xuXHRcdH0gZWxzZSBpZiAoY2ggPT09ICd8JyAmJiAhaW5TaW5nbGUgJiYgIWluRG91YmxlKSB7XG5cdFx0XHRwdXNoVHJpbW1lZFBhcnQocGFydHMsIHNlZ21lbnQuc2xpY2Uoc3RhcnQsIGkpKTtcblx0XHRcdHN0YXJ0ID0gaSArIDE7XG5cdFx0fVxuXHR9XG5cdHB1c2hUcmltbWVkUGFydChwYXJ0cywgc2VnbWVudC5zbGljZShzdGFydCkpO1xuXHRyZXR1cm4gcGFydHM7XG59XG5cbmZ1bmN0aW9uIHB1c2hUcmltbWVkUGFydChwYXJ0czogc3RyaW5nW10sIHBhcnQ6IHN0cmluZyk6IHZvaWQge1xuXHRjb25zdCB0cmltbWVkID0gcGFydC50cmltKCk7XG5cdGlmICh0cmltbWVkLmxlbmd0aCAhPT0gMCkge1xuXHRcdHBhcnRzLnB1c2godHJpbW1lZCk7XG5cdH1cbn1cblxuZnVuY3Rpb24gaXNCZW5pZ25QaXBlbGluZVRhaWwoc2VnbWVudDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdGNvbnN0IG5vcm1hbGl6ZWQgPSBub3JtYWxpemVTZWdtZW50KHNlZ21lbnQpO1xuXHRyZXR1cm4gbm9ybWFsaXplZCA9PT0gJ2NhdCdcblx0XHR8fCByZWdleFRlc3QoU3RyaW5nLnJhd2BedGVlKD86XFxzKy1hKT9cXHMrKD86XCJbXlwiXSpcInwnW14nXSonfFxcUyspJGAsIG5vcm1hbGl6ZWQpXG5cdFx0fHwgcmVnZXhUZXN0KFxuXHRcdFx0U3RyaW5nLnJhd2BeKD86aGVhZHx0YWlsKSg/OlxccysoPzotW25jXVxccyopP1srLV0/XFxkK3xcXHMrLVtuY11cXHMrWystXT9cXGQrKT8kYCxcblx0XHRcdG5vcm1hbGl6ZWQsXG5cdFx0KVxuXHRcdHx8IHJlZ2V4VGVzdChcblx0XHRcdFN0cmluZy5yYXdgXnNlZFxccystblxccysoPzpcIlxcZCsoPzosXFxkKyk/cFwifCdbXFxkXSsoPzosXFxkKyk/cCcpJGAsXG5cdFx0XHRub3JtYWxpemVkLFxuXHRcdClcblx0XHR8fCBpc1NhZmVTdHJlYW1pbmdHcmVwVGFpbChub3JtYWxpemVkKVxuXHRcdHx8IGlzU2FmZVN0cmVhbWluZ0ZsYWdPbmx5VGFpbChub3JtYWxpemVkKTtcbn1cblxuLy8jZW5kcmVnaW9uXG5cbi8vI3JlZ2lvbiBzaGVsbF9vdXRwdXRfY29tcGFjdG9yLnJzIFx1MjAxNCBjb21tYW5kIGRldGVjdG9yc1xuXG4vKiogUnVzdCBgc3RyOjpzdHJpcF9wcmVmaXhgOiByZXR1cm5zIHRoZSByZW1haW5kZXIgaWYgYHZhbHVlYCBzdGFydHMgd2l0aCBgcHJlZml4YC4gKi9cbmZ1bmN0aW9uIHN0cmlwUHJlZml4KHZhbHVlOiBzdHJpbmcsIHByZWZpeDogc3RyaW5nKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0cmV0dXJuIHZhbHVlLnN0YXJ0c1dpdGgocHJlZml4KSA/IHZhbHVlLnNsaWNlKHByZWZpeC5sZW5ndGgpIDogdW5kZWZpbmVkO1xufVxuXG4vKiogUnVzdCBgc3RyOjpzdHJpcF9zdWZmaXhgOiByZXR1cm5zIHRoZSBsZWFkaW5nIHBhcnQgaWYgYHZhbHVlYCBlbmRzIHdpdGggYHN1ZmZpeGAuICovXG5mdW5jdGlvbiBzdHJpcFN1ZmZpeCh2YWx1ZTogc3RyaW5nLCBzdWZmaXg6IHN0cmluZyk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdHJldHVybiB2YWx1ZS5lbmRzV2l0aChzdWZmaXgpID8gdmFsdWUuc2xpY2UoMCwgdmFsdWUubGVuZ3RoIC0gc3VmZml4Lmxlbmd0aCkgOiB1bmRlZmluZWQ7XG59XG5cbi8qKiBSdXN0IGBzdHI6OnNwbGl0X29uY2VgOiBzcGxpdHMgYXQgdGhlIGZpcnN0IGBzZXBhcmF0b3JgIG9jY3VycmVuY2UuICovXG5mdW5jdGlvbiBzcGxpdE9uY2UodmFsdWU6IHN0cmluZywgc2VwYXJhdG9yOiBzdHJpbmcpOiBbc3RyaW5nLCBzdHJpbmddIHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgaW5kZXggPSB2YWx1ZS5pbmRleE9mKHNlcGFyYXRvcik7XG5cdGlmIChpbmRleCA9PT0gLTEpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdHJldHVybiBbdmFsdWUuc2xpY2UoMCwgaW5kZXgpLCB2YWx1ZS5zbGljZShpbmRleCArIHNlcGFyYXRvci5sZW5ndGgpXTtcbn1cblxuLyoqIFJ1c3QgYHN0cjo6cnNwbGl0X29uY2VgOiBzcGxpdHMgYXQgdGhlIGxhc3QgYHNlcGFyYXRvcmAgb2NjdXJyZW5jZS4gKi9cbmZ1bmN0aW9uIHJzcGxpdE9uY2UodmFsdWU6IHN0cmluZywgc2VwYXJhdG9yOiBzdHJpbmcpOiBbc3RyaW5nLCBzdHJpbmddIHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgaW5kZXggPSB2YWx1ZS5sYXN0SW5kZXhPZihzZXBhcmF0b3IpO1xuXHRpZiAoaW5kZXggPT09IC0xKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRyZXR1cm4gW3ZhbHVlLnNsaWNlKDAsIGluZGV4KSwgdmFsdWUuc2xpY2UoaW5kZXggKyBzZXBhcmF0b3IubGVuZ3RoKV07XG59XG5cbi8qKiBSdXN0IGBzdHI6OnRvX2FzY2lpX2xvd2VyY2FzZWA6IGxvd2VyY2FzZXMgb25seSBBU0NJSSBBLVosIGxlYXZpbmcgb3RoZXIgY2hhcmFjdGVycyB1bmNoYW5nZWQuICovXG5mdW5jdGlvbiBhc2NpaUxvd2VyY2FzZSh2YWx1ZTogc3RyaW5nKTogc3RyaW5nIHtcblx0bGV0IHJlc3VsdCA9ICcnO1xuXHRmb3IgKGxldCBpID0gMDsgaSA8IHZhbHVlLmxlbmd0aDsgaSsrKSB7XG5cdFx0Y29uc3QgY29kZSA9IHZhbHVlLmNoYXJDb2RlQXQoaSk7XG5cdFx0cmVzdWx0ICs9IGNvZGUgPj0gNjUgJiYgY29kZSA8PSA5MCA/IFN0cmluZy5mcm9tQ2hhckNvZGUoY29kZSArIDMyKSA6IHZhbHVlW2ldO1xuXHR9XG5cdHJldHVybiByZXN1bHQ7XG59XG5cbi8qKiBSdXN0IGBzdHI6OnBhcnNlOjo8dXNpemU+KClgOiBwYXJzZXMgYW4gb3B0aW9uYWwgYCtgIHNpZ24gZm9sbG93ZWQgYnkgQVNDSUkgZGlnaXRzLiAqL1xuZnVuY3Rpb24gcGFyc2VVc2l6ZSh2YWx1ZTogc3RyaW5nKTogbnVtYmVyIHwgdW5kZWZpbmVkIHtcblx0aWYgKCEvXlxcKz9cXGQrJC8udGVzdCh2YWx1ZSkpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdHJldHVybiBOdW1iZXIodmFsdWUpO1xufVxuXG5mdW5jdGlvbiBpc0FwdENvbW1hbmQoc2VnbWVudDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdGNvbnN0IHdpdGhvdXRTdWRvID0gc3RyaXBQcmVmaXgoc2VnbWVudCwgJ3N1ZG8gJykgPz8gc2VnbWVudDtcblx0Y29uc3QgYXJncyA9IHN0cmlwUHJlZml4KHdpdGhvdXRTdWRvLCAnYXB0LWdldCAnKSA/PyBzdHJpcFByZWZpeCh3aXRob3V0U3VkbywgJ2FwdCAnKTtcblx0aWYgKGFyZ3MgPT09IHVuZGVmaW5lZCkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRjb25zdCB0b2tlbnMgPSBzcGxpdFdoaXRlc3BhY2UoYXJncyk7XG5cdGxldCBpID0gMDtcblx0d2hpbGUgKGkgPCB0b2tlbnMubGVuZ3RoKSB7XG5cdFx0Y29uc3QgdG9rZW4gPSB0b2tlbnNbaV07XG5cdFx0aWYgKHRva2VuID09PSAnLW8nIHx8IHRva2VuID09PSAnLS1vcHRpb24nIHx8IHRva2VuID09PSAnLWMnIHx8IHRva2VuID09PSAnLS1jb25maWctZmlsZScpIHtcblx0XHRcdGkgKz0gMjtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblx0XHRpZiAodG9rZW4uc3RhcnRzV2l0aCgnLScpKSB7XG5cdFx0XHRpICs9IDE7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cdFx0cmV0dXJuIHRva2VuID09PSAndXBkYXRlJyB8fCB0b2tlbiA9PT0gJ2luc3RhbGwnO1xuXHR9XG5cdHJldHVybiBmYWxzZTtcbn1cblxuZnVuY3Rpb24gaXNQbnBtSW5zdGFsbENvbW1hbmQoc2VnbWVudDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdGNvbnN0IHRva2VucyA9IHNwbGl0V2hpdGVzcGFjZShzZWdtZW50KTtcblx0aWYgKHRva2Vuc1swXSAhPT0gJ3BucG0nKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdGxldCBpbmRleCA9IDE7XG5cdHdoaWxlIChpbmRleCA8IHRva2Vucy5sZW5ndGgpIHtcblx0XHRjb25zdCB0b2tlbiA9IHRva2Vuc1tpbmRleF07XG5cdFx0aWYgKFsnLS1maWx0ZXInLCAnLUYnLCAnLS1wcmVmaXgnLCAnLUMnLCAnLS1kaXInLCAnLS1sb2dsZXZlbCcsICctLXJlcG9ydGVyJywgJy0tcGFja2FnZS1pbXBvcnQtbWV0aG9kJywgJy0td29ya3NwYWNlLWNvbmN1cnJlbmN5J10uaW5jbHVkZXModG9rZW4pKSB7XG5cdFx0XHRpbmRleCArPSAyO1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXHRcdGlmIChbJy0tcmVjdXJzaXZlJywgJy1yJywgJy0td29ya3NwYWNlLXJvb3QnLCAnLXcnLCAnLS1zaWxlbnQnLCAnLXMnLCAnLS11c2Utc3RkZXJyJywgJy0tY29sb3InLCAnLS1uby1jb2xvciddLmluY2x1ZGVzKHRva2VuKVxuXHRcdFx0fHwgcmVnZXhUZXN0KFN0cmluZy5yYXdgXig/Oi0tZmlsdGVyfC0tcHJlZml4fC0tZGlyfC0tbG9nbGV2ZWx8LS1yZXBvcnRlcnwtLXBhY2thZ2UtaW1wb3J0LW1ldGhvZHwtLXdvcmtzcGFjZS1jb25jdXJyZW5jeXwtRnwtQyk9YCwgdG9rZW4pXG5cdFx0KSB7XG5cdFx0XHRpbmRleCArPSAxO1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXHRcdGJyZWFrO1xuXHR9XG5cdHJldHVybiB0b2tlbnNbaW5kZXhdID09PSAnaW5zdGFsbCcgfHwgdG9rZW5zW2luZGV4XSA9PT0gJ2knO1xufVxuXG5mdW5jdGlvbiBpc0dpdFByb2dyZXNzQ29tbWFuZChzZWdtZW50OiBzdHJpbmcpOiBib29sZWFuIHtcblx0Y29uc3QgdG9rZW5zID0gc3BsaXRXaGl0ZXNwYWNlKHNlZ21lbnQpO1xuXHRjb25zdCBpbmRleCA9IGdpdFN1YmNvbW1hbmRJbmRleCh0b2tlbnMpO1xuXHRpZiAoaW5kZXggPT09IHVuZGVmaW5lZCkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRjb25zdCBzdWJjb21tYW5kID0gdG9rZW5zW2luZGV4XTtcblx0cmV0dXJuIHN1YmNvbW1hbmQgPT09ICdjbG9uZScgfHwgc3ViY29tbWFuZCA9PT0gJ2ZldGNoJyB8fCBzdWJjb21tYW5kID09PSAncHVsbCdcblx0XHR8fCAoc3ViY29tbWFuZCA9PT0gJ3N1Ym1vZHVsZScgJiYgdG9rZW5zW2luZGV4ICsgMV0gPT09ICd1cGRhdGUnKTtcbn1cblxuZnVuY3Rpb24gaXNHaXRDbGVhbk9yUmVzZXRDb21tYW5kKHNlZ21lbnQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRjb25zdCB0b2tlbnMgPSBzcGxpdFdoaXRlc3BhY2Uoc2VnbWVudCk7XG5cdGNvbnN0IGluZGV4ID0gZ2l0U3ViY29tbWFuZEluZGV4KHRva2Vucyk7XG5cdGlmIChpbmRleCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdGNvbnN0IHN1YmNvbW1hbmQgPSB0b2tlbnNbaW5kZXhdO1xuXHRjb25zdCBhcmdzID0gdG9rZW5zLnNsaWNlKGluZGV4ICsgMSk7XG5cdGlmIChzdWJjb21tYW5kID09PSAncmVzZXQnKSB7XG5cdFx0cmV0dXJuIGFyZ3MuaW5jbHVkZXMoJy0taGFyZCcpO1xuXHR9XG5cdHJldHVybiBzdWJjb21tYW5kID09PSAnY2xlYW4nICYmIGFyZ3Muc29tZShhcmcgPT4gaXNHaXRDbGVhbkZvcmNlT3B0aW9uKGFyZykpO1xufVxuXG5mdW5jdGlvbiBpc0dpdENsZWFuRm9yY2VPcHRpb24oYXJnOiBzdHJpbmcpOiBib29sZWFuIHtcblx0cmV0dXJuIGFyZyA9PT0gJy0tZm9yY2UnIHx8IChyZWdleFRlc3QoU3RyaW5nLnJhd2BeLVtBLVphLXpdKyRgLCBhcmcpICYmIGFyZy5pbmNsdWRlcygnZicpKTtcbn1cblxuZnVuY3Rpb24gaXNCZW5pZ25HaXRDb21tYW5kKHNlZ21lbnQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRjb25zdCB0b2tlbnMgPSBzcGxpdFdoaXRlc3BhY2Uoc2VnbWVudCk7XG5cdGNvbnN0IGluZGV4ID0gZ2l0U3ViY29tbWFuZEluZGV4KHRva2Vucyk7XG5cdGlmIChpbmRleCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdGNvbnN0IHN1YmNvbW1hbmQgPSB0b2tlbnNbaW5kZXhdO1xuXHRjb25zdCBhcmdzID0gdG9rZW5zLnNsaWNlKGluZGV4ICsgMSk7XG5cdGlmIChzdWJjb21tYW5kID09PSAnc3RhdHVzJykge1xuXHRcdHJldHVybiBhcmdzLmV2ZXJ5KGFyZyA9PlxuXHRcdFx0YXJnID09PSAnLS1zaG9ydCcgfHwgYXJnID09PSAnLXMnIHx8IGFyZyA9PT0gJy0tcG9yY2VsYWluJyB8fCBhcmcuc3RhcnRzV2l0aCgnLS11bnRyYWNrZWQtZmlsZXMnKSk7XG5cdH1cblx0aWYgKHN1YmNvbW1hbmQgPT09ICdkaWZmJykge1xuXHRcdGNvbnN0IGhhc1N1bW1hcnlPdXRwdXQgPSBhcmdzLnNvbWUoYXJnID0+XG5cdFx0XHRbJy0tc3RhdCcsICctLXNob3J0c3RhdCcsICctLW51bXN0YXQnLCAnLS1uYW1lLW9ubHknLCAnLS1uYW1lLXN0YXR1cycsICctLXN1bW1hcnknLCAnLS1jb21wYWN0LXN1bW1hcnknXS5pbmNsdWRlcyhhcmcpKTtcblx0XHRyZXR1cm4gaGFzU3VtbWFyeU91dHB1dFxuXHRcdFx0JiYgIWFyZ3Muc29tZShhcmcgPT5cblx0XHRcdFx0YXJnID09PSAnLXAnIHx8IGFyZyA9PT0gJy11JyB8fCBhcmcgPT09ICctLXBhdGNoJ1xuXHRcdFx0XHR8fCBhcmcuc3RhcnRzV2l0aCgnLS1wYXRjaC0nKVxuXHRcdFx0XHR8fCBhcmcuc3RhcnRzV2l0aCgnLS13b3JkLWRpZmYnKVxuXHRcdFx0XHR8fCBhcmcuc3RhcnRzV2l0aCgnLS1jb2xvci13b3JkcycpKTtcblx0fVxuXHRyZXR1cm4gc3ViY29tbWFuZCA9PT0gJ3Jldi1wYXJzZSdcblx0XHQmJiBhcmdzLmV2ZXJ5KGFyZyA9PiBhcmcgPT09ICctLXNob3ctdG9wbGV2ZWwnIHx8IGFyZyA9PT0gJy0tc2hvdy1wcmVmaXgnKTtcbn1cblxuZnVuY3Rpb24gZ2l0U3ViY29tbWFuZEluZGV4KHRva2Vuczogc3RyaW5nW10pOiBudW1iZXIgfCB1bmRlZmluZWQge1xuXHRpZiAodG9rZW5zWzBdICE9PSAnZ2l0Jykge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0bGV0IGluZGV4ID0gMTtcblx0d2hpbGUgKGluZGV4IDwgdG9rZW5zLmxlbmd0aCkge1xuXHRcdGNvbnN0IHRva2VuID0gdG9rZW5zW2luZGV4XTtcblx0XHRpZiAodG9rZW4gPT09ICctQycgfHwgdG9rZW4gPT09ICctLWdpdC1kaXInIHx8IHRva2VuID09PSAnLS13b3JrLXRyZWUnKSB7XG5cdFx0XHRpbmRleCArPSAyO1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXHRcdGlmICh0b2tlbi5zdGFydHNXaXRoKCctYycpKSB7XG5cdFx0XHRpbmRleCArPSB0b2tlbiA9PT0gJy1jJyA/IDIgOiAxO1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXHRcdGlmICh0b2tlbi5zdGFydHNXaXRoKCctLScpKSB7XG5cdFx0XHRpbmRleCArPSAxO1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXHRcdGJyZWFrO1xuXHR9XG5cdHJldHVybiBpbmRleCA8IHRva2Vucy5sZW5ndGggPyBpbmRleCA6IHVuZGVmaW5lZDtcbn1cblxuZnVuY3Rpb24gaXNKc1Rlc3RDb21tYW5kKHNlZ21lbnQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gIXJlZ2V4VGVzdChcblx0XHRTdHJpbmcucmF3YCg/Ol58XFxzKSg/Oi13fC0td2F0Y2goPzpbPVxcc118JCl8LS13YXRjaEFsbCg/Ols9XFxzXXwkKXwtLXdhdGNoLWFsbCg/Ols9XFxzXXwkKXwtLXdhdGNoLWZpbGVzKD86Wz1cXHNdfCQpKWAsXG5cdFx0c2VnbWVudCxcblx0KSAmJiByZWdleFRlc3QoXG5cdFx0U3RyaW5nLnJhd2BeKD86bnB4XFxzK3woPzpucG18cG5wbXx5YXJuKVxccytleGVjXFxzKyk/KD86dml0ZXN0fGplc3R8bW9jaGF8dGFwKSg/Olxcc3wkKWAsXG5cdFx0c2VnbWVudCxcblx0KTtcbn1cblxuZnVuY3Rpb24gaXNZYXJuQmVycnlDb21tYW5kKHNlZ21lbnQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gcmVnZXhUZXN0KFxuXHRcdFN0cmluZy5yYXdgXig/Onlhcm58Y29yZXBhY2tcXHMreWFybilcXHMrKD86aW5zdGFsbHxhZGR8d29ya3NwYWNlc3xydW5cXHMraW5zdGFsbClcXGJgLFxuXHRcdHNlZ21lbnQsXG5cdCkgfHwgcmVnZXhUZXN0KFxuXHRcdFN0cmluZy5yYXdgXm5vZGVcXHMrKD86XFwuLyk/c2NyaXB0L3lhcm5cXC5qc1xccysoPzppbnN0YWxsfGFkZClcXGJgLFxuXHRcdHNlZ21lbnQsXG5cdCk7XG59XG5cbmZ1bmN0aW9uIGlzTnhDb21tYW5kKHNlZ21lbnQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gcmVnZXhUZXN0KFxuXHRcdFN0cmluZy5yYXdgXig/Om54fCg/Onlhcm58cG5wbSlcXHMrKD86bnh8cmVsZWFzZTpidWlsZHx0eXBlc2NyaXB0fHRlc3Q6dHN8bGludCkpXFxiYCxcblx0XHRzZWdtZW50LFxuXHQpO1xufVxuXG5mdW5jdGlvbiBpc0RqYW5nb1Rlc3RDb21tYW5kKHNlZ21lbnQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRjb25zdCBweXRob25XaXRoT3B0aW9ucyA9IHB5dGhvbldpdGhPcHRpb25zUGF0dGVybigpO1xuXHRyZXR1cm4gcmVnZXhUZXN0KFxuXHRcdFN0cmluZy5yYXdgXiR7cHl0aG9uV2l0aE9wdGlvbnN9XFxzKyg/Oig/OlxcLi8pPyg/OnRlc3RzLyk/cnVudGVzdHNcXC5weXxtYW5hZ2VcXC5weVxccyt0ZXN0fC1tXFxzK2RqYW5nb1xccyt0ZXN0KVxcYmAsXG5cdFx0c2VnbWVudCxcblx0KSB8fCByZWdleFRlc3QoU3RyaW5nLnJhd2BeZGphbmdvLWFkbWluXFxzK3Rlc3RcXGJgLCBzZWdtZW50KTtcbn1cblxuZnVuY3Rpb24gaXNHb2xhbmdjaUxpbnRDb21tYW5kKHNlZ21lbnQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gcmVnZXhUZXN0KFN0cmluZy5yYXdgXig/OltBLVphLXowLTlfLi8rLV0rLyk/Z29sYW5nY2ktbGludFxccytydW5cXGJgLCBzZWdtZW50KVxuXHRcdHx8IHJlZ2V4VGVzdChcblx0XHRcdFN0cmluZy5yYXdgXmdvXFxzK3J1blxccytnaXRodWJcXC5jb20vZ29sYW5nY2kvZ29sYW5nY2ktbGludC9jbWQvZ29sYW5nY2ktbGludCg/OkBcXFMrKT9cXHMrcnVuXFxiYCxcblx0XHRcdHNlZ21lbnQsXG5cdFx0KTtcbn1cblxuZnVuY3Rpb24gaXNDbGFuZ0Zvcm1hdExpbnRlckNvbW1hbmQoc2VnbWVudDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiByZWdleFRlc3QoXG5cdFx0U3RyaW5nLnJhd2BeJHtweXRob25XaXRoT3B0aW9uc1BhdHRlcm4oKX1cXHMrXFxTKnRvb2xzL2xpbnRlci9hZGFwdGVycy9jbGFuZ2Zvcm1hdF9saW50ZXJcXC5weVxcYmAsXG5cdFx0c2VnbWVudCxcblx0KTtcbn1cblxuZnVuY3Rpb24gaXNHcmFkbGVDb21tYW5kKHNlZ21lbnQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gcmVnZXhUZXN0KFxuXHRcdFN0cmluZy5yYXdgXig/Oig/OlxcLi98L1xcUysvKT9ncmFkbGV3P3xcXCRHUkFETEV8XFwkXFx7R1JBRExFXFx9KSg/Olxcc3wkKWAsXG5cdFx0c2VnbWVudCxcblx0KTtcbn1cblxuZnVuY3Rpb24gaXNDbWFrZUNvbmZpZ3VyZUNvbW1hbmQoc2VnbWVudDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiByZWdleFRlc3QoU3RyaW5nLnJhd2BeY21ha2UoPzpcXHN8JClgLCBzZWdtZW50KVxuXHRcdCYmICFzcGxpdFdoaXRlc3BhY2Uoc2VnbWVudCkuc29tZSh0b2tlbiA9PlxuXHRcdFx0cmVnZXhUZXN0KFN0cmluZy5yYXdgXig/Oi0tYnVpbGR8LS1pbnN0YWxsfC1FfC1QfC0tdmVyc2lvbnwtTnwtaHwtLWhlbHAoPzotLispPykkYCwgdG9rZW4pKTtcbn1cblxuZnVuY3Rpb24gaXNNYXZlbkNvbW1hbmQoc2VnbWVudDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiByZWdleFRlc3QoU3RyaW5nLnJhd2BeKD86KD86XFwuLyk/bXZudz98bXZuKSg/Olxcc3wkKWAsIHNlZ21lbnQpO1xufVxuXG5mdW5jdGlvbiBpc0RvdG5ldENvbW1hbmQoc2VnbWVudDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiByZWdleFRlc3QoU3RyaW5nLnJhd2BeZG90bmV0XFxzKyg/OmJ1aWxkfHRlc3R8cmVzdG9yZXxwdWJsaXNofHBhY2spKD86XFxzfCQpYCwgc2VnbWVudCk7XG59XG5cbmZ1bmN0aW9uIGlzVXZDb21tYW5kKHNlZ21lbnQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gcmVnZXhUZXN0KFxuXHRcdFN0cmluZy5yYXdgXig/OnV2fCg/OnB5dGhvbnxweXRob24zKD86XFwuXFxkKyk/KVxccystbVxccyt1dilcXHMrKD86c3luY3xwaXBcXHMrKD86aW5zdGFsbHxzeW5jfGNvbXBpbGUpfHZlbnZ8YWRkfGxvY2t8cnVuKVxcYmAsXG5cdFx0c2VnbWVudCxcblx0KTtcbn1cblxuZnVuY3Rpb24gaXNQaXBJbnN0YWxsQ29tbWFuZChzZWdtZW50OiBzdHJpbmcpOiBib29sZWFuIHtcblx0cmV0dXJuIHJlZ2V4VGVzdChcblx0XHRTdHJpbmcucmF3YF4oPzooPzoke3B5dGhvbkV4ZWN1dGFibGVQYXR0ZXJuKCl9KVxccystbVxccytwaXB8cGlwfHBpcDMpXFxzK2luc3RhbGxcXGJgLFxuXHRcdHNlZ21lbnQsXG5cdCk7XG59XG5cbmZ1bmN0aW9uIGlzR29Db21tYW5kKHNlZ21lbnQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gcmVnZXhUZXN0KFxuXHRcdFN0cmluZy5yYXdgXig/OmdvfC8oPzpcXFMrLykqZ28pXFxzKyg/OnRlc3R8YnVpbGR8aW5zdGFsbHxnZXR8bW9kXFxzKyg/OnRpZHl8ZG93bmxvYWR8dmVyaWZ5fGdyYXBoKXx3b3JrXFxzK3N5bmMpXFxiYCxcblx0XHRzZWdtZW50LFxuXHQpO1xufVxuXG4vLyNlbmRyZWdpb25cblxuLy8jcmVnaW9uIHNoZWxsX291dHB1dF9jb21wYWN0b3IucnMgXHUyMDE0IHB5dGhvbiBkZXRlY3RvcnMsIGdyZXAgc2FmZXR5LCBzZWdtZW50YXRpb25cblxuZnVuY3Rpb24gaXNQeXRlc3RDb21tYW5kKHNlZ21lbnQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gcmVnZXhUZXN0KFxuXHRcdFN0cmluZy5yYXdgXig/Oig/OiR7cHl0aG9uV2l0aE9wdGlvbnNQYXR0ZXJuKCl9KVxccystbVxccytweXRlc3R8KD86KD86W0EtWmEtejAtOV8uLystXSsvKT9weXRlc3QpKSg/Olxcc3wkKWAsXG5cdFx0c2VnbWVudCxcblx0KTtcbn1cblxuZnVuY3Rpb24gaXNQeXRob25Vbml0dGVzdENvbW1hbmQoc2VnbWVudDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiByZWdleFRlc3QoU3RyaW5nLnJhd2BeJHtweXRob25XaXRoT3B0aW9uc1BhdHRlcm4oKX1cXHMrLW1cXHMrdW5pdHRlc3RcXGJgLCBzZWdtZW50KTtcbn1cblxuZnVuY3Rpb24gaXNQeXRob25CdWlsZENvbW1hbmQoc2VnbWVudDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiByZWdleFRlc3QoU3RyaW5nLnJhd2BeJHtweXRob25XaXRoT3B0aW9uc1BhdHRlcm4oKX1cXHMrLW1cXHMrYnVpbGQoPzpcXHN8JClgLCBzZWdtZW50KTtcbn1cblxuZnVuY3Rpb24gaXNQeXRob25CdWlsZEV4dENvbW1hbmQoc2VnbWVudDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiByZWdleFRlc3QoU3RyaW5nLnJhd2BeJHtweXRob25FeGVjdXRhYmxlUGF0dGVybigpfVxccytzZXR1cFxcLnB5XFxzK2J1aWxkX2V4dFxcYmAsIHNlZ21lbnQpO1xufVxuXG5mdW5jdGlvbiBpc1B5dGhvblNjcmlwdENvbW1hbmQoc2VnbWVudDogc3RyaW5nLCBpc0hlcmVkb2NTdGRpblNlZ21lbnQ6IGJvb2xlYW4pOiBib29sZWFuIHtcblx0cmV0dXJuIGlzSGVyZWRvY1N0ZGluUHl0aG9uQ29tbWFuZChzZWdtZW50LCBpc0hlcmVkb2NTdGRpblNlZ21lbnQpXG5cdFx0fHwgcmVnZXhUZXN0KFxuXHRcdFx0U3RyaW5nLnJhd2BeJHtweXRob25XaXRoT3B0aW9uc1BhdHRlcm4oKX1cXHMrKD86LWNcXHMrKD86XCJbXlwiXSpcInwnW14nXSonfFxcUyspfCg/OlwiW15cIl0rXFwucHlcInwnW14nXStcXC5weSd8W15cXHMtXVxcUypcXC5weSkpKD86XFxzfCQpYCxcblx0XHRcdHNlZ21lbnQsXG5cdFx0KTtcbn1cblxuZnVuY3Rpb24gaXNIZXJlZG9jU3RkaW5QeXRob25Db21tYW5kKHNlZ21lbnQ6IHN0cmluZywgaXNIZXJlZG9jU3RkaW5TZWdtZW50OiBib29sZWFuKTogYm9vbGVhbiB7XG5cdHJldHVybiBpc0hlcmVkb2NTdGRpblNlZ21lbnRcblx0XHQmJiByZWdleFRlc3QoU3RyaW5nLnJhd2BeJHtweXRob25FeGVjdXRhYmxlUGF0dGVybigpfVxccystJGAsIHNlZ21lbnQpO1xufVxuXG5mdW5jdGlvbiBpc0JlbmlnblNldHVwQ29tbWFuZChzZWdtZW50OiBzdHJpbmcpOiBib29sZWFuIHtcblx0cmV0dXJuIGlzU291cmNlQWN0aXZhdGVDb21tYW5kKHNlZ21lbnQpXG5cdFx0fHwgaXNCZW5pZ25QeXRob25WZW52Q29tbWFuZChzZWdtZW50KVxuXHRcdHx8IHJlZ2V4VGVzdChcblx0XHRcdFN0cmluZy5yYXdgXm1rZGlyXFxzKy1wXFxzKyg/OlwiW15cIl0qXCJ8J1teJ10qJ3xbXlxcc10rKSg/OlxccysoPzpcIlteXCJdKlwifCdbXiddKid8W15cXHNdKykpKiRgLFxuXHRcdFx0c2VnbWVudCxcblx0XHQpXG5cdFx0fHwgcmVnZXhUZXN0KFN0cmluZy5yYXdgXnVtYXNrXFxzK1swLTddezMsNH0kYCwgc2VnbWVudClcblx0XHR8fCByZWdleFRlc3QoXG5cdFx0XHRTdHJpbmcucmF3YF51bnNldFxccytbQS1aYS16X11bQS1aYS16MC05X10qKD86XFxzK1tBLVphLXpfXVtBLVphLXowLTlfXSopKiRgLFxuXHRcdFx0c2VnbWVudCxcblx0XHQpXG5cdFx0fHwgc2VnbWVudCA9PT0gJ2hhc2ggLXInXG5cdFx0fHwgaXNCZW5pZ25Db3JlcGFja1lhcm5TZXR1cENvbW1hbmQoc2VnbWVudClcblx0XHR8fCBpc0xpdGVyYWxTZXBhcmF0b3JDb21tYW5kKHNlZ21lbnQpO1xufVxuXG5mdW5jdGlvbiBpc1NvdXJjZUFjdGl2YXRlQ29tbWFuZChzZWdtZW50OiBzdHJpbmcpOiBib29sZWFuIHtcblx0cmV0dXJuIHJlZ2V4VGVzdChcblx0XHRTdHJpbmcucmF3YF4oPzpzb3VyY2V8XFwuKVxccysoPzpcIlteXCJdKig/Ol58LylhY3RpdmF0ZVwifCdbXiddKig/Ol58LylhY3RpdmF0ZSd8XFxTKig/Ol58LylhY3RpdmF0ZSkkYCxcblx0XHRzZWdtZW50LFxuXHQpO1xufVxuXG5mdW5jdGlvbiBpc0JlbmlnbkNvcmVwYWNrWWFyblNldHVwQ29tbWFuZChzZWdtZW50OiBzdHJpbmcpOiBib29sZWFuIHtcblx0cmV0dXJuIHJlZ2V4VGVzdChTdHJpbmcucmF3YF5jb3JlcGFja1xccysoPzplbmFibGV8cHJlcGFyZVxccyt5YXJuQFxcUytcXHMrLS1hY3RpdmF0ZSkkYCwgc2VnbWVudCk7XG59XG5cbmZ1bmN0aW9uIGlzQmVuaWduUHl0aG9uVmVudkNvbW1hbmQoc2VnbWVudDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiByZWdleFRlc3QoU3RyaW5nLnJhd2BeJHtweXRob25FeGVjdXRhYmxlUGF0dGVybigpfVxccystbVxccyt2ZW52KD86XFxzK1xcUyspKyRgLCBzZWdtZW50KVxuXHRcdCYmICFyZWdleFRlc3QoU3RyaW5nLnJhd2BcXHMoPzotLWhlbHB8LWgpKD86XFxzfCQpYCwgc2VnbWVudCk7XG59XG5cbmZ1bmN0aW9uIGlzQmVuaWduR29mbXRXcml0ZUNvbW1hbmQoc2VnbWVudDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiByZWdleFRlc3QoXG5cdFx0U3RyaW5nLnJhd2BeZ29mbXRcXHMrLXcoPzpcXHMrKD86XCJbXlwiLV1bXlwiXSpcInwnW14nLV1bXiddKid8W14tXFxzXVxcUyopKSskYCxcblx0XHRzZWdtZW50LFxuXHQpO1xufVxuXG5mdW5jdGlvbiBpc0JlbmlnblRhcmJhbGxDbGVhbnVwQ29tbWFuZChzZWdtZW50OiBzdHJpbmcpOiBib29sZWFuIHtcblx0cmV0dXJuIHJlZ2V4VGVzdChcblx0XHRTdHJpbmcucmF3YF5ybVxccystZlxccysoPzpcIlteXCJdK1xcLnRnelwifCdbXiddK1xcLnRneid8XFxTK1xcLnRneikkYCxcblx0XHRzZWdtZW50LFxuXHQpO1xufVxuXG5mdW5jdGlvbiBpc0JlbmlnblB5dGhvbkJ1aWxkQ2xlYW51cENvbW1hbmQoc2VnbWVudDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiByZWdleFRlc3QoU3RyaW5nLnJhd2Becm1cXHMrLXJmXFxzK2Rpc3RcXHMrYnVpbGRcXHMrXFwqXFwuZWdnLWluZm8kYCwgc2VnbWVudCk7XG59XG5cbmZ1bmN0aW9uIGlzQmVuaWduVmVyc2lvbkNvbW1hbmQoc2VnbWVudDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiByZWdleFRlc3QoU3RyaW5nLnJhd2BeL1xcUytcXHMrKD86LS12ZXJzaW9ufC12ZXJzaW9ufHZlcnNpb24pJGAsIHNlZ21lbnQpO1xufVxuXG5mdW5jdGlvbiBpc0Fzc2lnbm1lbnRMaXN0KHNlZ21lbnQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gcmVnZXhUZXN0KFxuXHRcdFN0cmluZy5yYXdgXig/OltBLVphLXpfXVtBLVphLXowLTlfXSo9KD86XCJbXlwiXSpcInwnW14nXSonfFteXFxzXSspKSg/OlxccytbQS1aYS16X11bQS1aYS16MC05X10qPSg/OlwiW15cIl0qXCJ8J1teJ10qJ3xbXlxcc10rKSkqJGAsXG5cdFx0c2VnbWVudCxcblx0KTtcbn1cblxuZnVuY3Rpb24gc3RyaXBFbnZpcm9ubWVudEFzc2lnbm1lbnRQcmVmaXgoc2VnbWVudDogc3RyaW5nKTogc3RyaW5nIHtcblx0cmV0dXJuIHJlZ2V4UmVwbGFjZUFsbChcblx0XHRTdHJpbmcucmF3YF4oW0EtWmEtel9dW0EtWmEtejAtOV9dKj0oPzpcIlteXCJdKlwifCdbXiddKid8XFxTKylcXHMrKStgLFxuXHRcdHNlZ21lbnQsXG5cdFx0JycsXG5cdCk7XG59XG5cbmZ1bmN0aW9uIHN0cmlwU2FmZUNvbW1hbmRXcmFwcGVycyhzZWdtZW50OiBzdHJpbmcpOiBzdHJpbmcge1xuXHRsZXQgY3VycmVudCA9IHNlZ21lbnQ7XG5cdGZvciAobGV0IGl0ZXJhdGlvbiA9IDA7IGl0ZXJhdGlvbiA8IDM7IGl0ZXJhdGlvbisrKSB7XG5cdFx0Y29uc3QgYmVmb3JlID0gY3VycmVudDtcblx0XHRjdXJyZW50ID0gc3RyaXBFbnZpcm9ubWVudEFzc2lnbm1lbnRQcmVmaXgocmVnZXhSZXBsYWNlQWxsKFxuXHRcdFx0U3RyaW5nLnJhd2BedGltZW91dFxccytcXGQrKD86W3NtaGRdKT9cXHMrYCxcblx0XHRcdGN1cnJlbnQsXG5cdFx0XHQnJyxcblx0XHQpKTtcblx0XHRjdXJyZW50ID0gc3RyaXBFbnZpcm9ubWVudEFzc2lnbm1lbnRQcmVmaXgocmVnZXhSZXBsYWNlQWxsKFxuXHRcdFx0U3RyaW5nLnJhd2BeZW52KD86XFxzK1tBLVphLXpfXVtBLVphLXowLTlfXSo9KD86XCJbXlwiXSpcInwnW14nXSonfFxcUyspKStcXHMrYCxcblx0XHRcdGN1cnJlbnQsXG5cdFx0XHQnJyxcblx0XHQpKTtcblx0XHRpZiAoY3VycmVudCA9PT0gYmVmb3JlKSB7XG5cdFx0XHRyZXR1cm4gY3VycmVudDtcblx0XHR9XG5cdH1cblx0cmV0dXJuIGN1cnJlbnQ7XG59XG5cbmZ1bmN0aW9uIGlzTGl0ZXJhbFNlcGFyYXRvckNvbW1hbmQoc2VnbWVudDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiByZWdleFRlc3QoXG5cdFx0U3RyaW5nLnJhd2BeZWNobyg/Olxccystbik/KD86XFxzKyg/OlwiW1xccyM9Xy46LyorXFwtW1xcXV17MSwxOX1cInwnW1xccyM9Xy46LyorXFwtW1xcXV17MSwxOX0nKSkrJGAsXG5cdFx0c2VnbWVudCxcblx0KSB8fCByZWdleFRlc3QoXG5cdFx0U3RyaW5nLnJhd2BecHJpbnRmXFxzKyg/OlwiKD86W1xccyM9Xy46LyorXFwtW1xcXV18XFxcXG58XFxcXHQpezEsMTl9XCJ8Jyg/OltcXHMjPV8uOi8qK1xcLVtcXF1dfFxcXFxufFxcXFx0KXsxLDE5fScpJGAsXG5cdFx0c2VnbWVudCxcblx0KTtcbn1cblxuZnVuY3Rpb24gaXNTYWZlU2hlbGxHcmVwQ29tbWFuZChzZWdtZW50OiBzdHJpbmcpOiBib29sZWFuIHtcblx0Y29uc3QgdG9rZW5zID0gc3BsaXRXaGl0ZXNwYWNlKHNlZ21lbnQpO1xuXHRjb25zdCBjb21tYW5kID0gdG9rZW5zWzBdO1xuXHRpZiAoY29tbWFuZCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdGlmICghKGNvbW1hbmQgPT09ICdyZycgfHwgY29tbWFuZCA9PT0gJ2dyZXAnIHx8IGNvbW1hbmQgPT09ICdlZ3JlcCcgfHwgY29tbWFuZCA9PT0gJ2ZncmVwJykpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRjb25zdCBhcmdzID0gdG9rZW5zLnNsaWNlKDEpO1xuXHRsZXQgcGF0dGVybkNvdW50ID0gMDtcblx0bGV0IGkgPSAwO1xuXHR3aGlsZSAoaSA8IGFyZ3MubGVuZ3RoKSB7XG5cdFx0Y29uc3QgYXJnID0gYXJnc1tpXTtcblx0XHRpZiAoYXJnID09PSAnLS0nKSB7XG5cdFx0XHRyZXR1cm4gaSA8IGFyZ3MubGVuZ3RoIC0gMVxuXHRcdFx0XHQmJiAhYXJncy5zbGljZShpICsgMSkuc29tZShhID0+IGlzU2F2ZWRUb29sT3V0cHV0UGF0aChhKSk7XG5cdFx0fVxuXHRcdGlmIChhcmcgPT09ICctZScgfHwgYXJnID09PSAnLS1yZWdleHAnKSB7XG5cdFx0XHRpICs9IDE7XG5cdFx0XHRpZiAoaSA+PSBhcmdzLmxlbmd0aCkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHRwYXR0ZXJuQ291bnQgKz0gMTtcblx0XHRcdGlmIChwYXR0ZXJuQ291bnQgPiAxKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHRcdGkgKz0gMTtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblx0XHRpZiAoKGFyZy5zdGFydHNXaXRoKCctZScpICYmIGFyZy5sZW5ndGggPiAyKSB8fCBhcmcuc3RhcnRzV2l0aCgnLS1yZWdleHA9JykpIHtcblx0XHRcdHBhdHRlcm5Db3VudCArPSAxO1xuXHRcdFx0aWYgKHBhdHRlcm5Db3VudCA+IDEpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0aSArPSAxO1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXHRcdGlmIChpc1NoZWxsR3JlcEZsYWdXaXRoVmFsdWUoYXJnKSkge1xuXHRcdFx0aSArPSAxO1xuXHRcdFx0aWYgKGkgPj0gYXJncy5sZW5ndGgpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0aSArPSAxO1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXHRcdGlmIChyZWdleFRlc3QoU3RyaW5nLnJhd2BeKD86LS1nbG9ifC0taW5jbHVkZXwtLWV4Y2x1ZGV8LS1leGNsdWRlLWRpcik9YCwgYXJnKSkge1xuXHRcdFx0aSArPSAxO1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXHRcdGlmIChhcmcuc3RhcnRzV2l0aCgnLScpKSB7XG5cdFx0XHRpZiAoaXNVbnNhZmVTaGVsbEdyZXBGbGFnKGFyZykgfHwgIWlzU2FmZVNoZWxsR3JlcEZsYWcoY29tbWFuZCwgYXJnKSkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHRpICs9IDE7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cdFx0aWYgKGlzU2F2ZWRUb29sT3V0cHV0UGF0aChhcmcpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGlmIChwYXR0ZXJuQ291bnQgPT09IDApIHtcblx0XHRcdHBhdHRlcm5Db3VudCArPSAxO1xuXHRcdH1cblx0XHRpICs9IDE7XG5cdH1cblx0cmV0dXJuIHBhdHRlcm5Db3VudCA9PT0gMTtcbn1cblxuZnVuY3Rpb24gaXNTaGVsbEdyZXBGbGFnV2l0aFZhbHVlKGFyZzogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiBhcmcgPT09ICctZycgfHwgYXJnID09PSAnLS1nbG9iJyB8fCBhcmcgPT09ICctLWluY2x1ZGUnIHx8IGFyZyA9PT0gJy0tZXhjbHVkZScgfHwgYXJnID09PSAnLS1leGNsdWRlLWRpcic7XG59XG5cbmZ1bmN0aW9uIGlzU2FmZVNoZWxsR3JlcEZsYWcoY29tbWFuZDogc3RyaW5nLCBhcmc6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gKGNvbW1hbmQgPT09ICdyZydcblx0XHQ/IHJlZ2V4VGVzdChTdHJpbmcucmF3YF4tW25IaXd4RUZQXSskYCwgYXJnKVxuXHRcdDogcmVnZXhUZXN0KFN0cmluZy5yYXdgXi1bbkhpd3hFclJGUF0rJGAsIGFyZykpXG5cdFx0fHwgcmVnZXhUZXN0KFxuXHRcdFx0U3RyaW5nLnJhd2BeKD86LS1saW5lLW51bWJlcnwtLXdpdGgtZmlsZW5hbWV8LS1uby1oZWFkaW5nfC0taWdub3JlLWNhc2V8LS13b3JkLXJlZ2V4cHwtLWxpbmUtcmVnZXhwfC0tcmVjdXJzaXZlfC0tZXh0ZW5kZWQtcmVnZXhwfC0tZml4ZWQtc3RyaW5nc3wtLXBlcmwtcmVnZXhwfC0tY29sb3I9bmV2ZXIpJGAsXG5cdFx0XHRhcmcsXG5cdFx0KTtcbn1cblxuZnVuY3Rpb24gaXNVbnNhZmVTaGVsbEdyZXBGbGFnKGFyZzogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiBhcmcgPT09ICctZidcblx0XHR8fCBhcmcgPT09ICctLWZpbGUnXG5cdFx0fHwgYXJnLnN0YXJ0c1dpdGgoJy0tZmlsZT0nKVxuXHRcdHx8IHJlZ2V4VGVzdChcblx0XHRcdFN0cmluZy5yYXdgXig/Oi0tanNvbnwtLXZpbWdyZXB8LS1maWxlc3wtLXR5cGUtbGlzdHwtLWhlYWRpbmd8LS1uby1saW5lLW51bWJlcnwtLW5vLWZpbGVuYW1lfC0tY291bnR8LS1jb3VudC1tYXRjaGVzfC0tZmlsZXMtd2l0aCg/Om91dCk/LW1hdGNoZXN8LS1vbmx5LW1hdGNoaW5nfC0tcXVpZXR8LS1udWxsfC0tbnVsbC1kYXRhfC0tdGV4dHwtLWJpbmFyeXwtLWNvbnRleHR8LS1iZWZvcmUtY29udGV4dHwtLWFmdGVyLWNvbnRleHR8LS1pbnZlcnQtbWF0Y2h8LS1wYXNzdGhydXwtLXJlcGxhY2V8LS1saW5lLWJ1ZmZlcmVkfC0tY29sb3I9YWx3YXlzKSRgLFxuXHRcdFx0YXJnLFxuXHRcdClcblx0XHR8fCByZWdleFRlc3QoU3RyaW5nLnJhd2BeLVteLV0qW0EtQ0xsY29xdlowXWAsIGFyZyk7XG59XG5cbmZ1bmN0aW9uIGlzU2FmZVN0cmVhbWluZ0dyZXBUYWlsKHNlZ21lbnQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRjb25zdCBhcmdzVGV4dCA9IHN0cmlwUHJlZml4KHNlZ21lbnQsICdncmVwICcpID8/IHN0cmlwUHJlZml4KHNlZ21lbnQsICdlZ3JlcCAnKSA/PyBzdHJpcFByZWZpeChzZWdtZW50LCAnZmdyZXAgJyk7XG5cdGlmIChhcmdzVGV4dCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdGNvbnN0IGFyZ3MgPSBzcGxpdFdoaXRlc3BhY2UoYXJnc1RleHQpO1xuXHRsZXQgcGF0dGVybkNvdW50ID0gMDtcblx0bGV0IGkgPSAwO1xuXHR3aGlsZSAoaSA8IGFyZ3MubGVuZ3RoKSB7XG5cdFx0Y29uc3QgYXJnID0gYXJnc1tpXTtcblx0XHRpZiAoYXJnID09PSAnLS0nKSB7XG5cdFx0XHRyZXR1cm4gaSA9PT0gYXJncy5sZW5ndGggLSAxO1xuXHRcdH1cblx0XHRpZiAoYXJnID09PSAnLWUnIHx8IGFyZyA9PT0gJy0tcmVnZXhwJykge1xuXHRcdFx0aSArPSAxO1xuXHRcdFx0aWYgKGkgPj0gYXJncy5sZW5ndGgpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0cGF0dGVybkNvdW50ICs9IDE7XG5cdFx0XHRpICs9IDE7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cdFx0aWYgKChhcmcuc3RhcnRzV2l0aCgnLWUnKSAmJiBhcmcubGVuZ3RoID4gMikgfHwgYXJnLnN0YXJ0c1dpdGgoJy0tcmVnZXhwPScpKSB7XG5cdFx0XHRwYXR0ZXJuQ291bnQgKz0gMTtcblx0XHRcdGkgKz0gMTtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblx0XHRpZiAoYXJnID09PSAnLWYnXG5cdFx0XHR8fCBhcmcgPT09ICctLWZpbGUnXG5cdFx0XHR8fCBhcmcuc3RhcnRzV2l0aCgnLS1maWxlPScpXG5cdFx0XHR8fCByZWdleFRlc3QoU3RyaW5nLnJhd2BeLVteLV0qW2NDZkZQUnJMbG1vcV1gLCBhcmcpXG5cdFx0XHR8fCByZWdleFRlc3QoXG5cdFx0XHRcdFN0cmluZy5yYXdgXig/Oi0tKD86Y291bnR8Zml4ZWQtc3RyaW5nc3xwZXJsLXJlZ2V4cHxyZWN1cnNpdmV8ZGVyZWZlcmVuY2UtcmVjdXJzaXZlfGZpbGVzLXdpdGgtbWF0Y2hlc3xmaWxlcy13aXRob3V0LW1hdGNofG9ubHktbWF0Y2hpbmd8cXVpZXR8aW5jbHVkZXxleGNsdWRlfGV4Y2x1ZGUtZGlyKXwtLSg/OmluY2x1ZGV8ZXhjbHVkZXxleGNsdWRlLWRpcik9KWAsXG5cdFx0XHRcdGFyZyxcblx0XHRcdClcblx0XHQpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0aWYgKGFyZy5zdGFydHNXaXRoKCctJykpIHtcblx0XHRcdGkgKz0gMTtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblx0XHRwYXR0ZXJuQ291bnQgKz0gMTtcblx0XHRpZiAocGF0dGVybkNvdW50ID4gMSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRpICs9IDE7XG5cdH1cblx0cmV0dXJuIHBhdHRlcm5Db3VudCA9PT0gMTtcbn1cblxuZnVuY3Rpb24gaXNTYWZlU3RyZWFtaW5nRmxhZ09ubHlUYWlsKHNlZ21lbnQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRjb25zdCB0b2tlbnMgPSBzcGxpdFdoaXRlc3BhY2Uoc2VnbWVudCk7XG5cdGNvbnN0IGNvbW1hbmQgPSB0b2tlbnNbMF07XG5cdGlmIChjb21tYW5kID09PSB1bmRlZmluZWQpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0aWYgKCEoY29tbWFuZCA9PT0gJ3djJyB8fCBjb21tYW5kID09PSAnc29ydCcgfHwgY29tbWFuZCA9PT0gJ3VuaXEnIHx8IGNvbW1hbmQgPT09ICdjdXQnKSkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRjb25zdCBhcmdzID0gdG9rZW5zLnNsaWNlKDEpO1xuXHRsZXQgaSA9IDA7XG5cdHdoaWxlIChpIDwgYXJncy5sZW5ndGgpIHtcblx0XHRjb25zdCBhcmcgPSBhcmdzW2ldO1xuXHRcdGlmIChhcmcgPT09ICctLScpIHtcblx0XHRcdHJldHVybiBpID09PSBhcmdzLmxlbmd0aCAtIDE7XG5cdFx0fVxuXHRcdGlmIChjb21tYW5kID09PSAnc29ydCcgJiYgKGFyZyA9PT0gJy1vJyB8fCBhcmcgPT09ICctLW91dHB1dCcgfHwgYXJnLnN0YXJ0c1dpdGgoJy0tb3V0cHV0PScpKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRpZiAoY29tbWFuZCA9PT0gJ2N1dCcgJiYgKGFyZyA9PT0gJy1kJyB8fCBhcmcgPT09ICctZicgfHwgYXJnID09PSAnLWMnIHx8IGFyZyA9PT0gJy1iJykpIHtcblx0XHRcdGkgKz0gMTtcblx0XHRcdGlmIChpID49IGFyZ3MubGVuZ3RoKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHRcdGkgKz0gMTtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblx0XHRpZiAoIWFyZy5zdGFydHNXaXRoKCctJykpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0aSArPSAxO1xuXHR9XG5cdHJldHVybiB0cnVlO1xufVxuXG5mdW5jdGlvbiBpc1NhdmVkVG9vbE91dHB1dFBhdGgoYXJnOiBzdHJpbmcpOiBib29sZWFuIHtcblx0cmV0dXJuIHJlZ2V4VGVzdChcblx0XHRTdHJpbmcucmF3YCg/Ol58LykoPzpcXGQrLWNvcGlsb3QtdG9vbC1vdXRwdXQtfGNvcGlsb3QtdG9vbC1vdXRwdXQoPzotb3JpZ2luYWwpPy18b3JpZ2luYWwtb3V0cHV0LVxcZCstKWAsXG5cdFx0YXJnLFxuXHQpO1xufVxuXG5mdW5jdGlvbiBub3JtYWxpemVTZWdtZW50KHNlZ21lbnQ6IHN0cmluZyk6IHN0cmluZyB7XG5cdGNvbnN0IHRyaW1tZWQgPSBzZWdtZW50LnRyaW0oKTtcblx0Y29uc3Qgd2l0aG91dFJlZGlyZWN0cyA9IHJlZ2V4UmVwbGFjZUFsbChTdHJpbmcucmF3YFxccysoPzoyPiYxfDE+JjIpXFxiYCwgdHJpbW1lZCwgJycpO1xuXHRyZXR1cm4gcmVnZXhSZXBsYWNlQWxsKFN0cmluZy5yYXdgXFxzK2AsIHdpdGhvdXRSZWRpcmVjdHMsICcgJyk7XG59XG5cbmZ1bmN0aW9uIHJlcGxhY2VTYWZlQ29tbWFuZFN1YnN0aXR1dGlvbnMoY29tbWFuZDogc3RyaW5nKTogc3RyaW5nIHtcblx0aWYgKCFyZWdleFRlc3QoU3RyaW5nLnJhd2BcXGJ0b29scy9saW50ZXIvYWRhcHRlcnMvY2xhbmdmb3JtYXRfbGludGVyXFwucHlcXGJgLCBjb21tYW5kKSkge1xuXHRcdHJldHVybiBjb21tYW5kO1xuXHR9XG5cdHJldHVybiByZWdleFJlcGxhY2VBbGwoXG5cdFx0J1xcXFwkXFxcXChcXFxccypnaXRcXFxccystLW5vLXBhZ2VyXFxcXHMrbHMtZmlsZXMoPzpcXFxccysoPzpcIlteXCJgJCgpXSpcInxcXCdbXlxcJ2AkKCldKlxcJ3xbXlxcJ1wiYCgpJDsmPD58XFxcXHNdKykpKlxcXFxzKlxcXFwpJyxcblx0XHRjb21tYW5kLFxuXHRcdCdfX1NBRkVfR0lUX0xTX0ZJTEVTX18nLFxuXHQpO1xufVxuXG5mdW5jdGlvbiBzcGxpdENvbW1hbmRTZWdtZW50cyhjb21tYW5kOiBzdHJpbmcpOiBzdHJpbmdbXSB7XG5cdGNvbnN0IHNlZ21lbnRzOiBzdHJpbmdbXSA9IFtdO1xuXHRsZXQgc3RhcnQgPSAwO1xuXHRsZXQgaW5TaW5nbGUgPSBmYWxzZTtcblx0bGV0IGluRG91YmxlID0gZmFsc2U7XG5cdGxldCBpZHggPSAwO1xuXHR3aGlsZSAoaWR4IDwgY29tbWFuZC5sZW5ndGgpIHtcblx0XHRjb25zdCBjaCA9IGNvbW1hbmRbaWR4XTtcblx0XHRjb25zdCBuZXh0ID0gaWR4ICsgMSA8IGNvbW1hbmQubGVuZ3RoID8gY29tbWFuZFtpZHggKyAxXSA6IHVuZGVmaW5lZDtcblx0XHRpZiAoY2ggPT09ICdcXCcnICYmICFpbkRvdWJsZSkge1xuXHRcdFx0aW5TaW5nbGUgPSAhaW5TaW5nbGU7XG5cdFx0fSBlbHNlIGlmIChjaCA9PT0gJ1wiJyAmJiAhaW5TaW5nbGUgJiYgIWlzRXNjYXBlZEJ5T2RkQmFja3NsYXNoZXMoY29tbWFuZCwgaWR4KSkge1xuXHRcdFx0aW5Eb3VibGUgPSAhaW5Eb3VibGU7XG5cdFx0fSBlbHNlIGlmICghaW5TaW5nbGUgJiYgIWluRG91YmxlXG5cdFx0XHQmJiAoKGNoID09PSAnJicgJiYgbmV4dCA9PT0gJyYnKSB8fCAoY2ggPT09ICd8JyAmJiBuZXh0ID09PSAnfCcpKVxuXHRcdCkge1xuXHRcdFx0cHVzaENvbW1hbmRTZWdtZW50KHNlZ21lbnRzLCBjb21tYW5kLnNsaWNlKHN0YXJ0LCBpZHgpKTtcblx0XHRcdHN0YXJ0ID0gaWR4ICsgMjtcblx0XHRcdGlkeCArPSAxO1xuXHRcdH0gZWxzZSBpZiAoIWluU2luZ2xlICYmICFpbkRvdWJsZSAmJiAoY2ggPT09ICdcXG4nIHx8IGNoID09PSAnXFxyJykpIHtcblx0XHRcdHB1c2hDb21tYW5kU2VnbWVudChzZWdtZW50cywgY29tbWFuZC5zbGljZShzdGFydCwgaWR4KSk7XG5cdFx0XHRsZXQgbmV4dFN0YXJ0ID0gaWR4ICsgMTtcblx0XHRcdGlmIChjaCA9PT0gJ1xccicgJiYgbmV4dCA9PT0gJ1xcbicpIHtcblx0XHRcdFx0aWR4ICs9IDE7XG5cdFx0XHRcdG5leHRTdGFydCArPSAxO1xuXHRcdFx0fVxuXHRcdFx0c3RhcnQgPSBuZXh0U3RhcnQ7XG5cdFx0fVxuXHRcdGlkeCArPSAxO1xuXHR9XG5cdHB1c2hDb21tYW5kU2VnbWVudChzZWdtZW50cywgY29tbWFuZC5zbGljZShzdGFydCkpO1xuXHRyZXR1cm4gc2VnbWVudHM7XG59XG5cbmZ1bmN0aW9uIHB1c2hDb21tYW5kU2VnbWVudChzZWdtZW50czogc3RyaW5nW10sIHNlZ21lbnQ6IHN0cmluZyk6IHZvaWQge1xuXHRjb25zdCB0cmltbWVkID0gc2VnbWVudC50cmltKCk7XG5cdGlmICh0cmltbWVkLmxlbmd0aCAhPT0gMCkge1xuXHRcdHNlZ21lbnRzLnB1c2godHJpbW1lZCk7XG5cdH1cbn1cblxuZnVuY3Rpb24gc3RyaXBRdW90ZWRUZXh0KGNvbW1hbmQ6IHN0cmluZyk6IHN0cmluZyB7XG5cdGxldCBzdHJpcHBlZCA9ICcnO1xuXHRsZXQgaW5TaW5nbGUgPSBmYWxzZTtcblx0bGV0IGluRG91YmxlID0gZmFsc2U7XG5cdGZvciAobGV0IGkgPSAwOyBpIDwgY29tbWFuZC5sZW5ndGg7IGkrKykge1xuXHRcdGNvbnN0IGNoID0gY29tbWFuZFtpXTtcblx0XHRpZiAoY2ggPT09ICdcXCcnICYmICFpbkRvdWJsZSkge1xuXHRcdFx0aW5TaW5nbGUgPSAhaW5TaW5nbGU7XG5cdFx0XHRzdHJpcHBlZCArPSBjaDtcblx0XHR9IGVsc2UgaWYgKGNoID09PSAnXCInICYmICFpblNpbmdsZSAmJiAhaXNFc2NhcGVkQnlPZGRCYWNrc2xhc2hlcyhjb21tYW5kLCBpKSkge1xuXHRcdFx0aW5Eb3VibGUgPSAhaW5Eb3VibGU7XG5cdFx0XHRzdHJpcHBlZCArPSBjaDtcblx0XHR9IGVsc2UgaWYgKGluU2luZ2xlKSB7XG5cdFx0XHRzdHJpcHBlZCArPSAnICc7XG5cdFx0fSBlbHNlIGlmIChpbkRvdWJsZSkge1xuXHRcdFx0c3RyaXBwZWQgKz0gKGNoID09PSAnJCcgfHwgY2ggPT09ICcoJyB8fCBjaCA9PT0gJ2AnKSA/IGNoIDogJyAnO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRzdHJpcHBlZCArPSBjaDtcblx0XHR9XG5cdH1cblx0cmV0dXJuIHN0cmlwcGVkO1xufVxuXG5mdW5jdGlvbiBpc0VzY2FwZWRCeU9kZEJhY2tzbGFzaGVzKHRleHQ6IHN0cmluZywgaW5kZXg6IG51bWJlcik6IGJvb2xlYW4ge1xuXHRsZXQgY291bnQgPSAwO1xuXHRsZXQgaSA9IGluZGV4O1xuXHR3aGlsZSAoaSA+IDApIHtcblx0XHRpIC09IDE7XG5cdFx0aWYgKHRleHRbaV0gPT09ICdcXFxcJykge1xuXHRcdFx0Y291bnQgKz0gMTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0YnJlYWs7XG5cdFx0fVxuXHR9XG5cdHJldHVybiBjb3VudCAlIDIgPT09IDE7XG59XG5cbi8vI2VuZHJlZ2lvblxuXG4vLyNyZWdpb24gc2hlbGxfb3V0cHV0X2NvbXBhY3Rvci5ycyBcdTIwMTQgaGVyZWRvYyBwYXJzaW5nLCBlcnJleGl0LCBvdXRwdXQgZGV0ZWN0b3JzLCBweXRob24gcGF0dGVybnNcblxuZnVuY3Rpb24gaXNXaGl0ZXNwYWNlQ2hhcihjaDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiAvXFxzLy50ZXN0KGNoKTtcbn1cblxuLyoqIFJ1c3QgYHN0cjo6c3RhcnRzX3dpdGgoY2hhcjo6aXNfd2hpdGVzcGFjZSlgOiB0cnVlIHdoZW4gdGhlIGZpcnN0IGNoYXJhY3RlciBpcyB3aGl0ZXNwYWNlLiAqL1xuZnVuY3Rpb24gc3RhcnRzV2l0aFdoaXRlc3BhY2UobGluZTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiBsaW5lLmxlbmd0aCA+IDAgJiYgaXNXaGl0ZXNwYWNlQ2hhcihsaW5lWzBdKTtcbn1cblxuZnVuY3Rpb24gc3RyaXBIZXJlZG9jQm9kaWVzKGNvbW1hbmQ6IHN0cmluZyk6IEhlcmVkb2NTdHJpcHBlZENvbW1hbmQgfCB1bmRlZmluZWQge1xuXHRjb25zdCBsaW5lcyA9IGNvbW1hbmQuc3BsaXQoJ1xcbicpLm1hcChsaW5lID0+IHN0cmlwU3VmZml4KGxpbmUsICdcXHInKSA/PyBsaW5lKTtcblx0Y29uc3Qgc3RyaXBwZWQ6IHN0cmluZ1tdID0gW107XG5cdGNvbnN0IGhlcmVkb2NTdGRpblNlZ21lbnRJbmRleGVzID0gbmV3IFNldDxudW1iZXI+KCk7XG5cdGxldCBpID0gMDtcblx0d2hpbGUgKGkgPCBsaW5lcy5sZW5ndGgpIHtcblx0XHRjb25zdCBsaW5lID0gbGluZXNbaV07XG5cdFx0Y29uc3QgaGVyZWRvYyA9IHBhcnNlSGVyZWRvY09wZW5lcihsaW5lKTtcblx0XHRpZiAoaGVyZWRvYyA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRzdHJpcHBlZC5wdXNoKGxpbmUpO1xuXHRcdFx0aSArPSAxO1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29tbWFuZEJlZm9yZUhlcmVkb2MgPSBsYXN0Q2hhaW5TZWdtZW50KGhlcmVkb2MucHJlZml4KTtcblx0XHRpZiAocmVnZXhUZXN0KFxuXHRcdFx0U3RyaW5nLnJhd2BeJHtweXRob25FeGVjdXRhYmxlUGF0dGVybigpfVxccystJGAsXG5cdFx0XHRub3JtYWxpemVTZWdtZW50KGNvbW1hbmRCZWZvcmVIZXJlZG9jKSxcblx0XHQpKSB7XG5cdFx0XHRsZXQgY29tbWFuZFRocm91Z2hIZXJlZG9jT3BlbmVyID0gc3RyaXBwZWQuam9pbignXFxuJyk7XG5cdFx0XHRpZiAoY29tbWFuZFRocm91Z2hIZXJlZG9jT3BlbmVyLmxlbmd0aCAhPT0gMCkge1xuXHRcdFx0XHRjb21tYW5kVGhyb3VnaEhlcmVkb2NPcGVuZXIgKz0gJ1xcbic7XG5cdFx0XHR9XG5cdFx0XHRjb21tYW5kVGhyb3VnaEhlcmVkb2NPcGVuZXIgKz0gaGVyZWRvYy5wcmVmaXg7XG5cdFx0XHRoZXJlZG9jU3RkaW5TZWdtZW50SW5kZXhlcy5hZGQoXG5cdFx0XHRcdHNhdHVyYXRpbmdTdWIoc3BsaXRDb21tYW5kU2VnbWVudHMoY29tbWFuZFRocm91Z2hIZXJlZG9jT3BlbmVyKS5sZW5ndGgsIDEpLFxuXHRcdFx0KTtcblx0XHR9XG5cdFx0c3RyaXBwZWQucHVzaChgJHtoZXJlZG9jLnByZWZpeH0gJHtoZXJlZG9jLnN1ZmZpeH1gLnRyaW1FbmQoKSk7XG5cdFx0aSArPSAxO1xuXHRcdHdoaWxlIChpIDwgbGluZXMubGVuZ3RoICYmIGxpbmVzW2ldLnRyaW0oKSAhPT0gaGVyZWRvYy5kZWxpbWl0ZXIpIHtcblx0XHRcdGkgKz0gMTtcblx0XHR9XG5cdFx0aWYgKGkgPj0gbGluZXMubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRpICs9IDE7XG5cdH1cblx0cmV0dXJuIHtcblx0XHRjb21tYW5kOiBzdHJpcHBlZC5qb2luKCdcXG4nKSxcblx0XHRoZXJlZG9jU3RkaW5TZWdtZW50SW5kZXhlcyxcblx0fTtcbn1cblxuZnVuY3Rpb24gcGFyc2VIZXJlZG9jT3BlbmVyKGxpbmU6IHN0cmluZyk6IEhlcmVkb2NPcGVuZXIgfCB1bmRlZmluZWQge1xuXHRsZXQgaW5TaW5nbGUgPSBmYWxzZTtcblx0bGV0IGluRG91YmxlID0gZmFsc2U7XG5cdGxldCBpbmRleCA9IDA7XG5cdHdoaWxlIChpbmRleCArIDEgPCBsaW5lLmxlbmd0aCkge1xuXHRcdGNvbnN0IGNoID0gbGluZVtpbmRleF07XG5cdFx0aWYgKGNoID09PSAnXFwnJyAmJiAhaW5Eb3VibGUpIHtcblx0XHRcdGluU2luZ2xlID0gIWluU2luZ2xlO1xuXHRcdFx0aW5kZXggKz0gMTtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblx0XHRpZiAoY2ggPT09ICdcIicgJiYgIWluU2luZ2xlICYmICFpc0VzY2FwZWRCeU9kZEJhY2tzbGFzaGVzKGxpbmUsIGluZGV4KSkge1xuXHRcdFx0aW5Eb3VibGUgPSAhaW5Eb3VibGU7XG5cdFx0XHRpbmRleCArPSAxO1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXHRcdGlmICghaW5TaW5nbGUgJiYgIWluRG91YmxlICYmIGNoID09PSAnIydcblx0XHRcdCYmIChpbmRleCA9PT0gMCB8fCBpc1doaXRlc3BhY2VDaGFyKGxpbmVbaW5kZXggLSAxXSkpXG5cdFx0KSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRpZiAoaW5TaW5nbGUgfHwgaW5Eb3VibGUgfHwgY2ggIT09ICc8JyB8fCBsaW5lW2luZGV4ICsgMV0gIT09ICc8Jykge1xuXHRcdFx0aW5kZXggKz0gMTtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblxuXHRcdGxldCBjdXJzb3IgPSBpbmRleCArIDI7XG5cdFx0aWYgKGxpbmVbY3Vyc29yXSA9PT0gJy0nKSB7XG5cdFx0XHRjdXJzb3IgKz0gMTtcblx0XHR9XG5cdFx0d2hpbGUgKGN1cnNvciA8IGxpbmUubGVuZ3RoICYmIGlzV2hpdGVzcGFjZUNoYXIobGluZVtjdXJzb3JdKSkge1xuXHRcdFx0Y3Vyc29yICs9IDE7XG5cdFx0fVxuXG5cdFx0bGV0IGRlbGltaXRlciA9ICcnO1xuXHRcdGNvbnN0IHF1b3RlID0gY3Vyc29yIDwgbGluZS5sZW5ndGggPyBsaW5lW2N1cnNvcl0gOiB1bmRlZmluZWQ7XG5cdFx0aWYgKHF1b3RlID09PSAnXFwnJyB8fCBxdW90ZSA9PT0gJ1wiJykge1xuXHRcdFx0Y3Vyc29yICs9IDE7XG5cdFx0XHRjb25zdCBzdGFydCA9IGN1cnNvcjtcblx0XHRcdHdoaWxlIChjdXJzb3IgPCBsaW5lLmxlbmd0aCAmJiBsaW5lW2N1cnNvcl0gIT09IHF1b3RlKSB7XG5cdFx0XHRcdGN1cnNvciArPSAxO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGN1cnNvciA+PSBsaW5lLmxlbmd0aCkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0ZGVsaW1pdGVyICs9IGxpbmUuc2xpY2Uoc3RhcnQsIGN1cnNvcik7XG5cdFx0XHRjdXJzb3IgKz0gMTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3Qgc3RhcnQgPSBjdXJzb3I7XG5cdFx0XHR3aGlsZSAoY3Vyc29yIDwgbGluZS5sZW5ndGggJiYgIWlzV2hpdGVzcGFjZUNoYXIobGluZVtjdXJzb3JdKSkge1xuXHRcdFx0XHRjdXJzb3IgKz0gMTtcblx0XHRcdH1cblx0XHRcdGRlbGltaXRlciArPSBsaW5lLnNsaWNlKHN0YXJ0LCBjdXJzb3IpO1xuXHRcdH1cblxuXHRcdGlmICghcmVnZXhUZXN0KFN0cmluZy5yYXdgXltBLVphLXpfXVtBLVphLXowLTlfXSokYCwgZGVsaW1pdGVyKSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIHtcblx0XHRcdHByZWZpeDogbGluZS5zbGljZSgwLCBpbmRleCksXG5cdFx0XHRzdWZmaXg6IGxpbmUuc2xpY2UoY3Vyc29yKSxcblx0XHRcdGRlbGltaXRlcixcblx0XHR9O1xuXHR9XG5cdHJldHVybiB1bmRlZmluZWQ7XG59XG5cbmZ1bmN0aW9uIGxhc3RDaGFpblNlZ21lbnQoY29tbWFuZFByZWZpeDogc3RyaW5nKTogc3RyaW5nIHtcblx0Y29uc3QgcGFydHMgPSBjb21tYW5kUHJlZml4LnNwbGl0KG5ldyBSZWdFeHAoU3RyaW5nLnJhd2BcXHMqKD86JiZ8XFx8XFx8fDspXFxzKmApKTtcblx0Y29uc3QgbGFzdCA9IHBhcnRzLmxlbmd0aCA+IDAgPyBwYXJ0c1twYXJ0cy5sZW5ndGggLSAxXSA6IGNvbW1hbmRQcmVmaXg7XG5cdHJldHVybiBsYXN0LnRyaW0oKTtcbn1cblxuZnVuY3Rpb24gaGFzRXJyZXhpdEJlZm9yZUZpcnN0Q29tbWFuZChcblx0c2VnbWVudHM6IHN0cmluZ1tdLFxuXHRzZWdtZW50S2luZHM6IENsYXNzaWZpZWRDb21tYW5kU2VnbWVudFtdLFxuKTogYm9vbGVhbiB7XG5cdGxldCBmaXJzdE5vbkJlbmlnbiA9IHNlZ21lbnRLaW5kcy5maW5kSW5kZXgoa2luZCA9PiAhc2VnbWVudHNFcXVhbChraW5kLCBCRU5JR05fU0VHTUVOVCkpO1xuXHRpZiAoZmlyc3ROb25CZW5pZ24gPT09IC0xKSB7XG5cdFx0Zmlyc3ROb25CZW5pZ24gPSBzZWdtZW50S2luZHMubGVuZ3RoO1xuXHR9XG5cdHJldHVybiBzZWdtZW50cy5zbGljZSgwLCBmaXJzdE5vbkJlbmlnbikuc29tZShzZWdtZW50ID0+IGlzU2V0RUNvbW1hbmQoc2VnbWVudCkpO1xufVxuXG5mdW5jdGlvbiBpc1NldEVDb21tYW5kKHNlZ21lbnQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRjb25zdCBub3JtYWxpemVkID0gbm9ybWFsaXplU2VnbWVudChzZWdtZW50KTtcblx0cmV0dXJuIHJlZ2V4VGVzdChcblx0XHRTdHJpbmcucmF3YF5zZXRcXHMrLSg/PVtBLVphLXpdKmUpW0EtWmEtel0rKD86XFxzK1stK0EtWmEtel0rKSokYCxcblx0XHRub3JtYWxpemVkLFxuXHQpIHx8IHJlZ2V4VGVzdChTdHJpbmcucmF3YFxccy1vXFxzK2VycmV4aXRcXGJgLCBub3JtYWxpemVkKTtcbn1cblxuZnVuY3Rpb24gY29tbWFuZFJ1bnNHb1Rlc3QoY29tbWFuZDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiByZWdleFRlc3QoXG5cdFx0U3RyaW5nLnJhd2AoPzpefFtcXHM7JnwoXSlnb1xccyt0ZXN0KD86XFxzfCQpYCxcblx0XHRzdHJpcFF1b3RlZFRleHQoY29tbWFuZCksXG5cdCk7XG59XG5cbmZ1bmN0aW9uIGNvbW1hbmRNZW50aW9uc1NhdmVkVG9vbE91dHB1dChjb21tYW5kOiBzdHJpbmcpOiBib29sZWFuIHtcblx0cmV0dXJuIHNwbGl0V2hpdGVzcGFjZShjb21tYW5kKS5zb21lKHRva2VuID0+IGlzU2F2ZWRUb29sT3V0cHV0UGF0aCh0b2tlbikpO1xufVxuXG5mdW5jdGlvbiBsb29rc0xpa2VOcG1QYWNrT3V0cHV0KG91dHB1dDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiBvdXRwdXQuaW5jbHVkZXMoJ25wbSBub3RpY2UgVGFyYmFsbCBDb250ZW50cycpICYmIG91dHB1dC5pbmNsdWRlcygnbnBtIG5vdGljZSBUYXJiYWxsIERldGFpbHMnKTtcbn1cblxuZnVuY3Rpb24gaGFzRG9jdXNhdXJ1c1Byb2dyZXNzKG91dHB1dDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiBvdXRwdXQuc3BsaXQoJ1xcbicpLnNvbWUobGluZSA9PiByZWdleFRlc3QoU3RyaW5nLnJhd2BeXFxzKlxcdTI1Q0ZcXHMrQ2xpZW50XFxzK2AsIGxpbmUpKVxuXHRcdCYmIG91dHB1dC5zcGxpdCgnXFxuJykuc29tZShsaW5lID0+IHJlZ2V4VGVzdChTdHJpbmcucmF3YF5cXHMqW1xcdTI1Q0ZcXHUyNUVGXVxccytTZXJ2ZXIoPzpcXHMrfCQpYCwgbGluZSkpO1xufVxuXG5mdW5jdGlvbiBoYXNQYXNzaW5nR29UZXN0T3V0cHV0KG91dHB1dDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiAhaGFzR29UZXN0RmFpbHVyZU91dHB1dChvdXRwdXQpXG5cdFx0JiYgb3V0cHV0LnNwbGl0KCdcXG4nKS5zb21lKGxpbmUgPT4gaXNHb01vZHVsZURvd25sb2FkQ2hhdHRlckxpbmUobGluZSkpO1xufVxuXG5mdW5jdGlvbiBoYXNHb1Rlc3RGYWlsdXJlT3V0cHV0KG91dHB1dDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiByZWdleFRlc3QoXG5cdFx0U3RyaW5nLnJhd2AoPzpefFxcbikoPzotLS0gRkFJTDp8RkFJTCg/Olxcc3wkKXxwYW5pYzp8ZmF0YWwgZXJyb3I6fFxccypFcnJvciBUcmFjZTp8XFxTK1xcLmdvOlxcZCs6fCMgXFxTK3xkaWZmIFxcUyt8LS0tICg/IVBBU1M6KXxcXCtcXCtcXCsgfEBAIHwuKlxcWyg/OmJ1aWxkfHNldHVwKSBmYWlsZWRcXF0pYCxcblx0XHRvdXRwdXQsXG5cdCk7XG59XG5cbmZ1bmN0aW9uIHB5dGhvbkV4ZWN1dGFibGVQYXR0ZXJuKCk6IHN0cmluZyB7XG5cdHJldHVybiBTdHJpbmcucmF3YCg/Oig/OltBLVphLXowLTlfLi8rLV0rLyk/KD86cHl0aG9ufHB5dGhvbjMoPzpcXC5cXGQrKT8pKWA7XG59XG5cbmZ1bmN0aW9uIHB5dGhvbldpdGhPcHRpb25zUGF0dGVybigpOiBzdHJpbmcge1xuXHRyZXR1cm4gU3RyaW5nLnJhd2Ake3B5dGhvbkV4ZWN1dGFibGVQYXR0ZXJuKCl9KD86XFxzKyg/Oi1bQkVzU3R1VXZWcVFdfC1XXFxTK3wtWFxccytcXFMrKSkqYDtcbn1cblxuLy8jZW5kcmVnaW9uXG5cbi8vI3JlZ2lvbiBzaGVsbF9vdXRwdXRfY29tcGFjdG9yLnJzIFx1MjAxNCBvcmNoZXN0cmF0aW9uXG5cbmludGVyZmFjZSBDb21wYWN0aW9uU3RhdGUge1xuXHRvdXRwdXQ6IHN0cmluZztcblx0bG9zc2xlc3M6IGJvb2xlYW47XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjb21wYWN0U2hlbGxPdXRwdXQoXG5cdGNvbW1hbmRLaW5kczogc3RyaW5nW10sXG5cdG91dHB1dDogc3RyaW5nLFxuXHRjb21wYWN0R29QYXNzaW5nVGVzdE91dHB1dDogYm9vbGVhbixcblx0c2hlbGxHcmVwTGFyZ2VPdXRwdXRUaHJlc2hvbGQ6IG51bWJlcixcbik6IFRvb2xDb21wYWN0aW9uUmVzdWx0IHwgdW5kZWZpbmVkIHtcblx0Y29uc3Qgc3RhdGU6IENvbXBhY3Rpb25TdGF0ZSA9IHsgb3V0cHV0LCBsb3NzbGVzczogdHJ1ZSB9O1xuXHRhcHBseVN0cmluZ0NvbXBhY3RvcihzdGF0ZSwgY29tcGFjdENhcnJpYWdlUmV0dXJuUHJvZ3Jlc3MpO1xuXHRhcHBseVN0cmluZ0NvbXBhY3RvcihzdGF0ZSwgY29tcGFjdE5lZWRyZXN0YXJ0Tm9vcFByb2dyZXNzKTtcblx0YXBwbHlTdHJpbmdDb21wYWN0b3Ioc3RhdGUsIGNvbXBhY3RHb1J1bnRpbWVQYW5pY0R1bXApO1xuXHRpZiAoY29tcGFjdEdvUGFzc2luZ1Rlc3RPdXRwdXQgJiYgIWNvbW1hbmRLaW5kcy5pbmNsdWRlcygnZ28nKSkge1xuXHRcdGFwcGx5U3RyaW5nQ29tcGFjdG9yKHN0YXRlLCBjb21wYWN0R29PdXRwdXQpO1xuXHR9XG5cdGFwcGx5U3RyaW5nQ29tcGFjdG9yKHN0YXRlLCBjb21wYWN0SmVzdFJ1bnNQcm9ncmVzcyk7XG5cdGFwcGx5U3RyaW5nQ29tcGFjdG9yKHN0YXRlLCBjb21wYWN0RG9jdXNhdXJ1c1Byb2dyZXNzKTtcblx0YXBwbHlTdHJpbmdDb21wYWN0b3Ioc3RhdGUsIGNvbXBhY3RTcGhpbnhQcm9ncmVzc0ZhbGxiYWNrKTtcblx0aWYgKCFjb21tYW5kS2luZHMuaW5jbHVkZXMoJ25wbS1wYWNrJykpIHtcblx0XHRhcHBseVN0cmluZ0NvbXBhY3RvcihzdGF0ZSwgY29tcGFjdE5wbVBhY2tPdXRwdXQpO1xuXHR9XG5cdGZvciAoY29uc3Qga2luZCBvZiBDT01NQU5EX0NPTVBBQ1RPUl9PUkRFUi5maWx0ZXIoY2FuZGlkYXRlID0+IGNvbW1hbmRLaW5kcy5pbmNsdWRlcyhjYW5kaWRhdGUpKSkge1xuXHRcdGNvbnN0IHJlc3VsdCA9IGNvbXBhY3RDb21tYW5kRW50cnkoa2luZCwgc3RhdGUub3V0cHV0LCBzaGVsbEdyZXBMYXJnZU91dHB1dFRocmVzaG9sZCk7XG5cdFx0c3RhdGUub3V0cHV0ID0gcmVzdWx0Lm91dHB1dDtcblx0XHRzdGF0ZS5sb3NzbGVzcyA9IHN0YXRlLmxvc3NsZXNzICYmIHJlc3VsdC5sb3NzbGVzcztcblx0fVxuXG5cdGlmIChzdGF0ZS5vdXRwdXQgPT09IG91dHB1dCkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0cmV0dXJuIHtcblx0XHRvdXRwdXQ6IHN0YXRlLm91dHB1dCxcblx0XHRsb3NzbGVzczogc3RhdGUubG9zc2xlc3MsXG5cdH07XG59XG5cbmZ1bmN0aW9uIGFwcGx5U3RyaW5nQ29tcGFjdG9yKHN0YXRlOiBDb21wYWN0aW9uU3RhdGUsIGNvbXBhY3Q6IChvdXRwdXQ6IHN0cmluZykgPT4gc3RyaW5nKTogdm9pZCB7XG5cdGNvbnN0IG5leHQgPSBjb21wYWN0KHN0YXRlLm91dHB1dCk7XG5cdGlmIChuZXh0ICE9PSBzdGF0ZS5vdXRwdXQpIHtcblx0XHRzdGF0ZS5sb3NzbGVzcyA9IGZhbHNlO1xuXHR9XG5cdHN0YXRlLm91dHB1dCA9IG5leHQ7XG59XG5cbmZ1bmN0aW9uIGNvbXBhY3RDb21tYW5kRW50cnkoXG5cdGtpbmQ6IHN0cmluZyxcblx0b3V0cHV0OiBzdHJpbmcsXG5cdHNoZWxsR3JlcExhcmdlT3V0cHV0VGhyZXNob2xkOiBudW1iZXIsXG4pOiBUb29sQ29tcGFjdGlvblJlc3VsdCB7XG5cdGlmIChraW5kID09PSAnc2hlbGwtZ3JlcCcpIHtcblx0XHRyZXR1cm4gY29tcGFjdFRvb2xPdXRwdXQoXG5cdFx0XHQnZ3JlcC1jb250ZW50Jyxcblx0XHRcdG91dHB1dCxcblx0XHRcdHNoZWxsR3JlcExhcmdlT3V0cHV0VGhyZXNob2xkLFxuXHRcdCkgPz8gdW5jaGFuZ2VkKG91dHB1dCk7XG5cdH1cblxuXHRjb25zdCBvcmlnaW5hbCA9IG91dHB1dDtcblx0bGV0IHJlc3VsdDogc3RyaW5nO1xuXHRzd2l0Y2ggKGtpbmQpIHtcblx0XHRjYXNlICdwaXAnOiB7XG5cdFx0XHRsZXQgbmV4dCA9IGFwcGx5UHl0aG9uQnVpbGROb2lzZShvdXRwdXQpO1xuXHRcdFx0bmV4dCA9IGNvbXBhY3RHaXRQcm9ncmVzcyhuZXh0KTtcblx0XHRcdG5leHQgPSBjb21wYWN0UGFja2FnZU1hbmFnZXJPcGVyYXRpb25zKG5leHQpO1xuXHRcdFx0bmV4dCA9IGNvbXBhY3RQeXRob25OaW5qYUJ1aWxkUHJvZ3Jlc3MobmV4dCk7XG5cdFx0XHRyZXN1bHQgPSBjb21wYWN0UGlwSW5zdGFsbFByb2dyZXNzKG5leHQpO1xuXHRcdFx0YnJlYWs7XG5cdFx0fVxuXHRcdGNhc2UgJ3B5dGhvbi1idWlsZCc6IHtcblx0XHRcdGxldCBuZXh0ID0gYXBwbHlQeXRob25CdWlsZE5vaXNlKG91dHB1dCk7XG5cdFx0XHRuZXh0ID0gY29tcGFjdEdpdFByb2dyZXNzKG5leHQpO1xuXHRcdFx0bmV4dCA9IGNvbXBhY3RTZXR1cHRvb2xzRmlsZVN0YWdpbmdSdW5zKG5leHQpO1xuXHRcdFx0bmV4dCA9IGNvbXBhY3RQeXRob25OaW5qYUJ1aWxkUHJvZ3Jlc3MobmV4dCk7XG5cdFx0XHRyZXN1bHQgPSBjb21wYWN0UGlwSW5zdGFsbFByb2dyZXNzKG5leHQpO1xuXHRcdFx0YnJlYWs7XG5cdFx0fVxuXHRcdGNhc2UgJ3B5dGVzdCc6IHtcblx0XHRcdGxldCBuZXh0ID0gY29tcGFjdFB5dGhvbkVjb3N5c3RlbU5vaXNlKG91dHB1dCk7XG5cdFx0XHRuZXh0ID0gY29tcGFjdFB5dGVzdFByb2dyZXNzKG5leHQpO1xuXHRcdFx0bmV4dCA9IGNvbXBhY3RQeXRlc3RGYWlsdXJlQmxvY2tzKG5leHQpO1xuXHRcdFx0bmV4dCA9IGNvbXBhY3RQeXRlc3RXYXJuaW5nc1N1bW1hcnkobmV4dCk7XG5cdFx0XHRuZXh0ID0gY29tcGFjdFB5dGVzdFNlc3Npb25NZXRhZGF0YShuZXh0KTtcblx0XHRcdG5leHQgPSBjb21wYWN0U3BoaW54UHJvZ3Jlc3MobmV4dCk7XG5cdFx0XHRyZXN1bHQgPSBjb21wYWN0UmVwZWF0ZWREaWFnbm9zdGljQmxvY2tzKG5leHQpO1xuXHRcdFx0YnJlYWs7XG5cdFx0fVxuXHRcdGNhc2UgJ3B5dGhvbi1idWlsZC1leHQnOiB7XG5cdFx0XHRsZXQgbmV4dCA9IGFwcGx5UHl0aG9uQnVpbGROb2lzZShvdXRwdXQpO1xuXHRcdFx0bmV4dCA9IGNvbXBhY3RQeXRob25OaW5qYUJ1aWxkUHJvZ3Jlc3MobmV4dCk7XG5cdFx0XHRuZXh0ID0gY29tcGFjdFB5dGhvbkJ1aWxkRXh0UHJvZ3Jlc3MobmV4dCk7XG5cdFx0XHRuZXh0ID0gY29tcGFjdFNwaGlueFByb2dyZXNzKG5leHQpO1xuXHRcdFx0cmVzdWx0ID0gY29tcGFjdFJlcGVhdGVkRGlhZ25vc3RpY0Jsb2NrcyhuZXh0KTtcblx0XHRcdGJyZWFrO1xuXHRcdH1cblx0XHRjYXNlICdkamFuZ28tdGVzdCc6IHtcblx0XHRcdGxldCBuZXh0ID0gY29tcGFjdFB5dGhvbkVjb3N5c3RlbU5vaXNlKG91dHB1dCk7XG5cdFx0XHRuZXh0ID0gY29tcGFjdERqYW5nb1Rlc3RCb2lsZXJwbGF0ZShuZXh0KTtcblx0XHRcdG5leHQgPSBjb21wYWN0RGphbmdvVGVzdFByb2dyZXNzKG5leHQpO1xuXHRcdFx0bmV4dCA9IGNvbXBhY3RQeXRlc3RXYXJuaW5nc1N1bW1hcnkobmV4dCk7XG5cdFx0XHRuZXh0ID0gY29tcGFjdFNwaGlueFByb2dyZXNzKG5leHQpO1xuXHRcdFx0cmVzdWx0ID0gY29tcGFjdFJlcGVhdGVkRGlhZ25vc3RpY0Jsb2NrcyhuZXh0KTtcblx0XHRcdGJyZWFrO1xuXHRcdH1cblx0XHRjYXNlICdweXRob24tc2NyaXB0Jzoge1xuXHRcdFx0bGV0IG5leHQgPSBhcHBseVB5dGhvbkJ1aWxkTm9pc2Uob3V0cHV0KTtcblx0XHRcdG5leHQgPSBjb21wYWN0U3BoaW54UHJvZ3Jlc3MobmV4dCk7XG5cdFx0XHRyZXN1bHQgPSBjb21wYWN0UmVwZWF0ZWREaWFnbm9zdGljQmxvY2tzKG5leHQpO1xuXHRcdFx0YnJlYWs7XG5cdFx0fVxuXHRcdGNhc2UgJ2FwdCc6XG5cdFx0XHRyZXN1bHQgPSBjb21wYWN0QXB0T3V0cHV0KG91dHB1dCk7XG5cdFx0XHRicmVhaztcblx0XHRjYXNlICducG0nOlxuXHRcdFx0cmVzdWx0ID0gY29tcGFjdE5wbU91dHB1dChvdXRwdXQpO1xuXHRcdFx0YnJlYWs7XG5cdFx0Y2FzZSAnbnBtLXBhY2snOlxuXHRcdFx0cmVzdWx0ID0gY29tcGFjdE5wbVBhY2tPdXRwdXQob3V0cHV0KTtcblx0XHRcdGJyZWFrO1xuXHRcdGNhc2UgJ3lhcm4tYmVycnknOlxuXHRcdFx0cmVzdWx0ID0gY29tcGFjdFlhcm5CZXJyeU91dHB1dChvdXRwdXQpO1xuXHRcdFx0YnJlYWs7XG5cdFx0Y2FzZSAncG5wbSc6XG5cdFx0XHRyZXN1bHQgPSBjb21wYWN0UG5wbU91dHB1dChvdXRwdXQpO1xuXHRcdFx0YnJlYWs7XG5cdFx0Y2FzZSAnY29tcG9zZXInOlxuXHRcdGNhc2UgJ3BvZXRyeSc6XG5cdFx0XHRyZXN1bHQgPSBjb21wYWN0UGFja2FnZU1hbmFnZXJPcGVyYXRpb25zKG91dHB1dCk7XG5cdFx0XHRicmVhaztcblx0XHRjYXNlICd1dic6XG5cdFx0XHRyZXN1bHQgPSBjb21wYWN0VXZQcm9ncmVzcyhjb21wYWN0UGFja2FnZU1hbmFnZXJPcGVyYXRpb25zKG91dHB1dCkpO1xuXHRcdFx0YnJlYWs7XG5cdFx0Y2FzZSAnbWF2ZW4nOlxuXHRcdFx0cmVzdWx0ID0gY29tcGFjdE1hdmVuT3V0cHV0KG91dHB1dCk7XG5cdFx0XHRicmVhaztcblx0XHRjYXNlICdkb3RuZXQnOlxuXHRcdFx0cmVzdWx0ID0gY29tcGFjdERvdG5ldFRpbWluZ1Byb2dyZXNzKG91dHB1dCk7XG5cdFx0XHRicmVhaztcblx0XHRjYXNlICdnbyc6XG5cdFx0XHRyZXN1bHQgPSBjb21wYWN0R29Db21tYW5kT3V0cHV0KG91dHB1dCk7XG5cdFx0XHRicmVhaztcblx0XHRjYXNlICd1bml0dGVzdCc6XG5cdFx0XHRyZXN1bHQgPSBjb21wYWN0VW5pdHRlc3RPdXRwdXQob3V0cHV0KTtcblx0XHRcdGJyZWFrO1xuXHRcdGNhc2UgJ2pzLXRlc3QnOlxuXHRcdFx0cmVzdWx0ID0gY29tcGFjdEpzVGVzdE91dHB1dChvdXRwdXQpO1xuXHRcdFx0YnJlYWs7XG5cdFx0Y2FzZSAnY2FyZ28nOlxuXHRcdFx0cmVzdWx0ID0gY29tcGFjdENhcmdvUHJvZ3Jlc3Mob3V0cHV0KTtcblx0XHRcdGJyZWFrO1xuXHRcdGNhc2UgJ25vZGUnOlxuXHRcdFx0cmVzdWx0ID0gY29tcGFjdFJlcGVhdGVkTm9kZVdhcm5pbmdzKG91dHB1dCk7XG5cdFx0XHRicmVhaztcblx0XHRjYXNlICdnaXQnOlxuXHRcdFx0cmVzdWx0ID0gY29tcGFjdEdpdFByb2dyZXNzKG91dHB1dCk7XG5cdFx0XHRicmVhaztcblx0XHRjYXNlICdnaXQtY2xlYW4nOlxuXHRcdFx0cmVzdWx0ID0gY29tcGFjdEdpdENsZWFuUmVtb3ZpbmdSdW5zKG91dHB1dCk7XG5cdFx0XHRicmVhaztcblx0XHRjYXNlICdueCc6XG5cdFx0XHRyZXN1bHQgPSBjb21wYWN0TnhMZXJuYUZyYW1lUHJvZ3Jlc3Mob3V0cHV0KTtcblx0XHRcdGJyZWFrO1xuXHRcdGNhc2UgJ2dvbGFuZ2NpLWxpbnQnOlxuXHRcdFx0cmVzdWx0ID0gY29tcGFjdEdvbGFuZ2NpTGludE91dHB1dChvdXRwdXQsIGZhbHNlKTtcblx0XHRcdGJyZWFrO1xuXHRcdGNhc2UgJ2NsYW5nLWZvcm1hdC1saW50ZXInOlxuXHRcdFx0cmVzdWx0ID0gY29tcGFjdENsYW5nRm9ybWF0TGludGVyT3V0cHV0KG91dHB1dCk7XG5cdFx0XHRicmVhaztcblx0XHRjYXNlICdncmFkbGUnOlxuXHRcdFx0cmVzdWx0ID0gY29tcGFjdEdyYWRsZU91dHB1dChvdXRwdXQpO1xuXHRcdFx0YnJlYWs7XG5cdFx0Y2FzZSAnY21ha2UnOlxuXHRcdFx0cmVzdWx0ID0gY29tcGFjdENtYWtlQ29uZmlndXJlUHJvYmVSdW5zKG91dHB1dCk7XG5cdFx0XHRicmVhaztcblx0XHRjYXNlICdtYWtlJzpcblx0XHRcdHJlc3VsdCA9IGNvbXBhY3RNYWtlT3V0cHV0KG91dHB1dCk7XG5cdFx0XHRicmVhaztcblx0XHRkZWZhdWx0OlxuXHRcdFx0cmVzdWx0ID0gb3V0cHV0O1xuXHRcdFx0YnJlYWs7XG5cdH1cblx0cmV0dXJuIHN0cmluZ0NvbXBhY3Rpb25SZXN1bHQob3JpZ2luYWwsIHJlc3VsdCk7XG59XG5cbmZ1bmN0aW9uIHN0cmluZ0NvbXBhY3Rpb25SZXN1bHQob3JpZ2luYWw6IHN0cmluZywgb3V0cHV0OiBzdHJpbmcpOiBUb29sQ29tcGFjdGlvblJlc3VsdCB7XG5cdGNvbnN0IGxvc3NsZXNzID0gb3V0cHV0ID09PSBvcmlnaW5hbDtcblx0cmV0dXJuIHsgb3V0cHV0LCBsb3NzbGVzcyB9O1xufVxuXG5mdW5jdGlvbiBhcHBseVB5dGhvbkJ1aWxkTm9pc2Uob3V0cHV0OiBzdHJpbmcpOiBzdHJpbmcge1xuXHRsZXQgbmV4dCA9IGNvbXBhY3RTZXR1cHRvb2xzRGVwcmVjYXRpb25CbG9ja3Mob3V0cHV0KTtcblx0bmV4dCA9IGNvbXBhY3RDeXRob25QZXJmb3JtYW5jZUhpbnRzKG5leHQpO1xuXHRuZXh0ID0gY29tcGFjdENvbXBpbGVyV2FybmluZ1J1bnMobmV4dCk7XG5cdG5leHQgPSBjb21wYWN0UHl0aG9uRWNvc3lzdGVtTm9pc2UobmV4dCk7XG5cdHJldHVybiBjb21wYWN0TnVtcHlEaXN0dXRpbHNQcm9iZXMobmV4dCk7XG59XG5cbmZ1bmN0aW9uIGNvbXBhY3RHb0NvbW1hbmRPdXRwdXQob3V0cHV0OiBzdHJpbmcpOiBzdHJpbmcge1xuXHRyZXR1cm4gY29tcGFjdFJlcGVhdGVkRGlhZ25vc3RpY0Jsb2Nrcyhjb21wYWN0R29PdXRwdXQob3V0cHV0KSk7XG59XG5cbmZ1bmN0aW9uIGNvbXBhY3RNYXZlbk91dHB1dChvdXRwdXQ6IHN0cmluZyk6IHN0cmluZyB7XG5cdHJldHVybiBjb21wYWN0TWF2ZW5JbmZvQm9pbGVycGxhdGUoY29tcGFjdE1hdmVuUGFzc2luZ1Rlc3RzKFxuXHRcdGNvbXBhY3RNYXZlbkRlcGVuZGVuY3lUcmFuc2ZlcihvdXRwdXQpLFxuXHQpKTtcbn1cblxuZnVuY3Rpb24gY29tcGFjdFB5dGhvbkVjb3N5c3RlbU5vaXNlKG91dHB1dDogc3RyaW5nKTogc3RyaW5nIHtcblx0cmV0dXJuIG9taXROb25EaWFnbm9zdGljTGluZXMoXG5cdFx0b3V0cHV0LFxuXHRcdCdweXRob24gZWNvc3lzdGVtIG5vaXNlJyxcblx0XHRpc1B5dGhvbkVjb3N5c3RlbU5vaXNlTGluZSxcblx0KTtcbn1cblxuZnVuY3Rpb24gY29tcGFjdFBpcEluc3RhbGxQcm9ncmVzcyhvdXRwdXQ6IHN0cmluZyk6IHN0cmluZyB7XG5cdHJldHVybiBvbWl0Tm9uRGlhZ25vc3RpY0xpbmVzKG91dHB1dCwgJ3BpcCBpbnN0YWxsIHByb2dyZXNzJywgaXNQaXBJbnN0YWxsUHJvZ3Jlc3NMaW5lKTtcbn1cblxuZnVuY3Rpb24gY29tcGFjdFB5dGhvbk5pbmphQnVpbGRQcm9ncmVzcyhvdXRwdXQ6IHN0cmluZyk6IHN0cmluZyB7XG5cdHJldHVybiBvbWl0Tm9uRGlhZ25vc3RpY0xpbmVzKFxuXHRcdG91dHB1dCxcblx0XHQncHl0aG9uIG5pbmphIGJ1aWxkIHByb2dyZXNzJyxcblx0XHRpc1B5dGhvbk5pbmphQnVpbGRQcm9ncmVzc0xpbmUsXG5cdCk7XG59XG5cbmZ1bmN0aW9uIGNvbXBhY3RQeXRob25CdWlsZEV4dFByb2dyZXNzKG91dHB1dDogc3RyaW5nKTogc3RyaW5nIHtcblx0cmV0dXJuIG9taXROb25EaWFnbm9zdGljTGluZXMoXG5cdFx0b3V0cHV0LFxuXHRcdCdweXRob24gYnVpbGRfZXh0IHByb2dyZXNzJyxcblx0XHRpc1B5dGhvbkJ1aWxkRXh0UHJvZ3Jlc3NMaW5lLFxuXHQpO1xufVxuXG5mdW5jdGlvbiBjb21wYWN0U3BoaW54UHJvZ3Jlc3NGYWxsYmFjayhvdXRwdXQ6IHN0cmluZyk6IHN0cmluZyB7XG5cdGlmIChoYXNTcGhpbnhQcm9ncmVzcyhvdXRwdXQpKSB7XG5cdFx0cmV0dXJuIGNvbXBhY3RTcGhpbnhQcm9ncmVzcyhvdXRwdXQpO1xuXHR9XG5cdHJldHVybiBvdXRwdXQ7XG59XG5cbmZ1bmN0aW9uIGNvbXBhY3RQeXRlc3RTZXNzaW9uTWV0YWRhdGEob3V0cHV0OiBzdHJpbmcpOiBzdHJpbmcge1xuXHRyZXR1cm4gb21pdE5vbkRpYWdub3N0aWNMaW5lcyhcblx0XHRvdXRwdXQsXG5cdFx0J3B5dGVzdCBzZXNzaW9uIG1ldGFkYXRhJyxcblx0XHRpc1B5dGVzdFNlc3Npb25NZXRhZGF0YUxpbmUsXG5cdCk7XG59XG5cbi8vI2VuZHJlZ2lvblxuXG4vLyNyZWdpb24gc2hlbGxfb3V0cHV0X2NvbXBhY3Rvci5ycyBcdTIwMTQgcnVuIGNvbGxhcHNpbmcsIHBhY2thZ2UgbWFuYWdlciBvcGVyYXRpb25zXG5cbmZ1bmN0aW9uIGNvbXBhY3REamFuZ29UZXN0Qm9pbGVycGxhdGUob3V0cHV0OiBzdHJpbmcpOiBzdHJpbmcge1xuXHRyZXR1cm4gb21pdE5vbkRpYWdub3N0aWNMaW5lcyhvdXRwdXQsICdkamFuZ28gdGVzdCBib2lsZXJwbGF0ZScsIGlzRGphbmdvVGVzdEJvaWxlcnBsYXRlTGluZSk7XG59XG5cbmZ1bmN0aW9uIGNvbXBhY3REamFuZ29UZXN0UHJvZ3Jlc3Mob3V0cHV0OiBzdHJpbmcpOiBzdHJpbmcge1xuXHRyZXR1cm4gb21pdE5vbkRpYWdub3N0aWNMaW5lcyhvdXRwdXQsICdkamFuZ28gdGVzdCBwcm9ncmVzcycsIGlzRGphbmdvVGVzdFByb2dyZXNzTGluZSk7XG59XG5cbmZ1bmN0aW9uIGNvbXBhY3RDbGFuZ0Zvcm1hdExpbnRlck91dHB1dChvdXRwdXQ6IHN0cmluZyk6IHN0cmluZyB7XG5cdHJldHVybiBvbWl0Tm9uRGlhZ25vc3RpY0xpbmVzKG91dHB1dCwgJ2NsYW5nLWZvcm1hdCBkZWJ1ZycsIGlzQ2xhbmdGb3JtYXREZWJ1Z0xpbmUpO1xufVxuXG5mdW5jdGlvbiBjb21wYWN0RG90bmV0VGltaW5nUHJvZ3Jlc3Mob3V0cHV0OiBzdHJpbmcpOiBzdHJpbmcge1xuXHRjb25zdCBjb21wYWN0ZWQ6IHN0cmluZ1tdID0gW107XG5cdGNvbnN0IGJ1ZmZlcmVkUHJvZ3Jlc3M6IHN0cmluZ1tdID0gW107XG5cdGNvbnN0IHRpbWluZyA9IHsgY291bnQ6IDAgfTtcblxuXHRmb3IgKGNvbnN0IGxpbmUgb2Ygb3V0cHV0LnNwbGl0KCdcXG4nKSkge1xuXHRcdGlmIChsaW5lLnRyaW0oKS5sZW5ndGggPT09IDAgfHwgaXNEb3RuZXRTdGFuZGFsb25lVGltaW5nTGluZShsaW5lKSkge1xuXHRcdFx0YnVmZmVyZWRQcm9ncmVzcy5wdXNoKGxpbmUpO1xuXHRcdFx0aWYgKGlzRG90bmV0U3RhbmRhbG9uZVRpbWluZ0xpbmUobGluZSkpIHtcblx0XHRcdFx0dGltaW5nLmNvdW50ICs9IDE7XG5cdFx0XHR9XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cblx0XHRmbHVzaERvdG5ldFRpbWluZ1Byb2dyZXNzKGNvbXBhY3RlZCwgYnVmZmVyZWRQcm9ncmVzcywgdGltaW5nKTtcblx0XHRjb21wYWN0ZWQucHVzaChsaW5lKTtcblx0fVxuXG5cdGZsdXNoRG90bmV0VGltaW5nUHJvZ3Jlc3MoY29tcGFjdGVkLCBidWZmZXJlZFByb2dyZXNzLCB0aW1pbmcpO1xuXHRyZXR1cm4gY29tcGFjdGVkLmpvaW4oJ1xcbicpO1xufVxuXG5mdW5jdGlvbiBmbHVzaERvdG5ldFRpbWluZ1Byb2dyZXNzKFxuXHRjb21wYWN0ZWQ6IHN0cmluZ1tdLFxuXHRidWZmZXJlZFByb2dyZXNzOiBzdHJpbmdbXSxcblx0dGltaW5nOiB7IGNvdW50OiBudW1iZXIgfSxcbik6IHZvaWQge1xuXHRpZiAodGltaW5nLmNvdW50ID49IDMpIHtcblx0XHRjb21wYWN0ZWQucHVzaChgW2RvdG5ldCB0aW1pbmcgcHJvZ3Jlc3M6IG9taXR0ZWQgJHt0aW1pbmcuY291bnR9IHRpbWluZyBsaW5lKHMpXWApO1xuXHR9IGVsc2Uge1xuXHRcdGZvciAoY29uc3QgbGluZSBvZiBidWZmZXJlZFByb2dyZXNzKSB7XG5cdFx0XHRjb21wYWN0ZWQucHVzaChsaW5lKTtcblx0XHR9XG5cdH1cblx0YnVmZmVyZWRQcm9ncmVzcy5sZW5ndGggPSAwO1xuXHR0aW1pbmcuY291bnQgPSAwO1xufVxuXG5mdW5jdGlvbiBpc0RvdG5ldFN0YW5kYWxvbmVUaW1pbmdMaW5lKGxpbmU6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gcmVnZXhUZXN0KFN0cmluZy5yYXdgXlxccypcXChcXGQrKD86XFwuXFxkKyk/c1xcKVxccyokYCwgbGluZSk7XG59XG5cbmZ1bmN0aW9uIGNvbXBhY3RHaXRDbGVhblJlbW92aW5nUnVucyhvdXRwdXQ6IHN0cmluZyk6IHN0cmluZyB7XG5cdHJldHVybiBjb2xsYXBzZUNvbnRpZ3VvdXNSdW5zKG91dHB1dCwgaXNHaXRDbGVhblJlbW92aW5nTGluZSwgMTYsIGJsb2NrID0+IHtcblx0XHRjb25zdCBrZXB0U3RhcnQgPSBibG9jay5zbGljZSgwLCBNYXRoLm1pbig1LCBibG9jay5sZW5ndGgpKTtcblx0XHRjb25zdCBrZXB0RW5kU3RhcnQgPSBzYXR1cmF0aW5nU3ViKGJsb2NrLmxlbmd0aCwgNSk7XG5cdFx0Y29uc3Qga2VwdEVuZCA9IGJsb2NrLnNsaWNlKGtlcHRFbmRTdGFydCk7XG5cdFx0Y29uc3Qgb21pdHRlZCA9IHNhdHVyYXRpbmdTdWIoYmxvY2subGVuZ3RoLCBrZXB0U3RhcnQubGVuZ3RoICsga2VwdEVuZC5sZW5ndGgpO1xuXHRcdGlmIChvbWl0dGVkID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBsaW5lczogc3RyaW5nW10gPSBbLi4ua2VwdFN0YXJ0XTtcblx0XHRsaW5lcy5wdXNoKGBbZ2l0IGNsZWFuOiBvbWl0dGVkICR7b21pdHRlZH0gUmVtb3ZpbmcgbGluZShzKV1gKTtcblx0XHRsaW5lcy5wdXNoKC4uLmtlcHRFbmQpO1xuXHRcdHJldHVybiBsaW5lcy5qb2luKCdcXG4nKTtcblx0fSk7XG59XG5cbmZ1bmN0aW9uIGlzR2l0Q2xlYW5SZW1vdmluZ0xpbmUobGluZTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiByZWdleFRlc3QoU3RyaW5nLnJhd2BeUmVtb3ZpbmcgXFxTK2AsIGxpbmUpO1xufVxuXG5mdW5jdGlvbiBjb2xsYXBzZUNvbnRpZ3VvdXNSdW5zKFxuXHRvdXRwdXQ6IHN0cmluZyxcblx0aXNNZW1iZXI6IChsaW5lOiBzdHJpbmcpID0+IGJvb2xlYW4sXG5cdG1pblJ1bjogbnVtYmVyLFxuXHRzdW1tYXJpemU6IChibG9jazogc3RyaW5nW10pID0+IHN0cmluZyB8IHVuZGVmaW5lZCxcbik6IHN0cmluZyB7XG5cdGNvbnN0IGxpbmVzID0gb3V0cHV0LnNwbGl0KCdcXG4nKTtcblx0Y29uc3QgY29tcGFjdGVkOiBzdHJpbmdbXSA9IFtdO1xuXHRsZXQgaSA9IDA7XG5cdHdoaWxlIChpIDwgbGluZXMubGVuZ3RoKSB7XG5cdFx0aWYgKCFpc01lbWJlcihsaW5lc1tpXSkpIHtcblx0XHRcdGNvbXBhY3RlZC5wdXNoKGxpbmVzW2ldKTtcblx0XHRcdGkgKz0gMTtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblxuXHRcdGNvbnN0IHN0YXJ0ID0gaTtcblx0XHR3aGlsZSAoaSA8IGxpbmVzLmxlbmd0aCAmJiBpc01lbWJlcihsaW5lc1tpXSkpIHtcblx0XHRcdGkgKz0gMTtcblx0XHR9XG5cdFx0Y29uc3QgYmxvY2sgPSBsaW5lcy5zbGljZShzdGFydCwgaSk7XG5cdFx0Y29uc3Qgc3VtbWFyeSA9IGJsb2NrLmxlbmd0aCA+PSBtaW5SdW4gPyBzdW1tYXJpemUoYmxvY2spIDogdW5kZWZpbmVkO1xuXHRcdGlmIChzdW1tYXJ5ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdGNvbXBhY3RlZC5wdXNoKHN1bW1hcnkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb21wYWN0ZWQucHVzaCguLi5ibG9jayk7XG5cdFx0fVxuXHR9XG5cdHJldHVybiBjb21wYWN0ZWQuam9pbignXFxuJyk7XG59XG5cbmZ1bmN0aW9uIGNvbGxhcHNlUnVuc1dpdGhFeGFtcGxlcyhcblx0b3V0cHV0OiBzdHJpbmcsXG5cdGlzTWVtYmVyOiAobGluZTogc3RyaW5nKSA9PiBib29sZWFuLFxuXHRleGFtcGxlOiAobGluZTogc3RyaW5nKSA9PiBzdHJpbmcgfCB1bmRlZmluZWQsXG5cdHN1bW1hcml6ZTogKGNvdW50OiBudW1iZXIsIGV4YW1wbGVzOiBzdHJpbmcpID0+IHN0cmluZyxcbik6IHN0cmluZyB7XG5cdHJldHVybiBjb2xsYXBzZUNvbnRpZ3VvdXNSdW5zKG91dHB1dCwgaXNNZW1iZXIsIDUsIGJsb2NrID0+IHtcblx0XHRjb25zdCBleGFtcGxlczogc3RyaW5nW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGxpbmUgb2YgYmxvY2spIHtcblx0XHRcdGNvbnN0IGV4ID0gZXhhbXBsZShsaW5lKTtcblx0XHRcdGlmIChleCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdGV4YW1wbGVzLnB1c2goZXgpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAoZXhhbXBsZXMubGVuZ3RoICE9PSBibG9jay5sZW5ndGgpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiBzdW1tYXJpemUoXG5cdFx0XHRibG9jay5sZW5ndGgsXG5cdFx0XHRzdW1tYXJpemVXaXRoTW9yZSh1bmlxdWVTdHJpbmdzKGV4YW1wbGVzKSwgMTApLFxuXHRcdCk7XG5cdH0pO1xufVxuXG5mdW5jdGlvbiBjb21wYWN0UmVwZWF0ZWROb2RlV2FybmluZ3Mob3V0cHV0OiBzdHJpbmcpOiBzdHJpbmcge1xuXHRjb25zdCBzZWVuOiBzdHJpbmdbXSA9IFtdO1xuXHRyZXR1cm4gb21pdE1hdGNoaW5nTGluZXMoXG5cdFx0b3V0cHV0LFxuXHRcdCdub2RlIHdhcm5pbmdzJyxcblx0XHRsaW5lID0+IHtcblx0XHRcdGNvbnN0IGtleSA9IGdldE5vZGVXYXJuaW5nS2V5KGxpbmUpO1xuXHRcdFx0aWYgKGtleSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHRcdGlmIChzZWVuLmluY2x1ZGVzKGtleSkpIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0XHRzZWVuLnB1c2goa2V5KTtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9LFxuXHRcdCdyZXBlYXRlZCB3YXJuaW5nJyxcblx0KTtcbn1cblxuZnVuY3Rpb24gZ2V0Tm9kZVdhcm5pbmdLZXkobGluZTogc3RyaW5nKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0aWYgKHJlZ2V4VGVzdChcblx0XHRTdHJpbmcucmF3YF5cXChub2RlOlxcZCtcXCkgKD86XFxbW0EtWjAtOV8tXStcXF0gKT8oPzpFeHBlcmltZW50YWxXYXJuaW5nfERlcHJlY2F0aW9uV2FybmluZ3xXYXJuaW5nKTogYCxcblx0XHRsaW5lLFxuXHQpKSB7XG5cdFx0cmV0dXJuIHJlZ2V4UmVwbGFjZUFsbChTdHJpbmcucmF3YF5cXChub2RlOlxcZCtcXClgLCBsaW5lLCAnKG5vZGUpJyk7XG5cdH1cblxuXHRpZiAobGluZS5zdGFydHNXaXRoKCcoVXNlIGBub2RlIC0tdHJhY2Utd2FybmluZ3MnKVxuXHRcdHx8IGxpbmUuc3RhcnRzV2l0aCgnKFVzZSBgbm9kZSAtLXRyYWNlLWRlcHJlY2F0aW9uJylcblx0KSB7XG5cdFx0cmV0dXJuIGxpbmU7XG5cdH1cblxuXHRyZXR1cm4gdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiBvbWl0TWF0Y2hpbmdMaW5lcyhcblx0b3V0cHV0OiBzdHJpbmcsXG5cdGxhYmVsOiBzdHJpbmcsXG5cdHNob3VsZE9taXQ6IChsaW5lOiBzdHJpbmcpID0+IGJvb2xlYW4sXG5cdHN1bW1hcnlTdWZmaXg6IHN0cmluZyxcbik6IHN0cmluZyB7XG5cdGNvbnN0IGNvbXBhY3RlZDogc3RyaW5nW10gPSBbXTtcblx0Y29uc3Qgb21pdHRlZCA9IHsgY291bnQ6IDAgfTtcblxuXHRmb3IgKGNvbnN0IGxpbmUgb2Ygb3V0cHV0LnNwbGl0KCdcXG4nKSkge1xuXHRcdGlmIChzaG91bGRPbWl0KGxpbmUpKSB7XG5cdFx0XHRvbWl0dGVkLmNvdW50ICs9IDE7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGZsdXNoT21pdHRlZExpbmVzKGNvbXBhY3RlZCwgbGFiZWwsIG9taXR0ZWQsIHN1bW1hcnlTdWZmaXgpO1xuXHRcdFx0Y29tcGFjdGVkLnB1c2gobGluZSk7XG5cdFx0fVxuXHR9XG5cdGZsdXNoT21pdHRlZExpbmVzKGNvbXBhY3RlZCwgbGFiZWwsIG9taXR0ZWQsIHN1bW1hcnlTdWZmaXgpO1xuXHRyZXR1cm4gY29tcGFjdGVkLmpvaW4oJ1xcbicpO1xufVxuXG5mdW5jdGlvbiBvbWl0Tm9uRGlhZ25vc3RpY0xpbmVzKFxuXHRvdXRwdXQ6IHN0cmluZyxcblx0bGFiZWw6IHN0cmluZyxcblx0c2hvdWxkT21pdDogKGxpbmU6IHN0cmluZykgPT4gYm9vbGVhbixcbik6IHN0cmluZyB7XG5cdHJldHVybiBvbWl0TWF0Y2hpbmdMaW5lcyhvdXRwdXQsIGxhYmVsLCBzaG91bGRPbWl0LCAnbm9uLWRpYWdub3N0aWMnKTtcbn1cblxuZnVuY3Rpb24gZmx1c2hPbWl0dGVkTGluZXMoXG5cdGNvbXBhY3RlZDogc3RyaW5nW10sXG5cdGxhYmVsOiBzdHJpbmcsXG5cdG9taXR0ZWQ6IHsgY291bnQ6IG51bWJlciB9LFxuXHRzdW1tYXJ5U3VmZml4OiBzdHJpbmcsXG4pOiB2b2lkIHtcblx0aWYgKG9taXR0ZWQuY291bnQgPiAwKSB7XG5cdFx0Y29tcGFjdGVkLnB1c2goYFske2xhYmVsfTogb21pdHRlZCAke29taXR0ZWQuY291bnR9ICR7c3VtbWFyeVN1ZmZpeH0gbGluZShzKV1gKTtcblx0XHRvbWl0dGVkLmNvdW50ID0gMDtcblx0fVxufVxuXG5mdW5jdGlvbiBjb21wYWN0UGFja2FnZU1hbmFnZXJPcGVyYXRpb25zKG91dHB1dDogc3RyaW5nKTogc3RyaW5nIHtcblx0aWYgKCFoYXNQYWNrYWdlTWFuYWdlck9wZXJhdGlvbnMob3V0cHV0KSkge1xuXHRcdHJldHVybiBvdXRwdXQ7XG5cdH1cblx0cmV0dXJuIGNvbGxhcHNlUnVuc1dpdGhFeGFtcGxlcyhcblx0XHRvdXRwdXQsXG5cdFx0aXNQYWNrYWdlTWFuYWdlck9wZXJhdGlvbkxpbmUsXG5cdFx0cGFja2FnZU1hbmFnZXJPcGVyYXRpb25FeGFtcGxlLFxuXHRcdChsZW4sIGV4YW1wbGVzKSA9PiBgW3BhY2thZ2Ugb3BlcmF0aW9uczogb21pdHRlZCAke2xlbn0gcm93KHMpOyBleGFtcGxlczogJHtleGFtcGxlc31dYCxcblx0KTtcbn1cblxuZnVuY3Rpb24gaGFzUGFja2FnZU1hbmFnZXJPcGVyYXRpb25zKG91dHB1dDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdGNvbnN0IGhhc01hcmtlciA9IG91dHB1dC5pbmNsdWRlcygnSW5zdGFsbGluZyBkZXBlbmRlbmNpZXMgZnJvbSBsb2NrIGZpbGUnKVxuXHRcdHx8IG91dHB1dC5pbmNsdWRlcygnTG9jayBmaWxlIG9wZXJhdGlvbnM6Jylcblx0XHR8fCBvdXRwdXQuaW5jbHVkZXMoJ1BhY2thZ2Ugb3BlcmF0aW9uczonKVxuXHRcdHx8IG91dHB1dC5pbmNsdWRlcygnV3JpdGluZyBsb2NrIGZpbGUnKVxuXHRcdHx8IG91dHB1dC5pbmNsdWRlcygnR2VuZXJhdGluZyBhdXRvbG9hZCBmaWxlcycpXG5cdFx0fHwgb3V0cHV0LmluY2x1ZGVzKCdMb2NrIGZpbGUgaXMgdXAgdG8gZGF0ZScpO1xuXHRyZXR1cm4gaGFzTWFya2VyICYmIG91dHB1dC5zcGxpdCgnXFxuJykuc29tZShsaW5lID0+IGlzUGFja2FnZU1hbmFnZXJPcGVyYXRpb25MaW5lKGxpbmUpKTtcbn1cblxuZnVuY3Rpb24gaXNQYWNrYWdlTWFuYWdlck9wZXJhdGlvbkxpbmUobGluZTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdGlmIChyZWdleFRlc3RXaXRoRmxhZ3MoU3RyaW5nLnJhd2AoPzpGYWlsZWR8RXJyb3J8RXhjZXB0aW9ufFRyYWNlYmFja3xmYXRhbClgLCBsaW5lLCAnaScpKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdHJldHVybiBwYXJzZVBhY2thZ2VNYW5hZ2VyT3BlcmF0aW9uKGxpbmUpICE9PSB1bmRlZmluZWQ7XG59XG5cbmZ1bmN0aW9uIHBhY2thZ2VNYW5hZ2VyT3BlcmF0aW9uRXhhbXBsZShsaW5lOiBzdHJpbmcpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRjb25zdCBwYXJzZWQgPSBwYXJzZVBhY2thZ2VNYW5hZ2VyT3BlcmF0aW9uKGxpbmUpO1xuXHRpZiAocGFyc2VkID09PSB1bmRlZmluZWQpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdHJldHVybiBwYXJzZWQudmVyc2lvbiAhPT0gdW5kZWZpbmVkID8gYCR7cGFyc2VkLnBrZ30gKCR7cGFyc2VkLnZlcnNpb259KWAgOiBwYXJzZWQucGtnO1xufVxuXG5mdW5jdGlvbiBwYXJzZVBhY2thZ2VNYW5hZ2VyT3BlcmF0aW9uKGxpbmU6IHN0cmluZyk6IFBhY2thZ2VNYW5hZ2VyT3BlcmF0aW9uIHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgcmVzdEFmdGVyRGFzaCA9IHN0cmlwUHJlZml4KGxpbmUsICcgIC0gJyk7XG5cdGlmIChyZXN0QWZ0ZXJEYXNoID09PSB1bmRlZmluZWQpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGNvbnN0IG9wZXJhdGlvblNwbGl0ID0gc3BsaXRPbmNlKHJlc3RBZnRlckRhc2gsICcgJyk7XG5cdGlmIChvcGVyYXRpb25TcGxpdCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRjb25zdCBvcGVyYXRpb24gPSBvcGVyYXRpb25TcGxpdFswXTtcblx0bGV0IHJlc3QgPSBvcGVyYXRpb25TcGxpdFsxXTtcblx0aWYgKCFbJ0luc3RhbGxpbmcnLCAnTG9ja2luZycsICdVcGRhdGluZycsICdSZW1vdmluZycsICdEb3dubG9hZGluZyddLmluY2x1ZGVzKG9wZXJhdGlvbikpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGNvbnN0IHBhY2thZ2VTcGxpdCA9IHNwbGl0T25jZShyZXN0LCAnICcpO1xuXHRsZXQgcGtnOiBzdHJpbmc7XG5cdGlmIChwYWNrYWdlU3BsaXQgPT09IHVuZGVmaW5lZCkge1xuXHRcdHBrZyA9IHJlc3Q7XG5cdFx0cmVzdCA9ICcnO1xuXHR9IGVsc2Uge1xuXHRcdHBrZyA9IHBhY2thZ2VTcGxpdFswXTtcblx0XHRyZXN0ID0gcGFja2FnZVNwbGl0WzFdO1xuXHR9XG5cdGlmIChwa2cubGVuZ3RoID09PSAwKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRpZiAocmVzdC5sZW5ndGggPT09IDApIHtcblx0XHRyZXR1cm4geyBvcGVyYXRpb24sIHBrZywgdmVyc2lvbjogdW5kZWZpbmVkIH07XG5cdH1cblx0Y29uc3QgYWZ0ZXJPcGVuID0gc3RyaXBQcmVmaXgocmVzdCwgJygnKTtcblx0aWYgKGFmdGVyT3BlbiAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0Y29uc3QgY2xvc2VTcGxpdCA9IHNwbGl0T25jZShhZnRlck9wZW4sICcpJyk7XG5cdFx0aWYgKGNsb3NlU3BsaXQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0Y29uc3QgdmVyc2lvbiA9IGNsb3NlU3BsaXRbMF07XG5cdFx0XHRjb25zdCBhZnRlckNsb3NlID0gY2xvc2VTcGxpdFsxXTtcblx0XHRcdGlmIChhZnRlckNsb3NlLmxlbmd0aCA9PT0gMCB8fCBhZnRlckNsb3NlLnN0YXJ0c1dpdGgoJzogJykpIHtcblx0XHRcdFx0cmV0dXJuIHsgb3BlcmF0aW9uLCBwa2csIHZlcnNpb24gfTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblx0aWYgKHJlc3Quc3RhcnRzV2l0aCgnOiAnKSkge1xuXHRcdHJldHVybiB7IG9wZXJhdGlvbiwgcGtnLCB2ZXJzaW9uOiB1bmRlZmluZWQgfTtcblx0fVxuXHRyZXR1cm4gdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiB1bmlxdWVTdHJpbmdzKGl0ZW1zOiBzdHJpbmdbXSk6IHN0cmluZ1tdIHtcblx0Y29uc3QgdW5pcXVlOiBzdHJpbmdbXSA9IFtdO1xuXHRmb3IgKGNvbnN0IGl0ZW0gb2YgaXRlbXMpIHtcblx0XHRpZiAoIXVuaXF1ZS5pbmNsdWRlcyhpdGVtKSkge1xuXHRcdFx0dW5pcXVlLnB1c2goaXRlbSk7XG5cdFx0fVxuXHR9XG5cdHJldHVybiB1bmlxdWU7XG59XG5cbmZ1bmN0aW9uIHN1bW1hcml6ZVdpdGhNb3JlKGl0ZW1zOiBzdHJpbmdbXSwgbWF4SXRlbXM6IG51bWJlcik6IHN0cmluZyB7XG5cdGNvbnN0IHNob3duID0gaXRlbXMuc2xpY2UoMCwgbWF4SXRlbXMpO1xuXHRjb25zdCBvbWl0dGVkID0gc2F0dXJhdGluZ1N1YihpdGVtcy5sZW5ndGgsIHNob3duLmxlbmd0aCk7XG5cdGlmIChvbWl0dGVkID4gMCkge1xuXHRcdHJldHVybiBgJHtzaG93bi5qb2luKCcsICcpfSwgLi4uICske29taXR0ZWR9IG1vcmVgO1xuXHR9XG5cdHJldHVybiBzaG93bi5qb2luKCcsICcpO1xufVxuXG4vLyNlbmRyZWdpb25cblxuLy8jcmVnaW9uIHNoZWxsX291dHB1dF9jb21wYWN0b3IucnMgXHUyMDE0IG5wbS1wYWNrLCBnbywgZGlhZ25vc3RpY3MsIGNhcmdvLCB1bml0dGVzdCwgY21ha2VcblxuZnVuY3Rpb24gY29tcGFjdE5wbVBhY2tPdXRwdXQob3V0cHV0OiBzdHJpbmcpOiBzdHJpbmcge1xuXHRpZiAoIWxvb2tzTGlrZU5wbVBhY2tPdXRwdXQob3V0cHV0KSkge1xuXHRcdHJldHVybiBvdXRwdXQ7XG5cdH1cblxuXHRjb25zdCBjb21wYWN0ZWQ6IHN0cmluZ1tdID0gW107XG5cdGxldCBpblRhcmJhbGxDb250ZW50cyA9IGZhbHNlO1xuXHRjb25zdCBvbWl0dGVkRmlsZVJvd3MgPSB7IGNvdW50OiAwIH07XG5cblx0Zm9yIChjb25zdCBsaW5lIG9mIG91dHB1dC5zcGxpdCgnXFxuJykpIHtcblx0XHRjb25zdCBub3JtYWxpemVkTGluZSA9IHN0cmlwTnBtU3Bpbm5lclByZWZpeChsaW5lKTtcblx0XHRpZiAobm9ybWFsaXplZExpbmUgPT09ICducG0gbm90aWNlIFRhcmJhbGwgQ29udGVudHMnKSB7XG5cdFx0XHRpblRhcmJhbGxDb250ZW50cyA9IHRydWU7XG5cdFx0XHRjb21wYWN0ZWQucHVzaChsaW5lKTtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblx0XHRpZiAobm9ybWFsaXplZExpbmUgPT09ICducG0gbm90aWNlIFRhcmJhbGwgRGV0YWlscycpIHtcblx0XHRcdGZsdXNoTnBtUGFja09taXR0ZWQoY29tcGFjdGVkLCBvbWl0dGVkRmlsZVJvd3MpO1xuXHRcdFx0aW5UYXJiYWxsQ29udGVudHMgPSBmYWxzZTtcblx0XHRcdGNvbXBhY3RlZC5wdXNoKGxpbmUpO1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXHRcdGlmIChpblRhcmJhbGxDb250ZW50cyAmJiBpc05wbVBhY2tGaWxlTGlzdGluZ0xpbmUobm9ybWFsaXplZExpbmUpKSB7XG5cdFx0XHRvbWl0dGVkRmlsZVJvd3MuY291bnQgKz0gMTtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblxuXHRcdGNvbXBhY3RlZC5wdXNoKGxpbmUpO1xuXHR9XG5cdGZsdXNoTnBtUGFja09taXR0ZWQoY29tcGFjdGVkLCBvbWl0dGVkRmlsZVJvd3MpO1xuXHRyZXR1cm4gY29tcGFjdGVkLmpvaW4oJ1xcbicpO1xufVxuXG5mdW5jdGlvbiBmbHVzaE5wbVBhY2tPbWl0dGVkKGNvbXBhY3RlZDogc3RyaW5nW10sIG9taXR0ZWRGaWxlUm93czogeyBjb3VudDogbnVtYmVyIH0pOiB2b2lkIHtcblx0aWYgKG9taXR0ZWRGaWxlUm93cy5jb3VudCA+IDApIHtcblx0XHRjb21wYWN0ZWQucHVzaChgW25wbSBwYWNrIHRhcmJhbGwgY29udGVudHM6IG9taXR0ZWQgJHtvbWl0dGVkRmlsZVJvd3MuY291bnR9IGZpbGUgbGlzdGluZyBsaW5lKHMpXWApO1xuXHRcdG9taXR0ZWRGaWxlUm93cy5jb3VudCA9IDA7XG5cdH1cbn1cblxuZnVuY3Rpb24gaXNOcG1QYWNrRmlsZUxpc3RpbmdMaW5lKGxpbmU6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRjb25zdCByZXN0MCA9IHN0cmlwUHJlZml4KGxpbmUsICducG0gbm90aWNlICcpO1xuXHRpZiAocmVzdDAgPT09IHVuZGVmaW5lZCkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRsZXQgbnVtYmVyRW5kID0gcmVzdDAubGVuZ3RoO1xuXHRmb3IgKGxldCBpID0gMDsgaSA8IHJlc3QwLmxlbmd0aDsgaSsrKSB7XG5cdFx0Y29uc3QgY2ggPSByZXN0MFtpXTtcblx0XHRpZiAoIWlzQXNjaWlEaWdpdChjaCkgJiYgY2ggIT09ICcuJykge1xuXHRcdFx0bnVtYmVyRW5kID0gaTtcblx0XHRcdGJyZWFrO1xuXHRcdH1cblx0fVxuXHRpZiAobnVtYmVyRW5kID09PSAwIHx8ICFpc0RlY2ltYWxOdW1iZXIocmVzdDAuc2xpY2UoMCwgbnVtYmVyRW5kKSkpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0Y29uc3QgcmVzdCA9IHJlc3QwLnNsaWNlKG51bWJlckVuZCkudHJpbVN0YXJ0KCk7XG5cdHJldHVybiBbJ0InLCAna0InLCAnTUInLCAnR0InXS5zb21lKHVuaXQgPT4ge1xuXHRcdGNvbnN0IHZhbHVlID0gc3RyaXBQcmVmaXgocmVzdCwgdW5pdCk7XG5cdFx0cmV0dXJuIHZhbHVlICE9PSB1bmRlZmluZWQgJiYgdmFsdWUuc3RhcnRzV2l0aCgnICcpO1xuXHR9KTtcbn1cblxuZnVuY3Rpb24gc3RyaXBOcG1TcGlubmVyUHJlZml4KGxpbmU6IHN0cmluZyk6IHN0cmluZyB7XG5cdGNvbnN0IHRyaW1tZWQgPSB0cmltU3RhcnRNYXRjaGVzQ2hhcnMobGluZSwgWyd8JywgJy8nLCAnLSddKTtcblx0aWYgKHRyaW1tZWQuc3RhcnRzV2l0aCgnbnBtIG5vdGljZSAnKSkge1xuXHRcdHJldHVybiB0cmltbWVkO1xuXHR9XG5cdHJldHVybiBsaW5lO1xufVxuXG5mdW5jdGlvbiBpc0RlY2ltYWxOdW1iZXIodmFsdWU6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRpZiAodmFsdWUubGVuZ3RoID09PSAwKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdGxldCBoYXNEaWdpdCA9IGZhbHNlO1xuXHRsZXQgZG90Q291bnQgPSAwO1xuXHRmb3IgKGNvbnN0IGNoIG9mIHZhbHVlKSB7XG5cdFx0aWYgKGlzQXNjaWlEaWdpdChjaCkpIHtcblx0XHRcdGhhc0RpZ2l0ID0gdHJ1ZTtcblx0XHR9IGVsc2UgaWYgKGNoID09PSAnLicpIHtcblx0XHRcdGRvdENvdW50ICs9IDE7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIGRvdENvdW50IDw9IDEgJiYgaGFzRGlnaXQ7XG59XG5cbmZ1bmN0aW9uIGNvbXBhY3RHb091dHB1dChvdXRwdXQ6IHN0cmluZyk6IHN0cmluZyB7XG5cdGNvbnN0IGNvbXBhY3RlZDogc3RyaW5nW10gPSBbXTtcblx0Y29uc3QgZG93bmxvYWRDb3VudCA9IHsgY291bnQ6IDAgfTtcblxuXHRmb3IgKGNvbnN0IGxpbmUgb2Ygb3V0cHV0LnNwbGl0KCdcXG4nKSkge1xuXHRcdGlmIChpc0dvTW9kdWxlRG93bmxvYWRDaGF0dGVyTGluZShsaW5lKSkge1xuXHRcdFx0ZG93bmxvYWRDb3VudC5jb3VudCArPSAxO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRmbHVzaEdvRG93bmxvYWRzKGNvbXBhY3RlZCwgZG93bmxvYWRDb3VudCk7XG5cdFx0XHRjb21wYWN0ZWQucHVzaChsaW5lKTtcblx0XHR9XG5cdH1cblx0Zmx1c2hHb0Rvd25sb2Fkcyhjb21wYWN0ZWQsIGRvd25sb2FkQ291bnQpO1xuXHRyZXR1cm4gY29tcGFjdGVkLmpvaW4oJ1xcbicpO1xufVxuXG5mdW5jdGlvbiBmbHVzaEdvRG93bmxvYWRzKGNvbXBhY3RlZDogc3RyaW5nW10sIGRvd25sb2FkQ291bnQ6IHsgY291bnQ6IG51bWJlciB9KTogdm9pZCB7XG5cdGlmIChkb3dubG9hZENvdW50LmNvdW50ID4gMCkge1xuXHRcdGNvbXBhY3RlZC5wdXNoKGBbZ28gdGVzdDogb21pdHRlZCAke2Rvd25sb2FkQ291bnQuY291bnR9IGRlcGVuZGVuY3kgZG93bmxvYWQgbGluZShzKV1gKTtcblx0XHRkb3dubG9hZENvdW50LmNvdW50ID0gMDtcblx0fVxufVxuXG5mdW5jdGlvbiBpc0dvTW9kdWxlRG93bmxvYWRDaGF0dGVyTGluZShsaW5lOiBzdHJpbmcpOiBib29sZWFuIHtcblx0aWYgKGlzRGlhZ25vc3RpY0xpbmUobGluZSkpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0cmV0dXJuIGxpbmUuc3RhcnRzV2l0aCgnZ286IGRvd25sb2FkaW5nICcpXG5cdFx0fHwgbGluZS5zdGFydHNXaXRoKCdnbzogZmluZGluZyBtb2R1bGUgZm9yIHBhY2thZ2UgJylcblx0XHR8fCBsaW5lLnN0YXJ0c1dpdGgoJ2dvOiBleHRyYWN0aW5nICcpXG5cdFx0fHwgKGxpbmUuc3RhcnRzV2l0aCgnZ286IGZvdW5kICcpICYmIGxpbmUuaW5jbHVkZXMoJyBpbiAnKSk7XG59XG5cbmZ1bmN0aW9uIGNvbXBhY3RSZXBlYXRlZERpYWdub3N0aWNCbG9ja3Mob3V0cHV0OiBzdHJpbmcpOiBzdHJpbmcge1xuXHRjb25zdCBsaW5lcyA9IG91dHB1dC5zcGxpdCgnXFxuJyk7XG5cdGNvbnN0IGRpYWdub3N0aWNMaW5lcyA9IGxpbmVzLm1hcChsaW5lID0+IGlzRGlhZ25vc3RpY0xpbmUobGluZSkpO1xuXHRjb25zdCBjb21wYWN0ZWQ6IHN0cmluZ1tdID0gW107XG5cdGxldCBpID0gMDtcblx0d2hpbGUgKGkgPCBsaW5lcy5sZW5ndGgpIHtcblx0XHRjb25zdCByZXBlYXRlZEJsb2NrID0gZmluZFJlcGVhdGVkRGlhZ25vc3RpY0Jsb2NrKGxpbmVzLCBkaWFnbm9zdGljTGluZXMsIGkpO1xuXHRcdGlmIChyZXBlYXRlZEJsb2NrID09PSB1bmRlZmluZWQpIHtcblx0XHRcdGNvbXBhY3RlZC5wdXNoKGxpbmVzW2ldKTtcblx0XHRcdGkgKz0gMTtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblxuXHRcdGNvbXBhY3RlZC5wdXNoKC4uLmxpbmVzLnNsaWNlKGksIGkgKyByZXBlYXRlZEJsb2NrLmxpbmVDb3VudCkpO1xuXHRcdGNvbXBhY3RlZC5wdXNoKFxuXHRcdFx0YFtyZXBlYXRlZCBkaWFnbm9zdGljIGJsb2NrOiBwcmV2aW91cyAke3JlcGVhdGVkQmxvY2subGluZUNvdW50fSBsaW5lKHMpIHJlcGVhdGVkICR7cmVwZWF0ZWRCbG9jay5yZXBldGl0aW9uc30gbW9yZSB0aW1lKHMpXWAsXG5cdFx0KTtcblx0XHRpICs9IHJlcGVhdGVkQmxvY2subGluZUNvdW50ICogKHJlcGVhdGVkQmxvY2sucmVwZXRpdGlvbnMgKyAxKTtcblx0fVxuXHRyZXR1cm4gY29tcGFjdGVkLmpvaW4oJ1xcbicpO1xufVxuXG5pbnRlcmZhY2UgUmVwZWF0ZWREaWFnbm9zdGljQmxvY2sge1xuXHRsaW5lQ291bnQ6IG51bWJlcjtcblx0cmVwZXRpdGlvbnM6IG51bWJlcjtcbn1cblxuZnVuY3Rpb24gZmluZFJlcGVhdGVkRGlhZ25vc3RpY0Jsb2NrKFxuXHRsaW5lczogc3RyaW5nW10sXG5cdGRpYWdub3N0aWNMaW5lczogYm9vbGVhbltdLFxuXHRzdGFydDogbnVtYmVyLFxuKTogUmVwZWF0ZWREaWFnbm9zdGljQmxvY2sgfCB1bmRlZmluZWQge1xuXHRmb3IgKGxldCBsaW5lQ291bnQgPSA2OyBsaW5lQ291bnQgPj0gMjsgbGluZUNvdW50LS0pIHtcblx0XHRpZiAoc3RhcnQgKyBsaW5lQ291bnQgKiAyID4gbGluZXMubGVuZ3RoKSB7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cblx0XHRpZiAoIWRpYWdub3N0aWNMaW5lcy5zbGljZShzdGFydCwgc3RhcnQgKyBsaW5lQ291bnQpLnNvbWUoaXNEaWFnbm9zdGljID0+IGlzRGlhZ25vc3RpYykpIHtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblxuXHRcdGxldCByZXBldGl0aW9ucyA9IDA7XG5cdFx0d2hpbGUgKHN0YXJ0ICsgKHJlcGV0aXRpb25zICsgMikgKiBsaW5lQ291bnQgPD0gbGluZXMubGVuZ3RoKSB7XG5cdFx0XHRjb25zdCBvZmZzZXQgPSBzdGFydCArIChyZXBldGl0aW9ucyArIDEpICogbGluZUNvdW50O1xuXHRcdFx0aWYgKCFhcnJheVNsaWNlRXF1YWwobGluZXMsIHN0YXJ0LCBvZmZzZXQsIGxpbmVDb3VudCkpIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRyZXBldGl0aW9ucyArPSAxO1xuXHRcdH1cblxuXHRcdGlmIChyZXBldGl0aW9ucyA+IDApIHtcblx0XHRcdHJldHVybiB7IGxpbmVDb3VudCwgcmVwZXRpdGlvbnMgfTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIHVuZGVmaW5lZDtcbn1cblxuZnVuY3Rpb24gaXNEaWFnbm9zdGljTGluZShsaW5lOiBzdHJpbmcpOiBib29sZWFuIHtcblx0cmV0dXJuIHJlZ2V4VGVzdFdpdGhGbGFncyhcblx0XHRTdHJpbmcucmF3YCg/OlxcdTI3MTV8XFx1MjcxN3xcXHUwMEQ3KXxcXGIoPzplcnJvcnx3YXJuaW5nfHdhcm58ZmF0YWx8ZmFpbGVkfGZhaWx1cmV8dHJhY2ViYWNrfGV4Y2VwdGlvbnxwYW5pY3xhc3NlcnRpb258YWJvcnRlZHxhYm9ydCB0cmFwfHNlZ21lbnRhdGlvbiBmYXVsdHxjb3JlIGR1bXBlZClcXGJ8bnBtIEVSUiF8XkU6fF5XOnxeRkFJTFxcYmAsXG5cdFx0bGluZSxcblx0XHQnaScsXG5cdCk7XG59XG5cbmZ1bmN0aW9uIGNvbXBhY3RDYXJnb1Byb2dyZXNzKG91dHB1dDogc3RyaW5nKTogc3RyaW5nIHtcblx0aWYgKCFoYXNDYXJnb1Byb2dyZXNzT3V0cHV0KG91dHB1dCkpIHtcblx0XHRyZXR1cm4gb3V0cHV0O1xuXHR9XG5cdHJldHVybiBvbWl0TWF0Y2hpbmdMaW5lcyhvdXRwdXQsICdjYXJnbyBwcm9ncmVzcycsIGlzQ2FyZ29Qcm9ncmVzc0xpbmUsICdwcm9ncmVzcycpO1xufVxuXG5mdW5jdGlvbiBoYXNDYXJnb1Byb2dyZXNzT3V0cHV0KG91dHB1dDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiAhaGFzQ2FyZ29GYWlsdXJlKG91dHB1dClcblx0XHQmJiBoYXNDYXJnb1Rlcm1pbmFsU3VtbWFyeShvdXRwdXQpXG5cdFx0JiYgaGFzQ2FyZ29Qcm9ncmVzc0V2aWRlbmNlKG91dHB1dCk7XG59XG5cbmZ1bmN0aW9uIGhhc0NhcmdvUHJvZ3Jlc3NFdmlkZW5jZShvdXRwdXQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gb3V0cHV0LnNwbGl0KCdcXG4nKS5zb21lKGxpbmUgPT4ge1xuXHRcdGNvbnN0IHRyaW1tZWQgPSBsaW5lLnRyaW1TdGFydCgpO1xuXHRcdHJldHVybiBDQVJHT19QUk9HUkVTU19QUkVGSVhFUy5zb21lKHByZWZpeCA9PiB0cmltbWVkLnN0YXJ0c1dpdGgocHJlZml4KSk7XG5cdH0pO1xufVxuXG5mdW5jdGlvbiBpc0NhcmdvUHJvZ3Jlc3NMaW5lKGxpbmU6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRpZiAoaXNEaWFnbm9zdGljTGluZShsaW5lKSkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRjb25zdCB0cmltbWVkID0gbGluZS50cmltU3RhcnQoKTtcblx0cmV0dXJuIENBUkdPX1BST0dSRVNTX1BSRUZJWEVTLnNvbWUocHJlZml4ID0+IHRyaW1tZWQuc3RhcnRzV2l0aChwcmVmaXgpKTtcbn1cblxuZnVuY3Rpb24gaGFzQ2FyZ29GYWlsdXJlKG91dHB1dDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiBvdXRwdXQuc3BsaXQoJ1xcbicpLnNvbWUobGluZSA9PiB7XG5cdFx0Y29uc3QgdHJpbW1lZCA9IGxpbmUudHJpbVN0YXJ0KCk7XG5cdFx0cmV0dXJuIHRyaW1tZWQuc3RhcnRzV2l0aCgnZXJyb3I6Jylcblx0XHRcdHx8IHRyaW1tZWQuc3RhcnRzV2l0aCgnZXJyb3JbJylcblx0XHRcdHx8IHRyaW1tZWQuc3RhcnRzV2l0aCgndGVzdCByZXN1bHQ6IEZBSUxFRCcpXG5cdFx0XHR8fCB0cmltbWVkLnN0YXJ0c1dpdGgoJ2ZhaWx1cmVzOicpO1xuXHR9KTtcbn1cblxuZnVuY3Rpb24gaGFzQ2FyZ29UZXJtaW5hbFN1bW1hcnkob3V0cHV0OiBzdHJpbmcpOiBib29sZWFuIHtcblx0cmV0dXJuIG91dHB1dC5zcGxpdCgnXFxuJykuc29tZShsaW5lID0+IHtcblx0XHRjb25zdCB0cmltbWVkID0gbGluZS50cmltU3RhcnQoKTtcblx0XHRyZXR1cm4gKHRyaW1tZWQuc3RhcnRzV2l0aCgnRmluaXNoZWQgJykgJiYgdHJpbW1lZC5pbmNsdWRlcygnIHRhcmdldChzKSBpbicpKVxuXHRcdFx0fHwgdHJpbW1lZC5zdGFydHNXaXRoKCd0ZXN0IHJlc3VsdDogb2suJyk7XG5cdH0pO1xufVxuXG5mdW5jdGlvbiBjb21wYWN0VW5pdHRlc3RPdXRwdXQob3V0cHV0OiBzdHJpbmcpOiBzdHJpbmcge1xuXHRpZiAoaGFzUGFzc2luZ1VuaXR0ZXN0U3VtbWFyeShvdXRwdXQpKSB7XG5cdFx0cmV0dXJuIG9taXROb25EaWFnbm9zdGljTGluZXMoXG5cdFx0XHRvdXRwdXQsXG5cdFx0XHQndW5pdHRlc3QgcHJvZ3Jlc3MnLFxuXHRcdFx0aXNVbml0dGVzdFN1Y2Nlc3NQcm9ncmVzc0xpbmUsXG5cdFx0KTtcblx0fVxuXHRyZXR1cm4gb3V0cHV0O1xufVxuXG5mdW5jdGlvbiBoYXNQYXNzaW5nVW5pdHRlc3RTdW1tYXJ5KG91dHB1dDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiByZWdleFRlc3QoXG5cdFx0U3RyaW5nLnJhd2AoPzpefFxcbilSYW4gXFxkKyB0ZXN0cz8gaW4gXFxkKyg/OlxcLlxcZCspP3NcXHMqKD86XFxufCQpYCxcblx0XHRvdXRwdXQsXG5cdCkgJiYgcmVnZXhUZXN0KFN0cmluZy5yYXdgKD86XnxcXG4pT0soPzpcXHMrXFwoW14pXStcXCkpP1xccyooPzpcXG58JClgLCBvdXRwdXQpXG5cdFx0JiYgIXJlZ2V4VGVzdFdpdGhGbGFncyhcblx0XHRcdFN0cmluZy5yYXdgKD86XnxcXG4pKD86RkFJTEVEfEVSUk9SfEZBSUwpOnxcXGIoPzpmYWlsdXJlcz98ZXJyb3JzPyk9XFxkKlsxLTldXFxkKmAsXG5cdFx0XHRvdXRwdXQsXG5cdFx0XHQnaScsXG5cdFx0KTtcbn1cblxuZnVuY3Rpb24gaXNVbml0dGVzdFN1Y2Nlc3NQcm9ncmVzc0xpbmUobGluZTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdGlmIChpc0RpYWdub3N0aWNMaW5lKGxpbmUpKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdGNvbnN0IGFsbERhc2hlcyA9IFsuLi5saW5lXS5ldmVyeShjaCA9PiBjaCA9PT0gJy0nKSAmJiBieXRlTGVuZ3RoKGxpbmUpID49IDIwO1xuXHRjb25zdCBhbGxQcm9ncmVzc0NoYXJzID0gbGluZS5sZW5ndGggPiAwICYmIFsuLi5saW5lXS5ldmVyeShjaCA9PiAnLnNTeFh1VWJCJy5pbmNsdWRlcyhjaCkpO1xuXHRjb25zdCB0ZXN0TGluZSA9IHJlZ2V4VGVzdChTdHJpbmcucmF3YF50ZXN0X1xcUysgXFwoW14pXStcXCkgXFwuXFwuXFwuIG9rJGAsIGxpbmUpO1xuXHRyZXR1cm4gYWxsRGFzaGVzIHx8IGFsbFByb2dyZXNzQ2hhcnMgfHwgdGVzdExpbmU7XG59XG5cbmZ1bmN0aW9uIGlzQ2xhbmdGb3JtYXREZWJ1Z0xpbmUobGluZTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiByZWdleFRlc3QoU3RyaW5nLnJhd2BePFRocmVhZF9cXGQrOkRFQlVHPiAoPzpcXCQgLit8dG9vayBcXGQrbXMpJGAsIGxpbmUpO1xufVxuXG5mdW5jdGlvbiBjb21wYWN0Q21ha2VDb25maWd1cmVQcm9iZVJ1bnMob3V0cHV0OiBzdHJpbmcpOiBzdHJpbmcge1xuXHRyZXR1cm4gY29sbGFwc2VDb250aWd1b3VzUnVucyhvdXRwdXQsIGlzQ21ha2VDb25maWd1cmVQcm9iZUxpbmUsIDgsIGJsb2NrID0+XG5cdFx0YFtjbWFrZSBjb25maWd1cmU6IG9taXR0ZWQgJHtibG9jay5sZW5ndGh9IHN0YXR1cyBwcm9iZSBsaW5lKHMpXWAsXG5cdCk7XG59XG5cbmZ1bmN0aW9uIGlzQ21ha2VDb25maWd1cmVQcm9iZUxpbmUobGluZTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdGlmICghbGluZS5zdGFydHNXaXRoKCctLSAnKVxuXHRcdHx8IHJlZ2V4VGVzdChcblx0XHRcdFN0cmluZy5yYXdgXi0tICg/OkNvbmZpZ3VyaW5nIGRvbmV8R2VuZXJhdGluZyBkb25lfEJ1aWxkIGZpbGVzIGhhdmUgYmVlbiB3cml0dGVuIHRvOilgLFxuXHRcdFx0bGluZSxcblx0XHQpXG5cdCkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHJldHVybiByZWdleFRlc3QoU3RyaW5nLnJhd2BeLS0gUGVyZm9ybWluZyBUZXN0IFxcUysoPzogLSBTdWNjZXNzKT8kYCwgbGluZSlcblx0XHR8fCBpc0NtYWtlTG9va2luZ0ZvclByb2JlTGluZShsaW5lKVxuXHRcdHx8IHJlZ2V4VGVzdChTdHJpbmcucmF3YF4tLSBEZXRlY3RpbmcgLisoPzogLSBkb25lKT8kYCwgbGluZSlcblx0XHR8fCByZWdleFRlc3QoU3RyaW5nLnJhd2BeLS0gQ2hlY2soPzppbmcpPyAuKyg/OiAtIGRvbmUpPyRgLCBsaW5lKVxuXHRcdHx8IHJlZ2V4VGVzdChcblx0XHRcdFN0cmluZy5yYXdgXi0tIENoZWNrIGZvciB3b3JraW5nIFxcUysgY29tcGlsZXI6IC4rKD86IC0gKD86c2tpcHBlZHx3b3JrcykpPyRgLFxuXHRcdFx0bGluZSxcblx0XHQpO1xufVxuXG5mdW5jdGlvbiBpc0NtYWtlTG9va2luZ0ZvclByb2JlTGluZShsaW5lOiBzdHJpbmcpOiBib29sZWFuIHtcblx0cmV0dXJuICFsaW5lLmVuZHNXaXRoKCcgLSBub3QgZm91bmQnKSAmJiByZWdleFRlc3QoU3RyaW5nLnJhd2BeLS0gTG9va2luZyBmb3IgLisoPzogLSBmb3VuZCk/JGAsIGxpbmUpO1xufVxuXG4vLyNlbmRyZWdpb25cblxuLy8jcmVnaW9uIHNoZWxsX291dHB1dF9jb21wYWN0b3IucnMgXHUyMDE0IG1hdmVuLCBnb2xhbmdjaS1saW50LCBnaXQgcHJvZ3Jlc3MsIGpzLXRlc3RcblxuZnVuY3Rpb24gY29tcGFjdE1hdmVuRGVwZW5kZW5jeVRyYW5zZmVyKG91dHB1dDogc3RyaW5nKTogc3RyaW5nIHtcblx0aWYgKCFoYXNNYXZlbkRlcGVuZGVuY3lUcmFuc2ZlcihvdXRwdXQpKSB7XG5cdFx0cmV0dXJuIG91dHB1dDtcblx0fVxuXHRyZXR1cm4gY29sbGFwc2VSdW5zV2l0aEV4YW1wbGVzKFxuXHRcdG91dHB1dCxcblx0XHRpc01hdmVuRGVwZW5kZW5jeVRyYW5zZmVyTGluZSxcblx0XHRtYXZlbkRlcGVuZGVuY3lUcmFuc2ZlckV4YW1wbGUsXG5cdFx0KGxlbiwgZXhhbXBsZXMpID0+IGBbbWF2ZW4gZGVwZW5kZW5jeSB0cmFuc2Zlcjogb21pdHRlZCAke2xlbn0gcm93KHMpOyBleGFtcGxlczogJHtleGFtcGxlc31dYCxcblx0KTtcbn1cblxuZnVuY3Rpb24gY29tcGFjdE1hdmVuUGFzc2luZ1Rlc3RzKG91dHB1dDogc3RyaW5nKTogc3RyaW5nIHtcblx0aWYgKCFoYXNNYXZlblBhc3NpbmdUZXN0cyhvdXRwdXQpKSB7XG5cdFx0cmV0dXJuIG91dHB1dDtcblx0fVxuXHRyZXR1cm4gY29sbGFwc2VSdW5zV2l0aEV4YW1wbGVzKFxuXHRcdG91dHB1dCxcblx0XHRpc01hdmVuUGFzc2luZ1Rlc3RMaW5lLFxuXHRcdG1hdmVuUGFzc2luZ1Rlc3RFeGFtcGxlLFxuXHRcdChsZW4sIGV4YW1wbGVzKSA9PiBgW21hdmVuIHRlc3Qgc3VtbWFyeTogb21pdHRlZCAke2xlbn0gcGFzc2luZyBjbGFzcyByb3cocyk7IGV4YW1wbGVzOiAke2V4YW1wbGVzfV1gLFxuXHQpO1xufVxuXG5mdW5jdGlvbiBjb21wYWN0TWF2ZW5JbmZvQm9pbGVycGxhdGUob3V0cHV0OiBzdHJpbmcpOiBzdHJpbmcge1xuXHRpZiAoIWhhc01hdmVuSW5mb0JvaWxlcnBsYXRlKG91dHB1dCkpIHtcblx0XHRyZXR1cm4gb3V0cHV0O1xuXHR9XG5cdHJldHVybiBvbWl0TWF0Y2hpbmdMaW5lcyhcblx0XHRvdXRwdXQsXG5cdFx0J21hdmVuIGJvaWxlcnBsYXRlJyxcblx0XHRpc01hdmVuSW5mb0JvaWxlcnBsYXRlTGluZSxcblx0XHQnYm9pbGVycGxhdGUnLFxuXHQpO1xufVxuXG5mdW5jdGlvbiBoYXNNYXZlbkRlcGVuZGVuY3lUcmFuc2ZlcihvdXRwdXQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gaXNNYXZlbk91dHB1dChvdXRwdXQpXG5cdFx0JiYgb3V0cHV0LnNwbGl0KCdcXG4nKS5zb21lKGxpbmUgPT5cblx0XHRcdGxpbmUuc3RhcnRzV2l0aCgnW0lORk9dIERvd25sb2FkaW5nIGZyb20gJykgfHwgbGluZS5zdGFydHNXaXRoKCdbSU5GT10gRG93bmxvYWRlZCBmcm9tICcpKTtcbn1cblxuZnVuY3Rpb24gaGFzTWF2ZW5QYXNzaW5nVGVzdHMob3V0cHV0OiBzdHJpbmcpOiBib29sZWFuIHtcblx0cmV0dXJuIGlzTWF2ZW5PdXRwdXQob3V0cHV0KVxuXHRcdCYmIG91dHB1dC5zcGxpdCgnXFxuJykuc29tZShsaW5lID0+XG5cdFx0XHRsaW5lLnN0YXJ0c1dpdGgoJ1tJTkZPXSBUZXN0cyBydW46ICcpICYmIGxpbmUuaW5jbHVkZXMoJywgRmFpbHVyZXM6IDAsIEVycm9yczogMCwgU2tpcHBlZDogJykpO1xufVxuXG5mdW5jdGlvbiBoYXNNYXZlbkluZm9Cb2lsZXJwbGF0ZShvdXRwdXQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gaXNNYXZlbk91dHB1dChvdXRwdXQpICYmIG91dHB1dC5zcGxpdCgnXFxuJykuc29tZShsaW5lID0+IGlzTWF2ZW5JbmZvQm9pbGVycGxhdGVMaW5lKGxpbmUpKTtcbn1cblxuZnVuY3Rpb24gaXNNYXZlbk91dHB1dChvdXRwdXQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gb3V0cHV0LnNwbGl0KCdcXG4nKS5zb21lKGxpbmUgPT5cblx0XHRsaW5lLnN0YXJ0c1dpdGgoJ1tJTkZPXSBTY2FubmluZyBmb3IgcHJvamVjdHMuLi4nKVxuXHRcdHx8IGxpbmUuc3RhcnRzV2l0aCgnW0lORk9dIEJVSUxEIFNVQ0NFU1MnKVxuXHRcdHx8IGxpbmUuc3RhcnRzV2l0aCgnW0lORk9dIEJVSUxEIEZBSUxVUkUnKVxuXHRcdHx8IGxpbmUuc3RhcnRzV2l0aCgnW0lORk9dIFJlYWN0b3IgQnVpbGQgT3JkZXI6Jylcblx0XHR8fCBsaW5lLnN0YXJ0c1dpdGgoJ1tJTkZPXSBUb3RhbCB0aW1lOicpKTtcbn1cblxuZnVuY3Rpb24gaXNNYXZlbkRlcGVuZGVuY3lUcmFuc2ZlckxpbmUobGluZTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiByZWdleFRlc3QoXG5cdFx0U3RyaW5nLnJhd2BeXFxbSU5GT1xcXSAoPzpEb3dubG9hZGluZ3xEb3dubG9hZGVkKSBmcm9tIFxcUys6IGh0dHBzPzovL1xcUysoPzogXFwoW14pXStcXCkpPyRgLFxuXHRcdGxpbmUsXG5cdCk7XG59XG5cbmZ1bmN0aW9uIG1hdmVuRGVwZW5kZW5jeVRyYW5zZmVyRXhhbXBsZShsaW5lOiBzdHJpbmcpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRjb25zdCBzcGxpdCA9IHJzcGxpdE9uY2UobGluZSwgJyAoJyk7XG5cdGNvbnN0IHdpdGhvdXRTaXplID0gc3BsaXQgIT09IHVuZGVmaW5lZCA/IHNwbGl0WzBdIDogbGluZTtcblx0Y29uc3QgcGFydHMgPSB3aXRob3V0U2l6ZS5zcGxpdCgnLycpO1xuXHRpZiAocGFydHMubGVuZ3RoIDwgMykge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0Y29uc3QgdmVyc2lvbiA9IHBhcnRzW3BhcnRzLmxlbmd0aCAtIDJdO1xuXHRjb25zdCBuYW1lID0gcGFydHNbcGFydHMubGVuZ3RoIC0gM107XG5cdHJldHVybiBgJHtuYW1lfSAke3ZlcnNpb259YDtcbn1cblxuZnVuY3Rpb24gaXNNYXZlblBhc3NpbmdUZXN0TGluZShsaW5lOiBzdHJpbmcpOiBib29sZWFuIHtcblx0cmV0dXJuIHJlZ2V4VGVzdChcblx0XHRTdHJpbmcucmF3YF5cXFtJTkZPXFxdIFRlc3RzIHJ1bjogXFxkKywgRmFpbHVyZXM6IDAsIEVycm9yczogMCwgU2tpcHBlZDogXFxkKywgVGltZSBlbGFwc2VkOiBcXFMrXFxzK3MoPzpcXHMrKD86LS18LSlcXHMraW5cXHMrXFxTKyk/JGAsXG5cdFx0bGluZSxcblx0KTtcbn1cblxuZnVuY3Rpb24gbWF2ZW5QYXNzaW5nVGVzdEV4YW1wbGUobGluZTogc3RyaW5nKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0cmV0dXJuIHJlZ2V4Q2FwdHVyZUZpcnN0KFN0cmluZy5yYXdgXFxzKD86LS18LSlcXHMraW5cXHMrKFxcUyspJGAsIGxpbmUpID8/ICdzdW1tYXJ5Jztcbn1cblxuZnVuY3Rpb24gaXNNYXZlbkluZm9Cb2lsZXJwbGF0ZUxpbmUobGluZTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdGNvbnN0IHRyaW1tZWQgPSBsaW5lLnRyaW1FbmQoKTtcblx0cmV0dXJuIHRyaW1tZWQgPT09ICdbSU5GT10nXG5cdFx0fHwgcmVnZXhUZXN0KFN0cmluZy5yYXdgXlxcW0lORk9cXF0gLXsyMCx9XFxzKiRgLCB0cmltbWVkKVxuXHRcdHx8IHJlZ2V4VGVzdChTdHJpbmcucmF3YF5cXFtJTkZPXFxdIC17MjAsfVxcW1xccypcXFMrXFxzKlxcXS17MjAsfVxccyokYCwgdHJpbW1lZClcblx0XHR8fCByZWdleFRlc3QoU3RyaW5nLnJhd2BeXFxbSU5GT1xcXSAtezIsfTxcXHMqW14+XFxuXStcXHMqPi17Mix9XFxzKiRgLCB0cmltbWVkKVxuXHRcdHx8IHJlZ2V4VGVzdChTdHJpbmcucmF3YF5cXFtJTkZPXFxdIEJ1aWxkaW5nIC4rIFxcW1xcZCsvXFxkK1xcXVxccyokYCwgdHJpbW1lZClcblx0XHR8fCByZWdleFRlc3QoXG5cdFx0XHRTdHJpbmcucmF3YF5cXFtJTkZPXFxdIC0tLSBcXFMrKD86OlxcUyspKyAoPzpcXChbXildK1xcKSApP0AgXFxTKyAtLS1cXHMqJGAsXG5cdFx0XHR0cmltbWVkLFxuXHRcdCk7XG59XG5cbmZ1bmN0aW9uIGNvbXBhY3RHb2xhbmdjaUxpbnRPdXRwdXQob3V0cHV0OiBzdHJpbmcsIHJlcXVpcmVNYXJrZXI6IGJvb2xlYW4pOiBzdHJpbmcge1xuXHRpZiAocmVxdWlyZU1hcmtlciAmJiAhaGFzR29sYW5nY2lMaW50TWFya2VyKG91dHB1dCkpIHtcblx0XHRyZXR1cm4gb3V0cHV0O1xuXHR9XG5cdHJldHVybiBvbWl0Tm9uRGlhZ25vc3RpY0xpbmVzKFxuXHRcdG91dHB1dCxcblx0XHQnZ29sYW5nY2ktbGludCBwcm9ncmVzcycsXG5cdFx0aXNHb2xhbmdjaUxpbnRPbWl0dGFibGVMaW5lLFxuXHQpO1xufVxuXG5mdW5jdGlvbiBoYXNHb2xhbmdjaUxpbnRNYXJrZXIob3V0cHV0OiBzdHJpbmcpOiBib29sZWFuIHtcblx0cmV0dXJuIG91dHB1dC5zcGxpdCgnXFxuJykuc29tZShsaW5lID0+XG5cdFx0cmVnZXhUZXN0KFxuXHRcdFx0U3RyaW5nLnJhd2BeKD86Z28gcnVuIGdpdGh1YlxcLmNvbS9nb2xhbmdjaS9nb2xhbmdjaS1saW50L2NtZC9nb2xhbmdjaS1saW50KD86QFxcUyspP3woPzpbQS1aYS16MC05Xy4vKy1dKy8pP2dvbGFuZ2NpLWxpbnQpXFxzK3J1blxcYmAsXG5cdFx0XHRsaW5lLFxuXHRcdCkpXG5cdFx0fHwgKChvdXRwdXQuaW5jbHVkZXMoJ2xldmVsPWluZm8nKSB8fCBvdXRwdXQuaW5jbHVkZXMoJ0lORk8nKSlcblx0XHRcdCYmIG91dHB1dC5zcGxpdCgnXFxuJykuc29tZShsaW5lID0+IHJlZ2V4VGVzdChTdHJpbmcucmF3YF4oPzpsZXZlbD1pbmZvXFxifElORk9cXGIpYCwgbGluZSkpXG5cdFx0XHQmJiBvdXRwdXQuc3BsaXQoJ1xcbicpLnNvbWUobGluZSA9PiBoYXNHb2xhbmdjaUxpbnRTYWZlSW5mb1ByZWZpeChsaW5lKSkpO1xufVxuXG5mdW5jdGlvbiBpc0dvbGFuZ2NpTGludE9taXR0YWJsZUxpbmUobGluZTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdGlmIChpc0RpYWdub3N0aWNMaW5lKGxpbmUpKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdHJldHVybiBpc0dvTW9kdWxlRG93bmxvYWRDaGF0dGVyTGluZShsaW5lKVxuXHRcdHx8IChyZWdleFRlc3QoU3RyaW5nLnJhd2BeKD86bGV2ZWw9aW5mb1xcYnxJTkZPXFxiKWAsIGxpbmUpICYmIGhhc0dvbGFuZ2NpTGludFNhZmVJbmZvUHJlZml4KGxpbmUpKTtcbn1cblxuZnVuY3Rpb24gaGFzR29sYW5nY2lMaW50U2FmZUluZm9QcmVmaXgobGluZTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiByZWdleFRlc3QoXG5cdFx0U3RyaW5nLnJhd2BcXFsoPzpjb25maWdfcmVhZGVyfGxpbnRlcnNkYnxsb2FkZXJ8cnVubmVyfGxpbnRlcnNfY29udGV4dHxmaWxlbmFtZV91bmFkanVzdGVyfHVuaXFfYnlfbGluZXxzb3VyY2VfY29kZSlcXGJgLFxuXHRcdGxpbmUsXG5cdCk7XG59XG5cbmZ1bmN0aW9uIGNvbXBhY3RHaXRQcm9ncmVzcyhvdXRwdXQ6IHN0cmluZyk6IHN0cmluZyB7XG5cdGNvbnN0IGxpbmVzID0gb3V0cHV0LnNwbGl0KCdcXG4nKS5tYXAobGluZSA9PiBjb21wYWN0R2l0UHJvZ3Jlc3NMaW5lKGxpbmUpKTtcblx0Y29uc3QgY29tcGFjdGVkOiBzdHJpbmdbXSA9IFtdO1xuXHRsZXQgaSA9IDA7XG5cdHdoaWxlIChpIDwgbGluZXMubGVuZ3RoKSB7XG5cdFx0Y29uc3QgbGluZSA9IGxpbmVzW2ldO1xuXHRcdGNvbnN0IHByb2dyZXNzS2V5ID0gZ2V0R2l0UHJvZ3Jlc3NMaW5lS2V5KGxpbmUub3V0cHV0KTtcblx0XHRpZiAocHJvZ3Jlc3NLZXkgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cHVzaENvbXBhY3RlZExpbmUoY29tcGFjdGVkLCBsaW5lKTtcblx0XHRcdGkgKz0gMTtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblxuXHRcdGxldCBqID0gaSArIDE7XG5cdFx0d2hpbGUgKGogPCBsaW5lcy5sZW5ndGggJiYgZ2V0R2l0UHJvZ3Jlc3NMaW5lS2V5KGxpbmVzW2pdLm91dHB1dCkgPT09IHByb2dyZXNzS2V5KSB7XG5cdFx0XHRqICs9IDE7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgb21pdHRlZExpbmVzID0gaiAtIGkgLSAxO1xuXHRcdGlmIChvbWl0dGVkTGluZXMgPiAwKSB7XG5cdFx0XHRjb21wYWN0ZWQucHVzaChgW2dpdCBwcm9ncmVzczogb21pdHRlZCAke29taXR0ZWRMaW5lc30gZWFybGllciAke3Byb2dyZXNzS2V5fSBsaW5lKHMpXWApO1xuXHRcdFx0Y29tcGFjdGVkLnB1c2gobGluZXNbaiAtIDFdLm91dHB1dCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHB1c2hDb21wYWN0ZWRMaW5lKGNvbXBhY3RlZCwgbGluZSk7XG5cdFx0fVxuXHRcdGkgPSBqO1xuXHR9XG5cdHJldHVybiBjb21wYWN0ZWQuam9pbignXFxuJyk7XG59XG5cbmludGVyZmFjZSBDb21wYWN0ZWRMaW5lIHtcblx0b3V0cHV0OiBzdHJpbmc7XG5cdG9taXR0ZWRGcmFtZXM6IG51bWJlcjtcbn1cblxuZnVuY3Rpb24gdW5jaGFuZ2VkTGluZShsaW5lOiBzdHJpbmcpOiBDb21wYWN0ZWRMaW5lIHtcblx0cmV0dXJuIHsgb3V0cHV0OiBsaW5lLCBvbWl0dGVkRnJhbWVzOiAwIH07XG59XG5cbmZ1bmN0aW9uIHB1c2hDb21wYWN0ZWRMaW5lKGNvbXBhY3RlZDogc3RyaW5nW10sIGxpbmU6IENvbXBhY3RlZExpbmUpOiB2b2lkIHtcblx0aWYgKGxpbmUub21pdHRlZEZyYW1lcyA+IDApIHtcblx0XHRjb21wYWN0ZWQucHVzaChgW2dpdCBwcm9ncmVzczogb21pdHRlZCAke2xpbmUub21pdHRlZEZyYW1lc30gZWFybGllciBmcmFtZShzKV1gKTtcblx0fVxuXHRjb21wYWN0ZWQucHVzaChsaW5lLm91dHB1dCk7XG59XG5cbmZ1bmN0aW9uIGNvbXBhY3RHaXRQcm9ncmVzc0xpbmUobGluZTogc3RyaW5nKTogQ29tcGFjdGVkTGluZSB7XG5cdHJldHVybiBjb21wYWN0UHJvZ3Jlc3NQYXR0ZXJuc1VubGVzc0RpYWdub3N0aWMoXG5cdFx0bGluZSxcblx0XHRbXG5cdFx0XHRTdHJpbmcucmF3YCg/OnJlbW90ZTogKT8oPzpFbnVtZXJhdGluZ3xDb3VudGluZ3xDb21wcmVzc2luZykgb2JqZWN0czpcXHMrXFxkKyVbXildKlxcKFxcZCsvXFxkK1xcKSg/OiwgZG9uZVxcLik/YCxcblx0XHRcdFN0cmluZy5yYXdgKD86cmVtb3RlOiApP1JlY2VpdmluZyBvYmplY3RzOlxccytcXGQrJVteKV0qXFwoXFxkKy9cXGQrXFwpKD86LCBbXildKik/YCxcblx0XHRcdFN0cmluZy5yYXdgKD86cmVtb3RlOiApP1Jlc29sdmluZyBkZWx0YXM6XFxzK1xcZCslW14pXSpcXChcXGQrL1xcZCtcXCkoPzosIGRvbmVcXC4pP2AsXG5cdFx0XHRTdHJpbmcucmF3YCg/OnJlbW90ZTogKT9Xcml0aW5nIG9iamVjdHM6XFxzK1xcZCslW14pXSpcXChcXGQrL1xcZCtcXCkoPzosIFteKV0qKT9gLFxuXHRcdF0sXG5cdCk7XG59XG5cbmZ1bmN0aW9uIGNvbXBhY3RQcm9ncmVzc1BhdHRlcm5zVW5sZXNzRGlhZ25vc3RpYyhsaW5lOiBzdHJpbmcsIHBhdHRlcm5zOiBzdHJpbmdbXSk6IENvbXBhY3RlZExpbmUge1xuXHRpZiAoaXNEaWFnbm9zdGljTGluZShsaW5lKSkge1xuXHRcdHJldHVybiB1bmNoYW5nZWRMaW5lKGxpbmUpO1xuXHR9XG5cdHJldHVybiBjb21wYWN0UHJvZ3Jlc3NQYXR0ZXJucyhsaW5lLCBwYXR0ZXJucyk7XG59XG5cbmZ1bmN0aW9uIGNvbXBhY3RQcm9ncmVzc1BhdHRlcm5zKGxpbmU6IHN0cmluZywgcGF0dGVybnM6IHN0cmluZ1tdKTogQ29tcGFjdGVkTGluZSB7XG5cdGxldCBvdXRwdXQgPSBsaW5lO1xuXHRsZXQgb21pdHRlZEZyYW1lcyA9IDA7XG5cdGZvciAoY29uc3QgcGF0dGVybiBvZiBwYXR0ZXJucykge1xuXHRcdGNvbnN0IHJlc3VsdCA9IGNvbXBhY3RSZXBlYXRlZFByb2dyZXNzRnJhbWVzKG91dHB1dCwgcGF0dGVybik7XG5cdFx0b3V0cHV0ID0gcmVzdWx0Lm91dHB1dDtcblx0XHRvbWl0dGVkRnJhbWVzICs9IHJlc3VsdC5vbWl0dGVkRnJhbWVzO1xuXHR9XG5cdHJldHVybiB7IG91dHB1dCwgb21pdHRlZEZyYW1lcyB9O1xufVxuXG5mdW5jdGlvbiBjb21wYWN0UmVwZWF0ZWRQcm9ncmVzc0ZyYW1lcyhsaW5lOiBzdHJpbmcsIHBhdHRlcm46IHN0cmluZyk6IENvbXBhY3RlZExpbmUge1xuXHRjb25zdCBtYXRjaGVzID0gcmVnZXhGaW5kQWxsKHBhdHRlcm4sIGxpbmUpO1xuXHRpZiAobWF0Y2hlcy5sZW5ndGggPD0gMSkge1xuXHRcdHJldHVybiB1bmNoYW5nZWRMaW5lKGxpbmUpO1xuXHR9XG5cblx0Y29uc3QgZmlyc3QgPSBtYXRjaGVzWzBdO1xuXHRjb25zdCBsYXN0ID0gbWF0Y2hlc1ttYXRjaGVzLmxlbmd0aCAtIDFdO1xuXHRjb25zdCBvdXRwdXQgPSBsaW5lLnNsaWNlKDAsIGZpcnN0LnN0YXJ0KSArIGxpbmUuc2xpY2UobGFzdC5zdGFydCwgbGFzdC5lbmQpICsgbGluZS5zbGljZShsYXN0LmVuZCk7XG5cdHJldHVybiB7IG91dHB1dCwgb21pdHRlZEZyYW1lczogbWF0Y2hlcy5sZW5ndGggLSAxIH07XG59XG5cbmZ1bmN0aW9uIGdldEdpdFByb2dyZXNzTGluZUtleShsaW5lOiBzdHJpbmcpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRpZiAoaXNEaWFnbm9zdGljTGluZShsaW5lKSkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0Y29uc3Qgc3RyaXBwZWQgPSBzdHJpcFByZWZpeChsaW5lLCAncmVtb3RlOicpO1xuXHRjb25zdCBub3JtYWxpemVkID0gc3RyaXBwZWQgIT09IHVuZGVmaW5lZCA/IHN0cmlwcGVkLnRyaW1TdGFydCgpIDogbGluZTtcblx0Y29uc3Qgc3BsaXQgPSBzcGxpdE9uY2Uobm9ybWFsaXplZCwgJzonKTtcblx0aWYgKHNwbGl0ID09PSB1bmRlZmluZWQpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGNvbnN0IGtleSA9IHNwbGl0WzBdO1xuXHRjb25zdCByZXN0ID0gc3BsaXRbMV07XG5cdGlmICghW1xuXHRcdCdFbnVtZXJhdGluZyBvYmplY3RzJyxcblx0XHQnQ291bnRpbmcgb2JqZWN0cycsXG5cdFx0J0NvbXByZXNzaW5nIG9iamVjdHMnLFxuXHRcdCdSZWNlaXZpbmcgb2JqZWN0cycsXG5cdFx0J1dyaXRpbmcgb2JqZWN0cycsXG5cdFx0J1Jlc29sdmluZyBkZWx0YXMnLFxuXHRdLmluY2x1ZGVzKGtleSkpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGlmIChyZWdleFRlc3QoU3RyaW5nLnJhd2BeXFxzK1xcZCslYCwgcmVzdCkpIHtcblx0XHRyZXR1cm4ga2V5O1xuXHR9XG5cdHJldHVybiB1bmRlZmluZWQ7XG59XG5cbmZ1bmN0aW9uIGNvbXBhY3RKc1Rlc3RPdXRwdXQob3V0cHV0OiBzdHJpbmcpOiBzdHJpbmcge1xuXHRsZXQgY29tcGFjdGVkID0gY29tcGFjdFJlcGVhdGVkTm9kZVdhcm5pbmdzKG91dHB1dCk7XG5cdGNvbXBhY3RlZCA9IGNvbXBhY3RKZXN0UnVuc1Byb2dyZXNzKGNvbXBhY3RlZCk7XG5cdGlmIChoYXNQYXNzaW5nSnNUZXN0U3VtbWFyeShjb21wYWN0ZWQpKSB7XG5cdFx0Y29tcGFjdGVkID0gb21pdE5vbkRpYWdub3N0aWNMaW5lcyhjb21wYWN0ZWQsICdqcyB0ZXN0IHByb2dyZXNzJywgaXNKc1Rlc3RQcm9ncmVzc0xpbmUpO1xuXHR9XG5cdHJldHVybiBjb21wYWN0ZWQ7XG59XG5cbmZ1bmN0aW9uIGNvbXBhY3RKZXN0UnVuc1Byb2dyZXNzKG91dHB1dDogc3RyaW5nKTogc3RyaW5nIHtcblx0aWYgKCFoYXNKZXN0UnVuc1Byb2dyZXNzKG91dHB1dCkpIHtcblx0XHRyZXR1cm4gb3V0cHV0O1xuXHR9XG5cdHJldHVybiBvbWl0TWF0Y2hpbmdMaW5lcyhcblx0XHRvdXRwdXQsXG5cdFx0J2plc3QgcnVucyBwcm9ncmVzcycsXG5cdFx0aXNKZXN0UnVuc1Byb2dyZXNzTGluZSxcblx0XHQncHJvZ3Jlc3MnLFxuXHQpO1xufVxuXG4vLyNlbmRyZWdpb25cblxuZnVuY3Rpb24gaGFzUGFzc2luZ0pzVGVzdFN1bW1hcnkob3V0cHV0OiBzdHJpbmcpOiBib29sZWFuIHtcblx0aWYgKHJlZ2V4VGVzdChTdHJpbmcucmF3YCg/Ol58XFxuKVxccyooPzpGQUlMfFxcdTI3MTd8XFx1MDBEN3xcXHUyNzE2KVxcc2AsIG91dHB1dClcblx0XHR8fCByZWdleFRlc3RXaXRoRmxhZ3MoU3RyaW5nLnJhd2BcXGJbMS05XVxcZCpcXHMrZmFpbGVkXFxiYCwgb3V0cHV0LCAnaScpXG5cdFx0fHwgcmVnZXhUZXN0KFN0cmluZy5yYXdgKD86XnxcXG4pXFxzKlxcZCtcXHMrZmFpbGluZ1xcYmAsIG91dHB1dClcblx0XHR8fCByZWdleFRlc3QoU3RyaW5nLnJhd2AoPzpefFxcbilcXHMqbm90XFxzK29rXFxzK1xcZCtcXGJgLCBvdXRwdXQpXG5cdFx0fHwgcmVnZXhUZXN0KFN0cmluZy5yYXdgKD86XnxcXG4pI1xccytmYWlsXFxzK1sxLTldXFxkKlxcYmAsIG91dHB1dClcblx0XHR8fCByZWdleFRlc3QoU3RyaW5nLnJhd2AoPzpefFxcbilcXHMqQmFpbCBvdXQhYCwgb3V0cHV0KVxuXHRcdHx8IHJlZ2V4VGVzdChTdHJpbmcucmF3YCg/Ol58XFxuKS4qRVJSIWAsIG91dHB1dClcblx0KSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdHJldHVybiByZWdleFRlc3RXaXRoRmxhZ3MoXG5cdFx0U3RyaW5nLnJhd2AoPzpefFxcbilcXHMqKD86VGVzdCBGaWxlc3xUZXN0cz86fFRlc3QgU3VpdGVzOilcXHMrXFxkK1xccytwYXNzZWRcXGJgLFxuXHRcdG91dHB1dCxcblx0XHQnaScsXG5cdCkgfHwgcmVnZXhUZXN0KFN0cmluZy5yYXdgKD86XnxcXG4pXFxzK1xcZCtcXHMrcGFzc2luZ1xcYmAsIG91dHB1dClcblx0XHR8fCByZWdleFRlc3QoU3RyaW5nLnJhd2AoPzpefFxcbikjXFxzK29rXFxiYCwgb3V0cHV0KVxuXHRcdHx8IHJlZ2V4VGVzdChTdHJpbmcucmF3YCg/Ol58XFxuKSNcXHMrcGFzc1xccytbMS05XVxcZCpcXGJgLCBvdXRwdXQpO1xufVxuXG5mdW5jdGlvbiBoYXNKZXN0UnVuc1Byb2dyZXNzKG91dHB1dDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiBvdXRwdXQuc3BsaXQoJ1xcbicpLnNvbWUobGluZSA9PiByZWdleFRlc3QoU3RyaW5nLnJhd2BeXFxzKlJVTlNcXHMrXFxTYCwgbGluZSkpXG5cdFx0JiYgaGFzSmVzdFN1bW1hcnlNYXJrZXIob3V0cHV0KTtcbn1cblxuZnVuY3Rpb24gaGFzSmVzdFN1bW1hcnlNYXJrZXIob3V0cHV0OiBzdHJpbmcpOiBib29sZWFuIHtcblx0cmV0dXJuIG91dHB1dC5zcGxpdCgnXFxuJykuc29tZShsaW5lID0+XG5cdFx0bGluZS5zdGFydHNXaXRoKCdUZXN0IFN1aXRlczonKVxuXHRcdHx8IGxpbmUuc3RhcnRzV2l0aCgnVGVzdHM6Jylcblx0XHR8fCBsaW5lLnN0YXJ0c1dpdGgoJ1NuYXBzaG90czonKVxuXHRcdHx8IGxpbmUuc3RhcnRzV2l0aCgnUmFuIGFsbCB0ZXN0IHN1aXRlcycpKTtcbn1cblxuZnVuY3Rpb24gaXNKZXN0UnVuc1Byb2dyZXNzTGluZShsaW5lOiBzdHJpbmcpOiBib29sZWFuIHtcblx0cmV0dXJuIHJlZ2V4VGVzdChTdHJpbmcucmF3YF5cXHMqUlVOU1xccytcXFNgLCBsaW5lKTtcbn1cblxuZnVuY3Rpb24gaXNKc1Rlc3RQcm9ncmVzc0xpbmUobGluZTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiAhaXNEaWFnbm9zdGljTGluZShsaW5lKVxuXHRcdCYmIChyZWdleFRlc3QoU3RyaW5nLnJhd2BeXFxzKlJVTlxccyt2P1xcZCtcXC5cXGQrXFwuXFxkK2AsIGxpbmUpXG5cdFx0XHR8fCByZWdleFRlc3QoU3RyaW5nLnJhd2BeXFxzKig/OlxcdTI3MTN8XFx1MjcxNHxcXHUyMjFBKVxccysuKyg/OlxccytcXGQrbXN8XFxzK1xcKFxcZCsoPzptc3xzKVxcKSkkYCwgbGluZSlcblx0XHRcdHx8IHJlZ2V4VGVzdChTdHJpbmcucmF3YF5cXHMqUEFTU1xccysuKyRgLCBsaW5lKVxuXHRcdFx0fHwgcmVnZXhUZXN0KFN0cmluZy5yYXdgXlxccypva1xccytcXGQrXFxiYCwgbGluZSlcblx0XHRcdHx8IHJlZ2V4VGVzdChTdHJpbmcucmF3YF5bLl0rKD86XFxzK1xcW1xccypcXGQrJVxcXSk/XFxzKiRgLCBsaW5lKSk7XG59XG5cbmZ1bmN0aW9uIGNvbXBhY3RHcmFkbGVPdXRwdXQob3V0cHV0OiBzdHJpbmcpOiBzdHJpbmcge1xuXHRjb25zdCBjb21wYWN0ZWQgPSBjb21wYWN0SW50cmFsaW5lUHJvZ3Jlc3MoXG5cdFx0b3V0cHV0LFxuXHRcdCdncmFkbGUgcmljaC1jb25zb2xlIHByb2dyZXNzJyxcblx0XHRjb21wYWN0R3JhZGxlUHJvZ3Jlc3NGcmFtZXMsXG5cdCk7XG5cdHJldHVybiBvbWl0Tm9uRGlhZ25vc3RpY0xpbmVzKGNvbXBhY3RlZCwgJ2dyYWRsZSBib2lsZXJwbGF0ZScsIGlzR3JhZGxlQm9pbGVycGxhdGVMaW5lKTtcbn1cblxuZnVuY3Rpb24gY29tcGFjdEludHJhbGluZVByb2dyZXNzKFxuXHRvdXRwdXQ6IHN0cmluZyxcblx0bGFiZWw6IHN0cmluZyxcblx0Y29tcGFjdExpbmU6IChsaW5lOiBzdHJpbmcpID0+IENvbXBhY3RlZExpbmUsXG4pOiBzdHJpbmcge1xuXHRsZXQgb21pdHRlZEZyYW1lcyA9IDA7XG5cdGNvbnN0IGNvbXBhY3RlZCA9IG91dHB1dFxuXHRcdC5zcGxpdCgnXFxuJylcblx0XHQubWFwKGxpbmUgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gY29tcGFjdExpbmUobGluZSk7XG5cdFx0XHRvbWl0dGVkRnJhbWVzICs9IHJlc3VsdC5vbWl0dGVkRnJhbWVzO1xuXHRcdFx0cmV0dXJuIHJlc3VsdC5vdXRwdXQ7XG5cdFx0fSlcblx0XHQuam9pbignXFxuJyk7XG5cdGlmIChvbWl0dGVkRnJhbWVzID09PSAwKSB7XG5cdFx0cmV0dXJuIG91dHB1dDtcblx0fVxuXHRyZXR1cm4gYFske2xhYmVsfTogb21pdHRlZCAke29taXR0ZWRGcmFtZXN9IGVhcmxpZXIgZnJhbWUocyldXFxuJHtjb21wYWN0ZWR9YDtcbn1cblxuZnVuY3Rpb24gY29tcGFjdEdyYWRsZVByb2dyZXNzRnJhbWVzKGxpbmU6IHN0cmluZyk6IENvbXBhY3RlZExpbmUge1xuXHRpZiAoaXNEaWFnbm9zdGljTGluZShsaW5lKSkge1xuXHRcdHJldHVybiB1bmNoYW5nZWRMaW5lKGxpbmUpO1xuXHR9XG5cblx0Y29uc3QgbWF0Y2hlcyA9IHJlZ2V4RmluZEFsbChcblx0XHRTdHJpbmcucmF3YCg/OjxbLT1dKz58XFx1MjUwMlteXFx1MjUwMlxcbl0rXFx1MjUwMilcXHMrXFxkKyVcXHMrKD86SU5JVElBTElaSU5HfENPTkZJR1VSSU5HfEVYRUNVVElOR3xXQUlUSU5HKVxccytcXFtbXlxcXVxcbl0rXFxdYCxcblx0XHRsaW5lLFxuXHQpO1xuXHRpZiAobWF0Y2hlcy5sZW5ndGggPD0gMSkge1xuXHRcdHJldHVybiB1bmNoYW5nZWRMaW5lKGxpbmUpO1xuXHR9XG5cblx0bGV0IG91dHB1dCA9ICcnO1xuXHRsZXQgY3Vyc29yID0gMDtcblx0bGV0IG9taXR0ZWRGcmFtZXMgPSAwO1xuXHRsZXQgc3RhcnQgPSAwO1xuXHR3aGlsZSAoc3RhcnQgPCBtYXRjaGVzLmxlbmd0aCkge1xuXHRcdGxldCBlbmQgPSBzdGFydDtcblx0XHR3aGlsZSAoZW5kICsgMSA8IG1hdGNoZXMubGVuZ3RoXG5cdFx0XHQmJiBpc0dyYWRsZVByb2dyZXNzRnJhbWVTZXBhcmF0b3IobGluZSwgbWF0Y2hlc1tlbmRdLCBtYXRjaGVzW2VuZCArIDFdKVxuXHRcdCkge1xuXHRcdFx0ZW5kICs9IDE7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc3RhcnRSYW5nZSA9IG1hdGNoZXNbc3RhcnRdO1xuXHRcdGNvbnN0IGVuZFJhbmdlID0gbWF0Y2hlc1tlbmRdO1xuXHRcdGlmIChlbmQgPiBzdGFydCkge1xuXHRcdFx0b3V0cHV0ICs9IGxpbmUuc2xpY2UoY3Vyc29yLCBzdGFydFJhbmdlLnN0YXJ0KTtcblx0XHRcdG91dHB1dCArPSBsaW5lLnNsaWNlKGVuZFJhbmdlLnN0YXJ0LCBlbmRSYW5nZS5lbmQpO1xuXHRcdFx0b21pdHRlZEZyYW1lcyArPSBlbmQgLSBzdGFydDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0b3V0cHV0ICs9IGxpbmUuc2xpY2UoY3Vyc29yLCBlbmRSYW5nZS5lbmQpO1xuXHRcdH1cblx0XHRjdXJzb3IgPSBlbmRSYW5nZS5lbmQ7XG5cdFx0c3RhcnQgPSBlbmQgKyAxO1xuXHR9XG5cdG91dHB1dCArPSBsaW5lLnNsaWNlKGN1cnNvcik7XG5cdHJldHVybiB7IG91dHB1dCwgb21pdHRlZEZyYW1lcyB9O1xufVxuXG5mdW5jdGlvbiBpc0dyYWRsZVByb2dyZXNzRnJhbWVTZXBhcmF0b3IoXG5cdGxpbmU6IHN0cmluZyxcblx0cHJldmlvdXM6IHsgc3RhcnQ6IG51bWJlcjsgZW5kOiBudW1iZXIgfSxcblx0bmV4dDogeyBzdGFydDogbnVtYmVyOyBlbmQ6IG51bWJlciB9LFxuKTogYm9vbGVhbiB7XG5cdGNvbnN0IHNlcGFyYXRvciA9IGxpbmUuc2xpY2UocHJldmlvdXMuZW5kLCBuZXh0LnN0YXJ0KTtcblx0aWYgKHNlcGFyYXRvci5sZW5ndGggPT09IDApIHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXHRmb3IgKGxldCBpID0gMDsgaSA8IHNlcGFyYXRvci5sZW5ndGg7IGkgKz0gNikge1xuXHRcdGlmIChzZXBhcmF0b3Iuc2xpY2UoaSwgaSArIDYpICE9PSAnPiBJRExFJykge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gdHJ1ZTtcbn1cblxuZnVuY3Rpb24gaXNHcmFkbGVCb2lsZXJwbGF0ZUxpbmUobGluZTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiAobGluZS5zdGFydHNXaXRoKCdDb25zaWRlciBlbmFibGluZyBjb25maWd1cmF0aW9uIGNhY2hlIHRvIHNwZWVkIHVwIHRoaXMgYnVpbGQ6IGh0dHBzOi8vZG9jcy5ncmFkbGUub3JnLycpXG5cdFx0JiYgbGluZS5lbmRzV2l0aCgnL3VzZXJndWlkZS9jb25maWd1cmF0aW9uX2NhY2hlX2VuYWJsaW5nLmh0bWwnKSlcblx0XHR8fCBsaW5lID09PSAnPiBSdW4gd2l0aCAtLXN0YWNrdHJhY2Ugb3B0aW9uIHRvIGdldCB0aGUgc3RhY2sgdHJhY2UuJ1xuXHRcdHx8IGxpbmUgPT09ICc+IFJ1biB3aXRoIC0taW5mbyBvciAtLWRlYnVnIG9wdGlvbiB0byBnZXQgbW9yZSBsb2cgb3V0cHV0Lidcblx0XHR8fCBsaW5lID09PSAnPiBSdW4gd2l0aCAtLXNjYW4gdG8gZ2V0IGZ1bGwgaW5zaWdodHMgZnJvbSBhIEJ1aWxkIFNjYW4gKHBvd2VyZWQgYnkgRGV2ZWxvY2l0eSkuJ1xuXHRcdHx8IGxpbmUgPT09ICc+IEdldCBtb3JlIGhlbHAgYXQgaHR0cHM6Ly9oZWxwLmdyYWRsZS5vcmcuJztcbn1cblxuZnVuY3Rpb24gY29tcGFjdFV2UHJvZ3Jlc3Mob3V0cHV0OiBzdHJpbmcpOiBzdHJpbmcge1xuXHRpZiAoIShoYXNVdlN1bW1hcnlNYXJrZXIob3V0cHV0KSAmJiBvdXRwdXQuc3BsaXQoJ1xcbicpLnNvbWUobGluZSA9PiBpc1V2UHJvZ3Jlc3NMaW5lKGxpbmUpKSkpIHtcblx0XHRyZXR1cm4gb3V0cHV0O1xuXHR9XG5cdGNvbnN0IGNvbXBhY3RlZCA9IGNvbGxhcHNlQ29udGlndW91c1J1bnMob3V0cHV0LCBpc1V2UHJvZ3Jlc3NMaW5lLCA0LCBibG9jayA9PiB7XG5cdFx0Y29uc3QgZXhhbXBsZXM6IHN0cmluZ1tdID0gW107XG5cdFx0Zm9yIChjb25zdCBsaW5lIG9mIGJsb2NrKSB7XG5cdFx0XHRjb25zdCBleGFtcGxlID0gdXZQcm9ncmVzc0V4YW1wbGUobGluZSk7XG5cdFx0XHRpZiAoZXhhbXBsZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdGV4YW1wbGVzLnB1c2goZXhhbXBsZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmIChleGFtcGxlcy5sZW5ndGggIT09IGJsb2NrLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgYWN0aXZpdHlMaXN0OiBzdHJpbmdbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgbGluZSBvZiBibG9jaykge1xuXHRcdFx0Y29uc3QgYWN0aXZpdHkgPSB1dlByb2dyZXNzQWN0aXZpdHkobGluZSk7XG5cdFx0XHRpZiAoYWN0aXZpdHkgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRhY3Rpdml0eUxpc3QucHVzaChhY3Rpdml0eSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGNvbnN0IGFjdGl2aXRpZXMgPSB1bmlxdWVTdHJpbmdzKGFjdGl2aXR5TGlzdCk7XG5cdFx0Y29uc3QgYWN0aXZpdHlTdW1tYXJ5ID0gYWN0aXZpdGllcy5sZW5ndGggPT09IDBcblx0XHRcdD8gJydcblx0XHRcdDogYDsgYWN0aXZlOiAke3N1bW1hcml6ZVdpdGhNb3JlKGFjdGl2aXRpZXMsIDUpfWA7XG5cdFx0cmV0dXJuIGBbdXYgcHJvZ3Jlc3M6IG9taXR0ZWQgJHtibG9jay5sZW5ndGh9IHJvdyhzKTsgZXhhbXBsZXM6ICR7c3VtbWFyaXplV2l0aE1vcmUodW5pcXVlU3RyaW5ncyhleGFtcGxlcyksIDEwKX0ke2FjdGl2aXR5U3VtbWFyeX1dYDtcblx0fSk7XG5cdHJldHVybiBjb21wYWN0ZWQucmVwbGFjZSgvXFxuKyQvLCAnJyk7XG59XG5cbmZ1bmN0aW9uIGhhc1V2U3VtbWFyeU1hcmtlcihvdXRwdXQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gb3V0cHV0LnNwbGl0KCdcXG4nKS5zb21lKGxpbmUgPT5cblx0XHQobGluZS5zdGFydHNXaXRoKCdVc2luZyBDUHl0aG9uICcpICYmIGxpbmUuaW5jbHVkZXMoJyBpbnRlcnByZXRlciBhdDonKSlcblx0XHR8fCByZWdleFRlc3QoU3RyaW5nLnJhd2BeKD86UmVzb2x2ZWR8UHJlcGFyZWR8SW5zdGFsbGVkfEF1ZGl0ZWQpIFxcZCsgcGFja2FnZXM/IGluIFxcUytgLCBsaW5lKSk7XG59XG5cbmZ1bmN0aW9uIGlzVXZQcm9ncmVzc0xpbmUobGluZTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdGNvbnN0IG5vcm1hbGl6ZWQgPSBzdHJpcEFuc2kobGluZSkudHJpbSgpO1xuXHRpZiAoaXNEaWFnbm9zdGljTGluZShub3JtYWxpemVkKSkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRyZXR1cm4gcmVnZXhUZXN0KFxuXHRcdFN0cmluZy5yYXdgXltcXHUyODAxLVxcdTI4RkZdXFxzKyg/OlJlc29sdmluZyBkZXBlbmRlbmNpZXN8UHJlcGFyaW5nIHBhY2thZ2VzfEluc3RhbGxpbmcgcGFja2FnZXN8QnVpbGRpbmd8RG93bmxvYWRpbmcpXFxiYCxcblx0XHRub3JtYWxpemVkLFxuXHQpIHx8IHJlZ2V4VGVzdChcblx0XHRTdHJpbmcucmF3YF5bQS1aYS16MC05Xy4tXStcXHMrLXsxMCx9XFxzK1xcZCsoPzpcXC5cXGQrKT9cXHMqKD86QnxLaUJ8TWlCfEdpQnxLQnxNQnxHQikvXFxkKyg/OlxcLlxcZCspP1xccyooPzpCfEtpQnxNaUJ8R2lCfEtCfE1CfEdCKSg/OlxccysuKyk/JGAsXG5cdFx0bm9ybWFsaXplZCxcblx0KTtcbn1cblxuZnVuY3Rpb24gdXZQcm9ncmVzc0V4YW1wbGUobGluZTogc3RyaW5nKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0Y29uc3Qgbm9ybWFsaXplZCA9IHN0cmlwQW5zaShsaW5lKS50cmltKCk7XG5cdGNvbnN0IHBrZyA9IHJlZ2V4Q2FwdHVyZUZpcnN0KFN0cmluZy5yYXdgXihbQS1aYS16MC05Xy4tXSspXFxzKy17MTAsfWAsIG5vcm1hbGl6ZWQpO1xuXHRpZiAocGtnICE9PSB1bmRlZmluZWQpIHtcblx0XHRyZXR1cm4gcGtnO1xuXHR9XG5cdGNvbnN0IGZpcnN0Q29kZVBvaW50ID0gbm9ybWFsaXplZC5jb2RlUG9pbnRBdCgwKTtcblx0aWYgKGZpcnN0Q29kZVBvaW50ID09PSB1bmRlZmluZWQpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGNvbnN0IGZpcnN0Q2hhciA9IFN0cmluZy5mcm9tQ29kZVBvaW50KGZpcnN0Q29kZVBvaW50KTtcblx0aWYgKCEoZmlyc3RDaGFyID49ICdcXHUyODAxJyAmJiBmaXJzdENoYXIgPD0gJ1xcdTI4RkYnKSkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0Y29uc3Qgd2l0aG91dFNwaW5uZXIgPSBub3JtYWxpemVkLnNsaWNlKGZpcnN0Q2hhci5sZW5ndGgpLnRyaW1TdGFydCgpO1xuXHRjb25zdCBkb3RzSW5kZXggPSB3aXRob3V0U3Bpbm5lci5pbmRleE9mKCcuLi4nKTtcblx0Y29uc3Qgc3BhY2VzSW5kZXggPSB3aXRob3V0U3Bpbm5lci5pbmRleE9mKCcgICcpO1xuXHRjb25zdCBjYW5kaWRhdGVzID0gW2RvdHNJbmRleCwgc3BhY2VzSW5kZXhdLmZpbHRlcihpbmRleCA9PiBpbmRleCAhPT0gLTEpO1xuXHRjb25zdCBlbmQgPSBjYW5kaWRhdGVzLmxlbmd0aCA+IDAgPyBNYXRoLm1pbiguLi5jYW5kaWRhdGVzKSA6IHdpdGhvdXRTcGlubmVyLmxlbmd0aDtcblx0cmV0dXJuIHdpdGhvdXRTcGlubmVyLnNsaWNlKDAsIGVuZCkudHJpbSgpO1xufVxuXG5mdW5jdGlvbiB1dlByb2dyZXNzQWN0aXZpdHkobGluZTogc3RyaW5nKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0cmV0dXJuIHJlZ2V4Q2FwdHVyZUZpcnN0KFxuXHRcdFN0cmluZy5yYXdgXFxzezIsfSgoPzpCdWlsZGluZ3xEb3dubG9hZGluZ3xJbnN0YWxsaW5nKSAuKykkYCxcblx0XHRzdHJpcEFuc2kobGluZSkudHJpbSgpLFxuXHQpO1xufVxuXG5mdW5jdGlvbiBzdHJpcEFuc2kodGV4dDogc3RyaW5nKTogc3RyaW5nIHtcblx0bGV0IG91dHB1dCA9ICcnO1xuXHRjb25zdCBjaGFycyA9IEFycmF5LmZyb20odGV4dCk7XG5cdGxldCBpID0gMDtcblx0d2hpbGUgKGkgPCBjaGFycy5sZW5ndGgpIHtcblx0XHRjb25zdCBjaCA9IGNoYXJzW2ldO1xuXHRcdGkgKz0gMTtcblx0XHRpZiAoY2ggIT09ICdcXHgxYicgfHwgY2hhcnNbaV0gIT09ICdbJykge1xuXHRcdFx0b3V0cHV0ICs9IGNoO1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXHRcdGkgKz0gMTtcblx0XHR3aGlsZSAoaSA8IGNoYXJzLmxlbmd0aCkge1xuXHRcdFx0Y29uc3QgbmV4dCA9IGNoYXJzW2ldO1xuXHRcdFx0aSArPSAxO1xuXHRcdFx0aWYgKG5leHQgPj0gJ0AnICYmIG5leHQgPD0gJ34nKSB7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXHRyZXR1cm4gb3V0cHV0O1xufVxuXG5mdW5jdGlvbiBjb21wYWN0TnhMZXJuYUZyYW1lUHJvZ3Jlc3Mob3V0cHV0OiBzdHJpbmcpOiBzdHJpbmcge1xuXHRpZiAoIWhhc054TGVybmFGcmFtZVByb2dyZXNzKG91dHB1dCkpIHtcblx0XHRyZXR1cm4gb3V0cHV0O1xuXHR9XG5cdGNvbnN0IGNhbk9taXRTdGF0aWNUYXNrVGFibGUgPSBvdXRwdXQuc3BsaXQoJ1xcbicpLnNvbWUobGluZSA9PlxuXHRcdHJlZ2V4VGVzdChTdHJpbmcucmF3YF5cXHMqTlhcXHMrU3VjY2Vzc2Z1bGx5IHJhbiB0YXJnZXRcXGJgLCBsaW5lKSk7XG5cblx0Y29uc3QgY29tcGFjdGVkOiBzdHJpbmdbXSA9IFtdO1xuXHRjb25zdCBvbWl0dGVkID0geyBjb3VudDogMCB9O1xuXHRmb3IgKGNvbnN0IGxpbmUgb2Ygb3V0cHV0LnNwbGl0KCdcXG4nKSkge1xuXHRcdGlmIChpc054TGVybmFGcmFtZU5vaXNlTGluZShsaW5lLCBjYW5PbWl0U3RhdGljVGFza1RhYmxlKSkge1xuXHRcdFx0b21pdHRlZC5jb3VudCArPSAxO1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXHRcdGlmIChsaW5lLnRyaW0oKS5sZW5ndGggPT09IDAgJiYgb21pdHRlZC5jb3VudCA+IDApIHtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblx0XHRmbHVzaE54TGVybmFPbWl0dGVkKGNvbXBhY3RlZCwgb21pdHRlZCk7XG5cdFx0Y29tcGFjdGVkLnB1c2gobGluZSk7XG5cdH1cblx0Zmx1c2hOeExlcm5hT21pdHRlZChjb21wYWN0ZWQsIG9taXR0ZWQpO1xuXHRyZXR1cm4gY29tcGFjdGVkLmpvaW4oJ1xcbicpO1xufVxuXG5mdW5jdGlvbiBmbHVzaE54TGVybmFPbWl0dGVkKGNvbXBhY3RlZDogc3RyaW5nW10sIG9taXR0ZWQ6IHsgY291bnQ6IG51bWJlciB9KTogdm9pZCB7XG5cdGlmIChvbWl0dGVkLmNvdW50ID4gMCkge1xuXHRcdGNvbXBhY3RlZC5wdXNoKGBbbnggZnJhbWUgcHJvZ3Jlc3M6IG9taXR0ZWQgJHtvbWl0dGVkLmNvdW50fSBmcmFtZSBsaW5lKHMpXWApO1xuXHRcdG9taXR0ZWQuY291bnQgPSAwO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGlzTnhMZXJuYUZyYW1lTm9pc2VMaW5lKGxpbmU6IHN0cmluZywgY2FuT21pdFN0YXRpY1Rhc2tUYWJsZTogYm9vbGVhbik6IGJvb2xlYW4ge1xuXHRyZXR1cm4gcmVnZXhUZXN0KFN0cmluZy5yYXdgXlxcdTIwMTR7MjAsfSRgLCBsaW5lKVxuXHRcdHx8IHJlZ2V4VGVzdChcblx0XHRcdFN0cmluZy5yYXdgXlxccyooPzpOWHxMZXJuYSBcXChwb3dlcmVkIGJ5IE54XFwpKVxccytSdW5uaW5nIHRhcmdldCBcXFMrIGZvciBcXGQrIHByb2plY3RzPyRgLFxuXHRcdFx0bGluZSxcblx0XHQpXG5cdFx0fHwgcmVnZXhUZXN0KFxuXHRcdFx0U3RyaW5nLnJhd2BeXFxzKk5YXFxzK1J1bm5pbmcgXFxkKyBcXFMrIHRhc2tzXFwuXFwuXFwuXFxzK0NhY2hlXFxzK0R1cmF0aW9uJGAsXG5cdFx0XHRsaW5lLFxuXHRcdClcblx0XHR8fCAoY2FuT21pdFN0YXRpY1Rhc2tUYWJsZVxuXHRcdFx0JiYgcmVnZXhUZXN0KFxuXHRcdFx0XHRTdHJpbmcucmF3YF5cXHMqTlhcXHMrUnVubmluZyBcXGQrIFxcUysgdGFza3NcXC5cXC5cXC5cXHMrQ2FjaGVcXHMrRHVyYXRpb25cXHMrLiskYCxcblx0XHRcdFx0bGluZSxcblx0XHRcdCkpXG5cdFx0fHwgcmVnZXhUZXN0KFxuXHRcdFx0U3RyaW5nLnJhd2BeXFxzK1xcdTIxOTJcXHMrRXhlY3V0aW5nIFxcZCsvXFxkKyByZW1haW5pbmcgdGFza3MoPzogaW4gcGFyYWxsZWwpP1xcLlxcLlxcLiRgLFxuXHRcdFx0bGluZSxcblx0XHQpXG5cdFx0fHwgcmVnZXhUZXN0KFxuXHRcdFx0U3RyaW5nLnJhd2BeXFxzK1tcXHUyODBCXFx1MjgxOVxcdTI4MzlcXHUyODM4XFx1MjgzQ1xcdTI4MzRcXHUyODI2XFx1MjgyN1xcdTI4MDdcXHUyODBGXVxccysoPzpueCBydW4gXFxTK3xAW1xcdy4tXSsvW1xcdy4tXSs6XFxTKykkYCxcblx0XHRcdGxpbmUsXG5cdFx0KTtcbn1cblxuZnVuY3Rpb24gaGFzTnhMZXJuYUZyYW1lUHJvZ3Jlc3Mob3V0cHV0OiBzdHJpbmcpOiBib29sZWFuIHtcblx0cmV0dXJuIG91dHB1dC5pbmNsdWRlcygnTlggICBSdW5uaW5nIHRhcmdldCcpXG5cdFx0fHwgb3V0cHV0LmluY2x1ZGVzKCdMZXJuYSAocG93ZXJlZCBieSBOeCknKVxuXHRcdHx8IG91dHB1dC5zcGxpdCgnXFxuJykuc29tZShsaW5lID0+XG5cdFx0XHRyZWdleFRlc3QoU3RyaW5nLnJhd2BeXFxzKk5YXFxzK1J1bm5pbmcgXFxkKyBcXFMrIHRhc2tzXFwuXFwuXFwuXFxzK0NhY2hlXFxzK0R1cmF0aW9uYCwgbGluZSkpO1xufVxuXG5mdW5jdGlvbiBjb21wYWN0UG5wbU91dHB1dChvdXRwdXQ6IHN0cmluZyk6IHN0cmluZyB7XG5cdGxldCBjb21wYWN0ZWQgPSBjb21wYWN0UmVwZWF0ZWROb2RlV2FybmluZ3Mob3V0cHV0KTtcblx0Y29tcGFjdGVkID0gY29tcGFjdFBhY2thZ2VNYW5hZ2VyT3BlcmF0aW9ucyhjb21wYWN0ZWQpO1xuXHRyZXR1cm4gY29tcGFjdFBucG1JbnN0YWxsUHJvZ3Jlc3MoY29tcGFjdGVkKTtcbn1cblxuZnVuY3Rpb24gY29tcGFjdFBucG1JbnN0YWxsUHJvZ3Jlc3Mob3V0cHV0OiBzdHJpbmcpOiBzdHJpbmcge1xuXHRjb25zdCBsaW5lcyA9IG91dHB1dC5zcGxpdCgnXFxuJyk7XG5cdGNvbnN0IGxhc3RQcm9ncmVzc0luZGV4ZXMgPSBuZXcgTWFwPHN0cmluZywgbnVtYmVyPigpO1xuXHRjb25zdCBsYXN0RG93bmxvYWRJbmRleGVzID0gbmV3IE1hcDxzdHJpbmcsIG51bWJlcj4oKTtcblx0Y29uc3QgbGFzdFdhcm5pbmdDb3VudGVySW5kZXhlcyA9IG5ldyBNYXA8c3RyaW5nLCBudW1iZXI+KCk7XG5cblx0Zm9yIChsZXQgaW5kZXggPSAwOyBpbmRleCA8IGxpbmVzLmxlbmd0aDsgaW5kZXgrKykge1xuXHRcdGNvbnN0IGxpbmUgPSBsaW5lc1tpbmRleF07XG5cdFx0aWYgKGlzUG5wbVByb2dyZXNzTGluZShsaW5lKSkge1xuXHRcdFx0bGFzdFByb2dyZXNzSW5kZXhlcy5zZXQocG5wbVdvcmtzcGFjZVByZWZpeChsaW5lKSwgaW5kZXgpO1xuXHRcdH1cblx0XHRjb25zdCBwYWNrYWdlTmFtZSA9IHBucG1Eb3dubG9hZFBhY2thZ2UobGluZSk7XG5cdFx0aWYgKHBhY2thZ2VOYW1lICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdGxhc3REb3dubG9hZEluZGV4ZXMuc2V0KHBhY2thZ2VOYW1lLCBpbmRleCk7XG5cdFx0fVxuXHRcdGlmIChpc1BucG1XYXJuaW5nQ291bnRlckxpbmUobGluZSkpIHtcblx0XHRcdGxhc3RXYXJuaW5nQ291bnRlckluZGV4ZXMuc2V0KHBucG1Xb3Jrc3BhY2VQcmVmaXgobGluZSksIGluZGV4KTtcblx0XHR9XG5cdH1cblxuXHRjb25zdCBjb21wYWN0ZWQ6IHN0cmluZ1tdID0gW107XG5cdGNvbnN0IG9taXR0ZWRQcm9ncmVzcyA9IHsgY291bnQ6IDAgfTtcblx0Y29uc3Qgb21pdHRlZFdhcm5pbmdDb3VudGVycyA9IHsgY291bnQ6IDAgfTtcblx0Y29uc3Qgb21pdHRlZERvd25sb2FkcyA9IG5ldyBNYXA8c3RyaW5nLCBudW1iZXI+KCk7XG5cblx0Zm9yIChsZXQgaW5kZXggPSAwOyBpbmRleCA8IGxpbmVzLmxlbmd0aDsgaW5kZXgrKykge1xuXHRcdGNvbnN0IGxpbmUgPSBsaW5lc1tpbmRleF07XG5cdFx0Y29uc3QgcGFja2FnZUJhclNpemUgPSBwbnBtUGFja2FnZUJhclNpemUoaW5kZXggPj0gMSA/IGxpbmVzW2luZGV4IC0gMV0gOiB1bmRlZmluZWQsIGxpbmUpO1xuXHRcdGlmIChwYWNrYWdlQmFyU2l6ZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRjb21wYWN0ZWQucHVzaChgW3BucG0gaW5zdGFsbCBwYWNrYWdlIGJhcjogb21pdHRlZCAke3BhY2thZ2VCYXJTaXplfSBwbHVzIGNoYXJhY3RlcihzKV1gKTtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblxuXHRcdGNvbnN0IHByb2dyZXNzUHJlZml4ID0gcG5wbVdvcmtzcGFjZVByZWZpeChsaW5lKTtcblx0XHRpZiAoaXNQbnBtUHJvZ3Jlc3NMaW5lKGxpbmUpXG5cdFx0XHQmJiBsYXN0UHJvZ3Jlc3NJbmRleGVzLmdldChwcm9ncmVzc1ByZWZpeCkgIT09IGluZGV4XG5cdFx0KSB7XG5cdFx0XHRvbWl0dGVkUHJvZ3Jlc3MuY291bnQgKz0gMTtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblxuXHRcdGNvbnN0IHBhY2thZ2VOYW1lID0gcG5wbURvd25sb2FkUGFja2FnZShsaW5lKTtcblx0XHRpZiAocGFja2FnZU5hbWUgIT09IHVuZGVmaW5lZFxuXHRcdFx0JiYgbGFzdERvd25sb2FkSW5kZXhlcy5nZXQocGFja2FnZU5hbWUpICE9PSBpbmRleFxuXHRcdCkge1xuXHRcdFx0b21pdHRlZERvd25sb2Fkcy5zZXQocGFja2FnZU5hbWUsIChvbWl0dGVkRG93bmxvYWRzLmdldChwYWNrYWdlTmFtZSkgPz8gMCkgKyAxKTtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblxuXHRcdGNvbnN0IHdhcm5pbmdQcmVmaXggPSBwbnBtV29ya3NwYWNlUHJlZml4KGxpbmUpO1xuXHRcdGlmIChpc1BucG1XYXJuaW5nQ291bnRlckxpbmUobGluZSlcblx0XHRcdCYmIGxhc3RXYXJuaW5nQ291bnRlckluZGV4ZXMuZ2V0KHdhcm5pbmdQcmVmaXgpICE9PSBpbmRleFxuXHRcdCkge1xuXHRcdFx0b21pdHRlZFdhcm5pbmdDb3VudGVycy5jb3VudCArPSAxO1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXG5cdFx0aWYgKGlzUG5wbVByb2dyZXNzTGluZShsaW5lKSkge1xuXHRcdFx0Zmx1c2hQbnBtUHJvZ3Jlc3MoY29tcGFjdGVkLCBvbWl0dGVkUHJvZ3Jlc3MpO1xuXHRcdH0gZWxzZSBpZiAocGFja2FnZU5hbWUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0Zmx1c2hQbnBtRG93bmxvYWQoY29tcGFjdGVkLCBvbWl0dGVkRG93bmxvYWRzLCBwYWNrYWdlTmFtZSk7XG5cdFx0fSBlbHNlIGlmIChpc1BucG1XYXJuaW5nQ291bnRlckxpbmUobGluZSkpIHtcblx0XHRcdGZsdXNoUG5wbVdhcm5pbmdDb3VudGVycyhjb21wYWN0ZWQsIG9taXR0ZWRXYXJuaW5nQ291bnRlcnMpO1xuXHRcdH1cblx0XHRjb21wYWN0ZWQucHVzaChsaW5lKTtcblx0fVxuXG5cdHJldHVybiBjb21wYWN0ZWQuam9pbignXFxuJyk7XG59XG5cbmZ1bmN0aW9uIGZsdXNoUG5wbVByb2dyZXNzKGNvbXBhY3RlZDogc3RyaW5nW10sIG9taXR0ZWRQcm9ncmVzczogeyBjb3VudDogbnVtYmVyIH0pOiB2b2lkIHtcblx0aWYgKG9taXR0ZWRQcm9ncmVzcy5jb3VudCA+IDApIHtcblx0XHRjb21wYWN0ZWQucHVzaChgW3BucG0gaW5zdGFsbCBwcm9ncmVzczogb21pdHRlZCAke29taXR0ZWRQcm9ncmVzcy5jb3VudH0gZWFybGllciBwcm9ncmVzcyBsaW5lKHMpXWApO1xuXHRcdG9taXR0ZWRQcm9ncmVzcy5jb3VudCA9IDA7XG5cdH1cbn1cblxuZnVuY3Rpb24gZmx1c2hQbnBtV2FybmluZ0NvdW50ZXJzKGNvbXBhY3RlZDogc3RyaW5nW10sIG9taXR0ZWRXYXJuaW5nQ291bnRlcnM6IHsgY291bnQ6IG51bWJlciB9KTogdm9pZCB7XG5cdGlmIChvbWl0dGVkV2FybmluZ0NvdW50ZXJzLmNvdW50ID4gMCkge1xuXHRcdGNvbXBhY3RlZC5wdXNoKGBbcG5wbSBpbnN0YWxsIHdhcm5pbmcgY291bnRlcjogb21pdHRlZCAke29taXR0ZWRXYXJuaW5nQ291bnRlcnMuY291bnR9IGVhcmxpZXIgY291bnRlciBsaW5lKHMpXWApO1xuXHRcdG9taXR0ZWRXYXJuaW5nQ291bnRlcnMuY291bnQgPSAwO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGZsdXNoUG5wbURvd25sb2FkKFxuXHRjb21wYWN0ZWQ6IHN0cmluZ1tdLFxuXHRvbWl0dGVkRG93bmxvYWRzOiBNYXA8c3RyaW5nLCBudW1iZXI+LFxuXHRwYWNrYWdlTmFtZTogc3RyaW5nLFxuKTogdm9pZCB7XG5cdGNvbnN0IG9taXR0ZWQgPSBvbWl0dGVkRG93bmxvYWRzLmdldChwYWNrYWdlTmFtZSkgPz8gMDtcblx0b21pdHRlZERvd25sb2Fkcy5kZWxldGUocGFja2FnZU5hbWUpO1xuXHRpZiAob21pdHRlZCA+IDApIHtcblx0XHRjb21wYWN0ZWQucHVzaChgW3BucG0gaW5zdGFsbCBkb3dubG9hZHM6IG9taXR0ZWQgJHtvbWl0dGVkfSBlYXJsaWVyIGZyYW1lKHMpIGZvciAke3BhY2thZ2VOYW1lfV1gKTtcblx0fVxufVxuXG5mdW5jdGlvbiBpc1BucG1Qcm9ncmVzc0xpbmUobGluZTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdGNvbnN0IHJlc3QgPSBzdHJpcFBucG1Xb3Jrc3BhY2VQcmVmaXgobGluZSk7XG5cdHJldHVybiByZWdleFRlc3QoXG5cdFx0U3RyaW5nLnJhd2BeUHJvZ3Jlc3M6IHJlc29sdmVkIFxcZCssIHJldXNlZCBcXGQrLCBkb3dubG9hZGVkIFxcZCssIGFkZGVkIFxcZCsoPzosIGRvbmUpPyRgLFxuXHRcdHJlc3QsXG5cdCk7XG59XG5cbmZ1bmN0aW9uIHBucG1Eb3dubG9hZFBhY2thZ2UobGluZTogc3RyaW5nKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0Y29uc3Qgc3RyaXBwZWQgPSBzdHJpcFBucG1Xb3Jrc3BhY2VQcmVmaXgobGluZSk7XG5cdGNvbnN0IHJlc3QgPSBzdHJpcFByZWZpeChzdHJpcHBlZCwgJ0Rvd25sb2FkaW5nICcpO1xuXHRpZiAocmVzdCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRjb25zdCBzcGxpdCA9IHNwbGl0T25jZShyZXN0LCAnOiAnKTtcblx0aWYgKHNwbGl0ID09PSB1bmRlZmluZWQpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGNvbnN0IFtwa2csIHNpemVzXSA9IHNwbGl0O1xuXHRpZiAocmVnZXhUZXN0KFxuXHRcdFN0cmluZy5yYXdgXlxcZCsoPzpcXC5cXGQrKT8gKD86QnxrQnxNQnxHQikvXFxkKyg/OlxcLlxcZCspPyAoPzpCfGtCfE1CfEdCKSg/OiwgZG9uZSk/JGAsXG5cdFx0c2l6ZXMsXG5cdCkpIHtcblx0XHRyZXR1cm4gcGtnO1xuXHR9XG5cdHJldHVybiB1bmRlZmluZWQ7XG59XG5cbmZ1bmN0aW9uIGlzUG5wbVdhcm5pbmdDb3VudGVyTGluZShsaW5lOiBzdHJpbmcpOiBib29sZWFuIHtcblx0cmV0dXJuIHJlZ2V4VGVzdChcblx0XHRTdHJpbmcucmF3YF5cXHMqV0FSTlxccytcXGQrIG90aGVyIHdhcm5pbmdzJGAsXG5cdFx0c3RyaXBQbnBtV29ya3NwYWNlUHJlZml4KGxpbmUpLFxuXHQpO1xufVxuXG5mdW5jdGlvbiBwbnBtUGFja2FnZUJhclNpemUocHJldmlvdXNMaW5lOiBzdHJpbmcgfCB1bmRlZmluZWQsIGxpbmU6IHN0cmluZyk6IG51bWJlciB8IHVuZGVmaW5lZCB7XG5cdGlmIChwcmV2aW91c0xpbmUgPT09IHVuZGVmaW5lZCkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0Y29uc3QgY291bnRUZXh0ID0gc3RyaXBQcmVmaXgocHJldmlvdXNMaW5lLCAnUGFja2FnZXM6ICsnKTtcblx0aWYgKGNvdW50VGV4dCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRjb25zdCBjb3VudCA9IHBhcnNlVXNpemUoY291bnRUZXh0KTtcblx0aWYgKGNvdW50ID09PSB1bmRlZmluZWQpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGlmIChsaW5lLmxlbmd0aCA+IDAgJiYgWy4uLmxpbmVdLmV2ZXJ5KGNoID0+IGNoID09PSAnKycpICYmIGxpbmUubGVuZ3RoID09PSBjb3VudCkge1xuXHRcdHJldHVybiBjb3VudDtcblx0fVxuXHRyZXR1cm4gdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiBwbnBtV29ya3NwYWNlUHJlZml4KGxpbmU6IHN0cmluZyk6IHN0cmluZyB7XG5cdGNvbnN0IGVuZCA9IHBucG1Xb3Jrc3BhY2VQcmVmaXhFbmQobGluZSk7XG5cdHJldHVybiBlbmQgIT09IHVuZGVmaW5lZCA/IGxpbmUuc2xpY2UoMCwgZW5kKSA6ICcnO1xufVxuXG5mdW5jdGlvbiBzdHJpcFBucG1Xb3Jrc3BhY2VQcmVmaXgobGluZTogc3RyaW5nKTogc3RyaW5nIHtcblx0Y29uc3QgZW5kID0gcG5wbVdvcmtzcGFjZVByZWZpeEVuZChsaW5lKTtcblx0cmV0dXJuIGVuZCAhPT0gdW5kZWZpbmVkID8gbGluZS5zbGljZShlbmQpIDogbGluZTtcbn1cblxuZnVuY3Rpb24gcG5wbVdvcmtzcGFjZVByZWZpeEVuZChsaW5lOiBzdHJpbmcpOiBudW1iZXIgfCB1bmRlZmluZWQge1xuXHRjb25zdCBpbmRleCA9IGxpbmUuaW5kZXhPZignfCcpO1xuXHRpZiAoaW5kZXggPT09IC0xKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRpZiAoaW5kZXggPT09IDApIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGxldCBlbmQgPSBpbmRleCArIDE7XG5cdGZvciAoY29uc3QgY2ggb2YgbGluZS5zbGljZShlbmQpKSB7XG5cdFx0aWYgKCFpc1doaXRlc3BhY2VDaGFyKGNoKSkge1xuXHRcdFx0YnJlYWs7XG5cdFx0fVxuXHRcdGVuZCArPSBjaC5sZW5ndGg7XG5cdH1cblx0cmV0dXJuIGVuZDtcbn1cblxuZnVuY3Rpb24gY29tcGFjdE5wbU91dHB1dChvdXRwdXQ6IHN0cmluZyk6IHN0cmluZyB7XG5cdGxldCBjb21wYWN0ZWQgPSBjb21wYWN0UmVwZWF0ZWROb2RlV2FybmluZ3Mob3V0cHV0KTtcblx0Y29tcGFjdGVkID0gY29tcGFjdFBhY2thZ2VNYW5hZ2VyT3BlcmF0aW9ucyhjb21wYWN0ZWQpO1xuXHRjb21wYWN0ZWQgPSBjb21wYWN0SW50cmFsaW5lUHJvZ3Jlc3MoXG5cdFx0Y29tcGFjdGVkLFxuXHRcdCd5YXJuMSBpbnN0YWxsIGludHJhbGluZSBwcm9ncmVzcycsXG5cdFx0Y29tcGFjdFlhcm4xUHJvZ3Jlc3NGcmFtZXMsXG5cdCk7XG5cdHJldHVybiBvbWl0Tm9uRGlhZ25vc3RpY0xpbmVzKFxuXHRcdGNvbXBhY3RlZCxcblx0XHQnbnBtIGluc3RhbGwgcHJvZ3Jlc3MnLFxuXHRcdGlzTnBtSW5zdGFsbFByb2dyZXNzTGluZSxcblx0KTtcbn1cblxuZnVuY3Rpb24gY29tcGFjdFlhcm4xUHJvZ3Jlc3NGcmFtZXMobGluZTogc3RyaW5nKTogQ29tcGFjdGVkTGluZSB7XG5cdHJldHVybiBjb21wYWN0UHJvZ3Jlc3NQYXR0ZXJuc1VubGVzc0RpYWdub3N0aWMobGluZSwgW1N0cmluZy5yYXdgXFxbWyMtXStcXF0gXFxkKy9cXGQrYF0pO1xufVxuXG5mdW5jdGlvbiBpc05wbUluc3RhbGxQcm9ncmVzc0xpbmUobGluZTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdGlmIChpc0RpYWdub3N0aWNMaW5lKGxpbmUpKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdGNvbnN0IGxvd2VyID0gYXNjaWlMb3dlcmNhc2UobGluZSk7XG5cdGlmIChyZWdleFRlc3QoU3RyaW5nLnJhd2BebnBtICg/Om5vdGljZXxodHRwfHRpbWluZ3xpbmZvfHZlcmJ8c2lsbHkpXFxiYCwgbG93ZXIpKSB7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblx0aWYgKHJlZ2V4VGVzdFdpdGhGbGFncyhcblx0XHRTdHJpbmcucmF3YF4oPzpyZWlmeXxpZGVhbFRyZWV8ZmV0Y2hNZXRhZGF0YXxleHRyYWN0fHJvbGxiYWNrRmFpbGVkT3B0aW9uYWwpWzpcXHNdYCxcblx0XHRsaW5lLFxuXHRcdCdpJyxcblx0KSkge1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cdGNvbnN0IGNoYXJzID0gQXJyYXkuZnJvbShsaW5lKTtcblx0Y29uc3QgZmlyc3QgPSBjaGFyc1swXTtcblx0Y29uc3Qgc2Vjb25kID0gY2hhcnNbMV07XG5cdHJldHVybiBmaXJzdCAhPT0gdW5kZWZpbmVkICYmIGZpcnN0ID49ICdcXHUyODAxJyAmJiBmaXJzdCA8PSAnXFx1MjhGRidcblx0XHQmJiBzZWNvbmQgIT09IHVuZGVmaW5lZCAmJiBpc1doaXRlc3BhY2VDaGFyKHNlY29uZCk7XG59XG5cbmZ1bmN0aW9uIGNvbXBhY3RZYXJuQmVycnlPdXRwdXQob3V0cHV0OiBzdHJpbmcpOiBzdHJpbmcge1xuXHRsZXQgY29tcGFjdGVkID0gY29tcGFjdFlhcm5CZXJyeVByb2dyZXNzKG91dHB1dCk7XG5cdGNvbXBhY3RlZCA9IGNvbXBhY3RSZXBlYXRlZE5vZGVXYXJuaW5ncyhjb21wYWN0ZWQpO1xuXHRjb21wYWN0ZWQgPSBjb21wYWN0UGFja2FnZU1hbmFnZXJPcGVyYXRpb25zKGNvbXBhY3RlZCk7XG5cdHJldHVybiBjb21wYWN0SW50cmFsaW5lUHJvZ3Jlc3MoXG5cdFx0Y29tcGFjdGVkLFxuXHRcdCd5YXJuMSBpbnN0YWxsIGludHJhbGluZSBwcm9ncmVzcycsXG5cdFx0Y29tcGFjdFlhcm4xUHJvZ3Jlc3NGcmFtZXMsXG5cdCk7XG59XG5cbmZ1bmN0aW9uIGNvbXBhY3RZYXJuQmVycnlQcm9ncmVzcyhvdXRwdXQ6IHN0cmluZyk6IHN0cmluZyB7XG5cdGlmICghaGFzWWFybkJlcnJ5Q29tcGxldGVkT3V0cHV0KG91dHB1dCkpIHtcblx0XHRyZXR1cm4gb3V0cHV0O1xuXHR9XG5cdHJldHVybiBvbWl0TWF0Y2hpbmdMaW5lcyhcblx0XHRvdXRwdXQsXG5cdFx0J3lhcm4gYmVycnkgcHJvZ3Jlc3MnLFxuXHRcdGlzWWFybkJlcnJ5UHJvZ3Jlc3NMaW5lLFxuXHRcdCdwcm9ncmVzcycsXG5cdCk7XG59XG5cbmZ1bmN0aW9uIGhhc1lhcm5CZXJyeUNvbXBsZXRlZE91dHB1dChvdXRwdXQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gb3V0cHV0LmluY2x1ZGVzKCdcXHUyN0E0IFlOMDAwMDonKVxuXHRcdCYmIG91dHB1dC5zcGxpdCgnXFxuJykuc29tZShsaW5lID0+XG5cdFx0XHRsaW5lLnN0YXJ0c1dpdGgoJ1xcdTI3QTQgWU4wMDAwOiBcXHUwMEI3IERvbmUgaW4gJylcblx0XHRcdHx8IGxpbmUuc3RhcnRzV2l0aCgnXFx1MjdBNCBZTjAwMDA6IFxcdTAwQjcgRG9uZSB3aXRoIHdhcm5pbmdzIGluICcpKTtcbn1cblxuZnVuY3Rpb24gaXNZYXJuQmVycnlQcm9ncmVzc0xpbmUobGluZTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiBsaW5lLnN0YXJ0c1dpdGgoJ1xcdTI3QTQgWU4wMDAwOicpXG5cdFx0JiYgIWxpbmUuc3RhcnRzV2l0aCgnXFx1MjdBNCBZTjAwMDA6IFxcdTAwQjcgRG9uZSBpbiAnKVxuXHRcdCYmICFsaW5lLnN0YXJ0c1dpdGgoJ1xcdTI3QTQgWU4wMDAwOiBcXHUwMEI3IERvbmUgd2l0aCB3YXJuaW5ncyBpbiAnKTtcbn1cblxuZnVuY3Rpb24gY29tcGFjdE1ha2VPdXRwdXQob3V0cHV0OiBzdHJpbmcpOiBzdHJpbmcge1xuXHRsZXQgY29tcGFjdGVkID0gY29tcGFjdEludHJhbGluZVByb2dyZXNzKFxuXHRcdG91dHB1dCxcblx0XHQnbmluamEgYnVpbGQgaW50cmFsaW5lIHByb2dyZXNzJyxcblx0XHRjb21wYWN0TmluamFQcm9ncmVzc0ZyYW1lcyxcblx0KTtcblx0Y29tcGFjdGVkID0gY29tcGFjdE1ha2VQcm9ncmVzcyhjb21wYWN0ZWQpO1xuXHRjb21wYWN0ZWQgPSBjb21wYWN0R29sYW5nY2lMaW50T3V0cHV0KGNvbXBhY3RlZCwgdHJ1ZSk7XG5cdHJldHVybiBvbWl0Tm9uRGlhZ25vc3RpY0xpbmVzKFxuXHRcdGNvbXBhY3RlZCxcblx0XHQnZ28gbW9kdWxlIGRvd25sb2FkJyxcblx0XHRpc0dvTW9kdWxlRG93bmxvYWRDaGF0dGVyTGluZSxcblx0KTtcbn1cblxuZnVuY3Rpb24gY29tcGFjdE5pbmphUHJvZ3Jlc3NGcmFtZXMobGluZTogc3RyaW5nKTogQ29tcGFjdGVkTGluZSB7XG5cdHJldHVybiBjb21wYWN0UHJvZ3Jlc3NQYXR0ZXJuc1VubGVzc0RpYWdub3N0aWMoXG5cdFx0bGluZSxcblx0XHRbXG5cdFx0XHRTdHJpbmcucmF3YFxcW1xccypcXGQrL1xcZCtcXF1cXHMrKD86KD86QnVpbGRpbmd8TGlua2luZylcXHMrKD86Q3xDWFh8Q1VEQXxBU018T0JKQ3xPQkpDWFgpXFxzKyg/Om9iamVjdHxleGVjdXRhYmxlfHN0YXRpYyBsaWJyYXJ5fHNoYXJlZCBsaWJyYXJ5fG1vZHVsZSl8R2VuZXJhdGluZ3xDb3B5aW5nfFByb2Nlc3Npbmd8UmUtcnVubmluZyBDTWFrZXxTY2FubmluZyBkZXBlbmRlbmNpZXMgb2YgdGFyZ2V0fEF1dG9tYXRpY1xccysoPzpNT0N8VUlDfFJDQykpXFxiW15bXSpgLFxuXHRcdF0sXG5cdCk7XG59XG5cbmZ1bmN0aW9uIGNvbXBhY3RNYWtlUHJvZ3Jlc3Mob3V0cHV0OiBzdHJpbmcpOiBzdHJpbmcge1xuXHRjb25zdCBsaW5lcyA9IG91dHB1dC5zcGxpdCgnXFxuJyk7XG5cdGNvbnN0IGNvbXBhY3RlZDogc3RyaW5nW10gPSBbXTtcblx0bGV0IGkgPSAwO1xuXHR3aGlsZSAoaSA8IGxpbmVzLmxlbmd0aCkge1xuXHRcdGNvbnN0IGtleSA9IGdldE1ha2VQcm9ncmVzc0tleShsaW5lc1tpXSk7XG5cdFx0aWYgKGtleSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRjb21wYWN0ZWQucHVzaChsaW5lc1tpXSk7XG5cdFx0XHRpICs9IDE7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cblx0XHRsZXQgaiA9IGkgKyAxO1xuXHRcdHdoaWxlIChqIDwgbGluZXMubGVuZ3RoICYmIGdldE1ha2VQcm9ncmVzc0tleShsaW5lc1tqXSkgPT09IGtleSkge1xuXHRcdFx0aiArPSAxO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNvdW50ID0gaiAtIGk7XG5cdFx0aWYgKGNvdW50ID49IDQpIHtcblx0XHRcdGNvbXBhY3RlZC5wdXNoKGxpbmVzW2ldKTtcblx0XHRcdGNvbXBhY3RlZC5wdXNoKGBbbWFrZSBwcm9ncmVzczogb21pdHRlZCAke2NvdW50IC0gMX0gbW9yZSAke2tleX0gbGluZShzKV1gKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Zm9yIChsZXQgayA9IGk7IGsgPCBqOyBrKyspIHtcblx0XHRcdFx0Y29tcGFjdGVkLnB1c2gobGluZXNba10pO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpID0gajtcblx0fVxuXHRyZXR1cm4gY29tcGFjdGVkLmpvaW4oJ1xcbicpO1xufVxuXG5mdW5jdGlvbiBnZXRNYWtlUHJvZ3Jlc3NLZXkobGluZTogc3RyaW5nKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0aWYgKGlzRGlhZ25vc3RpY0xpbmUobGluZSkpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGNvbnN0IHRyaW1tZWQgPSBsaW5lLnRyaW0oKTtcblx0Y29uc3Qga2luZCA9IHJlZ2V4Q2FwdHVyZUZpcnN0KFN0cmluZy5yYXdgXlxcWyhDb21waWxpbmd8TGlua2luZykgLitcXF0kYCwgdHJpbW1lZCk7XG5cdGlmIChraW5kICE9PSB1bmRlZmluZWQpIHtcblx0XHRyZXR1cm4gYXNjaWlMb3dlcmNhc2Uoa2luZCk7XG5cdH1cblxuXHRjb25zdCBydWxlID0gc3BsaXRNYWtlUnVsZUxpbmUodHJpbW1lZCk7XG5cdGlmIChydWxlICE9PSB1bmRlZmluZWQpIHtcblx0XHRjb25zdCBbcnVsZU5hbWUsIHRhcmdldF0gPSBydWxlO1xuXHRcdGNvbnN0IHN1ZmZpeCA9IHJlZ2V4Q2FwdHVyZUZpcnN0KFN0cmluZy5yYXdgKFxcLltBLVphLXowLTlfLi1dKykkYCwgdGFyZ2V0KSA/PyAnJztcblx0XHRyZXR1cm4gYCR7cnVsZU5hbWV9ICR7ZGlyZWN0b3J5R2xvYih0YXJnZXQsIHN1ZmZpeCl9YDtcblx0fVxuXHRjb25zdCBwcmVwcm9jZXNzaW5nID0gcmVnZXhDYXB0dXJlRmlyc3QoU3RyaW5nLnJhd2BeUHJlcHJvY2Vzc2luZ1xccysoLitcXC52cCkkYCwgdHJpbW1lZCk7XG5cdGlmIChwcmVwcm9jZXNzaW5nICE9PSB1bmRlZmluZWQpIHtcblx0XHRyZXR1cm4gYFByZXByb2Nlc3NpbmcgJHtkaXJlY3RvcnlHbG9iKHByZXByb2Nlc3NpbmcsICcudnAnKX1gO1xuXHR9XG5cdGlmIChyZWdleFRlc3QoXG5cdFx0U3RyaW5nLnJhd2BeKD86Z2NjfGdcXCtcXCt8Y2N8Y1xcK1xcK3xjbGFuZ3xjbGFuZ1xcK1xcK3xbQS1aYS16MC05Xy1dKy1nY2N8W0EtWmEtejAtOV8tXSstZ1xcK1xcKylcXGIuKlxccy1jXFxzYCxcblx0XHR0cmltbWVkLFxuXHQpKSB7XG5cdFx0cmV0dXJuICdjb21waWxlIGNvbW1hbmQnO1xuXHR9XG5cdGlmIChyZWdleFRlc3QoXG5cdFx0U3RyaW5nLnJhd2BebWFrZSg/OlxcW1xcZCtcXF0pPzogKD86RW50ZXJpbmd8TGVhdmluZykgZGlyZWN0b3J5IGAsXG5cdFx0dHJpbW1lZCxcblx0KSkge1xuXHRcdHJldHVybiAnbWFrZSBkaXJlY3RvcnknO1xuXHR9XG5cdHJldHVybiB1bmRlZmluZWQ7XG59XG5cbmZ1bmN0aW9uIHNwbGl0TWFrZVJ1bGVMaW5lKGxpbmU6IHN0cmluZyk6IFtzdHJpbmcsIHN0cmluZ10gfCB1bmRlZmluZWQge1xuXHRjb25zdCBydWxlcyA9IFtcblx0XHQnSE9TVENDJywgJ01LTElCJywgJ01LRVhFJywgJ01LRExMJywgJ09DQU1MQycsICdPQ0FNTE9QVCcsICdDT1FDJywgJ0NPUURFUCcsICdDT1FDSEsnLFxuXHRcdCdDT1FET0MnLCAnTElOSycsICdDWFgnLCAnQ1BQJywgJ0NDJywgJ0FSJywgJ0FTJywgJ0xEJywgJ0dFTicsXG5cdF07XG5cdGZvciAoY29uc3QgcnVsZSBvZiBydWxlcykge1xuXHRcdGNvbnN0IHRhcmdldCA9IHN0cmlwUHJlZml4KGxpbmUsIGAke3J1bGV9IGApO1xuXHRcdGlmICh0YXJnZXQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuIFtydWxlLCB0YXJnZXRdO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiBkaXJlY3RvcnlHbG9iKHRhcmdldDogc3RyaW5nLCBzdWZmaXg6IHN0cmluZyk6IHN0cmluZyB7XG5cdGNvbnN0IHNsYXNoID0gdGFyZ2V0Lmxhc3RJbmRleE9mKCcvJyk7XG5cdGlmIChzbGFzaCAhPT0gLTEpIHtcblx0XHRyZXR1cm4gYCR7dGFyZ2V0LnNsaWNlKDAsIHNsYXNoKX0vKiR7c3VmZml4fWA7XG5cdH1cblx0cmV0dXJuIGAqJHtzdWZmaXh9YDtcbn1cblxuZnVuY3Rpb24gY29tcGFjdEFwdE91dHB1dChvdXRwdXQ6IHN0cmluZyk6IHN0cmluZyB7XG5cdGxldCBjb21wYWN0ZWQgPSBjb21wYWN0SW50cmFsaW5lUHJvZ3Jlc3MoXG5cdFx0b3V0cHV0LFxuXHRcdCdhcHQgaW50cmFsaW5lIHByb2dyZXNzJyxcblx0XHRjb21wYWN0QXB0UHJvZ3Jlc3NGcmFtZXMsXG5cdCk7XG5cdGNvbXBhY3RlZCA9IGNvbXBhY3ROZWVkcmVzdGFydE5vb3BQcm9ncmVzcyhjb21wYWN0ZWQpO1xuXHRjb21wYWN0ZWQgPSBjb21wYWN0UGFja2FnZU1hbmFnZXJPcGVyYXRpb25zKGNvbXBhY3RlZCk7XG5cdGNvbXBhY3RlZCA9IGNvbXBhY3RBcHREcGtnTGlmZWN5Y2xlQmxvY2tzKGNvbXBhY3RlZCk7XG5cdHJldHVybiBvbWl0Tm9uRGlhZ25vc3RpY0xpbmVzKGNvbXBhY3RlZCwgJ2FwdCBwcm9ncmVzcycsIGlzQXB0UHJvZ3Jlc3NMaW5lKTtcbn1cblxuZnVuY3Rpb24gY29tcGFjdEFwdFByb2dyZXNzRnJhbWVzKGxpbmU6IHN0cmluZyk6IENvbXBhY3RlZExpbmUge1xuXHRpZiAoaXNEaWFnbm9zdGljTGluZShsaW5lKSkge1xuXHRcdHJldHVybiB1bmNoYW5nZWRMaW5lKGxpbmUpO1xuXHR9XG5cblx0Y29uc3QgcmVzdWx0ID0gY29tcGFjdFByb2dyZXNzUGF0dGVybnMoXG5cdFx0bGluZSxcblx0XHRbXG5cdFx0XHRTdHJpbmcucmF3YFJlYWRpbmcgcGFja2FnZSBsaXN0c1xcLlxcLlxcLiBcXGQrJWAsXG5cdFx0XHRTdHJpbmcucmF3YEJ1aWxkaW5nIGRlcGVuZGVuY3kgdHJlZVxcLlxcLlxcLiBcXGQrJWAsXG5cdFx0XHRTdHJpbmcucmF3YFJlYWRpbmcgc3RhdGUgaW5mb3JtYXRpb25cXC5cXC5cXC4gXFxkKyVgLFxuXHRcdFx0U3RyaW5nLnJhd2BcXChSZWFkaW5nIGRhdGFiYXNlIFxcLlxcLlxcLiBcXGQrJWAsXG5cdFx0XSxcblx0KTtcblx0Y29uc3Qgc3Bpbm5lclJlc3VsdCA9IHJlbW92ZVByb2dyZXNzTWF0Y2hlcyhcblx0XHRyZXN1bHQub3V0cHV0LFxuXHRcdFN0cmluZy5yYXdgXFxkKyUgXFxbKD86V29ya2luZ3xXYWl0aW5nIGZvciBoZWFkZXJzfENvbm5lY3RpbmcgdG8gW15cXF1dK3xDb25uZWN0ZWQgdG8gW15cXF1dKylcXF1cXHMqYCxcblx0KTtcblx0cmV0dXJuIHtcblx0XHRvdXRwdXQ6IHNwaW5uZXJSZXN1bHQub3V0cHV0LFxuXHRcdG9taXR0ZWRGcmFtZXM6IHJlc3VsdC5vbWl0dGVkRnJhbWVzICsgc3Bpbm5lclJlc3VsdC5vbWl0dGVkRnJhbWVzLFxuXHR9O1xufVxuXG5mdW5jdGlvbiByZW1vdmVQcm9ncmVzc01hdGNoZXMobGluZTogc3RyaW5nLCBwYXR0ZXJuOiBzdHJpbmcpOiBDb21wYWN0ZWRMaW5lIHtcblx0Y29uc3QgbWF0Y2hlcyA9IHJlZ2V4RmluZEFsbChwYXR0ZXJuLCBsaW5lKTtcblx0aWYgKG1hdGNoZXMubGVuZ3RoID09PSAwKSB7XG5cdFx0cmV0dXJuIHVuY2hhbmdlZExpbmUobGluZSk7XG5cdH1cblx0bGV0IG91dHB1dCA9ICcnO1xuXHRsZXQgY3Vyc29yID0gMDtcblx0Zm9yIChjb25zdCBtYXRjaCBvZiBtYXRjaGVzKSB7XG5cdFx0b3V0cHV0ICs9IGxpbmUuc2xpY2UoY3Vyc29yLCBtYXRjaC5zdGFydCk7XG5cdFx0Y3Vyc29yID0gbWF0Y2guZW5kO1xuXHR9XG5cdG91dHB1dCArPSBsaW5lLnNsaWNlKGN1cnNvcik7XG5cdHJldHVybiB7IG91dHB1dCwgb21pdHRlZEZyYW1lczogbWF0Y2hlcy5sZW5ndGggfTtcbn1cblxuZnVuY3Rpb24gY29tcGFjdE5lZWRyZXN0YXJ0Tm9vcFByb2dyZXNzKG91dHB1dDogc3RyaW5nKTogc3RyaW5nIHtcblx0aWYgKCFoYXNOZWVkcmVzdGFydE5vb3BTdW1tYXJ5KG91dHB1dCkgfHwgaGFzTmVlZHJlc3RhcnRBY3Rpb25hYmxlU3RhdGUob3V0cHV0KSkge1xuXHRcdHJldHVybiBvdXRwdXQ7XG5cdH1cblxuXHRsZXQgb21pdHRlZEZyYW1lcyA9IDA7XG5cdGNvbnN0IGNvbXBhY3RlZCA9IG91dHB1dFxuXHRcdC5zcGxpdCgnXFxuJylcblx0XHQubWFwKGxpbmUgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gY29tcGFjdE5lZWRyZXN0YXJ0UHJvZ3Jlc3NMaW5lKGxpbmUpO1xuXHRcdFx0b21pdHRlZEZyYW1lcyArPSByZXN1bHQub21pdHRlZEZyYW1lcztcblx0XHRcdHJldHVybiByZXN1bHQub3V0cHV0O1xuXHRcdH0pXG5cdFx0LmpvaW4oJ1xcbicpO1xuXG5cdGlmIChvbWl0dGVkRnJhbWVzID4gMCkge1xuXHRcdHJldHVybiBgW25lZWRyZXN0YXJ0IHByb2dyZXNzOiBvbWl0dGVkICR7b21pdHRlZEZyYW1lc30gbm8tb3Agc2Nhbm5pbmcgZnJhbWUocyldXFxuJHtjb21wYWN0ZWR9YDtcblx0fVxuXHRyZXR1cm4gb3V0cHV0O1xufVxuXG5mdW5jdGlvbiBoYXNOZWVkcmVzdGFydE5vb3BTdW1tYXJ5KG91dHB1dDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiBvdXRwdXQuc3BsaXQoJ1xcbicpLnNvbWUoaXNOZWVkcmVzdGFydE5vb3BTdW1tYXJ5TGluZSk7XG59XG5cbmZ1bmN0aW9uIGlzTmVlZHJlc3RhcnROb29wU3VtbWFyeUxpbmUobGluZTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHN3aXRjaCAobGluZS50cmltKCkpIHtcblx0XHRjYXNlICdSdW5uaW5nIGtlcm5lbCBzZWVtcyB0byBiZSB1cC10by1kYXRlLic6XG5cdFx0Y2FzZSAnVGhlIHByb2Nlc3NvciBtaWNyb2NvZGUgc2VlbXMgdG8gYmUgdXAtdG8tZGF0ZS4nOlxuXHRcdGNhc2UgJ05vIHNlcnZpY2VzIG5lZWQgdG8gYmUgcmVzdGFydGVkLic6XG5cdFx0Y2FzZSAnTm8gY29udGFpbmVycyBuZWVkIHRvIGJlIHJlc3RhcnRlZC4nOlxuXHRcdGNhc2UgJ05vIHVzZXIgc2Vzc2lvbnMgYXJlIHJ1bm5pbmcgb3V0ZGF0ZWQgYmluYXJpZXMuJzpcblx0XHRjYXNlICdObyBWTSBndWVzdHMgYXJlIHJ1bm5pbmcgb3V0ZGF0ZWQgaHlwZXJ2aXNvciAocWVtdSkgYmluYXJpZXMgb24gdGhpcyBob3N0Lic6XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRkZWZhdWx0OlxuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGhhc05lZWRyZXN0YXJ0QWN0aW9uYWJsZVN0YXRlKG91dHB1dDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiBvdXRwdXQuc3BsaXQoJ1xcbicpLnNvbWUobGluZSA9PiB7XG5cdFx0Y29uc3QgdHJpbW1lZCA9IGxpbmUudHJpbSgpO1xuXHRcdHJldHVybiAhaXNOZWVkcmVzdGFydE5vb3BTdW1tYXJ5TGluZSh0cmltbWVkKVxuXHRcdFx0JiYgcmVnZXhUZXN0V2l0aEZsYWdzKFxuXHRcdFx0XHRTdHJpbmcucmF3YFxcYig/OnBlbmRpbmd8cmVib290fHJlcXVpcmVkfHJlc3RhcnQtbmVlZGVkfE5FRURSRVNUQVJULXxPdXRkYXRlZCBMaWJyYXJpZXN8U2VydmljZXMgdG8gYmUgcmVzdGFydGVkfENvbnRhaW5lcnMgdG8gYmUgcmVzdGFydGVkfFVzZXIgc2Vzc2lvbnMgcnVubmluZyBvdXRkYXRlZHxWTSBndWVzdHMgYXJlIHJ1bm5pbmcgb3V0ZGF0ZWR8bmVlZCByZXN0YXJ0aW5nKVxcYmAsXG5cdFx0XHRcdHRyaW1tZWQsXG5cdFx0XHRcdCdpJyxcblx0XHRcdCk7XG5cdH0pO1xufVxuXG5mdW5jdGlvbiBjb21wYWN0TmVlZHJlc3RhcnRQcm9ncmVzc0xpbmUobGluZTogc3RyaW5nKTogQ29tcGFjdGVkTGluZSB7XG5cdGlmICghbGluZS5pbmNsdWRlcygnU2Nhbm5pbmcgJykpIHtcblx0XHRyZXR1cm4gdW5jaGFuZ2VkTGluZShsaW5lKTtcblx0fVxuXHRjb25zdCByZXN1bHQgPSByZW1vdmVQcm9ncmVzc01hdGNoZXMoXG5cdFx0bGluZSxcblx0XHRTdHJpbmcucmF3YFNjYW5uaW5nICg/OnByb2Nlc3Nlc3xwcm9jZXNzb3IgbWljcm9jb2RlfGxpbnV4IGltYWdlcylcXC5cXC5cXC4gXFxbW15cXF1cXG5dKlxcXVxccypgLFxuXHQpO1xuXHRyZXR1cm4ge1xuXHRcdG91dHB1dDogcmVzdWx0Lm91dHB1dC50cmltKCkubGVuZ3RoID09PSAwID8gJ1tuZWVkcmVzdGFydCBwcm9ncmVzc10nIDogcmVzdWx0Lm91dHB1dCxcblx0XHRvbWl0dGVkRnJhbWVzOiByZXN1bHQub21pdHRlZEZyYW1lcyxcblx0fTtcbn1cblxuZnVuY3Rpb24gY29tcGFjdEFwdERwa2dMaWZlY3ljbGVCbG9ja3Mob3V0cHV0OiBzdHJpbmcpOiBzdHJpbmcge1xuXHRyZXR1cm4gY29sbGFwc2VDb250aWd1b3VzUnVucyhvdXRwdXQsIGlzQXB0RHBrZ0xpZmVjeWNsZUxpbmUsIDQsIGJsb2NrID0+IHtcblx0XHRjb25zdCBwYWNrYWdlczogW3N0cmluZywgc3RyaW5nIHwgdW5kZWZpbmVkXVtdID0gW107XG5cdFx0bGV0IHRyaWdnZXJDb3VudCA9IDA7XG5cdFx0Zm9yIChjb25zdCBsaW5lIG9mIGJsb2NrKSB7XG5cdFx0XHRjb25zdCBwYXJzZWQgPSBwYXJzZUFwdFBhY2thZ2VMaWZlY3ljbGVMaW5lKGxpbmUpO1xuXHRcdFx0aWYgKHBhcnNlZCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdGNvbnN0IFtuYW1lLCB2ZXJzaW9uXSA9IHBhcnNlZDtcblx0XHRcdFx0Y29uc3QgZXhpc3RpbmcgPSBwYWNrYWdlcy5maW5kKGNhbmRpZGF0ZSA9PiBjYW5kaWRhdGVbMF0gPT09IG5hbWUpO1xuXHRcdFx0XHRpZiAoZXhpc3RpbmcgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdGV4aXN0aW5nWzFdID0gdmVyc2lvbjtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRwYWNrYWdlcy5wdXNoKFtuYW1lLCB2ZXJzaW9uXSk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSBpZiAobGluZS5zdGFydHNXaXRoKCdQcm9jZXNzaW5nIHRyaWdnZXJzIGZvciAnKSkge1xuXHRcdFx0XHR0cmlnZ2VyQ291bnQgKz0gMTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAocGFja2FnZXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBwYWNrYWdlU3VtbWFyeSA9IHN1bW1hcml6ZVBhY2thZ2VzKHBhY2thZ2VzKTtcblx0XHRjb25zdCB0cmlnZ2VyU3VtbWFyeSA9IHRyaWdnZXJDb3VudCA+IDAgPyBgOyAke3RyaWdnZXJDb3VudH0gdHJpZ2dlciBsaW5lKHMpYCA6ICcnO1xuXHRcdHJldHVybiBgW2FwdCBwYWNrYWdlczogaW5zdGFsbGVkICR7cGFja2FnZXMubGVuZ3RofSBwYWNrYWdlKHMpOiAke3BhY2thZ2VTdW1tYXJ5fTsgb21pdHRlZCAke2Jsb2NrLmxlbmd0aH0gZHBrZyBsaWZlY3ljbGUgbGluZShzKSR7dHJpZ2dlclN1bW1hcnl9XWA7XG5cdH0pO1xufVxuXG5mdW5jdGlvbiBpc0FwdERwa2dMaWZlY3ljbGVMaW5lKGxpbmU6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gIWlzRGlhZ25vc3RpY0xpbmUobGluZSlcblx0XHQmJiAobGluZS5zdGFydHNXaXRoKCdTZWxlY3RpbmcgcHJldmlvdXNseSB1bnNlbGVjdGVkIHBhY2thZ2UgJylcblx0XHRcdHx8IGxpbmUuc3RhcnRzV2l0aCgnUHJlcGFyaW5nIHRvIHVucGFjayAnKVxuXHRcdFx0fHwgbGluZS5zdGFydHNXaXRoKCdVbnBhY2tpbmcgJylcblx0XHRcdHx8IGxpbmUuc3RhcnRzV2l0aCgnU2V0dGluZyB1cCAnKVxuXHRcdFx0fHwgbGluZS5zdGFydHNXaXRoKCdQcm9jZXNzaW5nIHRyaWdnZXJzIGZvciAnKVxuXHRcdFx0fHwgcmVnZXhUZXN0KFN0cmluZy5yYXdgXnJ1bm5pbmcgcHl0aG9uICg/OnByZS18cG9zdC0pP3J0dXBkYXRlIGhvb2tzIGZvciBgLCBsaW5lKVxuXHRcdFx0fHwgcmVnZXhUZXN0KFxuXHRcdFx0XHRTdHJpbmcucmF3YF5cXChSZWFkaW5nIGRhdGFiYXNlIFxcLlxcLlxcLiBcXGQrIGZpbGVzIGFuZCBkaXJlY3RvcmllcyBjdXJyZW50bHkgaW5zdGFsbGVkXFwuXFwpJGAsXG5cdFx0XHRcdGxpbmUsXG5cdFx0XHQpKTtcbn1cblxuZnVuY3Rpb24gcGFyc2VBcHRQYWNrYWdlTGlmZWN5Y2xlTGluZShsaW5lOiBzdHJpbmcpOiBbc3RyaW5nLCBzdHJpbmcgfCB1bmRlZmluZWRdIHwgdW5kZWZpbmVkIHtcblx0Y29uc3Qgc2VsZWN0aW5nID0gc3RyaXBQcmVmaXgobGluZSwgJ1NlbGVjdGluZyBwcmV2aW91c2x5IHVuc2VsZWN0ZWQgcGFja2FnZSAnKTtcblx0aWYgKHNlbGVjdGluZyAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0Y29uc3QgbmFtZSA9IHN0cmlwU3VmZml4KHNlbGVjdGluZywgJy4nKTtcblx0XHRpZiAobmFtZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm4gW25hbWUsIHVuZGVmaW5lZF07XG5cdFx0fVxuXHR9XG5cdGNvbnN0IHVucGFja2luZ09yU2V0dGluZyA9IHN0cmlwUHJlZml4KGxpbmUsICdVbnBhY2tpbmcgJykgPz8gc3RyaXBQcmVmaXgobGluZSwgJ1NldHRpbmcgdXAgJyk7XG5cdGlmICh1bnBhY2tpbmdPclNldHRpbmcgIT09IHVuZGVmaW5lZCkge1xuXHRcdGNvbnN0IG5hbWVTcGxpdCA9IHNwbGl0T25jZSh1bnBhY2tpbmdPclNldHRpbmcsICcgKCcpO1xuXHRcdGlmIChuYW1lU3BsaXQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0Y29uc3QgdmVyc2lvblNwbGl0ID0gc3BsaXRPbmNlKG5hbWVTcGxpdFsxXSwgJyknKTtcblx0XHRcdGlmICh2ZXJzaW9uU3BsaXQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRyZXR1cm4gW25hbWVTcGxpdFswXSwgdmVyc2lvblNwbGl0WzBdXTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblx0Y29uc3QgcHJlcGFyaW5nID0gc3RyaXBQcmVmaXgobGluZSwgJ1ByZXBhcmluZyB0byB1bnBhY2sgJyk7XG5cdGlmIChwcmVwYXJpbmcgIT09IHVuZGVmaW5lZCkge1xuXHRcdGNvbnN0IGRlYlNwbGl0ID0gc3BsaXRPbmNlKHByZXBhcmluZywgJyAnKTtcblx0XHRpZiAoZGViU3BsaXQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0Y29uc3QgZGViU2VnbWVudHMgPSBkZWJTcGxpdFswXS5zcGxpdCgnLycpO1xuXHRcdFx0Y29uc3QgZmlsZU5hbWUgPSBkZWJTZWdtZW50c1tkZWJTZWdtZW50cy5sZW5ndGggLSAxXTtcblx0XHRcdGNvbnN0IG5hbWVTcGxpdCA9IHNwbGl0T25jZShmaWxlTmFtZSwgJ18nKTtcblx0XHRcdGlmIChuYW1lU3BsaXQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRjb25zdCB2ZXJzaW9uU3BsaXQgPSByc3BsaXRPbmNlKG5hbWVTcGxpdFsxXSwgJ18nKTtcblx0XHRcdFx0aWYgKHZlcnNpb25TcGxpdCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0cmV0dXJuIFtuYW1lU3BsaXRbMF0sIHZlcnNpb25TcGxpdFswXV07XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblx0cmV0dXJuIHVuZGVmaW5lZDtcbn1cblxuZnVuY3Rpb24gc3VtbWFyaXplUGFja2FnZXMocGFja2FnZXM6IHJlYWRvbmx5IFtzdHJpbmcsIHN0cmluZyB8IHVuZGVmaW5lZF1bXSk6IHN0cmluZyB7XG5cdHJldHVybiBzdW1tYXJpemVXaXRoTW9yZShcblx0XHRwYWNrYWdlcy5tYXAoKFtuYW1lLCB2ZXJzaW9uXSkgPT4gdmVyc2lvbiAhPT0gdW5kZWZpbmVkID8gYCR7bmFtZX0gKCR7dmVyc2lvbn0pYCA6IG5hbWUpLFxuXHRcdDE4LFxuXHQpO1xufVxuXG5mdW5jdGlvbiBpc0FwdFByb2dyZXNzTGluZShsaW5lOiBzdHJpbmcpOiBib29sZWFuIHtcblx0cmV0dXJuICFpc0RpYWdub3N0aWNMaW5lKGxpbmUpXG5cdFx0JiYgKHJlZ2V4VGVzdChTdHJpbmcucmF3YF5cXGQrJSBcXFtgLCBsaW5lKVxuXHRcdFx0fHwgcmVnZXhUZXN0KFN0cmluZy5yYXdgXFxiKD86SGl0fEdldHxJZ24pOlxcZCsgYCwgbGluZSlcblx0XHRcdHx8IGxpbmUuaW5jbHVkZXMoJ1JlYWRpbmcgcGFja2FnZSBsaXN0cy4uLicpXG5cdFx0XHR8fCBsaW5lLmluY2x1ZGVzKCdCdWlsZGluZyBkZXBlbmRlbmN5IHRyZWUuLi4nKVxuXHRcdFx0fHwgbGluZS5pbmNsdWRlcygnUmVhZGluZyBzdGF0ZSBpbmZvcm1hdGlvbi4uLicpXG5cdFx0XHR8fCBsaW5lLnN0YXJ0c1dpdGgoJ1NlbGVjdGluZyBwcmV2aW91c2x5IHVuc2VsZWN0ZWQgcGFja2FnZSAnKVxuXHRcdFx0fHwgbGluZS5zdGFydHNXaXRoKCdQcmVwYXJpbmcgdG8gdW5wYWNrICcpXG5cdFx0XHR8fCBsaW5lLnN0YXJ0c1dpdGgoJ1VucGFja2luZyAnKVxuXHRcdFx0fHwgbGluZS5zdGFydHNXaXRoKCdTZXR0aW5nIHVwICcpXG5cdFx0XHR8fCBsaW5lLnN0YXJ0c1dpdGgoJ1Byb2Nlc3NpbmcgdHJpZ2dlcnMgZm9yICcpXG5cdFx0XHR8fCBsaW5lLnN0YXJ0c1dpdGgoJ0ZldGNoZWQgJylcblx0XHRcdHx8IGxpbmUuc3RhcnRzV2l0aCgnTmVlZCB0byBnZXQgJylcblx0XHRcdHx8IGxpbmUuc3RhcnRzV2l0aCgnQWZ0ZXIgdGhpcyBvcGVyYXRpb24gJylcblx0XHRcdHx8IGxpbmUuc3RhcnRzV2l0aCgnZGViY29uZjogJylcblx0XHRcdHx8IGxpbmUuc3RhcnRzV2l0aCgnKFJlYWRpbmcgZGF0YWJhc2UgJykpO1xufVxuXG5mdW5jdGlvbiBpc1B5dGhvbkVjb3N5c3RlbU5vaXNlTGluZShsaW5lOiBzdHJpbmcpOiBib29sZWFuIHtcblx0cmV0dXJuIGxpbmUuc3RhcnRzV2l0aChgV0FSTklORzogUnVubmluZyBwaXAgYXMgdGhlICdyb290JyB1c2VyIGNhbiByZXN1bHQgaW4gYnJva2VuIHBlcm1pc3Npb25zYClcblx0XHR8fCBsaW5lLnN0YXJ0c1dpdGgoJ0l0IGlzIHJlY29tbWVuZGVkIHRvIHVzZSBhIHZpcnR1YWwgZW52aXJvbm1lbnQgaW5zdGVhZDogJylcblx0XHR8fCBsaW5lLmluY2x1ZGVzKCdEZXByZWNhdGlvbldhcm5pbmc6IFRoZSBkaXN0dXRpbHMgcGFja2FnZSBpcyBkZXByZWNhdGVkJylcblx0XHR8fCBsaW5lLmluY2x1ZGVzKCdTZXR1cHRvb2xzRGVwcmVjYXRpb25XYXJuaW5nOicpXG5cdFx0fHwgbGluZS5pbmNsdWRlcygnYG51bXB5LmRpc3R1dGlsc2AgaXMgZGVwcmVjYXRlZCBzaW5jZSBOdW1QeSAxLjIzLjAnKVxuXHRcdHx8IGxpbmUuc3RhcnRzV2l0aCgnUGFydGlhbCBpbXBvcnQgb2Ygc2tsZWFybiBkdXJpbmcgdGhlIGJ1aWxkIHByb2Nlc3MuJylcblx0XHR8fCBsaW5lLnN0YXJ0c1dpdGgoJ01hdHBsb3RsaWIgaXMgbm90IGJ1aWx0IHdpdGggdGhlIGNvcnJlY3QgRnJlZVR5cGUgdmVyc2lvbicpO1xufVxuXG5mdW5jdGlvbiBjb21wYWN0U2V0dXB0b29sc0RlcHJlY2F0aW9uQmxvY2tzKG91dHB1dDogc3RyaW5nKTogc3RyaW5nIHtcblx0aWYgKCFvdXRwdXQuaW5jbHVkZXMoJ1NldHVwdG9vbHNEZXByZWNhdGlvbldhcm5pbmcnKVxuXHRcdCYmICFvdXRwdXQuaW5jbHVkZXMoJ0Vhc3lJbnN0YWxsRGVwcmVjYXRpb25XYXJuaW5nJylcblx0XHQmJiAhb3V0cHV0LmluY2x1ZGVzKCdEZXByZWNhdGlvbldhcm5pbmc6Jylcblx0KSB7XG5cdFx0cmV0dXJuIG91dHB1dDtcblx0fVxuXG5cdGNvbnN0IGxpbmVzID0gb3V0cHV0LnNwbGl0KCdcXG4nKTtcblx0Y29uc3QgY29tcGFjdGVkOiBzdHJpbmdbXSA9IFtdO1xuXHRsZXQgaSA9IDA7XG5cdHdoaWxlIChpIDwgbGluZXMubGVuZ3RoKSB7XG5cdFx0aWYgKCFpc1NldHVwdG9vbHNEZXByZWNhdGlvbkhlYWRlcihsaW5lc1tpXSkpIHtcblx0XHRcdGNvbXBhY3RlZC5wdXNoKGxpbmVzW2ldKTtcblx0XHRcdGkgKz0gMTtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblxuXHRcdGNvbnN0IHN0YXJ0ID0gaTtcblx0XHRpICs9IDE7XG5cdFx0bGV0IHNlZW5TZW50aW5lbCA9IGZhbHNlO1xuXHRcdHdoaWxlIChpIDwgbGluZXMubGVuZ3RoICYmIGkgLSBzdGFydCA8IDMwKSB7XG5cdFx0XHRjb25zdCBsaW5lID0gbGluZXNbaV07XG5cdFx0XHRpZiAoaXNTdHJpY3RDb21waWxlckRpYWdub3N0aWNMaW5lKGxpbmUpIHx8IGlzVW5zYWZlQ29tcGFjdGlvbkNvbnRleHRMaW5lKGxpbmUpKSB7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHJlZ2V4VGVzdChTdHJpbmcucmF3YF5cXHMqISFcXHMqJGAsIGxpbmUpKSB7XG5cdFx0XHRcdGlmIChzZWVuU2VudGluZWwpIHtcblx0XHRcdFx0XHRpICs9IDE7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0c2VlblNlbnRpbmVsID0gdHJ1ZTtcblx0XHRcdFx0aSArPSAxO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGlmIChsaW5lLnRyaW0oKS5sZW5ndGggPT09IDBcblx0XHRcdFx0JiYgaSArIDEgPCBsaW5lcy5sZW5ndGhcblx0XHRcdFx0JiYgcmVnZXhUZXN0KFN0cmluZy5yYXdgXlxcU2AsIGxpbmVzW2kgKyAxXSlcblx0XHRcdFx0JiYgIWlzU2V0dXB0b29sc0Jhbm5lckxpbmUobGluZXNbaSArIDFdKVxuXHRcdFx0KSB7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCFpc1NldHVwdG9vbHNCYW5uZXJMaW5lKGxpbmUpICYmIHJlZ2V4VGVzdChTdHJpbmcucmF3YF5cXFNgLCBsaW5lKSkge1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGkgKz0gMTtcblx0XHR9XG5cblx0XHRjb25zdCBibG9jayA9IGxpbmVzLnNsaWNlKHN0YXJ0LCBpKTtcblx0XHRpZiAoYmxvY2subGVuZ3RoID49IDNcblx0XHRcdCYmICFibG9jay5zbGljZSgxKS5zb21lKGxpbmUgPT4gaXNVbnNhZmVDb21wYWN0aW9uQ29udGV4dExpbmUobGluZSkpXG5cdFx0KSB7XG5cdFx0XHRjb21wYWN0ZWQucHVzaChgW3NldHVwdG9vbHMgZGVwcmVjYXRpb246ICR7c2V0dXB0b29sc1dhcm5pbmdOYW1lKGJsb2NrWzBdKX07IG9taXR0ZWQgJHtibG9jay5sZW5ndGggLSAxfSBiYW5uZXIgbGluZShzKV1gKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Zm9yIChjb25zdCBsaW5lIG9mIGJsb2NrKSB7XG5cdFx0XHRcdGNvbXBhY3RlZC5wdXNoKGxpbmUpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXHRyZXR1cm4gY29tcGFjdGVkLmpvaW4oJ1xcbicpO1xufVxuXG5mdW5jdGlvbiBpc1NldHVwdG9vbHNEZXByZWNhdGlvbkhlYWRlcihsaW5lOiBzdHJpbmcpOiBib29sZWFuIHtcblx0cmV0dXJuIGxpbmUuaW5jbHVkZXMoJ1NldHVwdG9vbHNEZXByZWNhdGlvbldhcm5pbmc6Jylcblx0XHR8fCBsaW5lLmluY2x1ZGVzKCdFYXN5SW5zdGFsbERlcHJlY2F0aW9uV2FybmluZzonKVxuXHRcdHx8IGxpbmUuaW5jbHVkZXMoJ0RlcHJlY2F0aW9uV2FybmluZzonKTtcbn1cblxuZnVuY3Rpb24gc2V0dXB0b29sc1dhcm5pbmdOYW1lKGxpbmU6IHN0cmluZyk6IHN0cmluZyB7XG5cdHJldHVybiByZWdleENhcHR1cmVGaXJzdChcblx0XHRTdHJpbmcucmF3YChbQS1aYS16X11bQS1aYS16MC05X10qRGVwcmVjYXRpb25XYXJuaW5nfERlcHJlY2F0aW9uV2FybmluZyk6YCxcblx0XHRsaW5lLFxuXHQpID8/ICdkZXByZWNhdGlvbiB3YXJuaW5nJztcbn1cblxuZnVuY3Rpb24gaXNTZXR1cHRvb2xzQmFubmVyTGluZShsaW5lOiBzdHJpbmcpOiBib29sZWFuIHtcblx0cmV0dXJuIGxpbmUudHJpbSgpLmxlbmd0aCA9PT0gMFxuXHRcdHx8IHN0YXJ0c1dpdGhXaGl0ZXNwYWNlKGxpbmUpXG5cdFx0fHwgcmVnZXhUZXN0KFN0cmluZy5yYXdgXlxccypbLSEqXXszLH1cXHMqJGAsIGxpbmUpXG5cdFx0fHwgaXNTZXR1cHRvb2xzRGVwcmVjYXRpb25IZWFkZXIobGluZSk7XG59XG5cbmZ1bmN0aW9uIGNvbXBhY3RDeXRob25QZXJmb3JtYW5jZUhpbnRzKG91dHB1dDogc3RyaW5nKTogc3RyaW5nIHtcblx0aWYgKCFvdXRwdXQuaW5jbHVkZXMoJ3BlcmZvcm1hbmNlIGhpbnQ6JykpIHtcblx0XHRyZXR1cm4gb3V0cHV0O1xuXHR9XG5cblx0Y29uc3QgbGluZXMgPSBvdXRwdXQuc3BsaXQoJ1xcbicpO1xuXHRjb25zdCBjb21wYWN0ZWQ6IHN0cmluZ1tdID0gW107XG5cdGxldCBvbWl0dGVkID0gMDtcblx0bGV0IGtlcHRGaXJzdEluUnVuID0gZmFsc2U7XG5cdGNvbnN0IGZsdXNoID0gKCkgPT4ge1xuXHRcdGlmIChvbWl0dGVkID4gMCkge1xuXHRcdFx0Y29tcGFjdGVkLnB1c2goYFtjeXRob24gcGVyZm9ybWFuY2UgaGludHM6IG9taXR0ZWQgJHtvbWl0dGVkfSBoaW50IGJsb2NrKHMpXWApO1xuXHRcdFx0b21pdHRlZCA9IDA7XG5cdFx0fVxuXHRcdGtlcHRGaXJzdEluUnVuID0gZmFsc2U7XG5cdH07XG5cblx0bGV0IGkgPSAwO1xuXHR3aGlsZSAoaSA8IGxpbmVzLmxlbmd0aCkge1xuXHRcdGlmICghaXNDeXRob25QZXJmb3JtYW5jZUhpbnRIZWFkZXIobGluZXNbaV0pKSB7XG5cdFx0XHRmbHVzaCgpO1xuXHRcdFx0Y29tcGFjdGVkLnB1c2gobGluZXNbaV0pO1xuXHRcdFx0aSArPSAxO1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc3RhcnQgPSBpO1xuXHRcdGkgKz0gMTtcblx0XHRsZXQgaGFzVW5zYWZlQ29udGV4dCA9IGZhbHNlO1xuXHRcdHdoaWxlIChpIDwgbGluZXMubGVuZ3RoICYmIGkgLSBzdGFydCA8IDEyKSB7XG5cdFx0XHRjb25zdCBsaW5lID0gbGluZXNbaV07XG5cdFx0XHRpZiAoaXNDeXRob25QZXJmb3JtYW5jZUhpbnRIZWFkZXIobGluZSlcblx0XHRcdFx0fHwgaXNTdHJpY3RDb21waWxlckRpYWdub3N0aWNMaW5lKGxpbmUpXG5cdFx0XHRcdHx8IGlzVW5zYWZlQ29tcGFjdGlvbkNvbnRleHRMaW5lKGxpbmUpXG5cdFx0XHQpIHtcblx0XHRcdFx0aGFzVW5zYWZlQ29udGV4dCA9IGlzVW5zYWZlQ29tcGFjdGlvbkNvbnRleHRMaW5lKGxpbmUpO1xuXHRcdFx0XHRpZiAoaGFzVW5zYWZlQ29udGV4dCkge1xuXHRcdFx0XHRcdGkgKz0gMTtcblx0XHRcdFx0fVxuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGlmIChsaW5lLnRyaW0oKS5sZW5ndGggPT09IDBcblx0XHRcdFx0JiYgaSArIDEgPCBsaW5lcy5sZW5ndGhcblx0XHRcdFx0JiYgIXN0YXJ0c1dpdGhXaGl0ZXNwYWNlKGxpbmVzW2kgKyAxXSlcblx0XHRcdCkge1xuXHRcdFx0XHRpICs9IDE7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCFzdGFydHNXaXRoV2hpdGVzcGFjZShsaW5lKSAmJiAhbGluZS5zdGFydHNXaXRoKCdQb3NzaWJsZSBzb2x1dGlvbnM6JykpIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRpICs9IDE7XG5cdFx0fVxuXG5cdFx0Y29uc3QgYmxvY2sgPSBsaW5lcy5zbGljZShzdGFydCwgaSk7XG5cdFx0aWYgKGhhc1Vuc2FmZUNvbnRleHQpIHtcblx0XHRcdGZsdXNoKCk7XG5cdFx0XHRmb3IgKGNvbnN0IGxpbmUgb2YgYmxvY2spIHtcblx0XHRcdFx0Y29tcGFjdGVkLnB1c2gobGluZSk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmICgha2VwdEZpcnN0SW5SdW4pIHtcblx0XHRcdGZvciAoY29uc3QgbGluZSBvZiBibG9jaykge1xuXHRcdFx0XHRjb21wYWN0ZWQucHVzaChsaW5lKTtcblx0XHRcdH1cblx0XHRcdGtlcHRGaXJzdEluUnVuID0gdHJ1ZTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0b21pdHRlZCArPSAxO1xuXHRcdH1cblx0fVxuXHRmbHVzaCgpO1xuXHRyZXR1cm4gY29tcGFjdGVkLmpvaW4oJ1xcbicpO1xufVxuXG5mdW5jdGlvbiBpc0N5dGhvblBlcmZvcm1hbmNlSGludEhlYWRlcihsaW5lOiBzdHJpbmcpOiBib29sZWFuIHtcblx0cmV0dXJuIHJlZ2V4VGVzdChTdHJpbmcucmF3YF5cXFMrXFwucHl4OlxcZCs6XFxkKzpcXHMrcGVyZm9ybWFuY2UgaGludDogYCwgbGluZSk7XG59XG5cbmZ1bmN0aW9uIGNvbXBhY3RDb21waWxlcldhcm5pbmdSdW5zKG91dHB1dDogc3RyaW5nKTogc3RyaW5nIHtcblx0aWYgKCFyZWdleFRlc3QoXG5cdFx0U3RyaW5nLnJhd2AoPzpefFxcbikoPzpcXFMrOlxcZCsoPzo6XFxkKyk/OlxccyooPzp3YXJuaW5nfCg/OmZhdGFsXFxzKyk/ZXJyb3IpOnxcXFMrOlxccyppbnRlcm5hbCBjb21waWxlciBlcnJvcjp8ZXJyb3I6IGNvbW1hbmQgLisgZmFpbGVkXFxiKWAsXG5cdFx0b3V0cHV0LFxuXHQpKSB7XG5cdFx0cmV0dXJuIG91dHB1dDtcblx0fVxuXG5cdGNvbnN0IGlucHV0RXJyb3JDb3VudCA9IGNvdW50Q29tcGlsZXJFcnJvckxpbmVzKG91dHB1dCk7XG5cdGNvbnN0IGxpbmVzID0gb3V0cHV0LnNwbGl0KCdcXG4nKTtcblx0Y29uc3QgY29tcGFjdGVkOiBzdHJpbmdbXSA9IFtdO1xuXHRsZXQgaSA9IDA7XG5cdHdoaWxlIChpIDwgbGluZXMubGVuZ3RoKSB7XG5cdFx0Y29uc3QgcnVuID0gY29sbGVjdENvbXBpbGVyRGlhZ25vc3RpY1J1bihsaW5lcywgaSk7XG5cdFx0aWYgKHJ1biA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRjb21wYWN0ZWQucHVzaChsaW5lc1tpXSk7XG5cdFx0XHRpICs9IDE7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cdFx0aWYgKHJ1bi5ibG9ja3MubGVuZ3RoIDwgNCkge1xuXHRcdFx0Y29tcGFjdGVkLnB1c2gobGluZXNbaV0pO1xuXHRcdFx0aSArPSAxO1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXHRcdGlmIChydW4uaGFzRXJyb3IpIHtcblx0XHRcdGZvciAobGV0IGsgPSBpOyBrIDwgcnVuLmVuZDsgaysrKSB7XG5cdFx0XHRcdGNvbXBhY3RlZC5wdXNoKGxpbmVzW2tdKTtcblx0XHRcdH1cblx0XHRcdGkgPSBydW4uZW5kO1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCBibG9jayBvZiBydW4uYmxvY2tzLnNsaWNlKDAsIDIpKSB7XG5cdFx0XHRjb21wYWN0ZWQucHVzaCguLi5ibG9jay5saW5lcyk7XG5cdFx0fVxuXHRcdGNvbXBhY3RlZC5wdXNoKGBbY29tcGlsZXIgd2FybmluZ3M6IG9taXR0ZWQgJHtydW4uYmxvY2tzLmxlbmd0aCAtIDN9IHdhcm5pbmcgYmxvY2socyldYCk7XG5cdFx0Y29tcGFjdGVkLnB1c2goLi4ucnVuLmJsb2Nrc1tydW4uYmxvY2tzLmxlbmd0aCAtIDFdLmxpbmVzKTtcblx0XHRpID0gcnVuLmVuZDtcblx0fVxuXG5cdGNvbnN0IGNvbXBhY3RlZE91dHB1dCA9IGNvbXBhY3RlZC5qb2luKCdcXG4nKTtcblx0aWYgKGNvdW50Q29tcGlsZXJFcnJvckxpbmVzKGNvbXBhY3RlZE91dHB1dCkgPT09IGlucHV0RXJyb3JDb3VudCkge1xuXHRcdHJldHVybiBjb21wYWN0ZWRPdXRwdXQ7XG5cdH1cblx0cmV0dXJuIG91dHB1dDtcbn1cblxuaW50ZXJmYWNlIENvbXBpbGVyRGlhZ25vc3RpY0Jsb2NrIHtcblx0bGluZXM6IHN0cmluZ1tdO1xuXHRraW5kOiAnd2FybmluZycgfCAnZXJyb3InO1xufVxuXG5pbnRlcmZhY2UgQ29tcGlsZXJEaWFnbm9zdGljUnVuIHtcblx0YmxvY2tzOiBDb21waWxlckRpYWdub3N0aWNCbG9ja1tdO1xuXHRlbmQ6IG51bWJlcjtcblx0aGFzRXJyb3I6IGJvb2xlYW47XG59XG5cbmZ1bmN0aW9uIGNvbGxlY3RDb21waWxlckRpYWdub3N0aWNSdW4obGluZXM6IHJlYWRvbmx5IHN0cmluZ1tdLCBzdGFydDogbnVtYmVyKTogQ29tcGlsZXJEaWFnbm9zdGljUnVuIHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgYmxvY2tzOiBDb21waWxlckRpYWdub3N0aWNCbG9ja1tdID0gW107XG5cdGxldCBpID0gc3RhcnQ7XG5cdGxldCBoYXNFcnJvciA9IGZhbHNlO1xuXHR3aGlsZSAoaSA8IGxpbmVzLmxlbmd0aCkge1xuXHRcdGNvbnN0IGtpbmQgPSBjb21waWxlckRpYWdub3N0aWNLaW5kKGxpbmVzW2ldKTtcblx0XHRpZiAoa2luZCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRicmVhaztcblx0XHR9XG5cblx0XHRjb25zdCBibG9ja1N0YXJ0ID0gaTtcblx0XHRpICs9IDE7XG5cdFx0bGV0IGNvbnRleHRMaW5lcyA9IDA7XG5cdFx0d2hpbGUgKGkgPCBsaW5lcy5sZW5ndGhcblx0XHRcdCYmIGNvbnRleHRMaW5lcyA8IDRcblx0XHRcdCYmIGNvbXBpbGVyRGlhZ25vc3RpY0tpbmQobGluZXNbaV0pID09PSB1bmRlZmluZWRcblx0XHRcdCYmIGxpbmVzW2ldLnRyaW0oKS5sZW5ndGggIT09IDBcblx0XHQpIHtcblx0XHRcdGlmIChpc0RpYWdub3N0aWNMaW5lKGxpbmVzW2ldKSB8fCBpc0NvbXBpbGVyQ29udGV4dEVycm9yTGluZShsaW5lc1tpXSkpIHtcblx0XHRcdFx0aGFzRXJyb3IgPSB0cnVlO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGkgKz0gMTtcblx0XHRcdGNvbnRleHRMaW5lcyArPSAxO1xuXHRcdH1cblx0XHRibG9ja3MucHVzaCh7IGxpbmVzOiBsaW5lcy5zbGljZShibG9ja1N0YXJ0LCBpKSwga2luZCB9KTtcblx0XHRoYXNFcnJvciA9IGhhc0Vycm9yIHx8IGtpbmQgPT09ICdlcnJvcic7XG5cdFx0aWYgKGkgPCBsaW5lcy5sZW5ndGggJiYgbGluZXNbaV0udHJpbSgpLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0YnJlYWs7XG5cdFx0fVxuXHR9XG5cdGlmIChibG9ja3MubGVuZ3RoID09PSAwKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRyZXR1cm4geyBibG9ja3MsIGVuZDogaSwgaGFzRXJyb3IgfTtcbn1cblxuZnVuY3Rpb24gY29tcGlsZXJEaWFnbm9zdGljS2luZChsaW5lOiBzdHJpbmcpOiAnd2FybmluZycgfCAnZXJyb3InIHwgdW5kZWZpbmVkIHtcblx0aWYgKGlzQ29tcGlsZXJFcnJvckxpbmUobGluZSkpIHtcblx0XHRyZXR1cm4gJ2Vycm9yJztcblx0fVxuXHRpZiAocmVnZXhUZXN0KFN0cmluZy5yYXdgXlxcUys6XFxkKyg/OjpcXGQrKT86XFxzKndhcm5pbmc6XFxzYCwgbGluZSkpIHtcblx0XHRyZXR1cm4gJ3dhcm5pbmcnO1xuXHR9XG5cdHJldHVybiB1bmRlZmluZWQ7XG59XG5cbmZ1bmN0aW9uIGlzU3RyaWN0Q29tcGlsZXJEaWFnbm9zdGljTGluZShsaW5lOiBzdHJpbmcpOiBib29sZWFuIHtcblx0cmV0dXJuIGNvbXBpbGVyRGlhZ25vc3RpY0tpbmQobGluZSkgIT09IHVuZGVmaW5lZFxuXHRcdHx8IHJlZ2V4VGVzdChTdHJpbmcucmF3YF5cXFMrOlxcZCsoPzo6XFxkKyk/Olxccypub3RlOlxcc2AsIGxpbmUpO1xufVxuXG5mdW5jdGlvbiBpc0NvbXBpbGVyRXJyb3JMaW5lKGxpbmU6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gcmVnZXhUZXN0KFN0cmluZy5yYXdgXlxcUys6XFxkKyg/OjpcXGQrKT86XFxzKig/OmZhdGFsXFxzKyk/ZXJyb3I6XFxzYCwgbGluZSlcblx0XHR8fCByZWdleFRlc3QoU3RyaW5nLnJhd2BeXFxTKzpcXHMqaW50ZXJuYWwgY29tcGlsZXIgZXJyb3I6XFxzYCwgbGluZSlcblx0XHR8fCByZWdleFRlc3QoU3RyaW5nLnJhd2BeZXJyb3I6IGNvbW1hbmQgLisgZmFpbGVkXFxiYCwgbGluZSk7XG59XG5cbmZ1bmN0aW9uIGlzQ29tcGlsZXJDb250ZXh0RXJyb3JMaW5lKGxpbmU6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gcmVnZXhUZXN0V2l0aEZsYWdzKFN0cmluZy5yYXdgXig/OmZhdGFsIGVycm9yfGVycm9yKTpcXHNgLCBsaW5lLCAnaScpXG5cdFx0fHwgbGluZS5zdGFydHNXaXRoKCdUcmFjZWJhY2sgKG1vc3QgcmVjZW50IGNhbGwgbGFzdCk6Jyk7XG59XG5cbmZ1bmN0aW9uIGlzVW5zYWZlQ29tcGFjdGlvbkNvbnRleHRMaW5lKGxpbmU6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gaXNDb21waWxlckNvbnRleHRFcnJvckxpbmUobGluZS50cmltU3RhcnQoKSk7XG59XG5cbmZ1bmN0aW9uIGNvdW50Q29tcGlsZXJFcnJvckxpbmVzKG91dHB1dDogc3RyaW5nKTogbnVtYmVyIHtcblx0cmV0dXJuIG91dHB1dC5zcGxpdCgnXFxuJykuZmlsdGVyKGxpbmUgPT5cblx0XHRpc0NvbXBpbGVyRXJyb3JMaW5lKGxpbmUpIHx8IGlzVW5zYWZlQ29tcGFjdGlvbkNvbnRleHRMaW5lKGxpbmUpKS5sZW5ndGg7XG59XG5cbmZ1bmN0aW9uIGlzUGlwSW5zdGFsbFByb2dyZXNzTGluZShsaW5lOiBzdHJpbmcpOiBib29sZWFuIHtcblx0cmV0dXJuIGlzUGlwUm9vdFVzZXJXYXJuaW5nKGxpbmUpXG5cdFx0fHwgKCFpc0RpYWdub3N0aWNMaW5lKGxpbmUpXG5cdFx0XHQmJiAobGluZS5zdGFydHNXaXRoKCdMb29raW5nIGluIGluZGV4ZXM6ICcpXG5cdFx0XHRcdHx8IGxpbmUuc3RhcnRzV2l0aCgnTG9va2luZyBpbiBsaW5rczogJylcblx0XHRcdFx0fHwgbGluZS5zdGFydHNXaXRoKCdDb2xsZWN0aW5nICcpXG5cdFx0XHRcdHx8IGxpbmUuc3RhcnRzV2l0aCgnUmVxdWlyZW1lbnQgYWxyZWFkeSBzYXRpc2ZpZWQ6ICcpXG5cdFx0XHRcdHx8IGxpbmUuc3RhcnRzV2l0aCgnRGlzY2FyZGluZyBodHRwOi8vJylcblx0XHRcdFx0fHwgbGluZS5zdGFydHNXaXRoKCdEaXNjYXJkaW5nIGh0dHBzOi8vJylcblx0XHRcdFx0fHwgbGluZS5zdGFydHNXaXRoKCdEb3dubG9hZGluZyBodHRwOi8vJylcblx0XHRcdFx0fHwgbGluZS5zdGFydHNXaXRoKCdEb3dubG9hZGluZyBodHRwczovLycpXG5cdFx0XHRcdHx8IGxpbmUuc3RhcnRzV2l0aCgnICBEb3dubG9hZGluZyAnKVxuXHRcdFx0XHR8fCBsaW5lLnN0YXJ0c1dpdGgoJyAgVXNpbmcgY2FjaGVkICcpXG5cdFx0XHRcdHx8IGxpbmUuc3RhcnRzV2l0aCgnICBHZXR0aW5nIHJlcXVpcmVtZW50cyB0byBidWlsZCB3aGVlbCAnKVxuXHRcdFx0XHR8fCBsaW5lLnN0YXJ0c1dpdGgoJyAgSW5zdGFsbGluZyBidWlsZCBkZXBlbmRlbmNpZXMgJylcblx0XHRcdFx0fHwgbGluZS5zdGFydHNXaXRoKCcgIFByZXBhcmluZyBtZXRhZGF0YSAnKVxuXHRcdFx0XHR8fCBsaW5lLnN0YXJ0c1dpdGgoJ0J1aWxkaW5nIHdoZWVscyBmb3IgY29sbGVjdGVkIHBhY2thZ2VzOiAnKVxuXHRcdFx0XHR8fCBsaW5lLnN0YXJ0c1dpdGgoJyAgQnVpbGRpbmcgd2hlZWwgZm9yICcpXG5cdFx0XHRcdHx8IGxpbmUuc3RhcnRzV2l0aCgnICBDcmVhdGVkIHdoZWVsIGZvciAnKVxuXHRcdFx0XHR8fCBsaW5lLnN0YXJ0c1dpdGgoJyAgU3RvcmVkIGluIGRpcmVjdG9yeTogJylcblx0XHRcdFx0fHwgbGluZS5zdGFydHNXaXRoKCdJbnN0YWxsaW5nIGNvbGxlY3RlZCBwYWNrYWdlczogJylcblx0XHRcdFx0fHwgbGluZS5zdGFydHNXaXRoKCdTdWNjZXNzZnVsbHkgaW5zdGFsbGVkICcpXG5cdFx0XHRcdHx8IGxpbmUuc3RhcnRzV2l0aCgnT2J0YWluaW5nICcpXG5cdFx0XHRcdHx8IGxpbmUuc3RhcnRzV2l0aCgnW25vdGljZV0gQSBuZXcgcmVsZWFzZSBvZiBwaXAgaXMgYXZhaWxhYmxlOiAnKVxuXHRcdFx0XHR8fCBsaW5lLnN0YXJ0c1dpdGgoJ1tub3RpY2VdIFRvIHVwZGF0ZSwgcnVuOiAnKVxuXHRcdFx0XHR8fCByZWdleFRlc3QoXG5cdFx0XHRcdFx0U3RyaW5nLnJhd2BeXFxzK1tcXHUyNTAxXFx1MjU3OFxcdTI1N0EgXSpbXFx1MjUwMVxcdTI1NzhcXHUyNTdBXVtcXHUyNTAxXFx1MjU3OFxcdTI1N0EgXSpcXGQrKD86XFwuXFxkKyk/KD86XFxzKltLTUddP0IpP1svIF1gLFxuXHRcdFx0XHRcdGxpbmUsXG5cdFx0XHRcdCkpKTtcbn1cblxuZnVuY3Rpb24gaXNQaXBSb290VXNlcldhcm5pbmcobGluZTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiBsaW5lLnN0YXJ0c1dpdGgoYFdBUk5JTkc6IFJ1bm5pbmcgcGlwIGFzIHRoZSAncm9vdCcgdXNlciBjYW4gcmVzdWx0IGluIGJyb2tlbiBwZXJtaXNzaW9uc2ApXG5cdFx0fHwgbGluZS5zdGFydHNXaXRoKCdJdCBpcyByZWNvbW1lbmRlZCB0byB1c2UgYSB2aXJ0dWFsIGVudmlyb25tZW50IGluc3RlYWQ6ICcpO1xufVxuXG5mdW5jdGlvbiBpc1B5dGhvbk5pbmphQnVpbGRQcm9ncmVzc0xpbmUobGluZTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiByZWdleFRlc3QoXG5cdFx0U3RyaW5nLnJhd2BeXFxbXFxzKlxcZCsvXFxkK1xcXVxccytDb21waWxpbmcgKD86Q3xDXFwrXFwrfEN5dGhvbikgc291cmNlIFxcUytcXC4oPzpjfGNjfGNwcHxjeHh8cHl4KSRgLFxuXHRcdGxpbmUsXG5cdCkgfHwgcmVnZXhUZXN0KFxuXHRcdFN0cmluZy5yYXdgXlxcW1xccypcXGQrL1xcZCtcXF1cXHMrR2VuZXJhdGluZyBcXFMrIHdpdGggYSBjdXN0b20gY29tbWFuZCRgLFxuXHRcdGxpbmUsXG5cdCk7XG59XG5cbmZ1bmN0aW9uIGlzUHl0aG9uQnVpbGRFeHRQcm9ncmVzc0xpbmUobGluZTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiAhaXNEaWFnbm9zdGljTGluZShsaW5lKVxuXHRcdCYmIChyZWdleFRlc3QoXG5cdFx0XHRTdHJpbmcucmF3YF5ydW5uaW5nICg/OmJkaXN0X3doZWVsfGJ1aWxkfGJ1aWxkX3B5fGJ1aWxkX2V4dHxlZ2dfaW5mb3xpbnN0YWxsKD86X2xpYnxfZWdnX2luZm98X3NjcmlwdHN8X2hlYWRlcnMpP3xzZGlzdHxjaGVjaylcXGJgLFxuXHRcdFx0bGluZSxcblx0XHQpIHx8IHJlZ2V4VGVzdChTdHJpbmcucmF3YF5idWlsZGluZyAnLisnIGV4dGVuc2lvbiRgLCBsaW5lKVxuXHRcdFx0fHwgbGluZS5zdGFydHNXaXRoKCdjcmVhdGluZyBidWlsZCcpXG5cdFx0XHR8fCBsaW5lLnN0YXJ0c1dpdGgoJ2NvbXBpbGUgb3B0aW9uczogJylcblx0XHRcdHx8IGxpbmUuc3RhcnRzV2l0aCgnZXh0cmEgb3B0aW9uczogJylcblx0XHRcdHx8IHJlZ2V4VGVzdChTdHJpbmcucmF3YF5jb3B5aW5nIC4rIC0+IGAsIGxpbmUpXG5cdFx0XHR8fCByZWdleFRlc3QoU3RyaW5nLnJhd2Bed3JpdGluZyAuK1xcLmVnZy1pbmZvL2AsIGxpbmUpXG5cdFx0XHR8fCBsaW5lLnN0YXJ0c1dpdGgoJ3JlYWRpbmcgbWFuaWZlc3QgZmlsZSAnKVxuXHRcdFx0fHwgcmVnZXhUZXN0KFxuXHRcdFx0XHRTdHJpbmcucmF3YF4oPzpnY2N8Z1xcK1xcK3xjY3xjXFwrXFwrfGNsYW5nfGNsYW5nXFwrXFwrKVxcYi4qXFxzKD86LWN8LXNoYXJlZClcXHNgLFxuXHRcdFx0XHRsaW5lLFxuXHRcdFx0KVxuXHRcdFx0fHwgcmVnZXhUZXN0KFxuXHRcdFx0XHRTdHJpbmcucmF3YF5Db21waWxpbmcgXFxTK1xcLnB5eCBiZWNhdXNlICg/Oml0IGNoYW5nZWR8aXQgZGVwZW5kcyBvbiApYCxcblx0XHRcdFx0bGluZSxcblx0XHRcdClcblx0XHRcdHx8IHJlZ2V4VGVzdChTdHJpbmcucmF3YF5cXFtcXHMqXFxkKy9cXGQrXFxdXFxzK0N5dGhvbml6aW5nIFxcUytcXC5weXhgLCBsaW5lKSk7XG59XG5cbmZ1bmN0aW9uIGNvbXBhY3RTZXR1cHRvb2xzRmlsZVN0YWdpbmdSdW5zKG91dHB1dDogc3RyaW5nKTogc3RyaW5nIHtcblx0cmV0dXJuIGNvbGxhcHNlQ29udGlndW91c1J1bnMob3V0cHV0LCBpc1NldHVwdG9vbHNGaWxlU3RhZ2luZ0xpbmUsIDUsIGJsb2NrID0+IHtcblx0XHRjb25zdCBvcGVyYXRpb25zID0gdW5pcXVlU3RyaW5ncyhcblx0XHRcdGJsb2NrLm1hcChsaW5lID0+IHNwbGl0V2hpdGVzcGFjZShsaW5lKVswXSA/PyAnc3RhZ2luZycpLFxuXHRcdCk7XG5cdFx0cmV0dXJuIGBbc2V0dXB0b29scyBmaWxlIHN0YWdpbmc6IG9taXR0ZWQgJHtibG9jay5sZW5ndGh9ICR7b3BlcmF0aW9ucy5qb2luKCcvJyl9IGxpbmUocyldYDtcblx0fSk7XG59XG5cbmZ1bmN0aW9uIGlzU2V0dXB0b29sc0ZpbGVTdGFnaW5nTGluZShsaW5lOiBzdHJpbmcpOiBib29sZWFuIHtcblx0cmV0dXJuIHJlZ2V4VGVzdChTdHJpbmcucmF3YF5jb3B5aW5nIC4rIC0+IC4rJGAsIGxpbmUpXG5cdFx0fHwgcmVnZXhUZXN0KFN0cmluZy5yYXdgXmNyZWF0aW5nICg/OmJ1aWxkXFxifFteL1xcc10rXFwuZWdnLWluZm9cXGIpLiokYCwgbGluZSlcblx0XHR8fCByZWdleFRlc3QoXG5cdFx0XHRTdHJpbmcucmF3YF5jcmVhdGluZyBbQS1aYS16MC05Xy4rLV0rLVtBLVphLXowLTlfListXSsvW1xcdy4vKy1dKyRgLFxuXHRcdFx0bGluZSxcblx0XHQpXG5cdFx0fHwgcmVnZXhUZXN0KFN0cmluZy5yYXdgXmFkZGluZyAoPzpsaWNlbnNlIGZpbGUgKT8oPzonW14nXSsnfFwiW15cIl0rXCIpJGAsIGxpbmUpXG5cdFx0fHwgcmVnZXhUZXN0KFN0cmluZy5yYXdgXndyaXRpbmcgLitcXC5lZ2ctaW5mby8uKyRgLCBsaW5lKVxuXHRcdHx8IHJlZ2V4VGVzdChTdHJpbmcucmF3YF53cml0aW5nIG1hbmlmZXN0IGZpbGUgWydcIl0uK1snXCJdJGAsIGxpbmUpXG5cdFx0fHwgcmVnZXhUZXN0KFN0cmluZy5yYXdgXnJlYWRpbmcgbWFuaWZlc3QgKD86ZmlsZXx0ZW1wbGF0ZSkgWydcIl0uK1snXCJdJGAsIGxpbmUpO1xufVxuXG5mdW5jdGlvbiBjb21wYWN0TnVtcHlEaXN0dXRpbHNQcm9iZXMob3V0cHV0OiBzdHJpbmcpOiBzdHJpbmcge1xuXHRpZiAoIW91dHB1dC5pbmNsdWRlcygnSU5GTzogJykpIHtcblx0XHRyZXR1cm4gb3V0cHV0O1xuXHR9XG5cdHJldHVybiBjb2xsYXBzZUNvbnRpZ3VvdXNSdW5zKG91dHB1dCwgaXNOdW1weURpc3R1dGlsc1Byb2JlTGluZSwgNCwgYmxvY2sgPT5cblx0XHRgW251bXB5LmRpc3R1dGlscyBwcm9iZXM6IG9taXR0ZWQgJHtibG9jay5sZW5ndGh9IEJMQVMvTEFQQUNLIHByb2JlIGxpbmUocyldYCk7XG59XG5cbmZ1bmN0aW9uIGlzTnVtcHlEaXN0dXRpbHNQcm9iZUxpbmUobGluZTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiAhaXNEaWFnbm9zdGljTGluZShsaW5lKVxuXHRcdCYmIGxpbmUuc3RhcnRzV2l0aCgnSU5GTzogJylcblx0XHQmJiByZWdleFRlc3QoXG5cdFx0XHRTdHJpbmcucmF3YCg/Ol9pbmZvOnxOT1QgQVZBSUxBQkxFfGxpYnJhcmllcyAuKiBub3QgZm91bmR8U2V0dGluZyBQVEFUTEFTfGN1c3RvbWl6ZSB8Y29tcGlsZSBvcHRpb25zOnxleHRyYSBvcHRpb25zOilgLFxuXHRcdFx0bGluZSxcblx0XHQpO1xufVxuXG5mdW5jdGlvbiBjb21wYWN0U3BoaW54UHJvZ3Jlc3Mob3V0cHV0OiBzdHJpbmcpOiBzdHJpbmcge1xuXHRpZiAoIW91dHB1dC5pbmNsdWRlcygncmVhZGluZyBzb3VyY2VzLi4uIFsnKSAmJiAhb3V0cHV0LmluY2x1ZGVzKCd3cml0aW5nIG91dHB1dC4uLiBbJykpIHtcblx0XHRyZXR1cm4gb3V0cHV0O1xuXHR9XG5cdHJldHVybiBjb21wYWN0SW50cmFsaW5lUHJvZ3Jlc3Mob3V0cHV0LCAnc3BoaW54IHByb2dyZXNzJywgY29tcGFjdFNwaGlueFByb2dyZXNzTGluZSk7XG59XG5cbmZ1bmN0aW9uIGNvbXBhY3RTcGhpbnhQcm9ncmVzc0xpbmUobGluZTogc3RyaW5nKTogQ29tcGFjdGVkTGluZSB7XG5cdGlmICghbGluZS5pbmNsdWRlcygncmVhZGluZyBzb3VyY2VzLi4uIFsnKSAmJiAhbGluZS5pbmNsdWRlcygnd3JpdGluZyBvdXRwdXQuLi4gWycpKSB7XG5cdFx0cmV0dXJuIHVuY2hhbmdlZExpbmUobGluZSk7XG5cdH1cblx0cmV0dXJuIGNvbXBhY3RQcm9ncmVzc1BhdHRlcm5zVW5sZXNzRGlhZ25vc3RpYyhcblx0XHRsaW5lLFxuXHRcdFtcblx0XHRcdFN0cmluZy5yYXdgcmVhZGluZyBzb3VyY2VzXFwuXFwuXFwuIFxcW1xccypcXGQrJVxcXVxccytcXFMrXFxzKmAsXG5cdFx0XHRTdHJpbmcucmF3YHdyaXRpbmcgb3V0cHV0XFwuXFwuXFwuIFxcW1xccypcXGQrJVxcXVxccytcXFMrXFxzKmAsXG5cdFx0XSxcblx0KTtcbn1cblxuZnVuY3Rpb24gaGFzU3BoaW54UHJvZ3Jlc3Mob3V0cHV0OiBzdHJpbmcpOiBib29sZWFuIHtcblx0cmV0dXJuIGhhc1NwaGlueE91dHB1dE1hcmtlcihvdXRwdXQpXG5cdFx0JiYgKG91dHB1dC5pbmNsdWRlcygncmVhZGluZyBzb3VyY2VzLi4uIFsnKSB8fCBvdXRwdXQuaW5jbHVkZXMoJ3dyaXRpbmcgb3V0cHV0Li4uIFsnKSk7XG59XG5cbmZ1bmN0aW9uIGhhc1NwaGlueE91dHB1dE1hcmtlcihvdXRwdXQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gb3V0cHV0LnNwbGl0KCdcXG4nKS5zb21lKGxpbmUgPT5cblx0XHRsaW5lLnN0YXJ0c1dpdGgoJ1J1bm5pbmcgU3BoaW54IHYnKVxuXHRcdHx8IGxpbmUuc3RhcnRzV2l0aCgnU3BoaW54IHYnKVxuXHRcdHx8IGxpbmUuc3RhcnRzV2l0aCgnbG9hZGluZyBwaWNrbGVkIGVudmlyb25tZW50Li4uJylcblx0XHR8fCBsaW5lLnN0YXJ0c1dpdGgoJ2J1aWxkIHN1Y2NlZWRlZCcpXG5cdFx0fHwgbGluZS5zdGFydHNXaXRoKCdidWlsZCBmaW5pc2hlZCB3aXRoIHByb2JsZW1zJylcblx0XHR8fCBsaW5lLnN0YXJ0c1dpdGgoJ1RoZSBIVE1MIHBhZ2VzIGFyZSBpbiAnKSk7XG59XG5cbmZ1bmN0aW9uIGNvbXBhY3REb2N1c2F1cnVzUHJvZ3Jlc3Mob3V0cHV0OiBzdHJpbmcpOiBzdHJpbmcge1xuXHRpZiAoIWhhc0RvY3VzYXVydXNQcm9ncmVzcyhvdXRwdXQpKSB7XG5cdFx0cmV0dXJuIG91dHB1dDtcblx0fVxuXHRyZXR1cm4gb21pdE1hdGNoaW5nTGluZXMoXG5cdFx0b3V0cHV0LFxuXHRcdCdkb2N1c2F1cnVzIHByb2dyZXNzJyxcblx0XHRsaW5lID0+IHJlZ2V4VGVzdChTdHJpbmcucmF3YF5cXHMqW1xcdTI1Q0ZcXHUyNUVGXVxccysoPzpDbGllbnR8U2VydmVyKSg/Olxccyt8JClgLCBsaW5lKSxcblx0XHQncHJvZ3Jlc3MnLFxuXHQpO1xufVxuXG5mdW5jdGlvbiBjb21wYWN0Q2FycmlhZ2VSZXR1cm5Qcm9ncmVzcyhvdXRwdXQ6IHN0cmluZyk6IHN0cmluZyB7XG5cdGlmICghb3V0cHV0LmluY2x1ZGVzKCdcXHInKSkge1xuXHRcdHJldHVybiBvdXRwdXQ7XG5cdH1cblx0cmV0dXJuIG91dHB1dFxuXHRcdC5zcGxpdCgnXFxuJylcblx0XHQubWFwKGxpbmUgPT4ge1xuXHRcdFx0Y29uc3QgcGFydHMgPSBsaW5lLnNwbGl0KCdcXHInKTtcblx0XHRcdGZvciAobGV0IGlkeCA9IHBhcnRzLmxlbmd0aCAtIDE7IGlkeCA+PSAwOyBpZHgtLSkge1xuXHRcdFx0XHRpZiAocGFydHNbaWR4XS5sZW5ndGggIT09IDApIHtcblx0XHRcdFx0XHRyZXR1cm4gcGFydHNbaWR4XTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuICcnO1xuXHRcdH0pXG5cdFx0LmpvaW4oJ1xcbicpO1xufVxuXG5mdW5jdGlvbiBsb29rc0xpa2VHb1J1bnRpbWVQYW5pYyhvdXRwdXQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRpZiAoanNTdHJpbmdMZW4ob3V0cHV0KSA8IDQgKiAxMDI0XG5cdFx0fHwgIXJlZ2V4VGVzdChcblx0XHRcdFN0cmluZy5yYXdgKD86XnxcXG4pKD86ZmF0YWwgZXJyb3I6IHxydW50aW1lIHN0YWNrOnxTSUdTRUdWfFNJR0FCUlR8U0lHQlVTKWAsXG5cdFx0XHRvdXRwdXQsXG5cdFx0KVxuXHQpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRsZXQgY291bnQgPSAwO1xuXHRmb3IgKGNvbnN0IGxpbmUgb2Ygb3V0cHV0LnNwbGl0KCdcXG4nKSkge1xuXHRcdGlmIChpc0dvUnVudGltZUdvcm91dGluZUhlYWRlcihsaW5lKSkge1xuXHRcdFx0Y291bnQgKz0gMTtcblx0XHRcdGlmIChjb3VudCA9PT0gR09fUlVOVElNRV9QQU5JQ19NSU5fR09ST1VUSU5FUykge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblx0cmV0dXJuIGZhbHNlO1xufVxuXG5mdW5jdGlvbiBjb21wYWN0R29SdW50aW1lUGFuaWNEdW1wKG91dHB1dDogc3RyaW5nKTogc3RyaW5nIHtcblx0aWYgKCFsb29rc0xpa2VHb1J1bnRpbWVQYW5pYyhvdXRwdXQpKSB7XG5cdFx0cmV0dXJuIG91dHB1dDtcblx0fVxuXG5cdGNvbnN0IGxpbmVzID0gb3V0cHV0LnNwbGl0KCdcXG4nKTtcblx0Y29uc3QgZmlyc3RIZWFkZXIgPSBsaW5lcy5maW5kSW5kZXgobGluZSA9PiBpc0dvUnVudGltZUdvcm91dGluZUhlYWRlcihsaW5lKSk7XG5cdGlmIChmaXJzdEhlYWRlciA9PT0gLTEpIHtcblx0XHRyZXR1cm4gb3V0cHV0O1xuXHR9XG5cblx0Y29uc3QgYmxvY2tzID0gY29sbGVjdEdvR29yb3V0aW5lQmxvY2tzKGxpbmVzLCBmaXJzdEhlYWRlcik7XG5cdGlmIChibG9ja3MubGVuZ3RoIDwgR09fUlVOVElNRV9QQU5JQ19NSU5fR09ST1VUSU5FUykge1xuXHRcdHJldHVybiBvdXRwdXQ7XG5cdH1cblxuXHRjb25zdCBjb21wYWN0ZWQ6IHN0cmluZ1tdID0gbGluZXMuc2xpY2UoMCwgZmlyc3RIZWFkZXIpO1xuXHRmb3IgKGxldCBrID0gYmxvY2tzWzBdLnN0YXJ0OyBrIDwgYmxvY2tzWzBdLmVuZDsgaysrKSB7XG5cdFx0Y29tcGFjdGVkLnB1c2gobGluZXNba10pO1xuXHR9XG5cdGxldCBvbWl0dGVkRnJhbWVMaW5lcyA9IDA7XG5cdGNvbnN0IHJlbWFpbmluZ0Jsb2Nrczogc3RyaW5nW11bXSA9IFtdO1xuXHRmb3IgKGNvbnN0IGJsb2NrIG9mIGJsb2Nrcy5zbGljZSgxKSkge1xuXHRcdGNvbnN0IG9yaWdpbmFsQmxvY2sgPSBsaW5lcy5zbGljZShibG9jay5zdGFydCwgYmxvY2suZW5kKTtcblx0XHRjb25zdCBjb21wYWN0ZWRCbG9jayA9IGNvbXBhY3RHb0dvcm91dGluZUJsb2NrKG9yaWdpbmFsQmxvY2spO1xuXHRcdG9taXR0ZWRGcmFtZUxpbmVzICs9IHNhdHVyYXRpbmdTdWIob3JpZ2luYWxCbG9jay5sZW5ndGgsIGNvbXBhY3RlZEJsb2NrLmxlbmd0aCk7XG5cdFx0cmVtYWluaW5nQmxvY2tzLnB1c2goY29tcGFjdGVkQmxvY2spO1xuXHR9XG5cblx0Y29uc3QgZ3JvdXBlZEJsb2NrcyA9IGdyb3VwUmVwZWF0ZWRHb0dvcm91dGluZUJsb2NrcyhyZW1haW5pbmdCbG9ja3MpO1xuXHRpZiAob21pdHRlZEZyYW1lTGluZXMgPT09IDAgJiYgZ3JvdXBlZEJsb2Nrcy5vbWl0dGVkQmxvY2tzID09PSAwKSB7XG5cdFx0cmV0dXJuIG91dHB1dDtcblx0fVxuXG5cdGNvbnN0IHN1bW1hcnk6IHN0cmluZ1tdID0gW107XG5cdGlmIChvbWl0dGVkRnJhbWVMaW5lcyA+IDApIHtcblx0XHRzdW1tYXJ5LnB1c2goYCR7YmxvY2tzLmxlbmd0aCAtIDF9IGdvcm91dGluZSBibG9jayhzKSBiZWxvdyB3ZXJlIGNvbmRlbnNlZDsgJHtvbWl0dGVkRnJhbWVMaW5lc30gZnJhbWUgbGluZShzKSBvbWl0dGVkYCk7XG5cdH1cblx0aWYgKGdyb3VwZWRCbG9ja3Mub21pdHRlZEJsb2NrcyA+IDApIHtcblx0XHRzdW1tYXJ5LnB1c2goYCR7Z3JvdXBlZEJsb2Nrcy5vbWl0dGVkQmxvY2tzfSByZXBlYXRlZCBnb3JvdXRpbmUgYmxvY2socykgZ3JvdXBlZGApO1xuXHR9XG5cdGNvbXBhY3RlZC5wdXNoKGBbZ28gcnVudGltZSBwYW5pYzogJHtzdW1tYXJ5LmpvaW4oJzsgJyl9XWApO1xuXHRmb3IgKGNvbnN0IGJsb2NrIG9mIGdyb3VwZWRCbG9ja3MuYmxvY2tzKSB7XG5cdFx0Y29tcGFjdGVkLnB1c2goLi4uYmxvY2spO1xuXHR9XG5cdHJldHVybiBjb21wYWN0ZWQuam9pbignXFxuJyk7XG59XG5cbmludGVyZmFjZSBHb0Jsb2NrUmFuZ2Uge1xuXHRzdGFydDogbnVtYmVyO1xuXHRlbmQ6IG51bWJlcjtcbn1cblxuZnVuY3Rpb24gY29sbGVjdEdvR29yb3V0aW5lQmxvY2tzKGxpbmVzOiByZWFkb25seSBzdHJpbmdbXSwgZmlyc3RIZWFkZXI6IG51bWJlcik6IEdvQmxvY2tSYW5nZVtdIHtcblx0Y29uc3QgYmxvY2tzOiBHb0Jsb2NrUmFuZ2VbXSA9IFtdO1xuXHRsZXQgc3RhcnQgPSBmaXJzdEhlYWRlcjtcblx0Zm9yIChsZXQgaSA9IGZpcnN0SGVhZGVyICsgMTsgaSA8IGxpbmVzLmxlbmd0aDsgaSsrKSB7XG5cdFx0aWYgKGlzR29SdW50aW1lR29yb3V0aW5lSGVhZGVyKGxpbmVzW2ldKSkge1xuXHRcdFx0YmxvY2tzLnB1c2goeyBzdGFydCwgZW5kOiBpIH0pO1xuXHRcdFx0c3RhcnQgPSBpO1xuXHRcdH1cblx0fVxuXHRibG9ja3MucHVzaCh7IHN0YXJ0LCBlbmQ6IGxpbmVzLmxlbmd0aCB9KTtcblx0cmV0dXJuIGJsb2Nrcztcbn1cblxuZnVuY3Rpb24gY29tcGFjdEdvR29yb3V0aW5lQmxvY2soYmxvY2s6IHJlYWRvbmx5IHN0cmluZ1tdKTogc3RyaW5nW10ge1xuXHRjb25zdCBmb290ZXJTdGFydCA9IGZpbmRHb0dvcm91dGluZUZvb3RlclN0YXJ0KGJsb2NrKTtcblx0Y29uc3Qgc3RhY2sgPSBibG9jay5zbGljZSgwLCBmb290ZXJTdGFydCk7XG5cdGNvbnN0IGZvb3RlciA9IGJsb2NrLnNsaWNlKGZvb3RlclN0YXJ0KTtcblx0aWYgKHN0YWNrLmxlbmd0aCA8PSA0KSB7XG5cdFx0cmV0dXJuIFsuLi5zdGFjaywgLi4uZm9vdGVyXTtcblx0fVxuXG5cdGxldCBjcmVhdGVkQnlJbmRleDogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRmb3IgKGxldCBpZHggPSBzdGFjay5sZW5ndGggLSAxOyBpZHggPj0gMDsgaWR4LS0pIHtcblx0XHRpZiAoc3RhY2tbaWR4XS5zdGFydHNXaXRoKCdjcmVhdGVkIGJ5ICcpKSB7XG5cdFx0XHRjcmVhdGVkQnlJbmRleCA9IGlkeDtcblx0XHRcdGJyZWFrO1xuXHRcdH1cblx0fVxuXHRjb25zdCBrZXB0ID0gc3RhY2suc2xpY2UoMCwgTWF0aC5taW4oMywgc3RhY2subGVuZ3RoKSk7XG5cdGlmIChjcmVhdGVkQnlJbmRleCAhPT0gdW5kZWZpbmVkICYmIGNyZWF0ZWRCeUluZGV4ID49IGtlcHQubGVuZ3RoKSB7XG5cdFx0a2VwdC5wdXNoKC4uLnN0YWNrLnNsaWNlKGNyZWF0ZWRCeUluZGV4KSk7XG5cdH1cblx0a2VwdC5wdXNoKC4uLmZvb3Rlcik7XG5cdHJldHVybiBrZXB0O1xufVxuXG5pbnRlcmZhY2UgR3JvdXBlZEdvQmxvY2tzIHtcblx0YmxvY2tzOiBzdHJpbmdbXVtdO1xuXHRvbWl0dGVkQmxvY2tzOiBudW1iZXI7XG59XG5cbmZ1bmN0aW9uIGdyb3VwUmVwZWF0ZWRHb0dvcm91dGluZUJsb2NrcyhibG9ja3M6IHJlYWRvbmx5IHN0cmluZ1tdW10pOiBHcm91cGVkR29CbG9ja3Mge1xuXHRjb25zdCBzaWduYXR1cmVzID0gYmxvY2tzLm1hcChibG9jayA9PiBnb0dvcm91dGluZVNpZ25hdHVyZShibG9jaykpO1xuXHRjb25zdCBjb3VudHMgPSBuZXcgTWFwPHN0cmluZywgbnVtYmVyPigpO1xuXHRmb3IgKGNvbnN0IHNpZ25hdHVyZSBvZiBzaWduYXR1cmVzKSB7XG5cdFx0aWYgKHNpZ25hdHVyZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRjb3VudHMuc2V0KHNpZ25hdHVyZS5rZXksIChjb3VudHMuZ2V0KHNpZ25hdHVyZS5rZXkpID8/IDApICsgMSk7XG5cdFx0fVxuXHR9XG5cblx0Y29uc3QgZ3JvdXBlZDogc3RyaW5nW11bXSA9IFtdO1xuXHRjb25zdCBzZWVuOiBzdHJpbmdbXSA9IFtdO1xuXHRsZXQgb21pdHRlZEJsb2NrcyA9IDA7XG5cdGZvciAobGV0IGluZGV4ID0gMDsgaW5kZXggPCBibG9ja3MubGVuZ3RoOyBpbmRleCsrKSB7XG5cdFx0Y29uc3QgYmxvY2sgPSBibG9ja3NbaW5kZXhdO1xuXHRcdGNvbnN0IHNpZ25hdHVyZSA9IHNpZ25hdHVyZXNbaW5kZXhdO1xuXHRcdGlmIChzaWduYXR1cmUgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0Z3JvdXBlZC5wdXNoKFsuLi5ibG9ja10pO1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXHRcdGlmICgoY291bnRzLmdldChzaWduYXR1cmUua2V5KSA/PyAwKSA8IDMpIHtcblx0XHRcdGdyb3VwZWQucHVzaChbLi4uYmxvY2tdKTtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblx0XHRpZiAoc2Vlbi5pbmNsdWRlcyhzaWduYXR1cmUua2V5KSkge1xuXHRcdFx0b21pdHRlZEJsb2NrcyArPSAxO1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXG5cdFx0c2Vlbi5wdXNoKHNpZ25hdHVyZS5rZXkpO1xuXHRcdGdyb3VwZWQucHVzaChbLi4uYmxvY2tdKTtcblx0XHRncm91cGVkLnB1c2goW1xuXHRcdFx0YFtnbyBydW50aW1lIHBhbmljOiBvbWl0dGVkICR7KGNvdW50cy5nZXQoc2lnbmF0dXJlLmtleSkgPz8gMSkgLSAxfSBzaW1pbGFyIGdvcm91dGluZSBibG9jayhzKTogc3RhdGU9JHtzaWduYXR1cmUuc3RhdGV9LCB0b3A9JHtzaWduYXR1cmUudG9wfSR7c2lnbmF0dXJlLmxvY2F0aW9uLmxlbmd0aCA9PT0gMCA/ICcnIDogJyBhdCAnfSR7c2lnbmF0dXJlLmxvY2F0aW9ufSwgY3JlYXRlZCBieT0ke3NpZ25hdHVyZS5jcmVhdGVkQnl9XWAsXG5cdFx0XHQnJyxcblx0XHRdKTtcblx0fVxuXG5cdHJldHVybiB7IGJsb2NrczogZ3JvdXBlZCwgb21pdHRlZEJsb2NrcyB9O1xufVxuXG5pbnRlcmZhY2UgR29Hb3JvdXRpbmVTaWduYXR1cmUge1xuXHRrZXk6IHN0cmluZztcblx0c3RhdGU6IHN0cmluZztcblx0dG9wOiBzdHJpbmc7XG5cdGxvY2F0aW9uOiBzdHJpbmc7XG5cdGNyZWF0ZWRCeTogc3RyaW5nO1xufVxuXG5mdW5jdGlvbiBnb0dvcm91dGluZVNpZ25hdHVyZShibG9jazogcmVhZG9ubHkgc3RyaW5nW10pOiBHb0dvcm91dGluZVNpZ25hdHVyZSB8IHVuZGVmaW5lZCB7XG5cdGlmIChmaW5kR29Hb3JvdXRpbmVGb290ZXJTdGFydChibG9jaykgPCBibG9jay5sZW5ndGgpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0Y29uc3QgZmlyc3QgPSBibG9ja1swXTtcblx0aWYgKGZpcnN0ID09PSB1bmRlZmluZWQpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGNvbnN0IHN0YXRlID0gcmVnZXhDYXB0dXJlRmlyc3QoU3RyaW5nLnJhd2BcXFsoW15cXF1dKylcXF06JGAsIGZpcnN0KTtcblx0aWYgKHN0YXRlID09PSB1bmRlZmluZWQpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGxldCB0b3BJbmRleDogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRmb3IgKGxldCBpbmRleCA9IDA7IGluZGV4IDwgYmxvY2subGVuZ3RoOyBpbmRleCsrKSB7XG5cdFx0Y29uc3QgbGluZSA9IGJsb2NrW2luZGV4XTtcblx0XHRpZiAoaW5kZXggPiAwICYmIGxpbmUubGVuZ3RoICE9PSAwICYmICFsaW5lLnN0YXJ0c1dpdGgoJ1xcdCcpICYmICFsaW5lLnN0YXJ0c1dpdGgoJ2NyZWF0ZWQgYnkgJykpIHtcblx0XHRcdHRvcEluZGV4ID0gaW5kZXg7XG5cdFx0XHRicmVhaztcblx0XHR9XG5cdH1cblx0aWYgKHRvcEluZGV4ID09PSB1bmRlZmluZWQpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGNvbnN0IHRvcCA9IGdvRnVuY3Rpb25OYW1lKGJsb2NrW3RvcEluZGV4XSk7XG5cdGlmICh0b3AgPT09IHVuZGVmaW5lZCkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0Y29uc3QgbG9jYXRpb24gPSBnb0ZpbGVMb2NhdGlvbih0b3BJbmRleCArIDEgPCBibG9jay5sZW5ndGggPyBibG9ja1t0b3BJbmRleCArIDFdIDogdW5kZWZpbmVkKTtcblx0Y29uc3QgY3JlYXRlZEJ5TGluZSA9IGJsb2NrLmZpbmQobGluZSA9PiBsaW5lLnN0YXJ0c1dpdGgoJ2NyZWF0ZWQgYnkgJykpO1xuXHRjb25zdCBjcmVhdGVkQnkgPSAoY3JlYXRlZEJ5TGluZSAhPT0gdW5kZWZpbmVkID8gZ29DcmVhdGVkQnlGdW5jdGlvbihjcmVhdGVkQnlMaW5lKSA6IHVuZGVmaW5lZCkgPz8gJzxub25lPic7XG5cdHJldHVybiB7XG5cdFx0a2V5OiBgJHtzdGF0ZX1cXDAke3RvcH1cXDAke2xvY2F0aW9ufVxcMCR7Y3JlYXRlZEJ5fWAsXG5cdFx0c3RhdGUsXG5cdFx0dG9wLFxuXHRcdGxvY2F0aW9uLFxuXHRcdGNyZWF0ZWRCeSxcblx0fTtcbn1cblxuZnVuY3Rpb24gZ29GdW5jdGlvbk5hbWUobGluZTogc3RyaW5nKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0cmV0dXJuIHJlZ2V4Q2FwdHVyZUZpcnN0KFN0cmluZy5yYXdgXihbXlxccyhdKykoPzpcXCh8JClgLCBsaW5lKTtcbn1cblxuZnVuY3Rpb24gZ29GaWxlTG9jYXRpb24obGluZTogc3RyaW5nIHwgdW5kZWZpbmVkKTogc3RyaW5nIHtcblx0aWYgKGxpbmUgPT09IHVuZGVmaW5lZCkge1xuXHRcdHJldHVybiAnJztcblx0fVxuXHRyZXR1cm4gcmVnZXhDYXB0dXJlRmlyc3QoU3RyaW5nLnJhd2AoW14vXFxzXStcXC5bQS1aYS16MC05XSs6XFxkKylgLCBsaW5lKSA/PyAnJztcbn1cblxuZnVuY3Rpb24gZ29DcmVhdGVkQnlGdW5jdGlvbihsaW5lOiBzdHJpbmcpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRyZXR1cm4gcmVnZXhDYXB0dXJlRmlyc3QoU3RyaW5nLnJhd2BeY3JlYXRlZCBieSAoLis/KSg/OiBpbiBnb3JvdXRpbmUgXFxkKyk/JGAsIGxpbmUpO1xufVxuXG5mdW5jdGlvbiBmaW5kR29Hb3JvdXRpbmVGb290ZXJTdGFydChibG9jazogcmVhZG9ubHkgc3RyaW5nW10pOiBudW1iZXIge1xuXHRmb3IgKGxldCBpID0gMTsgaSA8IGJsb2NrLmxlbmd0aDsgaSsrKSB7XG5cdFx0aWYgKCFpc0dvR29yb3V0aW5lU3RhY2tMaW5lKGJsb2NrW2ldKSkge1xuXHRcdFx0cmV0dXJuIGk7XG5cdFx0fVxuXHR9XG5cdHJldHVybiBibG9jay5sZW5ndGg7XG59XG5cbmZ1bmN0aW9uIGlzR29Hb3JvdXRpbmVTdGFja0xpbmUobGluZTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiBsaW5lLmxlbmd0aCA9PT0gMFxuXHRcdHx8IGxpbmUuc3RhcnRzV2l0aCgnXFx0Jylcblx0XHR8fCBsaW5lLnN0YXJ0c1dpdGgoJ2NyZWF0ZWQgYnkgJylcblx0XHR8fCByZWdleFRlc3QoU3RyaW5nLnJhd2BeXFxTLipcXCkkYCwgbGluZSk7XG59XG5cbmZ1bmN0aW9uIGlzR29SdW50aW1lR29yb3V0aW5lSGVhZGVyKGxpbmU6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gcmVnZXhUZXN0KFxuXHRcdFN0cmluZy5yYXdgXmdvcm91dGluZSBcXGQrKD86IGdwPVxcUyspPyg/OiBtPVxcUyspPyg/OiBtcD1cXFMrKT8gXFxbW15cXF1dK1xcXTokYCxcblx0XHRsaW5lLFxuXHQpO1xufVxuXG5mdW5jdGlvbiBpc0RqYW5nb1Rlc3RCb2lsZXJwbGF0ZUxpbmUobGluZTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiAhaXNEaWFnbm9zdGljTGluZShsaW5lKVxuXHRcdCYmIChsaW5lLnN0YXJ0c1dpdGgoJ1Rlc3RpbmcgYWdhaW5zdCBEamFuZ28gaW5zdGFsbGVkIGluICcpXG5cdFx0XHR8fCByZWdleFRlc3QoU3RyaW5nLnJhd2BeRm91bmQgXFxkKyB0ZXN0KD86XFwoc1xcKXxzKT9cXC4kYCwgbGluZSlcblx0XHRcdHx8IGxpbmUuc3RhcnRzV2l0aCgnQ3JlYXRpbmcgdGVzdCBkYXRhYmFzZSBmb3IgYWxpYXMgJylcblx0XHRcdHx8IGxpbmUuc3RhcnRzV2l0aCgnRGVzdHJveWluZyB0ZXN0IGRhdGFiYXNlIGZvciBhbGlhcyAnKVxuXHRcdFx0fHwgbGluZS5zdGFydHNXaXRoKCdTa2lwcGluZyBzZXR1cCBvZiB1bnVzZWQgZGF0YWJhc2UnKVxuXHRcdFx0fHwgbGluZS5zdGFydHNXaXRoKCdTeXN0ZW0gY2hlY2sgaWRlbnRpZmllZCBubyBpc3N1ZXMnKVxuXHRcdFx0fHwgbGluZS5zdGFydHNXaXRoKCdPcGVyYXRpb25zIHRvIHBlcmZvcm06Jylcblx0XHRcdHx8IGxpbmUuc3RhcnRzV2l0aCgnQXBwbHkgYWxsIG1pZ3JhdGlvbnM6Jylcblx0XHRcdHx8IHJlZ2V4VGVzdChTdHJpbmcucmF3YF4gezJ9QXBwbHlpbmcgXFxTK1xcLlxcUytcXC5cXC5cXC4gT0skYCwgbGluZSlcblx0XHRcdHx8IHJlZ2V4VGVzdChTdHJpbmcucmF3YF50ZXN0X1xcUysgXFwoW14pXStcXCkgXFwuXFwuXFwuIG9rJGAsIGxpbmUpKTtcbn1cblxuZnVuY3Rpb24gaXNEamFuZ29UZXN0UHJvZ3Jlc3NMaW5lKGxpbmU6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gIWlzRGlhZ25vc3RpY0xpbmUobGluZSlcblx0XHQmJiAobGluZS5pbmNsdWRlcygnLicpIHx8IGxpbmUuaW5jbHVkZXMoJ3MnKSB8fCBsaW5lLmluY2x1ZGVzKCd4JykgfHwgbGluZS5pbmNsdWRlcygnWCcpKVxuXHRcdCYmIHJlZ2V4VGVzdChTdHJpbmcucmF3YF5bLnN4WEVGXSsoPzpcXHMrXFxbXFxzKlxcZCslXFxdKT8kYCwgbGluZSk7XG59XG5cbmZ1bmN0aW9uIGlzUHl0ZXN0U2Vzc2lvbk1ldGFkYXRhTGluZShsaW5lOiBzdHJpbmcpOiBib29sZWFuIHtcblx0cmV0dXJuICFpc0RpYWdub3N0aWNMaW5lKGxpbmUpXG5cdFx0JiYgKHJlZ2V4VGVzdFdpdGhGbGFncyhTdHJpbmcucmF3YF49K1xccyp0ZXN0IHNlc3Npb24gc3RhcnRzXFxzKj0rJGAsIGxpbmUsICdpJylcblx0XHRcdHx8IHJlZ2V4VGVzdChTdHJpbmcucmF3YF5wbGF0Zm9ybSAuKlxcYnB5dGVzdC0uKlxcYnBsdWdneS1gLCBsaW5lKVxuXHRcdFx0fHwgcmVnZXhUZXN0KFN0cmluZy5yYXdgXig/OmNhY2hlZGlyfHJvb3RkaXJ8Y29uZmlnZmlsZXxwbHVnaW5zKTogYCwgbGluZSlcblx0XHRcdHx8IGxpbmUuc3RhcnRzV2l0aCgnY29sbGVjdGluZyAuLi4nKVxuXHRcdFx0fHwgcmVnZXhUZXN0KFN0cmluZy5yYXdgXmNvbGxlY3RlZCBcXGQrIGl0ZW1zP2AsIGxpbmUpKTtcbn1cblxuZnVuY3Rpb24gY29tcGFjdFB5dGVzdFByb2dyZXNzKG91dHB1dDogc3RyaW5nKTogc3RyaW5nIHtcblx0aWYgKGhhc1B5dGVzdFRlcm1pbmFsU3VtbWFyeShvdXRwdXQpKSB7XG5cdFx0cmV0dXJuIG9taXRQeXRlc3RQcm9ncmVzc0xpbmVzKG91dHB1dCwgaXNQeXRlc3RQcm9ncmVzc0xpbmUpO1xuXHR9XG5cdGlmIChoYXNTdHJpY3RQeXRlc3RQYXNzZWRQcm9ncmVzc1J1bihvdXRwdXQpICYmICFoYXNQeXRlc3RQcm9ncmVzc0ZhbGxiYWNrUG9pc29uKG91dHB1dCkpIHtcblx0XHRyZXR1cm4gb21pdFB5dGVzdFByb2dyZXNzTGluZXMob3V0cHV0LCBpc1N0cmljdFB5dGVzdFBhc3NlZFByb2dyZXNzTGluZSk7XG5cdH1cblx0cmV0dXJuIG91dHB1dDtcbn1cblxuZnVuY3Rpb24gb21pdFB5dGVzdFByb2dyZXNzTGluZXMob3V0cHV0OiBzdHJpbmcsIHNob3VsZE9taXQ6IChsaW5lOiBzdHJpbmcpID0+IGJvb2xlYW4pOiBzdHJpbmcge1xuXHRjb25zdCBjb21wYWN0ZWQ6IHN0cmluZ1tdID0gW107XG5cdGNvbnN0IG9taXR0ZWRMaW5lczogc3RyaW5nW10gPSBbXTtcblxuXHRmb3IgKGNvbnN0IGxpbmUgb2Ygb3V0cHV0LnNwbGl0KCdcXG4nKSkge1xuXHRcdGlmIChzaG91bGRPbWl0KGxpbmUpKSB7XG5cdFx0XHRvbWl0dGVkTGluZXMucHVzaChsaW5lKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Zmx1c2hQeXRlc3RQcm9ncmVzc0xpbmVzKGNvbXBhY3RlZCwgb21pdHRlZExpbmVzKTtcblx0XHRcdGNvbXBhY3RlZC5wdXNoKGxpbmUpO1xuXHRcdH1cblx0fVxuXHRmbHVzaFB5dGVzdFByb2dyZXNzTGluZXMoY29tcGFjdGVkLCBvbWl0dGVkTGluZXMpO1xuXHRyZXR1cm4gY29tcGFjdGVkLmpvaW4oJ1xcbicpO1xufVxuXG5mdW5jdGlvbiBmbHVzaFB5dGVzdFByb2dyZXNzTGluZXMoY29tcGFjdGVkOiBzdHJpbmdbXSwgb21pdHRlZExpbmVzOiBzdHJpbmdbXSk6IHZvaWQge1xuXHRpZiAob21pdHRlZExpbmVzLmxlbmd0aCA9PT0gMCkge1xuXHRcdHJldHVybjtcblx0fVxuXHRjb25zdCBzdW1tYXJ5ID0gb21pdHRlZExpbmVzLmV2ZXJ5KGxpbmUgPT4gaXNTdHJpY3RQeXRlc3RQYXNzZWRQcm9ncmVzc0xpbmUobGluZSkpXG5cdFx0PyBgW3B5dGVzdCBwcm9ncmVzczogb21pdHRlZCAke29taXR0ZWRMaW5lcy5sZW5ndGh9IFBBU1NFRCB0ZXN0IHJlc3VsdCBsaW5lKHMpXWBcblx0XHQ6IGBbcHl0ZXN0IHByb2dyZXNzOiBvbWl0dGVkICR7b21pdHRlZExpbmVzLmxlbmd0aH0gbm9uLWRpYWdub3N0aWMgbGluZShzKV1gO1xuXHRjb21wYWN0ZWQucHVzaChzdW1tYXJ5KTtcblx0b21pdHRlZExpbmVzLmxlbmd0aCA9IDA7XG59XG5cbmZ1bmN0aW9uIGlzUHl0ZXN0UHJvZ3Jlc3NMaW5lKGxpbmU6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gIWlzRGlhZ25vc3RpY0xpbmUobGluZSlcblx0XHQmJiAocmVnZXhUZXN0KFN0cmluZy5yYXdgXlstPV17MjAsfSRgLCBsaW5lKVxuXHRcdFx0fHwgcmVnZXhUZXN0KFN0cmluZy5yYXdgXlsuc3hYXSsoPzpcXHMrXFxbXFxzKlxcZCslXFxdKT9cXHMqJGAsIGxpbmUpXG5cdFx0XHR8fCByZWdleFRlc3QoXG5cdFx0XHRcdFN0cmluZy5yYXdgXlxcUytcXC5weTo6XFxTK1xccysoPzpQQVNTRUR8U0tJUFBFRHxYRkFJTClcXHMrXFxbXFxzKlxcZCslXFxdJGAsXG5cdFx0XHRcdGxpbmUsXG5cdFx0XHQpKTtcbn1cblxuZnVuY3Rpb24gaGFzUHl0ZXN0UHJvZ3Jlc3NGYWxsYmFja1BvaXNvbihvdXRwdXQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gcmVnZXhUZXN0KFxuXHRcdFN0cmluZy5yYXdgKD86XnxcXG4pKD86XFxTK1xcLnB5OjpcXFMrXFxzKyg/OkZBSUxFRHxFUlJPUilcXHMrXFxbXFxzKlxcZCslXFxdfCg/OkZBSUx8RVJST1J8SU5URVJOQUxFUlJPUilcXGIpfFRyYWNlYmFjayBcXChtb3N0IHJlY2VudCBjYWxsIGxhc3RcXCk6YCxcblx0XHRvdXRwdXQsXG5cdCkgfHwgaGFzSGFyZENyYXNoTGluZShvdXRwdXQpO1xufVxuXG5mdW5jdGlvbiBoYXNIYXJkQ3Jhc2hMaW5lKG91dHB1dDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiByZWdleFRlc3RXaXRoRmxhZ3MoXG5cdFx0U3RyaW5nLnJhd2AoPzpGYXRhbCBQeXRob24gZXJyb3I6fEFib3J0ZWR8QWJvcnQgdHJhcHxjb3JlIGR1bXBlZHxzZWdtZW50YXRpb24gZmF1bHQpYCxcblx0XHRvdXRwdXQsXG5cdFx0J2knLFxuXHQpO1xufVxuXG5mdW5jdGlvbiBoYXNTdHJpY3RQeXRlc3RQYXNzZWRQcm9ncmVzc1J1bihvdXRwdXQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRsZXQgcnVuTGVuZ3RoID0gMDtcblx0Zm9yIChjb25zdCBsaW5lIG9mIG91dHB1dC5zcGxpdCgnXFxuJykpIHtcblx0XHRpZiAoaXNTdHJpY3RQeXRlc3RQYXNzZWRQcm9ncmVzc0xpbmUobGluZSkpIHtcblx0XHRcdHJ1bkxlbmd0aCArPSAxO1xuXHRcdFx0aWYgKHJ1bkxlbmd0aCA+PSA1KSB7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRydW5MZW5ndGggPSAwO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gZmFsc2U7XG59XG5cbmZ1bmN0aW9uIGlzU3RyaWN0UHl0ZXN0UGFzc2VkUHJvZ3Jlc3NMaW5lKGxpbmU6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gIWlzRGlhZ25vc3RpY0xpbmUobGluZSkgJiYgcmVnZXhUZXN0KFN0cmluZy5yYXdgXlxcUytcXC5weTo6XFxTK1xccytQQVNTRURcXHMrXFxbXFxzKlxcZCslXFxdJGAsIGxpbmUpO1xufVxuXG5mdW5jdGlvbiBoYXNQeXRlc3RUZXJtaW5hbFN1bW1hcnkob3V0cHV0OiBzdHJpbmcpOiBib29sZWFuIHtcblx0cmV0dXJuIHJlZ2V4VGVzdFdpdGhGbGFncyhcblx0XHRTdHJpbmcucmF3YCg/Ol58XFxuKSg/Oj0rXFxzKik/W149XFxuXSooPzpwYXNzZWR8ZmFpbGVkfGVycm9ycz98d2FybmluZ3M/fHNraXBwZWR8eGZhaWxlZHx4cGFzc2VkKVtePVxcbl0qXFxiaW4gXFxkKyg/OlxcLlxcZCspP3NcXHMqKD86PSspP1xccyooPzpcXG58JClgLFxuXHRcdG91dHB1dCxcblx0XHQnaScsXG5cdCk7XG59XG5cbmZ1bmN0aW9uIGNvbXBhY3RQeXRlc3RGYWlsdXJlQmxvY2tzKG91dHB1dDogc3RyaW5nKTogc3RyaW5nIHtcblx0aWYgKCFoYXNQeXRlc3RUZXJtaW5hbFN1bW1hcnkob3V0cHV0KSkge1xuXHRcdHJldHVybiBvdXRwdXQ7XG5cdH1cblxuXHRjb25zdCBzaG9ydFN1bW1hcnlMaW5lcyA9IGNvdW50UHl0ZXN0U2hvcnRTdW1tYXJ5TGluZXMob3V0cHV0KTtcblx0Y29uc3Qgc2VjdGlvbkhlYWRlcnMgPSBjb3VudFB5dGVzdFNlY3Rpb25IZWFkZXJzKG91dHB1dCk7XG5cdGNvbnN0IGxpbmVzID0gb3V0cHV0LnNwbGl0KCdcXG4nKTtcblx0Y29uc3QgY29tcGFjdGVkOiBzdHJpbmdbXSA9IFtdO1xuXHRsZXQgaSA9IDA7XG5cdHdoaWxlIChpIDwgbGluZXMubGVuZ3RoKSB7XG5cdFx0Y29uc3Qgc2VjdGlvbiA9IHB5dGVzdFNlY3Rpb25OYW1lKGxpbmVzW2ldKTtcblx0XHRpZiAoc2VjdGlvbiAhPT0gJ0ZBSUxVUkVTJyAmJiBzZWN0aW9uICE9PSAnRVJST1JTJykge1xuXHRcdFx0Y29tcGFjdGVkLnB1c2gobGluZXNbaV0pO1xuXHRcdFx0aSArPSAxO1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXG5cdFx0Y29tcGFjdGVkLnB1c2gobGluZXNbaV0pO1xuXHRcdGNvbnN0IHN0YXJ0ID0gaSArIDE7XG5cdFx0bGV0IGVuZCA9IHN0YXJ0O1xuXHRcdHdoaWxlIChlbmQgPCBsaW5lcy5sZW5ndGggJiYgIWlzUHl0ZXN0U2VjdGlvbkhlYWRlcihsaW5lc1tlbmRdKSkge1xuXHRcdFx0ZW5kICs9IDE7XG5cdFx0fVxuXHRcdGNvbXBhY3RlZC5wdXNoKC4uLmNvbXBhY3RQeXRlc3RGYWlsdXJlUmVnaW9uKFxuXHRcdFx0bGluZXMuc2xpY2Uoc3RhcnQsIGVuZCksXG5cdFx0XHRhc2NpaUxvd2VyY2FzZShzZWN0aW9uID8/ICcnKSxcblx0XHQpKTtcblx0XHRpID0gZW5kO1xuXHR9XG5cblx0Y29uc3QgcmVzdWx0ID0gY29tcGFjdGVkLmpvaW4oJ1xcbicpO1xuXHRpZiAoY291bnRQeXRlc3RTaG9ydFN1bW1hcnlMaW5lcyhyZXN1bHQpID09PSBzaG9ydFN1bW1hcnlMaW5lc1xuXHRcdCYmIGNvdW50UHl0ZXN0U2VjdGlvbkhlYWRlcnMocmVzdWx0KSA9PT0gc2VjdGlvbkhlYWRlcnNcblx0KSB7XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXHRyZXR1cm4gb3V0cHV0O1xufVxuXG5pbnRlcmZhY2UgUHl0ZXN0RmFpbHVyZUJsb2NrIHtcblx0aGVhZGVyOiBzdHJpbmc7XG5cdG5hbWU6IHN0cmluZztcblx0Ym9keTogc3RyaW5nW107XG5cdGtleTogc3RyaW5nIHwgdW5kZWZpbmVkO1xufVxuXG50eXBlIFB5dGVzdEZhaWx1cmVFbnRyeSA9XG5cdHwgeyB0eXBlOiAnbGluZSc7IGxpbmU6IHN0cmluZyB9XG5cdHwgeyB0eXBlOiAnYmxvY2snOyBibG9jazogUHl0ZXN0RmFpbHVyZUJsb2NrIH07XG5cbmZ1bmN0aW9uIGNvbXBhY3RQeXRlc3RGYWlsdXJlUmVnaW9uKGxpbmVzOiByZWFkb25seSBzdHJpbmdbXSwgbGFiZWw6IHN0cmluZyk6IHN0cmluZ1tdIHtcblx0Y29uc3QgZW50cmllczogUHl0ZXN0RmFpbHVyZUVudHJ5W10gPSBbXTtcblx0Y29uc3QgZ3JvdXBzID0gbmV3IE1hcDxzdHJpbmcsIFB5dGVzdEZhaWx1cmVCbG9ja1tdPigpO1xuXHRsZXQgaSA9IDA7XG5cdHdoaWxlIChpIDwgbGluZXMubGVuZ3RoKSB7XG5cdFx0Y29uc3QgbmFtZSA9IHBhcnNlUHl0ZXN0RmFpbHVyZUJsb2NrSGVhZGVyKGxpbmVzW2ldKTtcblx0XHRpZiAobmFtZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRlbnRyaWVzLnB1c2goeyB0eXBlOiAnbGluZScsIGxpbmU6IGxpbmVzW2ldIH0pO1xuXHRcdFx0aSArPSAxO1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXG5cdFx0Y29uc3QgaGVhZGVyID0gbGluZXNbaV07XG5cdFx0aSArPSAxO1xuXHRcdGNvbnN0IGJvZHlTdGFydCA9IGk7XG5cdFx0d2hpbGUgKGkgPCBsaW5lcy5sZW5ndGhcblx0XHRcdCYmIHBhcnNlUHl0ZXN0RmFpbHVyZUJsb2NrSGVhZGVyKGxpbmVzW2ldKSA9PT0gdW5kZWZpbmVkXG5cdFx0XHQmJiAhaXNQeXRlc3RTZWN0aW9uSGVhZGVyKGxpbmVzW2ldKVxuXHRcdCkge1xuXHRcdFx0aSArPSAxO1xuXHRcdH1cblx0XHRjb25zdCBib2R5ID0gbGluZXMuc2xpY2UoYm9keVN0YXJ0LCBpKTtcblx0XHRjb25zdCBrZXkgPSBweXRlc3RGYWlsdXJlQmxvY2tLZXkoYm9keSk7XG5cdFx0Y29uc3QgYmxvY2s6IFB5dGVzdEZhaWx1cmVCbG9jayA9IHsgaGVhZGVyLCBuYW1lLCBib2R5LCBrZXkgfTtcblx0XHRpZiAoa2V5ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdGNvbnN0IGxpc3QgPSBncm91cHMuZ2V0KGtleSk7XG5cdFx0XHRpZiAobGlzdCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdGxpc3QucHVzaChibG9jayk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRncm91cHMuc2V0KGtleSwgW2Jsb2NrXSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGVudHJpZXMucHVzaCh7IHR5cGU6ICdibG9jaycsIGJsb2NrIH0pO1xuXHR9XG5cblx0Y29uc3QgZW1pdHRlZEdyb3Vwczogc3RyaW5nW10gPSBbXTtcblx0Y29uc3QgY29tcGFjdGVkOiBzdHJpbmdbXSA9IFtdO1xuXHRmb3IgKGNvbnN0IGVudHJ5IG9mIGVudHJpZXMpIHtcblx0XHRpZiAoZW50cnkudHlwZSA9PT0gJ2xpbmUnKSB7XG5cdFx0XHRjb21wYWN0ZWQucHVzaChlbnRyeS5saW5lKTtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblx0XHRjb25zdCBibG9jayA9IGVudHJ5LmJsb2NrO1xuXHRcdGNvbnN0IGdyb3VwID0gYmxvY2sua2V5ICE9PSB1bmRlZmluZWQgPyBncm91cHMuZ2V0KGJsb2NrLmtleSkgOiB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgYWxyZWFkeUVtaXR0ZWQgPSBibG9jay5rZXkgIT09IHVuZGVmaW5lZCAmJiBlbWl0dGVkR3JvdXBzLmluY2x1ZGVzKGJsb2NrLmtleSk7XG5cdFx0aWYgKGJsb2NrLmtleSA9PT0gdW5kZWZpbmVkIHx8IGdyb3VwID09PSB1bmRlZmluZWQgfHwgZ3JvdXAubGVuZ3RoIDwgMiB8fCBhbHJlYWR5RW1pdHRlZCkge1xuXHRcdFx0aWYgKGJsb2NrLmtleSA9PT0gdW5kZWZpbmVkIHx8IGdyb3VwID09PSB1bmRlZmluZWQgfHwgZ3JvdXAubGVuZ3RoIDwgMikge1xuXHRcdFx0XHRjb21wYWN0ZWQucHVzaChibG9jay5oZWFkZXIpO1xuXHRcdFx0XHRjb21wYWN0ZWQucHVzaCguLi5ibG9jay5ib2R5KTtcblx0XHRcdH1cblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblxuXHRcdGVtaXR0ZWRHcm91cHMucHVzaChibG9jay5rZXkpO1xuXHRcdGNvbnN0IGZpcnN0ID0gZ3JvdXBbMF07XG5cdFx0Y29tcGFjdGVkLnB1c2goZmlyc3QuaGVhZGVyKTtcblx0XHRjb21wYWN0ZWQucHVzaCguLi5maXJzdC5ib2R5KTtcblx0XHRjb25zdCBkdXBsaWNhdGVzID0gZ3JvdXAuc2xpY2UoMSk7XG5cdFx0Y29tcGFjdGVkLnB1c2goYFtweXRlc3QgJHtsYWJlbH06ICR7ZHVwbGljYXRlcy5sZW5ndGh9IGR1cGxpY2F0ZSB0cmFjZWJhY2sgYmxvY2socykgbWF0Y2ggJHtmaXJzdC5uYW1lfTsgYWxzbzogJHtzdW1tYXJpemVXaXRoTW9yZShkdXBsaWNhdGVzLm1hcChkdXBsaWNhdGUgPT4gZHVwbGljYXRlLm5hbWUpLCA4KX1dYCk7XG5cdH1cblx0cmV0dXJuIGNvbXBhY3RlZDtcbn1cblxuZnVuY3Rpb24gcGFyc2VQeXRlc3RGYWlsdXJlQmxvY2tIZWFkZXIobGluZTogc3RyaW5nKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0cmV0dXJuIHJlZ2V4Q2FwdHVyZUZpcnN0KFN0cmluZy5yYXdgXl97Myx9XFxzKyguKz8pXFxzK197Myx9XFxzKiRgLCBsaW5lKTtcbn1cblxuZnVuY3Rpb24gcHl0ZXN0RmFpbHVyZUJsb2NrS2V5KGJvZHk6IHJlYWRvbmx5IHN0cmluZ1tdKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0aWYgKGJvZHkubGVuZ3RoIDwgMyB8fCBib2R5LnNvbWUobGluZSA9PiBpc1B5dGVzdFN1bW1hcnlMaW5lKGxpbmUpKSkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0Y29uc3Qgbm9ybWFsaXplZCA9IGJvZHlcblx0XHQubWFwKGxpbmUgPT4gbm9ybWFsaXplUHl0ZXN0RmFpbHVyZUxpbmUobGluZSkpXG5cdFx0LmZpbHRlcihsaW5lID0+IGxpbmUudHJpbSgpLmxlbmd0aCAhPT0gMClcblx0XHQuam9pbignXFxuJyk7XG5cdGlmIChub3JtYWxpemVkLnNwbGl0KCdcXG4nKS5sZW5ndGggPj0gMykge1xuXHRcdHJldHVybiBub3JtYWxpemVkO1xuXHR9XG5cdHJldHVybiB1bmRlZmluZWQ7XG59XG5cbmZ1bmN0aW9uIG5vcm1hbGl6ZVB5dGVzdEZhaWx1cmVMaW5lKGxpbmU6IHN0cmluZyk6IHN0cmluZyB7XG5cdGNvbnN0IHN0cmlwcGVkID0gc3RyaXBBbnNpKGxpbmUpO1xuXHRyZXR1cm4gc3RyaXBwZWQucmVwbGFjZShuZXcgUmVnRXhwKFN0cmluZy5yYXdgXlxcW2d3XFxkK1xcXVxccypgKSwgJycpO1xufVxuXG5mdW5jdGlvbiBpc1B5dGVzdFN1bW1hcnlMaW5lKGxpbmU6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gcmVnZXhUZXN0KFN0cmluZy5yYXdgXig/OkZBSUxFRHxFUlJPUilcXHMrXFxTYCwgbGluZSk7XG59XG5cbmZ1bmN0aW9uIGNvdW50UHl0ZXN0U2hvcnRTdW1tYXJ5TGluZXMob3V0cHV0OiBzdHJpbmcpOiBudW1iZXIge1xuXHRyZXR1cm4gb3V0cHV0LnNwbGl0KCdcXG4nKS5maWx0ZXIobGluZSA9PiBpc1B5dGVzdFN1bW1hcnlMaW5lKGxpbmUpKS5sZW5ndGg7XG59XG5cbmZ1bmN0aW9uIGNvdW50UHl0ZXN0U2VjdGlvbkhlYWRlcnMob3V0cHV0OiBzdHJpbmcpOiBudW1iZXIge1xuXHRyZXR1cm4gb3V0cHV0LnNwbGl0KCdcXG4nKS5maWx0ZXIobGluZSA9PiBpc1B5dGVzdFNlY3Rpb25IZWFkZXIobGluZSkpLmxlbmd0aDtcbn1cblxuZnVuY3Rpb24gaXNQeXRlc3RTZWN0aW9uSGVhZGVyKGxpbmU6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gcHl0ZXN0U2VjdGlvbk5hbWUobGluZSkgIT09IHVuZGVmaW5lZFxuXHRcdHx8IHJlZ2V4VGVzdChTdHJpbmcucmF3YF49K1xccysuKlxcYmluIFxcZCsoPzpcXC5cXGQrKT9zXFxiLipcXHMqPStcXHMqJGAsIGxpbmUpO1xufVxuXG5mdW5jdGlvbiBweXRlc3RTZWN0aW9uTmFtZShsaW5lOiBzdHJpbmcpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRjb25zdCBuYW1lID0gcmVnZXhDYXB0dXJlRmlyc3QoU3RyaW5nLnJhd2BePStcXHMrKFtBLVphLXpdW0EtWmEteiBdKylcXHMrPStcXHMqJGAsIGxpbmUpO1xuXHRyZXR1cm4gbmFtZSAhPT0gdW5kZWZpbmVkID8gbmFtZS50cmltKCkgOiB1bmRlZmluZWQ7XG59XG5cbmZ1bmN0aW9uIGNvbXBhY3RQeXRlc3RXYXJuaW5nc1N1bW1hcnkob3V0cHV0OiBzdHJpbmcpOiBzdHJpbmcge1xuXHRjb25zdCBsaW5lcyA9IG91dHB1dC5zcGxpdCgnXFxuJyk7XG5cdGNvbnN0IGNvbXBhY3RlZDogc3RyaW5nW10gPSBbXTtcblx0bGV0IGkgPSAwO1xuXHR3aGlsZSAoaSA8IGxpbmVzLmxlbmd0aCkge1xuXHRcdGlmICghcmVnZXhUZXN0V2l0aEZsYWdzKFN0cmluZy5yYXdgXj0rXFxzKndhcm5pbmdzIHN1bW1hcnlcXHMqPSskYCwgbGluZXNbaV0sICdpJykpIHtcblx0XHRcdGNvbXBhY3RlZC5wdXNoKGxpbmVzW2ldKTtcblx0XHRcdGkgKz0gMTtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblxuXHRcdGNvbXBhY3RlZC5wdXNoKGxpbmVzW2ldKTtcblx0XHRsZXQgaiA9IGkgKyAxO1xuXHRcdHdoaWxlIChqIDwgbGluZXMubGVuZ3RoICYmICFyZWdleFRlc3QoU3RyaW5nLnJhd2BePStcXHMrLitcXHMrPSskYCwgbGluZXNbal0pKSB7XG5cdFx0XHRqICs9IDE7XG5cdFx0fVxuXHRcdGNvbXBhY3RlZC5wdXNoKC4uLmNvbXBhY3RQeXRlc3RXYXJuaW5nc1N1bW1hcnlSZWdpb24obGluZXMuc2xpY2UoaSArIDEsIGopKSk7XG5cdFx0aSA9IGo7XG5cdH1cblx0cmV0dXJuIGNvbXBhY3RlZC5qb2luKCdcXG4nKTtcbn1cblxuaW50ZXJmYWNlIFB5dGVzdFdhcm5pbmdCbG9jayB7XG5cdHRlc3RJZHM6IHN0cmluZ1tdO1xuXHRib2R5OiBzdHJpbmdbXTtcblx0a2V5OiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHdhcm5pbmdDbGFzczogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRtZXNzYWdlOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG59XG5cbnR5cGUgUHl0ZXN0V2FybmluZ0VudHJ5ID1cblx0fCB7IHR5cGU6ICdsaW5lJzsgbGluZTogc3RyaW5nIH1cblx0fCB7IHR5cGU6ICdibG9jayc7IGJsb2NrOiBQeXRlc3RXYXJuaW5nQmxvY2sgfTtcblxuZnVuY3Rpb24gY29tcGFjdFB5dGVzdFdhcm5pbmdzU3VtbWFyeVJlZ2lvbihsaW5lczogcmVhZG9ubHkgc3RyaW5nW10pOiBzdHJpbmdbXSB7XG5cdGNvbnN0IGVudHJpZXM6IFB5dGVzdFdhcm5pbmdFbnRyeVtdID0gW107XG5cdGNvbnN0IGdyb3VwcyA9IG5ldyBNYXA8c3RyaW5nLCBQeXRlc3RXYXJuaW5nQmxvY2tbXT4oKTtcblx0bGV0IGkgPSAwO1xuXHR3aGlsZSAoaSA8IGxpbmVzLmxlbmd0aCkge1xuXHRcdGlmICghaXNQeXRlc3RXYXJuaW5nVGVzdElkTGluZShsaW5lc1tpXSkpIHtcblx0XHRcdGVudHJpZXMucHVzaCh7IHR5cGU6ICdsaW5lJywgbGluZTogbGluZXNbaV0gfSk7XG5cdFx0XHRpICs9IDE7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cblx0XHRjb25zdCB0ZXN0SWRzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdHdoaWxlIChpIDwgbGluZXMubGVuZ3RoICYmIGlzUHl0ZXN0V2FybmluZ1Rlc3RJZExpbmUobGluZXNbaV0pKSB7XG5cdFx0XHR0ZXN0SWRzLnB1c2gobGluZXNbaV0pO1xuXHRcdFx0aSArPSAxO1xuXHRcdH1cblxuXHRcdGNvbnN0IGJvZHk6IHN0cmluZ1tdID0gW107XG5cdFx0d2hpbGUgKGkgPCBsaW5lcy5sZW5ndGhcblx0XHRcdCYmICFpc1B5dGVzdFdhcm5pbmdUZXN0SWRMaW5lKGxpbmVzW2ldKVxuXHRcdFx0JiYgIWxpbmVzW2ldLnN0YXJ0c1dpdGgoJy0tIERvY3M6ICcpXG5cdFx0KSB7XG5cdFx0XHRib2R5LnB1c2gobGluZXNbaV0pO1xuXHRcdFx0aSArPSAxO1xuXHRcdH1cblxuXHRcdGNvbnN0IHBhcnNlZCA9IHBhcnNlUHl0ZXN0V2FybmluZ0JvZHkoYm9keSk7XG5cdFx0Y29uc3QgYmxvY2s6IFB5dGVzdFdhcm5pbmdCbG9jayA9IHtcblx0XHRcdHRlc3RJZHMsXG5cdFx0XHRib2R5LFxuXHRcdFx0a2V5OiBwYXJzZWQ/LmtleSxcblx0XHRcdHdhcm5pbmdDbGFzczogcGFyc2VkPy53YXJuaW5nQ2xhc3MsXG5cdFx0XHRtZXNzYWdlOiBwYXJzZWQ/Lm1lc3NhZ2UsXG5cdFx0fTtcblx0XHRpZiAoYmxvY2sua2V5ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdGNvbnN0IGxpc3QgPSBncm91cHMuZ2V0KGJsb2NrLmtleSk7XG5cdFx0XHRpZiAobGlzdCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdGxpc3QucHVzaChibG9jayk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRncm91cHMuc2V0KGJsb2NrLmtleSwgW2Jsb2NrXSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGVudHJpZXMucHVzaCh7IHR5cGU6ICdibG9jaycsIGJsb2NrIH0pO1xuXHR9XG5cblx0Y29uc3QgZW1pdHRlZEdyb3Vwczogc3RyaW5nW10gPSBbXTtcblx0Y29uc3QgY29tcGFjdGVkOiBzdHJpbmdbXSA9IFtdO1xuXHRmb3IgKGNvbnN0IGVudHJ5IG9mIGVudHJpZXMpIHtcblx0XHRpZiAoZW50cnkudHlwZSA9PT0gJ2xpbmUnKSB7XG5cdFx0XHRjb21wYWN0ZWQucHVzaChlbnRyeS5saW5lKTtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblx0XHRjb25zdCBibG9jayA9IGVudHJ5LmJsb2NrO1xuXHRcdGNvbnN0IGdyb3VwID0gYmxvY2sua2V5ICE9PSB1bmRlZmluZWQgPyBncm91cHMuZ2V0KGJsb2NrLmtleSkgOiB1bmRlZmluZWQ7XG5cdFx0Y29uc3Qgc2hvdWxkR3JvdXAgPSBncm91cCAhPT0gdW5kZWZpbmVkICYmIChncm91cC5sZW5ndGggPiAxIHx8IGdyb3VwWzBdLnRlc3RJZHMubGVuZ3RoID4gMSk7XG5cdFx0Y29uc3QgYWxyZWFkeUVtaXR0ZWQgPSBibG9jay5rZXkgIT09IHVuZGVmaW5lZCAmJiBlbWl0dGVkR3JvdXBzLmluY2x1ZGVzKGJsb2NrLmtleSk7XG5cdFx0aWYgKCFzaG91bGRHcm91cCB8fCBibG9jay5rZXkgPT09IHVuZGVmaW5lZCB8fCBhbHJlYWR5RW1pdHRlZCkge1xuXHRcdFx0aWYgKCFzaG91bGRHcm91cCkge1xuXHRcdFx0XHRjb21wYWN0ZWQucHVzaCguLi5mb3JtYXRQeXRlc3RXYXJuaW5nQmxvY2soYmxvY2spKTtcblx0XHRcdH1cblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblx0XHRpZiAoZ3JvdXAgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXG5cdFx0ZW1pdHRlZEdyb3Vwcy5wdXNoKGJsb2NrLmtleSk7XG5cdFx0Y29uc3QgdG90YWxUZXN0SWRzID0gZ3JvdXAucmVkdWNlKChzdW0sIGl0ZW0pID0+IHN1bSArIGl0ZW0udGVzdElkcy5sZW5ndGgsIDApO1xuXHRcdGNvbXBhY3RlZC5wdXNoKGdyb3VwWzBdLnRlc3RJZHNbMF0pO1xuXHRcdGlmICh0b3RhbFRlc3RJZHMgPiAxKSB7XG5cdFx0XHRjb21wYWN0ZWQucHVzaChgW3B5dGVzdCB3YXJuaW5ncyBzdW1tYXJ5OiAke3RvdGFsVGVzdElkc30gdGVzdCBpZCBsaW5lKHMpIHNoYXJlICR7YmxvY2sud2FybmluZ0NsYXNzID8/ICd3YXJuaW5nJ306ICR7YmxvY2subWVzc2FnZSA/PyAnJ31dYCk7XG5cdFx0fVxuXHRcdGNvbXBhY3RlZC5wdXNoKC4uLmdyb3VwWzBdLmJvZHkpO1xuXHRcdGNvbnN0IGR1cGxpY2F0ZUJvZGllcyA9IGdyb3VwLmxlbmd0aCAtIDE7XG5cdFx0aWYgKGR1cGxpY2F0ZUJvZGllcyA+IDApIHtcblx0XHRcdGNvbnN0IGxvY2F0aW9uczogc3RyaW5nW10gPSBbXTtcblx0XHRcdGZvciAoY29uc3QgaXRlbSBvZiBncm91cCkge1xuXHRcdFx0XHRjb25zdCBsb2NhdGlvbiA9IHBhcnNlUHl0ZXN0V2FybmluZ0xvY2F0aW9uKGl0ZW0uYm9keSk7XG5cdFx0XHRcdGlmIChsb2NhdGlvbiAhPT0gdW5kZWZpbmVkICYmICFsb2NhdGlvbnMuaW5jbHVkZXMobG9jYXRpb24pKSB7XG5cdFx0XHRcdFx0bG9jYXRpb25zLnB1c2gobG9jYXRpb24pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBsb2NhdGlvblN1bW1hcnkgPSBsb2NhdGlvbnMubGVuZ3RoID4gMSA/IGAgZnJvbSAke2xvY2F0aW9ucy5sZW5ndGh9IGxvY2F0aW9uKHMpYCA6ICcnO1xuXHRcdFx0Y29tcGFjdGVkLnB1c2goYFtweXRlc3Qgd2FybmluZ3Mgc3VtbWFyeTogb21pdHRlZCAke2R1cGxpY2F0ZUJvZGllc30gZHVwbGljYXRlIHdhcm5pbmcgYmxvY2socykke2xvY2F0aW9uU3VtbWFyeX1dYCk7XG5cdFx0fVxuXHR9XG5cdHJldHVybiBjb21wYWN0ZWQ7XG59XG5cbmZ1bmN0aW9uIGZvcm1hdFB5dGVzdFdhcm5pbmdCbG9jayhibG9jazogUHl0ZXN0V2FybmluZ0Jsb2NrKTogc3RyaW5nW10ge1xuXHRpZiAoYmxvY2sudGVzdElkcy5sZW5ndGggPD0gMSkge1xuXHRcdHJldHVybiBbLi4uYmxvY2sudGVzdElkcywgLi4uYmxvY2suYm9keV07XG5cdH1cblx0Y29uc3QgbGluZXMgPSBbYmxvY2sudGVzdElkc1swXV07XG5cdGxpbmVzLnB1c2goYFtweXRlc3Qgd2FybmluZ3Mgc3VtbWFyeTogb21pdHRlZCAke2Jsb2NrLnRlc3RJZHMubGVuZ3RoIC0gMX0gdGVzdCBpZCBsaW5lKHMpXWApO1xuXHRsaW5lcy5wdXNoKC4uLmJsb2NrLmJvZHkpO1xuXHRyZXR1cm4gbGluZXM7XG59XG5cbmludGVyZmFjZSBQYXJzZWRQeXRlc3RXYXJuaW5nQm9keSB7XG5cdGtleTogc3RyaW5nO1xuXHR3YXJuaW5nQ2xhc3M6IHN0cmluZztcblx0bWVzc2FnZTogc3RyaW5nO1xufVxuXG5mdW5jdGlvbiBwYXJzZVB5dGVzdFdhcm5pbmdCb2R5KGJvZHk6IHJlYWRvbmx5IHN0cmluZ1tdKTogUGFyc2VkUHl0ZXN0V2FybmluZ0JvZHkgfCB1bmRlZmluZWQge1xuXHRjb25zdCByZWdleCA9IG5ldyBSZWdFeHAoU3RyaW5nLnJhd2BeXFxzKy4rPzpcXGQrOlxccysoW0EtWmEtel9dW0EtWmEtejAtOV8uXSpXYXJuaW5nKTpcXHMrKC4rKSRgKTtcblx0Zm9yIChjb25zdCBsaW5lIG9mIGJvZHkpIHtcblx0XHRjb25zdCBjYXB0dXJlcyA9IHJlZ2V4LmV4ZWMobGluZSk7XG5cdFx0aWYgKGNhcHR1cmVzID09PSBudWxsKSB7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cdFx0Y29uc3Qgd2FybmluZ0NsYXNzID0gY2FwdHVyZXNbMV07XG5cdFx0Y29uc3QgbWVzc2FnZVJhdyA9IGNhcHR1cmVzWzJdO1xuXHRcdGlmICh3YXJuaW5nQ2xhc3MgPT09IHVuZGVmaW5lZCB8fCBtZXNzYWdlUmF3ID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IG1lc3NhZ2UgPSBub3JtYWxpemVQeXRlc3RXYXJuaW5nTWVzc2FnZShtZXNzYWdlUmF3KTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0a2V5OiBgJHt3YXJuaW5nQ2xhc3N9XFwwJHttZXNzYWdlfWAsXG5cdFx0XHR3YXJuaW5nQ2xhc3MsXG5cdFx0XHRtZXNzYWdlLFxuXHRcdH07XG5cdH1cblx0cmV0dXJuIHVuZGVmaW5lZDtcbn1cblxuZnVuY3Rpb24gcGFyc2VQeXRlc3RXYXJuaW5nTG9jYXRpb24oYm9keTogcmVhZG9ubHkgc3RyaW5nW10pOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRmb3IgKGNvbnN0IGxpbmUgb2YgYm9keSkge1xuXHRcdGNvbnN0IGxvY2F0aW9uID0gcmVnZXhDYXB0dXJlRmlyc3QoXG5cdFx0XHRTdHJpbmcucmF3YF5cXHMrKC4rPzpcXGQrKTpcXHMrW0EtWmEtel9dW0EtWmEtejAtOV8uXSpXYXJuaW5nOlxccysuKyRgLFxuXHRcdFx0bGluZSxcblx0XHQpO1xuXHRcdGlmIChsb2NhdGlvbiAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm4gbG9jYXRpb247XG5cdFx0fVxuXHR9XG5cdHJldHVybiB1bmRlZmluZWQ7XG59XG5cbmZ1bmN0aW9uIG5vcm1hbGl6ZVB5dGVzdFdhcm5pbmdNZXNzYWdlKG1lc3NhZ2U6IHN0cmluZyk6IHN0cmluZyB7XG5cdHJldHVybiBzcGxpdFdoaXRlc3BhY2UobWVzc2FnZSkuam9pbignICcpO1xufVxuXG5mdW5jdGlvbiBpc1B5dGVzdFdhcm5pbmdUZXN0SWRMaW5lKGxpbmU6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRjb25zdCB0cmltbWVkID0gbGluZS50cmltRW5kKCk7XG5cdHJldHVybiBsaW5lID09PSB0cmltbWVkXG5cdFx0JiYgKCghdHJpbW1lZC5pbmNsdWRlcygnICcpXG5cdFx0XHQmJiAodHJpbW1lZC5pbmNsdWRlcygnLnB5OjonKSB8fCByZWdleFRlc3QoU3RyaW5nLnJhd2BeXFxTK1xcLnB5OlxcZCskYCwgdHJpbW1lZCkpKVxuXHRcdFx0fHwgcmVnZXhUZXN0KFN0cmluZy5yYXdgXlxcUytcXC5weTpcXHMrXFxkKyB3YXJuaW5ncz8kYCwgdHJpbW1lZCkpO1xufVxuXG5mdW5jdGlvbiBjb21wYWN0R3JlcENvbnRlbnRPdXRwdXQob3V0cHV0OiBzdHJpbmcsIGxhcmdlT3V0cHV0VGhyZXNob2xkOiBudW1iZXIpOiBUb29sQ29tcGFjdGlvblJlc3VsdCB7XG5cdGNvbnN0IGxpbmVzID0gc3BsaXRUb29sT3V0cHV0TGluZXMob3V0cHV0KTtcblx0aWYgKHNob3VsZFNraXBUb29sT3V0cHV0Q29tcGFjdGlvbihsaW5lcywgb3V0cHV0LCA4KSkge1xuXHRcdHJldHVybiB1bmNoYW5nZWQob3V0cHV0KTtcblx0fVxuXG5cdGNvbnN0IGdyZXBMaW5lcyA9IGxpbmVzLmZpbHRlcihsaW5lID0+IGxpbmUgIT09ICctLScpO1xuXHRjb25zdCBwYXJzZWRNYXRjaGVzOiBHcmVwQ29udGVudE1hdGNoW10gPSBbXTtcblx0Zm9yIChjb25zdCBsaW5lIG9mIGdyZXBMaW5lcykge1xuXHRcdGNvbnN0IHBhcnNlZCA9IHBhcnNlR3JlcENvbnRlbnRMaW5lKGxpbmUpO1xuXHRcdGlmIChwYXJzZWQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cGFyc2VkTWF0Y2hlcy5wdXNoKHBhcnNlZCk7XG5cdFx0fVxuXHR9XG5cdGlmIChwYXJzZWRNYXRjaGVzLmxlbmd0aCA8IDggfHwgKHBhcnNlZE1hdGNoZXMubGVuZ3RoIDwgMjAgJiYganNTdHJpbmdMZW4ob3V0cHV0KSA8IDQwMDApKSB7XG5cdFx0cmV0dXJuIHVuY2hhbmdlZChvdXRwdXQpO1xuXHR9XG5cdGlmIChwYXJzZWRNYXRjaGVzLmxlbmd0aCAhPT0gZ3JlcExpbmVzLmxlbmd0aFxuXHRcdCYmIChmaXRzTGFyZ2VPdXRwdXRUaHJlc2hvbGQob3V0cHV0LCBsYXJnZU91dHB1dFRocmVzaG9sZClcblx0XHRcdHx8IChwYXJzZWRNYXRjaGVzLmxlbmd0aCAvIGdyZXBMaW5lcy5sZW5ndGgpIDwgMC42KVxuXHQpIHtcblx0XHRyZXR1cm4gdW5jaGFuZ2VkKG91dHB1dCk7XG5cdH1cblxuXHRjb25zdCBzb3J0ZWRHcm91cHMgPSBncmVwQ29udGVudEdyb3VwcyhwYXJzZWRNYXRjaGVzKTtcblx0Y29uc3QgY29tbW9uUHJlZml4ID0gY29tbW9uRGlyZWN0b3J5UHJlZml4KHBhcnNlZE1hdGNoZXMubWFwKG0gPT4gbS5wYXRoKSk7XG5cdGNvbnN0IGJvZHlCdWRnZXQgPSBjb21wYWN0ZWRCb2R5QnVkZ2V0KGxhcmdlT3V0cHV0VGhyZXNob2xkKTtcblx0Y29uc3QgbG9zc2xlc3MgPSByZW5kZXJHcmVwQ29udGVudEdyb3Vwcyhzb3J0ZWRHcm91cHMsIGNvbW1vblByZWZpeCwgc29ydGVkR3JvdXBzLmxlbmd0aCwgaW5kZXhBbGwpO1xuXG5cdGlmIChieXRlTGVuZ3RoKGxvc3NsZXNzKSA+PSBieXRlTGVuZ3RoKG91dHB1dCkgJiYgZml0c0xhcmdlT3V0cHV0VGhyZXNob2xkKG91dHB1dCwgbGFyZ2VPdXRwdXRUaHJlc2hvbGQpKSB7XG5cdFx0cmV0dXJuIHVuY2hhbmdlZChvdXRwdXQpO1xuXHR9XG5cdGlmIChmaXRzTGFyZ2VPdXRwdXRUaHJlc2hvbGQobG9zc2xlc3MsIGxhcmdlT3V0cHV0VGhyZXNob2xkKSkge1xuXHRcdHJldHVybiB7IG91dHB1dDogbG9zc2xlc3MsIGxvc3NsZXNzOiB0cnVlIH07XG5cdH1cblxuXHRjb25zdCBhZ2dyZXNzaXZlID0gcmVuZGVyR3JlcENvbnRlbnRHcm91cHMoc29ydGVkR3JvdXBzLCBjb21tb25QcmVmaXgsIDEyLCBzZWxlY3RIZWFkVGFpbFRvU2hvdyk7XG5cdGlmIChmaXRzTGFyZ2VPdXRwdXRUaHJlc2hvbGQoYWdncmVzc2l2ZSwgYm9keUJ1ZGdldCkpIHtcblx0XHRyZXR1cm4gbG9zc3koYWdncmVzc2l2ZSk7XG5cdH1cblxuXHRjb25zdCBmYWxsYmFjayA9IHJlbmRlckJ1ZGdldGVkR3JlcENvbnRlbnRHcm91cHMoc29ydGVkR3JvdXBzLCBjb21tb25QcmVmaXgsIGxhcmdlT3V0cHV0VGhyZXNob2xkKTtcblx0aWYgKGJ5dGVMZW5ndGgoZmFsbGJhY2spIDwgYnl0ZUxlbmd0aChhZ2dyZXNzaXZlKSkge1xuXHRcdHJldHVybiBsb3NzeShmYWxsYmFjayk7XG5cdH1cblx0cmV0dXJuIGxvc3N5KGFnZ3Jlc3NpdmUpO1xufVxuXG5mdW5jdGlvbiBncmVwQ29udGVudEdyb3VwcyhtYXRjaGVzOiByZWFkb25seSBHcmVwQ29udGVudE1hdGNoW10pOiBbc3RyaW5nLCBHcmVwQ29udGVudE1hdGNoW11dW10ge1xuXHRjb25zdCBncm91cHMgPSBuZXcgTWFwPHN0cmluZywgR3JlcENvbnRlbnRNYXRjaFtdPigpO1xuXHRmb3IgKGNvbnN0IG0gb2YgbWF0Y2hlcykge1xuXHRcdGNvbnN0IGxpc3QgPSBncm91cHMuZ2V0KG0ucGF0aCk7XG5cdFx0aWYgKGxpc3QgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0bGlzdC5wdXNoKG0pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRncm91cHMuc2V0KG0ucGF0aCwgW21dKTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIFsuLi5ncm91cHMuZW50cmllcygpXTtcbn1cblxudHlwZSBTZWxlY3RHcmVwTWF0Y2hlcyA9IChtYXRjaGVzOiByZWFkb25seSBHcmVwQ29udGVudE1hdGNoW10pID0+IEluZGV4ZWQ8R3JlcENvbnRlbnRNYXRjaD5bXTtcblxuZnVuY3Rpb24gcmVuZGVyR3JlcENvbnRlbnRHcm91cHMoXG5cdHNvcnRlZEdyb3VwczogcmVhZG9ubHkgW3N0cmluZywgR3JlcENvbnRlbnRNYXRjaFtdXVtdLFxuXHRjb21tb25QcmVmaXg6IHN0cmluZyxcblx0bWF4R3JvdXBzOiBudW1iZXIsXG5cdHNlbGVjdE1hdGNoZXM6IFNlbGVjdEdyZXBNYXRjaGVzLFxuKTogc3RyaW5nIHtcblx0Y29uc3QgdG90YWxNYXRjaGVzID0gdG90YWxHcm91cEl0ZW1zKHNvcnRlZEdyb3Vwcyk7XG5cdGNvbnN0IGNvbXBhY3RlZDogc3RyaW5nW10gPSBbXTtcblx0Y29tcGFjdGVkLnB1c2goYFtncmVwIGNvbnRlbnQ6ICR7dG90YWxNYXRjaGVzfSBtYXRjaGVzIGFjcm9zcyAke3NvcnRlZEdyb3Vwcy5sZW5ndGh9IGZpbGUocykke2NvbW1vblByZWZpeC5sZW5ndGggPT09IDAgPyAnJyA6IGAgdW5kZXIgJHtjb21tb25QcmVmaXh9YH1dYCk7XG5cdGZvciAoY29uc3QgW2ZpbGVQYXRoLCBmaWxlTWF0Y2hlc10gb2Ygc29ydGVkR3JvdXBzLnNsaWNlKDAsIG1heEdyb3VwcykpIHtcblx0XHRjb25zdCBkaXNwbGF5UGF0aCA9IGRpc3BsYXlQYXRoVW5kZXJQcmVmaXgoZmlsZVBhdGgsIGNvbW1vblByZWZpeCk7XG5cdFx0aWYgKGZpbGVNYXRjaGVzLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0Y29tcGFjdGVkLnB1c2goYCR7ZGlzcGxheVBhdGh9OiR7Zm9ybWF0R3JlcE1hdGNoKGZpbGVNYXRjaGVzWzBdKX1gKTtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblx0XHRjb21wYWN0ZWQucHVzaCgnJyk7XG5cdFx0Y29tcGFjdGVkLnB1c2goYCR7ZGlzcGxheVBhdGh9ICgke2ZpbGVNYXRjaGVzLmxlbmd0aH0gbWF0Y2goZXMpKTpgKTtcblx0XHRjb25zdCBzaG93biA9IHNlbGVjdE1hdGNoZXMoZmlsZU1hdGNoZXMpO1xuXHRcdGxldCBwcmV2aW91c0luZGV4OiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdFx0Zm9yIChjb25zdCB7IGl0ZW06IG0sIGluZGV4IH0gb2Ygc2hvd24pIHtcblx0XHRcdGlmIChwcmV2aW91c0luZGV4ICE9PSB1bmRlZmluZWQgJiYgaW5kZXggPiBwcmV2aW91c0luZGV4ICsgMSkge1xuXHRcdFx0XHRjb21wYWN0ZWQucHVzaChgICAuLi4gJHtpbmRleCAtIHByZXZpb3VzSW5kZXggLSAxfSBtb3JlIG1hdGNoKGVzKSBvbWl0dGVkIGluIHRoaXMgZmlsZWApO1xuXHRcdFx0fVxuXHRcdFx0Y29tcGFjdGVkLnB1c2goYCAgJHtmb3JtYXRHcmVwTWF0Y2gobSl9YCk7XG5cdFx0XHRwcmV2aW91c0luZGV4ID0gaW5kZXg7XG5cdFx0fVxuXHRcdGNvbnN0IG9taXR0ZWRBZnRlckxhc3QgPSBwcmV2aW91c0luZGV4ICE9PSB1bmRlZmluZWRcblx0XHRcdD8gc2F0dXJhdGluZ1N1YihmaWxlTWF0Y2hlcy5sZW5ndGgsIHByZXZpb3VzSW5kZXggKyAxKVxuXHRcdFx0OiBmaWxlTWF0Y2hlcy5sZW5ndGg7XG5cdFx0aWYgKG9taXR0ZWRBZnRlckxhc3QgPiAwKSB7XG5cdFx0XHRjb21wYWN0ZWQucHVzaChgICAuLi4gJHtvbWl0dGVkQWZ0ZXJMYXN0fSBtb3JlIG1hdGNoKGVzKSBvbWl0dGVkIGluIHRoaXMgZmlsZWApO1xuXHRcdH1cblx0fVxuXHRpZiAoc29ydGVkR3JvdXBzLmxlbmd0aCA+IG1heEdyb3Vwcykge1xuXHRcdGNvbnN0IG9taXR0ZWRNYXRjaGVzID0gdG90YWxHcm91cEl0ZW1zKHNvcnRlZEdyb3Vwcy5zbGljZShtYXhHcm91cHMpKTtcblx0XHRjb21wYWN0ZWQucHVzaCgnJyk7XG5cdFx0Y29tcGFjdGVkLnB1c2goYFtvbWl0dGVkICR7b21pdHRlZE1hdGNoZXN9IG1hdGNoKGVzKSBpbiAke3NvcnRlZEdyb3Vwcy5sZW5ndGggLSBtYXhHcm91cHN9IGZpbGUocyk7IHNlZSBvcmlnaW5hbCBvdXRwdXQgZm9yIGZ1bGwgcmVzdWx0c11gKTtcblx0fVxuXG5cdHJldHVybiBjb21wYWN0ZWQuam9pbignXFxuJyk7XG59XG5cbmludGVyZmFjZSBHcmVwQ29udGVudE1hdGNoIHtcblx0cGF0aDogc3RyaW5nO1xuXHRsaW5lTnVtYmVyOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHNlcGFyYXRvcjogc3RyaW5nO1xuXHR0ZXh0OiBzdHJpbmc7XG59XG5cbmZ1bmN0aW9uIHBhcnNlR3JlcENvbnRlbnRMaW5lKGxpbmU6IHN0cmluZyk6IEdyZXBDb250ZW50TWF0Y2ggfCB1bmRlZmluZWQge1xuXHRjb25zdCBudW1iZXJlZCA9IHBhcnNlTnVtYmVyZWRHcmVwQ29udGVudExpbmUobGluZSk7XG5cdGlmIChudW1iZXJlZCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0cmV0dXJuIG51bWJlcmVkO1xuXHR9XG5cblx0Y29uc3Qgc2VwYXJhdG9ySW5kZXggPSBsaW5lLmluZGV4T2YoJzonKTtcblx0aWYgKHNlcGFyYXRvckluZGV4IDwgMCkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0aWYgKHNlcGFyYXRvckluZGV4ID09PSAwIHx8IHNlcGFyYXRvckluZGV4ID09PSBsaW5lLmxlbmd0aCAtIDEpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGNvbnN0IHBhdGggPSBsaW5lLnNsaWNlKDAsIHNlcGFyYXRvckluZGV4KTtcblx0aWYgKCFsb29rc0xpa2VHcmVwUGF0aChwYXRoKSkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRyZXR1cm4ge1xuXHRcdHBhdGg6IG5vcm1hbGl6ZURpc3BsYXlQYXRoU2VwYXJhdG9ycyhwYXRoKSxcblx0XHRsaW5lTnVtYmVyOiB1bmRlZmluZWQsXG5cdFx0c2VwYXJhdG9yOiAnOicsXG5cdFx0dGV4dDogbGluZS5zbGljZShzZXBhcmF0b3JJbmRleCArIDEpLFxuXHR9O1xufVxuXG5mdW5jdGlvbiBwYXJzZU51bWJlcmVkR3JlcENvbnRlbnRMaW5lKGxpbmU6IHN0cmluZyk6IEdyZXBDb250ZW50TWF0Y2ggfCB1bmRlZmluZWQge1xuXHRjb25zdCBieXRlcyA9IG5ldyBUZXh0RW5jb2RlcigpLmVuY29kZShsaW5lKTtcblx0Y29uc3QgZGVjb2RlciA9IG5ldyBUZXh0RGVjb2RlcigpO1xuXHRjb25zdCBzbGljZVN0ciA9IChzdGFydDogbnVtYmVyLCBlbmQ6IG51bWJlcik6IHN0cmluZyA9PiBkZWNvZGVyLmRlY29kZShieXRlcy5zdWJhcnJheShzdGFydCwgZW5kKSk7XG5cdGNvbnN0IGlzQXNjaWlEaWdpdEJ5dGUgPSAoYnl0ZTogbnVtYmVyKTogYm9vbGVhbiA9PiBieXRlID49IDB4MzAgJiYgYnl0ZSA8PSAweDM5O1xuXHRjb25zdCBjb2xvbiA9IDB4M0E7XG5cdGNvbnN0IGRhc2ggPSAweDJEO1xuXHRjb25zdCB1cHBlckJvdW5kID0gc2F0dXJhdGluZ1N1YihieXRlcy5sZW5ndGgsIDIpO1xuXHRmb3IgKGxldCBpID0gMTsgaSA8IHVwcGVyQm91bmQ7IGkrKykge1xuXHRcdGNvbnN0IHBhdGhTZXBhcmF0b3IgPSBieXRlc1tpXTtcblx0XHRpZiAocGF0aFNlcGFyYXRvciAhPT0gY29sb24gJiYgcGF0aFNlcGFyYXRvciAhPT0gZGFzaCkge1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXHRcdGNvbnN0IG51bWJlclN0YXJ0ID0gaSArIDE7XG5cdFx0bGV0IG51bWJlckVuZCA9IG51bWJlclN0YXJ0O1xuXHRcdHdoaWxlIChudW1iZXJFbmQgPCBieXRlcy5sZW5ndGggJiYgaXNBc2NpaURpZ2l0Qnl0ZShieXRlc1tudW1iZXJFbmRdKSkge1xuXHRcdFx0bnVtYmVyRW5kICs9IDE7XG5cdFx0fVxuXHRcdGlmIChudW1iZXJFbmQgPT09IG51bWJlclN0YXJ0KSB7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cdFx0aWYgKG51bWJlckVuZCA+PSBieXRlcy5sZW5ndGgpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IHNlcGFyYXRvciA9IGJ5dGVzW251bWJlckVuZF07XG5cdFx0aWYgKHNlcGFyYXRvciAhPT0gY29sb24gJiYgc2VwYXJhdG9yICE9PSBkYXNoKSB7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cdFx0Y29uc3QgcGF0aCA9IHNsaWNlU3RyKDAsIGkpO1xuXHRcdGlmICghbG9va3NMaWtlR3JlcFBhdGgocGF0aCkpIHtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblx0XHRyZXR1cm4ge1xuXHRcdFx0cGF0aDogbm9ybWFsaXplRGlzcGxheVBhdGhTZXBhcmF0b3JzKHBhdGgpLFxuXHRcdFx0bGluZU51bWJlcjogc2xpY2VTdHIobnVtYmVyU3RhcnQsIG51bWJlckVuZCksXG5cdFx0XHRzZXBhcmF0b3I6IFN0cmluZy5mcm9tQ2hhckNvZGUoc2VwYXJhdG9yKSxcblx0XHRcdHRleHQ6IHNsaWNlU3RyKG51bWJlckVuZCArIDEsIGJ5dGVzLmxlbmd0aCksXG5cdFx0fTtcblx0fVxuXHRyZXR1cm4gdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiBsb29rc0xpa2VHcmVwUGF0aChwYXRoOiBzdHJpbmcpOiBib29sZWFuIHtcblx0cmV0dXJuIHBhdGguaW5jbHVkZXMoJy8nKSB8fCBwYXRoLmluY2x1ZGVzKCdcXFxcJykgfHwgcmVnZXhUZXN0KFN0cmluZy5yYXdgXFwuW0EtWmEtejAtOV8tXSskYCwgcGF0aCk7XG59XG5cbmZ1bmN0aW9uIHJlbmRlckJ1ZGdldGVkR3JlcENvbnRlbnRHcm91cHMoXG5cdHNvcnRlZEdyb3VwczogcmVhZG9ubHkgW3N0cmluZywgR3JlcENvbnRlbnRNYXRjaFtdXVtdLFxuXHRjb21tb25QcmVmaXg6IHN0cmluZyxcblx0bGFyZ2VPdXRwdXRUaHJlc2hvbGQ6IG51bWJlcixcbik6IHN0cmluZyB7XG5cdGNvbnN0IGJ1ZGdldCA9IGNvbXBhY3RlZEJvZHlCdWRnZXQobGFyZ2VPdXRwdXRUaHJlc2hvbGQpO1xuXHRsZXQgc21hbGxlc3QgPSByZW5kZXJCdWRnZXRlZEdyZXBDb250ZW50R3JvdXBzV2l0aExpbWl0KHNvcnRlZEdyb3VwcywgY29tbW9uUHJlZml4LCAxLCAxKTtcblx0Zm9yIChjb25zdCBtYXhHcm91cHMgb2YgWzEwLCA4LCA2LCA0LCAyLCAxXSkge1xuXHRcdGZvciAoY29uc3QgbWF4TWF0Y2hlc1Blckdyb3VwIG9mIFsxMiwgNiwgMywgMV0pIHtcblx0XHRcdGNvbnN0IGNhbmRpZGF0ZSA9IHJlbmRlckJ1ZGdldGVkR3JlcENvbnRlbnRHcm91cHNXaXRoTGltaXQoXG5cdFx0XHRcdHNvcnRlZEdyb3Vwcyxcblx0XHRcdFx0Y29tbW9uUHJlZml4LFxuXHRcdFx0XHRtYXhHcm91cHMsXG5cdFx0XHRcdG1heE1hdGNoZXNQZXJHcm91cCxcblx0XHRcdCk7XG5cdFx0XHRpZiAoZml0c0xhcmdlT3V0cHV0VGhyZXNob2xkKGNhbmRpZGF0ZSwgYnVkZ2V0KSkge1xuXHRcdFx0XHRyZXR1cm4gY2FuZGlkYXRlO1xuXHRcdFx0fVxuXHRcdFx0c21hbGxlc3QgPSBjYW5kaWRhdGU7XG5cdFx0fVxuXHR9XG5cdHJldHVybiBzbWFsbGVzdDtcbn1cblxuZnVuY3Rpb24gcmVuZGVyQnVkZ2V0ZWRHcmVwQ29udGVudEdyb3Vwc1dpdGhMaW1pdChcblx0c29ydGVkR3JvdXBzOiByZWFkb25seSBbc3RyaW5nLCBHcmVwQ29udGVudE1hdGNoW11dW10sXG5cdGNvbW1vblByZWZpeDogc3RyaW5nLFxuXHRtYXhHcm91cHM6IG51bWJlcixcblx0bWF4TWF0Y2hlc1Blckdyb3VwOiBudW1iZXIsXG4pOiBzdHJpbmcge1xuXHRjb25zdCB0b3RhbE1hdGNoZXMgPSB0b3RhbEdyb3VwSXRlbXMoc29ydGVkR3JvdXBzKTtcblx0Y29uc3QgY29tcGFjdGVkOiBzdHJpbmdbXSA9IFtdO1xuXHRjb21wYWN0ZWQucHVzaChgW2dyZXAgY29udGVudDogJHt0b3RhbE1hdGNoZXN9IG1hdGNoZXMgYWNyb3NzICR7c29ydGVkR3JvdXBzLmxlbmd0aH0gZmlsZShzKSR7Y29tbW9uUHJlZml4Lmxlbmd0aCA9PT0gMCA/ICcnIDogYCB1bmRlciAke3RydW5jYXRlUGF0aE1pZGRsZShjb21tb25QcmVmaXgsIENPTU1PTl9QUkVGSVhfRElTUExBWV9XSURUSCl9YH07IGNvbXBhY3Qgc3VtbWFyeV1gKTtcblx0Zm9yIChjb25zdCBbZmlsZVBhdGgsIGZpbGVNYXRjaGVzXSBvZiBzb3J0ZWRHcm91cHMuc2xpY2UoMCwgbWF4R3JvdXBzKSkge1xuXHRcdGNvbXBhY3RlZC5wdXNoKGZvcm1hdEJ1ZGdldGVkR3JlcEdyb3VwKGZpbGVQYXRoLCBmaWxlTWF0Y2hlcywgY29tbW9uUHJlZml4LCBtYXhNYXRjaGVzUGVyR3JvdXApKTtcblx0fVxuXHRpZiAoc29ydGVkR3JvdXBzLmxlbmd0aCA+IG1heEdyb3Vwcykge1xuXHRcdGNvbnN0IG9taXR0ZWRNYXRjaGVzID0gdG90YWxHcm91cEl0ZW1zKHNvcnRlZEdyb3Vwcy5zbGljZShtYXhHcm91cHMpKTtcblx0XHRjb21wYWN0ZWQucHVzaChgW29taXR0ZWQgJHtvbWl0dGVkTWF0Y2hlc30gbWF0Y2goZXMpIGluICR7c29ydGVkR3JvdXBzLmxlbmd0aCAtIG1heEdyb3Vwc30gZmlsZShzKV1gKTtcblx0fVxuXG5cdGNvbnN0IGV4dGVuc2lvblN1bW1hcnkgPSBzdW1tYXJpemVFeHRlbnNpb25zKHNvcnRlZEdyb3Vwcy5tYXAoKFtmaWxlUGF0aF0pID0+IGZpbGVQYXRoKSk7XG5cdGlmIChleHRlbnNpb25TdW1tYXJ5Lmxlbmd0aCAhPT0gMCkge1xuXHRcdGNvbXBhY3RlZC5wdXNoKGBbZXh0ZW5zaW9uczogJHt0cnVuY2F0ZUlubGluZVRleHQoZXh0ZW5zaW9uU3VtbWFyeSwgRVhURU5TSU9OX1NVTU1BUllfSU5MSU5FX1dJRFRIKX1dYCk7XG5cdH1cblxuXHRyZXR1cm4gY29tcGFjdGVkLmpvaW4oJ1xcbicpO1xufVxuXG5mdW5jdGlvbiBmb3JtYXRCdWRnZXRlZEdyZXBHcm91cChcblx0ZmlsZVBhdGg6IHN0cmluZyxcblx0ZmlsZU1hdGNoZXM6IHJlYWRvbmx5IEdyZXBDb250ZW50TWF0Y2hbXSxcblx0Y29tbW9uUHJlZml4OiBzdHJpbmcsXG5cdG1heE1hdGNoZXM6IG51bWJlcixcbik6IHN0cmluZyB7XG5cdGNvbnN0IGRpc3BsYXlQYXRoID0gdHJ1bmNhdGVQYXRoTWlkZGxlKGRpc3BsYXlQYXRoVW5kZXJQcmVmaXgoZmlsZVBhdGgsIGNvbW1vblByZWZpeCksIDE0MCk7XG5cdGNvbnN0IHNob3duID0gc2VsZWN0RXZlbmx5U3BhY2VkR3JlcE1hdGNoZXMoZmlsZU1hdGNoZXMsIG1heE1hdGNoZXMpO1xuXHRjb25zdCBsaW5lcyA9IFtgJHtkaXNwbGF5UGF0aH0gKCR7ZmlsZU1hdGNoZXMubGVuZ3RofSBtYXRjaChlcykpOmBdO1xuXHRmb3IgKGNvbnN0IHsgaXRlbTogbSB9IG9mIHNob3duKSB7XG5cdFx0bGluZXMucHVzaChgICAke2V4Y2VycHRJbmxpbmVUZXh0KGZvcm1hdEdyZXBNYXRjaChtKSwgMTgwKX1gKTtcblx0fVxuXHRpZiAoZmlsZU1hdGNoZXMubGVuZ3RoID4gc2hvd24ubGVuZ3RoKSB7XG5cdFx0bGluZXMucHVzaChgICAuLi4gJHtmaWxlTWF0Y2hlcy5sZW5ndGggLSBzaG93bi5sZW5ndGh9IG1vcmUgbWF0Y2goZXMpIG9taXR0ZWQgaW4gdGhpcyBmaWxlYCk7XG5cdH1cblx0cmV0dXJuIGxpbmVzLmpvaW4oJ1xcbicpO1xufVxuXG5mdW5jdGlvbiBzZWxlY3RFdmVubHlTcGFjZWRHcmVwTWF0Y2hlcyhcblx0bWF0Y2hlczogcmVhZG9ubHkgR3JlcENvbnRlbnRNYXRjaFtdLFxuXHRtYXhNYXRjaGVzOiBudW1iZXIsXG4pOiBJbmRleGVkPEdyZXBDb250ZW50TWF0Y2g+W10ge1xuXHRpZiAobWF0Y2hlcy5sZW5ndGggPD0gbWF4TWF0Y2hlcykge1xuXHRcdHJldHVybiBpbmRleEFsbChtYXRjaGVzKTtcblx0fVxuXHRpZiAobWF4TWF0Y2hlcyA8PSAxKSB7XG5cdFx0cmV0dXJuIFt7IGl0ZW06IG1hdGNoZXNbMF0sIGluZGV4OiAwIH1dO1xuXHR9XG5cdGNvbnN0IHNlbGVjdGVkOiBJbmRleGVkPEdyZXBDb250ZW50TWF0Y2g+W10gPSBbXTtcblx0Y29uc3Qgc2VlbjogbnVtYmVyW10gPSBbXTtcblx0Zm9yIChsZXQgaSA9IDA7IGkgPCBtYXhNYXRjaGVzOyBpKyspIHtcblx0XHRjb25zdCBpbmRleCA9IE1hdGgucm91bmQoKGkgKiAobWF0Y2hlcy5sZW5ndGggLSAxKSkgLyAobWF4TWF0Y2hlcyAtIDEpKTtcblx0XHRpZiAoIXNlZW4uaW5jbHVkZXMoaW5kZXgpKSB7XG5cdFx0XHRzZWVuLnB1c2goaW5kZXgpO1xuXHRcdFx0c2VsZWN0ZWQucHVzaCh7IGluZGV4LCBpdGVtOiBtYXRjaGVzW2luZGV4XSB9KTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIHNlbGVjdGVkO1xufVxuXG5mdW5jdGlvbiBmb3JtYXRHcmVwTWF0Y2gobTogR3JlcENvbnRlbnRNYXRjaCk6IHN0cmluZyB7XG5cdGlmIChtLmxpbmVOdW1iZXIgIT09IHVuZGVmaW5lZCkge1xuXHRcdHJldHVybiBgJHttLmxpbmVOdW1iZXJ9JHttLnNlcGFyYXRvcn0gJHttLnRleHR9YDtcblx0fVxuXHRyZXR1cm4gYCAke20udGV4dH1gO1xufVxuXG5mdW5jdGlvbiBjb21wYWN0R3JlcENvdW50T3V0cHV0KG91dHB1dDogc3RyaW5nKTogVG9vbENvbXBhY3Rpb25SZXN1bHQge1xuXHRjb25zdCBUT1BfQ09VTlRfUk9XUyA9IDIwO1xuXG5cdGNvbnN0IGxpbmVzID0gc3BsaXRUb29sT3V0cHV0TGluZXMob3V0cHV0KTtcblx0aWYgKHNob3VsZFNraXBUb29sT3V0cHV0Q29tcGFjdGlvbihsaW5lcywgb3V0cHV0LCAzMCkpIHtcblx0XHRyZXR1cm4gdW5jaGFuZ2VkKG91dHB1dCk7XG5cdH1cblxuXHRjb25zdCBwYXJzZWRDb3VudHM6IEdyZXBDb3VudE1hdGNoW10gPSBbXTtcblx0Zm9yIChjb25zdCBsaW5lIG9mIGxpbmVzKSB7XG5cdFx0Y29uc3QgcGFyc2VkID0gcGFyc2VHcmVwQ291bnRMaW5lKGxpbmUpO1xuXHRcdGlmIChwYXJzZWQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cGFyc2VkQ291bnRzLnB1c2gocGFyc2VkKTtcblx0XHR9XG5cdH1cblx0aWYgKHBhcnNlZENvdW50cy5sZW5ndGggPCAzMCB8fCAocGFyc2VkQ291bnRzLmxlbmd0aCAvIGxpbmVzLmxlbmd0aCkgPCAwLjgpIHtcblx0XHRyZXR1cm4gdW5jaGFuZ2VkKG91dHB1dCk7XG5cdH1cblxuXHRsZXQgdG90YWxNYXRjaGVzID0gMDtcblx0Zm9yIChjb25zdCBtIG9mIHBhcnNlZENvdW50cykge1xuXHRcdHRvdGFsTWF0Y2hlcyArPSBtLmNvdW50O1xuXHR9XG5cdGNvbnN0IHNvcnRlZENvdW50cyA9IFsuLi5wYXJzZWRDb3VudHNdO1xuXHRzb3J0ZWRDb3VudHMuc29ydCgoYSwgYikgPT4gKGIuY291bnQgLSBhLmNvdW50KSB8fCBjb21wYXJlU3RyaW5ncyhhLnBhdGgsIGIucGF0aCkpO1xuXHRjb25zdCBjb21wYWN0ZWQ6IHN0cmluZ1tdID0gW2BbZ3JlcCBjb3VudDogJHt0b3RhbE1hdGNoZXN9IG1hdGNoKGVzKSBhY3Jvc3MgJHtwYXJzZWRDb3VudHMubGVuZ3RofSBmaWxlKHMpIHdpdGggbWF0Y2hlc11gXTtcblxuXHRjb21wYWN0ZWQucHVzaCgnJyk7XG5cdGNvbXBhY3RlZC5wdXNoKCdUb3AgZmlsZXMgYnkgbWF0Y2ggY291bnQ6Jyk7XG5cdGZvciAoY29uc3QgbSBvZiBzb3J0ZWRDb3VudHMuc2xpY2UoMCwgVE9QX0NPVU5UX1JPV1MpKSB7XG5cdFx0Y29tcGFjdGVkLnB1c2goYCAgJHtTdHJpbmcobS5jb3VudCkucGFkU3RhcnQoNil9ICAke20ucGF0aH1gKTtcblx0fVxuXHRpZiAoc29ydGVkQ291bnRzLmxlbmd0aCA+IFRPUF9DT1VOVF9ST1dTKSB7XG5cdFx0Y29tcGFjdGVkLnB1c2goYCAgLi4uICR7c29ydGVkQ291bnRzLmxlbmd0aCAtIFRPUF9DT1VOVF9ST1dTfSBtb3JlIGZpbGUocykgb21pdHRlZGApO1xuXHR9XG5cblx0Y29uc3QgZGlyZWN0b3J5Q291bnRzID0gc3VtbWFyaXplQ291bnREaXJlY3RvcmllcyhwYXJzZWRDb3VudHMpO1xuXHRpZiAoZGlyZWN0b3J5Q291bnRzLmxlbmd0aCAhPT0gMCkge1xuXHRcdGNvbXBhY3RlZC5wdXNoKCcnKTtcblx0XHRjb21wYWN0ZWQucHVzaCgnVG9wIGRpcmVjdG9yaWVzIGJ5IG1hdGNoIGNvdW50OicpO1xuXHRcdGZvciAoY29uc3Qgc3VtbWFyeSBvZiBkaXJlY3RvcnlDb3VudHMuc2xpY2UoMCwgVE9QX0NPVU5UX1JPV1MpKSB7XG5cdFx0XHRjb21wYWN0ZWQucHVzaChgICAke1N0cmluZyhzdW1tYXJ5LmNvdW50KS5wYWRTdGFydCg2KX0gaW4gJHtzdW1tYXJ5LmZpbGVzfSBmaWxlKHMpICAke3N1bW1hcnkuZGlyZWN0b3J5fWApO1xuXHRcdH1cblx0XHRpZiAoZGlyZWN0b3J5Q291bnRzLmxlbmd0aCA+IFRPUF9DT1VOVF9ST1dTKSB7XG5cdFx0XHRjb25zdCBvbWl0dGVkRGlyZWN0b3JpZXMgPSBkaXJlY3RvcnlDb3VudHMubGVuZ3RoIC0gVE9QX0NPVU5UX1JPV1M7XG5cdFx0XHRjb21wYWN0ZWQucHVzaChgICAuLi4gJHtvbWl0dGVkRGlyZWN0b3JpZXN9IG1vcmUgZGlyZWN0b3Ike29taXR0ZWREaXJlY3RvcmllcyA9PT0gMSA/ICd5JyA6ICdpZXMnfSBvbWl0dGVkYCk7XG5cdFx0fVxuXHR9XG5cblx0Y29uc3QgZXh0ZW5zaW9uU3VtbWFyeSA9IHN1bW1hcml6ZUV4dGVuc2lvbnMocGFyc2VkQ291bnRzLm1hcChtID0+IG0ucGF0aCkpO1xuXHRpZiAoZXh0ZW5zaW9uU3VtbWFyeS5sZW5ndGggIT09IDApIHtcblx0XHRjb21wYWN0ZWQucHVzaCgnJyk7XG5cdFx0Y29tcGFjdGVkLnB1c2goYFtleHRlbnNpb25zOiAke2V4dGVuc2lvblN1bW1hcnl9XWApO1xuXHR9XG5cblx0cmV0dXJuIGxvc3N5KGNvbXBhY3RlZC5qb2luKCdcXG4nKSk7XG59XG5cbmludGVyZmFjZSBHcmVwQ291bnRNYXRjaCB7XG5cdHBhdGg6IHN0cmluZztcblx0Y291bnQ6IG51bWJlcjtcbn1cblxuZnVuY3Rpb24gcGFyc2VHcmVwQ291bnRMaW5lKGxpbmU6IHN0cmluZyk6IEdyZXBDb3VudE1hdGNoIHwgdW5kZWZpbmVkIHtcblx0Y29uc3Qgc3BsaXQgPSByc3BsaXRPbmNlKGxpbmUsICc6Jyk7XG5cdGlmIChzcGxpdCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRjb25zdCBbcGF0aCwgY291bnRdID0gc3BsaXQ7XG5cdGlmIChwYXRoLmxlbmd0aCA9PT0gMCkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0Y29uc3QgcGFyc2VkID0gcGFyc2VVc2l6ZShjb3VudCk7XG5cdGlmIChwYXJzZWQgPT09IHVuZGVmaW5lZCkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0cmV0dXJuIHsgcGF0aCwgY291bnQ6IHBhcnNlZCB9O1xufVxuXG5pbnRlcmZhY2UgRGlyZWN0b3J5Q291bnQge1xuXHRkaXJlY3Rvcnk6IHN0cmluZztcblx0Y291bnQ6IG51bWJlcjtcblx0ZmlsZXM6IG51bWJlcjtcbn1cblxuZnVuY3Rpb24gc3VtbWFyaXplQ291bnREaXJlY3Rvcmllcyhjb3VudHM6IHJlYWRvbmx5IEdyZXBDb3VudE1hdGNoW10pOiBEaXJlY3RvcnlDb3VudFtdIHtcblx0Y29uc3QgZGlyZWN0b3JpZXMgPSBuZXcgTWFwPHN0cmluZywgRGlyZWN0b3J5Q291bnQ+KCk7XG5cdGZvciAoY29uc3QgbSBvZiBjb3VudHMpIHtcblx0XHRjb25zdCBkaXJlY3RvcnkgPSBkaXJlY3RvcnlPZlBhdGgobS5wYXRoKTtcblx0XHRsZXQgZW50cnkgPSBkaXJlY3Rvcmllcy5nZXQoZGlyZWN0b3J5KTtcblx0XHRpZiAoZW50cnkgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0ZW50cnkgPSB7IGRpcmVjdG9yeSwgY291bnQ6IDAsIGZpbGVzOiAwIH07XG5cdFx0XHRkaXJlY3Rvcmllcy5zZXQoZGlyZWN0b3J5LCBlbnRyeSk7XG5cdFx0fVxuXHRcdGVudHJ5LmNvdW50ICs9IG0uY291bnQ7XG5cdFx0ZW50cnkuZmlsZXMgKz0gMTtcblx0fVxuXHRjb25zdCB2YWx1ZXMgPSBbLi4uZGlyZWN0b3JpZXMudmFsdWVzKCldO1xuXHR2YWx1ZXMuc29ydCgoYSwgYikgPT4gKGIuY291bnQgLSBhLmNvdW50KSB8fCAoYi5maWxlcyAtIGEuZmlsZXMpIHx8IGNvbXBhcmVTdHJpbmdzKGEuZGlyZWN0b3J5LCBiLmRpcmVjdG9yeSkpO1xuXHRyZXR1cm4gdmFsdWVzO1xufVxuXG5mdW5jdGlvbiBjb21wYWN0UGF0aExpc3RPdXRwdXQoXG5cdG91dHB1dDogc3RyaW5nLFxuXHRsYWJlbDogc3RyaW5nLFxuXHRsYXJnZU91dHB1dFRocmVzaG9sZDogbnVtYmVyLFxuKTogVG9vbENvbXBhY3Rpb25SZXN1bHQge1xuXHRjb25zdCBwYXRocyA9IHNwbGl0VG9vbE91dHB1dExpbmVzKG91dHB1dCkubWFwKGxpbmUgPT4gbm9ybWFsaXplRGlzcGxheVBhdGhTZXBhcmF0b3JzKGxpbmUpKTtcblx0aWYgKHNob3VsZFNraXBUb29sT3V0cHV0Q29tcGFjdGlvbihwYXRocywgb3V0cHV0LCAyNSkpIHtcblx0XHRyZXR1cm4gdW5jaGFuZ2VkKG91dHB1dCk7XG5cdH1cblxuXHRjb25zdCBjb21tb25QcmVmaXggPSBjb21tb25EaXJlY3RvcnlQcmVmaXgocGF0aHMpO1xuXHRjb25zdCBncm91cHMgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nW10+KCk7XG5cdGZvciAoY29uc3QgZmlsZVBhdGggb2YgcGF0aHMpIHtcblx0XHRjb25zdCBncm91cFBhdGggPSBwYXRoTGlzdEdyb3VwUGF0aChmaWxlUGF0aCwgY29tbW9uUHJlZml4KTtcblx0XHRjb25zdCBsaXN0ID0gZ3JvdXBzLmdldChncm91cFBhdGgpO1xuXHRcdGlmIChsaXN0ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdGxpc3QucHVzaChmaWxlUGF0aCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGdyb3Vwcy5zZXQoZ3JvdXBQYXRoLCBbZmlsZVBhdGhdKTtcblx0XHR9XG5cdH1cblxuXHRjb25zdCBzb3J0ZWRHcm91cHMgPSBbLi4uZ3JvdXBzLmVudHJpZXMoKV07XG5cdHNvcnRlZEdyb3Vwcy5zb3J0KChhLCBiKSA9PiAoYlsxXS5sZW5ndGggLSBhWzFdLmxlbmd0aCkgfHwgY29tcGFyZVN0cmluZ3MoYVswXSwgYlswXSkpO1xuXHRjb25zdCBib2R5QnVkZ2V0ID0gY29tcGFjdGVkQm9keUJ1ZGdldChsYXJnZU91dHB1dFRocmVzaG9sZCk7XG5cdGNvbnN0IHByaW1hcnkgPSByZW5kZXJQYXRoTGlzdEdyb3Vwcyhcblx0XHRwYXRocyxcblx0XHRsYWJlbCxcblx0XHRjb21tb25QcmVmaXgsXG5cdFx0c29ydGVkR3JvdXBzLFxuXHRcdHNvcnRlZEdyb3Vwcy5sZW5ndGgsXG5cdFx0ZmFsc2UsXG5cdCk7XG5cdGlmIChieXRlTGVuZ3RoKHByaW1hcnkpID49IGJ5dGVMZW5ndGgob3V0cHV0KSAmJiBmaXRzTGFyZ2VPdXRwdXRUaHJlc2hvbGQob3V0cHV0LCBsYXJnZU91dHB1dFRocmVzaG9sZCkpIHtcblx0XHRyZXR1cm4gdW5jaGFuZ2VkKG91dHB1dCk7XG5cdH1cblx0aWYgKGZpdHNMYXJnZU91dHB1dFRocmVzaG9sZChwcmltYXJ5LCBib2R5QnVkZ2V0KSkge1xuXHRcdHJldHVybiB7IG91dHB1dDogcHJpbWFyeSwgbG9zc2xlc3M6IHRydWUgfTtcblx0fVxuXG5cdHJldHVybiBsb3NzeShyZW5kZXJCdWRnZXRlZEZsYXRQYXRoTGlzdChcblx0XHRwYXRocyxcblx0XHRsYWJlbCxcblx0XHRjb21tb25QcmVmaXgsXG5cdFx0bGFyZ2VPdXRwdXRUaHJlc2hvbGQsXG5cdCkpO1xufVxuXG5mdW5jdGlvbiByZW5kZXJQYXRoTGlzdEdyb3Vwcyhcblx0cGF0aHM6IHJlYWRvbmx5IHN0cmluZ1tdLFxuXHRsYWJlbDogc3RyaW5nLFxuXHRjb21tb25QcmVmaXg6IHN0cmluZyxcblx0c29ydGVkR3JvdXBzOiByZWFkb25seSBbc3RyaW5nLCBzdHJpbmdbXV1bXSxcblx0bWF4R3JvdXBzOiBudW1iZXIsXG5cdGNvbXBhY3RTZWxlY3Rpb246IGJvb2xlYW4sXG4pOiBzdHJpbmcge1xuXHRjb25zdCBjb21wYWN0ZWQ6IHN0cmluZ1tdID0gW2BbJHtsYWJlbH06ICR7cGF0aHMubGVuZ3RofSBwYXRoKHMpJHtjb21tb25QcmVmaXgubGVuZ3RoID09PSAwID8gJycgOiBgIHVuZGVyICR7Y29tbW9uUHJlZml4fWB9OyBncm91cGVkIGJ5IGRpcmVjdG9yeV1gXTtcblx0Zm9yIChjb25zdCBbZ3JvdXBQYXRoLCBncm91cFBhdGhzXSBvZiBzb3J0ZWRHcm91cHMuc2xpY2UoMCwgbWF4R3JvdXBzKSkge1xuXHRcdGNvbnN0IHNvcnRlZEdyb3VwUGF0aHMgPSBbLi4uZ3JvdXBQYXRoc107XG5cdFx0c29ydGVkR3JvdXBQYXRocy5zb3J0KChhLCBiKSA9PiBuYXR1cmFsQ21wKGEsIGIpKTtcblx0XHRjb21wYWN0ZWQucHVzaCgnJyk7XG5cdFx0Y29tcGFjdGVkLnB1c2goYCR7Z3JvdXBQYXRofS8gKCR7Z3JvdXBQYXRocy5sZW5ndGh9IHBhdGgocykpYCk7XG5cdFx0Y29uc3Qgc2hvd24gPSBjb21wYWN0U2VsZWN0aW9uID8gc2VsZWN0SGVhZFRhaWxUb1Nob3coc29ydGVkR3JvdXBQYXRocykgOiBpbmRleEFsbChzb3J0ZWRHcm91cFBhdGhzKTtcblx0XHRsZXQgcHJldmlvdXNJbmRleDogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRcdGZvciAoY29uc3QgeyBpdGVtOiBmaWxlUGF0aCwgaW5kZXggfSBvZiBzaG93bikge1xuXHRcdFx0aWYgKHByZXZpb3VzSW5kZXggIT09IHVuZGVmaW5lZCAmJiBpbmRleCA+IHByZXZpb3VzSW5kZXggKyAxKSB7XG5cdFx0XHRcdGNvbXBhY3RlZC5wdXNoKGAgIC4uLiAke2luZGV4IC0gcHJldmlvdXNJbmRleCAtIDF9IG1vcmUgcGF0aChzKSBpbiB0aGlzIGdyb3VwYCk7XG5cdFx0XHR9XG5cdFx0XHRjb21wYWN0ZWQucHVzaChgICAke2Rpc3BsYXlQYXRoSW5QYXRoTGlzdEdyb3VwKGZpbGVQYXRoLCBncm91cFBhdGgpfWApO1xuXHRcdFx0cHJldmlvdXNJbmRleCA9IGluZGV4O1xuXHRcdH1cblx0XHRjb25zdCBvbWl0dGVkQWZ0ZXJMYXN0ID0gcHJldmlvdXNJbmRleCAhPT0gdW5kZWZpbmVkXG5cdFx0XHQ/IHNhdHVyYXRpbmdTdWIoZ3JvdXBQYXRocy5sZW5ndGgsIHByZXZpb3VzSW5kZXggKyAxKVxuXHRcdFx0OiBncm91cFBhdGhzLmxlbmd0aDtcblx0XHRpZiAob21pdHRlZEFmdGVyTGFzdCA+IDApIHtcblx0XHRcdGNvbXBhY3RlZC5wdXNoKGAgIC4uLiAke29taXR0ZWRBZnRlckxhc3R9IG1vcmUgcGF0aChzKSBpbiB0aGlzIGdyb3VwYCk7XG5cdFx0fVxuXHR9XG5cdGlmIChzb3J0ZWRHcm91cHMubGVuZ3RoID4gbWF4R3JvdXBzKSB7XG5cdFx0Y29uc3Qgb21pdHRlZFBhdGhzID0gdG90YWxHcm91cEl0ZW1zKHNvcnRlZEdyb3Vwcy5zbGljZShtYXhHcm91cHMpKTtcblx0XHRjb21wYWN0ZWQucHVzaCgnJyk7XG5cdFx0Y29tcGFjdGVkLnB1c2goYFtvbWl0dGVkICR7b21pdHRlZFBhdGhzfSBwYXRoKHMpIGluICR7c29ydGVkR3JvdXBzLmxlbmd0aCAtIG1heEdyb3Vwc30gc21hbGxlciBncm91cChzKV1gKTtcblx0fVxuXG5cdGNvbnN0IGV4dGVuc2lvblN1bW1hcnkgPSBzdW1tYXJpemVFeHRlbnNpb25zKHBhdGhzKTtcblx0aWYgKGV4dGVuc2lvblN1bW1hcnkubGVuZ3RoICE9PSAwKSB7XG5cdFx0Y29tcGFjdGVkLnB1c2goJycpO1xuXHRcdGNvbXBhY3RlZC5wdXNoKGBbZXh0ZW5zaW9uczogJHtleHRlbnNpb25TdW1tYXJ5fV1gKTtcblx0fVxuXG5cdHJldHVybiBjb21wYWN0ZWQuam9pbignXFxuJyk7XG59XG5cbmZ1bmN0aW9uIHNlbGVjdEhlYWRUYWlsVG9TaG93PFQ+KGl0ZW1zOiByZWFkb25seSBUW10pOiBJbmRleGVkPFQ+W10ge1xuXHRpZiAoaXRlbXMubGVuZ3RoIDw9IDQwKSB7XG5cdFx0cmV0dXJuIGluZGV4QWxsKGl0ZW1zKTtcblx0fVxuXHRjb25zdCBpbmRleGVzOiBudW1iZXJbXSA9IFtdO1xuXHRmb3IgKGxldCBpID0gMDsgaSA8IDEyOyBpKyspIHtcblx0XHRpbmRleGVzLnB1c2goaSk7XG5cdH1cblx0Zm9yIChsZXQgaSA9IGl0ZW1zLmxlbmd0aCAtIDEyOyBpIDwgaXRlbXMubGVuZ3RoOyBpKyspIHtcblx0XHRpbmRleGVzLnB1c2goaSk7XG5cdH1cblx0cmV0dXJuIGluZGV4ZXMubWFwKGluZGV4ID0+ICh7IGluZGV4LCBpdGVtOiBpdGVtc1tpbmRleF0gfSkpO1xufVxuXG5mdW5jdGlvbiByZW5kZXJCdWRnZXRlZEZsYXRQYXRoTGlzdChcblx0cGF0aHM6IHJlYWRvbmx5IHN0cmluZ1tdLFxuXHRsYWJlbDogc3RyaW5nLFxuXHRjb21tb25QcmVmaXg6IHN0cmluZyxcblx0bGFyZ2VPdXRwdXRUaHJlc2hvbGQ6IG51bWJlcixcbik6IHN0cmluZyB7XG5cdGNvbnN0IHNvcnRlZFBhdGhzID0gc29ydFBhdGhzRm9yQ29uY3JldGVQcmV2aWV3KHBhdGhzKTtcblx0Y29uc3QgZXh0ZW5zaW9uU3VtbWFyeSA9IHN1bW1hcml6ZUV4dGVuc2lvbnMocGF0aHMpO1xuXHRjb25zdCBidWRnZXQgPSBjb21wYWN0ZWRCb2R5QnVkZ2V0KGxhcmdlT3V0cHV0VGhyZXNob2xkKTtcblx0Y29uc3Qgc2VsZWN0ZWQ6IHN0cmluZ1tdID0gW107XG5cdGNvbnN0IGxpbmVzID0gW2BbJHtsYWJlbH06ICR7cGF0aHMubGVuZ3RofSBwYXRoKHMpJHtjb21tb25QcmVmaXgubGVuZ3RoID09PSAwID8gJycgOiBgIHVuZGVyICR7dHJ1bmNhdGVQYXRoTWlkZGxlKGNvbW1vblByZWZpeCwgQ09NTU9OX1BSRUZJWF9ESVNQTEFZX1dJRFRIKX1gfTsgY29uY3JldGUgcGF0aHNdYF07XG5cdGxldCBzZWxlY3RlZEJ5dGVzID0gam9pbmVkTGluZUJ5dGVzKGxpbmVzKTtcblxuXHRmb3IgKGNvbnN0IGZpbGVQYXRoIG9mIHNvcnRlZFBhdGhzKSB7XG5cdFx0bGV0IGRpc3BsYXlQYXRoID0gZGlzcGxheVBhdGhVbmRlclByZWZpeChmaWxlUGF0aCwgY29tbW9uUHJlZml4KTtcblx0XHRjb25zdCBzdWZmaXhMaW5lcyA9IHBhdGhMaXN0U3VmZml4TGluZXMoc2VsZWN0ZWQubGVuZ3RoICsgMSwgcGF0aHMubGVuZ3RoLCBleHRlbnNpb25TdW1tYXJ5KTtcblx0XHRjb25zdCBzdWZmaXhCeXRlcyA9IGpvaW5lZExpbmVCeXRlcyhzdWZmaXhMaW5lcyk7XG5cdFx0Y29uc3Qgc2VwYXJhdG9yQnl0ZXMgPSAoc3VmZml4Qnl0ZXMgPiAwIHx8IGxpbmVzLmxlbmd0aCAhPT0gMCkgPyAxIDogMDtcblx0XHRjb25zdCBuZXh0Qnl0ZXMgPSBzZWxlY3RlZEJ5dGVzICsgMSArIGJ5dGVMZW5ndGgoZGlzcGxheVBhdGgpO1xuXHRcdGlmIChuZXh0Qnl0ZXMgKyBzZXBhcmF0b3JCeXRlcyArIHN1ZmZpeEJ5dGVzID4gYnVkZ2V0KSB7XG5cdFx0XHRpZiAoc2VsZWN0ZWQubGVuZ3RoICE9PSAwKSB7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHNlbGVjdGVkQnl0ZXMgPiBidWRnZXQpIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRsZXQgYXZhaWxhYmxlID0gYnVkZ2V0IC0gc2VsZWN0ZWRCeXRlcztcblx0XHRcdGlmIChzZXBhcmF0b3JCeXRlcyA+IGF2YWlsYWJsZSkge1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGF2YWlsYWJsZSAtPSBzZXBhcmF0b3JCeXRlcztcblx0XHRcdGlmIChzdWZmaXhCeXRlcyA+IGF2YWlsYWJsZSkge1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGF2YWlsYWJsZSAtPSBzdWZmaXhCeXRlcztcblx0XHRcdGlmIChhdmFpbGFibGUgPT09IDApIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRkaXNwbGF5UGF0aCA9IHRydW5jYXRlUGF0aE1pZGRsZShkaXNwbGF5UGF0aCwgYXZhaWxhYmxlKTtcblx0XHRcdGlmIChzZWxlY3RlZEJ5dGVzICsgMSArIGJ5dGVMZW5ndGgoZGlzcGxheVBhdGgpICsgc2VwYXJhdG9yQnl0ZXMgKyBzdWZmaXhCeXRlcyA+IGJ1ZGdldCkge1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cdFx0c2VsZWN0ZWRCeXRlcyArPSAxICsgYnl0ZUxlbmd0aChkaXNwbGF5UGF0aCk7XG5cdFx0c2VsZWN0ZWQucHVzaChkaXNwbGF5UGF0aCk7XG5cdH1cblxuXHRsaW5lcy5wdXNoKC4uLnNlbGVjdGVkKTtcblx0bGluZXMucHVzaCguLi5wYXRoTGlzdFN1ZmZpeExpbmVzKHNlbGVjdGVkLmxlbmd0aCwgcGF0aHMubGVuZ3RoLCBleHRlbnNpb25TdW1tYXJ5KSk7XG5cdHJldHVybiBsaW5lcy5qb2luKCdcXG4nKTtcbn1cblxuZnVuY3Rpb24gcGF0aExpc3RTdWZmaXhMaW5lcyhcblx0c2VsZWN0ZWRDb3VudDogbnVtYmVyLFxuXHRwYXRoQ291bnQ6IG51bWJlcixcblx0ZXh0ZW5zaW9uU3VtbWFyeTogc3RyaW5nLFxuKTogc3RyaW5nW10ge1xuXHRjb25zdCBsaW5lczogc3RyaW5nW10gPSBbXTtcblx0aWYgKHNlbGVjdGVkQ291bnQgPCBwYXRoQ291bnQpIHtcblx0XHRsaW5lcy5wdXNoKGBbb21pdHRlZCAke3BhdGhDb3VudCAtIHNlbGVjdGVkQ291bnR9IHBhdGgocyk7IHNlZSBvcmlnaW5hbCBvdXRwdXQgZm9yIGZ1bGwgcmVzdWx0c11gKTtcblx0fVxuXHRpZiAoZXh0ZW5zaW9uU3VtbWFyeS5sZW5ndGggIT09IDApIHtcblx0XHRsaW5lcy5wdXNoKGBbZXh0ZW5zaW9uczogJHt0cnVuY2F0ZUlubGluZVRleHQoZXh0ZW5zaW9uU3VtbWFyeSwgRVhURU5TSU9OX1NVTU1BUllfSU5MSU5FX1dJRFRIKX1dYCk7XG5cdH1cblx0cmV0dXJuIGxpbmVzO1xufVxuXG5mdW5jdGlvbiBzb3J0UGF0aHNGb3JDb25jcmV0ZVByZXZpZXcocGF0aHM6IHJlYWRvbmx5IHN0cmluZ1tdKTogc3RyaW5nW10ge1xuXHRjb25zdCBleHRlbnNpb25Db3VudHMgPSBuZXcgTWFwPHN0cmluZywgbnVtYmVyPigpO1xuXHRmb3IgKGNvbnN0IGZpbGVQYXRoIG9mIHBhdGhzKSB7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uID0gcGF0aEV4dGVuc2lvbihmaWxlUGF0aCk7XG5cdFx0ZXh0ZW5zaW9uQ291bnRzLnNldChleHRlbnNpb24sIChleHRlbnNpb25Db3VudHMuZ2V0KGV4dGVuc2lvbikgPz8gMCkgKyAxKTtcblx0fVxuXHRjb25zdCBzb3J0ZWQgPSBbLi4ucGF0aHNdO1xuXHRzb3J0ZWQuc29ydCgoYSwgYikgPT4ge1xuXHRcdGNvbnN0IGNvdW50QSA9IGV4dGVuc2lvbkNvdW50cy5nZXQocGF0aEV4dGVuc2lvbihhKSkgPz8gMDtcblx0XHRjb25zdCBjb3VudEIgPSBleHRlbnNpb25Db3VudHMuZ2V0KHBhdGhFeHRlbnNpb24oYikpID8/IDA7XG5cdFx0cmV0dXJuIChjb3VudEEgLSBjb3VudEIpIHx8IG5hdHVyYWxDbXAoYSwgYik7XG5cdH0pO1xuXHRyZXR1cm4gc29ydGVkO1xufVxuXG5mdW5jdGlvbiBkaXNwbGF5UGF0aEluUGF0aExpc3RHcm91cChmaWxlUGF0aDogc3RyaW5nLCBncm91cFBhdGg6IHN0cmluZyk6IHN0cmluZyB7XG5cdGlmIChncm91cFBhdGggPT09ICcuJykge1xuXHRcdHJldHVybiBmaWxlUGF0aDtcblx0fVxuXHRjb25zdCBwcmVmaXggPSBncm91cFBhdGguZW5kc1dpdGgoJy8nKSA/IGdyb3VwUGF0aCA6IGAke2dyb3VwUGF0aH0vYDtcblx0cmV0dXJuIHN0cmlwUHJlZml4KGZpbGVQYXRoLCBwcmVmaXgpID8/IGZpbGVQYXRoO1xufVxuXG5mdW5jdGlvbiBwYXRoTGlzdEdyb3VwUGF0aChmaWxlUGF0aDogc3RyaW5nLCBjb21tb25QcmVmaXg6IHN0cmluZyk6IHN0cmluZyB7XG5cdGNvbnN0IHJlbGF0aXZlID0gY29tbW9uUHJlZml4Lmxlbmd0aCA9PT0gMFxuXHRcdD8gZmlsZVBhdGhcblx0XHQ6IHRyaW1TdGFydE1hdGNoZXNDaGFycyhmaWxlUGF0aC5zbGljZShjb21tb25QcmVmaXgubGVuZ3RoKSwgWycvJ10pO1xuXHRpZiAocmVsYXRpdmUubGVuZ3RoID09PSAwIHx8ICFyZWxhdGl2ZS5pbmNsdWRlcygnLycpKSB7XG5cdFx0cmV0dXJuIGpvaW5EaXNwbGF5UGF0aChjb21tb25QcmVmaXgsICcuJyk7XG5cdH1cblx0Y29uc3Qgc2VnbWVudHMgPSB0cmltU3RhcnRNYXRjaGVzQ2hhcnMocmVsYXRpdmUsIFsnLyddKS5zcGxpdCgnLycpO1xuXHRjb25zdCBmaXJzdFNlZ21lbnQgPSBzZWdtZW50cy5sZW5ndGggPiAwID8gc2VnbWVudHNbMF0gOiAnJztcblx0Y29uc3Qgc2VnbWVudCA9IGZpcnN0U2VnbWVudC5sZW5ndGggPT09IDAgPyAnLicgOiBmaXJzdFNlZ21lbnQ7XG5cdHJldHVybiBqb2luRGlzcGxheVBhdGgoY29tbW9uUHJlZml4LCBzZWdtZW50KTtcbn1cblxuZnVuY3Rpb24gY29tbW9uRGlyZWN0b3J5UHJlZml4KHBhdGhzOiByZWFkb25seSBzdHJpbmdbXSk6IHN0cmluZyB7XG5cdGlmIChwYXRocy5sZW5ndGggPT09IDApIHtcblx0XHRyZXR1cm4gJyc7XG5cdH1cblx0Y29uc3QgZGlyZWN0b3JpZXMgPSBwYXRocy5tYXAoZmlsZVBhdGggPT4ge1xuXHRcdGNvbnN0IGluZGV4ID0gZmlsZVBhdGgubGFzdEluZGV4T2YoJy8nKTtcblx0XHRyZXR1cm4gaW5kZXggPiAwID8gZmlsZVBhdGguc2xpY2UoMCwgaW5kZXgpIDogJyc7XG5cdH0pO1xuXHRjb25zdCBmaXJzdFBhcnRzID0gZGlyZWN0b3JpZXNbMF0uc3BsaXQoJy8nKTtcblx0bGV0IHByZWZpeExlbmd0aCA9IGZpcnN0UGFydHMubGVuZ3RoO1xuXHRmb3IgKGNvbnN0IGRpcmVjdG9yeSBvZiBkaXJlY3Rvcmllcy5zbGljZSgxKSkge1xuXHRcdGNvbnN0IHBhcnRzID0gZGlyZWN0b3J5LnNwbGl0KCcvJyk7XG5cdFx0bGV0IGkgPSAwO1xuXHRcdHdoaWxlIChpIDwgcHJlZml4TGVuZ3RoICYmIGkgPCBwYXJ0cy5sZW5ndGggJiYgZmlyc3RQYXJ0c1tpXSA9PT0gcGFydHNbaV0pIHtcblx0XHRcdGkgKz0gMTtcblx0XHR9XG5cdFx0cHJlZml4TGVuZ3RoID0gaTtcblx0fVxuXHRyZXR1cm4gZmlyc3RQYXJ0cy5zbGljZSgwLCBwcmVmaXhMZW5ndGgpLmpvaW4oJy8nKTtcbn1cblxuZnVuY3Rpb24gZGlyZWN0b3J5T2ZQYXRoKGZpbGVQYXRoOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRjb25zdCBub3JtYWxpemVkID0gbm9ybWFsaXplRGlzcGxheVBhdGhTZXBhcmF0b3JzKGZpbGVQYXRoKTtcblx0Y29uc3QgaW5kZXggPSBub3JtYWxpemVkLmxhc3RJbmRleE9mKCcvJyk7XG5cdHJldHVybiBpbmRleCA+IDAgPyBub3JtYWxpemVkLnNsaWNlKDAsIGluZGV4KSA6ICcuJztcbn1cblxuZnVuY3Rpb24gc3BsaXRUb29sT3V0cHV0TGluZXMob3V0cHV0OiBzdHJpbmcpOiBzdHJpbmdbXSB7XG5cdGlmIChvdXRwdXQubGVuZ3RoID09PSAwKSB7XG5cdFx0cmV0dXJuIFtdO1xuXHR9XG5cdGNvbnN0IHBpZWNlczogc3RyaW5nW10gPSBbXTtcblx0bGV0IHN0YXJ0ID0gMDtcblx0Zm9yIChsZXQgaSA9IDA7IGkgPCBvdXRwdXQubGVuZ3RoOyBpKyspIHtcblx0XHRpZiAob3V0cHV0W2ldID09PSAnXFxuJykge1xuXHRcdFx0cGllY2VzLnB1c2gob3V0cHV0LnNsaWNlKHN0YXJ0LCBpICsgMSkpO1xuXHRcdFx0c3RhcnQgPSBpICsgMTtcblx0XHR9XG5cdH1cblx0aWYgKHN0YXJ0IDwgb3V0cHV0Lmxlbmd0aCkge1xuXHRcdHBpZWNlcy5wdXNoKG91dHB1dC5zbGljZShzdGFydCkpO1xuXHR9XG5cblx0Y29uc3QgcmVzdWx0OiBzdHJpbmdbXSA9IFtdO1xuXHRmb3IgKGNvbnN0IHBpZWNlIG9mIHBpZWNlcykge1xuXHRcdGxldCBsaW5lID0gcGllY2U7XG5cdFx0aWYgKGxpbmUuZW5kc1dpdGgoJ1xcclxcbicpKSB7XG5cdFx0XHRsaW5lID0gbGluZS5zbGljZSgwLCBsaW5lLmxlbmd0aCAtIDIpO1xuXHRcdH0gZWxzZSBpZiAobGluZS5lbmRzV2l0aCgnXFxuJykpIHtcblx0XHRcdGxpbmUgPSBsaW5lLnNsaWNlKDAsIGxpbmUubGVuZ3RoIC0gMSk7XG5cdFx0fVxuXHRcdGlmIChsaW5lLmxlbmd0aCAhPT0gMCkge1xuXHRcdFx0cmVzdWx0LnB1c2gobGluZSk7XG5cdFx0fVxuXHR9XG5cdHJldHVybiByZXN1bHQ7XG59XG5cbmZ1bmN0aW9uIGpvaW5EaXNwbGF5UGF0aChwcmVmaXg6IHN0cmluZywgY2hpbGQ6IHN0cmluZyk6IHN0cmluZyB7XG5cdGlmIChwcmVmaXgubGVuZ3RoID09PSAwIHx8IGNoaWxkID09PSAnLicpIHtcblx0XHRyZXR1cm4gcHJlZml4Lmxlbmd0aCA9PT0gMCA/IGNoaWxkIDogcHJlZml4O1xuXHR9XG5cdHJldHVybiBgJHtwcmVmaXgucmVwbGFjZSgvXFwvKyQvLCAnJyl9LyR7Y2hpbGR9YDtcbn1cblxuZnVuY3Rpb24gbm9ybWFsaXplRGlzcGxheVBhdGhTZXBhcmF0b3JzKGZpbGVQYXRoOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRyZXR1cm4gZmlsZVBhdGgucmVwbGFjZUFsbCgnXFxcXCcsICcvJyk7XG59XG5cbmZ1bmN0aW9uIGRpc3BsYXlQYXRoVW5kZXJQcmVmaXgoZmlsZVBhdGg6IHN0cmluZywgY29tbW9uUHJlZml4OiBzdHJpbmcpOiBzdHJpbmcge1xuXHRjb25zdCBub3JtYWxpemVkID0gbm9ybWFsaXplRGlzcGxheVBhdGhTZXBhcmF0b3JzKGZpbGVQYXRoKTtcblx0aWYgKGNvbW1vblByZWZpeC5sZW5ndGggPT09IDApIHtcblx0XHRyZXR1cm4gbm9ybWFsaXplZDtcblx0fVxuXHRjb25zdCByZWxhdGl2ZSA9IHRyaW1TdGFydE1hdGNoZXNDaGFycyhub3JtYWxpemVkLnNsaWNlKGNvbW1vblByZWZpeC5sZW5ndGgpLCBbJy8nXSk7XG5cdHJldHVybiByZWxhdGl2ZS5sZW5ndGggPT09IDAgPyAnLicgOiByZWxhdGl2ZTtcbn1cblxuZnVuY3Rpb24gc3VtbWFyaXplRXh0ZW5zaW9ucyhwYXRoczogcmVhZG9ubHkgc3RyaW5nW10pOiBzdHJpbmcge1xuXHRjb25zdCBjb3VudHM6IHsgZXh0ZW5zaW9uOiBzdHJpbmc7IGNvdW50OiBudW1iZXIgfVtdID0gW107XG5cdGZvciAoY29uc3QgZmlsZVBhdGggb2YgcGF0aHMpIHtcblx0XHRjb25zdCBleHRlbnNpb24gPSBwYXRoRXh0ZW5zaW9uKGZpbGVQYXRoKTtcblx0XHRjb25zdCBleGlzdGluZyA9IGNvdW50cy5maW5kKGNhbmRpZGF0ZSA9PiBjYW5kaWRhdGUuZXh0ZW5zaW9uID09PSBleHRlbnNpb24pO1xuXHRcdGlmIChleGlzdGluZyAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRleGlzdGluZy5jb3VudCArPSAxO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb3VudHMucHVzaCh7IGV4dGVuc2lvbiwgY291bnQ6IDEgfSk7XG5cdFx0fVxuXHR9XG5cdGNvdW50cy5zb3J0KChhLCBiKSA9PiBiLmNvdW50IC0gYS5jb3VudCk7XG5cdHJldHVybiBjb3VudHMuc2xpY2UoMCwgOCkubWFwKGVudHJ5ID0+IGAke2VudHJ5LmV4dGVuc2lvbn09JHtlbnRyeS5jb3VudH1gKS5qb2luKCcsICcpO1xufVxuXG5mdW5jdGlvbiBwYXRoRXh0ZW5zaW9uKGZpbGVQYXRoOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRjb25zdCBwYXRoT25seSA9IGZpbGVQYXRoLnNwbGl0KCc6OicpWzBdO1xuXHRjb25zdCBzbGFzaFNlZ21lbnRzID0gcGF0aE9ubHkuc3BsaXQoJy8nKTtcblx0Y29uc3QgYmFzZW5hbWUgPSBzbGFzaFNlZ21lbnRzW3NsYXNoU2VnbWVudHMubGVuZ3RoIC0gMV07XG5cdGNvbnN0IGluZGV4ID0gYmFzZW5hbWUubGFzdEluZGV4T2YoJy4nKTtcblx0aWYgKGluZGV4IDwgMCkge1xuXHRcdHJldHVybiAnW25vIGV4dGVuc2lvbl0nO1xuXHR9XG5cdGlmIChpbmRleCA9PT0gMCB8fCBpbmRleCA9PT0gYmFzZW5hbWUubGVuZ3RoIC0gMSkge1xuXHRcdHJldHVybiAnW25vIGV4dGVuc2lvbl0nO1xuXHR9XG5cdHJldHVybiBiYXNlbmFtZS5zbGljZShpbmRleCk7XG59XG5cbmZ1bmN0aW9uIGNvbXBhcmVTdHJpbmdzKGE6IHN0cmluZywgYjogc3RyaW5nKTogbnVtYmVyIHtcblx0cmV0dXJuIGEgPCBiID8gLTEgOiBhID4gYiA/IDEgOiAwO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBeUVBLE1BQU0saUNBQWlDO0FBQ3ZDLE1BQU0sNENBQTRDO0FBQ2xELE1BQU0sMEJBQTBCO0FBUXpCLFNBQVMsUUFBUSxTQUFpQixRQUFnQixTQUF5QztBQUNqRyxRQUFNLE9BQU8sV0FBVyxDQUFDO0FBQ3pCLFFBQU0sdUJBQXVCLEtBQUssd0JBQXdCO0FBQzFELFFBQU0sZ0NBQWdDLEtBQUssaUNBQWlDO0FBQzVFLFFBQU0sb0JBQW9CLEtBQUssaUJBQWlCO0FBRWhELFFBQU0saUJBQWlCLHNCQUFzQixPQUFPO0FBQ3BELFFBQU0sVUFBVTtBQUFBLElBQ2Y7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsRUFDRDtBQUNBLFNBQU8sWUFBWSxTQUFTLGdCQUFnQixRQUFRLE9BQU87QUFDNUQ7QUFHTyxTQUFTLGdCQUFnQixTQUF3QztBQUN2RSxRQUFNLFNBQVMsc0JBQXNCLE9BQU87QUFDNUMsU0FBTztBQUFBLElBQ04sY0FBYyxPQUFPLGFBQWEsTUFBTTtBQUFBLElBQ3hDLHFCQUFxQixPQUFPO0FBQUEsSUFDNUIsWUFBWSxPQUFPO0FBQUEsSUFDbkIseUJBQXlCLE9BQU87QUFBQSxFQUNqQztBQUNEO0FBSUEsTUFBTSxjQUFjLElBQUksWUFBWTtBQUVwQyxTQUFTLFdBQVcsT0FBdUI7QUFDMUMsU0FBTyxZQUFZLE9BQU8sS0FBSyxFQUFFO0FBQ2xDO0FBR0EsU0FBUyxXQUFXLE1BQXNCO0FBQ3pDLE1BQUksS0FBSyxXQUFXLEdBQUc7QUFDdEIsV0FBTztBQUFBLEVBQ1I7QUFDQSxN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
