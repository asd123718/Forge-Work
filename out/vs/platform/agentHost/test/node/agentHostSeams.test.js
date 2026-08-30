import assert from "assert";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { URI } from "../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { NullLogService } from "../../../log/common/log.js";
import { ActionType } from "../../common/state/sessionActions.js";
import {
  AgentSession,
  resolveAgentChatOrigin,
  resolveAgentHostCustomizations,
  resolveSubagentChatParent
} from "../../common/agentService.js";
import {
  buildChatUri,
  buildDefaultChatUri,
  buildSubagentChatUri,
  ChatOriginKind,
  CustomizationType,
  SessionLifecycle,
  SessionStatus
} from "../../common/state/sessionState.js";
import { AgentHostStateManager } from "../../node/agentHostStateManager.js";
import { AgentHostPromptCache } from "../../node/agentHostPromptCache.js";
import { AgentHostSessionTitleSignal } from "../../node/agentHostSessionTitleSignal.js";
import { createAgentChatContext, getSessionChatsForFanOut } from "../../node/agentChatContext.js";
suite("Agent Host provider seams", () => {
  const disposables = new DisposableStore();
  const session = AgentSession.uri("copilot", "seam-session");
  const sessionKey = session.toString();
  const defaultChat = URI.parse(buildDefaultChatUri(sessionKey));
  const peerChat = URI.parse(buildChatUri(sessionKey, "peer"));
  const subagentChat = URI.parse(buildSubagentChatUri(sessionKey, "tool-1"));
  let manager;
  function summary() {
    return {
      resource: sessionKey,
      provider: "copilot",
      title: "Seams",
      status: SessionStatus.Idle,
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      modifiedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
  }
  function customization(id, enabled) {
    return {
      type: CustomizationType.Directory,
      id,
      name: id,
      uri: `file:///${id}`,
      enabled,
      contents: CustomizationType.Skill,
      writable: false
    };
  }
  setup(() => {
    manager = disposables.add(new AgentHostStateManager(new NullLogService()));
  });
  teardown(() => disposables.clear());
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("createAgentChatContext", () => {
    test("stamps resource and origin for the session-backed default chat", () => {
      manager.createSession(summary());
      const context = createAgentChatContext(manager, session, defaultChat);
      assert.deepStrictEqual({
        configurationResource: context.configurationResource.toString(),
        resource: context.resource.toString(),
        origin: context.origin,
        parent: resolveSubagentChatParent(context),
        customizations: context.customizations
      }, {
        configurationResource: sessionKey,
        // The default chat's provider-owned storage scope is its session.
        resource: sessionKey,
        origin: { kind: ChatOriginKind.User },
        parent: void 0,
        customizations: void 0
      });
    });
    test("carries the catalog origin and host customizations for a spawned subagent chat", () => {
      manager.createSession(summary());
      manager.setSessionCustomizations(sessionKey, [customization("alpha", true), customization("beta", false)]);
      manager.addChat(sessionKey, subagentChat.toString(), {
        origin: { kind: ChatOriginKind.Tool, chat: buildDefaultChatUri(sessionKey), toolCallId: "tool-1" }
      });
      const context = createAgentChatContext(manager, session, subagentChat);
      assert.deepStrictEqual({
        resource: context.resource.toString(),
        origin: context.origin,
        parent: resolveSubagentChatParent(context)?.toolCallId,
        customizations: context.customizations?.map((c) => [c.id, c.type === CustomizationType.Directory ? c.enabled : void 0])
      }, {
        resource: subagentChat.toString(),
        origin: { kind: ChatOriginKind.Tool, chat: buildDefaultChatUri(sessionKey), toolCallId: "tool-1" },
        parent: "tool-1",
        customizations: [["alpha", true], ["beta", false]]
      });
    });
    test("resolves the origin of a restored chat before its state is hydrated", () => {
      manager.createSession(summary());
      manager.registerRestoredChatSummary(sessionKey, peerChat.toString(), {
        title: "Restored",
        origin: { kind: ChatOriginKind.Fork, chat: buildDefaultChatUri(sessionKey), turnId: "turn-1" },
        resolver: async () => ({ turns: [] })
      });
      assert.deepStrictEqual({
        // Restored chats have no ChatState until they are resolved…
        state: manager.getChatState(peerChat.toString()),
        // …but their origin is authoritative from the moment they are registered.
        origin: createAgentChatContext(manager, session, peerChat).origin
      }, {
        state: void 0,
        origin: { kind: ChatOriginKind.Fork, chat: buildDefaultChatUri(sessionKey), turnId: "turn-1" }
      });
    });
  });
  suite("context readers", () => {
    test("tolerate a legacy session-only context", () => {
      assert.deepStrictEqual({
        origin: resolveAgentChatOrigin(session),
        parent: resolveSubagentChatParent(session),
        // No snapshot at all — deliberately not an empty list, which
        // would assert "this session has no customizations".
        customizations: resolveAgentHostCustomizations(session),
        noContext: resolveAgentHostCustomizations(void 0)
      }, {
        origin: void 0,
        parent: void 0,
        customizations: void 0,
        noContext: void 0
      });
    });
    test("resolveSubagentChatParent only reports tool spawn edges", () => {
      const fork = {
        resource: peerChat,
        configurationResource: session,
        origin: { kind: ChatOriginKind.Fork, chat: buildDefaultChatUri(sessionKey), turnId: "turn-1" }
      };
      const tool = {
        resource: subagentChat,
        configurationResource: session,
        origin: { kind: ChatOriginKind.Tool, chat: buildDefaultChatUri(sessionKey), toolCallId: "tool-9" }
      };
      assert.deepStrictEqual({
        fork: resolveSubagentChatParent(fork),
        tool: resolveSubagentChatParent(tool) && {
          chat: resolveSubagentChatParent(tool).chat.toString(),
          toolCallId: resolveSubagentChatParent(tool).toolCallId
        }
      }, {
        fork: void 0,
        tool: { chat: buildDefaultChatUri(sessionKey), toolCallId: "tool-9" }
      });
    });
  });
  suite("getSessionChatsForFanOut", () => {
    test("distinguishes an absent session from an authoritative catalog", () => {
      const unknown = getSessionChatsForFanOut(manager, session);
      manager.createSession(summary());
      const created = getSessionChatsForFanOut(manager, session)?.map((c) => c.toString());
      manager.addChat(sessionKey, peerChat.toString());
      manager.addChat(sessionKey, subagentChat.toString());
      const withPeers = getSessionChatsForFanOut(manager, session)?.map((c) => c.toString());
      assert.deepStrictEqual({ unknown, created, withPeers }, {
        // No host state means no authoritative membership to fan out —
        // the default chat is NOT fabricated on the session's behalf.
        unknown: void 0,
        created: [defaultChat.toString()],
        // Default chat first, then the catalog, de-duplicated.
        withPeers: [defaultChat.toString(), peerChat.toString(), subagentChat.toString()]
      });
    });
  });
  suite("catalog origin", () => {
    test("keeps the default user origin when no explicit origin is supplied", () => {
      manager.createSession(summary());
      manager.addChat(sessionKey, peerChat.toString());
      manager.registerRestoredChatSummary(sessionKey, URI.parse(buildChatUri(sessionKey, "restored")).toString(), {});
      assert.deepStrictEqual({
        peer: manager.getChatOrigin(peerChat.toString()),
        restored: manager.getChatOrigin(buildChatUri(sessionKey, "restored")),
        defaultChat: manager.getChatOrigin(defaultChat.toString())
      }, {
        peer: { kind: ChatOriginKind.User },
        restored: { kind: ChatOriginKind.User },
        defaultChat: { kind: ChatOriginKind.User }
      });
    });
    test("records an explicit origin verbatim", () => {
      manager.createSession(summary());
      const fork = { kind: ChatOriginKind.Fork, chat: buildDefaultChatUri(sessionKey), turnId: "turn-7" };
      manager.addChat(sessionKey, peerChat.toString(), { origin: fork });
      assert.deepStrictEqual(manager.getChatOrigin(peerChat.toString()), fork);
    });
  });
  suite("AgentHostPromptCache", () => {
    test("reads, writes, and merges the prompt-cache slot without clobbering sibling metadata", () => {
      manager.createSession(summary());
      manager.setSessionMeta(sessionKey, { "vscode.other": "keep" });
      const promptCache = new AgentHostPromptCache(manager);
      const initial = promptCache.read(session);
      const written = promptCache.write(session, { modelId: "model-a", cacheExpiresAt: "2030-01-01T00:00:00.000Z" });
      const readBack = promptCache.read(session);
      const repeat = promptCache.write(session, { modelId: "model-a", cacheExpiresAt: "2030-01-01T00:00:00.000Z" });
      const cleared = promptCache.write(session, void 0);
      assert.deepStrictEqual({
        initial,
        written,
        readBack,
        repeat,
        cleared,
        afterClear: promptCache.read(session),
        siblingMeta: manager.getSessionSummary(sessionKey)?._meta?.["vscode.other"]
      }, {
        initial: void 0,
        written: { modelId: "model-a", cacheExpiresAt: "2030-01-01T00:00:00.000Z" },
        readBack: { modelId: "model-a", cacheExpiresAt: "2030-01-01T00:00:00.000Z" },
        repeat: { modelId: "model-a", cacheExpiresAt: "2030-01-01T00:00:00.000Z" },
        cleared: void 0,
        afterClear: void 0,
        siblingMeta: "keep"
      });
    });
    test("does not persist for a session the host does not know", () => {
      const promptCache = new AgentHostPromptCache(manager);
      const unknown = AgentSession.uri("copilot", "nope");
      assert.deepStrictEqual({
        read: promptCache.read(unknown),
        written: promptCache.write(unknown, { modelId: "model-a", cacheExpiresAt: "later" }),
        persisted: promptCache.read(unknown)
      }, {
        read: void 0,
        written: { modelId: "model-a", cacheExpiresAt: "later" },
        persisted: void 0
      });
    });
  });
  suite("AgentHostSessionTitleSignal", () => {
    test("centralizes the provider filter and conversation-id derivation", () => {
      const signal = disposables.add(new AgentHostSessionTitleSignal(manager));
      const fired = [];
      disposables.add(signal.onDidChangeSessionTitle((e) => fired.push({
        provider: e.provider,
        session: e.session.toString(),
        conversationId: e.conversationId,
        title: e.title
      })));
      manager.createSession(summary());
      manager.dispatchServerAction(sessionKey, { type: ActionType.SessionTitleChanged, title: "Renamed" });
      assert.deepStrictEqual(fired, [{
        provider: "copilot",
        session: sessionKey,
        conversationId: "seam-session",
        title: "Renamed"
      }]);
    });
  });
  test("a created session is usable by every seam", () => {
    const state = manager.createSession(summary());
    assert.strictEqual(state.lifecycle, SessionLifecycle.Creating);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxhZ2VudEhvc3RTZWFtcy50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgQWN0aW9uVHlwZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uQWN0aW9ucy5qcyc7XG5pbXBvcnQge1xuXHRBZ2VudFNlc3Npb24sXG5cdHJlc29sdmVBZ2VudENoYXRPcmlnaW4sXG5cdHJlc29sdmVBZ2VudEhvc3RDdXN0b21pemF0aW9ucyxcblx0cmVzb2x2ZVN1YmFnZW50Q2hhdFBhcmVudCxcblx0dHlwZSBJQWdlbnRDaGF0Q29udGV4dCxcbn0gZnJvbSAnLi4vLi4vY29tbW9uL2FnZW50U2VydmljZS5qcyc7XG5pbXBvcnQge1xuXHRidWlsZENoYXRVcmksXG5cdGJ1aWxkRGVmYXVsdENoYXRVcmksXG5cdGJ1aWxkU3ViYWdlbnRDaGF0VXJpLFxuXHRDaGF0T3JpZ2luS2luZCxcblx0Q3VzdG9taXphdGlvblR5cGUsXG5cdFNlc3Npb25MaWZlY3ljbGUsXG5cdFNlc3Npb25TdGF0dXMsXG5cdHR5cGUgQ2hhdE9yaWdpbixcblx0dHlwZSBDdXN0b21pemF0aW9uLFxuXHR0eXBlIFNlc3Npb25TdW1tYXJ5LFxufSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvblN0YXRlLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdFN0YXRlTWFuYWdlciB9IGZyb20gJy4uLy4uL25vZGUvYWdlbnRIb3N0U3RhdGVNYW5hZ2VyLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdFByb21wdENhY2hlIH0gZnJvbSAnLi4vLi4vbm9kZS9hZ2VudEhvc3RQcm9tcHRDYWNoZS5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RTZXNzaW9uVGl0bGVTaWduYWwgfSBmcm9tICcuLi8uLi9ub2RlL2FnZW50SG9zdFNlc3Npb25UaXRsZVNpZ25hbC5qcyc7XG5pbXBvcnQgeyBjcmVhdGVBZ2VudENoYXRDb250ZXh0LCBnZXRTZXNzaW9uQ2hhdHNGb3JGYW5PdXQgfSBmcm9tICcuLi8uLi9ub2RlL2FnZW50Q2hhdENvbnRleHQuanMnO1xuXG5zdWl0ZSgnQWdlbnQgSG9zdCBwcm92aWRlciBzZWFtcycsICgpID0+IHtcblxuXHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0Y29uc3Qgc2Vzc2lvbiA9IEFnZW50U2Vzc2lvbi51cmkoJ2NvcGlsb3QnLCAnc2VhbS1zZXNzaW9uJyk7XG5cdGNvbnN0IHNlc3Npb25LZXkgPSBzZXNzaW9uLnRvU3RyaW5nKCk7XG5cdGNvbnN0IGRlZmF1bHRDaGF0ID0gVVJJLnBhcnNlKGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvbktleSkpO1xuXHRjb25zdCBwZWVyQ2hhdCA9IFVSSS5wYXJzZShidWlsZENoYXRVcmkoc2Vzc2lvbktleSwgJ3BlZXInKSk7XG5cdGNvbnN0IHN1YmFnZW50Q2hhdCA9IFVSSS5wYXJzZShidWlsZFN1YmFnZW50Q2hhdFVyaShzZXNzaW9uS2V5LCAndG9vbC0xJykpO1xuXG5cdGxldCBtYW5hZ2VyOiBBZ2VudEhvc3RTdGF0ZU1hbmFnZXI7XG5cblx0ZnVuY3Rpb24gc3VtbWFyeSgpOiBTZXNzaW9uU3VtbWFyeSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHJlc291cmNlOiBzZXNzaW9uS2V5LFxuXHRcdFx0cHJvdmlkZXI6ICdjb3BpbG90Jyxcblx0XHRcdHRpdGxlOiAnU2VhbXMnLFxuXHRcdFx0c3RhdHVzOiBTZXNzaW9uU3RhdHVzLklkbGUsXG5cdFx0XHRjcmVhdGVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcblx0XHRcdG1vZGlmaWVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcblx0XHR9O1xuXHR9XG5cblx0ZnVuY3Rpb24gY3VzdG9taXphdGlvbihpZDogc3RyaW5nLCBlbmFibGVkOiBib29sZWFuKTogQ3VzdG9taXphdGlvbiB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHR5cGU6IEN1c3RvbWl6YXRpb25UeXBlLkRpcmVjdG9yeSxcblx0XHRcdGlkLFxuXHRcdFx0bmFtZTogaWQsXG5cdFx0XHR1cmk6IGBmaWxlOi8vLyR7aWR9YCxcblx0XHRcdGVuYWJsZWQsXG5cdFx0XHRjb250ZW50czogQ3VzdG9taXphdGlvblR5cGUuU2tpbGwsXG5cdFx0XHR3cml0YWJsZTogZmFsc2UsXG5cdFx0fTtcblx0fVxuXG5cdHNldHVwKCgpID0+IHtcblx0XHRtYW5hZ2VyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RTdGF0ZU1hbmFnZXIobmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0fSk7XG5cblx0dGVhcmRvd24oKCkgPT4gZGlzcG9zYWJsZXMuY2xlYXIoKSk7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdC8vIC0tLS0gRXhoYXVzdGl2ZSBvcmlnaW4gKyBjdXN0b21pemF0aW9ucyBvbiBldmVyeSBjb250ZXh0IC0tLS0tLS0tLS0tLS0tLVxuXG5cdHN1aXRlKCdjcmVhdGVBZ2VudENoYXRDb250ZXh0JywgKCkgPT4ge1xuXG5cdFx0dGVzdCgnc3RhbXBzIHJlc291cmNlIGFuZCBvcmlnaW4gZm9yIHRoZSBzZXNzaW9uLWJhY2tlZCBkZWZhdWx0IGNoYXQnLCAoKSA9PiB7XG5cdFx0XHRtYW5hZ2VyLmNyZWF0ZVNlc3Npb24oc3VtbWFyeSgpKTtcblx0XHRcdGNvbnN0IGNvbnRleHQgPSBjcmVhdGVBZ2VudENoYXRDb250ZXh0KG1hbmFnZXIsIHNlc3Npb24sIGRlZmF1bHRDaGF0KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRjb25maWd1cmF0aW9uUmVzb3VyY2U6IGNvbnRleHQuY29uZmlndXJhdGlvblJlc291cmNlLnRvU3RyaW5nKCksXG5cdFx0XHRcdHJlc291cmNlOiBjb250ZXh0LnJlc291cmNlLnRvU3RyaW5nKCksXG5cdFx0XHRcdG9yaWdpbjogY29udGV4dC5vcmlnaW4sXG5cdFx0XHRcdHBhcmVudDogcmVzb2x2ZVN1YmFnZW50Q2hhdFBhcmVudChjb250ZXh0KSxcblx0XHRcdFx0Y3VzdG9taXphdGlvbnM6IGNvbnRleHQuY3VzdG9taXphdGlvbnMsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGNvbmZpZ3VyYXRpb25SZXNvdXJjZTogc2Vzc2lvbktleSxcblx0XHRcdFx0Ly8gVGhlIGRlZmF1bHQgY2hhdCdzIHByb3ZpZGVyLW93bmVkIHN0b3JhZ2Ugc2NvcGUgaXMgaXRzIHNlc3Npb24uXG5cdFx0XHRcdHJlc291cmNlOiBzZXNzaW9uS2V5LFxuXHRcdFx0XHRvcmlnaW46IHsga2luZDogQ2hhdE9yaWdpbktpbmQuVXNlciB9LFxuXHRcdFx0XHRwYXJlbnQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0Y3VzdG9taXphdGlvbnM6IHVuZGVmaW5lZCxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY2FycmllcyB0aGUgY2F0YWxvZyBvcmlnaW4gYW5kIGhvc3QgY3VzdG9taXphdGlvbnMgZm9yIGEgc3Bhd25lZCBzdWJhZ2VudCBjaGF0JywgKCkgPT4ge1xuXHRcdFx0bWFuYWdlci5jcmVhdGVTZXNzaW9uKHN1bW1hcnkoKSk7XG5cdFx0XHRtYW5hZ2VyLnNldFNlc3Npb25DdXN0b21pemF0aW9ucyhzZXNzaW9uS2V5LCBbY3VzdG9taXphdGlvbignYWxwaGEnLCB0cnVlKSwgY3VzdG9taXphdGlvbignYmV0YScsIGZhbHNlKV0pO1xuXHRcdFx0bWFuYWdlci5hZGRDaGF0KHNlc3Npb25LZXksIHN1YmFnZW50Q2hhdC50b1N0cmluZygpLCB7XG5cdFx0XHRcdG9yaWdpbjogeyBraW5kOiBDaGF0T3JpZ2luS2luZC5Ub29sLCBjaGF0OiBidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb25LZXkpLCB0b29sQ2FsbElkOiAndG9vbC0xJyB9LFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IGNvbnRleHQgPSBjcmVhdGVBZ2VudENoYXRDb250ZXh0KG1hbmFnZXIsIHNlc3Npb24sIHN1YmFnZW50Q2hhdCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0cmVzb3VyY2U6IGNvbnRleHQucmVzb3VyY2UudG9TdHJpbmcoKSxcblx0XHRcdFx0b3JpZ2luOiBjb250ZXh0Lm9yaWdpbixcblx0XHRcdFx0cGFyZW50OiByZXNvbHZlU3ViYWdlbnRDaGF0UGFyZW50KGNvbnRleHQpPy50b29sQ2FsbElkLFxuXHRcdFx0XHRjdXN0b21pemF0aW9uczogY29udGV4dC5jdXN0b21pemF0aW9ucz8ubWFwKGMgPT4gW2MuaWQsIGMudHlwZSA9PT0gQ3VzdG9taXphdGlvblR5cGUuRGlyZWN0b3J5ID8gYy5lbmFibGVkIDogdW5kZWZpbmVkXSksXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHJlc291cmNlOiBzdWJhZ2VudENoYXQudG9TdHJpbmcoKSxcblx0XHRcdFx0b3JpZ2luOiB7IGtpbmQ6IENoYXRPcmlnaW5LaW5kLlRvb2wsIGNoYXQ6IGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvbktleSksIHRvb2xDYWxsSWQ6ICd0b29sLTEnIH0sXG5cdFx0XHRcdHBhcmVudDogJ3Rvb2wtMScsXG5cdFx0XHRcdGN1c3RvbWl6YXRpb25zOiBbWydhbHBoYScsIHRydWVdLCBbJ2JldGEnLCBmYWxzZV1dLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXNvbHZlcyB0aGUgb3JpZ2luIG9mIGEgcmVzdG9yZWQgY2hhdCBiZWZvcmUgaXRzIHN0YXRlIGlzIGh5ZHJhdGVkJywgKCkgPT4ge1xuXHRcdFx0bWFuYWdlci5jcmVhdGVTZXNzaW9uKHN1bW1hcnkoKSk7XG5cdFx0XHRtYW5hZ2VyLnJlZ2lzdGVyUmVzdG9yZWRDaGF0U3VtbWFyeShzZXNzaW9uS2V5LCBwZWVyQ2hhdC50b1N0cmluZygpLCB7XG5cdFx0XHRcdHRpdGxlOiAnUmVzdG9yZWQnLFxuXHRcdFx0XHRvcmlnaW46IHsga2luZDogQ2hhdE9yaWdpbktpbmQuRm9yaywgY2hhdDogYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uS2V5KSwgdHVybklkOiAndHVybi0xJyB9LFxuXHRcdFx0XHRyZXNvbHZlcjogYXN5bmMgKCkgPT4gKHsgdHVybnM6IFtdIH0pLFxuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHQvLyBSZXN0b3JlZCBjaGF0cyBoYXZlIG5vIENoYXRTdGF0ZSB1bnRpbCB0aGV5IGFyZSByZXNvbHZlZFx1MjAyNlxuXHRcdFx0XHRzdGF0ZTogbWFuYWdlci5nZXRDaGF0U3RhdGUocGVlckNoYXQudG9TdHJpbmcoKSksXG5cdFx0XHRcdC8vIFx1MjAyNmJ1dCB0aGVpciBvcmlnaW4gaXMgYXV0aG9yaXRhdGl2ZSBmcm9tIHRoZSBtb21lbnQgdGhleSBhcmUgcmVnaXN0ZXJlZC5cblx0XHRcdFx0b3JpZ2luOiBjcmVhdGVBZ2VudENoYXRDb250ZXh0KG1hbmFnZXIsIHNlc3Npb24sIHBlZXJDaGF0KS5vcmlnaW4sXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHN0YXRlOiB1bmRlZmluZWQsXG5cdFx0XHRcdG9yaWdpbjogeyBraW5kOiBDaGF0T3JpZ2luS2luZC5Gb3JrLCBjaGF0OiBidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb25LZXkpLCB0dXJuSWQ6ICd0dXJuLTEnIH0sXG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0Ly8gLS0tLSBDb250ZXh0IHJlYWRlcnMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdHN1aXRlKCdjb250ZXh0IHJlYWRlcnMnLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCd0b2xlcmF0ZSBhIGxlZ2FjeSBzZXNzaW9uLW9ubHkgY29udGV4dCcsICgpID0+IHtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRvcmlnaW46IHJlc29sdmVBZ2VudENoYXRPcmlnaW4oc2Vzc2lvbiksXG5cdFx0XHRcdHBhcmVudDogcmVzb2x2ZVN1YmFnZW50Q2hhdFBhcmVudChzZXNzaW9uKSxcblx0XHRcdFx0Ly8gTm8gc25hcHNob3QgYXQgYWxsIFx1MjAxNCBkZWxpYmVyYXRlbHkgbm90IGFuIGVtcHR5IGxpc3QsIHdoaWNoXG5cdFx0XHRcdC8vIHdvdWxkIGFzc2VydCBcInRoaXMgc2Vzc2lvbiBoYXMgbm8gY3VzdG9taXphdGlvbnNcIi5cblx0XHRcdFx0Y3VzdG9taXphdGlvbnM6IHJlc29sdmVBZ2VudEhvc3RDdXN0b21pemF0aW9ucyhzZXNzaW9uKSxcblx0XHRcdFx0bm9Db250ZXh0OiByZXNvbHZlQWdlbnRIb3N0Q3VzdG9taXphdGlvbnModW5kZWZpbmVkKSxcblx0XHRcdH0sIHtcblx0XHRcdFx0b3JpZ2luOiB1bmRlZmluZWQsXG5cdFx0XHRcdHBhcmVudDogdW5kZWZpbmVkLFxuXHRcdFx0XHRjdXN0b21pemF0aW9uczogdW5kZWZpbmVkLFxuXHRcdFx0XHRub0NvbnRleHQ6IHVuZGVmaW5lZCxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVzb2x2ZVN1YmFnZW50Q2hhdFBhcmVudCBvbmx5IHJlcG9ydHMgdG9vbCBzcGF3biBlZGdlcycsICgpID0+IHtcblx0XHRcdGNvbnN0IGZvcms6IElBZ2VudENoYXRDb250ZXh0ID0ge1xuXHRcdFx0XHRyZXNvdXJjZTogcGVlckNoYXQsXG5cdFx0XHRcdGNvbmZpZ3VyYXRpb25SZXNvdXJjZTogc2Vzc2lvbixcblx0XHRcdFx0b3JpZ2luOiB7IGtpbmQ6IENoYXRPcmlnaW5LaW5kLkZvcmssIGNoYXQ6IGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvbktleSksIHR1cm5JZDogJ3R1cm4tMScgfSxcblx0XHRcdH07XG5cdFx0XHRjb25zdCB0b29sOiBJQWdlbnRDaGF0Q29udGV4dCA9IHtcblx0XHRcdFx0cmVzb3VyY2U6IHN1YmFnZW50Q2hhdCxcblx0XHRcdFx0Y29uZmlndXJhdGlvblJlc291cmNlOiBzZXNzaW9uLFxuXHRcdFx0XHRvcmlnaW46IHsga2luZDogQ2hhdE9yaWdpbktpbmQuVG9vbCwgY2hhdDogYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uS2V5KSwgdG9vbENhbGxJZDogJ3Rvb2wtOScgfSxcblx0XHRcdH07XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0Zm9yazogcmVzb2x2ZVN1YmFnZW50Q2hhdFBhcmVudChmb3JrKSxcblx0XHRcdFx0dG9vbDogcmVzb2x2ZVN1YmFnZW50Q2hhdFBhcmVudCh0b29sKSAmJiB7XG5cdFx0XHRcdFx0Y2hhdDogcmVzb2x2ZVN1YmFnZW50Q2hhdFBhcmVudCh0b29sKSEuY2hhdC50b1N0cmluZygpLFxuXHRcdFx0XHRcdHRvb2xDYWxsSWQ6IHJlc29sdmVTdWJhZ2VudENoYXRQYXJlbnQodG9vbCkhLnRvb2xDYWxsSWQsXG5cdFx0XHRcdH0sXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGZvcms6IHVuZGVmaW5lZCxcblx0XHRcdFx0dG9vbDogeyBjaGF0OiBidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb25LZXkpLCB0b29sQ2FsbElkOiAndG9vbC05JyB9LFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vIC0tLS0gSG9zdC1vd25lZCBhY3RpdmUtY2xpZW50IGZhbi1vdXQgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRzdWl0ZSgnZ2V0U2Vzc2lvbkNoYXRzRm9yRmFuT3V0JywgKCkgPT4ge1xuXG5cdFx0dGVzdCgnZGlzdGluZ3Vpc2hlcyBhbiBhYnNlbnQgc2Vzc2lvbiBmcm9tIGFuIGF1dGhvcml0YXRpdmUgY2F0YWxvZycsICgpID0+IHtcblx0XHRcdGNvbnN0IHVua25vd24gPSBnZXRTZXNzaW9uQ2hhdHNGb3JGYW5PdXQobWFuYWdlciwgc2Vzc2lvbik7XG5cdFx0XHRtYW5hZ2VyLmNyZWF0ZVNlc3Npb24oc3VtbWFyeSgpKTtcblx0XHRcdGNvbnN0IGNyZWF0ZWQgPSBnZXRTZXNzaW9uQ2hhdHNGb3JGYW5PdXQobWFuYWdlciwgc2Vzc2lvbik/Lm1hcChjID0+IGMudG9TdHJpbmcoKSk7XG5cdFx0XHRtYW5hZ2VyLmFkZENoYXQoc2Vzc2lvbktleSwgcGVlckNoYXQudG9TdHJpbmcoKSk7XG5cdFx0XHRtYW5hZ2VyLmFkZENoYXQoc2Vzc2lvbktleSwgc3ViYWdlbnRDaGF0LnRvU3RyaW5nKCkpO1xuXHRcdFx0Y29uc3Qgd2l0aFBlZXJzID0gZ2V0U2Vzc2lvbkNoYXRzRm9yRmFuT3V0KG1hbmFnZXIsIHNlc3Npb24pPy5tYXAoYyA9PiBjLnRvU3RyaW5nKCkpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgdW5rbm93biwgY3JlYXRlZCwgd2l0aFBlZXJzIH0sIHtcblx0XHRcdFx0Ly8gTm8gaG9zdCBzdGF0ZSBtZWFucyBubyBhdXRob3JpdGF0aXZlIG1lbWJlcnNoaXAgdG8gZmFuIG91dCBcdTIwMTRcblx0XHRcdFx0Ly8gdGhlIGRlZmF1bHQgY2hhdCBpcyBOT1QgZmFicmljYXRlZCBvbiB0aGUgc2Vzc2lvbidzIGJlaGFsZi5cblx0XHRcdFx0dW5rbm93bjogdW5kZWZpbmVkLFxuXHRcdFx0XHRjcmVhdGVkOiBbZGVmYXVsdENoYXQudG9TdHJpbmcoKV0sXG5cdFx0XHRcdC8vIERlZmF1bHQgY2hhdCBmaXJzdCwgdGhlbiB0aGUgY2F0YWxvZywgZGUtZHVwbGljYXRlZC5cblx0XHRcdFx0d2l0aFBlZXJzOiBbZGVmYXVsdENoYXQudG9TdHJpbmcoKSwgcGVlckNoYXQudG9TdHJpbmcoKSwgc3ViYWdlbnRDaGF0LnRvU3RyaW5nKCldLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vIC0tLS0gRXhoYXVzdGl2ZSBjYXRhbG9nIG9yaWdpbiAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRzdWl0ZSgnY2F0YWxvZyBvcmlnaW4nLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdrZWVwcyB0aGUgZGVmYXVsdCB1c2VyIG9yaWdpbiB3aGVuIG5vIGV4cGxpY2l0IG9yaWdpbiBpcyBzdXBwbGllZCcsICgpID0+IHtcblx0XHRcdG1hbmFnZXIuY3JlYXRlU2Vzc2lvbihzdW1tYXJ5KCkpO1xuXHRcdFx0bWFuYWdlci5hZGRDaGF0KHNlc3Npb25LZXksIHBlZXJDaGF0LnRvU3RyaW5nKCkpO1xuXHRcdFx0bWFuYWdlci5yZWdpc3RlclJlc3RvcmVkQ2hhdFN1bW1hcnkoc2Vzc2lvbktleSwgVVJJLnBhcnNlKGJ1aWxkQ2hhdFVyaShzZXNzaW9uS2V5LCAncmVzdG9yZWQnKSkudG9TdHJpbmcoKSwge30pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0cGVlcjogbWFuYWdlci5nZXRDaGF0T3JpZ2luKHBlZXJDaGF0LnRvU3RyaW5nKCkpLFxuXHRcdFx0XHRyZXN0b3JlZDogbWFuYWdlci5nZXRDaGF0T3JpZ2luKGJ1aWxkQ2hhdFVyaShzZXNzaW9uS2V5LCAncmVzdG9yZWQnKSksXG5cdFx0XHRcdGRlZmF1bHRDaGF0OiBtYW5hZ2VyLmdldENoYXRPcmlnaW4oZGVmYXVsdENoYXQudG9TdHJpbmcoKSksXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHBlZXI6IHsga2luZDogQ2hhdE9yaWdpbktpbmQuVXNlciB9LFxuXHRcdFx0XHRyZXN0b3JlZDogeyBraW5kOiBDaGF0T3JpZ2luS2luZC5Vc2VyIH0sXG5cdFx0XHRcdGRlZmF1bHRDaGF0OiB7IGtpbmQ6IENoYXRPcmlnaW5LaW5kLlVzZXIgfSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVjb3JkcyBhbiBleHBsaWNpdCBvcmlnaW4gdmVyYmF0aW0nLCAoKSA9PiB7XG5cdFx0XHRtYW5hZ2VyLmNyZWF0ZVNlc3Npb24oc3VtbWFyeSgpKTtcblx0XHRcdGNvbnN0IGZvcms6IENoYXRPcmlnaW4gPSB7IGtpbmQ6IENoYXRPcmlnaW5LaW5kLkZvcmssIGNoYXQ6IGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvbktleSksIHR1cm5JZDogJ3R1cm4tNycgfTtcblx0XHRcdG1hbmFnZXIuYWRkQ2hhdChzZXNzaW9uS2V5LCBwZWVyQ2hhdC50b1N0cmluZygpLCB7IG9yaWdpbjogZm9yayB9KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtYW5hZ2VyLmdldENoYXRPcmlnaW4ocGVlckNoYXQudG9TdHJpbmcoKSksIGZvcmspO1xuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyAtLS0tIE5hcnJvdyBwcm9tcHQtY2FjaGUgbWV0YWRhdGEgc2VhbSAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0c3VpdGUoJ0FnZW50SG9zdFByb21wdENhY2hlJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgncmVhZHMsIHdyaXRlcywgYW5kIG1lcmdlcyB0aGUgcHJvbXB0LWNhY2hlIHNsb3Qgd2l0aG91dCBjbG9iYmVyaW5nIHNpYmxpbmcgbWV0YWRhdGEnLCAoKSA9PiB7XG5cdFx0XHRtYW5hZ2VyLmNyZWF0ZVNlc3Npb24oc3VtbWFyeSgpKTtcblx0XHRcdG1hbmFnZXIuc2V0U2Vzc2lvbk1ldGEoc2Vzc2lvbktleSwgeyAndnNjb2RlLm90aGVyJzogJ2tlZXAnIH0pO1xuXHRcdFx0Y29uc3QgcHJvbXB0Q2FjaGUgPSBuZXcgQWdlbnRIb3N0UHJvbXB0Q2FjaGUobWFuYWdlcik7XG5cblx0XHRcdGNvbnN0IGluaXRpYWwgPSBwcm9tcHRDYWNoZS5yZWFkKHNlc3Npb24pO1xuXHRcdFx0Y29uc3Qgd3JpdHRlbiA9IHByb21wdENhY2hlLndyaXRlKHNlc3Npb24sIHsgbW9kZWxJZDogJ21vZGVsLWEnLCBjYWNoZUV4cGlyZXNBdDogJzIwMzAtMDEtMDFUMDA6MDA6MDAuMDAwWicgfSk7XG5cdFx0XHRjb25zdCByZWFkQmFjayA9IHByb21wdENhY2hlLnJlYWQoc2Vzc2lvbik7XG5cdFx0XHQvLyBBIHJlcGVhdCB3cml0ZSBvZiB0aGUgc2FtZSB2YWx1ZSBpcyBhIG5vLW9wIHRoYXQgcmVwb3J0cyB0aGUgcGVyc2lzdGVkIHN0YXRlLlxuXHRcdFx0Y29uc3QgcmVwZWF0ID0gcHJvbXB0Q2FjaGUud3JpdGUoc2Vzc2lvbiwgeyBtb2RlbElkOiAnbW9kZWwtYScsIGNhY2hlRXhwaXJlc0F0OiAnMjAzMC0wMS0wMVQwMDowMDowMC4wMDBaJyB9KTtcblx0XHRcdGNvbnN0IGNsZWFyZWQgPSBwcm9tcHRDYWNoZS53cml0ZShzZXNzaW9uLCB1bmRlZmluZWQpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0aW5pdGlhbCxcblx0XHRcdFx0d3JpdHRlbixcblx0XHRcdFx0cmVhZEJhY2ssXG5cdFx0XHRcdHJlcGVhdCxcblx0XHRcdFx0Y2xlYXJlZCxcblx0XHRcdFx0YWZ0ZXJDbGVhcjogcHJvbXB0Q2FjaGUucmVhZChzZXNzaW9uKSxcblx0XHRcdFx0c2libGluZ01ldGE6IG1hbmFnZXIuZ2V0U2Vzc2lvblN1bW1hcnkoc2Vzc2lvbktleSk/Ll9tZXRhPy5bJ3ZzY29kZS5vdGhlciddLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRpbml0aWFsOiB1bmRlZmluZWQsXG5cdFx0XHRcdHdyaXR0ZW46IHsgbW9kZWxJZDogJ21vZGVsLWEnLCBjYWNoZUV4cGlyZXNBdDogJzIwMzAtMDEtMDFUMDA6MDA6MDAuMDAwWicgfSxcblx0XHRcdFx0cmVhZEJhY2s6IHsgbW9kZWxJZDogJ21vZGVsLWEnLCBjYWNoZUV4cGlyZXNBdDogJzIwMzAtMDEtMDFUMDA6MDA6MDAuMDAwWicgfSxcblx0XHRcdFx0cmVwZWF0OiB7IG1vZGVsSWQ6ICdtb2RlbC1hJywgY2FjaGVFeHBpcmVzQXQ6ICcyMDMwLTAxLTAxVDAwOjAwOjAwLjAwMFonIH0sXG5cdFx0XHRcdGNsZWFyZWQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0YWZ0ZXJDbGVhcjogdW5kZWZpbmVkLFxuXHRcdFx0XHRzaWJsaW5nTWV0YTogJ2tlZXAnLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkb2VzIG5vdCBwZXJzaXN0IGZvciBhIHNlc3Npb24gdGhlIGhvc3QgZG9lcyBub3Qga25vdycsICgpID0+IHtcblx0XHRcdGNvbnN0IHByb21wdENhY2hlID0gbmV3IEFnZW50SG9zdFByb21wdENhY2hlKG1hbmFnZXIpO1xuXHRcdFx0Y29uc3QgdW5rbm93biA9IEFnZW50U2Vzc2lvbi51cmkoJ2NvcGlsb3QnLCAnbm9wZScpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdHJlYWQ6IHByb21wdENhY2hlLnJlYWQodW5rbm93biksXG5cdFx0XHRcdHdyaXR0ZW46IHByb21wdENhY2hlLndyaXRlKHVua25vd24sIHsgbW9kZWxJZDogJ21vZGVsLWEnLCBjYWNoZUV4cGlyZXNBdDogJ2xhdGVyJyB9KSxcblx0XHRcdFx0cGVyc2lzdGVkOiBwcm9tcHRDYWNoZS5yZWFkKHVua25vd24pLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRyZWFkOiB1bmRlZmluZWQsXG5cdFx0XHRcdHdyaXR0ZW46IHsgbW9kZWxJZDogJ21vZGVsLWEnLCBjYWNoZUV4cGlyZXNBdDogJ2xhdGVyJyB9LFxuXHRcdFx0XHRwZXJzaXN0ZWQ6IHVuZGVmaW5lZCxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyAtLS0tIE5hcnJvdyBzZXNzaW9uLXRpdGxlIHNpZ25hbCAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0c3VpdGUoJ0FnZW50SG9zdFNlc3Npb25UaXRsZVNpZ25hbCcsICgpID0+IHtcblxuXHRcdHRlc3QoJ2NlbnRyYWxpemVzIHRoZSBwcm92aWRlciBmaWx0ZXIgYW5kIGNvbnZlcnNhdGlvbi1pZCBkZXJpdmF0aW9uJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2lnbmFsID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RTZXNzaW9uVGl0bGVTaWduYWwobWFuYWdlcikpO1xuXHRcdFx0Y29uc3QgZmlyZWQ6IHsgcHJvdmlkZXI6IHN0cmluZzsgc2Vzc2lvbjogc3RyaW5nOyBjb252ZXJzYXRpb25JZDogc3RyaW5nOyB0aXRsZTogc3RyaW5nIH1bXSA9IFtdO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHNpZ25hbC5vbkRpZENoYW5nZVNlc3Npb25UaXRsZShlID0+IGZpcmVkLnB1c2goe1xuXHRcdFx0XHRwcm92aWRlcjogZS5wcm92aWRlcixcblx0XHRcdFx0c2Vzc2lvbjogZS5zZXNzaW9uLnRvU3RyaW5nKCksXG5cdFx0XHRcdGNvbnZlcnNhdGlvbklkOiBlLmNvbnZlcnNhdGlvbklkLFxuXHRcdFx0XHR0aXRsZTogZS50aXRsZSxcblx0XHRcdH0pKSk7XG5cblx0XHRcdG1hbmFnZXIuY3JlYXRlU2Vzc2lvbihzdW1tYXJ5KCkpO1xuXHRcdFx0bWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihzZXNzaW9uS2V5LCB7IHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvblRpdGxlQ2hhbmdlZCwgdGl0bGU6ICdSZW5hbWVkJyB9KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChmaXJlZCwgW3tcblx0XHRcdFx0cHJvdmlkZXI6ICdjb3BpbG90Jyxcblx0XHRcdFx0c2Vzc2lvbjogc2Vzc2lvbktleSxcblx0XHRcdFx0Y29udmVyc2F0aW9uSWQ6ICdzZWFtLXNlc3Npb24nLFxuXHRcdFx0XHR0aXRsZTogJ1JlbmFtZWQnLFxuXHRcdFx0fV0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdhIGNyZWF0ZWQgc2Vzc2lvbiBpcyB1c2FibGUgYnkgZXZlcnkgc2VhbScsICgpID0+IHtcblx0XHRjb25zdCBzdGF0ZSA9IG1hbmFnZXIuY3JlYXRlU2Vzc2lvbihzdW1tYXJ5KCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZS5saWZlY3ljbGUsIFNlc3Npb25MaWZlY3ljbGUuQ3JlYXRpbmcpO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsV0FBVztBQUNwQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGtCQUFrQjtBQUMzQjtBQUFBLEVBQ0M7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxPQUVNO0FBQ1A7QUFBQSxFQUNDO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsT0FJTTtBQUNQLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsNEJBQTRCO0FBQ3JDLFNB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
