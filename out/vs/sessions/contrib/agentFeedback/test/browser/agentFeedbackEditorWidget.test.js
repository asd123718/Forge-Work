import assert from "assert";
import { isHTMLElement } from "../../../../../base/browser/dom.js";
import { mainWindow } from "../../../../../base/browser/window.js";
import { DisposableStore } from "../../../../../base/common/lifecycle.js";
import { URI } from "../../../../../base/common/uri.js";
import { mock } from "../../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { withTestCodeEditor } from "../../../../../editor/test/browser/testCodeEditor.js";
import { SyncDescriptor } from "../../../../../platform/instantiation/common/descriptors.js";
import { ServiceCollection } from "../../../../../platform/instantiation/common/serviceCollection.js";
import { IMarkdownRendererService, MarkdownRendererService } from "../../../../../platform/markdown/browser/markdownRenderer.js";
import { ICodeReviewService } from "../../../codeReview/browser/codeReviewService.js";
import { AgentFeedbackEditorWidget } from "../../browser/agentFeedbackEditorWidget.js";
import { AgentFeedbackKind, IAgentFeedbackService } from "../../browser/agentFeedbackService.js";
import { SessionEditorCommentSource } from "../../browser/sessionEditorComments.js";
suite("AgentFeedbackEditorWidget", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const sessionResource = URI.parse("vscode-agent-session://test/session-1");
  const fileResource = URI.parse("inmemory://model/agent-feedback-widget-test.ts");
  const comment = {
    id: "agentFeedback:feedback-1",
    sourceId: "feedback-1",
    source: SessionEditorCommentSource.AgentFeedback,
    kind: AgentFeedbackKind.UserReview,
    sessionResource,
    resourceUri: fileResource,
    range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 },
    text: "Original comment",
    canConvertToAgentFeedback: false
  };
  function withWidget(callback) {
    const navigations = [];
    const services = new ServiceCollection();
    services.set(IAgentFeedbackService, new class extends mock() {
      setNavigationAnchor(_sessionResource, commentId) {
        navigations.push(commentId);
      }
      updateFeedback() {
      }
    }());
    services.set(ICodeReviewService, new class extends mock() {
    }());
    services.set(IMarkdownRendererService, new SyncDescriptor(MarkdownRendererService));
    withTestCodeEditor(["first line", "second line"], { serviceCollection: services }, (editor, _viewModel, instantiationService) => {
      const store = new DisposableStore();
      const draftState = { drafts: /* @__PURE__ */ new Map(), focusedCommentId: void 0 };
      let widget;
      const createWidget = () => {
        widget = store.add(instantiationService.createInstance(AgentFeedbackEditorWidget, editor, [comment], sessionResource, draftState));
        const domNode = widget.getDomNode();
        mainWindow.document.body.appendChild(domNode);
        widget.restoreComposerFocus();
        widget.expand();
        return domNode;
      };
      const rebuild = () => {
        const previous = widget;
        const activeElement = mainWindow.document.activeElement;
        draftState.focusedCommentId = isHTMLElement(activeElement) ? previous.findComposerCommentIdForElement(activeElement) : void 0;
        previous.getDomNode().remove();
        previous.dispose();
        return createWidget();
      };
      try {
        callback({ navigations, domNode: createWidget(), rebuild });
      } finally {
        widget?.getDomNode().remove();
        store.dispose();
      }
    });
  }
  function triggerAction(domNode, codiconClass) {
    domNode.querySelector(`.agent-feedback-widget-item-actions .action-label.${codiconClass}`).click();
  }
  function composer(domNode) {
    return domNode.querySelector("textarea.agent-feedback-widget-edit-textarea");
  }
  function type(textarea, text) {
    textarea.value = text;
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  }
  function dispatchEscape(target) {
    const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    Object.defineProperty(event, "keyCode", { get: () => 27 });
    target.dispatchEvent(event);
  }
  test("clicking inside the edit composer keeps it open and focused without navigating", () => {
    withWidget(({ domNode, navigations }) => {
      triggerAction(domNode, "codicon-edit");
      const textarea = composer(domNode);
      textarea.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      textarea.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      assert.deepStrictEqual({
        stillOpen: composer(domNode) === textarea,
        focused: mainWindow.document.activeElement === textarea,
        navigations: [...navigations]
      }, { stillOpen: true, focused: true, navigations: [] });
    });
  });
  test("clicking the comment text navigates", () => {
    withWidget(({ domNode, navigations }) => {
      domNode.querySelector(".agent-feedback-widget-text").dispatchEvent(new MouseEvent("click", { bubbles: true }));
      assert.deepStrictEqual([...navigations], [comment.id]);
    });
  });
  test("the edit composer survives losing focus and is closed by Escape from the widget", () => {
    withWidget(({ domNode }) => {
      triggerAction(domNode, "codicon-edit");
      const textarea = composer(domNode);
      type(textarea, "edited text");
      domNode.querySelector(".agent-feedback-widget-text").dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      textarea.blur();
      const openAfterBlur = composer(domNode) === textarea;
      dispatchEscape(domNode);
      assert.deepStrictEqual({
        openAfterBlur,
        openAfterEscape: composer(domNode) !== null
      }, { openAfterBlur: true, openAfterEscape: false });
    });
  });
  test("the empty reply composer survives losing focus and is closed by Escape", () => {
    withWidget(({ domNode }) => {
      triggerAction(domNode, "codicon-comment-discussion");
      const textarea = composer(domNode);
      textarea.blur();
      const openAfterBlur = composer(domNode) === textarea;
      dispatchEscape(textarea);
      assert.deepStrictEqual({
        openAfterBlur,
        openAfterEscape: composer(domNode) !== null
      }, { openAfterBlur: true, openAfterEscape: false });
    });
  });
  test("an edit draft survives a widget rebuild", () => {
    withWidget((harness) => {
      triggerAction(harness.domNode, "codicon-edit");
      type(composer(harness.domNode), "edited text");
      const rebuilt = harness.rebuild();
      const restored = composer(rebuilt);
      assert.deepStrictEqual({
        text: restored?.value,
        editing: rebuilt.querySelector(".agent-feedback-widget-text.editing") !== null,
        focused: mainWindow.document.activeElement === restored
      }, { text: "edited text", editing: true, focused: true });
    });
  });
  test("a saved edit does not reopen the composer after the rebuild", () => {
    withWidget((harness) => {
      triggerAction(harness.domNode, "codicon-edit");
      const textarea = composer(harness.domNode);
      type(textarea, "edited text");
      const event = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
      Object.defineProperty(event, "keyCode", { get: () => 13 });
      textarea.dispatchEvent(event);
      assert.strictEqual(composer(harness.rebuild()), null);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcYWdlbnRGZWVkYmFja1xcdGVzdFxcYnJvd3NlclxcYWdlbnRGZWVkYmFja0VkaXRvcldpZGdldC50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgaXNIVE1MRWxlbWVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgbWFpbldpbmRvdyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci93aW5kb3cuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBtb2NrIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi9tb2NrLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgd2l0aFRlc3RDb2RlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL3Rlc3QvYnJvd3Nlci90ZXN0Q29kZUVkaXRvci5qcyc7XG5pbXBvcnQgeyBTeW5jRGVzY3JpcHRvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2Rlc2NyaXB0b3JzLmpzJztcbmltcG9ydCB7IFNlcnZpY2VDb2xsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vc2VydmljZUNvbGxlY3Rpb24uanMnO1xuaW1wb3J0IHsgSU1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlLCBNYXJrZG93blJlbmRlcmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL21hcmtkb3duL2Jyb3dzZXIvbWFya2Rvd25SZW5kZXJlci5qcyc7XG5pbXBvcnQgeyBJQ29kZVJldmlld1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb2RlUmV2aWV3L2Jyb3dzZXIvY29kZVJldmlld1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWdlbnRGZWVkYmFja0VkaXRvcldpZGdldCwgSUNvbXBvc2VyRHJhZnRTdGF0ZSB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvYWdlbnRGZWVkYmFja0VkaXRvcldpZGdldC5qcyc7XG5pbXBvcnQgeyBBZ2VudEZlZWRiYWNrS2luZCwgSUFnZW50RmVlZGJhY2tTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9hZ2VudEZlZWRiYWNrU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbkVkaXRvckNvbW1lbnQsIFNlc3Npb25FZGl0b3JDb21tZW50U291cmNlIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9zZXNzaW9uRWRpdG9yQ29tbWVudHMuanMnO1xuXG5zdWl0ZSgnQWdlbnRGZWVkYmFja0VkaXRvcldpZGdldCcsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBVUkkucGFyc2UoJ3ZzY29kZS1hZ2VudC1zZXNzaW9uOi8vdGVzdC9zZXNzaW9uLTEnKTtcblx0Y29uc3QgZmlsZVJlc291cmNlID0gVVJJLnBhcnNlKCdpbm1lbW9yeTovL21vZGVsL2FnZW50LWZlZWRiYWNrLXdpZGdldC10ZXN0LnRzJyk7XG5cblx0Y29uc3QgY29tbWVudDogSVNlc3Npb25FZGl0b3JDb21tZW50ID0ge1xuXHRcdGlkOiAnYWdlbnRGZWVkYmFjazpmZWVkYmFjay0xJyxcblx0XHRzb3VyY2VJZDogJ2ZlZWRiYWNrLTEnLFxuXHRcdHNvdXJjZTogU2Vzc2lvbkVkaXRvckNvbW1lbnRTb3VyY2UuQWdlbnRGZWVkYmFjayxcblx0XHRraW5kOiBBZ2VudEZlZWRiYWNrS2luZC5Vc2VyUmV2aWV3LFxuXHRcdHNlc3Npb25SZXNvdXJjZSxcblx0XHRyZXNvdXJjZVVyaTogZmlsZVJlc291cmNlLFxuXHRcdHJhbmdlOiB7IHN0YXJ0TGluZU51bWJlcjogMSwgc3RhcnRDb2x1bW46IDEsIGVuZExpbmVOdW1iZXI6IDEsIGVuZENvbHVtbjogMSB9LFxuXHRcdHRleHQ6ICdPcmlnaW5hbCBjb21tZW50Jyxcblx0XHRjYW5Db252ZXJ0VG9BZ2VudEZlZWRiYWNrOiBmYWxzZSxcblx0fTtcblxuXHRpbnRlcmZhY2UgSVRlc3RIYXJuZXNzIHtcblx0XHQvKiogQ29tbWVudCBpZHMgcGFzc2VkIHRvIGBzZXROYXZpZ2F0aW9uQW5jaG9yYCwgaW4gY2FsbCBvcmRlci4gKi9cblx0XHRyZWFkb25seSBuYXZpZ2F0aW9uczogcmVhZG9ubHkgc3RyaW5nW107XG5cdFx0cmVhZG9ubHkgZG9tTm9kZTogSFRNTEVsZW1lbnQ7XG5cdFx0LyoqIFRlYXJzIHRoZSB3aWRnZXQgZG93biBhbmQgYnVpbGRzIGEgbmV3IG9uZSwgYXMgdGhlIGNvbnRyaWJ1dGlvbiBkb2VzIG9uIGFueSBmZWVkYmFjayBjaGFuZ2UuICovXG5cdFx0cmVidWlsZCgpOiBIVE1MRWxlbWVudDtcblx0fVxuXG5cdGZ1bmN0aW9uIHdpdGhXaWRnZXQoY2FsbGJhY2s6IChoYXJuZXNzOiBJVGVzdEhhcm5lc3MpID0+IHZvaWQpOiB2b2lkIHtcblx0XHRjb25zdCBuYXZpZ2F0aW9uczogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCBzZXJ2aWNlcyA9IG5ldyBTZXJ2aWNlQ29sbGVjdGlvbigpO1xuXHRcdHNlcnZpY2VzLnNldChJQWdlbnRGZWVkYmFja1NlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUFnZW50RmVlZGJhY2tTZXJ2aWNlPigpIHtcblx0XHRcdG92ZXJyaWRlIHNldE5hdmlnYXRpb25BbmNob3IoX3Nlc3Npb25SZXNvdXJjZTogVVJJLCBjb21tZW50SWQ6IHN0cmluZyk6IHZvaWQgeyBuYXZpZ2F0aW9ucy5wdXNoKGNvbW1lbnRJZCk7IH1cblx0XHRcdG92ZXJyaWRlIHVwZGF0ZUZlZWRiYWNrKCk6IHZvaWQgeyB9XG5cdFx0fSk7XG5cdFx0c2VydmljZXMuc2V0KElDb2RlUmV2aWV3U2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQ29kZVJldmlld1NlcnZpY2U+KCkgeyB9KTtcblx0XHRzZXJ2aWNlcy5zZXQoSU1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlLCBuZXcgU3luY0Rlc2NyaXB0b3IoTWFya2Rvd25SZW5kZXJlclNlcnZpY2UpKTtcblxuXHRcdHdpdGhUZXN0Q29kZUVkaXRvcihbJ2ZpcnN0IGxpbmUnLCAnc2Vjb25kIGxpbmUnXSwgeyBzZXJ2aWNlQ29sbGVjdGlvbjogc2VydmljZXMgfSwgKGVkaXRvciwgX3ZpZXdNb2RlbCwgaW5zdGFudGlhdGlvblNlcnZpY2UpID0+IHtcblx0XHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdFx0Y29uc3QgZHJhZnRTdGF0ZTogSUNvbXBvc2VyRHJhZnRTdGF0ZSA9IHsgZHJhZnRzOiBuZXcgTWFwKCksIGZvY3VzZWRDb21tZW50SWQ6IHVuZGVmaW5lZCB9O1xuXHRcdFx0bGV0IHdpZGdldDogQWdlbnRGZWVkYmFja0VkaXRvcldpZGdldCB8IHVuZGVmaW5lZDtcblxuXHRcdFx0Y29uc3QgY3JlYXRlV2lkZ2V0ID0gKCkgPT4ge1xuXHRcdFx0XHR3aWRnZXQgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRGZWVkYmFja0VkaXRvcldpZGdldCwgZWRpdG9yLCBbY29tbWVudF0sIHNlc3Npb25SZXNvdXJjZSwgZHJhZnRTdGF0ZSkpO1xuXHRcdFx0XHRjb25zdCBkb21Ob2RlID0gd2lkZ2V0LmdldERvbU5vZGUoKTtcblx0XHRcdFx0Ly8gVGhlIHRlc3QgZWRpdG9yIGhhcyBubyByZWFsIHZpZXcsIHNvIGF0dGFjaCB0aGUgb3ZlcmxheSBvdXJzZWx2ZXMgZm9yIGZvY3VzIHRvIHdvcmsuXG5cdFx0XHRcdG1haW5XaW5kb3cuZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChkb21Ob2RlKTtcblx0XHRcdFx0d2lkZ2V0LnJlc3RvcmVDb21wb3NlckZvY3VzKCk7XG5cdFx0XHRcdHdpZGdldC5leHBhbmQoKTtcblx0XHRcdFx0cmV0dXJuIGRvbU5vZGU7XG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCByZWJ1aWxkID0gKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBwcmV2aW91cyA9IHdpZGdldCE7XG5cdFx0XHRcdGNvbnN0IGFjdGl2ZUVsZW1lbnQgPSBtYWluV2luZG93LmRvY3VtZW50LmFjdGl2ZUVsZW1lbnQ7XG5cdFx0XHRcdGRyYWZ0U3RhdGUuZm9jdXNlZENvbW1lbnRJZCA9IGlzSFRNTEVsZW1lbnQoYWN0aXZlRWxlbWVudCkgPyBwcmV2aW91cy5maW5kQ29tcG9zZXJDb21tZW50SWRGb3JFbGVtZW50KGFjdGl2ZUVsZW1lbnQpIDogdW5kZWZpbmVkO1xuXHRcdFx0XHRwcmV2aW91cy5nZXREb21Ob2RlKCkucmVtb3ZlKCk7XG5cdFx0XHRcdHByZXZpb3VzLmRpc3Bvc2UoKTtcblx0XHRcdFx0cmV0dXJuIGNyZWF0ZVdpZGdldCgpO1xuXHRcdFx0fTtcblxuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y2FsbGJhY2soeyBuYXZpZ2F0aW9ucywgZG9tTm9kZTogY3JlYXRlV2lkZ2V0KCksIHJlYnVpbGQgfSk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHR3aWRnZXQ/LmdldERvbU5vZGUoKS5yZW1vdmUoKTtcblx0XHRcdFx0c3RvcmUuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0ZnVuY3Rpb24gdHJpZ2dlckFjdGlvbihkb21Ob2RlOiBIVE1MRWxlbWVudCwgY29kaWNvbkNsYXNzOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRkb21Ob2RlLnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KGAuYWdlbnQtZmVlZGJhY2std2lkZ2V0LWl0ZW0tYWN0aW9ucyAuYWN0aW9uLWxhYmVsLiR7Y29kaWNvbkNsYXNzfWApIS5jbGljaygpO1xuXHR9XG5cblx0ZnVuY3Rpb24gY29tcG9zZXIoZG9tTm9kZTogSFRNTEVsZW1lbnQpOiBIVE1MVGV4dEFyZWFFbGVtZW50IHwgbnVsbCB7XG5cdFx0cmV0dXJuIGRvbU5vZGUucXVlcnlTZWxlY3RvcjxIVE1MVGV4dEFyZWFFbGVtZW50PigndGV4dGFyZWEuYWdlbnQtZmVlZGJhY2std2lkZ2V0LWVkaXQtdGV4dGFyZWEnKTtcblx0fVxuXG5cdGZ1bmN0aW9uIHR5cGUodGV4dGFyZWE6IEhUTUxUZXh0QXJlYUVsZW1lbnQsIHRleHQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRleHRhcmVhLnZhbHVlID0gdGV4dDtcblx0XHR0ZXh0YXJlYS5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnaW5wdXQnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xuXHR9XG5cblx0ZnVuY3Rpb24gZGlzcGF0Y2hFc2NhcGUodGFyZ2V0OiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdGNvbnN0IGV2ZW50ID0gbmV3IEtleWJvYXJkRXZlbnQoJ2tleWRvd24nLCB7IGtleTogJ0VzY2FwZScsIGJ1YmJsZXM6IHRydWUsIGNhbmNlbGFibGU6IHRydWUgfSk7XG5cdFx0T2JqZWN0LmRlZmluZVByb3BlcnR5KGV2ZW50LCAna2V5Q29kZScsIHsgZ2V0OiAoKSA9PiAyNyB9KTtcblx0XHR0YXJnZXQuZGlzcGF0Y2hFdmVudChldmVudCk7XG5cdH1cblxuXHR0ZXN0KCdjbGlja2luZyBpbnNpZGUgdGhlIGVkaXQgY29tcG9zZXIga2VlcHMgaXQgb3BlbiBhbmQgZm9jdXNlZCB3aXRob3V0IG5hdmlnYXRpbmcnLCAoKSA9PiB7XG5cdFx0d2l0aFdpZGdldCgoeyBkb21Ob2RlLCBuYXZpZ2F0aW9ucyB9KSA9PiB7XG5cdFx0XHR0cmlnZ2VyQWN0aW9uKGRvbU5vZGUsICdjb2RpY29uLWVkaXQnKTtcblx0XHRcdGNvbnN0IHRleHRhcmVhID0gY29tcG9zZXIoZG9tTm9kZSkhO1xuXG5cdFx0XHR0ZXh0YXJlYS5kaXNwYXRjaEV2ZW50KG5ldyBNb3VzZUV2ZW50KCdtb3VzZWRvd24nLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xuXHRcdFx0dGV4dGFyZWEuZGlzcGF0Y2hFdmVudChuZXcgTW91c2VFdmVudCgnY2xpY2snLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0c3RpbGxPcGVuOiBjb21wb3Nlcihkb21Ob2RlKSA9PT0gdGV4dGFyZWEsXG5cdFx0XHRcdGZvY3VzZWQ6IG1haW5XaW5kb3cuZG9jdW1lbnQuYWN0aXZlRWxlbWVudCA9PT0gdGV4dGFyZWEsXG5cdFx0XHRcdG5hdmlnYXRpb25zOiBbLi4ubmF2aWdhdGlvbnNdLFxuXHRcdFx0fSwgeyBzdGlsbE9wZW46IHRydWUsIGZvY3VzZWQ6IHRydWUsIG5hdmlnYXRpb25zOiBbXSB9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnY2xpY2tpbmcgdGhlIGNvbW1lbnQgdGV4dCBuYXZpZ2F0ZXMnLCAoKSA9PiB7XG5cdFx0d2l0aFdpZGdldCgoeyBkb21Ob2RlLCBuYXZpZ2F0aW9ucyB9KSA9PiB7XG5cdFx0XHRkb21Ob2RlLnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KCcuYWdlbnQtZmVlZGJhY2std2lkZ2V0LXRleHQnKSEuZGlzcGF0Y2hFdmVudChuZXcgTW91c2VFdmVudCgnY2xpY2snLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFsuLi5uYXZpZ2F0aW9uc10sIFtjb21tZW50LmlkXSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3RoZSBlZGl0IGNvbXBvc2VyIHN1cnZpdmVzIGxvc2luZyBmb2N1cyBhbmQgaXMgY2xvc2VkIGJ5IEVzY2FwZSBmcm9tIHRoZSB3aWRnZXQnLCAoKSA9PiB7XG5cdFx0d2l0aFdpZGdldCgoeyBkb21Ob2RlIH0pID0+IHtcblx0XHRcdHRyaWdnZXJBY3Rpb24oZG9tTm9kZSwgJ2NvZGljb24tZWRpdCcpO1xuXHRcdFx0Y29uc3QgdGV4dGFyZWEgPSBjb21wb3Nlcihkb21Ob2RlKSE7XG5cdFx0XHR0eXBlKHRleHRhcmVhLCAnZWRpdGVkIHRleHQnKTtcblxuXHRcdFx0Ly8gQ2xpY2tpbmcgdGhlIGNvbW1lbnQgdGV4dCBwdWxscyBmb2N1cyB0byB0aGUgd2lkZ2V0IHNvIHRoZSBET00gc2VsZWN0aW9uIGNhbiBiZSBjb3BpZWQuXG5cdFx0XHRkb21Ob2RlLnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KCcuYWdlbnQtZmVlZGJhY2std2lkZ2V0LXRleHQnKSEuZGlzcGF0Y2hFdmVudChuZXcgTW91c2VFdmVudCgnbW91c2Vkb3duJywgeyBidWJibGVzOiB0cnVlIH0pKTtcblx0XHRcdHRleHRhcmVhLmJsdXIoKTtcblx0XHRcdGNvbnN0IG9wZW5BZnRlckJsdXIgPSBjb21wb3Nlcihkb21Ob2RlKSA9PT0gdGV4dGFyZWE7XG5cblx0XHRcdGRpc3BhdGNoRXNjYXBlKGRvbU5vZGUpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0b3BlbkFmdGVyQmx1cixcblx0XHRcdFx0b3BlbkFmdGVyRXNjYXBlOiBjb21wb3Nlcihkb21Ob2RlKSAhPT0gbnVsbCxcblx0XHRcdH0sIHsgb3BlbkFmdGVyQmx1cjogdHJ1ZSwgb3BlbkFmdGVyRXNjYXBlOiBmYWxzZSB9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgndGhlIGVtcHR5IHJlcGx5IGNvbXBvc2VyIHN1cnZpdmVzIGxvc2luZyBmb2N1cyBhbmQgaXMgY2xvc2VkIGJ5IEVzY2FwZScsICgpID0+IHtcblx0XHR3aXRoV2lkZ2V0KCh7IGRvbU5vZGUgfSkgPT4ge1xuXHRcdFx0dHJpZ2dlckFjdGlvbihkb21Ob2RlLCAnY29kaWNvbi1jb21tZW50LWRpc2N1c3Npb24nKTtcblx0XHRcdGNvbnN0IHRleHRhcmVhID0gY29tcG9zZXIoZG9tTm9kZSkhO1xuXG5cdFx0XHR0ZXh0YXJlYS5ibHVyKCk7XG5cdFx0XHRjb25zdCBvcGVuQWZ0ZXJCbHVyID0gY29tcG9zZXIoZG9tTm9kZSkgPT09IHRleHRhcmVhO1xuXG5cdFx0XHRkaXNwYXRjaEVzY2FwZSh0ZXh0YXJlYSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRvcGVuQWZ0ZXJCbHVyLFxuXHRcdFx0XHRvcGVuQWZ0ZXJFc2NhcGU6IGNvbXBvc2VyKGRvbU5vZGUpICE9PSBudWxsLFxuXHRcdFx0fSwgeyBvcGVuQWZ0ZXJCbHVyOiB0cnVlLCBvcGVuQWZ0ZXJFc2NhcGU6IGZhbHNlIH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdhbiBlZGl0IGRyYWZ0IHN1cnZpdmVzIGEgd2lkZ2V0IHJlYnVpbGQnLCAoKSA9PiB7XG5cdFx0d2l0aFdpZGdldChoYXJuZXNzID0+IHtcblx0XHRcdHRyaWdnZXJBY3Rpb24oaGFybmVzcy5kb21Ob2RlLCAnY29kaWNvbi1lZGl0Jyk7XG5cdFx0XHR0eXBlKGNvbXBvc2VyKGhhcm5lc3MuZG9tTm9kZSkhLCAnZWRpdGVkIHRleHQnKTtcblxuXHRcdFx0Y29uc3QgcmVidWlsdCA9IGhhcm5lc3MucmVidWlsZCgpO1xuXHRcdFx0Y29uc3QgcmVzdG9yZWQgPSBjb21wb3NlcihyZWJ1aWx0KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdHRleHQ6IHJlc3RvcmVkPy52YWx1ZSxcblx0XHRcdFx0ZWRpdGluZzogcmVidWlsdC5xdWVyeVNlbGVjdG9yKCcuYWdlbnQtZmVlZGJhY2std2lkZ2V0LXRleHQuZWRpdGluZycpICE9PSBudWxsLFxuXHRcdFx0XHRmb2N1c2VkOiBtYWluV2luZG93LmRvY3VtZW50LmFjdGl2ZUVsZW1lbnQgPT09IHJlc3RvcmVkLFxuXHRcdFx0fSwgeyB0ZXh0OiAnZWRpdGVkIHRleHQnLCBlZGl0aW5nOiB0cnVlLCBmb2N1c2VkOiB0cnVlIH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdhIHNhdmVkIGVkaXQgZG9lcyBub3QgcmVvcGVuIHRoZSBjb21wb3NlciBhZnRlciB0aGUgcmVidWlsZCcsICgpID0+IHtcblx0XHR3aXRoV2lkZ2V0KGhhcm5lc3MgPT4ge1xuXHRcdFx0dHJpZ2dlckFjdGlvbihoYXJuZXNzLmRvbU5vZGUsICdjb2RpY29uLWVkaXQnKTtcblx0XHRcdGNvbnN0IHRleHRhcmVhID0gY29tcG9zZXIoaGFybmVzcy5kb21Ob2RlKSE7XG5cdFx0XHR0eXBlKHRleHRhcmVhLCAnZWRpdGVkIHRleHQnKTtcblxuXHRcdFx0Y29uc3QgZXZlbnQgPSBuZXcgS2V5Ym9hcmRFdmVudCgna2V5ZG93bicsIHsga2V5OiAnRW50ZXInLCBidWJibGVzOiB0cnVlLCBjYW5jZWxhYmxlOiB0cnVlIH0pO1xuXHRcdFx0T2JqZWN0LmRlZmluZVByb3BlcnR5KGV2ZW50LCAna2V5Q29kZScsIHsgZ2V0OiAoKSA9PiAxMyB9KTtcblx0XHRcdHRleHRhcmVhLmRpc3BhdGNoRXZlbnQoZXZlbnQpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29tcG9zZXIoaGFybmVzcy5yZWJ1aWxkKCkpLCBudWxsKTtcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLHFCQUFxQjtBQUM5QixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLFdBQVc7QUFDcEIsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsMEJBQTBCLCtCQUErQjtBQUNsRSxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLGlDQUFzRDtBQUMvRCxTQUFTLG1CQUFtQiw2QkFBNkI7QUFDekQsU0FBZ0Msa0NBQWtDO0FBRWxFLE1BQU0sNkJBQTZCLE1BQU07QUFFeEMsMENBQXdDO0FBRXhDLFFBQU0sa0JBQWtCLElBQUksTUFBTSx1Q0FBdUM7QUFDekUsUUFBTSxlQUFlLElBQUksTUFBTSxnREFBZ0Q7QUFFL0UsUUFBTSxVQUFpQztBQUFBLElBQ3RDLElBQUk7QUFBQSxJQUNKLFVBQVU7QUFBQSxJQUNWLFFBQVEsMkJBQTJCO0FBQUEsSUFDbkMsTUFBTSxrQkFBa0I7QUFBQSxJQUN4QjtBQUFBLElBQ0EsYUFBYTtBQUFBLElBQ2IsT0FBTyxFQUFFLGlCQUFpQixHQUFHLGFBQWEsR0FBRyxlQUFlLEdBQUcsV0FBVyxFQUFFO0FBQUEsSUFDNUUsTUFBTTtBQUFBLElBQ04sMkJBQTJCO0FBQUEsRUFDNUI7QUFVQSxXQUFTLFdBQVcsVUFBaUQ7QUFDcEUsVUFBTSxjQUF3QixDQUFDO0FBQy9CLFVBQU0sV0FBVyxJQUFJLGtCQUFrQjtBQUN2QyxhQUFTLElBQUksdUJBQXVCLElBQUksY0FBYyxLQUE0QixFQUFFO0FBQUEsTUFDMUUsb0JB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
