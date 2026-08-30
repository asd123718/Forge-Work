import assert from "assert";
import { timeout } from "../../../../../base/common/async.js";
import { Emitter, Event } from "../../../../../base/common/event.js";
import { DisposableStore, toDisposable } from "../../../../../base/common/lifecycle.js";
import { constObservable, observableValue } from "../../../../../base/common/observable.js";
import { extUri } from "../../../../../base/common/resources.js";
import { URI } from "../../../../../base/common/uri.js";
import { upcastPartial } from "../../../../../base/test/common/mock.js";
import { runWithFakedTimers } from "../../../../../base/test/common/timeTravelScheduler.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { TestInstantiationService } from "../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { IUriIdentityService } from "../../../../../platform/uriIdentity/common/uriIdentity.js";
import { IChatWidgetService } from "../../../../../workbench/contrib/chat/browser/chat.js";
import { IChatService } from "../../../../../workbench/contrib/chat/common/chatService/chatService.js";
import { IChatSideChatService } from "../../../../../workbench/contrib/chat/common/chatSideChatService.js";
import { IWorkbenchEnvironmentService } from "../../../../../workbench/services/environment/common/environmentService.js";
import { SessionsSideChatProviderContribution } from "../../browser/sideChatProvider.contribution.js";
import { ISessionsPartService } from "../../../../services/sessions/browser/sessionsPartService.js";
import { ISessionsService } from "../../../../services/sessions/browser/sessionsService.js";
import { ChatOriginKind, SessionStatus } from "../../../../services/sessions/common/session.js";
import { ISessionsManagementService } from "../../../../services/sessions/common/sessionsManagement.js";
suite("SessionsSideChatProviderContribution", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  const sourceChat = upcastPartial({ resource: URI.parse("test:///chat/source"), title: constObservable("Source Chat") });
  const sideChat = upcastPartial({ resource: URI.parse("test:///chat/side") });
  function setup(options = {}) {
    const store = disposables.add(new DisposableStore());
    const instantiationService = store.add(new TestInstantiationService());
    const chat = options.chat ?? sourceChat;
    const parentChat = options.parentChat ?? sourceChat;
    const session = upcastPartial({
      sessionId: "session",
      resource: URI.parse("test:///session"),
      status: constObservable(options.status ?? SessionStatus.Completed),
      isArchived: constObservable(options.isArchived ?? false),
      capabilities: constObservable({ supportsMultipleChats: true, supportsSideChat: options.supportsSideChat ?? true }),
      chats: constObservable([parentChat, chat])
    });
    let registered;
    instantiationService.stub(IChatSideChatService, upcastPartial({
      registerProvider: (provider) => {
        registered = provider;
        return toDisposable(() => {
          registered = void 0;
        });
      }
    }));
    instantiationService.stub(IChatService, upcastPartial({
      getSession: () => upcastPartial({
        getRequests: () => options.hasTurn ?? true ? [upcastPartial({ id: "turn-1" })] : []
      })
    }));
    const callOrder = [];
    instantiationService.stub(ISessionsManagementService, upcastPartial({
      getSessionForChatResource: (resource) => {
        const resolvedChat = [parentChat, chat].find((candidate) => extUri.isEqual(candidate.resource, resource));
        return resolvedChat ? { session, chat: resolvedChat } : void 0;
      },
      createSideChatInSession: async (_session, _sourceChat, turnId, selection) => {
        callOrder.push(`create:${turnId}:${selection?.text ?? ""}`);
        return sideChat;
      },
      sendRequest: async (_session, chat2, requestOptions) => {
        callOrder.push(`send:${chat2.resource.toString()}:${requestOptions.query}`);
      }
    }));
    instantiationService.stub(ISessionsService, upcastPartial({
      visibleSessions: constObservable([session]),
      openChat: async (_session, chatUri) => {
        callOrder.push(`open:${chatUri.toString()}`);
        options.onOpenChat?.(callOrder);
      }
    }));
    instantiationService.stub(ISessionsPartService, upcastPartial({
      getSessionView: () => void 0
    }));
    instantiationService.stub(IChatWidgetService, upcastPartial({
      getWidgetBySessionResource: () => options.widgetFactory?.(callOrder) ?? options.widget
    }));
    instantiationService.stub(IUriIdentityService, upcastPartial({ extUri }));
    instantiationService.stub(IWorkbenchEnvironmentService, upcastPartial({
      isSessionsWindow: options.isSessionsWindow ?? true
    }));
    store.add(instantiationService.createInstance(SessionsSideChatProviderContribution));
    return { provider: () => registered, callOrder };
  }
  test("registers a provider that branches, opens, then sends on the side chat", async () => {
    const { provider, callOrder } = setup();
    await provider().askInSideChat(sourceChat.resource, "what about this?", { text: "selected text" });
    assert.deepStrictEqual(callOrder, [
      "create:turn-1:selected text",
      `open:${sideChat.resource.toString()}`,
      `send:${sideChat.resource.toString()}:what about this?`
    ]);
  });
  test("reports capability only for conversations that can actually branch", () => {
    const capability = (options) => {
      const { provider } = setup(options);
      return provider().canAskInSideChat(sourceChat.resource);
    };
    assert.deepStrictEqual({
      supported: capability({}),
      unknownChat: (() => setup({}).provider().canAskInSideChat(URI.parse("test:///chat/other")))(),
      untitled: capability({ status: SessionStatus.Untitled }),
      archived: capability({ isArchived: true }),
      noSideChatSupport: capability({ supportsSideChat: false }),
      noTurnYet: capability({ hasTurn: false })
    }, {
      supported: true,
      unknownChat: false,
      untitled: false,
      archived: false,
      noSideChatSupport: false,
      noTurnYet: false
    });
  });
  test("does not register outside the Agents window", () => {
    const { provider } = setup({ isSessionsWindow: false });
    assert.strictEqual(provider(), void 0);
  });
  test("observes the source metadata for a side chat", () => {
    const parentChat = upcastPartial({
      resource: sourceChat.resource,
      title: constObservable("Source Chat")
    });
    const chat = upcastPartial({
      resource: sideChat.resource,
      origin: {
        kind: ChatOriginKind.SideChat,
        parentChat: sourceChat.resource,
        turnId: "turn-1",
        selection: { text: "selected text" }
      }
    });
    const { provider } = setup({ chat, parentChat });
    assert.deepStrictEqual(provider().observeSideChatOrigin(sideChat.resource).get(), {
      sourceSessionResource: sourceChat.resource,
      sourceTurnId: "turn-1",
      sourceTitle: "Source Chat",
      selection: { text: "selected text" }
    });
  });
  test("returns undefined for chats without a complete side-chat origin", () => {
    const origin = (chat) => setup({ chat }).provider().observeSideChatOrigin(sideChat.resource).get();
    assert.deepStrictEqual({
      noOrigin: origin(upcastPartial({ resource: sideChat.resource })),
      user: origin(upcastPartial({ resource: sideChat.resource, origin: { kind: ChatOriginKind.User } })),
      tool: origin(upcastPartial({ resource: sideChat.resource, origin: { kind: ChatOriginKind.Tool } })),
      missingTurn: origin(upcastPartial({ resource: sideChat.resource, origin: { kind: ChatOriginKind.SideChat, parentChat: sourceChat.resource } }))
    }, {
      noOrigin: void 0,
      user: void 0,
      tool: void 0,
      missingTurn: void 0
    });
  });
  test("observes a side chat without a selection", () => {
    const chat = upcastPartial({
      resource: sideChat.resource,
      origin: { kind: ChatOriginKind.SideChat, parentChat: sourceChat.resource, turnId: "turn-1" }
    });
    const { provider } = setup({ chat });
    assert.deepStrictEqual(provider().observeSideChatOrigin(sideChat.resource).get(), {
      sourceSessionResource: sourceChat.resource,
      sourceTurnId: "turn-1",
      sourceTitle: "Source Chat",
      selection: void 0
    });
  });
  test("reacts to source title changes", () => {
    const title = observableValue("sourceTitle", "Original Title");
    const parentChat = upcastPartial({ resource: sourceChat.resource, title });
    const chat = upcastPartial({
      resource: sideChat.resource,
      origin: { kind: ChatOriginKind.SideChat, parentChat: sourceChat.resource, turnId: "turn-1" }
    });
    const { provider } = setup({ chat, parentChat });
    const origin = provider().observeSideChatOrigin(sideChat.resource);
    const before = origin.get();
    title.set("Renamed Title", void 0);
    assert.deepStrictEqual([before?.sourceTitle, origin.get()?.sourceTitle], ["Original Title", "Renamed Title"]);
  });
  test("reveals the request a side chat branched from", async () => {
    const revealed = [];
    const request = upcastPartial({ id: "turn-1", message: { parts: [], text: "" } });
    const chat = upcastPartial({
      resource: sideChat.resource,
      origin: { kind: ChatOriginKind.SideChat, parentChat: sourceChat.resource, turnId: "turn-1" }
    });
    const { provider, callOrder } = setup({
      chat,
      widgetFactory: (callOrder2) => upcastPartial({
        viewModel: upcastPartial({ sessionResource: sourceChat.resource, getItems: () => [request] }),
        onDidChangeViewModel: Event.None,
        reveal: (item) => {
          callOrder2.push(`reveal:${item.id}`);
          revealed.push(item);
        }
      })
    });
    await provider().revealSideChatSource(sideChat.resource);
    assert.deepStrictEqual({ callOrder, revealed }, {
      callOrder: [`open:${sourceChat.resource.toString()}`, "reveal:turn-1"],
      revealed: [request]
    });
  });
  test("reveals the request a side chat branched from after its widget view model changes", async () => {
    const store = disposables.add(new DisposableStore());
    const onDidChangeViewModel = store.add(new Emitter());
    const revealed = [];
    const request = upcastPartial({ id: "turn-1", message: { parts: [], text: "" } });
    const chat = upcastPartial({
      resource: sideChat.resource,
      origin: { kind: ChatOriginKind.SideChat, parentChat: sourceChat.resource, turnId: "turn-1" }
    });
    let viewModel = upcastPartial({ sessionResource: sideChat.resource, getItems: () => [] });
    const widget = upcastPartial({
      get viewModel() {
        return viewModel;
      },
      onDidChangeViewModel: onDidChangeViewModel.event,
      reveal: (item) => {
        callOrder.push(`reveal:${item.id}`);
        revealed.push(item);
      }
    });
    const { provider, callOrder } = setup({
      chat,
      widget,
      onOpenChat: () => {
        void timeout(0).then(() => {
          viewModel = upcastPartial({ sessionResource: sourceChat.resource, getItems: () => [request] });
          onDidChangeViewModel.fire({ previousSessionResource: sideChat.resource, currentSessionResource: sourceChat.resource });
        });
      }
    });
    await provider().revealSideChatSource(sideChat.resource);
    assert.deepStrictEqual({ callOrder, revealed }, {
      callOrder: [`open:${sourceChat.resource.toString()}`, "reveal:turn-1"],
      revealed: [request]
    });
  });
  test("does not reveal a source when its widget view model does not change", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const revealed = [];
    const chat = upcastPartial({
      resource: sideChat.resource,
      origin: { kind: ChatOriginKind.SideChat, parentChat: sourceChat.resource, turnId: "turn-1" }
    });
    const widget = upcastPartial({
      viewModel: upcastPartial({ sessionResource: sideChat.resource, getItems: () => [] }),
      onDidChangeViewModel: Event.None,
      reveal: (item) => {
        revealed.push(item);
      }
    });
    const { provider, callOrder } = setup({ chat, widget });
    await provider().revealSideChatSource(sideChat.resource);
    assert.deepStrictEqual({ callOrder, revealed }, {
      callOrder: [`open:${sourceChat.resource.toString()}`],
      revealed: []
    });
  }));
  test("does not reveal a source for a non-side chat", async () => {
    const revealed = [];
    const widget = upcastPartial({
      viewModel: upcastPartial({ sessionResource: sourceChat.resource, getItems: () => [] }),
      onDidChangeViewModel: Event.None,
      reveal: (item) => {
        revealed.push(item);
      }
    });
    const { provider, callOrder } = setup({ chat: upcastPartial({ resource: sideChat.resource }), widget });
    await provider().revealSideChatSource(sideChat.resource);
    assert.deepStrictEqual({ callOrder, revealed }, { callOrder: [], revealed: [] });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcY2hhdFxcdGVzdFxcYnJvd3Nlclxcc2lkZUNoYXRQcm92aWRlci50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgdGltZW91dCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgY29uc3RPYnNlcnZhYmxlLCBvYnNlcnZhYmxlVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IGV4dFVyaSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgdXBjYXN0UGFydGlhbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vbW9jay5qcyc7XG5pbXBvcnQgeyBydW5XaXRoRmFrZWRUaW1lcnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3RpbWVUcmF2ZWxTY2hlZHVsZXIuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL3Rlc3QvY29tbW9uL2luc3RhbnRpYXRpb25TZXJ2aWNlTW9jay5qcyc7XG5pbXBvcnQgeyBJVXJpSWRlbnRpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXJpSWRlbnRpdHkvY29tbW9uL3VyaUlkZW50aXR5LmpzJztcbmltcG9ydCB7IENoYXRUcmVlSXRlbSwgSUNoYXRXaWRnZXQsIElDaGF0V2lkZ2V0U2VydmljZSwgSUNoYXRXaWRnZXRWaWV3TW9kZWxDaGFuZ2VFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9jaGF0LmpzJztcbmltcG9ydCB7IElDaGF0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2NoYXRTZXJ2aWNlL2NoYXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0U2lkZUNoYXRQcm92aWRlciwgSUNoYXRTaWRlQ2hhdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9jaGF0U2lkZUNoYXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0TW9kZWwsIElDaGF0UmVxdWVzdE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vbW9kZWwvY2hhdE1vZGVsLmpzJztcbmltcG9ydCB7IElDaGF0UmVxdWVzdFZpZXdNb2RlbCwgSUNoYXRWaWV3TW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9tb2RlbC9jaGF0Vmlld01vZGVsLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvc2VydmljZXMvZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBTZXNzaW9uc1NpZGVDaGF0UHJvdmlkZXJDb250cmlidXRpb24gfSBmcm9tICcuLi8uLi9icm93c2VyL3NpZGVDaGF0UHJvdmlkZXIuY29udHJpYnV0aW9uLmpzJztcbmltcG9ydCB7IElTZXNzaW9uc1BhcnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvYnJvd3Nlci9zZXNzaW9uc1BhcnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElTZXNzaW9uc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9icm93c2VyL3Nlc3Npb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0T3JpZ2luS2luZCwgSUNoYXQsIFNlc3Npb25TdGF0dXMgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9jb21tb24vc2Vzc2lvbi5qcyc7XG5pbXBvcnQgeyBJQWN0aXZlU2Vzc2lvbiwgSVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9jb21tb24vc2Vzc2lvbnNNYW5hZ2VtZW50LmpzJztcblxuc3VpdGUoJ1Nlc3Npb25zU2lkZUNoYXRQcm92aWRlckNvbnRyaWJ1dGlvbicsICgpID0+IHtcblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRjb25zdCBzb3VyY2VDaGF0ID0gdXBjYXN0UGFydGlhbDxJQ2hhdD4oeyByZXNvdXJjZTogVVJJLnBhcnNlKCd0ZXN0Oi8vL2NoYXQvc291cmNlJyksIHRpdGxlOiBjb25zdE9ic2VydmFibGUoJ1NvdXJjZSBDaGF0JykgfSk7XG5cdGNvbnN0IHNpZGVDaGF0ID0gdXBjYXN0UGFydGlhbDxJQ2hhdD4oeyByZXNvdXJjZTogVVJJLnBhcnNlKCd0ZXN0Oi8vL2NoYXQvc2lkZScpIH0pO1xuXG5cdGZ1bmN0aW9uIHNldHVwKG9wdGlvbnM6IHtcblx0XHRzdGF0dXM/OiBTZXNzaW9uU3RhdHVzO1xuXHRcdGlzQXJjaGl2ZWQ/OiBib29sZWFuO1xuXHRcdHN1cHBvcnRzU2lkZUNoYXQ/OiBib29sZWFuO1xuXHRcdGhhc1R1cm4/OiBib29sZWFuO1xuXHRcdGlzU2Vzc2lvbnNXaW5kb3c/OiBib29sZWFuO1xuXHRcdGNoYXQ/OiBJQ2hhdDtcblx0XHRwYXJlbnRDaGF0PzogSUNoYXQ7XG5cdFx0d2lkZ2V0PzogSUNoYXRXaWRnZXQ7XG5cdFx0d2lkZ2V0RmFjdG9yeT86IChjYWxsT3JkZXI6IHN0cmluZ1tdKSA9PiBJQ2hhdFdpZGdldDtcblx0XHRvbk9wZW5DaGF0PzogKGNhbGxPcmRlcjogc3RyaW5nW10pID0+IHZvaWQ7XG5cdH0gPSB7fSkge1xuXHRcdGNvbnN0IHN0b3JlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBzdG9yZS5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblx0XHRjb25zdCBjaGF0ID0gb3B0aW9ucy5jaGF0ID8/IHNvdXJjZUNoYXQ7XG5cdFx0Y29uc3QgcGFyZW50Q2hhdCA9IG9wdGlvbnMucGFyZW50Q2hhdCA/PyBzb3VyY2VDaGF0O1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHVwY2FzdFBhcnRpYWw8SUFjdGl2ZVNlc3Npb24+KHtcblx0XHRcdHNlc3Npb25JZDogJ3Nlc3Npb24nLFxuXHRcdFx0cmVzb3VyY2U6IFVSSS5wYXJzZSgndGVzdDovLy9zZXNzaW9uJyksXG5cdFx0XHRzdGF0dXM6IGNvbnN0T2JzZXJ2YWJsZShvcHRpb25zLnN0YXR1cyA/PyBTZXNzaW9uU3RhdHVzLkNvbXBsZXRlZCksXG5cdFx0XHRpc0FyY2hpdmVkOiBjb25zdE9ic2VydmFibGUob3B0aW9ucy5pc0FyY2hpdmVkID8/IGZhbHNlKSxcblx0XHRcdGNhcGFiaWxpdGllczogY29uc3RPYnNlcnZhYmxlKHsgc3VwcG9ydHNNdWx0aXBsZUNoYXRzOiB0cnVlLCBzdXBwb3J0c1NpZGVDaGF0OiBvcHRpb25zLnN1cHBvcnRzU2lkZUNoYXQgPz8gdHJ1ZSB9KSxcblx0XHRcdGNoYXRzOiBjb25zdE9ic2VydmFibGUoW3BhcmVudENoYXQsIGNoYXRdKSxcblx0XHR9KTtcblxuXHRcdGxldCByZWdpc3RlcmVkOiBJQ2hhdFNpZGVDaGF0UHJvdmlkZXIgfCB1bmRlZmluZWQ7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdFNpZGVDaGF0U2VydmljZSwgdXBjYXN0UGFydGlhbDxJQ2hhdFNpZGVDaGF0U2VydmljZT4oe1xuXHRcdFx0cmVnaXN0ZXJQcm92aWRlcjogcHJvdmlkZXIgPT4ge1xuXHRcdFx0XHRyZWdpc3RlcmVkID0gcHJvdmlkZXI7XG5cdFx0XHRcdHJldHVybiB0b0Rpc3Bvc2FibGUoKCkgPT4geyByZWdpc3RlcmVkID0gdW5kZWZpbmVkOyB9KTtcblx0XHRcdH0sXG5cdFx0fSkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRTZXJ2aWNlLCB1cGNhc3RQYXJ0aWFsPElDaGF0U2VydmljZT4oe1xuXHRcdFx0Z2V0U2Vzc2lvbjogKCkgPT4gdXBjYXN0UGFydGlhbDxJQ2hhdE1vZGVsPih7XG5cdFx0XHRcdGdldFJlcXVlc3RzOiAoKSA9PiAob3B0aW9ucy5oYXNUdXJuID8/IHRydWUpID8gW3VwY2FzdFBhcnRpYWw8SUNoYXRSZXF1ZXN0TW9kZWw+KHsgaWQ6ICd0dXJuLTEnIH0pXSA6IFtdLFxuXHRcdFx0fSksXG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgY2FsbE9yZGVyOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UsIHVwY2FzdFBhcnRpYWw8SVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2U+KHtcblx0XHRcdGdldFNlc3Npb25Gb3JDaGF0UmVzb3VyY2U6IHJlc291cmNlID0+IHtcblx0XHRcdFx0Y29uc3QgcmVzb2x2ZWRDaGF0ID0gW3BhcmVudENoYXQsIGNoYXRdLmZpbmQoY2FuZGlkYXRlID0+IGV4dFVyaS5pc0VxdWFsKGNhbmRpZGF0ZS5yZXNvdXJjZSwgcmVzb3VyY2UpKTtcblx0XHRcdFx0cmV0dXJuIHJlc29sdmVkQ2hhdCA/IHsgc2Vzc2lvbiwgY2hhdDogcmVzb2x2ZWRDaGF0IH0gOiB1bmRlZmluZWQ7XG5cdFx0XHR9LFxuXHRcdFx0Y3JlYXRlU2lkZUNoYXRJblNlc3Npb246IGFzeW5jIChfc2Vzc2lvbiwgX3NvdXJjZUNoYXQsIHR1cm5JZCwgc2VsZWN0aW9uKSA9PiB7XG5cdFx0XHRcdGNhbGxPcmRlci5wdXNoKGBjcmVhdGU6JHt0dXJuSWR9OiR7c2VsZWN0aW9uPy50ZXh0ID8/ICcnfWApO1xuXHRcdFx0XHRyZXR1cm4gc2lkZUNoYXQ7XG5cdFx0XHR9LFxuXHRcdFx0c2VuZFJlcXVlc3Q6IGFzeW5jIChfc2Vzc2lvbiwgY2hhdCwgcmVxdWVzdE9wdGlvbnMpID0+IHtcblx0XHRcdFx0Y2FsbE9yZGVyLnB1c2goYHNlbmQ6JHtjaGF0LnJlc291cmNlLnRvU3RyaW5nKCl9OiR7cmVxdWVzdE9wdGlvbnMucXVlcnl9YCk7XG5cdFx0XHR9LFxuXHRcdH0pKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElTZXNzaW9uc1NlcnZpY2UsIHVwY2FzdFBhcnRpYWw8SVNlc3Npb25zU2VydmljZT4oe1xuXHRcdFx0dmlzaWJsZVNlc3Npb25zOiBjb25zdE9ic2VydmFibGUoW3Nlc3Npb25dKSxcblx0XHRcdG9wZW5DaGF0OiBhc3luYyAoX3Nlc3Npb24sIGNoYXRVcmkpID0+IHtcblx0XHRcdFx0Y2FsbE9yZGVyLnB1c2goYG9wZW46JHtjaGF0VXJpLnRvU3RyaW5nKCl9YCk7XG5cdFx0XHRcdG9wdGlvbnMub25PcGVuQ2hhdD8uKGNhbGxPcmRlcik7XG5cdFx0XHR9LFxuXHRcdH0pKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElTZXNzaW9uc1BhcnRTZXJ2aWNlLCB1cGNhc3RQYXJ0aWFsPElTZXNzaW9uc1BhcnRTZXJ2aWNlPih7XG5cdFx0XHRnZXRTZXNzaW9uVmlldzogKCkgPT4gdW5kZWZpbmVkLFxuXHRcdH0pKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0V2lkZ2V0U2VydmljZSwgdXBjYXN0UGFydGlhbDxJQ2hhdFdpZGdldFNlcnZpY2U+KHtcblx0XHRcdGdldFdpZGdldEJ5U2Vzc2lvblJlc291cmNlOiAoKSA9PiBvcHRpb25zLndpZGdldEZhY3Rvcnk/LihjYWxsT3JkZXIpID8/IG9wdGlvbnMud2lkZ2V0LFxuXHRcdH0pKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElVcmlJZGVudGl0eVNlcnZpY2UsIHVwY2FzdFBhcnRpYWw8SVVyaUlkZW50aXR5U2VydmljZT4oeyBleHRVcmkgfSkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSwgdXBjYXN0UGFydGlhbDxJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlPih7XG5cdFx0XHRpc1Nlc3Npb25zV2luZG93OiBvcHRpb25zLmlzU2Vzc2lvbnNXaW5kb3cgPz8gdHJ1ZSxcblx0XHR9KSk7XG5cblx0XHRzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2Vzc2lvbnNTaWRlQ2hhdFByb3ZpZGVyQ29udHJpYnV0aW9uKSk7XG5cdFx0cmV0dXJuIHsgcHJvdmlkZXI6ICgpID0+IHJlZ2lzdGVyZWQsIGNhbGxPcmRlciB9O1xuXHR9XG5cblx0dGVzdCgncmVnaXN0ZXJzIGEgcHJvdmlkZXIgdGhhdCBicmFuY2hlcywgb3BlbnMsIHRoZW4gc2VuZHMgb24gdGhlIHNpZGUgY2hhdCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IHByb3ZpZGVyLCBjYWxsT3JkZXIgfSA9IHNldHVwKCk7XG5cblx0XHRhd2FpdCBwcm92aWRlcigpIS5hc2tJblNpZGVDaGF0KHNvdXJjZUNoYXQucmVzb3VyY2UsICd3aGF0IGFib3V0IHRoaXM/JywgeyB0ZXh0OiAnc2VsZWN0ZWQgdGV4dCcgfSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNhbGxPcmRlciwgW1xuXHRcdFx0J2NyZWF0ZTp0dXJuLTE6c2VsZWN0ZWQgdGV4dCcsXG5cdFx0XHRgb3Blbjoke3NpZGVDaGF0LnJlc291cmNlLnRvU3RyaW5nKCl9YCxcblx0XHRcdGBzZW5kOiR7c2lkZUNoYXQucmVzb3VyY2UudG9TdHJpbmcoKX06d2hhdCBhYm91dCB0aGlzP2AsXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlcG9ydHMgY2FwYWJpbGl0eSBvbmx5IGZvciBjb252ZXJzYXRpb25zIHRoYXQgY2FuIGFjdHVhbGx5IGJyYW5jaCcsICgpID0+IHtcblx0XHRjb25zdCBjYXBhYmlsaXR5ID0gKG9wdGlvbnM6IFBhcmFtZXRlcnM8dHlwZW9mIHNldHVwPlswXSkgPT4ge1xuXHRcdFx0Y29uc3QgeyBwcm92aWRlciB9ID0gc2V0dXAob3B0aW9ucyk7XG5cdFx0XHRyZXR1cm4gcHJvdmlkZXIoKSEuY2FuQXNrSW5TaWRlQ2hhdChzb3VyY2VDaGF0LnJlc291cmNlKTtcblx0XHR9O1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRzdXBwb3J0ZWQ6IGNhcGFiaWxpdHkoe30pLFxuXHRcdFx0dW5rbm93bkNoYXQ6ICgoKSA9PiBzZXR1cCh7fSkucHJvdmlkZXIoKSEuY2FuQXNrSW5TaWRlQ2hhdChVUkkucGFyc2UoJ3Rlc3Q6Ly8vY2hhdC9vdGhlcicpKSkoKSxcblx0XHRcdHVudGl0bGVkOiBjYXBhYmlsaXR5KHsgc3RhdHVzOiBTZXNzaW9uU3RhdHVzLlVudGl0bGVkIH0pLFxuXHRcdFx0YXJjaGl2ZWQ6IGNhcGFiaWxpdHkoeyBpc0FyY2hpdmVkOiB0cnVlIH0pLFxuXHRcdFx0bm9TaWRlQ2hhdFN1cHBvcnQ6IGNhcGFiaWxpdHkoeyBzdXBwb3J0c1NpZGVDaGF0OiBmYWxzZSB9KSxcblx0XHRcdG5vVHVybllldDogY2FwYWJpbGl0eSh7IGhhc1R1cm46IGZhbHNlIH0pLFxuXHRcdH0sIHtcblx0XHRcdHN1cHBvcnRlZDogdHJ1ZSxcblx0XHRcdHVua25vd25DaGF0OiBmYWxzZSxcblx0XHRcdHVudGl0bGVkOiBmYWxzZSxcblx0XHRcdGFyY2hpdmVkOiBmYWxzZSxcblx0XHRcdG5vU2lkZUNoYXRTdXBwb3J0OiBmYWxzZSxcblx0XHRcdG5vVHVybllldDogZmFsc2UsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90IHJlZ2lzdGVyIG91dHNpZGUgdGhlIEFnZW50cyB3aW5kb3cnLCAoKSA9PiB7XG5cdFx0Y29uc3QgeyBwcm92aWRlciB9ID0gc2V0dXAoeyBpc1Nlc3Npb25zV2luZG93OiBmYWxzZSB9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm92aWRlcigpLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdvYnNlcnZlcyB0aGUgc291cmNlIG1ldGFkYXRhIGZvciBhIHNpZGUgY2hhdCcsICgpID0+IHtcblx0XHRjb25zdCBwYXJlbnRDaGF0ID0gdXBjYXN0UGFydGlhbDxJQ2hhdD4oe1xuXHRcdFx0cmVzb3VyY2U6IHNvdXJjZUNoYXQucmVzb3VyY2UsXG5cdFx0XHR0aXRsZTogY29uc3RPYnNlcnZhYmxlKCdTb3VyY2UgQ2hhdCcpLFxuXHRcdH0pO1xuXHRcdGNvbnN0IGNoYXQgPSB1cGNhc3RQYXJ0aWFsPElDaGF0Pih7XG5cdFx0XHRyZXNvdXJjZTogc2lkZUNoYXQucmVzb3VyY2UsXG5cdFx0XHRvcmlnaW46IHtcblx0XHRcdFx0a2luZDogQ2hhdE9yaWdpbktpbmQuU2lkZUNoYXQsXG5cdFx0XHRcdHBhcmVudENoYXQ6IHNvdXJjZUNoYXQucmVzb3VyY2UsXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdHNlbGVjdGlvbjogeyB0ZXh0OiAnc2VsZWN0ZWQgdGV4dCcgfSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdFx0Y29uc3QgeyBwcm92aWRlciB9ID0gc2V0dXAoeyBjaGF0LCBwYXJlbnRDaGF0IH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwcm92aWRlcigpIS5vYnNlcnZlU2lkZUNoYXRPcmlnaW4oc2lkZUNoYXQucmVzb3VyY2UpLmdldCgpLCB7XG5cdFx0XHRzb3VyY2VTZXNzaW9uUmVzb3VyY2U6IHNvdXJjZUNoYXQucmVzb3VyY2UsXG5cdFx0XHRzb3VyY2VUdXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0c291cmNlVGl0bGU6ICdTb3VyY2UgQ2hhdCcsXG5cdFx0XHRzZWxlY3Rpb246IHsgdGV4dDogJ3NlbGVjdGVkIHRleHQnIH0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JldHVybnMgdW5kZWZpbmVkIGZvciBjaGF0cyB3aXRob3V0IGEgY29tcGxldGUgc2lkZS1jaGF0IG9yaWdpbicsICgpID0+IHtcblx0XHRjb25zdCBvcmlnaW4gPSAoY2hhdDogSUNoYXQpID0+IHNldHVwKHsgY2hhdCB9KS5wcm92aWRlcigpIS5vYnNlcnZlU2lkZUNoYXRPcmlnaW4oc2lkZUNoYXQucmVzb3VyY2UpLmdldCgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRub09yaWdpbjogb3JpZ2luKHVwY2FzdFBhcnRpYWw8SUNoYXQ+KHsgcmVzb3VyY2U6IHNpZGVDaGF0LnJlc291cmNlIH0pKSxcblx0XHRcdHVzZXI6IG9yaWdpbih1cGNhc3RQYXJ0aWFsPElDaGF0Pih7IHJlc291cmNlOiBzaWRlQ2hhdC5yZXNvdXJjZSwgb3JpZ2luOiB7IGtpbmQ6IENoYXRPcmlnaW5LaW5kLlVzZXIgfSB9KSksXG5cdFx0XHR0b29sOiBvcmlnaW4odXBjYXN0UGFydGlhbDxJQ2hhdD4oeyByZXNvdXJjZTogc2lkZUNoYXQucmVzb3VyY2UsIG9yaWdpbjogeyBraW5kOiBDaGF0T3JpZ2luS2luZC5Ub29sIH0gfSkpLFxuXHRcdFx0bWlzc2luZ1R1cm46IG9yaWdpbih1cGNhc3RQYXJ0aWFsPElDaGF0Pih7IHJlc291cmNlOiBzaWRlQ2hhdC5yZXNvdXJjZSwgb3JpZ2luOiB7IGtpbmQ6IENoYXRPcmlnaW5LaW5kLlNpZGVDaGF0LCBwYXJlbnRDaGF0OiBzb3VyY2VDaGF0LnJlc291cmNlIH0gfSkpLFxuXHRcdH0sIHtcblx0XHRcdG5vT3JpZ2luOiB1bmRlZmluZWQsXG5cdFx0XHR1c2VyOiB1bmRlZmluZWQsXG5cdFx0XHR0b29sOiB1bmRlZmluZWQsXG5cdFx0XHRtaXNzaW5nVHVybjogdW5kZWZpbmVkLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdvYnNlcnZlcyBhIHNpZGUgY2hhdCB3aXRob3V0IGEgc2VsZWN0aW9uJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNoYXQgPSB1cGNhc3RQYXJ0aWFsPElDaGF0Pih7XG5cdFx0XHRyZXNvdXJjZTogc2lkZUNoYXQucmVzb3VyY2UsXG5cdFx0XHRvcmlnaW46IHsga2luZDogQ2hhdE9yaWdpbktpbmQuU2lkZUNoYXQsIHBhcmVudENoYXQ6IHNvdXJjZUNoYXQucmVzb3VyY2UsIHR1cm5JZDogJ3R1cm4tMScgfSxcblx0XHR9KTtcblx0XHRjb25zdCB7IHByb3ZpZGVyIH0gPSBzZXR1cCh7IGNoYXQgfSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHByb3ZpZGVyKCkhLm9ic2VydmVTaWRlQ2hhdE9yaWdpbihzaWRlQ2hhdC5yZXNvdXJjZSkuZ2V0KCksIHtcblx0XHRcdHNvdXJjZVNlc3Npb25SZXNvdXJjZTogc291cmNlQ2hhdC5yZXNvdXJjZSxcblx0XHRcdHNvdXJjZVR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRzb3VyY2VUaXRsZTogJ1NvdXJjZSBDaGF0Jyxcblx0XHRcdHNlbGVjdGlvbjogdW5kZWZpbmVkLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWFjdHMgdG8gc291cmNlIHRpdGxlIGNoYW5nZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdGl0bGUgPSBvYnNlcnZhYmxlVmFsdWUoJ3NvdXJjZVRpdGxlJywgJ09yaWdpbmFsIFRpdGxlJyk7XG5cdFx0Y29uc3QgcGFyZW50Q2hhdCA9IHVwY2FzdFBhcnRpYWw8SUNoYXQ+KHsgcmVzb3VyY2U6IHNvdXJjZUNoYXQucmVzb3VyY2UsIHRpdGxlIH0pO1xuXHRcdGNvbnN0IGNoYXQgPSB1cGNhc3RQYXJ0aWFsPElDaGF0Pih7XG5cdFx0XHRyZXNvdXJjZTogc2lkZUNoYXQucmVzb3VyY2UsXG5cdFx0XHRvcmlnaW46IHsga2luZDogQ2hhdE9yaWdpbktpbmQuU2lkZUNoYXQsIHBhcmVudENoYXQ6IHNvdXJjZUNoYXQucmVzb3VyY2UsIHR1cm5JZDogJ3R1cm4tMScgfSxcblx0XHR9KTtcblx0XHRjb25zdCB7IHByb3ZpZGVyIH0gPSBzZXR1cCh7IGNoYXQsIHBhcmVudENoYXQgfSk7XG5cdFx0Y29uc3Qgb3JpZ2luID0gcHJvdmlkZXIoKSEub2JzZXJ2ZVNpZGVDaGF0T3JpZ2luKHNpZGVDaGF0LnJlc291cmNlKTtcblxuXHRcdGNvbnN0IGJlZm9yZSA9IG9yaWdpbi5nZXQoKTtcblx0XHR0aXRsZS5zZXQoJ1JlbmFtZWQgVGl0bGUnLCB1bmRlZmluZWQpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbYmVmb3JlPy5zb3VyY2VUaXRsZSwgb3JpZ2luLmdldCgpPy5zb3VyY2VUaXRsZV0sIFsnT3JpZ2luYWwgVGl0bGUnLCAnUmVuYW1lZCBUaXRsZSddKTtcblx0fSk7XG5cblx0dGVzdCgncmV2ZWFscyB0aGUgcmVxdWVzdCBhIHNpZGUgY2hhdCBicmFuY2hlZCBmcm9tJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJldmVhbGVkOiBDaGF0VHJlZUl0ZW1bXSA9IFtdO1xuXHRcdGNvbnN0IHJlcXVlc3QgPSB1cGNhc3RQYXJ0aWFsPElDaGF0UmVxdWVzdFZpZXdNb2RlbD4oeyBpZDogJ3R1cm4tMScsIG1lc3NhZ2U6IHsgcGFydHM6IFtdLCB0ZXh0OiAnJyB9IH0pO1xuXHRcdGNvbnN0IGNoYXQgPSB1cGNhc3RQYXJ0aWFsPElDaGF0Pih7XG5cdFx0XHRyZXNvdXJjZTogc2lkZUNoYXQucmVzb3VyY2UsXG5cdFx0XHRvcmlnaW46IHsga2luZDogQ2hhdE9yaWdpbktpbmQuU2lkZUNoYXQsIHBhcmVudENoYXQ6IHNvdXJjZUNoYXQucmVzb3VyY2UsIHR1cm5JZDogJ3R1cm4tMScgfSxcblx0XHR9KTtcblx0XHRjb25zdCB7IHByb3ZpZGVyLCBjYWxsT3JkZXIgfSA9IHNldHVwKHtcblx0XHRcdGNoYXQsXG5cdFx0XHR3aWRnZXRGYWN0b3J5OiBjYWxsT3JkZXIgPT4gdXBjYXN0UGFydGlhbDxJQ2hhdFdpZGdldD4oe1xuXHRcdFx0XHR2aWV3TW9kZWw6IHVwY2FzdFBhcnRpYWw8SUNoYXRWaWV3TW9kZWw+KHsgc2Vzc2lvblJlc291cmNlOiBzb3VyY2VDaGF0LnJlc291cmNlLCBnZXRJdGVtczogKCkgPT4gW3JlcXVlc3RdIH0pLFxuXHRcdFx0XHRvbkRpZENoYW5nZVZpZXdNb2RlbDogRXZlbnQuTm9uZSxcblx0XHRcdFx0cmV2ZWFsOiBpdGVtID0+IHtcblx0XHRcdFx0XHRjYWxsT3JkZXIucHVzaChgcmV2ZWFsOiR7aXRlbS5pZH1gKTtcblx0XHRcdFx0XHRyZXZlYWxlZC5wdXNoKGl0ZW0pO1xuXHRcdFx0XHR9LFxuXHRcdFx0fSksXG5cdFx0fSk7XG5cblx0XHRhd2FpdCBwcm92aWRlcigpIS5yZXZlYWxTaWRlQ2hhdFNvdXJjZShzaWRlQ2hhdC5yZXNvdXJjZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgY2FsbE9yZGVyLCByZXZlYWxlZCB9LCB7XG5cdFx0XHRjYWxsT3JkZXI6IFtgb3Blbjoke3NvdXJjZUNoYXQucmVzb3VyY2UudG9TdHJpbmcoKX1gLCAncmV2ZWFsOnR1cm4tMSddLFxuXHRcdFx0cmV2ZWFsZWQ6IFtyZXF1ZXN0XSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmV2ZWFscyB0aGUgcmVxdWVzdCBhIHNpZGUgY2hhdCBicmFuY2hlZCBmcm9tIGFmdGVyIGl0cyB3aWRnZXQgdmlldyBtb2RlbCBjaGFuZ2VzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHN0b3JlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdFx0Y29uc3Qgb25EaWRDaGFuZ2VWaWV3TW9kZWwgPSBzdG9yZS5hZGQobmV3IEVtaXR0ZXI8SUNoYXRXaWRnZXRWaWV3TW9kZWxDaGFuZ2VFdmVudD4oKSk7XG5cdFx0Y29uc3QgcmV2ZWFsZWQ6IENoYXRUcmVlSXRlbVtdID0gW107XG5cdFx0Y29uc3QgcmVxdWVzdCA9IHVwY2FzdFBhcnRpYWw8SUNoYXRSZXF1ZXN0Vmlld01vZGVsPih7IGlkOiAndHVybi0xJywgbWVzc2FnZTogeyBwYXJ0czogW10sIHRleHQ6ICcnIH0gfSk7XG5cdFx0Y29uc3QgY2hhdCA9IHVwY2FzdFBhcnRpYWw8SUNoYXQ+KHtcblx0XHRcdHJlc291cmNlOiBzaWRlQ2hhdC5yZXNvdXJjZSxcblx0XHRcdG9yaWdpbjogeyBraW5kOiBDaGF0T3JpZ2luS2luZC5TaWRlQ2hhdCwgcGFyZW50Q2hhdDogc291cmNlQ2hhdC5yZXNvdXJjZSwgdHVybklkOiAndHVybi0xJyB9LFxuXHRcdH0pO1xuXHRcdGxldCB2aWV3TW9kZWwgPSB1cGNhc3RQYXJ0aWFsPElDaGF0Vmlld01vZGVsPih7IHNlc3Npb25SZXNvdXJjZTogc2lkZUNoYXQucmVzb3VyY2UsIGdldEl0ZW1zOiAoKSA9PiBbXSB9KTtcblx0XHRjb25zdCB3aWRnZXQgPSB1cGNhc3RQYXJ0aWFsPElDaGF0V2lkZ2V0Pih7XG5cdFx0XHRnZXQgdmlld01vZGVsKCkgeyByZXR1cm4gdmlld01vZGVsOyB9LFxuXHRcdFx0b25EaWRDaGFuZ2VWaWV3TW9kZWw6IG9uRGlkQ2hhbmdlVmlld01vZGVsLmV2ZW50LFxuXHRcdFx0cmV2ZWFsOiBpdGVtID0+IHtcblx0XHRcdFx0Y2FsbE9yZGVyLnB1c2goYHJldmVhbDoke2l0ZW0uaWR9YCk7XG5cdFx0XHRcdHJldmVhbGVkLnB1c2goaXRlbSk7XG5cdFx0XHR9LFxuXHRcdH0pO1xuXHRcdGNvbnN0IHsgcHJvdmlkZXIsIGNhbGxPcmRlciB9ID0gc2V0dXAoe1xuXHRcdFx0Y2hhdCxcblx0XHRcdHdpZGdldCxcblx0XHRcdG9uT3BlbkNoYXQ6ICgpID0+IHtcblx0XHRcdFx0dm9pZCB0aW1lb3V0KDApLnRoZW4oKCkgPT4ge1xuXHRcdFx0XHRcdHZpZXdNb2RlbCA9IHVwY2FzdFBhcnRpYWw8SUNoYXRWaWV3TW9kZWw+KHsgc2Vzc2lvblJlc291cmNlOiBzb3VyY2VDaGF0LnJlc291cmNlLCBnZXRJdGVtczogKCkgPT4gW3JlcXVlc3RdIH0pO1xuXHRcdFx0XHRcdG9uRGlkQ2hhbmdlVmlld01vZGVsLmZpcmUoeyBwcmV2aW91c1Nlc3Npb25SZXNvdXJjZTogc2lkZUNoYXQucmVzb3VyY2UsIGN1cnJlbnRTZXNzaW9uUmVzb3VyY2U6IHNvdXJjZUNoYXQucmVzb3VyY2UgfSk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSxcblx0XHR9KTtcblxuXHRcdGF3YWl0IHByb3ZpZGVyKCkhLnJldmVhbFNpZGVDaGF0U291cmNlKHNpZGVDaGF0LnJlc291cmNlKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBjYWxsT3JkZXIsIHJldmVhbGVkIH0sIHtcblx0XHRcdGNhbGxPcmRlcjogW2BvcGVuOiR7c291cmNlQ2hhdC5yZXNvdXJjZS50b1N0cmluZygpfWAsICdyZXZlYWw6dHVybi0xJ10sXG5cdFx0XHRyZXZlYWxlZDogW3JlcXVlc3RdLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCByZXZlYWwgYSBzb3VyY2Ugd2hlbiBpdHMgd2lkZ2V0IHZpZXcgbW9kZWwgZG9lcyBub3QgY2hhbmdlJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmV2ZWFsZWQ6IENoYXRUcmVlSXRlbVtdID0gW107XG5cdFx0Y29uc3QgY2hhdCA9IHVwY2FzdFBhcnRpYWw8SUNoYXQ+KHtcblx0XHRcdHJlc291cmNlOiBzaWRlQ2hhdC5yZXNvdXJjZSxcblx0XHRcdG9yaWdpbjogeyBraW5kOiBDaGF0T3JpZ2luS2luZC5TaWRlQ2hhdCwgcGFyZW50Q2hhdDogc291cmNlQ2hhdC5yZXNvdXJjZSwgdHVybklkOiAndHVybi0xJyB9LFxuXHRcdH0pO1xuXHRcdGNvbnN0IHdpZGdldCA9IHVwY2FzdFBhcnRpYWw8SUNoYXRXaWRnZXQ+KHtcblx0XHRcdHZpZXdNb2RlbDogdXBjYXN0UGFydGlhbDxJQ2hhdFZpZXdNb2RlbD4oeyBzZXNzaW9uUmVzb3VyY2U6IHNpZGVDaGF0LnJlc291cmNlLCBnZXRJdGVtczogKCkgPT4gW10gfSksXG5cdFx0XHRvbkRpZENoYW5nZVZpZXdNb2RlbDogRXZlbnQuTm9uZSxcblx0XHRcdHJldmVhbDogaXRlbSA9PiB7IHJldmVhbGVkLnB1c2goaXRlbSk7IH0sXG5cdFx0fSk7XG5cdFx0Y29uc3QgeyBwcm92aWRlciwgY2FsbE9yZGVyIH0gPSBzZXR1cCh7IGNoYXQsIHdpZGdldCB9KTtcblxuXHRcdGF3YWl0IHByb3ZpZGVyKCkhLnJldmVhbFNpZGVDaGF0U291cmNlKHNpZGVDaGF0LnJlc291cmNlKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBjYWxsT3JkZXIsIHJldmVhbGVkIH0sIHtcblx0XHRcdGNhbGxPcmRlcjogW2BvcGVuOiR7c291cmNlQ2hhdC5yZXNvdXJjZS50b1N0cmluZygpfWBdLFxuXHRcdFx0cmV2ZWFsZWQ6IFtdLFxuXHRcdH0pO1xuXHR9KSk7XG5cblx0dGVzdCgnZG9lcyBub3QgcmV2ZWFsIGEgc291cmNlIGZvciBhIG5vbi1zaWRlIGNoYXQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmV2ZWFsZWQ6IENoYXRUcmVlSXRlbVtdID0gW107XG5cdFx0Y29uc3Qgd2lkZ2V0ID0gdXBjYXN0UGFydGlhbDxJQ2hhdFdpZGdldD4oe1xuXHRcdFx0dmlld01vZGVsOiB1cGNhc3RQYXJ0aWFsPElDaGF0Vmlld01vZGVsPih7IHNlc3Npb25SZXNvdXJjZTogc291cmNlQ2hhdC5yZXNvdXJjZSwgZ2V0SXRlbXM6ICgpID0+IFtdIH0pLFxuXHRcdFx0b25EaWRDaGFuZ2VWaWV3TW9kZWw6IEV2ZW50Lk5vbmUsXG5cdFx0XHRyZXZlYWw6IGl0ZW0gPT4geyByZXZlYWxlZC5wdXNoKGl0ZW0pOyB9LFxuXHRcdH0pO1xuXHRcdGNvbnN0IHsgcHJvdmlkZXIsIGNhbGxPcmRlciB9ID0gc2V0dXAoeyBjaGF0OiB1cGNhc3RQYXJ0aWFsPElDaGF0Pih7IHJlc291cmNlOiBzaWRlQ2hhdC5yZXNvdXJjZSB9KSwgd2lkZ2V0IH0pO1xuXG5cdFx0YXdhaXQgcHJvdmlkZXIoKSEucmV2ZWFsU2lkZUNoYXRTb3VyY2Uoc2lkZUNoYXQucmVzb3VyY2UpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IGNhbGxPcmRlciwgcmV2ZWFsZWQgfSwgeyBjYWxsT3JkZXI6IFtdLCByZXZlYWxlZDogW10gfSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3Mi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
