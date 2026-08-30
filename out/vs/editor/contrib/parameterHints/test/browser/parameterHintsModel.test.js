import assert from "assert";
import { promiseWithResolvers } from "../../../../../base/common/async.js";
import { DisposableStore } from "../../../../../base/common/lifecycle.js";
import { URI } from "../../../../../base/common/uri.js";
import { runWithFakedTimers } from "../../../../../base/test/common/timeTravelScheduler.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { Handler } from "../../../../common/editorCommon.js";
import { LanguageFeatureRegistry } from "../../../../common/languageFeatureRegistry.js";
import * as languages from "../../../../common/languages.js";
import { ParameterHintsModel } from "../../browser/parameterHintsModel.js";
import { createTestCodeEditor } from "../../../../test/browser/testCodeEditor.js";
import { createTextModel } from "../../../../test/common/testTextModel.js";
import { ServiceCollection } from "../../../../../platform/instantiation/common/serviceCollection.js";
import { InMemoryStorageService, IStorageService } from "../../../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../../../platform/telemetry/common/telemetry.js";
import { NullTelemetryService } from "../../../../../platform/telemetry/common/telemetryUtils.js";
const mockFile = URI.parse("test:somefile.ttt");
const mockFileSelector = { scheme: "test" };
const emptySigHelp = {
  signatures: [{
    label: "none",
    parameters: []
  }],
  activeParameter: 0,
  activeSignature: 0
};
const emptySigHelpResult = {
  value: emptySigHelp,
  dispose: () => {
  }
};
suite("ParameterHintsModel", () => {
  const disposables = new DisposableStore();
  let registry;
  setup(() => {
    disposables.clear();
    registry = new LanguageFeatureRegistry();
  });
  teardown(() => {
    disposables.clear();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  function createMockEditor(fileContents) {
    const textModel = disposables.add(createTextModel(fileContents, void 0, void 0, mockFile));
    const editor = disposables.add(createTestCodeEditor(textModel, {
      serviceCollection: new ServiceCollection(
        [ITelemetryService, NullTelemetryService],
        [IStorageService, disposables.add(new InMemoryStorageService())]
      )
    }));
    return editor;
  }
  function getNextHint(model) {
    return new Promise((resolve) => {
      const sub = disposables.add(model.onChangedHints((e) => {
        sub.dispose();
        return resolve(e ? { value: e, dispose: () => {
        } } : void 0);
      }));
    });
  }
  test("Provider should get trigger character on type", async () => {
    const { promise: donePromise, resolve: done } = promiseWithResolvers();
    const triggerChar = "(";
    const editor = createMockEditor("");
    disposables.add(new ParameterHintsModel(editor, registry));
    disposables.add(registry.register(mockFileSelector, new class {
      constructor() {
        this.signatureHelpTriggerCharacters = [triggerChar];
        this.signatureHelpRetriggerCharacters = [];
      }
      provideSignatureHelp(_model, _position, _token, context) {
        assert.strictEqual(context.triggerKind, languages.SignatureHelpTriggerKind.TriggerCharacter);
        assert.strictEqual(context.triggerCharacter, triggerChar);
        done();
        return void 0;
      }
    }()));
    await runWithFakedTimers({ useFakeTimers: true }, async () => {
      editor.trigger("keyboard", Handler.Type, { text: triggerChar });
      await donePromise;
    });
  });
  test("Provider should be retriggered if already active", async () => {
    const { promise: donePromise, resolve: done } = promiseWithResolvers();
    const triggerChar = "(";
    const editor = createMockEditor("");
    disposables.add(new ParameterHintsModel(editor, registry));
    let invokeCount = 0;
    disposables.add(registry.register(mockFileSelector, new class {
      constructor() {
        this.signatureHelpTriggerCharacters = [triggerChar];
        this.signatureHelpRetriggerCharacters = [];
      }
      provideSignatureHelp(_model, _position, _token, context) {
        ++invokeCount;
        try {
          if (invokeCount === 1) {
            assert.strictEqual(context.triggerKind, languages.SignatureHelpTriggerKind.TriggerCharacter);
            assert.strictEqual(context.triggerCharacter, triggerChar);
            assert.strictEqual(context.isRetrigger, false);
            assert.strictEqual(context.activeSignatureHelp, void 0);
            setTimeout(() => editor.trigger("keyboard", Handler.Type, { text: triggerChar }), 0);
          } else {
            assert.strictEqual(invokeCount, 2);
            assert.strictEqual(context.triggerKind, languages.SignatureHelpTriggerKind.TriggerCharacter);
            assert.strictEqual(context.isRetrigger, true);
            assert.strictEqual(context.triggerCharacter, triggerChar);
            assert.strictEqual(context.activeSignatureHelp, emptySigHelp);
            done();
          }
          return emptySigHelpResult;
        } catch (err) {
          console.error(err);
          throw err;
        }
      }
    }()));
    await runWithFakedTimers({ useFakeTimers: true }, async () => {
      editor.trigger("keyboard", Handler.Type, { text: triggerChar });
      await donePromise;
    });
  });
  test("Provider should not be retriggered if previous help is canceled first", async () => {
    const { promise: donePromise, resolve: done } = promiseWithResolvers();
    const triggerChar = "(";
    const editor = createMockEditor("");
    const hintModel = disposables.add(new ParameterHintsModel(editor, registry));
    let invokeCount = 0;
    disposables.add(registry.register(mockFileSelector, new class {
      constructor() {
        this.signatureHelpTriggerCharacters = [triggerChar];
        this.signatureHelpRetriggerCharacters = [];
      }
      provideSignatureHelp(_model, _position, _token, context) {
        try {
          ++invokeCount;
          if (invokeCount === 1) {
            assert.strictEqual(context.triggerKind, languages.SignatureHelpTriggerKind.TriggerCharacter);
            assert.strictEqual(context.triggerCharacter, triggerChar);
            assert.strictEqual(context.isRetrigger, false);
            assert.strictEqual(context.activeSignatureHelp, void 0);
            hintModel.cancel();
            editor.trigger("keyboard", Handler.Type, { text: triggerChar });
          } else {
            assert.strictEqual(invokeCount, 2);
            assert.strictEqual(context.triggerKind, languages.SignatureHelpTriggerKind.TriggerCharacter);
            assert.strictEqual(context.triggerCharacter, triggerChar);
            assert.strictEqual(context.isRetrigger, true);
            assert.strictEqual(context.activeSignatureHelp, void 0);
            done();
          }
          return emptySigHelpResult;
        } catch (err) {
          console.error(err);
          throw err;
        }
      }
    }()));
    await runWithFakedTimers({ useFakeTimers: true }, () => {
      editor.trigger("keyboard", Handler.Type, { text: triggerChar });
      return donePromise;
    });
  });
  test("Provider should get last trigger character when triggered multiple times and only be invoked once", async () => {
    const { promise: donePromise, resolve: done } = promiseWithResolvers();
    const editor = createMockEditor("");
    disposables.add(new ParameterHintsModel(editor, registry, 5));
    let invokeCount = 0;
    disposables.add(registry.register(mockFileSelector, new class {
      constructor() {
        this.signatureHelpTriggerCharacters = ["a", "b", "c"];
        this.signatureHelpRetriggerCharacters = [];
      }
      provideSignatureHelp(_model, _position, _token, context) {
        try {
          ++invokeCount;
          assert.strictEqual(context.triggerKind, languages.SignatureHelpTriggerKind.TriggerCharacter);
          assert.strictEqual(context.isRetrigger, false);
          assert.strictEqual(context.triggerCharacter, "c");
          setTimeout(() => {
            assert.strictEqual(invokeCount, 1);
            done();
          }, 50);
          return void 0;
        } catch (err) {
          console.error(err);
          throw err;
        }
      }
    }()));
    await runWithFakedTimers({ useFakeTimers: true }, async () => {
      editor.trigger("keyboard", Handler.Type, { text: "a" });
      editor.trigger("keyboard", Handler.Type, { text: "b" });
      editor.trigger("keyboard", Handler.Type, { text: "c" });
      await donePromise;
    });
  });
  test("Provider should be retriggered if already active", async () => {
    const { promise: donePromise, resolve: done } = promiseWithResolvers();
    const editor = createMockEditor("");
    disposables.add(new ParameterHintsModel(editor, registry, 5));
    let invokeCount = 0;
    disposables.add(registry.register(mockFileSelector, new class {
      constructor() {
        this.signatureHelpTriggerCharacters = ["a", "b"];
        this.signatureHelpRetriggerCharacters = [];
      }
      provideSignatureHelp(_model, _position, _token, context) {
        try {
          ++invokeCount;
          if (invokeCount === 1) {
            assert.strictEqual(context.triggerKind, languages.SignatureHelpTriggerKind.TriggerCharacter);
            assert.strictEqual(context.triggerCharacter, "a");
            setTimeout(() => editor.trigger("keyboard", Handler.Type, { text: "b" }), 50);
          } else if (invokeCount === 2) {
            assert.strictEqual(context.triggerKind, languages.SignatureHelpTriggerKind.TriggerCharacter);
            assert.ok(context.isRetrigger);
            assert.strictEqual(context.triggerCharacter, "b");
            done();
          } else {
            assert.fail("Unexpected invoke");
          }
          return emptySigHelpResult;
        } catch (err) {
          console.error(err);
          throw err;
        }
      }
    }()));
    await runWithFakedTimers({ useFakeTimers: true }, () => {
      editor.trigger("keyboard", Handler.Type, { text: "a" });
      return donePromise;
    });
  });
  test("Should cancel existing request when new request comes in", async () => {
    const editor = createMockEditor("abc def");
    const hintsModel = disposables.add(new ParameterHintsModel(editor, registry));
    let didRequestCancellationOf = -1;
    let invokeCount = 0;
    const longRunningProvider = new class {
      constructor() {
        this.signatureHelpTriggerCharacters = [];
        this.signatureHelpRetriggerCharacters = [];
      }
      provideSignatureHelp(_model, _position, token) {
        try {
          const count = invokeCount++;
          disposables.add(token.onCancellationRequested(() => {
            didRequestCancellationOf = count;
          }));
          if (count === 0) {
            hintsModel.trigger({ triggerKind: languages.SignatureHelpTriggerKind.Invoke }, 0);
          }
          return new Promise((resolve) => {
            setTimeout(() => {
              resolve({
                value: {
                  signatures: [{
                    label: "" + count,
                    parameters: []
                  }],
                  activeParameter: 0,
                  activeSignature: 0
                },
                dispose: () => {
                }
              });
            }, 100);
          });
        } catch (err) {
          console.error(err);
          throw err;
        }
      }
    }();
    disposables.add(registry.register(mockFileSelector, longRunningProvider));
    await runWithFakedTimers({ useFakeTimers: true }, async () => {
      hintsModel.trigger({ triggerKind: languages.SignatureHelpTriggerKind.Invoke }, 0);
      assert.strictEqual(-1, didRequestCancellationOf);
      return new Promise((resolve, reject) => disposables.add(hintsModel.onChangedHints((newParamterHints) => {
        try {
          assert.strictEqual(0, didRequestCancellationOf);
          assert.strictEqual("1", newParamterHints.signatures[0].label);
          resolve();
        } catch (e) {
          reject(e);
        }
      })));
    });
  });
  test("Provider should be retriggered by retrigger character", async () => {
    const { promise: donePromise, resolve: done } = promiseWithResolvers();
    const triggerChar = "a";
    const retriggerChar = "b";
    const editor = createMockEditor("");
    disposables.add(new ParameterHintsModel(editor, registry, 5));
    let invokeCount = 0;
    disposables.add(registry.register(mockFileSelector, new class {
      constructor() {
        this.signatureHelpTriggerCharacters = [triggerChar];
        this.signatureHelpRetriggerCharacters = [retriggerChar];
      }
      provideSignatureHelp(_model, _position, _token, context) {
        try {
          ++invokeCount;
          if (invokeCount === 1) {
            assert.strictEqual(context.triggerKind, languages.SignatureHelpTriggerKind.TriggerCharacter);
            assert.strictEqual(context.triggerCharacter, triggerChar);
            setTimeout(() => editor.trigger("keyboard", Handler.Type, { text: retriggerChar }), 50);
          } else if (invokeCount === 2) {
            assert.strictEqual(context.triggerKind, languages.SignatureHelpTriggerKind.TriggerCharacter);
            assert.ok(context.isRetrigger);
            assert.strictEqual(context.triggerCharacter, retriggerChar);
            done();
          } else {
            assert.fail("Unexpected invoke");
          }
          return emptySigHelpResult;
        } catch (err) {
          console.error(err);
          throw err;
        }
      }
    }()));
    await runWithFakedTimers({ useFakeTimers: true }, async () => {
      editor.trigger("keyboard", Handler.Type, { text: retriggerChar });
      editor.trigger("keyboard", Handler.Type, { text: triggerChar });
      return donePromise;
    });
  });
  test("should use first result from multiple providers", async () => {
    const triggerChar = "a";
    const firstProviderId = "firstProvider";
    const secondProviderId = "secondProvider";
    const paramterLabel = "parameter";
    const editor = createMockEditor("");
    const model = disposables.add(new ParameterHintsModel(editor, registry, 5));
    disposables.add(registry.register(mockFileSelector, new class {
      constructor() {
        this.signatureHelpTriggerCharacters = [triggerChar];
        this.signatureHelpRetriggerCharacters = [];
      }
      async provideSignatureHelp(_model, _position, _token, context) {
        try {
          if (!context.isRetrigger) {
            setTimeout(() => editor.trigger("keyboard", Handler.Type, { text: triggerChar }), 50);
            return {
              value: {
                activeParameter: 0,
                activeSignature: 0,
                signatures: [{
                  label: firstProviderId,
                  parameters: [
                    { label: paramterLabel }
                  ]
                }]
              },
              dispose: () => {
              }
            };
          }
          return void 0;
        } catch (err) {
          console.error(err);
          throw err;
        }
      }
    }()));
    disposables.add(registry.register(mockFileSelector, new class {
      constructor() {
        this.signatureHelpTriggerCharacters = [triggerChar];
        this.signatureHelpRetriggerCharacters = [];
      }
      async provideSignatureHelp(_model, _position, _token, context) {
        if (context.isRetrigger) {
          return {
            value: {
              activeParameter: 0,
              activeSignature: context.activeSignatureHelp ? context.activeSignatureHelp.activeSignature + 1 : 0,
              signatures: [{
                label: secondProviderId,
                parameters: context.activeSignatureHelp ? context.activeSignatureHelp.signatures[0].parameters : []
              }]
            },
            dispose: () => {
            }
          };
        }
        return void 0;
      }
    }()));
    await runWithFakedTimers({ useFakeTimers: true }, async () => {
      editor.trigger("keyboard", Handler.Type, { text: triggerChar });
      const firstHint = (await getNextHint(model)).value;
      assert.strictEqual(firstHint.signatures[0].label, firstProviderId);
      assert.strictEqual(firstHint.activeSignature, 0);
      assert.strictEqual(firstHint.signatures[0].parameters[0].label, paramterLabel);
      const secondHint = (await getNextHint(model)).value;
      assert.strictEqual(secondHint.signatures[0].label, secondProviderId);
      assert.strictEqual(secondHint.activeSignature, 1);
      assert.strictEqual(secondHint.signatures[0].parameters[0].label, paramterLabel);
    });
  });
  test("Quick typing should use the first trigger character", async () => {
    const editor = createMockEditor("");
    const model = disposables.add(new ParameterHintsModel(editor, registry, 50));
    const triggerCharacter = "a";
    let invokeCount = 0;
    disposables.add(registry.register(mockFileSelector, new class {
      constructor() {
        this.signatureHelpTriggerCharacters = [triggerCharacter];
        this.signatureHelpRetriggerCharacters = [];
      }
      provideSignatureHelp(_model, _position, _token, context) {
        try {
          ++invokeCount;
          if (invokeCount === 1) {
            assert.strictEqual(context.triggerKind, languages.SignatureHelpTriggerKind.TriggerCharacter);
            assert.strictEqual(context.triggerCharacter, triggerCharacter);
          } else {
            assert.fail("Unexpected invoke");
          }
          return emptySigHelpResult;
        } catch (err) {
          console.error(err);
          throw err;
        }
      }
    }()));
    await runWithFakedTimers({ useFakeTimers: true }, async () => {
      editor.trigger("keyboard", Handler.Type, { text: triggerCharacter });
      editor.trigger("keyboard", Handler.Type, { text: "x" });
      await getNextHint(model);
    });
  });
  test("Retrigger while a pending resolve is still going on should preserve last active signature #96702", async () => {
    const { promise: donePromise, resolve: done } = promiseWithResolvers();
    const editor = createMockEditor("");
    const model = disposables.add(new ParameterHintsModel(editor, registry, 50));
    const triggerCharacter = "a";
    const retriggerCharacter = "b";
    let invokeCount = 0;
    disposables.add(registry.register(mockFileSelector, new class {
      constructor() {
        this.signatureHelpTriggerCharacters = [triggerCharacter];
        this.signatureHelpRetriggerCharacters = [retriggerCharacter];
      }
      async provideSignatureHelp(_model, _position, _token, context) {
        try {
          ++invokeCount;
          if (invokeCount === 1) {
            assert.strictEqual(context.triggerKind, languages.SignatureHelpTriggerKind.TriggerCharacter);
            assert.strictEqual(context.triggerCharacter, triggerCharacter);
            setTimeout(() => editor.trigger("keyboard", Handler.Type, { text: retriggerCharacter }), 50);
          } else if (invokeCount === 2) {
            setTimeout(() => editor.trigger("keyboard", Handler.Type, { text: retriggerCharacter }), 50);
            await new Promise((resolve) => setTimeout(resolve, 1e3));
          } else if (invokeCount === 3) {
            assert.strictEqual(context.activeSignatureHelp, emptySigHelp);
            done();
          } else {
            assert.fail("Unexpected invoke");
          }
          return emptySigHelpResult;
        } catch (err) {
          console.error(err);
          done(err);
          throw err;
        }
      }
    }()));
    await runWithFakedTimers({ useFakeTimers: true }, async () => {
      editor.trigger("keyboard", Handler.Type, { text: triggerCharacter });
      await getNextHint(model);
      await getNextHint(model);
      await donePromise;
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXHBhcmFtZXRlckhpbnRzXFx0ZXN0XFxicm93c2VyXFxwYXJhbWV0ZXJIaW50c01vZGVsLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBwcm9taXNlV2l0aFJlc29sdmVycyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgcnVuV2l0aEZha2VkVGltZXJzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi90aW1lVHJhdmVsU2NoZWR1bGVyLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBIYW5kbGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2VkaXRvckNvbW1vbi5qcyc7XG5pbXBvcnQgeyBMYW5ndWFnZUZlYXR1cmVSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZUZlYXR1cmVSZWdpc3RyeS5qcyc7XG5pbXBvcnQgKiBhcyBsYW5ndWFnZXMgZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IFBhcmFtZXRlckhpbnRzTW9kZWwgfSBmcm9tICcuLi8uLi9icm93c2VyL3BhcmFtZXRlckhpbnRzTW9kZWwuanMnO1xuaW1wb3J0IHsgY3JlYXRlVGVzdENvZGVFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi90ZXN0L2Jyb3dzZXIvdGVzdENvZGVFZGl0b3IuanMnO1xuaW1wb3J0IHsgY3JlYXRlVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vdGVzdC9jb21tb24vdGVzdFRleHRNb2RlbC5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlQ29sbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL3NlcnZpY2VDb2xsZWN0aW9uLmpzJztcbmltcG9ydCB7IEluTWVtb3J5U3RvcmFnZVNlcnZpY2UsIElTdG9yYWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBOdWxsVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5VXRpbHMuanMnO1xuXG5jb25zdCBtb2NrRmlsZSA9IFVSSS5wYXJzZSgndGVzdDpzb21lZmlsZS50dHQnKTtcbmNvbnN0IG1vY2tGaWxlU2VsZWN0b3IgPSB7IHNjaGVtZTogJ3Rlc3QnIH07XG5cblxuY29uc3QgZW1wdHlTaWdIZWxwOiBsYW5ndWFnZXMuU2lnbmF0dXJlSGVscCA9IHtcblx0c2lnbmF0dXJlczogW3tcblx0XHRsYWJlbDogJ25vbmUnLFxuXHRcdHBhcmFtZXRlcnM6IFtdXG5cdH1dLFxuXHRhY3RpdmVQYXJhbWV0ZXI6IDAsXG5cdGFjdGl2ZVNpZ25hdHVyZTogMFxufTtcblxuY29uc3QgZW1wdHlTaWdIZWxwUmVzdWx0OiBsYW5ndWFnZXMuU2lnbmF0dXJlSGVscFJlc3VsdCA9IHtcblx0dmFsdWU6IGVtcHR5U2lnSGVscCxcblx0ZGlzcG9zZTogKCkgPT4geyB9XG59O1xuXG5zdWl0ZSgnUGFyYW1ldGVySGludHNNb2RlbCcsICgpID0+IHtcblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdGxldCByZWdpc3RyeTogTGFuZ3VhZ2VGZWF0dXJlUmVnaXN0cnk8bGFuZ3VhZ2VzLlNpZ25hdHVyZUhlbHBQcm92aWRlcj47XG5cblx0c2V0dXAoKCkgPT4ge1xuXHRcdGRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0cmVnaXN0cnkgPSBuZXcgTGFuZ3VhZ2VGZWF0dXJlUmVnaXN0cnk8bGFuZ3VhZ2VzLlNpZ25hdHVyZUhlbHBQcm92aWRlcj4oKTtcblx0fSk7XG5cblx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdGRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdH0pO1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGZ1bmN0aW9uIGNyZWF0ZU1vY2tFZGl0b3IoZmlsZUNvbnRlbnRzOiBzdHJpbmcpIHtcblx0XHRjb25zdCB0ZXh0TW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoY3JlYXRlVGV4dE1vZGVsKGZpbGVDb250ZW50cywgdW5kZWZpbmVkLCB1bmRlZmluZWQsIG1vY2tGaWxlKSk7XG5cdFx0Y29uc3QgZWRpdG9yID0gZGlzcG9zYWJsZXMuYWRkKGNyZWF0ZVRlc3RDb2RlRWRpdG9yKHRleHRNb2RlbCwge1xuXHRcdFx0c2VydmljZUNvbGxlY3Rpb246IG5ldyBTZXJ2aWNlQ29sbGVjdGlvbihcblx0XHRcdFx0W0lUZWxlbWV0cnlTZXJ2aWNlLCBOdWxsVGVsZW1ldHJ5U2VydmljZV0sXG5cdFx0XHRcdFtJU3RvcmFnZVNlcnZpY2UsIGRpc3Bvc2FibGVzLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKV1cblx0XHRcdClcblx0XHR9KSk7XG5cdFx0cmV0dXJuIGVkaXRvcjtcblx0fVxuXG5cdGZ1bmN0aW9uIGdldE5leHRIaW50KG1vZGVsOiBQYXJhbWV0ZXJIaW50c01vZGVsKSB7XG5cdFx0cmV0dXJuIG5ldyBQcm9taXNlPGxhbmd1YWdlcy5TaWduYXR1cmVIZWxwUmVzdWx0IHwgdW5kZWZpbmVkPihyZXNvbHZlID0+IHtcblx0XHRcdGNvbnN0IHN1YiA9IGRpc3Bvc2FibGVzLmFkZChtb2RlbC5vbkNoYW5nZWRIaW50cyhlID0+IHtcblx0XHRcdFx0c3ViLmRpc3Bvc2UoKTtcblx0XHRcdFx0cmV0dXJuIHJlc29sdmUoZSA/IHsgdmFsdWU6IGUsIGRpc3Bvc2U6ICgpID0+IHsgfSB9IDogdW5kZWZpbmVkKTtcblx0XHRcdH0pKTtcblx0XHR9KTtcblx0fVxuXG5cdHRlc3QoJ1Byb3ZpZGVyIHNob3VsZCBnZXQgdHJpZ2dlciBjaGFyYWN0ZXIgb24gdHlwZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IHByb21pc2U6IGRvbmVQcm9taXNlLCByZXNvbHZlOiBkb25lIH0gPSBwcm9taXNlV2l0aFJlc29sdmVyczx2b2lkPigpO1xuXG5cdFx0Y29uc3QgdHJpZ2dlckNoYXIgPSAnKCc7XG5cblx0XHRjb25zdCBlZGl0b3IgPSBjcmVhdGVNb2NrRWRpdG9yKCcnKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQobmV3IFBhcmFtZXRlckhpbnRzTW9kZWwoZWRpdG9yLCByZWdpc3RyeSkpO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHJlZ2lzdHJ5LnJlZ2lzdGVyKG1vY2tGaWxlU2VsZWN0b3IsIG5ldyBjbGFzcyBpbXBsZW1lbnRzIGxhbmd1YWdlcy5TaWduYXR1cmVIZWxwUHJvdmlkZXIge1xuXHRcdFx0c2lnbmF0dXJlSGVscFRyaWdnZXJDaGFyYWN0ZXJzID0gW3RyaWdnZXJDaGFyXTtcblx0XHRcdHNpZ25hdHVyZUhlbHBSZXRyaWdnZXJDaGFyYWN0ZXJzID0gW107XG5cblx0XHRcdHByb3ZpZGVTaWduYXR1cmVIZWxwKF9tb2RlbDogSVRleHRNb2RlbCwgX3Bvc2l0aW9uOiBQb3NpdGlvbiwgX3Rva2VuOiBDYW5jZWxsYXRpb25Ub2tlbiwgY29udGV4dDogbGFuZ3VhZ2VzLlNpZ25hdHVyZUhlbHBDb250ZXh0KSB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250ZXh0LnRyaWdnZXJLaW5kLCBsYW5ndWFnZXMuU2lnbmF0dXJlSGVscFRyaWdnZXJLaW5kLlRyaWdnZXJDaGFyYWN0ZXIpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udGV4dC50cmlnZ2VyQ2hhcmFjdGVyLCB0cmlnZ2VyQ2hhcik7XG5cdFx0XHRcdGRvbmUoKTtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRhd2FpdCBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRcdGVkaXRvci50cmlnZ2VyKCdrZXlib2FyZCcsIEhhbmRsZXIuVHlwZSwgeyB0ZXh0OiB0cmlnZ2VyQ2hhciB9KTtcblx0XHRcdGF3YWl0IGRvbmVQcm9taXNlO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdQcm92aWRlciBzaG91bGQgYmUgcmV0cmlnZ2VyZWQgaWYgYWxyZWFkeSBhY3RpdmUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBwcm9taXNlOiBkb25lUHJvbWlzZSwgcmVzb2x2ZTogZG9uZSB9ID0gcHJvbWlzZVdpdGhSZXNvbHZlcnM8dm9pZD4oKTtcblxuXHRcdGNvbnN0IHRyaWdnZXJDaGFyID0gJygnO1xuXG5cdFx0Y29uc3QgZWRpdG9yID0gY3JlYXRlTW9ja0VkaXRvcignJyk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKG5ldyBQYXJhbWV0ZXJIaW50c01vZGVsKGVkaXRvciwgcmVnaXN0cnkpKTtcblxuXHRcdGxldCBpbnZva2VDb3VudCA9IDA7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHJlZ2lzdHJ5LnJlZ2lzdGVyKG1vY2tGaWxlU2VsZWN0b3IsIG5ldyBjbGFzcyBpbXBsZW1lbnRzIGxhbmd1YWdlcy5TaWduYXR1cmVIZWxwUHJvdmlkZXIge1xuXHRcdFx0c2lnbmF0dXJlSGVscFRyaWdnZXJDaGFyYWN0ZXJzID0gW3RyaWdnZXJDaGFyXTtcblx0XHRcdHNpZ25hdHVyZUhlbHBSZXRyaWdnZXJDaGFyYWN0ZXJzID0gW107XG5cblx0XHRcdHByb3ZpZGVTaWduYXR1cmVIZWxwKF9tb2RlbDogSVRleHRNb2RlbCwgX3Bvc2l0aW9uOiBQb3NpdGlvbiwgX3Rva2VuOiBDYW5jZWxsYXRpb25Ub2tlbiwgY29udGV4dDogbGFuZ3VhZ2VzLlNpZ25hdHVyZUhlbHBDb250ZXh0KTogbGFuZ3VhZ2VzLlNpZ25hdHVyZUhlbHBSZXN1bHQgfCBQcm9taXNlPGxhbmd1YWdlcy5TaWduYXR1cmVIZWxwUmVzdWx0PiB7XG5cdFx0XHRcdCsraW52b2tlQ291bnQ7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0aWYgKGludm9rZUNvdW50ID09PSAxKSB7XG5cdFx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udGV4dC50cmlnZ2VyS2luZCwgbGFuZ3VhZ2VzLlNpZ25hdHVyZUhlbHBUcmlnZ2VyS2luZC5UcmlnZ2VyQ2hhcmFjdGVyKTtcblx0XHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250ZXh0LnRyaWdnZXJDaGFyYWN0ZXIsIHRyaWdnZXJDaGFyKTtcblx0XHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250ZXh0LmlzUmV0cmlnZ2VyLCBmYWxzZSk7XG5cdFx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udGV4dC5hY3RpdmVTaWduYXR1cmVIZWxwLCB1bmRlZmluZWQpO1xuXG5cdFx0XHRcdFx0XHQvLyBSZXRyaWdnZXJcblx0XHRcdFx0XHRcdHNldFRpbWVvdXQoKCkgPT4gZWRpdG9yLnRyaWdnZXIoJ2tleWJvYXJkJywgSGFuZGxlci5UeXBlLCB7IHRleHQ6IHRyaWdnZXJDaGFyIH0pLCAwKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGludm9rZUNvdW50LCAyKTtcblx0XHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250ZXh0LnRyaWdnZXJLaW5kLCBsYW5ndWFnZXMuU2lnbmF0dXJlSGVscFRyaWdnZXJLaW5kLlRyaWdnZXJDaGFyYWN0ZXIpO1xuXHRcdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRleHQuaXNSZXRyaWdnZXIsIHRydWUpO1xuXHRcdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRleHQudHJpZ2dlckNoYXJhY3RlciwgdHJpZ2dlckNoYXIpO1xuXHRcdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRleHQuYWN0aXZlU2lnbmF0dXJlSGVscCwgZW1wdHlTaWdIZWxwKTtcblxuXHRcdFx0XHRcdFx0ZG9uZSgpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm4gZW1wdHlTaWdIZWxwUmVzdWx0O1xuXHRcdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0XHRjb25zb2xlLmVycm9yKGVycik7XG5cdFx0XHRcdFx0dGhyb3cgZXJyO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0YXdhaXQgcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRlZGl0b3IudHJpZ2dlcigna2V5Ym9hcmQnLCBIYW5kbGVyLlR5cGUsIHsgdGV4dDogdHJpZ2dlckNoYXIgfSk7XG5cdFx0XHRhd2FpdCBkb25lUHJvbWlzZTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnUHJvdmlkZXIgc2hvdWxkIG5vdCBiZSByZXRyaWdnZXJlZCBpZiBwcmV2aW91cyBoZWxwIGlzIGNhbmNlbGVkIGZpcnN0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgcHJvbWlzZTogZG9uZVByb21pc2UsIHJlc29sdmU6IGRvbmUgfSA9IHByb21pc2VXaXRoUmVzb2x2ZXJzPHZvaWQ+KCk7XG5cblx0XHRjb25zdCB0cmlnZ2VyQ2hhciA9ICcoJztcblxuXHRcdGNvbnN0IGVkaXRvciA9IGNyZWF0ZU1vY2tFZGl0b3IoJycpO1xuXHRcdGNvbnN0IGhpbnRNb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgUGFyYW1ldGVySGludHNNb2RlbChlZGl0b3IsIHJlZ2lzdHJ5KSk7XG5cblx0XHRsZXQgaW52b2tlQ291bnQgPSAwO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChyZWdpc3RyeS5yZWdpc3Rlcihtb2NrRmlsZVNlbGVjdG9yLCBuZXcgY2xhc3MgaW1wbGVtZW50cyBsYW5ndWFnZXMuU2lnbmF0dXJlSGVscFByb3ZpZGVyIHtcblx0XHRcdHNpZ25hdHVyZUhlbHBUcmlnZ2VyQ2hhcmFjdGVycyA9IFt0cmlnZ2VyQ2hhcl07XG5cdFx0XHRzaWduYXR1cmVIZWxwUmV0cmlnZ2VyQ2hhcmFjdGVycyA9IFtdO1xuXG5cdFx0XHRwcm92aWRlU2lnbmF0dXJlSGVscChfbW9kZWw6IElUZXh0TW9kZWwsIF9wb3NpdGlvbjogUG9zaXRpb24sIF90b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4sIGNvbnRleHQ6IGxhbmd1YWdlcy5TaWduYXR1cmVIZWxwQ29udGV4dCk6IGxhbmd1YWdlcy5TaWduYXR1cmVIZWxwUmVzdWx0IHwgUHJvbWlzZTxsYW5ndWFnZXMuU2lnbmF0dXJlSGVscFJlc3VsdD4ge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdCsraW52b2tlQ291bnQ7XG5cdFx0XHRcdFx0aWYgKGludm9rZUNvdW50ID09PSAxKSB7XG5cdFx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udGV4dC50cmlnZ2VyS2luZCwgbGFuZ3VhZ2VzLlNpZ25hdHVyZUhlbHBUcmlnZ2VyS2luZC5UcmlnZ2VyQ2hhcmFjdGVyKTtcblx0XHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250ZXh0LnRyaWdnZXJDaGFyYWN0ZXIsIHRyaWdnZXJDaGFyKTtcblx0XHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250ZXh0LmlzUmV0cmlnZ2VyLCBmYWxzZSk7XG5cdFx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udGV4dC5hY3RpdmVTaWduYXR1cmVIZWxwLCB1bmRlZmluZWQpO1xuXG5cdFx0XHRcdFx0XHQvLyBDYW5jZWwgYW5kIHJldHJpZ2dlclxuXHRcdFx0XHRcdFx0aGludE1vZGVsLmNhbmNlbCgpO1xuXHRcdFx0XHRcdFx0ZWRpdG9yLnRyaWdnZXIoJ2tleWJvYXJkJywgSGFuZGxlci5UeXBlLCB7IHRleHQ6IHRyaWdnZXJDaGFyIH0pO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW52b2tlQ291bnQsIDIpO1xuXHRcdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRleHQudHJpZ2dlcktpbmQsIGxhbmd1YWdlcy5TaWduYXR1cmVIZWxwVHJpZ2dlcktpbmQuVHJpZ2dlckNoYXJhY3Rlcik7XG5cdFx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udGV4dC50cmlnZ2VyQ2hhcmFjdGVyLCB0cmlnZ2VyQ2hhcik7XG5cdFx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udGV4dC5pc1JldHJpZ2dlciwgdHJ1ZSk7XG5cdFx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udGV4dC5hY3RpdmVTaWduYXR1cmVIZWxwLCB1bmRlZmluZWQpO1xuXHRcdFx0XHRcdFx0ZG9uZSgpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm4gZW1wdHlTaWdIZWxwUmVzdWx0O1xuXHRcdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0XHRjb25zb2xlLmVycm9yKGVycik7XG5cdFx0XHRcdFx0dGhyb3cgZXJyO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0YXdhaXQgcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCAoKSA9PiB7XG5cdFx0XHRlZGl0b3IudHJpZ2dlcigna2V5Ym9hcmQnLCBIYW5kbGVyLlR5cGUsIHsgdGV4dDogdHJpZ2dlckNoYXIgfSk7XG5cdFx0XHRyZXR1cm4gZG9uZVByb21pc2U7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1Byb3ZpZGVyIHNob3VsZCBnZXQgbGFzdCB0cmlnZ2VyIGNoYXJhY3RlciB3aGVuIHRyaWdnZXJlZCBtdWx0aXBsZSB0aW1lcyBhbmQgb25seSBiZSBpbnZva2VkIG9uY2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBwcm9taXNlOiBkb25lUHJvbWlzZSwgcmVzb2x2ZTogZG9uZSB9ID0gcHJvbWlzZVdpdGhSZXNvbHZlcnM8dm9pZD4oKTtcblxuXHRcdGNvbnN0IGVkaXRvciA9IGNyZWF0ZU1vY2tFZGl0b3IoJycpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChuZXcgUGFyYW1ldGVySGludHNNb2RlbChlZGl0b3IsIHJlZ2lzdHJ5LCA1KSk7XG5cblx0XHRsZXQgaW52b2tlQ291bnQgPSAwO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChyZWdpc3RyeS5yZWdpc3Rlcihtb2NrRmlsZVNlbGVjdG9yLCBuZXcgY2xhc3MgaW1wbGVtZW50cyBsYW5ndWFnZXMuU2lnbmF0dXJlSGVscFByb3ZpZGVyIHtcblx0XHRcdHNpZ25hdHVyZUhlbHBUcmlnZ2VyQ2hhcmFjdGVycyA9IFsnYScsICdiJywgJ2MnXTtcblx0XHRcdHNpZ25hdHVyZUhlbHBSZXRyaWdnZXJDaGFyYWN0ZXJzID0gW107XG5cblx0XHRcdHByb3ZpZGVTaWduYXR1cmVIZWxwKF9tb2RlbDogSVRleHRNb2RlbCwgX3Bvc2l0aW9uOiBQb3NpdGlvbiwgX3Rva2VuOiBDYW5jZWxsYXRpb25Ub2tlbiwgY29udGV4dDogbGFuZ3VhZ2VzLlNpZ25hdHVyZUhlbHBDb250ZXh0KSB7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0KytpbnZva2VDb3VudDtcblxuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250ZXh0LnRyaWdnZXJLaW5kLCBsYW5ndWFnZXMuU2lnbmF0dXJlSGVscFRyaWdnZXJLaW5kLlRyaWdnZXJDaGFyYWN0ZXIpO1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250ZXh0LmlzUmV0cmlnZ2VyLCBmYWxzZSk7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRleHQudHJpZ2dlckNoYXJhY3RlciwgJ2MnKTtcblxuXHRcdFx0XHRcdC8vIEdpdmUgc29tZSB0aW1lIHRvIGFsbG93IGZvciBsYXRlciB0cmlnZ2Vyc1xuXHRcdFx0XHRcdHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGludm9rZUNvdW50LCAxKTtcblxuXHRcdFx0XHRcdFx0ZG9uZSgpO1xuXHRcdFx0XHRcdH0sIDUwKTtcblx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0XHRjb25zb2xlLmVycm9yKGVycik7XG5cdFx0XHRcdFx0dGhyb3cgZXJyO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0YXdhaXQgcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRlZGl0b3IudHJpZ2dlcigna2V5Ym9hcmQnLCBIYW5kbGVyLlR5cGUsIHsgdGV4dDogJ2EnIH0pO1xuXHRcdFx0ZWRpdG9yLnRyaWdnZXIoJ2tleWJvYXJkJywgSGFuZGxlci5UeXBlLCB7IHRleHQ6ICdiJyB9KTtcblx0XHRcdGVkaXRvci50cmlnZ2VyKCdrZXlib2FyZCcsIEhhbmRsZXIuVHlwZSwgeyB0ZXh0OiAnYycgfSk7XG5cblx0XHRcdGF3YWl0IGRvbmVQcm9taXNlO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdQcm92aWRlciBzaG91bGQgYmUgcmV0cmlnZ2VyZWQgaWYgYWxyZWFkeSBhY3RpdmUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBwcm9taXNlOiBkb25lUHJvbWlzZSwgcmVzb2x2ZTogZG9uZSB9ID0gcHJvbWlzZVdpdGhSZXNvbHZlcnM8dm9pZD4oKTtcblxuXHRcdGNvbnN0IGVkaXRvciA9IGNyZWF0ZU1vY2tFZGl0b3IoJycpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChuZXcgUGFyYW1ldGVySGludHNNb2RlbChlZGl0b3IsIHJlZ2lzdHJ5LCA1KSk7XG5cblx0XHRsZXQgaW52b2tlQ291bnQgPSAwO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHJlZ2lzdHJ5LnJlZ2lzdGVyKG1vY2tGaWxlU2VsZWN0b3IsIG5ldyBjbGFzcyBpbXBsZW1lbnRzIGxhbmd1YWdlcy5TaWduYXR1cmVIZWxwUHJvdmlkZXIge1xuXHRcdFx0c2lnbmF0dXJlSGVscFRyaWdnZXJDaGFyYWN0ZXJzID0gWydhJywgJ2InXTtcblx0XHRcdHNpZ25hdHVyZUhlbHBSZXRyaWdnZXJDaGFyYWN0ZXJzID0gW107XG5cblx0XHRcdHByb3ZpZGVTaWduYXR1cmVIZWxwKF9tb2RlbDogSVRleHRNb2RlbCwgX3Bvc2l0aW9uOiBQb3NpdGlvbiwgX3Rva2VuOiBDYW5jZWxsYXRpb25Ub2tlbiwgY29udGV4dDogbGFuZ3VhZ2VzLlNpZ25hdHVyZUhlbHBDb250ZXh0KTogbGFuZ3VhZ2VzLlNpZ25hdHVyZUhlbHBSZXN1bHQgfCBQcm9taXNlPGxhbmd1YWdlcy5TaWduYXR1cmVIZWxwUmVzdWx0PiB7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0KytpbnZva2VDb3VudDtcblx0XHRcdFx0XHRpZiAoaW52b2tlQ291bnQgPT09IDEpIHtcblx0XHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250ZXh0LnRyaWdnZXJLaW5kLCBsYW5ndWFnZXMuU2lnbmF0dXJlSGVscFRyaWdnZXJLaW5kLlRyaWdnZXJDaGFyYWN0ZXIpO1xuXHRcdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRleHQudHJpZ2dlckNoYXJhY3RlciwgJ2EnKTtcblxuXHRcdFx0XHRcdFx0Ly8gcmV0cmlnZ2VyIGFmdGVyIGRlbGF5IGZvciB3aWRnZXQgdG8gc2hvdyB1cFxuXHRcdFx0XHRcdFx0c2V0VGltZW91dCgoKSA9PiBlZGl0b3IudHJpZ2dlcigna2V5Ym9hcmQnLCBIYW5kbGVyLlR5cGUsIHsgdGV4dDogJ2InIH0pLCA1MCk7XG5cdFx0XHRcdFx0fSBlbHNlIGlmIChpbnZva2VDb3VudCA9PT0gMikge1xuXHRcdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRleHQudHJpZ2dlcktpbmQsIGxhbmd1YWdlcy5TaWduYXR1cmVIZWxwVHJpZ2dlcktpbmQuVHJpZ2dlckNoYXJhY3Rlcik7XG5cdFx0XHRcdFx0XHRhc3NlcnQub2soY29udGV4dC5pc1JldHJpZ2dlcik7XG5cdFx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udGV4dC50cmlnZ2VyQ2hhcmFjdGVyLCAnYicpO1xuXHRcdFx0XHRcdFx0ZG9uZSgpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRhc3NlcnQuZmFpbCgnVW5leHBlY3RlZCBpbnZva2UnKTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRyZXR1cm4gZW1wdHlTaWdIZWxwUmVzdWx0O1xuXHRcdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0XHRjb25zb2xlLmVycm9yKGVycik7XG5cdFx0XHRcdFx0dGhyb3cgZXJyO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0YXdhaXQgcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCAoKSA9PiB7XG5cdFx0XHRlZGl0b3IudHJpZ2dlcigna2V5Ym9hcmQnLCBIYW5kbGVyLlR5cGUsIHsgdGV4dDogJ2EnIH0pO1xuXHRcdFx0cmV0dXJuIGRvbmVQcm9taXNlO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdTaG91bGQgY2FuY2VsIGV4aXN0aW5nIHJlcXVlc3Qgd2hlbiBuZXcgcmVxdWVzdCBjb21lcyBpbicsIGFzeW5jICgpID0+IHtcblxuXHRcdGNvbnN0IGVkaXRvciA9IGNyZWF0ZU1vY2tFZGl0b3IoJ2FiYyBkZWYnKTtcblx0XHRjb25zdCBoaW50c01vZGVsID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBQYXJhbWV0ZXJIaW50c01vZGVsKGVkaXRvciwgcmVnaXN0cnkpKTtcblxuXHRcdGxldCBkaWRSZXF1ZXN0Q2FuY2VsbGF0aW9uT2YgPSAtMTtcblx0XHRsZXQgaW52b2tlQ291bnQgPSAwO1xuXHRcdGNvbnN0IGxvbmdSdW5uaW5nUHJvdmlkZXIgPSBuZXcgY2xhc3MgaW1wbGVtZW50cyBsYW5ndWFnZXMuU2lnbmF0dXJlSGVscFByb3ZpZGVyIHtcblx0XHRcdHNpZ25hdHVyZUhlbHBUcmlnZ2VyQ2hhcmFjdGVycyA9IFtdO1xuXHRcdFx0c2lnbmF0dXJlSGVscFJldHJpZ2dlckNoYXJhY3RlcnMgPSBbXTtcblxuXG5cdFx0XHRwcm92aWRlU2lnbmF0dXJlSGVscChfbW9kZWw6IElUZXh0TW9kZWwsIF9wb3NpdGlvbjogUG9zaXRpb24sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IGxhbmd1YWdlcy5TaWduYXR1cmVIZWxwUmVzdWx0IHwgUHJvbWlzZTxsYW5ndWFnZXMuU2lnbmF0dXJlSGVscFJlc3VsdD4ge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGNvbnN0IGNvdW50ID0gaW52b2tlQ291bnQrKztcblx0XHRcdFx0XHRkaXNwb3NhYmxlcy5hZGQodG9rZW4ub25DYW5jZWxsYXRpb25SZXF1ZXN0ZWQoKCkgPT4geyBkaWRSZXF1ZXN0Q2FuY2VsbGF0aW9uT2YgPSBjb3VudDsgfSkpO1xuXG5cdFx0XHRcdFx0Ly8gcmV0cmlnZ2VyIG9uIGZpcnN0IHJlcXVlc3Rcblx0XHRcdFx0XHRpZiAoY291bnQgPT09IDApIHtcblx0XHRcdFx0XHRcdGhpbnRzTW9kZWwudHJpZ2dlcih7IHRyaWdnZXJLaW5kOiBsYW5ndWFnZXMuU2lnbmF0dXJlSGVscFRyaWdnZXJLaW5kLkludm9rZSB9LCAwKTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRyZXR1cm4gbmV3IFByb21pc2U8bGFuZ3VhZ2VzLlNpZ25hdHVyZUhlbHBSZXN1bHQ+KHJlc29sdmUgPT4ge1xuXHRcdFx0XHRcdFx0c2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdHJlc29sdmUoe1xuXHRcdFx0XHRcdFx0XHRcdHZhbHVlOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRzaWduYXR1cmVzOiBbe1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRsYWJlbDogJycgKyBjb3VudCxcblx0XHRcdFx0XHRcdFx0XHRcdFx0cGFyYW1ldGVyczogW11cblx0XHRcdFx0XHRcdFx0XHRcdH1dLFxuXHRcdFx0XHRcdFx0XHRcdFx0YWN0aXZlUGFyYW1ldGVyOiAwLFxuXHRcdFx0XHRcdFx0XHRcdFx0YWN0aXZlU2lnbmF0dXJlOiAwXG5cdFx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0XHRkaXNwb3NlOiAoKSA9PiB7IH1cblx0XHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHR9LCAxMDApO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0XHRjb25zb2xlLmVycm9yKGVycik7XG5cdFx0XHRcdFx0dGhyb3cgZXJyO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChyZWdpc3RyeS5yZWdpc3Rlcihtb2NrRmlsZVNlbGVjdG9yLCBsb25nUnVubmluZ1Byb3ZpZGVyKSk7XG5cblx0XHRhd2FpdCBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblxuXHRcdFx0aGludHNNb2RlbC50cmlnZ2VyKHsgdHJpZ2dlcktpbmQ6IGxhbmd1YWdlcy5TaWduYXR1cmVIZWxwVHJpZ2dlcktpbmQuSW52b2tlIH0sIDApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKC0xLCBkaWRSZXF1ZXN0Q2FuY2VsbGF0aW9uT2YpO1xuXG5cdFx0XHRyZXR1cm4gbmV3IFByb21pc2U8dm9pZD4oKHJlc29sdmUsIHJlamVjdCkgPT5cblx0XHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGhpbnRzTW9kZWwub25DaGFuZ2VkSGludHMobmV3UGFyYW10ZXJIaW50cyA9PiB7XG5cdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCgwLCBkaWRSZXF1ZXN0Q2FuY2VsbGF0aW9uT2YpO1xuXHRcdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKCcxJywgbmV3UGFyYW10ZXJIaW50cyEuc2lnbmF0dXJlc1swXS5sYWJlbCk7XG5cdFx0XHRcdFx0XHRyZXNvbHZlKCk7XG5cdFx0XHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRcdFx0cmVqZWN0KGUpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSkpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnUHJvdmlkZXIgc2hvdWxkIGJlIHJldHJpZ2dlcmVkIGJ5IHJldHJpZ2dlciBjaGFyYWN0ZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBwcm9taXNlOiBkb25lUHJvbWlzZSwgcmVzb2x2ZTogZG9uZSB9ID0gcHJvbWlzZVdpdGhSZXNvbHZlcnM8dm9pZD4oKTtcblxuXHRcdGNvbnN0IHRyaWdnZXJDaGFyID0gJ2EnO1xuXHRcdGNvbnN0IHJldHJpZ2dlckNoYXIgPSAnYic7XG5cblx0XHRjb25zdCBlZGl0b3IgPSBjcmVhdGVNb2NrRWRpdG9yKCcnKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQobmV3IFBhcmFtZXRlckhpbnRzTW9kZWwoZWRpdG9yLCByZWdpc3RyeSwgNSkpO1xuXG5cdFx0bGV0IGludm9rZUNvdW50ID0gMDtcblx0XHRkaXNwb3NhYmxlcy5hZGQocmVnaXN0cnkucmVnaXN0ZXIobW9ja0ZpbGVTZWxlY3RvciwgbmV3IGNsYXNzIGltcGxlbWVudHMgbGFuZ3VhZ2VzLlNpZ25hdHVyZUhlbHBQcm92aWRlciB7XG5cdFx0XHRzaWduYXR1cmVIZWxwVHJpZ2dlckNoYXJhY3RlcnMgPSBbdHJpZ2dlckNoYXJdO1xuXHRcdFx0c2lnbmF0dXJlSGVscFJldHJpZ2dlckNoYXJhY3RlcnMgPSBbcmV0cmlnZ2VyQ2hhcl07XG5cblx0XHRcdHByb3ZpZGVTaWduYXR1cmVIZWxwKF9tb2RlbDogSVRleHRNb2RlbCwgX3Bvc2l0aW9uOiBQb3NpdGlvbiwgX3Rva2VuOiBDYW5jZWxsYXRpb25Ub2tlbiwgY29udGV4dDogbGFuZ3VhZ2VzLlNpZ25hdHVyZUhlbHBDb250ZXh0KTogbGFuZ3VhZ2VzLlNpZ25hdHVyZUhlbHBSZXN1bHQgfCBQcm9taXNlPGxhbmd1YWdlcy5TaWduYXR1cmVIZWxwUmVzdWx0PiB7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0KytpbnZva2VDb3VudDtcblx0XHRcdFx0XHRpZiAoaW52b2tlQ291bnQgPT09IDEpIHtcblx0XHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250ZXh0LnRyaWdnZXJLaW5kLCBsYW5ndWFnZXMuU2lnbmF0dXJlSGVscFRyaWdnZXJLaW5kLlRyaWdnZXJDaGFyYWN0ZXIpO1xuXHRcdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRleHQudHJpZ2dlckNoYXJhY3RlciwgdHJpZ2dlckNoYXIpO1xuXG5cdFx0XHRcdFx0XHQvLyByZXRyaWdnZXIgYWZ0ZXIgZGVsYXkgZm9yIHdpZGdldCB0byBzaG93IHVwXG5cdFx0XHRcdFx0XHRzZXRUaW1lb3V0KCgpID0+IGVkaXRvci50cmlnZ2VyKCdrZXlib2FyZCcsIEhhbmRsZXIuVHlwZSwgeyB0ZXh0OiByZXRyaWdnZXJDaGFyIH0pLCA1MCk7XG5cdFx0XHRcdFx0fSBlbHNlIGlmIChpbnZva2VDb3VudCA9PT0gMikge1xuXHRcdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRleHQudHJpZ2dlcktpbmQsIGxhbmd1YWdlcy5TaWduYXR1cmVIZWxwVHJpZ2dlcktpbmQuVHJpZ2dlckNoYXJhY3Rlcik7XG5cdFx0XHRcdFx0XHRhc3NlcnQub2soY29udGV4dC5pc1JldHJpZ2dlcik7XG5cdFx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udGV4dC50cmlnZ2VyQ2hhcmFjdGVyLCByZXRyaWdnZXJDaGFyKTtcblx0XHRcdFx0XHRcdGRvbmUoKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0YXNzZXJ0LmZhaWwoJ1VuZXhwZWN0ZWQgaW52b2tlJyk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0cmV0dXJuIGVtcHR5U2lnSGVscFJlc3VsdDtcblx0XHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdFx0Y29uc29sZS5lcnJvcihlcnIpO1xuXHRcdFx0XHRcdHRocm93IGVycjtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGF3YWl0IHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Ly8gVGhpcyBzaG91bGQgbm90IHRyaWdnZXIgYW55dGhpbmdcblx0XHRcdGVkaXRvci50cmlnZ2VyKCdrZXlib2FyZCcsIEhhbmRsZXIuVHlwZSwgeyB0ZXh0OiByZXRyaWdnZXJDaGFyIH0pO1xuXG5cdFx0XHQvLyBCdXQgYSB0cmlnZ2VyIGNoYXJhY3RlciBzaG91bGRcblx0XHRcdGVkaXRvci50cmlnZ2VyKCdrZXlib2FyZCcsIEhhbmRsZXIuVHlwZSwgeyB0ZXh0OiB0cmlnZ2VyQ2hhciB9KTtcblxuXHRcdFx0cmV0dXJuIGRvbmVQcm9taXNlO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgdXNlIGZpcnN0IHJlc3VsdCBmcm9tIG11bHRpcGxlIHByb3ZpZGVycycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB0cmlnZ2VyQ2hhciA9ICdhJztcblx0XHRjb25zdCBmaXJzdFByb3ZpZGVySWQgPSAnZmlyc3RQcm92aWRlcic7XG5cdFx0Y29uc3Qgc2Vjb25kUHJvdmlkZXJJZCA9ICdzZWNvbmRQcm92aWRlcic7XG5cdFx0Y29uc3QgcGFyYW10ZXJMYWJlbCA9ICdwYXJhbWV0ZXInO1xuXG5cdFx0Y29uc3QgZWRpdG9yID0gY3JlYXRlTW9ja0VkaXRvcignJyk7XG5cdFx0Y29uc3QgbW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFBhcmFtZXRlckhpbnRzTW9kZWwoZWRpdG9yLCByZWdpc3RyeSwgNSkpO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHJlZ2lzdHJ5LnJlZ2lzdGVyKG1vY2tGaWxlU2VsZWN0b3IsIG5ldyBjbGFzcyBpbXBsZW1lbnRzIGxhbmd1YWdlcy5TaWduYXR1cmVIZWxwUHJvdmlkZXIge1xuXHRcdFx0c2lnbmF0dXJlSGVscFRyaWdnZXJDaGFyYWN0ZXJzID0gW3RyaWdnZXJDaGFyXTtcblx0XHRcdHNpZ25hdHVyZUhlbHBSZXRyaWdnZXJDaGFyYWN0ZXJzID0gW107XG5cblx0XHRcdGFzeW5jIHByb3ZpZGVTaWduYXR1cmVIZWxwKF9tb2RlbDogSVRleHRNb2RlbCwgX3Bvc2l0aW9uOiBQb3NpdGlvbiwgX3Rva2VuOiBDYW5jZWxsYXRpb25Ub2tlbiwgY29udGV4dDogbGFuZ3VhZ2VzLlNpZ25hdHVyZUhlbHBDb250ZXh0KTogUHJvbWlzZTxsYW5ndWFnZXMuU2lnbmF0dXJlSGVscFJlc3VsdCB8IHVuZGVmaW5lZD4ge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGlmICghY29udGV4dC5pc1JldHJpZ2dlcikge1xuXHRcdFx0XHRcdFx0Ly8gcmV0cmlnZ2VyIGFmdGVyIGRlbGF5IGZvciB3aWRnZXQgdG8gc2hvdyB1cFxuXHRcdFx0XHRcdFx0c2V0VGltZW91dCgoKSA9PiBlZGl0b3IudHJpZ2dlcigna2V5Ym9hcmQnLCBIYW5kbGVyLlR5cGUsIHsgdGV4dDogdHJpZ2dlckNoYXIgfSksIDUwKTtcblxuXHRcdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdFx0dmFsdWU6IHtcblx0XHRcdFx0XHRcdFx0XHRhY3RpdmVQYXJhbWV0ZXI6IDAsXG5cdFx0XHRcdFx0XHRcdFx0YWN0aXZlU2lnbmF0dXJlOiAwLFxuXHRcdFx0XHRcdFx0XHRcdHNpZ25hdHVyZXM6IFt7XG5cdFx0XHRcdFx0XHRcdFx0XHRsYWJlbDogZmlyc3RQcm92aWRlcklkLFxuXHRcdFx0XHRcdFx0XHRcdFx0cGFyYW1ldGVyczogW1xuXHRcdFx0XHRcdFx0XHRcdFx0XHR7IGxhYmVsOiBwYXJhbXRlckxhYmVsIH1cblx0XHRcdFx0XHRcdFx0XHRcdF1cblx0XHRcdFx0XHRcdFx0XHR9XVxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRkaXNwb3NlOiAoKSA9PiB7IH1cblx0XHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdFx0Y29uc29sZS5lcnJvcihlcnIpO1xuXHRcdFx0XHRcdHRocm93IGVycjtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChyZWdpc3RyeS5yZWdpc3Rlcihtb2NrRmlsZVNlbGVjdG9yLCBuZXcgY2xhc3MgaW1wbGVtZW50cyBsYW5ndWFnZXMuU2lnbmF0dXJlSGVscFByb3ZpZGVyIHtcblx0XHRcdHNpZ25hdHVyZUhlbHBUcmlnZ2VyQ2hhcmFjdGVycyA9IFt0cmlnZ2VyQ2hhcl07XG5cdFx0XHRzaWduYXR1cmVIZWxwUmV0cmlnZ2VyQ2hhcmFjdGVycyA9IFtdO1xuXG5cdFx0XHRhc3luYyBwcm92aWRlU2lnbmF0dXJlSGVscChfbW9kZWw6IElUZXh0TW9kZWwsIF9wb3NpdGlvbjogUG9zaXRpb24sIF90b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4sIGNvbnRleHQ6IGxhbmd1YWdlcy5TaWduYXR1cmVIZWxwQ29udGV4dCk6IFByb21pc2U8bGFuZ3VhZ2VzLlNpZ25hdHVyZUhlbHBSZXN1bHQgfCB1bmRlZmluZWQ+IHtcblx0XHRcdFx0aWYgKGNvbnRleHQuaXNSZXRyaWdnZXIpIHtcblx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0dmFsdWU6IHtcblx0XHRcdFx0XHRcdFx0YWN0aXZlUGFyYW1ldGVyOiAwLFxuXHRcdFx0XHRcdFx0XHRhY3RpdmVTaWduYXR1cmU6IGNvbnRleHQuYWN0aXZlU2lnbmF0dXJlSGVscCA/IGNvbnRleHQuYWN0aXZlU2lnbmF0dXJlSGVscC5hY3RpdmVTaWduYXR1cmUgKyAxIDogMCxcblx0XHRcdFx0XHRcdFx0c2lnbmF0dXJlczogW3tcblx0XHRcdFx0XHRcdFx0XHRsYWJlbDogc2Vjb25kUHJvdmlkZXJJZCxcblx0XHRcdFx0XHRcdFx0XHRwYXJhbWV0ZXJzOiBjb250ZXh0LmFjdGl2ZVNpZ25hdHVyZUhlbHAgPyBjb250ZXh0LmFjdGl2ZVNpZ25hdHVyZUhlbHAuc2lnbmF0dXJlc1swXS5wYXJhbWV0ZXJzIDogW11cblx0XHRcdFx0XHRcdFx0fV1cblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRkaXNwb3NlOiAoKSA9PiB7IH1cblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRhd2FpdCBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRcdGVkaXRvci50cmlnZ2VyKCdrZXlib2FyZCcsIEhhbmRsZXIuVHlwZSwgeyB0ZXh0OiB0cmlnZ2VyQ2hhciB9KTtcblxuXHRcdFx0Y29uc3QgZmlyc3RIaW50ID0gKGF3YWl0IGdldE5leHRIaW50KG1vZGVsKSkhLnZhbHVlO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcnN0SGludC5zaWduYXR1cmVzWzBdLmxhYmVsLCBmaXJzdFByb3ZpZGVySWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcnN0SGludC5hY3RpdmVTaWduYXR1cmUsIDApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcnN0SGludC5zaWduYXR1cmVzWzBdLnBhcmFtZXRlcnNbMF0ubGFiZWwsIHBhcmFtdGVyTGFiZWwpO1xuXG5cdFx0XHRjb25zdCBzZWNvbmRIaW50ID0gKGF3YWl0IGdldE5leHRIaW50KG1vZGVsKSkhLnZhbHVlO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlY29uZEhpbnQuc2lnbmF0dXJlc1swXS5sYWJlbCwgc2Vjb25kUHJvdmlkZXJJZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vjb25kSGludC5hY3RpdmVTaWduYXR1cmUsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlY29uZEhpbnQuc2lnbmF0dXJlc1swXS5wYXJhbWV0ZXJzWzBdLmxhYmVsLCBwYXJhbXRlckxhYmVsKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnUXVpY2sgdHlwaW5nIHNob3VsZCB1c2UgdGhlIGZpcnN0IHRyaWdnZXIgY2hhcmFjdGVyJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGVkaXRvciA9IGNyZWF0ZU1vY2tFZGl0b3IoJycpO1xuXHRcdGNvbnN0IG1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBQYXJhbWV0ZXJIaW50c01vZGVsKGVkaXRvciwgcmVnaXN0cnksIDUwKSk7XG5cblx0XHRjb25zdCB0cmlnZ2VyQ2hhcmFjdGVyID0gJ2EnO1xuXG5cdFx0bGV0IGludm9rZUNvdW50ID0gMDtcblx0XHRkaXNwb3NhYmxlcy5hZGQocmVnaXN0cnkucmVnaXN0ZXIobW9ja0ZpbGVTZWxlY3RvciwgbmV3IGNsYXNzIGltcGxlbWVudHMgbGFuZ3VhZ2VzLlNpZ25hdHVyZUhlbHBQcm92aWRlciB7XG5cdFx0XHRzaWduYXR1cmVIZWxwVHJpZ2dlckNoYXJhY3RlcnMgPSBbdHJpZ2dlckNoYXJhY3Rlcl07XG5cdFx0XHRzaWduYXR1cmVIZWxwUmV0cmlnZ2VyQ2hhcmFjdGVycyA9IFtdO1xuXG5cdFx0XHRwcm92aWRlU2lnbmF0dXJlSGVscChfbW9kZWw6IElUZXh0TW9kZWwsIF9wb3NpdGlvbjogUG9zaXRpb24sIF90b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4sIGNvbnRleHQ6IGxhbmd1YWdlcy5TaWduYXR1cmVIZWxwQ29udGV4dCk6IGxhbmd1YWdlcy5TaWduYXR1cmVIZWxwUmVzdWx0IHwgUHJvbWlzZTxsYW5ndWFnZXMuU2lnbmF0dXJlSGVscFJlc3VsdD4ge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdCsraW52b2tlQ291bnQ7XG5cblx0XHRcdFx0XHRpZiAoaW52b2tlQ291bnQgPT09IDEpIHtcblx0XHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250ZXh0LnRyaWdnZXJLaW5kLCBsYW5ndWFnZXMuU2lnbmF0dXJlSGVscFRyaWdnZXJLaW5kLlRyaWdnZXJDaGFyYWN0ZXIpO1xuXHRcdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRleHQudHJpZ2dlckNoYXJhY3RlciwgdHJpZ2dlckNoYXJhY3Rlcik7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGFzc2VydC5mYWlsKCdVbmV4cGVjdGVkIGludm9rZScpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHJldHVybiBlbXB0eVNpZ0hlbHBSZXN1bHQ7XG5cdFx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRcdGNvbnNvbGUuZXJyb3IoZXJyKTtcblx0XHRcdFx0XHR0aHJvdyBlcnI7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRhd2FpdCBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRcdGVkaXRvci50cmlnZ2VyKCdrZXlib2FyZCcsIEhhbmRsZXIuVHlwZSwgeyB0ZXh0OiB0cmlnZ2VyQ2hhcmFjdGVyIH0pO1xuXHRcdFx0ZWRpdG9yLnRyaWdnZXIoJ2tleWJvYXJkJywgSGFuZGxlci5UeXBlLCB7IHRleHQ6ICd4JyB9KTtcblxuXHRcdFx0YXdhaXQgZ2V0TmV4dEhpbnQobW9kZWwpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdSZXRyaWdnZXIgd2hpbGUgYSBwZW5kaW5nIHJlc29sdmUgaXMgc3RpbGwgZ29pbmcgb24gc2hvdWxkIHByZXNlcnZlIGxhc3QgYWN0aXZlIHNpZ25hdHVyZSAjOTY3MDInLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBwcm9taXNlOiBkb25lUHJvbWlzZSwgcmVzb2x2ZTogZG9uZSB9ID0gcHJvbWlzZVdpdGhSZXNvbHZlcnM8dm9pZD4oKTtcblxuXHRcdGNvbnN0IGVkaXRvciA9IGNyZWF0ZU1vY2tFZGl0b3IoJycpO1xuXHRcdGNvbnN0IG1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBQYXJhbWV0ZXJIaW50c01vZGVsKGVkaXRvciwgcmVnaXN0cnksIDUwKSk7XG5cblx0XHRjb25zdCB0cmlnZ2VyQ2hhcmFjdGVyID0gJ2EnO1xuXHRcdGNvbnN0IHJldHJpZ2dlckNoYXJhY3RlciA9ICdiJztcblxuXHRcdGxldCBpbnZva2VDb3VudCA9IDA7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHJlZ2lzdHJ5LnJlZ2lzdGVyKG1vY2tGaWxlU2VsZWN0b3IsIG5ldyBjbGFzcyBpbXBsZW1lbnRzIGxhbmd1YWdlcy5TaWduYXR1cmVIZWxwUHJvdmlkZXIge1xuXHRcdFx0c2lnbmF0dXJlSGVscFRyaWdnZXJDaGFyYWN0ZXJzID0gW3RyaWdnZXJDaGFyYWN0ZXJdO1xuXHRcdFx0c2lnbmF0dXJlSGVscFJldHJpZ2dlckNoYXJhY3RlcnMgPSBbcmV0cmlnZ2VyQ2hhcmFjdGVyXTtcblxuXHRcdFx0YXN5bmMgcHJvdmlkZVNpZ25hdHVyZUhlbHAoX21vZGVsOiBJVGV4dE1vZGVsLCBfcG9zaXRpb246IFBvc2l0aW9uLCBfdG9rZW46IENhbmNlbGxhdGlvblRva2VuLCBjb250ZXh0OiBsYW5ndWFnZXMuU2lnbmF0dXJlSGVscENvbnRleHQpOiBQcm9taXNlPGxhbmd1YWdlcy5TaWduYXR1cmVIZWxwUmVzdWx0PiB7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0KytpbnZva2VDb3VudDtcblxuXHRcdFx0XHRcdGlmIChpbnZva2VDb3VudCA9PT0gMSkge1xuXHRcdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRleHQudHJpZ2dlcktpbmQsIGxhbmd1YWdlcy5TaWduYXR1cmVIZWxwVHJpZ2dlcktpbmQuVHJpZ2dlckNoYXJhY3Rlcik7XG5cdFx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udGV4dC50cmlnZ2VyQ2hhcmFjdGVyLCB0cmlnZ2VyQ2hhcmFjdGVyKTtcblx0XHRcdFx0XHRcdHNldFRpbWVvdXQoKCkgPT4gZWRpdG9yLnRyaWdnZXIoJ2tleWJvYXJkJywgSGFuZGxlci5UeXBlLCB7IHRleHQ6IHJldHJpZ2dlckNoYXJhY3RlciB9KSwgNTApO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAoaW52b2tlQ291bnQgPT09IDIpIHtcblx0XHRcdFx0XHRcdC8vIFRyaWdnZXIgYWdhaW4gd2hpbGUgd2Ugd2FpdCBmb3IgcmVzb2x2ZSB0byB0YWtlIHBsYWNlXG5cdFx0XHRcdFx0XHRzZXRUaW1lb3V0KCgpID0+IGVkaXRvci50cmlnZ2VyKCdrZXlib2FyZCcsIEhhbmRsZXIuVHlwZSwgeyB0ZXh0OiByZXRyaWdnZXJDaGFyYWN0ZXIgfSksIDUwKTtcblx0XHRcdFx0XHRcdGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCAxMDAwKSk7XG5cdFx0XHRcdFx0fSBlbHNlIGlmIChpbnZva2VDb3VudCA9PT0gMykge1xuXHRcdFx0XHRcdFx0Ly8gTWFrZSBzdXJlIHRoYXQgaW4gYSByZXRyaWdnZXIgZHVyaW5nIGEgcGVuZGluZyByZXNvbHZlLCB3ZSBzdGlsbCBoYXZlIHRoZSBvbGQgYWN0aXZlIHNpZ25hdHVyZS5cblx0XHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250ZXh0LmFjdGl2ZVNpZ25hdHVyZUhlbHAsIGVtcHR5U2lnSGVscCk7XG5cdFx0XHRcdFx0XHRkb25lKCk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGFzc2VydC5mYWlsKCdVbmV4cGVjdGVkIGludm9rZScpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHJldHVybiBlbXB0eVNpZ0hlbHBSZXN1bHQ7XG5cdFx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRcdGNvbnNvbGUuZXJyb3IoZXJyKTtcblx0XHRcdFx0XHRkb25lKGVycik7XG5cdFx0XHRcdFx0dGhyb3cgZXJyO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0YXdhaXQgcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cblx0XHRcdGVkaXRvci50cmlnZ2VyKCdrZXlib2FyZCcsIEhhbmRsZXIuVHlwZSwgeyB0ZXh0OiB0cmlnZ2VyQ2hhcmFjdGVyIH0pO1xuXG5cdFx0XHRhd2FpdCBnZXROZXh0SGludChtb2RlbCk7XG5cdFx0XHRhd2FpdCBnZXROZXh0SGludChtb2RlbCk7XG5cblx0XHRcdGF3YWl0IGRvbmVQcm9taXNlO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsNEJBQTRCO0FBRXJDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsV0FBVztBQUNwQixTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLCtDQUErQztBQUV4RCxTQUFTLGVBQWU7QUFDeEIsU0FBUywrQkFBK0I7QUFDeEMsWUFBWSxlQUFlO0FBRTNCLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsd0JBQXdCLHVCQUF1QjtBQUN4RCxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLDRCQUE0QjtBQUVyQyxNQUFNLFdBQVcsSUFBSSxNQUFNLG1CQUFtQjtBQUM5QyxNQUFNLG1CQUFtQixFQUFFLFFBQVEsT0FBTztBQUcxQyxNQUFNLGVBQXdDO0FBQUEsRUFDN0MsWUFBWSxDQUFDO0FBQUEsSUFDWixPQUFPO0FBQUEsSUFDUCxZQUFZLENBQUM7QUFBQSxFQUNkLENBQUM7QUFBQSxFQUNELGlCQUFpQjtBQUFBLEVBQ2pCLGlCQUFpQjtBQUNsQjtBQUVBLE1BQU0scUJBQW9EO0FBQUEsRUFDekQsT0FBTztBQUFBLEVBQ1AsU0FBUyxNQUFNO0FBQUEsRUFBRTtBQUNsQjtBQUVBLE1BQU0sdUJBQXVCLE1BQU07QUFDbEMsUUFBTSxjQUFjLElBQUksZ0JBQWdCO0FBQ3hDLE1BQUk7QUFFSixRQUFNLE1BQU07QUFDWCxnQkFBWSxNQUFNO0FBQ2xCLGVBQVcsSUFBSSx3QkFBeUQ7QUFBQSxFQUN6RSxDQUFDO0FBRUQsV0FBUyxNQUFNO0FBQ2QsZ0JBQVksTUFBTTtBQUFBLEVBQ25CLENBQUM7QUFFRCwwQ0FBd0M7QUFFeEMsV0FBUyxpQkFBaUIsY0FBc0I7QUFDL0MsVUFBTSxZQUFZLFlBQVksSUFBSSxnQkFBZ0Is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
