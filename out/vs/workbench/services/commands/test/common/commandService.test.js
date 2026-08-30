import assert from "assert";
import { DisposableStore } from "../../../../../base/common/lifecycle.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { CommandsRegistry } from "../../../../../platform/commands/common/commands.js";
import { InstantiationService } from "../../../../../platform/instantiation/common/instantiationService.js";
import { NullLogService } from "../../../../../platform/log/common/log.js";
import { NullExtensionService } from "../../../extensions/common/extensions.js";
import { CommandService } from "../../common/commandService.js";
suite("CommandService", function() {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  setup(function() {
    store.add(CommandsRegistry.registerCommand("foo", function() {
    }));
  });
  test("activateOnCommand", () => {
    let lastEvent;
    const service = store.add(new CommandService(new InstantiationService(), new class extends NullExtensionService {
      activateByEvent(activationEvent) {
        lastEvent = activationEvent;
        return super.activateByEvent(activationEvent);
      }
    }(), new NullLogService()));
    return service.executeCommand("foo").then(() => {
      assert.ok(lastEvent, "onCommand:foo");
      return service.executeCommand("unknownCommandId");
    }).then(() => {
      assert.ok(false);
    }, () => {
      assert.ok(lastEvent, "onCommand:unknownCommandId");
    });
  });
  test("fwd activation error", async function() {
    const extensionService = new class extends NullExtensionService {
      activateByEvent(activationEvent) {
        return Promise.reject(new Error("bad_activate"));
      }
    }();
    const service = store.add(new CommandService(new InstantiationService(), extensionService, new NullLogService()));
    await extensionService.whenInstalledExtensionsRegistered();
    return service.executeCommand("foo").then(() => assert.ok(false), (err) => {
      assert.strictEqual(err.message, "bad_activate");
    });
  });
  test("!onReady, but executeCommand", function() {
    let callCounter = 0;
    const reg = CommandsRegistry.registerCommand("bar", () => callCounter += 1);
    const service = store.add(new CommandService(new InstantiationService(), new class extends NullExtensionService {
      whenInstalledExtensionsRegistered() {
        return new Promise((_resolve) => {
        });
      }
    }(), new NullLogService()));
    service.executeCommand("bar");
    assert.strictEqual(callCounter, 1);
    reg.dispose();
  });
  test("issue #34913: !onReady, unknown command", function() {
    let callCounter = 0;
    let resolveFunc;
    const whenInstalledExtensionsRegistered = new Promise((_resolve) => {
      resolveFunc = _resolve;
    });
    const service = store.add(new CommandService(new InstantiationService(), new class extends NullExtensionService {
      whenInstalledExtensionsRegistered() {
        return whenInstalledExtensionsRegistered;
      }
    }(), new NullLogService()));
    const r = service.executeCommand("bar");
    assert.strictEqual(callCounter, 0);
    const reg = CommandsRegistry.registerCommand("bar", () => callCounter += 1);
    resolveFunc(true);
    return r.then(() => {
      reg.dispose();
      assert.strictEqual(callCounter, 1);
    });
  });
  test("Stop waiting for * extensions to activate when trigger is satisfied #62457", function() {
    let callCounter = 0;
    const disposable = new DisposableStore();
    const events = [];
    const service = store.add(new CommandService(new InstantiationService(), new class extends NullExtensionService {
      activateByEvent(event) {
        events.push(event);
        if (event === "*") {
          return new Promise(() => {
          });
        }
        if (event.indexOf("onCommand:") === 0) {
          return new Promise((resolve) => {
            setTimeout(() => {
              const reg = CommandsRegistry.registerCommand(event.substr("onCommand:".length), () => {
                callCounter += 1;
              });
              disposable.add(reg);
              resolve();
            }, 0);
          });
        }
        return Promise.resolve();
      }
    }(), new NullLogService()));
    return service.executeCommand("farboo").then(() => {
      assert.strictEqual(callCounter, 1);
      assert.deepStrictEqual(events.sort(), ["*", "onCommand:farboo"].sort());
    }).finally(() => {
      disposable.dispose();
    });
  });
  test("issue #71471: wait for onCommand activation even if a command is registered", () => {
    const expectedOrder = ["registering command", "resolving activation event", "executing command"];
    const actualOrder = [];
    const disposables = new DisposableStore();
    const service = store.add(new CommandService(new InstantiationService(), new class extends NullExtensionService {
      activateByEvent(event) {
        if (event === "*") {
          return new Promise(() => {
          });
        }
        if (event.indexOf("onCommand:") === 0) {
          return new Promise((resolve) => {
            setTimeout(() => {
              actualOrder.push("registering command");
              const reg = CommandsRegistry.registerCommand(event.substr("onCommand:".length), () => {
                actualOrder.push("executing command");
              });
              disposables.add(reg);
              setTimeout(() => {
                actualOrder.push("resolving activation event");
                resolve();
              }, 10);
            }, 10);
          });
        }
        return Promise.resolve();
      }
    }(), new NullLogService()));
    return service.executeCommand("farboo2").then(() => {
      assert.deepStrictEqual(actualOrder, expectedOrder);
    }).finally(() => {
      disposables.dispose();
    });
  });
  test("issue #142155: execute commands synchronously if possible", async () => {
    const actualOrder = [];
    const disposables = new DisposableStore();
    disposables.add(CommandsRegistry.registerCommand(`bizBaz`, () => {
      actualOrder.push("executing command");
    }));
    const extensionService = new class extends NullExtensionService {
      activationEventIsDone(_activationEvent) {
        return true;
      }
    }();
    const service = store.add(new CommandService(new InstantiationService(), extensionService, new NullLogService()));
    await extensionService.whenInstalledExtensionsRegistered();
    try {
      actualOrder.push(`before call`);
      const promise = service.executeCommand("bizBaz");
      actualOrder.push(`after call`);
      await promise;
      actualOrder.push(`resolved`);
      assert.deepStrictEqual(actualOrder, [
        "before call",
        "executing command",
        "after call",
        "resolved"
      ]);
    } finally {
      disposables.dispose();
    }
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxjb21tYW5kc1xcdGVzdFxcY29tbW9uXFxjb21tYW5kU2VydmljZS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IENvbW1hbmRzUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IE51bGxFeHRlbnNpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9jb21tYW5kU2VydmljZS5qcyc7XG5cbnN1aXRlKCdDb21tYW5kU2VydmljZScsIGZ1bmN0aW9uICgpIHtcblxuXHRjb25zdCBzdG9yZSA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHNldHVwKGZ1bmN0aW9uICgpIHtcblx0XHRzdG9yZS5hZGQoQ29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoJ2ZvbycsIGZ1bmN0aW9uICgpIHsgfSkpO1xuXHR9KTtcblxuXHR0ZXN0KCdhY3RpdmF0ZU9uQ29tbWFuZCcsICgpID0+IHtcblxuXHRcdGxldCBsYXN0RXZlbnQ6IHN0cmluZztcblxuXHRcdGNvbnN0IHNlcnZpY2UgPSBzdG9yZS5hZGQobmV3IENvbW1hbmRTZXJ2aWNlKG5ldyBJbnN0YW50aWF0aW9uU2VydmljZSgpLCBuZXcgY2xhc3MgZXh0ZW5kcyBOdWxsRXh0ZW5zaW9uU2VydmljZSB7XG5cdFx0XHRvdmVycmlkZSBhY3RpdmF0ZUJ5RXZlbnQoYWN0aXZhdGlvbkV2ZW50OiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdFx0bGFzdEV2ZW50ID0gYWN0aXZhdGlvbkV2ZW50O1xuXHRcdFx0XHRyZXR1cm4gc3VwZXIuYWN0aXZhdGVCeUV2ZW50KGFjdGl2YXRpb25FdmVudCk7XG5cdFx0XHR9XG5cdFx0fSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblxuXHRcdHJldHVybiBzZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKCdmb28nKS50aGVuKCgpID0+IHtcblx0XHRcdGFzc2VydC5vayhsYXN0RXZlbnQsICdvbkNvbW1hbmQ6Zm9vJyk7XG5cdFx0XHRyZXR1cm4gc2VydmljZS5leGVjdXRlQ29tbWFuZCgndW5rbm93bkNvbW1hbmRJZCcpO1xuXHRcdH0pLnRoZW4oKCkgPT4ge1xuXHRcdFx0YXNzZXJ0Lm9rKGZhbHNlKTtcblx0XHR9LCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQub2sobGFzdEV2ZW50LCAnb25Db21tYW5kOnVua25vd25Db21tYW5kSWQnKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZndkIGFjdGl2YXRpb24gZXJyb3InLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cblx0XHRjb25zdCBleHRlbnNpb25TZXJ2aWNlID0gbmV3IGNsYXNzIGV4dGVuZHMgTnVsbEV4dGVuc2lvblNlcnZpY2Uge1xuXHRcdFx0b3ZlcnJpZGUgYWN0aXZhdGVCeUV2ZW50KGFjdGl2YXRpb25FdmVudDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRcdHJldHVybiBQcm9taXNlLnJlamVjdChuZXcgRXJyb3IoJ2JhZF9hY3RpdmF0ZScpKTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0Y29uc3Qgc2VydmljZSA9IHN0b3JlLmFkZChuZXcgQ29tbWFuZFNlcnZpY2UobmV3IEluc3RhbnRpYXRpb25TZXJ2aWNlKCksIGV4dGVuc2lvblNlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cblx0XHRhd2FpdCBleHRlbnNpb25TZXJ2aWNlLndoZW5JbnN0YWxsZWRFeHRlbnNpb25zUmVnaXN0ZXJlZCgpO1xuXG5cdFx0cmV0dXJuIHNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoJ2ZvbycpLnRoZW4oKCkgPT4gYXNzZXJ0Lm9rKGZhbHNlKSwgZXJyID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlcnIubWVzc2FnZSwgJ2JhZF9hY3RpdmF0ZScpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCchb25SZWFkeSwgYnV0IGV4ZWN1dGVDb21tYW5kJywgZnVuY3Rpb24gKCkge1xuXG5cdFx0bGV0IGNhbGxDb3VudGVyID0gMDtcblx0XHRjb25zdCByZWcgPSBDb21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZCgnYmFyJywgKCkgPT4gY2FsbENvdW50ZXIgKz0gMSk7XG5cblx0XHRjb25zdCBzZXJ2aWNlID0gc3RvcmUuYWRkKG5ldyBDb21tYW5kU2VydmljZShuZXcgSW5zdGFudGlhdGlvblNlcnZpY2UoKSwgbmV3IGNsYXNzIGV4dGVuZHMgTnVsbEV4dGVuc2lvblNlcnZpY2Uge1xuXHRcdFx0b3ZlcnJpZGUgd2hlbkluc3RhbGxlZEV4dGVuc2lvbnNSZWdpc3RlcmVkKCkge1xuXHRcdFx0XHRyZXR1cm4gbmV3IFByb21pc2U8Ym9vbGVhbj4oX3Jlc29sdmUgPT4geyAvKmlnbm9yZSovIH0pO1xuXHRcdFx0fVxuXHRcdH0sIG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cblx0XHRzZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKCdiYXInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2FsbENvdW50ZXIsIDEpO1xuXHRcdHJlZy5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICMzNDkxMzogIW9uUmVhZHksIHVua25vd24gY29tbWFuZCcsIGZ1bmN0aW9uICgpIHtcblxuXHRcdGxldCBjYWxsQ291bnRlciA9IDA7XG5cdFx0bGV0IHJlc29sdmVGdW5jOiBGdW5jdGlvbjtcblx0XHRjb25zdCB3aGVuSW5zdGFsbGVkRXh0ZW5zaW9uc1JlZ2lzdGVyZWQgPSBuZXcgUHJvbWlzZTxib29sZWFuPihfcmVzb2x2ZSA9PiB7IHJlc29sdmVGdW5jID0gX3Jlc29sdmU7IH0pO1xuXG5cdFx0Y29uc3Qgc2VydmljZSA9IHN0b3JlLmFkZChuZXcgQ29tbWFuZFNlcnZpY2UobmV3IEluc3RhbnRpYXRpb25TZXJ2aWNlKCksIG5ldyBjbGFzcyBleHRlbmRzIE51bGxFeHRlbnNpb25TZXJ2aWNlIHtcblx0XHRcdG92ZXJyaWRlIHdoZW5JbnN0YWxsZWRFeHRlbnNpb25zUmVnaXN0ZXJlZCgpIHtcblx0XHRcdFx0cmV0dXJuIHdoZW5JbnN0YWxsZWRFeHRlbnNpb25zUmVnaXN0ZXJlZDtcblx0XHRcdH1cblx0XHR9LCBuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXG5cdFx0Y29uc3QgciA9IHNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoJ2JhcicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjYWxsQ291bnRlciwgMCk7XG5cblx0XHRjb25zdCByZWcgPSBDb21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZCgnYmFyJywgKCkgPT4gY2FsbENvdW50ZXIgKz0gMSk7XG5cdFx0cmVzb2x2ZUZ1bmMhKHRydWUpO1xuXG5cdFx0cmV0dXJuIHIudGhlbigoKSA9PiB7XG5cdFx0XHRyZWcuZGlzcG9zZSgpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNhbGxDb3VudGVyLCAxKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnU3RvcCB3YWl0aW5nIGZvciAqIGV4dGVuc2lvbnMgdG8gYWN0aXZhdGUgd2hlbiB0cmlnZ2VyIGlzIHNhdGlzZmllZCAjNjI0NTcnLCBmdW5jdGlvbiAoKSB7XG5cblx0XHRsZXQgY2FsbENvdW50ZXIgPSAwO1xuXHRcdGNvbnN0IGRpc3Bvc2FibGUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgZXZlbnRzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBzdG9yZS5hZGQobmV3IENvbW1hbmRTZXJ2aWNlKG5ldyBJbnN0YW50aWF0aW9uU2VydmljZSgpLCBuZXcgY2xhc3MgZXh0ZW5kcyBOdWxsRXh0ZW5zaW9uU2VydmljZSB7XG5cblx0XHRcdG92ZXJyaWRlIGFjdGl2YXRlQnlFdmVudChldmVudDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRcdGV2ZW50cy5wdXNoKGV2ZW50KTtcblx0XHRcdFx0aWYgKGV2ZW50ID09PSAnKicpIHtcblx0XHRcdFx0XHRyZXR1cm4gbmV3IFByb21pc2UoKCkgPT4geyB9KTsgLy9mb3JldmVyIHByb21pc2UuLi5cblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoZXZlbnQuaW5kZXhPZignb25Db21tYW5kOicpID09PSAwKSB7XG5cdFx0XHRcdFx0cmV0dXJuIG5ldyBQcm9taXNlKHJlc29sdmUgPT4ge1xuXHRcdFx0XHRcdFx0c2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IHJlZyA9IENvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKGV2ZW50LnN1YnN0cignb25Db21tYW5kOicubGVuZ3RoKSwgKCkgPT4ge1xuXHRcdFx0XHRcdFx0XHRcdGNhbGxDb3VudGVyICs9IDE7XG5cdFx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdFx0XHRkaXNwb3NhYmxlLmFkZChyZWcpO1xuXHRcdFx0XHRcdFx0XHRyZXNvbHZlKCk7XG5cdFx0XHRcdFx0XHR9LCAwKTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0XHR9XG5cblx0XHR9LCBuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXG5cdFx0cmV0dXJuIHNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoJ2ZhcmJvbycpLnRoZW4oKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNhbGxDb3VudGVyLCAxKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZXZlbnRzLnNvcnQoKSwgWycqJywgJ29uQ29tbWFuZDpmYXJib28nXS5zb3J0KCkpO1xuXHRcdH0pLmZpbmFsbHkoKCkgPT4ge1xuXHRcdFx0ZGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICM3MTQ3MTogd2FpdCBmb3Igb25Db21tYW5kIGFjdGl2YXRpb24gZXZlbiBpZiBhIGNvbW1hbmQgaXMgcmVnaXN0ZXJlZCcsICgpID0+IHtcblx0XHRjb25zdCBleHBlY3RlZE9yZGVyOiBzdHJpbmdbXSA9IFsncmVnaXN0ZXJpbmcgY29tbWFuZCcsICdyZXNvbHZpbmcgYWN0aXZhdGlvbiBldmVudCcsICdleGVjdXRpbmcgY29tbWFuZCddO1xuXHRcdGNvbnN0IGFjdHVhbE9yZGVyOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBzdG9yZS5hZGQobmV3IENvbW1hbmRTZXJ2aWNlKG5ldyBJbnN0YW50aWF0aW9uU2VydmljZSgpLCBuZXcgY2xhc3MgZXh0ZW5kcyBOdWxsRXh0ZW5zaW9uU2VydmljZSB7XG5cblx0XHRcdG92ZXJyaWRlIGFjdGl2YXRlQnlFdmVudChldmVudDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRcdGlmIChldmVudCA9PT0gJyonKSB7XG5cdFx0XHRcdFx0cmV0dXJuIG5ldyBQcm9taXNlKCgpID0+IHsgfSk7IC8vZm9yZXZlciBwcm9taXNlLi4uXG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGV2ZW50LmluZGV4T2YoJ29uQ29tbWFuZDonKSA9PT0gMCkge1xuXHRcdFx0XHRcdHJldHVybiBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHtcblx0XHRcdFx0XHRcdHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0XHRcdFx0XHQvLyBSZWdpc3RlciB0aGUgY29tbWFuZCBhZnRlciBzb21lIHRpbWVcblx0XHRcdFx0XHRcdFx0YWN0dWFsT3JkZXIucHVzaCgncmVnaXN0ZXJpbmcgY29tbWFuZCcpO1xuXHRcdFx0XHRcdFx0XHRjb25zdCByZWcgPSBDb21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZChldmVudC5zdWJzdHIoJ29uQ29tbWFuZDonLmxlbmd0aCksICgpID0+IHtcblx0XHRcdFx0XHRcdFx0XHRhY3R1YWxPcmRlci5wdXNoKCdleGVjdXRpbmcgY29tbWFuZCcpO1xuXHRcdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHJlZyk7XG5cblx0XHRcdFx0XHRcdFx0c2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdFx0Ly8gUmVzb2x2ZSB0aGUgYWN0aXZhdGlvbiBldmVudCBhZnRlciBzb21lIG1vcmUgdGltZVxuXHRcdFx0XHRcdFx0XHRcdGFjdHVhbE9yZGVyLnB1c2goJ3Jlc29sdmluZyBhY3RpdmF0aW9uIGV2ZW50Jyk7XG5cdFx0XHRcdFx0XHRcdFx0cmVzb2x2ZSgpO1xuXHRcdFx0XHRcdFx0XHR9LCAxMCk7XG5cdFx0XHRcdFx0XHR9LCAxMCk7XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuXHRcdFx0fVxuXG5cdFx0fSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblxuXHRcdHJldHVybiBzZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKCdmYXJib28yJykudGhlbigoKSA9PiB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbE9yZGVyLCBleHBlY3RlZE9yZGVyKTtcblx0XHR9KS5maW5hbGx5KCgpID0+IHtcblx0XHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzE0MjE1NTogZXhlY3V0ZSBjb21tYW5kcyBzeW5jaHJvbm91c2x5IGlmIHBvc3NpYmxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGFjdHVhbE9yZGVyOiBzdHJpbmdbXSA9IFtdO1xuXG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKENvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKGBiaXpCYXpgLCAoKSA9PiB7XG5cdFx0XHRhY3R1YWxPcmRlci5wdXNoKCdleGVjdXRpbmcgY29tbWFuZCcpO1xuXHRcdH0pKTtcblx0XHRjb25zdCBleHRlbnNpb25TZXJ2aWNlID0gbmV3IGNsYXNzIGV4dGVuZHMgTnVsbEV4dGVuc2lvblNlcnZpY2Uge1xuXHRcdFx0b3ZlcnJpZGUgYWN0aXZhdGlvbkV2ZW50SXNEb25lKF9hY3RpdmF0aW9uRXZlbnQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHR9O1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBzdG9yZS5hZGQobmV3IENvbW1hbmRTZXJ2aWNlKG5ldyBJbnN0YW50aWF0aW9uU2VydmljZSgpLCBleHRlbnNpb25TZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXG5cdFx0YXdhaXQgZXh0ZW5zaW9uU2VydmljZS53aGVuSW5zdGFsbGVkRXh0ZW5zaW9uc1JlZ2lzdGVyZWQoKTtcblxuXHRcdHRyeSB7XG5cdFx0XHRhY3R1YWxPcmRlci5wdXNoKGBiZWZvcmUgY2FsbGApO1xuXHRcdFx0Y29uc3QgcHJvbWlzZSA9IHNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoJ2JpekJheicpO1xuXHRcdFx0YWN0dWFsT3JkZXIucHVzaChgYWZ0ZXIgY2FsbGApO1xuXHRcdFx0YXdhaXQgcHJvbWlzZTtcblx0XHRcdGFjdHVhbE9yZGVyLnB1c2goYHJlc29sdmVkYCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbE9yZGVyLCBbXG5cdFx0XHRcdCdiZWZvcmUgY2FsbCcsXG5cdFx0XHRcdCdleGVjdXRpbmcgY29tbWFuZCcsXG5cdFx0XHRcdCdhZnRlciBjYWxsJyxcblx0XHRcdFx0J3Jlc29sdmVkJ1xuXHRcdFx0XSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFJQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxzQkFBc0I7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
