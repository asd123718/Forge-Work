import * as assert from "assert";
import { parseLogEntryAt } from "../../common/outputChannelModel.js";
import { TextModel } from "../../../../../editor/common/model/textModel.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { LogLevel } from "../../../../../platform/log/common/log.js";
import { workbenchInstantiationService } from "../../../../test/browser/workbenchTestServices.js";
suite("Logs Parsing", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  let instantiationService;
  setup(() => {
    instantiationService = disposables.add(workbenchInstantiationService({}, disposables));
  });
  test("should parse log entry with all components", () => {
    const text = "2023-10-15 14:30:45.123 [info] [Git] Initializing repository";
    const model = createModel(text);
    const entry = parseLogEntryAt(model, 1);
    assert.strictEqual(entry?.timestamp, (/* @__PURE__ */ new Date("2023-10-15 14:30:45.123")).getTime());
    assert.strictEqual(entry?.logLevel, LogLevel.Info);
    assert.strictEqual(entry?.category, "Git");
    assert.strictEqual(model.getValueInRange(entry?.range), text);
  });
  test("should parse multi-line log entry", () => {
    const text = [
      "2023-10-15 14:30:45.123 [error] [Extension] Failed with error:",
      "Error: Could not load extension",
      "    at Object.load (/path/to/file:10:5)"
    ].join("\n");
    const model = createModel(text);
    const entry = parseLogEntryAt(model, 1);
    assert.strictEqual(entry?.timestamp, (/* @__PURE__ */ new Date("2023-10-15 14:30:45.123")).getTime());
    assert.strictEqual(entry?.logLevel, LogLevel.Error);
    assert.strictEqual(entry?.category, "Extension");
    assert.strictEqual(model.getValueInRange(entry?.range), text);
  });
  test("should parse log entry without category", () => {
    const text = "2023-10-15 14:30:45.123 [warning] System is running low on memory";
    const model = createModel(text);
    const entry = parseLogEntryAt(model, 1);
    assert.strictEqual(entry?.timestamp, (/* @__PURE__ */ new Date("2023-10-15 14:30:45.123")).getTime());
    assert.strictEqual(entry?.logLevel, LogLevel.Warning);
    assert.strictEqual(entry?.category, void 0);
    assert.strictEqual(model.getValueInRange(entry?.range), text);
  });
  test("should return null for invalid log entry", () => {
    const model = createModel("Not a valid log entry");
    const entry = parseLogEntryAt(model, 1);
    assert.strictEqual(entry, null);
  });
  test("should parse all supported log levels", () => {
    const levels = {
      info: LogLevel.Info,
      trace: LogLevel.Trace,
      debug: LogLevel.Debug,
      warning: LogLevel.Warning,
      error: LogLevel.Error
    };
    for (const [levelText, expectedLevel] of Object.entries(levels)) {
      const model = createModel(`2023-10-15 14:30:45.123 [${levelText}] Test message`);
      const entry = parseLogEntryAt(model, 1);
      assert.strictEqual(entry?.logLevel, expectedLevel, `Failed for log level: ${levelText}`);
    }
  });
  test("should parse timestamp correctly", () => {
    const timestamps = [
      "2023-01-01 00:00:00.000",
      "2023-12-31 23:59:59.999",
      "2023-06-15 12:30:45.500"
    ];
    for (const timestamp of timestamps) {
      const model = createModel(`${timestamp} [info] Test message`);
      const entry = parseLogEntryAt(model, 1);
      assert.strictEqual(entry?.timestamp, new Date(timestamp).getTime(), `Failed for timestamp: ${timestamp}`);
    }
  });
  test("should handle last line of file", () => {
    const model = createModel([
      "2023-10-15 14:30:45.123 [info] First message",
      "2023-10-15 14:30:45.124 [info] Last message",
      ""
    ].join("\n"));
    let actual = parseLogEntryAt(model, 1);
    assert.strictEqual(actual?.timestamp, (/* @__PURE__ */ new Date("2023-10-15 14:30:45.123")).getTime());
    assert.strictEqual(actual?.logLevel, LogLevel.Info);
    assert.strictEqual(actual?.category, void 0);
    assert.strictEqual(model.getValueInRange(actual?.range), "2023-10-15 14:30:45.123 [info] First message");
    actual = parseLogEntryAt(model, 2);
    assert.strictEqual(actual?.timestamp, (/* @__PURE__ */ new Date("2023-10-15 14:30:45.124")).getTime());
    assert.strictEqual(actual?.logLevel, LogLevel.Info);
    assert.strictEqual(actual?.category, void 0);
    assert.strictEqual(model.getValueInRange(actual?.range), "2023-10-15 14:30:45.124 [info] Last message");
    actual = parseLogEntryAt(model, 3);
    assert.strictEqual(actual, null);
  });
  test("should parse multi-line log entry with empty lines", () => {
    const text = [
      "2025-01-27 09:53:00.450 [info] Found with version <20.18.1>",
      "Now using node v20.18.1 (npm v10.8.2)",
      "",
      "> husky - npm run -s precommit",
      "> husky - node v20.18.1",
      "",
      "Reading git index versions..."
    ].join("\n");
    const model = createModel(text);
    const entry = parseLogEntryAt(model, 1);
    assert.strictEqual(entry?.timestamp, (/* @__PURE__ */ new Date("2025-01-27 09:53:00.450")).getTime());
    assert.strictEqual(entry?.logLevel, LogLevel.Info);
    assert.strictEqual(entry?.category, void 0);
    assert.strictEqual(model.getValueInRange(entry?.range), text);
  });
  function createModel(content) {
    return disposables.add(instantiationService.createInstance(TextModel, content, "log", TextModel.DEFAULT_CREATION_OPTIONS, null));
  }
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG91dHB1dFxcdGVzdFxcYnJvd3Nlclxcb3V0cHV0Q2hhbm5lbE1vZGVsLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IHBhcnNlTG9nRW50cnlBdCB9IGZyb20gJy4uLy4uL2NvbW1vbi9vdXRwdXRDaGFubmVsTW9kZWwuanMnO1xuaW1wb3J0IHsgVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9tb2RlbC90ZXh0TW9kZWwuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBMb2dMZXZlbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vdGVzdC9icm93c2VyL3dvcmtiZW5jaFRlc3RTZXJ2aWNlcy5qcyc7XG5pbXBvcnQgeyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL3Rlc3QvY29tbW9uL2luc3RhbnRpYXRpb25TZXJ2aWNlTW9jay5qcyc7XG5cbnN1aXRlKCdMb2dzIFBhcnNpbmcnLCAoKSA9PiB7XG5cblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRsZXQgaW5zdGFudGlhdGlvblNlcnZpY2U6IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZTtcblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQod29ya2JlbmNoSW5zdGFudGlhdGlvblNlcnZpY2Uoe30sIGRpc3Bvc2FibGVzKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCBwYXJzZSBsb2cgZW50cnkgd2l0aCBhbGwgY29tcG9uZW50cycsICgpID0+IHtcblx0XHRjb25zdCB0ZXh0ID0gJzIwMjMtMTAtMTUgMTQ6MzA6NDUuMTIzIFtpbmZvXSBbR2l0XSBJbml0aWFsaXppbmcgcmVwb3NpdG9yeSc7XG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVNb2RlbCh0ZXh0KTtcblx0XHRjb25zdCBlbnRyeSA9IHBhcnNlTG9nRW50cnlBdChtb2RlbCwgMSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW50cnk/LnRpbWVzdGFtcCwgbmV3IERhdGUoJzIwMjMtMTAtMTUgMTQ6MzA6NDUuMTIzJykuZ2V0VGltZSgpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW50cnk/LmxvZ0xldmVsLCBMb2dMZXZlbC5JbmZvKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW50cnk/LmNhdGVnb3J5LCAnR2l0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlSW5SYW5nZShlbnRyeT8ucmFuZ2UpLCB0ZXh0KTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIHBhcnNlIG11bHRpLWxpbmUgbG9nIGVudHJ5JywgKCkgPT4ge1xuXHRcdGNvbnN0IHRleHQgPSBbXG5cdFx0XHQnMjAyMy0xMC0xNSAxNDozMDo0NS4xMjMgW2Vycm9yXSBbRXh0ZW5zaW9uXSBGYWlsZWQgd2l0aCBlcnJvcjonLFxuXHRcdFx0J0Vycm9yOiBDb3VsZCBub3QgbG9hZCBleHRlbnNpb24nLFxuXHRcdFx0JyAgICBhdCBPYmplY3QubG9hZCAoL3BhdGgvdG8vZmlsZToxMDo1KSdcblx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlTW9kZWwodGV4dCk7XG5cdFx0Y29uc3QgZW50cnkgPSBwYXJzZUxvZ0VudHJ5QXQobW9kZWwsIDEpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVudHJ5Py50aW1lc3RhbXAsIG5ldyBEYXRlKCcyMDIzLTEwLTE1IDE0OjMwOjQ1LjEyMycpLmdldFRpbWUoKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVudHJ5Py5sb2dMZXZlbCwgTG9nTGV2ZWwuRXJyb3IpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbnRyeT8uY2F0ZWdvcnksICdFeHRlbnNpb24nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWVJblJhbmdlKGVudHJ5Py5yYW5nZSksIHRleHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgcGFyc2UgbG9nIGVudHJ5IHdpdGhvdXQgY2F0ZWdvcnknLCAoKSA9PiB7XG5cdFx0Y29uc3QgdGV4dCA9ICcyMDIzLTEwLTE1IDE0OjMwOjQ1LjEyMyBbd2FybmluZ10gU3lzdGVtIGlzIHJ1bm5pbmcgbG93IG9uIG1lbW9yeSc7XG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVNb2RlbCh0ZXh0KTtcblx0XHRjb25zdCBlbnRyeSA9IHBhcnNlTG9nRW50cnlBdChtb2RlbCwgMSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW50cnk/LnRpbWVzdGFtcCwgbmV3IERhdGUoJzIwMjMtMTAtMTUgMTQ6MzA6NDUuMTIzJykuZ2V0VGltZSgpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW50cnk/LmxvZ0xldmVsLCBMb2dMZXZlbC5XYXJuaW5nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW50cnk/LmNhdGVnb3J5LCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZUluUmFuZ2UoZW50cnk/LnJhbmdlKSwgdGV4dCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCByZXR1cm4gbnVsbCBmb3IgaW52YWxpZCBsb2cgZW50cnknLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVNb2RlbCgnTm90IGEgdmFsaWQgbG9nIGVudHJ5Jyk7XG5cdFx0Y29uc3QgZW50cnkgPSBwYXJzZUxvZ0VudHJ5QXQobW9kZWwsIDEpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVudHJ5LCBudWxsKTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIHBhcnNlIGFsbCBzdXBwb3J0ZWQgbG9nIGxldmVscycsICgpID0+IHtcblx0XHRjb25zdCBsZXZlbHMgPSB7XG5cdFx0XHRpbmZvOiBMb2dMZXZlbC5JbmZvLFxuXHRcdFx0dHJhY2U6IExvZ0xldmVsLlRyYWNlLFxuXHRcdFx0ZGVidWc6IExvZ0xldmVsLkRlYnVnLFxuXHRcdFx0d2FybmluZzogTG9nTGV2ZWwuV2FybmluZyxcblx0XHRcdGVycm9yOiBMb2dMZXZlbC5FcnJvclxuXHRcdH07XG5cblx0XHRmb3IgKGNvbnN0IFtsZXZlbFRleHQsIGV4cGVjdGVkTGV2ZWxdIG9mIE9iamVjdC5lbnRyaWVzKGxldmVscykpIHtcblx0XHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlTW9kZWwoYDIwMjMtMTAtMTUgMTQ6MzA6NDUuMTIzIFske2xldmVsVGV4dH1dIFRlc3QgbWVzc2FnZWApO1xuXHRcdFx0Y29uc3QgZW50cnkgPSBwYXJzZUxvZ0VudHJ5QXQobW9kZWwsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVudHJ5Py5sb2dMZXZlbCwgZXhwZWN0ZWRMZXZlbCwgYEZhaWxlZCBmb3IgbG9nIGxldmVsOiAke2xldmVsVGV4dH1gKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCBwYXJzZSB0aW1lc3RhbXAgY29ycmVjdGx5JywgKCkgPT4ge1xuXHRcdGNvbnN0IHRpbWVzdGFtcHMgPSBbXG5cdFx0XHQnMjAyMy0wMS0wMSAwMDowMDowMC4wMDAnLFxuXHRcdFx0JzIwMjMtMTItMzEgMjM6NTk6NTkuOTk5Jyxcblx0XHRcdCcyMDIzLTA2LTE1IDEyOjMwOjQ1LjUwMCdcblx0XHRdO1xuXG5cdFx0Zm9yIChjb25zdCB0aW1lc3RhbXAgb2YgdGltZXN0YW1wcykge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVNb2RlbChgJHt0aW1lc3RhbXB9IFtpbmZvXSBUZXN0IG1lc3NhZ2VgKTtcblx0XHRcdGNvbnN0IGVudHJ5ID0gcGFyc2VMb2dFbnRyeUF0KG1vZGVsLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbnRyeT8udGltZXN0YW1wLCBuZXcgRGF0ZSh0aW1lc3RhbXApLmdldFRpbWUoKSwgYEZhaWxlZCBmb3IgdGltZXN0YW1wOiAke3RpbWVzdGFtcH1gKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCBoYW5kbGUgbGFzdCBsaW5lIG9mIGZpbGUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVNb2RlbChbXG5cdFx0XHQnMjAyMy0xMC0xNSAxNDozMDo0NS4xMjMgW2luZm9dIEZpcnN0IG1lc3NhZ2UnLFxuXHRcdFx0JzIwMjMtMTAtMTUgMTQ6MzA6NDUuMTI0IFtpbmZvXSBMYXN0IG1lc3NhZ2UnLFxuXHRcdFx0Jydcblx0XHRdLmpvaW4oJ1xcbicpKTtcblxuXHRcdGxldCBhY3R1YWwgPSBwYXJzZUxvZ0VudHJ5QXQobW9kZWwsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWw/LnRpbWVzdGFtcCwgbmV3IERhdGUoJzIwMjMtMTAtMTUgMTQ6MzA6NDUuMTIzJykuZ2V0VGltZSgpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsPy5sb2dMZXZlbCwgTG9nTGV2ZWwuSW5mbyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbD8uY2F0ZWdvcnksIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlSW5SYW5nZShhY3R1YWw/LnJhbmdlKSwgJzIwMjMtMTAtMTUgMTQ6MzA6NDUuMTIzIFtpbmZvXSBGaXJzdCBtZXNzYWdlJyk7XG5cblx0XHRhY3R1YWwgPSBwYXJzZUxvZ0VudHJ5QXQobW9kZWwsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWw/LnRpbWVzdGFtcCwgbmV3IERhdGUoJzIwMjMtMTAtMTUgMTQ6MzA6NDUuMTI0JykuZ2V0VGltZSgpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsPy5sb2dMZXZlbCwgTG9nTGV2ZWwuSW5mbyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbD8uY2F0ZWdvcnksIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlSW5SYW5nZShhY3R1YWw/LnJhbmdlKSwgJzIwMjMtMTAtMTUgMTQ6MzA6NDUuMTI0IFtpbmZvXSBMYXN0IG1lc3NhZ2UnKTtcblxuXHRcdGFjdHVhbCA9IHBhcnNlTG9nRW50cnlBdChtb2RlbCwgMyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbCwgbnVsbCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCBwYXJzZSBtdWx0aS1saW5lIGxvZyBlbnRyeSB3aXRoIGVtcHR5IGxpbmVzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHRleHQgPSBbXG5cdFx0XHQnMjAyNS0wMS0yNyAwOTo1MzowMC40NTAgW2luZm9dIEZvdW5kIHdpdGggdmVyc2lvbiA8MjAuMTguMT4nLFxuXHRcdFx0J05vdyB1c2luZyBub2RlIHYyMC4xOC4xIChucG0gdjEwLjguMiknLFxuXHRcdFx0JycsXG5cdFx0XHQnPiBodXNreSAtIG5wbSBydW4gLXMgcHJlY29tbWl0Jyxcblx0XHRcdCc+IGh1c2t5IC0gbm9kZSB2MjAuMTguMScsXG5cdFx0XHQnJyxcblx0XHRcdCdSZWFkaW5nIGdpdCBpbmRleCB2ZXJzaW9ucy4uLidcblx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlTW9kZWwodGV4dCk7XG5cdFx0Y29uc3QgZW50cnkgPSBwYXJzZUxvZ0VudHJ5QXQobW9kZWwsIDEpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVudHJ5Py50aW1lc3RhbXAsIG5ldyBEYXRlKCcyMDI1LTAxLTI3IDA5OjUzOjAwLjQ1MCcpLmdldFRpbWUoKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVudHJ5Py5sb2dMZXZlbCwgTG9nTGV2ZWwuSW5mbyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVudHJ5Py5jYXRlZ29yeSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWVJblJhbmdlKGVudHJ5Py5yYW5nZSksIHRleHQpO1xuXG5cdH0pO1xuXG5cdGZ1bmN0aW9uIGNyZWF0ZU1vZGVsKGNvbnRlbnQ6IHN0cmluZyk6IFRleHRNb2RlbCB7XG5cdFx0cmV0dXJuIGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXh0TW9kZWwsIGNvbnRlbnQsICdsb2cnLCBUZXh0TW9kZWwuREVGQVVMVF9DUkVBVElPTl9PUFRJT05TLCBudWxsKSk7XG5cdH1cbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsWUFBWSxZQUFZO0FBQ3hCLFNBQVMsdUJBQXVCO0FBQ2hD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
