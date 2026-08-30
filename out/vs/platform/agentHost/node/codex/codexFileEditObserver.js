var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __decorateClass = (decorators, target, key, kind) => {
  var result = kind > 1 ? void 0 : kind ? __getOwnPropDesc(target, key) : target;
  for (var i = decorators.length - 1, decorator; i >= 0; i--)
    if (decorator = decorators[i])
      result = (kind ? decorator(target, key, result) : decorator(result)) || result;
  if (kind && result) __defProp(target, key, result);
  return result;
};
var __decorateParam = (index, decorator) => (target, key) => decorator(target, key, index);
import * as fs from "fs/promises";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { basename, isAbsolute, resolve } from "../../../../base/common/path.js";
import { URI } from "../../../../base/common/uri.js";
import { IFileService } from "../../../files/common/files.js";
import { IInstantiationService } from "../../../instantiation/common/instantiation.js";
import { ILogService } from "../../../log/common/log.js";
import { FileEditTracker } from "../shared/fileEditTracker.js";
const shellSnapshotIgnoredDirectories = /* @__PURE__ */ new Set([
  ".git",
  ".hg",
  ".svn",
  ".cache",
  ".build",
  ".venv",
  "__pycache__",
  "node_modules",
  "out",
  "build",
  "dist",
  "target",
  "coverage",
  "vendor",
  "venv"
]);
const shellSnapshotMaxFiles = 3e3;
const shellSnapshotMaxFileBytes = 2 * 1024 * 1024;
const shellSnapshotMaxTotalBytes = 24 * 1024 * 1024;
const LIVE_PREVIEW_UNAVAILABLE_MESSAGE = "Live preview unavailable; the final diff will appear when the edit completes.";
const LIVE_PREVIEW_CONFLICT_MESSAGE = "Live preview unavailable because the file changed on disk while Codex was streaming. The final diff will appear when the edit completes.";
let CodexFileEditObserver = class extends Disposable {
  constructor(sessionUri, _database, instantiationService, _fileService, _logService) {
    super();
    this._database = _database;
    this._fileService = _fileService;
    this._logService = _logService;
    this._items = /* @__PURE__ */ new Map();
    this._shellItems = /* @__PURE__ */ new Map();
    this._directWrites = /* @__PURE__ */ new Map();
    this._turnDiffRevisions = /* @__PURE__ */ new Map();
    this._tracker = instantiationService.createInstance(FileEditTracker, sessionUri.toString(), _database.object);
  }
  begin(itemId, workingDirectory, changes) {
    for (const change of changes) {
      this._ensureFile(itemId, workingDirectory, change.path, change);
    }
  }
  async snapshot(turnId, toolCallId, itemId, workingDirectory, changes) {
    const edits = [];
    const reasons = /* @__PURE__ */ new Set();
    for (const change of changes) {
      const observed = this._ensureFile(itemId, workingDirectory, change.path, change);
      try {
        await observed.start;
        const beforeText = await observed.beforeText;
        const currentText = await this._readFile(observed.path);
        if (currentText !== beforeText) {
          reasons.add(LIVE_PREVIEW_CONFLICT_MESSAGE);
          continue;
        }
        const preview = previewFileChange(beforeText, change);
        if (!preview.ok) {
          reasons.add(preview.reason);
          continue;
        }
        const afterPath = preview.afterPath ? isAbsolute(preview.afterPath) ? preview.afterPath : resolve(workingDirectory?.fsPath ?? process.cwd(), preview.afterPath) : observed.afterPath;
        const edit = await this._tracker.snapshotEditContent(turnId, toolCallId, observed.path, preview.after, {
          afterPath,
          omitBefore: preview.omitBefore,
          omitAfter: preview.omitAfter
        });
        if (edit) {
          edits.push(edit);
        }
      } catch (error) {
        this._logService.warn(`[CodexFileEditObserver] Failed to snapshot ${observed.path}: ${error instanceof Error ? error.message : String(error)}`);
        reasons.add(LIVE_PREVIEW_UNAVAILABLE_MESSAGE);
      }
    }
    return {
      edits,
      previewUnavailable: reasons.size > 0 ? [...reasons][0] : void 0
    };
  }
  async complete(turnId, toolCallId, itemId, workingDirectory, changes, modelId) {
    this.begin(itemId, workingDirectory, changes);
    const item = this._items.get(itemId);
    if (!item) {
      return [];
    }
    this._items.delete(itemId);
    const edits = [];
    for (const [path, observed] of item) {
      try {
        await observed.start;
        await this._tracker.completeEdit(path, {
          afterPath: observed.afterPath,
          omitBefore: observed.omitBefore,
          omitAfter: observed.omitAfter
        });
        const edit = await this._tracker.takeCompletedEdit(turnId, toolCallId, path, "apply_patch", changes, modelId);
        if (edit) {
          edits.push(edit);
        }
      } catch (error) {
        this._logService.warn(`[CodexFileEditObserver] Failed to complete ${path}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return edits;
  }
  /**
   * Takes a bounded before-snapshot for shell commands that appear capable of
   * writing files. Exact paths mentioned by the command are always included;
   * small workspaces are additionally snapshotted so variable/generated paths
   * are covered without imposing an unbounded cost on large repositories.
   */
  async beginShell(itemId, command, cwd, workingDirectories) {
    if (!mayMutateFiles(command)) {
      return;
    }
    const roots = distinctPaths([
      ...cwd ? [cwd] : [],
      ...workingDirectories.map((directory) => directory.fsPath)
    ]);
    const base = cwd ?? roots[0] ?? process.cwd();
    const candidates = shellCommandFileCandidates(command, base);
    const before = /* @__PURE__ */ new Map();
    for (const candidate of candidates) {
      before.set(candidate, await readShellSnapshot(candidate));
    }
    let remainingFiles = shellSnapshotMaxFiles;
    let remainingBytes = shellSnapshotMaxTotalBytes;
    for (const root of roots) {
      const result = await snapshotDirectory(root, before, remainingFiles, remainingBytes);
      remainingFiles -= result.files;
      remainingBytes -= result.bytes;
      if (remainingFiles <= 0 || remainingBytes <= 0) {
        break;
      }
    }
    this._shellItems.set(itemId, { before, roots, candidates });
  }
  /** Returns file-edit results for writes performed by a completed shell command. */
  async completeShell(turnId, toolCallId, itemId) {
    const observed = this._shellItems.get(itemId);
    this._shellItems.delete(itemId);
    if (!observed) {
      return [];
    }
    const after = /* @__PURE__ */ new Map();
    for (const candidate of observed.candidates) {
      after.set(candidate, await readShellSnapshot(candidate));
    }
    let remainingFiles = shellSnapshotMaxFiles;
    let remainingBytes = shellSnapshotMaxTotalBytes;
    for (const root of observed.roots) {
      const result = await snapshotDirectory(root, after, remainingFiles, remainingBytes);
      remainingFiles -= result.files;
      remainingBytes -= result.bytes;
      if (remainingFiles <= 0 || remainingBytes <= 0) {
        break;
      }
    }
    const paths = /* @__PURE__ */ new Set([...observed.before.keys(), ...after.keys()]);
    const edits = [];
    const missing = { existed: false, content: "", skippedContent: false, size: 0, mtimeMs: 0 };
    for (const path of paths) {
      const before = observed.before.get(path) ?? missing;
      const current = after.get(path) ?? missing;
      if (before.skippedContent || current.skippedContent) {
        if (before.existed === current.existed && before.size === current.size && before.mtimeMs === current.mtimeMs) {
          continue;
        }
        this._logService.warn(`[CodexFileEditObserver] Refusing shell preview for binary or oversized file ${path}`);
        continue;
      }
      if (before.existed === current.existed && before.content === current.content) {
        continue;
      }
      try {
        edits.push(await this._tracker.snapshotKnownContents(turnId, toolCallId, path, before.content, before.existed, current.content, 1, {
          omitBefore: !before.existed,
          omitAfter: !current.existed
        }));
      } catch (error) {
        this._logService.warn(`[CodexFileEditObserver] Failed to snapshot shell edit ${path}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return edits;
  }
  /** Captures Codex's cumulative turn diff, including files written by shell tools. */
  async snapshotTurnDiff(turnId, toolCallId, workingDirectories, diff) {
    const edits = [];
    for (const file of parseGitTurnDiff(diff)) {
      try {
        const path = await resolveTurnDiffPath(file.path, file.afterExists, workingDirectories, (candidate) => this._fileService.exists(URI.file(candidate)));
        const afterText = file.afterExists ? await this._readFile(path) : "";
        const inverted = file.beforeExisted ? invertUnifiedDiff(file.patch) : "";
        const beforeText = file.beforeExisted ? applyUnifiedDiff(afterText, inverted) : "";
        if (file.beforeExisted && beforeText === void 0) {
          this._logService.warn(`[CodexFileEditObserver] Refusing turn-diff preview for ${file.path}: reconstructed before-state does not match the patch`);
          continue;
        }
        const revisionKey = `${turnId}\0${path}`;
        const revision = (this._turnDiffRevisions.get(revisionKey) ?? 0) + 1;
        this._turnDiffRevisions.set(revisionKey, revision);
        edits.push(await this._tracker.snapshotKnownContents(turnId, toolCallId, path, beforeText ?? "", file.beforeExisted, afterText, revision, {
          omitBefore: !file.beforeExisted,
          omitAfter: !file.afterExists
        }));
      } catch (error) {
        this._logService.warn(`[CodexFileEditObserver] Failed to snapshot turn diff for ${file.path}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return edits;
  }
  clearTurnDiff(turnId) {
    for (const key of this._turnDiffRevisions.keys()) {
      if (key.startsWith(`${turnId}\0`)) {
        this._turnDiffRevisions.delete(key);
      }
    }
  }
  /**
   * Host `write_file` does not stream `fileChange/patchUpdated`. Snapshot the
   * current on-disk bytes, persist the complete after-content, then write the
   * workspace file. Live Codex Edit plays Cline's local sweep from that pair;
   * dripping prefixes here would abort that sweep.
   */
  async beginDirectWrite(itemId, filePath, contents) {
    this._directWrites.set(itemId, { path: filePath, contents });
    await this._tracker.trackEditStart(filePath);
  }
  async snapshotDirectWrite(turnId, toolCallId, itemId, afterContent) {
    const write = this._directWrites.get(itemId);
    if (!write) {
      return void 0;
    }
    try {
      return await this._tracker.snapshotEditContent(turnId, toolCallId, write.path, afterContent ?? write.contents);
    } catch (error) {
      this._logService.warn(`[CodexFileEditObserver] Failed to snapshot write_file ${write.path}: ${error instanceof Error ? error.message : String(error)}`);
      return void 0;
    }
  }
  async completeDirectWrite(turnId, toolCallId, itemId, modelId) {
    const write = this._directWrites.get(itemId);
    this._directWrites.delete(itemId);
    if (!write) {
      return [];
    }
    try {
      await this._tracker.completeEdit(write.path);
      const edit = await this._tracker.takeCompletedEdit(turnId, toolCallId, write.path, "write_file", { path: write.path, contents: write.contents }, modelId);
      return edit ? [edit] : [];
    } catch (error) {
      this._logService.warn(`[CodexFileEditObserver] Failed to complete write_file ${write.path}: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  }
  abandonDirectWrite(itemId) {
    const write = this._directWrites.get(itemId);
    this._directWrites.delete(itemId);
    if (write) {
      this._tracker.abandonEdit(write.path);
    }
  }
  _ensureFile(itemId, workingDirectory, filePath, change) {
    let item = this._items.get(itemId);
    if (!item) {
      item = /* @__PURE__ */ new Map();
      this._items.set(itemId, item);
    }
    const path = isAbsolute(filePath) ? filePath : resolve(workingDirectory?.fsPath ?? process.cwd(), filePath);
    const movePath = change?.kind.type === "update" ? change.kind.move_path ?? void 0 : void 0;
    const afterPath = movePath ? isAbsolute(movePath) ? movePath : resolve(workingDirectory?.fsPath ?? process.cwd(), movePath) : void 0;
    const omitBefore = change?.kind.type === "add";
    const omitAfter = change?.kind.type === "delete";
    let observed = item.get(path);
    if (!observed) {
      observed = {
        path,
        afterPath,
        omitBefore,
        omitAfter,
        beforeText: this._readFile(path),
        start: this._tracker.trackEditStart(path)
      };
      item.set(path, observed);
    } else if (change) {
      observed.afterPath = afterPath ?? observed.afterPath;
      observed.omitBefore = omitBefore;
      observed.omitAfter = omitAfter;
    }
    return observed;
  }
  async _readFile(path) {
    try {
      return (await this._fileService.readFile(URI.file(path))).value.toString();
    } catch {
      return "";
    }
  }
  dispose() {
    this._items.clear();
    this._shellItems.clear();
    this._directWrites.clear();
    this._turnDiffRevisions.clear();
    this._database.dispose();
    super.dispose();
  }
};
CodexFileEditObserver = __decorateClass([
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, IFileService),
  __decorateParam(4, ILogService)
], CodexFileEditObserver);
function mayMutateFiles(command) {
  return /(?:apply_patch|writeall(?:text|lines)|set-content|add-content|out-file|new-item|remove-item|rename-item|move-item|copy-item|\b(?:rm|mv|cp|touch|mkdir|tee|sed|perl)\b|(?:^|[^>])>{1,2}(?!=)|writeFile|appendFile|rename\(|unlink\(|mkdir\(|shutil\.|pathlib\.)/i.test(command);
}
function shellCommandFileCandidates(command, cwd) {
  const values = /* @__PURE__ */ new Set();
  const patterns = [
    /[A-Za-z]:[\\/][^'"`\r\n;|<>]+/g,
    /\.\.?[\\/][^'"`\r\n;|<>),]+/g,
    /(?:[\w@().-]+[\\/])+[\w@().-]+\.[A-Za-z0-9_-]{1,16}/g
  ];
  for (const pattern of patterns) {
    for (const match of command.matchAll(pattern)) {
      let value = match[0].trim().replace(/[),\]}]+$/, "").trim();
      if (!value || value.includes("$") || value.includes("*") || value.includes("?")) {
        continue;
      }
      value = isAbsolute(value) ? value : resolve(cwd, value);
      values.add(value);
    }
  }
  return [...values];
}
function distinctPaths(paths) {
  return [...new Set(paths.map((path) => resolve(path)))];
}
async function readShellSnapshot(path) {
  try {
    const stat = await fs.stat(path);
    if (!stat.isFile()) {
      return { existed: false, content: "", skippedContent: false, size: 0, mtimeMs: 0 };
    }
    if (stat.size > shellSnapshotMaxFileBytes) {
      return { existed: true, content: "", skippedContent: true, size: stat.size, mtimeMs: stat.mtimeMs };
    }
    const buffer = await fs.readFile(path);
    if (buffer.includes(0)) {
      return { existed: true, content: "", skippedContent: true, size: stat.size, mtimeMs: stat.mtimeMs };
    }
    return { existed: true, content: buffer.toString("utf8"), skippedContent: false, size: stat.size, mtimeMs: stat.mtimeMs };
  } catch {
    return { existed: false, content: "", skippedContent: false, size: 0, mtimeMs: 0 };
  }
}
async function snapshotDirectory(root, snapshots, maxFiles, maxBytes) {
  let files = 0;
  let bytes = 0;
  const pending = [root];
  while (pending.length > 0 && files < maxFiles && bytes < maxBytes) {
    const directory = pending.pop();
    let entries;
    try {
      entries = await fs.readdir(directory, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (files >= maxFiles || bytes >= maxBytes) {
        break;
      }
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        if (!shellSnapshotIgnoredDirectories.has(entry.name.toLowerCase())) {
          pending.push(path);
        }
        continue;
      }
      if (!entry.isFile() || snapshots.has(path)) {
        continue;
      }
      const snapshot = await readShellSnapshot(path);
      if (!snapshot.existed) {
        continue;
      }
      if (snapshot.skippedContent) {
        snapshots.set(path, snapshot);
        files++;
        continue;
      }
      const size = snapshot.size || Buffer.byteLength(snapshot.content, "utf8");
      if (bytes + size > maxBytes) {
        break;
      }
      snapshots.set(path, snapshot);
      files++;
      bytes += size;
    }
  }
  return { files, bytes };
}
async function resolveTurnDiffPath(relativePath, afterExists, workingDirectories, exists) {
  const roots = workingDirectories.length > 0 ? workingDirectories : [URI.file(process.cwd())];
  for (const root of roots) {
    const rootName = basename(root.fsPath);
    const relativeToRoot = relativePath.startsWith(`${rootName}/`) ? relativePath.slice(rootName.length + 1) : relativePath;
    const candidate = resolve(root.fsPath, relativeToRoot);
    if (!afterExists || await exists(candidate)) {
      return candidate;
    }
  }
  return resolve(roots[0].fsPath, relativePath);
}
function parseGitTurnDiff(diff) {
  const starts = [];
  const pattern = /^diff --git /gm;
  for (let match = pattern.exec(diff); match; match = pattern.exec(diff)) {
    starts.push(match.index);
  }
  const files = [];
  for (let index = 0; index < starts.length; index++) {
    const section = diff.slice(starts[index], starts[index + 1] ?? diff.length);
    const beforeMarker = /^--- (.+)$/m.exec(section)?.[1];
    const afterMarker = /^\+\+\+ (.+)$/m.exec(section)?.[1];
    if (!beforeMarker || !afterMarker) {
      continue;
    }
    const beforePath = normalizeGitDiffPath(beforeMarker);
    const afterPath = normalizeGitDiffPath(afterMarker);
    const beforeExisted = beforePath !== void 0;
    const afterExists = afterPath !== void 0;
    const path = afterPath ?? beforePath;
    if (path) {
      files.push({ path, beforeExisted, afterExists, patch: section });
    }
  }
  return files;
}
function normalizeGitDiffPath(marker) {
  const value = marker.split("	", 1)[0].trim();
  if (value === "/dev/null") {
    return void 0;
  }
  const unquoted = value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\") : value;
  return unquoted.replace(/^[ab]\//, "");
}
function invertUnifiedDiff(diff) {
  const result = [];
  let inHunk = false;
  for (const line of diff.split("\n")) {
    const header = /^@@ -(\d+)(,\d+)? \+(\d+)(,\d+)? @@(.*)$/.exec(line);
    if (header) {
      inHunk = true;
      result.push(`@@ -${header[3]}${header[4] ?? ""} +${header[1]}${header[2] ?? ""} @@${header[5]}`);
    } else if (inHunk && line.startsWith("+")) {
      result.push(`-${line.slice(1)}`);
    } else if (inHunk && line.startsWith("-")) {
      result.push(`+${line.slice(1)}`);
    } else if (inHunk) {
      result.push(line);
    }
  }
  return result.join("\n");
}
function previewFileChange(beforeText, change) {
  switch (change.kind.type) {
    case "add":
      return { ok: true, after: change.diff, omitBefore: true, omitAfter: false };
    case "delete":
      return { ok: true, after: "", omitBefore: false, omitAfter: true };
    case "update": {
      const after = applyUnifiedDiff(beforeText, stripMoveTrailer(change.diff, change.kind.move_path));
      if (after === void 0) {
        return { ok: false, reason: LIVE_PREVIEW_UNAVAILABLE_MESSAGE };
      }
      return {
        ok: true,
        after,
        afterPath: change.kind.move_path ?? void 0,
        omitBefore: false,
        omitAfter: false
      };
    }
  }
}
function stripMoveTrailer(diff, movePath) {
  if (!movePath) {
    return diff;
  }
  const trailer = `

Moved to: ${movePath}`;
  return diff.endsWith(trailer) ? diff.slice(0, -trailer.length) : diff;
}
function splitPatchLines(text) {
  if (text === "") {
    return [];
  }
  const endsWithNewline = text.endsWith("\n");
  const lines = text.split(/\r?\n/);
  if (endsWithNewline) {
    lines.pop();
  }
  return lines;
}
function stripCarriageReturn(value) {
  return value.endsWith("\r") ? value.slice(0, -1) : value;
}
function applyUnifiedDiff(original, diff) {
  const newline = original.includes("\r\n") ? "\r\n" : "\n";
  const originalEndsWithNewline = original.endsWith("\n");
  const originalLines = splitPatchLines(original);
  const diffLines = diff.split("\n");
  const result = [];
  let originalIndex = 0;
  let sawHunk = false;
  let afterEndsWithNewline = originalEndsWithNewline;
  const lineEquals = (actual, expected) => {
    return actual !== void 0 && stripCarriageReturn(actual) === stripCarriageReturn(expected);
  };
  for (let index = 0; index < diffLines.length; index++) {
    const header = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(diffLines[index]);
    if (!header) {
      continue;
    }
    sawHunk = true;
    const oldStart = Number(header[1]);
    const oldCount = header[2] !== void 0 ? Number(header[2]) : oldStart === 0 ? 0 : 1;
    const hunkStart = oldStart === 0 ? 0 : oldStart - 1;
    if (hunkStart < originalIndex || hunkStart > originalLines.length) {
      return void 0;
    }
    result.push(...originalLines.slice(originalIndex, hunkStart));
    originalIndex = hunkStart;
    let consumedOld = 0;
    let previousContributedToAfter = false;
    for (index++; index < diffLines.length && !diffLines[index].startsWith("@@ "); index++) {
      const line = diffLines[index];
      if (line === "\\ No newline at end of file") {
        if (previousContributedToAfter) {
          afterEndsWithNewline = false;
        }
        continue;
      }
      if (line.startsWith(" ")) {
        const expected = line.slice(1);
        if (!lineEquals(originalLines[originalIndex], expected)) {
          return void 0;
        }
        result.push(originalLines[originalIndex]);
        originalIndex++;
        consumedOld++;
        previousContributedToAfter = true;
        afterEndsWithNewline = true;
      } else if (line.startsWith("-")) {
        const expected = line.slice(1);
        if (!lineEquals(originalLines[originalIndex], expected)) {
          return void 0;
        }
        originalIndex++;
        consumedOld++;
        previousContributedToAfter = false;
      } else if (line.startsWith("+")) {
        result.push(line.slice(1));
        previousContributedToAfter = true;
        afterEndsWithNewline = true;
      } else if (line === "" && index === diffLines.length - 1) {
        continue;
      } else {
        return void 0;
      }
    }
    if (header[2] !== void 0 && consumedOld !== oldCount) {
      return void 0;
    }
    index--;
  }
  if (!sawHunk) {
    return void 0;
  }
  const leftover = originalLines.slice(originalIndex);
  result.push(...leftover);
  if (leftover.length > 0) {
    afterEndsWithNewline = originalEndsWithNewline;
  }
  return result.join(newline) + (afterEndsWithNewline ? newline : "");
}
export {
  CodexFileEditObserver,
  LIVE_PREVIEW_CONFLICT_MESSAGE,
  LIVE_PREVIEW_UNAVAILABLE_MESSAGE,
  applyUnifiedDiff,
  invertUnifiedDiff,
  parseGitTurnDiff,
  previewFileChange,
  readShellSnapshot,
  resolveTurnDiffPath,
  shellCommandFileCandidates,
  shellSnapshotIgnoredDirectories,
  shellSnapshotMaxFileBytes,
  shellSnapshotMaxFiles,
  shellSnapshotMaxTotalBytes,
  snapshotDirectory
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFxub2RlXFxjb2RleFxcY29kZXhGaWxlRWRpdE9ic2VydmVyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgZnMgZnJvbSAnZnMvcHJvbWlzZXMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgdHlwZSBJUmVmZXJlbmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGJhc2VuYW1lLCBpc0Fic29sdXRlLCByZXNvbHZlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgdHlwZSB7IElTZXNzaW9uRGF0YWJhc2UgfSBmcm9tICcuLi8uLi9jb21tb24vc2Vzc2lvbkRhdGFTZXJ2aWNlLmpzJztcbmltcG9ydCB0eXBlIHsgVG9vbFJlc3VsdEZpbGVFZGl0Q29udGVudCB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uU3RhdGUuanMnO1xuaW1wb3J0IHsgRmlsZUVkaXRUcmFja2VyIH0gZnJvbSAnLi4vc2hhcmVkL2ZpbGVFZGl0VHJhY2tlci5qcyc7XG5pbXBvcnQgdHlwZSB7IEZpbGVVcGRhdGVDaGFuZ2UgfSBmcm9tICcuL3Byb3RvY29sL2dlbmVyYXRlZC92Mi9GaWxlVXBkYXRlQ2hhbmdlLmpzJztcblxuaW50ZXJmYWNlIElPYnNlcnZlZEZpbGVFZGl0IHtcblx0cmVhZG9ubHkgcGF0aDogc3RyaW5nO1xuXHRhZnRlclBhdGg/OiBzdHJpbmc7XG5cdG9taXRCZWZvcmU/OiBib29sZWFuO1xuXHRvbWl0QWZ0ZXI/OiBib29sZWFuO1xuXHRyZWFkb25seSBiZWZvcmVUZXh0OiBQcm9taXNlPHN0cmluZz47XG5cdHJlYWRvbmx5IHN0YXJ0OiBQcm9taXNlPHZvaWQ+O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElTaGVsbEZpbGVTbmFwc2hvdCB7XG5cdHJlYWRvbmx5IGV4aXN0ZWQ6IGJvb2xlYW47XG5cdHJlYWRvbmx5IGNvbnRlbnQ6IHN0cmluZztcblx0cmVhZG9ubHkgc2tpcHBlZENvbnRlbnQ6IGJvb2xlYW47XG5cdHJlYWRvbmx5IHNpemU6IG51bWJlcjtcblx0cmVhZG9ubHkgbXRpbWVNczogbnVtYmVyO1xufVxuXG5pbnRlcmZhY2UgSU9ic2VydmVkU2hlbGxFZGl0IHtcblx0cmVhZG9ubHkgYmVmb3JlOiBNYXA8c3RyaW5nLCBJU2hlbGxGaWxlU25hcHNob3Q+O1xuXHRyZWFkb25seSByb290czogcmVhZG9ubHkgc3RyaW5nW107XG5cdHJlYWRvbmx5IGNhbmRpZGF0ZXM6IHJlYWRvbmx5IHN0cmluZ1tdO1xufVxuXG5pbnRlcmZhY2UgSURpcmVjdFdyaXRlIHtcblx0cmVhZG9ubHkgcGF0aDogc3RyaW5nO1xuXHRyZWFkb25seSBjb250ZW50czogc3RyaW5nO1xufVxuXG5leHBvcnQgY29uc3Qgc2hlbGxTbmFwc2hvdElnbm9yZWREaXJlY3RvcmllcyA9IG5ldyBTZXQoW1xuXHQnLmdpdCcsICcuaGcnLCAnLnN2bicsICcuY2FjaGUnLCAnLmJ1aWxkJywgJy52ZW52JywgJ19fcHljYWNoZV9fJyxcblx0J25vZGVfbW9kdWxlcycsICdvdXQnLCAnYnVpbGQnLCAnZGlzdCcsICd0YXJnZXQnLCAnY292ZXJhZ2UnLCAndmVuZG9yJywgJ3ZlbnYnLFxuXSk7XG5leHBvcnQgY29uc3Qgc2hlbGxTbmFwc2hvdE1heEZpbGVzID0gM18wMDA7XG5leHBvcnQgY29uc3Qgc2hlbGxTbmFwc2hvdE1heEZpbGVCeXRlcyA9IDIgKiAxMDI0ICogMTAyNDtcbmV4cG9ydCBjb25zdCBzaGVsbFNuYXBzaG90TWF4VG90YWxCeXRlcyA9IDI0ICogMTAyNCAqIDEwMjQ7XG5cbmV4cG9ydCBjb25zdCBMSVZFX1BSRVZJRVdfVU5BVkFJTEFCTEVfTUVTU0FHRSA9ICdMaXZlIHByZXZpZXcgdW5hdmFpbGFibGU7IHRoZSBmaW5hbCBkaWZmIHdpbGwgYXBwZWFyIHdoZW4gdGhlIGVkaXQgY29tcGxldGVzLic7XG5leHBvcnQgY29uc3QgTElWRV9QUkVWSUVXX0NPTkZMSUNUX01FU1NBR0UgPSAnTGl2ZSBwcmV2aWV3IHVuYXZhaWxhYmxlIGJlY2F1c2UgdGhlIGZpbGUgY2hhbmdlZCBvbiBkaXNrIHdoaWxlIENvZGV4IHdhcyBzdHJlYW1pbmcuIFRoZSBmaW5hbCBkaWZmIHdpbGwgYXBwZWFyIHdoZW4gdGhlIGVkaXQgY29tcGxldGVzLic7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUZpbGVDaGFuZ2VQcmV2aWV3U3VjY2VzcyB7XG5cdHJlYWRvbmx5IG9rOiB0cnVlO1xuXHRyZWFkb25seSBhZnRlcjogc3RyaW5nO1xuXHRyZWFkb25seSBhZnRlclBhdGg/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IG9taXRCZWZvcmU6IGJvb2xlYW47XG5cdHJlYWRvbmx5IG9taXRBZnRlcjogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJRmlsZUNoYW5nZVByZXZpZXdGYWlsdXJlIHtcblx0cmVhZG9ubHkgb2s6IGZhbHNlO1xuXHRyZWFkb25seSByZWFzb246IHN0cmluZztcbn1cblxuZXhwb3J0IHR5cGUgSUZpbGVDaGFuZ2VQcmV2aWV3ID0gSUZpbGVDaGFuZ2VQcmV2aWV3U3VjY2VzcyB8IElGaWxlQ2hhbmdlUHJldmlld0ZhaWx1cmU7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUZpbGVFZGl0U25hcHNob3RSZXN1bHQge1xuXHRyZWFkb25seSBlZGl0czogcmVhZG9ubHkgVG9vbFJlc3VsdEZpbGVFZGl0Q29udGVudFtdO1xuXHRyZWFkb25seSBwcmV2aWV3VW5hdmFpbGFibGU/OiBzdHJpbmc7XG59XG5cbi8qKlxuICogQWRhcHRzIENvZGV4J3Mgc3RyZWFtZWQgYGZpbGVDaGFuZ2UvcGF0Y2hVcGRhdGVkYCBub3RpZmljYXRpb25zIHRvIEFnZW50XG4gKiBIb3N0IGZpbGUtZWRpdCBzbmFwc2hvdHMuIENvZGV4IHJlbWFpbnMgcmVzcG9uc2libGUgZm9yIGFwcGx5aW5nIGFuZFxuICogYXBwcm92aW5nIHBhdGNoZXM7IHRoaXMgY2xhc3Mgb25seSBidWlsZHMgbmF0aXZlLCByZWFkLW9ubHkgZGlmZiBwcmV2aWV3cy5cbiAqL1xuZXhwb3J0IGNsYXNzIENvZGV4RmlsZUVkaXRPYnNlcnZlciBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRwcml2YXRlIHJlYWRvbmx5IF90cmFja2VyOiBGaWxlRWRpdFRyYWNrZXI7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2l0ZW1zID0gbmV3IE1hcDxzdHJpbmcsIE1hcDxzdHJpbmcsIElPYnNlcnZlZEZpbGVFZGl0Pj4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfc2hlbGxJdGVtcyA9IG5ldyBNYXA8c3RyaW5nLCBJT2JzZXJ2ZWRTaGVsbEVkaXQ+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2RpcmVjdFdyaXRlcyA9IG5ldyBNYXA8c3RyaW5nLCBJRGlyZWN0V3JpdGU+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3R1cm5EaWZmUmV2aXNpb25zID0gbmV3IE1hcDxzdHJpbmcsIG51bWJlcj4oKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRzZXNzaW9uVXJpOiBVUkksXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZGF0YWJhc2U6IElSZWZlcmVuY2U8SVNlc3Npb25EYXRhYmFzZT4sXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fdHJhY2tlciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEZpbGVFZGl0VHJhY2tlciwgc2Vzc2lvblVyaS50b1N0cmluZygpLCBfZGF0YWJhc2Uub2JqZWN0KTtcblx0fVxuXG5cdGJlZ2luKGl0ZW1JZDogc3RyaW5nLCB3b3JraW5nRGlyZWN0b3J5OiBVUkkgfCB1bmRlZmluZWQsIGNoYW5nZXM6IHJlYWRvbmx5IEZpbGVVcGRhdGVDaGFuZ2VbXSk6IHZvaWQge1xuXHRcdGZvciAoY29uc3QgY2hhbmdlIG9mIGNoYW5nZXMpIHtcblx0XHRcdHRoaXMuX2Vuc3VyZUZpbGUoaXRlbUlkLCB3b3JraW5nRGlyZWN0b3J5LCBjaGFuZ2UucGF0aCwgY2hhbmdlKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBzbmFwc2hvdCh0dXJuSWQ6IHN0cmluZywgdG9vbENhbGxJZDogc3RyaW5nLCBpdGVtSWQ6IHN0cmluZywgd29ya2luZ0RpcmVjdG9yeTogVVJJIHwgdW5kZWZpbmVkLCBjaGFuZ2VzOiByZWFkb25seSBGaWxlVXBkYXRlQ2hhbmdlW10pOiBQcm9taXNlPElGaWxlRWRpdFNuYXBzaG90UmVzdWx0PiB7XG5cdFx0Y29uc3QgZWRpdHM6IFRvb2xSZXN1bHRGaWxlRWRpdENvbnRlbnRbXSA9IFtdO1xuXHRcdGNvbnN0IHJlYXNvbnMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHRmb3IgKGNvbnN0IGNoYW5nZSBvZiBjaGFuZ2VzKSB7XG5cdFx0XHRjb25zdCBvYnNlcnZlZCA9IHRoaXMuX2Vuc3VyZUZpbGUoaXRlbUlkLCB3b3JraW5nRGlyZWN0b3J5LCBjaGFuZ2UucGF0aCwgY2hhbmdlKTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IG9ic2VydmVkLnN0YXJ0O1xuXHRcdFx0XHRjb25zdCBiZWZvcmVUZXh0ID0gYXdhaXQgb2JzZXJ2ZWQuYmVmb3JlVGV4dDtcblx0XHRcdFx0Y29uc3QgY3VycmVudFRleHQgPSBhd2FpdCB0aGlzLl9yZWFkRmlsZShvYnNlcnZlZC5wYXRoKTtcblx0XHRcdFx0aWYgKGN1cnJlbnRUZXh0ICE9PSBiZWZvcmVUZXh0KSB7XG5cdFx0XHRcdFx0cmVhc29ucy5hZGQoTElWRV9QUkVWSUVXX0NPTkZMSUNUX01FU1NBR0UpO1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IHByZXZpZXcgPSBwcmV2aWV3RmlsZUNoYW5nZShiZWZvcmVUZXh0LCBjaGFuZ2UpO1xuXHRcdFx0XHRpZiAoIXByZXZpZXcub2spIHtcblx0XHRcdFx0XHRyZWFzb25zLmFkZChwcmV2aWV3LnJlYXNvbik7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgYWZ0ZXJQYXRoID0gcHJldmlldy5hZnRlclBhdGhcblx0XHRcdFx0XHQ/IChpc0Fic29sdXRlKHByZXZpZXcuYWZ0ZXJQYXRoKSA/IHByZXZpZXcuYWZ0ZXJQYXRoIDogcmVzb2x2ZSh3b3JraW5nRGlyZWN0b3J5Py5mc1BhdGggPz8gcHJvY2Vzcy5jd2QoKSwgcHJldmlldy5hZnRlclBhdGgpKVxuXHRcdFx0XHRcdDogb2JzZXJ2ZWQuYWZ0ZXJQYXRoO1xuXHRcdFx0XHRjb25zdCBlZGl0ID0gYXdhaXQgdGhpcy5fdHJhY2tlci5zbmFwc2hvdEVkaXRDb250ZW50KHR1cm5JZCwgdG9vbENhbGxJZCwgb2JzZXJ2ZWQucGF0aCwgcHJldmlldy5hZnRlciwge1xuXHRcdFx0XHRcdGFmdGVyUGF0aCxcblx0XHRcdFx0XHRvbWl0QmVmb3JlOiBwcmV2aWV3Lm9taXRCZWZvcmUsXG5cdFx0XHRcdFx0b21pdEFmdGVyOiBwcmV2aWV3Lm9taXRBZnRlcixcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGlmIChlZGl0KSB7XG5cdFx0XHRcdFx0ZWRpdHMucHVzaChlZGl0KTtcblx0XHRcdFx0fVxuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQ29kZXhGaWxlRWRpdE9ic2VydmVyXSBGYWlsZWQgdG8gc25hcHNob3QgJHtvYnNlcnZlZC5wYXRofTogJHtlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFN0cmluZyhlcnJvcil9YCk7XG5cdFx0XHRcdHJlYXNvbnMuYWRkKExJVkVfUFJFVklFV19VTkFWQUlMQUJMRV9NRVNTQUdFKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHtcblx0XHRcdGVkaXRzLFxuXHRcdFx0cHJldmlld1VuYXZhaWxhYmxlOiByZWFzb25zLnNpemUgPiAwID8gWy4uLnJlYXNvbnNdWzBdIDogdW5kZWZpbmVkLFxuXHRcdH07XG5cdH1cblxuXHRhc3luYyBjb21wbGV0ZSh0dXJuSWQ6IHN0cmluZywgdG9vbENhbGxJZDogc3RyaW5nLCBpdGVtSWQ6IHN0cmluZywgd29ya2luZ0RpcmVjdG9yeTogVVJJIHwgdW5kZWZpbmVkLCBjaGFuZ2VzOiByZWFkb25seSBGaWxlVXBkYXRlQ2hhbmdlW10sIG1vZGVsSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCk6IFByb21pc2U8cmVhZG9ubHkgVG9vbFJlc3VsdEZpbGVFZGl0Q29udGVudFtdPiB7XG5cdFx0dGhpcy5iZWdpbihpdGVtSWQsIHdvcmtpbmdEaXJlY3RvcnksIGNoYW5nZXMpO1xuXHRcdGNvbnN0IGl0ZW0gPSB0aGlzLl9pdGVtcy5nZXQoaXRlbUlkKTtcblx0XHRpZiAoIWl0ZW0pIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdFx0dGhpcy5faXRlbXMuZGVsZXRlKGl0ZW1JZCk7XG5cdFx0Y29uc3QgZWRpdHM6IFRvb2xSZXN1bHRGaWxlRWRpdENvbnRlbnRbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgW3BhdGgsIG9ic2VydmVkXSBvZiBpdGVtKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCBvYnNlcnZlZC5zdGFydDtcblx0XHRcdFx0YXdhaXQgdGhpcy5fdHJhY2tlci5jb21wbGV0ZUVkaXQocGF0aCwge1xuXHRcdFx0XHRcdGFmdGVyUGF0aDogb2JzZXJ2ZWQuYWZ0ZXJQYXRoLFxuXHRcdFx0XHRcdG9taXRCZWZvcmU6IG9ic2VydmVkLm9taXRCZWZvcmUsXG5cdFx0XHRcdFx0b21pdEFmdGVyOiBvYnNlcnZlZC5vbWl0QWZ0ZXIsXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRjb25zdCBlZGl0ID0gYXdhaXQgdGhpcy5fdHJhY2tlci50YWtlQ29tcGxldGVkRWRpdCh0dXJuSWQsIHRvb2xDYWxsSWQsIHBhdGgsICdhcHBseV9wYXRjaCcsIGNoYW5nZXMsIG1vZGVsSWQpO1xuXHRcdFx0XHRpZiAoZWRpdCkge1xuXHRcdFx0XHRcdGVkaXRzLnB1c2goZWRpdCk7XG5cdFx0XHRcdH1cblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0NvZGV4RmlsZUVkaXRPYnNlcnZlcl0gRmFpbGVkIHRvIGNvbXBsZXRlICR7cGF0aH06ICR7ZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBTdHJpbmcoZXJyb3IpfWApO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gZWRpdHM7XG5cdH1cblxuXHQvKipcblx0ICogVGFrZXMgYSBib3VuZGVkIGJlZm9yZS1zbmFwc2hvdCBmb3Igc2hlbGwgY29tbWFuZHMgdGhhdCBhcHBlYXIgY2FwYWJsZSBvZlxuXHQgKiB3cml0aW5nIGZpbGVzLiBFeGFjdCBwYXRocyBtZW50aW9uZWQgYnkgdGhlIGNvbW1hbmQgYXJlIGFsd2F5cyBpbmNsdWRlZDtcblx0ICogc21hbGwgd29ya3NwYWNlcyBhcmUgYWRkaXRpb25hbGx5IHNuYXBzaG90dGVkIHNvIHZhcmlhYmxlL2dlbmVyYXRlZCBwYXRoc1xuXHQgKiBhcmUgY292ZXJlZCB3aXRob3V0IGltcG9zaW5nIGFuIHVuYm91bmRlZCBjb3N0IG9uIGxhcmdlIHJlcG9zaXRvcmllcy5cblx0ICovXG5cdGFzeW5jIGJlZ2luU2hlbGwoaXRlbUlkOiBzdHJpbmcsIGNvbW1hbmQ6IHN0cmluZywgY3dkOiBzdHJpbmcgfCB1bmRlZmluZWQsIHdvcmtpbmdEaXJlY3RvcmllczogcmVhZG9ubHkgVVJJW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIW1heU11dGF0ZUZpbGVzKGNvbW1hbmQpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHJvb3RzID0gZGlzdGluY3RQYXRocyhbXG5cdFx0XHQuLi4oY3dkID8gW2N3ZF0gOiBbXSksXG5cdFx0XHQuLi53b3JraW5nRGlyZWN0b3JpZXMubWFwKGRpcmVjdG9yeSA9PiBkaXJlY3RvcnkuZnNQYXRoKSxcblx0XHRdKTtcblx0XHRjb25zdCBiYXNlID0gY3dkID8/IHJvb3RzWzBdID8/IHByb2Nlc3MuY3dkKCk7XG5cdFx0Y29uc3QgY2FuZGlkYXRlcyA9IHNoZWxsQ29tbWFuZEZpbGVDYW5kaWRhdGVzKGNvbW1hbmQsIGJhc2UpO1xuXHRcdGNvbnN0IGJlZm9yZSA9IG5ldyBNYXA8c3RyaW5nLCBJU2hlbGxGaWxlU25hcHNob3Q+KCk7XG5cdFx0Zm9yIChjb25zdCBjYW5kaWRhdGUgb2YgY2FuZGlkYXRlcykge1xuXHRcdFx0YmVmb3JlLnNldChjYW5kaWRhdGUsIGF3YWl0IHJlYWRTaGVsbFNuYXBzaG90KGNhbmRpZGF0ZSkpO1xuXHRcdH1cblx0XHRsZXQgcmVtYWluaW5nRmlsZXMgPSBzaGVsbFNuYXBzaG90TWF4RmlsZXM7XG5cdFx0bGV0IHJlbWFpbmluZ0J5dGVzID0gc2hlbGxTbmFwc2hvdE1heFRvdGFsQnl0ZXM7XG5cdFx0Zm9yIChjb25zdCByb290IG9mIHJvb3RzKSB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzbmFwc2hvdERpcmVjdG9yeShyb290LCBiZWZvcmUsIHJlbWFpbmluZ0ZpbGVzLCByZW1haW5pbmdCeXRlcyk7XG5cdFx0XHRyZW1haW5pbmdGaWxlcyAtPSByZXN1bHQuZmlsZXM7XG5cdFx0XHRyZW1haW5pbmdCeXRlcyAtPSByZXN1bHQuYnl0ZXM7XG5cdFx0XHRpZiAocmVtYWluaW5nRmlsZXMgPD0gMCB8fCByZW1haW5pbmdCeXRlcyA8PSAwKSB7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH1cblx0XHR0aGlzLl9zaGVsbEl0ZW1zLnNldChpdGVtSWQsIHsgYmVmb3JlLCByb290cywgY2FuZGlkYXRlcyB9KTtcblx0fVxuXG5cdC8qKiBSZXR1cm5zIGZpbGUtZWRpdCByZXN1bHRzIGZvciB3cml0ZXMgcGVyZm9ybWVkIGJ5IGEgY29tcGxldGVkIHNoZWxsIGNvbW1hbmQuICovXG5cdGFzeW5jIGNvbXBsZXRlU2hlbGwodHVybklkOiBzdHJpbmcsIHRvb2xDYWxsSWQ6IHN0cmluZywgaXRlbUlkOiBzdHJpbmcpOiBQcm9taXNlPHJlYWRvbmx5IFRvb2xSZXN1bHRGaWxlRWRpdENvbnRlbnRbXT4ge1xuXHRcdGNvbnN0IG9ic2VydmVkID0gdGhpcy5fc2hlbGxJdGVtcy5nZXQoaXRlbUlkKTtcblx0XHR0aGlzLl9zaGVsbEl0ZW1zLmRlbGV0ZShpdGVtSWQpO1xuXHRcdGlmICghb2JzZXJ2ZWQpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdFx0Y29uc3QgYWZ0ZXIgPSBuZXcgTWFwPHN0cmluZywgSVNoZWxsRmlsZVNuYXBzaG90PigpO1xuXHRcdGZvciAoY29uc3QgY2FuZGlkYXRlIG9mIG9ic2VydmVkLmNhbmRpZGF0ZXMpIHtcblx0XHRcdGFmdGVyLnNldChjYW5kaWRhdGUsIGF3YWl0IHJlYWRTaGVsbFNuYXBzaG90KGNhbmRpZGF0ZSkpO1xuXHRcdH1cblx0XHRsZXQgcmVtYWluaW5nRmlsZXMgPSBzaGVsbFNuYXBzaG90TWF4RmlsZXM7XG5cdFx0bGV0IHJlbWFpbmluZ0J5dGVzID0gc2hlbGxTbmFwc2hvdE1heFRvdGFsQnl0ZXM7XG5cdFx0Zm9yIChjb25zdCByb290IG9mIG9ic2VydmVkLnJvb3RzKSB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzbmFwc2hvdERpcmVjdG9yeShyb290LCBhZnRlciwgcmVtYWluaW5nRmlsZXMsIHJlbWFpbmluZ0J5dGVzKTtcblx0XHRcdHJlbWFpbmluZ0ZpbGVzIC09IHJlc3VsdC5maWxlcztcblx0XHRcdHJlbWFpbmluZ0J5dGVzIC09IHJlc3VsdC5ieXRlcztcblx0XHRcdGlmIChyZW1haW5pbmdGaWxlcyA8PSAwIHx8IHJlbWFpbmluZ0J5dGVzIDw9IDApIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGNvbnN0IHBhdGhzID0gbmV3IFNldChbLi4ub2JzZXJ2ZWQuYmVmb3JlLmtleXMoKSwgLi4uYWZ0ZXIua2V5cygpXSk7XG5cdFx0Y29uc3QgZWRpdHM6IFRvb2xSZXN1bHRGaWxlRWRpdENvbnRlbnRbXSA9IFtdO1xuXHRcdGNvbnN0IG1pc3Npbmc6IElTaGVsbEZpbGVTbmFwc2hvdCA9IHsgZXhpc3RlZDogZmFsc2UsIGNvbnRlbnQ6ICcnLCBza2lwcGVkQ29udGVudDogZmFsc2UsIHNpemU6IDAsIG10aW1lTXM6IDAgfTtcblx0XHRmb3IgKGNvbnN0IHBhdGggb2YgcGF0aHMpIHtcblx0XHRcdGNvbnN0IGJlZm9yZSA9IG9ic2VydmVkLmJlZm9yZS5nZXQocGF0aCkgPz8gbWlzc2luZztcblx0XHRcdGNvbnN0IGN1cnJlbnQgPSBhZnRlci5nZXQocGF0aCkgPz8gbWlzc2luZztcblx0XHRcdGlmIChiZWZvcmUuc2tpcHBlZENvbnRlbnQgfHwgY3VycmVudC5za2lwcGVkQ29udGVudCkge1xuXHRcdFx0XHRpZiAoYmVmb3JlLmV4aXN0ZWQgPT09IGN1cnJlbnQuZXhpc3RlZCAmJiBiZWZvcmUuc2l6ZSA9PT0gY3VycmVudC5zaXplICYmIGJlZm9yZS5tdGltZU1zID09PSBjdXJyZW50Lm10aW1lTXMpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtDb2RleEZpbGVFZGl0T2JzZXJ2ZXJdIFJlZnVzaW5nIHNoZWxsIHByZXZpZXcgZm9yIGJpbmFyeSBvciBvdmVyc2l6ZWQgZmlsZSAke3BhdGh9YCk7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGJlZm9yZS5leGlzdGVkID09PSBjdXJyZW50LmV4aXN0ZWQgJiYgYmVmb3JlLmNvbnRlbnQgPT09IGN1cnJlbnQuY29udGVudCkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdHRyeSB7XG5cdFx0XHRcdGVkaXRzLnB1c2goYXdhaXQgdGhpcy5fdHJhY2tlci5zbmFwc2hvdEtub3duQ29udGVudHModHVybklkLCB0b29sQ2FsbElkLCBwYXRoLCBiZWZvcmUuY29udGVudCwgYmVmb3JlLmV4aXN0ZWQsIGN1cnJlbnQuY29udGVudCwgMSwge1xuXHRcdFx0XHRcdG9taXRCZWZvcmU6ICFiZWZvcmUuZXhpc3RlZCxcblx0XHRcdFx0XHRvbWl0QWZ0ZXI6ICFjdXJyZW50LmV4aXN0ZWQsXG5cdFx0XHRcdH0pKTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0NvZGV4RmlsZUVkaXRPYnNlcnZlcl0gRmFpbGVkIHRvIHNuYXBzaG90IHNoZWxsIGVkaXQgJHtwYXRofTogJHtlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFN0cmluZyhlcnJvcil9YCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBlZGl0cztcblx0fVxuXG5cdC8qKiBDYXB0dXJlcyBDb2RleCdzIGN1bXVsYXRpdmUgdHVybiBkaWZmLCBpbmNsdWRpbmcgZmlsZXMgd3JpdHRlbiBieSBzaGVsbCB0b29scy4gKi9cblx0YXN5bmMgc25hcHNob3RUdXJuRGlmZih0dXJuSWQ6IHN0cmluZywgdG9vbENhbGxJZDogc3RyaW5nLCB3b3JraW5nRGlyZWN0b3JpZXM6IHJlYWRvbmx5IFVSSVtdLCBkaWZmOiBzdHJpbmcpOiBQcm9taXNlPHJlYWRvbmx5IFRvb2xSZXN1bHRGaWxlRWRpdENvbnRlbnRbXT4ge1xuXHRcdGNvbnN0IGVkaXRzOiBUb29sUmVzdWx0RmlsZUVkaXRDb250ZW50W10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGZpbGUgb2YgcGFyc2VHaXRUdXJuRGlmZihkaWZmKSkge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgcGF0aCA9IGF3YWl0IHJlc29sdmVUdXJuRGlmZlBhdGgoZmlsZS5wYXRoLCBmaWxlLmFmdGVyRXhpc3RzLCB3b3JraW5nRGlyZWN0b3JpZXMsIGNhbmRpZGF0ZSA9PiB0aGlzLl9maWxlU2VydmljZS5leGlzdHMoVVJJLmZpbGUoY2FuZGlkYXRlKSkpO1xuXHRcdFx0XHRjb25zdCBhZnRlclRleHQgPSBmaWxlLmFmdGVyRXhpc3RzID8gYXdhaXQgdGhpcy5fcmVhZEZpbGUocGF0aCkgOiAnJztcblx0XHRcdFx0Y29uc3QgaW52ZXJ0ZWQgPSBmaWxlLmJlZm9yZUV4aXN0ZWQgPyBpbnZlcnRVbmlmaWVkRGlmZihmaWxlLnBhdGNoKSA6ICcnO1xuXHRcdFx0XHRjb25zdCBiZWZvcmVUZXh0ID0gZmlsZS5iZWZvcmVFeGlzdGVkID8gYXBwbHlVbmlmaWVkRGlmZihhZnRlclRleHQsIGludmVydGVkKSA6ICcnO1xuXHRcdFx0XHRpZiAoZmlsZS5iZWZvcmVFeGlzdGVkICYmIGJlZm9yZVRleHQgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0NvZGV4RmlsZUVkaXRPYnNlcnZlcl0gUmVmdXNpbmcgdHVybi1kaWZmIHByZXZpZXcgZm9yICR7ZmlsZS5wYXRofTogcmVjb25zdHJ1Y3RlZCBiZWZvcmUtc3RhdGUgZG9lcyBub3QgbWF0Y2ggdGhlIHBhdGNoYCk7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgcmV2aXNpb25LZXkgPSBgJHt0dXJuSWR9XFwwJHtwYXRofWA7XG5cdFx0XHRcdGNvbnN0IHJldmlzaW9uID0gKHRoaXMuX3R1cm5EaWZmUmV2aXNpb25zLmdldChyZXZpc2lvbktleSkgPz8gMCkgKyAxO1xuXHRcdFx0XHR0aGlzLl90dXJuRGlmZlJldmlzaW9ucy5zZXQocmV2aXNpb25LZXksIHJldmlzaW9uKTtcblx0XHRcdFx0ZWRpdHMucHVzaChhd2FpdCB0aGlzLl90cmFja2VyLnNuYXBzaG90S25vd25Db250ZW50cyh0dXJuSWQsIHRvb2xDYWxsSWQsIHBhdGgsIGJlZm9yZVRleHQgPz8gJycsIGZpbGUuYmVmb3JlRXhpc3RlZCwgYWZ0ZXJUZXh0LCByZXZpc2lvbiwge1xuXHRcdFx0XHRcdG9taXRCZWZvcmU6ICFmaWxlLmJlZm9yZUV4aXN0ZWQsXG5cdFx0XHRcdFx0b21pdEFmdGVyOiAhZmlsZS5hZnRlckV4aXN0cyxcblx0XHRcdFx0fSkpO1xuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQ29kZXhGaWxlRWRpdE9ic2VydmVyXSBGYWlsZWQgdG8gc25hcHNob3QgdHVybiBkaWZmIGZvciAke2ZpbGUucGF0aH06ICR7ZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBTdHJpbmcoZXJyb3IpfWApO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gZWRpdHM7XG5cdH1cblxuXHRjbGVhclR1cm5EaWZmKHR1cm5JZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBrZXkgb2YgdGhpcy5fdHVybkRpZmZSZXZpc2lvbnMua2V5cygpKSB7XG5cdFx0XHRpZiAoa2V5LnN0YXJ0c1dpdGgoYCR7dHVybklkfVxcMGApKSB7XG5cdFx0XHRcdHRoaXMuX3R1cm5EaWZmUmV2aXNpb25zLmRlbGV0ZShrZXkpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBIb3N0IGB3cml0ZV9maWxlYCBkb2VzIG5vdCBzdHJlYW0gYGZpbGVDaGFuZ2UvcGF0Y2hVcGRhdGVkYC4gU25hcHNob3QgdGhlXG5cdCAqIGN1cnJlbnQgb24tZGlzayBieXRlcywgcGVyc2lzdCB0aGUgY29tcGxldGUgYWZ0ZXItY29udGVudCwgdGhlbiB3cml0ZSB0aGVcblx0ICogd29ya3NwYWNlIGZpbGUuIExpdmUgQ29kZXggRWRpdCBwbGF5cyBDbGluZSdzIGxvY2FsIHN3ZWVwIGZyb20gdGhhdCBwYWlyO1xuXHQgKiBkcmlwcGluZyBwcmVmaXhlcyBoZXJlIHdvdWxkIGFib3J0IHRoYXQgc3dlZXAuXG5cdCAqL1xuXHRhc3luYyBiZWdpbkRpcmVjdFdyaXRlKGl0ZW1JZDogc3RyaW5nLCBmaWxlUGF0aDogc3RyaW5nLCBjb250ZW50czogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5fZGlyZWN0V3JpdGVzLnNldChpdGVtSWQsIHsgcGF0aDogZmlsZVBhdGgsIGNvbnRlbnRzIH0pO1xuXHRcdGF3YWl0IHRoaXMuX3RyYWNrZXIudHJhY2tFZGl0U3RhcnQoZmlsZVBhdGgpO1xuXHR9XG5cblx0YXN5bmMgc25hcHNob3REaXJlY3RXcml0ZSh0dXJuSWQ6IHN0cmluZywgdG9vbENhbGxJZDogc3RyaW5nLCBpdGVtSWQ6IHN0cmluZywgYWZ0ZXJDb250ZW50Pzogc3RyaW5nKTogUHJvbWlzZTxUb29sUmVzdWx0RmlsZUVkaXRDb250ZW50IHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3Qgd3JpdGUgPSB0aGlzLl9kaXJlY3RXcml0ZXMuZ2V0KGl0ZW1JZCk7XG5cdFx0aWYgKCF3cml0ZSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0dHJ5IHtcblx0XHRcdHJldHVybiBhd2FpdCB0aGlzLl90cmFja2VyLnNuYXBzaG90RWRpdENvbnRlbnQodHVybklkLCB0b29sQ2FsbElkLCB3cml0ZS5wYXRoLCBhZnRlckNvbnRlbnQgPz8gd3JpdGUuY29udGVudHMpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtDb2RleEZpbGVFZGl0T2JzZXJ2ZXJdIEZhaWxlZCB0byBzbmFwc2hvdCB3cml0ZV9maWxlICR7d3JpdGUucGF0aH06ICR7ZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBTdHJpbmcoZXJyb3IpfWApO1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBjb21wbGV0ZURpcmVjdFdyaXRlKHR1cm5JZDogc3RyaW5nLCB0b29sQ2FsbElkOiBzdHJpbmcsIGl0ZW1JZDogc3RyaW5nLCBtb2RlbElkOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBQcm9taXNlPHJlYWRvbmx5IFRvb2xSZXN1bHRGaWxlRWRpdENvbnRlbnRbXT4ge1xuXHRcdGNvbnN0IHdyaXRlID0gdGhpcy5fZGlyZWN0V3JpdGVzLmdldChpdGVtSWQpO1xuXHRcdHRoaXMuX2RpcmVjdFdyaXRlcy5kZWxldGUoaXRlbUlkKTtcblx0XHRpZiAoIXdyaXRlKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCB0aGlzLl90cmFja2VyLmNvbXBsZXRlRWRpdCh3cml0ZS5wYXRoKTtcblx0XHRcdGNvbnN0IGVkaXQgPSBhd2FpdCB0aGlzLl90cmFja2VyLnRha2VDb21wbGV0ZWRFZGl0KHR1cm5JZCwgdG9vbENhbGxJZCwgd3JpdGUucGF0aCwgJ3dyaXRlX2ZpbGUnLCB7IHBhdGg6IHdyaXRlLnBhdGgsIGNvbnRlbnRzOiB3cml0ZS5jb250ZW50cyB9LCBtb2RlbElkKTtcblx0XHRcdHJldHVybiBlZGl0ID8gW2VkaXRdIDogW107XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0NvZGV4RmlsZUVkaXRPYnNlcnZlcl0gRmFpbGVkIHRvIGNvbXBsZXRlIHdyaXRlX2ZpbGUgJHt3cml0ZS5wYXRofTogJHtlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFN0cmluZyhlcnJvcil9YCk7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHR9XG5cblx0YWJhbmRvbkRpcmVjdFdyaXRlKGl0ZW1JZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3Qgd3JpdGUgPSB0aGlzLl9kaXJlY3RXcml0ZXMuZ2V0KGl0ZW1JZCk7XG5cdFx0dGhpcy5fZGlyZWN0V3JpdGVzLmRlbGV0ZShpdGVtSWQpO1xuXHRcdGlmICh3cml0ZSkge1xuXHRcdFx0dGhpcy5fdHJhY2tlci5hYmFuZG9uRWRpdCh3cml0ZS5wYXRoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9lbnN1cmVGaWxlKGl0ZW1JZDogc3RyaW5nLCB3b3JraW5nRGlyZWN0b3J5OiBVUkkgfCB1bmRlZmluZWQsIGZpbGVQYXRoOiBzdHJpbmcsIGNoYW5nZT86IEZpbGVVcGRhdGVDaGFuZ2UpOiBJT2JzZXJ2ZWRGaWxlRWRpdCB7XG5cdFx0bGV0IGl0ZW0gPSB0aGlzLl9pdGVtcy5nZXQoaXRlbUlkKTtcblx0XHRpZiAoIWl0ZW0pIHtcblx0XHRcdGl0ZW0gPSBuZXcgTWFwKCk7XG5cdFx0XHR0aGlzLl9pdGVtcy5zZXQoaXRlbUlkLCBpdGVtKTtcblx0XHR9XG5cdFx0Y29uc3QgcGF0aCA9IGlzQWJzb2x1dGUoZmlsZVBhdGgpID8gZmlsZVBhdGggOiByZXNvbHZlKHdvcmtpbmdEaXJlY3Rvcnk/LmZzUGF0aCA/PyBwcm9jZXNzLmN3ZCgpLCBmaWxlUGF0aCk7XG5cdFx0Y29uc3QgbW92ZVBhdGggPSBjaGFuZ2U/LmtpbmQudHlwZSA9PT0gJ3VwZGF0ZScgPyBjaGFuZ2Uua2luZC5tb3ZlX3BhdGggPz8gdW5kZWZpbmVkIDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGFmdGVyUGF0aCA9IG1vdmVQYXRoXG5cdFx0XHQ/IChpc0Fic29sdXRlKG1vdmVQYXRoKSA/IG1vdmVQYXRoIDogcmVzb2x2ZSh3b3JraW5nRGlyZWN0b3J5Py5mc1BhdGggPz8gcHJvY2Vzcy5jd2QoKSwgbW92ZVBhdGgpKVxuXHRcdFx0OiB1bmRlZmluZWQ7XG5cdFx0Y29uc3Qgb21pdEJlZm9yZSA9IGNoYW5nZT8ua2luZC50eXBlID09PSAnYWRkJztcblx0XHRjb25zdCBvbWl0QWZ0ZXIgPSBjaGFuZ2U/LmtpbmQudHlwZSA9PT0gJ2RlbGV0ZSc7XG5cdFx0bGV0IG9ic2VydmVkID0gaXRlbS5nZXQocGF0aCk7XG5cdFx0aWYgKCFvYnNlcnZlZCkge1xuXHRcdFx0b2JzZXJ2ZWQgPSB7XG5cdFx0XHRcdHBhdGgsXG5cdFx0XHRcdGFmdGVyUGF0aCxcblx0XHRcdFx0b21pdEJlZm9yZSxcblx0XHRcdFx0b21pdEFmdGVyLFxuXHRcdFx0XHRiZWZvcmVUZXh0OiB0aGlzLl9yZWFkRmlsZShwYXRoKSxcblx0XHRcdFx0c3RhcnQ6IHRoaXMuX3RyYWNrZXIudHJhY2tFZGl0U3RhcnQocGF0aCksXG5cdFx0XHR9O1xuXHRcdFx0aXRlbS5zZXQocGF0aCwgb2JzZXJ2ZWQpO1xuXHRcdH0gZWxzZSBpZiAoY2hhbmdlKSB7XG5cdFx0XHRvYnNlcnZlZC5hZnRlclBhdGggPSBhZnRlclBhdGggPz8gb2JzZXJ2ZWQuYWZ0ZXJQYXRoO1xuXHRcdFx0b2JzZXJ2ZWQub21pdEJlZm9yZSA9IG9taXRCZWZvcmU7XG5cdFx0XHRvYnNlcnZlZC5vbWl0QWZ0ZXIgPSBvbWl0QWZ0ZXI7XG5cdFx0fVxuXHRcdHJldHVybiBvYnNlcnZlZDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3JlYWRGaWxlKHBhdGg6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0dHJ5IHtcblx0XHRcdHJldHVybiAoYXdhaXQgdGhpcy5fZmlsZVNlcnZpY2UucmVhZEZpbGUoVVJJLmZpbGUocGF0aCkpKS52YWx1ZS50b1N0cmluZygpO1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0cmV0dXJuICcnO1xuXHRcdH1cblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5faXRlbXMuY2xlYXIoKTtcblx0XHR0aGlzLl9zaGVsbEl0ZW1zLmNsZWFyKCk7XG5cdFx0dGhpcy5fZGlyZWN0V3JpdGVzLmNsZWFyKCk7XG5cdFx0dGhpcy5fdHVybkRpZmZSZXZpc2lvbnMuY2xlYXIoKTtcblx0XHR0aGlzLl9kYXRhYmFzZS5kaXNwb3NlKCk7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIG1heU11dGF0ZUZpbGVzKGNvbW1hbmQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gLyg/OmFwcGx5X3BhdGNofHdyaXRlYWxsKD86dGV4dHxsaW5lcyl8c2V0LWNvbnRlbnR8YWRkLWNvbnRlbnR8b3V0LWZpbGV8bmV3LWl0ZW18cmVtb3ZlLWl0ZW18cmVuYW1lLWl0ZW18bW92ZS1pdGVtfGNvcHktaXRlbXxcXGIoPzpybXxtdnxjcHx0b3VjaHxta2Rpcnx0ZWV8c2VkfHBlcmwpXFxifCg/Ol58W14+XSk+ezEsMn0oPyE9KXx3cml0ZUZpbGV8YXBwZW5kRmlsZXxyZW5hbWVcXCh8dW5saW5rXFwofG1rZGlyXFwofHNodXRpbFxcLnxwYXRobGliXFwuKS9pLnRlc3QoY29tbWFuZCk7XG59XG5cbi8qKiBCZXN0LWVmZm9ydCBleHRyYWN0aW9uIG9mIHRleHQtZmlsZSBwYXRocyBlbWJlZGRlZCBpbiBhIHNoZWxsIGNvbW1hbmQuICovXG5leHBvcnQgZnVuY3Rpb24gc2hlbGxDb21tYW5kRmlsZUNhbmRpZGF0ZXMoY29tbWFuZDogc3RyaW5nLCBjd2Q6IHN0cmluZyk6IHJlYWRvbmx5IHN0cmluZ1tdIHtcblx0Y29uc3QgdmFsdWVzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdGNvbnN0IHBhdHRlcm5zID0gW1xuXHRcdC9bQS1aYS16XTpbXFxcXC9dW14nXCJgXFxyXFxuO3w8Pl0rL2csXG5cdFx0L1xcLlxcLj9bXFxcXC9dW14nXCJgXFxyXFxuO3w8PiksXSsvZyxcblx0XHQvKD86W1xcd0AoKS4tXStbXFxcXC9dKStbXFx3QCgpLi1dK1xcLltBLVphLXowLTlfLV17MSwxNn0vZyxcblx0XTtcblx0Zm9yIChjb25zdCBwYXR0ZXJuIG9mIHBhdHRlcm5zKSB7XG5cdFx0Zm9yIChjb25zdCBtYXRjaCBvZiBjb21tYW5kLm1hdGNoQWxsKHBhdHRlcm4pKSB7XG5cdFx0XHRsZXQgdmFsdWUgPSBtYXRjaFswXS50cmltKCkucmVwbGFjZSgvWyksXFxdfV0rJC8sICcnKS50cmltKCk7XG5cdFx0XHRpZiAoIXZhbHVlIHx8IHZhbHVlLmluY2x1ZGVzKCckJykgfHwgdmFsdWUuaW5jbHVkZXMoJyonKSB8fCB2YWx1ZS5pbmNsdWRlcygnPycpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0dmFsdWUgPSBpc0Fic29sdXRlKHZhbHVlKSA/IHZhbHVlIDogcmVzb2x2ZShjd2QsIHZhbHVlKTtcblx0XHRcdHZhbHVlcy5hZGQodmFsdWUpO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gWy4uLnZhbHVlc107XG59XG5cbmZ1bmN0aW9uIGRpc3RpbmN0UGF0aHMocGF0aHM6IHJlYWRvbmx5IHN0cmluZ1tdKTogc3RyaW5nW10ge1xuXHRyZXR1cm4gWy4uLm5ldyBTZXQocGF0aHMubWFwKHBhdGggPT4gcmVzb2x2ZShwYXRoKSkpXTtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHJlYWRTaGVsbFNuYXBzaG90KHBhdGg6IHN0cmluZyk6IFByb21pc2U8SVNoZWxsRmlsZVNuYXBzaG90PiB7XG5cdHRyeSB7XG5cdFx0Y29uc3Qgc3RhdCA9IGF3YWl0IGZzLnN0YXQocGF0aCk7XG5cdFx0aWYgKCFzdGF0LmlzRmlsZSgpKSB7XG5cdFx0XHRyZXR1cm4geyBleGlzdGVkOiBmYWxzZSwgY29udGVudDogJycsIHNraXBwZWRDb250ZW50OiBmYWxzZSwgc2l6ZTogMCwgbXRpbWVNczogMCB9O1xuXHRcdH1cblx0XHRpZiAoc3RhdC5zaXplID4gc2hlbGxTbmFwc2hvdE1heEZpbGVCeXRlcykge1xuXHRcdFx0cmV0dXJuIHsgZXhpc3RlZDogdHJ1ZSwgY29udGVudDogJycsIHNraXBwZWRDb250ZW50OiB0cnVlLCBzaXplOiBzdGF0LnNpemUsIG10aW1lTXM6IHN0YXQubXRpbWVNcyB9O1xuXHRcdH1cblx0XHRjb25zdCBidWZmZXIgPSBhd2FpdCBmcy5yZWFkRmlsZShwYXRoKTtcblx0XHRpZiAoYnVmZmVyLmluY2x1ZGVzKDApKSB7XG5cdFx0XHRyZXR1cm4geyBleGlzdGVkOiB0cnVlLCBjb250ZW50OiAnJywgc2tpcHBlZENvbnRlbnQ6IHRydWUsIHNpemU6IHN0YXQuc2l6ZSwgbXRpbWVNczogc3RhdC5tdGltZU1zIH07XG5cdFx0fVxuXHRcdHJldHVybiB7IGV4aXN0ZWQ6IHRydWUsIGNvbnRlbnQ6IGJ1ZmZlci50b1N0cmluZygndXRmOCcpLCBza2lwcGVkQ29udGVudDogZmFsc2UsIHNpemU6IHN0YXQuc2l6ZSwgbXRpbWVNczogc3RhdC5tdGltZU1zIH07XG5cdH0gY2F0Y2gge1xuXHRcdHJldHVybiB7IGV4aXN0ZWQ6IGZhbHNlLCBjb250ZW50OiAnJywgc2tpcHBlZENvbnRlbnQ6IGZhbHNlLCBzaXplOiAwLCBtdGltZU1zOiAwIH07XG5cdH1cbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHNuYXBzaG90RGlyZWN0b3J5KHJvb3Q6IHN0cmluZywgc25hcHNob3RzOiBNYXA8c3RyaW5nLCBJU2hlbGxGaWxlU25hcHNob3Q+LCBtYXhGaWxlczogbnVtYmVyLCBtYXhCeXRlczogbnVtYmVyKTogUHJvbWlzZTx7IGZpbGVzOiBudW1iZXI7IGJ5dGVzOiBudW1iZXIgfT4ge1xuXHRsZXQgZmlsZXMgPSAwO1xuXHRsZXQgYnl0ZXMgPSAwO1xuXHRjb25zdCBwZW5kaW5nID0gW3Jvb3RdO1xuXHR3aGlsZSAocGVuZGluZy5sZW5ndGggPiAwICYmIGZpbGVzIDwgbWF4RmlsZXMgJiYgYnl0ZXMgPCBtYXhCeXRlcykge1xuXHRcdGNvbnN0IGRpcmVjdG9yeSA9IHBlbmRpbmcucG9wKCkhO1xuXHRcdGxldCBlbnRyaWVzOiBpbXBvcnQoJ2ZzJykuRGlyZW50W107XG5cdFx0dHJ5IHtcblx0XHRcdGVudHJpZXMgPSBhd2FpdCBmcy5yZWFkZGlyKGRpcmVjdG9yeSwgeyB3aXRoRmlsZVR5cGVzOiB0cnVlIH0pO1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXHRcdGZvciAoY29uc3QgZW50cnkgb2YgZW50cmllcykge1xuXHRcdFx0aWYgKGZpbGVzID49IG1heEZpbGVzIHx8IGJ5dGVzID49IG1heEJ5dGVzKSB7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcGF0aCA9IHJlc29sdmUoZGlyZWN0b3J5LCBlbnRyeS5uYW1lKTtcblx0XHRcdGlmIChlbnRyeS5pc0RpcmVjdG9yeSgpKSB7XG5cdFx0XHRcdGlmICghc2hlbGxTbmFwc2hvdElnbm9yZWREaXJlY3Rvcmllcy5oYXMoZW50cnkubmFtZS50b0xvd2VyQ2FzZSgpKSkge1xuXHRcdFx0XHRcdHBlbmRpbmcucHVzaChwYXRoKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGlmICghZW50cnkuaXNGaWxlKCkgfHwgc25hcHNob3RzLmhhcyhwYXRoKSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHNuYXBzaG90ID0gYXdhaXQgcmVhZFNoZWxsU25hcHNob3QocGF0aCk7XG5cdFx0XHRpZiAoIXNuYXBzaG90LmV4aXN0ZWQpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAoc25hcHNob3Quc2tpcHBlZENvbnRlbnQpIHtcblx0XHRcdFx0c25hcHNob3RzLnNldChwYXRoLCBzbmFwc2hvdCk7XG5cdFx0XHRcdGZpbGVzKys7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3Qgc2l6ZSA9IHNuYXBzaG90LnNpemUgfHwgQnVmZmVyLmJ5dGVMZW5ndGgoc25hcHNob3QuY29udGVudCwgJ3V0ZjgnKTtcblx0XHRcdGlmIChieXRlcyArIHNpemUgPiBtYXhCeXRlcykge1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdHNuYXBzaG90cy5zZXQocGF0aCwgc25hcHNob3QpO1xuXHRcdFx0ZmlsZXMrKztcblx0XHRcdGJ5dGVzICs9IHNpemU7XG5cdFx0fVxuXHR9XG5cdHJldHVybiB7IGZpbGVzLCBieXRlcyB9O1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcmVzb2x2ZVR1cm5EaWZmUGF0aChcblx0cmVsYXRpdmVQYXRoOiBzdHJpbmcsXG5cdGFmdGVyRXhpc3RzOiBib29sZWFuLFxuXHR3b3JraW5nRGlyZWN0b3JpZXM6IHJlYWRvbmx5IFVSSVtdLFxuXHRleGlzdHM6IChjYW5kaWRhdGU6IHN0cmluZykgPT4gUHJvbWlzZTxib29sZWFuPixcbik6IFByb21pc2U8c3RyaW5nPiB7XG5cdGNvbnN0IHJvb3RzID0gd29ya2luZ0RpcmVjdG9yaWVzLmxlbmd0aCA+IDAgPyB3b3JraW5nRGlyZWN0b3JpZXMgOiBbVVJJLmZpbGUocHJvY2Vzcy5jd2QoKSldO1xuXHRmb3IgKGNvbnN0IHJvb3Qgb2Ygcm9vdHMpIHtcblx0XHRjb25zdCByb290TmFtZSA9IGJhc2VuYW1lKHJvb3QuZnNQYXRoKTtcblx0XHRjb25zdCByZWxhdGl2ZVRvUm9vdCA9IHJlbGF0aXZlUGF0aC5zdGFydHNXaXRoKGAke3Jvb3ROYW1lfS9gKSA/IHJlbGF0aXZlUGF0aC5zbGljZShyb290TmFtZS5sZW5ndGggKyAxKSA6IHJlbGF0aXZlUGF0aDtcblx0XHRjb25zdCBjYW5kaWRhdGUgPSByZXNvbHZlKHJvb3QuZnNQYXRoLCByZWxhdGl2ZVRvUm9vdCk7XG5cdFx0aWYgKCFhZnRlckV4aXN0cyB8fCBhd2FpdCBleGlzdHMoY2FuZGlkYXRlKSkge1xuXHRcdFx0cmV0dXJuIGNhbmRpZGF0ZTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIHJlc29sdmUocm9vdHNbMF0uZnNQYXRoLCByZWxhdGl2ZVBhdGgpO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElDb2RleFR1cm5EaWZmRmlsZSB7XG5cdHJlYWRvbmx5IHBhdGg6IHN0cmluZztcblx0cmVhZG9ubHkgYmVmb3JlRXhpc3RlZDogYm9vbGVhbjtcblx0cmVhZG9ubHkgYWZ0ZXJFeGlzdHM6IGJvb2xlYW47XG5cdHJlYWRvbmx5IHBhdGNoOiBzdHJpbmc7XG59XG5cbi8qKiBTcGxpdHMgdGhlIGN1bXVsYXRpdmUgZ2l0LXN0eWxlIGRpZmYgcHVibGlzaGVkIGJ5IGB0dXJuL2RpZmYvdXBkYXRlZGAuICovXG5leHBvcnQgZnVuY3Rpb24gcGFyc2VHaXRUdXJuRGlmZihkaWZmOiBzdHJpbmcpOiByZWFkb25seSBJQ29kZXhUdXJuRGlmZkZpbGVbXSB7XG5cdGNvbnN0IHN0YXJ0czogbnVtYmVyW10gPSBbXTtcblx0Y29uc3QgcGF0dGVybiA9IC9eZGlmZiAtLWdpdCAvZ207XG5cdGZvciAobGV0IG1hdGNoID0gcGF0dGVybi5leGVjKGRpZmYpOyBtYXRjaDsgbWF0Y2ggPSBwYXR0ZXJuLmV4ZWMoZGlmZikpIHtcblx0XHRzdGFydHMucHVzaChtYXRjaC5pbmRleCk7XG5cdH1cblx0Y29uc3QgZmlsZXM6IElDb2RleFR1cm5EaWZmRmlsZVtdID0gW107XG5cdGZvciAobGV0IGluZGV4ID0gMDsgaW5kZXggPCBzdGFydHMubGVuZ3RoOyBpbmRleCsrKSB7XG5cdFx0Y29uc3Qgc2VjdGlvbiA9IGRpZmYuc2xpY2Uoc3RhcnRzW2luZGV4XSwgc3RhcnRzW2luZGV4ICsgMV0gPz8gZGlmZi5sZW5ndGgpO1xuXHRcdGNvbnN0IGJlZm9yZU1hcmtlciA9IC9eLS0tICguKykkL20uZXhlYyhzZWN0aW9uKT8uWzFdO1xuXHRcdGNvbnN0IGFmdGVyTWFya2VyID0gL15cXCtcXCtcXCsgKC4rKSQvbS5leGVjKHNlY3Rpb24pPy5bMV07XG5cdFx0aWYgKCFiZWZvcmVNYXJrZXIgfHwgIWFmdGVyTWFya2VyKSB7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cdFx0Y29uc3QgYmVmb3JlUGF0aCA9IG5vcm1hbGl6ZUdpdERpZmZQYXRoKGJlZm9yZU1hcmtlcik7XG5cdFx0Y29uc3QgYWZ0ZXJQYXRoID0gbm9ybWFsaXplR2l0RGlmZlBhdGgoYWZ0ZXJNYXJrZXIpO1xuXHRcdGNvbnN0IGJlZm9yZUV4aXN0ZWQgPSBiZWZvcmVQYXRoICE9PSB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgYWZ0ZXJFeGlzdHMgPSBhZnRlclBhdGggIT09IHVuZGVmaW5lZDtcblx0XHRjb25zdCBwYXRoID0gYWZ0ZXJQYXRoID8/IGJlZm9yZVBhdGg7XG5cdFx0aWYgKHBhdGgpIHtcblx0XHRcdGZpbGVzLnB1c2goeyBwYXRoLCBiZWZvcmVFeGlzdGVkLCBhZnRlckV4aXN0cywgcGF0Y2g6IHNlY3Rpb24gfSk7XG5cdFx0fVxuXHR9XG5cdHJldHVybiBmaWxlcztcbn1cblxuZnVuY3Rpb24gbm9ybWFsaXplR2l0RGlmZlBhdGgobWFya2VyOiBzdHJpbmcpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRjb25zdCB2YWx1ZSA9IG1hcmtlci5zcGxpdCgnXFx0JywgMSlbMF0udHJpbSgpO1xuXHRpZiAodmFsdWUgPT09ICcvZGV2L251bGwnKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRjb25zdCB1bnF1b3RlZCA9IHZhbHVlLnN0YXJ0c1dpdGgoJ1wiJykgJiYgdmFsdWUuZW5kc1dpdGgoJ1wiJylcblx0XHQ/IHZhbHVlLnNsaWNlKDEsIC0xKS5yZXBsYWNlKC9cXFxcXCIvZywgJ1wiJykucmVwbGFjZSgvXFxcXFxcXFwvZywgJ1xcXFwnKVxuXHRcdDogdmFsdWU7XG5cdHJldHVybiB1bnF1b3RlZC5yZXBsYWNlKC9eW2FiXVxcLy8sICcnKTtcbn1cblxuLyoqIFJldmVyc2VzIHVuaWZpZWQgaHVua3Mgc28gdGhleSBjYW4gYmUgYXBwbGllZCB0byB0aGUgb24tZGlzayBhZnRlci1zdGF0ZS4gKi9cbmV4cG9ydCBmdW5jdGlvbiBpbnZlcnRVbmlmaWVkRGlmZihkaWZmOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRjb25zdCByZXN1bHQ6IHN0cmluZ1tdID0gW107XG5cdGxldCBpbkh1bmsgPSBmYWxzZTtcblx0Zm9yIChjb25zdCBsaW5lIG9mIGRpZmYuc3BsaXQoJ1xcbicpKSB7XG5cdFx0Y29uc3QgaGVhZGVyID0gL15AQCAtKFxcZCspKCxcXGQrKT8gXFwrKFxcZCspKCxcXGQrKT8gQEAoLiopJC8uZXhlYyhsaW5lKTtcblx0XHRpZiAoaGVhZGVyKSB7XG5cdFx0XHRpbkh1bmsgPSB0cnVlO1xuXHRcdFx0cmVzdWx0LnB1c2goYEBAIC0ke2hlYWRlclszXX0ke2hlYWRlcls0XSA/PyAnJ30gKyR7aGVhZGVyWzFdfSR7aGVhZGVyWzJdID8/ICcnfSBAQCR7aGVhZGVyWzVdfWApO1xuXHRcdH0gZWxzZSBpZiAoaW5IdW5rICYmIGxpbmUuc3RhcnRzV2l0aCgnKycpKSB7XG5cdFx0XHRyZXN1bHQucHVzaChgLSR7bGluZS5zbGljZSgxKX1gKTtcblx0XHR9IGVsc2UgaWYgKGluSHVuayAmJiBsaW5lLnN0YXJ0c1dpdGgoJy0nKSkge1xuXHRcdFx0cmVzdWx0LnB1c2goYCske2xpbmUuc2xpY2UoMSl9YCk7XG5cdFx0fSBlbHNlIGlmIChpbkh1bmspIHtcblx0XHRcdHJlc3VsdC5wdXNoKGxpbmUpO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gcmVzdWx0LmpvaW4oJ1xcbicpO1xufVxuXG4vKiogQnVpbGQgdGhlIHJpZ2h0LWhhbmQgZGlmZiBjb250ZW50IHdpdGhvdXQgd3JpdGluZyB0byB0aGUgd29ya3NwYWNlLiBGYWlscyBjbG9zZWQgb24gYSBtaXNtYXRjaGVkIHBhdGNoLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHByZXZpZXdGaWxlQ2hhbmdlKGJlZm9yZVRleHQ6IHN0cmluZywgY2hhbmdlOiBGaWxlVXBkYXRlQ2hhbmdlKTogSUZpbGVDaGFuZ2VQcmV2aWV3IHtcblx0c3dpdGNoIChjaGFuZ2Uua2luZC50eXBlKSB7XG5cdFx0Y2FzZSAnYWRkJzpcblx0XHRcdHJldHVybiB7IG9rOiB0cnVlLCBhZnRlcjogY2hhbmdlLmRpZmYsIG9taXRCZWZvcmU6IHRydWUsIG9taXRBZnRlcjogZmFsc2UgfTtcblx0XHRjYXNlICdkZWxldGUnOlxuXHRcdFx0cmV0dXJuIHsgb2s6IHRydWUsIGFmdGVyOiAnJywgb21pdEJlZm9yZTogZmFsc2UsIG9taXRBZnRlcjogdHJ1ZSB9O1xuXHRcdGNhc2UgJ3VwZGF0ZSc6IHtcblx0XHRcdGNvbnN0IGFmdGVyID0gYXBwbHlVbmlmaWVkRGlmZihiZWZvcmVUZXh0LCBzdHJpcE1vdmVUcmFpbGVyKGNoYW5nZS5kaWZmLCBjaGFuZ2Uua2luZC5tb3ZlX3BhdGgpKTtcblx0XHRcdGlmIChhZnRlciA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHJldHVybiB7IG9rOiBmYWxzZSwgcmVhc29uOiBMSVZFX1BSRVZJRVdfVU5BVkFJTEFCTEVfTUVTU0FHRSB9O1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0b2s6IHRydWUsXG5cdFx0XHRcdGFmdGVyLFxuXHRcdFx0XHRhZnRlclBhdGg6IGNoYW5nZS5raW5kLm1vdmVfcGF0aCA/PyB1bmRlZmluZWQsXG5cdFx0XHRcdG9taXRCZWZvcmU6IGZhbHNlLFxuXHRcdFx0XHRvbWl0QWZ0ZXI6IGZhbHNlLFxuXHRcdFx0fTtcblx0XHR9XG5cdH1cbn1cblxuZnVuY3Rpb24gc3RyaXBNb3ZlVHJhaWxlcihkaWZmOiBzdHJpbmcsIG1vdmVQYXRoOiBzdHJpbmcgfCBudWxsKTogc3RyaW5nIHtcblx0aWYgKCFtb3ZlUGF0aCkge1xuXHRcdHJldHVybiBkaWZmO1xuXHR9XG5cdGNvbnN0IHRyYWlsZXIgPSBgXFxuXFxuTW92ZWQgdG86ICR7bW92ZVBhdGh9YDtcblx0cmV0dXJuIGRpZmYuZW5kc1dpdGgodHJhaWxlcikgPyBkaWZmLnNsaWNlKDAsIC10cmFpbGVyLmxlbmd0aCkgOiBkaWZmO1xufVxuXG5mdW5jdGlvbiBzcGxpdFBhdGNoTGluZXModGV4dDogc3RyaW5nKTogc3RyaW5nW10ge1xuXHRpZiAodGV4dCA9PT0gJycpIHtcblx0XHRyZXR1cm4gW107XG5cdH1cblx0Y29uc3QgZW5kc1dpdGhOZXdsaW5lID0gdGV4dC5lbmRzV2l0aCgnXFxuJyk7XG5cdGNvbnN0IGxpbmVzID0gdGV4dC5zcGxpdCgvXFxyP1xcbi8pO1xuXHRpZiAoZW5kc1dpdGhOZXdsaW5lKSB7XG5cdFx0bGluZXMucG9wKCk7XG5cdH1cblx0cmV0dXJuIGxpbmVzO1xufVxuXG5mdW5jdGlvbiBzdHJpcENhcnJpYWdlUmV0dXJuKHZhbHVlOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRyZXR1cm4gdmFsdWUuZW5kc1dpdGgoJ1xccicpID8gdmFsdWUuc2xpY2UoMCwgLTEpIDogdmFsdWU7XG59XG5cbi8qKlxuICogQXBwbGllcyB0aGUgaHVuayBmb3JtIGVtaXR0ZWQgYnkgQ29kZXgncyBgRmlsZVVwZGF0ZUNoYW5nZS5kaWZmYC5cbiAqIENvbnRleHQgYW5kIGRlbGV0ZWQgbGluZXMgbXVzdCBtYXRjaCB0aGUgYmFzZWxpbmU7IGFueSBtaXNtYXRjaCByZXR1cm5zIGB1bmRlZmluZWRgXG4gKiBpbnN0ZWFkIG9mIGEgZ3Vlc3NlZCBhZnRlci1zdGF0ZS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGFwcGx5VW5pZmllZERpZmYob3JpZ2luYWw6IHN0cmluZywgZGlmZjogc3RyaW5nKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgbmV3bGluZSA9IG9yaWdpbmFsLmluY2x1ZGVzKCdcXHJcXG4nKSA/ICdcXHJcXG4nIDogJ1xcbic7XG5cdGNvbnN0IG9yaWdpbmFsRW5kc1dpdGhOZXdsaW5lID0gb3JpZ2luYWwuZW5kc1dpdGgoJ1xcbicpO1xuXHRjb25zdCBvcmlnaW5hbExpbmVzID0gc3BsaXRQYXRjaExpbmVzKG9yaWdpbmFsKTtcblx0Y29uc3QgZGlmZkxpbmVzID0gZGlmZi5zcGxpdCgnXFxuJyk7XG5cdGNvbnN0IHJlc3VsdDogc3RyaW5nW10gPSBbXTtcblx0bGV0IG9yaWdpbmFsSW5kZXggPSAwO1xuXHRsZXQgc2F3SHVuayA9IGZhbHNlO1xuXHRsZXQgYWZ0ZXJFbmRzV2l0aE5ld2xpbmUgPSBvcmlnaW5hbEVuZHNXaXRoTmV3bGluZTtcblxuXHRjb25zdCBsaW5lRXF1YWxzID0gKGFjdHVhbDogc3RyaW5nIHwgdW5kZWZpbmVkLCBleHBlY3RlZDogc3RyaW5nKTogYm9vbGVhbiA9PiB7XG5cdFx0cmV0dXJuIGFjdHVhbCAhPT0gdW5kZWZpbmVkICYmIHN0cmlwQ2FycmlhZ2VSZXR1cm4oYWN0dWFsKSA9PT0gc3RyaXBDYXJyaWFnZVJldHVybihleHBlY3RlZCk7XG5cdH07XG5cblx0Zm9yIChsZXQgaW5kZXggPSAwOyBpbmRleCA8IGRpZmZMaW5lcy5sZW5ndGg7IGluZGV4KyspIHtcblx0XHRjb25zdCBoZWFkZXIgPSAvXkBAIC0oXFxkKykoPzosKFxcZCspKT8gXFwrKFxcZCspKD86LChcXGQrKSk/IEBALy5leGVjKGRpZmZMaW5lc1tpbmRleF0pO1xuXHRcdGlmICghaGVhZGVyKSB7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cdFx0c2F3SHVuayA9IHRydWU7XG5cdFx0Y29uc3Qgb2xkU3RhcnQgPSBOdW1iZXIoaGVhZGVyWzFdKTtcblx0XHRjb25zdCBvbGRDb3VudCA9IGhlYWRlclsyXSAhPT0gdW5kZWZpbmVkID8gTnVtYmVyKGhlYWRlclsyXSkgOiAob2xkU3RhcnQgPT09IDAgPyAwIDogMSk7XG5cdFx0Y29uc3QgaHVua1N0YXJ0ID0gb2xkU3RhcnQgPT09IDAgPyAwIDogb2xkU3RhcnQgLSAxO1xuXHRcdGlmIChodW5rU3RhcnQgPCBvcmlnaW5hbEluZGV4IHx8IGh1bmtTdGFydCA+IG9yaWdpbmFsTGluZXMubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXN1bHQucHVzaCguLi5vcmlnaW5hbExpbmVzLnNsaWNlKG9yaWdpbmFsSW5kZXgsIGh1bmtTdGFydCkpO1xuXHRcdG9yaWdpbmFsSW5kZXggPSBodW5rU3RhcnQ7XG5cdFx0bGV0IGNvbnN1bWVkT2xkID0gMDtcblx0XHRsZXQgcHJldmlvdXNDb250cmlidXRlZFRvQWZ0ZXIgPSBmYWxzZTtcblx0XHRmb3IgKGluZGV4Kys7IGluZGV4IDwgZGlmZkxpbmVzLmxlbmd0aCAmJiAhZGlmZkxpbmVzW2luZGV4XS5zdGFydHNXaXRoKCdAQCAnKTsgaW5kZXgrKykge1xuXHRcdFx0Y29uc3QgbGluZSA9IGRpZmZMaW5lc1tpbmRleF07XG5cdFx0XHRpZiAobGluZSA9PT0gJ1xcXFwgTm8gbmV3bGluZSBhdCBlbmQgb2YgZmlsZScpIHtcblx0XHRcdFx0aWYgKHByZXZpb3VzQ29udHJpYnV0ZWRUb0FmdGVyKSB7XG5cdFx0XHRcdFx0YWZ0ZXJFbmRzV2l0aE5ld2xpbmUgPSBmYWxzZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGlmIChsaW5lLnN0YXJ0c1dpdGgoJyAnKSkge1xuXHRcdFx0XHRjb25zdCBleHBlY3RlZCA9IGxpbmUuc2xpY2UoMSk7XG5cdFx0XHRcdGlmICghbGluZUVxdWFscyhvcmlnaW5hbExpbmVzW29yaWdpbmFsSW5kZXhdLCBleHBlY3RlZCkpIHtcblx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJlc3VsdC5wdXNoKG9yaWdpbmFsTGluZXNbb3JpZ2luYWxJbmRleF0pO1xuXHRcdFx0XHRvcmlnaW5hbEluZGV4Kys7XG5cdFx0XHRcdGNvbnN1bWVkT2xkKys7XG5cdFx0XHRcdHByZXZpb3VzQ29udHJpYnV0ZWRUb0FmdGVyID0gdHJ1ZTtcblx0XHRcdFx0YWZ0ZXJFbmRzV2l0aE5ld2xpbmUgPSB0cnVlO1xuXHRcdFx0fSBlbHNlIGlmIChsaW5lLnN0YXJ0c1dpdGgoJy0nKSkge1xuXHRcdFx0XHRjb25zdCBleHBlY3RlZCA9IGxpbmUuc2xpY2UoMSk7XG5cdFx0XHRcdGlmICghbGluZUVxdWFscyhvcmlnaW5hbExpbmVzW29yaWdpbmFsSW5kZXhdLCBleHBlY3RlZCkpIHtcblx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHRcdG9yaWdpbmFsSW5kZXgrKztcblx0XHRcdFx0Y29uc3VtZWRPbGQrKztcblx0XHRcdFx0cHJldmlvdXNDb250cmlidXRlZFRvQWZ0ZXIgPSBmYWxzZTtcblx0XHRcdH0gZWxzZSBpZiAobGluZS5zdGFydHNXaXRoKCcrJykpIHtcblx0XHRcdFx0cmVzdWx0LnB1c2gobGluZS5zbGljZSgxKSk7XG5cdFx0XHRcdHByZXZpb3VzQ29udHJpYnV0ZWRUb0FmdGVyID0gdHJ1ZTtcblx0XHRcdFx0YWZ0ZXJFbmRzV2l0aE5ld2xpbmUgPSB0cnVlO1xuXHRcdFx0fSBlbHNlIGlmIChsaW5lID09PSAnJyAmJiBpbmRleCA9PT0gZGlmZkxpbmVzLmxlbmd0aCAtIDEpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAoaGVhZGVyWzJdICE9PSB1bmRlZmluZWQgJiYgY29uc3VtZWRPbGQgIT09IG9sZENvdW50KSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRpbmRleC0tO1xuXHR9XG5cdGlmICghc2F3SHVuaykge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0Y29uc3QgbGVmdG92ZXIgPSBvcmlnaW5hbExpbmVzLnNsaWNlKG9yaWdpbmFsSW5kZXgpO1xuXHRyZXN1bHQucHVzaCguLi5sZWZ0b3Zlcik7XG5cdGlmIChsZWZ0b3Zlci5sZW5ndGggPiAwKSB7XG5cdFx0YWZ0ZXJFbmRzV2l0aE5ld2xpbmUgPSBvcmlnaW5hbEVuZHNXaXRoTmV3bGluZTtcblx0fVxuXHRyZXR1cm4gcmVzdWx0LmpvaW4obmV3bGluZSkgKyAoYWZ0ZXJFbmRzV2l0aE5ld2xpbmUgPyBuZXdsaW5lIDogJycpO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxZQUFZLFFBQVE7QUFDcEIsU0FBUyxrQkFBbUM7QUFDNUMsU0FBUyxVQUFVLFlBQVksZUFBZTtBQUM5QyxTQUFTLFdBQVc7QUFDcEIsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxtQkFBbUI7QUFHNUIsU0FBUyx1QkFBdUI7QUErQnpCLE1BQU0sa0NBQWtDLG9CQUFJLElBQUk7QUFBQSxFQUN0RDtBQUFBLEVBQVE7QUFBQSxFQUFPO0FBQUEsRUFBUTtBQUFBLEVBQVU7QUFBQSxFQUFVO0FBQUEsRUFBUztBQUFBLEVBQ3BEO0FBQUEsRUFBZ0I7QUFBQSxFQUFPO0FBQUEsRUFBUztBQUFBLEVBQVE7QUFBQSxFQUFVO0FBQUEsRUFBWTtBQUFBLEVBQVU7QUFDekUsQ0FBQztBQUNNLE1BQU0sd0JBQXdCO0FBQzlCLE1BQU0sNEJBQTRCLElBQUksT0FBTztBQUM3QyxNQUFNLDZCQUE2QixLQUFLLE9BQU87QUFFL0MsTUFBTSxtQ0FBbUM7QUFDekMsTUFBTSxnQ0FBZ0M7QUEyQnRDLElBQU0sd0JBQU4sY0FBb0MsV0FBVztBQUFBLEVBT3JELFlBQ0MsWUFDaUIsV0FDTSxzQkFDUSxjQUNELGFBQzdCO0FBQ0QsVUFBTTtBQUxXO0FBRWM7QUFDRDtBQVYvQixTQUFpQixTQUFTLG9CQUFJLElBQTRDO0FBQzFFLFNBQWlCLGNBQWMsb0JBQUks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
