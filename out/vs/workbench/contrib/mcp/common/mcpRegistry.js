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
import { assertNever } from "../../../../base/common/assert.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { Emitter } from "../../../../base/common/event.js";
import { MarkdownString } from "../../../../base/common/htmlContent.js";
import { Iterable } from "../../../../base/common/iterator.js";
import { Lazy } from "../../../../base/common/lazy.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { derived, observableValue, autorunSelfDisposable } from "../../../../base/common/observable.js";
import { isDefined } from "../../../../base/common/types.js";
import { URI } from "../../../../base/common/uri.js";
import { localize } from "../../../../nls.js";
import { ConfigurationTarget, IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { ExtensionIdentifier } from "../../../../platform/extensions/common/extensions.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { mcpAccessConfig, McpAccessValue } from "../../../../platform/mcp/common/mcpManagement.js";
import { INotificationService, Severity } from "../../../../platform/notification/common/notification.js";
import { observableConfigValue } from "../../../../platform/observable/common/platformObservableUtils.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { IWorkspaceTrustManagementService, IWorkspaceTrustRequestService } from "../../../../platform/workspace/common/workspaceTrust.js";
import { IConfigurationResolverService } from "../../../services/configurationResolver/common/configurationResolver.js";
import { ConfigurationResolverExpression } from "../../../services/configurationResolver/common/configurationResolverExpression.js";
import { AUX_WINDOW_GROUP, IEditorService } from "../../../services/editor/common/editorService.js";
import { IMcpDevModeDebugging } from "./mcpDevMode.js";
import { McpRegistryInputStorage } from "./mcpRegistryInputStorage.js";
import { IMcpSandboxService } from "./mcpSandboxService.js";
import { McpServerConnection } from "./mcpServerConnection.js";
import { LazyCollectionState, McpCollectionProvenance, McpServerLaunch, McpServerTrust, McpStartServerInteraction, UserInteractionRequiredError } from "./mcpTypes.js";
import { COPILOT_STRICT_PLUGIN_ONLY_CUSTOMIZATION_CONFIG } from "../../../../platform/policy/common/copilotManagedSettings.js";
import { isStrictPluginOnlyCustomizationEnabled } from "../../chat/common/customizationLockdown.js";
const notTrustedNonce = "__vscode_not_trusted";
let McpRegistry = class extends Disposable {
  constructor(_instantiationService, _configurationResolverService, _dialogService, _notificationService, _editorService, configurationService, _quickInputService, _labelService, _logService, _mcpSandboxService, _workspaceTrustManagementService, _workspaceTrustRequestService) {
    super();
    this._instantiationService = _instantiationService;
    this._configurationResolverService = _configurationResolverService;
    this._dialogService = _dialogService;
    this._notificationService = _notificationService;
    this._editorService = _editorService;
    this._quickInputService = _quickInputService;
    this._labelService = _labelService;
    this._logService = _logService;
    this._mcpSandboxService = _mcpSandboxService;
    this._workspaceTrustManagementService = _workspaceTrustManagementService;
    this._workspaceTrustRequestService = _workspaceTrustRequestService;
    this._collections = observableValue("collections", []);
    this._delegates = observableValue("delegates", []);
    this.collections = derived((reader) => {
      if (this._mcpAccessValue.read(reader) === McpAccessValue.None) {
        return [];
      }
      const strictPluginOnly = this._strictPluginOnlyCustomization.read(reader);
      return this._collections.read(reader).filter((collection) => this.isCollectionAllowed(collection, strictPluginOnly));
    });
    this._workspaceStorage = new Lazy(() => this._register(this._instantiationService.createInstance(McpRegistryInputStorage, StorageScope.WORKSPACE, StorageTarget.USER)));
    this._profileStorage = new Lazy(() => this._register(this._instantiationService.createInstance(McpRegistryInputStorage, StorageScope.PROFILE, StorageTarget.USER)));
    this._ongoingLazyActivations = observableValue(this, 0);
    this.lazyCollectionState = derived((reader) => {
      if (this._mcpAccessValue.read(reader) === McpAccessValue.None) {
        return { state: LazyCollectionState.AllKnown, collections: [] };
      }
      if (this._ongoingLazyActivations.read(reader) > 0) {
        return { state: LazyCollectionState.LoadingUnknown, collections: [] };
      }
      const strictPluginOnly = this._strictPluginOnlyCustomization.read(reader);
      const collections = this._collections.read(reader).filter((collection) => this.isCollectionAllowed(collection, strictPluginOnly));
      const hasUnknown = collections.some((c) => c.lazy && c.lazy.isCached === false);
      return hasUnknown ? { state: LazyCollectionState.HasUnknown, collections: collections.filter((c) => c.lazy && c.lazy.isCached === false) } : { state: LazyCollectionState.AllKnown, collections: [] };
    });
    this._onDidChangeInputs = this._register(new Emitter());
    this.onDidChangeInputs = this._onDidChangeInputs.event;
    this._mcpAccessValue = observableConfigValue(mcpAccessConfig, McpAccessValue.All, configurationService);
    this._strictPluginOnlyCustomization = observableConfigValue(COPILOT_STRICT_PLUGIN_ONLY_CUSTOMIZATION_CONFIG, void 0, configurationService);
  }
  get delegates() {
    return this._delegates;
  }
  registerDelegate(delegate) {
    const delegates = this._delegates.get().slice();
    delegates.push(delegate);
    delegates.sort((a, b) => b.priority - a.priority);
    this._delegates.set(delegates, void 0);
    return {
      dispose: () => {
        const delegates2 = this._delegates.get().filter((d) => d !== delegate);
        this._delegates.set(delegates2, void 0);
      }
    };
  }
  registerCollection(collection) {
    const currentCollections = this._collections.get();
    const toReplace = currentCollections.find((c) => c.id === collection.id);
    if (toReplace && !toReplace.lazy) {
      return Disposable.None;
    } else if (toReplace) {
      this._collections.set(currentCollections.map((c) => c === toReplace ? collection : c), void 0);
    } else {
      this._collections.set([...currentCollections, collection].sort((a, b) => a.order - b.order), void 0);
    }
    return {
      dispose: () => {
        const currentCollections2 = this._collections.get();
        this._collections.set(currentCollections2.filter((c) => c !== collection), void 0);
      }
    };
  }
  getServerDefinition(collectionRef, definitionRef) {
    const collectionObs = this._collections.map((cols) => cols.find((c) => c.id === collectionRef.id));
    return collectionObs.map((collection, reader) => {
      if (collection && !this.isCollectionAllowed(collection, this._strictPluginOnlyCustomization.read(reader))) {
        return { collection: void 0, server: void 0 };
      }
      const server = collection?.serverDefinitions.read(reader).find((s) => s.id === definitionRef.id);
      return { collection, server };
    });
  }
  async discoverCollections() {
    const strictPluginOnly = this._strictPluginOnlyCustomization.get();
    const toDiscover = this._collections.get().filter((c) => this.isCollectionAllowed(c, strictPluginOnly) && c.lazy && !c.lazy.isCached);
    this._ongoingLazyActivations.set(this._ongoingLazyActivations.get() + 1, void 0);
    await Promise.all(toDiscover.map((c) => c.lazy?.load())).finally(() => {
      this._ongoingLazyActivations.set(this._ongoingLazyActivations.get() - 1, void 0);
    });
    const found = [];
    const current = this._collections.get();
    for (const collection of toDiscover) {
      const rec = current.find((c) => c.id === collection.id);
      if (!rec) {
      } else if (rec.lazy) {
        rec.lazy.removed?.();
      } else {
        found.push(rec);
      }
    }
    return found;
  }
  _getInputStorage(scope) {
    return scope === StorageScope.WORKSPACE ? this._workspaceStorage.value : this._profileStorage.value;
  }
  _getInputStorageInConfigTarget(configTarget) {
    return this._getInputStorage(
      configTarget === ConfigurationTarget.WORKSPACE || configTarget === ConfigurationTarget.WORKSPACE_FOLDER ? StorageScope.WORKSPACE : StorageScope.PROFILE
    );
  }
  async clearSavedInputs(scope, inputId) {
    const storage = this._getInputStorage(scope);
    if (inputId) {
      await storage.clear(inputId);
    } else {
      storage.clearAll();
    }
    this._onDidChangeInputs.fire();
  }
  async editSavedInput(inputId, folderData, configSection, target) {
    const storage = this._getInputStorageInConfigTarget(target);
    const expr = ConfigurationResolverExpression.parse(inputId);
    const stored = await storage.getMap();
    const previous = stored[inputId].value;
    await this._configurationResolverService.resolveWithInteraction(folderData, expr, configSection, previous ? { [inputId.slice(2, -1)]: previous } : {}, target);
    await this._updateStorageWithExpressionInputs(storage, expr);
  }
  async setSavedInput(inputId, target, value) {
    const storage = this._getInputStorageInConfigTarget(target);
    const expr = ConfigurationResolverExpression.parse(inputId);
    for (const unresolved of expr.unresolved()) {
      expr.resolve(unresolved, value);
      break;
    }
    await this._updateStorageWithExpressionInputs(storage, expr);
  }
  getSavedInputs(scope) {
    return this._getInputStorage(scope).getMap();
  }
  async _checkTrust(collection, definition, {
    trustNonceBearer,
    interaction,
    promptType = "only-new",
    autoTrustChanges = false,
    errorOnUserInteraction = false
  }) {
    if (collection.scope === StorageScope.WORKSPACE && !this._workspaceTrustManagementService.isWorkspaceTrusted()) {
      if (errorOnUserInteraction) {
        throw new UserInteractionRequiredError("workspaceTrust");
      } else if (!await this._workspaceTrustRequestService.requestWorkspaceTrust({ message: localize("runTrust", "This MCP server definition is defined in your workspace files.") })) {
        return false;
      }
    }
    if (collection.trustBehavior === McpServerTrust.Kind.Trusted) {
      this._logService.trace(`MCP server ${definition.id} is trusted, no trust prompt needed`);
      return true;
    } else if (collection.trustBehavior === McpServerTrust.Kind.TrustedOnNonce) {
      if (definition.cacheNonce === trustNonceBearer.trustedAtNonce) {
        this._logService.trace(`MCP server ${definition.id} is unchanged, no trust prompt needed`);
        return true;
      }
      if (autoTrustChanges) {
        this._logService.trace(`MCP server ${definition.id} is was changed but user explicitly executed`);
        trustNonceBearer.trustedAtNonce = definition.cacheNonce;
        return true;
      }
      if (trustNonceBearer.trustedAtNonce === notTrustedNonce) {
        if (promptType === "all-untrusted") {
          if (errorOnUserInteraction) {
            throw new UserInteractionRequiredError("serverTrust");
          }
          return this._promptForTrust(definition, collection, interaction, trustNonceBearer);
        } else {
          this._logService.trace(`MCP server ${definition.id} is untrusted, denying trust prompt`);
          return false;
        }
      }
      if (promptType === "never") {
        this._logService.trace(`MCP server ${definition.id} trust state is unknown, skipping prompt`);
        return false;
      }
      if (errorOnUserInteraction) {
        throw new UserInteractionRequiredError("serverTrust");
      }
      const didTrust = await this._promptForTrust(definition, collection, interaction, trustNonceBearer);
      if (didTrust) {
        return true;
      }
      if (didTrust === void 0) {
        return void 0;
      }
      trustNonceBearer.trustedAtNonce = notTrustedNonce;
      return false;
    } else {
      assertNever(collection.trustBehavior);
    }
  }
  async _promptForTrust(definition, collection, interaction, trustNonceBearer) {
    interaction ??= new McpStartServerInteraction();
    interaction.participants.set(definition.id, { s: "waiting", definition, collection });
    const trustedDefinitionIds = await new Promise((resolve) => {
      autorunSelfDisposable((reader) => {
        const map = interaction.participants.observable.read(reader);
        if (Iterable.some(map.values(), (p) => p.s === "unknown")) {
          return;
        }
        reader.dispose();
        interaction.choice ??= this._promptForTrustOpenDialog(
          [...map.values()].map((v) => v.s === "waiting" ? v : void 0).filter(isDefined)
        );
        resolve(interaction.choice);
      });
    });
    this._logService.trace(`MCP trusted servers:`, trustedDefinitionIds);
    if (trustedDefinitionIds) {
      trustNonceBearer.trustedAtNonce = trustedDefinitionIds.includes(definition.id) ? definition.cacheNonce : notTrustedNonce;
    }
    return !!trustedDefinitionIds?.includes(definition.id);
  }
  /**
   * Confirms with the user which of the provided definitions should be trusted.
   * Returns undefined if the user cancelled the flow, or the list of trusted
   * definition IDs otherwise.
   */
  async _promptForTrustOpenDialog(definitions) {
    function labelFor(r) {
      const originURI = r.definition.presentation?.origin?.uri || r.collection.presentation?.origin;
      let labelWithOrigin = originURI ? `[\`${r.definition.label}\`](${originURI})` : "`" + r.definition.label + "`";
      if (r.collection.source instanceof ExtensionIdentifier) {
        labelWithOrigin += ` (${localize("trustFromExt", "from {0}", r.collection.source.value)})`;
      }
      return labelWithOrigin;
    }
    if (definitions.length === 1) {
      const def = definitions[0];
      const originURI = def.definition.presentation?.origin?.uri;
      const { result: result2 } = await this._dialogService.prompt(
        {
          message: localize("trustTitleWithOrigin", "Trust and run MCP server {0}?", def.definition.label),
          custom: {
            icon: Codicon.shield,
            markdownDetails: [{
              markdown: new MarkdownString(localize("mcp.trust.details", "The MCP server {0} was updated. MCP servers may add context to your chat session and lead to unexpected behavior. Do you want to trust and run this server?", labelFor(def))),
              actionHandler: () => {
                const editor = this._editorService.openEditor({ resource: originURI }, AUX_WINDOW_GROUP);
                return editor.then(Boolean);
              }
            }]
          },
          buttons: [
            { label: localize("mcp.trust.yes", "Trust"), run: () => true },
            { label: localize("mcp.trust.no", "Do not trust"), run: () => false }
          ]
        }
      );
      return result2 === void 0 ? void 0 : result2 ? [def.definition.id] : [];
    }
    const list = definitions.map((d) => `- ${labelFor(d)}`).join("\n");
    const { result } = await this._dialogService.prompt(
      {
        message: localize("trustTitleWithOriginMulti", "Trust and run {0} MCP servers?", definitions.length),
        custom: {
          icon: Codicon.shield,
          markdownDetails: [{
            markdown: new MarkdownString(localize("mcp.trust.detailsMulti", "Several updated MCP servers were discovered:\n\n{0}\n\n MCP servers may add context to your chat session and lead to unexpected behavior. Do you want to trust and run these server?", list)),
            actionHandler: (uri) => {
              const editor = this._editorService.openEditor({ resource: URI.parse(uri) }, AUX_WINDOW_GROUP);
              return editor.then(Boolean);
            }
          }]
        },
        buttons: [
          { label: localize("mcp.trust.yes", "Trust"), run: () => "all" },
          { label: localize("mcp.trust.pick", "Pick Trusted"), run: () => "pick" },
          { label: localize("mcp.trust.no", "Do not trust"), run: () => "none" }
        ]
      }
    );
    if (result === void 0) {
      return void 0;
    } else if (result === "all") {
      return definitions.map((d) => d.definition.id);
    } else if (result === "none") {
      return [];
    }
    function isActionableButton(obj) {
      return typeof obj.action === "function";
    }
    const store = new DisposableStore();
    const picker = store.add(this._quickInputService.createQuickPick({ useSeparators: false }));
    picker.canSelectMany = true;
    picker.items = definitions.map(({ definition, collection }) => {
      const buttons = [];
      if (definition.presentation?.origin) {
        const origin = definition.presentation.origin;
        buttons.push({
          iconClass: "codicon-go-to-file",
          tooltip: "Go to Definition",
          action: () => this._editorService.openEditor({ resource: origin.uri, options: { selection: origin.range } })
        });
      }
      return {
        type: "item",
        label: definition.label,
        definitonId: definition.id,
        description: collection.source instanceof ExtensionIdentifier ? collection.source.value : definition.presentation?.origin ? this._labelService.getUriLabel(definition.presentation.origin.uri) : void 0,
        picked: false,
        buttons
      };
    });
    picker.placeholder = "Select MCP servers to trust";
    picker.ignoreFocusOut = true;
    store.add(picker.onDidTriggerItemButton((e) => {
      if (isActionableButton(e.button)) {
        e.button.action();
      }
    }));
    return new Promise((resolve) => {
      store.add(picker.onDidAccept(() => {
        resolve(picker.selectedItems.map((item) => item.definitonId));
        picker.hide();
      }));
      store.add(picker.onDidHide(() => {
        resolve(void 0);
      }));
      picker.show();
    }).finally(() => store.dispose());
  }
  async _updateStorageWithExpressionInputs(inputStorage, expr) {
    const secrets = {};
    const inputs = {};
    for (const [replacement, resolved] of expr.resolved()) {
      if (resolved.input?.type === "promptString" && resolved.input.password) {
        secrets[replacement.id] = resolved;
      } else {
        inputs[replacement.id] = resolved;
      }
    }
    inputStorage.setPlainText(inputs);
    await inputStorage.setSecrets(secrets);
    this._onDidChangeInputs.fire();
  }
  async _replaceVariablesInLaunch(delegate, definition, launch, errorOnUserInteraction) {
    if (!definition.variableReplacement) {
      return launch;
    }
    const { section, target, folder } = definition.variableReplacement;
    const inputStorage = this._getInputStorageInConfigTarget(target);
    const [previouslyStored, withRemoteFilled] = await Promise.all([
      inputStorage.getMap(),
      delegate.substituteVariables(definition, launch)
    ]);
    const expr = ConfigurationResolverExpression.parse(McpServerLaunch.toSerialized(withRemoteFilled));
    for (const replacement of expr.unresolved()) {
      if (previouslyStored.hasOwnProperty(replacement.id)) {
        expr.resolve(replacement, previouslyStored[replacement.id]);
      }
    }
    if (errorOnUserInteraction) {
      const unresolved = Array.from(expr.unresolved());
      if (unresolved.length > 0) {
        throw new UserInteractionRequiredError("variables");
      }
    }
    await this._configurationResolverService.resolveWithInteraction(folder, expr, section, void 0, target);
    await this._updateStorageWithExpressionInputs(inputStorage, expr);
    const resolved = await this._configurationResolverService.resolveAsync(folder, expr);
    return McpServerLaunch.fromSerialized(resolved);
  }
  isCollectionAllowed(collection, strictPluginOnly) {
    return !isStrictPluginOnlyCustomizationEnabled(strictPluginOnly) || collection.provenance === McpCollectionProvenance.Plugin;
  }
  async resolveConnection(opts) {
    const { collectionRef, definitionRef, interaction, logger, debug } = opts;
    let collection = this._collections.get().find((c) => c.id === collectionRef.id);
    if (collection && !this.isCollectionAllowed(collection, this._strictPluginOnlyCustomization.get())) {
      throw new Error(`MCP collection ${collectionRef.id} is blocked by enterprise customization policy`);
    }
    if (collection?.lazy) {
      await collection.lazy.load();
      collection = this._collections.get().find((c) => c.id === collectionRef.id);
    }
    if (collection && !this.isCollectionAllowed(collection, this._strictPluginOnlyCustomization.get())) {
      throw new Error(`MCP collection ${collectionRef.id} is blocked by enterprise customization policy`);
    }
    const definition = collection?.serverDefinitions.get().find((s) => s.id === definitionRef.id);
    if (!collection || !definition) {
      throw new Error(`Collection or definition not found for ${collectionRef.id} and ${definitionRef.id}`);
    }
    const delegate = this._delegates.get().find((d) => d.canStart(collection, definition));
    if (!delegate) {
      throw new Error("No delegate found that can handle the connection");
    }
    const trusted = await this._checkTrust(collection, definition, opts);
    interaction?.participants.set(definition.id, { s: "resolved" });
    if (!trusted) {
      return void 0;
    }
    let launch = definition.launch;
    if (collection.resolveServerLanch) {
      launch = await collection.resolveServerLanch(definition);
      if (!launch) {
        return void 0;
      }
    }
    try {
      launch = await this._replaceVariablesInLaunch(delegate, definition, launch, opts.errorOnUserInteraction);
      if (definition.devMode && debug) {
        launch = await this._instantiationService.invokeFunction((accessor) => accessor.get(IMcpDevModeDebugging).transform(definition, launch));
      }
      launch = await this._mcpSandboxService.launchInSandboxIfEnabled(definition, launch, collection.remoteAuthority ?? void 0, collection.configTarget);
    } catch (e) {
      if (e instanceof UserInteractionRequiredError) {
        throw e;
      }
      this._notificationService.notify({
        severity: Severity.Error,
        message: localize("mcp.launchError", "Error starting {0}: {1}", definition.label, String(e)),
        actions: {
          primary: collection.presentation?.origin && [
            {
              id: "mcp.launchError.openConfig",
              class: void 0,
              enabled: true,
              tooltip: "",
              label: localize("mcp.launchError.openConfig", "Open Configuration"),
              run: () => this._editorService.openEditor({
                resource: collection.presentation.origin,
                options: { selection: definition.presentation?.origin?.range }
              })
            }
          ]
        }
      });
      return;
    }
    return this._instantiationService.createInstance(
      McpServerConnection,
      collection,
      definition,
      delegate,
      launch,
      logger,
      opts.errorOnUserInteraction,
      opts.taskManager
    );
  }
};
McpRegistry = __decorateClass([
  __decorateParam(0, IInstantiationService),
  __decorateParam(1, IConfigurationResolverService),
  __decorateParam(2, IDialogService),
  __decorateParam(3, INotificationService),
  __decorateParam(4, IEditorService),
  __decorateParam(5, IConfigurationService),
  __decorateParam(6, IQuickInputService),
  __decorateParam(7, ILabelService),
  __decorateParam(8, ILogService),
  __decorateParam(9, IMcpSandboxService),
  __decorateParam(10, IWorkspaceTrustManagementService),
  __decorateParam(11, IWorkspaceTrustRequestService)
], McpRegistry);
export {
  McpRegistry
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG1jcFxcY29tbW9uXFxtY3BSZWdpc3RyeS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGFzc2VydE5ldmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXNzZXJ0LmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBJdGVyYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2l0ZXJhdG9yLmpzJztcbmltcG9ydCB7IExhenkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9sYXp5LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgZGVyaXZlZCwgSU9ic2VydmFibGUsIG9ic2VydmFibGVWYWx1ZSwgYXV0b3J1blNlbGZEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBpc0RlZmluZWQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQ29uZmlndXJhdGlvblRhcmdldCwgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJRGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uSWRlbnRpZmllciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTGFiZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGFiZWwvY29tbW9uL2xhYmVsLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgbWNwQWNjZXNzQ29uZmlnLCBNY3BBY2Nlc3NWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL21jcC9jb21tb24vbWNwTWFuYWdlbWVudC5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSwgU2V2ZXJpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBvYnNlcnZhYmxlQ29uZmlnVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9vYnNlcnZhYmxlL2NvbW1vbi9wbGF0Zm9ybU9ic2VydmFibGVVdGlscy5qcyc7XG5pbXBvcnQgeyBJUXVpY2tJbnB1dEJ1dHRvbiwgSVF1aWNrSW5wdXRTZXJ2aWNlLCBJUXVpY2tQaWNrSXRlbSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3F1aWNraW5wdXQvY29tbW9uL3F1aWNrSW5wdXQuanMnO1xuaW1wb3J0IHsgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlRm9sZGVyRGF0YSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlLCBJV29ya3NwYWNlVHJ1c3RSZXF1ZXN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlVHJ1c3QuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9jb25maWd1cmF0aW9uUmVzb2x2ZXIvY29tbW9uL2NvbmZpZ3VyYXRpb25SZXNvbHZlci5qcyc7XG5pbXBvcnQgeyBDb25maWd1cmF0aW9uUmVzb2x2ZXJFeHByZXNzaW9uLCBJUmVzb2x2ZWRWYWx1ZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2NvbmZpZ3VyYXRpb25SZXNvbHZlci9jb21tb24vY29uZmlndXJhdGlvblJlc29sdmVyRXhwcmVzc2lvbi5qcyc7XG5pbXBvcnQgeyBBVVhfV0lORE9XX0dST1VQLCBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTWNwRGV2TW9kZURlYnVnZ2luZyB9IGZyb20gJy4vbWNwRGV2TW9kZS5qcyc7XG5pbXBvcnQgeyBNY3BSZWdpc3RyeUlucHV0U3RvcmFnZSB9IGZyb20gJy4vbWNwUmVnaXN0cnlJbnB1dFN0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSU1jcEhvc3REZWxlZ2F0ZSwgSU1jcFJlZ2lzdHJ5LCBJTWNwUmVzb2x2ZUNvbm5lY3Rpb25PcHRpb25zIH0gZnJvbSAnLi9tY3BSZWdpc3RyeVR5cGVzLmpzJztcbmltcG9ydCB7IElNY3BTYW5kYm94U2VydmljZSB9IGZyb20gJy4vbWNwU2FuZGJveFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgTWNwU2VydmVyQ29ubmVjdGlvbiB9IGZyb20gJy4vbWNwU2VydmVyQ29ubmVjdGlvbi5qcyc7XG5pbXBvcnQgeyBJTWNwU2VydmVyQ29ubmVjdGlvbiwgTGF6eUNvbGxlY3Rpb25TdGF0ZSwgTWNwQ29sbGVjdGlvbkRlZmluaXRpb24sIE1jcENvbGxlY3Rpb25Qcm92ZW5hbmNlLCBNY3BEZWZpbml0aW9uUmVmZXJlbmNlLCBNY3BTZXJ2ZXJEZWZpbml0aW9uLCBNY3BTZXJ2ZXJMYXVuY2gsIE1jcFNlcnZlclRydXN0LCBNY3BTdGFydFNlcnZlckludGVyYWN0aW9uLCBVc2VySW50ZXJhY3Rpb25SZXF1aXJlZEVycm9yIH0gZnJvbSAnLi9tY3BUeXBlcy5qcyc7XG5pbXBvcnQgeyBDT1BJTE9UX1NUUklDVF9QTFVHSU5fT05MWV9DVVNUT01JWkFUSU9OX0NPTkZJRyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3BvbGljeS9jb21tb24vY29waWxvdE1hbmFnZWRTZXR0aW5ncy5qcyc7XG5pbXBvcnQgeyBpc1N0cmljdFBsdWdpbk9ubHlDdXN0b21pemF0aW9uRW5hYmxlZCwgU3RyaWN0UGx1Z2luT25seUN1c3RvbWl6YXRpb24gfSBmcm9tICcuLi8uLi9jaGF0L2NvbW1vbi9jdXN0b21pemF0aW9uTG9ja2Rvd24uanMnO1xuXG5jb25zdCBub3RUcnVzdGVkTm9uY2UgPSAnX192c2NvZGVfbm90X3RydXN0ZWQnO1xuXG5leHBvcnQgY2xhc3MgTWNwUmVnaXN0cnkgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSU1jcFJlZ2lzdHJ5IHtcblx0ZGVjbGFyZSBwdWJsaWMgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2NvbGxlY3Rpb25zID0gb2JzZXJ2YWJsZVZhbHVlPHJlYWRvbmx5IE1jcENvbGxlY3Rpb25EZWZpbml0aW9uW10+KCdjb2xsZWN0aW9ucycsIFtdKTtcblx0cHJpdmF0ZSByZWFkb25seSBfZGVsZWdhdGVzID0gb2JzZXJ2YWJsZVZhbHVlPHJlYWRvbmx5IElNY3BIb3N0RGVsZWdhdGVbXT4oJ2RlbGVnYXRlcycsIFtdKTtcblx0cHJpdmF0ZSByZWFkb25seSBfbWNwQWNjZXNzVmFsdWU6IElPYnNlcnZhYmxlPHN0cmluZz47XG5cdHByaXZhdGUgcmVhZG9ubHkgX3N0cmljdFBsdWdpbk9ubHlDdXN0b21pemF0aW9uOiBJT2JzZXJ2YWJsZTxTdHJpY3RQbHVnaW5Pbmx5Q3VzdG9taXphdGlvbj47XG5cdHB1YmxpYyByZWFkb25seSBjb2xsZWN0aW9uczogSU9ic2VydmFibGU8cmVhZG9ubHkgTWNwQ29sbGVjdGlvbkRlZmluaXRpb25bXT4gPSBkZXJpdmVkKHJlYWRlciA9PiB7XG5cdFx0aWYgKHRoaXMuX21jcEFjY2Vzc1ZhbHVlLnJlYWQocmVhZGVyKSA9PT0gTWNwQWNjZXNzVmFsdWUuTm9uZSkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0XHRjb25zdCBzdHJpY3RQbHVnaW5Pbmx5ID0gdGhpcy5fc3RyaWN0UGx1Z2luT25seUN1c3RvbWl6YXRpb24ucmVhZChyZWFkZXIpO1xuXHRcdHJldHVybiB0aGlzLl9jb2xsZWN0aW9ucy5yZWFkKHJlYWRlcikuZmlsdGVyKGNvbGxlY3Rpb24gPT4gdGhpcy5pc0NvbGxlY3Rpb25BbGxvd2VkKGNvbGxlY3Rpb24sIHN0cmljdFBsdWdpbk9ubHkpKTtcblx0fSk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfd29ya3NwYWNlU3RvcmFnZSA9IG5ldyBMYXp5KCgpID0+IHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1jcFJlZ2lzdHJ5SW5wdXRTdG9yYWdlLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCBTdG9yYWdlVGFyZ2V0LlVTRVIpKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Byb2ZpbGVTdG9yYWdlID0gbmV3IExhenkoKCkgPT4gdGhpcy5fcmVnaXN0ZXIodGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTWNwUmVnaXN0cnlJbnB1dFN0b3JhZ2UsIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBTdG9yYWdlVGFyZ2V0LlVTRVIpKSk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25nb2luZ0xhenlBY3RpdmF0aW9ucyA9IG9ic2VydmFibGVWYWx1ZSh0aGlzLCAwKTtcblxuXHRwdWJsaWMgcmVhZG9ubHkgbGF6eUNvbGxlY3Rpb25TdGF0ZSA9IGRlcml2ZWQocmVhZGVyID0+IHtcblx0XHRpZiAodGhpcy5fbWNwQWNjZXNzVmFsdWUucmVhZChyZWFkZXIpID09PSBNY3BBY2Nlc3NWYWx1ZS5Ob25lKSB7XG5cdFx0XHRyZXR1cm4geyBzdGF0ZTogTGF6eUNvbGxlY3Rpb25TdGF0ZS5BbGxLbm93biwgY29sbGVjdGlvbnM6IFtdIH07XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX29uZ29pbmdMYXp5QWN0aXZhdGlvbnMucmVhZChyZWFkZXIpID4gMCkge1xuXHRcdFx0cmV0dXJuIHsgc3RhdGU6IExhenlDb2xsZWN0aW9uU3RhdGUuTG9hZGluZ1Vua25vd24sIGNvbGxlY3Rpb25zOiBbXSB9O1xuXHRcdH1cblx0XHRjb25zdCBzdHJpY3RQbHVnaW5Pbmx5ID0gdGhpcy5fc3RyaWN0UGx1Z2luT25seUN1c3RvbWl6YXRpb24ucmVhZChyZWFkZXIpO1xuXHRcdGNvbnN0IGNvbGxlY3Rpb25zID0gdGhpcy5fY29sbGVjdGlvbnMucmVhZChyZWFkZXIpLmZpbHRlcihjb2xsZWN0aW9uID0+IHRoaXMuaXNDb2xsZWN0aW9uQWxsb3dlZChjb2xsZWN0aW9uLCBzdHJpY3RQbHVnaW5Pbmx5KSk7XG5cdFx0Y29uc3QgaGFzVW5rbm93biA9IGNvbGxlY3Rpb25zLnNvbWUoYyA9PiBjLmxhenkgJiYgYy5sYXp5LmlzQ2FjaGVkID09PSBmYWxzZSk7XG5cdFx0cmV0dXJuIGhhc1Vua25vd24gPyB7IHN0YXRlOiBMYXp5Q29sbGVjdGlvblN0YXRlLkhhc1Vua25vd24sIGNvbGxlY3Rpb25zOiBjb2xsZWN0aW9ucy5maWx0ZXIoYyA9PiBjLmxhenkgJiYgYy5sYXp5LmlzQ2FjaGVkID09PSBmYWxzZSkgfSA6IHsgc3RhdGU6IExhenlDb2xsZWN0aW9uU3RhdGUuQWxsS25vd24sIGNvbGxlY3Rpb25zOiBbXSB9O1xuXHR9KTtcblxuXHRwdWJsaWMgZ2V0IGRlbGVnYXRlcygpOiBJT2JzZXJ2YWJsZTxyZWFkb25seSBJTWNwSG9zdERlbGVnYXRlW10+IHtcblx0XHRyZXR1cm4gdGhpcy5fZGVsZWdhdGVzO1xuXHR9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VJbnB1dHMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cHVibGljIHJlYWRvbmx5IG9uRGlkQ2hhbmdlSW5wdXRzID0gdGhpcy5fb25EaWRDaGFuZ2VJbnB1dHMuZXZlbnQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9pbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblJlc29sdmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uUmVzb2x2ZXJTZXJ2aWNlOiBJQ29uZmlndXJhdGlvblJlc29sdmVyU2VydmljZSxcblx0XHRASURpYWxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZGlhbG9nU2VydmljZTogSURpYWxvZ1NlcnZpY2UsXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX25vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdEBJRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElRdWlja0lucHV0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9xdWlja0lucHV0U2VydmljZTogSVF1aWNrSW5wdXRTZXJ2aWNlLFxuXHRcdEBJTGFiZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xhYmVsU2VydmljZTogSUxhYmVsU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElNY3BTYW5kYm94U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9tY3BTYW5kYm94U2VydmljZTogSU1jcFNhbmRib3hTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF93b3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlOiBJV29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZSxcblx0XHRASVdvcmtzcGFjZVRydXN0UmVxdWVzdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfd29ya3NwYWNlVHJ1c3RSZXF1ZXN0U2VydmljZTogSVdvcmtzcGFjZVRydXN0UmVxdWVzdFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fbWNwQWNjZXNzVmFsdWUgPSBvYnNlcnZhYmxlQ29uZmlnVmFsdWUobWNwQWNjZXNzQ29uZmlnLCBNY3BBY2Nlc3NWYWx1ZS5BbGwsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHR0aGlzLl9zdHJpY3RQbHVnaW5Pbmx5Q3VzdG9taXphdGlvbiA9IG9ic2VydmFibGVDb25maWdWYWx1ZShDT1BJTE9UX1NUUklDVF9QTFVHSU5fT05MWV9DVVNUT01JWkFUSU9OX0NPTkZJRywgdW5kZWZpbmVkLCBjb25maWd1cmF0aW9uU2VydmljZSk7XG5cdH1cblxuXHRwdWJsaWMgcmVnaXN0ZXJEZWxlZ2F0ZShkZWxlZ2F0ZTogSU1jcEhvc3REZWxlZ2F0ZSk6IElEaXNwb3NhYmxlIHtcblx0XHRjb25zdCBkZWxlZ2F0ZXMgPSB0aGlzLl9kZWxlZ2F0ZXMuZ2V0KCkuc2xpY2UoKTtcblx0XHRkZWxlZ2F0ZXMucHVzaChkZWxlZ2F0ZSk7XG5cdFx0ZGVsZWdhdGVzLnNvcnQoKGEsIGIpID0+IGIucHJpb3JpdHkgLSBhLnByaW9yaXR5KTtcblx0XHR0aGlzLl9kZWxlZ2F0ZXMuc2V0KGRlbGVnYXRlcywgdW5kZWZpbmVkKTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRkaXNwb3NlOiAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGRlbGVnYXRlcyA9IHRoaXMuX2RlbGVnYXRlcy5nZXQoKS5maWx0ZXIoZCA9PiBkICE9PSBkZWxlZ2F0ZSk7XG5cdFx0XHRcdHRoaXMuX2RlbGVnYXRlcy5zZXQoZGVsZWdhdGVzLCB1bmRlZmluZWQpO1xuXHRcdFx0fVxuXHRcdH07XG5cdH1cblxuXHRwdWJsaWMgcmVnaXN0ZXJDb2xsZWN0aW9uKGNvbGxlY3Rpb246IE1jcENvbGxlY3Rpb25EZWZpbml0aW9uKTogSURpc3Bvc2FibGUge1xuXHRcdGNvbnN0IGN1cnJlbnRDb2xsZWN0aW9ucyA9IHRoaXMuX2NvbGxlY3Rpb25zLmdldCgpO1xuXHRcdGNvbnN0IHRvUmVwbGFjZSA9IGN1cnJlbnRDb2xsZWN0aW9ucy5maW5kKGMgPT4gYy5pZCA9PT0gY29sbGVjdGlvbi5pZCk7XG5cblx0XHQvLyBJbmNvbWluZyBjb2xsZWN0aW9ucyByZXBsYWNlIHRoZSBcImxhenlcIiB2ZXJzaW9ucy4gU2VlIGBFeHRlbnNpb25NY3BEaXNjb3ZlcnlgIGZvciBhbiBleGFtcGxlLlxuXHRcdGlmICh0b1JlcGxhY2UgJiYgIXRvUmVwbGFjZS5sYXp5KSB7XG5cdFx0XHRyZXR1cm4gRGlzcG9zYWJsZS5Ob25lO1xuXHRcdH0gZWxzZSBpZiAodG9SZXBsYWNlKSB7XG5cdFx0XHR0aGlzLl9jb2xsZWN0aW9ucy5zZXQoY3VycmVudENvbGxlY3Rpb25zLm1hcChjID0+IGMgPT09IHRvUmVwbGFjZSA/IGNvbGxlY3Rpb24gOiBjKSwgdW5kZWZpbmVkKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fY29sbGVjdGlvbnMuc2V0KFsuLi5jdXJyZW50Q29sbGVjdGlvbnMsIGNvbGxlY3Rpb25dXG5cdFx0XHRcdC5zb3J0KChhLCBiKSA9PiBhLm9yZGVyIC0gYi5vcmRlciksIHVuZGVmaW5lZCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGRpc3Bvc2U6ICgpID0+IHtcblx0XHRcdFx0Y29uc3QgY3VycmVudENvbGxlY3Rpb25zID0gdGhpcy5fY29sbGVjdGlvbnMuZ2V0KCk7XG5cdFx0XHRcdHRoaXMuX2NvbGxlY3Rpb25zLnNldChjdXJyZW50Q29sbGVjdGlvbnMuZmlsdGVyKGMgPT4gYyAhPT0gY29sbGVjdGlvbiksIHVuZGVmaW5lZCk7XG5cdFx0XHR9XG5cdFx0fTtcblx0fVxuXG5cdHB1YmxpYyBnZXRTZXJ2ZXJEZWZpbml0aW9uKGNvbGxlY3Rpb25SZWY6IE1jcERlZmluaXRpb25SZWZlcmVuY2UsIGRlZmluaXRpb25SZWY6IE1jcERlZmluaXRpb25SZWZlcmVuY2UpOiBJT2JzZXJ2YWJsZTx7IHNlcnZlcjogTWNwU2VydmVyRGVmaW5pdGlvbiB8IHVuZGVmaW5lZDsgY29sbGVjdGlvbjogTWNwQ29sbGVjdGlvbkRlZmluaXRpb24gfCB1bmRlZmluZWQgfT4ge1xuXHRcdGNvbnN0IGNvbGxlY3Rpb25PYnMgPSB0aGlzLl9jb2xsZWN0aW9ucy5tYXAoY29scyA9PiBjb2xzLmZpbmQoYyA9PiBjLmlkID09PSBjb2xsZWN0aW9uUmVmLmlkKSk7XG5cdFx0cmV0dXJuIGNvbGxlY3Rpb25PYnMubWFwKChjb2xsZWN0aW9uLCByZWFkZXIpID0+IHtcblx0XHRcdGlmIChjb2xsZWN0aW9uICYmICF0aGlzLmlzQ29sbGVjdGlvbkFsbG93ZWQoY29sbGVjdGlvbiwgdGhpcy5fc3RyaWN0UGx1Z2luT25seUN1c3RvbWl6YXRpb24ucmVhZChyZWFkZXIpKSkge1xuXHRcdFx0XHRyZXR1cm4geyBjb2xsZWN0aW9uOiB1bmRlZmluZWQsIHNlcnZlcjogdW5kZWZpbmVkIH07XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBzZXJ2ZXIgPSBjb2xsZWN0aW9uPy5zZXJ2ZXJEZWZpbml0aW9ucy5yZWFkKHJlYWRlcikuZmluZChzID0+IHMuaWQgPT09IGRlZmluaXRpb25SZWYuaWQpO1xuXHRcdFx0cmV0dXJuIHsgY29sbGVjdGlvbiwgc2VydmVyIH07XG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgZGlzY292ZXJDb2xsZWN0aW9ucygpOiBQcm9taXNlPE1jcENvbGxlY3Rpb25EZWZpbml0aW9uW10+IHtcblx0XHRjb25zdCBzdHJpY3RQbHVnaW5Pbmx5ID0gdGhpcy5fc3RyaWN0UGx1Z2luT25seUN1c3RvbWl6YXRpb24uZ2V0KCk7XG5cdFx0Y29uc3QgdG9EaXNjb3ZlciA9IHRoaXMuX2NvbGxlY3Rpb25zLmdldCgpLmZpbHRlcihjID0+IHRoaXMuaXNDb2xsZWN0aW9uQWxsb3dlZChjLCBzdHJpY3RQbHVnaW5Pbmx5KSAmJiBjLmxhenkgJiYgIWMubGF6eS5pc0NhY2hlZCk7XG5cblx0XHR0aGlzLl9vbmdvaW5nTGF6eUFjdGl2YXRpb25zLnNldCh0aGlzLl9vbmdvaW5nTGF6eUFjdGl2YXRpb25zLmdldCgpICsgMSwgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCBQcm9taXNlLmFsbCh0b0Rpc2NvdmVyLm1hcChjID0+IGMubGF6eT8ubG9hZCgpKSkuZmluYWxseSgoKSA9PiB7XG5cdFx0XHR0aGlzLl9vbmdvaW5nTGF6eUFjdGl2YXRpb25zLnNldCh0aGlzLl9vbmdvaW5nTGF6eUFjdGl2YXRpb25zLmdldCgpIC0gMSwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdGNvbnN0IGZvdW5kOiBNY3BDb2xsZWN0aW9uRGVmaW5pdGlvbltdID0gW107XG5cdFx0Y29uc3QgY3VycmVudCA9IHRoaXMuX2NvbGxlY3Rpb25zLmdldCgpO1xuXHRcdGZvciAoY29uc3QgY29sbGVjdGlvbiBvZiB0b0Rpc2NvdmVyKSB7XG5cdFx0XHRjb25zdCByZWMgPSBjdXJyZW50LmZpbmQoYyA9PiBjLmlkID09PSBjb2xsZWN0aW9uLmlkKTtcblx0XHRcdGlmICghcmVjKSB7XG5cdFx0XHRcdC8vIGlnbm9yZWRcblx0XHRcdH0gZWxzZSBpZiAocmVjLmxhenkpIHtcblx0XHRcdFx0cmVjLmxhenkucmVtb3ZlZD8uKCk7IC8vIGRpZCBub3QgZ2V0IHJlcGxhY2VkIGJ5IHRoZSBub24tbGF6eSB2ZXJzaW9uXG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRmb3VuZC5wdXNoKHJlYyk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cblx0XHRyZXR1cm4gZm91bmQ7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRJbnB1dFN0b3JhZ2Uoc2NvcGU6IFN0b3JhZ2VTY29wZSk6IE1jcFJlZ2lzdHJ5SW5wdXRTdG9yYWdlIHtcblx0XHRyZXR1cm4gc2NvcGUgPT09IFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UgPyB0aGlzLl93b3Jrc3BhY2VTdG9yYWdlLnZhbHVlIDogdGhpcy5fcHJvZmlsZVN0b3JhZ2UudmFsdWU7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRJbnB1dFN0b3JhZ2VJbkNvbmZpZ1RhcmdldChjb25maWdUYXJnZXQ6IENvbmZpZ3VyYXRpb25UYXJnZXQpOiBNY3BSZWdpc3RyeUlucHV0U3RvcmFnZSB7XG5cdFx0cmV0dXJuIHRoaXMuX2dldElucHV0U3RvcmFnZShcblx0XHRcdGNvbmZpZ1RhcmdldCA9PT0gQ29uZmlndXJhdGlvblRhcmdldC5XT1JLU1BBQ0UgfHwgY29uZmlnVGFyZ2V0ID09PSBDb25maWd1cmF0aW9uVGFyZ2V0LldPUktTUEFDRV9GT0xERVJcblx0XHRcdFx0PyBTdG9yYWdlU2NvcGUuV09SS1NQQUNFXG5cdFx0XHRcdDogU3RvcmFnZVNjb3BlLlBST0ZJTEVcblx0XHQpO1xuXHR9XG5cblx0cHVibGljIGFzeW5jIGNsZWFyU2F2ZWRJbnB1dHMoc2NvcGU6IFN0b3JhZ2VTY29wZSwgaW5wdXRJZD86IHN0cmluZykge1xuXHRcdGNvbnN0IHN0b3JhZ2UgPSB0aGlzLl9nZXRJbnB1dFN0b3JhZ2Uoc2NvcGUpO1xuXHRcdGlmIChpbnB1dElkKSB7XG5cdFx0XHRhd2FpdCBzdG9yYWdlLmNsZWFyKGlucHV0SWQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRzdG9yYWdlLmNsZWFyQWxsKCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VJbnB1dHMuZmlyZSgpO1xuXHR9XG5cblx0cHVibGljIGFzeW5jIGVkaXRTYXZlZElucHV0KGlucHV0SWQ6IHN0cmluZywgZm9sZGVyRGF0YTogSVdvcmtzcGFjZUZvbGRlckRhdGEgfCB1bmRlZmluZWQsIGNvbmZpZ1NlY3Rpb246IHN0cmluZywgdGFyZ2V0OiBDb25maWd1cmF0aW9uVGFyZ2V0KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgc3RvcmFnZSA9IHRoaXMuX2dldElucHV0U3RvcmFnZUluQ29uZmlnVGFyZ2V0KHRhcmdldCk7XG5cdFx0Y29uc3QgZXhwciA9IENvbmZpZ3VyYXRpb25SZXNvbHZlckV4cHJlc3Npb24ucGFyc2UoaW5wdXRJZCk7XG5cblx0XHRjb25zdCBzdG9yZWQgPSBhd2FpdCBzdG9yYWdlLmdldE1hcCgpO1xuXHRcdGNvbnN0IHByZXZpb3VzID0gc3RvcmVkW2lucHV0SWRdLnZhbHVlO1xuXHRcdGF3YWl0IHRoaXMuX2NvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2UucmVzb2x2ZVdpdGhJbnRlcmFjdGlvbihmb2xkZXJEYXRhLCBleHByLCBjb25maWdTZWN0aW9uLCBwcmV2aW91cyA/IHsgW2lucHV0SWQuc2xpY2UoMiwgLTEpXTogcHJldmlvdXMgfSA6IHt9LCB0YXJnZXQpO1xuXHRcdGF3YWl0IHRoaXMuX3VwZGF0ZVN0b3JhZ2VXaXRoRXhwcmVzc2lvbklucHV0cyhzdG9yYWdlLCBleHByKTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyBzZXRTYXZlZElucHV0KGlucHV0SWQ6IHN0cmluZywgdGFyZ2V0OiBDb25maWd1cmF0aW9uVGFyZ2V0LCB2YWx1ZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgc3RvcmFnZSA9IHRoaXMuX2dldElucHV0U3RvcmFnZUluQ29uZmlnVGFyZ2V0KHRhcmdldCk7XG5cdFx0Y29uc3QgZXhwciA9IENvbmZpZ3VyYXRpb25SZXNvbHZlckV4cHJlc3Npb24ucGFyc2UoaW5wdXRJZCk7XG5cdFx0Zm9yIChjb25zdCB1bnJlc29sdmVkIG9mIGV4cHIudW5yZXNvbHZlZCgpKSB7XG5cdFx0XHRleHByLnJlc29sdmUodW5yZXNvbHZlZCwgdmFsdWUpO1xuXHRcdFx0YnJlYWs7XG5cdFx0fVxuXHRcdGF3YWl0IHRoaXMuX3VwZGF0ZVN0b3JhZ2VXaXRoRXhwcmVzc2lvbklucHV0cyhzdG9yYWdlLCBleHByKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRTYXZlZElucHV0cyhzY29wZTogU3RvcmFnZVNjb3BlKTogUHJvbWlzZTx7IFtpZDogc3RyaW5nXTogSVJlc29sdmVkVmFsdWUgfT4ge1xuXHRcdHJldHVybiB0aGlzLl9nZXRJbnB1dFN0b3JhZ2Uoc2NvcGUpLmdldE1hcCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfY2hlY2tUcnVzdChjb2xsZWN0aW9uOiBNY3BDb2xsZWN0aW9uRGVmaW5pdGlvbiwgZGVmaW5pdGlvbjogTWNwU2VydmVyRGVmaW5pdGlvbiwge1xuXHRcdHRydXN0Tm9uY2VCZWFyZXIsXG5cdFx0aW50ZXJhY3Rpb24sXG5cdFx0cHJvbXB0VHlwZSA9ICdvbmx5LW5ldycsXG5cdFx0YXV0b1RydXN0Q2hhbmdlcyA9IGZhbHNlLFxuXHRcdGVycm9yT25Vc2VySW50ZXJhY3Rpb24gPSBmYWxzZSxcblx0fTogSU1jcFJlc29sdmVDb25uZWN0aW9uT3B0aW9ucykge1xuXHRcdGlmIChjb2xsZWN0aW9uLnNjb3BlID09PSBTdG9yYWdlU2NvcGUuV09SS1NQQUNFICYmICF0aGlzLl93b3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlLmlzV29ya3NwYWNlVHJ1c3RlZCgpKSB7XG5cdFx0XHRpZiAoZXJyb3JPblVzZXJJbnRlcmFjdGlvbikge1xuXHRcdFx0XHR0aHJvdyBuZXcgVXNlckludGVyYWN0aW9uUmVxdWlyZWRFcnJvcignd29ya3NwYWNlVHJ1c3QnKTtcblx0XHRcdH0gZWxzZSBpZiAoIWF3YWl0IHRoaXMuX3dvcmtzcGFjZVRydXN0UmVxdWVzdFNlcnZpY2UucmVxdWVzdFdvcmtzcGFjZVRydXN0KHsgbWVzc2FnZTogbG9jYWxpemUoJ3J1blRydXN0JywgXCJUaGlzIE1DUCBzZXJ2ZXIgZGVmaW5pdGlvbiBpcyBkZWZpbmVkIGluIHlvdXIgd29ya3NwYWNlIGZpbGVzLlwiKSB9KSkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKGNvbGxlY3Rpb24udHJ1c3RCZWhhdmlvciA9PT0gTWNwU2VydmVyVHJ1c3QuS2luZC5UcnVzdGVkKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBNQ1Agc2VydmVyICR7ZGVmaW5pdGlvbi5pZH0gaXMgdHJ1c3RlZCwgbm8gdHJ1c3QgcHJvbXB0IG5lZWRlZGApO1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fSBlbHNlIGlmIChjb2xsZWN0aW9uLnRydXN0QmVoYXZpb3IgPT09IE1jcFNlcnZlclRydXN0LktpbmQuVHJ1c3RlZE9uTm9uY2UpIHtcblx0XHRcdGlmIChkZWZpbml0aW9uLmNhY2hlTm9uY2UgPT09IHRydXN0Tm9uY2VCZWFyZXIudHJ1c3RlZEF0Tm9uY2UpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgTUNQIHNlcnZlciAke2RlZmluaXRpb24uaWR9IGlzIHVuY2hhbmdlZCwgbm8gdHJ1c3QgcHJvbXB0IG5lZWRlZGApO1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGF1dG9UcnVzdENoYW5nZXMpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgTUNQIHNlcnZlciAke2RlZmluaXRpb24uaWR9IGlzIHdhcyBjaGFuZ2VkIGJ1dCB1c2VyIGV4cGxpY2l0bHkgZXhlY3V0ZWRgKTtcblx0XHRcdFx0dHJ1c3ROb25jZUJlYXJlci50cnVzdGVkQXROb25jZSA9IGRlZmluaXRpb24uY2FjaGVOb25jZTtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cblx0XHRcdGlmICh0cnVzdE5vbmNlQmVhcmVyLnRydXN0ZWRBdE5vbmNlID09PSBub3RUcnVzdGVkTm9uY2UpIHtcblx0XHRcdFx0aWYgKHByb21wdFR5cGUgPT09ICdhbGwtdW50cnVzdGVkJykge1xuXHRcdFx0XHRcdGlmIChlcnJvck9uVXNlckludGVyYWN0aW9uKSB7XG5cdFx0XHRcdFx0XHR0aHJvdyBuZXcgVXNlckludGVyYWN0aW9uUmVxdWlyZWRFcnJvcignc2VydmVyVHJ1c3QnKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMuX3Byb21wdEZvclRydXN0KGRlZmluaXRpb24sIGNvbGxlY3Rpb24sIGludGVyYWN0aW9uLCB0cnVzdE5vbmNlQmVhcmVyKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBNQ1Agc2VydmVyICR7ZGVmaW5pdGlvbi5pZH0gaXMgdW50cnVzdGVkLCBkZW55aW5nIHRydXN0IHByb21wdGApO1xuXHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAocHJvbXB0VHlwZSA9PT0gJ25ldmVyJykge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBNQ1Agc2VydmVyICR7ZGVmaW5pdGlvbi5pZH0gdHJ1c3Qgc3RhdGUgaXMgdW5rbm93biwgc2tpcHBpbmcgcHJvbXB0YCk7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGVycm9yT25Vc2VySW50ZXJhY3Rpb24pIHtcblx0XHRcdFx0dGhyb3cgbmV3IFVzZXJJbnRlcmFjdGlvblJlcXVpcmVkRXJyb3IoJ3NlcnZlclRydXN0Jyk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGRpZFRydXN0ID0gYXdhaXQgdGhpcy5fcHJvbXB0Rm9yVHJ1c3QoZGVmaW5pdGlvbiwgY29sbGVjdGlvbiwgaW50ZXJhY3Rpb24sIHRydXN0Tm9uY2VCZWFyZXIpO1xuXHRcdFx0aWYgKGRpZFRydXN0KSB7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGRpZFRydXN0ID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblxuXHRcdFx0dHJ1c3ROb25jZUJlYXJlci50cnVzdGVkQXROb25jZSA9IG5vdFRydXN0ZWROb25jZTtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0YXNzZXJ0TmV2ZXIoY29sbGVjdGlvbi50cnVzdEJlaGF2aW9yKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9wcm9tcHRGb3JUcnVzdChkZWZpbml0aW9uOiBNY3BTZXJ2ZXJEZWZpbml0aW9uLCBjb2xsZWN0aW9uOiBNY3BDb2xsZWN0aW9uRGVmaW5pdGlvbiwgaW50ZXJhY3Rpb246IE1jcFN0YXJ0U2VydmVySW50ZXJhY3Rpb24gfCB1bmRlZmluZWQsIHRydXN0Tm9uY2VCZWFyZXI6IHsgdHJ1c3RlZEF0Tm9uY2U6IHN0cmluZyB8IHVuZGVmaW5lZCB9KTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0aW50ZXJhY3Rpb24gPz89IG5ldyBNY3BTdGFydFNlcnZlckludGVyYWN0aW9uKCk7XG5cdFx0aW50ZXJhY3Rpb24ucGFydGljaXBhbnRzLnNldChkZWZpbml0aW9uLmlkLCB7IHM6ICd3YWl0aW5nJywgZGVmaW5pdGlvbiwgY29sbGVjdGlvbiB9KTtcblxuXHRcdGNvbnN0IHRydXN0ZWREZWZpbml0aW9uSWRzID0gYXdhaXQgbmV3IFByb21pc2U8c3RyaW5nW10gfCB1bmRlZmluZWQ+KHJlc29sdmUgPT4ge1xuXHRcdFx0YXV0b3J1blNlbGZEaXNwb3NhYmxlKHJlYWRlciA9PiB7XG5cdFx0XHRcdGNvbnN0IG1hcCA9IGludGVyYWN0aW9uLnBhcnRpY2lwYW50cy5vYnNlcnZhYmxlLnJlYWQocmVhZGVyKTtcblx0XHRcdFx0aWYgKEl0ZXJhYmxlLnNvbWUobWFwLnZhbHVlcygpLCBwID0+IHAucyA9PT0gJ3Vua25vd24nKSkge1xuXHRcdFx0XHRcdHJldHVybjsgLy8gd2FpdCB0byBnYXRoZXIgYWxsIGNhbGxzXG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZWFkZXIuZGlzcG9zZSgpO1xuXHRcdFx0XHRpbnRlcmFjdGlvbi5jaG9pY2UgPz89IHRoaXMuX3Byb21wdEZvclRydXN0T3BlbkRpYWxvZyhcblx0XHRcdFx0XHRbLi4ubWFwLnZhbHVlcygpXS5tYXAoKHYpID0+IHYucyA9PT0gJ3dhaXRpbmcnID8gdiA6IHVuZGVmaW5lZCkuZmlsdGVyKGlzRGVmaW5lZCksXG5cdFx0XHRcdCk7XG5cdFx0XHRcdHJlc29sdmUoaW50ZXJhY3Rpb24uY2hvaWNlKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgTUNQIHRydXN0ZWQgc2VydmVyczpgLCB0cnVzdGVkRGVmaW5pdGlvbklkcyk7XG5cblx0XHRpZiAodHJ1c3RlZERlZmluaXRpb25JZHMpIHtcblx0XHRcdHRydXN0Tm9uY2VCZWFyZXIudHJ1c3RlZEF0Tm9uY2UgPSB0cnVzdGVkRGVmaW5pdGlvbklkcy5pbmNsdWRlcyhkZWZpbml0aW9uLmlkKVxuXHRcdFx0XHQ/IGRlZmluaXRpb24uY2FjaGVOb25jZVxuXHRcdFx0XHQ6IG5vdFRydXN0ZWROb25jZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gISF0cnVzdGVkRGVmaW5pdGlvbklkcz8uaW5jbHVkZXMoZGVmaW5pdGlvbi5pZCk7XG5cdH1cblxuXHQvKipcblx0ICogQ29uZmlybXMgd2l0aCB0aGUgdXNlciB3aGljaCBvZiB0aGUgcHJvdmlkZWQgZGVmaW5pdGlvbnMgc2hvdWxkIGJlIHRydXN0ZWQuXG5cdCAqIFJldHVybnMgdW5kZWZpbmVkIGlmIHRoZSB1c2VyIGNhbmNlbGxlZCB0aGUgZmxvdywgb3IgdGhlIGxpc3Qgb2YgdHJ1c3RlZFxuXHQgKiBkZWZpbml0aW9uIElEcyBvdGhlcndpc2UuXG5cdCAqL1xuXHRwcm90ZWN0ZWQgYXN5bmMgX3Byb21wdEZvclRydXN0T3BlbkRpYWxvZyhkZWZpbml0aW9uczogeyBkZWZpbml0aW9uOiBNY3BTZXJ2ZXJEZWZpbml0aW9uOyBjb2xsZWN0aW9uOiBNY3BDb2xsZWN0aW9uRGVmaW5pdGlvbiB9W10pOiBQcm9taXNlPHN0cmluZ1tdIHwgdW5kZWZpbmVkPiB7XG5cdFx0ZnVuY3Rpb24gbGFiZWxGb3IocjogeyBkZWZpbml0aW9uOiBNY3BTZXJ2ZXJEZWZpbml0aW9uOyBjb2xsZWN0aW9uOiBNY3BDb2xsZWN0aW9uRGVmaW5pdGlvbiB9KSB7XG5cdFx0XHRjb25zdCBvcmlnaW5VUkkgPSByLmRlZmluaXRpb24ucHJlc2VudGF0aW9uPy5vcmlnaW4/LnVyaSB8fCByLmNvbGxlY3Rpb24ucHJlc2VudGF0aW9uPy5vcmlnaW47XG5cdFx0XHRsZXQgbGFiZWxXaXRoT3JpZ2luID0gb3JpZ2luVVJJID8gYFtcXGAke3IuZGVmaW5pdGlvbi5sYWJlbH1cXGBdKCR7b3JpZ2luVVJJfSlgIDogJ2AnICsgci5kZWZpbml0aW9uLmxhYmVsICsgJ2AnO1xuXG5cdFx0XHRpZiAoci5jb2xsZWN0aW9uLnNvdXJjZSBpbnN0YW5jZW9mIEV4dGVuc2lvbklkZW50aWZpZXIpIHtcblx0XHRcdFx0bGFiZWxXaXRoT3JpZ2luICs9IGAgKCR7bG9jYWxpemUoJ3RydXN0RnJvbUV4dCcsICdmcm9tIHswfScsIHIuY29sbGVjdGlvbi5zb3VyY2UudmFsdWUpfSlgO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gbGFiZWxXaXRoT3JpZ2luO1xuXHRcdH1cblxuXHRcdGlmIChkZWZpbml0aW9ucy5sZW5ndGggPT09IDEpIHtcblx0XHRcdGNvbnN0IGRlZiA9IGRlZmluaXRpb25zWzBdO1xuXHRcdFx0Y29uc3Qgb3JpZ2luVVJJID0gZGVmLmRlZmluaXRpb24ucHJlc2VudGF0aW9uPy5vcmlnaW4/LnVyaTtcblxuXHRcdFx0Y29uc3QgeyByZXN1bHQgfSA9IGF3YWl0IHRoaXMuX2RpYWxvZ1NlcnZpY2UucHJvbXB0KFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0bWVzc2FnZTogbG9jYWxpemUoJ3RydXN0VGl0bGVXaXRoT3JpZ2luJywgJ1RydXN0IGFuZCBydW4gTUNQIHNlcnZlciB7MH0/JywgZGVmLmRlZmluaXRpb24ubGFiZWwpLFxuXHRcdFx0XHRcdGN1c3RvbToge1xuXHRcdFx0XHRcdFx0aWNvbjogQ29kaWNvbi5zaGllbGQsXG5cdFx0XHRcdFx0XHRtYXJrZG93bkRldGFpbHM6IFt7XG5cdFx0XHRcdFx0XHRcdG1hcmtkb3duOiBuZXcgTWFya2Rvd25TdHJpbmcobG9jYWxpemUoJ21jcC50cnVzdC5kZXRhaWxzJywgJ1RoZSBNQ1Agc2VydmVyIHswfSB3YXMgdXBkYXRlZC4gTUNQIHNlcnZlcnMgbWF5IGFkZCBjb250ZXh0IHRvIHlvdXIgY2hhdCBzZXNzaW9uIGFuZCBsZWFkIHRvIHVuZXhwZWN0ZWQgYmVoYXZpb3IuIERvIHlvdSB3YW50IHRvIHRydXN0IGFuZCBydW4gdGhpcyBzZXJ2ZXI/JywgbGFiZWxGb3IoZGVmKSkpLFxuXHRcdFx0XHRcdFx0XHRhY3Rpb25IYW5kbGVyOiAoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdFx0Y29uc3QgZWRpdG9yID0gdGhpcy5fZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHsgcmVzb3VyY2U6IG9yaWdpblVSSSEgfSwgQVVYX1dJTkRPV19HUk9VUCk7XG5cdFx0XHRcdFx0XHRcdFx0cmV0dXJuIGVkaXRvci50aGVuKEJvb2xlYW4pO1xuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0fV1cblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGJ1dHRvbnM6IFtcblx0XHRcdFx0XHRcdHsgbGFiZWw6IGxvY2FsaXplKCdtY3AudHJ1c3QueWVzJywgJ1RydXN0JyksIHJ1bjogKCkgPT4gdHJ1ZSB9LFxuXHRcdFx0XHRcdFx0eyBsYWJlbDogbG9jYWxpemUoJ21jcC50cnVzdC5ubycsICdEbyBub3QgdHJ1c3QnKSwgcnVuOiAoKSA9PiBmYWxzZSB9XG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0fSxcblx0XHRcdCk7XG5cblx0XHRcdHJldHVybiByZXN1bHQgPT09IHVuZGVmaW5lZCA/IHVuZGVmaW5lZCA6IChyZXN1bHQgPyBbZGVmLmRlZmluaXRpb24uaWRdIDogW10pO1xuXHRcdH1cblxuXHRcdGNvbnN0IGxpc3QgPSBkZWZpbml0aW9ucy5tYXAoZCA9PiBgLSAke2xhYmVsRm9yKGQpfWApLmpvaW4oJ1xcbicpO1xuXHRcdGNvbnN0IHsgcmVzdWx0IH0gPSBhd2FpdCB0aGlzLl9kaWFsb2dTZXJ2aWNlLnByb21wdChcblx0XHRcdHtcblx0XHRcdFx0bWVzc2FnZTogbG9jYWxpemUoJ3RydXN0VGl0bGVXaXRoT3JpZ2luTXVsdGknLCAnVHJ1c3QgYW5kIHJ1biB7MH0gTUNQIHNlcnZlcnM/JywgZGVmaW5pdGlvbnMubGVuZ3RoKSxcblx0XHRcdFx0Y3VzdG9tOiB7XG5cdFx0XHRcdFx0aWNvbjogQ29kaWNvbi5zaGllbGQsXG5cdFx0XHRcdFx0bWFya2Rvd25EZXRhaWxzOiBbe1xuXHRcdFx0XHRcdFx0bWFya2Rvd246IG5ldyBNYXJrZG93blN0cmluZyhsb2NhbGl6ZSgnbWNwLnRydXN0LmRldGFpbHNNdWx0aScsICdTZXZlcmFsIHVwZGF0ZWQgTUNQIHNlcnZlcnMgd2VyZSBkaXNjb3ZlcmVkOlxcblxcbnswfVxcblxcbiBNQ1Agc2VydmVycyBtYXkgYWRkIGNvbnRleHQgdG8geW91ciBjaGF0IHNlc3Npb24gYW5kIGxlYWQgdG8gdW5leHBlY3RlZCBiZWhhdmlvci4gRG8geW91IHdhbnQgdG8gdHJ1c3QgYW5kIHJ1biB0aGVzZSBzZXJ2ZXI/JywgbGlzdCkpLFxuXHRcdFx0XHRcdFx0YWN0aW9uSGFuZGxlcjogKHVyaSkgPT4ge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBlZGl0b3IgPSB0aGlzLl9lZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3IoeyByZXNvdXJjZTogVVJJLnBhcnNlKHVyaSkgfSwgQVVYX1dJTkRPV19HUk9VUCk7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBlZGl0b3IudGhlbihCb29sZWFuKTtcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0fV1cblx0XHRcdFx0fSxcblx0XHRcdFx0YnV0dG9uczogW1xuXHRcdFx0XHRcdHsgbGFiZWw6IGxvY2FsaXplKCdtY3AudHJ1c3QueWVzJywgJ1RydXN0JyksIHJ1bjogKCkgPT4gJ2FsbCcgfSxcblx0XHRcdFx0XHR7IGxhYmVsOiBsb2NhbGl6ZSgnbWNwLnRydXN0LnBpY2snLCAnUGljayBUcnVzdGVkJyksIHJ1bjogKCkgPT4gJ3BpY2snIH0sXG5cdFx0XHRcdFx0eyBsYWJlbDogbG9jYWxpemUoJ21jcC50cnVzdC5ubycsICdEbyBub3QgdHJ1c3QnKSwgcnVuOiAoKSA9PiAnbm9uZScgfSxcblx0XHRcdFx0XSxcblx0XHRcdH0sXG5cdFx0KTtcblxuXHRcdGlmIChyZXN1bHQgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9IGVsc2UgaWYgKHJlc3VsdCA9PT0gJ2FsbCcpIHtcblx0XHRcdHJldHVybiBkZWZpbml0aW9ucy5tYXAoZCA9PiBkLmRlZmluaXRpb24uaWQpO1xuXHRcdH0gZWxzZSBpZiAocmVzdWx0ID09PSAnbm9uZScpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHR0eXBlIEFjdGlvbmFibGVCdXR0b24gPSBJUXVpY2tJbnB1dEJ1dHRvbiAmIHsgYWN0aW9uOiAoKSA9PiB2b2lkIH07XG5cdFx0ZnVuY3Rpb24gaXNBY3Rpb25hYmxlQnV0dG9uKG9iajogSVF1aWNrSW5wdXRCdXR0b24pOiBvYmogaXMgQWN0aW9uYWJsZUJ1dHRvbiB7XG5cdFx0XHRyZXR1cm4gdHlwZW9mIChvYmogYXMgQWN0aW9uYWJsZUJ1dHRvbikuYWN0aW9uID09PSAnZnVuY3Rpb24nO1xuXHRcdH1cblxuXHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IHBpY2tlciA9IHN0b3JlLmFkZCh0aGlzLl9xdWlja0lucHV0U2VydmljZS5jcmVhdGVRdWlja1BpY2s8SVF1aWNrUGlja0l0ZW0gJiB7IGRlZmluaXRvbklkOiBzdHJpbmcgfT4oeyB1c2VTZXBhcmF0b3JzOiBmYWxzZSB9KSk7XG5cdFx0cGlja2VyLmNhblNlbGVjdE1hbnkgPSB0cnVlO1xuXHRcdHBpY2tlci5pdGVtcyA9IGRlZmluaXRpb25zLm1hcCgoeyBkZWZpbml0aW9uLCBjb2xsZWN0aW9uIH0pID0+IHtcblx0XHRcdGNvbnN0IGJ1dHRvbnM6IEFjdGlvbmFibGVCdXR0b25bXSA9IFtdO1xuXHRcdFx0aWYgKGRlZmluaXRpb24ucHJlc2VudGF0aW9uPy5vcmlnaW4pIHtcblx0XHRcdFx0Y29uc3Qgb3JpZ2luID0gZGVmaW5pdGlvbi5wcmVzZW50YXRpb24ub3JpZ2luO1xuXHRcdFx0XHRidXR0b25zLnB1c2goe1xuXHRcdFx0XHRcdGljb25DbGFzczogJ2NvZGljb24tZ28tdG8tZmlsZScsXG5cdFx0XHRcdFx0dG9vbHRpcDogJ0dvIHRvIERlZmluaXRpb24nLFxuXHRcdFx0XHRcdGFjdGlvbjogKCkgPT4gdGhpcy5fZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHsgcmVzb3VyY2U6IG9yaWdpbi51cmksIG9wdGlvbnM6IHsgc2VsZWN0aW9uOiBvcmlnaW4ucmFuZ2UgfSB9KVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0dHlwZTogJ2l0ZW0nLFxuXHRcdFx0XHRsYWJlbDogZGVmaW5pdGlvbi5sYWJlbCxcblx0XHRcdFx0ZGVmaW5pdG9uSWQ6IGRlZmluaXRpb24uaWQsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBjb2xsZWN0aW9uLnNvdXJjZSBpbnN0YW5jZW9mIEV4dGVuc2lvbklkZW50aWZpZXJcblx0XHRcdFx0XHQ/IGNvbGxlY3Rpb24uc291cmNlLnZhbHVlXG5cdFx0XHRcdFx0OiAoZGVmaW5pdGlvbi5wcmVzZW50YXRpb24/Lm9yaWdpbiA/IHRoaXMuX2xhYmVsU2VydmljZS5nZXRVcmlMYWJlbChkZWZpbml0aW9uLnByZXNlbnRhdGlvbi5vcmlnaW4udXJpKSA6IHVuZGVmaW5lZCksXG5cdFx0XHRcdHBpY2tlZDogZmFsc2UsXG5cdFx0XHRcdGJ1dHRvbnNcblx0XHRcdH07XG5cdFx0fSk7XG5cdFx0cGlja2VyLnBsYWNlaG9sZGVyID0gJ1NlbGVjdCBNQ1Agc2VydmVycyB0byB0cnVzdCc7XG5cdFx0cGlja2VyLmlnbm9yZUZvY3VzT3V0ID0gdHJ1ZTtcblxuXHRcdHN0b3JlLmFkZChwaWNrZXIub25EaWRUcmlnZ2VySXRlbUJ1dHRvbihlID0+IHtcblx0XHRcdGlmIChpc0FjdGlvbmFibGVCdXR0b24oZS5idXR0b24pKSB7XG5cdFx0XHRcdGUuYnV0dG9uLmFjdGlvbigpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHJldHVybiBuZXcgUHJvbWlzZTxzdHJpbmdbXSB8IHVuZGVmaW5lZD4ocmVzb2x2ZSA9PiB7XG5cdFx0XHRzdG9yZS5hZGQocGlja2VyLm9uRGlkQWNjZXB0KCgpID0+IHtcblx0XHRcdFx0cmVzb2x2ZShwaWNrZXIuc2VsZWN0ZWRJdGVtcy5tYXAoaXRlbSA9PiBpdGVtLmRlZmluaXRvbklkKSk7XG5cdFx0XHRcdHBpY2tlci5oaWRlKCk7XG5cdFx0XHR9KSk7XG5cdFx0XHRzdG9yZS5hZGQocGlja2VyLm9uRGlkSGlkZSgoKSA9PiB7XG5cdFx0XHRcdHJlc29sdmUodW5kZWZpbmVkKTtcblx0XHRcdH0pKTtcblx0XHRcdHBpY2tlci5zaG93KCk7XG5cdFx0fSkuZmluYWxseSgoKSA9PiBzdG9yZS5kaXNwb3NlKCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfdXBkYXRlU3RvcmFnZVdpdGhFeHByZXNzaW9uSW5wdXRzKGlucHV0U3RvcmFnZTogTWNwUmVnaXN0cnlJbnB1dFN0b3JhZ2UsIGV4cHI6IENvbmZpZ3VyYXRpb25SZXNvbHZlckV4cHJlc3Npb248dW5rbm93bj4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBzZWNyZXRzOiBSZWNvcmQ8c3RyaW5nLCBJUmVzb2x2ZWRWYWx1ZT4gPSB7fTtcblx0XHRjb25zdCBpbnB1dHM6IFJlY29yZDxzdHJpbmcsIElSZXNvbHZlZFZhbHVlPiA9IHt9O1xuXHRcdGZvciAoY29uc3QgW3JlcGxhY2VtZW50LCByZXNvbHZlZF0gb2YgZXhwci5yZXNvbHZlZCgpKSB7XG5cdFx0XHRpZiAocmVzb2x2ZWQuaW5wdXQ/LnR5cGUgPT09ICdwcm9tcHRTdHJpbmcnICYmIHJlc29sdmVkLmlucHV0LnBhc3N3b3JkKSB7XG5cdFx0XHRcdHNlY3JldHNbcmVwbGFjZW1lbnQuaWRdID0gcmVzb2x2ZWQ7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRpbnB1dHNbcmVwbGFjZW1lbnQuaWRdID0gcmVzb2x2ZWQ7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aW5wdXRTdG9yYWdlLnNldFBsYWluVGV4dChpbnB1dHMpO1xuXHRcdGF3YWl0IGlucHV0U3RvcmFnZS5zZXRTZWNyZXRzKHNlY3JldHMpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlSW5wdXRzLmZpcmUoKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3JlcGxhY2VWYXJpYWJsZXNJbkxhdW5jaChkZWxlZ2F0ZTogSU1jcEhvc3REZWxlZ2F0ZSwgZGVmaW5pdGlvbjogTWNwU2VydmVyRGVmaW5pdGlvbiwgbGF1bmNoOiBNY3BTZXJ2ZXJMYXVuY2gsIGVycm9yT25Vc2VySW50ZXJhY3Rpb24/OiBib29sZWFuKSB7XG5cdFx0aWYgKCFkZWZpbml0aW9uLnZhcmlhYmxlUmVwbGFjZW1lbnQpIHtcblx0XHRcdHJldHVybiBsYXVuY2g7XG5cdFx0fVxuXG5cdFx0Y29uc3QgeyBzZWN0aW9uLCB0YXJnZXQsIGZvbGRlciB9ID0gZGVmaW5pdGlvbi52YXJpYWJsZVJlcGxhY2VtZW50O1xuXHRcdGNvbnN0IGlucHV0U3RvcmFnZSA9IHRoaXMuX2dldElucHV0U3RvcmFnZUluQ29uZmlnVGFyZ2V0KHRhcmdldCk7XG5cdFx0Y29uc3QgW3ByZXZpb3VzbHlTdG9yZWQsIHdpdGhSZW1vdGVGaWxsZWRdID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xuXHRcdFx0aW5wdXRTdG9yYWdlLmdldE1hcCgpLFxuXHRcdFx0ZGVsZWdhdGUuc3Vic3RpdHV0ZVZhcmlhYmxlcyhkZWZpbml0aW9uLCBsYXVuY2gpLFxuXHRcdF0pO1xuXG5cdFx0Ly8gcHJlLWZpbGwgdGhlIHZhcmlhYmxlcyB3ZSBhbHJlYWR5IHJlc29sdmVkIHRvIGF2b2lkIGV4dHJhIHByb21wdGluZ1xuXHRcdGNvbnN0IGV4cHIgPSBDb25maWd1cmF0aW9uUmVzb2x2ZXJFeHByZXNzaW9uLnBhcnNlKE1jcFNlcnZlckxhdW5jaC50b1NlcmlhbGl6ZWQod2l0aFJlbW90ZUZpbGxlZCkpO1xuXHRcdGZvciAoY29uc3QgcmVwbGFjZW1lbnQgb2YgZXhwci51bnJlc29sdmVkKCkpIHtcblx0XHRcdGlmIChwcmV2aW91c2x5U3RvcmVkLmhhc093blByb3BlcnR5KHJlcGxhY2VtZW50LmlkKSkge1xuXHRcdFx0XHRleHByLnJlc29sdmUocmVwbGFjZW1lbnQsIHByZXZpb3VzbHlTdG9yZWRbcmVwbGFjZW1lbnQuaWRdKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBDaGVjayBpZiB0aGVyZSBhcmUgc3RpbGwgdW5yZXNvbHZlZCB2YXJpYWJsZXMgdGhhdCB3b3VsZCByZXF1aXJlIGludGVyYWN0aW9uXG5cdFx0aWYgKGVycm9yT25Vc2VySW50ZXJhY3Rpb24pIHtcblx0XHRcdGNvbnN0IHVucmVzb2x2ZWQgPSBBcnJheS5mcm9tKGV4cHIudW5yZXNvbHZlZCgpKTtcblx0XHRcdGlmICh1bnJlc29sdmVkLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0dGhyb3cgbmV3IFVzZXJJbnRlcmFjdGlvblJlcXVpcmVkRXJyb3IoJ3ZhcmlhYmxlcycpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHQvLyByZXNvbHZlIHZhcmlhYmxlcyByZXF1aXJpbmcgdXNlciBpbnB1dFxuXHRcdGF3YWl0IHRoaXMuX2NvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2UucmVzb2x2ZVdpdGhJbnRlcmFjdGlvbihmb2xkZXIsIGV4cHIsIHNlY3Rpb24sIHVuZGVmaW5lZCwgdGFyZ2V0KTtcblxuXHRcdGF3YWl0IHRoaXMuX3VwZGF0ZVN0b3JhZ2VXaXRoRXhwcmVzc2lvbklucHV0cyhpbnB1dFN0b3JhZ2UsIGV4cHIpO1xuXG5cdFx0Ly8gcmVzb2x2ZSBvdGhlciBub24taW50ZXJhY3RpdmUgdmFyaWFibGVzLCByZXR1cm5pbmcgdGhlIGZpbmFsIG9iamVjdFxuXHRcdGNvbnN0IHJlc29sdmVkID0gYXdhaXQgdGhpcy5fY29uZmlndXJhdGlvblJlc29sdmVyU2VydmljZS5yZXNvbHZlQXN5bmMoZm9sZGVyLCBleHByKTtcblx0XHRyZXR1cm4gTWNwU2VydmVyTGF1bmNoLmZyb21TZXJpYWxpemVkKHJlc29sdmVkKTtcblx0fVxuXG5cdHByaXZhdGUgaXNDb2xsZWN0aW9uQWxsb3dlZChjb2xsZWN0aW9uOiBNY3BDb2xsZWN0aW9uRGVmaW5pdGlvbiwgc3RyaWN0UGx1Z2luT25seTogU3RyaWN0UGx1Z2luT25seUN1c3RvbWl6YXRpb24pOiBib29sZWFuIHtcblx0XHRyZXR1cm4gIWlzU3RyaWN0UGx1Z2luT25seUN1c3RvbWl6YXRpb25FbmFibGVkKHN0cmljdFBsdWdpbk9ubHkpXG5cdFx0XHR8fCBjb2xsZWN0aW9uLnByb3ZlbmFuY2UgPT09IE1jcENvbGxlY3Rpb25Qcm92ZW5hbmNlLlBsdWdpbjtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyByZXNvbHZlQ29ubmVjdGlvbihvcHRzOiBJTWNwUmVzb2x2ZUNvbm5lY3Rpb25PcHRpb25zKTogUHJvbWlzZTxJTWNwU2VydmVyQ29ubmVjdGlvbiB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHsgY29sbGVjdGlvblJlZiwgZGVmaW5pdGlvblJlZiwgaW50ZXJhY3Rpb24sIGxvZ2dlciwgZGVidWcgfSA9IG9wdHM7XG5cdFx0bGV0IGNvbGxlY3Rpb24gPSB0aGlzLl9jb2xsZWN0aW9ucy5nZXQoKS5maW5kKGMgPT4gYy5pZCA9PT0gY29sbGVjdGlvblJlZi5pZCk7XG5cdFx0aWYgKGNvbGxlY3Rpb24gJiYgIXRoaXMuaXNDb2xsZWN0aW9uQWxsb3dlZChjb2xsZWN0aW9uLCB0aGlzLl9zdHJpY3RQbHVnaW5Pbmx5Q3VzdG9taXphdGlvbi5nZXQoKSkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgTUNQIGNvbGxlY3Rpb24gJHtjb2xsZWN0aW9uUmVmLmlkfSBpcyBibG9ja2VkIGJ5IGVudGVycHJpc2UgY3VzdG9taXphdGlvbiBwb2xpY3lgKTtcblx0XHR9XG5cdFx0aWYgKGNvbGxlY3Rpb24/LmxhenkpIHtcblx0XHRcdGF3YWl0IGNvbGxlY3Rpb24ubGF6eS5sb2FkKCk7XG5cdFx0XHRjb2xsZWN0aW9uID0gdGhpcy5fY29sbGVjdGlvbnMuZ2V0KCkuZmluZChjID0+IGMuaWQgPT09IGNvbGxlY3Rpb25SZWYuaWQpO1xuXHRcdH1cblx0XHRpZiAoY29sbGVjdGlvbiAmJiAhdGhpcy5pc0NvbGxlY3Rpb25BbGxvd2VkKGNvbGxlY3Rpb24sIHRoaXMuX3N0cmljdFBsdWdpbk9ubHlDdXN0b21pemF0aW9uLmdldCgpKSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBNQ1AgY29sbGVjdGlvbiAke2NvbGxlY3Rpb25SZWYuaWR9IGlzIGJsb2NrZWQgYnkgZW50ZXJwcmlzZSBjdXN0b21pemF0aW9uIHBvbGljeWApO1xuXHRcdH1cblxuXHRcdGNvbnN0IGRlZmluaXRpb24gPSBjb2xsZWN0aW9uPy5zZXJ2ZXJEZWZpbml0aW9ucy5nZXQoKS5maW5kKHMgPT4gcy5pZCA9PT0gZGVmaW5pdGlvblJlZi5pZCk7XG5cdFx0aWYgKCFjb2xsZWN0aW9uIHx8ICFkZWZpbml0aW9uKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYENvbGxlY3Rpb24gb3IgZGVmaW5pdGlvbiBub3QgZm91bmQgZm9yICR7Y29sbGVjdGlvblJlZi5pZH0gYW5kICR7ZGVmaW5pdGlvblJlZi5pZH1gKTtcblx0XHR9XG5cblx0XHRjb25zdCBkZWxlZ2F0ZSA9IHRoaXMuX2RlbGVnYXRlcy5nZXQoKS5maW5kKGQgPT4gZC5jYW5TdGFydChjb2xsZWN0aW9uLCBkZWZpbml0aW9uKSk7XG5cdFx0aWYgKCFkZWxlZ2F0ZSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdObyBkZWxlZ2F0ZSBmb3VuZCB0aGF0IGNhbiBoYW5kbGUgdGhlIGNvbm5lY3Rpb24nKTtcblx0XHR9XG5cblx0XHRjb25zdCB0cnVzdGVkID0gYXdhaXQgdGhpcy5fY2hlY2tUcnVzdChjb2xsZWN0aW9uLCBkZWZpbml0aW9uLCBvcHRzKTtcblx0XHRpbnRlcmFjdGlvbj8ucGFydGljaXBhbnRzLnNldChkZWZpbml0aW9uLmlkLCB7IHM6ICdyZXNvbHZlZCcgfSk7XG5cdFx0aWYgKCF0cnVzdGVkKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGxldCBsYXVuY2g6IE1jcFNlcnZlckxhdW5jaCB8IHVuZGVmaW5lZCA9IGRlZmluaXRpb24ubGF1bmNoO1xuXHRcdGlmIChjb2xsZWN0aW9uLnJlc29sdmVTZXJ2ZXJMYW5jaCkge1xuXHRcdFx0bGF1bmNoID0gYXdhaXQgY29sbGVjdGlvbi5yZXNvbHZlU2VydmVyTGFuY2goZGVmaW5pdGlvbik7XG5cdFx0XHRpZiAoIWxhdW5jaCkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkOyAvLyBpbnRlcmFjdGlvbiBjYW5jZWxsZWQgYnkgdXNlclxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRyeSB7XG5cdFx0XHRsYXVuY2ggPSBhd2FpdCB0aGlzLl9yZXBsYWNlVmFyaWFibGVzSW5MYXVuY2goZGVsZWdhdGUsIGRlZmluaXRpb24sIGxhdW5jaCwgb3B0cy5lcnJvck9uVXNlckludGVyYWN0aW9uKTtcblxuXHRcdFx0aWYgKGRlZmluaXRpb24uZGV2TW9kZSAmJiBkZWJ1Zykge1xuXHRcdFx0XHRsYXVuY2ggPSBhd2FpdCB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihhY2Nlc3NvciA9PiBhY2Nlc3Nvci5nZXQoSU1jcERldk1vZGVEZWJ1Z2dpbmcpLnRyYW5zZm9ybShkZWZpbml0aW9uLCBsYXVuY2ghKSk7XG5cdFx0XHR9XG5cdFx0XHQvLyBJZiBzYW5kYm94IGlzIGVuYWJsZWQgZm9yIHRoaXMgc2VydmVyLCBhdHRlbXB0IHRvIGxhdW5jaCBpbiBzYW5kYm94XG5cdFx0XHRsYXVuY2ggPSBhd2FpdCB0aGlzLl9tY3BTYW5kYm94U2VydmljZS5sYXVuY2hJblNhbmRib3hJZkVuYWJsZWQoZGVmaW5pdGlvbiwgbGF1bmNoLCBjb2xsZWN0aW9uLnJlbW90ZUF1dGhvcml0eSA/PyB1bmRlZmluZWQsIGNvbGxlY3Rpb24uY29uZmlnVGFyZ2V0KTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRpZiAoZSBpbnN0YW5jZW9mIFVzZXJJbnRlcmFjdGlvblJlcXVpcmVkRXJyb3IpIHtcblx0XHRcdFx0dGhyb3cgZTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5fbm90aWZpY2F0aW9uU2VydmljZS5ub3RpZnkoe1xuXHRcdFx0XHRzZXZlcml0eTogU2V2ZXJpdHkuRXJyb3IsXG5cdFx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKCdtY3AubGF1bmNoRXJyb3InLCAnRXJyb3Igc3RhcnRpbmcgezB9OiB7MX0nLCBkZWZpbml0aW9uLmxhYmVsLCBTdHJpbmcoZSkpLFxuXHRcdFx0XHRhY3Rpb25zOiB7XG5cdFx0XHRcdFx0cHJpbWFyeTogY29sbGVjdGlvbi5wcmVzZW50YXRpb24/Lm9yaWdpbiAmJiBbXG5cdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdGlkOiAnbWNwLmxhdW5jaEVycm9yLm9wZW5Db25maWcnLFxuXHRcdFx0XHRcdFx0XHRjbGFzczogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0XHRcdFx0XHR0b29sdGlwOiAnJyxcblx0XHRcdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdtY3AubGF1bmNoRXJyb3Iub3BlbkNvbmZpZycsICdPcGVuIENvbmZpZ3VyYXRpb24nKSxcblx0XHRcdFx0XHRcdFx0cnVuOiAoKSA9PiB0aGlzLl9lZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3Ioe1xuXHRcdFx0XHRcdFx0XHRcdHJlc291cmNlOiBjb2xsZWN0aW9uLnByZXNlbnRhdGlvbiEub3JpZ2luLFxuXHRcdFx0XHRcdFx0XHRcdG9wdGlvbnM6IHsgc2VsZWN0aW9uOiBkZWZpbml0aW9uLnByZXNlbnRhdGlvbj8ub3JpZ2luPy5yYW5nZSB9XG5cdFx0XHRcdFx0XHRcdH0pLFxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0TWNwU2VydmVyQ29ubmVjdGlvbixcblx0XHRcdGNvbGxlY3Rpb24sXG5cdFx0XHRkZWZpbml0aW9uLFxuXHRcdFx0ZGVsZWdhdGUsXG5cdFx0XHRsYXVuY2gsXG5cdFx0XHRsb2dnZXIsXG5cdFx0XHRvcHRzLmVycm9yT25Vc2VySW50ZXJhY3Rpb24sXG5cdFx0XHRvcHRzLnRhc2tNYW5hZ2VyLFxuXHRcdCk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsZUFBZTtBQUN4QixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLFlBQVk7QUFDckIsU0FBUyxZQUFZLHVCQUFvQztBQUN6RCxTQUFTLFNBQXNCLGlCQUFpQiw2QkFBNkI7QUFDN0UsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMscUJBQXFCLDZCQUE2QjtBQUMzRCxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLG1CQUFtQjtBQUM1QixTQUFTLGlCQUFpQixzQkFBc0I7QUFDaEQsU0FBUyxzQkFBc0IsZ0JBQWdCO0FBQy9DLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQTRCLDBCQUEwQztBQUN0RSxTQUFTLGNBQWMscUJBQXFCO0FBRTVDLFNBQVMsa0NBQWtDLHFDQUFxQztBQUNoRixTQUFTLHFDQUFxQztBQUM5QyxTQUFTLHVDQUF1RDtBQUNoRSxTQUFTLGtCQUFrQixzQkFBc0I7QUFDakQsU0FBUyw0QkFBNEI7QUFDckMsU0FBUywrQkFBK0I7QUFFeEMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUywyQkFBMkI7QUFDcEMsU0FBK0IscUJBQThDLHlCQUFzRSxpQkFBaUIsZ0JBQWdCLDJCQUEyQixvQ0FBb0M7QUFDblAsU0FBUyx1REFBdUQ7QUFDaEUsU0FBUyw4Q0FBNkU7QUFFdEYsTUFBTSxrQkFBa0I7QUFFakIsSUFBTSxjQUFOLGNBQTBCLFdBQW1DO0FBQUEsRUF5Q25FLFlBQ3lDLHVCQUNRLCtCQUNmLGdCQUNNLHNCQUNOLGdCQUNWLHNCQUNjLG9CQUNMLGVBQ0YsYUFDTyxvQkFDYyxrQ0FDSCwrQkFDL0M7QUFDRCxVQUFNO0FBYmtDO0FBQ1E7QUFDZjtBQUNNO0FBQ047QUFFSTtBQUNMO0FBQ0Y7QUFDTztBQUNjO0FBQ0g7QUFsRGpELFNBQWlCLGVBQWUsZ0JBQW9ELGVBQWUsQ0FBQyxDQUFDO0FBQ3JHLFNBQWlCLGFBQWEsZ0JBQTZDLGFBQWEsQ0FBQyxDQUFDO0FBRzFGLFNBQWdCLGNBQStELFFBQVEsWUFBVTtBQUNoRyxVQUFJLEtBQUssZ0JBQWdCLEtBQUssTUFBTSxNQUFNLGVBQWUsTUFBTTtBQUM5RCxlQUFPLENBQUM7QUFBQSxNQUNUO0FBQ0EsWUFBTSxtQkFBbUIsS0FBSywrQkFBK0IsS0FBSyxNQUFNO0FBQ3hFLGFBQU8sS0FBSyxhQUFhLEtBQUssTUFBTSxFQUFFLE9BQU8sZ0JBQWMsS0FBSyxvQkFBb0IsWUFBWSxnQkFBZ0IsQ0FBQztBQUFBLElBQ2xILENBQUM7QUFFRCxTQUFpQixvQkFBb0IsSUFBSSxLQUFLLE1BQU0sS0FBSyxVQUFVLEtBQUssc0JBQXNCLGVBQWUseUJBQXlCLGFBQWEsV0FBVyxjQUFjLElBQUksQ0FBQyxDQUFDO0FBQ2xMLFNBQWlCLGtCQUFrQixJQUFJLEtBQUssTUFBTSxLQUFLLFVBQVUsS0FBSyxzQkFBc0IsZUFBZSx5QkFBeUIsYUFBYSxTQUFTLGNBQWMsSUFBSSxDQUFDLENBQUM7QUFFOUssU0FBaUIsMEJBQTBCLGdCQUFnQixNQUFNLENBQUM7QUFFbEUsU0FBZ0Isc0JBQXNCLFFBQVEsWUFBVTtBQUN2RCxVQUFJLEtBQUssZ0JBQWdCLEtBQUssTUFBTSxNQUFNLGVBQWUsTUFBTTtBQUM5RCxlQUFPLEVBQUUsT0FBTyxvQkFBb0IsVUFBVSxhQUFhLENBQUMsRUFBRTtBQUFBLE1BQy9EO0FBRUEsVUFBSSxLQUFLLHdCQUF3QixLQUFLLE1BQU0sSUFBSSxHQUFHO0FBQ2xELGVBQU8sRUFBRSxPQUFPLG9CQUFvQixnQkFBZ0IsYUFBYSxDQUFDLEVBQUU7QUFBQSxNQUNyRTtBQUNBLFlBQU0sbUJBQW1CLEtBQUssK0JBQStCLEtBQUssTUFBTTtBQUN4RSxZQUFNLGNBQWMsS0FBSyxhQUFhLEtBQUssTUFBTSxFQUFFLE9BQU8sZ0JBQWMsS0FBSyxvQkFBb0IsWUFBWSxnQkFBZ0IsQ0FBQztBQUM5SCxZQUFNLGFBQWEsWUFBWSxLQUFLLE9BQUssRUFBRSxRQUFRLEVBQUUsS0FBSyxhQUFhLEtBQUs7QUFDNUUsYUFBTyxhQUFhLEVBQUUsT0FBTyxvQkFBb0IsWUFBWSxhQUFhLFlBQVksT0FBTyxPQUFLLEVBQUUsUUFBUSxFQUFFLEtBQUssYUFBYSxLQUFLLEVBQUUsSUFBSSxFQUFFLE9BQU8sb0JBQW9CLFVBQVUsYUFBYSxDQUFDLEVBQUU7QUFBQSxJQUNuTSxDQUFDO0FBTUQsU0FBaUIscUJBQXFCLEtBQUssVUFBVSxJQUFJLFFBQWMsQ0FBQztBQUN4RSxTQUFnQixvQkFBb0IsS0FBSyxtQkFBbUI7QUFpQjNELFNBQUssa0JBQWtCLHNCQUFzQixpQkFBaUIsZUFBZSxLQUFLLG9CQUFvQjtBQUN0RyxTQUFLLGlDQUFpQyxzQkFBc0IsaURBQWlELFFBQVcsb0JBQW9CO0FBQUEsRUFDN0k7QUFBQSxFQXhCQSxJQUFXLFlBQXNEO0FBQ2hFLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQSxFQXdCTyxpQkFBaUIsVUFBeUM7QUFDaEUsVUFBTSxZQUFZLEtBQUssV0FBVyxJQUFJLEVBQUUsTUFBTTtBQUM5QyxjQUFVLEtBQUssUUFBUTtBQUN2QixjQUFVLEtBQUssQ0FBQyxHQUFHLE1BQU0sRUFBRSxXQUFXLEVBQUUsUUFBUTtBQUNoRCxTQUFLLFdBQVcsSUFBSSxXQUFXLE1BQVM7QUFFeEMsV0FBTztBQUFBLE1BQ04sU0FBUyxNQUFNO0FBQ2QsY0FBTUEsYUFBWSxLQUFLLFdBQVcsSUFBSSxFQUFFLE9BQU8sT0FBSyxNQUFNLFFBQVE7QUFDbEUsYUFBSyxXQUFXLElBQUlBLFlBQVcsTUFBUztBQUFBLE1BQ3pDO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFBQSxFQUVPLG1CQUFtQixZQUFrRDtBQUMzRSxVQUFNLHFCQUFxQixLQUFLLGFBQWEsSUFBSTtBQUNqRCxVQUFNLFlBQVksbUJBQW1CLEtBQUssT0FBSyxFQUFFLE9BQU8sV0FBVyxFQUFFO0FBR3JFLFFBQUksYUFBYSxDQUFDLFVBQVUsTUFBTTtBQUNqQyxhQUFPLFdBQVc7QUFBQSxJQUNuQixXQUFXLFdBQVc7QUFDckIsV0FBSyxhQUFhLElBQUksbUJBQW1CLElBQUksT0FBSyxNQUFNLFlBQVksYUFBYSxDQUFDLEdBQUcsTUFBUztBQUFBLElBQy9GLE9BQU87QUFDTixXQUFLLGFBQWEsSUFBSSxDQUFDLEdBQUcsb0JBQW9CLFVBQVUsRUFDdEQsS0FBSyxDQUFDLEdBQUcsTUFBTSxFQUFFLFFBQVEsRUFBRSxLQUFLLEdBQUcsTUFBUztBQUFBLElBQy9DO0FBRUEsV0FBTztBQUFBLE1BQ04sU0FBUyxNQUFNO0FBQ2QsY0FBTUMsc0JBQXFCLEtBQUssYUFBYSxJQUFJO0FBQ2pELGFBQUssYUFBYSxJQUFJQSxvQkFBbUIsT0FBTyxPQUFLLE1BQU0sVUFBVSxHQUFHLE1BQVM7QUFBQSxNQUNsRjtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUEsRUFFTyxvQkFBb0IsZUFBdUMsZUFBa0o7QUFDbk4sVUFBTSxnQkFBZ0IsS0FBSyxhQUFhLElBQUksVUFBUSxLQUFLLEtBQUssT0FBSyxFQUFFLE9BQU8sY0FBYyxFQUFFLENBQUM7QUFDN0YsV0FBTyxjQUFjLElBQUksQ0FBQyxZQUFZLFdBQVc7QUFDaEQsVUFBSSxjQUFjLENBQUMsS0FBSyxvQkFBb0IsWUFBWSxLQUFLLCtCQUErQixLQUFLLE1BQU0sQ0FBQyxHQUFHO0FBQzFHLGVBQU8sRUFBRSxZQUFZLFFBQVcsUUFBUSxPQUFVO0FBQUEsTUFDbkQ7QUFDQSxZQUFNLFNBQVMsWUFBWSxrQkFBa0IsS0FBSyxNQUFNLEVBQUUsS0FBSyxPQUFLLEVBQUUsT0FBTyxjQUFjLEVBQUU7QUFDN0YsYUFBTyxFQUFFLFlBQVksT0FBTztBQUFBLElBQzdCLENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFQSxNQUFhLHNCQUEwRDtBQUN0RSxVQUFNLG1CQUFtQixLQUFLLCtCQUErQixJQUFJO0FBQ2pFLFVBQU0sYUFBYSxLQUFLLGFBQWEsSUFBSSxFQUFFLE9BQU8sT0FBSyxLQUFLLG9CQUFvQixHQUFHLGdCQUFnQixLQUFLLEVBQUUsUUFBUSxDQUFDLEVBQUUsS0FBSyxRQUFRO0FBRWxJLFNBQUssd0JBQXdCLElBQUksS0FBSyx3QkFBd0IsSUFBSSxJQUFJLEdBQUcsTUFBUztBQUNsRixVQUFNLFFBQVEsSUFBSSxXQUFXLElBQUksT0FBSyxFQUFFLE1BQU0sS0FBSyxDQUFDLENBQUMsRUFBRSxRQUFRLE1BQU07QUFDcEUsV0FBSyx3QkFBd0IsSUFBSSxLQUFLLHdCQUF3QixJQUFJLElBQUksR0FBRyxNQUFTO0FBQUEsSUFDbkYsQ0FBQztBQUVELFVBQU0sUUFBbUMsQ0FBQztBQUMxQyxVQUFNLFVBQVUsS0FBSyxhQUFhLElBQUk7QUFDdEMsZUFBVyxjQUFjLFlBQVk7QUFDcEMsWUFBTSxNQUFNLFFBQVEsS0FBSyxPQUFLLEVBQUUsT0FBTyxXQUFXLEVBQUU7QUFDcEQsVUFBSSxDQUFDLEtBQUs7QUFBQSxNQUVWLFdBQVcsSUFBSSxNQUFNO0FBQ3BCLFlBQUksS0FBSyxVQUFVO0FBQUEsTUFDcEIsT0FBTztBQUNOLGNBQU0sS0FBSyxHQUFHO0FBQUEsTUFDZjtBQUFBLElBQ0Q7QUFHQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRVEsaUJBQWlCLE9BQThDO0FBQ3RFLFdBQU8sVUFBVSxhQUFhLFlBQVksS0FBSyxrQkFBa0IsUUFBUSxLQUFLLGdCQUFnQjtBQUFBLEVBQy9GO0FBQUEsRUFFUSwrQkFBK0IsY0FBNEQ7QUFDbEcsV0FBTyxLQUFLO0FBQUEsTUFDWCxpQkFBaUIsb0JBQW9CLGFBQWEsaUJBQWlCLG9CQUFvQixtQkFDcEYsYUFBYSxZQUNiLGFBQWE7QUFBQSxJQUNqQjtBQUFBLEVBQ0Q7QUFBQSxFQUVBLE1BQWEsaUJBQWlCLE9BQXFCLFNBQWtCO0FBQ3BFLFVBQU0sVUFBVSxLQUFLLGlCQUFpQixLQUFLO0FBQzNDLFFBQUksU0FBUztBQUNaLFlBQU0sUUFBUSxNQUFNLE9BQU87QUFBQSxJQUM1QixPQUFPO0FBQ04sY0FBUSxTQUFTO0FBQUEsSUFDbEI7QUFFQSxTQUFLLG1CQUFtQixLQUFLO0FBQUEsRUFDOUI7QUFBQSxFQUVBLE1BQWEsZUFBZSxTQUFpQixZQUE4QyxlQUF1QixRQUE0QztBQUM3SixVQUFNLFVBQVUsS0FBSywrQkFBK0IsTUFBTTtBQUMxRCxVQUFNLE9BQU8sZ0NBQWdDLE1BQU0sT0FBTztBQUUxRCxVQUFNLFNBQVMsTUFBTSxRQUFRLE9BQU87QUFDcEMsVUFBTSxXQUFXLE9BQU8sT0FBTyxFQUFFO0FBQ2pDLFVBQU0sS0FBSyw4QkFBOEIsdUJBQXVCLFlBQVksTUFBTSxlQUFlLFdBQVcsRUFBRSxDQUFDLFFBQVEsTUFBTSxHQUFHLEVBQUUsQ0FBQyxHQUFHLFNBQVMsSUFBSSxDQUFDLEdBQUcsTUFBTTtBQUM3SixVQUFNLEtBQUssbUNBQW1DLFNBQVMsSUFBSTtBQUFBLEVBQzVEO0FBQUEsRUFFQSxNQUFhLGNBQWMsU0FBaUIsUUFBNkIsT0FBOEI7QUFDdEcsVUFBTSxVQUFVLEtBQUssK0JBQStCLE1BQU07QUFDMUQsVUFBTSxPQUFPLGdDQUFnQyxNQUFNLE9BQU87QUFDMUQsZUFBVyxjQUFjLEtBQUssV0FBVyxHQUFHO0FBQzNDLFdBQUssUUFBUSxZQUFZLEtBQUs7QUFDOUI7QUFBQSxJQUNEO0FBQ0EsVUFBTSxLQUFLLG1DQUFtQyxTQUFTLElBQUk7QUFBQSxFQUM1RDtBQUFBLEVBRU8sZUFBZSxPQUFnRTtBQUNyRixXQUFPLEtBQUssaUJBQWlCLEtBQUssRUFBRSxPQUFPO0FBQUEsRUFDNUM7QUFBQSxFQUVBLE1BQWMsWUFBWSxZQUFxQyxZQUFpQztBQUFBLElBQy9GO0FBQUEsSUFDQTtBQUFBLElBQ0EsYUFBYTtBQUFBLElBQ2IsbUJBQW1CO0FBQUEsSUFDbkIseUJBQXlCO0FBQUEsRUFDMUIsR0FBaUM7QUFDaEMsUUFBSSxXQUFXLFVBQVUsYUFBYSxhQUFhLENBQUMsS0FBSyxpQ0FBaUMsbUJBQW1CLEdBQUc7QUFDL0csVUFBSSx3QkFBd0I7QUFDM0IsY0FBTSxJQUFJLDZCQUE2QixnQkFBZ0I7QUFBQSxNQUN4RCxXQUFXLENBQUMsTUFBTSxLQUFLLDhCQUE4QixzQkFBc0IsRUFBRSxTQUFTLFNBQVMsWUFBWSxnRUFBZ0UsRUFBRSxDQUFDLEdBQUc7QUFDaEwsZUFBTztBQUFBLE1BQ1I7QUFBQSxJQUNEO0FBRUEsUUFBSSxXQUFXLGtCQUFrQixlQUFlLEtBQUssU0FBUztBQUM3RCxXQUFLLFlBQVksTUFBTSxjQUFjLFdBQVcsRUFBRSxxQ0FBcUM7QUFDdkYsYUFBTztBQUFBLElBQ1IsV0FBVyxXQUFXLGtCQUFrQixlQUFlLEtBQUssZ0JBQWdCO0FBQzNFLFVBQUksV0FBVyxlQUFlLGlCQUFpQixnQkFBZ0I7QUFDOUQsYUFBSyxZQUFZLE1BQU0sY0FBYyxXQUFXLEVBQUUsdUNBQXVDO0FBQ3pGLGVBQU87QUFBQSxNQUNSO0FBRUEsVUFBSSxrQkFBa0I7QUFDckIsYUFBSyxZQUFZLE1BQU0sY0FBYyxXQUFXLEVBQUUsOENBQThDO0FBQ2hHLHlCQUFpQixpQkFBaUIsV0FBVztBQUM3QyxlQUFPO0FBQUEsTUFDUjtBQUVBLFVBQUksaUJBQWlCLG1CQUFtQixpQkFBaUI7QUFDeEQsWUFBSSxlQUFlLGlCQUFpQjtBQUNuQyxjQUFJLHdCQUF3QjtBQUMzQixrQkFBTSxJQUFJLDZCQUE2QixhQUFhO0FBQUEsVUFDckQ7QUFDQSxpQkFBTyxLQUFLLGdCQUFnQixZQUFZLFlBQVksYUFBYSxnQkFBZ0I7QUFBQSxRQUNsRixPQUFPO0FBQ04sZUFBSyxZQUFZLE1BQU0sY0FBYyxXQUFXLEVBQUUscUNBQXFDO0FBQ3ZGLGlCQUFPO0FBQUEsUUFDUjtBQUFBLE1BQ0Q7QUFFQSxVQUFJLGVBQWUsU0FBUztBQUMzQixhQUFLLFlBQVksTUFBTSxjQUFjLFdBQVcsRUFBRSwwQ0FBMEM7QUFDNUYsZUFBTztBQUFBLE1BQ1I7QUFFQSxVQUFJLHdCQUF3QjtBQUMzQixjQUFNLElBQUksNkJBQTZCLGFBQWE7QUFBQSxNQUNyRDtBQUVBLFlBQU0sV0FBVyxNQUFNLEtBQUssZ0JBQWdCLFlBQVksWUFBWSxhQUFhLGdCQUFnQjtBQUNqRyxVQUFJLFVBQVU7QUFDYixlQUFPO0FBQUEsTUFDUjtBQUNBLFVBQUksYUFBYSxRQUFXO0FBQzNCLGVBQU87QUFBQSxNQUNSO0FBRUEsdUJBQWlCLGlCQUFpQjtBQUNsQyxhQUFPO0FBQUEsSUFDUixPQUFPO0FBQ04sa0JBQVksV0FBVyxhQUFhO0FBQUEsSUFDckM7QUFBQSxFQUNEO0FBQUEsRUFFQSxNQUFjLGdCQUFnQixZQUFpQyxZQUFxQyxhQUFvRCxrQkFBNEU7QUFDbk8sb0JBQWdCLElBQUksMEJBQTBCO0FBQzlDLGdCQUFZLGFBQWEsSUFBSSxXQUFXLElBQUksRUFBRSxHQUFHLFdBQVcsWUFBWSxXQUFXLENBQUM7QUFFcEYsVUFBTSx1QkFBdUIsTUFBTSxJQUFJLFFBQThCLGFBQVc7QUFDL0UsNEJBQXNCLFlBQVU7QUFDL0IsY0FBTSxNQUFNLFlBQVksYUFBYSxXQUFXLEtBQUssTUFBTTtBQUMzRCxZQUFJLFNBQVMsS0FBSyxJQUFJLE9BQU8sR0FBRyxPQUFLLEVBQUUsTUFBTSxTQUFTLEdBQUc7QUFDeEQ7QUFBQSxRQUNEO0FBRUEsZUFBTyxRQUFRO0FBQ2Ysb0JBQVksV0FBVyxLQUFLO0FBQUEsVUFDM0IsQ0FBQyxHQUFHLElBQUksT0FBTyxDQUFDLEVBQUUsSUFBSSxDQUFDLE1BQU0sRUFBRSxNQUFNLFlBQVksSUFBSSxNQUFTLEVBQUUsT0FBTyxTQUFTO0FBQUEsUUFDakY7QUFDQSxnQkFBUSxZQUFZLE1BQU07QUFBQSxNQUMzQixDQUFDO0FBQUEsSUFDRixDQUFDO0FBRUQsU0FBSyxZQUFZLE1BQU0sd0JBQXdCLG9CQUFvQjtBQUVuRSxRQUFJLHNCQUFzQjtBQUN6Qix1QkFBaUIsaUJBQWlCLHFCQUFxQixTQUFTLFdBQVcsRUFBRSxJQUMxRSxXQUFXLGFBQ1g7QUFBQSxJQUNKO0FBRUEsV0FBTyxDQUFDLENBQUMsc0JBQXNCLFNBQVMsV0FBVyxFQUFFO0FBQUEsRUFDdEQ7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFPQSxNQUFnQiwwQkFBMEIsYUFBd0g7QUFDakssYUFBUyxTQUFTLEdBQTZFO0FBQzlGLFlBQU0sWUFBWSxFQUFFLFdBQVcsY0FBYyxRQUFRLE9BQU8sRUFBRSxXQUFXLGNBQWM7QUFDdkYsVUFBSSxrQkFBa0IsWUFBWSxNQUFNLEVBQUUsV0FBVyxLQUFLLE9BQU8sU0FBUyxNQUFNLE1BQU0sRUFBRSxXQUFXLFFBQVE7QUFFM0csVUFBSSxFQUFFLFdBQVcsa0JBQWtCLHFCQUFxQjtBQUN2RCwyQkFBbUIsS0FBSyxTQUFTLGdCQUFnQixZQUFZLEVBQUUsV0FBVyxPQUFPLEtBQUssQ0FBQztBQUFBLE1BQ3hGO0FBRUEsYUFBTztBQUFBLElBQ1I7QUFFQSxRQUFJLFlBQVksV0FBVyxHQUFHO0FBQzdCLFlBQU0sTUFBTSxZQUFZLENBQUM7QUFDekIsWUFBTSxZQUFZLElBQUksV0FBVyxjQUFjLFFBQVE7QUFFdkQsWUFBTSxFQUFFLFFBQUFDLFFBQU8sSUFBSSxNQUFNLEtBQUssZUFBZTtBQUFBLFFBQzVDO0FBQUEsVUFDQyxTQUFTLFNBQVMsd0JBQXdCLGlDQUFpQyxJQUFJLFdBQVcsS0FBSztBQUFBLFVBQy9GLFFBQVE7QUFBQSxZQUNQLE1BQU0sUUFBUTtBQUFBLFlBQ2QsaUJBQWlCLENBQUM7QUFBQSxjQUNqQixVQUFVLElBQUksZUFBZSxTQUFTLHFCQUFxQiwrSkFBK0osU0FBUyxHQUFHLENBQUMsQ0FBQztBQUFBLGNBQ3hPLGVBQWUsTUFBTTtBQUNwQixzQkFBTSxTQUFTLEtBQUssZUFBZSxXQUFXLEVBQUUsVUFBVSxVQUFXLEdBQUcsZ0JBQWdCO0FBQ3hGLHVCQUFPLE9BQU8sS0FBSyxPQUFPO0FBQUEsY0FDM0I7QUFBQSxZQUNELENBQUM7QUFBQSxVQUNGO0FBQUEsVUFDQSxTQUFTO0FBQUEsWUFDUixFQUFFLE9BQU8sU0FBUyxpQkFBaUIsT0FBTyxHQUFHLEtBQUssTUFBTSxLQUFLO0FBQUEsWUFDN0QsRUFBRSxPQUFPLFNBQVMsZ0JBQWdCLGNBQWMsR0FBRyxLQUFLLE1BQU0sTUFBTTtBQUFBLFVBQ3JFO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFFQSxhQUFPQSxZQUFXLFNBQVksU0FBYUEsVUFBUyxDQUFDLElBQUksV0FBVyxFQUFFLElBQUksQ0FBQztBQUFBLElBQzVFO0FBRUEsVUFBTSxPQUFPLFlBQVksSUFBSSxPQUFLLEtBQUssU0FBUyxDQUFDLENBQUMsRUFBRSxFQUFFLEtBQUssSUFBSTtBQUMvRCxVQUFNLEVBQUUsT0FBTyxJQUFJLE1BQU0sS0FBSyxlQUFlO0FBQUEsTUFDNUM7QUFBQSxRQUNDLFNBQVMsU0FBUyw2QkFBNkIsa0NBQWtDLFlBQVksTUFBTTtBQUFBLFFBQ25HLFFBQVE7QUFBQSxVQUNQLE1BQU0sUUFBUTtBQUFBLFVBQ2QsaUJBQWlCLENBQUM7QUFBQSxZQUNqQixVQUFVLElBQUksZUFBZSxTQUFTLDBCQUEwQix3TEFBd0wsSUFBSSxDQUFDO0FBQUEsWUFDN1AsZUFBZSxDQUFDLFFBQVE7QUFDdkIsb0JBQU0sU0FBUyxLQUFLLGVBQWUsV0FBVyxFQUFFLFVBQVUsSUFBSSxNQUFNLEdBQUcsRUFBRSxHQUFHLGdCQUFnQjtBQUM1RixxQkFBTyxPQUFPLEtBQUssT0FBTztBQUFBLFlBQzNCO0FBQUEsVUFDRCxDQUFDO0FBQUEsUUFDRjtBQUFBLFFBQ0EsU0FBUztBQUFBLFVBQ1IsRUFBRSxPQUFPLFNBQVMsaUJBQWlCLE9BQU8sR0FBRyxLQUFLLE1BQU0sTUFBTTtBQUFBLFVBQzlELEVBQUUsT0FBTyxTQUFTLGtCQUFrQixjQUFjLEdBQUcsS0FBSyxNQUFNLE9BQU87QUFBQSxVQUN2RSxFQUFFLE9BQU8sU0FBUyxnQkFBZ0IsY0FBYyxHQUFHLEtBQUssTUFBTSxPQUFPO0FBQUEsUUFDdEU7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUVBLFFBQUksV0FBVyxRQUFXO0FBQ3pCLGFBQU87QUFBQSxJQUNSLFdBQVcsV0FBVyxPQUFPO0FBQzVCLGFBQU8sWUFBWSxJQUFJLE9BQUssRUFBRSxXQUFXLEVBQUU7QUFBQSxJQUM1QyxXQUFXLFdBQVcsUUFBUTtBQUM3QixhQUFPLENBQUM7QUFBQSxJQUNUO0FBR0EsYUFBUyxtQkFBbUIsS0FBaUQ7QUFDNUUsYUFBTyxPQUFRLElBQXlCLFdBQVc7QUFBQSxJQUNwRDtBQUVBLFVBQU0sUUFBUSxJQUFJLGdCQUFnQjtBQUNsQyxVQUFNLFNBQVMsTUFBTSxJQUFJLEtBQUssbUJBQW1CLGdCQUEwRCxFQUFFLGVBQWUsTUFBTSxDQUFDLENBQUM7QUFDcEksV0FBTyxnQkFBZ0I7QUFDdkIsV0FBTyxRQUFRLFlBQVksSUFBSSxDQUFDLEVBQUUsWUFBWSxXQUFXLE1BQU07QUFDOUQsWUFBTSxVQUE4QixDQUFDO0FBQ3JDLFVBQUksV0FBVyxjQUFjLFFBQVE7QUFDcEMsY0FBTSxTQUFTLFdBQVcsYUFBYTtBQUN2QyxnQkFBUSxLQUFLO0FBQUEsVUFDWixXQUFXO0FBQUEsVUFDWCxTQUFTO0FBQUEsVUFDVCxRQUFRLE1BQU0sS0FBSyxlQUFlLFdBQVcsRUFBRSxVQUFVLE9BQU8sS0FBSyxTQUFTLEVBQUUsV0FBVyxPQUFPLE1BQU0sRUFBRSxDQUFDO0FBQUEsUUFDNUcsQ0FBQztBQUFBLE1BQ0Y7QUFFQSxhQUFPO0FBQUEsUUFDTixNQUFNO0FBQUEsUUFDTixPQUFPLFdBQVc7QUFBQSxRQUNsQixhQUFhLFdBQVc7QUFBQSxRQUN4QixhQUFhLFdBQVcsa0JBQWtCLHNCQUN2QyxXQUFXLE9BQU8sUUFDakIsV0FBVyxjQUFjLFNBQVMsS0FBSyxjQUFjLFlBQVksV0FBVyxhQUFhLE9BQU8sR0FBRyxJQUFJO0FBQUEsUUFDM0csUUFBUTtBQUFBLFFBQ1I7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDO0FBQ0QsV0FBTyxjQUFjO0FBQ3JCLFdBQU8saUJBQWlCO0FBRXhCLFVBQU0sSUFBSSxPQUFPLHVCQUF1QixPQUFLO0FBQzVDLFVBQUksbUJBQW1CLEVBQUUsTUFBTSxHQUFHO0FBQ2pDLFVBQUUsT0FBTyxPQUFPO0FBQUEsTUFDakI7QUFBQSxJQUNELENBQUMsQ0FBQztBQUVGLFdBQU8sSUFBSSxRQUE4QixhQUFXO0FBQ25ELFlBQU0sSUFBSSxPQUFPLFlBQVksTUFBTTtBQUNsQyxnQkFBUSxPQUFPLGNBQWMsSUFBSSxVQUFRLEtBQUssV0FBVyxDQUFDO0FBQzFELGVBQU8sS0FBSztBQUFBLE1BQ2IsQ0FBQyxDQUFDO0FBQ0YsWUFBTSxJQUFJLE9BQU8sVUFBVSxNQUFNO0FBQ2hDLGdCQUFRLE1BQVM7QUFBQSxNQUNsQixDQUFDLENBQUM7QUFDRixhQUFPLEtBQUs7QUFBQSxJQUNiLENBQUMsRUFBRSxRQUFRLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFBQSxFQUNqQztBQUFBLEVBRUEsTUFBYyxtQ0FBbUMsY0FBdUMsTUFBK0Q7QUFDdEosVUFBTSxVQUEwQyxDQUFDO0FBQ2pELFVBQU0sU0FBeUMsQ0FBQztBQUNoRCxlQUFXLENBQUMsYUFBYSxRQUFRLEtBQUssS0FBSyxTQUFTLEdBQUc7QUFDdEQsVUFBSSxTQUFTLE9BQU8sU0FBUyxrQkFBa0IsU0FBUyxNQUFNLFVBQVU7QUFDdkUsZ0JBQVEsWUFBWSxFQUFFLElBQUk7QUFBQSxNQUMzQixPQUFPO0FBQ04sZUFBTyxZQUFZLEVBQUUsSUFBSTtBQUFBLE1BQzFCO0FBQUEsSUFDRDtBQUVBLGlCQUFhLGFBQWEsTUFBTTtBQUNoQyxVQUFNLGFBQWEsV0FBVyxPQUFPO0FBQ3JDLFNBQUssbUJBQW1CLEtBQUs7QUFBQSxFQUM5QjtBQUFBLEVBRUEsTUFBYywwQkFBMEIsVUFBNEIsWUFBaUMsUUFBeUIsd0JBQWtDO0FBQy9KLFFBQUksQ0FBQyxXQUFXLHFCQUFxQjtBQUNwQyxhQUFPO0FBQUEsSUFDUjtBQUVBLFVBQU0sRUFBRSxTQUFTLFFBQVEsT0FBTyxJQUFJLFdBQVc7QUFDL0MsVUFBTSxlQUFlLEtBQUssK0JBQStCLE1BQU07QUFDL0QsVUFBTSxDQUFDLGtCQUFrQixnQkFBZ0IsSUFBSSxNQUFNLFFBQVEsSUFBSTtBQUFBLE1BQzlELGFBQWEsT0FBTztBQUFBLE1BQ3BCLFNBQVMsb0JBQW9CLFlBQVksTUFBTTtBQUFBLElBQ2hELENBQUM7QUFHRCxVQUFNLE9BQU8sZ0NBQWdDLE1BQU0sZ0JBQWdCLGFBQWEsZ0JBQWdCLENBQUM7QUFDakcsZUFBVyxlQUFlLEtBQUssV0FBVyxHQUFHO0FBQzVDLFVBQUksaUJBQWlCLGVBQWUsWUFBWSxFQUFFLEdBQUc7QUFDcEQsYUFBSyxRQUFRLGFBQWEsaUJBQWlCLFlBQVksRUFBRSxDQUFDO0FBQUEsTUFDM0Q7QUFBQSxJQUNEO0FBR0EsUUFBSSx3QkFBd0I7QUFDM0IsWUFBTSxhQUFhLE1BQU0sS0FBSyxLQUFLLFdBQVcsQ0FBQztBQUMvQyxVQUFJLFdBQVcsU0FBUyxHQUFHO0FBQzFCLGNBQU0sSUFBSSw2QkFBNkIsV0FBVztBQUFBLE1BQ25EO0FBQUEsSUFDRDtBQUVBLFVBQU0sS0FBSyw4QkFBOEIsdUJBQXVCLFFBQVEsTUFBTSxTQUFTLFFBQVcsTUFBTTtBQUV4RyxVQUFNLEtBQUssbUNBQW1DLGNBQWMsSUFBSTtBQUdoRSxVQUFNLFdBQVcsTUFBTSxLQUFLLDhCQUE4QixhQUFhLFFBQVEsSUFBSTtBQUNuRixXQUFPLGdCQUFnQixlQUFlLFFBQVE7QUFBQSxFQUMvQztBQUFBLEVBRVEsb0JBQW9CLFlBQXFDLGtCQUEwRDtBQUMxSCxXQUFPLENBQUMsdUNBQXVDLGdCQUFnQixLQUMzRCxXQUFXLGVBQWUsd0JBQXdCO0FBQUEsRUFDdkQ7QUFBQSxFQUVBLE1BQWEsa0JBQWtCLE1BQStFO0FBQzdHLFVBQU0sRUFBRSxlQUFlLGVBQWUsYUFBYSxRQUFRLE1BQU0sSUFBSTtBQUNyRSxRQUFJLGFBQWEsS0FBSyxhQUFhLElBQUksRUFBRSxLQUFLLE9BQUssRUFBRSxPQUFPLGNBQWMsRUFBRTtBQUM1RSxRQUFJLGNBQWMsQ0FBQyxLQUFLLG9CQUFvQixZQUFZLEtBQUssK0JBQStCLElBQUksQ0FBQyxHQUFHO0FBQ25HLFlBQU0sSUFBSSxNQUFNLGtCQUFrQixjQUFjLEVBQUUsZ0RBQWdEO0FBQUEsSUFDbkc7QUFDQSxRQUFJLFlBQVksTUFBTTtBQUNyQixZQUFNLFdBQVcsS0FBSyxLQUFLO0FBQzNCLG1CQUFhLEtBQUssYUFBYSxJQUFJLEVBQUUsS0FBSyxPQUFLLEVBQUUsT0FBTyxjQUFjLEVBQUU7QUFBQSxJQUN6RTtBQUNBLFFBQUksY0FBYyxDQUFDLEtBQUssb0JBQW9CLFlBQVksS0FBSywrQkFBK0IsSUFBSSxDQUFDLEdBQUc7QUFDbkcsWUFBTSxJQUFJLE1BQU0sa0JBQWtCLGNBQWMsRUFBRSxnREFBZ0Q7QUFBQSxJQUNuRztBQUVBLFVBQU0sYUFBYSxZQUFZLGtCQUFrQixJQUFJLEVBQUUsS0FBSyxPQUFLLEVBQUUsT0FBTyxjQUFjLEVBQUU7QUFDMUYsUUFBSSxDQUFDLGNBQWMsQ0FBQyxZQUFZO0FBQy9CLFlBQU0sSUFBSSxNQUFNLDBDQUEwQyxjQUFjLEVBQUUsUUFBUSxjQUFjLEVBQUUsRUFBRTtBQUFBLElBQ3JHO0FBRUEsVUFBTSxXQUFXLEtBQUssV0FBVyxJQUFJLEVBQUUsS0FBSyxPQUFLLEVBQUUsU0FBUyxZQUFZLFVBQVUsQ0FBQztBQUNuRixRQUFJLENBQUMsVUFBVTtBQUNkLFlBQU0sSUFBSSxNQUFNLGtEQUFrRDtBQUFBLElBQ25FO0FBRUEsVUFBTSxVQUFVLE1BQU0sS0FBSyxZQUFZLFlBQVksWUFBWSxJQUFJO0FBQ25FLGlCQUFhLGFBQWEsSUFBSSxXQUFXLElBQUksRUFBRSxHQUFHLFdBQVcsQ0FBQztBQUM5RCxRQUFJLENBQUMsU0FBUztBQUNiLGFBQU87QUFBQSxJQUNSO0FBRUEsUUFBSSxTQUFzQyxXQUFXO0FBQ3JELFFBQUksV0FBVyxvQkFBb0I7QUFDbEMsZUFBUyxNQUFNLFdBQVcsbUJBQW1CLFVBQVU7QUFDdkQsVUFBSSxDQUFDLFFBQVE7QUFDWixlQUFPO0FBQUEsTUFDUjtBQUFBLElBQ0Q7QUFFQSxRQUFJO0FBQ0gsZUFBUyxNQUFNLEtBQUssMEJBQTBCLFVBQVUsWUFBWSxRQUFRLEtBQUssc0JBQXNCO0FBRXZHLFVBQUksV0FBVyxXQUFXLE9BQU87QUFDaEMsaUJBQVMsTUFBTSxLQUFLLHNCQUFzQixlQUFlLGNBQVksU0FBUyxJQUFJLG9CQUFvQixFQUFFLFVBQVUsWUFBWSxNQUFPLENBQUM7QUFBQSxNQUN2STtBQUVBLGVBQVMsTUFBTSxLQUFLLG1CQUFtQix5QkFBeUIsWUFBWSxRQUFRLFdBQVcsbUJBQW1CLFFBQVcsV0FBVyxZQUFZO0FBQUEsSUFDckosU0FBUyxHQUFHO0FBQ1gsVUFBSSxhQUFhLDhCQUE4QjtBQUM5QyxjQUFNO0FBQUEsTUFDUDtBQUVBLFdBQUsscUJBQXFCLE9BQU87QUFBQSxRQUNoQyxVQUFVLFNBQVM7QUFBQSxRQUNuQixTQUFTLFNBQVMsbUJBQW1CLDJCQUEyQixXQUFXLE9BQU8sT0FBTyxDQUFDLENBQUM7QUFBQSxRQUMzRixTQUFTO0FBQUEsVUFDUixTQUFTLFdBQVcsY0FBYyxVQUFVO0FBQUEsWUFDM0M7QUFBQSxjQUNDLElBQUk7QUFBQSxjQUNKLE9BQU87QUFBQSxjQUNQLFNBQVM7QUFBQSxjQUNULFNBQVM7QUFBQSxjQUNULE9BQU8sU0FBUyw4QkFBOEIsb0JBQW9CO0FBQUEsY0FDbEUsS0FBSyxNQUFNLEtBQUssZUFBZSxXQUFXO0FBQUEsZ0JBQ3pDLFVBQVUsV0FBVyxhQUFjO0FBQUEsZ0JBQ25DLFNBQVMsRUFBRSxXQUFXLFdBQVcsY0FBYyxRQUFRLE1BQU07QUFBQSxjQUM5RCxDQUFDO0FBQUEsWUFDRjtBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBQ0Q7QUFBQSxJQUNEO0FBRUEsV0FBTyxLQUFLLHNCQUFzQjtBQUFBLE1BQ2pDO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBLEtBQUs7QUFBQSxNQUNMLEtBQUs7QUFBQSxJQUNOO0FBQUEsRUFDRDtBQUNEO0FBL2hCYSxjQUFOO0FBQUEsRUEwQ0o7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBckRVOyIsCiAgIm5hbWVzIjogWyJkZWxlZ2F0ZXMiLCAiY3VycmVudENvbGxlY3Rpb25zIiwgInJlc3VsdCJdCn0K
