import assert from "assert";
import { Emitter } from "../../../../../../base/common/event.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { URI } from "../../../../../../base/common/uri.js";
import { ICodeEditorService } from "../../../../../../editor/browser/services/codeEditorService.js";
import { Range } from "../../../../../../editor/common/core/range.js";
import { TrackedRangeStickiness } from "../../../../../../editor/common/model.js";
import { TestCodeEditorService } from "../../../../../../editor/test/browser/editorTestServices.js";
import { createTestCodeEditor } from "../../../../../../editor/test/browser/testCodeEditor.js";
import { createTextModel } from "../../../../../../editor/test/common/testTextModel.js";
import { ServiceCollection } from "../../../../../../platform/instantiation/common/serviceCollection.js";
import { TestThemeService } from "../../../../../../platform/theme/test/common/testThemeService.js";
import { toAttachedContextDynamicVariable } from "../../../common/attachments/chatVariables.js";
import { getDynamicVariablesForWidget, getSelectedToolAndToolSetsForWidget } from "../../../browser/attachments/chatVariables.js";
import { ChatDynamicVariableModel, dynamicVariableDecorationType } from "../../../browser/attachments/chatDynamicVariables.js";
import { ToolDataSource, ToolAndToolSetEnablementMap } from "../../../common/tools/languageModelToolsService.js";
import { observableValue } from "../../../../../../base/common/observable.js";
function createMockVariable(overrides) {
  return {
    id: "var-1",
    fullName: "test-var",
    range: new Range(1, 1, 1, 10),
    data: "test-data",
    ...overrides
  };
}
function createMockAttachment(overrides) {
  return {
    id: "attach-1",
    name: "test-attachment",
    kind: "file",
    value: "test-value",
    ...overrides
  };
}
function createMockWidget(options) {
  const {
    hasViewModel = true,
    supportsFileReferences = true,
    contribVariables = [],
    editing = false,
    attachments = [],
    editorTextLength = 100
  } = options;
  const contribModel = {
    id: ChatDynamicVariableModel.ID,
    variables: contribVariables
  };
  return {
    viewModel: hasViewModel ? { editing: editing ? {} : void 0 } : void 0,
    supportsFileReferences,
    getContrib: (id) => id === ChatDynamicVariableModel.ID ? contribModel : void 0,
    input: {
      attachmentModel: { attachments }
    },
    inputEditor: {
      getModel: () => ({
        getValueLength: () => editorTextLength,
        getPositionAt: (offset) => ({ lineNumber: 1, column: offset + 1 })
      })
    }
  };
}
suite("getDynamicVariablesForWidget", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("returns empty when no viewModel", () => {
    const widget = createMockWidget({ hasViewModel: false });
    assert.deepStrictEqual(getDynamicVariablesForWidget(widget), []);
  });
  test("returns only attachment references when file references are not supported", () => {
    const attachmentReference = createMockVariable({ id: "attachment", isAttachmentReference: true });
    const widget = createMockWidget({
      supportsFileReferences: false,
      contribVariables: [createMockVariable(), attachmentReference]
    });
    assert.deepStrictEqual(getDynamicVariablesForWidget(widget), [attachmentReference]);
  });
  test("returns contrib model variables when not editing", () => {
    const variables = [createMockVariable()];
    const widget = createMockWidget({ contribVariables: variables });
    assert.deepStrictEqual(getDynamicVariablesForWidget(widget), variables);
  });
  test("returns contrib model variables when editing with existing variables", () => {
    const variables = [createMockVariable()];
    const widget = createMockWidget({ editing: true, contribVariables: variables });
    assert.deepStrictEqual(getDynamicVariablesForWidget(widget), variables);
  });
  test("converts attachments to dynamic variables when editing with attachments and no contrib variables", () => {
    const attachments = [
      createMockAttachment({
        id: "a1",
        name: "file.ts",
        kind: "file",
        value: "file-value",
        range: { start: 0, endExclusive: 8 }
      })
    ];
    const widget = createMockWidget({ editing: true, attachments, contribVariables: [] });
    const result = getDynamicVariablesForWidget(widget);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].id, "a1");
    assert.strictEqual(result[0].fullName, "file.ts");
    assert.strictEqual(result[0].isFile, true);
    assert.strictEqual(result[0].isDirectory, false);
    assert.strictEqual(result[0].data, "file-value");
  });
  test("skips attachments without range when editing", () => {
    const attachments = [createMockAttachment({ range: void 0 })];
    const widget = createMockWidget({ editing: true, attachments, contribVariables: [] });
    const result = getDynamicVariablesForWidget(widget);
    assert.deepStrictEqual(result, []);
  });
  test("skips attachments with empty range", () => {
    const attachments = [createMockAttachment({ range: { start: 5, endExclusive: 5 } })];
    const widget = createMockWidget({ editing: true, attachments, contribVariables: [] });
    const result = getDynamicVariablesForWidget(widget);
    assert.deepStrictEqual(result, []);
  });
  test("skips attachments with out-of-bounds range", () => {
    const attachments = [createMockAttachment({ range: { start: 0, endExclusive: 200 } })];
    const widget = createMockWidget({ editing: true, attachments, editorTextLength: 100, contribVariables: [] });
    const result = getDynamicVariablesForWidget(widget);
    assert.deepStrictEqual(result, []);
  });
  test("skips attachments with negative start", () => {
    const attachments = [createMockAttachment({ range: { start: -1, endExclusive: 5 } })];
    const widget = createMockWidget({ editing: true, attachments, contribVariables: [] });
    const result = getDynamicVariablesForWidget(widget);
    assert.deepStrictEqual(result, []);
  });
  test("sets isDirectory for directory attachments", () => {
    const attachments = [
      createMockAttachment({
        kind: "directory",
        range: { start: 0, endExclusive: 5 }
      })
    ];
    const widget = createMockWidget({ editing: true, attachments, contribVariables: [] });
    const result = getDynamicVariablesForWidget(widget);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].isFile, false);
    assert.strictEqual(result[0].isDirectory, true);
  });
});
suite("getSelectedToolAndToolSetsForWidget", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("returns the entriesMap from the selected tools model", () => {
    const toolData = {
      id: "tool-1",
      toolReferenceName: "myTool",
      displayName: "My Tool",
      modelDescription: "A test tool",
      canBeReferencedInPrompt: true,
      source: ToolDataSource.Internal
    };
    const expectedMap = ToolAndToolSetEnablementMap.fromEntries([[toolData, true]]);
    const entriesMap = observableValue("test", expectedMap);
    const widget = {
      input: {
        selectedToolsModel: { entriesMap }
      }
    };
    const result = getSelectedToolAndToolSetsForWidget(widget);
    assert.strictEqual(result, expectedMap);
  });
});
suite("inline attachment references", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("keeps large attachment payloads out of inline reference state", () => {
    const attachment = createMockAttachment({
      kind: "image",
      value: new Uint8Array(1024 * 1024)
    });
    const reference = toAttachedContextDynamicVariable(attachment, new Range(1, 1, 1, 20));
    assert.deepStrictEqual({
      data: reference.data,
      hasAttachment: Object.hasOwn(reference, "attachment"),
      isAttachmentReference: reference.isAttachmentReference,
      hasCompactSerializedState: JSON.stringify(reference).length < 500
    }, {
      data: void 0,
      hasAttachment: false,
      isAttachmentReference: true,
      hasCompactSerializedState: true
    });
  });
});
suite("ChatDynamicVariableModel", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  function createDynamicVariableModel(text) {
    const textModel = store.add(createTextModel(text));
    const codeEditorService = store.add(new TestCodeEditorService(new TestThemeService()));
    store.add(codeEditorService.registerDecorationType("test", dynamicVariableDecorationType, {
      rangeBehavior: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
    }));
    const editor = store.add(createTestCodeEditor(textModel, {
      serviceCollection: new ServiceCollection([ICodeEditorService, codeEditorService])
    }));
    const onDidChangeActiveInputEditor = store.add(new Emitter());
    const onDidChangeAttachments = store.add(new Emitter());
    const widget = {
      input: {
        attachmentModel: {
          attachments: [],
          onDidChange: onDidChangeAttachments.event
        }
      },
      inputEditor: editor,
      onDidChangeActiveInputEditor: onDidChangeActiveInputEditor.event,
      refreshParsedInput: () => {
      }
    };
    const model = store.add(new ChatDynamicVariableModel(widget, {
      getUriLabel: () => ""
    }));
    return { editor, model };
  }
  test("keeps a reference when editing text before it", () => {
    const { editor, model } = createDynamicVariableModel("explain #sym:example ");
    model.addReference(createMockVariable({
      range: new Range(1, 9, 1, 21)
    }));
    editor.executeEdits("test", [{
      range: new Range(1, 1, 1, 21),
      text: "describe #sym:example"
    }]);
    assert.deepStrictEqual({
      text: editor.getValue(),
      variables: model.variables.map((variable) => variable.range)
    }, {
      text: "describe #sym:example ",
      variables: [new Range(1, 10, 1, 22)]
    });
  });
  test("removes a reference without deleting replacement text", () => {
    const { editor, model } = createDynamicVariableModel("explain #sym:example ");
    model.addReference(createMockVariable({
      range: new Range(1, 9, 1, 21)
    }));
    editor.executeEdits("test", [{
      range: new Range(1, 1, 1, 21),
      text: "describe"
    }]);
    assert.deepStrictEqual({
      text: editor.getValue(),
      variables: model.variables
    }, {
      text: "describe ",
      variables: []
    });
  });
  test("removes the whole reference when editing inside it", () => {
    const { editor, model } = createDynamicVariableModel("explain #sym:example ");
    model.addReference(createMockVariable({
      range: new Range(1, 9, 1, 21)
    }));
    editor.executeEdits("test", [{
      range: new Range(1, 14, 1, 15),
      text: "X"
    }]);
    assert.deepStrictEqual({
      text: editor.getValue(),
      variables: model.variables
    }, {
      text: "explain  ",
      variables: []
    });
  });
  test("does not retain attachment payload after the backing attachment is removed", () => {
    const attachment = createMockAttachment({
      kind: "image",
      value: new Uint8Array([1, 2, 3]),
      mimeType: "image/png"
    });
    const attachments = [attachment];
    const onDidChangeModelContent = store.add(new Emitter());
    const onDidChangeActiveInputEditor = store.add(new Emitter());
    const onDidChangeAttachments = store.add(new Emitter());
    const widget = {
      input: {
        attachmentModel: {
          attachments,
          onDidChange: onDidChangeAttachments.event
        }
      },
      inputEditor: {
        onDidChangeModelContent: onDidChangeModelContent.event,
        getModel: () => void 0,
        setDecorationsByType: () => []
      },
      onDidChangeActiveInputEditor: onDidChangeActiveInputEditor.event,
      refreshParsedInput: () => {
      }
    };
    const model = store.add(new ChatDynamicVariableModel(widget, {
      getUriLabel: () => ""
    }));
    model.addReference(toAttachedContextDynamicVariable(attachment, new Range(1, 1, 1, 20)));
    attachments.length = 0;
    onDidChangeAttachments.fire({ deleted: [attachment.id], added: [], updated: [] });
    const inputState = {};
    model.getInputState(inputState);
    const serializedReference = inputState[ChatDynamicVariableModel.ID][0];
    const requestReference = model.variables[0];
    assert.deepStrictEqual({
      serializedData: serializedReference.data,
      requestData: requestReference.data,
      hasSerializedAttachment: Object.hasOwn(serializedReference, "attachment"),
      hasRequestAttachment: Object.hasOwn(requestReference, "attachment")
    }, {
      serializedData: void 0,
      requestData: void 0,
      hasSerializedAttachment: false,
      hasRequestAttachment: false
    });
  });
  test("leaves image reference hovers to the custom hover participant", () => {
    const folderAttachment = createMockAttachment({
      id: "folder",
      name: "assets",
      kind: "directory",
      value: URI.file("/workspace/assets")
    });
    const imageAttachment = createMockAttachment({
      id: "image",
      name: "screenshot.png",
      kind: "image",
      value: new Uint8Array([1, 2, 3]),
      mimeType: "image/png",
      references: [{ reference: URI.file("/workspace/screenshot.png"), kind: "reference" }]
    });
    const attachments = [folderAttachment, imageAttachment];
    const onDidChangeModelContent = store.add(new Emitter());
    const onDidChangeActiveInputEditor = store.add(new Emitter());
    const onDidChangeAttachments = store.add(new Emitter());
    let folderHover = "";
    let hasImageDecorationHover = false;
    const widget = {
      input: {
        attachmentModel: {
          attachments,
          onDidChange: onDidChangeAttachments.event
        }
      },
      inputEditor: {
        onDidChangeModelContent: onDidChangeModelContent.event,
        getModel: () => ({
          getValueInRange: () => "#attachment",
          getDecorationRange: () => new Range(1, 1, 1, 20),
          getOffsetAt: (position) => position.column - 1
        }),
        setDecorationsByType: (_owner, _type, decorations) => {
          for (const decoration of decorations) {
            const value = decoration.hoverMessage?.value ?? "";
            if (value.includes("workspace/assets")) {
              folderHover = value;
            }
            if (value.includes("screenshot.png")) {
              hasImageDecorationHover = true;
            }
          }
          return decorations.map((_, index) => String(index));
        }
      },
      onDidChangeActiveInputEditor: onDidChangeActiveInputEditor.event,
      refreshParsedInput: () => {
      }
    };
    const model = store.add(new ChatDynamicVariableModel(widget, {
      getUriLabel: (uri) => uri.path.slice(1)
    }));
    model.addReference(toAttachedContextDynamicVariable(folderAttachment, new Range(1, 1, 1, 20)));
    model.addReference(toAttachedContextDynamicVariable(imageAttachment, new Range(2, 1, 2, 20)));
    assert.deepStrictEqual({
      folderHover,
      hasImageDecorationHover
    }, {
      folderHover: "workspace/assets",
      hasImageDecorationHover: false
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGJyb3dzZXJcXGF0dGFjaG1lbnRzXFxjaGF0VmFyaWFibGVzLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvc2VydmljZXMvY29kZUVkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgVGVzdENvZGVFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL3Rlc3QvYnJvd3Nlci9lZGl0b3JUZXN0U2VydmljZXMuanMnO1xuaW1wb3J0IHsgY3JlYXRlVGVzdENvZGVFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvdGVzdC9icm93c2VyL3Rlc3RDb2RlRWRpdG9yLmpzJztcbmltcG9ydCB7IGNyZWF0ZVRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci90ZXN0L2NvbW1vbi90ZXN0VGV4dE1vZGVsLmpzJztcbmltcG9ydCB7IFNlcnZpY2VDb2xsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vc2VydmljZUNvbGxlY3Rpb24uanMnO1xuaW1wb3J0IHsgSUxhYmVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xhYmVsL2NvbW1vbi9sYWJlbC5qcyc7XG5pbXBvcnQgeyBUZXN0VGhlbWVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvdGVzdC9jb21tb24vdGVzdFRoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRHluYW1pY1ZhcmlhYmxlLCB0b0F0dGFjaGVkQ29udGV4dER5bmFtaWNWYXJpYWJsZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9hdHRhY2htZW50cy9jaGF0VmFyaWFibGVzLmpzJztcbmltcG9ydCB7IElDaGF0V2lkZ2V0IH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9jaGF0LmpzJztcbmltcG9ydCB7IGdldER5bmFtaWNWYXJpYWJsZXNGb3JXaWRnZXQsIGdldFNlbGVjdGVkVG9vbEFuZFRvb2xTZXRzRm9yV2lkZ2V0IH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9hdHRhY2htZW50cy9jaGF0VmFyaWFibGVzLmpzJztcbmltcG9ydCB7IENoYXREeW5hbWljVmFyaWFibGVNb2RlbCwgZHluYW1pY1ZhcmlhYmxlRGVjb3JhdGlvblR5cGUgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2F0dGFjaG1lbnRzL2NoYXREeW5hbWljVmFyaWFibGVzLmpzJztcbmltcG9ydCB7IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnkgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vYXR0YWNobWVudHMvY2hhdFZhcmlhYmxlRW50cmllcy5qcyc7XG5pbXBvcnQgeyBJVG9vbERhdGEsIFRvb2xEYXRhU291cmNlLCBUb29sQW5kVG9vbFNldEVuYWJsZW1lbnRNYXAgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdG9vbHMvbGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBvYnNlcnZhYmxlVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcblxuZnVuY3Rpb24gY3JlYXRlTW9ja1ZhcmlhYmxlKG92ZXJyaWRlcz86IFBhcnRpYWw8SUR5bmFtaWNWYXJpYWJsZT4pOiBJRHluYW1pY1ZhcmlhYmxlIHtcblx0cmV0dXJuIHtcblx0XHRpZDogJ3Zhci0xJyxcblx0XHRmdWxsTmFtZTogJ3Rlc3QtdmFyJyxcblx0XHRyYW5nZTogbmV3IFJhbmdlKDEsIDEsIDEsIDEwKSxcblx0XHRkYXRhOiAndGVzdC1kYXRhJyxcblx0XHQuLi5vdmVycmlkZXMsXG5cdH07XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZU1vY2tBdHRhY2htZW50KG92ZXJyaWRlcz86IFBhcnRpYWw8SUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeT4pOiBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5IHtcblx0cmV0dXJuIHtcblx0XHRpZDogJ2F0dGFjaC0xJyxcblx0XHRuYW1lOiAndGVzdC1hdHRhY2htZW50Jyxcblx0XHRraW5kOiAnZmlsZScsXG5cdFx0dmFsdWU6ICd0ZXN0LXZhbHVlJyxcblx0XHQuLi5vdmVycmlkZXMsXG5cdH0gYXMgSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlTW9ja1dpZGdldChvcHRpb25zOiB7XG5cdGhhc1ZpZXdNb2RlbD86IGJvb2xlYW47XG5cdHN1cHBvcnRzRmlsZVJlZmVyZW5jZXM/OiBib29sZWFuO1xuXHRjb250cmliVmFyaWFibGVzPzogSUR5bmFtaWNWYXJpYWJsZVtdO1xuXHRlZGl0aW5nPzogYm9vbGVhbjtcblx0YXR0YWNobWVudHM/OiBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5W107XG5cdGVkaXRvclRleHRMZW5ndGg/OiBudW1iZXI7XG59KTogSUNoYXRXaWRnZXQge1xuXHRjb25zdCB7XG5cdFx0aGFzVmlld01vZGVsID0gdHJ1ZSxcblx0XHRzdXBwb3J0c0ZpbGVSZWZlcmVuY2VzID0gdHJ1ZSxcblx0XHRjb250cmliVmFyaWFibGVzID0gW10sXG5cdFx0ZWRpdGluZyA9IGZhbHNlLFxuXHRcdGF0dGFjaG1lbnRzID0gW10sXG5cdFx0ZWRpdG9yVGV4dExlbmd0aCA9IDEwMCxcblx0fSA9IG9wdGlvbnM7XG5cblx0Y29uc3QgY29udHJpYk1vZGVsID0ge1xuXHRcdGlkOiBDaGF0RHluYW1pY1ZhcmlhYmxlTW9kZWwuSUQsXG5cdFx0dmFyaWFibGVzOiBjb250cmliVmFyaWFibGVzLFxuXHR9O1xuXG5cdHJldHVybiB7XG5cdFx0dmlld01vZGVsOiBoYXNWaWV3TW9kZWwgPyB7IGVkaXRpbmc6IGVkaXRpbmcgPyB7fSA6IHVuZGVmaW5lZCB9IDogdW5kZWZpbmVkLFxuXHRcdHN1cHBvcnRzRmlsZVJlZmVyZW5jZXMsXG5cdFx0Z2V0Q29udHJpYjogKGlkOiBzdHJpbmcpID0+IGlkID09PSBDaGF0RHluYW1pY1ZhcmlhYmxlTW9kZWwuSUQgPyBjb250cmliTW9kZWwgOiB1bmRlZmluZWQsXG5cdFx0aW5wdXQ6IHtcblx0XHRcdGF0dGFjaG1lbnRNb2RlbDogeyBhdHRhY2htZW50cyB9LFxuXHRcdH0sXG5cdFx0aW5wdXRFZGl0b3I6IHtcblx0XHRcdGdldE1vZGVsOiAoKSA9PiAoe1xuXHRcdFx0XHRnZXRWYWx1ZUxlbmd0aDogKCkgPT4gZWRpdG9yVGV4dExlbmd0aCxcblx0XHRcdFx0Z2V0UG9zaXRpb25BdDogKG9mZnNldDogbnVtYmVyKSA9PiAoeyBsaW5lTnVtYmVyOiAxLCBjb2x1bW46IG9mZnNldCArIDEgfSksXG5cdFx0XHR9KSxcblx0XHR9LFxuXHR9IGFzIHVua25vd24gYXMgSUNoYXRXaWRnZXQ7XG59XG5cbnN1aXRlKCdnZXREeW5hbWljVmFyaWFibGVzRm9yV2lkZ2V0JywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdyZXR1cm5zIGVtcHR5IHdoZW4gbm8gdmlld01vZGVsJywgKCkgPT4ge1xuXHRcdGNvbnN0IHdpZGdldCA9IGNyZWF0ZU1vY2tXaWRnZXQoeyBoYXNWaWV3TW9kZWw6IGZhbHNlIH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2V0RHluYW1pY1ZhcmlhYmxlc0ZvcldpZGdldCh3aWRnZXQpLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JldHVybnMgb25seSBhdHRhY2htZW50IHJlZmVyZW5jZXMgd2hlbiBmaWxlIHJlZmVyZW5jZXMgYXJlIG5vdCBzdXBwb3J0ZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgYXR0YWNobWVudFJlZmVyZW5jZSA9IGNyZWF0ZU1vY2tWYXJpYWJsZSh7IGlkOiAnYXR0YWNobWVudCcsIGlzQXR0YWNobWVudFJlZmVyZW5jZTogdHJ1ZSB9KTtcblx0XHRjb25zdCB3aWRnZXQgPSBjcmVhdGVNb2NrV2lkZ2V0KHtcblx0XHRcdHN1cHBvcnRzRmlsZVJlZmVyZW5jZXM6IGZhbHNlLFxuXHRcdFx0Y29udHJpYlZhcmlhYmxlczogW2NyZWF0ZU1vY2tWYXJpYWJsZSgpLCBhdHRhY2htZW50UmVmZXJlbmNlXSxcblx0XHR9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdldER5bmFtaWNWYXJpYWJsZXNGb3JXaWRnZXQod2lkZ2V0KSwgW2F0dGFjaG1lbnRSZWZlcmVuY2VdKTtcblx0fSk7XG5cblx0dGVzdCgncmV0dXJucyBjb250cmliIG1vZGVsIHZhcmlhYmxlcyB3aGVuIG5vdCBlZGl0aW5nJywgKCkgPT4ge1xuXHRcdGNvbnN0IHZhcmlhYmxlcyA9IFtjcmVhdGVNb2NrVmFyaWFibGUoKV07XG5cdFx0Y29uc3Qgd2lkZ2V0ID0gY3JlYXRlTW9ja1dpZGdldCh7IGNvbnRyaWJWYXJpYWJsZXM6IHZhcmlhYmxlcyB9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdldER5bmFtaWNWYXJpYWJsZXNGb3JXaWRnZXQod2lkZ2V0KSwgdmFyaWFibGVzKTtcblx0fSk7XG5cblx0dGVzdCgncmV0dXJucyBjb250cmliIG1vZGVsIHZhcmlhYmxlcyB3aGVuIGVkaXRpbmcgd2l0aCBleGlzdGluZyB2YXJpYWJsZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdmFyaWFibGVzID0gW2NyZWF0ZU1vY2tWYXJpYWJsZSgpXTtcblx0XHRjb25zdCB3aWRnZXQgPSBjcmVhdGVNb2NrV2lkZ2V0KHsgZWRpdGluZzogdHJ1ZSwgY29udHJpYlZhcmlhYmxlczogdmFyaWFibGVzIH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2V0RHluYW1pY1ZhcmlhYmxlc0ZvcldpZGdldCh3aWRnZXQpLCB2YXJpYWJsZXMpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb252ZXJ0cyBhdHRhY2htZW50cyB0byBkeW5hbWljIHZhcmlhYmxlcyB3aGVuIGVkaXRpbmcgd2l0aCBhdHRhY2htZW50cyBhbmQgbm8gY29udHJpYiB2YXJpYWJsZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgYXR0YWNobWVudHMgPSBbXG5cdFx0XHRjcmVhdGVNb2NrQXR0YWNobWVudCh7XG5cdFx0XHRcdGlkOiAnYTEnLFxuXHRcdFx0XHRuYW1lOiAnZmlsZS50cycsXG5cdFx0XHRcdGtpbmQ6ICdmaWxlJyxcblx0XHRcdFx0dmFsdWU6ICdmaWxlLXZhbHVlJyxcblx0XHRcdFx0cmFuZ2U6IHsgc3RhcnQ6IDAsIGVuZEV4Y2x1c2l2ZTogOCB9LFxuXHRcdFx0fSksXG5cdFx0XTtcblx0XHRjb25zdCB3aWRnZXQgPSBjcmVhdGVNb2NrV2lkZ2V0KHsgZWRpdGluZzogdHJ1ZSwgYXR0YWNobWVudHMsIGNvbnRyaWJWYXJpYWJsZXM6IFtdIH0pO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGdldER5bmFtaWNWYXJpYWJsZXNGb3JXaWRnZXQod2lkZ2V0KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0WzBdLmlkLCAnYTEnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0WzBdLmZ1bGxOYW1lLCAnZmlsZS50cycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRbMF0uaXNGaWxlLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0WzBdLmlzRGlyZWN0b3J5LCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdFswXS5kYXRhLCAnZmlsZS12YWx1ZScpO1xuXHR9KTtcblxuXHR0ZXN0KCdza2lwcyBhdHRhY2htZW50cyB3aXRob3V0IHJhbmdlIHdoZW4gZWRpdGluZycsICgpID0+IHtcblx0XHRjb25zdCBhdHRhY2htZW50cyA9IFtjcmVhdGVNb2NrQXR0YWNobWVudCh7IHJhbmdlOiB1bmRlZmluZWQgfSldO1xuXHRcdGNvbnN0IHdpZGdldCA9IGNyZWF0ZU1vY2tXaWRnZXQoeyBlZGl0aW5nOiB0cnVlLCBhdHRhY2htZW50cywgY29udHJpYlZhcmlhYmxlczogW10gfSk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gZ2V0RHluYW1pY1ZhcmlhYmxlc0ZvcldpZGdldCh3aWRnZXQpO1xuXG5cdFx0Ly8gTm8gcmFuZ2VkIGF0dGFjaG1lbnRzLCBmYWxscyBiYWNrIHRvIGNvbnRyaWIgbW9kZWwgdmFyaWFibGVzIChlbXB0eSlcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdza2lwcyBhdHRhY2htZW50cyB3aXRoIGVtcHR5IHJhbmdlJywgKCkgPT4ge1xuXHRcdGNvbnN0IGF0dGFjaG1lbnRzID0gW2NyZWF0ZU1vY2tBdHRhY2htZW50KHsgcmFuZ2U6IHsgc3RhcnQ6IDUsIGVuZEV4Y2x1c2l2ZTogNSB9IH0pXTtcblx0XHRjb25zdCB3aWRnZXQgPSBjcmVhdGVNb2NrV2lkZ2V0KHsgZWRpdGluZzogdHJ1ZSwgYXR0YWNobWVudHMsIGNvbnRyaWJWYXJpYWJsZXM6IFtdIH0pO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGdldER5bmFtaWNWYXJpYWJsZXNGb3JXaWRnZXQod2lkZ2V0KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdza2lwcyBhdHRhY2htZW50cyB3aXRoIG91dC1vZi1ib3VuZHMgcmFuZ2UnLCAoKSA9PiB7XG5cdFx0Y29uc3QgYXR0YWNobWVudHMgPSBbY3JlYXRlTW9ja0F0dGFjaG1lbnQoeyByYW5nZTogeyBzdGFydDogMCwgZW5kRXhjbHVzaXZlOiAyMDAgfSB9KV07XG5cdFx0Y29uc3Qgd2lkZ2V0ID0gY3JlYXRlTW9ja1dpZGdldCh7IGVkaXRpbmc6IHRydWUsIGF0dGFjaG1lbnRzLCBlZGl0b3JUZXh0TGVuZ3RoOiAxMDAsIGNvbnRyaWJWYXJpYWJsZXM6IFtdIH0pO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGdldER5bmFtaWNWYXJpYWJsZXNGb3JXaWRnZXQod2lkZ2V0KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdza2lwcyBhdHRhY2htZW50cyB3aXRoIG5lZ2F0aXZlIHN0YXJ0JywgKCkgPT4ge1xuXHRcdGNvbnN0IGF0dGFjaG1lbnRzID0gW2NyZWF0ZU1vY2tBdHRhY2htZW50KHsgcmFuZ2U6IHsgc3RhcnQ6IC0xLCBlbmRFeGNsdXNpdmU6IDUgfSB9KV07XG5cdFx0Y29uc3Qgd2lkZ2V0ID0gY3JlYXRlTW9ja1dpZGdldCh7IGVkaXRpbmc6IHRydWUsIGF0dGFjaG1lbnRzLCBjb250cmliVmFyaWFibGVzOiBbXSB9KTtcblx0XHRjb25zdCByZXN1bHQgPSBnZXREeW5hbWljVmFyaWFibGVzRm9yV2lkZ2V0KHdpZGdldCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIFtdKTtcblx0fSk7XG5cblx0dGVzdCgnc2V0cyBpc0RpcmVjdG9yeSBmb3IgZGlyZWN0b3J5IGF0dGFjaG1lbnRzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGF0dGFjaG1lbnRzID0gW1xuXHRcdFx0Y3JlYXRlTW9ja0F0dGFjaG1lbnQoe1xuXHRcdFx0XHRraW5kOiAnZGlyZWN0b3J5Jyxcblx0XHRcdFx0cmFuZ2U6IHsgc3RhcnQ6IDAsIGVuZEV4Y2x1c2l2ZTogNSB9LFxuXHRcdFx0fSksXG5cdFx0XTtcblx0XHRjb25zdCB3aWRnZXQgPSBjcmVhdGVNb2NrV2lkZ2V0KHsgZWRpdGluZzogdHJ1ZSwgYXR0YWNobWVudHMsIGNvbnRyaWJWYXJpYWJsZXM6IFtdIH0pO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGdldER5bmFtaWNWYXJpYWJsZXNGb3JXaWRnZXQod2lkZ2V0KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0WzBdLmlzRmlsZSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRbMF0uaXNEaXJlY3RvcnksIHRydWUpO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnZ2V0U2VsZWN0ZWRUb29sQW5kVG9vbFNldHNGb3JXaWRnZXQnLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ3JldHVybnMgdGhlIGVudHJpZXNNYXAgZnJvbSB0aGUgc2VsZWN0ZWQgdG9vbHMgbW9kZWwnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdG9vbERhdGE6IElUb29sRGF0YSA9IHtcblx0XHRcdGlkOiAndG9vbC0xJyxcblx0XHRcdHRvb2xSZWZlcmVuY2VOYW1lOiAnbXlUb29sJyxcblx0XHRcdGRpc3BsYXlOYW1lOiAnTXkgVG9vbCcsXG5cdFx0XHRtb2RlbERlc2NyaXB0aW9uOiAnQSB0ZXN0IHRvb2wnLFxuXHRcdFx0Y2FuQmVSZWZlcmVuY2VkSW5Qcm9tcHQ6IHRydWUsXG5cdFx0XHRzb3VyY2U6IFRvb2xEYXRhU291cmNlLkludGVybmFsLFxuXHRcdH07XG5cdFx0Y29uc3QgZXhwZWN0ZWRNYXAgPSBUb29sQW5kVG9vbFNldEVuYWJsZW1lbnRNYXAuZnJvbUVudHJpZXMoW1t0b29sRGF0YSwgdHJ1ZV1dKTtcblx0XHRjb25zdCBlbnRyaWVzTWFwID0gb2JzZXJ2YWJsZVZhbHVlKCd0ZXN0JywgZXhwZWN0ZWRNYXApO1xuXG5cdFx0Y29uc3Qgd2lkZ2V0ID0ge1xuXHRcdFx0aW5wdXQ6IHtcblx0XHRcdFx0c2VsZWN0ZWRUb29sc01vZGVsOiB7IGVudHJpZXNNYXAgfSxcblx0XHRcdH0sXG5cdFx0fSBhcyB1bmtub3duIGFzIElDaGF0V2lkZ2V0O1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gZ2V0U2VsZWN0ZWRUb29sQW5kVG9vbFNldHNGb3JXaWRnZXQod2lkZ2V0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCBleHBlY3RlZE1hcCk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdpbmxpbmUgYXR0YWNobWVudCByZWZlcmVuY2VzJywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdrZWVwcyBsYXJnZSBhdHRhY2htZW50IHBheWxvYWRzIG91dCBvZiBpbmxpbmUgcmVmZXJlbmNlIHN0YXRlJywgKCkgPT4ge1xuXHRcdGNvbnN0IGF0dGFjaG1lbnQgPSBjcmVhdGVNb2NrQXR0YWNobWVudCh7XG5cdFx0XHRraW5kOiAnaW1hZ2UnLFxuXHRcdFx0dmFsdWU6IG5ldyBVaW50OEFycmF5KDEwMjQgKiAxMDI0KSxcblx0XHR9KTtcblx0XHRjb25zdCByZWZlcmVuY2UgPSB0b0F0dGFjaGVkQ29udGV4dER5bmFtaWNWYXJpYWJsZShhdHRhY2htZW50LCBuZXcgUmFuZ2UoMSwgMSwgMSwgMjApKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0ZGF0YTogcmVmZXJlbmNlLmRhdGEsXG5cdFx0XHRoYXNBdHRhY2htZW50OiBPYmplY3QuaGFzT3duKHJlZmVyZW5jZSwgJ2F0dGFjaG1lbnQnKSxcblx0XHRcdGlzQXR0YWNobWVudFJlZmVyZW5jZTogcmVmZXJlbmNlLmlzQXR0YWNobWVudFJlZmVyZW5jZSxcblx0XHRcdGhhc0NvbXBhY3RTZXJpYWxpemVkU3RhdGU6IEpTT04uc3RyaW5naWZ5KHJlZmVyZW5jZSkubGVuZ3RoIDwgNTAwLFxuXHRcdH0sIHtcblx0XHRcdGRhdGE6IHVuZGVmaW5lZCxcblx0XHRcdGhhc0F0dGFjaG1lbnQ6IGZhbHNlLFxuXHRcdFx0aXNBdHRhY2htZW50UmVmZXJlbmNlOiB0cnVlLFxuXHRcdFx0aGFzQ29tcGFjdFNlcmlhbGl6ZWRTdGF0ZTogdHJ1ZSxcblx0XHR9KTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ0NoYXREeW5hbWljVmFyaWFibGVNb2RlbCcsICgpID0+IHtcblx0Y29uc3Qgc3RvcmUgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRmdW5jdGlvbiBjcmVhdGVEeW5hbWljVmFyaWFibGVNb2RlbCh0ZXh0OiBzdHJpbmcpOiB7IGVkaXRvcjogUmV0dXJuVHlwZTx0eXBlb2YgY3JlYXRlVGVzdENvZGVFZGl0b3I+OyBtb2RlbDogQ2hhdER5bmFtaWNWYXJpYWJsZU1vZGVsIH0ge1xuXHRcdGNvbnN0IHRleHRNb2RlbCA9IHN0b3JlLmFkZChjcmVhdGVUZXh0TW9kZWwodGV4dCkpO1xuXHRcdGNvbnN0IGNvZGVFZGl0b3JTZXJ2aWNlID0gc3RvcmUuYWRkKG5ldyBUZXN0Q29kZUVkaXRvclNlcnZpY2UobmV3IFRlc3RUaGVtZVNlcnZpY2UoKSkpO1xuXHRcdHN0b3JlLmFkZChjb2RlRWRpdG9yU2VydmljZS5yZWdpc3RlckRlY29yYXRpb25UeXBlKCd0ZXN0JywgZHluYW1pY1ZhcmlhYmxlRGVjb3JhdGlvblR5cGUsIHtcblx0XHRcdHJhbmdlQmVoYXZpb3I6IFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuTmV2ZXJHcm93c1doZW5UeXBpbmdBdEVkZ2VzLFxuXHRcdH0pKTtcblx0XHRjb25zdCBlZGl0b3IgPSBzdG9yZS5hZGQoY3JlYXRlVGVzdENvZGVFZGl0b3IodGV4dE1vZGVsLCB7XG5cdFx0XHRzZXJ2aWNlQ29sbGVjdGlvbjogbmV3IFNlcnZpY2VDb2xsZWN0aW9uKFtJQ29kZUVkaXRvclNlcnZpY2UsIGNvZGVFZGl0b3JTZXJ2aWNlXSksXG5cdFx0fSkpO1xuXHRcdGNvbnN0IG9uRGlkQ2hhbmdlQWN0aXZlSW5wdXRFZGl0b3IgPSBzdG9yZS5hZGQobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdFx0Y29uc3Qgb25EaWRDaGFuZ2VBdHRhY2htZW50cyA9IHN0b3JlLmFkZChuZXcgRW1pdHRlcjx7IGRlbGV0ZWQ6IHJlYWRvbmx5IHN0cmluZ1tdOyBhZGRlZDogcmVhZG9ubHkgSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeVtdOyB1cGRhdGVkOiByZWFkb25seSBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5W10gfT4oKSk7XG5cdFx0Y29uc3Qgd2lkZ2V0ID0ge1xuXHRcdFx0aW5wdXQ6IHtcblx0XHRcdFx0YXR0YWNobWVudE1vZGVsOiB7XG5cdFx0XHRcdFx0YXR0YWNobWVudHM6IFtdLFxuXHRcdFx0XHRcdG9uRGlkQ2hhbmdlOiBvbkRpZENoYW5nZUF0dGFjaG1lbnRzLmV2ZW50LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHRcdGlucHV0RWRpdG9yOiBlZGl0b3IsXG5cdFx0XHRvbkRpZENoYW5nZUFjdGl2ZUlucHV0RWRpdG9yOiBvbkRpZENoYW5nZUFjdGl2ZUlucHV0RWRpdG9yLmV2ZW50LFxuXHRcdFx0cmVmcmVzaFBhcnNlZElucHV0OiAoKSA9PiB7IH0sXG5cdFx0fSBhcyB1bmtub3duIGFzIElDaGF0V2lkZ2V0O1xuXHRcdGNvbnN0IG1vZGVsID0gc3RvcmUuYWRkKG5ldyBDaGF0RHluYW1pY1ZhcmlhYmxlTW9kZWwod2lkZ2V0LCB7XG5cdFx0XHRnZXRVcmlMYWJlbDogKCkgPT4gJycsXG5cdFx0fSBhcyB1bmtub3duIGFzIElMYWJlbFNlcnZpY2UpKTtcblx0XHRyZXR1cm4geyBlZGl0b3IsIG1vZGVsIH07XG5cdH1cblxuXHR0ZXN0KCdrZWVwcyBhIHJlZmVyZW5jZSB3aGVuIGVkaXRpbmcgdGV4dCBiZWZvcmUgaXQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgeyBlZGl0b3IsIG1vZGVsIH0gPSBjcmVhdGVEeW5hbWljVmFyaWFibGVNb2RlbCgnZXhwbGFpbiAjc3ltOmV4YW1wbGUgJyk7XG5cdFx0bW9kZWwuYWRkUmVmZXJlbmNlKGNyZWF0ZU1vY2tWYXJpYWJsZSh7XG5cdFx0XHRyYW5nZTogbmV3IFJhbmdlKDEsIDksIDEsIDIxKSxcblx0XHR9KSk7XG5cblx0XHRlZGl0b3IuZXhlY3V0ZUVkaXRzKCd0ZXN0JywgW3tcblx0XHRcdHJhbmdlOiBuZXcgUmFuZ2UoMSwgMSwgMSwgMjEpLFxuXHRcdFx0dGV4dDogJ2Rlc2NyaWJlICNzeW06ZXhhbXBsZScsXG5cdFx0fV0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHR0ZXh0OiBlZGl0b3IuZ2V0VmFsdWUoKSxcblx0XHRcdHZhcmlhYmxlczogbW9kZWwudmFyaWFibGVzLm1hcCh2YXJpYWJsZSA9PiB2YXJpYWJsZS5yYW5nZSksXG5cdFx0fSwge1xuXHRcdFx0dGV4dDogJ2Rlc2NyaWJlICNzeW06ZXhhbXBsZSAnLFxuXHRcdFx0dmFyaWFibGVzOiBbbmV3IFJhbmdlKDEsIDEwLCAxLCAyMildLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZW1vdmVzIGEgcmVmZXJlbmNlIHdpdGhvdXQgZGVsZXRpbmcgcmVwbGFjZW1lbnQgdGV4dCcsICgpID0+IHtcblx0XHRjb25zdCB7IGVkaXRvciwgbW9kZWwgfSA9IGNyZWF0ZUR5bmFtaWNWYXJpYWJsZU1vZGVsKCdleHBsYWluICNzeW06ZXhhbXBsZSAnKTtcblx0XHRtb2RlbC5hZGRSZWZlcmVuY2UoY3JlYXRlTW9ja1ZhcmlhYmxlKHtcblx0XHRcdHJhbmdlOiBuZXcgUmFuZ2UoMSwgOSwgMSwgMjEpLFxuXHRcdH0pKTtcblxuXHRcdGVkaXRvci5leGVjdXRlRWRpdHMoJ3Rlc3QnLCBbe1xuXHRcdFx0cmFuZ2U6IG5ldyBSYW5nZSgxLCAxLCAxLCAyMSksXG5cdFx0XHR0ZXh0OiAnZGVzY3JpYmUnLFxuXHRcdH1dKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0dGV4dDogZWRpdG9yLmdldFZhbHVlKCksXG5cdFx0XHR2YXJpYWJsZXM6IG1vZGVsLnZhcmlhYmxlcyxcblx0XHR9LCB7XG5cdFx0XHR0ZXh0OiAnZGVzY3JpYmUgJyxcblx0XHRcdHZhcmlhYmxlczogW10sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlbW92ZXMgdGhlIHdob2xlIHJlZmVyZW5jZSB3aGVuIGVkaXRpbmcgaW5zaWRlIGl0JywgKCkgPT4ge1xuXHRcdGNvbnN0IHsgZWRpdG9yLCBtb2RlbCB9ID0gY3JlYXRlRHluYW1pY1ZhcmlhYmxlTW9kZWwoJ2V4cGxhaW4gI3N5bTpleGFtcGxlICcpO1xuXHRcdG1vZGVsLmFkZFJlZmVyZW5jZShjcmVhdGVNb2NrVmFyaWFibGUoe1xuXHRcdFx0cmFuZ2U6IG5ldyBSYW5nZSgxLCA5LCAxLCAyMSksXG5cdFx0fSkpO1xuXG5cdFx0ZWRpdG9yLmV4ZWN1dGVFZGl0cygndGVzdCcsIFt7XG5cdFx0XHRyYW5nZTogbmV3IFJhbmdlKDEsIDE0LCAxLCAxNSksXG5cdFx0XHR0ZXh0OiAnWCcsXG5cdFx0fV0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHR0ZXh0OiBlZGl0b3IuZ2V0VmFsdWUoKSxcblx0XHRcdHZhcmlhYmxlczogbW9kZWwudmFyaWFibGVzLFxuXHRcdH0sIHtcblx0XHRcdHRleHQ6ICdleHBsYWluICAnLFxuXHRcdFx0dmFyaWFibGVzOiBbXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3QgcmV0YWluIGF0dGFjaG1lbnQgcGF5bG9hZCBhZnRlciB0aGUgYmFja2luZyBhdHRhY2htZW50IGlzIHJlbW92ZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgYXR0YWNobWVudCA9IGNyZWF0ZU1vY2tBdHRhY2htZW50KHtcblx0XHRcdGtpbmQ6ICdpbWFnZScsXG5cdFx0XHR2YWx1ZTogbmV3IFVpbnQ4QXJyYXkoWzEsIDIsIDNdKSxcblx0XHRcdG1pbWVUeXBlOiAnaW1hZ2UvcG5nJyxcblx0XHR9KTtcblx0XHRjb25zdCBhdHRhY2htZW50cyA9IFthdHRhY2htZW50XTtcblx0XHRjb25zdCBvbkRpZENoYW5nZU1vZGVsQ29udGVudCA9IHN0b3JlLmFkZChuZXcgRW1pdHRlcjx7IGNoYW5nZXM6IHJlYWRvbmx5IHVua25vd25bXSB9PigpKTtcblx0XHRjb25zdCBvbkRpZENoYW5nZUFjdGl2ZUlucHV0RWRpdG9yID0gc3RvcmUuYWRkKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRcdGNvbnN0IG9uRGlkQ2hhbmdlQXR0YWNobWVudHMgPSBzdG9yZS5hZGQobmV3IEVtaXR0ZXI8eyBkZWxldGVkOiByZWFkb25seSBzdHJpbmdbXTsgYWRkZWQ6IHJlYWRvbmx5IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnlbXTsgdXBkYXRlZDogcmVhZG9ubHkgSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeVtdIH0+KCkpO1xuXHRcdGNvbnN0IHdpZGdldCA9IHtcblx0XHRcdGlucHV0OiB7XG5cdFx0XHRcdGF0dGFjaG1lbnRNb2RlbDoge1xuXHRcdFx0XHRcdGF0dGFjaG1lbnRzLFxuXHRcdFx0XHRcdG9uRGlkQ2hhbmdlOiBvbkRpZENoYW5nZUF0dGFjaG1lbnRzLmV2ZW50LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHRcdGlucHV0RWRpdG9yOiB7XG5cdFx0XHRcdG9uRGlkQ2hhbmdlTW9kZWxDb250ZW50OiBvbkRpZENoYW5nZU1vZGVsQ29udGVudC5ldmVudCxcblx0XHRcdFx0Z2V0TW9kZWw6ICgpID0+IHVuZGVmaW5lZCxcblx0XHRcdFx0c2V0RGVjb3JhdGlvbnNCeVR5cGU6ICgpID0+IFtdLFxuXHRcdFx0fSxcblx0XHRcdG9uRGlkQ2hhbmdlQWN0aXZlSW5wdXRFZGl0b3I6IG9uRGlkQ2hhbmdlQWN0aXZlSW5wdXRFZGl0b3IuZXZlbnQsXG5cdFx0XHRyZWZyZXNoUGFyc2VkSW5wdXQ6ICgpID0+IHsgfSxcblx0XHR9IGFzIHVua25vd24gYXMgSUNoYXRXaWRnZXQ7XG5cdFx0Y29uc3QgbW9kZWwgPSBzdG9yZS5hZGQobmV3IENoYXREeW5hbWljVmFyaWFibGVNb2RlbCh3aWRnZXQsIHtcblx0XHRcdGdldFVyaUxhYmVsOiAoKSA9PiAnJyxcblx0XHR9IGFzIHVua25vd24gYXMgSUxhYmVsU2VydmljZSkpO1xuXG5cdFx0bW9kZWwuYWRkUmVmZXJlbmNlKHRvQXR0YWNoZWRDb250ZXh0RHluYW1pY1ZhcmlhYmxlKGF0dGFjaG1lbnQsIG5ldyBSYW5nZSgxLCAxLCAxLCAyMCkpKTtcblx0XHRhdHRhY2htZW50cy5sZW5ndGggPSAwO1xuXHRcdG9uRGlkQ2hhbmdlQXR0YWNobWVudHMuZmlyZSh7IGRlbGV0ZWQ6IFthdHRhY2htZW50LmlkXSwgYWRkZWQ6IFtdLCB1cGRhdGVkOiBbXSB9KTtcblxuXHRcdGNvbnN0IGlucHV0U3RhdGU6IFJlY29yZDxzdHJpbmcsIHVua25vd24+ID0ge307XG5cdFx0bW9kZWwuZ2V0SW5wdXRTdGF0ZShpbnB1dFN0YXRlKTtcblx0XHRjb25zdCBzZXJpYWxpemVkUmVmZXJlbmNlID0gKGlucHV0U3RhdGVbQ2hhdER5bmFtaWNWYXJpYWJsZU1vZGVsLklEXSBhcyBJRHluYW1pY1ZhcmlhYmxlW10pWzBdO1xuXHRcdGNvbnN0IHJlcXVlc3RSZWZlcmVuY2UgPSBtb2RlbC52YXJpYWJsZXNbMF07XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRzZXJpYWxpemVkRGF0YTogc2VyaWFsaXplZFJlZmVyZW5jZS5kYXRhLFxuXHRcdFx0cmVxdWVzdERhdGE6IHJlcXVlc3RSZWZlcmVuY2UuZGF0YSxcblx0XHRcdGhhc1NlcmlhbGl6ZWRBdHRhY2htZW50OiBPYmplY3QuaGFzT3duKHNlcmlhbGl6ZWRSZWZlcmVuY2UsICdhdHRhY2htZW50JyksXG5cdFx0XHRoYXNSZXF1ZXN0QXR0YWNobWVudDogT2JqZWN0Lmhhc093bihyZXF1ZXN0UmVmZXJlbmNlLCAnYXR0YWNobWVudCcpLFxuXHRcdH0sIHtcblx0XHRcdHNlcmlhbGl6ZWREYXRhOiB1bmRlZmluZWQsXG5cdFx0XHRyZXF1ZXN0RGF0YTogdW5kZWZpbmVkLFxuXHRcdFx0aGFzU2VyaWFsaXplZEF0dGFjaG1lbnQ6IGZhbHNlLFxuXHRcdFx0aGFzUmVxdWVzdEF0dGFjaG1lbnQ6IGZhbHNlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdsZWF2ZXMgaW1hZ2UgcmVmZXJlbmNlIGhvdmVycyB0byB0aGUgY3VzdG9tIGhvdmVyIHBhcnRpY2lwYW50JywgKCkgPT4ge1xuXHRcdGNvbnN0IGZvbGRlckF0dGFjaG1lbnQgPSBjcmVhdGVNb2NrQXR0YWNobWVudCh7XG5cdFx0XHRpZDogJ2ZvbGRlcicsXG5cdFx0XHRuYW1lOiAnYXNzZXRzJyxcblx0XHRcdGtpbmQ6ICdkaXJlY3RvcnknLFxuXHRcdFx0dmFsdWU6IFVSSS5maWxlKCcvd29ya3NwYWNlL2Fzc2V0cycpLFxuXHRcdH0pO1xuXHRcdGNvbnN0IGltYWdlQXR0YWNobWVudCA9IGNyZWF0ZU1vY2tBdHRhY2htZW50KHtcblx0XHRcdGlkOiAnaW1hZ2UnLFxuXHRcdFx0bmFtZTogJ3NjcmVlbnNob3QucG5nJyxcblx0XHRcdGtpbmQ6ICdpbWFnZScsXG5cdFx0XHR2YWx1ZTogbmV3IFVpbnQ4QXJyYXkoWzEsIDIsIDNdKSxcblx0XHRcdG1pbWVUeXBlOiAnaW1hZ2UvcG5nJyxcblx0XHRcdHJlZmVyZW5jZXM6IFt7IHJlZmVyZW5jZTogVVJJLmZpbGUoJy93b3Jrc3BhY2Uvc2NyZWVuc2hvdC5wbmcnKSwga2luZDogJ3JlZmVyZW5jZScgfV0sXG5cdFx0fSk7XG5cdFx0Y29uc3QgYXR0YWNobWVudHMgPSBbZm9sZGVyQXR0YWNobWVudCwgaW1hZ2VBdHRhY2htZW50XTtcblx0XHRjb25zdCBvbkRpZENoYW5nZU1vZGVsQ29udGVudCA9IHN0b3JlLmFkZChuZXcgRW1pdHRlcjx7IGNoYW5nZXM6IHJlYWRvbmx5IHVua25vd25bXSB9PigpKTtcblx0XHRjb25zdCBvbkRpZENoYW5nZUFjdGl2ZUlucHV0RWRpdG9yID0gc3RvcmUuYWRkKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRcdGNvbnN0IG9uRGlkQ2hhbmdlQXR0YWNobWVudHMgPSBzdG9yZS5hZGQobmV3IEVtaXR0ZXI8eyBkZWxldGVkOiByZWFkb25seSBzdHJpbmdbXTsgYWRkZWQ6IHJlYWRvbmx5IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnlbXTsgdXBkYXRlZDogcmVhZG9ubHkgSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeVtdIH0+KCkpO1xuXHRcdGxldCBmb2xkZXJIb3ZlciA9ICcnO1xuXHRcdGxldCBoYXNJbWFnZURlY29yYXRpb25Ib3ZlciA9IGZhbHNlO1xuXHRcdGNvbnN0IHdpZGdldCA9IHtcblx0XHRcdGlucHV0OiB7XG5cdFx0XHRcdGF0dGFjaG1lbnRNb2RlbDoge1xuXHRcdFx0XHRcdGF0dGFjaG1lbnRzLFxuXHRcdFx0XHRcdG9uRGlkQ2hhbmdlOiBvbkRpZENoYW5nZUF0dGFjaG1lbnRzLmV2ZW50LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHRcdGlucHV0RWRpdG9yOiB7XG5cdFx0XHRcdG9uRGlkQ2hhbmdlTW9kZWxDb250ZW50OiBvbkRpZENoYW5nZU1vZGVsQ29udGVudC5ldmVudCxcblx0XHRcdFx0Z2V0TW9kZWw6ICgpID0+ICh7XG5cdFx0XHRcdFx0Z2V0VmFsdWVJblJhbmdlOiAoKSA9PiAnI2F0dGFjaG1lbnQnLFxuXHRcdFx0XHRcdGdldERlY29yYXRpb25SYW5nZTogKCkgPT4gbmV3IFJhbmdlKDEsIDEsIDEsIDIwKSxcblx0XHRcdFx0XHRnZXRPZmZzZXRBdDogKHBvc2l0aW9uOiB7IGNvbHVtbjogbnVtYmVyIH0pID0+IHBvc2l0aW9uLmNvbHVtbiAtIDEsXG5cdFx0XHRcdH0pLFxuXHRcdFx0XHRzZXREZWNvcmF0aW9uc0J5VHlwZTogKF9vd25lcjogc3RyaW5nLCBfdHlwZTogc3RyaW5nLCBkZWNvcmF0aW9uczogQXJyYXk8eyBob3Zlck1lc3NhZ2U/OiB7IHZhbHVlOiBzdHJpbmcgfSB9PikgPT4ge1xuXHRcdFx0XHRcdGZvciAoY29uc3QgZGVjb3JhdGlvbiBvZiBkZWNvcmF0aW9ucykge1xuXHRcdFx0XHRcdFx0Y29uc3QgdmFsdWUgPSBkZWNvcmF0aW9uLmhvdmVyTWVzc2FnZT8udmFsdWUgPz8gJyc7XG5cdFx0XHRcdFx0XHRpZiAodmFsdWUuaW5jbHVkZXMoJ3dvcmtzcGFjZS9hc3NldHMnKSkge1xuXHRcdFx0XHRcdFx0XHRmb2xkZXJIb3ZlciA9IHZhbHVlO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0aWYgKHZhbHVlLmluY2x1ZGVzKCdzY3JlZW5zaG90LnBuZycpKSB7XG5cdFx0XHRcdFx0XHRcdGhhc0ltYWdlRGVjb3JhdGlvbkhvdmVyID0gdHJ1ZTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIGRlY29yYXRpb25zLm1hcCgoXywgaW5kZXgpID0+IFN0cmluZyhpbmRleCkpO1xuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHRcdG9uRGlkQ2hhbmdlQWN0aXZlSW5wdXRFZGl0b3I6IG9uRGlkQ2hhbmdlQWN0aXZlSW5wdXRFZGl0b3IuZXZlbnQsXG5cdFx0XHRyZWZyZXNoUGFyc2VkSW5wdXQ6ICgpID0+IHsgfSxcblx0XHR9IGFzIHVua25vd24gYXMgSUNoYXRXaWRnZXQ7XG5cdFx0Y29uc3QgbW9kZWwgPSBzdG9yZS5hZGQobmV3IENoYXREeW5hbWljVmFyaWFibGVNb2RlbCh3aWRnZXQsIHtcblx0XHRcdGdldFVyaUxhYmVsOiAodXJpOiBVUkkpID0+IHVyaS5wYXRoLnNsaWNlKDEpLFxuXHRcdH0gYXMgdW5rbm93biBhcyBJTGFiZWxTZXJ2aWNlKSk7XG5cblx0XHRtb2RlbC5hZGRSZWZlcmVuY2UodG9BdHRhY2hlZENvbnRleHREeW5hbWljVmFyaWFibGUoZm9sZGVyQXR0YWNobWVudCwgbmV3IFJhbmdlKDEsIDEsIDEsIDIwKSkpO1xuXHRcdG1vZGVsLmFkZFJlZmVyZW5jZSh0b0F0dGFjaGVkQ29udGV4dER5bmFtaWNWYXJpYWJsZShpbWFnZUF0dGFjaG1lbnQsIG5ldyBSYW5nZSgyLCAxLCAyLCAyMCkpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Zm9sZGVySG92ZXIsXG5cdFx0XHRoYXNJbWFnZURlY29yYXRpb25Ib3Zlcixcblx0XHR9LCB7XG5cdFx0XHRmb2xkZXJIb3ZlcjogJ3dvcmtzcGFjZS9hc3NldHMnLFxuXHRcdFx0aGFzSW1hZ2VEZWNvcmF0aW9uSG92ZXI6IGZhbHNlLFxuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsZUFBZTtBQUN4QixTQUFTLCtDQUErQztBQUN4RCxTQUFTLFdBQVc7QUFDcEIsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxh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
