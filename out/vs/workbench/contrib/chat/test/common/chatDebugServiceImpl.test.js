import assert from "assert";
import { CancellationTokenSource } from "../../../../../base/common/cancellation.js";
import { errorHandler } from "../../../../../base/common/errors.js";
import { URI } from "../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { TestConfigurationService } from "../../../../../platform/configuration/test/common/testConfigurationService.js";
import { ChatDebugLogLevel } from "../../common/chatDebugService.js";
import { ChatDebugServiceImpl } from "../../common/chatDebugServiceImpl.js";
import { LocalChatSessionUri } from "../../common/model/chatUri.js";
suite("ChatDebugServiceImpl", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  let service;
  const session1 = URI.parse("vscode-chat-session://local/session-1");
  const session2 = URI.parse("vscode-chat-session://local/session-2");
  const sessionA = LocalChatSessionUri.forSession("a");
  const sessionB = LocalChatSessionUri.forSession("b");
  const sessionGeneric = URI.parse("vscode-chat-session://local/session");
  const nonLocalSession = URI.parse("some-other-scheme://authority/session-1");
  const copilotCliSession = URI.parse("copilotcli:/test-session-id");
  setup(() => {
    service = disposables.add(new ChatDebugServiceImpl(new TestConfigurationService()));
  });
  suite("addEvent and getEvents", () => {
    test("should add and retrieve events", () => {
      const event = {
        kind: "generic",
        sessionResource: session1,
        created: /* @__PURE__ */ new Date(),
        name: "test-event",
        level: ChatDebugLogLevel.Info
      };
      service.addEvent(event);
      assert.deepStrictEqual(service.getEvents(), [event]);
    });
    test("should filter events by sessionResource", () => {
      const event1 = {
        kind: "generic",
        sessionResource: session1,
        created: /* @__PURE__ */ new Date(),
        name: "event-1",
        level: ChatDebugLogLevel.Info
      };
      const event2 = {
        kind: "generic",
        sessionResource: session2,
        created: /* @__PURE__ */ new Date(),
        name: "event-2",
        level: ChatDebugLogLevel.Warning
      };
      service.addEvent(event1);
      service.addEvent(event2);
      assert.deepStrictEqual(service.getEvents(session1), [event1]);
      assert.deepStrictEqual(service.getEvents(session2), [event2]);
      assert.strictEqual(service.getEvents().length, 2);
    });
    test("should fire onDidAddEvent when event is added", () => {
      const firedEvents = [];
      disposables.add(service.onDidAddEvent((e) => firedEvents.push(e)));
      const event = {
        kind: "generic",
        sessionResource: session1,
        created: /* @__PURE__ */ new Date(),
        name: "test",
        level: ChatDebugLogLevel.Info
      };
      service.addEvent(event);
      assert.deepStrictEqual(firedEvents, [event]);
    });
    test("should handle different event kinds", () => {
      const toolCall = {
        kind: "toolCall",
        sessionResource: session1,
        created: /* @__PURE__ */ new Date(),
        toolName: "readFile",
        toolCallId: "call-1",
        input: '{"path": "/foo.ts"}',
        output: "file contents",
        result: "success",
        durationInMillis: 42
      };
      const modelTurn = {
        kind: "modelTurn",
        sessionResource: session1,
        created: /* @__PURE__ */ new Date(),
        model: "gpt-4",
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        copilotUsageNanoAiu: 5e9,
        durationInMillis: 1200
      };
      service.addEvent(toolCall);
      service.addEvent(modelTurn);
      const events = service.getEvents(session1);
      assert.strictEqual(events.length, 2);
      assert.strictEqual(events[0].kind, "toolCall");
      assert.strictEqual(events[1].kind, "modelTurn");
      assert.strictEqual(events[1].copilotUsageNanoAiu, 5e9);
    });
  });
  suite("log", () => {
    test("should create a generic event with defaults", () => {
      const firedEvents = [];
      disposables.add(service.onDidAddEvent((e) => firedEvents.push(e)));
      service.log(session1, "Some name", "Some details");
      assert.strictEqual(firedEvents.length, 1);
      const event = firedEvents[0];
      assert.strictEqual(event.kind, "generic");
      assert.strictEqual(event.sessionResource.toString(), session1.toString());
      assert.strictEqual(event.name, "Some name");
      assert.strictEqual(event.details, "Some details");
      assert.strictEqual(event.level, ChatDebugLogLevel.Info);
    });
    test("should accept custom level and options", () => {
      const firedEvents = [];
      disposables.add(service.onDidAddEvent((e) => firedEvents.push(e)));
      service.log(session1, "warning-event", "oh no", ChatDebugLogLevel.Warning, {
        id: "my-id",
        category: "testing",
        parentEventId: "parent-1"
      });
      const event = firedEvents[0];
      assert.strictEqual(event.level, ChatDebugLogLevel.Warning);
      assert.strictEqual(event.id, "my-id");
      assert.strictEqual(event.category, "testing");
      assert.strictEqual(event.parentEventId, "parent-1");
    });
    test("should not log events for ineligible session schemes", () => {
      const firedEvents = [];
      disposables.add(service.onDidAddEvent((e) => firedEvents.push(e)));
      service.log(nonLocalSession, "should-be-skipped", "details");
      assert.strictEqual(firedEvents.length, 0);
      assert.strictEqual(service.getEvents(nonLocalSession).length, 0);
    });
    test("should log events for copilotcli sessions", () => {
      const firedEvents = [];
      disposables.add(service.onDidAddEvent((e) => firedEvents.push(e)));
      service.log(copilotCliSession, "cli-event", "details");
      assert.strictEqual(firedEvents.length, 1);
      assert.strictEqual(service.getEvents(copilotCliSession).length, 1);
    });
  });
  suite("getSessionResources", () => {
    test("should return unique session resources", () => {
      service.addEvent({ kind: "generic", sessionResource: sessionA, created: /* @__PURE__ */ new Date(), name: "e1", level: ChatDebugLogLevel.Info });
      service.addEvent({ kind: "generic", sessionResource: sessionB, created: /* @__PURE__ */ new Date(), name: "e2", level: ChatDebugLogLevel.Info });
      service.addEvent({ kind: "generic", sessionResource: sessionA, created: /* @__PURE__ */ new Date(), name: "e3", level: ChatDebugLogLevel.Info });
      const resources = service.getSessionResources();
      assert.strictEqual(resources.length, 2);
    });
    test("should return empty array when no events", () => {
      assert.deepStrictEqual(service.getSessionResources(), []);
    });
  });
  suite("clear", () => {
    test("should clear all events", () => {
      service.addEvent({ kind: "generic", sessionResource: sessionA, created: /* @__PURE__ */ new Date(), name: "e", level: ChatDebugLogLevel.Info });
      service.addEvent({ kind: "generic", sessionResource: sessionB, created: /* @__PURE__ */ new Date(), name: "e", level: ChatDebugLogLevel.Info });
      service.clear();
      assert.strictEqual(service.getEvents().length, 0);
    });
  });
  suite("MAX_EVENTS_PER_SESSION cap", () => {
    test("should evict oldest events when exceeding per-session cap", () => {
      for (let i = 0; i < 10001; i++) {
        service.addEvent({ kind: "generic", sessionResource: sessionGeneric, created: /* @__PURE__ */ new Date(), name: `event-${i}`, level: ChatDebugLogLevel.Info });
      }
      const events = service.getEvents();
      assert.ok(events.length <= 1e4, "Should not exceed MAX_EVENTS_PER_SESSION");
      assert.ok(!events.find((e) => e.name === "event-0"), "Event-0 should have been evicted");
      assert.ok(events.find((e) => e.name === "event-10000"), "Last event should be present");
    });
    test("should evict oldest session when exceeding MAX_SESSIONS", () => {
      const sessions = [];
      for (let i = 0; i < 6; i++) {
        const uri = URI.parse(`vscode-chat-session://local/session-lru-${i}`);
        sessions.push(uri);
        service.addEvent({ kind: "generic", sessionResource: uri, created: /* @__PURE__ */ new Date(), name: `event-${i}`, level: ChatDebugLogLevel.Info });
      }
      const resources = service.getSessionResources();
      assert.strictEqual(resources.length, 5, "Should not exceed MAX_SESSIONS");
      assert.ok(!resources.some((r) => r.toString() === sessions[0].toString()), "Session-0 should have been evicted");
      assert.strictEqual(service.getEvents(sessions[0]).length, 0, "Events from evicted session should be gone");
      assert.ok(resources.some((r) => r.toString() === sessions[5].toString()), "Session-5 should be present");
    });
    test("should use LRU eviction \u2014 recently-used sessions are kept", () => {
      const sessions = [];
      for (let i = 0; i < 5; i++) {
        const uri = URI.parse(`vscode-chat-session://local/session-lru2-${i}`);
        sessions.push(uri);
        service.addEvent({ kind: "generic", sessionResource: uri, created: /* @__PURE__ */ new Date(), name: `init-${i}`, level: ChatDebugLogLevel.Info });
      }
      service.addEvent({ kind: "generic", sessionResource: sessions[0], created: /* @__PURE__ */ new Date(), name: "touch", level: ChatDebugLogLevel.Info });
      const session6 = URI.parse("vscode-chat-session://local/session-lru2-5");
      service.addEvent({ kind: "generic", sessionResource: session6, created: /* @__PURE__ */ new Date(), name: "new", level: ChatDebugLogLevel.Info });
      const resources = service.getSessionResources();
      assert.strictEqual(resources.length, 5);
      assert.ok(resources.some((r) => r.toString() === sessions[0].toString()), "Session-0 should be kept (recently used)");
      assert.ok(!resources.some((r) => r.toString() === sessions[1].toString()), "Session-1 should be evicted (LRU)");
      assert.ok(resources.some((r) => r.toString() === session6.toString()), "Session-5 should be present");
    });
  });
  suite("activeSessionResource", () => {
    test("should default to undefined", () => {
      assert.strictEqual(service.activeSessionResource, void 0);
    });
    test("should be settable", () => {
      service.activeSessionResource = session1;
      assert.strictEqual(service.activeSessionResource, session1);
    });
  });
  suite("registerProvider", () => {
    test("should register and unregister a provider", async () => {
      const extSession = URI.parse("vscode-chat-session://local/ext-session");
      const provider = {
        provideChatDebugLog: async () => [{
          kind: "generic",
          sessionResource: extSession,
          created: /* @__PURE__ */ new Date(),
          name: "from-provider",
          level: ChatDebugLogLevel.Info
        }]
      };
      const reg = service.registerProvider(provider);
      await service.invokeProviders(extSession);
      const events = service.getEvents(extSession);
      assert.ok(events.some((e) => e.kind === "generic" && e.name === "from-provider"));
      reg.dispose();
    });
    test("provider returning undefined should not add events", async () => {
      const emptySession = URI.parse("vscode-chat-session://local/empty-session");
      const provider = {
        provideChatDebugLog: async () => void 0
      };
      disposables.add(service.registerProvider(provider));
      await service.invokeProviders(emptySession);
      assert.strictEqual(service.getEvents(emptySession).length, 0);
    });
    test("provider errors should be handled gracefully", async () => {
      const errorSession = URI.parse("vscode-chat-session://local/error-session");
      const provider = {
        provideChatDebugLog: async () => {
          throw new Error("boom");
        }
      };
      disposables.add(service.registerProvider(provider));
      const origHandler = errorHandler.getUnexpectedErrorHandler();
      errorHandler.setUnexpectedErrorHandler(() => {
      });
      try {
        await service.invokeProviders(errorSession);
      } finally {
        errorHandler.setUnexpectedErrorHandler(origHandler);
      }
      assert.strictEqual(service.getEvents(errorSession).length, 0);
    });
  });
  suite("invokeProviders", () => {
    test("re-invocation that returns undefined should preserve previously loaded events", async () => {
      let succeed = true;
      const provider = {
        provideChatDebugLog: async () => succeed ? [{
          kind: "generic",
          sessionResource: sessionGeneric,
          created: /* @__PURE__ */ new Date(),
          name: "provider-event",
          level: ChatDebugLogLevel.Info
        }] : void 0
      };
      disposables.add(service.registerProvider(provider));
      await service.invokeProviders(sessionGeneric);
      assert.strictEqual(service.getEvents(sessionGeneric).length, 1);
      succeed = false;
      await service.invokeProviders(sessionGeneric);
      assert.strictEqual(service.getEvents(sessionGeneric).length, 1);
    });
    test("should invoke multiple providers and merge events", async () => {
      const providerA = {
        provideChatDebugLog: async () => [{
          kind: "generic",
          sessionResource: sessionGeneric,
          created: /* @__PURE__ */ new Date(),
          name: "from-A",
          level: ChatDebugLogLevel.Info
        }]
      };
      const providerB = {
        provideChatDebugLog: async () => [{
          kind: "generic",
          sessionResource: sessionGeneric,
          created: /* @__PURE__ */ new Date(),
          name: "from-B",
          level: ChatDebugLogLevel.Info
        }]
      };
      disposables.add(service.registerProvider(providerA));
      disposables.add(service.registerProvider(providerB));
      await service.invokeProviders(sessionGeneric);
      const names = service.getEvents(sessionGeneric).map((e) => e.name);
      assert.ok(names.includes("from-A"));
      assert.ok(names.includes("from-B"));
    });
    test("should cancel previous invocation for same session", async () => {
      let cancelledToken;
      const provider = {
        provideChatDebugLog: async (_sessionResource, token) => {
          cancelledToken = token;
          return [];
        }
      };
      disposables.add(service.registerProvider(provider));
      await service.invokeProviders(sessionGeneric);
      const firstToken = cancelledToken;
      await service.invokeProviders(sessionGeneric);
      assert.strictEqual(firstToken.isCancellationRequested, true);
    });
    test("should fire onDidClearProviderEvents when clearing provider events", async () => {
      const clearedSessions = [];
      disposables.add(service.onDidClearProviderEvents((sessionResource) => clearedSessions.push(sessionResource)));
      const provider = {
        provideChatDebugLog: async (sessionResource) => [{
          kind: "generic",
          sessionResource,
          created: /* @__PURE__ */ new Date(),
          name: "provider-event",
          level: ChatDebugLogLevel.Info
        }]
      };
      disposables.add(service.registerProvider(provider));
      await service.invokeProviders(sessionGeneric);
      assert.strictEqual(clearedSessions.length, 1, "Clear event should fire on first invocation");
      await service.invokeProviders(sessionGeneric);
      assert.strictEqual(clearedSessions.length, 2, "Clear event should fire on second invocation");
      assert.strictEqual(clearedSessions[1].toString(), sessionGeneric.toString());
    });
    test("should not cancel invocations for different sessions", async () => {
      const tokens = /* @__PURE__ */ new Map();
      const provider = {
        provideChatDebugLog: async (sessionResource, token) => {
          tokens.set(sessionResource.toString(), token);
          return [];
        }
      };
      disposables.add(service.registerProvider(provider));
      await service.invokeProviders(sessionA);
      await service.invokeProviders(sessionB);
      const tokenA = tokens.get(sessionA.toString());
      assert.strictEqual(tokenA.isCancellationRequested, false, "session-a token should not be cancelled");
    });
    test("should not invoke providers for ineligible session schemes", async () => {
      let providerCalled = false;
      const provider = {
        provideChatDebugLog: async () => {
          providerCalled = true;
          return [{
            kind: "generic",
            sessionResource: nonLocalSession,
            created: /* @__PURE__ */ new Date(),
            name: "should-not-appear",
            level: ChatDebugLogLevel.Info
          }];
        }
      };
      disposables.add(service.registerProvider(provider));
      await service.invokeProviders(nonLocalSession);
      assert.strictEqual(providerCalled, false);
      assert.strictEqual(service.getEvents(nonLocalSession).length, 0);
    });
    test("should invoke providers for copilotcli sessions", async () => {
      let providerCalled = false;
      const provider = {
        provideChatDebugLog: async () => {
          providerCalled = true;
          return [{
            kind: "generic",
            sessionResource: copilotCliSession,
            created: /* @__PURE__ */ new Date(),
            name: "cli-provider-event",
            level: ChatDebugLogLevel.Info
          }];
        }
      };
      disposables.add(service.registerProvider(provider));
      await service.invokeProviders(copilotCliSession);
      assert.strictEqual(providerCalled, true);
      assert.ok(service.getEvents(copilotCliSession).length > 0);
    });
    test("newly registered provider should be invoked for active sessions", async () => {
      const firstProvider = {
        provideChatDebugLog: async () => []
      };
      disposables.add(service.registerProvider(firstProvider));
      await service.invokeProviders(sessionGeneric);
      const lateEvents = [];
      const lateProvider = {
        provideChatDebugLog: async () => {
          const event = {
            kind: "generic",
            sessionResource: sessionGeneric,
            created: /* @__PURE__ */ new Date(),
            name: "late-provider-event",
            level: ChatDebugLogLevel.Info
          };
          lateEvents.push(event);
          return [event];
        }
      };
      disposables.add(service.registerProvider(lateProvider));
      await new Promise((resolve) => setTimeout(resolve, 10));
      assert.ok(lateEvents.length > 0, "Late provider should have been invoked");
    });
  });
  suite("resolveEvent", () => {
    test("should delegate to provider with resolveChatDebugLogEvent", async () => {
      const resolved = {
        kind: "text",
        value: "resolved detail text"
      };
      const provider = {
        provideChatDebugLog: async () => void 0,
        resolveChatDebugLogEvent: async (eventId) => {
          if (eventId === "my-event") {
            return resolved;
          }
          return void 0;
        }
      };
      disposables.add(service.registerProvider(provider));
      const result = await service.resolveEvent("my-event");
      assert.deepStrictEqual(result, resolved);
    });
    test("should return undefined if no provider resolves the event", async () => {
      const provider = {
        provideChatDebugLog: async () => void 0,
        resolveChatDebugLogEvent: async () => void 0
      };
      disposables.add(service.registerProvider(provider));
      const result = await service.resolveEvent("nonexistent");
      assert.strictEqual(result, void 0);
    });
    test("should return undefined when no providers registered", async () => {
      const result = await service.resolveEvent("any-id");
      assert.strictEqual(result, void 0);
    });
    test("should return first non-undefined resolution from multiple providers", async () => {
      const provider1 = {
        provideChatDebugLog: async () => void 0,
        resolveChatDebugLogEvent: async () => void 0
      };
      const provider2 = {
        provideChatDebugLog: async () => void 0,
        resolveChatDebugLogEvent: async () => ({ kind: "text", value: "from provider 2" })
      };
      disposables.add(service.registerProvider(provider1));
      disposables.add(service.registerProvider(provider2));
      const result = await service.resolveEvent("any");
      assert.deepStrictEqual(result, { kind: "text", value: "from provider 2" });
    });
  });
  suite("endSession", () => {
    test("should cancel and remove the CTS for a session", async () => {
      let capturedToken;
      const provider = {
        provideChatDebugLog: async (_sessionResource, token) => {
          capturedToken = token;
          return [];
        }
      };
      disposables.add(service.registerProvider(provider));
      await service.invokeProviders(sessionGeneric);
      assert.ok(capturedToken);
      assert.strictEqual(capturedToken.isCancellationRequested, false);
      service.endSession(sessionGeneric);
      assert.strictEqual(capturedToken.isCancellationRequested, true);
    });
    test("should be safe to call for unknown session", () => {
      service.endSession(URI.parse("vscode-chat-session://local/nonexistent"));
    });
    test("late provider should not be invoked for ended session", async () => {
      const firstProvider = {
        provideChatDebugLog: async () => []
      };
      disposables.add(service.registerProvider(firstProvider));
      await service.invokeProviders(sessionGeneric);
      service.endSession(sessionGeneric);
      let lateCalled = false;
      const lateProvider = {
        provideChatDebugLog: async () => {
          lateCalled = true;
          return [];
        }
      };
      disposables.add(service.registerProvider(lateProvider));
      await new Promise((resolve) => setTimeout(resolve, 10));
      assert.strictEqual(lateCalled, false, "Late provider should not be invoked for ended session");
    });
  });
  suite("dispose", () => {
    test("should cancel active invocations on dispose", async () => {
      let capturedToken;
      const provider = {
        provideChatDebugLog: async (_sessionResource, token) => {
          capturedToken = token;
          return [];
        }
      };
      disposables.add(service.registerProvider(provider));
      await service.invokeProviders(sessionGeneric);
      const cts = new CancellationTokenSource();
      disposables.add(cts);
      service.dispose();
      assert.ok(capturedToken);
      assert.strictEqual(capturedToken.isCancellationRequested, true);
    });
  });
  suite("event deduplication", () => {
    test("should deduplicate events with the same ID, keeping the richer kind", () => {
      const userMsg = {
        kind: "userMessage",
        id: "shared-id-1",
        sessionResource: session1,
        created: /* @__PURE__ */ new Date("2026-01-01T00:00:00Z"),
        message: "hello",
        sections: []
      };
      const subagent = {
        kind: "subagentInvocation",
        id: "shared-id-1",
        sessionResource: session1,
        created: /* @__PURE__ */ new Date("2026-01-01T00:00:01Z"),
        agentName: "Explore"
      };
      service.addEvent(userMsg);
      service.addEvent(subagent);
      const events = service.getEvents(session1);
      assert.strictEqual(events.length, 1);
      assert.strictEqual(events[0].kind, "subagentInvocation");
    });
    test("should keep richer event when it arrives first", () => {
      const subagent = {
        kind: "subagentInvocation",
        id: "shared-id-2",
        sessionResource: session1,
        created: /* @__PURE__ */ new Date("2026-01-01T00:00:00Z"),
        agentName: "Explore"
      };
      const userMsg = {
        kind: "userMessage",
        id: "shared-id-2",
        sessionResource: session1,
        created: /* @__PURE__ */ new Date("2026-01-01T00:00:01Z"),
        message: "hello",
        sections: []
      };
      service.addEvent(subagent);
      service.addEvent(userMsg);
      const events = service.getEvents(session1);
      assert.strictEqual(events.length, 1);
      assert.strictEqual(events[0].kind, "subagentInvocation");
    });
    test("should not fire onDidAddEvent for skipped duplicates", () => {
      const firedKinds = [];
      disposables.add(service.onDidAddEvent((e) => firedKinds.push(e.kind)));
      const subagent = {
        kind: "subagentInvocation",
        id: "shared-id-3",
        sessionResource: session1,
        created: /* @__PURE__ */ new Date("2026-01-01T00:00:00Z"),
        agentName: "Explore"
      };
      const userMsg = {
        kind: "userMessage",
        id: "shared-id-3",
        sessionResource: session1,
        created: /* @__PURE__ */ new Date("2026-01-01T00:00:01Z"),
        message: "hello",
        sections: []
      };
      service.addEvent(subagent);
      service.addEvent(userMsg);
      assert.deepStrictEqual(firedKinds, ["subagentInvocation"]);
    });
    test("should allow events without IDs to coexist", () => {
      const event1 = {
        kind: "generic",
        sessionResource: session1,
        created: /* @__PURE__ */ new Date("2026-01-01T00:00:00Z"),
        name: "a",
        level: ChatDebugLogLevel.Info
      };
      const event2 = {
        kind: "generic",
        sessionResource: session1,
        created: /* @__PURE__ */ new Date("2026-01-01T00:00:01Z"),
        name: "b",
        level: ChatDebugLogLevel.Info
      };
      service.addEvent(event1);
      service.addEvent(event2);
      const events = service.getEvents(session1);
      assert.strictEqual(events.length, 2);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGNvbW1vblxcY2hhdERlYnVnU2VydmljZUltcGwudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuLCBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBlcnJvckhhbmRsZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi90ZXN0L2NvbW1vbi90ZXN0Q29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2hhdERlYnVnTG9nTGV2ZWwsIElDaGF0RGVidWdFdmVudCwgSUNoYXREZWJ1Z0dlbmVyaWNFdmVudCwgSUNoYXREZWJ1Z0xvZ1Byb3ZpZGVyLCBJQ2hhdERlYnVnTW9kZWxUdXJuRXZlbnQsIElDaGF0RGVidWdSZXNvbHZlZEV2ZW50Q29udGVudCwgSUNoYXREZWJ1Z1Rvb2xDYWxsRXZlbnQgfSBmcm9tICcuLi8uLi9jb21tb24vY2hhdERlYnVnU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0RGVidWdTZXJ2aWNlSW1wbCB9IGZyb20gJy4uLy4uL2NvbW1vbi9jaGF0RGVidWdTZXJ2aWNlSW1wbC5qcyc7XG5pbXBvcnQgeyBMb2NhbENoYXRTZXNzaW9uVXJpIH0gZnJvbSAnLi4vLi4vY29tbW9uL21vZGVsL2NoYXRVcmkuanMnO1xuXG5zdWl0ZSgnQ2hhdERlYnVnU2VydmljZUltcGwnLCAoKSA9PiB7XG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0bGV0IHNlcnZpY2U6IENoYXREZWJ1Z1NlcnZpY2VJbXBsO1xuXG5cdGNvbnN0IHNlc3Npb24xID0gVVJJLnBhcnNlKCd2c2NvZGUtY2hhdC1zZXNzaW9uOi8vbG9jYWwvc2Vzc2lvbi0xJyk7XG5cdGNvbnN0IHNlc3Npb24yID0gVVJJLnBhcnNlKCd2c2NvZGUtY2hhdC1zZXNzaW9uOi8vbG9jYWwvc2Vzc2lvbi0yJyk7XG5cdGNvbnN0IHNlc3Npb25BID0gTG9jYWxDaGF0U2Vzc2lvblVyaS5mb3JTZXNzaW9uKCdhJyk7XG5cdGNvbnN0IHNlc3Npb25CID0gTG9jYWxDaGF0U2Vzc2lvblVyaS5mb3JTZXNzaW9uKCdiJyk7XG5cdGNvbnN0IHNlc3Npb25HZW5lcmljID0gVVJJLnBhcnNlKCd2c2NvZGUtY2hhdC1zZXNzaW9uOi8vbG9jYWwvc2Vzc2lvbicpO1xuXHRjb25zdCBub25Mb2NhbFNlc3Npb24gPSBVUkkucGFyc2UoJ3NvbWUtb3RoZXItc2NoZW1lOi8vYXV0aG9yaXR5L3Nlc3Npb24tMScpO1xuXHRjb25zdCBjb3BpbG90Q2xpU2Vzc2lvbiA9IFVSSS5wYXJzZSgnY29waWxvdGNsaTovdGVzdC1zZXNzaW9uLWlkJyk7XG5cblx0c2V0dXAoKCkgPT4ge1xuXHRcdHNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IENoYXREZWJ1Z1NlcnZpY2VJbXBsKG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoKSkpO1xuXHR9KTtcblxuXHRzdWl0ZSgnYWRkRXZlbnQgYW5kIGdldEV2ZW50cycsICgpID0+IHtcblx0XHR0ZXN0KCdzaG91bGQgYWRkIGFuZCByZXRyaWV2ZSBldmVudHMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBldmVudDogSUNoYXREZWJ1Z0dlbmVyaWNFdmVudCA9IHtcblx0XHRcdFx0a2luZDogJ2dlbmVyaWMnLFxuXHRcdFx0XHRzZXNzaW9uUmVzb3VyY2U6IHNlc3Npb24xLFxuXHRcdFx0XHRjcmVhdGVkOiBuZXcgRGF0ZSgpLFxuXHRcdFx0XHRuYW1lOiAndGVzdC1ldmVudCcsXG5cdFx0XHRcdGxldmVsOiBDaGF0RGVidWdMb2dMZXZlbC5JbmZvLFxuXHRcdFx0fTtcblxuXHRcdFx0c2VydmljZS5hZGRFdmVudChldmVudCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2VydmljZS5nZXRFdmVudHMoKSwgW2V2ZW50XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgZmlsdGVyIGV2ZW50cyBieSBzZXNzaW9uUmVzb3VyY2UnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBldmVudDE6IElDaGF0RGVidWdHZW5lcmljRXZlbnQgPSB7XG5cdFx0XHRcdGtpbmQ6ICdnZW5lcmljJyxcblx0XHRcdFx0c2Vzc2lvblJlc291cmNlOiBzZXNzaW9uMSxcblx0XHRcdFx0Y3JlYXRlZDogbmV3IERhdGUoKSxcblx0XHRcdFx0bmFtZTogJ2V2ZW50LTEnLFxuXHRcdFx0XHRsZXZlbDogQ2hhdERlYnVnTG9nTGV2ZWwuSW5mbyxcblx0XHRcdH07XG5cdFx0XHRjb25zdCBldmVudDI6IElDaGF0RGVidWdHZW5lcmljRXZlbnQgPSB7XG5cdFx0XHRcdGtpbmQ6ICdnZW5lcmljJyxcblx0XHRcdFx0c2Vzc2lvblJlc291cmNlOiBzZXNzaW9uMixcblx0XHRcdFx0Y3JlYXRlZDogbmV3IERhdGUoKSxcblx0XHRcdFx0bmFtZTogJ2V2ZW50LTInLFxuXHRcdFx0XHRsZXZlbDogQ2hhdERlYnVnTG9nTGV2ZWwuV2FybmluZyxcblx0XHRcdH07XG5cblx0XHRcdHNlcnZpY2UuYWRkRXZlbnQoZXZlbnQxKTtcblx0XHRcdHNlcnZpY2UuYWRkRXZlbnQoZXZlbnQyKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZXJ2aWNlLmdldEV2ZW50cyhzZXNzaW9uMSksIFtldmVudDFdKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2VydmljZS5nZXRFdmVudHMoc2Vzc2lvbjIpLCBbZXZlbnQyXSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5nZXRFdmVudHMoKS5sZW5ndGgsIDIpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGZpcmUgb25EaWRBZGRFdmVudCB3aGVuIGV2ZW50IGlzIGFkZGVkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZmlyZWRFdmVudHM6IElDaGF0RGVidWdFdmVudFtdID0gW107XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5vbkRpZEFkZEV2ZW50KGUgPT4gZmlyZWRFdmVudHMucHVzaChlKSkpO1xuXG5cdFx0XHRjb25zdCBldmVudDogSUNoYXREZWJ1Z0dlbmVyaWNFdmVudCA9IHtcblx0XHRcdFx0a2luZDogJ2dlbmVyaWMnLFxuXHRcdFx0XHRzZXNzaW9uUmVzb3VyY2U6IHNlc3Npb24xLFxuXHRcdFx0XHRjcmVhdGVkOiBuZXcgRGF0ZSgpLFxuXHRcdFx0XHRuYW1lOiAndGVzdCcsXG5cdFx0XHRcdGxldmVsOiBDaGF0RGVidWdMb2dMZXZlbC5JbmZvLFxuXHRcdFx0fTtcblx0XHRcdHNlcnZpY2UuYWRkRXZlbnQoZXZlbnQpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGZpcmVkRXZlbnRzLCBbZXZlbnRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBoYW5kbGUgZGlmZmVyZW50IGV2ZW50IGtpbmRzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdG9vbENhbGw6IElDaGF0RGVidWdUb29sQ2FsbEV2ZW50ID0ge1xuXHRcdFx0XHRraW5kOiAndG9vbENhbGwnLFxuXHRcdFx0XHRzZXNzaW9uUmVzb3VyY2U6IHNlc3Npb24xLFxuXHRcdFx0XHRjcmVhdGVkOiBuZXcgRGF0ZSgpLFxuXHRcdFx0XHR0b29sTmFtZTogJ3JlYWRGaWxlJyxcblx0XHRcdFx0dG9vbENhbGxJZDogJ2NhbGwtMScsXG5cdFx0XHRcdGlucHV0OiAne1wicGF0aFwiOiBcIi9mb28udHNcIn0nLFxuXHRcdFx0XHRvdXRwdXQ6ICdmaWxlIGNvbnRlbnRzJyxcblx0XHRcdFx0cmVzdWx0OiAnc3VjY2VzcycsXG5cdFx0XHRcdGR1cmF0aW9uSW5NaWxsaXM6IDQyLFxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IG1vZGVsVHVybjogSUNoYXREZWJ1Z01vZGVsVHVybkV2ZW50ID0ge1xuXHRcdFx0XHRraW5kOiAnbW9kZWxUdXJuJyxcblx0XHRcdFx0c2Vzc2lvblJlc291cmNlOiBzZXNzaW9uMSxcblx0XHRcdFx0Y3JlYXRlZDogbmV3IERhdGUoKSxcblx0XHRcdFx0bW9kZWw6ICdncHQtNCcsXG5cdFx0XHRcdGlucHV0VG9rZW5zOiAxMDAsXG5cdFx0XHRcdG91dHB1dFRva2VuczogNTAsXG5cdFx0XHRcdHRvdGFsVG9rZW5zOiAxNTAsXG5cdFx0XHRcdGNvcGlsb3RVc2FnZU5hbm9BaXU6IDVfMDAwXzAwMF8wMDAsXG5cdFx0XHRcdGR1cmF0aW9uSW5NaWxsaXM6IDEyMDAsXG5cdFx0XHR9O1xuXG5cdFx0XHRzZXJ2aWNlLmFkZEV2ZW50KHRvb2xDYWxsKTtcblx0XHRcdHNlcnZpY2UuYWRkRXZlbnQobW9kZWxUdXJuKTtcblxuXHRcdFx0Y29uc3QgZXZlbnRzID0gc2VydmljZS5nZXRFdmVudHMoc2Vzc2lvbjEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50cy5sZW5ndGgsIDIpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50c1swXS5raW5kLCAndG9vbENhbGwnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudHNbMV0ua2luZCwgJ21vZGVsVHVybicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChldmVudHNbMV0gYXMgSUNoYXREZWJ1Z01vZGVsVHVybkV2ZW50KS5jb3BpbG90VXNhZ2VOYW5vQWl1LCA1XzAwMF8wMDBfMDAwKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2xvZycsICgpID0+IHtcblx0XHR0ZXN0KCdzaG91bGQgY3JlYXRlIGEgZ2VuZXJpYyBldmVudCB3aXRoIGRlZmF1bHRzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZmlyZWRFdmVudHM6IElDaGF0RGVidWdFdmVudFtdID0gW107XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5vbkRpZEFkZEV2ZW50KGUgPT4gZmlyZWRFdmVudHMucHVzaChlKSkpO1xuXG5cdFx0XHRzZXJ2aWNlLmxvZyhzZXNzaW9uMSwgJ1NvbWUgbmFtZScsICdTb21lIGRldGFpbHMnKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcmVkRXZlbnRzLmxlbmd0aCwgMSk7XG5cdFx0XHRjb25zdCBldmVudCA9IGZpcmVkRXZlbnRzWzBdO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50LmtpbmQsICdnZW5lcmljJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQuc2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCksIHNlc3Npb24xLnRvU3RyaW5nKCkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChldmVudCBhcyBJQ2hhdERlYnVnR2VuZXJpY0V2ZW50KS5uYW1lLCAnU29tZSBuYW1lJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKGV2ZW50IGFzIElDaGF0RGVidWdHZW5lcmljRXZlbnQpLmRldGFpbHMsICdTb21lIGRldGFpbHMnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoZXZlbnQgYXMgSUNoYXREZWJ1Z0dlbmVyaWNFdmVudCkubGV2ZWwsIENoYXREZWJ1Z0xvZ0xldmVsLkluZm8pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGFjY2VwdCBjdXN0b20gbGV2ZWwgYW5kIG9wdGlvbnMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBmaXJlZEV2ZW50czogSUNoYXREZWJ1Z0V2ZW50W10gPSBbXTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLm9uRGlkQWRkRXZlbnQoZSA9PiBmaXJlZEV2ZW50cy5wdXNoKGUpKSk7XG5cblx0XHRcdHNlcnZpY2UubG9nKHNlc3Npb24xLCAnd2FybmluZy1ldmVudCcsICdvaCBubycsIENoYXREZWJ1Z0xvZ0xldmVsLldhcm5pbmcsIHtcblx0XHRcdFx0aWQ6ICdteS1pZCcsXG5cdFx0XHRcdGNhdGVnb3J5OiAndGVzdGluZycsXG5cdFx0XHRcdHBhcmVudEV2ZW50SWQ6ICdwYXJlbnQtMScsXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgZXZlbnQgPSBmaXJlZEV2ZW50c1swXSBhcyBJQ2hhdERlYnVnR2VuZXJpY0V2ZW50O1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50LmxldmVsLCBDaGF0RGVidWdMb2dMZXZlbC5XYXJuaW5nKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudC5pZCwgJ215LWlkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQuY2F0ZWdvcnksICd0ZXN0aW5nJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQucGFyZW50RXZlbnRJZCwgJ3BhcmVudC0xJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgbm90IGxvZyBldmVudHMgZm9yIGluZWxpZ2libGUgc2Vzc2lvbiBzY2hlbWVzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZmlyZWRFdmVudHM6IElDaGF0RGVidWdFdmVudFtdID0gW107XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5vbkRpZEFkZEV2ZW50KGUgPT4gZmlyZWRFdmVudHMucHVzaChlKSkpO1xuXG5cdFx0XHRzZXJ2aWNlLmxvZyhub25Mb2NhbFNlc3Npb24sICdzaG91bGQtYmUtc2tpcHBlZCcsICdkZXRhaWxzJyk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJlZEV2ZW50cy5sZW5ndGgsIDApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuZ2V0RXZlbnRzKG5vbkxvY2FsU2Vzc2lvbikubGVuZ3RoLCAwKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBsb2cgZXZlbnRzIGZvciBjb3BpbG90Y2xpIHNlc3Npb25zJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZmlyZWRFdmVudHM6IElDaGF0RGVidWdFdmVudFtdID0gW107XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5vbkRpZEFkZEV2ZW50KGUgPT4gZmlyZWRFdmVudHMucHVzaChlKSkpO1xuXG5cdFx0XHRzZXJ2aWNlLmxvZyhjb3BpbG90Q2xpU2Vzc2lvbiwgJ2NsaS1ldmVudCcsICdkZXRhaWxzJyk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJlZEV2ZW50cy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuZ2V0RXZlbnRzKGNvcGlsb3RDbGlTZXNzaW9uKS5sZW5ndGgsIDEpO1xuXHRcdH0pO1xuXG5cdH0pO1xuXG5cdHN1aXRlKCdnZXRTZXNzaW9uUmVzb3VyY2VzJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3Nob3VsZCByZXR1cm4gdW5pcXVlIHNlc3Npb24gcmVzb3VyY2VzJywgKCkgPT4ge1xuXHRcdFx0c2VydmljZS5hZGRFdmVudCh7IGtpbmQ6ICdnZW5lcmljJywgc2Vzc2lvblJlc291cmNlOiBzZXNzaW9uQSwgY3JlYXRlZDogbmV3IERhdGUoKSwgbmFtZTogJ2UxJywgbGV2ZWw6IENoYXREZWJ1Z0xvZ0xldmVsLkluZm8gfSk7XG5cdFx0XHRzZXJ2aWNlLmFkZEV2ZW50KHsga2luZDogJ2dlbmVyaWMnLCBzZXNzaW9uUmVzb3VyY2U6IHNlc3Npb25CLCBjcmVhdGVkOiBuZXcgRGF0ZSgpLCBuYW1lOiAnZTInLCBsZXZlbDogQ2hhdERlYnVnTG9nTGV2ZWwuSW5mbyB9KTtcblx0XHRcdHNlcnZpY2UuYWRkRXZlbnQoeyBraW5kOiAnZ2VuZXJpYycsIHNlc3Npb25SZXNvdXJjZTogc2Vzc2lvbkEsIGNyZWF0ZWQ6IG5ldyBEYXRlKCksIG5hbWU6ICdlMycsIGxldmVsOiBDaGF0RGVidWdMb2dMZXZlbC5JbmZvIH0pO1xuXG5cdFx0XHRjb25zdCByZXNvdXJjZXMgPSBzZXJ2aWNlLmdldFNlc3Npb25SZXNvdXJjZXMoKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNvdXJjZXMubGVuZ3RoLCAyKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCByZXR1cm4gZW1wdHkgYXJyYXkgd2hlbiBubyBldmVudHMnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlcnZpY2UuZ2V0U2Vzc2lvblJlc291cmNlcygpLCBbXSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdjbGVhcicsICgpID0+IHtcblx0XHR0ZXN0KCdzaG91bGQgY2xlYXIgYWxsIGV2ZW50cycsICgpID0+IHtcblx0XHRcdHNlcnZpY2UuYWRkRXZlbnQoeyBraW5kOiAnZ2VuZXJpYycsIHNlc3Npb25SZXNvdXJjZTogc2Vzc2lvbkEsIGNyZWF0ZWQ6IG5ldyBEYXRlKCksIG5hbWU6ICdlJywgbGV2ZWw6IENoYXREZWJ1Z0xvZ0xldmVsLkluZm8gfSk7XG5cdFx0XHRzZXJ2aWNlLmFkZEV2ZW50KHsga2luZDogJ2dlbmVyaWMnLCBzZXNzaW9uUmVzb3VyY2U6IHNlc3Npb25CLCBjcmVhdGVkOiBuZXcgRGF0ZSgpLCBuYW1lOiAnZScsIGxldmVsOiBDaGF0RGVidWdMb2dMZXZlbC5JbmZvIH0pO1xuXG5cdFx0XHRzZXJ2aWNlLmNsZWFyKCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmdldEV2ZW50cygpLmxlbmd0aCwgMCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdNQVhfRVZFTlRTX1BFUl9TRVNTSU9OIGNhcCcsICgpID0+IHtcblx0XHR0ZXN0KCdzaG91bGQgZXZpY3Qgb2xkZXN0IGV2ZW50cyB3aGVuIGV4Y2VlZGluZyBwZXItc2Vzc2lvbiBjYXAnLCAoKSA9PiB7XG5cdFx0XHQvLyBUaGUgbWF4IHBlciBzZXNzaW9uIGlzIDEwXzAwMC4gQWRkIG1vcmUgdGhhbiB0aGF0IHRvIGEgc2luZ2xlIHNlc3Npb24uXG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IDEwXzAwMTsgaSsrKSB7XG5cdFx0XHRcdHNlcnZpY2UuYWRkRXZlbnQoeyBraW5kOiAnZ2VuZXJpYycsIHNlc3Npb25SZXNvdXJjZTogc2Vzc2lvbkdlbmVyaWMsIGNyZWF0ZWQ6IG5ldyBEYXRlKCksIG5hbWU6IGBldmVudC0ke2l9YCwgbGV2ZWw6IENoYXREZWJ1Z0xvZ0xldmVsLkluZm8gfSk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGV2ZW50cyA9IHNlcnZpY2UuZ2V0RXZlbnRzKCk7XG5cdFx0XHRhc3NlcnQub2soZXZlbnRzLmxlbmd0aCA8PSAxMF8wMDAsICdTaG91bGQgbm90IGV4Y2VlZCBNQVhfRVZFTlRTX1BFUl9TRVNTSU9OJyk7XG5cdFx0XHQvLyBUaGUgZmlyc3QgZXZlbnQgc2hvdWxkIGhhdmUgYmVlbiBldmljdGVkXG5cdFx0XHRhc3NlcnQub2soIShldmVudHMgYXMgSUNoYXREZWJ1Z0dlbmVyaWNFdmVudFtdKS5maW5kKGUgPT4gZS5uYW1lID09PSAnZXZlbnQtMCcpLCAnRXZlbnQtMCBzaG91bGQgaGF2ZSBiZWVuIGV2aWN0ZWQnKTtcblx0XHRcdC8vIFRoZSBsYXN0IGV2ZW50IHNob3VsZCBiZSBwcmVzZW50XG5cdFx0XHRhc3NlcnQub2soKGV2ZW50cyBhcyBJQ2hhdERlYnVnR2VuZXJpY0V2ZW50W10pLmZpbmQoZSA9PiBlLm5hbWUgPT09ICdldmVudC0xMDAwMCcpLCAnTGFzdCBldmVudCBzaG91bGQgYmUgcHJlc2VudCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGV2aWN0IG9sZGVzdCBzZXNzaW9uIHdoZW4gZXhjZWVkaW5nIE1BWF9TRVNTSU9OUycsICgpID0+IHtcblx0XHRcdC8vIE1BWF9TRVNTSU9OUyBpcyA1IFx1MjAxNCBhZGQgZXZlbnRzIHRvIDYgZGlmZmVyZW50IHNlc3Npb25zXG5cdFx0XHRjb25zdCBzZXNzaW9uczogVVJJW10gPSBbXTtcblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgNjsgaSsrKSB7XG5cdFx0XHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZShgdnNjb2RlLWNoYXQtc2Vzc2lvbjovL2xvY2FsL3Nlc3Npb24tbHJ1LSR7aX1gKTtcblx0XHRcdFx0c2Vzc2lvbnMucHVzaCh1cmkpO1xuXHRcdFx0XHRzZXJ2aWNlLmFkZEV2ZW50KHsga2luZDogJ2dlbmVyaWMnLCBzZXNzaW9uUmVzb3VyY2U6IHVyaSwgY3JlYXRlZDogbmV3IERhdGUoKSwgbmFtZTogYGV2ZW50LSR7aX1gLCBsZXZlbDogQ2hhdERlYnVnTG9nTGV2ZWwuSW5mbyB9KTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgcmVzb3VyY2VzID0gc2VydmljZS5nZXRTZXNzaW9uUmVzb3VyY2VzKCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzb3VyY2VzLmxlbmd0aCwgNSwgJ1Nob3VsZCBub3QgZXhjZWVkIE1BWF9TRVNTSU9OUycpO1xuXHRcdFx0Ly8gVGhlIGZpcnN0IHNlc3Npb24gc2hvdWxkIGhhdmUgYmVlbiBldmljdGVkXG5cdFx0XHRhc3NlcnQub2soIXJlc291cmNlcy5zb21lKHIgPT4gci50b1N0cmluZygpID09PSBzZXNzaW9uc1swXS50b1N0cmluZygpKSwgJ1Nlc3Npb24tMCBzaG91bGQgaGF2ZSBiZWVuIGV2aWN0ZWQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmdldEV2ZW50cyhzZXNzaW9uc1swXSkubGVuZ3RoLCAwLCAnRXZlbnRzIGZyb20gZXZpY3RlZCBzZXNzaW9uIHNob3VsZCBiZSBnb25lJyk7XG5cdFx0XHQvLyBUaGUgbGFzdCBzZXNzaW9uIHNob3VsZCBiZSBwcmVzZW50XG5cdFx0XHRhc3NlcnQub2socmVzb3VyY2VzLnNvbWUociA9PiByLnRvU3RyaW5nKCkgPT09IHNlc3Npb25zWzVdLnRvU3RyaW5nKCkpLCAnU2Vzc2lvbi01IHNob3VsZCBiZSBwcmVzZW50Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgdXNlIExSVSBldmljdGlvbiBcdTIwMTQgcmVjZW50bHktdXNlZCBzZXNzaW9ucyBhcmUga2VwdCcsICgpID0+IHtcblx0XHRcdC8vIEZpbGwgdG8gTUFYX1NFU1NJT05TICg1KVxuXHRcdFx0Y29uc3Qgc2Vzc2lvbnM6IFVSSVtdID0gW107XG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IDU7IGkrKykge1xuXHRcdFx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UoYHZzY29kZS1jaGF0LXNlc3Npb246Ly9sb2NhbC9zZXNzaW9uLWxydTItJHtpfWApO1xuXHRcdFx0XHRzZXNzaW9ucy5wdXNoKHVyaSk7XG5cdFx0XHRcdHNlcnZpY2UuYWRkRXZlbnQoeyBraW5kOiAnZ2VuZXJpYycsIHNlc3Npb25SZXNvdXJjZTogdXJpLCBjcmVhdGVkOiBuZXcgRGF0ZSgpLCBuYW1lOiBgaW5pdC0ke2l9YCwgbGV2ZWw6IENoYXREZWJ1Z0xvZ0xldmVsLkluZm8gfSk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFRvdWNoIHNlc3Npb24tMCBzbyBpdCBtb3ZlcyB0byB0aGUgYmFjayBvZiB0aGUgTFJVIG9yZGVyXG5cdFx0XHRzZXJ2aWNlLmFkZEV2ZW50KHsga2luZDogJ2dlbmVyaWMnLCBzZXNzaW9uUmVzb3VyY2U6IHNlc3Npb25zWzBdLCBjcmVhdGVkOiBuZXcgRGF0ZSgpLCBuYW1lOiAndG91Y2gnLCBsZXZlbDogQ2hhdERlYnVnTG9nTGV2ZWwuSW5mbyB9KTtcblxuXHRcdFx0Ly8gQWRkIGEgNnRoIHNlc3Npb24gXHUyMDE0IHNlc3Npb24tMSAodGhlIHRydWUgTFJVKSBzaG91bGQgYmUgZXZpY3RlZCwgbm90IHNlc3Npb24tMFxuXHRcdFx0Y29uc3Qgc2Vzc2lvbjYgPSBVUkkucGFyc2UoJ3ZzY29kZS1jaGF0LXNlc3Npb246Ly9sb2NhbC9zZXNzaW9uLWxydTItNScpO1xuXHRcdFx0c2VydmljZS5hZGRFdmVudCh7IGtpbmQ6ICdnZW5lcmljJywgc2Vzc2lvblJlc291cmNlOiBzZXNzaW9uNiwgY3JlYXRlZDogbmV3IERhdGUoKSwgbmFtZTogJ25ldycsIGxldmVsOiBDaGF0RGVidWdMb2dMZXZlbC5JbmZvIH0pO1xuXG5cdFx0XHRjb25zdCByZXNvdXJjZXMgPSBzZXJ2aWNlLmdldFNlc3Npb25SZXNvdXJjZXMoKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNvdXJjZXMubGVuZ3RoLCA1KTtcblx0XHRcdGFzc2VydC5vayhyZXNvdXJjZXMuc29tZShyID0+IHIudG9TdHJpbmcoKSA9PT0gc2Vzc2lvbnNbMF0udG9TdHJpbmcoKSksICdTZXNzaW9uLTAgc2hvdWxkIGJlIGtlcHQgKHJlY2VudGx5IHVzZWQpJyk7XG5cdFx0XHRhc3NlcnQub2soIXJlc291cmNlcy5zb21lKHIgPT4gci50b1N0cmluZygpID09PSBzZXNzaW9uc1sxXS50b1N0cmluZygpKSwgJ1Nlc3Npb24tMSBzaG91bGQgYmUgZXZpY3RlZCAoTFJVKScpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc291cmNlcy5zb21lKHIgPT4gci50b1N0cmluZygpID09PSBzZXNzaW9uNi50b1N0cmluZygpKSwgJ1Nlc3Npb24tNSBzaG91bGQgYmUgcHJlc2VudCcpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnYWN0aXZlU2Vzc2lvblJlc291cmNlJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3Nob3VsZCBkZWZhdWx0IHRvIHVuZGVmaW5lZCcsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmFjdGl2ZVNlc3Npb25SZXNvdXJjZSwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBiZSBzZXR0YWJsZScsICgpID0+IHtcblx0XHRcdHNlcnZpY2UuYWN0aXZlU2Vzc2lvblJlc291cmNlID0gc2Vzc2lvbjE7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmFjdGl2ZVNlc3Npb25SZXNvdXJjZSwgc2Vzc2lvbjEpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgncmVnaXN0ZXJQcm92aWRlcicsICgpID0+IHtcblx0XHR0ZXN0KCdzaG91bGQgcmVnaXN0ZXIgYW5kIHVucmVnaXN0ZXIgYSBwcm92aWRlcicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGV4dFNlc3Npb24gPSBVUkkucGFyc2UoJ3ZzY29kZS1jaGF0LXNlc3Npb246Ly9sb2NhbC9leHQtc2Vzc2lvbicpO1xuXHRcdFx0Y29uc3QgcHJvdmlkZXI6IElDaGF0RGVidWdMb2dQcm92aWRlciA9IHtcblx0XHRcdFx0cHJvdmlkZUNoYXREZWJ1Z0xvZzogYXN5bmMgKCkgPT4gW3tcblx0XHRcdFx0XHRraW5kOiAnZ2VuZXJpYycsXG5cdFx0XHRcdFx0c2Vzc2lvblJlc291cmNlOiBleHRTZXNzaW9uLFxuXHRcdFx0XHRcdGNyZWF0ZWQ6IG5ldyBEYXRlKCksXG5cdFx0XHRcdFx0bmFtZTogJ2Zyb20tcHJvdmlkZXInLFxuXHRcdFx0XHRcdGxldmVsOiBDaGF0RGVidWdMb2dMZXZlbC5JbmZvLFxuXHRcdFx0XHR9XSxcblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IHJlZyA9IHNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcihwcm92aWRlcik7XG5cdFx0XHRhd2FpdCBzZXJ2aWNlLmludm9rZVByb3ZpZGVycyhleHRTZXNzaW9uKTtcblxuXHRcdFx0Y29uc3QgZXZlbnRzID0gc2VydmljZS5nZXRFdmVudHMoZXh0U2Vzc2lvbik7XG5cdFx0XHRhc3NlcnQub2soZXZlbnRzLnNvbWUoZSA9PiBlLmtpbmQgPT09ICdnZW5lcmljJyAmJiAoZSBhcyBJQ2hhdERlYnVnR2VuZXJpY0V2ZW50KS5uYW1lID09PSAnZnJvbS1wcm92aWRlcicpKTtcblxuXHRcdFx0cmVnLmRpc3Bvc2UoKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Byb3ZpZGVyIHJldHVybmluZyB1bmRlZmluZWQgc2hvdWxkIG5vdCBhZGQgZXZlbnRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZW1wdHlTZXNzaW9uID0gVVJJLnBhcnNlKCd2c2NvZGUtY2hhdC1zZXNzaW9uOi8vbG9jYWwvZW1wdHktc2Vzc2lvbicpO1xuXHRcdFx0Y29uc3QgcHJvdmlkZXI6IElDaGF0RGVidWdMb2dQcm92aWRlciA9IHtcblx0XHRcdFx0cHJvdmlkZUNoYXREZWJ1Z0xvZzogYXN5bmMgKCkgPT4gdW5kZWZpbmVkLFxuXHRcdFx0fTtcblxuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcihwcm92aWRlcikpO1xuXHRcdFx0YXdhaXQgc2VydmljZS5pbnZva2VQcm92aWRlcnMoZW1wdHlTZXNzaW9uKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuZ2V0RXZlbnRzKGVtcHR5U2Vzc2lvbikubGVuZ3RoLCAwKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Byb3ZpZGVyIGVycm9ycyBzaG91bGQgYmUgaGFuZGxlZCBncmFjZWZ1bGx5JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZXJyb3JTZXNzaW9uID0gVVJJLnBhcnNlKCd2c2NvZGUtY2hhdC1zZXNzaW9uOi8vbG9jYWwvZXJyb3Itc2Vzc2lvbicpO1xuXHRcdFx0Y29uc3QgcHJvdmlkZXI6IElDaGF0RGVidWdMb2dQcm92aWRlciA9IHtcblx0XHRcdFx0cHJvdmlkZUNoYXREZWJ1Z0xvZzogYXN5bmMgKCkgPT4geyB0aHJvdyBuZXcgRXJyb3IoJ2Jvb20nKTsgfSxcblx0XHRcdH07XG5cblx0XHRcdGRpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIocHJvdmlkZXIpKTtcblx0XHRcdC8vIFN1cHByZXNzIHRoZSBleHBlY3RlZCBvblVuZXhwZWN0ZWRFcnJvciBmcm9tIF9pbnZva2VQcm92aWRlclxuXHRcdFx0Y29uc3Qgb3JpZ0hhbmRsZXIgPSBlcnJvckhhbmRsZXIuZ2V0VW5leHBlY3RlZEVycm9ySGFuZGxlcigpO1xuXHRcdFx0ZXJyb3JIYW5kbGVyLnNldFVuZXhwZWN0ZWRFcnJvckhhbmRsZXIoKCkgPT4geyB9KTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IHNlcnZpY2UuaW52b2tlUHJvdmlkZXJzKGVycm9yU2Vzc2lvbik7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRlcnJvckhhbmRsZXIuc2V0VW5leHBlY3RlZEVycm9ySGFuZGxlcihvcmlnSGFuZGxlcik7XG5cdFx0XHR9XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5nZXRFdmVudHMoZXJyb3JTZXNzaW9uKS5sZW5ndGgsIDApO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnaW52b2tlUHJvdmlkZXJzJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3JlLWludm9jYXRpb24gdGhhdCByZXR1cm5zIHVuZGVmaW5lZCBzaG91bGQgcHJlc2VydmUgcHJldmlvdXNseSBsb2FkZWQgZXZlbnRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Ly8gQSBwcm92aWRlciB0aGF0IHN1Y2NlZWRzIG9uY2UgYW5kIHRoZW4gdHJhbnNpZW50bHkgZmFpbHMgKGUuZy4gYW5cblx0XHRcdC8vIEFnZW50IEhvc3Qgc2Vzc2lvbidzIGV2ZW50cy5qc29ubCBpcyBtaWQtcmV3cml0ZSBieSB0aGUgZXh0ZXJuYWxcblx0XHRcdC8vIENMSSkgbXVzdCBub3Qgd2lwZSB0aGUgZXZlbnRzIGN1cnJlbnRseSBzaG93bi5cblx0XHRcdGxldCBzdWNjZWVkID0gdHJ1ZTtcblx0XHRcdGNvbnN0IHByb3ZpZGVyOiBJQ2hhdERlYnVnTG9nUHJvdmlkZXIgPSB7XG5cdFx0XHRcdHByb3ZpZGVDaGF0RGVidWdMb2c6IGFzeW5jICgpID0+IHN1Y2NlZWQgPyBbe1xuXHRcdFx0XHRcdGtpbmQ6ICdnZW5lcmljJyxcblx0XHRcdFx0XHRzZXNzaW9uUmVzb3VyY2U6IHNlc3Npb25HZW5lcmljLFxuXHRcdFx0XHRcdGNyZWF0ZWQ6IG5ldyBEYXRlKCksXG5cdFx0XHRcdFx0bmFtZTogJ3Byb3ZpZGVyLWV2ZW50Jyxcblx0XHRcdFx0XHRsZXZlbDogQ2hhdERlYnVnTG9nTGV2ZWwuSW5mbyxcblx0XHRcdFx0fV0gOiB1bmRlZmluZWQsXG5cdFx0XHR9O1xuXG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5yZWdpc3RlclByb3ZpZGVyKHByb3ZpZGVyKSk7XG5cblx0XHRcdGF3YWl0IHNlcnZpY2UuaW52b2tlUHJvdmlkZXJzKHNlc3Npb25HZW5lcmljKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmdldEV2ZW50cyhzZXNzaW9uR2VuZXJpYykubGVuZ3RoLCAxKTtcblxuXHRcdFx0Ly8gU2Vjb25kIGludm9jYXRpb24gZmFpbHMgKHJldHVybnMgdW5kZWZpbmVkKSBcdTIwMTQgZXZlbnRzIGFyZSBrZXB0LlxuXHRcdFx0c3VjY2VlZCA9IGZhbHNlO1xuXHRcdFx0YXdhaXQgc2VydmljZS5pbnZva2VQcm92aWRlcnMoc2Vzc2lvbkdlbmVyaWMpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuZ2V0RXZlbnRzKHNlc3Npb25HZW5lcmljKS5sZW5ndGgsIDEpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGludm9rZSBtdWx0aXBsZSBwcm92aWRlcnMgYW5kIG1lcmdlIGV2ZW50cycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHByb3ZpZGVyQTogSUNoYXREZWJ1Z0xvZ1Byb3ZpZGVyID0ge1xuXHRcdFx0XHRwcm92aWRlQ2hhdERlYnVnTG9nOiBhc3luYyAoKSA9PiBbe1xuXHRcdFx0XHRcdGtpbmQ6ICdnZW5lcmljJyxcblx0XHRcdFx0XHRzZXNzaW9uUmVzb3VyY2U6IHNlc3Npb25HZW5lcmljLFxuXHRcdFx0XHRcdGNyZWF0ZWQ6IG5ldyBEYXRlKCksXG5cdFx0XHRcdFx0bmFtZTogJ2Zyb20tQScsXG5cdFx0XHRcdFx0bGV2ZWw6IENoYXREZWJ1Z0xvZ0xldmVsLkluZm8sXG5cdFx0XHRcdH1dLFxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IHByb3ZpZGVyQjogSUNoYXREZWJ1Z0xvZ1Byb3ZpZGVyID0ge1xuXHRcdFx0XHRwcm92aWRlQ2hhdERlYnVnTG9nOiBhc3luYyAoKSA9PiBbe1xuXHRcdFx0XHRcdGtpbmQ6ICdnZW5lcmljJyxcblx0XHRcdFx0XHRzZXNzaW9uUmVzb3VyY2U6IHNlc3Npb25HZW5lcmljLFxuXHRcdFx0XHRcdGNyZWF0ZWQ6IG5ldyBEYXRlKCksXG5cdFx0XHRcdFx0bmFtZTogJ2Zyb20tQicsXG5cdFx0XHRcdFx0bGV2ZWw6IENoYXREZWJ1Z0xvZ0xldmVsLkluZm8sXG5cdFx0XHRcdH1dLFxuXHRcdFx0fTtcblxuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcihwcm92aWRlckEpKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIocHJvdmlkZXJCKSk7XG5cdFx0XHRhd2FpdCBzZXJ2aWNlLmludm9rZVByb3ZpZGVycyhzZXNzaW9uR2VuZXJpYyk7XG5cblx0XHRcdGNvbnN0IG5hbWVzID0gKHNlcnZpY2UuZ2V0RXZlbnRzKHNlc3Npb25HZW5lcmljKSBhcyBJQ2hhdERlYnVnR2VuZXJpY0V2ZW50W10pLm1hcChlID0+IGUubmFtZSk7XG5cdFx0XHRhc3NlcnQub2sobmFtZXMuaW5jbHVkZXMoJ2Zyb20tQScpKTtcblx0XHRcdGFzc2VydC5vayhuYW1lcy5pbmNsdWRlcygnZnJvbS1CJykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGNhbmNlbCBwcmV2aW91cyBpbnZvY2F0aW9uIGZvciBzYW1lIHNlc3Npb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRsZXQgY2FuY2VsbGVkVG9rZW46IENhbmNlbGxhdGlvblRva2VuIHwgdW5kZWZpbmVkO1xuXG5cdFx0XHRjb25zdCBwcm92aWRlcjogSUNoYXREZWJ1Z0xvZ1Byb3ZpZGVyID0ge1xuXHRcdFx0XHRwcm92aWRlQ2hhdERlYnVnTG9nOiBhc3luYyAoX3Nlc3Npb25SZXNvdXJjZSwgdG9rZW4pID0+IHtcblx0XHRcdFx0XHRjYW5jZWxsZWRUb2tlbiA9IHRva2VuO1xuXHRcdFx0XHRcdHJldHVybiBbXTtcblx0XHRcdFx0fSxcblx0XHRcdH07XG5cblx0XHRcdGRpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIocHJvdmlkZXIpKTtcblxuXHRcdFx0Ly8gRmlyc3QgaW52b2NhdGlvblxuXHRcdFx0YXdhaXQgc2VydmljZS5pbnZva2VQcm92aWRlcnMoc2Vzc2lvbkdlbmVyaWMpO1xuXHRcdFx0Y29uc3QgZmlyc3RUb2tlbiA9IGNhbmNlbGxlZFRva2VuITtcblxuXHRcdFx0Ly8gU2Vjb25kIGludm9jYXRpb24gZm9yIHNhbWUgc2Vzc2lvbiBzaG91bGQgY2FuY2VsIHRoZSBmaXJzdFxuXHRcdFx0YXdhaXQgc2VydmljZS5pbnZva2VQcm92aWRlcnMoc2Vzc2lvbkdlbmVyaWMpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcnN0VG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQsIHRydWUpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGZpcmUgb25EaWRDbGVhclByb3ZpZGVyRXZlbnRzIHdoZW4gY2xlYXJpbmcgcHJvdmlkZXIgZXZlbnRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY2xlYXJlZFNlc3Npb25zOiBVUklbXSA9IFtdO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHNlcnZpY2Uub25EaWRDbGVhclByb3ZpZGVyRXZlbnRzKHNlc3Npb25SZXNvdXJjZSA9PiBjbGVhcmVkU2Vzc2lvbnMucHVzaChzZXNzaW9uUmVzb3VyY2UpKSk7XG5cblx0XHRcdGNvbnN0IHByb3ZpZGVyOiBJQ2hhdERlYnVnTG9nUHJvdmlkZXIgPSB7XG5cdFx0XHRcdHByb3ZpZGVDaGF0RGVidWdMb2c6IGFzeW5jIChzZXNzaW9uUmVzb3VyY2UpID0+IFt7XG5cdFx0XHRcdFx0a2luZDogJ2dlbmVyaWMnLFxuXHRcdFx0XHRcdHNlc3Npb25SZXNvdXJjZSxcblx0XHRcdFx0XHRjcmVhdGVkOiBuZXcgRGF0ZSgpLFxuXHRcdFx0XHRcdG5hbWU6ICdwcm92aWRlci1ldmVudCcsXG5cdFx0XHRcdFx0bGV2ZWw6IENoYXREZWJ1Z0xvZ0xldmVsLkluZm8sXG5cdFx0XHRcdH1dLFxuXHRcdFx0fTtcblxuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcihwcm92aWRlcikpO1xuXG5cdFx0XHQvLyBGaXJzdCBpbnZvY2F0aW9uIGNsZWFycyBlbXB0eSBzZXQgYW5kIGZpcmVzIGNsZWFyIGV2ZW50XG5cdFx0XHRhd2FpdCBzZXJ2aWNlLmludm9rZVByb3ZpZGVycyhzZXNzaW9uR2VuZXJpYyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2xlYXJlZFNlc3Npb25zLmxlbmd0aCwgMSwgJ0NsZWFyIGV2ZW50IHNob3VsZCBmaXJlIG9uIGZpcnN0IGludm9jYXRpb24nKTtcblxuXHRcdFx0Ly8gU2Vjb25kIGludm9jYXRpb24gY2xlYXJzIHByb3ZpZGVyIGV2ZW50cyBmcm9tIGZpcnN0IGludm9jYXRpb25cblx0XHRcdGF3YWl0IHNlcnZpY2UuaW52b2tlUHJvdmlkZXJzKHNlc3Npb25HZW5lcmljKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjbGVhcmVkU2Vzc2lvbnMubGVuZ3RoLCAyLCAnQ2xlYXIgZXZlbnQgc2hvdWxkIGZpcmUgb24gc2Vjb25kIGludm9jYXRpb24nKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjbGVhcmVkU2Vzc2lvbnNbMV0udG9TdHJpbmcoKSwgc2Vzc2lvbkdlbmVyaWMudG9TdHJpbmcoKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgbm90IGNhbmNlbCBpbnZvY2F0aW9ucyBmb3IgZGlmZmVyZW50IHNlc3Npb25zJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdG9rZW5zOiBNYXA8c3RyaW5nLCBDYW5jZWxsYXRpb25Ub2tlbj4gPSBuZXcgTWFwKCk7XG5cblx0XHRcdGNvbnN0IHByb3ZpZGVyOiBJQ2hhdERlYnVnTG9nUHJvdmlkZXIgPSB7XG5cdFx0XHRcdHByb3ZpZGVDaGF0RGVidWdMb2c6IGFzeW5jIChzZXNzaW9uUmVzb3VyY2UsIHRva2VuKSA9PiB7XG5cdFx0XHRcdFx0dG9rZW5zLnNldChzZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKSwgdG9rZW4pO1xuXHRcdFx0XHRcdHJldHVybiBbXTtcblx0XHRcdFx0fSxcblx0XHRcdH07XG5cblx0XHRcdGRpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIocHJvdmlkZXIpKTtcblxuXHRcdFx0YXdhaXQgc2VydmljZS5pbnZva2VQcm92aWRlcnMoc2Vzc2lvbkEpO1xuXHRcdFx0YXdhaXQgc2VydmljZS5pbnZva2VQcm92aWRlcnMoc2Vzc2lvbkIpO1xuXG5cdFx0XHRjb25zdCB0b2tlbkEgPSB0b2tlbnMuZ2V0KHNlc3Npb25BLnRvU3RyaW5nKCkpITtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0b2tlbkEuaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQsIGZhbHNlLCAnc2Vzc2lvbi1hIHRva2VuIHNob3VsZCBub3QgYmUgY2FuY2VsbGVkJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgbm90IGludm9rZSBwcm92aWRlcnMgZm9yIGluZWxpZ2libGUgc2Vzc2lvbiBzY2hlbWVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0bGV0IHByb3ZpZGVyQ2FsbGVkID0gZmFsc2U7XG5cblx0XHRcdGNvbnN0IHByb3ZpZGVyOiBJQ2hhdERlYnVnTG9nUHJvdmlkZXIgPSB7XG5cdFx0XHRcdHByb3ZpZGVDaGF0RGVidWdMb2c6IGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRwcm92aWRlckNhbGxlZCA9IHRydWU7XG5cdFx0XHRcdFx0cmV0dXJuIFt7XG5cdFx0XHRcdFx0XHRraW5kOiAnZ2VuZXJpYycsXG5cdFx0XHRcdFx0XHRzZXNzaW9uUmVzb3VyY2U6IG5vbkxvY2FsU2Vzc2lvbixcblx0XHRcdFx0XHRcdGNyZWF0ZWQ6IG5ldyBEYXRlKCksXG5cdFx0XHRcdFx0XHRuYW1lOiAnc2hvdWxkLW5vdC1hcHBlYXInLFxuXHRcdFx0XHRcdFx0bGV2ZWw6IENoYXREZWJ1Z0xvZ0xldmVsLkluZm8sXG5cdFx0XHRcdFx0fV07XG5cdFx0XHRcdH0sXG5cdFx0XHR9O1xuXG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5yZWdpc3RlclByb3ZpZGVyKHByb3ZpZGVyKSk7XG5cdFx0XHRhd2FpdCBzZXJ2aWNlLmludm9rZVByb3ZpZGVycyhub25Mb2NhbFNlc3Npb24pO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvdmlkZXJDYWxsZWQsIGZhbHNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmdldEV2ZW50cyhub25Mb2NhbFNlc3Npb24pLmxlbmd0aCwgMCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgaW52b2tlIHByb3ZpZGVycyBmb3IgY29waWxvdGNsaSBzZXNzaW9ucycsIGFzeW5jICgpID0+IHtcblx0XHRcdGxldCBwcm92aWRlckNhbGxlZCA9IGZhbHNlO1xuXG5cdFx0XHRjb25zdCBwcm92aWRlcjogSUNoYXREZWJ1Z0xvZ1Byb3ZpZGVyID0ge1xuXHRcdFx0XHRwcm92aWRlQ2hhdERlYnVnTG9nOiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0cHJvdmlkZXJDYWxsZWQgPSB0cnVlO1xuXHRcdFx0XHRcdHJldHVybiBbe1xuXHRcdFx0XHRcdFx0a2luZDogJ2dlbmVyaWMnLFxuXHRcdFx0XHRcdFx0c2Vzc2lvblJlc291cmNlOiBjb3BpbG90Q2xpU2Vzc2lvbixcblx0XHRcdFx0XHRcdGNyZWF0ZWQ6IG5ldyBEYXRlKCksXG5cdFx0XHRcdFx0XHRuYW1lOiAnY2xpLXByb3ZpZGVyLWV2ZW50Jyxcblx0XHRcdFx0XHRcdGxldmVsOiBDaGF0RGVidWdMb2dMZXZlbC5JbmZvLFxuXHRcdFx0XHRcdH1dO1xuXHRcdFx0XHR9LFxuXHRcdFx0fTtcblxuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcihwcm92aWRlcikpO1xuXHRcdFx0YXdhaXQgc2VydmljZS5pbnZva2VQcm92aWRlcnMoY29waWxvdENsaVNlc3Npb24pO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvdmlkZXJDYWxsZWQsIHRydWUpO1xuXHRcdFx0YXNzZXJ0Lm9rKHNlcnZpY2UuZ2V0RXZlbnRzKGNvcGlsb3RDbGlTZXNzaW9uKS5sZW5ndGggPiAwKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ25ld2x5IHJlZ2lzdGVyZWQgcHJvdmlkZXIgc2hvdWxkIGJlIGludm9rZWQgZm9yIGFjdGl2ZSBzZXNzaW9ucycsIGFzeW5jICgpID0+IHtcblx0XHRcdC8vIFN0YXJ0IGFuIGludm9jYXRpb24gYmVmb3JlIHRoZSBwcm92aWRlciBpcyByZWdpc3RlcmVkXG5cdFx0XHRjb25zdCBmaXJzdFByb3ZpZGVyOiBJQ2hhdERlYnVnTG9nUHJvdmlkZXIgPSB7XG5cdFx0XHRcdHByb3ZpZGVDaGF0RGVidWdMb2c6IGFzeW5jICgpID0+IFtdLFxuXHRcdFx0fTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoZmlyc3RQcm92aWRlcikpO1xuXHRcdFx0YXdhaXQgc2VydmljZS5pbnZva2VQcm92aWRlcnMoc2Vzc2lvbkdlbmVyaWMpO1xuXG5cdFx0XHQvLyBOb3cgcmVnaXN0ZXIgYSBuZXcgcHJvdmlkZXIgXHUyMDE0IGl0IHNob3VsZCBiZSBpbnZva2VkIGZvciB0aGUgYWN0aXZlIHNlc3Npb25cblx0XHRcdGNvbnN0IGxhdGVFdmVudHM6IElDaGF0RGVidWdFdmVudFtdID0gW107XG5cdFx0XHRjb25zdCBsYXRlUHJvdmlkZXI6IElDaGF0RGVidWdMb2dQcm92aWRlciA9IHtcblx0XHRcdFx0cHJvdmlkZUNoYXREZWJ1Z0xvZzogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IGV2ZW50OiBJQ2hhdERlYnVnR2VuZXJpY0V2ZW50ID0ge1xuXHRcdFx0XHRcdFx0a2luZDogJ2dlbmVyaWMnLFxuXHRcdFx0XHRcdFx0c2Vzc2lvblJlc291cmNlOiBzZXNzaW9uR2VuZXJpYyxcblx0XHRcdFx0XHRcdGNyZWF0ZWQ6IG5ldyBEYXRlKCksXG5cdFx0XHRcdFx0XHRuYW1lOiAnbGF0ZS1wcm92aWRlci1ldmVudCcsXG5cdFx0XHRcdFx0XHRsZXZlbDogQ2hhdERlYnVnTG9nTGV2ZWwuSW5mbyxcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdGxhdGVFdmVudHMucHVzaChldmVudCk7XG5cdFx0XHRcdFx0cmV0dXJuIFtldmVudF07XG5cdFx0XHRcdH0sXG5cdFx0XHR9O1xuXG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5yZWdpc3RlclByb3ZpZGVyKGxhdGVQcm92aWRlcikpO1xuXG5cdFx0XHQvLyBHaXZlIGl0IGEgdGljayB0byBsZXQgdGhlIGFzeW5jIGludm9jYXRpb24gY29tcGxldGVcblx0XHRcdGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCAxMCkpO1xuXG5cdFx0XHRhc3NlcnQub2sobGF0ZUV2ZW50cy5sZW5ndGggPiAwLCAnTGF0ZSBwcm92aWRlciBzaG91bGQgaGF2ZSBiZWVuIGludm9rZWQnKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ3Jlc29sdmVFdmVudCcsICgpID0+IHtcblx0XHR0ZXN0KCdzaG91bGQgZGVsZWdhdGUgdG8gcHJvdmlkZXIgd2l0aCByZXNvbHZlQ2hhdERlYnVnTG9nRXZlbnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXNvbHZlZDogSUNoYXREZWJ1Z1Jlc29sdmVkRXZlbnRDb250ZW50ID0ge1xuXHRcdFx0XHRraW5kOiAndGV4dCcsXG5cdFx0XHRcdHZhbHVlOiAncmVzb2x2ZWQgZGV0YWlsIHRleHQnLFxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgcHJvdmlkZXI6IElDaGF0RGVidWdMb2dQcm92aWRlciA9IHtcblx0XHRcdFx0cHJvdmlkZUNoYXREZWJ1Z0xvZzogYXN5bmMgKCkgPT4gdW5kZWZpbmVkLFxuXHRcdFx0XHRyZXNvbHZlQ2hhdERlYnVnTG9nRXZlbnQ6IGFzeW5jIChldmVudElkKSA9PiB7XG5cdFx0XHRcdFx0aWYgKGV2ZW50SWQgPT09ICdteS1ldmVudCcpIHtcblx0XHRcdFx0XHRcdHJldHVybiByZXNvbHZlZDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0fSxcblx0XHRcdH07XG5cblx0XHRcdGRpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIocHJvdmlkZXIpKTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgc2VydmljZS5yZXNvbHZlRXZlbnQoJ215LWV2ZW50Jyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgcmVzb2x2ZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHJldHVybiB1bmRlZmluZWQgaWYgbm8gcHJvdmlkZXIgcmVzb2x2ZXMgdGhlIGV2ZW50JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcHJvdmlkZXI6IElDaGF0RGVidWdMb2dQcm92aWRlciA9IHtcblx0XHRcdFx0cHJvdmlkZUNoYXREZWJ1Z0xvZzogYXN5bmMgKCkgPT4gdW5kZWZpbmVkLFxuXHRcdFx0XHRyZXNvbHZlQ2hhdERlYnVnTG9nRXZlbnQ6IGFzeW5jICgpID0+IHVuZGVmaW5lZCxcblx0XHRcdH07XG5cblx0XHRcdGRpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIocHJvdmlkZXIpKTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgc2VydmljZS5yZXNvbHZlRXZlbnQoJ25vbmV4aXN0ZW50Jyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHJldHVybiB1bmRlZmluZWQgd2hlbiBubyBwcm92aWRlcnMgcmVnaXN0ZXJlZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHNlcnZpY2UucmVzb2x2ZUV2ZW50KCdhbnktaWQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgcmV0dXJuIGZpcnN0IG5vbi11bmRlZmluZWQgcmVzb2x1dGlvbiBmcm9tIG11bHRpcGxlIHByb3ZpZGVycycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHByb3ZpZGVyMTogSUNoYXREZWJ1Z0xvZ1Byb3ZpZGVyID0ge1xuXHRcdFx0XHRwcm92aWRlQ2hhdERlYnVnTG9nOiBhc3luYyAoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHRcdHJlc29sdmVDaGF0RGVidWdMb2dFdmVudDogYXN5bmMgKCkgPT4gdW5kZWZpbmVkLFxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IHByb3ZpZGVyMjogSUNoYXREZWJ1Z0xvZ1Byb3ZpZGVyID0ge1xuXHRcdFx0XHRwcm92aWRlQ2hhdERlYnVnTG9nOiBhc3luYyAoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHRcdHJlc29sdmVDaGF0RGVidWdMb2dFdmVudDogYXN5bmMgKCkgPT4gKHsga2luZDogJ3RleHQnLCB2YWx1ZTogJ2Zyb20gcHJvdmlkZXIgMicgfSksXG5cdFx0XHR9O1xuXG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5yZWdpc3RlclByb3ZpZGVyKHByb3ZpZGVyMSkpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcihwcm92aWRlcjIpKTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgc2VydmljZS5yZXNvbHZlRXZlbnQoJ2FueScpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHsga2luZDogJ3RleHQnLCB2YWx1ZTogJ2Zyb20gcHJvdmlkZXIgMicgfSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdlbmRTZXNzaW9uJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3Nob3VsZCBjYW5jZWwgYW5kIHJlbW92ZSB0aGUgQ1RTIGZvciBhIHNlc3Npb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRsZXQgY2FwdHVyZWRUb2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4gfCB1bmRlZmluZWQ7XG5cblx0XHRcdGNvbnN0IHByb3ZpZGVyOiBJQ2hhdERlYnVnTG9nUHJvdmlkZXIgPSB7XG5cdFx0XHRcdHByb3ZpZGVDaGF0RGVidWdMb2c6IGFzeW5jIChfc2Vzc2lvblJlc291cmNlLCB0b2tlbikgPT4ge1xuXHRcdFx0XHRcdGNhcHR1cmVkVG9rZW4gPSB0b2tlbjtcblx0XHRcdFx0XHRyZXR1cm4gW107XG5cdFx0XHRcdH0sXG5cdFx0XHR9O1xuXG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5yZWdpc3RlclByb3ZpZGVyKHByb3ZpZGVyKSk7XG5cdFx0XHRhd2FpdCBzZXJ2aWNlLmludm9rZVByb3ZpZGVycyhzZXNzaW9uR2VuZXJpYyk7XG5cblx0XHRcdGFzc2VydC5vayhjYXB0dXJlZFRva2VuKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjYXB0dXJlZFRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkLCBmYWxzZSk7XG5cblx0XHRcdHNlcnZpY2UuZW5kU2Vzc2lvbihzZXNzaW9uR2VuZXJpYyk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjYXB0dXJlZFRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkLCB0cnVlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBiZSBzYWZlIHRvIGNhbGwgZm9yIHVua25vd24gc2Vzc2lvbicsICgpID0+IHtcblx0XHRcdC8vIFNob3VsZCBub3QgdGhyb3dcblx0XHRcdHNlcnZpY2UuZW5kU2Vzc2lvbihVUkkucGFyc2UoJ3ZzY29kZS1jaGF0LXNlc3Npb246Ly9sb2NhbC9ub25leGlzdGVudCcpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2xhdGUgcHJvdmlkZXIgc2hvdWxkIG5vdCBiZSBpbnZva2VkIGZvciBlbmRlZCBzZXNzaW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZmlyc3RQcm92aWRlcjogSUNoYXREZWJ1Z0xvZ1Byb3ZpZGVyID0ge1xuXHRcdFx0XHRwcm92aWRlQ2hhdERlYnVnTG9nOiBhc3luYyAoKSA9PiBbXSxcblx0XHRcdH07XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5yZWdpc3RlclByb3ZpZGVyKGZpcnN0UHJvdmlkZXIpKTtcblx0XHRcdGF3YWl0IHNlcnZpY2UuaW52b2tlUHJvdmlkZXJzKHNlc3Npb25HZW5lcmljKTtcblxuXHRcdFx0c2VydmljZS5lbmRTZXNzaW9uKHNlc3Npb25HZW5lcmljKTtcblxuXHRcdFx0bGV0IGxhdGVDYWxsZWQgPSBmYWxzZTtcblx0XHRcdGNvbnN0IGxhdGVQcm92aWRlcjogSUNoYXREZWJ1Z0xvZ1Byb3ZpZGVyID0ge1xuXHRcdFx0XHRwcm92aWRlQ2hhdERlYnVnTG9nOiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0bGF0ZUNhbGxlZCA9IHRydWU7XG5cdFx0XHRcdFx0cmV0dXJuIFtdO1xuXHRcdFx0XHR9LFxuXHRcdFx0fTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIobGF0ZVByb3ZpZGVyKSk7XG5cblx0XHRcdGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCAxMCkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxhdGVDYWxsZWQsIGZhbHNlLCAnTGF0ZSBwcm92aWRlciBzaG91bGQgbm90IGJlIGludm9rZWQgZm9yIGVuZGVkIHNlc3Npb24nKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2Rpc3Bvc2UnLCAoKSA9PiB7XG5cdFx0dGVzdCgnc2hvdWxkIGNhbmNlbCBhY3RpdmUgaW52b2NhdGlvbnMgb24gZGlzcG9zZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGxldCBjYXB0dXJlZFRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbiB8IHVuZGVmaW5lZDtcblxuXHRcdFx0Y29uc3QgcHJvdmlkZXI6IElDaGF0RGVidWdMb2dQcm92aWRlciA9IHtcblx0XHRcdFx0cHJvdmlkZUNoYXREZWJ1Z0xvZzogYXN5bmMgKF9zZXNzaW9uUmVzb3VyY2UsIHRva2VuKSA9PiB7XG5cdFx0XHRcdFx0Y2FwdHVyZWRUb2tlbiA9IHRva2VuO1xuXHRcdFx0XHRcdHJldHVybiBbXTtcblx0XHRcdFx0fSxcblx0XHRcdH07XG5cblx0XHRcdGRpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIocHJvdmlkZXIpKTtcblx0XHRcdGF3YWl0IHNlcnZpY2UuaW52b2tlUHJvdmlkZXJzKHNlc3Npb25HZW5lcmljKTtcblxuXHRcdFx0Y29uc3QgY3RzID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoY3RzKTtcblxuXHRcdFx0c2VydmljZS5kaXNwb3NlKCk7XG5cblx0XHRcdGFzc2VydC5vayhjYXB0dXJlZFRva2VuKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjYXB0dXJlZFRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkLCB0cnVlKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2V2ZW50IGRlZHVwbGljYXRpb24nLCAoKSA9PiB7XG5cdFx0dGVzdCgnc2hvdWxkIGRlZHVwbGljYXRlIGV2ZW50cyB3aXRoIHRoZSBzYW1lIElELCBrZWVwaW5nIHRoZSByaWNoZXIga2luZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHVzZXJNc2c6IElDaGF0RGVidWdFdmVudCA9IHtcblx0XHRcdFx0a2luZDogJ3VzZXJNZXNzYWdlJyxcblx0XHRcdFx0aWQ6ICdzaGFyZWQtaWQtMScsXG5cdFx0XHRcdHNlc3Npb25SZXNvdXJjZTogc2Vzc2lvbjEsXG5cdFx0XHRcdGNyZWF0ZWQ6IG5ldyBEYXRlKCcyMDI2LTAxLTAxVDAwOjAwOjAwWicpLFxuXHRcdFx0XHRtZXNzYWdlOiAnaGVsbG8nLFxuXHRcdFx0XHRzZWN0aW9uczogW10sXG5cdFx0XHR9O1xuXHRcdFx0Y29uc3Qgc3ViYWdlbnQ6IElDaGF0RGVidWdFdmVudCA9IHtcblx0XHRcdFx0a2luZDogJ3N1YmFnZW50SW52b2NhdGlvbicsXG5cdFx0XHRcdGlkOiAnc2hhcmVkLWlkLTEnLFxuXHRcdFx0XHRzZXNzaW9uUmVzb3VyY2U6IHNlc3Npb24xLFxuXHRcdFx0XHRjcmVhdGVkOiBuZXcgRGF0ZSgnMjAyNi0wMS0wMVQwMDowMDowMVonKSxcblx0XHRcdFx0YWdlbnROYW1lOiAnRXhwbG9yZScsXG5cdFx0XHR9O1xuXHRcdFx0c2VydmljZS5hZGRFdmVudCh1c2VyTXNnKTtcblx0XHRcdHNlcnZpY2UuYWRkRXZlbnQoc3ViYWdlbnQpO1xuXG5cdFx0XHRjb25zdCBldmVudHMgPSBzZXJ2aWNlLmdldEV2ZW50cyhzZXNzaW9uMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnRzLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnRzWzBdLmtpbmQsICdzdWJhZ2VudEludm9jYXRpb24nKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBrZWVwIHJpY2hlciBldmVudCB3aGVuIGl0IGFycml2ZXMgZmlyc3QnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzdWJhZ2VudDogSUNoYXREZWJ1Z0V2ZW50ID0ge1xuXHRcdFx0XHRraW5kOiAnc3ViYWdlbnRJbnZvY2F0aW9uJyxcblx0XHRcdFx0aWQ6ICdzaGFyZWQtaWQtMicsXG5cdFx0XHRcdHNlc3Npb25SZXNvdXJjZTogc2Vzc2lvbjEsXG5cdFx0XHRcdGNyZWF0ZWQ6IG5ldyBEYXRlKCcyMDI2LTAxLTAxVDAwOjAwOjAwWicpLFxuXHRcdFx0XHRhZ2VudE5hbWU6ICdFeHBsb3JlJyxcblx0XHRcdH07XG5cdFx0XHRjb25zdCB1c2VyTXNnOiBJQ2hhdERlYnVnRXZlbnQgPSB7XG5cdFx0XHRcdGtpbmQ6ICd1c2VyTWVzc2FnZScsXG5cdFx0XHRcdGlkOiAnc2hhcmVkLWlkLTInLFxuXHRcdFx0XHRzZXNzaW9uUmVzb3VyY2U6IHNlc3Npb24xLFxuXHRcdFx0XHRjcmVhdGVkOiBuZXcgRGF0ZSgnMjAyNi0wMS0wMVQwMDowMDowMVonKSxcblx0XHRcdFx0bWVzc2FnZTogJ2hlbGxvJyxcblx0XHRcdFx0c2VjdGlvbnM6IFtdLFxuXHRcdFx0fTtcblx0XHRcdHNlcnZpY2UuYWRkRXZlbnQoc3ViYWdlbnQpO1xuXHRcdFx0c2VydmljZS5hZGRFdmVudCh1c2VyTXNnKTtcblxuXHRcdFx0Y29uc3QgZXZlbnRzID0gc2VydmljZS5nZXRFdmVudHMoc2Vzc2lvbjEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50cy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50c1swXS5raW5kLCAnc3ViYWdlbnRJbnZvY2F0aW9uJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgbm90IGZpcmUgb25EaWRBZGRFdmVudCBmb3Igc2tpcHBlZCBkdXBsaWNhdGVzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZmlyZWRLaW5kczogc3RyaW5nW10gPSBbXTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLm9uRGlkQWRkRXZlbnQoZSA9PiBmaXJlZEtpbmRzLnB1c2goZS5raW5kKSkpO1xuXG5cdFx0XHRjb25zdCBzdWJhZ2VudDogSUNoYXREZWJ1Z0V2ZW50ID0ge1xuXHRcdFx0XHRraW5kOiAnc3ViYWdlbnRJbnZvY2F0aW9uJyxcblx0XHRcdFx0aWQ6ICdzaGFyZWQtaWQtMycsXG5cdFx0XHRcdHNlc3Npb25SZXNvdXJjZTogc2Vzc2lvbjEsXG5cdFx0XHRcdGNyZWF0ZWQ6IG5ldyBEYXRlKCcyMDI2LTAxLTAxVDAwOjAwOjAwWicpLFxuXHRcdFx0XHRhZ2VudE5hbWU6ICdFeHBsb3JlJyxcblx0XHRcdH07XG5cdFx0XHRjb25zdCB1c2VyTXNnOiBJQ2hhdERlYnVnRXZlbnQgPSB7XG5cdFx0XHRcdGtpbmQ6ICd1c2VyTWVzc2FnZScsXG5cdFx0XHRcdGlkOiAnc2hhcmVkLWlkLTMnLFxuXHRcdFx0XHRzZXNzaW9uUmVzb3VyY2U6IHNlc3Npb24xLFxuXHRcdFx0XHRjcmVhdGVkOiBuZXcgRGF0ZSgnMjAyNi0wMS0wMVQwMDowMDowMVonKSxcblx0XHRcdFx0bWVzc2FnZTogJ2hlbGxvJyxcblx0XHRcdFx0c2VjdGlvbnM6IFtdLFxuXHRcdFx0fTtcblx0XHRcdHNlcnZpY2UuYWRkRXZlbnQoc3ViYWdlbnQpO1xuXHRcdFx0c2VydmljZS5hZGRFdmVudCh1c2VyTXNnKTsgLy8gc2hvdWxkIGJlIHNraXBwZWRcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChmaXJlZEtpbmRzLCBbJ3N1YmFnZW50SW52b2NhdGlvbiddKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBhbGxvdyBldmVudHMgd2l0aG91dCBJRHMgdG8gY29leGlzdCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGV2ZW50MTogSUNoYXREZWJ1Z0dlbmVyaWNFdmVudCA9IHtcblx0XHRcdFx0a2luZDogJ2dlbmVyaWMnLFxuXHRcdFx0XHRzZXNzaW9uUmVzb3VyY2U6IHNlc3Npb24xLFxuXHRcdFx0XHRjcmVhdGVkOiBuZXcgRGF0ZSgnMjAyNi0wMS0wMVQwMDowMDowMFonKSxcblx0XHRcdFx0bmFtZTogJ2EnLFxuXHRcdFx0XHRsZXZlbDogQ2hhdERlYnVnTG9nTGV2ZWwuSW5mbyxcblx0XHRcdH07XG5cdFx0XHRjb25zdCBldmVudDI6IElDaGF0RGVidWdHZW5lcmljRXZlbnQgPSB7XG5cdFx0XHRcdGtpbmQ6ICdnZW5lcmljJyxcblx0XHRcdFx0c2Vzc2lvblJlc291cmNlOiBzZXNzaW9uMSxcblx0XHRcdFx0Y3JlYXRlZDogbmV3IERhdGUoJzIwMjYtMDEtMDFUMDA6MDA6MDFaJyksXG5cdFx0XHRcdG5hbWU6ICdiJyxcblx0XHRcdFx0bGV2ZWw6IENoYXREZWJ1Z0xvZ0xldmVsLkluZm8sXG5cdFx0XHR9O1xuXHRcdFx0c2VydmljZS5hZGRFdmVudChldmVudDEpO1xuXHRcdFx0c2VydmljZS5hZGRFdmVudChldmVudDIpO1xuXG5cdFx0XHRjb25zdCBldmVudHMgPSBzZXJ2aWNlLmdldEV2ZW50cyhzZXNzaW9uMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnRzLmxlbmd0aCwgMik7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBNEIsK0JBQStCO0FBQzNELFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsV0FBVztBQUNwQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLHlCQUE0SztBQUNyTCxTQUFTLDRCQUE0QjtBQUNyQyxT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
