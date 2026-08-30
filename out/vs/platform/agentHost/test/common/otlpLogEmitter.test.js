import assert from "assert";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { LogLevel } from "../../../log/common/log.js";
import {
  buildOtlpLogsChannelUri,
  extractLevelFromOtlpLogsUri,
  iterateOtlpLogRecords,
  levelToSeverityNumber,
  logLevelToOtlpLevelName,
  logLevelToOtlpSeverity,
  OtelData,
  OtlpEmitterLogger,
  OtlpLogEmitter,
  parseOtlpLogLevel,
  severityNumberToLogLevel,
  toResourceLogsPayload
} from "../../common/otlp/otlpLogEmitter.js";
suite("OtlpLogEmitter", () => {
  const disposables = new DisposableStore();
  teardown(() => disposables.clear());
  ensureNoDisposablesAreLeakedInTestSuite();
  test("level <-> severity number mappings are inverse-ish", () => {
    const cases = [
      [LogLevel.Trace, 1],
      [LogLevel.Debug, 5],
      [LogLevel.Info, 9],
      [LogLevel.Warning, 13],
      [LogLevel.Error, 17]
    ];
    const observed = cases.map(([level]) => {
      const { severityNumber, severityText } = logLevelToOtlpSeverity(level);
      return { level, severityNumber, severityText, roundTrip: severityNumberToLogLevel(severityNumber) };
    });
    assert.deepStrictEqual(observed, [
      { level: LogLevel.Trace, severityNumber: 1, severityText: "trace", roundTrip: LogLevel.Trace },
      { level: LogLevel.Debug, severityNumber: 5, severityText: "debug", roundTrip: LogLevel.Debug },
      { level: LogLevel.Info, severityNumber: 9, severityText: "info", roundTrip: LogLevel.Info },
      { level: LogLevel.Warning, severityNumber: 13, severityText: "warn", roundTrip: LogLevel.Warning },
      { level: LogLevel.Error, severityNumber: 17, severityText: "error", roundTrip: LogLevel.Error }
    ]);
  });
  test("parseOtlpLogLevel + level name helpers", () => {
    assert.deepStrictEqual(
      {
        trace: parseOtlpLogLevel("trace"),
        TRACE: parseOtlpLogLevel("TRACE"),
        fatal: parseOtlpLogLevel("Fatal"),
        bogus: parseOtlpLogLevel("verbose"),
        off: logLevelToOtlpLevelName(LogLevel.Off),
        info: logLevelToOtlpLevelName(LogLevel.Info),
        traceBoundary: levelToSeverityNumber("trace"),
        warnBoundary: levelToSeverityNumber("warn")
      },
      {
        trace: "trace",
        TRACE: "trace",
        fatal: "fatal",
        bogus: void 0,
        off: void 0,
        info: "info",
        traceBoundary: 1,
        warnBoundary: 13
      }
    );
  });
  test("OtlpEmitterLogger fans logs onto the shared emitter", () => {
    const emitter = disposables.add(new OtlpLogEmitter());
    const logger = disposables.add(new OtlpEmitterLogger(emitter, LogLevel.Trace));
    const received = [];
    disposables.add(emitter.onDidLog((record) => received.push(record)));
    logger.trace("hello trace");
    logger.debug("hello debug");
    logger.info("hello info");
    logger.warn("hello warn");
    logger.error("hello error");
    const sanitised = received.map((r) => ({ severityNumber: r.severityNumber, severityText: r.severityText, body: r.body }));
    assert.deepStrictEqual(sanitised, [
      { severityNumber: 1, severityText: "trace", body: "hello trace" },
      { severityNumber: 5, severityText: "debug", body: "hello debug" },
      { severityNumber: 9, severityText: "info", body: "hello info" },
      { severityNumber: 13, severityText: "warn", body: "hello warn" },
      { severityNumber: 17, severityText: "error", body: "hello error" }
    ]);
  });
  test("logger level gates which records reach the OTLP emitter", () => {
    const emitter = disposables.add(new OtlpLogEmitter());
    const otlpLogger = disposables.add(new OtlpEmitterLogger(emitter, LogLevel.Warning));
    const received = [];
    disposables.add(emitter.onDidLog((record) => received.push(record)));
    otlpLogger.trace("should-drop");
    otlpLogger.debug("should-drop");
    otlpLogger.info("should-drop");
    otlpLogger.warn("should-pass");
    otlpLogger.error("should-pass");
    assert.deepStrictEqual(received.map((r) => r.body), ["should-pass", "should-pass"]);
  });
  test("toResourceLogsPayload + iterateOtlpLogRecords round-trip", () => {
    const record = {
      timeUnixNano: "123000000",
      severityNumber: 9,
      severityText: "info",
      body: "a body"
    };
    const payload = toResourceLogsPayload(record);
    const decoded = [...iterateOtlpLogRecords(payload)];
    assert.deepStrictEqual(decoded, [record]);
  });
  test("OtelData attributes survive the OtlpEmitterLogger round-trip and stay out of the body", () => {
    const emitter = disposables.add(new OtlpLogEmitter());
    const logger = disposables.add(new OtlpEmitterLogger(emitter, LogLevel.Trace));
    const received = [];
    disposables.add(emitter.onDidLog((record) => received.push(record)));
    logger.info("MCP server started", new OtelData({ infoType: "mcp", attempt: 2, enabled: true }));
    logger.warn("plain warning");
    const roundTripped = received.map((r) => [...iterateOtlpLogRecords(toResourceLogsPayload(r))][0]);
    const sanitised = roundTripped.map((r) => ({ severityText: r.severityText, body: r.body, attributes: r.attributes }));
    assert.deepStrictEqual(sanitised, [
      { severityText: "info", body: "MCP server started", attributes: { infoType: "mcp", attempt: 2, enabled: true } },
      { severityText: "warn", body: "plain warning", attributes: void 0 }
    ]);
  });
  test("integer attributes are string-encoded on the OTLP wire", () => {
    const record = {
      timeUnixNano: "123000000",
      severityNumber: 9,
      severityText: "info",
      body: "a body",
      attributes: { count: 2, ratio: 1.5, label: "ready", enabled: true }
    };
    assert.deepStrictEqual(toResourceLogsPayload(record), {
      resourceLogs: [{
        resource: { attributes: [] },
        scopeLogs: [{
          scope: { name: "vscode.agentHost" },
          logRecords: [{
            timeUnixNano: "123000000",
            observedTimeUnixNano: "123000000",
            severityNumber: 9,
            severityText: "info",
            body: { stringValue: "a body" },
            attributes: [
              { key: "count", value: { intValue: "2" } },
              { key: "ratio", value: { doubleValue: 1.5 } },
              { key: "label", value: { stringValue: "ready" } },
              { key: "enabled", value: { boolValue: true } }
            ]
          }]
        }]
      }]
    });
  });
  test("invalid numeric OTLP attributes are ignored", () => {
    const decoded = [...iterateOtlpLogRecords({
      resourceLogs: [{
        scopeLogs: [{
          logRecords: [{
            timeUnixNano: "123000000",
            severityNumber: 9,
            severityText: "info",
            body: { stringValue: "a body" },
            attributes: [
              { key: "validInt", value: { intValue: "2" } },
              { key: "nanInt", value: { intValue: "not-a-number" } },
              { key: "unsafeInt", value: { intValue: "9007199254740992" } },
              { key: "infiniteDouble", value: { doubleValue: Infinity } }
            ]
          }]
        }]
      }]
    })];
    assert.deepStrictEqual(decoded, [{
      timeUnixNano: "123000000",
      severityNumber: 9,
      severityText: "info",
      body: "a body",
      attributes: { validInt: 2 }
    }]);
  });
  test("iterateOtlpLogRecords tolerates malformed shapes", () => {
    const decoded = [
      ...iterateOtlpLogRecords({ resourceLogs: [{ scopeLogs: [{ logRecords: [null, { severityNumber: "bad" }] }] }] }),
      ...iterateOtlpLogRecords({ resourceLogs: "nope" }),
      ...iterateOtlpLogRecords(void 0)
    ];
    assert.deepStrictEqual(decoded, [{
      timeUnixNano: "0",
      severityNumber: 0,
      severityText: "trace",
      body: ""
    }]);
  });
  test("buildOtlpLogsChannelUri + extractLevelFromOtlpLogsUri round-trip", () => {
    const cases = ["trace", "debug", "info", "warn", "error", "fatal"];
    assert.deepStrictEqual(
      cases.map((level) => ({ level, uri: buildOtlpLogsChannelUri(level), parsed: extractLevelFromOtlpLogsUri(buildOtlpLogsChannelUri(level)) })),
      cases.map((level) => ({ level, uri: `ahp-otlp://logs/${level}`, parsed: level }))
    );
  });
  test("extractLevelFromOtlpLogsUri rejects unknown shapes", () => {
    assert.deepStrictEqual(
      {
        bareScheme: extractLevelFromOtlpLogsUri("ahp-otlp://logs"),
        unknownLevel: extractLevelFromOtlpLogsUri("ahp-otlp://logs/verbose"),
        wrongScheme: extractLevelFromOtlpLogsUri("ahp-state://logs/info")
      },
      {
        bareScheme: void 0,
        unknownLevel: void 0,
        wrongScheme: void 0
      }
    );
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxjb21tb25cXG90bHBMb2dFbWl0dGVyLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBMb2dMZXZlbCB9IGZyb20gJy4uLy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7XG5cdGJ1aWxkT3RscExvZ3NDaGFubmVsVXJpLFxuXHRleHRyYWN0TGV2ZWxGcm9tT3RscExvZ3NVcmksXG5cdGl0ZXJhdGVPdGxwTG9nUmVjb3Jkcyxcblx0bGV2ZWxUb1NldmVyaXR5TnVtYmVyLFxuXHRsb2dMZXZlbFRvT3RscExldmVsTmFtZSxcblx0bG9nTGV2ZWxUb090bHBTZXZlcml0eSxcblx0T3RlbERhdGEsXG5cdE90bHBFbWl0dGVyTG9nZ2VyLFxuXHRPdGxwTG9nRW1pdHRlcixcblx0cGFyc2VPdGxwTG9nTGV2ZWwsXG5cdHNldmVyaXR5TnVtYmVyVG9Mb2dMZXZlbCxcblx0dG9SZXNvdXJjZUxvZ3NQYXlsb2FkLFxuXHR0eXBlIElPdGxwTG9nUmVjb3JkLFxufSBmcm9tICcuLi8uLi9jb21tb24vb3RscC9vdGxwTG9nRW1pdHRlci5qcyc7XG5cbnN1aXRlKCdPdGxwTG9nRW1pdHRlcicsICgpID0+IHtcblxuXHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHR0ZWFyZG93bigoKSA9PiBkaXNwb3NhYmxlcy5jbGVhcigpKTtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnbGV2ZWwgPC0+IHNldmVyaXR5IG51bWJlciBtYXBwaW5ncyBhcmUgaW52ZXJzZS1pc2gnLCAoKSA9PiB7XG5cdFx0Ly8gRWFjaCBWUyBDb2RlIGxldmVsIFx1MjE5MiBzZXZlcml0eSBudW1iZXIsIHRoZW4gYmFjaywgc2hvdWxkIGxhbmQgb25cblx0XHQvLyB0aGUgc2FtZSBsZXZlbCAodGhlIGJvdW5kYXJ5IG51bWJlcnMgYXJlIHBpY2tlZCB0byBtYWtlIHRoaXMgaG9sZCkuXG5cdFx0Y29uc3QgY2FzZXM6IFtMb2dMZXZlbCwgbnVtYmVyXVtdID0gW1xuXHRcdFx0W0xvZ0xldmVsLlRyYWNlLCAxXSxcblx0XHRcdFtMb2dMZXZlbC5EZWJ1ZywgNV0sXG5cdFx0XHRbTG9nTGV2ZWwuSW5mbywgOV0sXG5cdFx0XHRbTG9nTGV2ZWwuV2FybmluZywgMTNdLFxuXHRcdFx0W0xvZ0xldmVsLkVycm9yLCAxN10sXG5cdFx0XTtcblx0XHRjb25zdCBvYnNlcnZlZCA9IGNhc2VzLm1hcCgoW2xldmVsXSkgPT4ge1xuXHRcdFx0Y29uc3QgeyBzZXZlcml0eU51bWJlciwgc2V2ZXJpdHlUZXh0IH0gPSBsb2dMZXZlbFRvT3RscFNldmVyaXR5KGxldmVsKTtcblx0XHRcdHJldHVybiB7IGxldmVsLCBzZXZlcml0eU51bWJlciwgc2V2ZXJpdHlUZXh0LCByb3VuZFRyaXA6IHNldmVyaXR5TnVtYmVyVG9Mb2dMZXZlbChzZXZlcml0eU51bWJlcikgfTtcblx0XHR9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG9ic2VydmVkLCBbXG5cdFx0XHR7IGxldmVsOiBMb2dMZXZlbC5UcmFjZSwgc2V2ZXJpdHlOdW1iZXI6IDEsIHNldmVyaXR5VGV4dDogJ3RyYWNlJywgcm91bmRUcmlwOiBMb2dMZXZlbC5UcmFjZSB9LFxuXHRcdFx0eyBsZXZlbDogTG9nTGV2ZWwuRGVidWcsIHNldmVyaXR5TnVtYmVyOiA1LCBzZXZlcml0eVRleHQ6ICdkZWJ1ZycsIHJvdW5kVHJpcDogTG9nTGV2ZWwuRGVidWcgfSxcblx0XHRcdHsgbGV2ZWw6IExvZ0xldmVsLkluZm8sIHNldmVyaXR5TnVtYmVyOiA5LCBzZXZlcml0eVRleHQ6ICdpbmZvJywgcm91bmRUcmlwOiBMb2dMZXZlbC5JbmZvIH0sXG5cdFx0XHR7IGxldmVsOiBMb2dMZXZlbC5XYXJuaW5nLCBzZXZlcml0eU51bWJlcjogMTMsIHNldmVyaXR5VGV4dDogJ3dhcm4nLCByb3VuZFRyaXA6IExvZ0xldmVsLldhcm5pbmcgfSxcblx0XHRcdHsgbGV2ZWw6IExvZ0xldmVsLkVycm9yLCBzZXZlcml0eU51bWJlcjogMTcsIHNldmVyaXR5VGV4dDogJ2Vycm9yJywgcm91bmRUcmlwOiBMb2dMZXZlbC5FcnJvciB9LFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdwYXJzZU90bHBMb2dMZXZlbCArIGxldmVsIG5hbWUgaGVscGVycycsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0e1xuXHRcdFx0XHR0cmFjZTogcGFyc2VPdGxwTG9nTGV2ZWwoJ3RyYWNlJyksXG5cdFx0XHRcdFRSQUNFOiBwYXJzZU90bHBMb2dMZXZlbCgnVFJBQ0UnKSxcblx0XHRcdFx0ZmF0YWw6IHBhcnNlT3RscExvZ0xldmVsKCdGYXRhbCcpLFxuXHRcdFx0XHRib2d1czogcGFyc2VPdGxwTG9nTGV2ZWwoJ3ZlcmJvc2UnKSxcblx0XHRcdFx0b2ZmOiBsb2dMZXZlbFRvT3RscExldmVsTmFtZShMb2dMZXZlbC5PZmYpLFxuXHRcdFx0XHRpbmZvOiBsb2dMZXZlbFRvT3RscExldmVsTmFtZShMb2dMZXZlbC5JbmZvKSxcblx0XHRcdFx0dHJhY2VCb3VuZGFyeTogbGV2ZWxUb1NldmVyaXR5TnVtYmVyKCd0cmFjZScpLFxuXHRcdFx0XHR3YXJuQm91bmRhcnk6IGxldmVsVG9TZXZlcml0eU51bWJlcignd2FybicpLFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0dHJhY2U6ICd0cmFjZScsXG5cdFx0XHRcdFRSQUNFOiAndHJhY2UnLFxuXHRcdFx0XHRmYXRhbDogJ2ZhdGFsJyxcblx0XHRcdFx0Ym9ndXM6IHVuZGVmaW5lZCxcblx0XHRcdFx0b2ZmOiB1bmRlZmluZWQsXG5cdFx0XHRcdGluZm86ICdpbmZvJyxcblx0XHRcdFx0dHJhY2VCb3VuZGFyeTogMSxcblx0XHRcdFx0d2FybkJvdW5kYXJ5OiAxMyxcblx0XHRcdH0sXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnT3RscEVtaXR0ZXJMb2dnZXIgZmFucyBsb2dzIG9udG8gdGhlIHNoYXJlZCBlbWl0dGVyJywgKCkgPT4ge1xuXHRcdGNvbnN0IGVtaXR0ZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IE90bHBMb2dFbWl0dGVyKCkpO1xuXHRcdGNvbnN0IGxvZ2dlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgT3RscEVtaXR0ZXJMb2dnZXIoZW1pdHRlciwgTG9nTGV2ZWwuVHJhY2UpKTtcblx0XHRjb25zdCByZWNlaXZlZDogSU90bHBMb2dSZWNvcmRbXSA9IFtdO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChlbWl0dGVyLm9uRGlkTG9nKHJlY29yZCA9PiByZWNlaXZlZC5wdXNoKHJlY29yZCkpKTtcblxuXHRcdGxvZ2dlci50cmFjZSgnaGVsbG8gdHJhY2UnKTtcblx0XHRsb2dnZXIuZGVidWcoJ2hlbGxvIGRlYnVnJyk7XG5cdFx0bG9nZ2VyLmluZm8oJ2hlbGxvIGluZm8nKTtcblx0XHRsb2dnZXIud2FybignaGVsbG8gd2FybicpO1xuXHRcdGxvZ2dlci5lcnJvcignaGVsbG8gZXJyb3InKTtcblxuXHRcdC8vIEZpbHRlciBvdXQgdGltZXN0YW1wIGZvciBzdGFibGUgYXNzZXJ0aW9uICh0aW1lVW5peE5hbm8gaXMgcmVhbC10aW1lKS5cblx0XHRjb25zdCBzYW5pdGlzZWQgPSByZWNlaXZlZC5tYXAociA9PiAoeyBzZXZlcml0eU51bWJlcjogci5zZXZlcml0eU51bWJlciwgc2V2ZXJpdHlUZXh0OiByLnNldmVyaXR5VGV4dCwgYm9keTogci5ib2R5IH0pKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNhbml0aXNlZCwgW1xuXHRcdFx0eyBzZXZlcml0eU51bWJlcjogMSwgc2V2ZXJpdHlUZXh0OiAndHJhY2UnLCBib2R5OiAnaGVsbG8gdHJhY2UnIH0sXG5cdFx0XHR7IHNldmVyaXR5TnVtYmVyOiA1LCBzZXZlcml0eVRleHQ6ICdkZWJ1ZycsIGJvZHk6ICdoZWxsbyBkZWJ1ZycgfSxcblx0XHRcdHsgc2V2ZXJpdHlOdW1iZXI6IDksIHNldmVyaXR5VGV4dDogJ2luZm8nLCBib2R5OiAnaGVsbG8gaW5mbycgfSxcblx0XHRcdHsgc2V2ZXJpdHlOdW1iZXI6IDEzLCBzZXZlcml0eVRleHQ6ICd3YXJuJywgYm9keTogJ2hlbGxvIHdhcm4nIH0sXG5cdFx0XHR7IHNldmVyaXR5TnVtYmVyOiAxNywgc2V2ZXJpdHlUZXh0OiAnZXJyb3InLCBib2R5OiAnaGVsbG8gZXJyb3InIH0sXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2xvZ2dlciBsZXZlbCBnYXRlcyB3aGljaCByZWNvcmRzIHJlYWNoIHRoZSBPVExQIGVtaXR0ZXInLCAoKSA9PiB7XG5cdFx0Y29uc3QgZW1pdHRlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgT3RscExvZ0VtaXR0ZXIoKSk7XG5cdFx0Y29uc3Qgb3RscExvZ2dlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgT3RscEVtaXR0ZXJMb2dnZXIoZW1pdHRlciwgTG9nTGV2ZWwuV2FybmluZykpO1xuXHRcdGNvbnN0IHJlY2VpdmVkOiBJT3RscExvZ1JlY29yZFtdID0gW107XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGVtaXR0ZXIub25EaWRMb2cocmVjb3JkID0+IHJlY2VpdmVkLnB1c2gocmVjb3JkKSkpO1xuXG5cdFx0b3RscExvZ2dlci50cmFjZSgnc2hvdWxkLWRyb3AnKTtcblx0XHRvdGxwTG9nZ2VyLmRlYnVnKCdzaG91bGQtZHJvcCcpO1xuXHRcdG90bHBMb2dnZXIuaW5mbygnc2hvdWxkLWRyb3AnKTtcblx0XHRvdGxwTG9nZ2VyLndhcm4oJ3Nob3VsZC1wYXNzJyk7XG5cdFx0b3RscExvZ2dlci5lcnJvcignc2hvdWxkLXBhc3MnKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVjZWl2ZWQubWFwKHIgPT4gci5ib2R5KSwgWydzaG91bGQtcGFzcycsICdzaG91bGQtcGFzcyddKTtcblx0fSk7XG5cblx0dGVzdCgndG9SZXNvdXJjZUxvZ3NQYXlsb2FkICsgaXRlcmF0ZU90bHBMb2dSZWNvcmRzIHJvdW5kLXRyaXAnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVjb3JkOiBJT3RscExvZ1JlY29yZCA9IHtcblx0XHRcdHRpbWVVbml4TmFubzogJzEyMzAwMDAwMCcsXG5cdFx0XHRzZXZlcml0eU51bWJlcjogOSxcblx0XHRcdHNldmVyaXR5VGV4dDogJ2luZm8nLFxuXHRcdFx0Ym9keTogJ2EgYm9keScsXG5cdFx0fTtcblx0XHRjb25zdCBwYXlsb2FkID0gdG9SZXNvdXJjZUxvZ3NQYXlsb2FkKHJlY29yZCk7XG5cdFx0Y29uc3QgZGVjb2RlZCA9IFsuLi5pdGVyYXRlT3RscExvZ1JlY29yZHMocGF5bG9hZCldO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZGVjb2RlZCwgW3JlY29yZF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdPdGVsRGF0YSBhdHRyaWJ1dGVzIHN1cnZpdmUgdGhlIE90bHBFbWl0dGVyTG9nZ2VyIHJvdW5kLXRyaXAgYW5kIHN0YXkgb3V0IG9mIHRoZSBib2R5JywgKCkgPT4ge1xuXHRcdGNvbnN0IGVtaXR0ZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IE90bHBMb2dFbWl0dGVyKCkpO1xuXHRcdGNvbnN0IGxvZ2dlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgT3RscEVtaXR0ZXJMb2dnZXIoZW1pdHRlciwgTG9nTGV2ZWwuVHJhY2UpKTtcblx0XHRjb25zdCByZWNlaXZlZDogSU90bHBMb2dSZWNvcmRbXSA9IFtdO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChlbWl0dGVyLm9uRGlkTG9nKHJlY29yZCA9PiByZWNlaXZlZC5wdXNoKHJlY29yZCkpKTtcblxuXHRcdGxvZ2dlci5pbmZvKCdNQ1Agc2VydmVyIHN0YXJ0ZWQnLCBuZXcgT3RlbERhdGEoeyBpbmZvVHlwZTogJ21jcCcsIGF0dGVtcHQ6IDIsIGVuYWJsZWQ6IHRydWUgfSkpO1xuXHRcdGxvZ2dlci53YXJuKCdwbGFpbiB3YXJuaW5nJyk7XG5cblx0XHRjb25zdCByb3VuZFRyaXBwZWQgPSByZWNlaXZlZC5tYXAociA9PiBbLi4uaXRlcmF0ZU90bHBMb2dSZWNvcmRzKHRvUmVzb3VyY2VMb2dzUGF5bG9hZChyKSldWzBdKTtcblx0XHRjb25zdCBzYW5pdGlzZWQgPSByb3VuZFRyaXBwZWQubWFwKHIgPT4gKHsgc2V2ZXJpdHlUZXh0OiByLnNldmVyaXR5VGV4dCwgYm9keTogci5ib2R5LCBhdHRyaWJ1dGVzOiByLmF0dHJpYnV0ZXMgfSkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2FuaXRpc2VkLCBbXG5cdFx0XHR7IHNldmVyaXR5VGV4dDogJ2luZm8nLCBib2R5OiAnTUNQIHNlcnZlciBzdGFydGVkJywgYXR0cmlidXRlczogeyBpbmZvVHlwZTogJ21jcCcsIGF0dGVtcHQ6IDIsIGVuYWJsZWQ6IHRydWUgfSB9LFxuXHRcdFx0eyBzZXZlcml0eVRleHQ6ICd3YXJuJywgYm9keTogJ3BsYWluIHdhcm5pbmcnLCBhdHRyaWJ1dGVzOiB1bmRlZmluZWQgfSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnaW50ZWdlciBhdHRyaWJ1dGVzIGFyZSBzdHJpbmctZW5jb2RlZCBvbiB0aGUgT1RMUCB3aXJlJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlY29yZDogSU90bHBMb2dSZWNvcmQgPSB7XG5cdFx0XHR0aW1lVW5peE5hbm86ICcxMjMwMDAwMDAnLFxuXHRcdFx0c2V2ZXJpdHlOdW1iZXI6IDksXG5cdFx0XHRzZXZlcml0eVRleHQ6ICdpbmZvJyxcblx0XHRcdGJvZHk6ICdhIGJvZHknLFxuXHRcdFx0YXR0cmlidXRlczogeyBjb3VudDogMiwgcmF0aW86IDEuNSwgbGFiZWw6ICdyZWFkeScsIGVuYWJsZWQ6IHRydWUgfSxcblx0XHR9O1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0b1Jlc291cmNlTG9nc1BheWxvYWQocmVjb3JkKSwge1xuXHRcdFx0cmVzb3VyY2VMb2dzOiBbe1xuXHRcdFx0XHRyZXNvdXJjZTogeyBhdHRyaWJ1dGVzOiBbXSB9LFxuXHRcdFx0XHRzY29wZUxvZ3M6IFt7XG5cdFx0XHRcdFx0c2NvcGU6IHsgbmFtZTogJ3ZzY29kZS5hZ2VudEhvc3QnIH0sXG5cdFx0XHRcdFx0bG9nUmVjb3JkczogW3tcblx0XHRcdFx0XHRcdHRpbWVVbml4TmFubzogJzEyMzAwMDAwMCcsXG5cdFx0XHRcdFx0XHRvYnNlcnZlZFRpbWVVbml4TmFubzogJzEyMzAwMDAwMCcsXG5cdFx0XHRcdFx0XHRzZXZlcml0eU51bWJlcjogOSxcblx0XHRcdFx0XHRcdHNldmVyaXR5VGV4dDogJ2luZm8nLFxuXHRcdFx0XHRcdFx0Ym9keTogeyBzdHJpbmdWYWx1ZTogJ2EgYm9keScgfSxcblx0XHRcdFx0XHRcdGF0dHJpYnV0ZXM6IFtcblx0XHRcdFx0XHRcdFx0eyBrZXk6ICdjb3VudCcsIHZhbHVlOiB7IGludFZhbHVlOiAnMicgfSB9LFxuXHRcdFx0XHRcdFx0XHR7IGtleTogJ3JhdGlvJywgdmFsdWU6IHsgZG91YmxlVmFsdWU6IDEuNSB9IH0sXG5cdFx0XHRcdFx0XHRcdHsga2V5OiAnbGFiZWwnLCB2YWx1ZTogeyBzdHJpbmdWYWx1ZTogJ3JlYWR5JyB9IH0sXG5cdFx0XHRcdFx0XHRcdHsga2V5OiAnZW5hYmxlZCcsIHZhbHVlOiB7IGJvb2xWYWx1ZTogdHJ1ZSB9IH0sXG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdH1dLFxuXHRcdFx0XHR9XSxcblx0XHRcdH1dLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpbnZhbGlkIG51bWVyaWMgT1RMUCBhdHRyaWJ1dGVzIGFyZSBpZ25vcmVkJywgKCkgPT4ge1xuXHRcdGNvbnN0IGRlY29kZWQgPSBbLi4uaXRlcmF0ZU90bHBMb2dSZWNvcmRzKHtcblx0XHRcdHJlc291cmNlTG9nczogW3tcblx0XHRcdFx0c2NvcGVMb2dzOiBbe1xuXHRcdFx0XHRcdGxvZ1JlY29yZHM6IFt7XG5cdFx0XHRcdFx0XHR0aW1lVW5peE5hbm86ICcxMjMwMDAwMDAnLFxuXHRcdFx0XHRcdFx0c2V2ZXJpdHlOdW1iZXI6IDksXG5cdFx0XHRcdFx0XHRzZXZlcml0eVRleHQ6ICdpbmZvJyxcblx0XHRcdFx0XHRcdGJvZHk6IHsgc3RyaW5nVmFsdWU6ICdhIGJvZHknIH0sXG5cdFx0XHRcdFx0XHRhdHRyaWJ1dGVzOiBbXG5cdFx0XHRcdFx0XHRcdHsga2V5OiAndmFsaWRJbnQnLCB2YWx1ZTogeyBpbnRWYWx1ZTogJzInIH0gfSxcblx0XHRcdFx0XHRcdFx0eyBrZXk6ICduYW5JbnQnLCB2YWx1ZTogeyBpbnRWYWx1ZTogJ25vdC1hLW51bWJlcicgfSB9LFxuXHRcdFx0XHRcdFx0XHR7IGtleTogJ3Vuc2FmZUludCcsIHZhbHVlOiB7IGludFZhbHVlOiAnOTAwNzE5OTI1NDc0MDk5MicgfSB9LFxuXHRcdFx0XHRcdFx0XHR7IGtleTogJ2luZmluaXRlRG91YmxlJywgdmFsdWU6IHsgZG91YmxlVmFsdWU6IEluZmluaXR5IH0gfSxcblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0fV0sXG5cdFx0XHRcdH1dLFxuXHRcdFx0fV0sXG5cdFx0fSldO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChkZWNvZGVkLCBbe1xuXHRcdFx0dGltZVVuaXhOYW5vOiAnMTIzMDAwMDAwJyxcblx0XHRcdHNldmVyaXR5TnVtYmVyOiA5LFxuXHRcdFx0c2V2ZXJpdHlUZXh0OiAnaW5mbycsXG5cdFx0XHRib2R5OiAnYSBib2R5Jyxcblx0XHRcdGF0dHJpYnV0ZXM6IHsgdmFsaWRJbnQ6IDIgfSxcblx0XHR9XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2l0ZXJhdGVPdGxwTG9nUmVjb3JkcyB0b2xlcmF0ZXMgbWFsZm9ybWVkIHNoYXBlcycsICgpID0+IHtcblx0XHRjb25zdCBkZWNvZGVkID0gW1xuXHRcdFx0Li4uaXRlcmF0ZU90bHBMb2dSZWNvcmRzKHsgcmVzb3VyY2VMb2dzOiBbeyBzY29wZUxvZ3M6IFt7IGxvZ1JlY29yZHM6IFtudWxsLCB7IHNldmVyaXR5TnVtYmVyOiAnYmFkJyB9XSB9XSB9XSB9KSxcblx0XHRcdC4uLml0ZXJhdGVPdGxwTG9nUmVjb3Jkcyh7IHJlc291cmNlTG9nczogJ25vcGUnIH0pLFxuXHRcdFx0Li4uaXRlcmF0ZU90bHBMb2dSZWNvcmRzKHVuZGVmaW5lZCksXG5cdFx0XTtcblx0XHQvLyBPbmUgbWFsZm9ybWVkIHJlY29yZCBwYXNzZXMgdGhyb3VnaCB3aXRoIHNlbnNpYmxlIGRlZmF1bHRzOyB0aGVcblx0XHQvLyByZXN0IGFyZSBzaWxlbnRseSBkcm9wcGVkIHdpdGhvdXQgdGhyb3dpbmcuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChkZWNvZGVkLCBbe1xuXHRcdFx0dGltZVVuaXhOYW5vOiAnMCcsXG5cdFx0XHRzZXZlcml0eU51bWJlcjogMCxcblx0XHRcdHNldmVyaXR5VGV4dDogJ3RyYWNlJyxcblx0XHRcdGJvZHk6ICcnLFxuXHRcdH1dKTtcblx0fSk7XG5cblx0dGVzdCgnYnVpbGRPdGxwTG9nc0NoYW5uZWxVcmkgKyBleHRyYWN0TGV2ZWxGcm9tT3RscExvZ3NVcmkgcm91bmQtdHJpcCcsICgpID0+IHtcblx0XHRjb25zdCBjYXNlcyA9IFsndHJhY2UnLCAnZGVidWcnLCAnaW5mbycsICd3YXJuJywgJ2Vycm9yJywgJ2ZhdGFsJ10gYXMgY29uc3Q7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdGNhc2VzLm1hcChsZXZlbCA9PiAoeyBsZXZlbCwgdXJpOiBidWlsZE90bHBMb2dzQ2hhbm5lbFVyaShsZXZlbCksIHBhcnNlZDogZXh0cmFjdExldmVsRnJvbU90bHBMb2dzVXJpKGJ1aWxkT3RscExvZ3NDaGFubmVsVXJpKGxldmVsKSkgfSkpLFxuXHRcdFx0Y2FzZXMubWFwKGxldmVsID0+ICh7IGxldmVsLCB1cmk6IGBhaHAtb3RscDovL2xvZ3MvJHtsZXZlbH1gLCBwYXJzZWQ6IGxldmVsIH0pKSxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdleHRyYWN0TGV2ZWxGcm9tT3RscExvZ3NVcmkgcmVqZWN0cyB1bmtub3duIHNoYXBlcycsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0e1xuXHRcdFx0XHRiYXJlU2NoZW1lOiBleHRyYWN0TGV2ZWxGcm9tT3RscExvZ3NVcmkoJ2FocC1vdGxwOi8vbG9ncycpLFxuXHRcdFx0XHR1bmtub3duTGV2ZWw6IGV4dHJhY3RMZXZlbEZyb21PdGxwTG9nc1VyaSgnYWhwLW90bHA6Ly9sb2dzL3ZlcmJvc2UnKSxcblx0XHRcdFx0d3JvbmdTY2hlbWU6IGV4dHJhY3RMZXZlbEZyb21PdGxwTG9nc1VyaSgnYWhwLXN0YXRlOi8vbG9ncy9pbmZvJyksXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRiYXJlU2NoZW1lOiB1bmRlZmluZWQsXG5cdFx0XHRcdHVua25vd25MZXZlbDogdW5kZWZpbmVkLFxuXHRcdFx0XHR3cm9uZ1NjaGVtZTogdW5kZWZpbmVkLFxuXHRcdFx0fSxcblx0XHQpO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsZ0JBQWdCO0FBQ3pCO0FBQUEsRUFDQztBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsT0FFTTtBQUVQLE1BQU0sa0JBQWtCLE1BQU07QUFFN0IsUUFBTSxjQUFjLElBQUksZ0JBQWdCO0FBRXhDLFdBQVMsTUFBTSxZQUFZLE1BQU0sQ0FBQztBQUNsQywwQ0FBd0M7QUFFeEMsT0FBSyxzREFBc0QsTUFBTTtBQUdoRSxVQUFNLFFBQThCO0FBQUEsTUFDbkMsQ0FBQyxTQUFTLE9BQU8sQ0FBQztBQUFBLE1BQ2xCLENBQUMsU0FBUyxPQUFPLENBQUM7QUFBQSxNQUNsQixDQUFDLFNBQVMsTUFBTSxDQUFDO0FBQUEsTUFDakIsQ0FBQyxTQUFTLFNBQVMsRUFBRTtBQUFBLE1BQ3JCLENBQUMsU0FBUyxPQUFPLEVBQUU7QUFBQSxJQUNwQjtBQUNBLFVBQU0sV0FBVyxNQUFNLElBQUksQ0FBQyxDQUFDLEtBQUssTUFBTTtBQUN2QyxZQUFNLEVBQUUsZ0JBQWdCLGFBQWEsSUFBSSx1QkFBdUIsS0FBSztBQUNyRSxhQUFPLEVBQUUsT0FBTyxnQkFBZ0IsY0FBYyxXQUFXLHlCQUF5QixjQUFjLEVBQUU7QUFBQSxJQUNuRyxDQUFDO0FBQ0QsV0FBTyxnQkFBZ0IsVUFBVTtBQUFBLE1BQ2hDLEVBQUUsT0FBTyxTQUFTLE9BQU8sZ0JBQWdCLEdBQUcsY0FBYyxTQUFTLFdBQVcsU0FBUyxNQUFNO0FBQUEsTUFDN0YsRUFBRSxPQUFP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
