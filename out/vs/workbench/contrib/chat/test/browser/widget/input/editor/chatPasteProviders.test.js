import assert from "assert";
import { CancellationToken } from "../../../../../../../../base/common/cancellation.js";
import { createStringDataTransferItem, VSDataTransfer } from "../../../../../../../../base/common/dataTransfer.js";
import { Mimes } from "../../../../../../../../base/common/mime.js";
import { Schemas } from "../../../../../../../../base/common/network.js";
import { URI } from "../../../../../../../../base/common/uri.js";
import { mock, upcastPartial } from "../../../../../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../../../base/test/common/utils.js";
import { Range } from "../../../../../../../../editor/common/core/range.js";
import { DocumentPasteTriggerKind } from "../../../../../../../../editor/common/languages.js";
import { TestInstantiationService } from "../../../../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { IChatSessionsService } from "../../../../../common/chatSessionsService.js";
import { CHAT_ATTACHMENT_MIME_TYPE, createPastedTextArtifact, PasteTextProvider } from "../../../../../browser/widget/input/editor/chatPasteProviders.js";
import { ChatPasteAttachmentMetadata } from "../../../../../common/attachments/chatVariableEntries.js";
import { isSupportedChatFileScheme } from "../../../../../common/constants.js";
import { ChatResponseResource } from "../../../../../common/model/chatModel.js";
suite("Chat Paste Providers", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  test("does not offer an opened artifact back as attachable context", () => {
    const instantiationService = store.add(new TestInstantiationService());
    instantiationService.stub(IChatSessionsService, new class extends mock() {
      getContentProviderSchemes() {
        return [];
      }
    }());
    assert.strictEqual(
      instantiationService.invokeFunction((accessor) => isSupportedChatFileScheme(accessor, ChatResponseResource.scheme)),
      false
    );
  });
  test("creates sequential artifacts only for long pasted text", () => {
    const longText = "x".repeat(1e3);
    const first = createPastedTextArtifact(longText, []);
    assert.ok(first);
    const second = createPastedTextArtifact(`${longText}
second line`, [first.attachment]);
    assert.ok(second);
    assert.deepStrictEqual({
      belowThreshold: createPastedTextArtifact("x".repeat(999), []),
      first: {
        name: first.attachment.name,
        referenceText: first.referenceText,
        codeIsPreserved: first.attachment.code === longText,
        language: first.attachment.language,
        fileName: first.attachment.fileName,
        pastedLines: first.attachment.pastedLines,
        metadataKind: first.attachment._meta?.[ChatPasteAttachmentMetadata.Kind],
        isTextArtifact: first.attachment._meta?.[ChatPasteAttachmentMetadata.TextArtifact]
      },
      second: {
        name: second.attachment.name,
        referenceText: second.referenceText,
        pastedLines: second.attachment.pastedLines
      }
    }, {
      belowThreshold: void 0,
      first: {
        name: "Pasted text #1",
        referenceText: "#attachment:Pasted text #1",
        codeIsPreserved: true,
        language: "plaintext",
        fileName: "Pasted text #1",
        pastedLines: "1 line",
        metadataKind: "paste",
        isTextArtifact: true
      },
      second: {
        name: "Pasted text #2",
        referenceText: "#attachment:Pasted text #2",
        pastedLines: "2 lines"
      }
    });
  });
  test("replaces a long plain-text paste with an inline attachment reference", async () => {
    const attachments = [];
    const inlineAttachments = [];
    let isTerminalCommandPaste = false;
    const target = {
      sessionResource: URI.parse("chat-session:/test"),
      get attachments() {
        return attachments;
      },
      get inlineReferences() {
        return [];
      },
      addAttachments: (entries) => attachments.push(...entries),
      removeAttachments: (ids) => {
        for (const id of ids) {
          const index = attachments.findIndex((attachment) => attachment.id === id);
          if (index >= 0) {
            attachments.splice(index, 1);
          }
        }
      },
      addInlineAttachment: (entry, text, range) => {
        attachments.push(entry);
        inlineAttachments.push({ entry, text, range });
      },
      addInlineReference: () => {
      },
      isTerminalCommandPaste: () => isTerminalCommandPaste
    };
    const modelUri = URI.from({ scheme: Schemas.vscodeChatInput, path: "paste-test" });
    const pasteTargetService = new class extends mock() {
      getTarget(uri) {
        return uri === modelUri ? target : void 0;
      }
    }();
    const provider = new PasteTextProvider(
      pasteTargetService,
      new class extends mock() {
      }(),
      new class extends mock() {
      }()
    );
    const model = upcastPartial({
      uri: modelUri,
      getOffsetAt: (position) => position.column - 1
    });
    const longText = "x".repeat(1e3);
    const transferOf = (entries) => {
      const transfer = new VSDataTransfer();
      for (const [mime, value] of Object.entries(entries)) {
        transfer.append(mime, createStringDataTransferItem(value));
      }
      return transfer;
    };
    const pasteInto = (transfer, ranges = [new Range(1, 1, 1, 1)]) => provider.provideDocumentPasteEdits(model, ranges, transfer, { triggerKind: DocumentPasteTriggerKind.Automatic }, CancellationToken.None);
    const plainText = transferOf({ [Mimes.text]: longText });
    const session = await pasteInto(plainText, [new Range(1, 8, 1, 8)]);
    const edit = session?.edits[0];
    const customEdit = edit?.additionalEdit?.edits[0];
    await customEdit?.redo();
    const htmlSession = await pasteInto(transferOf({ [Mimes.text]: longText, [Mimes.html]: `<strong>${longText}</strong>` }));
    const shortHtmlSession = await pasteInto(transferOf({ [Mimes.text]: "hi", [Mimes.html]: "<strong>hi</strong>" }));
    const attachmentSession = await pasteInto(transferOf({ [Mimes.text]: longText, [CHAT_ATTACHMENT_MIME_TYPE]: "{}" }));
    const multiCursorSession = await pasteInto(plainText, [new Range(1, 1, 1, 1), new Range(1, 2, 1, 2)]);
    isTerminalCommandPaste = true;
    const terminalCommandSession = await pasteInto(plainText);
    assert.deepStrictEqual({
      handlesPlainText: provider.pasteMimeTypes.includes(Mimes.text),
      longHtmlStillBecomesAnArtifact: htmlSession?.edits[0]?.title,
      leavesShortHtmlToHtmlPaste: shortHtmlSession,
      leavesCopiedChatAttachmentsToAttachmentPaste: attachmentSession,
      leavesMultipleCursorsToPlainTextPaste: multiCursorSession,
      leavesTerminalCommandsAsText: terminalCommandSession,
      insertText: edit?.insertText,
      title: edit?.title,
      attachment: attachments.map((attachment) => ({
        name: attachment.name,
        kind: attachment.kind,
        valueIsPreserved: attachment.value === longText
      })),
      references: inlineAttachments.map((inline) => ({
        idMatchesAttachment: inline.entry.id === attachments[0]?.id,
        name: inline.entry.name,
        text: inline.text,
        range: inline.range
      }))
    }, {
      handlesPlainText: true,
      longHtmlStillBecomesAnArtifact: "Pasted Text Attachment",
      leavesShortHtmlToHtmlPaste: void 0,
      leavesCopiedChatAttachmentsToAttachmentPaste: void 0,
      leavesMultipleCursorsToPlainTextPaste: void 0,
      leavesTerminalCommandsAsText: void 0,
      insertText: "#attachment:Pasted text #1 ",
      title: "Pasted Text Attachment",
      attachment: [{
        name: "Pasted text #1",
        kind: "paste",
        valueIsPreserved: true
      }],
      references: [{
        idMatchesAttachment: true,
        name: "Pasted text #1",
        text: "#attachment:Pasted text #1",
        range: new Range(1, 8, 1, 34)
      }]
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGJyb3dzZXJcXHdpZGdldFxcaW5wdXRcXGVkaXRvclxcY2hhdFBhc3RlUHJvdmlkZXJzLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBjcmVhdGVTdHJpbmdEYXRhVHJhbnNmZXJJdGVtLCBWU0RhdGFUcmFuc2ZlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2RhdGFUcmFuc2Zlci5qcyc7XG5pbXBvcnQgeyBNaW1lcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21pbWUuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IG1vY2ssIHVwY2FzdFBhcnRpYWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL21vY2suanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBJUmFuZ2UsIFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IERvY3VtZW50UGFzdGVUcmlnZ2VyS2luZCwgSUN1c3RvbUVkaXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBJTW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9tb2RlbC5qcyc7XG5pbXBvcnQgeyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL3Rlc3QvY29tbW9uL2luc3RhbnRpYXRpb25TZXJ2aWNlTW9jay5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElDaGF0UGFzdGVUYXJnZXQsIElDaGF0UGFzdGVUYXJnZXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYnJvd3Nlci9jaGF0LmpzJztcbmltcG9ydCB7IElDaGF0U2Vzc2lvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vY29tbW9uL2NoYXRTZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ0hBVF9BVFRBQ0hNRU5UX01JTUVfVFlQRSwgY3JlYXRlUGFzdGVkVGV4dEFydGlmYWN0LCBQYXN0ZVRleHRQcm92aWRlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jyb3dzZXIvd2lkZ2V0L2lucHV0L2VkaXRvci9jaGF0UGFzdGVQcm92aWRlcnMuanMnO1xuaW1wb3J0IHsgQ2hhdFBhc3RlQXR0YWNobWVudE1ldGFkYXRhLCBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vY29tbW9uL2F0dGFjaG1lbnRzL2NoYXRWYXJpYWJsZUVudHJpZXMuanMnO1xuaW1wb3J0IHsgaXNTdXBwb3J0ZWRDaGF0RmlsZVNjaGVtZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2NvbW1vbi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgQ2hhdFJlc3BvbnNlUmVzb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9jb21tb24vbW9kZWwvY2hhdE1vZGVsLmpzJztcblxuc3VpdGUoJ0NoYXQgUGFzdGUgUHJvdmlkZXJzJywgKCkgPT4ge1xuXHRjb25zdCBzdG9yZSA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ2RvZXMgbm90IG9mZmVyIGFuIG9wZW5lZCBhcnRpZmFjdCBiYWNrIGFzIGF0dGFjaGFibGUgY29udGV4dCcsICgpID0+IHtcblx0XHQvLyBPcGVuaW5nIGFuIGFydGlmYWN0IG1ha2VzIGl0IHRoZSBhY3RpdmUgZWRpdG9yOyBvZmZlcmluZyBpdCBhcyBjb250ZXh0XG5cdFx0Ly8gd291bGQgcmUtYXR0YWNoIHRleHQgdGhlIGF0dGFjaG1lbnQgYWxyZWFkeSBjYXJyaWVzLlxuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gc3RvcmUuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdFNlc3Npb25zU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQ2hhdFNlc3Npb25zU2VydmljZT4oKSB7XG5cdFx0XHRvdmVycmlkZSBnZXRDb250ZW50UHJvdmlkZXJTY2hlbWVzKCk6IHN0cmluZ1tdIHsgcmV0dXJuIFtdOyB9XG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihhY2Nlc3NvciA9PiBpc1N1cHBvcnRlZENoYXRGaWxlU2NoZW1lKGFjY2Vzc29yLCBDaGF0UmVzcG9uc2VSZXNvdXJjZS5zY2hlbWUpKSxcblx0XHRcdGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnY3JlYXRlcyBzZXF1ZW50aWFsIGFydGlmYWN0cyBvbmx5IGZvciBsb25nIHBhc3RlZCB0ZXh0JywgKCkgPT4ge1xuXHRcdGNvbnN0IGxvbmdUZXh0ID0gJ3gnLnJlcGVhdCgxMDAwKTtcblx0XHRjb25zdCBmaXJzdCA9IGNyZWF0ZVBhc3RlZFRleHRBcnRpZmFjdChsb25nVGV4dCwgW10pO1xuXHRcdGFzc2VydC5vayhmaXJzdCk7XG5cdFx0Y29uc3Qgc2Vjb25kID0gY3JlYXRlUGFzdGVkVGV4dEFydGlmYWN0KGAke2xvbmdUZXh0fVxcbnNlY29uZCBsaW5lYCwgW2ZpcnN0LmF0dGFjaG1lbnRdKTtcblx0XHRhc3NlcnQub2soc2Vjb25kKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0YmVsb3dUaHJlc2hvbGQ6IGNyZWF0ZVBhc3RlZFRleHRBcnRpZmFjdCgneCcucmVwZWF0KDk5OSksIFtdKSxcblx0XHRcdGZpcnN0OiB7XG5cdFx0XHRcdG5hbWU6IGZpcnN0LmF0dGFjaG1lbnQubmFtZSxcblx0XHRcdFx0cmVmZXJlbmNlVGV4dDogZmlyc3QucmVmZXJlbmNlVGV4dCxcblx0XHRcdFx0Y29kZUlzUHJlc2VydmVkOiBmaXJzdC5hdHRhY2htZW50LmNvZGUgPT09IGxvbmdUZXh0LFxuXHRcdFx0XHRsYW5ndWFnZTogZmlyc3QuYXR0YWNobWVudC5sYW5ndWFnZSxcblx0XHRcdFx0ZmlsZU5hbWU6IGZpcnN0LmF0dGFjaG1lbnQuZmlsZU5hbWUsXG5cdFx0XHRcdHBhc3RlZExpbmVzOiBmaXJzdC5hdHRhY2htZW50LnBhc3RlZExpbmVzLFxuXHRcdFx0XHRtZXRhZGF0YUtpbmQ6IGZpcnN0LmF0dGFjaG1lbnQuX21ldGE/LltDaGF0UGFzdGVBdHRhY2htZW50TWV0YWRhdGEuS2luZF0sXG5cdFx0XHRcdGlzVGV4dEFydGlmYWN0OiBmaXJzdC5hdHRhY2htZW50Ll9tZXRhPy5bQ2hhdFBhc3RlQXR0YWNobWVudE1ldGFkYXRhLlRleHRBcnRpZmFjdF0sXG5cdFx0XHR9LFxuXHRcdFx0c2Vjb25kOiB7XG5cdFx0XHRcdG5hbWU6IHNlY29uZC5hdHRhY2htZW50Lm5hbWUsXG5cdFx0XHRcdHJlZmVyZW5jZVRleHQ6IHNlY29uZC5yZWZlcmVuY2VUZXh0LFxuXHRcdFx0XHRwYXN0ZWRMaW5lczogc2Vjb25kLmF0dGFjaG1lbnQucGFzdGVkTGluZXMsXG5cdFx0XHR9LFxuXHRcdH0sIHtcblx0XHRcdGJlbG93VGhyZXNob2xkOiB1bmRlZmluZWQsXG5cdFx0XHRmaXJzdDoge1xuXHRcdFx0XHRuYW1lOiAnUGFzdGVkIHRleHQgIzEnLFxuXHRcdFx0XHRyZWZlcmVuY2VUZXh0OiAnI2F0dGFjaG1lbnQ6UGFzdGVkIHRleHQgIzEnLFxuXHRcdFx0XHRjb2RlSXNQcmVzZXJ2ZWQ6IHRydWUsXG5cdFx0XHRcdGxhbmd1YWdlOiAncGxhaW50ZXh0Jyxcblx0XHRcdFx0ZmlsZU5hbWU6ICdQYXN0ZWQgdGV4dCAjMScsXG5cdFx0XHRcdHBhc3RlZExpbmVzOiAnMSBsaW5lJyxcblx0XHRcdFx0bWV0YWRhdGFLaW5kOiAncGFzdGUnLFxuXHRcdFx0XHRpc1RleHRBcnRpZmFjdDogdHJ1ZSxcblx0XHRcdH0sXG5cdFx0XHRzZWNvbmQ6IHtcblx0XHRcdFx0bmFtZTogJ1Bhc3RlZCB0ZXh0ICMyJyxcblx0XHRcdFx0cmVmZXJlbmNlVGV4dDogJyNhdHRhY2htZW50OlBhc3RlZCB0ZXh0ICMyJyxcblx0XHRcdFx0cGFzdGVkTGluZXM6ICcyIGxpbmVzJyxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlcGxhY2VzIGEgbG9uZyBwbGFpbi10ZXh0IHBhc3RlIHdpdGggYW4gaW5saW5lIGF0dGFjaG1lbnQgcmVmZXJlbmNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGF0dGFjaG1lbnRzOiBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5W10gPSBbXTtcblx0XHRjb25zdCBpbmxpbmVBdHRhY2htZW50czogeyBlbnRyeTogSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeTsgdGV4dDogc3RyaW5nOyByYW5nZTogSVJhbmdlIH1bXSA9IFtdO1xuXHRcdGxldCBpc1Rlcm1pbmFsQ29tbWFuZFBhc3RlID0gZmFsc2U7XG5cdFx0Y29uc3QgdGFyZ2V0OiBJQ2hhdFBhc3RlVGFyZ2V0ID0ge1xuXHRcdFx0c2Vzc2lvblJlc291cmNlOiBVUkkucGFyc2UoJ2NoYXQtc2Vzc2lvbjovdGVzdCcpLFxuXHRcdFx0Z2V0IGF0dGFjaG1lbnRzKCkgeyByZXR1cm4gYXR0YWNobWVudHM7IH0sXG5cdFx0XHRnZXQgaW5saW5lUmVmZXJlbmNlcygpIHsgcmV0dXJuIFtdOyB9LFxuXHRcdFx0YWRkQXR0YWNobWVudHM6IGVudHJpZXMgPT4gYXR0YWNobWVudHMucHVzaCguLi5lbnRyaWVzKSxcblx0XHRcdHJlbW92ZUF0dGFjaG1lbnRzOiBpZHMgPT4ge1xuXHRcdFx0XHRmb3IgKGNvbnN0IGlkIG9mIGlkcykge1xuXHRcdFx0XHRcdGNvbnN0IGluZGV4ID0gYXR0YWNobWVudHMuZmluZEluZGV4KGF0dGFjaG1lbnQgPT4gYXR0YWNobWVudC5pZCA9PT0gaWQpO1xuXHRcdFx0XHRcdGlmIChpbmRleCA+PSAwKSB7XG5cdFx0XHRcdFx0XHRhdHRhY2htZW50cy5zcGxpY2UoaW5kZXgsIDEpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdGFkZElubGluZUF0dGFjaG1lbnQ6IChlbnRyeSwgdGV4dCwgcmFuZ2UpID0+IHtcblx0XHRcdFx0YXR0YWNobWVudHMucHVzaChlbnRyeSk7XG5cdFx0XHRcdGlubGluZUF0dGFjaG1lbnRzLnB1c2goeyBlbnRyeSwgdGV4dCwgcmFuZ2UgfSk7XG5cdFx0XHR9LFxuXHRcdFx0YWRkSW5saW5lUmVmZXJlbmNlOiAoKSA9PiB7IH0sXG5cdFx0XHRpc1Rlcm1pbmFsQ29tbWFuZFBhc3RlOiAoKSA9PiBpc1Rlcm1pbmFsQ29tbWFuZFBhc3RlLFxuXHRcdH07XG5cdFx0Y29uc3QgbW9kZWxVcmkgPSBVUkkuZnJvbSh7IHNjaGVtZTogU2NoZW1hcy52c2NvZGVDaGF0SW5wdXQsIHBhdGg6ICdwYXN0ZS10ZXN0JyB9KTtcblx0XHRjb25zdCBwYXN0ZVRhcmdldFNlcnZpY2UgPSBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElDaGF0UGFzdGVUYXJnZXRTZXJ2aWNlPigpIHtcblx0XHRcdG92ZXJyaWRlIGdldFRhcmdldCh1cmk6IFVSSSk6IElDaGF0UGFzdGVUYXJnZXQgfCB1bmRlZmluZWQge1xuXHRcdFx0XHRyZXR1cm4gdXJpID09PSBtb2RlbFVyaSA/IHRhcmdldCA6IHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9O1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gbmV3IFBhc3RlVGV4dFByb3ZpZGVyKFxuXHRcdFx0cGFzdGVUYXJnZXRTZXJ2aWNlLFxuXHRcdFx0bmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJTW9kZWxTZXJ2aWNlPigpIHsgfSxcblx0XHRcdG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUxvZ1NlcnZpY2U+KCkgeyB9LFxuXHRcdCk7XG5cdFx0Y29uc3QgbW9kZWwgPSB1cGNhc3RQYXJ0aWFsPElUZXh0TW9kZWw+KHtcblx0XHRcdHVyaTogbW9kZWxVcmksXG5cdFx0XHRnZXRPZmZzZXRBdDogcG9zaXRpb24gPT4gcG9zaXRpb24uY29sdW1uIC0gMSxcblx0XHR9KTtcblx0XHRjb25zdCBsb25nVGV4dCA9ICd4Jy5yZXBlYXQoMTAwMCk7XG5cdFx0Y29uc3QgdHJhbnNmZXJPZiA9IChlbnRyaWVzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+KSA9PiB7XG5cdFx0XHRjb25zdCB0cmFuc2ZlciA9IG5ldyBWU0RhdGFUcmFuc2ZlcigpO1xuXHRcdFx0Zm9yIChjb25zdCBbbWltZSwgdmFsdWVdIG9mIE9iamVjdC5lbnRyaWVzKGVudHJpZXMpKSB7XG5cdFx0XHRcdHRyYW5zZmVyLmFwcGVuZChtaW1lLCBjcmVhdGVTdHJpbmdEYXRhVHJhbnNmZXJJdGVtKHZhbHVlKSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdHJhbnNmZXI7XG5cdFx0fTtcblx0XHRjb25zdCBwYXN0ZUludG8gPSAodHJhbnNmZXI6IFZTRGF0YVRyYW5zZmVyLCByYW5nZXM6IHJlYWRvbmx5IElSYW5nZVtdID0gW25ldyBSYW5nZSgxLCAxLCAxLCAxKV0pID0+XG5cdFx0XHRwcm92aWRlci5wcm92aWRlRG9jdW1lbnRQYXN0ZUVkaXRzKG1vZGVsLCByYW5nZXMsIHRyYW5zZmVyLCB7IHRyaWdnZXJLaW5kOiBEb2N1bWVudFBhc3RlVHJpZ2dlcktpbmQuQXV0b21hdGljIH0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0Y29uc3QgcGxhaW5UZXh0ID0gdHJhbnNmZXJPZih7IFtNaW1lcy50ZXh0XTogbG9uZ1RleHQgfSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IGF3YWl0IHBhc3RlSW50byhwbGFpblRleHQsIFtuZXcgUmFuZ2UoMSwgOCwgMSwgOCldKTtcblx0XHRjb25zdCBlZGl0ID0gc2Vzc2lvbj8uZWRpdHNbMF07XG5cdFx0Y29uc3QgY3VzdG9tRWRpdCA9IGVkaXQ/LmFkZGl0aW9uYWxFZGl0Py5lZGl0c1swXSBhcyBJQ3VzdG9tRWRpdCB8IHVuZGVmaW5lZDtcblx0XHRhd2FpdCBjdXN0b21FZGl0Py5yZWRvKCk7XG5cblx0XHRjb25zdCBodG1sU2Vzc2lvbiA9IGF3YWl0IHBhc3RlSW50byh0cmFuc2Zlck9mKHsgW01pbWVzLnRleHRdOiBsb25nVGV4dCwgW01pbWVzLmh0bWxdOiBgPHN0cm9uZz4ke2xvbmdUZXh0fTwvc3Ryb25nPmAgfSkpO1xuXHRcdGNvbnN0IHNob3J0SHRtbFNlc3Npb24gPSBhd2FpdCBwYXN0ZUludG8odHJhbnNmZXJPZih7IFtNaW1lcy50ZXh0XTogJ2hpJywgW01pbWVzLmh0bWxdOiAnPHN0cm9uZz5oaTwvc3Ryb25nPicgfSkpO1xuXHRcdGNvbnN0IGF0dGFjaG1lbnRTZXNzaW9uID0gYXdhaXQgcGFzdGVJbnRvKHRyYW5zZmVyT2YoeyBbTWltZXMudGV4dF06IGxvbmdUZXh0LCBbQ0hBVF9BVFRBQ0hNRU5UX01JTUVfVFlQRV06ICd7fScgfSkpO1xuXHRcdGNvbnN0IG11bHRpQ3Vyc29yU2Vzc2lvbiA9IGF3YWl0IHBhc3RlSW50byhwbGFpblRleHQsIFtuZXcgUmFuZ2UoMSwgMSwgMSwgMSksIG5ldyBSYW5nZSgxLCAyLCAxLCAyKV0pO1xuXHRcdGlzVGVybWluYWxDb21tYW5kUGFzdGUgPSB0cnVlO1xuXHRcdGNvbnN0IHRlcm1pbmFsQ29tbWFuZFNlc3Npb24gPSBhd2FpdCBwYXN0ZUludG8ocGxhaW5UZXh0KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0aGFuZGxlc1BsYWluVGV4dDogcHJvdmlkZXIucGFzdGVNaW1lVHlwZXMuaW5jbHVkZXMoTWltZXMudGV4dCksXG5cdFx0XHRsb25nSHRtbFN0aWxsQmVjb21lc0FuQXJ0aWZhY3Q6IGh0bWxTZXNzaW9uPy5lZGl0c1swXT8udGl0bGUsXG5cdFx0XHRsZWF2ZXNTaG9ydEh0bWxUb0h0bWxQYXN0ZTogc2hvcnRIdG1sU2Vzc2lvbixcblx0XHRcdGxlYXZlc0NvcGllZENoYXRBdHRhY2htZW50c1RvQXR0YWNobWVudFBhc3RlOiBhdHRhY2htZW50U2Vzc2lvbixcblx0XHRcdGxlYXZlc011bHRpcGxlQ3Vyc29yc1RvUGxhaW5UZXh0UGFzdGU6IG11bHRpQ3Vyc29yU2Vzc2lvbixcblx0XHRcdGxlYXZlc1Rlcm1pbmFsQ29tbWFuZHNBc1RleHQ6IHRlcm1pbmFsQ29tbWFuZFNlc3Npb24sXG5cdFx0XHRpbnNlcnRUZXh0OiBlZGl0Py5pbnNlcnRUZXh0LFxuXHRcdFx0dGl0bGU6IGVkaXQ/LnRpdGxlLFxuXHRcdFx0YXR0YWNobWVudDogYXR0YWNobWVudHMubWFwKGF0dGFjaG1lbnQgPT4gKHtcblx0XHRcdFx0bmFtZTogYXR0YWNobWVudC5uYW1lLFxuXHRcdFx0XHRraW5kOiBhdHRhY2htZW50LmtpbmQsXG5cdFx0XHRcdHZhbHVlSXNQcmVzZXJ2ZWQ6IGF0dGFjaG1lbnQudmFsdWUgPT09IGxvbmdUZXh0LFxuXHRcdFx0fSkpLFxuXHRcdFx0cmVmZXJlbmNlczogaW5saW5lQXR0YWNobWVudHMubWFwKGlubGluZSA9PiAoe1xuXHRcdFx0XHRpZE1hdGNoZXNBdHRhY2htZW50OiBpbmxpbmUuZW50cnkuaWQgPT09IGF0dGFjaG1lbnRzWzBdPy5pZCxcblx0XHRcdFx0bmFtZTogaW5saW5lLmVudHJ5Lm5hbWUsXG5cdFx0XHRcdHRleHQ6IGlubGluZS50ZXh0LFxuXHRcdFx0XHRyYW5nZTogaW5saW5lLnJhbmdlLFxuXHRcdFx0fSkpLFxuXHRcdH0sIHtcblx0XHRcdGhhbmRsZXNQbGFpblRleHQ6IHRydWUsXG5cdFx0XHRsb25nSHRtbFN0aWxsQmVjb21lc0FuQXJ0aWZhY3Q6ICdQYXN0ZWQgVGV4dCBBdHRhY2htZW50Jyxcblx0XHRcdGxlYXZlc1Nob3J0SHRtbFRvSHRtbFBhc3RlOiB1bmRlZmluZWQsXG5cdFx0XHRsZWF2ZXNDb3BpZWRDaGF0QXR0YWNobWVudHNUb0F0dGFjaG1lbnRQYXN0ZTogdW5kZWZpbmVkLFxuXHRcdFx0bGVhdmVzTXVsdGlwbGVDdXJzb3JzVG9QbGFpblRleHRQYXN0ZTogdW5kZWZpbmVkLFxuXHRcdFx0bGVhdmVzVGVybWluYWxDb21tYW5kc0FzVGV4dDogdW5kZWZpbmVkLFxuXHRcdFx0aW5zZXJ0VGV4dDogJyNhdHRhY2htZW50OlBhc3RlZCB0ZXh0ICMxICcsXG5cdFx0XHR0aXRsZTogJ1Bhc3RlZCBUZXh0IEF0dGFjaG1lbnQnLFxuXHRcdFx0YXR0YWNobWVudDogW3tcblx0XHRcdFx0bmFtZTogJ1Bhc3RlZCB0ZXh0ICMxJyxcblx0XHRcdFx0a2luZDogJ3Bhc3RlJyxcblx0XHRcdFx0dmFsdWVJc1ByZXNlcnZlZDogdHJ1ZSxcblx0XHRcdH1dLFxuXHRcdFx0cmVmZXJlbmNlczogW3tcblx0XHRcdFx0aWRNYXRjaGVzQXR0YWNobWVudDogdHJ1ZSxcblx0XHRcdFx0bmFtZTogJ1Bhc3RlZCB0ZXh0ICMxJyxcblx0XHRcdFx0dGV4dDogJyNhdHRhY2htZW50OlBhc3RlZCB0ZXh0ICMxJyxcblx0XHRcdFx0cmFuZ2U6IG5ldyBSYW5nZSgxLCA4LCAxLCAzNCksXG5cdFx0XHR9XSxcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLDhCQUE4QixzQkFBc0I7QUFDN0QsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsZUFBZTtBQUN4QixTQUFTLFdBQVc7QUFDcEIsU0FBUyxNQUFNLHFCQUFxQjtBQUNwQyxTQUFTLCtDQUErQztBQUN4RCxTQUFpQixhQUFhO0FBQzlCLFNBQVMsZ0NBQTZDO0FBR3RELFNBQVMsZ0NBQWdDO0FBR3pDLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsMkJBQTJCLDBCQUEwQix5QkFBeUI7QUFDdkYsU0FBUyxtQ0FBOEQ7QUFDdkUsU0FBUyxpQ0FBaUM7QUFDMUMsU0FBUyw0QkFBNEI7QUFFckMsTUFBTSx3QkFBd0IsTUFBTTtBQUNuQyxRQUFNLFFB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
