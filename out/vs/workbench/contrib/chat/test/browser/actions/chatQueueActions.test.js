import assert from "assert";
import { getActiveDocument } from "../../../../../../base/browser/dom.js";
import { DisposableStore } from "../../../../../../base/common/lifecycle.js";
import { constObservable } from "../../../../../../base/common/observable.js";
import { OS } from "../../../../../../base/common/platform.js";
import { URI } from "../../../../../../base/common/uri.js";
import { upcastPartial } from "../../../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { TestConfigurationService } from "../../../../../../platform/configuration/test/common/testConfigurationService.js";
import { ContextKeyService } from "../../../../../../platform/contextkey/browser/contextKeyService.js";
import { TestInstantiationService } from "../../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { KeybindingsRegistry } from "../../../../../../platform/keybinding/common/keybindingsRegistry.js";
import { KeybindingResolver } from "../../../../../../platform/keybinding/common/keybindingResolver.js";
import { ResolvedKeybindingItem } from "../../../../../../platform/keybinding/common/resolvedKeybindingItem.js";
import { USLayoutResolvedKeybinding } from "../../../../../../platform/keybinding/common/usLayoutResolvedKeybinding.js";
import { ILogService, NullLogService } from "../../../../../../platform/log/common/log.js";
import { INotificationService } from "../../../../../../platform/notification/common/notification.js";
import { TestNotificationService } from "../../../../../../platform/notification/test/common/testNotificationService.js";
import { IChatWidgetService } from "../../../browser/chat.js";
import { ChatAskInSideChatAction, ChatQueueMessageAction, ChatSteerWithMessageAction, registerChatQueueActions } from "../../../browser/actions/chatQueueActions.js";
import { ChatContextKeys } from "../../../common/actions/chatContextKeys.js";
import { IChatSideChatService } from "../../../common/chatSideChatService.js";
import { ChatConfiguration } from "../../../common/constants.js";
import { ChatRequestQueueKind } from "../../../common/chatService/chatService.js";
registerChatQueueActions();
suite("Queue/Steer keybinding resolution", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function buildResolverForCommands(commandIds) {
    const items = [];
    for (const item of KeybindingsRegistry.getDefaultKeybindingsForOS(OS)) {
      if (!item.command || !commandIds.includes(item.command) || !item.keybinding) {
        continue;
      }
      const resolved = USLayoutResolvedKeybinding.resolveKeybinding(item.keybinding, OS)[0];
      items.push(new ResolvedKeybindingItem(resolved, item.command, item.commandArgs, item.when ?? void 0, true, null, false));
    }
    return new KeybindingResolver(items, [], () => {
    });
  }
  function lookupForConfig(defaultAction) {
    const config = new TestConfigurationService({ [ChatConfiguration.RequestQueueingDefaultAction]: defaultAction });
    const ctxService = new ContextKeyService(config);
    const overlay = ctxService.createOverlay([
      [ChatContextKeys.inputHasText.key, true],
      [ChatContextKeys.inChatInput.key, true],
      [ChatContextKeys.requestInProgress.key, true]
    ]);
    const resolver = buildResolverForCommands([ChatQueueMessageAction.ID, ChatSteerWithMessageAction.ID]);
    return {
      result: {
        queue: resolver.lookupPrimaryKeybinding(ChatQueueMessageAction.ID, overlay, true)?.resolvedKeybinding?.getDispatchChords()[0] ?? null,
        steer: resolver.lookupPrimaryKeybinding(ChatSteerWithMessageAction.ID, overlay, true)?.resolvedKeybinding?.getDispatchChords()[0] ?? null
      },
      dispose: () => ctxService.dispose()
    };
  }
  test("with default=steer, Enter steers and Alt+Enter queues", () => {
    const { result, dispose } = lookupForConfig("steer");
    try {
      assert.deepStrictEqual(result, { queue: "alt+Enter", steer: "Enter" });
    } finally {
      dispose();
    }
  });
  test("with default=queue, Enter queues and Alt+Enter steers", () => {
    const { result, dispose } = lookupForConfig("queue");
    try {
      assert.deepStrictEqual(result, { queue: "Enter", steer: "alt+Enter" });
    } finally {
      dispose();
    }
  });
});
suite("ChatSteerWithMessageAction", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  function run(isHiddenFromTranscript) {
    const store = disposables.add(new DisposableStore());
    const instantiationService = store.add(new TestInstantiationService());
    let queue;
    instantiationService.stub(IChatWidgetService, upcastPartial({
      lastFocusedWidget: upcastPartial({
        getInput: () => "follow up",
        acceptInput: async (_query, options) => {
          queue = options?.queue;
          return void 0;
        },
        viewModel: upcastPartial({
          model: upcastPartial({
            requestInProgress: constObservable(true),
            lastRequest: upcastPartial({ isHiddenFromTranscript })
          })
        })
      })
    }));
    const action = new ChatSteerWithMessageAction();
    instantiationService.invokeFunction((accessor) => action.run(accessor));
    return queue;
  }
  test("queues behind a hidden active request instead of steering it", () => {
    assert.deepStrictEqual({
      hidden: run(true),
      visible: run(false)
    }, {
      hidden: ChatRequestQueueKind.Queued,
      visible: ChatRequestQueueKind.Steering
    });
  });
});
suite("ChatAskInSideChatAction", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  function setup(options = {}) {
    const store = disposables.add(new DisposableStore());
    const instantiationService = store.add(new TestInstantiationService());
    const sessionResource = URI.parse("test:///chat/source");
    let input = "what about this?";
    instantiationService.stub(IChatWidgetService, upcastPartial({
      lastFocusedWidget: upcastPartial({
        domNode: getActiveDocument().createElement("div"),
        inputEditor: { getDomNode: () => null },
        getInput: () => input,
        setInput: (value) => {
          input = value ?? "";
        },
        viewModel: upcastPartial({ model: upcastPartial({ sessionResource }) })
      })
    }));
    const asked = [];
    instantiationService.stub(IChatSideChatService, upcastPartial({
      canAskInSideChat: () => options.canAsk ?? true,
      askInSideChat: async (resource, query) => {
        if (options.askFails) {
          asked.push("failed");
          throw new Error("nope");
        }
        asked.push(`${resource.toString()}:${query}`);
      }
    }));
    instantiationService.stub(INotificationService, new TestNotificationService());
    instantiationService.stub(ILogService, new NullLogService());
    const action = new ChatAskInSideChatAction();
    return {
      run: () => instantiationService.invokeFunction((accessor) => action.run(accessor)),
      asked,
      sessionResource,
      getInput: () => input
    };
  }
  test("delegates the composed message to the side chat service and clears the input", async () => {
    const { run, asked, sessionResource, getInput } = setup();
    await run();
    assert.deepStrictEqual({ asked, input: getInput() }, {
      asked: [`${sessionResource.toString()}:what about this?`],
      input: ""
    });
  });
  test("restores the composed message when the side chat cannot be created", async () => {
    const { run, asked, getInput } = setup({ askFails: true });
    await run();
    assert.deepStrictEqual({ asked, input: getInput() }, {
      asked: ["failed"],
      input: "what about this?"
    });
  });
  test("does nothing but warn when no provider supports the conversation", async () => {
    const { run, asked, getInput } = setup({ canAsk: false });
    await run();
    assert.deepStrictEqual({ asked, input: getInput() }, {
      asked: [],
      input: "what about this?"
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGJyb3dzZXJcXGFjdGlvbnNcXGNoYXRRdWV1ZUFjdGlvbnMudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGdldEFjdGl2ZURvY3VtZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgY29uc3RPYnNlcnZhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBPUyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyB1cGNhc3RQYXJ0aWFsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi9tb2NrLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vdGVzdC9jb21tb24vdGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9icm93c2VyL2NvbnRleHRLZXlTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vdGVzdC9jb21tb24vaW5zdGFudGlhdGlvblNlcnZpY2VNb2NrLmpzJztcbmltcG9ydCB7IEtleWJpbmRpbmdzUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nc1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IEtleWJpbmRpbmdSZXNvbHZlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmdSZXNvbHZlci5qcyc7XG5pbXBvcnQgeyBSZXNvbHZlZEtleWJpbmRpbmdJdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24vcmVzb2x2ZWRLZXliaW5kaW5nSXRlbS5qcyc7XG5pbXBvcnQgeyBVU0xheW91dFJlc29sdmVkS2V5YmluZGluZyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL3VzTGF5b3V0UmVzb2x2ZWRLZXliaW5kaW5nLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlLCBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgVGVzdE5vdGlmaWNhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vdGVzdC9jb21tb24vdGVzdE5vdGlmaWNhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXRXaWRnZXQsIElDaGF0V2lkZ2V0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvY2hhdC5qcyc7XG5pbXBvcnQgeyBDaGF0QXNrSW5TaWRlQ2hhdEFjdGlvbiwgQ2hhdFF1ZXVlTWVzc2FnZUFjdGlvbiwgQ2hhdFN0ZWVyV2l0aE1lc3NhZ2VBY3Rpb24sIHJlZ2lzdGVyQ2hhdFF1ZXVlQWN0aW9ucyB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvYWN0aW9ucy9jaGF0UXVldWVBY3Rpb25zLmpzJztcbmltcG9ydCB7IENoYXRDb250ZXh0S2V5cyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9hY3Rpb25zL2NoYXRDb250ZXh0S2V5cy5qcyc7XG5pbXBvcnQgeyBJQ2hhdFNpZGVDaGF0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jaGF0U2lkZUNoYXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRDb25maWd1cmF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBJQ2hhdE1vZGVsLCBJQ2hhdFJlcXVlc3RNb2RlbCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC9jaGF0TW9kZWwuanMnO1xuaW1wb3J0IHsgSUNoYXRWaWV3TW9kZWwgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbW9kZWwvY2hhdFZpZXdNb2RlbC5qcyc7XG5pbXBvcnQgeyBDaGF0UmVxdWVzdFF1ZXVlS2luZCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jaGF0U2VydmljZS9jaGF0U2VydmljZS5qcyc7XG5cbi8vIFJlZ2lzdGVyIGFjdGlvbnMgb25jZSBzbyB0aGUga2V5YmluZGluZ3MgYXBwZWFyIGluIEtleWJpbmRpbmdzUmVnaXN0cnkuXG5yZWdpc3RlckNoYXRRdWV1ZUFjdGlvbnMoKTtcblxuc3VpdGUoJ1F1ZXVlL1N0ZWVyIGtleWJpbmRpbmcgcmVzb2x1dGlvbicsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRmdW5jdGlvbiBidWlsZFJlc29sdmVyRm9yQ29tbWFuZHMoY29tbWFuZElkczogc3RyaW5nW10pOiBLZXliaW5kaW5nUmVzb2x2ZXIge1xuXHRcdGNvbnN0IGl0ZW1zOiBSZXNvbHZlZEtleWJpbmRpbmdJdGVtW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGl0ZW0gb2YgS2V5YmluZGluZ3NSZWdpc3RyeS5nZXREZWZhdWx0S2V5YmluZGluZ3NGb3JPUyhPUykpIHtcblx0XHRcdGlmICghaXRlbS5jb21tYW5kIHx8ICFjb21tYW5kSWRzLmluY2x1ZGVzKGl0ZW0uY29tbWFuZCkgfHwgIWl0ZW0ua2V5YmluZGluZykge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHJlc29sdmVkID0gVVNMYXlvdXRSZXNvbHZlZEtleWJpbmRpbmcucmVzb2x2ZUtleWJpbmRpbmcoaXRlbS5rZXliaW5kaW5nLCBPUylbMF07XG5cdFx0XHRpdGVtcy5wdXNoKG5ldyBSZXNvbHZlZEtleWJpbmRpbmdJdGVtKHJlc29sdmVkLCBpdGVtLmNvbW1hbmQsIGl0ZW0uY29tbWFuZEFyZ3MsIGl0ZW0ud2hlbiA/PyB1bmRlZmluZWQsIHRydWUsIG51bGwsIGZhbHNlKSk7XG5cdFx0fVxuXHRcdHJldHVybiBuZXcgS2V5YmluZGluZ1Jlc29sdmVyKGl0ZW1zLCBbXSwgKCkgPT4geyB9KTtcblx0fVxuXG5cdGZ1bmN0aW9uIGxvb2t1cEZvckNvbmZpZyhkZWZhdWx0QWN0aW9uOiAnc3RlZXInIHwgJ3F1ZXVlJykge1xuXHRcdGNvbnN0IGNvbmZpZyA9IG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoeyBbQ2hhdENvbmZpZ3VyYXRpb24uUmVxdWVzdFF1ZXVlaW5nRGVmYXVsdEFjdGlvbl06IGRlZmF1bHRBY3Rpb24gfSk7XG5cdFx0Y29uc3QgY3R4U2VydmljZSA9IG5ldyBDb250ZXh0S2V5U2VydmljZShjb25maWcpO1xuXHRcdC8vIFNpbXVsYXRlIHRoZSBjaGF0IGlucHV0IGJlaW5nIGZvY3VzZWQgd2l0aCBhIHJlcXVlc3QgaW4gcHJvZ3Jlc3MsIGxpa2UgdGhlIHBpY2tlciBkb2VzLlxuXHRcdGNvbnN0IG92ZXJsYXkgPSBjdHhTZXJ2aWNlLmNyZWF0ZU92ZXJsYXkoW1xuXHRcdFx0W0NoYXRDb250ZXh0S2V5cy5pbnB1dEhhc1RleHQua2V5LCB0cnVlXSxcblx0XHRcdFtDaGF0Q29udGV4dEtleXMuaW5DaGF0SW5wdXQua2V5LCB0cnVlXSxcblx0XHRcdFtDaGF0Q29udGV4dEtleXMucmVxdWVzdEluUHJvZ3Jlc3Mua2V5LCB0cnVlXSxcblx0XHRdKTtcblx0XHRjb25zdCByZXNvbHZlciA9IGJ1aWxkUmVzb2x2ZXJGb3JDb21tYW5kcyhbQ2hhdFF1ZXVlTWVzc2FnZUFjdGlvbi5JRCwgQ2hhdFN0ZWVyV2l0aE1lc3NhZ2VBY3Rpb24uSURdKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0cmVzdWx0OiB7XG5cdFx0XHRcdHF1ZXVlOiByZXNvbHZlci5sb29rdXBQcmltYXJ5S2V5YmluZGluZyhDaGF0UXVldWVNZXNzYWdlQWN0aW9uLklELCBvdmVybGF5LCB0cnVlKT8ucmVzb2x2ZWRLZXliaW5kaW5nPy5nZXREaXNwYXRjaENob3JkcygpWzBdID8/IG51bGwsXG5cdFx0XHRcdHN0ZWVyOiByZXNvbHZlci5sb29rdXBQcmltYXJ5S2V5YmluZGluZyhDaGF0U3RlZXJXaXRoTWVzc2FnZUFjdGlvbi5JRCwgb3ZlcmxheSwgdHJ1ZSk/LnJlc29sdmVkS2V5YmluZGluZz8uZ2V0RGlzcGF0Y2hDaG9yZHMoKVswXSA/PyBudWxsLFxuXHRcdFx0fSxcblx0XHRcdGRpc3Bvc2U6ICgpID0+IGN0eFNlcnZpY2UuZGlzcG9zZSgpLFxuXHRcdH07XG5cdH1cblxuXHR0ZXN0KCd3aXRoIGRlZmF1bHQ9c3RlZXIsIEVudGVyIHN0ZWVycyBhbmQgQWx0K0VudGVyIHF1ZXVlcycsICgpID0+IHtcblx0XHRjb25zdCB7IHJlc3VsdCwgZGlzcG9zZSB9ID0gbG9va3VwRm9yQ29uZmlnKCdzdGVlcicpO1xuXHRcdHRyeSB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgeyBxdWV1ZTogJ2FsdCtFbnRlcicsIHN0ZWVyOiAnRW50ZXInIH0pO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRkaXNwb3NlKCk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCd3aXRoIGRlZmF1bHQ9cXVldWUsIEVudGVyIHF1ZXVlcyBhbmQgQWx0K0VudGVyIHN0ZWVycycsICgpID0+IHtcblx0XHRjb25zdCB7IHJlc3VsdCwgZGlzcG9zZSB9ID0gbG9va3VwRm9yQ29uZmlnKCdxdWV1ZScpO1xuXHRcdHRyeSB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgeyBxdWV1ZTogJ0VudGVyJywgc3RlZXI6ICdhbHQrRW50ZXInIH0pO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRkaXNwb3NlKCk7XG5cdFx0fVxuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnQ2hhdFN0ZWVyV2l0aE1lc3NhZ2VBY3Rpb24nLCAoKSA9PiB7XG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0ZnVuY3Rpb24gcnVuKGlzSGlkZGVuRnJvbVRyYW5zY3JpcHQ6IGJvb2xlYW4pOiBDaGF0UmVxdWVzdFF1ZXVlS2luZCB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3Qgc3RvcmUgPSBkaXNwb3NhYmxlcy5hZGQobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IHN0b3JlLmFkZChuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCkpO1xuXHRcdGxldCBxdWV1ZTogQ2hhdFJlcXVlc3RRdWV1ZUtpbmQgfCB1bmRlZmluZWQ7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdFdpZGdldFNlcnZpY2UsIHVwY2FzdFBhcnRpYWw8SUNoYXRXaWRnZXRTZXJ2aWNlPih7XG5cdFx0XHRsYXN0Rm9jdXNlZFdpZGdldDogdXBjYXN0UGFydGlhbDxJQ2hhdFdpZGdldD4oe1xuXHRcdFx0XHRnZXRJbnB1dDogKCkgPT4gJ2ZvbGxvdyB1cCcsXG5cdFx0XHRcdGFjY2VwdElucHV0OiBhc3luYyAoX3F1ZXJ5LCBvcHRpb25zKSA9PiB7XG5cdFx0XHRcdFx0cXVldWUgPSBvcHRpb25zPy5xdWV1ZTtcblx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHR2aWV3TW9kZWw6IHVwY2FzdFBhcnRpYWw8SUNoYXRWaWV3TW9kZWw+KHtcblx0XHRcdFx0XHRtb2RlbDogdXBjYXN0UGFydGlhbDxJQ2hhdE1vZGVsPih7XG5cdFx0XHRcdFx0XHRyZXF1ZXN0SW5Qcm9ncmVzczogY29uc3RPYnNlcnZhYmxlKHRydWUpLFxuXHRcdFx0XHRcdFx0bGFzdFJlcXVlc3Q6IHVwY2FzdFBhcnRpYWw8SUNoYXRSZXF1ZXN0TW9kZWw+KHsgaXNIaWRkZW5Gcm9tVHJhbnNjcmlwdCB9KSxcblx0XHRcdFx0XHR9KSxcblx0XHRcdFx0fSksXG5cdFx0XHR9KSxcblx0XHR9KSk7XG5cblx0XHRjb25zdCBhY3Rpb24gPSBuZXcgQ2hhdFN0ZWVyV2l0aE1lc3NhZ2VBY3Rpb24oKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihhY2Nlc3NvciA9PiBhY3Rpb24ucnVuKGFjY2Vzc29yKSk7XG5cdFx0cmV0dXJuIHF1ZXVlO1xuXHR9XG5cblx0dGVzdCgncXVldWVzIGJlaGluZCBhIGhpZGRlbiBhY3RpdmUgcmVxdWVzdCBpbnN0ZWFkIG9mIHN0ZWVyaW5nIGl0JywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0aGlkZGVuOiBydW4odHJ1ZSksXG5cdFx0XHR2aXNpYmxlOiBydW4oZmFsc2UpLFxuXHRcdH0sIHtcblx0XHRcdGhpZGRlbjogQ2hhdFJlcXVlc3RRdWV1ZUtpbmQuUXVldWVkLFxuXHRcdFx0dmlzaWJsZTogQ2hhdFJlcXVlc3RRdWV1ZUtpbmQuU3RlZXJpbmcsXG5cdFx0fSk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdDaGF0QXNrSW5TaWRlQ2hhdEFjdGlvbicsICgpID0+IHtcblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRmdW5jdGlvbiBzZXR1cChvcHRpb25zOiB7IGNhbkFzaz86IGJvb2xlYW47IGFza0ZhaWxzPzogYm9vbGVhbiB9ID0ge30pIHtcblx0XHRjb25zdCBzdG9yZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gc3RvcmUuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gVVJJLnBhcnNlKCd0ZXN0Oi8vL2NoYXQvc291cmNlJyk7XG5cblx0XHRsZXQgaW5wdXQgPSAnd2hhdCBhYm91dCB0aGlzPyc7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdFdpZGdldFNlcnZpY2UsIHVwY2FzdFBhcnRpYWw8SUNoYXRXaWRnZXRTZXJ2aWNlPih7XG5cdFx0XHRsYXN0Rm9jdXNlZFdpZGdldDogdXBjYXN0UGFydGlhbDxJQ2hhdFdpZGdldD4oe1xuXHRcdFx0XHRkb21Ob2RlOiBnZXRBY3RpdmVEb2N1bWVudCgpLmNyZWF0ZUVsZW1lbnQoJ2RpdicpLFxuXHRcdFx0XHRpbnB1dEVkaXRvcjogeyBnZXREb21Ob2RlOiAoKSA9PiBudWxsIH0gYXMgSUNvZGVFZGl0b3IsXG5cdFx0XHRcdGdldElucHV0OiAoKSA9PiBpbnB1dCxcblx0XHRcdFx0c2V0SW5wdXQ6ICh2YWx1ZT86IHN0cmluZykgPT4geyBpbnB1dCA9IHZhbHVlID8/ICcnOyB9LFxuXHRcdFx0XHR2aWV3TW9kZWw6IHVwY2FzdFBhcnRpYWw8SUNoYXRWaWV3TW9kZWw+KHsgbW9kZWw6IHVwY2FzdFBhcnRpYWw8SUNoYXRNb2RlbD4oeyBzZXNzaW9uUmVzb3VyY2UgfSkgfSksXG5cdFx0XHR9KSxcblx0XHR9KSk7XG5cblx0XHRjb25zdCBhc2tlZDogc3RyaW5nW10gPSBbXTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0U2lkZUNoYXRTZXJ2aWNlLCB1cGNhc3RQYXJ0aWFsPElDaGF0U2lkZUNoYXRTZXJ2aWNlPih7XG5cdFx0XHRjYW5Bc2tJblNpZGVDaGF0OiAoKSA9PiBvcHRpb25zLmNhbkFzayA/PyB0cnVlLFxuXHRcdFx0YXNrSW5TaWRlQ2hhdDogYXN5bmMgKHJlc291cmNlLCBxdWVyeSkgPT4ge1xuXHRcdFx0XHRpZiAob3B0aW9ucy5hc2tGYWlscykge1xuXHRcdFx0XHRcdGFza2VkLnB1c2goJ2ZhaWxlZCcpO1xuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcignbm9wZScpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGFza2VkLnB1c2goYCR7cmVzb3VyY2UudG9TdHJpbmcoKX06JHtxdWVyeX1gKTtcblx0XHRcdH0sXG5cdFx0fSkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSU5vdGlmaWNhdGlvblNlcnZpY2UsIG5ldyBUZXN0Tm90aWZpY2F0aW9uU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMb2dTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cblx0XHRjb25zdCBhY3Rpb24gPSBuZXcgQ2hhdEFza0luU2lkZUNoYXRBY3Rpb24oKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0cnVuOiAoKSA9PiBpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihhY2Nlc3NvciA9PiBhY3Rpb24ucnVuKGFjY2Vzc29yKSksXG5cdFx0XHRhc2tlZCxcblx0XHRcdHNlc3Npb25SZXNvdXJjZSxcblx0XHRcdGdldElucHV0OiAoKSA9PiBpbnB1dCxcblx0XHR9O1xuXHR9XG5cblx0dGVzdCgnZGVsZWdhdGVzIHRoZSBjb21wb3NlZCBtZXNzYWdlIHRvIHRoZSBzaWRlIGNoYXQgc2VydmljZSBhbmQgY2xlYXJzIHRoZSBpbnB1dCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IHJ1biwgYXNrZWQsIHNlc3Npb25SZXNvdXJjZSwgZ2V0SW5wdXQgfSA9IHNldHVwKCk7XG5cblx0XHRhd2FpdCBydW4oKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBhc2tlZCwgaW5wdXQ6IGdldElucHV0KCkgfSwge1xuXHRcdFx0YXNrZWQ6IFtgJHtzZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKX06d2hhdCBhYm91dCB0aGlzP2BdLFxuXHRcdFx0aW5wdXQ6ICcnLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXN0b3JlcyB0aGUgY29tcG9zZWQgbWVzc2FnZSB3aGVuIHRoZSBzaWRlIGNoYXQgY2Fubm90IGJlIGNyZWF0ZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBydW4sIGFza2VkLCBnZXRJbnB1dCB9ID0gc2V0dXAoeyBhc2tGYWlsczogdHJ1ZSB9KTtcblxuXHRcdGF3YWl0IHJ1bigpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IGFza2VkLCBpbnB1dDogZ2V0SW5wdXQoKSB9LCB7XG5cdFx0XHRhc2tlZDogWydmYWlsZWQnXSxcblx0XHRcdGlucHV0OiAnd2hhdCBhYm91dCB0aGlzPycsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90aGluZyBidXQgd2FybiB3aGVuIG5vIHByb3ZpZGVyIHN1cHBvcnRzIHRoZSBjb252ZXJzYXRpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBydW4sIGFza2VkLCBnZXRJbnB1dCB9ID0gc2V0dXAoeyBjYW5Bc2s6IGZhbHNlIH0pO1xuXG5cdFx0YXdhaXQgcnVuKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgYXNrZWQsIGlucHV0OiBnZXRJbnB1dCgpIH0sIHtcblx0XHRcdGFza2VkOiBbXSxcblx0XHRcdGlucHV0OiAnd2hhdCBhYm91dCB0aGlzPycsXG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxVQUFVO0FBQ25CLFNBQVMsV0FBVztBQUNwQixTQUFTLHFCQUFxQjtBQUM5QixTQUFTLCtDQUErQztBQUV4RCxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLGtDQUFrQztBQUMzQyxTQUFTLGFBQWEsc0JBQXNCO0FBQzVD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
