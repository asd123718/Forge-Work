import assert from "assert";
import { CancellationTokenSource } from "../../../../../../base/common/cancellation.js";
import { Emitter, Event } from "../../../../../../base/common/event.js";
import { NullLogService } from "../../../../../../platform/log/common/log.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { runWithFakedTimers } from "../../../../../../base/test/common/timeTravelScheduler.js";
import { NoneExecuteStrategy } from "../../browser/executeStrategy/noneExecuteStrategy.js";
import { TestConfigurationService } from "../../../../../../platform/configuration/test/common/testConfigurationService.js";
suite("NoneExecuteStrategy", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  function createLogService() {
    return new class extends NullLogService {
      constructor() {
        super(...arguments);
        this._logBrand = void 0;
      }
    }();
  }
  function createMockTerminalAndXterm(contentsAsText, cursorLineText) {
    const onDataEmitter = store.add(new Emitter());
    const activeBuffer = {};
    const alternateBuffer = {};
    const mockXterm = {
      raw: {
        registerMarker: () => ({
          line: 0,
          isDisposed: false,
          onDispose: Event.None,
          dispose: () => {
          }
        }),
        buffer: {
          active: {
            ...activeBuffer,
            baseY: 0,
            cursorY: 1,
            getLine: () => ({
              translateToString: () => cursorLineText
            })
          },
          alternate: alternateBuffer,
          onBufferChange: () => ({ dispose: () => {
          } })
        },
        onWriteParsed: Event.None
      },
      getContentsAsText: () => contentsAsText
    };
    const mockInstance = {
      xtermReadyPromise: Promise.resolve(mockXterm),
      onData: onDataEmitter.event,
      sendText: () => {
      }
    };
    return { instance: mockInstance, onDataEmitter };
  }
  test('should report "Command produced no output" when output is empty', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const { instance } = createMockTerminalAndXterm(
      "   \n   \n   ",
      // only whitespace between markers
      "user@host:~$ "
      // prompt at cursor line → triggers prompt detection
    );
    const logService = createLogService();
    const configService = new TestConfigurationService();
    const strategy = store.add(new NoneExecuteStrategy(instance, () => false, configService, logService));
    const cts = store.add(new CancellationTokenSource());
    const result = await strategy.execute("echo test", cts.token);
    assert.strictEqual(result.additionalInformation, "Command produced no output");
  }));
  test("should not leak sandbox command echo as output when command produces no output", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const promptLine = "[ user@host:~/src (main) ] $ ";
    const sandboxCommandEcho = `ELECTRON_RUN_AS_NODE=1 PATH="$PATH:/app/node_modules/@vscode/ripgrep/bin" TMPDIR="/var/folders/bb/_8jjjyy971x2frm3nr3g7m4r0000gn/T" "/app/Contents/MacOS/Code - Insiders" "/app/Contents/Resources/app/node_modules/@vscode/sandbox-runtime/dist/cli.js" --settings "/var/folders/bb/_8jjjyy971x2frm3nr3g7m4r0000gn/T/vscode-sandbox-settings.json" -c ' git diff 0e5d5949d13f..2c357a926df6 -- '\\''src/foo.ts'\\'' | grep -A3 -B3 '\\''someFunc'\\'''`;
    const terminalContent = `${promptLine}${sandboxCommandEcho}
${" ".repeat(80)}
${promptLine}`;
    const { instance } = createMockTerminalAndXterm(
      terminalContent,
      promptLine
      // prompt at cursor line → triggers prompt detection
    );
    const logService = createLogService();
    const configService = new TestConfigurationService();
    const strategy = store.add(new NoneExecuteStrategy(instance, () => false, configService, logService));
    const cts = store.add(new CancellationTokenSource());
    const result = await strategy.execute(
      "git diff 0e5d5949d13f..2c357a926df6 -- 'src/foo.ts' | grep -A3 -B3 'someFunc'",
      cts.token
    );
    assert.strictEqual(result.output?.includes("sandbox-runtime") ?? false, false, "Output should not leak sandbox-runtime path");
    assert.strictEqual(result.output?.includes("ELECTRON_RUN_AS_NODE") ?? false, false, "Output should not leak ELECTRON_RUN_AS_NODE");
    assert.strictEqual(result.additionalInformation, "Command produced no output");
  }));
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsQ29udHJpYlxcY2hhdEFnZW50VG9vbHNcXHRlc3RcXGJyb3dzZXJcXG5vbmVFeGVjdXRlU3RyYXRlZ3kudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgdHlwZSB7IElUZXJtaW5hbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZXJtaW5hbC9jb21tb24vdGVybWluYWwuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBydW5XaXRoRmFrZWRUaW1lcnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3RpbWVUcmF2ZWxTY2hlZHVsZXIuanMnO1xuaW1wb3J0IHsgTm9uZUV4ZWN1dGVTdHJhdGVneSB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvZXhlY3V0ZVN0cmF0ZWd5L25vbmVFeGVjdXRlU3RyYXRlZ3kuanMnO1xuaW1wb3J0IHR5cGUgeyBJVGVybWluYWxJbnN0YW5jZSB9IGZyb20gJy4uLy4uLy4uLy4uL3Rlcm1pbmFsL2Jyb3dzZXIvdGVybWluYWwuanMnO1xuaW1wb3J0IHsgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi90ZXN0L2NvbW1vbi90ZXN0Q29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuXG5zdWl0ZSgnTm9uZUV4ZWN1dGVTdHJhdGVneScsICgpID0+IHtcblx0Y29uc3Qgc3RvcmUgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRmdW5jdGlvbiBjcmVhdGVMb2dTZXJ2aWNlKCk6IElUZXJtaW5hbExvZ1NlcnZpY2Uge1xuXHRcdHJldHVybiBuZXcgY2xhc3MgZXh0ZW5kcyBOdWxsTG9nU2VydmljZSB7IHJlYWRvbmx5IF9sb2dCcmFuZCA9IHVuZGVmaW5lZDsgfTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDcmVhdGVzIGEgbW9jayB0ZXJtaW5hbCBpbnN0YW5jZSBhbmQgeHRlcm0gZm9yIHRlc3RpbmcgTm9uZUV4ZWN1dGVTdHJhdGVneS5cblx0ICpcblx0ICogQHBhcmFtIGNvbnRlbnRzQXNUZXh0IFRoZSB0ZXh0IHRoYXQgYHh0ZXJtLmdldENvbnRlbnRzQXNUZXh0KClgIHdpbGwgcmV0dXJuIChzaW11bGF0ZXNcblx0ICogdGhlIHRlcm1pbmFsIGJ1ZmZlciBjb250ZW50IGJldHdlZW4gdGhlIHN0YXJ0IGFuZCBlbmQgbWFya2Vycylcblx0ICogQHBhcmFtIGN1cnNvckxpbmVUZXh0IFRoZSB0ZXh0IGF0IHRoZSBjdXJzb3IgbGluZSwgdXNlZCBieSBwcm9tcHQgZGV0ZWN0aW9uIGhldXJpc3RpY3Ncblx0ICovXG5cdGZ1bmN0aW9uIGNyZWF0ZU1vY2tUZXJtaW5hbEFuZFh0ZXJtKGNvbnRlbnRzQXNUZXh0OiBzdHJpbmcsIGN1cnNvckxpbmVUZXh0OiBzdHJpbmcpOiB7XG5cdFx0aW5zdGFuY2U6IElUZXJtaW5hbEluc3RhbmNlO1xuXHRcdG9uRGF0YUVtaXR0ZXI6IEVtaXR0ZXI8c3RyaW5nPjtcblx0fSB7XG5cdFx0Y29uc3Qgb25EYXRhRW1pdHRlciA9IHN0b3JlLmFkZChuZXcgRW1pdHRlcjxzdHJpbmc+KCkpO1xuXHRcdGNvbnN0IGFjdGl2ZUJ1ZmZlciA9IHt9O1xuXHRcdGNvbnN0IGFsdGVybmF0ZUJ1ZmZlciA9IHt9OyAvLyBkaWZmZXJlbnQgb2JqZWN0IFx1MjE5MiBub3QgYWx0IGJ1ZmZlclxuXG5cdFx0Y29uc3QgbW9ja1h0ZXJtID0ge1xuXHRcdFx0cmF3OiB7XG5cdFx0XHRcdHJlZ2lzdGVyTWFya2VyOiAoKSA9PiAoe1xuXHRcdFx0XHRcdGxpbmU6IDAsXG5cdFx0XHRcdFx0aXNEaXNwb3NlZDogZmFsc2UsXG5cdFx0XHRcdFx0b25EaXNwb3NlOiBFdmVudC5Ob25lLFxuXHRcdFx0XHRcdGRpc3Bvc2U6ICgpID0+IHsgfSxcblx0XHRcdFx0fSksXG5cdFx0XHRcdGJ1ZmZlcjoge1xuXHRcdFx0XHRcdGFjdGl2ZToge1xuXHRcdFx0XHRcdFx0Li4uYWN0aXZlQnVmZmVyLFxuXHRcdFx0XHRcdFx0YmFzZVk6IDAsXG5cdFx0XHRcdFx0XHRjdXJzb3JZOiAxLFxuXHRcdFx0XHRcdFx0Z2V0TGluZTogKCkgPT4gKHtcblx0XHRcdFx0XHRcdFx0dHJhbnNsYXRlVG9TdHJpbmc6ICgpID0+IGN1cnNvckxpbmVUZXh0LFxuXHRcdFx0XHRcdFx0fSksXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRhbHRlcm5hdGU6IGFsdGVybmF0ZUJ1ZmZlcixcblx0XHRcdFx0XHRvbkJ1ZmZlckNoYW5nZTogKCkgPT4gKHsgZGlzcG9zZTogKCkgPT4geyB9IH0pLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRvbldyaXRlUGFyc2VkOiBFdmVudC5Ob25lLFxuXHRcdFx0fSxcblx0XHRcdGdldENvbnRlbnRzQXNUZXh0OiAoKSA9PiBjb250ZW50c0FzVGV4dCxcblx0XHR9O1xuXG5cdFx0Y29uc3QgbW9ja0luc3RhbmNlID0ge1xuXHRcdFx0eHRlcm1SZWFkeVByb21pc2U6IFByb21pc2UucmVzb2x2ZShtb2NrWHRlcm0pLFxuXHRcdFx0b25EYXRhOiBvbkRhdGFFbWl0dGVyLmV2ZW50LFxuXHRcdFx0c2VuZFRleHQ6ICgpID0+IHsgfSxcblx0XHR9IGFzIHVua25vd24gYXMgSVRlcm1pbmFsSW5zdGFuY2U7XG5cblx0XHRyZXR1cm4geyBpbnN0YW5jZTogbW9ja0luc3RhbmNlLCBvbkRhdGFFbWl0dGVyIH07XG5cdH1cblxuXHR0ZXN0KCdzaG91bGQgcmVwb3J0IFwiQ29tbWFuZCBwcm9kdWNlZCBubyBvdXRwdXRcIiB3aGVuIG91dHB1dCBpcyBlbXB0eScsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIFNpbXVsYXRlIGEgY29tbWFuZCB0aGF0IHByb2R1Y2VzIG5vIG91dHB1dC4gQmV0d2VlbiB0aGUgc3RhcnQgYW5kIGVuZCBtYXJrZXJzLFxuXHRcdC8vIGdldENvbnRlbnRzQXNUZXh0IHJldHVybnMgb25seSB3aGl0ZXNwYWNlIChubyBhY3R1YWwgY29tbWFuZCBvdXRwdXQpLlxuXHRcdGNvbnN0IHsgaW5zdGFuY2UgfSA9IGNyZWF0ZU1vY2tUZXJtaW5hbEFuZFh0ZXJtKFxuXHRcdFx0JyAgIFxcbiAgIFxcbiAgICcsICAvLyBvbmx5IHdoaXRlc3BhY2UgYmV0d2VlbiBtYXJrZXJzXG5cdFx0XHQndXNlckBob3N0On4kICcgICAgLy8gcHJvbXB0IGF0IGN1cnNvciBsaW5lIFx1MjE5MiB0cmlnZ2VycyBwcm9tcHQgZGV0ZWN0aW9uXG5cdFx0KTtcblxuXHRcdGNvbnN0IGxvZ1NlcnZpY2UgPSBjcmVhdGVMb2dTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgY29uZmlnU2VydmljZSA9IG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoKTtcblx0XHRjb25zdCBzdHJhdGVneSA9IHN0b3JlLmFkZChuZXcgTm9uZUV4ZWN1dGVTdHJhdGVneShpbnN0YW5jZSwgKCkgPT4gZmFsc2UsIGNvbmZpZ1NlcnZpY2UsIGxvZ1NlcnZpY2UpKTtcblx0XHRjb25zdCBjdHMgPSBzdG9yZS5hZGQobmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCkpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgc3RyYXRlZ3kuZXhlY3V0ZSgnZWNobyB0ZXN0JywgY3RzLnRva2VuKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuYWRkaXRpb25hbEluZm9ybWF0aW9uLCAnQ29tbWFuZCBwcm9kdWNlZCBubyBvdXRwdXQnKTtcblx0fSkpO1xuXG5cdHRlc3QoJ3Nob3VsZCBub3QgbGVhayBzYW5kYm94IGNvbW1hbmQgZWNobyBhcyBvdXRwdXQgd2hlbiBjb21tYW5kIHByb2R1Y2VzIG5vIG91dHB1dCcsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIFRoaXMgc2ltdWxhdGVzIHRoZSBleGFjdCBzY2VuYXJpbyBmcm9tIGlzc3VlICMzMDM1MzE6XG5cdFx0Ly8gQSBzYW5kYm94ZWQgY29tbWFuZCBwcm9kdWNlcyBubyBvdXRwdXQsIGJ1dCBnZXRDb250ZW50c0FzVGV4dCByZXR1cm5zIHRoZVxuXHRcdC8vIHByb21wdCArIHNhbmRib3gtd3JhcHBlZCBjb21tYW5kIGVjaG8gKyBuZXh0IHByb21wdCBsaW5lLlxuXHRcdGNvbnN0IHByb21wdExpbmUgPSAnWyB1c2VyQGhvc3Q6fi9zcmMgKG1haW4pIF0gJCAnO1xuXHRcdGNvbnN0IHNhbmRib3hDb21tYW5kRWNobyA9ICdFTEVDVFJPTl9SVU5fQVNfTk9ERT0xIFBBVEg9XCIkUEFUSDovYXBwL25vZGVfbW9kdWxlcy9AdnNjb2RlL3JpcGdyZXAvYmluXCIgJ1xuXHRcdFx0KyAnVE1QRElSPVwiL3Zhci9mb2xkZXJzL2JiL184ampqeXk5NzF4MmZybTNucjNnN200cjAwMDBnbi9UXCIgJ1xuXHRcdFx0KyAnXCIvYXBwL0NvbnRlbnRzL01hY09TL0NvZGUgLSBJbnNpZGVyc1wiIFwiL2FwcC9Db250ZW50cy9SZXNvdXJjZXMvYXBwL25vZGVfbW9kdWxlcy9AdnNjb2RlL3NhbmRib3gtcnVudGltZS9kaXN0L2NsaS5qc1wiICdcblx0XHRcdCsgJy0tc2V0dGluZ3MgXCIvdmFyL2ZvbGRlcnMvYmIvXzhqamp5eTk3MXgyZnJtM25yM2c3bTRyMDAwMGduL1QvdnNjb2RlLXNhbmRib3gtc2V0dGluZ3MuanNvblwiICdcblx0XHRcdCsgJy1jIFxcJyBnaXQgZGlmZiAwZTVkNTk0OWQxM2YuLjJjMzU3YTkyNmRmNiAtLSBcXCdcXFxcXFwnXFwnc3JjL2Zvby50c1xcJ1xcXFxcXCdcXCcgfCBncmVwIC1BMyAtQjMgXFwnXFxcXFxcJ1xcJ3NvbWVGdW5jXFwnXFxcXFxcJ1xcJ1xcJyc7XG5cdFx0Y29uc3QgdGVybWluYWxDb250ZW50ID0gYCR7cHJvbXB0TGluZX0ke3NhbmRib3hDb21tYW5kRWNob31cXG4keycgJy5yZXBlYXQoODApfVxcbiR7cHJvbXB0TGluZX1gO1xuXG5cdFx0Y29uc3QgeyBpbnN0YW5jZSB9ID0gY3JlYXRlTW9ja1Rlcm1pbmFsQW5kWHRlcm0oXG5cdFx0XHR0ZXJtaW5hbENvbnRlbnQsXG5cdFx0XHRwcm9tcHRMaW5lICAgICAgICAvLyBwcm9tcHQgYXQgY3Vyc29yIGxpbmUgXHUyMTkyIHRyaWdnZXJzIHByb21wdCBkZXRlY3Rpb25cblx0XHQpO1xuXG5cdFx0Y29uc3QgbG9nU2VydmljZSA9IGNyZWF0ZUxvZ1NlcnZpY2UoKTtcblx0XHRjb25zdCBjb25maWdTZXJ2aWNlID0gbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSgpO1xuXHRcdGNvbnN0IHN0cmF0ZWd5ID0gc3RvcmUuYWRkKG5ldyBOb25lRXhlY3V0ZVN0cmF0ZWd5KGluc3RhbmNlLCAoKSA9PiBmYWxzZSwgY29uZmlnU2VydmljZSwgbG9nU2VydmljZSkpO1xuXHRcdGNvbnN0IGN0cyA9IHN0b3JlLmFkZChuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKSk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzdHJhdGVneS5leGVjdXRlKFxuXHRcdFx0J2dpdCBkaWZmIDBlNWQ1OTQ5ZDEzZi4uMmMzNTdhOTI2ZGY2IC0tIFxcJ3NyYy9mb28udHNcXCcgfCBncmVwIC1BMyAtQjMgXFwnc29tZUZ1bmNcXCcnLFxuXHRcdFx0Y3RzLnRva2VuXG5cdFx0KTtcblxuXHRcdC8vIFRoZSBvdXRwdXQgc2hvdWxkIE5PVCBjb250YWluIHNhbmRib3ggd3JhcHBlciBhcnRpZmFjdHNcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lm91dHB1dD8uaW5jbHVkZXMoJ3NhbmRib3gtcnVudGltZScpID8/IGZhbHNlLCBmYWxzZSwgJ091dHB1dCBzaG91bGQgbm90IGxlYWsgc2FuZGJveC1ydW50aW1lIHBhdGgnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lm91dHB1dD8uaW5jbHVkZXMoJ0VMRUNUUk9OX1JVTl9BU19OT0RFJykgPz8gZmFsc2UsIGZhbHNlLCAnT3V0cHV0IHNob3VsZCBub3QgbGVhayBFTEVDVFJPTl9SVU5fQVNfTk9ERScpO1xuXG5cdFx0Ly8gU2hvdWxkIHJlcG9ydCB0aGF0IHRoZSBjb21tYW5kIHByb2R1Y2VkIG5vIG91dHB1dFxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuYWRkaXRpb25hbEluZm9ybWF0aW9uLCAnQ29tbWFuZCBwcm9kdWNlZCBubyBvdXRwdXQnKTtcblx0fSkpO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyxTQUFTLGFBQWE7QUFDL0IsU0FBUyxzQkFBc0I7QUFFL0IsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUywwQkFBMEI7QUFDbkMsU0FBUywyQkFBMkI7QUFFcEMsU0FBUyxnQ0FBZ0M7QUFFekMsTUFBTSx1QkFBdUIsTUFBTTtBQUNsQyxRQUFNLFFBQVEsd0NBQXdDO0FBRXRELFdBQVMsbUJBQXdDO0FBQ2hELFdBQU8sSUFBSSxjQUFjLGVBQWU7QUFBQSxNQUE3QjtBQUFBO0FBQStCLGFBQVMsWUFBWTtBQUFBO0FBQUEsSUFBVztBQUFBLEVBQzNFO0FBU0EsV0FBUywyQkFBMkIsZ0JBQXdCLGdCQUcxRDtBQUNELFVBQU0sZ0JBQWdCLE1BQU0sSUFBSSxJQUFJLFFBQWdCLENBQUM7QUFDckQsVUFBTSxlQUFlLENBQUM7QUFDdEIsVUFBTSxrQkFBa0IsQ0FBQztBQUV6QixVQUFNLFlBQVk7QUFBQSxNQUNqQixLQUFLO0FBQUEsUUFDSixnQkFBZ0IsT0FBTztBQUFBLFVBQ3RCLE1BQU07QUFBQSxVQUNOLFlBQVk7QUFBQSxVQUNaLFdBQVcsTUFBTTtBQUFBLFVBQ2pCLFNBQVMsTUFBTTtBQUFBLFVBQUU7QUFBQSxRQUNsQjtBQUFBLFFBQ0EsUUFBUTtBQUFBLFVBQ1AsUUFBUTtBQUFBLFlBQ1AsR0FBRztBQUFBLFlBQ0gsT0FBTztBQUFBLFlBQ1AsU0FBUztBQUFBLFlBQ1QsU0FBUyxPQUFPO0FBQUEsY0FDZixtQkFBbUIsTUFBTTtBQUFBLFlBQzFCO0FBQUEsVUFDRDtBQUFBLFVBQ0EsV0FBVztBQUFBLFVBQ1gsZ0JBQWdCLE9BQU8sRUFBRSxTQUFTLE1BQU07QUFBQSxVQUFFLEVBQUU7QUFBQSxRQUM3QztBQUFBLFFBQ0EsZUFBZSxNQUFNO0FBQUEsTUFDdEI7QUFBQSxNQUNBLG1CQUFtQixNQUFNO0FBQUEsSUFDMUI7QUFFQSxVQUFNLGVBQWU7QUFBQSxNQUNwQixtQkFBbUIsUUFBUSxRQUFRLFNBQVM7QUFBQSxNQUM1QyxRQUFRLGNBQWM7QUFBQSxNQUN0QixVQUFVLE1BQU07QUFBQSxNQUFFO0FBQUEsSUFDbkI7QUFFQSxXQUFPLEVBQUUsVUFBVSxjQUFjLGNBQWM7QUFBQSxFQUNoRDtBQUVBLE9BQUssbUVBQW1FLE1BQU0sbUJBQW1CLEVBQUUsZUFBZSxLQUFLLEdBQUcsWUFBWTtBQUdySSxVQUFNLEVBQUUsU0FBUyxJQUFJO0FBQUEsTUFDcEI7QUFBQTtBQUFBLE1BQ0E7QUFBQTtBQUFBLElBQ0Q7QUFFQSxVQUFNLGFBQWEsaUJBQWlCO0FBQ3BDLFVBQU0sZ0JBQWdCLElBQUkseUJBQXlCO0FBQ25ELFVBQU0sV0FBVyxNQUFNLElBQUksSUFBSSxvQkFBb0IsVUFBVSxNQUFNLE9BQU8sZUFBZSxVQUFVLENBQUM7QUFDcEcsVUFBTSxNQUFNLE1BQU0sSUFBSSxJQUFJLHdCQUF3QixDQUFDO0FBRW5ELFVBQU0sU0FBUyxNQUFNLFNBQVMsUUFBUSxhQUFhLElBQUksS0FBSztBQUU1RCxXQUFPLFlBQVksT0FBTyx1QkFBdUIsNEJBQTRCO0FBQUEsRUFDOUUsQ0FBQyxDQUFDO0FBRUYsT0FBSyxrRkFBa0YsTUFBTSxtQkFBbUIsRUFBRSxlQUFlLEtBQUssR0FBRyxZQUFZO0FBSXBKLFVBQU0sYUFBYTtBQUNuQixVQUFNLHFCQUFxQjtBQUszQixVQUFNLGtCQUFrQixHQUFHLFVBQVUsR0FBRyxrQkFBa0I7QUFBQSxFQUFLLElBQUksT0FBTyxFQUFFLENBQUM7QUFBQSxFQUFLLFVBQVU7QUFFNUYsVUFBTSxFQUFFLFNBQVMsSUFBSTtBQUFBLE1BQ3BCO0FBQUEsTUFDQTtBQUFBO0FBQUEsSUFDRDtBQUVBLFVBQU0sYUFBYSxpQkFBaUI7QUFDcEMsVUFBTSxnQkFBZ0IsSUFBSSx5QkFBeUI7QUFDbkQsVUFBTSxXQUFXLE1BQU0sSUFBSSxJQUFJLG9CQUFvQixVQUFVLE1BQU0sT0FBTyxlQUFlLFVBQVUsQ0FBQztBQUNwRyxVQUFNLE1BQU0sTUFBTSxJQUFJLElBQUksd0JBQXdCLENBQUM7QUFFbkQsVUFBTSxTQUFTLE1BQU0sU0FBUztBQUFBLE1BQzdCO0FBQUEsTUFDQSxJQUFJO0FBQUEsSUFDTDtBQUdBLFdBQU8sWUFBWSxPQUFPLFFBQVEsU0FBUyxpQkFBaUIsS0FBSyxPQUFPLE9BQU8sNkNBQTZDO0FBQzVILFdBQU8sWUFBWSxPQUFPLFFBQVEsU0FBUyxzQkFBc0IsS0FBSyxPQUFPLE9BQU8sNkNBQTZDO0FBR2pJLFdBQU8sWUFBWSxPQUFPLHVCQUF1Qiw0QkFBNEI7QUFBQSxFQUM5RSxDQUFDLENBQUM7QUFDSCxDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
