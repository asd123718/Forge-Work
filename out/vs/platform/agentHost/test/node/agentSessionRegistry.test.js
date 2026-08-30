import assert from "assert";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { AgentSession } from "../../common/agent.js";
import { AgentHostDatabase } from "../../node/agentHostDatabase.js";
import { AgentSessionRegistry } from "../../node/agentSessionRegistry.js";
class TestAgentHostDatabase {
  constructor() {
    this.sessions = /* @__PURE__ */ new Map();
    this.backfilled = false;
    this._providerBackfilled = /* @__PURE__ */ new Set();
    this._tombstones = /* @__PURE__ */ new Set();
    this._writeFailures = 0;
    this._readFailures = 0;
    this.listCalls = 0;
    this.externalUpdates = [];
  }
  failNextWrite() {
    this._writeFailures++;
  }
  failNextRead() {
    this._readFailures++;
  }
  async registerSession(session, sessionOptions, registerOptions) {
    this._throwWriteFailure();
    if (registerOptions.checkTombstone && this._tombstones.has(session)) {
      return false;
    }
    const { provider, startTime, source } = sessionOptions;
    const existing = this.sessions.get(session);
    const inserted = { session, provider, startTime, external: source === "discovery", source };
    this.sessions.set(session, source === "explicit" ? { ...inserted, startTime: existing?.startTime ?? startTime } : existing && source === "discovery" ? { ...existing, external: true, source: "discovery" } : existing ?? inserted);
    if (!registerOptions.checkTombstone) {
      this._tombstones.delete(session);
    }
    return true;
  }
  async unregisterSession(session) {
    this._throwWriteFailure();
    this.sessions.delete(session);
  }
  async tombstoneAndUnregisterSession(session) {
    this._throwWriteFailure();
    this._tombstones.add(session);
    this.sessions.delete(session);
  }
  async updateSessionExternal(updates) {
    this.externalUpdates.push(...updates);
    for (const update of updates) {
      const session = this.sessions.get(update.session);
      if (session && session.external === void 0) {
        this.sessions.set(update.session, {
          ...session,
          external: update.external,
          source: update.external ? "discovery" : session.source
        });
      }
    }
  }
  async listSessions() {
    this._throwReadFailure();
    this.listCalls++;
    return [...this.sessions.values()];
  }
  async isSessionRegistryEmpty() {
    this._throwReadFailure();
    return this.sessions.size === 0;
  }
  async isSessionRegistryBackfilled() {
    this._throwReadFailure();
    return this.backfilled;
  }
  async markSessionRegistryBackfilled() {
    this._throwWriteFailure();
    this.backfilled = true;
  }
  async isProviderBackfilled(provider) {
    this._throwReadFailure();
    return this._providerBackfilled.has(provider);
  }
  async markProviderBackfilled(provider) {
    this._throwWriteFailure();
    this._providerBackfilled.add(provider);
  }
  async isSessionTombstoned(session) {
    this._throwReadFailure();
    return this._tombstones.has(session);
  }
  async markSessionTombstoned(session) {
    this._throwWriteFailure();
    this._tombstones.add(session);
  }
  async clearSessionTombstone(session) {
    this._throwWriteFailure();
    this._tombstones.delete(session);
  }
  async close() {
  }
  dispose() {
  }
  _throwWriteFailure() {
    if (this._writeFailures > 0) {
      this._writeFailures--;
      throw new Error("write failed");
    }
  }
  _throwReadFailure() {
    if (this._readFailures > 0) {
      this._readFailures--;
      throw new Error("read failed");
    }
  }
}
suite("AgentSessionRegistry", () => {
  const disposables = new DisposableStore();
  let database;
  setup(() => {
    database = new AgentHostDatabase(":memory:");
  });
  teardown(async () => {
    disposables.clear();
    await database.close();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  function createRegistry() {
    return disposables.add(new AgentSessionRegistry(database));
  }
  const list = (registry) => registry.list(async (entry) => entry.external === void 0 ? { ...entry, external: false } : void 0);
  const a = AgentSession.uri("copilot", "a");
  const b = AgentSession.uri("claude", "b");
  const registerExplicit = (registry, session, provider, startTime) => registry.register(session, { provider, startTime, source: "explicit" }, { checkTombstone: false });
  test("list migrates entries and returns the computed list without rereading", async () => {
    const testDatabase = new TestAgentHostDatabase();
    database = testDatabase;
    testDatabase.sessions.set(a.toString(), { session: a.toString(), provider: "copilot", startTime: 1, external: false, source: "explicit" });
    testDatabase.sessions.set(b.toString(), { session: b.toString(), provider: "claude", startTime: 2, external: void 0, source: "explicit" });
    const registry = createRegistry();
    const migratedEntries = [];
    const entries = await registry.list(async (entry) => {
      migratedEntries.push(entry.session.toString());
      return entry.external === void 0 ? { ...entry, external: true, source: "discovery" } : void 0;
    });
    assert.deepStrictEqual({
      listCalls: testDatabase.listCalls,
      migratedEntries,
      updates: testDatabase.externalUpdates,
      entries: entries.map((entry) => ({
        session: entry.session.toString(),
        external: entry.external,
        source: entry.source
      }))
    }, {
      listCalls: 1,
      migratedEntries: [a.toString(), b.toString()],
      updates: [{ session: b.toString(), external: true }],
      entries: [
        { session: a.toString(), external: false, source: "explicit" },
        { session: b.toString(), external: true, source: "discovery" }
      ]
    });
  });
  const registerRestored = (registry, session, provider, startTime) => registry.register(session, { provider, startTime, source: "restore" }, { checkTombstone: true });
  const registerDiscovered = (registry, session, provider, startTime) => registry.register(session, { provider, startTime, source: "discovery" }, { checkTombstone: true });
  test("register / list / unregister", async () => {
    const registry = createRegistry();
    assert.strictEqual(await registry.isEmpty(), true);
    await registerExplicit(registry, a, "copilot", 100);
    await registerExplicit(registry, b, "claude", 200);
    assert.strictEqual(await registry.isEmpty(), false);
    assert.deepStrictEqual(
      (await list(registry)).map((s) => ({ session: s.session.toString(), provider: s.provider, startTime: s.startTime, external: s.external })).sort((x, y) => x.session.localeCompare(y.session)),
      [
        { session: b.toString(), provider: "claude", startTime: 200, external: false },
        { session: a.toString(), provider: "copilot", startTime: 100, external: false }
      ].sort((x, y) => x.session.localeCompare(y.session))
    );
    await registry.unregister(a);
    assert.deepStrictEqual((await list(registry)).map((s) => s.session.toString()), [b.toString()]);
  });
  test("register preserves the first-observed startTime", async () => {
    const registry = createRegistry();
    await registerExplicit(registry, a, "copilot", 100);
    await registerExplicit(registry, a, "copilot", 999);
    const [entry] = await list(registry);
    assert.strictEqual(entry.startTime, 100);
  });
  test("register and unregister preserve submission order", async () => {
    const registry = createRegistry();
    await Promise.all([
      registerExplicit(registry, a, "copilot", 100),
      registry.unregister(a)
    ]);
    assert.deepStrictEqual(await list(registry), []);
  });
  test("external provenance survives a registry restart", async () => {
    await database.close();
    database = new TestAgentHostDatabase();
    await registerDiscovered(createRegistry(), a, "copilot", 100);
    const restartedRegistry = createRegistry();
    assert.deepStrictEqual((await list(restartedRegistry)).map((entry) => ({
      session: entry.session.toString(),
      provider: "copilot",
      startTime: entry.startTime,
      external: entry.external
    })), [{
      session: a.toString(),
      provider: "copilot",
      startTime: 100,
      external: true
    }]);
  });
  test("an Agent Host marker correction restores internal provenance", async () => {
    const registry = createRegistry();
    await registerDiscovered(registry, a, "copilot", 100);
    await registerRestored(registry, a, "copilot", 200);
    assert.deepStrictEqual((await list(registry)).map((entry) => ({
      session: entry.session.toString(),
      startTime: entry.startTime,
      external: entry.external
    })), [{
      session: a.toString(),
      startTime: 100,
      external: false
    }]);
  });
  test("discovery upgrades a restored row to external provenance", async () => {
    const registry = createRegistry();
    await registerRestored(registry, a, "copilot", 100);
    await registerDiscovered(registry, a, "copilot", 200);
    assert.deepStrictEqual((await list(registry)).map((entry) => ({
      external: entry.external,
      source: entry.source,
      startTime: entry.startTime
    })), [{ external: true, source: "discovery", startTime: 100 }]);
  });
  test("discovery does not override an explicitly-registered session", async () => {
    const registry = createRegistry();
    await registerExplicit(registry, a, "copilot", 100);
    await registerDiscovered(registry, a, "copilot", 200);
    assert.deepStrictEqual((await list(registry)).map((entry) => ({
      external: entry.external,
      source: entry.source,
      startTime: entry.startTime
    })), [{ external: false, source: "explicit", startTime: 100 }]);
  });
  test("backfill marker gates the one-time provider seed", async () => {
    const registry = createRegistry();
    assert.strictEqual(await registry.isBackfilled(), false);
    await registerExplicit(registry, a, "copilot", 100);
    await registerExplicit(registry, b, "claude", 200);
    await registry.markBackfilled();
    assert.strictEqual(await registry.isBackfilled(), true);
    assert.deepStrictEqual((await list(registry)).map((s) => s.session.toString()).sort(), [a.toString(), b.toString()].sort());
    const second = createRegistry();
    assert.strictEqual(await second.isBackfilled(), true);
  });
  test("per-provider backfill markers are independent and durable", async () => {
    const registry = createRegistry();
    assert.strictEqual(await registry.isProviderBackfilled("copilot"), false);
    assert.strictEqual(await registry.isProviderBackfilled("claude"), false);
    await registerExplicit(registry, a, "copilot", 100);
    await registry.markProviderBackfilled("copilot");
    assert.strictEqual(await registry.isProviderBackfilled("copilot"), true);
    assert.strictEqual(await registry.isProviderBackfilled("claude"), false);
    const second = createRegistry();
    assert.deepStrictEqual(
      { copilot: await second.isProviderBackfilled("copilot"), claude: await second.isProviderBackfilled("claude") },
      { copilot: true, claude: false }
    );
  });
  test("register persistence failure can be retried", async () => {
    await database.close();
    database = new TestAgentHostDatabase();
    const registry = createRegistry();
    database.failNextWrite();
    await assert.rejects(registerExplicit(registry, a, "copilot", 100), /write failed/);
    assert.deepStrictEqual(await list(registry), []);
    await registerExplicit(registry, a, "copilot", 100);
    assert.deepStrictEqual((await list(registry)).map((entry) => entry.session.toString()), [a.toString()]);
  });
  test("unregister persistence failure can be retried", async () => {
    await database.close();
    database = new TestAgentHostDatabase();
    const registry = createRegistry();
    await registerExplicit(registry, a, "copilot", 100);
    database.failNextWrite();
    await assert.rejects(registry.unregister(a), /write failed/);
    assert.deepStrictEqual((await list(registry)).map((entry) => entry.session.toString()), [a.toString()]);
    await registry.unregister(a);
    assert.deepStrictEqual(await list(registry), []);
  });
  test("markBackfilled persistence failure can be retried", async () => {
    await database.close();
    database = new TestAgentHostDatabase();
    const registry = createRegistry();
    database.failNextWrite();
    await assert.rejects(registry.markBackfilled(), /write failed/);
    assert.strictEqual(await registry.isBackfilled(), false);
    await registry.markBackfilled();
    assert.strictEqual(await registry.isBackfilled(), true);
  });
  test("markProviderBackfilled persistence failure can be retried without affecting other providers", async () => {
    await database.close();
    database = new TestAgentHostDatabase();
    const registry = createRegistry();
    await registry.markProviderBackfilled("claude");
    database.failNextWrite();
    await assert.rejects(registry.markProviderBackfilled("copilot"), /write failed/);
    assert.deepStrictEqual(
      { copilot: await registry.isProviderBackfilled("copilot"), claude: await registry.isProviderBackfilled("claude") },
      { copilot: false, claude: true }
    );
    await registry.markProviderBackfilled("copilot");
    assert.strictEqual(await registry.isProviderBackfilled("copilot"), true);
  });
  test("read failure can be retried without losing persisted sessions", async () => {
    await database.close();
    database = new TestAgentHostDatabase();
    const first = createRegistry();
    await registerExplicit(first, a, "copilot", 100);
    const second = createRegistry();
    database.failNextRead();
    await registerExplicit(second, b, "claude", 200);
    await assert.rejects(list(second), /read failed/);
    await registerExplicit(second, b, "claude", 200);
    assert.deepStrictEqual(
      (await list(second)).map((entry) => entry.session.toString()).sort(),
      [a.toString(), b.toString()].sort()
    );
  });
  test("unregister durably tombstones a session so it is not resurrected by register", async () => {
    const registry = createRegistry();
    await registerExplicit(registry, a, "copilot", 100);
    assert.strictEqual(await registry.isTombstoned(a), false);
    await registry.unregister(a);
    assert.strictEqual(await registry.isTombstoned(a), true, "unregister must durably tombstone the session");
    const second = createRegistry();
    assert.strictEqual(await second.isTombstoned(a), true);
  });
  test("register clears an existing tombstone (explicit create)", async () => {
    const registry = createRegistry();
    await registerExplicit(registry, a, "copilot", 100);
    await registry.unregister(a);
    assert.strictEqual(await registry.isTombstoned(a), true);
    await registerExplicit(registry, a, "copilot", 150);
    assert.strictEqual(await registry.isTombstoned(a), false);
    assert.deepStrictEqual((await list(registry)).map((s) => s.session.toString()), [a.toString()]);
  });
  test("clearTombstone can also be called directly", async () => {
    const registry = createRegistry();
    await registerExplicit(registry, a, "copilot", 100);
    await registry.unregister(a);
    assert.strictEqual(await registry.isTombstoned(a), true);
    await registry.clearTombstone(a);
    assert.strictEqual(await registry.isTombstoned(a), false);
  });
  test("discovery declines to register (or resurrect) a tombstoned session", async () => {
    const registry = createRegistry();
    await registerExplicit(registry, a, "copilot", 100);
    await registry.unregister(a);
    assert.strictEqual(await registry.isTombstoned(a), true);
    const registered = await registerDiscovered(registry, a, "copilot", 200);
    assert.strictEqual(registered, false);
    assert.deepStrictEqual(await list(registry), []);
    assert.strictEqual(await registry.isTombstoned(a), true, "the tombstone must remain in place");
  });
  test("discovery registers a session that is not tombstoned", async () => {
    const registry = createRegistry();
    const registered = await registerDiscovered(registry, a, "copilot", 100);
    assert.strictEqual(registered, true);
    assert.deepStrictEqual((await list(registry)).map((s) => s.session.toString()), [a.toString()]);
  });
  test("discovery persistence failure can be retried", async () => {
    await database.close();
    database = new TestAgentHostDatabase();
    const registry = createRegistry();
    database.failNextWrite();
    await assert.rejects(registerDiscovered(registry, a, "copilot", 100), /write failed/);
    assert.deepStrictEqual(await list(registry), []);
    const registered = await registerDiscovered(registry, a, "copilot", 100);
    assert.strictEqual(registered, true);
    assert.deepStrictEqual((await list(registry)).map((entry) => entry.session.toString()), [a.toString()]);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxhZ2VudFNlc3Npb25SZWdpc3RyeS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgQWdlbnRTZXNzaW9uIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FnZW50LmpzJztcbmltcG9ydCB7IEFnZW50SG9zdERhdGFiYXNlLCBJQWdlbnRIb3N0RGF0YWJhc2UsIElBZ2VudEhvc3REYXRhYmFzZUV4dGVybmFsVXBkYXRlLCBJQWdlbnRIb3N0RGF0YWJhc2VSZWdpc3Rlck9wdGlvbnMsIElBZ2VudEhvc3REYXRhYmFzZVNlc3Npb24sIElBZ2VudEhvc3REYXRhYmFzZVNlc3Npb25PcHRpb25zIH0gZnJvbSAnLi4vLi4vbm9kZS9hZ2VudEhvc3REYXRhYmFzZS5qcyc7XG5pbXBvcnQgeyBBZ2VudFNlc3Npb25SZWdpc3RyeSB9IGZyb20gJy4uLy4uL25vZGUvYWdlbnRTZXNzaW9uUmVnaXN0cnkuanMnO1xuXG5jbGFzcyBUZXN0QWdlbnRIb3N0RGF0YWJhc2UgaW1wbGVtZW50cyBJQWdlbnRIb3N0RGF0YWJhc2Uge1xuXHRyZWFkb25seSBzZXNzaW9ucyA9IG5ldyBNYXA8c3RyaW5nLCBJQWdlbnRIb3N0RGF0YWJhc2VTZXNzaW9uPigpO1xuXHRiYWNrZmlsbGVkID0gZmFsc2U7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Byb3ZpZGVyQmFja2ZpbGxlZCA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF90b21ic3RvbmVzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdHByaXZhdGUgX3dyaXRlRmFpbHVyZXMgPSAwO1xuXHRwcml2YXRlIF9yZWFkRmFpbHVyZXMgPSAwO1xuXHRsaXN0Q2FsbHMgPSAwO1xuXHRyZWFkb25seSBleHRlcm5hbFVwZGF0ZXM6IElBZ2VudEhvc3REYXRhYmFzZUV4dGVybmFsVXBkYXRlW10gPSBbXTtcblxuXHRmYWlsTmV4dFdyaXRlKCk6IHZvaWQge1xuXHRcdHRoaXMuX3dyaXRlRmFpbHVyZXMrKztcblx0fVxuXG5cdGZhaWxOZXh0UmVhZCgpOiB2b2lkIHtcblx0XHR0aGlzLl9yZWFkRmFpbHVyZXMrKztcblx0fVxuXG5cdGFzeW5jIHJlZ2lzdGVyU2Vzc2lvbihzZXNzaW9uOiBzdHJpbmcsIHNlc3Npb25PcHRpb25zOiBJQWdlbnRIb3N0RGF0YWJhc2VTZXNzaW9uT3B0aW9ucywgcmVnaXN0ZXJPcHRpb25zOiBJQWdlbnRIb3N0RGF0YWJhc2VSZWdpc3Rlck9wdGlvbnMpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHR0aGlzLl90aHJvd1dyaXRlRmFpbHVyZSgpO1xuXHRcdGlmIChyZWdpc3Rlck9wdGlvbnMuY2hlY2tUb21ic3RvbmUgJiYgdGhpcy5fdG9tYnN0b25lcy5oYXMoc2Vzc2lvbikpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Y29uc3QgeyBwcm92aWRlciwgc3RhcnRUaW1lLCBzb3VyY2UgfSA9IHNlc3Npb25PcHRpb25zO1xuXHRcdGNvbnN0IGV4aXN0aW5nID0gdGhpcy5zZXNzaW9ucy5nZXQoc2Vzc2lvbik7XG5cdFx0Y29uc3QgaW5zZXJ0ZWQgPSB7IHNlc3Npb24sIHByb3ZpZGVyLCBzdGFydFRpbWUsIGV4dGVybmFsOiBzb3VyY2UgPT09ICdkaXNjb3ZlcnknLCBzb3VyY2UgfTtcblx0XHR0aGlzLnNlc3Npb25zLnNldChzZXNzaW9uLCBzb3VyY2UgPT09ICdleHBsaWNpdCdcblx0XHRcdD8geyAuLi5pbnNlcnRlZCwgc3RhcnRUaW1lOiBleGlzdGluZz8uc3RhcnRUaW1lID8/IHN0YXJ0VGltZSB9XG5cdFx0XHQ6IGV4aXN0aW5nICYmIHNvdXJjZSA9PT0gJ2Rpc2NvdmVyeSdcblx0XHRcdFx0PyB7IC4uLmV4aXN0aW5nLCBleHRlcm5hbDogdHJ1ZSwgc291cmNlOiAnZGlzY292ZXJ5JyB9XG5cdFx0XHRcdDogZXhpc3RpbmcgPz8gaW5zZXJ0ZWQpO1xuXHRcdGlmICghcmVnaXN0ZXJPcHRpb25zLmNoZWNrVG9tYnN0b25lKSB7XG5cdFx0XHR0aGlzLl90b21ic3RvbmVzLmRlbGV0ZShzZXNzaW9uKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRhc3luYyB1bnJlZ2lzdGVyU2Vzc2lvbihzZXNzaW9uOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLl90aHJvd1dyaXRlRmFpbHVyZSgpO1xuXHRcdHRoaXMuc2Vzc2lvbnMuZGVsZXRlKHNlc3Npb24pO1xuXHR9XG5cblx0YXN5bmMgdG9tYnN0b25lQW5kVW5yZWdpc3RlclNlc3Npb24oc2Vzc2lvbjogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5fdGhyb3dXcml0ZUZhaWx1cmUoKTtcblx0XHR0aGlzLl90b21ic3RvbmVzLmFkZChzZXNzaW9uKTtcblx0XHR0aGlzLnNlc3Npb25zLmRlbGV0ZShzZXNzaW9uKTtcblx0fVxuXG5cdGFzeW5jIHVwZGF0ZVNlc3Npb25FeHRlcm5hbCh1cGRhdGVzOiByZWFkb25seSBJQWdlbnRIb3N0RGF0YWJhc2VFeHRlcm5hbFVwZGF0ZVtdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5leHRlcm5hbFVwZGF0ZXMucHVzaCguLi51cGRhdGVzKTtcblx0XHRmb3IgKGNvbnN0IHVwZGF0ZSBvZiB1cGRhdGVzKSB7XG5cdFx0XHRjb25zdCBzZXNzaW9uID0gdGhpcy5zZXNzaW9ucy5nZXQodXBkYXRlLnNlc3Npb24pO1xuXHRcdFx0aWYgKHNlc3Npb24gJiYgc2Vzc2lvbi5leHRlcm5hbCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHRoaXMuc2Vzc2lvbnMuc2V0KHVwZGF0ZS5zZXNzaW9uLCB7XG5cdFx0XHRcdFx0Li4uc2Vzc2lvbixcblx0XHRcdFx0XHRleHRlcm5hbDogdXBkYXRlLmV4dGVybmFsLFxuXHRcdFx0XHRcdHNvdXJjZTogdXBkYXRlLmV4dGVybmFsID8gJ2Rpc2NvdmVyeScgOiBzZXNzaW9uLnNvdXJjZSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgbGlzdFNlc3Npb25zKCk6IFByb21pc2U8cmVhZG9ubHkgSUFnZW50SG9zdERhdGFiYXNlU2Vzc2lvbltdPiB7XG5cdFx0dGhpcy5fdGhyb3dSZWFkRmFpbHVyZSgpO1xuXHRcdHRoaXMubGlzdENhbGxzKys7XG5cdFx0cmV0dXJuIFsuLi50aGlzLnNlc3Npb25zLnZhbHVlcygpXTtcblx0fVxuXG5cdGFzeW5jIGlzU2Vzc2lvblJlZ2lzdHJ5RW1wdHkoKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0dGhpcy5fdGhyb3dSZWFkRmFpbHVyZSgpO1xuXHRcdHJldHVybiB0aGlzLnNlc3Npb25zLnNpemUgPT09IDA7XG5cdH1cblxuXHRhc3luYyBpc1Nlc3Npb25SZWdpc3RyeUJhY2tmaWxsZWQoKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0dGhpcy5fdGhyb3dSZWFkRmFpbHVyZSgpO1xuXHRcdHJldHVybiB0aGlzLmJhY2tmaWxsZWQ7XG5cdH1cblxuXHRhc3luYyBtYXJrU2Vzc2lvblJlZ2lzdHJ5QmFja2ZpbGxlZCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLl90aHJvd1dyaXRlRmFpbHVyZSgpO1xuXHRcdHRoaXMuYmFja2ZpbGxlZCA9IHRydWU7XG5cdH1cblxuXHRhc3luYyBpc1Byb3ZpZGVyQmFja2ZpbGxlZChwcm92aWRlcjogc3RyaW5nKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0dGhpcy5fdGhyb3dSZWFkRmFpbHVyZSgpO1xuXHRcdHJldHVybiB0aGlzLl9wcm92aWRlckJhY2tmaWxsZWQuaGFzKHByb3ZpZGVyKTtcblx0fVxuXG5cdGFzeW5jIG1hcmtQcm92aWRlckJhY2tmaWxsZWQocHJvdmlkZXI6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuX3Rocm93V3JpdGVGYWlsdXJlKCk7XG5cdFx0dGhpcy5fcHJvdmlkZXJCYWNrZmlsbGVkLmFkZChwcm92aWRlcik7XG5cdH1cblxuXHRhc3luYyBpc1Nlc3Npb25Ub21ic3RvbmVkKHNlc3Npb246IHN0cmluZyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdHRoaXMuX3Rocm93UmVhZEZhaWx1cmUoKTtcblx0XHRyZXR1cm4gdGhpcy5fdG9tYnN0b25lcy5oYXMoc2Vzc2lvbik7XG5cdH1cblxuXHRhc3luYyBtYXJrU2Vzc2lvblRvbWJzdG9uZWQoc2Vzc2lvbjogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5fdGhyb3dXcml0ZUZhaWx1cmUoKTtcblx0XHR0aGlzLl90b21ic3RvbmVzLmFkZChzZXNzaW9uKTtcblx0fVxuXG5cdGFzeW5jIGNsZWFyU2Vzc2lvblRvbWJzdG9uZShzZXNzaW9uOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLl90aHJvd1dyaXRlRmFpbHVyZSgpO1xuXHRcdHRoaXMuX3RvbWJzdG9uZXMuZGVsZXRlKHNlc3Npb24pO1xuXHR9XG5cblx0YXN5bmMgY2xvc2UoKTogUHJvbWlzZTx2b2lkPiB7IH1cblx0ZGlzcG9zZSgpOiB2b2lkIHsgfVxuXG5cdHByaXZhdGUgX3Rocm93V3JpdGVGYWlsdXJlKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl93cml0ZUZhaWx1cmVzID4gMCkge1xuXHRcdFx0dGhpcy5fd3JpdGVGYWlsdXJlcy0tO1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCd3cml0ZSBmYWlsZWQnKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF90aHJvd1JlYWRGYWlsdXJlKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9yZWFkRmFpbHVyZXMgPiAwKSB7XG5cdFx0XHR0aGlzLl9yZWFkRmFpbHVyZXMtLTtcblx0XHRcdHRocm93IG5ldyBFcnJvcigncmVhZCBmYWlsZWQnKTtcblx0XHR9XG5cdH1cbn1cblxuc3VpdGUoJ0FnZW50U2Vzc2lvblJlZ2lzdHJ5JywgKCkgPT4ge1xuXG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdGxldCBkYXRhYmFzZTogSUFnZW50SG9zdERhdGFiYXNlO1xuXG5cdHNldHVwKCgpID0+IHtcblx0XHRkYXRhYmFzZSA9IG5ldyBBZ2VudEhvc3REYXRhYmFzZSgnOm1lbW9yeTonKTtcblx0fSk7XG5cblx0dGVhcmRvd24oYXN5bmMgKCkgPT4ge1xuXHRcdGRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0YXdhaXQgZGF0YWJhc2UuY2xvc2UoKTtcblx0fSk7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGZ1bmN0aW9uIGNyZWF0ZVJlZ2lzdHJ5KCk6IEFnZW50U2Vzc2lvblJlZ2lzdHJ5IHtcblx0XHRyZXR1cm4gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudFNlc3Npb25SZWdpc3RyeShkYXRhYmFzZSkpO1xuXHR9XG5cblx0Y29uc3QgbGlzdCA9IChyZWdpc3RyeTogQWdlbnRTZXNzaW9uUmVnaXN0cnkpID0+IHJlZ2lzdHJ5Lmxpc3QoYXN5bmMgZW50cnkgPT4gZW50cnkuZXh0ZXJuYWwgPT09IHVuZGVmaW5lZCA/IHsgLi4uZW50cnksIGV4dGVybmFsOiBmYWxzZSB9IDogdW5kZWZpbmVkKTtcblxuXHRjb25zdCBhID0gQWdlbnRTZXNzaW9uLnVyaSgnY29waWxvdCcsICdhJyk7XG5cdGNvbnN0IGIgPSBBZ2VudFNlc3Npb24udXJpKCdjbGF1ZGUnLCAnYicpO1xuXHRjb25zdCByZWdpc3RlckV4cGxpY2l0ID0gKHJlZ2lzdHJ5OiBBZ2VudFNlc3Npb25SZWdpc3RyeSwgc2Vzc2lvbjogdHlwZW9mIGEsIHByb3ZpZGVyOiAnY29waWxvdCcgfCAnY2xhdWRlJywgc3RhcnRUaW1lOiBudW1iZXIpID0+XG5cdFx0cmVnaXN0cnkucmVnaXN0ZXIoc2Vzc2lvbiwgeyBwcm92aWRlciwgc3RhcnRUaW1lLCBzb3VyY2U6ICdleHBsaWNpdCcgfSwgeyBjaGVja1RvbWJzdG9uZTogZmFsc2UgfSk7XG5cblx0dGVzdCgnbGlzdCBtaWdyYXRlcyBlbnRyaWVzIGFuZCByZXR1cm5zIHRoZSBjb21wdXRlZCBsaXN0IHdpdGhvdXQgcmVyZWFkaW5nJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHRlc3REYXRhYmFzZSA9IG5ldyBUZXN0QWdlbnRIb3N0RGF0YWJhc2UoKTtcblx0XHRkYXRhYmFzZSA9IHRlc3REYXRhYmFzZTtcblx0XHR0ZXN0RGF0YWJhc2Uuc2Vzc2lvbnMuc2V0KGEudG9TdHJpbmcoKSwgeyBzZXNzaW9uOiBhLnRvU3RyaW5nKCksIHByb3ZpZGVyOiAnY29waWxvdCcsIHN0YXJ0VGltZTogMSwgZXh0ZXJuYWw6IGZhbHNlLCBzb3VyY2U6ICdleHBsaWNpdCcgfSk7XG5cdFx0dGVzdERhdGFiYXNlLnNlc3Npb25zLnNldChiLnRvU3RyaW5nKCksIHsgc2Vzc2lvbjogYi50b1N0cmluZygpLCBwcm92aWRlcjogJ2NsYXVkZScsIHN0YXJ0VGltZTogMiwgZXh0ZXJuYWw6IHVuZGVmaW5lZCwgc291cmNlOiAnZXhwbGljaXQnIH0pO1xuXHRcdGNvbnN0IHJlZ2lzdHJ5ID0gY3JlYXRlUmVnaXN0cnkoKTtcblx0XHRjb25zdCBtaWdyYXRlZEVudHJpZXM6IHN0cmluZ1tdID0gW107XG5cblx0XHRjb25zdCBlbnRyaWVzID0gYXdhaXQgcmVnaXN0cnkubGlzdChhc3luYyBlbnRyeSA9PiB7XG5cdFx0XHRtaWdyYXRlZEVudHJpZXMucHVzaChlbnRyeS5zZXNzaW9uLnRvU3RyaW5nKCkpO1xuXHRcdFx0cmV0dXJuIGVudHJ5LmV4dGVybmFsID09PSB1bmRlZmluZWQgPyB7IC4uLmVudHJ5LCBleHRlcm5hbDogdHJ1ZSwgc291cmNlOiAnZGlzY292ZXJ5JyB9IDogdW5kZWZpbmVkO1xuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRsaXN0Q2FsbHM6IHRlc3REYXRhYmFzZS5saXN0Q2FsbHMsXG5cdFx0XHRtaWdyYXRlZEVudHJpZXMsXG5cdFx0XHR1cGRhdGVzOiB0ZXN0RGF0YWJhc2UuZXh0ZXJuYWxVcGRhdGVzLFxuXHRcdFx0ZW50cmllczogZW50cmllcy5tYXAoZW50cnkgPT4gKHtcblx0XHRcdFx0c2Vzc2lvbjogZW50cnkuc2Vzc2lvbi50b1N0cmluZygpLFxuXHRcdFx0XHRleHRlcm5hbDogZW50cnkuZXh0ZXJuYWwsXG5cdFx0XHRcdHNvdXJjZTogZW50cnkuc291cmNlLFxuXHRcdFx0fSkpLFxuXHRcdH0sIHtcblx0XHRcdGxpc3RDYWxsczogMSxcblx0XHRcdG1pZ3JhdGVkRW50cmllczogW2EudG9TdHJpbmcoKSwgYi50b1N0cmluZygpXSxcblx0XHRcdHVwZGF0ZXM6IFt7IHNlc3Npb246IGIudG9TdHJpbmcoKSwgZXh0ZXJuYWw6IHRydWUgfV0sXG5cdFx0XHRlbnRyaWVzOiBbXG5cdFx0XHRcdHsgc2Vzc2lvbjogYS50b1N0cmluZygpLCBleHRlcm5hbDogZmFsc2UsIHNvdXJjZTogJ2V4cGxpY2l0JyB9LFxuXHRcdFx0XHR7IHNlc3Npb246IGIudG9TdHJpbmcoKSwgZXh0ZXJuYWw6IHRydWUsIHNvdXJjZTogJ2Rpc2NvdmVyeScgfSxcblx0XHRcdF0sXG5cdFx0fSk7XG5cdH0pO1xuXHRjb25zdCByZWdpc3RlclJlc3RvcmVkID0gKHJlZ2lzdHJ5OiBBZ2VudFNlc3Npb25SZWdpc3RyeSwgc2Vzc2lvbjogdHlwZW9mIGEsIHByb3ZpZGVyOiAnY29waWxvdCcgfCAnY2xhdWRlJywgc3RhcnRUaW1lOiBudW1iZXIpID0+XG5cdFx0cmVnaXN0cnkucmVnaXN0ZXIoc2Vzc2lvbiwgeyBwcm92aWRlciwgc3RhcnRUaW1lLCBzb3VyY2U6ICdyZXN0b3JlJyB9LCB7IGNoZWNrVG9tYnN0b25lOiB0cnVlIH0pO1xuXHRjb25zdCByZWdpc3RlckRpc2NvdmVyZWQgPSAocmVnaXN0cnk6IEFnZW50U2Vzc2lvblJlZ2lzdHJ5LCBzZXNzaW9uOiB0eXBlb2YgYSwgcHJvdmlkZXI6ICdjb3BpbG90JyB8ICdjbGF1ZGUnLCBzdGFydFRpbWU6IG51bWJlcikgPT5cblx0XHRyZWdpc3RyeS5yZWdpc3RlcihzZXNzaW9uLCB7IHByb3ZpZGVyLCBzdGFydFRpbWUsIHNvdXJjZTogJ2Rpc2NvdmVyeScgfSwgeyBjaGVja1RvbWJzdG9uZTogdHJ1ZSB9KTtcblxuXHR0ZXN0KCdyZWdpc3RlciAvIGxpc3QgLyB1bnJlZ2lzdGVyJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlZ2lzdHJ5ID0gY3JlYXRlUmVnaXN0cnkoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgcmVnaXN0cnkuaXNFbXB0eSgpLCB0cnVlKTtcblxuXHRcdGF3YWl0IHJlZ2lzdGVyRXhwbGljaXQocmVnaXN0cnksIGEsICdjb3BpbG90JywgMTAwKTtcblx0XHRhd2FpdCByZWdpc3RlckV4cGxpY2l0KHJlZ2lzdHJ5LCBiLCAnY2xhdWRlJywgMjAwKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCByZWdpc3RyeS5pc0VtcHR5KCksIGZhbHNlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0KGF3YWl0IGxpc3QocmVnaXN0cnkpKS5tYXAocyA9PiAoeyBzZXNzaW9uOiBzLnNlc3Npb24udG9TdHJpbmcoKSwgcHJvdmlkZXI6IHMucHJvdmlkZXIsIHN0YXJ0VGltZTogcy5zdGFydFRpbWUsIGV4dGVybmFsOiBzLmV4dGVybmFsIH0pKS5zb3J0KCh4LCB5KSA9PiB4LnNlc3Npb24ubG9jYWxlQ29tcGFyZSh5LnNlc3Npb24pKSxcblx0XHRcdFtcblx0XHRcdFx0eyBzZXNzaW9uOiBiLnRvU3RyaW5nKCksIHByb3ZpZGVyOiAnY2xhdWRlJywgc3RhcnRUaW1lOiAyMDAsIGV4dGVybmFsOiBmYWxzZSB9LFxuXHRcdFx0XHR7IHNlc3Npb246IGEudG9TdHJpbmcoKSwgcHJvdmlkZXI6ICdjb3BpbG90Jywgc3RhcnRUaW1lOiAxMDAsIGV4dGVybmFsOiBmYWxzZSB9LFxuXHRcdFx0XS5zb3J0KCh4LCB5KSA9PiB4LnNlc3Npb24ubG9jYWxlQ29tcGFyZSh5LnNlc3Npb24pKSxcblx0XHQpO1xuXG5cdFx0YXdhaXQgcmVnaXN0cnkudW5yZWdpc3RlcihhKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKChhd2FpdCBsaXN0KHJlZ2lzdHJ5KSkubWFwKHMgPT4gcy5zZXNzaW9uLnRvU3RyaW5nKCkpLCBbYi50b1N0cmluZygpXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlZ2lzdGVyIHByZXNlcnZlcyB0aGUgZmlyc3Qtb2JzZXJ2ZWQgc3RhcnRUaW1lJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlZ2lzdHJ5ID0gY3JlYXRlUmVnaXN0cnkoKTtcblx0XHRhd2FpdCByZWdpc3RlckV4cGxpY2l0KHJlZ2lzdHJ5LCBhLCAnY29waWxvdCcsIDEwMCk7XG5cdFx0YXdhaXQgcmVnaXN0ZXJFeHBsaWNpdChyZWdpc3RyeSwgYSwgJ2NvcGlsb3QnLCA5OTkpO1xuXG5cdFx0Y29uc3QgW2VudHJ5XSA9IGF3YWl0IGxpc3QocmVnaXN0cnkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbnRyeS5zdGFydFRpbWUsIDEwMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlZ2lzdGVyIGFuZCB1bnJlZ2lzdGVyIHByZXNlcnZlIHN1Ym1pc3Npb24gb3JkZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVnaXN0cnkgPSBjcmVhdGVSZWdpc3RyeSgpO1xuXG5cdFx0YXdhaXQgUHJvbWlzZS5hbGwoW1xuXHRcdFx0cmVnaXN0ZXJFeHBsaWNpdChyZWdpc3RyeSwgYSwgJ2NvcGlsb3QnLCAxMDApLFxuXHRcdFx0cmVnaXN0cnkudW5yZWdpc3RlcihhKSxcblx0XHRdKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYXdhaXQgbGlzdChyZWdpc3RyeSksIFtdKTtcblx0fSk7XG5cblx0dGVzdCgnZXh0ZXJuYWwgcHJvdmVuYW5jZSBzdXJ2aXZlcyBhIHJlZ2lzdHJ5IHJlc3RhcnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgZGF0YWJhc2UuY2xvc2UoKTtcblx0XHRkYXRhYmFzZSA9IG5ldyBUZXN0QWdlbnRIb3N0RGF0YWJhc2UoKTtcblx0XHRhd2FpdCByZWdpc3RlckRpc2NvdmVyZWQoY3JlYXRlUmVnaXN0cnkoKSwgYSwgJ2NvcGlsb3QnLCAxMDApO1xuXG5cdFx0Y29uc3QgcmVzdGFydGVkUmVnaXN0cnkgPSBjcmVhdGVSZWdpc3RyeSgpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoKGF3YWl0IGxpc3QocmVzdGFydGVkUmVnaXN0cnkpKS5tYXAoZW50cnkgPT4gKHtcblx0XHRcdHNlc3Npb246IGVudHJ5LnNlc3Npb24udG9TdHJpbmcoKSxcblx0XHRcdHByb3ZpZGVyOiAnY29waWxvdCcsXG5cdFx0XHRzdGFydFRpbWU6IGVudHJ5LnN0YXJ0VGltZSxcblx0XHRcdGV4dGVybmFsOiBlbnRyeS5leHRlcm5hbCxcblx0XHR9KSksIFt7XG5cdFx0XHRzZXNzaW9uOiBhLnRvU3RyaW5nKCksXG5cdFx0XHRwcm92aWRlcjogJ2NvcGlsb3QnLFxuXHRcdFx0c3RhcnRUaW1lOiAxMDAsXG5cdFx0XHRleHRlcm5hbDogdHJ1ZSxcblx0XHR9XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FuIEFnZW50IEhvc3QgbWFya2VyIGNvcnJlY3Rpb24gcmVzdG9yZXMgaW50ZXJuYWwgcHJvdmVuYW5jZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZWdpc3RyeSA9IGNyZWF0ZVJlZ2lzdHJ5KCk7XG5cdFx0YXdhaXQgcmVnaXN0ZXJEaXNjb3ZlcmVkKHJlZ2lzdHJ5LCBhLCAnY29waWxvdCcsIDEwMCk7XG5cdFx0YXdhaXQgcmVnaXN0ZXJSZXN0b3JlZChyZWdpc3RyeSwgYSwgJ2NvcGlsb3QnLCAyMDApO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCgoYXdhaXQgbGlzdChyZWdpc3RyeSkpLm1hcChlbnRyeSA9PiAoe1xuXHRcdFx0c2Vzc2lvbjogZW50cnkuc2Vzc2lvbi50b1N0cmluZygpLFxuXHRcdFx0c3RhcnRUaW1lOiBlbnRyeS5zdGFydFRpbWUsXG5cdFx0XHRleHRlcm5hbDogZW50cnkuZXh0ZXJuYWwsXG5cdFx0fSkpLCBbe1xuXHRcdFx0c2Vzc2lvbjogYS50b1N0cmluZygpLFxuXHRcdFx0c3RhcnRUaW1lOiAxMDAsXG5cdFx0XHRleHRlcm5hbDogZmFsc2UsXG5cdFx0fV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkaXNjb3ZlcnkgdXBncmFkZXMgYSByZXN0b3JlZCByb3cgdG8gZXh0ZXJuYWwgcHJvdmVuYW5jZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZWdpc3RyeSA9IGNyZWF0ZVJlZ2lzdHJ5KCk7XG5cdFx0YXdhaXQgcmVnaXN0ZXJSZXN0b3JlZChyZWdpc3RyeSwgYSwgJ2NvcGlsb3QnLCAxMDApO1xuXHRcdGF3YWl0IHJlZ2lzdGVyRGlzY292ZXJlZChyZWdpc3RyeSwgYSwgJ2NvcGlsb3QnLCAyMDApO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCgoYXdhaXQgbGlzdChyZWdpc3RyeSkpLm1hcChlbnRyeSA9PiAoe1xuXHRcdFx0ZXh0ZXJuYWw6IGVudHJ5LmV4dGVybmFsLFxuXHRcdFx0c291cmNlOiBlbnRyeS5zb3VyY2UsXG5cdFx0XHRzdGFydFRpbWU6IGVudHJ5LnN0YXJ0VGltZSxcblx0XHR9KSksIFt7IGV4dGVybmFsOiB0cnVlLCBzb3VyY2U6ICdkaXNjb3ZlcnknLCBzdGFydFRpbWU6IDEwMCB9XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Rpc2NvdmVyeSBkb2VzIG5vdCBvdmVycmlkZSBhbiBleHBsaWNpdGx5LXJlZ2lzdGVyZWQgc2Vzc2lvbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZWdpc3RyeSA9IGNyZWF0ZVJlZ2lzdHJ5KCk7XG5cdFx0YXdhaXQgcmVnaXN0ZXJFeHBsaWNpdChyZWdpc3RyeSwgYSwgJ2NvcGlsb3QnLCAxMDApO1xuXHRcdGF3YWl0IHJlZ2lzdGVyRGlzY292ZXJlZChyZWdpc3RyeSwgYSwgJ2NvcGlsb3QnLCAyMDApO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCgoYXdhaXQgbGlzdChyZWdpc3RyeSkpLm1hcChlbnRyeSA9PiAoe1xuXHRcdFx0ZXh0ZXJuYWw6IGVudHJ5LmV4dGVybmFsLFxuXHRcdFx0c291cmNlOiBlbnRyeS5zb3VyY2UsXG5cdFx0XHRzdGFydFRpbWU6IGVudHJ5LnN0YXJ0VGltZSxcblx0XHR9KSksIFt7IGV4dGVybmFsOiBmYWxzZSwgc291cmNlOiAnZXhwbGljaXQnLCBzdGFydFRpbWU6IDEwMCB9XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2JhY2tmaWxsIG1hcmtlciBnYXRlcyB0aGUgb25lLXRpbWUgcHJvdmlkZXIgc2VlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZWdpc3RyeSA9IGNyZWF0ZVJlZ2lzdHJ5KCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IHJlZ2lzdHJ5LmlzQmFja2ZpbGxlZCgpLCBmYWxzZSk7XG5cblx0XHQvLyBTaW11bGF0ZSBhIG9uZS10aW1lIGJhY2tmaWxsOiBtZXJnZSBzZXNzaW9ucywgdGhlbiBzZXQgdGhlIG1hcmtlci5cblx0XHRhd2FpdCByZWdpc3RlckV4cGxpY2l0KHJlZ2lzdHJ5LCBhLCAnY29waWxvdCcsIDEwMCk7XG5cdFx0YXdhaXQgcmVnaXN0ZXJFeHBsaWNpdChyZWdpc3RyeSwgYiwgJ2NsYXVkZScsIDIwMCk7XG5cdFx0YXdhaXQgcmVnaXN0cnkubWFya0JhY2tmaWxsZWQoKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCByZWdpc3RyeS5pc0JhY2tmaWxsZWQoKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCgoYXdhaXQgbGlzdChyZWdpc3RyeSkpLm1hcChzID0+IHMuc2Vzc2lvbi50b1N0cmluZygpKS5zb3J0KCksIFthLnRvU3RyaW5nKCksIGIudG9TdHJpbmcoKV0uc29ydCgpKTtcblxuXHRcdC8vIFRoZSBtYXJrZXIgcGVyc2lzdHMgYWNyb3NzIGluc3RhbmNlcyBzbyB0aGUgc2VlZCBuZXZlciBydW5zIHR3aWNlLlxuXHRcdGNvbnN0IHNlY29uZCA9IGNyZWF0ZVJlZ2lzdHJ5KCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IHNlY29uZC5pc0JhY2tmaWxsZWQoKSwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Blci1wcm92aWRlciBiYWNrZmlsbCBtYXJrZXJzIGFyZSBpbmRlcGVuZGVudCBhbmQgZHVyYWJsZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZWdpc3RyeSA9IGNyZWF0ZVJlZ2lzdHJ5KCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IHJlZ2lzdHJ5LmlzUHJvdmlkZXJCYWNrZmlsbGVkKCdjb3BpbG90JyksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgcmVnaXN0cnkuaXNQcm92aWRlckJhY2tmaWxsZWQoJ2NsYXVkZScpLCBmYWxzZSk7XG5cblx0XHRhd2FpdCByZWdpc3RlckV4cGxpY2l0KHJlZ2lzdHJ5LCBhLCAnY29waWxvdCcsIDEwMCk7XG5cdFx0YXdhaXQgcmVnaXN0cnkubWFya1Byb3ZpZGVyQmFja2ZpbGxlZCgnY29waWxvdCcpO1xuXG5cdFx0Ly8gT25seSB0aGUgc3dlcHQgcHJvdmlkZXIgaXMgbWFya2VkIFx1MjAxNCBhIHByb3ZpZGVyIHRoYXQgaGFzbid0IGhhZCBpdHMgb3duXG5cdFx0Ly8gc3dlZXAgcnVuIHlldCAoZS5nLiBiZWNhdXNlIGl0IHJlZ2lzdGVyZWQgbGF0ZXIpIGlzIHN0aWxsIHBlbmRpbmcsXG5cdFx0Ly8gdW5saWtlIHRoZSBsZWdhY3kgZ2xvYmFsIG1hcmtlciB3aGljaCBjb3ZlcmVkIGV2ZXJ5IHByb3ZpZGVyIGF0IG9uY2UuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IHJlZ2lzdHJ5LmlzUHJvdmlkZXJCYWNrZmlsbGVkKCdjb3BpbG90JyksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCByZWdpc3RyeS5pc1Byb3ZpZGVyQmFja2ZpbGxlZCgnY2xhdWRlJyksIGZhbHNlKTtcblxuXHRcdC8vIFRoZSBtYXJrZXIgcGVyc2lzdHMgYWNyb3NzIGluc3RhbmNlcy5cblx0XHRjb25zdCBzZWNvbmQgPSBjcmVhdGVSZWdpc3RyeSgpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHR7IGNvcGlsb3Q6IGF3YWl0IHNlY29uZC5pc1Byb3ZpZGVyQmFja2ZpbGxlZCgnY29waWxvdCcpLCBjbGF1ZGU6IGF3YWl0IHNlY29uZC5pc1Byb3ZpZGVyQmFja2ZpbGxlZCgnY2xhdWRlJykgfSxcblx0XHRcdHsgY29waWxvdDogdHJ1ZSwgY2xhdWRlOiBmYWxzZSB9LFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlZ2lzdGVyIHBlcnNpc3RlbmNlIGZhaWx1cmUgY2FuIGJlIHJldHJpZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgZGF0YWJhc2UuY2xvc2UoKTtcblx0XHRkYXRhYmFzZSA9IG5ldyBUZXN0QWdlbnRIb3N0RGF0YWJhc2UoKTtcblx0XHRjb25zdCByZWdpc3RyeSA9IGNyZWF0ZVJlZ2lzdHJ5KCk7XG5cdFx0KGRhdGFiYXNlIGFzIFRlc3RBZ2VudEhvc3REYXRhYmFzZSkuZmFpbE5leHRXcml0ZSgpO1xuXG5cdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMocmVnaXN0ZXJFeHBsaWNpdChyZWdpc3RyeSwgYSwgJ2NvcGlsb3QnLCAxMDApLCAvd3JpdGUgZmFpbGVkLyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhd2FpdCBsaXN0KHJlZ2lzdHJ5KSwgW10pO1xuXG5cdFx0YXdhaXQgcmVnaXN0ZXJFeHBsaWNpdChyZWdpc3RyeSwgYSwgJ2NvcGlsb3QnLCAxMDApO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoKGF3YWl0IGxpc3QocmVnaXN0cnkpKS5tYXAoZW50cnkgPT4gZW50cnkuc2Vzc2lvbi50b1N0cmluZygpKSwgW2EudG9TdHJpbmcoKV0pO1xuXHR9KTtcblxuXHR0ZXN0KCd1bnJlZ2lzdGVyIHBlcnNpc3RlbmNlIGZhaWx1cmUgY2FuIGJlIHJldHJpZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgZGF0YWJhc2UuY2xvc2UoKTtcblx0XHRkYXRhYmFzZSA9IG5ldyBUZXN0QWdlbnRIb3N0RGF0YWJhc2UoKTtcblx0XHRjb25zdCByZWdpc3RyeSA9IGNyZWF0ZVJlZ2lzdHJ5KCk7XG5cdFx0YXdhaXQgcmVnaXN0ZXJFeHBsaWNpdChyZWdpc3RyeSwgYSwgJ2NvcGlsb3QnLCAxMDApO1xuXHRcdChkYXRhYmFzZSBhcyBUZXN0QWdlbnRIb3N0RGF0YWJhc2UpLmZhaWxOZXh0V3JpdGUoKTtcblxuXHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKHJlZ2lzdHJ5LnVucmVnaXN0ZXIoYSksIC93cml0ZSBmYWlsZWQvKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKChhd2FpdCBsaXN0KHJlZ2lzdHJ5KSkubWFwKGVudHJ5ID0+IGVudHJ5LnNlc3Npb24udG9TdHJpbmcoKSksIFthLnRvU3RyaW5nKCldKTtcblxuXHRcdGF3YWl0IHJlZ2lzdHJ5LnVucmVnaXN0ZXIoYSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhd2FpdCBsaXN0KHJlZ2lzdHJ5KSwgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdtYXJrQmFja2ZpbGxlZCBwZXJzaXN0ZW5jZSBmYWlsdXJlIGNhbiBiZSByZXRyaWVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IGRhdGFiYXNlLmNsb3NlKCk7XG5cdFx0ZGF0YWJhc2UgPSBuZXcgVGVzdEFnZW50SG9zdERhdGFiYXNlKCk7XG5cdFx0Y29uc3QgcmVnaXN0cnkgPSBjcmVhdGVSZWdpc3RyeSgpO1xuXHRcdChkYXRhYmFzZSBhcyBUZXN0QWdlbnRIb3N0RGF0YWJhc2UpLmZhaWxOZXh0V3JpdGUoKTtcblxuXHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKHJlZ2lzdHJ5Lm1hcmtCYWNrZmlsbGVkKCksIC93cml0ZSBmYWlsZWQvKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgcmVnaXN0cnkuaXNCYWNrZmlsbGVkKCksIGZhbHNlKTtcblxuXHRcdGF3YWl0IHJlZ2lzdHJ5Lm1hcmtCYWNrZmlsbGVkKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IHJlZ2lzdHJ5LmlzQmFja2ZpbGxlZCgpLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnbWFya1Byb3ZpZGVyQmFja2ZpbGxlZCBwZXJzaXN0ZW5jZSBmYWlsdXJlIGNhbiBiZSByZXRyaWVkIHdpdGhvdXQgYWZmZWN0aW5nIG90aGVyIHByb3ZpZGVycycsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBkYXRhYmFzZS5jbG9zZSgpO1xuXHRcdGRhdGFiYXNlID0gbmV3IFRlc3RBZ2VudEhvc3REYXRhYmFzZSgpO1xuXHRcdGNvbnN0IHJlZ2lzdHJ5ID0gY3JlYXRlUmVnaXN0cnkoKTtcblx0XHRhd2FpdCByZWdpc3RyeS5tYXJrUHJvdmlkZXJCYWNrZmlsbGVkKCdjbGF1ZGUnKTtcblx0XHQoZGF0YWJhc2UgYXMgVGVzdEFnZW50SG9zdERhdGFiYXNlKS5mYWlsTmV4dFdyaXRlKCk7XG5cblx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhyZWdpc3RyeS5tYXJrUHJvdmlkZXJCYWNrZmlsbGVkKCdjb3BpbG90JyksIC93cml0ZSBmYWlsZWQvKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0eyBjb3BpbG90OiBhd2FpdCByZWdpc3RyeS5pc1Byb3ZpZGVyQmFja2ZpbGxlZCgnY29waWxvdCcpLCBjbGF1ZGU6IGF3YWl0IHJlZ2lzdHJ5LmlzUHJvdmlkZXJCYWNrZmlsbGVkKCdjbGF1ZGUnKSB9LFxuXHRcdFx0eyBjb3BpbG90OiBmYWxzZSwgY2xhdWRlOiB0cnVlIH0sXG5cdFx0KTtcblxuXHRcdGF3YWl0IHJlZ2lzdHJ5Lm1hcmtQcm92aWRlckJhY2tmaWxsZWQoJ2NvcGlsb3QnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgcmVnaXN0cnkuaXNQcm92aWRlckJhY2tmaWxsZWQoJ2NvcGlsb3QnKSwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlYWQgZmFpbHVyZSBjYW4gYmUgcmV0cmllZCB3aXRob3V0IGxvc2luZyBwZXJzaXN0ZWQgc2Vzc2lvbnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgZGF0YWJhc2UuY2xvc2UoKTtcblx0XHRkYXRhYmFzZSA9IG5ldyBUZXN0QWdlbnRIb3N0RGF0YWJhc2UoKTtcblx0XHRjb25zdCBmaXJzdCA9IGNyZWF0ZVJlZ2lzdHJ5KCk7XG5cdFx0YXdhaXQgcmVnaXN0ZXJFeHBsaWNpdChmaXJzdCwgYSwgJ2NvcGlsb3QnLCAxMDApO1xuXHRcdGNvbnN0IHNlY29uZCA9IGNyZWF0ZVJlZ2lzdHJ5KCk7XG5cdFx0KGRhdGFiYXNlIGFzIFRlc3RBZ2VudEhvc3REYXRhYmFzZSkuZmFpbE5leHRSZWFkKCk7XG5cblx0XHRhd2FpdCByZWdpc3RlckV4cGxpY2l0KHNlY29uZCwgYiwgJ2NsYXVkZScsIDIwMCk7XG5cdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMobGlzdChzZWNvbmQpLCAvcmVhZCBmYWlsZWQvKTtcblx0XHRhd2FpdCByZWdpc3RlckV4cGxpY2l0KHNlY29uZCwgYiwgJ2NsYXVkZScsIDIwMCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0KGF3YWl0IGxpc3Qoc2Vjb25kKSkubWFwKGVudHJ5ID0+IGVudHJ5LnNlc3Npb24udG9TdHJpbmcoKSkuc29ydCgpLFxuXHRcdFx0W2EudG9TdHJpbmcoKSwgYi50b1N0cmluZygpXS5zb3J0KCksXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgndW5yZWdpc3RlciBkdXJhYmx5IHRvbWJzdG9uZXMgYSBzZXNzaW9uIHNvIGl0IGlzIG5vdCByZXN1cnJlY3RlZCBieSByZWdpc3RlcicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZWdpc3RyeSA9IGNyZWF0ZVJlZ2lzdHJ5KCk7XG5cdFx0YXdhaXQgcmVnaXN0ZXJFeHBsaWNpdChyZWdpc3RyeSwgYSwgJ2NvcGlsb3QnLCAxMDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCByZWdpc3RyeS5pc1RvbWJzdG9uZWQoYSksIGZhbHNlKTtcblxuXHRcdGF3YWl0IHJlZ2lzdHJ5LnVucmVnaXN0ZXIoYSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IHJlZ2lzdHJ5LmlzVG9tYnN0b25lZChhKSwgdHJ1ZSwgJ3VucmVnaXN0ZXIgbXVzdCBkdXJhYmx5IHRvbWJzdG9uZSB0aGUgc2Vzc2lvbicpO1xuXG5cdFx0Ly8gVGhlIHRvbWJzdG9uZSBwZXJzaXN0cyBhY3Jvc3MgaW5zdGFuY2VzIChpdCBpcyBkdXJhYmxlLCBub3QgaW4tcHJvY2VzcykuXG5cdFx0Y29uc3Qgc2Vjb25kID0gY3JlYXRlUmVnaXN0cnkoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgc2Vjb25kLmlzVG9tYnN0b25lZChhKSwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlZ2lzdGVyIGNsZWFycyBhbiBleGlzdGluZyB0b21ic3RvbmUgKGV4cGxpY2l0IGNyZWF0ZSknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVnaXN0cnkgPSBjcmVhdGVSZWdpc3RyeSgpO1xuXHRcdGF3YWl0IHJlZ2lzdGVyRXhwbGljaXQocmVnaXN0cnksIGEsICdjb3BpbG90JywgMTAwKTtcblx0XHRhd2FpdCByZWdpc3RyeS51bnJlZ2lzdGVyKGEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCByZWdpc3RyeS5pc1RvbWJzdG9uZWQoYSksIHRydWUpO1xuXG5cdFx0Ly8gQW4gZXhwbGljaXQgcmUtcmVnaXN0ZXIgKGEgZ2VudWluZSBuZXcgYGNyZWF0ZVNlc3Npb25gKSBtdXN0IGNsZWFyXG5cdFx0Ly8gdGhlIHRvbWJzdG9uZSBzbyB0aGUgc2Vzc2lvbiBpcyB1c2FibGUgYWdhaW4uXG5cdFx0YXdhaXQgcmVnaXN0ZXJFeHBsaWNpdChyZWdpc3RyeSwgYSwgJ2NvcGlsb3QnLCAxNTApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCByZWdpc3RyeS5pc1RvbWJzdG9uZWQoYSksIGZhbHNlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKChhd2FpdCBsaXN0KHJlZ2lzdHJ5KSkubWFwKHMgPT4gcy5zZXNzaW9uLnRvU3RyaW5nKCkpLCBbYS50b1N0cmluZygpXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NsZWFyVG9tYnN0b25lIGNhbiBhbHNvIGJlIGNhbGxlZCBkaXJlY3RseScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZWdpc3RyeSA9IGNyZWF0ZVJlZ2lzdHJ5KCk7XG5cdFx0YXdhaXQgcmVnaXN0ZXJFeHBsaWNpdChyZWdpc3RyeSwgYSwgJ2NvcGlsb3QnLCAxMDApO1xuXHRcdGF3YWl0IHJlZ2lzdHJ5LnVucmVnaXN0ZXIoYSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IHJlZ2lzdHJ5LmlzVG9tYnN0b25lZChhKSwgdHJ1ZSk7XG5cblx0XHRhd2FpdCByZWdpc3RyeS5jbGVhclRvbWJzdG9uZShhKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgcmVnaXN0cnkuaXNUb21ic3RvbmVkKGEpLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Rpc2NvdmVyeSBkZWNsaW5lcyB0byByZWdpc3RlciAob3IgcmVzdXJyZWN0KSBhIHRvbWJzdG9uZWQgc2Vzc2lvbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZWdpc3RyeSA9IGNyZWF0ZVJlZ2lzdHJ5KCk7XG5cdFx0YXdhaXQgcmVnaXN0ZXJFeHBsaWNpdChyZWdpc3RyeSwgYSwgJ2NvcGlsb3QnLCAxMDApO1xuXHRcdGF3YWl0IHJlZ2lzdHJ5LnVucmVnaXN0ZXIoYSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IHJlZ2lzdHJ5LmlzVG9tYnN0b25lZChhKSwgdHJ1ZSk7XG5cblx0XHQvLyBVbmxpa2UgYHJlZ2lzdGVyYCwgYSByZXZpdmFsIGF0dGVtcHQgKGJhY2tmaWxsLCByZXN0b3JlKSBtdXN0IG5vdFxuXHRcdC8vIHJlc3VycmVjdCBhbiBleHBsaWNpdGx5LWRlbGV0ZWQgc2Vzc2lvbi5cblx0XHRjb25zdCByZWdpc3RlcmVkID0gYXdhaXQgcmVnaXN0ZXJEaXNjb3ZlcmVkKHJlZ2lzdHJ5LCBhLCAnY29waWxvdCcsIDIwMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlZ2lzdGVyZWQsIGZhbHNlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGF3YWl0IGxpc3QocmVnaXN0cnkpLCBbXSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IHJlZ2lzdHJ5LmlzVG9tYnN0b25lZChhKSwgdHJ1ZSwgJ3RoZSB0b21ic3RvbmUgbXVzdCByZW1haW4gaW4gcGxhY2UnKTtcblx0fSk7XG5cblx0dGVzdCgnZGlzY292ZXJ5IHJlZ2lzdGVycyBhIHNlc3Npb24gdGhhdCBpcyBub3QgdG9tYnN0b25lZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZWdpc3RyeSA9IGNyZWF0ZVJlZ2lzdHJ5KCk7XG5cdFx0Y29uc3QgcmVnaXN0ZXJlZCA9IGF3YWl0IHJlZ2lzdGVyRGlzY292ZXJlZChyZWdpc3RyeSwgYSwgJ2NvcGlsb3QnLCAxMDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWdpc3RlcmVkLCB0cnVlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKChhd2FpdCBsaXN0KHJlZ2lzdHJ5KSkubWFwKHMgPT4gcy5zZXNzaW9uLnRvU3RyaW5nKCkpLCBbYS50b1N0cmluZygpXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Rpc2NvdmVyeSBwZXJzaXN0ZW5jZSBmYWlsdXJlIGNhbiBiZSByZXRyaWVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IGRhdGFiYXNlLmNsb3NlKCk7XG5cdFx0ZGF0YWJhc2UgPSBuZXcgVGVzdEFnZW50SG9zdERhdGFiYXNlKCk7XG5cdFx0Y29uc3QgcmVnaXN0cnkgPSBjcmVhdGVSZWdpc3RyeSgpO1xuXHRcdChkYXRhYmFzZSBhcyBUZXN0QWdlbnRIb3N0RGF0YWJhc2UpLmZhaWxOZXh0V3JpdGUoKTtcblxuXHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKHJlZ2lzdGVyRGlzY292ZXJlZChyZWdpc3RyeSwgYSwgJ2NvcGlsb3QnLCAxMDApLCAvd3JpdGUgZmFpbGVkLyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhd2FpdCBsaXN0KHJlZ2lzdHJ5KSwgW10pO1xuXG5cdFx0Y29uc3QgcmVnaXN0ZXJlZCA9IGF3YWl0IHJlZ2lzdGVyRGlzY292ZXJlZChyZWdpc3RyeSwgYSwgJ2NvcGlsb3QnLCAxMDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWdpc3RlcmVkLCB0cnVlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKChhd2FpdCBsaXN0KHJlZ2lzdHJ5KSkubWFwKGVudHJ5ID0+IGVudHJ5LnNlc3Npb24udG9TdHJpbmcoKSksIFthLnRvU3RyaW5nKCldKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLCtDQUErQztBQUN4RCxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLHlCQUErSztBQUN4TCxTQUFTLDRCQUE0QjtBQUVyQyxNQUFNLHNCQUFvRDtBQUFBLEVBQTFEO0FBQ0MsU0FBUyxXQUFXLG9CQUFJLElBQXVDO0FBQy9ELHNCQUFhO0FBQ2IsU0FBaUIsc0JBQXNCLG9CQUFJLElBQVk7QUFDdkQsU0FBaUIsY0FBYyxvQkFBSSxJQUFZO0FBQy9DLFNBQVEsaUJBQWlCO0FBQ3pCLFNBQVEsZ0JBQWdCO0FBQ3hCLHFCQUFZO0FBQ1osU0FBUyxrQkFBc0QsQ0FBQztBQUFBO0FBQUEsRUFFaEUsZ0JBQXNCO0FBQ3JCLFNBQUs7QUFBQSxFQUNOO0FBQUEsRUFFQSxlQUFxQjtBQUNwQixTQUFLO0FBQUEsRUFDTjtBQUFBLEVBRUEsTUFBTSxnQkFBZ0IsU0FBaUIsZ0JBQWtELGlCQUFzRTtBQUM5SixTQUFLLG1CQUFtQjtBQUN4QixRQUFJLGdCQUFnQixrQkFBa0IsS0FBSyxZQUFZLElBQUksT0FBTyxHQUFHO0FBQ3BFLGFBQU87QUFBQSxJQUNSO0FBQ0EsVUFBTSxFQUFFLFVBQVUsV0FBVyxPQUFPLElBQUk7QUFDeEMsVUFBTSxXQUFXLEtBQUssU0FBUyxJQUFJLE9BQU87QUFDMUMsVUFBTSxXQUFXLEVBQUUsU0FBUyxVQUFVLFdBQVcsVUFBVSxXQUFXLGFBQWEsT0FBTztBQUMxRixTQUFLLFNBQVMsSUFBSSxTQUFTLFdBQVcsYUFDbkMsRUFBRSxHQUFHLFVBQVUsV0FBVyxVQUFVLGFBQWEsVUFBVSxJQUMzRCxZQUFZLFdBQVcsY0FDdEIsRUFBRSxHQUFHLFVBQVUsVUFBVSxNQUFNLFFBQVEsWUFBWSxJQUNuRCxZQUFZLFFBQVE7QUFDeEIsUUFBSSxDQUFDLGdCQUFnQixnQkFBZ0I7QUFD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
