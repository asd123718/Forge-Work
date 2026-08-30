import { appendFileSync, mkdirSync, statSync } from "fs";
import { appendFile, rename, unlink } from "fs/promises";
import { createHash } from "crypto";
import { join } from "../../../base/common/path.js";
import { formatForgeLocalTimestamp, getForgeTimeZone } from "../../environment/common/forgeLogSession.js";
const CHANNEL_FILES = {
  timeline: "01-timeline.txt",
  chat: "20-chat.txt",
  agent: "30-agent.txt",
  tools: "40-tools.txt",
  files: "50-files.txt",
  terminal: "60-terminal.txt",
  protocol: "70-protocol.txt",
  errors: "90-errors.txt",
  summary: "99-summary.txt"
};
const SECRET_KEY = /(?:authorization|cookie|password|passwd|secret|token|api[-_]?key|private[-_]?key|client[-_]?secret|credential)/i;
const SECRET_VALUE_PATTERNS = [
  /\b(authorization|cookie|password|passwd|secret|access[-_]?token|refresh[-_]?token|api[-_]?key|client[-_]?secret)\b(\s*[:=]\s*)(?:Bearer\s+[A-Za-z0-9._~+/=-]{8,}|"[^"]*"|'[^']*'|[^\s,;}]+)/gi,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi,
  /\b(?:sk|sess|ghp|github_pat|xox[abprs])[-_][A-Za-z0-9._-]{8,}/gi,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g
];
const MAX_VALUE_CHARS = 256 * 1024;
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_ROTATED_FILES = 2;
const ANSI_ESCAPE_PATTERN = /[\u001B\u009B][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[-a-zA-Z\d\/#&.:=?%@~_]+)*)?\u0007)|(?:(?:\d{1,4}(?:[;:]\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))/g;
let activeForgeDiagnosticsLog;
function setActiveForgeDiagnosticsLog(log) {
  activeForgeDiagnosticsLog = log;
}
function getActiveForgeDiagnosticsLog() {
  return activeForgeDiagnosticsLog;
}
function redactForgeDiagnosticValue(value, key, seen = /* @__PURE__ */ new Set()) {
  if (key && SECRET_KEY.test(key)) {
    return "<redacted>";
  }
  if (typeof value === "string") {
    const compactBase64 = value.replace(/\s/g, "");
    if (compactBase64.length >= 1024 && compactBase64.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(compactBase64)) {
      return `<base64 omitted chars=${value.length} sha256=${createHash("sha256").update(value).digest("hex")}>`;
    }
    let redacted = value;
    for (let index = 0; index < SECRET_VALUE_PATTERNS.length; index++) {
      const pattern = SECRET_VALUE_PATTERNS[index];
      redacted = index === 0 ? redacted.replace(pattern, "$1$2<redacted>") : redacted.replace(pattern, "<redacted>");
    }
    return redacted.length > MAX_VALUE_CHARS ? `${redacted.slice(0, MAX_VALUE_CHARS)}
<clipped ${redacted.length - MAX_VALUE_CHARS} chars>` : redacted;
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  if (ArrayBuffer.isView(value)) {
    const bytes = Buffer.from(value.buffer, value.byteOffset, value.byteLength);
    return `<binary omitted bytes=${bytes.byteLength} sha256=${createHash("sha256").update(bytes).digest("hex")}>`;
  }
  if (value instanceof ArrayBuffer) {
    const bytes = Buffer.from(value);
    return `<binary omitted bytes=${bytes.byteLength} sha256=${createHash("sha256").update(bytes).digest("hex")}>`;
  }
  if (seen.has(value)) {
    return "<circular>";
  }
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map((item) => redactForgeDiagnosticValue(item, void 0, seen));
    }
    const result = {};
    for (const [childKey, childValue] of Object.entries(value)) {
      result[childKey] = redactForgeDiagnosticValue(childValue, childKey, seen);
    }
    return result;
  } finally {
    seen.delete(value);
  }
}
function compactJson(value) {
  try {
    return JSON.stringify(redactForgeDiagnosticValue(value));
  } catch (error) {
    return JSON.stringify({ serializationError: String(error) });
  }
}
class ForgeDiagnosticsLog {
  constructor(logsHome, _source = "agent-host") {
    this._source = _source;
    this._timeZone = getForgeTimeZone();
    this._started = Date.now();
    this._queues = /* @__PURE__ */ new Map();
    this._streams = /* @__PURE__ */ new Map();
    this._latestText = /* @__PURE__ */ new Map();
    this._flushPromise = Promise.resolve();
    this._sequence = 0;
    this._disposed = false;
    this._directory = logsHome.fsPath;
    mkdirSync(this._directory, { recursive: true });
    for (const [channel, file] of Object.entries(CHANNEL_FILES)) {
      const path = join(this._directory, file);
      try {
        if (statSync(path).size > 0) {
          continue;
        }
      } catch {
      }
      appendFileSync(path, `# FORGE ${channel.toUpperCase()} LOG | source=${this._source} | encoding=utf-8
`, "utf8");
    }
    this.record("timeline", "PROCESS.READY", { pid: process.pid, source: this._source });
  }
  record(channel, type, data, context = {}) {
    if (this._disposed) {
      return "";
    }
    const now = /* @__PURE__ */ new Date();
    const id = `R-${this._source}-${String(++this._sequence).padStart(6, "0")}`;
    const elapsed = Date.now() - this._started;
    const fields = Object.keys(context).length ? ` | context=${compactJson(context)}` : "";
    const payload = data === void 0 ? "" : ` | data=${compactJson(data)}`;
    this._enqueue(CHANNEL_FILES[channel], `${formatForgeLocalTimestamp(now, this._timeZone)} | +${elapsed}ms | ${id} | ${type}${fields}${payload}
`);
    return id;
  }
  recordText(channel, type, content, context = {}) {
    if (this._disposed) {
      return "";
    }
    const id = this.record(channel, `${type}.BEGIN`, { chars: content.length }, context);
    const tag = type.replace(/[^A-Za-z0-9_.-]/g, "_").toUpperCase();
    const safe = String(redactForgeDiagnosticValue(content));
    this._enqueue(CHANNEL_FILES[channel], `@@BEGIN ${tag} id=${id}
${safe}
@@END ${tag} id=${id}
`);
    return id;
  }
  /** Coalesces fast provider chunks so one streamed answer does not create thousands of lines. */
  recordStream(channel, streamKey, type, content, context = {}) {
    if (!content || this._disposed) {
      return;
    }
    if (channel === "terminal") {
      content = content.replace(ANSI_ESCAPE_PATTERN, "");
    }
    const existing = this._streams.get(streamKey);
    if (existing) {
      existing.content += content;
      if (existing.content.length >= 16 * 1024) {
        this._flushStream(streamKey);
      }
      return;
    }
    const stream = {
      channel,
      type,
      context,
      content,
      timer: setTimeout(() => this._flushStream(streamKey), 250)
    };
    this._streams.set(streamKey, stream);
  }
  /** Debounces cumulative snapshots (notably live diffs), keeping only the latest pending value. */
  recordLatestText(channel, streamKey, type, content, context = {}) {
    if (this._disposed) {
      return;
    }
    const existing = this._latestText.get(streamKey);
    if (existing) {
      clearTimeout(existing.timer);
    }
    const latest = {
      channel,
      type,
      context,
      content,
      timer: setTimeout(() => this._flushLatestText(streamKey), 500)
    };
    this._latestText.set(streamKey, latest);
  }
  flushStreams(prefix) {
    for (const key of [...this._streams.keys()]) {
      if (!prefix || key.startsWith(prefix)) {
        this._flushStream(key);
      }
    }
  }
  flushLatestText(prefix) {
    for (const key of [...this._latestText.keys()]) {
      if (!prefix || key.startsWith(prefix)) {
        this._flushLatestText(key);
      }
    }
  }
  async flush() {
    this.flushStreams();
    this.flushLatestText();
    if (this._flushTimer) {
      clearTimeout(this._flushTimer);
      this._flushTimer = void 0;
    }
    await this._scheduleFlush(true);
    await this._flushPromise;
  }
  dispose() {
    if (this._disposed) {
      return;
    }
    this.flushStreams();
    this.flushLatestText();
    this.record("summary", "PROCESS.EXIT", { pid: process.pid });
    void this.flush();
    this._disposed = true;
    if (activeForgeDiagnosticsLog === this) {
      activeForgeDiagnosticsLog = void 0;
    }
  }
  _flushStream(key) {
    const stream = this._streams.get(key);
    if (!stream) {
      return;
    }
    clearTimeout(stream.timer);
    this._streams.delete(key);
    this.recordText(stream.channel, stream.type, stream.content, stream.context);
  }
  _flushLatestText(key) {
    const latest = this._latestText.get(key);
    if (!latest) {
      return;
    }
    clearTimeout(latest.timer);
    this._latestText.delete(key);
    this.recordText(latest.channel, latest.type, latest.content, latest.context);
  }
  _enqueue(file, text) {
    let queue = this._queues.get(file);
    if (!queue) {
      queue = [];
      this._queues.set(file, queue);
    }
    queue.push(text);
    if (!this._flushTimer) {
      this._flushTimer = setTimeout(() => {
        this._flushTimer = void 0;
        void this._scheduleFlush(false);
      }, 100);
    }
  }
  async _scheduleFlush(force) {
    if (!force && this._queues.size === 0) {
      return;
    }
    const batches = [...this._queues].map(([file, chunks]) => [file, chunks.join("")]);
    this._queues.clear();
    this._flushPromise = this._flushPromise.then(async () => {
      for (const [file, text] of batches) {
        const path = join(this._directory, file);
        try {
          if (statSync(path).size + Buffer.byteLength(text, "utf8") > MAX_FILE_BYTES) {
            await this._rotate(path);
          }
        } catch {
        }
        await appendFile(path, text, "utf8");
      }
    }).catch((error) => console.error("[ForgeDiagnostics] Failed to flush diagnostic log", error));
    await this._flushPromise;
  }
  async _rotate(path) {
    const rotatedPath = (index) => path.replace(/\.txt$/, `.${index}.txt`);
    try {
      await unlink(rotatedPath(MAX_ROTATED_FILES));
    } catch {
    }
    for (let index = MAX_ROTATED_FILES - 1; index >= 1; index--) {
      try {
        await rename(rotatedPath(index), rotatedPath(index + 1));
      } catch {
      }
    }
    await rename(path, rotatedPath(1));
  }
}
export {
  ForgeDiagnosticsLog,
  getActiveForgeDiagnosticsLog,
  redactForgeDiagnosticValue,
  setActiveForgeDiagnosticsLog
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFxub2RlXFxmb3JnZURpYWdub3N0aWNzTG9nLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgYXBwZW5kRmlsZVN5bmMsIG1rZGlyU3luYywgc3RhdFN5bmMgfSBmcm9tICdmcyc7XG5pbXBvcnQgeyBhcHBlbmRGaWxlLCByZW5hbWUsIHVubGluayB9IGZyb20gJ2ZzL3Byb21pc2VzJztcbmltcG9ydCB7IGNyZWF0ZUhhc2ggfSBmcm9tICdjcnlwdG8nO1xuaW1wb3J0IHsgam9pbiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGZvcm1hdEZvcmdlTG9jYWxUaW1lc3RhbXAsIGdldEZvcmdlVGltZVpvbmUgfSBmcm9tICcuLi8uLi9lbnZpcm9ubWVudC9jb21tb24vZm9yZ2VMb2dTZXNzaW9uLmpzJztcblxuZXhwb3J0IHR5cGUgRm9yZ2VEaWFnbm9zdGljQ2hhbm5lbCA9ICd0aW1lbGluZScgfCAnY2hhdCcgfCAnYWdlbnQnIHwgJ3Rvb2xzJyB8ICdmaWxlcycgfCAndGVybWluYWwnIHwgJ3Byb3RvY29sJyB8ICdlcnJvcnMnIHwgJ3N1bW1hcnknO1xuXG5jb25zdCBDSEFOTkVMX0ZJTEVTOiBSZWNvcmQ8Rm9yZ2VEaWFnbm9zdGljQ2hhbm5lbCwgc3RyaW5nPiA9IHtcblx0dGltZWxpbmU6ICcwMS10aW1lbGluZS50eHQnLFxuXHRjaGF0OiAnMjAtY2hhdC50eHQnLFxuXHRhZ2VudDogJzMwLWFnZW50LnR4dCcsXG5cdHRvb2xzOiAnNDAtdG9vbHMudHh0Jyxcblx0ZmlsZXM6ICc1MC1maWxlcy50eHQnLFxuXHR0ZXJtaW5hbDogJzYwLXRlcm1pbmFsLnR4dCcsXG5cdHByb3RvY29sOiAnNzAtcHJvdG9jb2wudHh0Jyxcblx0ZXJyb3JzOiAnOTAtZXJyb3JzLnR4dCcsXG5cdHN1bW1hcnk6ICc5OS1zdW1tYXJ5LnR4dCcsXG59O1xuXG5jb25zdCBTRUNSRVRfS0VZID0gLyg/OmF1dGhvcml6YXRpb258Y29va2llfHBhc3N3b3JkfHBhc3N3ZHxzZWNyZXR8dG9rZW58YXBpWy1fXT9rZXl8cHJpdmF0ZVstX10/a2V5fGNsaWVudFstX10/c2VjcmV0fGNyZWRlbnRpYWwpL2k7XG5jb25zdCBTRUNSRVRfVkFMVUVfUEFUVEVSTlMgPSBbXG5cdC9cXGIoYXV0aG9yaXphdGlvbnxjb29raWV8cGFzc3dvcmR8cGFzc3dkfHNlY3JldHxhY2Nlc3NbLV9dP3Rva2VufHJlZnJlc2hbLV9dP3Rva2VufGFwaVstX10/a2V5fGNsaWVudFstX10/c2VjcmV0KVxcYihcXHMqWzo9XVxccyopKD86QmVhcmVyXFxzK1tBLVphLXowLTkuX34rLz0tXXs4LH18XCJbXlwiXSpcInwnW14nXSonfFteXFxzLDt9XSspL2dpLFxuXHQvXFxiQmVhcmVyXFxzK1tBLVphLXowLTkuX34rLz0tXXs4LH0vZ2ksXG5cdC9cXGIoPzpza3xzZXNzfGdocHxnaXRodWJfcGF0fHhveFthYnByc10pWy1fXVtBLVphLXowLTkuXy1dezgsfS9naSxcblx0Ly0tLS0tQkVHSU4gW0EtWiBdKlBSSVZBVEUgS0VZLS0tLS1bXFxzXFxTXSo/LS0tLS1FTkQgW0EtWiBdKlBSSVZBVEUgS0VZLS0tLS0vZyxcbl07XG5cbmNvbnN0IE1BWF9WQUxVRV9DSEFSUyA9IDI1NiAqIDEwMjQ7XG5jb25zdCBNQVhfRklMRV9CWVRFUyA9IDggKiAxMDI0ICogMTAyNDtcbmNvbnN0IE1BWF9ST1RBVEVEX0ZJTEVTID0gMjtcbmNvbnN0IEFOU0lfRVNDQVBFX1BBVFRFUk4gPSAvW1xcdTAwMUJcXHUwMDlCXVtbXFxdKCkjOz9dKig/Oig/Oig/OlthLXpBLVpcXGRdKig/OjtbLWEtekEtWlxcZFxcLyMmLjo9PyVAfl9dKykqKT9cXHUwMDA3KXwoPzooPzpcXGR7MSw0fSg/Ols7Ol1cXGR7MCw0fSkqKT9bXFxkQS1QUi1UWmNmLW5xLXV5PT48fl0pKS9nO1xuXG5sZXQgYWN0aXZlRm9yZ2VEaWFnbm9zdGljc0xvZzogRm9yZ2VEaWFnbm9zdGljc0xvZyB8IHVuZGVmaW5lZDtcblxuZXhwb3J0IGZ1bmN0aW9uIHNldEFjdGl2ZUZvcmdlRGlhZ25vc3RpY3NMb2cobG9nOiBGb3JnZURpYWdub3N0aWNzTG9nIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdGFjdGl2ZUZvcmdlRGlhZ25vc3RpY3NMb2cgPSBsb2c7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRBY3RpdmVGb3JnZURpYWdub3N0aWNzTG9nKCk6IEZvcmdlRGlhZ25vc3RpY3NMb2cgfCB1bmRlZmluZWQge1xuXHRyZXR1cm4gYWN0aXZlRm9yZ2VEaWFnbm9zdGljc0xvZztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlZGFjdEZvcmdlRGlhZ25vc3RpY1ZhbHVlKHZhbHVlOiB1bmtub3duLCBrZXk/OiBzdHJpbmcsIHNlZW4gPSBuZXcgU2V0PG9iamVjdD4oKSk6IHVua25vd24ge1xuXHRpZiAoa2V5ICYmIFNFQ1JFVF9LRVkudGVzdChrZXkpKSB7XG5cdFx0cmV0dXJuICc8cmVkYWN0ZWQ+Jztcblx0fVxuXHRpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuXHRcdGNvbnN0IGNvbXBhY3RCYXNlNjQgPSB2YWx1ZS5yZXBsYWNlKC9cXHMvZywgJycpO1xuXHRcdGlmIChjb21wYWN0QmFzZTY0Lmxlbmd0aCA+PSAxXzAyNCAmJiBjb21wYWN0QmFzZTY0Lmxlbmd0aCAlIDQgPT09IDAgJiYgL15bQS1aYS16MC05Ky9dKz17MCwyfSQvLnRlc3QoY29tcGFjdEJhc2U2NCkpIHtcblx0XHRcdHJldHVybiBgPGJhc2U2NCBvbWl0dGVkIGNoYXJzPSR7dmFsdWUubGVuZ3RofSBzaGEyNTY9JHtjcmVhdGVIYXNoKCdzaGEyNTYnKS51cGRhdGUodmFsdWUpLmRpZ2VzdCgnaGV4Jyl9PmA7XG5cdFx0fVxuXHRcdGxldCByZWRhY3RlZCA9IHZhbHVlO1xuXHRcdGZvciAobGV0IGluZGV4ID0gMDsgaW5kZXggPCBTRUNSRVRfVkFMVUVfUEFUVEVSTlMubGVuZ3RoOyBpbmRleCsrKSB7XG5cdFx0XHRjb25zdCBwYXR0ZXJuID0gU0VDUkVUX1ZBTFVFX1BBVFRFUk5TW2luZGV4XTtcblx0XHRcdHJlZGFjdGVkID0gaW5kZXggPT09IDBcblx0XHRcdFx0PyByZWRhY3RlZC5yZXBsYWNlKHBhdHRlcm4sICckMSQyPHJlZGFjdGVkPicpXG5cdFx0XHRcdDogcmVkYWN0ZWQucmVwbGFjZShwYXR0ZXJuLCAnPHJlZGFjdGVkPicpO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVkYWN0ZWQubGVuZ3RoID4gTUFYX1ZBTFVFX0NIQVJTID8gYCR7cmVkYWN0ZWQuc2xpY2UoMCwgTUFYX1ZBTFVFX0NIQVJTKX1cXG48Y2xpcHBlZCAke3JlZGFjdGVkLmxlbmd0aCAtIE1BWF9WQUxVRV9DSEFSU30gY2hhcnM+YCA6IHJlZGFjdGVkO1xuXHR9XG5cdGlmICghdmFsdWUgfHwgdHlwZW9mIHZhbHVlICE9PSAnb2JqZWN0Jykge1xuXHRcdHJldHVybiB2YWx1ZTtcblx0fVxuXHRpZiAoQXJyYXlCdWZmZXIuaXNWaWV3KHZhbHVlKSkge1xuXHRcdGNvbnN0IGJ5dGVzID0gQnVmZmVyLmZyb20odmFsdWUuYnVmZmVyLCB2YWx1ZS5ieXRlT2Zmc2V0LCB2YWx1ZS5ieXRlTGVuZ3RoKTtcblx0XHRyZXR1cm4gYDxiaW5hcnkgb21pdHRlZCBieXRlcz0ke2J5dGVzLmJ5dGVMZW5ndGh9IHNoYTI1Nj0ke2NyZWF0ZUhhc2goJ3NoYTI1NicpLnVwZGF0ZShieXRlcykuZGlnZXN0KCdoZXgnKX0+YDtcblx0fVxuXHRpZiAodmFsdWUgaW5zdGFuY2VvZiBBcnJheUJ1ZmZlcikge1xuXHRcdGNvbnN0IGJ5dGVzID0gQnVmZmVyLmZyb20odmFsdWUpO1xuXHRcdHJldHVybiBgPGJpbmFyeSBvbWl0dGVkIGJ5dGVzPSR7Ynl0ZXMuYnl0ZUxlbmd0aH0gc2hhMjU2PSR7Y3JlYXRlSGFzaCgnc2hhMjU2JykudXBkYXRlKGJ5dGVzKS5kaWdlc3QoJ2hleCcpfT5gO1xuXHR9XG5cdGlmIChzZWVuLmhhcyh2YWx1ZSkpIHtcblx0XHRyZXR1cm4gJzxjaXJjdWxhcj4nO1xuXHR9XG5cdHNlZW4uYWRkKHZhbHVlKTtcblx0dHJ5IHtcblx0XHRpZiAoQXJyYXkuaXNBcnJheSh2YWx1ZSkpIHtcblx0XHRcdHJldHVybiB2YWx1ZS5tYXAoaXRlbSA9PiByZWRhY3RGb3JnZURpYWdub3N0aWNWYWx1ZShpdGVtLCB1bmRlZmluZWQsIHNlZW4pKTtcblx0XHR9XG5cdFx0Y29uc3QgcmVzdWx0OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiA9IHt9O1xuXHRcdGZvciAoY29uc3QgW2NoaWxkS2V5LCBjaGlsZFZhbHVlXSBvZiBPYmplY3QuZW50cmllcyh2YWx1ZSkpIHtcblx0XHRcdHJlc3VsdFtjaGlsZEtleV0gPSByZWRhY3RGb3JnZURpYWdub3N0aWNWYWx1ZShjaGlsZFZhbHVlLCBjaGlsZEtleSwgc2Vlbik7XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH0gZmluYWxseSB7XG5cdFx0c2Vlbi5kZWxldGUodmFsdWUpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGNvbXBhY3RKc29uKHZhbHVlOiB1bmtub3duKTogc3RyaW5nIHtcblx0dHJ5IHtcblx0XHRyZXR1cm4gSlNPTi5zdHJpbmdpZnkocmVkYWN0Rm9yZ2VEaWFnbm9zdGljVmFsdWUodmFsdWUpKTtcblx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRyZXR1cm4gSlNPTi5zdHJpbmdpZnkoeyBzZXJpYWxpemF0aW9uRXJyb3I6IFN0cmluZyhlcnJvcikgfSk7XG5cdH1cbn1cblxuaW50ZXJmYWNlIElCdWZmZXJlZFN0cmVhbSB7XG5cdHJlYWRvbmx5IGNoYW5uZWw6IEZvcmdlRGlhZ25vc3RpY0NoYW5uZWw7XG5cdHJlYWRvbmx5IHR5cGU6IHN0cmluZztcblx0cmVhZG9ubHkgY29udGV4dDogUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG5cdGNvbnRlbnQ6IHN0cmluZztcblx0dGltZXI6IFJldHVyblR5cGU8dHlwZW9mIHNldFRpbWVvdXQ+O1xufVxuXG4vKipcbiAqIENvbXBhY3QsIGFwcGVuZC1vbmx5IGRpYWdub3N0aWNzIG93bmVkIGJ5IEZvcmdlLiBJdCBpcyBkZWxpYmVyYXRlbHkgaW5kZXBlbmRlbnQgb2YgZXZlcnlcbiAqIG1vZGVsL3Byb3ZpZGVyOiB0aGUgYXBwbGljYXRpb24gcmVjb3JkcyBldmVudHMgaXQgb2JzZXJ2ZXMgaW5zdGVhZCBvZiBhc2tpbmcgYSBtb2RlbCB0byBsb2cuXG4gKi9cbmV4cG9ydCBjbGFzcyBGb3JnZURpYWdub3N0aWNzTG9nIHtcblx0cHJpdmF0ZSByZWFkb25seSBfZGlyZWN0b3J5OiBzdHJpbmc7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3RpbWVab25lID0gZ2V0Rm9yZ2VUaW1lWm9uZSgpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zdGFydGVkID0gRGF0ZS5ub3coKTtcblx0cHJpdmF0ZSByZWFkb25seSBfcXVldWVzID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZ1tdPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zdHJlYW1zID0gbmV3IE1hcDxzdHJpbmcsIElCdWZmZXJlZFN0cmVhbT4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfbGF0ZXN0VGV4dCA9IG5ldyBNYXA8c3RyaW5nLCBJQnVmZmVyZWRTdHJlYW0+KCk7XG5cdHByaXZhdGUgX2ZsdXNoVGltZXI6IFJldHVyblR5cGU8dHlwZW9mIHNldFRpbWVvdXQ+IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9mbHVzaFByb21pc2U6IFByb21pc2U8dm9pZD4gPSBQcm9taXNlLnJlc29sdmUoKTtcblx0cHJpdmF0ZSBfc2VxdWVuY2UgPSAwO1xuXHRwcml2YXRlIF9kaXNwb3NlZCA9IGZhbHNlO1xuXG5cdGNvbnN0cnVjdG9yKGxvZ3NIb21lOiBVUkksIHByaXZhdGUgcmVhZG9ubHkgX3NvdXJjZSA9ICdhZ2VudC1ob3N0Jykge1xuXHRcdHRoaXMuX2RpcmVjdG9yeSA9IGxvZ3NIb21lLmZzUGF0aDtcblx0XHRta2RpclN5bmModGhpcy5fZGlyZWN0b3J5LCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcblx0XHRmb3IgKGNvbnN0IFtjaGFubmVsLCBmaWxlXSBvZiBPYmplY3QuZW50cmllcyhDSEFOTkVMX0ZJTEVTKSkge1xuXHRcdFx0Y29uc3QgcGF0aCA9IGpvaW4odGhpcy5fZGlyZWN0b3J5LCBmaWxlKTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGlmIChzdGF0U3luYyhwYXRoKS5zaXplID4gMCkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0Ly8gQ3JlYXRlIGJlbG93LlxuXHRcdFx0fVxuXHRcdFx0YXBwZW5kRmlsZVN5bmMocGF0aCwgYCMgRk9SR0UgJHtjaGFubmVsLnRvVXBwZXJDYXNlKCl9IExPRyB8IHNvdXJjZT0ke3RoaXMuX3NvdXJjZX0gfCBlbmNvZGluZz11dGYtOFxcbmAsICd1dGY4Jyk7XG5cdFx0fVxuXHRcdHRoaXMucmVjb3JkKCd0aW1lbGluZScsICdQUk9DRVNTLlJFQURZJywgeyBwaWQ6IHByb2Nlc3MucGlkLCBzb3VyY2U6IHRoaXMuX3NvdXJjZSB9KTtcblx0fVxuXG5cdHJlY29yZChjaGFubmVsOiBGb3JnZURpYWdub3N0aWNDaGFubmVsLCB0eXBlOiBzdHJpbmcsIGRhdGE/OiB1bmtub3duLCBjb250ZXh0OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiA9IHt9KTogc3RyaW5nIHtcblx0XHRpZiAodGhpcy5fZGlzcG9zZWQpIHtcblx0XHRcdHJldHVybiAnJztcblx0XHR9XG5cdFx0Y29uc3Qgbm93ID0gbmV3IERhdGUoKTtcblx0XHRjb25zdCBpZCA9IGBSLSR7dGhpcy5fc291cmNlfS0ke1N0cmluZygrK3RoaXMuX3NlcXVlbmNlKS5wYWRTdGFydCg2LCAnMCcpfWA7XG5cdFx0Y29uc3QgZWxhcHNlZCA9IERhdGUubm93KCkgLSB0aGlzLl9zdGFydGVkO1xuXHRcdGNvbnN0IGZpZWxkcyA9IE9iamVjdC5rZXlzKGNvbnRleHQpLmxlbmd0aCA/IGAgfCBjb250ZXh0PSR7Y29tcGFjdEpzb24oY29udGV4dCl9YCA6ICcnO1xuXHRcdGNvbnN0IHBheWxvYWQgPSBkYXRhID09PSB1bmRlZmluZWQgPyAnJyA6IGAgfCBkYXRhPSR7Y29tcGFjdEpzb24oZGF0YSl9YDtcblx0XHR0aGlzLl9lbnF1ZXVlKENIQU5ORUxfRklMRVNbY2hhbm5lbF0sIGAke2Zvcm1hdEZvcmdlTG9jYWxUaW1lc3RhbXAobm93LCB0aGlzLl90aW1lWm9uZSl9IHwgKyR7ZWxhcHNlZH1tcyB8ICR7aWR9IHwgJHt0eXBlfSR7ZmllbGRzfSR7cGF5bG9hZH1cXG5gKTtcblx0XHRyZXR1cm4gaWQ7XG5cdH1cblxuXHRyZWNvcmRUZXh0KGNoYW5uZWw6IEZvcmdlRGlhZ25vc3RpY0NoYW5uZWwsIHR5cGU6IHN0cmluZywgY29udGVudDogc3RyaW5nLCBjb250ZXh0OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiA9IHt9KTogc3RyaW5nIHtcblx0XHRpZiAodGhpcy5fZGlzcG9zZWQpIHtcblx0XHRcdHJldHVybiAnJztcblx0XHR9XG5cdFx0Y29uc3QgaWQgPSB0aGlzLnJlY29yZChjaGFubmVsLCBgJHt0eXBlfS5CRUdJTmAsIHsgY2hhcnM6IGNvbnRlbnQubGVuZ3RoIH0sIGNvbnRleHQpO1xuXHRcdGNvbnN0IHRhZyA9IHR5cGUucmVwbGFjZSgvW15BLVphLXowLTlfLi1dL2csICdfJykudG9VcHBlckNhc2UoKTtcblx0XHRjb25zdCBzYWZlID0gU3RyaW5nKHJlZGFjdEZvcmdlRGlhZ25vc3RpY1ZhbHVlKGNvbnRlbnQpKTtcblx0XHR0aGlzLl9lbnF1ZXVlKENIQU5ORUxfRklMRVNbY2hhbm5lbF0sIGBAQEJFR0lOICR7dGFnfSBpZD0ke2lkfVxcbiR7c2FmZX1cXG5AQEVORCAke3RhZ30gaWQ9JHtpZH1cXG5gKTtcblx0XHRyZXR1cm4gaWQ7XG5cdH1cblxuXHQvKiogQ29hbGVzY2VzIGZhc3QgcHJvdmlkZXIgY2h1bmtzIHNvIG9uZSBzdHJlYW1lZCBhbnN3ZXIgZG9lcyBub3QgY3JlYXRlIHRob3VzYW5kcyBvZiBsaW5lcy4gKi9cblx0cmVjb3JkU3RyZWFtKGNoYW5uZWw6IEZvcmdlRGlhZ25vc3RpY0NoYW5uZWwsIHN0cmVhbUtleTogc3RyaW5nLCB0eXBlOiBzdHJpbmcsIGNvbnRlbnQ6IHN0cmluZywgY29udGV4dDogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gPSB7fSk6IHZvaWQge1xuXHRcdGlmICghY29udGVudCB8fCB0aGlzLl9kaXNwb3NlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoY2hhbm5lbCA9PT0gJ3Rlcm1pbmFsJykge1xuXHRcdFx0Y29udGVudCA9IGNvbnRlbnQucmVwbGFjZShBTlNJX0VTQ0FQRV9QQVRURVJOLCAnJyk7XG5cdFx0fVxuXHRcdGNvbnN0IGV4aXN0aW5nID0gdGhpcy5fc3RyZWFtcy5nZXQoc3RyZWFtS2V5KTtcblx0XHRpZiAoZXhpc3RpbmcpIHtcblx0XHRcdGV4aXN0aW5nLmNvbnRlbnQgKz0gY29udGVudDtcblx0XHRcdGlmIChleGlzdGluZy5jb250ZW50Lmxlbmd0aCA+PSAxNiAqIDEwMjQpIHtcblx0XHRcdFx0dGhpcy5fZmx1c2hTdHJlYW0oc3RyZWFtS2V5KTtcblx0XHRcdH1cblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3Qgc3RyZWFtOiBJQnVmZmVyZWRTdHJlYW0gPSB7XG5cdFx0XHRjaGFubmVsLFxuXHRcdFx0dHlwZSxcblx0XHRcdGNvbnRleHQsXG5cdFx0XHRjb250ZW50LFxuXHRcdFx0dGltZXI6IHNldFRpbWVvdXQoKCkgPT4gdGhpcy5fZmx1c2hTdHJlYW0oc3RyZWFtS2V5KSwgMjUwKSxcblx0XHR9O1xuXHRcdHRoaXMuX3N0cmVhbXMuc2V0KHN0cmVhbUtleSwgc3RyZWFtKTtcblx0fVxuXG5cdC8qKiBEZWJvdW5jZXMgY3VtdWxhdGl2ZSBzbmFwc2hvdHMgKG5vdGFibHkgbGl2ZSBkaWZmcyksIGtlZXBpbmcgb25seSB0aGUgbGF0ZXN0IHBlbmRpbmcgdmFsdWUuICovXG5cdHJlY29yZExhdGVzdFRleHQoY2hhbm5lbDogRm9yZ2VEaWFnbm9zdGljQ2hhbm5lbCwgc3RyZWFtS2V5OiBzdHJpbmcsIHR5cGU6IHN0cmluZywgY29udGVudDogc3RyaW5nLCBjb250ZXh0OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiA9IHt9KTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2Rpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGV4aXN0aW5nID0gdGhpcy5fbGF0ZXN0VGV4dC5nZXQoc3RyZWFtS2V5KTtcblx0XHRpZiAoZXhpc3RpbmcpIHtcblx0XHRcdGNsZWFyVGltZW91dChleGlzdGluZy50aW1lcik7XG5cdFx0fVxuXHRcdGNvbnN0IGxhdGVzdDogSUJ1ZmZlcmVkU3RyZWFtID0ge1xuXHRcdFx0Y2hhbm5lbCxcblx0XHRcdHR5cGUsXG5cdFx0XHRjb250ZXh0LFxuXHRcdFx0Y29udGVudCxcblx0XHRcdHRpbWVyOiBzZXRUaW1lb3V0KCgpID0+IHRoaXMuX2ZsdXNoTGF0ZXN0VGV4dChzdHJlYW1LZXkpLCA1MDApLFxuXHRcdH07XG5cdFx0dGhpcy5fbGF0ZXN0VGV4dC5zZXQoc3RyZWFtS2V5LCBsYXRlc3QpO1xuXHR9XG5cblx0Zmx1c2hTdHJlYW1zKHByZWZpeD86IHN0cmluZyk6IHZvaWQge1xuXHRcdGZvciAoY29uc3Qga2V5IG9mIFsuLi50aGlzLl9zdHJlYW1zLmtleXMoKV0pIHtcblx0XHRcdGlmICghcHJlZml4IHx8IGtleS5zdGFydHNXaXRoKHByZWZpeCkpIHtcblx0XHRcdFx0dGhpcy5fZmx1c2hTdHJlYW0oa2V5KTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRmbHVzaExhdGVzdFRleHQocHJlZml4Pzogc3RyaW5nKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBrZXkgb2YgWy4uLnRoaXMuX2xhdGVzdFRleHQua2V5cygpXSkge1xuXHRcdFx0aWYgKCFwcmVmaXggfHwga2V5LnN0YXJ0c1dpdGgocHJlZml4KSkge1xuXHRcdFx0XHR0aGlzLl9mbHVzaExhdGVzdFRleHQoa2V5KTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRhc3luYyBmbHVzaCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLmZsdXNoU3RyZWFtcygpO1xuXHRcdHRoaXMuZmx1c2hMYXRlc3RUZXh0KCk7XG5cdFx0aWYgKHRoaXMuX2ZsdXNoVGltZXIpIHtcblx0XHRcdGNsZWFyVGltZW91dCh0aGlzLl9mbHVzaFRpbWVyKTtcblx0XHRcdHRoaXMuX2ZsdXNoVGltZXIgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGF3YWl0IHRoaXMuX3NjaGVkdWxlRmx1c2godHJ1ZSk7XG5cdFx0YXdhaXQgdGhpcy5fZmx1c2hQcm9taXNlO1xuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fZGlzcG9zZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5mbHVzaFN0cmVhbXMoKTtcblx0XHR0aGlzLmZsdXNoTGF0ZXN0VGV4dCgpO1xuXHRcdHRoaXMucmVjb3JkKCdzdW1tYXJ5JywgJ1BST0NFU1MuRVhJVCcsIHsgcGlkOiBwcm9jZXNzLnBpZCB9KTtcblx0XHR2b2lkIHRoaXMuZmx1c2goKTtcblx0XHR0aGlzLl9kaXNwb3NlZCA9IHRydWU7XG5cdFx0aWYgKGFjdGl2ZUZvcmdlRGlhZ25vc3RpY3NMb2cgPT09IHRoaXMpIHtcblx0XHRcdGFjdGl2ZUZvcmdlRGlhZ25vc3RpY3NMb2cgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZmx1c2hTdHJlYW0oa2V5OiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBzdHJlYW0gPSB0aGlzLl9zdHJlYW1zLmdldChrZXkpO1xuXHRcdGlmICghc3RyZWFtKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNsZWFyVGltZW91dChzdHJlYW0udGltZXIpO1xuXHRcdHRoaXMuX3N0cmVhbXMuZGVsZXRlKGtleSk7XG5cdFx0dGhpcy5yZWNvcmRUZXh0KHN0cmVhbS5jaGFubmVsLCBzdHJlYW0udHlwZSwgc3RyZWFtLmNvbnRlbnQsIHN0cmVhbS5jb250ZXh0KTtcblx0fVxuXG5cdHByaXZhdGUgX2ZsdXNoTGF0ZXN0VGV4dChrZXk6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IGxhdGVzdCA9IHRoaXMuX2xhdGVzdFRleHQuZ2V0KGtleSk7XG5cdFx0aWYgKCFsYXRlc3QpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y2xlYXJUaW1lb3V0KGxhdGVzdC50aW1lcik7XG5cdFx0dGhpcy5fbGF0ZXN0VGV4dC5kZWxldGUoa2V5KTtcblx0XHR0aGlzLnJlY29yZFRleHQobGF0ZXN0LmNoYW5uZWwsIGxhdGVzdC50eXBlLCBsYXRlc3QuY29udGVudCwgbGF0ZXN0LmNvbnRleHQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZW5xdWV1ZShmaWxlOiBzdHJpbmcsIHRleHQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdGxldCBxdWV1ZSA9IHRoaXMuX3F1ZXVlcy5nZXQoZmlsZSk7XG5cdFx0aWYgKCFxdWV1ZSkge1xuXHRcdFx0cXVldWUgPSBbXTtcblx0XHRcdHRoaXMuX3F1ZXVlcy5zZXQoZmlsZSwgcXVldWUpO1xuXHRcdH1cblx0XHRxdWV1ZS5wdXNoKHRleHQpO1xuXHRcdGlmICghdGhpcy5fZmx1c2hUaW1lcikge1xuXHRcdFx0dGhpcy5fZmx1c2hUaW1lciA9IHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9mbHVzaFRpbWVyID0gdW5kZWZpbmVkO1xuXHRcdFx0XHR2b2lkIHRoaXMuX3NjaGVkdWxlRmx1c2goZmFsc2UpO1xuXHRcdFx0fSwgMTAwKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9zY2hlZHVsZUZsdXNoKGZvcmNlOiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCFmb3JjZSAmJiB0aGlzLl9xdWV1ZXMuc2l6ZSA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBiYXRjaGVzID0gWy4uLnRoaXMuX3F1ZXVlc10ubWFwKChbZmlsZSwgY2h1bmtzXSkgPT4gW2ZpbGUsIGNodW5rcy5qb2luKCcnKV0gYXMgY29uc3QpO1xuXHRcdHRoaXMuX3F1ZXVlcy5jbGVhcigpO1xuXHRcdHRoaXMuX2ZsdXNoUHJvbWlzZSA9IHRoaXMuX2ZsdXNoUHJvbWlzZS50aGVuKGFzeW5jICgpID0+IHtcblx0XHRcdGZvciAoY29uc3QgW2ZpbGUsIHRleHRdIG9mIGJhdGNoZXMpIHtcblx0XHRcdFx0Y29uc3QgcGF0aCA9IGpvaW4odGhpcy5fZGlyZWN0b3J5LCBmaWxlKTtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRpZiAoc3RhdFN5bmMocGF0aCkuc2l6ZSArIEJ1ZmZlci5ieXRlTGVuZ3RoKHRleHQsICd1dGY4JykgPiBNQVhfRklMRV9CWVRFUykge1xuXHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5fcm90YXRlKHBhdGgpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdFx0Ly8gTWlzc2luZyBmaWxlcyBhcmUgY3JlYXRlZCBieSBhcHBlbmRGaWxlIGJlbG93LlxuXHRcdFx0XHR9XG5cdFx0XHRcdGF3YWl0IGFwcGVuZEZpbGUocGF0aCwgdGV4dCwgJ3V0ZjgnKTtcblx0XHRcdH1cblx0XHR9KS5jYXRjaChlcnJvciA9PiBjb25zb2xlLmVycm9yKCdbRm9yZ2VEaWFnbm9zdGljc10gRmFpbGVkIHRvIGZsdXNoIGRpYWdub3N0aWMgbG9nJywgZXJyb3IpKTtcblx0XHRhd2FpdCB0aGlzLl9mbHVzaFByb21pc2U7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9yb3RhdGUocGF0aDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgcm90YXRlZFBhdGggPSAoaW5kZXg6IG51bWJlcikgPT4gcGF0aC5yZXBsYWNlKC9cXC50eHQkLywgYC4ke2luZGV4fS50eHRgKTtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgdW5saW5rKHJvdGF0ZWRQYXRoKE1BWF9ST1RBVEVEX0ZJTEVTKSk7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHQvLyBObyBvbGRlc3Qgc2VnbWVudCB5ZXQuXG5cdFx0fVxuXHRcdGZvciAobGV0IGluZGV4ID0gTUFYX1JPVEFURURfRklMRVMgLSAxOyBpbmRleCA+PSAxOyBpbmRleC0tKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCByZW5hbWUocm90YXRlZFBhdGgoaW5kZXgpLCByb3RhdGVkUGF0aChpbmRleCArIDEpKTtcblx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHQvLyBObyBzZWdtZW50IGF0IHRoaXMgaW5kZXggeWV0LlxuXHRcdFx0fVxuXHRcdH1cblx0XHRhd2FpdCByZW5hbWUocGF0aCwgcm90YXRlZFBhdGgoMSkpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLGdCQUFnQixXQUFXLGdCQUFnQjtBQUNwRCxTQUFTLFlBQVksUUFBUSxjQUFjO0FBQzNDLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsWUFBWTtBQUVyQixTQUFTLDJCQUEyQix3QkFBd0I7QUFJNUQsTUFBTSxnQkFBd0Q7QUFBQSxFQUM3RCxVQUFVO0FBQUEsRUFDVixNQUFNO0FBQUEsRUFDTixPQUFPO0FBQUEsRUFDUCxPQUFPO0FBQUEsRUFDUCxPQUFPO0FBQUEsRUFDUCxVQUFVO0FBQUEsRUFDVixVQUFVO0FBQUEsRUFDVixRQUFRO0FBQUEsRUFDUixTQUFTO0FBQ1Y7QUFFQSxNQUFNLGFBQWE7QUFDbkIsTUFBTSx3QkFBd0I7QUFBQSxFQUM3QjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUNEO0FBRUEsTUFBTSxrQkFBa0IsTUFBTTtBQUM5QixNQUFNLGlCQUFpQixJQUFJLE9BQU87QUFDbEMsTUFBTSxvQkFBb0I7QUFDMUIsTUFBTSxzQkFBc0I7QUFFNUIsSUFBSTtBQUVHLFNBQVMsNkJBQTZCLEtBQTRDO0FBQ3hGLDhCQUE0QjtBQUM3QjtBQUVPLFNBQVMsK0JBQWdFO0FBQy9FLFNBQU87QUFDUjtBQUVPLFNBQVMsMkJBQTJCLE9BQWdCLEtBQWMsT0FBTyxvQkFBSSxJQUFZLEdBQVk7QUFDM0csTUFBSSxPQUFPLFdBQVcsS0FBSyxHQUFHLEdBQUc7QUFDaEMsV0FBTztBQUFBLEVBQ1I7QUFDQSxNQUFJLE9BQU8sVUFBVSxVQUFVO0FBQzlCLFVBQU0sZ0JBQWdCLE1BQU0sUUFBUSxPQUFPLEVBQUU7QUFDN0MsUUFBSSxjQUFjLFVBQVUsUUFBUyxjQUFjLFNBQVMsTUFBTSxLQUFLLHlCQUF5QixLQUFLLGFBQWEsR0FBRztBQUNwSCxhQUFPLHlCQUF5QixNQUFNLE1BQU0sV0FBVyxXQUFXLFFBQVEsRUFBRSxPQUFPLEtBQUssRUFBRSxPQUFPLEtBQUssQ0FBQztBQUFBLElBQ3hHO0FBQ0EsUUFBSSxXQUFXO0FBQ2YsYUFBUyxRQUFRLEdBQUcsUUFBUSxzQkFBc0IsUUFBUSxTQUFTO0FBQ2xFLFlBQU0sVUFBVSxzQkFBc0IsS0FBSztBQUMzQyxpQkFBVyxVQUFVLElBQ2xCLFNBQVMsUUFBUSxTQUFTLGdCQUFnQixJQUMxQyxTQUFTLFFBQVEsU0FBUyxZQUFZO0FBQUEsSUFDMUM7QUFDQSxXQUFPLFNBQVMsU0FBUyxrQkFBa0IsR0FBRyxTQUFTLE1BQU0sR0FBRyxlQUFlLENBQUM7QUFBQSxXQUFjLFNBQVMsU0FBUyxlQUFlLFlBQVk7QUFBQSxFQUM1STtBQUNBLE1BQUksQ0FBQyxTQUFTLE9BQU8sVUFBVSxVQUFVO0FBQ3hDLFdBQU87QUFBQSxFQUNSO0FBQ0EsTUFBSSxZQUFZLE9BQU8sS0FBSyxHQUFHO0FBQzlCLFVBQU0sUUFBUSxPQUFPLEtBQUssTUFBTSxRQUFRLE1BQU0sWUFBWSxNQUFNLFVBQVU7QUFDMUUsV0FBTyx5QkFBeUIsTUFBTSxVQUFVLFdBQVcsV0FBVyxRQUFRLEVBQUUsT0FBTyxLQUFLLEVBQUUsT0FBTyxLQUFLLENBQUM7QUFBQSxFQUM1RztBQUNBLE1BQUksaUJBQWlCLGFBQWE7QUFDakMsVUFBTSxRQUFRLE9BQU8sS0FBSyxLQUFLO0FBQy9CLFdBQU8seUJBQXlCLE1BQU0sVUFBVSxXQUFXLFdBQVcsUUFBUSxFQUFFLE9BQU8sS0FBSyxFQUFFLE9BQU8sS0FBSyxDQUFDO0FBQUEsRUFDNUc7QUFDQSxNQUFJLEtBQUssSUFBSSxLQUFLLEdBQUc7QUFDcEIsV0FBTztBQUFBLEVBQ1I7QUFDQSxPQUFLLElBQUksS0FBSztBQUNkLE1BQUk7QUFDSCxRQUFJLE1BQU0sUUFBUSxLQUFLLEdBQUc7QUFDekIsYUFBTyxNQUFNLElBQUksVUFBUSwyQkFBMkIsTUFBTSxRQUFXLElBQUksQ0FBQztBQUFBLElBQzNFO0FBQ0EsVUFBTSxTQUFrQyxDQUFDO0FBQ3pDLGVBQVcsQ0FBQyxVQUFVLFVBQVUsS0FBSyxPQUFPLFFBQVEsS0FBSyxHQUFHO0FBQzNELGFBQU8sUUFBUSxJQUFJLDJCQUEyQixZQUFZLFVBQVUsSUFBSTtBQUFBLElBQ3pFO0FBQ0EsV0FBTztBQUFBLEVBQ1IsVUFBRTtBQUNELFNBQUssT0FBTyxLQUFLO0FBQUEsRUFDbEI7QUFDRDtBQUVBLFNBQVMsWUFBWSxPQUF3QjtBQUM1QyxNQUFJO0FBQ0gsV0FBTyxLQUFLLFVBQVUsMkJBQTJCLEtBQUssQ0FBQztBQUFBLEVBQ3hELFNBQVMsT0FBTztBQUNmLFdBQU8sS0FBSyxVQUFVLEVBQUUsb0JBQW9CLE9BQU8sS0FBSyxFQUFFLENBQUM7QUFBQSxFQUM1RDtBQUNEO0FBY08sTUFBTSxvQkFBb0I7QUFBQSxFQVloQyxZQUFZLFVBQWdDLFVBQVUsY0FBYztBQUF4QjtBQVY1QyxTQUFpQixZQUFZLGlCQUFpQjtBQUM5QyxTQUFpQixXQUFXLEtBQUssSUFBSTtBQUNyQyxTQUFpQixVQUFVLG9CQUFJLElBQXNCO0FBQ3JELFNBQWlCLFdBQVcsb0JBQUksSUFBNkI7QUFDN0QsU0FBaUIsY0FBYyxvQkFBSSxJQUE2QjtBQUVoRSxTQUFRLGdCQUErQixRQUFRLFFBQVE7QUFDdkQsU0FBUSxZQUFZO0FBQ3BCLFNBQVEsWUFBWTtBQUduQixTQUFLLGFBQWEsU0FBUztBQUMzQixjQUFVLEtBQUssWUFBWSxFQUFFLFdBQVcsS0FBSyxDQUFDO0FBQzlDLGVBQVcsQ0FBQyxTQUFTLElBQUksS0FBSyxPQUFPLFFBQVEsYUFBYSxHQUFHO0FBQzVELFlBQU0sT0FBTyxLQUFLLEtBQUssWUFBWSxJQUFJO0FBQ3ZDLFVBQUk7QUFDSCxZQUFJLFNBQVMsSUFBSSxFQUFFLE9BQU8sR0FBRztBQUM1QjtBQUFBLFFBQ0Q7QUFBQSxNQUNELFFBQVE7QUFBQSxNQUVSO0FBQ0EscUJBQWUsTUFBTSxXQUFXLFFBQVEsWUFBWSxDQUFDLGlCQUFpQixLQUFLLE9BQU87QUFBQSxHQUF1QixNQUFNO0FBQUEsSUFDaEg7QUFDQSxTQUFLLE9BQU8sWUFBWSxpQkFBaUIsRUFBRSxLQUFLLFFBQVEsS0FBSyxRQUFRLEtBQUssUUFBUSxDQUFDO0FBQUEsRUFDcEY7QUFBQSxFQUVBLE9BQU8sU0FBaUMsTUFBYyxNQUFnQixVQUFtQyxDQUFDLEdBQVc7QUFDcEgsUUFBSSxLQUFLLFdBQVc7QUFDbkIsYUFBTztBQUFBLElBQ1I7QUFDQSxVQUFNLE1BQU0sb0JBQUksS0FBSztBQUNyQixVQUFNLEtBQUssS0FBSyxLQUFLLE9BQU8sSUFBSSxPQUFPLEVBQUUsS0FBSyxTQUFTLEVBQUUsU0FBUyxHQUFHLEdBQUcsQ0FBQztBQUN6RSxVQUFNLFVBQVUsS0FBSyxJQUFJLElBQUksS0FBSztBQUNsQyxVQUFNLFNBQVMsT0FBTyxLQUFLLE9BQU8sRUFBRSxTQUFTLGNBQWMsWUFBWSxPQUFPLENBQUMsS0FBSztBQUNwRixVQUFNLFVBQVUsU0FBUyxTQUFZLEtBQUssV0FBVyxZQUFZLElBQUksQ0FBQztBQUN0RSxTQUFLLFNBQVMsY0FBYyxPQUFPLEdBQUcsR0FBRywwQkFBMEIsS0FBSyxLQUFLLFNBQVMsQ0FBQyxPQUFPLE9BQU8sUUFBUSxFQUFFLE1BQU0sSUFBSSxHQUFHLE1BQU0sR0FBRyxPQUFPO0FBQUEsQ0FBSTtBQUNoSixXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsV0FBVyxTQUFpQyxNQUFjLFNBQWlCLFVBQW1DLENBQUMsR0FBVztBQUN6SCxRQUFJLEtBQUssV0FBVztBQUNuQixhQUFPO0FBQUEsSUFDUjtBQUNBLFVBQU0sS0FBSyxLQUFLLE9BQU8sU0FBUyxHQUFHLElBQUksVUFBVSxFQUFFLE9BQU8sUUFBUSxPQUFPLEdBQUcsT0FBTztBQUNuRixVQUFNLE1BQU0sS0FBSyxRQUFRLG9CQUFvQixHQUFHLEVBQUUsWUFBWTtBQUM5RCxVQUFNLE9BQU8sT0FBTywyQkFBMkIsT0FBTyxDQUFDO0FBQ3ZELFNBQUssU0FBUyxjQUFjLE9BQU8sR0FBRyxXQUFXLEdBQUcsT0FBTyxFQUFFO0FBQUEsRUFBSyxJQUFJO0FBQUEsUUFBVyxHQUFHLE9BQU8sRUFBRTtBQUFBLENBQUk7QUFDakcsV0FBTztBQUFBLEVBQ1I7QUFBQTtBQUFBLEVBR0EsYUFBYSxTQUFpQyxXQUFtQixNQUFjLFNBQWlCLFVBQW1DLENBQUMsR0FBUztBQUM1SSxRQUFJLENBQUMsV0FBVyxLQUFLLFdBQVc7QUFDL0I7QUFBQSxJQUNEO0FBQ0EsUUFBSSxZQUFZLFlBQVk7QUFDM0IsZ0JBQVUsUUFBUSxRQUFRLHFCQUFxQixFQUFFO0FBQUEsSUFDbEQ7QUFDQSxVQUFNLFdBQVcsS0FBSyxTQUFTLElBQUksU0FBUztBQUM1QyxRQUFJLFVBQVU7QUFDYixlQUFTLFdBQVc7QUFDcEIsVUFBSSxTQUFTLFFBQVEsVUFBVSxLQUFLLE1BQU07QUFDekMsYUFBSyxhQUFhLFNBQVM7QUFBQSxNQUM1QjtBQUNBO0FBQUEsSUFDRDtBQUNBLFVBQU0sU0FBMEI7QUFBQSxNQUMvQjtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0EsT0FBTyxXQUFXLE1BQU0sS0FBSyxhQUFhLFNBQVMsR0FBRyxHQUFHO0FBQUEsSUFDMUQ7QUFDQSxTQUFLLFNBQVMsSUFBSSxXQUFXLE1BQU07QUFBQSxFQUNwQztBQUFBO0FBQUEsRUFHQSxpQkFBaUIsU0FBaUMsV0FBbUIsTUFBYyxTQUFpQixVQUFtQyxDQUFDLEdBQVM7QUFDaEosUUFBSSxLQUFLLFdBQVc7QUFDbkI7QUFBQSxJQUNEO0FBQ0EsVUFBTSxXQUFXLEtBQUssWUFBWSxJQUFJLFNBQVM7QUFDL0MsUUFBSSxVQUFVO0FBQ2IsbUJBQWEsU0FBUyxLQUFLO0FBQUEsSUFDNUI7QUFDQSxVQUFNLFNBQTBCO0FBQUEsTUFDL0I7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBLE9BQU8sV0FBVyxNQUFNLEtBQUssaUJBQWlCLFNBQVMsR0FBRyxHQUFHO0FBQUEsSUFDOUQ7QUFDQSxTQUFLLFlBQVksSUFBSSxXQUFXLE1BQU07QUFBQSxFQUN2QztBQUFBLEVBRUEsYUFBYSxRQUF1QjtBQUNuQyxlQUFXLE9BQU8sQ0FBQyxHQUFHLEtBQUssU0FBUyxLQUFLLENBQUMsR0FBRztBQUM1QyxVQUFJLENBQUMsVUFBVSxJQUFJLFdBQVcsTUFBTSxHQUFHO0FBQ3RDLGFBQUssYUFBYSxHQUFHO0FBQUEsTUFDdEI7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUFBLEVBRUEsZ0JBQWdCLFFBQXVCO0FBQ3RDLGVBQVcsT0FBTyxDQUFDLEdBQUcsS0FBSyxZQUFZLEtBQUssQ0FBQyxHQUFHO0FBQy9DLFVBQUksQ0FBQyxVQUFVLElBQUksV0FBVyxNQUFNLEdBQUc7QUFDdEMsYUFBSyxpQkFBaUIsR0FBRztBQUFBLE1BQzFCO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFBQSxFQUVBLE1BQU0sUUFBdUI7QUFDNUIsU0FBSyxhQUFhO0FBQ2xCLFNBQUssZ0JBQWdCO0FBQ3JCLFFBQUksS0FBSyxhQUFhO0FBQ3JCLG1CQUFhLEtBQUssV0FBVztBQUM3QixXQUFLLGNBQWM7QUFBQSxJQUNwQjtBQUNBLFVBQU0sS0FBSyxlQUFlLElBQUk7QUFDOUIsVUFBTSxLQUFLO0FBQUEsRUFDWjtBQUFBLEVBRUEsVUFBZ0I7QUFDZixRQUFJLEtBQUssV0FBVztBQUNuQjtBQUFBLElBQ0Q7QUFDQSxTQUFLLGFBQWE7QUFDbEIsU0FBSyxnQkFBZ0I7QUFDckIsU0FBSyxPQUFPLFdBQVcsZ0JBQWdCLEVBQUUsS0FBSyxRQUFRLElBQUksQ0FBQztBQUMzRCxTQUFLLEtBQUssTUFBTTtBQUNoQixTQUFLLFlBQVk7QUFDakIsUUFBSSw4QkFBOEIsTUFBTTtBQUN2QyxrQ0FBNEI7QUFBQSxJQUM3QjtBQUFBLEVBQ0Q7QUFBQSxFQUVRLGFBQWEsS0FBbUI7QUFDdkMsVUFBTSxTQUFTLEtBQUssU0FBUyxJQUFJLEdBQUc7QUFDcEMsUUFBSSxDQUFDLFFBQVE7QUFDWjtBQUFBLElBQ0Q7QUFDQSxpQkFBYSxPQUFPLEtBQUs7QUFDekIsU0FBSyxTQUFTLE9BQU8sR0FBRztBQUN4QixTQUFLLFdBQVcsT0FBTyxTQUFTLE9BQU8sTUFBTSxPQUFPLFNBQVMsT0FBTyxPQUFPO0FBQUEsRUFDNUU7QUFBQSxFQUVRLGlCQUFpQixLQUFtQjtBQUMzQyxVQUFNLFNBQVMsS0FBSyxZQUFZLElBQUksR0FBRztBQUN2QyxRQUFJLENBQUMsUUFBUTtBQUNaO0FBQUEsSUFDRDtBQUNBLGlCQUFhLE9BQU8sS0FBSztBQUN6QixTQUFLLFlBQVksT0FBTyxHQUFHO0FBQzNCLFNBQUssV0FBVyxPQUFPLFNBQVMsT0FBTyxNQUFNLE9BQU8sU0FBUyxPQUFPLE9BQU87QUFBQSxFQUM1RTtBQUFBLEVBRVEsU0FBUyxNQUFjLE1BQW9CO0FBQ2xELFFBQUksUUFBUSxLQUFLLFFBQVEsSUFBSSxJQUFJO0FBQ2pDLFFBQUksQ0FBQyxPQUFPO0FBQ1gsY0FBUSxDQUFDO0FBQ1QsV0FBSyxRQUFRLElBQUksTUFBTSxLQUFLO0FBQUEsSUFDN0I7QUFDQSxVQUFNLEtBQUssSUFBSTtBQUNmLFFBQUksQ0FBQyxLQUFLLGFBQWE7QUFDdEIsV0FBSyxjQUFjLFdBQVcsTUFBTTtBQUNuQyxhQUFLLGNBQWM7QUFDbkIsYUFBSyxLQUFLLGVBQWUsS0FBSztBQUFBLE1BQy9CLEdBQUcsR0FBRztBQUFBLElBQ1A7QUFBQSxFQUNEO0FBQUEsRUFFQSxNQUFjLGVBQWUsT0FBK0I7QUFDM0QsUUFBSSxDQUFDLFNBQVMsS0FBSyxRQUFRLFNBQVMsR0FBRztBQUN0QztBQUFBLElBQ0Q7QUFDQSxVQUFNLFVBQVUsQ0FBQyxHQUFHLEtBQUssT0FBTyxFQUFFLElBQUksQ0FBQyxDQUFDLE1BQU0sTUFBTSxNQUFNLENBQUMsTUFBTSxPQUFPLEtBQUssRUFBRSxDQUFDLENBQVU7QUFDMUYsU0FBSyxRQUFRLE1BQU07QUFDbkIsU0FBSyxnQkFBZ0IsS0FBSyxjQUFjLEtBQUssWUFBWTtBQUN4RCxpQkFBVyxDQUFDLE1BQU0sSUFBSSxLQUFLLFNBQVM7QUFDbkMsY0FBTSxPQUFPLEtBQUssS0FBSyxZQUFZLElBQUk7QUFDdkMsWUFBSTtBQUNILGNBQUksU0FBUyxJQUFJLEVBQUUsT0FBTyxPQUFPLFdBQVcsTUFBTSxNQUFNLElBQUksZ0JBQWdCO0FBQzNFLGtCQUFNLEtBQUssUUFBUSxJQUFJO0FBQUEsVUFDeEI7QUFBQSxRQUNELFFBQVE7QUFBQSxRQUVSO0FBQ0EsY0FBTSxXQUFXLE1BQU0sTUFBTSxNQUFNO0FBQUEsTUFDcEM7QUFBQSxJQUNELENBQUMsRUFBRSxNQUFNLFdBQVMsUUFBUSxNQUFNLHFEQUFxRCxLQUFLLENBQUM7QUFDM0YsVUFBTSxLQUFLO0FBQUEsRUFDWjtBQUFBLEVBRUEsTUFBYyxRQUFRLE1BQTZCO0FBQ2xELFVBQU0sY0FBYyxDQUFDLFVBQWtCLEtBQUssUUFBUSxVQUFVLElBQUksS0FBSyxNQUFNO0FBQzdFLFFBQUk7QUFDSCxZQUFNLE9BQU8sWUFBWSxpQkFBaUIsQ0FBQztBQUFBLElBQzVDLFFBQVE7QUFBQSxJQUVSO0FBQ0EsYUFBUyxRQUFRLG9CQUFvQixHQUFHLFNBQVMsR0FBRyxTQUFTO0FBQzVELFVBQUk7QUFDSCxjQUFNLE9BQU8sWUFBWSxLQUFLLEdBQUcsWUFBWSxRQUFRLENBQUMsQ0FBQztBQUFBLE1BQ3hELFFBQVE7QUFBQSxNQUVSO0FBQUEsSUFDRDtBQUNBLFVBQU0sT0FBTyxNQUFNLFlBQVksQ0FBQyxDQUFDO0FBQUEsRUFDbEM7QUFDRDsiLAogICJuYW1lcyI6IFtdCn0K
