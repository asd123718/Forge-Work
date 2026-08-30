import assert from "assert";
import { constObservable } from "../../../../../base/common/observable.js";
import { URI } from "../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { IAgentHostEnablementService } from "../../../../../platform/agentHost/common/agentHostEnablementService.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { TestConfigurationService } from "../../../../../platform/configuration/test/common/testConfigurationService.js";
import { TestInstantiationService } from "../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { IStorageService } from "../../../../../platform/storage/common/storage.js";
import { IWorkspaceContextService, Workspace, toWorkspaceFolder } from "../../../../../platform/workspace/common/workspace.js";
import { ChatConfiguration, ChatPermissionLevel, getChatPermissionLevelFromDefaultConfiguration, getComputedDefaultSessionResource, getComputedDefaultSessionType, getDefaultNewChatSessionResource, getDefaultNewChatSessionType, isEditorLocalAgentEnabled, isNewChatSessionTypeUsable, isVisibleEditorChatSessionType, recordUserSelectedSessionType, resolveDefaultNewChatSessionType } from "../../common/constants.js";
import { localChatSessionType, SessionType, IChatSessionsService } from "../../common/chatSessionsService.js";
import { MockChatSessionsService } from "./mockChatSessionsService.js";
import { TestContextService, TestStorageService } from "../../../../test/common/workbenchTestServices.js";
import { getRememberedSessionType } from "../../common/chatSessionTypePreference.js";
import { getChatSessionType } from "../../common/model/chatUri.js";
suite("ChatConfiguration defaults", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  const localWorkspace = createWorkspace(URI.file("/workspace"));
  function createWorkspace(...resources) {
    return new Workspace(
      resources.map((resource) => resource.toString()).join(","),
      resources.map(toWorkspaceFolder),
      false,
      null,
      () => false
    );
  }
  function createChatSessionsService(...types) {
    const service = new MockChatSessionsService();
    service.setContributions(types.map((type) => ({
      type,
      name: type,
      displayName: type,
      description: type
    })));
    return service;
  }
  function resolveSessionType(configurationService, chatSessionsService, storageService, workspace, agentHostEnabled, options) {
    const accessor = disposables.add(new TestInstantiationService());
    accessor.set(IConfigurationService, configurationService);
    accessor.set(IChatSessionsService, chatSessionsService);
    accessor.set(IStorageService, storageService);
    accessor.set(IWorkspaceContextService, new TestContextService(workspace));
    accessor.set(IAgentHostEnablementService, { _serviceBrand: void 0, enabled: constObservable(agentHostEnabled) });
    return resolveDefaultNewChatSessionType(accessor, options);
  }
  test("default permission configuration maps setting values to Agent Host values", () => {
    assert.deepStrictEqual({
      manual: getChatPermissionLevelFromDefaultConfiguration("manual"),
      assisted: getChatPermissionLevelFromDefaultConfiguration("assisted"),
      allowAll: getChatPermissionLevelFromDefaultConfiguration("allowAll"),
      legacyDefault: getChatPermissionLevelFromDefaultConfiguration("default"),
      legacyAutoApprove: getChatPermissionLevelFromDefaultConfiguration("autoApprove"),
      invalid: getChatPermissionLevelFromDefaultConfiguration("invalid")
    }, {
      manual: ChatPermissionLevel.Default,
      assisted: ChatPermissionLevel.Assisted,
      allowAll: ChatPermissionLevel.AutoApprove,
      legacyDefault: ChatPermissionLevel.Default,
      legacyAutoApprove: ChatPermissionLevel.AutoApprove,
      invalid: void 0
    });
  });
  test("editor default returns local when agent host disabled and local enabled", () => {
    const configurationService = new TestConfigurationService({
      [ChatConfiguration.EditorLocalAgentEnabled]: true
    });
    const chatSessionsService = createChatSessionsService(SessionType.AgentHostCopilot);
    const storageService = disposables.add(new TestStorageService());
    assert.deepStrictEqual({
      computed: getComputedDefaultSessionType(configurationService, chatSessionsService, localWorkspace, false),
      rememberedAware: getDefaultNewChatSessionType(configurationService, chatSessionsService, storageService, localWorkspace, false),
      localVisible: isVisibleEditorChatSessionType(localChatSessionType, configurationService, chatSessionsService, localWorkspace)
    }, {
      computed: localChatSessionType,
      rememberedAware: localChatSessionType,
      localVisible: true
    });
  });
  test("editor default prefers agent host Copilot when the agent host is enabled", () => {
    const configurationService = new TestConfigurationService({
      [ChatConfiguration.DefaultToCopilotHarness]: true
    });
    const chatSessionsService = createChatSessionsService(SessionType.AgentHostCopilot);
    const storageService = disposables.add(new TestStorageService());
    assert.deepStrictEqual({
      computed: getComputedDefaultSessionType(configurationService, chatSessionsService, localWorkspace, true),
      rememberedAware: getDefaultNewChatSessionType(configurationService, chatSessionsService, storageService, localWorkspace, true),
      localVisible: isVisibleEditorChatSessionType(localChatSessionType, configurationService, chatSessionsService, localWorkspace),
      copilotVisible: isVisibleEditorChatSessionType(SessionType.AgentHostCopilot, configurationService, chatSessionsService, localWorkspace)
    }, {
      computed: SessionType.AgentHostCopilot,
      rememberedAware: SessionType.AgentHostCopilot,
      localVisible: false,
      copilotVisible: false
    });
  });
  test("Forge defaults new workbench chats to Codex before remembered and Copilot harnesses", () => {
    const configurationService = new TestConfigurationService({
      [ChatConfiguration.DefaultToCodexHarness]: true,
      [ChatConfiguration.DefaultToCopilotHarness]: true
    });
    const chatSessionsService = createChatSessionsService(SessionType.AgentHostCodex, SessionType.AgentHostCopilot);
    const storageService = disposables.add(new TestStorageService());
    recordUserSelectedSessionType(storageService, new TestConfigurationService(), chatSessionsService, localWorkspace, SessionType.AgentHostCopilot, true);
    assert.deepStrictEqual({
      computed: getComputedDefaultSessionType(configurationService, chatSessionsService, localWorkspace, true),
      rememberedAware: getDefaultNewChatSessionType(configurationService, chatSessionsService, storageService, localWorkspace, true, { currentSessionType: SessionType.AgentHostCopilot }),
      resolved: resolveSessionType(configurationService, chatSessionsService, storageService, localWorkspace, true, { currentSessionType: SessionType.AgentHostCopilot })
    }, {
      computed: SessionType.AgentHostCodex,
      rememberedAware: SessionType.AgentHostCodex,
      resolved: { sessionType: SessionType.AgentHostCodex }
    });
  });
  test("editor default stays local when the agent host is enabled but the Copilot default is not opted in", () => {
    const configurationService = new TestConfigurationService();
    const chatSessionsService = createChatSessionsService(SessionType.AgentHostCopilot);
    const storageService = disposables.add(new TestStorageService());
    assert.deepStrictEqual({
      computed: getComputedDefaultSessionType(configurationService, chatSessionsService, localWorkspace, true),
      rememberedAware: getDefaultNewChatSessionType(configurationService, chatSessionsService, storageService, localWorkspace, true)
    }, {
      computed: localChatSessionType,
      rememberedAware: localChatSessionType
    });
  });
  test("editor default keeps agent host Copilot before contribution registers", () => {
    const configurationService = new TestConfigurationService({
      [ChatConfiguration.DefaultToCopilotHarness]: true,
      [ChatConfiguration.EditorLocalAgentEnabled]: false
    });
    const chatSessionsService = createChatSessionsService(SessionType.CopilotCLI);
    const storageService = disposables.add(new TestStorageService());
    assert.deepStrictEqual({
      computed: getComputedDefaultSessionType(configurationService, chatSessionsService, localWorkspace, true),
      rememberedAware: getDefaultNewChatSessionType(configurationService, chatSessionsService, storageService, localWorkspace, true),
      localVisible: isVisibleEditorChatSessionType(localChatSessionType, configurationService, chatSessionsService, localWorkspace)
    }, {
      computed: SessionType.AgentHostCopilot,
      rememberedAware: SessionType.AgentHostCopilot,
      localVisible: false
    });
  });
  test("editor default skips extension host Copilot CLI", () => {
    const configurationService = new TestConfigurationService({
      [ChatConfiguration.EditorLocalAgentEnabled]: false
    });
    const chatSessionsService = createChatSessionsService(SessionType.CopilotCLI, SessionType.AgentHostCopilot);
    const storageService = disposables.add(new TestStorageService());
    assert.deepStrictEqual({
      computed: getComputedDefaultSessionType(configurationService, chatSessionsService, localWorkspace, false),
      rememberedAware: getDefaultNewChatSessionType(configurationService, chatSessionsService, storageService, localWorkspace, false),
      extensionHostVisible: isVisibleEditorChatSessionType(SessionType.CopilotCLI, configurationService, chatSessionsService, localWorkspace),
      copilotVisible: isVisibleEditorChatSessionType(SessionType.AgentHostCopilot, configurationService, chatSessionsService, localWorkspace)
    }, {
      computed: localChatSessionType,
      rememberedAware: localChatSessionType,
      extensionHostVisible: false,
      copilotVisible: false
    });
  });
  test("remembered extension host Copilot CLI falls back for a new chat", () => {
    const configurationService = new TestConfigurationService();
    const chatSessionsService = createChatSessionsService(SessionType.CopilotCLI, SessionType.AgentHostCopilot);
    const storageService = disposables.add(new TestStorageService());
    recordUserSelectedSessionType(storageService, configurationService, chatSessionsService, localWorkspace, SessionType.CopilotCLI, true);
    assert.deepStrictEqual({
      remembered: getRememberedSessionType(storageService),
      rememberedUsable: isNewChatSessionTypeUsable(SessionType.CopilotCLI, configurationService, chatSessionsService, localWorkspace),
      newSessionType: getDefaultNewChatSessionType(configurationService, chatSessionsService, storageService, localWorkspace, true)
    }, {
      remembered: SessionType.CopilotCLI,
      rememberedUsable: false,
      newSessionType: localChatSessionType
    });
  });
  test("current extension host Copilot CLI is not inherited by a new chat", () => {
    const configurationService = new TestConfigurationService();
    const chatSessionsService = createChatSessionsService(SessionType.CopilotCLI, SessionType.AgentHostCopilot);
    const storageService = disposables.add(new TestStorageService());
    assert.deepStrictEqual(
      resolveSessionType(configurationService, chatSessionsService, storageService, localWorkspace, true, { currentSessionType: SessionType.CopilotCLI }),
      { sessionType: localChatSessionType }
    );
  });
  test("editor default keeps local as last resort when local is disabled without any provider", () => {
    const configurationService = new TestConfigurationService({
      [ChatConfiguration.EditorLocalAgentEnabled]: false
    });
    const chatSessionsService = createChatSessionsService();
    const storageService = disposables.add(new TestStorageService());
    assert.deepStrictEqual({
      computed: getComputedDefaultSessionType(configurationService, chatSessionsService, localWorkspace, false),
      rememberedAware: getDefaultNewChatSessionType(configurationService, chatSessionsService, storageService, localWorkspace, false),
      localVisible: isVisibleEditorChatSessionType(localChatSessionType, configurationService, chatSessionsService, localWorkspace)
    }, {
      computed: localChatSessionType,
      rememberedAware: localChatSessionType,
      localVisible: false
    });
  });
  test("remembered non-local selection wins over the agent host default", () => {
    const configurationService = new TestConfigurationService({
      [ChatConfiguration.DefaultToCopilotHarness]: true
    });
    const chatSessionsService = createChatSessionsService(SessionType.AgentHostCopilot, SessionType.AgentHostClaude);
    const storageService = disposables.add(new TestStorageService());
    recordUserSelectedSessionType(storageService, configurationService, chatSessionsService, localWorkspace, SessionType.AgentHostClaude, true);
    assert.deepStrictEqual({
      computed: getComputedDefaultSessionType(configurationService, chatSessionsService, localWorkspace, true),
      remembered: getRememberedSessionType(storageService),
      rememberedAware: resolveSessionType(configurationService, chatSessionsService, storageService, localWorkspace, true, { currentSessionType: localChatSessionType })
    }, {
      computed: SessionType.AgentHostCopilot,
      remembered: SessionType.AgentHostClaude,
      rememberedAware: { sessionType: SessionType.AgentHostClaude }
    });
  });
  test("explicit override wins over remembered selection", () => {
    const configurationService = new TestConfigurationService();
    const chatSessionsService = createChatSessionsService(SessionType.AgentHostCopilot, SessionType.AgentHostClaude);
    const storageService = disposables.add(new TestStorageService());
    recordUserSelectedSessionType(storageService, configurationService, chatSessionsService, localWorkspace, SessionType.AgentHostClaude, false);
    assert.deepStrictEqual({
      remembered: getRememberedSessionType(storageService),
      rememberedAware: getDefaultNewChatSessionType(configurationService, chatSessionsService, storageService, localWorkspace, false, { explicitOverride: SessionType.AgentHostCopilot })
    }, {
      remembered: SessionType.AgentHostClaude,
      rememberedAware: SessionType.AgentHostCopilot
    });
  });
  test("current session type is fallback after remembered selection", () => {
    const configurationService = new TestConfigurationService();
    const chatSessionsService = createChatSessionsService(SessionType.AgentHostCopilot, SessionType.AgentHostClaude);
    const storageService = disposables.add(new TestStorageService());
    assert.deepStrictEqual({
      withoutRemembered: getDefaultNewChatSessionType(configurationService, chatSessionsService, storageService, localWorkspace, true, { currentSessionType: SessionType.AgentHostCopilot })
    }, {
      withoutRemembered: SessionType.AgentHostCopilot
    });
    recordUserSelectedSessionType(storageService, configurationService, chatSessionsService, localWorkspace, SessionType.AgentHostClaude, false);
    assert.deepStrictEqual({
      withRemembered: getDefaultNewChatSessionType(configurationService, chatSessionsService, storageService, localWorkspace, true, { currentSessionType: SessionType.AgentHostCopilot })
    }, {
      withRemembered: SessionType.AgentHostClaude
    });
  });
  test("preferCopilotHarness replaces local on every new chat", () => {
    const configurationService = new TestConfigurationService({
      [ChatConfiguration.EditorPreferCopilotHarness]: true
    });
    const chatSessionsService = createChatSessionsService(SessionType.AgentHostCopilot, SessionType.AgentHostClaude);
    const storageService = disposables.add(new TestStorageService());
    assert.deepStrictEqual({
      firstResolve: resolveSessionType(configurationService, chatSessionsService, storageService, localWorkspace, true, { currentSessionType: localChatSessionType }),
      secondResolve: resolveSessionType(configurationService, chatSessionsService, storageService, localWorkspace, true, { currentSessionType: localChatSessionType })
    }, {
      firstResolve: { sessionType: SessionType.AgentHostCopilot },
      secondResolve: { sessionType: SessionType.AgentHostCopilot }
    });
  });
  test("Copilot preference is skipped when the agent host is disabled", () => {
    const configurationService = new TestConfigurationService({
      [ChatConfiguration.EditorPreferCopilotHarness]: true
    });
    const chatSessionsService = createChatSessionsService(SessionType.AgentHostCopilot);
    const storageService = disposables.add(new TestStorageService());
    const resolved = resolveSessionType(configurationService, chatSessionsService, storageService, localWorkspace, false, { currentSessionType: localChatSessionType });
    assert.deepStrictEqual({
      resolved
    }, {
      resolved: { sessionType: localChatSessionType }
    });
  });
  test("preferCopilotHarness preserves Claude and Codex selections", () => {
    const configurationService = new TestConfigurationService({
      [ChatConfiguration.EditorPreferCopilotHarness]: true,
      [ChatConfiguration.EditorLocalAgentEnabled]: true
    });
    const chatSessionsService = createChatSessionsService(SessionType.AgentHostCopilot, SessionType.AgentHostClaude, SessionType.AgentHostCodex);
    const storageService = disposables.add(new TestStorageService());
    const currentClaude = resolveSessionType(configurationService, chatSessionsService, storageService, localWorkspace, true, { currentSessionType: SessionType.AgentHostClaude });
    const currentCodex = resolveSessionType(configurationService, chatSessionsService, storageService, localWorkspace, true, { currentSessionType: SessionType.AgentHostCodex });
    recordUserSelectedSessionType(storageService, configurationService, chatSessionsService, localWorkspace, SessionType.AgentHostClaude, true);
    const rememberedClaude = resolveSessionType(configurationService, chatSessionsService, storageService, localWorkspace, true, { currentSessionType: localChatSessionType });
    recordUserSelectedSessionType(storageService, configurationService, chatSessionsService, localWorkspace, SessionType.AgentHostCodex, true);
    assert.deepStrictEqual({
      currentClaude,
      currentCodex,
      rememberedClaude,
      rememberedCodex: resolveSessionType(configurationService, chatSessionsService, storageService, localWorkspace, true, { currentSessionType: localChatSessionType })
    }, {
      currentClaude: { sessionType: SessionType.AgentHostClaude },
      currentCodex: { sessionType: SessionType.AgentHostCodex },
      rememberedClaude: { sessionType: SessionType.AgentHostClaude },
      rememberedCodex: { sessionType: SessionType.AgentHostCodex }
    });
  });
  test("selecting computed default clears remembered selection", () => {
    const configurationService = new TestConfigurationService({
      [ChatConfiguration.DefaultToCopilotHarness]: true
    });
    const chatSessionsService = createChatSessionsService(SessionType.AgentHostCopilot, SessionType.AgentHostClaude);
    const storageService = disposables.add(new TestStorageService());
    recordUserSelectedSessionType(storageService, configurationService, chatSessionsService, localWorkspace, SessionType.AgentHostClaude, true);
    recordUserSelectedSessionType(storageService, configurationService, chatSessionsService, localWorkspace, SessionType.AgentHostCopilot, true);
    assert.deepStrictEqual({
      computed: getComputedDefaultSessionType(configurationService, chatSessionsService, localWorkspace, true),
      remembered: getRememberedSessionType(storageService),
      rememberedAware: getDefaultNewChatSessionType(configurationService, chatSessionsService, storageService, localWorkspace, true)
    }, {
      computed: SessionType.AgentHostCopilot,
      remembered: void 0,
      rememberedAware: SessionType.AgentHostCopilot
    });
  });
  test("selecting local while the agent host default is Copilot remembers local as an opt-out", () => {
    const configurationService = new TestConfigurationService({
      [ChatConfiguration.DefaultToCopilotHarness]: true,
      [ChatConfiguration.EditorLocalAgentEnabled]: true
    });
    const chatSessionsService = createChatSessionsService(SessionType.AgentHostCopilot);
    const storageService = disposables.add(new TestStorageService());
    recordUserSelectedSessionType(storageService, configurationService, chatSessionsService, localWorkspace, localChatSessionType, true);
    assert.deepStrictEqual({
      remembered: getRememberedSessionType(storageService),
      rememberedAware: getDefaultNewChatSessionType(configurationService, chatSessionsService, storageService, localWorkspace, true)
    }, {
      remembered: localChatSessionType,
      rememberedAware: localChatSessionType
    });
  });
  test("Copilot preference overrides a remembered local selection every time", () => {
    const configurationService = new TestConfigurationService({
      [ChatConfiguration.DefaultToCopilotHarness]: true,
      [ChatConfiguration.EditorPreferCopilotHarness]: true
    });
    const chatSessionsService = createChatSessionsService(SessionType.AgentHostCopilot);
    const storageService = disposables.add(new TestStorageService());
    recordUserSelectedSessionType(storageService, configurationService, chatSessionsService, localWorkspace, localChatSessionType, true);
    assert.deepStrictEqual({
      firstResolve: resolveSessionType(configurationService, chatSessionsService, storageService, localWorkspace, true, { currentSessionType: localChatSessionType }),
      secondResolve: resolveSessionType(configurationService, chatSessionsService, storageService, localWorkspace, true, { currentSessionType: localChatSessionType })
    }, {
      firstResolve: { sessionType: SessionType.AgentHostCopilot },
      secondResolve: { sessionType: SessionType.AgentHostCopilot }
    });
  });
  test("new chat from a local session preserves local even when the agent host default is Copilot", () => {
    const configurationService = new TestConfigurationService({
      [ChatConfiguration.DefaultToCopilotHarness]: true,
      [ChatConfiguration.EditorLocalAgentEnabled]: true
    });
    const chatSessionsService = createChatSessionsService(SessionType.AgentHostCopilot);
    const storageService = disposables.add(new TestStorageService());
    assert.deepStrictEqual({
      resolved: resolveSessionType(configurationService, chatSessionsService, storageService, localWorkspace, true, { currentSessionType: localChatSessionType })
    }, {
      resolved: { sessionType: localChatSessionType }
    });
  });
  test("explicit New Local Chat wins over a non-local current session even when the agent host default is Copilot", () => {
    const configurationService = new TestConfigurationService({
      [ChatConfiguration.DefaultToCopilotHarness]: true
    });
    const chatSessionsService = createChatSessionsService(SessionType.AgentHostCopilot);
    const storageService = disposables.add(new TestStorageService());
    assert.deepStrictEqual({
      resolved: resolveSessionType(configurationService, chatSessionsService, storageService, localWorkspace, true, { explicitOverride: localChatSessionType, currentSessionType: SessionType.AgentHostCopilot })
    }, {
      resolved: { sessionType: localChatSessionType }
    });
  });
  test("default session resource follows the agent host default", () => {
    const configurationService = new TestConfigurationService({
      [ChatConfiguration.DefaultToCopilotHarness]: true
    });
    const chatSessionsService = createChatSessionsService(SessionType.AgentHostCopilot);
    const storageService = disposables.add(new TestStorageService());
    assert.deepStrictEqual({
      computedWithAgentHost: getChatSessionType(getComputedDefaultSessionResource(configurationService, chatSessionsService, localWorkspace, true)),
      computedWithoutAgentHost: getChatSessionType(getComputedDefaultSessionResource(configurationService, chatSessionsService, localWorkspace, false)),
      defaultNewWithAgentHost: getChatSessionType(getDefaultNewChatSessionResource(configurationService, chatSessionsService, storageService, localWorkspace, true)),
      defaultNewWithoutAgentHost: getChatSessionType(getDefaultNewChatSessionResource(configurationService, chatSessionsService, storageService, localWorkspace, false))
    }, {
      computedWithAgentHost: SessionType.AgentHostCopilot,
      computedWithoutAgentHost: localChatSessionType,
      defaultNewWithAgentHost: SessionType.AgentHostCopilot,
      defaultNewWithoutAgentHost: localChatSessionType
    });
  });
  test("virtual workspace defaults implicit new chats to local", () => {
    const configurationService = new TestConfigurationService({
      [ChatConfiguration.DefaultToCopilotHarness]: true,
      [ChatConfiguration.EditorLocalAgentEnabled]: false,
      [ChatConfiguration.EditorPreferCopilotHarness]: true
    });
    const chatSessionsService = createChatSessionsService(SessionType.AgentHostCopilot, SessionType.AgentHostClaude);
    const rememberedStorageService = disposables.add(new TestStorageService());
    const currentStorageService = disposables.add(new TestStorageService());
    const workspace = createWorkspace(URI.parse("vscode-vfs://github/microsoft/vscode"));
    recordUserSelectedSessionType(rememberedStorageService, configurationService, chatSessionsService, workspace, SessionType.AgentHostClaude, true);
    assert.deepStrictEqual({
      computed: getComputedDefaultSessionType(configurationService, chatSessionsService, workspace, true),
      remembered: getRememberedSessionType(rememberedStorageService),
      rememberedAware: getDefaultNewChatSessionType(configurationService, chatSessionsService, rememberedStorageService, workspace, true),
      currentAware: getDefaultNewChatSessionType(configurationService, chatSessionsService, currentStorageService, workspace, true, { currentSessionType: SessionType.AgentHostCopilot }),
      resolvedRemembered: resolveSessionType(configurationService, chatSessionsService, rememberedStorageService, workspace, true, { currentSessionType: SessionType.AgentHostCopilot }),
      resolvedCurrent: resolveSessionType(configurationService, chatSessionsService, currentStorageService, workspace, true, { currentSessionType: SessionType.AgentHostCopilot }),
      resolvedPreferMigration: resolveSessionType(configurationService, chatSessionsService, currentStorageService, workspace, true, { currentSessionType: localChatSessionType }),
      explicitOverride: resolveSessionType(configurationService, chatSessionsService, currentStorageService, workspace, true, { explicitOverride: SessionType.AgentHostClaude }),
      localVisible: isVisibleEditorChatSessionType(localChatSessionType, configurationService, chatSessionsService, workspace),
      localRememberedUsable: isNewChatSessionTypeUsable(localChatSessionType, configurationService, chatSessionsService, workspace)
    }, {
      computed: localChatSessionType,
      remembered: SessionType.AgentHostClaude,
      rememberedAware: localChatSessionType,
      currentAware: localChatSessionType,
      resolvedRemembered: { sessionType: localChatSessionType },
      resolvedCurrent: { sessionType: localChatSessionType },
      resolvedPreferMigration: { sessionType: localChatSessionType },
      explicitOverride: { sessionType: SessionType.AgentHostClaude },
      localVisible: true,
      localRememberedUsable: true
    });
  });
  test("remembered agent host is usable before contribution registers", () => {
    const configurationService = new TestConfigurationService();
    const chatSessionsService = createChatSessionsService();
    const storageService = disposables.add(new TestStorageService());
    assert.deepStrictEqual({
      agentHost: isNewChatSessionTypeUsable(SessionType.AgentHostClaude, configurationService, chatSessionsService, localWorkspace),
      agentHostCurrent: resolveSessionType(configurationService, chatSessionsService, storageService, localWorkspace, true, { currentSessionType: SessionType.AgentHostClaude }),
      extensionContributed: isNewChatSessionTypeUsable("my-extension-agent", configurationService, chatSessionsService, localWorkspace)
    }, {
      agentHost: true,
      agentHostCurrent: { sessionType: SessionType.AgentHostClaude },
      extensionContributed: false
    });
  });
  test("disabled Agent Host is not inherited from remembered or current session types", () => {
    const configurationService = new TestConfigurationService();
    const chatSessionsService = createChatSessionsService();
    const storageService = disposables.add(new TestStorageService());
    recordUserSelectedSessionType(storageService, configurationService, chatSessionsService, localWorkspace, SessionType.AgentHostClaude, true);
    assert.deepStrictEqual({
      usable: isNewChatSessionTypeUsable(SessionType.AgentHostClaude, configurationService, chatSessionsService, localWorkspace, false),
      remembered: getDefaultNewChatSessionType(configurationService, chatSessionsService, storageService, localWorkspace, false),
      current: resolveSessionType(configurationService, chatSessionsService, storageService, localWorkspace, false, { currentSessionType: SessionType.AgentHostClaude })
    }, {
      usable: false,
      remembered: localChatSessionType,
      current: { sessionType: localChatSessionType }
    });
  });
  test("local agent setting is ignored only in fully virtual workspaces", () => {
    const configurationService = new TestConfigurationService({
      [ChatConfiguration.EditorLocalAgentEnabled]: false
    });
    const remoteWorkspace = createWorkspace(URI.parse("vscode-remote://ssh-remote+test/workspace"));
    const remoteRepositoriesWorkspace = createWorkspace(URI.parse("vscode-vfs://github/microsoft/vscode"));
    const customVirtualWorkspace = createWorkspace(URI.parse("custom-vfs://provider/workspace"));
    const mixedWorkspace = createWorkspace(URI.file("/workspace"), URI.parse("custom-vfs://provider/workspace"));
    assert.deepStrictEqual({
      local: isEditorLocalAgentEnabled(configurationService, localWorkspace),
      remote: isEditorLocalAgentEnabled(configurationService, remoteWorkspace),
      remoteRepositories: isEditorLocalAgentEnabled(configurationService, remoteRepositoriesWorkspace),
      customVirtual: isEditorLocalAgentEnabled(configurationService, customVirtualWorkspace),
      mixed: isEditorLocalAgentEnabled(configurationService, mixedWorkspace)
    }, {
      local: false,
      remote: false,
      remoteRepositories: true,
      customVirtual: true,
      mixed: false
    });
  });
  test("virtual workspace keeps local available when setting is disabled", () => {
    const configurationService = new TestConfigurationService({
      [ChatConfiguration.EditorLocalAgentEnabled]: false
    });
    const chatSessionsService = createChatSessionsService(SessionType.AgentHostCopilot);
    const storageService = disposables.add(new TestStorageService());
    const workspace = createWorkspace(URI.parse("vscode-vfs://github/microsoft/vscode"));
    assert.deepStrictEqual({
      computed: getComputedDefaultSessionType(configurationService, chatSessionsService, workspace, false),
      rememberedAware: getDefaultNewChatSessionType(configurationService, chatSessionsService, storageService, workspace, false),
      localVisible: isVisibleEditorChatSessionType(localChatSessionType, configurationService, chatSessionsService, workspace),
      localRememberedUsable: isNewChatSessionTypeUsable(localChatSessionType, configurationService, chatSessionsService, workspace)
    }, {
      computed: localChatSessionType,
      rememberedAware: localChatSessionType,
      localVisible: true,
      localRememberedUsable: true
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGNvbW1vblxcY29uc3RhbnRzLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBjb25zdE9ic2VydmFibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RFbmFibGVtZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vYWdlbnRIb3N0RW5hYmxlbWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL3Rlc3QvY29tbW9uL3Rlc3RDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL3Rlc3QvY29tbW9uL2luc3RhbnRpYXRpb25TZXJ2aWNlTW9jay5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSwgV29ya3NwYWNlLCB0b1dvcmtzcGFjZUZvbGRlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IENoYXRDb25maWd1cmF0aW9uLCBDaGF0UGVybWlzc2lvbkxldmVsLCBnZXRDaGF0UGVybWlzc2lvbkxldmVsRnJvbURlZmF1bHRDb25maWd1cmF0aW9uLCBnZXRDb21wdXRlZERlZmF1bHRTZXNzaW9uUmVzb3VyY2UsIGdldENvbXB1dGVkRGVmYXVsdFNlc3Npb25UeXBlLCBnZXREZWZhdWx0TmV3Q2hhdFNlc3Npb25SZXNvdXJjZSwgZ2V0RGVmYXVsdE5ld0NoYXRTZXNzaW9uVHlwZSwgSURlZmF1bHROZXdDaGF0U2Vzc2lvblR5cGVPcHRpb25zLCBpc0VkaXRvckxvY2FsQWdlbnRFbmFibGVkLCBpc05ld0NoYXRTZXNzaW9uVHlwZVVzYWJsZSwgaXNWaXNpYmxlRWRpdG9yQ2hhdFNlc3Npb25UeXBlLCByZWNvcmRVc2VyU2VsZWN0ZWRTZXNzaW9uVHlwZSwgcmVzb2x2ZURlZmF1bHROZXdDaGF0U2Vzc2lvblR5cGUgfSBmcm9tICcuLi8uLi9jb21tb24vY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IGxvY2FsQ2hhdFNlc3Npb25UeXBlLCBTZXNzaW9uVHlwZSwgSUNoYXRTZXNzaW9uc0V4dGVuc2lvblBvaW50LCBJQ2hhdFNlc3Npb25zU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9jaGF0U2Vzc2lvbnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IE1vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlIH0gZnJvbSAnLi9tb2NrQ2hhdFNlc3Npb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBUZXN0Q29udGV4dFNlcnZpY2UsIFRlc3RTdG9yYWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3Rlc3QvY29tbW9uL3dvcmtiZW5jaFRlc3RTZXJ2aWNlcy5qcyc7XG5pbXBvcnQgeyBnZXRSZW1lbWJlcmVkU2Vzc2lvblR5cGUgfSBmcm9tICcuLi8uLi9jb21tb24vY2hhdFNlc3Npb25UeXBlUHJlZmVyZW5jZS5qcyc7XG5pbXBvcnQgeyBnZXRDaGF0U2Vzc2lvblR5cGUgfSBmcm9tICcuLi8uLi9jb21tb24vbW9kZWwvY2hhdFVyaS5qcyc7XG5cbnN1aXRlKCdDaGF0Q29uZmlndXJhdGlvbiBkZWZhdWx0cycsICgpID0+IHtcblxuXHRjb25zdCBkaXNwb3NhYmxlcyA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXHRjb25zdCBsb2NhbFdvcmtzcGFjZSA9IGNyZWF0ZVdvcmtzcGFjZShVUkkuZmlsZSgnL3dvcmtzcGFjZScpKTtcblxuXHRmdW5jdGlvbiBjcmVhdGVXb3Jrc3BhY2UoLi4ucmVzb3VyY2VzOiBVUklbXSk6IFdvcmtzcGFjZSB7XG5cdFx0cmV0dXJuIG5ldyBXb3Jrc3BhY2UoXG5cdFx0XHRyZXNvdXJjZXMubWFwKHJlc291cmNlID0+IHJlc291cmNlLnRvU3RyaW5nKCkpLmpvaW4oJywnKSxcblx0XHRcdHJlc291cmNlcy5tYXAodG9Xb3Jrc3BhY2VGb2xkZXIpLFxuXHRcdFx0ZmFsc2UsXG5cdFx0XHRudWxsLFxuXHRcdFx0KCkgPT4gZmFsc2UsXG5cdFx0KTtcblx0fVxuXG5cdGZ1bmN0aW9uIGNyZWF0ZUNoYXRTZXNzaW9uc1NlcnZpY2UoLi4udHlwZXM6IHN0cmluZ1tdKTogTW9ja0NoYXRTZXNzaW9uc1NlcnZpY2Uge1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBuZXcgTW9ja0NoYXRTZXNzaW9uc1NlcnZpY2UoKTtcblx0XHRzZXJ2aWNlLnNldENvbnRyaWJ1dGlvbnModHlwZXMubWFwKHR5cGUgPT4gKHtcblx0XHRcdHR5cGUsXG5cdFx0XHRuYW1lOiB0eXBlLFxuXHRcdFx0ZGlzcGxheU5hbWU6IHR5cGUsXG5cdFx0XHRkZXNjcmlwdGlvbjogdHlwZSxcblx0XHR9IHNhdGlzZmllcyBJQ2hhdFNlc3Npb25zRXh0ZW5zaW9uUG9pbnQpKSk7XG5cdFx0cmV0dXJuIHNlcnZpY2U7XG5cdH1cblxuXHRmdW5jdGlvbiByZXNvbHZlU2Vzc2lvblR5cGUoXG5cdFx0Y29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRjaGF0U2Vzc2lvbnNTZXJ2aWNlOiBJQ2hhdFNlc3Npb25zU2VydmljZSxcblx0XHRzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdHdvcmtzcGFjZTogV29ya3NwYWNlLFxuXHRcdGFnZW50SG9zdEVuYWJsZWQ6IGJvb2xlYW4sXG5cdFx0b3B0aW9ucz86IElEZWZhdWx0TmV3Q2hhdFNlc3Npb25UeXBlT3B0aW9ucyxcblx0KSB7XG5cdFx0Y29uc3QgYWNjZXNzb3IgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblx0XHRhY2Nlc3Nvci5zZXQoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0YWNjZXNzb3Iuc2V0KElDaGF0U2Vzc2lvbnNTZXJ2aWNlLCBjaGF0U2Vzc2lvbnNTZXJ2aWNlKTtcblx0XHRhY2Nlc3Nvci5zZXQoSVN0b3JhZ2VTZXJ2aWNlLCBzdG9yYWdlU2VydmljZSk7XG5cdFx0YWNjZXNzb3Iuc2V0KElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSwgbmV3IFRlc3RDb250ZXh0U2VydmljZSh3b3Jrc3BhY2UpKTtcblx0XHRhY2Nlc3Nvci5zZXQoSUFnZW50SG9zdEVuYWJsZW1lbnRTZXJ2aWNlLCB7IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCwgZW5hYmxlZDogY29uc3RPYnNlcnZhYmxlKGFnZW50SG9zdEVuYWJsZWQpIH0pO1xuXHRcdHJldHVybiByZXNvbHZlRGVmYXVsdE5ld0NoYXRTZXNzaW9uVHlwZShhY2Nlc3Nvciwgb3B0aW9ucyk7XG5cdH1cblxuXHR0ZXN0KCdkZWZhdWx0IHBlcm1pc3Npb24gY29uZmlndXJhdGlvbiBtYXBzIHNldHRpbmcgdmFsdWVzIHRvIEFnZW50IEhvc3QgdmFsdWVzJywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0bWFudWFsOiBnZXRDaGF0UGVybWlzc2lvbkxldmVsRnJvbURlZmF1bHRDb25maWd1cmF0aW9uKCdtYW51YWwnKSxcblx0XHRcdGFzc2lzdGVkOiBnZXRDaGF0UGVybWlzc2lvbkxldmVsRnJvbURlZmF1bHRDb25maWd1cmF0aW9uKCdhc3Npc3RlZCcpLFxuXHRcdFx0YWxsb3dBbGw6IGdldENoYXRQZXJtaXNzaW9uTGV2ZWxGcm9tRGVmYXVsdENvbmZpZ3VyYXRpb24oJ2FsbG93QWxsJyksXG5cdFx0XHRsZWdhY3lEZWZhdWx0OiBnZXRDaGF0UGVybWlzc2lvbkxldmVsRnJvbURlZmF1bHRDb25maWd1cmF0aW9uKCdkZWZhdWx0JyksXG5cdFx0XHRsZWdhY3lBdXRvQXBwcm92ZTogZ2V0Q2hhdFBlcm1pc3Npb25MZXZlbEZyb21EZWZhdWx0Q29uZmlndXJhdGlvbignYXV0b0FwcHJvdmUnKSxcblx0XHRcdGludmFsaWQ6IGdldENoYXRQZXJtaXNzaW9uTGV2ZWxGcm9tRGVmYXVsdENvbmZpZ3VyYXRpb24oJ2ludmFsaWQnKSxcblx0XHR9LCB7XG5cdFx0XHRtYW51YWw6IENoYXRQZXJtaXNzaW9uTGV2ZWwuRGVmYXVsdCxcblx0XHRcdGFzc2lzdGVkOiBDaGF0UGVybWlzc2lvbkxldmVsLkFzc2lzdGVkLFxuXHRcdFx0YWxsb3dBbGw6IENoYXRQZXJtaXNzaW9uTGV2ZWwuQXV0b0FwcHJvdmUsXG5cdFx0XHRsZWdhY3lEZWZhdWx0OiBDaGF0UGVybWlzc2lvbkxldmVsLkRlZmF1bHQsXG5cdFx0XHRsZWdhY3lBdXRvQXBwcm92ZTogQ2hhdFBlcm1pc3Npb25MZXZlbC5BdXRvQXBwcm92ZSxcblx0XHRcdGludmFsaWQ6IHVuZGVmaW5lZCxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZWRpdG9yIGRlZmF1bHQgcmV0dXJucyBsb2NhbCB3aGVuIGFnZW50IGhvc3QgZGlzYWJsZWQgYW5kIGxvY2FsIGVuYWJsZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKHtcblx0XHRcdFtDaGF0Q29uZmlndXJhdGlvbi5FZGl0b3JMb2NhbEFnZW50RW5hYmxlZF06IHRydWUsXG5cdFx0fSk7XG5cdFx0Y29uc3QgY2hhdFNlc3Npb25zU2VydmljZSA9IGNyZWF0ZUNoYXRTZXNzaW9uc1NlcnZpY2UoU2Vzc2lvblR5cGUuQWdlbnRIb3N0Q29waWxvdCk7XG5cdFx0Y29uc3Qgc3RvcmFnZVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RTdG9yYWdlU2VydmljZSgpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Y29tcHV0ZWQ6IGdldENvbXB1dGVkRGVmYXVsdFNlc3Npb25UeXBlKGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjaGF0U2Vzc2lvbnNTZXJ2aWNlLCBsb2NhbFdvcmtzcGFjZSwgZmFsc2UpLFxuXHRcdFx0cmVtZW1iZXJlZEF3YXJlOiBnZXREZWZhdWx0TmV3Q2hhdFNlc3Npb25UeXBlKGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjaGF0U2Vzc2lvbnNTZXJ2aWNlLCBzdG9yYWdlU2VydmljZSwgbG9jYWxXb3Jrc3BhY2UsIGZhbHNlKSxcblx0XHRcdGxvY2FsVmlzaWJsZTogaXNWaXNpYmxlRWRpdG9yQ2hhdFNlc3Npb25UeXBlKGxvY2FsQ2hhdFNlc3Npb25UeXBlLCBjb25maWd1cmF0aW9uU2VydmljZSwgY2hhdFNlc3Npb25zU2VydmljZSwgbG9jYWxXb3Jrc3BhY2UpLFxuXHRcdH0sIHtcblx0XHRcdGNvbXB1dGVkOiBsb2NhbENoYXRTZXNzaW9uVHlwZSxcblx0XHRcdHJlbWVtYmVyZWRBd2FyZTogbG9jYWxDaGF0U2Vzc2lvblR5cGUsXG5cdFx0XHRsb2NhbFZpc2libGU6IHRydWUsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2VkaXRvciBkZWZhdWx0IHByZWZlcnMgYWdlbnQgaG9zdCBDb3BpbG90IHdoZW4gdGhlIGFnZW50IGhvc3QgaXMgZW5hYmxlZCcsICgpID0+IHtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2Uoe1xuXHRcdFx0W0NoYXRDb25maWd1cmF0aW9uLkRlZmF1bHRUb0NvcGlsb3RIYXJuZXNzXTogdHJ1ZSxcblx0XHR9KTtcblx0XHRjb25zdCBjaGF0U2Vzc2lvbnNTZXJ2aWNlID0gY3JlYXRlQ2hhdFNlc3Npb25zU2VydmljZShTZXNzaW9uVHlwZS5BZ2VudEhvc3RDb3BpbG90KTtcblx0XHRjb25zdCBzdG9yYWdlU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdFN0b3JhZ2VTZXJ2aWNlKCkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRjb21wdXRlZDogZ2V0Q29tcHV0ZWREZWZhdWx0U2Vzc2lvblR5cGUoY29uZmlndXJhdGlvblNlcnZpY2UsIGNoYXRTZXNzaW9uc1NlcnZpY2UsIGxvY2FsV29ya3NwYWNlLCB0cnVlKSxcblx0XHRcdHJlbWVtYmVyZWRBd2FyZTogZ2V0RGVmYXVsdE5ld0NoYXRTZXNzaW9uVHlwZShjb25maWd1cmF0aW9uU2VydmljZSwgY2hhdFNlc3Npb25zU2VydmljZSwgc3RvcmFnZVNlcnZpY2UsIGxvY2FsV29ya3NwYWNlLCB0cnVlKSxcblx0XHRcdGxvY2FsVmlzaWJsZTogaXNWaXNpYmxlRWRpdG9yQ2hhdFNlc3Npb25UeXBlKGxvY2FsQ2hhdFNlc3Npb25UeXBlLCBjb25maWd1cmF0aW9uU2VydmljZSwgY2hhdFNlc3Npb25zU2VydmljZSwgbG9jYWxXb3Jrc3BhY2UpLFxuXHRcdFx0Y29waWxvdFZpc2libGU6IGlzVmlzaWJsZUVkaXRvckNoYXRTZXNzaW9uVHlwZShTZXNzaW9uVHlwZS5BZ2VudEhvc3RDb3BpbG90LCBjb25maWd1cmF0aW9uU2VydmljZSwgY2hhdFNlc3Npb25zU2VydmljZSwgbG9jYWxXb3Jrc3BhY2UpLFxuXHRcdH0sIHtcblx0XHRcdGNvbXB1dGVkOiBTZXNzaW9uVHlwZS5BZ2VudEhvc3RDb3BpbG90LFxuXHRcdFx0cmVtZW1iZXJlZEF3YXJlOiBTZXNzaW9uVHlwZS5BZ2VudEhvc3RDb3BpbG90LFxuXHRcdFx0bG9jYWxWaXNpYmxlOiBmYWxzZSxcblx0XHRcdGNvcGlsb3RWaXNpYmxlOiBmYWxzZSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnRm9yZ2UgZGVmYXVsdHMgbmV3IHdvcmtiZW5jaCBjaGF0cyB0byBDb2RleCBiZWZvcmUgcmVtZW1iZXJlZCBhbmQgQ29waWxvdCBoYXJuZXNzZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKHtcblx0XHRcdFtDaGF0Q29uZmlndXJhdGlvbi5EZWZhdWx0VG9Db2RleEhhcm5lc3NdOiB0cnVlLFxuXHRcdFx0W0NoYXRDb25maWd1cmF0aW9uLkRlZmF1bHRUb0NvcGlsb3RIYXJuZXNzXTogdHJ1ZSxcblx0XHR9KTtcblx0XHRjb25zdCBjaGF0U2Vzc2lvbnNTZXJ2aWNlID0gY3JlYXRlQ2hhdFNlc3Npb25zU2VydmljZShTZXNzaW9uVHlwZS5BZ2VudEhvc3RDb2RleCwgU2Vzc2lvblR5cGUuQWdlbnRIb3N0Q29waWxvdCk7XG5cdFx0Y29uc3Qgc3RvcmFnZVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RTdG9yYWdlU2VydmljZSgpKTtcblx0XHRyZWNvcmRVc2VyU2VsZWN0ZWRTZXNzaW9uVHlwZShzdG9yYWdlU2VydmljZSwgbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSgpLCBjaGF0U2Vzc2lvbnNTZXJ2aWNlLCBsb2NhbFdvcmtzcGFjZSwgU2Vzc2lvblR5cGUuQWdlbnRIb3N0Q29waWxvdCwgdHJ1ZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGNvbXB1dGVkOiBnZXRDb21wdXRlZERlZmF1bHRTZXNzaW9uVHlwZShjb25maWd1cmF0aW9uU2VydmljZSwgY2hhdFNlc3Npb25zU2VydmljZSwgbG9jYWxXb3Jrc3BhY2UsIHRydWUpLFxuXHRcdFx0cmVtZW1iZXJlZEF3YXJlOiBnZXREZWZhdWx0TmV3Q2hhdFNlc3Npb25UeXBlKGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjaGF0U2Vzc2lvbnNTZXJ2aWNlLCBzdG9yYWdlU2VydmljZSwgbG9jYWxXb3Jrc3BhY2UsIHRydWUsIHsgY3VycmVudFNlc3Npb25UeXBlOiBTZXNzaW9uVHlwZS5BZ2VudEhvc3RDb3BpbG90IH0pLFxuXHRcdFx0cmVzb2x2ZWQ6IHJlc29sdmVTZXNzaW9uVHlwZShjb25maWd1cmF0aW9uU2VydmljZSwgY2hhdFNlc3Npb25zU2VydmljZSwgc3RvcmFnZVNlcnZpY2UsIGxvY2FsV29ya3NwYWNlLCB0cnVlLCB7IGN1cnJlbnRTZXNzaW9uVHlwZTogU2Vzc2lvblR5cGUuQWdlbnRIb3N0Q29waWxvdCB9KSxcblx0XHR9LCB7XG5cdFx0XHRjb21wdXRlZDogU2Vzc2lvblR5cGUuQWdlbnRIb3N0Q29kZXgsXG5cdFx0XHRyZW1lbWJlcmVkQXdhcmU6IFNlc3Npb25UeXBlLkFnZW50SG9zdENvZGV4LFxuXHRcdFx0cmVzb2x2ZWQ6IHsgc2Vzc2lvblR5cGU6IFNlc3Npb25UeXBlLkFnZW50SG9zdENvZGV4IH0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2VkaXRvciBkZWZhdWx0IHN0YXlzIGxvY2FsIHdoZW4gdGhlIGFnZW50IGhvc3QgaXMgZW5hYmxlZCBidXQgdGhlIENvcGlsb3QgZGVmYXVsdCBpcyBub3Qgb3B0ZWQgaW4nLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKCk7XG5cdFx0Y29uc3QgY2hhdFNlc3Npb25zU2VydmljZSA9IGNyZWF0ZUNoYXRTZXNzaW9uc1NlcnZpY2UoU2Vzc2lvblR5cGUuQWdlbnRIb3N0Q29waWxvdCk7XG5cdFx0Y29uc3Qgc3RvcmFnZVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RTdG9yYWdlU2VydmljZSgpKTtcblxuXHRcdC8vIFRoZSBhZ2VudCBob3N0IGlzIGVuYWJsZWQgYnV0IGBjaGF0LmRlZmF1bHRUb0NvcGlsb3RIYXJuZXNzYCBpcyBvZmYgKGl0c1xuXHRcdC8vIGRlZmF1bHQpLCBzbyB0aGUgY29tcHV0ZWQgZGVmYXVsdCByZW1haW5zIHRoZSBsb2NhbCBoYXJuZXNzLlxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Y29tcHV0ZWQ6IGdldENvbXB1dGVkRGVmYXVsdFNlc3Npb25UeXBlKGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjaGF0U2Vzc2lvbnNTZXJ2aWNlLCBsb2NhbFdvcmtzcGFjZSwgdHJ1ZSksXG5cdFx0XHRyZW1lbWJlcmVkQXdhcmU6IGdldERlZmF1bHROZXdDaGF0U2Vzc2lvblR5cGUoY29uZmlndXJhdGlvblNlcnZpY2UsIGNoYXRTZXNzaW9uc1NlcnZpY2UsIHN0b3JhZ2VTZXJ2aWNlLCBsb2NhbFdvcmtzcGFjZSwgdHJ1ZSksXG5cdFx0fSwge1xuXHRcdFx0Y29tcHV0ZWQ6IGxvY2FsQ2hhdFNlc3Npb25UeXBlLFxuXHRcdFx0cmVtZW1iZXJlZEF3YXJlOiBsb2NhbENoYXRTZXNzaW9uVHlwZSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZWRpdG9yIGRlZmF1bHQga2VlcHMgYWdlbnQgaG9zdCBDb3BpbG90IGJlZm9yZSBjb250cmlidXRpb24gcmVnaXN0ZXJzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSh7XG5cdFx0XHRbQ2hhdENvbmZpZ3VyYXRpb24uRGVmYXVsdFRvQ29waWxvdEhhcm5lc3NdOiB0cnVlLFxuXHRcdFx0W0NoYXRDb25maWd1cmF0aW9uLkVkaXRvckxvY2FsQWdlbnRFbmFibGVkXTogZmFsc2UsXG5cdFx0fSk7XG5cdFx0Y29uc3QgY2hhdFNlc3Npb25zU2VydmljZSA9IGNyZWF0ZUNoYXRTZXNzaW9uc1NlcnZpY2UoU2Vzc2lvblR5cGUuQ29waWxvdENMSSk7XG5cdFx0Y29uc3Qgc3RvcmFnZVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RTdG9yYWdlU2VydmljZSgpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Y29tcHV0ZWQ6IGdldENvbXB1dGVkRGVmYXVsdFNlc3Npb25UeXBlKGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjaGF0U2Vzc2lvbnNTZXJ2aWNlLCBsb2NhbFdvcmtzcGFjZSwgdHJ1ZSksXG5cdFx0XHRyZW1lbWJlcmVkQXdhcmU6IGdldERlZmF1bHROZXdDaGF0U2Vzc2lvblR5cGUoY29uZmlndXJhdGlvblNlcnZpY2UsIGNoYXRTZXNzaW9uc1NlcnZpY2UsIHN0b3JhZ2VTZXJ2aWNlLCBsb2NhbFdvcmtzcGFjZSwgdHJ1ZSksXG5cdFx0XHRsb2NhbFZpc2libGU6IGlzVmlzaWJsZUVkaXRvckNoYXRTZXNzaW9uVHlwZShsb2NhbENoYXRTZXNzaW9uVHlwZSwgY29uZmlndXJhdGlvblNlcnZpY2UsIGNoYXRTZXNzaW9uc1NlcnZpY2UsIGxvY2FsV29ya3NwYWNlKSxcblx0XHR9LCB7XG5cdFx0XHRjb21wdXRlZDogU2Vzc2lvblR5cGUuQWdlbnRIb3N0Q29waWxvdCxcblx0XHRcdHJlbWVtYmVyZWRBd2FyZTogU2Vzc2lvblR5cGUuQWdlbnRIb3N0Q29waWxvdCxcblx0XHRcdGxvY2FsVmlzaWJsZTogZmFsc2UsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2VkaXRvciBkZWZhdWx0IHNraXBzIGV4dGVuc2lvbiBob3N0IENvcGlsb3QgQ0xJJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSh7XG5cdFx0XHRbQ2hhdENvbmZpZ3VyYXRpb24uRWRpdG9yTG9jYWxBZ2VudEVuYWJsZWRdOiBmYWxzZSxcblx0XHR9KTtcblx0XHRjb25zdCBjaGF0U2Vzc2lvbnNTZXJ2aWNlID0gY3JlYXRlQ2hhdFNlc3Npb25zU2VydmljZShTZXNzaW9uVHlwZS5Db3BpbG90Q0xJLCBTZXNzaW9uVHlwZS5BZ2VudEhvc3RDb3BpbG90KTtcblx0XHRjb25zdCBzdG9yYWdlU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdFN0b3JhZ2VTZXJ2aWNlKCkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRjb21wdXRlZDogZ2V0Q29tcHV0ZWREZWZhdWx0U2Vzc2lvblR5cGUoY29uZmlndXJhdGlvblNlcnZpY2UsIGNoYXRTZXNzaW9uc1NlcnZpY2UsIGxvY2FsV29ya3NwYWNlLCBmYWxzZSksXG5cdFx0XHRyZW1lbWJlcmVkQXdhcmU6IGdldERlZmF1bHROZXdDaGF0U2Vzc2lvblR5cGUoY29uZmlndXJhdGlvblNlcnZpY2UsIGNoYXRTZXNzaW9uc1NlcnZpY2UsIHN0b3JhZ2VTZXJ2aWNlLCBsb2NhbFdvcmtzcGFjZSwgZmFsc2UpLFxuXHRcdFx0ZXh0ZW5zaW9uSG9zdFZpc2libGU6IGlzVmlzaWJsZUVkaXRvckNoYXRTZXNzaW9uVHlwZShTZXNzaW9uVHlwZS5Db3BpbG90Q0xJLCBjb25maWd1cmF0aW9uU2VydmljZSwgY2hhdFNlc3Npb25zU2VydmljZSwgbG9jYWxXb3Jrc3BhY2UpLFxuXHRcdFx0Y29waWxvdFZpc2libGU6IGlzVmlzaWJsZUVkaXRvckNoYXRTZXNzaW9uVHlwZShTZXNzaW9uVHlwZS5BZ2VudEhvc3RDb3BpbG90LCBjb25maWd1cmF0aW9uU2VydmljZSwgY2hhdFNlc3Npb25zU2VydmljZSwgbG9jYWxXb3Jrc3BhY2UpLFxuXHRcdH0sIHtcblx0XHRcdGNvbXB1dGVkOiBsb2NhbENoYXRTZXNzaW9uVHlwZSxcblx0XHRcdHJlbWVtYmVyZWRBd2FyZTogbG9jYWxDaGF0U2Vzc2lvblR5cGUsXG5cdFx0XHRleHRlbnNpb25Ib3N0VmlzaWJsZTogZmFsc2UsXG5cdFx0XHRjb3BpbG90VmlzaWJsZTogZmFsc2UsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlbWVtYmVyZWQgZXh0ZW5zaW9uIGhvc3QgQ29waWxvdCBDTEkgZmFsbHMgYmFjayBmb3IgYSBuZXcgY2hhdCcsICgpID0+IHtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoKTtcblx0XHRjb25zdCBjaGF0U2Vzc2lvbnNTZXJ2aWNlID0gY3JlYXRlQ2hhdFNlc3Npb25zU2VydmljZShTZXNzaW9uVHlwZS5Db3BpbG90Q0xJLCBTZXNzaW9uVHlwZS5BZ2VudEhvc3RDb3BpbG90KTtcblx0XHRjb25zdCBzdG9yYWdlU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdFN0b3JhZ2VTZXJ2aWNlKCkpO1xuXG5cdFx0cmVjb3JkVXNlclNlbGVjdGVkU2Vzc2lvblR5cGUoc3RvcmFnZVNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjaGF0U2Vzc2lvbnNTZXJ2aWNlLCBsb2NhbFdvcmtzcGFjZSwgU2Vzc2lvblR5cGUuQ29waWxvdENMSSwgdHJ1ZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHJlbWVtYmVyZWQ6IGdldFJlbWVtYmVyZWRTZXNzaW9uVHlwZShzdG9yYWdlU2VydmljZSksXG5cdFx0XHRyZW1lbWJlcmVkVXNhYmxlOiBpc05ld0NoYXRTZXNzaW9uVHlwZVVzYWJsZShTZXNzaW9uVHlwZS5Db3BpbG90Q0xJLCBjb25maWd1cmF0aW9uU2VydmljZSwgY2hhdFNlc3Npb25zU2VydmljZSwgbG9jYWxXb3Jrc3BhY2UpLFxuXHRcdFx0bmV3U2Vzc2lvblR5cGU6IGdldERlZmF1bHROZXdDaGF0U2Vzc2lvblR5cGUoY29uZmlndXJhdGlvblNlcnZpY2UsIGNoYXRTZXNzaW9uc1NlcnZpY2UsIHN0b3JhZ2VTZXJ2aWNlLCBsb2NhbFdvcmtzcGFjZSwgdHJ1ZSksXG5cdFx0fSwge1xuXHRcdFx0cmVtZW1iZXJlZDogU2Vzc2lvblR5cGUuQ29waWxvdENMSSxcblx0XHRcdHJlbWVtYmVyZWRVc2FibGU6IGZhbHNlLFxuXHRcdFx0bmV3U2Vzc2lvblR5cGU6IGxvY2FsQ2hhdFNlc3Npb25UeXBlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjdXJyZW50IGV4dGVuc2lvbiBob3N0IENvcGlsb3QgQ0xJIGlzIG5vdCBpbmhlcml0ZWQgYnkgYSBuZXcgY2hhdCcsICgpID0+IHtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoKTtcblx0XHRjb25zdCBjaGF0U2Vzc2lvbnNTZXJ2aWNlID0gY3JlYXRlQ2hhdFNlc3Npb25zU2VydmljZShTZXNzaW9uVHlwZS5Db3BpbG90Q0xJLCBTZXNzaW9uVHlwZS5BZ2VudEhvc3RDb3BpbG90KTtcblx0XHRjb25zdCBzdG9yYWdlU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdFN0b3JhZ2VTZXJ2aWNlKCkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHJlc29sdmVTZXNzaW9uVHlwZShjb25maWd1cmF0aW9uU2VydmljZSwgY2hhdFNlc3Npb25zU2VydmljZSwgc3RvcmFnZVNlcnZpY2UsIGxvY2FsV29ya3NwYWNlLCB0cnVlLCB7IGN1cnJlbnRTZXNzaW9uVHlwZTogU2Vzc2lvblR5cGUuQ29waWxvdENMSSB9KSxcblx0XHRcdHsgc2Vzc2lvblR5cGU6IGxvY2FsQ2hhdFNlc3Npb25UeXBlIH1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdlZGl0b3IgZGVmYXVsdCBrZWVwcyBsb2NhbCBhcyBsYXN0IHJlc29ydCB3aGVuIGxvY2FsIGlzIGRpc2FibGVkIHdpdGhvdXQgYW55IHByb3ZpZGVyJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSh7XG5cdFx0XHRbQ2hhdENvbmZpZ3VyYXRpb24uRWRpdG9yTG9jYWxBZ2VudEVuYWJsZWRdOiBmYWxzZSxcblx0XHR9KTtcblx0XHRjb25zdCBjaGF0U2Vzc2lvbnNTZXJ2aWNlID0gY3JlYXRlQ2hhdFNlc3Npb25zU2VydmljZSgpO1xuXHRcdGNvbnN0IHN0b3JhZ2VTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0U3RvcmFnZVNlcnZpY2UoKSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGNvbXB1dGVkOiBnZXRDb21wdXRlZERlZmF1bHRTZXNzaW9uVHlwZShjb25maWd1cmF0aW9uU2VydmljZSwgY2hhdFNlc3Npb25zU2VydmljZSwgbG9jYWxXb3Jrc3BhY2UsIGZhbHNlKSxcblx0XHRcdHJlbWVtYmVyZWRBd2FyZTogZ2V0RGVmYXVsdE5ld0NoYXRTZXNzaW9uVHlwZShjb25maWd1cmF0aW9uU2VydmljZSwgY2hhdFNlc3Npb25zU2VydmljZSwgc3RvcmFnZVNlcnZpY2UsIGxvY2FsV29ya3NwYWNlLCBmYWxzZSksXG5cdFx0XHRsb2NhbFZpc2libGU6IGlzVmlzaWJsZUVkaXRvckNoYXRTZXNzaW9uVHlwZShsb2NhbENoYXRTZXNzaW9uVHlwZSwgY29uZmlndXJhdGlvblNlcnZpY2UsIGNoYXRTZXNzaW9uc1NlcnZpY2UsIGxvY2FsV29ya3NwYWNlKSxcblx0XHR9LCB7XG5cdFx0XHRjb21wdXRlZDogbG9jYWxDaGF0U2Vzc2lvblR5cGUsXG5cdFx0XHRyZW1lbWJlcmVkQXdhcmU6IGxvY2FsQ2hhdFNlc3Npb25UeXBlLFxuXHRcdFx0bG9jYWxWaXNpYmxlOiBmYWxzZSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVtZW1iZXJlZCBub24tbG9jYWwgc2VsZWN0aW9uIHdpbnMgb3ZlciB0aGUgYWdlbnQgaG9zdCBkZWZhdWx0JywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSh7XG5cdFx0XHRbQ2hhdENvbmZpZ3VyYXRpb24uRGVmYXVsdFRvQ29waWxvdEhhcm5lc3NdOiB0cnVlLFxuXHRcdH0pO1xuXHRcdGNvbnN0IGNoYXRTZXNzaW9uc1NlcnZpY2UgPSBjcmVhdGVDaGF0U2Vzc2lvbnNTZXJ2aWNlKFNlc3Npb25UeXBlLkFnZW50SG9zdENvcGlsb3QsIFNlc3Npb25UeXBlLkFnZW50SG9zdENsYXVkZSk7XG5cdFx0Y29uc3Qgc3RvcmFnZVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RTdG9yYWdlU2VydmljZSgpKTtcblxuXHRcdHJlY29yZFVzZXJTZWxlY3RlZFNlc3Npb25UeXBlKHN0b3JhZ2VTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSwgY2hhdFNlc3Npb25zU2VydmljZSwgbG9jYWxXb3Jrc3BhY2UsIFNlc3Npb25UeXBlLkFnZW50SG9zdENsYXVkZSwgdHJ1ZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGNvbXB1dGVkOiBnZXRDb21wdXRlZERlZmF1bHRTZXNzaW9uVHlwZShjb25maWd1cmF0aW9uU2VydmljZSwgY2hhdFNlc3Npb25zU2VydmljZSwgbG9jYWxXb3Jrc3BhY2UsIHRydWUpLFxuXHRcdFx0cmVtZW1iZXJlZDogZ2V0UmVtZW1iZXJlZFNlc3Npb25UeXBlKHN0b3JhZ2VTZXJ2aWNlKSxcblx0XHRcdHJlbWVtYmVyZWRBd2FyZTogcmVzb2x2ZVNlc3Npb25UeXBlKGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjaGF0U2Vzc2lvbnNTZXJ2aWNlLCBzdG9yYWdlU2VydmljZSwgbG9jYWxXb3Jrc3BhY2UsIHRydWUsIHsgY3VycmVudFNlc3Npb25UeXBlOiBsb2NhbENoYXRTZXNzaW9uVHlwZSB9KSxcblx0XHR9LCB7XG5cdFx0XHRjb21wdXRlZDogU2Vzc2lvblR5cGUuQWdlbnRIb3N0Q29waWxvdCxcblx0XHRcdHJlbWVtYmVyZWQ6IFNlc3Npb25UeXBlLkFnZW50SG9zdENsYXVkZSxcblx0XHRcdHJlbWVtYmVyZWRBd2FyZTogeyBzZXNzaW9uVHlwZTogU2Vzc2lvblR5cGUuQWdlbnRIb3N0Q2xhdWRlIH0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2V4cGxpY2l0IG92ZXJyaWRlIHdpbnMgb3ZlciByZW1lbWJlcmVkIHNlbGVjdGlvbicsICgpID0+IHtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoKTtcblx0XHRjb25zdCBjaGF0U2Vzc2lvbnNTZXJ2aWNlID0gY3JlYXRlQ2hhdFNlc3Npb25zU2VydmljZShTZXNzaW9uVHlwZS5BZ2VudEhvc3RDb3BpbG90LCBTZXNzaW9uVHlwZS5BZ2VudEhvc3RDbGF1ZGUpO1xuXHRcdGNvbnN0IHN0b3JhZ2VTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0U3RvcmFnZVNlcnZpY2UoKSk7XG5cblx0XHRyZWNvcmRVc2VyU2VsZWN0ZWRTZXNzaW9uVHlwZShzdG9yYWdlU2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UsIGNoYXRTZXNzaW9uc1NlcnZpY2UsIGxvY2FsV29ya3NwYWNlLCBTZXNzaW9uVHlwZS5BZ2VudEhvc3RDbGF1ZGUsIGZhbHNlKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cmVtZW1iZXJlZDogZ2V0UmVtZW1iZXJlZFNlc3Npb25UeXBlKHN0b3JhZ2VTZXJ2aWNlKSxcblx0XHRcdHJlbWVtYmVyZWRBd2FyZTogZ2V0RGVmYXVsdE5ld0NoYXRTZXNzaW9uVHlwZShjb25maWd1cmF0aW9uU2VydmljZSwgY2hhdFNlc3Npb25zU2VydmljZSwgc3RvcmFnZVNlcnZpY2UsIGxvY2FsV29ya3NwYWNlLCBmYWxzZSwgeyBleHBsaWNpdE92ZXJyaWRlOiBTZXNzaW9uVHlwZS5BZ2VudEhvc3RDb3BpbG90IH0pLFxuXHRcdH0sIHtcblx0XHRcdHJlbWVtYmVyZWQ6IFNlc3Npb25UeXBlLkFnZW50SG9zdENsYXVkZSxcblx0XHRcdHJlbWVtYmVyZWRBd2FyZTogU2Vzc2lvblR5cGUuQWdlbnRIb3N0Q29waWxvdCxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnY3VycmVudCBzZXNzaW9uIHR5cGUgaXMgZmFsbGJhY2sgYWZ0ZXIgcmVtZW1iZXJlZCBzZWxlY3Rpb24nLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKCk7XG5cdFx0Y29uc3QgY2hhdFNlc3Npb25zU2VydmljZSA9IGNyZWF0ZUNoYXRTZXNzaW9uc1NlcnZpY2UoU2Vzc2lvblR5cGUuQWdlbnRIb3N0Q29waWxvdCwgU2Vzc2lvblR5cGUuQWdlbnRIb3N0Q2xhdWRlKTtcblx0XHRjb25zdCBzdG9yYWdlU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdFN0b3JhZ2VTZXJ2aWNlKCkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHR3aXRob3V0UmVtZW1iZXJlZDogZ2V0RGVmYXVsdE5ld0NoYXRTZXNzaW9uVHlwZShjb25maWd1cmF0aW9uU2VydmljZSwgY2hhdFNlc3Npb25zU2VydmljZSwgc3RvcmFnZVNlcnZpY2UsIGxvY2FsV29ya3NwYWNlLCB0cnVlLCB7IGN1cnJlbnRTZXNzaW9uVHlwZTogU2Vzc2lvblR5cGUuQWdlbnRIb3N0Q29waWxvdCB9KSxcblx0XHR9LCB7XG5cdFx0XHR3aXRob3V0UmVtZW1iZXJlZDogU2Vzc2lvblR5cGUuQWdlbnRIb3N0Q29waWxvdCxcblx0XHR9KTtcblxuXHRcdHJlY29yZFVzZXJTZWxlY3RlZFNlc3Npb25UeXBlKHN0b3JhZ2VTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSwgY2hhdFNlc3Npb25zU2VydmljZSwgbG9jYWxXb3Jrc3BhY2UsIFNlc3Npb25UeXBlLkFnZW50SG9zdENsYXVkZSwgZmFsc2UpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHR3aXRoUmVtZW1iZXJlZDogZ2V0RGVmYXVsdE5ld0NoYXRTZXNzaW9uVHlwZShjb25maWd1cmF0aW9uU2VydmljZSwgY2hhdFNlc3Npb25zU2VydmljZSwgc3RvcmFnZVNlcnZpY2UsIGxvY2FsV29ya3NwYWNlLCB0cnVlLCB7IGN1cnJlbnRTZXNzaW9uVHlwZTogU2Vzc2lvblR5cGUuQWdlbnRIb3N0Q29waWxvdCB9KSxcblx0XHR9LCB7XG5cdFx0XHR3aXRoUmVtZW1iZXJlZDogU2Vzc2lvblR5cGUuQWdlbnRIb3N0Q2xhdWRlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdwcmVmZXJDb3BpbG90SGFybmVzcyByZXBsYWNlcyBsb2NhbCBvbiBldmVyeSBuZXcgY2hhdCcsICgpID0+IHtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2Uoe1xuXHRcdFx0W0NoYXRDb25maWd1cmF0aW9uLkVkaXRvclByZWZlckNvcGlsb3RIYXJuZXNzXTogdHJ1ZSxcblx0XHR9KTtcblx0XHRjb25zdCBjaGF0U2Vzc2lvbnNTZXJ2aWNlID0gY3JlYXRlQ2hhdFNlc3Npb25zU2VydmljZShTZXNzaW9uVHlwZS5BZ2VudEhvc3RDb3BpbG90LCBTZXNzaW9uVHlwZS5BZ2VudEhvc3RDbGF1ZGUpO1xuXHRcdGNvbnN0IHN0b3JhZ2VTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0U3RvcmFnZVNlcnZpY2UoKSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGZpcnN0UmVzb2x2ZTogcmVzb2x2ZVNlc3Npb25UeXBlKGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjaGF0U2Vzc2lvbnNTZXJ2aWNlLCBzdG9yYWdlU2VydmljZSwgbG9jYWxXb3Jrc3BhY2UsIHRydWUsIHsgY3VycmVudFNlc3Npb25UeXBlOiBsb2NhbENoYXRTZXNzaW9uVHlwZSB9KSxcblx0XHRcdHNlY29uZFJlc29sdmU6IHJlc29sdmVTZXNzaW9uVHlwZShjb25maWd1cmF0aW9uU2VydmljZSwgY2hhdFNlc3Npb25zU2VydmljZSwgc3RvcmFnZVNlcnZpY2UsIGxvY2FsV29ya3NwYWNlLCB0cnVlLCB7IGN1cnJlbnRTZXNzaW9uVHlwZTogbG9jYWxDaGF0U2Vzc2lvblR5cGUgfSksXG5cdFx0fSwge1xuXHRcdFx0Zmlyc3RSZXNvbHZlOiB7IHNlc3Npb25UeXBlOiBTZXNzaW9uVHlwZS5BZ2VudEhvc3RDb3BpbG90IH0sXG5cdFx0XHRzZWNvbmRSZXNvbHZlOiB7IHNlc3Npb25UeXBlOiBTZXNzaW9uVHlwZS5BZ2VudEhvc3RDb3BpbG90IH0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0NvcGlsb3QgcHJlZmVyZW5jZSBpcyBza2lwcGVkIHdoZW4gdGhlIGFnZW50IGhvc3QgaXMgZGlzYWJsZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKHtcblx0XHRcdFtDaGF0Q29uZmlndXJhdGlvbi5FZGl0b3JQcmVmZXJDb3BpbG90SGFybmVzc106IHRydWUsXG5cdFx0fSk7XG5cdFx0Y29uc3QgY2hhdFNlc3Npb25zU2VydmljZSA9IGNyZWF0ZUNoYXRTZXNzaW9uc1NlcnZpY2UoU2Vzc2lvblR5cGUuQWdlbnRIb3N0Q29waWxvdCk7XG5cdFx0Y29uc3Qgc3RvcmFnZVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RTdG9yYWdlU2VydmljZSgpKTtcblxuXHRcdC8vIFdpdGggdGhlIGFnZW50IGhvc3QgZGlzYWJsZWQgKGUuZy4gb24gd2ViKSwgdGhlIENvcGlsb3QgaGFybmVzcyBpcyB1bmF2YWlsYWJsZS5cblx0XHRjb25zdCByZXNvbHZlZCA9IHJlc29sdmVTZXNzaW9uVHlwZShjb25maWd1cmF0aW9uU2VydmljZSwgY2hhdFNlc3Npb25zU2VydmljZSwgc3RvcmFnZVNlcnZpY2UsIGxvY2FsV29ya3NwYWNlLCBmYWxzZSwgeyBjdXJyZW50U2Vzc2lvblR5cGU6IGxvY2FsQ2hhdFNlc3Npb25UeXBlIH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRyZXNvbHZlZCxcblx0XHR9LCB7XG5cdFx0XHRyZXNvbHZlZDogeyBzZXNzaW9uVHlwZTogbG9jYWxDaGF0U2Vzc2lvblR5cGUgfSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncHJlZmVyQ29waWxvdEhhcm5lc3MgcHJlc2VydmVzIENsYXVkZSBhbmQgQ29kZXggc2VsZWN0aW9ucycsICgpID0+IHtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2Uoe1xuXHRcdFx0W0NoYXRDb25maWd1cmF0aW9uLkVkaXRvclByZWZlckNvcGlsb3RIYXJuZXNzXTogdHJ1ZSxcblx0XHRcdFtDaGF0Q29uZmlndXJhdGlvbi5FZGl0b3JMb2NhbEFnZW50RW5hYmxlZF06IHRydWUsXG5cdFx0fSk7XG5cdFx0Y29uc3QgY2hhdFNlc3Npb25zU2VydmljZSA9IGNyZWF0ZUNoYXRTZXNzaW9uc1NlcnZpY2UoU2Vzc2lvblR5cGUuQWdlbnRIb3N0Q29waWxvdCwgU2Vzc2lvblR5cGUuQWdlbnRIb3N0Q2xhdWRlLCBTZXNzaW9uVHlwZS5BZ2VudEhvc3RDb2RleCk7XG5cdFx0Y29uc3Qgc3RvcmFnZVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RTdG9yYWdlU2VydmljZSgpKTtcblxuXHRcdGNvbnN0IGN1cnJlbnRDbGF1ZGUgPSByZXNvbHZlU2Vzc2lvblR5cGUoY29uZmlndXJhdGlvblNlcnZpY2UsIGNoYXRTZXNzaW9uc1NlcnZpY2UsIHN0b3JhZ2VTZXJ2aWNlLCBsb2NhbFdvcmtzcGFjZSwgdHJ1ZSwgeyBjdXJyZW50U2Vzc2lvblR5cGU6IFNlc3Npb25UeXBlLkFnZW50SG9zdENsYXVkZSB9KTtcblx0XHRjb25zdCBjdXJyZW50Q29kZXggPSByZXNvbHZlU2Vzc2lvblR5cGUoY29uZmlndXJhdGlvblNlcnZpY2UsIGNoYXRTZXNzaW9uc1NlcnZpY2UsIHN0b3JhZ2VTZXJ2aWNlLCBsb2NhbFdvcmtzcGFjZSwgdHJ1ZSwgeyBjdXJyZW50U2Vzc2lvblR5cGU6IFNlc3Npb25UeXBlLkFnZW50SG9zdENvZGV4IH0pO1xuXHRcdHJlY29yZFVzZXJTZWxlY3RlZFNlc3Npb25UeXBlKHN0b3JhZ2VTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSwgY2hhdFNlc3Npb25zU2VydmljZSwgbG9jYWxXb3Jrc3BhY2UsIFNlc3Npb25UeXBlLkFnZW50SG9zdENsYXVkZSwgdHJ1ZSk7XG5cdFx0Y29uc3QgcmVtZW1iZXJlZENsYXVkZSA9IHJlc29sdmVTZXNzaW9uVHlwZShjb25maWd1cmF0aW9uU2VydmljZSwgY2hhdFNlc3Npb25zU2VydmljZSwgc3RvcmFnZVNlcnZpY2UsIGxvY2FsV29ya3NwYWNlLCB0cnVlLCB7IGN1cnJlbnRTZXNzaW9uVHlwZTogbG9jYWxDaGF0U2Vzc2lvblR5cGUgfSk7XG5cdFx0cmVjb3JkVXNlclNlbGVjdGVkU2Vzc2lvblR5cGUoc3RvcmFnZVNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjaGF0U2Vzc2lvbnNTZXJ2aWNlLCBsb2NhbFdvcmtzcGFjZSwgU2Vzc2lvblR5cGUuQWdlbnRIb3N0Q29kZXgsIHRydWUpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRjdXJyZW50Q2xhdWRlLFxuXHRcdFx0Y3VycmVudENvZGV4LFxuXHRcdFx0cmVtZW1iZXJlZENsYXVkZSxcblx0XHRcdHJlbWVtYmVyZWRDb2RleDogcmVzb2x2ZVNlc3Npb25UeXBlKGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjaGF0U2Vzc2lvbnNTZXJ2aWNlLCBzdG9yYWdlU2VydmljZSwgbG9jYWxXb3Jrc3BhY2UsIHRydWUsIHsgY3VycmVudFNlc3Npb25UeXBlOiBsb2NhbENoYXRTZXNzaW9uVHlwZSB9KSxcblx0XHR9LCB7XG5cdFx0XHRjdXJyZW50Q2xhdWRlOiB7IHNlc3Npb25UeXBlOiBTZXNzaW9uVHlwZS5BZ2VudEhvc3RDbGF1ZGUgfSxcblx0XHRcdGN1cnJlbnRDb2RleDogeyBzZXNzaW9uVHlwZTogU2Vzc2lvblR5cGUuQWdlbnRIb3N0Q29kZXggfSxcblx0XHRcdHJlbWVtYmVyZWRDbGF1ZGU6IHsgc2Vzc2lvblR5cGU6IFNlc3Npb25UeXBlLkFnZW50SG9zdENsYXVkZSB9LFxuXHRcdFx0cmVtZW1iZXJlZENvZGV4OiB7IHNlc3Npb25UeXBlOiBTZXNzaW9uVHlwZS5BZ2VudEhvc3RDb2RleCB9LFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzZWxlY3RpbmcgY29tcHV0ZWQgZGVmYXVsdCBjbGVhcnMgcmVtZW1iZXJlZCBzZWxlY3Rpb24nLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKHtcblx0XHRcdFtDaGF0Q29uZmlndXJhdGlvbi5EZWZhdWx0VG9Db3BpbG90SGFybmVzc106IHRydWUsXG5cdFx0fSk7XG5cdFx0Y29uc3QgY2hhdFNlc3Npb25zU2VydmljZSA9IGNyZWF0ZUNoYXRTZXNzaW9uc1NlcnZpY2UoU2Vzc2lvblR5cGUuQWdlbnRIb3N0Q29waWxvdCwgU2Vzc2lvblR5cGUuQWdlbnRIb3N0Q2xhdWRlKTtcblx0XHRjb25zdCBzdG9yYWdlU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdFN0b3JhZ2VTZXJ2aWNlKCkpO1xuXG5cdFx0cmVjb3JkVXNlclNlbGVjdGVkU2Vzc2lvblR5cGUoc3RvcmFnZVNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjaGF0U2Vzc2lvbnNTZXJ2aWNlLCBsb2NhbFdvcmtzcGFjZSwgU2Vzc2lvblR5cGUuQWdlbnRIb3N0Q2xhdWRlLCB0cnVlKTtcblx0XHRyZWNvcmRVc2VyU2VsZWN0ZWRTZXNzaW9uVHlwZShzdG9yYWdlU2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UsIGNoYXRTZXNzaW9uc1NlcnZpY2UsIGxvY2FsV29ya3NwYWNlLCBTZXNzaW9uVHlwZS5BZ2VudEhvc3RDb3BpbG90LCB0cnVlKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Y29tcHV0ZWQ6IGdldENvbXB1dGVkRGVmYXVsdFNlc3Npb25UeXBlKGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjaGF0U2Vzc2lvbnNTZXJ2aWNlLCBsb2NhbFdvcmtzcGFjZSwgdHJ1ZSksXG5cdFx0XHRyZW1lbWJlcmVkOiBnZXRSZW1lbWJlcmVkU2Vzc2lvblR5cGUoc3RvcmFnZVNlcnZpY2UpLFxuXHRcdFx0cmVtZW1iZXJlZEF3YXJlOiBnZXREZWZhdWx0TmV3Q2hhdFNlc3Npb25UeXBlKGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjaGF0U2Vzc2lvbnNTZXJ2aWNlLCBzdG9yYWdlU2VydmljZSwgbG9jYWxXb3Jrc3BhY2UsIHRydWUpLFxuXHRcdH0sIHtcblx0XHRcdGNvbXB1dGVkOiBTZXNzaW9uVHlwZS5BZ2VudEhvc3RDb3BpbG90LFxuXHRcdFx0cmVtZW1iZXJlZDogdW5kZWZpbmVkLFxuXHRcdFx0cmVtZW1iZXJlZEF3YXJlOiBTZXNzaW9uVHlwZS5BZ2VudEhvc3RDb3BpbG90LFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzZWxlY3RpbmcgbG9jYWwgd2hpbGUgdGhlIGFnZW50IGhvc3QgZGVmYXVsdCBpcyBDb3BpbG90IHJlbWVtYmVycyBsb2NhbCBhcyBhbiBvcHQtb3V0JywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSh7XG5cdFx0XHRbQ2hhdENvbmZpZ3VyYXRpb24uRGVmYXVsdFRvQ29waWxvdEhhcm5lc3NdOiB0cnVlLFxuXHRcdFx0W0NoYXRDb25maWd1cmF0aW9uLkVkaXRvckxvY2FsQWdlbnRFbmFibGVkXTogdHJ1ZSxcblx0XHR9KTtcblx0XHRjb25zdCBjaGF0U2Vzc2lvbnNTZXJ2aWNlID0gY3JlYXRlQ2hhdFNlc3Npb25zU2VydmljZShTZXNzaW9uVHlwZS5BZ2VudEhvc3RDb3BpbG90KTtcblx0XHRjb25zdCBzdG9yYWdlU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdFN0b3JhZ2VTZXJ2aWNlKCkpO1xuXG5cdFx0Ly8gV2l0aCB0aGUgYWdlbnQgaG9zdCBlbmFibGVkIHRoZSBjb21wdXRlZCBkZWZhdWx0IGlzIENvcGlsb3QsIHNvIHBpY2tpbmdcblx0XHQvLyBsb2NhbCBkaWZmZXJzIGZyb20gdGhlIGRlZmF1bHQgYW5kIG11c3QgYmUgcGVyc2lzdGVkIGFzIGFuIGV4cGxpY2l0IG9wdC1vdXQuXG5cdFx0cmVjb3JkVXNlclNlbGVjdGVkU2Vzc2lvblR5cGUoc3RvcmFnZVNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjaGF0U2Vzc2lvbnNTZXJ2aWNlLCBsb2NhbFdvcmtzcGFjZSwgbG9jYWxDaGF0U2Vzc2lvblR5cGUsIHRydWUpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRyZW1lbWJlcmVkOiBnZXRSZW1lbWJlcmVkU2Vzc2lvblR5cGUoc3RvcmFnZVNlcnZpY2UpLFxuXHRcdFx0cmVtZW1iZXJlZEF3YXJlOiBnZXREZWZhdWx0TmV3Q2hhdFNlc3Npb25UeXBlKGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjaGF0U2Vzc2lvbnNTZXJ2aWNlLCBzdG9yYWdlU2VydmljZSwgbG9jYWxXb3Jrc3BhY2UsIHRydWUpLFxuXHRcdH0sIHtcblx0XHRcdHJlbWVtYmVyZWQ6IGxvY2FsQ2hhdFNlc3Npb25UeXBlLFxuXHRcdFx0cmVtZW1iZXJlZEF3YXJlOiBsb2NhbENoYXRTZXNzaW9uVHlwZSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnQ29waWxvdCBwcmVmZXJlbmNlIG92ZXJyaWRlcyBhIHJlbWVtYmVyZWQgbG9jYWwgc2VsZWN0aW9uIGV2ZXJ5IHRpbWUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKHtcblx0XHRcdFtDaGF0Q29uZmlndXJhdGlvbi5EZWZhdWx0VG9Db3BpbG90SGFybmVzc106IHRydWUsXG5cdFx0XHRbQ2hhdENvbmZpZ3VyYXRpb24uRWRpdG9yUHJlZmVyQ29waWxvdEhhcm5lc3NdOiB0cnVlLFxuXHRcdH0pO1xuXHRcdGNvbnN0IGNoYXRTZXNzaW9uc1NlcnZpY2UgPSBjcmVhdGVDaGF0U2Vzc2lvbnNTZXJ2aWNlKFNlc3Npb25UeXBlLkFnZW50SG9zdENvcGlsb3QpO1xuXHRcdGNvbnN0IHN0b3JhZ2VTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0U3RvcmFnZVNlcnZpY2UoKSk7XG5cblx0XHQvLyBSZW1lbWJlciBsb2NhbCAob25seSByZWFjaGFibGUgYmVjYXVzZSB0aGUgY29tcHV0ZWQgZGVmYXVsdCBpcyBDb3BpbG90KS5cblx0XHRyZWNvcmRVc2VyU2VsZWN0ZWRTZXNzaW9uVHlwZShzdG9yYWdlU2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UsIGNoYXRTZXNzaW9uc1NlcnZpY2UsIGxvY2FsV29ya3NwYWNlLCBsb2NhbENoYXRTZXNzaW9uVHlwZSwgdHJ1ZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGZpcnN0UmVzb2x2ZTogcmVzb2x2ZVNlc3Npb25UeXBlKGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjaGF0U2Vzc2lvbnNTZXJ2aWNlLCBzdG9yYWdlU2VydmljZSwgbG9jYWxXb3Jrc3BhY2UsIHRydWUsIHsgY3VycmVudFNlc3Npb25UeXBlOiBsb2NhbENoYXRTZXNzaW9uVHlwZSB9KSxcblx0XHRcdHNlY29uZFJlc29sdmU6IHJlc29sdmVTZXNzaW9uVHlwZShjb25maWd1cmF0aW9uU2VydmljZSwgY2hhdFNlc3Npb25zU2VydmljZSwgc3RvcmFnZVNlcnZpY2UsIGxvY2FsV29ya3NwYWNlLCB0cnVlLCB7IGN1cnJlbnRTZXNzaW9uVHlwZTogbG9jYWxDaGF0U2Vzc2lvblR5cGUgfSksXG5cdFx0fSwge1xuXHRcdFx0Zmlyc3RSZXNvbHZlOiB7IHNlc3Npb25UeXBlOiBTZXNzaW9uVHlwZS5BZ2VudEhvc3RDb3BpbG90IH0sXG5cdFx0XHRzZWNvbmRSZXNvbHZlOiB7IHNlc3Npb25UeXBlOiBTZXNzaW9uVHlwZS5BZ2VudEhvc3RDb3BpbG90IH0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ25ldyBjaGF0IGZyb20gYSBsb2NhbCBzZXNzaW9uIHByZXNlcnZlcyBsb2NhbCBldmVuIHdoZW4gdGhlIGFnZW50IGhvc3QgZGVmYXVsdCBpcyBDb3BpbG90JywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSh7XG5cdFx0XHRbQ2hhdENvbmZpZ3VyYXRpb24uRGVmYXVsdFRvQ29waWxvdEhhcm5lc3NdOiB0cnVlLFxuXHRcdFx0W0NoYXRDb25maWd1cmF0aW9uLkVkaXRvckxvY2FsQWdlbnRFbmFibGVkXTogdHJ1ZSxcblx0XHR9KTtcblx0XHRjb25zdCBjaGF0U2Vzc2lvbnNTZXJ2aWNlID0gY3JlYXRlQ2hhdFNlc3Npb25zU2VydmljZShTZXNzaW9uVHlwZS5BZ2VudEhvc3RDb3BpbG90KTtcblx0XHRjb25zdCBzdG9yYWdlU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdFN0b3JhZ2VTZXJ2aWNlKCkpO1xuXG5cdFx0Ly8gTm8gcmVtZW1iZXJlZCBzZWxlY3Rpb24gYW5kIG5vIHByZWZlcnJlZC1oYXJuZXNzIHNldHRpbmc6IHRoZSBjdXJyZW50XG5cdFx0Ly8gc2Vzc2lvbiB0eXBlIHdpbnMgb3ZlciB0aGUgQ29waWxvdCBjb21wdXRlZCBkZWZhdWx0IChzZXNzaW9uIHByZXNlcnZhdGlvbikuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRyZXNvbHZlZDogcmVzb2x2ZVNlc3Npb25UeXBlKGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjaGF0U2Vzc2lvbnNTZXJ2aWNlLCBzdG9yYWdlU2VydmljZSwgbG9jYWxXb3Jrc3BhY2UsIHRydWUsIHsgY3VycmVudFNlc3Npb25UeXBlOiBsb2NhbENoYXRTZXNzaW9uVHlwZSB9KSxcblx0XHR9LCB7XG5cdFx0XHRyZXNvbHZlZDogeyBzZXNzaW9uVHlwZTogbG9jYWxDaGF0U2Vzc2lvblR5cGUgfSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZXhwbGljaXQgTmV3IExvY2FsIENoYXQgd2lucyBvdmVyIGEgbm9uLWxvY2FsIGN1cnJlbnQgc2Vzc2lvbiBldmVuIHdoZW4gdGhlIGFnZW50IGhvc3QgZGVmYXVsdCBpcyBDb3BpbG90JywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSh7XG5cdFx0XHRbQ2hhdENvbmZpZ3VyYXRpb24uRGVmYXVsdFRvQ29waWxvdEhhcm5lc3NdOiB0cnVlLFxuXHRcdH0pO1xuXHRcdGNvbnN0IGNoYXRTZXNzaW9uc1NlcnZpY2UgPSBjcmVhdGVDaGF0U2Vzc2lvbnNTZXJ2aWNlKFNlc3Npb25UeXBlLkFnZW50SG9zdENvcGlsb3QpO1xuXHRcdGNvbnN0IHN0b3JhZ2VTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0U3RvcmFnZVNlcnZpY2UoKSk7XG5cblx0XHQvLyBcIk5ldyBMb2NhbCBDaGF0XCIgZnJvbSBhIENvcGlsb3Qgc2Vzc2lvbiBtdXN0IHJlc29sdmUgdG8gbG9jYWw6IHRoZSBleHBsaWNpdFxuXHRcdC8vIG92ZXJyaWRlIG91dHJhbmtzIGJvdGggdGhlIGN1cnJlbnQgc2Vzc2lvbiB0eXBlIGFuZCB0aGUgY29tcHV0ZWQgZGVmYXVsdCxcblx0XHQvLyBzbyB0aGUgY2xlYXIgcGF0aCBvcGVucyBhIGxvY2FsIHNlc3Npb24gaW5zdGVhZCBvZiBkcm9wcGluZyB0aGUgcmVxdWVzdC5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHJlc29sdmVkOiByZXNvbHZlU2Vzc2lvblR5cGUoY29uZmlndXJhdGlvblNlcnZpY2UsIGNoYXRTZXNzaW9uc1NlcnZpY2UsIHN0b3JhZ2VTZXJ2aWNlLCBsb2NhbFdvcmtzcGFjZSwgdHJ1ZSwgeyBleHBsaWNpdE92ZXJyaWRlOiBsb2NhbENoYXRTZXNzaW9uVHlwZSwgY3VycmVudFNlc3Npb25UeXBlOiBTZXNzaW9uVHlwZS5BZ2VudEhvc3RDb3BpbG90IH0pLFxuXHRcdH0sIHtcblx0XHRcdHJlc29sdmVkOiB7IHNlc3Npb25UeXBlOiBsb2NhbENoYXRTZXNzaW9uVHlwZSB9LFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkZWZhdWx0IHNlc3Npb24gcmVzb3VyY2UgZm9sbG93cyB0aGUgYWdlbnQgaG9zdCBkZWZhdWx0JywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSh7XG5cdFx0XHRbQ2hhdENvbmZpZ3VyYXRpb24uRGVmYXVsdFRvQ29waWxvdEhhcm5lc3NdOiB0cnVlLFxuXHRcdH0pO1xuXHRcdGNvbnN0IGNoYXRTZXNzaW9uc1NlcnZpY2UgPSBjcmVhdGVDaGF0U2Vzc2lvbnNTZXJ2aWNlKFNlc3Npb25UeXBlLkFnZW50SG9zdENvcGlsb3QpO1xuXHRcdGNvbnN0IHN0b3JhZ2VTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0U3RvcmFnZVNlcnZpY2UoKSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGNvbXB1dGVkV2l0aEFnZW50SG9zdDogZ2V0Q2hhdFNlc3Npb25UeXBlKGdldENvbXB1dGVkRGVmYXVsdFNlc3Npb25SZXNvdXJjZShjb25maWd1cmF0aW9uU2VydmljZSwgY2hhdFNlc3Npb25zU2VydmljZSwgbG9jYWxXb3Jrc3BhY2UsIHRydWUpKSxcblx0XHRcdGNvbXB1dGVkV2l0aG91dEFnZW50SG9zdDogZ2V0Q2hhdFNlc3Npb25UeXBlKGdldENvbXB1dGVkRGVmYXVsdFNlc3Npb25SZXNvdXJjZShjb25maWd1cmF0aW9uU2VydmljZSwgY2hhdFNlc3Npb25zU2VydmljZSwgbG9jYWxXb3Jrc3BhY2UsIGZhbHNlKSksXG5cdFx0XHRkZWZhdWx0TmV3V2l0aEFnZW50SG9zdDogZ2V0Q2hhdFNlc3Npb25UeXBlKGdldERlZmF1bHROZXdDaGF0U2Vzc2lvblJlc291cmNlKGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjaGF0U2Vzc2lvbnNTZXJ2aWNlLCBzdG9yYWdlU2VydmljZSwgbG9jYWxXb3Jrc3BhY2UsIHRydWUpKSxcblx0XHRcdGRlZmF1bHROZXdXaXRob3V0QWdlbnRIb3N0OiBnZXRDaGF0U2Vzc2lvblR5cGUoZ2V0RGVmYXVsdE5ld0NoYXRTZXNzaW9uUmVzb3VyY2UoY29uZmlndXJhdGlvblNlcnZpY2UsIGNoYXRTZXNzaW9uc1NlcnZpY2UsIHN0b3JhZ2VTZXJ2aWNlLCBsb2NhbFdvcmtzcGFjZSwgZmFsc2UpKSxcblx0XHR9LCB7XG5cdFx0XHRjb21wdXRlZFdpdGhBZ2VudEhvc3Q6IFNlc3Npb25UeXBlLkFnZW50SG9zdENvcGlsb3QsXG5cdFx0XHRjb21wdXRlZFdpdGhvdXRBZ2VudEhvc3Q6IGxvY2FsQ2hhdFNlc3Npb25UeXBlLFxuXHRcdFx0ZGVmYXVsdE5ld1dpdGhBZ2VudEhvc3Q6IFNlc3Npb25UeXBlLkFnZW50SG9zdENvcGlsb3QsXG5cdFx0XHRkZWZhdWx0TmV3V2l0aG91dEFnZW50SG9zdDogbG9jYWxDaGF0U2Vzc2lvblR5cGUsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3ZpcnR1YWwgd29ya3NwYWNlIGRlZmF1bHRzIGltcGxpY2l0IG5ldyBjaGF0cyB0byBsb2NhbCcsICgpID0+IHtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2Uoe1xuXHRcdFx0W0NoYXRDb25maWd1cmF0aW9uLkRlZmF1bHRUb0NvcGlsb3RIYXJuZXNzXTogdHJ1ZSxcblx0XHRcdFtDaGF0Q29uZmlndXJhdGlvbi5FZGl0b3JMb2NhbEFnZW50RW5hYmxlZF06IGZhbHNlLFxuXHRcdFx0W0NoYXRDb25maWd1cmF0aW9uLkVkaXRvclByZWZlckNvcGlsb3RIYXJuZXNzXTogdHJ1ZSxcblx0XHR9KTtcblx0XHRjb25zdCBjaGF0U2Vzc2lvbnNTZXJ2aWNlID0gY3JlYXRlQ2hhdFNlc3Npb25zU2VydmljZShTZXNzaW9uVHlwZS5BZ2VudEhvc3RDb3BpbG90LCBTZXNzaW9uVHlwZS5BZ2VudEhvc3RDbGF1ZGUpO1xuXHRcdGNvbnN0IHJlbWVtYmVyZWRTdG9yYWdlU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdFN0b3JhZ2VTZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IGN1cnJlbnRTdG9yYWdlU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdFN0b3JhZ2VTZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IHdvcmtzcGFjZSA9IGNyZWF0ZVdvcmtzcGFjZShVUkkucGFyc2UoJ3ZzY29kZS12ZnM6Ly9naXRodWIvbWljcm9zb2Z0L3ZzY29kZScpKTtcblx0XHRyZWNvcmRVc2VyU2VsZWN0ZWRTZXNzaW9uVHlwZShyZW1lbWJlcmVkU3RvcmFnZVNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjaGF0U2Vzc2lvbnNTZXJ2aWNlLCB3b3Jrc3BhY2UsIFNlc3Npb25UeXBlLkFnZW50SG9zdENsYXVkZSwgdHJ1ZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGNvbXB1dGVkOiBnZXRDb21wdXRlZERlZmF1bHRTZXNzaW9uVHlwZShjb25maWd1cmF0aW9uU2VydmljZSwgY2hhdFNlc3Npb25zU2VydmljZSwgd29ya3NwYWNlLCB0cnVlKSxcblx0XHRcdHJlbWVtYmVyZWQ6IGdldFJlbWVtYmVyZWRTZXNzaW9uVHlwZShyZW1lbWJlcmVkU3RvcmFnZVNlcnZpY2UpLFxuXHRcdFx0cmVtZW1iZXJlZEF3YXJlOiBnZXREZWZhdWx0TmV3Q2hhdFNlc3Npb25UeXBlKGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjaGF0U2Vzc2lvbnNTZXJ2aWNlLCByZW1lbWJlcmVkU3RvcmFnZVNlcnZpY2UsIHdvcmtzcGFjZSwgdHJ1ZSksXG5cdFx0XHRjdXJyZW50QXdhcmU6IGdldERlZmF1bHROZXdDaGF0U2Vzc2lvblR5cGUoY29uZmlndXJhdGlvblNlcnZpY2UsIGNoYXRTZXNzaW9uc1NlcnZpY2UsIGN1cnJlbnRTdG9yYWdlU2VydmljZSwgd29ya3NwYWNlLCB0cnVlLCB7IGN1cnJlbnRTZXNzaW9uVHlwZTogU2Vzc2lvblR5cGUuQWdlbnRIb3N0Q29waWxvdCB9KSxcblx0XHRcdHJlc29sdmVkUmVtZW1iZXJlZDogcmVzb2x2ZVNlc3Npb25UeXBlKGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjaGF0U2Vzc2lvbnNTZXJ2aWNlLCByZW1lbWJlcmVkU3RvcmFnZVNlcnZpY2UsIHdvcmtzcGFjZSwgdHJ1ZSwgeyBjdXJyZW50U2Vzc2lvblR5cGU6IFNlc3Npb25UeXBlLkFnZW50SG9zdENvcGlsb3QgfSksXG5cdFx0XHRyZXNvbHZlZEN1cnJlbnQ6IHJlc29sdmVTZXNzaW9uVHlwZShjb25maWd1cmF0aW9uU2VydmljZSwgY2hhdFNlc3Npb25zU2VydmljZSwgY3VycmVudFN0b3JhZ2VTZXJ2aWNlLCB3b3Jrc3BhY2UsIHRydWUsIHsgY3VycmVudFNlc3Npb25UeXBlOiBTZXNzaW9uVHlwZS5BZ2VudEhvc3RDb3BpbG90IH0pLFxuXHRcdFx0cmVzb2x2ZWRQcmVmZXJNaWdyYXRpb246IHJlc29sdmVTZXNzaW9uVHlwZShjb25maWd1cmF0aW9uU2VydmljZSwgY2hhdFNlc3Npb25zU2VydmljZSwgY3VycmVudFN0b3JhZ2VTZXJ2aWNlLCB3b3Jrc3BhY2UsIHRydWUsIHsgY3VycmVudFNlc3Npb25UeXBlOiBsb2NhbENoYXRTZXNzaW9uVHlwZSB9KSxcblx0XHRcdGV4cGxpY2l0T3ZlcnJpZGU6IHJlc29sdmVTZXNzaW9uVHlwZShjb25maWd1cmF0aW9uU2VydmljZSwgY2hhdFNlc3Npb25zU2VydmljZSwgY3VycmVudFN0b3JhZ2VTZXJ2aWNlLCB3b3Jrc3BhY2UsIHRydWUsIHsgZXhwbGljaXRPdmVycmlkZTogU2Vzc2lvblR5cGUuQWdlbnRIb3N0Q2xhdWRlIH0pLFxuXHRcdFx0bG9jYWxWaXNpYmxlOiBpc1Zpc2libGVFZGl0b3JDaGF0U2Vzc2lvblR5cGUobG9jYWxDaGF0U2Vzc2lvblR5cGUsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjaGF0U2Vzc2lvbnNTZXJ2aWNlLCB3b3Jrc3BhY2UpLFxuXHRcdFx0bG9jYWxSZW1lbWJlcmVkVXNhYmxlOiBpc05ld0NoYXRTZXNzaW9uVHlwZVVzYWJsZShsb2NhbENoYXRTZXNzaW9uVHlwZSwgY29uZmlndXJhdGlvblNlcnZpY2UsIGNoYXRTZXNzaW9uc1NlcnZpY2UsIHdvcmtzcGFjZSksXG5cdFx0fSwge1xuXHRcdFx0Y29tcHV0ZWQ6IGxvY2FsQ2hhdFNlc3Npb25UeXBlLFxuXHRcdFx0cmVtZW1iZXJlZDogU2Vzc2lvblR5cGUuQWdlbnRIb3N0Q2xhdWRlLFxuXHRcdFx0cmVtZW1iZXJlZEF3YXJlOiBsb2NhbENoYXRTZXNzaW9uVHlwZSxcblx0XHRcdGN1cnJlbnRBd2FyZTogbG9jYWxDaGF0U2Vzc2lvblR5cGUsXG5cdFx0XHRyZXNvbHZlZFJlbWVtYmVyZWQ6IHsgc2Vzc2lvblR5cGU6IGxvY2FsQ2hhdFNlc3Npb25UeXBlIH0sXG5cdFx0XHRyZXNvbHZlZEN1cnJlbnQ6IHsgc2Vzc2lvblR5cGU6IGxvY2FsQ2hhdFNlc3Npb25UeXBlIH0sXG5cdFx0XHRyZXNvbHZlZFByZWZlck1pZ3JhdGlvbjogeyBzZXNzaW9uVHlwZTogbG9jYWxDaGF0U2Vzc2lvblR5cGUgfSxcblx0XHRcdGV4cGxpY2l0T3ZlcnJpZGU6IHsgc2Vzc2lvblR5cGU6IFNlc3Npb25UeXBlLkFnZW50SG9zdENsYXVkZSB9LFxuXHRcdFx0bG9jYWxWaXNpYmxlOiB0cnVlLFxuXHRcdFx0bG9jYWxSZW1lbWJlcmVkVXNhYmxlOiB0cnVlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZW1lbWJlcmVkIGFnZW50IGhvc3QgaXMgdXNhYmxlIGJlZm9yZSBjb250cmlidXRpb24gcmVnaXN0ZXJzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSgpO1xuXHRcdGNvbnN0IGNoYXRTZXNzaW9uc1NlcnZpY2UgPSBjcmVhdGVDaGF0U2Vzc2lvbnNTZXJ2aWNlKCk7XG5cdFx0Y29uc3Qgc3RvcmFnZVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RTdG9yYWdlU2VydmljZSgpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0YWdlbnRIb3N0OiBpc05ld0NoYXRTZXNzaW9uVHlwZVVzYWJsZShTZXNzaW9uVHlwZS5BZ2VudEhvc3RDbGF1ZGUsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjaGF0U2Vzc2lvbnNTZXJ2aWNlLCBsb2NhbFdvcmtzcGFjZSksXG5cdFx0XHRhZ2VudEhvc3RDdXJyZW50OiByZXNvbHZlU2Vzc2lvblR5cGUoY29uZmlndXJhdGlvblNlcnZpY2UsIGNoYXRTZXNzaW9uc1NlcnZpY2UsIHN0b3JhZ2VTZXJ2aWNlLCBsb2NhbFdvcmtzcGFjZSwgdHJ1ZSwgeyBjdXJyZW50U2Vzc2lvblR5cGU6IFNlc3Npb25UeXBlLkFnZW50SG9zdENsYXVkZSB9KSxcblx0XHRcdGV4dGVuc2lvbkNvbnRyaWJ1dGVkOiBpc05ld0NoYXRTZXNzaW9uVHlwZVVzYWJsZSgnbXktZXh0ZW5zaW9uLWFnZW50JywgY29uZmlndXJhdGlvblNlcnZpY2UsIGNoYXRTZXNzaW9uc1NlcnZpY2UsIGxvY2FsV29ya3NwYWNlKSxcblx0XHR9LCB7XG5cdFx0XHRhZ2VudEhvc3Q6IHRydWUsXG5cdFx0XHRhZ2VudEhvc3RDdXJyZW50OiB7IHNlc3Npb25UeXBlOiBTZXNzaW9uVHlwZS5BZ2VudEhvc3RDbGF1ZGUgfSxcblx0XHRcdGV4dGVuc2lvbkNvbnRyaWJ1dGVkOiBmYWxzZSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZGlzYWJsZWQgQWdlbnQgSG9zdCBpcyBub3QgaW5oZXJpdGVkIGZyb20gcmVtZW1iZXJlZCBvciBjdXJyZW50IHNlc3Npb24gdHlwZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKCk7XG5cdFx0Y29uc3QgY2hhdFNlc3Npb25zU2VydmljZSA9IGNyZWF0ZUNoYXRTZXNzaW9uc1NlcnZpY2UoKTtcblx0XHRjb25zdCBzdG9yYWdlU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdFN0b3JhZ2VTZXJ2aWNlKCkpO1xuXHRcdHJlY29yZFVzZXJTZWxlY3RlZFNlc3Npb25UeXBlKHN0b3JhZ2VTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSwgY2hhdFNlc3Npb25zU2VydmljZSwgbG9jYWxXb3Jrc3BhY2UsIFNlc3Npb25UeXBlLkFnZW50SG9zdENsYXVkZSwgdHJ1ZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHVzYWJsZTogaXNOZXdDaGF0U2Vzc2lvblR5cGVVc2FibGUoU2Vzc2lvblR5cGUuQWdlbnRIb3N0Q2xhdWRlLCBjb25maWd1cmF0aW9uU2VydmljZSwgY2hhdFNlc3Npb25zU2VydmljZSwgbG9jYWxXb3Jrc3BhY2UsIGZhbHNlKSxcblx0XHRcdHJlbWVtYmVyZWQ6IGdldERlZmF1bHROZXdDaGF0U2Vzc2lvblR5cGUoY29uZmlndXJhdGlvblNlcnZpY2UsIGNoYXRTZXNzaW9uc1NlcnZpY2UsIHN0b3JhZ2VTZXJ2aWNlLCBsb2NhbFdvcmtzcGFjZSwgZmFsc2UpLFxuXHRcdFx0Y3VycmVudDogcmVzb2x2ZVNlc3Npb25UeXBlKGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjaGF0U2Vzc2lvbnNTZXJ2aWNlLCBzdG9yYWdlU2VydmljZSwgbG9jYWxXb3Jrc3BhY2UsIGZhbHNlLCB7IGN1cnJlbnRTZXNzaW9uVHlwZTogU2Vzc2lvblR5cGUuQWdlbnRIb3N0Q2xhdWRlIH0pLFxuXHRcdH0sIHtcblx0XHRcdHVzYWJsZTogZmFsc2UsXG5cdFx0XHRyZW1lbWJlcmVkOiBsb2NhbENoYXRTZXNzaW9uVHlwZSxcblx0XHRcdGN1cnJlbnQ6IHsgc2Vzc2lvblR5cGU6IGxvY2FsQ2hhdFNlc3Npb25UeXBlIH0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2xvY2FsIGFnZW50IHNldHRpbmcgaXMgaWdub3JlZCBvbmx5IGluIGZ1bGx5IHZpcnR1YWwgd29ya3NwYWNlcycsICgpID0+IHtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2Uoe1xuXHRcdFx0W0NoYXRDb25maWd1cmF0aW9uLkVkaXRvckxvY2FsQWdlbnRFbmFibGVkXTogZmFsc2UsXG5cdFx0fSk7XG5cdFx0Y29uc3QgcmVtb3RlV29ya3NwYWNlID0gY3JlYXRlV29ya3NwYWNlKFVSSS5wYXJzZSgndnNjb2RlLXJlbW90ZTovL3NzaC1yZW1vdGUrdGVzdC93b3Jrc3BhY2UnKSk7XG5cdFx0Y29uc3QgcmVtb3RlUmVwb3NpdG9yaWVzV29ya3NwYWNlID0gY3JlYXRlV29ya3NwYWNlKFVSSS5wYXJzZSgndnNjb2RlLXZmczovL2dpdGh1Yi9taWNyb3NvZnQvdnNjb2RlJykpO1xuXHRcdGNvbnN0IGN1c3RvbVZpcnR1YWxXb3Jrc3BhY2UgPSBjcmVhdGVXb3Jrc3BhY2UoVVJJLnBhcnNlKCdjdXN0b20tdmZzOi8vcHJvdmlkZXIvd29ya3NwYWNlJykpO1xuXHRcdGNvbnN0IG1peGVkV29ya3NwYWNlID0gY3JlYXRlV29ya3NwYWNlKFVSSS5maWxlKCcvd29ya3NwYWNlJyksIFVSSS5wYXJzZSgnY3VzdG9tLXZmczovL3Byb3ZpZGVyL3dvcmtzcGFjZScpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0bG9jYWw6IGlzRWRpdG9yTG9jYWxBZ2VudEVuYWJsZWQoY29uZmlndXJhdGlvblNlcnZpY2UsIGxvY2FsV29ya3NwYWNlKSxcblx0XHRcdHJlbW90ZTogaXNFZGl0b3JMb2NhbEFnZW50RW5hYmxlZChjb25maWd1cmF0aW9uU2VydmljZSwgcmVtb3RlV29ya3NwYWNlKSxcblx0XHRcdHJlbW90ZVJlcG9zaXRvcmllczogaXNFZGl0b3JMb2NhbEFnZW50RW5hYmxlZChjb25maWd1cmF0aW9uU2VydmljZSwgcmVtb3RlUmVwb3NpdG9yaWVzV29ya3NwYWNlKSxcblx0XHRcdGN1c3RvbVZpcnR1YWw6IGlzRWRpdG9yTG9jYWxBZ2VudEVuYWJsZWQoY29uZmlndXJhdGlvblNlcnZpY2UsIGN1c3RvbVZpcnR1YWxXb3Jrc3BhY2UpLFxuXHRcdFx0bWl4ZWQ6IGlzRWRpdG9yTG9jYWxBZ2VudEVuYWJsZWQoY29uZmlndXJhdGlvblNlcnZpY2UsIG1peGVkV29ya3NwYWNlKSxcblx0XHR9LCB7XG5cdFx0XHRsb2NhbDogZmFsc2UsXG5cdFx0XHRyZW1vdGU6IGZhbHNlLFxuXHRcdFx0cmVtb3RlUmVwb3NpdG9yaWVzOiB0cnVlLFxuXHRcdFx0Y3VzdG9tVmlydHVhbDogdHJ1ZSxcblx0XHRcdG1peGVkOiBmYWxzZSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgndmlydHVhbCB3b3Jrc3BhY2Uga2VlcHMgbG9jYWwgYXZhaWxhYmxlIHdoZW4gc2V0dGluZyBpcyBkaXNhYmxlZCcsICgpID0+IHtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2Uoe1xuXHRcdFx0W0NoYXRDb25maWd1cmF0aW9uLkVkaXRvckxvY2FsQWdlbnRFbmFibGVkXTogZmFsc2UsXG5cdFx0fSk7XG5cdFx0Y29uc3QgY2hhdFNlc3Npb25zU2VydmljZSA9IGNyZWF0ZUNoYXRTZXNzaW9uc1NlcnZpY2UoU2Vzc2lvblR5cGUuQWdlbnRIb3N0Q29waWxvdCk7XG5cdFx0Y29uc3Qgc3RvcmFnZVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RTdG9yYWdlU2VydmljZSgpKTtcblx0XHRjb25zdCB3b3Jrc3BhY2UgPSBjcmVhdGVXb3Jrc3BhY2UoVVJJLnBhcnNlKCd2c2NvZGUtdmZzOi8vZ2l0aHViL21pY3Jvc29mdC92c2NvZGUnKSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGNvbXB1dGVkOiBnZXRDb21wdXRlZERlZmF1bHRTZXNzaW9uVHlwZShjb25maWd1cmF0aW9uU2VydmljZSwgY2hhdFNlc3Npb25zU2VydmljZSwgd29ya3NwYWNlLCBmYWxzZSksXG5cdFx0XHRyZW1lbWJlcmVkQXdhcmU6IGdldERlZmF1bHROZXdDaGF0U2Vzc2lvblR5cGUoY29uZmlndXJhdGlvblNlcnZpY2UsIGNoYXRTZXNzaW9uc1NlcnZpY2UsIHN0b3JhZ2VTZXJ2aWNlLCB3b3Jrc3BhY2UsIGZhbHNlKSxcblx0XHRcdGxvY2FsVmlzaWJsZTogaXNWaXNpYmxlRWRpdG9yQ2hhdFNlc3Npb25UeXBlKGxvY2FsQ2hhdFNlc3Npb25UeXBlLCBjb25maWd1cmF0aW9uU2VydmljZSwgY2hhdFNlc3Npb25zU2VydmljZSwgd29ya3NwYWNlKSxcblx0XHRcdGxvY2FsUmVtZW1iZXJlZFVzYWJsZTogaXNOZXdDaGF0U2Vzc2lvblR5cGVVc2FibGUobG9jYWxDaGF0U2Vzc2lvblR5cGUsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjaGF0U2Vzc2lvbnNTZXJ2aWNlLCB3b3Jrc3BhY2UpLFxuXHRcdH0sIHtcblx0XHRcdGNvbXB1dGVkOiBsb2NhbENoYXRTZXNzaW9uVHlwZSxcblx0XHRcdHJlbWVtYmVyZWRBd2FyZTogbG9jYWxDaGF0U2Vzc2lvblR5cGUsXG5cdFx0XHRsb2NhbFZpc2libGU6IHRydWUsXG5cdFx0XHRsb2NhbFJlbWVtYmVyZWRVc2FibGU6IHRydWUsXG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsbUNBQW1DO0FBQzVDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsMEJBQTBCLFdBQVcseUJBQXlCO0FBQ3ZFLFNBQVMsbUJBQW1CLHFCQUFxQixnREFBZ0QsbUNBQW1DLCtCQUErQixrQ0FBa0MsOEJBQWlFLDJCQUEyQiw0QkFBNEIsZ0NBQWdDLCtCQUErQix3Q0FBd0M7QUFDcGEsU0FBUyxzQkFBc0IsYUFBMEMsNEJBQTRCO0FBQ3JHLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsb0JBQW9CLDBCQUEwQjtBQUN2RCxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLDBCQUEwQjtBQUVuQyxNQUFNLDhCQUE4QixNQUFNO0FBRXpDLFFBQU0sY0FBYyx3Q0FBd0M7QUFDNUQsUUFBTSxpQkFBaUIsZ0JBQWdCLElBQUksS0FBSyxZQUFZLENBQUM7QUFFN0QsV0FBUyxtQkFBbUIsV0FBNkI7QUFDeEQsV0FBTyxJQUFJO0FBQUEsTUFDVixV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
