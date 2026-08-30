import assert from "assert";
import * as dom from "../../../../../base/browser/dom.js";
import { Emitter } from "../../../../../base/common/event.js";
import { DisposableStore, toDisposable } from "../../../../../base/common/lifecycle.js";
import { constObservable } from "../../../../../base/common/observable.js";
import { URI } from "../../../../../base/common/uri.js";
import { upcastPartial } from "../../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { ILogService, NullLogService } from "../../../../../platform/log/common/log.js";
import { TestInstantiationService } from "../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { INotificationService, Severity } from "../../../../../platform/notification/common/notification.js";
import { TestNotificationService } from "../../../../../platform/notification/test/common/testNotificationService.js";
import { ResponseSelectionSideChatController } from "../../browser/responseSelectionSideChatController.js";
import { ISessionsPartService } from "../../../../services/sessions/browser/sessionsPartService.js";
import { ISessionsService } from "../../../../services/sessions/browser/sessionsService.js";
import { SessionStatus } from "../../../../services/sessions/common/session.js";
import { ISessionsManagementService } from "../../../../services/sessions/common/sessionsManagement.js";
class RecordingNotificationService extends TestNotificationService {
  constructor() {
    super(...arguments);
    this.notifications = [];
  }
  warn(message) {
    this.notifications.push({ severity: Severity.Warning, message });
    return super.warn(message);
  }
  error(error) {
    this.notifications.push({ severity: Severity.Error, message: error instanceof Error ? error.message : error });
    return super.error(error);
  }
}
suite("ResponseSelectionSideChatController", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  function setup(options) {
    const store = disposables.add(new DisposableStore());
    const instantiationService = store.add(new TestInstantiationService());
    const doc = dom.getActiveDocument();
    const widgetDomNode = doc.createElement("div");
    doc.body.appendChild(widgetDomNode);
    store.add(toDisposable(() => widgetDomNode.remove()));
    const transcriptDomNode = doc.createElement("div");
    widgetDomNode.appendChild(transcriptDomNode);
    const markdown = doc.createElement("div");
    markdown.classList.add("chat-markdown-part");
    markdown.style.position = "absolute";
    markdown.style.top = "0px";
    markdown.style.left = "0px";
    const textNode = doc.createTextNode("hello world");
    markdown.appendChild(textNode);
    transcriptDomNode.appendChild(markdown);
    const response = upcastPartial({ requestId: "turn-1", setVote: () => void 0 });
    const focusResponseItemCalls = [];
    const onDidScroll = store.add(new Emitter());
    let autoScrollHolds = 0;
    const widget = upcastPartial({
      domNode: widgetDomNode,
      transcriptDomNode,
      getElementFromNode: options?.getElementFromNode ?? (() => response),
      focusResponseItem: (lastFocused) => {
        focusResponseItemCalls.push(!!lastFocused);
      },
      onDidScroll: onDidScroll.event,
      holdAutoScroll: () => {
        autoScrollHolds++;
        return toDisposable(() => {
          autoScrollHolds--;
        });
      }
    });
    const containerRect = { top: 0, left: 0, width: 600, height: 600 };
    widgetDomNode.getBoundingClientRect = () => containerRect;
    let transcriptRect = { top: 0, left: 0, width: 600, height: 600 };
    transcriptDomNode.getBoundingClientRect = () => transcriptRect;
    const targetWindow = dom.getWindow(widgetDomNode);
    const originalGetSelection = targetWindow.getSelection.bind(targetWindow);
    const mutableWindow = targetWindow;
    let selectionText = "";
    const range = doc.createRange();
    range.setStart(textNode, 0);
    range.setEnd(textNode, textNode.data.length);
    const outsideNode = doc.createTextNode("unrelated text");
    const outside = doc.createElement("div");
    outside.appendChild(outsideNode);
    widgetDomNode.appendChild(outside);
    const outsideRange = doc.createRange();
    outsideRange.setStart(outsideNode, 0);
    outsideRange.setEnd(outsideNode, outsideNode.data.length);
    let activeRange = range;
    mutableWindow.getSelection = () => upcastPartial({
      toString: () => selectionText,
      isCollapsed: selectionText.length === 0,
      anchorNode: activeRange.startContainer,
      focusNode: activeRange.endContainer,
      rangeCount: 1,
      getRangeAt: () => activeRange
    });
    store.add(toDisposable(() => {
      mutableWindow.getSelection = originalGetSelection;
    }));
    const setSelection = (text, selectionTop) => {
      activeRange = range;
      selectionText = text;
      if (selectionTop !== void 0) {
        markdown.style.top = `${selectionTop}px`;
      }
      doc.dispatchEvent(new Event("selectionchange"));
    };
    const setSelectionOutsideTranscript = (text) => {
      activeRange = outsideRange;
      selectionText = text;
      doc.dispatchEvent(new Event("selectionchange"));
    };
    const setTranscriptRect = (rect) => {
      transcriptRect = rect;
    };
    const detachSelectedRow = () => {
      markdown.remove();
      selectionText = "";
    };
    const scroll = (selectionTop) => {
      if (selectionTop !== void 0) {
        markdown.style.top = `${selectionTop}px`;
      }
      onDidScroll.fire();
    };
    const highlightedRanges = () => targetWindow.CSS.highlights?.get("chat-response-selection")?.size ?? 0;
    const sideChat = upcastPartial({ resource: URI.parse("test:///chat/side") });
    const chat = upcastPartial({ resource: URI.parse("test:///chat/source") });
    const session = upcastPartial({
      sessionId: "session",
      resource: URI.parse("test:///session"),
      status: constObservable(SessionStatus.Completed),
      isArchived: constObservable(false),
      capabilities: constObservable({ supportsMultipleChats: true, supportsSideChat: true })
    });
    const callOrder = [];
    const notificationService = new RecordingNotificationService();
    instantiationService.stub(ISessionsManagementService, upcastPartial({
      getSessionForChatResource: (resource) => resource.toString() === chat.resource.toString() ? { session, chat } : void 0,
      createSideChatInSession: options?.createSideChatInSession ?? (async (_session, _sourceChat, turnId, selection) => {
        callOrder.push(`create:${turnId}:${selection?.text}`);
        return sideChat;
      }),
      sendRequest: options?.sendRequest ?? (async (_session, sentChat, sendOptions) => {
        callOrder.push(`send:${sentChat.resource.toString()}:${sendOptions.query}`);
      })
    }));
    instantiationService.stub(ISessionsService, upcastPartial({
      openChat: async (_session, chatUri) => {
        callOrder.push(`open:${chatUri.toString()}`);
      }
    }));
    instantiationService.stub(ISessionsPartService, upcastPartial({
      getSessionView: () => void 0
    }));
    instantiationService.stub(INotificationService, notificationService);
    instantiationService.stub(ILogService, new NullLogService());
    const controller = store.add(instantiationService.createInstance(ResponseSelectionSideChatController, widget));
    controller.setChat(chat);
    return { controller, setSelection, setSelectionOutsideTranscript, setTranscriptRect, detachSelectedRow, scroll, autoScrollHolds: () => autoScrollHolds, callOrder, doc, chat, sideChat, focusResponseItemCalls, notificationService, highlightedRanges, inputHeight: () => inputDomNode(controller).offsetHeight };
  }
  function inputDomNode(controller) {
    return controller._input.domNode;
  }
  function inputTextArea(controller) {
    return controller._input.inputElement;
  }
  function isInputBusy(controller) {
    return controller._input.isBusy;
  }
  function submitViaClick(controller, query) {
    const textArea = inputTextArea(controller);
    textArea.value = query;
    textArea.dispatchEvent(new Event("input", { bubbles: true }));
    inputDomNode(controller).querySelector(".action-label").click();
  }
  function dispatchKey(target, key, options) {
    const event = new KeyboardEvent("keydown", { key, shiftKey: options?.shiftKey, bubbles: true, cancelable: true });
    Object.defineProperty(event, "keyCode", { get: () => key === "Escape" ? 27 : 13 });
    if (options?.isComposing) {
      Object.defineProperty(event, "isComposing", { get: () => true });
    }
    target.dispatchEvent(event);
    return event;
  }
  test("shows the ask-question input for a valid markdown selection", () => {
    const { controller, setSelection } = setup();
    assert.strictEqual(inputDomNode(controller).style.display, "none");
    setSelection("hello world");
    assert.notStrictEqual(inputDomNode(controller).style.display, "none");
  });
  test("hides the input again once the selection is cleared", () => {
    const { controller, setSelection } = setup();
    setSelection("hello world");
    assert.notStrictEqual(inputDomNode(controller).style.display, "none");
    setSelection("");
    assert.strictEqual(inputDomNode(controller).style.display, "none");
  });
  test("creates, opens, and sends a side chat anchored to the response on submit", async () => {
    const { controller, setSelection, callOrder, sideChat } = setup();
    setSelection("hello world");
    const textArea = inputTextArea(controller);
    textArea.value = "what does this mean?";
    textArea.dispatchEvent(new Event("input", { bubbles: true }));
    inputDomNode(controller).querySelector(".action-label").click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepStrictEqual(callOrder, [
      "create:turn-1:hello world",
      `open:${sideChat.resource.toString()}`,
      `send:${sideChat.resource.toString()}:what does this mean?`
    ]);
  });
  test("stays visible and keeps the captured selection when the input steals focus and collapses the native selection", () => {
    const { controller, setSelection, callOrder } = setup();
    setSelection("hello world");
    assert.notStrictEqual(inputDomNode(controller).style.display, "none");
    const textArea = inputTextArea(controller);
    textArea.focus();
    setSelection("");
    assert.notStrictEqual(inputDomNode(controller).style.display, "none", "input must stay visible while focused");
    textArea.value = "what does this mean?";
    textArea.dispatchEvent(new Event("input", { bubbles: true }));
    inputDomNode(controller).querySelector(".action-label").click();
    assert.ok(callOrder[0]?.startsWith("create:turn-1:hello world"));
  });
  test("dismisses once focus genuinely leaves the input and the selection is invalid", () => {
    const { controller, setSelection } = setup();
    setSelection("hello world");
    const textArea = inputTextArea(controller);
    textArea.focus();
    setSelection("");
    assert.notStrictEqual(inputDomNode(controller).style.display, "none");
    textArea.blur();
    setSelection("");
    assert.strictEqual(inputDomNode(controller).style.display, "none", "input must dismiss once focus truly leaves it");
  });
  test("restores focus to the response item when Escape dismisses the focused input", () => {
    const { controller, setSelection, focusResponseItemCalls } = setup();
    setSelection("hello world");
    const textArea = inputTextArea(controller);
    textArea.focus();
    dispatchKey(textArea, "Escape");
    assert.strictEqual(inputDomNode(controller).style.display, "none");
    assert.deepStrictEqual(focusResponseItemCalls, [true]);
  });
  test("does not restore focus on dismiss when the input was not focused", () => {
    const { setSelection, focusResponseItemCalls } = setup();
    setSelection("hello world");
    setSelection("");
    assert.deepStrictEqual(focusResponseItemCalls, []);
  });
  test("clamps the overlay vertically when the transcript is shorter than the overlay", () => {
    const { controller, setSelection, setTranscriptRect } = setup();
    setTranscriptRect({ top: 0, left: 0, width: 600, height: 20 });
    setSelection("hello world", 10);
    const style = inputDomNode(controller).style;
    assert.notStrictEqual(style.display, "none");
    assert.strictEqual(parseFloat(style.top), 0);
  });
  test("dismisses and releases the hold when virtualization detaches the selected row", () => {
    const { controller, setSelection, scroll, autoScrollHolds, detachSelectedRow } = setup();
    setSelection("hello world", 100);
    assert.notStrictEqual(inputDomNode(controller).style.display, "none");
    assert.strictEqual(autoScrollHolds(), 1);
    detachSelectedRow();
    scroll();
    assert.strictEqual(inputDomNode(controller).style.display, "none", "must not point at nothing");
    assert.strictEqual(autoScrollHolds(), 0, "the transcript must not stay pinned forever");
  });
  test("follows the selection as the transcript scrolls instead of staying pinned", () => {
    const { controller, setSelection, scroll } = setup();
    setSelection("hello world", 100);
    const style = inputDomNode(controller).style;
    const initialTop = parseFloat(style.top);
    scroll(60);
    assert.strictEqual(parseFloat(style.top), initialTop - 40);
  });
  test("confines the overlay to the transcript even when the widget extends past it", () => {
    const { controller, setSelection, scroll, setTranscriptRect, inputHeight } = setup();
    setTranscriptRect({ top: 0, left: 0, width: 600, height: 300 });
    setSelection("hello world", 50);
    scroll(5e3);
    const top = parseFloat(inputDomNode(controller).style.top);
    assert.ok(top <= 300 - inputHeight(), `top ${top} must stay within the 300px transcript, not the 600px widget`);
  });
  test("parks at the top of the transcript when the selection scrolls above it", () => {
    const { controller, setSelection, scroll, setTranscriptRect, inputHeight } = setup();
    setTranscriptRect({ top: 100, left: 0, width: 600, height: 300 });
    setSelection("hello world", 200);
    assert.notStrictEqual(inputDomNode(controller).style.display, "none");
    scroll(-800);
    const style = inputDomNode(controller).style;
    assert.notStrictEqual(style.display, "none", "the overlay stays visible at the edge");
    assert.strictEqual(parseFloat(style.top), 100, "parks at the transcript top, not the widget top");
    assert.ok(inputHeight() > 0);
  });
  test("parks at the bottom of the transcript instead of drifting over the chat input", () => {
    const { controller, setSelection, scroll, setTranscriptRect, inputHeight } = setup();
    setTranscriptRect({ top: 0, left: 0, width: 600, height: 300 });
    setSelection("hello world", 50);
    scroll(900);
    const top = parseFloat(inputDomNode(controller).style.top);
    assert.strictEqual(top, 300 - inputHeight(), "parks flush with the transcript bottom");
  });
  test("clamps horizontally to the transcript bounds", () => {
    const { controller, setSelection, setTranscriptRect } = setup();
    setTranscriptRect({ top: 0, left: 40, width: 120, height: 300 });
    setSelection("hello world");
    const left = parseFloat(inputDomNode(controller).style.left);
    assert.ok(left >= 40, `left ${left} must not start before the transcript's left edge`);
    assert.ok(left <= 160, `left ${left} must not start past the transcript's right edge`);
  });
  test("holds transcript auto-scroll while a selection is active and releases it on dismiss", () => {
    const { setSelection, autoScrollHolds } = setup();
    assert.strictEqual(autoScrollHolds(), 0);
    setSelection("hello world");
    assert.strictEqual(autoScrollHolds(), 1, "a selection must pin the transcript");
    setSelection("");
    assert.strictEqual(autoScrollHolds(), 0, "clearing the selection releases the transcript");
  });
  test("does not hold auto-scroll for a selection outside the transcript", () => {
    const { setSelectionOutsideTranscript, autoScrollHolds } = setup({ getElementFromNode: () => void 0 });
    setSelectionOutsideTranscript("unrelated text");
    assert.strictEqual(autoScrollHolds(), 0);
  });
  test("holds auto-scroll for a transcript selection that does not resolve to a single response", () => {
    const { controller, setSelection, autoScrollHolds } = setup({ getElementFromNode: () => void 0 });
    setSelection("hello world");
    assert.strictEqual(inputDomNode(controller).style.display, "none", "no affordance for an unresolvable selection");
    assert.strictEqual(autoScrollHolds(), 1);
  });
  test("keeps holding auto-scroll while the input has focus and the native selection is collapsed", () => {
    const { controller, setSelection, autoScrollHolds } = setup();
    setSelection("hello world");
    inputTextArea(controller).focus();
    setSelection("");
    assert.strictEqual(autoScrollHolds(), 1);
  });
  test("releases the auto-scroll hold when disposed", () => {
    const { controller, setSelection, autoScrollHolds } = setup();
    setSelection("hello world");
    assert.strictEqual(autoScrollHolds(), 1);
    controller.dispose();
    assert.strictEqual(autoScrollHolds(), 0);
  });
  test("paints the captured selection with a custom highlight once the native selection is gone", () => {
    const { controller, setSelection, highlightedRanges } = setup();
    setSelection("hello world");
    assert.strictEqual(highlightedRanges(), 0, "the browser still paints the live native selection");
    inputTextArea(controller).focus();
    setSelection("");
    assert.strictEqual(highlightedRanges(), 1);
    inputTextArea(controller).blur();
    setSelection("");
    assert.strictEqual(inputDomNode(controller).style.display, "none");
    assert.strictEqual(highlightedRanges(), 0, "dismissing must clear the highlight");
  });
  test("clears the highlight when the controller is disposed", () => {
    const { controller, setSelection, highlightedRanges } = setup();
    setSelection("hello world");
    inputTextArea(controller).focus();
    setSelection("");
    assert.strictEqual(highlightedRanges(), 1);
    controller.dispose();
    assert.strictEqual(highlightedRanges(), 0);
  });
  test("stays visible with a busy state while the request is pending, then clears once it settles", async () => {
    let resolveCreate;
    const pending = new Promise((resolve) => {
      resolveCreate = resolve;
    });
    const { controller, setSelection, callOrder, sideChat } = setup({
      createSideChatInSession: async (_session, _sourceChat, turnId, selection) => {
        callOrder.push(`create:${turnId}:${selection?.text}`);
        return pending;
      }
    });
    setSelection("hello world");
    submitViaClick(controller, "what does this mean?");
    assert.strictEqual(isInputBusy(controller), true, "input must report busy while the request is pending");
    assert.strictEqual(inputTextArea(controller).disabled, true, "the textarea must be disabled while pending");
    assert.notStrictEqual(inputDomNode(controller).style.display, "none", "the overlay must stay visible while pending, not be dismissed eagerly");
    resolveCreate(sideChat);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepStrictEqual(callOrder, [
      "create:turn-1:hello world",
      `open:${sideChat.resource.toString()}`,
      `send:${sideChat.resource.toString()}:what does this mean?`
    ]);
    assert.strictEqual(isInputBusy(controller), false, "busy clears once the orchestration settles");
  });
  test("prevents duplicate submission (click and Enter) while a request is pending", async () => {
    let resolveCreate;
    const pending = new Promise((resolve) => {
      resolveCreate = resolve;
    });
    let createCalls = 0;
    const { controller, setSelection, sideChat } = setup({
      createSideChatInSession: async () => {
        createCalls++;
        return pending;
      }
    });
    setSelection("hello world");
    submitViaClick(controller, "what does this mean?");
    assert.strictEqual(createCalls, 1);
    inputDomNode(controller).querySelector(".action-label").click();
    dispatchKey(inputTextArea(controller), "Enter");
    assert.strictEqual(createCalls, 1, "only the first submission must create a side chat");
    resolveCreate(sideChat);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  test("ignores Escape and selection-change dismissal while a request is pending", async () => {
    let resolveCreate;
    const pending = new Promise((resolve) => {
      resolveCreate = resolve;
    });
    const { controller, setSelection, sideChat } = setup({
      createSideChatInSession: async () => pending
    });
    setSelection("hello world");
    submitViaClick(controller, "what does this mean?");
    assert.notStrictEqual(inputDomNode(controller).style.display, "none");
    dispatchKey(inputTextArea(controller), "Escape");
    assert.notStrictEqual(inputDomNode(controller).style.display, "none", "Escape must not dismiss a pending request");
    setSelection("");
    assert.notStrictEqual(inputDomNode(controller).style.display, "none", "an invalidated selection must not dismiss a pending request");
    resolveCreate(sideChat);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  test("restores the entered question and re-enables the input when the side chat fails to create", async () => {
    const { controller, setSelection, notificationService } = setup({
      createSideChatInSession: async () => {
        throw new Error("boom");
      }
    });
    setSelection("hello world");
    submitViaClick(controller, "what does this mean?");
    assert.strictEqual(isInputBusy(controller), true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.strictEqual(isInputBusy(controller), false, "busy must clear on failure");
    assert.strictEqual(inputTextArea(controller).disabled, false, "the textarea must be re-enabled on failure");
    assert.strictEqual(inputTextArea(controller).value, "what does this mean?", "the entered question must be restored on failure");
    assert.notStrictEqual(inputDomNode(controller).style.display, "none", "the overlay must stay visible so the user can retry");
    assert.strictEqual(notificationService.notifications.length, 1);
    assert.strictEqual(notificationService.notifications[0].severity, Severity.Error);
  });
  test("same-chat setChat (e.g. a status/interactivity update) preserves a visible draft", () => {
    const { controller, setSelection, chat } = setup();
    setSelection("hello world");
    const textArea = inputTextArea(controller);
    textArea.value = "a draft in progress";
    textArea.dispatchEvent(new Event("input", { bubbles: true }));
    controller.setChat(upcastPartial({ resource: chat.resource }));
    assert.notStrictEqual(inputDomNode(controller).style.display, "none", "input must stay visible on a same-resource setChat");
    assert.strictEqual(textArea.value, "a draft in progress", "the typed draft must survive a same-resource setChat");
  });
  test("same-chat setChat does not clear a pending busy submission", async () => {
    let resolveCreate;
    const pending = new Promise((resolve) => {
      resolveCreate = resolve;
    });
    const { controller, setSelection, callOrder, chat, sideChat } = setup({
      createSideChatInSession: async (_session, _sourceChat, turnId, selection) => {
        callOrder.push(`create:${turnId}:${selection?.text}`);
        return pending;
      }
    });
    setSelection("hello world");
    submitViaClick(controller, "what does this mean?");
    assert.strictEqual(isInputBusy(controller), true);
    controller.setChat(upcastPartial({ resource: chat.resource }));
    assert.strictEqual(isInputBusy(controller), true, "busy must survive a same-resource setChat");
    assert.strictEqual(inputTextArea(controller).disabled, true);
    assert.notStrictEqual(inputDomNode(controller).style.display, "none");
    resolveCreate(sideChat);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepStrictEqual(callOrder, [
      "create:turn-1:hello world",
      `open:${sideChat.resource.toString()}`,
      `send:${sideChat.resource.toString()}:what does this mean?`
    ]);
    assert.strictEqual(isInputBusy(controller), false);
  });
  test("different-resource setChat force-dismisses even while busy", async () => {
    let resolveCreate;
    const pending = new Promise((resolve) => {
      resolveCreate = resolve;
    });
    const { controller, setSelection } = setup({
      createSideChatInSession: async () => pending
    });
    setSelection("hello world");
    submitViaClick(controller, "what does this mean?");
    assert.strictEqual(isInputBusy(controller), true);
    controller.setChat(upcastPartial({ resource: URI.parse("test:///chat/other") }));
    assert.strictEqual(inputDomNode(controller).style.display, "none", "a genuine chat change must dismiss even a busy overlay");
    assert.strictEqual(isInputBusy(controller), false);
    setSelection("");
    resolveCreate(upcastPartial({ resource: URI.parse("test:///chat/side") }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.strictEqual(inputDomNode(controller).style.display, "none");
  });
  test("a success that settles after a different-resource setChat does not reopen, refocus, or mutate the overlay", async () => {
    let resolveCreate;
    const pending = new Promise((resolve) => {
      resolveCreate = resolve;
    });
    const { controller, setSelection, focusResponseItemCalls } = setup({
      createSideChatInSession: async () => pending
    });
    setSelection("hello world");
    submitViaClick(controller, "what does this mean?");
    controller.setChat(upcastPartial({ resource: URI.parse("test:///chat/other") }));
    setSelection("");
    const focusCallsAtDismiss = focusResponseItemCalls.length;
    resolveCreate(upcastPartial({ resource: URI.parse("test:///chat/side") }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.strictEqual(inputDomNode(controller).style.display, "none", "a stale success must not reopen the overlay");
    assert.strictEqual(inputTextArea(controller).value, "", "a stale success must not mutate the (already cleared) input value");
    assert.deepStrictEqual(focusResponseItemCalls.length, focusCallsAtDismiss, "a stale success must not refocus the transcript");
  });
  test("a failure that settles after a different-resource setChat does not reopen, refocus, mutate, or notify", async () => {
    let rejectCreate;
    const pending = new Promise((_resolve, reject) => {
      rejectCreate = reject;
    });
    const { controller, setSelection, notificationService, focusResponseItemCalls } = setup({
      createSideChatInSession: async () => pending
    });
    setSelection("hello world");
    submitViaClick(controller, "what does this mean?");
    controller.setChat(upcastPartial({ resource: URI.parse("test:///chat/other") }));
    setSelection("");
    const focusCallsAtDismiss = focusResponseItemCalls.length;
    rejectCreate(new Error("boom"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.strictEqual(inputDomNode(controller).style.display, "none", "a stale failure must not reopen the overlay");
    assert.strictEqual(inputTextArea(controller).value, "", "a stale failure must not restore the failed question into the (already cleared) input");
    assert.deepStrictEqual(focusResponseItemCalls.length, focusCallsAtDismiss, "a stale failure must not refocus the input");
    assert.strictEqual(notificationService.notifications.length, 0, "a stale failure must not surface a retry notification for an abandoned overlay");
  });
  test("plain Enter submits and prevents the default newline", () => {
    const { controller, setSelection, callOrder } = setup();
    setSelection("hello world");
    const textArea = inputTextArea(controller);
    textArea.value = "what does this mean?";
    textArea.dispatchEvent(new Event("input", { bubbles: true }));
    const event = dispatchKey(textArea, "Enter");
    assert.strictEqual(event.defaultPrevented, true, "plain Enter must prevent the default newline");
    assert.ok(callOrder[0]?.startsWith("create:turn-1:hello world"), "plain Enter must submit");
  });
  test("Shift+Enter inserts a newline instead of submitting", () => {
    const { controller, setSelection, callOrder } = setup();
    setSelection("hello world");
    const textArea = inputTextArea(controller);
    textArea.value = "what does this mean?";
    textArea.dispatchEvent(new Event("input", { bubbles: true }));
    const event = dispatchKey(textArea, "Enter", { shiftKey: true });
    assert.strictEqual(event.defaultPrevented, false, "Shift+Enter must let the textarea insert a newline");
    assert.deepStrictEqual(callOrder, [], "Shift+Enter must not submit");
    assert.notStrictEqual(inputDomNode(controller).style.display, "none", "Shift+Enter must not dismiss the overlay");
  });
  test("Enter during IME composition does not submit", () => {
    const { controller, setSelection, callOrder } = setup();
    setSelection("hello world");
    const textArea = inputTextArea(controller);
    textArea.value = "what does this mean?";
    textArea.dispatchEvent(new Event("input", { bubbles: true }));
    const event = dispatchKey(textArea, "Enter", { isComposing: true });
    assert.strictEqual(event.defaultPrevented, false, "Enter during IME composition must not be prevented");
    assert.deepStrictEqual(callOrder, [], "Enter during IME composition must not submit");
    assert.notStrictEqual(inputDomNode(controller).style.display, "none", "Enter during IME composition must not dismiss the overlay");
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcY2hhdFxcdGVzdFxcYnJvd3NlclxccmVzcG9uc2VTZWxlY3Rpb25TaWRlQ2hhdENvbnRyb2xsZXIudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBjb25zdE9ic2VydmFibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyB1cGNhc3RQYXJ0aWFsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi9tb2NrLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UsIE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi90ZXN0L2NvbW1vbi9pbnN0YW50aWF0aW9uU2VydmljZU1vY2suanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvbkhhbmRsZSwgSU5vdGlmaWNhdGlvblNlcnZpY2UsIFNldmVyaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgVGVzdE5vdGlmaWNhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vdGVzdC9jb21tb24vdGVzdE5vdGlmaWNhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXRXaWRnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvY2hhdC5qcyc7XG5pbXBvcnQgeyBJQ2hhdFJlc3BvbnNlVmlld01vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vbW9kZWwvY2hhdFZpZXdNb2RlbC5qcyc7XG5pbXBvcnQgeyBSZXNwb25zZVNlbGVjdGlvblNpZGVDaGF0Q29udHJvbGxlciB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvcmVzcG9uc2VTZWxlY3Rpb25TaWRlQ2hhdENvbnRyb2xsZXIuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25zUGFydFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9icm93c2VyL3Nlc3Npb25zUGFydFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25zU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2Jyb3dzZXIvc2Vzc2lvbnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0LCBJU2Vzc2lvbiwgU2Vzc2lvblN0YXR1cyB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2NvbW1vbi9zZXNzaW9uLmpzJztcbmltcG9ydCB7IElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvY29tbW9uL3Nlc3Npb25zTWFuYWdlbWVudC5qcyc7XG5cbmNsYXNzIFJlY29yZGluZ05vdGlmaWNhdGlvblNlcnZpY2UgZXh0ZW5kcyBUZXN0Tm90aWZpY2F0aW9uU2VydmljZSB7XG5cdHJlYWRvbmx5IG5vdGlmaWNhdGlvbnM6IHsgc2V2ZXJpdHk6IFNldmVyaXR5OyBtZXNzYWdlOiBzdHJpbmcgfVtdID0gW107XG5cdG92ZXJyaWRlIHdhcm4obWVzc2FnZTogc3RyaW5nKTogSU5vdGlmaWNhdGlvbkhhbmRsZSB7XG5cdFx0dGhpcy5ub3RpZmljYXRpb25zLnB1c2goeyBzZXZlcml0eTogU2V2ZXJpdHkuV2FybmluZywgbWVzc2FnZSB9KTtcblx0XHRyZXR1cm4gc3VwZXIud2FybihtZXNzYWdlKTtcblx0fVxuXHRvdmVycmlkZSBlcnJvcihlcnJvcjogc3RyaW5nIHwgRXJyb3IpOiBJTm90aWZpY2F0aW9uSGFuZGxlIHtcblx0XHR0aGlzLm5vdGlmaWNhdGlvbnMucHVzaCh7IHNldmVyaXR5OiBTZXZlcml0eS5FcnJvciwgbWVzc2FnZTogZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBlcnJvciB9KTtcblx0XHRyZXR1cm4gc3VwZXIuZXJyb3IoZXJyb3IpO1xuXHR9XG59XG5cbnN1aXRlKCdSZXNwb25zZVNlbGVjdGlvblNpZGVDaGF0Q29udHJvbGxlcicsICgpID0+IHtcblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRmdW5jdGlvbiBzZXR1cChvcHRpb25zPzoge1xuXHRcdGNyZWF0ZVNpZGVDaGF0SW5TZXNzaW9uPzogSVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2VbJ2NyZWF0ZVNpZGVDaGF0SW5TZXNzaW9uJ107XG5cdFx0c2VuZFJlcXVlc3Q/OiBJU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZVsnc2VuZFJlcXVlc3QnXTtcblx0XHRnZXRFbGVtZW50RnJvbU5vZGU/OiBJQ2hhdFdpZGdldFsnZ2V0RWxlbWVudEZyb21Ob2RlJ107XG5cdH0pIHtcblx0XHRjb25zdCBzdG9yZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gc3RvcmUuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cdFx0Y29uc3QgZG9jID0gZG9tLmdldEFjdGl2ZURvY3VtZW50KCk7XG5cdFx0Y29uc3Qgd2lkZ2V0RG9tTm9kZSA9IGRvYy5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRkb2MuYm9keS5hcHBlbmRDaGlsZCh3aWRnZXREb21Ob2RlKTtcblx0XHRzdG9yZS5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHdpZGdldERvbU5vZGUucmVtb3ZlKCkpKTtcblxuXHRcdC8vIE1pcnJvcnMgdGhlIHJlYWwgc3RydWN0dXJlOiB0aGUgc2Nyb2xsYWJsZSB0cmFuc2NyaXB0IGlzIGEgY2hpbGQgb2Zcblx0XHQvLyB0aGUgY2hhdCB2aWV3LCBhbmQgcmVzcG9uc2VzIGFyZSByZW5kZXJlZCBpbnNpZGUgaXQuXG5cdFx0Y29uc3QgdHJhbnNjcmlwdERvbU5vZGUgPSBkb2MuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0d2lkZ2V0RG9tTm9kZS5hcHBlbmRDaGlsZCh0cmFuc2NyaXB0RG9tTm9kZSk7XG5cblx0XHRjb25zdCBtYXJrZG93biA9IGRvYy5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRtYXJrZG93bi5jbGFzc0xpc3QuYWRkKCdjaGF0LW1hcmtkb3duLXBhcnQnKTtcblx0XHQvLyBQb3NpdGlvbmVkIHNvIHRoZSBzZWxlY3Rpb24ncyByZWFsIGNsaWVudCByZWN0cyAodGhlIGNvbnRyb2xsZXJcblx0XHQvLyBtZWFzdXJlcyB0aGUgcmFuZ2UgaXRzZWxmKSBsYW5kIGF0IGtub3duIGNvb3JkaW5hdGVzLlxuXHRcdG1hcmtkb3duLnN0eWxlLnBvc2l0aW9uID0gJ2Fic29sdXRlJztcblx0XHRtYXJrZG93bi5zdHlsZS50b3AgPSAnMHB4Jztcblx0XHRtYXJrZG93bi5zdHlsZS5sZWZ0ID0gJzBweCc7XG5cdFx0Y29uc3QgdGV4dE5vZGUgPSBkb2MuY3JlYXRlVGV4dE5vZGUoJ2hlbGxvIHdvcmxkJyk7XG5cdFx0bWFya2Rvd24uYXBwZW5kQ2hpbGQodGV4dE5vZGUpO1xuXHRcdHRyYW5zY3JpcHREb21Ob2RlLmFwcGVuZENoaWxkKG1hcmtkb3duKTtcblxuXHRcdGNvbnN0IHJlc3BvbnNlID0gdXBjYXN0UGFydGlhbDxJQ2hhdFJlc3BvbnNlVmlld01vZGVsPih7IHJlcXVlc3RJZDogJ3R1cm4tMScsIHNldFZvdGU6ICgpID0+IHVuZGVmaW5lZCB9KTtcblx0XHRjb25zdCBmb2N1c1Jlc3BvbnNlSXRlbUNhbGxzOiBib29sZWFuW10gPSBbXTtcblx0XHRjb25zdCBvbkRpZFNjcm9sbCA9IHN0b3JlLmFkZChuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0XHRsZXQgYXV0b1Njcm9sbEhvbGRzID0gMDtcblx0XHRjb25zdCB3aWRnZXQgPSB1cGNhc3RQYXJ0aWFsPElDaGF0V2lkZ2V0Pih7XG5cdFx0XHRkb21Ob2RlOiB3aWRnZXREb21Ob2RlLFxuXHRcdFx0dHJhbnNjcmlwdERvbU5vZGUsXG5cdFx0XHRnZXRFbGVtZW50RnJvbU5vZGU6IG9wdGlvbnM/LmdldEVsZW1lbnRGcm9tTm9kZSA/PyAoKCkgPT4gcmVzcG9uc2UpLFxuXHRcdFx0Zm9jdXNSZXNwb25zZUl0ZW06IChsYXN0Rm9jdXNlZD86IGJvb2xlYW4pID0+IHsgZm9jdXNSZXNwb25zZUl0ZW1DYWxscy5wdXNoKCEhbGFzdEZvY3VzZWQpOyB9LFxuXHRcdFx0b25EaWRTY3JvbGw6IG9uRGlkU2Nyb2xsLmV2ZW50LFxuXHRcdFx0aG9sZEF1dG9TY3JvbGw6ICgpID0+IHtcblx0XHRcdFx0YXV0b1Njcm9sbEhvbGRzKys7XG5cdFx0XHRcdHJldHVybiB0b0Rpc3Bvc2FibGUoKCkgPT4geyBhdXRvU2Nyb2xsSG9sZHMtLTsgfSk7XG5cdFx0XHR9LFxuXHRcdH0pO1xuXG5cdFx0Ly8gVGhlIHdpZGdldCBzcGFucyB0aGUgd2hvbGUgY2hhdCB2aWV3LCBpbmNsdWRpbmcgdGhlIGlucHV0IHBhcnQgYmVsb3dcblx0XHQvLyB0aGUgdHJhbnNjcmlwdDsgdGhlIG92ZXJsYXkgaXMgcG9zaXRpb25lZCByZWxhdGl2ZSB0byBpdC5cblx0XHRjb25zdCBjb250YWluZXJSZWN0OiBQYXJ0aWFsPERPTVJlY3Q+ID0geyB0b3A6IDAsIGxlZnQ6IDAsIHdpZHRoOiA2MDAsIGhlaWdodDogNjAwIH07XG5cdFx0d2lkZ2V0RG9tTm9kZS5nZXRCb3VuZGluZ0NsaWVudFJlY3QgPSAoKSA9PiBjb250YWluZXJSZWN0IGFzIERPTVJlY3Q7XG5cdFx0Ly8gVGhlIHNjcm9sbGFibGUgdHJhbnNjcmlwdCBzaXRzIGFib3ZlIHRoZSBjaGF0IGlucHV0LCBzbyBpdCBpcyBzaG9ydGVyXG5cdFx0Ly8gdGhhbiB0aGUgd2lkZ2V0OyB0aGUgb3ZlcmxheSBpcyBjb25maW5lZCB0byBpdC5cblx0XHRsZXQgdHJhbnNjcmlwdFJlY3Q6IFBhcnRpYWw8RE9NUmVjdD4gPSB7IHRvcDogMCwgbGVmdDogMCwgd2lkdGg6IDYwMCwgaGVpZ2h0OiA2MDAgfTtcblx0XHR0cmFuc2NyaXB0RG9tTm9kZS5nZXRCb3VuZGluZ0NsaWVudFJlY3QgPSAoKSA9PiB0cmFuc2NyaXB0UmVjdCBhcyBET01SZWN0O1xuXG5cdFx0Y29uc3QgdGFyZ2V0V2luZG93ID0gZG9tLmdldFdpbmRvdyh3aWRnZXREb21Ob2RlKTtcblx0XHRjb25zdCBvcmlnaW5hbEdldFNlbGVjdGlvbiA9IHRhcmdldFdpbmRvdy5nZXRTZWxlY3Rpb24uYmluZCh0YXJnZXRXaW5kb3cpO1xuXHRcdGNvbnN0IG11dGFibGVXaW5kb3cgPSB0YXJnZXRXaW5kb3cgYXMgdHlwZW9mIHRhcmdldFdpbmRvdyAmIHsgZ2V0U2VsZWN0aW9uOiAoKSA9PiBTZWxlY3Rpb24gfCBudWxsIH07XG5cdFx0bGV0IHNlbGVjdGlvblRleHQgPSAnJztcblx0XHRjb25zdCByYW5nZSA9IGRvYy5jcmVhdGVSYW5nZSgpO1xuXHRcdHJhbmdlLnNldFN0YXJ0KHRleHROb2RlLCAwKTtcblx0XHRyYW5nZS5zZXRFbmQodGV4dE5vZGUsIHRleHROb2RlLmRhdGEubGVuZ3RoKTtcblx0XHQvLyBBIHNlbGVjdGlvbiBpbiBjaGF0LXZpZXcgY2hyb21lIG91dHNpZGUgdGhlIHNjcm9sbGFibGUgdHJhbnNjcmlwdC5cblx0XHRjb25zdCBvdXRzaWRlTm9kZSA9IGRvYy5jcmVhdGVUZXh0Tm9kZSgndW5yZWxhdGVkIHRleHQnKTtcblx0XHRjb25zdCBvdXRzaWRlID0gZG9jLmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdG91dHNpZGUuYXBwZW5kQ2hpbGQob3V0c2lkZU5vZGUpO1xuXHRcdHdpZGdldERvbU5vZGUuYXBwZW5kQ2hpbGQob3V0c2lkZSk7XG5cdFx0Y29uc3Qgb3V0c2lkZVJhbmdlID0gZG9jLmNyZWF0ZVJhbmdlKCk7XG5cdFx0b3V0c2lkZVJhbmdlLnNldFN0YXJ0KG91dHNpZGVOb2RlLCAwKTtcblx0XHRvdXRzaWRlUmFuZ2Uuc2V0RW5kKG91dHNpZGVOb2RlLCBvdXRzaWRlTm9kZS5kYXRhLmxlbmd0aCk7XG5cdFx0bGV0IGFjdGl2ZVJhbmdlID0gcmFuZ2U7XG5cdFx0bXV0YWJsZVdpbmRvdy5nZXRTZWxlY3Rpb24gPSAoKSA9PiB1cGNhc3RQYXJ0aWFsPFNlbGVjdGlvbj4oe1xuXHRcdFx0dG9TdHJpbmc6ICgpID0+IHNlbGVjdGlvblRleHQsXG5cdFx0XHRpc0NvbGxhcHNlZDogc2VsZWN0aW9uVGV4dC5sZW5ndGggPT09IDAsXG5cdFx0XHRhbmNob3JOb2RlOiBhY3RpdmVSYW5nZS5zdGFydENvbnRhaW5lcixcblx0XHRcdGZvY3VzTm9kZTogYWN0aXZlUmFuZ2UuZW5kQ29udGFpbmVyLFxuXHRcdFx0cmFuZ2VDb3VudDogMSxcblx0XHRcdGdldFJhbmdlQXQ6ICgpID0+IGFjdGl2ZVJhbmdlLFxuXHRcdH0pO1xuXHRcdHN0b3JlLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4geyBtdXRhYmxlV2luZG93LmdldFNlbGVjdGlvbiA9IG9yaWdpbmFsR2V0U2VsZWN0aW9uOyB9KSk7XG5cblx0XHRjb25zdCBzZXRTZWxlY3Rpb24gPSAodGV4dDogc3RyaW5nLCBzZWxlY3Rpb25Ub3A/OiBudW1iZXIpID0+IHtcblx0XHRcdGFjdGl2ZVJhbmdlID0gcmFuZ2U7XG5cdFx0XHRzZWxlY3Rpb25UZXh0ID0gdGV4dDtcblx0XHRcdGlmIChzZWxlY3Rpb25Ub3AgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRtYXJrZG93bi5zdHlsZS50b3AgPSBgJHtzZWxlY3Rpb25Ub3B9cHhgO1xuXHRcdFx0fVxuXHRcdFx0ZG9jLmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdzZWxlY3Rpb25jaGFuZ2UnKSk7XG5cdFx0fTtcblx0XHRjb25zdCBzZXRTZWxlY3Rpb25PdXRzaWRlVHJhbnNjcmlwdCA9ICh0ZXh0OiBzdHJpbmcpID0+IHtcblx0XHRcdGFjdGl2ZVJhbmdlID0gb3V0c2lkZVJhbmdlO1xuXHRcdFx0c2VsZWN0aW9uVGV4dCA9IHRleHQ7XG5cdFx0XHRkb2MuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ3NlbGVjdGlvbmNoYW5nZScpKTtcblx0XHR9O1xuXHRcdGNvbnN0IHNldFRyYW5zY3JpcHRSZWN0ID0gKHJlY3Q6IFBhcnRpYWw8RE9NUmVjdD4pID0+IHsgdHJhbnNjcmlwdFJlY3QgPSByZWN0OyB9O1xuXHRcdC8qKlxuXHRcdCAqIE1pbWljcyB0aGUgdmlydHVhbGl6ZWQgbGlzdCByZW1vdmluZyB0aGUgc2VsZWN0ZWQgcm93OiB0aGUgbm9kZXMgZ29cblx0XHQgKiBhd2F5IGFuZCB0aGUgYnJvd3NlciBjb2xsYXBzZXMgdGhlIHNlbGVjdGlvbiB0aGF0IGxpdmVkIGluIHRoZW0uXG5cdFx0ICovXG5cdFx0Y29uc3QgZGV0YWNoU2VsZWN0ZWRSb3cgPSAoKSA9PiB7XG5cdFx0XHRtYXJrZG93bi5yZW1vdmUoKTtcblx0XHRcdHNlbGVjdGlvblRleHQgPSAnJztcblx0XHR9O1xuXHRcdGNvbnN0IHNjcm9sbCA9IChzZWxlY3Rpb25Ub3A/OiBudW1iZXIpID0+IHtcblx0XHRcdGlmIChzZWxlY3Rpb25Ub3AgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRtYXJrZG93bi5zdHlsZS50b3AgPSBgJHtzZWxlY3Rpb25Ub3B9cHhgO1xuXHRcdFx0fVxuXHRcdFx0b25EaWRTY3JvbGwuZmlyZSgpO1xuXHRcdH07XG5cdFx0Y29uc3QgaGlnaGxpZ2h0ZWRSYW5nZXMgPSAoKSA9PiB0YXJnZXRXaW5kb3cuQ1NTLmhpZ2hsaWdodHM/LmdldCgnY2hhdC1yZXNwb25zZS1zZWxlY3Rpb24nKT8uc2l6ZSA/PyAwO1xuXG5cdFx0Y29uc3Qgc2lkZUNoYXQgPSB1cGNhc3RQYXJ0aWFsPElDaGF0Pih7IHJlc291cmNlOiBVUkkucGFyc2UoJ3Rlc3Q6Ly8vY2hhdC9zaWRlJykgfSk7XG5cdFx0Y29uc3QgY2hhdCA9IHVwY2FzdFBhcnRpYWw8SUNoYXQ+KHsgcmVzb3VyY2U6IFVSSS5wYXJzZSgndGVzdDovLy9jaGF0L3NvdXJjZScpIH0pO1xuXHRcdGNvbnN0IHNlc3Npb24gPSB1cGNhc3RQYXJ0aWFsPElTZXNzaW9uPih7XG5cdFx0XHRzZXNzaW9uSWQ6ICdzZXNzaW9uJyxcblx0XHRcdHJlc291cmNlOiBVUkkucGFyc2UoJ3Rlc3Q6Ly8vc2Vzc2lvbicpLFxuXHRcdFx0c3RhdHVzOiBjb25zdE9ic2VydmFibGUoU2Vzc2lvblN0YXR1cy5Db21wbGV0ZWQpLFxuXHRcdFx0aXNBcmNoaXZlZDogY29uc3RPYnNlcnZhYmxlKGZhbHNlKSxcblx0XHRcdGNhcGFiaWxpdGllczogY29uc3RPYnNlcnZhYmxlKHsgc3VwcG9ydHNNdWx0aXBsZUNoYXRzOiB0cnVlLCBzdXBwb3J0c1NpZGVDaGF0OiB0cnVlIH0pLFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgY2FsbE9yZGVyOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGNvbnN0IG5vdGlmaWNhdGlvblNlcnZpY2UgPSBuZXcgUmVjb3JkaW5nTm90aWZpY2F0aW9uU2VydmljZSgpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UsIHVwY2FzdFBhcnRpYWw8SVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2U+KHtcblx0XHRcdGdldFNlc3Npb25Gb3JDaGF0UmVzb3VyY2U6IHJlc291cmNlID0+IHJlc291cmNlLnRvU3RyaW5nKCkgPT09IGNoYXQucmVzb3VyY2UudG9TdHJpbmcoKSA/IHsgc2Vzc2lvbiwgY2hhdCB9IDogdW5kZWZpbmVkLFxuXHRcdFx0Y3JlYXRlU2lkZUNoYXRJblNlc3Npb246IG9wdGlvbnM/LmNyZWF0ZVNpZGVDaGF0SW5TZXNzaW9uID8/IChhc3luYyAoX3Nlc3Npb24sIF9zb3VyY2VDaGF0LCB0dXJuSWQsIHNlbGVjdGlvbikgPT4ge1xuXHRcdFx0XHRjYWxsT3JkZXIucHVzaChgY3JlYXRlOiR7dHVybklkfToke3NlbGVjdGlvbj8udGV4dH1gKTtcblx0XHRcdFx0cmV0dXJuIHNpZGVDaGF0O1xuXHRcdFx0fSksXG5cdFx0XHRzZW5kUmVxdWVzdDogb3B0aW9ucz8uc2VuZFJlcXVlc3QgPz8gKGFzeW5jIChfc2Vzc2lvbiwgc2VudENoYXQsIHNlbmRPcHRpb25zKSA9PiB7XG5cdFx0XHRcdGNhbGxPcmRlci5wdXNoKGBzZW5kOiR7c2VudENoYXQucmVzb3VyY2UudG9TdHJpbmcoKX06JHtzZW5kT3B0aW9ucy5xdWVyeX1gKTtcblx0XHRcdH0pLFxuXHRcdH0pKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElTZXNzaW9uc1NlcnZpY2UsIHVwY2FzdFBhcnRpYWw8SVNlc3Npb25zU2VydmljZT4oe1xuXHRcdFx0b3BlbkNoYXQ6IGFzeW5jIChfc2Vzc2lvbiwgY2hhdFVyaSkgPT4ge1xuXHRcdFx0XHRjYWxsT3JkZXIucHVzaChgb3Blbjoke2NoYXRVcmkudG9TdHJpbmcoKX1gKTtcblx0XHRcdH0sXG5cdFx0fSkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVNlc3Npb25zUGFydFNlcnZpY2UsIHVwY2FzdFBhcnRpYWw8SVNlc3Npb25zUGFydFNlcnZpY2U+KHtcblx0XHRcdGdldFNlc3Npb25WaWV3OiAoKSA9PiB1bmRlZmluZWQsXG5cdFx0fSkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSU5vdGlmaWNhdGlvblNlcnZpY2UsIG5vdGlmaWNhdGlvblNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUxvZ1NlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblxuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUmVzcG9uc2VTZWxlY3Rpb25TaWRlQ2hhdENvbnRyb2xsZXIsIHdpZGdldCkpO1xuXHRcdGNvbnRyb2xsZXIuc2V0Q2hhdChjaGF0KTtcblxuXHRcdHJldHVybiB7IGNvbnRyb2xsZXIsIHNldFNlbGVjdGlvbiwgc2V0U2VsZWN0aW9uT3V0c2lkZVRyYW5zY3JpcHQsIHNldFRyYW5zY3JpcHRSZWN0LCBkZXRhY2hTZWxlY3RlZFJvdywgc2Nyb2xsLCBhdXRvU2Nyb2xsSG9sZHM6ICgpID0+IGF1dG9TY3JvbGxIb2xkcywgY2FsbE9yZGVyLCBkb2MsIGNoYXQsIHNpZGVDaGF0LCBmb2N1c1Jlc3BvbnNlSXRlbUNhbGxzLCBub3RpZmljYXRpb25TZXJ2aWNlLCBoaWdobGlnaHRlZFJhbmdlcywgaW5wdXRIZWlnaHQ6ICgpID0+IGlucHV0RG9tTm9kZShjb250cm9sbGVyKS5vZmZzZXRIZWlnaHQgfTtcblx0fVxuXG5cdGZ1bmN0aW9uIGlucHV0RG9tTm9kZShjb250cm9sbGVyOiBSZXNwb25zZVNlbGVjdGlvblNpZGVDaGF0Q29udHJvbGxlcik6IEhUTUxFbGVtZW50IHtcblx0XHRyZXR1cm4gKGNvbnRyb2xsZXIgYXMgdW5rbm93biBhcyB7IF9pbnB1dDogeyBkb21Ob2RlOiBIVE1MRWxlbWVudCB9IH0pLl9pbnB1dC5kb21Ob2RlO1xuXHR9XG5cblx0ZnVuY3Rpb24gaW5wdXRUZXh0QXJlYShjb250cm9sbGVyOiBSZXNwb25zZVNlbGVjdGlvblNpZGVDaGF0Q29udHJvbGxlcik6IEhUTUxUZXh0QXJlYUVsZW1lbnQge1xuXHRcdHJldHVybiAoY29udHJvbGxlciBhcyB1bmtub3duIGFzIHsgX2lucHV0OiB7IGlucHV0RWxlbWVudDogSFRNTFRleHRBcmVhRWxlbWVudCB9IH0pLl9pbnB1dC5pbnB1dEVsZW1lbnQ7XG5cdH1cblxuXHRmdW5jdGlvbiBpc0lucHV0QnVzeShjb250cm9sbGVyOiBSZXNwb25zZVNlbGVjdGlvblNpZGVDaGF0Q29udHJvbGxlcik6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAoY29udHJvbGxlciBhcyB1bmtub3duIGFzIHsgX2lucHV0OiB7IGlzQnVzeTogYm9vbGVhbiB9IH0pLl9pbnB1dC5pc0J1c3k7XG5cdH1cblxuXHRmdW5jdGlvbiBzdWJtaXRWaWFDbGljayhjb250cm9sbGVyOiBSZXNwb25zZVNlbGVjdGlvblNpZGVDaGF0Q29udHJvbGxlciwgcXVlcnk6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IHRleHRBcmVhID0gaW5wdXRUZXh0QXJlYShjb250cm9sbGVyKTtcblx0XHR0ZXh0QXJlYS52YWx1ZSA9IHF1ZXJ5O1xuXHRcdHRleHRBcmVhLmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdpbnB1dCcsIHsgYnViYmxlczogdHJ1ZSB9KSk7XG5cdFx0aW5wdXREb21Ob2RlKGNvbnRyb2xsZXIpLnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KCcuYWN0aW9uLWxhYmVsJykhLmNsaWNrKCk7XG5cdH1cblxuXHRmdW5jdGlvbiBkaXNwYXRjaEtleSh0YXJnZXQ6IEhUTUxFbGVtZW50LCBrZXk6IHN0cmluZywgb3B0aW9ucz86IHsgc2hpZnRLZXk/OiBib29sZWFuOyBpc0NvbXBvc2luZz86IGJvb2xlYW4gfSk6IEtleWJvYXJkRXZlbnQge1xuXHRcdGNvbnN0IGV2ZW50ID0gbmV3IEtleWJvYXJkRXZlbnQoJ2tleWRvd24nLCB7IGtleSwgc2hpZnRLZXk6IG9wdGlvbnM/LnNoaWZ0S2V5LCBidWJibGVzOiB0cnVlLCBjYW5jZWxhYmxlOiB0cnVlIH0pO1xuXHRcdE9iamVjdC5kZWZpbmVQcm9wZXJ0eShldmVudCwgJ2tleUNvZGUnLCB7IGdldDogKCkgPT4ga2V5ID09PSAnRXNjYXBlJyA/IDI3IDogMTMgfSk7XG5cdFx0aWYgKG9wdGlvbnM/LmlzQ29tcG9zaW5nKSB7XG5cdFx0XHRPYmplY3QuZGVmaW5lUHJvcGVydHkoZXZlbnQsICdpc0NvbXBvc2luZycsIHsgZ2V0OiAoKSA9PiB0cnVlIH0pO1xuXHRcdH1cblx0XHR0YXJnZXQuZGlzcGF0Y2hFdmVudChldmVudCk7XG5cdFx0cmV0dXJuIGV2ZW50O1xuXHR9XG5cblx0dGVzdCgnc2hvd3MgdGhlIGFzay1xdWVzdGlvbiBpbnB1dCBmb3IgYSB2YWxpZCBtYXJrZG93biBzZWxlY3Rpb24nLCAoKSA9PiB7XG5cdFx0Y29uc3QgeyBjb250cm9sbGVyLCBzZXRTZWxlY3Rpb24gfSA9IHNldHVwKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlucHV0RG9tTm9kZShjb250cm9sbGVyKS5zdHlsZS5kaXNwbGF5LCAnbm9uZScpO1xuXG5cdFx0c2V0U2VsZWN0aW9uKCdoZWxsbyB3b3JsZCcpO1xuXHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbChpbnB1dERvbU5vZGUoY29udHJvbGxlcikuc3R5bGUuZGlzcGxheSwgJ25vbmUnKTtcblx0fSk7XG5cblx0dGVzdCgnaGlkZXMgdGhlIGlucHV0IGFnYWluIG9uY2UgdGhlIHNlbGVjdGlvbiBpcyBjbGVhcmVkJywgKCkgPT4ge1xuXHRcdGNvbnN0IHsgY29udHJvbGxlciwgc2V0U2VsZWN0aW9uIH0gPSBzZXR1cCgpO1xuXHRcdHNldFNlbGVjdGlvbignaGVsbG8gd29ybGQnKTtcblx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwoaW5wdXREb21Ob2RlKGNvbnRyb2xsZXIpLnN0eWxlLmRpc3BsYXksICdub25lJyk7XG5cblx0XHRzZXRTZWxlY3Rpb24oJycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbnB1dERvbU5vZGUoY29udHJvbGxlcikuc3R5bGUuZGlzcGxheSwgJ25vbmUnKTtcblx0fSk7XG5cblx0dGVzdCgnY3JlYXRlcywgb3BlbnMsIGFuZCBzZW5kcyBhIHNpZGUgY2hhdCBhbmNob3JlZCB0byB0aGUgcmVzcG9uc2Ugb24gc3VibWl0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgY29udHJvbGxlciwgc2V0U2VsZWN0aW9uLCBjYWxsT3JkZXIsIHNpZGVDaGF0IH0gPSBzZXR1cCgpO1xuXHRcdHNldFNlbGVjdGlvbignaGVsbG8gd29ybGQnKTtcblxuXHRcdGNvbnN0IHRleHRBcmVhID0gaW5wdXRUZXh0QXJlYShjb250cm9sbGVyKTtcblx0XHR0ZXh0QXJlYS52YWx1ZSA9ICd3aGF0IGRvZXMgdGhpcyBtZWFuPyc7XG5cdFx0dGV4dEFyZWEuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2lucHV0JywgeyBidWJibGVzOiB0cnVlIH0pKTtcblx0XHRpbnB1dERvbU5vZGUoY29udHJvbGxlcikucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oJy5hY3Rpb24tbGFiZWwnKSEuY2xpY2soKTtcblxuXHRcdGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCAwKSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNhbGxPcmRlciwgW1xuXHRcdFx0J2NyZWF0ZTp0dXJuLTE6aGVsbG8gd29ybGQnLFxuXHRcdFx0YG9wZW46JHtzaWRlQ2hhdC5yZXNvdXJjZS50b1N0cmluZygpfWAsXG5cdFx0XHRgc2VuZDoke3NpZGVDaGF0LnJlc291cmNlLnRvU3RyaW5nKCl9OndoYXQgZG9lcyB0aGlzIG1lYW4/YCxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnc3RheXMgdmlzaWJsZSBhbmQga2VlcHMgdGhlIGNhcHR1cmVkIHNlbGVjdGlvbiB3aGVuIHRoZSBpbnB1dCBzdGVhbHMgZm9jdXMgYW5kIGNvbGxhcHNlcyB0aGUgbmF0aXZlIHNlbGVjdGlvbicsICgpID0+IHtcblx0XHRjb25zdCB7IGNvbnRyb2xsZXIsIHNldFNlbGVjdGlvbiwgY2FsbE9yZGVyIH0gPSBzZXR1cCgpO1xuXHRcdHNldFNlbGVjdGlvbignaGVsbG8gd29ybGQnKTtcblx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwoaW5wdXREb21Ob2RlKGNvbnRyb2xsZXIpLnN0eWxlLmRpc3BsYXksICdub25lJyk7XG5cblx0XHRjb25zdCB0ZXh0QXJlYSA9IGlucHV0VGV4dEFyZWEoY29udHJvbGxlcik7XG5cdFx0dGV4dEFyZWEuZm9jdXMoKTtcblx0XHQvLyBGb2N1c2luZyB0aGUgdGV4dGFyZWEgY29sbGFwc2VzIHRoZSBkb2N1bWVudCBTZWxlY3Rpb24gYXMgYSBicm93c2VyXG5cdFx0Ly8gc2lkZSBlZmZlY3Q7IHRoaXMgbXVzdCBub3QgZGlzbWlzcyB0aGUgd2lkZ2V0LlxuXHRcdHNldFNlbGVjdGlvbignJyk7XG5cdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKGlucHV0RG9tTm9kZShjb250cm9sbGVyKS5zdHlsZS5kaXNwbGF5LCAnbm9uZScsICdpbnB1dCBtdXN0IHN0YXkgdmlzaWJsZSB3aGlsZSBmb2N1c2VkJyk7XG5cblx0XHQvLyBUaGUgb3JpZ2luYWxseS1jYXB0dXJlZCBzZWxlY3Rpb24gbXVzdCBzdGlsbCBiZSB1c2VkIG9uIHN1Ym1pdCwgbm90XG5cdFx0Ly8gdGhlIG5vdy1lbXB0eSBuYXRpdmUgc2VsZWN0aW9uLlxuXHRcdHRleHRBcmVhLnZhbHVlID0gJ3doYXQgZG9lcyB0aGlzIG1lYW4/Jztcblx0XHR0ZXh0QXJlYS5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnaW5wdXQnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xuXHRcdGlucHV0RG9tTm9kZShjb250cm9sbGVyKS5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PignLmFjdGlvbi1sYWJlbCcpIS5jbGljaygpO1xuXHRcdGFzc2VydC5vayhjYWxsT3JkZXJbMF0/LnN0YXJ0c1dpdGgoJ2NyZWF0ZTp0dXJuLTE6aGVsbG8gd29ybGQnKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Rpc21pc3NlcyBvbmNlIGZvY3VzIGdlbnVpbmVseSBsZWF2ZXMgdGhlIGlucHV0IGFuZCB0aGUgc2VsZWN0aW9uIGlzIGludmFsaWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgeyBjb250cm9sbGVyLCBzZXRTZWxlY3Rpb24gfSA9IHNldHVwKCk7XG5cdFx0c2V0U2VsZWN0aW9uKCdoZWxsbyB3b3JsZCcpO1xuXG5cdFx0Y29uc3QgdGV4dEFyZWEgPSBpbnB1dFRleHRBcmVhKGNvbnRyb2xsZXIpO1xuXHRcdHRleHRBcmVhLmZvY3VzKCk7XG5cdFx0c2V0U2VsZWN0aW9uKCcnKTtcblx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwoaW5wdXREb21Ob2RlKGNvbnRyb2xsZXIpLnN0eWxlLmRpc3BsYXksICdub25lJyk7XG5cblx0XHR0ZXh0QXJlYS5ibHVyKCk7XG5cdFx0c2V0U2VsZWN0aW9uKCcnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW5wdXREb21Ob2RlKGNvbnRyb2xsZXIpLnN0eWxlLmRpc3BsYXksICdub25lJywgJ2lucHV0IG11c3QgZGlzbWlzcyBvbmNlIGZvY3VzIHRydWx5IGxlYXZlcyBpdCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXN0b3JlcyBmb2N1cyB0byB0aGUgcmVzcG9uc2UgaXRlbSB3aGVuIEVzY2FwZSBkaXNtaXNzZXMgdGhlIGZvY3VzZWQgaW5wdXQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgeyBjb250cm9sbGVyLCBzZXRTZWxlY3Rpb24sIGZvY3VzUmVzcG9uc2VJdGVtQ2FsbHMgfSA9IHNldHVwKCk7XG5cdFx0c2V0U2VsZWN0aW9uKCdoZWxsbyB3b3JsZCcpO1xuXG5cdFx0Y29uc3QgdGV4dEFyZWEgPSBpbnB1dFRleHRBcmVhKGNvbnRyb2xsZXIpO1xuXHRcdHRleHRBcmVhLmZvY3VzKCk7XG5cdFx0ZGlzcGF0Y2hLZXkodGV4dEFyZWEsICdFc2NhcGUnKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbnB1dERvbU5vZGUoY29udHJvbGxlcikuc3R5bGUuZGlzcGxheSwgJ25vbmUnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGZvY3VzUmVzcG9uc2VJdGVtQ2FsbHMsIFt0cnVlXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90IHJlc3RvcmUgZm9jdXMgb24gZGlzbWlzcyB3aGVuIHRoZSBpbnB1dCB3YXMgbm90IGZvY3VzZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgeyBzZXRTZWxlY3Rpb24sIGZvY3VzUmVzcG9uc2VJdGVtQ2FsbHMgfSA9IHNldHVwKCk7XG5cdFx0c2V0U2VsZWN0aW9uKCdoZWxsbyB3b3JsZCcpO1xuXHRcdHNldFNlbGVjdGlvbignJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGZvY3VzUmVzcG9uc2VJdGVtQ2FsbHMsIFtdKTtcblx0fSk7XG5cblx0dGVzdCgnY2xhbXBzIHRoZSBvdmVybGF5IHZlcnRpY2FsbHkgd2hlbiB0aGUgdHJhbnNjcmlwdCBpcyBzaG9ydGVyIHRoYW4gdGhlIG92ZXJsYXknLCAoKSA9PiB7XG5cdFx0Y29uc3QgeyBjb250cm9sbGVyLCBzZXRTZWxlY3Rpb24sIHNldFRyYW5zY3JpcHRSZWN0IH0gPSBzZXR1cCgpO1xuXHRcdC8vIEEgdHJhbnNjcmlwdCBmYXIgc2hvcnRlciB0aGFuIGFueSByZWFsaXN0aWMgb3ZlcmxheSBoZWlnaHQgZm9yY2VzIHRoZVxuXHRcdC8vIHZlcnRpY2FsIGNsYW1wIHRvIGZsb29yIHRoZSBvdmVybGF5IGF0IHRoZSB0b3AuXG5cdFx0c2V0VHJhbnNjcmlwdFJlY3QoeyB0b3A6IDAsIGxlZnQ6IDAsIHdpZHRoOiA2MDAsIGhlaWdodDogMjAgfSk7XG5cdFx0c2V0U2VsZWN0aW9uKCdoZWxsbyB3b3JsZCcsIDEwKTtcblxuXHRcdGNvbnN0IHN0eWxlID0gaW5wdXREb21Ob2RlKGNvbnRyb2xsZXIpLnN0eWxlO1xuXHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbChzdHlsZS5kaXNwbGF5LCAnbm9uZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZUZsb2F0KHN0eWxlLnRvcCksIDApO1xuXHR9KTtcblxuXHR0ZXN0KCdkaXNtaXNzZXMgYW5kIHJlbGVhc2VzIHRoZSBob2xkIHdoZW4gdmlydHVhbGl6YXRpb24gZGV0YWNoZXMgdGhlIHNlbGVjdGVkIHJvdycsICgpID0+IHtcblx0XHRjb25zdCB7IGNvbnRyb2xsZXIsIHNldFNlbGVjdGlvbiwgc2Nyb2xsLCBhdXRvU2Nyb2xsSG9sZHMsIGRldGFjaFNlbGVjdGVkUm93IH0gPSBzZXR1cCgpO1xuXHRcdHNldFNlbGVjdGlvbignaGVsbG8gd29ybGQnLCAxMDApO1xuXHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbChpbnB1dERvbU5vZGUoY29udHJvbGxlcikuc3R5bGUuZGlzcGxheSwgJ25vbmUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXV0b1Njcm9sbEhvbGRzKCksIDEpO1xuXG5cdFx0Ly8gU2Nyb2xsaW5nIGZhciBlbm91Z2ggcmVtb3ZlcyB0aGUgcm93IGZyb20gdGhlIERPTTsgdGhlIGNhcHR1cmVkIHJhbmdlXG5cdFx0Ly8gbm93IGFuY2hvcnMgdG8gbm9kZXMgdGhhdCB3aWxsIG5ldmVyIGNvbWUgYmFjay5cblx0XHRkZXRhY2hTZWxlY3RlZFJvdygpO1xuXHRcdHNjcm9sbCgpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlucHV0RG9tTm9kZShjb250cm9sbGVyKS5zdHlsZS5kaXNwbGF5LCAnbm9uZScsICdtdXN0IG5vdCBwb2ludCBhdCBub3RoaW5nJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF1dG9TY3JvbGxIb2xkcygpLCAwLCAndGhlIHRyYW5zY3JpcHQgbXVzdCBub3Qgc3RheSBwaW5uZWQgZm9yZXZlcicpO1xuXHR9KTtcblxuXHR0ZXN0KCdmb2xsb3dzIHRoZSBzZWxlY3Rpb24gYXMgdGhlIHRyYW5zY3JpcHQgc2Nyb2xscyBpbnN0ZWFkIG9mIHN0YXlpbmcgcGlubmVkJywgKCkgPT4ge1xuXHRcdGNvbnN0IHsgY29udHJvbGxlciwgc2V0U2VsZWN0aW9uLCBzY3JvbGwgfSA9IHNldHVwKCk7XG5cdFx0c2V0U2VsZWN0aW9uKCdoZWxsbyB3b3JsZCcsIDEwMCk7XG5cdFx0Y29uc3Qgc3R5bGUgPSBpbnB1dERvbU5vZGUoY29udHJvbGxlcikuc3R5bGU7XG5cdFx0Y29uc3QgaW5pdGlhbFRvcCA9IHBhcnNlRmxvYXQoc3R5bGUudG9wKTtcblxuXHRcdC8vIFRoZSB0cmFuc2NyaXB0IHNjcm9sbHMgdGhlIGFuY2hvciB1cCBieSA0MHB4OyB0aGUgb3ZlcmxheSBtdXN0IG1vdmUgd2l0aCBpdC5cblx0XHRzY3JvbGwoNjApO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlRmxvYXQoc3R5bGUudG9wKSwgaW5pdGlhbFRvcCAtIDQwKTtcblx0fSk7XG5cblx0dGVzdCgnY29uZmluZXMgdGhlIG92ZXJsYXkgdG8gdGhlIHRyYW5zY3JpcHQgZXZlbiB3aGVuIHRoZSB3aWRnZXQgZXh0ZW5kcyBwYXN0IGl0JywgKCkgPT4ge1xuXHRcdC8vIFRoZSByZXBvcnRlZCBidWc6IHRoZSBvdmVybGF5IHdhcyBjbGFtcGVkIHRvIHRoZSB3aG9sZSBjaGF0IHdpZGdldCwgc29cblx0XHQvLyBpdCBjb3VsZCBmbG9hdCBhbGwgdGhlIHdheSBkb3duIG92ZXIgdGhlIGlucHV0IGF0IHRoZSBib3R0b20gb2YgdGhlXG5cdFx0Ly8gd2luZG93IGluc3RlYWQgb2Ygc3RvcHBpbmcgYXQgdGhlIGVuZCBvZiB0aGUgc2Nyb2xsYWJsZSBtZXNzYWdlIGFyZWEuXG5cdFx0Y29uc3QgeyBjb250cm9sbGVyLCBzZXRTZWxlY3Rpb24sIHNjcm9sbCwgc2V0VHJhbnNjcmlwdFJlY3QsIGlucHV0SGVpZ2h0IH0gPSBzZXR1cCgpO1xuXHRcdHNldFRyYW5zY3JpcHRSZWN0KHsgdG9wOiAwLCBsZWZ0OiAwLCB3aWR0aDogNjAwLCBoZWlnaHQ6IDMwMCB9KTtcblx0XHRzZXRTZWxlY3Rpb24oJ2hlbGxvIHdvcmxkJywgNTApO1xuXG5cdFx0c2Nyb2xsKDUwMDApO1xuXG5cdFx0Y29uc3QgdG9wID0gcGFyc2VGbG9hdChpbnB1dERvbU5vZGUoY29udHJvbGxlcikuc3R5bGUudG9wKTtcblx0XHRhc3NlcnQub2sodG9wIDw9IDMwMCAtIGlucHV0SGVpZ2h0KCksIGB0b3AgJHt0b3B9IG11c3Qgc3RheSB3aXRoaW4gdGhlIDMwMHB4IHRyYW5zY3JpcHQsIG5vdCB0aGUgNjAwcHggd2lkZ2V0YCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3BhcmtzIGF0IHRoZSB0b3Agb2YgdGhlIHRyYW5zY3JpcHQgd2hlbiB0aGUgc2VsZWN0aW9uIHNjcm9sbHMgYWJvdmUgaXQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgeyBjb250cm9sbGVyLCBzZXRTZWxlY3Rpb24sIHNjcm9sbCwgc2V0VHJhbnNjcmlwdFJlY3QsIGlucHV0SGVpZ2h0IH0gPSBzZXR1cCgpO1xuXHRcdC8vIFRoZSB0cmFuc2NyaXB0IHN0YXJ0cyAxMDBweCBiZWxvdyB0aGUgd2lkZ2V0J3MgdG9wIGVkZ2UgKGJhbm5lcnMsIGV0YykuXG5cdFx0c2V0VHJhbnNjcmlwdFJlY3QoeyB0b3A6IDEwMCwgbGVmdDogMCwgd2lkdGg6IDYwMCwgaGVpZ2h0OiAzMDAgfSk7XG5cdFx0c2V0U2VsZWN0aW9uKCdoZWxsbyB3b3JsZCcsIDIwMCk7XG5cdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKGlucHV0RG9tTm9kZShjb250cm9sbGVyKS5zdHlsZS5kaXNwbGF5LCAnbm9uZScpO1xuXG5cdFx0Ly8gU2Nyb2xsIHRoZSBzZWxlY3Rpb24gZmFyIGFib3ZlIHRoZSB0cmFuc2NyaXB0J3MgdG9wIGVkZ2UuXG5cdFx0c2Nyb2xsKC04MDApO1xuXG5cdFx0Y29uc3Qgc3R5bGUgPSBpbnB1dERvbU5vZGUoY29udHJvbGxlcikuc3R5bGU7XG5cdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKHN0eWxlLmRpc3BsYXksICdub25lJywgJ3RoZSBvdmVybGF5IHN0YXlzIHZpc2libGUgYXQgdGhlIGVkZ2UnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VGbG9hdChzdHlsZS50b3ApLCAxMDAsICdwYXJrcyBhdCB0aGUgdHJhbnNjcmlwdCB0b3AsIG5vdCB0aGUgd2lkZ2V0IHRvcCcpO1xuXHRcdGFzc2VydC5vayhpbnB1dEhlaWdodCgpID4gMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3BhcmtzIGF0IHRoZSBib3R0b20gb2YgdGhlIHRyYW5zY3JpcHQgaW5zdGVhZCBvZiBkcmlmdGluZyBvdmVyIHRoZSBjaGF0IGlucHV0JywgKCkgPT4ge1xuXHRcdGNvbnN0IHsgY29udHJvbGxlciwgc2V0U2VsZWN0aW9uLCBzY3JvbGwsIHNldFRyYW5zY3JpcHRSZWN0LCBpbnB1dEhlaWdodCB9ID0gc2V0dXAoKTtcblx0XHQvLyBUaGUgd2lkZ2V0IGlzIDYwMCB0YWxsIGJ1dCB0aGUgdHJhbnNjcmlwdCBvbmx5IG9jY3VwaWVzIHRoZSB0b3AgMzAwO1xuXHRcdC8vIHRoZSByZW1haW5pbmcgMzAwIGlzIHRoZSBjaGF0IGlucHV0LCB3aGljaCB0aGUgb3ZlcmxheSBtdXN0IG5vdCBlbnRlci5cblx0XHRzZXRUcmFuc2NyaXB0UmVjdCh7IHRvcDogMCwgbGVmdDogMCwgd2lkdGg6IDYwMCwgaGVpZ2h0OiAzMDAgfSk7XG5cdFx0c2V0U2VsZWN0aW9uKCdoZWxsbyB3b3JsZCcsIDUwKTtcblxuXHRcdC8vIFNjcm9sbCB0aGUgc2VsZWN0aW9uIGZhciBiZWxvdyB0aGUgdHJhbnNjcmlwdCdzIGJvdHRvbSBlZGdlLlxuXHRcdHNjcm9sbCg5MDApO1xuXG5cdFx0Y29uc3QgdG9wID0gcGFyc2VGbG9hdChpbnB1dERvbU5vZGUoY29udHJvbGxlcikuc3R5bGUudG9wKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodG9wLCAzMDAgLSBpbnB1dEhlaWdodCgpLCAncGFya3MgZmx1c2ggd2l0aCB0aGUgdHJhbnNjcmlwdCBib3R0b20nKTtcblx0fSk7XG5cblx0dGVzdCgnY2xhbXBzIGhvcml6b250YWxseSB0byB0aGUgdHJhbnNjcmlwdCBib3VuZHMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgeyBjb250cm9sbGVyLCBzZXRTZWxlY3Rpb24sIHNldFRyYW5zY3JpcHRSZWN0IH0gPSBzZXR1cCgpO1xuXHRcdHNldFRyYW5zY3JpcHRSZWN0KHsgdG9wOiAwLCBsZWZ0OiA0MCwgd2lkdGg6IDEyMCwgaGVpZ2h0OiAzMDAgfSk7XG5cdFx0c2V0U2VsZWN0aW9uKCdoZWxsbyB3b3JsZCcpO1xuXG5cdFx0Y29uc3QgbGVmdCA9IHBhcnNlRmxvYXQoaW5wdXREb21Ob2RlKGNvbnRyb2xsZXIpLnN0eWxlLmxlZnQpO1xuXHRcdGFzc2VydC5vayhsZWZ0ID49IDQwLCBgbGVmdCAke2xlZnR9IG11c3Qgbm90IHN0YXJ0IGJlZm9yZSB0aGUgdHJhbnNjcmlwdCdzIGxlZnQgZWRnZWApO1xuXHRcdGFzc2VydC5vayhsZWZ0IDw9IDE2MCwgYGxlZnQgJHtsZWZ0fSBtdXN0IG5vdCBzdGFydCBwYXN0IHRoZSB0cmFuc2NyaXB0J3MgcmlnaHQgZWRnZWApO1xuXHR9KTtcblxuXHR0ZXN0KCdob2xkcyB0cmFuc2NyaXB0IGF1dG8tc2Nyb2xsIHdoaWxlIGEgc2VsZWN0aW9uIGlzIGFjdGl2ZSBhbmQgcmVsZWFzZXMgaXQgb24gZGlzbWlzcycsICgpID0+IHtcblx0XHRjb25zdCB7IHNldFNlbGVjdGlvbiwgYXV0b1Njcm9sbEhvbGRzIH0gPSBzZXR1cCgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhdXRvU2Nyb2xsSG9sZHMoKSwgMCk7XG5cblx0XHRzZXRTZWxlY3Rpb24oJ2hlbGxvIHdvcmxkJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF1dG9TY3JvbGxIb2xkcygpLCAxLCAnYSBzZWxlY3Rpb24gbXVzdCBwaW4gdGhlIHRyYW5zY3JpcHQnKTtcblxuXHRcdHNldFNlbGVjdGlvbignJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF1dG9TY3JvbGxIb2xkcygpLCAwLCAnY2xlYXJpbmcgdGhlIHNlbGVjdGlvbiByZWxlYXNlcyB0aGUgdHJhbnNjcmlwdCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCBob2xkIGF1dG8tc2Nyb2xsIGZvciBhIHNlbGVjdGlvbiBvdXRzaWRlIHRoZSB0cmFuc2NyaXB0JywgKCkgPT4ge1xuXHRcdC8vIFRleHQgc2VsZWN0ZWQgaW4gYSBiYW5uZXIgb3IgdGhlIGlucHV0IGFyZWEgc2F5cyBub3RoaW5nIGFib3V0IHdhbnRpbmdcblx0XHQvLyB0aGUgdHJhbnNjcmlwdCB0byBob2xkIHN0aWxsLlxuXHRcdGNvbnN0IHsgc2V0U2VsZWN0aW9uT3V0c2lkZVRyYW5zY3JpcHQsIGF1dG9TY3JvbGxIb2xkcyB9ID0gc2V0dXAoeyBnZXRFbGVtZW50RnJvbU5vZGU6ICgpID0+IHVuZGVmaW5lZCB9KTtcblx0XHRzZXRTZWxlY3Rpb25PdXRzaWRlVHJhbnNjcmlwdCgndW5yZWxhdGVkIHRleHQnKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhdXRvU2Nyb2xsSG9sZHMoKSwgMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2hvbGRzIGF1dG8tc2Nyb2xsIGZvciBhIHRyYW5zY3JpcHQgc2VsZWN0aW9uIHRoYXQgZG9lcyBub3QgcmVzb2x2ZSB0byBhIHNpbmdsZSByZXNwb25zZScsICgpID0+IHtcblx0XHQvLyBTZWxlY3Rpb25zIHNwYW5uaW5nIHJlc3BvbnNlcyAob3Igbm9uLW1hcmtkb3duIGNvbnRlbnQpIG5ldmVyIG9wZW4gdGhlXG5cdFx0Ly8gYWZmb3JkYW5jZSwgYnV0IGF1dG8tc2Nyb2xsaW5nIG91dCBmcm9tIHVuZGVyIGFuIGluLXByb2dyZXNzIGRyYWcgaXNcblx0XHQvLyBqdXN0IGFzIGRpc3J1cHRpdmUsIHNvIHRoZSB0cmFuc2NyaXB0IGlzIHN0aWxsIHBpbm5lZC5cblx0XHRjb25zdCB7IGNvbnRyb2xsZXIsIHNldFNlbGVjdGlvbiwgYXV0b1Njcm9sbEhvbGRzIH0gPSBzZXR1cCh7IGdldEVsZW1lbnRGcm9tTm9kZTogKCkgPT4gdW5kZWZpbmVkIH0pO1xuXHRcdHNldFNlbGVjdGlvbignaGVsbG8gd29ybGQnKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbnB1dERvbU5vZGUoY29udHJvbGxlcikuc3R5bGUuZGlzcGxheSwgJ25vbmUnLCAnbm8gYWZmb3JkYW5jZSBmb3IgYW4gdW5yZXNvbHZhYmxlIHNlbGVjdGlvbicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhdXRvU2Nyb2xsSG9sZHMoKSwgMSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2tlZXBzIGhvbGRpbmcgYXV0by1zY3JvbGwgd2hpbGUgdGhlIGlucHV0IGhhcyBmb2N1cyBhbmQgdGhlIG5hdGl2ZSBzZWxlY3Rpb24gaXMgY29sbGFwc2VkJywgKCkgPT4ge1xuXHRcdGNvbnN0IHsgY29udHJvbGxlciwgc2V0U2VsZWN0aW9uLCBhdXRvU2Nyb2xsSG9sZHMgfSA9IHNldHVwKCk7XG5cdFx0c2V0U2VsZWN0aW9uKCdoZWxsbyB3b3JsZCcpO1xuXHRcdGlucHV0VGV4dEFyZWEoY29udHJvbGxlcikuZm9jdXMoKTtcblx0XHQvLyBGb2N1c2luZyB0aGUgdGV4dGFyZWEgY29sbGFwc2VzIHRoZSBuYXRpdmUgc2VsZWN0aW9uIGFzIGEgYnJvd3NlciBzaWRlXG5cdFx0Ly8gZWZmZWN0OyB0aGUgY2FwdHVyZWQgc2VsZWN0aW9uIGlzIHN0aWxsIGxpdmUsIHNvIHRoZSBob2xkIG11c3QgcGVyc2lzdC5cblx0XHRzZXRTZWxlY3Rpb24oJycpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF1dG9TY3JvbGxIb2xkcygpLCAxKTtcblx0fSk7XG5cblx0dGVzdCgncmVsZWFzZXMgdGhlIGF1dG8tc2Nyb2xsIGhvbGQgd2hlbiBkaXNwb3NlZCcsICgpID0+IHtcblx0XHRjb25zdCB7IGNvbnRyb2xsZXIsIHNldFNlbGVjdGlvbiwgYXV0b1Njcm9sbEhvbGRzIH0gPSBzZXR1cCgpO1xuXHRcdHNldFNlbGVjdGlvbignaGVsbG8gd29ybGQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXV0b1Njcm9sbEhvbGRzKCksIDEpO1xuXG5cdFx0Y29udHJvbGxlci5kaXNwb3NlKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF1dG9TY3JvbGxIb2xkcygpLCAwKTtcblx0fSk7XG5cblx0dGVzdCgncGFpbnRzIHRoZSBjYXB0dXJlZCBzZWxlY3Rpb24gd2l0aCBhIGN1c3RvbSBoaWdobGlnaHQgb25jZSB0aGUgbmF0aXZlIHNlbGVjdGlvbiBpcyBnb25lJywgKCkgPT4ge1xuXHRcdGNvbnN0IHsgY29udHJvbGxlciwgc2V0U2VsZWN0aW9uLCBoaWdobGlnaHRlZFJhbmdlcyB9ID0gc2V0dXAoKTtcblx0XHRzZXRTZWxlY3Rpb24oJ2hlbGxvIHdvcmxkJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhpZ2hsaWdodGVkUmFuZ2VzKCksIDAsICd0aGUgYnJvd3NlciBzdGlsbCBwYWludHMgdGhlIGxpdmUgbmF0aXZlIHNlbGVjdGlvbicpO1xuXG5cdFx0Ly8gRm9jdXNpbmcgdGhlIHRleHRhcmVhIGNvbGxhcHNlcyB0aGUgbmF0aXZlIHNlbGVjdGlvbjsgdGhlIGhpZ2hsaWdodFxuXHRcdC8vIHRha2VzIG92ZXIgc28gdGhlIHVzZXIgY2FuIHN0aWxsIHNlZSB3aGF0IHRoZXkgc2VsZWN0ZWQuXG5cdFx0aW5wdXRUZXh0QXJlYShjb250cm9sbGVyKS5mb2N1cygpO1xuXHRcdHNldFNlbGVjdGlvbignJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhpZ2hsaWdodGVkUmFuZ2VzKCksIDEpO1xuXG5cdFx0aW5wdXRUZXh0QXJlYShjb250cm9sbGVyKS5ibHVyKCk7XG5cdFx0c2V0U2VsZWN0aW9uKCcnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW5wdXREb21Ob2RlKGNvbnRyb2xsZXIpLnN0eWxlLmRpc3BsYXksICdub25lJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhpZ2hsaWdodGVkUmFuZ2VzKCksIDAsICdkaXNtaXNzaW5nIG11c3QgY2xlYXIgdGhlIGhpZ2hsaWdodCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdjbGVhcnMgdGhlIGhpZ2hsaWdodCB3aGVuIHRoZSBjb250cm9sbGVyIGlzIGRpc3Bvc2VkJywgKCkgPT4ge1xuXHRcdGNvbnN0IHsgY29udHJvbGxlciwgc2V0U2VsZWN0aW9uLCBoaWdobGlnaHRlZFJhbmdlcyB9ID0gc2V0dXAoKTtcblx0XHRzZXRTZWxlY3Rpb24oJ2hlbGxvIHdvcmxkJyk7XG5cdFx0aW5wdXRUZXh0QXJlYShjb250cm9sbGVyKS5mb2N1cygpO1xuXHRcdHNldFNlbGVjdGlvbignJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhpZ2hsaWdodGVkUmFuZ2VzKCksIDEpO1xuXG5cdFx0Y29udHJvbGxlci5kaXNwb3NlKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhpZ2hsaWdodGVkUmFuZ2VzKCksIDApO1xuXHR9KTtcblxuXHR0ZXN0KCdzdGF5cyB2aXNpYmxlIHdpdGggYSBidXN5IHN0YXRlIHdoaWxlIHRoZSByZXF1ZXN0IGlzIHBlbmRpbmcsIHRoZW4gY2xlYXJzIG9uY2UgaXQgc2V0dGxlcycsIGFzeW5jICgpID0+IHtcblx0XHRsZXQgcmVzb2x2ZUNyZWF0ZSE6IChjaGF0OiBJQ2hhdCkgPT4gdm9pZDtcblx0XHRjb25zdCBwZW5kaW5nID0gbmV3IFByb21pc2U8SUNoYXQ+KHJlc29sdmUgPT4geyByZXNvbHZlQ3JlYXRlID0gcmVzb2x2ZTsgfSk7XG5cdFx0Y29uc3QgeyBjb250cm9sbGVyLCBzZXRTZWxlY3Rpb24sIGNhbGxPcmRlciwgc2lkZUNoYXQgfSA9IHNldHVwKHtcblx0XHRcdGNyZWF0ZVNpZGVDaGF0SW5TZXNzaW9uOiBhc3luYyAoX3Nlc3Npb24sIF9zb3VyY2VDaGF0LCB0dXJuSWQsIHNlbGVjdGlvbikgPT4ge1xuXHRcdFx0XHRjYWxsT3JkZXIucHVzaChgY3JlYXRlOiR7dHVybklkfToke3NlbGVjdGlvbj8udGV4dH1gKTtcblx0XHRcdFx0cmV0dXJuIHBlbmRpbmc7XG5cdFx0XHR9LFxuXHRcdH0pO1xuXHRcdHNldFNlbGVjdGlvbignaGVsbG8gd29ybGQnKTtcblx0XHRzdWJtaXRWaWFDbGljayhjb250cm9sbGVyLCAnd2hhdCBkb2VzIHRoaXMgbWVhbj8nKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0lucHV0QnVzeShjb250cm9sbGVyKSwgdHJ1ZSwgJ2lucHV0IG11c3QgcmVwb3J0IGJ1c3kgd2hpbGUgdGhlIHJlcXVlc3QgaXMgcGVuZGluZycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbnB1dFRleHRBcmVhKGNvbnRyb2xsZXIpLmRpc2FibGVkLCB0cnVlLCAndGhlIHRleHRhcmVhIG11c3QgYmUgZGlzYWJsZWQgd2hpbGUgcGVuZGluZycpO1xuXHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbChpbnB1dERvbU5vZGUoY29udHJvbGxlcikuc3R5bGUuZGlzcGxheSwgJ25vbmUnLCAndGhlIG92ZXJsYXkgbXVzdCBzdGF5IHZpc2libGUgd2hpbGUgcGVuZGluZywgbm90IGJlIGRpc21pc3NlZCBlYWdlcmx5Jyk7XG5cblx0XHRyZXNvbHZlQ3JlYXRlKHNpZGVDaGF0KTtcblx0XHRhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgMCkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjYWxsT3JkZXIsIFtcblx0XHRcdCdjcmVhdGU6dHVybi0xOmhlbGxvIHdvcmxkJyxcblx0XHRcdGBvcGVuOiR7c2lkZUNoYXQucmVzb3VyY2UudG9TdHJpbmcoKX1gLFxuXHRcdFx0YHNlbmQ6JHtzaWRlQ2hhdC5yZXNvdXJjZS50b1N0cmluZygpfTp3aGF0IGRvZXMgdGhpcyBtZWFuP2AsXG5cdFx0XSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzSW5wdXRCdXN5KGNvbnRyb2xsZXIpLCBmYWxzZSwgJ2J1c3kgY2xlYXJzIG9uY2UgdGhlIG9yY2hlc3RyYXRpb24gc2V0dGxlcycpO1xuXHR9KTtcblxuXHR0ZXN0KCdwcmV2ZW50cyBkdXBsaWNhdGUgc3VibWlzc2lvbiAoY2xpY2sgYW5kIEVudGVyKSB3aGlsZSBhIHJlcXVlc3QgaXMgcGVuZGluZycsIGFzeW5jICgpID0+IHtcblx0XHRsZXQgcmVzb2x2ZUNyZWF0ZSE6IChjaGF0OiBJQ2hhdCkgPT4gdm9pZDtcblx0XHRjb25zdCBwZW5kaW5nID0gbmV3IFByb21pc2U8SUNoYXQ+KHJlc29sdmUgPT4geyByZXNvbHZlQ3JlYXRlID0gcmVzb2x2ZTsgfSk7XG5cdFx0bGV0IGNyZWF0ZUNhbGxzID0gMDtcblx0XHRjb25zdCB7IGNvbnRyb2xsZXIsIHNldFNlbGVjdGlvbiwgc2lkZUNoYXQgfSA9IHNldHVwKHtcblx0XHRcdGNyZWF0ZVNpZGVDaGF0SW5TZXNzaW9uOiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNyZWF0ZUNhbGxzKys7XG5cdFx0XHRcdHJldHVybiBwZW5kaW5nO1xuXHRcdFx0fSxcblx0XHR9KTtcblx0XHRzZXRTZWxlY3Rpb24oJ2hlbGxvIHdvcmxkJyk7XG5cdFx0c3VibWl0VmlhQ2xpY2soY29udHJvbGxlciwgJ3doYXQgZG9lcyB0aGlzIG1lYW4/Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNyZWF0ZUNhbGxzLCAxKTtcblxuXHRcdC8vIEEgc2Vjb25kIGNsaWNrIGFuZCBhbiBFbnRlciBrZXlwcmVzcyB3aGlsZSB0aGUgZmlyc3QgcmVxdWVzdCBpcyBzdGlsbFxuXHRcdC8vIGluIGZsaWdodCBtdXN0IG5vdCBjcmVhdGUgYSBzZWNvbmQgc2lkZSBjaGF0LlxuXHRcdGlucHV0RG9tTm9kZShjb250cm9sbGVyKS5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PignLmFjdGlvbi1sYWJlbCcpIS5jbGljaygpO1xuXHRcdGRpc3BhdGNoS2V5KGlucHV0VGV4dEFyZWEoY29udHJvbGxlciksICdFbnRlcicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjcmVhdGVDYWxscywgMSwgJ29ubHkgdGhlIGZpcnN0IHN1Ym1pc3Npb24gbXVzdCBjcmVhdGUgYSBzaWRlIGNoYXQnKTtcblxuXHRcdHJlc29sdmVDcmVhdGUoc2lkZUNoYXQpO1xuXHRcdGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCAwKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lnbm9yZXMgRXNjYXBlIGFuZCBzZWxlY3Rpb24tY2hhbmdlIGRpc21pc3NhbCB3aGlsZSBhIHJlcXVlc3QgaXMgcGVuZGluZycsIGFzeW5jICgpID0+IHtcblx0XHRsZXQgcmVzb2x2ZUNyZWF0ZSE6IChjaGF0OiBJQ2hhdCkgPT4gdm9pZDtcblx0XHRjb25zdCBwZW5kaW5nID0gbmV3IFByb21pc2U8SUNoYXQ+KHJlc29sdmUgPT4geyByZXNvbHZlQ3JlYXRlID0gcmVzb2x2ZTsgfSk7XG5cdFx0Y29uc3QgeyBjb250cm9sbGVyLCBzZXRTZWxlY3Rpb24sIHNpZGVDaGF0IH0gPSBzZXR1cCh7XG5cdFx0XHRjcmVhdGVTaWRlQ2hhdEluU2Vzc2lvbjogYXN5bmMgKCkgPT4gcGVuZGluZyxcblx0XHR9KTtcblx0XHRzZXRTZWxlY3Rpb24oJ2hlbGxvIHdvcmxkJyk7XG5cdFx0c3VibWl0VmlhQ2xpY2soY29udHJvbGxlciwgJ3doYXQgZG9lcyB0aGlzIG1lYW4/Jyk7XG5cdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKGlucHV0RG9tTm9kZShjb250cm9sbGVyKS5zdHlsZS5kaXNwbGF5LCAnbm9uZScpO1xuXG5cdFx0ZGlzcGF0Y2hLZXkoaW5wdXRUZXh0QXJlYShjb250cm9sbGVyKSwgJ0VzY2FwZScpO1xuXHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbChpbnB1dERvbU5vZGUoY29udHJvbGxlcikuc3R5bGUuZGlzcGxheSwgJ25vbmUnLCAnRXNjYXBlIG11c3Qgbm90IGRpc21pc3MgYSBwZW5kaW5nIHJlcXVlc3QnKTtcblxuXHRcdHNldFNlbGVjdGlvbignJyk7XG5cdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKGlucHV0RG9tTm9kZShjb250cm9sbGVyKS5zdHlsZS5kaXNwbGF5LCAnbm9uZScsICdhbiBpbnZhbGlkYXRlZCBzZWxlY3Rpb24gbXVzdCBub3QgZGlzbWlzcyBhIHBlbmRpbmcgcmVxdWVzdCcpO1xuXG5cdFx0cmVzb2x2ZUNyZWF0ZShzaWRlQ2hhdCk7XG5cdFx0YXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIDApKTtcblx0fSk7XG5cblx0dGVzdCgncmVzdG9yZXMgdGhlIGVudGVyZWQgcXVlc3Rpb24gYW5kIHJlLWVuYWJsZXMgdGhlIGlucHV0IHdoZW4gdGhlIHNpZGUgY2hhdCBmYWlscyB0byBjcmVhdGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBjb250cm9sbGVyLCBzZXRTZWxlY3Rpb24sIG5vdGlmaWNhdGlvblNlcnZpY2UgfSA9IHNldHVwKHtcblx0XHRcdGNyZWF0ZVNpZGVDaGF0SW5TZXNzaW9uOiBhc3luYyAoKSA9PiB7IHRocm93IG5ldyBFcnJvcignYm9vbScpOyB9LFxuXHRcdH0pO1xuXHRcdHNldFNlbGVjdGlvbignaGVsbG8gd29ybGQnKTtcblx0XHRzdWJtaXRWaWFDbGljayhjb250cm9sbGVyLCAnd2hhdCBkb2VzIHRoaXMgbWVhbj8nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNJbnB1dEJ1c3koY29udHJvbGxlciksIHRydWUpO1xuXG5cdFx0YXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIDApKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0lucHV0QnVzeShjb250cm9sbGVyKSwgZmFsc2UsICdidXN5IG11c3QgY2xlYXIgb24gZmFpbHVyZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbnB1dFRleHRBcmVhKGNvbnRyb2xsZXIpLmRpc2FibGVkLCBmYWxzZSwgJ3RoZSB0ZXh0YXJlYSBtdXN0IGJlIHJlLWVuYWJsZWQgb24gZmFpbHVyZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbnB1dFRleHRBcmVhKGNvbnRyb2xsZXIpLnZhbHVlLCAnd2hhdCBkb2VzIHRoaXMgbWVhbj8nLCAndGhlIGVudGVyZWQgcXVlc3Rpb24gbXVzdCBiZSByZXN0b3JlZCBvbiBmYWlsdXJlJyk7XG5cdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKGlucHV0RG9tTm9kZShjb250cm9sbGVyKS5zdHlsZS5kaXNwbGF5LCAnbm9uZScsICd0aGUgb3ZlcmxheSBtdXN0IHN0YXkgdmlzaWJsZSBzbyB0aGUgdXNlciBjYW4gcmV0cnknKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobm90aWZpY2F0aW9uU2VydmljZS5ub3RpZmljYXRpb25zLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5vdGlmaWNhdGlvblNlcnZpY2Uubm90aWZpY2F0aW9uc1swXS5zZXZlcml0eSwgU2V2ZXJpdHkuRXJyb3IpO1xuXHR9KTtcblxuXHR0ZXN0KCdzYW1lLWNoYXQgc2V0Q2hhdCAoZS5nLiBhIHN0YXR1cy9pbnRlcmFjdGl2aXR5IHVwZGF0ZSkgcHJlc2VydmVzIGEgdmlzaWJsZSBkcmFmdCcsICgpID0+IHtcblx0XHRjb25zdCB7IGNvbnRyb2xsZXIsIHNldFNlbGVjdGlvbiwgY2hhdCB9ID0gc2V0dXAoKTtcblx0XHRzZXRTZWxlY3Rpb24oJ2hlbGxvIHdvcmxkJyk7XG5cdFx0Y29uc3QgdGV4dEFyZWEgPSBpbnB1dFRleHRBcmVhKGNvbnRyb2xsZXIpO1xuXHRcdHRleHRBcmVhLnZhbHVlID0gJ2EgZHJhZnQgaW4gcHJvZ3Jlc3MnO1xuXHRcdHRleHRBcmVhLmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdpbnB1dCcsIHsgYnViYmxlczogdHJ1ZSB9KSk7XG5cblx0XHQvLyBBIG5ldyBJQ2hhdCBvYmplY3QgZm9yIHRoZSBzYW1lIHJlc291cmNlIChlLmcuIENoYXRWaWV3IHJlLWludm9raW5nXG5cdFx0Ly8gc2V0Q2hhdCBvbiBhIHN0YXR1cy9pbnRlcmFjdGl2aXR5IG9ic2VydmFibGUgY2hhbmdlKSBtdXN0IG5vdFxuXHRcdC8vIGRpc2NhcmQgdGhlIHZpc2libGUgZHJhZnQuXG5cdFx0Y29udHJvbGxlci5zZXRDaGF0KHVwY2FzdFBhcnRpYWw8SUNoYXQ+KHsgcmVzb3VyY2U6IGNoYXQucmVzb3VyY2UgfSkpO1xuXG5cdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKGlucHV0RG9tTm9kZShjb250cm9sbGVyKS5zdHlsZS5kaXNwbGF5LCAnbm9uZScsICdpbnB1dCBtdXN0IHN0YXkgdmlzaWJsZSBvbiBhIHNhbWUtcmVzb3VyY2Ugc2V0Q2hhdCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXh0QXJlYS52YWx1ZSwgJ2EgZHJhZnQgaW4gcHJvZ3Jlc3MnLCAndGhlIHR5cGVkIGRyYWZ0IG11c3Qgc3Vydml2ZSBhIHNhbWUtcmVzb3VyY2Ugc2V0Q2hhdCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdzYW1lLWNoYXQgc2V0Q2hhdCBkb2VzIG5vdCBjbGVhciBhIHBlbmRpbmcgYnVzeSBzdWJtaXNzaW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGxldCByZXNvbHZlQ3JlYXRlITogKGNoYXQ6IElDaGF0KSA9PiB2b2lkO1xuXHRcdGNvbnN0IHBlbmRpbmcgPSBuZXcgUHJvbWlzZTxJQ2hhdD4ocmVzb2x2ZSA9PiB7IHJlc29sdmVDcmVhdGUgPSByZXNvbHZlOyB9KTtcblx0XHRjb25zdCB7IGNvbnRyb2xsZXIsIHNldFNlbGVjdGlvbiwgY2FsbE9yZGVyLCBjaGF0LCBzaWRlQ2hhdCB9ID0gc2V0dXAoe1xuXHRcdFx0Y3JlYXRlU2lkZUNoYXRJblNlc3Npb246IGFzeW5jIChfc2Vzc2lvbiwgX3NvdXJjZUNoYXQsIHR1cm5JZCwgc2VsZWN0aW9uKSA9PiB7XG5cdFx0XHRcdGNhbGxPcmRlci5wdXNoKGBjcmVhdGU6JHt0dXJuSWR9OiR7c2VsZWN0aW9uPy50ZXh0fWApO1xuXHRcdFx0XHRyZXR1cm4gcGVuZGluZztcblx0XHRcdH0sXG5cdFx0fSk7XG5cdFx0c2V0U2VsZWN0aW9uKCdoZWxsbyB3b3JsZCcpO1xuXHRcdHN1Ym1pdFZpYUNsaWNrKGNvbnRyb2xsZXIsICd3aGF0IGRvZXMgdGhpcyBtZWFuPycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0lucHV0QnVzeShjb250cm9sbGVyKSwgdHJ1ZSk7XG5cblx0XHQvLyBBIHNhbWUtcmVzb3VyY2Ugc2V0Q2hhdCAoc3RhdHVzL2ludGVyYWN0aXZpdHkgdXBkYXRlKSBtdXN0IG5vdFxuXHRcdC8vIGZvcmNlLWRpc21pc3Mgb3IgY2xlYXIgYnVzeSB3aGlsZSB0aGUgc3VibWlzc2lvbiBpcyBzdGlsbCBwZW5kaW5nLlxuXHRcdGNvbnRyb2xsZXIuc2V0Q2hhdCh1cGNhc3RQYXJ0aWFsPElDaGF0Pih7IHJlc291cmNlOiBjaGF0LnJlc291cmNlIH0pKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNJbnB1dEJ1c3koY29udHJvbGxlciksIHRydWUsICdidXN5IG11c3Qgc3Vydml2ZSBhIHNhbWUtcmVzb3VyY2Ugc2V0Q2hhdCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbnB1dFRleHRBcmVhKGNvbnRyb2xsZXIpLmRpc2FibGVkLCB0cnVlKTtcblx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwoaW5wdXREb21Ob2RlKGNvbnRyb2xsZXIpLnN0eWxlLmRpc3BsYXksICdub25lJyk7XG5cblx0XHQvLyBUaGUgc3RpbGwtcGVuZGluZyBvcmlnaW5hbCByZXF1ZXN0IG11c3QgYmUgdGhlIG9uZSB0aGF0IGV2ZW50dWFsbHlcblx0XHQvLyByZXNvbHZlcyB0aGUgYnVzeSBzdGF0ZSBcdTIwMTQgYSBzYW1lLXJlc291cmNlIHNldENoYXQgbXVzdCBub3QgaGF2ZVxuXHRcdC8vIGxldCBhIHNlY29uZCBzdWJtaXNzaW9uIHJhY2UgaW4uXG5cdFx0cmVzb2x2ZUNyZWF0ZShzaWRlQ2hhdCk7XG5cdFx0YXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIDApKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2FsbE9yZGVyLCBbXG5cdFx0XHQnY3JlYXRlOnR1cm4tMTpoZWxsbyB3b3JsZCcsXG5cdFx0XHRgb3Blbjoke3NpZGVDaGF0LnJlc291cmNlLnRvU3RyaW5nKCl9YCxcblx0XHRcdGBzZW5kOiR7c2lkZUNoYXQucmVzb3VyY2UudG9TdHJpbmcoKX06d2hhdCBkb2VzIHRoaXMgbWVhbj9gLFxuXHRcdF0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0lucHV0QnVzeShjb250cm9sbGVyKSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdkaWZmZXJlbnQtcmVzb3VyY2Ugc2V0Q2hhdCBmb3JjZS1kaXNtaXNzZXMgZXZlbiB3aGlsZSBidXN5JywgYXN5bmMgKCkgPT4ge1xuXHRcdGxldCByZXNvbHZlQ3JlYXRlITogKGNoYXQ6IElDaGF0KSA9PiB2b2lkO1xuXHRcdGNvbnN0IHBlbmRpbmcgPSBuZXcgUHJvbWlzZTxJQ2hhdD4ocmVzb2x2ZSA9PiB7IHJlc29sdmVDcmVhdGUgPSByZXNvbHZlOyB9KTtcblx0XHRjb25zdCB7IGNvbnRyb2xsZXIsIHNldFNlbGVjdGlvbiB9ID0gc2V0dXAoe1xuXHRcdFx0Y3JlYXRlU2lkZUNoYXRJblNlc3Npb246IGFzeW5jICgpID0+IHBlbmRpbmcsXG5cdFx0fSk7XG5cdFx0c2V0U2VsZWN0aW9uKCdoZWxsbyB3b3JsZCcpO1xuXHRcdHN1Ym1pdFZpYUNsaWNrKGNvbnRyb2xsZXIsICd3aGF0IGRvZXMgdGhpcyBtZWFuPycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0lucHV0QnVzeShjb250cm9sbGVyKSwgdHJ1ZSk7XG5cblx0XHRjb250cm9sbGVyLnNldENoYXQodXBjYXN0UGFydGlhbDxJQ2hhdD4oeyByZXNvdXJjZTogVVJJLnBhcnNlKCd0ZXN0Oi8vL2NoYXQvb3RoZXInKSB9KSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW5wdXREb21Ob2RlKGNvbnRyb2xsZXIpLnN0eWxlLmRpc3BsYXksICdub25lJywgJ2EgZ2VudWluZSBjaGF0IGNoYW5nZSBtdXN0IGRpc21pc3MgZXZlbiBhIGJ1c3kgb3ZlcmxheScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0lucHV0QnVzeShjb250cm9sbGVyKSwgZmFsc2UpO1xuXG5cdFx0Ly8gQSByZWFsIGNsaWNrIGFsc28gY2xlYXJzIHRoZSBicm93c2VyJ3MgdGV4dCBzZWxlY3Rpb247IHJlZmxlY3QgdGhhdFxuXHRcdC8vIGhlcmUgc28gYSBgc2VsZWN0aW9uY2hhbmdlYCB0aGUgYnJvd3NlciBmaXJlcyBhc3luY2hyb25vdXNseSBhc1xuXHRcdC8vIGZvY3VzIGxlYXZlcyB0aGUgbm93LWhpZGRlbiBpbnB1dCAod2hpY2ggdGhlIG1vY2tlZCBgZ2V0U2VsZWN0aW9uYFxuXHRcdC8vIHdvdWxkIG90aGVyd2lzZSBzdGlsbCByZXBvcnQgYXMgXCJoZWxsbyB3b3JsZFwiKSBjYW4ndCByZW9wZW4gaXQuXG5cdFx0c2V0U2VsZWN0aW9uKCcnKTtcblxuXHRcdC8vIFRoZSBub3ctb3JwaGFuZWQgcmVxdWVzdCBzZXR0bGluZyBhZnRlcndhcmRzIG11c3Qgbm90IHJlb3BlbiB0aGUgb3ZlcmxheS5cblx0XHRyZXNvbHZlQ3JlYXRlKHVwY2FzdFBhcnRpYWw8SUNoYXQ+KHsgcmVzb3VyY2U6IFVSSS5wYXJzZSgndGVzdDovLy9jaGF0L3NpZGUnKSB9KSk7XG5cdFx0YXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIDApKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW5wdXREb21Ob2RlKGNvbnRyb2xsZXIpLnN0eWxlLmRpc3BsYXksICdub25lJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Egc3VjY2VzcyB0aGF0IHNldHRsZXMgYWZ0ZXIgYSBkaWZmZXJlbnQtcmVzb3VyY2Ugc2V0Q2hhdCBkb2VzIG5vdCByZW9wZW4sIHJlZm9jdXMsIG9yIG11dGF0ZSB0aGUgb3ZlcmxheScsIGFzeW5jICgpID0+IHtcblx0XHRsZXQgcmVzb2x2ZUNyZWF0ZSE6IChjaGF0OiBJQ2hhdCkgPT4gdm9pZDtcblx0XHRjb25zdCBwZW5kaW5nID0gbmV3IFByb21pc2U8SUNoYXQ+KHJlc29sdmUgPT4geyByZXNvbHZlQ3JlYXRlID0gcmVzb2x2ZTsgfSk7XG5cdFx0Y29uc3QgeyBjb250cm9sbGVyLCBzZXRTZWxlY3Rpb24sIGZvY3VzUmVzcG9uc2VJdGVtQ2FsbHMgfSA9IHNldHVwKHtcblx0XHRcdGNyZWF0ZVNpZGVDaGF0SW5TZXNzaW9uOiBhc3luYyAoKSA9PiBwZW5kaW5nLFxuXHRcdH0pO1xuXHRcdHNldFNlbGVjdGlvbignaGVsbG8gd29ybGQnKTtcblx0XHRzdWJtaXRWaWFDbGljayhjb250cm9sbGVyLCAnd2hhdCBkb2VzIHRoaXMgbWVhbj8nKTtcblxuXHRcdGNvbnRyb2xsZXIuc2V0Q2hhdCh1cGNhc3RQYXJ0aWFsPElDaGF0Pih7IHJlc291cmNlOiBVUkkucGFyc2UoJ3Rlc3Q6Ly8vY2hhdC9vdGhlcicpIH0pKTtcblx0XHRzZXRTZWxlY3Rpb24oJycpO1xuXHRcdGNvbnN0IGZvY3VzQ2FsbHNBdERpc21pc3MgPSBmb2N1c1Jlc3BvbnNlSXRlbUNhbGxzLmxlbmd0aDtcblxuXHRcdHJlc29sdmVDcmVhdGUodXBjYXN0UGFydGlhbDxJQ2hhdD4oeyByZXNvdXJjZTogVVJJLnBhcnNlKCd0ZXN0Oi8vL2NoYXQvc2lkZScpIH0pKTtcblx0XHRhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgMCkpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlucHV0RG9tTm9kZShjb250cm9sbGVyKS5zdHlsZS5kaXNwbGF5LCAnbm9uZScsICdhIHN0YWxlIHN1Y2Nlc3MgbXVzdCBub3QgcmVvcGVuIHRoZSBvdmVybGF5Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlucHV0VGV4dEFyZWEoY29udHJvbGxlcikudmFsdWUsICcnLCAnYSBzdGFsZSBzdWNjZXNzIG11c3Qgbm90IG11dGF0ZSB0aGUgKGFscmVhZHkgY2xlYXJlZCkgaW5wdXQgdmFsdWUnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGZvY3VzUmVzcG9uc2VJdGVtQ2FsbHMubGVuZ3RoLCBmb2N1c0NhbGxzQXREaXNtaXNzLCAnYSBzdGFsZSBzdWNjZXNzIG11c3Qgbm90IHJlZm9jdXMgdGhlIHRyYW5zY3JpcHQnKTtcblx0fSk7XG5cblx0dGVzdCgnYSBmYWlsdXJlIHRoYXQgc2V0dGxlcyBhZnRlciBhIGRpZmZlcmVudC1yZXNvdXJjZSBzZXRDaGF0IGRvZXMgbm90IHJlb3BlbiwgcmVmb2N1cywgbXV0YXRlLCBvciBub3RpZnknLCBhc3luYyAoKSA9PiB7XG5cdFx0bGV0IHJlamVjdENyZWF0ZSE6IChlcnI6IEVycm9yKSA9PiB2b2lkO1xuXHRcdGNvbnN0IHBlbmRpbmcgPSBuZXcgUHJvbWlzZTxJQ2hhdD4oKF9yZXNvbHZlLCByZWplY3QpID0+IHsgcmVqZWN0Q3JlYXRlID0gcmVqZWN0OyB9KTtcblx0XHRjb25zdCB7IGNvbnRyb2xsZXIsIHNldFNlbGVjdGlvbiwgbm90aWZpY2F0aW9uU2VydmljZSwgZm9jdXNSZXNwb25zZUl0ZW1DYWxscyB9ID0gc2V0dXAoe1xuXHRcdFx0Y3JlYXRlU2lkZUNoYXRJblNlc3Npb246IGFzeW5jICgpID0+IHBlbmRpbmcsXG5cdFx0fSk7XG5cdFx0c2V0U2VsZWN0aW9uKCdoZWxsbyB3b3JsZCcpO1xuXHRcdHN1Ym1pdFZpYUNsaWNrKGNvbnRyb2xsZXIsICd3aGF0IGRvZXMgdGhpcyBtZWFuPycpO1xuXG5cdFx0Y29udHJvbGxlci5zZXRDaGF0KHVwY2FzdFBhcnRpYWw8SUNoYXQ+KHsgcmVzb3VyY2U6IFVSSS5wYXJzZSgndGVzdDovLy9jaGF0L290aGVyJykgfSkpO1xuXHRcdHNldFNlbGVjdGlvbignJyk7XG5cdFx0Y29uc3QgZm9jdXNDYWxsc0F0RGlzbWlzcyA9IGZvY3VzUmVzcG9uc2VJdGVtQ2FsbHMubGVuZ3RoO1xuXG5cdFx0cmVqZWN0Q3JlYXRlKG5ldyBFcnJvcignYm9vbScpKTtcblx0XHRhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgMCkpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlucHV0RG9tTm9kZShjb250cm9sbGVyKS5zdHlsZS5kaXNwbGF5LCAnbm9uZScsICdhIHN0YWxlIGZhaWx1cmUgbXVzdCBub3QgcmVvcGVuIHRoZSBvdmVybGF5Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlucHV0VGV4dEFyZWEoY29udHJvbGxlcikudmFsdWUsICcnLCAnYSBzdGFsZSBmYWlsdXJlIG11c3Qgbm90IHJlc3RvcmUgdGhlIGZhaWxlZCBxdWVzdGlvbiBpbnRvIHRoZSAoYWxyZWFkeSBjbGVhcmVkKSBpbnB1dCcpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZm9jdXNSZXNwb25zZUl0ZW1DYWxscy5sZW5ndGgsIGZvY3VzQ2FsbHNBdERpc21pc3MsICdhIHN0YWxlIGZhaWx1cmUgbXVzdCBub3QgcmVmb2N1cyB0aGUgaW5wdXQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobm90aWZpY2F0aW9uU2VydmljZS5ub3RpZmljYXRpb25zLmxlbmd0aCwgMCwgJ2Egc3RhbGUgZmFpbHVyZSBtdXN0IG5vdCBzdXJmYWNlIGEgcmV0cnkgbm90aWZpY2F0aW9uIGZvciBhbiBhYmFuZG9uZWQgb3ZlcmxheScpO1xuXHR9KTtcblxuXHR0ZXN0KCdwbGFpbiBFbnRlciBzdWJtaXRzIGFuZCBwcmV2ZW50cyB0aGUgZGVmYXVsdCBuZXdsaW5lJywgKCkgPT4ge1xuXHRcdGNvbnN0IHsgY29udHJvbGxlciwgc2V0U2VsZWN0aW9uLCBjYWxsT3JkZXIgfSA9IHNldHVwKCk7XG5cdFx0c2V0U2VsZWN0aW9uKCdoZWxsbyB3b3JsZCcpO1xuXHRcdGNvbnN0IHRleHRBcmVhID0gaW5wdXRUZXh0QXJlYShjb250cm9sbGVyKTtcblx0XHR0ZXh0QXJlYS52YWx1ZSA9ICd3aGF0IGRvZXMgdGhpcyBtZWFuPyc7XG5cdFx0dGV4dEFyZWEuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2lucHV0JywgeyBidWJibGVzOiB0cnVlIH0pKTtcblxuXHRcdGNvbnN0IGV2ZW50ID0gZGlzcGF0Y2hLZXkodGV4dEFyZWEsICdFbnRlcicpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50LmRlZmF1bHRQcmV2ZW50ZWQsIHRydWUsICdwbGFpbiBFbnRlciBtdXN0IHByZXZlbnQgdGhlIGRlZmF1bHQgbmV3bGluZScpO1xuXHRcdGFzc2VydC5vayhjYWxsT3JkZXJbMF0/LnN0YXJ0c1dpdGgoJ2NyZWF0ZTp0dXJuLTE6aGVsbG8gd29ybGQnKSwgJ3BsYWluIEVudGVyIG11c3Qgc3VibWl0Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ1NoaWZ0K0VudGVyIGluc2VydHMgYSBuZXdsaW5lIGluc3RlYWQgb2Ygc3VibWl0dGluZycsICgpID0+IHtcblx0XHRjb25zdCB7IGNvbnRyb2xsZXIsIHNldFNlbGVjdGlvbiwgY2FsbE9yZGVyIH0gPSBzZXR1cCgpO1xuXHRcdHNldFNlbGVjdGlvbignaGVsbG8gd29ybGQnKTtcblx0XHRjb25zdCB0ZXh0QXJlYSA9IGlucHV0VGV4dEFyZWEoY29udHJvbGxlcik7XG5cdFx0dGV4dEFyZWEudmFsdWUgPSAnd2hhdCBkb2VzIHRoaXMgbWVhbj8nO1xuXHRcdHRleHRBcmVhLmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdpbnB1dCcsIHsgYnViYmxlczogdHJ1ZSB9KSk7XG5cblx0XHRjb25zdCBldmVudCA9IGRpc3BhdGNoS2V5KHRleHRBcmVhLCAnRW50ZXInLCB7IHNoaWZ0S2V5OiB0cnVlIH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50LmRlZmF1bHRQcmV2ZW50ZWQsIGZhbHNlLCAnU2hpZnQrRW50ZXIgbXVzdCBsZXQgdGhlIHRleHRhcmVhIGluc2VydCBhIG5ld2xpbmUnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNhbGxPcmRlciwgW10sICdTaGlmdCtFbnRlciBtdXN0IG5vdCBzdWJtaXQnKTtcblx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwoaW5wdXREb21Ob2RlKGNvbnRyb2xsZXIpLnN0eWxlLmRpc3BsYXksICdub25lJywgJ1NoaWZ0K0VudGVyIG11c3Qgbm90IGRpc21pc3MgdGhlIG92ZXJsYXknKTtcblx0fSk7XG5cblx0dGVzdCgnRW50ZXIgZHVyaW5nIElNRSBjb21wb3NpdGlvbiBkb2VzIG5vdCBzdWJtaXQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgeyBjb250cm9sbGVyLCBzZXRTZWxlY3Rpb24sIGNhbGxPcmRlciB9ID0gc2V0dXAoKTtcblx0XHRzZXRTZWxlY3Rpb24oJ2hlbGxvIHdvcmxkJyk7XG5cdFx0Y29uc3QgdGV4dEFyZWEgPSBpbnB1dFRleHRBcmVhKGNvbnRyb2xsZXIpO1xuXHRcdHRleHRBcmVhLnZhbHVlID0gJ3doYXQgZG9lcyB0aGlzIG1lYW4/Jztcblx0XHR0ZXh0QXJlYS5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnaW5wdXQnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xuXG5cdFx0Y29uc3QgZXZlbnQgPSBkaXNwYXRjaEtleSh0ZXh0QXJlYSwgJ0VudGVyJywgeyBpc0NvbXBvc2luZzogdHJ1ZSB9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudC5kZWZhdWx0UHJldmVudGVkLCBmYWxzZSwgJ0VudGVyIGR1cmluZyBJTUUgY29tcG9zaXRpb24gbXVzdCBub3QgYmUgcHJldmVudGVkJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjYWxsT3JkZXIsIFtdLCAnRW50ZXIgZHVyaW5nIElNRSBjb21wb3NpdGlvbiBtdXN0IG5vdCBzdWJtaXQnKTtcblx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwoaW5wdXREb21Ob2RlKGNvbnRyb2xsZXIpLnN0eWxlLmRpc3BsYXksICdub25lJywgJ0VudGVyIGR1cmluZyBJTUUgY29tcG9zaXRpb24gbXVzdCBub3QgZGlzbWlzcyB0aGUgb3ZlcmxheScpO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFlBQVksU0FBUztBQUNyQixTQUFTLGVBQWU7QUFDeEIsU0FBUyxpQkFBaUIsb0JBQW9CO0FBQzlDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsV0FBVztBQUNwQixTQUFTLHFCQUFxQjtBQUM5QixTQUFTLCtDQUErQztBQUN4RCxTQUFTLGFBQWEsc0JBQXNCO0FBQzVDLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQThCLHNCQUFzQixnQkFBZ0I7QUFDcEUsU0FBUywrQkFBK0I7QUFHeEMsU0FBUywyQ0FBMkM7QUFDcEQsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyx3QkFBd0I7QUFDakMsU0FBMEIscUJBQXFCO0FBQy9DLFNBQVMsa0NBQWtDO0FBRTNDLE1BQU0scUNBQXFDLHdCQUF3QjtBQUFBLEVBQW5FO0FBQUE7QUFDQyxTQUFTLGdCQUEyRCxDQUFDO0FBQUE7QUFBQSxFQUM1RCxLQUFLLFNBQXNDO0FBQ25ELFNBQUssY0FBYyxLQUFLLEVBQUUsVUFBVSxTQUFTLFNBQVMsUUFBUSxDQUFDO0FBQy9ELFdBQU8sTUFBTSxLQUFL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
