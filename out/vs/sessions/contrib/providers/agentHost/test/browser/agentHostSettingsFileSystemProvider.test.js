import assert from "assert";
import { VSBuffer } from "../../../../../../base/common/buffer.js";
import { Emitter } from "../../../../../../base/common/event.js";
import { DisposableStore } from "../../../../../../base/common/lifecycle.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { TestInstantiationService } from "../../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { ServiceCollection } from "../../../../../../platform/instantiation/common/serviceCollection.js";
import { NullLogService, ILogService } from "../../../../../../platform/log/common/log.js";
import { Extensions as JSONExtensions } from "../../../../../../platform/jsonschemas/common/jsonContributionRegistry.js";
import { Registry } from "../../../../../../platform/registry/common/platform.js";
import { ISessionsProvidersService } from "../../../../../services/sessions/browser/sessionsProvidersService.js";
import { agentHostSettingsUri, AgentHostSettingsFileSystemProvider, AgentHostSettingsSchemaRegistrar } from "../../browser/agentHostSettingsFileSystemProvider.js";
const PROVIDER_ID = "local-agent-host";
suite("AgentHostSettingsFileSystemProvider", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  function createHarness(initialConfig, registerProvider = true) {
    const onDidChangeRootConfigEmitter = store.add(new Emitter());
    const replaceCalls = [];
    const provider = {
      id: PROVIDER_ID,
      config: initialConfig,
      onDidChangeRootConfigEmitter,
      replaceCalls,
      onDidChangeRootConfig: onDidChangeRootConfigEmitter.event,
      getRootConfig: () => provider.config,
      replaceRootConfig: async (values) => {
        replaceCalls.push({ values });
        if (provider.config) {
          provider.config = {
            ...provider.config,
            values: { ...values }
          };
        }
      }
    };
    const onDidChangeProvidersEmitter = store.add(new Emitter());
    const providersService = {
      getProvider(providerId) {
        if (registerProvider && providerId === PROVIDER_ID) {
          return provider;
        }
        return void 0;
      },
      getProviders: () => registerProvider ? [provider] : [],
      onDidChangeProviders: onDidChangeProvidersEmitter.event
    };
    const instantiationService = store.add(new TestInstantiationService(new ServiceCollection(
      [ISessionsProvidersService, providersService],
      [ILogService, new NullLogService()]
    )));
    const schemaRegistrar = store.add(instantiationService.createInstance(AgentHostSettingsSchemaRegistrar));
    const fs = store.add(instantiationService.createInstance(AgentHostSettingsFileSystemProvider, schemaRegistrar));
    return { fs, uri: agentHostSettingsUri(PROVIDER_ID), provider };
  }
  test("readFile returns root config values as JSON", async () => {
    const { fs, uri } = createHarness({
      schema: {
        type: "object",
        properties: {
          autoApprove: { type: "string", title: "Auto Approve", enum: ["default", "autoApprove"] }
        }
      },
      values: { autoApprove: "default" }
    });
    const buf = await fs.readFile(uri);
    const text = VSBuffer.wrap(buf).toString();
    const jsonStart = text.indexOf("{");
    const parsed = JSON.parse(text.substring(jsonStart));
    assert.deepStrictEqual(parsed, { autoApprove: "default" });
  });
  test("writeFile forwards the user's parsed JSON as the replace payload", async () => {
    const { fs, uri, provider } = createHarness({
      schema: {
        type: "object",
        properties: {
          autoApprove: { type: "string", title: "Auto Approve", enum: ["default", "autoApprove"] },
          mode: { type: "string", title: "Mode", enum: ["a", "b"] }
        }
      },
      values: { autoApprove: "default", mode: "a" }
    });
    const newContent = VSBuffer.fromString('// trailing comments ok\n{ "autoApprove": "autoApprove", "mode": "b", }\n').buffer;
    await fs.writeFile(uri, newContent, { create: false, overwrite: true, unlock: false, atomic: false });
    assert.deepStrictEqual(provider.replaceCalls, [{
      values: { autoApprove: "autoApprove", mode: "b" }
    }]);
  });
  test("writeFile with unknown provider is a no-op (write ignored, change event still fires)", async () => {
    const { fs, uri } = createHarness(
      void 0,
      /*registerProvider*/
      true
    );
    const events = [];
    store.add(fs.onDidChangeFile((changes) => {
      for (const c of changes) {
        events.push(c.resource);
      }
    }));
    const newContent = VSBuffer.fromString('{ "autoApprove": "default" }\n').buffer;
    await fs.writeFile(uri, newContent, { create: false, overwrite: true, unlock: false, atomic: false });
    assert.strictEqual(events.length, 1);
  });
  test("onDidChangeFile fires when provider root config changes", async () => {
    const { fs, uri, provider } = createHarness({
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
    provider.onDidChangeRootConfigEmitter.fire();
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
    function expectedSchemaId() {
      return `vscode://schemas/agent-host-settings/${PROVIDER_ID}.jsonc`;
    }
    test("readFile lazily registers a schema + association for the provider", async () => {
      const { fs, uri } = createHarness({
        schema: {
          type: "object",
          properties: {
            autoApprove: { type: "string", title: "Auto Approve", enum: ["default", "autoApprove"] }
          }
        },
        values: { autoApprove: "default" }
      });
      const schemaId = expectedSchemaId();
      assert.strictEqual(schemaRegistry.hasSchemaContent(schemaId), false);
      assert.strictEqual(schemaRegistry.getSchemaAssociations()[schemaId], void 0);
      await fs.readFile(uri);
      assert.strictEqual(schemaRegistry.hasSchemaContent(schemaId), true);
      assert.deepStrictEqual(schemaRegistry.getSchemaAssociations()[schemaId], [uri.toString()]);
    });
    test("schema is refreshed when onDidChangeRootConfig fires with a new schema identity", async () => {
      const { fs, uri, provider } = createHarness({
        schema: {
          type: "object",
          properties: {
            autoApprove: { type: "string", title: "Auto Approve", enum: ["default"] }
          }
        },
        values: { autoApprove: "default" }
      });
      const schemaId = expectedSchemaId();
      await fs.readFile(uri);
      const initial = schemaRegistry.getSchemaContributions().schemas[schemaId];
      assert.ok(initial);
      provider.config = {
        schema: {
          type: "object",
          properties: {
            autoApprove: { type: "string", title: "Auto Approve", enum: ["default", "autoApprove"] },
            mode: { type: "string", title: "Mode", enum: ["a", "b"] }
          }
        },
        values: { autoApprove: "default", mode: "a" }
      };
      provider.onDidChangeRootConfigEmitter.fire();
      const refreshed = schemaRegistry.getSchemaContributions().schemas[schemaId];
      assert.notStrictEqual(refreshed, initial);
      assert.ok(refreshed.properties?.["mode"], "refreshed schema should include the newly added property");
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxccHJvdmlkZXJzXFxhZ2VudEhvc3RcXHRlc3RcXGJyb3dzZXJcXGFnZW50SG9zdFNldHRpbmdzRmlsZVN5c3RlbVByb3ZpZGVyLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB0eXBlIHsgUm9vdENvbmZpZ1N0YXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9zdGF0ZS5qcyc7XG5pbXBvcnQgeyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL3Rlc3QvY29tbW9uL2luc3RhbnRpYXRpb25TZXJ2aWNlTW9jay5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlQ29sbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL3NlcnZpY2VDb2xsZWN0aW9uLmpzJztcbmltcG9ydCB7IE51bGxMb2dTZXJ2aWNlLCBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbnMgYXMgSlNPTkV4dGVuc2lvbnMsIElKU09OQ29udHJpYnV0aW9uUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9qc29uc2NoZW1hcy9jb21tb24vanNvbkNvbnRyaWJ1dGlvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB0eXBlIHsgSUFnZW50SG9zdFNlc3Npb25zUHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9jb21tb24vYWdlbnRIb3N0U2Vzc2lvbnNQcm92aWRlci5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvYnJvd3Nlci9zZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UuanMnO1xuaW1wb3J0IHR5cGUgeyBJU2Vzc2lvbnNQcm92aWRlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2NvbW1vbi9zZXNzaW9uc1Byb3ZpZGVyLmpzJztcbmltcG9ydCB7IGFnZW50SG9zdFNldHRpbmdzVXJpLCBBZ2VudEhvc3RTZXR0aW5nc0ZpbGVTeXN0ZW1Qcm92aWRlciwgQWdlbnRIb3N0U2V0dGluZ3NTY2hlbWFSZWdpc3RyYXIgfSBmcm9tICcuLi8uLi9icm93c2VyL2FnZW50SG9zdFNldHRpbmdzRmlsZVN5c3RlbVByb3ZpZGVyLmpzJztcblxuY29uc3QgUFJPVklERVJfSUQgPSAnbG9jYWwtYWdlbnQtaG9zdCc7XG5cbnN1aXRlKCdBZ2VudEhvc3RTZXR0aW5nc0ZpbGVTeXN0ZW1Qcm92aWRlcicsICgpID0+IHtcblxuXHRjb25zdCBzdG9yZSA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGludGVyZmFjZSBJVGVzdEhhcm5lc3Mge1xuXHRcdHJlYWRvbmx5IGZzOiBBZ2VudEhvc3RTZXR0aW5nc0ZpbGVTeXN0ZW1Qcm92aWRlcjtcblx0XHRyZWFkb25seSB1cmk6IFVSSTtcblx0XHRyZWFkb25seSBwcm92aWRlcjogSU1vY2tBZ2VudEhvc3RTZXNzaW9uc1Byb3ZpZGVyO1xuXHR9XG5cblx0aW50ZXJmYWNlIElNb2NrQWdlbnRIb3N0U2Vzc2lvbnNQcm92aWRlciBleHRlbmRzIElBZ2VudEhvc3RTZXNzaW9uc1Byb3ZpZGVyIHtcblx0XHRjb25maWc6IFJvb3RDb25maWdTdGF0ZSB8IHVuZGVmaW5lZDtcblx0XHRyZWFkb25seSBvbkRpZENoYW5nZVJvb3RDb25maWdFbWl0dGVyOiBFbWl0dGVyPHZvaWQ+O1xuXHRcdHJlYWRvbmx5IHJlcGxhY2VDYWxsczogQXJyYXk8eyB2YWx1ZXM6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IH0+O1xuXHR9XG5cblx0ZnVuY3Rpb24gY3JlYXRlSGFybmVzcyhcblx0XHRpbml0aWFsQ29uZmlnOiBSb290Q29uZmlnU3RhdGUgfCB1bmRlZmluZWQsXG5cdFx0cmVnaXN0ZXJQcm92aWRlciA9IHRydWUsXG5cdCk6IElUZXN0SGFybmVzcyB7XG5cdFx0Y29uc3Qgb25EaWRDaGFuZ2VSb290Q29uZmlnRW1pdHRlciA9IHN0b3JlLmFkZChuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0XHRjb25zdCByZXBsYWNlQ2FsbHM6IEFycmF5PHsgdmFsdWVzOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB9PiA9IFtdO1xuXG5cdFx0Y29uc3QgcHJvdmlkZXI6IElNb2NrQWdlbnRIb3N0U2Vzc2lvbnNQcm92aWRlciA9IHtcblx0XHRcdGlkOiBQUk9WSURFUl9JRCxcblx0XHRcdGNvbmZpZzogaW5pdGlhbENvbmZpZyxcblx0XHRcdG9uRGlkQ2hhbmdlUm9vdENvbmZpZ0VtaXR0ZXIsXG5cdFx0XHRyZXBsYWNlQ2FsbHMsXG5cdFx0XHRvbkRpZENoYW5nZVJvb3RDb25maWc6IG9uRGlkQ2hhbmdlUm9vdENvbmZpZ0VtaXR0ZXIuZXZlbnQsXG5cdFx0XHRnZXRSb290Q29uZmlnOiAoKSA9PiBwcm92aWRlci5jb25maWcsXG5cdFx0XHRyZXBsYWNlUm9vdENvbmZpZzogYXN5bmMgKHZhbHVlczogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pID0+IHtcblx0XHRcdFx0cmVwbGFjZUNhbGxzLnB1c2goeyB2YWx1ZXMgfSk7XG5cdFx0XHRcdGlmIChwcm92aWRlci5jb25maWcpIHtcblx0XHRcdFx0XHRwcm92aWRlci5jb25maWcgPSB7XG5cdFx0XHRcdFx0XHQuLi5wcm92aWRlci5jb25maWcsXG5cdFx0XHRcdFx0XHR2YWx1ZXM6IHsgLi4udmFsdWVzIH0sXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHR9IGFzIHVua25vd24gYXMgSU1vY2tBZ2VudEhvc3RTZXNzaW9uc1Byb3ZpZGVyO1xuXG5cdFx0Y29uc3Qgb25EaWRDaGFuZ2VQcm92aWRlcnNFbWl0dGVyID0gc3RvcmUuYWRkKG5ldyBFbWl0dGVyPHsgYWRkZWQ6IHJlYWRvbmx5IElTZXNzaW9uc1Byb3ZpZGVyW107IHJlbW92ZWQ6IHJlYWRvbmx5IElTZXNzaW9uc1Byb3ZpZGVyW10gfT4oKSk7XG5cdFx0Y29uc3QgcHJvdmlkZXJzU2VydmljZTogSVNlc3Npb25zUHJvdmlkZXJzU2VydmljZSA9IHtcblx0XHRcdGdldFByb3ZpZGVyPFQgZXh0ZW5kcyBJU2Vzc2lvbnNQcm92aWRlcj4ocHJvdmlkZXJJZDogc3RyaW5nKTogVCB8IHVuZGVmaW5lZCB7XG5cdFx0XHRcdGlmIChyZWdpc3RlclByb3ZpZGVyICYmIHByb3ZpZGVySWQgPT09IFBST1ZJREVSX0lEKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHByb3ZpZGVyIGFzIHVua25vd24gYXMgVDtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fSxcblx0XHRcdGdldFByb3ZpZGVyczogKCkgPT4gcmVnaXN0ZXJQcm92aWRlciA/IFtwcm92aWRlciBhcyB1bmtub3duIGFzIElTZXNzaW9uc1Byb3ZpZGVyXSA6IFtdLFxuXHRcdFx0b25EaWRDaGFuZ2VQcm92aWRlcnM6IG9uRGlkQ2hhbmdlUHJvdmlkZXJzRW1pdHRlci5ldmVudCxcblx0XHR9IGFzIHVua25vd24gYXMgSVNlc3Npb25zUHJvdmlkZXJzU2VydmljZTtcblxuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gc3RvcmUuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UobmV3IFNlcnZpY2VDb2xsZWN0aW9uKFxuXHRcdFx0W0lTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UsIHByb3ZpZGVyc1NlcnZpY2VdLFxuXHRcdFx0W0lMb2dTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKV0sXG5cdFx0KSkpO1xuXG5cdFx0Y29uc3Qgc2NoZW1hUmVnaXN0cmFyID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50SG9zdFNldHRpbmdzU2NoZW1hUmVnaXN0cmFyKSk7XG5cdFx0Y29uc3QgZnMgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRIb3N0U2V0dGluZ3NGaWxlU3lzdGVtUHJvdmlkZXIsIHNjaGVtYVJlZ2lzdHJhcikpO1xuXG5cdFx0cmV0dXJuIHsgZnMsIHVyaTogYWdlbnRIb3N0U2V0dGluZ3NVcmkoUFJPVklERVJfSUQpLCBwcm92aWRlciB9O1xuXHR9XG5cblx0dGVzdCgncmVhZEZpbGUgcmV0dXJucyByb290IGNvbmZpZyB2YWx1ZXMgYXMgSlNPTicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IGZzLCB1cmkgfSA9IGNyZWF0ZUhhcm5lc3Moe1xuXHRcdFx0c2NoZW1hOiB7XG5cdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0YXV0b0FwcHJvdmU6IHsgdHlwZTogJ3N0cmluZycsIHRpdGxlOiAnQXV0byBBcHByb3ZlJywgZW51bTogWydkZWZhdWx0JywgJ2F1dG9BcHByb3ZlJ10gfSxcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0XHR2YWx1ZXM6IHsgYXV0b0FwcHJvdmU6ICdkZWZhdWx0JyB9LFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgYnVmID0gYXdhaXQgZnMucmVhZEZpbGUodXJpKTtcblx0XHRjb25zdCB0ZXh0ID0gVlNCdWZmZXIud3JhcChidWYpLnRvU3RyaW5nKCk7XG5cdFx0Y29uc3QganNvblN0YXJ0ID0gdGV4dC5pbmRleE9mKCd7Jyk7XG5cdFx0Y29uc3QgcGFyc2VkID0gSlNPTi5wYXJzZSh0ZXh0LnN1YnN0cmluZyhqc29uU3RhcnQpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnNlZCwgeyBhdXRvQXBwcm92ZTogJ2RlZmF1bHQnIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCd3cml0ZUZpbGUgZm9yd2FyZHMgdGhlIHVzZXJcXCdzIHBhcnNlZCBKU09OIGFzIHRoZSByZXBsYWNlIHBheWxvYWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBmcywgdXJpLCBwcm92aWRlciB9ID0gY3JlYXRlSGFybmVzcyh7XG5cdFx0XHRzY2hlbWE6IHtcblx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRhdXRvQXBwcm92ZTogeyB0eXBlOiAnc3RyaW5nJywgdGl0bGU6ICdBdXRvIEFwcHJvdmUnLCBlbnVtOiBbJ2RlZmF1bHQnLCAnYXV0b0FwcHJvdmUnXSB9LFxuXHRcdFx0XHRcdG1vZGU6IHsgdHlwZTogJ3N0cmluZycsIHRpdGxlOiAnTW9kZScsIGVudW06IFsnYScsICdiJ10gfSxcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0XHR2YWx1ZXM6IHsgYXV0b0FwcHJvdmU6ICdkZWZhdWx0JywgbW9kZTogJ2EnIH0sXG5cdFx0fSk7XG5cblx0XHRjb25zdCBuZXdDb250ZW50ID0gVlNCdWZmZXIuZnJvbVN0cmluZygnLy8gdHJhaWxpbmcgY29tbWVudHMgb2tcXG57IFwiYXV0b0FwcHJvdmVcIjogXCJhdXRvQXBwcm92ZVwiLCBcIm1vZGVcIjogXCJiXCIsIH1cXG4nKS5idWZmZXI7XG5cdFx0YXdhaXQgZnMud3JpdGVGaWxlKHVyaSwgbmV3Q29udGVudCwgeyBjcmVhdGU6IGZhbHNlLCBvdmVyd3JpdGU6IHRydWUsIHVubG9jazogZmFsc2UsIGF0b21pYzogZmFsc2UgfSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHByb3ZpZGVyLnJlcGxhY2VDYWxscywgW3tcblx0XHRcdHZhbHVlczogeyBhdXRvQXBwcm92ZTogJ2F1dG9BcHByb3ZlJywgbW9kZTogJ2InIH0sXG5cdFx0fV0pO1xuXHR9KTtcblxuXHR0ZXN0KCd3cml0ZUZpbGUgd2l0aCB1bmtub3duIHByb3ZpZGVyIGlzIGEgbm8tb3AgKHdyaXRlIGlnbm9yZWQsIGNoYW5nZSBldmVudCBzdGlsbCBmaXJlcyknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBmcywgdXJpIH0gPSBjcmVhdGVIYXJuZXNzKHVuZGVmaW5lZCwgLypyZWdpc3RlclByb3ZpZGVyKi8gdHJ1ZSk7XG5cblx0XHRjb25zdCBldmVudHM6IFVSSVtdID0gW107XG5cdFx0c3RvcmUuYWRkKGZzLm9uRGlkQ2hhbmdlRmlsZShjaGFuZ2VzID0+IHtcblx0XHRcdGZvciAoY29uc3QgYyBvZiBjaGFuZ2VzKSB7XG5cdFx0XHRcdGV2ZW50cy5wdXNoKGMucmVzb3VyY2UpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IG5ld0NvbnRlbnQgPSBWU0J1ZmZlci5mcm9tU3RyaW5nKCd7IFwiYXV0b0FwcHJvdmVcIjogXCJkZWZhdWx0XCIgfVxcbicpLmJ1ZmZlcjtcblx0XHRhd2FpdCBmcy53cml0ZUZpbGUodXJpLCBuZXdDb250ZW50LCB7IGNyZWF0ZTogZmFsc2UsIG92ZXJ3cml0ZTogdHJ1ZSwgdW5sb2NrOiBmYWxzZSwgYXRvbWljOiBmYWxzZSB9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudHMubGVuZ3RoLCAxKTtcblx0fSk7XG5cblx0dGVzdCgnb25EaWRDaGFuZ2VGaWxlIGZpcmVzIHdoZW4gcHJvdmlkZXIgcm9vdCBjb25maWcgY2hhbmdlcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IGZzLCB1cmksIHByb3ZpZGVyIH0gPSBjcmVhdGVIYXJuZXNzKHtcblx0XHRcdHNjaGVtYTogeyB0eXBlOiAnb2JqZWN0JywgcHJvcGVydGllczoge30gfSxcblx0XHRcdHZhbHVlczoge30sXG5cdFx0fSk7XG5cblx0XHRjb25zdCBldmVudHM6IFVSSVtdID0gW107XG5cdFx0Y29uc3QgbGlzdGVuZXJzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdHN0b3JlLmFkZChsaXN0ZW5lcnMpO1xuXHRcdGxpc3RlbmVycy5hZGQoZnMub25EaWRDaGFuZ2VGaWxlKGNoYW5nZXMgPT4ge1xuXHRcdFx0Zm9yIChjb25zdCBjIG9mIGNoYW5nZXMpIHtcblx0XHRcdFx0ZXZlbnRzLnB1c2goYy5yZXNvdXJjZSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdGNvbnN0IHdhdGNoID0gZnMud2F0Y2godXJpLCB7IHJlY3Vyc2l2ZTogZmFsc2UsIGV4Y2x1ZGVzOiBbXSB9KTtcblx0XHRsaXN0ZW5lcnMuYWRkKHdhdGNoKTtcblxuXHRcdHByb3ZpZGVyLm9uRGlkQ2hhbmdlUm9vdENvbmZpZ0VtaXR0ZXIuZmlyZSgpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50cy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudHNbMF0udG9TdHJpbmcoKSwgdXJpLnRvU3RyaW5nKCkpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWFkRmlsZSBvbiB1bmtub3duIHByb3ZpZGVyIHRocm93cyBGaWxlTm90Rm91bmQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBmcywgdXJpIH0gPSBjcmVhdGVIYXJuZXNzKHVuZGVmaW5lZCwgLypyZWdpc3RlclByb3ZpZGVyKi8gZmFsc2UpO1xuXG5cdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoYXN5bmMgKCkgPT4ge1xuXHRcdFx0YXdhaXQgZnMucmVhZEZpbGUodXJpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ3NjaGVtYSByZWdpc3RyYXRpb24nLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2NoZW1hUmVnaXN0cnkgPSBSZWdpc3RyeS5hczxJSlNPTkNvbnRyaWJ1dGlvblJlZ2lzdHJ5PihKU09ORXh0ZW5zaW9ucy5KU09OQ29udHJpYnV0aW9uKTtcblxuXHRcdGZ1bmN0aW9uIGV4cGVjdGVkU2NoZW1hSWQoKTogc3RyaW5nIHtcblx0XHRcdHJldHVybiBgdnNjb2RlOi8vc2NoZW1hcy9hZ2VudC1ob3N0LXNldHRpbmdzLyR7UFJPVklERVJfSUR9Lmpzb25jYDtcblx0XHR9XG5cblx0XHR0ZXN0KCdyZWFkRmlsZSBsYXppbHkgcmVnaXN0ZXJzIGEgc2NoZW1hICsgYXNzb2NpYXRpb24gZm9yIHRoZSBwcm92aWRlcicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHsgZnMsIHVyaSB9ID0gY3JlYXRlSGFybmVzcyh7XG5cdFx0XHRcdHNjaGVtYToge1xuXHRcdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdGF1dG9BcHByb3ZlOiB7IHR5cGU6ICdzdHJpbmcnLCB0aXRsZTogJ0F1dG8gQXBwcm92ZScsIGVudW06IFsnZGVmYXVsdCcsICdhdXRvQXBwcm92ZSddIH0sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSxcblx0XHRcdFx0dmFsdWVzOiB7IGF1dG9BcHByb3ZlOiAnZGVmYXVsdCcgfSxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3Qgc2NoZW1hSWQgPSBleHBlY3RlZFNjaGVtYUlkKCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzY2hlbWFSZWdpc3RyeS5oYXNTY2hlbWFDb250ZW50KHNjaGVtYUlkKSwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNjaGVtYVJlZ2lzdHJ5LmdldFNjaGVtYUFzc29jaWF0aW9ucygpW3NjaGVtYUlkXSwgdW5kZWZpbmVkKTtcblxuXHRcdFx0YXdhaXQgZnMucmVhZEZpbGUodXJpKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNjaGVtYVJlZ2lzdHJ5Lmhhc1NjaGVtYUNvbnRlbnQoc2NoZW1hSWQpLCB0cnVlKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2NoZW1hUmVnaXN0cnkuZ2V0U2NoZW1hQXNzb2NpYXRpb25zKClbc2NoZW1hSWRdLCBbdXJpLnRvU3RyaW5nKCldKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3NjaGVtYSBpcyByZWZyZXNoZWQgd2hlbiBvbkRpZENoYW5nZVJvb3RDb25maWcgZmlyZXMgd2l0aCBhIG5ldyBzY2hlbWEgaWRlbnRpdHknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IGZzLCB1cmksIHByb3ZpZGVyIH0gPSBjcmVhdGVIYXJuZXNzKHtcblx0XHRcdFx0c2NoZW1hOiB7XG5cdFx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0YXV0b0FwcHJvdmU6IHsgdHlwZTogJ3N0cmluZycsIHRpdGxlOiAnQXV0byBBcHByb3ZlJywgZW51bTogWydkZWZhdWx0J10gfSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR2YWx1ZXM6IHsgYXV0b0FwcHJvdmU6ICdkZWZhdWx0JyB9LFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBzY2hlbWFJZCA9IGV4cGVjdGVkU2NoZW1hSWQoKTtcblxuXHRcdFx0YXdhaXQgZnMucmVhZEZpbGUodXJpKTtcblx0XHRcdGNvbnN0IGluaXRpYWwgPSBzY2hlbWFSZWdpc3RyeS5nZXRTY2hlbWFDb250cmlidXRpb25zKCkuc2NoZW1hc1tzY2hlbWFJZF07XG5cdFx0XHRhc3NlcnQub2soaW5pdGlhbCk7XG5cblx0XHRcdHByb3ZpZGVyLmNvbmZpZyA9IHtcblx0XHRcdFx0c2NoZW1hOiB7XG5cdFx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0YXV0b0FwcHJvdmU6IHsgdHlwZTogJ3N0cmluZycsIHRpdGxlOiAnQXV0byBBcHByb3ZlJywgZW51bTogWydkZWZhdWx0JywgJ2F1dG9BcHByb3ZlJ10gfSxcblx0XHRcdFx0XHRcdG1vZGU6IHsgdHlwZTogJ3N0cmluZycsIHRpdGxlOiAnTW9kZScsIGVudW06IFsnYScsICdiJ10gfSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR2YWx1ZXM6IHsgYXV0b0FwcHJvdmU6ICdkZWZhdWx0JywgbW9kZTogJ2EnIH0sXG5cdFx0XHR9O1xuXHRcdFx0cHJvdmlkZXIub25EaWRDaGFuZ2VSb290Q29uZmlnRW1pdHRlci5maXJlKCk7XG5cblx0XHRcdGNvbnN0IHJlZnJlc2hlZCA9IHNjaGVtYVJlZ2lzdHJ5LmdldFNjaGVtYUNvbnRyaWJ1dGlvbnMoKS5zY2hlbWFzW3NjaGVtYUlkXTtcblx0XHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbChyZWZyZXNoZWQsIGluaXRpYWwpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlZnJlc2hlZC5wcm9wZXJ0aWVzPy5bJ21vZGUnXSwgJ3JlZnJlc2hlZCBzY2hlbWEgc2hvdWxkIGluY2x1ZGUgdGhlIG5ld2x5IGFkZGVkIHByb3BlcnR5Jyk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsdUJBQXVCO0FBRWhDLFNBQVMsK0NBQStDO0FBRXhELFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsZ0JBQWdCLG1CQUFtQjtBQUM1QyxTQUFTLGNBQWMsc0JBQWlEO0FBQ3hFLFNBQVMsZ0JBQWdCO0FBRXpCLFNBQVMsaUNBQWlDO0FBRTFDLFNBQVMsc0JBQXNCLHFDQUFxQyx3Q0FBd0M7QUFFNUcsTUFBTSxjQUFjO0FBRXBCLE1BQU0sdUNBQXVDLE1BQU07QUFFbEQsUUFBTSxRQUFRLHdDQUF3QztBQWN0RCxXQUFTLGNBQ1IsZUFDQSxtQkFBbUIsTUFDSjtBQUNmLFVBQU0sK0JBQStCLE1BQU0sSUFBSSxJQUFJLFFBQWMsQ0FBQztBQUNsRSxVQUFNLGVBQTJELENBQUM7QUFFbEUsVUFBTSxXQUEyQztBQUFBLE1BQ2hELElBQUk7QUFBQSxNQUNKLFFBQVE7QUFBQSxNQUNSO0FBQUEsTUFDQTtBQUFBLE1BQ0EsdUJBQXVCLDZCQUE2QjtBQUFBLE1BQ3BELGVBQWUsTUFBTSxTQUFTO0FBQUEsTUFDOUIsbUJBQW1CLE9BQU8sV0FBb0M7QUFDN0QscUJBQWEsS0FBSyxFQUFFLE9BQU8sQ0FBQztBQUM1QixZQUFJLFNBQVMsUUFB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
