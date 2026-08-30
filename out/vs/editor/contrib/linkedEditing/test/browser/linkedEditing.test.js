import assert from "assert";
import { DisposableStore } from "../../../../../base/common/lifecycle.js";
import { URI } from "../../../../../base/common/uri.js";
import { runWithFakedTimers } from "../../../../../base/test/common/timeTravelScheduler.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { CoreEditingCommands } from "../../../../browser/coreCommands.js";
import { Position } from "../../../../common/core/position.js";
import { Range } from "../../../../common/core/range.js";
import { USUAL_WORD_SEPARATORS } from "../../../../common/core/wordHelper.js";
import { Handler } from "../../../../common/editorCommon.js";
import { ILanguageConfigurationService } from "../../../../common/languages/languageConfigurationRegistry.js";
import { ILanguageFeaturesService } from "../../../../common/services/languageFeatures.js";
import { DeleteAllLeftAction } from "../../../linesOperations/browser/linesOperations.js";
import { LinkedEditingContribution } from "../../browser/linkedEditing.js";
import { DeleteWordLeft } from "../../../wordOperations/browser/wordOperations.js";
import { createCodeEditorServices, instantiateTestCodeEditor } from "../../../../test/browser/testCodeEditor.js";
import { instantiateTextModel } from "../../../../test/common/testTextModel.js";
const mockFile = URI.parse("test:somefile.ttt");
const mockFileSelector = { scheme: "test" };
const timeout = 30;
const languageId = "linkedEditingTestLangage";
suite("linked editing", () => {
  let disposables;
  let instantiationService;
  let languageFeaturesService;
  let languageConfigurationService;
  setup(() => {
    disposables = new DisposableStore();
    instantiationService = createCodeEditorServices(disposables);
    languageFeaturesService = instantiationService.get(ILanguageFeaturesService);
    languageConfigurationService = instantiationService.get(ILanguageConfigurationService);
    disposables.add(languageConfigurationService.register(languageId, {
      wordPattern: /[a-zA-Z]+/
    }));
  });
  teardown(() => {
    disposables.dispose();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  function createMockEditor(text) {
    const model = disposables.add(instantiateTextModel(instantiationService, typeof text === "string" ? text : text.join("\n"), languageId, void 0, mockFile));
    const editor = disposables.add(instantiateTestCodeEditor(instantiationService, model));
    return editor;
  }
  function testCase(name, initialState, operations, expectedEndText) {
    test(name, async () => {
      await runWithFakedTimers({}, async () => {
        disposables.add(languageFeaturesService.linkedEditingRangeProvider.register(mockFileSelector, {
          provideLinkedEditingRanges(model, pos) {
            const wordAtPos = model.getWordAtPosition(pos);
            if (wordAtPos) {
              const matches = model.findMatches(wordAtPos.word, false, false, true, USUAL_WORD_SEPARATORS, false);
              return { ranges: matches.map((m) => m.range), wordPattern: initialState.responseWordPattern };
            }
            return { ranges: [], wordPattern: initialState.responseWordPattern };
          }
        }));
        const editor = createMockEditor(initialState.text);
        editor.updateOptions({ linkedEditing: true });
        const linkedEditingContribution = disposables.add(editor.registerAndInstantiateContribution(
          LinkedEditingContribution.ID,
          LinkedEditingContribution
        ));
        linkedEditingContribution.setDebounceDuration(0);
        const testEditor = {
          setPosition(pos) {
            editor.setPosition(pos);
            return linkedEditingContribution.currentUpdateTriggerPromise;
          },
          setSelection(sel) {
            editor.setSelection(sel);
            return linkedEditingContribution.currentUpdateTriggerPromise;
          },
          trigger(source, handlerId, payload) {
            if (handlerId === Handler.Type || handlerId === Handler.Paste) {
              editor.trigger(source, handlerId, payload);
            } else if (handlerId === "deleteLeft") {
              editor.runCommand(CoreEditingCommands.DeleteLeft, payload);
            } else if (handlerId === "deleteWordLeft") {
              instantiationService.invokeFunction((accessor) => new DeleteWordLeft().runEditorCommand(accessor, editor, payload));
            } else if (handlerId === "deleteAllLeft") {
              instantiationService.invokeFunction((accessor) => new DeleteAllLeftAction().runEditorCommand(accessor, editor, payload));
            } else {
              throw new Error(`Unknown handler ${handlerId}!`);
            }
            return linkedEditingContribution.currentSyncTriggerPromise;
          },
          undo() {
            editor.runCommand(CoreEditingCommands.Undo, null);
          },
          redo() {
            editor.runCommand(CoreEditingCommands.Redo, null);
          }
        };
        await operations(testEditor);
        return new Promise((resolve) => {
          setTimeout(() => {
            if (typeof expectedEndText === "string") {
              assert.strictEqual(editor.getModel().getValue(), expectedEndText);
            } else {
              assert.strictEqual(editor.getModel().getValue(), expectedEndText.join("\n"));
            }
            resolve();
          }, timeout);
        });
      });
    });
  }
  const state = {
    text: "<ooo></ooo>"
  };
  testCase("Simple insert - initial", state, async (editor) => {
    const pos = new Position(1, 2);
    await editor.setPosition(pos);
    await editor.trigger("keyboard", Handler.Type, { text: "i" });
  }, "<iooo></iooo>");
  testCase("Simple insert - middle", state, async (editor) => {
    const pos = new Position(1, 3);
    await editor.setPosition(pos);
    await editor.trigger("keyboard", Handler.Type, { text: "i" });
  }, "<oioo></oioo>");
  testCase("Simple insert - end", state, async (editor) => {
    const pos = new Position(1, 5);
    await editor.setPosition(pos);
    await editor.trigger("keyboard", Handler.Type, { text: "i" });
  }, "<oooi></oooi>");
  testCase("Simple insert end - initial", state, async (editor) => {
    const pos = new Position(1, 8);
    await editor.setPosition(pos);
    await editor.trigger("keyboard", Handler.Type, { text: "i" });
  }, "<iooo></iooo>");
  testCase("Simple insert end - middle", state, async (editor) => {
    const pos = new Position(1, 9);
    await editor.setPosition(pos);
    await editor.trigger("keyboard", Handler.Type, { text: "i" });
  }, "<oioo></oioo>");
  testCase("Simple insert end - end", state, async (editor) => {
    const pos = new Position(1, 11);
    await editor.setPosition(pos);
    await editor.trigger("keyboard", Handler.Type, { text: "i" });
  }, "<oooi></oooi>");
  testCase("Simple insert - out of boundary", state, async (editor) => {
    const pos = new Position(1, 1);
    await editor.setPosition(pos);
    await editor.trigger("keyboard", Handler.Type, { text: "i" });
  }, "i<ooo></ooo>");
  testCase("Simple insert - out of boundary 2", state, async (editor) => {
    const pos = new Position(1, 6);
    await editor.setPosition(pos);
    await editor.trigger("keyboard", Handler.Type, { text: "i" });
  }, "<ooo>i</ooo>");
  testCase("Simple insert - out of boundary 3", state, async (editor) => {
    const pos = new Position(1, 7);
    await editor.setPosition(pos);
    await editor.trigger("keyboard", Handler.Type, { text: "i" });
  }, "<ooo><i/ooo>");
  testCase("Simple insert - out of boundary 4", state, async (editor) => {
    const pos = new Position(1, 12);
    await editor.setPosition(pos);
    await editor.trigger("keyboard", Handler.Type, { text: "i" });
  }, "<ooo></ooo>i");
  testCase("Continuous insert", state, async (editor) => {
    const pos = new Position(1, 2);
    await editor.setPosition(pos);
    await editor.trigger("keyboard", Handler.Type, { text: "i" });
    await editor.trigger("keyboard", Handler.Type, { text: "i" });
  }, "<iiooo></iiooo>");
  testCase("Insert - move - insert", state, async (editor) => {
    const pos = new Position(1, 2);
    await editor.setPosition(pos);
    await editor.trigger("keyboard", Handler.Type, { text: "i" });
    await editor.setPosition(new Position(1, 4));
    await editor.trigger("keyboard", Handler.Type, { text: "i" });
  }, "<ioioo></ioioo>");
  testCase("Insert - move - insert outside region", state, async (editor) => {
    const pos = new Position(1, 2);
    await editor.setPosition(pos);
    await editor.trigger("keyboard", Handler.Type, { text: "i" });
    await editor.setPosition(new Position(1, 7));
    await editor.trigger("keyboard", Handler.Type, { text: "i" });
  }, "<iooo>i</iooo>");
  testCase("Selection insert - simple", state, async (editor) => {
    const pos = new Position(1, 2);
    await editor.setPosition(pos);
    await editor.setSelection(new Range(1, 2, 1, 3));
    await editor.trigger("keyboard", Handler.Type, { text: "i" });
  }, "<ioo></ioo>");
  testCase("Selection insert - whole", state, async (editor) => {
    const pos = new Position(1, 2);
    await editor.setPosition(pos);
    await editor.setSelection(new Range(1, 2, 1, 5));
    await editor.trigger("keyboard", Handler.Type, { text: "i" });
  }, "<i></i>");
  testCase("Selection insert - across boundary", state, async (editor) => {
    const pos = new Position(1, 2);
    await editor.setPosition(pos);
    await editor.setSelection(new Range(1, 1, 1, 3));
    await editor.trigger("keyboard", Handler.Type, { text: "i" });
  }, "ioo></oo>");
  testCase("Breakout - type space", state, async (editor) => {
    const pos = new Position(1, 5);
    await editor.setPosition(pos);
    await editor.trigger("keyboard", Handler.Type, { text: " " });
  }, "<ooo ></ooo>");
  testCase("Breakout - type space then undo", state, async (editor) => {
    const pos = new Position(1, 5);
    await editor.setPosition(pos);
    await editor.trigger("keyboard", Handler.Type, { text: " " });
    editor.undo();
  }, "<ooo></ooo>");
  testCase("Breakout - type space in middle", state, async (editor) => {
    const pos = new Position(1, 4);
    await editor.setPosition(pos);
    await editor.trigger("keyboard", Handler.Type, { text: " " });
  }, "<oo o></ooo>");
  testCase("Breakout - paste content starting with space", state, async (editor) => {
    const pos = new Position(1, 5);
    await editor.setPosition(pos);
    await editor.trigger("keyboard", Handler.Paste, { text: ' i="i"' });
  }, '<ooo i="i"></ooo>');
  testCase("Breakout - paste content starting with space then undo", state, async (editor) => {
    const pos = new Position(1, 5);
    await editor.setPosition(pos);
    await editor.trigger("keyboard", Handler.Paste, { text: ' i="i"' });
    editor.undo();
  }, "<ooo></ooo>");
  testCase("Breakout - paste content starting with space in middle", state, async (editor) => {
    const pos = new Position(1, 4);
    await editor.setPosition(pos);
    await editor.trigger("keyboard", Handler.Paste, { text: " i" });
  }, "<oo io></ooo>");
  const state3 = {
    ...state,
    responseWordPattern: /[a-yA-Y]+/
  };
  testCase("Breakout with stop pattern - insert", state3, async (editor) => {
    const pos = new Position(1, 2);
    await editor.setPosition(pos);
    await editor.trigger("keyboard", Handler.Type, { text: "i" });
  }, "<iooo></iooo>");
  testCase("Breakout with stop pattern - insert stop char", state3, async (editor) => {
    const pos = new Position(1, 2);
    await editor.setPosition(pos);
    await editor.trigger("keyboard", Handler.Type, { text: "z" });
  }, "<zooo></ooo>");
  testCase("Breakout with stop pattern - paste char", state3, async (editor) => {
    const pos = new Position(1, 2);
    await editor.setPosition(pos);
    await editor.trigger("keyboard", Handler.Paste, { text: "z" });
  }, "<zooo></ooo>");
  testCase("Breakout with stop pattern - paste string", state3, async (editor) => {
    const pos = new Position(1, 2);
    await editor.setPosition(pos);
    await editor.trigger("keyboard", Handler.Paste, { text: "zo" });
  }, "<zoooo></ooo>");
  testCase("Breakout with stop pattern - insert at end", state3, async (editor) => {
    const pos = new Position(1, 5);
    await editor.setPosition(pos);
    await editor.trigger("keyboard", Handler.Type, { text: "z" });
  }, "<oooz></ooo>");
  const state4 = {
    ...state,
    responseWordPattern: /[a-eA-E]+/
  };
  testCase("Breakout with stop pattern - insert stop char, respos", state4, async (editor) => {
    const pos = new Position(1, 2);
    await editor.setPosition(pos);
    await editor.trigger("keyboard", Handler.Type, { text: "i" });
  }, "<iooo></ooo>");
  testCase("Delete - left char", state, async (editor) => {
    const pos = new Position(1, 5);
    await editor.setPosition(pos);
    await editor.trigger("keyboard", "deleteLeft", {});
  }, "<oo></oo>");
  testCase("Delete - left char then undo", state, async (editor) => {
    const pos = new Position(1, 5);
    await editor.setPosition(pos);
    await editor.trigger("keyboard", "deleteLeft", {});
    editor.undo();
  }, "<ooo></ooo>");
  testCase("Delete - left word", state, async (editor) => {
    const pos = new Position(1, 5);
    await editor.setPosition(pos);
    await editor.trigger("keyboard", "deleteWordLeft", {});
  }, "<></>");
  testCase("Delete - left word then undo", state, async (editor) => {
    const pos = new Position(1, 5);
    await editor.setPosition(pos);
    await editor.trigger("keyboard", "deleteWordLeft", {});
    editor.undo();
    editor.undo();
  }, "<ooo></ooo>");
  testCase("Delete - left all then undo twice", state, async (editor) => {
    const pos = new Position(1, 5);
    await editor.setPosition(pos);
    await editor.trigger("keyboard", "deleteAllLeft", {});
    editor.undo();
    editor.undo();
  }, "<ooo></ooo>");
  testCase("Delete - selection", state, async (editor) => {
    const pos = new Position(1, 5);
    await editor.setPosition(pos);
    await editor.setSelection(new Range(1, 2, 1, 3));
    await editor.trigger("keyboard", "deleteLeft", {});
  }, "<oo></oo>");
  testCase("Delete - selection across boundary", state, async (editor) => {
    const pos = new Position(1, 3);
    await editor.setPosition(pos);
    await editor.setSelection(new Range(1, 1, 1, 3));
    await editor.trigger("keyboard", "deleteLeft", {});
  }, "oo></oo>");
  testCase("Undo/redo - simple undo", state, async (editor) => {
    const pos = new Position(1, 2);
    await editor.setPosition(pos);
    await editor.trigger("keyboard", Handler.Type, { text: "i" });
    editor.undo();
    editor.undo();
  }, "<ooo></ooo>");
  testCase("Undo/redo - simple undo/redo", state, async (editor) => {
    const pos = new Position(1, 2);
    await editor.setPosition(pos);
    await editor.trigger("keyboard", Handler.Type, { text: "i" });
    editor.undo();
    editor.redo();
  }, "<iooo></iooo>");
  const state2 = {
    text: [
      "<ooo>",
      "</ooo>"
    ]
  };
  testCase("Multiline insert", state2, async (editor) => {
    const pos = new Position(1, 2);
    await editor.setPosition(pos);
    await editor.trigger("keyboard", Handler.Type, { text: "i" });
  }, [
    "<iooo>",
    "</iooo>"
  ]);
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXGxpbmtlZEVkaXRpbmdcXHRlc3RcXGJyb3dzZXJcXGxpbmtlZEVkaXRpbmcudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgcnVuV2l0aEZha2VkVGltZXJzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi90aW1lVHJhdmVsU2NoZWR1bGVyLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgQ29yZUVkaXRpbmdDb21tYW5kcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvY29yZUNvbW1hbmRzLmpzJztcbmltcG9ydCB7IElQb3NpdGlvbiwgUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBJUmFuZ2UsIFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgVVNVQUxfV09SRF9TRVBBUkFUT1JTIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NvcmUvd29yZEhlbHBlci5qcyc7XG5pbXBvcnQgeyBIYW5kbGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2VkaXRvckNvbW1vbi5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2VDb25maWd1cmF0aW9uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vc2VydmljZXMvbGFuZ3VhZ2VGZWF0dXJlcy5qcyc7XG5pbXBvcnQgeyBEZWxldGVBbGxMZWZ0QWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vbGluZXNPcGVyYXRpb25zL2Jyb3dzZXIvbGluZXNPcGVyYXRpb25zLmpzJztcbmltcG9ydCB7IExpbmtlZEVkaXRpbmdDb250cmlidXRpb24gfSBmcm9tICcuLi8uLi9icm93c2VyL2xpbmtlZEVkaXRpbmcuanMnO1xuaW1wb3J0IHsgRGVsZXRlV29yZExlZnQgfSBmcm9tICcuLi8uLi8uLi93b3JkT3BlcmF0aW9ucy9icm93c2VyL3dvcmRPcGVyYXRpb25zLmpzJztcbmltcG9ydCB7IElUZXN0Q29kZUVkaXRvciwgY3JlYXRlQ29kZUVkaXRvclNlcnZpY2VzLCBpbnN0YW50aWF0ZVRlc3RDb2RlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vdGVzdC9icm93c2VyL3Rlc3RDb2RlRWRpdG9yLmpzJztcbmltcG9ydCB7IGluc3RhbnRpYXRlVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vdGVzdC9jb21tb24vdGVzdFRleHRNb2RlbC5qcyc7XG5pbXBvcnQgeyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL3Rlc3QvY29tbW9uL2luc3RhbnRpYXRpb25TZXJ2aWNlTW9jay5qcyc7XG5cbmNvbnN0IG1vY2tGaWxlID0gVVJJLnBhcnNlKCd0ZXN0OnNvbWVmaWxlLnR0dCcpO1xuY29uc3QgbW9ja0ZpbGVTZWxlY3RvciA9IHsgc2NoZW1lOiAndGVzdCcgfTtcbmNvbnN0IHRpbWVvdXQgPSAzMDtcblxuaW50ZXJmYWNlIFRlc3RFZGl0b3Ige1xuXHRzZXRQb3NpdGlvbihwb3M6IFBvc2l0aW9uKTogUHJvbWlzZTxhbnk+O1xuXHRzZXRTZWxlY3Rpb24oc2VsOiBJUmFuZ2UpOiBQcm9taXNlPGFueT47XG5cdHRyaWdnZXIoc291cmNlOiBzdHJpbmcgfCBudWxsIHwgdW5kZWZpbmVkLCBoYW5kbGVySWQ6IHN0cmluZywgcGF5bG9hZDogYW55KTogUHJvbWlzZTxhbnk+O1xuXHR1bmRvKCk6IHZvaWQ7XG5cdHJlZG8oKTogdm9pZDtcbn1cblxuY29uc3QgbGFuZ3VhZ2VJZCA9ICdsaW5rZWRFZGl0aW5nVGVzdExhbmdhZ2UnO1xuXG5zdWl0ZSgnbGlua2VkIGVkaXRpbmcnLCAoKSA9PiB7XG5cdGxldCBkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlO1xuXHRsZXQgaW5zdGFudGlhdGlvblNlcnZpY2U6IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZTtcblx0bGV0IGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlOiBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2U7XG5cdGxldCBsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZTtcblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0ZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2UgPSBjcmVhdGVDb2RlRWRpdG9yU2VydmljZXMoZGlzcG9zYWJsZXMpO1xuXHRcdGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlID0gaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSk7XG5cdFx0bGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSk7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQobGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZS5yZWdpc3RlcihsYW5ndWFnZUlkLCB7XG5cdFx0XHR3b3JkUGF0dGVybjogL1thLXpBLVpdKy9cblx0XHR9KSk7XG5cdH0pO1xuXG5cdHRlYXJkb3duKCgpID0+IHtcblx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGZ1bmN0aW9uIGNyZWF0ZU1vY2tFZGl0b3IodGV4dDogc3RyaW5nIHwgc3RyaW5nW10pOiBJVGVzdENvZGVFZGl0b3Ige1xuXHRcdGNvbnN0IG1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRlVGV4dE1vZGVsKGluc3RhbnRpYXRpb25TZXJ2aWNlLCB0eXBlb2YgdGV4dCA9PT0gJ3N0cmluZycgPyB0ZXh0IDogdGV4dC5qb2luKCdcXG4nKSwgbGFuZ3VhZ2VJZCwgdW5kZWZpbmVkLCBtb2NrRmlsZSkpO1xuXHRcdGNvbnN0IGVkaXRvciA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0ZVRlc3RDb2RlRWRpdG9yKGluc3RhbnRpYXRpb25TZXJ2aWNlLCBtb2RlbCkpO1xuXHRcdHJldHVybiBlZGl0b3I7XG5cdH1cblxuXHRmdW5jdGlvbiB0ZXN0Q2FzZShcblx0XHRuYW1lOiBzdHJpbmcsXG5cdFx0aW5pdGlhbFN0YXRlOiB7IHRleHQ6IHN0cmluZyB8IHN0cmluZ1tdOyByZXNwb25zZVdvcmRQYXR0ZXJuPzogUmVnRXhwIH0sXG5cdFx0b3BlcmF0aW9uczogKGVkaXRvcjogVGVzdEVkaXRvcikgPT4gUHJvbWlzZTx2b2lkPixcblx0XHRleHBlY3RlZEVuZFRleHQ6IHN0cmluZyB8IHN0cmluZ1tdXG5cdCkge1xuXHRcdHRlc3QobmFtZSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0YXdhaXQgcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyAoKSA9PiB7XG5cblx0XHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmxpbmtlZEVkaXRpbmdSYW5nZVByb3ZpZGVyLnJlZ2lzdGVyKG1vY2tGaWxlU2VsZWN0b3IsIHtcblx0XHRcdFx0XHRwcm92aWRlTGlua2VkRWRpdGluZ1Jhbmdlcyhtb2RlbDogSVRleHRNb2RlbCwgcG9zOiBJUG9zaXRpb24pIHtcblx0XHRcdFx0XHRcdGNvbnN0IHdvcmRBdFBvcyA9IG1vZGVsLmdldFdvcmRBdFBvc2l0aW9uKHBvcyk7XG5cdFx0XHRcdFx0XHRpZiAod29yZEF0UG9zKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IG1hdGNoZXMgPSBtb2RlbC5maW5kTWF0Y2hlcyh3b3JkQXRQb3Mud29yZCwgZmFsc2UsIGZhbHNlLCB0cnVlLCBVU1VBTF9XT1JEX1NFUEFSQVRPUlMsIGZhbHNlKTtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIHsgcmFuZ2VzOiBtYXRjaGVzLm1hcChtID0+IG0ucmFuZ2UpLCB3b3JkUGF0dGVybjogaW5pdGlhbFN0YXRlLnJlc3BvbnNlV29yZFBhdHRlcm4gfTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdHJldHVybiB7IHJhbmdlczogW10sIHdvcmRQYXR0ZXJuOiBpbml0aWFsU3RhdGUucmVzcG9uc2VXb3JkUGF0dGVybiB9O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSkpO1xuXG5cdFx0XHRcdGNvbnN0IGVkaXRvciA9IGNyZWF0ZU1vY2tFZGl0b3IoaW5pdGlhbFN0YXRlLnRleHQpO1xuXHRcdFx0XHRlZGl0b3IudXBkYXRlT3B0aW9ucyh7IGxpbmtlZEVkaXRpbmc6IHRydWUgfSk7XG5cdFx0XHRcdGNvbnN0IGxpbmtlZEVkaXRpbmdDb250cmlidXRpb24gPSBkaXNwb3NhYmxlcy5hZGQoZWRpdG9yLnJlZ2lzdGVyQW5kSW5zdGFudGlhdGVDb250cmlidXRpb24oXG5cdFx0XHRcdFx0TGlua2VkRWRpdGluZ0NvbnRyaWJ1dGlvbi5JRCxcblx0XHRcdFx0XHRMaW5rZWRFZGl0aW5nQ29udHJpYnV0aW9uLFxuXHRcdFx0XHQpKTtcblx0XHRcdFx0bGlua2VkRWRpdGluZ0NvbnRyaWJ1dGlvbi5zZXREZWJvdW5jZUR1cmF0aW9uKDApO1xuXG5cdFx0XHRcdGNvbnN0IHRlc3RFZGl0b3I6IFRlc3RFZGl0b3IgPSB7XG5cdFx0XHRcdFx0c2V0UG9zaXRpb24ocG9zOiBQb3NpdGlvbikge1xuXHRcdFx0XHRcdFx0ZWRpdG9yLnNldFBvc2l0aW9uKHBvcyk7XG5cdFx0XHRcdFx0XHRyZXR1cm4gbGlua2VkRWRpdGluZ0NvbnRyaWJ1dGlvbi5jdXJyZW50VXBkYXRlVHJpZ2dlclByb21pc2U7XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRzZXRTZWxlY3Rpb24oc2VsOiBJUmFuZ2UpIHtcblx0XHRcdFx0XHRcdGVkaXRvci5zZXRTZWxlY3Rpb24oc2VsKTtcblx0XHRcdFx0XHRcdHJldHVybiBsaW5rZWRFZGl0aW5nQ29udHJpYnV0aW9uLmN1cnJlbnRVcGRhdGVUcmlnZ2VyUHJvbWlzZTtcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHRyaWdnZXIoc291cmNlOiBzdHJpbmcgfCBudWxsIHwgdW5kZWZpbmVkLCBoYW5kbGVySWQ6IHN0cmluZywgcGF5bG9hZDogYW55KSB7XG5cdFx0XHRcdFx0XHRpZiAoaGFuZGxlcklkID09PSBIYW5kbGVyLlR5cGUgfHwgaGFuZGxlcklkID09PSBIYW5kbGVyLlBhc3RlKSB7XG5cdFx0XHRcdFx0XHRcdGVkaXRvci50cmlnZ2VyKHNvdXJjZSwgaGFuZGxlcklkLCBwYXlsb2FkKTtcblx0XHRcdFx0XHRcdH0gZWxzZSBpZiAoaGFuZGxlcklkID09PSAnZGVsZXRlTGVmdCcpIHtcblx0XHRcdFx0XHRcdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZUVkaXRpbmdDb21tYW5kcy5EZWxldGVMZWZ0LCBwYXlsb2FkKTtcblx0XHRcdFx0XHRcdH0gZWxzZSBpZiAoaGFuZGxlcklkID09PSAnZGVsZXRlV29yZExlZnQnKSB7XG5cdFx0XHRcdFx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKChhY2Nlc3NvcikgPT4gKG5ldyBEZWxldGVXb3JkTGVmdCgpKS5ydW5FZGl0b3JDb21tYW5kKGFjY2Vzc29yLCBlZGl0b3IsIHBheWxvYWQpKTtcblx0XHRcdFx0XHRcdH0gZWxzZSBpZiAoaGFuZGxlcklkID09PSAnZGVsZXRlQWxsTGVmdCcpIHtcblx0XHRcdFx0XHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oKGFjY2Vzc29yKSA9PiAobmV3IERlbGV0ZUFsbExlZnRBY3Rpb24oKSkucnVuRWRpdG9yQ29tbWFuZChhY2Nlc3NvciwgZWRpdG9yLCBwYXlsb2FkKSk7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFVua25vd24gaGFuZGxlciAke2hhbmRsZXJJZH0hYCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRyZXR1cm4gbGlua2VkRWRpdGluZ0NvbnRyaWJ1dGlvbi5jdXJyZW50U3luY1RyaWdnZXJQcm9taXNlO1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0dW5kbygpIHtcblx0XHRcdFx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuVW5kbywgbnVsbCk7XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRyZWRvKCkge1xuXHRcdFx0XHRcdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZUVkaXRpbmdDb21tYW5kcy5SZWRvLCBudWxsKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH07XG5cblx0XHRcdFx0YXdhaXQgb3BlcmF0aW9ucyh0ZXN0RWRpdG9yKTtcblxuXHRcdFx0XHRyZXR1cm4gbmV3IFByb21pc2U8dm9pZD4oKHJlc29sdmUpID0+IHtcblx0XHRcdFx0XHRzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdFx0XHRcdGlmICh0eXBlb2YgZXhwZWN0ZWRFbmRUZXh0ID09PSAnc3RyaW5nJykge1xuXHRcdFx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWRpdG9yLmdldE1vZGVsKCkhLmdldFZhbHVlKCksIGV4cGVjdGVkRW5kVGV4dCk7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWRpdG9yLmdldE1vZGVsKCkhLmdldFZhbHVlKCksIGV4cGVjdGVkRW5kVGV4dC5qb2luKCdcXG4nKSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRyZXNvbHZlKCk7XG5cdFx0XHRcdFx0fSwgdGltZW91dCk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH1cblxuXHRjb25zdCBzdGF0ZSA9IHtcblx0XHR0ZXh0OiAnPG9vbz48L29vbz4nXG5cdH07XG5cblx0LyoqXG5cdCAqIFNpbXBsZSBpbnNlcnRpb25cblx0ICovXG5cdHRlc3RDYXNlKCdTaW1wbGUgaW5zZXJ0IC0gaW5pdGlhbCcsIHN0YXRlLCBhc3luYyAoZWRpdG9yKSA9PiB7XG5cdFx0Y29uc3QgcG9zID0gbmV3IFBvc2l0aW9uKDEsIDIpO1xuXHRcdGF3YWl0IGVkaXRvci5zZXRQb3NpdGlvbihwb3MpO1xuXHRcdGF3YWl0IGVkaXRvci50cmlnZ2VyKCdrZXlib2FyZCcsIEhhbmRsZXIuVHlwZSwgeyB0ZXh0OiAnaScgfSk7XG5cdH0sICc8aW9vbz48L2lvb28+Jyk7XG5cblx0dGVzdENhc2UoJ1NpbXBsZSBpbnNlcnQgLSBtaWRkbGUnLCBzdGF0ZSwgYXN5bmMgKGVkaXRvcikgPT4ge1xuXHRcdGNvbnN0IHBvcyA9IG5ldyBQb3NpdGlvbigxLCAzKTtcblx0XHRhd2FpdCBlZGl0b3Iuc2V0UG9zaXRpb24ocG9zKTtcblx0XHRhd2FpdCBlZGl0b3IudHJpZ2dlcigna2V5Ym9hcmQnLCBIYW5kbGVyLlR5cGUsIHsgdGV4dDogJ2knIH0pO1xuXHR9LCAnPG9pb28+PC9vaW9vPicpO1xuXG5cdHRlc3RDYXNlKCdTaW1wbGUgaW5zZXJ0IC0gZW5kJywgc3RhdGUsIGFzeW5jIChlZGl0b3IpID0+IHtcblx0XHRjb25zdCBwb3MgPSBuZXcgUG9zaXRpb24oMSwgNSk7XG5cdFx0YXdhaXQgZWRpdG9yLnNldFBvc2l0aW9uKHBvcyk7XG5cdFx0YXdhaXQgZWRpdG9yLnRyaWdnZXIoJ2tleWJvYXJkJywgSGFuZGxlci5UeXBlLCB7IHRleHQ6ICdpJyB9KTtcblx0fSwgJzxvb29pPjwvb29vaT4nKTtcblxuXHQvKipcblx0ICogU2ltcGxlIGluc2VydGlvbiAtIGVuZFxuXHQgKi9cblx0dGVzdENhc2UoJ1NpbXBsZSBpbnNlcnQgZW5kIC0gaW5pdGlhbCcsIHN0YXRlLCBhc3luYyAoZWRpdG9yKSA9PiB7XG5cdFx0Y29uc3QgcG9zID0gbmV3IFBvc2l0aW9uKDEsIDgpO1xuXHRcdGF3YWl0IGVkaXRvci5zZXRQb3NpdGlvbihwb3MpO1xuXHRcdGF3YWl0IGVkaXRvci50cmlnZ2VyKCdrZXlib2FyZCcsIEhhbmRsZXIuVHlwZSwgeyB0ZXh0OiAnaScgfSk7XG5cdH0sICc8aW9vbz48L2lvb28+Jyk7XG5cblx0dGVzdENhc2UoJ1NpbXBsZSBpbnNlcnQgZW5kIC0gbWlkZGxlJywgc3RhdGUsIGFzeW5jIChlZGl0b3IpID0+IHtcblx0XHRjb25zdCBwb3MgPSBuZXcgUG9zaXRpb24oMSwgOSk7XG5cdFx0YXdhaXQgZWRpdG9yLnNldFBvc2l0aW9uKHBvcyk7XG5cdFx0YXdhaXQgZWRpdG9yLnRyaWdnZXIoJ2tleWJvYXJkJywgSGFuZGxlci5UeXBlLCB7IHRleHQ6ICdpJyB9KTtcblx0fSwgJzxvaW9vPjwvb2lvbz4nKTtcblxuXHR0ZXN0Q2FzZSgnU2ltcGxlIGluc2VydCBlbmQgLSBlbmQnLCBzdGF0ZSwgYXN5bmMgKGVkaXRvcikgPT4ge1xuXHRcdGNvbnN0IHBvcyA9IG5ldyBQb3NpdGlvbigxLCAxMSk7XG5cdFx0YXdhaXQgZWRpdG9yLnNldFBvc2l0aW9uKHBvcyk7XG5cdFx0YXdhaXQgZWRpdG9yLnRyaWdnZXIoJ2tleWJvYXJkJywgSGFuZGxlci5UeXBlLCB7IHRleHQ6ICdpJyB9KTtcblx0fSwgJzxvb29pPjwvb29vaT4nKTtcblxuXHQvKipcblx0ICogQm91bmRhcnkgaW5zZXJ0aW9uXG5cdCAqL1xuXHR0ZXN0Q2FzZSgnU2ltcGxlIGluc2VydCAtIG91dCBvZiBib3VuZGFyeScsIHN0YXRlLCBhc3luYyAoZWRpdG9yKSA9PiB7XG5cdFx0Y29uc3QgcG9zID0gbmV3IFBvc2l0aW9uKDEsIDEpO1xuXHRcdGF3YWl0IGVkaXRvci5zZXRQb3NpdGlvbihwb3MpO1xuXHRcdGF3YWl0IGVkaXRvci50cmlnZ2VyKCdrZXlib2FyZCcsIEhhbmRsZXIuVHlwZSwgeyB0ZXh0OiAnaScgfSk7XG5cdH0sICdpPG9vbz48L29vbz4nKTtcblxuXHR0ZXN0Q2FzZSgnU2ltcGxlIGluc2VydCAtIG91dCBvZiBib3VuZGFyeSAyJywgc3RhdGUsIGFzeW5jIChlZGl0b3IpID0+IHtcblx0XHRjb25zdCBwb3MgPSBuZXcgUG9zaXRpb24oMSwgNik7XG5cdFx0YXdhaXQgZWRpdG9yLnNldFBvc2l0aW9uKHBvcyk7XG5cdFx0YXdhaXQgZWRpdG9yLnRyaWdnZXIoJ2tleWJvYXJkJywgSGFuZGxlci5UeXBlLCB7IHRleHQ6ICdpJyB9KTtcblx0fSwgJzxvb28+aTwvb29vPicpO1xuXG5cdHRlc3RDYXNlKCdTaW1wbGUgaW5zZXJ0IC0gb3V0IG9mIGJvdW5kYXJ5IDMnLCBzdGF0ZSwgYXN5bmMgKGVkaXRvcikgPT4ge1xuXHRcdGNvbnN0IHBvcyA9IG5ldyBQb3NpdGlvbigxLCA3KTtcblx0XHRhd2FpdCBlZGl0b3Iuc2V0UG9zaXRpb24ocG9zKTtcblx0XHRhd2FpdCBlZGl0b3IudHJpZ2dlcigna2V5Ym9hcmQnLCBIYW5kbGVyLlR5cGUsIHsgdGV4dDogJ2knIH0pO1xuXHR9LCAnPG9vbz48aS9vb28+Jyk7XG5cblx0dGVzdENhc2UoJ1NpbXBsZSBpbnNlcnQgLSBvdXQgb2YgYm91bmRhcnkgNCcsIHN0YXRlLCBhc3luYyAoZWRpdG9yKSA9PiB7XG5cdFx0Y29uc3QgcG9zID0gbmV3IFBvc2l0aW9uKDEsIDEyKTtcblx0XHRhd2FpdCBlZGl0b3Iuc2V0UG9zaXRpb24ocG9zKTtcblx0XHRhd2FpdCBlZGl0b3IudHJpZ2dlcigna2V5Ym9hcmQnLCBIYW5kbGVyLlR5cGUsIHsgdGV4dDogJ2knIH0pO1xuXHR9LCAnPG9vbz48L29vbz5pJyk7XG5cblx0LyoqXG5cdCAqIEluc2VydCArIE1vdmVcblx0ICovXG5cdHRlc3RDYXNlKCdDb250aW51b3VzIGluc2VydCcsIHN0YXRlLCBhc3luYyAoZWRpdG9yKSA9PiB7XG5cdFx0Y29uc3QgcG9zID0gbmV3IFBvc2l0aW9uKDEsIDIpO1xuXHRcdGF3YWl0IGVkaXRvci5zZXRQb3NpdGlvbihwb3MpO1xuXHRcdGF3YWl0IGVkaXRvci50cmlnZ2VyKCdrZXlib2FyZCcsIEhhbmRsZXIuVHlwZSwgeyB0ZXh0OiAnaScgfSk7XG5cdFx0YXdhaXQgZWRpdG9yLnRyaWdnZXIoJ2tleWJvYXJkJywgSGFuZGxlci5UeXBlLCB7IHRleHQ6ICdpJyB9KTtcblx0fSwgJzxpaW9vbz48L2lpb29vPicpO1xuXG5cdHRlc3RDYXNlKCdJbnNlcnQgLSBtb3ZlIC0gaW5zZXJ0Jywgc3RhdGUsIGFzeW5jIChlZGl0b3IpID0+IHtcblx0XHRjb25zdCBwb3MgPSBuZXcgUG9zaXRpb24oMSwgMik7XG5cdFx0YXdhaXQgZWRpdG9yLnNldFBvc2l0aW9uKHBvcyk7XG5cdFx0YXdhaXQgZWRpdG9yLnRyaWdnZXIoJ2tleWJvYXJkJywgSGFuZGxlci5UeXBlLCB7IHRleHQ6ICdpJyB9KTtcblx0XHRhd2FpdCBlZGl0b3Iuc2V0UG9zaXRpb24obmV3IFBvc2l0aW9uKDEsIDQpKTtcblx0XHRhd2FpdCBlZGl0b3IudHJpZ2dlcigna2V5Ym9hcmQnLCBIYW5kbGVyLlR5cGUsIHsgdGV4dDogJ2knIH0pO1xuXHR9LCAnPGlvaW9vPjwvaW9pb28+Jyk7XG5cblx0dGVzdENhc2UoJ0luc2VydCAtIG1vdmUgLSBpbnNlcnQgb3V0c2lkZSByZWdpb24nLCBzdGF0ZSwgYXN5bmMgKGVkaXRvcikgPT4ge1xuXHRcdGNvbnN0IHBvcyA9IG5ldyBQb3NpdGlvbigxLCAyKTtcblx0XHRhd2FpdCBlZGl0b3Iuc2V0UG9zaXRpb24ocG9zKTtcblx0XHRhd2FpdCBlZGl0b3IudHJpZ2dlcigna2V5Ym9hcmQnLCBIYW5kbGVyLlR5cGUsIHsgdGV4dDogJ2knIH0pO1xuXHRcdGF3YWl0IGVkaXRvci5zZXRQb3NpdGlvbihuZXcgUG9zaXRpb24oMSwgNykpO1xuXHRcdGF3YWl0IGVkaXRvci50cmlnZ2VyKCdrZXlib2FyZCcsIEhhbmRsZXIuVHlwZSwgeyB0ZXh0OiAnaScgfSk7XG5cdH0sICc8aW9vbz5pPC9pb29vPicpO1xuXG5cdC8qKlxuXHQgKiBTZWxlY3Rpb24gaW5zZXJ0XG5cdCAqL1xuXHR0ZXN0Q2FzZSgnU2VsZWN0aW9uIGluc2VydCAtIHNpbXBsZScsIHN0YXRlLCBhc3luYyAoZWRpdG9yKSA9PiB7XG5cdFx0Y29uc3QgcG9zID0gbmV3IFBvc2l0aW9uKDEsIDIpO1xuXHRcdGF3YWl0IGVkaXRvci5zZXRQb3NpdGlvbihwb3MpO1xuXHRcdGF3YWl0IGVkaXRvci5zZXRTZWxlY3Rpb24obmV3IFJhbmdlKDEsIDIsIDEsIDMpKTtcblx0XHRhd2FpdCBlZGl0b3IudHJpZ2dlcigna2V5Ym9hcmQnLCBIYW5kbGVyLlR5cGUsIHsgdGV4dDogJ2knIH0pO1xuXHR9LCAnPGlvbz48L2lvbz4nKTtcblxuXHR0ZXN0Q2FzZSgnU2VsZWN0aW9uIGluc2VydCAtIHdob2xlJywgc3RhdGUsIGFzeW5jIChlZGl0b3IpID0+IHtcblx0XHRjb25zdCBwb3MgPSBuZXcgUG9zaXRpb24oMSwgMik7XG5cdFx0YXdhaXQgZWRpdG9yLnNldFBvc2l0aW9uKHBvcyk7XG5cdFx0YXdhaXQgZWRpdG9yLnNldFNlbGVjdGlvbihuZXcgUmFuZ2UoMSwgMiwgMSwgNSkpO1xuXHRcdGF3YWl0IGVkaXRvci50cmlnZ2VyKCdrZXlib2FyZCcsIEhhbmRsZXIuVHlwZSwgeyB0ZXh0OiAnaScgfSk7XG5cdH0sICc8aT48L2k+Jyk7XG5cblx0dGVzdENhc2UoJ1NlbGVjdGlvbiBpbnNlcnQgLSBhY3Jvc3MgYm91bmRhcnknLCBzdGF0ZSwgYXN5bmMgKGVkaXRvcikgPT4ge1xuXHRcdGNvbnN0IHBvcyA9IG5ldyBQb3NpdGlvbigxLCAyKTtcblx0XHRhd2FpdCBlZGl0b3Iuc2V0UG9zaXRpb24ocG9zKTtcblx0XHRhd2FpdCBlZGl0b3Iuc2V0U2VsZWN0aW9uKG5ldyBSYW5nZSgxLCAxLCAxLCAzKSk7XG5cdFx0YXdhaXQgZWRpdG9yLnRyaWdnZXIoJ2tleWJvYXJkJywgSGFuZGxlci5UeXBlLCB7IHRleHQ6ICdpJyB9KTtcblx0fSwgJ2lvbz48L29vPicpO1xuXG5cdC8qKlxuXHQgKiBAdG9kb1xuXHQgKiBVbmRlZmluZWQgYmVoYXZpb3Jcblx0ICovXG5cdC8vIHRlc3RDYXNlKCdTZWxlY3Rpb24gaW5zZXJ0IC0gYWNyb3NzIHR3byBib3VuZGFyeScsIHN0YXRlLCBhc3luYyAoZWRpdG9yKSA9PiB7XG5cdC8vIFx0Y29uc3QgcG9zID0gbmV3IFBvc2l0aW9uKDEsIDIpO1xuXHQvLyBcdGF3YWl0IGVkaXRvci5zZXRQb3NpdGlvbihwb3MpO1xuXHQvLyBcdGF3YWl0IGxpbmtlZEVkaXRpbmdDb250cmlidXRpb24udXBkYXRlTGlua2VkVUkocG9zKTtcblx0Ly8gXHRhd2FpdCBlZGl0b3Iuc2V0U2VsZWN0aW9uKG5ldyBSYW5nZSgxLCA0LCAxLCA5KSk7XG5cdC8vIFx0YXdhaXQgZWRpdG9yLnRyaWdnZXIoJ2tleWJvYXJkJywgSGFuZGxlci5UeXBlLCB7IHRleHQ6ICdpJyB9KTtcblx0Ly8gfSwgJzxvb2lvbz4nKTtcblxuXHQvKipcblx0ICogQnJlYWsgb3V0IGJlaGF2aW9yXG5cdCAqL1xuXHR0ZXN0Q2FzZSgnQnJlYWtvdXQgLSB0eXBlIHNwYWNlJywgc3RhdGUsIGFzeW5jIChlZGl0b3IpID0+IHtcblx0XHRjb25zdCBwb3MgPSBuZXcgUG9zaXRpb24oMSwgNSk7XG5cdFx0YXdhaXQgZWRpdG9yLnNldFBvc2l0aW9uKHBvcyk7XG5cdFx0YXdhaXQgZWRpdG9yLnRyaWdnZXIoJ2tleWJvYXJkJywgSGFuZGxlci5UeXBlLCB7IHRleHQ6ICcgJyB9KTtcblx0fSwgJzxvb28gPjwvb29vPicpO1xuXG5cdHRlc3RDYXNlKCdCcmVha291dCAtIHR5cGUgc3BhY2UgdGhlbiB1bmRvJywgc3RhdGUsIGFzeW5jIChlZGl0b3IpID0+IHtcblx0XHRjb25zdCBwb3MgPSBuZXcgUG9zaXRpb24oMSwgNSk7XG5cdFx0YXdhaXQgZWRpdG9yLnNldFBvc2l0aW9uKHBvcyk7XG5cdFx0YXdhaXQgZWRpdG9yLnRyaWdnZXIoJ2tleWJvYXJkJywgSGFuZGxlci5UeXBlLCB7IHRleHQ6ICcgJyB9KTtcblx0XHRlZGl0b3IudW5kbygpO1xuXHR9LCAnPG9vbz48L29vbz4nKTtcblxuXHR0ZXN0Q2FzZSgnQnJlYWtvdXQgLSB0eXBlIHNwYWNlIGluIG1pZGRsZScsIHN0YXRlLCBhc3luYyAoZWRpdG9yKSA9PiB7XG5cdFx0Y29uc3QgcG9zID0gbmV3IFBvc2l0aW9uKDEsIDQpO1xuXHRcdGF3YWl0IGVkaXRvci5zZXRQb3NpdGlvbihwb3MpO1xuXHRcdGF3YWl0IGVkaXRvci50cmlnZ2VyKCdrZXlib2FyZCcsIEhhbmRsZXIuVHlwZSwgeyB0ZXh0OiAnICcgfSk7XG5cdH0sICc8b28gbz48L29vbz4nKTtcblxuXHR0ZXN0Q2FzZSgnQnJlYWtvdXQgLSBwYXN0ZSBjb250ZW50IHN0YXJ0aW5nIHdpdGggc3BhY2UnLCBzdGF0ZSwgYXN5bmMgKGVkaXRvcikgPT4ge1xuXHRcdGNvbnN0IHBvcyA9IG5ldyBQb3NpdGlvbigxLCA1KTtcblx0XHRhd2FpdCBlZGl0b3Iuc2V0UG9zaXRpb24ocG9zKTtcblx0XHRhd2FpdCBlZGl0b3IudHJpZ2dlcigna2V5Ym9hcmQnLCBIYW5kbGVyLlBhc3RlLCB7IHRleHQ6ICcgaT1cImlcIicgfSk7XG5cdH0sICc8b29vIGk9XCJpXCI+PC9vb28+Jyk7XG5cblx0dGVzdENhc2UoJ0JyZWFrb3V0IC0gcGFzdGUgY29udGVudCBzdGFydGluZyB3aXRoIHNwYWNlIHRoZW4gdW5kbycsIHN0YXRlLCBhc3luYyAoZWRpdG9yKSA9PiB7XG5cdFx0Y29uc3QgcG9zID0gbmV3IFBvc2l0aW9uKDEsIDUpO1xuXHRcdGF3YWl0IGVkaXRvci5zZXRQb3NpdGlvbihwb3MpO1xuXHRcdGF3YWl0IGVkaXRvci50cmlnZ2VyKCdrZXlib2FyZCcsIEhhbmRsZXIuUGFzdGUsIHsgdGV4dDogJyBpPVwiaVwiJyB9KTtcblx0XHRlZGl0b3IudW5kbygpO1xuXHR9LCAnPG9vbz48L29vbz4nKTtcblxuXHR0ZXN0Q2FzZSgnQnJlYWtvdXQgLSBwYXN0ZSBjb250ZW50IHN0YXJ0aW5nIHdpdGggc3BhY2UgaW4gbWlkZGxlJywgc3RhdGUsIGFzeW5jIChlZGl0b3IpID0+IHtcblx0XHRjb25zdCBwb3MgPSBuZXcgUG9zaXRpb24oMSwgNCk7XG5cdFx0YXdhaXQgZWRpdG9yLnNldFBvc2l0aW9uKHBvcyk7XG5cdFx0YXdhaXQgZWRpdG9yLnRyaWdnZXIoJ2tleWJvYXJkJywgSGFuZGxlci5QYXN0ZSwgeyB0ZXh0OiAnIGknIH0pO1xuXHR9LCAnPG9vIGlvPjwvb29vPicpO1xuXG5cdC8qKlxuXHQgKiBCcmVhayBvdXQgd2l0aCBjdXN0b20gcHJvdmlkZXIgd29yZFBhdHRlcm5cblx0ICovXG5cblx0Y29uc3Qgc3RhdGUzID0ge1xuXHRcdC4uLnN0YXRlLFxuXHRcdHJlc3BvbnNlV29yZFBhdHRlcm46IC9bYS15QS1ZXSsvXG5cdH07XG5cblx0dGVzdENhc2UoJ0JyZWFrb3V0IHdpdGggc3RvcCBwYXR0ZXJuIC0gaW5zZXJ0Jywgc3RhdGUzLCBhc3luYyAoZWRpdG9yKSA9PiB7XG5cdFx0Y29uc3QgcG9zID0gbmV3IFBvc2l0aW9uKDEsIDIpO1xuXHRcdGF3YWl0IGVkaXRvci5zZXRQb3NpdGlvbihwb3MpO1xuXHRcdGF3YWl0IGVkaXRvci50cmlnZ2VyKCdrZXlib2FyZCcsIEhhbmRsZXIuVHlwZSwgeyB0ZXh0OiAnaScgfSk7XG5cdH0sICc8aW9vbz48L2lvb28+Jyk7XG5cblx0dGVzdENhc2UoJ0JyZWFrb3V0IHdpdGggc3RvcCBwYXR0ZXJuIC0gaW5zZXJ0IHN0b3AgY2hhcicsIHN0YXRlMywgYXN5bmMgKGVkaXRvcikgPT4ge1xuXHRcdGNvbnN0IHBvcyA9IG5ldyBQb3NpdGlvbigxLCAyKTtcblx0XHRhd2FpdCBlZGl0b3Iuc2V0UG9zaXRpb24ocG9zKTtcblx0XHRhd2FpdCBlZGl0b3IudHJpZ2dlcigna2V5Ym9hcmQnLCBIYW5kbGVyLlR5cGUsIHsgdGV4dDogJ3onIH0pO1xuXHR9LCAnPHpvb28+PC9vb28+Jyk7XG5cblx0dGVzdENhc2UoJ0JyZWFrb3V0IHdpdGggc3RvcCBwYXR0ZXJuIC0gcGFzdGUgY2hhcicsIHN0YXRlMywgYXN5bmMgKGVkaXRvcikgPT4ge1xuXHRcdGNvbnN0IHBvcyA9IG5ldyBQb3NpdGlvbigxLCAyKTtcblx0XHRhd2FpdCBlZGl0b3Iuc2V0UG9zaXRpb24ocG9zKTtcblx0XHRhd2FpdCBlZGl0b3IudHJpZ2dlcigna2V5Ym9hcmQnLCBIYW5kbGVyLlBhc3RlLCB7IHRleHQ6ICd6JyB9KTtcblx0fSwgJzx6b29vPjwvb29vPicpO1xuXG5cdHRlc3RDYXNlKCdCcmVha291dCB3aXRoIHN0b3AgcGF0dGVybiAtIHBhc3RlIHN0cmluZycsIHN0YXRlMywgYXN5bmMgKGVkaXRvcikgPT4ge1xuXHRcdGNvbnN0IHBvcyA9IG5ldyBQb3NpdGlvbigxLCAyKTtcblx0XHRhd2FpdCBlZGl0b3Iuc2V0UG9zaXRpb24ocG9zKTtcblx0XHRhd2FpdCBlZGl0b3IudHJpZ2dlcigna2V5Ym9hcmQnLCBIYW5kbGVyLlBhc3RlLCB7IHRleHQ6ICd6bycgfSk7XG5cdH0sICc8em9vb28+PC9vb28+Jyk7XG5cblx0dGVzdENhc2UoJ0JyZWFrb3V0IHdpdGggc3RvcCBwYXR0ZXJuIC0gaW5zZXJ0IGF0IGVuZCcsIHN0YXRlMywgYXN5bmMgKGVkaXRvcikgPT4ge1xuXHRcdGNvbnN0IHBvcyA9IG5ldyBQb3NpdGlvbigxLCA1KTtcblx0XHRhd2FpdCBlZGl0b3Iuc2V0UG9zaXRpb24ocG9zKTtcblx0XHRhd2FpdCBlZGl0b3IudHJpZ2dlcigna2V5Ym9hcmQnLCBIYW5kbGVyLlR5cGUsIHsgdGV4dDogJ3onIH0pO1xuXHR9LCAnPG9vb3o+PC9vb28+Jyk7XG5cblx0Y29uc3Qgc3RhdGU0ID0ge1xuXHRcdC4uLnN0YXRlLFxuXHRcdHJlc3BvbnNlV29yZFBhdHRlcm46IC9bYS1lQS1FXSsvXG5cdH07XG5cblx0dGVzdENhc2UoJ0JyZWFrb3V0IHdpdGggc3RvcCBwYXR0ZXJuIC0gaW5zZXJ0IHN0b3AgY2hhciwgcmVzcG9zJywgc3RhdGU0LCBhc3luYyAoZWRpdG9yKSA9PiB7XG5cdFx0Y29uc3QgcG9zID0gbmV3IFBvc2l0aW9uKDEsIDIpO1xuXHRcdGF3YWl0IGVkaXRvci5zZXRQb3NpdGlvbihwb3MpO1xuXHRcdGF3YWl0IGVkaXRvci50cmlnZ2VyKCdrZXlib2FyZCcsIEhhbmRsZXIuVHlwZSwgeyB0ZXh0OiAnaScgfSk7XG5cdH0sICc8aW9vbz48L29vbz4nKTtcblxuXHQvKipcblx0ICogRGVsZXRlXG5cdCAqL1xuXHR0ZXN0Q2FzZSgnRGVsZXRlIC0gbGVmdCBjaGFyJywgc3RhdGUsIGFzeW5jIChlZGl0b3IpID0+IHtcblx0XHRjb25zdCBwb3MgPSBuZXcgUG9zaXRpb24oMSwgNSk7XG5cdFx0YXdhaXQgZWRpdG9yLnNldFBvc2l0aW9uKHBvcyk7XG5cdFx0YXdhaXQgZWRpdG9yLnRyaWdnZXIoJ2tleWJvYXJkJywgJ2RlbGV0ZUxlZnQnLCB7fSk7XG5cdH0sICc8b28+PC9vbz4nKTtcblxuXHR0ZXN0Q2FzZSgnRGVsZXRlIC0gbGVmdCBjaGFyIHRoZW4gdW5kbycsIHN0YXRlLCBhc3luYyAoZWRpdG9yKSA9PiB7XG5cdFx0Y29uc3QgcG9zID0gbmV3IFBvc2l0aW9uKDEsIDUpO1xuXHRcdGF3YWl0IGVkaXRvci5zZXRQb3NpdGlvbihwb3MpO1xuXHRcdGF3YWl0IGVkaXRvci50cmlnZ2VyKCdrZXlib2FyZCcsICdkZWxldGVMZWZ0Jywge30pO1xuXHRcdGVkaXRvci51bmRvKCk7XG5cdH0sICc8b29vPjwvb29vPicpO1xuXG5cdHRlc3RDYXNlKCdEZWxldGUgLSBsZWZ0IHdvcmQnLCBzdGF0ZSwgYXN5bmMgKGVkaXRvcikgPT4ge1xuXHRcdGNvbnN0IHBvcyA9IG5ldyBQb3NpdGlvbigxLCA1KTtcblx0XHRhd2FpdCBlZGl0b3Iuc2V0UG9zaXRpb24ocG9zKTtcblx0XHRhd2FpdCBlZGl0b3IudHJpZ2dlcigna2V5Ym9hcmQnLCAnZGVsZXRlV29yZExlZnQnLCB7fSk7XG5cdH0sICc8PjwvPicpO1xuXG5cdHRlc3RDYXNlKCdEZWxldGUgLSBsZWZ0IHdvcmQgdGhlbiB1bmRvJywgc3RhdGUsIGFzeW5jIChlZGl0b3IpID0+IHtcblx0XHRjb25zdCBwb3MgPSBuZXcgUG9zaXRpb24oMSwgNSk7XG5cdFx0YXdhaXQgZWRpdG9yLnNldFBvc2l0aW9uKHBvcyk7XG5cdFx0YXdhaXQgZWRpdG9yLnRyaWdnZXIoJ2tleWJvYXJkJywgJ2RlbGV0ZVdvcmRMZWZ0Jywge30pO1xuXHRcdGVkaXRvci51bmRvKCk7XG5cdFx0ZWRpdG9yLnVuZG8oKTtcblx0fSwgJzxvb28+PC9vb28+Jyk7XG5cblx0LyoqXG5cdCAqIFRvZG86IEZpeCB0ZXN0XG5cdCAqL1xuXHQvLyB0ZXN0Q2FzZSgnRGVsZXRlIC0gbGVmdCBhbGwnLCBzdGF0ZSwgYXN5bmMgKGVkaXRvcikgPT4ge1xuXHQvLyBcdGNvbnN0IHBvcyA9IG5ldyBQb3NpdGlvbigxLCAzKTtcblx0Ly8gXHRhd2FpdCBlZGl0b3Iuc2V0UG9zaXRpb24ocG9zKTtcblx0Ly8gXHRhd2FpdCBsaW5rZWRFZGl0aW5nQ29udHJpYnV0aW9uLnVwZGF0ZUxpbmtlZFVJKHBvcyk7XG5cdC8vIFx0YXdhaXQgZWRpdG9yLnRyaWdnZXIoJ2tleWJvYXJkJywgJ2RlbGV0ZUFsbExlZnQnLCB7fSk7XG5cdC8vIH0sICc+PC8+Jyk7XG5cblx0LyoqXG5cdCAqIFRvZG86IEZpeCB0ZXN0XG5cdCAqL1xuXHQvLyB0ZXN0Q2FzZSgnRGVsZXRlIC0gbGVmdCBhbGwgdGhlbiB1bmRvJywgc3RhdGUsIGFzeW5jIChlZGl0b3IpID0+IHtcblx0Ly8gXHRjb25zdCBwb3MgPSBuZXcgUG9zaXRpb24oMSwgNSk7XG5cdC8vIFx0YXdhaXQgZWRpdG9yLnNldFBvc2l0aW9uKHBvcyk7XG5cdC8vIFx0YXdhaXQgbGlua2VkRWRpdGluZ0NvbnRyaWJ1dGlvbi51cGRhdGVMaW5rZWRVSShwb3MpO1xuXHQvLyBcdGF3YWl0IGVkaXRvci50cmlnZ2VyKCdrZXlib2FyZCcsICdkZWxldGVBbGxMZWZ0Jywge30pO1xuXHQvLyBcdGVkaXRvci51bmRvKCk7XG5cdC8vIH0sICc+PC9vb28+Jyk7XG5cblx0dGVzdENhc2UoJ0RlbGV0ZSAtIGxlZnQgYWxsIHRoZW4gdW5kbyB0d2ljZScsIHN0YXRlLCBhc3luYyAoZWRpdG9yKSA9PiB7XG5cdFx0Y29uc3QgcG9zID0gbmV3IFBvc2l0aW9uKDEsIDUpO1xuXHRcdGF3YWl0IGVkaXRvci5zZXRQb3NpdGlvbihwb3MpO1xuXHRcdGF3YWl0IGVkaXRvci50cmlnZ2VyKCdrZXlib2FyZCcsICdkZWxldGVBbGxMZWZ0Jywge30pO1xuXHRcdGVkaXRvci51bmRvKCk7XG5cdFx0ZWRpdG9yLnVuZG8oKTtcblx0fSwgJzxvb28+PC9vb28+Jyk7XG5cblx0dGVzdENhc2UoJ0RlbGV0ZSAtIHNlbGVjdGlvbicsIHN0YXRlLCBhc3luYyAoZWRpdG9yKSA9PiB7XG5cdFx0Y29uc3QgcG9zID0gbmV3IFBvc2l0aW9uKDEsIDUpO1xuXHRcdGF3YWl0IGVkaXRvci5zZXRQb3NpdGlvbihwb3MpO1xuXHRcdGF3YWl0IGVkaXRvci5zZXRTZWxlY3Rpb24obmV3IFJhbmdlKDEsIDIsIDEsIDMpKTtcblx0XHRhd2FpdCBlZGl0b3IudHJpZ2dlcigna2V5Ym9hcmQnLCAnZGVsZXRlTGVmdCcsIHt9KTtcblx0fSwgJzxvbz48L29vPicpO1xuXG5cdHRlc3RDYXNlKCdEZWxldGUgLSBzZWxlY3Rpb24gYWNyb3NzIGJvdW5kYXJ5Jywgc3RhdGUsIGFzeW5jIChlZGl0b3IpID0+IHtcblx0XHRjb25zdCBwb3MgPSBuZXcgUG9zaXRpb24oMSwgMyk7XG5cdFx0YXdhaXQgZWRpdG9yLnNldFBvc2l0aW9uKHBvcyk7XG5cdFx0YXdhaXQgZWRpdG9yLnNldFNlbGVjdGlvbihuZXcgUmFuZ2UoMSwgMSwgMSwgMykpO1xuXHRcdGF3YWl0IGVkaXRvci50cmlnZ2VyKCdrZXlib2FyZCcsICdkZWxldGVMZWZ0Jywge30pO1xuXHR9LCAnb28+PC9vbz4nKTtcblxuXHQvKipcblx0ICogVW5kbyAvIHJlZG9cblx0ICovXG5cdHRlc3RDYXNlKCdVbmRvL3JlZG8gLSBzaW1wbGUgdW5kbycsIHN0YXRlLCBhc3luYyAoZWRpdG9yKSA9PiB7XG5cdFx0Y29uc3QgcG9zID0gbmV3IFBvc2l0aW9uKDEsIDIpO1xuXHRcdGF3YWl0IGVkaXRvci5zZXRQb3NpdGlvbihwb3MpO1xuXHRcdGF3YWl0IGVkaXRvci50cmlnZ2VyKCdrZXlib2FyZCcsIEhhbmRsZXIuVHlwZSwgeyB0ZXh0OiAnaScgfSk7XG5cdFx0ZWRpdG9yLnVuZG8oKTtcblx0XHRlZGl0b3IudW5kbygpO1xuXHR9LCAnPG9vbz48L29vbz4nKTtcblxuXHR0ZXN0Q2FzZSgnVW5kby9yZWRvIC0gc2ltcGxlIHVuZG8vcmVkbycsIHN0YXRlLCBhc3luYyAoZWRpdG9yKSA9PiB7XG5cdFx0Y29uc3QgcG9zID0gbmV3IFBvc2l0aW9uKDEsIDIpO1xuXHRcdGF3YWl0IGVkaXRvci5zZXRQb3NpdGlvbihwb3MpO1xuXHRcdGF3YWl0IGVkaXRvci50cmlnZ2VyKCdrZXlib2FyZCcsIEhhbmRsZXIuVHlwZSwgeyB0ZXh0OiAnaScgfSk7XG5cdFx0ZWRpdG9yLnVuZG8oKTtcblx0XHRlZGl0b3IucmVkbygpO1xuXHR9LCAnPGlvb28+PC9pb29vPicpO1xuXG5cdC8qKlxuXHQgKiBNdWx0aSBsaW5lXG5cdCAqL1xuXHRjb25zdCBzdGF0ZTIgPSB7XG5cdFx0dGV4dDogW1xuXHRcdFx0Jzxvb28+Jyxcblx0XHRcdCc8L29vbz4nXG5cdFx0XVxuXHR9O1xuXG5cdHRlc3RDYXNlKCdNdWx0aWxpbmUgaW5zZXJ0Jywgc3RhdGUyLCBhc3luYyAoZWRpdG9yKSA9PiB7XG5cdFx0Y29uc3QgcG9zID0gbmV3IFBvc2l0aW9uKDEsIDIpO1xuXHRcdGF3YWl0IGVkaXRvci5zZXRQb3NpdGlvbihwb3MpO1xuXHRcdGF3YWl0IGVkaXRvci50cmlnZ2VyKCdrZXlib2FyZCcsIEhhbmRsZXIuVHlwZSwgeyB0ZXh0OiAnaScgfSk7XG5cdH0sIFtcblx0XHQnPGlvb28+Jyxcblx0XHQnPC9pb29vPidcblx0XSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLFdBQVc7QUFDcEIsU0FBUywwQkFBMEI7QUFDbkMsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUywyQkFBMkI7QUFDcEMsU0FBb0IsZ0JBQWdCO0FBQ3BDLFNBQWlCLGFBQWE7QUFDOUIsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMscUNBQXFDO0FBRTlDLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsaUNBQWlDO0FB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
