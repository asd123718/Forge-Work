var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __decorateClass = (decorators, target, key, kind) => {
  var result = kind > 1 ? void 0 : kind ? __getOwnPropDesc(target, key) : target;
  for (var i = decorators.length - 1, decorator; i >= 0; i--)
    if (decorator = decorators[i])
      result = (kind ? decorator(target, key, result) : decorator(result)) || result;
  if (kind && result) __defProp(target, key, result);
  return result;
};
var __decorateParam = (index, decorator) => (target, key) => decorator(target, key, index);
import { computeLevenshteinDistance } from "../../../../base/common/diff/diff.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { createMarkdownCommandLink, MarkdownString } from "../../../../base/common/htmlContent.js";
import { findNodeAtLocation, parseTree } from "../../../../base/common/json.js";
import { Disposable, DisposableStore, dispose, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { isEqual } from "../../../../base/common/resources.js";
import { URI } from "../../../../base/common/uri.js";
import { Range } from "../../../../editor/common/core/range.js";
import { ILanguageFeaturesService } from "../../../../editor/common/services/languageFeatures.js";
import { localize } from "../../../../nls.js";
import { IAgentHostConnectionsService, LOCAL_AGENT_HOST_SCHEME_PREFIX } from "../../../../platform/agentHost/common/agentHostConnectionsService.js";
import { remoteAgentHostSessionTypeId } from "../../../../platform/agentHost/common/agentHostSessionType.js";
import { AgentSession } from "../../../../platform/agentHost/common/agentService.js";
import { isCustomizationEnabled } from "../../../../platform/agentHost/common/customizationEnablement.js";
import { ActionType } from "../../../../platform/agentHost/common/state/protocol/actions.js";
import { CustomizationType, McpServerStatus } from "../../../../platform/agentHost/common/state/protocol/state.js";
import { StateComponents } from "../../../../platform/agentHost/common/state/sessionState.js";
import { ConfigurationTarget } from "../../../../platform/configuration/common/configuration.js";
import { IMarkerService, MarkerSeverity } from "../../../../platform/markers/common/markers.js";
import { ISecretStorageService } from "../../../../platform/secrets/common/secrets.js";
import { StorageScope } from "../../../../platform/storage/common/storage.js";
import { IConfigurationResolverService } from "../../../services/configurationResolver/common/configurationResolver.js";
import { ConfigurationResolverExpression } from "../../../services/configurationResolver/common/configurationResolverExpression.js";
import { IAgentHostCustomizationService } from "../../chat/browser/agentSessions/agentHost/agentHostCustomizationService.js";
import { IChatWidgetService } from "../../chat/browser/chat.js";
import { isContributionDisabled } from "../../chat/common/enablement.js";
import { McpCommandIds } from "../common/mcpCommandIds.js";
import { mcpConfigurationSection } from "../common/mcpConfiguration.js";
import { countRunningMcpServersInOtherSessions, getActiveAgentHostMcpSessionResource } from "../common/mcpEditorAffordanceState.js";
import { IMcpRegistry } from "../common/mcpRegistryTypes.js";
import { IMcpService, IMcpWorkbenchService, McpConnectionState, mcpOAuthClientSecretStorageKey } from "../common/mcpTypes.js";
const diagnosticOwner = "vscode.mcp";
let McpLanguageFeatures = class extends Disposable {
  constructor(languageFeaturesService, _mcpRegistry, _mcpWorkbenchService, _mcpService, _chatWidgetService, _agentHostCustomizationService, _agentHostConnectionsService, _markerService, _configurationResolverService, _secretStorageService) {
    super();
    this._mcpRegistry = _mcpRegistry;
    this._mcpWorkbenchService = _mcpWorkbenchService;
    this._mcpService = _mcpService;
    this._chatWidgetService = _chatWidgetService;
    this._agentHostCustomizationService = _agentHostCustomizationService;
    this._agentHostConnectionsService = _agentHostConnectionsService;
    this._markerService = _markerService;
    this._configurationResolverService = _configurationResolverService;
    this._secretStorageService = _secretStorageService;
    this._cachedMcpSection = this._register(new MutableDisposable());
    const patterns = [
      { pattern: "**/mcp.json" },
      { pattern: "**/.mcp.json" },
      { pattern: "**/workspace.json" }
    ];
    const onDidChangeCodeLens = this._register(new Emitter());
    const codeLensProvider = {
      onDidChange: onDidChangeCodeLens.event,
      provideCodeLenses: (model, range) => this._provideCodeLenses(model, () => onDidChangeCodeLens.fire(codeLensProvider))
    };
    const refreshCodeLens = () => onDidChangeCodeLens.fire(codeLensProvider);
    this._register(languageFeaturesService.codeLensProvider.register(patterns, codeLensProvider));
    this._register(this._secretStorageService.onDidChangeSecret((key) => {
      if (key.startsWith("mcp.oauth.clientSecret:")) {
        refreshCodeLens();
      }
    }));
    const focusedWidgetViewModelListener = this._register(new MutableDisposable());
    const updateFocusedWidgetViewModelListener = () => {
      focusedWidgetViewModelListener.value = this._chatWidgetService.lastFocusedWidget?.onDidChangeViewModel(refreshCodeLens);
      refreshCodeLens();
    };
    const connectionStateListeners = this._register(new MutableDisposable());
    const updateConnectionStateListeners = () => {
      const store = new DisposableStore();
      for (const connectionInfo of this._agentHostConnectionsService.connections) {
        const connection = connectionInfo.connection;
        if (connection) {
          store.add(connection.onDidAction(({ action }) => {
            switch (action.type) {
              case ActionType.SessionCustomizationsChanged:
              case ActionType.SessionCustomizationUpdated:
              case ActionType.SessionCustomizationRemoved:
              case ActionType.SessionMcpServerStateChanged:
                refreshCodeLens();
                break;
            }
          }));
        }
      }
      connectionStateListeners.value = store;
      refreshCodeLens();
    };
    updateFocusedWidgetViewModelListener();
    updateConnectionStateListeners();
    this._register(this._chatWidgetService.onDidChangeFocusedWidget(updateFocusedWidgetViewModelListener));
    this._register(this._chatWidgetService.onDidChangeFocusedSession(refreshCodeLens));
    this._register(this._agentHostConnectionsService.onDidChangeConnections(updateConnectionStateListeners));
    this._register(this._agentHostCustomizationService.onDidChangeCustomizations(refreshCodeLens));
    this._register(languageFeaturesService.inlayHintsProvider.register(patterns, {
      onDidChangeInlayHints: _mcpRegistry.onDidChangeInputs,
      provideInlayHints: (model, range) => this._provideInlayHints(model, range)
    }));
  }
  /** Simple mechanism to avoid extra json parsing for hints+lenses */
  async _parseModel(model) {
    if (this._cachedMcpSection.value?.model === model) {
      return this._cachedMcpSection.value;
    }
    const uri = model.uri;
    const inConfig = uri.path.endsWith("/.mcp.json") ? { scope: StorageScope.WORKSPACE, target: ConfigurationTarget.WORKSPACE_FOLDER, serversKey: "mcpServers" } : await this._mcpWorkbenchService.getMcpConfigPath(model.uri);
    if (!inConfig) {
      return void 0;
    }
    const value = model.getValue();
    const tree = parseTree(value);
    const listeners = [
      model.onDidChangeContent(() => this._cachedMcpSection.clear()),
      model.onWillDispose(() => this._cachedMcpSection.clear())
    ];
    this._addDiagnostics(model, value, tree, inConfig);
    return this._cachedMcpSection.value = {
      model,
      tree,
      inConfig,
      dispose: () => {
        this._markerService.remove(diagnosticOwner, [uri]);
        dispose(listeners);
      }
    };
  }
  _addDiagnostics(tm, value, tree, inConfig) {
    const serversKey = inConfig.serversKey ?? "servers";
    const serversNode = findNodeAtLocation(tree, inConfig.section ? [...inConfig.section, serversKey] : [serversKey]);
    if (!serversNode) {
      return;
    }
    const getClosestMatchingVariable = (name) => {
      let bestValue = "";
      let bestDistance = Infinity;
      for (const variable of this._configurationResolverService.resolvableVariables) {
        const distance = computeLevenshteinDistance(name, variable);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestValue = variable;
        }
      }
      return bestValue;
    };
    const diagnostics = [];
    forEachPropertyWithReplacement(serversNode, (node) => {
      const expr = ConfigurationResolverExpression.parse(node.value);
      for (const { id, name, arg } of expr.unresolved()) {
        if (!this._configurationResolverService.resolvableVariables.has(name)) {
          const position = value.indexOf(id, node.offset);
          if (position === -1) {
            continue;
          }
          const start = tm.getPositionAt(position);
          const end = tm.getPositionAt(position + id.length);
          diagnostics.push({
            severity: MarkerSeverity.Warning,
            message: localize("mcp.variableNotFound", "Variable `{0}` not found, did you mean ${{1}}?", name, getClosestMatchingVariable(name) + (arg ? `:${arg}` : "")),
            startLineNumber: start.lineNumber,
            startColumn: start.column,
            endLineNumber: end.lineNumber,
            endColumn: end.column,
            modelVersionId: tm.getVersionId()
          });
        }
      }
    });
    if (diagnostics.length) {
      this._markerService.changeOne(diagnosticOwner, tm.uri, diagnostics);
    } else {
      this._markerService.remove(diagnosticOwner, [tm.uri]);
    }
  }
  async _provideCodeLenses(model, onDidChangeCodeLens) {
    const parsed = await this._parseModel(model);
    if (!parsed) {
      return void 0;
    }
    const { tree, inConfig } = parsed;
    const serversKey = inConfig.serversKey ?? "servers";
    const serversNode = findNodeAtLocation(tree, inConfig.section ? [...inConfig.section, serversKey] : [serversKey]);
    if (!serversNode) {
      return void 0;
    }
    const store = new DisposableStore();
    const lenses = [];
    const lensList = { lenses, dispose: () => store.dispose() };
    const read = (observable) => {
      store.add(Event.fromObservableLight(observable)(onDidChangeCodeLens));
      return observable.get();
    };
    const collection = read(this._mcpRegistry.collections).find((c) => isEqual(c.presentation?.origin, model.uri));
    if (!collection) {
      return lensList;
    }
    const agentHostSession = getActiveAgentHostMcpSessionResource(this._chatWidgetService.lastFocusedWidget?.viewModel?.sessionResource);
    if (agentHostSession) {
      const mcpServers = this._agentHostCustomizationService.getMcpServers(agentHostSession);
      const otherRunningCounts = this._getOtherRunningAgentHostMcpServerCounts(agentHostSession);
      for (const node of serversNode.children || []) {
        if (node.type !== "property" || node.children?.[0]?.type !== "string") {
          continue;
        }
        const name = node.children[0].value;
        const server = mcpServers.find((s) => s.name === name);
        if (!server) {
          continue;
        }
        this._addAgentHostServerCodeLenses(lenses, Range.fromPositions(model.getPositionAt(node.children[0].offset)), agentHostSession, server, otherRunningCounts.get(name) ?? 0);
      }
    } else {
      const mcpServers = read(this._mcpService.servers).filter((s) => s.collection.id === collection.id);
      for (const node of serversNode.children || []) {
        if (node.type !== "property" || node.children?.[0]?.type !== "string") {
          continue;
        }
        const name = node.children[0].value;
        const server = mcpServers.find((s) => s.definition.label === name);
        if (!server) {
          continue;
        }
        const range = Range.fromPositions(model.getPositionAt(node.children[0].offset));
        if (isContributionDisabled(read(server.enablement))) {
          lenses.push({
            range,
            command: {
              id: McpCommandIds.ServerOptions,
              title: "$(circle-slash) " + localize("server.disabled", "Disabled"),
              arguments: [server.definition.id]
            }
          });
          continue;
        }
        const canDebug = !!server.readDefinitions().get().server?.devMode?.debug;
        const state = read(server.connectionState).state;
        switch (state) {
          case McpConnectionState.Kind.Error:
            lenses.push({
              range,
              command: {
                id: McpCommandIds.ShowOutput,
                title: "$(error) " + localize("server.error", "Error"),
                arguments: [server.definition.id]
              }
            }, {
              range,
              command: {
                id: McpCommandIds.RestartServer,
                title: localize("mcp.restart", "Restart"),
                arguments: [server.definition.id, { autoTrustChanges: true }]
              }
            });
            if (canDebug) {
              lenses.push({
                range,
                command: {
                  id: McpCommandIds.RestartServer,
                  title: localize("mcp.debug", "Debug"),
                  arguments: [server.definition.id, { debug: true, autoTrustChanges: true }]
                }
              });
            }
            break;
          case McpConnectionState.Kind.Starting:
            lenses.push({
              range,
              command: {
                id: McpCommandIds.ShowOutput,
                title: "$(loading~spin) " + localize("server.starting", "Starting"),
                arguments: [server.definition.id]
              }
            }, {
              range,
              command: {
                id: McpCommandIds.StopServer,
                title: localize("cancel", "Cancel"),
                arguments: [server.definition.id]
              }
            });
            break;
          case McpConnectionState.Kind.Running:
            lenses.push({
              range,
              command: {
                id: McpCommandIds.ShowOutput,
                title: "$(check) " + localize("server.running", "Running"),
                arguments: [server.definition.id]
              }
            }, {
              range,
              command: {
                id: McpCommandIds.StopServer,
                title: localize("mcp.stop", "Stop"),
                arguments: [server.definition.id]
              }
            }, {
              range,
              command: {
                id: McpCommandIds.RestartServer,
                title: localize("mcp.restart", "Restart"),
                arguments: [server.definition.id, { autoTrustChanges: true }]
              }
            });
            if (canDebug) {
              lenses.push({
                range,
                command: {
                  id: McpCommandIds.RestartServer,
                  title: localize("mcp.debug", "Debug"),
                  arguments: [server.definition.id, { autoTrustChanges: true, debug: true }]
                }
              });
            }
            break;
          case McpConnectionState.Kind.Stopped:
            lenses.push({
              range,
              command: {
                id: McpCommandIds.StartServer,
                title: "$(debug-start) " + localize("mcp.start", "Start"),
                arguments: [server.definition.id, { autoTrustChanges: true }]
              }
            });
            if (canDebug) {
              lenses.push({
                range,
                command: {
                  id: McpCommandIds.StartServer,
                  title: localize("mcp.debug", "Debug"),
                  arguments: [server.definition.id, { autoTrustChanges: true, debug: true }]
                }
              });
            }
        }
        if (state !== McpConnectionState.Kind.Error) {
          const toolCount = read(server.tools).length;
          if (toolCount) {
            lenses.push({
              range,
              command: {
                id: "",
                title: localize("server.toolCount", "{0} tools", toolCount)
              }
            });
          }
          const promptCount = read(server.prompts).length;
          if (promptCount) {
            lenses.push({
              range,
              command: {
                id: McpCommandIds.StartPromptForServer,
                title: localize("server.promptcount", "{0} prompts", promptCount),
                arguments: [server]
              }
            });
          }
          lenses.push({
            range,
            command: {
              id: McpCommandIds.ServerOptions,
              title: localize("mcp.server.more", "More..."),
              arguments: [server.definition.id]
            }
          });
        }
      }
    }
    const candidates = [];
    for (const node of serversNode.children || []) {
      if (node.type !== "property" || node.children?.[0]?.type !== "string" || !node.children[1]) {
        continue;
      }
      const serverName = node.children[0].value;
      const serverValue = node.children[1];
      const clientIdNode = findNodeAtLocation(serverValue, ["oauth", "clientId"]);
      if (clientIdNode && clientIdNode.type === "string") {
        const clientId = clientIdNode.value;
        if (clientId) {
          const urlNode = findNodeAtLocation(serverValue, ["url"]);
          const rawUrl = urlNode && urlNode.type === "string" ? urlNode.value : void 0;
          if (!rawUrl) {
            continue;
          }
          let mcpServerUrl;
          try {
            mcpServerUrl = URI.parse(rawUrl).toString(true);
          } catch {
            continue;
          }
          candidates.push({ clientId, mcpServerUrl, serverName, clientIdOffset: clientIdNode.offset });
        }
      }
    }
    const existingSecrets = await Promise.all(
      candidates.map((c) => this._secretStorageService.get(mcpOAuthClientSecretStorageKey(c.mcpServerUrl, c.clientId)))
    );
    for (let i = 0; i < candidates.length; i++) {
      const { clientId, mcpServerUrl, serverName, clientIdOffset } = candidates[i];
      const existing = existingSecrets[i];
      const title = existing ? localize("mcp.replaceClientSecret", "Replace Client Secret") : localize("mcp.setClientSecret", "Set Client Secret");
      lenses.push({
        range: Range.fromPositions(model.getPositionAt(clientIdOffset)),
        command: {
          id: McpCommandIds.SetOAuthClientSecret,
          title,
          arguments: [clientId, mcpServerUrl, serverName]
        }
      });
    }
    return lensList;
  }
  _addAgentHostServerCodeLenses(lenses, range, agentHostSession, server, otherRunningSessionCount) {
    const commandArg = { agentHostSession, serverId: server.id };
    if (!server.enabled) {
      lenses.push({
        range,
        command: {
          id: McpCommandIds.AgentHostServerOptions,
          title: "$(circle-slash) " + localize("server.disabled", "Disabled"),
          arguments: [agentHostSession, server.id]
        }
      });
      return;
    }
    switch (server.status) {
      case McpServerStatus.Error:
        lenses.push({
          range,
          command: {
            id: McpCommandIds.AgentHostServerOptions,
            title: "$(error) " + localize("server.error", "Error"),
            arguments: [agentHostSession, server.id]
          }
        });
        lenses.push({
          range,
          command: {
            id: McpCommandIds.StartServer,
            title: localize("mcp.start", "Start"),
            arguments: [commandArg]
          }
        });
        break;
      case McpServerStatus.Starting:
        lenses.push({
          range,
          command: {
            id: McpCommandIds.AgentHostServerOptions,
            title: "$(loading~spin) " + localize("server.starting", "Starting"),
            arguments: [agentHostSession, server.id]
          }
        });
        lenses.push({
          range,
          command: {
            id: McpCommandIds.StopServer,
            title: localize("cancel", "Cancel"),
            arguments: [commandArg]
          }
        });
        break;
      case McpServerStatus.Ready:
        lenses.push({
          range,
          command: {
            id: McpCommandIds.AgentHostServerOptions,
            title: "$(check) " + localize("server.running", "Running"),
            arguments: [agentHostSession, server.id]
          }
        });
        lenses.push({
          range,
          command: {
            id: McpCommandIds.StopServer,
            title: localize("mcp.stop", "Stop"),
            arguments: [commandArg]
          }
        });
        break;
      case McpServerStatus.AuthRequired:
        lenses.push({
          range,
          command: {
            id: McpCommandIds.AgentHostServerOptions,
            title: "$(account) " + localize("server.authRequired", "Authentication Required"),
            arguments: [agentHostSession, server.id]
          }
        });
        lenses.push({
          range,
          command: {
            id: McpCommandIds.StopServer,
            title: localize("mcp.stop", "Stop"),
            arguments: [commandArg]
          }
        });
        break;
      case McpServerStatus.Stopped:
        lenses.push({
          range,
          command: {
            id: McpCommandIds.StartServer,
            title: "$(debug-start) " + localize("mcp.start", "Start"),
            arguments: [commandArg]
          }
        });
        break;
    }
    if (otherRunningSessionCount > 0) {
      lenses.push({
        range,
        command: {
          id: "",
          title: otherRunningSessionCount === 1 ? localize("server.runningInOneOtherSession", "(Running in 1 session)") : localize("server.runningInOtherSessions", "(Running in {0} sessions)", otherRunningSessionCount)
        }
      });
    }
    if (server.status !== McpServerStatus.Error) {
      lenses.push({
        range,
        command: {
          id: McpCommandIds.AgentHostServerOptions,
          title: localize("mcp.server.more", "More..."),
          arguments: [agentHostSession, server.id]
        }
      });
    }
  }
  _getOtherRunningAgentHostMcpServerCounts(agentHostSession) {
    const sessionServers = [];
    for (const connectionInfo of this._agentHostConnectionsService.connections) {
      const connection = connectionInfo.connection;
      if (!connection) {
        continue;
      }
      for (const subscription of connection.getActiveSubscriptions()) {
        if (subscription.kind !== StateComponents.Session) {
          continue;
        }
        const state = connection.getSubscriptionUnmanaged(StateComponents.Session, subscription.resource)?.value;
        const resource = this._toAgentHostSessionResource(connectionInfo, subscription.resource);
        if (!resource || !state || state instanceof Error) {
          continue;
        }
        sessionServers.push({ resource, servers: this._getMcpServersFromSessionState(state) });
      }
    }
    return countRunningMcpServersInOtherSessions(agentHostSession, sessionServers);
  }
  _toAgentHostSessionResource(connectionInfo, backendSession) {
    const provider = AgentSession.provider(backendSession);
    if (!provider) {
      return void 0;
    }
    const scheme = connectionInfo.isAmbient ? `${LOCAL_AGENT_HOST_SCHEME_PREFIX}${provider}` : remoteAgentHostSessionTypeId(connectionInfo.authority, provider);
    return URI.from({ scheme, path: backendSession.path });
  }
  _getMcpServersFromSessionState(state) {
    const servers = [];
    const collect = (customizations) => {
      for (const customization of customizations ?? []) {
        if (customization.type === CustomizationType.McpServer) {
          servers.push({
            name: customization.name,
            enabled: isCustomizationEnabled(customization),
            status: customization.state.kind
          });
        } else if (customization.type === CustomizationType.Directory || customization.type === CustomizationType.Plugin) {
          collect(customization.children);
        }
      }
    };
    collect(state.customizations);
    return servers;
  }
  async _provideInlayHints(model, range) {
    const parsed = await this._parseModel(model);
    if (!parsed) {
      return void 0;
    }
    const { tree, inConfig } = parsed;
    const mcpSection = inConfig.section ? findNodeAtLocation(tree, [...inConfig.section]) : tree;
    if (!mcpSection) {
      return void 0;
    }
    const inputsNode = findNodeAtLocation(mcpSection, ["inputs"]);
    if (!inputsNode) {
      return void 0;
    }
    const inputs = await this._mcpRegistry.getSavedInputs(inConfig.scope);
    const hints = [];
    const serversNode = findNodeAtLocation(mcpSection, [inConfig.serversKey ?? "servers"]);
    if (serversNode) {
      annotateServers(serversNode);
    }
    annotateInputs(inputsNode);
    return { hints, dispose: () => {
    } };
    function annotateServers(servers) {
      forEachPropertyWithReplacement(servers, (node) => {
        const expr = ConfigurationResolverExpression.parse(node.value);
        for (const { id } of expr.unresolved()) {
          const saved = inputs[id];
          if (saved) {
            pushAnnotation(id, node.offset + node.value.indexOf(id) + id.length, saved);
          }
        }
      });
    }
    function annotateInputs(node) {
      if (node.type !== "array" || !node.children) {
        return;
      }
      for (const input of node.children) {
        if (input.type !== "object" || !input.children) {
          continue;
        }
        const idProp = input.children.find((c) => c.type === "property" && c.children?.[0].value === "id");
        if (!idProp) {
          continue;
        }
        const id = idProp.children[1];
        if (!id || id.type !== "string" || !id.value) {
          continue;
        }
        const savedId = "${input:" + id.value + "}";
        const saved = inputs[savedId];
        if (saved) {
          pushAnnotation(savedId, id.offset + 1 + id.length, saved);
        }
      }
    }
    function pushAnnotation(savedId, offset, saved) {
      const tooltip = new MarkdownString([
        createMarkdownCommandLink({ id: McpCommandIds.EditStoredInput, text: localize("edit", "Edit"), arguments: [savedId, model.uri, mcpConfigurationSection, inConfig.target], tooltip: localize("edit.savedValue.tooltip", "Edit saved value") }),
        createMarkdownCommandLink({ id: McpCommandIds.RemoveStoredInput, text: localize("clear", "Clear"), arguments: [inConfig.scope, savedId], tooltip: localize("clear.savedValue.tooltip", "Clear saved value") }),
        createMarkdownCommandLink({ id: McpCommandIds.RemoveStoredInput, text: localize("clearAll", "Clear All"), arguments: [inConfig.scope], tooltip: localize("clearAll.savedValues.tooltip", "Clear all saved values") })
      ].join(" | "), { isTrusted: true });
      const hint = {
        label: "= " + (saved.input?.type === "promptString" && saved.input.password ? "*".repeat(10) : saved.value || ""),
        position: model.getPositionAt(offset),
        tooltip,
        paddingLeft: true
      };
      hints.push(hint);
      return hint;
    }
  }
};
McpLanguageFeatures = __decorateClass([
  __decorateParam(0, ILanguageFeaturesService),
  __decorateParam(1, IMcpRegistry),
  __decorateParam(2, IMcpWorkbenchService),
  __decorateParam(3, IMcpService),
  __decorateParam(4, IChatWidgetService),
  __decorateParam(5, IAgentHostCustomizationService),
  __decorateParam(6, IAgentHostConnectionsService),
  __decorateParam(7, IMarkerService),
  __decorateParam(8, IConfigurationResolverService),
  __decorateParam(9, ISecretStorageService)
], McpLanguageFeatures);
function forEachPropertyWithReplacement(node, callback) {
  if (node.type === "string" && typeof node.value === "string" && node.value.includes(ConfigurationResolverExpression.VARIABLE_LHS)) {
    callback(node);
  } else if (node.type === "property") {
    node.children?.slice(1).forEach((n) => forEachPropertyWithReplacement(n, callback));
  } else {
    node.children?.forEach((n) => forEachPropertyWithReplacement(n, callback));
  }
}
export {
  McpLanguageFeatures
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG1jcFxcYnJvd3NlclxcbWNwTGFuZ3VhZ2VGZWF0dXJlcy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGNvbXB1dGVMZXZlbnNodGVpbkRpc3RhbmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZGlmZi9kaWZmLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgY3JlYXRlTWFya2Rvd25Db21tYW5kTGluaywgTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBmaW5kTm9kZUF0TG9jYXRpb24sIE5vZGUsIHBhcnNlVHJlZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2pzb24uanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBkaXNwb3NlLCBJRGlzcG9zYWJsZSwgTXV0YWJsZURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSU9ic2VydmFibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IGlzRXF1YWwgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IENvZGVMZW5zLCBDb2RlTGVuc0xpc3QsIENvZGVMZW5zUHJvdmlkZXIsIElubGF5SGludCwgSW5sYXlIaW50TGlzdCB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzLmpzJztcbmltcG9ydCB7IElUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvbGFuZ3VhZ2VGZWF0dXJlcy5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0Q29ubmVjdGlvbkluZm8sIElBZ2VudEhvc3RDb25uZWN0aW9uc1NlcnZpY2UsIExPQ0FMX0FHRU5UX0hPU1RfU0NIRU1FX1BSRUZJWCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vYWdlbnRIb3N0Q29ubmVjdGlvbnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IHJlbW90ZUFnZW50SG9zdFNlc3Npb25UeXBlSWQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL2FnZW50SG9zdFNlc3Npb25UeXBlLmpzJztcbmltcG9ydCB7IEFnZW50U2Vzc2lvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vYWdlbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGlzQ3VzdG9taXphdGlvbkVuYWJsZWQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL2N1c3RvbWl6YXRpb25FbmFibGVtZW50LmpzJztcbmltcG9ydCB7IEFjdGlvblR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL3Byb3RvY29sL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ3VzdG9taXphdGlvblR5cGUsIE1jcFNlcnZlclN0YXR1cywgdHlwZSBDaGlsZEN1c3RvbWl6YXRpb24sIHR5cGUgQ3VzdG9taXphdGlvbiwgdHlwZSBTZXNzaW9uU3RhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL3Byb3RvY29sL3N0YXRlLmpzJztcbmltcG9ydCB7IFN0YXRlQ29tcG9uZW50cyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc3RhdGUvc2Vzc2lvblN0YXRlLmpzJztcbmltcG9ydCB7IENvbmZpZ3VyYXRpb25UYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElNYXJrZXJEYXRhLCBJTWFya2VyU2VydmljZSwgTWFya2VyU2V2ZXJpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9tYXJrZXJzL2NvbW1vbi9tYXJrZXJzLmpzJztcbmltcG9ydCB7IElTZWNyZXRTdG9yYWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3NlY3JldHMvY29tbW9uL3NlY3JldHMuanMnO1xuaW1wb3J0IHsgU3RvcmFnZVNjb3BlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9jb25maWd1cmF0aW9uUmVzb2x2ZXIvY29tbW9uL2NvbmZpZ3VyYXRpb25SZXNvbHZlci5qcyc7XG5pbXBvcnQgeyBDb25maWd1cmF0aW9uUmVzb2x2ZXJFeHByZXNzaW9uLCBJUmVzb2x2ZWRWYWx1ZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2NvbmZpZ3VyYXRpb25SZXNvbHZlci9jb21tb24vY29uZmlndXJhdGlvblJlc29sdmVyRXhwcmVzc2lvbi5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0Q3VzdG9taXphdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9jaGF0L2Jyb3dzZXIvYWdlbnRTZXNzaW9ucy9hZ2VudEhvc3QvYWdlbnRIb3N0Q3VzdG9taXphdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXRXaWRnZXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY2hhdC9icm93c2VyL2NoYXQuanMnO1xuaW1wb3J0IHsgaXNDb250cmlidXRpb25EaXNhYmxlZCB9IGZyb20gJy4uLy4uL2NoYXQvY29tbW9uL2VuYWJsZW1lbnQuanMnO1xuaW1wb3J0IHsgTWNwQ29tbWFuZElkcyB9IGZyb20gJy4uL2NvbW1vbi9tY3BDb21tYW5kSWRzLmpzJztcbmltcG9ydCB7IG1jcENvbmZpZ3VyYXRpb25TZWN0aW9uIH0gZnJvbSAnLi4vY29tbW9uL21jcENvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgY291bnRSdW5uaW5nTWNwU2VydmVyc0luT3RoZXJTZXNzaW9ucywgZ2V0QWN0aXZlQWdlbnRIb3N0TWNwU2Vzc2lvblJlc291cmNlLCBJTWNwRWRpdG9yQWdlbnRIb3N0U2VydmVyLCB0eXBlIElNY3BFZGl0b3JBZ2VudEhvc3RTZXNzaW9uU2VydmVycyB9IGZyb20gJy4uL2NvbW1vbi9tY3BFZGl0b3JBZmZvcmRhbmNlU3RhdGUuanMnO1xuaW1wb3J0IHsgSU1jcFJlZ2lzdHJ5IH0gZnJvbSAnLi4vY29tbW9uL21jcFJlZ2lzdHJ5VHlwZXMuanMnO1xuaW1wb3J0IHsgSU1jcENvbmZpZ1BhdGgsIElNY3BTZXJ2ZXJTdGFydE9wdHMsIElNY3BTZXJ2aWNlLCBJTWNwV29ya2JlbmNoU2VydmljZSwgTWNwQ29ubmVjdGlvblN0YXRlLCBtY3BPQXV0aENsaWVudFNlY3JldFN0b3JhZ2VLZXkgfSBmcm9tICcuLi9jb21tb24vbWNwVHlwZXMuanMnO1xuXG5jb25zdCBkaWFnbm9zdGljT3duZXIgPSAndnNjb2RlLm1jcCc7XG5cbnR5cGUgQ29uZmlnRGVzY3JpcHRvciA9IFBpY2s8SU1jcENvbmZpZ1BhdGgsICdzZWN0aW9uJyB8ICdzY29wZScgfCAndGFyZ2V0Jz4gJiB7XG5cdHNlcnZlcnNLZXk/OiBzdHJpbmc7XG59O1xuXG50eXBlIEFnZW50SG9zdE1jcFNlcnZlciA9IFJldHVyblR5cGU8SUFnZW50SG9zdEN1c3RvbWl6YXRpb25TZXJ2aWNlWydnZXRNY3BTZXJ2ZXJzJ10+W251bWJlcl07XG5cbmV4cG9ydCBjbGFzcyBNY3BMYW5ndWFnZUZlYXR1cmVzIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jYWNoZWRNY3BTZWN0aW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPHsgbW9kZWw6IElUZXh0TW9kZWw7IGluQ29uZmlnOiBDb25maWdEZXNjcmlwdG9yOyB0cmVlOiBOb2RlIH0gJiBJRGlzcG9zYWJsZT4oKSk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSBsYW5ndWFnZUZlYXR1cmVzU2VydmljZTogSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLFxuXHRcdEBJTWNwUmVnaXN0cnkgcHJpdmF0ZSByZWFkb25seSBfbWNwUmVnaXN0cnk6IElNY3BSZWdpc3RyeSxcblx0XHRASU1jcFdvcmtiZW5jaFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbWNwV29ya2JlbmNoU2VydmljZTogSU1jcFdvcmtiZW5jaFNlcnZpY2UsXG5cdFx0QElNY3BTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX21jcFNlcnZpY2U6IElNY3BTZXJ2aWNlLFxuXHRcdEBJQ2hhdFdpZGdldFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY2hhdFdpZGdldFNlcnZpY2U6IElDaGF0V2lkZ2V0U2VydmljZSxcblx0XHRASUFnZW50SG9zdEN1c3RvbWl6YXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2FnZW50SG9zdEN1c3RvbWl6YXRpb25TZXJ2aWNlOiBJQWdlbnRIb3N0Q3VzdG9taXphdGlvblNlcnZpY2UsXG5cdFx0QElBZ2VudEhvc3RDb25uZWN0aW9uc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfYWdlbnRIb3N0Q29ubmVjdGlvbnNTZXJ2aWNlOiBJQWdlbnRIb3N0Q29ubmVjdGlvbnNTZXJ2aWNlLFxuXHRcdEBJTWFya2VyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9tYXJrZXJTZXJ2aWNlOiBJTWFya2VyU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29uZmlndXJhdGlvblJlc29sdmVyU2VydmljZTogSUNvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2UsXG5cdFx0QElTZWNyZXRTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9zZWNyZXRTdG9yYWdlU2VydmljZTogSVNlY3JldFN0b3JhZ2VTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0Y29uc3QgcGF0dGVybnMgPSBbXG5cdFx0XHR7IHBhdHRlcm46ICcqKi9tY3AuanNvbicgfSxcblx0XHRcdHsgcGF0dGVybjogJyoqLy5tY3AuanNvbicgfSxcblx0XHRcdHsgcGF0dGVybjogJyoqL3dvcmtzcGFjZS5qc29uJyB9LFxuXHRcdF07XG5cblx0XHRjb25zdCBvbkRpZENoYW5nZUNvZGVMZW5zID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8Q29kZUxlbnNQcm92aWRlcj4oKSk7XG5cdFx0Y29uc3QgY29kZUxlbnNQcm92aWRlcjogQ29kZUxlbnNQcm92aWRlciA9IHtcblx0XHRcdG9uRGlkQ2hhbmdlOiBvbkRpZENoYW5nZUNvZGVMZW5zLmV2ZW50LFxuXHRcdFx0cHJvdmlkZUNvZGVMZW5zZXM6IChtb2RlbCwgcmFuZ2UpID0+IHRoaXMuX3Byb3ZpZGVDb2RlTGVuc2VzKG1vZGVsLCAoKSA9PiBvbkRpZENoYW5nZUNvZGVMZW5zLmZpcmUoY29kZUxlbnNQcm92aWRlcikpLFxuXHRcdH07XG5cdFx0Y29uc3QgcmVmcmVzaENvZGVMZW5zID0gKCkgPT4gb25EaWRDaGFuZ2VDb2RlTGVucy5maXJlKGNvZGVMZW5zUHJvdmlkZXIpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmNvZGVMZW5zUHJvdmlkZXIucmVnaXN0ZXIocGF0dGVybnMsIGNvZGVMZW5zUHJvdmlkZXIpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9zZWNyZXRTdG9yYWdlU2VydmljZS5vbkRpZENoYW5nZVNlY3JldChrZXkgPT4ge1xuXHRcdFx0aWYgKGtleS5zdGFydHNXaXRoKCdtY3Aub2F1dGguY2xpZW50U2VjcmV0OicpKSB7XG5cdFx0XHRcdHJlZnJlc2hDb2RlTGVucygpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHRjb25zdCBmb2N1c2VkV2lkZ2V0Vmlld01vZGVsTGlzdGVuZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cdFx0Y29uc3QgdXBkYXRlRm9jdXNlZFdpZGdldFZpZXdNb2RlbExpc3RlbmVyID0gKCkgPT4ge1xuXHRcdFx0Zm9jdXNlZFdpZGdldFZpZXdNb2RlbExpc3RlbmVyLnZhbHVlID0gdGhpcy5fY2hhdFdpZGdldFNlcnZpY2UubGFzdEZvY3VzZWRXaWRnZXQ/Lm9uRGlkQ2hhbmdlVmlld01vZGVsKHJlZnJlc2hDb2RlTGVucyk7XG5cdFx0XHRyZWZyZXNoQ29kZUxlbnMoKTtcblx0XHR9O1xuXHRcdGNvbnN0IGNvbm5lY3Rpb25TdGF0ZUxpc3RlbmVycyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxEaXNwb3NhYmxlU3RvcmU+KCkpO1xuXHRcdGNvbnN0IHVwZGF0ZUNvbm5lY3Rpb25TdGF0ZUxpc3RlbmVycyA9ICgpID0+IHtcblx0XHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdFx0Zm9yIChjb25zdCBjb25uZWN0aW9uSW5mbyBvZiB0aGlzLl9hZ2VudEhvc3RDb25uZWN0aW9uc1NlcnZpY2UuY29ubmVjdGlvbnMpIHtcblx0XHRcdFx0Y29uc3QgY29ubmVjdGlvbiA9IGNvbm5lY3Rpb25JbmZvLmNvbm5lY3Rpb247XG5cdFx0XHRcdGlmIChjb25uZWN0aW9uKSB7XG5cdFx0XHRcdFx0c3RvcmUuYWRkKGNvbm5lY3Rpb24ub25EaWRBY3Rpb24oKHsgYWN0aW9uIH0pID0+IHtcblx0XHRcdFx0XHRcdHN3aXRjaCAoYWN0aW9uLnR5cGUpIHtcblx0XHRcdFx0XHRcdFx0Y2FzZSBBY3Rpb25UeXBlLlNlc3Npb25DdXN0b21pemF0aW9uc0NoYW5nZWQ6XG5cdFx0XHRcdFx0XHRcdGNhc2UgQWN0aW9uVHlwZS5TZXNzaW9uQ3VzdG9taXphdGlvblVwZGF0ZWQ6XG5cdFx0XHRcdFx0XHRcdGNhc2UgQWN0aW9uVHlwZS5TZXNzaW9uQ3VzdG9taXphdGlvblJlbW92ZWQ6XG5cdFx0XHRcdFx0XHRcdGNhc2UgQWN0aW9uVHlwZS5TZXNzaW9uTWNwU2VydmVyU3RhdGVDaGFuZ2VkOlxuXHRcdFx0XHRcdFx0XHRcdHJlZnJlc2hDb2RlTGVucygpO1xuXHRcdFx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0pKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0Y29ubmVjdGlvblN0YXRlTGlzdGVuZXJzLnZhbHVlID0gc3RvcmU7XG5cdFx0XHRyZWZyZXNoQ29kZUxlbnMoKTtcblx0XHR9O1xuXHRcdHVwZGF0ZUZvY3VzZWRXaWRnZXRWaWV3TW9kZWxMaXN0ZW5lcigpO1xuXHRcdHVwZGF0ZUNvbm5lY3Rpb25TdGF0ZUxpc3RlbmVycygpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2NoYXRXaWRnZXRTZXJ2aWNlLm9uRGlkQ2hhbmdlRm9jdXNlZFdpZGdldCh1cGRhdGVGb2N1c2VkV2lkZ2V0Vmlld01vZGVsTGlzdGVuZXIpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9jaGF0V2lkZ2V0U2VydmljZS5vbkRpZENoYW5nZUZvY3VzZWRTZXNzaW9uKHJlZnJlc2hDb2RlTGVucykpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2FnZW50SG9zdENvbm5lY3Rpb25zU2VydmljZS5vbkRpZENoYW5nZUNvbm5lY3Rpb25zKHVwZGF0ZUNvbm5lY3Rpb25TdGF0ZUxpc3RlbmVycykpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2FnZW50SG9zdEN1c3RvbWl6YXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ3VzdG9taXphdGlvbnMocmVmcmVzaENvZGVMZW5zKSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihsYW5ndWFnZUZlYXR1cmVzU2VydmljZS5pbmxheUhpbnRzUHJvdmlkZXIucmVnaXN0ZXIocGF0dGVybnMsIHtcblx0XHRcdG9uRGlkQ2hhbmdlSW5sYXlIaW50czogX21jcFJlZ2lzdHJ5Lm9uRGlkQ2hhbmdlSW5wdXRzLFxuXHRcdFx0cHJvdmlkZUlubGF5SGludHM6IChtb2RlbCwgcmFuZ2UpID0+IHRoaXMuX3Byb3ZpZGVJbmxheUhpbnRzKG1vZGVsLCByYW5nZSksXG5cdFx0fSkpO1xuXHR9XG5cblx0LyoqIFNpbXBsZSBtZWNoYW5pc20gdG8gYXZvaWQgZXh0cmEganNvbiBwYXJzaW5nIGZvciBoaW50cytsZW5zZXMgKi9cblx0cHJpdmF0ZSBhc3luYyBfcGFyc2VNb2RlbChtb2RlbDogSVRleHRNb2RlbCkge1xuXHRcdGlmICh0aGlzLl9jYWNoZWRNY3BTZWN0aW9uLnZhbHVlPy5tb2RlbCA9PT0gbW9kZWwpIHtcblx0XHRcdHJldHVybiB0aGlzLl9jYWNoZWRNY3BTZWN0aW9uLnZhbHVlO1xuXHRcdH1cblxuXHRcdGNvbnN0IHVyaSA9IG1vZGVsLnVyaTtcblx0XHRjb25zdCBpbkNvbmZpZzogQ29uZmlnRGVzY3JpcHRvciB8IHVuZGVmaW5lZCA9IHVyaS5wYXRoLmVuZHNXaXRoKCcvLm1jcC5qc29uJylcblx0XHRcdD8geyBzY29wZTogU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgdGFyZ2V0OiBDb25maWd1cmF0aW9uVGFyZ2V0LldPUktTUEFDRV9GT0xERVIsIHNlcnZlcnNLZXk6ICdtY3BTZXJ2ZXJzJyB9XG5cdFx0XHQ6IGF3YWl0IHRoaXMuX21jcFdvcmtiZW5jaFNlcnZpY2UuZ2V0TWNwQ29uZmlnUGF0aChtb2RlbC51cmkpO1xuXHRcdGlmICghaW5Db25maWcpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdmFsdWUgPSBtb2RlbC5nZXRWYWx1ZSgpO1xuXHRcdGNvbnN0IHRyZWUgPSBwYXJzZVRyZWUodmFsdWUpO1xuXHRcdGNvbnN0IGxpc3RlbmVycyA9IFtcblx0XHRcdG1vZGVsLm9uRGlkQ2hhbmdlQ29udGVudCgoKSA9PiB0aGlzLl9jYWNoZWRNY3BTZWN0aW9uLmNsZWFyKCkpLFxuXHRcdFx0bW9kZWwub25XaWxsRGlzcG9zZSgoKSA9PiB0aGlzLl9jYWNoZWRNY3BTZWN0aW9uLmNsZWFyKCkpLFxuXHRcdF07XG5cdFx0dGhpcy5fYWRkRGlhZ25vc3RpY3MobW9kZWwsIHZhbHVlLCB0cmVlLCBpbkNvbmZpZyk7XG5cblx0XHRyZXR1cm4gdGhpcy5fY2FjaGVkTWNwU2VjdGlvbi52YWx1ZSA9IHtcblx0XHRcdG1vZGVsLFxuXHRcdFx0dHJlZSxcblx0XHRcdGluQ29uZmlnLFxuXHRcdFx0ZGlzcG9zZTogKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9tYXJrZXJTZXJ2aWNlLnJlbW92ZShkaWFnbm9zdGljT3duZXIsIFt1cmldKTtcblx0XHRcdFx0ZGlzcG9zZShsaXN0ZW5lcnMpO1xuXHRcdFx0fVxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIF9hZGREaWFnbm9zdGljcyh0bTogSVRleHRNb2RlbCwgdmFsdWU6IHN0cmluZywgdHJlZTogTm9kZSwgaW5Db25maWc6IENvbmZpZ0Rlc2NyaXB0b3IpIHtcblx0XHRjb25zdCBzZXJ2ZXJzS2V5ID0gaW5Db25maWcuc2VydmVyc0tleSA/PyAnc2VydmVycyc7XG5cdFx0Y29uc3Qgc2VydmVyc05vZGUgPSBmaW5kTm9kZUF0TG9jYXRpb24odHJlZSwgaW5Db25maWcuc2VjdGlvbiA/IFsuLi5pbkNvbmZpZy5zZWN0aW9uLCBzZXJ2ZXJzS2V5XSA6IFtzZXJ2ZXJzS2V5XSk7XG5cdFx0aWYgKCFzZXJ2ZXJzTm9kZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGdldENsb3Nlc3RNYXRjaGluZ1ZhcmlhYmxlID0gKG5hbWU6IHN0cmluZykgPT4ge1xuXHRcdFx0bGV0IGJlc3RWYWx1ZSA9ICcnO1xuXHRcdFx0bGV0IGJlc3REaXN0YW5jZSA9IEluZmluaXR5O1xuXHRcdFx0Zm9yIChjb25zdCB2YXJpYWJsZSBvZiB0aGlzLl9jb25maWd1cmF0aW9uUmVzb2x2ZXJTZXJ2aWNlLnJlc29sdmFibGVWYXJpYWJsZXMpIHtcblx0XHRcdFx0Y29uc3QgZGlzdGFuY2UgPSBjb21wdXRlTGV2ZW5zaHRlaW5EaXN0YW5jZShuYW1lLCB2YXJpYWJsZSk7XG5cdFx0XHRcdGlmIChkaXN0YW5jZSA8IGJlc3REaXN0YW5jZSkge1xuXHRcdFx0XHRcdGJlc3REaXN0YW5jZSA9IGRpc3RhbmNlO1xuXHRcdFx0XHRcdGJlc3RWYWx1ZSA9IHZhcmlhYmxlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gYmVzdFZhbHVlO1xuXHRcdH07XG5cblx0XHRjb25zdCBkaWFnbm9zdGljczogSU1hcmtlckRhdGFbXSA9IFtdO1xuXHRcdGZvckVhY2hQcm9wZXJ0eVdpdGhSZXBsYWNlbWVudChzZXJ2ZXJzTm9kZSwgbm9kZSA9PiB7XG5cdFx0XHRjb25zdCBleHByID0gQ29uZmlndXJhdGlvblJlc29sdmVyRXhwcmVzc2lvbi5wYXJzZShub2RlLnZhbHVlKTtcblxuXHRcdFx0Zm9yIChjb25zdCB7IGlkLCBuYW1lLCBhcmcgfSBvZiBleHByLnVucmVzb2x2ZWQoKSkge1xuXHRcdFx0XHRpZiAoIXRoaXMuX2NvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2UucmVzb2x2YWJsZVZhcmlhYmxlcy5oYXMobmFtZSkpIHtcblx0XHRcdFx0XHRjb25zdCBwb3NpdGlvbiA9IHZhbHVlLmluZGV4T2YoaWQsIG5vZGUub2Zmc2V0KTtcblx0XHRcdFx0XHRpZiAocG9zaXRpb24gPT09IC0xKSB7IGNvbnRpbnVlOyB9IC8vIHVucmVhY2hhYmxlP1xuXG5cdFx0XHRcdFx0Y29uc3Qgc3RhcnQgPSB0bS5nZXRQb3NpdGlvbkF0KHBvc2l0aW9uKTtcblx0XHRcdFx0XHRjb25zdCBlbmQgPSB0bS5nZXRQb3NpdGlvbkF0KHBvc2l0aW9uICsgaWQubGVuZ3RoKTtcblx0XHRcdFx0XHRkaWFnbm9zdGljcy5wdXNoKHtcblx0XHRcdFx0XHRcdHNldmVyaXR5OiBNYXJrZXJTZXZlcml0eS5XYXJuaW5nLFxuXHRcdFx0XHRcdFx0bWVzc2FnZTogbG9jYWxpemUoJ21jcC52YXJpYWJsZU5vdEZvdW5kJywgJ1ZhcmlhYmxlIGB7MH1gIG5vdCBmb3VuZCwgZGlkIHlvdSBtZWFuICR7ezF9fT8nLCBuYW1lLCBnZXRDbG9zZXN0TWF0Y2hpbmdWYXJpYWJsZShuYW1lKSArIChhcmcgPyBgOiR7YXJnfWAgOiAnJykpLFxuXHRcdFx0XHRcdFx0c3RhcnRMaW5lTnVtYmVyOiBzdGFydC5saW5lTnVtYmVyLFxuXHRcdFx0XHRcdFx0c3RhcnRDb2x1bW46IHN0YXJ0LmNvbHVtbixcblx0XHRcdFx0XHRcdGVuZExpbmVOdW1iZXI6IGVuZC5saW5lTnVtYmVyLFxuXHRcdFx0XHRcdFx0ZW5kQ29sdW1uOiBlbmQuY29sdW1uLFxuXHRcdFx0XHRcdFx0bW9kZWxWZXJzaW9uSWQ6IHRtLmdldFZlcnNpb25JZCgpLFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRpZiAoZGlhZ25vc3RpY3MubGVuZ3RoKSB7XG5cdFx0XHR0aGlzLl9tYXJrZXJTZXJ2aWNlLmNoYW5nZU9uZShkaWFnbm9zdGljT3duZXIsIHRtLnVyaSwgZGlhZ25vc3RpY3MpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9tYXJrZXJTZXJ2aWNlLnJlbW92ZShkaWFnbm9zdGljT3duZXIsIFt0bS51cmldKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9wcm92aWRlQ29kZUxlbnNlcyhtb2RlbDogSVRleHRNb2RlbCwgb25EaWRDaGFuZ2VDb2RlTGVuczogKCkgPT4gdm9pZCk6IFByb21pc2U8Q29kZUxlbnNMaXN0IHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgcGFyc2VkID0gYXdhaXQgdGhpcy5fcGFyc2VNb2RlbChtb2RlbCk7XG5cdFx0aWYgKCFwYXJzZWQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgeyB0cmVlLCBpbkNvbmZpZyB9ID0gcGFyc2VkO1xuXHRcdGNvbnN0IHNlcnZlcnNLZXkgPSBpbkNvbmZpZy5zZXJ2ZXJzS2V5ID8/ICdzZXJ2ZXJzJztcblx0XHRjb25zdCBzZXJ2ZXJzTm9kZSA9IGZpbmROb2RlQXRMb2NhdGlvbih0cmVlLCBpbkNvbmZpZy5zZWN0aW9uID8gWy4uLmluQ29uZmlnLnNlY3Rpb24sIHNlcnZlcnNLZXldIDogW3NlcnZlcnNLZXldKTtcblx0XHRpZiAoIXNlcnZlcnNOb2RlKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IGxlbnNlczogQ29kZUxlbnNbXSA9IFtdO1xuXHRcdGNvbnN0IGxlbnNMaXN0OiBDb2RlTGVuc0xpc3QgPSB7IGxlbnNlcywgZGlzcG9zZTogKCkgPT4gc3RvcmUuZGlzcG9zZSgpIH07XG5cdFx0Y29uc3QgcmVhZCA9IDxUPihvYnNlcnZhYmxlOiBJT2JzZXJ2YWJsZTxUPik6IFQgPT4ge1xuXHRcdFx0c3RvcmUuYWRkKEV2ZW50LmZyb21PYnNlcnZhYmxlTGlnaHQob2JzZXJ2YWJsZSkob25EaWRDaGFuZ2VDb2RlTGVucykpO1xuXHRcdFx0cmV0dXJuIG9ic2VydmFibGUuZ2V0KCk7XG5cdFx0fTtcblxuXHRcdGNvbnN0IGNvbGxlY3Rpb24gPSByZWFkKHRoaXMuX21jcFJlZ2lzdHJ5LmNvbGxlY3Rpb25zKS5maW5kKGMgPT4gaXNFcXVhbChjLnByZXNlbnRhdGlvbj8ub3JpZ2luLCBtb2RlbC51cmkpKTtcblx0XHRpZiAoIWNvbGxlY3Rpb24pIHtcblx0XHRcdHJldHVybiBsZW5zTGlzdDtcblx0XHR9XG5cblx0XHRjb25zdCBhZ2VudEhvc3RTZXNzaW9uID0gZ2V0QWN0aXZlQWdlbnRIb3N0TWNwU2Vzc2lvblJlc291cmNlKHRoaXMuX2NoYXRXaWRnZXRTZXJ2aWNlLmxhc3RGb2N1c2VkV2lkZ2V0Py52aWV3TW9kZWw/LnNlc3Npb25SZXNvdXJjZSk7XG5cdFx0aWYgKGFnZW50SG9zdFNlc3Npb24pIHtcblx0XHRcdGNvbnN0IG1jcFNlcnZlcnMgPSB0aGlzLl9hZ2VudEhvc3RDdXN0b21pemF0aW9uU2VydmljZS5nZXRNY3BTZXJ2ZXJzKGFnZW50SG9zdFNlc3Npb24pO1xuXHRcdFx0Y29uc3Qgb3RoZXJSdW5uaW5nQ291bnRzID0gdGhpcy5fZ2V0T3RoZXJSdW5uaW5nQWdlbnRIb3N0TWNwU2VydmVyQ291bnRzKGFnZW50SG9zdFNlc3Npb24pO1xuXHRcdFx0Zm9yIChjb25zdCBub2RlIG9mIHNlcnZlcnNOb2RlLmNoaWxkcmVuIHx8IFtdKSB7XG5cdFx0XHRcdGlmIChub2RlLnR5cGUgIT09ICdwcm9wZXJ0eScgfHwgbm9kZS5jaGlsZHJlbj8uWzBdPy50eXBlICE9PSAnc3RyaW5nJykge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgbmFtZSA9IG5vZGUuY2hpbGRyZW5bMF0udmFsdWUgYXMgc3RyaW5nO1xuXHRcdFx0XHRjb25zdCBzZXJ2ZXIgPSBtY3BTZXJ2ZXJzLmZpbmQocyA9PiBzLm5hbWUgPT09IG5hbWUpO1xuXHRcdFx0XHRpZiAoIXNlcnZlcikge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGhpcy5fYWRkQWdlbnRIb3N0U2VydmVyQ29kZUxlbnNlcyhsZW5zZXMsIFJhbmdlLmZyb21Qb3NpdGlvbnMobW9kZWwuZ2V0UG9zaXRpb25BdChub2RlLmNoaWxkcmVuWzBdLm9mZnNldCkpLCBhZ2VudEhvc3RTZXNzaW9uLCBzZXJ2ZXIsIG90aGVyUnVubmluZ0NvdW50cy5nZXQobmFtZSkgPz8gMCk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IG1jcFNlcnZlcnMgPSByZWFkKHRoaXMuX21jcFNlcnZpY2Uuc2VydmVycykuZmlsdGVyKHMgPT4gcy5jb2xsZWN0aW9uLmlkID09PSBjb2xsZWN0aW9uLmlkKTtcblx0XHRcdGZvciAoY29uc3Qgbm9kZSBvZiBzZXJ2ZXJzTm9kZS5jaGlsZHJlbiB8fCBbXSkge1xuXHRcdFx0XHRpZiAobm9kZS50eXBlICE9PSAncHJvcGVydHknIHx8IG5vZGUuY2hpbGRyZW4/LlswXT8udHlwZSAhPT0gJ3N0cmluZycpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IG5hbWUgPSBub2RlLmNoaWxkcmVuWzBdLnZhbHVlIGFzIHN0cmluZztcblxuXHRcdFx0XHRjb25zdCBzZXJ2ZXIgPSBtY3BTZXJ2ZXJzLmZpbmQocyA9PiBzLmRlZmluaXRpb24ubGFiZWwgPT09IG5hbWUpO1xuXHRcdFx0XHRpZiAoIXNlcnZlcikge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgcmFuZ2UgPSBSYW5nZS5mcm9tUG9zaXRpb25zKG1vZGVsLmdldFBvc2l0aW9uQXQobm9kZS5jaGlsZHJlblswXS5vZmZzZXQpKTtcblxuXHRcdFx0XHRpZiAoaXNDb250cmlidXRpb25EaXNhYmxlZChyZWFkKHNlcnZlci5lbmFibGVtZW50KSkpIHtcblx0XHRcdFx0XHRsZW5zZXMucHVzaCh7XG5cdFx0XHRcdFx0XHRyYW5nZSxcblx0XHRcdFx0XHRcdGNvbW1hbmQ6IHtcblx0XHRcdFx0XHRcdFx0aWQ6IE1jcENvbW1hbmRJZHMuU2VydmVyT3B0aW9ucyxcblx0XHRcdFx0XHRcdFx0dGl0bGU6ICckKGNpcmNsZS1zbGFzaCkgJyArIGxvY2FsaXplKCdzZXJ2ZXIuZGlzYWJsZWQnLCAnRGlzYWJsZWQnKSxcblx0XHRcdFx0XHRcdFx0YXJndW1lbnRzOiBbc2VydmVyLmRlZmluaXRpb24uaWRdLFxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IGNhbkRlYnVnID0gISFzZXJ2ZXIucmVhZERlZmluaXRpb25zKCkuZ2V0KCkuc2VydmVyPy5kZXZNb2RlPy5kZWJ1Zztcblx0XHRcdFx0Y29uc3Qgc3RhdGUgPSByZWFkKHNlcnZlci5jb25uZWN0aW9uU3RhdGUpLnN0YXRlO1xuXHRcdFx0XHRzd2l0Y2ggKHN0YXRlKSB7XG5cdFx0XHRcdFx0Y2FzZSBNY3BDb25uZWN0aW9uU3RhdGUuS2luZC5FcnJvcjpcblx0XHRcdFx0XHRcdGxlbnNlcy5wdXNoKHtcblx0XHRcdFx0XHRcdFx0cmFuZ2UsXG5cdFx0XHRcdFx0XHRcdGNvbW1hbmQ6IHtcblx0XHRcdFx0XHRcdFx0XHRpZDogTWNwQ29tbWFuZElkcy5TaG93T3V0cHV0LFxuXHRcdFx0XHRcdFx0XHRcdHRpdGxlOiAnJChlcnJvcikgJyArIGxvY2FsaXplKCdzZXJ2ZXIuZXJyb3InLCAnRXJyb3InKSxcblx0XHRcdFx0XHRcdFx0XHRhcmd1bWVudHM6IFtzZXJ2ZXIuZGVmaW5pdGlvbi5pZF0sXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHR9LCB7XG5cdFx0XHRcdFx0XHRcdHJhbmdlLFxuXHRcdFx0XHRcdFx0XHRjb21tYW5kOiB7XG5cdFx0XHRcdFx0XHRcdFx0aWQ6IE1jcENvbW1hbmRJZHMuUmVzdGFydFNlcnZlcixcblx0XHRcdFx0XHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ21jcC5yZXN0YXJ0JywgXCJSZXN0YXJ0XCIpLFxuXHRcdFx0XHRcdFx0XHRcdGFyZ3VtZW50czogW3NlcnZlci5kZWZpbml0aW9uLmlkLCB7IGF1dG9UcnVzdENoYW5nZXM6IHRydWUgfSBzYXRpc2ZpZXMgSU1jcFNlcnZlclN0YXJ0T3B0c10sXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdGlmIChjYW5EZWJ1Zykge1xuXHRcdFx0XHRcdFx0XHRsZW5zZXMucHVzaCh7XG5cdFx0XHRcdFx0XHRcdFx0cmFuZ2UsXG5cdFx0XHRcdFx0XHRcdFx0Y29tbWFuZDoge1xuXHRcdFx0XHRcdFx0XHRcdFx0aWQ6IE1jcENvbW1hbmRJZHMuUmVzdGFydFNlcnZlcixcblx0XHRcdFx0XHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnbWNwLmRlYnVnJywgXCJEZWJ1Z1wiKSxcblx0XHRcdFx0XHRcdFx0XHRcdGFyZ3VtZW50czogW3NlcnZlci5kZWZpbml0aW9uLmlkLCB7IGRlYnVnOiB0cnVlLCBhdXRvVHJ1c3RDaGFuZ2VzOiB0cnVlIH0gc2F0aXNmaWVzIElNY3BTZXJ2ZXJTdGFydE9wdHNdLFxuXHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0Y2FzZSBNY3BDb25uZWN0aW9uU3RhdGUuS2luZC5TdGFydGluZzpcblx0XHRcdFx0XHRcdGxlbnNlcy5wdXNoKHtcblx0XHRcdFx0XHRcdFx0cmFuZ2UsXG5cdFx0XHRcdFx0XHRcdGNvbW1hbmQ6IHtcblx0XHRcdFx0XHRcdFx0XHRpZDogTWNwQ29tbWFuZElkcy5TaG93T3V0cHV0LFxuXHRcdFx0XHRcdFx0XHRcdHRpdGxlOiAnJChsb2FkaW5nfnNwaW4pICcgKyBsb2NhbGl6ZSgnc2VydmVyLnN0YXJ0aW5nJywgJ1N0YXJ0aW5nJyksXG5cdFx0XHRcdFx0XHRcdFx0YXJndW1lbnRzOiBbc2VydmVyLmRlZmluaXRpb24uaWRdLFxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0fSwge1xuXHRcdFx0XHRcdFx0XHRyYW5nZSxcblx0XHRcdFx0XHRcdFx0Y29tbWFuZDoge1xuXHRcdFx0XHRcdFx0XHRcdGlkOiBNY3BDb21tYW5kSWRzLlN0b3BTZXJ2ZXIsXG5cdFx0XHRcdFx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdjYW5jZWwnLCBcIkNhbmNlbFwiKSxcblx0XHRcdFx0XHRcdFx0XHRhcmd1bWVudHM6IFtzZXJ2ZXIuZGVmaW5pdGlvbi5pZF0sXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdGNhc2UgTWNwQ29ubmVjdGlvblN0YXRlLktpbmQuUnVubmluZzpcblx0XHRcdFx0XHRcdGxlbnNlcy5wdXNoKHtcblx0XHRcdFx0XHRcdFx0cmFuZ2UsXG5cdFx0XHRcdFx0XHRcdGNvbW1hbmQ6IHtcblx0XHRcdFx0XHRcdFx0XHRpZDogTWNwQ29tbWFuZElkcy5TaG93T3V0cHV0LFxuXHRcdFx0XHRcdFx0XHRcdHRpdGxlOiAnJChjaGVjaykgJyArIGxvY2FsaXplKCdzZXJ2ZXIucnVubmluZycsICdSdW5uaW5nJyksXG5cdFx0XHRcdFx0XHRcdFx0YXJndW1lbnRzOiBbc2VydmVyLmRlZmluaXRpb24uaWRdLFxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0fSwge1xuXHRcdFx0XHRcdFx0XHRyYW5nZSxcblx0XHRcdFx0XHRcdFx0Y29tbWFuZDoge1xuXHRcdFx0XHRcdFx0XHRcdGlkOiBNY3BDb21tYW5kSWRzLlN0b3BTZXJ2ZXIsXG5cdFx0XHRcdFx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdtY3Auc3RvcCcsIFwiU3RvcFwiKSxcblx0XHRcdFx0XHRcdFx0XHRhcmd1bWVudHM6IFtzZXJ2ZXIuZGVmaW5pdGlvbi5pZF0sXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHR9LCB7XG5cdFx0XHRcdFx0XHRcdHJhbmdlLFxuXHRcdFx0XHRcdFx0XHRjb21tYW5kOiB7XG5cdFx0XHRcdFx0XHRcdFx0aWQ6IE1jcENvbW1hbmRJZHMuUmVzdGFydFNlcnZlcixcblx0XHRcdFx0XHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ21jcC5yZXN0YXJ0JywgXCJSZXN0YXJ0XCIpLFxuXHRcdFx0XHRcdFx0XHRcdGFyZ3VtZW50czogW3NlcnZlci5kZWZpbml0aW9uLmlkLCB7IGF1dG9UcnVzdENoYW5nZXM6IHRydWUgfSBzYXRpc2ZpZXMgSU1jcFNlcnZlclN0YXJ0T3B0c10sXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdGlmIChjYW5EZWJ1Zykge1xuXHRcdFx0XHRcdFx0XHRsZW5zZXMucHVzaCh7XG5cdFx0XHRcdFx0XHRcdFx0cmFuZ2UsXG5cdFx0XHRcdFx0XHRcdFx0Y29tbWFuZDoge1xuXHRcdFx0XHRcdFx0XHRcdFx0aWQ6IE1jcENvbW1hbmRJZHMuUmVzdGFydFNlcnZlcixcblx0XHRcdFx0XHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnbWNwLmRlYnVnJywgXCJEZWJ1Z1wiKSxcblx0XHRcdFx0XHRcdFx0XHRcdGFyZ3VtZW50czogW3NlcnZlci5kZWZpbml0aW9uLmlkLCB7IGF1dG9UcnVzdENoYW5nZXM6IHRydWUsIGRlYnVnOiB0cnVlIH0gc2F0aXNmaWVzIElNY3BTZXJ2ZXJTdGFydE9wdHNdLFxuXHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0Y2FzZSBNY3BDb25uZWN0aW9uU3RhdGUuS2luZC5TdG9wcGVkOlxuXHRcdFx0XHRcdFx0bGVuc2VzLnB1c2goe1xuXHRcdFx0XHRcdFx0XHRyYW5nZSxcblx0XHRcdFx0XHRcdFx0Y29tbWFuZDoge1xuXHRcdFx0XHRcdFx0XHRcdGlkOiBNY3BDb21tYW5kSWRzLlN0YXJ0U2VydmVyLFxuXHRcdFx0XHRcdFx0XHRcdHRpdGxlOiAnJChkZWJ1Zy1zdGFydCkgJyArIGxvY2FsaXplKCdtY3Auc3RhcnQnLCBcIlN0YXJ0XCIpLFxuXHRcdFx0XHRcdFx0XHRcdGFyZ3VtZW50czogW3NlcnZlci5kZWZpbml0aW9uLmlkLCB7IGF1dG9UcnVzdENoYW5nZXM6IHRydWUgfSBzYXRpc2ZpZXMgSU1jcFNlcnZlclN0YXJ0T3B0c10sXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdGlmIChjYW5EZWJ1Zykge1xuXHRcdFx0XHRcdFx0XHRsZW5zZXMucHVzaCh7XG5cdFx0XHRcdFx0XHRcdFx0cmFuZ2UsXG5cdFx0XHRcdFx0XHRcdFx0Y29tbWFuZDoge1xuXHRcdFx0XHRcdFx0XHRcdFx0aWQ6IE1jcENvbW1hbmRJZHMuU3RhcnRTZXJ2ZXIsXG5cdFx0XHRcdFx0XHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ21jcC5kZWJ1ZycsIFwiRGVidWdcIiksXG5cdFx0XHRcdFx0XHRcdFx0XHRhcmd1bWVudHM6IFtzZXJ2ZXIuZGVmaW5pdGlvbi5pZCwgeyBhdXRvVHJ1c3RDaGFuZ2VzOiB0cnVlLCBkZWJ1ZzogdHJ1ZSB9IHNhdGlzZmllcyBJTWNwU2VydmVyU3RhcnRPcHRzXSxcblx0XHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChzdGF0ZSAhPT0gTWNwQ29ubmVjdGlvblN0YXRlLktpbmQuRXJyb3IpIHtcblx0XHRcdFx0XHRjb25zdCB0b29sQ291bnQgPSByZWFkKHNlcnZlci50b29scykubGVuZ3RoO1xuXHRcdFx0XHRcdGlmICh0b29sQ291bnQpIHtcblx0XHRcdFx0XHRcdGxlbnNlcy5wdXNoKHtcblx0XHRcdFx0XHRcdFx0cmFuZ2UsXG5cdFx0XHRcdFx0XHRcdGNvbW1hbmQ6IHtcblx0XHRcdFx0XHRcdFx0XHRpZDogJycsXG5cdFx0XHRcdFx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdzZXJ2ZXIudG9vbENvdW50JywgJ3swfSB0b29scycsIHRvb2xDb3VudCksXG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGNvbnN0IHByb21wdENvdW50ID0gcmVhZChzZXJ2ZXIucHJvbXB0cykubGVuZ3RoO1xuXHRcdFx0XHRcdGlmIChwcm9tcHRDb3VudCkge1xuXHRcdFx0XHRcdFx0bGVuc2VzLnB1c2goe1xuXHRcdFx0XHRcdFx0XHRyYW5nZSxcblx0XHRcdFx0XHRcdFx0Y29tbWFuZDoge1xuXHRcdFx0XHRcdFx0XHRcdGlkOiBNY3BDb21tYW5kSWRzLlN0YXJ0UHJvbXB0Rm9yU2VydmVyLFxuXHRcdFx0XHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnc2VydmVyLnByb21wdGNvdW50JywgJ3swfSBwcm9tcHRzJywgcHJvbXB0Q291bnQpLFxuXHRcdFx0XHRcdFx0XHRcdGFyZ3VtZW50czogW3NlcnZlcl0sXG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGxlbnNlcy5wdXNoKHtcblx0XHRcdFx0XHRcdHJhbmdlLFxuXHRcdFx0XHRcdFx0Y29tbWFuZDoge1xuXHRcdFx0XHRcdFx0XHRpZDogTWNwQ29tbWFuZElkcy5TZXJ2ZXJPcHRpb25zLFxuXHRcdFx0XHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ21jcC5zZXJ2ZXIubW9yZScsICdNb3JlLi4uJyksXG5cdFx0XHRcdFx0XHRcdGFyZ3VtZW50czogW3NlcnZlci5kZWZpbml0aW9uLmlkXSxcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIEFkZCBcIlNldC9SZXBsYWNlIENsaWVudCBTZWNyZXRcIiBsZW5zZXMgZm9yIHNlcnZlcnMgdGhhdCBoYXZlIG9hdXRoLmNsaWVudElkIGNvbmZpZ3VyZWQuXG5cdFx0Ly8gQ29sbGVjdCBjYW5kaWRhdGVzIGZpcnN0LCB0aGVuIGJhdGNoLXJlc29sdmUgc2VjcmV0cyB3aXRoIFByb21pc2UuYWxsIHRvIGF2b2lkXG5cdFx0Ly8gc2VxdWVudGlhbCBhd2FpdHMgZm9yIGVhY2ggc2VydmVyICh3aGljaCB3b3VsZCBzbG93IENvZGVMZW5zIG9uIGxhcmdlciBtY3AuanNvbiBmaWxlcykuXG5cdFx0dHlwZSBTZWNyZXRDYW5kaWRhdGUgPSB7IGNsaWVudElkOiBzdHJpbmc7IG1jcFNlcnZlclVybDogc3RyaW5nOyBzZXJ2ZXJOYW1lOiBzdHJpbmc7IGNsaWVudElkT2Zmc2V0OiBudW1iZXIgfTtcblx0XHRjb25zdCBjYW5kaWRhdGVzOiBTZWNyZXRDYW5kaWRhdGVbXSA9IFtdO1xuXHRcdGZvciAoY29uc3Qgbm9kZSBvZiBzZXJ2ZXJzTm9kZS5jaGlsZHJlbiB8fCBbXSkge1xuXHRcdFx0aWYgKG5vZGUudHlwZSAhPT0gJ3Byb3BlcnR5JyB8fCBub2RlLmNoaWxkcmVuPy5bMF0/LnR5cGUgIT09ICdzdHJpbmcnIHx8ICFub2RlLmNoaWxkcmVuWzFdKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3Qgc2VydmVyTmFtZSA9IG5vZGUuY2hpbGRyZW5bMF0udmFsdWUgYXMgc3RyaW5nO1xuXHRcdFx0Y29uc3Qgc2VydmVyVmFsdWUgPSBub2RlLmNoaWxkcmVuWzFdO1xuXHRcdFx0Y29uc3QgY2xpZW50SWROb2RlID0gZmluZE5vZGVBdExvY2F0aW9uKHNlcnZlclZhbHVlLCBbJ29hdXRoJywgJ2NsaWVudElkJ10pO1xuXHRcdFx0aWYgKGNsaWVudElkTm9kZSAmJiBjbGllbnRJZE5vZGUudHlwZSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0Y29uc3QgY2xpZW50SWQgPSBjbGllbnRJZE5vZGUudmFsdWUgYXMgc3RyaW5nO1xuXHRcdFx0XHRpZiAoY2xpZW50SWQpIHtcblx0XHRcdFx0XHRjb25zdCB1cmxOb2RlID0gZmluZE5vZGVBdExvY2F0aW9uKHNlcnZlclZhbHVlLCBbJ3VybCddKTtcblx0XHRcdFx0XHRjb25zdCByYXdVcmwgPSB1cmxOb2RlICYmIHVybE5vZGUudHlwZSA9PT0gJ3N0cmluZycgPyB1cmxOb2RlLnZhbHVlIGFzIHN0cmluZyA6IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRpZiAoIXJhd1VybCkge1xuXHRcdFx0XHRcdFx0Y29udGludWU7IC8vIE9BdXRoIG9ubHkgbWVhbmluZ2Z1bCBmb3IgSFRUUCBzZXJ2ZXJzLCB3aGljaCByZXF1aXJlIHVybFxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHQvLyBDYW5vbmljYWxpemUgdG8gbWF0Y2ggdGhlIHJ1bnRpbWUga2V5IChVUkkucGFyc2Ugbm9ybWFsaXplcyBhdXRob3JpdHkgY2FzaW5nLCBldGMuKVxuXHRcdFx0XHRcdGxldCBtY3BTZXJ2ZXJVcmw6IHN0cmluZztcblx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0bWNwU2VydmVyVXJsID0gVVJJLnBhcnNlKHJhd1VybCkudG9TdHJpbmcodHJ1ZSk7XG5cdFx0XHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdFx0XHRjb250aW51ZTsgLy8gbWFsZm9ybWVkIFVSTCwgc2tpcFxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjYW5kaWRhdGVzLnB1c2goeyBjbGllbnRJZCwgbWNwU2VydmVyVXJsLCBzZXJ2ZXJOYW1lLCBjbGllbnRJZE9mZnNldDogY2xpZW50SWROb2RlLm9mZnNldCB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRjb25zdCBleGlzdGluZ1NlY3JldHMgPSBhd2FpdCBQcm9taXNlLmFsbChcblx0XHRcdGNhbmRpZGF0ZXMubWFwKGMgPT4gdGhpcy5fc2VjcmV0U3RvcmFnZVNlcnZpY2UuZ2V0KG1jcE9BdXRoQ2xpZW50U2VjcmV0U3RvcmFnZUtleShjLm1jcFNlcnZlclVybCwgYy5jbGllbnRJZCkpKVxuXHRcdCk7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBjYW5kaWRhdGVzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRjb25zdCB7IGNsaWVudElkLCBtY3BTZXJ2ZXJVcmwsIHNlcnZlck5hbWUsIGNsaWVudElkT2Zmc2V0IH0gPSBjYW5kaWRhdGVzW2ldO1xuXHRcdFx0Y29uc3QgZXhpc3RpbmcgPSBleGlzdGluZ1NlY3JldHNbaV07XG5cdFx0XHRjb25zdCB0aXRsZSA9IGV4aXN0aW5nXG5cdFx0XHRcdD8gbG9jYWxpemUoJ21jcC5yZXBsYWNlQ2xpZW50U2VjcmV0JywgXCJSZXBsYWNlIENsaWVudCBTZWNyZXRcIilcblx0XHRcdFx0OiBsb2NhbGl6ZSgnbWNwLnNldENsaWVudFNlY3JldCcsIFwiU2V0IENsaWVudCBTZWNyZXRcIik7XG5cdFx0XHRsZW5zZXMucHVzaCh7XG5cdFx0XHRcdHJhbmdlOiBSYW5nZS5mcm9tUG9zaXRpb25zKG1vZGVsLmdldFBvc2l0aW9uQXQoY2xpZW50SWRPZmZzZXQpKSxcblx0XHRcdFx0Y29tbWFuZDoge1xuXHRcdFx0XHRcdGlkOiBNY3BDb21tYW5kSWRzLlNldE9BdXRoQ2xpZW50U2VjcmV0LFxuXHRcdFx0XHRcdHRpdGxlLFxuXHRcdFx0XHRcdGFyZ3VtZW50czogW2NsaWVudElkLCBtY3BTZXJ2ZXJVcmwsIHNlcnZlck5hbWVdLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGxlbnNMaXN0O1xuXHR9XG5cblx0cHJpdmF0ZSBfYWRkQWdlbnRIb3N0U2VydmVyQ29kZUxlbnNlcyhsZW5zZXM6IENvZGVMZW5zW10sIHJhbmdlOiBSYW5nZSwgYWdlbnRIb3N0U2Vzc2lvbjogVVJJLCBzZXJ2ZXI6IEFnZW50SG9zdE1jcFNlcnZlciwgb3RoZXJSdW5uaW5nU2Vzc2lvbkNvdW50OiBudW1iZXIpOiB2b2lkIHtcblx0XHRjb25zdCBjb21tYW5kQXJnID0geyBhZ2VudEhvc3RTZXNzaW9uLCBzZXJ2ZXJJZDogc2VydmVyLmlkIH07XG5cdFx0aWYgKCFzZXJ2ZXIuZW5hYmxlZCkge1xuXHRcdFx0bGVuc2VzLnB1c2goe1xuXHRcdFx0XHRyYW5nZSxcblx0XHRcdFx0Y29tbWFuZDoge1xuXHRcdFx0XHRcdGlkOiBNY3BDb21tYW5kSWRzLkFnZW50SG9zdFNlcnZlck9wdGlvbnMsXG5cdFx0XHRcdFx0dGl0bGU6ICckKGNpcmNsZS1zbGFzaCkgJyArIGxvY2FsaXplKCdzZXJ2ZXIuZGlzYWJsZWQnLCAnRGlzYWJsZWQnKSxcblx0XHRcdFx0XHRhcmd1bWVudHM6IFthZ2VudEhvc3RTZXNzaW9uLCBzZXJ2ZXIuaWRdLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0c3dpdGNoIChzZXJ2ZXIuc3RhdHVzKSB7XG5cdFx0XHRjYXNlIE1jcFNlcnZlclN0YXR1cy5FcnJvcjpcblx0XHRcdFx0bGVuc2VzLnB1c2goe1xuXHRcdFx0XHRcdHJhbmdlLFxuXHRcdFx0XHRcdGNvbW1hbmQ6IHtcblx0XHRcdFx0XHRcdGlkOiBNY3BDb21tYW5kSWRzLkFnZW50SG9zdFNlcnZlck9wdGlvbnMsXG5cdFx0XHRcdFx0XHR0aXRsZTogJyQoZXJyb3IpICcgKyBsb2NhbGl6ZSgnc2VydmVyLmVycm9yJywgJ0Vycm9yJyksXG5cdFx0XHRcdFx0XHRhcmd1bWVudHM6IFthZ2VudEhvc3RTZXNzaW9uLCBzZXJ2ZXIuaWRdLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRsZW5zZXMucHVzaCh7XG5cdFx0XHRcdFx0cmFuZ2UsXG5cdFx0XHRcdFx0Y29tbWFuZDoge1xuXHRcdFx0XHRcdFx0aWQ6IE1jcENvbW1hbmRJZHMuU3RhcnRTZXJ2ZXIsXG5cdFx0XHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ21jcC5zdGFydCcsIFwiU3RhcnRcIiksXG5cdFx0XHRcdFx0XHRhcmd1bWVudHM6IFtjb21tYW5kQXJnXSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIE1jcFNlcnZlclN0YXR1cy5TdGFydGluZzpcblx0XHRcdFx0bGVuc2VzLnB1c2goe1xuXHRcdFx0XHRcdHJhbmdlLFxuXHRcdFx0XHRcdGNvbW1hbmQ6IHtcblx0XHRcdFx0XHRcdGlkOiBNY3BDb21tYW5kSWRzLkFnZW50SG9zdFNlcnZlck9wdGlvbnMsXG5cdFx0XHRcdFx0XHR0aXRsZTogJyQobG9hZGluZ35zcGluKSAnICsgbG9jYWxpemUoJ3NlcnZlci5zdGFydGluZycsICdTdGFydGluZycpLFxuXHRcdFx0XHRcdFx0YXJndW1lbnRzOiBbYWdlbnRIb3N0U2Vzc2lvbiwgc2VydmVyLmlkXSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0bGVuc2VzLnB1c2goe1xuXHRcdFx0XHRcdHJhbmdlLFxuXHRcdFx0XHRcdGNvbW1hbmQ6IHtcblx0XHRcdFx0XHRcdGlkOiBNY3BDb21tYW5kSWRzLlN0b3BTZXJ2ZXIsXG5cdFx0XHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ2NhbmNlbCcsIFwiQ2FuY2VsXCIpLFxuXHRcdFx0XHRcdFx0YXJndW1lbnRzOiBbY29tbWFuZEFyZ10sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBNY3BTZXJ2ZXJTdGF0dXMuUmVhZHk6XG5cdFx0XHRcdGxlbnNlcy5wdXNoKHtcblx0XHRcdFx0XHRyYW5nZSxcblx0XHRcdFx0XHRjb21tYW5kOiB7XG5cdFx0XHRcdFx0XHRpZDogTWNwQ29tbWFuZElkcy5BZ2VudEhvc3RTZXJ2ZXJPcHRpb25zLFxuXHRcdFx0XHRcdFx0dGl0bGU6ICckKGNoZWNrKSAnICsgbG9jYWxpemUoJ3NlcnZlci5ydW5uaW5nJywgJ1J1bm5pbmcnKSxcblx0XHRcdFx0XHRcdGFyZ3VtZW50czogW2FnZW50SG9zdFNlc3Npb24sIHNlcnZlci5pZF0sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGxlbnNlcy5wdXNoKHtcblx0XHRcdFx0XHRyYW5nZSxcblx0XHRcdFx0XHRjb21tYW5kOiB7XG5cdFx0XHRcdFx0XHRpZDogTWNwQ29tbWFuZElkcy5TdG9wU2VydmVyLFxuXHRcdFx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdtY3Auc3RvcCcsIFwiU3RvcFwiKSxcblx0XHRcdFx0XHRcdGFyZ3VtZW50czogW2NvbW1hbmRBcmddLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgTWNwU2VydmVyU3RhdHVzLkF1dGhSZXF1aXJlZDpcblx0XHRcdFx0bGVuc2VzLnB1c2goe1xuXHRcdFx0XHRcdHJhbmdlLFxuXHRcdFx0XHRcdGNvbW1hbmQ6IHtcblx0XHRcdFx0XHRcdGlkOiBNY3BDb21tYW5kSWRzLkFnZW50SG9zdFNlcnZlck9wdGlvbnMsXG5cdFx0XHRcdFx0XHR0aXRsZTogJyQoYWNjb3VudCkgJyArIGxvY2FsaXplKCdzZXJ2ZXIuYXV0aFJlcXVpcmVkJywgJ0F1dGhlbnRpY2F0aW9uIFJlcXVpcmVkJyksXG5cdFx0XHRcdFx0XHRhcmd1bWVudHM6IFthZ2VudEhvc3RTZXNzaW9uLCBzZXJ2ZXIuaWRdLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRsZW5zZXMucHVzaCh7XG5cdFx0XHRcdFx0cmFuZ2UsXG5cdFx0XHRcdFx0Y29tbWFuZDoge1xuXHRcdFx0XHRcdFx0aWQ6IE1jcENvbW1hbmRJZHMuU3RvcFNlcnZlcixcblx0XHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnbWNwLnN0b3AnLCBcIlN0b3BcIiksXG5cdFx0XHRcdFx0XHRhcmd1bWVudHM6IFtjb21tYW5kQXJnXSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIE1jcFNlcnZlclN0YXR1cy5TdG9wcGVkOlxuXHRcdFx0XHRsZW5zZXMucHVzaCh7XG5cdFx0XHRcdFx0cmFuZ2UsXG5cdFx0XHRcdFx0Y29tbWFuZDoge1xuXHRcdFx0XHRcdFx0aWQ6IE1jcENvbW1hbmRJZHMuU3RhcnRTZXJ2ZXIsXG5cdFx0XHRcdFx0XHR0aXRsZTogJyQoZGVidWctc3RhcnQpICcgKyBsb2NhbGl6ZSgnbWNwLnN0YXJ0JywgXCJTdGFydFwiKSxcblx0XHRcdFx0XHRcdGFyZ3VtZW50czogW2NvbW1hbmRBcmddLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRicmVhaztcblx0XHR9XG5cblx0XHRpZiAob3RoZXJSdW5uaW5nU2Vzc2lvbkNvdW50ID4gMCkge1xuXHRcdFx0bGVuc2VzLnB1c2goe1xuXHRcdFx0XHRyYW5nZSxcblx0XHRcdFx0Y29tbWFuZDoge1xuXHRcdFx0XHRcdGlkOiAnJyxcblx0XHRcdFx0XHR0aXRsZTogb3RoZXJSdW5uaW5nU2Vzc2lvbkNvdW50ID09PSAxXG5cdFx0XHRcdFx0XHQ/IGxvY2FsaXplKCdzZXJ2ZXIucnVubmluZ0luT25lT3RoZXJTZXNzaW9uJywgJyhSdW5uaW5nIGluIDEgc2Vzc2lvbiknKVxuXHRcdFx0XHRcdFx0OiBsb2NhbGl6ZSgnc2VydmVyLnJ1bm5pbmdJbk90aGVyU2Vzc2lvbnMnLCAnKFJ1bm5pbmcgaW4gezB9IHNlc3Npb25zKScsIG90aGVyUnVubmluZ1Nlc3Npb25Db3VudCksXG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdGlmIChzZXJ2ZXIuc3RhdHVzICE9PSBNY3BTZXJ2ZXJTdGF0dXMuRXJyb3IpIHtcblx0XHRcdGxlbnNlcy5wdXNoKHtcblx0XHRcdFx0cmFuZ2UsXG5cdFx0XHRcdGNvbW1hbmQ6IHtcblx0XHRcdFx0XHRpZDogTWNwQ29tbWFuZElkcy5BZ2VudEhvc3RTZXJ2ZXJPcHRpb25zLFxuXHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnbWNwLnNlcnZlci5tb3JlJywgJ01vcmUuLi4nKSxcblx0XHRcdFx0XHRhcmd1bWVudHM6IFthZ2VudEhvc3RTZXNzaW9uLCBzZXJ2ZXIuaWRdLFxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9nZXRPdGhlclJ1bm5pbmdBZ2VudEhvc3RNY3BTZXJ2ZXJDb3VudHMoYWdlbnRIb3N0U2Vzc2lvbjogVVJJKTogTWFwPHN0cmluZywgbnVtYmVyPiB7XG5cdFx0Y29uc3Qgc2Vzc2lvblNlcnZlcnM6IElNY3BFZGl0b3JBZ2VudEhvc3RTZXNzaW9uU2VydmVyc1tdID0gW107XG5cdFx0Zm9yIChjb25zdCBjb25uZWN0aW9uSW5mbyBvZiB0aGlzLl9hZ2VudEhvc3RDb25uZWN0aW9uc1NlcnZpY2UuY29ubmVjdGlvbnMpIHtcblx0XHRcdGNvbnN0IGNvbm5lY3Rpb24gPSBjb25uZWN0aW9uSW5mby5jb25uZWN0aW9uO1xuXHRcdFx0aWYgKCFjb25uZWN0aW9uKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRmb3IgKGNvbnN0IHN1YnNjcmlwdGlvbiBvZiBjb25uZWN0aW9uLmdldEFjdGl2ZVN1YnNjcmlwdGlvbnMoKSkge1xuXHRcdFx0XHRpZiAoc3Vic2NyaXB0aW9uLmtpbmQgIT09IFN0YXRlQ29tcG9uZW50cy5TZXNzaW9uKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBzdGF0ZSA9IGNvbm5lY3Rpb24uZ2V0U3Vic2NyaXB0aW9uVW5tYW5hZ2VkKFN0YXRlQ29tcG9uZW50cy5TZXNzaW9uLCBzdWJzY3JpcHRpb24ucmVzb3VyY2UpPy52YWx1ZTtcblx0XHRcdFx0Y29uc3QgcmVzb3VyY2UgPSB0aGlzLl90b0FnZW50SG9zdFNlc3Npb25SZXNvdXJjZShjb25uZWN0aW9uSW5mbywgc3Vic2NyaXB0aW9uLnJlc291cmNlKTtcblx0XHRcdFx0aWYgKCFyZXNvdXJjZSB8fCAhc3RhdGUgfHwgc3RhdGUgaW5zdGFuY2VvZiBFcnJvcikge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0c2Vzc2lvblNlcnZlcnMucHVzaCh7IHJlc291cmNlLCBzZXJ2ZXJzOiB0aGlzLl9nZXRNY3BTZXJ2ZXJzRnJvbVNlc3Npb25TdGF0ZShzdGF0ZSkgfSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBjb3VudFJ1bm5pbmdNY3BTZXJ2ZXJzSW5PdGhlclNlc3Npb25zKGFnZW50SG9zdFNlc3Npb24sIHNlc3Npb25TZXJ2ZXJzKTtcblx0fVxuXG5cdHByaXZhdGUgX3RvQWdlbnRIb3N0U2Vzc2lvblJlc291cmNlKGNvbm5lY3Rpb25JbmZvOiBJQWdlbnRIb3N0Q29ubmVjdGlvbkluZm8sIGJhY2tlbmRTZXNzaW9uOiBVUkkpOiBVUkkgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gQWdlbnRTZXNzaW9uLnByb3ZpZGVyKGJhY2tlbmRTZXNzaW9uKTtcblx0XHRpZiAoIXByb3ZpZGVyKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBzY2hlbWUgPSBjb25uZWN0aW9uSW5mby5pc0FtYmllbnRcblx0XHRcdD8gYCR7TE9DQUxfQUdFTlRfSE9TVF9TQ0hFTUVfUFJFRklYfSR7cHJvdmlkZXJ9YFxuXHRcdFx0OiByZW1vdGVBZ2VudEhvc3RTZXNzaW9uVHlwZUlkKGNvbm5lY3Rpb25JbmZvLmF1dGhvcml0eSwgcHJvdmlkZXIpO1xuXHRcdHJldHVybiBVUkkuZnJvbSh7IHNjaGVtZSwgcGF0aDogYmFja2VuZFNlc3Npb24ucGF0aCB9KTtcblx0fVxuXG5cdHByaXZhdGUgX2dldE1jcFNlcnZlcnNGcm9tU2Vzc2lvblN0YXRlKHN0YXRlOiBTZXNzaW9uU3RhdGUpOiBJTWNwRWRpdG9yQWdlbnRIb3N0U2VydmVyW10ge1xuXHRcdGNvbnN0IHNlcnZlcnM6IElNY3BFZGl0b3JBZ2VudEhvc3RTZXJ2ZXJbXSA9IFtdO1xuXHRcdGNvbnN0IGNvbGxlY3QgPSAoY3VzdG9taXphdGlvbnM6IHJlYWRvbmx5IChDdXN0b21pemF0aW9uIHwgQ2hpbGRDdXN0b21pemF0aW9uKVtdIHwgdW5kZWZpbmVkKSA9PiB7XG5cdFx0XHRmb3IgKGNvbnN0IGN1c3RvbWl6YXRpb24gb2YgY3VzdG9taXphdGlvbnMgPz8gW10pIHtcblx0XHRcdFx0aWYgKGN1c3RvbWl6YXRpb24udHlwZSA9PT0gQ3VzdG9taXphdGlvblR5cGUuTWNwU2VydmVyKSB7XG5cdFx0XHRcdFx0c2VydmVycy5wdXNoKHtcblx0XHRcdFx0XHRcdG5hbWU6IGN1c3RvbWl6YXRpb24ubmFtZSxcblx0XHRcdFx0XHRcdGVuYWJsZWQ6IGlzQ3VzdG9taXphdGlvbkVuYWJsZWQoY3VzdG9taXphdGlvbiksXG5cdFx0XHRcdFx0XHRzdGF0dXM6IGN1c3RvbWl6YXRpb24uc3RhdGUua2luZCxcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSBlbHNlIGlmIChjdXN0b21pemF0aW9uLnR5cGUgPT09IEN1c3RvbWl6YXRpb25UeXBlLkRpcmVjdG9yeSB8fCBjdXN0b21pemF0aW9uLnR5cGUgPT09IEN1c3RvbWl6YXRpb25UeXBlLlBsdWdpbikge1xuXHRcdFx0XHRcdGNvbGxlY3QoY3VzdG9taXphdGlvbi5jaGlsZHJlbik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9O1xuXHRcdGNvbGxlY3Qoc3RhdGUuY3VzdG9taXphdGlvbnMpO1xuXHRcdHJldHVybiBzZXJ2ZXJzO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcHJvdmlkZUlubGF5SGludHMobW9kZWw6IElUZXh0TW9kZWwsIHJhbmdlOiBSYW5nZSk6IFByb21pc2U8SW5sYXlIaW50TGlzdCB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHBhcnNlZCA9IGF3YWl0IHRoaXMuX3BhcnNlTW9kZWwobW9kZWwpO1xuXHRcdGlmICghcGFyc2VkKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IHsgdHJlZSwgaW5Db25maWcgfSA9IHBhcnNlZDtcblx0XHRjb25zdCBtY3BTZWN0aW9uID0gaW5Db25maWcuc2VjdGlvbiA/IGZpbmROb2RlQXRMb2NhdGlvbih0cmVlLCBbLi4uaW5Db25maWcuc2VjdGlvbl0pIDogdHJlZTtcblx0XHRpZiAoIW1jcFNlY3Rpb24pIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgaW5wdXRzTm9kZSA9IGZpbmROb2RlQXRMb2NhdGlvbihtY3BTZWN0aW9uLCBbJ2lucHV0cyddKTtcblx0XHRpZiAoIWlucHV0c05vZGUpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgaW5wdXRzID0gYXdhaXQgdGhpcy5fbWNwUmVnaXN0cnkuZ2V0U2F2ZWRJbnB1dHMoaW5Db25maWcuc2NvcGUpO1xuXHRcdGNvbnN0IGhpbnRzOiBJbmxheUhpbnRbXSA9IFtdO1xuXG5cdFx0Y29uc3Qgc2VydmVyc05vZGUgPSBmaW5kTm9kZUF0TG9jYXRpb24obWNwU2VjdGlvbiwgW2luQ29uZmlnLnNlcnZlcnNLZXkgPz8gJ3NlcnZlcnMnXSk7XG5cdFx0aWYgKHNlcnZlcnNOb2RlKSB7XG5cdFx0XHRhbm5vdGF0ZVNlcnZlcnMoc2VydmVyc05vZGUpO1xuXHRcdH1cblx0XHRhbm5vdGF0ZUlucHV0cyhpbnB1dHNOb2RlKTtcblxuXHRcdHJldHVybiB7IGhpbnRzLCBkaXNwb3NlOiAoKSA9PiB7IH0gfTtcblxuXHRcdGZ1bmN0aW9uIGFubm90YXRlU2VydmVycyhzZXJ2ZXJzOiBOb2RlKSB7XG5cdFx0XHRmb3JFYWNoUHJvcGVydHlXaXRoUmVwbGFjZW1lbnQoc2VydmVycywgbm9kZSA9PiB7XG5cdFx0XHRcdGNvbnN0IGV4cHIgPSBDb25maWd1cmF0aW9uUmVzb2x2ZXJFeHByZXNzaW9uLnBhcnNlKG5vZGUudmFsdWUpO1xuXHRcdFx0XHRmb3IgKGNvbnN0IHsgaWQgfSBvZiBleHByLnVucmVzb2x2ZWQoKSkge1xuXHRcdFx0XHRcdGNvbnN0IHNhdmVkID0gaW5wdXRzW2lkXTtcblx0XHRcdFx0XHRpZiAoc2F2ZWQpIHtcblx0XHRcdFx0XHRcdHB1c2hBbm5vdGF0aW9uKGlkLCBub2RlLm9mZnNldCArIG5vZGUudmFsdWUuaW5kZXhPZihpZCkgKyBpZC5sZW5ndGgsIHNhdmVkKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdGZ1bmN0aW9uIGFubm90YXRlSW5wdXRzKG5vZGU6IE5vZGUpIHtcblx0XHRcdGlmIChub2RlLnR5cGUgIT09ICdhcnJheScgfHwgIW5vZGUuY2hpbGRyZW4pIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRmb3IgKGNvbnN0IGlucHV0IG9mIG5vZGUuY2hpbGRyZW4pIHtcblx0XHRcdFx0aWYgKGlucHV0LnR5cGUgIT09ICdvYmplY3QnIHx8ICFpbnB1dC5jaGlsZHJlbikge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgaWRQcm9wID0gaW5wdXQuY2hpbGRyZW4uZmluZChjID0+IGMudHlwZSA9PT0gJ3Byb3BlcnR5JyAmJiBjLmNoaWxkcmVuPy5bMF0udmFsdWUgPT09ICdpZCcpO1xuXHRcdFx0XHRpZiAoIWlkUHJvcCkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgaWQgPSBpZFByb3AuY2hpbGRyZW4hWzFdO1xuXHRcdFx0XHRpZiAoIWlkIHx8IGlkLnR5cGUgIT09ICdzdHJpbmcnIHx8ICFpZC52YWx1ZSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3Qgc2F2ZWRJZCA9ICcke2lucHV0OicgKyBpZC52YWx1ZSArICd9Jztcblx0XHRcdFx0Y29uc3Qgc2F2ZWQgPSBpbnB1dHNbc2F2ZWRJZF07XG5cdFx0XHRcdGlmIChzYXZlZCkge1xuXHRcdFx0XHRcdHB1c2hBbm5vdGF0aW9uKHNhdmVkSWQsIGlkLm9mZnNldCArIDEgKyBpZC5sZW5ndGgsIHNhdmVkKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGZ1bmN0aW9uIHB1c2hBbm5vdGF0aW9uKHNhdmVkSWQ6IHN0cmluZywgb2Zmc2V0OiBudW1iZXIsIHNhdmVkOiBJUmVzb2x2ZWRWYWx1ZSk6IElubGF5SGludCB7XG5cdFx0XHRjb25zdCB0b29sdGlwID0gbmV3IE1hcmtkb3duU3RyaW5nKFtcblx0XHRcdFx0Y3JlYXRlTWFya2Rvd25Db21tYW5kTGluayh7IGlkOiBNY3BDb21tYW5kSWRzLkVkaXRTdG9yZWRJbnB1dCwgdGV4dDogbG9jYWxpemUoJ2VkaXQnLCAnRWRpdCcpLCBhcmd1bWVudHM6IFtzYXZlZElkLCBtb2RlbC51cmksIG1jcENvbmZpZ3VyYXRpb25TZWN0aW9uLCBpbkNvbmZpZyEudGFyZ2V0XSwgdG9vbHRpcDogbG9jYWxpemUoJ2VkaXQuc2F2ZWRWYWx1ZS50b29sdGlwJywgJ0VkaXQgc2F2ZWQgdmFsdWUnKSB9KSxcblx0XHRcdFx0Y3JlYXRlTWFya2Rvd25Db21tYW5kTGluayh7IGlkOiBNY3BDb21tYW5kSWRzLlJlbW92ZVN0b3JlZElucHV0LCB0ZXh0OiBsb2NhbGl6ZSgnY2xlYXInLCAnQ2xlYXInKSwgYXJndW1lbnRzOiBbaW5Db25maWchLnNjb3BlLCBzYXZlZElkXSwgdG9vbHRpcDogbG9jYWxpemUoJ2NsZWFyLnNhdmVkVmFsdWUudG9vbHRpcCcsICdDbGVhciBzYXZlZCB2YWx1ZScpIH0pLFxuXHRcdFx0XHRjcmVhdGVNYXJrZG93bkNvbW1hbmRMaW5rKHsgaWQ6IE1jcENvbW1hbmRJZHMuUmVtb3ZlU3RvcmVkSW5wdXQsIHRleHQ6IGxvY2FsaXplKCdjbGVhckFsbCcsICdDbGVhciBBbGwnKSwgYXJndW1lbnRzOiBbaW5Db25maWchLnNjb3BlXSwgdG9vbHRpcDogbG9jYWxpemUoJ2NsZWFyQWxsLnNhdmVkVmFsdWVzLnRvb2x0aXAnLCAnQ2xlYXIgYWxsIHNhdmVkIHZhbHVlcycpIH0pLFxuXHRcdFx0XS5qb2luKCcgfCAnKSwgeyBpc1RydXN0ZWQ6IHRydWUgfSk7XG5cblx0XHRcdGNvbnN0IGhpbnQ6IElubGF5SGludCA9IHtcblx0XHRcdFx0bGFiZWw6ICc9ICcgKyAoc2F2ZWQuaW5wdXQ/LnR5cGUgPT09ICdwcm9tcHRTdHJpbmcnICYmIHNhdmVkLmlucHV0LnBhc3N3b3JkID8gJyonLnJlcGVhdCgxMCkgOiAoc2F2ZWQudmFsdWUgfHwgJycpKSxcblx0XHRcdFx0cG9zaXRpb246IG1vZGVsLmdldFBvc2l0aW9uQXQob2Zmc2V0KSxcblx0XHRcdFx0dG9vbHRpcCxcblx0XHRcdFx0cGFkZGluZ0xlZnQ6IHRydWUsXG5cdFx0XHR9O1xuXG5cdFx0XHRoaW50cy5wdXNoKGhpbnQpO1xuXHRcdFx0cmV0dXJuIGhpbnQ7XG5cdFx0fVxuXHR9XG59XG5cblxuXG5mdW5jdGlvbiBmb3JFYWNoUHJvcGVydHlXaXRoUmVwbGFjZW1lbnQobm9kZTogTm9kZSwgY2FsbGJhY2s6IChub2RlOiBOb2RlKSA9PiB2b2lkKSB7XG5cdGlmIChub2RlLnR5cGUgPT09ICdzdHJpbmcnICYmIHR5cGVvZiBub2RlLnZhbHVlID09PSAnc3RyaW5nJyAmJiBub2RlLnZhbHVlLmluY2x1ZGVzKENvbmZpZ3VyYXRpb25SZXNvbHZlckV4cHJlc3Npb24uVkFSSUFCTEVfTEhTKSkge1xuXHRcdGNhbGxiYWNrKG5vZGUpO1xuXHR9IGVsc2UgaWYgKG5vZGUudHlwZSA9PT0gJ3Byb3BlcnR5Jykge1xuXHRcdC8vIHNraXAgdGhlIHByb3BlcnR5IG5hbWVcblx0XHRub2RlLmNoaWxkcmVuPy5zbGljZSgxKS5mb3JFYWNoKG4gPT4gZm9yRWFjaFByb3BlcnR5V2l0aFJlcGxhY2VtZW50KG4sIGNhbGxiYWNrKSk7XG5cdH0gZWxzZSB7XG5cdFx0bm9kZS5jaGlsZHJlbj8uZm9yRWFjaChuID0+IGZvckVhY2hQcm9wZXJ0eVdpdGhSZXBsYWNlbWVudChuLCBjYWxsYmFjaykpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsa0NBQWtDO0FBQzNDLFNBQVMsU0FBUyxhQUFhO0FBQy9CLFNBQVMsMkJBQTJCLHNCQUFzQjtBQUMxRCxTQUFTLG9CQUEwQixpQkFBaUI7QUFDcEQsU0FBUyxZQUFZLGlCQUFpQixTQUFzQix5QkFBeUI7QUFFckYsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsV0FBVztBQUNwQixTQUFTLGFBQWE7QUFHdEIsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBbUMsOEJBQThCLHNDQUFzQztBQUN2RyxTQUFTLG9DQUFvQztBQUM3QyxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLG1CQUFtQix1QkFBdUY7QUFDbkgsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUywyQkFBMkI7QUFDcEMsU0FBc0IsZ0JBQWdCLHNCQUFzQjtBQUM1RCxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLG9CQUFvQjtBQUU3QixTQUFTLHFDQUFxQztBQUM5QyxTQUFTLHVDQUF1RDtBQUNoRSxTQUFTLHNDQUFzQztBQUMvQyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLCtCQUErQjtBQUN4QyxTQUFTLHVDQUF1Qyw0Q0FBK0c7QUFDL0osU0FBUyxvQkFBb0I7QUFDN0IsU0FBOEMsYUFBYSxzQkFBc0Isb0JBQW9CLHNDQUFzQztBQUUzSSxNQUFNLGtCQUFrQjtBQVFqQixJQUFNLHNCQUFOLGNBQWtDLFdBQTZDO0FBQUEsRUFHckYsWUFDMkIseUJBQ0ss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
