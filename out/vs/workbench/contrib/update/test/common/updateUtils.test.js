import assert from "assert";
import * as sinon from "sinon";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { StateType } from "../../../../../platform/update/common/update.js";
import { computeDownloadSpeed, computeDownloadTimeRemaining, computeProgressPercent, computeUpdateInfoVersion, formatBytes, formatDate, formatTimeRemaining, getUpdateInfoUrl, isMajorMinorVersionChange, tryParseDate } from "../../common/updateUtils.js";
suite("UpdateUtils", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  let clock;
  setup(() => {
    clock = sinon.useFakeTimers();
  });
  teardown(() => {
    clock.restore();
  });
  function DownloadingState(downloadedBytes, totalBytes, startTime) {
    return { type: StateType.Downloading, explicit: true, overwrite: false, downloadedBytes, totalBytes, startTime };
  }
  suite("computeProgressPercent", () => {
    test("handles invalid values", () => {
      assert.strictEqual(computeProgressPercent(void 0, 100), void 0);
      assert.strictEqual(computeProgressPercent(50, void 0), void 0);
      assert.strictEqual(computeProgressPercent(void 0, void 0), void 0);
      assert.strictEqual(computeProgressPercent(50, 0), void 0);
      assert.strictEqual(computeProgressPercent(50, -10), void 0);
    });
    test("computes correct percentage", () => {
      assert.strictEqual(computeProgressPercent(0, 100), 0);
      assert.strictEqual(computeProgressPercent(50, 100), 50);
      assert.strictEqual(computeProgressPercent(100, 100), 100);
      assert.strictEqual(computeProgressPercent(1, 3), 33);
      assert.strictEqual(computeProgressPercent(2, 3), 67);
    });
    test("clamps to 0-100 range", () => {
      assert.strictEqual(computeProgressPercent(-10, 100), 0);
      assert.strictEqual(computeProgressPercent(200, 100), 100);
    });
  });
  suite("computeDownloadTimeRemaining", () => {
    test("returns undefined for invalid or incomplete input", () => {
      const now = Date.now();
      assert.strictEqual(computeDownloadTimeRemaining(DownloadingState()), void 0);
      assert.strictEqual(computeDownloadTimeRemaining(DownloadingState(500, void 0, now)), void 0);
      assert.strictEqual(computeDownloadTimeRemaining(DownloadingState(void 0, 1e3, now)), void 0);
      assert.strictEqual(computeDownloadTimeRemaining(DownloadingState(500, 1e3, void 0)), void 0);
      assert.strictEqual(computeDownloadTimeRemaining(DownloadingState(0, 1e3, now - 1e3)), void 0);
      assert.strictEqual(computeDownloadTimeRemaining(DownloadingState(500, 0, now - 1e3)), void 0);
      assert.strictEqual(computeDownloadTimeRemaining(DownloadingState(500, 1e3, now + 1e3)), void 0);
      assert.strictEqual(computeDownloadTimeRemaining(DownloadingState(-100, 1e3, now - 1e3)), void 0);
    });
    test("returns 0 when download is complete or over-downloaded", () => {
      const now = Date.now();
      assert.strictEqual(computeDownloadTimeRemaining(DownloadingState(1e3, 1e3, now - 1e3)), 0);
      assert.strictEqual(computeDownloadTimeRemaining(DownloadingState(1500, 1e3, now - 1e3)), 0);
    });
    test("computes correct time remaining", () => {
      const now = Date.now();
      assert.strictEqual(computeDownloadTimeRemaining(DownloadingState(500, 1e3, now - 1e3)), 1);
      const downloadedBytes = 100 * 1024 * 1024;
      const totalBytes = 200 * 1024 * 1024;
      assert.strictEqual(computeDownloadTimeRemaining(DownloadingState(downloadedBytes, totalBytes, now - 1e4)), 10);
      assert.strictEqual(computeDownloadTimeRemaining(DownloadingState(900, 1e3, now - 900)), 1);
      const downloaded50MB = 50 * 1024 * 1024;
      const total100MB = 100 * 1024 * 1024;
      assert.strictEqual(computeDownloadTimeRemaining(DownloadingState(downloaded50MB, total100MB, now - 5e4)), 50);
    });
  });
  suite("computeDownloadSpeed", () => {
    test("returns undefined for invalid or incomplete input", () => {
      const now = Date.now();
      assert.strictEqual(computeDownloadSpeed(DownloadingState(void 0, 1e3, now - 1e3)), void 0);
      assert.strictEqual(computeDownloadSpeed(DownloadingState(500, 1e3, void 0)), void 0);
      assert.strictEqual(computeDownloadSpeed(DownloadingState(void 0, void 0, void 0)), void 0);
    });
    test("returns undefined for zero or negative elapsed time", () => {
      const now = Date.now();
      assert.strictEqual(computeDownloadSpeed(DownloadingState(500, 1e3, now + 1e3)), void 0);
    });
    test("returns undefined for zero downloaded bytes", () => {
      const now = Date.now();
      assert.strictEqual(computeDownloadSpeed(DownloadingState(0, 1e3, now - 1e3)), void 0);
    });
    test("computes correct download speed in bytes per second", () => {
      const now = Date.now();
      const speed1 = computeDownloadSpeed(DownloadingState(1e3, 2e3, now - 1e3));
      assert.ok(speed1 !== void 0);
      assert.ok(Math.abs(speed1 - 1e3) < 50);
      const tenMB = 10 * 1024 * 1024;
      const speed2 = computeDownloadSpeed(DownloadingState(tenMB, tenMB * 2, now - 1e4));
      assert.ok(speed2 !== void 0);
      const expectedSpeed = 1024 * 1024;
      assert.ok(Math.abs(speed2 - expectedSpeed) < expectedSpeed * 0.01);
    });
  });
  suite("computeUpdateInfoVersion", () => {
    test("returns minor .0 version when minor differs", () => {
      assert.strictEqual(computeUpdateInfoVersion("1.108.2", "1.109.5"), "1.109");
      assert.strictEqual(computeUpdateInfoVersion("1.108.0", "1.109.0"), "1.109");
      assert.strictEqual(computeUpdateInfoVersion("1.107.3", "1.110.1"), "1.110");
    });
    test("returns target version as-is when same minor", () => {
      assert.strictEqual(computeUpdateInfoVersion("1.109.2", "1.109.5"), "1.109.5");
      assert.strictEqual(computeUpdateInfoVersion("1.109.0", "1.109.3"), "1.109.3");
    });
    test("returns minor .0 version when major differs", () => {
      assert.strictEqual(computeUpdateInfoVersion("1.109.2", "2.0.1"), "2.0");
    });
    test("returns undefined for invalid versions", () => {
      assert.strictEqual(computeUpdateInfoVersion("invalid", "1.109.5"), void 0);
      assert.strictEqual(computeUpdateInfoVersion("1.109.2", "invalid"), void 0);
    });
  });
  suite("getUpdateInfoUrl", () => {
    test("constructs correct URL for .0 versions", () => {
      assert.strictEqual(getUpdateInfoUrl("1.109.0"), "https://code.visualstudio.com/raw/v1_109_update.md");
    });
    test("constructs correct URL for patch versions", () => {
      assert.strictEqual(getUpdateInfoUrl("1.109.5"), "https://code.visualstudio.com/raw/v1_109_5_update.md");
    });
  });
  suite("formatTimeRemaining", () => {
    test("formats seconds for values less than 1 minute", () => {
      assert.strictEqual(formatTimeRemaining(1), "1s");
      assert.strictEqual(formatTimeRemaining(30), "30s");
      assert.strictEqual(formatTimeRemaining(59), "59s");
    });
    test("formats minutes for values between 1 minute and 1 hour", () => {
      assert.strictEqual(formatTimeRemaining(60), "1 min");
      assert.strictEqual(formatTimeRemaining(120), "2 min");
      assert.strictEqual(formatTimeRemaining(90), "1 min");
      assert.strictEqual(formatTimeRemaining(3599), "59 min");
    });
    test("formats fractional hours for values >= 1 hour", () => {
      assert.strictEqual(formatTimeRemaining(3600), "1 hour");
      assert.strictEqual(formatTimeRemaining(5400), "1.5 hours");
      assert.strictEqual(formatTimeRemaining(7200), "2 hours");
      assert.strictEqual(formatTimeRemaining(9e3), "2.5 hours");
      assert.strictEqual(formatTimeRemaining(3960), "1.1 hours");
    });
  });
  suite("formatBytes", () => {
    test("formats bytes for values less than 1 KB", () => {
      assert.strictEqual(formatBytes(0), "0 B");
      assert.strictEqual(formatBytes(1), "1 B");
      assert.strictEqual(formatBytes(512), "512 B");
      assert.strictEqual(formatBytes(1023), "1023 B");
    });
    test("formats kilobytes for values between 1 KB and 1 MB", () => {
      assert.strictEqual(formatBytes(1024), "1 KB");
      assert.strictEqual(formatBytes(1536), "1.5 KB");
      assert.strictEqual(formatBytes(2048), "2 KB");
      assert.strictEqual(formatBytes(1024 * 100), "100 KB");
      assert.strictEqual(formatBytes(1024 * 1023), "1023 KB");
    });
    test("formats megabytes for values between 1 MB and 1 GB", () => {
      assert.strictEqual(formatBytes(1024 * 1024), "1 MB");
      assert.strictEqual(formatBytes(1024 * 1024 * 1.5), "1.5 MB");
      assert.strictEqual(formatBytes(1024 * 1024 * 100), "100 MB");
      assert.strictEqual(formatBytes(1024 * 1024 * 512), "512 MB");
    });
    test("formats gigabytes for values >= 1 GB", () => {
      assert.strictEqual(formatBytes(1024 * 1024 * 1024), "1 GB");
      assert.strictEqual(formatBytes(1024 * 1024 * 1024 * 1.5), "1.5 GB");
      assert.strictEqual(formatBytes(1024 * 1024 * 1024 * 10), "10 GB");
    });
    test("rounds to one decimal place correctly", () => {
      assert.strictEqual(formatBytes(1126), "1.1 KB");
      assert.strictEqual(formatBytes(1075), "1 KB");
      assert.strictEqual(formatBytes(1024 * 1024 * 25.35), "25.4 MB");
    });
  });
  suite("tryParseDate", () => {
    test("returns undefined for undefined input", () => {
      assert.strictEqual(tryParseDate(void 0), void 0);
    });
    test("returns undefined for invalid date strings", () => {
      assert.strictEqual(tryParseDate(""), void 0);
      assert.strictEqual(tryParseDate("not-a-date"), void 0);
    });
    test("parses valid ISO date strings", () => {
      const result = tryParseDate("2026-02-06T05:03:03.991Z");
      assert.ok(result !== void 0);
      assert.strictEqual(typeof result, "number");
      assert.ok(result > 0);
    });
  });
  suite("formatDate", () => {
    test("formats a timestamp as a readable date", () => {
      const result = formatDate(17052768e5);
      assert.ok(result.length > 0);
      assert.ok(result.includes("2024"));
    });
  });
  suite("isMajorMinorVersionChange", () => {
    test("returns true for major version change", () => {
      assert.strictEqual(isMajorMinorVersionChange("1.90.0", "2.0.0"), true);
    });
    test("returns true for minor version change", () => {
      assert.strictEqual(isMajorMinorVersionChange("1.90.0", "1.91.0"), true);
    });
    test("returns false for patch-only change", () => {
      assert.strictEqual(isMajorMinorVersionChange("1.90.0", "1.90.1"), false);
    });
    test("returns false for identical versions", () => {
      assert.strictEqual(isMajorMinorVersionChange("1.90.0", "1.90.0"), false);
    });
    test("returns false when previous version is undefined", () => {
      assert.strictEqual(isMajorMinorVersionChange(void 0, "1.90.0"), false);
    });
    test("returns false when new version is undefined", () => {
      assert.strictEqual(isMajorMinorVersionChange("1.90.0", void 0), false);
    });
    test("returns false when both versions are undefined", () => {
      assert.strictEqual(isMajorMinorVersionChange(void 0, void 0), false);
    });
    test("returns false for unparseable versions", () => {
      assert.strictEqual(isMajorMinorVersionChange("invalid", "1.90.0"), false);
      assert.strictEqual(isMajorMinorVersionChange("1.90.0", "invalid"), false);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHVwZGF0ZVxcdGVzdFxcY29tbW9uXFx1cGRhdGVVdGlscy50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0ICogYXMgc2lub24gZnJvbSAnc2lub24nO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBEb3dubG9hZGluZywgU3RhdGVUeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXBkYXRlL2NvbW1vbi91cGRhdGUuanMnO1xuaW1wb3J0IHsgY29tcHV0ZURvd25sb2FkU3BlZWQsIGNvbXB1dGVEb3dubG9hZFRpbWVSZW1haW5pbmcsIGNvbXB1dGVQcm9ncmVzc1BlcmNlbnQsIGNvbXB1dGVVcGRhdGVJbmZvVmVyc2lvbiwgZm9ybWF0Qnl0ZXMsIGZvcm1hdERhdGUsIGZvcm1hdFRpbWVSZW1haW5pbmcsIGdldFVwZGF0ZUluZm9VcmwsIGlzTWFqb3JNaW5vclZlcnNpb25DaGFuZ2UsIHRyeVBhcnNlRGF0ZSB9IGZyb20gJy4uLy4uL2NvbW1vbi91cGRhdGVVdGlscy5qcyc7XG5cbnN1aXRlKCdVcGRhdGVVdGlscycsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0bGV0IGNsb2NrOiBzaW5vbi5TaW5vbkZha2VUaW1lcnM7XG5cblx0c2V0dXAoKCkgPT4ge1xuXHRcdGNsb2NrID0gc2lub24udXNlRmFrZVRpbWVycygpO1xuXHR9KTtcblxuXHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0Y2xvY2sucmVzdG9yZSgpO1xuXHR9KTtcblxuXHRmdW5jdGlvbiBEb3dubG9hZGluZ1N0YXRlKGRvd25sb2FkZWRCeXRlcz86IG51bWJlciwgdG90YWxCeXRlcz86IG51bWJlciwgc3RhcnRUaW1lPzogbnVtYmVyKTogRG93bmxvYWRpbmcge1xuXHRcdHJldHVybiB7IHR5cGU6IFN0YXRlVHlwZS5Eb3dubG9hZGluZywgZXhwbGljaXQ6IHRydWUsIG92ZXJ3cml0ZTogZmFsc2UsIGRvd25sb2FkZWRCeXRlcywgdG90YWxCeXRlcywgc3RhcnRUaW1lIH07XG5cdH1cblxuXHRzdWl0ZSgnY29tcHV0ZVByb2dyZXNzUGVyY2VudCcsICgpID0+IHtcblx0XHR0ZXN0KCdoYW5kbGVzIGludmFsaWQgdmFsdWVzJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbXB1dGVQcm9ncmVzc1BlcmNlbnQodW5kZWZpbmVkLCAxMDApLCB1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbXB1dGVQcm9ncmVzc1BlcmNlbnQoNTAsIHVuZGVmaW5lZCksIHVuZGVmaW5lZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29tcHV0ZVByb2dyZXNzUGVyY2VudCh1bmRlZmluZWQsIHVuZGVmaW5lZCksIHVuZGVmaW5lZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29tcHV0ZVByb2dyZXNzUGVyY2VudCg1MCwgMCksIHVuZGVmaW5lZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29tcHV0ZVByb2dyZXNzUGVyY2VudCg1MCwgLTEwKSwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NvbXB1dGVzIGNvcnJlY3QgcGVyY2VudGFnZScsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb21wdXRlUHJvZ3Jlc3NQZXJjZW50KDAsIDEwMCksIDApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbXB1dGVQcm9ncmVzc1BlcmNlbnQoNTAsIDEwMCksIDUwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb21wdXRlUHJvZ3Jlc3NQZXJjZW50KDEwMCwgMTAwKSwgMTAwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb21wdXRlUHJvZ3Jlc3NQZXJjZW50KDEsIDMpLCAzMyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29tcHV0ZVByb2dyZXNzUGVyY2VudCgyLCAzKSwgNjcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY2xhbXBzIHRvIDAtMTAwIHJhbmdlJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbXB1dGVQcm9ncmVzc1BlcmNlbnQoLTEwLCAxMDApLCAwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb21wdXRlUHJvZ3Jlc3NQZXJjZW50KDIwMCwgMTAwKSwgMTAwKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2NvbXB1dGVEb3dubG9hZFRpbWVSZW1haW5pbmcnLCAoKSA9PiB7XG5cdFx0dGVzdCgncmV0dXJucyB1bmRlZmluZWQgZm9yIGludmFsaWQgb3IgaW5jb21wbGV0ZSBpbnB1dCcsICgpID0+IHtcblx0XHRcdGNvbnN0IG5vdyA9IERhdGUubm93KCk7XG5cblx0XHRcdC8vIE1pc3NpbmcgcGFyYW1ldGVyc1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbXB1dGVEb3dubG9hZFRpbWVSZW1haW5pbmcoRG93bmxvYWRpbmdTdGF0ZSgpKSwgdW5kZWZpbmVkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb21wdXRlRG93bmxvYWRUaW1lUmVtYWluaW5nKERvd25sb2FkaW5nU3RhdGUoNTAwLCB1bmRlZmluZWQsIG5vdykpLCB1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbXB1dGVEb3dubG9hZFRpbWVSZW1haW5pbmcoRG93bmxvYWRpbmdTdGF0ZSh1bmRlZmluZWQsIDEwMDAsIG5vdykpLCB1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbXB1dGVEb3dubG9hZFRpbWVSZW1haW5pbmcoRG93bmxvYWRpbmdTdGF0ZSg1MDAsIDEwMDAsIHVuZGVmaW5lZCkpLCB1bmRlZmluZWQpO1xuXG5cdFx0XHQvLyBaZXJvIG9yIG5lZ2F0aXZlIHZhbHVlc1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbXB1dGVEb3dubG9hZFRpbWVSZW1haW5pbmcoRG93bmxvYWRpbmdTdGF0ZSgwLCAxMDAwLCBub3cgLSAxMDAwKSksIHVuZGVmaW5lZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29tcHV0ZURvd25sb2FkVGltZVJlbWFpbmluZyhEb3dubG9hZGluZ1N0YXRlKDUwMCwgMCwgbm93IC0gMTAwMCkpLCB1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbXB1dGVEb3dubG9hZFRpbWVSZW1haW5pbmcoRG93bmxvYWRpbmdTdGF0ZSg1MDAsIDEwMDAsIG5vdyArIDEwMDApKSwgdW5kZWZpbmVkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb21wdXRlRG93bmxvYWRUaW1lUmVtYWluaW5nKERvd25sb2FkaW5nU3RhdGUoLTEwMCwgMTAwMCwgbm93IC0gMTAwMCkpLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyAwIHdoZW4gZG93bmxvYWQgaXMgY29tcGxldGUgb3Igb3Zlci1kb3dubG9hZGVkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgbm93ID0gRGF0ZS5ub3coKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb21wdXRlRG93bmxvYWRUaW1lUmVtYWluaW5nKERvd25sb2FkaW5nU3RhdGUoMTAwMCwgMTAwMCwgbm93IC0gMTAwMCkpLCAwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb21wdXRlRG93bmxvYWRUaW1lUmVtYWluaW5nKERvd25sb2FkaW5nU3RhdGUoMTUwMCwgMTAwMCwgbm93IC0gMTAwMCkpLCAwKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NvbXB1dGVzIGNvcnJlY3QgdGltZSByZW1haW5pbmcnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBub3cgPSBEYXRlLm5vdygpO1xuXG5cdFx0XHQvLyBTaW1wbGUgY2FzZTogRG93bmxvYWRlZCA1MDAgYnl0ZXMgb2YgMTAwMCBpbiAxMDAwbXMgPT4gMXMgcmVtYWluaW5nXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29tcHV0ZURvd25sb2FkVGltZVJlbWFpbmluZyhEb3dubG9hZGluZ1N0YXRlKDUwMCwgMTAwMCwgbm93IC0gMTAwMCkpLCAxKTtcblxuXHRcdFx0Ly8gMTAgc2Vjb25kcyByZW1haW5pbmc6IERvd25sb2FkZWQgMTAwTUIgb2YgMjAwTUIgaW4gMTBzXG5cdFx0XHRjb25zdCBkb3dubG9hZGVkQnl0ZXMgPSAxMDAgKiAxMDI0ICogMTAyNDtcblx0XHRcdGNvbnN0IHRvdGFsQnl0ZXMgPSAyMDAgKiAxMDI0ICogMTAyNDtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb21wdXRlRG93bmxvYWRUaW1lUmVtYWluaW5nKERvd25sb2FkaW5nU3RhdGUoZG93bmxvYWRlZEJ5dGVzLCB0b3RhbEJ5dGVzLCBub3cgLSAxMDAwMCkpLCAxMCk7XG5cblx0XHRcdC8vIFJvdW5kcyB1cDogOTAwIG9mIDEwMDAgYnl0ZXMgaW4gOTAwbXMgPT4gMTAwbXMgcmVtYWluaW5nID0+IHJvdW5kcyB0byAxc1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbXB1dGVEb3dubG9hZFRpbWVSZW1haW5pbmcoRG93bmxvYWRpbmdTdGF0ZSg5MDAsIDEwMDAsIG5vdyAtIDkwMCkpLCAxKTtcblxuXHRcdFx0Ly8gUmVhbGlzdGljIHNjZW5hcmlvOiA1ME1CIG9mIDEwME1CIGluIDUwcyA9PiA1MHMgcmVtYWluaW5nXG5cdFx0XHRjb25zdCBkb3dubG9hZGVkNTBNQiA9IDUwICogMTAyNCAqIDEwMjQ7XG5cdFx0XHRjb25zdCB0b3RhbDEwME1CID0gMTAwICogMTAyNCAqIDEwMjQ7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29tcHV0ZURvd25sb2FkVGltZVJlbWFpbmluZyhEb3dubG9hZGluZ1N0YXRlKGRvd25sb2FkZWQ1ME1CLCB0b3RhbDEwME1CLCBub3cgLSA1MDAwMCkpLCA1MCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cblx0c3VpdGUoJ2NvbXB1dGVEb3dubG9hZFNwZWVkJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3JldHVybnMgdW5kZWZpbmVkIGZvciBpbnZhbGlkIG9yIGluY29tcGxldGUgaW5wdXQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBub3cgPSBEYXRlLm5vdygpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbXB1dGVEb3dubG9hZFNwZWVkKERvd25sb2FkaW5nU3RhdGUodW5kZWZpbmVkLCAxMDAwLCBub3cgLSAxMDAwKSksIHVuZGVmaW5lZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29tcHV0ZURvd25sb2FkU3BlZWQoRG93bmxvYWRpbmdTdGF0ZSg1MDAsIDEwMDAsIHVuZGVmaW5lZCkpLCB1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbXB1dGVEb3dubG9hZFNwZWVkKERvd25sb2FkaW5nU3RhdGUodW5kZWZpbmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCkpLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyB1bmRlZmluZWQgZm9yIHplcm8gb3IgbmVnYXRpdmUgZWxhcHNlZCB0aW1lJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgbm93ID0gRGF0ZS5ub3coKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb21wdXRlRG93bmxvYWRTcGVlZChEb3dubG9hZGluZ1N0YXRlKDUwMCwgMTAwMCwgbm93ICsgMTAwMCkpLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyB1bmRlZmluZWQgZm9yIHplcm8gZG93bmxvYWRlZCBieXRlcycsICgpID0+IHtcblx0XHRcdGNvbnN0IG5vdyA9IERhdGUubm93KCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29tcHV0ZURvd25sb2FkU3BlZWQoRG93bmxvYWRpbmdTdGF0ZSgwLCAxMDAwLCBub3cgLSAxMDAwKSksIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjb21wdXRlcyBjb3JyZWN0IGRvd25sb2FkIHNwZWVkIGluIGJ5dGVzIHBlciBzZWNvbmQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBub3cgPSBEYXRlLm5vdygpO1xuXG5cdFx0XHQvLyAxMDAwIGJ5dGVzIGluIDEgc2Vjb25kID0gMTAwMCBCL3Ncblx0XHRcdGNvbnN0IHNwZWVkMSA9IGNvbXB1dGVEb3dubG9hZFNwZWVkKERvd25sb2FkaW5nU3RhdGUoMTAwMCwgMjAwMCwgbm93IC0gMTAwMCkpO1xuXHRcdFx0YXNzZXJ0Lm9rKHNwZWVkMSAhPT0gdW5kZWZpbmVkKTtcblx0XHRcdGFzc2VydC5vayhNYXRoLmFicyhzcGVlZDEgLSAxMDAwKSA8IDUwKTsgLy8gQWxsb3cgc21hbGwgdGltaW5nIHZhcmlhbmNlXG5cblx0XHRcdC8vIDEwIE1CIGluIDEwIHNlY29uZHMgPSAxIE1CL3MgPSAxMDQ4NTc2IEIvc1xuXHRcdFx0Y29uc3QgdGVuTUIgPSAxMCAqIDEwMjQgKiAxMDI0O1xuXHRcdFx0Y29uc3Qgc3BlZWQyID0gY29tcHV0ZURvd25sb2FkU3BlZWQoRG93bmxvYWRpbmdTdGF0ZSh0ZW5NQiwgdGVuTUIgKiAyLCBub3cgLSAxMDAwMCkpO1xuXHRcdFx0YXNzZXJ0Lm9rKHNwZWVkMiAhPT0gdW5kZWZpbmVkKTtcblx0XHRcdGNvbnN0IGV4cGVjdGVkU3BlZWQgPSAxMDI0ICogMTAyNDsgLy8gMSBNQi9zXG5cdFx0XHRhc3NlcnQub2soTWF0aC5hYnMoc3BlZWQyIC0gZXhwZWN0ZWRTcGVlZCkgPCBleHBlY3RlZFNwZWVkICogMC4wMSk7IC8vIFdpdGhpbiAxJVxuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnY29tcHV0ZVVwZGF0ZUluZm9WZXJzaW9uJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3JldHVybnMgbWlub3IgLjAgdmVyc2lvbiB3aGVuIG1pbm9yIGRpZmZlcnMnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29tcHV0ZVVwZGF0ZUluZm9WZXJzaW9uKCcxLjEwOC4yJywgJzEuMTA5LjUnKSwgJzEuMTA5Jyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29tcHV0ZVVwZGF0ZUluZm9WZXJzaW9uKCcxLjEwOC4wJywgJzEuMTA5LjAnKSwgJzEuMTA5Jyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29tcHV0ZVVwZGF0ZUluZm9WZXJzaW9uKCcxLjEwNy4zJywgJzEuMTEwLjEnKSwgJzEuMTEwJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIHRhcmdldCB2ZXJzaW9uIGFzLWlzIHdoZW4gc2FtZSBtaW5vcicsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb21wdXRlVXBkYXRlSW5mb1ZlcnNpb24oJzEuMTA5LjInLCAnMS4xMDkuNScpLCAnMS4xMDkuNScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbXB1dGVVcGRhdGVJbmZvVmVyc2lvbignMS4xMDkuMCcsICcxLjEwOS4zJyksICcxLjEwOS4zJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIG1pbm9yIC4wIHZlcnNpb24gd2hlbiBtYWpvciBkaWZmZXJzJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbXB1dGVVcGRhdGVJbmZvVmVyc2lvbignMS4xMDkuMicsICcyLjAuMScpLCAnMi4wJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIHVuZGVmaW5lZCBmb3IgaW52YWxpZCB2ZXJzaW9ucycsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb21wdXRlVXBkYXRlSW5mb1ZlcnNpb24oJ2ludmFsaWQnLCAnMS4xMDkuNScpLCB1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbXB1dGVVcGRhdGVJbmZvVmVyc2lvbignMS4xMDkuMicsICdpbnZhbGlkJyksIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdnZXRVcGRhdGVJbmZvVXJsJywgKCkgPT4ge1xuXHRcdHRlc3QoJ2NvbnN0cnVjdHMgY29ycmVjdCBVUkwgZm9yIC4wIHZlcnNpb25zJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFVwZGF0ZUluZm9VcmwoJzEuMTA5LjAnKSwgJ2h0dHBzOi8vY29kZS52aXN1YWxzdHVkaW8uY29tL3Jhdy92MV8xMDlfdXBkYXRlLm1kJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjb25zdHJ1Y3RzIGNvcnJlY3QgVVJMIGZvciBwYXRjaCB2ZXJzaW9ucycsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRVcGRhdGVJbmZvVXJsKCcxLjEwOS41JyksICdodHRwczovL2NvZGUudmlzdWFsc3R1ZGlvLmNvbS9yYXcvdjFfMTA5XzVfdXBkYXRlLm1kJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdmb3JtYXRUaW1lUmVtYWluaW5nJywgKCkgPT4ge1xuXHRcdHRlc3QoJ2Zvcm1hdHMgc2Vjb25kcyBmb3IgdmFsdWVzIGxlc3MgdGhhbiAxIG1pbnV0ZScsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb3JtYXRUaW1lUmVtYWluaW5nKDEpLCAnMXMnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb3JtYXRUaW1lUmVtYWluaW5nKDMwKSwgJzMwcycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZvcm1hdFRpbWVSZW1haW5pbmcoNTkpLCAnNTlzJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdmb3JtYXRzIG1pbnV0ZXMgZm9yIHZhbHVlcyBiZXR3ZWVuIDEgbWludXRlIGFuZCAxIGhvdXInLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZm9ybWF0VGltZVJlbWFpbmluZyg2MCksICcxIG1pbicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZvcm1hdFRpbWVSZW1haW5pbmcoMTIwKSwgJzIgbWluJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZm9ybWF0VGltZVJlbWFpbmluZyg5MCksICcxIG1pbicpOyAvLyBGbG9vcnMgdG8gMSBtaW5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb3JtYXRUaW1lUmVtYWluaW5nKDM1OTkpLCAnNTkgbWluJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdmb3JtYXRzIGZyYWN0aW9uYWwgaG91cnMgZm9yIHZhbHVlcyA+PSAxIGhvdXInLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZm9ybWF0VGltZVJlbWFpbmluZygzNjAwKSwgJzEgaG91cicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZvcm1hdFRpbWVSZW1haW5pbmcoNTQwMCksICcxLjUgaG91cnMnKTsgLy8gMS41IGhvdXJzXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZm9ybWF0VGltZVJlbWFpbmluZyg3MjAwKSwgJzIgaG91cnMnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb3JtYXRUaW1lUmVtYWluaW5nKDkwMDApLCAnMi41IGhvdXJzJyk7IC8vIDIuNSBob3Vyc1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZvcm1hdFRpbWVSZW1haW5pbmcoMzk2MCksICcxLjEgaG91cnMnKTsgLy8gMSBob3VyIDYgbWluID0gMS4xIGhvdXJzXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdmb3JtYXRCeXRlcycsICgpID0+IHtcblx0XHR0ZXN0KCdmb3JtYXRzIGJ5dGVzIGZvciB2YWx1ZXMgbGVzcyB0aGFuIDEgS0InLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZm9ybWF0Qnl0ZXMoMCksICcwIEInKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb3JtYXRCeXRlcygxKSwgJzEgQicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZvcm1hdEJ5dGVzKDUxMiksICc1MTIgQicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZvcm1hdEJ5dGVzKDEwMjMpLCAnMTAyMyBCJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdmb3JtYXRzIGtpbG9ieXRlcyBmb3IgdmFsdWVzIGJldHdlZW4gMSBLQiBhbmQgMSBNQicsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb3JtYXRCeXRlcygxMDI0KSwgJzEgS0InKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb3JtYXRCeXRlcygxNTM2KSwgJzEuNSBLQicpOyAvLyAxLjUgS0Jcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb3JtYXRCeXRlcygyMDQ4KSwgJzIgS0InKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb3JtYXRCeXRlcygxMDI0ICogMTAwKSwgJzEwMCBLQicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZvcm1hdEJ5dGVzKDEwMjQgKiAxMDIzKSwgJzEwMjMgS0InKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2Zvcm1hdHMgbWVnYWJ5dGVzIGZvciB2YWx1ZXMgYmV0d2VlbiAxIE1CIGFuZCAxIEdCJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZvcm1hdEJ5dGVzKDEwMjQgKiAxMDI0KSwgJzEgTUInKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb3JtYXRCeXRlcygxMDI0ICogMTAyNCAqIDEuNSksICcxLjUgTUInKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb3JtYXRCeXRlcygxMDI0ICogMTAyNCAqIDEwMCksICcxMDAgTUInKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb3JtYXRCeXRlcygxMDI0ICogMTAyNCAqIDUxMiksICc1MTIgTUInKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2Zvcm1hdHMgZ2lnYWJ5dGVzIGZvciB2YWx1ZXMgPj0gMSBHQicsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb3JtYXRCeXRlcygxMDI0ICogMTAyNCAqIDEwMjQpLCAnMSBHQicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZvcm1hdEJ5dGVzKDEwMjQgKiAxMDI0ICogMTAyNCAqIDEuNSksICcxLjUgR0InKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb3JtYXRCeXRlcygxMDI0ICogMTAyNCAqIDEwMjQgKiAxMCksICcxMCBHQicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncm91bmRzIHRvIG9uZSBkZWNpbWFsIHBsYWNlIGNvcnJlY3RseScsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb3JtYXRCeXRlcygxMTI2KSwgJzEuMSBLQicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZvcm1hdEJ5dGVzKDEwNzUpLCAnMSBLQicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZvcm1hdEJ5dGVzKDEwMjQgKiAxMDI0ICogMjUuMzUpLCAnMjUuNCBNQicpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgndHJ5UGFyc2VEYXRlJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3JldHVybnMgdW5kZWZpbmVkIGZvciB1bmRlZmluZWQgaW5wdXQnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHJ5UGFyc2VEYXRlKHVuZGVmaW5lZCksIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIHVuZGVmaW5lZCBmb3IgaW52YWxpZCBkYXRlIHN0cmluZ3MnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHJ5UGFyc2VEYXRlKCcnKSwgdW5kZWZpbmVkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cnlQYXJzZURhdGUoJ25vdC1hLWRhdGUnKSwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3BhcnNlcyB2YWxpZCBJU08gZGF0ZSBzdHJpbmdzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gdHJ5UGFyc2VEYXRlKCcyMDI2LTAyLTA2VDA1OjAzOjAzLjk5MVonKTtcblx0XHRcdGFzc2VydC5vayhyZXN1bHQgIT09IHVuZGVmaW5lZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHlwZW9mIHJlc3VsdCwgJ251bWJlcicpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdCA+IDApO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnZm9ybWF0RGF0ZScsICgpID0+IHtcblx0XHR0ZXN0KCdmb3JtYXRzIGEgdGltZXN0YW1wIGFzIGEgcmVhZGFibGUgZGF0ZScsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGZvcm1hdERhdGUoMTcwNTI3NjgwMDAwMCk7XG5cdFx0XHRhc3NlcnQub2socmVzdWx0Lmxlbmd0aCA+IDApO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdC5pbmNsdWRlcygnMjAyNCcpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2lzTWFqb3JNaW5vclZlcnNpb25DaGFuZ2UnLCAoKSA9PiB7XG5cdFx0dGVzdCgncmV0dXJucyB0cnVlIGZvciBtYWpvciB2ZXJzaW9uIGNoYW5nZScsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc01ham9yTWlub3JWZXJzaW9uQ2hhbmdlKCcxLjkwLjAnLCAnMi4wLjAnKSwgdHJ1ZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIHRydWUgZm9yIG1pbm9yIHZlcnNpb24gY2hhbmdlJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzTWFqb3JNaW5vclZlcnNpb25DaGFuZ2UoJzEuOTAuMCcsICcxLjkxLjAnKSwgdHJ1ZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIGZhbHNlIGZvciBwYXRjaC1vbmx5IGNoYW5nZScsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc01ham9yTWlub3JWZXJzaW9uQ2hhbmdlKCcxLjkwLjAnLCAnMS45MC4xJyksIGZhbHNlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgZmFsc2UgZm9yIGlkZW50aWNhbCB2ZXJzaW9ucycsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc01ham9yTWlub3JWZXJzaW9uQ2hhbmdlKCcxLjkwLjAnLCAnMS45MC4wJyksIGZhbHNlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgZmFsc2Ugd2hlbiBwcmV2aW91cyB2ZXJzaW9uIGlzIHVuZGVmaW5lZCcsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc01ham9yTWlub3JWZXJzaW9uQ2hhbmdlKHVuZGVmaW5lZCwgJzEuOTAuMCcpLCBmYWxzZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIGZhbHNlIHdoZW4gbmV3IHZlcnNpb24gaXMgdW5kZWZpbmVkJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzTWFqb3JNaW5vclZlcnNpb25DaGFuZ2UoJzEuOTAuMCcsIHVuZGVmaW5lZCksIGZhbHNlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgZmFsc2Ugd2hlbiBib3RoIHZlcnNpb25zIGFyZSB1bmRlZmluZWQnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNNYWpvck1pbm9yVmVyc2lvbkNoYW5nZSh1bmRlZmluZWQsIHVuZGVmaW5lZCksIGZhbHNlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgZmFsc2UgZm9yIHVucGFyc2VhYmxlIHZlcnNpb25zJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzTWFqb3JNaW5vclZlcnNpb25DaGFuZ2UoJ2ludmFsaWQnLCAnMS45MC4wJyksIGZhbHNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc01ham9yTWlub3JWZXJzaW9uQ2hhbmdlKCcxLjkwLjAnLCAnaW52YWxpZCcpLCBmYWxzZSk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsWUFBWSxXQUFXO0FBQ3ZCLFNBQVMsK0NBQStDO0FBQ3hELFNBQXNCLGlCQUFpQjtBQUN2QyxTQUFTLHNCQUFzQiw4QkFBOEIsd0JBQXdCLDBCQUEwQixhQUFhLFlBQVkscUJBQXFCLGtCQUFrQiwyQkFBMkIsb0JBQW9CO0FBRTlOLE1BQU0sZUFBZSxNQUFNO0FBQzFCLDBDQUF3QztBQUV4QyxNQUFJO0FBRUosUUFBTSxNQUFNO0FBQ1gsWUFBUSxNQUFNLGNBQWM7QUFBQSxFQUM3QixDQUFDO0FBRUQsV0FBUyxNQUFNO0FBQ2QsVUFBTSxRQUFRO0FBQUEsRUFDZixDQUFDO0FBRUQsV0FBUyxpQkFBaUIsaUJBQTBCLFlBQXFCLFdBQWlDO0FBQ3pHLFdBQU8sRUFBRSxNQUFNLFVBQVUsYUFBYSxVQUFVLE1BQU0sV0FBVyxPQUFPLGlCQUFpQixZQUFZLFVBQVU7QUFBQSxFQUNoSDtBQUVBLFFBQU0sMEJBQTBCLE1BQU07QUFDckMsU0FBSywwQkFBMEIsTUFBTTtBQUNwQyxhQUFPLFlBQVksdUJBQXVCLFFBQVcsR0FBRyxHQUFHLE1BQVM7QUFDcEUs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
