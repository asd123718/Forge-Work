import assert from "assert";
import { DisposableStore, toDisposable } from "../../../../../../../base/common/lifecycle.js";
import { mainWindow } from "../../../../../../../base/browser/window.js";
import { URI } from "../../../../../../../base/common/uri.js";
import { ExtensionIdentifier } from "../../../../../../../platform/extensions/common/extensions.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../../base/test/common/utils.js";
import { IFileService } from "../../../../../../../platform/files/common/files.js";
import { workbenchInstantiationService } from "../../../../../../test/browser/workbenchTestServices.js";
import { DEFAULT_LABELS_CONTAINER, ResourceLabels } from "../../../../../../browser/labels.js";
import { getEffectiveImageOmittedState, ImageAttachmentWidget } from "../../../../browser/attachments/chatAttachmentWidgets.js";
import { ChatAttachmentsContentPart } from "../../../../browser/widget/chatContentParts/chatAttachmentsContentPart.js";
import { AgentHostCompletionReferenceKind, OmittedState, toAgentHostCompletionVariableEntry } from "../../../../common/attachments/chatVariableEntries.js";
import { ILanguageModelsService } from "../../../../common/languageModels.js";
suite("ChatAttachmentsContentPart", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  let disposables;
  let instantiationService;
  setup(() => {
    disposables = store.add(new DisposableStore());
    instantiationService = workbenchInstantiationService(void 0, store);
  });
  teardown(() => {
    disposables.dispose();
  });
  function createFileEntry(name, uri) {
    const fileUri = uri ?? URI.file(`/test/${name}`);
    return {
      kind: "file",
      id: `file-${name}`,
      name,
      fullName: fileUri.path,
      value: fileUri
    };
  }
  function createImageEntry(name, buffer, mimeType = "image/png") {
    return {
      kind: "image",
      id: `image-${name}`,
      name,
      value: buffer,
      mimeType,
      isURL: false,
      references: [{ kind: "reference", reference: URI.file(`/test/${name}`) }]
    };
  }
  function setModels(models) {
    instantiationService.stub(ILanguageModelsService, {
      getLanguageModelIds: () => models.map((model) => model.identifier),
      lookupLanguageModel: (identifier) => {
        const model = models.find((model2) => model2.identifier === identifier);
        return model ? {
          extension: new ExtensionIdentifier("test.extension"),
          id: model.id,
          vendor: model.vendor,
          name: model.id,
          version: "1",
          family: model.id,
          maxInputTokens: 1e3,
          maxOutputTokens: 1e3,
          isDefaultForLocation: {},
          capabilities: { vision: model.vision }
        } : void 0;
      }
    });
  }
  suite("updateVariables", () => {
    test("should update variables and re-render", () => {
      const initialVariables = [
        createFileEntry("file1.ts"),
        createFileEntry("file2.ts")
      ];
      const part = store.add(instantiationService.createInstance(
        ChatAttachmentsContentPart,
        { variables: initialVariables }
      ));
      mainWindow.document.body.appendChild(part.domNode);
      disposables.add(toDisposable(() => part.domNode?.remove()));
      const initialAttachments = part.domNode.querySelectorAll(".chat-attached-context-attachment");
      assert.strictEqual(initialAttachments.length, 2, "Should have 2 initial attachments");
      const newVariables = [
        createFileEntry("file1.ts"),
        createFileEntry("file2.ts"),
        createFileEntry("file3.ts")
      ];
      part.updateVariables(newVariables);
      const updatedAttachments = part.domNode.querySelectorAll(".chat-attached-context-attachment");
      assert.strictEqual(updatedAttachments.length, 3, "Should have 3 attachments after update");
    });
    test("should handle updating from file to image", () => {
      const initialVariables = [
        createFileEntry("image.png")
      ];
      const part = store.add(instantiationService.createInstance(
        ChatAttachmentsContentPart,
        { variables: initialVariables }
      ));
      mainWindow.document.body.appendChild(part.domNode);
      disposables.add(toDisposable(() => part.domNode?.remove()));
      assert.strictEqual(part.domNode.querySelectorAll(".chat-attached-context-attachment").length, 1);
      const imageBuffer = new Uint8Array([137, 80, 78, 71]);
      const newVariables = [
        createImageEntry("image.png", imageBuffer)
      ];
      part.updateVariables(newVariables);
      const updatedAttachments = part.domNode.querySelectorAll(".chat-attached-context-attachment");
      assert.strictEqual(updatedAttachments.length, 1, "Should have 1 attachment after update");
      assert.ok(updatedAttachments[0].classList.contains("image-attachment"), "Image attachment should have styling class");
    });
    test("should preserve contextMenuHandler after update", () => {
      const initialVariables = [
        createFileEntry("file1.ts")
      ];
      const part = store.add(instantiationService.createInstance(
        ChatAttachmentsContentPart,
        { variables: initialVariables }
      ));
      const handler = () => {
      };
      part.contextMenuHandler = handler;
      mainWindow.document.body.appendChild(part.domNode);
      disposables.add(toDisposable(() => part.domNode?.remove()));
      const newVariables = [
        createFileEntry("file1.ts"),
        createFileEntry("file2.ts")
      ];
      part.updateVariables(newVariables);
      assert.strictEqual(part.contextMenuHandler, handler, "contextMenuHandler should be preserved after update");
    });
    test("should handle empty variables array", () => {
      const initialVariables = [
        createFileEntry("file1.ts")
      ];
      const part = store.add(instantiationService.createInstance(
        ChatAttachmentsContentPart,
        { variables: initialVariables }
      ));
      mainWindow.document.body.appendChild(part.domNode);
      disposables.add(toDisposable(() => part.domNode?.remove()));
      assert.strictEqual(part.domNode.querySelectorAll(".chat-attached-context-attachment").length, 1);
      part.updateVariables([]);
      const updatedAttachments = part.domNode.querySelectorAll(".chat-attached-context-attachment");
      assert.strictEqual(updatedAttachments.length, 0, "Should have 0 attachments after clearing");
    });
    test("should handle updating same variables (no-op)", () => {
      const variables = [
        createFileEntry("file1.ts"),
        createFileEntry("file2.ts")
      ];
      const part = store.add(instantiationService.createInstance(
        ChatAttachmentsContentPart,
        { variables }
      ));
      mainWindow.document.body.appendChild(part.domNode);
      disposables.add(toDisposable(() => part.domNode?.remove()));
      part.updateVariables([...variables]);
      const updatedAttachments = part.domNode.querySelectorAll(".chat-attached-context-attachment");
      assert.strictEqual(updatedAttachments.length, 2, "Should still have 2 attachments");
    });
  });
  suite("basic rendering", () => {
    test("should render file attachments", () => {
      const variables = [
        createFileEntry("file1.ts"),
        createFileEntry("file2.ts")
      ];
      const part = store.add(instantiationService.createInstance(
        ChatAttachmentsContentPart,
        { variables }
      ));
      mainWindow.document.body.appendChild(part.domNode);
      disposables.add(toDisposable(() => part.domNode?.remove()));
      const attachments = part.domNode.querySelectorAll(".chat-attached-context-attachment");
      assert.strictEqual(attachments.length, 2, "Should render 2 file attachments");
    });
    test("should not render agent host completion references as attachments", () => {
      const variables = [
        createFileEntry("file1.ts"),
        toAgentHostCompletionVariableEntry(AgentHostCompletionReferenceKind.Command, "/rename", "rename", void 0),
        toAgentHostCompletionVariableEntry(AgentHostCompletionReferenceKind.Skill, "/agent-host-docs", "file:///skills/agent-host-docs/SKILL.md", void 0)
      ];
      const part = store.add(instantiationService.createInstance(
        ChatAttachmentsContentPart,
        { variables }
      ));
      mainWindow.document.body.appendChild(part.domNode);
      disposables.add(toDisposable(() => part.domNode?.remove()));
      const attachments = part.domNode.querySelectorAll(".chat-attached-context-attachment");
      assert.strictEqual(attachments.length, 1, "Should only render the file attachment");
    });
    test("should not count agent host completion references in show more label", () => {
      const variables = [
        createFileEntry("file1.ts"),
        toAgentHostCompletionVariableEntry(AgentHostCompletionReferenceKind.Command, "/rename", "rename", void 0),
        toAgentHostCompletionVariableEntry(AgentHostCompletionReferenceKind.Skill, "/agent-host-docs", "file:///skills/agent-host-docs/SKILL.md", void 0),
        createFileEntry("file2.ts")
      ];
      const part = store.add(instantiationService.createInstance(
        ChatAttachmentsContentPart,
        { variables, limit: 1 }
      ));
      mainWindow.document.body.appendChild(part.domNode);
      disposables.add(toDisposable(() => part.domNode?.remove()));
      const showMoreLabel = part.domNode.querySelector(".chat-attachments-show-more-button .chat-attached-context-custom-text")?.textContent;
      assert.strictEqual(showMoreLabel, "1 more");
    });
    test("should have chat-attached-context class on domNode", () => {
      const variables = [createFileEntry("file.ts")];
      const part = store.add(instantiationService.createInstance(
        ChatAttachmentsContentPart,
        { variables }
      ));
      assert.ok(part.domNode.classList.contains("chat-attached-context"), "Should have chat-attached-context class");
    });
    test("should mark images omitted when the routed model does not support vision", () => {
      setModels([
        { identifier: "copilot/auto", id: "auto", vendor: "copilot", vision: false },
        { identifier: "other/test-non-vision", id: "test-non-vision", vendor: "other", vision: true },
        { identifier: "copilot/test-non-vision", id: "test-non-vision", vendor: "copilot", vision: false }
      ]);
      const image = createImageEntry("image.png", new Uint8Array([1, 2, 3]));
      const part = store.add(instantiationService.createInstance(
        ChatAttachmentsContentPart,
        { variables: [image], modelId: "copilot/auto", resolvedModelId: "test-non-vision" }
      ));
      const attachment = part.domNode.querySelector(".image-attachment");
      assert.deepStrictEqual({
        omittedState: image.omittedState,
        ariaLabel: attachment?.ariaLabel,
        isWarning: attachment?.classList.contains("warning")
      }, {
        omittedState: void 0,
        ariaLabel: "Image not sent because test-non-vision does not support images: image.png",
        isWarning: true
      });
    });
    test("should not mark images omitted for Auto before routing", () => {
      setModels([{ identifier: "copilot/auto", id: "copilot/auto", vendor: "copilot", vision: false }]);
      const image = createImageEntry("image.png", new Uint8Array([1, 2, 3]));
      const part = store.add(instantiationService.createInstance(
        ChatAttachmentsContentPart,
        { variables: [image], modelId: "copilot/auto" }
      ));
      const attachment = part.domNode.querySelector(".image-attachment");
      assert.deepStrictEqual({
        omittedState: image.omittedState,
        ariaLabel: attachment?.ariaLabel,
        isWarning: attachment?.classList.contains("warning"),
        isAutoWarning: attachment?.classList.contains("auto-image-warning"),
        hasWarningIcon: !!attachment?.querySelector(".codicon-warning")
      }, {
        omittedState: void 0,
        ariaLabel: "Attached image, image.png. Image support depends on the model selected by Auto.",
        isWarning: false,
        isAutoWarning: true,
        hasWarningIcon: false
      });
    });
    test("should ignore a stale omitted state when editing with Auto", () => {
      const autoModel = {
        identifier: "copilot/auto",
        metadata: {
          extension: new ExtensionIdentifier("test.extension"),
          id: "copilot/auto",
          vendor: "copilot",
          name: "Auto",
          version: "1",
          family: "auto",
          maxInputTokens: 1e3,
          maxOutputTokens: 1e3,
          isDefaultForLocation: {}
        }
      };
      assert.strictEqual(getEffectiveImageOmittedState(OmittedState.Full, autoModel, true), OmittedState.NotOmitted);
    });
    suite("hydrated image attachments", () => {
      async function renderImageAndCollectReads(image) {
        const fileService = instantiationService.get(IFileService);
        const part = store.add(instantiationService.createInstance(
          ChatAttachmentsContentPart,
          { variables: [image] }
        ));
        mainWindow.document.body.appendChild(part.domNode);
        disposables.add(toDisposable(() => part.domNode?.remove()));
        await new Promise((resolve) => setTimeout(resolve, 0));
        return fileService.readOperations.map((read) => read.resource.toString());
      }
      test("should load bytes from the resource for a hydrated (uri-only) image", async () => {
        const resource = URI.file("/test/pasted-image.png");
        const reads = await renderImageAndCollectReads({
          kind: "image",
          id: "hydrated-image",
          name: "pasted-image.png",
          value: resource,
          mimeType: "image/png",
          isURL: true,
          references: [{ kind: "reference", reference: resource }]
        });
        assert.deepStrictEqual(reads, [resource.toString()]);
      });
      test("should not read the resource for an image with inline bytes", async () => {
        const resource = URI.file("/test/inline-image.png");
        const reads = await renderImageAndCollectReads({
          kind: "image",
          id: "inline-image",
          name: "inline-image.png",
          value: new Uint8Array([137, 80, 78, 71]),
          mimeType: "image/png",
          isURL: false,
          references: [{ kind: "reference", reference: resource }]
        });
        assert.deepStrictEqual(reads, []);
      });
      test("should keep delete hint after loading hydrated image bytes", async () => {
        const resource = URI.file("/test/pasted-image.png");
        const container = mainWindow.document.createElement("div");
        mainWindow.document.body.appendChild(container);
        disposables.add(toDisposable(() => container.remove()));
        const contextResourceLabels = disposables.add(instantiationService.createInstance(ResourceLabels, DEFAULT_LABELS_CONTAINER));
        const widget = disposables.add(instantiationService.createInstance(
          ImageAttachmentWidget,
          resource,
          {
            kind: "image",
            id: "hydrated-image-with-delete",
            name: "pasted-image.png",
            value: resource,
            mimeType: "image/png",
            isURL: true,
            references: [{ kind: "reference", reference: resource }]
          },
          void 0,
          { shouldFocusClearButton: false, supportsDeletion: true },
          container,
          contextResourceLabels
        ));
        await new Promise((resolve) => setTimeout(resolve, 0));
        assert.deepStrictEqual({
          ariaLabel: widget.element.ariaLabel,
          clearButtonClass: widget.element.querySelector(".monaco-button")?.className
        }, {
          ariaLabel: "Attached image, pasted-image.png (Delete)",
          clearButtonClass: "monaco-button codicon codicon-close-compact"
        });
      });
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGJyb3dzZXJcXHdpZGdldFxcY2hhdENvbnRlbnRQYXJ0c1xcY2hhdEF0dGFjaG1lbnRzQ29udGVudFBhcnQudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IG1haW5XaW5kb3cgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvd2luZG93LmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25JZGVudGlmaWVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBUZXN0RmlsZVNlcnZpY2UsIHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vdGVzdC9icm93c2VyL3dvcmtiZW5jaFRlc3RTZXJ2aWNlcy5qcyc7XG5pbXBvcnQgeyBERUZBVUxUX0xBQkVMU19DT05UQUlORVIsIFJlc291cmNlTGFiZWxzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYnJvd3Nlci9sYWJlbHMuanMnO1xuaW1wb3J0IHsgZ2V0RWZmZWN0aXZlSW1hZ2VPbWl0dGVkU3RhdGUsIEltYWdlQXR0YWNobWVudFdpZGdldCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvYXR0YWNobWVudHMvY2hhdEF0dGFjaG1lbnRXaWRnZXRzLmpzJztcbmltcG9ydCB7IENoYXRBdHRhY2htZW50c0NvbnRlbnRQYXJ0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci93aWRnZXQvY2hhdENvbnRlbnRQYXJ0cy9jaGF0QXR0YWNobWVudHNDb250ZW50UGFydC5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RDb21wbGV0aW9uUmVmZXJlbmNlS2luZCwgSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeSwgT21pdHRlZFN0YXRlLCB0b0FnZW50SG9zdENvbXBsZXRpb25WYXJpYWJsZUVudHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2F0dGFjaG1lbnRzL2NoYXRWYXJpYWJsZUVudHJpZXMuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGEsIElMYW5ndWFnZU1vZGVsc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VNb2RlbHMuanMnO1xuXG5zdWl0ZSgnQ2hhdEF0dGFjaG1lbnRzQ29udGVudFBhcnQnLCAoKSA9PiB7XG5cdGNvbnN0IHN0b3JlID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cdGxldCBkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlO1xuXHRsZXQgaW5zdGFudGlhdGlvblNlcnZpY2U6IFJldHVyblR5cGU8dHlwZW9mIHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlPjtcblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0ZGlzcG9zYWJsZXMgPSBzdG9yZS5hZGQobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZSA9IHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlKHVuZGVmaW5lZCwgc3RvcmUpO1xuXHR9KTtcblxuXHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHRmdW5jdGlvbiBjcmVhdGVGaWxlRW50cnkobmFtZTogc3RyaW5nLCB1cmk/OiBVUkkpOiBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5IHtcblx0XHRjb25zdCBmaWxlVXJpID0gdXJpID8/IFVSSS5maWxlKGAvdGVzdC8ke25hbWV9YCk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGtpbmQ6ICdmaWxlJyxcblx0XHRcdGlkOiBgZmlsZS0ke25hbWV9YCxcblx0XHRcdG5hbWUsXG5cdFx0XHRmdWxsTmFtZTogZmlsZVVyaS5wYXRoLFxuXHRcdFx0dmFsdWU6IGZpbGVVcmlcblx0XHR9O1xuXHR9XG5cblx0ZnVuY3Rpb24gY3JlYXRlSW1hZ2VFbnRyeShuYW1lOiBzdHJpbmcsIGJ1ZmZlcjogVWludDhBcnJheSwgbWltZVR5cGU6IHN0cmluZyA9ICdpbWFnZS9wbmcnKTogSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGtpbmQ6ICdpbWFnZScsXG5cdFx0XHRpZDogYGltYWdlLSR7bmFtZX1gLFxuXHRcdFx0bmFtZSxcblx0XHRcdHZhbHVlOiBidWZmZXIsXG5cdFx0XHRtaW1lVHlwZSxcblx0XHRcdGlzVVJMOiBmYWxzZSxcblx0XHRcdHJlZmVyZW5jZXM6IFt7IGtpbmQ6ICdyZWZlcmVuY2UnLCByZWZlcmVuY2U6IFVSSS5maWxlKGAvdGVzdC8ke25hbWV9YCkgfV1cblx0XHR9O1xuXHR9XG5cblx0ZnVuY3Rpb24gc2V0TW9kZWxzKG1vZGVsczogUmVhZG9ubHlBcnJheTx7IGlkZW50aWZpZXI6IHN0cmluZzsgaWQ6IHN0cmluZzsgdmVuZG9yOiBzdHJpbmc7IHZpc2lvbjogYm9vbGVhbiB9Pik6IHZvaWQge1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUxhbmd1YWdlTW9kZWxzU2VydmljZSwge1xuXHRcdFx0Z2V0TGFuZ3VhZ2VNb2RlbElkczogKCkgPT4gbW9kZWxzLm1hcChtb2RlbCA9PiBtb2RlbC5pZGVudGlmaWVyKSxcblx0XHRcdGxvb2t1cExhbmd1YWdlTW9kZWw6IGlkZW50aWZpZXIgPT4ge1xuXHRcdFx0XHRjb25zdCBtb2RlbCA9IG1vZGVscy5maW5kKG1vZGVsID0+IG1vZGVsLmlkZW50aWZpZXIgPT09IGlkZW50aWZpZXIpO1xuXHRcdFx0XHRyZXR1cm4gbW9kZWwgPyB7XG5cdFx0XHRcdFx0ZXh0ZW5zaW9uOiBuZXcgRXh0ZW5zaW9uSWRlbnRpZmllcigndGVzdC5leHRlbnNpb24nKSxcblx0XHRcdFx0XHRpZDogbW9kZWwuaWQsXG5cdFx0XHRcdFx0dmVuZG9yOiBtb2RlbC52ZW5kb3IsXG5cdFx0XHRcdFx0bmFtZTogbW9kZWwuaWQsXG5cdFx0XHRcdFx0dmVyc2lvbjogJzEnLFxuXHRcdFx0XHRcdGZhbWlseTogbW9kZWwuaWQsXG5cdFx0XHRcdFx0bWF4SW5wdXRUb2tlbnM6IDEwMDAsXG5cdFx0XHRcdFx0bWF4T3V0cHV0VG9rZW5zOiAxMDAwLFxuXHRcdFx0XHRcdGlzRGVmYXVsdEZvckxvY2F0aW9uOiB7fSxcblx0XHRcdFx0XHRjYXBhYmlsaXRpZXM6IHsgdmlzaW9uOiBtb2RlbC52aXNpb24gfSxcblx0XHRcdFx0fSBzYXRpc2ZpZXMgSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGEgOiB1bmRlZmluZWQ7XG5cdFx0XHR9LFxuXHRcdH0gYXMgSUxhbmd1YWdlTW9kZWxzU2VydmljZSk7XG5cdH1cblxuXHRzdWl0ZSgndXBkYXRlVmFyaWFibGVzJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3Nob3VsZCB1cGRhdGUgdmFyaWFibGVzIGFuZCByZS1yZW5kZXInLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbml0aWFsVmFyaWFibGVzOiBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5W10gPSBbXG5cdFx0XHRcdGNyZWF0ZUZpbGVFbnRyeSgnZmlsZTEudHMnKSxcblx0XHRcdFx0Y3JlYXRlRmlsZUVudHJ5KCdmaWxlMi50cycpXG5cdFx0XHRdO1xuXG5cdFx0XHRjb25zdCBwYXJ0ID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0XHRDaGF0QXR0YWNobWVudHNDb250ZW50UGFydCxcblx0XHRcdFx0eyB2YXJpYWJsZXM6IGluaXRpYWxWYXJpYWJsZXMgfVxuXHRcdFx0KSk7XG5cblx0XHRcdG1haW5XaW5kb3cuZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChwYXJ0LmRvbU5vZGUhKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gcGFydC5kb21Ob2RlPy5yZW1vdmUoKSkpO1xuXG5cdFx0XHQvLyBJbml0aWFsIHN0YXRlIHNob3VsZCBoYXZlIDIgYXR0YWNobWVudHNcblx0XHRcdGNvbnN0IGluaXRpYWxBdHRhY2htZW50cyA9IHBhcnQuZG9tTm9kZSEucXVlcnlTZWxlY3RvckFsbCgnLmNoYXQtYXR0YWNoZWQtY29udGV4dC1hdHRhY2htZW50Jyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW5pdGlhbEF0dGFjaG1lbnRzLmxlbmd0aCwgMiwgJ1Nob3VsZCBoYXZlIDIgaW5pdGlhbCBhdHRhY2htZW50cycpO1xuXG5cdFx0XHQvLyBVcGRhdGUgd2l0aCBuZXcgdmFyaWFibGVzXG5cdFx0XHRjb25zdCBuZXdWYXJpYWJsZXM6IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnlbXSA9IFtcblx0XHRcdFx0Y3JlYXRlRmlsZUVudHJ5KCdmaWxlMS50cycpLFxuXHRcdFx0XHRjcmVhdGVGaWxlRW50cnkoJ2ZpbGUyLnRzJyksXG5cdFx0XHRcdGNyZWF0ZUZpbGVFbnRyeSgnZmlsZTMudHMnKVxuXHRcdFx0XTtcblxuXHRcdFx0cGFydC51cGRhdGVWYXJpYWJsZXMobmV3VmFyaWFibGVzKTtcblxuXHRcdFx0Ly8gU2hvdWxkIG5vdyBoYXZlIDMgYXR0YWNobWVudHNcblx0XHRcdGNvbnN0IHVwZGF0ZWRBdHRhY2htZW50cyA9IHBhcnQuZG9tTm9kZSEucXVlcnlTZWxlY3RvckFsbCgnLmNoYXQtYXR0YWNoZWQtY29udGV4dC1hdHRhY2htZW50Jyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodXBkYXRlZEF0dGFjaG1lbnRzLmxlbmd0aCwgMywgJ1Nob3VsZCBoYXZlIDMgYXR0YWNobWVudHMgYWZ0ZXIgdXBkYXRlJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgaGFuZGxlIHVwZGF0aW5nIGZyb20gZmlsZSB0byBpbWFnZScsICgpID0+IHtcblx0XHRcdGNvbnN0IGluaXRpYWxWYXJpYWJsZXM6IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnlbXSA9IFtcblx0XHRcdFx0Y3JlYXRlRmlsZUVudHJ5KCdpbWFnZS5wbmcnKVxuXHRcdFx0XTtcblxuXHRcdFx0Y29uc3QgcGFydCA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFx0Q2hhdEF0dGFjaG1lbnRzQ29udGVudFBhcnQsXG5cdFx0XHRcdHsgdmFyaWFibGVzOiBpbml0aWFsVmFyaWFibGVzIH1cblx0XHRcdCkpO1xuXG5cdFx0XHRtYWluV2luZG93LmRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQocGFydC5kb21Ob2RlISk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHBhcnQuZG9tTm9kZT8ucmVtb3ZlKCkpKTtcblxuXHRcdFx0Ly8gSW5pdGlhbCBzdGF0ZSBzaG91bGQgaGF2ZSAxIGZpbGUgYXR0YWNobWVudFxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnQuZG9tTm9kZSEucXVlcnlTZWxlY3RvckFsbCgnLmNoYXQtYXR0YWNoZWQtY29udGV4dC1hdHRhY2htZW50JykubGVuZ3RoLCAxKTtcblxuXHRcdFx0Ly8gVXBkYXRlIHdpdGggaW1hZ2UgZW50cnkgKHNpbXVsYXRpbmcgbGF6eSBsb2FkIGNvbXBsZXRpb24pXG5cdFx0XHRjb25zdCBpbWFnZUJ1ZmZlciA9IG5ldyBVaW50OEFycmF5KFsweDg5LCAweDUwLCAweDRFLCAweDQ3XSk7IC8vIFBORyBoZWFkZXJcblx0XHRcdGNvbnN0IG5ld1ZhcmlhYmxlczogSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeVtdID0gW1xuXHRcdFx0XHRjcmVhdGVJbWFnZUVudHJ5KCdpbWFnZS5wbmcnLCBpbWFnZUJ1ZmZlcilcblx0XHRcdF07XG5cblx0XHRcdHBhcnQudXBkYXRlVmFyaWFibGVzKG5ld1ZhcmlhYmxlcyk7XG5cblx0XHRcdC8vIFNob3VsZCBzdGlsbCBoYXZlIDEgYXR0YWNobWVudCAobm93IGFzIGltYWdlKVxuXHRcdFx0Y29uc3QgdXBkYXRlZEF0dGFjaG1lbnRzID0gcGFydC5kb21Ob2RlIS5xdWVyeVNlbGVjdG9yQWxsKCcuY2hhdC1hdHRhY2hlZC1jb250ZXh0LWF0dGFjaG1lbnQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1cGRhdGVkQXR0YWNobWVudHMubGVuZ3RoLCAxLCAnU2hvdWxkIGhhdmUgMSBhdHRhY2htZW50IGFmdGVyIHVwZGF0ZScpO1xuXHRcdFx0YXNzZXJ0Lm9rKHVwZGF0ZWRBdHRhY2htZW50c1swXS5jbGFzc0xpc3QuY29udGFpbnMoJ2ltYWdlLWF0dGFjaG1lbnQnKSwgJ0ltYWdlIGF0dGFjaG1lbnQgc2hvdWxkIGhhdmUgc3R5bGluZyBjbGFzcycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHByZXNlcnZlIGNvbnRleHRNZW51SGFuZGxlciBhZnRlciB1cGRhdGUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbml0aWFsVmFyaWFibGVzOiBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5W10gPSBbXG5cdFx0XHRcdGNyZWF0ZUZpbGVFbnRyeSgnZmlsZTEudHMnKVxuXHRcdFx0XTtcblxuXHRcdFx0Y29uc3QgcGFydCA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFx0Q2hhdEF0dGFjaG1lbnRzQ29udGVudFBhcnQsXG5cdFx0XHRcdHsgdmFyaWFibGVzOiBpbml0aWFsVmFyaWFibGVzIH1cblx0XHRcdCkpO1xuXG5cdFx0XHRjb25zdCBoYW5kbGVyID0gKCkgPT4geyAvKiBoYW5kbGVyIGxvZ2ljICovIH07XG5cdFx0XHRwYXJ0LmNvbnRleHRNZW51SGFuZGxlciA9IGhhbmRsZXI7XG5cblx0XHRcdG1haW5XaW5kb3cuZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChwYXJ0LmRvbU5vZGUhKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gcGFydC5kb21Ob2RlPy5yZW1vdmUoKSkpO1xuXG5cdFx0XHQvLyBVcGRhdGUgd2l0aCBuZXcgdmFyaWFibGVzXG5cdFx0XHRjb25zdCBuZXdWYXJpYWJsZXM6IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnlbXSA9IFtcblx0XHRcdFx0Y3JlYXRlRmlsZUVudHJ5KCdmaWxlMS50cycpLFxuXHRcdFx0XHRjcmVhdGVGaWxlRW50cnkoJ2ZpbGUyLnRzJylcblx0XHRcdF07XG5cblx0XHRcdHBhcnQudXBkYXRlVmFyaWFibGVzKG5ld1ZhcmlhYmxlcyk7XG5cblx0XHRcdC8vIFRoZSBoYW5kbGVyIHByb3BlcnR5IHNob3VsZCBiZSBwcmVzZXJ2ZWQgKHVwZGF0ZVZhcmlhYmxlcyBkb2Vzbid0IGNsZWFyIGl0KVxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnQuY29udGV4dE1lbnVIYW5kbGVyLCBoYW5kbGVyLCAnY29udGV4dE1lbnVIYW5kbGVyIHNob3VsZCBiZSBwcmVzZXJ2ZWQgYWZ0ZXIgdXBkYXRlJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgaGFuZGxlIGVtcHR5IHZhcmlhYmxlcyBhcnJheScsICgpID0+IHtcblx0XHRcdGNvbnN0IGluaXRpYWxWYXJpYWJsZXM6IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnlbXSA9IFtcblx0XHRcdFx0Y3JlYXRlRmlsZUVudHJ5KCdmaWxlMS50cycpXG5cdFx0XHRdO1xuXG5cdFx0XHRjb25zdCBwYXJ0ID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0XHRDaGF0QXR0YWNobWVudHNDb250ZW50UGFydCxcblx0XHRcdFx0eyB2YXJpYWJsZXM6IGluaXRpYWxWYXJpYWJsZXMgfVxuXHRcdFx0KSk7XG5cblx0XHRcdG1haW5XaW5kb3cuZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChwYXJ0LmRvbU5vZGUhKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gcGFydC5kb21Ob2RlPy5yZW1vdmUoKSkpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydC5kb21Ob2RlIS5xdWVyeVNlbGVjdG9yQWxsKCcuY2hhdC1hdHRhY2hlZC1jb250ZXh0LWF0dGFjaG1lbnQnKS5sZW5ndGgsIDEpO1xuXG5cdFx0XHQvLyBVcGRhdGUgd2l0aCBlbXB0eSBhcnJheVxuXHRcdFx0cGFydC51cGRhdGVWYXJpYWJsZXMoW10pO1xuXG5cdFx0XHQvLyBTaG91bGQgaGF2ZSBubyBhdHRhY2htZW50c1xuXHRcdFx0Y29uc3QgdXBkYXRlZEF0dGFjaG1lbnRzID0gcGFydC5kb21Ob2RlIS5xdWVyeVNlbGVjdG9yQWxsKCcuY2hhdC1hdHRhY2hlZC1jb250ZXh0LWF0dGFjaG1lbnQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1cGRhdGVkQXR0YWNobWVudHMubGVuZ3RoLCAwLCAnU2hvdWxkIGhhdmUgMCBhdHRhY2htZW50cyBhZnRlciBjbGVhcmluZycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGhhbmRsZSB1cGRhdGluZyBzYW1lIHZhcmlhYmxlcyAobm8tb3ApJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdmFyaWFibGVzOiBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5W10gPSBbXG5cdFx0XHRcdGNyZWF0ZUZpbGVFbnRyeSgnZmlsZTEudHMnKSxcblx0XHRcdFx0Y3JlYXRlRmlsZUVudHJ5KCdmaWxlMi50cycpXG5cdFx0XHRdO1xuXG5cdFx0XHRjb25zdCBwYXJ0ID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0XHRDaGF0QXR0YWNobWVudHNDb250ZW50UGFydCxcblx0XHRcdFx0eyB2YXJpYWJsZXMgfVxuXHRcdFx0KSk7XG5cblx0XHRcdG1haW5XaW5kb3cuZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChwYXJ0LmRvbU5vZGUhKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gcGFydC5kb21Ob2RlPy5yZW1vdmUoKSkpO1xuXG5cdFx0XHQvLyBVcGRhdGUgd2l0aCBzYW1lIHZhcmlhYmxlcyAoZGlmZmVyZW50IGFycmF5LCBzYW1lIGNvbnRlbnQpXG5cdFx0XHRwYXJ0LnVwZGF0ZVZhcmlhYmxlcyhbLi4udmFyaWFibGVzXSk7XG5cblx0XHRcdC8vIFNob3VsZCByZS1yZW5kZXIgKHdlIGRvbid0IG9wdGltaXplIGZvciBzYW1lIGNvbnRlbnQpXG5cdFx0XHRjb25zdCB1cGRhdGVkQXR0YWNobWVudHMgPSBwYXJ0LmRvbU5vZGUhLnF1ZXJ5U2VsZWN0b3JBbGwoJy5jaGF0LWF0dGFjaGVkLWNvbnRleHQtYXR0YWNobWVudCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVwZGF0ZWRBdHRhY2htZW50cy5sZW5ndGgsIDIsICdTaG91bGQgc3RpbGwgaGF2ZSAyIGF0dGFjaG1lbnRzJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdiYXNpYyByZW5kZXJpbmcnLCAoKSA9PiB7XG5cdFx0dGVzdCgnc2hvdWxkIHJlbmRlciBmaWxlIGF0dGFjaG1lbnRzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdmFyaWFibGVzOiBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5W10gPSBbXG5cdFx0XHRcdGNyZWF0ZUZpbGVFbnRyeSgnZmlsZTEudHMnKSxcblx0XHRcdFx0Y3JlYXRlRmlsZUVudHJ5KCdmaWxlMi50cycpXG5cdFx0XHRdO1xuXG5cdFx0XHRjb25zdCBwYXJ0ID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0XHRDaGF0QXR0YWNobWVudHNDb250ZW50UGFydCxcblx0XHRcdFx0eyB2YXJpYWJsZXMgfVxuXHRcdFx0KSk7XG5cblx0XHRcdG1haW5XaW5kb3cuZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChwYXJ0LmRvbU5vZGUhKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gcGFydC5kb21Ob2RlPy5yZW1vdmUoKSkpO1xuXG5cdFx0XHRjb25zdCBhdHRhY2htZW50cyA9IHBhcnQuZG9tTm9kZSEucXVlcnlTZWxlY3RvckFsbCgnLmNoYXQtYXR0YWNoZWQtY29udGV4dC1hdHRhY2htZW50Jyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXR0YWNobWVudHMubGVuZ3RoLCAyLCAnU2hvdWxkIHJlbmRlciAyIGZpbGUgYXR0YWNobWVudHMnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBub3QgcmVuZGVyIGFnZW50IGhvc3QgY29tcGxldGlvbiByZWZlcmVuY2VzIGFzIGF0dGFjaG1lbnRzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdmFyaWFibGVzOiBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5W10gPSBbXG5cdFx0XHRcdGNyZWF0ZUZpbGVFbnRyeSgnZmlsZTEudHMnKSxcblx0XHRcdFx0dG9BZ2VudEhvc3RDb21wbGV0aW9uVmFyaWFibGVFbnRyeShBZ2VudEhvc3RDb21wbGV0aW9uUmVmZXJlbmNlS2luZC5Db21tYW5kLCAnL3JlbmFtZScsICdyZW5hbWUnLCB1bmRlZmluZWQpLFxuXHRcdFx0XHR0b0FnZW50SG9zdENvbXBsZXRpb25WYXJpYWJsZUVudHJ5KEFnZW50SG9zdENvbXBsZXRpb25SZWZlcmVuY2VLaW5kLlNraWxsLCAnL2FnZW50LWhvc3QtZG9jcycsICdmaWxlOi8vL3NraWxscy9hZ2VudC1ob3N0LWRvY3MvU0tJTEwubWQnLCB1bmRlZmluZWQpLFxuXHRcdFx0XTtcblxuXHRcdFx0Y29uc3QgcGFydCA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFx0Q2hhdEF0dGFjaG1lbnRzQ29udGVudFBhcnQsXG5cdFx0XHRcdHsgdmFyaWFibGVzIH1cblx0XHRcdCkpO1xuXG5cdFx0XHRtYWluV2luZG93LmRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQocGFydC5kb21Ob2RlISk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHBhcnQuZG9tTm9kZT8ucmVtb3ZlKCkpKTtcblxuXHRcdFx0Y29uc3QgYXR0YWNobWVudHMgPSBwYXJ0LmRvbU5vZGUhLnF1ZXJ5U2VsZWN0b3JBbGwoJy5jaGF0LWF0dGFjaGVkLWNvbnRleHQtYXR0YWNobWVudCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF0dGFjaG1lbnRzLmxlbmd0aCwgMSwgJ1Nob3VsZCBvbmx5IHJlbmRlciB0aGUgZmlsZSBhdHRhY2htZW50Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgbm90IGNvdW50IGFnZW50IGhvc3QgY29tcGxldGlvbiByZWZlcmVuY2VzIGluIHNob3cgbW9yZSBsYWJlbCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHZhcmlhYmxlczogSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeVtdID0gW1xuXHRcdFx0XHRjcmVhdGVGaWxlRW50cnkoJ2ZpbGUxLnRzJyksXG5cdFx0XHRcdHRvQWdlbnRIb3N0Q29tcGxldGlvblZhcmlhYmxlRW50cnkoQWdlbnRIb3N0Q29tcGxldGlvblJlZmVyZW5jZUtpbmQuQ29tbWFuZCwgJy9yZW5hbWUnLCAncmVuYW1lJywgdW5kZWZpbmVkKSxcblx0XHRcdFx0dG9BZ2VudEhvc3RDb21wbGV0aW9uVmFyaWFibGVFbnRyeShBZ2VudEhvc3RDb21wbGV0aW9uUmVmZXJlbmNlS2luZC5Ta2lsbCwgJy9hZ2VudC1ob3N0LWRvY3MnLCAnZmlsZTovLy9za2lsbHMvYWdlbnQtaG9zdC1kb2NzL1NLSUxMLm1kJywgdW5kZWZpbmVkKSxcblx0XHRcdFx0Y3JlYXRlRmlsZUVudHJ5KCdmaWxlMi50cycpLFxuXHRcdFx0XTtcblxuXHRcdFx0Y29uc3QgcGFydCA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFx0Q2hhdEF0dGFjaG1lbnRzQ29udGVudFBhcnQsXG5cdFx0XHRcdHsgdmFyaWFibGVzLCBsaW1pdDogMSB9XG5cdFx0XHQpKTtcblxuXHRcdFx0bWFpbldpbmRvdy5kb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKHBhcnQuZG9tTm9kZSEpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBwYXJ0LmRvbU5vZGU/LnJlbW92ZSgpKSk7XG5cblx0XHRcdGNvbnN0IHNob3dNb3JlTGFiZWwgPSBwYXJ0LmRvbU5vZGUhLnF1ZXJ5U2VsZWN0b3IoJy5jaGF0LWF0dGFjaG1lbnRzLXNob3ctbW9yZS1idXR0b24gLmNoYXQtYXR0YWNoZWQtY29udGV4dC1jdXN0b20tdGV4dCcpPy50ZXh0Q29udGVudDtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzaG93TW9yZUxhYmVsLCAnMSBtb3JlJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgaGF2ZSBjaGF0LWF0dGFjaGVkLWNvbnRleHQgY2xhc3Mgb24gZG9tTm9kZScsICgpID0+IHtcblx0XHRcdGNvbnN0IHZhcmlhYmxlczogSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeVtdID0gW2NyZWF0ZUZpbGVFbnRyeSgnZmlsZS50cycpXTtcblxuXHRcdFx0Y29uc3QgcGFydCA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFx0Q2hhdEF0dGFjaG1lbnRzQ29udGVudFBhcnQsXG5cdFx0XHRcdHsgdmFyaWFibGVzIH1cblx0XHRcdCkpO1xuXG5cdFx0XHRhc3NlcnQub2socGFydC5kb21Ob2RlIS5jbGFzc0xpc3QuY29udGFpbnMoJ2NoYXQtYXR0YWNoZWQtY29udGV4dCcpLCAnU2hvdWxkIGhhdmUgY2hhdC1hdHRhY2hlZC1jb250ZXh0IGNsYXNzJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgbWFyayBpbWFnZXMgb21pdHRlZCB3aGVuIHRoZSByb3V0ZWQgbW9kZWwgZG9lcyBub3Qgc3VwcG9ydCB2aXNpb24nLCAoKSA9PiB7XG5cdFx0XHRzZXRNb2RlbHMoW1xuXHRcdFx0XHR7IGlkZW50aWZpZXI6ICdjb3BpbG90L2F1dG8nLCBpZDogJ2F1dG8nLCB2ZW5kb3I6ICdjb3BpbG90JywgdmlzaW9uOiBmYWxzZSB9LFxuXHRcdFx0XHR7IGlkZW50aWZpZXI6ICdvdGhlci90ZXN0LW5vbi12aXNpb24nLCBpZDogJ3Rlc3Qtbm9uLXZpc2lvbicsIHZlbmRvcjogJ290aGVyJywgdmlzaW9uOiB0cnVlIH0sXG5cdFx0XHRcdHsgaWRlbnRpZmllcjogJ2NvcGlsb3QvdGVzdC1ub24tdmlzaW9uJywgaWQ6ICd0ZXN0LW5vbi12aXNpb24nLCB2ZW5kb3I6ICdjb3BpbG90JywgdmlzaW9uOiBmYWxzZSB9LFxuXHRcdFx0XSk7XG5cdFx0XHRjb25zdCBpbWFnZSA9IGNyZWF0ZUltYWdlRW50cnkoJ2ltYWdlLnBuZycsIG5ldyBVaW50OEFycmF5KFsxLCAyLCAzXSkpO1xuXG5cdFx0XHRjb25zdCBwYXJ0ID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0XHRDaGF0QXR0YWNobWVudHNDb250ZW50UGFydCxcblx0XHRcdFx0eyB2YXJpYWJsZXM6IFtpbWFnZV0sIG1vZGVsSWQ6ICdjb3BpbG90L2F1dG8nLCByZXNvbHZlZE1vZGVsSWQ6ICd0ZXN0LW5vbi12aXNpb24nIH1cblx0XHRcdCkpO1xuXG5cdFx0XHRjb25zdCBhdHRhY2htZW50ID0gcGFydC5kb21Ob2RlIS5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PignLmltYWdlLWF0dGFjaG1lbnQnKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRvbWl0dGVkU3RhdGU6IGltYWdlLm9taXR0ZWRTdGF0ZSxcblx0XHRcdFx0YXJpYUxhYmVsOiBhdHRhY2htZW50Py5hcmlhTGFiZWwsXG5cdFx0XHRcdGlzV2FybmluZzogYXR0YWNobWVudD8uY2xhc3NMaXN0LmNvbnRhaW5zKCd3YXJuaW5nJyksXG5cdFx0XHR9LCB7XG5cdFx0XHRcdG9taXR0ZWRTdGF0ZTogdW5kZWZpbmVkLFxuXHRcdFx0XHRhcmlhTGFiZWw6ICdJbWFnZSBub3Qgc2VudCBiZWNhdXNlIHRlc3Qtbm9uLXZpc2lvbiBkb2VzIG5vdCBzdXBwb3J0IGltYWdlczogaW1hZ2UucG5nJyxcblx0XHRcdFx0aXNXYXJuaW5nOiB0cnVlLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgbm90IG1hcmsgaW1hZ2VzIG9taXR0ZWQgZm9yIEF1dG8gYmVmb3JlIHJvdXRpbmcnLCAoKSA9PiB7XG5cdFx0XHRzZXRNb2RlbHMoW3sgaWRlbnRpZmllcjogJ2NvcGlsb3QvYXV0bycsIGlkOiAnY29waWxvdC9hdXRvJywgdmVuZG9yOiAnY29waWxvdCcsIHZpc2lvbjogZmFsc2UgfV0pO1xuXHRcdFx0Y29uc3QgaW1hZ2UgPSBjcmVhdGVJbWFnZUVudHJ5KCdpbWFnZS5wbmcnLCBuZXcgVWludDhBcnJheShbMSwgMiwgM10pKTtcblxuXHRcdFx0Y29uc3QgcGFydCA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFx0Q2hhdEF0dGFjaG1lbnRzQ29udGVudFBhcnQsXG5cdFx0XHRcdHsgdmFyaWFibGVzOiBbaW1hZ2VdLCBtb2RlbElkOiAnY29waWxvdC9hdXRvJyB9XG5cdFx0XHQpKTtcblxuXHRcdFx0Y29uc3QgYXR0YWNobWVudCA9IHBhcnQuZG9tTm9kZSEucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oJy5pbWFnZS1hdHRhY2htZW50Jyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0b21pdHRlZFN0YXRlOiBpbWFnZS5vbWl0dGVkU3RhdGUsXG5cdFx0XHRcdGFyaWFMYWJlbDogYXR0YWNobWVudD8uYXJpYUxhYmVsLFxuXHRcdFx0XHRpc1dhcm5pbmc6IGF0dGFjaG1lbnQ/LmNsYXNzTGlzdC5jb250YWlucygnd2FybmluZycpLFxuXHRcdFx0XHRpc0F1dG9XYXJuaW5nOiBhdHRhY2htZW50Py5jbGFzc0xpc3QuY29udGFpbnMoJ2F1dG8taW1hZ2Utd2FybmluZycpLFxuXHRcdFx0XHRoYXNXYXJuaW5nSWNvbjogISFhdHRhY2htZW50Py5xdWVyeVNlbGVjdG9yKCcuY29kaWNvbi13YXJuaW5nJyksXG5cdFx0XHR9LCB7XG5cdFx0XHRcdG9taXR0ZWRTdGF0ZTogdW5kZWZpbmVkLFxuXHRcdFx0XHRhcmlhTGFiZWw6ICdBdHRhY2hlZCBpbWFnZSwgaW1hZ2UucG5nLiBJbWFnZSBzdXBwb3J0IGRlcGVuZHMgb24gdGhlIG1vZGVsIHNlbGVjdGVkIGJ5IEF1dG8uJyxcblx0XHRcdFx0aXNXYXJuaW5nOiBmYWxzZSxcblx0XHRcdFx0aXNBdXRvV2FybmluZzogdHJ1ZSxcblx0XHRcdFx0aGFzV2FybmluZ0ljb246IGZhbHNlLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgaWdub3JlIGEgc3RhbGUgb21pdHRlZCBzdGF0ZSB3aGVuIGVkaXRpbmcgd2l0aCBBdXRvJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgYXV0b01vZGVsID0ge1xuXHRcdFx0XHRpZGVudGlmaWVyOiAnY29waWxvdC9hdXRvJyxcblx0XHRcdFx0bWV0YWRhdGE6IHtcblx0XHRcdFx0XHRleHRlbnNpb246IG5ldyBFeHRlbnNpb25JZGVudGlmaWVyKCd0ZXN0LmV4dGVuc2lvbicpLFxuXHRcdFx0XHRcdGlkOiAnY29waWxvdC9hdXRvJyxcblx0XHRcdFx0XHR2ZW5kb3I6ICdjb3BpbG90Jyxcblx0XHRcdFx0XHRuYW1lOiAnQXV0bycsXG5cdFx0XHRcdFx0dmVyc2lvbjogJzEnLFxuXHRcdFx0XHRcdGZhbWlseTogJ2F1dG8nLFxuXHRcdFx0XHRcdG1heElucHV0VG9rZW5zOiAxMDAwLFxuXHRcdFx0XHRcdG1heE91dHB1dFRva2VuczogMTAwMCxcblx0XHRcdFx0XHRpc0RlZmF1bHRGb3JMb2NhdGlvbjoge30sXG5cdFx0XHRcdH1cblx0XHRcdH0gc2F0aXNmaWVzIHsgaWRlbnRpZmllcjogc3RyaW5nOyBtZXRhZGF0YTogSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGEgfTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldEVmZmVjdGl2ZUltYWdlT21pdHRlZFN0YXRlKE9taXR0ZWRTdGF0ZS5GdWxsLCBhdXRvTW9kZWwsIHRydWUpLCBPbWl0dGVkU3RhdGUuTm90T21pdHRlZCk7XG5cdFx0fSk7XG5cblx0XHRzdWl0ZSgnaHlkcmF0ZWQgaW1hZ2UgYXR0YWNobWVudHMnLCAoKSA9PiB7XG5cdFx0XHRhc3luYyBmdW5jdGlvbiByZW5kZXJJbWFnZUFuZENvbGxlY3RSZWFkcyhpbWFnZTogSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeSk6IFByb21pc2U8c3RyaW5nW10+IHtcblx0XHRcdFx0Y29uc3QgZmlsZVNlcnZpY2UgPSBpbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUZpbGVTZXJ2aWNlKSBhcyBUZXN0RmlsZVNlcnZpY2U7XG5cdFx0XHRcdGNvbnN0IHBhcnQgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRcdFx0Q2hhdEF0dGFjaG1lbnRzQ29udGVudFBhcnQsXG5cdFx0XHRcdFx0eyB2YXJpYWJsZXM6IFtpbWFnZV0gfVxuXHRcdFx0XHQpKTtcblxuXHRcdFx0XHRtYWluV2luZG93LmRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQocGFydC5kb21Ob2RlISk7XG5cdFx0XHRcdGRpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gcGFydC5kb21Ob2RlPy5yZW1vdmUoKSkpO1xuXG5cdFx0XHRcdC8vIExldCB0aGUgd2lkZ2V0J3MgbGF6eSBieXRlIGxvYWQgKGEgbWljcm90YXNrKSBzZXR0bGUgYmVmb3JlIGluc3BlY3RpbmcgcmVhZHMuXG5cdFx0XHRcdGF3YWl0IG5ldyBQcm9taXNlPHZvaWQ+KHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCAwKSk7XG5cblx0XHRcdFx0cmV0dXJuIGZpbGVTZXJ2aWNlLnJlYWRPcGVyYXRpb25zLm1hcChyZWFkID0+IHJlYWQucmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdFx0XHR9XG5cblx0XHRcdHRlc3QoJ3Nob3VsZCBsb2FkIGJ5dGVzIGZyb20gdGhlIHJlc291cmNlIGZvciBhIGh5ZHJhdGVkICh1cmktb25seSkgaW1hZ2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZpbGUoJy90ZXN0L3Bhc3RlZC1pbWFnZS5wbmcnKTtcblx0XHRcdFx0Y29uc3QgcmVhZHMgPSBhd2FpdCByZW5kZXJJbWFnZUFuZENvbGxlY3RSZWFkcyh7XG5cdFx0XHRcdFx0a2luZDogJ2ltYWdlJyxcblx0XHRcdFx0XHRpZDogJ2h5ZHJhdGVkLWltYWdlJyxcblx0XHRcdFx0XHRuYW1lOiAncGFzdGVkLWltYWdlLnBuZycsXG5cdFx0XHRcdFx0dmFsdWU6IHJlc291cmNlLFxuXHRcdFx0XHRcdG1pbWVUeXBlOiAnaW1hZ2UvcG5nJyxcblx0XHRcdFx0XHRpc1VSTDogdHJ1ZSxcblx0XHRcdFx0XHRyZWZlcmVuY2VzOiBbeyBraW5kOiAncmVmZXJlbmNlJywgcmVmZXJlbmNlOiByZXNvdXJjZSB9XVxuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlYWRzLCBbcmVzb3VyY2UudG9TdHJpbmcoKV0pO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ3Nob3VsZCBub3QgcmVhZCB0aGUgcmVzb3VyY2UgZm9yIGFuIGltYWdlIHdpdGggaW5saW5lIGJ5dGVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5maWxlKCcvdGVzdC9pbmxpbmUtaW1hZ2UucG5nJyk7XG5cdFx0XHRcdGNvbnN0IHJlYWRzID0gYXdhaXQgcmVuZGVySW1hZ2VBbmRDb2xsZWN0UmVhZHMoe1xuXHRcdFx0XHRcdGtpbmQ6ICdpbWFnZScsXG5cdFx0XHRcdFx0aWQ6ICdpbmxpbmUtaW1hZ2UnLFxuXHRcdFx0XHRcdG5hbWU6ICdpbmxpbmUtaW1hZ2UucG5nJyxcblx0XHRcdFx0XHR2YWx1ZTogbmV3IFVpbnQ4QXJyYXkoWzB4ODksIDB4NTAsIDB4NEUsIDB4NDddKSxcblx0XHRcdFx0XHRtaW1lVHlwZTogJ2ltYWdlL3BuZycsXG5cdFx0XHRcdFx0aXNVUkw6IGZhbHNlLFxuXHRcdFx0XHRcdHJlZmVyZW5jZXM6IFt7IGtpbmQ6ICdyZWZlcmVuY2UnLCByZWZlcmVuY2U6IHJlc291cmNlIH1dXG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVhZHMsIFtdKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdzaG91bGQga2VlcCBkZWxldGUgaGludCBhZnRlciBsb2FkaW5nIGh5ZHJhdGVkIGltYWdlIGJ5dGVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5maWxlKCcvdGVzdC9wYXN0ZWQtaW1hZ2UucG5nJyk7XG5cdFx0XHRcdGNvbnN0IGNvbnRhaW5lciA9IG1haW5XaW5kb3cuZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0XHRcdG1haW5XaW5kb3cuZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChjb250YWluZXIpO1xuXHRcdFx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IGNvbnRhaW5lci5yZW1vdmUoKSkpO1xuXHRcdFx0XHRjb25zdCBjb250ZXh0UmVzb3VyY2VMYWJlbHMgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUmVzb3VyY2VMYWJlbHMsIERFRkFVTFRfTEFCRUxTX0NPTlRBSU5FUikpO1xuXHRcdFx0XHRjb25zdCB3aWRnZXQgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRcdFx0SW1hZ2VBdHRhY2htZW50V2lkZ2V0LFxuXHRcdFx0XHRcdHJlc291cmNlLFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGtpbmQ6ICdpbWFnZScsXG5cdFx0XHRcdFx0XHRpZDogJ2h5ZHJhdGVkLWltYWdlLXdpdGgtZGVsZXRlJyxcblx0XHRcdFx0XHRcdG5hbWU6ICdwYXN0ZWQtaW1hZ2UucG5nJyxcblx0XHRcdFx0XHRcdHZhbHVlOiByZXNvdXJjZSxcblx0XHRcdFx0XHRcdG1pbWVUeXBlOiAnaW1hZ2UvcG5nJyxcblx0XHRcdFx0XHRcdGlzVVJMOiB0cnVlLFxuXHRcdFx0XHRcdFx0cmVmZXJlbmNlczogW3sga2luZDogJ3JlZmVyZW5jZScsIHJlZmVyZW5jZTogcmVzb3VyY2UgfV1cblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdFx0XHR7IHNob3VsZEZvY3VzQ2xlYXJCdXR0b246IGZhbHNlLCBzdXBwb3J0c0RlbGV0aW9uOiB0cnVlIH0sXG5cdFx0XHRcdFx0Y29udGFpbmVyLFxuXHRcdFx0XHRcdGNvbnRleHRSZXNvdXJjZUxhYmVsc1xuXHRcdFx0XHQpKTtcblxuXHRcdFx0XHRhd2FpdCBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgMCkpO1xuXG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRcdGFyaWFMYWJlbDogd2lkZ2V0LmVsZW1lbnQuYXJpYUxhYmVsLFxuXHRcdFx0XHRcdGNsZWFyQnV0dG9uQ2xhc3M6IHdpZGdldC5lbGVtZW50LnF1ZXJ5U2VsZWN0b3IoJy5tb25hY28tYnV0dG9uJyk/LmNsYXNzTmFtZSxcblx0XHRcdFx0fSwge1xuXHRcdFx0XHRcdGFyaWFMYWJlbDogJ0F0dGFjaGVkIGltYWdlLCBwYXN0ZWQtaW1hZ2UucG5nIChEZWxldGUpJyxcblx0XHRcdFx0XHRjbGVhckJ1dHRvbkNsYXNzOiAnbW9uYWNvLWJ1dHRvbiBjb2RpY29uIGNvZGljb24tY2xvc2UtY29tcGFjdCcsXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxpQkFBaUIsb0JBQW9CO0FBQzlDLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsV0FBVztBQUNwQixTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLCtDQUErQztBQUN4RCxTQUFTLG9CQUFvQjtBQUM3QixTQUEwQixxQ0FBcUM7QUFDL0QsU0FBUywwQkFBMEIs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
