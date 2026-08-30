import assert from "assert";
import { CancellationToken } from "../../../../../base/common/cancellation.js";
import { createStringDataTransferItem, VSDataTransfer } from "../../../../../base/common/dataTransfer.js";
import { Emitter } from "../../../../../base/common/event.js";
import { DisposableStore } from "../../../../../base/common/lifecycle.js";
import { Mimes } from "../../../../../base/common/mime.js";
import { Schemas } from "../../../../../base/common/network.js";
import { observableValue } from "../../../../../base/common/observable.js";
import { URI } from "../../../../../base/common/uri.js";
import { mock } from "../../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { Range } from "../../../../../editor/common/core/range.js";
import { DocumentPasteTriggerKind } from "../../../../../editor/common/languages.js";
import { createTextModel } from "../../../../../editor/test/common/testTextModel.js";
import { withTestCodeEditor } from "../../../../../editor/test/browser/testCodeEditor.js";
import { ServiceCollection } from "../../../../../platform/instantiation/common/serviceCollection.js";
import { PasteTextProvider } from "../../../../../workbench/contrib/chat/browser/widget/input/editor/chatPasteProviders.js";
import { isPastedTextArtifact } from "../../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js";
import { IChatSessionsService } from "../../../../../workbench/contrib/chat/common/chatSessionsService.js";
import { ISessionContext } from "../../../../services/sessions/browser/sessionContext.js";
import { AgentHostInputCompletionHandler } from "../../browser/agentHostInputCompletions.js";
import { NewChatInputPasteTarget } from "../../browser/newChatInputPasteTarget.js";
class TestAttachments {
  constructor() {
    this._onDidChangeContext = new Emitter();
    this.onDidChangeContext = this._onDidChangeContext.event;
    this._attachments = [];
  }
  get attachments() {
    return this._attachments;
  }
  setAttachments(entries) {
    this._attachments.length = 0;
    this._attachments.push(...entries);
    this._onDidChangeContext.fire();
  }
  addAttachments(...entries) {
    for (const entry of entries) {
      if (!this._attachments.some((e) => e.id === entry.id)) {
        this._attachments.push(entry);
      }
    }
    this._onDidChangeContext.fire();
  }
  removeAttachment(id) {
    const index = this._attachments.findIndex((e) => e.id === id);
    if (index >= 0) {
      this._attachments.splice(index, 1);
      this._onDidChangeContext.fire();
    }
  }
  dispose() {
    this._onDidChangeContext.dispose();
  }
}
suite("NewChatInputPasteTarget", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  async function runPasteLifecycle(pastedText, act) {
    const snapshots = [];
    const model = store.add(createTextModel("", null, void 0, URI.from({ scheme: Schemas.sessionsChatInput, path: "input-test" })));
    const services = new ServiceCollection(
      [ISessionContext, { _serviceBrand: void 0, session: observableValue("session", void 0) }],
      [IChatSessionsService, new class extends mock() {
      }()]
    );
    await withTestCodeEditor(model, { serviceCollection: services }, async (editor, _viewModel, instantiationService) => {
      const local = new DisposableStore();
      try {
        const attachments = local.add(new TestAttachments());
        const completionHandler = local.add(instantiationService.createInstance(AgentHostInputCompletionHandler, editor, attachments));
        const target = new NewChatInputPasteTarget(
          editor,
          attachments,
          completionHandler,
          () => void 0,
          () => void 0,
          model.uri
        );
        const pasteTargetService = new class extends mock() {
          getTarget(uri) {
            return uri.toString() === model.uri.toString() ? target : void 0;
          }
        }();
        const provider = new PasteTextProvider(
          pasteTargetService,
          new class extends mock() {
          }(),
          new class extends mock() {
          }()
        );
        const transfer = new VSDataTransfer();
        transfer.append(Mimes.text, createStringDataTransferItem(pastedText));
        const session = await provider.provideDocumentPasteEdits(
          model,
          [new Range(1, 1, 1, 1)],
          transfer,
          { triggerKind: DocumentPasteTriggerKind.Automatic },
          CancellationToken.None
        );
        const edit = session?.edits[0];
        const customEdit = edit?.additionalEdit?.edits[0];
        assert.ok(edit && customEdit, "a long paste should produce an attachment edit");
        const snapshot = (stage) => {
          const attachment = attachments.attachments.at(0);
          const rawValue = model.getValue();
          const message = rawValue.trim();
          const sent = completionHandler.getAttachmentsForSend(message, rawValue.length - rawValue.trimStart().length);
          snapshots.push({
            stage,
            value: rawValue,
            attachments: attachments.attachments.map((a) => a.name),
            code: attachment && isPastedTextArtifact(attachment) ? attachment.code : void 0,
            sent: sent.map((entry) => ({
              name: entry.name,
              text: entry.range ? message.slice(entry.range.start, entry.range.endExclusive) : ""
            }))
          });
        };
        editor.executeEdits("test.paste", [{ range: new Range(1, 1, 1, 1), text: edit.insertText }]);
        model.pushStackElement();
        await customEdit.redo();
        snapshot("paste");
        await customEdit.undo();
        model.undo();
        snapshot("undo");
        model.redo();
        await customEdit.redo();
        snapshot("redo");
        act?.(attachments);
        snapshot("afterAct");
      } finally {
        local.dispose();
      }
    });
    return snapshots;
  }
  test("keeps the attachment and its inline reference consistent across undo and redo", async () => {
    const pastedText = "x".repeat(1200);
    const snapshots = await runPasteLifecycle(pastedText);
    const attached = { attachments: ["Pasted text #1"], codeIsPreserved: true, sent: [{ name: "Pasted text #1", text: "#attachment:Pasted text #1" }] };
    const detached = { attachments: [], codeIsPreserved: void 0, sent: [] };
    assert.deepStrictEqual(snapshots.map(({ stage, value, attachments, code, sent }) => ({
      stage,
      value,
      attachments,
      codeIsPreserved: code === void 0 ? void 0 : code === pastedText,
      sent
    })), [
      { stage: "paste", value: "#attachment:Pasted text #1 ", ...attached },
      { stage: "undo", value: "", ...detached },
      { stage: "redo", value: "#attachment:Pasted text #1 ", ...attached },
      { stage: "afterAct", value: "#attachment:Pasted text #1 ", ...attached }
    ]);
  });
  test("removing the attachment takes its inline reference out of the input", async () => {
    const pastedText = "x".repeat(1200);
    const snapshots = await runPasteLifecycle(pastedText, (attachments) => {
      attachments.removeAttachment(attachments.attachments[0].id);
    });
    assert.deepStrictEqual(snapshots.at(-1), {
      stage: "afterAct",
      value: "",
      attachments: [],
      code: void 0,
      sent: []
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcY2hhdFxcdGVzdFxcYnJvd3NlclxcbmV3Q2hhdElucHV0UGFzdGUudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IGNyZWF0ZVN0cmluZ0RhdGFUcmFuc2Zlckl0ZW0sIFZTRGF0YVRyYW5zZmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZGF0YVRyYW5zZmVyLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgTWltZXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9taW1lLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IG9ic2VydmFibGVWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IG1vY2sgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL21vY2suanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBEb2N1bWVudFBhc3RlVHJpZ2dlcktpbmQsIElDdXN0b21FZGl0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0IHsgSU1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvbW9kZWwuanMnO1xuaW1wb3J0IHsgY3JlYXRlVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL3Rlc3QvY29tbW9uL3Rlc3RUZXh0TW9kZWwuanMnO1xuaW1wb3J0IHsgd2l0aFRlc3RDb2RlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL3Rlc3QvYnJvd3Nlci90ZXN0Q29kZUVkaXRvci5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlQ29sbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL3NlcnZpY2VDb2xsZWN0aW9uLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSUNoYXRQYXN0ZVRhcmdldCwgSUNoYXRQYXN0ZVRhcmdldFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvY2hhdC5qcyc7XG5pbXBvcnQgeyBQYXN0ZVRleHRQcm92aWRlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvaW5wdXQvZWRpdG9yL2NoYXRQYXN0ZVByb3ZpZGVycy5qcyc7XG5pbXBvcnQgeyBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5LCBpc1Bhc3RlZFRleHRBcnRpZmFjdCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2F0dGFjaG1lbnRzL2NoYXRWYXJpYWJsZUVudHJpZXMuanMnO1xuaW1wb3J0IHsgSUNoYXRTZXNzaW9uc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9jaGF0U2Vzc2lvbnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBY3RpdmVTZXNzaW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvY29tbW9uL3Nlc3Npb25zTWFuYWdlbWVudC5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbkNvbnRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9icm93c2VyL3Nlc3Npb25Db250ZXh0LmpzJztcbmltcG9ydCB7IEFnZW50SG9zdElucHV0Q29tcGxldGlvbkhhbmRsZXIgfSBmcm9tICcuLi8uLi9icm93c2VyL2FnZW50SG9zdElucHV0Q29tcGxldGlvbnMuanMnO1xuaW1wb3J0IHsgSU5ld0NoYXRBdHRhY2htZW50cyB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvbmV3Q2hhdENvbnRleHRBdHRhY2htZW50cy5qcyc7XG5pbXBvcnQgeyBOZXdDaGF0SW5wdXRQYXN0ZVRhcmdldCB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvbmV3Q2hhdElucHV0UGFzdGVUYXJnZXQuanMnO1xuXG4vKiogTWluaW1hbCBzdGFuZC1pbiBmb3IgdGhlIGNvbXBvc2VyJ3MgYXR0YWNobWVudCBzdG9yZSwgd2l0aG91dCB0aGUgcGlsbCBVSS4gKi9cbmNsYXNzIFRlc3RBdHRhY2htZW50cyBpbXBsZW1lbnRzIElOZXdDaGF0QXR0YWNobWVudHMge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlQ29udGV4dCA9IG5ldyBFbWl0dGVyPHZvaWQ+KCk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlQ29udGV4dCA9IHRoaXMuX29uRGlkQ2hhbmdlQ29udGV4dC5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9hdHRhY2htZW50czogSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeVtdID0gW107XG5cblx0Z2V0IGF0dGFjaG1lbnRzKCk6IHJlYWRvbmx5IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnlbXSB7XG5cdFx0cmV0dXJuIHRoaXMuX2F0dGFjaG1lbnRzO1xuXHR9XG5cblx0c2V0QXR0YWNobWVudHMoZW50cmllczogcmVhZG9ubHkgSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeVtdKTogdm9pZCB7XG5cdFx0dGhpcy5fYXR0YWNobWVudHMubGVuZ3RoID0gMDtcblx0XHR0aGlzLl9hdHRhY2htZW50cy5wdXNoKC4uLmVudHJpZXMpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlQ29udGV4dC5maXJlKCk7XG5cdH1cblxuXHRhZGRBdHRhY2htZW50cyguLi5lbnRyaWVzOiBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5W10pOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IGVudHJ5IG9mIGVudHJpZXMpIHtcblx0XHRcdGlmICghdGhpcy5fYXR0YWNobWVudHMuc29tZShlID0+IGUuaWQgPT09IGVudHJ5LmlkKSkge1xuXHRcdFx0XHR0aGlzLl9hdHRhY2htZW50cy5wdXNoKGVudHJ5KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VDb250ZXh0LmZpcmUoKTtcblx0fVxuXG5cdHJlbW92ZUF0dGFjaG1lbnQoaWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IGluZGV4ID0gdGhpcy5fYXR0YWNobWVudHMuZmluZEluZGV4KGUgPT4gZS5pZCA9PT0gaWQpO1xuXHRcdGlmIChpbmRleCA+PSAwKSB7XG5cdFx0XHR0aGlzLl9hdHRhY2htZW50cy5zcGxpY2UoaW5kZXgsIDEpO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VDb250ZXh0LmZpcmUoKTtcblx0XHR9XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlQ29udGV4dC5kaXNwb3NlKCk7XG5cdH1cbn1cblxuc3VpdGUoJ05ld0NoYXRJbnB1dFBhc3RlVGFyZ2V0JywgKCkgPT4ge1xuXG5cdGNvbnN0IHN0b3JlID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0LyoqXG5cdCAqIERyaXZlcyBvbmUgbG9uZyBwYXN0ZSB0aHJvdWdoIHRoZSBzaGFyZWQgcGFzdGUgcGlwZWxpbmUgYWdhaW5zdCB0aGUgQWdlbnRzXG5cdCAqIGNvbXBvc2VyIGFuZCByZXR1cm5zIGEgc25hcHNob3QgYWZ0ZXIgZWFjaCBzdGFnZSBvZiB0aGUgZWRpdCdzIGxpZmVjeWNsZS5cblx0ICpcblx0ICogVGhlIHBhc3RlIGVkaXQgaXMgYXBwbGllZCB0aGUgd2F5IHRoZSBidWxrIGVkaXQgc2VydmljZSBhcHBsaWVzIGl0OiB0aGVcblx0ICogaW5zZXJ0ZWQgdGV4dCBpcyBvbmUgdW5kbyBlbGVtZW50IGFuZCB0aGUgYXR0YWNobWVudCBpcyBhIHNlY29uZCwgc28gdW5kb1xuXHQgKiBydW5zIHRoZSBjdXN0b20gZWRpdCBmaXJzdCBhbmQgdGhlIHRleHQgZWRpdCBzZWNvbmQsIGFuZCByZWRvIHRoZSByZXZlcnNlLlxuXHQgKi9cblx0YXN5bmMgZnVuY3Rpb24gcnVuUGFzdGVMaWZlY3ljbGUocGFzdGVkVGV4dDogc3RyaW5nLCBhY3Q/OiAoYXR0YWNobWVudHM6IElOZXdDaGF0QXR0YWNobWVudHMpID0+IHZvaWQpIHtcblx0XHRjb25zdCBzbmFwc2hvdHM6IHsgc3RhZ2U6IHN0cmluZzsgdmFsdWU6IHN0cmluZzsgYXR0YWNobWVudHM6IHN0cmluZ1tdOyBjb2RlOiBzdHJpbmcgfCB1bmRlZmluZWQ7IHNlbnQ6IHsgbmFtZTogc3RyaW5nOyB0ZXh0OiBzdHJpbmcgfVtdIH1bXSA9IFtdO1xuXG5cdFx0Y29uc3QgbW9kZWwgPSBzdG9yZS5hZGQoY3JlYXRlVGV4dE1vZGVsKCcnLCBudWxsLCB1bmRlZmluZWQsIFVSSS5mcm9tKHsgc2NoZW1lOiBTY2hlbWFzLnNlc3Npb25zQ2hhdElucHV0LCBwYXRoOiAnaW5wdXQtdGVzdCcgfSkpKTtcblx0XHRjb25zdCBzZXJ2aWNlcyA9IG5ldyBTZXJ2aWNlQ29sbGVjdGlvbihcblx0XHRcdFtJU2Vzc2lvbkNvbnRleHQsIHsgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLCBzZXNzaW9uOiBvYnNlcnZhYmxlVmFsdWU8SUFjdGl2ZVNlc3Npb24gfCB1bmRlZmluZWQ+KCdzZXNzaW9uJywgdW5kZWZpbmVkKSB9XSxcblx0XHRcdFtJQ2hhdFNlc3Npb25zU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQ2hhdFNlc3Npb25zU2VydmljZT4oKSB7IH1dLFxuXHRcdCk7XG5cdFx0YXdhaXQgd2l0aFRlc3RDb2RlRWRpdG9yKG1vZGVsLCB7IHNlcnZpY2VDb2xsZWN0aW9uOiBzZXJ2aWNlcyB9LCBhc3luYyAoZWRpdG9yLCBfdmlld01vZGVsLCBpbnN0YW50aWF0aW9uU2VydmljZSkgPT4ge1xuXHRcdFx0Y29uc3QgbG9jYWwgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBhdHRhY2htZW50cyA9IGxvY2FsLmFkZChuZXcgVGVzdEF0dGFjaG1lbnRzKCkpO1xuXHRcdFx0XHRjb25zdCBjb21wbGV0aW9uSGFuZGxlciA9IGxvY2FsLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBZ2VudEhvc3RJbnB1dENvbXBsZXRpb25IYW5kbGVyLCBlZGl0b3IsIGF0dGFjaG1lbnRzKSk7XG5cdFx0XHRcdGNvbnN0IHRhcmdldCA9IG5ldyBOZXdDaGF0SW5wdXRQYXN0ZVRhcmdldChcblx0XHRcdFx0XHRlZGl0b3IsXG5cdFx0XHRcdFx0YXR0YWNobWVudHMsXG5cdFx0XHRcdFx0Y29tcGxldGlvbkhhbmRsZXIsXG5cdFx0XHRcdFx0KCkgPT4gdW5kZWZpbmVkLFxuXHRcdFx0XHRcdCgpID0+IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRtb2RlbC51cmksXG5cdFx0XHRcdCk7XG5cdFx0XHRcdGNvbnN0IHBhc3RlVGFyZ2V0U2VydmljZSA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUNoYXRQYXN0ZVRhcmdldFNlcnZpY2U+KCkge1xuXHRcdFx0XHRcdG92ZXJyaWRlIGdldFRhcmdldCh1cmk6IFVSSSk6IElDaGF0UGFzdGVUYXJnZXQgfCB1bmRlZmluZWQge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHVyaS50b1N0cmluZygpID09PSBtb2RlbC51cmkudG9TdHJpbmcoKSA/IHRhcmdldCA6IHVuZGVmaW5lZDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH07XG5cdFx0XHRcdGNvbnN0IHByb3ZpZGVyID0gbmV3IFBhc3RlVGV4dFByb3ZpZGVyKFxuXHRcdFx0XHRcdHBhc3RlVGFyZ2V0U2VydmljZSxcblx0XHRcdFx0XHRuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElNb2RlbFNlcnZpY2U+KCkgeyB9LFxuXHRcdFx0XHRcdG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUxvZ1NlcnZpY2U+KCkgeyB9LFxuXHRcdFx0XHQpO1xuXG5cdFx0XHRcdGNvbnN0IHRyYW5zZmVyID0gbmV3IFZTRGF0YVRyYW5zZmVyKCk7XG5cdFx0XHRcdHRyYW5zZmVyLmFwcGVuZChNaW1lcy50ZXh0LCBjcmVhdGVTdHJpbmdEYXRhVHJhbnNmZXJJdGVtKHBhc3RlZFRleHQpKTtcblx0XHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IGF3YWl0IHByb3ZpZGVyLnByb3ZpZGVEb2N1bWVudFBhc3RlRWRpdHMoXG5cdFx0XHRcdFx0bW9kZWwsIFtuZXcgUmFuZ2UoMSwgMSwgMSwgMSldLCB0cmFuc2ZlciwgeyB0cmlnZ2VyS2luZDogRG9jdW1lbnRQYXN0ZVRyaWdnZXJLaW5kLkF1dG9tYXRpYyB9LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdFx0Y29uc3QgZWRpdCA9IHNlc3Npb24/LmVkaXRzWzBdO1xuXHRcdFx0XHRjb25zdCBjdXN0b21FZGl0ID0gZWRpdD8uYWRkaXRpb25hbEVkaXQ/LmVkaXRzWzBdIGFzIElDdXN0b21FZGl0IHwgdW5kZWZpbmVkO1xuXHRcdFx0XHRhc3NlcnQub2soZWRpdCAmJiBjdXN0b21FZGl0LCAnYSBsb25nIHBhc3RlIHNob3VsZCBwcm9kdWNlIGFuIGF0dGFjaG1lbnQgZWRpdCcpO1xuXG5cdFx0XHRcdGNvbnN0IHNuYXBzaG90ID0gKHN0YWdlOiBzdHJpbmcpID0+IHtcblx0XHRcdFx0XHRjb25zdCBhdHRhY2htZW50ID0gYXR0YWNobWVudHMuYXR0YWNobWVudHMuYXQoMCk7XG5cdFx0XHRcdFx0Ly8gV2hhdCBgX3NlbmRgIGNvbGxlY3RzOiB0aGUgdHJpbW1lZCBtZXNzYWdlIHBsdXMgdGhlIGF0dGFjaG1lbnRzXG5cdFx0XHRcdFx0Ly8gcmVzb2x2ZWQgYWdhaW5zdCBpdCwgc28gdGhlIHJhbmdlIGVhY2ggb25lIHJlcG9ydHMgaXMgdGhlIHNsaWNlXG5cdFx0XHRcdFx0Ly8gb2YgdGhlIG91dGdvaW5nIG1lc3NhZ2UgaXRzIHJlZmVyZW5jZSBvY2N1cGllcy5cblx0XHRcdFx0XHRjb25zdCByYXdWYWx1ZSA9IG1vZGVsLmdldFZhbHVlKCk7XG5cdFx0XHRcdFx0Y29uc3QgbWVzc2FnZSA9IHJhd1ZhbHVlLnRyaW0oKTtcblx0XHRcdFx0XHRjb25zdCBzZW50ID0gY29tcGxldGlvbkhhbmRsZXIuZ2V0QXR0YWNobWVudHNGb3JTZW5kKG1lc3NhZ2UsIHJhd1ZhbHVlLmxlbmd0aCAtIHJhd1ZhbHVlLnRyaW1TdGFydCgpLmxlbmd0aCk7XG5cdFx0XHRcdFx0c25hcHNob3RzLnB1c2goe1xuXHRcdFx0XHRcdFx0c3RhZ2UsXG5cdFx0XHRcdFx0XHR2YWx1ZTogcmF3VmFsdWUsXG5cdFx0XHRcdFx0XHRhdHRhY2htZW50czogYXR0YWNobWVudHMuYXR0YWNobWVudHMubWFwKGEgPT4gYS5uYW1lKSxcblx0XHRcdFx0XHRcdGNvZGU6IGF0dGFjaG1lbnQgJiYgaXNQYXN0ZWRUZXh0QXJ0aWZhY3QoYXR0YWNobWVudCkgPyBhdHRhY2htZW50LmNvZGUgOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRzZW50OiBzZW50Lm1hcChlbnRyeSA9PiAoe1xuXHRcdFx0XHRcdFx0XHRuYW1lOiBlbnRyeS5uYW1lLFxuXHRcdFx0XHRcdFx0XHR0ZXh0OiBlbnRyeS5yYW5nZSA/IG1lc3NhZ2Uuc2xpY2UoZW50cnkucmFuZ2Uuc3RhcnQsIGVudHJ5LnJhbmdlLmVuZEV4Y2x1c2l2ZSkgOiAnJyxcblx0XHRcdFx0XHRcdH0pKSxcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fTtcblxuXHRcdFx0XHRlZGl0b3IuZXhlY3V0ZUVkaXRzKCd0ZXN0LnBhc3RlJywgW3sgcmFuZ2U6IG5ldyBSYW5nZSgxLCAxLCAxLCAxKSwgdGV4dDogZWRpdC5pbnNlcnRUZXh0IGFzIHN0cmluZyB9XSk7XG5cdFx0XHRcdG1vZGVsLnB1c2hTdGFja0VsZW1lbnQoKTtcblx0XHRcdFx0YXdhaXQgY3VzdG9tRWRpdC5yZWRvKCk7XG5cdFx0XHRcdHNuYXBzaG90KCdwYXN0ZScpO1xuXG5cdFx0XHRcdGF3YWl0IGN1c3RvbUVkaXQudW5kbygpO1xuXHRcdFx0XHRtb2RlbC51bmRvKCk7XG5cdFx0XHRcdHNuYXBzaG90KCd1bmRvJyk7XG5cblx0XHRcdFx0bW9kZWwucmVkbygpO1xuXHRcdFx0XHRhd2FpdCBjdXN0b21FZGl0LnJlZG8oKTtcblx0XHRcdFx0c25hcHNob3QoJ3JlZG8nKTtcblxuXHRcdFx0XHRhY3Q/LihhdHRhY2htZW50cyk7XG5cdFx0XHRcdHNuYXBzaG90KCdhZnRlckFjdCcpO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0bG9jYWwuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIHNuYXBzaG90cztcblx0fVxuXG5cdHRlc3QoJ2tlZXBzIHRoZSBhdHRhY2htZW50IGFuZCBpdHMgaW5saW5lIHJlZmVyZW5jZSBjb25zaXN0ZW50IGFjcm9zcyB1bmRvIGFuZCByZWRvJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHBhc3RlZFRleHQgPSAneCcucmVwZWF0KDEyMDApO1xuXHRcdGNvbnN0IHNuYXBzaG90cyA9IGF3YWl0IHJ1blBhc3RlTGlmZWN5Y2xlKHBhc3RlZFRleHQpO1xuXG5cdFx0Y29uc3QgYXR0YWNoZWQgPSB7IGF0dGFjaG1lbnRzOiBbJ1Bhc3RlZCB0ZXh0ICMxJ10sIGNvZGVJc1ByZXNlcnZlZDogdHJ1ZSwgc2VudDogW3sgbmFtZTogJ1Bhc3RlZCB0ZXh0ICMxJywgdGV4dDogJyNhdHRhY2htZW50OlBhc3RlZCB0ZXh0ICMxJyB9XSB9O1xuXHRcdGNvbnN0IGRldGFjaGVkID0geyBhdHRhY2htZW50czogW10sIGNvZGVJc1ByZXNlcnZlZDogdW5kZWZpbmVkLCBzZW50OiBbXSB9O1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzbmFwc2hvdHMubWFwKCh7IHN0YWdlLCB2YWx1ZSwgYXR0YWNobWVudHMsIGNvZGUsIHNlbnQgfSkgPT4gKHtcblx0XHRcdHN0YWdlLFxuXHRcdFx0dmFsdWUsXG5cdFx0XHRhdHRhY2htZW50cyxcblx0XHRcdGNvZGVJc1ByZXNlcnZlZDogY29kZSA9PT0gdW5kZWZpbmVkID8gdW5kZWZpbmVkIDogY29kZSA9PT0gcGFzdGVkVGV4dCxcblx0XHRcdHNlbnQsXG5cdFx0fSkpLCBbXG5cdFx0XHR7IHN0YWdlOiAncGFzdGUnLCB2YWx1ZTogJyNhdHRhY2htZW50OlBhc3RlZCB0ZXh0ICMxICcsIC4uLmF0dGFjaGVkIH0sXG5cdFx0XHR7IHN0YWdlOiAndW5kbycsIHZhbHVlOiAnJywgLi4uZGV0YWNoZWQgfSxcblx0XHRcdHsgc3RhZ2U6ICdyZWRvJywgdmFsdWU6ICcjYXR0YWNobWVudDpQYXN0ZWQgdGV4dCAjMSAnLCAuLi5hdHRhY2hlZCB9LFxuXHRcdFx0eyBzdGFnZTogJ2FmdGVyQWN0JywgdmFsdWU6ICcjYXR0YWNobWVudDpQYXN0ZWQgdGV4dCAjMSAnLCAuLi5hdHRhY2hlZCB9LFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZW1vdmluZyB0aGUgYXR0YWNobWVudCB0YWtlcyBpdHMgaW5saW5lIHJlZmVyZW5jZSBvdXQgb2YgdGhlIGlucHV0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHBhc3RlZFRleHQgPSAneCcucmVwZWF0KDEyMDApO1xuXHRcdGNvbnN0IHNuYXBzaG90cyA9IGF3YWl0IHJ1blBhc3RlTGlmZWN5Y2xlKHBhc3RlZFRleHQsIGF0dGFjaG1lbnRzID0+IHtcblx0XHRcdGF0dGFjaG1lbnRzLnJlbW92ZUF0dGFjaG1lbnQoYXR0YWNobWVudHMuYXR0YWNobWVudHNbMF0uaWQpO1xuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzbmFwc2hvdHMuYXQoLTEpLCB7XG5cdFx0XHRzdGFnZTogJ2FmdGVyQWN0Jyxcblx0XHRcdHZhbHVlOiAnJyxcblx0XHRcdGF0dGFjaG1lbnRzOiBbXSxcblx0XHRcdGNvZGU6IHVuZGVmaW5lZCxcblx0XHRcdHNlbnQ6IFtdLFxuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0Es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
