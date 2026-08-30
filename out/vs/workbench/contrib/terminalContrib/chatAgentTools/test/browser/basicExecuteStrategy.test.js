import { strictEqual, rejects } from "assert";
import { CancellationToken } from "../../../../../../base/common/cancellation.js";
import { Emitter, Event } from "../../../../../../base/common/event.js";
import { toDisposable } from "../../../../../../base/common/lifecycle.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { TestConfigurationService } from "../../../../../../platform/configuration/test/common/testConfigurationService.js";
import { NullLogService } from "../../../../../../platform/log/common/log.js";
import { BasicExecuteStrategy } from "../../browser/executeStrategy/basicExecuteStrategy.js";
function createLogService() {
  return new class extends NullLogService {
    constructor() {
      super(...arguments);
      this._logBrand = void 0;
    }
  }();
}
suite("BasicExecuteStrategy", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  test("completes when terminal process exits without shell integration sequences", async () => {
    const onCommandFinishedEmitter = new Emitter();
    const onExitEmitter = new Emitter();
    const marker = {
      line: 0,
      dispose: () => {
      },
      onDispose: Event.None
    };
    const xterm = {
      raw: {
        registerMarker: () => marker,
        buffer: {
          active: {},
          alternate: {},
          onBufferChange: () => toDisposable(() => {
          })
        },
        getContentsAsText: () => "some output"
      }
    };
    const instance = {
      xtermReadyPromise: Promise.resolve(xterm),
      onData: Event.None,
      onDisposed: Event.None,
      onExit: onExitEmitter.event,
      sendText: () => {
        queueMicrotask(() => onExitEmitter.fire(1));
      }
    };
    const commandDetection = {
      onCommandFinished: onCommandFinishedEmitter.event
    };
    const strategy = store.add(new BasicExecuteStrategy(
      instance,
      () => false,
      commandDetection,
      new TestConfigurationService(),
      createLogService()
    ));
    const result = await strategy.execute("exit 1", CancellationToken.None);
    strictEqual(result.exitCode, 1);
  });
  test("returns immediately with captured exit code when pty has already exited before execute()", async () => {
    const onCommandFinishedEmitter = new Emitter();
    const onExitEmitter = new Emitter();
    const instance = {
      xtermReadyPromise: Promise.resolve({}),
      onData: Event.None,
      onDisposed: Event.None,
      onExit: onExitEmitter.event,
      isDisposed: false,
      exitCode: 1,
      sendText: () => {
        throw new Error("sendText should not be called when pty already exited");
      }
    };
    const commandDetection = {
      onCommandFinished: onCommandFinishedEmitter.event
    };
    const strategy = store.add(new BasicExecuteStrategy(
      instance,
      () => false,
      commandDetection,
      new TestConfigurationService(),
      createLogService()
    ));
    const result = await strategy.execute("Rscript /app/ars.R", CancellationToken.None);
    strictEqual(result.exitCode, 1);
    strictEqual(result.output, void 0);
    strictEqual(result.additionalInformation, "Command exited with code 1");
  });
  test('throws "The terminal was closed" when instance is already disposed before execute()', async () => {
    const onCommandFinishedEmitter = new Emitter();
    const instance = {
      xtermReadyPromise: Promise.resolve({}),
      onData: Event.None,
      onDisposed: Event.None,
      onExit: Event.None,
      isDisposed: true,
      exitCode: void 0,
      sendText: () => {
        throw new Error("sendText should not be called when terminal is disposed");
      }
    };
    const commandDetection = {
      onCommandFinished: onCommandFinishedEmitter.event
    };
    const strategy = store.add(new BasicExecuteStrategy(
      instance,
      () => false,
      commandDetection,
      new TestConfigurationService(),
      createLogService()
    ));
    await rejects(
      () => strategy.execute("echo hello", CancellationToken.None),
      /The terminal was closed/
    );
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsQ29udHJpYlxcY2hhdEFnZW50VG9vbHNcXHRlc3RcXGJyb3dzZXJcXGJhc2ljRXhlY3V0ZVN0cmF0ZWd5LnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBzdHJpY3RFcXVhbCwgcmVqZWN0cyB9IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vdGVzdC9jb21tb24vdGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHR5cGUgeyBJVGVybWluYWxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvY29tbW9uL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB7IEJhc2ljRXhlY3V0ZVN0cmF0ZWd5IH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9leGVjdXRlU3RyYXRlZ3kvYmFzaWNFeGVjdXRlU3RyYXRlZ3kuanMnO1xuaW1wb3J0IHR5cGUgeyBJVGVybWluYWxJbnN0YW5jZSB9IGZyb20gJy4uLy4uLy4uLy4uL3Rlcm1pbmFsL2Jyb3dzZXIvdGVybWluYWwuanMnO1xuaW1wb3J0IHR5cGUgeyBJQ29tbWFuZERldGVjdGlvbkNhcGFiaWxpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZXJtaW5hbC9jb21tb24vY2FwYWJpbGl0aWVzL2NhcGFiaWxpdGllcy5qcyc7XG5cbmZ1bmN0aW9uIGNyZWF0ZUxvZ1NlcnZpY2UoKTogSVRlcm1pbmFsTG9nU2VydmljZSB7XG5cdHJldHVybiBuZXcgY2xhc3MgZXh0ZW5kcyBOdWxsTG9nU2VydmljZSB7IHJlYWRvbmx5IF9sb2dCcmFuZCA9IHVuZGVmaW5lZDsgfTtcbn1cblxuc3VpdGUoJ0Jhc2ljRXhlY3V0ZVN0cmF0ZWd5JywgKCkgPT4ge1xuXHRjb25zdCBzdG9yZSA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ2NvbXBsZXRlcyB3aGVuIHRlcm1pbmFsIHByb2Nlc3MgZXhpdHMgd2l0aG91dCBzaGVsbCBpbnRlZ3JhdGlvbiBzZXF1ZW5jZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgb25Db21tYW5kRmluaXNoZWRFbWl0dGVyID0gbmV3IEVtaXR0ZXI8eyBnZXRPdXRwdXQoKTogc3RyaW5nOyBleGl0Q29kZTogbnVtYmVyIH0+KCk7XG5cdFx0Y29uc3Qgb25FeGl0RW1pdHRlciA9IG5ldyBFbWl0dGVyPG51bWJlciB8IHVuZGVmaW5lZD4oKTtcblxuXHRcdGNvbnN0IG1hcmtlciA9IHtcblx0XHRcdGxpbmU6IDAsXG5cdFx0XHRkaXNwb3NlOiAoKSA9PiB7IH0sXG5cdFx0XHRvbkRpc3Bvc2U6IEV2ZW50Lk5vbmUsXG5cdFx0fTtcblx0XHRjb25zdCB4dGVybSA9IHtcblx0XHRcdHJhdzoge1xuXHRcdFx0XHRyZWdpc3Rlck1hcmtlcjogKCkgPT4gbWFya2VyLFxuXHRcdFx0XHRidWZmZXI6IHtcblx0XHRcdFx0XHRhY3RpdmU6IHt9LFxuXHRcdFx0XHRcdGFsdGVybmF0ZToge30sXG5cdFx0XHRcdFx0b25CdWZmZXJDaGFuZ2U6ICgpID0+IHRvRGlzcG9zYWJsZSgoKSA9PiB7IH0pLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRnZXRDb250ZW50c0FzVGV4dDogKCkgPT4gJ3NvbWUgb3V0cHV0Jyxcblx0XHRcdH1cblx0XHR9O1xuXHRcdGNvbnN0IGluc3RhbmNlID0ge1xuXHRcdFx0eHRlcm1SZWFkeVByb21pc2U6IFByb21pc2UucmVzb2x2ZSh4dGVybSksXG5cdFx0XHRvbkRhdGE6IEV2ZW50Lk5vbmUsXG5cdFx0XHRvbkRpc3Bvc2VkOiBFdmVudC5Ob25lLFxuXHRcdFx0b25FeGl0OiBvbkV4aXRFbWl0dGVyLmV2ZW50LFxuXHRcdFx0c2VuZFRleHQ6ICgpID0+IHtcblx0XHRcdFx0Ly8gU2ltdWxhdGUgcHJvY2VzcyBleGl0aW5nIHdpdGhvdXQgZmlyaW5nIG9uQ29tbWFuZEZpbmlzaGVkXG5cdFx0XHRcdHF1ZXVlTWljcm90YXNrKCgpID0+IG9uRXhpdEVtaXR0ZXIuZmlyZSgxKSk7XG5cdFx0XHR9LFxuXHRcdH0gYXMgdW5rbm93biBhcyBJVGVybWluYWxJbnN0YW5jZTtcblx0XHRjb25zdCBjb21tYW5kRGV0ZWN0aW9uID0ge1xuXHRcdFx0b25Db21tYW5kRmluaXNoZWQ6IG9uQ29tbWFuZEZpbmlzaGVkRW1pdHRlci5ldmVudCxcblx0XHR9IGFzIHVua25vd24gYXMgSUNvbW1hbmREZXRlY3Rpb25DYXBhYmlsaXR5O1xuXHRcdGNvbnN0IHN0cmF0ZWd5ID0gc3RvcmUuYWRkKG5ldyBCYXNpY0V4ZWN1dGVTdHJhdGVneShcblx0XHRcdGluc3RhbmNlLFxuXHRcdFx0KCkgPT4gZmFsc2UsXG5cdFx0XHRjb21tYW5kRGV0ZWN0aW9uLFxuXHRcdFx0bmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSgpLFxuXHRcdFx0Y3JlYXRlTG9nU2VydmljZSgpLFxuXHRcdCkpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgc3RyYXRlZ3kuZXhlY3V0ZSgnZXhpdCAxJywgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHRzdHJpY3RFcXVhbChyZXN1bHQuZXhpdENvZGUsIDEpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXR1cm5zIGltbWVkaWF0ZWx5IHdpdGggY2FwdHVyZWQgZXhpdCBjb2RlIHdoZW4gcHR5IGhhcyBhbHJlYWR5IGV4aXRlZCBiZWZvcmUgZXhlY3V0ZSgpJywgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIFNpbXVsYXRlcyB0aGUgc2NlbmFyaW8gd2hlcmUgdGhlIHNoZWxsIHByb2Nlc3MgZnJvbSBhIHByZXZpb3VzIGNvbW1hbmRcblx0XHQvLyBoYXMgYWxyZWFkeSBkaWVkLCBzbyBvbkV4aXQgaGFzIGFscmVhZHkgZmlyZWQgYW5kIEV2ZW50LnRvUHJvbWlzZShvbkV4aXQpXG5cdFx0Ly8gd291bGQgbmV2ZXIgcmVzb2x2ZS4gVGhlIHN0cmF0ZWd5IG11c3Qgc2hvcnQtY2lyY3VpdCB1c2luZyB0aGVcblx0XHQvLyBpbnN0YW5jZSdzIGFscmVhZHktY2FwdHVyZWQgZXhpdENvZGUuXG5cdFx0Y29uc3Qgb25Db21tYW5kRmluaXNoZWRFbWl0dGVyID0gbmV3IEVtaXR0ZXI8eyBnZXRPdXRwdXQoKTogc3RyaW5nOyBleGl0Q29kZTogbnVtYmVyIH0+KCk7XG5cdFx0Y29uc3Qgb25FeGl0RW1pdHRlciA9IG5ldyBFbWl0dGVyPG51bWJlciB8IHVuZGVmaW5lZD4oKTtcblx0XHRjb25zdCBpbnN0YW5jZSA9IHtcblx0XHRcdHh0ZXJtUmVhZHlQcm9taXNlOiBQcm9taXNlLnJlc29sdmUoe30pLFxuXHRcdFx0b25EYXRhOiBFdmVudC5Ob25lLFxuXHRcdFx0b25EaXNwb3NlZDogRXZlbnQuTm9uZSxcblx0XHRcdG9uRXhpdDogb25FeGl0RW1pdHRlci5ldmVudCxcblx0XHRcdGlzRGlzcG9zZWQ6IGZhbHNlLFxuXHRcdFx0ZXhpdENvZGU6IDEsXG5cdFx0XHRzZW5kVGV4dDogKCkgPT4geyB0aHJvdyBuZXcgRXJyb3IoJ3NlbmRUZXh0IHNob3VsZCBub3QgYmUgY2FsbGVkIHdoZW4gcHR5IGFscmVhZHkgZXhpdGVkJyk7IH0sXG5cdFx0fSBhcyB1bmtub3duIGFzIElUZXJtaW5hbEluc3RhbmNlO1xuXHRcdGNvbnN0IGNvbW1hbmREZXRlY3Rpb24gPSB7XG5cdFx0XHRvbkNvbW1hbmRGaW5pc2hlZDogb25Db21tYW5kRmluaXNoZWRFbWl0dGVyLmV2ZW50LFxuXHRcdH0gYXMgdW5rbm93biBhcyBJQ29tbWFuZERldGVjdGlvbkNhcGFiaWxpdHk7XG5cdFx0Y29uc3Qgc3RyYXRlZ3kgPSBzdG9yZS5hZGQobmV3IEJhc2ljRXhlY3V0ZVN0cmF0ZWd5KFxuXHRcdFx0aW5zdGFuY2UsXG5cdFx0XHQoKSA9PiBmYWxzZSxcblx0XHRcdGNvbW1hbmREZXRlY3Rpb24sXG5cdFx0XHRuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKCksXG5cdFx0XHRjcmVhdGVMb2dTZXJ2aWNlKCksXG5cdFx0KSk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzdHJhdGVneS5leGVjdXRlKCdSc2NyaXB0IC9hcHAvYXJzLlInLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdHN0cmljdEVxdWFsKHJlc3VsdC5leGl0Q29kZSwgMSk7XG5cdFx0c3RyaWN0RXF1YWwocmVzdWx0Lm91dHB1dCwgdW5kZWZpbmVkKTtcblx0XHRzdHJpY3RFcXVhbChyZXN1bHQuYWRkaXRpb25hbEluZm9ybWF0aW9uLCAnQ29tbWFuZCBleGl0ZWQgd2l0aCBjb2RlIDEnKTtcblx0fSk7XG5cblx0dGVzdCgndGhyb3dzIFwiVGhlIHRlcm1pbmFsIHdhcyBjbG9zZWRcIiB3aGVuIGluc3RhbmNlIGlzIGFscmVhZHkgZGlzcG9zZWQgYmVmb3JlIGV4ZWN1dGUoKScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBvbkNvbW1hbmRGaW5pc2hlZEVtaXR0ZXIgPSBuZXcgRW1pdHRlcjx7IGdldE91dHB1dCgpOiBzdHJpbmc7IGV4aXRDb2RlOiBudW1iZXIgfT4oKTtcblx0XHRjb25zdCBpbnN0YW5jZSA9IHtcblx0XHRcdHh0ZXJtUmVhZHlQcm9taXNlOiBQcm9taXNlLnJlc29sdmUoe30pLFxuXHRcdFx0b25EYXRhOiBFdmVudC5Ob25lLFxuXHRcdFx0b25EaXNwb3NlZDogRXZlbnQuTm9uZSxcblx0XHRcdG9uRXhpdDogRXZlbnQuTm9uZSxcblx0XHRcdGlzRGlzcG9zZWQ6IHRydWUsXG5cdFx0XHRleGl0Q29kZTogdW5kZWZpbmVkLFxuXHRcdFx0c2VuZFRleHQ6ICgpID0+IHsgdGhyb3cgbmV3IEVycm9yKCdzZW5kVGV4dCBzaG91bGQgbm90IGJlIGNhbGxlZCB3aGVuIHRlcm1pbmFsIGlzIGRpc3Bvc2VkJyk7IH0sXG5cdFx0fSBhcyB1bmtub3duIGFzIElUZXJtaW5hbEluc3RhbmNlO1xuXHRcdGNvbnN0IGNvbW1hbmREZXRlY3Rpb24gPSB7XG5cdFx0XHRvbkNvbW1hbmRGaW5pc2hlZDogb25Db21tYW5kRmluaXNoZWRFbWl0dGVyLmV2ZW50LFxuXHRcdH0gYXMgdW5rbm93biBhcyBJQ29tbWFuZERldGVjdGlvbkNhcGFiaWxpdHk7XG5cdFx0Y29uc3Qgc3RyYXRlZ3kgPSBzdG9yZS5hZGQobmV3IEJhc2ljRXhlY3V0ZVN0cmF0ZWd5KFxuXHRcdFx0aW5zdGFuY2UsXG5cdFx0XHQoKSA9PiBmYWxzZSxcblx0XHRcdGNvbW1hbmREZXRlY3Rpb24sXG5cdFx0XHRuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKCksXG5cdFx0XHRjcmVhdGVMb2dTZXJ2aWNlKCksXG5cdFx0KSk7XG5cblx0XHRhd2FpdCByZWplY3RzKFxuXHRcdFx0KCkgPT4gc3RyYXRlZ3kuZXhlY3V0ZSgnZWNobyBoZWxsbycsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpLFxuXHRcdFx0L1RoZSB0ZXJtaW5hbCB3YXMgY2xvc2VkL1xuXHRcdCk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLGFBQWEsZUFBZTtBQUNyQyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLFNBQVMsYUFBYTtBQUMvQixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLCtDQUErQztBQUN4RCxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLHNCQUFzQjtBQUUvQixTQUFTLDRCQUE0QjtBQUlyQyxTQUFTLG1CQUF3QztBQUNoRCxTQUFPLElBQUksY0FBYyxlQUFlO0FBQUEsSUFBN0I7QUFBQTtBQUErQixXQUFTLFlBQVk7QUFBQTtBQUFBLEVBQVc7QUFDM0U7QUFFQSxNQUFNLHdCQUF3QixNQUFNO0FBQ25DLFFBQU0sUUFBUSx3Q0FBd0M7QUFFdEQsT0FBSyw2RUFBNkUsWUFBWTtBQUM3RixVQUFNLDJCQUEyQixJQUFJLFFBQW1EO0FBQ3hGLFVBQU0sZ0JBQWdCLElBQUksUUFBNEI7QUFFdEQsVUFBTSxTQUFTO0FBQUEsTUFDZCxNQUFNO0FBQUEsTUFDTixTQUFTLE1BQU07QUFBQSxNQUFFO0FBQUEsTUFDakIsV0FBVyxNQUFNO0FBQUEsSUFDbEI7QUFDQSxVQUFN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
