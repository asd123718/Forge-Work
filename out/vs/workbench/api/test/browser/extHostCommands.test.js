import assert from "assert";
import { ExtHostCommands } from "../../common/extHostCommands.js";
import { CommandsRegistry } from "../../../../platform/commands/common/commands.js";
import { SingleProxyRPCProtocol } from "../common/testRPCProtocol.js";
import { mock } from "../../../../base/test/common/mock.js";
import { NullLogService } from "../../../../platform/log/common/log.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
suite("ExtHostCommands", function() {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("dispose calls unregister", function() {
    let lastUnregister;
    const shape = new class extends mock() {
      $registerCommand(id) {
      }
      $unregisterCommand(id) {
        lastUnregister = id;
      }
    }();
    const commands = new ExtHostCommands(
      SingleProxyRPCProtocol(shape),
      new NullLogService(),
      new class extends mock() {
        onExtensionError() {
          return true;
        }
      }()
    );
    commands.registerCommand(true, "foo", () => {
    }).dispose();
    assert.strictEqual(lastUnregister, "foo");
    assert.strictEqual(CommandsRegistry.getCommand("foo"), void 0);
  });
  test("dispose bubbles only once", function() {
    let unregisterCounter = 0;
    const shape = new class extends mock() {
      $registerCommand(id) {
      }
      $unregisterCommand(id) {
        unregisterCounter += 1;
      }
    }();
    const commands = new ExtHostCommands(
      SingleProxyRPCProtocol(shape),
      new NullLogService(),
      new class extends mock() {
        onExtensionError() {
          return true;
        }
      }()
    );
    const reg = commands.registerCommand(true, "foo", () => {
    });
    reg.dispose();
    reg.dispose();
    reg.dispose();
    assert.strictEqual(unregisterCounter, 1);
  });
  test("execute with retry", async function() {
    let count = 0;
    const shape = new class extends mock() {
      $registerCommand(id) {
      }
      async $executeCommand(id, args, retry) {
        count++;
        assert.strictEqual(retry, count === 1);
        if (count === 1) {
          assert.strictEqual(retry, true);
          throw new Error("$executeCommand:retry");
        } else {
          assert.strictEqual(retry, false);
          return 17;
        }
      }
    }();
    const commands = new ExtHostCommands(
      SingleProxyRPCProtocol(shape),
      new NullLogService(),
      new class extends mock() {
        onExtensionError() {
          return true;
        }
      }()
    );
    const result = await commands.executeCommand("fooo", [this, true]);
    assert.strictEqual(result, 17);
    assert.strictEqual(count, 2);
  });
  test("onCommand:abc activates extensions when executed from command palette, but not when executed programmatically with vscode.commands.executeCommand #150293", async function() {
    const activationEvents = [];
    const shape = new class extends mock() {
      $registerCommand(id) {
      }
      $fireCommandActivationEvent(id) {
        activationEvents.push(id);
      }
    }();
    const commands = new ExtHostCommands(
      SingleProxyRPCProtocol(shape),
      new NullLogService(),
      new class extends mock() {
        onExtensionError() {
          return true;
        }
      }()
    );
    commands.registerCommand(true, "extCmd", (args) => args);
    const result = await commands.executeCommand("extCmd", this);
    assert.strictEqual(result, this);
    assert.deepStrictEqual(activationEvents, ["extCmd"]);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcdGVzdFxcYnJvd3NlclxcZXh0SG9zdENvbW1hbmRzLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBFeHRIb3N0Q29tbWFuZHMgfSBmcm9tICcuLi8uLi9jb21tb24vZXh0SG9zdENvbW1hbmRzLmpzJztcbmltcG9ydCB7IE1haW5UaHJlYWRDb21tYW5kc1NoYXBlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2V4dEhvc3QucHJvdG9jb2wuanMnO1xuaW1wb3J0IHsgQ29tbWFuZHNSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBTaW5nbGVQcm94eVJQQ1Byb3RvY29sIH0gZnJvbSAnLi4vY29tbW9uL3Rlc3RSUENQcm90b2NvbC5qcyc7XG5pbXBvcnQgeyBtb2NrIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi9tb2NrLmpzJztcbmltcG9ydCB7IE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSUV4dEhvc3RUZWxlbWV0cnkgfSBmcm9tICcuLi8uLi9jb21tb24vZXh0SG9zdFRlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcblxuc3VpdGUoJ0V4dEhvc3RDb21tYW5kcycsIGZ1bmN0aW9uICgpIHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnZGlzcG9zZSBjYWxscyB1bnJlZ2lzdGVyJywgZnVuY3Rpb24gKCkge1xuXG5cdFx0bGV0IGxhc3RVbnJlZ2lzdGVyOiBzdHJpbmc7XG5cblx0XHRjb25zdCBzaGFwZSA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8TWFpblRocmVhZENvbW1hbmRzU2hhcGU+KCkge1xuXHRcdFx0b3ZlcnJpZGUgJHJlZ2lzdGVyQ29tbWFuZChpZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0XHRcdC8vXG5cdFx0XHR9XG5cdFx0XHRvdmVycmlkZSAkdW5yZWdpc3RlckNvbW1hbmQoaWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdFx0XHRsYXN0VW5yZWdpc3RlciA9IGlkO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRjb25zdCBjb21tYW5kcyA9IG5ldyBFeHRIb3N0Q29tbWFuZHMoXG5cdFx0XHRTaW5nbGVQcm94eVJQQ1Byb3RvY29sKHNoYXBlKSxcblx0XHRcdG5ldyBOdWxsTG9nU2VydmljZSgpLFxuXHRcdFx0bmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJRXh0SG9zdFRlbGVtZXRyeT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIG9uRXh0ZW5zaW9uRXJyb3IoKTogYm9vbGVhbiB7XG5cdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHQpO1xuXHRcdGNvbW1hbmRzLnJlZ2lzdGVyQ29tbWFuZCh0cnVlLCAnZm9vJywgKCk6IGFueSA9PiB7IH0pLmRpc3Bvc2UoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGFzdFVucmVnaXN0ZXIhLCAnZm9vJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKENvbW1hbmRzUmVnaXN0cnkuZ2V0Q29tbWFuZCgnZm9vJyksIHVuZGVmaW5lZCk7XG5cblx0fSk7XG5cblx0dGVzdCgnZGlzcG9zZSBidWJibGVzIG9ubHkgb25jZScsIGZ1bmN0aW9uICgpIHtcblxuXHRcdGxldCB1bnJlZ2lzdGVyQ291bnRlciA9IDA7XG5cblx0XHRjb25zdCBzaGFwZSA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8TWFpblRocmVhZENvbW1hbmRzU2hhcGU+KCkge1xuXHRcdFx0b3ZlcnJpZGUgJHJlZ2lzdGVyQ29tbWFuZChpZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0XHRcdC8vXG5cdFx0XHR9XG5cdFx0XHRvdmVycmlkZSAkdW5yZWdpc3RlckNvbW1hbmQoaWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdFx0XHR1bnJlZ2lzdGVyQ291bnRlciArPSAxO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRjb25zdCBjb21tYW5kcyA9IG5ldyBFeHRIb3N0Q29tbWFuZHMoXG5cdFx0XHRTaW5nbGVQcm94eVJQQ1Byb3RvY29sKHNoYXBlKSxcblx0XHRcdG5ldyBOdWxsTG9nU2VydmljZSgpLFxuXHRcdFx0bmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJRXh0SG9zdFRlbGVtZXRyeT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIG9uRXh0ZW5zaW9uRXJyb3IoKTogYm9vbGVhbiB7XG5cdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHQpO1xuXHRcdGNvbnN0IHJlZyA9IGNvbW1hbmRzLnJlZ2lzdGVyQ29tbWFuZCh0cnVlLCAnZm9vJywgKCk6IGFueSA9PiB7IH0pO1xuXHRcdHJlZy5kaXNwb3NlKCk7XG5cdFx0cmVnLmRpc3Bvc2UoKTtcblx0XHRyZWcuZGlzcG9zZSgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1bnJlZ2lzdGVyQ291bnRlciwgMSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2V4ZWN1dGUgd2l0aCByZXRyeScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblxuXHRcdGxldCBjb3VudCA9IDA7XG5cblx0XHRjb25zdCBzaGFwZSA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8TWFpblRocmVhZENvbW1hbmRzU2hhcGU+KCkge1xuXHRcdFx0b3ZlcnJpZGUgJHJlZ2lzdGVyQ29tbWFuZChpZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0XHRcdC8vXG5cdFx0XHR9XG5cdFx0XHRvdmVycmlkZSBhc3luYyAkZXhlY3V0ZUNvbW1hbmQ8VD4oaWQ6IHN0cmluZywgYXJnczogYW55W10sIHJldHJ5OiBib29sZWFuKTogUHJvbWlzZTxUIHwgdW5kZWZpbmVkPiB7XG5cdFx0XHRcdGNvdW50Kys7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXRyeSwgY291bnQgPT09IDEpO1xuXHRcdFx0XHRpZiAoY291bnQgPT09IDEpIHtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmV0cnksIHRydWUpO1xuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcignJGV4ZWN1dGVDb21tYW5kOnJldHJ5Jyk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJldHJ5LCBmYWxzZSk7XG5cdFx0XHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0XHRcdFx0cmV0dXJuIDxhbnk+MTc7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0Y29uc3QgY29tbWFuZHMgPSBuZXcgRXh0SG9zdENvbW1hbmRzKFxuXHRcdFx0U2luZ2xlUHJveHlSUENQcm90b2NvbChzaGFwZSksXG5cdFx0XHRuZXcgTnVsbExvZ1NlcnZpY2UoKSxcblx0XHRcdG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUV4dEhvc3RUZWxlbWV0cnk+KCkge1xuXHRcdFx0XHRvdmVycmlkZSBvbkV4dGVuc2lvbkVycm9yKCk6IGJvb2xlYW4ge1xuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0KTtcblxuXHRcdGNvbnN0IHJlc3VsdDogbnVtYmVyID0gYXdhaXQgY29tbWFuZHMuZXhlY3V0ZUNvbW1hbmQoJ2Zvb28nLCBbdGhpcywgdHJ1ZV0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIDE3KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY291bnQsIDIpO1xuXHR9KTtcblxuXHR0ZXN0KCdvbkNvbW1hbmQ6YWJjIGFjdGl2YXRlcyBleHRlbnNpb25zIHdoZW4gZXhlY3V0ZWQgZnJvbSBjb21tYW5kIHBhbGV0dGUsIGJ1dCBub3Qgd2hlbiBleGVjdXRlZCBwcm9ncmFtbWF0aWNhbGx5IHdpdGggdnNjb2RlLmNvbW1hbmRzLmV4ZWN1dGVDb21tYW5kICMxNTAyOTMnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cblx0XHRjb25zdCBhY3RpdmF0aW9uRXZlbnRzOiBzdHJpbmdbXSA9IFtdO1xuXG5cdFx0Y29uc3Qgc2hhcGUgPSBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPE1haW5UaHJlYWRDb21tYW5kc1NoYXBlPigpIHtcblx0XHRcdG92ZXJyaWRlICRyZWdpc3RlckNvbW1hbmQoaWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdFx0XHQvL1xuXHRcdFx0fVxuXHRcdFx0b3ZlcnJpZGUgJGZpcmVDb21tYW5kQWN0aXZhdGlvbkV2ZW50KGlkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRcdFx0YWN0aXZhdGlvbkV2ZW50cy5wdXNoKGlkKTtcblx0XHRcdH1cblx0XHR9O1xuXHRcdGNvbnN0IGNvbW1hbmRzID0gbmV3IEV4dEhvc3RDb21tYW5kcyhcblx0XHRcdFNpbmdsZVByb3h5UlBDUHJvdG9jb2woc2hhcGUpLFxuXHRcdFx0bmV3IE51bGxMb2dTZXJ2aWNlKCksXG5cdFx0XHRuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElFeHRIb3N0VGVsZW1ldHJ5PigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgb25FeHRlbnNpb25FcnJvcigpOiBib29sZWFuIHtcblx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdCk7XG5cblx0XHRjb21tYW5kcy5yZWdpc3RlckNvbW1hbmQodHJ1ZSwgJ2V4dENtZCcsIChhcmdzOiBhbnkpOiBhbnkgPT4gYXJncyk7XG5cblx0XHRjb25zdCByZXN1bHQ6IHVua25vd24gPSBhd2FpdCBjb21tYW5kcy5leGVjdXRlQ29tbWFuZCgnZXh0Q21kJywgdGhpcyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgdGhpcyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3RpdmF0aW9uRXZlbnRzLCBbJ2V4dENtZCddKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLHVCQUF1QjtBQUVoQyxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLFlBQVk7QUFDckIsU0FBUyxzQkFBc0I7QUFFL0IsU0FBUywrQ0FBK0M7QUFFeEQsTUFBTSxtQkFBbUIsV0FBWTtBQUNwQywwQ0FBd0M7QUFFeEMsT0FBSyw0QkFBNEIsV0FBWTtBQUU1QyxRQUFJO0FBRUosVUFBTSxRQUFRLElBQUksY0FBYyxLQUE4QixFQUFFO0FBQUEsTUFDdEQsaUJBQWlCLElBQWtCO0FBQUEsTUFFNUM7QUFBQSxNQUNTLG1CQUFtQixJQUFrQjtBQUM3Qyx5QkFBaUI7QUFBQSxNQUNsQjtBQUFBLElBQ0Q7QUFFQSxVQUFNLFdBQVcsSUFBSTtBQUFBLE1BQ3BCLHVCQUF1QixLQUFLO0FBQUEsTUFDNUIsSUFBSSxlQUFlO0FBQUEsTUFDbkIsSUFBSSxjQUFjLEtBQXdCLEVBQUU7QUFBQSxRQUNsQyxtQkFBNEI7QUFDcEMsaUJBQU87QUFBQSxRQUNSO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFDQSxhQUFTLGdCQUFnQixNQUFNLE9BQU8sTUFBVztBQUFBLElBQUUsQ0FBQyxFQUFFLFFBQVE7QUFDOUQsV0FBTyxZQUFZLGdCQUFpQixLQUFLO0FBQ3pDLFdBQU8sWUFBWSxpQkFBaUIsV0FBVyxLQUFLLEdBQUcsTUFBUztBQUFBLEVBRWpFLENBQUM7QUFFRCxPQUFLLDZCQUE2QixXQUFZO0FBRTdDLFFBQUksb0JBQW9CO0FBRXhCLFVBQU0sUUFBUSxJQUFJLGNBQWMsS0FBOEIsRUFBRTtBQUFBLE1BQ3RELGlCQUFpQixJQUFrQjtBQUFBLE1BRTVDO0FBQUEsTUFDUyxtQkFBbUIsSUFBa0I7QUFDN0MsNkJBQXFCO0FBQUEsTUFDdEI7QUFBQSxJQUNEO0FBRUEsVUFBTSxXQUFXLElBQUk7QUFBQSxNQUNwQix1QkFBdUIsS0FBSztBQUFBLE1BQzVCLElBQUksZUFBZTtBQUFBLE1BQ25CLElBQUksY0FBYyxLQUF3QixFQUFFO0FBQUEsUUFDbEMsbUJBQTRCO0FBQ3BDLGlCQUFPO0FBQUEsUUFDUjtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQ0EsVUFBTSxNQUFNLFNBQVMsZ0JBQWdCLE1BQU0sT0FBTyxNQUFXO0FBQUEsSUFBRSxDQUFDO0FBQ2hFLFFBQUksUUFBUTtBQUNaLFFBQUksUUFBUTtBQUNaLFFBQUksUUFBUTtBQUNaLFdBQU8sWUFBWSxtQkFBbUIsQ0FBQztBQUFBLEVBQ3hDLENBQUM7QUFFRCxPQUFLLHNCQUFzQixpQkFBa0I7QUFFNUMsUUFBSSxRQUFRO0FBRVosVUFBTSxRQUFRLElBQUksY0FBYyxLQUE4QixFQUFFO0FBQUEsTUFDdEQsaUJBQWlCLElBQWtCO0FBQUEsTUFFNUM7QUFBQSxNQUNBLE1BQWUsZ0JBQW1CLElBQVksTUFBYSxPQUF3QztBQUNsRztBQUNBLGVBQU8sWUFBWSxPQUFPLFVBQVUsQ0FBQztBQUNyQyxZQUFJLFVBQVUsR0FBRztBQUNoQixpQkFBTyxZQUFZLE9BQU8sSUFBSTtBQUM5QixnQkFBTSxJQUFJLE1BQU0sdUJBQXVCO0FBQUEsUUFDeEMsT0FBTztBQUNOLGlCQUFPLFlBQVksT0FBTyxLQUFLO0FBRS9CLGlCQUFZO0FBQUEsUUFDYjtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBRUEsVUFBTSxXQUFXLElBQUk7QUFBQSxNQUNwQix1QkFBdUIsS0FBSztBQUFBLE1BQzVCLElBQUksZUFBZTtBQUFBLE1BQ25CLElBQUksY0FBYyxLQUF3QixFQUFFO0FBQUEsUUFDbEMsbUJBQTRCO0FBQ3BDLGlCQUFPO0FBQUEsUUFDUjtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBRUEsVUFBTSxTQUFpQixNQUFNLFNBQVMsZUFBZSxRQUFRLENBQUMsTUFBTSxJQUFJLENBQUM7QUFDekUsV0FBTyxZQUFZLFFBQVEsRUFBRTtBQUM3QixXQUFPLFlBQVksT0FBTyxDQUFDO0FBQUEsRUFDNUIsQ0FBQztBQUVELE9BQUssNkpBQTZKLGlCQUFrQjtBQUVuTCxVQUFNLG1CQUE2QixDQUFDO0FBRXBDLFVBQU0sUUFBUSxJQUFJLGNBQWMsS0FBOEIsRUFBRTtBQUFBLE1BQ3RELGlCQUFpQixJQUFrQjtBQUFBLE1BRTVDO0FBQUEsTUFDUyw0QkFBNEIsSUFBa0I7QUFDdEQseUJBQWlCLEtBQUssRUFBRTtBQUFBLE1BQ3pCO0FBQUEsSUFDRDtBQUNBLFVBQU0sV0FBVyxJQUFJO0FBQUEsTUFDcEIsdUJBQXVCLEtBQUs7QUFBQSxNQUM1QixJQUFJLGVBQWU7QUFBQSxNQUNuQixJQUFJLGNBQWMsS0FBd0IsRUFBRTtBQUFBLFFBQ2xDLG1CQUE0QjtBQUNwQyxpQkFBTztBQUFBLFFBQ1I7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUVBLGFBQVMsZ0JBQWdCLE1BQU0sVUFBVSxDQUFDLFNBQW1CLElBQUk7QUFFakUsVUFBTSxTQUFrQixNQUFNLFNBQVMsZUFBZSxVQUFVLElBQUk7QUFDcEUsV0FBTyxZQUFZLFFBQVEsSUFBSTtBQUMvQixXQUFPLGdCQUFnQixrQkFBa0IsQ0FBQyxRQUFRLENBQUM7QUFBQSxFQUNwRCxDQUFDO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
