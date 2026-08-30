import assert from "assert";
import { VSBuffer } from "../../../../../../base/common/buffer.js";
import { Emitter } from "../../../../../../base/common/event.js";
import { DisposableStore } from "../../../../../../base/common/lifecycle.js";
import { URI } from "../../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { TestInstantiationService } from "../../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { ServiceCollection } from "../../../../../../platform/instantiation/common/serviceCollection.js";
import { NullLogService, ILogService } from "../../../../../../platform/log/common/log.js";
import { Extensions as JSONExtensions } from "../../../../../../platform/jsonschemas/common/jsonContributionRegistry.js";
import { Registry } from "../../../../../../platform/registry/common/platform.js";
import { ISessionsProvidersService } from "../../../../../services/sessions/browser/sessionsProvidersService.js";
import { agentSessionSettingsUri, AgentSessionSettingsFileSystemProvider, AgentSessionSettingsSchemaRegistrar } from "../../browser/agentSessionSettingsFileSystemProvider.js";
const PROVIDER_ID = "local-agent-host";
const RESOURCE_SCHEME = "agent-host-copilot";
const RAW_ID = "abc-123";
suite("AgentSessionSettingsFileSystemProvider", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  function createSession() {
    const resource = URI.from({ scheme: RESOURCE_SCHEME, path: `/${RAW_ID}` });
    return {
      sessionId: `${PROVIDER_ID}:${resource.toString()}`,
      resource,
      providerId: PROVIDER_ID
    };
  }
  function createHarness(initialConfig, registerProvider = true) {
    const session = createSession();
    const onDidChangeSessionConfigEmitter = store.add(new Emitter());
    const onDidChangeSessionsEmitter = store.add(new Emitter());
    const replaceCalls = [];
    const sessionProvider = {
      id: PROVIDER_ID,
      config: initialConfig,
      onDidChangeSessionConfigEmitter,
      onDidChangeSessionsEmitter,
      replaceCalls,
      onDidChangeSessionConfig: onDidChangeSessionConfigEmitter.event,
      onDidChangeSessions: onDidChangeSessionsEmitter.event,
      getSessions: () => [session],
      getSessionConfig: (_sessionId) => sessionProvider.config,
      replaceSessionConfig: async (sessionId, values) => {
        replaceCalls.push({ sessionId, values });
        if (sessionProvider.config) {
          sessionProvider.config = {
            ...sessionProvider.config,
            values: { ...values }
          };
        }
      },
      setSessionConfigValue: async () => {
      }
    };
    const onDidChangeProvidersEmitter = store.add(new Emitter());
    const providersService = {
      getProvider(providerId) {
        if (registerProvider && providerId === PROVIDER_ID) {
          return sessionProvider;
        }
        return void 0;
      },
      getProviders: () => registerProvider ? [sessionProvider] : [],
      onDidChangeProviders: onDidChangeProvidersEmitter.event
    };
    const instantiationService = store.add(new TestInstantiationService(new ServiceCollection(
      [ISessionsProvidersService, providersService],
      [ILogService, new NullLogService()]
    )));
    const schemaRegistrar = store.add(instantiationService.createInstance(AgentSessionSettingsSchemaRegistrar));
    const fs = store.add(instantiationService.createInstance(AgentSessionSettingsFileSystemProvider, schemaRegistrar));
    return { fs, session, uri: agentSessionSettingsUri(session), sessionProvider };
  }
  test("readFile returns mutable, non-readOnly config values as JSON", async () => {
    const { fs, uri } = createHarness({
      schema: {
        type: "object",
        properties: {
          autoApprove: { type: "string", title: "Auto Approve", sessionMutable: true, enum: ["default", "autoApprove"] },
          isolation: { type: "string", title: "Isolation", enum: ["worktree"] },
          // non-mutable — omitted
          branch: { type: "string", title: "Branch", sessionMutable: true, readOnly: true, enum: ["main"] }
          // readOnly — omitted
        }
      },
      values: { autoApprove: "default", isolation: "worktree", branch: "main" }
    });
    const buf = await fs.readFile(uri);
    const text = VSBuffer.wrap(buf).toString();
    const jsonStart = text.indexOf("{");
    const parsed = JSON.parse(text.substring(jsonStart));
    assert.deepStrictEqual(parsed, { autoApprove: "default" });
  });
  test("writeFile with unchanged content still forwards raw input (provider guards/short-circuits)", async () => {
    const { fs, uri, session, sessionProvider } = createHarness({
      schema: {
        type: "object",
        properties: {
          autoApprove: { type: "string", title: "Auto Approve", sessionMutable: true, enum: ["default", "autoApprove"] }
        }
      },
      values: { autoApprove: "default" }
    });
    const current = await fs.readFile(uri);
    await fs.writeFile(uri, current, { create: false, overwrite: true, unlock: false, atomic: false });
    assert.deepStrictEqual(sessionProvider.replaceCalls, [{
      sessionId: session.sessionId,
      values: { autoApprove: "default" }
    }]);
  });
  test("writeFile forwards the user's parsed JSON as the replace payload", async () => {
    const { fs, uri, session, sessionProvider } = createHarness({
      schema: {
        type: "object",
        properties: {
          autoApprove: { type: "string", title: "Auto Approve", sessionMutable: true, enum: ["default", "autoApprove"] },
          mode: { type: "string", title: "Mode", sessionMutable: true, enum: ["a", "b"] },
          isolation: { type: "string", title: "Isolation", enum: ["worktree"] },
          // non-mutable
          branch: { type: "string", title: "Branch", sessionMutable: true, readOnly: true, enum: ["main"] }
          // readOnly
        }
      },
      values: { autoApprove: "default", mode: "a", isolation: "worktree", branch: "main" }
    });
    const newContent = VSBuffer.fromString('// trailing comments ok\n{ "autoApprove": "autoApprove", "mode": "b", }\n').buffer;
    await fs.writeFile(uri, newContent, { create: false, overwrite: true, unlock: false, atomic: false });
    assert.deepStrictEqual(sessionProvider.replaceCalls, [{
      sessionId: session.sessionId,
      values: { autoApprove: "autoApprove", mode: "b" }
    }]);
  });
  test("writeFile forwards a partial edit set, supporting unset via omission", async () => {
    const { fs, uri, session, sessionProvider } = createHarness({
      schema: {
        type: "object",
        properties: {
          autoApprove: { type: "string", title: "Auto Approve", sessionMutable: true, enum: ["default", "autoApprove"] },
          mode: { type: "string", title: "Mode", sessionMutable: true, enum: ["a", "b"] },
          isolation: { type: "string", title: "Isolation", enum: ["worktree"] }
        }
      },
      values: { autoApprove: "autoApprove", mode: "a", isolation: "worktree" }
    });
    const newContent = VSBuffer.fromString('{ "autoApprove": "default" }\n').buffer;
    await fs.writeFile(uri, newContent, { create: false, overwrite: true, unlock: false, atomic: false });
    assert.deepStrictEqual(sessionProvider.replaceCalls, [{
      sessionId: session.sessionId,
      values: { autoApprove: "default" }
    }]);
  });
  test("onDidChangeFile fires when provider config changes", async () => {
    const { fs, uri, session, sessionProvider } = createHarness({
      schema: { type: "object", properties: {} },
      values: {}
    });
    const events = [];
    const listeners = new DisposableStore();
    store.add(listeners);
    listeners.add(fs.onDidChangeFile((changes) => {
      for (const c of changes) {
        events.push(c.resource);
      }
    }));
    const watch = fs.watch(uri, { recursive: false, excludes: [] });
    listeners.add(watch);
    sessionProvider.onDidChangeSessionConfigEmitter.fire(session.sessionId);
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].toString(), uri.toString());
  });
  test("readFile on unknown provider throws FileNotFound", async () => {
    const { fs, uri } = createHarness(
      void 0,
      /*registerProvider*/
      false
    );
    await assert.rejects(async () => {
      await fs.readFile(uri);
    });
  });
  suite("schema registration", () => {
    const schemaRegistry = Registry.as(JSONExtensions.JSONContribution);
    function expectedSchemaId(session) {
      return `vscode://schemas/agent-session-settings/${session.providerId}/${session.resource.scheme}/${session.resource.path}.jsonc`;
    }
    test("readFile lazily registers a schema + association for the session", async () => {
      const { fs, uri, session } = createHarness({
        schema: {
          type: "object",
          properties: {
            autoApprove: { type: "string", title: "Auto Approve", sessionMutable: true, enum: ["default", "autoApprove"] }
          }
        },
        values: { autoApprove: "default" }
      });
      const schemaId = expectedSchemaId(session);
      assert.strictEqual(schemaRegistry.hasSchemaContent(schemaId), false);
      assert.strictEqual(schemaRegistry.getSchemaAssociations()[schemaId], void 0);
      await fs.readFile(uri);
      assert.strictEqual(schemaRegistry.hasSchemaContent(schemaId), true);
      assert.deepStrictEqual(schemaRegistry.getSchemaAssociations()[schemaId], [uri.toString()]);
    });
    test("schema is refreshed when onDidChangeSessionConfig fires with a new schema identity", async () => {
      const { fs, uri, session, sessionProvider } = createHarness({
        schema: {
          type: "object",
          properties: {
            autoApprove: { type: "string", title: "Auto Approve", sessionMutable: true, enum: ["default"] }
          }
        },
        values: { autoApprove: "default" }
      });
      const schemaId = expectedSchemaId(session);
      await fs.readFile(uri);
      const initial = schemaRegistry.getSchemaContributions().schemas[schemaId];
      assert.ok(initial);
      sessionProvider.config = {
        schema: {
          type: "object",
          properties: {
            autoApprove: { type: "string", title: "Auto Approve", sessionMutable: true, enum: ["default", "autoApprove"] },
            mode: { type: "string", title: "Mode", sessionMutable: true, enum: ["a", "b"] }
          }
        },
        values: { autoApprove: "default", mode: "a" }
      };
      sessionProvider.onDidChangeSessionConfigEmitter.fire(session.sessionId);
      const refreshed = schemaRegistry.getSchemaContributions().schemas[schemaId];
      assert.notStrictEqual(refreshed, initial);
      assert.ok(refreshed.properties?.["mode"], "refreshed schema should include the newly added property");
    });
    test("schema is disposed when the session is removed", async () => {
      const { fs, uri, session, sessionProvider } = createHarness({
        schema: {
          type: "object",
          properties: {
            autoApprove: { type: "string", title: "Auto Approve", sessionMutable: true, enum: ["default"] }
          }
        },
        values: { autoApprove: "default" }
      });
      const schemaId = expectedSchemaId(session);
      await fs.readFile(uri);
      assert.strictEqual(schemaRegistry.hasSchemaContent(schemaId), true);
      sessionProvider.onDidChangeSessionsEmitter.fire({ added: [], removed: [session], changed: [] });
      assert.strictEqual(schemaRegistry.hasSchemaContent(schemaId), false);
      assert.strictEqual(schemaRegistry.getSchemaAssociations()[schemaId], void 0);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxccHJvdmlkZXJzXFxhZ2VudEhvc3RcXHRlc3RcXGJyb3dzZXJcXGFnZW50U2Vzc2lvblNldHRpbmdzRmlsZVN5c3RlbVByb3ZpZGVyLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB0eXBlIHsgUmVzb2x2ZVNlc3Npb25Db25maWdSZXN1bHQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL3Byb3RvY29sL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vdGVzdC9jb21tb24vaW5zdGFudGlhdGlvblNlcnZpY2VNb2NrLmpzJztcbmltcG9ydCB7IFNlcnZpY2VDb2xsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vc2VydmljZUNvbGxlY3Rpb24uanMnO1xuaW1wb3J0IHsgTnVsbExvZ1NlcnZpY2UsIElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9ucyBhcyBKU09ORXh0ZW5zaW9ucywgSUpTT05Db250cmlidXRpb25SZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2pzb25zY2hlbWFzL2NvbW1vbi9qc29uQ29udHJpYnV0aW9uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHR5cGUgeyBJQWdlbnRIb3N0U2Vzc2lvbnNQcm92aWRlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2NvbW1vbi9hZ2VudEhvc3RTZXNzaW9uc1Byb3ZpZGVyLmpzJztcbmltcG9ydCB7IElTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9icm93c2VyL3Nlc3Npb25zUHJvdmlkZXJzU2VydmljZS5qcyc7XG5pbXBvcnQgdHlwZSB7IElTZXNzaW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvY29tbW9uL3Nlc3Npb24uanMnO1xuaW1wb3J0IHR5cGUgeyBJU2Vzc2lvbnNQcm92aWRlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2NvbW1vbi9zZXNzaW9uc1Byb3ZpZGVyLmpzJztcbmltcG9ydCB7IGFnZW50U2Vzc2lvblNldHRpbmdzVXJpLCBBZ2VudFNlc3Npb25TZXR0aW5nc0ZpbGVTeXN0ZW1Qcm92aWRlciwgQWdlbnRTZXNzaW9uU2V0dGluZ3NTY2hlbWFSZWdpc3RyYXIgfSBmcm9tICcuLi8uLi9icm93c2VyL2FnZW50U2Vzc2lvblNldHRpbmdzRmlsZVN5c3RlbVByb3ZpZGVyLmpzJztcblxuY29uc3QgUFJPVklERVJfSUQgPSAnbG9jYWwtYWdlbnQtaG9zdCc7XG5jb25zdCBSRVNPVVJDRV9TQ0hFTUUgPSAnYWdlbnQtaG9zdC1jb3BpbG90JztcbmNvbnN0IFJBV19JRCA9ICdhYmMtMTIzJztcblxuc3VpdGUoJ0FnZW50U2Vzc2lvblNldHRpbmdzRmlsZVN5c3RlbVByb3ZpZGVyJywgKCkgPT4ge1xuXG5cdGNvbnN0IHN0b3JlID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0ZnVuY3Rpb24gY3JlYXRlU2Vzc2lvbigpOiBJU2Vzc2lvbiB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZnJvbSh7IHNjaGVtZTogUkVTT1VSQ0VfU0NIRU1FLCBwYXRoOiBgLyR7UkFXX0lEfWAgfSk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHNlc3Npb25JZDogYCR7UFJPVklERVJfSUR9OiR7cmVzb3VyY2UudG9TdHJpbmcoKX1gLFxuXHRcdFx0cmVzb3VyY2UsXG5cdFx0XHRwcm92aWRlcklkOiBQUk9WSURFUl9JRCxcblx0XHR9IGFzIHVua25vd24gYXMgSVNlc3Npb247XG5cdH1cblxuXHRpbnRlcmZhY2UgSVRlc3RIYXJuZXNzIHtcblx0XHRyZWFkb25seSBmczogQWdlbnRTZXNzaW9uU2V0dGluZ3NGaWxlU3lzdGVtUHJvdmlkZXI7XG5cdFx0cmVhZG9ubHkgc2Vzc2lvbjogSVNlc3Npb247XG5cdFx0cmVhZG9ubHkgdXJpOiBVUkk7XG5cdFx0cmVhZG9ubHkgc2Vzc2lvblByb3ZpZGVyOiBJTW9ja0FnZW50SG9zdFNlc3Npb25zUHJvdmlkZXI7XG5cdH1cblxuXHRpbnRlcmZhY2UgSU1vY2tBZ2VudEhvc3RTZXNzaW9uc1Byb3ZpZGVyIGV4dGVuZHMgSUFnZW50SG9zdFNlc3Npb25zUHJvdmlkZXIge1xuXHRcdGNvbmZpZzogUmVzb2x2ZVNlc3Npb25Db25maWdSZXN1bHQgfCB1bmRlZmluZWQ7XG5cdFx0cmVhZG9ubHkgb25EaWRDaGFuZ2VTZXNzaW9uQ29uZmlnRW1pdHRlcjogRW1pdHRlcjxzdHJpbmc+O1xuXHRcdHJlYWRvbmx5IG9uRGlkQ2hhbmdlU2Vzc2lvbnNFbWl0dGVyOiBFbWl0dGVyPHsgYWRkZWQ6IHJlYWRvbmx5IElTZXNzaW9uW107IHJlbW92ZWQ6IHJlYWRvbmx5IElTZXNzaW9uW107IGNoYW5nZWQ6IHJlYWRvbmx5IElTZXNzaW9uW10gfT47XG5cdFx0cmVhZG9ubHkgcmVwbGFjZUNhbGxzOiBBcnJheTx7IHNlc3Npb25JZDogc3RyaW5nOyB2YWx1ZXM6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IH0+O1xuXHR9XG5cblx0ZnVuY3Rpb24gY3JlYXRlSGFybmVzcyhcblx0XHRpbml0aWFsQ29uZmlnOiBSZXNvbHZlU2Vzc2lvbkNvbmZpZ1Jlc3VsdCB8IHVuZGVmaW5lZCxcblx0XHRyZWdpc3RlclByb3ZpZGVyID0gdHJ1ZSxcblx0KTogSVRlc3RIYXJuZXNzIHtcblx0XHRjb25zdCBzZXNzaW9uID0gY3JlYXRlU2Vzc2lvbigpO1xuXG5cdFx0Y29uc3Qgb25EaWRDaGFuZ2VTZXNzaW9uQ29uZmlnRW1pdHRlciA9IHN0b3JlLmFkZChuZXcgRW1pdHRlcjxzdHJpbmc+KCkpO1xuXHRcdGNvbnN0IG9uRGlkQ2hhbmdlU2Vzc2lvbnNFbWl0dGVyID0gc3RvcmUuYWRkKG5ldyBFbWl0dGVyPHsgYWRkZWQ6IHJlYWRvbmx5IElTZXNzaW9uW107IHJlbW92ZWQ6IHJlYWRvbmx5IElTZXNzaW9uW107IGNoYW5nZWQ6IHJlYWRvbmx5IElTZXNzaW9uW10gfT4oKSk7XG5cdFx0Y29uc3QgcmVwbGFjZUNhbGxzOiBBcnJheTx7IHNlc3Npb25JZDogc3RyaW5nOyB2YWx1ZXM6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IH0+ID0gW107XG5cblx0XHRjb25zdCBzZXNzaW9uUHJvdmlkZXI6IElNb2NrQWdlbnRIb3N0U2Vzc2lvbnNQcm92aWRlciA9IHtcblx0XHRcdGlkOiBQUk9WSURFUl9JRCxcblx0XHRcdGNvbmZpZzogaW5pdGlhbENvbmZpZyxcblx0XHRcdG9uRGlkQ2hhbmdlU2Vzc2lvbkNvbmZpZ0VtaXR0ZXIsXG5cdFx0XHRvbkRpZENoYW5nZVNlc3Npb25zRW1pdHRlcixcblx0XHRcdHJlcGxhY2VDYWxscyxcblx0XHRcdG9uRGlkQ2hhbmdlU2Vzc2lvbkNvbmZpZzogb25EaWRDaGFuZ2VTZXNzaW9uQ29uZmlnRW1pdHRlci5ldmVudCxcblx0XHRcdG9uRGlkQ2hhbmdlU2Vzc2lvbnM6IG9uRGlkQ2hhbmdlU2Vzc2lvbnNFbWl0dGVyLmV2ZW50LFxuXHRcdFx0Z2V0U2Vzc2lvbnM6ICgpID0+IFtzZXNzaW9uXSxcblx0XHRcdGdldFNlc3Npb25Db25maWc6IChfc2Vzc2lvbklkOiBzdHJpbmcpID0+IHNlc3Npb25Qcm92aWRlci5jb25maWcsXG5cdFx0XHRyZXBsYWNlU2Vzc2lvbkNvbmZpZzogYXN5bmMgKHNlc3Npb25JZDogc3RyaW5nLCB2YWx1ZXM6IFJlY29yZDxzdHJpbmcsIHVua25vd24+KSA9PiB7XG5cdFx0XHRcdHJlcGxhY2VDYWxscy5wdXNoKHsgc2Vzc2lvbklkLCB2YWx1ZXMgfSk7XG5cdFx0XHRcdGlmIChzZXNzaW9uUHJvdmlkZXIuY29uZmlnKSB7XG5cdFx0XHRcdFx0c2Vzc2lvblByb3ZpZGVyLmNvbmZpZyA9IHtcblx0XHRcdFx0XHRcdC4uLnNlc3Npb25Qcm92aWRlci5jb25maWcsXG5cdFx0XHRcdFx0XHR2YWx1ZXM6IHsgLi4udmFsdWVzIH0sXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdHNldFNlc3Npb25Db25maWdWYWx1ZTogYXN5bmMgKCkgPT4geyAvKiB1bnVzZWQgYnkgd3JpdGVGaWxlICovIH0sXG5cdFx0fSBhcyB1bmtub3duIGFzIElNb2NrQWdlbnRIb3N0U2Vzc2lvbnNQcm92aWRlcjtcblxuXHRcdGNvbnN0IG9uRGlkQ2hhbmdlUHJvdmlkZXJzRW1pdHRlciA9IHN0b3JlLmFkZChuZXcgRW1pdHRlcjx7IGFkZGVkOiByZWFkb25seSBJU2Vzc2lvbnNQcm92aWRlcltdOyByZW1vdmVkOiByZWFkb25seSBJU2Vzc2lvbnNQcm92aWRlcltdIH0+KCkpO1xuXHRcdGNvbnN0IHByb3ZpZGVyc1NlcnZpY2U6IElTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UgPSB7XG5cdFx0XHRnZXRQcm92aWRlcjxUIGV4dGVuZHMgSVNlc3Npb25zUHJvdmlkZXI+KHByb3ZpZGVySWQ6IHN0cmluZyk6IFQgfCB1bmRlZmluZWQge1xuXHRcdFx0XHRpZiAocmVnaXN0ZXJQcm92aWRlciAmJiBwcm92aWRlcklkID09PSBQUk9WSURFUl9JRCkge1xuXHRcdFx0XHRcdHJldHVybiBzZXNzaW9uUHJvdmlkZXIgYXMgdW5rbm93biBhcyBUO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0UHJvdmlkZXJzOiAoKSA9PiByZWdpc3RlclByb3ZpZGVyID8gW3Nlc3Npb25Qcm92aWRlciBhcyB1bmtub3duIGFzIElTZXNzaW9uc1Byb3ZpZGVyXSA6IFtdLFxuXHRcdFx0b25EaWRDaGFuZ2VQcm92aWRlcnM6IG9uRGlkQ2hhbmdlUHJvdmlkZXJzRW1pdHRlci5ldmVudCxcblx0XHR9IGFzIHVua25vd24gYXMgSVNlc3Npb25zUHJvdmlkZXJzU2VydmljZTtcblxuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gc3RvcmUuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UobmV3IFNlcnZpY2VDb2xsZWN0aW9uKFxuXHRcdFx0W0lTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UsIHByb3ZpZGVyc1NlcnZpY2VdLFxuXHRcdFx0W0lMb2dTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKV0sXG5cdFx0KSkpO1xuXG5cdFx0Y29uc3Qgc2NoZW1hUmVnaXN0cmFyID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50U2Vzc2lvblNldHRpbmdzU2NoZW1hUmVnaXN0cmFyKSk7XG5cdFx0Y29uc3QgZnMgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRTZXNzaW9uU2V0dGluZ3NGaWxlU3lzdGVtUHJvdmlkZXIsIHNjaGVtYVJlZ2lzdHJhcikpO1xuXG5cdFx0cmV0dXJuIHsgZnMsIHNlc3Npb24sIHVyaTogYWdlbnRTZXNzaW9uU2V0dGluZ3NVcmkoc2Vzc2lvbiksIHNlc3Npb25Qcm92aWRlciB9O1xuXHR9XG5cblx0dGVzdCgncmVhZEZpbGUgcmV0dXJucyBtdXRhYmxlLCBub24tcmVhZE9ubHkgY29uZmlnIHZhbHVlcyBhcyBKU09OJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgZnMsIHVyaSB9ID0gY3JlYXRlSGFybmVzcyh7XG5cdFx0XHRzY2hlbWE6IHtcblx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRhdXRvQXBwcm92ZTogeyB0eXBlOiAnc3RyaW5nJywgdGl0bGU6ICdBdXRvIEFwcHJvdmUnLCBzZXNzaW9uTXV0YWJsZTogdHJ1ZSwgZW51bTogWydkZWZhdWx0JywgJ2F1dG9BcHByb3ZlJ10gfSxcblx0XHRcdFx0XHRpc29sYXRpb246IHsgdHlwZTogJ3N0cmluZycsIHRpdGxlOiAnSXNvbGF0aW9uJywgZW51bTogWyd3b3JrdHJlZSddIH0sIC8vIG5vbi1tdXRhYmxlIFx1MjAxNCBvbWl0dGVkXG5cdFx0XHRcdFx0YnJhbmNoOiB7IHR5cGU6ICdzdHJpbmcnLCB0aXRsZTogJ0JyYW5jaCcsIHNlc3Npb25NdXRhYmxlOiB0cnVlLCByZWFkT25seTogdHJ1ZSwgZW51bTogWydtYWluJ10gfSwgLy8gcmVhZE9ubHkgXHUyMDE0IG9taXR0ZWRcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0XHR2YWx1ZXM6IHsgYXV0b0FwcHJvdmU6ICdkZWZhdWx0JywgaXNvbGF0aW9uOiAnd29ya3RyZWUnLCBicmFuY2g6ICdtYWluJyB9LFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgYnVmID0gYXdhaXQgZnMucmVhZEZpbGUodXJpKTtcblx0XHRjb25zdCB0ZXh0ID0gVlNCdWZmZXIud3JhcChidWYpLnRvU3RyaW5nKCk7XG5cdFx0Y29uc3QganNvblN0YXJ0ID0gdGV4dC5pbmRleE9mKCd7Jyk7XG5cdFx0Y29uc3QgcGFyc2VkID0gSlNPTi5wYXJzZSh0ZXh0LnN1YnN0cmluZyhqc29uU3RhcnQpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnNlZCwgeyBhdXRvQXBwcm92ZTogJ2RlZmF1bHQnIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCd3cml0ZUZpbGUgd2l0aCB1bmNoYW5nZWQgY29udGVudCBzdGlsbCBmb3J3YXJkcyByYXcgaW5wdXQgKHByb3ZpZGVyIGd1YXJkcy9zaG9ydC1jaXJjdWl0cyknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBmcywgdXJpLCBzZXNzaW9uLCBzZXNzaW9uUHJvdmlkZXIgfSA9IGNyZWF0ZUhhcm5lc3Moe1xuXHRcdFx0c2NoZW1hOiB7XG5cdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0YXV0b0FwcHJvdmU6IHsgdHlwZTogJ3N0cmluZycsIHRpdGxlOiAnQXV0byBBcHByb3ZlJywgc2Vzc2lvbk11dGFibGU6IHRydWUsIGVudW06IFsnZGVmYXVsdCcsICdhdXRvQXBwcm92ZSddIH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdFx0dmFsdWVzOiB7IGF1dG9BcHByb3ZlOiAnZGVmYXVsdCcgfSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IGN1cnJlbnQgPSBhd2FpdCBmcy5yZWFkRmlsZSh1cmkpO1xuXHRcdGF3YWl0IGZzLndyaXRlRmlsZSh1cmksIGN1cnJlbnQsIHsgY3JlYXRlOiBmYWxzZSwgb3ZlcndyaXRlOiB0cnVlLCB1bmxvY2s6IGZhbHNlLCBhdG9taWM6IGZhbHNlIH0pO1xuXHRcdC8vIEZTIHByb3ZpZGVyIGZvcndhcmRzIHRoZSBwYXJzZWQgSlNPTiBhcy1pczsgdGhlIGd1YXJkL3Nob3J0LWNpcmN1aXRcblx0XHQvLyBpcyB0aGUgcHJvdmlkZXIncyByZXNwb25zaWJpbGl0eSAoY292ZXJlZCBpbiB0aGUgcHJvdmlkZXIgdGVzdCkuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZXNzaW9uUHJvdmlkZXIucmVwbGFjZUNhbGxzLCBbe1xuXHRcdFx0c2Vzc2lvbklkOiBzZXNzaW9uLnNlc3Npb25JZCxcblx0XHRcdHZhbHVlczogeyBhdXRvQXBwcm92ZTogJ2RlZmF1bHQnIH0sXG5cdFx0fV0pO1xuXHR9KTtcblxuXHR0ZXN0KCd3cml0ZUZpbGUgZm9yd2FyZHMgdGhlIHVzZXJcXCdzIHBhcnNlZCBKU09OIGFzIHRoZSByZXBsYWNlIHBheWxvYWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBmcywgdXJpLCBzZXNzaW9uLCBzZXNzaW9uUHJvdmlkZXIgfSA9IGNyZWF0ZUhhcm5lc3Moe1xuXHRcdFx0c2NoZW1hOiB7XG5cdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0YXV0b0FwcHJvdmU6IHsgdHlwZTogJ3N0cmluZycsIHRpdGxlOiAnQXV0byBBcHByb3ZlJywgc2Vzc2lvbk11dGFibGU6IHRydWUsIGVudW06IFsnZGVmYXVsdCcsICdhdXRvQXBwcm92ZSddIH0sXG5cdFx0XHRcdFx0bW9kZTogeyB0eXBlOiAnc3RyaW5nJywgdGl0bGU6ICdNb2RlJywgc2Vzc2lvbk11dGFibGU6IHRydWUsIGVudW06IFsnYScsICdiJ10gfSxcblx0XHRcdFx0XHRpc29sYXRpb246IHsgdHlwZTogJ3N0cmluZycsIHRpdGxlOiAnSXNvbGF0aW9uJywgZW51bTogWyd3b3JrdHJlZSddIH0sIC8vIG5vbi1tdXRhYmxlXG5cdFx0XHRcdFx0YnJhbmNoOiB7IHR5cGU6ICdzdHJpbmcnLCB0aXRsZTogJ0JyYW5jaCcsIHNlc3Npb25NdXRhYmxlOiB0cnVlLCByZWFkT25seTogdHJ1ZSwgZW51bTogWydtYWluJ10gfSwgLy8gcmVhZE9ubHlcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0XHR2YWx1ZXM6IHsgYXV0b0FwcHJvdmU6ICdkZWZhdWx0JywgbW9kZTogJ2EnLCBpc29sYXRpb246ICd3b3JrdHJlZScsIGJyYW5jaDogJ21haW4nIH0sXG5cdFx0fSk7XG5cblx0XHQvLyBVc2VyIGVkaXRzOiBvbmx5IGVkaXRhYmxlIGtleXMgYXJlIGV4cG9zZWQgYW5kIHJvdW5kLXRyaXBwZWQgdGhyb3VnaFxuXHRcdC8vIHRoZSBGUyBwcm92aWRlci4gTm9uLWVkaXRhYmxlIHByZXNlcnZhdGlvbiBpcyB0aGUgcHJvdmlkZXIncyBqb2IuXG5cdFx0Y29uc3QgbmV3Q29udGVudCA9IFZTQnVmZmVyLmZyb21TdHJpbmcoJy8vIHRyYWlsaW5nIGNvbW1lbnRzIG9rXFxueyBcImF1dG9BcHByb3ZlXCI6IFwiYXV0b0FwcHJvdmVcIiwgXCJtb2RlXCI6IFwiYlwiLCB9XFxuJykuYnVmZmVyO1xuXHRcdGF3YWl0IGZzLndyaXRlRmlsZSh1cmksIG5ld0NvbnRlbnQsIHsgY3JlYXRlOiBmYWxzZSwgb3ZlcndyaXRlOiB0cnVlLCB1bmxvY2s6IGZhbHNlLCBhdG9taWM6IGZhbHNlIH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZXNzaW9uUHJvdmlkZXIucmVwbGFjZUNhbGxzLCBbe1xuXHRcdFx0c2Vzc2lvbklkOiBzZXNzaW9uLnNlc3Npb25JZCxcblx0XHRcdHZhbHVlczogeyBhdXRvQXBwcm92ZTogJ2F1dG9BcHByb3ZlJywgbW9kZTogJ2InIH0sXG5cdFx0fV0pO1xuXHR9KTtcblxuXHR0ZXN0KCd3cml0ZUZpbGUgZm9yd2FyZHMgYSBwYXJ0aWFsIGVkaXQgc2V0LCBzdXBwb3J0aW5nIHVuc2V0IHZpYSBvbWlzc2lvbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IGZzLCB1cmksIHNlc3Npb24sIHNlc3Npb25Qcm92aWRlciB9ID0gY3JlYXRlSGFybmVzcyh7XG5cdFx0XHRzY2hlbWE6IHtcblx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRhdXRvQXBwcm92ZTogeyB0eXBlOiAnc3RyaW5nJywgdGl0bGU6ICdBdXRvIEFwcHJvdmUnLCBzZXNzaW9uTXV0YWJsZTogdHJ1ZSwgZW51bTogWydkZWZhdWx0JywgJ2F1dG9BcHByb3ZlJ10gfSxcblx0XHRcdFx0XHRtb2RlOiB7IHR5cGU6ICdzdHJpbmcnLCB0aXRsZTogJ01vZGUnLCBzZXNzaW9uTXV0YWJsZTogdHJ1ZSwgZW51bTogWydhJywgJ2InXSB9LFxuXHRcdFx0XHRcdGlzb2xhdGlvbjogeyB0eXBlOiAnc3RyaW5nJywgdGl0bGU6ICdJc29sYXRpb24nLCBlbnVtOiBbJ3dvcmt0cmVlJ10gfSxcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0XHR2YWx1ZXM6IHsgYXV0b0FwcHJvdmU6ICdhdXRvQXBwcm92ZScsIG1vZGU6ICdhJywgaXNvbGF0aW9uOiAnd29ya3RyZWUnIH0sXG5cdFx0fSk7XG5cblx0XHRjb25zdCBuZXdDb250ZW50ID0gVlNCdWZmZXIuZnJvbVN0cmluZygneyBcImF1dG9BcHByb3ZlXCI6IFwiZGVmYXVsdFwiIH1cXG4nKS5idWZmZXI7XG5cdFx0YXdhaXQgZnMud3JpdGVGaWxlKHVyaSwgbmV3Q29udGVudCwgeyBjcmVhdGU6IGZhbHNlLCBvdmVyd3JpdGU6IHRydWUsIHVubG9jazogZmFsc2UsIGF0b21pYzogZmFsc2UgfSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlc3Npb25Qcm92aWRlci5yZXBsYWNlQ2FsbHMsIFt7XG5cdFx0XHRzZXNzaW9uSWQ6IHNlc3Npb24uc2Vzc2lvbklkLFxuXHRcdFx0dmFsdWVzOiB7IGF1dG9BcHByb3ZlOiAnZGVmYXVsdCcgfSxcblx0XHR9XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ29uRGlkQ2hhbmdlRmlsZSBmaXJlcyB3aGVuIHByb3ZpZGVyIGNvbmZpZyBjaGFuZ2VzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgZnMsIHVyaSwgc2Vzc2lvbiwgc2Vzc2lvblByb3ZpZGVyIH0gPSBjcmVhdGVIYXJuZXNzKHtcblx0XHRcdHNjaGVtYTogeyB0eXBlOiAnb2JqZWN0JywgcHJvcGVydGllczoge30gfSxcblx0XHRcdHZhbHVlczoge30sXG5cdFx0fSk7XG5cblx0XHRjb25zdCBldmVudHM6IFVSSVtdID0gW107XG5cdFx0Y29uc3QgbGlzdGVuZXJzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdHN0b3JlLmFkZChsaXN0ZW5lcnMpO1xuXHRcdGxpc3RlbmVycy5hZGQoZnMub25EaWRDaGFuZ2VGaWxlKGNoYW5nZXMgPT4ge1xuXHRcdFx0Zm9yIChjb25zdCBjIG9mIGNoYW5nZXMpIHtcblx0XHRcdFx0ZXZlbnRzLnB1c2goYy5yZXNvdXJjZSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdGNvbnN0IHdhdGNoID0gZnMud2F0Y2godXJpLCB7IHJlY3Vyc2l2ZTogZmFsc2UsIGV4Y2x1ZGVzOiBbXSB9KTtcblx0XHRsaXN0ZW5lcnMuYWRkKHdhdGNoKTtcblxuXHRcdHNlc3Npb25Qcm92aWRlci5vbkRpZENoYW5nZVNlc3Npb25Db25maWdFbWl0dGVyLmZpcmUoc2Vzc2lvbi5zZXNzaW9uSWQpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50cy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudHNbMF0udG9TdHJpbmcoKSwgdXJpLnRvU3RyaW5nKCkpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWFkRmlsZSBvbiB1bmtub3duIHByb3ZpZGVyIHRocm93cyBGaWxlTm90Rm91bmQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBmcywgdXJpIH0gPSBjcmVhdGVIYXJuZXNzKHVuZGVmaW5lZCwgLypyZWdpc3RlclByb3ZpZGVyKi8gZmFsc2UpO1xuXG5cdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoYXN5bmMgKCkgPT4ge1xuXHRcdFx0YXdhaXQgZnMucmVhZEZpbGUodXJpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ3NjaGVtYSByZWdpc3RyYXRpb24nLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2NoZW1hUmVnaXN0cnkgPSBSZWdpc3RyeS5hczxJSlNPTkNvbnRyaWJ1dGlvblJlZ2lzdHJ5PihKU09ORXh0ZW5zaW9ucy5KU09OQ29udHJpYnV0aW9uKTtcblxuXHRcdGZ1bmN0aW9uIGV4cGVjdGVkU2NoZW1hSWQoc2Vzc2lvbjogSVNlc3Npb24pOiBzdHJpbmcge1xuXHRcdFx0cmV0dXJuIGB2c2NvZGU6Ly9zY2hlbWFzL2FnZW50LXNlc3Npb24tc2V0dGluZ3MvJHtzZXNzaW9uLnByb3ZpZGVySWR9LyR7c2Vzc2lvbi5yZXNvdXJjZS5zY2hlbWV9LyR7c2Vzc2lvbi5yZXNvdXJjZS5wYXRofS5qc29uY2A7XG5cdFx0fVxuXG5cdFx0dGVzdCgncmVhZEZpbGUgbGF6aWx5IHJlZ2lzdGVycyBhIHNjaGVtYSArIGFzc29jaWF0aW9uIGZvciB0aGUgc2Vzc2lvbicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHsgZnMsIHVyaSwgc2Vzc2lvbiB9ID0gY3JlYXRlSGFybmVzcyh7XG5cdFx0XHRcdHNjaGVtYToge1xuXHRcdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdGF1dG9BcHByb3ZlOiB7IHR5cGU6ICdzdHJpbmcnLCB0aXRsZTogJ0F1dG8gQXBwcm92ZScsIHNlc3Npb25NdXRhYmxlOiB0cnVlLCBlbnVtOiBbJ2RlZmF1bHQnLCAnYXV0b0FwcHJvdmUnXSB9LFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHZhbHVlczogeyBhdXRvQXBwcm92ZTogJ2RlZmF1bHQnIH0sXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IHNjaGVtYUlkID0gZXhwZWN0ZWRTY2hlbWFJZChzZXNzaW9uKTtcblxuXHRcdFx0Ly8gTm8gcmVnaXN0cmF0aW9uIGJlZm9yZSB0aGUgZmlsZSBpcyByZWFkLlxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNjaGVtYVJlZ2lzdHJ5Lmhhc1NjaGVtYUNvbnRlbnQoc2NoZW1hSWQpLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2NoZW1hUmVnaXN0cnkuZ2V0U2NoZW1hQXNzb2NpYXRpb25zKClbc2NoZW1hSWRdLCB1bmRlZmluZWQpO1xuXG5cdFx0XHRhd2FpdCBmcy5yZWFkRmlsZSh1cmkpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2NoZW1hUmVnaXN0cnkuaGFzU2NoZW1hQ29udGVudChzY2hlbWFJZCksIHRydWUpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzY2hlbWFSZWdpc3RyeS5nZXRTY2hlbWFBc3NvY2lhdGlvbnMoKVtzY2hlbWFJZF0sIFt1cmkudG9TdHJpbmcoKV0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2NoZW1hIGlzIHJlZnJlc2hlZCB3aGVuIG9uRGlkQ2hhbmdlU2Vzc2lvbkNvbmZpZyBmaXJlcyB3aXRoIGEgbmV3IHNjaGVtYSBpZGVudGl0eScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHsgZnMsIHVyaSwgc2Vzc2lvbiwgc2Vzc2lvblByb3ZpZGVyIH0gPSBjcmVhdGVIYXJuZXNzKHtcblx0XHRcdFx0c2NoZW1hOiB7XG5cdFx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0YXV0b0FwcHJvdmU6IHsgdHlwZTogJ3N0cmluZycsIHRpdGxlOiAnQXV0byBBcHByb3ZlJywgc2Vzc2lvbk11dGFibGU6IHRydWUsIGVudW06IFsnZGVmYXVsdCddIH0sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSxcblx0XHRcdFx0dmFsdWVzOiB7IGF1dG9BcHByb3ZlOiAnZGVmYXVsdCcgfSxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3Qgc2NoZW1hSWQgPSBleHBlY3RlZFNjaGVtYUlkKHNlc3Npb24pO1xuXG5cdFx0XHQvLyBUcmlnZ2VyIGluaXRpYWwgcmVnaXN0cmF0aW9uLlxuXHRcdFx0YXdhaXQgZnMucmVhZEZpbGUodXJpKTtcblx0XHRcdGNvbnN0IGluaXRpYWwgPSBzY2hlbWFSZWdpc3RyeS5nZXRTY2hlbWFDb250cmlidXRpb25zKCkuc2NoZW1hc1tzY2hlbWFJZF07XG5cdFx0XHRhc3NlcnQub2soaW5pdGlhbCk7XG5cblx0XHRcdC8vIFN3YXAgaW4gYSBuZXcgc2NoZW1hIChpZGVudGl0eSBjaGFuZ2UpIGFuZCBub3RpZnkuXG5cdFx0XHRzZXNzaW9uUHJvdmlkZXIuY29uZmlnID0ge1xuXHRcdFx0XHRzY2hlbWE6IHtcblx0XHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRhdXRvQXBwcm92ZTogeyB0eXBlOiAnc3RyaW5nJywgdGl0bGU6ICdBdXRvIEFwcHJvdmUnLCBzZXNzaW9uTXV0YWJsZTogdHJ1ZSwgZW51bTogWydkZWZhdWx0JywgJ2F1dG9BcHByb3ZlJ10gfSxcblx0XHRcdFx0XHRcdG1vZGU6IHsgdHlwZTogJ3N0cmluZycsIHRpdGxlOiAnTW9kZScsIHNlc3Npb25NdXRhYmxlOiB0cnVlLCBlbnVtOiBbJ2EnLCAnYiddIH0sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSxcblx0XHRcdFx0dmFsdWVzOiB7IGF1dG9BcHByb3ZlOiAnZGVmYXVsdCcsIG1vZGU6ICdhJyB9LFxuXHRcdFx0fTtcblx0XHRcdHNlc3Npb25Qcm92aWRlci5vbkRpZENoYW5nZVNlc3Npb25Db25maWdFbWl0dGVyLmZpcmUoc2Vzc2lvbi5zZXNzaW9uSWQpO1xuXG5cdFx0XHRjb25zdCByZWZyZXNoZWQgPSBzY2hlbWFSZWdpc3RyeS5nZXRTY2hlbWFDb250cmlidXRpb25zKCkuc2NoZW1hc1tzY2hlbWFJZF07XG5cdFx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwocmVmcmVzaGVkLCBpbml0aWFsKTtcblx0XHRcdGFzc2VydC5vayhyZWZyZXNoZWQucHJvcGVydGllcz8uWydtb2RlJ10sICdyZWZyZXNoZWQgc2NoZW1hIHNob3VsZCBpbmNsdWRlIHRoZSBuZXdseSBhZGRlZCBwcm9wZXJ0eScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2NoZW1hIGlzIGRpc3Bvc2VkIHdoZW4gdGhlIHNlc3Npb24gaXMgcmVtb3ZlZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHsgZnMsIHVyaSwgc2Vzc2lvbiwgc2Vzc2lvblByb3ZpZGVyIH0gPSBjcmVhdGVIYXJuZXNzKHtcblx0XHRcdFx0c2NoZW1hOiB7XG5cdFx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0YXV0b0FwcHJvdmU6IHsgdHlwZTogJ3N0cmluZycsIHRpdGxlOiAnQXV0byBBcHByb3ZlJywgc2Vzc2lvbk11dGFibGU6IHRydWUsIGVudW06IFsnZGVmYXVsdCddIH0sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSxcblx0XHRcdFx0dmFsdWVzOiB7IGF1dG9BcHByb3ZlOiAnZGVmYXVsdCcgfSxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3Qgc2NoZW1hSWQgPSBleHBlY3RlZFNjaGVtYUlkKHNlc3Npb24pO1xuXG5cdFx0XHRhd2FpdCBmcy5yZWFkRmlsZSh1cmkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNjaGVtYVJlZ2lzdHJ5Lmhhc1NjaGVtYUNvbnRlbnQoc2NoZW1hSWQpLCB0cnVlKTtcblxuXHRcdFx0c2Vzc2lvblByb3ZpZGVyLm9uRGlkQ2hhbmdlU2Vzc2lvbnNFbWl0dGVyLmZpcmUoeyBhZGRlZDogW10sIHJlbW92ZWQ6IFtzZXNzaW9uXSwgY2hhbmdlZDogW10gfSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzY2hlbWFSZWdpc3RyeS5oYXNTY2hlbWFDb250ZW50KHNjaGVtYUlkKSwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNjaGVtYVJlZ2lzdHJ5LmdldFNjaGVtYUFzc29jaWF0aW9ucygpW3NjaGVtYUlkXSwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGVBQWU7QUFDeEIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsK0NBQStDO0FBRXhELFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsZ0JBQWdCLG1CQUFtQjtBQUM1QyxTQUFTLGNBQWMsc0JBQWlEO0FBQ3hFLFNBQVMsZ0JBQWdCO0FBRXpCLFNBQVMsaUNBQWlDO0FBRzFDLFNBQVMseUJBQXlCLHdDQUF3QywyQ0FBMkM7QUFFckgsTUFBTSxjQUFjO0FBQ3BCLE1BQU0sa0JBQWtCO0FBQ3hCLE1BQU0sU0FBUztBQUVmLE1BQU0sMENBQTBDLE1BQU07QUFFckQsUUFBTSxRQUFRLHdDQUF3QztBQUV0RCxXQUFTLGdCQUEwQjtBQUNsQyxVQUFNLFdBQVcsSUFBSSxLQUFLLEVBQUUsUUFBUSxpQkFBaUIsTUFB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
