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
import { Emitter } from "../../../../base/common/event.js";
import { MarkdownString } from "../../../../base/common/htmlContent.js";
import { createDecorator, IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { ChatContextKeys } from "../common/actions/chatContextKeys.js";
import { getSelectedModelIdentifier } from "../common/chatSelectedModel.js";
import { ChatAgentLocation, ChatConfiguration } from "../common/constants.js";
import { ConfigurationTarget, IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { Disposable, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { CommandsRegistry, ICommandService } from "../../../../platform/commands/common/commands.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { localize } from "../../../../nls.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { IChatService } from "../common/chatService/chatService.js";
import { CreateSlashCommandsUsageTracker } from "./createSlashCommandsUsageTracker.js";
import { ChatEntitlement, IChatEntitlementService } from "../../../services/chat/common/chatEntitlementService.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { ChatRequestAgentSubcommandPart, ChatRequestDynamicVariablePart, ChatRequestSlashCommandPart } from "../common/requestParser/chatParserTypes.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { TipEligibilityTracker } from "./chatTipEligibilityTracker.js";
import { ChatTipExperiment, ChatTipTier, extractCommandIds, TIP_CATALOG } from "./chatTipCatalog.js";
import { ChatTipStorageKeys, TipTrackingCommands } from "./chatTipStorageKeys.js";
import { IWorkbenchAssignmentService } from "../../../services/assignment/common/assignmentService.js";
import { IsSessionsWindowContext } from "../../../common/contextkeys.js";
import { IChatWidgetService } from "./chat.js";
const ATTACH_FILES_REFERENCE_TRACKING_COMMAND = TipTrackingCommands.AttachFilesReferenceUsed;
const CREATE_AGENT_INSTRUCTIONS_TRACKING_COMMAND = TipTrackingCommands.CreateAgentInstructionsUsed;
const CREATE_PROMPT_TRACKING_COMMAND = TipTrackingCommands.CreatePromptUsed;
const CREATE_AGENT_TRACKING_COMMAND = TipTrackingCommands.CreateAgentUsed;
const CREATE_SKILL_TRACKING_COMMAND = TipTrackingCommands.CreateSkillUsed;
const FORK_CONVERSATION_TRACKING_COMMAND = TipTrackingCommands.ForkConversationUsed;
const IChatTipService = createDecorator("chatTipService");
import { TipEligibilityTracker as TipEligibilityTracker2 } from "./chatTipEligibilityTracker.js";
let ChatTipService = class extends Disposable {
  constructor(_productService, _configurationService, _storageService, _chatService, instantiationService, _logService, _chatEntitlementService, _commandService, _telemetryService, _keybindingService, _assignmentService, _chatWidgetService) {
    super();
    this._productService = _productService;
    this._configurationService = _configurationService;
    this._storageService = _storageService;
    this._chatService = _chatService;
    this._logService = _logService;
    this._chatEntitlementService = _chatEntitlementService;
    this._commandService = _commandService;
    this._telemetryService = _telemetryService;
    this._keybindingService = _keybindingService;
    this._assignmentService = _assignmentService;
    this._chatWidgetService = _chatWidgetService;
    this._onDidDismissTip = this._register(new Emitter());
    this.onDidDismissTip = this._onDidDismissTip.event;
    this._onDidNavigateTip = this._register(new Emitter());
    this.onDidNavigateTip = this._onDidNavigateTip.event;
    this._onDidHideTip = this._register(new Emitter());
    this.onDidHideTip = this._onDidHideTip.event;
    this._onDidDisableTips = this._register(new Emitter());
    this.onDidDisableTips = this._onDidDisableTips.event;
    this._tipsHiddenForSession = false;
    this._tipCommandListener = this._register(new MutableDisposable());
    this._experimentalTipMessages = /* @__PURE__ */ new Map();
    this._tracker = this._register(instantiationService.createInstance(TipEligibilityTracker, TIP_CATALOG));
    this._createSlashCommandsUsageTracker = this._register(new CreateSlashCommandsUsageTracker(this._chatService, this._storageService, () => this._contextKeyService));
    this._fetchExperimentalTipMessages();
    this._register(this._assignmentService.onDidRefetchAssignments(() => this._fetchExperimentalTipMessages()));
    this._register(this._chatEntitlementService.onDidChangeQuotaExceeded(() => {
      if (this._chatEntitlementService.quotas.chat?.percentRemaining === 0 && this._shownTip) {
        this.hideTip();
      }
    }));
    this._register(this._chatService.onDidSubmitRequest((e) => {
      const message = e.message ?? this._chatService.getSession(e.chatSessionResource)?.lastRequest?.message;
      if (!message) {
        return;
      }
      if (this._hasFileOrFolderReference(message)) {
        this._tracker.recordCommandExecuted(TipTrackingCommands.AttachFilesReferenceUsed);
      }
      const slashCommandTrackingId = this._getSlashCommandTrackingId(message);
      if (slashCommandTrackingId) {
        this._tracker.recordCommandExecuted(slashCommandTrackingId);
      }
      this._hideShownTipIfNowIneligible();
    }));
    this._thinkingPhrasesEverModified = this._storageService.getBoolean(ChatTipStorageKeys.ThinkingPhrasesEverModified, StorageScope.APPLICATION, false);
    if (!this._thinkingPhrasesEverModified && this._isSettingModified(ChatConfiguration.ThinkingPhrases)) {
      this._thinkingPhrasesEverModified = true;
      this._storageService.store(ChatTipStorageKeys.ThinkingPhrasesEverModified, true, StorageScope.APPLICATION, StorageTarget.MACHINE);
    }
    if (!this._thinkingPhrasesEverModified) {
      this._register(this._configurationService.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration(ChatConfiguration.ThinkingPhrases)) {
          this._thinkingPhrasesEverModified = true;
          this._storageService.store(ChatTipStorageKeys.ThinkingPhrasesEverModified, true, StorageScope.APPLICATION, StorageTarget.MACHINE);
        }
      }));
    }
    this._register(CommandsRegistry.onDidRegisterCommand((commandId) => {
      this._hideShownTipIfNowIneligible();
      if (this._tipRequestId === "welcome" && TIP_CATALOG.some((tip) => tip.requiresCommands?.includes(commandId))) {
        this._tipRequestId = void 0;
      }
    }));
  }
  _hasFileOrFolderReference(message) {
    return message.parts.some((part) => {
      if (part.kind !== ChatRequestDynamicVariablePart.Kind) {
        return false;
      }
      const dynamicPart = part;
      return dynamicPart.isFile === true || dynamicPart.isDirectory === true;
    });
  }
  _getSlashCommandTrackingId(message) {
    for (const part of message.parts) {
      if (part.kind === ChatRequestSlashCommandPart.Kind) {
        const slashCommand = part.slashCommand.command;
        return this._toSlashCommandTrackingId(slashCommand);
      }
      if (part.kind === ChatRequestAgentSubcommandPart.Kind) {
        const subCommand = part.command.name;
        return this._toSlashCommandTrackingId(subCommand);
      }
    }
    const trimmed = message.text.trimStart();
    const match = /^(?:@\S+\s+)?\/(init|create-(?:instructions|prompt|agent|skill)|fork)(?:\s|$)/.exec(trimmed);
    return match ? this._toSlashCommandTrackingId(match[1]) : void 0;
  }
  _toSlashCommandTrackingId(command) {
    switch (command) {
      case "init":
      case "create-instructions":
        return CREATE_AGENT_INSTRUCTIONS_TRACKING_COMMAND;
      case "create-prompt":
        return CREATE_PROMPT_TRACKING_COMMAND;
      case "create-agent":
        return CREATE_AGENT_TRACKING_COMMAND;
      case "create-skill":
        return CREATE_SKILL_TRACKING_COMMAND;
      case "fork":
        return FORK_CONVERSATION_TRACKING_COMMAND;
      default:
        return void 0;
    }
  }
  recordSlashCommandUsage(command) {
    const trackingId = this._toSlashCommandTrackingId(command);
    if (!trackingId) {
      return;
    }
    this._tracker.recordCommandExecuted(trackingId);
    this._hideShownTipIfNowIneligible();
  }
  resetSession() {
    this._shownTip = void 0;
    this._tipRequestId = void 0;
    this._contextKeyService = void 0;
    this._tipsHiddenForSession = false;
  }
  dismissTip() {
    if (this._shownTip) {
      this._logTipTelemetry(this._shownTip.id, "dismissed");
      const dismissed = new Set(this._getDismissedTipIds());
      dismissed.add(this._shownTip.id);
      this._storageService.store(ChatTipStorageKeys.DismissedTips, JSON.stringify([...dismissed]), StorageScope.APPLICATION, StorageTarget.MACHINE);
    }
    this._tipRequestId = void 0;
    this._onDidDismissTip.fire();
  }
  dismissTipForSession() {
    this.dismissTip();
    this.hideTipsForSession();
  }
  clearDismissedTips() {
    this._storageService.remove(ChatTipStorageKeys.DismissedTips, StorageScope.APPLICATION);
    this._storageService.remove(ChatTipStorageKeys.DismissedTips, StorageScope.PROFILE);
    this._shownTip = void 0;
    this._tipRequestId = void 0;
    this._contextKeyService = void 0;
    this._tipsHiddenForSession = false;
    this._onDidDismissTip.fire();
  }
  _getDismissedTipIds() {
    const raw = this._readApplicationWithProfileFallback(ChatTipStorageKeys.DismissedTips);
    if (!raw) {
      return [];
    }
    try {
      const parsed = JSON.parse(raw);
      this._logService.debug("#ChatTips dismissed:", parsed);
      if (!Array.isArray(parsed)) {
        return [];
      }
      const knownTipIds = new Set(TIP_CATALOG.map((tip) => tip.id));
      const dismissed = /* @__PURE__ */ new Set();
      for (const value of parsed) {
        if (typeof value === "string" && knownTipIds.has(value)) {
          dismissed.add(value);
        }
      }
      return [...dismissed];
    } catch {
      return [];
    }
  }
  hideTip() {
    if (this._shownTip) {
      this._logTipTelemetry(this._shownTip.id, "hidden");
    }
    this._shownTip = void 0;
    this._tipRequestId = void 0;
    this._onDidHideTip.fire();
  }
  hideTipsForSession() {
    if (this._tipsHiddenForSession) {
      return;
    }
    this._tipsHiddenForSession = true;
    this._shownTip = void 0;
    this._tipRequestId = void 0;
    this._onDidHideTip.fire();
  }
  async disableTips() {
    if (this._shownTip) {
      this._logTipTelemetry(this._shownTip.id, "disabled");
    }
    this._shownTip = void 0;
    this._tipRequestId = void 0;
    await this._configurationService.updateValue("chat.tips.enabled", false, ConfigurationTarget.APPLICATION);
    this._onDidDisableTips.fire();
  }
  getWelcomeTip(contextKeyService) {
    this._createSlashCommandsUsageTracker.syncContextKey(contextKeyService);
    this._tracker.recordCurrentMode(contextKeyService);
    this._tracker.refreshPromptFileExclusions();
    if (!this._configurationService.getValue("chat.tips.enabled")) {
      return void 0;
    }
    if (this._tipsHiddenForSession) {
      return void 0;
    }
    this._contextKeyService = contextKeyService;
    if (!this._isCopilotEnabled()) {
      return void 0;
    }
    if (this._chatEntitlementService.entitlement === ChatEntitlement.Unknown && !this._chatEntitlementService.hasByokModels) {
      return void 0;
    }
    if (!this._isChatLocation(contextKeyService)) {
      return void 0;
    }
    if (!this._hasSingleForegroundChatSurface(contextKeyService)) {
      return void 0;
    }
    if (this._isChatQuotaExceeded(contextKeyService)) {
      return void 0;
    }
    if (this._tipRequestId === "welcome" && this._shownTip) {
      if (this._shownTip.id !== "tip.switchToAuto") {
        const switchToAutoTip = TIP_CATALOG.find((tip2) => tip2.id === "tip.switchToAuto");
        if (switchToAutoTip) {
          const dismissedIds = new Set(this._getDismissedTipIds());
          if (!dismissedIds.has(switchToAutoTip.id) && this._isEligible(switchToAutoTip, contextKeyService)) {
            this._shownTip = switchToAutoTip;
            this._storageService.store(ChatTipStorageKeys.LastTipId, switchToAutoTip.id, StorageScope.APPLICATION, StorageTarget.USER);
            const tip2 = this._createTip(switchToAutoTip);
            this._logTipTelemetry(switchToAutoTip.id, "shown");
            this._trackTipCommandClicks(switchToAutoTip);
            this._onDidNavigateTip.fire(tip2);
            return tip2;
          }
        }
      }
      if (!this._isEligible(this._shownTip, contextKeyService)) {
        if (this._tracker.isExcluded(this._shownTip)) {
          this.hideTip();
          return void 0;
        }
        const nextTip = this._findNextEligibleTip(this._shownTip.id, contextKeyService);
        if (nextTip) {
          this._shownTip = nextTip;
          this._storageService.store(ChatTipStorageKeys.LastTipId, nextTip.id, StorageScope.APPLICATION, StorageTarget.USER);
          const tip2 = this._createTip(nextTip);
          this._onDidNavigateTip.fire(tip2);
          return tip2;
        }
        this.hideTip();
        return void 0;
      }
      return this._createTip(this._shownTip);
    }
    const tip = this._pickTip("welcome", contextKeyService);
    return tip;
  }
  _hasSingleForegroundChatSurface(contextKeyService) {
    const foregroundSessionCount = contextKeyService.getContextKeyValue(ChatContextKeys.foregroundSessionCount.key);
    return foregroundSessionCount === 1 || foregroundSessionCount === 0 && contextKeyService.getContextKeyValue(IsSessionsWindowContext.key) === true;
  }
  _findNextEligibleTip(currentTipId, contextKeyService) {
    this._createSlashCommandsUsageTracker.syncContextKey(contextKeyService);
    const currentIndex = TIP_CATALOG.findIndex((tip) => tip.id === currentTipId);
    if (currentIndex === -1) {
      return void 0;
    }
    const dismissedIds = new Set(this._getDismissedTipIds());
    for (let i = 1; i < TIP_CATALOG.length; i++) {
      const idx = (currentIndex + i) % TIP_CATALOG.length;
      const candidate = TIP_CATALOG[idx];
      if (!dismissedIds.has(candidate.id) && this._isEligible(candidate, contextKeyService)) {
        return candidate;
      }
    }
    return void 0;
  }
  _hideShownTipIfNowIneligible() {
    if (!this._shownTip || !this._contextKeyService) {
      return;
    }
    if (this._tipsHiddenForSession) {
      return;
    }
    let eligible;
    try {
      eligible = this._isEligible(this._shownTip, this._contextKeyService);
    } catch (err) {
      this._contextKeyService = void 0;
      return;
    }
    if (eligible) {
      return;
    }
    this.hideTip();
  }
  _pickTip(sourceId, contextKeyService) {
    this._createSlashCommandsUsageTracker.syncContextKey(contextKeyService);
    this._tracker.recordCurrentMode(contextKeyService);
    const dismissedIds = new Set(this._getDismissedTipIds());
    const eligibleTips = TIP_CATALOG.filter((tip) => !dismissedIds.has(tip.id) && this._isEligible(tip, contextKeyService));
    const selectedTip = this._selectTipByTier(eligibleTips);
    if (!selectedTip) {
      return void 0;
    }
    this._storageService.store(ChatTipStorageKeys.LastTipId, selectedTip.id, StorageScope.APPLICATION, StorageTarget.USER);
    this._tipRequestId = sourceId;
    this._shownTip = selectedTip;
    this._logTipTelemetry(selectedTip.id, "shown");
    this._trackTipCommandClicks(selectedTip);
    return this._createTip(selectedTip);
  }
  _selectTipByTier(eligibleTips) {
    const foundationalTips = eligibleTips.filter((tip) => tip.tier === ChatTipTier.Foundational);
    if (foundationalTips.length) {
      return this._sortByPriorityAndCatalogOrder(foundationalTips)[0];
    }
    const qolTips = eligibleTips.filter((tip) => tip.tier === ChatTipTier.Qol);
    if (!qolTips.length) {
      return void 0;
    }
    const randomIndex = Math.floor(Math.random() * qolTips.length);
    return qolTips[randomIndex];
  }
  navigateToNextTip() {
    if (!this._contextKeyService) {
      return void 0;
    }
    return this._navigateTip(1, this._contextKeyService);
  }
  navigateToPreviousTip() {
    if (!this._contextKeyService) {
      return void 0;
    }
    return this._navigateTip(-1, this._contextKeyService);
  }
  getNextEligibleTip() {
    if (!this._contextKeyService || !this._shownTip) {
      return void 0;
    }
    const contextKeyService = this._contextKeyService;
    this._createSlashCommandsUsageTracker.syncContextKey(contextKeyService);
    const currentTipId = this._shownTip.id;
    const orderedTips = this._getOrderedEligibleTips(contextKeyService, { includeTipId: currentTipId });
    if (!orderedTips.length) {
      return void 0;
    }
    const currentIndex = orderedTips.findIndex((tip) => tip.id === currentTipId);
    const candidate = this._getNextTipFromOrderedList(orderedTips, currentIndex, currentTipId);
    if (candidate) {
      this._shownTip = candidate;
      this._tipRequestId = "welcome";
      this._storageService.store(ChatTipStorageKeys.LastTipId, candidate.id, StorageScope.APPLICATION, StorageTarget.USER);
      this._logTipTelemetry(candidate.id, "shown");
      this._trackTipCommandClicks(candidate);
      return this._createTip(candidate);
    }
    return void 0;
  }
  _getNextTipFromOrderedList(orderedTips, startIndex, currentTipId) {
    if (!orderedTips.length) {
      return void 0;
    }
    const fallbackIndex = 0;
    const normalizedStartIndex = startIndex === -1 ? fallbackIndex : startIndex;
    for (let i = 1; i <= orderedTips.length; i++) {
      const index = (normalizedStartIndex + i) % orderedTips.length;
      const candidate = orderedTips[index];
      if (candidate.id !== currentTipId) {
        return candidate;
      }
    }
    return void 0;
  }
  hasMultipleTips() {
    if (!this._contextKeyService) {
      return false;
    }
    this._createSlashCommandsUsageTracker.syncContextKey(this._contextKeyService);
    return this._hasNavigableTip(this._contextKeyService);
  }
  _navigateTip(direction, contextKeyService) {
    this._createSlashCommandsUsageTracker.syncContextKey(contextKeyService);
    if (!this._shownTip) {
      return void 0;
    }
    const orderedTips = this._getOrderedEligibleTips(contextKeyService);
    if (!orderedTips.length) {
      return void 0;
    }
    const currentIndex = orderedTips.findIndex((tip) => tip.id === this._shownTip.id);
    if (orderedTips.length === 1 && currentIndex !== -1) {
      return void 0;
    }
    const fallbackIndex = direction === 1 ? 0 : orderedTips.length - 1;
    const nextIndex = currentIndex === -1 ? fallbackIndex : (currentIndex + direction + orderedTips.length) % orderedTips.length;
    const candidate = orderedTips[nextIndex];
    if (candidate) {
      this._logTipTelemetry(this._shownTip.id, direction === 1 ? "navigateNext" : "navigatePrevious");
      this._shownTip = candidate;
      this._tipRequestId = "welcome";
      this._storageService.store(ChatTipStorageKeys.LastTipId, candidate.id, StorageScope.APPLICATION, StorageTarget.USER);
      this._logTipTelemetry(candidate.id, "shown");
      this._trackTipCommandClicks(candidate);
      const tip = this._createTip(candidate);
      this._onDidNavigateTip.fire(tip);
      return tip;
    }
    return void 0;
  }
  _hasNavigableTip(contextKeyService) {
    const orderedTips = this._getOrderedEligibleTips(contextKeyService);
    if (!orderedTips.length) {
      return false;
    }
    if (!this._shownTip) {
      return orderedTips.length > 1;
    }
    if (orderedTips.length > 1) {
      return true;
    }
    return orderedTips[0].id !== this._shownTip.id;
  }
  _getOrderedEligibleTips(contextKeyService, options) {
    const dismissedIds = new Set(this._getDismissedTipIds());
    const eligibleTips = TIP_CATALOG.filter((tip) => {
      if (options?.includeTipId && tip.id === options.includeTipId) {
        return true;
      }
      if (options?.excludeShownTip && this._shownTip && tip.id === this._shownTip.id) {
        return false;
      }
      return !dismissedIds.has(tip.id) && this._isEligible(tip, contextKeyService);
    });
    const foundationalTips = this._sortByPriorityAndCatalogOrder(eligibleTips.filter((tip) => tip.tier === ChatTipTier.Foundational));
    const qolTips = this._sortByPriorityAndCatalogOrder(eligibleTips.filter((tip) => tip.tier === ChatTipTier.Qol));
    return [...foundationalTips, ...qolTips];
  }
  _sortByPriorityAndCatalogOrder(tips) {
    return [...tips].sort((a, b) => {
      const aPriority = a.priority ?? Number.POSITIVE_INFINITY;
      const bPriority = b.priority ?? Number.POSITIVE_INFINITY;
      if (aPriority !== bPriority) {
        return aPriority - bPriority;
      }
      const aCatalogIndex = TIP_CATALOG.findIndex((tip) => tip.id === a.id);
      const bCatalogIndex = TIP_CATALOG.findIndex((tip) => tip.id === b.id);
      return aCatalogIndex - bCatalogIndex;
    });
  }
  _isEligible(tip, contextKeyService) {
    if (tip.onlyWhenModelIds?.length) {
      const currentModelId = this._getCurrentChatModelId(contextKeyService);
      const isModelMatch = tip.onlyWhenModelIds.some((modelId) => currentModelId === modelId || currentModelId.startsWith(`${modelId}-`));
      if (!isModelMatch) {
        return false;
      }
    }
    if (tip.excludeWhenSettingsChanged?.some((setting) => this._isSettingModified(setting))) {
      this._logService.debug("#ChatTips: tip excluded because setting was modified", tip.id, tip.excludeWhenSettingsChanged);
      return false;
    }
    if (tip.when && !contextKeyService.contextMatchesRules(tip.when)) {
      this._logService.debug("#ChatTips: tip is not eligible due to when clause", tip.id, tip.when.serialize());
      return false;
    }
    if (tip.requiresModeNames?.some((modeName) => !this._isModeAvailable(modeName, contextKeyService))) {
      this._logService.debug("#ChatTips: tip is not eligible because a required mode is not available", tip.id, tip.requiresModeNames);
      return false;
    }
    if (tip.requiresCommands?.some((commandId) => !CommandsRegistry.getCommand(commandId))) {
      this._logService.debug("#ChatTips: tip is not eligible because a required command is not registered", tip.id, tip.requiresCommands);
      return false;
    }
    if (this._tracker.isExcluded(tip)) {
      return false;
    }
    if (tip.id === "tip.thinkingPhrases" && this._thinkingPhrasesEverModified) {
      this._logService.debug("#ChatTips: tip excluded because thinking phrases setting was previously modified", tip.id);
      return false;
    }
    if (!this._areTipCommandsRegistered(tip)) {
      return false;
    }
    this._logService.debug("#ChatTips: tip is eligible", tip.id);
    return true;
  }
  _isModeAvailable(modeName, contextKeyService) {
    const widget = this._chatWidgetService.getAllWidgets().find((widget2) => widget2.scopedContextKeyService === contextKeyService);
    return !!widget?.input.currentChatModesObs.get().findModeByName(modeName);
  }
  _areTipCommandsRegistered(tip) {
    const ctx = { keybindingService: this._keybindingService, experimentalTipMessages: this._experimentalTipMessages };
    const rawMessage = tip.buildMessage(ctx);
    const commandIds = extractCommandIds(rawMessage.value);
    for (const commandId of commandIds) {
      if (!CommandsRegistry.getCommand(commandId)) {
        this._logService.debug("#ChatTips: tip excluded because command is not registered", tip.id, commandId);
        return false;
      }
    }
    return true;
  }
  _isSettingModified(key) {
    const inspected = this._configurationService.inspect(key);
    return inspected.userValue !== void 0 || inspected.userLocalValue !== void 0 || inspected.userRemoteValue !== void 0 || inspected.workspaceValue !== void 0 || inspected.workspaceFolderValue !== void 0;
  }
  _getCurrentChatModelId(contextKeyService) {
    const normalize = (modelId) => {
      const normalizedModelId = modelId?.toLowerCase() ?? "";
      if (!normalizedModelId) {
        return "";
      }
      if (normalizedModelId.includes("/")) {
        return normalizedModelId.split("/").at(-1) ?? "";
      }
      return normalizedModelId;
    };
    return normalize(getSelectedModelIdentifier(contextKeyService, this._storageService));
  }
  _isChatLocation(contextKeyService) {
    const location = contextKeyService.getContextKeyValue(ChatContextKeys.location.key);
    return !location || location === ChatAgentLocation.Chat;
  }
  _isChatQuotaExceeded(contextKeyService) {
    return contextKeyService.getContextKeyValue(ChatContextKeys.chatQuotaExceeded.key) === true;
  }
  _isCopilotEnabled() {
    const defaultChatAgent = this._productService.defaultChatAgent;
    return !!defaultChatAgent?.chatExtensionId;
  }
  _fetchExperimentalTipMessages() {
    this._assignmentService.getTreatment(ChatTipExperiment.OpenAgentsWindowTip).then((value) => {
      if (typeof value === "string" && value.length > 0) {
        this._experimentalTipMessages.set(ChatTipExperiment.OpenAgentsWindowTip, value);
      }
    });
  }
  _createTip(tipDef) {
    const ctx = { keybindingService: this._keybindingService, experimentalTipMessages: this._experimentalTipMessages };
    const rawMessage = tipDef.buildMessage(ctx);
    const prefixedMessage = localize("tipPrefix", "**Tip:** {0}", rawMessage.value);
    const enabledCommands = extractCommandIds(prefixedMessage);
    const markdown = new MarkdownString(prefixedMessage, {
      isTrusted: enabledCommands.length > 0 ? { enabledCommands } : false
    });
    return {
      id: tipDef.id,
      content: markdown,
      enabledCommands
    };
  }
  _logTipTelemetry(tipId, action, commandId) {
    this._telemetryService.publicLog2("chatTip", {
      tipId,
      action,
      commandId
    });
  }
  _trackTipCommandClicks(tip) {
    this._tipCommandListener.clear();
    const ctx = { keybindingService: this._keybindingService, experimentalTipMessages: this._experimentalTipMessages };
    const rawMessage = tip.buildMessage(ctx);
    const enabledCommands = extractCommandIds(rawMessage.value);
    if (!enabledCommands.length) {
      return;
    }
    const enabledCommandSet = new Set(enabledCommands);
    this._tipCommandListener.value = this._commandService.onDidExecuteCommand((e) => {
      if (enabledCommandSet.has(e.commandId) && this._shownTip?.id === tip.id) {
        this._logTipTelemetry(tip.id, "commandClicked", e.commandId);
        this.dismissTipForSession();
      }
    });
  }
  _readApplicationWithProfileFallback(key) {
    const applicationValue = this._storageService.get(key, StorageScope.APPLICATION);
    if (applicationValue) {
      return applicationValue;
    }
    const profileValue = this._storageService.get(key, StorageScope.PROFILE);
    if (profileValue) {
      this._storageService.store(key, profileValue, StorageScope.APPLICATION, StorageTarget.MACHINE);
    }
    return profileValue;
  }
};
ChatTipService = __decorateClass([
  __decorateParam(0, IProductService),
  __decorateParam(1, IConfigurationService),
  __decorateParam(2, IStorageService),
  __decorateParam(3, IChatService),
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, ILogService),
  __decorateParam(6, IChatEntitlementService),
  __decorateParam(7, ICommandService),
  __decorateParam(8, ITelemetryService),
  __decorateParam(9, IKeybindingService),
  __decorateParam(10, IWorkbenchAssignmentService),
  __decorateParam(11, IChatWidgetService)
], ChatTipService);
export {
  ATTACH_FILES_REFERENCE_TRACKING_COMMAND,
  CREATE_AGENT_INSTRUCTIONS_TRACKING_COMMAND,
  CREATE_AGENT_TRACKING_COMMAND,
  CREATE_PROMPT_TRACKING_COMMAND,
  CREATE_SKILL_TRACKING_COMMAND,
  ChatTipService,
  FORK_CONVERSATION_TRACKING_COMMAND,
  IChatTipService,
  TipEligibilityTracker2 as TipEligibilityTracker,
  TipTrackingCommands
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXGNoYXRUaXBTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgY3JlYXRlRGVjb3JhdG9yLCBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRDb250ZXh0S2V5cyB9IGZyb20gJy4uL2NvbW1vbi9hY3Rpb25zL2NoYXRDb250ZXh0S2V5cy5qcyc7XG5pbXBvcnQgeyBnZXRTZWxlY3RlZE1vZGVsSWRlbnRpZmllciB9IGZyb20gJy4uL2NvbW1vbi9jaGF0U2VsZWN0ZWRNb2RlbC5qcyc7XG5pbXBvcnQgeyBDaGF0QWdlbnRMb2NhdGlvbiwgQ2hhdENvbmZpZ3VyYXRpb24gfSBmcm9tICcuLi9jb21tb24vY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IENvbmZpZ3VyYXRpb25UYXJnZXQsIElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgTXV0YWJsZURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgQ29tbWFuZHNSZWdpc3RyeSwgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElDaGF0U2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9jaGF0U2VydmljZS9jaGF0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBDcmVhdGVTbGFzaENvbW1hbmRzVXNhZ2VUcmFja2VyIH0gZnJvbSAnLi9jcmVhdGVTbGFzaENvbW1hbmRzVXNhZ2VUcmFja2VyLmpzJztcbmltcG9ydCB7IENoYXRFbnRpdGxlbWVudCwgSUNoYXRFbnRpdGxlbWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9jaGF0L2NvbW1vbi9jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgQ2hhdFJlcXVlc3RBZ2VudFN1YmNvbW1hbmRQYXJ0LCBDaGF0UmVxdWVzdER5bmFtaWNWYXJpYWJsZVBhcnQsIENoYXRSZXF1ZXN0U2xhc2hDb21tYW5kUGFydCwgSVBhcnNlZENoYXRSZXF1ZXN0IH0gZnJvbSAnLi4vY29tbW9uL3JlcXVlc3RQYXJzZXIvY2hhdFBhcnNlclR5cGVzLmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgVGlwRWxpZ2liaWxpdHlUcmFja2VyIH0gZnJvbSAnLi9jaGF0VGlwRWxpZ2liaWxpdHlUcmFja2VyLmpzJztcbmltcG9ydCB7IENoYXRUaXBFeHBlcmltZW50LCBDaGF0VGlwVGllciwgZXh0cmFjdENvbW1hbmRJZHMsIElUaXBCdWlsZENvbnRleHQsIElUaXBEZWZpbml0aW9uLCBUSVBfQ0FUQUxPRyB9IGZyb20gJy4vY2hhdFRpcENhdGFsb2cuanMnO1xuaW1wb3J0IHsgQ2hhdFRpcFN0b3JhZ2VLZXlzLCBUaXBUcmFja2luZ0NvbW1hbmRzIH0gZnJvbSAnLi9jaGF0VGlwU3RvcmFnZUtleXMuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaEFzc2lnbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvYXNzaWdubWVudC9jb21tb24vYXNzaWdubWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSXNTZXNzaW9uc1dpbmRvd0NvbnRleHQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udGV4dGtleXMuanMnO1xuaW1wb3J0IHsgSUNoYXRXaWRnZXRTZXJ2aWNlIH0gZnJvbSAnLi9jaGF0LmpzJztcblxudHlwZSBDaGF0VGlwRXZlbnQgPSB7XG5cdHRpcElkOiBzdHJpbmc7XG5cdGFjdGlvbjogc3RyaW5nO1xuXHRjb21tYW5kSWQ/OiBzdHJpbmc7XG59O1xuXG50eXBlIENoYXRUaXBDbGFzc2lmaWNhdGlvbiA9IHtcblx0dGlwSWQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgaWRlbnRpZmllciBvZiB0aGUgdGlwLicgfTtcblx0YWN0aW9uOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGhlIGFjdGlvbiBwZXJmb3JtZWQgb24gdGhlIHRpcCAoc2hvd24sIGRpc21pc3NlZCwgbmF2aWdhdGVOZXh0LCBuYXZpZ2F0ZVByZXZpb3VzLCBoaWRkZW4sIGRpc2FibGVkLCBjb21tYW5kQ2xpY2tlZCkuJyB9O1xuXHRjb21tYW5kSWQ/OiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGhlIGNvbW1hbmQgSUQgdGhhdCB3YXMgY2xpY2tlZCwgaWYgYXBwbGljYWJsZS4nIH07XG5cdG93bmVyOiAnbWVnYW5yb2dnZSc7XG5cdGNvbW1lbnQ6ICdUcmFja3MgdXNlciBpbnRlcmFjdGlvbnMgd2l0aCBjaGF0IHRpcHMgdG8gdW5kZXJzdGFuZCB3aGljaCB0aXBzIHJlc29uYXRlIGFuZCB3aGljaCBhcmUgZGlzbWlzc2VkLic7XG59O1xuXG4vLyBSZS1leHBvcnQgdHJhY2tpbmcgY29tbWFuZHMgZm9yIGJhY2t3YXJkcyBjb21wYXRpYmlsaXR5XG5leHBvcnQgeyBUaXBUcmFja2luZ0NvbW1hbmRzIH07XG4vKiogQGRlcHJlY2F0ZWQgVXNlIFRpcFRyYWNraW5nQ29tbWFuZHMuQXR0YWNoRmlsZXNSZWZlcmVuY2VVc2VkICovXG5leHBvcnQgY29uc3QgQVRUQUNIX0ZJTEVTX1JFRkVSRU5DRV9UUkFDS0lOR19DT01NQU5EID0gVGlwVHJhY2tpbmdDb21tYW5kcy5BdHRhY2hGaWxlc1JlZmVyZW5jZVVzZWQ7XG4vKiogQGRlcHJlY2F0ZWQgVXNlIFRpcFRyYWNraW5nQ29tbWFuZHMuQ3JlYXRlQWdlbnRJbnN0cnVjdGlvbnNVc2VkICovXG5leHBvcnQgY29uc3QgQ1JFQVRFX0FHRU5UX0lOU1RSVUNUSU9OU19UUkFDS0lOR19DT01NQU5EID0gVGlwVHJhY2tpbmdDb21tYW5kcy5DcmVhdGVBZ2VudEluc3RydWN0aW9uc1VzZWQ7XG4vKiogQGRlcHJlY2F0ZWQgVXNlIFRpcFRyYWNraW5nQ29tbWFuZHMuQ3JlYXRlUHJvbXB0VXNlZCAqL1xuZXhwb3J0IGNvbnN0IENSRUFURV9QUk9NUFRfVFJBQ0tJTkdfQ09NTUFORCA9IFRpcFRyYWNraW5nQ29tbWFuZHMuQ3JlYXRlUHJvbXB0VXNlZDtcbi8qKiBAZGVwcmVjYXRlZCBVc2UgVGlwVHJhY2tpbmdDb21tYW5kcy5DcmVhdGVBZ2VudFVzZWQgKi9cbmV4cG9ydCBjb25zdCBDUkVBVEVfQUdFTlRfVFJBQ0tJTkdfQ09NTUFORCA9IFRpcFRyYWNraW5nQ29tbWFuZHMuQ3JlYXRlQWdlbnRVc2VkO1xuLyoqIEBkZXByZWNhdGVkIFVzZSBUaXBUcmFja2luZ0NvbW1hbmRzLkNyZWF0ZVNraWxsVXNlZCAqL1xuZXhwb3J0IGNvbnN0IENSRUFURV9TS0lMTF9UUkFDS0lOR19DT01NQU5EID0gVGlwVHJhY2tpbmdDb21tYW5kcy5DcmVhdGVTa2lsbFVzZWQ7XG4vKiogQGRlcHJlY2F0ZWQgVXNlIFRpcFRyYWNraW5nQ29tbWFuZHMuRm9ya0NvbnZlcnNhdGlvblVzZWQgKi9cbmV4cG9ydCBjb25zdCBGT1JLX0NPTlZFUlNBVElPTl9UUkFDS0lOR19DT01NQU5EID0gVGlwVHJhY2tpbmdDb21tYW5kcy5Gb3JrQ29udmVyc2F0aW9uVXNlZDtcblxuZXhwb3J0IGNvbnN0IElDaGF0VGlwU2VydmljZSA9IGNyZWF0ZURlY29yYXRvcjxJQ2hhdFRpcFNlcnZpY2U+KCdjaGF0VGlwU2VydmljZScpO1xuXG5leHBvcnQgaW50ZXJmYWNlIElDaGF0VGlwIHtcblx0cmVhZG9ubHkgaWQ6IHN0cmluZztcblx0cmVhZG9ubHkgY29udGVudDogTWFya2Rvd25TdHJpbmc7XG5cdHJlYWRvbmx5IGVuYWJsZWRDb21tYW5kcz86IHJlYWRvbmx5IHN0cmluZ1tdO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElDaGF0VGlwU2VydmljZSB7XG5cdHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHQvKipcblx0ICogRmlyZWQgd2hlbiB0aGUgY3VycmVudCB0aXAgaXMgZGlzbWlzc2VkLlxuXHQgKi9cblx0cmVhZG9ubHkgb25EaWREaXNtaXNzVGlwOiBFdmVudDx2b2lkPjtcblxuXHQvKipcblx0ICogRmlyZWQgd2hlbiB0aGUgdXNlciBuYXZpZ2F0ZXMgdG8gYSBkaWZmZXJlbnQgdGlwIChwcmV2aW91cy9uZXh0KS5cblx0ICovXG5cdHJlYWRvbmx5IG9uRGlkTmF2aWdhdGVUaXA6IEV2ZW50PElDaGF0VGlwPjtcblxuXHQvKipcblx0ICogRmlyZWQgd2hlbiB0aGUgdGlwIHdpZGdldCBpcyBoaWRkZW4gd2l0aG91dCBkaXNtaXNzaW5nIHRoZSB0aXAuXG5cdCAqL1xuXHRyZWFkb25seSBvbkRpZEhpZGVUaXA6IEV2ZW50PHZvaWQ+O1xuXG5cdC8qKlxuXHQgKiBGaXJlZCB3aGVuIHRpcHMgYXJlIGRpc2FibGVkLlxuXHQgKi9cblx0cmVhZG9ubHkgb25EaWREaXNhYmxlVGlwczogRXZlbnQ8dm9pZD47XG5cblx0LyoqXG5cdCAqIEdldHMgYSB0aXAgdG8gc2hvdyBvbiB0aGUgd2VsY29tZS9nZXR0aW5nLXN0YXJ0ZWQgdmlldy5cblx0ICogUmV0dXJucyB0aGUgc2FtZSB0aXAgb24gcmVwZWF0ZWQgY2FsbHMgZm9yIHN0YWJsZSByZXJlbmRlcnMuXG5cdCAqL1xuXHRnZXRXZWxjb21lVGlwKGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UpOiBJQ2hhdFRpcCB8IHVuZGVmaW5lZDtcblxuXHQvKipcblx0ICogUmVzZXRzIHRpcCBzdGF0ZSBmb3IgYSBuZXcgY29udmVyc2F0aW9uLlxuXHQgKiBDYWxsIHRoaXMgd2hlbiB0aGUgY2hhdCB3aWRnZXQgYmluZHMgdG8gYSBuZXcgbW9kZWwuXG5cdCAqL1xuXHRyZXNldFNlc3Npb24oKTogdm9pZDtcblxuXHQvKipcblx0ICogRGlzbWlzc2VzIHRoZSBjdXJyZW50IHRpcCBhbmQgYWxsb3dzIGEgbmV3IG9uZSB0byBiZSBwaWNrZWQgZm9yIHRoZSBzYW1lIHJlcXVlc3QuXG5cdCAqIFRoZSBkaXNtaXNzZWQgdGlwIHdpbGwgbm90IGJlIHNob3duIGFnYWluIGZvciB0aGlzIHVzZXIgb24gdGhpcyBhcHBsaWNhdGlvbiBpbnN0YWxsYXRpb24uXG5cdCAqL1xuXHRkaXNtaXNzVGlwKCk6IHZvaWQ7XG5cblx0LyoqXG5cdCAqIERpc21pc3NlcyB0aGUgY3VycmVudCB0aXAgYW5kIGhpZGVzIGFsbCB0aXBzIGZvciB0aGUgcmVzdCBvZiB0aGUgY3VycmVudCBjaGF0IHNlc3Npb24uXG5cdCAqL1xuXHRkaXNtaXNzVGlwRm9yU2Vzc2lvbigpOiB2b2lkO1xuXG5cdC8qKlxuXHQgKiBIaWRlcyB0aGUgdGlwIHdpZGdldCB3aXRob3V0IHBlcm1hbmVudGx5IGRpc21pc3NpbmcgdGhlIHRpcC5cblx0ICogVGhlIHRpcCBtYXkgYmUgc2hvd24gYWdhaW4gaW4gYSBmdXR1cmUgc2Vzc2lvbi5cblx0ICovXG5cdGhpZGVUaXAoKTogdm9pZDtcblxuXHQvKipcblx0ICogSGlkZXMgYWxsIHRpcHMgZm9yIHRoZSByZXN0IG9mIHRoZSBjdXJyZW50IGNoYXQgc2Vzc2lvbi5cblx0ICovXG5cdGhpZGVUaXBzRm9yU2Vzc2lvbigpOiB2b2lkO1xuXG5cdC8qKlxuXHQgKiBEaXNhYmxlcyB0aXBzIHBlcm1hbmVudGx5IGJ5IHNldHRpbmcgdGhlIGBjaGF0LnRpcHMuZW5hYmxlZGAgY29uZmlndXJhdGlvbiB0byBmYWxzZS5cblx0ICovXG5cdGRpc2FibGVUaXBzKCk6IFByb21pc2U8dm9pZD47XG5cblx0LyoqXG5cdCAqIE5hdmlnYXRlcyB0byB0aGUgbmV4dCB0aXAgaW4gdGhlIGNhdGFsb2cgd2l0aG91dCBwZXJtYW5lbnRseSBkaXNtaXNzaW5nIHRoZSBjdXJyZW50IG9uZS5cblx0ICovXG5cdG5hdmlnYXRlVG9OZXh0VGlwKCk6IElDaGF0VGlwIHwgdW5kZWZpbmVkO1xuXG5cdC8qKlxuXHQgKiBOYXZpZ2F0ZXMgdG8gdGhlIHByZXZpb3VzIHRpcCBpbiB0aGUgY2F0YWxvZyB3aXRob3V0IHBlcm1hbmVudGx5IGRpc21pc3NpbmcgdGhlIGN1cnJlbnQgb25lLlxuXHQgKi9cblx0bmF2aWdhdGVUb1ByZXZpb3VzVGlwKCk6IElDaGF0VGlwIHwgdW5kZWZpbmVkO1xuXG5cdC8qKlxuXHQgKiBHZXRzIHRoZSBuZXh0IGVsaWdpYmxlIHRpcCBhZnRlciB0aGUgY3VycmVudCBvbmUsIHdpdGhvdXQgcmVxdWlyaW5nIG11bHRpcGxlIHRpcHMuXG5cdCAqIFVzZWQgYWZ0ZXIgZGlzbWlzc2luZyBhIHRpcCB0byBzaG93IHRoZSBuZXh0IGF2YWlsYWJsZSB0aXAgKGV2ZW4gaWYgaXQncyB0aGUgb25seSBvbmUgbGVmdCkuXG5cdCAqL1xuXHRnZXROZXh0RWxpZ2libGVUaXAoKTogSUNoYXRUaXAgfCB1bmRlZmluZWQ7XG5cblx0LyoqXG5cdCAqIFJldHVybnMgd2hldGhlciB0aGVyZSBhcmUgbXVsdGlwbGUgZWxpZ2libGUgdGlwcyBmb3IgbmF2aWdhdGlvbi5cblx0ICovXG5cdGhhc011bHRpcGxlVGlwcygpOiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBSZWNvcmRzIHVzYWdlIG9mIGEgc2xhc2ggY29tbWFuZCB0byB1cGRhdGUgdGlwIGVsaWdpYmlsaXR5IGZvciBmbG93cyB3aGVyZVxuXHQgKiB0aGUgc2xhc2ggY29tbWFuZCB0ZXh0IGlzIHRyYW5zZm9ybWVkIGJlZm9yZSByZXF1ZXN0IHN1Ym1pc3Npb24uXG5cdCAqL1xuXHRyZWNvcmRTbGFzaENvbW1hbmRVc2FnZShjb21tYW5kOiBzdHJpbmcpOiB2b2lkO1xuXG5cdC8qKlxuXHQgKiBDbGVhcnMgYWxsIGRpc21pc3NlZCB0aXBzIHNvIHRoZXkgY2FuIGJlIHNob3duIGFnYWluLlxuXHQgKi9cblx0Y2xlYXJEaXNtaXNzZWRUaXBzKCk6IHZvaWQ7XG59XG5cbi8vIFJlLWV4cG9ydCB0eXBlcyBmb3IgYmFja3dhcmRzIGNvbXBhdGliaWxpdHlcbmV4cG9ydCB0eXBlIHsgSVRpcERlZmluaXRpb24gfSBmcm9tICcuL2NoYXRUaXBDYXRhbG9nLmpzJztcbmV4cG9ydCB7IFRpcEVsaWdpYmlsaXR5VHJhY2tlciB9IGZyb20gJy4vY2hhdFRpcEVsaWdpYmlsaXR5VHJhY2tlci5qcyc7XG5cbmV4cG9ydCBjbGFzcyBDaGF0VGlwU2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJQ2hhdFRpcFNlcnZpY2Uge1xuXHRyZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWREaXNtaXNzVGlwID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkRGlzbWlzc1RpcCA9IHRoaXMuX29uRGlkRGlzbWlzc1RpcC5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZE5hdmlnYXRlVGlwID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SUNoYXRUaXA+KCkpO1xuXHRyZWFkb25seSBvbkRpZE5hdmlnYXRlVGlwID0gdGhpcy5fb25EaWROYXZpZ2F0ZVRpcC5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZEhpZGVUaXAgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRIaWRlVGlwID0gdGhpcy5fb25EaWRIaWRlVGlwLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkRGlzYWJsZVRpcHMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWREaXNhYmxlVGlwcyA9IHRoaXMuX29uRGlkRGlzYWJsZVRpcHMuZXZlbnQ7XG5cblx0LyoqXG5cdCAqIFRoZSByZXF1ZXN0IElEIHRoYXQgd2FzIGFzc2lnbmVkIGEgdGlwIChmb3Igc3RhYmxlIHJlcmVuZGVycykuXG5cdCAqL1xuXHRwcml2YXRlIF90aXBSZXF1ZXN0SWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuXHQvKipcblx0ICogVGhlIHRpcCB0aGF0IHdhcyBzaG93biAoZm9yIHN0YWJsZSByZXJlbmRlcnMpLlxuXHQgKi9cblx0cHJpdmF0ZSBfc2hvd25UaXA6IElUaXBEZWZpbml0aW9uIHwgdW5kZWZpbmVkO1xuXG5cdC8qKlxuXHQgKiBUaGUgc2NvcGVkIGNvbnRleHQga2V5IHNlcnZpY2UgZnJvbSB0aGUgY2hhdCB3aWRnZXQsIHN0b3JlZCB3aGVuXG5cdCAqIHtAbGluayBnZXRXZWxjb21lVGlwfSBpcyBmaXJzdCBjYWxsZWQgc28gdGhhdCBuYXZpZ2F0aW9uIG1ldGhvZHNcblx0ICogY2FuIGV2YWx1YXRlIHdoZW4tY2xhdXNlIGVsaWdpYmlsaXR5IGFnYWluc3QgdGhlIGNvcnJlY3QgY29udGV4dC5cblx0ICovXG5cdHByaXZhdGUgX2NvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UgfCB1bmRlZmluZWQ7XG5cblxuXHRwcml2YXRlIHJlYWRvbmx5IF90cmFja2VyOiBUaXBFbGlnaWJpbGl0eVRyYWNrZXI7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NyZWF0ZVNsYXNoQ29tbWFuZHNVc2FnZVRyYWNrZXI6IENyZWF0ZVNsYXNoQ29tbWFuZHNVc2FnZVRyYWNrZXI7XG5cdHByaXZhdGUgX3RoaW5raW5nUGhyYXNlc0V2ZXJNb2RpZmllZDogYm9vbGVhbjtcblx0cHJpdmF0ZSBfdGlwc0hpZGRlbkZvclNlc3Npb24gPSBmYWxzZTtcblx0cHJpdmF0ZSByZWFkb25seSBfdGlwQ29tbWFuZExpc3RlbmVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9leHBlcmltZW50YWxUaXBNZXNzYWdlcyA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElQcm9kdWN0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9wcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3N0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElDaGF0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jaGF0U2VydmljZTogSUNoYXRTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElDaGF0RW50aXRsZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NoYXRFbnRpdGxlbWVudFNlcnZpY2U6IElDaGF0RW50aXRsZW1lbnRTZXJ2aWNlLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9rZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoQXNzaWdubWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfYXNzaWdubWVudFNlcnZpY2U6IElXb3JrYmVuY2hBc3NpZ25tZW50U2VydmljZSxcblx0XHRASUNoYXRXaWRnZXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NoYXRXaWRnZXRTZXJ2aWNlOiBJQ2hhdFdpZGdldFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fdHJhY2tlciA9IHRoaXMuX3JlZ2lzdGVyKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRpcEVsaWdpYmlsaXR5VHJhY2tlciwgVElQX0NBVEFMT0cpKTtcblx0XHR0aGlzLl9jcmVhdGVTbGFzaENvbW1hbmRzVXNhZ2VUcmFja2VyID0gdGhpcy5fcmVnaXN0ZXIobmV3IENyZWF0ZVNsYXNoQ29tbWFuZHNVc2FnZVRyYWNrZXIodGhpcy5fY2hhdFNlcnZpY2UsIHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLCAoKSA9PiB0aGlzLl9jb250ZXh0S2V5U2VydmljZSkpO1xuXHRcdHRoaXMuX2ZldGNoRXhwZXJpbWVudGFsVGlwTWVzc2FnZXMoKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9hc3NpZ25tZW50U2VydmljZS5vbkRpZFJlZmV0Y2hBc3NpZ25tZW50cygoKSA9PiB0aGlzLl9mZXRjaEV4cGVyaW1lbnRhbFRpcE1lc3NhZ2VzKCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLm9uRGlkQ2hhbmdlUXVvdGFFeGNlZWRlZCgoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5fY2hhdEVudGl0bGVtZW50U2VydmljZS5xdW90YXMuY2hhdD8ucGVyY2VudFJlbWFpbmluZyA9PT0gMCAmJiB0aGlzLl9zaG93blRpcCkge1xuXHRcdFx0XHR0aGlzLmhpZGVUaXAoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9jaGF0U2VydmljZS5vbkRpZFN1Ym1pdFJlcXVlc3QoZSA9PiB7XG5cdFx0XHRjb25zdCBtZXNzYWdlID0gZS5tZXNzYWdlID8/IHRoaXMuX2NoYXRTZXJ2aWNlLmdldFNlc3Npb24oZS5jaGF0U2Vzc2lvblJlc291cmNlKT8ubGFzdFJlcXVlc3Q/Lm1lc3NhZ2U7XG5cdFx0XHRpZiAoIW1lc3NhZ2UpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAodGhpcy5faGFzRmlsZU9yRm9sZGVyUmVmZXJlbmNlKG1lc3NhZ2UpKSB7XG5cdFx0XHRcdHRoaXMuX3RyYWNrZXIucmVjb3JkQ29tbWFuZEV4ZWN1dGVkKFRpcFRyYWNraW5nQ29tbWFuZHMuQXR0YWNoRmlsZXNSZWZlcmVuY2VVc2VkKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgc2xhc2hDb21tYW5kVHJhY2tpbmdJZCA9IHRoaXMuX2dldFNsYXNoQ29tbWFuZFRyYWNraW5nSWQobWVzc2FnZSk7XG5cdFx0XHRpZiAoc2xhc2hDb21tYW5kVHJhY2tpbmdJZCkge1xuXHRcdFx0XHR0aGlzLl90cmFja2VyLnJlY29yZENvbW1hbmRFeGVjdXRlZChzbGFzaENvbW1hbmRUcmFja2luZ0lkKTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5faGlkZVNob3duVGlwSWZOb3dJbmVsaWdpYmxlKCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fdGhpbmtpbmdQaHJhc2VzRXZlck1vZGlmaWVkID0gdGhpcy5fc3RvcmFnZVNlcnZpY2UuZ2V0Qm9vbGVhbihDaGF0VGlwU3RvcmFnZUtleXMuVGhpbmtpbmdQaHJhc2VzRXZlck1vZGlmaWVkLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04sIGZhbHNlKTtcblx0XHRpZiAoIXRoaXMuX3RoaW5raW5nUGhyYXNlc0V2ZXJNb2RpZmllZCAmJiB0aGlzLl9pc1NldHRpbmdNb2RpZmllZChDaGF0Q29uZmlndXJhdGlvbi5UaGlua2luZ1BocmFzZXMpKSB7XG5cdFx0XHR0aGlzLl90aGlua2luZ1BocmFzZXNFdmVyTW9kaWZpZWQgPSB0cnVlO1xuXHRcdFx0dGhpcy5fc3RvcmFnZVNlcnZpY2Uuc3RvcmUoQ2hhdFRpcFN0b3JhZ2VLZXlzLlRoaW5raW5nUGhyYXNlc0V2ZXJNb2RpZmllZCwgdHJ1ZSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHRcdH1cblx0XHRpZiAoIXRoaXMuX3RoaW5raW5nUGhyYXNlc0V2ZXJNb2RpZmllZCkge1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihDaGF0Q29uZmlndXJhdGlvbi5UaGlua2luZ1BocmFzZXMpKSB7XG5cdFx0XHRcdFx0dGhpcy5fdGhpbmtpbmdQaHJhc2VzRXZlck1vZGlmaWVkID0gdHJ1ZTtcblx0XHRcdFx0XHR0aGlzLl9zdG9yYWdlU2VydmljZS5zdG9yZShDaGF0VGlwU3RvcmFnZUtleXMuVGhpbmtpbmdQaHJhc2VzRXZlck1vZGlmaWVkLCB0cnVlLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04sIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHQvLyBEeW5hbWljIGNvbW1hbmRzIChlLmcuICd3b3JrYmVuY2guYWN0aW9uLmNoYXQub3BlblBsYW4nKSBhcmUgcmVnaXN0ZXJlZCBhdFxuXHRcdC8vIFdvcmtiZW5jaFBoYXNlLkV2ZW50dWFsbHkgYW5kIG1heSBiZSByZW1vdmVkIHdoZW4gdGhlIGZvY3VzZWQgbW9kZXMgY2hhbmdlLlxuXHRcdC8vIFJlLWV2YWx1YXRlIHRoZSBzaG93biB0aXAgd2hlbmV2ZXIgYW55IGNvbW1hbmQgaXMgcmVnaXN0ZXJlZCBzbyB0aGF0IHRpcHMgYXJlXG5cdFx0Ly8gbmVpdGhlciBzaG93biB3aXRoIGRlYWQgbGlua3Mgbm9yIHBlcm1hbmVudGx5IGJsb2NrZWQgZnJvbSBhcHBlYXJpbmcgZHVlIHRvIGFcblx0XHQvLyByZWdpc3RyYXRpb24gcmFjZSBhdCBzdGFydHVwLlxuXHRcdHRoaXMuX3JlZ2lzdGVyKENvbW1hbmRzUmVnaXN0cnkub25EaWRSZWdpc3RlckNvbW1hbmQoY29tbWFuZElkID0+IHtcblx0XHRcdHRoaXMuX2hpZGVTaG93blRpcElmTm93SW5lbGlnaWJsZSgpO1xuXHRcdFx0Ly8gSWYgdGhlIG5ld2x5IHJlZ2lzdGVyZWQgY29tbWFuZCB3YXMgYSByZXF1aXJlbWVudCB0aGF0IGJsb2NrZWQgYSB0aXAgZnJvbVxuXHRcdFx0Ly8gYmVpbmcgc2VsZWN0ZWQsIHJlc2V0IHRoZSBjYWNoZWQgc2VsZWN0aW9uIHNvIHRoZSBuZXh0IGdldFdlbGNvbWVUaXAgY2FsbFxuXHRcdFx0Ly8gY2FuIHJlLXBpY2sgdGhlIG1vc3Qgc3VpdGFibGUgdGlwLlxuXHRcdFx0aWYgKHRoaXMuX3RpcFJlcXVlc3RJZCA9PT0gJ3dlbGNvbWUnICYmIFRJUF9DQVRBTE9HLnNvbWUodGlwID0+IHRpcC5yZXF1aXJlc0NvbW1hbmRzPy5pbmNsdWRlcyhjb21tYW5kSWQpKSkge1xuXHRcdFx0XHR0aGlzLl90aXBSZXF1ZXN0SWQgPSB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfaGFzRmlsZU9yRm9sZGVyUmVmZXJlbmNlKG1lc3NhZ2U6IElQYXJzZWRDaGF0UmVxdWVzdCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBtZXNzYWdlLnBhcnRzLnNvbWUocGFydCA9PiB7XG5cdFx0XHRpZiAocGFydC5raW5kICE9PSBDaGF0UmVxdWVzdER5bmFtaWNWYXJpYWJsZVBhcnQuS2luZCkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGR5bmFtaWNQYXJ0ID0gcGFydCBhcyBDaGF0UmVxdWVzdER5bmFtaWNWYXJpYWJsZVBhcnQ7XG5cdFx0XHRyZXR1cm4gZHluYW1pY1BhcnQuaXNGaWxlID09PSB0cnVlIHx8IGR5bmFtaWNQYXJ0LmlzRGlyZWN0b3J5ID09PSB0cnVlO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0U2xhc2hDb21tYW5kVHJhY2tpbmdJZChtZXNzYWdlOiBJUGFyc2VkQ2hhdFJlcXVlc3QpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGZvciAoY29uc3QgcGFydCBvZiBtZXNzYWdlLnBhcnRzKSB7XG5cdFx0XHRpZiAocGFydC5raW5kID09PSBDaGF0UmVxdWVzdFNsYXNoQ29tbWFuZFBhcnQuS2luZCkge1xuXHRcdFx0XHRjb25zdCBzbGFzaENvbW1hbmQgPSAocGFydCBhcyBDaGF0UmVxdWVzdFNsYXNoQ29tbWFuZFBhcnQpLnNsYXNoQ29tbWFuZC5jb21tYW5kO1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5fdG9TbGFzaENvbW1hbmRUcmFja2luZ0lkKHNsYXNoQ29tbWFuZCk7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChwYXJ0LmtpbmQgPT09IENoYXRSZXF1ZXN0QWdlbnRTdWJjb21tYW5kUGFydC5LaW5kKSB7XG5cdFx0XHRcdGNvbnN0IHN1YkNvbW1hbmQgPSAocGFydCBhcyBDaGF0UmVxdWVzdEFnZW50U3ViY29tbWFuZFBhcnQpLmNvbW1hbmQubmFtZTtcblx0XHRcdFx0cmV0dXJuIHRoaXMuX3RvU2xhc2hDb21tYW5kVHJhY2tpbmdJZChzdWJDb21tYW5kKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCB0cmltbWVkID0gbWVzc2FnZS50ZXh0LnRyaW1TdGFydCgpO1xuXHRcdGNvbnN0IG1hdGNoID0gL14oPzpAXFxTK1xccyspP1xcLyhpbml0fGNyZWF0ZS0oPzppbnN0cnVjdGlvbnN8cHJvbXB0fGFnZW50fHNraWxsKXxmb3JrKSg/Olxcc3wkKS8uZXhlYyh0cmltbWVkKTtcblx0XHRyZXR1cm4gbWF0Y2ggPyB0aGlzLl90b1NsYXNoQ29tbWFuZFRyYWNraW5nSWQobWF0Y2hbMV0pIDogdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBfdG9TbGFzaENvbW1hbmRUcmFja2luZ0lkKGNvbW1hbmQ6IHN0cmluZyk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0c3dpdGNoIChjb21tYW5kKSB7XG5cdFx0XHRjYXNlICdpbml0Jzpcblx0XHRcdGNhc2UgJ2NyZWF0ZS1pbnN0cnVjdGlvbnMnOlxuXHRcdFx0XHRyZXR1cm4gQ1JFQVRFX0FHRU5UX0lOU1RSVUNUSU9OU19UUkFDS0lOR19DT01NQU5EO1xuXHRcdFx0Y2FzZSAnY3JlYXRlLXByb21wdCc6XG5cdFx0XHRcdHJldHVybiBDUkVBVEVfUFJPTVBUX1RSQUNLSU5HX0NPTU1BTkQ7XG5cdFx0XHRjYXNlICdjcmVhdGUtYWdlbnQnOlxuXHRcdFx0XHRyZXR1cm4gQ1JFQVRFX0FHRU5UX1RSQUNLSU5HX0NPTU1BTkQ7XG5cdFx0XHRjYXNlICdjcmVhdGUtc2tpbGwnOlxuXHRcdFx0XHRyZXR1cm4gQ1JFQVRFX1NLSUxMX1RSQUNLSU5HX0NPTU1BTkQ7XG5cdFx0XHRjYXNlICdmb3JrJzpcblx0XHRcdFx0cmV0dXJuIEZPUktfQ09OVkVSU0FUSU9OX1RSQUNLSU5HX0NPTU1BTkQ7XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cdHJlY29yZFNsYXNoQ29tbWFuZFVzYWdlKGNvbW1hbmQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IHRyYWNraW5nSWQgPSB0aGlzLl90b1NsYXNoQ29tbWFuZFRyYWNraW5nSWQoY29tbWFuZCk7XG5cdFx0aWYgKCF0cmFja2luZ0lkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fdHJhY2tlci5yZWNvcmRDb21tYW5kRXhlY3V0ZWQodHJhY2tpbmdJZCk7XG5cdFx0dGhpcy5faGlkZVNob3duVGlwSWZOb3dJbmVsaWdpYmxlKCk7XG5cdH1cblxuXHRyZXNldFNlc3Npb24oKTogdm9pZCB7XG5cdFx0dGhpcy5fc2hvd25UaXAgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fdGlwUmVxdWVzdElkID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX3RpcHNIaWRkZW5Gb3JTZXNzaW9uID0gZmFsc2U7XG5cdH1cblxuXHRkaXNtaXNzVGlwKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9zaG93blRpcCkge1xuXHRcdFx0dGhpcy5fbG9nVGlwVGVsZW1ldHJ5KHRoaXMuX3Nob3duVGlwLmlkLCAnZGlzbWlzc2VkJyk7XG5cdFx0XHRjb25zdCBkaXNtaXNzZWQgPSBuZXcgU2V0KHRoaXMuX2dldERpc21pc3NlZFRpcElkcygpKTtcblx0XHRcdGRpc21pc3NlZC5hZGQodGhpcy5fc2hvd25UaXAuaWQpO1xuXHRcdFx0dGhpcy5fc3RvcmFnZVNlcnZpY2Uuc3RvcmUoQ2hhdFRpcFN0b3JhZ2VLZXlzLkRpc21pc3NlZFRpcHMsIEpTT04uc3RyaW5naWZ5KFsuLi5kaXNtaXNzZWRdKSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHRcdH1cblx0XHQvLyBLZWVwIHRoZSBjdXJyZW50IHRpcCByZWZlcmVuY2Ugc28gY2FsbGVycyBjYW4gbmF2aWdhdGUgcmVsYXRpdmUgdG8gaXRcblx0XHQvLyAoZm9yIGV4YW1wbGUsIGRpc21pc3MgLT4gbmV4dCBzaG91bGQgbWlycm9yIG5leHQvcHJldmlvdXMgYmVoYXZpb3IpLlxuXHRcdHRoaXMuX3RpcFJlcXVlc3RJZCA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9vbkRpZERpc21pc3NUaXAuZmlyZSgpO1xuXHR9XG5cblx0ZGlzbWlzc1RpcEZvclNlc3Npb24oKTogdm9pZCB7XG5cdFx0dGhpcy5kaXNtaXNzVGlwKCk7XG5cdFx0dGhpcy5oaWRlVGlwc0ZvclNlc3Npb24oKTtcblx0fVxuXG5cdGNsZWFyRGlzbWlzc2VkVGlwcygpOiB2b2lkIHtcblx0XHR0aGlzLl9zdG9yYWdlU2VydmljZS5yZW1vdmUoQ2hhdFRpcFN0b3JhZ2VLZXlzLkRpc21pc3NlZFRpcHMsIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTik7XG5cdFx0dGhpcy5fc3RvcmFnZVNlcnZpY2UucmVtb3ZlKENoYXRUaXBTdG9yYWdlS2V5cy5EaXNtaXNzZWRUaXBzLCBTdG9yYWdlU2NvcGUuUFJPRklMRSk7XG5cdFx0dGhpcy5fc2hvd25UaXAgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fdGlwUmVxdWVzdElkID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX3RpcHNIaWRkZW5Gb3JTZXNzaW9uID0gZmFsc2U7XG5cdFx0dGhpcy5fb25EaWREaXNtaXNzVGlwLmZpcmUoKTtcblx0fVxuXG5cdHByaXZhdGUgX2dldERpc21pc3NlZFRpcElkcygpOiBzdHJpbmdbXSB7XG5cdFx0Y29uc3QgcmF3ID0gdGhpcy5fcmVhZEFwcGxpY2F0aW9uV2l0aFByb2ZpbGVGYWxsYmFjayhDaGF0VGlwU3RvcmFnZUtleXMuRGlzbWlzc2VkVGlwcyk7XG5cdFx0aWYgKCFyYXcpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHBhcnNlZCA9IEpTT04ucGFyc2UocmF3KTtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZGVidWcoJyNDaGF0VGlwcyBkaXNtaXNzZWQ6JywgcGFyc2VkKTtcblx0XHRcdGlmICghQXJyYXkuaXNBcnJheShwYXJzZWQpKSB7XG5cdFx0XHRcdHJldHVybiBbXTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qga25vd25UaXBJZHMgPSBuZXcgU2V0KFRJUF9DQVRBTE9HLm1hcCh0aXAgPT4gdGlwLmlkKSk7XG5cdFx0XHRjb25zdCBkaXNtaXNzZWQgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHRcdGZvciAoY29uc3QgdmFsdWUgb2YgcGFyc2VkKSB7XG5cdFx0XHRcdGlmICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnICYmIGtub3duVGlwSWRzLmhhcyh2YWx1ZSkpIHtcblx0XHRcdFx0XHRkaXNtaXNzZWQuYWRkKHZhbHVlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gWy4uLmRpc21pc3NlZF07XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHR9XG5cblx0aGlkZVRpcCgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fc2hvd25UaXApIHtcblx0XHRcdHRoaXMuX2xvZ1RpcFRlbGVtZXRyeSh0aGlzLl9zaG93blRpcC5pZCwgJ2hpZGRlbicpO1xuXHRcdH1cblx0XHR0aGlzLl9zaG93blRpcCA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl90aXBSZXF1ZXN0SWQgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fb25EaWRIaWRlVGlwLmZpcmUoKTtcblx0fVxuXG5cdGhpZGVUaXBzRm9yU2Vzc2lvbigpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fdGlwc0hpZGRlbkZvclNlc3Npb24pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl90aXBzSGlkZGVuRm9yU2Vzc2lvbiA9IHRydWU7XG5cdFx0dGhpcy5fc2hvd25UaXAgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fdGlwUmVxdWVzdElkID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX29uRGlkSGlkZVRpcC5maXJlKCk7XG5cdH1cblxuXHRhc3luYyBkaXNhYmxlVGlwcygpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5fc2hvd25UaXApIHtcblx0XHRcdHRoaXMuX2xvZ1RpcFRlbGVtZXRyeSh0aGlzLl9zaG93blRpcC5pZCwgJ2Rpc2FibGVkJyk7XG5cdFx0fVxuXHRcdHRoaXMuX3Nob3duVGlwID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX3RpcFJlcXVlc3RJZCA9IHVuZGVmaW5lZDtcblx0XHRhd2FpdCB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVWYWx1ZSgnY2hhdC50aXBzLmVuYWJsZWQnLCBmYWxzZSwgQ29uZmlndXJhdGlvblRhcmdldC5BUFBMSUNBVElPTik7XG5cdFx0dGhpcy5fb25EaWREaXNhYmxlVGlwcy5maXJlKCk7XG5cdH1cblxuXHRnZXRXZWxjb21lVGlwKGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UpOiBJQ2hhdFRpcCB8IHVuZGVmaW5lZCB7XG5cdFx0dGhpcy5fY3JlYXRlU2xhc2hDb21tYW5kc1VzYWdlVHJhY2tlci5zeW5jQ29udGV4dEtleShjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0Ly8gQWx3YXlzIHJlY29yZCB0aGUgY3VycmVudCBtb2RlIHNvIHRoYXQgbW9kZS1iYXNlZCBleGNsdXNpb25zIGFyZVxuXHRcdC8vIHBlcnNpc3RlZCBldmVuIG9uIHN0YWJsZS1yZXJlbmRlciBwYXRocyAoZS5nLiB1c2VyIHN3aXRjaGVzIHRvIFBsYW5cblx0XHQvLyBtb2RlIHdoaWxlIHZpZXdpbmcgdGhlIFBsYW4gdGlwKS5cblx0XHR0aGlzLl90cmFja2VyLnJlY29yZEN1cnJlbnRNb2RlKGNvbnRleHRLZXlTZXJ2aWNlKTtcblxuXHRcdHRoaXMuX3RyYWNrZXIucmVmcmVzaFByb21wdEZpbGVFeGNsdXNpb25zKCk7XG5cdFx0Ly8gQ2hlY2sgaWYgdGlwcyBhcmUgZW5hYmxlZFxuXHRcdGlmICghdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oJ2NoYXQudGlwcy5lbmFibGVkJykpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX3RpcHNIaWRkZW5Gb3JTZXNzaW9uKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdC8vIFN0b3JlIHRoZSBzY29wZWQgY29udGV4dCBrZXkgc2VydmljZSBmb3IgbGF0ZXIgbmF2aWdhdGlvbiBjYWxsc1xuXHRcdHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlID0gY29udGV4dEtleVNlcnZpY2U7XG5cblx0XHQvLyBPbmx5IHNob3cgdGlwcyBmb3IgQ29waWxvdFxuXHRcdGlmICghdGhpcy5faXNDb3BpbG90RW5hYmxlZCgpKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdC8vIFRpcHMgYXJlIG9ubHkgcmVsZXZhbnQgYWZ0ZXIgc2lnbi1pbiBoYXMgY29tcGxldGVkLlxuXHRcdGlmICh0aGlzLl9jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLmVudGl0bGVtZW50ID09PSBDaGF0RW50aXRsZW1lbnQuVW5rbm93biAmJiAhdGhpcy5fY2hhdEVudGl0bGVtZW50U2VydmljZS5oYXNCeW9rTW9kZWxzKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdC8vIE9ubHkgc2hvdyB0aXBzIGluIHRoZSBtYWluIGNoYXQgcGFuZWwsIG5vdCBpbiB0ZXJtaW5hbC9lZGl0b3IgaW5saW5lIGNoYXRcblx0XHRpZiAoIXRoaXMuX2lzQ2hhdExvY2F0aW9uKGNvbnRleHRLZXlTZXJ2aWNlKSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRpZiAoIXRoaXMuX2hhc1NpbmdsZUZvcmVncm91bmRDaGF0U3VyZmFjZShjb250ZXh0S2V5U2VydmljZSkpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Ly8gRG9uJ3Qgc2hvdyB0aXBzIHdoZW4gY2hhdCBxdW90YSBpcyBleGNlZWRlZCwgdGhlIHVwZ3JhZGUgd2lkZ2V0IGlzIG1vcmUgcmVsZXZhbnRcblx0XHRpZiAodGhpcy5faXNDaGF0UXVvdGFFeGNlZWRlZChjb250ZXh0S2V5U2VydmljZSkpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Ly8gUmV0dXJuIHRoZSBhbHJlYWR5LXNob3duIHRpcCBmb3Igc3RhYmxlIHJlcmVuZGVyc1xuXHRcdGlmICh0aGlzLl90aXBSZXF1ZXN0SWQgPT09ICd3ZWxjb21lJyAmJiB0aGlzLl9zaG93blRpcCkge1xuXHRcdFx0aWYgKHRoaXMuX3Nob3duVGlwLmlkICE9PSAndGlwLnN3aXRjaFRvQXV0bycpIHtcblx0XHRcdFx0Y29uc3Qgc3dpdGNoVG9BdXRvVGlwID0gVElQX0NBVEFMT0cuZmluZCh0aXAgPT4gdGlwLmlkID09PSAndGlwLnN3aXRjaFRvQXV0bycpO1xuXHRcdFx0XHRpZiAoc3dpdGNoVG9BdXRvVGlwKSB7XG5cdFx0XHRcdFx0Y29uc3QgZGlzbWlzc2VkSWRzID0gbmV3IFNldCh0aGlzLl9nZXREaXNtaXNzZWRUaXBJZHMoKSk7XG5cdFx0XHRcdFx0aWYgKCFkaXNtaXNzZWRJZHMuaGFzKHN3aXRjaFRvQXV0b1RpcC5pZCkgJiYgdGhpcy5faXNFbGlnaWJsZShzd2l0Y2hUb0F1dG9UaXAsIGNvbnRleHRLZXlTZXJ2aWNlKSkge1xuXHRcdFx0XHRcdFx0dGhpcy5fc2hvd25UaXAgPSBzd2l0Y2hUb0F1dG9UaXA7XG5cdFx0XHRcdFx0XHR0aGlzLl9zdG9yYWdlU2VydmljZS5zdG9yZShDaGF0VGlwU3RvcmFnZUtleXMuTGFzdFRpcElkLCBzd2l0Y2hUb0F1dG9UaXAuaWQsIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgU3RvcmFnZVRhcmdldC5VU0VSKTtcblx0XHRcdFx0XHRcdGNvbnN0IHRpcCA9IHRoaXMuX2NyZWF0ZVRpcChzd2l0Y2hUb0F1dG9UaXApO1xuXHRcdFx0XHRcdFx0dGhpcy5fbG9nVGlwVGVsZW1ldHJ5KHN3aXRjaFRvQXV0b1RpcC5pZCwgJ3Nob3duJyk7XG5cdFx0XHRcdFx0XHR0aGlzLl90cmFja1RpcENvbW1hbmRDbGlja3Moc3dpdGNoVG9BdXRvVGlwKTtcblx0XHRcdFx0XHRcdHRoaXMuX29uRGlkTmF2aWdhdGVUaXAuZmlyZSh0aXApO1xuXHRcdFx0XHRcdFx0cmV0dXJuIHRpcDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKCF0aGlzLl9pc0VsaWdpYmxlKHRoaXMuX3Nob3duVGlwLCBjb250ZXh0S2V5U2VydmljZSkpIHtcblx0XHRcdFx0aWYgKHRoaXMuX3RyYWNrZXIuaXNFeGNsdWRlZCh0aGlzLl9zaG93blRpcCkpIHtcblx0XHRcdFx0XHR0aGlzLmhpZGVUaXAoKTtcblx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgbmV4dFRpcCA9IHRoaXMuX2ZpbmROZXh0RWxpZ2libGVUaXAodGhpcy5fc2hvd25UaXAuaWQsIGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRcdFx0aWYgKG5leHRUaXApIHtcblx0XHRcdFx0XHR0aGlzLl9zaG93blRpcCA9IG5leHRUaXA7XG5cdFx0XHRcdFx0dGhpcy5fc3RvcmFnZVNlcnZpY2Uuc3RvcmUoQ2hhdFRpcFN0b3JhZ2VLZXlzLkxhc3RUaXBJZCwgbmV4dFRpcC5pZCwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCBTdG9yYWdlVGFyZ2V0LlVTRVIpO1xuXHRcdFx0XHRcdGNvbnN0IHRpcCA9IHRoaXMuX2NyZWF0ZVRpcChuZXh0VGlwKTtcblx0XHRcdFx0XHR0aGlzLl9vbkRpZE5hdmlnYXRlVGlwLmZpcmUodGlwKTtcblx0XHRcdFx0XHRyZXR1cm4gdGlwO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGhpcy5oaWRlVGlwKCk7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdGhpcy5fY3JlYXRlVGlwKHRoaXMuX3Nob3duVGlwKTtcblx0XHR9XG5cblx0XHRjb25zdCB0aXAgPSB0aGlzLl9waWNrVGlwKCd3ZWxjb21lJywgY29udGV4dEtleVNlcnZpY2UpO1xuXG5cdFx0cmV0dXJuIHRpcDtcblx0fVxuXG5cdHByaXZhdGUgX2hhc1NpbmdsZUZvcmVncm91bmRDaGF0U3VyZmFjZShjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgZm9yZWdyb3VuZFNlc3Npb25Db3VudCA9IGNvbnRleHRLZXlTZXJ2aWNlLmdldENvbnRleHRLZXlWYWx1ZTxudW1iZXI+KENoYXRDb250ZXh0S2V5cy5mb3JlZ3JvdW5kU2Vzc2lvbkNvdW50LmtleSk7XG5cdFx0cmV0dXJuIGZvcmVncm91bmRTZXNzaW9uQ291bnQgPT09IDFcblx0XHRcdHx8IChmb3JlZ3JvdW5kU2Vzc2lvbkNvdW50ID09PSAwICYmIGNvbnRleHRLZXlTZXJ2aWNlLmdldENvbnRleHRLZXlWYWx1ZTxib29sZWFuPihJc1Nlc3Npb25zV2luZG93Q29udGV4dC5rZXkpID09PSB0cnVlKTtcblx0fVxuXG5cdHByaXZhdGUgX2ZpbmROZXh0RWxpZ2libGVUaXAoY3VycmVudFRpcElkOiBzdHJpbmcsIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UpOiBJVGlwRGVmaW5pdGlvbiB8IHVuZGVmaW5lZCB7XG5cdFx0dGhpcy5fY3JlYXRlU2xhc2hDb21tYW5kc1VzYWdlVHJhY2tlci5zeW5jQ29udGV4dEtleShjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0Y29uc3QgY3VycmVudEluZGV4ID0gVElQX0NBVEFMT0cuZmluZEluZGV4KHRpcCA9PiB0aXAuaWQgPT09IGN1cnJlbnRUaXBJZCk7XG5cdFx0aWYgKGN1cnJlbnRJbmRleCA9PT0gLTEpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZGlzbWlzc2VkSWRzID0gbmV3IFNldCh0aGlzLl9nZXREaXNtaXNzZWRUaXBJZHMoKSk7XG5cdFx0Zm9yIChsZXQgaSA9IDE7IGkgPCBUSVBfQ0FUQUxPRy5sZW5ndGg7IGkrKykge1xuXHRcdFx0Y29uc3QgaWR4ID0gKGN1cnJlbnRJbmRleCArIGkpICUgVElQX0NBVEFMT0cubGVuZ3RoO1xuXHRcdFx0Y29uc3QgY2FuZGlkYXRlID0gVElQX0NBVEFMT0dbaWR4XTtcblx0XHRcdGlmICghZGlzbWlzc2VkSWRzLmhhcyhjYW5kaWRhdGUuaWQpICYmIHRoaXMuX2lzRWxpZ2libGUoY2FuZGlkYXRlLCBjb250ZXh0S2V5U2VydmljZSkpIHtcblx0XHRcdFx0cmV0dXJuIGNhbmRpZGF0ZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBfaGlkZVNob3duVGlwSWZOb3dJbmVsaWdpYmxlKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fc2hvd25UaXAgfHwgIXRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX3RpcHNIaWRkZW5Gb3JTZXNzaW9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0bGV0IGVsaWdpYmxlOiBib29sZWFuO1xuXHRcdHRyeSB7XG5cdFx0XHRlbGlnaWJsZSA9IHRoaXMuX2lzRWxpZ2libGUodGhpcy5fc2hvd25UaXAsIHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdC8vIFRoZSBzdG9yZWQgc2NvcGVkIGNvbnRleHQga2V5IHNlcnZpY2UgbWF5IGhhdmUgYmVlbiBkaXNwb3NlZFxuXHRcdFx0Ly8gKGUuZy4gaXRzIG93bmluZyBjaGF0IHdpZGdldCB3YXMgdG9ybiBkb3duKS4gRHJvcCB0aGUgc3RhbGVcblx0XHRcdC8vIHJlZmVyZW5jZSBhbmQgYmFpbCBvdXQgXHUyMDE0IHRoZXJlIGlzIG5vdGhpbmcgbWVhbmluZ2Z1bCB0byBoaWRlLlxuXHRcdFx0dGhpcy5fY29udGV4dEtleVNlcnZpY2UgPSB1bmRlZmluZWQ7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKGVsaWdpYmxlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5oaWRlVGlwKCk7XG5cdH1cblxuXHRwcml2YXRlIF9waWNrVGlwKHNvdXJjZUlkOiBzdHJpbmcsIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UpOiBJQ2hhdFRpcCB8IHVuZGVmaW5lZCB7XG5cdFx0dGhpcy5fY3JlYXRlU2xhc2hDb21tYW5kc1VzYWdlVHJhY2tlci5zeW5jQ29udGV4dEtleShjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0Ly8gUmVjb3JkIHRoZSBjdXJyZW50IG1vZGUgZm9yIGZ1dHVyZSBlbGlnaWJpbGl0eSBkZWNpc2lvbnMuXG5cdFx0dGhpcy5fdHJhY2tlci5yZWNvcmRDdXJyZW50TW9kZShjb250ZXh0S2V5U2VydmljZSk7XG5cblx0XHRjb25zdCBkaXNtaXNzZWRJZHMgPSBuZXcgU2V0KHRoaXMuX2dldERpc21pc3NlZFRpcElkcygpKTtcblx0XHRjb25zdCBlbGlnaWJsZVRpcHMgPSBUSVBfQ0FUQUxPRy5maWx0ZXIodGlwID0+ICFkaXNtaXNzZWRJZHMuaGFzKHRpcC5pZCkgJiYgdGhpcy5faXNFbGlnaWJsZSh0aXAsIGNvbnRleHRLZXlTZXJ2aWNlKSk7XG5cblx0XHRjb25zdCBzZWxlY3RlZFRpcCA9IHRoaXMuX3NlbGVjdFRpcEJ5VGllcihlbGlnaWJsZVRpcHMpO1xuXG5cdFx0aWYgKCFzZWxlY3RlZFRpcCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHQvLyBQZXJzaXN0IHRoZSBzZWxlY3RlZCB0aXAgSUQgZm9yIGNvbXBhdGliaWxpdHkgd2l0aCBleGlzdGluZyBzdG9yYWdlIGNvbnN1bWVycy5cblx0XHR0aGlzLl9zdG9yYWdlU2VydmljZS5zdG9yZShDaGF0VGlwU3RvcmFnZUtleXMuTGFzdFRpcElkLCBzZWxlY3RlZFRpcC5pZCwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCBTdG9yYWdlVGFyZ2V0LlVTRVIpO1xuXG5cdFx0Ly8gUmVjb3JkIHRoYXQgd2UndmUgc2hvd24gYSB0aXAgdGhpcyBzZXNzaW9uXG5cdFx0dGhpcy5fdGlwUmVxdWVzdElkID0gc291cmNlSWQ7XG5cdFx0dGhpcy5fc2hvd25UaXAgPSBzZWxlY3RlZFRpcDtcblxuXHRcdHRoaXMuX2xvZ1RpcFRlbGVtZXRyeShzZWxlY3RlZFRpcC5pZCwgJ3Nob3duJyk7XG5cdFx0dGhpcy5fdHJhY2tUaXBDb21tYW5kQ2xpY2tzKHNlbGVjdGVkVGlwKTtcblxuXHRcdHJldHVybiB0aGlzLl9jcmVhdGVUaXAoc2VsZWN0ZWRUaXApO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2VsZWN0VGlwQnlUaWVyKGVsaWdpYmxlVGlwczogcmVhZG9ubHkgSVRpcERlZmluaXRpb25bXSk6IElUaXBEZWZpbml0aW9uIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBmb3VuZGF0aW9uYWxUaXBzID0gZWxpZ2libGVUaXBzLmZpbHRlcih0aXAgPT4gdGlwLnRpZXIgPT09IENoYXRUaXBUaWVyLkZvdW5kYXRpb25hbCk7XG5cdFx0aWYgKGZvdW5kYXRpb25hbFRpcHMubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fc29ydEJ5UHJpb3JpdHlBbmRDYXRhbG9nT3JkZXIoZm91bmRhdGlvbmFsVGlwcylbMF07XG5cdFx0fVxuXG5cdFx0Y29uc3QgcW9sVGlwcyA9IGVsaWdpYmxlVGlwcy5maWx0ZXIodGlwID0+IHRpcC50aWVyID09PSBDaGF0VGlwVGllci5Rb2wpO1xuXHRcdGlmICghcW9sVGlwcy5sZW5ndGgpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmFuZG9tSW5kZXggPSBNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiBxb2xUaXBzLmxlbmd0aCk7XG5cdFx0cmV0dXJuIHFvbFRpcHNbcmFuZG9tSW5kZXhdO1xuXHR9XG5cblx0bmF2aWdhdGVUb05leHRUaXAoKTogSUNoYXRUaXAgfCB1bmRlZmluZWQge1xuXHRcdGlmICghdGhpcy5fY29udGV4dEtleVNlcnZpY2UpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9uYXZpZ2F0ZVRpcCgxLCB0aGlzLl9jb250ZXh0S2V5U2VydmljZSk7XG5cdH1cblxuXHRuYXZpZ2F0ZVRvUHJldmlvdXNUaXAoKTogSUNoYXRUaXAgfCB1bmRlZmluZWQge1xuXHRcdGlmICghdGhpcy5fY29udGV4dEtleVNlcnZpY2UpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9uYXZpZ2F0ZVRpcCgtMSwgdGhpcy5fY29udGV4dEtleVNlcnZpY2UpO1xuXHR9XG5cblx0Z2V0TmV4dEVsaWdpYmxlVGlwKCk6IElDaGF0VGlwIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIXRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlIHx8ICF0aGlzLl9zaG93blRpcCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBjb250ZXh0S2V5U2VydmljZSA9IHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlO1xuXHRcdHRoaXMuX2NyZWF0ZVNsYXNoQ29tbWFuZHNVc2FnZVRyYWNrZXIuc3luY0NvbnRleHRLZXkoY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdGNvbnN0IGN1cnJlbnRUaXBJZCA9IHRoaXMuX3Nob3duVGlwLmlkO1xuXHRcdGNvbnN0IG9yZGVyZWRUaXBzID0gdGhpcy5fZ2V0T3JkZXJlZEVsaWdpYmxlVGlwcyhjb250ZXh0S2V5U2VydmljZSwgeyBpbmNsdWRlVGlwSWQ6IGN1cnJlbnRUaXBJZCB9KTtcblx0XHRpZiAoIW9yZGVyZWRUaXBzLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBjdXJyZW50SW5kZXggPSBvcmRlcmVkVGlwcy5maW5kSW5kZXgodGlwID0+IHRpcC5pZCA9PT0gY3VycmVudFRpcElkKTtcblx0XHRjb25zdCBjYW5kaWRhdGUgPSB0aGlzLl9nZXROZXh0VGlwRnJvbU9yZGVyZWRMaXN0KG9yZGVyZWRUaXBzLCBjdXJyZW50SW5kZXgsIGN1cnJlbnRUaXBJZCk7XG5cdFx0aWYgKGNhbmRpZGF0ZSkge1xuXHRcdFx0Ly8gRm91bmQgdGhlIG5leHQgZWxpZ2libGUgdGlwIC0gdXBkYXRlIHN0YXRlIGFuZCByZXR1cm4gaXRcblx0XHRcdHRoaXMuX3Nob3duVGlwID0gY2FuZGlkYXRlO1xuXHRcdFx0dGhpcy5fdGlwUmVxdWVzdElkID0gJ3dlbGNvbWUnO1xuXHRcdFx0dGhpcy5fc3RvcmFnZVNlcnZpY2Uuc3RvcmUoQ2hhdFRpcFN0b3JhZ2VLZXlzLkxhc3RUaXBJZCwgY2FuZGlkYXRlLmlkLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04sIFN0b3JhZ2VUYXJnZXQuVVNFUik7XG5cdFx0XHR0aGlzLl9sb2dUaXBUZWxlbWV0cnkoY2FuZGlkYXRlLmlkLCAnc2hvd24nKTtcblx0XHRcdHRoaXMuX3RyYWNrVGlwQ29tbWFuZENsaWNrcyhjYW5kaWRhdGUpO1xuXHRcdFx0cmV0dXJuIHRoaXMuX2NyZWF0ZVRpcChjYW5kaWRhdGUpO1xuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIF9nZXROZXh0VGlwRnJvbU9yZGVyZWRMaXN0KG9yZGVyZWRUaXBzOiByZWFkb25seSBJVGlwRGVmaW5pdGlvbltdLCBzdGFydEluZGV4OiBudW1iZXIsIGN1cnJlbnRUaXBJZDogc3RyaW5nKTogSVRpcERlZmluaXRpb24gfCB1bmRlZmluZWQge1xuXHRcdGlmICghb3JkZXJlZFRpcHMubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IGZhbGxiYWNrSW5kZXggPSAwO1xuXHRcdGNvbnN0IG5vcm1hbGl6ZWRTdGFydEluZGV4ID0gc3RhcnRJbmRleCA9PT0gLTEgPyBmYWxsYmFja0luZGV4IDogc3RhcnRJbmRleDtcblx0XHRmb3IgKGxldCBpID0gMTsgaSA8PSBvcmRlcmVkVGlwcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0Y29uc3QgaW5kZXggPSAobm9ybWFsaXplZFN0YXJ0SW5kZXggKyBpKSAlIG9yZGVyZWRUaXBzLmxlbmd0aDtcblx0XHRcdGNvbnN0IGNhbmRpZGF0ZSA9IG9yZGVyZWRUaXBzW2luZGV4XTtcblx0XHRcdGlmIChjYW5kaWRhdGUuaWQgIT09IGN1cnJlbnRUaXBJZCkge1xuXHRcdFx0XHRyZXR1cm4gY2FuZGlkYXRlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRoYXNNdWx0aXBsZVRpcHMoKTogYm9vbGVhbiB7XG5cdFx0aWYgKCF0aGlzLl9jb250ZXh0S2V5U2VydmljZSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdHRoaXMuX2NyZWF0ZVNsYXNoQ29tbWFuZHNVc2FnZVRyYWNrZXIuc3luY0NvbnRleHRLZXkodGhpcy5fY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHJldHVybiB0aGlzLl9oYXNOYXZpZ2FibGVUaXAodGhpcy5fY29udGV4dEtleVNlcnZpY2UpO1xuXHR9XG5cblx0cHJpdmF0ZSBfbmF2aWdhdGVUaXAoZGlyZWN0aW9uOiAxIHwgLTEsIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UpOiBJQ2hhdFRpcCB8IHVuZGVmaW5lZCB7XG5cdFx0dGhpcy5fY3JlYXRlU2xhc2hDb21tYW5kc1VzYWdlVHJhY2tlci5zeW5jQ29udGV4dEtleShjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0aWYgKCF0aGlzLl9zaG93blRpcCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3Qgb3JkZXJlZFRpcHMgPSB0aGlzLl9nZXRPcmRlcmVkRWxpZ2libGVUaXBzKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRpZiAoIW9yZGVyZWRUaXBzLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBjdXJyZW50SW5kZXggPSBvcmRlcmVkVGlwcy5maW5kSW5kZXgodGlwID0+IHRpcC5pZCA9PT0gdGhpcy5fc2hvd25UaXAhLmlkKTtcblx0XHRpZiAob3JkZXJlZFRpcHMubGVuZ3RoID09PSAxICYmIGN1cnJlbnRJbmRleCAhPT0gLTEpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZmFsbGJhY2tJbmRleCA9IGRpcmVjdGlvbiA9PT0gMSA/IDAgOiBvcmRlcmVkVGlwcy5sZW5ndGggLSAxO1xuXHRcdGNvbnN0IG5leHRJbmRleCA9IGN1cnJlbnRJbmRleCA9PT0gLTFcblx0XHRcdD8gZmFsbGJhY2tJbmRleFxuXHRcdFx0OiAoY3VycmVudEluZGV4ICsgZGlyZWN0aW9uICsgb3JkZXJlZFRpcHMubGVuZ3RoKSAlIG9yZGVyZWRUaXBzLmxlbmd0aDtcblx0XHRjb25zdCBjYW5kaWRhdGUgPSBvcmRlcmVkVGlwc1tuZXh0SW5kZXhdO1xuXHRcdGlmIChjYW5kaWRhdGUpIHtcblx0XHRcdHRoaXMuX2xvZ1RpcFRlbGVtZXRyeSh0aGlzLl9zaG93blRpcC5pZCwgZGlyZWN0aW9uID09PSAxID8gJ25hdmlnYXRlTmV4dCcgOiAnbmF2aWdhdGVQcmV2aW91cycpO1xuXHRcdFx0dGhpcy5fc2hvd25UaXAgPSBjYW5kaWRhdGU7XG5cdFx0XHR0aGlzLl90aXBSZXF1ZXN0SWQgPSAnd2VsY29tZSc7XG5cdFx0XHR0aGlzLl9zdG9yYWdlU2VydmljZS5zdG9yZShDaGF0VGlwU3RvcmFnZUtleXMuTGFzdFRpcElkLCBjYW5kaWRhdGUuaWQsIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgU3RvcmFnZVRhcmdldC5VU0VSKTtcblx0XHRcdHRoaXMuX2xvZ1RpcFRlbGVtZXRyeShjYW5kaWRhdGUuaWQsICdzaG93bicpO1xuXHRcdFx0dGhpcy5fdHJhY2tUaXBDb21tYW5kQ2xpY2tzKGNhbmRpZGF0ZSk7XG5cdFx0XHRjb25zdCB0aXAgPSB0aGlzLl9jcmVhdGVUaXAoY2FuZGlkYXRlKTtcblx0XHRcdHRoaXMuX29uRGlkTmF2aWdhdGVUaXAuZmlyZSh0aXApO1xuXHRcdFx0cmV0dXJuIHRpcDtcblx0XHR9XG5cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBfaGFzTmF2aWdhYmxlVGlwKGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UpOiBib29sZWFuIHtcblx0XHRjb25zdCBvcmRlcmVkVGlwcyA9IHRoaXMuX2dldE9yZGVyZWRFbGlnaWJsZVRpcHMoY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdGlmICghb3JkZXJlZFRpcHMubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLl9zaG93blRpcCkge1xuXHRcdFx0cmV0dXJuIG9yZGVyZWRUaXBzLmxlbmd0aCA+IDE7XG5cdFx0fVxuXG5cdFx0aWYgKG9yZGVyZWRUaXBzLmxlbmd0aCA+IDEpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdHJldHVybiBvcmRlcmVkVGlwc1swXS5pZCAhPT0gdGhpcy5fc2hvd25UaXAuaWQ7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRPcmRlcmVkRWxpZ2libGVUaXBzKGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsIG9wdGlvbnM/OiB7IGV4Y2x1ZGVTaG93blRpcD86IGJvb2xlYW47IGluY2x1ZGVUaXBJZD86IHN0cmluZyB9KTogSVRpcERlZmluaXRpb25bXSB7XG5cdFx0Y29uc3QgZGlzbWlzc2VkSWRzID0gbmV3IFNldCh0aGlzLl9nZXREaXNtaXNzZWRUaXBJZHMoKSk7XG5cdFx0Y29uc3QgZWxpZ2libGVUaXBzID0gVElQX0NBVEFMT0cuZmlsdGVyKHRpcCA9PiB7XG5cdFx0XHRpZiAob3B0aW9ucz8uaW5jbHVkZVRpcElkICYmIHRpcC5pZCA9PT0gb3B0aW9ucy5pbmNsdWRlVGlwSWQpIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAob3B0aW9ucz8uZXhjbHVkZVNob3duVGlwICYmIHRoaXMuX3Nob3duVGlwICYmIHRpcC5pZCA9PT0gdGhpcy5fc2hvd25UaXAuaWQpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuICFkaXNtaXNzZWRJZHMuaGFzKHRpcC5pZCkgJiYgdGhpcy5faXNFbGlnaWJsZSh0aXAsIGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR9KTtcblxuXHRcdGNvbnN0IGZvdW5kYXRpb25hbFRpcHMgPSB0aGlzLl9zb3J0QnlQcmlvcml0eUFuZENhdGFsb2dPcmRlcihlbGlnaWJsZVRpcHMuZmlsdGVyKHRpcCA9PiB0aXAudGllciA9PT0gQ2hhdFRpcFRpZXIuRm91bmRhdGlvbmFsKSk7XG5cdFx0Y29uc3QgcW9sVGlwcyA9IHRoaXMuX3NvcnRCeVByaW9yaXR5QW5kQ2F0YWxvZ09yZGVyKGVsaWdpYmxlVGlwcy5maWx0ZXIodGlwID0+IHRpcC50aWVyID09PSBDaGF0VGlwVGllci5Rb2wpKTtcblx0XHRyZXR1cm4gWy4uLmZvdW5kYXRpb25hbFRpcHMsIC4uLnFvbFRpcHNdO1xuXHR9XG5cblx0cHJpdmF0ZSBfc29ydEJ5UHJpb3JpdHlBbmRDYXRhbG9nT3JkZXIodGlwczogcmVhZG9ubHkgSVRpcERlZmluaXRpb25bXSk6IElUaXBEZWZpbml0aW9uW10ge1xuXHRcdHJldHVybiBbLi4udGlwc10uc29ydCgoYSwgYikgPT4ge1xuXHRcdFx0Y29uc3QgYVByaW9yaXR5ID0gYS5wcmlvcml0eSA/PyBOdW1iZXIuUE9TSVRJVkVfSU5GSU5JVFk7XG5cdFx0XHRjb25zdCBiUHJpb3JpdHkgPSBiLnByaW9yaXR5ID8/IE51bWJlci5QT1NJVElWRV9JTkZJTklUWTtcblx0XHRcdGlmIChhUHJpb3JpdHkgIT09IGJQcmlvcml0eSkge1xuXHRcdFx0XHRyZXR1cm4gYVByaW9yaXR5IC0gYlByaW9yaXR5O1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBhQ2F0YWxvZ0luZGV4ID0gVElQX0NBVEFMT0cuZmluZEluZGV4KHRpcCA9PiB0aXAuaWQgPT09IGEuaWQpO1xuXHRcdFx0Y29uc3QgYkNhdGFsb2dJbmRleCA9IFRJUF9DQVRBTE9HLmZpbmRJbmRleCh0aXAgPT4gdGlwLmlkID09PSBiLmlkKTtcblx0XHRcdHJldHVybiBhQ2F0YWxvZ0luZGV4IC0gYkNhdGFsb2dJbmRleDtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX2lzRWxpZ2libGUodGlwOiBJVGlwRGVmaW5pdGlvbiwgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSk6IGJvb2xlYW4ge1xuXHRcdGlmICh0aXAub25seVdoZW5Nb2RlbElkcz8ubGVuZ3RoKSB7XG5cdFx0XHRjb25zdCBjdXJyZW50TW9kZWxJZCA9IHRoaXMuX2dldEN1cnJlbnRDaGF0TW9kZWxJZChjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0XHRjb25zdCBpc01vZGVsTWF0Y2ggPSB0aXAub25seVdoZW5Nb2RlbElkcy5zb21lKG1vZGVsSWQgPT4gY3VycmVudE1vZGVsSWQgPT09IG1vZGVsSWQgfHwgY3VycmVudE1vZGVsSWQuc3RhcnRzV2l0aChgJHttb2RlbElkfS1gKSk7XG5cdFx0XHRpZiAoIWlzTW9kZWxNYXRjaCkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmICh0aXAuZXhjbHVkZVdoZW5TZXR0aW5nc0NoYW5nZWQ/LnNvbWUoc2V0dGluZyA9PiB0aGlzLl9pc1NldHRpbmdNb2RpZmllZChzZXR0aW5nKSkpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZGVidWcoJyNDaGF0VGlwczogdGlwIGV4Y2x1ZGVkIGJlY2F1c2Ugc2V0dGluZyB3YXMgbW9kaWZpZWQnLCB0aXAuaWQsIHRpcC5leGNsdWRlV2hlblNldHRpbmdzQ2hhbmdlZCk7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGlmICh0aXAud2hlbiAmJiAhY29udGV4dEtleVNlcnZpY2UuY29udGV4dE1hdGNoZXNSdWxlcyh0aXAud2hlbikpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZGVidWcoJyNDaGF0VGlwczogdGlwIGlzIG5vdCBlbGlnaWJsZSBkdWUgdG8gd2hlbiBjbGF1c2UnLCB0aXAuaWQsIHRpcC53aGVuLnNlcmlhbGl6ZSgpKTtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0aWYgKHRpcC5yZXF1aXJlc01vZGVOYW1lcz8uc29tZShtb2RlTmFtZSA9PiAhdGhpcy5faXNNb2RlQXZhaWxhYmxlKG1vZGVOYW1lLCBjb250ZXh0S2V5U2VydmljZSkpKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmRlYnVnKCcjQ2hhdFRpcHM6IHRpcCBpcyBub3QgZWxpZ2libGUgYmVjYXVzZSBhIHJlcXVpcmVkIG1vZGUgaXMgbm90IGF2YWlsYWJsZScsIHRpcC5pZCwgdGlwLnJlcXVpcmVzTW9kZU5hbWVzKTtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0aWYgKHRpcC5yZXF1aXJlc0NvbW1hbmRzPy5zb21lKGNvbW1hbmRJZCA9PiAhQ29tbWFuZHNSZWdpc3RyeS5nZXRDb21tYW5kKGNvbW1hbmRJZCkpKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmRlYnVnKCcjQ2hhdFRpcHM6IHRpcCBpcyBub3QgZWxpZ2libGUgYmVjYXVzZSBhIHJlcXVpcmVkIGNvbW1hbmQgaXMgbm90IHJlZ2lzdGVyZWQnLCB0aXAuaWQsIHRpcC5yZXF1aXJlc0NvbW1hbmRzKTtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX3RyYWNrZXIuaXNFeGNsdWRlZCh0aXApKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGlmICh0aXAuaWQgPT09ICd0aXAudGhpbmtpbmdQaHJhc2VzJyAmJiB0aGlzLl90aGlua2luZ1BocmFzZXNFdmVyTW9kaWZpZWQpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZGVidWcoJyNDaGF0VGlwczogdGlwIGV4Y2x1ZGVkIGJlY2F1c2UgdGhpbmtpbmcgcGhyYXNlcyBzZXR0aW5nIHdhcyBwcmV2aW91c2x5IG1vZGlmaWVkJywgdGlwLmlkKTtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0aWYgKCF0aGlzLl9hcmVUaXBDb21tYW5kc1JlZ2lzdGVyZWQodGlwKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmRlYnVnKCcjQ2hhdFRpcHM6IHRpcCBpcyBlbGlnaWJsZScsIHRpcC5pZCk7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwcml2YXRlIF9pc01vZGVBdmFpbGFibGUobW9kZU5hbWU6IHN0cmluZywgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IHdpZGdldCA9IHRoaXMuX2NoYXRXaWRnZXRTZXJ2aWNlLmdldEFsbFdpZGdldHMoKS5maW5kKHdpZGdldCA9PiB3aWRnZXQuc2NvcGVkQ29udGV4dEtleVNlcnZpY2UgPT09IGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRyZXR1cm4gISF3aWRnZXQ/LmlucHV0LmN1cnJlbnRDaGF0TW9kZXNPYnMuZ2V0KCkuZmluZE1vZGVCeU5hbWUobW9kZU5hbWUpO1xuXHR9XG5cblx0cHJpdmF0ZSBfYXJlVGlwQ29tbWFuZHNSZWdpc3RlcmVkKHRpcDogSVRpcERlZmluaXRpb24pOiBib29sZWFuIHtcblx0XHRjb25zdCBjdHg6IElUaXBCdWlsZENvbnRleHQgPSB7IGtleWJpbmRpbmdTZXJ2aWNlOiB0aGlzLl9rZXliaW5kaW5nU2VydmljZSwgZXhwZXJpbWVudGFsVGlwTWVzc2FnZXM6IHRoaXMuX2V4cGVyaW1lbnRhbFRpcE1lc3NhZ2VzIH07XG5cdFx0Y29uc3QgcmF3TWVzc2FnZSA9IHRpcC5idWlsZE1lc3NhZ2UoY3R4KTtcblx0XHRjb25zdCBjb21tYW5kSWRzID0gZXh0cmFjdENvbW1hbmRJZHMocmF3TWVzc2FnZS52YWx1ZSk7XG5cdFx0Zm9yIChjb25zdCBjb21tYW5kSWQgb2YgY29tbWFuZElkcykge1xuXHRcdFx0aWYgKCFDb21tYW5kc1JlZ2lzdHJ5LmdldENvbW1hbmQoY29tbWFuZElkKSkge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmRlYnVnKCcjQ2hhdFRpcHM6IHRpcCBleGNsdWRlZCBiZWNhdXNlIGNvbW1hbmQgaXMgbm90IHJlZ2lzdGVyZWQnLCB0aXAuaWQsIGNvbW1hbmRJZCk7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwcml2YXRlIF9pc1NldHRpbmdNb2RpZmllZChrZXk6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IGluc3BlY3RlZCA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmluc3BlY3Qoa2V5KTtcblx0XHRyZXR1cm4gaW5zcGVjdGVkLnVzZXJWYWx1ZSAhPT0gdW5kZWZpbmVkXG5cdFx0XHR8fCBpbnNwZWN0ZWQudXNlckxvY2FsVmFsdWUgIT09IHVuZGVmaW5lZFxuXHRcdFx0fHwgaW5zcGVjdGVkLnVzZXJSZW1vdGVWYWx1ZSAhPT0gdW5kZWZpbmVkXG5cdFx0XHR8fCBpbnNwZWN0ZWQud29ya3NwYWNlVmFsdWUgIT09IHVuZGVmaW5lZFxuXHRcdFx0fHwgaW5zcGVjdGVkLndvcmtzcGFjZUZvbGRlclZhbHVlICE9PSB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRDdXJyZW50Q2hhdE1vZGVsSWQoY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSk6IHN0cmluZyB7XG5cdFx0Y29uc3Qgbm9ybWFsaXplID0gKG1vZGVsSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCk6IHN0cmluZyA9PiB7XG5cdFx0XHRjb25zdCBub3JtYWxpemVkTW9kZWxJZCA9IG1vZGVsSWQ/LnRvTG93ZXJDYXNlKCkgPz8gJyc7XG5cdFx0XHRpZiAoIW5vcm1hbGl6ZWRNb2RlbElkKSB7XG5cdFx0XHRcdHJldHVybiAnJztcblx0XHRcdH1cblxuXHRcdFx0aWYgKG5vcm1hbGl6ZWRNb2RlbElkLmluY2x1ZGVzKCcvJykpIHtcblx0XHRcdFx0cmV0dXJuIG5vcm1hbGl6ZWRNb2RlbElkLnNwbGl0KCcvJykuYXQoLTEpID8/ICcnO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gbm9ybWFsaXplZE1vZGVsSWQ7XG5cdFx0fTtcblxuXHRcdHJldHVybiBub3JtYWxpemUoZ2V0U2VsZWN0ZWRNb2RlbElkZW50aWZpZXIoY29udGV4dEtleVNlcnZpY2UsIHRoaXMuX3N0b3JhZ2VTZXJ2aWNlKSk7XG5cdH1cblxuXHRwcml2YXRlIF9pc0NoYXRMb2NhdGlvbihjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgbG9jYXRpb24gPSBjb250ZXh0S2V5U2VydmljZS5nZXRDb250ZXh0S2V5VmFsdWU8Q2hhdEFnZW50TG9jYXRpb24+KENoYXRDb250ZXh0S2V5cy5sb2NhdGlvbi5rZXkpO1xuXHRcdHJldHVybiAhbG9jYXRpb24gfHwgbG9jYXRpb24gPT09IENoYXRBZ2VudExvY2F0aW9uLkNoYXQ7XG5cdH1cblxuXHRwcml2YXRlIF9pc0NoYXRRdW90YUV4Y2VlZGVkKGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gY29udGV4dEtleVNlcnZpY2UuZ2V0Q29udGV4dEtleVZhbHVlPGJvb2xlYW4+KENoYXRDb250ZXh0S2V5cy5jaGF0UXVvdGFFeGNlZWRlZC5rZXkpID09PSB0cnVlO1xuXHR9XG5cblx0cHJpdmF0ZSBfaXNDb3BpbG90RW5hYmxlZCgpOiBib29sZWFuIHtcblx0XHRjb25zdCBkZWZhdWx0Q2hhdEFnZW50ID0gdGhpcy5fcHJvZHVjdFNlcnZpY2UuZGVmYXVsdENoYXRBZ2VudDtcblx0XHRyZXR1cm4gISFkZWZhdWx0Q2hhdEFnZW50Py5jaGF0RXh0ZW5zaW9uSWQ7XG5cdH1cblxuXHRwcml2YXRlIF9mZXRjaEV4cGVyaW1lbnRhbFRpcE1lc3NhZ2VzKCk6IHZvaWQge1xuXHRcdHRoaXMuX2Fzc2lnbm1lbnRTZXJ2aWNlLmdldFRyZWF0bWVudDxzdHJpbmc+KENoYXRUaXBFeHBlcmltZW50Lk9wZW5BZ2VudHNXaW5kb3dUaXApLnRoZW4odmFsdWUgPT4ge1xuXHRcdFx0aWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycgJiYgdmFsdWUubGVuZ3RoID4gMCkge1xuXHRcdFx0XHR0aGlzLl9leHBlcmltZW50YWxUaXBNZXNzYWdlcy5zZXQoQ2hhdFRpcEV4cGVyaW1lbnQuT3BlbkFnZW50c1dpbmRvd1RpcCwgdmFsdWUpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfY3JlYXRlVGlwKHRpcERlZjogSVRpcERlZmluaXRpb24pOiBJQ2hhdFRpcCB7XG5cdFx0Ly8gQnVpbGQgdGhlIHRpcCBtZXNzYWdlIHdpdGggZHluYW1pYyBrZXliaW5kaW5ncyBhbmQgY29tbWFuZCBsYWJlbHNcblx0XHRjb25zdCBjdHg6IElUaXBCdWlsZENvbnRleHQgPSB7IGtleWJpbmRpbmdTZXJ2aWNlOiB0aGlzLl9rZXliaW5kaW5nU2VydmljZSwgZXhwZXJpbWVudGFsVGlwTWVzc2FnZXM6IHRoaXMuX2V4cGVyaW1lbnRhbFRpcE1lc3NhZ2VzIH07XG5cdFx0Y29uc3QgcmF3TWVzc2FnZSA9IHRpcERlZi5idWlsZE1lc3NhZ2UoY3R4KTtcblxuXHRcdC8vIEFkZCBcIlRpcDpcIiBwcmVmaXggb25jZSBoZXJlLCBhdm9pZGluZyBkdXBsaWNhdGlvbiBpbiBpbmRpdmlkdWFsIHRpcCBkZWZpbml0aW9uc1xuXHRcdGNvbnN0IHByZWZpeGVkTWVzc2FnZSA9IGxvY2FsaXplKCd0aXBQcmVmaXgnLCBcIioqVGlwOioqIHswfVwiLCByYXdNZXNzYWdlLnZhbHVlKTtcblxuXHRcdC8vIEF1dG8tZXh0cmFjdCBlbmFibGVkIGNvbW1hbmRzIGZyb20gdGhlIGJ1aWx0IG1lc3NhZ2Vcblx0XHRjb25zdCBlbmFibGVkQ29tbWFuZHMgPSBleHRyYWN0Q29tbWFuZElkcyhwcmVmaXhlZE1lc3NhZ2UpO1xuXG5cdFx0Y29uc3QgbWFya2Rvd24gPSBuZXcgTWFya2Rvd25TdHJpbmcocHJlZml4ZWRNZXNzYWdlLCB7XG5cdFx0XHRpc1RydXN0ZWQ6IGVuYWJsZWRDb21tYW5kcy5sZW5ndGggPiAwID8geyBlbmFibGVkQ29tbWFuZHMgfSA6IGZhbHNlLFxuXHRcdH0pO1xuXHRcdHJldHVybiB7XG5cdFx0XHRpZDogdGlwRGVmLmlkLFxuXHRcdFx0Y29udGVudDogbWFya2Rvd24sXG5cdFx0XHRlbmFibGVkQ29tbWFuZHMsXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgX2xvZ1RpcFRlbGVtZXRyeSh0aXBJZDogc3RyaW5nLCBhY3Rpb246IHN0cmluZywgY29tbWFuZElkPzogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fdGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPENoYXRUaXBFdmVudCwgQ2hhdFRpcENsYXNzaWZpY2F0aW9uPignY2hhdFRpcCcsIHtcblx0XHRcdHRpcElkLFxuXHRcdFx0YWN0aW9uLFxuXHRcdFx0Y29tbWFuZElkLFxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfdHJhY2tUaXBDb21tYW5kQ2xpY2tzKHRpcDogSVRpcERlZmluaXRpb24pOiB2b2lkIHtcblx0XHR0aGlzLl90aXBDb21tYW5kTGlzdGVuZXIuY2xlYXIoKTtcblxuXHRcdC8vIEJ1aWxkIG1lc3NhZ2UgdG8gZXh0cmFjdCBlbmFibGVkIGNvbW1hbmRzIGR5bmFtaWNhbGx5XG5cdFx0Y29uc3QgY3R4OiBJVGlwQnVpbGRDb250ZXh0ID0geyBrZXliaW5kaW5nU2VydmljZTogdGhpcy5fa2V5YmluZGluZ1NlcnZpY2UsIGV4cGVyaW1lbnRhbFRpcE1lc3NhZ2VzOiB0aGlzLl9leHBlcmltZW50YWxUaXBNZXNzYWdlcyB9O1xuXHRcdGNvbnN0IHJhd01lc3NhZ2UgPSB0aXAuYnVpbGRNZXNzYWdlKGN0eCk7XG5cdFx0Y29uc3QgZW5hYmxlZENvbW1hbmRzID0gZXh0cmFjdENvbW1hbmRJZHMocmF3TWVzc2FnZS52YWx1ZSk7XG5cblx0XHRpZiAoIWVuYWJsZWRDb21tYW5kcy5sZW5ndGgpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgZW5hYmxlZENvbW1hbmRTZXQgPSBuZXcgU2V0KGVuYWJsZWRDb21tYW5kcyk7XG5cdFx0dGhpcy5fdGlwQ29tbWFuZExpc3RlbmVyLnZhbHVlID0gdGhpcy5fY29tbWFuZFNlcnZpY2Uub25EaWRFeGVjdXRlQ29tbWFuZChlID0+IHtcblx0XHRcdGlmIChlbmFibGVkQ29tbWFuZFNldC5oYXMoZS5jb21tYW5kSWQpICYmIHRoaXMuX3Nob3duVGlwPy5pZCA9PT0gdGlwLmlkKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1RpcFRlbGVtZXRyeSh0aXAuaWQsICdjb21tYW5kQ2xpY2tlZCcsIGUuY29tbWFuZElkKTtcblx0XHRcdFx0dGhpcy5kaXNtaXNzVGlwRm9yU2Vzc2lvbigpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVhZEFwcGxpY2F0aW9uV2l0aFByb2ZpbGVGYWxsYmFjayhrZXk6IHN0cmluZyk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgYXBwbGljYXRpb25WYWx1ZSA9IHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLmdldChrZXksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTik7XG5cdFx0aWYgKGFwcGxpY2F0aW9uVmFsdWUpIHtcblx0XHRcdHJldHVybiBhcHBsaWNhdGlvblZhbHVlO1xuXHRcdH1cblxuXHRcdGNvbnN0IHByb2ZpbGVWYWx1ZSA9IHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLmdldChrZXksIFN0b3JhZ2VTY29wZS5QUk9GSUxFKTtcblx0XHRpZiAocHJvZmlsZVZhbHVlKSB7XG5cdFx0XHR0aGlzLl9zdG9yYWdlU2VydmljZS5zdG9yZShrZXksIHByb2ZpbGVWYWx1ZSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHRcdH1cblxuXHRcdHJldHVybiBwcm9maWxlVmFsdWU7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxlQUFzQjtBQUMvQixTQUFTLHNCQUFzQjtBQUUvQixTQUFTLGlCQUFpQiw2QkFBNkI7QUFDdkQsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxrQ0FBa0M7QUFDM0MsU0FBUyxtQkFBbUIseUJBQXlCO0FBQ3JELFNBQVMscUJBQXFCLDZCQUE2QjtBQUMzRCxTQUFTLFlBQVkseUJBQXlCO0FBQzlDLFNBQVMsa0JBQWtCLHVCQUF1QjtBQUNsRCxTQUFTLGlCQUFpQixjQUFjLHFCQUFxQjtBQUM3RCxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLG1CQUFtQjtBQUM1QixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLHVDQUF1QztBQUNoRCxTQUFTLGlCQUFpQiwrQkFBK0I7QUFDekQsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxnQ0FBZ0MsZ0NBQWdDLG1DQUF1RDtBQUNoSSxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLG1CQUFtQixhQUFhLG1CQUFxRCxtQkFBbUI7QUFDakgsU0FBUyxvQkFBb0IsMkJBQTJCO0FBQ3hELFNBQVMsbUNBQW1DO0FBQzVDLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsMEJBQTBCO0FBbUI1QixNQUFNLDBDQUEwQyxvQkFBb0I7QUFFcEUsTUFBTSw2Q0FBNkMsb0JBQW9CO0FBRXZFLE1BQU0saUNBQWlDLG9CQUFvQjtBQUUzRCxNQUFNLGdDQUFnQyxvQkFBb0I7QUFFMUQsTUFBTSxnQ0FBZ0Msb0JBQW9CO0FBRTFELE1BQU0scUNBQXFDLG9CQUFvQjtBQUUvRCxNQUFNLGtCQUFrQixnQkFBaUMsZ0JBQWdCO0FBeUdoRixTQUFTLHlCQUFBQSw4QkFBNkI7QUFFL0IsSUFBTSxpQkFBTixjQUE2QixXQUFzQztBQUFBLEVBd0N6RSxZQUNtQyxp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QUFnQixJQUFJO0FBQUEsSUFDL0QsQ0FBQztBQUNELFdBQU87QUFBQSxNQUNOLElBQUksT0FBTztBQUFBLE1BQ1gsU0FBUztBQUFBLE1BQ1Q7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUFBLEVBRVEsaUJBQWlCLE9BQWUsUUFBZ0IsV0FBMEI7QUFDakYsU0FBSyxrQkFBa0IsV0FBZ0QsV0FBVztBQUFBLE1BQ2pGO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFUSx1QkFBdUIsS0FBMkI7QUFDekQsU0FBSyxvQkFBb0IsTUFBTTtBQUcvQixVQUFNLE1BQXdCLEVBQUUsbUJBQW1CLEtBQUssb0JBQW9CLHlCQUF5QixLQUFLLHlCQUF5QjtBQUNuSSxVQUFNLGFBQWEsSUFBSSxhQUFhLEdBQUc7QUFDdkMsVUFBTSxrQkFBa0Isa0JBQWtCLFdBQVcsS0FBSztBQUUxRCxRQUFJLENBQUMsZ0JBQWdCLFFBQVE7QUFDNUI7QUFBQSxJQUNEO0FBQ0EsVUFBTSxvQkFBb0IsSUFBSSxJQUFJLGVBQWU7QUFDakQsU0FBSyxvQkFBb0IsUUFBUSxLQUFLLGdCQUFnQixvQkFBb0IsT0FBSztBQUM5RSxVQUFJLGtCQUFrQixJQUFJLEVBQUUsU0FBUyxLQUFLLEtBQUssV0FBVyxPQUFPLElBQUksSUFBSTtBQUN4RSxhQUFLLGlCQUFpQixJQUFJLElBQUksa0JBQWtCLEVBQUUsU0FBUztBQUMzRCxhQUFLLHFCQUFxQjtBQUFBLE1BQzNCO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRVEsb0NBQW9DLEtBQWlDO0FBQzVFLFVBQU0sbUJBQW1CLEtBQUssZ0JBQWdCLElBQUksS0FBSyxhQUFhLFdBQVc7QUFDL0UsUUFBSSxrQkFBa0I7QUFDckIsYUFBTztBQUFBLElBQ1I7QUFFQSxVQUFNLGVBQWUsS0FBSyxnQkFBZ0IsSUFBSSxLQUFLLGFBQWEsT0FBTztBQUN2RSxRQUFJLGNBQWM7QUFDakIsV0FBSyxnQkFBZ0IsTUFBTSxLQUFLLGNBQWMsYUFBYSxhQUFhLGNBQWMsT0FBTztBQUFBLElBQzlGO0FBRUEsV0FBTztBQUFBLEVBQ1I7QUFDRDtBQXp2QmEsaUJBQU47QUFBQSxFQXlDSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FwRFU7IiwKICAibmFtZXMiOiBbIlRpcEVsaWdpYmlsaXR5VHJhY2tlciIsICJ0aXAiLCAid2lkZ2V0Il0KfQo=
