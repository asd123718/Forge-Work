import assert from "assert";
import { CancellationToken } from "../../../../../../base/common/cancellation.js";
import { Emitter, Event } from "../../../../../../base/common/event.js";
import { observableValue } from "../../../../../../base/common/observable.js";
import { mock } from "../../../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { ActionType, isSessionAction } from "../../../../../../platform/agentHost/common/state/sessionActions.js";
import { CustomizationEnablementKind, CustomizationLoadStatus, CustomizationType } from "../../../../../../platform/agentHost/common/state/protocol/state.js";
import { StateComponents } from "../../../../../../platform/agentHost/common/state/sessionState.js";
import { sessionReducer } from "../../../../../../platform/agentHost/common/state/sessionReducers.js";
import { VSBuffer } from "../../../../../../base/common/buffer.js";
import { PromptsType } from "../../../../../../workbench/contrib/chat/common/promptSyntax/promptTypes.js";
import { NullLogService } from "../../../../../../platform/log/common/log.js";
import { URI } from "../../../../../../base/common/uri.js";
import { SYNCED_CUSTOMIZATION_SCHEME } from "../../../../../../workbench/services/agentHost/common/agentHostFileSystemService.js";
import { RemoteAgentPluginController } from "../../browser/remoteAgentHostCustomizationHarness.js";
import { CustomizationHarnessServiceBase } from "../../../../../../workbench/contrib/chat/common/customizationHarnessService.js";
import { MockPromptsService } from "../../../../../../workbench/contrib/chat/test/common/promptSyntax/service/mockPromptsService.js";
import { ThemeIcon } from "../../../../../../base/common/themables.js";
import { Codicon } from "../../../../../../base/common/codicons.js";
import { AgentCustomizationItemProvider } from "../../../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentCustomizationItemProvider.js";
class MockAgentConnection extends mock() {
  constructor() {
    super();
    this._onDidAction = new Emitter();
    this.onDidAction = this._onDidAction.event;
    this.onDidNotification = Event.None;
    this.clientId = "test-client";
    this._rootStateValue = { agents: [] };
    this._sessionStates = /* @__PURE__ */ new Map();
    this.dispatchedActions = [];
    const self = this;
    this.rootState = {
      get value() {
        return self._rootStateValue;
      },
      get verifiedValue() {
        return self._rootStateValue;
      },
      onDidChange: Event.None,
      onWillApplyAction: Event.None,
      onDidApplyAction: Event.None
    };
  }
  setRootState(rootState) {
    this._rootStateValue = rootState;
  }
  dispatch(channel, action) {
    this.dispatchedActions.push({ channel, action });
  }
  getSubscriptionUnmanaged(kind, resource) {
    if (kind !== StateComponents.Session) {
      return void 0;
    }
    const self = this;
    const channel = resource.toString();
    if (!self._sessionStates.has(channel)) {
      return void 0;
    }
    const subscription = {
      get value() {
        return self._sessionStates.get(channel);
      },
      get verifiedValue() {
        return self._sessionStates.get(channel);
      },
      onDidChange: Event.None,
      onWillApplyAction: Event.None,
      onDidApplyAction: Event.None
    };
    return subscription;
  }
  fireAction(envelope) {
    if (isSessionAction(envelope.action)) {
      const current = this._sessionStates.get(envelope.channel) ?? {};
      this._sessionStates.set(envelope.channel, sessionReducer(current, envelope.action));
    }
    this._onDidAction.fire(envelope);
  }
  dispose() {
    this._onDidAction.dispose();
  }
}
function createNotificationService() {
  return new class extends mock() {
    error() {
      throw new Error("Unexpected notification error");
    }
  }();
}
const testSessionResource = URI.parse("agent-host-copilotcli:/session-1");
const agentHostProviderId = "copilotcli";
const agentHostSessionId = `${agentHostProviderId}:/session-1`;
function createAgentInfo(customizations) {
  return {
    provider: agentHostProviderId,
    displayName: "Copilot",
    description: "Test Agent",
    models: [],
    customizations: [...customizations]
  };
}
function createTestCustomAgentsService(connection, rootCustomizations) {
  const onDidChangeCustomizations = Event.map(
    Event.filter(
      connection.onDidAction,
      (envelope) => envelope.action.type === ActionType.SessionCustomizationsChanged || envelope.action.type === ActionType.SessionCustomizationUpdated
    ),
    () => void 0
  );
  const onDidChangeCustomAgents = Event.map(
    Event.filter(
      connection.onDidAction,
      (envelope) => envelope.action.type === ActionType.SessionCustomizationsChanged || envelope.action.type === ActionType.SessionCustomizationUpdated
    ),
    () => void 0
  );
  return {
    _serviceBrand: void 0,
    onDidChangeCustomAgents,
    onDidChangeCustomizations,
    getCustomAgents: () => [],
    getCustomizations: (sessionResource) => {
      const provider = sessionResource.scheme.replace(/^agent-host-/, "");
      const sessionChannel = `${provider}:${sessionResource.path}`;
      const sessionState = connection.getSubscriptionUnmanaged(StateComponents.Session, URI.parse(sessionChannel))?.value;
      if (!sessionState || sessionState instanceof Error) {
        return [...rootCustomizations];
      }
      return [...rootCustomizations, ...sessionState.customizations ?? []];
    },
    getWorkingDirectory(sessionResource) {
      return void 0;
    },
    getWorkingDirectories(_sessionResource) {
      return [];
    },
    getMcpServers(_sessionResource) {
      return [];
    },
    addMcpServer(_sessionResource, _name, _config) {
    },
    authenticateMcpServer(_sessionResource, _serverId) {
      return Promise.resolve(false);
    },
    setCustomizationEnablement() {
    },
    async showMcpServerLog(_sessionResource, _serverId, beforeShow) {
      await beforeShow?.();
    }
  };
}
suite("RemoteAgentHostCustomizationHarness", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  test("removeConfiguredPlugin keeps sibling scopes for the same URI", async () => {
    const connection = disposables.add(new MockAgentConnection());
    const controller = disposables.add(new RemoteAgentPluginController(
      "Test Host",
      "test-authority",
      connection,
      {},
      createNotificationService(),
      {}
    ));
    const pluginA = { type: CustomizationType.Plugin, id: "file:///plugins/shared", uri: "file:///plugins/shared", name: "Shared Plugin" };
    connection.setRootState({
      agents: [],
      config: {
        schema: { type: "object", properties: {} },
        values: {
          customizations: [
            { uri: "file:///plugins/shared", displayName: "Shared Plugin" },
            { uri: "file:///plugins/other", displayName: "Other Plugin" }
          ]
        }
      }
    });
    await controller.removeConfiguredPlugin(pluginA);
    assert.deepStrictEqual(connection.dispatchedActions, [{
      channel: "ahp-root://",
      action: {
        type: ActionType.RootConfigChanged,
        config: {
          customizations: [{ uri: "file:///plugins/other", displayName: "Other Plugin" }]
        }
      }
    }]);
  });
  test("provider assigns distinct item keys to plugins with different URIs", async () => {
    const connection = disposables.add(new MockAgentConnection());
    const pluginA = { type: CustomizationType.Plugin, id: "file:///plugins/a", uri: "file:///plugins/a", name: "Plugin A" };
    const pluginB = { type: CustomizationType.Plugin, id: "file:///plugins/b", uri: "file:///plugins/b", name: "Plugin B" };
    connection.setRootState({
      agents: [createAgentInfo([pluginA, pluginB])]
    });
    const fileService = new class extends mock() {
      async canHandleResource() {
        return false;
      }
      async resolveAll() {
        return [];
      }
    }();
    const provider = disposables.add(new AgentCustomizationItemProvider(
      "test-authority",
      () => {
      },
      void 0,
      fileService,
      new NullLogService(),
      createTestCustomAgentsService(connection, [pluginA, pluginB])
    ));
    const items = await provider.provideChatSessionCustomizations(testSessionResource, CancellationToken.None);
    assert.strictEqual(items.length, 2);
    assert.notStrictEqual(items[0].itemKey, items[1].itemKey);
  });
  test("provider uses draft agents before session customizations hydrate", async () => {
    const connection = disposables.add(new MockAgentConnection());
    const fileService = new class extends mock() {
    }();
    const provider = disposables.add(new AgentCustomizationItemProvider(
      "test-authority",
      void 0,
      void 0,
      fileService,
      new NullLogService(),
      createTestCustomAgentsService(connection, [])
    ));
    provider.setDraftCustomAgents(observableValue("draftAgents", [{
      type: CustomizationType.Agent,
      id: "file:///workspace/.github/agents/reviewer.agent.md",
      uri: "file:///workspace/.github/agents/reviewer.agent.md",
      name: "Reviewer",
      description: "Review workspace changes"
    }]));
    const agents = await provider.provideCustomAgents(testSessionResource);
    assert.deepStrictEqual(agents.map((agent) => ({ name: agent.name, description: agent.description })), [{
      name: "Reviewer",
      description: "Review workspace changes"
    }]);
  });
  test("provider keeps client-synced entries distinct from host-owned entries", async () => {
    const connection = disposables.add(new MockAgentConnection());
    const hostScoped = { type: CustomizationType.Plugin, id: "file:///plugins/shared", uri: "file:///plugins/shared", name: "Shared Plugin" };
    const synced = {
      ...hostScoped,
      clientId: "test-client"
    };
    connection.setRootState({
      agents: [createAgentInfo([hostScoped])]
    });
    const fileService = new class extends mock() {
      async canHandleResource() {
        return false;
      }
      async resolveAll() {
        return [];
      }
    }();
    const provider = disposables.add(new AgentCustomizationItemProvider(
      "test-authority",
      () => {
      },
      void 0,
      fileService,
      new NullLogService(),
      createTestCustomAgentsService(connection, [hostScoped])
    ));
    connection.fireAction({
      channel: agentHostSessionId,
      serverSeq: 1,
      origin: void 0,
      action: {
        type: ActionType.SessionCustomizationsChanged,
        customizations: [synced]
      }
    });
    const items = await provider.provideChatSessionCustomizations(testSessionResource, CancellationToken.None);
    assert.strictEqual(items.length, 2);
    assert.notStrictEqual(items[0].itemKey, items[1].itemKey);
  });
  test("provider assigns client group to client-synced entries and host group to host entries", async () => {
    const connection = disposables.add(new MockAgentConnection());
    const hostPlugin = { type: CustomizationType.Plugin, id: "file:///plugins/host-plugin", uri: "file:///plugins/host-plugin", name: "Host Plugin" };
    const clientPlugin = { type: CustomizationType.Plugin, id: "file:///plugins/client-plugin", uri: "file:///plugins/client-plugin", name: "Client Plugin" };
    const synced = {
      ...clientPlugin,
      clientId: "test-client"
    };
    connection.setRootState({
      agents: [createAgentInfo([hostPlugin])]
    });
    const fileService = new class extends mock() {
      async canHandleResource() {
        return false;
      }
      async resolveAll() {
        return [];
      }
    }();
    const provider = disposables.add(new AgentCustomizationItemProvider(
      "test-authority",
      () => {
      },
      void 0,
      fileService,
      new NullLogService(),
      createTestCustomAgentsService(connection, [hostPlugin])
    ));
    connection.fireAction({
      channel: agentHostSessionId,
      serverSeq: 1,
      origin: void 0,
      action: {
        type: ActionType.SessionCustomizationsChanged,
        customizations: [synced]
      }
    });
    const items = await provider.provideChatSessionCustomizations(testSessionResource, CancellationToken.None);
    assert.strictEqual(items.length, 2);
    const hostItem = items.find((i) => i.name === "Host Plugin");
    const clientItem = items.find((i) => i.name === "Client Plugin");
    assert.ok(hostItem, "should have a host item");
    assert.ok(clientItem, "should have a client item");
    assert.strictEqual(hostItem.groupKey, "remote-host");
    assert.strictEqual(clientItem.groupKey, "remote-client");
  });
  test("provider hides synthetic bundle but still expands its contents", async () => {
    const connection = disposables.add(new MockAgentConnection());
    const bundleUri = `${SYNCED_CUSTOMIZATION_SCHEME}:///test-authority`;
    const bundleRef = { type: CustomizationType.Plugin, id: bundleUri, uri: bundleUri, name: "VS Code Synced Data", load: { kind: CustomizationLoadStatus.Loaded } };
    const synced = {
      ...bundleRef,
      clientId: "test-client"
    };
    connection.setRootState({ agents: [createAgentInfo([])] });
    const skillFileUri = URI.parse(`${bundleUri}/skills/my-skill`);
    const fileService = new class extends mock() {
      async canHandleResource() {
        return true;
      }
      async resolveAll(resources) {
        return resources.map((r) => {
          if (r.resource.path.endsWith("/skills")) {
            return {
              success: true,
              stat: {
                resource: r.resource,
                name: "skills",
                isFile: false,
                isDirectory: true,
                isSymbolicLink: false,
                readonly: false,
                mtime: 0,
                ctime: 0,
                size: 0,
                children: [{
                  name: "my-skill",
                  resource: skillFileUri,
                  isFile: false,
                  isDirectory: true,
                  isSymbolicLink: false,
                  readonly: false,
                  mtime: 0,
                  ctime: 0,
                  size: 0,
                  children: []
                }]
              }
            };
          }
          return { success: false, stat: void 0 };
        });
      }
      async readFile(resource) {
        if (resource.path.endsWith("/my-skill/SKILL.md")) {
          const content = "---\n---\n";
          return { resource, name: "SKILL.md", value: VSBuffer.fromString(content), mtime: 0, ctime: 0, etag: "", size: content.length, readonly: false, locked: false, executable: false };
        }
        throw new Error("ENOENT");
      }
    }();
    const provider = disposables.add(new AgentCustomizationItemProvider(
      "test-authority",
      () => {
      },
      void 0,
      fileService,
      new NullLogService(),
      createTestCustomAgentsService(connection, [])
    ));
    connection.fireAction({
      channel: agentHostSessionId,
      serverSeq: 1,
      origin: void 0,
      action: {
        type: ActionType.SessionCustomizationsChanged,
        customizations: [synced]
      }
    });
    const items = await provider.provideChatSessionCustomizations(testSessionResource, CancellationToken.None);
    assert.ok(!items.some((i) => i.name === "VS Code Synced Data"), "synthetic bundle should be hidden");
    const skillItem = items.find((i) => i.name === "my-skill");
    assert.ok(skillItem, "expanded skill from bundle should be present");
    assert.strictEqual(skillItem.groupKey, "remote-client", "expanded children from bundle should be in client group");
  });
  test("toRemoteUri preserves synced-customization scheme URIs", async () => {
    const connection = disposables.add(new MockAgentConnection());
    const bundleUri = `${SYNCED_CUSTOMIZATION_SCHEME}:///test-authority`;
    const bundleRef = { type: CustomizationType.Plugin, id: bundleUri, uri: bundleUri, name: "VS Code Synced Data" };
    const synced = {
      ...bundleRef,
      clientId: "test-client"
    };
    connection.setRootState({ agents: [createAgentInfo([])] });
    const fileService = new class extends mock() {
      async canHandleResource() {
        return false;
      }
      async resolveAll() {
        return [];
      }
    }();
    const provider = disposables.add(new AgentCustomizationItemProvider(
      "test-authority",
      () => {
      },
      void 0,
      fileService,
      new NullLogService(),
      createTestCustomAgentsService(connection, [])
    ));
    connection.fireAction({
      channel: agentHostSessionId,
      serverSeq: 1,
      origin: void 0,
      action: {
        type: ActionType.SessionCustomizationsChanged,
        customizations: [synced]
      }
    });
    const items = await provider.provideChatSessionCustomizations(testSessionResource, CancellationToken.None);
    assert.strictEqual(items.length, 0);
  });
  test("provider propagates status and enabled from session customizations", async () => {
    const connection = disposables.add(new MockAgentConnection());
    const pluginRef = { type: CustomizationType.Plugin, id: "file:///plugins/my-plugin", uri: "file:///plugins/my-plugin", name: "My Plugin" };
    const sessionCustomization = {
      ...pluginRef,
      // TODO: Step 2 selects the persisted enablement scope.
      enablement: [{ kind: CustomizationEnablementKind.Global, enabled: false }],
      load: { kind: CustomizationLoadStatus.Error, message: "something went wrong" }
    };
    connection.setRootState({ agents: [createAgentInfo([pluginRef])] });
    const fileService = new class extends mock() {
      async canHandleResource() {
        return false;
      }
      async resolveAll() {
        return [];
      }
    }();
    const provider = disposables.add(new AgentCustomizationItemProvider(
      "test-authority",
      () => {
      },
      void 0,
      fileService,
      new NullLogService(),
      createTestCustomAgentsService(connection, [pluginRef])
    ));
    connection.fireAction({
      channel: agentHostSessionId,
      serverSeq: 1,
      origin: void 0,
      action: {
        type: ActionType.SessionCustomizationsChanged,
        customizations: [sessionCustomization]
      }
    });
    const items = await provider.provideChatSessionCustomizations(testSessionResource, CancellationToken.None);
    const sessionItem = items.find((i) => i.status === "error");
    assert.ok(sessionItem, "should have an item with error status");
    assert.strictEqual(sessionItem.statusMessage, "something went wrong");
  });
  test("provider fires one change event on SessionCustomizationsChanged action", async () => {
    const connection = disposables.add(new MockAgentConnection());
    const pluginRef = { type: CustomizationType.Plugin, id: "file:///plugins/host", uri: "file:///plugins/host", name: "Host Plugin" };
    connection.setRootState({ agents: [createAgentInfo([pluginRef])] });
    const fileService = new class extends mock() {
      async canHandleResource() {
        return false;
      }
      async resolveAll() {
        return [];
      }
    }();
    const provider = disposables.add(new AgentCustomizationItemProvider(
      "test-authority",
      () => {
      },
      void 0,
      fileService,
      new NullLogService(),
      createTestCustomAgentsService(connection, [pluginRef])
    ));
    let changeCount = 0;
    disposables.add(provider.onDidChange(() => changeCount++));
    connection.fireAction({
      channel: agentHostSessionId,
      serverSeq: 1,
      origin: void 0,
      action: {
        type: ActionType.SessionCustomizationsChanged,
        customizations: [pluginRef]
      }
    });
    assert.strictEqual(changeCount, 1, "should fire one change event from customization service");
  });
  test("removeConfiguredPlugin dispatches updated list without the removed plugin", async () => {
    const connection = disposables.add(new MockAgentConnection());
    const controller = disposables.add(new RemoteAgentPluginController(
      "Test Host",
      "test-authority",
      connection,
      {},
      createNotificationService(),
      {}
    ));
    const pluginB = { type: CustomizationType.Plugin, id: "file:///plugins/b", uri: "file:///plugins/b", name: "Plugin B" };
    connection.setRootState({
      agents: [],
      config: {
        schema: { type: "object", properties: {} },
        values: {
          customizations: [
            { uri: "file:///plugins/a", displayName: "Plugin A" },
            { uri: "file:///plugins/b", displayName: "Plugin B" },
            { uri: "file:///plugins/c", displayName: "Plugin C" }
          ]
        }
      }
    });
    await controller.removeConfiguredPlugin(pluginB);
    assert.strictEqual(connection.dispatchedActions.length, 1);
    assert.deepStrictEqual(connection.dispatchedActions[0], {
      channel: "ahp-root://",
      action: {
        type: ActionType.RootConfigChanged,
        config: {
          customizations: [
            { uri: "file:///plugins/a", displayName: "Plugin A" },
            { uri: "file:///plugins/c", displayName: "Plugin C" }
          ]
        }
      }
    });
  });
  test("multiple client-synced entries all appear with distinct keys", async () => {
    const connection = disposables.add(new MockAgentConnection());
    const clientA = { type: CustomizationType.Plugin, id: "file:///plugins/client-a", uri: "file:///plugins/client-a", name: "Client A" };
    const clientB = { type: CustomizationType.Plugin, id: "file:///plugins/client-b", uri: "file:///plugins/client-b", name: "Client B" };
    connection.setRootState({ agents: [createAgentInfo([])] });
    const fileService = new class extends mock() {
      async canHandleResource() {
        return false;
      }
      async resolveAll() {
        return [];
      }
    }();
    const provider = disposables.add(new AgentCustomizationItemProvider(
      "test-authority",
      () => {
      },
      void 0,
      fileService,
      new NullLogService(),
      createTestCustomAgentsService(connection, [])
    ));
    connection.fireAction({
      channel: agentHostSessionId,
      serverSeq: 1,
      origin: void 0,
      action: {
        type: ActionType.SessionCustomizationsChanged,
        customizations: [
          { ...clientA, clientId: "test-client" },
          { ...clientB, clientId: "test-client" }
        ]
      }
    });
    const items = await provider.provideChatSessionCustomizations(testSessionResource, CancellationToken.None);
    assert.strictEqual(items.length, 2);
    assert.ok(items.find((i) => i.name === "Client A"), "should have Client A");
    assert.ok(items.find((i) => i.name === "Client B"), "should have Client B");
    const keys = items.map((i) => i.itemKey);
    assert.strictEqual(new Set(keys).size, 2, "all item keys should be unique");
  });
  test("provider parses skill metadata, rewrites folder URIs to SKILL.md, and skips unreadable folder skills", async () => {
    const connection = disposables.add(new MockAgentConnection());
    const plugin = { type: CustomizationType.Plugin, id: "file:///plugins/skills-bundle", uri: "file:///plugins/skills-bundle", name: "Skills Bundle" };
    connection.setRootState({ agents: [createAgentInfo([plugin])] });
    const skillsDirChildren = [
      { name: "valid-skill", resource: URI.parse("vscode-agent-host://test/plugins/skills-bundle/skills/valid-skill"), isFile: false, isDirectory: true, isSymbolicLink: false, children: void 0 },
      { name: "broken-skill", resource: URI.parse("vscode-agent-host://test/plugins/skills-bundle/skills/broken-skill"), isFile: false, isDirectory: true, isSymbolicLink: false, children: void 0 },
      { name: "legacy.skill.md", resource: URI.parse("vscode-agent-host://test/plugins/skills-bundle/skills/legacy.skill.md"), isFile: true, isDirectory: false, isSymbolicLink: false, children: void 0 }
    ];
    const fileService = new class extends mock() {
      async canHandleResource() {
        return true;
      }
      async resolveAll(toResolve) {
        return toResolve.map(({ resource }) => {
          if (resource.path.endsWith("/skills")) {
            return {
              success: true,
              stat: { name: "skills", resource, isFile: false, isDirectory: true, isSymbolicLink: false, children: skillsDirChildren }
            };
          }
          return { success: false };
        });
      }
      async readFile(resource) {
        if (resource.path.endsWith("/valid-skill/SKILL.md")) {
          const content = "---\nname: Pretty Name\ndescription: A friendly skill description\n---\n\n# Body\n";
          return { resource, name: "SKILL.md", value: VSBuffer.fromString(content), mtime: 0, ctime: 0, etag: "", size: content.length, readonly: false, locked: false, executable: false };
        }
        throw new Error("ENOENT");
      }
    }();
    const provider = disposables.add(new AgentCustomizationItemProvider(
      "test-authority",
      () => {
      },
      void 0,
      fileService,
      new NullLogService(),
      createTestCustomAgentsService(connection, [plugin])
    ));
    const items = await provider.provideChatSessionCustomizations(testSessionResource, CancellationToken.None);
    const skillItems = items.filter((i) => i.type === PromptsType.skill);
    assert.deepStrictEqual(
      skillItems.map((i) => ({ name: i.name, description: i.description, uri: i.uri.toString() })).sort((a, b) => a.name.localeCompare(b.name)),
      [
        { name: "Pretty Name", description: "A friendly skill description", uri: "vscode-agent-host://test/plugins/skills-bundle/skills/valid-skill/SKILL.md" }
      ].sort((a, b) => a.name.localeCompare(b.name))
    );
    const expectedPluginUri = "vscode-agent-host://test-authority/plugins/skills-bundle?_ah%3DeyJzY2hlbWUiOiJmaWxlIn0";
    for (const skillItem of skillItems) {
      assert.strictEqual(skillItem.pluginUri?.toString(), expectedPluginUri, `skill ${skillItem.name} should carry pluginUri`);
    }
  });
  test("provider recovers original provenance for synthetic-bundle children via the origin resolver", async () => {
    const connection = disposables.add(new MockAgentConnection());
    const bundleUri = `${SYNCED_CUSTOMIZATION_SCHEME}:///test-authority`;
    const bundle = { type: CustomizationType.Plugin, id: bundleUri, uri: bundleUri, name: "VS Code Synced Data" };
    connection.setRootState({ agents: [createAgentInfo([])] });
    const ruleResource = URI.parse(`${SYNCED_CUSTOMIZATION_SCHEME}:///test-authority/rules/my-rule.md`);
    const rulesDirChildren = [
      { name: "my-rule.md", resource: ruleResource, isFile: true, isDirectory: false, isSymbolicLink: false, children: void 0 }
    ];
    const fileService = new class extends mock() {
      async canHandleResource() {
        return true;
      }
      async resolveAll(toResolve) {
        return toResolve.map(({ resource }) => resource.path.endsWith("/rules") ? { success: true, stat: { name: "rules", resource, isFile: false, isDirectory: true, isSymbolicLink: false, children: rulesDirChildren } } : { success: false });
      }
      async readFile(resource) {
        const content = "---\nname: My Rule\ndescription: A synced rule\n---\n";
        return { resource, name: "my-rule.md", value: VSBuffer.fromString(content), mtime: 0, ctime: 0, etag: "", size: content.length, readonly: false, locked: false, executable: false };
      }
    }();
    const originUri = URI.parse("file:///home/user/.config/rules/my-rule.md");
    const provider = disposables.add(new AgentCustomizationItemProvider(
      "test-authority",
      () => {
      },
      (syncedUri) => syncedUri.toString() === ruleResource.toString() ? { uri: originUri, source: "extension", extensionId: "pub.ext", pluginUri: void 0 } : void 0,
      fileService,
      new NullLogService(),
      createTestCustomAgentsService(connection, [])
    ));
    connection.fireAction({
      channel: agentHostSessionId,
      serverSeq: 1,
      origin: void 0,
      action: {
        type: ActionType.SessionCustomizationsChanged,
        customizations: [{ ...bundle, clientId: "test-client" }]
      }
    });
    const items = await provider.provideChatSessionCustomizations(testSessionResource, CancellationToken.None);
    const rule = items.find((i) => i.type === PromptsType.instructions);
    assert.ok(rule, "the synced rule should be expanded");
    assert.deepStrictEqual(
      { uri: rule.uri.toString(), source: rule.source, extensionId: rule.extensionId, groupKey: rule.groupKey },
      { uri: originUri.toString(), source: "extension", extensionId: "pub.ext", groupKey: void 0 }
    );
  });
  test("provider keeps client group for recovered user provenance", async () => {
    const connection = disposables.add(new MockAgentConnection());
    const bundleUri = `${SYNCED_CUSTOMIZATION_SCHEME}:///test-authority`;
    const bundle = { type: CustomizationType.Plugin, id: bundleUri, uri: bundleUri, name: "VS Code Synced Data" };
    connection.setRootState({ agents: [createAgentInfo([])] });
    const ruleResource = URI.parse(`${bundleUri}/rules/user-rule.instructions.md`);
    const fileService = new class extends mock() {
      async canHandleResource() {
        return true;
      }
      async resolveAll(toResolve) {
        return toResolve.map(({ resource }) => resource.path.endsWith("/rules") ? { success: true, stat: { name: "rules", resource, isFile: false, isDirectory: true, isSymbolicLink: false, children: [{ name: "user-rule.instructions.md", resource: ruleResource, isFile: true, isDirectory: false, isSymbolicLink: false, children: void 0 }] } } : { success: false });
      }
      async readFile(resource) {
        const content = "User rule";
        return { resource, name: "user-rule.instructions.md", value: VSBuffer.fromString(content), mtime: 0, ctime: 0, etag: "", size: content.length, readonly: false, locked: false, executable: false };
      }
    }();
    const originUri = URI.parse("file:///home/user/.copilot/instructions/user-rule.instructions.md");
    const provider = disposables.add(new AgentCustomizationItemProvider(
      "test-authority",
      () => {
      },
      (syncedUri) => syncedUri.toString() === ruleResource.toString() ? { uri: originUri, source: "user", extensionId: void 0, pluginUri: void 0 } : void 0,
      fileService,
      new NullLogService(),
      createTestCustomAgentsService(connection, [])
    ));
    connection.fireAction({
      channel: agentHostSessionId,
      serverSeq: 1,
      origin: void 0,
      action: {
        type: ActionType.SessionCustomizationsChanged,
        customizations: [{ ...bundle, clientId: "test-client" }]
      }
    });
    const items = await provider.provideChatSessionCustomizations(testSessionResource, CancellationToken.None);
    const rule = items.find((item) => item.type === PromptsType.instructions);
    assert.ok(rule);
    assert.deepStrictEqual({
      uri: rule.uri.toString(),
      source: rule.source,
      groupKey: rule.groupKey
    }, {
      uri: originUri.toString(),
      source: "user",
      groupKey: "remote-client"
    });
  });
  test("provider leaves synthetic-bundle children unchanged when no origin is known", async () => {
    const connection = disposables.add(new MockAgentConnection());
    const bundleUri = `${SYNCED_CUSTOMIZATION_SCHEME}:///test-authority`;
    const bundle = { type: CustomizationType.Plugin, id: bundleUri, uri: bundleUri, name: "VS Code Synced Data" };
    connection.setRootState({ agents: [createAgentInfo([])] });
    const ruleResource = URI.parse(`${SYNCED_CUSTOMIZATION_SCHEME}:///test-authority/rules/my-rule.md`);
    const rulesDirChildren = [
      { name: "my-rule.md", resource: ruleResource, isFile: true, isDirectory: false, isSymbolicLink: false, children: void 0 }
    ];
    const fileService = new class extends mock() {
      async canHandleResource() {
        return true;
      }
      async resolveAll(toResolve) {
        return toResolve.map(({ resource }) => resource.path.endsWith("/rules") ? { success: true, stat: { name: "rules", resource, isFile: false, isDirectory: true, isSymbolicLink: false, children: rulesDirChildren } } : { success: false });
      }
      async readFile(resource) {
        const content = "---\nname: My Rule\n---\n";
        return { resource, name: "my-rule.md", value: VSBuffer.fromString(content), mtime: 0, ctime: 0, etag: "", size: content.length, readonly: false, locked: false, executable: false };
      }
    }();
    const provider = disposables.add(new AgentCustomizationItemProvider(
      "test-authority",
      () => {
      },
      void 0,
      fileService,
      new NullLogService(),
      createTestCustomAgentsService(connection, [])
    ));
    connection.fireAction({
      channel: agentHostSessionId,
      serverSeq: 1,
      origin: void 0,
      action: {
        type: ActionType.SessionCustomizationsChanged,
        customizations: [{ ...bundle, clientId: "test-client" }]
      }
    });
    const items = await provider.provideChatSessionCustomizations(testSessionResource, CancellationToken.None);
    const rule = items.find((i) => i.type === PromptsType.instructions);
    assert.ok(rule, "the synced rule should be expanded");
    assert.strictEqual(rule.uri.toString(), ruleResource.toString());
  });
  test("CustomizationHarnessService.getSlashCommands prefixes discovered skill names with the plugin id", async () => {
    const connection = disposables.add(new MockAgentConnection());
    const plugin = { type: CustomizationType.Plugin, id: "file:///plugins/skills-bundle", uri: "file:///plugins/skills-bundle", name: "Skills Bundle" };
    connection.setRootState({ agents: [createAgentInfo([plugin])] });
    const skillsDirChildren = [
      { name: "lint", resource: URI.parse("vscode-agent-host://test/plugins/skills-bundle/skills/lint"), isFile: false, isDirectory: true, isSymbolicLink: false, children: void 0 }
    ];
    const fileService = new class extends mock() {
      async canHandleResource() {
        return true;
      }
      async resolveAll(toResolve) {
        return toResolve.map(({ resource }) => {
          if (resource.path.endsWith("/skills")) {
            return {
              success: true,
              stat: { name: "skills", resource, isFile: false, isDirectory: true, isSymbolicLink: false, children: skillsDirChildren }
            };
          }
          return { success: false };
        });
      }
      async readFile(resource) {
        if (resource.path.endsWith("/lint/SKILL.md")) {
          const content = "---\nname: Lint\ndescription: A lint skill\n---\n";
          return { resource, name: "SKILL.md", value: VSBuffer.fromString(content), mtime: 0, ctime: 0, etag: "", size: content.length, readonly: false, locked: false, executable: false };
        }
        throw new Error("ENOENT");
      }
    }();
    const provider = disposables.add(new AgentCustomizationItemProvider(
      "test-authority",
      () => {
      },
      void 0,
      fileService,
      new NullLogService(),
      createTestCustomAgentsService(connection, [plugin])
    ));
    const harnessId = "remote-agent-host-test";
    const testSessionResource2 = URI.parse("remote-agent-host-test:///test-session");
    const descriptor = {
      id: harnessId,
      label: "Remote Agent Host (test)",
      icon: ThemeIcon.fromId(Codicon.remote.id),
      itemProvider: provider
    };
    const harnessService = disposables.add(new CustomizationHarnessServiceBase([descriptor], harnessId, new MockPromptsService()));
    const commands = await harnessService.getSlashCommands(testSessionResource2, CancellationToken.None);
    const skillCommand = commands.find((c) => c.type === PromptsType.skill);
    assert.ok(skillCommand, "should have a skill slash command");
    assert.strictEqual(skillCommand.name, "skills-bundle:lint", "skill command name should be plugin-prefixed");
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxccHJvdmlkZXJzXFxyZW1vdGVBZ2VudEhvc3RcXHRlc3RcXGJyb3dzZXJcXHJlbW90ZUFnZW50SG9zdEN1c3RvbWl6YXRpb25IYXJuZXNzLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IG9ic2VydmFibGVWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgbW9jayB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vbW9jay5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IHR5cGUgSUFnZW50Q29ubmVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vYWdlbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFjdGlvblR5cGUsIGlzU2Vzc2lvbkFjdGlvbiwgdHlwZSBBY3Rpb25FbnZlbG9wZSwgdHlwZSBJTm90aWZpY2F0aW9uLCB0eXBlIFN0YXRlQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9zdGF0ZS9zZXNzaW9uQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBDdXN0b21pemF0aW9uRW5hYmxlbWVudEtpbmQsIEN1c3RvbWl6YXRpb25Mb2FkU3RhdHVzLCBDdXN0b21pemF0aW9uVHlwZSwgdHlwZSBBZ2VudEN1c3RvbWl6YXRpb24sIHR5cGUgQWdlbnRJbmZvLCB0eXBlIEN1c3RvbWl6YXRpb24sIHR5cGUgUm9vdFN0YXRlLCB0eXBlIFNlc3Npb25TdGF0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc3RhdGUvcHJvdG9jb2wvc3RhdGUuanMnO1xuaW1wb3J0IHsgU3RhdGVDb21wb25lbnRzLCB0eXBlIENvbXBvbmVudFRvU3RhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL3Nlc3Npb25TdGF0ZS5qcyc7XG5pbXBvcnQgeyBzZXNzaW9uUmVkdWNlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc3RhdGUvc2Vzc2lvblJlZHVjZXJzLmpzJztcbmltcG9ydCB7IHR5cGUgSUFnZW50U3Vic2NyaXB0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9zdGF0ZS9hZ2VudFN1YnNjcmlwdGlvbi5qcyc7XG5pbXBvcnQgeyBJRmlsZURpYWxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSwgdHlwZSBJRmlsZUNvbnRlbnQsIHR5cGUgSUZpbGVTdGF0LCB0eXBlIElGaWxlU3RhdFJlc3VsdCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBQcm9tcHRzVHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL3Byb21wdFN5bnRheC9wcm9tcHRUeXBlcy5qcyc7XG5pbXBvcnQgeyBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElBSUN1c3RvbWl6YXRpb25Xb3Jrc3BhY2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vYWlDdXN0b21pemF0aW9uV29ya3NwYWNlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBTWU5DRURfQ1VTVE9NSVpBVElPTl9TQ0hFTUUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvc2VydmljZXMvYWdlbnRIb3N0L2NvbW1vbi9hZ2VudEhvc3RGaWxlU3lzdGVtU2VydmljZS5qcyc7XG5pbXBvcnQgeyBSZW1vdGVBZ2VudFBsdWdpbkNvbnRyb2xsZXIgfSBmcm9tICcuLi8uLi9icm93c2VyL3JlbW90ZUFnZW50SG9zdEN1c3RvbWl6YXRpb25IYXJuZXNzLmpzJztcbmltcG9ydCB7IEN1c3RvbWl6YXRpb25IYXJuZXNzU2VydmljZUJhc2UsIElIYXJuZXNzRGVzY3JpcHRvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2N1c3RvbWl6YXRpb25IYXJuZXNzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBNb2NrUHJvbXB0c1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L3Rlc3QvY29tbW9uL3Byb21wdFN5bnRheC9zZXJ2aWNlL21vY2tQcm9tcHRzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RDdXN0b21pemF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9hZ2VudFNlc3Npb25zL2FnZW50SG9zdC9hZ2VudEhvc3RDdXN0b21pemF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBBZ2VudEN1c3RvbWl6YXRpb25JdGVtUHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvYWdlbnRTZXNzaW9ucy9hZ2VudEhvc3QvYWdlbnRDdXN0b21pemF0aW9uSXRlbVByb3ZpZGVyLmpzJztcblxuY2xhc3MgTW9ja0FnZW50Q29ubmVjdGlvbiBleHRlbmRzIG1vY2s8SUFnZW50Q29ubmVjdGlvbj4oKSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRBY3Rpb24gPSBuZXcgRW1pdHRlcjxBY3Rpb25FbnZlbG9wZT4oKTtcblx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRBY3Rpb24gPSB0aGlzLl9vbkRpZEFjdGlvbi5ldmVudDtcblx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWROb3RpZmljYXRpb24gPSBFdmVudC5Ob25lIGFzIEV2ZW50PElOb3RpZmljYXRpb24+O1xuXHRvdmVycmlkZSByZWFkb25seSBjbGllbnRJZCA9ICd0ZXN0LWNsaWVudCc7XG5cblx0cHJpdmF0ZSBfcm9vdFN0YXRlVmFsdWU6IFJvb3RTdGF0ZSA9IHsgYWdlbnRzOiBbXSB9O1xuXHRvdmVycmlkZSByZWFkb25seSByb290U3RhdGU7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfc2Vzc2lvblN0YXRlcyA9IG5ldyBNYXA8c3RyaW5nLCBTZXNzaW9uU3RhdGU+KCk7XG5cblx0cmVhZG9ubHkgZGlzcGF0Y2hlZEFjdGlvbnM6IHsgY2hhbm5lbDogc3RyaW5nOyBhY3Rpb246IFN0YXRlQWN0aW9uIH1bXSA9IFtdO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0Y29uc3Qgc2VsZiA9IHRoaXM7XG5cdFx0dGhpcy5yb290U3RhdGUgPSB7XG5cdFx0XHRnZXQgdmFsdWUoKTogUm9vdFN0YXRlIHsgcmV0dXJuIHNlbGYuX3Jvb3RTdGF0ZVZhbHVlOyB9LFxuXHRcdFx0Z2V0IHZlcmlmaWVkVmFsdWUoKTogUm9vdFN0YXRlIHsgcmV0dXJuIHNlbGYuX3Jvb3RTdGF0ZVZhbHVlOyB9LFxuXHRcdFx0b25EaWRDaGFuZ2U6IEV2ZW50Lk5vbmUsXG5cdFx0XHRvbldpbGxBcHBseUFjdGlvbjogRXZlbnQuTm9uZSxcblx0XHRcdG9uRGlkQXBwbHlBY3Rpb246IEV2ZW50Lk5vbmUsXG5cdFx0fTtcblx0fVxuXG5cdHNldFJvb3RTdGF0ZShyb290U3RhdGU6IFJvb3RTdGF0ZSk6IHZvaWQge1xuXHRcdHRoaXMuX3Jvb3RTdGF0ZVZhbHVlID0gcm9vdFN0YXRlO1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcGF0Y2goY2hhbm5lbDogc3RyaW5nLCBhY3Rpb246IFN0YXRlQWN0aW9uKTogdm9pZCB7XG5cdFx0dGhpcy5kaXNwYXRjaGVkQWN0aW9ucy5wdXNoKHsgY2hhbm5lbCwgYWN0aW9uIH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgZ2V0U3Vic2NyaXB0aW9uVW5tYW5hZ2VkPFQgZXh0ZW5kcyBTdGF0ZUNvbXBvbmVudHM+KGtpbmQ6IFQsIHJlc291cmNlOiBVUkkpOiBJQWdlbnRTdWJzY3JpcHRpb248Q29tcG9uZW50VG9TdGF0ZVtUXT4gfCB1bmRlZmluZWQge1xuXHRcdGlmIChraW5kICE9PSBTdGF0ZUNvbXBvbmVudHMuU2Vzc2lvbikge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3Qgc2VsZiA9IHRoaXM7XG5cdFx0Y29uc3QgY2hhbm5lbCA9IHJlc291cmNlLnRvU3RyaW5nKCk7XG5cdFx0aWYgKCFzZWxmLl9zZXNzaW9uU3RhdGVzLmhhcyhjaGFubmVsKSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3Qgc3Vic2NyaXB0aW9uOiBJQWdlbnRTdWJzY3JpcHRpb248U2Vzc2lvblN0YXRlPiA9IHtcblx0XHRcdGdldCB2YWx1ZSgpIHsgcmV0dXJuIHNlbGYuX3Nlc3Npb25TdGF0ZXMuZ2V0KGNoYW5uZWwpOyB9LFxuXHRcdFx0Z2V0IHZlcmlmaWVkVmFsdWUoKSB7IHJldHVybiBzZWxmLl9zZXNzaW9uU3RhdGVzLmdldChjaGFubmVsKTsgfSxcblx0XHRcdG9uRGlkQ2hhbmdlOiBFdmVudC5Ob25lLFxuXHRcdFx0b25XaWxsQXBwbHlBY3Rpb246IEV2ZW50Lk5vbmUsXG5cdFx0XHRvbkRpZEFwcGx5QWN0aW9uOiBFdmVudC5Ob25lLFxuXHRcdH07XG5cdFx0cmV0dXJuIHN1YnNjcmlwdGlvbiBhcyBJQWdlbnRTdWJzY3JpcHRpb248Q29tcG9uZW50VG9TdGF0ZVtUXT47XG5cdH1cblxuXHRmaXJlQWN0aW9uKGVudmVsb3BlOiBBY3Rpb25FbnZlbG9wZSk6IHZvaWQge1xuXHRcdGlmIChpc1Nlc3Npb25BY3Rpb24oZW52ZWxvcGUuYWN0aW9uKSkge1xuXHRcdFx0Y29uc3QgY3VycmVudCA9IHRoaXMuX3Nlc3Npb25TdGF0ZXMuZ2V0KGVudmVsb3BlLmNoYW5uZWwpID8/IHt9IGFzIFNlc3Npb25TdGF0ZTtcblx0XHRcdHRoaXMuX3Nlc3Npb25TdGF0ZXMuc2V0KGVudmVsb3BlLmNoYW5uZWwsIHNlc3Npb25SZWR1Y2VyKGN1cnJlbnQsIGVudmVsb3BlLmFjdGlvbikpO1xuXHRcdH1cblx0XHR0aGlzLl9vbkRpZEFjdGlvbi5maXJlKGVudmVsb3BlKTtcblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fb25EaWRBY3Rpb24uZGlzcG9zZSgpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZU5vdGlmaWNhdGlvblNlcnZpY2UoKTogSU5vdGlmaWNhdGlvblNlcnZpY2Uge1xuXHRyZXR1cm4gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJTm90aWZpY2F0aW9uU2VydmljZT4oKSB7XG5cdFx0b3ZlcnJpZGUgZXJyb3IoKTogbmV2ZXIge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdVbmV4cGVjdGVkIG5vdGlmaWNhdGlvbiBlcnJvcicpO1xuXHRcdH1cblx0fTtcbn1cbmNvbnN0IHRlc3RTZXNzaW9uUmVzb3VyY2UgPSBVUkkucGFyc2UoJ2FnZW50LWhvc3QtY29waWxvdGNsaTovc2Vzc2lvbi0xJyk7XG5jb25zdCBhZ2VudEhvc3RQcm92aWRlcklkID0gJ2NvcGlsb3RjbGknO1xuY29uc3QgYWdlbnRIb3N0U2Vzc2lvbklkID0gYCR7YWdlbnRIb3N0UHJvdmlkZXJJZH06L3Nlc3Npb24tMWA7XG5cbmZ1bmN0aW9uIGNyZWF0ZUFnZW50SW5mbyhjdXN0b21pemF0aW9uczogcmVhZG9ubHkgQ3VzdG9taXphdGlvbltdKTogQWdlbnRJbmZvIHtcblx0cmV0dXJuIHtcblx0XHRwcm92aWRlcjogYWdlbnRIb3N0UHJvdmlkZXJJZCxcblx0XHRkaXNwbGF5TmFtZTogJ0NvcGlsb3QnLFxuXHRcdGRlc2NyaXB0aW9uOiAnVGVzdCBBZ2VudCcsXG5cdFx0bW9kZWxzOiBbXSxcblx0XHRjdXN0b21pemF0aW9uczogWy4uLmN1c3RvbWl6YXRpb25zXSxcblx0fTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlVGVzdEN1c3RvbUFnZW50c1NlcnZpY2UoY29ubmVjdGlvbjogTW9ja0FnZW50Q29ubmVjdGlvbiwgcm9vdEN1c3RvbWl6YXRpb25zOiByZWFkb25seSBDdXN0b21pemF0aW9uW10pOiBJQWdlbnRIb3N0Q3VzdG9taXphdGlvblNlcnZpY2Uge1xuXHRjb25zdCBvbkRpZENoYW5nZUN1c3RvbWl6YXRpb25zID0gRXZlbnQubWFwKFxuXHRcdEV2ZW50LmZpbHRlcihjb25uZWN0aW9uLm9uRGlkQWN0aW9uLCBlbnZlbG9wZSA9PlxuXHRcdFx0ZW52ZWxvcGUuYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuU2Vzc2lvbkN1c3RvbWl6YXRpb25zQ2hhbmdlZFxuXHRcdFx0fHwgZW52ZWxvcGUuYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuU2Vzc2lvbkN1c3RvbWl6YXRpb25VcGRhdGVkXG5cdFx0KSxcblx0XHQoKSA9PiB1bmRlZmluZWQsXG5cdCk7XG5cblx0Y29uc3Qgb25EaWRDaGFuZ2VDdXN0b21BZ2VudHMgPSBFdmVudC5tYXAoXG5cdFx0RXZlbnQuZmlsdGVyKGNvbm5lY3Rpb24ub25EaWRBY3Rpb24sIGVudmVsb3BlID0+XG5cdFx0XHRlbnZlbG9wZS5hY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5TZXNzaW9uQ3VzdG9taXphdGlvbnNDaGFuZ2VkXG5cdFx0XHR8fCBlbnZlbG9wZS5hY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5TZXNzaW9uQ3VzdG9taXphdGlvblVwZGF0ZWRcblx0XHQpLFxuXHRcdCgpID0+IHVuZGVmaW5lZCxcblx0KTtcblxuXHRyZXR1cm4ge1xuXHRcdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCxcblx0XHRvbkRpZENoYW5nZUN1c3RvbUFnZW50cyxcblx0XHRvbkRpZENoYW5nZUN1c3RvbWl6YXRpb25zLFxuXHRcdGdldEN1c3RvbUFnZW50czogKCkgPT4gW10sXG5cdFx0Z2V0Q3VzdG9taXphdGlvbnM6IChzZXNzaW9uUmVzb3VyY2U6IFVSSSkgPT4ge1xuXHRcdFx0Y29uc3QgcHJvdmlkZXIgPSBzZXNzaW9uUmVzb3VyY2Uuc2NoZW1lLnJlcGxhY2UoL15hZ2VudC1ob3N0LS8sICcnKTtcblx0XHRcdGNvbnN0IHNlc3Npb25DaGFubmVsID0gYCR7cHJvdmlkZXJ9OiR7c2Vzc2lvblJlc291cmNlLnBhdGh9YDtcblx0XHRcdGNvbnN0IHNlc3Npb25TdGF0ZSA9IGNvbm5lY3Rpb24uZ2V0U3Vic2NyaXB0aW9uVW5tYW5hZ2VkKFN0YXRlQ29tcG9uZW50cy5TZXNzaW9uLCBVUkkucGFyc2Uoc2Vzc2lvbkNoYW5uZWwpKT8udmFsdWU7XG5cdFx0XHRpZiAoIXNlc3Npb25TdGF0ZSB8fCBzZXNzaW9uU3RhdGUgaW5zdGFuY2VvZiBFcnJvcikge1xuXHRcdFx0XHRyZXR1cm4gWy4uLnJvb3RDdXN0b21pemF0aW9uc107XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gWy4uLnJvb3RDdXN0b21pemF0aW9ucywgLi4uKHNlc3Npb25TdGF0ZS5jdXN0b21pemF0aW9ucyA/PyBbXSldO1xuXHRcdH0sXG5cdFx0Z2V0V29ya2luZ0RpcmVjdG9yeShzZXNzaW9uUmVzb3VyY2U6IFVSSSk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH0sXG5cdFx0Z2V0V29ya2luZ0RpcmVjdG9yaWVzKF9zZXNzaW9uUmVzb3VyY2U6IFVSSSk6IHJlYWRvbmx5IHN0cmluZ1tdIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9LFxuXHRcdGdldE1jcFNlcnZlcnMoX3Nlc3Npb25SZXNvdXJjZTogVVJJKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fSxcblx0XHRhZGRNY3BTZXJ2ZXIoX3Nlc3Npb25SZXNvdXJjZTogVVJJLCBfbmFtZTogc3RyaW5nLCBfY29uZmlnKSB7XG5cdFx0XHQvLyBuby1vcFxuXHRcdH0sXG5cdFx0YXV0aGVudGljYXRlTWNwU2VydmVyKF9zZXNzaW9uUmVzb3VyY2U6IFVSSSwgX3NlcnZlcklkOiBzdHJpbmcpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoZmFsc2UpO1xuXHRcdH0sXG5cdFx0c2V0Q3VzdG9taXphdGlvbkVuYWJsZW1lbnQoKSB7IH0sXG5cdFx0YXN5bmMgc2hvd01jcFNlcnZlckxvZyhfc2Vzc2lvblJlc291cmNlOiBVUkksIF9zZXJ2ZXJJZDogc3RyaW5nLCBiZWZvcmVTaG93PzogKCkgPT4gUHJvbWlzZTx2b2lkPikge1xuXHRcdFx0YXdhaXQgYmVmb3JlU2hvdz8uKCk7XG5cdFx0fSxcblx0fTtcbn1cblxuXG5cbnN1aXRlKCdSZW1vdGVBZ2VudEhvc3RDdXN0b21pemF0aW9uSGFybmVzcycsICgpID0+IHtcblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdyZW1vdmVDb25maWd1cmVkUGx1Z2luIGtlZXBzIHNpYmxpbmcgc2NvcGVzIGZvciB0aGUgc2FtZSBVUkknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY29ubmVjdGlvbiA9IGRpc3Bvc2FibGVzLmFkZChuZXcgTW9ja0FnZW50Q29ubmVjdGlvbigpKTtcblx0XHRjb25zdCBjb250cm9sbGVyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBSZW1vdGVBZ2VudFBsdWdpbkNvbnRyb2xsZXIoXG5cdFx0XHQnVGVzdCBIb3N0Jyxcblx0XHRcdCd0ZXN0LWF1dGhvcml0eScsXG5cdFx0XHRjb25uZWN0aW9uLFxuXHRcdFx0e30gYXMgSUZpbGVEaWFsb2dTZXJ2aWNlLFxuXHRcdFx0Y3JlYXRlTm90aWZpY2F0aW9uU2VydmljZSgpLFxuXHRcdFx0e30gYXMgSUFJQ3VzdG9taXphdGlvbldvcmtzcGFjZVNlcnZpY2UsXG5cdFx0KSk7XG5cdFx0Y29uc3QgcGx1Z2luQTogQ3VzdG9taXphdGlvbiA9IHsgdHlwZTogQ3VzdG9taXphdGlvblR5cGUuUGx1Z2luLCBpZDogJ2ZpbGU6Ly8vcGx1Z2lucy9zaGFyZWQnLCB1cmk6ICdmaWxlOi8vL3BsdWdpbnMvc2hhcmVkJywgbmFtZTogJ1NoYXJlZCBQbHVnaW4nLCB9O1xuXHRcdGNvbm5lY3Rpb24uc2V0Um9vdFN0YXRlKHtcblx0XHRcdGFnZW50czogW10sXG5cdFx0XHRjb25maWc6IHtcblx0XHRcdFx0c2NoZW1hOiB7IHR5cGU6ICdvYmplY3QnLCBwcm9wZXJ0aWVzOiB7fSB9LFxuXHRcdFx0XHR2YWx1ZXM6IHtcblx0XHRcdFx0XHRjdXN0b21pemF0aW9uczogW1xuXHRcdFx0XHRcdFx0eyB1cmk6ICdmaWxlOi8vL3BsdWdpbnMvc2hhcmVkJywgZGlzcGxheU5hbWU6ICdTaGFyZWQgUGx1Z2luJyB9LFxuXHRcdFx0XHRcdFx0eyB1cmk6ICdmaWxlOi8vL3BsdWdpbnMvb3RoZXInLCBkaXNwbGF5TmFtZTogJ090aGVyIFBsdWdpbicgfSxcblx0XHRcdFx0XHRdLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHR9KTtcblxuXHRcdGF3YWl0IGNvbnRyb2xsZXIucmVtb3ZlQ29uZmlndXJlZFBsdWdpbihwbHVnaW5BKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29ubmVjdGlvbi5kaXNwYXRjaGVkQWN0aW9ucywgW3tcblx0XHRcdGNoYW5uZWw6ICdhaHAtcm9vdDovLycsXG5cdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5Sb290Q29uZmlnQ2hhbmdlZCxcblx0XHRcdFx0Y29uZmlnOiB7XG5cdFx0XHRcdFx0Y3VzdG9taXphdGlvbnM6IFt7IHVyaTogJ2ZpbGU6Ly8vcGx1Z2lucy9vdGhlcicsIGRpc3BsYXlOYW1lOiAnT3RoZXIgUGx1Z2luJyB9XSxcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0fV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdwcm92aWRlciBhc3NpZ25zIGRpc3RpbmN0IGl0ZW0ga2V5cyB0byBwbHVnaW5zIHdpdGggZGlmZmVyZW50IFVSSXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY29ubmVjdGlvbiA9IGRpc3Bvc2FibGVzLmFkZChuZXcgTW9ja0FnZW50Q29ubmVjdGlvbigpKTtcblx0XHRjb25zdCBwbHVnaW5BOiBDdXN0b21pemF0aW9uID0geyB0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5QbHVnaW4sIGlkOiAnZmlsZTovLy9wbHVnaW5zL2EnLCB1cmk6ICdmaWxlOi8vL3BsdWdpbnMvYScsIG5hbWU6ICdQbHVnaW4gQScsIH07XG5cdFx0Y29uc3QgcGx1Z2luQjogQ3VzdG9taXphdGlvbiA9IHsgdHlwZTogQ3VzdG9taXphdGlvblR5cGUuUGx1Z2luLCBpZDogJ2ZpbGU6Ly8vcGx1Z2lucy9iJywgdXJpOiAnZmlsZTovLy9wbHVnaW5zL2InLCBuYW1lOiAnUGx1Z2luIEInLCB9O1xuXG5cdFx0Y29ubmVjdGlvbi5zZXRSb290U3RhdGUoe1xuXHRcdFx0YWdlbnRzOiBbY3JlYXRlQWdlbnRJbmZvKFtwbHVnaW5BLCBwbHVnaW5CXSldLFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgZmlsZVNlcnZpY2UgPSBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElGaWxlU2VydmljZT4oKSB7XG5cdFx0XHRvdmVycmlkZSBhc3luYyBjYW5IYW5kbGVSZXNvdXJjZSgpIHsgcmV0dXJuIGZhbHNlOyB9XG5cdFx0XHRvdmVycmlkZSBhc3luYyByZXNvbHZlQWxsKCkgeyByZXR1cm4gW107IH1cblx0XHR9O1xuXG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50Q3VzdG9taXphdGlvbkl0ZW1Qcm92aWRlcihcblx0XHRcdCd0ZXN0LWF1dGhvcml0eScsXG5cdFx0XHQoKSA9PiB7IH0sXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRmaWxlU2VydmljZSxcblx0XHRcdG5ldyBOdWxsTG9nU2VydmljZSgpLFxuXHRcdFx0Y3JlYXRlVGVzdEN1c3RvbUFnZW50c1NlcnZpY2UoY29ubmVjdGlvbiwgW3BsdWdpbkEsIHBsdWdpbkJdKSxcblx0XHQpKTtcblxuXHRcdGNvbnN0IGl0ZW1zID0gYXdhaXQgcHJvdmlkZXIucHJvdmlkZUNoYXRTZXNzaW9uQ3VzdG9taXphdGlvbnModGVzdFNlc3Npb25SZXNvdXJjZSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGl0ZW1zLmxlbmd0aCwgMik7XG5cdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKGl0ZW1zWzBdLml0ZW1LZXksIGl0ZW1zWzFdLml0ZW1LZXkpO1xuXHR9KTtcblxuXHR0ZXN0KCdwcm92aWRlciB1c2VzIGRyYWZ0IGFnZW50cyBiZWZvcmUgc2Vzc2lvbiBjdXN0b21pemF0aW9ucyBoeWRyYXRlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbm5lY3Rpb24gPSBkaXNwb3NhYmxlcy5hZGQobmV3IE1vY2tBZ2VudENvbm5lY3Rpb24oKSk7XG5cdFx0Y29uc3QgZmlsZVNlcnZpY2UgPSBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElGaWxlU2VydmljZT4oKSB7IH07XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50Q3VzdG9taXphdGlvbkl0ZW1Qcm92aWRlcihcblx0XHRcdCd0ZXN0LWF1dGhvcml0eScsXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRmaWxlU2VydmljZSxcblx0XHRcdG5ldyBOdWxsTG9nU2VydmljZSgpLFxuXHRcdFx0Y3JlYXRlVGVzdEN1c3RvbUFnZW50c1NlcnZpY2UoY29ubmVjdGlvbiwgW10pLFxuXHRcdCkpO1xuXHRcdHByb3ZpZGVyLnNldERyYWZ0Q3VzdG9tQWdlbnRzKG9ic2VydmFibGVWYWx1ZTxyZWFkb25seSBBZ2VudEN1c3RvbWl6YXRpb25bXT4oJ2RyYWZ0QWdlbnRzJywgW3tcblx0XHRcdHR5cGU6IEN1c3RvbWl6YXRpb25UeXBlLkFnZW50LFxuXHRcdFx0aWQ6ICdmaWxlOi8vL3dvcmtzcGFjZS8uZ2l0aHViL2FnZW50cy9yZXZpZXdlci5hZ2VudC5tZCcsXG5cdFx0XHR1cmk6ICdmaWxlOi8vL3dvcmtzcGFjZS8uZ2l0aHViL2FnZW50cy9yZXZpZXdlci5hZ2VudC5tZCcsXG5cdFx0XHRuYW1lOiAnUmV2aWV3ZXInLFxuXHRcdFx0ZGVzY3JpcHRpb246ICdSZXZpZXcgd29ya3NwYWNlIGNoYW5nZXMnLFxuXHRcdH1dKSk7XG5cblx0XHRjb25zdCBhZ2VudHMgPSBhd2FpdCBwcm92aWRlci5wcm92aWRlQ3VzdG9tQWdlbnRzKHRlc3RTZXNzaW9uUmVzb3VyY2UpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhZ2VudHMubWFwKGFnZW50ID0+ICh7IG5hbWU6IGFnZW50Lm5hbWUsIGRlc2NyaXB0aW9uOiBhZ2VudC5kZXNjcmlwdGlvbiB9KSksIFt7XG5cdFx0XHRuYW1lOiAnUmV2aWV3ZXInLFxuXHRcdFx0ZGVzY3JpcHRpb246ICdSZXZpZXcgd29ya3NwYWNlIGNoYW5nZXMnLFxuXHRcdH1dKTtcblx0fSk7XG5cblx0dGVzdCgncHJvdmlkZXIga2VlcHMgY2xpZW50LXN5bmNlZCBlbnRyaWVzIGRpc3RpbmN0IGZyb20gaG9zdC1vd25lZCBlbnRyaWVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbm5lY3Rpb24gPSBkaXNwb3NhYmxlcy5hZGQobmV3IE1vY2tBZ2VudENvbm5lY3Rpb24oKSk7XG5cdFx0Y29uc3QgaG9zdFNjb3BlZDogQ3VzdG9taXphdGlvbiA9IHsgdHlwZTogQ3VzdG9taXphdGlvblR5cGUuUGx1Z2luLCBpZDogJ2ZpbGU6Ly8vcGx1Z2lucy9zaGFyZWQnLCB1cmk6ICdmaWxlOi8vL3BsdWdpbnMvc2hhcmVkJywgbmFtZTogJ1NoYXJlZCBQbHVnaW4nLCB9O1xuXHRcdGNvbnN0IHN5bmNlZDogQ3VzdG9taXphdGlvbiA9IHtcblx0XHRcdC4uLmhvc3RTY29wZWQsXG5cdFx0XHRjbGllbnRJZDogJ3Rlc3QtY2xpZW50Jyxcblx0XHR9O1xuXG5cdFx0Y29ubmVjdGlvbi5zZXRSb290U3RhdGUoe1xuXHRcdFx0YWdlbnRzOiBbY3JlYXRlQWdlbnRJbmZvKFtob3N0U2NvcGVkXSldLFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgZmlsZVNlcnZpY2UgPSBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElGaWxlU2VydmljZT4oKSB7XG5cdFx0XHRvdmVycmlkZSBhc3luYyBjYW5IYW5kbGVSZXNvdXJjZSgpIHsgcmV0dXJuIGZhbHNlOyB9XG5cdFx0XHRvdmVycmlkZSBhc3luYyByZXNvbHZlQWxsKCkgeyByZXR1cm4gW107IH1cblx0XHR9O1xuXG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50Q3VzdG9taXphdGlvbkl0ZW1Qcm92aWRlcihcblx0XHRcdCd0ZXN0LWF1dGhvcml0eScsXG5cdFx0XHQoKSA9PiB7IH0sXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRmaWxlU2VydmljZSxcblx0XHRcdG5ldyBOdWxsTG9nU2VydmljZSgpLFxuXHRcdFx0Y3JlYXRlVGVzdEN1c3RvbUFnZW50c1NlcnZpY2UoY29ubmVjdGlvbiwgW2hvc3RTY29wZWRdKSxcblx0XHQpKTtcblxuXHRcdGNvbm5lY3Rpb24uZmlyZUFjdGlvbih7XG5cdFx0XHRjaGFubmVsOiBhZ2VudEhvc3RTZXNzaW9uSWQsXG5cdFx0XHRzZXJ2ZXJTZXE6IDEsXG5cdFx0XHRvcmlnaW46IHVuZGVmaW5lZCxcblx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25DdXN0b21pemF0aW9uc0NoYW5nZWQsXG5cdFx0XHRcdGN1c3RvbWl6YXRpb25zOiBbc3luY2VkXSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cblx0XHRjb25zdCBpdGVtcyA9IGF3YWl0IHByb3ZpZGVyLnByb3ZpZGVDaGF0U2Vzc2lvbkN1c3RvbWl6YXRpb25zKHRlc3RTZXNzaW9uUmVzb3VyY2UsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpdGVtcy5sZW5ndGgsIDIpO1xuXHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbChpdGVtc1swXS5pdGVtS2V5LCBpdGVtc1sxXS5pdGVtS2V5KTtcblx0fSk7XG5cblx0dGVzdCgncHJvdmlkZXIgYXNzaWducyBjbGllbnQgZ3JvdXAgdG8gY2xpZW50LXN5bmNlZCBlbnRyaWVzIGFuZCBob3N0IGdyb3VwIHRvIGhvc3QgZW50cmllcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjb25uZWN0aW9uID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBNb2NrQWdlbnRDb25uZWN0aW9uKCkpO1xuXHRcdGNvbnN0IGhvc3RQbHVnaW46IEN1c3RvbWl6YXRpb24gPSB7IHR5cGU6IEN1c3RvbWl6YXRpb25UeXBlLlBsdWdpbiwgaWQ6ICdmaWxlOi8vL3BsdWdpbnMvaG9zdC1wbHVnaW4nLCB1cmk6ICdmaWxlOi8vL3BsdWdpbnMvaG9zdC1wbHVnaW4nLCBuYW1lOiAnSG9zdCBQbHVnaW4nLCB9O1xuXHRcdGNvbnN0IGNsaWVudFBsdWdpbjogQ3VzdG9taXphdGlvbiA9IHsgdHlwZTogQ3VzdG9taXphdGlvblR5cGUuUGx1Z2luLCBpZDogJ2ZpbGU6Ly8vcGx1Z2lucy9jbGllbnQtcGx1Z2luJywgdXJpOiAnZmlsZTovLy9wbHVnaW5zL2NsaWVudC1wbHVnaW4nLCBuYW1lOiAnQ2xpZW50IFBsdWdpbicsIH07XG5cdFx0Y29uc3Qgc3luY2VkOiBDdXN0b21pemF0aW9uID0ge1xuXHRcdFx0Li4uY2xpZW50UGx1Z2luLFxuXHRcdFx0Y2xpZW50SWQ6ICd0ZXN0LWNsaWVudCcsXG5cdFx0fTtcblxuXHRcdGNvbm5lY3Rpb24uc2V0Um9vdFN0YXRlKHtcblx0XHRcdGFnZW50czogW2NyZWF0ZUFnZW50SW5mbyhbaG9zdFBsdWdpbl0pXSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJRmlsZVNlcnZpY2U+KCkge1xuXHRcdFx0b3ZlcnJpZGUgYXN5bmMgY2FuSGFuZGxlUmVzb3VyY2UoKSB7IHJldHVybiBmYWxzZTsgfVxuXHRcdFx0b3ZlcnJpZGUgYXN5bmMgcmVzb2x2ZUFsbCgpIHsgcmV0dXJuIFtdOyB9XG5cdFx0fTtcblxuXHRcdGNvbnN0IHByb3ZpZGVyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEN1c3RvbWl6YXRpb25JdGVtUHJvdmlkZXIoXG5cdFx0XHQndGVzdC1hdXRob3JpdHknLFxuXHRcdFx0KCkgPT4geyB9LFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0ZmlsZVNlcnZpY2UsXG5cdFx0XHRuZXcgTnVsbExvZ1NlcnZpY2UoKSxcblx0XHRcdGNyZWF0ZVRlc3RDdXN0b21BZ2VudHNTZXJ2aWNlKGNvbm5lY3Rpb24sIFtob3N0UGx1Z2luXSksXG5cdFx0KSk7XG5cblx0XHRjb25uZWN0aW9uLmZpcmVBY3Rpb24oe1xuXHRcdFx0Y2hhbm5lbDogYWdlbnRIb3N0U2Vzc2lvbklkLFxuXHRcdFx0c2VydmVyU2VxOiAxLFxuXHRcdFx0b3JpZ2luOiB1bmRlZmluZWQsXG5cdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uQ3VzdG9taXphdGlvbnNDaGFuZ2VkLFxuXHRcdFx0XHRjdXN0b21pemF0aW9uczogW3N5bmNlZF0sXG5cdFx0XHR9LFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgaXRlbXMgPSBhd2FpdCBwcm92aWRlci5wcm92aWRlQ2hhdFNlc3Npb25DdXN0b21pemF0aW9ucyh0ZXN0U2Vzc2lvblJlc291cmNlLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXRlbXMubGVuZ3RoLCAyKTtcblxuXHRcdGNvbnN0IGhvc3RJdGVtID0gaXRlbXMuZmluZChpID0+IGkubmFtZSA9PT0gJ0hvc3QgUGx1Z2luJyk7XG5cdFx0Y29uc3QgY2xpZW50SXRlbSA9IGl0ZW1zLmZpbmQoaSA9PiBpLm5hbWUgPT09ICdDbGllbnQgUGx1Z2luJyk7XG5cdFx0YXNzZXJ0Lm9rKGhvc3RJdGVtLCAnc2hvdWxkIGhhdmUgYSBob3N0IGl0ZW0nKTtcblx0XHRhc3NlcnQub2soY2xpZW50SXRlbSwgJ3Nob3VsZCBoYXZlIGEgY2xpZW50IGl0ZW0nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaG9zdEl0ZW0uZ3JvdXBLZXksICdyZW1vdGUtaG9zdCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjbGllbnRJdGVtLmdyb3VwS2V5LCAncmVtb3RlLWNsaWVudCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdwcm92aWRlciBoaWRlcyBzeW50aGV0aWMgYnVuZGxlIGJ1dCBzdGlsbCBleHBhbmRzIGl0cyBjb250ZW50cycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjb25uZWN0aW9uID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBNb2NrQWdlbnRDb25uZWN0aW9uKCkpO1xuXG5cdFx0Y29uc3QgYnVuZGxlVXJpID0gYCR7U1lOQ0VEX0NVU1RPTUlaQVRJT05fU0NIRU1FfTovLy90ZXN0LWF1dGhvcml0eWA7XG5cdFx0Y29uc3QgYnVuZGxlUmVmOiBDdXN0b21pemF0aW9uID0geyB0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5QbHVnaW4sIGlkOiBidW5kbGVVcmksIHVyaTogYnVuZGxlVXJpLCBuYW1lOiAnVlMgQ29kZSBTeW5jZWQgRGF0YScsIGxvYWQ6IHsga2luZDogQ3VzdG9taXphdGlvbkxvYWRTdGF0dXMuTG9hZGVkIH0gfTtcblx0XHRjb25zdCBzeW5jZWQ6IEN1c3RvbWl6YXRpb24gPSB7XG5cdFx0XHQuLi5idW5kbGVSZWYsXG5cdFx0XHRjbGllbnRJZDogJ3Rlc3QtY2xpZW50Jyxcblx0XHR9O1xuXG5cdFx0Y29ubmVjdGlvbi5zZXRSb290U3RhdGUoeyBhZ2VudHM6IFtjcmVhdGVBZ2VudEluZm8oW10pXSB9KTtcblxuXHRcdC8vIE1vY2sgZmlsZSBzZXJ2aWNlIHRoYXQgcmV0dXJucyBhIHNraWxscyBkaXJlY3Rvcnkgd2l0aCBvbmUgY2hpbGRcblx0XHRjb25zdCBza2lsbEZpbGVVcmkgPSBVUkkucGFyc2UoYCR7YnVuZGxlVXJpfS9za2lsbHMvbXktc2tpbGxgKTtcblx0XHRjb25zdCBmaWxlU2VydmljZSA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUZpbGVTZXJ2aWNlPigpIHtcblx0XHRcdG92ZXJyaWRlIGFzeW5jIGNhbkhhbmRsZVJlc291cmNlKCkgeyByZXR1cm4gdHJ1ZTsgfVxuXHRcdFx0b3ZlcnJpZGUgYXN5bmMgcmVzb2x2ZUFsbChyZXNvdXJjZXM6IHsgcmVzb3VyY2U6IFVSSSB9W10pOiBQcm9taXNlPElGaWxlU3RhdFJlc3VsdFtdPiB7XG5cdFx0XHRcdHJldHVybiByZXNvdXJjZXMubWFwKHIgPT4ge1xuXHRcdFx0XHRcdGlmIChyLnJlc291cmNlLnBhdGguZW5kc1dpdGgoJy9za2lsbHMnKSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdFx0c3VjY2VzczogdHJ1ZSxcblx0XHRcdFx0XHRcdFx0c3RhdDoge1xuXHRcdFx0XHRcdFx0XHRcdHJlc291cmNlOiByLnJlc291cmNlLFxuXHRcdFx0XHRcdFx0XHRcdG5hbWU6ICdza2lsbHMnLFxuXHRcdFx0XHRcdFx0XHRcdGlzRmlsZTogZmFsc2UsXG5cdFx0XHRcdFx0XHRcdFx0aXNEaXJlY3Rvcnk6IHRydWUsXG5cdFx0XHRcdFx0XHRcdFx0aXNTeW1ib2xpY0xpbms6IGZhbHNlLFxuXHRcdFx0XHRcdFx0XHRcdHJlYWRvbmx5OiBmYWxzZSxcblx0XHRcdFx0XHRcdFx0XHRtdGltZTogMCxcblx0XHRcdFx0XHRcdFx0XHRjdGltZTogMCxcblx0XHRcdFx0XHRcdFx0XHRzaXplOiAwLFxuXHRcdFx0XHRcdFx0XHRcdGNoaWxkcmVuOiBbe1xuXHRcdFx0XHRcdFx0XHRcdFx0bmFtZTogJ215LXNraWxsJyxcblx0XHRcdFx0XHRcdFx0XHRcdHJlc291cmNlOiBza2lsbEZpbGVVcmksXG5cdFx0XHRcdFx0XHRcdFx0XHRpc0ZpbGU6IGZhbHNlLFxuXHRcdFx0XHRcdFx0XHRcdFx0aXNEaXJlY3Rvcnk6IHRydWUsXG5cdFx0XHRcdFx0XHRcdFx0XHRpc1N5bWJvbGljTGluazogZmFsc2UsXG5cdFx0XHRcdFx0XHRcdFx0XHRyZWFkb25seTogZmFsc2UsXG5cdFx0XHRcdFx0XHRcdFx0XHRtdGltZTogMCxcblx0XHRcdFx0XHRcdFx0XHRcdGN0aW1lOiAwLFxuXHRcdFx0XHRcdFx0XHRcdFx0c2l6ZTogMCxcblx0XHRcdFx0XHRcdFx0XHRcdGNoaWxkcmVuOiBbXSxcblx0XHRcdFx0XHRcdFx0XHR9XSxcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdH0gc2F0aXNmaWVzIElGaWxlU3RhdFJlc3VsdDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIHN0YXQ6IHVuZGVmaW5lZCB9IGFzIHVua25vd24gYXMgSUZpbGVTdGF0UmVzdWx0O1xuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHRcdG92ZXJyaWRlIGFzeW5jIHJlYWRGaWxlKHJlc291cmNlOiBVUkkpOiBQcm9taXNlPElGaWxlQ29udGVudD4ge1xuXHRcdFx0XHRpZiAocmVzb3VyY2UucGF0aC5lbmRzV2l0aCgnL215LXNraWxsL1NLSUxMLm1kJykpIHtcblx0XHRcdFx0XHRjb25zdCBjb250ZW50ID0gJy0tLVxcbi0tLVxcbic7XG5cdFx0XHRcdFx0cmV0dXJuIHsgcmVzb3VyY2UsIG5hbWU6ICdTS0lMTC5tZCcsIHZhbHVlOiBWU0J1ZmZlci5mcm9tU3RyaW5nKGNvbnRlbnQpLCBtdGltZTogMCwgY3RpbWU6IDAsIGV0YWc6ICcnLCBzaXplOiBjb250ZW50Lmxlbmd0aCwgcmVhZG9ubHk6IGZhbHNlLCBsb2NrZWQ6IGZhbHNlLCBleGVjdXRhYmxlOiBmYWxzZSB9O1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcignRU5PRU5UJyk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGNvbnN0IHByb3ZpZGVyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEN1c3RvbWl6YXRpb25JdGVtUHJvdmlkZXIoXG5cdFx0XHQndGVzdC1hdXRob3JpdHknLFxuXHRcdFx0KCkgPT4geyB9LFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0ZmlsZVNlcnZpY2UsXG5cdFx0XHRuZXcgTnVsbExvZ1NlcnZpY2UoKSxcblx0XHRcdGNyZWF0ZVRlc3RDdXN0b21BZ2VudHNTZXJ2aWNlKGNvbm5lY3Rpb24sIFtdKSxcblx0XHQpKTtcblxuXHRcdGNvbm5lY3Rpb24uZmlyZUFjdGlvbih7XG5cdFx0XHRjaGFubmVsOiBhZ2VudEhvc3RTZXNzaW9uSWQsXG5cdFx0XHRzZXJ2ZXJTZXE6IDEsXG5cdFx0XHRvcmlnaW46IHVuZGVmaW5lZCxcblx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25DdXN0b21pemF0aW9uc0NoYW5nZWQsXG5cdFx0XHRcdGN1c3RvbWl6YXRpb25zOiBbc3luY2VkXSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cblx0XHRjb25zdCBpdGVtcyA9IGF3YWl0IHByb3ZpZGVyLnByb3ZpZGVDaGF0U2Vzc2lvbkN1c3RvbWl6YXRpb25zKHRlc3RTZXNzaW9uUmVzb3VyY2UsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdC8vIFRoZSBzeW50aGV0aWMgYnVuZGxlIGl0c2VsZiBzaG91bGQgTk9UIGFwcGVhciBhcyBhIHRvcC1sZXZlbCBpdGVtXG5cdFx0YXNzZXJ0Lm9rKCFpdGVtcy5zb21lKGkgPT4gaS5uYW1lID09PSAnVlMgQ29kZSBTeW5jZWQgRGF0YScpLCAnc3ludGhldGljIGJ1bmRsZSBzaG91bGQgYmUgaGlkZGVuJyk7XG5cdFx0Ly8gQnV0IGl0cyBleHBhbmRlZCBjaGlsZCBzaG91bGQgYXBwZWFyXG5cdFx0Y29uc3Qgc2tpbGxJdGVtID0gaXRlbXMuZmluZChpID0+IGkubmFtZSA9PT0gJ215LXNraWxsJyk7XG5cdFx0YXNzZXJ0Lm9rKHNraWxsSXRlbSwgJ2V4cGFuZGVkIHNraWxsIGZyb20gYnVuZGxlIHNob3VsZCBiZSBwcmVzZW50Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNraWxsSXRlbS5ncm91cEtleSwgJ3JlbW90ZS1jbGllbnQnLCAnZXhwYW5kZWQgY2hpbGRyZW4gZnJvbSBidW5kbGUgc2hvdWxkIGJlIGluIGNsaWVudCBncm91cCcpO1xuXHR9KTtcblxuXHR0ZXN0KCd0b1JlbW90ZVVyaSBwcmVzZXJ2ZXMgc3luY2VkLWN1c3RvbWl6YXRpb24gc2NoZW1lIFVSSXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY29ubmVjdGlvbiA9IGRpc3Bvc2FibGVzLmFkZChuZXcgTW9ja0FnZW50Q29ubmVjdGlvbigpKTtcblxuXHRcdGNvbnN0IGJ1bmRsZVVyaSA9IGAke1NZTkNFRF9DVVNUT01JWkFUSU9OX1NDSEVNRX06Ly8vdGVzdC1hdXRob3JpdHlgO1xuXHRcdGNvbnN0IGJ1bmRsZVJlZjogQ3VzdG9taXphdGlvbiA9IHsgdHlwZTogQ3VzdG9taXphdGlvblR5cGUuUGx1Z2luLCBpZDogYnVuZGxlVXJpLCB1cmk6IGJ1bmRsZVVyaSwgbmFtZTogJ1ZTIENvZGUgU3luY2VkIERhdGEnLCB9O1xuXHRcdGNvbnN0IHN5bmNlZDogQ3VzdG9taXphdGlvbiA9IHtcblx0XHRcdC4uLmJ1bmRsZVJlZixcblx0XHRcdGNsaWVudElkOiAndGVzdC1jbGllbnQnLFxuXHRcdH07XG5cblx0XHRjb25uZWN0aW9uLnNldFJvb3RTdGF0ZSh7IGFnZW50czogW2NyZWF0ZUFnZW50SW5mbyhbXSldIH0pO1xuXG5cdFx0Y29uc3QgZmlsZVNlcnZpY2UgPSBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElGaWxlU2VydmljZT4oKSB7XG5cdFx0XHRvdmVycmlkZSBhc3luYyBjYW5IYW5kbGVSZXNvdXJjZSgpIHsgcmV0dXJuIGZhbHNlOyB9XG5cdFx0XHRvdmVycmlkZSBhc3luYyByZXNvbHZlQWxsKCkgeyByZXR1cm4gW107IH1cblx0XHR9O1xuXG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50Q3VzdG9taXphdGlvbkl0ZW1Qcm92aWRlcihcblx0XHRcdCd0ZXN0LWF1dGhvcml0eScsXG5cdFx0XHQoKSA9PiB7IH0sXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRmaWxlU2VydmljZSxcblx0XHRcdG5ldyBOdWxsTG9nU2VydmljZSgpLFxuXHRcdFx0Y3JlYXRlVGVzdEN1c3RvbUFnZW50c1NlcnZpY2UoY29ubmVjdGlvbiwgW10pLFxuXHRcdCkpO1xuXG5cdFx0Y29ubmVjdGlvbi5maXJlQWN0aW9uKHtcblx0XHRcdGNoYW5uZWw6IGFnZW50SG9zdFNlc3Npb25JZCxcblx0XHRcdHNlcnZlclNlcTogMSxcblx0XHRcdG9yaWdpbjogdW5kZWZpbmVkLFxuXHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbkN1c3RvbWl6YXRpb25zQ2hhbmdlZCxcblx0XHRcdFx0Y3VzdG9taXphdGlvbnM6IFtzeW5jZWRdLFxuXHRcdFx0fSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IGl0ZW1zID0gYXdhaXQgcHJvdmlkZXIucHJvdmlkZUNoYXRTZXNzaW9uQ3VzdG9taXphdGlvbnModGVzdFNlc3Npb25SZXNvdXJjZSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0Ly8gTm8gdG9wLWxldmVsIGl0ZW0gKGJ1bmRsZSBpcyBoaWRkZW4pLCBidXQgY2hlY2sgdGhhdCBwbHVnaW4gZXhwYW5zaW9uXG5cdFx0Ly8gYXR0ZW1wdGVkIHdpdGggdGhlIG9yaWdpbmFsIHNjaGVtZSBcdTIwMTQgbm90IGFnZW50LWhvc3Q6Ly9cblx0XHQvLyBUaGlzIGlzIHZlcmlmaWVkIGluZGlyZWN0bHk6IGNhbkhhbmRsZVJlc291cmNlIHJldHVybnMgZmFsc2Ugc29cblx0XHQvLyBubyBjaGlsZHJlbiBhcmUgcHJvZHVjZWQsIGJ1dCBpbXBvcnRhbnRseSBubyBjcmFzaCBvY2N1cnJlZFxuXHRcdC8vICh0b0FnZW50SG9zdFVyaSB3b3VsZCB0aHJvdyBmb3IgdGhpcyBzY2hlbWUpLlxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpdGVtcy5sZW5ndGgsIDApO1xuXHR9KTtcblxuXHR0ZXN0KCdwcm92aWRlciBwcm9wYWdhdGVzIHN0YXR1cyBhbmQgZW5hYmxlZCBmcm9tIHNlc3Npb24gY3VzdG9taXphdGlvbnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY29ubmVjdGlvbiA9IGRpc3Bvc2FibGVzLmFkZChuZXcgTW9ja0FnZW50Q29ubmVjdGlvbigpKTtcblxuXHRcdGNvbnN0IHBsdWdpblJlZjogQ3VzdG9taXphdGlvbiA9IHsgdHlwZTogQ3VzdG9taXphdGlvblR5cGUuUGx1Z2luLCBpZDogJ2ZpbGU6Ly8vcGx1Z2lucy9teS1wbHVnaW4nLCB1cmk6ICdmaWxlOi8vL3BsdWdpbnMvbXktcGx1Z2luJywgbmFtZTogJ015IFBsdWdpbicsIH07XG5cdFx0Y29uc3Qgc2Vzc2lvbkN1c3RvbWl6YXRpb246IEN1c3RvbWl6YXRpb24gPSB7XG5cdFx0XHQuLi5wbHVnaW5SZWYsXG5cdFx0XHQvLyBUT0RPOiBTdGVwIDIgc2VsZWN0cyB0aGUgcGVyc2lzdGVkIGVuYWJsZW1lbnQgc2NvcGUuXG5cdFx0XHRlbmFibGVtZW50OiBbeyBraW5kOiBDdXN0b21pemF0aW9uRW5hYmxlbWVudEtpbmQuR2xvYmFsLCBlbmFibGVkOiBmYWxzZSB9XSxcblx0XHRcdGxvYWQ6IHsga2luZDogQ3VzdG9taXphdGlvbkxvYWRTdGF0dXMuRXJyb3IsIG1lc3NhZ2U6ICdzb21ldGhpbmcgd2VudCB3cm9uZycgfSxcblx0XHR9O1xuXG5cdFx0Y29ubmVjdGlvbi5zZXRSb290U3RhdGUoeyBhZ2VudHM6IFtjcmVhdGVBZ2VudEluZm8oW3BsdWdpblJlZl0pXSB9KTtcblxuXHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJRmlsZVNlcnZpY2U+KCkge1xuXHRcdFx0b3ZlcnJpZGUgYXN5bmMgY2FuSGFuZGxlUmVzb3VyY2UoKSB7IHJldHVybiBmYWxzZTsgfVxuXHRcdFx0b3ZlcnJpZGUgYXN5bmMgcmVzb2x2ZUFsbCgpIHsgcmV0dXJuIFtdOyB9XG5cdFx0fTtcblxuXHRcdGNvbnN0IHByb3ZpZGVyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEN1c3RvbWl6YXRpb25JdGVtUHJvdmlkZXIoXG5cdFx0XHQndGVzdC1hdXRob3JpdHknLFxuXHRcdFx0KCkgPT4geyB9LFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0ZmlsZVNlcnZpY2UsXG5cdFx0XHRuZXcgTnVsbExvZ1NlcnZpY2UoKSxcblx0XHRcdGNyZWF0ZVRlc3RDdXN0b21BZ2VudHNTZXJ2aWNlKGNvbm5lY3Rpb24sIFtwbHVnaW5SZWZdKSxcblx0XHQpKTtcblxuXHRcdGNvbm5lY3Rpb24uZmlyZUFjdGlvbih7XG5cdFx0XHRjaGFubmVsOiBhZ2VudEhvc3RTZXNzaW9uSWQsXG5cdFx0XHRzZXJ2ZXJTZXE6IDEsXG5cdFx0XHRvcmlnaW46IHVuZGVmaW5lZCxcblx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25DdXN0b21pemF0aW9uc0NoYW5nZWQsXG5cdFx0XHRcdGN1c3RvbWl6YXRpb25zOiBbc2Vzc2lvbkN1c3RvbWl6YXRpb25dLFxuXHRcdFx0fSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IGl0ZW1zID0gYXdhaXQgcHJvdmlkZXIucHJvdmlkZUNoYXRTZXNzaW9uQ3VzdG9taXphdGlvbnModGVzdFNlc3Npb25SZXNvdXJjZSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0Ly8gSG9zdC1zY29wZWQgcGx1Z2luIGZyb20gcm9vdCArIHNlc3Npb24gY3VzdG9taXphdGlvbiBcdTIxOTIgbWVyZ2VkIGludG8gb25lIGVudHJ5XG5cdFx0Ly8gVGhlIHNlc3Npb24gY3VzdG9taXphdGlvbiBlbnRyeSB1cGRhdGVzIHN0YXR1cy9zdGF0dXNNZXNzYWdlXG5cdFx0Y29uc3Qgc2Vzc2lvbkl0ZW0gPSBpdGVtcy5maW5kKGkgPT4gaS5zdGF0dXMgPT09ICdlcnJvcicpO1xuXHRcdGFzc2VydC5vayhzZXNzaW9uSXRlbSwgJ3Nob3VsZCBoYXZlIGFuIGl0ZW0gd2l0aCBlcnJvciBzdGF0dXMnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbkl0ZW0uc3RhdHVzTWVzc2FnZSwgJ3NvbWV0aGluZyB3ZW50IHdyb25nJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Byb3ZpZGVyIGZpcmVzIG9uZSBjaGFuZ2UgZXZlbnQgb24gU2Vzc2lvbkN1c3RvbWl6YXRpb25zQ2hhbmdlZCBhY3Rpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY29ubmVjdGlvbiA9IGRpc3Bvc2FibGVzLmFkZChuZXcgTW9ja0FnZW50Q29ubmVjdGlvbigpKTtcblxuXHRcdGNvbnN0IHBsdWdpblJlZjogQ3VzdG9taXphdGlvbiA9IHsgdHlwZTogQ3VzdG9taXphdGlvblR5cGUuUGx1Z2luLCBpZDogJ2ZpbGU6Ly8vcGx1Z2lucy9ob3N0JywgdXJpOiAnZmlsZTovLy9wbHVnaW5zL2hvc3QnLCBuYW1lOiAnSG9zdCBQbHVnaW4nLCB9O1xuXHRcdGNvbm5lY3Rpb24uc2V0Um9vdFN0YXRlKHsgYWdlbnRzOiBbY3JlYXRlQWdlbnRJbmZvKFtwbHVnaW5SZWZdKV0gfSk7XG5cblx0XHRjb25zdCBmaWxlU2VydmljZSA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUZpbGVTZXJ2aWNlPigpIHtcblx0XHRcdG92ZXJyaWRlIGFzeW5jIGNhbkhhbmRsZVJlc291cmNlKCkgeyByZXR1cm4gZmFsc2U7IH1cblx0XHRcdG92ZXJyaWRlIGFzeW5jIHJlc29sdmVBbGwoKSB7IHJldHVybiBbXTsgfVxuXHRcdH07XG5cblx0XHRjb25zdCBwcm92aWRlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRDdXN0b21pemF0aW9uSXRlbVByb3ZpZGVyKFxuXHRcdFx0J3Rlc3QtYXV0aG9yaXR5Jyxcblx0XHRcdCgpID0+IHsgfSxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdGZpbGVTZXJ2aWNlLFxuXHRcdFx0bmV3IE51bGxMb2dTZXJ2aWNlKCksXG5cdFx0XHRjcmVhdGVUZXN0Q3VzdG9tQWdlbnRzU2VydmljZShjb25uZWN0aW9uLCBbcGx1Z2luUmVmXSksXG5cdFx0KSk7XG5cblx0XHRsZXQgY2hhbmdlQ291bnQgPSAwO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChwcm92aWRlci5vbkRpZENoYW5nZSgoKSA9PiBjaGFuZ2VDb3VudCsrKSk7XG5cblx0XHRjb25uZWN0aW9uLmZpcmVBY3Rpb24oe1xuXHRcdFx0Y2hhbm5lbDogYWdlbnRIb3N0U2Vzc2lvbklkLFxuXHRcdFx0c2VydmVyU2VxOiAxLFxuXHRcdFx0b3JpZ2luOiB1bmRlZmluZWQsXG5cdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uQ3VzdG9taXphdGlvbnNDaGFuZ2VkLFxuXHRcdFx0XHRjdXN0b21pemF0aW9uczogW3BsdWdpblJlZl0sXG5cdFx0XHR9LFxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNoYW5nZUNvdW50LCAxLCAnc2hvdWxkIGZpcmUgb25lIGNoYW5nZSBldmVudCBmcm9tIGN1c3RvbWl6YXRpb24gc2VydmljZScpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZW1vdmVDb25maWd1cmVkUGx1Z2luIGRpc3BhdGNoZXMgdXBkYXRlZCBsaXN0IHdpdGhvdXQgdGhlIHJlbW92ZWQgcGx1Z2luJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbm5lY3Rpb24gPSBkaXNwb3NhYmxlcy5hZGQobmV3IE1vY2tBZ2VudENvbm5lY3Rpb24oKSk7XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgUmVtb3RlQWdlbnRQbHVnaW5Db250cm9sbGVyKFxuXHRcdFx0J1Rlc3QgSG9zdCcsXG5cdFx0XHQndGVzdC1hdXRob3JpdHknLFxuXHRcdFx0Y29ubmVjdGlvbixcblx0XHRcdHt9IGFzIElGaWxlRGlhbG9nU2VydmljZSxcblx0XHRcdGNyZWF0ZU5vdGlmaWNhdGlvblNlcnZpY2UoKSxcblx0XHRcdHt9IGFzIElBSUN1c3RvbWl6YXRpb25Xb3Jrc3BhY2VTZXJ2aWNlLFxuXHRcdCkpO1xuXG5cdFx0Y29uc3QgcGx1Z2luQjogQ3VzdG9taXphdGlvbiA9IHsgdHlwZTogQ3VzdG9taXphdGlvblR5cGUuUGx1Z2luLCBpZDogJ2ZpbGU6Ly8vcGx1Z2lucy9iJywgdXJpOiAnZmlsZTovLy9wbHVnaW5zL2InLCBuYW1lOiAnUGx1Z2luIEInLCB9O1xuXG5cdFx0Y29ubmVjdGlvbi5zZXRSb290U3RhdGUoe1xuXHRcdFx0YWdlbnRzOiBbXSxcblx0XHRcdGNvbmZpZzoge1xuXHRcdFx0XHRzY2hlbWE6IHsgdHlwZTogJ29iamVjdCcsIHByb3BlcnRpZXM6IHt9IH0sXG5cdFx0XHRcdHZhbHVlczoge1xuXHRcdFx0XHRcdGN1c3RvbWl6YXRpb25zOiBbXG5cdFx0XHRcdFx0XHR7IHVyaTogJ2ZpbGU6Ly8vcGx1Z2lucy9hJywgZGlzcGxheU5hbWU6ICdQbHVnaW4gQScgfSxcblx0XHRcdFx0XHRcdHsgdXJpOiAnZmlsZTovLy9wbHVnaW5zL2InLCBkaXNwbGF5TmFtZTogJ1BsdWdpbiBCJyB9LFxuXHRcdFx0XHRcdFx0eyB1cmk6ICdmaWxlOi8vL3BsdWdpbnMvYycsIGRpc3BsYXlOYW1lOiAnUGx1Z2luIEMnIH0sXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cblx0XHRhd2FpdCBjb250cm9sbGVyLnJlbW92ZUNvbmZpZ3VyZWRQbHVnaW4ocGx1Z2luQik7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29ubmVjdGlvbi5kaXNwYXRjaGVkQWN0aW9ucy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29ubmVjdGlvbi5kaXNwYXRjaGVkQWN0aW9uc1swXSwge1xuXHRcdFx0Y2hhbm5lbDogJ2FocC1yb290Oi8vJyxcblx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlJvb3RDb25maWdDaGFuZ2VkLFxuXHRcdFx0XHRjb25maWc6IHtcblx0XHRcdFx0XHRjdXN0b21pemF0aW9uczogW1xuXHRcdFx0XHRcdFx0eyB1cmk6ICdmaWxlOi8vL3BsdWdpbnMvYScsIGRpc3BsYXlOYW1lOiAnUGx1Z2luIEEnIH0sXG5cdFx0XHRcdFx0XHR7IHVyaTogJ2ZpbGU6Ly8vcGx1Z2lucy9jJywgZGlzcGxheU5hbWU6ICdQbHVnaW4gQycgfSxcblx0XHRcdFx0XHRdLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbXVsdGlwbGUgY2xpZW50LXN5bmNlZCBlbnRyaWVzIGFsbCBhcHBlYXIgd2l0aCBkaXN0aW5jdCBrZXlzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbm5lY3Rpb24gPSBkaXNwb3NhYmxlcy5hZGQobmV3IE1vY2tBZ2VudENvbm5lY3Rpb24oKSk7XG5cblx0XHRjb25zdCBjbGllbnRBOiBDdXN0b21pemF0aW9uID0geyB0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5QbHVnaW4sIGlkOiAnZmlsZTovLy9wbHVnaW5zL2NsaWVudC1hJywgdXJpOiAnZmlsZTovLy9wbHVnaW5zL2NsaWVudC1hJywgbmFtZTogJ0NsaWVudCBBJywgfTtcblx0XHRjb25zdCBjbGllbnRCOiBDdXN0b21pemF0aW9uID0geyB0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5QbHVnaW4sIGlkOiAnZmlsZTovLy9wbHVnaW5zL2NsaWVudC1iJywgdXJpOiAnZmlsZTovLy9wbHVnaW5zL2NsaWVudC1iJywgbmFtZTogJ0NsaWVudCBCJywgfTtcblxuXHRcdGNvbm5lY3Rpb24uc2V0Um9vdFN0YXRlKHsgYWdlbnRzOiBbY3JlYXRlQWdlbnRJbmZvKFtdKV0gfSk7XG5cblx0XHRjb25zdCBmaWxlU2VydmljZSA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUZpbGVTZXJ2aWNlPigpIHtcblx0XHRcdG92ZXJyaWRlIGFzeW5jIGNhbkhhbmRsZVJlc291cmNlKCkgeyByZXR1cm4gZmFsc2U7IH1cblx0XHRcdG92ZXJyaWRlIGFzeW5jIHJlc29sdmVBbGwoKSB7IHJldHVybiBbXTsgfVxuXHRcdH07XG5cblx0XHRjb25zdCBwcm92aWRlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRDdXN0b21pemF0aW9uSXRlbVByb3ZpZGVyKFxuXHRcdFx0J3Rlc3QtYXV0aG9yaXR5Jyxcblx0XHRcdCgpID0+IHsgfSxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdGZpbGVTZXJ2aWNlLFxuXHRcdFx0bmV3IE51bGxMb2dTZXJ2aWNlKCksXG5cdFx0XHRjcmVhdGVUZXN0Q3VzdG9tQWdlbnRzU2VydmljZShjb25uZWN0aW9uLCBbXSksXG5cdFx0KSk7XG5cblx0XHRjb25uZWN0aW9uLmZpcmVBY3Rpb24oe1xuXHRcdFx0Y2hhbm5lbDogYWdlbnRIb3N0U2Vzc2lvbklkLFxuXHRcdFx0c2VydmVyU2VxOiAxLFxuXHRcdFx0b3JpZ2luOiB1bmRlZmluZWQsXG5cdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uQ3VzdG9taXphdGlvbnNDaGFuZ2VkLFxuXHRcdFx0XHRjdXN0b21pemF0aW9uczogW1xuXHRcdFx0XHRcdHsgLi4uY2xpZW50QSwgY2xpZW50SWQ6ICd0ZXN0LWNsaWVudCcgfSxcblx0XHRcdFx0XHR7IC4uLmNsaWVudEIsIGNsaWVudElkOiAndGVzdC1jbGllbnQnIH0sXG5cdFx0XHRcdF0sXG5cdFx0XHR9LFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgaXRlbXMgPSBhd2FpdCBwcm92aWRlci5wcm92aWRlQ2hhdFNlc3Npb25DdXN0b21pemF0aW9ucyh0ZXN0U2Vzc2lvblJlc291cmNlLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXRlbXMubGVuZ3RoLCAyKTtcblx0XHRhc3NlcnQub2soaXRlbXMuZmluZChpID0+IGkubmFtZSA9PT0gJ0NsaWVudCBBJyksICdzaG91bGQgaGF2ZSBDbGllbnQgQScpO1xuXHRcdGFzc2VydC5vayhpdGVtcy5maW5kKGkgPT4gaS5uYW1lID09PSAnQ2xpZW50IEInKSwgJ3Nob3VsZCBoYXZlIENsaWVudCBCJyk7XG5cdFx0Y29uc3Qga2V5cyA9IGl0ZW1zLm1hcChpID0+IGkuaXRlbUtleSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5ldyBTZXQoa2V5cykuc2l6ZSwgMiwgJ2FsbCBpdGVtIGtleXMgc2hvdWxkIGJlIHVuaXF1ZScpO1xuXHR9KTtcblxuXHR0ZXN0KCdwcm92aWRlciBwYXJzZXMgc2tpbGwgbWV0YWRhdGEsIHJld3JpdGVzIGZvbGRlciBVUklzIHRvIFNLSUxMLm1kLCBhbmQgc2tpcHMgdW5yZWFkYWJsZSBmb2xkZXIgc2tpbGxzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbm5lY3Rpb24gPSBkaXNwb3NhYmxlcy5hZGQobmV3IE1vY2tBZ2VudENvbm5lY3Rpb24oKSk7XG5cdFx0Y29uc3QgcGx1Z2luOiBDdXN0b21pemF0aW9uID0geyB0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5QbHVnaW4sIGlkOiAnZmlsZTovLy9wbHVnaW5zL3NraWxscy1idW5kbGUnLCB1cmk6ICdmaWxlOi8vL3BsdWdpbnMvc2tpbGxzLWJ1bmRsZScsIG5hbWU6ICdTa2lsbHMgQnVuZGxlJywgfTtcblxuXHRcdGNvbm5lY3Rpb24uc2V0Um9vdFN0YXRlKHsgYWdlbnRzOiBbY3JlYXRlQWdlbnRJbmZvKFtwbHVnaW5dKV0gfSk7XG5cblx0XHQvLyBCdWlsZCBhIHN5bnRoZXRpYyBwbHVnaW4gdGhhdCBjb250YWlucyBhIGBza2lsbHMvYCBkaXJlY3Rvcnkgd2l0aDpcblx0XHQvLyAgLSBgdmFsaWQtc2tpbGwvYCBmb2xkZXIgKFNLSUxMLm1kIHBhcnNlcyB3aXRoIG5hbWUgKyBkZXNjcmlwdGlvbilcblx0XHQvLyAgLSBgYnJva2VuLXNraWxsL2AgZm9sZGVyIChTS0lMTC5tZCByZWFkIGZhaWxzIFx1MjAxNCBlbnRyeSBzaG91bGQgYmUgc2tpcHBlZClcblx0XHQvLyAgLSBgbGVnYWN5LnNraWxsLm1kYCBmbGF0IGZpbGUgKGtlcHQgYXMtaXMsIG5hbWUgZnJvbSBmaWxlbmFtZSlcblx0XHRjb25zdCBza2lsbHNEaXJDaGlsZHJlbjogSUZpbGVTdGF0W10gPSBbXG5cdFx0XHR7IG5hbWU6ICd2YWxpZC1za2lsbCcsIHJlc291cmNlOiBVUkkucGFyc2UoJ3ZzY29kZS1hZ2VudC1ob3N0Oi8vdGVzdC9wbHVnaW5zL3NraWxscy1idW5kbGUvc2tpbGxzL3ZhbGlkLXNraWxsJyksIGlzRmlsZTogZmFsc2UsIGlzRGlyZWN0b3J5OiB0cnVlLCBpc1N5bWJvbGljTGluazogZmFsc2UsIGNoaWxkcmVuOiB1bmRlZmluZWQgfSxcblx0XHRcdHsgbmFtZTogJ2Jyb2tlbi1za2lsbCcsIHJlc291cmNlOiBVUkkucGFyc2UoJ3ZzY29kZS1hZ2VudC1ob3N0Oi8vdGVzdC9wbHVnaW5zL3NraWxscy1idW5kbGUvc2tpbGxzL2Jyb2tlbi1za2lsbCcpLCBpc0ZpbGU6IGZhbHNlLCBpc0RpcmVjdG9yeTogdHJ1ZSwgaXNTeW1ib2xpY0xpbms6IGZhbHNlLCBjaGlsZHJlbjogdW5kZWZpbmVkIH0sXG5cdFx0XHR7IG5hbWU6ICdsZWdhY3kuc2tpbGwubWQnLCByZXNvdXJjZTogVVJJLnBhcnNlKCd2c2NvZGUtYWdlbnQtaG9zdDovL3Rlc3QvcGx1Z2lucy9za2lsbHMtYnVuZGxlL3NraWxscy9sZWdhY3kuc2tpbGwubWQnKSwgaXNGaWxlOiB0cnVlLCBpc0RpcmVjdG9yeTogZmFsc2UsIGlzU3ltYm9saWNMaW5rOiBmYWxzZSwgY2hpbGRyZW46IHVuZGVmaW5lZCB9LFxuXHRcdF07XG5cblx0XHRjb25zdCBmaWxlU2VydmljZSA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUZpbGVTZXJ2aWNlPigpIHtcblx0XHRcdG92ZXJyaWRlIGFzeW5jIGNhbkhhbmRsZVJlc291cmNlKCkgeyByZXR1cm4gdHJ1ZTsgfVxuXHRcdFx0b3ZlcnJpZGUgYXN5bmMgcmVzb2x2ZUFsbCh0b1Jlc29sdmU6IHsgcmVzb3VyY2U6IFVSSSB9W10pOiBQcm9taXNlPElGaWxlU3RhdFJlc3VsdFtdPiB7XG5cdFx0XHRcdHJldHVybiB0b1Jlc29sdmUubWFwKCh7IHJlc291cmNlIH0pID0+IHtcblx0XHRcdFx0XHRpZiAocmVzb3VyY2UucGF0aC5lbmRzV2l0aCgnL3NraWxscycpKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0XHRzdWNjZXNzOiB0cnVlLFxuXHRcdFx0XHRcdFx0XHRzdGF0OiB7IG5hbWU6ICdza2lsbHMnLCByZXNvdXJjZSwgaXNGaWxlOiBmYWxzZSwgaXNEaXJlY3Rvcnk6IHRydWUsIGlzU3ltYm9saWNMaW5rOiBmYWxzZSwgY2hpbGRyZW46IHNraWxsc0RpckNoaWxkcmVuIH0sXG5cdFx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm4geyBzdWNjZXNzOiBmYWxzZSB9O1xuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHRcdG92ZXJyaWRlIGFzeW5jIHJlYWRGaWxlKHJlc291cmNlOiBVUkkpOiBQcm9taXNlPElGaWxlQ29udGVudD4ge1xuXHRcdFx0XHRpZiAocmVzb3VyY2UucGF0aC5lbmRzV2l0aCgnL3ZhbGlkLXNraWxsL1NLSUxMLm1kJykpIHtcblx0XHRcdFx0XHRjb25zdCBjb250ZW50ID0gJy0tLVxcbm5hbWU6IFByZXR0eSBOYW1lXFxuZGVzY3JpcHRpb246IEEgZnJpZW5kbHkgc2tpbGwgZGVzY3JpcHRpb25cXG4tLS1cXG5cXG4jIEJvZHlcXG4nO1xuXHRcdFx0XHRcdHJldHVybiB7IHJlc291cmNlLCBuYW1lOiAnU0tJTEwubWQnLCB2YWx1ZTogVlNCdWZmZXIuZnJvbVN0cmluZyhjb250ZW50KSwgbXRpbWU6IDAsIGN0aW1lOiAwLCBldGFnOiAnJywgc2l6ZTogY29udGVudC5sZW5ndGgsIHJlYWRvbmx5OiBmYWxzZSwgbG9ja2VkOiBmYWxzZSwgZXhlY3V0YWJsZTogZmFsc2UgfTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0VOT0VOVCcpO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRjb25zdCBwcm92aWRlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRDdXN0b21pemF0aW9uSXRlbVByb3ZpZGVyKFxuXHRcdFx0J3Rlc3QtYXV0aG9yaXR5Jyxcblx0XHRcdCgpID0+IHsgfSxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdGZpbGVTZXJ2aWNlLFxuXHRcdFx0bmV3IE51bGxMb2dTZXJ2aWNlKCksXG5cdFx0XHRjcmVhdGVUZXN0Q3VzdG9tQWdlbnRzU2VydmljZShjb25uZWN0aW9uLCBbcGx1Z2luXSksXG5cdFx0KSk7XG5cblx0XHRjb25zdCBpdGVtcyA9IGF3YWl0IHByb3ZpZGVyLnByb3ZpZGVDaGF0U2Vzc2lvbkN1c3RvbWl6YXRpb25zKHRlc3RTZXNzaW9uUmVzb3VyY2UsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0Y29uc3Qgc2tpbGxJdGVtcyA9IGl0ZW1zLmZpbHRlcihpID0+IGkudHlwZSA9PT0gUHJvbXB0c1R5cGUuc2tpbGwpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRza2lsbEl0ZW1zLm1hcChpID0+ICh7IG5hbWU6IGkubmFtZSwgZGVzY3JpcHRpb246IGkuZGVzY3JpcHRpb24sIHVyaTogaS51cmkudG9TdHJpbmcoKSB9KSkuc29ydCgoYSwgYikgPT4gYS5uYW1lLmxvY2FsZUNvbXBhcmUoYi5uYW1lKSksXG5cdFx0XHRbXG5cdFx0XHRcdHsgbmFtZTogJ1ByZXR0eSBOYW1lJywgZGVzY3JpcHRpb246ICdBIGZyaWVuZGx5IHNraWxsIGRlc2NyaXB0aW9uJywgdXJpOiAndnNjb2RlLWFnZW50LWhvc3Q6Ly90ZXN0L3BsdWdpbnMvc2tpbGxzLWJ1bmRsZS9za2lsbHMvdmFsaWQtc2tpbGwvU0tJTEwubWQnIH0sXG5cdFx0XHRdLnNvcnQoKGEsIGIpID0+IGEubmFtZS5sb2NhbGVDb21wYXJlKGIubmFtZSkpLFxuXHRcdCk7XG5cblx0XHQvLyBFYWNoIGV4cGFuZGVkIChub24tYnVuZGxlKSBpdGVtIG11c3QgY2FycnkgYSBgcGx1Z2luVXJpYCBzbyB0aGF0XG5cdFx0Ly8gZG93bnN0cmVhbSBzbGFzaC1jb21tYW5kIHJlc29sdXRpb24gY2FuIGJ1aWxkIGEgYHBsdWdpbjpgLXByZWZpeGVkXG5cdFx0Ly8gY29tbWFuZCBpZCB2aWEgYGdldENhbm9uaWNhbFBsdWdpbkNvbW1hbmRJZGAuXG5cdFx0Y29uc3QgZXhwZWN0ZWRQbHVnaW5VcmkgPSAndnNjb2RlLWFnZW50LWhvc3Q6Ly90ZXN0LWF1dGhvcml0eS9wbHVnaW5zL3NraWxscy1idW5kbGU/X2FoJTNEZXlKelkyaGxiV1VpT2lKbWFXeGxJbjAnO1xuXHRcdGZvciAoY29uc3Qgc2tpbGxJdGVtIG9mIHNraWxsSXRlbXMpIHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChza2lsbEl0ZW0ucGx1Z2luVXJpPy50b1N0cmluZygpLCBleHBlY3RlZFBsdWdpblVyaSwgYHNraWxsICR7c2tpbGxJdGVtLm5hbWV9IHNob3VsZCBjYXJyeSBwbHVnaW5VcmlgKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ3Byb3ZpZGVyIHJlY292ZXJzIG9yaWdpbmFsIHByb3ZlbmFuY2UgZm9yIHN5bnRoZXRpYy1idW5kbGUgY2hpbGRyZW4gdmlhIHRoZSBvcmlnaW4gcmVzb2x2ZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY29ubmVjdGlvbiA9IGRpc3Bvc2FibGVzLmFkZChuZXcgTW9ja0FnZW50Q29ubmVjdGlvbigpKTtcblxuXHRcdC8vIFRoZSBzeW50aGV0aWMgXCJWUyBDb2RlIFN5bmNlZCBEYXRhXCIgYnVuZGxlIGxpdmVzIHVuZGVyIHRoZSBzeW5jZWQgc2NoZW1lLlxuXHRcdGNvbnN0IGJ1bmRsZVVyaSA9IGAke1NZTkNFRF9DVVNUT01JWkFUSU9OX1NDSEVNRX06Ly8vdGVzdC1hdXRob3JpdHlgO1xuXHRcdGNvbnN0IGJ1bmRsZTogQ3VzdG9taXphdGlvbiA9IHsgdHlwZTogQ3VzdG9taXphdGlvblR5cGUuUGx1Z2luLCBpZDogYnVuZGxlVXJpLCB1cmk6IGJ1bmRsZVVyaSwgbmFtZTogJ1ZTIENvZGUgU3luY2VkIERhdGEnLCB9O1xuXG5cdFx0Y29ubmVjdGlvbi5zZXRSb290U3RhdGUoeyBhZ2VudHM6IFtjcmVhdGVBZ2VudEluZm8oW10pXSB9KTtcblxuXHRcdGNvbnN0IHJ1bGVSZXNvdXJjZSA9IFVSSS5wYXJzZShgJHtTWU5DRURfQ1VTVE9NSVpBVElPTl9TQ0hFTUV9Oi8vL3Rlc3QtYXV0aG9yaXR5L3J1bGVzL215LXJ1bGUubWRgKTtcblx0XHRjb25zdCBydWxlc0RpckNoaWxkcmVuOiBJRmlsZVN0YXRbXSA9IFtcblx0XHRcdHsgbmFtZTogJ215LXJ1bGUubWQnLCByZXNvdXJjZTogcnVsZVJlc291cmNlLCBpc0ZpbGU6IHRydWUsIGlzRGlyZWN0b3J5OiBmYWxzZSwgaXNTeW1ib2xpY0xpbms6IGZhbHNlLCBjaGlsZHJlbjogdW5kZWZpbmVkIH0sXG5cdFx0XTtcblxuXHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJRmlsZVNlcnZpY2U+KCkge1xuXHRcdFx0b3ZlcnJpZGUgYXN5bmMgY2FuSGFuZGxlUmVzb3VyY2UoKSB7IHJldHVybiB0cnVlOyB9XG5cdFx0XHRvdmVycmlkZSBhc3luYyByZXNvbHZlQWxsKHRvUmVzb2x2ZTogeyByZXNvdXJjZTogVVJJIH1bXSk6IFByb21pc2U8SUZpbGVTdGF0UmVzdWx0W10+IHtcblx0XHRcdFx0cmV0dXJuIHRvUmVzb2x2ZS5tYXAoKHsgcmVzb3VyY2UgfSkgPT4gcmVzb3VyY2UucGF0aC5lbmRzV2l0aCgnL3J1bGVzJylcblx0XHRcdFx0XHQ/IHsgc3VjY2VzczogdHJ1ZSwgc3RhdDogeyBuYW1lOiAncnVsZXMnLCByZXNvdXJjZSwgaXNGaWxlOiBmYWxzZSwgaXNEaXJlY3Rvcnk6IHRydWUsIGlzU3ltYm9saWNMaW5rOiBmYWxzZSwgY2hpbGRyZW46IHJ1bGVzRGlyQ2hpbGRyZW4gfSB9XG5cdFx0XHRcdFx0OiB7IHN1Y2Nlc3M6IGZhbHNlIH0pO1xuXHRcdFx0fVxuXHRcdFx0b3ZlcnJpZGUgYXN5bmMgcmVhZEZpbGUocmVzb3VyY2U6IFVSSSk6IFByb21pc2U8SUZpbGVDb250ZW50PiB7XG5cdFx0XHRcdGNvbnN0IGNvbnRlbnQgPSAnLS0tXFxubmFtZTogTXkgUnVsZVxcbmRlc2NyaXB0aW9uOiBBIHN5bmNlZCBydWxlXFxuLS0tXFxuJztcblx0XHRcdFx0cmV0dXJuIHsgcmVzb3VyY2UsIG5hbWU6ICdteS1ydWxlLm1kJywgdmFsdWU6IFZTQnVmZmVyLmZyb21TdHJpbmcoY29udGVudCksIG10aW1lOiAwLCBjdGltZTogMCwgZXRhZzogJycsIHNpemU6IGNvbnRlbnQubGVuZ3RoLCByZWFkb25seTogZmFsc2UsIGxvY2tlZDogZmFsc2UsIGV4ZWN1dGFibGU6IGZhbHNlIH07XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGNvbnN0IG9yaWdpblVyaSA9IFVSSS5wYXJzZSgnZmlsZTovLy9ob21lL3VzZXIvLmNvbmZpZy9ydWxlcy9teS1ydWxlLm1kJyk7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50Q3VzdG9taXphdGlvbkl0ZW1Qcm92aWRlcihcblx0XHRcdCd0ZXN0LWF1dGhvcml0eScsXG5cdFx0XHQoKSA9PiB7IH0sXG5cdFx0XHRzeW5jZWRVcmkgPT4gc3luY2VkVXJpLnRvU3RyaW5nKCkgPT09IHJ1bGVSZXNvdXJjZS50b1N0cmluZygpXG5cdFx0XHRcdD8geyB1cmk6IG9yaWdpblVyaSwgc291cmNlOiAnZXh0ZW5zaW9uJywgZXh0ZW5zaW9uSWQ6ICdwdWIuZXh0JywgcGx1Z2luVXJpOiB1bmRlZmluZWQgfVxuXHRcdFx0XHQ6IHVuZGVmaW5lZCxcblx0XHRcdGZpbGVTZXJ2aWNlLFxuXHRcdFx0bmV3IE51bGxMb2dTZXJ2aWNlKCksXG5cdFx0XHRjcmVhdGVUZXN0Q3VzdG9tQWdlbnRzU2VydmljZShjb25uZWN0aW9uLCBbXSksXG5cdFx0KSk7XG5cblx0XHRjb25uZWN0aW9uLmZpcmVBY3Rpb24oe1xuXHRcdFx0Y2hhbm5lbDogYWdlbnRIb3N0U2Vzc2lvbklkLFxuXHRcdFx0c2VydmVyU2VxOiAxLFxuXHRcdFx0b3JpZ2luOiB1bmRlZmluZWQsXG5cdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uQ3VzdG9taXphdGlvbnNDaGFuZ2VkLFxuXHRcdFx0XHRjdXN0b21pemF0aW9uczogW3sgLi4uYnVuZGxlLCBjbGllbnRJZDogJ3Rlc3QtY2xpZW50JyB9XSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cblx0XHRjb25zdCBpdGVtcyA9IGF3YWl0IHByb3ZpZGVyLnByb3ZpZGVDaGF0U2Vzc2lvbkN1c3RvbWl6YXRpb25zKHRlc3RTZXNzaW9uUmVzb3VyY2UsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdGNvbnN0IHJ1bGUgPSBpdGVtcy5maW5kKGkgPT4gaS50eXBlID09PSBQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMpO1xuXHRcdGFzc2VydC5vayhydWxlLCAndGhlIHN5bmNlZCBydWxlIHNob3VsZCBiZSBleHBhbmRlZCcpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHR7IHVyaTogcnVsZS51cmkudG9TdHJpbmcoKSwgc291cmNlOiBydWxlLnNvdXJjZSwgZXh0ZW5zaW9uSWQ6IHJ1bGUuZXh0ZW5zaW9uSWQsIGdyb3VwS2V5OiBydWxlLmdyb3VwS2V5IH0sXG5cdFx0XHR7IHVyaTogb3JpZ2luVXJpLnRvU3RyaW5nKCksIHNvdXJjZTogJ2V4dGVuc2lvbicsIGV4dGVuc2lvbklkOiAncHViLmV4dCcsIGdyb3VwS2V5OiB1bmRlZmluZWQgfSxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdwcm92aWRlciBrZWVwcyBjbGllbnQgZ3JvdXAgZm9yIHJlY292ZXJlZCB1c2VyIHByb3ZlbmFuY2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY29ubmVjdGlvbiA9IGRpc3Bvc2FibGVzLmFkZChuZXcgTW9ja0FnZW50Q29ubmVjdGlvbigpKTtcblx0XHRjb25zdCBidW5kbGVVcmkgPSBgJHtTWU5DRURfQ1VTVE9NSVpBVElPTl9TQ0hFTUV9Oi8vL3Rlc3QtYXV0aG9yaXR5YDtcblx0XHRjb25zdCBidW5kbGU6IEN1c3RvbWl6YXRpb24gPSB7IHR5cGU6IEN1c3RvbWl6YXRpb25UeXBlLlBsdWdpbiwgaWQ6IGJ1bmRsZVVyaSwgdXJpOiBidW5kbGVVcmksIG5hbWU6ICdWUyBDb2RlIFN5bmNlZCBEYXRhJywgfTtcblx0XHRjb25uZWN0aW9uLnNldFJvb3RTdGF0ZSh7IGFnZW50czogW2NyZWF0ZUFnZW50SW5mbyhbXSldIH0pO1xuXG5cdFx0Y29uc3QgcnVsZVJlc291cmNlID0gVVJJLnBhcnNlKGAke2J1bmRsZVVyaX0vcnVsZXMvdXNlci1ydWxlLmluc3RydWN0aW9ucy5tZGApO1xuXHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJRmlsZVNlcnZpY2U+KCkge1xuXHRcdFx0b3ZlcnJpZGUgYXN5bmMgY2FuSGFuZGxlUmVzb3VyY2UoKSB7IHJldHVybiB0cnVlOyB9XG5cdFx0XHRvdmVycmlkZSBhc3luYyByZXNvbHZlQWxsKHRvUmVzb2x2ZTogeyByZXNvdXJjZTogVVJJIH1bXSk6IFByb21pc2U8SUZpbGVTdGF0UmVzdWx0W10+IHtcblx0XHRcdFx0cmV0dXJuIHRvUmVzb2x2ZS5tYXAoKHsgcmVzb3VyY2UgfSkgPT4gcmVzb3VyY2UucGF0aC5lbmRzV2l0aCgnL3J1bGVzJylcblx0XHRcdFx0XHQ/IHsgc3VjY2VzczogdHJ1ZSwgc3RhdDogeyBuYW1lOiAncnVsZXMnLCByZXNvdXJjZSwgaXNGaWxlOiBmYWxzZSwgaXNEaXJlY3Rvcnk6IHRydWUsIGlzU3ltYm9saWNMaW5rOiBmYWxzZSwgY2hpbGRyZW46IFt7IG5hbWU6ICd1c2VyLXJ1bGUuaW5zdHJ1Y3Rpb25zLm1kJywgcmVzb3VyY2U6IHJ1bGVSZXNvdXJjZSwgaXNGaWxlOiB0cnVlLCBpc0RpcmVjdG9yeTogZmFsc2UsIGlzU3ltYm9saWNMaW5rOiBmYWxzZSwgY2hpbGRyZW46IHVuZGVmaW5lZCB9XSB9IH1cblx0XHRcdFx0XHQ6IHsgc3VjY2VzczogZmFsc2UgfSk7XG5cdFx0XHR9XG5cdFx0XHRvdmVycmlkZSBhc3luYyByZWFkRmlsZShyZXNvdXJjZTogVVJJKTogUHJvbWlzZTxJRmlsZUNvbnRlbnQ+IHtcblx0XHRcdFx0Y29uc3QgY29udGVudCA9ICdVc2VyIHJ1bGUnO1xuXHRcdFx0XHRyZXR1cm4geyByZXNvdXJjZSwgbmFtZTogJ3VzZXItcnVsZS5pbnN0cnVjdGlvbnMubWQnLCB2YWx1ZTogVlNCdWZmZXIuZnJvbVN0cmluZyhjb250ZW50KSwgbXRpbWU6IDAsIGN0aW1lOiAwLCBldGFnOiAnJywgc2l6ZTogY29udGVudC5sZW5ndGgsIHJlYWRvbmx5OiBmYWxzZSwgbG9ja2VkOiBmYWxzZSwgZXhlY3V0YWJsZTogZmFsc2UgfTtcblx0XHRcdH1cblx0XHR9O1xuXHRcdGNvbnN0IG9yaWdpblVyaSA9IFVSSS5wYXJzZSgnZmlsZTovLy9ob21lL3VzZXIvLmNvcGlsb3QvaW5zdHJ1Y3Rpb25zL3VzZXItcnVsZS5pbnN0cnVjdGlvbnMubWQnKTtcblx0XHRjb25zdCBwcm92aWRlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRDdXN0b21pemF0aW9uSXRlbVByb3ZpZGVyKFxuXHRcdFx0J3Rlc3QtYXV0aG9yaXR5Jyxcblx0XHRcdCgpID0+IHsgfSxcblx0XHRcdHN5bmNlZFVyaSA9PiBzeW5jZWRVcmkudG9TdHJpbmcoKSA9PT0gcnVsZVJlc291cmNlLnRvU3RyaW5nKClcblx0XHRcdFx0PyB7IHVyaTogb3JpZ2luVXJpLCBzb3VyY2U6ICd1c2VyJywgZXh0ZW5zaW9uSWQ6IHVuZGVmaW5lZCwgcGx1Z2luVXJpOiB1bmRlZmluZWQgfVxuXHRcdFx0XHQ6IHVuZGVmaW5lZCxcblx0XHRcdGZpbGVTZXJ2aWNlLFxuXHRcdFx0bmV3IE51bGxMb2dTZXJ2aWNlKCksXG5cdFx0XHRjcmVhdGVUZXN0Q3VzdG9tQWdlbnRzU2VydmljZShjb25uZWN0aW9uLCBbXSksXG5cdFx0KSk7XG5cdFx0Y29ubmVjdGlvbi5maXJlQWN0aW9uKHtcblx0XHRcdGNoYW5uZWw6IGFnZW50SG9zdFNlc3Npb25JZCxcblx0XHRcdHNlcnZlclNlcTogMSxcblx0XHRcdG9yaWdpbjogdW5kZWZpbmVkLFxuXHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbkN1c3RvbWl6YXRpb25zQ2hhbmdlZCxcblx0XHRcdFx0Y3VzdG9taXphdGlvbnM6IFt7IC4uLmJ1bmRsZSwgY2xpZW50SWQ6ICd0ZXN0LWNsaWVudCcgfV0sXG5cdFx0XHR9LFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgaXRlbXMgPSBhd2FpdCBwcm92aWRlci5wcm92aWRlQ2hhdFNlc3Npb25DdXN0b21pemF0aW9ucyh0ZXN0U2Vzc2lvblJlc291cmNlLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRjb25zdCBydWxlID0gaXRlbXMuZmluZChpdGVtID0+IGl0ZW0udHlwZSA9PT0gUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zKTtcblx0XHRhc3NlcnQub2socnVsZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHR1cmk6IHJ1bGUudXJpLnRvU3RyaW5nKCksXG5cdFx0XHRzb3VyY2U6IHJ1bGUuc291cmNlLFxuXHRcdFx0Z3JvdXBLZXk6IHJ1bGUuZ3JvdXBLZXksXG5cdFx0fSwge1xuXHRcdFx0dXJpOiBvcmlnaW5VcmkudG9TdHJpbmcoKSxcblx0XHRcdHNvdXJjZTogJ3VzZXInLFxuXHRcdFx0Z3JvdXBLZXk6ICdyZW1vdGUtY2xpZW50Jyxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncHJvdmlkZXIgbGVhdmVzIHN5bnRoZXRpYy1idW5kbGUgY2hpbGRyZW4gdW5jaGFuZ2VkIHdoZW4gbm8gb3JpZ2luIGlzIGtub3duJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbm5lY3Rpb24gPSBkaXNwb3NhYmxlcy5hZGQobmV3IE1vY2tBZ2VudENvbm5lY3Rpb24oKSk7XG5cblx0XHRjb25zdCBidW5kbGVVcmkgPSBgJHtTWU5DRURfQ1VTVE9NSVpBVElPTl9TQ0hFTUV9Oi8vL3Rlc3QtYXV0aG9yaXR5YDtcblx0XHRjb25zdCBidW5kbGU6IEN1c3RvbWl6YXRpb24gPSB7IHR5cGU6IEN1c3RvbWl6YXRpb25UeXBlLlBsdWdpbiwgaWQ6IGJ1bmRsZVVyaSwgdXJpOiBidW5kbGVVcmksIG5hbWU6ICdWUyBDb2RlIFN5bmNlZCBEYXRhJywgfTtcblxuXHRcdGNvbm5lY3Rpb24uc2V0Um9vdFN0YXRlKHsgYWdlbnRzOiBbY3JlYXRlQWdlbnRJbmZvKFtdKV0gfSk7XG5cblx0XHRjb25zdCBydWxlUmVzb3VyY2UgPSBVUkkucGFyc2UoYCR7U1lOQ0VEX0NVU1RPTUlaQVRJT05fU0NIRU1FfTovLy90ZXN0LWF1dGhvcml0eS9ydWxlcy9teS1ydWxlLm1kYCk7XG5cdFx0Y29uc3QgcnVsZXNEaXJDaGlsZHJlbjogSUZpbGVTdGF0W10gPSBbXG5cdFx0XHR7IG5hbWU6ICdteS1ydWxlLm1kJywgcmVzb3VyY2U6IHJ1bGVSZXNvdXJjZSwgaXNGaWxlOiB0cnVlLCBpc0RpcmVjdG9yeTogZmFsc2UsIGlzU3ltYm9saWNMaW5rOiBmYWxzZSwgY2hpbGRyZW46IHVuZGVmaW5lZCB9LFxuXHRcdF07XG5cblx0XHRjb25zdCBmaWxlU2VydmljZSA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUZpbGVTZXJ2aWNlPigpIHtcblx0XHRcdG92ZXJyaWRlIGFzeW5jIGNhbkhhbmRsZVJlc291cmNlKCkgeyByZXR1cm4gdHJ1ZTsgfVxuXHRcdFx0b3ZlcnJpZGUgYXN5bmMgcmVzb2x2ZUFsbCh0b1Jlc29sdmU6IHsgcmVzb3VyY2U6IFVSSSB9W10pOiBQcm9taXNlPElGaWxlU3RhdFJlc3VsdFtdPiB7XG5cdFx0XHRcdHJldHVybiB0b1Jlc29sdmUubWFwKCh7IHJlc291cmNlIH0pID0+IHJlc291cmNlLnBhdGguZW5kc1dpdGgoJy9ydWxlcycpXG5cdFx0XHRcdFx0PyB7IHN1Y2Nlc3M6IHRydWUsIHN0YXQ6IHsgbmFtZTogJ3J1bGVzJywgcmVzb3VyY2UsIGlzRmlsZTogZmFsc2UsIGlzRGlyZWN0b3J5OiB0cnVlLCBpc1N5bWJvbGljTGluazogZmFsc2UsIGNoaWxkcmVuOiBydWxlc0RpckNoaWxkcmVuIH0gfVxuXHRcdFx0XHRcdDogeyBzdWNjZXNzOiBmYWxzZSB9KTtcblx0XHRcdH1cblx0XHRcdG92ZXJyaWRlIGFzeW5jIHJlYWRGaWxlKHJlc291cmNlOiBVUkkpOiBQcm9taXNlPElGaWxlQ29udGVudD4ge1xuXHRcdFx0XHRjb25zdCBjb250ZW50ID0gJy0tLVxcbm5hbWU6IE15IFJ1bGVcXG4tLS1cXG4nO1xuXHRcdFx0XHRyZXR1cm4geyByZXNvdXJjZSwgbmFtZTogJ215LXJ1bGUubWQnLCB2YWx1ZTogVlNCdWZmZXIuZnJvbVN0cmluZyhjb250ZW50KSwgbXRpbWU6IDAsIGN0aW1lOiAwLCBldGFnOiAnJywgc2l6ZTogY29udGVudC5sZW5ndGgsIHJlYWRvbmx5OiBmYWxzZSwgbG9ja2VkOiBmYWxzZSwgZXhlY3V0YWJsZTogZmFsc2UgfTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0Ly8gTm8gcmVzb2x2ZXIgd2lyZWQ6IGNoaWxkcmVuIGtlZXAgdGhlaXIgc3luY2VkIFVSSSBhbmQgZGVmYXVsdCBzb3VyY2UuXG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50Q3VzdG9taXphdGlvbkl0ZW1Qcm92aWRlcihcblx0XHRcdCd0ZXN0LWF1dGhvcml0eScsXG5cdFx0XHQoKSA9PiB7IH0sXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRmaWxlU2VydmljZSxcblx0XHRcdG5ldyBOdWxsTG9nU2VydmljZSgpLFxuXHRcdFx0Y3JlYXRlVGVzdEN1c3RvbUFnZW50c1NlcnZpY2UoY29ubmVjdGlvbiwgW10pLFxuXHRcdCkpO1xuXG5cdFx0Y29ubmVjdGlvbi5maXJlQWN0aW9uKHtcblx0XHRcdGNoYW5uZWw6IGFnZW50SG9zdFNlc3Npb25JZCxcblx0XHRcdHNlcnZlclNlcTogMSxcblx0XHRcdG9yaWdpbjogdW5kZWZpbmVkLFxuXHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbkN1c3RvbWl6YXRpb25zQ2hhbmdlZCxcblx0XHRcdFx0Y3VzdG9taXphdGlvbnM6IFt7IC4uLmJ1bmRsZSwgY2xpZW50SWQ6ICd0ZXN0LWNsaWVudCcgfV0sXG5cdFx0XHR9LFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgaXRlbXMgPSBhd2FpdCBwcm92aWRlci5wcm92aWRlQ2hhdFNlc3Npb25DdXN0b21pemF0aW9ucyh0ZXN0U2Vzc2lvblJlc291cmNlLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRjb25zdCBydWxlID0gaXRlbXMuZmluZChpID0+IGkudHlwZSA9PT0gUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zKTtcblx0XHRhc3NlcnQub2socnVsZSwgJ3RoZSBzeW5jZWQgcnVsZSBzaG91bGQgYmUgZXhwYW5kZWQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocnVsZS51cmkudG9TdHJpbmcoKSwgcnVsZVJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHR9KTtcblxuXHR0ZXN0KCdDdXN0b21pemF0aW9uSGFybmVzc1NlcnZpY2UuZ2V0U2xhc2hDb21tYW5kcyBwcmVmaXhlcyBkaXNjb3ZlcmVkIHNraWxsIG5hbWVzIHdpdGggdGhlIHBsdWdpbiBpZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjb25uZWN0aW9uID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBNb2NrQWdlbnRDb25uZWN0aW9uKCkpO1xuXG5cdFx0Y29uc3QgcGx1Z2luOiBDdXN0b21pemF0aW9uID0geyB0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5QbHVnaW4sIGlkOiAnZmlsZTovLy9wbHVnaW5zL3NraWxscy1idW5kbGUnLCB1cmk6ICdmaWxlOi8vL3BsdWdpbnMvc2tpbGxzLWJ1bmRsZScsIG5hbWU6ICdTa2lsbHMgQnVuZGxlJywgfTtcblxuXHRcdGNvbm5lY3Rpb24uc2V0Um9vdFN0YXRlKHsgYWdlbnRzOiBbY3JlYXRlQWdlbnRJbmZvKFtwbHVnaW5dKV0gfSk7XG5cblx0XHRjb25zdCBza2lsbHNEaXJDaGlsZHJlbjogSUZpbGVTdGF0W10gPSBbXG5cdFx0XHR7IG5hbWU6ICdsaW50JywgcmVzb3VyY2U6IFVSSS5wYXJzZSgndnNjb2RlLWFnZW50LWhvc3Q6Ly90ZXN0L3BsdWdpbnMvc2tpbGxzLWJ1bmRsZS9za2lsbHMvbGludCcpLCBpc0ZpbGU6IGZhbHNlLCBpc0RpcmVjdG9yeTogdHJ1ZSwgaXNTeW1ib2xpY0xpbms6IGZhbHNlLCBjaGlsZHJlbjogdW5kZWZpbmVkIH0sXG5cdFx0XTtcblxuXHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJRmlsZVNlcnZpY2U+KCkge1xuXHRcdFx0b3ZlcnJpZGUgYXN5bmMgY2FuSGFuZGxlUmVzb3VyY2UoKSB7IHJldHVybiB0cnVlOyB9XG5cdFx0XHRvdmVycmlkZSBhc3luYyByZXNvbHZlQWxsKHRvUmVzb2x2ZTogeyByZXNvdXJjZTogVVJJIH1bXSk6IFByb21pc2U8SUZpbGVTdGF0UmVzdWx0W10+IHtcblx0XHRcdFx0cmV0dXJuIHRvUmVzb2x2ZS5tYXAoKHsgcmVzb3VyY2UgfSkgPT4ge1xuXHRcdFx0XHRcdGlmIChyZXNvdXJjZS5wYXRoLmVuZHNXaXRoKCcvc2tpbGxzJykpIHtcblx0XHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRcdHN1Y2Nlc3M6IHRydWUsXG5cdFx0XHRcdFx0XHRcdHN0YXQ6IHsgbmFtZTogJ3NraWxscycsIHJlc291cmNlLCBpc0ZpbGU6IGZhbHNlLCBpc0RpcmVjdG9yeTogdHJ1ZSwgaXNTeW1ib2xpY0xpbms6IGZhbHNlLCBjaGlsZHJlbjogc2tpbGxzRGlyQ2hpbGRyZW4gfSxcblx0XHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlIH07XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdFx0b3ZlcnJpZGUgYXN5bmMgcmVhZEZpbGUocmVzb3VyY2U6IFVSSSk6IFByb21pc2U8SUZpbGVDb250ZW50PiB7XG5cdFx0XHRcdGlmIChyZXNvdXJjZS5wYXRoLmVuZHNXaXRoKCcvbGludC9TS0lMTC5tZCcpKSB7XG5cdFx0XHRcdFx0Y29uc3QgY29udGVudCA9ICctLS1cXG5uYW1lOiBMaW50XFxuZGVzY3JpcHRpb246IEEgbGludCBza2lsbFxcbi0tLVxcbic7XG5cdFx0XHRcdFx0cmV0dXJuIHsgcmVzb3VyY2UsIG5hbWU6ICdTS0lMTC5tZCcsIHZhbHVlOiBWU0J1ZmZlci5mcm9tU3RyaW5nKGNvbnRlbnQpLCBtdGltZTogMCwgY3RpbWU6IDAsIGV0YWc6ICcnLCBzaXplOiBjb250ZW50Lmxlbmd0aCwgcmVhZG9ubHk6IGZhbHNlLCBsb2NrZWQ6IGZhbHNlLCBleGVjdXRhYmxlOiBmYWxzZSB9O1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcignRU5PRU5UJyk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGNvbnN0IHByb3ZpZGVyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEN1c3RvbWl6YXRpb25JdGVtUHJvdmlkZXIoXG5cdFx0XHQndGVzdC1hdXRob3JpdHknLFxuXHRcdFx0KCkgPT4geyB9LFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0ZmlsZVNlcnZpY2UsXG5cdFx0XHRuZXcgTnVsbExvZ1NlcnZpY2UoKSxcblx0XHRcdGNyZWF0ZVRlc3RDdXN0b21BZ2VudHNTZXJ2aWNlKGNvbm5lY3Rpb24sIFtwbHVnaW5dKSxcblx0XHQpKTtcblxuXHRcdGNvbnN0IGhhcm5lc3NJZCA9ICdyZW1vdGUtYWdlbnQtaG9zdC10ZXN0Jztcblx0XHRjb25zdCB0ZXN0U2Vzc2lvblJlc291cmNlID0gVVJJLnBhcnNlKCdyZW1vdGUtYWdlbnQtaG9zdC10ZXN0Oi8vL3Rlc3Qtc2Vzc2lvbicpO1xuXHRcdGNvbnN0IGRlc2NyaXB0b3I6IElIYXJuZXNzRGVzY3JpcHRvciA9IHtcblx0XHRcdGlkOiBoYXJuZXNzSWQsXG5cdFx0XHRsYWJlbDogJ1JlbW90ZSBBZ2VudCBIb3N0ICh0ZXN0KScsXG5cdFx0XHRpY29uOiBUaGVtZUljb24uZnJvbUlkKENvZGljb24ucmVtb3RlLmlkKSxcblx0XHRcdGl0ZW1Qcm92aWRlcjogcHJvdmlkZXIsXG5cdFx0fTtcblx0XHRjb25zdCBoYXJuZXNzU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQ3VzdG9taXphdGlvbkhhcm5lc3NTZXJ2aWNlQmFzZShbZGVzY3JpcHRvcl0sIGhhcm5lc3NJZCwgbmV3IE1vY2tQcm9tcHRzU2VydmljZSgpKSk7XG5cblx0XHRjb25zdCBjb21tYW5kcyA9IGF3YWl0IGhhcm5lc3NTZXJ2aWNlLmdldFNsYXNoQ29tbWFuZHModGVzdFNlc3Npb25SZXNvdXJjZSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0Y29uc3Qgc2tpbGxDb21tYW5kID0gY29tbWFuZHMuZmluZChjID0+IGMudHlwZSA9PT0gUHJvbXB0c1R5cGUuc2tpbGwpO1xuXHRcdGFzc2VydC5vayhza2lsbENvbW1hbmQsICdzaG91bGQgaGF2ZSBhIHNraWxsIHNsYXNoIGNvbW1hbmQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2tpbGxDb21tYW5kLm5hbWUsICdza2lsbHMtYnVuZGxlOmxpbnQnLCAnc2tpbGwgY29tbWFuZCBuYW1lIHNob3VsZCBiZSBwbHVnaW4tcHJlZml4ZWQnKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLFNBQVMsYUFBYTtBQUMvQixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLFlBQVk7QUFDckIsU0FBUywrQ0FBK0M7QUFFeEQsU0FBUyxZQUFZLHVCQUFrRjtBQUN2RyxTQUFTLDZCQUE2Qix5QkFBeUIseUJBQXlIO0FBQ3hMLFNBQVMsdUJBQThDO0FBQ3ZELFNBQVMsc0JBQXNCO0FBRy9CLFNBQVMsZ0JBQWdCO0FBRXpCLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsc0JBQXNCO0FBRS9CLFNBQVMsV0FBVztBQUVwQixTQUFTLG1DQUFtQztBQUM1QyxTQUFTLG1DQUFtQztBQUM1QyxTQUFTLHVDQUEyRDtBQUNwRSxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLGlCQUFpQjtBQUMxQixTQUFTLGVBQWU7QUFFeEIsU0FBUyxzQ0FBc0M7QUFFL0MsTUFBTSw0QkFBNEIsS0FBdUIsRUFBRTtBQUFBLEVBYzFELGNBQWM7QUFDYixVQUFNO0FBYlAsU0FBaUIsZUFBZSxJQUFJLFFBQXdCO0FBQzVELFNBQWtCLGNBQWMsS0FBSyxhQUFhO0FBQ2xELFNBQWtCLG9CQUFvQixNQUFNO0FBQzVDLFNBQWtCLFdBQVc7QUFFN0IsU0FBUSxrQkFBNkIsRUFBRSxRQUFRLENBQUMsRUFBRTtBQUdsRCxTQUFpQixpQkFBaUIsb0JBQUksSUFBMEI7QUFFaEUsU0FBUyxvQkFBZ0UsQ0FBQztBQUl6RSxVQUFNLE9BQU87QUFDYixTQUFLLFlBQVk7QUFBQSxNQUNoQixJQUFJLFFBQW1CO0FBQUUsZUFBTyxLQUFLO0FBQUEsTUFBaUI7QUFBQSxNQUN0RCxJQUFJLGdCQUEyQjtBQUFFLGVBQU8sS0FBSztBQUFBLE1BQWlCO0FBQUEsTUFDOUQsYUFBYSxNQUFNO0FBQUEsTUFDbkIsbUJBQW1CLE1BQU07QUFBQSxNQUN6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QkFBTztBQUFBLGNBQ04sU0FBUztBQUFBLGNBQ1QsTUFBTSxFQUFFLE1BQU0sVUFBVSxVQUFVLFFBQVEsT0FBTyxhQUFhLE1BQU0sZ0JBQWdCLE9BQU8sVUFBVSxrQkFBa0I7QUFBQSxZQUN4SDtBQUFBLFVBQ0Q7QUFDQSxpQkFBTyxFQUFFLFNBQVMsTUFBTTtBQUFBLFFBQ3pCLENBQUM7QUFBQSxNQUNGO0FBQUEsTUFDQSxNQUFlLFNBQVMsVUFBc0M7QUFDN0QsWUFBSSxTQUFTLEtBQUssU0FBUyxnQkFBZ0IsR0FBRztBQUM3QyxnQkFBTSxVQUFVO0FBQ2hCLGlCQUFPLEVBQUUsVUFBVSxNQUFNLFlBQVksT0FBTyxTQUFTLFdBQVcsT0FBTyxHQUFHLE9BQU8sR0FBRyxPQUFPLEdBQUcsTUFBTSxJQUFJLE1BQU0sUUFBUSxRQUFRLFVBQVUsT0FBTyxRQUFRLE9BQU8sWUFBWSxNQUFNO0FBQUEsUUFDakw7QUFDQSxjQUFNLElBQUksTUFBTSxRQUFRO0FBQUEsTUFDekI7QUFBQSxJQUNEO0FBRUEsVUFBTSxXQUFXLFlBQVksSUFBSSxJQUFJO0FBQUEsTUFDcEM7QUFBQSxNQUNBLE1BQU07QUFBQSxNQUFFO0FBQUEsTUFDUjtBQUFBLE1BQ0E7QUFBQSxNQUNBLElBQUksZUFBZTtBQUFBLE1BQ25CLDhCQUE4QixZQUFZLENBQUMsTUFBTSxDQUFDO0FBQUEsSUFDbkQsQ0FBQztBQUVELFVBQU0sWUFBWTtBQUNsQixVQUFNQSx1QkFBc0IsSUFBSSxNQUFNLHdDQUF3QztBQUM5RSxVQUFNLGFBQWlDO0FBQUEsTUFDdEMsSUFBSTtBQUFBLE1BQ0osT0FBTztBQUFBLE1BQ1AsTUFBTSxVQUFVLE9BQU8sUUFBUSxPQUFPLEVBQUU7QUFBQSxNQUN4QyxjQUFjO0FBQUEsSUFDZjtBQUNBLFVBQU0saUJBQWlCLFlBQVksSUFBSSxJQUFJLGdDQUFnQyxDQUFDLFVBQVUsR0FBRyxXQUFXLElBQUksbUJBQW1CLENBQUMsQ0FBQztBQUU3SCxVQUFNLFdBQVcsTUFBTSxlQUFlLGlCQUFpQkEsc0JBQXFCLGtCQUFrQixJQUFJO0FBQ2xHLFVBQU0sZUFBZSxTQUFTLEtBQUssT0FBSyxFQUFFLFNBQVMsWUFBWSxLQUFLO0FBQ3BFLFdBQU8sR0FBRyxjQUFjLG1DQUFtQztBQUMzRCxXQUFPLFlBQVksYUFBYSxNQUFNLHNCQUFzQiw4Q0FBOEM7QUFBQSxFQUMzRyxDQUFDO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFsidGVzdFNlc3Npb25SZXNvdXJjZSJdCn0K
