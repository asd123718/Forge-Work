import { deepStrictEqual, notEqual, strictEqual, throws } from "assert";
import { importAMDNodeModule } from "../../../../../../amdX.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { TestConfigurationService } from "../../../../../../platform/configuration/test/common/testConfigurationService.js";
import { IHoverService } from "../../../../../../platform/hover/browser/hover.js";
import { TerminalCapability } from "../../../../../../platform/terminal/common/capabilities/capabilities.js";
import { CommandDetectionCapability } from "../../../../../../platform/terminal/common/capabilities/commandDetectionCapability.js";
import { TerminalCapabilityStore } from "../../../../../../platform/terminal/common/capabilities/terminalCapabilityStore.js";
import { DecorationAddon } from "../../../browser/xterm/decorationAddon.js";
import { workbenchInstantiationService } from "../../../../../test/browser/workbenchTestServices.js";
import { TestXtermLogger } from "../../../../../../platform/terminal/test/common/terminalTestHelpers.js";
suite("DecorationAddon", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  let decorationAddon;
  let xterm;
  let hoverDisposed;
  let removedEventListeners;
  setup(async () => {
    hoverDisposed = false;
    removedEventListeners = [];
    const TerminalCtor = (await importAMDNodeModule("@xterm/xterm", "lib/xterm.js")).Terminal;
    class TestTerminal extends TerminalCtor {
      registerDecoration(decorationOptions) {
        if (decorationOptions.marker.isDisposed) {
          return void 0;
        }
        const element = document.createElement("div");
        const removeEventListener = element.removeEventListener.bind(element);
        element.removeEventListener = ((...args) => {
          removedEventListeners.push(args[0]);
          removeEventListener(...args);
        });
        const disposeListeners = /* @__PURE__ */ new Set();
        let isDisposed = false;
        return {
          marker: decorationOptions.marker,
          element,
          onDispose: (listener) => {
            disposeListeners.add(listener);
            return { dispose: () => disposeListeners.delete(listener) };
          },
          get isDisposed() {
            return isDisposed;
          },
          dispose: () => {
            isDisposed = true;
            for (const listener of disposeListeners) {
              listener();
            }
            disposeListeners.clear();
          },
          onRender: (listener) => {
            listener(element);
            return { dispose: () => {
            } };
          }
        };
      }
    }
    const instantiationService = workbenchInstantiationService({
      configurationService: () => new TestConfigurationService({
        files: {},
        workbench: {
          hover: { delay: 5 }
        },
        terminal: {
          integrated: {
            shellIntegration: {
              decorationsEnabled: "both"
            }
          }
        }
      })
    }, store);
    instantiationService.stub(IHoverService, {
      setupDelayedHover: () => ({ dispose: () => hoverDisposed = true })
    });
    xterm = store.add(new TestTerminal({
      allowProposedApi: true,
      cols: 80,
      rows: 30,
      logger: TestXtermLogger
    }));
    const capabilities = store.add(new TerminalCapabilityStore());
    capabilities.add(TerminalCapability.CommandDetection, store.add(instantiationService.createInstance(CommandDetectionCapability, xterm)));
    decorationAddon = store.add(instantiationService.createInstance(DecorationAddon, void 0, capabilities));
    xterm.loadAddon(decorationAddon);
  });
  suite("registerDecoration", () => {
    test("should throw when command has no marker", async () => {
      throws(() => decorationAddon.registerCommandDecoration({ command: "cd src", timestamp: Date.now(), hasOutput: () => false }));
    });
    test("should return undefined when marker has been disposed of", async () => {
      const marker = xterm.registerMarker(1);
      marker?.dispose();
      strictEqual(decorationAddon.registerCommandDecoration({ command: "cd src", marker, timestamp: Date.now(), hasOutput: () => false }), void 0);
    });
    test("should return decoration when marker has not been disposed of", async () => {
      const marker = xterm.registerMarker(2);
      notEqual(decorationAddon.registerCommandDecoration({ command: "cd src", marker, timestamp: Date.now(), hasOutput: () => false }), void 0);
    });
    test("should return decoration with mark properties", async () => {
      const marker = xterm.registerMarker(2);
      notEqual(decorationAddon.registerCommandDecoration(void 0, void 0, { marker }), void 0);
    });
    test("should dispose decoration resources when the decoration is disposed", () => {
      const marker = xterm.registerMarker(2);
      const decoration = decorationAddon.registerCommandDecoration({ command: "cd src", marker, exitCode: 0, timestamp: Date.now(), hasOutput: () => false });
      const decorations = decorationAddon._decorations;
      decoration.dispose();
      strictEqual(hoverDisposed, true);
      deepStrictEqual(removedEventListeners.sort(), ["click", "contextmenu", "mousedown"]);
      strictEqual(decorations.has(marker.id), false);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsXFx0ZXN0XFxicm93c2VyXFx4dGVybVxcZGVjb3JhdGlvbkFkZG9uLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgdHlwZSB7IElEZWNvcmF0aW9uLCBJRGVjb3JhdGlvbk9wdGlvbnMsIFRlcm1pbmFsIGFzIFJhd1h0ZXJtVGVybWluYWwgfSBmcm9tICdAeHRlcm0veHRlcm0nO1xuaW1wb3J0IHsgZGVlcFN0cmljdEVxdWFsLCBub3RFcXVhbCwgc3RyaWN0RXF1YWwsIHRocm93cyB9IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBpbXBvcnRBTUROb2RlTW9kdWxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYW1kWC5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vdGVzdC9jb21tb24vdGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElIb3ZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9ob3Zlci9icm93c2VyL2hvdmVyLmpzJztcbmltcG9ydCB7IElUZXJtaW5hbENvbW1hbmQsIFRlcm1pbmFsQ2FwYWJpbGl0eSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Rlcm1pbmFsL2NvbW1vbi9jYXBhYmlsaXRpZXMvY2FwYWJpbGl0aWVzLmpzJztcbmltcG9ydCB7IENvbW1hbmREZXRlY3Rpb25DYXBhYmlsaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvY29tbW9uL2NhcGFiaWxpdGllcy9jb21tYW5kRGV0ZWN0aW9uQ2FwYWJpbGl0eS5qcyc7XG5pbXBvcnQgeyBUZXJtaW5hbENhcGFiaWxpdHlTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Rlcm1pbmFsL2NvbW1vbi9jYXBhYmlsaXRpZXMvdGVybWluYWxDYXBhYmlsaXR5U3RvcmUuanMnO1xuaW1wb3J0IHsgRGVjb3JhdGlvbkFkZG9uIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci94dGVybS9kZWNvcmF0aW9uQWRkb24uanMnO1xuaW1wb3J0IHsgd29ya2JlbmNoSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi90ZXN0L2Jyb3dzZXIvd29ya2JlbmNoVGVzdFNlcnZpY2VzLmpzJztcbmltcG9ydCB7IFRlc3RYdGVybUxvZ2dlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Rlcm1pbmFsL3Rlc3QvY29tbW9uL3Rlcm1pbmFsVGVzdEhlbHBlcnMuanMnO1xuXG5zdWl0ZSgnRGVjb3JhdGlvbkFkZG9uJywgKCkgPT4ge1xuXHRjb25zdCBzdG9yZSA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGxldCBkZWNvcmF0aW9uQWRkb246IERlY29yYXRpb25BZGRvbjtcblx0bGV0IHh0ZXJtOiBSYXdYdGVybVRlcm1pbmFsO1xuXHRsZXQgaG92ZXJEaXNwb3NlZDogYm9vbGVhbjtcblx0bGV0IHJlbW92ZWRFdmVudExpc3RlbmVyczogc3RyaW5nW107XG5cblx0c2V0dXAoYXN5bmMgKCkgPT4ge1xuXHRcdGhvdmVyRGlzcG9zZWQgPSBmYWxzZTtcblx0XHRyZW1vdmVkRXZlbnRMaXN0ZW5lcnMgPSBbXTtcblx0XHRjb25zdCBUZXJtaW5hbEN0b3IgPSAoYXdhaXQgaW1wb3J0QU1ETm9kZU1vZHVsZTx0eXBlb2YgaW1wb3J0KCdAeHRlcm0veHRlcm0nKT4oJ0B4dGVybS94dGVybScsICdsaWIveHRlcm0uanMnKSkuVGVybWluYWw7XG5cdFx0Y2xhc3MgVGVzdFRlcm1pbmFsIGV4dGVuZHMgVGVybWluYWxDdG9yIHtcblx0XHRcdG92ZXJyaWRlIHJlZ2lzdGVyRGVjb3JhdGlvbihkZWNvcmF0aW9uT3B0aW9uczogSURlY29yYXRpb25PcHRpb25zKTogSURlY29yYXRpb24gfCB1bmRlZmluZWQge1xuXHRcdFx0XHRpZiAoZGVjb3JhdGlvbk9wdGlvbnMubWFya2VyLmlzRGlzcG9zZWQpIHtcblx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGVsZW1lbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRcdFx0Y29uc3QgcmVtb3ZlRXZlbnRMaXN0ZW5lciA9IGVsZW1lbnQucmVtb3ZlRXZlbnRMaXN0ZW5lci5iaW5kKGVsZW1lbnQpO1xuXHRcdFx0XHRlbGVtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIgPSAoKC4uLmFyZ3M6IFBhcmFtZXRlcnM8dHlwZW9mIGVsZW1lbnQucmVtb3ZlRXZlbnRMaXN0ZW5lcj4pID0+IHtcblx0XHRcdFx0XHRyZW1vdmVkRXZlbnRMaXN0ZW5lcnMucHVzaChhcmdzWzBdKTtcblx0XHRcdFx0XHRyZW1vdmVFdmVudExpc3RlbmVyKC4uLmFyZ3MpO1xuXHRcdFx0XHR9KSBhcyB0eXBlb2YgZWxlbWVudC5yZW1vdmVFdmVudExpc3RlbmVyO1xuXHRcdFx0XHRjb25zdCBkaXNwb3NlTGlzdGVuZXJzID0gbmV3IFNldDwoKSA9PiB2b2lkPigpO1xuXHRcdFx0XHRsZXQgaXNEaXNwb3NlZCA9IGZhbHNlO1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdG1hcmtlcjogZGVjb3JhdGlvbk9wdGlvbnMubWFya2VyLFxuXHRcdFx0XHRcdGVsZW1lbnQsXG5cdFx0XHRcdFx0b25EaXNwb3NlOiAobGlzdGVuZXI6ICgpID0+IHZvaWQpID0+IHtcblx0XHRcdFx0XHRcdGRpc3Bvc2VMaXN0ZW5lcnMuYWRkKGxpc3RlbmVyKTtcblx0XHRcdFx0XHRcdHJldHVybiB7IGRpc3Bvc2U6ICgpID0+IGRpc3Bvc2VMaXN0ZW5lcnMuZGVsZXRlKGxpc3RlbmVyKSB9O1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0Z2V0IGlzRGlzcG9zZWQoKSB7IHJldHVybiBpc0Rpc3Bvc2VkOyB9LFxuXHRcdFx0XHRcdGRpc3Bvc2U6ICgpID0+IHtcblx0XHRcdFx0XHRcdGlzRGlzcG9zZWQgPSB0cnVlO1xuXHRcdFx0XHRcdFx0Zm9yIChjb25zdCBsaXN0ZW5lciBvZiBkaXNwb3NlTGlzdGVuZXJzKSB7XG5cdFx0XHRcdFx0XHRcdGxpc3RlbmVyKCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRkaXNwb3NlTGlzdGVuZXJzLmNsZWFyKCk7XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRvblJlbmRlcjogKGxpc3RlbmVyOiAoZWxlbWVudDogSFRNTEVsZW1lbnQpID0+IHZvaWQpID0+IHtcblx0XHRcdFx0XHRcdGxpc3RlbmVyKGVsZW1lbnQpO1xuXHRcdFx0XHRcdFx0cmV0dXJuIHsgZGlzcG9zZTogKCkgPT4geyB9IH07XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGFzIHVua25vd24gYXMgSURlY29yYXRpb247XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSh7XG5cdFx0XHRjb25maWd1cmF0aW9uU2VydmljZTogKCkgPT4gbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSh7XG5cdFx0XHRcdGZpbGVzOiB7fSxcblx0XHRcdFx0d29ya2JlbmNoOiB7XG5cdFx0XHRcdFx0aG92ZXI6IHsgZGVsYXk6IDUgfSxcblx0XHRcdFx0fSxcblx0XHRcdFx0dGVybWluYWw6IHtcblx0XHRcdFx0XHRpbnRlZ3JhdGVkOiB7XG5cdFx0XHRcdFx0XHRzaGVsbEludGVncmF0aW9uOiB7XG5cdFx0XHRcdFx0XHRcdGRlY29yYXRpb25zRW5hYmxlZDogJ2JvdGgnXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9KVxuXHRcdH0sIHN0b3JlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElIb3ZlclNlcnZpY2UsIHtcblx0XHRcdHNldHVwRGVsYXllZEhvdmVyOiAoKSA9PiAoeyBkaXNwb3NlOiAoKSA9PiBob3ZlckRpc3Bvc2VkID0gdHJ1ZSB9KVxuXHRcdH0gYXMgdW5rbm93biBhcyBJSG92ZXJTZXJ2aWNlKTtcblx0XHR4dGVybSA9IHN0b3JlLmFkZChuZXcgVGVzdFRlcm1pbmFsKHtcblx0XHRcdGFsbG93UHJvcG9zZWRBcGk6IHRydWUsXG5cdFx0XHRjb2xzOiA4MCxcblx0XHRcdHJvd3M6IDMwLFxuXHRcdFx0bG9nZ2VyOiBUZXN0WHRlcm1Mb2dnZXJcblx0XHR9KSk7XG5cdFx0Y29uc3QgY2FwYWJpbGl0aWVzID0gc3RvcmUuYWRkKG5ldyBUZXJtaW5hbENhcGFiaWxpdHlTdG9yZSgpKTtcblx0XHRjYXBhYmlsaXRpZXMuYWRkKFRlcm1pbmFsQ2FwYWJpbGl0eS5Db21tYW5kRGV0ZWN0aW9uLCBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ29tbWFuZERldGVjdGlvbkNhcGFiaWxpdHksIHh0ZXJtKSkpO1xuXHRcdGRlY29yYXRpb25BZGRvbiA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShEZWNvcmF0aW9uQWRkb24sIHVuZGVmaW5lZCwgY2FwYWJpbGl0aWVzKSk7XG5cdFx0eHRlcm0ubG9hZEFkZG9uKGRlY29yYXRpb25BZGRvbik7XG5cdH0pO1xuXG5cdHN1aXRlKCdyZWdpc3RlckRlY29yYXRpb24nLCAoKSA9PiB7XG5cdFx0dGVzdCgnc2hvdWxkIHRocm93IHdoZW4gY29tbWFuZCBoYXMgbm8gbWFya2VyJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0dGhyb3dzKCgpID0+IGRlY29yYXRpb25BZGRvbi5yZWdpc3RlckNvbW1hbmREZWNvcmF0aW9uKHsgY29tbWFuZDogJ2NkIHNyYycsIHRpbWVzdGFtcDogRGF0ZS5ub3coKSwgaGFzT3V0cHV0OiAoKSA9PiBmYWxzZSB9IGFzIElUZXJtaW5hbENvbW1hbmQpKTtcblx0XHR9KTtcblx0XHR0ZXN0KCdzaG91bGQgcmV0dXJuIHVuZGVmaW5lZCB3aGVuIG1hcmtlciBoYXMgYmVlbiBkaXNwb3NlZCBvZicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IG1hcmtlciA9IHh0ZXJtLnJlZ2lzdGVyTWFya2VyKDEpO1xuXHRcdFx0bWFya2VyPy5kaXNwb3NlKCk7XG5cdFx0XHRzdHJpY3RFcXVhbChkZWNvcmF0aW9uQWRkb24ucmVnaXN0ZXJDb21tYW5kRGVjb3JhdGlvbih7IGNvbW1hbmQ6ICdjZCBzcmMnLCBtYXJrZXIsIHRpbWVzdGFtcDogRGF0ZS5ub3coKSwgaGFzT3V0cHV0OiAoKSA9PiBmYWxzZSB9IGFzIElUZXJtaW5hbENvbW1hbmQpLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXHRcdHRlc3QoJ3Nob3VsZCByZXR1cm4gZGVjb3JhdGlvbiB3aGVuIG1hcmtlciBoYXMgbm90IGJlZW4gZGlzcG9zZWQgb2YnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBtYXJrZXIgPSB4dGVybS5yZWdpc3Rlck1hcmtlcigyKTtcblx0XHRcdG5vdEVxdWFsKGRlY29yYXRpb25BZGRvbi5yZWdpc3RlckNvbW1hbmREZWNvcmF0aW9uKHsgY29tbWFuZDogJ2NkIHNyYycsIG1hcmtlciwgdGltZXN0YW1wOiBEYXRlLm5vdygpLCBoYXNPdXRwdXQ6ICgpID0+IGZhbHNlIH0gYXMgSVRlcm1pbmFsQ29tbWFuZCksIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cdFx0dGVzdCgnc2hvdWxkIHJldHVybiBkZWNvcmF0aW9uIHdpdGggbWFyayBwcm9wZXJ0aWVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbWFya2VyID0geHRlcm0ucmVnaXN0ZXJNYXJrZXIoMik7XG5cdFx0XHRub3RFcXVhbChkZWNvcmF0aW9uQWRkb24ucmVnaXN0ZXJDb21tYW5kRGVjb3JhdGlvbih1bmRlZmluZWQsIHVuZGVmaW5lZCwgeyBtYXJrZXIgfSksIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cdFx0dGVzdCgnc2hvdWxkIGRpc3Bvc2UgZGVjb3JhdGlvbiByZXNvdXJjZXMgd2hlbiB0aGUgZGVjb3JhdGlvbiBpcyBkaXNwb3NlZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IG1hcmtlciA9IHh0ZXJtLnJlZ2lzdGVyTWFya2VyKDIpITtcblx0XHRcdGNvbnN0IGRlY29yYXRpb24gPSBkZWNvcmF0aW9uQWRkb24ucmVnaXN0ZXJDb21tYW5kRGVjb3JhdGlvbih7IGNvbW1hbmQ6ICdjZCBzcmMnLCBtYXJrZXIsIGV4aXRDb2RlOiAwLCB0aW1lc3RhbXA6IERhdGUubm93KCksIGhhc091dHB1dDogKCkgPT4gZmFsc2UgfSBhcyBJVGVybWluYWxDb21tYW5kKSE7XG5cdFx0XHRjb25zdCBkZWNvcmF0aW9ucyA9IChkZWNvcmF0aW9uQWRkb24gYXMgdW5rbm93biBhcyB7IF9kZWNvcmF0aW9uczogTWFwPG51bWJlciwgdW5rbm93bj4gfSkuX2RlY29yYXRpb25zO1xuXG5cdFx0XHRkZWNvcmF0aW9uLmRpc3Bvc2UoKTtcblxuXHRcdFx0c3RyaWN0RXF1YWwoaG92ZXJEaXNwb3NlZCwgdHJ1ZSk7XG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwocmVtb3ZlZEV2ZW50TGlzdGVuZXJzLnNvcnQoKSwgWydjbGljaycsICdjb250ZXh0bWVudScsICdtb3VzZWRvd24nXSk7XG5cdFx0XHRzdHJpY3RFcXVhbChkZWNvcmF0aW9ucy5oYXMobWFya2VyLmlkKSwgZmFsc2UpO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBTUEsU0FBUyxpQkFBaUIsVUFBVSxhQUFhLGNBQWM7QUFDL0QsU0FBUywyQkFBMkI7QUFDcEMsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBMkIsMEJBQTBCO0FBQ3JELFNBQVMsa0NBQWtDO0FBQzNDLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMscUNBQXFDO0FBQzlDLFNBQVMsdUJBQXVCO0FBRWhDLE1BQU0sbUJBQW1CLE1BQU07QUFDOUIsUUFBTSxRQUFRLHdDQUF3QztBQUV0RCxNQUFJO0FBQ0osTUFBSTtBQUNKLE1BQUk7QUFDSixNQUFJO0FBRUosUUFBTSxZQUFZO0FBQ2pCLG9CQUFnQjtBQUNoQiw0QkFBd0IsQ0FBQztBQUN6QixVQUFNLGdCQUFnQixNQUFNLG9CQUFtRCxnQkFBZ0IsY0FBYyxHQUFHO0FBQUEsSUFDaEgsTUFBTSxxQkFBcUIsYUFBYTtBQUFBLE1BQzlCLG1CQUFtQixtQkFBZ0U7QUFDM0YsWUFBSSxrQkFBa0IsT0FBTyxZQUFZO0FBQ3hDLGlCQUFPO0FBQUEsUUFDUjtBQUNBLGNBQU0sVUFBVSxTQUFTLGNBQWMsS0FBSztBQUM1QyxjQUFNLHNCQUFzQixRQUFRLG9CQUFvQixLQUFLLE9BQU87QUFDcEUsZ0JBQVEsdUJBQXVCLElBQUksU0FB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
