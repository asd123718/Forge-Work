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
import { renderAsPlaintext } from "../../../../../base/browser/markdownRenderer.js";
import { assertNever } from "../../../../../base/common/assert.js";
import { RunOnceScheduler, timeout } from "../../../../../base/common/async.js";
import { encodeBase64 } from "../../../../../base/common/buffer.js";
import { CancellationToken, CancellationTokenSource } from "../../../../../base/common/cancellation.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { arrayEqualsC } from "../../../../../base/common/equals.js";
import { toErrorMessage } from "../../../../../base/common/errorMessage.js";
import { CancellationError, isCancellationError } from "../../../../../base/common/errors.js";
import { Emitter, Event } from "../../../../../base/common/event.js";
import { createMarkdownCommandLink, MarkdownString } from "../../../../../base/common/htmlContent.js";
import { Iterable } from "../../../../../base/common/iterator.js";
import { combinedDisposable, Disposable, DisposableStore, toDisposable } from "../../../../../base/common/lifecycle.js";
import { getMediaMime } from "../../../../../base/common/mime.js";
import { derived, derivedOpts, observableFromEventOpts, ObservableSet, observableSignal, transaction } from "../../../../../base/common/observable.js";
import Severity from "../../../../../base/common/severity.js";
import { StopWatch } from "../../../../../base/common/stopwatch.js";
import { ThemeIcon } from "../../../../../base/common/themables.js";
import { URI } from "../../../../../base/common/uri.js";
import { localize, localize2 } from "../../../../../nls.js";
import { IAccessibilityService } from "../../../../../platform/accessibility/common/accessibility.js";
import { AccessibilitySignal, IAccessibilitySignalService } from "../../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js";
import { ICommandService } from "../../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../../platform/contextkey/common/contextkey.js";
import { IDialogService } from "../../../../../platform/dialogs/common/dialogs.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import * as JSONContributionRegistry from "../../../../../platform/jsonschemas/common/jsonContributionRegistry.js";
import { ILogService } from "../../../../../platform/log/common/log.js";
import { observableConfigValue } from "../../../../../platform/observable/common/platformObservableUtils.js";
import { Registry } from "../../../../../platform/registry/common/platform.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../../../platform/telemetry/common/telemetry.js";
import { IExtensionService } from "../../../../services/extensions/common/extensions.js";
import { ChatContextKeys } from "../../common/actions/chatContextKeys.js";
import { toToolSetVariableEntry, toToolVariableEntry } from "../../common/attachments/chatVariableEntries.js";
import { IChatService, IChatToolInvocation, ToolConfirmKind } from "../../common/chatService/chatService.js";
import { ChatConfiguration, isAutoApproveLevel, isAutopilotLevel } from "../../common/constants.js";
import { localChatSessionType } from "../../common/chatSessionsService.js";
import { ChatToolInvocation } from "../../common/model/chatProgressTypes/chatToolInvocation.js";
import { chatSessionResourceToId, getChatSessionType } from "../../common/model/chatUri.js";
import { HookType } from "../../common/promptSyntax/hookTypes.js";
import { CopilotChatSettingId, CopilotToolId } from "../../common/tools/copilotToolIds.js";
import { ILanguageModelToolsConfirmationService } from "../../common/tools/languageModelToolsConfirmationService.js";
import { TerminalToolId } from "../../common/tools/terminalToolIds.js";
import { createToolSchemaUri, isToolSet, SpecedToolAliases, stringifyPromptTsxPart, ToolAndToolSetEnablementMap, ToolDataSource, ToolInvocationPresentation, toolMatchesModel, ToolSet, ToolSetForModel, VSCodeToolReference } from "../../common/tools/languageModelToolsService.js";
import { IToolResultCompressor } from "../../common/tools/toolResultCompressor.js";
import { getToolConfirmationAlert } from "../accessibility/chatAccessibilityProvider.js";
import { IChatWidgetService } from "../chat.js";
import { IChatToolRiskAssessmentService, ToolRiskLevel } from "./chatToolRiskAssessmentService.js";
const jsonSchemaRegistry = Registry.as(JSONContributionRegistry.Extensions.JSONContribution);
var AutoApproveStorageKeys = /* @__PURE__ */ ((AutoApproveStorageKeys2) => {
  AutoApproveStorageKeys2["GlobalAutoApproveOptIn"] = "chat.tools.global.autoApprove.optIn";
  return AutoApproveStorageKeys2;
})(AutoApproveStorageKeys || {});
const SkipAutoApproveConfirmationKey = "vscode.chat.tools.global.autoApprove.testMode";
const autoApproveAllReason = "auto-approve-all";
const toolIdsThatCannotBeAutoApproved = /* @__PURE__ */ new Set([
  "vscode_get_confirmation_with_options",
  "vscode_get_modified_files_confirmation"
]);
const fetchWebPageToolIds = /* @__PURE__ */ new Set([
  "copilot_fetchWebPage",
  "vscode_fetchWebPage_internal"
]);
const globalAutoApproveDescription = localize2(
  {
    key: "autoApprove3.markdown",
    comment: [
      "{Locked='](https://github.com/features/codespaces)'}",
      "{Locked='](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers)'}",
      "{Locked='](https://code.visualstudio.com/docs/agents/run/security)'}",
      "{Locked='**'}",
      "{Locked='[`chat.autoReply`](command:workbench.action.openSettings?%5B%22chat.autoReply%22%5D)'}"
    ]
  },
  'Global auto approve also known as "YOLO mode" disables manual approval completely for _all tools in all workspaces_, allowing the agent to act fully autonomously. This is extremely dangerous and is *never* recommended, even containerized environments like [Codespaces](https://github.com/features/codespaces) and [Dev Containers](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers) have user keys forwarded into the container that could be compromised.\n\n**This feature disables [critical security protections](https://code.visualstudio.com/docs/agents/run/security) and makes it much easier for an attacker to compromise the machine.**\n\nNote: This setting only controls tool approval and does not prevent the agent from asking questions. To automatically answer agent questions, use the [`chat.autoReply`](command:workbench.action.openSettings?%5B%22chat.autoReply%22%5D) setting.'
);
let LanguageModelToolsService = class extends Disposable {
  constructor(_instantiationService, _extensionService, _contextKeyService, _chatService, _dialogService, _telemetryService, _logService, _configurationService, _accessibilityService, _accessibilitySignalService, _storageService, _confirmationService, _commandService, _chatWidgetService, _toolResultCompressor, _riskAssessmentService) {
    super();
    this._instantiationService = _instantiationService;
    this._extensionService = _extensionService;
    this._contextKeyService = _contextKeyService;
    this._chatService = _chatService;
    this._dialogService = _dialogService;
    this._telemetryService = _telemetryService;
    this._logService = _logService;
    this._configurationService = _configurationService;
    this._accessibilityService = _accessibilityService;
    this._accessibilitySignalService = _accessibilitySignalService;
    this._storageService = _storageService;
    this._confirmationService = _confirmationService;
    this._commandService = _commandService;
    this._chatWidgetService = _chatWidgetService;
    this._toolResultCompressor = _toolResultCompressor;
    this._riskAssessmentService = _riskAssessmentService;
    this._onDidChangeTools = this._register(new Emitter());
    this.onDidChangeTools = this._onDidChangeTools.event;
    this._onDidPrepareToolCallBecomeUnresponsive = this._register(new Emitter());
    this.onDidPrepareToolCallBecomeUnresponsive = this._onDidPrepareToolCallBecomeUnresponsive.event;
    this._onDidInvokeTool = this._register(new Emitter());
    this.onDidInvokeTool = this._onDidInvokeTool.event;
    /** Throttle tools updates because it sends all tools and runs on context key updates */
    this._onDidChangeToolsScheduler = this._register(new RunOnceScheduler(() => this._onDidChangeTools.fire(), 750));
    this._tools = /* @__PURE__ */ new Map();
    this._toolContextKeys = /* @__PURE__ */ new Set();
    this._callsByRequestId = /* @__PURE__ */ new Map();
    /** Pending tool calls in the streaming phase, keyed by toolCallId */
    this._pendingToolCalls = /* @__PURE__ */ new Map();
    this._toolSets = new ObservableSet();
    this.toolSets = derived(this, (reader) => {
      const allToolSets = Array.from(this._toolSets.observable.read(reader));
      return allToolSets.filter((toolSet) => this.isPermitted(toolSet, reader));
    });
    this.allToolsIncludingDisableObs = observableFromEventOpts(
      { equalsFn: arrayEqualsC() },
      this.onDidChangeTools,
      () => Array.from(this.getAllToolsIncludingDisabled())
    );
    this.toolsWithFullReferenceName = derived((reader) => {
      const result = [];
      const coveredByToolSets = /* @__PURE__ */ new Set();
      for (const toolSet of this.toolSets.read(reader)) {
        if (toolSet.source.type !== "user") {
          result.push([toolSet, getToolSetFullReferenceName(toolSet)]);
          for (const tool of toolSet.getTools()) {
            result.push([tool, getToolFullReferenceName(tool, toolSet)]);
            coveredByToolSets.add(tool);
          }
        }
      }
      for (const tool of this.allToolsIncludingDisableObs.read(reader)) {
        if (tool.when && !this._contextKeyService.contextMatchesRules(tool.when)) {
          continue;
        }
        if (tool.canBeReferencedInPrompt && !coveredByToolSets.has(tool) && this.isPermitted(tool, reader)) {
          result.push([tool, getToolFullReferenceName(tool)]);
        }
      }
      return result;
    });
    this._isAgentModeEnabled = observableConfigValue(ChatConfiguration.AgentEnabled, true, this._configurationService);
    this._register(this._contextKeyService.onDidChangeContext((e) => {
      if (e.affectsSome(this._toolContextKeys)) {
        this._onDidChangeToolsScheduler.schedule();
      }
    }));
    this._register(this._configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(ChatConfiguration.ExtensionToolsEnabled) || e.affectsConfiguration(ChatConfiguration.AgentEnabled) || e.affectsConfiguration(CopilotChatSettingId.Gpt55ReadFileToolEnabled)) {
        this._onDidChangeToolsScheduler.schedule();
      }
    }));
    this._register(Event.runAndSubscribe(this._configurationService.onDidChangeConfiguration, (e) => {
      if (!e || e.affectsConfiguration(ChatConfiguration.GlobalAutoApprove)) {
        if (this._configurationService.getValue(ChatConfiguration.GlobalAutoApprove) !== true) {
          this._storageService.remove("chat.tools.global.autoApprove.optIn" /* GlobalAutoApproveOptIn */, StorageScope.APPLICATION);
        }
      }
    }));
    this._ctxToolsCount = ChatContextKeys.Tools.toolsCount.bindTo(_contextKeyService);
    this.vscodeToolSet = this._register(this.createToolSet(
      ToolDataSource.Internal,
      "vscode",
      VSCodeToolReference.vscode,
      {
        icon: ThemeIcon.fromId(Codicon.vscode.id),
        description: localize("copilot.toolSet.vscode.description", "Use VS Code features"),
        deprecated: true
      }
    ));
    this.executeToolSet = this._register(this.createToolSet(
      ToolDataSource.Internal,
      "execute",
      SpecedToolAliases.execute,
      {
        icon: ThemeIcon.fromId(Codicon.terminal.id),
        description: localize("copilot.toolSet.execute.description", "Execute code and applications on your machine"),
        deprecated: true
      }
    ));
    this.readToolSet = this._register(this.createToolSet(
      ToolDataSource.Internal,
      "read",
      SpecedToolAliases.read,
      {
        icon: ThemeIcon.fromId(Codicon.book.id),
        description: localize("copilot.toolSet.read.description", "Read files in your workspace"),
        deprecated: true
      }
    ));
    this.agentToolSet = this._register(this.createToolSet(
      ToolDataSource.Internal,
      "agent",
      SpecedToolAliases.agent,
      {
        icon: ThemeIcon.fromId(Codicon.agent.id),
        description: localize("copilot.toolSet.agent.description", "Delegate tasks to other agents"),
        deprecated: true
      }
    ));
  }
  isToolEnabledForModel(toolData, model) {
    if (!toolMatchesModel(toolData, model)) {
      return false;
    }
    if (toolData.id === CopilotToolId.ReadFile && model?.family.startsWith("gpt-5.5") && this._configurationService.getValue(CopilotChatSettingId.Gpt55ReadFileToolEnabled) === false) {
      return false;
    }
    return true;
  }
  /**
   * Returns if the given tool or toolset is permitted in the current context.
   * When agent mode is enabled, all tools are permitted (no restriction)
   * When agent mode is disabled only a subset of read-only tools are permitted in agentic-loop contexts.
   */
  isPermitted(toolOrToolSet, reader) {
    const agentModeEnabled = this._isAgentModeEnabled.read(reader);
    if (agentModeEnabled !== false) {
      return true;
    }
    if (!isToolSet(toolOrToolSet) && toolOrToolSet.canBeReferencedInPrompt === false && toolOrToolSet.source.type === "internal") {
      return true;
    }
    const permittedInternalToolSetIds = [SpecedToolAliases.read, SpecedToolAliases.search, SpecedToolAliases.web];
    if (isToolSet(toolOrToolSet)) {
      const permitted = toolOrToolSet.source.type === "internal" && permittedInternalToolSetIds.includes(toolOrToolSet.referenceName);
      this._logService.trace(`LanguageModelToolsService#isPermitted: ToolSet ${toolOrToolSet.id} (${toolOrToolSet.referenceName}) permitted=${permitted}`);
      return permitted;
    }
    for (const toolSet of this._toolSets) {
      if (toolSet.source.type === "internal" && permittedInternalToolSetIds.includes(toolSet.referenceName)) {
        for (const memberTool of toolSet.getTools()) {
          if (memberTool.id === toolOrToolSet.id) {
            this._logService.trace(`LanguageModelToolsService#isPermitted: Tool ${toolOrToolSet.id} (${toolOrToolSet.toolReferenceName}) permitted=true (member of ${toolSet.referenceName})`);
            return true;
          }
        }
      }
    }
    if (toolOrToolSet.id === "vscode_fetchWebPage_internal" && permittedInternalToolSetIds.includes(SpecedToolAliases.web)) {
      this._logService.trace(`LanguageModelToolsService#isPermitted: Tool ${toolOrToolSet.id} (${toolOrToolSet.toolReferenceName}) permitted=true (special case)`);
      return true;
    }
    this._logService.trace(`LanguageModelToolsService#isPermitted: Tool ${toolOrToolSet.id} (${toolOrToolSet.toolReferenceName}) permitted=false`);
    return false;
  }
  dispose() {
    super.dispose();
    this._callsByRequestId.forEach((calls) => calls.forEach((call) => call.store.dispose()));
    this._pendingToolCalls.clear();
    this._ctxToolsCount.reset();
  }
  registerToolData(toolData) {
    if (this._tools.has(toolData.id)) {
      throw new Error(`Tool "${toolData.id}" is already registered.`);
    }
    this._tools.set(toolData.id, { data: toolData });
    this._ctxToolsCount.set(this._tools.size);
    if (!this._onDidChangeToolsScheduler.isScheduled()) {
      this._onDidChangeToolsScheduler.schedule();
    }
    toolData.when?.keys().forEach((key) => this._toolContextKeys.add(key));
    let store;
    if (toolData.inputSchema) {
      store = new DisposableStore();
      const schemaUrl = createToolSchemaUri(toolData.id).toString();
      jsonSchemaRegistry.registerSchema(schemaUrl, toolData.inputSchema, store);
      store.add(jsonSchemaRegistry.registerSchemaAssociation(schemaUrl, `/lm/tool/${toolData.id}/tool_input.json`));
    }
    return toDisposable(() => {
      store?.dispose();
      this._tools.delete(toolData.id);
      this._ctxToolsCount.set(this._tools.size);
      this._refreshAllToolContextKeys();
      if (!this._onDidChangeToolsScheduler.isScheduled()) {
        this._onDidChangeToolsScheduler.schedule();
      }
    });
  }
  flushToolUpdates() {
    this._onDidChangeToolsScheduler.flush();
  }
  _refreshAllToolContextKeys() {
    this._toolContextKeys.clear();
    for (const tool of this._tools.values()) {
      tool.data.when?.keys().forEach((key) => this._toolContextKeys.add(key));
    }
  }
  registerToolImplementation(id, tool) {
    const entry = this._tools.get(id);
    if (!entry) {
      throw new Error(`Tool "${id}" was not contributed.`);
    }
    if (entry.impl) {
      throw new Error(`Tool "${id}" already has an implementation.`);
    }
    entry.impl = tool;
    return toDisposable(() => {
      entry.impl = void 0;
    });
  }
  registerTool(toolData, tool) {
    return combinedDisposable(
      this.registerToolData(toolData),
      this.registerToolImplementation(toolData.id, tool)
    );
  }
  getTools(model) {
    const toolDatas = Iterable.map(this._tools.values(), (i) => i.data);
    const extensionToolsEnabled = this._configurationService.getValue(ChatConfiguration.ExtensionToolsEnabled);
    return Iterable.filter(
      toolDatas,
      (toolData) => {
        const satisfiesWhenClause = !toolData.when || this._contextKeyService.contextMatchesRules(toolData.when);
        const satisfiesExternalToolCheck = toolData.source.type !== "extension" || !!extensionToolsEnabled;
        const satisfiesPermittedCheck = this.isPermitted(toolData);
        const satisfiesModelFilter = this.isToolEnabledForModel(toolData, model);
        return satisfiesWhenClause && satisfiesExternalToolCheck && satisfiesPermittedCheck && satisfiesModelFilter;
      }
    );
  }
  observeTools(model) {
    const meta = derived((reader) => {
      const signal = observableSignal("observeToolsContext");
      const trigger = () => transaction((tx) => signal.trigger(tx));
      reader.store.add(this.onDidChangeTools(trigger));
      return signal;
    });
    return derivedOpts({ equalsFn: arrayEqualsC() }, (reader) => {
      meta.read(reader).read(reader);
      return Array.from(this.getTools(model));
    });
  }
  getAllToolsIncludingDisabled() {
    const toolDatas = Iterable.map(this._tools.values(), (i) => i.data);
    const extensionToolsEnabled = this._configurationService.getValue(ChatConfiguration.ExtensionToolsEnabled);
    return Iterable.filter(
      toolDatas,
      (toolData) => {
        const satisfiesExternalToolCheck = toolData.source.type !== "extension" || !!extensionToolsEnabled;
        const satisfiesPermittedCheck = this.isPermitted(toolData);
        return satisfiesExternalToolCheck && satisfiesPermittedCheck;
      }
    );
  }
  getTool(id) {
    return this._tools.get(id)?.data;
  }
  getToolByName(name) {
    for (const tool of this.getAllToolsIncludingDisabled()) {
      if (tool.toolReferenceName === name) {
        return tool;
      }
    }
    return void 0;
  }
  _handlePreToolUseDenial(dto, hookResult, toolData, pendingInvocation, request) {
    const hookReason = hookResult.permissionDecisionReason ?? localize("hookDeniedNoReason", "Hook denied tool execution");
    const reason = localize("deniedByPreToolUseHook", "Denied by {0} hook: {1}", HookType.PreToolUse, hookReason);
    this._logService.debug(`[LanguageModelToolsService#invokeTool] Tool ${dto.toolId} denied by preToolUse hook: ${hookReason}`);
    if (toolData) {
      if (pendingInvocation) {
        pendingInvocation.presentation = ToolInvocationPresentation.Hidden;
        pendingInvocation.cancelFromStreaming(ToolConfirmKind.Denied, reason);
      } else if (request) {
        const cancelledInvocation = ChatToolInvocation.createCancelled(
          { toolCallId: dto.callId, toolId: dto.toolId, toolData, subagentInvocationId: dto.subAgentInvocationId, chatRequestId: dto.chatRequestId },
          dto.parameters,
          ToolConfirmKind.Denied,
          reason
        );
        cancelledInvocation.presentation = ToolInvocationPresentation.Hidden;
        this._chatService.appendProgress(request, cancelledInvocation);
      }
    }
    return {
      content: [{ kind: "text", value: `Tool execution denied: ${hookReason}` }],
      toolResultError: hookReason
    };
  }
  /**
   * Validate updatedInput from a preToolUse hook against the tool's input schema
   * using the json.validate command from the JSON extension.
   * @returns An error message string if validation fails, or undefined if valid.
   */
  async _validateUpdatedInput(toolId, toolData, updatedInput) {
    if (!toolData?.inputSchema) {
      return void 0;
    }
    try {
      const schemaUri = createToolSchemaUri(toolId);
      const inputJson = JSON.stringify(updatedInput);
      const diagnostics = await this._commandService.executeCommand("json.validate", schemaUri, inputJson) || [];
      if (diagnostics.length > 0) {
        return diagnostics.map((d) => d.message).join("; ");
      }
    } catch (e) {
      this._logService.debug(`[LanguageModelToolsService#_validateUpdatedInput] json.validate command failed, skipping validation: ${toErrorMessage(e)}`);
    }
    return void 0;
  }
  async invokeTool(dto, countTokens, token) {
    this._logService.trace(`[LanguageModelToolsService#invokeTool] Invoking tool ${dto.toolId} with parameters ${JSON.stringify(dto.parameters)}`);
    const toolData = this._tools.get(dto.toolId)?.data;
    let model;
    let request;
    if (dto.context?.sessionResource) {
      model = this._chatService.getSession(dto.context.sessionResource);
      request = model?.getRequests().at(-1);
      if (request?.response?.isCanceled || request?.response?.isComplete) {
        this._logService.debug(`[LanguageModelToolsService#invokeTool] Ignoring tool ${dto.toolId} for cancelled/complete request ${request.id}`);
        throw new CancellationError();
      }
      if (model?.workingDirectory && !dto.context.workingDirectory) {
        dto = { ...dto, context: { ...dto.context, workingDirectory: model.workingDirectory } };
      }
    }
    let pendingToolCallKey;
    let toolInvocation;
    if (this._pendingToolCalls.has(dto.callId)) {
      pendingToolCallKey = dto.callId;
      toolInvocation = this._pendingToolCalls.get(dto.callId);
    } else if (dto.chatStreamToolCallId && this._pendingToolCalls.has(dto.chatStreamToolCallId)) {
      pendingToolCallKey = dto.chatStreamToolCallId;
      toolInvocation = this._pendingToolCalls.get(dto.chatStreamToolCallId);
    }
    let requestId;
    let store;
    if (dto.context && request) {
      requestId = request.id;
      store = new DisposableStore();
      if (!this._callsByRequestId.has(requestId)) {
        this._callsByRequestId.set(requestId, []);
      }
      const trackedCall = { store };
      this._callsByRequestId.get(requestId).push(trackedCall);
      const source = new CancellationTokenSource();
      store.add(toDisposable(() => {
        source.dispose(true);
      }));
      store.add(token.onCancellationRequested((() => {
        IChatToolInvocation.confirmWith(toolInvocation, { type: ToolConfirmKind.Denied });
        source.cancel();
      })));
      store.add(source.token.onCancellationRequested(() => {
        IChatToolInvocation.confirmWith(toolInvocation, { type: ToolConfirmKind.Denied });
      }));
      token = source.token;
    }
    const preToolUseHookResult = dto.preToolUseResult;
    if (preToolUseHookResult?.permissionDecision === "deny") {
      const denialResult = this._handlePreToolUseDenial(dto, preToolUseHookResult, toolData, toolInvocation, request);
      if (pendingToolCallKey) {
        this._pendingToolCalls.delete(pendingToolCallKey);
      }
      return denialResult;
    }
    if (preToolUseHookResult?.updatedInput) {
      const validationError = await this._validateUpdatedInput(dto.toolId, toolData, preToolUseHookResult.updatedInput);
      if (validationError) {
        this._logService.warn(`[LanguageModelToolsService#invokeTool] Tool ${dto.toolId} updatedInput from preToolUse hook failed schema validation: ${validationError}`);
      } else {
        this._logService.debug(`[LanguageModelToolsService#invokeTool] Tool ${dto.toolId} input modified by preToolUse hook`);
        dto.parameters = preToolUseHookResult.updatedInput;
      }
    }
    this._onDidInvokeTool.fire({
      toolId: dto.toolId,
      sessionResource: dto.context?.sessionResource,
      requestId: dto.chatRequestId,
      subagentInvocationId: dto.subAgentInvocationId
    });
    let tool = this._tools.get(dto.toolId);
    if (!tool) {
      throw new Error(`Tool ${dto.toolId} was not contributed`);
    }
    if (!tool.impl) {
      await this._extensionService.activateByEvent(`onLanguageModelTool:${dto.toolId}`);
      tool = this._tools.get(dto.toolId);
      if (!tool?.impl) {
        throw new Error(`Tool ${dto.toolId} does not have an implementation registered.`);
      }
    }
    const hadPendingInvocation = !!toolInvocation;
    if (hadPendingInvocation && pendingToolCallKey) {
      this._pendingToolCalls.delete(pendingToolCallKey);
    }
    let toolResult;
    let prepareTimeWatch;
    let invocationTimeWatch;
    let preparedInvocation;
    let activeTool = tool;
    try {
      if (dto.context) {
        if (!model) {
          throw new Error(`Tool called for unknown chat session`);
        }
        if (!request) {
          throw new Error(`Tool called for unknown chat request`);
        }
        dto.modelId = request.modelId;
        dto.userSelectedTools = request.userSelectedTools && { ...request.userSelectedTools };
        prepareTimeWatch = StopWatch.create(true);
        preparedInvocation = await this.prepareToolInvocationWithHookResult(tool, dto, preToolUseHookResult, token);
        prepareTimeWatch.stop();
        const { autoConfirmed: resolvedAutoConfirmed, preparedInvocation: updatedPreparedInvocation } = await this.resolveAutoConfirmFromHook(preToolUseHookResult, tool, dto, preparedInvocation, dto.context?.sessionResource);
        preparedInvocation = updatedPreparedInvocation;
        const preResolvedAutoConfirmed = resolvedAutoConfirmed ?? (preToolUseHookResult?.permissionDecision === "ask" ? void 0 : dto.preApproved);
        const { autoConfirmed, skipExplanation: riskSkipExplanation } = await this._maybeApplyAutopilotRiskGate(tool, dto, preparedInvocation, preResolvedAutoConfirmed, token);
        if (hadPendingInvocation && toolInvocation) {
          if (toolInvocation.state.get().type === IChatToolInvocation.StateKind.Streaming) {
            toolInvocation.transitionFromStreaming(preparedInvocation, dto.parameters, autoConfirmed);
          } else {
            toolInvocation.updatePreparedInvocation(preparedInvocation, dto.parameters);
          }
        } else {
          toolInvocation = new ChatToolInvocation(preparedInvocation, tool.data, dto.chatStreamToolCallId ?? dto.callId, dto.subAgentInvocationId, dto.parameters);
          if (autoConfirmed) {
            IChatToolInvocation.confirmWith(toolInvocation, autoConfirmed);
          }
          this._chatService.appendProgress(request, toolInvocation);
        }
        dto.toolSpecificData = toolInvocation?.toolSpecificData;
        if (riskSkipExplanation) {
          this._logToolApprovalTelemetry(tool, dto, { type: ToolConfirmKind.Skipped });
          this._chatService.appendProgress(request, {
            kind: "info",
            content: new MarkdownString(localize("autopilotRiskSkipped", 'Autopilot skipped "{0}" because it was assessed as high-risk: {1}', tool.data.displayName, riskSkipExplanation))
          });
          toolResult = {
            content: [{
              kind: "text",
              value: `Autopilot skipped this tool call because it was automatically assessed as high-risk: ${riskSkipExplanation} The action was not performed. Do not retry it as-is \u2014 choose a safer approach or leave it for the user to run manually.`
            }]
          };
          return toolResult;
        }
        if (preparedInvocation?.confirmationMessages?.title) {
          if (!IChatToolInvocation.executionConfirmedOrDenied(toolInvocation) && !autoConfirmed) {
            this.playAccessibilitySignal([toolInvocation], dto.context?.sessionResource);
          }
          const userConfirmed = await IChatToolInvocation.awaitConfirmation(toolInvocation, token);
          this._logToolApprovalTelemetry(tool, dto, userConfirmed);
          if (userConfirmed.type === ToolConfirmKind.Denied) {
            throw new CancellationError();
          }
          if (userConfirmed.type === ToolConfirmKind.Skipped) {
            toolResult = {
              content: [{
                kind: "text",
                value: "The user chose to skip the tool call, they want to proceed without running it"
              }]
            };
            return toolResult;
          }
          if (userConfirmed.type === ToolConfirmKind.UserAction && userConfirmed.selectedButton) {
            dto.selectedCustomButton = userConfirmed.selectedButton;
          }
          if (dto.toolSpecificData?.kind === "input") {
            dto.parameters = dto.toolSpecificData.rawInput;
            dto.toolSpecificData = void 0;
          }
        } else {
          this._logToolApprovalTelemetry(tool, dto, autoConfirmed ?? { type: ToolConfirmKind.ConfirmationNotNeeded });
        }
      } else {
        prepareTimeWatch = StopWatch.create(true);
        preparedInvocation = await this.prepareToolInvocationWithHookResult(tool, dto, preToolUseHookResult, token);
        prepareTimeWatch.stop();
        const { autoConfirmed: fallbackAutoConfirmed, preparedInvocation: updatedPreparedInvocation } = await this.resolveAutoConfirmFromHook(preToolUseHookResult, tool, dto, preparedInvocation, void 0);
        preparedInvocation = updatedPreparedInvocation;
        const autoConfirmed = fallbackAutoConfirmed ?? (preToolUseHookResult?.permissionDecision === "ask" ? void 0 : dto.preApproved);
        if (preparedInvocation?.confirmationMessages?.title && !autoConfirmed) {
          const result = await this._dialogService.confirm({ message: renderAsPlaintext(preparedInvocation.confirmationMessages.title), detail: renderAsPlaintext(preparedInvocation.confirmationMessages.message) });
          if (!result.confirmed) {
            throw new CancellationError();
          }
        }
        dto.toolSpecificData = preparedInvocation?.toolSpecificData;
      }
      if (token.isCancellationRequested) {
        throw new CancellationError();
      }
      invocationTimeWatch = StopWatch.create(true);
      const currentTool = this._tools.get(dto.toolId);
      if (!currentTool) {
        throw new Error(`Tool ${dto.toolId} was not contributed`);
      }
      if (!currentTool.impl) {
        throw new Error(`Tool ${dto.toolId} does not have an implementation registered.`);
      }
      activeTool = currentTool;
      toolResult = await currentTool.impl.invoke(dto, countTokens, {
        report: (step) => {
          toolInvocation?.acceptProgress(step);
        }
      }, token);
      invocationTimeWatch.stop();
      const compressed = this._toolResultCompressor.maybeCompress(activeTool.data.id, dto.parameters, toolResult);
      if (compressed) {
        toolResult = compressed;
      }
      this.ensureToolDetails(dto, toolResult, activeTool.data, toolInvocation);
      const afterExecuteState = await toolInvocation?.didExecuteTool(toolResult, void 0, () => this.shouldAutoConfirmPostExecution(activeTool.data.id, activeTool.data.runsInWorkspace, activeTool.data.source, dto.parameters, dto.context?.sessionResource, dto.chatRequestId, dto.context?.workingDirectory));
      if (toolInvocation && afterExecuteState?.type === IChatToolInvocation.StateKind.WaitingForPostApproval) {
        const postConfirm = await IChatToolInvocation.awaitPostConfirmation(toolInvocation, token);
        if (postConfirm.type === ToolConfirmKind.Denied) {
          throw new CancellationError();
        }
        if (postConfirm.type === ToolConfirmKind.Skipped) {
          toolResult = {
            content: [{
              kind: "text",
              value: "The tool executed but the user chose not to share the results"
            }]
          };
        }
      }
      this._telemetryService.publicLog2(
        "languageModelToolInvoked",
        {
          result: "success",
          chatSessionId: dto.context?.sessionResource ? chatSessionResourceToId(dto.context.sessionResource) : void 0,
          toolId: activeTool.data.id,
          toolExtensionId: activeTool.data.source.type === "extension" ? activeTool.data.source.extensionId.value : void 0,
          toolSourceKind: activeTool.data.source.type,
          prepareTimeMs: prepareTimeWatch?.elapsed(),
          invocationTimeMs: invocationTimeWatch?.elapsed()
        }
      );
      return toolResult;
    } catch (err) {
      const result = isCancellationError(err) ? "userCancelled" : "error";
      this._telemetryService.publicLog2(
        "languageModelToolInvoked",
        {
          result,
          chatSessionId: dto.context?.sessionResource ? chatSessionResourceToId(dto.context.sessionResource) : void 0,
          toolId: activeTool.data.id,
          toolExtensionId: activeTool.data.source.type === "extension" ? activeTool.data.source.extensionId.value : void 0,
          toolSourceKind: activeTool.data.source.type,
          prepareTimeMs: prepareTimeWatch?.elapsed(),
          invocationTimeMs: invocationTimeWatch?.elapsed()
        }
      );
      if (!isCancellationError(err)) {
        this._logService.error(`[LanguageModelToolsService#invokeTool] Error from tool ${dto.toolId} with parameters ${JSON.stringify(dto.parameters)}:
${toErrorMessage(err, true)}`);
      }
      toolResult ??= { content: [] };
      toolResult.toolResultError = err instanceof Error ? err.message : String(err);
      if (activeTool.data.alwaysDisplayInputOutput) {
        toolResult.toolResultDetails = { input: this.formatToolInput(dto), output: [{ type: "embed", isText: true, value: String(err) }], isError: true };
      }
      throw err;
    } finally {
      toolInvocation?.didExecuteTool(toolResult, true);
      if (store) {
        this.cleanupCallDisposables(requestId, store);
      }
    }
  }
  async prepareToolInvocationWithHookResult(tool, dto, hookResult, token) {
    let forceConfirmationReason;
    if (hookResult?.permissionDecision === "ask") {
      const hookMessage = localize("preToolUseHookRequiredConfirmation", "{0} required confirmation", HookType.PreToolUse);
      forceConfirmationReason = hookResult.permissionDecisionReason ? `${hookMessage}: ${hookResult.permissionDecisionReason}` : hookMessage;
    }
    return this.prepareToolInvocation(tool, dto, forceConfirmationReason, token);
  }
  _logToolApprovalTelemetry(tool, dto, reason) {
    const confirmKindNames = {
      [ToolConfirmKind.Denied]: "denied",
      [ToolConfirmKind.ConfirmationNotNeeded]: "confirmationNotNeeded",
      [ToolConfirmKind.Setting]: "setting",
      [ToolConfirmKind.LmServicePerTool]: "lmServicePerTool",
      [ToolConfirmKind.UserAction]: "userAction",
      [ToolConfirmKind.Skipped]: "skipped"
    };
    const allowedConfirmationNotNeededReasons = /* @__PURE__ */ new Set([autoApproveAllReason, "inlineChat"]);
    let confirmationNotNeededReason;
    if (reason.type === ToolConfirmKind.ConfirmationNotNeeded && reason.reason) {
      const raw = typeof reason.reason === "string" ? reason.reason : reason.reason.value;
      confirmationNotNeededReason = allowedConfirmationNotNeededReasons.has(raw) ? raw : "other";
    }
    const terminalData = dto.toolSpecificData?.kind === "terminal" ? dto.toolSpecificData : void 0;
    this._telemetryService.publicLog2(
      "chat.toolApproval",
      {
        confirmKind: confirmKindNames[reason.type],
        requestId: dto.chatRequestId,
        settingId: reason.type === ToolConfirmKind.Setting ? reason.id : void 0,
        lmServiceScope: reason.type === ToolConfirmKind.LmServicePerTool ? reason.scope : void 0,
        customButtonKind: reason.type === ToolConfirmKind.UserAction ? reason.selectedButtonKind : void 0,
        confirmationNotNeededReason,
        sandboxWrapped: terminalData?.commandLine.isSandboxWrapped,
        requestUnsandboxedExecution: terminalData?.requestUnsandboxedExecution,
        chatSessionId: dto.context?.sessionResource ? chatSessionResourceToId(dto.context.sessionResource) : void 0,
        toolId: tool.data.id,
        toolExtensionId: tool.data.source.type === "extension" ? tool.data.source.extensionId.value : void 0,
        toolSourceKind: tool.data.source.type
      }
    );
  }
  /**
   * Determines the auto-confirm decision based on a preToolUse hook result.
   * If the hook returned 'allow', auto-approves. If 'ask', forces confirmation
   * and ensures confirmation messages exist on `preparedInvocation`. Otherwise
   * falls back to normal auto-confirm logic.
   *
   * Returns the possibly-updated preparedInvocation along with the auto-confirm decision,
   * since when the hook returns 'ask' and preparedInvocation was undefined, we create one.
   */
  async resolveAutoConfirmFromHook(hookResult, tool, dto, preparedInvocation, sessionResource) {
    if (hookResult?.permissionDecision === "allow") {
      this._logService.debug(`[LanguageModelToolsService#invokeTool] Tool ${dto.toolId} auto-approved by preToolUse hook`);
      return { autoConfirmed: { type: ToolConfirmKind.ConfirmationNotNeeded, reason: localize("hookAllowed", "Allowed by hook") }, preparedInvocation };
    }
    if (hookResult?.permissionDecision === "ask") {
      this._logService.debug(`[LanguageModelToolsService#invokeTool] Tool ${dto.toolId} requires confirmation (preToolUse hook returned 'ask')`);
      if (!preparedInvocation?.confirmationMessages?.title) {
        if (!preparedInvocation) {
          preparedInvocation = {};
        }
        const fullReferenceName = getToolFullReferenceName(tool.data);
        const hookReason = hookResult.permissionDecisionReason;
        const hookNote = hookReason ? localize("hookRequiresConfirmation.messageWithReason", "{0} hook required confirmation: {1}", HookType.PreToolUse, hookReason) : localize("hookRequiresConfirmation.message", "{0} hook required confirmation", HookType.PreToolUse);
        preparedInvocation.confirmationMessages = {
          ...preparedInvocation.confirmationMessages,
          title: localize("hookRequiresConfirmation.title", "Use the '{0}' tool?", fullReferenceName),
          message: new MarkdownString(`_${hookNote}_`),
          allowAutoConfirm: false
        };
        preparedInvocation.toolSpecificData = {
          kind: "input",
          rawInput: dto.parameters
        };
      } else {
        const hookReason = hookResult.permissionDecisionReason;
        const hookNote = hookReason ? localize("hookRequiresConfirmation.note", "{0} hook required confirmation: {1}", HookType.PreToolUse, hookReason) : localize("hookRequiresConfirmation.noteNoReason", "{0} hook required confirmation", HookType.PreToolUse);
        const existing = preparedInvocation.confirmationMessages;
        if (preparedInvocation.toolSpecificData?.kind === "terminal") {
          const existingDisclaimerText = existing.disclaimer ? typeof existing.disclaimer === "string" ? existing.disclaimer : existing.disclaimer.value : void 0;
          const combinedDisclaimer = existingDisclaimerText ? `${hookNote}

${existingDisclaimerText}` : hookNote;
          preparedInvocation.confirmationMessages = {
            ...existing,
            disclaimer: combinedDisclaimer,
            allowAutoConfirm: false
          };
        } else {
          const msgText = typeof existing.message === "string" ? existing.message : existing.message?.value ?? "";
          preparedInvocation.confirmationMessages = {
            ...existing,
            message: new MarkdownString(`_${hookNote}_

${msgText}`),
            allowAutoConfirm: false
          };
        }
      }
      return { autoConfirmed: void 0, preparedInvocation };
    }
    const approveCombination = preparedInvocation?.confirmationMessages?.approveCombination;
    let combination;
    if (approveCombination) {
      combination = {
        label: typeof approveCombination.label === "string" ? approveCombination.label : approveCombination.label.value,
        key: approveCombination.key
      };
    }
    const autoConfirmed = await this.shouldAutoConfirm(tool.data.id, tool.data.runsInWorkspace, tool.data.source, dto.parameters, sessionResource, dto.chatRequestId, combination, dto.context?.workingDirectory);
    return { autoConfirmed, preparedInvocation };
  }
  /**
   * In Autopilot, runs the risk classifier on an auto-approved call and skips it when the rating
   * is {@link ToolRiskLevel.Red}. Any other result returns the original auto-confirmation
   * unchanged.
   *
   * To keep the classifier off the hot path, it only runs when all of these hold:
   * - the call was auto-approved by the session approving everything, or is a `run_in_terminal` /
   *   fetch call that self-approved (these can run risky commands or prompt-injected URLs without
   *   ever showing a confirmation);
   * - it would otherwise show a confirmation (the self-approving tools above are the exception);
   * - the session is a local panel session at the Autopilot level with Advanced Autopilot on.
   *
   * This is independent of `chat.tools.riskAssessment.enabled`, which only controls the
   * confirmation risk badge. CLI and agent-host sessions handle their own confirmations and are
   * excluded.
   *
   * Fails open: a cancelled, unavailable, or failed assessment keeps the original
   * auto-confirmation so Autopilot keeps moving.
   */
  async _maybeApplyAutopilotRiskGate(tool, dto, preparedInvocation, autoConfirmed, token) {
    const isTerminalTool = tool.data.id === TerminalToolId.RunInTerminal;
    const isFetchTool = fetchWebPageToolIds.has(tool.data.id);
    const isAlwaysClassifyTool = isTerminalTool || isFetchTool;
    const isBlanketSessionApprove = autoConfirmed?.type === ToolConfirmKind.ConfirmationNotNeeded && autoConfirmed.reason === autoApproveAllReason;
    const isSelfApprovedAlwaysClassify = isAlwaysClassifyTool && autoConfirmed === void 0 && !preparedInvocation?.confirmationMessages?.title;
    if (!isBlanketSessionApprove && !isSelfApprovedAlwaysClassify) {
      return { autoConfirmed };
    }
    if (!isAlwaysClassifyTool && !preparedInvocation?.confirmationMessages?.title) {
      return { autoConfirmed };
    }
    if (this._configurationService.getValue(ChatConfiguration.AutopilotAdvancedEnabled) !== true) {
      return { autoConfirmed };
    }
    const sessionResource = dto.context?.sessionResource;
    if (!sessionResource || getChatSessionType(sessionResource) !== localChatSessionType) {
      return { autoConfirmed };
    }
    if (!this._isSessionInAutopilotLevel(sessionResource)) {
      return { autoConfirmed };
    }
    try {
      const assessment = await this._riskAssessmentService.assess(tool.data, dto.parameters, token, void 0, { ignoreEnablement: true });
      if (token.isCancellationRequested) {
        return { autoConfirmed };
      }
      if (assessment?.risk === ToolRiskLevel.Red) {
        const fallbackExplanation = localize("autopilotRiskSkipFallback", "The action was assessed as potentially destructive or irreversible.");
        const explanation = assessment.explanation.trim() || fallbackExplanation;
        this._logService.info(`[LanguageModelToolsService#invokeTool] Autopilot skipping high-risk tool ${tool.data.id}: ${explanation}`);
        return { autoConfirmed: { type: ToolConfirmKind.Skipped }, skipExplanation: explanation };
      }
    } catch (err) {
      this._logService.warn(`[LanguageModelToolsService#invokeTool] Autopilot risk assessment failed for tool ${tool.data.id}, allowing: ${toErrorMessage(err)}`);
    }
    return { autoConfirmed };
  }
  async prepareToolInvocation(tool, dto, forceConfirmationReason, token) {
    let prepared;
    if (tool.impl.prepareToolInvocation) {
      const preparePromise = tool.impl.prepareToolInvocation({
        parameters: dto.parameters,
        toolCallId: dto.callId,
        chatRequestId: dto.chatRequestId,
        chatSessionResource: dto.context?.sessionResource,
        chatInteractionId: dto.chatInteractionId,
        modelId: dto.modelId,
        forceConfirmationReason,
        workingDirectory: dto.context?.workingDirectory
      }, token);
      const raceResult = await Promise.race([
        timeout(3e3, token).then(() => "timeout"),
        preparePromise
      ]);
      if (raceResult === "timeout" && dto.context) {
        this._onDidPrepareToolCallBecomeUnresponsive.fire({
          sessionResource: dto.context.sessionResource,
          toolData: tool.data
        });
      }
      prepared = await preparePromise;
    }
    const isEligibleForAutoApproval = this.isToolEligibleForAutoApproval(tool.data);
    if (!isEligibleForAutoApproval && !prepared?.confirmationMessages?.title) {
      if (!prepared) {
        prepared = {};
      }
      const fullReferenceName = getToolFullReferenceName(tool.data);
      prepared.confirmationMessages = {
        ...prepared.confirmationMessages,
        title: localize("defaultToolConfirmation.title", "Confirm tool execution"),
        message: localize("defaultToolConfirmation.message", "Run the '{0}' tool?", fullReferenceName),
        disclaimer: toolIdsThatCannotBeAutoApproved.has(tool.data.id) ? void 0 : new MarkdownString(localize("defaultToolConfirmation.disclaimer", "Auto approval for '{0}' is restricted via {1}.", getToolFullReferenceName(tool.data), createMarkdownCommandLink({ text: "`" + ChatConfiguration.EligibleForAutoApproval + "`", id: "workbench.action.openSettings", arguments: [ChatConfiguration.EligibleForAutoApproval], tooltip: localize("openSettings.autoApproval.tooltip", "Open settings to configure auto-approval") }, false)), { isTrusted: true }),
        allowAutoConfirm: false
      };
    }
    if (!isEligibleForAutoApproval && prepared?.confirmationMessages?.title) {
      prepared.confirmationMessages.disclaimer = toolIdsThatCannotBeAutoApproved.has(tool.data.id) ? void 0 : new MarkdownString(localize("defaultToolConfirmation.disclaimer", "Auto approval for '{0}' is restricted via {1}.", getToolFullReferenceName(tool.data), createMarkdownCommandLink({ text: "`" + ChatConfiguration.EligibleForAutoApproval + "`", id: "workbench.action.openSettings", arguments: [ChatConfiguration.EligibleForAutoApproval], tooltip: localize("openSettings.autoApproval.tooltip", "Open settings to configure auto-approval") }, false)), { isTrusted: true });
    }
    if (prepared?.confirmationMessages?.title) {
      if (prepared.toolSpecificData?.kind !== "terminal" && prepared.confirmationMessages.allowAutoConfirm !== false) {
        prepared.confirmationMessages.allowAutoConfirm = isEligibleForAutoApproval;
      }
      if (!prepared.toolSpecificData && tool.data.alwaysDisplayInputOutput) {
        prepared.toolSpecificData = {
          kind: "input",
          rawInput: dto.parameters
        };
      }
    }
    return prepared;
  }
  beginToolCall(options) {
    const toolEntry = this._tools.get(options.toolId);
    if (!toolEntry) {
      return void 0;
    }
    if (!options.force && !toolEntry.impl?.handleToolStream) {
      return void 0;
    }
    const invocation = ChatToolInvocation.createStreaming({
      toolCallId: options.toolCallId,
      toolId: options.toolId,
      toolData: toolEntry.data,
      subagentInvocationId: options.subagentInvocationId,
      chatRequestId: options.chatRequestId
    });
    this._pendingToolCalls.set(options.toolCallId, invocation);
    if (options.sessionResource) {
      const model = this._chatService.getSession(options.sessionResource);
      if (model) {
        const request = (options.chatRequestId ? model.getRequests().find((r) => r.id === options.chatRequestId) : void 0) ?? model.getRequests().at(-1);
        if (request) {
          this._chatService.appendProgress(request, invocation);
        }
      }
    }
    this._callHandleToolStream(toolEntry, invocation, options.toolCallId, void 0, CancellationToken.None);
    return invocation;
  }
  async _callHandleToolStream(toolEntry, invocation, toolCallId, rawInput, token) {
    if (!toolEntry.impl?.handleToolStream) {
      return;
    }
    try {
      const result = await toolEntry.impl.handleToolStream({
        toolCallId,
        rawInput,
        chatRequestId: invocation.chatRequestId
      }, token);
      if (result?.invocationMessage) {
        invocation.updateStreamingMessage(result.invocationMessage);
      }
    } catch (error) {
      this._logService.error(`[LanguageModelToolsService#_callHandleToolStream] Error calling handleToolStream for tool ${toolEntry.data.id}:`, error);
    }
  }
  async updateToolStream(toolCallId, partialInput, token) {
    const invocation = this._pendingToolCalls.get(toolCallId);
    if (!invocation) {
      return;
    }
    invocation.updatePartialInput(partialInput);
    const toolEntry = this._tools.get(invocation.toolId);
    if (toolEntry) {
      await this._callHandleToolStream(toolEntry, invocation, toolCallId, partialInput, token);
    }
  }
  playAccessibilitySignal(toolInvocations, chatSessionResource) {
    const autoApproved = this._configurationService.getValue(ChatConfiguration.GlobalAutoApprove);
    if (autoApproved) {
      return;
    }
    if (chatSessionResource) {
      const model = this._chatService.getSession(chatSessionResource);
      const request = model?.getRequests().at(-1);
      if (isAutoApproveLevel(request?.modeInfo?.permissionLevel) || this._isSessionLiveAutoApproveLevel(chatSessionResource)) {
        return;
      }
    }
    const pendingInvocations = toolInvocations.filter((inv) => !IChatToolInvocation.executionConfirmedOrDenied(inv));
    if (pendingInvocations.length === 0) {
      return;
    }
    const setting = this._configurationService.getValue(AccessibilitySignal.chatUserActionRequired.settingsKey);
    if (!setting) {
      return;
    }
    const soundEnabled = setting.sound === "on" || setting.sound === "auto" && this._accessibilityService.isScreenReaderOptimized();
    const announcementEnabled = this._accessibilityService.isScreenReaderOptimized() && setting.announcement === "auto";
    if (soundEnabled || announcementEnabled) {
      this._accessibilitySignalService.playSignal(AccessibilitySignal.chatUserActionRequired, { customAlertMessage: this._instantiationService.invokeFunction(getToolConfirmationAlert, pendingInvocations), userGesture: true, modality: !soundEnabled ? "announcement" : void 0 });
    }
  }
  ensureToolDetails(dto, toolResult, toolData, toolInvocation) {
    if (!toolResult.toolResultDetails && (toolData.alwaysDisplayInputOutput || this.toolResultHasImages(toolResult) && !this.toolResultMessageHasImageFileWidgets(toolResult, toolInvocation))) {
      toolResult.toolResultDetails = {
        input: this.formatToolInput(dto),
        output: this.toolResultToIO(toolResult)
      };
    }
  }
  toolResultHasImages(toolResult) {
    return toolResult.content.some((part) => part.kind === "data" && part.value.mimeType?.startsWith("image/"));
  }
  /**
   * Returns true if the tool result message (or falling back to the tool invocation's
   * pastTenseMessage from streaming) contains empty markdown links pointing to image
   * files (the `[](imageUri)` pattern) that will be rendered as file pills by renderFileWidgets.
   */
  toolResultMessageHasImageFileWidgets(toolResult, toolInvocation) {
    const message = toolResult.toolResultMessage ?? toolInvocation?.pastTenseMessage;
    if (!message) {
      return false;
    }
    const value = typeof message === "string" ? message : message.value;
    const linkPattern = /\[\s*\]\((?<uri>[^)]+)\)/g;
    let match;
    while ((match = linkPattern.exec(value)) !== null) {
      try {
        const parsed = URI.parse(match.groups.uri);
        const mime = getMediaMime(parsed.path);
        if (mime?.startsWith("image/")) {
          return true;
        }
      } catch {
      }
    }
    return false;
  }
  formatToolInput(dto) {
    return JSON.stringify(dto.parameters, void 0, 2);
  }
  toolResultToIO(toolResult) {
    return toolResult.content.map((part) => {
      if (part.kind === "text") {
        return { type: "embed", isText: true, value: part.value };
      } else if (part.kind === "promptTsx") {
        return { type: "embed", isText: true, value: stringifyPromptTsxPart(part) };
      } else if (part.kind === "data") {
        return { type: "embed", value: encodeBase64(part.value.data), mimeType: part.value.mimeType };
      } else {
        assertNever(part);
      }
    });
  }
  /**
   * Returns true if enterprise policy has explicitly disabled the global auto-approve setting.
   * When this is the case, Bypass Approvals and Autopilot permission levels should not auto-approve tools.
   */
  _isAutoApprovePolicyRestricted() {
    const inspected = this._configurationService.inspect(ChatConfiguration.GlobalAutoApprove);
    return inspected.policyValue === false;
  }
  /**
   * Returns true if the session's current (live) permission picker level is auto-approve.
   * This checks the widget's current state, not what was stamped on the request,
   * so switching to Autopilot mid-session takes effect immediately.
   */
  _isSessionLiveAutoApproveLevel(chatSessionResource) {
    const widget = this._chatWidgetService.getWidgetBySessionResource(chatSessionResource) ?? this._chatWidgetService.lastFocusedWidget;
    return !!widget && isAutoApproveLevel(widget.input.currentModeInfo.permissionLevel);
  }
  /**
   * True if the session is in an auto-approve level (Auto-Approve / Autopilot),
   * via either the last request's stamped level or the live picker level.
   */
  _isSessionInAutoApproveLevel(chatSessionResource) {
    if (!chatSessionResource) {
      return false;
    }
    const model = this._chatService.getSession(chatSessionResource);
    const request = model?.getRequests().at(-1);
    return isAutoApproveLevel(request?.modeInfo?.permissionLevel) || this._isSessionLiveAutoApproveLevel(chatSessionResource);
  }
  /**
   * True if the session's live permission picker level is Autopilot. Like
   * {@link _isSessionLiveAutoApproveLevel}, but excludes plain Auto-Approve.
   */
  _isSessionLiveAutopilotLevel(chatSessionResource) {
    const widget = this._chatWidgetService.getWidgetBySessionResource(chatSessionResource) ?? this._chatWidgetService.lastFocusedWidget;
    return !!widget && isAutopilotLevel(widget.input.currentModeInfo.permissionLevel);
  }
  /**
   * True if the session is at the Autopilot level (not plain Auto-Approve), via either the last
   * request's stamped level or the live picker level.
   */
  _isSessionInAutopilotLevel(chatSessionResource) {
    if (!chatSessionResource) {
      return false;
    }
    const model = this._chatService.getSession(chatSessionResource);
    const request = model?.getRequests().at(-1);
    return isAutopilotLevel(request?.modeInfo?.permissionLevel) || this._isSessionLiveAutopilotLevel(chatSessionResource);
  }
  getEligibleForAutoApprovalSpecialCase(toolData) {
    if (toolData.id === "vscode_fetchWebPage_internal") {
      return "fetch";
    }
    return void 0;
  }
  isToolEligibleForAutoApproval(toolData) {
    const fullReferenceName = this.getEligibleForAutoApprovalSpecialCase(toolData) ?? getToolFullReferenceName(toolData);
    if (toolData.id === "copilot_fetchWebPage") {
      return true;
    }
    if (toolIdsThatCannotBeAutoApproved.has(toolData.id)) {
      return false;
    }
    const eligibilityConfig = this._configurationService.getValue(ChatConfiguration.EligibleForAutoApproval);
    if (eligibilityConfig && typeof eligibilityConfig === "object" && fullReferenceName) {
      if (Object.prototype.hasOwnProperty.call(eligibilityConfig, fullReferenceName)) {
        return eligibilityConfig[fullReferenceName];
      }
      if (toolData.legacyToolReferenceFullNames) {
        for (const legacyName of toolData.legacyToolReferenceFullNames) {
          if (Object.prototype.hasOwnProperty.call(eligibilityConfig, legacyName)) {
            return eligibilityConfig[legacyName];
          }
          if (legacyName.includes("/")) {
            const trimmedLegacyName = legacyName.split("/").pop();
            if (trimmedLegacyName && Object.prototype.hasOwnProperty.call(eligibilityConfig, trimmedLegacyName)) {
              return eligibilityConfig[trimmedLegacyName];
            }
          }
        }
      }
    }
    return true;
  }
  async shouldAutoConfirm(toolId, runsInWorkspace, source, parameters, chatSessionResource, chatRequestId, combination, workingDirectory) {
    const tool = this._tools.get(toolId);
    if (!tool) {
      return void 0;
    }
    if (chatSessionResource && !this._isAutoApprovePolicyRestricted() && this._isSessionInAutoApproveLevel(chatSessionResource)) {
      if (!(toolIdsThatCannotBeAutoApproved.has(tool.data.id) && getChatSessionType(chatSessionResource) !== localChatSessionType)) {
        return { type: ToolConfirmKind.ConfirmationNotNeeded, reason: autoApproveAllReason };
      }
    }
    if (!this.isToolEligibleForAutoApproval(tool.data)) {
      return void 0;
    }
    const reason = this._confirmationService.getPreConfirmAction({ toolId, source, parameters, chatSessionResource, workingDirectory, combination });
    if (reason) {
      return reason;
    }
    const config = this._configurationService.inspect(ChatConfiguration.GlobalAutoApprove);
    let value = config.value ?? config.defaultValue;
    if (typeof runsInWorkspace === "boolean") {
      value = config.userLocalValue ?? config.applicationValue;
      if (runsInWorkspace) {
        value = config.workspaceValue ?? config.workspaceFolderValue ?? config.userRemoteValue ?? value;
      }
    }
    const autoConfirm = value === true || typeof value === "object" && value.hasOwnProperty(toolId) && value[toolId] === true;
    if (autoConfirm) {
      if (await this._checkGlobalAutoApprove()) {
        return { type: ToolConfirmKind.Setting, id: ChatConfiguration.GlobalAutoApprove };
      }
    }
    return void 0;
  }
  async shouldAutoConfirmPostExecution(toolId, runsInWorkspace, source, parameters, chatSessionResource, chatRequestId, workingDirectory) {
    const sessionAutoApprove = chatSessionResource && !this._isAutoApprovePolicyRestricted() && this._isSessionInAutoApproveLevel(chatSessionResource);
    if (sessionAutoApprove) {
      if (!(toolIdsThatCannotBeAutoApproved.has(toolId) && getChatSessionType(chatSessionResource) !== localChatSessionType)) {
        return { type: ToolConfirmKind.ConfirmationNotNeeded, reason: autoApproveAllReason };
      }
    }
    if (this._configurationService.getValue(ChatConfiguration.GlobalAutoApprove) && !sessionAutoApprove && await this._checkGlobalAutoApprove()) {
      return { type: ToolConfirmKind.Setting, id: ChatConfiguration.GlobalAutoApprove };
    }
    return this._confirmationService.getPostConfirmAction({ toolId, source, parameters, chatSessionResource, workingDirectory });
  }
  async _checkGlobalAutoApprove() {
    const optedIn = this._storageService.getBoolean("chat.tools.global.autoApprove.optIn" /* GlobalAutoApproveOptIn */, StorageScope.APPLICATION, false);
    if (optedIn) {
      return true;
    }
    if (this._contextKeyService.getContextKeyValue(SkipAutoApproveConfirmationKey) === true) {
      return true;
    }
    if (this._pendingGlobalAutoApproveCheck) {
      return this._pendingGlobalAutoApproveCheck;
    }
    this._pendingGlobalAutoApproveCheck = this._doCheckGlobalAutoApprove();
    try {
      return await this._pendingGlobalAutoApproveCheck;
    } finally {
      this._pendingGlobalAutoApproveCheck = void 0;
    }
  }
  async _doCheckGlobalAutoApprove() {
    const store = new DisposableStore();
    try {
      const cts = new CancellationTokenSource();
      store.add(cts);
      store.add(this._storageService.onDidChangeValue(StorageScope.APPLICATION, "chat.tools.global.autoApprove.optIn" /* GlobalAutoApproveOptIn */, store)(() => {
        if (this._storageService.getBoolean("chat.tools.global.autoApprove.optIn" /* GlobalAutoApproveOptIn */, StorageScope.APPLICATION, false)) {
          cts.cancel();
        }
      }));
      const promptResult = await this._dialogService.prompt({
        type: Severity.Warning,
        message: localize("autoApprove2.title", "Enable global auto approve?"),
        buttons: [
          {
            label: localize("autoApprove2.button.enable", "Enable"),
            run: () => true
          },
          {
            label: localize("autoApprove2.button.disable", "Disable"),
            run: () => false
          }
        ],
        custom: {
          icon: Codicon.warning,
          markdownDetails: [{
            markdown: new MarkdownString(globalAutoApproveDescription.value, { isTrusted: { enabledCommands: ["workbench.action.openSettings"] } })
          }]
        },
        token: cts.token
      });
      if (cts.token.isCancellationRequested) {
        return true;
      }
      if (promptResult.result !== true) {
        await this._configurationService.updateValue(ChatConfiguration.GlobalAutoApprove, false);
        return false;
      }
      this._storageService.store("chat.tools.global.autoApprove.optIn" /* GlobalAutoApproveOptIn */, true, StorageScope.APPLICATION, StorageTarget.USER);
      return true;
    } finally {
      store.dispose();
    }
  }
  cleanupCallDisposables(requestId, store) {
    if (requestId) {
      const disposables = this._callsByRequestId.get(requestId);
      if (disposables) {
        const index = disposables.findIndex((d) => d.store === store);
        if (index > -1) {
          disposables.splice(index, 1);
        }
        if (disposables.length === 0) {
          this._callsByRequestId.delete(requestId);
        }
      }
    }
    store.dispose();
  }
  cancelToolCallsForRequest(requestId) {
    const calls = this._callsByRequestId.get(requestId);
    if (calls) {
      calls.forEach((call) => call.store.dispose());
      this._callsByRequestId.delete(requestId);
    }
    for (const [toolCallId, invocation] of this._pendingToolCalls) {
      if (invocation.chatRequestId === requestId) {
        this._pendingToolCalls.delete(toolCallId);
      }
    }
  }
  *getToolSetAliases(toolSet, fullReferenceName) {
    if (fullReferenceName !== toolSet.referenceName) {
      yield toolSet.referenceName;
    }
    if (toolSet.legacyFullNames) {
      yield* toolSet.legacyFullNames;
    }
    switch (toolSet.referenceName) {
      case "github":
        for (const alias of LanguageModelToolsService.githubMCPServerAliases) {
          yield alias + "/*";
        }
        break;
      case "playwright":
        for (const alias of LanguageModelToolsService.playwrightMCPServerAliases) {
          yield alias + "/*";
        }
        break;
      case SpecedToolAliases.execute:
        yield "shell";
        break;
      case SpecedToolAliases.agent:
        yield VSCodeToolReference.runSubagent;
        yield "custom-agent";
        break;
    }
  }
  *getToolAliases(toolSet, fullReferenceName) {
    const referenceName = toolSet.toolReferenceName ?? toolSet.displayName;
    if (fullReferenceName !== referenceName && referenceName !== VSCodeToolReference.runSubagent) {
      yield referenceName;
    }
    if (toolSet.legacyToolReferenceFullNames) {
      for (const legacyName of toolSet.legacyToolReferenceFullNames) {
        yield legacyName;
        const lastSlashIndex = legacyName.lastIndexOf("/");
        if (lastSlashIndex !== -1) {
          yield legacyName.substring(lastSlashIndex + 1);
        }
      }
    }
    const slashIndex = fullReferenceName.lastIndexOf("/");
    if (slashIndex !== -1) {
      switch (fullReferenceName.substring(0, slashIndex)) {
        case "github":
          for (const alias of LanguageModelToolsService.githubMCPServerAliases) {
            yield alias + fullReferenceName.substring(slashIndex);
          }
          break;
        case "playwright":
          for (const alias of LanguageModelToolsService.playwrightMCPServerAliases) {
            yield alias + fullReferenceName.substring(slashIndex);
          }
          break;
      }
    }
  }
  /**
   * Create a map that contains all tools and toolsets with their enablement state.
   * @param fullReferenceNames A list of tool or toolset by their full reference names that are enabled.
   * @returns A map of tool or toolset instances to their enablement state.
   */
  toToolAndToolSetEnablementMap(fullReferenceNames, model) {
    const toolOrToolSetNames = new Set(fullReferenceNames);
    const result = /* @__PURE__ */ new Map();
    for (const [tool, fullReferenceName] of this.toolsWithFullReferenceName.get()) {
      if (isToolSet(tool)) {
        const enabled = toolOrToolSetNames.has(fullReferenceName) || Iterable.some(this.getToolSetAliases(tool, fullReferenceName), (name) => toolOrToolSetNames.has(name));
        const scoped = model ? new ToolSetForModel(tool, model) : tool;
        result.set(scoped, enabled);
        if (enabled) {
          for (const memberTool of scoped.getTools()) {
            result.set(memberTool, true);
          }
        }
      } else {
        if (!this.isToolEnabledForModel(tool, model)) {
          continue;
        }
        if (!result.has(tool)) {
          const enabled = toolOrToolSetNames.has(fullReferenceName) || Iterable.some(this.getToolAliases(tool, fullReferenceName), (name) => toolOrToolSetNames.has(name)) || !!tool.legacyToolReferenceFullNames?.some((toolFullName) => {
            const index = toolFullName.lastIndexOf("/");
            return index !== -1 && toolOrToolSetNames.has(toolFullName.substring(0, index));
          });
          result.set(tool, enabled);
        }
      }
    }
    for (const toolSet of this._toolSets) {
      if (toolSet.source.type === "user") {
        const enabled = Iterable.every(toolSet.getTools(), (t) => result.get(t) === true);
        result.set(toolSet, enabled);
      }
    }
    return ToolAndToolSetEnablementMap.fromMap(result);
  }
  toFullReferenceNames(map) {
    const result = [];
    const toolsCoveredByEnabledToolSet = /* @__PURE__ */ new Set();
    const enabledToolSetIds = /* @__PURE__ */ new Set();
    const enabledToolIds = /* @__PURE__ */ new Set();
    for (const [tool, enabled] of map) {
      if (enabled) {
        if (isToolSet(tool)) {
          enabledToolSetIds.add(tool.id);
        } else {
          enabledToolIds.add(tool.id);
        }
      }
    }
    for (const [tool, fullReferenceName] of this.toolsWithFullReferenceName.get()) {
      if (isToolSet(tool)) {
        if (enabledToolSetIds.has(tool.id)) {
          result.push(fullReferenceName);
          for (const memberTool of tool.getTools()) {
            toolsCoveredByEnabledToolSet.add(memberTool);
          }
        }
      } else {
        if (enabledToolIds.has(tool.id) && !toolsCoveredByEnabledToolSet.has(tool)) {
          result.push(fullReferenceName);
        }
      }
    }
    return result;
  }
  toToolReferences(variableReferences) {
    const toolsOrToolSetByName = /* @__PURE__ */ new Map();
    for (const [tool, fullReferenceName] of this.toolsWithFullReferenceName.get()) {
      toolsOrToolSetByName.set(fullReferenceName, tool);
    }
    const result = [];
    for (const ref of variableReferences) {
      const toolOrToolSet = toolsOrToolSetByName.get(ref.name);
      if (toolOrToolSet) {
        if (isToolSet(toolOrToolSet)) {
          result.push(toToolSetVariableEntry(toolOrToolSet, ref.range));
        } else {
          result.push(toToolVariableEntry(toolOrToolSet, ref.range));
        }
      }
    }
    return result;
  }
  getToolSetsForModel(model, reader) {
    if (!model) {
      return this.toolSets.read(reader);
    }
    return Iterable.map(this.toolSets.read(reader), (ts) => new ToolSetForModel(ts, model, (toolData) => this.isToolEnabledForModel(toolData, model)));
  }
  getToolSet(id) {
    for (const toolSet of this._toolSets) {
      if (toolSet.id === id) {
        return toolSet;
      }
    }
    return void 0;
  }
  getToolSetByName(name) {
    for (const toolSet of this._toolSets) {
      if (toolSet.referenceName === name) {
        return toolSet;
      }
    }
    return void 0;
  }
  getSpecedToolSetName(referenceName) {
    if (LanguageModelToolsService.githubMCPServerAliases.includes(referenceName)) {
      return "github";
    }
    if (LanguageModelToolsService.playwrightMCPServerAliases.includes(referenceName)) {
      return "playwright";
    }
    return referenceName;
  }
  createToolSet(source, id, referenceName, options) {
    const that = this;
    referenceName = this.getSpecedToolSetName(referenceName);
    const result = new class extends ToolSet {
      dispose() {
        if (that._toolSets.has(result)) {
          this._tools.clear();
          that._toolSets.delete(result);
        }
      }
    }(id, referenceName, options?.icon ?? Codicon.tools, source, options?.description, options?.detail, options?.legacyFullNames, options?.deprecated, options?.hiddenInToolsPicker, this._contextKeyService);
    this._toolSets.add(result);
    return result;
  }
  *getFullReferenceNames() {
    for (const [, fullReferenceName] of this.toolsWithFullReferenceName.get()) {
      yield fullReferenceName;
    }
  }
  getDeprecatedFullReferenceNames() {
    const result = /* @__PURE__ */ new Map();
    const knownToolSetNames = /* @__PURE__ */ new Set();
    const add = (name, fullReferenceName) => {
      if (name !== fullReferenceName) {
        if (!result.has(name)) {
          result.set(name, /* @__PURE__ */ new Set());
        }
        result.get(name).add(fullReferenceName);
      }
    };
    for (const [tool, _] of this.toolsWithFullReferenceName.get()) {
      if (isToolSet(tool)) {
        knownToolSetNames.add(tool.referenceName);
        if (tool.legacyFullNames) {
          for (const legacyName of tool.legacyFullNames) {
            knownToolSetNames.add(legacyName);
          }
        }
      }
    }
    for (const [tool, fullReferenceName] of this.toolsWithFullReferenceName.get()) {
      if (isToolSet(tool)) {
        for (const alias of this.getToolSetAliases(tool, fullReferenceName)) {
          add(alias, fullReferenceName);
        }
      } else {
        for (const alias of this.getToolAliases(tool, fullReferenceName)) {
          add(alias, fullReferenceName);
        }
        if (tool.legacyToolReferenceFullNames) {
          const slashIndex = fullReferenceName.lastIndexOf("/");
          const toolSetPrefix = slashIndex !== -1 ? fullReferenceName.substring(0, slashIndex + 1) : void 0;
          for (const legacyName of tool.legacyToolReferenceFullNames) {
            if (toolSetPrefix && !legacyName.includes("/")) {
              add(toolSetPrefix + legacyName, fullReferenceName);
            }
            if (legacyName.includes("/")) {
              const toolSetFullName = legacyName.substring(0, legacyName.lastIndexOf("/"));
              if (!knownToolSetNames.has(toolSetFullName)) {
                add(toolSetFullName, fullReferenceName);
              }
            }
          }
        }
      }
    }
    return result;
  }
  getToolByFullReferenceName(fullReferenceName) {
    for (const [tool, toolFullReferenceName] of this.toolsWithFullReferenceName.get()) {
      if (fullReferenceName === toolFullReferenceName) {
        return tool;
      }
      const aliases = isToolSet(tool) ? this.getToolSetAliases(tool, toolFullReferenceName) : this.getToolAliases(tool, toolFullReferenceName);
      if (Iterable.some(aliases, (alias) => fullReferenceName === alias)) {
        return tool;
      }
    }
    return void 0;
  }
  getFullReferenceName(tool, toolSet) {
    for (const [item, toolFullReferenceName] of this.toolsWithFullReferenceName.get()) {
      if (item === tool) {
        return toolFullReferenceName;
      }
    }
    if (isToolSet(tool)) {
      return getToolSetFullReferenceName(tool);
    }
    return getToolFullReferenceName(tool, toolSet);
  }
  getFullReferenceNameMap() {
    const result = /* @__PURE__ */ new Map();
    for (const [item, toolFullReferenceName] of this.toolsWithFullReferenceName.get()) {
      result.set(item, toolFullReferenceName);
    }
    return result;
  }
};
LanguageModelToolsService.githubMCPServerAliases = ["github/github-mcp-server", "io.github.github/github-mcp-server", "github-mcp-server"];
LanguageModelToolsService.playwrightMCPServerAliases = ["microsoft/playwright-mcp", "com.microsoft/playwright-mcp"];
LanguageModelToolsService = __decorateClass([
  __decorateParam(0, IInstantiationService),
  __decorateParam(1, IExtensionService),
  __decorateParam(2, IContextKeyService),
  __decorateParam(3, IChatService),
  __decorateParam(4, IDialogService),
  __decorateParam(5, ITelemetryService),
  __decorateParam(6, ILogService),
  __decorateParam(7, IConfigurationService),
  __decorateParam(8, IAccessibilityService),
  __decorateParam(9, IAccessibilitySignalService),
  __decorateParam(10, IStorageService),
  __decorateParam(11, ILanguageModelToolsConfirmationService),
  __decorateParam(12, ICommandService),
  __decorateParam(13, IChatWidgetService),
  __decorateParam(14, IToolResultCompressor),
  __decorateParam(15, IChatToolRiskAssessmentService)
], LanguageModelToolsService);
function getToolFullReferenceName(tool, toolSet) {
  const toolName = tool.toolReferenceName ?? tool.displayName;
  if (toolSet) {
    return `${toolSet.referenceName}/${toolName}`;
  } else if (tool.source.type === "extension") {
    return `${tool.source.extensionId.value.toLowerCase()}/${toolName}`;
  }
  return toolName;
}
function getToolSetFullReferenceName(toolSet) {
  if (toolSet.source.type === "mcp") {
    return `${toolSet.referenceName}/*`;
  }
  return toolSet.referenceName;
}
export {
  AutoApproveStorageKeys,
  LanguageModelToolsService,
  globalAutoApproveDescription
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXHRvb2xzXFxsYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgcmVuZGVyQXNQbGFpbnRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvbWFya2Rvd25SZW5kZXJlci5qcyc7XG5pbXBvcnQgeyBhc3NlcnROZXZlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Fzc2VydC5qcyc7XG5pbXBvcnQgeyBSdW5PbmNlU2NoZWR1bGVyLCB0aW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgZW5jb2RlQmFzZTY0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuLCBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgYXJyYXlFcXVhbHNDIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXF1YWxzLmpzJztcbmltcG9ydCB7IHRvRXJyb3JNZXNzYWdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JNZXNzYWdlLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvbkVycm9yLCBpc0NhbmNlbGxhdGlvbkVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgY3JlYXRlTWFya2Rvd25Db21tYW5kTGluaywgTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBJdGVyYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2l0ZXJhdG9yLmpzJztcbmltcG9ydCB7IGNvbWJpbmVkRGlzcG9zYWJsZSwgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGdldE1lZGlhTWltZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21pbWUuanMnO1xuaW1wb3J0IHsgZGVyaXZlZCwgZGVyaXZlZE9wdHMsIElPYnNlcnZhYmxlLCBJUmVhZGVyLCBvYnNlcnZhYmxlRnJvbUV2ZW50T3B0cywgT2JzZXJ2YWJsZVNldCwgb2JzZXJ2YWJsZVNpZ25hbCwgdHJhbnNhY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCBTZXZlcml0eSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zZXZlcml0eS5qcyc7XG5pbXBvcnQgeyBTdG9wV2F0Y2ggfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdG9wd2F0Y2guanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSwgbG9jYWxpemUyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElBY2Nlc3NpYmlsaXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjY2Vzc2liaWxpdHkvY29tbW9uL2FjY2Vzc2liaWxpdHkuanMnO1xuaW1wb3J0IHsgQWNjZXNzaWJpbGl0eVNpZ25hbCwgSUFjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWNjZXNzaWJpbGl0eVNpZ25hbC9icm93c2VyL2FjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5LCBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElEaWFsb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGlhbG9ncy9jb21tb24vZGlhbG9ncy5qcyc7XG5pbXBvcnQgdHlwZSB7IExhbmd1YWdlTW9kZWxUb29sSW52b2tlZENsYXNzaWZpY2F0aW9uLCBMYW5ndWFnZU1vZGVsVG9vbEludm9rZWRFdmVudCwgTGFuZ3VhZ2VNb2RlbFRvb2xUZWxlbWV0cnlDbGFzc2lmaWNhdGlvbiwgTGFuZ3VhZ2VNb2RlbFRvb2xUZWxlbWV0cnlEYXRhIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi9sYW5ndWFnZU1vZGVsVG9vbFRlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCAqIGFzIEpTT05Db250cmlidXRpb25SZWdpc3RyeSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9qc29uc2NoZW1hcy9jb21tb24vanNvbkNvbnRyaWJ1dGlvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgb2JzZXJ2YWJsZUNvbmZpZ1ZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vb2JzZXJ2YWJsZS9jb21tb24vcGxhdGZvcm1PYnNlcnZhYmxlVXRpbHMuanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IENoYXRDb250ZXh0S2V5cyB9IGZyb20gJy4uLy4uL2NvbW1vbi9hY3Rpb25zL2NoYXRDb250ZXh0S2V5cy5qcyc7XG5pbXBvcnQgeyBDaGF0UmVxdWVzdFRvb2xSZWZlcmVuY2VFbnRyeSwgdG9Ub29sU2V0VmFyaWFibGVFbnRyeSwgdG9Ub29sVmFyaWFibGVFbnRyeSB9IGZyb20gJy4uLy4uL2NvbW1vbi9hdHRhY2htZW50cy9jaGF0VmFyaWFibGVFbnRyaWVzLmpzJztcbmltcG9ydCB7IElWYXJpYWJsZVJlZmVyZW5jZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9jaGF0TW9kZXMuanMnO1xuaW1wb3J0IHsgQ29uZmlybWVkUmVhc29uLCBJQ2hhdFNlcnZpY2UsIElDaGF0VG9vbEludm9jYXRpb24sIFRvb2xDb25maXJtS2luZCB9IGZyb20gJy4uLy4uL2NvbW1vbi9jaGF0U2VydmljZS9jaGF0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0Q29uZmlndXJhdGlvbiwgaXNBdXRvQXBwcm92ZUxldmVsLCBpc0F1dG9waWxvdExldmVsIH0gZnJvbSAnLi4vLi4vY29tbW9uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBsb2NhbENoYXRTZXNzaW9uVHlwZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9jaGF0U2Vzc2lvbnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhIH0gZnJvbSAnLi4vLi4vY29tbW9uL2xhbmd1YWdlTW9kZWxzLmpzJztcbmltcG9ydCB7IElDaGF0TW9kZWwsIElDaGF0UmVxdWVzdE1vZGVsIH0gZnJvbSAnLi4vLi4vY29tbW9uL21vZGVsL2NoYXRNb2RlbC5qcyc7XG5pbXBvcnQgeyBDaGF0VG9vbEludm9jYXRpb24gfSBmcm9tICcuLi8uLi9jb21tb24vbW9kZWwvY2hhdFByb2dyZXNzVHlwZXMvY2hhdFRvb2xJbnZvY2F0aW9uLmpzJztcbmltcG9ydCB7IGNoYXRTZXNzaW9uUmVzb3VyY2VUb0lkLCBnZXRDaGF0U2Vzc2lvblR5cGUgfSBmcm9tICcuLi8uLi9jb21tb24vbW9kZWwvY2hhdFVyaS5qcyc7XG5pbXBvcnQgeyBIb29rVHlwZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9wcm9tcHRTeW50YXgvaG9va1R5cGVzLmpzJztcbmltcG9ydCB7IENvcGlsb3RDaGF0U2V0dGluZ0lkLCBDb3BpbG90VG9vbElkIH0gZnJvbSAnLi4vLi4vY29tbW9uL3Rvb2xzL2NvcGlsb3RUb29sSWRzLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZU1vZGVsVG9vbHNDb25maXJtYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3Rvb2xzL2xhbmd1YWdlTW9kZWxUb29sc0NvbmZpcm1hdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVGVybWluYWxUb29sSWQgfSBmcm9tICcuLi8uLi9jb21tb24vdG9vbHMvdGVybWluYWxUb29sSWRzLmpzJztcbmltcG9ydCB7IENvdW50VG9rZW5zQ2FsbGJhY2ssIGNyZWF0ZVRvb2xTY2hlbWFVcmksIElCZWdpblRvb2xDYWxsT3B0aW9ucywgSUV4dGVybmFsUHJlVG9vbFVzZUhvb2tSZXN1bHQsIElMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLCBJUHJlcGFyZWRUb29sSW52b2NhdGlvbiwgaXNUb29sU2V0LCBJVG9vbERhdGEsIElUb29sSW1wbCwgSVRvb2xJbnZvY2F0aW9uLCBJVG9vbEludm9rZWRFdmVudCwgSVRvb2xSZXN1bHQsIElUb29sUmVzdWx0SW5wdXRPdXRwdXREZXRhaWxzLCBJVG9vbFNldCwgU3BlY2VkVG9vbEFsaWFzZXMsIHN0cmluZ2lmeVByb21wdFRzeFBhcnQsIFRvb2xBbmRUb29sU2V0RW5hYmxlbWVudE1hcCwgVG9vbERhdGFTb3VyY2UsIFRvb2xJbnZvY2F0aW9uUHJlc2VudGF0aW9uLCB0b29sTWF0Y2hlc01vZGVsLCBUb29sU2V0LCBUb29sU2V0Rm9yTW9kZWwsIFZTQ29kZVRvb2xSZWZlcmVuY2UgfSBmcm9tICcuLi8uLi9jb21tb24vdG9vbHMvbGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVG9vbFJlc3VsdENvbXByZXNzb3IgfSBmcm9tICcuLi8uLi9jb21tb24vdG9vbHMvdG9vbFJlc3VsdENvbXByZXNzb3IuanMnO1xuaW1wb3J0IHsgZ2V0VG9vbENvbmZpcm1hdGlvbkFsZXJ0IH0gZnJvbSAnLi4vYWNjZXNzaWJpbGl0eS9jaGF0QWNjZXNzaWJpbGl0eVByb3ZpZGVyLmpzJztcbmltcG9ydCB7IElDaGF0V2lkZ2V0U2VydmljZSB9IGZyb20gJy4uL2NoYXQuanMnO1xuaW1wb3J0IHsgSUNoYXRUb29sUmlza0Fzc2Vzc21lbnRTZXJ2aWNlLCBUb29sUmlza0xldmVsIH0gZnJvbSAnLi9jaGF0VG9vbFJpc2tBc3Nlc3NtZW50U2VydmljZS5qcyc7XG5cbmNvbnN0IGpzb25TY2hlbWFSZWdpc3RyeSA9IFJlZ2lzdHJ5LmFzPEpTT05Db250cmlidXRpb25SZWdpc3RyeS5JSlNPTkNvbnRyaWJ1dGlvblJlZ2lzdHJ5PihKU09OQ29udHJpYnV0aW9uUmVnaXN0cnkuRXh0ZW5zaW9ucy5KU09OQ29udHJpYnV0aW9uKTtcblxuaW50ZXJmYWNlIElUb29sRW50cnkge1xuXHRkYXRhOiBJVG9vbERhdGE7XG5cdGltcGw/OiBJVG9vbEltcGw7XG59XG5cbmludGVyZmFjZSBJVHJhY2tlZENhbGwge1xuXHRzdG9yZTogSURpc3Bvc2FibGU7XG59XG5cbmV4cG9ydCBjb25zdCBlbnVtIEF1dG9BcHByb3ZlU3RvcmFnZUtleXMge1xuXHRHbG9iYWxBdXRvQXBwcm92ZU9wdEluID0gJ2NoYXQudG9vbHMuZ2xvYmFsLmF1dG9BcHByb3ZlLm9wdEluJ1xufVxuXG5jb25zdCBTa2lwQXV0b0FwcHJvdmVDb25maXJtYXRpb25LZXkgPSAndnNjb2RlLmNoYXQudG9vbHMuZ2xvYmFsLmF1dG9BcHByb3ZlLnRlc3RNb2RlJztcblxuLyoqXG4gKiBNYXJrcyBhIHtAbGluayBUb29sQ29uZmlybUtpbmQuQ29uZmlybWF0aW9uTm90TmVlZGVkfSBkZWNpc2lvbiB0aGF0IGNhbWUgZnJvbSB0aGUgc2Vzc2lvblxuICogYXV0by1hcHByb3ZpbmcgZXZlcnl0aGluZywgcmF0aGVyIHRoYW4gYSBwZXItdG9vbCBzZXR0aW5nIG9yIGFuIGV4cGxpY2l0IHVzZXIgYWN0aW9uLiBTaGFyZWQgc29cbiAqIGBzaG91bGRBdXRvQ29uZmlybWAsIHRoZSBBdXRvcGlsb3QgcmlzayBnYXRlLCBhbmQgYXBwcm92YWwgdGVsZW1ldHJ5IHVzZSB0aGUgc2FtZSBzdHJpbmcuXG4gKi9cbmNvbnN0IGF1dG9BcHByb3ZlQWxsUmVhc29uID0gJ2F1dG8tYXBwcm92ZS1hbGwnO1xuXG4vLyBUaGlzIHRvb2wgd2lsbCBhbHdheXMgcmVxdWlyZSB1c2VyIGNvbmZpcm1hdGlvbiBldmVuIGluIGF1dG8gYXBwcm92YWwgbW9kZS5cbi8vIFVzZXJzIGNhbm5vdCBhdXRvIGFwcHJvdmUgdGhpcyB0b29sIHZpYSBzZXR0aW5ncyBlaXRoZXIsIGFzIHRoaXMgaXMgYSB0b29sIHVzZWQgYmVmb3JlIHRoZSBhZ2VudGljIGxvb3AuXG5jb25zdCB0b29sSWRzVGhhdENhbm5vdEJlQXV0b0FwcHJvdmVkID0gbmV3IFNldChbXG5cdCd2c2NvZGVfZ2V0X2NvbmZpcm1hdGlvbl93aXRoX29wdGlvbnMnLFxuXHQndnNjb2RlX2dldF9tb2RpZmllZF9maWxlc19jb25maXJtYXRpb24nLFxuXSk7XG5cbi8vIEZldGNoIHVzZXMgdHdvIHRvb2xzOiB0aGUgbW9kZWwtZmFjaW5nICdjb3BpbG90X2ZldGNoV2ViUGFnZScgYW5kIHRoZSBpbnRlcm5hbFxuLy8gJ3ZzY29kZV9mZXRjaFdlYlBhZ2VfaW50ZXJuYWwnIGl0IGRlbGVnYXRlcyB0by4gQm90aCBhdXRvLWFwcHJvdmUgdGhlbXNlbHZlcywgc28gdGhlIEF1dG9waWxvdFxuLy8gcmlzayBnYXRlIGNsYXNzaWZpZXMgdGhlbSB0byBjYXRjaCBkYW5nZXJvdXMgZmV0Y2hlcyAobGVha2luZyBzZWNyZXRzIHRvIGFuIGF0dGFja2VyIFVSTCxcbi8vIGhpdHRpbmcgaW50ZXJuYWwgaG9zdHMpLlxuY29uc3QgZmV0Y2hXZWJQYWdlVG9vbElkcyA9IG5ldyBTZXQoW1xuXHQnY29waWxvdF9mZXRjaFdlYlBhZ2UnLFxuXHQndnNjb2RlX2ZldGNoV2ViUGFnZV9pbnRlcm5hbCcsXG5dKTtcblxuZXhwb3J0IGNvbnN0IGdsb2JhbEF1dG9BcHByb3ZlRGVzY3JpcHRpb24gPSBsb2NhbGl6ZTIoXG5cdHtcblx0XHRrZXk6ICdhdXRvQXBwcm92ZTMubWFya2Rvd24nLFxuXHRcdGNvbW1lbnQ6IFtcblx0XHRcdCd7TG9ja2VkPVxcJ10oaHR0cHM6Ly9naXRodWIuY29tL2ZlYXR1cmVzL2NvZGVzcGFjZXMpXFwnfScsXG5cdFx0XHQne0xvY2tlZD1cXCddKGh0dHBzOi8vbWFya2V0cGxhY2UudmlzdWFsc3R1ZGlvLmNvbS9pdGVtcz9pdGVtTmFtZT1tcy12c2NvZGUtcmVtb3RlLnJlbW90ZS1jb250YWluZXJzKVxcJ30nLFxuXHRcdFx0J3tMb2NrZWQ9XFwnXShodHRwczovL2NvZGUudmlzdWFsc3R1ZGlvLmNvbS9kb2NzL2FnZW50cy9ydW4vc2VjdXJpdHkpXFwnfScsXG5cdFx0XHQne0xvY2tlZD1cXCcqKlxcJ30nLFxuXHRcdFx0J3tMb2NrZWQ9XFwnW2BjaGF0LmF1dG9SZXBseWBdKGNvbW1hbmQ6d29ya2JlbmNoLmFjdGlvbi5vcGVuU2V0dGluZ3M/JTVCJTIyY2hhdC5hdXRvUmVwbHklMjIlNUQpXFwnfScsXG5cdFx0XVxuXHR9LFxuXHQnR2xvYmFsIGF1dG8gYXBwcm92ZSBhbHNvIGtub3duIGFzIFwiWU9MTyBtb2RlXCIgZGlzYWJsZXMgbWFudWFsIGFwcHJvdmFsIGNvbXBsZXRlbHkgZm9yIF9hbGwgdG9vbHMgaW4gYWxsIHdvcmtzcGFjZXNfLCBhbGxvd2luZyB0aGUgYWdlbnQgdG8gYWN0IGZ1bGx5IGF1dG9ub21vdXNseS4gVGhpcyBpcyBleHRyZW1lbHkgZGFuZ2Vyb3VzIGFuZCBpcyAqbmV2ZXIqIHJlY29tbWVuZGVkLCBldmVuIGNvbnRhaW5lcml6ZWQgZW52aXJvbm1lbnRzIGxpa2UgW0NvZGVzcGFjZXNdKGh0dHBzOi8vZ2l0aHViLmNvbS9mZWF0dXJlcy9jb2Rlc3BhY2VzKSBhbmQgW0RldiBDb250YWluZXJzXShodHRwczovL21hcmtldHBsYWNlLnZpc3VhbHN0dWRpby5jb20vaXRlbXM/aXRlbU5hbWU9bXMtdnNjb2RlLXJlbW90ZS5yZW1vdGUtY29udGFpbmVycykgaGF2ZSB1c2VyIGtleXMgZm9yd2FyZGVkIGludG8gdGhlIGNvbnRhaW5lciB0aGF0IGNvdWxkIGJlIGNvbXByb21pc2VkLlxcblxcbioqVGhpcyBmZWF0dXJlIGRpc2FibGVzIFtjcml0aWNhbCBzZWN1cml0eSBwcm90ZWN0aW9uc10oaHR0cHM6Ly9jb2RlLnZpc3VhbHN0dWRpby5jb20vZG9jcy9hZ2VudHMvcnVuL3NlY3VyaXR5KSBhbmQgbWFrZXMgaXQgbXVjaCBlYXNpZXIgZm9yIGFuIGF0dGFja2VyIHRvIGNvbXByb21pc2UgdGhlIG1hY2hpbmUuKipcXG5cXG5Ob3RlOiBUaGlzIHNldHRpbmcgb25seSBjb250cm9scyB0b29sIGFwcHJvdmFsIGFuZCBkb2VzIG5vdCBwcmV2ZW50IHRoZSBhZ2VudCBmcm9tIGFza2luZyBxdWVzdGlvbnMuIFRvIGF1dG9tYXRpY2FsbHkgYW5zd2VyIGFnZW50IHF1ZXN0aW9ucywgdXNlIHRoZSBbYGNoYXQuYXV0b1JlcGx5YF0oY29tbWFuZDp3b3JrYmVuY2guYWN0aW9uLm9wZW5TZXR0aW5ncz8lNUIlMjJjaGF0LmF1dG9SZXBseSUyMiU1RCkgc2V0dGluZy4nXG4pO1xuXG5leHBvcnQgY2xhc3MgTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSB7XG5cdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgdnNjb2RlVG9vbFNldDogVG9vbFNldDtcblx0cmVhZG9ubHkgZXhlY3V0ZVRvb2xTZXQ6IFRvb2xTZXQ7XG5cdHJlYWRvbmx5IHJlYWRUb29sU2V0OiBUb29sU2V0O1xuXHRyZWFkb25seSBhZ2VudFRvb2xTZXQ6IFRvb2xTZXQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VUb29scyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVRvb2xzID0gdGhpcy5fb25EaWRDaGFuZ2VUb29scy5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRQcmVwYXJlVG9vbENhbGxCZWNvbWVVbnJlc3BvbnNpdmUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx7IHNlc3Npb25SZXNvdXJjZTogVVJJOyB0b29sRGF0YTogSVRvb2xEYXRhIH0+KCkpO1xuXHRyZWFkb25seSBvbkRpZFByZXBhcmVUb29sQ2FsbEJlY29tZVVucmVzcG9uc2l2ZSA9IHRoaXMuX29uRGlkUHJlcGFyZVRvb2xDYWxsQmVjb21lVW5yZXNwb25zaXZlLmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZEludm9rZVRvb2wgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJVG9vbEludm9rZWRFdmVudD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkSW52b2tlVG9vbCA9IHRoaXMuX29uRGlkSW52b2tlVG9vbC5ldmVudDtcblxuXHQvKiogVGhyb3R0bGUgdG9vbHMgdXBkYXRlcyBiZWNhdXNlIGl0IHNlbmRzIGFsbCB0b29scyBhbmQgcnVucyBvbiBjb250ZXh0IGtleSB1cGRhdGVzICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlVG9vbHNTY2hlZHVsZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgUnVuT25jZVNjaGVkdWxlcigoKSA9PiB0aGlzLl9vbkRpZENoYW5nZVRvb2xzLmZpcmUoKSwgNzUwKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Rvb2xzID0gbmV3IE1hcDxzdHJpbmcsIElUb29sRW50cnk+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Rvb2xDb250ZXh0S2V5cyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jdHhUb29sc0NvdW50OiBJQ29udGV4dEtleTxudW1iZXI+O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2NhbGxzQnlSZXF1ZXN0SWQgPSBuZXcgTWFwPHN0cmluZywgSVRyYWNrZWRDYWxsW10+KCk7XG5cblx0LyoqIFBlbmRpbmcgdG9vbCBjYWxscyBpbiB0aGUgc3RyZWFtaW5nIHBoYXNlLCBrZXllZCBieSB0b29sQ2FsbElkICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3BlbmRpbmdUb29sQ2FsbHMgPSBuZXcgTWFwPHN0cmluZywgQ2hhdFRvb2xJbnZvY2F0aW9uPigpO1xuXG5cdC8qKiBEZWR1cGxpY2F0ZXMgX2NoZWNrR2xvYmFsQXV0b0FwcHJvdmUgY2FsbHMgd2l0aGluIHRoaXMgd2luZG93ICovXG5cdHByaXZhdGUgX3BlbmRpbmdHbG9iYWxBdXRvQXBwcm92ZUNoZWNrOiBQcm9taXNlPGJvb2xlYW4+IHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2lzQWdlbnRNb2RlRW5hYmxlZDogSU9ic2VydmFibGU8Ym9vbGVhbj47XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9pbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9leHRlbnNpb25TZXJ2aWNlOiBJRXh0ZW5zaW9uU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElDaGF0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jaGF0U2VydmljZTogSUNoYXRTZXJ2aWNlLFxuXHRcdEBJRGlhbG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9kaWFsb2dTZXJ2aWNlOiBJRGlhbG9nU2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUFjY2Vzc2liaWxpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2FjY2Vzc2liaWxpdHlTZXJ2aWNlOiBJQWNjZXNzaWJpbGl0eVNlcnZpY2UsXG5cdFx0QElBY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9hY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZTogSUFjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASUxhbmd1YWdlTW9kZWxUb29sc0NvbmZpcm1hdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29uZmlybWF0aW9uU2VydmljZTogSUxhbmd1YWdlTW9kZWxUb29sc0NvbmZpcm1hdGlvblNlcnZpY2UsXG5cdFx0QElDb21tYW5kU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJQ2hhdFdpZGdldFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY2hhdFdpZGdldFNlcnZpY2U6IElDaGF0V2lkZ2V0U2VydmljZSxcblx0XHRASVRvb2xSZXN1bHRDb21wcmVzc29yIHByaXZhdGUgcmVhZG9ubHkgX3Rvb2xSZXN1bHRDb21wcmVzc29yOiBJVG9vbFJlc3VsdENvbXByZXNzb3IsXG5cdFx0QElDaGF0VG9vbFJpc2tBc3Nlc3NtZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9yaXNrQXNzZXNzbWVudFNlcnZpY2U6IElDaGF0VG9vbFJpc2tBc3Nlc3NtZW50U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX2lzQWdlbnRNb2RlRW5hYmxlZCA9IG9ic2VydmFibGVDb25maWdWYWx1ZShDaGF0Q29uZmlndXJhdGlvbi5BZ2VudEVuYWJsZWQsIHRydWUsIHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlLm9uRGlkQ2hhbmdlQ29udGV4dChlID0+IHtcblx0XHRcdGlmIChlLmFmZmVjdHNTb21lKHRoaXMuX3Rvb2xDb250ZXh0S2V5cykpIHtcblx0XHRcdFx0Ly8gTm90IHdvcnRoIGl0IHRvIGNvbXB1dGUgYSBkZWx0YSBoZXJlIHVubGVzcyB3ZSBoYXZlIG1hbnkgdG9vbHMgY2hhbmdpbmcgb2Z0ZW5cblx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VUb29sc1NjaGVkdWxlci5zY2hlZHVsZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHtcblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKENoYXRDb25maWd1cmF0aW9uLkV4dGVuc2lvblRvb2xzRW5hYmxlZCkgfHwgZS5hZmZlY3RzQ29uZmlndXJhdGlvbihDaGF0Q29uZmlndXJhdGlvbi5BZ2VudEVuYWJsZWQpIHx8IGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oQ29waWxvdENoYXRTZXR0aW5nSWQuR3B0NTVSZWFkRmlsZVRvb2xFbmFibGVkKSkge1xuXHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZVRvb2xzU2NoZWR1bGVyLnNjaGVkdWxlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gQ2xlYXIgb3V0IHdhcm5pbmcgYWNjZXB0ZWQgc3RhdGUgaWYgdGhlIHNldHRpbmcgaXMgZGlzYWJsZWRcblx0XHR0aGlzLl9yZWdpc3RlcihFdmVudC5ydW5BbmRTdWJzY3JpYmUodGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uLCBlID0+IHtcblx0XHRcdGlmICghZSB8fCBlLmFmZmVjdHNDb25maWd1cmF0aW9uKENoYXRDb25maWd1cmF0aW9uLkdsb2JhbEF1dG9BcHByb3ZlKSkge1xuXHRcdFx0XHRpZiAodGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoQ2hhdENvbmZpZ3VyYXRpb24uR2xvYmFsQXV0b0FwcHJvdmUpICE9PSB0cnVlKSB7XG5cdFx0XHRcdFx0dGhpcy5fc3RvcmFnZVNlcnZpY2UucmVtb3ZlKEF1dG9BcHByb3ZlU3RvcmFnZUtleXMuR2xvYmFsQXV0b0FwcHJvdmVPcHRJbiwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX2N0eFRvb2xzQ291bnQgPSBDaGF0Q29udGV4dEtleXMuVG9vbHMudG9vbHNDb3VudC5iaW5kVG8oX2NvbnRleHRLZXlTZXJ2aWNlKTtcblxuXHRcdC8vIENyZWF0ZSB0aGUgaW50ZXJuYWwgVlMgQ29kZSB0b29sIHNldFxuXHRcdHRoaXMudnNjb2RlVG9vbFNldCA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuY3JlYXRlVG9vbFNldChcblx0XHRcdFRvb2xEYXRhU291cmNlLkludGVybmFsLFxuXHRcdFx0J3ZzY29kZScsXG5cdFx0XHRWU0NvZGVUb29sUmVmZXJlbmNlLnZzY29kZSxcblx0XHRcdHtcblx0XHRcdFx0aWNvbjogVGhlbWVJY29uLmZyb21JZChDb2RpY29uLnZzY29kZS5pZCksXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY29waWxvdC50b29sU2V0LnZzY29kZS5kZXNjcmlwdGlvbicsICdVc2UgVlMgQ29kZSBmZWF0dXJlcycpLFxuXHRcdFx0XHRkZXByZWNhdGVkOiB0cnVlLFxuXHRcdFx0fVxuXHRcdCkpO1xuXG5cdFx0Ly8gQ3JlYXRlIHRoZSBpbnRlcm5hbCBFeGVjdXRlIHRvb2wgc2V0XG5cdFx0dGhpcy5leGVjdXRlVG9vbFNldCA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuY3JlYXRlVG9vbFNldChcblx0XHRcdFRvb2xEYXRhU291cmNlLkludGVybmFsLFxuXHRcdFx0J2V4ZWN1dGUnLFxuXHRcdFx0U3BlY2VkVG9vbEFsaWFzZXMuZXhlY3V0ZSxcblx0XHRcdHtcblx0XHRcdFx0aWNvbjogVGhlbWVJY29uLmZyb21JZChDb2RpY29uLnRlcm1pbmFsLmlkKSxcblx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdjb3BpbG90LnRvb2xTZXQuZXhlY3V0ZS5kZXNjcmlwdGlvbicsICdFeGVjdXRlIGNvZGUgYW5kIGFwcGxpY2F0aW9ucyBvbiB5b3VyIG1hY2hpbmUnKSxcblx0XHRcdFx0ZGVwcmVjYXRlZDogdHJ1ZSxcblx0XHRcdH1cblx0XHQpKTtcblxuXHRcdC8vIENyZWF0ZSB0aGUgaW50ZXJuYWwgUmVhZCB0b29sIHNldFxuXHRcdHRoaXMucmVhZFRvb2xTZXQgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmNyZWF0ZVRvb2xTZXQoXG5cdFx0XHRUb29sRGF0YVNvdXJjZS5JbnRlcm5hbCxcblx0XHRcdCdyZWFkJyxcblx0XHRcdFNwZWNlZFRvb2xBbGlhc2VzLnJlYWQsXG5cdFx0XHR7XG5cdFx0XHRcdGljb246IFRoZW1lSWNvbi5mcm9tSWQoQ29kaWNvbi5ib29rLmlkKSxcblx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdjb3BpbG90LnRvb2xTZXQucmVhZC5kZXNjcmlwdGlvbicsICdSZWFkIGZpbGVzIGluIHlvdXIgd29ya3NwYWNlJyksXG5cdFx0XHRcdGRlcHJlY2F0ZWQ6IHRydWUsXG5cdFx0XHR9XG5cdFx0KSk7XG5cblx0XHQvLyBDcmVhdGUgdGhlIGludGVybmFsIEFnZW50IHRvb2wgc2V0XG5cdFx0dGhpcy5hZ2VudFRvb2xTZXQgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmNyZWF0ZVRvb2xTZXQoXG5cdFx0XHRUb29sRGF0YVNvdXJjZS5JbnRlcm5hbCxcblx0XHRcdCdhZ2VudCcsXG5cdFx0XHRTcGVjZWRUb29sQWxpYXNlcy5hZ2VudCxcblx0XHRcdHtcblx0XHRcdFx0aWNvbjogVGhlbWVJY29uLmZyb21JZChDb2RpY29uLmFnZW50LmlkKSxcblx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdjb3BpbG90LnRvb2xTZXQuYWdlbnQuZGVzY3JpcHRpb24nLCAnRGVsZWdhdGUgdGFza3MgdG8gb3RoZXIgYWdlbnRzJyksXG5cdFx0XHRcdGRlcHJlY2F0ZWQ6IHRydWUsXG5cdFx0XHR9XG5cdFx0KSk7XG5cdH1cblxuXHRwcml2YXRlIGlzVG9vbEVuYWJsZWRGb3JNb2RlbCh0b29sRGF0YTogSVRvb2xEYXRhLCBtb2RlbDogSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGEgfCB1bmRlZmluZWQpOiBib29sZWFuIHtcblx0XHRpZiAoIXRvb2xNYXRjaGVzTW9kZWwodG9vbERhdGEsIG1vZGVsKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGlmICh0b29sRGF0YS5pZCA9PT0gQ29waWxvdFRvb2xJZC5SZWFkRmlsZSAmJiBtb2RlbD8uZmFtaWx5LnN0YXJ0c1dpdGgoJ2dwdC01LjUnKSAmJiB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihDb3BpbG90Q2hhdFNldHRpbmdJZC5HcHQ1NVJlYWRGaWxlVG9vbEVuYWJsZWQpID09PSBmYWxzZSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJldHVybnMgaWYgdGhlIGdpdmVuIHRvb2wgb3IgdG9vbHNldCBpcyBwZXJtaXR0ZWQgaW4gdGhlIGN1cnJlbnQgY29udGV4dC5cblx0ICogV2hlbiBhZ2VudCBtb2RlIGlzIGVuYWJsZWQsIGFsbCB0b29scyBhcmUgcGVybWl0dGVkIChubyByZXN0cmljdGlvbilcblx0ICogV2hlbiBhZ2VudCBtb2RlIGlzIGRpc2FibGVkIG9ubHkgYSBzdWJzZXQgb2YgcmVhZC1vbmx5IHRvb2xzIGFyZSBwZXJtaXR0ZWQgaW4gYWdlbnRpYy1sb29wIGNvbnRleHRzLlxuXHQgKi9cblx0cHJpdmF0ZSBpc1Blcm1pdHRlZCh0b29sT3JUb29sU2V0OiBJVG9vbERhdGEgfCBUb29sU2V0LCByZWFkZXI/OiBJUmVhZGVyKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgYWdlbnRNb2RlRW5hYmxlZCA9IHRoaXMuX2lzQWdlbnRNb2RlRW5hYmxlZC5yZWFkKHJlYWRlcik7XG5cdFx0aWYgKGFnZW50TW9kZUVuYWJsZWQgIT09IGZhbHNlKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHQvLyBJbnRlcm5hbCB0b29scyB0aGF0IGV4cGxpY2l0bHkgY2Fubm90IGJlIHJlZmVyZW5jZWQgaW4gcHJvbXB0cyBhcmUgYWx3YXlzIHBlcm1pdHRlZFxuXHRcdC8vIHNpbmNlIHRoZXkgYXJlIGluZnJhc3RydWN0dXJlIHRvb2xzIChlLmcuIGlubGluZV9jaGF0X2V4aXQpLCBub3QgdXNlci1mYWNpbmcgYWdlbnQgdG9vbHNcblx0XHRpZiAoIWlzVG9vbFNldCh0b29sT3JUb29sU2V0KSAmJiB0b29sT3JUb29sU2V0LmNhbkJlUmVmZXJlbmNlZEluUHJvbXB0ID09PSBmYWxzZSAmJiB0b29sT3JUb29sU2V0LnNvdXJjZS50eXBlID09PSAnaW50ZXJuYWwnKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRjb25zdCBwZXJtaXR0ZWRJbnRlcm5hbFRvb2xTZXRJZHMgPSBbU3BlY2VkVG9vbEFsaWFzZXMucmVhZCwgU3BlY2VkVG9vbEFsaWFzZXMuc2VhcmNoLCBTcGVjZWRUb29sQWxpYXNlcy53ZWJdO1xuXHRcdGlmIChpc1Rvb2xTZXQodG9vbE9yVG9vbFNldCkpIHtcblx0XHRcdGNvbnN0IHBlcm1pdHRlZCA9IHRvb2xPclRvb2xTZXQuc291cmNlLnR5cGUgPT09ICdpbnRlcm5hbCcgJiYgcGVybWl0dGVkSW50ZXJuYWxUb29sU2V0SWRzLmluY2x1ZGVzKHRvb2xPclRvb2xTZXQucmVmZXJlbmNlTmFtZSk7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlI2lzUGVybWl0dGVkOiBUb29sU2V0ICR7dG9vbE9yVG9vbFNldC5pZH0gKCR7dG9vbE9yVG9vbFNldC5yZWZlcmVuY2VOYW1lfSkgcGVybWl0dGVkPSR7cGVybWl0dGVkfWApO1xuXHRcdFx0cmV0dXJuIHBlcm1pdHRlZDtcblx0XHR9XG5cdFx0Zm9yIChjb25zdCB0b29sU2V0IG9mIHRoaXMuX3Rvb2xTZXRzKSB7XG5cdFx0XHRpZiAodG9vbFNldC5zb3VyY2UudHlwZSA9PT0gJ2ludGVybmFsJyAmJiBwZXJtaXR0ZWRJbnRlcm5hbFRvb2xTZXRJZHMuaW5jbHVkZXModG9vbFNldC5yZWZlcmVuY2VOYW1lKSkge1xuXHRcdFx0XHRmb3IgKGNvbnN0IG1lbWJlclRvb2wgb2YgdG9vbFNldC5nZXRUb29scygpKSB7XG5cdFx0XHRcdFx0aWYgKG1lbWJlclRvb2wuaWQgPT09IHRvb2xPclRvb2xTZXQuaWQpIHtcblx0XHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYExhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UjaXNQZXJtaXR0ZWQ6IFRvb2wgJHt0b29sT3JUb29sU2V0LmlkfSAoJHt0b29sT3JUb29sU2V0LnRvb2xSZWZlcmVuY2VOYW1lfSkgcGVybWl0dGVkPXRydWUgKG1lbWJlciBvZiAke3Rvb2xTZXQucmVmZXJlbmNlTmFtZX0pYCk7XG5cdFx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBTcGVjaWFsIGNhc2UgZm9yICd2c2NvZGVfZmV0Y2hXZWJQYWdlX2ludGVybmFsJywgd2hpY2ggaXMgYWxsb3dlZCBpZiB3ZSBhbGxvdyAnd2ViJyB0b29sc1xuXHRcdC8vIEZldGNoIGlzIGltcGxlbWVudGVkIHdpdGggdHdvIHRvb2xzLCB0aGlzIG9uZSBhbmQgJ2NvcGlsb3RfZmV0Y2hXZWJQYWdlJ1xuXHRcdGlmICh0b29sT3JUb29sU2V0LmlkID09PSAndnNjb2RlX2ZldGNoV2ViUGFnZV9pbnRlcm5hbCcgJiYgcGVybWl0dGVkSW50ZXJuYWxUb29sU2V0SWRzLmluY2x1ZGVzKFNwZWNlZFRvb2xBbGlhc2VzLndlYikpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYExhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UjaXNQZXJtaXR0ZWQ6IFRvb2wgJHt0b29sT3JUb29sU2V0LmlkfSAoJHt0b29sT3JUb29sU2V0LnRvb2xSZWZlcmVuY2VOYW1lfSkgcGVybWl0dGVkPXRydWUgKHNwZWNpYWwgY2FzZSlgKTtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYExhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UjaXNQZXJtaXR0ZWQ6IFRvb2wgJHt0b29sT3JUb29sU2V0LmlkfSAoJHt0b29sT3JUb29sU2V0LnRvb2xSZWZlcmVuY2VOYW1lfSkgcGVybWl0dGVkPWZhbHNlYCk7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cblx0XHR0aGlzLl9jYWxsc0J5UmVxdWVzdElkLmZvckVhY2goY2FsbHMgPT4gY2FsbHMuZm9yRWFjaChjYWxsID0+IGNhbGwuc3RvcmUuZGlzcG9zZSgpKSk7XG5cdFx0dGhpcy5fcGVuZGluZ1Rvb2xDYWxscy5jbGVhcigpO1xuXHRcdHRoaXMuX2N0eFRvb2xzQ291bnQucmVzZXQoKTtcblx0fVxuXG5cdHJlZ2lzdGVyVG9vbERhdGEodG9vbERhdGE6IElUb29sRGF0YSk6IElEaXNwb3NhYmxlIHtcblx0XHRpZiAodGhpcy5fdG9vbHMuaGFzKHRvb2xEYXRhLmlkKSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBUb29sIFwiJHt0b29sRGF0YS5pZH1cIiBpcyBhbHJlYWR5IHJlZ2lzdGVyZWQuYCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fdG9vbHMuc2V0KHRvb2xEYXRhLmlkLCB7IGRhdGE6IHRvb2xEYXRhIH0pO1xuXHRcdHRoaXMuX2N0eFRvb2xzQ291bnQuc2V0KHRoaXMuX3Rvb2xzLnNpemUpO1xuXHRcdGlmICghdGhpcy5fb25EaWRDaGFuZ2VUb29sc1NjaGVkdWxlci5pc1NjaGVkdWxlZCgpKSB7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZVRvb2xzU2NoZWR1bGVyLnNjaGVkdWxlKCk7XG5cdFx0fVxuXG5cdFx0dG9vbERhdGEud2hlbj8ua2V5cygpLmZvckVhY2goa2V5ID0+IHRoaXMuX3Rvb2xDb250ZXh0S2V5cy5hZGQoa2V5KSk7XG5cblx0XHRsZXQgc3RvcmU6IERpc3Bvc2FibGVTdG9yZSB8IHVuZGVmaW5lZDtcblx0XHRpZiAodG9vbERhdGEuaW5wdXRTY2hlbWEpIHtcblx0XHRcdHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdFx0Y29uc3Qgc2NoZW1hVXJsID0gY3JlYXRlVG9vbFNjaGVtYVVyaSh0b29sRGF0YS5pZCkudG9TdHJpbmcoKTtcblx0XHRcdGpzb25TY2hlbWFSZWdpc3RyeS5yZWdpc3RlclNjaGVtYShzY2hlbWFVcmwsIHRvb2xEYXRhLmlucHV0U2NoZW1hLCBzdG9yZSk7XG5cdFx0XHRzdG9yZS5hZGQoanNvblNjaGVtYVJlZ2lzdHJ5LnJlZ2lzdGVyU2NoZW1hQXNzb2NpYXRpb24oc2NoZW1hVXJsLCBgL2xtL3Rvb2wvJHt0b29sRGF0YS5pZH0vdG9vbF9pbnB1dC5qc29uYCkpO1xuXHRcdH1cblxuXHRcdHJldHVybiB0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0c3RvcmU/LmRpc3Bvc2UoKTtcblx0XHRcdHRoaXMuX3Rvb2xzLmRlbGV0ZSh0b29sRGF0YS5pZCk7XG5cdFx0XHR0aGlzLl9jdHhUb29sc0NvdW50LnNldCh0aGlzLl90b29scy5zaXplKTtcblx0XHRcdHRoaXMuX3JlZnJlc2hBbGxUb29sQ29udGV4dEtleXMoKTtcblx0XHRcdGlmICghdGhpcy5fb25EaWRDaGFuZ2VUb29sc1NjaGVkdWxlci5pc1NjaGVkdWxlZCgpKSB7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlVG9vbHNTY2hlZHVsZXIuc2NoZWR1bGUoKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdGZsdXNoVG9vbFVwZGF0ZXMoKTogdm9pZCB7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VUb29sc1NjaGVkdWxlci5mbHVzaCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVmcmVzaEFsbFRvb2xDb250ZXh0S2V5cygpIHtcblx0XHR0aGlzLl90b29sQ29udGV4dEtleXMuY2xlYXIoKTtcblx0XHRmb3IgKGNvbnN0IHRvb2wgb2YgdGhpcy5fdG9vbHMudmFsdWVzKCkpIHtcblx0XHRcdHRvb2wuZGF0YS53aGVuPy5rZXlzKCkuZm9yRWFjaChrZXkgPT4gdGhpcy5fdG9vbENvbnRleHRLZXlzLmFkZChrZXkpKTtcblx0XHR9XG5cdH1cblxuXHRyZWdpc3RlclRvb2xJbXBsZW1lbnRhdGlvbihpZDogc3RyaW5nLCB0b29sOiBJVG9vbEltcGwpOiBJRGlzcG9zYWJsZSB7XG5cdFx0Y29uc3QgZW50cnkgPSB0aGlzLl90b29scy5nZXQoaWQpO1xuXHRcdGlmICghZW50cnkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgVG9vbCBcIiR7aWR9XCIgd2FzIG5vdCBjb250cmlidXRlZC5gKTtcblx0XHR9XG5cblx0XHRpZiAoZW50cnkuaW1wbCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBUb29sIFwiJHtpZH1cIiBhbHJlYWR5IGhhcyBhbiBpbXBsZW1lbnRhdGlvbi5gKTtcblx0XHR9XG5cblx0XHRlbnRyeS5pbXBsID0gdG9vbDtcblx0XHRyZXR1cm4gdG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdGVudHJ5LmltcGwgPSB1bmRlZmluZWQ7XG5cdFx0fSk7XG5cdH1cblxuXHRyZWdpc3RlclRvb2wodG9vbERhdGE6IElUb29sRGF0YSwgdG9vbDogSVRvb2xJbXBsKTogSURpc3Bvc2FibGUge1xuXHRcdHJldHVybiBjb21iaW5lZERpc3Bvc2FibGUoXG5cdFx0XHR0aGlzLnJlZ2lzdGVyVG9vbERhdGEodG9vbERhdGEpLFxuXHRcdFx0dGhpcy5yZWdpc3RlclRvb2xJbXBsZW1lbnRhdGlvbih0b29sRGF0YS5pZCwgdG9vbClcblx0XHQpO1xuXHR9XG5cblx0Z2V0VG9vbHMobW9kZWw6IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhIHwgdW5kZWZpbmVkKTogSXRlcmFibGU8SVRvb2xEYXRhPiB7XG5cdFx0Y29uc3QgdG9vbERhdGFzID0gSXRlcmFibGUubWFwKHRoaXMuX3Rvb2xzLnZhbHVlcygpLCBpID0+IGkuZGF0YSk7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uVG9vbHNFbmFibGVkID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oQ2hhdENvbmZpZ3VyYXRpb24uRXh0ZW5zaW9uVG9vbHNFbmFibGVkKTtcblx0XHRyZXR1cm4gSXRlcmFibGUuZmlsdGVyKFxuXHRcdFx0dG9vbERhdGFzLFxuXHRcdFx0dG9vbERhdGEgPT4ge1xuXHRcdFx0XHRjb25zdCBzYXRpc2ZpZXNXaGVuQ2xhdXNlID0gIXRvb2xEYXRhLndoZW4gfHwgdGhpcy5fY29udGV4dEtleVNlcnZpY2UuY29udGV4dE1hdGNoZXNSdWxlcyh0b29sRGF0YS53aGVuKTtcblx0XHRcdFx0Y29uc3Qgc2F0aXNmaWVzRXh0ZXJuYWxUb29sQ2hlY2sgPSB0b29sRGF0YS5zb3VyY2UudHlwZSAhPT0gJ2V4dGVuc2lvbicgfHwgISFleHRlbnNpb25Ub29sc0VuYWJsZWQ7XG5cdFx0XHRcdGNvbnN0IHNhdGlzZmllc1Blcm1pdHRlZENoZWNrID0gdGhpcy5pc1Blcm1pdHRlZCh0b29sRGF0YSk7XG5cdFx0XHRcdGNvbnN0IHNhdGlzZmllc01vZGVsRmlsdGVyID0gdGhpcy5pc1Rvb2xFbmFibGVkRm9yTW9kZWwodG9vbERhdGEsIG1vZGVsKTtcblx0XHRcdFx0cmV0dXJuIHNhdGlzZmllc1doZW5DbGF1c2UgJiYgc2F0aXNmaWVzRXh0ZXJuYWxUb29sQ2hlY2sgJiYgc2F0aXNmaWVzUGVybWl0dGVkQ2hlY2sgJiYgc2F0aXNmaWVzTW9kZWxGaWx0ZXI7XG5cdFx0XHR9KTtcblx0fVxuXG5cdG9ic2VydmVUb29scyhtb2RlbDogSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGEgfCB1bmRlZmluZWQpOiBJT2JzZXJ2YWJsZTxyZWFkb25seSBJVG9vbERhdGFbXT4ge1xuXHRcdGNvbnN0IG1ldGEgPSBkZXJpdmVkKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBzaWduYWwgPSBvYnNlcnZhYmxlU2lnbmFsKCdvYnNlcnZlVG9vbHNDb250ZXh0Jyk7XG5cdFx0XHRjb25zdCB0cmlnZ2VyID0gKCkgPT4gdHJhbnNhY3Rpb24odHggPT4gc2lnbmFsLnRyaWdnZXIodHgpKTtcblx0XHRcdHJlYWRlci5zdG9yZS5hZGQodGhpcy5vbkRpZENoYW5nZVRvb2xzKHRyaWdnZXIpKTtcblx0XHRcdHJldHVybiBzaWduYWw7XG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gZGVyaXZlZE9wdHMoeyBlcXVhbHNGbjogYXJyYXlFcXVhbHNDKCkgfSwgcmVhZGVyID0+IHtcblx0XHRcdG1ldGEucmVhZChyZWFkZXIpLnJlYWQocmVhZGVyKTtcblx0XHRcdHJldHVybiBBcnJheS5mcm9tKHRoaXMuZ2V0VG9vbHMobW9kZWwpKTtcblx0XHR9KTtcblx0fVxuXG5cdGdldEFsbFRvb2xzSW5jbHVkaW5nRGlzYWJsZWQoKTogSXRlcmFibGU8SVRvb2xEYXRhPiB7XG5cdFx0Y29uc3QgdG9vbERhdGFzID0gSXRlcmFibGUubWFwKHRoaXMuX3Rvb2xzLnZhbHVlcygpLCBpID0+IGkuZGF0YSk7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uVG9vbHNFbmFibGVkID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oQ2hhdENvbmZpZ3VyYXRpb24uRXh0ZW5zaW9uVG9vbHNFbmFibGVkKTtcblx0XHRyZXR1cm4gSXRlcmFibGUuZmlsdGVyKFxuXHRcdFx0dG9vbERhdGFzLFxuXHRcdFx0dG9vbERhdGEgPT4ge1xuXHRcdFx0XHRjb25zdCBzYXRpc2ZpZXNFeHRlcm5hbFRvb2xDaGVjayA9IHRvb2xEYXRhLnNvdXJjZS50eXBlICE9PSAnZXh0ZW5zaW9uJyB8fCAhIWV4dGVuc2lvblRvb2xzRW5hYmxlZDtcblx0XHRcdFx0Y29uc3Qgc2F0aXNmaWVzUGVybWl0dGVkQ2hlY2sgPSB0aGlzLmlzUGVybWl0dGVkKHRvb2xEYXRhKTtcblx0XHRcdFx0cmV0dXJuIHNhdGlzZmllc0V4dGVybmFsVG9vbENoZWNrICYmIHNhdGlzZmllc1Blcm1pdHRlZENoZWNrO1xuXHRcdFx0fSk7XG5cdH1cblxuXHRnZXRUb29sKGlkOiBzdHJpbmcpOiBJVG9vbERhdGEgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl90b29scy5nZXQoaWQpPy5kYXRhO1xuXHR9XG5cblx0Z2V0VG9vbEJ5TmFtZShuYW1lOiBzdHJpbmcpOiBJVG9vbERhdGEgfCB1bmRlZmluZWQge1xuXHRcdGZvciAoY29uc3QgdG9vbCBvZiB0aGlzLmdldEFsbFRvb2xzSW5jbHVkaW5nRGlzYWJsZWQoKSkge1xuXHRcdFx0aWYgKHRvb2wudG9vbFJlZmVyZW5jZU5hbWUgPT09IG5hbWUpIHtcblx0XHRcdFx0cmV0dXJuIHRvb2w7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIF9oYW5kbGVQcmVUb29sVXNlRGVuaWFsKFxuXHRcdGR0bzogSVRvb2xJbnZvY2F0aW9uLFxuXHRcdGhvb2tSZXN1bHQ6IElFeHRlcm5hbFByZVRvb2xVc2VIb29rUmVzdWx0LFxuXHRcdHRvb2xEYXRhOiBJVG9vbERhdGEgfCB1bmRlZmluZWQsXG5cdFx0cGVuZGluZ0ludm9jYXRpb246IENoYXRUb29sSW52b2NhdGlvbiB8IHVuZGVmaW5lZCxcblx0XHRyZXF1ZXN0OiBJQ2hhdFJlcXVlc3RNb2RlbCB8IHVuZGVmaW5lZCxcblx0KTogSVRvb2xSZXN1bHQge1xuXHRcdGNvbnN0IGhvb2tSZWFzb24gPSBob29rUmVzdWx0LnBlcm1pc3Npb25EZWNpc2lvblJlYXNvbiA/PyBsb2NhbGl6ZSgnaG9va0RlbmllZE5vUmVhc29uJywgXCJIb29rIGRlbmllZCB0b29sIGV4ZWN1dGlvblwiKTtcblx0XHRjb25zdCByZWFzb24gPSBsb2NhbGl6ZSgnZGVuaWVkQnlQcmVUb29sVXNlSG9vaycsIFwiRGVuaWVkIGJ5IHswfSBob29rOiB7MX1cIiwgSG9va1R5cGUuUHJlVG9vbFVzZSwgaG9va1JlYXNvbik7XG5cdFx0dGhpcy5fbG9nU2VydmljZS5kZWJ1ZyhgW0xhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UjaW52b2tlVG9vbF0gVG9vbCAke2R0by50b29sSWR9IGRlbmllZCBieSBwcmVUb29sVXNlIGhvb2s6ICR7aG9va1JlYXNvbn1gKTtcblxuXHRcdGlmICh0b29sRGF0YSkge1xuXHRcdFx0aWYgKHBlbmRpbmdJbnZvY2F0aW9uKSB7XG5cdFx0XHRcdHBlbmRpbmdJbnZvY2F0aW9uLnByZXNlbnRhdGlvbiA9IFRvb2xJbnZvY2F0aW9uUHJlc2VudGF0aW9uLkhpZGRlbjtcblx0XHRcdFx0cGVuZGluZ0ludm9jYXRpb24uY2FuY2VsRnJvbVN0cmVhbWluZyhUb29sQ29uZmlybUtpbmQuRGVuaWVkLCByZWFzb24pO1xuXHRcdFx0fSBlbHNlIGlmIChyZXF1ZXN0KSB7XG5cdFx0XHRcdGNvbnN0IGNhbmNlbGxlZEludm9jYXRpb24gPSBDaGF0VG9vbEludm9jYXRpb24uY3JlYXRlQ2FuY2VsbGVkKFxuXHRcdFx0XHRcdHsgdG9vbENhbGxJZDogZHRvLmNhbGxJZCwgdG9vbElkOiBkdG8udG9vbElkLCB0b29sRGF0YSwgc3ViYWdlbnRJbnZvY2F0aW9uSWQ6IGR0by5zdWJBZ2VudEludm9jYXRpb25JZCwgY2hhdFJlcXVlc3RJZDogZHRvLmNoYXRSZXF1ZXN0SWQgfSxcblx0XHRcdFx0XHRkdG8ucGFyYW1ldGVycyxcblx0XHRcdFx0XHRUb29sQ29uZmlybUtpbmQuRGVuaWVkLFxuXHRcdFx0XHRcdHJlYXNvblxuXHRcdFx0XHQpO1xuXHRcdFx0XHRjYW5jZWxsZWRJbnZvY2F0aW9uLnByZXNlbnRhdGlvbiA9IFRvb2xJbnZvY2F0aW9uUHJlc2VudGF0aW9uLkhpZGRlbjtcblx0XHRcdFx0dGhpcy5fY2hhdFNlcnZpY2UuYXBwZW5kUHJvZ3Jlc3MocmVxdWVzdCwgY2FuY2VsbGVkSW52b2NhdGlvbik7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGNvbnRlbnQ6IFt7IGtpbmQ6ICd0ZXh0JywgdmFsdWU6IGBUb29sIGV4ZWN1dGlvbiBkZW5pZWQ6ICR7aG9va1JlYXNvbn1gIH1dLFxuXHRcdFx0dG9vbFJlc3VsdEVycm9yOiBob29rUmVhc29uLFxuXHRcdH07XG5cdH1cblxuXHQvKipcblx0ICogVmFsaWRhdGUgdXBkYXRlZElucHV0IGZyb20gYSBwcmVUb29sVXNlIGhvb2sgYWdhaW5zdCB0aGUgdG9vbCdzIGlucHV0IHNjaGVtYVxuXHQgKiB1c2luZyB0aGUganNvbi52YWxpZGF0ZSBjb21tYW5kIGZyb20gdGhlIEpTT04gZXh0ZW5zaW9uLlxuXHQgKiBAcmV0dXJucyBBbiBlcnJvciBtZXNzYWdlIHN0cmluZyBpZiB2YWxpZGF0aW9uIGZhaWxzLCBvciB1bmRlZmluZWQgaWYgdmFsaWQuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF92YWxpZGF0ZVVwZGF0ZWRJbnB1dCh0b29sSWQ6IHN0cmluZywgdG9vbERhdGE6IElUb29sRGF0YSB8IHVuZGVmaW5lZCwgdXBkYXRlZElucHV0OiBvYmplY3QpOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmICghdG9vbERhdGE/LmlucHV0U2NoZW1hKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHR5cGUgSnNvbkRpYWdub3N0aWMgPSB7XG5cdFx0XHRtZXNzYWdlOiBzdHJpbmc7XG5cdFx0XHRyYW5nZTogeyBsaW5lOiBudW1iZXI7IGNoYXJhY3RlcjogbnVtYmVyIH1bXTtcblx0XHRcdHNldmVyaXR5OiBzdHJpbmc7XG5cdFx0XHRjb2RlPzogc3RyaW5nIHwgbnVtYmVyO1xuXHRcdH07XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3Qgc2NoZW1hVXJpID0gY3JlYXRlVG9vbFNjaGVtYVVyaSh0b29sSWQpO1xuXHRcdFx0Y29uc3QgaW5wdXRKc29uID0gSlNPTi5zdHJpbmdpZnkodXBkYXRlZElucHV0KTtcblx0XHRcdGNvbnN0IGRpYWdub3N0aWNzID0gYXdhaXQgdGhpcy5fY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQ8SnNvbkRpYWdub3N0aWNbXT4oJ2pzb24udmFsaWRhdGUnLCBzY2hlbWFVcmksIGlucHV0SnNvbikgfHwgW107XG5cdFx0XHRpZiAoZGlhZ25vc3RpY3MubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRyZXR1cm4gZGlhZ25vc3RpY3MubWFwKGQgPT4gZC5tZXNzYWdlKS5qb2luKCc7ICcpO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdC8vIGpzb24gZXh0ZW5zaW9uIG1heSBub3QgYmUgYXZhaWxhYmxlOyBza2lwIHZhbGlkYXRpb25cblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZGVidWcoYFtMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlI192YWxpZGF0ZVVwZGF0ZWRJbnB1dF0ganNvbi52YWxpZGF0ZSBjb21tYW5kIGZhaWxlZCwgc2tpcHBpbmcgdmFsaWRhdGlvbjogJHt0b0Vycm9yTWVzc2FnZShlKX1gKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0YXN5bmMgaW52b2tlVG9vbChkdG86IElUb29sSW52b2NhdGlvbiwgY291bnRUb2tlbnM6IENvdW50VG9rZW5zQ2FsbGJhY2ssIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVRvb2xSZXN1bHQ+IHtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBbTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSNpbnZva2VUb29sXSBJbnZva2luZyB0b29sICR7ZHRvLnRvb2xJZH0gd2l0aCBwYXJhbWV0ZXJzICR7SlNPTi5zdHJpbmdpZnkoZHRvLnBhcmFtZXRlcnMpfWApO1xuXG5cdFx0Y29uc3QgdG9vbERhdGEgPSB0aGlzLl90b29scy5nZXQoZHRvLnRvb2xJZCk/LmRhdGE7XG5cdFx0bGV0IG1vZGVsOiBJQ2hhdE1vZGVsIHwgdW5kZWZpbmVkO1xuXHRcdGxldCByZXF1ZXN0OiBJQ2hhdFJlcXVlc3RNb2RlbCB8IHVuZGVmaW5lZDtcblx0XHRpZiAoZHRvLmNvbnRleHQ/LnNlc3Npb25SZXNvdXJjZSkge1xuXHRcdFx0bW9kZWwgPSB0aGlzLl9jaGF0U2VydmljZS5nZXRTZXNzaW9uKGR0by5jb250ZXh0LnNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRyZXF1ZXN0ID0gbW9kZWw/LmdldFJlcXVlc3RzKCkuYXQoLTEpO1xuXHRcdFx0aWYgKHJlcXVlc3Q/LnJlc3BvbnNlPy5pc0NhbmNlbGVkIHx8IHJlcXVlc3Q/LnJlc3BvbnNlPy5pc0NvbXBsZXRlKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZGVidWcoYFtMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlI2ludm9rZVRvb2xdIElnbm9yaW5nIHRvb2wgJHtkdG8udG9vbElkfSBmb3IgY2FuY2VsbGVkL2NvbXBsZXRlIHJlcXVlc3QgJHtyZXF1ZXN0LmlkfWApO1xuXHRcdFx0XHR0aHJvdyBuZXcgQ2FuY2VsbGF0aW9uRXJyb3IoKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gRW5yaWNoIGNvbnRleHQgd2l0aCB3b3JraW5nIGRpcmVjdG9yeSBmcm9tIHRoZSBtb2RlbCBpZiBhdmFpbGFibGVcblx0XHRcdGlmIChtb2RlbD8ud29ya2luZ0RpcmVjdG9yeSAmJiAhZHRvLmNvbnRleHQud29ya2luZ0RpcmVjdG9yeSkge1xuXHRcdFx0XHRkdG8gPSB7IC4uLmR0bywgY29udGV4dDogeyAuLi5kdG8uY29udGV4dCwgd29ya2luZ0RpcmVjdG9yeTogbW9kZWwud29ya2luZ0RpcmVjdG9yeSB9IH07XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gQ2hlY2sgaWYgdGhlcmUncyBhbiBleGlzdGluZyBwZW5kaW5nIHRvb2wgY2FsbCBmcm9tIHN0cmVhbWluZyBwaGFzZSBCRUZPUkUgaG9vayBjaGVja1xuXHRcdGxldCBwZW5kaW5nVG9vbENhbGxLZXk6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRsZXQgdG9vbEludm9jYXRpb246IENoYXRUb29sSW52b2NhdGlvbiB8IHVuZGVmaW5lZDtcblx0XHRpZiAodGhpcy5fcGVuZGluZ1Rvb2xDYWxscy5oYXMoZHRvLmNhbGxJZCkpIHtcblx0XHRcdHBlbmRpbmdUb29sQ2FsbEtleSA9IGR0by5jYWxsSWQ7XG5cdFx0XHR0b29sSW52b2NhdGlvbiA9IHRoaXMuX3BlbmRpbmdUb29sQ2FsbHMuZ2V0KGR0by5jYWxsSWQpO1xuXHRcdH0gZWxzZSBpZiAoZHRvLmNoYXRTdHJlYW1Ub29sQ2FsbElkICYmIHRoaXMuX3BlbmRpbmdUb29sQ2FsbHMuaGFzKGR0by5jaGF0U3RyZWFtVG9vbENhbGxJZCkpIHtcblx0XHRcdHBlbmRpbmdUb29sQ2FsbEtleSA9IGR0by5jaGF0U3RyZWFtVG9vbENhbGxJZDtcblx0XHRcdHRvb2xJbnZvY2F0aW9uID0gdGhpcy5fcGVuZGluZ1Rvb2xDYWxscy5nZXQoZHRvLmNoYXRTdHJlYW1Ub29sQ2FsbElkKTtcblx0XHR9XG5cblx0XHRsZXQgcmVxdWVzdElkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IHN0b3JlOiBEaXNwb3NhYmxlU3RvcmUgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKGR0by5jb250ZXh0ICYmIHJlcXVlc3QpIHtcblx0XHRcdHJlcXVlc3RJZCA9IHJlcXVlc3QuaWQ7XG5cdFx0XHRzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRcdGlmICghdGhpcy5fY2FsbHNCeVJlcXVlc3RJZC5oYXMocmVxdWVzdElkKSkge1xuXHRcdFx0XHR0aGlzLl9jYWxsc0J5UmVxdWVzdElkLnNldChyZXF1ZXN0SWQsIFtdKTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHRyYWNrZWRDYWxsOiBJVHJhY2tlZENhbGwgPSB7IHN0b3JlIH07XG5cdFx0XHR0aGlzLl9jYWxsc0J5UmVxdWVzdElkLmdldChyZXF1ZXN0SWQpIS5wdXNoKHRyYWNrZWRDYWxsKTtcblxuXHRcdFx0Y29uc3Qgc291cmNlID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCk7XG5cdFx0XHRzdG9yZS5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdFx0c291cmNlLmRpc3Bvc2UodHJ1ZSk7XG5cdFx0XHR9KSk7XG5cdFx0XHRzdG9yZS5hZGQodG9rZW4ub25DYW5jZWxsYXRpb25SZXF1ZXN0ZWQoKCgpID0+IHtcblx0XHRcdFx0SUNoYXRUb29sSW52b2NhdGlvbi5jb25maXJtV2l0aCh0b29sSW52b2NhdGlvbiwgeyB0eXBlOiBUb29sQ29uZmlybUtpbmQuRGVuaWVkIH0pO1xuXHRcdFx0XHRzb3VyY2UuY2FuY2VsKCk7XG5cdFx0XHR9KSkpO1xuXHRcdFx0c3RvcmUuYWRkKHNvdXJjZS50b2tlbi5vbkNhbmNlbGxhdGlvblJlcXVlc3RlZCgoKSA9PiB7XG5cdFx0XHRcdElDaGF0VG9vbEludm9jYXRpb24uY29uZmlybVdpdGgodG9vbEludm9jYXRpb24sIHsgdHlwZTogVG9vbENvbmZpcm1LaW5kLkRlbmllZCB9KTtcblx0XHRcdH0pKTtcblx0XHRcdHRva2VuID0gc291cmNlLnRva2VuO1xuXHRcdH1cblxuXHRcdC8vIEhhbmRsZSBwcmVUb29sVXNlIGhvb2sgZGVuaWFsXG5cdFx0Y29uc3QgcHJlVG9vbFVzZUhvb2tSZXN1bHQgPSBkdG8ucHJlVG9vbFVzZVJlc3VsdDtcblx0XHRpZiAocHJlVG9vbFVzZUhvb2tSZXN1bHQ/LnBlcm1pc3Npb25EZWNpc2lvbiA9PT0gJ2RlbnknKSB7XG5cdFx0XHRjb25zdCBkZW5pYWxSZXN1bHQgPSB0aGlzLl9oYW5kbGVQcmVUb29sVXNlRGVuaWFsKGR0bywgcHJlVG9vbFVzZUhvb2tSZXN1bHQsIHRvb2xEYXRhLCB0b29sSW52b2NhdGlvbiwgcmVxdWVzdCk7XG5cdFx0XHRpZiAocGVuZGluZ1Rvb2xDYWxsS2V5KSB7XG5cdFx0XHRcdHRoaXMuX3BlbmRpbmdUb29sQ2FsbHMuZGVsZXRlKHBlbmRpbmdUb29sQ2FsbEtleSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gZGVuaWFsUmVzdWx0O1xuXHRcdH1cblxuXHRcdC8vIEFwcGx5IHVwZGF0ZWRJbnB1dCBmcm9tIHByZVRvb2xVc2UgaG9vayBpZiBwcm92aWRlZCwgYWZ0ZXIgdmFsaWRhdGluZyBhZ2FpbnN0IHRoZSB0b29sJ3MgaW5wdXQgc2NoZW1hXG5cdFx0aWYgKHByZVRvb2xVc2VIb29rUmVzdWx0Py51cGRhdGVkSW5wdXQpIHtcblx0XHRcdGNvbnN0IHZhbGlkYXRpb25FcnJvciA9IGF3YWl0IHRoaXMuX3ZhbGlkYXRlVXBkYXRlZElucHV0KGR0by50b29sSWQsIHRvb2xEYXRhLCBwcmVUb29sVXNlSG9va1Jlc3VsdC51cGRhdGVkSW5wdXQpO1xuXHRcdFx0aWYgKHZhbGlkYXRpb25FcnJvcikge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlI2ludm9rZVRvb2xdIFRvb2wgJHtkdG8udG9vbElkfSB1cGRhdGVkSW5wdXQgZnJvbSBwcmVUb29sVXNlIGhvb2sgZmFpbGVkIHNjaGVtYSB2YWxpZGF0aW9uOiAke3ZhbGlkYXRpb25FcnJvcn1gKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZGVidWcoYFtMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlI2ludm9rZVRvb2xdIFRvb2wgJHtkdG8udG9vbElkfSBpbnB1dCBtb2RpZmllZCBieSBwcmVUb29sVXNlIGhvb2tgKTtcblx0XHRcdFx0ZHRvLnBhcmFtZXRlcnMgPSBwcmVUb29sVXNlSG9va1Jlc3VsdC51cGRhdGVkSW5wdXQ7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gRmlyZSB0aGUgZXZlbnQgdG8gbm90aWZ5IGxpc3RlbmVycyB0aGF0IGEgdG9vbCBpcyBiZWluZyBpbnZva2VkXG5cdFx0dGhpcy5fb25EaWRJbnZva2VUb29sLmZpcmUoe1xuXHRcdFx0dG9vbElkOiBkdG8udG9vbElkLFxuXHRcdFx0c2Vzc2lvblJlc291cmNlOiBkdG8uY29udGV4dD8uc2Vzc2lvblJlc291cmNlLFxuXHRcdFx0cmVxdWVzdElkOiBkdG8uY2hhdFJlcXVlc3RJZCxcblx0XHRcdHN1YmFnZW50SW52b2NhdGlvbklkOiBkdG8uc3ViQWdlbnRJbnZvY2F0aW9uSWQsXG5cdFx0fSk7XG5cblx0XHQvLyBXaGVuIGludm9raW5nIGEgdG9vbCwgZG9uJ3QgdmFsaWRhdGUgdGhlIFwid2hlblwiIGNsYXVzZS4gQW4gZXh0ZW5zaW9uIG1heSBoYXZlIGludm9rZWQgYSB0b29sIGp1c3QgYXMgaXQgd2FzIGJlY29taW5nIGRpc2FibGVkLCBhbmQganVzdCBsZXQgaXQgZ28gdGhyb3VnaCByYXRoZXIgdGhhbiB0aHJvdyBhbmQgYnJlYWsgdGhlIGNoYXQuXG5cdFx0bGV0IHRvb2wgPSB0aGlzLl90b29scy5nZXQoZHRvLnRvb2xJZCk7XG5cdFx0aWYgKCF0b29sKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFRvb2wgJHtkdG8udG9vbElkfSB3YXMgbm90IGNvbnRyaWJ1dGVkYCk7XG5cdFx0fVxuXG5cdFx0aWYgKCF0b29sLmltcGwpIHtcblx0XHRcdGF3YWl0IHRoaXMuX2V4dGVuc2lvblNlcnZpY2UuYWN0aXZhdGVCeUV2ZW50KGBvbkxhbmd1YWdlTW9kZWxUb29sOiR7ZHRvLnRvb2xJZH1gKTtcblxuXHRcdFx0Ly8gRXh0ZW5zaW9uIHNob3VsZCBhY3RpdmF0ZSBhbmQgcmVnaXN0ZXIgdGhlIHRvb2wgaW1wbGVtZW50YXRpb25cblx0XHRcdHRvb2wgPSB0aGlzLl90b29scy5nZXQoZHRvLnRvb2xJZCk7XG5cdFx0XHRpZiAoIXRvb2w/LmltcGwpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBUb29sICR7ZHRvLnRvb2xJZH0gZG9lcyBub3QgaGF2ZSBhbiBpbXBsZW1lbnRhdGlvbiByZWdpc3RlcmVkLmApO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIE5vdGU6IHBlbmRpbmcgaW52b2NhdGlvbiBsb29rdXAgd2FzIGFscmVhZHkgZG9uZSBhYm92ZSBmb3IgdGhlIGhvb2sgY2hlY2tcblx0XHRjb25zdCBoYWRQZW5kaW5nSW52b2NhdGlvbiA9ICEhdG9vbEludm9jYXRpb247XG5cdFx0aWYgKGhhZFBlbmRpbmdJbnZvY2F0aW9uICYmIHBlbmRpbmdUb29sQ2FsbEtleSkge1xuXHRcdFx0Ly8gUmVtb3ZlIGZyb20gcGVuZGluZyBzaW5jZSB3ZSdyZSBub3cgaW52b2tpbmcgaXRcblx0XHRcdHRoaXMuX3BlbmRpbmdUb29sQ2FsbHMuZGVsZXRlKHBlbmRpbmdUb29sQ2FsbEtleSk7XG5cdFx0fVxuXG5cdFx0bGV0IHRvb2xSZXN1bHQ6IElUb29sUmVzdWx0IHwgdW5kZWZpbmVkO1xuXHRcdGxldCBwcmVwYXJlVGltZVdhdGNoOiBTdG9wV2F0Y2ggfCB1bmRlZmluZWQ7XG5cdFx0bGV0IGludm9jYXRpb25UaW1lV2F0Y2g6IFN0b3BXYXRjaCB8IHVuZGVmaW5lZDtcblx0XHRsZXQgcHJlcGFyZWRJbnZvY2F0aW9uOiBJUHJlcGFyZWRUb29sSW52b2NhdGlvbiB8IHVuZGVmaW5lZDtcblx0XHRsZXQgYWN0aXZlVG9vbCA9IHRvb2w7XG5cdFx0dHJ5IHtcblx0XHRcdGlmIChkdG8uY29udGV4dCkge1xuXHRcdFx0XHRpZiAoIW1vZGVsKSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBUb29sIGNhbGxlZCBmb3IgdW5rbm93biBjaGF0IHNlc3Npb25gKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmICghcmVxdWVzdCkge1xuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcihgVG9vbCBjYWxsZWQgZm9yIHVua25vd24gY2hhdCByZXF1ZXN0YCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0ZHRvLm1vZGVsSWQgPSByZXF1ZXN0Lm1vZGVsSWQ7XG5cdFx0XHRcdGR0by51c2VyU2VsZWN0ZWRUb29scyA9IHJlcXVlc3QudXNlclNlbGVjdGVkVG9vbHMgJiYgeyAuLi5yZXF1ZXN0LnVzZXJTZWxlY3RlZFRvb2xzIH07XG5cblx0XHRcdFx0cHJlcGFyZVRpbWVXYXRjaCA9IFN0b3BXYXRjaC5jcmVhdGUodHJ1ZSk7XG5cdFx0XHRcdHByZXBhcmVkSW52b2NhdGlvbiA9IGF3YWl0IHRoaXMucHJlcGFyZVRvb2xJbnZvY2F0aW9uV2l0aEhvb2tSZXN1bHQodG9vbCwgZHRvLCBwcmVUb29sVXNlSG9va1Jlc3VsdCwgdG9rZW4pO1xuXHRcdFx0XHRwcmVwYXJlVGltZVdhdGNoLnN0b3AoKTtcblxuXHRcdFx0XHRjb25zdCB7IGF1dG9Db25maXJtZWQ6IHJlc29sdmVkQXV0b0NvbmZpcm1lZCwgcHJlcGFyZWRJbnZvY2F0aW9uOiB1cGRhdGVkUHJlcGFyZWRJbnZvY2F0aW9uIH0gPSBhd2FpdCB0aGlzLnJlc29sdmVBdXRvQ29uZmlybUZyb21Ib29rKHByZVRvb2xVc2VIb29rUmVzdWx0LCB0b29sLCBkdG8sIHByZXBhcmVkSW52b2NhdGlvbiwgZHRvLmNvbnRleHQ/LnNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRcdHByZXBhcmVkSW52b2NhdGlvbiA9IHVwZGF0ZWRQcmVwYXJlZEludm9jYXRpb247XG5cblx0XHRcdFx0Ly8gQSBjYWxsZXIgKGUuZy4gdGhlIGFnZW50IGhvc3QpIG1heSBoYXZlIHJlc29sdmVkIGF1dG8tYXBwcm92YWxcblx0XHRcdFx0Ly8gb3V0LW9mLWJhbmQuIFRyZWF0IGl0IGxpa2UgYSBsb2NhbCBhdXRvLWNvbmZpcm1hdGlvbiBzbyB0aGVcblx0XHRcdFx0Ly8gaW52b2NhdGlvbiBuZXZlciBicmllZmx5IGVudGVycyBgV2FpdGluZ0ZvckNvbmZpcm1hdGlvbmAuIEFcblx0XHRcdFx0Ly8gcHJlVG9vbFVzZSBob29rIHRoYXQgcmV0dXJuZWQgYGFza2AgZXhwbGljaXRseSBmb3JjZXMgYVxuXHRcdFx0XHQvLyBjb25maXJtYXRpb24sIHNvIG5ldmVyIGxldCBgcHJlQXBwcm92ZWRgIG92ZXJyaWRlIGl0LlxuXHRcdFx0XHRjb25zdCBwcmVSZXNvbHZlZEF1dG9Db25maXJtZWQgPSByZXNvbHZlZEF1dG9Db25maXJtZWRcblx0XHRcdFx0XHQ/PyAocHJlVG9vbFVzZUhvb2tSZXN1bHQ/LnBlcm1pc3Npb25EZWNpc2lvbiA9PT0gJ2FzaycgPyB1bmRlZmluZWQgOiBkdG8ucHJlQXBwcm92ZWQpO1xuXG5cdFx0XHRcdC8vIEluIEF1dG9waWxvdCwgcnVuIHRoZSByaXNrIGNsYXNzaWZpZXIgb24gYW4gYXV0by1hcHByb3ZlZCBjYWxsIHRoYXQgd291bGRcblx0XHRcdFx0Ly8gb3RoZXJ3aXNlIHNob3cgYSBjb25maXJtYXRpb24uIEEgXCJyZWRcIiByYXRpbmcgc2tpcHMgdGhlIGNhbGw7IGFueXRoaW5nIGVsc2Vcblx0XHRcdFx0Ly8gKGluY2x1ZGluZyBhIGNsYXNzaWZpZXIgZmFpbHVyZSkga2VlcHMgdGhlIG9yaWdpbmFsIGF1dG8tY29uZmlybWF0aW9uLlxuXHRcdFx0XHRjb25zdCB7IGF1dG9Db25maXJtZWQsIHNraXBFeHBsYW5hdGlvbjogcmlza1NraXBFeHBsYW5hdGlvbiB9ID0gYXdhaXQgdGhpcy5fbWF5YmVBcHBseUF1dG9waWxvdFJpc2tHYXRlKHRvb2wsIGR0bywgcHJlcGFyZWRJbnZvY2F0aW9uLCBwcmVSZXNvbHZlZEF1dG9Db25maXJtZWQsIHRva2VuKTtcblxuXHRcdFx0XHQvLyBJbXBvcnRhbnQ6IGEgdG9vbCBpbnZvY2F0aW9uIHRoYXQgd2lsbCBiZSBhdXRvY29uZmlybWVkIHNob3VsZCBuZXZlclxuXHRcdFx0XHQvLyBiZSBpbiB0aGUgY2hhdCByZXNwb25zZSBpbiB0aGUgYE5lZWRzQ29uZmlybWF0aW9uYCBzdGF0ZSwgZXZlbiBicmllZmx5LFxuXHRcdFx0XHQvLyBhcyB0aGF0IHRyaWdnZXJzIG5vdGlmaWNhdGlvbnMgYW5kIGNhdXNlcyBpc3N1ZXMgaW4gZXZhbC5cblx0XHRcdFx0aWYgKGhhZFBlbmRpbmdJbnZvY2F0aW9uICYmIHRvb2xJbnZvY2F0aW9uKSB7XG5cdFx0XHRcdFx0aWYgKHRvb2xJbnZvY2F0aW9uLnN0YXRlLmdldCgpLnR5cGUgPT09IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLlN0cmVhbWluZykge1xuXHRcdFx0XHRcdFx0dG9vbEludm9jYXRpb24udHJhbnNpdGlvbkZyb21TdHJlYW1pbmcocHJlcGFyZWRJbnZvY2F0aW9uLCBkdG8ucGFyYW1ldGVycywgYXV0b0NvbmZpcm1lZCk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHRvb2xJbnZvY2F0aW9uLnVwZGF0ZVByZXBhcmVkSW52b2NhdGlvbihwcmVwYXJlZEludm9jYXRpb24sIGR0by5wYXJhbWV0ZXJzKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Ly8gQ3JlYXRlIGEgbmV3IHRvb2wgaW52b2NhdGlvbiAobm8gc3RyZWFtaW5nIHBoYXNlKVxuXHRcdFx0XHRcdHRvb2xJbnZvY2F0aW9uID0gbmV3IENoYXRUb29sSW52b2NhdGlvbihwcmVwYXJlZEludm9jYXRpb24sIHRvb2wuZGF0YSwgZHRvLmNoYXRTdHJlYW1Ub29sQ2FsbElkID8/IGR0by5jYWxsSWQsIGR0by5zdWJBZ2VudEludm9jYXRpb25JZCwgZHRvLnBhcmFtZXRlcnMpO1xuXHRcdFx0XHRcdGlmIChhdXRvQ29uZmlybWVkKSB7XG5cdFx0XHRcdFx0XHRJQ2hhdFRvb2xJbnZvY2F0aW9uLmNvbmZpcm1XaXRoKHRvb2xJbnZvY2F0aW9uLCBhdXRvQ29uZmlybWVkKTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHR0aGlzLl9jaGF0U2VydmljZS5hcHBlbmRQcm9ncmVzcyhyZXF1ZXN0LCB0b29sSW52b2NhdGlvbik7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRkdG8udG9vbFNwZWNpZmljRGF0YSA9IHRvb2xJbnZvY2F0aW9uPy50b29sU3BlY2lmaWNEYXRhO1xuXG5cdFx0XHRcdC8vIEVuZm9yY2UgYSByaXNrIHNraXAgaGVyZSwgYmVmb3JlIHRoZSBjb25maXJtYXRpb24gZmxvdyBiZWxvdzogcnVuX2luX3Rlcm1pbmFsXG5cdFx0XHRcdC8vIHN1cHByZXNzZXMgaXRzIG93biBjb25maXJtYXRpb24gdW5kZXIgQXV0b3BpbG90IGFuZCBuZXZlciByZWFjaGVzIGl0LiBUaGUgdG9vbFxuXHRcdFx0XHQvLyBpcyBub3QgcnVuLCBhbmQgYW4gaW5mbyBub3RlIGV4cGxhaW5zIHdoeS5cblx0XHRcdFx0aWYgKHJpc2tTa2lwRXhwbGFuYXRpb24pIHtcblx0XHRcdFx0XHR0aGlzLl9sb2dUb29sQXBwcm92YWxUZWxlbWV0cnkodG9vbCwgZHRvLCB7IHR5cGU6IFRvb2xDb25maXJtS2luZC5Ta2lwcGVkIH0pO1xuXHRcdFx0XHRcdC8vIFRlcm1pbmFsIGFuZCBlZGl0IHRvb2xzIGhpZGUgdGhlaXIgaW52b2NhdGlvbiBwYXJ0IG9uY2UgY29tcGxldGUsIHNvIHNob3cgdGhlXG5cdFx0XHRcdFx0Ly8gcmVhc29uIGFzIGEgc2VwYXJhdGUgaW5mbyBub3RlLlxuXHRcdFx0XHRcdHRoaXMuX2NoYXRTZXJ2aWNlLmFwcGVuZFByb2dyZXNzKHJlcXVlc3QsIHtcblx0XHRcdFx0XHRcdGtpbmQ6ICdpbmZvJyxcblx0XHRcdFx0XHRcdGNvbnRlbnQ6IG5ldyBNYXJrZG93blN0cmluZyhsb2NhbGl6ZSgnYXV0b3BpbG90Umlza1NraXBwZWQnLCBcIkF1dG9waWxvdCBza2lwcGVkIFxcXCJ7MH1cXFwiIGJlY2F1c2UgaXQgd2FzIGFzc2Vzc2VkIGFzIGhpZ2gtcmlzazogezF9XCIsIHRvb2wuZGF0YS5kaXNwbGF5TmFtZSwgcmlza1NraXBFeHBsYW5hdGlvbikpLFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdHRvb2xSZXN1bHQgPSB7XG5cdFx0XHRcdFx0XHRjb250ZW50OiBbe1xuXHRcdFx0XHRcdFx0XHRraW5kOiAndGV4dCcsXG5cdFx0XHRcdFx0XHRcdHZhbHVlOiBgQXV0b3BpbG90IHNraXBwZWQgdGhpcyB0b29sIGNhbGwgYmVjYXVzZSBpdCB3YXMgYXV0b21hdGljYWxseSBhc3Nlc3NlZCBhcyBoaWdoLXJpc2s6ICR7cmlza1NraXBFeHBsYW5hdGlvbn0gVGhlIGFjdGlvbiB3YXMgbm90IHBlcmZvcm1lZC4gRG8gbm90IHJldHJ5IGl0IGFzLWlzIFx1MjAxNCBjaG9vc2UgYSBzYWZlciBhcHByb2FjaCBvciBsZWF2ZSBpdCBmb3IgdGhlIHVzZXIgdG8gcnVuIG1hbnVhbGx5LmBcblx0XHRcdFx0XHRcdH1dXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0XHRyZXR1cm4gdG9vbFJlc3VsdDtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAocHJlcGFyZWRJbnZvY2F0aW9uPy5jb25maXJtYXRpb25NZXNzYWdlcz8udGl0bGUpIHtcblx0XHRcdFx0XHRpZiAoIUlDaGF0VG9vbEludm9jYXRpb24uZXhlY3V0aW9uQ29uZmlybWVkT3JEZW5pZWQodG9vbEludm9jYXRpb24pICYmICFhdXRvQ29uZmlybWVkKSB7XG5cdFx0XHRcdFx0XHR0aGlzLnBsYXlBY2Nlc3NpYmlsaXR5U2lnbmFsKFt0b29sSW52b2NhdGlvbl0sIGR0by5jb250ZXh0Py5zZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb25zdCB1c2VyQ29uZmlybWVkID0gYXdhaXQgSUNoYXRUb29sSW52b2NhdGlvbi5hd2FpdENvbmZpcm1hdGlvbih0b29sSW52b2NhdGlvbiwgdG9rZW4pO1xuXHRcdFx0XHRcdHRoaXMuX2xvZ1Rvb2xBcHByb3ZhbFRlbGVtZXRyeSh0b29sLCBkdG8sIHVzZXJDb25maXJtZWQpO1xuXHRcdFx0XHRcdGlmICh1c2VyQ29uZmlybWVkLnR5cGUgPT09IFRvb2xDb25maXJtS2luZC5EZW5pZWQpIHtcblx0XHRcdFx0XHRcdHRocm93IG5ldyBDYW5jZWxsYXRpb25FcnJvcigpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAodXNlckNvbmZpcm1lZC50eXBlID09PSBUb29sQ29uZmlybUtpbmQuU2tpcHBlZCkge1xuXHRcdFx0XHRcdFx0dG9vbFJlc3VsdCA9IHtcblx0XHRcdFx0XHRcdFx0Y29udGVudDogW3tcblx0XHRcdFx0XHRcdFx0XHRraW5kOiAndGV4dCcsXG5cdFx0XHRcdFx0XHRcdFx0dmFsdWU6ICdUaGUgdXNlciBjaG9zZSB0byBza2lwIHRoZSB0b29sIGNhbGwsIHRoZXkgd2FudCB0byBwcm9jZWVkIHdpdGhvdXQgcnVubmluZyBpdCdcblx0XHRcdFx0XHRcdFx0fV1cblx0XHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0XHRyZXR1cm4gdG9vbFJlc3VsdDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKHVzZXJDb25maXJtZWQudHlwZSA9PT0gVG9vbENvbmZpcm1LaW5kLlVzZXJBY3Rpb24gJiYgdXNlckNvbmZpcm1lZC5zZWxlY3RlZEJ1dHRvbikge1xuXHRcdFx0XHRcdFx0ZHRvLnNlbGVjdGVkQ3VzdG9tQnV0dG9uID0gdXNlckNvbmZpcm1lZC5zZWxlY3RlZEJ1dHRvbjtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRpZiAoZHRvLnRvb2xTcGVjaWZpY0RhdGE/LmtpbmQgPT09ICdpbnB1dCcpIHtcblx0XHRcdFx0XHRcdGR0by5wYXJhbWV0ZXJzID0gZHRvLnRvb2xTcGVjaWZpY0RhdGEucmF3SW5wdXQ7XG5cdFx0XHRcdFx0XHRkdG8udG9vbFNwZWNpZmljRGF0YSA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5fbG9nVG9vbEFwcHJvdmFsVGVsZW1ldHJ5KHRvb2wsIGR0bywgYXV0b0NvbmZpcm1lZCA/PyB7IHR5cGU6IFRvb2xDb25maXJtS2luZC5Db25maXJtYXRpb25Ob3ROZWVkZWQgfSk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHByZXBhcmVUaW1lV2F0Y2ggPSBTdG9wV2F0Y2guY3JlYXRlKHRydWUpO1xuXHRcdFx0XHRwcmVwYXJlZEludm9jYXRpb24gPSBhd2FpdCB0aGlzLnByZXBhcmVUb29sSW52b2NhdGlvbldpdGhIb29rUmVzdWx0KHRvb2wsIGR0bywgcHJlVG9vbFVzZUhvb2tSZXN1bHQsIHRva2VuKTtcblx0XHRcdFx0cHJlcGFyZVRpbWVXYXRjaC5zdG9wKCk7XG5cblx0XHRcdFx0Y29uc3QgeyBhdXRvQ29uZmlybWVkOiBmYWxsYmFja0F1dG9Db25maXJtZWQsIHByZXBhcmVkSW52b2NhdGlvbjogdXBkYXRlZFByZXBhcmVkSW52b2NhdGlvbiB9ID0gYXdhaXQgdGhpcy5yZXNvbHZlQXV0b0NvbmZpcm1Gcm9tSG9vayhwcmVUb29sVXNlSG9va1Jlc3VsdCwgdG9vbCwgZHRvLCBwcmVwYXJlZEludm9jYXRpb24sIHVuZGVmaW5lZCk7XG5cdFx0XHRcdHByZXBhcmVkSW52b2NhdGlvbiA9IHVwZGF0ZWRQcmVwYXJlZEludm9jYXRpb247XG5cdFx0XHRcdGNvbnN0IGF1dG9Db25maXJtZWQgPSBmYWxsYmFja0F1dG9Db25maXJtZWRcblx0XHRcdFx0XHQ/PyAocHJlVG9vbFVzZUhvb2tSZXN1bHQ/LnBlcm1pc3Npb25EZWNpc2lvbiA9PT0gJ2FzaycgPyB1bmRlZmluZWQgOiBkdG8ucHJlQXBwcm92ZWQpO1xuXHRcdFx0XHRpZiAocHJlcGFyZWRJbnZvY2F0aW9uPy5jb25maXJtYXRpb25NZXNzYWdlcz8udGl0bGUgJiYgIWF1dG9Db25maXJtZWQpIHtcblx0XHRcdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLl9kaWFsb2dTZXJ2aWNlLmNvbmZpcm0oeyBtZXNzYWdlOiByZW5kZXJBc1BsYWludGV4dChwcmVwYXJlZEludm9jYXRpb24uY29uZmlybWF0aW9uTWVzc2FnZXMudGl0bGUpLCBkZXRhaWw6IHJlbmRlckFzUGxhaW50ZXh0KHByZXBhcmVkSW52b2NhdGlvbi5jb25maXJtYXRpb25NZXNzYWdlcy5tZXNzYWdlISkgfSk7XG5cdFx0XHRcdFx0aWYgKCFyZXN1bHQuY29uZmlybWVkKSB7XG5cdFx0XHRcdFx0XHR0aHJvdyBuZXcgQ2FuY2VsbGF0aW9uRXJyb3IoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0ZHRvLnRvb2xTcGVjaWZpY0RhdGEgPSBwcmVwYXJlZEludm9jYXRpb24/LnRvb2xTcGVjaWZpY0RhdGE7XG5cdFx0XHR9XG5cblx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHR0aHJvdyBuZXcgQ2FuY2VsbGF0aW9uRXJyb3IoKTtcblx0XHRcdH1cblxuXHRcdFx0aW52b2NhdGlvblRpbWVXYXRjaCA9IFN0b3BXYXRjaC5jcmVhdGUodHJ1ZSk7XG5cdFx0XHRjb25zdCBjdXJyZW50VG9vbCA9IHRoaXMuX3Rvb2xzLmdldChkdG8udG9vbElkKTtcblx0XHRcdGlmICghY3VycmVudFRvb2wpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBUb29sICR7ZHRvLnRvb2xJZH0gd2FzIG5vdCBjb250cmlidXRlZGApO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCFjdXJyZW50VG9vbC5pbXBsKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihgVG9vbCAke2R0by50b29sSWR9IGRvZXMgbm90IGhhdmUgYW4gaW1wbGVtZW50YXRpb24gcmVnaXN0ZXJlZC5gKTtcblx0XHRcdH1cblx0XHRcdGFjdGl2ZVRvb2wgPSBjdXJyZW50VG9vbDtcblx0XHRcdHRvb2xSZXN1bHQgPSBhd2FpdCBjdXJyZW50VG9vbC5pbXBsLmludm9rZShkdG8sIGNvdW50VG9rZW5zLCB7XG5cdFx0XHRcdHJlcG9ydDogc3RlcCA9PiB7XG5cdFx0XHRcdFx0dG9vbEludm9jYXRpb24/LmFjY2VwdFByb2dyZXNzKHN0ZXApO1xuXHRcdFx0XHR9XG5cdFx0XHR9LCB0b2tlbik7XG5cdFx0XHRpbnZvY2F0aW9uVGltZVdhdGNoLnN0b3AoKTtcblx0XHRcdC8vIEFwcGx5IHBvc3QtcHJvY2Vzc2luZyBjb21wcmVzc2lvbiAoZS5nLiBmb3IgcnVuX2luX3Rlcm1pbmFsIG91dHB1dClcblx0XHRcdC8vIGJlZm9yZSB0aGUgcmVzdWx0IHJlYWNoZXMgdGhlIG1vZGVsLiBSZXR1cm5zIHVuZGVmaW5lZCB3aGVuIG5vXG5cdFx0XHQvLyBjb21wcmVzc2lvbiBhcHBsaWVkLlxuXHRcdFx0Y29uc3QgY29tcHJlc3NlZCA9IHRoaXMuX3Rvb2xSZXN1bHRDb21wcmVzc29yLm1heWJlQ29tcHJlc3MoYWN0aXZlVG9vbC5kYXRhLmlkLCBkdG8ucGFyYW1ldGVycywgdG9vbFJlc3VsdCk7XG5cdFx0XHRpZiAoY29tcHJlc3NlZCkge1xuXHRcdFx0XHR0b29sUmVzdWx0ID0gY29tcHJlc3NlZDtcblx0XHRcdH1cblx0XHRcdHRoaXMuZW5zdXJlVG9vbERldGFpbHMoZHRvLCB0b29sUmVzdWx0LCBhY3RpdmVUb29sLmRhdGEsIHRvb2xJbnZvY2F0aW9uKTtcblxuXHRcdFx0Y29uc3QgYWZ0ZXJFeGVjdXRlU3RhdGUgPSBhd2FpdCB0b29sSW52b2NhdGlvbj8uZGlkRXhlY3V0ZVRvb2wodG9vbFJlc3VsdCwgdW5kZWZpbmVkLCAoKSA9PlxuXHRcdFx0XHR0aGlzLnNob3VsZEF1dG9Db25maXJtUG9zdEV4ZWN1dGlvbihhY3RpdmVUb29sLmRhdGEuaWQsIGFjdGl2ZVRvb2wuZGF0YS5ydW5zSW5Xb3Jrc3BhY2UsIGFjdGl2ZVRvb2wuZGF0YS5zb3VyY2UsIGR0by5wYXJhbWV0ZXJzLCBkdG8uY29udGV4dD8uc2Vzc2lvblJlc291cmNlLCBkdG8uY2hhdFJlcXVlc3RJZCwgZHRvLmNvbnRleHQ/LndvcmtpbmdEaXJlY3RvcnkpKTtcblxuXHRcdFx0aWYgKHRvb2xJbnZvY2F0aW9uICYmIGFmdGVyRXhlY3V0ZVN0YXRlPy50eXBlID09PSBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5XYWl0aW5nRm9yUG9zdEFwcHJvdmFsKSB7XG5cdFx0XHRcdGNvbnN0IHBvc3RDb25maXJtID0gYXdhaXQgSUNoYXRUb29sSW52b2NhdGlvbi5hd2FpdFBvc3RDb25maXJtYXRpb24odG9vbEludm9jYXRpb24sIHRva2VuKTtcblx0XHRcdFx0aWYgKHBvc3RDb25maXJtLnR5cGUgPT09IFRvb2xDb25maXJtS2luZC5EZW5pZWQpIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgQ2FuY2VsbGF0aW9uRXJyb3IoKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAocG9zdENvbmZpcm0udHlwZSA9PT0gVG9vbENvbmZpcm1LaW5kLlNraXBwZWQpIHtcblx0XHRcdFx0XHR0b29sUmVzdWx0ID0ge1xuXHRcdFx0XHRcdFx0Y29udGVudDogW3tcblx0XHRcdFx0XHRcdFx0a2luZDogJ3RleHQnLFxuXHRcdFx0XHRcdFx0XHR2YWx1ZTogJ1RoZSB0b29sIGV4ZWN1dGVkIGJ1dCB0aGUgdXNlciBjaG9zZSBub3QgdG8gc2hhcmUgdGhlIHJlc3VsdHMnXG5cdFx0XHRcdFx0XHR9XVxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0dGhpcy5fdGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPExhbmd1YWdlTW9kZWxUb29sSW52b2tlZEV2ZW50LCBMYW5ndWFnZU1vZGVsVG9vbEludm9rZWRDbGFzc2lmaWNhdGlvbj4oXG5cdFx0XHRcdCdsYW5ndWFnZU1vZGVsVG9vbEludm9rZWQnLFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cmVzdWx0OiAnc3VjY2VzcycsXG5cdFx0XHRcdFx0Y2hhdFNlc3Npb25JZDogZHRvLmNvbnRleHQ/LnNlc3Npb25SZXNvdXJjZSA/IGNoYXRTZXNzaW9uUmVzb3VyY2VUb0lkKGR0by5jb250ZXh0LnNlc3Npb25SZXNvdXJjZSkgOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0dG9vbElkOiBhY3RpdmVUb29sLmRhdGEuaWQsXG5cdFx0XHRcdFx0dG9vbEV4dGVuc2lvbklkOiBhY3RpdmVUb29sLmRhdGEuc291cmNlLnR5cGUgPT09ICdleHRlbnNpb24nID8gYWN0aXZlVG9vbC5kYXRhLnNvdXJjZS5leHRlbnNpb25JZC52YWx1ZSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHR0b29sU291cmNlS2luZDogYWN0aXZlVG9vbC5kYXRhLnNvdXJjZS50eXBlLFxuXHRcdFx0XHRcdHByZXBhcmVUaW1lTXM6IHByZXBhcmVUaW1lV2F0Y2g/LmVsYXBzZWQoKSxcblx0XHRcdFx0XHRpbnZvY2F0aW9uVGltZU1zOiBpbnZvY2F0aW9uVGltZVdhdGNoPy5lbGFwc2VkKCksXG5cdFx0XHRcdH0pO1xuXHRcdFx0cmV0dXJuIHRvb2xSZXN1bHQ7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBpc0NhbmNlbGxhdGlvbkVycm9yKGVycikgPyAndXNlckNhbmNlbGxlZCcgOiAnZXJyb3InO1xuXHRcdFx0dGhpcy5fdGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPExhbmd1YWdlTW9kZWxUb29sSW52b2tlZEV2ZW50LCBMYW5ndWFnZU1vZGVsVG9vbEludm9rZWRDbGFzc2lmaWNhdGlvbj4oXG5cdFx0XHRcdCdsYW5ndWFnZU1vZGVsVG9vbEludm9rZWQnLFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cmVzdWx0LFxuXHRcdFx0XHRcdGNoYXRTZXNzaW9uSWQ6IGR0by5jb250ZXh0Py5zZXNzaW9uUmVzb3VyY2UgPyBjaGF0U2Vzc2lvblJlc291cmNlVG9JZChkdG8uY29udGV4dC5zZXNzaW9uUmVzb3VyY2UpIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHRvb2xJZDogYWN0aXZlVG9vbC5kYXRhLmlkLFxuXHRcdFx0XHRcdHRvb2xFeHRlbnNpb25JZDogYWN0aXZlVG9vbC5kYXRhLnNvdXJjZS50eXBlID09PSAnZXh0ZW5zaW9uJyA/IGFjdGl2ZVRvb2wuZGF0YS5zb3VyY2UuZXh0ZW5zaW9uSWQudmFsdWUgOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0dG9vbFNvdXJjZUtpbmQ6IGFjdGl2ZVRvb2wuZGF0YS5zb3VyY2UudHlwZSxcblx0XHRcdFx0XHRwcmVwYXJlVGltZU1zOiBwcmVwYXJlVGltZVdhdGNoPy5lbGFwc2VkKCksXG5cdFx0XHRcdFx0aW52b2NhdGlvblRpbWVNczogaW52b2NhdGlvblRpbWVXYXRjaD8uZWxhcHNlZCgpLFxuXHRcdFx0XHR9KTtcblx0XHRcdGlmICghaXNDYW5jZWxsYXRpb25FcnJvcihlcnIpKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoYFtMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlI2ludm9rZVRvb2xdIEVycm9yIGZyb20gdG9vbCAke2R0by50b29sSWR9IHdpdGggcGFyYW1ldGVycyAke0pTT04uc3RyaW5naWZ5KGR0by5wYXJhbWV0ZXJzKX06XFxuJHt0b0Vycm9yTWVzc2FnZShlcnIsIHRydWUpfWApO1xuXHRcdFx0fVxuXG5cdFx0XHR0b29sUmVzdWx0ID8/PSB7IGNvbnRlbnQ6IFtdIH07XG5cdFx0XHR0b29sUmVzdWx0LnRvb2xSZXN1bHRFcnJvciA9IGVyciBpbnN0YW5jZW9mIEVycm9yID8gZXJyLm1lc3NhZ2UgOiBTdHJpbmcoZXJyKTtcblx0XHRcdGlmIChhY3RpdmVUb29sLmRhdGEuYWx3YXlzRGlzcGxheUlucHV0T3V0cHV0KSB7XG5cdFx0XHRcdHRvb2xSZXN1bHQudG9vbFJlc3VsdERldGFpbHMgPSB7IGlucHV0OiB0aGlzLmZvcm1hdFRvb2xJbnB1dChkdG8pLCBvdXRwdXQ6IFt7IHR5cGU6ICdlbWJlZCcsIGlzVGV4dDogdHJ1ZSwgdmFsdWU6IFN0cmluZyhlcnIpIH1dLCBpc0Vycm9yOiB0cnVlIH07XG5cdFx0XHR9XG5cblx0XHRcdHRocm93IGVycjtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dG9vbEludm9jYXRpb24/LmRpZEV4ZWN1dGVUb29sKHRvb2xSZXN1bHQsIHRydWUpO1xuXHRcdFx0aWYgKHN0b3JlKSB7XG5cdFx0XHRcdHRoaXMuY2xlYW51cENhbGxEaXNwb3NhYmxlcyhyZXF1ZXN0SWQsIHN0b3JlKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHByZXBhcmVUb29sSW52b2NhdGlvbldpdGhIb29rUmVzdWx0KHRvb2w6IElUb29sRW50cnksIGR0bzogSVRvb2xJbnZvY2F0aW9uLCBob29rUmVzdWx0OiBJRXh0ZXJuYWxQcmVUb29sVXNlSG9va1Jlc3VsdCB8IHVuZGVmaW5lZCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJUHJlcGFyZWRUb29sSW52b2NhdGlvbiB8IHVuZGVmaW5lZD4ge1xuXHRcdGxldCBmb3JjZUNvbmZpcm1hdGlvblJlYXNvbjogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdGlmIChob29rUmVzdWx0Py5wZXJtaXNzaW9uRGVjaXNpb24gPT09ICdhc2snKSB7XG5cdFx0XHRjb25zdCBob29rTWVzc2FnZSA9IGxvY2FsaXplKCdwcmVUb29sVXNlSG9va1JlcXVpcmVkQ29uZmlybWF0aW9uJywgXCJ7MH0gcmVxdWlyZWQgY29uZmlybWF0aW9uXCIsIEhvb2tUeXBlLlByZVRvb2xVc2UpO1xuXHRcdFx0Zm9yY2VDb25maXJtYXRpb25SZWFzb24gPSBob29rUmVzdWx0LnBlcm1pc3Npb25EZWNpc2lvblJlYXNvblxuXHRcdFx0XHQ/IGAke2hvb2tNZXNzYWdlfTogJHtob29rUmVzdWx0LnBlcm1pc3Npb25EZWNpc2lvblJlYXNvbn1gXG5cdFx0XHRcdDogaG9va01lc3NhZ2U7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLnByZXBhcmVUb29sSW52b2NhdGlvbih0b29sLCBkdG8sIGZvcmNlQ29uZmlybWF0aW9uUmVhc29uLCB0b2tlbik7XG5cdH1cblxuXHRwcml2YXRlIF9sb2dUb29sQXBwcm92YWxUZWxlbWV0cnkodG9vbDogSVRvb2xFbnRyeSwgZHRvOiBJVG9vbEludm9jYXRpb24sIHJlYXNvbjogQ29uZmlybWVkUmVhc29uKTogdm9pZCB7XG5cdFx0Y29uc3QgY29uZmlybUtpbmROYW1lczogUmVjb3JkPFRvb2xDb25maXJtS2luZCwgc3RyaW5nPiA9IHtcblx0XHRcdFtUb29sQ29uZmlybUtpbmQuRGVuaWVkXTogJ2RlbmllZCcsXG5cdFx0XHRbVG9vbENvbmZpcm1LaW5kLkNvbmZpcm1hdGlvbk5vdE5lZWRlZF06ICdjb25maXJtYXRpb25Ob3ROZWVkZWQnLFxuXHRcdFx0W1Rvb2xDb25maXJtS2luZC5TZXR0aW5nXTogJ3NldHRpbmcnLFxuXHRcdFx0W1Rvb2xDb25maXJtS2luZC5MbVNlcnZpY2VQZXJUb29sXTogJ2xtU2VydmljZVBlclRvb2wnLFxuXHRcdFx0W1Rvb2xDb25maXJtS2luZC5Vc2VyQWN0aW9uXTogJ3VzZXJBY3Rpb24nLFxuXHRcdFx0W1Rvb2xDb25maXJtS2luZC5Ta2lwcGVkXTogJ3NraXBwZWQnLFxuXHRcdH07XG5cdFx0Y29uc3QgYWxsb3dlZENvbmZpcm1hdGlvbk5vdE5lZWRlZFJlYXNvbnMgPSBuZXcgU2V0KFthdXRvQXBwcm92ZUFsbFJlYXNvbiwgJ2lubGluZUNoYXQnXSk7XG5cdFx0bGV0IGNvbmZpcm1hdGlvbk5vdE5lZWRlZFJlYXNvbjogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdGlmIChyZWFzb24udHlwZSA9PT0gVG9vbENvbmZpcm1LaW5kLkNvbmZpcm1hdGlvbk5vdE5lZWRlZCAmJiByZWFzb24ucmVhc29uKSB7XG5cdFx0XHRjb25zdCByYXcgPSB0eXBlb2YgcmVhc29uLnJlYXNvbiA9PT0gJ3N0cmluZycgPyByZWFzb24ucmVhc29uIDogcmVhc29uLnJlYXNvbi52YWx1ZTtcblx0XHRcdGNvbmZpcm1hdGlvbk5vdE5lZWRlZFJlYXNvbiA9IGFsbG93ZWRDb25maXJtYXRpb25Ob3ROZWVkZWRSZWFzb25zLmhhcyhyYXcpID8gcmF3IDogJ290aGVyJztcblx0XHR9XG5cdFx0Y29uc3QgdGVybWluYWxEYXRhID0gZHRvLnRvb2xTcGVjaWZpY0RhdGE/LmtpbmQgPT09ICd0ZXJtaW5hbCcgPyBkdG8udG9vbFNwZWNpZmljRGF0YSA6IHVuZGVmaW5lZDtcblx0XHR0aGlzLl90ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8VG9vbEFwcHJvdmFsRXZlbnQsIFRvb2xBcHByb3ZhbENsYXNzaWZpY2F0aW9uPihcblx0XHRcdCdjaGF0LnRvb2xBcHByb3ZhbCcsXG5cdFx0XHR7XG5cdFx0XHRcdGNvbmZpcm1LaW5kOiBjb25maXJtS2luZE5hbWVzW3JlYXNvbi50eXBlXSxcblx0XHRcdFx0cmVxdWVzdElkOiBkdG8uY2hhdFJlcXVlc3RJZCxcblx0XHRcdFx0c2V0dGluZ0lkOiByZWFzb24udHlwZSA9PT0gVG9vbENvbmZpcm1LaW5kLlNldHRpbmcgPyByZWFzb24uaWQgOiB1bmRlZmluZWQsXG5cdFx0XHRcdGxtU2VydmljZVNjb3BlOiByZWFzb24udHlwZSA9PT0gVG9vbENvbmZpcm1LaW5kLkxtU2VydmljZVBlclRvb2wgPyByZWFzb24uc2NvcGUgOiB1bmRlZmluZWQsXG5cdFx0XHRcdGN1c3RvbUJ1dHRvbktpbmQ6IHJlYXNvbi50eXBlID09PSBUb29sQ29uZmlybUtpbmQuVXNlckFjdGlvbiA/IHJlYXNvbi5zZWxlY3RlZEJ1dHRvbktpbmQgOiB1bmRlZmluZWQsXG5cdFx0XHRcdGNvbmZpcm1hdGlvbk5vdE5lZWRlZFJlYXNvbixcblx0XHRcdFx0c2FuZGJveFdyYXBwZWQ6IHRlcm1pbmFsRGF0YT8uY29tbWFuZExpbmUuaXNTYW5kYm94V3JhcHBlZCxcblx0XHRcdFx0cmVxdWVzdFVuc2FuZGJveGVkRXhlY3V0aW9uOiB0ZXJtaW5hbERhdGE/LnJlcXVlc3RVbnNhbmRib3hlZEV4ZWN1dGlvbixcblx0XHRcdFx0Y2hhdFNlc3Npb25JZDogZHRvLmNvbnRleHQ/LnNlc3Npb25SZXNvdXJjZSA/IGNoYXRTZXNzaW9uUmVzb3VyY2VUb0lkKGR0by5jb250ZXh0LnNlc3Npb25SZXNvdXJjZSkgOiB1bmRlZmluZWQsXG5cdFx0XHRcdHRvb2xJZDogdG9vbC5kYXRhLmlkLFxuXHRcdFx0XHR0b29sRXh0ZW5zaW9uSWQ6IHRvb2wuZGF0YS5zb3VyY2UudHlwZSA9PT0gJ2V4dGVuc2lvbicgPyB0b29sLmRhdGEuc291cmNlLmV4dGVuc2lvbklkLnZhbHVlIDogdW5kZWZpbmVkLFxuXHRcdFx0XHR0b29sU291cmNlS2luZDogdG9vbC5kYXRhLnNvdXJjZS50eXBlLFxuXHRcdFx0fSk7XG5cdH1cblxuXHQvKipcblx0ICogRGV0ZXJtaW5lcyB0aGUgYXV0by1jb25maXJtIGRlY2lzaW9uIGJhc2VkIG9uIGEgcHJlVG9vbFVzZSBob29rIHJlc3VsdC5cblx0ICogSWYgdGhlIGhvb2sgcmV0dXJuZWQgJ2FsbG93JywgYXV0by1hcHByb3Zlcy4gSWYgJ2FzaycsIGZvcmNlcyBjb25maXJtYXRpb25cblx0ICogYW5kIGVuc3VyZXMgY29uZmlybWF0aW9uIG1lc3NhZ2VzIGV4aXN0IG9uIGBwcmVwYXJlZEludm9jYXRpb25gLiBPdGhlcndpc2Vcblx0ICogZmFsbHMgYmFjayB0byBub3JtYWwgYXV0by1jb25maXJtIGxvZ2ljLlxuXHQgKlxuXHQgKiBSZXR1cm5zIHRoZSBwb3NzaWJseS11cGRhdGVkIHByZXBhcmVkSW52b2NhdGlvbiBhbG9uZyB3aXRoIHRoZSBhdXRvLWNvbmZpcm0gZGVjaXNpb24sXG5cdCAqIHNpbmNlIHdoZW4gdGhlIGhvb2sgcmV0dXJucyAnYXNrJyBhbmQgcHJlcGFyZWRJbnZvY2F0aW9uIHdhcyB1bmRlZmluZWQsIHdlIGNyZWF0ZSBvbmUuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIHJlc29sdmVBdXRvQ29uZmlybUZyb21Ib29rKFxuXHRcdGhvb2tSZXN1bHQ6IElFeHRlcm5hbFByZVRvb2xVc2VIb29rUmVzdWx0IHwgdW5kZWZpbmVkLFxuXHRcdHRvb2w6IElUb29sRW50cnksXG5cdFx0ZHRvOiBJVG9vbEludm9jYXRpb24sXG5cdFx0cHJlcGFyZWRJbnZvY2F0aW9uOiBJUHJlcGFyZWRUb29sSW52b2NhdGlvbiB8IHVuZGVmaW5lZCxcblx0XHRzZXNzaW9uUmVzb3VyY2U6IFVSSSB8IHVuZGVmaW5lZCxcblx0KTogUHJvbWlzZTx7IGF1dG9Db25maXJtZWQ6IENvbmZpcm1lZFJlYXNvbiB8IHVuZGVmaW5lZDsgcHJlcGFyZWRJbnZvY2F0aW9uOiBJUHJlcGFyZWRUb29sSW52b2NhdGlvbiB8IHVuZGVmaW5lZCB9PiB7XG5cdFx0aWYgKGhvb2tSZXN1bHQ/LnBlcm1pc3Npb25EZWNpc2lvbiA9PT0gJ2FsbG93Jykge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5kZWJ1ZyhgW0xhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UjaW52b2tlVG9vbF0gVG9vbCAke2R0by50b29sSWR9IGF1dG8tYXBwcm92ZWQgYnkgcHJlVG9vbFVzZSBob29rYCk7XG5cdFx0XHRyZXR1cm4geyBhdXRvQ29uZmlybWVkOiB7IHR5cGU6IFRvb2xDb25maXJtS2luZC5Db25maXJtYXRpb25Ob3ROZWVkZWQsIHJlYXNvbjogbG9jYWxpemUoJ2hvb2tBbGxvd2VkJywgXCJBbGxvd2VkIGJ5IGhvb2tcIikgfSwgcHJlcGFyZWRJbnZvY2F0aW9uIH07XG5cdFx0fVxuXG5cdFx0aWYgKGhvb2tSZXN1bHQ/LnBlcm1pc3Npb25EZWNpc2lvbiA9PT0gJ2FzaycpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZGVidWcoYFtMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlI2ludm9rZVRvb2xdIFRvb2wgJHtkdG8udG9vbElkfSByZXF1aXJlcyBjb25maXJtYXRpb24gKHByZVRvb2xVc2UgaG9vayByZXR1cm5lZCAnYXNrJylgKTtcblx0XHRcdC8vIEVuc3VyZSBjb25maXJtYXRpb24gbWVzc2FnZXMgZXhpc3Qgd2hlbiBob29rIHJlcXVpcmVzIGNvbmZpcm1hdGlvblxuXHRcdFx0aWYgKCFwcmVwYXJlZEludm9jYXRpb24/LmNvbmZpcm1hdGlvbk1lc3NhZ2VzPy50aXRsZSkge1xuXHRcdFx0XHRpZiAoIXByZXBhcmVkSW52b2NhdGlvbikge1xuXHRcdFx0XHRcdHByZXBhcmVkSW52b2NhdGlvbiA9IHt9O1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGZ1bGxSZWZlcmVuY2VOYW1lID0gZ2V0VG9vbEZ1bGxSZWZlcmVuY2VOYW1lKHRvb2wuZGF0YSk7XG5cdFx0XHRcdGNvbnN0IGhvb2tSZWFzb24gPSBob29rUmVzdWx0LnBlcm1pc3Npb25EZWNpc2lvblJlYXNvbjtcblx0XHRcdFx0Y29uc3QgaG9va05vdGUgPSBob29rUmVhc29uXG5cdFx0XHRcdFx0PyBsb2NhbGl6ZSgnaG9va1JlcXVpcmVzQ29uZmlybWF0aW9uLm1lc3NhZ2VXaXRoUmVhc29uJywgXCJ7MH0gaG9vayByZXF1aXJlZCBjb25maXJtYXRpb246IHsxfVwiLCBIb29rVHlwZS5QcmVUb29sVXNlLCBob29rUmVhc29uKVxuXHRcdFx0XHRcdDogbG9jYWxpemUoJ2hvb2tSZXF1aXJlc0NvbmZpcm1hdGlvbi5tZXNzYWdlJywgXCJ7MH0gaG9vayByZXF1aXJlZCBjb25maXJtYXRpb25cIiwgSG9va1R5cGUuUHJlVG9vbFVzZSk7XG5cdFx0XHRcdHByZXBhcmVkSW52b2NhdGlvbi5jb25maXJtYXRpb25NZXNzYWdlcyA9IHtcblx0XHRcdFx0XHQuLi5wcmVwYXJlZEludm9jYXRpb24uY29uZmlybWF0aW9uTWVzc2FnZXMsXG5cdFx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdob29rUmVxdWlyZXNDb25maXJtYXRpb24udGl0bGUnLCBcIlVzZSB0aGUgJ3swfScgdG9vbD9cIiwgZnVsbFJlZmVyZW5jZU5hbWUpLFxuXHRcdFx0XHRcdG1lc3NhZ2U6IG5ldyBNYXJrZG93blN0cmluZyhgXyR7aG9va05vdGV9X2ApLFxuXHRcdFx0XHRcdGFsbG93QXV0b0NvbmZpcm06IGZhbHNlLFxuXHRcdFx0XHR9O1xuXHRcdFx0XHRwcmVwYXJlZEludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YSA9IHtcblx0XHRcdFx0XHRraW5kOiAnaW5wdXQnLFxuXHRcdFx0XHRcdHJhd0lucHV0OiBkdG8ucGFyYW1ldGVycyxcblx0XHRcdFx0fTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIFRvb2wgYWxyZWFkeSBoYXMgaXRzIG93biBjb25maXJtYXRpb24gLSBwcmVwZW5kIGhvb2sgbm90ZVxuXHRcdFx0XHRjb25zdCBob29rUmVhc29uID0gaG9va1Jlc3VsdC5wZXJtaXNzaW9uRGVjaXNpb25SZWFzb247XG5cdFx0XHRcdGNvbnN0IGhvb2tOb3RlID0gaG9va1JlYXNvblxuXHRcdFx0XHRcdD8gbG9jYWxpemUoJ2hvb2tSZXF1aXJlc0NvbmZpcm1hdGlvbi5ub3RlJywgXCJ7MH0gaG9vayByZXF1aXJlZCBjb25maXJtYXRpb246IHsxfVwiLCBIb29rVHlwZS5QcmVUb29sVXNlLCBob29rUmVhc29uKVxuXHRcdFx0XHRcdDogbG9jYWxpemUoJ2hvb2tSZXF1aXJlc0NvbmZpcm1hdGlvbi5ub3RlTm9SZWFzb24nLCBcInswfSBob29rIHJlcXVpcmVkIGNvbmZpcm1hdGlvblwiLCBIb29rVHlwZS5QcmVUb29sVXNlKTtcblxuXHRcdFx0XHRjb25zdCBleGlzdGluZyA9IHByZXBhcmVkSW52b2NhdGlvbi5jb25maXJtYXRpb25NZXNzYWdlcyE7XG5cdFx0XHRcdGlmIChwcmVwYXJlZEludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YT8ua2luZCA9PT0gJ3Rlcm1pbmFsJykge1xuXHRcdFx0XHRcdC8vIFRlcm1pbmFsIHRvb2xzIHJlbmRlciBtZXNzYWdlIGFzIGhvdmVyIG9ubHk7IHVzZSBkaXNjbGFpbWVyIGZvciB2aXNpYmxlIHRleHRcblx0XHRcdFx0XHRjb25zdCBleGlzdGluZ0Rpc2NsYWltZXJUZXh0ID0gZXhpc3RpbmcuZGlzY2xhaW1lclxuXHRcdFx0XHRcdFx0PyAodHlwZW9mIGV4aXN0aW5nLmRpc2NsYWltZXIgPT09ICdzdHJpbmcnID8gZXhpc3RpbmcuZGlzY2xhaW1lciA6IGV4aXN0aW5nLmRpc2NsYWltZXIudmFsdWUpXG5cdFx0XHRcdFx0XHQ6IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRjb25zdCBjb21iaW5lZERpc2NsYWltZXIgPSBleGlzdGluZ0Rpc2NsYWltZXJUZXh0XG5cdFx0XHRcdFx0XHQ/IGAke2hvb2tOb3RlfVxcblxcbiR7ZXhpc3RpbmdEaXNjbGFpbWVyVGV4dH1gXG5cdFx0XHRcdFx0XHQ6IGhvb2tOb3RlO1xuXHRcdFx0XHRcdHByZXBhcmVkSW52b2NhdGlvbi5jb25maXJtYXRpb25NZXNzYWdlcyA9IHtcblx0XHRcdFx0XHRcdC4uLmV4aXN0aW5nLFxuXHRcdFx0XHRcdFx0ZGlzY2xhaW1lcjogY29tYmluZWREaXNjbGFpbWVyLFxuXHRcdFx0XHRcdFx0YWxsb3dBdXRvQ29uZmlybTogZmFsc2UsXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHQvLyBFZGl0L290aGVyIHRvb2xzOiBwcmVwZW5kIGhvb2sgbm90ZSB0byB0aGUgbWVzc2FnZSBib2R5XG5cdFx0XHRcdFx0Y29uc3QgbXNnVGV4dCA9IHR5cGVvZiBleGlzdGluZy5tZXNzYWdlID09PSAnc3RyaW5nJyA/IGV4aXN0aW5nLm1lc3NhZ2UgOiBleGlzdGluZy5tZXNzYWdlPy52YWx1ZSA/PyAnJztcblx0XHRcdFx0XHRwcmVwYXJlZEludm9jYXRpb24uY29uZmlybWF0aW9uTWVzc2FnZXMgPSB7XG5cdFx0XHRcdFx0XHQuLi5leGlzdGluZyxcblx0XHRcdFx0XHRcdG1lc3NhZ2U6IG5ldyBNYXJrZG93blN0cmluZyhgXyR7aG9va05vdGV9X1xcblxcbiR7bXNnVGV4dH1gKSxcblx0XHRcdFx0XHRcdGFsbG93QXV0b0NvbmZpcm06IGZhbHNlLFxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiB7IGF1dG9Db25maXJtZWQ6IHVuZGVmaW5lZCwgcHJlcGFyZWRJbnZvY2F0aW9uIH07XG5cdFx0fVxuXG5cdFx0Ly8gTm8gaG9vayBkZWNpc2lvbiAtIHVzZSBub3JtYWwgYXV0by1jb25maXJtIGxvZ2ljXG5cdFx0Y29uc3QgYXBwcm92ZUNvbWJpbmF0aW9uID0gcHJlcGFyZWRJbnZvY2F0aW9uPy5jb25maXJtYXRpb25NZXNzYWdlcz8uYXBwcm92ZUNvbWJpbmF0aW9uO1xuXHRcdGxldCBjb21iaW5hdGlvbjogeyBsYWJlbDogc3RyaW5nOyBrZXk6IHN0cmluZyB9IHwgdW5kZWZpbmVkO1xuXHRcdGlmIChhcHByb3ZlQ29tYmluYXRpb24pIHtcblx0XHRcdGNvbWJpbmF0aW9uID0ge1xuXHRcdFx0XHRsYWJlbDogdHlwZW9mIGFwcHJvdmVDb21iaW5hdGlvbi5sYWJlbCA9PT0gJ3N0cmluZycgPyBhcHByb3ZlQ29tYmluYXRpb24ubGFiZWwgOiBhcHByb3ZlQ29tYmluYXRpb24ubGFiZWwudmFsdWUsXG5cdFx0XHRcdGtleTogYXBwcm92ZUNvbWJpbmF0aW9uLmtleSxcblx0XHRcdH07XG5cdFx0fVxuXHRcdGNvbnN0IGF1dG9Db25maXJtZWQgPSBhd2FpdCB0aGlzLnNob3VsZEF1dG9Db25maXJtKHRvb2wuZGF0YS5pZCwgdG9vbC5kYXRhLnJ1bnNJbldvcmtzcGFjZSwgdG9vbC5kYXRhLnNvdXJjZSwgZHRvLnBhcmFtZXRlcnMsIHNlc3Npb25SZXNvdXJjZSwgZHRvLmNoYXRSZXF1ZXN0SWQsIGNvbWJpbmF0aW9uLCBkdG8uY29udGV4dD8ud29ya2luZ0RpcmVjdG9yeSk7XG5cdFx0cmV0dXJuIHsgYXV0b0NvbmZpcm1lZCwgcHJlcGFyZWRJbnZvY2F0aW9uIH07XG5cdH1cblxuXHQvKipcblx0ICogSW4gQXV0b3BpbG90LCBydW5zIHRoZSByaXNrIGNsYXNzaWZpZXIgb24gYW4gYXV0by1hcHByb3ZlZCBjYWxsIGFuZCBza2lwcyBpdCB3aGVuIHRoZSByYXRpbmdcblx0ICogaXMge0BsaW5rIFRvb2xSaXNrTGV2ZWwuUmVkfS4gQW55IG90aGVyIHJlc3VsdCByZXR1cm5zIHRoZSBvcmlnaW5hbCBhdXRvLWNvbmZpcm1hdGlvblxuXHQgKiB1bmNoYW5nZWQuXG5cdCAqXG5cdCAqIFRvIGtlZXAgdGhlIGNsYXNzaWZpZXIgb2ZmIHRoZSBob3QgcGF0aCwgaXQgb25seSBydW5zIHdoZW4gYWxsIG9mIHRoZXNlIGhvbGQ6XG5cdCAqIC0gdGhlIGNhbGwgd2FzIGF1dG8tYXBwcm92ZWQgYnkgdGhlIHNlc3Npb24gYXBwcm92aW5nIGV2ZXJ5dGhpbmcsIG9yIGlzIGEgYHJ1bl9pbl90ZXJtaW5hbGAgL1xuXHQgKiAgIGZldGNoIGNhbGwgdGhhdCBzZWxmLWFwcHJvdmVkICh0aGVzZSBjYW4gcnVuIHJpc2t5IGNvbW1hbmRzIG9yIHByb21wdC1pbmplY3RlZCBVUkxzIHdpdGhvdXRcblx0ICogICBldmVyIHNob3dpbmcgYSBjb25maXJtYXRpb24pO1xuXHQgKiAtIGl0IHdvdWxkIG90aGVyd2lzZSBzaG93IGEgY29uZmlybWF0aW9uICh0aGUgc2VsZi1hcHByb3ZpbmcgdG9vbHMgYWJvdmUgYXJlIHRoZSBleGNlcHRpb24pO1xuXHQgKiAtIHRoZSBzZXNzaW9uIGlzIGEgbG9jYWwgcGFuZWwgc2Vzc2lvbiBhdCB0aGUgQXV0b3BpbG90IGxldmVsIHdpdGggQWR2YW5jZWQgQXV0b3BpbG90IG9uLlxuXHQgKlxuXHQgKiBUaGlzIGlzIGluZGVwZW5kZW50IG9mIGBjaGF0LnRvb2xzLnJpc2tBc3Nlc3NtZW50LmVuYWJsZWRgLCB3aGljaCBvbmx5IGNvbnRyb2xzIHRoZVxuXHQgKiBjb25maXJtYXRpb24gcmlzayBiYWRnZS4gQ0xJIGFuZCBhZ2VudC1ob3N0IHNlc3Npb25zIGhhbmRsZSB0aGVpciBvd24gY29uZmlybWF0aW9ucyBhbmQgYXJlXG5cdCAqIGV4Y2x1ZGVkLlxuXHQgKlxuXHQgKiBGYWlscyBvcGVuOiBhIGNhbmNlbGxlZCwgdW5hdmFpbGFibGUsIG9yIGZhaWxlZCBhc3Nlc3NtZW50IGtlZXBzIHRoZSBvcmlnaW5hbFxuXHQgKiBhdXRvLWNvbmZpcm1hdGlvbiBzbyBBdXRvcGlsb3Qga2VlcHMgbW92aW5nLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfbWF5YmVBcHBseUF1dG9waWxvdFJpc2tHYXRlKFxuXHRcdHRvb2w6IElUb29sRW50cnksXG5cdFx0ZHRvOiBJVG9vbEludm9jYXRpb24sXG5cdFx0cHJlcGFyZWRJbnZvY2F0aW9uOiBJUHJlcGFyZWRUb29sSW52b2NhdGlvbiB8IHVuZGVmaW5lZCxcblx0XHRhdXRvQ29uZmlybWVkOiBDb25maXJtZWRSZWFzb24gfCB1bmRlZmluZWQsXG5cdFx0dG9rZW46IENhbmNlbGxhdGlvblRva2VuLFxuXHQpOiBQcm9taXNlPHsgYXV0b0NvbmZpcm1lZDogQ29uZmlybWVkUmVhc29uIHwgdW5kZWZpbmVkOyBza2lwRXhwbGFuYXRpb24/OiBzdHJpbmcgfT4ge1xuXHRcdGNvbnN0IGlzVGVybWluYWxUb29sID0gdG9vbC5kYXRhLmlkID09PSBUZXJtaW5hbFRvb2xJZC5SdW5JblRlcm1pbmFsO1xuXHRcdGNvbnN0IGlzRmV0Y2hUb29sID0gZmV0Y2hXZWJQYWdlVG9vbElkcy5oYXModG9vbC5kYXRhLmlkKTtcblx0XHRjb25zdCBpc0Fsd2F5c0NsYXNzaWZ5VG9vbCA9IGlzVGVybWluYWxUb29sIHx8IGlzRmV0Y2hUb29sO1xuXG5cdFx0Ly8gTm9ybWFsbHkgb25seSBnYXRlIGNhbGxzIHRoZSBzZXNzaW9uIGF1dG8tYXBwcm92ZWQgd2hvbGVzYWxlICh0aGUgYGF1dG9BcHByb3ZlQWxsUmVhc29uYFxuXHRcdC8vIHNlbnRpbmVsKS4gQSBwZXItdG9vbCBzZXR0aW5nLCB1c2VyIGFjdGlvbiwgb3IgaG9vayBjYXJyaWVzIGEgY29uY3JldGUgcmVhc29uIGFuZCBpc1xuXHRcdC8vIHJlc3BlY3RlZCBhcy1pcy5cblx0XHQvL1xuXHRcdC8vIEV4Y2VwdGlvbjogcnVuX2luX3Rlcm1pbmFsIGFuZCBmZXRjaCBzZWxmLWFwcHJvdmUgd2l0aG91dCBhIGNvbmZpcm1hdGlvbiwgc28gYSByaXNreSBjb21tYW5kXG5cdFx0Ly8gb3IgYSBwcm9tcHQtaW5qZWN0ZWQgVVJMIHdvdWxkIHJ1biB1bmNsYXNzaWZpZWQuIEdhdGUgdGhlbSB3aGVuIHRoZXkgYXJyaXZlIHNlbGYtYXBwcm92ZWRcblx0XHQvLyAobm8gcmVhc29uIGFuZCBubyBjb25maXJtYXRpb24gb2YgdGhlaXIgb3duKTsgYW4gZXhwbGljaXQgYWxsb3cgY2FycmllcyBhIGNvbmNyZXRlIHJlYXNvblxuXHRcdC8vIGluc3RlYWQgb2YgYHVuZGVmaW5lZGAsIHNvIGl0IHN0YXlzIHJlc3BlY3RlZC5cblx0XHRjb25zdCBpc0JsYW5rZXRTZXNzaW9uQXBwcm92ZSA9IGF1dG9Db25maXJtZWQ/LnR5cGUgPT09IFRvb2xDb25maXJtS2luZC5Db25maXJtYXRpb25Ob3ROZWVkZWRcblx0XHRcdCYmIGF1dG9Db25maXJtZWQucmVhc29uID09PSBhdXRvQXBwcm92ZUFsbFJlYXNvbjtcblx0XHRjb25zdCBpc1NlbGZBcHByb3ZlZEFsd2F5c0NsYXNzaWZ5ID0gaXNBbHdheXNDbGFzc2lmeVRvb2xcblx0XHRcdCYmIGF1dG9Db25maXJtZWQgPT09IHVuZGVmaW5lZFxuXHRcdFx0JiYgIXByZXBhcmVkSW52b2NhdGlvbj8uY29uZmlybWF0aW9uTWVzc2FnZXM/LnRpdGxlO1xuXHRcdGlmICghaXNCbGFua2V0U2Vzc2lvbkFwcHJvdmUgJiYgIWlzU2VsZkFwcHJvdmVkQWx3YXlzQ2xhc3NpZnkpIHtcblx0XHRcdHJldHVybiB7IGF1dG9Db25maXJtZWQgfTtcblx0XHR9XG5cblx0XHQvLyBPbmx5IGdhdGUgY2FsbHMgdGhhdCB3b3VsZCBvdGhlcndpc2Ugc2hvdyBhIGNvbmZpcm1hdGlvbiwgcGx1cyB0aGUgc2VsZi1hcHByb3ZpbmcgdG9vbHMgYWJvdmUuXG5cdFx0aWYgKCFpc0Fsd2F5c0NsYXNzaWZ5VG9vbCAmJiAhcHJlcGFyZWRJbnZvY2F0aW9uPy5jb25maXJtYXRpb25NZXNzYWdlcz8udGl0bGUpIHtcblx0XHRcdHJldHVybiB7IGF1dG9Db25maXJtZWQgfTtcblx0XHR9XG5cblx0XHQvLyBDaGVjayB0aGUgQWR2YW5jZWQgQXV0b3BpbG90IGZsYWcgZmlyc3Q6IGl0IGlzIGRlZmF1bHQtb2ZmLCBzbyB0aGUgY29tbW9uIGNhc2UgYmFpbHMgYmVmb3JlXG5cdFx0Ly8gdGhlIHNlc3Npb24gbG9va3VwcyBiZWxvdy4gVGhpcyBkb2VzIG5vdCBjb25zdWx0IGBjaGF0LnRvb2xzLnJpc2tBc3Nlc3NtZW50LmVuYWJsZWRgLCB3aGljaFxuXHRcdC8vIG9ubHkgY29udHJvbHMgdGhlIGNvbmZpcm1hdGlvbiByaXNrIGJhZGdlLlxuXHRcdGlmICh0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihDaGF0Q29uZmlndXJhdGlvbi5BdXRvcGlsb3RBZHZhbmNlZEVuYWJsZWQpICE9PSB0cnVlKSB7XG5cdFx0XHRyZXR1cm4geyBhdXRvQ29uZmlybWVkIH07XG5cdFx0fVxuXG5cdFx0Ly8gU2NvcGUgdG8gbG9jYWwgcGFuZWwgc2Vzc2lvbnMgYXQgdGhlIEF1dG9waWxvdCBsZXZlbC4gQ0xJIGFuZCBhZ2VudC1ob3N0IHNlc3Npb25zIGhhbmRsZVxuXHRcdC8vIHRoZWlyIG93biBjb25maXJtYXRpb25zLlxuXHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IGR0by5jb250ZXh0Py5zZXNzaW9uUmVzb3VyY2U7XG5cdFx0aWYgKCFzZXNzaW9uUmVzb3VyY2UgfHwgZ2V0Q2hhdFNlc3Npb25UeXBlKHNlc3Npb25SZXNvdXJjZSkgIT09IGxvY2FsQ2hhdFNlc3Npb25UeXBlKSB7XG5cdFx0XHRyZXR1cm4geyBhdXRvQ29uZmlybWVkIH07XG5cdFx0fVxuXHRcdGlmICghdGhpcy5faXNTZXNzaW9uSW5BdXRvcGlsb3RMZXZlbChzZXNzaW9uUmVzb3VyY2UpKSB7XG5cdFx0XHRyZXR1cm4geyBhdXRvQ29uZmlybWVkIH07XG5cdFx0fVxuXG5cdFx0dHJ5IHtcblx0XHRcdC8vIGlnbm9yZUVuYWJsZW1lbnQ6IGFzc2VzcyBldmVuIHdoZW4gdGhlIHJpc2stYmFkZ2Ugc2V0dGluZyBpcyBvZmYuXG5cdFx0XHRjb25zdCBhc3Nlc3NtZW50ID0gYXdhaXQgdGhpcy5fcmlza0Fzc2Vzc21lbnRTZXJ2aWNlLmFzc2Vzcyh0b29sLmRhdGEsIGR0by5wYXJhbWV0ZXJzLCB0b2tlbiwgdW5kZWZpbmVkLCB7IGlnbm9yZUVuYWJsZW1lbnQ6IHRydWUgfSk7XG5cdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0cmV0dXJuIHsgYXV0b0NvbmZpcm1lZCB9O1xuXHRcdFx0fVxuXHRcdFx0aWYgKGFzc2Vzc21lbnQ/LnJpc2sgPT09IFRvb2xSaXNrTGV2ZWwuUmVkKSB7XG5cdFx0XHRcdGNvbnN0IGZhbGxiYWNrRXhwbGFuYXRpb24gPSBsb2NhbGl6ZSgnYXV0b3BpbG90Umlza1NraXBGYWxsYmFjaycsIFwiVGhlIGFjdGlvbiB3YXMgYXNzZXNzZWQgYXMgcG90ZW50aWFsbHkgZGVzdHJ1Y3RpdmUgb3IgaXJyZXZlcnNpYmxlLlwiKTtcblx0XHRcdFx0Y29uc3QgZXhwbGFuYXRpb24gPSBhc3Nlc3NtZW50LmV4cGxhbmF0aW9uLnRyaW0oKSB8fCBmYWxsYmFja0V4cGxhbmF0aW9uO1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlI2ludm9rZVRvb2xdIEF1dG9waWxvdCBza2lwcGluZyBoaWdoLXJpc2sgdG9vbCAke3Rvb2wuZGF0YS5pZH06ICR7ZXhwbGFuYXRpb259YCk7XG5cdFx0XHRcdHJldHVybiB7IGF1dG9Db25maXJtZWQ6IHsgdHlwZTogVG9vbENvbmZpcm1LaW5kLlNraXBwZWQgfSwgc2tpcEV4cGxhbmF0aW9uOiBleHBsYW5hdGlvbiB9O1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSNpbnZva2VUb29sXSBBdXRvcGlsb3QgcmlzayBhc3Nlc3NtZW50IGZhaWxlZCBmb3IgdG9vbCAke3Rvb2wuZGF0YS5pZH0sIGFsbG93aW5nOiAke3RvRXJyb3JNZXNzYWdlKGVycil9YCk7XG5cdFx0fVxuXG5cdFx0Ly8gR3JlZW4vb3JhbmdlLCBubyBhc3Nlc3NtZW50LCBvciBhIGZhaWx1cmU6IGtlZXAgdGhlIG9yaWdpbmFsIGF1dG8tY29uZmlybWF0aW9uIChmYWlsIG9wZW4pLlxuXHRcdHJldHVybiB7IGF1dG9Db25maXJtZWQgfTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcHJlcGFyZVRvb2xJbnZvY2F0aW9uKHRvb2w6IElUb29sRW50cnksIGR0bzogSVRvb2xJbnZvY2F0aW9uLCBmb3JjZUNvbmZpcm1hdGlvblJlYXNvbjogc3RyaW5nIHwgdW5kZWZpbmVkLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElQcmVwYXJlZFRvb2xJbnZvY2F0aW9uIHwgdW5kZWZpbmVkPiB7XG5cdFx0bGV0IHByZXBhcmVkOiBJUHJlcGFyZWRUb29sSW52b2NhdGlvbiB8IHVuZGVmaW5lZDtcblx0XHRpZiAodG9vbC5pbXBsIS5wcmVwYXJlVG9vbEludm9jYXRpb24pIHtcblx0XHRcdGNvbnN0IHByZXBhcmVQcm9taXNlID0gdG9vbC5pbXBsIS5wcmVwYXJlVG9vbEludm9jYXRpb24oe1xuXHRcdFx0XHRwYXJhbWV0ZXJzOiBkdG8ucGFyYW1ldGVycyxcblx0XHRcdFx0dG9vbENhbGxJZDogZHRvLmNhbGxJZCxcblx0XHRcdFx0Y2hhdFJlcXVlc3RJZDogZHRvLmNoYXRSZXF1ZXN0SWQsXG5cdFx0XHRcdGNoYXRTZXNzaW9uUmVzb3VyY2U6IGR0by5jb250ZXh0Py5zZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRcdGNoYXRJbnRlcmFjdGlvbklkOiBkdG8uY2hhdEludGVyYWN0aW9uSWQsXG5cdFx0XHRcdG1vZGVsSWQ6IGR0by5tb2RlbElkLFxuXHRcdFx0XHRmb3JjZUNvbmZpcm1hdGlvblJlYXNvbjogZm9yY2VDb25maXJtYXRpb25SZWFzb24sXG5cdFx0XHRcdHdvcmtpbmdEaXJlY3Rvcnk6IGR0by5jb250ZXh0Py53b3JraW5nRGlyZWN0b3J5LFxuXHRcdFx0fSwgdG9rZW4pO1xuXG5cdFx0XHRjb25zdCByYWNlUmVzdWx0ID0gYXdhaXQgUHJvbWlzZS5yYWNlKFtcblx0XHRcdFx0dGltZW91dCgzMDAwLCB0b2tlbikudGhlbigoKSA9PiAndGltZW91dCcpLFxuXHRcdFx0XHRwcmVwYXJlUHJvbWlzZVxuXHRcdFx0XSk7XG5cdFx0XHRpZiAocmFjZVJlc3VsdCA9PT0gJ3RpbWVvdXQnICYmIGR0by5jb250ZXh0KSB7XG5cdFx0XHRcdHRoaXMuX29uRGlkUHJlcGFyZVRvb2xDYWxsQmVjb21lVW5yZXNwb25zaXZlLmZpcmUoe1xuXHRcdFx0XHRcdHNlc3Npb25SZXNvdXJjZTogZHRvLmNvbnRleHQuc2Vzc2lvblJlc291cmNlLFxuXHRcdFx0XHRcdHRvb2xEYXRhOiB0b29sLmRhdGFcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cblx0XHRcdHByZXBhcmVkID0gYXdhaXQgcHJlcGFyZVByb21pc2U7XG5cdFx0fVxuXG5cdFx0Y29uc3QgaXNFbGlnaWJsZUZvckF1dG9BcHByb3ZhbCA9IHRoaXMuaXNUb29sRWxpZ2libGVGb3JBdXRvQXBwcm92YWwodG9vbC5kYXRhKTtcblxuXHRcdC8vIERlZmF1bHQgY29uZmlybWF0aW9uIG1lc3NhZ2VzIGlmIHRvb2wgaXMgbm90IGVsaWdpYmxlIGZvciBhdXRvLWFwcHJvdmFsXG5cdFx0aWYgKCFpc0VsaWdpYmxlRm9yQXV0b0FwcHJvdmFsICYmICFwcmVwYXJlZD8uY29uZmlybWF0aW9uTWVzc2FnZXM/LnRpdGxlKSB7XG5cdFx0XHRpZiAoIXByZXBhcmVkKSB7XG5cdFx0XHRcdHByZXBhcmVkID0ge307XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBmdWxsUmVmZXJlbmNlTmFtZSA9IGdldFRvb2xGdWxsUmVmZXJlbmNlTmFtZSh0b29sLmRhdGEpO1xuXG5cdFx0XHQvLyBUT0RPOiBUaGlzIHNob3VsZCBiZSBtb3JlIGRldGFpbGVkIHBlciB0b29sLlxuXHRcdFx0cHJlcGFyZWQuY29uZmlybWF0aW9uTWVzc2FnZXMgPSB7XG5cdFx0XHRcdC4uLnByZXBhcmVkLmNvbmZpcm1hdGlvbk1lc3NhZ2VzLFxuXHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ2RlZmF1bHRUb29sQ29uZmlybWF0aW9uLnRpdGxlJywgJ0NvbmZpcm0gdG9vbCBleGVjdXRpb24nKSxcblx0XHRcdFx0bWVzc2FnZTogbG9jYWxpemUoJ2RlZmF1bHRUb29sQ29uZmlybWF0aW9uLm1lc3NhZ2UnLCAnUnVuIHRoZSBcXCd7MH1cXCcgdG9vbD8nLCBmdWxsUmVmZXJlbmNlTmFtZSksXG5cdFx0XHRcdGRpc2NsYWltZXI6IHRvb2xJZHNUaGF0Q2Fubm90QmVBdXRvQXBwcm92ZWQuaGFzKHRvb2wuZGF0YS5pZCkgPyB1bmRlZmluZWQgOiBuZXcgTWFya2Rvd25TdHJpbmcobG9jYWxpemUoJ2RlZmF1bHRUb29sQ29uZmlybWF0aW9uLmRpc2NsYWltZXInLCAnQXV0byBhcHByb3ZhbCBmb3IgXFwnezB9XFwnIGlzIHJlc3RyaWN0ZWQgdmlhIHsxfS4nLCBnZXRUb29sRnVsbFJlZmVyZW5jZU5hbWUodG9vbC5kYXRhKSwgY3JlYXRlTWFya2Rvd25Db21tYW5kTGluayh7IHRleHQ6ICdgJyArIENoYXRDb25maWd1cmF0aW9uLkVsaWdpYmxlRm9yQXV0b0FwcHJvdmFsICsgJ2AnLCBpZDogJ3dvcmtiZW5jaC5hY3Rpb24ub3BlblNldHRpbmdzJywgYXJndW1lbnRzOiBbQ2hhdENvbmZpZ3VyYXRpb24uRWxpZ2libGVGb3JBdXRvQXBwcm92YWxdLCB0b29sdGlwOiBsb2NhbGl6ZSgnb3BlblNldHRpbmdzLmF1dG9BcHByb3ZhbC50b29sdGlwJywgJ09wZW4gc2V0dGluZ3MgdG8gY29uZmlndXJlIGF1dG8tYXBwcm92YWwnKSB9LCBmYWxzZSkpLCB7IGlzVHJ1c3RlZDogdHJ1ZSB9KSxcblx0XHRcdFx0YWxsb3dBdXRvQ29uZmlybTogZmFsc2UsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGlmICghaXNFbGlnaWJsZUZvckF1dG9BcHByb3ZhbCAmJiBwcmVwYXJlZD8uY29uZmlybWF0aW9uTWVzc2FnZXM/LnRpdGxlKSB7XG5cdFx0XHQvLyBBbHdheXMgb3ZlcndyaXRlIHRoZSBkaXNjbGFpbWVyIGlmIG5vdCBlbGlnaWJsZSBmb3IgYXV0by1hcHByb3ZhbFxuXHRcdFx0cHJlcGFyZWQuY29uZmlybWF0aW9uTWVzc2FnZXMuZGlzY2xhaW1lciA9IHRvb2xJZHNUaGF0Q2Fubm90QmVBdXRvQXBwcm92ZWQuaGFzKHRvb2wuZGF0YS5pZCkgPyB1bmRlZmluZWQgOiBuZXcgTWFya2Rvd25TdHJpbmcobG9jYWxpemUoJ2RlZmF1bHRUb29sQ29uZmlybWF0aW9uLmRpc2NsYWltZXInLCAnQXV0byBhcHByb3ZhbCBmb3IgXFwnezB9XFwnIGlzIHJlc3RyaWN0ZWQgdmlhIHsxfS4nLCBnZXRUb29sRnVsbFJlZmVyZW5jZU5hbWUodG9vbC5kYXRhKSwgY3JlYXRlTWFya2Rvd25Db21tYW5kTGluayh7IHRleHQ6ICdgJyArIENoYXRDb25maWd1cmF0aW9uLkVsaWdpYmxlRm9yQXV0b0FwcHJvdmFsICsgJ2AnLCBpZDogJ3dvcmtiZW5jaC5hY3Rpb24ub3BlblNldHRpbmdzJywgYXJndW1lbnRzOiBbQ2hhdENvbmZpZ3VyYXRpb24uRWxpZ2libGVGb3JBdXRvQXBwcm92YWxdLCB0b29sdGlwOiBsb2NhbGl6ZSgnb3BlblNldHRpbmdzLmF1dG9BcHByb3ZhbC50b29sdGlwJywgJ09wZW4gc2V0dGluZ3MgdG8gY29uZmlndXJlIGF1dG8tYXBwcm92YWwnKSB9LCBmYWxzZSkpLCB7IGlzVHJ1c3RlZDogdHJ1ZSB9KTtcblx0XHR9XG5cblx0XHRpZiAocHJlcGFyZWQ/LmNvbmZpcm1hdGlvbk1lc3NhZ2VzPy50aXRsZSkge1xuXHRcdFx0aWYgKHByZXBhcmVkLnRvb2xTcGVjaWZpY0RhdGE/LmtpbmQgIT09ICd0ZXJtaW5hbCcgJiYgcHJlcGFyZWQuY29uZmlybWF0aW9uTWVzc2FnZXMuYWxsb3dBdXRvQ29uZmlybSAhPT0gZmFsc2UpIHtcblx0XHRcdFx0cHJlcGFyZWQuY29uZmlybWF0aW9uTWVzc2FnZXMuYWxsb3dBdXRvQ29uZmlybSA9IGlzRWxpZ2libGVGb3JBdXRvQXBwcm92YWw7XG5cdFx0XHR9XG5cblx0XHRcdGlmICghcHJlcGFyZWQudG9vbFNwZWNpZmljRGF0YSAmJiB0b29sLmRhdGEuYWx3YXlzRGlzcGxheUlucHV0T3V0cHV0KSB7XG5cdFx0XHRcdHByZXBhcmVkLnRvb2xTcGVjaWZpY0RhdGEgPSB7XG5cdFx0XHRcdFx0a2luZDogJ2lucHV0Jyxcblx0XHRcdFx0XHRyYXdJbnB1dDogZHRvLnBhcmFtZXRlcnMsXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHByZXBhcmVkO1xuXHR9XG5cblx0YmVnaW5Ub29sQ2FsbChvcHRpb25zOiBJQmVnaW5Ub29sQ2FsbE9wdGlvbnMpOiBJQ2hhdFRvb2xJbnZvY2F0aW9uIHwgdW5kZWZpbmVkIHtcblx0XHQvLyBGaXJzdCB0cnkgdG8gbG9vayB1cCBieSB0b29sIElEICh0aGUgcGFja2FnZS5qc29uIFwibmFtZVwiIGZpZWxkKSxcblx0XHQvLyB0aGVuIGZhbGwgYmFjayB0byBsb29raW5nIHVwIGJ5IHRvb2xSZWZlcmVuY2VOYW1lXG5cdFx0Y29uc3QgdG9vbEVudHJ5ID0gdGhpcy5fdG9vbHMuZ2V0KG9wdGlvbnMudG9vbElkKTtcblx0XHRpZiAoIXRvb2xFbnRyeSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHQvLyBEb24ndCBjcmVhdGUgYSBzdHJlYW1pbmcgaW52b2NhdGlvbiBmb3IgdG9vbHMgdGhhdCBkb24ndCBpbXBsZW1lbnQgaGFuZGxlVG9vbFN0cmVhbS5cblx0XHQvLyBUaGVzZSB0b29scyB3aWxsIGhhdmUgdGhlaXIgaW52b2NhdGlvbiBjcmVhdGVkIGRpcmVjdGx5IGluIGludm9rZVRvb2xJbnRlcm5hbC5cblx0XHQvLyBDYWxsZXJzIHRoYXQgbmVlZCBhIGhhbmRsZSByZWdhcmRsZXNzIChlLmcuIHRvIG9ic2VydmUgY29uZmlybWF0aW9uIHN0YXRlKSBjYW4gcGFzcyBgZm9yY2VgLlxuXHRcdGlmICghb3B0aW9ucy5mb3JjZSAmJiAhdG9vbEVudHJ5LmltcGw/LmhhbmRsZVRvb2xTdHJlYW0pIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Ly8gQ3JlYXRlIHRoZSBpbnZvY2F0aW9uIGluIHN0cmVhbWluZyBzdGF0ZVxuXHRcdGNvbnN0IGludm9jYXRpb24gPSBDaGF0VG9vbEludm9jYXRpb24uY3JlYXRlU3RyZWFtaW5nKHtcblx0XHRcdHRvb2xDYWxsSWQ6IG9wdGlvbnMudG9vbENhbGxJZCxcblx0XHRcdHRvb2xJZDogb3B0aW9ucy50b29sSWQsXG5cdFx0XHR0b29sRGF0YTogdG9vbEVudHJ5LmRhdGEsXG5cdFx0XHRzdWJhZ2VudEludm9jYXRpb25JZDogb3B0aW9ucy5zdWJhZ2VudEludm9jYXRpb25JZCxcblx0XHRcdGNoYXRSZXF1ZXN0SWQ6IG9wdGlvbnMuY2hhdFJlcXVlc3RJZCxcblx0XHR9KTtcblxuXHRcdC8vIFRyYWNrIHRoZSBwZW5kaW5nIHRvb2wgY2FsbFxuXHRcdHRoaXMuX3BlbmRpbmdUb29sQ2FsbHMuc2V0KG9wdGlvbnMudG9vbENhbGxJZCwgaW52b2NhdGlvbik7XG5cblx0XHQvLyBJZiB3ZSBoYXZlIGEgc2Vzc2lvbiwgYXBwZW5kIHRoZSBpbnZvY2F0aW9uIHRvIHRoZSBjaGF0IGFzIHByb2dyZXNzXG5cdFx0aWYgKG9wdGlvbnMuc2Vzc2lvblJlc291cmNlKSB7XG5cdFx0XHRjb25zdCBtb2RlbCA9IHRoaXMuX2NoYXRTZXJ2aWNlLmdldFNlc3Npb24ob3B0aW9ucy5zZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0aWYgKG1vZGVsKSB7XG5cdFx0XHRcdC8vIEZpbmQgdGhlIHJlcXVlc3QgYnkgY2hhdFJlcXVlc3RJZCBpZiBhdmFpbGFibGUsIG90aGVyd2lzZSB1c2UgdGhlIGxhc3QgcmVxdWVzdFxuXHRcdFx0XHRjb25zdCByZXF1ZXN0ID0gKG9wdGlvbnMuY2hhdFJlcXVlc3RJZFxuXHRcdFx0XHRcdD8gbW9kZWwuZ2V0UmVxdWVzdHMoKS5maW5kKHIgPT4gci5pZCA9PT0gb3B0aW9ucy5jaGF0UmVxdWVzdElkKVxuXHRcdFx0XHRcdDogdW5kZWZpbmVkKSA/PyBtb2RlbC5nZXRSZXF1ZXN0cygpLmF0KC0xKTtcblx0XHRcdFx0aWYgKHJlcXVlc3QpIHtcblx0XHRcdFx0XHR0aGlzLl9jaGF0U2VydmljZS5hcHBlbmRQcm9ncmVzcyhyZXF1ZXN0LCBpbnZvY2F0aW9uKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIENhbGwgaGFuZGxlVG9vbFN0cmVhbSB0byBnZXQgaW5pdGlhbCBzdHJlYW1pbmcgbWVzc2FnZVxuXHRcdHRoaXMuX2NhbGxIYW5kbGVUb29sU3RyZWFtKHRvb2xFbnRyeSwgaW52b2NhdGlvbiwgb3B0aW9ucy50b29sQ2FsbElkLCB1bmRlZmluZWQsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0cmV0dXJuIGludm9jYXRpb247XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9jYWxsSGFuZGxlVG9vbFN0cmVhbSh0b29sRW50cnk6IElUb29sRW50cnksIGludm9jYXRpb246IENoYXRUb29sSW52b2NhdGlvbiwgdG9vbENhbGxJZDogc3RyaW5nLCByYXdJbnB1dDogdW5rbm93biwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0b29sRW50cnkuaW1wbD8uaGFuZGxlVG9vbFN0cmVhbSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdG9vbEVudHJ5LmltcGwuaGFuZGxlVG9vbFN0cmVhbSh7XG5cdFx0XHRcdHRvb2xDYWxsSWQsXG5cdFx0XHRcdHJhd0lucHV0LFxuXHRcdFx0XHRjaGF0UmVxdWVzdElkOiBpbnZvY2F0aW9uLmNoYXRSZXF1ZXN0SWQsXG5cdFx0XHR9LCB0b2tlbik7XG5cblx0XHRcdGlmIChyZXN1bHQ/Lmludm9jYXRpb25NZXNzYWdlKSB7XG5cdFx0XHRcdGludm9jYXRpb24udXBkYXRlU3RyZWFtaW5nTWVzc2FnZShyZXN1bHQuaW52b2NhdGlvbk1lc3NhZ2UpO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGBbTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSNfY2FsbEhhbmRsZVRvb2xTdHJlYW1dIEVycm9yIGNhbGxpbmcgaGFuZGxlVG9vbFN0cmVhbSBmb3IgdG9vbCAke3Rvb2xFbnRyeS5kYXRhLmlkfTpgLCBlcnJvcik7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgdXBkYXRlVG9vbFN0cmVhbSh0b29sQ2FsbElkOiBzdHJpbmcsIHBhcnRpYWxJbnB1dDogdW5rbm93biwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgaW52b2NhdGlvbiA9IHRoaXMuX3BlbmRpbmdUb29sQ2FsbHMuZ2V0KHRvb2xDYWxsSWQpO1xuXHRcdGlmICghaW52b2NhdGlvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIFVwZGF0ZSB0aGUgcGFydGlhbCBpbnB1dCBvbiB0aGUgaW52b2NhdGlvblxuXHRcdGludm9jYXRpb24udXBkYXRlUGFydGlhbElucHV0KHBhcnRpYWxJbnB1dCk7XG5cblx0XHQvLyBDYWxsIGhhbmRsZVRvb2xTdHJlYW0gaWYgdGhlIHRvb2wgaW1wbGVtZW50cyBpdFxuXHRcdGNvbnN0IHRvb2xFbnRyeSA9IHRoaXMuX3Rvb2xzLmdldChpbnZvY2F0aW9uLnRvb2xJZCk7XG5cdFx0aWYgKHRvb2xFbnRyeSkge1xuXHRcdFx0YXdhaXQgdGhpcy5fY2FsbEhhbmRsZVRvb2xTdHJlYW0odG9vbEVudHJ5LCBpbnZvY2F0aW9uLCB0b29sQ2FsbElkLCBwYXJ0aWFsSW5wdXQsIHRva2VuKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHBsYXlBY2Nlc3NpYmlsaXR5U2lnbmFsKHRvb2xJbnZvY2F0aW9uczogQ2hhdFRvb2xJbnZvY2F0aW9uW10sIGNoYXRTZXNzaW9uUmVzb3VyY2U6IFVSSSB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGNvbnN0IGF1dG9BcHByb3ZlZCA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKENoYXRDb25maWd1cmF0aW9uLkdsb2JhbEF1dG9BcHByb3ZlKTtcblx0XHRpZiAoYXV0b0FwcHJvdmVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gQXV0b3BpbG90L2F1dG8tYXBwcm92ZSBwZXJtaXNzaW9uIGxldmVscyBhdXRvLWFwcHJvdmUgYWxsIHRvb2xzLCBza2lwIHNpZ25hbFxuXHRcdGlmIChjaGF0U2Vzc2lvblJlc291cmNlKSB7XG5cdFx0XHRjb25zdCBtb2RlbCA9IHRoaXMuX2NoYXRTZXJ2aWNlLmdldFNlc3Npb24oY2hhdFNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRjb25zdCByZXF1ZXN0ID0gbW9kZWw/LmdldFJlcXVlc3RzKCkuYXQoLTEpO1xuXHRcdFx0aWYgKGlzQXV0b0FwcHJvdmVMZXZlbChyZXF1ZXN0Py5tb2RlSW5mbz8ucGVybWlzc2lvbkxldmVsKSB8fCB0aGlzLl9pc1Nlc3Npb25MaXZlQXV0b0FwcHJvdmVMZXZlbChjaGF0U2Vzc2lvblJlc291cmNlKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gRmlsdGVyIG91dCBhbnkgdG9vbCBpbnZvY2F0aW9ucyB0aGF0IGhhdmUgYWxyZWFkeSBiZWVuIGNvbmZpcm1lZC9kZW5pZWQuXG5cdFx0Ly8gVGhpcyBpcyBhIGRlZmVuc2l2ZSBjaGVjayAtIG5vcm1hbGx5IHRoZSBjYWxsIHNpdGUgc2hvdWxkIHByZXZlbnQgdGhpcyxcblx0XHQvLyBidXQgdG9vbHMgbWF5IGJlIGF1dG8tYXBwcm92ZWQgdGhyb3VnaCB2YXJpb3VzIG1lY2hhbmlzbXMgKHBlci1zZXNzaW9uIHJ1bGVzLFxuXHRcdC8vIHBlci13b3Jrc3BhY2UgcnVsZXMsIGV0Yy4pIHRoYXQgY291bGQgY2F1c2UgYSByYWNlIGNvbmRpdGlvbi5cblx0XHRjb25zdCBwZW5kaW5nSW52b2NhdGlvbnMgPSB0b29sSW52b2NhdGlvbnMuZmlsdGVyKGludiA9PiAhSUNoYXRUb29sSW52b2NhdGlvbi5leGVjdXRpb25Db25maXJtZWRPckRlbmllZChpbnYpKTtcblx0XHRpZiAocGVuZGluZ0ludm9jYXRpb25zLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNldHRpbmc6IHsgc291bmQ/OiAnYXV0bycgfCAnb24nIHwgJ29mZic7IGFubm91bmNlbWVudD86ICdhdXRvJyB8ICdvZmYnIH0gfCB1bmRlZmluZWQgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShBY2Nlc3NpYmlsaXR5U2lnbmFsLmNoYXRVc2VyQWN0aW9uUmVxdWlyZWQuc2V0dGluZ3NLZXkpO1xuXHRcdGlmICghc2V0dGluZykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBzb3VuZEVuYWJsZWQgPSBzZXR0aW5nLnNvdW5kID09PSAnb24nIHx8IChzZXR0aW5nLnNvdW5kID09PSAnYXV0bycgJiYgKHRoaXMuX2FjY2Vzc2liaWxpdHlTZXJ2aWNlLmlzU2NyZWVuUmVhZGVyT3B0aW1pemVkKCkpKTtcblx0XHRjb25zdCBhbm5vdW5jZW1lbnRFbmFibGVkID0gdGhpcy5fYWNjZXNzaWJpbGl0eVNlcnZpY2UuaXNTY3JlZW5SZWFkZXJPcHRpbWl6ZWQoKSAmJiBzZXR0aW5nLmFubm91bmNlbWVudCA9PT0gJ2F1dG8nO1xuXHRcdGlmIChzb3VuZEVuYWJsZWQgfHwgYW5ub3VuY2VtZW50RW5hYmxlZCkge1xuXHRcdFx0dGhpcy5fYWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UucGxheVNpZ25hbChBY2Nlc3NpYmlsaXR5U2lnbmFsLmNoYXRVc2VyQWN0aW9uUmVxdWlyZWQsIHsgY3VzdG9tQWxlcnRNZXNzYWdlOiB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihnZXRUb29sQ29uZmlybWF0aW9uQWxlcnQsIHBlbmRpbmdJbnZvY2F0aW9ucyksIHVzZXJHZXN0dXJlOiB0cnVlLCBtb2RhbGl0eTogIXNvdW5kRW5hYmxlZCA/ICdhbm5vdW5jZW1lbnQnIDogdW5kZWZpbmVkIH0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZW5zdXJlVG9vbERldGFpbHMoZHRvOiBJVG9vbEludm9jYXRpb24sIHRvb2xSZXN1bHQ6IElUb29sUmVzdWx0LCB0b29sRGF0YTogSVRvb2xEYXRhLCB0b29sSW52b2NhdGlvbjogQ2hhdFRvb2xJbnZvY2F0aW9uIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0aWYgKCF0b29sUmVzdWx0LnRvb2xSZXN1bHREZXRhaWxzICYmICh0b29sRGF0YS5hbHdheXNEaXNwbGF5SW5wdXRPdXRwdXQgfHwgKHRoaXMudG9vbFJlc3VsdEhhc0ltYWdlcyh0b29sUmVzdWx0KSAmJiAhdGhpcy50b29sUmVzdWx0TWVzc2FnZUhhc0ltYWdlRmlsZVdpZGdldHModG9vbFJlc3VsdCwgdG9vbEludm9jYXRpb24pKSkpIHtcblx0XHRcdHRvb2xSZXN1bHQudG9vbFJlc3VsdERldGFpbHMgPSB7XG5cdFx0XHRcdGlucHV0OiB0aGlzLmZvcm1hdFRvb2xJbnB1dChkdG8pLFxuXHRcdFx0XHRvdXRwdXQ6IHRoaXMudG9vbFJlc3VsdFRvSU8odG9vbFJlc3VsdCksXG5cdFx0XHR9O1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgdG9vbFJlc3VsdEhhc0ltYWdlcyh0b29sUmVzdWx0OiBJVG9vbFJlc3VsdCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0b29sUmVzdWx0LmNvbnRlbnQuc29tZShwYXJ0ID0+IHBhcnQua2luZCA9PT0gJ2RhdGEnICYmIHBhcnQudmFsdWUubWltZVR5cGU/LnN0YXJ0c1dpdGgoJ2ltYWdlLycpKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRydWUgaWYgdGhlIHRvb2wgcmVzdWx0IG1lc3NhZ2UgKG9yIGZhbGxpbmcgYmFjayB0byB0aGUgdG9vbCBpbnZvY2F0aW9uJ3Ncblx0ICogcGFzdFRlbnNlTWVzc2FnZSBmcm9tIHN0cmVhbWluZykgY29udGFpbnMgZW1wdHkgbWFya2Rvd24gbGlua3MgcG9pbnRpbmcgdG8gaW1hZ2Vcblx0ICogZmlsZXMgKHRoZSBgW10oaW1hZ2VVcmkpYCBwYXR0ZXJuKSB0aGF0IHdpbGwgYmUgcmVuZGVyZWQgYXMgZmlsZSBwaWxscyBieSByZW5kZXJGaWxlV2lkZ2V0cy5cblx0ICovXG5cdHByaXZhdGUgdG9vbFJlc3VsdE1lc3NhZ2VIYXNJbWFnZUZpbGVXaWRnZXRzKHRvb2xSZXN1bHQ6IElUb29sUmVzdWx0LCB0b29sSW52b2NhdGlvbjogQ2hhdFRvb2xJbnZvY2F0aW9uIHwgdW5kZWZpbmVkKTogYm9vbGVhbiB7XG5cdFx0Ly8gQ2hlY2sgdG9vbFJlc3VsdC50b29sUmVzdWx0TWVzc2FnZSBmaXJzdCBcdTIwMTQgdGhpcyBpcyB3aGF0IGRpZEV4ZWN1dGVUb29sIHdpbGxcblx0XHQvLyBjb3B5IGludG8gcGFzdFRlbnNlTWVzc2FnZSwgYW5kIGl0J3MgYWxyZWFkeSBhdmFpbGFibGUgYXQgdGhpcyBwb2ludC5cblx0XHQvLyBGYWxsIGJhY2sgdG8gcGFzdFRlbnNlTWVzc2FnZSB3aGljaCBtYXkgaGF2ZSBiZWVuIHNldCBkdXJpbmcgdGhlIHN0cmVhbWluZyBwaGFzZS5cblx0XHRjb25zdCBtZXNzYWdlID0gdG9vbFJlc3VsdC50b29sUmVzdWx0TWVzc2FnZSA/PyB0b29sSW52b2NhdGlvbj8ucGFzdFRlbnNlTWVzc2FnZTtcblx0XHRpZiAoIW1lc3NhZ2UpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Y29uc3QgdmFsdWUgPSB0eXBlb2YgbWVzc2FnZSA9PT0gJ3N0cmluZycgPyBtZXNzYWdlIDogbWVzc2FnZS52YWx1ZTtcblx0XHQvLyBNYXRjaCBlbXB0eS10ZXh0IG1hcmtkb3duIGxpbmtzOiBbXSh1cmkpIG9yIFsgXSh1cmkpLCBjYXB0dXJpbmcgdGhlIHVyaVxuXHRcdGNvbnN0IGxpbmtQYXR0ZXJuID0gL1xcW1xccypcXF1cXCgoPzx1cmk+W14pXSspXFwpL2c7XG5cdFx0bGV0IG1hdGNoOiBSZWdFeHBFeGVjQXJyYXkgfCBudWxsO1xuXHRcdHdoaWxlICgobWF0Y2ggPSBsaW5rUGF0dGVybi5leGVjKHZhbHVlKSkgIT09IG51bGwpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IHBhcnNlZCA9IFVSSS5wYXJzZShtYXRjaC5ncm91cHMhLnVyaSk7XG5cdFx0XHRcdGNvbnN0IG1pbWUgPSBnZXRNZWRpYU1pbWUocGFyc2VkLnBhdGgpO1xuXHRcdFx0XHRpZiAobWltZT8uc3RhcnRzV2l0aCgnaW1hZ2UvJykpIHtcblx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdC8vIEludmFsaWQgVVJJLCBza2lwXG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHByaXZhdGUgZm9ybWF0VG9vbElucHV0KGR0bzogSVRvb2xJbnZvY2F0aW9uKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gSlNPTi5zdHJpbmdpZnkoZHRvLnBhcmFtZXRlcnMsIHVuZGVmaW5lZCwgMik7XG5cdH1cblxuXHRwcml2YXRlIHRvb2xSZXN1bHRUb0lPKHRvb2xSZXN1bHQ6IElUb29sUmVzdWx0KTogSVRvb2xSZXN1bHRJbnB1dE91dHB1dERldGFpbHNbJ291dHB1dCddIHtcblx0XHRyZXR1cm4gdG9vbFJlc3VsdC5jb250ZW50Lm1hcChwYXJ0ID0+IHtcblx0XHRcdGlmIChwYXJ0LmtpbmQgPT09ICd0ZXh0Jykge1xuXHRcdFx0XHRyZXR1cm4geyB0eXBlOiAnZW1iZWQnLCBpc1RleHQ6IHRydWUsIHZhbHVlOiBwYXJ0LnZhbHVlIH07XG5cdFx0XHR9IGVsc2UgaWYgKHBhcnQua2luZCA9PT0gJ3Byb21wdFRzeCcpIHtcblx0XHRcdFx0cmV0dXJuIHsgdHlwZTogJ2VtYmVkJywgaXNUZXh0OiB0cnVlLCB2YWx1ZTogc3RyaW5naWZ5UHJvbXB0VHN4UGFydChwYXJ0KSB9O1xuXHRcdFx0fSBlbHNlIGlmIChwYXJ0LmtpbmQgPT09ICdkYXRhJykge1xuXHRcdFx0XHRyZXR1cm4geyB0eXBlOiAnZW1iZWQnLCB2YWx1ZTogZW5jb2RlQmFzZTY0KHBhcnQudmFsdWUuZGF0YSksIG1pbWVUeXBlOiBwYXJ0LnZhbHVlLm1pbWVUeXBlIH07XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRhc3NlcnROZXZlcihwYXJ0KTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRydWUgaWYgZW50ZXJwcmlzZSBwb2xpY3kgaGFzIGV4cGxpY2l0bHkgZGlzYWJsZWQgdGhlIGdsb2JhbCBhdXRvLWFwcHJvdmUgc2V0dGluZy5cblx0ICogV2hlbiB0aGlzIGlzIHRoZSBjYXNlLCBCeXBhc3MgQXBwcm92YWxzIGFuZCBBdXRvcGlsb3QgcGVybWlzc2lvbiBsZXZlbHMgc2hvdWxkIG5vdCBhdXRvLWFwcHJvdmUgdG9vbHMuXG5cdCAqL1xuXHRwcml2YXRlIF9pc0F1dG9BcHByb3ZlUG9saWN5UmVzdHJpY3RlZCgpOiBib29sZWFuIHtcblx0XHRjb25zdCBpbnNwZWN0ZWQgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5pbnNwZWN0PGJvb2xlYW4+KENoYXRDb25maWd1cmF0aW9uLkdsb2JhbEF1dG9BcHByb3ZlKTtcblx0XHRyZXR1cm4gaW5zcGVjdGVkLnBvbGljeVZhbHVlID09PSBmYWxzZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRydWUgaWYgdGhlIHNlc3Npb24ncyBjdXJyZW50IChsaXZlKSBwZXJtaXNzaW9uIHBpY2tlciBsZXZlbCBpcyBhdXRvLWFwcHJvdmUuXG5cdCAqIFRoaXMgY2hlY2tzIHRoZSB3aWRnZXQncyBjdXJyZW50IHN0YXRlLCBub3Qgd2hhdCB3YXMgc3RhbXBlZCBvbiB0aGUgcmVxdWVzdCxcblx0ICogc28gc3dpdGNoaW5nIHRvIEF1dG9waWxvdCBtaWQtc2Vzc2lvbiB0YWtlcyBlZmZlY3QgaW1tZWRpYXRlbHkuXG5cdCAqL1xuXHRwcml2YXRlIF9pc1Nlc3Npb25MaXZlQXV0b0FwcHJvdmVMZXZlbChjaGF0U2Vzc2lvblJlc291cmNlOiBVUkkpOiBib29sZWFuIHtcblx0XHRjb25zdCB3aWRnZXQgPSB0aGlzLl9jaGF0V2lkZ2V0U2VydmljZS5nZXRXaWRnZXRCeVNlc3Npb25SZXNvdXJjZShjaGF0U2Vzc2lvblJlc291cmNlKVxuXHRcdFx0Pz8gdGhpcy5fY2hhdFdpZGdldFNlcnZpY2UubGFzdEZvY3VzZWRXaWRnZXQ7XG5cdFx0cmV0dXJuICEhd2lkZ2V0ICYmIGlzQXV0b0FwcHJvdmVMZXZlbCh3aWRnZXQuaW5wdXQuY3VycmVudE1vZGVJbmZvLnBlcm1pc3Npb25MZXZlbCk7XG5cdH1cblxuXHQvKipcblx0ICogVHJ1ZSBpZiB0aGUgc2Vzc2lvbiBpcyBpbiBhbiBhdXRvLWFwcHJvdmUgbGV2ZWwgKEF1dG8tQXBwcm92ZSAvIEF1dG9waWxvdCksXG5cdCAqIHZpYSBlaXRoZXIgdGhlIGxhc3QgcmVxdWVzdCdzIHN0YW1wZWQgbGV2ZWwgb3IgdGhlIGxpdmUgcGlja2VyIGxldmVsLlxuXHQgKi9cblx0cHJpdmF0ZSBfaXNTZXNzaW9uSW5BdXRvQXBwcm92ZUxldmVsKGNoYXRTZXNzaW9uUmVzb3VyY2U6IFVSSSB8IHVuZGVmaW5lZCk6IGJvb2xlYW4ge1xuXHRcdGlmICghY2hhdFNlc3Npb25SZXNvdXJjZSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuX2NoYXRTZXJ2aWNlLmdldFNlc3Npb24oY2hhdFNlc3Npb25SZXNvdXJjZSk7XG5cdFx0Y29uc3QgcmVxdWVzdCA9IG1vZGVsPy5nZXRSZXF1ZXN0cygpLmF0KC0xKTtcblx0XHRyZXR1cm4gaXNBdXRvQXBwcm92ZUxldmVsKHJlcXVlc3Q/Lm1vZGVJbmZvPy5wZXJtaXNzaW9uTGV2ZWwpIHx8IHRoaXMuX2lzU2Vzc2lvbkxpdmVBdXRvQXBwcm92ZUxldmVsKGNoYXRTZXNzaW9uUmVzb3VyY2UpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFRydWUgaWYgdGhlIHNlc3Npb24ncyBsaXZlIHBlcm1pc3Npb24gcGlja2VyIGxldmVsIGlzIEF1dG9waWxvdC4gTGlrZVxuXHQgKiB7QGxpbmsgX2lzU2Vzc2lvbkxpdmVBdXRvQXBwcm92ZUxldmVsfSwgYnV0IGV4Y2x1ZGVzIHBsYWluIEF1dG8tQXBwcm92ZS5cblx0ICovXG5cdHByaXZhdGUgX2lzU2Vzc2lvbkxpdmVBdXRvcGlsb3RMZXZlbChjaGF0U2Vzc2lvblJlc291cmNlOiBVUkkpOiBib29sZWFuIHtcblx0XHRjb25zdCB3aWRnZXQgPSB0aGlzLl9jaGF0V2lkZ2V0U2VydmljZS5nZXRXaWRnZXRCeVNlc3Npb25SZXNvdXJjZShjaGF0U2Vzc2lvblJlc291cmNlKVxuXHRcdFx0Pz8gdGhpcy5fY2hhdFdpZGdldFNlcnZpY2UubGFzdEZvY3VzZWRXaWRnZXQ7XG5cdFx0cmV0dXJuICEhd2lkZ2V0ICYmIGlzQXV0b3BpbG90TGV2ZWwod2lkZ2V0LmlucHV0LmN1cnJlbnRNb2RlSW5mby5wZXJtaXNzaW9uTGV2ZWwpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFRydWUgaWYgdGhlIHNlc3Npb24gaXMgYXQgdGhlIEF1dG9waWxvdCBsZXZlbCAobm90IHBsYWluIEF1dG8tQXBwcm92ZSksIHZpYSBlaXRoZXIgdGhlIGxhc3Rcblx0ICogcmVxdWVzdCdzIHN0YW1wZWQgbGV2ZWwgb3IgdGhlIGxpdmUgcGlja2VyIGxldmVsLlxuXHQgKi9cblx0cHJpdmF0ZSBfaXNTZXNzaW9uSW5BdXRvcGlsb3RMZXZlbChjaGF0U2Vzc2lvblJlc291cmNlOiBVUkkgfCB1bmRlZmluZWQpOiBib29sZWFuIHtcblx0XHRpZiAoIWNoYXRTZXNzaW9uUmVzb3VyY2UpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9jaGF0U2VydmljZS5nZXRTZXNzaW9uKGNoYXRTZXNzaW9uUmVzb3VyY2UpO1xuXHRcdGNvbnN0IHJlcXVlc3QgPSBtb2RlbD8uZ2V0UmVxdWVzdHMoKS5hdCgtMSk7XG5cdFx0cmV0dXJuIGlzQXV0b3BpbG90TGV2ZWwocmVxdWVzdD8ubW9kZUluZm8/LnBlcm1pc3Npb25MZXZlbCkgfHwgdGhpcy5faXNTZXNzaW9uTGl2ZUF1dG9waWxvdExldmVsKGNoYXRTZXNzaW9uUmVzb3VyY2UpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRFbGlnaWJsZUZvckF1dG9BcHByb3ZhbFNwZWNpYWxDYXNlKHRvb2xEYXRhOiBJVG9vbERhdGEpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGlmICh0b29sRGF0YS5pZCA9PT0gJ3ZzY29kZV9mZXRjaFdlYlBhZ2VfaW50ZXJuYWwnKSB7XG5cdFx0XHRyZXR1cm4gJ2ZldGNoJztcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgaXNUb29sRWxpZ2libGVGb3JBdXRvQXBwcm92YWwodG9vbERhdGE6IElUb29sRGF0YSk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IGZ1bGxSZWZlcmVuY2VOYW1lID0gdGhpcy5nZXRFbGlnaWJsZUZvckF1dG9BcHByb3ZhbFNwZWNpYWxDYXNlKHRvb2xEYXRhKSA/PyBnZXRUb29sRnVsbFJlZmVyZW5jZU5hbWUodG9vbERhdGEpO1xuXHRcdGlmICh0b29sRGF0YS5pZCA9PT0gJ2NvcGlsb3RfZmV0Y2hXZWJQYWdlJykge1xuXHRcdFx0Ly8gU3BlY2lhbCBjYXNlLCB0aGlzIGZldGNoIHdpbGwgY2FsbCBhbiBpbnRlcm5hbCB0b29sICd2c2NvZGVfZmV0Y2hXZWJQYWdlX2ludGVybmFsJ1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdGlmICh0b29sSWRzVGhhdENhbm5vdEJlQXV0b0FwcHJvdmVkLmhhcyh0b29sRGF0YS5pZCkpIHtcblx0XHRcdC8vIFNwZWNpYWwgY2FzZSwgdGhpcyB0b29sIHdpbGwgYWx3YXlzIHJlcXVpcmUgdXNlciBjb25maXJtYXRpb24gYXMgdGhlcmUgYXJlIG11bHRpcGxlIG9wdGlvbnMsXG5cdFx0XHQvLyBUaGVzZSBhcmVuJ3QgTE0gZ2VuZXJhdGVkIGluc3RlYWQgYXJlIGdlbmVyYXRlZCBieSBleHRlbnNpb24gYmVmb3JlIGFnZW50aWMgbG9vcCBzdGFydHMuXG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGNvbnN0IGVsaWdpYmlsaXR5Q29uZmlnID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8UmVjb3JkPHN0cmluZywgYm9vbGVhbj4+KENoYXRDb25maWd1cmF0aW9uLkVsaWdpYmxlRm9yQXV0b0FwcHJvdmFsKTtcblx0XHRpZiAoZWxpZ2liaWxpdHlDb25maWcgJiYgdHlwZW9mIGVsaWdpYmlsaXR5Q29uZmlnID09PSAnb2JqZWN0JyAmJiBmdWxsUmVmZXJlbmNlTmFtZSkge1xuXHRcdFx0Ly8gRGlyZWN0IG1hdGNoXG5cdFx0XHRpZiAoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKGVsaWdpYmlsaXR5Q29uZmlnLCBmdWxsUmVmZXJlbmNlTmFtZSkpIHtcblx0XHRcdFx0cmV0dXJuIGVsaWdpYmlsaXR5Q29uZmlnW2Z1bGxSZWZlcmVuY2VOYW1lXTtcblx0XHRcdH1cblx0XHRcdC8vIEJhY2sgY29tcGF0IHdpdGggbGVnYWN5IG5hbWVzXG5cdFx0XHRpZiAodG9vbERhdGEubGVnYWN5VG9vbFJlZmVyZW5jZUZ1bGxOYW1lcykge1xuXHRcdFx0XHRmb3IgKGNvbnN0IGxlZ2FjeU5hbWUgb2YgdG9vbERhdGEubGVnYWN5VG9vbFJlZmVyZW5jZUZ1bGxOYW1lcykge1xuXHRcdFx0XHRcdC8vIENoZWNrIGlmIHRoZSBmdWxsIGxlZ2FjeSBuYW1lIGlzIGluIHRoZSBjb25maWdcblx0XHRcdFx0XHRpZiAoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKGVsaWdpYmlsaXR5Q29uZmlnLCBsZWdhY3lOYW1lKSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIGVsaWdpYmlsaXR5Q29uZmlnW2xlZ2FjeU5hbWVdO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHQvLyBTb21lIHRvb2xzIG1heSBiZSBib3RoIHJlbmFtZWQgYW5kIG5hbWVzcGFjZWQgZnJvbSBhIHRvb2xzZXQsIGVnOiB4eHgveXl5IC0+IHl5eVxuXHRcdFx0XHRcdGlmIChsZWdhY3lOYW1lLmluY2x1ZGVzKCcvJykpIHtcblx0XHRcdFx0XHRcdGNvbnN0IHRyaW1tZWRMZWdhY3lOYW1lID0gbGVnYWN5TmFtZS5zcGxpdCgnLycpLnBvcCgpO1xuXHRcdFx0XHRcdFx0aWYgKHRyaW1tZWRMZWdhY3lOYW1lICYmIE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChlbGlnaWJpbGl0eUNvbmZpZywgdHJpbW1lZExlZ2FjeU5hbWUpKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBlbGlnaWJpbGl0eUNvbmZpZ1t0cmltbWVkTGVnYWN5TmFtZV07XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBzaG91bGRBdXRvQ29uZmlybSh0b29sSWQ6IHN0cmluZywgcnVuc0luV29ya3NwYWNlOiBib29sZWFuIHwgdW5kZWZpbmVkLCBzb3VyY2U6IFRvb2xEYXRhU291cmNlLCBwYXJhbWV0ZXJzOiB1bmtub3duLCBjaGF0U2Vzc2lvblJlc291cmNlOiBVUkkgfCB1bmRlZmluZWQsIGNoYXRSZXF1ZXN0SWQ6IHN0cmluZyB8IHVuZGVmaW5lZCwgY29tYmluYXRpb24/OiB7IGxhYmVsOiBzdHJpbmc7IGtleTogc3RyaW5nIH0sIHdvcmtpbmdEaXJlY3Rvcnk/OiBVUkkpOiBQcm9taXNlPENvbmZpcm1lZFJlYXNvbiB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHRvb2wgPSB0aGlzLl90b29scy5nZXQodG9vbElkKTtcblx0XHRpZiAoIXRvb2wpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Ly8gQnlwYXNzIGNvbmZpcm1hdGlvbiB1bmRlciBBdXRvLUFwcHJvdmUgLyBBdXRvcGlsb3QsIHVubGVzcyBlbnRlcnByaXNlXG5cdFx0Ly8gcG9saWN5IGRpc2FibGVzIGdsb2JhbCBhdXRvLWFwcHJvdmUuXG5cdFx0aWYgKGNoYXRTZXNzaW9uUmVzb3VyY2UgJiYgIXRoaXMuX2lzQXV0b0FwcHJvdmVQb2xpY3lSZXN0cmljdGVkKCkgJiYgdGhpcy5faXNTZXNzaW9uSW5BdXRvQXBwcm92ZUxldmVsKGNoYXRTZXNzaW9uUmVzb3VyY2UpKSB7XG5cdFx0XHQvLyBDTEkgc2Vzc2lvbnMgc3RpbGwgbmVlZCB0aGVpciBtdWx0aS1vcHRpb24gZGlhbG9ncyAoZS5nLiB1bmNvbW1pdHRlZCBjaGFuZ2VzKS5cblx0XHRcdGlmICghKHRvb2xJZHNUaGF0Q2Fubm90QmVBdXRvQXBwcm92ZWQuaGFzKHRvb2wuZGF0YS5pZCkgJiYgZ2V0Q2hhdFNlc3Npb25UeXBlKGNoYXRTZXNzaW9uUmVzb3VyY2UpICE9PSBsb2NhbENoYXRTZXNzaW9uVHlwZSkpIHtcblx0XHRcdFx0cmV0dXJuIHsgdHlwZTogVG9vbENvbmZpcm1LaW5kLkNvbmZpcm1hdGlvbk5vdE5lZWRlZCwgcmVhc29uOiBhdXRvQXBwcm92ZUFsbFJlYXNvbiB9O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICghdGhpcy5pc1Rvb2xFbGlnaWJsZUZvckF1dG9BcHByb3ZhbCh0b29sLmRhdGEpKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlYXNvbiA9IHRoaXMuX2NvbmZpcm1hdGlvblNlcnZpY2UuZ2V0UHJlQ29uZmlybUFjdGlvbih7IHRvb2xJZCwgc291cmNlLCBwYXJhbWV0ZXJzLCBjaGF0U2Vzc2lvblJlc291cmNlLCB3b3JraW5nRGlyZWN0b3J5LCBjb21iaW5hdGlvbiB9KTtcblx0XHRpZiAocmVhc29uKSB7XG5cdFx0XHRyZXR1cm4gcmVhc29uO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNvbmZpZyA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmluc3BlY3Q8Ym9vbGVhbiB8IFJlY29yZDxzdHJpbmcsIGJvb2xlYW4+PihDaGF0Q29uZmlndXJhdGlvbi5HbG9iYWxBdXRvQXBwcm92ZSk7XG5cblx0XHQvLyBJZiB3ZSBrbm93IHRoZSB0b29sIHJ1bnMgYXQgYSBnbG9iYWwgbGV2ZWwsIG9ubHkgY29uc2lkZXIgdGhlIGdsb2JhbCBjb25maWcuXG5cdFx0Ly8gSWYgd2Uga25vdyB0aGUgdG9vbCBydW5zIGF0IGEgd29ya3NwYWNlIGxldmVsLCB1c2UgdGhvc2Ugc3BlY2lmaWMgc2V0dGluZ3Mgd2hlbiBhcHByb3ByaWF0ZS5cblx0XHRsZXQgdmFsdWUgPSBjb25maWcudmFsdWUgPz8gY29uZmlnLmRlZmF1bHRWYWx1ZTtcblx0XHRpZiAodHlwZW9mIHJ1bnNJbldvcmtzcGFjZSA9PT0gJ2Jvb2xlYW4nKSB7XG5cdFx0XHR2YWx1ZSA9IGNvbmZpZy51c2VyTG9jYWxWYWx1ZSA/PyBjb25maWcuYXBwbGljYXRpb25WYWx1ZTtcblx0XHRcdGlmIChydW5zSW5Xb3Jrc3BhY2UpIHtcblx0XHRcdFx0dmFsdWUgPSBjb25maWcud29ya3NwYWNlVmFsdWUgPz8gY29uZmlnLndvcmtzcGFjZUZvbGRlclZhbHVlID8/IGNvbmZpZy51c2VyUmVtb3RlVmFsdWUgPz8gdmFsdWU7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgYXV0b0NvbmZpcm0gPSB2YWx1ZSA9PT0gdHJ1ZSB8fCAodHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JyAmJiB2YWx1ZS5oYXNPd25Qcm9wZXJ0eSh0b29sSWQpICYmIHZhbHVlW3Rvb2xJZF0gPT09IHRydWUpO1xuXHRcdGlmIChhdXRvQ29uZmlybSkge1xuXHRcdFx0aWYgKGF3YWl0IHRoaXMuX2NoZWNrR2xvYmFsQXV0b0FwcHJvdmUoKSkge1xuXHRcdFx0XHRyZXR1cm4geyB0eXBlOiBUb29sQ29uZmlybUtpbmQuU2V0dGluZywgaWQ6IENoYXRDb25maWd1cmF0aW9uLkdsb2JhbEF1dG9BcHByb3ZlIH07XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgc2hvdWxkQXV0b0NvbmZpcm1Qb3N0RXhlY3V0aW9uKHRvb2xJZDogc3RyaW5nLCBydW5zSW5Xb3Jrc3BhY2U6IGJvb2xlYW4gfCB1bmRlZmluZWQsIHNvdXJjZTogVG9vbERhdGFTb3VyY2UsIHBhcmFtZXRlcnM6IHVua25vd24sIGNoYXRTZXNzaW9uUmVzb3VyY2U6IFVSSSB8IHVuZGVmaW5lZCwgY2hhdFJlcXVlc3RJZDogc3RyaW5nIHwgdW5kZWZpbmVkLCB3b3JraW5nRGlyZWN0b3J5PzogVVJJKTogUHJvbWlzZTxDb25maXJtZWRSZWFzb24gfCB1bmRlZmluZWQ+IHtcblx0XHQvLyBCeXBhc3MgcG9zdC1leGVjdXRpb24gY29uZmlybWF0aW9uIHVuZGVyIEF1dG8tQXBwcm92ZSAvIEF1dG9waWxvdCxcblx0XHQvLyB1bmxlc3MgZW50ZXJwcmlzZSBwb2xpY3kgZGlzYWJsZXMgZ2xvYmFsIGF1dG8tYXBwcm92ZS5cblx0XHRjb25zdCBzZXNzaW9uQXV0b0FwcHJvdmUgPSBjaGF0U2Vzc2lvblJlc291cmNlICYmICF0aGlzLl9pc0F1dG9BcHByb3ZlUG9saWN5UmVzdHJpY3RlZCgpICYmIHRoaXMuX2lzU2Vzc2lvbkluQXV0b0FwcHJvdmVMZXZlbChjaGF0U2Vzc2lvblJlc291cmNlKTtcblx0XHRpZiAoc2Vzc2lvbkF1dG9BcHByb3ZlKSB7XG5cdFx0XHRpZiAoISh0b29sSWRzVGhhdENhbm5vdEJlQXV0b0FwcHJvdmVkLmhhcyh0b29sSWQpICYmIGdldENoYXRTZXNzaW9uVHlwZShjaGF0U2Vzc2lvblJlc291cmNlISkgIT09IGxvY2FsQ2hhdFNlc3Npb25UeXBlKSkge1xuXHRcdFx0XHRyZXR1cm4geyB0eXBlOiBUb29sQ29uZmlybUtpbmQuQ29uZmlybWF0aW9uTm90TmVlZGVkLCByZWFzb246IGF1dG9BcHByb3ZlQWxsUmVhc29uIH07XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gRG9uJ3Qgc2hvdyB0aGUgWU9MTyBvcHQtaW4gZGlhbG9nIHVuZGVyIGF1dG9waWxvdDogdGhpcyBydW5zIGFmdGVyIHRoZVxuXHRcdC8vIHRvb2wgcmVzdWx0IGlzIGFscmVhZHkgYmFjayBpbiB0aGUgYWdlbnQgbG9vcCwgc28gaXQgY2FuJ3QgYmxvY2sgYW55dGhpbmcuXG5cdFx0aWYgKHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KENoYXRDb25maWd1cmF0aW9uLkdsb2JhbEF1dG9BcHByb3ZlKSAmJiAhc2Vzc2lvbkF1dG9BcHByb3ZlICYmIGF3YWl0IHRoaXMuX2NoZWNrR2xvYmFsQXV0b0FwcHJvdmUoKSkge1xuXHRcdFx0cmV0dXJuIHsgdHlwZTogVG9vbENvbmZpcm1LaW5kLlNldHRpbmcsIGlkOiBDaGF0Q29uZmlndXJhdGlvbi5HbG9iYWxBdXRvQXBwcm92ZSB9O1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLl9jb25maXJtYXRpb25TZXJ2aWNlLmdldFBvc3RDb25maXJtQWN0aW9uKHsgdG9vbElkLCBzb3VyY2UsIHBhcmFtZXRlcnMsIGNoYXRTZXNzaW9uUmVzb3VyY2UsIHdvcmtpbmdEaXJlY3RvcnkgfSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9jaGVja0dsb2JhbEF1dG9BcHByb3ZlKCk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGNvbnN0IG9wdGVkSW4gPSB0aGlzLl9zdG9yYWdlU2VydmljZS5nZXRCb29sZWFuKEF1dG9BcHByb3ZlU3RvcmFnZUtleXMuR2xvYmFsQXV0b0FwcHJvdmVPcHRJbiwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCBmYWxzZSk7XG5cdFx0aWYgKG9wdGVkSW4pIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9jb250ZXh0S2V5U2VydmljZS5nZXRDb250ZXh0S2V5VmFsdWUoU2tpcEF1dG9BcHByb3ZlQ29uZmlybWF0aW9uS2V5KSA9PT0gdHJ1ZSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX3BlbmRpbmdHbG9iYWxBdXRvQXBwcm92ZUNoZWNrKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fcGVuZGluZ0dsb2JhbEF1dG9BcHByb3ZlQ2hlY2s7XG5cdFx0fVxuXG5cdFx0dGhpcy5fcGVuZGluZ0dsb2JhbEF1dG9BcHByb3ZlQ2hlY2sgPSB0aGlzLl9kb0NoZWNrR2xvYmFsQXV0b0FwcHJvdmUoKTtcblx0XHR0cnkge1xuXHRcdFx0cmV0dXJuIGF3YWl0IHRoaXMuX3BlbmRpbmdHbG9iYWxBdXRvQXBwcm92ZUNoZWNrO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHR0aGlzLl9wZW5kaW5nR2xvYmFsQXV0b0FwcHJvdmVDaGVjayA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9kb0NoZWNrR2xvYmFsQXV0b0FwcHJvdmUoKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0dHJ5IHtcblx0XHRcdC8vIERpc21pc3MgdGhlIGRpYWxvZyBhdXRvbWF0aWNhbGx5IGlmIGFub3RoZXIgd2luZG93IHN0b3JlcyB0aGVcblx0XHRcdC8vIG9wdC1pbiBmbGFnLCBhdm9pZGluZyBkdXBsaWNhdGUgYXBwcm92YWwgcHJvbXB0cy5cblx0XHRcdGNvbnN0IGN0cyA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdFx0c3RvcmUuYWRkKGN0cyk7XG5cdFx0XHRzdG9yZS5hZGQodGhpcy5fc3RvcmFnZVNlcnZpY2Uub25EaWRDaGFuZ2VWYWx1ZShTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04sIEF1dG9BcHByb3ZlU3RvcmFnZUtleXMuR2xvYmFsQXV0b0FwcHJvdmVPcHRJbiwgc3RvcmUpKCgpID0+IHtcblx0XHRcdFx0aWYgKHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLmdldEJvb2xlYW4oQXV0b0FwcHJvdmVTdG9yYWdlS2V5cy5HbG9iYWxBdXRvQXBwcm92ZU9wdEluLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04sIGZhbHNlKSkge1xuXHRcdFx0XHRcdGN0cy5jYW5jZWwoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXG5cdFx0XHRjb25zdCBwcm9tcHRSZXN1bHQgPSBhd2FpdCB0aGlzLl9kaWFsb2dTZXJ2aWNlLnByb21wdCh7XG5cdFx0XHRcdHR5cGU6IFNldmVyaXR5Lldhcm5pbmcsXG5cdFx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKCdhdXRvQXBwcm92ZTIudGl0bGUnLCAnRW5hYmxlIGdsb2JhbCBhdXRvIGFwcHJvdmU/JyksXG5cdFx0XHRcdGJ1dHRvbnM6IFtcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2F1dG9BcHByb3ZlMi5idXR0b24uZW5hYmxlJywgJ0VuYWJsZScpLFxuXHRcdFx0XHRcdFx0cnVuOiAoKSA9PiB0cnVlXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2F1dG9BcHByb3ZlMi5idXR0b24uZGlzYWJsZScsICdEaXNhYmxlJyksXG5cdFx0XHRcdFx0XHRydW46ICgpID0+IGZhbHNlXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XSxcblx0XHRcdFx0Y3VzdG9tOiB7XG5cdFx0XHRcdFx0aWNvbjogQ29kaWNvbi53YXJuaW5nLFxuXHRcdFx0XHRcdG1hcmtkb3duRGV0YWlsczogW3tcblx0XHRcdFx0XHRcdG1hcmtkb3duOiBuZXcgTWFya2Rvd25TdHJpbmcoZ2xvYmFsQXV0b0FwcHJvdmVEZXNjcmlwdGlvbi52YWx1ZSwgeyBpc1RydXN0ZWQ6IHsgZW5hYmxlZENvbW1hbmRzOiBbJ3dvcmtiZW5jaC5hY3Rpb24ub3BlblNldHRpbmdzJ10gfSB9KSxcblx0XHRcdFx0XHR9XSxcblx0XHRcdFx0fSxcblx0XHRcdFx0dG9rZW46IGN0cy50b2tlbixcblx0XHRcdH0pO1xuXG5cdFx0XHQvLyBJZiBjYW5jZWxsZWQgYnkgY3Jvc3Mtd2luZG93IGFwcHJvdmFsLCB0cmVhdCBhcyBhcHByb3ZlZFxuXHRcdFx0aWYgKGN0cy50b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHByb21wdFJlc3VsdC5yZXN1bHQgIT09IHRydWUpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlVmFsdWUoQ2hhdENvbmZpZ3VyYXRpb24uR2xvYmFsQXV0b0FwcHJvdmUsIGZhbHNlKTtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9zdG9yYWdlU2VydmljZS5zdG9yZShBdXRvQXBwcm92ZVN0b3JhZ2VLZXlzLkdsb2JhbEF1dG9BcHByb3ZlT3B0SW4sIHRydWUsIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgU3RvcmFnZVRhcmdldC5VU0VSKTtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRzdG9yZS5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBjbGVhbnVwQ2FsbERpc3Bvc2FibGVzKHJlcXVlc3RJZDogc3RyaW5nIHwgdW5kZWZpbmVkLCBzdG9yZTogRGlzcG9zYWJsZVN0b3JlKTogdm9pZCB7XG5cdFx0aWYgKHJlcXVlc3RJZCkge1xuXHRcdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSB0aGlzLl9jYWxsc0J5UmVxdWVzdElkLmdldChyZXF1ZXN0SWQpO1xuXHRcdFx0aWYgKGRpc3Bvc2FibGVzKSB7XG5cdFx0XHRcdGNvbnN0IGluZGV4ID0gZGlzcG9zYWJsZXMuZmluZEluZGV4KGQgPT4gZC5zdG9yZSA9PT0gc3RvcmUpO1xuXHRcdFx0XHRpZiAoaW5kZXggPiAtMSkge1xuXHRcdFx0XHRcdGRpc3Bvc2FibGVzLnNwbGljZShpbmRleCwgMSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGRpc3Bvc2FibGVzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRcdHRoaXMuX2NhbGxzQnlSZXF1ZXN0SWQuZGVsZXRlKHJlcXVlc3RJZCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRzdG9yZS5kaXNwb3NlKCk7XG5cdH1cblxuXHRjYW5jZWxUb29sQ2FsbHNGb3JSZXF1ZXN0KHJlcXVlc3RJZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgY2FsbHMgPSB0aGlzLl9jYWxsc0J5UmVxdWVzdElkLmdldChyZXF1ZXN0SWQpO1xuXHRcdGlmIChjYWxscykge1xuXHRcdFx0Y2FsbHMuZm9yRWFjaChjYWxsID0+IGNhbGwuc3RvcmUuZGlzcG9zZSgpKTtcblx0XHRcdHRoaXMuX2NhbGxzQnlSZXF1ZXN0SWQuZGVsZXRlKHJlcXVlc3RJZCk7XG5cdFx0fVxuXG5cdFx0Ly8gQ2xlYW4gdXAgYW55IHBlbmRpbmcgdG9vbCBjYWxscyB0aGF0IGJlbG9uZyB0byB0aGlzIHJlcXVlc3Rcblx0XHRmb3IgKGNvbnN0IFt0b29sQ2FsbElkLCBpbnZvY2F0aW9uXSBvZiB0aGlzLl9wZW5kaW5nVG9vbENhbGxzKSB7XG5cdFx0XHRpZiAoaW52b2NhdGlvbi5jaGF0UmVxdWVzdElkID09PSByZXF1ZXN0SWQpIHtcblx0XHRcdFx0dGhpcy5fcGVuZGluZ1Rvb2xDYWxscy5kZWxldGUodG9vbENhbGxJZCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgZ2l0aHViTUNQU2VydmVyQWxpYXNlcyA9IFsnZ2l0aHViL2dpdGh1Yi1tY3Atc2VydmVyJywgJ2lvLmdpdGh1Yi5naXRodWIvZ2l0aHViLW1jcC1zZXJ2ZXInLCAnZ2l0aHViLW1jcC1zZXJ2ZXInXTtcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgcGxheXdyaWdodE1DUFNlcnZlckFsaWFzZXMgPSBbJ21pY3Jvc29mdC9wbGF5d3JpZ2h0LW1jcCcsICdjb20ubWljcm9zb2Z0L3BsYXl3cmlnaHQtbWNwJ107XG5cblx0cHJpdmF0ZSAqZ2V0VG9vbFNldEFsaWFzZXModG9vbFNldDogVG9vbFNldCwgZnVsbFJlZmVyZW5jZU5hbWU6IHN0cmluZyk6IEl0ZXJhYmxlPHN0cmluZz4ge1xuXHRcdGlmIChmdWxsUmVmZXJlbmNlTmFtZSAhPT0gdG9vbFNldC5yZWZlcmVuY2VOYW1lKSB7XG5cdFx0XHR5aWVsZCB0b29sU2V0LnJlZmVyZW5jZU5hbWU7IC8vIHRvb2wgc2V0IG5hbWUgd2l0aG91dCAnLyonXG5cdFx0fVxuXHRcdGlmICh0b29sU2V0LmxlZ2FjeUZ1bGxOYW1lcykge1xuXHRcdFx0eWllbGQqIHRvb2xTZXQubGVnYWN5RnVsbE5hbWVzO1xuXHRcdH1cblx0XHRzd2l0Y2ggKHRvb2xTZXQucmVmZXJlbmNlTmFtZSkge1xuXHRcdFx0Y2FzZSAnZ2l0aHViJzpcblx0XHRcdFx0Zm9yIChjb25zdCBhbGlhcyBvZiBMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLmdpdGh1Yk1DUFNlcnZlckFsaWFzZXMpIHtcblx0XHRcdFx0XHR5aWVsZCBhbGlhcyArICcvKic7XG5cdFx0XHRcdH1cblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlICdwbGF5d3JpZ2h0Jzpcblx0XHRcdFx0Zm9yIChjb25zdCBhbGlhcyBvZiBMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLnBsYXl3cmlnaHRNQ1BTZXJ2ZXJBbGlhc2VzKSB7XG5cdFx0XHRcdFx0eWllbGQgYWxpYXMgKyAnLyonO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBTcGVjZWRUb29sQWxpYXNlcy5leGVjdXRlOiAvLyAnZXhlY3V0ZSdcblx0XHRcdFx0eWllbGQgJ3NoZWxsJzsgLy8gbGVnYWN5IGFsaWFzXG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBTcGVjZWRUb29sQWxpYXNlcy5hZ2VudDogLy8gJ2FnZW50J1xuXHRcdFx0XHR5aWVsZCBWU0NvZGVUb29sUmVmZXJlbmNlLnJ1blN1YmFnZW50OyAvLyBwcmVmZXIgdGhlIHRvb2wgc2V0IG92ZXIgdGggb2xkIHRvb2wgbmFtZVxuXHRcdFx0XHR5aWVsZCAnY3VzdG9tLWFnZW50JzsgLy8gbGVnYWN5IGFsaWFzXG5cdFx0XHRcdGJyZWFrO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgKiBnZXRUb29sQWxpYXNlcyh0b29sU2V0OiBJVG9vbERhdGEsIGZ1bGxSZWZlcmVuY2VOYW1lOiBzdHJpbmcpOiBJdGVyYWJsZTxzdHJpbmc+IHtcblx0XHRjb25zdCByZWZlcmVuY2VOYW1lID0gdG9vbFNldC50b29sUmVmZXJlbmNlTmFtZSA/PyB0b29sU2V0LmRpc3BsYXlOYW1lO1xuXHRcdGlmIChmdWxsUmVmZXJlbmNlTmFtZSAhPT0gcmVmZXJlbmNlTmFtZSAmJiByZWZlcmVuY2VOYW1lICE9PSBWU0NvZGVUb29sUmVmZXJlbmNlLnJ1blN1YmFnZW50KSB7XG5cdFx0XHR5aWVsZCByZWZlcmVuY2VOYW1lOyAvLyBzaW1wbGUgbmFtZSwgd2l0aG91dCB0b29sc2V0IG5hbWVcblx0XHR9XG5cdFx0aWYgKHRvb2xTZXQubGVnYWN5VG9vbFJlZmVyZW5jZUZ1bGxOYW1lcykge1xuXHRcdFx0Zm9yIChjb25zdCBsZWdhY3lOYW1lIG9mIHRvb2xTZXQubGVnYWN5VG9vbFJlZmVyZW5jZUZ1bGxOYW1lcykge1xuXHRcdFx0XHR5aWVsZCBsZWdhY3lOYW1lO1xuXHRcdFx0XHRjb25zdCBsYXN0U2xhc2hJbmRleCA9IGxlZ2FjeU5hbWUubGFzdEluZGV4T2YoJy8nKTtcblx0XHRcdFx0aWYgKGxhc3RTbGFzaEluZGV4ICE9PSAtMSkge1xuXHRcdFx0XHRcdHlpZWxkIGxlZ2FjeU5hbWUuc3Vic3RyaW5nKGxhc3RTbGFzaEluZGV4ICsgMSk7IC8vIGl0IHdhcyBhbHNvIGtub3duIHVuZGVyIHRoZSBzaW1wbGUgbmFtZVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGNvbnN0IHNsYXNoSW5kZXggPSBmdWxsUmVmZXJlbmNlTmFtZS5sYXN0SW5kZXhPZignLycpO1xuXHRcdGlmIChzbGFzaEluZGV4ICE9PSAtMSkge1xuXHRcdFx0c3dpdGNoIChmdWxsUmVmZXJlbmNlTmFtZS5zdWJzdHJpbmcoMCwgc2xhc2hJbmRleCkpIHtcblx0XHRcdFx0Y2FzZSAnZ2l0aHViJzpcblx0XHRcdFx0XHRmb3IgKGNvbnN0IGFsaWFzIG9mIExhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UuZ2l0aHViTUNQU2VydmVyQWxpYXNlcykge1xuXHRcdFx0XHRcdFx0eWllbGQgYWxpYXMgKyBmdWxsUmVmZXJlbmNlTmFtZS5zdWJzdHJpbmcoc2xhc2hJbmRleCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlICdwbGF5d3JpZ2h0Jzpcblx0XHRcdFx0XHRmb3IgKGNvbnN0IGFsaWFzIG9mIExhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UucGxheXdyaWdodE1DUFNlcnZlckFsaWFzZXMpIHtcblx0XHRcdFx0XHRcdHlpZWxkIGFsaWFzICsgZnVsbFJlZmVyZW5jZU5hbWUuc3Vic3RyaW5nKHNsYXNoSW5kZXgpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogQ3JlYXRlIGEgbWFwIHRoYXQgY29udGFpbnMgYWxsIHRvb2xzIGFuZCB0b29sc2V0cyB3aXRoIHRoZWlyIGVuYWJsZW1lbnQgc3RhdGUuXG5cdCAqIEBwYXJhbSBmdWxsUmVmZXJlbmNlTmFtZXMgQSBsaXN0IG9mIHRvb2wgb3IgdG9vbHNldCBieSB0aGVpciBmdWxsIHJlZmVyZW5jZSBuYW1lcyB0aGF0IGFyZSBlbmFibGVkLlxuXHQgKiBAcmV0dXJucyBBIG1hcCBvZiB0b29sIG9yIHRvb2xzZXQgaW5zdGFuY2VzIHRvIHRoZWlyIGVuYWJsZW1lbnQgc3RhdGUuXG5cdCAqL1xuXHR0b1Rvb2xBbmRUb29sU2V0RW5hYmxlbWVudE1hcChmdWxsUmVmZXJlbmNlTmFtZXM6IHJlYWRvbmx5IHN0cmluZ1tdLCBtb2RlbDogSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGEgfCB1bmRlZmluZWQpOiBUb29sQW5kVG9vbFNldEVuYWJsZW1lbnRNYXAge1xuXHRcdGNvbnN0IHRvb2xPclRvb2xTZXROYW1lcyA9IG5ldyBTZXQoZnVsbFJlZmVyZW5jZU5hbWVzKTtcblx0XHRjb25zdCByZXN1bHQgPSBuZXcgTWFwPElUb29sU2V0IHwgSVRvb2xEYXRhLCBib29sZWFuPigpO1xuXHRcdGZvciAoY29uc3QgW3Rvb2wsIGZ1bGxSZWZlcmVuY2VOYW1lXSBvZiB0aGlzLnRvb2xzV2l0aEZ1bGxSZWZlcmVuY2VOYW1lLmdldCgpKSB7XG5cdFx0XHRpZiAoaXNUb29sU2V0KHRvb2wpKSB7XG5cdFx0XHRcdGNvbnN0IGVuYWJsZWQgPSB0b29sT3JUb29sU2V0TmFtZXMuaGFzKGZ1bGxSZWZlcmVuY2VOYW1lKSB8fCBJdGVyYWJsZS5zb21lKHRoaXMuZ2V0VG9vbFNldEFsaWFzZXModG9vbCwgZnVsbFJlZmVyZW5jZU5hbWUpLCBuYW1lID0+IHRvb2xPclRvb2xTZXROYW1lcy5oYXMobmFtZSkpO1xuXHRcdFx0XHRjb25zdCBzY29wZWQgPSBtb2RlbCA/IG5ldyBUb29sU2V0Rm9yTW9kZWwodG9vbCwgbW9kZWwpIDogdG9vbDtcblx0XHRcdFx0cmVzdWx0LnNldChzY29wZWQsIGVuYWJsZWQpO1xuXHRcdFx0XHRpZiAoZW5hYmxlZCkge1xuXHRcdFx0XHRcdGZvciAoY29uc3QgbWVtYmVyVG9vbCBvZiBzY29wZWQuZ2V0VG9vbHMoKSkge1xuXHRcdFx0XHRcdFx0cmVzdWx0LnNldChtZW1iZXJUb29sLCB0cnVlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGlmICghdGhpcy5pc1Rvb2xFbmFibGVkRm9yTW9kZWwodG9vbCwgbW9kZWwpKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoIXJlc3VsdC5oYXModG9vbCkpIHsgLy8gYWxyZWFkeSBzZXQgdmlhIGFuIGVuYWJsZWQgdG9vbHNldFxuXHRcdFx0XHRcdGNvbnN0IGVuYWJsZWQgPSB0b29sT3JUb29sU2V0TmFtZXMuaGFzKGZ1bGxSZWZlcmVuY2VOYW1lKVxuXHRcdFx0XHRcdFx0fHwgSXRlcmFibGUuc29tZSh0aGlzLmdldFRvb2xBbGlhc2VzKHRvb2wsIGZ1bGxSZWZlcmVuY2VOYW1lKSwgbmFtZSA9PiB0b29sT3JUb29sU2V0TmFtZXMuaGFzKG5hbWUpKVxuXHRcdFx0XHRcdFx0fHwgISF0b29sLmxlZ2FjeVRvb2xSZWZlcmVuY2VGdWxsTmFtZXM/LnNvbWUodG9vbEZ1bGxOYW1lID0+IHtcblx0XHRcdFx0XHRcdFx0Ly8gZW5hYmxlIHRvb2wgaWYganVzdCB0aGUgbGVnYWN5IHRvb2wgc2V0IG5hbWUgaXMgcHJlc2VudFxuXHRcdFx0XHRcdFx0XHRjb25zdCBpbmRleCA9IHRvb2xGdWxsTmFtZS5sYXN0SW5kZXhPZignLycpO1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gaW5kZXggIT09IC0xICYmIHRvb2xPclRvb2xTZXROYW1lcy5oYXModG9vbEZ1bGxOYW1lLnN1YnN0cmluZygwLCBpbmRleCkpO1xuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0cmVzdWx0LnNldCh0b29sLCBlbmFibGVkKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIGFsc28gYWRkIGFsbCB1c2VyIHRvb2wgc2V0cyAobm90IHBhcnQgb2YgdGhlIHByb21wdCByZWZlcmVuY2FibGUgdG9vbHMpXG5cdFx0Zm9yIChjb25zdCB0b29sU2V0IG9mIHRoaXMuX3Rvb2xTZXRzKSB7XG5cdFx0XHRpZiAodG9vbFNldC5zb3VyY2UudHlwZSA9PT0gJ3VzZXInKSB7XG5cdFx0XHRcdGNvbnN0IGVuYWJsZWQgPSBJdGVyYWJsZS5ldmVyeSh0b29sU2V0LmdldFRvb2xzKCksIHQgPT4gcmVzdWx0LmdldCh0KSA9PT0gdHJ1ZSk7XG5cdFx0XHRcdHJlc3VsdC5zZXQodG9vbFNldCwgZW5hYmxlZCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBUb29sQW5kVG9vbFNldEVuYWJsZW1lbnRNYXAuZnJvbU1hcChyZXN1bHQpO1xuXHR9XG5cblx0dG9GdWxsUmVmZXJlbmNlTmFtZXMobWFwOiBUb29sQW5kVG9vbFNldEVuYWJsZW1lbnRNYXApOiBzdHJpbmdbXSB7XG5cdFx0Y29uc3QgcmVzdWx0OiBzdHJpbmdbXSA9IFtdO1xuXHRcdGNvbnN0IHRvb2xzQ292ZXJlZEJ5RW5hYmxlZFRvb2xTZXQgPSBuZXcgU2V0PElUb29sRGF0YT4oKTtcblxuXHRcdC8vIGNvbXBhcmUgYnkgaWQgYXMgdG9vbHNldCBpbnN0YW5jZXMgbWF5IGJlIGRpZmZlcmVudCAoZS5nLiBUb29sU2V0Rm9yTW9kZWwpXG5cdFx0Y29uc3QgZW5hYmxlZFRvb2xTZXRJZHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHRjb25zdCBlbmFibGVkVG9vbElkcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdGZvciAoY29uc3QgW3Rvb2wsIGVuYWJsZWRdIG9mIG1hcCkge1xuXHRcdFx0aWYgKGVuYWJsZWQpIHtcblx0XHRcdFx0aWYgKGlzVG9vbFNldCh0b29sKSkge1xuXHRcdFx0XHRcdGVuYWJsZWRUb29sU2V0SWRzLmFkZCh0b29sLmlkKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRlbmFibGVkVG9vbElkcy5hZGQodG9vbC5pZCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0Zm9yIChjb25zdCBbdG9vbCwgZnVsbFJlZmVyZW5jZU5hbWVdIG9mIHRoaXMudG9vbHNXaXRoRnVsbFJlZmVyZW5jZU5hbWUuZ2V0KCkpIHtcblx0XHRcdGlmIChpc1Rvb2xTZXQodG9vbCkpIHtcblx0XHRcdFx0aWYgKGVuYWJsZWRUb29sU2V0SWRzLmhhcyh0b29sLmlkKSkge1xuXHRcdFx0XHRcdHJlc3VsdC5wdXNoKGZ1bGxSZWZlcmVuY2VOYW1lKTtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IG1lbWJlclRvb2wgb2YgdG9vbC5nZXRUb29scygpKSB7XG5cdFx0XHRcdFx0XHR0b29sc0NvdmVyZWRCeUVuYWJsZWRUb29sU2V0LmFkZChtZW1iZXJUb29sKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGlmIChlbmFibGVkVG9vbElkcy5oYXModG9vbC5pZCkgJiYgIXRvb2xzQ292ZXJlZEJ5RW5hYmxlZFRvb2xTZXQuaGFzKHRvb2wpKSB7XG5cdFx0XHRcdFx0cmVzdWx0LnB1c2goZnVsbFJlZmVyZW5jZU5hbWUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHR0b1Rvb2xSZWZlcmVuY2VzKHZhcmlhYmxlUmVmZXJlbmNlczogcmVhZG9ubHkgSVZhcmlhYmxlUmVmZXJlbmNlW10pOiBDaGF0UmVxdWVzdFRvb2xSZWZlcmVuY2VFbnRyeVtdIHtcblx0XHRjb25zdCB0b29sc09yVG9vbFNldEJ5TmFtZSA9IG5ldyBNYXA8c3RyaW5nLCBUb29sU2V0IHwgSVRvb2xEYXRhPigpO1xuXHRcdGZvciAoY29uc3QgW3Rvb2wsIGZ1bGxSZWZlcmVuY2VOYW1lXSBvZiB0aGlzLnRvb2xzV2l0aEZ1bGxSZWZlcmVuY2VOYW1lLmdldCgpKSB7XG5cdFx0XHR0b29sc09yVG9vbFNldEJ5TmFtZS5zZXQoZnVsbFJlZmVyZW5jZU5hbWUsIHRvb2wpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlc3VsdDogQ2hhdFJlcXVlc3RUb29sUmVmZXJlbmNlRW50cnlbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgcmVmIG9mIHZhcmlhYmxlUmVmZXJlbmNlcykge1xuXHRcdFx0Y29uc3QgdG9vbE9yVG9vbFNldCA9IHRvb2xzT3JUb29sU2V0QnlOYW1lLmdldChyZWYubmFtZSk7XG5cdFx0XHRpZiAodG9vbE9yVG9vbFNldCkge1xuXHRcdFx0XHRpZiAoaXNUb29sU2V0KHRvb2xPclRvb2xTZXQpKSB7XG5cdFx0XHRcdFx0cmVzdWx0LnB1c2godG9Ub29sU2V0VmFyaWFibGVFbnRyeSh0b29sT3JUb29sU2V0LCByZWYucmFuZ2UpKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRyZXN1bHQucHVzaCh0b1Rvb2xWYXJpYWJsZUVudHJ5KHRvb2xPclRvb2xTZXQsIHJlZi5yYW5nZSkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Rvb2xTZXRzID0gbmV3IE9ic2VydmFibGVTZXQ8VG9vbFNldD4oKTtcblxuXHRyZWFkb25seSB0b29sU2V0czogSU9ic2VydmFibGU8SXRlcmFibGU8VG9vbFNldD4+ID0gZGVyaXZlZCh0aGlzLCByZWFkZXIgPT4ge1xuXHRcdGNvbnN0IGFsbFRvb2xTZXRzID0gQXJyYXkuZnJvbSh0aGlzLl90b29sU2V0cy5vYnNlcnZhYmxlLnJlYWQocmVhZGVyKSk7XG5cdFx0cmV0dXJuIGFsbFRvb2xTZXRzLmZpbHRlcih0b29sU2V0ID0+IHRoaXMuaXNQZXJtaXR0ZWQodG9vbFNldCwgcmVhZGVyKSk7XG5cdH0pO1xuXG5cdGdldFRvb2xTZXRzRm9yTW9kZWwobW9kZWw6IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhIHwgdW5kZWZpbmVkLCByZWFkZXI/OiBJUmVhZGVyKTogSXRlcmFibGU8SVRvb2xTZXQ+IHtcblx0XHRpZiAoIW1vZGVsKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy50b29sU2V0cy5yZWFkKHJlYWRlcik7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIEl0ZXJhYmxlLm1hcCh0aGlzLnRvb2xTZXRzLnJlYWQocmVhZGVyKSwgdHMgPT4gbmV3IFRvb2xTZXRGb3JNb2RlbCh0cywgbW9kZWwsIHRvb2xEYXRhID0+IHRoaXMuaXNUb29sRW5hYmxlZEZvck1vZGVsKHRvb2xEYXRhLCBtb2RlbCkpKTtcblx0fVxuXG5cdGdldFRvb2xTZXQoaWQ6IHN0cmluZyk6IFRvb2xTZXQgfCB1bmRlZmluZWQge1xuXHRcdGZvciAoY29uc3QgdG9vbFNldCBvZiB0aGlzLl90b29sU2V0cykge1xuXHRcdFx0aWYgKHRvb2xTZXQuaWQgPT09IGlkKSB7XG5cdFx0XHRcdHJldHVybiB0b29sU2V0O1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0Z2V0VG9vbFNldEJ5TmFtZShuYW1lOiBzdHJpbmcpOiBUb29sU2V0IHwgdW5kZWZpbmVkIHtcblx0XHRmb3IgKGNvbnN0IHRvb2xTZXQgb2YgdGhpcy5fdG9vbFNldHMpIHtcblx0XHRcdGlmICh0b29sU2V0LnJlZmVyZW5jZU5hbWUgPT09IG5hbWUpIHtcblx0XHRcdFx0cmV0dXJuIHRvb2xTZXQ7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRnZXRTcGVjZWRUb29sU2V0TmFtZShyZWZlcmVuY2VOYW1lOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdGlmIChMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLmdpdGh1Yk1DUFNlcnZlckFsaWFzZXMuaW5jbHVkZXMocmVmZXJlbmNlTmFtZSkpIHtcblx0XHRcdHJldHVybiAnZ2l0aHViJztcblx0XHR9XG5cdFx0aWYgKExhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UucGxheXdyaWdodE1DUFNlcnZlckFsaWFzZXMuaW5jbHVkZXMocmVmZXJlbmNlTmFtZSkpIHtcblx0XHRcdHJldHVybiAncGxheXdyaWdodCc7XG5cdFx0fVxuXHRcdHJldHVybiByZWZlcmVuY2VOYW1lO1xuXHR9XG5cblx0Y3JlYXRlVG9vbFNldChzb3VyY2U6IFRvb2xEYXRhU291cmNlLCBpZDogc3RyaW5nLCByZWZlcmVuY2VOYW1lOiBzdHJpbmcsIG9wdGlvbnM/OiB7IGljb24/OiBUaGVtZUljb247IGRlc2NyaXB0aW9uPzogc3RyaW5nOyBkZXRhaWw/OiBzdHJpbmc7IGxlZ2FjeUZ1bGxOYW1lcz86IHN0cmluZ1tdOyBkZXByZWNhdGVkPzogYm9vbGVhbjsgaGlkZGVuSW5Ub29sc1BpY2tlcj86IGJvb2xlYW4gfSk6IFRvb2xTZXQgJiBJRGlzcG9zYWJsZSB7XG5cblx0XHRjb25zdCB0aGF0ID0gdGhpcztcblxuXHRcdHJlZmVyZW5jZU5hbWUgPSB0aGlzLmdldFNwZWNlZFRvb2xTZXROYW1lKHJlZmVyZW5jZU5hbWUpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gbmV3IGNsYXNzIGV4dGVuZHMgVG9vbFNldCBpbXBsZW1lbnRzIElEaXNwb3NhYmxlIHtcblx0XHRcdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0XHRcdGlmICh0aGF0Ll90b29sU2V0cy5oYXMocmVzdWx0KSkge1xuXHRcdFx0XHRcdHRoaXMuX3Rvb2xzLmNsZWFyKCk7XG5cdFx0XHRcdFx0dGhhdC5fdG9vbFNldHMuZGVsZXRlKHJlc3VsdCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0fVxuXHRcdH0oaWQsIHJlZmVyZW5jZU5hbWUsIG9wdGlvbnM/Lmljb24gPz8gQ29kaWNvbi50b29scywgc291cmNlLCBvcHRpb25zPy5kZXNjcmlwdGlvbiwgb3B0aW9ucz8uZGV0YWlsLCBvcHRpb25zPy5sZWdhY3lGdWxsTmFtZXMsIG9wdGlvbnM/LmRlcHJlY2F0ZWQsIG9wdGlvbnM/LmhpZGRlbkluVG9vbHNQaWNrZXIsIHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlKTtcblxuXHRcdHRoaXMuX3Rvb2xTZXRzLmFkZChyZXN1bHQpO1xuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IGFsbFRvb2xzSW5jbHVkaW5nRGlzYWJsZU9icyA9IG9ic2VydmFibGVGcm9tRXZlbnRPcHRzPHJlYWRvbmx5IElUb29sRGF0YVtdLCB2b2lkPihcblx0XHR7IGVxdWFsc0ZuOiBhcnJheUVxdWFsc0MoKSB9LFxuXHRcdHRoaXMub25EaWRDaGFuZ2VUb29scyxcblx0XHQoKSA9PiBBcnJheS5mcm9tKHRoaXMuZ2V0QWxsVG9vbHNJbmNsdWRpbmdEaXNhYmxlZCgpKSxcblx0KTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IHRvb2xzV2l0aEZ1bGxSZWZlcmVuY2VOYW1lID0gZGVyaXZlZDxbSVRvb2xEYXRhIHwgVG9vbFNldCwgc3RyaW5nXVtdPihyZWFkZXIgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdDogW0lUb29sRGF0YSB8IFRvb2xTZXQsIHN0cmluZ11bXSA9IFtdO1xuXHRcdGNvbnN0IGNvdmVyZWRCeVRvb2xTZXRzID0gbmV3IFNldDxJVG9vbERhdGE+KCk7XG5cdFx0Zm9yIChjb25zdCB0b29sU2V0IG9mIHRoaXMudG9vbFNldHMucmVhZChyZWFkZXIpKSB7XG5cdFx0XHRpZiAodG9vbFNldC5zb3VyY2UudHlwZSAhPT0gJ3VzZXInKSB7XG5cdFx0XHRcdHJlc3VsdC5wdXNoKFt0b29sU2V0LCBnZXRUb29sU2V0RnVsbFJlZmVyZW5jZU5hbWUodG9vbFNldCldKTtcblx0XHRcdFx0Zm9yIChjb25zdCB0b29sIG9mIHRvb2xTZXQuZ2V0VG9vbHMoKSkge1xuXHRcdFx0XHRcdHJlc3VsdC5wdXNoKFt0b29sLCBnZXRUb29sRnVsbFJlZmVyZW5jZU5hbWUodG9vbCwgdG9vbFNldCldKTtcblx0XHRcdFx0XHRjb3ZlcmVkQnlUb29sU2V0cy5hZGQodG9vbCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0Zm9yIChjb25zdCB0b29sIG9mIHRoaXMuYWxsVG9vbHNJbmNsdWRpbmdEaXNhYmxlT2JzLnJlYWQocmVhZGVyKSkge1xuXHRcdFx0Ly8gdG9kb0Bjb25ub3I0MzEyL2Flc2NoaWw6IHRoaXMgZWZmZWN0aXZlbHkgaGlkZXMgbW9kZWwtc3BlY2lmaWMgdG9vbHNcblx0XHRcdC8vIGZvciBwcm9tcHQgcmVmZXJlbmNpbmcuIFNob3VsZCB3ZSBldmVudHVhbGx5IGVuYWJsZSB0aGlzPyAoSWYgc28gaG93Pylcblx0XHRcdGlmICh0b29sLndoZW4gJiYgIXRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlLmNvbnRleHRNYXRjaGVzUnVsZXModG9vbC53aGVuKSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHRvb2wuY2FuQmVSZWZlcmVuY2VkSW5Qcm9tcHQgJiYgIWNvdmVyZWRCeVRvb2xTZXRzLmhhcyh0b29sKSAmJiB0aGlzLmlzUGVybWl0dGVkKHRvb2wsIHJlYWRlcikpIHtcblx0XHRcdFx0cmVzdWx0LnB1c2goW3Rvb2wsIGdldFRvb2xGdWxsUmVmZXJlbmNlTmFtZSh0b29sKV0pO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9KTtcblxuXHQqIGdldEZ1bGxSZWZlcmVuY2VOYW1lcygpOiBJdGVyYWJsZTxzdHJpbmc+IHtcblx0XHRmb3IgKGNvbnN0IFssIGZ1bGxSZWZlcmVuY2VOYW1lXSBvZiB0aGlzLnRvb2xzV2l0aEZ1bGxSZWZlcmVuY2VOYW1lLmdldCgpKSB7XG5cdFx0XHR5aWVsZCBmdWxsUmVmZXJlbmNlTmFtZTtcblx0XHR9XG5cdH1cblxuXHRnZXREZXByZWNhdGVkRnVsbFJlZmVyZW5jZU5hbWVzKCk6IE1hcDxzdHJpbmcsIFNldDxzdHJpbmc+PiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gbmV3IE1hcDxzdHJpbmcsIFNldDxzdHJpbmc+PigpO1xuXHRcdGNvbnN0IGtub3duVG9vbFNldE5hbWVzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0Y29uc3QgYWRkID0gKG5hbWU6IHN0cmluZywgZnVsbFJlZmVyZW5jZU5hbWU6IHN0cmluZykgPT4ge1xuXHRcdFx0aWYgKG5hbWUgIT09IGZ1bGxSZWZlcmVuY2VOYW1lKSB7XG5cdFx0XHRcdGlmICghcmVzdWx0LmhhcyhuYW1lKSkge1xuXHRcdFx0XHRcdHJlc3VsdC5zZXQobmFtZSwgbmV3IFNldDxzdHJpbmc+KCkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJlc3VsdC5nZXQobmFtZSkhLmFkZChmdWxsUmVmZXJlbmNlTmFtZSk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGZvciAoY29uc3QgW3Rvb2wsIF9dIG9mIHRoaXMudG9vbHNXaXRoRnVsbFJlZmVyZW5jZU5hbWUuZ2V0KCkpIHtcblx0XHRcdGlmIChpc1Rvb2xTZXQodG9vbCkpIHtcblx0XHRcdFx0a25vd25Ub29sU2V0TmFtZXMuYWRkKHRvb2wucmVmZXJlbmNlTmFtZSk7XG5cdFx0XHRcdGlmICh0b29sLmxlZ2FjeUZ1bGxOYW1lcykge1xuXHRcdFx0XHRcdGZvciAoY29uc3QgbGVnYWN5TmFtZSBvZiB0b29sLmxlZ2FjeUZ1bGxOYW1lcykge1xuXHRcdFx0XHRcdFx0a25vd25Ub29sU2V0TmFtZXMuYWRkKGxlZ2FjeU5hbWUpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGZvciAoY29uc3QgW3Rvb2wsIGZ1bGxSZWZlcmVuY2VOYW1lXSBvZiB0aGlzLnRvb2xzV2l0aEZ1bGxSZWZlcmVuY2VOYW1lLmdldCgpKSB7XG5cdFx0XHRpZiAoaXNUb29sU2V0KHRvb2wpKSB7XG5cdFx0XHRcdGZvciAoY29uc3QgYWxpYXMgb2YgdGhpcy5nZXRUb29sU2V0QWxpYXNlcyh0b29sLCBmdWxsUmVmZXJlbmNlTmFtZSkpIHtcblx0XHRcdFx0XHRhZGQoYWxpYXMsIGZ1bGxSZWZlcmVuY2VOYW1lKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Zm9yIChjb25zdCBhbGlhcyBvZiB0aGlzLmdldFRvb2xBbGlhc2VzKHRvb2wsIGZ1bGxSZWZlcmVuY2VOYW1lKSkge1xuXHRcdFx0XHRcdGFkZChhbGlhcywgZnVsbFJlZmVyZW5jZU5hbWUpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICh0b29sLmxlZ2FjeVRvb2xSZWZlcmVuY2VGdWxsTmFtZXMpIHtcblx0XHRcdFx0XHQvLyBJZiB0aGUgdG9vbCBpcyBpbiBhIHRvb2xzZXQgKGZ1bGxSZWZlcmVuY2VOYW1lIGhhcyBhICcvJyksIGFsc28gYWRkIHRoZVxuXHRcdFx0XHRcdC8vIG5hbWVzcGFjZWQgZm9ybSBvZiBsZWdhY3kgbmFtZXMgKGUuZy4gJ3ZzY29kZS9vbGROYW1lJyBcdTIxOTIgJ3ZzY29kZS9uZXdOYW1lJylcblx0XHRcdFx0XHRjb25zdCBzbGFzaEluZGV4ID0gZnVsbFJlZmVyZW5jZU5hbWUubGFzdEluZGV4T2YoJy8nKTtcblx0XHRcdFx0XHRjb25zdCB0b29sU2V0UHJlZml4ID0gc2xhc2hJbmRleCAhPT0gLTEgPyBmdWxsUmVmZXJlbmNlTmFtZS5zdWJzdHJpbmcoMCwgc2xhc2hJbmRleCArIDEpIDogdW5kZWZpbmVkO1xuXG5cdFx0XHRcdFx0Zm9yIChjb25zdCBsZWdhY3lOYW1lIG9mIHRvb2wubGVnYWN5VG9vbFJlZmVyZW5jZUZ1bGxOYW1lcykge1xuXHRcdFx0XHRcdFx0aWYgKHRvb2xTZXRQcmVmaXggJiYgIWxlZ2FjeU5hbWUuaW5jbHVkZXMoJy8nKSkge1xuXHRcdFx0XHRcdFx0XHRhZGQodG9vbFNldFByZWZpeCArIGxlZ2FjeU5hbWUsIGZ1bGxSZWZlcmVuY2VOYW1lKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdC8vIGZvciBhbnkgJ29ycGhhbmVkJyB0b29sc2V0cyAodG9vbHNldHMgdGhhdCBubyBsb25nZXIgZXhpc3QgYW5kXG5cdFx0XHRcdFx0XHQvLyBkbyBub3QgaGF2ZSBhbiBleHBsaWNpdCBsZWdhY3kgbWFwcGluZyksIHdlIHNob3VsZFxuXHRcdFx0XHRcdFx0Ly8ganVzdCBwb2ludCB0aGVtIHRvIHRoZSBsaXN0IG9mIHRvb2xzIGRpcmVjdGx5XG5cdFx0XHRcdFx0XHRpZiAobGVnYWN5TmFtZS5pbmNsdWRlcygnLycpKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IHRvb2xTZXRGdWxsTmFtZSA9IGxlZ2FjeU5hbWUuc3Vic3RyaW5nKDAsIGxlZ2FjeU5hbWUubGFzdEluZGV4T2YoJy8nKSk7XG5cdFx0XHRcdFx0XHRcdGlmICgha25vd25Ub29sU2V0TmFtZXMuaGFzKHRvb2xTZXRGdWxsTmFtZSkpIHtcblx0XHRcdFx0XHRcdFx0XHRhZGQodG9vbFNldEZ1bGxOYW1lLCBmdWxsUmVmZXJlbmNlTmFtZSk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdGdldFRvb2xCeUZ1bGxSZWZlcmVuY2VOYW1lKGZ1bGxSZWZlcmVuY2VOYW1lOiBzdHJpbmcpOiBJVG9vbERhdGEgfCBUb29sU2V0IHwgdW5kZWZpbmVkIHtcblx0XHRmb3IgKGNvbnN0IFt0b29sLCB0b29sRnVsbFJlZmVyZW5jZU5hbWVdIG9mIHRoaXMudG9vbHNXaXRoRnVsbFJlZmVyZW5jZU5hbWUuZ2V0KCkpIHtcblx0XHRcdGlmIChmdWxsUmVmZXJlbmNlTmFtZSA9PT0gdG9vbEZ1bGxSZWZlcmVuY2VOYW1lKSB7XG5cdFx0XHRcdHJldHVybiB0b29sO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgYWxpYXNlcyA9IGlzVG9vbFNldCh0b29sKSA/IHRoaXMuZ2V0VG9vbFNldEFsaWFzZXModG9vbCwgdG9vbEZ1bGxSZWZlcmVuY2VOYW1lKSA6IHRoaXMuZ2V0VG9vbEFsaWFzZXModG9vbCwgdG9vbEZ1bGxSZWZlcmVuY2VOYW1lKTtcblx0XHRcdGlmIChJdGVyYWJsZS5zb21lKGFsaWFzZXMsIGFsaWFzID0+IGZ1bGxSZWZlcmVuY2VOYW1lID09PSBhbGlhcykpIHtcblx0XHRcdFx0cmV0dXJuIHRvb2w7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRnZXRGdWxsUmVmZXJlbmNlTmFtZSh0b29sOiBJVG9vbERhdGEgfCBJVG9vbFNldCwgdG9vbFNldD86IElUb29sU2V0KTogc3RyaW5nIHtcblx0XHRmb3IgKGNvbnN0IFtpdGVtLCB0b29sRnVsbFJlZmVyZW5jZU5hbWVdIG9mIHRoaXMudG9vbHNXaXRoRnVsbFJlZmVyZW5jZU5hbWUuZ2V0KCkpIHtcblx0XHRcdGlmIChpdGVtID09PSB0b29sKSB7XG5cdFx0XHRcdHJldHVybiB0b29sRnVsbFJlZmVyZW5jZU5hbWU7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKGlzVG9vbFNldCh0b29sKSkge1xuXHRcdFx0cmV0dXJuIGdldFRvb2xTZXRGdWxsUmVmZXJlbmNlTmFtZSh0b29sKTtcblx0XHR9XG5cdFx0cmV0dXJuIGdldFRvb2xGdWxsUmVmZXJlbmNlTmFtZSh0b29sLCB0b29sU2V0KTtcblx0fVxuXG5cdGdldEZ1bGxSZWZlcmVuY2VOYW1lTWFwKCk6IE1hcDxJVG9vbERhdGEgfCBJVG9vbFNldCwgc3RyaW5nPiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gbmV3IE1hcDxJVG9vbERhdGEgfCBJVG9vbFNldCwgc3RyaW5nPigpO1xuXHRcdGZvciAoY29uc3QgW2l0ZW0sIHRvb2xGdWxsUmVmZXJlbmNlTmFtZV0gb2YgdGhpcy50b29sc1dpdGhGdWxsUmVmZXJlbmNlTmFtZS5nZXQoKSkge1xuXHRcdFx0cmVzdWx0LnNldChpdGVtLCB0b29sRnVsbFJlZmVyZW5jZU5hbWUpO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG59XG5cbmZ1bmN0aW9uIGdldFRvb2xGdWxsUmVmZXJlbmNlTmFtZSh0b29sOiBJVG9vbERhdGEsIHRvb2xTZXQ/OiBJVG9vbFNldCkge1xuXHRjb25zdCB0b29sTmFtZSA9IHRvb2wudG9vbFJlZmVyZW5jZU5hbWUgPz8gdG9vbC5kaXNwbGF5TmFtZTtcblx0aWYgKHRvb2xTZXQpIHtcblx0XHRyZXR1cm4gYCR7dG9vbFNldC5yZWZlcmVuY2VOYW1lfS8ke3Rvb2xOYW1lfWA7XG5cdH0gZWxzZSBpZiAodG9vbC5zb3VyY2UudHlwZSA9PT0gJ2V4dGVuc2lvbicpIHtcblx0XHRyZXR1cm4gYCR7dG9vbC5zb3VyY2UuZXh0ZW5zaW9uSWQudmFsdWUudG9Mb3dlckNhc2UoKX0vJHt0b29sTmFtZX1gO1xuXHR9XG5cdHJldHVybiB0b29sTmFtZTtcbn1cblxuZnVuY3Rpb24gZ2V0VG9vbFNldEZ1bGxSZWZlcmVuY2VOYW1lKHRvb2xTZXQ6IElUb29sU2V0KSB7XG5cdGlmICh0b29sU2V0LnNvdXJjZS50eXBlID09PSAnbWNwJykge1xuXHRcdHJldHVybiBgJHt0b29sU2V0LnJlZmVyZW5jZU5hbWV9LypgO1xuXHR9XG5cdHJldHVybiB0b29sU2V0LnJlZmVyZW5jZU5hbWU7XG59XG5cblxudHlwZSBUb29sQXBwcm92YWxFdmVudCA9IExhbmd1YWdlTW9kZWxUb29sVGVsZW1ldHJ5RGF0YSAmIHtcblx0Y29uZmlybUtpbmQ6IHN0cmluZztcblx0cmVxdWVzdElkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHNldHRpbmdJZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRsbVNlcnZpY2VTY29wZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRjdXN0b21CdXR0b25LaW5kOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdGNvbmZpcm1hdGlvbk5vdE5lZWRlZFJlYXNvbjogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRzYW5kYm94V3JhcHBlZDogYm9vbGVhbiB8IHVuZGVmaW5lZDtcblx0cmVxdWVzdFVuc2FuZGJveGVkRXhlY3V0aW9uOiBib29sZWFuIHwgdW5kZWZpbmVkO1xufTtcblxudHlwZSBUb29sQXBwcm92YWxDbGFzc2lmaWNhdGlvbiA9IExhbmd1YWdlTW9kZWxUb29sVGVsZW1ldHJ5Q2xhc3NpZmljYXRpb24gJiB7XG5cdGNvbmZpcm1LaW5kOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnSG93IHRoZSBjb25maXJtYXRpb24gd2FzIHJlc29sdmVkICh1c2VyQWN0aW9uLCBzZXR0aW5nLCBsbVNlcnZpY2VQZXJUb29sLCBjb25maXJtYXRpb25Ob3ROZWVkZWQsIGRlbmllZCwgc2tpcHBlZCkuIEFueXRoaW5nIG90aGVyIHRoYW4gdXNlckFjdGlvbiBpbXBsaWVzIGF1dG8tYXBwcm92YWwuIFwiZGVuaWVkXCIgYW5kIFwic2tpcHBlZFwiIG1lYW4gdGhlIHRvb2wgZGlkIG5vdCBydW47IG90aGVyd2lzZSBpdCByYW4gKG5vdGU6IGEgY3VzdG9tIERlbnkgYnV0dG9uIGNsaWNrIHJlc29sdmVzIGFzIHVzZXJBY3Rpb24gc2luY2UgdGhlIHRvb2wgc3RpbGwgcnVucyBhbmQgdGhlIGNob3NlbiBsYWJlbCBpcyBwYXNzZWQgdG8gaXQ7IHNlZSBjdXN0b21CdXR0b25LaW5kIHRvIGRpc3Rpbmd1aXNoKS4nIH07XG5cdHJlcXVlc3RJZDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RoZSBJRCBvZiB0aGUgY2hhdCByZXF1ZXN0IHR1cm4gdGhhdCB0aGlzIHRvb2wgYXBwcm92YWwgaXMgYXNzb2NpYXRlZCB3aXRoLCBpZiBhdmFpbGFibGUuJyB9O1xuXHRzZXR0aW5nSWQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdXaGVuIGNvbmZpcm1LaW5kIGlzIHNldHRpbmcsIHRoZSBjb25maWd1cmF0aW9uIGlkIHRoYXQgYXV0by1hcHByb3ZlZCB0aGUgdG9vbC4nIH07XG5cdGxtU2VydmljZVNjb3BlOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnV2hlbiBjb25maXJtS2luZCBpcyBsbVNlcnZpY2VQZXJUb29sLCB0aGUgc2NvcGUgKHNlc3Npb24vd29ya3NwYWNlL3Byb2ZpbGUpLicgfTtcblx0Y3VzdG9tQnV0dG9uS2luZDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1doZW4gdGhlIHVzZXIgY2xpY2tlZCBhIGN1c3RvbSBidXR0b24gb24gdGhlIGNvbmZpcm1hdGlvbiB3aWRnZXQsIHdoZXRoZXIgdGhlIGJ1dHRvbiByZXByZXNlbnRzIGFwcHJvdmUgb3IgZGVueSBzZW1hbnRpY3MuIFVuZGVmaW5lZCB3aGVuIG5vIGN1c3RvbSBidXR0b24gd2FzIGNsaWNrZWQuJyB9O1xuXHRjb25maXJtYXRpb25Ob3ROZWVkZWRSZWFzb246IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdXaGVuIGNvbmZpcm1LaW5kIGlzIGNvbmZpcm1hdGlvbk5vdE5lZWRlZCwgYSBzdGFibGUgaWRlbnRpZmllciBmb3Igd2h5IHRoZSB0b29sIGRpZCBub3QgcmVxdWlyZSBjb25maXJtYXRpb24uIExpbWl0ZWQgdG8gYSBrbm93biBhbGxvd2xpc3QgKGUuZy4gYXV0by1hcHByb3ZlLWFsbCwgaW5saW5lQ2hhdCk7IHNldCB0byBcIm90aGVyXCIgZm9yIGFueSBvdGhlciByZWFzb247IHVuZGVmaW5lZCB3aGVuIG5vIHJlYXNvbiB3YXMgc3VwcGxpZWQuJyB9O1xuXHRzYW5kYm94V3JhcHBlZDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ0ZvciB0ZXJtaW5hbCB0b29sIGNhbGxzLCB3aGV0aGVyIHRoaXMgc3BlY2lmaWMgaW52b2NhdGlvbiBydW5zIGluc2lkZSB0aGUgYWdlbnQgdGVybWluYWwgc2FuZGJveC4gVW5kZWZpbmVkIGZvciBub24tdGVybWluYWwgdG9vbHMuJyB9O1xuXHRyZXF1ZXN0VW5zYW5kYm94ZWRFeGVjdXRpb246IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdGb3IgdGVybWluYWwgdG9vbCBjYWxscywgd2hldGhlciB0aGUgbW9kZWwgcmVxdWVzdGVkIHRvIGJ5cGFzcyB0aGUgc2FuZGJveCBmb3IgdGhpcyBpbnZvY2F0aW9uLiBVbmRlZmluZWQgZm9yIG5vbi10ZXJtaW5hbCB0b29scy4nIH07XG5cdG93bmVyOiAnY2hybWFydGknO1xuXHRjb21tZW50OiAnUHJvdmlkZXMgaW5zaWdodCBpbnRvIGhvdyB0b29sIGNvbmZpcm1hdGlvbnMgYXJlIHJlc29sdmVkICh1c2VyIGFjdGlvbiB2cy4gYXV0by1hcHByb3ZhbCkuJztcbn07XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsa0JBQWtCLGVBQWU7QUFDMUMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxtQkFBbUIsK0JBQStCO0FBQzNELFNBQVMsZUFBZTtBQUN4QixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLG1CQUFtQiwyQkFBMkI7QUFDdkQsU0FBUyxTQUFTLGFBQWE7QUFDL0IsU0FBUywyQkFBMkIsc0JBQXNCO0FBQzFELFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsb0JBQW9CLFlBQVksaUJBQThCLG9CQUFvQjtBQUMzRixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLFNBQVMsYUFBbUMseUJBQXlCLGVBQWUsa0JBQWtCLG1CQUFtQjtBQUNsSSxPQUFPLGNBQWM7QUFDckIsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsVUFBVSxpQkFBaUI7QUFDcEMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxxQkFBcUIsbUNBQW1DO0FBQ2pFLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQXNCLDBCQUEwQjtBQUNoRCxTQUFTLHNCQUFzQjtBQUUvQixTQUFTLDZCQUE2QjtBQUN0QyxZQUFZLDhCQUE4QjtBQUMxQyxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGlCQUFpQixjQUFjLHFCQUFxQjtBQUM3RCxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLHVCQUF1QjtBQUNoQyxTQUF3Qyx3QkFBd0IsMkJBQTJCO0FBRTNGLFNBQTBCLGNBQWMscUJBQXFCLHVCQUF1QjtBQUNwRixTQUFTLG1CQUFtQixvQkFBb0Isd0JBQXdCO0FBQ3hFLFNBQVMsNEJBQTRCO0FBR3JDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMseUJBQXlCLDBCQUEwQjtBQUM1RCxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHNCQUFzQixxQkFBcUI7QUFDcEQsU0FBUyw4Q0FBOEM7QUFDdkQsU0FBUyxzQkFBc0I7QUFDL0IsU0FBOEIscUJBQWdJLFdBQTJILG1CQUFtQix3QkFBd0IsNkJBQTZCLGdCQUFnQiw0QkFBNEIsa0JBQWtCLFNBQVMsaUJBQWlCLDJCQUEyQjtBQUNwZCxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLGdDQUFnQyxxQkFBcUI7QUFFOUQsTUFBTSxxQkFBcUIsU0FBUyxHQUF1RCx5QkFBeUIsV0FBVyxnQkFBZ0I7QUFXeEksSUFBVyx5QkFBWCxrQkFBV0EsNEJBQVg7QUFDTixFQUFBQSx3QkFBQSw0QkFBeUI7QUFEUixTQUFBQTtBQUFBLEdBQUE7QUFJbEIsTUFBTSxpQ0FBaUM7QUFPdkMsTUFBTSx1QkFBdUI7QUFJN0IsTUFBTSxrQ0FBa0Msb0JBQUksSUFBSTtBQUFBLEVBQy9DO0FBQUEsRUFDQTtBQUNELENBQUM7QUFNRCxNQUFNLHNCQUFzQixvQkFBSSxJQUFJO0FBQUEsRUFDbkM7QUFBQSxFQUNBO0FBQ0QsQ0FBQztBQUVNLE1BQU0sK0JBQStCO0FBQUEsRUFDM0M7QUFBQSxJQUNDLEtBQUs7QUFBQSxJQUNMLFNBQVM7QUFBQSxNQUNSO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUEsRUFDQTtBQUNEO0FBRU8sSUFBTSw0QkFBTixjQUF3QyxXQUFpRDtBQUFBLEVBOEIvRixZQUN5Qyx1QkFDSixtQkFDQyxvQkFDTixjQUNFLGdCQUNHLG1CQUNOLGFBQ1UsdUJBQ0EsdUJBQ00sNkJBQ1osaUJBQ3VCLHNCQUN2QixpQkFDRyxvQkFDRyx1QkFDUyx3QkFDaEQ7QUFDRCxVQUFNO0FBakJrQztBQUNKO0FBQ0M7QUFDTjtBQUNFO0FBQ0c7QUFDTjtBQUNVO0FBQ0E7QUFDTTtBQUNaO0FBQ3VCO0FBQ3ZCO0FBQ0c7QUFDRztBQUNTO0FBdkNsRCxTQUFpQixvQkFBb0IsS0FBSyxVQUFVLElBQUksUUFBYyxDQUFDO0FBQ3ZFLFNBQVMsbUJBQW1CLEtBQUssa0JBQWtCO0FBQ25ELFNBQWlCLDBDQUEwQyxLQUFLLFVBQVUsSUFBSSxRQUF1RCxDQUFDO0FBQ3RJLFNBQVMseUNBQXlDLEtBQUssd0NBQXdDO0FBQy9GLFNBQWlCLG1CQUFtQixLQUFLLFVBQVUsSUFBSSxRQUEyQixDQUFDO0FBQ25GLFNBQVMsa0JBQWtCLEtBQUssaUJBQWlCO0FBR2pEO0FBQUEsU0FBaUIsNkJBQTZCLEtBQUssVUFBVSxJQUFJLGlCQUFpQixNQUFNLEtBQUssa0JBQWtCLEtBQUssR0FBRyxHQUFHLENBQUM7QUFDM0gsU0FBaUIsU0FBUyxvQkFBSSxJQUF3QjtBQUN0RCxTQUFpQixtQkFBbUIsb0JBQUksSUFBWTtBQUdwRCxTQUFpQixvQkFBb0Isb0JBQUksSUFBNEI7QUFHckU7QUFBQSxTQUFpQixvQkFBb0Isb0JBQUksSUFBZ0M7QUF5aUR6RSxTQUFpQixZQUFZLElBQUksY0FBdUI7QUFFeEQsU0FBUyxXQUEyQyxRQUFRLE1BQU0sWUFBVTtBQUMzRSxZQUFNLGNBQWMsTUFBTSxLQUFLLEtBQUssVUFBVSxXQUFXLEtBQUssTUFBTSxDQUFDO0FBQ3JFLGFBQU8sWUFBWSxPQUFPLGFBQVcsS0FBSyxZQUFZLFNBQVMsTUFBTSxDQUFDO0FBQUEsSUFDdkUsQ0FBQztBQTBERCxTQUFpQiw4QkFBOEI7QUFBQSxNQUM5QyxFQUFFLFVBQVUsYUFBYSxFQUFFO0FBQUEsTUFDM0IsS0FBSztBQUFBLE1BQ0wsTUFBTSxNQUFNLEtBQUssS0FBSyw2QkFBNkIsQ0FBQztBQUFBLElBQ3JEO0FBRUEsU0FBaUIsNkJBQTZCLFFBQXlDLFlBQVU7QUFDaEcsWUFBTSxTQUEwQyxDQUFDO0FBQ2pELFlBQU0sb0JBQW9CLG9CQUFJLElBQWU7QUFDN0MsaUJBQVcsV0FBVyxLQUFLLFNBQVMsS0FBSyxNQUFNLEdBQUc7QUFDakQsWUFBSSxRQUFRLE9BQU8sU0FBUyxRQUFRO0FBQ25DLGlCQUFPLEtBQUssQ0FBQyxTQUFTLDRCQUE0QixPQUFPLENBQUMsQ0FBQztBQUMzRCxxQkFBVyxRQUFRLFFBQVEsU0FBUyxHQUFHO0FBQ3RDLG1CQUFPLEtBQUssQ0FBQyxNQUFNLHlCQUF5QixNQUFNLE9BQU8sQ0FBQyxDQUFDO0FBQzNELDhCQUFrQixJQUFJLElBQUk7QUFBQSxVQUMzQjtBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBQ0EsaUJBQVcsUUFBUSxLQUFLLDRCQUE0QixLQUFLLE1BQU0sR0FBRztBQUdqRSxZQUFJLEtBQUssUUFBUSxDQUFDLEtBQUssbUJBQW1CLG9CQUFvQixLQUFLLElBQUksR0FBRztBQUN6RTtBQUFBLFFBQ0Q7QUFFQSxZQUFJLEtBQUssMkJBQTJCLENBQUMsa0JBQWtCLElBQUksSUFBSSxLQUFLLEtBQUssWUFBWSxNQUFNLE1BQU0sR0FBRztBQUNuRyxpQkFBTyxLQUFLLENBQUMsTUFBTSx5QkFBeUIsSUFBSSxDQUFDLENBQUM7QUFBQSxRQUNuRDtBQUFBLE1BQ0Q7QUFDQSxhQUFPO0FBQUEsSUFDUixDQUFDO0FBM21EQSxTQUFLLHNCQUFzQixzQkFBc0Isa0JBQWtCLGNBQWMsTUFBTSxLQUFLLHFCQUFxQjtBQUVqSCxTQUFLLFVBQVUsS0FBSyxtQkFBbUIsbUJBQW1CLE9BQUs7QUFDOUQsVUFBSSxFQUFFLFlBQVksS0FBSyxnQkFBZ0IsR0FBRztBQUV6QyxhQUFLLDJCQUEyQixTQUFTO0FBQUEsTUFDMUM7QUFBQSxJQUNELENBQUMsQ0FBQztBQUVGLFNBQUssVUFBVSxLQUFLLHNCQUFzQix5QkFBeUIsT0FBSztBQUN2RSxVQUFJLEVBQUUscUJBQXFCLGtCQUFrQixxQkFBcUIsS0FBSyxFQUFFLHFCQUFxQixrQkFBa0IsWUFBWSxLQUFLLEVBQUUscUJBQXFCLHFCQUFxQix3QkFBd0IsR0FBRztBQUN2TSxhQUFLLDJCQUEyQixTQUFTO0FBQUEsTUFDMUM7QUFBQSxJQUNELENBQUMsQ0FBQztBQUdGLFNBQUssVUFBVSxNQUFNLGdCQUFnQixLQUFLLHNCQUFzQiwwQkFBMEIsT0FBSztBQUM5RixVQUFJLENBQUMsS0FBSyxFQUFFLHFCQUFxQixrQkFBa0IsaUJBQWlCLEdBQUc7QUFDdEUsWUFBSSxLQUFLLHNCQUFzQixTQUFTLGtCQUFrQixpQkFBaUIsTUFBTSxNQUFNO0FBQ3RGLGVBQUssZ0JBQWdCLE9BQU8sb0VBQStDLGFBQWEsV0FBVztBQUFBLFFBQ3BHO0FBQUEsTUFDRDtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBRUYsU0FBSyxpQkFBaUIsZ0JBQWdCLE1BQU0sV0FBVyxPQUFPLGtCQUFrQjtBQUdoRixTQUFLLGdCQUFnQixLQUFLLFVBQVUsS0FBSztBQUFBLE1BQ3hDLGVBQWU7QUFBQSxNQUNmO0FBQUEsTUFDQSxvQkFBb0I7QUFBQSxNQUNwQjtBQUFBLFFBQ0MsTUFBTSxVQUFVLE9BQU8sUUFBUSxPQUFPLEVBQUU7QUFBQSxRQUN4QyxhQUFhLFNBQVMsc0NBQXNDLHNCQUFzQjtBQUFBLFFBQ2xGLFlBQVk7QUFBQSxNQUNiO0FBQUEsSUFDRCxDQUFDO0FBR0QsU0FBSyxpQkFBaUIsS0FBSyxVQUFVLEtBQUs7QUFBQSxNQUN6QyxlQUFlO0FBQUEsTUFDZjtBQUFBLE1BQ0Esa0JBQWtCO0FBQUEsTUFDbEI7QUFBQSxRQUNDLE1BQU0sVUFBVSxPQUFPLFFBQVEsU0FBUyxFQUFFO0FBQUEsUUFDMUMsYUFBYSxTQUFTLHVDQUF1QywrQ0FBK0M7QUFBQSxRQUM1RyxZQUFZO0FBQUEsTUFDYjtBQUFBLElBQ0QsQ0FBQztBQUdELFNBQUssY0FBYyxLQUFLLFVBQVUsS0FBSztBQUFBLE1BQ3RDLGVBQWU7QUFBQSxNQUNmO0FBQUEsTUFDQSxrQkFBa0I7QUFBQSxNQUNsQjtBQUFBLFFBQ0MsTUFBTSxVQUFVLE9BQU8sUUFBUSxLQUFLLEVBQUU7QUFBQSxRQUN0QyxhQUFhLFNBQVMsb0NBQW9DLDhCQUE4QjtBQUFBLFFBQ3hGLFlBQVk7QUFBQSxNQUNiO0FBQUEsSUFDRCxDQUFDO0FBR0QsU0FBSyxlQUFlLEtBQUssVUFBVSxLQUFLO0FBQUEsTUFDdkMsZUFBZTtBQUFBLE1BQ2Y7QUFBQSxNQUNBLGtCQUFrQjtBQUFBLE1BQ2xCO0FBQUEsUUFDQyxNQUFNLFVBQVUsT0FBTyxRQUFRLE1BQU0sRUFBRTtBQUFBLFFBQ3ZDLGFBQWEsU0FBUyxxQ0FBcUMsZ0NBQWdDO0FBQUEsUUFDM0YsWUFBWTtBQUFBLE1BQ2I7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFUSxzQkFBc0IsVUFBcUIsT0FBd0Q7QUFDMUcsUUFBSSxDQUFDLGlCQUFpQixVQUFVLEtBQUssR0FBRztBQUN2QyxhQUFPO0FBQUEsSUFDUjtBQUVBLFFBQUksU0FBUyxPQUFPLGNBQWMsWUFBWSxPQUFPLE9BQU8sV0FBVyxTQUFTLEtBQUssS0FBSyxzQkFBc0IsU0FBa0IscUJBQXFCLHdCQUF3QixNQUFNLE9BQU87QUFDM0wsYUFBTztBQUFBLElBQ1I7QUFFQSxXQUFPO0FBQUEsRUFDUjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQU9RLFlBQVksZUFBb0MsUUFBMkI7QUFDbEYsVUFBTSxtQkFBbUIsS0FBSyxvQkFBb0IsS0FBSyxNQUFNO0FBQzdELFFBQUkscUJBQXFCLE9BQU87QUFDL0IsYUFBTztBQUFBLElBQ1I7QUFJQSxRQUFJLENBQUMsVUFBVSxhQUFhLEtBQUssY0FBYyw0QkFBNEIsU0FBUyxjQUFjLE9BQU8sU0FBUyxZQUFZO0FBQzdILGFBQU87QUFBQSxJQUNSO0FBRUEsVUFBTSw4QkFBOEIsQ0FBQyxrQkFBa0IsTUFBTSxrQkFBa0IsUUFBUSxrQkFBa0IsR0FBRztBQUM1RyxRQUFJLFVBQVUsYUFBYSxHQUFHO0FBQzdCLFlBQU0sWUFBWSxjQUFjLE9BQU8sU0FBUyxjQUFjLDRCQUE0QixTQUFTLGNBQWMsYUFBYTtBQUM5SCxXQUFLLFlBQVksTUFBTSxrREFBa0QsY0FBYyxFQUFFLEtBQUssY0FBYyxhQUFhLGVBQWUsU0FBUyxFQUFFO0FBQ25KLGFBQU87QUFBQSxJQUNSO0FBQ0EsZUFBVyxXQUFXLEtBQUssV0FBVztBQUNyQyxVQUFJLFFBQVEsT0FBTyxTQUFTLGNBQWMsNEJBQTRCLFNBQVMsUUFBUSxhQUFhLEdBQUc7QUFDdEcsbUJBQVcsY0FBYyxRQUFRLFNBQVMsR0FBRztBQUM1QyxjQUFJLFdBQVcsT0FBTyxjQUFjLElBQUk7QUFDdkMsaUJBQUssWUFBWSxNQUFNLCtDQUErQyxjQUFjLEVBQUUsS0FBSyxjQUFjLGlCQUFpQiwrQkFBK0IsUUFBUSxhQUFhLEdBQUc7QUFDakwsbUJBQU87QUFBQSxVQUNSO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBSUEsUUFBSSxjQUFjLE9BQU8sa0NBQWtDLDRCQUE0QixTQUFTLGtCQUFrQixHQUFHLEdBQUc7QUFDdkgsV0FBSyxZQUFZLE1BQU0sK0NBQStDLGNBQWMsRUFBRSxLQUFLLGNBQWMsaUJBQWlCLGlDQUFpQztBQUMzSixhQUFPO0FBQUEsSUFDUjtBQUVBLFNBQUssWUFBWSxNQUFNLCtDQUErQyxjQUFjLEVBQUUsS0FBSyxjQUFjLGlCQUFpQixtQkFBbUI7QUFDN0ksV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVTLFVBQWdCO0FBQ3hCLFVBQU0sUUFBUTtBQUVkLFNBQUssa0JBQWtCLFFBQVEsV0FBUyxNQUFNLFFBQVEsVUFBUSxLQUFLLE1BQU0sUUFBUSxDQUFDLENBQUM7QUFDbkYsU0FBSyxrQkFBa0IsTUFBTTtBQUM3QixTQUFLLGVBQWUsTUFBTTtBQUFBLEVBQzNCO0FBQUEsRUFFQSxpQkFBaUIsVUFBa0M7QUFDbEQsUUFBSSxLQUFLLE9BQU8sSUFBSSxTQUFTLEVBQUUsR0FBRztBQUNqQyxZQUFNLElBQUksTUFBTSxTQUFTLFNBQVMsRUFBRSwwQkFBMEI7QUFBQSxJQUMvRDtBQUVBLFNBQUssT0FBTyxJQUFJLFNBQVMsSUFBSSxFQUFFLE1BQU0sU0FBUyxDQUFDO0FBQy9DLFNBQUssZUFBZSxJQUFJLEtBQUssT0FBTyxJQUFJO0FBQ3hDLFFBQUksQ0FBQyxLQUFLLDJCQUEyQixZQUFZLEdBQUc7QUFDbkQsV0FBSywyQkFBMkIsU0FBUztBQUFBLElBQzFDO0FBRUEsYUFBUyxNQUFNLEtBQUssRUFBRSxRQUFRLFNBQU8sS0FBSyxpQkFBaUIsSUFBSSxHQUFHLENBQUM7QUFFbkUsUUFBSTtBQUNKLFFBQUksU0FBUyxhQUFhO0FBQ3pCLGNBQVEsSUFBSSxnQkFBZ0I7QUFDNUIsWUFBTSxZQUFZLG9CQUFvQixTQUFTLEVBQUUsRUFBRSxTQUFTO0FBQzVELHlCQUFtQixlQUFlLFdBQVcsU0FBUyxhQUFhLEtBQUs7QUFDeEUsWUFBTSxJQUFJLG1CQUFtQiwwQkFBMEIsV0FBVyxZQUFZLFNBQVMsRUFBRSxrQkFBa0IsQ0FBQztBQUFBLElBQzdHO0FBRUEsV0FBTyxhQUFhLE1BQU07QUFDekIsYUFBTyxRQUFRO0FBQ2YsV0FBSyxPQUFPLE9BQU8sU0FBUyxFQUFFO0FBQzlCLFdBQUssZUFBZSxJQUFJLEtBQUssT0FBTyxJQUFJO0FBQ3hDLFdBQUssMkJBQTJCO0FBQ2hDLFVBQUksQ0FBQyxLQUFLLDJCQUEyQixZQUFZLEdBQUc7QUFDbkQsYUFBSywyQkFBMkIsU0FBUztBQUFBLE1BQzFDO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRUEsbUJBQXlCO0FBQ3hCLFNBQUssMkJBQTJCLE1BQU07QUFBQSxFQUN2QztBQUFBLEVBRVEsNkJBQTZCO0FBQ3BDLFNBQUssaUJBQWlCLE1BQU07QUFDNUIsZUFBVyxRQUFRLEtBQUssT0FBTyxPQUFPLEdBQUc7QUFDeEMsV0FBSyxLQUFLLE1BQU0sS0FBSyxFQUFFLFFBQVEsU0FBTyxLQUFLLGlCQUFpQixJQUFJLEdBQUcsQ0FBQztBQUFBLElBQ3JFO0FBQUEsRUFDRDtBQUFBLEVBRUEsMkJBQTJCLElBQVksTUFBOEI7QUFDcEUsVUFBTSxRQUFRLEtBQUssT0FBTyxJQUFJLEVBQUU7QUFDaEMsUUFBSSxDQUFDLE9BQU87QUFDWCxZQUFNLElBQUksTUFBTSxTQUFTLEVBQUUsd0JBQXdCO0FBQUEsSUFDcEQ7QUFFQSxRQUFJLE1BQU0sTUFBTTtBQUNmLFlBQU0sSUFBSSxNQUFNLFNBQVMsRUFBRSxrQ0FBa0M7QUFBQSxJQUM5RDtBQUVBLFVBQU0sT0FBTztBQUNiLFdBQU8sYUFBYSxNQUFNO0FBQ3pCLFlBQU0sT0FBTztBQUFBLElBQ2QsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVBLGFBQWEsVUFBcUIsTUFBOEI7QUFDL0QsV0FBTztBQUFBLE1BQ04sS0FBSyxpQkFBaUIsUUFBUTtBQUFBLE1BQzlCLEtBQUssMkJBQTJCLFNBQVMsSUFBSSxJQUFJO0FBQUEsSUFDbEQ7QUFBQSxFQUNEO0FBQUEsRUFFQSxTQUFTLE9BQW9FO0FBQzVFLFVBQU0sWUFBWSxTQUFTLElBQUksS0FBSyxPQUFPLE9BQU8sR0FBRyxPQUFLLEVBQUUsSUFBSTtBQUNoRSxVQUFNLHdCQUF3QixLQUFLLHNCQUFzQixTQUFrQixrQkFBa0IscUJBQXFCO0FBQ2xILFdBQU8sU0FBUztBQUFBLE1BQ2Y7QUFBQSxNQUNBLGNBQVk7QUFDWCxjQUFNLHNCQUFzQixDQUFDLFNBQVMsUUFBUSxLQUFLLG1CQUFtQixvQkFBb0IsU0FBUyxJQUFJO0FBQ3ZHLGNBQU0sNkJBQTZCLFNBQVMsT0FBTyxTQUFTLGVBQWUsQ0FBQyxDQUFDO0FBQzdFLGNBQU0sMEJBQTBCLEtBQUssWUFBWSxRQUFRO0FBQ3pELGNBQU0sdUJBQXVCLEtBQUssc0JBQXNCLFVBQVUsS0FBSztBQUN2RSxlQUFPLHVCQUF1Qiw4QkFBOEIsMkJBQTJCO0FBQUEsTUFDeEY7QUFBQSxJQUFDO0FBQUEsRUFDSDtBQUFBLEVBRUEsYUFBYSxPQUFrRjtBQUM5RixVQUFNLE9BQU8sUUFBUSxZQUFVO0FBQzlCLFlBQU0sU0FBUyxpQkFBaUIscUJBQXFCO0FBQ3JELFlBQU0sVUFBVSxNQUFNLFlBQVksUUFBTSxPQUFPLFFBQVEsRUFBRSxDQUFDO0FBQzFELGFBQU8sTUFBTSxJQUFJLEtBQUssaUJBQWlCLE9BQU8sQ0FBQztBQUMvQyxhQUFPO0FBQUEsSUFDUixDQUFDO0FBRUQsV0FBTyxZQUFZLEVBQUUsVUFBVSxhQUFhLEVBQUUsR0FBRyxZQUFVO0FBQzFELFdBQUssS0FBSyxNQUFNLEVBQUUsS0FBSyxNQUFNO0FBQzdCLGFBQU8sTUFBTSxLQUFLLEtBQUssU0FBUyxLQUFLLENBQUM7QUFBQSxJQUN2QyxDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRUEsK0JBQW9EO0FBQ25ELFVBQU0sWUFBWSxTQUFTLElBQUksS0FBSyxPQUFPLE9BQU8sR0FBRyxPQUFLLEVBQUUsSUFBSTtBQUNoRSxVQUFNLHdCQUF3QixLQUFLLHNCQUFzQixTQUFrQixrQkFBa0IscUJBQXFCO0FBQ2xILFdBQU8sU0FBUztBQUFBLE1BQ2Y7QUFBQSxNQUNBLGNBQVk7QUFDWCxjQUFNLDZCQUE2QixTQUFTLE9BQU8sU0FBUyxlQUFlLENBQUMsQ0FBQztBQUM3RSxjQUFNLDBCQUEwQixLQUFLLFlBQVksUUFBUTtBQUN6RCxlQUFPLDhCQUE4QjtBQUFBLE1BQ3RDO0FBQUEsSUFBQztBQUFBLEVBQ0g7QUFBQSxFQUVBLFFBQVEsSUFBbUM7QUFDMUMsV0FBTyxLQUFLLE9BQU8sSUFBSSxFQUFFLEdBQUc7QUFBQSxFQUM3QjtBQUFBLEVBRUEsY0FBYyxNQUFxQztBQUNsRCxlQUFXLFFBQVEsS0FBSyw2QkFBNkIsR0FBRztBQUN2RCxVQUFJLEtBQUssc0JBQXNCLE1BQU07QUFDcEMsZUFBTztBQUFBLE1BQ1I7QUFBQSxJQUNEO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVRLHdCQUNQLEtBQ0EsWUFDQSxVQUNBLG1CQUNBLFNBQ2M7QUFDZCxVQUFNLGFBQWEsV0FBVyw0QkFBNEIsU0FBUyxzQkFBc0IsNEJBQTRCO0FBQ3JILFVBQU0sU0FBUyxTQUFTLDBCQUEwQiwyQkFBMkIsU0FBUyxZQUFZLFVBQVU7QUFDNUcsU0FBSyxZQUFZLE1BQU0sK0NBQStDLElBQUksTUFBTSwrQkFBK0IsVUFBVSxFQUFFO0FBRTNILFFBQUksVUFBVTtBQUNiLFVBQUksbUJBQW1CO0FBQ3RCLDBCQUFrQixlQUFlLDJCQUEyQjtBQUM1RCwwQkFBa0Isb0JBQW9CLGdCQUFnQixRQUFRLE1BQU07QUFBQSxNQUNyRSxXQUFXLFNBQVM7QUFDbkIsY0FBTSxzQkFBc0IsbUJBQW1CO0FBQUEsVUFDOUMsRUFBRSxZQUFZLElBQUksUUFBUSxRQUFRLElBQUksUUFBUSxVQUFVLHNCQUFzQixJQUFJLHNCQUFzQixlQUFlLElBQUksY0FBYztBQUFBLFVBQ3pJLElBQUk7QUFBQSxVQUNKLGdCQUFnQjtBQUFBLFVBQ2hCO0FBQUEsUUFDRDtBQUNBLDRCQUFvQixlQUFlLDJCQUEyQjtBQUM5RCxhQUFLLGFBQWEsZUFBZSxTQUFTLG1CQUFtQjtBQUFBLE1BQzlEO0FBQUEsSUFDRDtBQUVBLFdBQU87QUFBQSxNQUNOLFNBQVMsQ0FBQyxFQUFFLE1BQU0sUUFBUSxPQUFPLDBCQUEwQixVQUFVLEdBQUcsQ0FBQztBQUFBLE1BQ3pFLGlCQUFpQjtBQUFBLElBQ2xCO0FBQUEsRUFDRDtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQU9BLE1BQWMsc0JBQXNCLFFBQWdCLFVBQWlDLGNBQW1EO0FBQ3ZJLFFBQUksQ0FBQyxVQUFVLGFBQWE7QUFDM0IsYUFBTztBQUFBLElBQ1I7QUFTQSxRQUFJO0FBQ0gsWUFBTSxZQUFZLG9CQUFvQixNQUFNO0FBQzVDLFlBQU0sWUFBWSxLQUFLLFVBQVUsWUFBWTtBQUM3QyxZQUFNLGNBQWMsTUFBTSxLQUFLLGdCQUFnQixlQUFpQyxpQkFBaUIsV0FBVyxTQUFTLEtBQUssQ0FBQztBQUMzSCxVQUFJLFlBQVksU0FBUyxHQUFHO0FBQzNCLGVBQU8sWUFBWSxJQUFJLE9BQUssRUFBRSxPQUFPLEVBQUUsS0FBSyxJQUFJO0FBQUEsTUFDakQ7QUFBQSxJQUNELFNBQVMsR0FBRztBQUVYLFdBQUssWUFBWSxNQUFNLHdHQUF3RyxlQUFlLENBQUMsQ0FBQyxFQUFFO0FBQUEsSUFDbko7QUFFQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsTUFBTSxXQUFXLEtBQXNCLGFBQWtDLE9BQWdEO0FBQ3hILFNBQUssWUFBWSxNQUFNLHdEQUF3RCxJQUFJLE1BQU0sb0JBQW9CLEtBQUssVUFBVSxJQUFJLFVBQVUsQ0FBQyxFQUFFO0FBRTdJLFVBQU0sV0FBVyxLQUFLLE9BQU8sSUFBSSxJQUFJLE1BQU0sR0FBRztBQUM5QyxRQUFJO0FBQ0osUUFBSTtBQUNKLFFBQUksSUFBSSxTQUFTLGlCQUFpQjtBQUNqQyxjQUFRLEtBQUssYUFBYSxXQUFXLElBQUksUUFBUSxlQUFlO0FBQ2hFLGdCQUFVLE9BQU8sWUFBWSxFQUFFLEdBQUcsRUFBRTtBQUNwQyxVQUFJLFNBQVMsVUFBVSxjQUFjLFNBQVMsVUFBVSxZQUFZO0FBQ25FLGFBQUssWUFBWSxNQUFNLHdEQUF3RCxJQUFJLE1BQU0sbUNBQW1DLFFBQVEsRUFBRSxFQUFFO0FBQ3hJLGNBQU0sSUFBSSxrQkFBa0I7QUFBQSxNQUM3QjtBQUdBLFVBQUksT0FBTyxvQkFBb0IsQ0FBQyxJQUFJLFFBQVEsa0JBQWtCO0FBQzdELGNBQU0sRUFBRSxHQUFHLEtBQUssU0FBUyxFQUFFLEdBQUcsSUFBSSxTQUFTLGtCQUFrQixNQUFNLGlCQUFpQixFQUFFO0FBQUEsTUFDdkY7QUFBQSxJQUNEO0FBR0EsUUFBSTtBQUNKLFFBQUk7QUFDSixRQUFJLEtBQUssa0JBQWtCLElBQUksSUFBSSxNQUFNLEdBQUc7QUFDM0MsMkJBQXFCLElBQUk7QUFDekIsdUJBQWlCLEtBQUssa0JBQWtCLElBQUksSUFBSSxNQUFNO0FBQUEsSUFDdkQsV0FBVyxJQUFJLHdCQUF3QixLQUFLLGtCQUFrQixJQUFJLElBQUksb0JBQW9CLEdBQUc7QUFDNUYsMkJBQXFCLElBQUk7QUFDekIsdUJBQWlCLEtBQUssa0JBQWtCLElBQUksSUFBSSxvQkFBb0I7QUFBQSxJQUNyRTtBQUVBLFFBQUk7QUFDSixRQUFJO0FBQ0osUUFBSSxJQUFJLFdBQVcsU0FBUztBQUMzQixrQkFBWSxRQUFRO0FBQ3BCLGNBQVEsSUFBSSxnQkFBZ0I7QUFDNUIsVUFBSSxDQUFDLEtBQUssa0JBQWtCLElBQUksU0FBUyxHQUFHO0FBQzNDLGFBQUssa0JBQWtCLElBQUksV0FBVyxDQUFDLENBQUM7QUFBQSxNQUN6QztBQUNBLFlBQU0sY0FBNEIsRUFBRSxNQUFNO0FBQzFDLFdBQUssa0JBQWtCLElBQUksU0FBUyxFQUFHLEtBQUssV0FBVztBQUV2RCxZQUFNLFNBQVMsSUFBSSx3QkFBd0I7QUFDM0MsWUFBTSxJQUFJLGFBQWEsTUFBTTtBQUM1QixlQUFPLFFBQVEsSUFBSTtBQUFBLE1BQ3BCLENBQUMsQ0FBQztBQUNGLFlBQU0sSUFBSSxNQUFNLHlCQUF5QixNQUFNO0FBQzlDLDRCQUFvQixZQUFZLGdCQUFnQixFQUFFLE1BQU0sZ0JBQWdCLE9BQU8sQ0FBQztBQUNoRixlQUFPLE9BQU87QUFBQSxNQUNmLEVBQUUsQ0FBQztBQUNILFlBQU0sSUFBSSxPQUFPLE1BQU0sd0JBQXdCLE1BQU07QUFDcEQsNEJBQW9CLFlBQVksZ0JBQWdCLEVBQUUsTUFBTSxnQkFBZ0IsT0FBTyxDQUFDO0FBQUEsTUFDakYsQ0FBQyxDQUFDO0FBQ0YsY0FBUSxPQUFPO0FBQUEsSUFDaEI7QUFHQSxVQUFNLHVCQUF1QixJQUFJO0FBQ2pDLFFBQUksc0JBQXNCLHVCQUF1QixRQUFRO0FBQ3hELFlBQU0sZUFBZSxLQUFLLHdCQUF3QixLQUFLLHNCQUFzQixVQUFVLGdCQUFnQixPQUFPO0FBQzlHLFVBQUksb0JBQW9CO0FBQ3ZCLGFBQUssa0JBQWtCLE9BQU8sa0JBQWtCO0FBQUEsTUFDakQ7QUFDQSxhQUFPO0FBQUEsSUFDUjtBQUdBLFFBQUksc0JBQXNCLGNBQWM7QUFDdkMsWUFBTSxrQkFBa0IsTUFBTSxLQUFLLHNCQUFzQixJQUFJLFFBQVEsVUFBVSxxQkFBcUIsWUFBWTtBQUNoSCxVQUFJLGlCQUFpQjtBQUNwQixhQUFLLFlBQVksS0FBSywrQ0FBK0MsSUFBSSxNQUFNLGdFQUFnRSxlQUFlLEVBQUU7QUFBQSxNQUNqSyxPQUFPO0FBQ04sYUFBSyxZQUFZLE1BQU0sK0NBQStDLElBQUksTUFBTSxvQ0FBb0M7QUFDcEgsWUFBSSxhQUFhLHFCQUFxQjtBQUFBLE1BQ3ZDO0FBQUEsSUFDRDtBQUdBLFNBQUssaUJBQWlCLEtBQUs7QUFBQSxNQUMxQixRQUFRLElBQUk7QUFBQSxNQUNaLGlCQUFpQixJQUFJLFNBQVM7QUFBQSxNQUM5QixXQUFXLElBQUk7QUFBQSxNQUNmLHNCQUFzQixJQUFJO0FBQUEsSUFDM0IsQ0FBQztBQUdELFFBQUksT0FBTyxLQUFLLE9BQU8sSUFBSSxJQUFJLE1BQU07QUFDckMsUUFBSSxDQUFDLE1BQU07QUFDVixZQUFNLElBQUksTUFBTSxRQUFRLElBQUksTUFBTSxzQkFBc0I7QUFBQSxJQUN6RDtBQUVBLFFBQUksQ0FBQyxLQUFLLE1BQU07QUFDZixZQUFNLEtBQUssa0JBQWtCLGdCQUFnQix1QkFBdUIsSUFBSSxNQUFNLEVBQUU7QUFHaEYsYUFBTyxLQUFLLE9BQU8sSUFBSSxJQUFJLE1BQU07QUFDakMsVUFBSSxDQUFDLE1BQU0sTUFBTTtBQUNoQixjQUFNLElBQUksTUFBTSxRQUFRLElBQUksTUFBTSw4Q0FBOEM7QUFBQSxNQUNqRjtBQUFBLElBQ0Q7QUFHQSxVQUFNLHVCQUF1QixDQUFDLENBQUM7QUFDL0IsUUFBSSx3QkFBd0Isb0JBQW9CO0FBRS9DLFdBQUssa0JBQWtCLE9BQU8sa0JBQWtCO0FBQUEsSUFDakQ7QUFFQSxRQUFJO0FBQ0osUUFBSTtBQUNKLFFBQUk7QUFDSixRQUFJO0FBQ0osUUFBSSxhQUFhO0FBQ2pCLFFBQUk7QUFDSCxVQUFJLElBQUksU0FBUztBQUNoQixZQUFJLENBQUMsT0FBTztBQUNYLGdCQUFNLElBQUksTUFBTSxzQ0FBc0M7QUFBQSxRQUN2RDtBQUVBLFlBQUksQ0FBQyxTQUFTO0FBQ2IsZ0JBQU0sSUFBSSxNQUFNLHNDQUFzQztBQUFBLFFBQ3ZEO0FBQ0EsWUFBSSxVQUFVLFFBQVE7QUFDdEIsWUFBSSxvQkFBb0IsUUFBUSxxQkFBcUIsRUFBRSxHQUFHLFFBQVEsa0JBQWtCO0FBRXBGLDJCQUFtQixVQUFVLE9BQU8sSUFBSTtBQUN4Qyw2QkFBcUIsTUFBTSxLQUFLLG9DQUFvQyxNQUFNLEtBQUssc0JBQXNCLEtBQUs7QUFDMUcseUJBQWlCLEtBQUs7QUFFdEIsY0FBTSxFQUFFLGVBQWUsdUJBQXVCLG9CQUFvQiwwQkFBMEIsSUFBSSxNQUFNLEtBQUssMkJBQTJCLHNCQUFzQixNQUFNLEtBQUssb0JBQW9CLElBQUksU0FBUyxlQUFlO0FBQ3ZOLDZCQUFxQjtBQU9yQixjQUFNLDJCQUEyQiwwQkFDNUIsc0JBQXNCLHVCQUF1QixRQUFRLFNBQVksSUFBSTtBQUsxRSxjQUFNLEVBQUUsZUFBZSxpQkFBaUIsb0JBQW9CLElBQUksTUFBTSxLQUFLLDZCQUE2QixNQUFNLEtBQUssb0JBQW9CLDBCQUEwQixLQUFLO0FBS3RLLFlBQUksd0JBQXdCLGdCQUFnQjtBQUMzQyxjQUFJLGVBQWUsTUFBTSxJQUFJLEVBQUUsU0FBUyxvQkFBb0IsVUFBVSxXQUFXO0FBQ2hGLDJCQUFlLHdCQUF3QixvQkFBb0IsSUFBSSxZQUFZLGFBQWE7QUFBQSxVQUN6RixPQUFPO0FBQ04sMkJBQWUseUJBQXlCLG9CQUFvQixJQUFJLFVBQVU7QUFBQSxVQUMzRTtBQUFBLFFBQ0QsT0FBTztBQUVOLDJCQUFpQixJQUFJLG1CQUFtQixvQkFBb0IsS0FBSyxNQUFNLElBQUksd0JBQXdCLElBQUksUUFBUSxJQUFJLHNCQUFzQixJQUFJLFVBQVU7QUFDdkosY0FBSSxlQUFlO0FBQ2xCLGdDQUFvQixZQUFZLGdCQUFnQixhQUFhO0FBQUEsVUFDOUQ7QUFFQSxlQUFLLGFBQWEsZUFBZSxTQUFTLGNBQWM7QUFBQSxRQUN6RDtBQUVBLFlBQUksbUJBQW1CLGdCQUFnQjtBQUt2QyxZQUFJLHFCQUFxQjtBQUN4QixlQUFLLDBCQUEwQixNQUFNLEtBQUssRUFBRSxNQUFNLGdCQUFnQixRQUFRLENBQUM7QUFHM0UsZUFBSyxhQUFhLGVBQWUsU0FBUztBQUFBLFlBQ3pDLE1BQU07QUFBQSxZQUNOLFNBQVMsSUFBSSxlQUFlLFNBQVMsd0JBQXdCLHFFQUF1RSxLQUFLLEtBQUssYUFBYSxtQkFBbUIsQ0FBQztBQUFBLFVBQ2hMLENBQUM7QUFDRCx1QkFBYTtBQUFBLFlBQ1osU0FBUyxDQUFDO0FBQUEsY0FDVCxNQUFNO0FBQUEsY0FDTixPQUFPLHdGQUF3RixtQkFBbUI7QUFBQSxZQUNuSCxDQUFDO0FBQUEsVUFDRjtBQUNBLGlCQUFPO0FBQUEsUUFDUjtBQUNBLFlBQUksb0JBQW9CLHNCQUFzQixPQUFPO0FBQ3BELGNBQUksQ0FBQyxvQkFBb0IsMkJBQTJCLGNBQWMsS0FBSyxDQUFDLGVBQWU7QUFDdEYsaUJBQUssd0JBQXdCLENBQUMsY0FBYyxHQUFHLElBQUksU0FBUyxlQUFlO0FBQUEsVUFDNUU7QUFDQSxnQkFBTSxnQkFBZ0IsTUFBTSxvQkFBb0Isa0JBQWtCLGdCQUFnQixLQUFLO0FBQ3ZGLGVBQUssMEJBQTBCLE1BQU0sS0FBSyxhQUFhO0FBQ3ZELGNBQUksY0FBYyxTQUFTLGdCQUFnQixRQUFRO0FBQ2xELGtCQUFNLElBQUksa0JBQWtCO0FBQUEsVUFDN0I7QUFDQSxjQUFJLGNBQWMsU0FBUyxnQkFBZ0IsU0FBUztBQUNuRCx5QkFBYTtBQUFBLGNBQ1osU0FBUyxDQUFDO0FBQUEsZ0JBQ1QsTUFBTTtBQUFBLGdCQUNOLE9BQU87QUFBQSxjQUNSLENBQUM7QUFBQSxZQUNGO0FBQ0EsbUJBQU87QUFBQSxVQUNSO0FBQ0EsY0FBSSxjQUFjLFNBQVMsZ0JBQWdCLGNBQWMsY0FBYyxnQkFBZ0I7QUFDdEYsZ0JBQUksdUJBQXVCLGNBQWM7QUFBQSxVQUMxQztBQUVBLGNBQUksSUFBSSxrQkFBa0IsU0FBUyxTQUFTO0FBQzNDLGdCQUFJLGFBQWEsSUFBSSxpQkFBaUI7QUFDdEMsZ0JBQUksbUJBQW1CO0FBQUEsVUFDeEI7QUFBQSxRQUNELE9BQU87QUFDTixlQUFLLDBCQUEwQixNQUFNLEtBQUssaUJBQWlCLEVBQUUsTUFBTSxnQkFBZ0Isc0JBQXNCLENBQUM7QUFBQSxRQUMzRztBQUFBLE1BQ0QsT0FBTztBQUNOLDJCQUFtQixVQUFVLE9BQU8sSUFBSTtBQUN4Qyw2QkFBcUIsTUFBTSxLQUFLLG9DQUFvQyxNQUFNLEtBQUssc0JBQXNCLEtBQUs7QUFDMUcseUJBQWlCLEtBQUs7QUFFdEIsY0FBTSxFQUFFLGVBQWUsdUJBQXVCLG9CQUFvQiwwQkFBMEIsSUFBSSxNQUFNLEtBQUssMkJBQTJCLHNCQUFzQixNQUFNLEtBQUssb0JBQW9CLE1BQVM7QUFDcE0sNkJBQXFCO0FBQ3JCLGNBQU0sZ0JBQWdCLDBCQUNqQixzQkFBc0IsdUJBQXVCLFFBQVEsU0FBWSxJQUFJO0FBQzFFLFlBQUksb0JBQW9CLHNCQUFzQixTQUFTLENBQUMsZUFBZTtBQUN0RSxnQkFBTSxTQUFTLE1BQU0sS0FBSyxlQUFlLFFBQVEsRUFBRSxTQUFTLGtCQUFrQixtQkFBbUIscUJBQXFCLEtBQUssR0FBRyxRQUFRLGtCQUFrQixtQkFBbUIscUJBQXFCLE9BQVEsRUFBRSxDQUFDO0FBQzNNLGNBQUksQ0FBQyxPQUFPLFdBQVc7QUFDdEIsa0JBQU0sSUFBSSxrQkFBa0I7QUFBQSxVQUM3QjtBQUFBLFFBQ0Q7QUFDQSxZQUFJLG1CQUFtQixvQkFBb0I7QUFBQSxNQUM1QztBQUVBLFVBQUksTUFBTSx5QkFBeUI7QUFDbEMsY0FBTSxJQUFJLGtCQUFrQjtBQUFBLE1BQzdCO0FBRUEsNEJBQXNCLFVBQVUsT0FBTyxJQUFJO0FBQzNDLFlBQU0sY0FBYyxLQUFLLE9BQU8sSUFBSSxJQUFJLE1BQU07QUFDOUMsVUFBSSxDQUFDLGFBQWE7QUFDakIsY0FBTSxJQUFJLE1BQU0sUUFBUSxJQUFJLE1BQU0sc0JBQXNCO0FBQUEsTUFDekQ7QUFDQSxVQUFJLENBQUMsWUFBWSxNQUFNO0FBQ3RCLGNBQU0sSUFBSSxNQUFNLFFBQVEsSUFBSSxNQUFNLDhDQUE4QztBQUFBLE1BQ2pGO0FBQ0EsbUJBQWE7QUFDYixtQkFBYSxNQUFNLFlBQVksS0FBSyxPQUFPLEtBQUssYUFBYTtBQUFBLFFBQzVELFFBQVEsVUFBUTtBQUNmLDBCQUFnQixlQUFlLElBQUk7QUFBQSxRQUNwQztBQUFBLE1BQ0QsR0FBRyxLQUFLO0FBQ1IsMEJBQW9CLEtBQUs7QUFJekIsWUFBTSxhQUFhLEtBQUssc0JBQXNCLGNBQWMsV0FBVyxLQUFLLElBQUksSUFBSSxZQUFZLFVBQVU7QUFDMUcsVUFBSSxZQUFZO0FBQ2YscUJBQWE7QUFBQSxNQUNkO0FBQ0EsV0FBSyxrQkFBa0IsS0FBSyxZQUFZLFdBQVcsTUFBTSxjQUFjO0FBRXZFLFlBQU0sb0JBQW9CLE1BQU0sZ0JBQWdCLGVBQWUsWUFBWSxRQUFXLE1BQ3JGLEtBQUssK0JBQStCLFdBQVcsS0FBSyxJQUFJLFdBQVcsS0FBSyxpQkFBaUIsV0FBVyxLQUFLLFFBQVEsSUFBSSxZQUFZLElBQUksU0FBUyxpQkFBaUIsSUFBSSxlQUFlLElBQUksU0FBUyxnQkFBZ0IsQ0FBQztBQUVqTixVQUFJLGtCQUFrQixtQkFBbUIsU0FBUyxvQkFBb0IsVUFBVSx3QkFBd0I7QUFDdkcsY0FBTSxjQUFjLE1BQU0sb0JBQW9CLHNCQUFzQixnQkFBZ0IsS0FBSztBQUN6RixZQUFJLFlBQVksU0FBUyxnQkFBZ0IsUUFBUTtBQUNoRCxnQkFBTSxJQUFJLGtCQUFrQjtBQUFBLFFBQzdCO0FBQ0EsWUFBSSxZQUFZLFNBQVMsZ0JBQWdCLFNBQVM7QUFDakQsdUJBQWE7QUFBQSxZQUNaLFNBQVMsQ0FBQztBQUFBLGNBQ1QsTUFBTTtBQUFBLGNBQ04sT0FBTztBQUFBLFlBQ1IsQ0FBQztBQUFBLFVBQ0Y7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUVBLFdBQUssa0JBQWtCO0FBQUEsUUFDdEI7QUFBQSxRQUNBO0FBQUEsVUFDQyxRQUFRO0FBQUEsVUFDUixlQUFlLElBQUksU0FBUyxrQkFBa0Isd0JBQXdCLElBQUksUUFBUSxlQUFlLElBQUk7QUFBQSxVQUNyRyxRQUFRLFdBQVcsS0FBSztBQUFBLFVBQ3hCLGlCQUFpQixXQUFXLEtBQUssT0FBTyxTQUFTLGNBQWMsV0FBVyxLQUFLLE9BQU8sWUFBWSxRQUFRO0FBQUEsVUFDMUcsZ0JBQWdCLFdBQVcsS0FBSyxPQUFPO0FBQUEsVUFDdkMsZUFBZSxrQkFBa0IsUUFBUTtBQUFBLFVBQ3pDLGtCQUFrQixxQkFBcUIsUUFBUTtBQUFBLFFBQ2hEO0FBQUEsTUFBQztBQUNGLGFBQU87QUFBQSxJQUNSLFNBQVMsS0FBSztBQUNiLFlBQU0sU0FBUyxvQkFBb0IsR0FBRyxJQUFJLGtCQUFrQjtBQUM1RCxXQUFLLGtCQUFrQjtBQUFBLFFBQ3RCO0FBQUEsUUFDQTtBQUFBLFVBQ0M7QUFBQSxVQUNBLGVBQWUsSUFBSSxTQUFTLGtCQUFrQix3QkFBd0IsSUFBSSxRQUFRLGVBQWUsSUFBSTtBQUFBLFVBQ3JHLFFBQVEsV0FBVyxLQUFLO0FBQUEsVUFDeEIsaUJBQWlCLFdBQVcsS0FBSyxPQUFPLFNBQVMsY0FBYyxXQUFXLEtBQUssT0FBTyxZQUFZLFFBQVE7QUFBQSxVQUMxRyxnQkFBZ0IsV0FBVyxLQUFLLE9BQU87QUFBQSxVQUN2QyxlQUFlLGtCQUFrQixRQUFRO0FBQUEsVUFDekMsa0JBQWtCLHFCQUFxQixRQUFRO0FBQUEsUUFDaEQ7QUFBQSxNQUFDO0FBQ0YsVUFBSSxDQUFDLG9CQUFvQixHQUFHLEdBQUc7QUFDOUIsYUFBSyxZQUFZLE1BQU0sMERBQTBELElBQUksTUFBTSxvQkFBb0IsS0FBSyxVQUFVLElBQUksVUFBVSxDQUFDO0FBQUEsRUFBTSxlQUFlLEtBQUssSUFBSSxDQUFDLEVBQUU7QUFBQSxNQUMvSztBQUVBLHFCQUFlLEVBQUUsU0FBUyxDQUFDLEVBQUU7QUFDN0IsaUJBQVcsa0JBQWtCLGVBQWUsUUFBUSxJQUFJLFVBQVUsT0FBTyxHQUFHO0FBQzVFLFVBQUksV0FBVyxLQUFLLDBCQUEwQjtBQUM3QyxtQkFBVyxvQkFBb0IsRUFBRSxPQUFPLEtBQUssZ0JBQWdCLEdBQUcsR0FBRyxRQUFRLENBQUMsRUFBRSxNQUFNLFNBQVMsUUFBUSxNQUFNLE9BQU8sT0FBTyxHQUFHLEVBQUUsQ0FBQyxHQUFHLFNBQVMsS0FBSztBQUFBLE1BQ2pKO0FBRUEsWUFBTTtBQUFBLElBQ1AsVUFBRTtBQUNELHNCQUFnQixlQUFlLFlBQVksSUFBSTtBQUMvQyxVQUFJLE9BQU87QUFDVixhQUFLLHVCQUF1QixXQUFXLEtBQUs7QUFBQSxNQUM3QztBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUEsRUFFQSxNQUFjLG9DQUFvQyxNQUFrQixLQUFzQixZQUF1RCxPQUF3RTtBQUN4TixRQUFJO0FBQ0osUUFBSSxZQUFZLHVCQUF1QixPQUFPO0FBQzdDLFlBQU0sY0FBYyxTQUFTLHNDQUFzQyw2QkFBNkIsU0FBUyxVQUFVO0FBQ25ILGdDQUEwQixXQUFXLDJCQUNsQyxHQUFHLFdBQVcsS0FBSyxXQUFXLHdCQUF3QixLQUN0RDtBQUFBLElBQ0o7QUFDQSxXQUFPLEtBQUssc0JBQXNCLE1BQU0sS0FBSyx5QkFBeUIsS0FBSztBQUFBLEVBQzVFO0FBQUEsRUFFUSwwQkFBMEIsTUFBa0IsS0FBc0IsUUFBK0I7QUFDeEcsVUFBTSxtQkFBb0Q7QUFBQSxNQUN6RCxDQUFDLGdCQUFnQixNQUFNLEdBQUc7QUFBQSxNQUMxQixDQUFDLGdCQUFnQixxQkFBcUIsR0FBRztBQUFBLE1BQ3pDLENBQUMsZ0JBQWdCLE9BQU8sR0FBRztBQUFBLE1BQzNCLENBQUMsZ0JBQWdCLGdCQUFnQixHQUFHO0FBQUEsTUFDcEMsQ0FBQyxnQkFBZ0IsVUFBVSxHQUFHO0FBQUEsTUFDOUIsQ0FBQyxnQkFBZ0IsT0FBTyxHQUFHO0FBQUEsSUFDNUI7QUFDQSxVQUFNLHNDQUFzQyxvQkFBSSxJQUFJLENBQUMsc0JBQXNCLFlBQVksQ0FBQztBQUN4RixRQUFJO0FBQ0osUUFBSSxPQUFPLFNBQVMsZ0JBQWdCLHlCQUF5QixPQUFPLFFBQVE7QUFDM0UsWUFBTSxNQUFNLE9BQU8sT0FBTyxXQUFXLFdBQVcsT0FBTyxTQUFTLE9BQU8sT0FBTztBQUM5RSxvQ0FBOEIsb0NBQW9DLElBQUksR0FBRyxJQUFJLE1BQU07QUFBQSxJQUNwRjtBQUNBLFVBQU0sZUFBZSxJQUFJLGtCQUFrQixTQUFTLGFBQWEsSUFBSSxtQkFBbUI7QUFDeEYsU0FBSyxrQkFBa0I7QUFBQSxNQUN0QjtBQUFBLE1BQ0E7QUFBQSxRQUNDLGFBQWEsaUJBQWlCLE9BQU8sSUFBSTtBQUFBLFFBQ3pDLFdBQVcsSUFBSTtBQUFBLFFBQ2YsV0FBVyxPQUFPLFNBQVMsZ0JBQWdCLFVBQVUsT0FBTyxLQUFLO0FBQUEsUUFDakUsZ0JBQWdCLE9BQU8sU0FBUyxnQkFBZ0IsbUJBQW1CLE9BQU8sUUFBUTtBQUFBLFFBQ2xGLGtCQUFrQixPQUFPLFNBQVMsZ0JBQWdCLGFBQWEsT0FBTyxxQkFBcUI7QUFBQSxRQUMzRjtBQUFBLFFBQ0EsZ0JBQWdCLGNBQWMsWUFBWTtBQUFBLFFBQzFDLDZCQUE2QixjQUFjO0FBQUEsUUFDM0MsZUFBZSxJQUFJLFNBQVMsa0JBQWtCLHdCQUF3QixJQUFJLFFBQVEsZUFBZSxJQUFJO0FBQUEsUUFDckcsUUFBUSxLQUFLLEtBQUs7QUFBQSxRQUNsQixpQkFBaUIsS0FBSyxLQUFLLE9BQU8sU0FBUyxjQUFjLEtBQUssS0FBSyxPQUFPLFlBQVksUUFBUTtBQUFBLFFBQzlGLGdCQUFnQixLQUFLLEtBQUssT0FBTztBQUFBLE1BQ2xDO0FBQUEsSUFBQztBQUFBLEVBQ0g7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQVdBLE1BQWMsMkJBQ2IsWUFDQSxNQUNBLEtBQ0Esb0JBQ0EsaUJBQ21IO0FBQ25ILFFBQUksWUFBWSx1QkFBdUIsU0FBUztBQUMvQyxXQUFLLFlBQVksTUFBTSwrQ0FBK0MsSUFBSSxNQUFNLG1DQUFtQztBQUNuSCxhQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sZ0JBQWdCLHVCQUF1QixRQUFRLFNBQVMsZUFBZSxpQkFBaUIsRUFBRSxHQUFHLG1CQUFtQjtBQUFBLElBQ2pKO0FBRUEsUUFBSSxZQUFZLHVCQUF1QixPQUFPO0FBQzdDLFdBQUssWUFBWSxNQUFNLCtDQUErQyxJQUFJLE1BQU0seURBQXlEO0FBRXpJLFVBQUksQ0FBQyxvQkFBb0Isc0JBQXNCLE9BQU87QUFDckQsWUFBSSxDQUFDLG9CQUFvQjtBQUN4QiwrQkFBcUIsQ0FBQztBQUFBLFFBQ3ZCO0FBQ0EsY0FBTSxvQkFBb0IseUJBQXlCLEtBQUssSUFBSTtBQUM1RCxjQUFNLGFBQWEsV0FBVztBQUM5QixjQUFNLFdBQVcsYUFDZCxTQUFTLDhDQUE4Qyx1Q0FBdUMsU0FBUyxZQUFZLFVBQVUsSUFDN0gsU0FBUyxvQ0FBb0Msa0NBQWtDLFNBQVMsVUFBVTtBQUNyRywyQkFBbUIsdUJBQXVCO0FBQUEsVUFDekMsR0FBRyxtQkFBbUI7QUFBQSxVQUN0QixPQUFPLFNBQVMsa0NBQWtDLHVCQUF1QixpQkFBaUI7QUFBQSxVQUMxRixTQUFTLElBQUksZUFBZSxJQUFJLFFBQVEsR0FBRztBQUFBLFVBQzNDLGtCQUFrQjtBQUFBLFFBQ25CO0FBQ0EsMkJBQW1CLG1CQUFtQjtBQUFBLFVBQ3JDLE1BQU07QUFBQSxVQUNOLFVBQVUsSUFBSTtBQUFBLFFBQ2Y7QUFBQSxNQUNELE9BQU87QUFFTixjQUFNLGFBQWEsV0FBVztBQUM5QixjQUFNLFdBQVcsYUFDZCxTQUFTLGlDQUFpQyx1Q0FBdUMsU0FBUyxZQUFZLFVBQVUsSUFDaEgsU0FBUyx5Q0FBeUMsa0NBQWtDLFNBQVMsVUFBVTtBQUUxRyxjQUFNLFdBQVcsbUJBQW1CO0FBQ3BDLFlBQUksbUJBQW1CLGtCQUFrQixTQUFTLFlBQVk7QUFFN0QsZ0JBQU0seUJBQXlCLFNBQVMsYUFDcEMsT0FBTyxTQUFTLGVBQWUsV0FBVyxTQUFTLGFBQWEsU0FBUyxXQUFXLFFBQ3JGO0FBQ0gsZ0JBQU0scUJBQXFCLHlCQUN4QixHQUFHLFFBQVE7QUFBQTtBQUFBLEVBQU8sc0JBQXNCLEtBQ3hDO0FBQ0gsNkJBQW1CLHVCQUF1QjtBQUFBLFlBQ3pDLEdBQUc7QUFBQSxZQUNILFlBQVk7QUFBQSxZQUNaLGtCQUFrQjtBQUFBLFVBQ25CO0FBQUEsUUFDRCxPQUFPO0FBRU4sZ0JBQU0sVUFBVSxPQUFPLFNBQVMsWUFBWSxXQUFXLFNBQVMsVUFBVSxTQUFTLFNBQVMsU0FBUztBQUNyRyw2QkFBbUIsdUJBQXVCO0FBQUEsWUFDekMsR0FBRztBQUFBLFlBQ0gsU0FBUyxJQUFJLGVBQWUsSUFBSSxRQUFRO0FBQUE7QUFBQSxFQUFRLE9BQU8sRUFBRTtBQUFBLFlBQ3pELGtCQUFrQjtBQUFBLFVBQ25CO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFDQSxhQUFPLEVBQUUsZUFBZSxRQUFXLG1CQUFtQjtBQUFBLElBQ3ZEO0FBR0EsVUFBTSxxQkFBcUIsb0JBQW9CLHNCQUFzQjtBQUNyRSxRQUFJO0FBQ0osUUFBSSxvQkFBb0I7QUFDdkIsb0JBQWM7QUFBQSxRQUNiLE9BQU8sT0FBTyxtQkFBbUIsVUFBVSxXQUFXLG1CQUFtQixRQUFRLG1CQUFtQixNQUFNO0FBQUEsUUFDMUcsS0FBSyxtQkFBbUI7QUFBQSxNQUN6QjtBQUFBLElBQ0Q7QUFDQSxVQUFNLGdCQUFnQixNQUFNLEtBQUssa0JBQWtCLEtBQUssS0FBSyxJQUFJLEtBQUssS0FBSyxpQkFBaUIsS0FBSyxLQUFLLFFBQVEsSUFBSSxZQUFZLGlCQUFpQixJQUFJLGVBQWUsYUFBYSxJQUFJLFNBQVMsZ0JBQWdCO0FBQzVNLFdBQU8sRUFBRSxlQUFlLG1CQUFtQjtBQUFBLEVBQzVDO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQXFCQSxNQUFjLDZCQUNiLE1BQ0EsS0FDQSxvQkFDQSxlQUNBLE9BQ29GO0FBQ3BGLFVBQU0saUJBQWlCLEtBQUssS0FBSyxPQUFPLGVBQWU7QUFDdkQsVUFBTSxjQUFjLG9CQUFvQixJQUFJLEtBQUssS0FBSyxFQUFFO0FBQ3hELFVBQU0sdUJBQXVCLGtCQUFrQjtBQVUvQyxVQUFNLDBCQUEwQixlQUFlLFNBQVMsZ0JBQWdCLHlCQUNwRSxjQUFjLFdBQVc7QUFDN0IsVUFBTSwrQkFBK0Isd0JBQ2pDLGtCQUFrQixVQUNsQixDQUFDLG9CQUFvQixzQkFBc0I7QUFDL0MsUUFBSSxDQUFDLDJCQUEyQixDQUFDLDhCQUE4QjtBQUM5RCxhQUFPLEVBQUUsY0FBYztBQUFBLElBQ3hCO0FBR0EsUUFBSSxDQUFDLHdCQUF3QixDQUFDLG9CQUFvQixzQkFBc0IsT0FBTztBQUM5RSxhQUFPLEVBQUUsY0FBYztBQUFBLElBQ3hCO0FBS0EsUUFBSSxLQUFLLHNCQUFzQixTQUFrQixrQkFBa0Isd0JBQXdCLE1BQU0sTUFBTTtBQUN0RyxhQUFPLEVBQUUsY0FBYztBQUFBLElBQ3hCO0FBSUEsVUFBTSxrQkFBa0IsSUFBSSxTQUFTO0FBQ3JDLFFBQUksQ0FBQyxtQkFBbUIsbUJBQW1CLGVBQWUsTUFBTSxzQkFBc0I7QUFDckYsYUFBTyxFQUFFLGNBQWM7QUFBQSxJQUN4QjtBQUNBLFFBQUksQ0FBQyxLQUFLLDJCQUEyQixlQUFlLEdBQUc7QUFDdEQsYUFBTyxFQUFFLGNBQWM7QUFBQSxJQUN4QjtBQUVBLFFBQUk7QUFFSCxZQUFNLGFBQWEsTUFBTSxLQUFLLHVCQUF1QixPQUFPLEtBQUssTUFBTSxJQUFJLFlBQVksT0FBTyxRQUFXLEVBQUUsa0JBQWtCLEtBQUssQ0FBQztBQUNuSSxVQUFJLE1BQU0seUJBQXlCO0FBQ2xDLGVBQU8sRUFBRSxjQUFjO0FBQUEsTUFDeEI7QUFDQSxVQUFJLFlBQVksU0FBUyxjQUFjLEtBQUs7QUFDM0MsY0FBTSxzQkFBc0IsU0FBUyw2QkFBNkIscUVBQXFFO0FBQ3ZJLGNBQU0sY0FBYyxXQUFXLFlBQVksS0FBSyxLQUFLO0FBQ3JELGFBQUssWUFBWSxLQUFLLDRFQUE0RSxLQUFLLEtBQUssRUFBRSxLQUFLLFdBQVcsRUFBRTtBQUNoSSxlQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sZ0JBQWdCLFFBQVEsR0FBRyxpQkFBaUIsWUFBWTtBQUFBLE1BQ3pGO0FBQUEsSUFDRCxTQUFTLEtBQUs7QUFDYixXQUFLLFlBQVksS0FBSyxvRkFBb0YsS0FBSyxLQUFLLEVBQUUsZUFBZSxlQUFlLEdBQUcsQ0FBQyxFQUFFO0FBQUEsSUFDM0o7QUFHQSxXQUFPLEVBQUUsY0FBYztBQUFBLEVBQ3hCO0FBQUEsRUFFQSxNQUFjLHNCQUFzQixNQUFrQixLQUFzQix5QkFBNkMsT0FBd0U7QUFDaE0sUUFBSTtBQUNKLFFBQUksS0FBSyxLQUFNLHVCQUF1QjtBQUNyQyxZQUFNLGlCQUFpQixLQUFLLEtBQU0sc0JBQXNCO0FBQUEsUUFDdkQsWUFBWSxJQUFJO0FBQUEsUUFDaEIsWUFBWSxJQUFJO0FBQUEsUUFDaEIsZUFBZSxJQUFJO0FBQUEsUUFDbkIscUJBQXFCLElBQUksU0FBUztBQUFBLFFBQ2xDLG1CQUFtQixJQUFJO0FBQUEsUUFDdkIsU0FBUyxJQUFJO0FBQUEsUUFDYjtBQUFBLFFBQ0Esa0JBQWtCLElBQUksU0FBUztBQUFBLE1BQ2hDLEdBQUcsS0FBSztBQUVSLFlBQU0sYUFBYSxNQUFNLFFBQVEsS0FBSztBQUFBLFFBQ3JDLFFBQVEsS0FBTSxLQUFLLEVBQUUsS0FBSyxNQUFNLFNBQVM7QUFBQSxRQUN6QztBQUFBLE1BQ0QsQ0FBQztBQUNELFVBQUksZUFBZSxhQUFhLElBQUksU0FBUztBQUM1QyxhQUFLLHdDQUF3QyxLQUFLO0FBQUEsVUFDakQsaUJBQWlCLElBQUksUUFBUTtBQUFBLFVBQzdCLFVBQVUsS0FBSztBQUFBLFFBQ2hCLENBQUM7QUFBQSxNQUNGO0FBRUEsaUJBQVcsTUFBTTtBQUFBLElBQ2xCO0FBRUEsVUFBTSw0QkFBNEIsS0FBSyw4QkFBOEIsS0FBSyxJQUFJO0FBRzlFLFFBQUksQ0FBQyw2QkFBNkIsQ0FBQyxVQUFVLHNCQUFzQixPQUFPO0FBQ3pFLFVBQUksQ0FBQyxVQUFVO0FBQ2QsbUJBQVcsQ0FBQztBQUFBLE1BQ2I7QUFDQSxZQUFNLG9CQUFvQix5QkFBeUIsS0FBSyxJQUFJO0FBRzVELGVBQVMsdUJBQXVCO0FBQUEsUUFDL0IsR0FBRyxTQUFTO0FBQUEsUUFDWixPQUFPLFNBQVMsaUNBQWlDLHdCQUF3QjtBQUFBLFFBQ3pFLFNBQVMsU0FBUyxtQ0FBbUMsdUJBQXlCLGlCQUFpQjtBQUFBLFFBQy9GLFlBQVksZ0NBQWdDLElBQUksS0FBSyxLQUFLLEVBQUUsSUFBSSxTQUFZLElBQUksZUFBZSxTQUFTLHNDQUFzQyxrREFBb0QseUJBQXlCLEtBQUssSUFBSSxHQUFHLDBCQUEwQixFQUFFLE1BQU0sTUFBTSxrQkFBa0IsMEJBQTBCLEtBQUssSUFBSSxpQ0FBaUMsV0FBVyxDQUFDLGtCQUFrQix1QkFBdUIsR0FBRyxTQUFTLFNBQVMscUNBQXFDLDBDQUEwQyxFQUFFLEdBQUcsS0FBSyxDQUFDLEdBQUcsRUFBRSxXQUFXLEtBQUssQ0FBQztBQUFBLFFBQy9oQixrQkFBa0I7QUFBQSxNQUNuQjtBQUFBLElBQ0Q7QUFFQSxRQUFJLENBQUMsNkJBQTZCLFVBQVUsc0JBQXNCLE9BQU87QUFFeEUsZUFBUyxxQkFBcUIsYUFBYSxnQ0FBZ0MsSUFBSSxLQUFLLEtBQUssRUFBRSxJQUFJLFNBQVksSUFBSSxlQUFlLFNBQVMsc0NBQXNDLGtEQUFvRCx5QkFBeUIsS0FBSyxJQUFJLEdBQUcsMEJBQTBCLEVBQUUsTUFBTSxNQUFNLGtCQUFrQiwwQkFBMEIsS0FBSyxJQUFJLGlDQUFpQyxXQUFXLENBQUMsa0JBQWtCLHVCQUF1QixHQUFHLFNBQVMsU0FBUyxxQ0FBcUMsMENBQTBDLEVBQUUsR0FBRyxLQUFLLENBQUMsR0FBRyxFQUFFLFdBQVcsS0FBSyxDQUFDO0FBQUEsSUFDL2pCO0FBRUEsUUFBSSxVQUFVLHNCQUFzQixPQUFPO0FBQzFDLFVBQUksU0FBUyxrQkFBa0IsU0FBUyxjQUFjLFNBQVMscUJBQXFCLHFCQUFxQixPQUFPO0FBQy9HLGlCQUFTLHFCQUFxQixtQkFBbUI7QUFBQSxNQUNsRDtBQUVBLFVBQUksQ0FBQyxTQUFTLG9CQUFvQixLQUFLLEtBQUssMEJBQTBCO0FBQ3JFLGlCQUFTLG1CQUFtQjtBQUFBLFVBQzNCLE1BQU07QUFBQSxVQUNOLFVBQVUsSUFBSTtBQUFBLFFBQ2Y7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUVBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxjQUFjLFNBQWlFO0FBRzlFLFVBQU0sWUFBWSxLQUFLLE9BQU8sSUFBSSxRQUFRLE1BQU07QUFDaEQsUUFBSSxDQUFDLFdBQVc7QUFDZixhQUFPO0FBQUEsSUFDUjtBQUtBLFFBQUksQ0FBQyxRQUFRLFNBQVMsQ0FBQyxVQUFVLE1BQU0sa0JBQWtCO0FBQ3hELGFBQU87QUFBQSxJQUNSO0FBR0EsVUFBTSxhQUFhLG1CQUFtQixnQkFBZ0I7QUFBQSxNQUNyRCxZQUFZLFFBQVE7QUFBQSxNQUNwQixRQUFRLFFBQVE7QUFBQSxNQUNoQixVQUFVLFVBQVU7QUFBQSxNQUNwQixzQkFBc0IsUUFBUTtBQUFBLE1BQzlCLGVBQWUsUUFBUTtBQUFBLElBQ3hCLENBQUM7QUFHRCxTQUFLLGtCQUFrQixJQUFJLFFBQVEsWUFBWSxVQUFVO0FBR3pELFFBQUksUUFBUSxpQkFBaUI7QUFDNUIsWUFBTSxRQUFRLEtBQUssYUFBYSxXQUFXLFFBQVEsZUFBZTtBQUNsRSxVQUFJLE9BQU87QUFFVixjQUFNLFdBQVcsUUFBUSxnQkFDdEIsTUFBTSxZQUFZLEVBQUUsS0FBSyxPQUFLLEVBQUUsT0FBTyxRQUFRLGFBQWEsSUFDNUQsV0FBYyxNQUFNLFlBQVksRUFBRSxHQUFHLEVBQUU7QUFDMUMsWUFBSSxTQUFTO0FBQ1osZUFBSyxhQUFhLGVBQWUsU0FBUyxVQUFVO0FBQUEsUUFDckQ7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUdBLFNBQUssc0JBQXNCLFdBQVcsWUFBWSxRQUFRLFlBQVksUUFBVyxrQkFBa0IsSUFBSTtBQUV2RyxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsTUFBYyxzQkFBc0IsV0FBdUIsWUFBZ0MsWUFBb0IsVUFBbUIsT0FBeUM7QUFDMUssUUFBSSxDQUFDLFVBQVUsTUFBTSxrQkFBa0I7QUFDdEM7QUFBQSxJQUNEO0FBQ0EsUUFBSTtBQUNILFlBQU0sU0FBUyxNQUFNLFVBQVUsS0FBSyxpQkFBaUI7QUFBQSxRQUNwRDtBQUFBLFFBQ0E7QUFBQSxRQUNBLGVBQWUsV0FBVztBQUFBLE1BQzNCLEdBQUcsS0FBSztBQUVSLFVBQUksUUFBUSxtQkFBbUI7QUFDOUIsbUJBQVcsdUJBQXVCLE9BQU8saUJBQWlCO0FBQUEsTUFDM0Q7QUFBQSxJQUNELFNBQVMsT0FBTztBQUNmLFdBQUssWUFBWSxNQUFNLDZGQUE2RixVQUFVLEtBQUssRUFBRSxLQUFLLEtBQUs7QUFBQSxJQUNoSjtBQUFBLEVBQ0Q7QUFBQSxFQUVBLE1BQU0saUJBQWlCLFlBQW9CLGNBQXVCLE9BQXlDO0FBQzFHLFVBQU0sYUFBYSxLQUFLLGtCQUFrQixJQUFJLFVBQVU7QUFDeEQsUUFBSSxDQUFDLFlBQVk7QUFDaEI7QUFBQSxJQUNEO0FBR0EsZUFBVyxtQkFBbUIsWUFBWTtBQUcxQyxVQUFNLFlBQVksS0FBSyxPQUFPLElBQUksV0FBVyxNQUFNO0FBQ25ELFFBQUksV0FBVztBQUNkLFlBQU0sS0FBSyxzQkFBc0IsV0FBVyxZQUFZLFlBQVksY0FBYyxLQUFLO0FBQUEsSUFDeEY7QUFBQSxFQUNEO0FBQUEsRUFFUSx3QkFBd0IsaUJBQXVDLHFCQUE0QztBQUNsSCxVQUFNLGVBQWUsS0FBSyxzQkFBc0IsU0FBUyxrQkFBa0IsaUJBQWlCO0FBQzVGLFFBQUksY0FBYztBQUNqQjtBQUFBLElBQ0Q7QUFHQSxRQUFJLHFCQUFxQjtBQUN4QixZQUFNLFFBQVEsS0FBSyxhQUFhLFdBQVcsbUJBQW1CO0FBQzlELFlBQU0sVUFBVSxPQUFPLFlBQVksRUFBRSxHQUFHLEVBQUU7QUFDMUMsVUFBSSxtQkFBbUIsU0FBUyxVQUFVLGVBQWUsS0FBSyxLQUFLLCtCQUErQixtQkFBbUIsR0FBRztBQUN2SDtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBTUEsVUFBTSxxQkFBcUIsZ0JBQWdCLE9BQU8sU0FBTyxDQUFDLG9CQUFvQiwyQkFBMkIsR0FBRyxDQUFDO0FBQzdHLFFBQUksbUJBQW1CLFdBQVcsR0FBRztBQUNwQztBQUFBLElBQ0Q7QUFFQSxVQUFNLFVBQXdGLEtBQUssc0JBQXNCLFNBQVMsb0JBQW9CLHVCQUF1QixXQUFXO0FBQ3hMLFFBQUksQ0FBQyxTQUFTO0FBQ2I7QUFBQSxJQUNEO0FBQ0EsVUFBTSxlQUFlLFFBQVEsVUFBVSxRQUFTLFFBQVEsVUFBVSxVQUFXLEtBQUssc0JBQXNCLHdCQUF3QjtBQUNoSSxVQUFNLHNCQUFzQixLQUFLLHNCQUFzQix3QkFBd0IsS0FBSyxRQUFRLGlCQUFpQjtBQUM3RyxRQUFJLGdCQUFnQixxQkFBcUI7QUFDeEMsV0FBSyw0QkFBNEIsV0FBVyxvQkFBb0Isd0JBQXdCLEVBQUUsb0JBQW9CLEtBQUssc0JBQXNCLGVBQWUsMEJBQTBCLGtCQUFrQixHQUFHLGFBQWEsTUFBTSxVQUFVLENBQUMsZUFBZSxpQkFBaUIsT0FBVSxDQUFDO0FBQUEsSUFDalI7QUFBQSxFQUNEO0FBQUEsRUFFUSxrQkFBa0IsS0FBc0IsWUFBeUIsVUFBcUIsZ0JBQXNEO0FBQ25KLFFBQUksQ0FBQyxXQUFXLHNCQUFzQixTQUFTLDRCQUE2QixLQUFLLG9CQUFvQixVQUFVLEtBQUssQ0FBQyxLQUFLLHFDQUFxQyxZQUFZLGNBQWMsSUFBSztBQUM3TCxpQkFBVyxvQkFBb0I7QUFBQSxRQUM5QixPQUFPLEtBQUssZ0JBQWdCLEdBQUc7QUFBQSxRQUMvQixRQUFRLEtBQUssZUFBZSxVQUFVO0FBQUEsTUFDdkM7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUFBLEVBRVEsb0JBQW9CLFlBQWtDO0FBQzdELFdBQU8sV0FBVyxRQUFRLEtBQUssVUFBUSxLQUFLLFNBQVMsVUFBVSxLQUFLLE1BQU0sVUFBVSxXQUFXLFFBQVEsQ0FBQztBQUFBLEVBQ3pHO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBT1EscUNBQXFDLFlBQXlCLGdCQUF5RDtBQUk5SCxVQUFNLFVBQVUsV0FBVyxxQkFBcUIsZ0JBQWdCO0FBQ2hFLFFBQUksQ0FBQyxTQUFTO0FBQ2IsYUFBTztBQUFBLElBQ1I7QUFDQSxVQUFNLFFBQVEsT0FBTyxZQUFZLFdBQVcsVUFBVSxRQUFRO0FBRTlELFVBQU0sY0FBYztBQUNwQixRQUFJO0FBQ0osWUFBUSxRQUFRLFlBQVksS0FBSyxLQUFLLE9BQU8sTUFBTTtBQUNsRCxVQUFJO0FBQ0gsY0FBTSxTQUFTLElBQUksTUFBTSxNQUFNLE9BQVEsR0FBRztBQUMxQyxjQUFNLE9BQU8sYUFBYSxPQUFPLElBQUk7QUFDckMsWUFBSSxNQUFNLFdBQVcsUUFBUSxHQUFHO0FBQy9CLGlCQUFPO0FBQUEsUUFDUjtBQUFBLE1BQ0QsUUFBUTtBQUFBLE1BRVI7QUFBQSxJQUNEO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVRLGdCQUFnQixLQUE4QjtBQUNyRCxXQUFPLEtBQUssVUFBVSxJQUFJLFlBQVksUUFBVyxDQUFDO0FBQUEsRUFDbkQ7QUFBQSxFQUVRLGVBQWUsWUFBa0U7QUFDeEYsV0FBTyxXQUFXLFFBQVEsSUFBSSxVQUFRO0FBQ3JDLFVBQUksS0FBSyxTQUFTLFFBQVE7QUFDekIsZUFBTyxFQUFFLE1BQU0sU0FBUyxRQUFRLE1BQU0sT0FBTyxLQUFLLE1BQU07QUFBQSxNQUN6RCxXQUFXLEtBQUssU0FBUyxhQUFhO0FBQ3JDLGVBQU8sRUFBRSxNQUFNLFNBQVMsUUFBUSxNQUFNLE9BQU8sdUJBQXVCLElBQUksRUFBRTtBQUFBLE1BQzNFLFdBQVcsS0FBSyxTQUFTLFFBQVE7QUFDaEMsZUFBTyxFQUFFLE1BQU0sU0FBUyxPQUFPLGFBQWEsS0FBSyxNQUFNLElBQUksR0FBRyxVQUFVLEtBQUssTUFBTSxTQUFTO0FBQUEsTUFDN0YsT0FBTztBQUNOLG9CQUFZLElBQUk7QUFBQSxNQUNqQjtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0Y7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBTVEsaUNBQTBDO0FBQ2pELFVBQU0sWUFBWSxLQUFLLHNCQUFzQixRQUFpQixrQkFBa0IsaUJBQWlCO0FBQ2pHLFdBQU8sVUFBVSxnQkFBZ0I7QUFBQSxFQUNsQztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQU9RLCtCQUErQixxQkFBbUM7QUFDekUsVUFBTSxTQUFTLEtBQUssbUJBQW1CLDJCQUEyQixtQkFBbUIsS0FDakYsS0FBSyxtQkFBbUI7QUFDNUIsV0FBTyxDQUFDLENBQUMsVUFBVSxtQkFBbUIsT0FBTyxNQUFNLGdCQUFnQixlQUFlO0FBQUEsRUFDbkY7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBTVEsNkJBQTZCLHFCQUErQztBQUNuRixRQUFJLENBQUMscUJBQXFCO0FBQ3pCLGFBQU87QUFBQSxJQUNSO0FBQ0EsVUFBTSxRQUFRLEtBQUssYUFBYSxXQUFXLG1CQUFtQjtBQUM5RCxVQUFNLFVBQVUsT0FBTyxZQUFZLEVBQUUsR0FBRyxFQUFFO0FBQzFDLFdBQU8sbUJBQW1CLFNBQVMsVUFBVSxlQUFlLEtBQUssS0FBSywrQkFBK0IsbUJBQW1CO0FBQUEsRUFDekg7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBTVEsNkJBQTZCLHFCQUFtQztBQUN2RSxVQUFNLFNBQVMsS0FBSyxtQkFBbUIsMkJBQTJCLG1CQUFtQixLQUNqRixLQUFLLG1CQUFtQjtBQUM1QixXQUFPLENBQUMsQ0FBQyxVQUFVLGlCQUFpQixPQUFPLE1BQU0sZ0JBQWdCLGVBQWU7QUFBQSxFQUNqRjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFNUSwyQkFBMkIscUJBQStDO0FBQ2pGLFFBQUksQ0FBQyxxQkFBcUI7QUFDekIsYUFBTztBQUFBLElBQ1I7QUFDQSxVQUFNLFFBQVEsS0FBSyxhQUFhLFdBQVcsbUJBQW1CO0FBQzlELFVBQU0sVUFBVSxPQUFPLFlBQVksRUFBRSxHQUFHLEVBQUU7QUFDMUMsV0FBTyxpQkFBaUIsU0FBUyxVQUFVLGVBQWUsS0FBSyxLQUFLLDZCQUE2QixtQkFBbUI7QUFBQSxFQUNySDtBQUFBLEVBRVEsc0NBQXNDLFVBQXlDO0FBQ3RGLFFBQUksU0FBUyxPQUFPLGdDQUFnQztBQUNuRCxhQUFPO0FBQUEsSUFDUjtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFUSw4QkFBOEIsVUFBOEI7QUFDbkUsVUFBTSxvQkFBb0IsS0FBSyxzQ0FBc0MsUUFBUSxLQUFLLHlCQUF5QixRQUFRO0FBQ25ILFFBQUksU0FBUyxPQUFPLHdCQUF3QjtBQUUzQyxhQUFPO0FBQUEsSUFDUjtBQUNBLFFBQUksZ0NBQWdDLElBQUksU0FBUyxFQUFFLEdBQUc7QUFHckQsYUFBTztBQUFBLElBQ1I7QUFDQSxVQUFNLG9CQUFvQixLQUFLLHNCQUFzQixTQUFrQyxrQkFBa0IsdUJBQXVCO0FBQ2hJLFFBQUkscUJBQXFCLE9BQU8sc0JBQXNCLFlBQVksbUJBQW1CO0FBRXBGLFVBQUksT0FBTyxVQUFVLGVBQWUsS0FBSyxtQkFBbUIsaUJBQWlCLEdBQUc7QUFDL0UsZUFBTyxrQkFBa0IsaUJBQWlCO0FBQUEsTUFDM0M7QUFFQSxVQUFJLFNBQVMsOEJBQThCO0FBQzFDLG1CQUFXLGNBQWMsU0FBUyw4QkFBOEI7QUFFL0QsY0FBSSxPQUFPLFVBQVUsZUFBZSxLQUFLLG1CQUFtQixVQUFVLEdBQUc7QUFDeEUsbUJBQU8sa0JBQWtCLFVBQVU7QUFBQSxVQUNwQztBQUVBLGNBQUksV0FBVyxTQUFTLEdBQUcsR0FBRztBQUM3QixrQkFBTSxvQkFBb0IsV0FBVyxNQUFNLEdBQUcsRUFBRSxJQUFJO0FBQ3BELGdCQUFJLHFCQUFxQixPQUFPLFVBQVUsZUFBZSxLQUFLLG1CQUFtQixpQkFBaUIsR0FBRztBQUNwRyxxQkFBTyxrQkFBa0IsaUJBQWlCO0FBQUEsWUFDM0M7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLE1BQWMsa0JBQWtCLFFBQWdCLGlCQUFzQyxRQUF3QixZQUFxQixxQkFBc0MsZUFBbUMsYUFBOEMsa0JBQThEO0FBQ3ZULFVBQU0sT0FBTyxLQUFLLE9BQU8sSUFBSSxNQUFNO0FBQ25DLFFBQUksQ0FBQyxNQUFNO0FBQ1YsYUFBTztBQUFBLElBQ1I7QUFJQSxRQUFJLHVCQUF1QixDQUFDLEtBQUssK0JBQStCLEtBQUssS0FBSyw2QkFBNkIsbUJBQW1CLEdBQUc7QUFFNUgsVUFBSSxFQUFFLGdDQUFnQyxJQUFJLEtBQUssS0FBSyxFQUFFLEtBQUssbUJBQW1CLG1CQUFtQixNQUFNLHVCQUF1QjtBQUM3SCxlQUFPLEVBQUUsTUFBTSxnQkFBZ0IsdUJBQXVCLFFBQVEscUJBQXFCO0FBQUEsTUFDcEY7QUFBQSxJQUNEO0FBRUEsUUFBSSxDQUFDLEtBQUssOEJBQThCLEtBQUssSUFBSSxHQUFHO0FBQ25ELGFBQU87QUFBQSxJQUNSO0FBRUEsVUFBTSxTQUFTLEtBQUsscUJBQXFCLG9CQUFvQixFQUFFLFFBQVEsUUFBUSxZQUFZLHFCQUFxQixrQkFBa0IsWUFBWSxDQUFDO0FBQy9JLFFBQUksUUFBUTtBQUNYLGFBQU87QUFBQSxJQUNSO0FBRUEsVUFBTSxTQUFTLEtBQUssc0JBQXNCLFFBQTJDLGtCQUFrQixpQkFBaUI7QUFJeEgsUUFBSSxRQUFRLE9BQU8sU0FBUyxPQUFPO0FBQ25DLFFBQUksT0FBTyxvQkFBb0IsV0FBVztBQUN6QyxjQUFRLE9BQU8sa0JBQWtCLE9BQU87QUFDeEMsVUFBSSxpQkFBaUI7QUFDcEIsZ0JBQVEsT0FBTyxrQkFBa0IsT0FBTyx3QkFBd0IsT0FBTyxtQkFBbUI7QUFBQSxNQUMzRjtBQUFBLElBQ0Q7QUFFQSxVQUFNLGNBQWMsVUFBVSxRQUFTLE9BQU8sVUFBVSxZQUFZLE1BQU0sZUFBZSxNQUFNLEtBQUssTUFBTSxNQUFNLE1BQU07QUFDdEgsUUFBSSxhQUFhO0FBQ2hCLFVBQUksTUFBTSxLQUFLLHdCQUF3QixHQUFHO0FBQ3pDLGVBQU8sRUFBRSxNQUFNLGdCQUFnQixTQUFTLElBQUksa0JBQWtCLGtCQUFrQjtBQUFBLE1BQ2pGO0FBQUEsSUFDRDtBQUVBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxNQUFjLCtCQUErQixRQUFnQixpQkFBc0MsUUFBd0IsWUFBcUIscUJBQXNDLGVBQW1DLGtCQUE4RDtBQUd0UixVQUFNLHFCQUFxQix1QkFBdUIsQ0FBQyxLQUFLLCtCQUErQixLQUFLLEtBQUssNkJBQTZCLG1CQUFtQjtBQUNqSixRQUFJLG9CQUFvQjtBQUN2QixVQUFJLEVBQUUsZ0NBQWdDLElBQUksTUFBTSxLQUFLLG1CQUFtQixtQkFBb0IsTUFBTSx1QkFBdUI7QUFDeEgsZUFBTyxFQUFFLE1BQU0sZ0JBQWdCLHVCQUF1QixRQUFRLHFCQUFxQjtBQUFBLE1BQ3BGO0FBQUEsSUFDRDtBQUlBLFFBQUksS0FBSyxzQkFBc0IsU0FBa0Isa0JBQWtCLGlCQUFpQixLQUFLLENBQUMsc0JBQXNCLE1BQU0sS0FBSyx3QkFBd0IsR0FBRztBQUNySixhQUFPLEVBQUUsTUFBTSxnQkFBZ0IsU0FBUyxJQUFJLGtCQUFrQixrQkFBa0I7QUFBQSxJQUNqRjtBQUVBLFdBQU8sS0FBSyxxQkFBcUIscUJBQXFCLEVBQUUsUUFBUSxRQUFRLFlBQVkscUJBQXFCLGlCQUFpQixDQUFDO0FBQUEsRUFDNUg7QUFBQSxFQUVBLE1BQWMsMEJBQTRDO0FBQ3pELFVBQU0sVUFBVSxLQUFLLGdCQUFnQixXQUFXLG9FQUErQyxhQUFhLGFBQWEsS0FBSztBQUM5SCxRQUFJLFNBQVM7QUFDWixhQUFPO0FBQUEsSUFDUjtBQUVBLFFBQUksS0FBSyxtQkFBbUIsbUJBQW1CLDhCQUE4QixNQUFNLE1BQU07QUFDeEYsYUFBTztBQUFBLElBQ1I7QUFFQSxRQUFJLEtBQUssZ0NBQWdDO0FBQ3hDLGFBQU8sS0FBSztBQUFBLElBQ2I7QUFFQSxTQUFLLGlDQUFpQyxLQUFLLDBCQUEwQjtBQUNyRSxRQUFJO0FBQ0gsYUFBTyxNQUFNLEtBQUs7QUFBQSxJQUNuQixVQUFFO0FBQ0QsV0FBSyxpQ0FBaUM7QUFBQSxJQUN2QztBQUFBLEVBQ0Q7QUFBQSxFQUVBLE1BQWMsNEJBQThDO0FBQzNELFVBQU0sUUFBUSxJQUFJLGdCQUFnQjtBQUNsQyxRQUFJO0FBR0gsWUFBTSxNQUFNLElBQUksd0JBQXdCO0FBQ3hDLFlBQU0sSUFBSSxHQUFHO0FBQ2IsWUFBTSxJQUFJLEtBQUssZ0JBQWdCLGlCQUFpQixhQUFhLGFBQWEsb0VBQStDLEtBQUssRUFBRSxNQUFNO0FBQ3JJLFlBQUksS0FBSyxnQkFBZ0IsV0FBVyxvRUFBK0MsYUFBYSxhQUFhLEtBQUssR0FBRztBQUNwSCxjQUFJLE9BQU87QUFBQSxRQUNaO0FBQUEsTUFDRCxDQUFDLENBQUM7QUFFRixZQUFNLGVBQWUsTUFBTSxLQUFLLGVBQWUsT0FBTztBQUFBLFFBQ3JELE1BQU0sU0FBUztBQUFBLFFBQ2YsU0FBUyxTQUFTLHNCQUFzQiw2QkFBNkI7QUFBQSxRQUNyRSxTQUFTO0FBQUEsVUFDUjtBQUFBLFlBQ0MsT0FBTyxTQUFTLDhCQUE4QixRQUFRO0FBQUEsWUFDdEQsS0FBSyxNQUFNO0FBQUEsVUFDWjtBQUFBLFVBQ0E7QUFBQSxZQUNDLE9BQU8sU0FBUywrQkFBK0IsU0FBUztBQUFBLFlBQ3hELEtBQUssTUFBTTtBQUFBLFVBQ1o7QUFBQSxRQUNEO0FBQUEsUUFDQSxRQUFRO0FBQUEsVUFDUCxNQUFNLFFBQVE7QUFBQSxVQUNkLGlCQUFpQixDQUFDO0FBQUEsWUFDakIsVUFBVSxJQUFJLGVBQWUsNkJBQTZCLE9BQU8sRUFBRSxXQUFXLEVBQUUsaUJBQWlCLENBQUMsK0JBQStCLEVBQUUsRUFBRSxDQUFDO0FBQUEsVUFDdkksQ0FBQztBQUFBLFFBQ0Y7QUFBQSxRQUNBLE9BQU8sSUFBSTtBQUFBLE1BQ1osQ0FBQztBQUdELFVBQUksSUFBSSxNQUFNLHlCQUF5QjtBQUN0QyxlQUFPO0FBQUEsTUFDUjtBQUVBLFVBQUksYUFBYSxXQUFXLE1BQU07QUFDakMsY0FBTSxLQUFLLHNCQUFzQixZQUFZLGtCQUFrQixtQkFBbUIsS0FBSztBQUN2RixlQUFPO0FBQUEsTUFDUjtBQUVBLFdBQUssZ0JBQWdCLE1BQU0sb0VBQStDLE1BQU0sYUFBYSxhQUFhLGNBQWMsSUFBSTtBQUM1SCxhQUFPO0FBQUEsSUFDUixVQUFFO0FBQ0QsWUFBTSxRQUFRO0FBQUEsSUFDZjtBQUFBLEVBQ0Q7QUFBQSxFQUVRLHVCQUF1QixXQUErQixPQUE4QjtBQUMzRixRQUFJLFdBQVc7QUFDZCxZQUFNLGNBQWMsS0FBSyxrQkFBa0IsSUFBSSxTQUFTO0FBQ3hELFVBQUksYUFBYTtBQUNoQixjQUFNLFFBQVEsWUFBWSxVQUFVLE9BQUssRUFBRSxVQUFVLEtBQUs7QUFDMUQsWUFBSSxRQUFRLElBQUk7QUFDZixzQkFBWSxPQUFPLE9BQU8sQ0FBQztBQUFBLFFBQzVCO0FBQ0EsWUFBSSxZQUFZLFdBQVcsR0FBRztBQUM3QixlQUFLLGtCQUFrQixPQUFPLFNBQVM7QUFBQSxRQUN4QztBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBRUEsVUFBTSxRQUFRO0FBQUEsRUFDZjtBQUFBLEVBRUEsMEJBQTBCLFdBQXlCO0FBQ2xELFVBQU0sUUFBUSxLQUFLLGtCQUFrQixJQUFJLFNBQVM7QUFDbEQsUUFBSSxPQUFPO0FBQ1YsWUFBTSxRQUFRLFVBQVEsS0FBSyxNQUFNLFFBQVEsQ0FBQztBQUMxQyxXQUFLLGtCQUFrQixPQUFPLFNBQVM7QUFBQSxJQUN4QztBQUdBLGVBQVcsQ0FBQyxZQUFZLFVBQVUsS0FBSyxLQUFLLG1CQUFtQjtBQUM5RCxVQUFJLFdBQVcsa0JBQWtCLFdBQVc7QUFDM0MsYUFBSyxrQkFBa0IsT0FBTyxVQUFVO0FBQUEsTUFDekM7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUFBLEVBS0EsQ0FBUyxrQkFBa0IsU0FBa0IsbUJBQTZDO0FBQ3pGLFFBQUksc0JBQXNCLFFBQVEsZUFBZTtBQUNoRCxZQUFNLFFBQVE7QUFBQSxJQUNmO0FBQ0EsUUFBSSxRQUFRLGlCQUFpQjtBQUM1QixhQUFPLFFBQVE7QUFBQSxJQUNoQjtBQUNBLFlBQVEsUUFBUSxlQUFlO0FBQUEsTUFDOUIsS0FBSztBQUNKLG1CQUFXLFNBQVMsMEJBQTBCLHdCQUF3QjtBQUNyRSxnQkFBTSxRQUFRO0FBQUEsUUFDZjtBQUNBO0FBQUEsTUFDRCxLQUFLO0FBQ0osbUJBQVcsU0FBUywwQkFBMEIsNEJBQTRCO0FBQ3pFLGdCQUFNLFFBQVE7QUFBQSxRQUNmO0FBQ0E7QUFBQSxNQUNELEtBQUssa0JBQWtCO0FBQ3RCLGNBQU07QUFDTjtBQUFBLE1BQ0QsS0FBSyxrQkFBa0I7QUFDdEIsY0FBTSxvQkFBb0I7QUFDMUIsY0FBTTtBQUNOO0FBQUEsSUFDRjtBQUFBLEVBQ0Q7QUFBQSxFQUVBLENBQVUsZUFBZSxTQUFvQixtQkFBNkM7QUFDekYsVUFBTSxnQkFBZ0IsUUFBUSxxQkFBcUIsUUFBUTtBQUMzRCxRQUFJLHNCQUFzQixpQkFBaUIsa0JBQWtCLG9CQUFvQixhQUFhO0FBQzdGLFlBQU07QUFBQSxJQUNQO0FBQ0EsUUFBSSxRQUFRLDhCQUE4QjtBQUN6QyxpQkFBVyxjQUFjLFFBQVEsOEJBQThCO0FBQzlELGNBQU07QUFDTixjQUFNLGlCQUFpQixXQUFXLFlBQVksR0FBRztBQUNqRCxZQUFJLG1CQUFtQixJQUFJO0FBQzFCLGdCQUFNLFdBQVcsVUFBVSxpQkFBaUIsQ0FBQztBQUFBLFFBQzlDO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFDQSxVQUFNLGFBQWEsa0JBQWtCLFlBQVksR0FBRztBQUNwRCxRQUFJLGVBQWUsSUFBSTtBQUN0QixjQUFRLGtCQUFrQixVQUFVLEdBQUcsVUFBVSxHQUFHO0FBQUEsUUFDbkQsS0FBSztBQUNKLHFCQUFXLFNBQVMsMEJBQTBCLHdCQUF3QjtBQUNyRSxrQkFBTSxRQUFRLGtCQUFrQixVQUFVLFVBQVU7QUFBQSxVQUNyRDtBQUNBO0FBQUEsUUFDRCxLQUFLO0FBQ0oscUJBQVcsU0FBUywwQkFBMEIsNEJBQTRCO0FBQ3pFLGtCQUFNLFFBQVEsa0JBQWtCLFVBQVUsVUFBVTtBQUFBLFVBQ3JEO0FBQ0E7QUFBQSxNQUNGO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFPQSw4QkFBOEIsb0JBQXVDLE9BQTRFO0FBQ2hKLFVBQU0scUJBQXFCLElBQUksSUFBSSxrQkFBa0I7QUFDckQsVUFBTSxTQUFTLG9CQUFJLElBQW1DO0FBQ3RELGVBQVcsQ0FBQyxNQUFNLGlCQUFpQixLQUFLLEtBQUssMkJBQTJCLElBQUksR0FBRztBQUM5RSxVQUFJLFVBQVUsSUFBSSxHQUFHO0FBQ3BCLGNBQU0sVUFBVSxtQkFBbUIsSUFBSSxpQkFBaUIsS0FBSyxTQUFTLEtBQUssS0FBSyxrQkFBa0IsTUFBTSxpQkFBaUIsR0FBRyxVQUFRLG1CQUFtQixJQUFJLElBQUksQ0FBQztBQUNoSyxjQUFNLFNBQVMsUUFBUSxJQUFJLGdCQUFnQixNQUFNLEtBQUssSUFBSTtBQUMxRCxlQUFPLElBQUksUUFBUSxPQUFPO0FBQzFCLFlBQUksU0FBUztBQUNaLHFCQUFXLGNBQWMsT0FBTyxTQUFTLEdBQUc7QUFDM0MsbUJBQU8sSUFBSSxZQUFZLElBQUk7QUFBQSxVQUM1QjtBQUFBLFFBQ0Q7QUFBQSxNQUNELE9BQU87QUFDTixZQUFJLENBQUMsS0FBSyxzQkFBc0IsTUFBTSxLQUFLLEdBQUc7QUFDN0M7QUFBQSxRQUNEO0FBRUEsWUFBSSxDQUFDLE9BQU8sSUFBSSxJQUFJLEdBQUc7QUFDdEIsZ0JBQU0sVUFBVSxtQkFBbUIsSUFBSSxpQkFBaUIsS0FDcEQsU0FBUyxLQUFLLEtBQUssZUFBZSxNQUFNLGlCQUFpQixHQUFHLFVBQVEsbUJBQW1CLElBQUksSUFBSSxDQUFDLEtBQ2hHLENBQUMsQ0FBQyxLQUFLLDhCQUE4QixLQUFLLGtCQUFnQjtBQUU1RCxrQkFBTSxRQUFRLGFBQWEsWUFBWSxHQUFHO0FBQzFDLG1CQUFPLFVBQVUsTUFBTSxtQkFBbUIsSUFBSSxhQUFhLFVBQVUsR0FBRyxLQUFLLENBQUM7QUFBQSxVQUMvRSxDQUFDO0FBQ0YsaUJBQU8sSUFBSSxNQUFNLE9BQU87QUFBQSxRQUN6QjtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBR0EsZUFBVyxXQUFXLEtBQUssV0FBVztBQUNyQyxVQUFJLFFBQVEsT0FBTyxTQUFTLFFBQVE7QUFDbkMsY0FBTSxVQUFVLFNBQVMsTUFBTSxRQUFRLFNBQVMsR0FBRyxPQUFLLE9BQU8sSUFBSSxDQUFDLE1BQU0sSUFBSTtBQUM5RSxlQUFPLElBQUksU0FBUyxPQUFPO0FBQUEsTUFDNUI7QUFBQSxJQUNEO0FBQ0EsV0FBTyw0QkFBNEIsUUFBUSxNQUFNO0FBQUEsRUFDbEQ7QUFBQSxFQUVBLHFCQUFxQixLQUE0QztBQUNoRSxVQUFNLFNBQW1CLENBQUM7QUFDMUIsVUFBTSwrQkFBK0Isb0JBQUksSUFBZTtBQUd4RCxVQUFNLG9CQUFvQixvQkFBSSxJQUFZO0FBQzFDLFVBQU0saUJBQWlCLG9CQUFJLElBQVk7QUFDdkMsZUFBVyxDQUFDLE1BQU0sT0FBTyxLQUFLLEtBQUs7QUFDbEMsVUFBSSxTQUFTO0FBQ1osWUFBSSxVQUFVLElBQUksR0FBRztBQUNwQiw0QkFBa0IsSUFBSSxLQUFLLEVBQUU7QUFBQSxRQUM5QixPQUFPO0FBQ04seUJBQWUsSUFBSSxLQUFLLEVBQUU7QUFBQSxRQUMzQjtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQ0EsZUFBVyxDQUFDLE1BQU0saUJBQWlCLEtBQUssS0FBSywyQkFBMkIsSUFBSSxHQUFHO0FBQzlFLFVBQUksVUFBVSxJQUFJLEdBQUc7QUFDcEIsWUFBSSxrQkFBa0IsSUFBSSxLQUFLLEVBQUUsR0FBRztBQUNuQyxpQkFBTyxLQUFLLGlCQUFpQjtBQUM3QixxQkFBVyxjQUFjLEtBQUssU0FBUyxHQUFHO0FBQ3pDLHlDQUE2QixJQUFJLFVBQVU7QUFBQSxVQUM1QztBQUFBLFFBQ0Q7QUFBQSxNQUNELE9BQU87QUFDTixZQUFJLGVBQWUsSUFBSSxLQUFLLEVBQUUsS0FBSyxDQUFDLDZCQUE2QixJQUFJLElBQUksR0FBRztBQUMzRSxpQkFBTyxLQUFLLGlCQUFpQjtBQUFBLFFBQzlCO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsaUJBQWlCLG9CQUFvRjtBQUNwRyxVQUFNLHVCQUF1QixvQkFBSSxJQUFpQztBQUNsRSxlQUFXLENBQUMsTUFBTSxpQkFBaUIsS0FBSyxLQUFLLDJCQUEyQixJQUFJLEdBQUc7QUFDOUUsMkJBQXFCLElBQUksbUJBQW1CLElBQUk7QUFBQSxJQUNqRDtBQUVBLFVBQU0sU0FBMEMsQ0FBQztBQUNqRCxlQUFXLE9BQU8sb0JBQW9CO0FBQ3JDLFlBQU0sZ0JBQWdCLHFCQUFxQixJQUFJLElBQUksSUFBSTtBQUN2RCxVQUFJLGVBQWU7QUFDbEIsWUFBSSxVQUFVLGFBQWEsR0FBRztBQUM3QixpQkFBTyxLQUFLLHVCQUF1QixlQUFlLElBQUksS0FBSyxDQUFDO0FBQUEsUUFDN0QsT0FBTztBQUNOLGlCQUFPLEtBQUssb0JBQW9CLGVBQWUsSUFBSSxLQUFLLENBQUM7QUFBQSxRQUMxRDtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQVVBLG9CQUFvQixPQUErQyxRQUFzQztBQUN4RyxRQUFJLENBQUMsT0FBTztBQUNYLGFBQU8sS0FBSyxTQUFTLEtBQUssTUFBTTtBQUFBLElBQ2pDO0FBRUEsV0FBTyxTQUFTLElBQUksS0FBSyxTQUFTLEtBQUssTUFBTSxHQUFHLFFBQU0sSUFBSSxnQkFBZ0IsSUFBSSxPQUFPLGNBQVksS0FBSyxzQkFBc0IsVUFBVSxLQUFLLENBQUMsQ0FBQztBQUFBLEVBQzlJO0FBQUEsRUFFQSxXQUFXLElBQWlDO0FBQzNDLGVBQVcsV0FBVyxLQUFLLFdBQVc7QUFDckMsVUFBSSxRQUFRLE9BQU8sSUFBSTtBQUN0QixlQUFPO0FBQUEsTUFDUjtBQUFBLElBQ0Q7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsaUJBQWlCLE1BQW1DO0FBQ25ELGVBQVcsV0FBVyxLQUFLLFdBQVc7QUFDckMsVUFBSSxRQUFRLGtCQUFrQixNQUFNO0FBQ25DLGVBQU87QUFBQSxNQUNSO0FBQUEsSUFDRDtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxxQkFBcUIsZUFBK0I7QUFDbkQsUUFBSSwwQkFBMEIsdUJBQXVCLFNBQVMsYUFBYSxHQUFHO0FBQzdFLGFBQU87QUFBQSxJQUNSO0FBQ0EsUUFBSSwwQkFBMEIsMkJBQTJCLFNBQVMsYUFBYSxHQUFHO0FBQ2pGLGFBQU87QUFBQSxJQUNSO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLGNBQWMsUUFBd0IsSUFBWSxlQUF1QixTQUErSztBQUV2UCxVQUFNLE9BQU87QUFFYixvQkFBZ0IsS0FBSyxxQkFBcUIsYUFBYTtBQUV2RCxVQUFNLFNBQVMsSUFBSSxjQUFjLFFBQStCO0FBQUEsTUFDL0QsVUFBZ0I7QUFDZixZQUFJLEtBQUssVUFBVSxJQUFJLE1BQU0sR0FBRztBQUMvQixlQUFLLE9BQU8sTUFBTTtBQUNsQixlQUFLLFVBQVUsT0FBTyxNQUFNO0FBQUEsUUFDN0I7QUFBQSxNQUVEO0FBQUEsSUFDRCxFQUFFLElBQUksZUFBZSxTQUFTLFFBQVEsUUFBUSxPQUFPLFFBQVEsU0FBUyxhQUFhLFNBQVMsUUFBUSxTQUFTLGlCQUFpQixTQUFTLFlBQVksU0FBUyxxQkFBcUIsS0FBSyxrQkFBa0I7QUFFeE0sU0FBSyxVQUFVLElBQUksTUFBTTtBQUN6QixXQUFPO0FBQUEsRUFDUjtBQUFBLEVBa0NBLENBQUUsd0JBQTBDO0FBQzNDLGVBQVcsQ0FBQyxFQUFFLGlCQUFpQixLQUFLLEtBQUssMkJBQTJCLElBQUksR0FBRztBQUMxRSxZQUFNO0FBQUEsSUFDUDtBQUFBLEVBQ0Q7QUFBQSxFQUVBLGtDQUE0RDtBQUMzRCxVQUFNLFNBQVMsb0JBQUksSUFBeUI7QUFDNUMsVUFBTSxvQkFBb0Isb0JBQUksSUFBWTtBQUMxQyxVQUFNLE1BQU0sQ0FBQyxNQUFjLHNCQUE4QjtBQUN4RCxVQUFJLFNBQVMsbUJBQW1CO0FBQy9CLFlBQUksQ0FBQyxPQUFPLElBQUksSUFBSSxHQUFHO0FBQ3RCLGlCQUFPLElBQUksTUFBTSxvQkFBSSxJQUFZLENBQUM7QUFBQSxRQUNuQztBQUNBLGVBQU8sSUFBSSxJQUFJLEVBQUcsSUFBSSxpQkFBaUI7QUFBQSxNQUN4QztBQUFBLElBQ0Q7QUFFQSxlQUFXLENBQUMsTUFBTSxDQUFDLEtBQUssS0FBSywyQkFBMkIsSUFBSSxHQUFHO0FBQzlELFVBQUksVUFBVSxJQUFJLEdBQUc7QUFDcEIsMEJBQWtCLElBQUksS0FBSyxhQUFhO0FBQ3hDLFlBQUksS0FBSyxpQkFBaUI7QUFDekIscUJBQVcsY0FBYyxLQUFLLGlCQUFpQjtBQUM5Qyw4QkFBa0IsSUFBSSxVQUFVO0FBQUEsVUFDakM7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFFQSxlQUFXLENBQUMsTUFBTSxpQkFBaUIsS0FBSyxLQUFLLDJCQUEyQixJQUFJLEdBQUc7QUFDOUUsVUFBSSxVQUFVLElBQUksR0FBRztBQUNwQixtQkFBVyxTQUFTLEtBQUssa0JBQWtCLE1BQU0saUJBQWlCLEdBQUc7QUFDcEUsY0FBSSxPQUFPLGlCQUFpQjtBQUFBLFFBQzdCO0FBQUEsTUFDRCxPQUFPO0FBQ04sbUJBQVcsU0FBUyxLQUFLLGVBQWUsTUFBTSxpQkFBaUIsR0FBRztBQUNqRSxjQUFJLE9BQU8saUJBQWlCO0FBQUEsUUFDN0I7QUFDQSxZQUFJLEtBQUssOEJBQThCO0FBR3RDLGdCQUFNLGFBQWEsa0JBQWtCLFlBQVksR0FBRztBQUNwRCxnQkFBTSxnQkFBZ0IsZUFBZSxLQUFLLGtCQUFrQixVQUFVLEdBQUcsYUFBYSxDQUFDLElBQUk7QUFFM0YscUJBQVcsY0FBYyxLQUFLLDhCQUE4QjtBQUMzRCxnQkFBSSxpQkFBaUIsQ0FBQyxXQUFXLFNBQVMsR0FBRyxHQUFHO0FBQy9DLGtCQUFJLGdCQUFnQixZQUFZLGlCQUFpQjtBQUFBLFlBQ2xEO0FBSUEsZ0JBQUksV0FBVyxTQUFTLEdBQUcsR0FBRztBQUM3QixvQkFBTSxrQkFBa0IsV0FBVyxVQUFVLEdBQUcsV0FBVyxZQUFZLEdBQUcsQ0FBQztBQUMzRSxrQkFBSSxDQUFDLGtCQUFrQixJQUFJLGVBQWUsR0FBRztBQUM1QyxvQkFBSSxpQkFBaUIsaUJBQWlCO0FBQUEsY0FDdkM7QUFBQSxZQUNEO0FBQUEsVUFDRDtBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSwyQkFBMkIsbUJBQTREO0FBQ3RGLGVBQVcsQ0FBQyxNQUFNLHFCQUFxQixLQUFLLEtBQUssMkJBQTJCLElBQUksR0FBRztBQUNsRixVQUFJLHNCQUFzQix1QkFBdUI7QUFDaEQsZUFBTztBQUFBLE1BQ1I7QUFDQSxZQUFNLFVBQVUsVUFBVSxJQUFJLElBQUksS0FBSyxrQkFBa0IsTUFBTSxxQkFBcUIsSUFBSSxLQUFLLGVBQWUsTUFBTSxxQkFBcUI7QUFDdkksVUFBSSxTQUFTLEtBQUssU0FBUyxXQUFTLHNCQUFzQixLQUFLLEdBQUc7QUFDakUsZUFBTztBQUFBLE1BQ1I7QUFBQSxJQUNEO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLHFCQUFxQixNQUE0QixTQUE0QjtBQUM1RSxlQUFXLENBQUMsTUFBTSxxQkFBcUIsS0FBSyxLQUFLLDJCQUEyQixJQUFJLEdBQUc7QUFDbEYsVUFBSSxTQUFTLE1BQU07QUFDbEIsZUFBTztBQUFBLE1BQ1I7QUFBQSxJQUNEO0FBRUEsUUFBSSxVQUFVLElBQUksR0FBRztBQUNwQixhQUFPLDRCQUE0QixJQUFJO0FBQUEsSUFDeEM7QUFDQSxXQUFPLHlCQUF5QixNQUFNLE9BQU87QUFBQSxFQUM5QztBQUFBLEVBRUEsMEJBQTZEO0FBQzVELFVBQU0sU0FBUyxvQkFBSSxJQUFrQztBQUNyRCxlQUFXLENBQUMsTUFBTSxxQkFBcUIsS0FBSyxLQUFLLDJCQUEyQixJQUFJLEdBQUc7QUFDbEYsYUFBTyxJQUFJLE1BQU0scUJBQXFCO0FBQUEsSUFDdkM7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUNEO0FBaHdEYSwwQkE4NUNZLHlCQUF5QixDQUFDLDRCQUE0QixzQ0FBc0MsbUJBQW1CO0FBOTVDM0gsMEJBKzVDWSw2QkFBNkIsQ0FBQyw0QkFBNEIsOEJBQThCO0FBLzVDcEcsNEJBQU47QUFBQSxFQStCSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBOUNVO0FBa3dEYixTQUFTLHlCQUF5QixNQUFpQixTQUFvQjtBQUN0RSxRQUFNLFdBQVcsS0FBSyxxQkFBcUIsS0FBSztBQUNoRCxNQUFJLFNBQVM7QUFDWixXQUFPLEdBQUcsUUFBUSxhQUFhLElBQUksUUFBUTtBQUFBLEVBQzVDLFdBQVcsS0FBSyxPQUFPLFNBQVMsYUFBYTtBQUM1QyxXQUFPLEdBQUcsS0FBSyxPQUFPLFlBQVksTUFBTSxZQUFZLENBQUMsSUFBSSxRQUFRO0FBQUEsRUFDbEU7QUFDQSxTQUFPO0FBQ1I7QUFFQSxTQUFTLDRCQUE0QixTQUFtQjtBQUN2RCxNQUFJLFFBQVEsT0FBTyxTQUFTLE9BQU87QUFDbEMsV0FBTyxHQUFHLFFBQVEsYUFBYTtBQUFBLEVBQ2hDO0FBQ0EsU0FBTyxRQUFRO0FBQ2hCOyIsCiAgIm5hbWVzIjogWyJBdXRvQXBwcm92ZVN0b3JhZ2VLZXlzIl0KfQo=
