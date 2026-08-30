import assert from "assert";
import { DeferredPromise } from "../../../../../../base/common/async.js";
import { Emitter } from "../../../../../../base/common/event.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { OffsetRange } from "../../../../../../editor/common/core/ranges/offsetRange.js";
import { Range } from "../../../../../../editor/common/core/range.js";
import { TestConfigurationService } from "../../../../../../platform/configuration/test/common/testConfigurationService.js";
import { SaveReason } from "../../../../../common/editor.js";
import { TestEditorService } from "../../../../../test/browser/workbenchTestServices.js";
import { acceptAndAwaitSentRequest, ChatWidget, getImmediateSilentSlashCommandPart, layoutChatWidgetForInputHeight, saveAllBeforeChatSend, shouldShowChatTip, shouldShowChatWelcome } from "../../../browser/widget/chatWidget.js";
import { ChatAgentLocation, ChatConfiguration } from "../../../common/constants.js";
import { ChatRequestSlashCommandPart, ChatRequestTextPart } from "../../../common/requestParser/chatParserTypes.js";
import { observePromptTimelineHostWidth } from "../../../browser/promptTimeline/promptTimelineWidgetContrib.js";
suite("ChatWidget", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  class RecordingEditorService extends TestEditorService {
    constructor() {
      super(...arguments);
      this.saveAllCalls = [];
    }
    async saveAll(options) {
      this.saveAllCalls.push(options);
      return { success: true, editors: [] };
    }
  }
  test("saves non-untitled editors before sending by default", async () => {
    const configurationService = new TestConfigurationService();
    const editorService = store.add(new RecordingEditorService());
    await saveAllBeforeChatSend(configurationService, editorService);
    await configurationService.setUserConfiguration(ChatConfiguration.SaveBeforeSend, false);
    await saveAllBeforeChatSend(configurationService, editorService);
    assert.deepStrictEqual(editorService.saveAllCalls, [{
      includeUntitled: false,
      reason: SaveReason.EXPLICIT
    }]);
  });
  test("transcript overlays suppress the welcome state", () => {
    assert.deepStrictEqual({
      unavailable: shouldShowChatWelcome(void 0, false),
      progressBeforeModel: shouldShowChatWelcome(void 0, true),
      empty: shouldShowChatWelcome(0, false),
      progress: shouldShowChatWelcome(0, true),
      message: shouldShowChatWelcome(1, false)
    }, {
      unavailable: void 0,
      progressBeforeModel: false,
      empty: true,
      progress: false,
      message: false
    });
  });
  test("loading suppresses the getting-started tip", () => {
    assert.deepStrictEqual([
      shouldShowChatTip(0, false, false),
      shouldShowChatTip(0, false, true)
    ], [true, false]);
  });
  test("identifies only leading silent execute-immediately slash commands", () => {
    const command = new ChatRequestSlashCommandPart(
      new OffsetRange(0, 7),
      new Range(1, 1, 1, 8),
      {
        command: "models",
        detail: "Open models",
        executeImmediately: true,
        silent: true,
        locations: [ChatAgentLocation.Chat]
      }
    );
    const nonSilentCommand = new ChatRequestSlashCommandPart(
      new OffsetRange(0, 5),
      new Range(1, 1, 1, 6),
      {
        command: "help",
        detail: "Show help",
        executeImmediately: true,
        silent: false,
        locations: [ChatAgentLocation.Chat]
      }
    );
    const delayedCommand = new ChatRequestSlashCommandPart(
      new OffsetRange(0, 7),
      new Range(1, 1, 1, 8),
      {
        command: "rename",
        detail: "Rename chat",
        executeImmediately: false,
        silent: true,
        locations: [ChatAgentLocation.Chat]
      }
    );
    const prefix = new ChatRequestTextPart(new OffsetRange(0, 1), new Range(1, 1, 1, 2), " ");
    const shiftedCommand = new ChatRequestSlashCommandPart(
      new OffsetRange(1, 8),
      new Range(1, 2, 1, 9),
      command.slashCommand
    );
    assert.deepStrictEqual([
      getImmediateSilentSlashCommandPart({ text: "/models", parts: [command] })?.slashCommand.command,
      getImmediateSilentSlashCommandPart({ text: "/help", parts: [nonSilentCommand] })?.slashCommand.command,
      getImmediateSilentSlashCommandPart({ text: "/rename", parts: [delayedCommand] })?.slashCommand.command,
      getImmediateSilentSlashCommandPart({ text: " /models", parts: [prefix, shiftedCommand] })?.slashCommand.command
    ], [
      "models",
      void 0,
      void 0,
      void 0
    ]);
  });
  test("input height changes update the budget without re-laying out the input", () => {
    const calls = [];
    const target = {
      setInputPartMaxHeightOverride: (height) => calls.push(["setInputPartMaxHeightOverride", height]),
      layoutForInputHeight: (height, width) => calls.push(["layoutForInputHeight", height, width])
    };
    layoutChatWidgetForInputHeight(target, 600, 420, 720);
    assert.deepStrictEqual(calls, [
      ["setInputPartMaxHeightOverride", 600],
      ["layoutForInputHeight", 420, 720]
    ]);
  });
  test("captures and restores transcript scroll state", () => {
    const listWidget = {
      scrollTop: 200,
      scrollHeight: 1e3,
      renderHeight: 300,
      get isScrolledToBottom() {
        return this.scrollTop + this.renderHeight >= this.scrollHeight - 2;
      },
      scrollToEnd() {
        this.scrollTop = this.scrollHeight - this.renderHeight;
      }
    };
    const widget = Object.assign(Object.create(ChatWidget.prototype), { listWidget });
    const scrolledUp = widget.getViewState();
    widget.restoreViewState({ scrollTop: 350 });
    const legacyScrollTop = listWidget.scrollTop;
    widget.restoreViewState({ scrollTop: 200, isAtBottom: true });
    assert.deepStrictEqual({
      scrolledUp,
      legacyScrollTop,
      bottomScrollTop: listWidget.scrollTop
    }, {
      scrolledUp: { scrollTop: 200, isAtBottom: false },
      legacyScrollTop: 350,
      bottomScrollTop: 700
    });
  });
  test("prompt timeline width follows explicit widget layout", () => {
    const onDidLayout = new Emitter();
    const host = document.createElement("div");
    Object.defineProperty(host, "clientWidth", { value: 320 });
    const widths = [];
    const observation = observePromptTimelineHostWidth(
      { onDidLayout: onDidLayout.event },
      host,
      { setHostWidth: (width) => widths.push(width) }
    );
    onDidLayout.fire({ width: 480, height: 600 });
    observation.dispose();
    onDidLayout.fire({ width: 640, height: 600 });
    onDidLayout.dispose();
    assert.deepStrictEqual(widths, [320, 480]);
  });
});
suite("ChatWidget - acceptAndAwaitSentRequest", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function sentResult() {
    return { kind: "sent", data: {} };
  }
  test("an immediately sent request is accepted and returned", async () => {
    let accepted = 0;
    const result = sentResult();
    const sent = await acceptAndAwaitSentRequest(result, () => accepted++);
    assert.deepStrictEqual({ accepted, sent }, { accepted: 1, sent: result });
  });
  test("a queued request is accepted before the queued request settles", async () => {
    const deferred = new DeferredPromise();
    let accepted = 0;
    const pending = acceptAndAwaitSentRequest({ kind: "queued", requestId: "queued-request", deferred: deferred.p }, () => accepted++);
    const acceptedWhileQueued = accepted === 1;
    const result = sentResult();
    await deferred.complete(result);
    assert.deepStrictEqual({ acceptedWhileQueued, accepted, sent: await pending }, {
      acceptedWhileQueued: true,
      accepted: 1,
      sent: result
    });
  });
  test("a rejected request is never accepted", async () => {
    let accepted = 0;
    const sent = await acceptAndAwaitSentRequest({ kind: "rejected", reason: "Empty message" }, () => accepted++);
    assert.deepStrictEqual({ accepted, sent }, { accepted: 0, sent: void 0 });
  });
  test("a queued request that is rejected when it runs stays accepted but is not sent", async () => {
    const deferred = new DeferredPromise();
    let accepted = 0;
    const pending = acceptAndAwaitSentRequest({ kind: "queued", requestId: "queued-request", deferred: deferred.p }, () => accepted++);
    await deferred.complete({ kind: "rejected", reason: "Session is read-only" });
    assert.deepStrictEqual({ accepted, sent: await pending }, { accepted: 1, sent: void 0 });
  });
  test("accepting is optional", async () => {
    const result = sentResult();
    assert.strictEqual(await acceptAndAwaitSentRequest(result), result);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGJyb3dzZXJcXHdpZGdldFxcY2hhdFdpZGdldC50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgRGVmZXJyZWRQcm9taXNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgT2Zmc2V0UmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2VzL29mZnNldFJhbmdlLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vdGVzdC9jb21tb24vdGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IFNhdmVSZWFzb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IElTYXZlQWxsRWRpdG9yc09wdGlvbnMsIElTYXZlRWRpdG9yc1Jlc3VsdCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBUZXN0RWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3Rlc3QvYnJvd3Nlci93b3JrYmVuY2hUZXN0U2VydmljZXMuanMnO1xuaW1wb3J0IHsgYWNjZXB0QW5kQXdhaXRTZW50UmVxdWVzdCwgQ2hhdFdpZGdldCwgZ2V0SW1tZWRpYXRlU2lsZW50U2xhc2hDb21tYW5kUGFydCwgbGF5b3V0Q2hhdFdpZGdldEZvcklucHV0SGVpZ2h0LCBzYXZlQWxsQmVmb3JlQ2hhdFNlbmQsIHNob3VsZFNob3dDaGF0VGlwLCBzaG91bGRTaG93Q2hhdFdlbGNvbWUgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3dpZGdldC9jaGF0V2lkZ2V0LmpzJztcbmltcG9ydCB7IENoYXRTZW5kUmVzdWx0LCBDaGF0U2VuZFJlc3VsdFNlbnQsIElDaGF0U2VuZFJlcXVlc3REYXRhIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NoYXRTZXJ2aWNlL2NoYXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRBZ2VudExvY2F0aW9uLCBDaGF0Q29uZmlndXJhdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgQ2hhdFJlcXVlc3RTbGFzaENvbW1hbmRQYXJ0LCBDaGF0UmVxdWVzdFRleHRQYXJ0LCBJUGFyc2VkQ2hhdFJlcXVlc3QgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vcmVxdWVzdFBhcnNlci9jaGF0UGFyc2VyVHlwZXMuanMnO1xuaW1wb3J0IHsgb2JzZXJ2ZVByb21wdFRpbWVsaW5lSG9zdFdpZHRoIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9wcm9tcHRUaW1lbGluZS9wcm9tcHRUaW1lbGluZVdpZGdldENvbnRyaWIuanMnO1xuXG5zdWl0ZSgnQ2hhdFdpZGdldCcsICgpID0+IHtcblxuXHRjb25zdCBzdG9yZSA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGNsYXNzIFJlY29yZGluZ0VkaXRvclNlcnZpY2UgZXh0ZW5kcyBUZXN0RWRpdG9yU2VydmljZSB7XG5cdFx0cmVhZG9ubHkgc2F2ZUFsbENhbGxzOiAoSVNhdmVBbGxFZGl0b3JzT3B0aW9ucyB8IHVuZGVmaW5lZClbXSA9IFtdO1xuXG5cdFx0b3ZlcnJpZGUgYXN5bmMgc2F2ZUFsbChvcHRpb25zPzogSVNhdmVBbGxFZGl0b3JzT3B0aW9ucyk6IFByb21pc2U8SVNhdmVFZGl0b3JzUmVzdWx0PiB7XG5cdFx0XHR0aGlzLnNhdmVBbGxDYWxscy5wdXNoKG9wdGlvbnMpO1xuXHRcdFx0cmV0dXJuIHsgc3VjY2VzczogdHJ1ZSwgZWRpdG9yczogW10gfTtcblx0XHR9XG5cdH1cblxuXHR0ZXN0KCdzYXZlcyBub24tdW50aXRsZWQgZWRpdG9ycyBiZWZvcmUgc2VuZGluZyBieSBkZWZhdWx0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSgpO1xuXHRcdGNvbnN0IGVkaXRvclNlcnZpY2UgPSBzdG9yZS5hZGQobmV3IFJlY29yZGluZ0VkaXRvclNlcnZpY2UoKSk7XG5cblx0XHRhd2FpdCBzYXZlQWxsQmVmb3JlQ2hhdFNlbmQoY29uZmlndXJhdGlvblNlcnZpY2UsIGVkaXRvclNlcnZpY2UpO1xuXHRcdGF3YWl0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKENoYXRDb25maWd1cmF0aW9uLlNhdmVCZWZvcmVTZW5kLCBmYWxzZSk7XG5cdFx0YXdhaXQgc2F2ZUFsbEJlZm9yZUNoYXRTZW5kKGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBlZGl0b3JTZXJ2aWNlKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZWRpdG9yU2VydmljZS5zYXZlQWxsQ2FsbHMsIFt7XG5cdFx0XHRpbmNsdWRlVW50aXRsZWQ6IGZhbHNlLFxuXHRcdFx0cmVhc29uOiBTYXZlUmVhc29uLkVYUExJQ0lULFxuXHRcdH1dKTtcblx0fSk7XG5cblx0dGVzdCgndHJhbnNjcmlwdCBvdmVybGF5cyBzdXBwcmVzcyB0aGUgd2VsY29tZSBzdGF0ZScsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHVuYXZhaWxhYmxlOiBzaG91bGRTaG93Q2hhdFdlbGNvbWUodW5kZWZpbmVkLCBmYWxzZSksXG5cdFx0XHRwcm9ncmVzc0JlZm9yZU1vZGVsOiBzaG91bGRTaG93Q2hhdFdlbGNvbWUodW5kZWZpbmVkLCB0cnVlKSxcblx0XHRcdGVtcHR5OiBzaG91bGRTaG93Q2hhdFdlbGNvbWUoMCwgZmFsc2UpLFxuXHRcdFx0cHJvZ3Jlc3M6IHNob3VsZFNob3dDaGF0V2VsY29tZSgwLCB0cnVlKSxcblx0XHRcdG1lc3NhZ2U6IHNob3VsZFNob3dDaGF0V2VsY29tZSgxLCBmYWxzZSksXG5cdFx0fSwge1xuXHRcdFx0dW5hdmFpbGFibGU6IHVuZGVmaW5lZCxcblx0XHRcdHByb2dyZXNzQmVmb3JlTW9kZWw6IGZhbHNlLFxuXHRcdFx0ZW1wdHk6IHRydWUsXG5cdFx0XHRwcm9ncmVzczogZmFsc2UsXG5cdFx0XHRtZXNzYWdlOiBmYWxzZSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbG9hZGluZyBzdXBwcmVzc2VzIHRoZSBnZXR0aW5nLXN0YXJ0ZWQgdGlwJywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoW1xuXHRcdFx0c2hvdWxkU2hvd0NoYXRUaXAoMCwgZmFsc2UsIGZhbHNlKSxcblx0XHRcdHNob3VsZFNob3dDaGF0VGlwKDAsIGZhbHNlLCB0cnVlKSxcblx0XHRdLCBbdHJ1ZSwgZmFsc2VdKTtcblx0fSk7XG5cblx0dGVzdCgnaWRlbnRpZmllcyBvbmx5IGxlYWRpbmcgc2lsZW50IGV4ZWN1dGUtaW1tZWRpYXRlbHkgc2xhc2ggY29tbWFuZHMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29tbWFuZCA9IG5ldyBDaGF0UmVxdWVzdFNsYXNoQ29tbWFuZFBhcnQoXG5cdFx0XHRuZXcgT2Zmc2V0UmFuZ2UoMCwgNyksXG5cdFx0XHRuZXcgUmFuZ2UoMSwgMSwgMSwgOCksXG5cdFx0XHR7XG5cdFx0XHRcdGNvbW1hbmQ6ICdtb2RlbHMnLFxuXHRcdFx0XHRkZXRhaWw6ICdPcGVuIG1vZGVscycsXG5cdFx0XHRcdGV4ZWN1dGVJbW1lZGlhdGVseTogdHJ1ZSxcblx0XHRcdFx0c2lsZW50OiB0cnVlLFxuXHRcdFx0XHRsb2NhdGlvbnM6IFtDaGF0QWdlbnRMb2NhdGlvbi5DaGF0XSxcblx0XHRcdH0sXG5cdFx0KTtcblx0XHRjb25zdCBub25TaWxlbnRDb21tYW5kID0gbmV3IENoYXRSZXF1ZXN0U2xhc2hDb21tYW5kUGFydChcblx0XHRcdG5ldyBPZmZzZXRSYW5nZSgwLCA1KSxcblx0XHRcdG5ldyBSYW5nZSgxLCAxLCAxLCA2KSxcblx0XHRcdHtcblx0XHRcdFx0Y29tbWFuZDogJ2hlbHAnLFxuXHRcdFx0XHRkZXRhaWw6ICdTaG93IGhlbHAnLFxuXHRcdFx0XHRleGVjdXRlSW1tZWRpYXRlbHk6IHRydWUsXG5cdFx0XHRcdHNpbGVudDogZmFsc2UsXG5cdFx0XHRcdGxvY2F0aW9uczogW0NoYXRBZ2VudExvY2F0aW9uLkNoYXRdLFxuXHRcdFx0fSxcblx0XHQpO1xuXHRcdGNvbnN0IGRlbGF5ZWRDb21tYW5kID0gbmV3IENoYXRSZXF1ZXN0U2xhc2hDb21tYW5kUGFydChcblx0XHRcdG5ldyBPZmZzZXRSYW5nZSgwLCA3KSxcblx0XHRcdG5ldyBSYW5nZSgxLCAxLCAxLCA4KSxcblx0XHRcdHtcblx0XHRcdFx0Y29tbWFuZDogJ3JlbmFtZScsXG5cdFx0XHRcdGRldGFpbDogJ1JlbmFtZSBjaGF0Jyxcblx0XHRcdFx0ZXhlY3V0ZUltbWVkaWF0ZWx5OiBmYWxzZSxcblx0XHRcdFx0c2lsZW50OiB0cnVlLFxuXHRcdFx0XHRsb2NhdGlvbnM6IFtDaGF0QWdlbnRMb2NhdGlvbi5DaGF0XSxcblx0XHRcdH0sXG5cdFx0KTtcblx0XHRjb25zdCBwcmVmaXggPSBuZXcgQ2hhdFJlcXVlc3RUZXh0UGFydChuZXcgT2Zmc2V0UmFuZ2UoMCwgMSksIG5ldyBSYW5nZSgxLCAxLCAxLCAyKSwgJyAnKTtcblx0XHRjb25zdCBzaGlmdGVkQ29tbWFuZCA9IG5ldyBDaGF0UmVxdWVzdFNsYXNoQ29tbWFuZFBhcnQoXG5cdFx0XHRuZXcgT2Zmc2V0UmFuZ2UoMSwgOCksXG5cdFx0XHRuZXcgUmFuZ2UoMSwgMiwgMSwgOSksXG5cdFx0XHRjb21tYW5kLnNsYXNoQ29tbWFuZCxcblx0XHQpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbXG5cdFx0XHRnZXRJbW1lZGlhdGVTaWxlbnRTbGFzaENvbW1hbmRQYXJ0KHsgdGV4dDogJy9tb2RlbHMnLCBwYXJ0czogW2NvbW1hbmRdIH0gc2F0aXNmaWVzIElQYXJzZWRDaGF0UmVxdWVzdCk/LnNsYXNoQ29tbWFuZC5jb21tYW5kLFxuXHRcdFx0Z2V0SW1tZWRpYXRlU2lsZW50U2xhc2hDb21tYW5kUGFydCh7IHRleHQ6ICcvaGVscCcsIHBhcnRzOiBbbm9uU2lsZW50Q29tbWFuZF0gfSBzYXRpc2ZpZXMgSVBhcnNlZENoYXRSZXF1ZXN0KT8uc2xhc2hDb21tYW5kLmNvbW1hbmQsXG5cdFx0XHRnZXRJbW1lZGlhdGVTaWxlbnRTbGFzaENvbW1hbmRQYXJ0KHsgdGV4dDogJy9yZW5hbWUnLCBwYXJ0czogW2RlbGF5ZWRDb21tYW5kXSB9IHNhdGlzZmllcyBJUGFyc2VkQ2hhdFJlcXVlc3QpPy5zbGFzaENvbW1hbmQuY29tbWFuZCxcblx0XHRcdGdldEltbWVkaWF0ZVNpbGVudFNsYXNoQ29tbWFuZFBhcnQoeyB0ZXh0OiAnIC9tb2RlbHMnLCBwYXJ0czogW3ByZWZpeCwgc2hpZnRlZENvbW1hbmRdIH0gc2F0aXNmaWVzIElQYXJzZWRDaGF0UmVxdWVzdCk/LnNsYXNoQ29tbWFuZC5jb21tYW5kLFxuXHRcdF0sIFtcblx0XHRcdCdtb2RlbHMnLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpbnB1dCBoZWlnaHQgY2hhbmdlcyB1cGRhdGUgdGhlIGJ1ZGdldCB3aXRob3V0IHJlLWxheWluZyBvdXQgdGhlIGlucHV0JywgKCkgPT4ge1xuXHRcdGNvbnN0IGNhbGxzOiB1bmtub3duW10gPSBbXTtcblx0XHRjb25zdCB0YXJnZXQgPSB7XG5cdFx0XHRzZXRJbnB1dFBhcnRNYXhIZWlnaHRPdmVycmlkZTogKGhlaWdodDogbnVtYmVyIHwgdW5kZWZpbmVkKSA9PiBjYWxscy5wdXNoKFsnc2V0SW5wdXRQYXJ0TWF4SGVpZ2h0T3ZlcnJpZGUnLCBoZWlnaHRdKSxcblx0XHRcdGxheW91dEZvcklucHV0SGVpZ2h0OiAoaGVpZ2h0OiBudW1iZXIsIHdpZHRoOiBudW1iZXIpID0+IGNhbGxzLnB1c2goWydsYXlvdXRGb3JJbnB1dEhlaWdodCcsIGhlaWdodCwgd2lkdGhdKSxcblx0XHR9O1xuXG5cdFx0bGF5b3V0Q2hhdFdpZGdldEZvcklucHV0SGVpZ2h0KHRhcmdldCwgNjAwLCA0MjAsIDcyMCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNhbGxzLCBbXG5cdFx0XHRbJ3NldElucHV0UGFydE1heEhlaWdodE92ZXJyaWRlJywgNjAwXSxcblx0XHRcdFsnbGF5b3V0Rm9ySW5wdXRIZWlnaHQnLCA0MjAsIDcyMF0sXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NhcHR1cmVzIGFuZCByZXN0b3JlcyB0cmFuc2NyaXB0IHNjcm9sbCBzdGF0ZScsICgpID0+IHtcblx0XHRjb25zdCBsaXN0V2lkZ2V0ID0ge1xuXHRcdFx0c2Nyb2xsVG9wOiAyMDAsXG5cdFx0XHRzY3JvbGxIZWlnaHQ6IDEwMDAsXG5cdFx0XHRyZW5kZXJIZWlnaHQ6IDMwMCxcblx0XHRcdGdldCBpc1Njcm9sbGVkVG9Cb3R0b20oKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLnNjcm9sbFRvcCArIHRoaXMucmVuZGVySGVpZ2h0ID49IHRoaXMuc2Nyb2xsSGVpZ2h0IC0gMjtcblx0XHRcdH0sXG5cdFx0XHRzY3JvbGxUb0VuZCgpIHtcblx0XHRcdFx0dGhpcy5zY3JvbGxUb3AgPSB0aGlzLnNjcm9sbEhlaWdodCAtIHRoaXMucmVuZGVySGVpZ2h0O1xuXHRcdFx0fSxcblx0XHR9O1xuXHRcdGNvbnN0IHdpZGdldDogQ2hhdFdpZGdldCA9IE9iamVjdC5hc3NpZ24oT2JqZWN0LmNyZWF0ZShDaGF0V2lkZ2V0LnByb3RvdHlwZSksIHsgbGlzdFdpZGdldCB9KTtcblxuXHRcdGNvbnN0IHNjcm9sbGVkVXAgPSB3aWRnZXQuZ2V0Vmlld1N0YXRlKCk7XG5cdFx0d2lkZ2V0LnJlc3RvcmVWaWV3U3RhdGUoeyBzY3JvbGxUb3A6IDM1MCB9KTtcblx0XHRjb25zdCBsZWdhY3lTY3JvbGxUb3AgPSBsaXN0V2lkZ2V0LnNjcm9sbFRvcDtcblx0XHR3aWRnZXQucmVzdG9yZVZpZXdTdGF0ZSh7IHNjcm9sbFRvcDogMjAwLCBpc0F0Qm90dG9tOiB0cnVlIH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRzY3JvbGxlZFVwLFxuXHRcdFx0bGVnYWN5U2Nyb2xsVG9wLFxuXHRcdFx0Ym90dG9tU2Nyb2xsVG9wOiBsaXN0V2lkZ2V0LnNjcm9sbFRvcCxcblx0XHR9LCB7XG5cdFx0XHRzY3JvbGxlZFVwOiB7IHNjcm9sbFRvcDogMjAwLCBpc0F0Qm90dG9tOiBmYWxzZSB9LFxuXHRcdFx0bGVnYWN5U2Nyb2xsVG9wOiAzNTAsXG5cdFx0XHRib3R0b21TY3JvbGxUb3A6IDcwMCxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncHJvbXB0IHRpbWVsaW5lIHdpZHRoIGZvbGxvd3MgZXhwbGljaXQgd2lkZ2V0IGxheW91dCcsICgpID0+IHtcblx0XHRjb25zdCBvbkRpZExheW91dCA9IG5ldyBFbWl0dGVyPHsgd2lkdGg6IG51bWJlcjsgaGVpZ2h0OiBudW1iZXIgfT4oKTtcblx0XHRjb25zdCBob3N0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0T2JqZWN0LmRlZmluZVByb3BlcnR5KGhvc3QsICdjbGllbnRXaWR0aCcsIHsgdmFsdWU6IDMyMCB9KTtcblx0XHRjb25zdCB3aWR0aHM6IG51bWJlcltdID0gW107XG5cdFx0Y29uc3Qgb2JzZXJ2YXRpb24gPSBvYnNlcnZlUHJvbXB0VGltZWxpbmVIb3N0V2lkdGgoXG5cdFx0XHR7IG9uRGlkTGF5b3V0OiBvbkRpZExheW91dC5ldmVudCB9LFxuXHRcdFx0aG9zdCxcblx0XHRcdHsgc2V0SG9zdFdpZHRoOiB3aWR0aCA9PiB3aWR0aHMucHVzaCh3aWR0aCkgfSxcblx0XHQpO1xuXG5cdFx0b25EaWRMYXlvdXQuZmlyZSh7IHdpZHRoOiA0ODAsIGhlaWdodDogNjAwIH0pO1xuXHRcdG9ic2VydmF0aW9uLmRpc3Bvc2UoKTtcblx0XHRvbkRpZExheW91dC5maXJlKHsgd2lkdGg6IDY0MCwgaGVpZ2h0OiA2MDAgfSk7XG5cdFx0b25EaWRMYXlvdXQuZGlzcG9zZSgpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwod2lkdGhzLCBbMzIwLCA0ODBdKTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ0NoYXRXaWRnZXQgLSBhY2NlcHRBbmRBd2FpdFNlbnRSZXF1ZXN0JywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGZ1bmN0aW9uIHNlbnRSZXN1bHQoKTogQ2hhdFNlbmRSZXN1bHRTZW50IHtcblx0XHRyZXR1cm4geyBraW5kOiAnc2VudCcsIGRhdGE6IHt9IGFzIElDaGF0U2VuZFJlcXVlc3REYXRhIH07XG5cdH1cblxuXHR0ZXN0KCdhbiBpbW1lZGlhdGVseSBzZW50IHJlcXVlc3QgaXMgYWNjZXB0ZWQgYW5kIHJldHVybmVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGxldCBhY2NlcHRlZCA9IDA7XG5cdFx0Y29uc3QgcmVzdWx0ID0gc2VudFJlc3VsdCgpO1xuXG5cdFx0Y29uc3Qgc2VudCA9IGF3YWl0IGFjY2VwdEFuZEF3YWl0U2VudFJlcXVlc3QocmVzdWx0LCAoKSA9PiBhY2NlcHRlZCsrKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBhY2NlcHRlZCwgc2VudCB9LCB7IGFjY2VwdGVkOiAxLCBzZW50OiByZXN1bHQgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2EgcXVldWVkIHJlcXVlc3QgaXMgYWNjZXB0ZWQgYmVmb3JlIHRoZSBxdWV1ZWQgcmVxdWVzdCBzZXR0bGVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGRlZmVycmVkID0gbmV3IERlZmVycmVkUHJvbWlzZTxDaGF0U2VuZFJlc3VsdD4oKTtcblx0XHRsZXQgYWNjZXB0ZWQgPSAwO1xuXG5cdFx0Y29uc3QgcGVuZGluZyA9IGFjY2VwdEFuZEF3YWl0U2VudFJlcXVlc3QoeyBraW5kOiAncXVldWVkJywgcmVxdWVzdElkOiAncXVldWVkLXJlcXVlc3QnLCBkZWZlcnJlZDogZGVmZXJyZWQucCB9LCAoKSA9PiBhY2NlcHRlZCsrKTtcblx0XHQvLyBUaGUgcXVldWVkIHJlcXVlc3QgaGFzIG5vdCBydW4geWV0LCBzbyBgcGVuZGluZ2AgaXMgc3RpbGwgdW5yZXNvbHZlZCBoZXJlLlxuXHRcdGNvbnN0IGFjY2VwdGVkV2hpbGVRdWV1ZWQgPSBhY2NlcHRlZCA9PT0gMTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IHNlbnRSZXN1bHQoKTtcblx0XHRhd2FpdCBkZWZlcnJlZC5jb21wbGV0ZShyZXN1bHQpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IGFjY2VwdGVkV2hpbGVRdWV1ZWQsIGFjY2VwdGVkLCBzZW50OiBhd2FpdCBwZW5kaW5nIH0sIHtcblx0XHRcdGFjY2VwdGVkV2hpbGVRdWV1ZWQ6IHRydWUsXG5cdFx0XHRhY2NlcHRlZDogMSxcblx0XHRcdHNlbnQ6IHJlc3VsdCxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnYSByZWplY3RlZCByZXF1ZXN0IGlzIG5ldmVyIGFjY2VwdGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGxldCBhY2NlcHRlZCA9IDA7XG5cblx0XHRjb25zdCBzZW50ID0gYXdhaXQgYWNjZXB0QW5kQXdhaXRTZW50UmVxdWVzdCh7IGtpbmQ6ICdyZWplY3RlZCcsIHJlYXNvbjogJ0VtcHR5IG1lc3NhZ2UnIH0sICgpID0+IGFjY2VwdGVkKyspO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IGFjY2VwdGVkLCBzZW50IH0sIHsgYWNjZXB0ZWQ6IDAsIHNlbnQ6IHVuZGVmaW5lZCB9KTtcblx0fSk7XG5cblx0dGVzdCgnYSBxdWV1ZWQgcmVxdWVzdCB0aGF0IGlzIHJlamVjdGVkIHdoZW4gaXQgcnVucyBzdGF5cyBhY2NlcHRlZCBidXQgaXMgbm90IHNlbnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZGVmZXJyZWQgPSBuZXcgRGVmZXJyZWRQcm9taXNlPENoYXRTZW5kUmVzdWx0PigpO1xuXHRcdGxldCBhY2NlcHRlZCA9IDA7XG5cblx0XHRjb25zdCBwZW5kaW5nID0gYWNjZXB0QW5kQXdhaXRTZW50UmVxdWVzdCh7IGtpbmQ6ICdxdWV1ZWQnLCByZXF1ZXN0SWQ6ICdxdWV1ZWQtcmVxdWVzdCcsIGRlZmVycmVkOiBkZWZlcnJlZC5wIH0sICgpID0+IGFjY2VwdGVkKyspO1xuXHRcdGF3YWl0IGRlZmVycmVkLmNvbXBsZXRlKHsga2luZDogJ3JlamVjdGVkJywgcmVhc29uOiAnU2Vzc2lvbiBpcyByZWFkLW9ubHknIH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IGFjY2VwdGVkLCBzZW50OiBhd2FpdCBwZW5kaW5nIH0sIHsgYWNjZXB0ZWQ6IDEsIHNlbnQ6IHVuZGVmaW5lZCB9KTtcblx0fSk7XG5cblx0dGVzdCgnYWNjZXB0aW5nIGlzIG9wdGlvbmFsJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IHNlbnRSZXN1bHQoKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCBhY2NlcHRBbmRBd2FpdFNlbnRSZXF1ZXN0KHJlc3VsdCksIHJlc3VsdCk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsYUFBYTtBQUN0QixTQUFTLGdDQUFnQztBQUN6QyxTQUFTLGtCQUFrQjtBQUUzQixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLDJCQUEyQixZQUFZLG9DQUFvQyxnQ0FBZ0MsdUJBQXVCLG1CQUFtQiw2QkFBNkI7QUFFM0wsU0FBUyxtQkFBbUIseUJBQXlCO0FBQ3JELFNBQVMsNkJBQTZCLDJCQUErQztBQUNyRixTQUFTLHNDQUFzQztBQUUvQyxNQUFNLGNBQWMsTUFBTTtBQUV6QixRQUFNLFFBQVEsd0NBQXdDO0FBQUEsRUFFdEQsTUFBTSwrQkFBK0Isa0JBQWtCO0FBQUEsSUFBdkQ7QUFBQTtBQUNDLFdBQVMsZUFBdUQsQ0FBQztBQUFBO0FBQUEsSUFFakUsTUFBZSxRQUFRLFNBQStEO0FBQ3JGLFdBQUssYUFBYSxLQUFLLE9BQU87QUFDOUIsYUFBTyxFQUFFLFNBQVMsTUFBTSxTQUFTLENBQUMsRUFBRTtBQUFBLElBQ3JDO0FBQUEsRUFDRDtB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
