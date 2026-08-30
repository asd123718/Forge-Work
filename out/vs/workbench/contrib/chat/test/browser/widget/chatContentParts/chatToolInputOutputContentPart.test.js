import assert from "assert";
import { mainWindow } from "../../../../../../../base/browser/window.js";
import { Event } from "../../../../../../../base/common/event.js";
import { observableValue } from "../../../../../../../base/common/observable.js";
import { URI } from "../../../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../../base/test/common/utils.js";
import { workbenchInstantiationService } from "../../../../../../test/browser/workbenchTestServices.js";
import { CodeBlockPart } from "../../../../browser/widget/chatContentParts/codeBlockPart.js";
import { ChatCollapsibleContentPart } from "../../../../browser/widget/chatContentParts/chatCollapsibleContentPart.js";
import { DiffEditorPool, EditorPool } from "../../../../browser/widget/chatContentParts/chatContentCodePools.js";
import { InlineTextModelCollection } from "../../../../browser/widget/chatContentParts/chatContentParts.js";
import { ChatCollapsibleInputOutputContentPart } from "../../../../browser/widget/chatContentParts/chatToolInputOutputContentPart.js";
import { ChatToolOutputContentSubPart } from "../../../../browser/widget/chatContentParts/chatToolOutputContentSubPart.js";
suite("ChatCollapsibleInputOutputContentPart", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  test("animates disclosure state and keeps collapsed content inert", () => {
    const editorElement = mainWindow.document.createElement("div");
    const codeBlockPart = Object.create(CodeBlockPart.prototype);
    Object.defineProperties(codeBlockPart, {
      element: { value: editorElement },
      render: { value: () => {
      } },
      layout: { value: () => {
      } }
    });
    const editorReference = {
      object: codeBlockPart,
      isStale: () => false,
      dispose: () => {
      }
    };
    const editorPool = Object.create(EditorPool.prototype);
    Object.defineProperty(editorPool, "get", { value: () => editorReference });
    const element = /* @__PURE__ */ Object.create(null);
    Object.assign(element, {
      id: "response",
      sessionResource: URI.parse("chat-session://test/session")
    });
    const context = {
      element,
      elementIndex: 0,
      container: mainWindow.document.createElement("div"),
      content: [],
      contentIndex: 0,
      inlineTextModels: Object.create(InlineTextModelCollection.prototype),
      editorPool,
      codeBlockStartIndex: 0,
      treeStartIndex: 0,
      diffEditorPool: Object.create(DiffEditorPool.prototype),
      currentWidth: observableValue("testWidth", 500),
      onDidChangeVisibility: Event.None
    };
    const instantiationService = workbenchInstantiationService(void 0, store);
    const part = store.add(instantiationService.createInstance(
      ChatCollapsibleInputOutputContentPart,
      "Read Terminal",
      void 0,
      void 0,
      context,
      {
        kind: "code",
        data: '{"shellId":"test"}',
        languageId: "json",
        options: {},
        codeBlockIndex: 0,
        ownerMarkdownPartId: "test"
      },
      void 0,
      false,
      false,
      false
    ));
    const button = part.domNode.querySelector(".chat-confirmation-widget-title");
    const widget = part.domNode.querySelector(".chat-confirmation-widget");
    const animationContent = part.domNode.querySelector(".chat-confirmation-widget-message-animation-inner");
    const chevron = part.domNode.querySelector(".chat-collapsible-hover-chevron");
    assert.ok(button);
    assert.ok(widget);
    assert.ok(animationContent);
    assert.ok(chevron);
    const expandedDuringToggle = [];
    part.domNode.addEventListener(ChatCollapsibleContentPart.userToggleEvent, () => expandedDuringToggle.push(button.ariaExpanded));
    const initiallyInert = animationContent.inert;
    button.click();
    const expandedState = {
      ariaExpanded: button.ariaExpanded,
      chevronExpanded: chevron.classList.contains("expanded"),
      inert: animationContent.inert,
      hasMessage: !!animationContent.querySelector(".chat-confirmation-widget-message")
    };
    button.click();
    assert.deepStrictEqual({
      initiallyInert,
      titleIsFirst: widget.firstElementChild === button,
      expandedState,
      collapsedInert: animationContent.inert,
      expandedDuringToggle
    }, {
      initiallyInert: true,
      titleIsFirst: true,
      expandedState: {
        ariaExpanded: "true",
        chevronExpanded: true,
        inert: false,
        hasMessage: true
      },
      collapsedInert: true,
      expandedDuringToggle: ["false", "true"]
    });
  });
  test("renders titled outputs separately", () => {
    const renderedTexts = [];
    const editorPool = Object.create(EditorPool.prototype);
    Object.defineProperty(editorPool, "get", {
      value: () => {
        const codeBlockPart = Object.create(CodeBlockPart.prototype);
        Object.defineProperties(codeBlockPart, {
          element: { value: mainWindow.document.createElement("div") },
          render: { value: (data) => renderedTexts.push(data.text) },
          uri: { value: URI.parse("test://codeblock") }
        });
        return {
          object: codeBlockPart,
          isStale: () => false,
          dispose: () => {
          }
        };
      }
    });
    const element = Object.assign(/* @__PURE__ */ Object.create(null), {
      id: "response",
      sessionResource: URI.parse("chat-session://test/session")
    });
    const context = {
      element,
      elementIndex: 0,
      container: mainWindow.document.createElement("div"),
      content: [],
      contentIndex: 0,
      inlineTextModels: Object.create(InlineTextModelCollection.prototype),
      editorPool,
      codeBlockStartIndex: 0,
      treeStartIndex: 0,
      diffEditorPool: Object.create(DiffEditorPool.prototype),
      currentWidth: observableValue("testWidth", 500),
      onDidChangeVisibility: Event.None
    };
    const instantiationService = workbenchInstantiationService(void 0, store);
    const part = store.add(instantiationService.createInstance(
      ChatToolOutputContentSubPart,
      context,
      [
        {
          kind: "code",
          title: "https://example.com/first",
          data: "First result",
          languageId: "plaintext",
          options: {},
          codeBlockIndex: 0,
          ownerMarkdownPartId: "test"
        },
        {
          kind: "code",
          title: "https://example.com/second",
          data: "Second result",
          languageId: "plaintext",
          options: {},
          codeBlockIndex: 1,
          ownerMarkdownPartId: "test"
        }
      ]
    ));
    assert.deepStrictEqual({
      titles: [...part.domNode.querySelectorAll(".chat-confirmation-widget-title")].map((element2) => element2.textContent),
      renderedTexts
    }, {
      titles: ["https://example.com/first", "https://example.com/second"],
      renderedTexts: ["First result", "Second result"]
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGJyb3dzZXJcXHdpZGdldFxcY2hhdENvbnRlbnRQYXJ0c1xcY2hhdFRvb2xJbnB1dE91dHB1dENvbnRlbnRQYXJ0LnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBtYWluV2luZG93IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3dpbmRvdy5qcyc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IG9ic2VydmFibGVWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgd29ya2JlbmNoSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi90ZXN0L2Jyb3dzZXIvd29ya2JlbmNoVGVzdFNlcnZpY2VzLmpzJztcbmltcG9ydCB7IENvZGVCbG9ja1BhcnQgfSBmcm9tICcuLi8uLi8uLi8uLi9icm93c2VyL3dpZGdldC9jaGF0Q29udGVudFBhcnRzL2NvZGVCbG9ja1BhcnQuanMnO1xuaW1wb3J0IHsgQ2hhdENvbGxhcHNpYmxlQ29udGVudFBhcnQgfSBmcm9tICcuLi8uLi8uLi8uLi9icm93c2VyL3dpZGdldC9jaGF0Q29udGVudFBhcnRzL2NoYXRDb2xsYXBzaWJsZUNvbnRlbnRQYXJ0LmpzJztcbmltcG9ydCB7IElEaXNwb3NhYmxlUmVmZXJlbmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci93aWRnZXQvY2hhdENvbnRlbnRQYXJ0cy9jaGF0Q29sbGVjdGlvbnMuanMnO1xuaW1wb3J0IHsgRGlmZkVkaXRvclBvb2wsIEVkaXRvclBvb2wgfSBmcm9tICcuLi8uLi8uLi8uLi9icm93c2VyL3dpZGdldC9jaGF0Q29udGVudFBhcnRzL2NoYXRDb250ZW50Q29kZVBvb2xzLmpzJztcbmltcG9ydCB7IElDaGF0Q29udGVudFBhcnRSZW5kZXJDb250ZXh0LCBJbmxpbmVUZXh0TW9kZWxDb2xsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci93aWRnZXQvY2hhdENvbnRlbnRQYXJ0cy9jaGF0Q29udGVudFBhcnRzLmpzJztcbmltcG9ydCB7IENoYXRDb2xsYXBzaWJsZUlucHV0T3V0cHV0Q29udGVudFBhcnQgfSBmcm9tICcuLi8uLi8uLi8uLi9icm93c2VyL3dpZGdldC9jaGF0Q29udGVudFBhcnRzL2NoYXRUb29sSW5wdXRPdXRwdXRDb250ZW50UGFydC5qcyc7XG5pbXBvcnQgeyBDaGF0VG9vbE91dHB1dENvbnRlbnRTdWJQYXJ0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci93aWRnZXQvY2hhdENvbnRlbnRQYXJ0cy9jaGF0VG9vbE91dHB1dENvbnRlbnRTdWJQYXJ0LmpzJztcbmltcG9ydCB7IElDaGF0UmVzcG9uc2VWaWV3TW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vbW9kZWwvY2hhdFZpZXdNb2RlbC5qcyc7XG5cbnN1aXRlKCdDaGF0Q29sbGFwc2libGVJbnB1dE91dHB1dENvbnRlbnRQYXJ0JywgKCkgPT4ge1xuXHRjb25zdCBzdG9yZSA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ2FuaW1hdGVzIGRpc2Nsb3N1cmUgc3RhdGUgYW5kIGtlZXBzIGNvbGxhcHNlZCBjb250ZW50IGluZXJ0JywgKCkgPT4ge1xuXHRcdGNvbnN0IGVkaXRvckVsZW1lbnQgPSBtYWluV2luZG93LmRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdGNvbnN0IGNvZGVCbG9ja1BhcnQgPSBPYmplY3QuY3JlYXRlKENvZGVCbG9ja1BhcnQucHJvdG90eXBlKSBhcyBDb2RlQmxvY2tQYXJ0O1xuXHRcdE9iamVjdC5kZWZpbmVQcm9wZXJ0aWVzKGNvZGVCbG9ja1BhcnQsIHtcblx0XHRcdGVsZW1lbnQ6IHsgdmFsdWU6IGVkaXRvckVsZW1lbnQgfSxcblx0XHRcdHJlbmRlcjogeyB2YWx1ZTogKCkgPT4geyB9IH0sXG5cdFx0XHRsYXlvdXQ6IHsgdmFsdWU6ICgpID0+IHsgfSB9LFxuXHRcdH0pO1xuXHRcdGNvbnN0IGVkaXRvclJlZmVyZW5jZTogSURpc3Bvc2FibGVSZWZlcmVuY2U8Q29kZUJsb2NrUGFydD4gPSB7XG5cdFx0XHRvYmplY3Q6IGNvZGVCbG9ja1BhcnQsXG5cdFx0XHRpc1N0YWxlOiAoKSA9PiBmYWxzZSxcblx0XHRcdGRpc3Bvc2U6ICgpID0+IHsgfSxcblx0XHR9O1xuXHRcdGNvbnN0IGVkaXRvclBvb2wgPSBPYmplY3QuY3JlYXRlKEVkaXRvclBvb2wucHJvdG90eXBlKSBhcyBFZGl0b3JQb29sO1xuXHRcdE9iamVjdC5kZWZpbmVQcm9wZXJ0eShlZGl0b3JQb29sLCAnZ2V0JywgeyB2YWx1ZTogKCkgPT4gZWRpdG9yUmVmZXJlbmNlIH0pO1xuXHRcdGNvbnN0IGVsZW1lbnQgPSBPYmplY3QuY3JlYXRlKG51bGwpIGFzIElDaGF0UmVzcG9uc2VWaWV3TW9kZWw7XG5cdFx0T2JqZWN0LmFzc2lnbihlbGVtZW50LCB7XG5cdFx0XHRpZDogJ3Jlc3BvbnNlJyxcblx0XHRcdHNlc3Npb25SZXNvdXJjZTogVVJJLnBhcnNlKCdjaGF0LXNlc3Npb246Ly90ZXN0L3Nlc3Npb24nKSxcblx0XHR9KTtcblx0XHRjb25zdCBjb250ZXh0OiBJQ2hhdENvbnRlbnRQYXJ0UmVuZGVyQ29udGV4dCA9IHtcblx0XHRcdGVsZW1lbnQsXG5cdFx0XHRlbGVtZW50SW5kZXg6IDAsXG5cdFx0XHRjb250YWluZXI6IG1haW5XaW5kb3cuZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2JyksXG5cdFx0XHRjb250ZW50OiBbXSxcblx0XHRcdGNvbnRlbnRJbmRleDogMCxcblx0XHRcdGlubGluZVRleHRNb2RlbHM6IE9iamVjdC5jcmVhdGUoSW5saW5lVGV4dE1vZGVsQ29sbGVjdGlvbi5wcm90b3R5cGUpIGFzIElubGluZVRleHRNb2RlbENvbGxlY3Rpb24sXG5cdFx0XHRlZGl0b3JQb29sLFxuXHRcdFx0Y29kZUJsb2NrU3RhcnRJbmRleDogMCxcblx0XHRcdHRyZWVTdGFydEluZGV4OiAwLFxuXHRcdFx0ZGlmZkVkaXRvclBvb2w6IE9iamVjdC5jcmVhdGUoRGlmZkVkaXRvclBvb2wucHJvdG90eXBlKSBhcyBEaWZmRWRpdG9yUG9vbCxcblx0XHRcdGN1cnJlbnRXaWR0aDogb2JzZXJ2YWJsZVZhbHVlKCd0ZXN0V2lkdGgnLCA1MDApLFxuXHRcdFx0b25EaWRDaGFuZ2VWaXNpYmlsaXR5OiBFdmVudC5Ob25lLFxuXHRcdH07XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSh1bmRlZmluZWQsIHN0b3JlKTtcblx0XHRjb25zdCBwYXJ0ID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0Q2hhdENvbGxhcHNpYmxlSW5wdXRPdXRwdXRDb250ZW50UGFydCxcblx0XHRcdCdSZWFkIFRlcm1pbmFsJyxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdGNvbnRleHQsXG5cdFx0XHR7XG5cdFx0XHRcdGtpbmQ6ICdjb2RlJyxcblx0XHRcdFx0ZGF0YTogJ3tcInNoZWxsSWRcIjpcInRlc3RcIn0nLFxuXHRcdFx0XHRsYW5ndWFnZUlkOiAnanNvbicsXG5cdFx0XHRcdG9wdGlvbnM6IHt9LFxuXHRcdFx0XHRjb2RlQmxvY2tJbmRleDogMCxcblx0XHRcdFx0b3duZXJNYXJrZG93blBhcnRJZDogJ3Rlc3QnLFxuXHRcdFx0fSxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdGZhbHNlLFxuXHRcdFx0ZmFsc2UsXG5cdFx0XHRmYWxzZSxcblx0XHQpKTtcblxuXHRcdGNvbnN0IGJ1dHRvbiA9IHBhcnQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PignLmNoYXQtY29uZmlybWF0aW9uLXdpZGdldC10aXRsZScpO1xuXHRcdGNvbnN0IHdpZGdldCA9IHBhcnQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcuY2hhdC1jb25maXJtYXRpb24td2lkZ2V0Jyk7XG5cdFx0Y29uc3QgYW5pbWF0aW9uQ29udGVudCA9IHBhcnQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PignLmNoYXQtY29uZmlybWF0aW9uLXdpZGdldC1tZXNzYWdlLWFuaW1hdGlvbi1pbm5lcicpO1xuXHRcdGNvbnN0IGNoZXZyb24gPSBwYXJ0LmRvbU5vZGUucXVlcnlTZWxlY3RvcignLmNoYXQtY29sbGFwc2libGUtaG92ZXItY2hldnJvbicpO1xuXHRcdGFzc2VydC5vayhidXR0b24pO1xuXHRcdGFzc2VydC5vayh3aWRnZXQpO1xuXHRcdGFzc2VydC5vayhhbmltYXRpb25Db250ZW50KTtcblx0XHRhc3NlcnQub2soY2hldnJvbik7XG5cdFx0Y29uc3QgZXhwYW5kZWREdXJpbmdUb2dnbGU6IEFycmF5PHN0cmluZyB8IG51bGw+ID0gW107XG5cdFx0cGFydC5kb21Ob2RlLmFkZEV2ZW50TGlzdGVuZXIoQ2hhdENvbGxhcHNpYmxlQ29udGVudFBhcnQudXNlclRvZ2dsZUV2ZW50LCAoKSA9PiBleHBhbmRlZER1cmluZ1RvZ2dsZS5wdXNoKGJ1dHRvbi5hcmlhRXhwYW5kZWQpKTtcblxuXHRcdGNvbnN0IGluaXRpYWxseUluZXJ0ID0gYW5pbWF0aW9uQ29udGVudC5pbmVydDtcblx0XHRidXR0b24uY2xpY2soKTtcblx0XHRjb25zdCBleHBhbmRlZFN0YXRlID0ge1xuXHRcdFx0YXJpYUV4cGFuZGVkOiBidXR0b24uYXJpYUV4cGFuZGVkLFxuXHRcdFx0Y2hldnJvbkV4cGFuZGVkOiBjaGV2cm9uLmNsYXNzTGlzdC5jb250YWlucygnZXhwYW5kZWQnKSxcblx0XHRcdGluZXJ0OiBhbmltYXRpb25Db250ZW50LmluZXJ0LFxuXHRcdFx0aGFzTWVzc2FnZTogISFhbmltYXRpb25Db250ZW50LnF1ZXJ5U2VsZWN0b3IoJy5jaGF0LWNvbmZpcm1hdGlvbi13aWRnZXQtbWVzc2FnZScpLFxuXHRcdH07XG5cdFx0YnV0dG9uLmNsaWNrKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGluaXRpYWxseUluZXJ0LFxuXHRcdFx0dGl0bGVJc0ZpcnN0OiB3aWRnZXQuZmlyc3RFbGVtZW50Q2hpbGQgPT09IGJ1dHRvbixcblx0XHRcdGV4cGFuZGVkU3RhdGUsXG5cdFx0XHRjb2xsYXBzZWRJbmVydDogYW5pbWF0aW9uQ29udGVudC5pbmVydCxcblx0XHRcdGV4cGFuZGVkRHVyaW5nVG9nZ2xlLFxuXHRcdH0sIHtcblx0XHRcdGluaXRpYWxseUluZXJ0OiB0cnVlLFxuXHRcdFx0dGl0bGVJc0ZpcnN0OiB0cnVlLFxuXHRcdFx0ZXhwYW5kZWRTdGF0ZToge1xuXHRcdFx0XHRhcmlhRXhwYW5kZWQ6ICd0cnVlJyxcblx0XHRcdFx0Y2hldnJvbkV4cGFuZGVkOiB0cnVlLFxuXHRcdFx0XHRpbmVydDogZmFsc2UsXG5cdFx0XHRcdGhhc01lc3NhZ2U6IHRydWUsXG5cdFx0XHR9LFxuXHRcdFx0Y29sbGFwc2VkSW5lcnQ6IHRydWUsXG5cdFx0XHRleHBhbmRlZER1cmluZ1RvZ2dsZTogWydmYWxzZScsICd0cnVlJ10sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlbmRlcnMgdGl0bGVkIG91dHB1dHMgc2VwYXJhdGVseScsICgpID0+IHtcblx0XHRjb25zdCByZW5kZXJlZFRleHRzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGNvbnN0IGVkaXRvclBvb2wgPSBPYmplY3QuY3JlYXRlKEVkaXRvclBvb2wucHJvdG90eXBlKSBhcyBFZGl0b3JQb29sO1xuXHRcdE9iamVjdC5kZWZpbmVQcm9wZXJ0eShlZGl0b3JQb29sLCAnZ2V0Jywge1xuXHRcdFx0dmFsdWU6ICgpID0+IHtcblx0XHRcdFx0Y29uc3QgY29kZUJsb2NrUGFydCA9IE9iamVjdC5jcmVhdGUoQ29kZUJsb2NrUGFydC5wcm90b3R5cGUpIGFzIENvZGVCbG9ja1BhcnQ7XG5cdFx0XHRcdE9iamVjdC5kZWZpbmVQcm9wZXJ0aWVzKGNvZGVCbG9ja1BhcnQsIHtcblx0XHRcdFx0XHRlbGVtZW50OiB7IHZhbHVlOiBtYWluV2luZG93LmRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpIH0sXG5cdFx0XHRcdFx0cmVuZGVyOiB7IHZhbHVlOiAoZGF0YTogeyB0ZXh0OiBzdHJpbmcgfSkgPT4gcmVuZGVyZWRUZXh0cy5wdXNoKGRhdGEudGV4dCkgfSxcblx0XHRcdFx0XHR1cmk6IHsgdmFsdWU6IFVSSS5wYXJzZSgndGVzdDovL2NvZGVibG9jaycpIH0sXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdG9iamVjdDogY29kZUJsb2NrUGFydCxcblx0XHRcdFx0XHRpc1N0YWxlOiAoKSA9PiBmYWxzZSxcblx0XHRcdFx0XHRkaXNwb3NlOiAoKSA9PiB7IH0sXG5cdFx0XHRcdH0gc2F0aXNmaWVzIElEaXNwb3NhYmxlUmVmZXJlbmNlPENvZGVCbG9ja1BhcnQ+O1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdGNvbnN0IGVsZW1lbnQgPSBPYmplY3QuYXNzaWduKE9iamVjdC5jcmVhdGUobnVsbCksIHtcblx0XHRcdGlkOiAncmVzcG9uc2UnLFxuXHRcdFx0c2Vzc2lvblJlc291cmNlOiBVUkkucGFyc2UoJ2NoYXQtc2Vzc2lvbjovL3Rlc3Qvc2Vzc2lvbicpLFxuXHRcdH0pIGFzIElDaGF0UmVzcG9uc2VWaWV3TW9kZWw7XG5cdFx0Y29uc3QgY29udGV4dDogSUNoYXRDb250ZW50UGFydFJlbmRlckNvbnRleHQgPSB7XG5cdFx0XHRlbGVtZW50LFxuXHRcdFx0ZWxlbWVudEluZGV4OiAwLFxuXHRcdFx0Y29udGFpbmVyOiBtYWluV2luZG93LmRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpLFxuXHRcdFx0Y29udGVudDogW10sXG5cdFx0XHRjb250ZW50SW5kZXg6IDAsXG5cdFx0XHRpbmxpbmVUZXh0TW9kZWxzOiBPYmplY3QuY3JlYXRlKElubGluZVRleHRNb2RlbENvbGxlY3Rpb24ucHJvdG90eXBlKSBhcyBJbmxpbmVUZXh0TW9kZWxDb2xsZWN0aW9uLFxuXHRcdFx0ZWRpdG9yUG9vbCxcblx0XHRcdGNvZGVCbG9ja1N0YXJ0SW5kZXg6IDAsXG5cdFx0XHR0cmVlU3RhcnRJbmRleDogMCxcblx0XHRcdGRpZmZFZGl0b3JQb29sOiBPYmplY3QuY3JlYXRlKERpZmZFZGl0b3JQb29sLnByb3RvdHlwZSkgYXMgRGlmZkVkaXRvclBvb2wsXG5cdFx0XHRjdXJyZW50V2lkdGg6IG9ic2VydmFibGVWYWx1ZSgndGVzdFdpZHRoJywgNTAwKSxcblx0XHRcdG9uRGlkQ2hhbmdlVmlzaWJpbGl0eTogRXZlbnQuTm9uZSxcblx0XHR9O1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gd29ya2JlbmNoSW5zdGFudGlhdGlvblNlcnZpY2UodW5kZWZpbmVkLCBzdG9yZSk7XG5cdFx0Y29uc3QgcGFydCA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdENoYXRUb29sT3V0cHV0Q29udGVudFN1YlBhcnQsXG5cdFx0XHRjb250ZXh0LFxuXHRcdFx0W1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0a2luZDogJ2NvZGUnLFxuXHRcdFx0XHRcdHRpdGxlOiAnaHR0cHM6Ly9leGFtcGxlLmNvbS9maXJzdCcsXG5cdFx0XHRcdFx0ZGF0YTogJ0ZpcnN0IHJlc3VsdCcsXG5cdFx0XHRcdFx0bGFuZ3VhZ2VJZDogJ3BsYWludGV4dCcsXG5cdFx0XHRcdFx0b3B0aW9uczoge30sXG5cdFx0XHRcdFx0Y29kZUJsb2NrSW5kZXg6IDAsXG5cdFx0XHRcdFx0b3duZXJNYXJrZG93blBhcnRJZDogJ3Rlc3QnLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0a2luZDogJ2NvZGUnLFxuXHRcdFx0XHRcdHRpdGxlOiAnaHR0cHM6Ly9leGFtcGxlLmNvbS9zZWNvbmQnLFxuXHRcdFx0XHRcdGRhdGE6ICdTZWNvbmQgcmVzdWx0Jyxcblx0XHRcdFx0XHRsYW5ndWFnZUlkOiAncGxhaW50ZXh0Jyxcblx0XHRcdFx0XHRvcHRpb25zOiB7fSxcblx0XHRcdFx0XHRjb2RlQmxvY2tJbmRleDogMSxcblx0XHRcdFx0XHRvd25lck1hcmtkb3duUGFydElkOiAndGVzdCcsXG5cdFx0XHRcdH0sXG5cdFx0XHRdLFxuXHRcdCkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHR0aXRsZXM6IFsuLi5wYXJ0LmRvbU5vZGUucXVlcnlTZWxlY3RvckFsbCgnLmNoYXQtY29uZmlybWF0aW9uLXdpZGdldC10aXRsZScpXS5tYXAoZWxlbWVudCA9PiBlbGVtZW50LnRleHRDb250ZW50KSxcblx0XHRcdHJlbmRlcmVkVGV4dHMsXG5cdFx0fSwge1xuXHRcdFx0dGl0bGVzOiBbJ2h0dHBzOi8vZXhhbXBsZS5jb20vZmlyc3QnLCAnaHR0cHM6Ly9leGFtcGxlLmNvbS9zZWNvbmQnXSxcblx0XHRcdHJlbmRlcmVkVGV4dHM6IFsnRmlyc3QgcmVzdWx0JywgJ1NlY29uZCByZXN1bHQnXSxcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGFBQWE7QUFDdEIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMscUNBQXFDO0FBQzlDLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsa0NBQWtDO0FBRTNDLFNBQVMsZ0JBQWdCLGtCQUFrQjtBQUMzQyxTQUF3QyxpQ0FBaUM7QUFDekUsU0FBUyw2Q0FBNkM7QUFDdEQsU0FBUyxvQ0FBb0M7QUFHN0MsTUFBTSx5Q0FBeUMsTUFBTTtBQUNwRCxRQUFNLFFBQVEsd0NBQXdDO0FBRXRELE9BQUssK0RBQStELE1BQU07QUFDekUsVUFBTSxnQkFBZ0IsV0FBVyxTQUFTLGNBQWMsS0FBSztBQUM3RCxVQUFNLGdCQUFnQixPQUFPLE9BQU8sY0FBYyxTQUFTO0FBQzNELFdBQU8saUJBQWlCLGVBQWU7QUFBQSxNQUN0QyxTQUFTLEVBQUUsT0FBTyxjQUFjO0FBQUEsTUFDaEMsUUFBUSxFQUFFLE9BQU8sTUFBTTtBQUFBLE1BQUUsRUFBRTtBQUFBLE1BQzNCLFFBQVEsRUFBRSxPQUFPLE1BQU07QUFBQSxNQUFFLEVBQUU7QUFBQSxJQUM1QixDQUFDO0FBQ0QsVUFBTSxrQkFBdUQ7QUFBQSxNQUM1RCxRQUFRO0FBQUEsTUFDUixTQUFTLE1BQU07QUFBQSxNQUNm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
