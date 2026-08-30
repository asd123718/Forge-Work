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
import { Codicon } from "../../../base/common/codicons.js";
import { toErrorMessage } from "../../../base/common/errorMessage.js";
import { isCancellationError } from "../../../base/common/errors.js";
import { matchesBaseContiguousSubString, matchesWords, or } from "../../../base/common/filters.js";
import { createSingleCallFunction } from "../../../base/common/functional.js";
import { Disposable } from "../../../base/common/lifecycle.js";
import { LRUCache } from "../../../base/common/map.js";
import { ThemeIcon } from "../../../base/common/themables.js";
import { TfIdfCalculator, normalizeTfIdfScores } from "../../../base/common/tfIdf.js";
import { localize } from "../../../nls.js";
import { ICommandService } from "../../commands/common/commands.js";
import { IConfigurationService } from "../../configuration/common/configuration.js";
import { IDialogService } from "../../dialogs/common/dialogs.js";
import { IInstantiationService } from "../../instantiation/common/instantiation.js";
import { IKeybindingService } from "../../keybinding/common/keybinding.js";
import { ILogService } from "../../log/common/log.js";
import { PickerQuickAccessProvider, TriggerAction } from "./pickerQuickAccess.js";
import { IStorageService, StorageScope, StorageTarget, WillSaveStateReason } from "../../storage/common/storage.js";
import { ITelemetryService } from "../../telemetry/common/telemetry.js";
import { Categories } from "../../action/common/actionCommonCategories.js";
let AbstractCommandsQuickAccessProvider = class extends PickerQuickAccessProvider {
  constructor(options, instantiationService, keybindingService, commandService, telemetryService, dialogService) {
    super(AbstractCommandsQuickAccessProvider.PREFIX, options);
    this.keybindingService = keybindingService;
    this.commandService = commandService;
    this.telemetryService = telemetryService;
    this.dialogService = dialogService;
    this.commandsHistory = this._register(instantiationService.createInstance(CommandsHistory));
    this.options = options;
  }
  async _getPicks(filter, _disposables, token, runOptions) {
    const allCommandPicks = await this.getCommandPicks(token);
    if (token.isCancellationRequested) {
      return [];
    }
    const runTfidf = createSingleCallFunction(() => {
      const tfidf = new TfIdfCalculator();
      tfidf.updateDocuments(allCommandPicks.map((commandPick) => ({
        key: commandPick.commandId,
        textChunks: [this.getTfIdfChunk(commandPick)]
      })));
      const result = tfidf.calculateScores(filter, token);
      return normalizeTfIdfScores(result).filter((score) => score.score > AbstractCommandsQuickAccessProvider.TFIDF_THRESHOLD).slice(0, AbstractCommandsQuickAccessProvider.TFIDF_MAX_RESULTS);
    });
    const filteredCommandPicks = [];
    for (const commandPick of allCommandPicks) {
      const labelHighlights = AbstractCommandsQuickAccessProvider.WORD_FILTER(filter, commandPick.label) ?? void 0;
      let aliasHighlights;
      if (commandPick.commandAlias) {
        aliasHighlights = AbstractCommandsQuickAccessProvider.WORD_FILTER(filter, commandPick.commandAlias) ?? void 0;
      }
      if (labelHighlights || aliasHighlights) {
        commandPick.highlights = {
          label: labelHighlights,
          detail: this.options.showAlias ? aliasHighlights : void 0
        };
        filteredCommandPicks.push(commandPick);
      } else if (filter === commandPick.commandId) {
        filteredCommandPicks.push(commandPick);
      } else if (filter.length >= 3) {
        const tfidf = runTfidf();
        if (token.isCancellationRequested) {
          return [];
        }
        const tfidfScore = tfidf.find((score) => score.key === commandPick.commandId);
        if (tfidfScore) {
          commandPick.tfIdfScore = tfidfScore.score;
          filteredCommandPicks.push(commandPick);
        }
      }
    }
    const mapLabelToCommand = /* @__PURE__ */ new Map();
    for (const commandPick of filteredCommandPicks) {
      const existingCommandForLabel = mapLabelToCommand.get(commandPick.label);
      if (existingCommandForLabel) {
        commandPick.description = commandPick.commandId;
        existingCommandForLabel.description = existingCommandForLabel.commandId;
      } else {
        mapLabelToCommand.set(commandPick.label, commandPick);
      }
    }
    filteredCommandPicks.sort((commandPickA, commandPickB) => {
      if (commandPickA.tfIdfScore && commandPickB.tfIdfScore) {
        if (commandPickA.tfIdfScore === commandPickB.tfIdfScore) {
          return commandPickA.label.localeCompare(commandPickB.label);
        }
        return commandPickB.tfIdfScore - commandPickA.tfIdfScore;
      } else if (commandPickA.tfIdfScore) {
        return 1;
      } else if (commandPickB.tfIdfScore) {
        return -1;
      }
      const commandACounter = this.commandsHistory.peek(commandPickA.commandId);
      const commandBCounter = this.commandsHistory.peek(commandPickB.commandId);
      if (commandACounter && commandBCounter) {
        return commandACounter > commandBCounter ? -1 : 1;
      }
      if (commandACounter) {
        return -1;
      }
      if (commandBCounter) {
        return 1;
      }
      if (this.options.suggestedCommandIds) {
        const commandASuggestion = this.options.suggestedCommandIds.has(commandPickA.commandId);
        const commandBSuggestion = this.options.suggestedCommandIds.has(commandPickB.commandId);
        if (commandASuggestion && commandBSuggestion) {
          return 0;
        }
        if (commandASuggestion) {
          return -1;
        }
        if (commandBSuggestion) {
          return 1;
        }
      }
      const isDeveloperA = commandPickA.commandCategory === Categories.Developer.value;
      const isDeveloperB = commandPickB.commandCategory === Categories.Developer.value;
      if (isDeveloperA && !isDeveloperB) {
        return 1;
      }
      if (!isDeveloperA && isDeveloperB) {
        return -1;
      }
      return commandPickA.label.localeCompare(commandPickB.label);
    });
    const commandPicks = [];
    let addOtherSeparator = false;
    let addSuggestedSeparator = true;
    let addCommonlyUsedSeparator = !!this.options.suggestedCommandIds;
    for (let i = 0; i < filteredCommandPicks.length; i++) {
      const commandPick = filteredCommandPicks[i];
      const isInHistory = !!this.commandsHistory.peek(commandPick.commandId);
      if (i === 0 && isInHistory) {
        commandPicks.push({ type: "separator", label: localize("recentlyUsed", "recently used") });
        addOtherSeparator = true;
      }
      if (addSuggestedSeparator && commandPick.tfIdfScore !== void 0) {
        commandPicks.push({ type: "separator", label: localize("suggested", "similar commands") });
        addSuggestedSeparator = false;
      }
      if (addCommonlyUsedSeparator && commandPick.tfIdfScore === void 0 && !isInHistory && this.options.suggestedCommandIds?.has(commandPick.commandId)) {
        commandPicks.push({ type: "separator", label: localize("commonlyUsed", "commonly used") });
        addOtherSeparator = true;
        addCommonlyUsedSeparator = false;
      }
      if (addOtherSeparator && commandPick.tfIdfScore === void 0 && !isInHistory && !this.options.suggestedCommandIds?.has(commandPick.commandId)) {
        commandPicks.push({ type: "separator", label: localize("morecCommands", "other commands") });
        addOtherSeparator = false;
      }
      commandPicks.push(this.toCommandPick(commandPick, runOptions, isInHistory));
    }
    if (!this.hasAdditionalCommandPicks(filter, token)) {
      return commandPicks;
    }
    return {
      picks: commandPicks,
      additionalPicks: (async () => {
        const additionalCommandPicks = await this.getAdditionalCommandPicks(allCommandPicks, filteredCommandPicks, filter, token);
        if (token.isCancellationRequested) {
          return [];
        }
        const commandPicks2 = additionalCommandPicks.map((commandPick) => this.toCommandPick(commandPick, runOptions));
        if (addSuggestedSeparator && commandPicks2[0]?.type !== "separator") {
          commandPicks2.unshift({ type: "separator", label: localize("suggested", "similar commands") });
        }
        return commandPicks2;
      })()
    };
  }
  toCommandPick(commandPick, runOptions, isRecentlyUsed = false) {
    if (commandPick.type === "separator") {
      return commandPick;
    }
    const tooltip = commandPick.tooltip ?? commandPick.commandDescription?.value;
    const keybinding = this.keybindingService.lookupKeybinding(commandPick.commandId);
    const ariaLabel = keybinding ? localize("commandPickAriaLabelWithKeybinding", "{0}, {1}", commandPick.label, keybinding.getAriaLabel()) : commandPick.label;
    const existingButtons = commandPick.buttons || [];
    const buttons = isRecentlyUsed ? [
      ...existingButtons,
      {
        iconClass: ThemeIcon.asClassName(Codicon.close),
        tooltip: localize("removeFromRecentlyUsed", "Remove from Recently Used")
      }
    ] : commandPick.buttons;
    return {
      ...commandPick,
      tooltip,
      ariaLabel,
      detail: this.options.showAlias && commandPick.commandAlias !== commandPick.label ? commandPick.commandAlias : void 0,
      keybinding,
      buttons,
      accept: async () => {
        this.commandsHistory.push(commandPick.commandId);
        this.telemetryService.publicLog2("workbenchActionExecuted", {
          id: commandPick.commandId,
          from: runOptions?.from ?? "quick open"
        });
        try {
          commandPick.args?.length ? await this.commandService.executeCommand(commandPick.commandId, ...commandPick.args) : await this.commandService.executeCommand(commandPick.commandId);
        } catch (error) {
          if (!isCancellationError(error)) {
            this.dialogService.error(localize("canNotRun", "Command '{0}' resulted in an error", commandPick.label), toErrorMessage(error));
          }
        }
      },
      trigger: isRecentlyUsed ? (buttonIndex, keyMods) => {
        const removeButtonIndex = existingButtons.length;
        if (buttonIndex === removeButtonIndex) {
          this.commandsHistory.remove(commandPick.commandId);
          return TriggerAction.REMOVE_ITEM;
        }
        if (commandPick.trigger) {
          return commandPick.trigger(buttonIndex, keyMods);
        }
        return TriggerAction.NO_ACTION;
      } : commandPick.trigger
    };
  }
  // TF-IDF string to be indexed
  getTfIdfChunk({ label, commandAlias, commandDescription }) {
    let chunk = label;
    if (commandAlias && commandAlias !== label) {
      chunk += ` - ${commandAlias}`;
    }
    if (commandDescription && commandDescription.value !== label) {
      chunk += ` - ${commandDescription.value === commandDescription.original ? commandDescription.value : `${commandDescription.value} (${commandDescription.original})`}`;
    }
    return chunk;
  }
};
AbstractCommandsQuickAccessProvider.PREFIX = ">";
AbstractCommandsQuickAccessProvider.TFIDF_THRESHOLD = 0.5;
AbstractCommandsQuickAccessProvider.TFIDF_MAX_RESULTS = 5;
AbstractCommandsQuickAccessProvider.WORD_FILTER = or(matchesBaseContiguousSubString, matchesWords);
AbstractCommandsQuickAccessProvider = __decorateClass([
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, IKeybindingService),
  __decorateParam(3, ICommandService),
  __decorateParam(4, ITelemetryService),
  __decorateParam(5, IDialogService)
], AbstractCommandsQuickAccessProvider);
let CommandsHistory = class extends Disposable {
  constructor(storageService, configurationService, logService) {
    super();
    this.storageService = storageService;
    this.configurationService = configurationService;
    this.logService = logService;
    this.configuredCommandsHistoryLength = 0;
    this.updateConfiguration();
    this.load();
    this.registerListeners();
  }
  registerListeners() {
    this._register(this.configurationService.onDidChangeConfiguration((e) => this.updateConfiguration(e)));
    this._register(this.storageService.onWillSaveState((e) => {
      if (e.reason === WillSaveStateReason.SHUTDOWN) {
        this.saveState();
      }
    }));
  }
  updateConfiguration(e) {
    if (e && !e.affectsConfiguration("workbench.commandPalette.history")) {
      return;
    }
    this.configuredCommandsHistoryLength = CommandsHistory.getConfiguredCommandHistoryLength(this.configurationService);
    if (CommandsHistory.cache && CommandsHistory.cache.limit !== this.configuredCommandsHistoryLength) {
      CommandsHistory.cache.limit = this.configuredCommandsHistoryLength;
      CommandsHistory.hasChanges = true;
    }
  }
  load() {
    const raw = this.storageService.get(CommandsHistory.PREF_KEY_CACHE, StorageScope.PROFILE);
    let serializedCache;
    if (raw) {
      try {
        serializedCache = JSON.parse(raw);
      } catch (error) {
        this.logService.error(`[CommandsHistory] invalid data: ${error}`);
      }
    }
    const cache = CommandsHistory.cache = new LRUCache(this.configuredCommandsHistoryLength, 1);
    if (serializedCache) {
      let entries;
      if (serializedCache.usesLRU) {
        entries = serializedCache.entries;
      } else {
        entries = serializedCache.entries.sort((a, b) => a.value - b.value);
      }
      entries.forEach((entry) => cache.set(entry.key, entry.value));
    }
    CommandsHistory.counter = this.storageService.getNumber(CommandsHistory.PREF_KEY_COUNTER, StorageScope.PROFILE, CommandsHistory.counter);
  }
  push(commandId) {
    if (!CommandsHistory.cache) {
      return;
    }
    CommandsHistory.cache.set(commandId, CommandsHistory.counter++);
    CommandsHistory.hasChanges = true;
  }
  peek(commandId) {
    return CommandsHistory.cache?.peek(commandId);
  }
  remove(commandId) {
    if (!CommandsHistory.cache) {
      return;
    }
    CommandsHistory.cache.delete(commandId);
    CommandsHistory.hasChanges = true;
  }
  saveState() {
    if (!CommandsHistory.cache) {
      return;
    }
    if (!CommandsHistory.hasChanges) {
      return;
    }
    const serializedCache = { usesLRU: true, entries: [] };
    CommandsHistory.cache.forEach((value, key) => serializedCache.entries.push({ key, value }));
    this.storageService.store(CommandsHistory.PREF_KEY_CACHE, JSON.stringify(serializedCache), StorageScope.PROFILE, StorageTarget.USER);
    this.storageService.store(CommandsHistory.PREF_KEY_COUNTER, CommandsHistory.counter, StorageScope.PROFILE, StorageTarget.USER);
    CommandsHistory.hasChanges = false;
  }
  static getConfiguredCommandHistoryLength(configurationService) {
    const config = configurationService.getValue();
    const configuredCommandHistoryLength = config.workbench?.commandPalette?.history;
    if (typeof configuredCommandHistoryLength === "number") {
      return configuredCommandHistoryLength;
    }
    return CommandsHistory.DEFAULT_COMMANDS_HISTORY_LENGTH;
  }
  static clearHistory(configurationService, storageService) {
    const commandHistoryLength = CommandsHistory.getConfiguredCommandHistoryLength(configurationService);
    CommandsHistory.cache = new LRUCache(commandHistoryLength);
    CommandsHistory.counter = 1;
    CommandsHistory.hasChanges = true;
  }
};
CommandsHistory.DEFAULT_COMMANDS_HISTORY_LENGTH = 50;
CommandsHistory.PREF_KEY_CACHE = "commandPalette.mru.cache";
CommandsHistory.PREF_KEY_COUNTER = "commandPalette.mru.counter";
CommandsHistory.counter = 1;
CommandsHistory.hasChanges = false;
CommandsHistory = __decorateClass([
  __decorateParam(0, IStorageService),
  __decorateParam(1, IConfigurationService),
  __decorateParam(2, ILogService)
], CommandsHistory);
export {
  AbstractCommandsQuickAccessProvider,
  CommandsHistory
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxccXVpY2tpbnB1dFxcYnJvd3NlclxcY29tbWFuZHNRdWlja0FjY2Vzcy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IFdvcmtiZW5jaEFjdGlvbkV4ZWN1dGVkQ2xhc3NpZmljYXRpb24sIFdvcmtiZW5jaEFjdGlvbkV4ZWN1dGVkRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyB0b0Vycm9yTWVzc2FnZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9yTWVzc2FnZS5qcyc7XG5pbXBvcnQgeyBpc0NhbmNlbGxhdGlvbkVycm9yIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IElNYXRjaCwgbWF0Y2hlc0Jhc2VDb250aWd1b3VzU3ViU3RyaW5nLCBtYXRjaGVzV29yZHMsIG9yIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZmlsdGVycy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVTaW5nbGVDYWxsRnVuY3Rpb24gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9mdW5jdGlvbmFsLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgTFJVQ2FjaGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXAuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IFRmSWRmQ2FsY3VsYXRvciwgbm9ybWFsaXplVGZJZGZTY29yZXMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi90ZklkZi5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJTG9jYWxpemVkU3RyaW5nIH0gZnJvbSAnLi4vLi4vYWN0aW9uL2NvbW1vbi9hY3Rpb24uanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uQ2hhbmdlRXZlbnQsIElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSURpYWxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IEZhc3RBbmRTbG93UGlja3MsIElQaWNrZXJRdWlja0FjY2Vzc0l0ZW0sIElQaWNrZXJRdWlja0FjY2Vzc1Byb3ZpZGVyT3B0aW9ucywgUGlja2VyUXVpY2tBY2Nlc3NQcm92aWRlciwgUGlja3MsIFRyaWdnZXJBY3Rpb24gfSBmcm9tICcuL3BpY2tlclF1aWNrQWNjZXNzLmpzJztcbmltcG9ydCB7IElRdWlja0FjY2Vzc1Byb3ZpZGVyUnVuT3B0aW9ucyB9IGZyb20gJy4uL2NvbW1vbi9xdWlja0FjY2Vzcy5qcyc7XG5pbXBvcnQgeyBJS2V5TW9kcywgSVF1aWNrUGlja1NlcGFyYXRvciB9IGZyb20gJy4uL2NvbW1vbi9xdWlja0lucHV0LmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0LCBXaWxsU2F2ZVN0YXRlUmVhc29uIH0gZnJvbSAnLi4vLi4vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IENhdGVnb3JpZXMgfSBmcm9tICcuLi8uLi9hY3Rpb24vY29tbW9uL2FjdGlvbkNvbW1vbkNhdGVnb3JpZXMuanMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIElDb21tYW5kUXVpY2tQaWNrIGV4dGVuZHMgSVBpY2tlclF1aWNrQWNjZXNzSXRlbSB7XG5cdHJlYWRvbmx5IGNvbW1hbmRJZDogc3RyaW5nO1xuXHRyZWFkb25seSBjb21tYW5kV2hlbj86IHN0cmluZztcblx0cmVhZG9ubHkgY29tbWFuZEFsaWFzPzogc3RyaW5nO1xuXHRyZWFkb25seSBjb21tYW5kRGVzY3JpcHRpb24/OiBJTG9jYWxpemVkU3RyaW5nO1xuXHRyZWFkb25seSBjb21tYW5kQ2F0ZWdvcnk/OiBzdHJpbmc7XG5cblx0cmVhZG9ubHkgYXJncz86IHVua25vd25bXTtcblxuXHR0ZklkZlNjb3JlPzogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElDb21tYW5kc1F1aWNrQWNjZXNzT3B0aW9ucyBleHRlbmRzIElQaWNrZXJRdWlja0FjY2Vzc1Byb3ZpZGVyT3B0aW9uczxJQ29tbWFuZFF1aWNrUGljaz4ge1xuXHRyZWFkb25seSBzaG93QWxpYXM6IGJvb2xlYW47XG5cdHN1Z2dlc3RlZENvbW1hbmRJZHM/OiBTZXQ8c3RyaW5nPjtcbn1cblxuZXhwb3J0IGFic3RyYWN0IGNsYXNzIEFic3RyYWN0Q29tbWFuZHNRdWlja0FjY2Vzc1Byb3ZpZGVyIGV4dGVuZHMgUGlja2VyUXVpY2tBY2Nlc3NQcm92aWRlcjxJQ29tbWFuZFF1aWNrUGljaz4gaW1wbGVtZW50cyBJRGlzcG9zYWJsZSB7XG5cblx0c3RhdGljIFBSRUZJWCA9ICc+JztcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBURklERl9USFJFU0hPTEQgPSAwLjU7XG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IFRGSURGX01BWF9SRVNVTFRTID0gNTtcblxuXHRwcml2YXRlIHN0YXRpYyBXT1JEX0ZJTFRFUiA9IG9yKG1hdGNoZXNCYXNlQ29udGlndW91c1N1YlN0cmluZywgbWF0Y2hlc1dvcmRzKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGNvbW1hbmRzSGlzdG9yeTogQ29tbWFuZHNIaXN0b3J5O1xuXG5cdHByb3RlY3RlZCBvdmVycmlkZSByZWFkb25seSBvcHRpb25zOiBJQ29tbWFuZHNRdWlja0FjY2Vzc09wdGlvbnM7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0b3B0aW9uczogSUNvbW1hbmRzUXVpY2tBY2Nlc3NPcHRpb25zLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBrZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdEBJRGlhbG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGRpYWxvZ1NlcnZpY2U6IElEaWFsb2dTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKEFic3RyYWN0Q29tbWFuZHNRdWlja0FjY2Vzc1Byb3ZpZGVyLlBSRUZJWCwgb3B0aW9ucyk7XG5cblx0XHR0aGlzLmNvbW1hbmRzSGlzdG9yeSA9IHRoaXMuX3JlZ2lzdGVyKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENvbW1hbmRzSGlzdG9yeSkpO1xuXG5cdFx0dGhpcy5vcHRpb25zID0gb3B0aW9ucztcblx0fVxuXG5cdHByb3RlY3RlZCBhc3luYyBfZ2V0UGlja3MoZmlsdGVyOiBzdHJpbmcsIF9kaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4sIHJ1bk9wdGlvbnM/OiBJUXVpY2tBY2Nlc3NQcm92aWRlclJ1bk9wdGlvbnMpOiBQcm9taXNlPFBpY2tzPElDb21tYW5kUXVpY2tQaWNrPiB8IEZhc3RBbmRTbG93UGlja3M8SUNvbW1hbmRRdWlja1BpY2s+PiB7XG5cblx0XHQvLyBBc2sgc3ViY2xhc3MgZm9yIGFsbCBjb21tYW5kIHBpY2tzXG5cdFx0Y29uc3QgYWxsQ29tbWFuZFBpY2tzID0gYXdhaXQgdGhpcy5nZXRDb21tYW5kUGlja3ModG9rZW4pO1xuXG5cdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXG5cdFx0Y29uc3QgcnVuVGZpZGYgPSBjcmVhdGVTaW5nbGVDYWxsRnVuY3Rpb24oKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGZpZGYgPSBuZXcgVGZJZGZDYWxjdWxhdG9yKCk7XG5cdFx0XHR0ZmlkZi51cGRhdGVEb2N1bWVudHMoYWxsQ29tbWFuZFBpY2tzLm1hcChjb21tYW5kUGljayA9PiAoe1xuXHRcdFx0XHRrZXk6IGNvbW1hbmRQaWNrLmNvbW1hbmRJZCxcblx0XHRcdFx0dGV4dENodW5rczogW3RoaXMuZ2V0VGZJZGZDaHVuayhjb21tYW5kUGljayldXG5cdFx0XHR9KSkpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gdGZpZGYuY2FsY3VsYXRlU2NvcmVzKGZpbHRlciwgdG9rZW4pO1xuXG5cdFx0XHRyZXR1cm4gbm9ybWFsaXplVGZJZGZTY29yZXMocmVzdWx0KVxuXHRcdFx0XHQuZmlsdGVyKHNjb3JlID0+IHNjb3JlLnNjb3JlID4gQWJzdHJhY3RDb21tYW5kc1F1aWNrQWNjZXNzUHJvdmlkZXIuVEZJREZfVEhSRVNIT0xEKVxuXHRcdFx0XHQuc2xpY2UoMCwgQWJzdHJhY3RDb21tYW5kc1F1aWNrQWNjZXNzUHJvdmlkZXIuVEZJREZfTUFYX1JFU1VMVFMpO1xuXHRcdH0pO1xuXG5cdFx0Ly8gRmlsdGVyXG5cdFx0Y29uc3QgZmlsdGVyZWRDb21tYW5kUGlja3M6IElDb21tYW5kUXVpY2tQaWNrW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGNvbW1hbmRQaWNrIG9mIGFsbENvbW1hbmRQaWNrcykge1xuXHRcdFx0Y29uc3QgbGFiZWxIaWdobGlnaHRzID0gQWJzdHJhY3RDb21tYW5kc1F1aWNrQWNjZXNzUHJvdmlkZXIuV09SRF9GSUxURVIoZmlsdGVyLCBjb21tYW5kUGljay5sYWJlbCkgPz8gdW5kZWZpbmVkO1xuXG5cdFx0XHRsZXQgYWxpYXNIaWdobGlnaHRzOiBJTWF0Y2hbXSB8IHVuZGVmaW5lZDtcblx0XHRcdGlmIChjb21tYW5kUGljay5jb21tYW5kQWxpYXMpIHtcblx0XHRcdFx0YWxpYXNIaWdobGlnaHRzID0gQWJzdHJhY3RDb21tYW5kc1F1aWNrQWNjZXNzUHJvdmlkZXIuV09SRF9GSUxURVIoZmlsdGVyLCBjb21tYW5kUGljay5jb21tYW5kQWxpYXMpID8/IHVuZGVmaW5lZDtcblx0XHRcdH1cblxuXHRcdFx0Ly8gQWRkIGlmIG1hdGNoaW5nIGluIGxhYmVsIG9yIGFsaWFzXG5cdFx0XHRpZiAobGFiZWxIaWdobGlnaHRzIHx8IGFsaWFzSGlnaGxpZ2h0cykge1xuXHRcdFx0XHRjb21tYW5kUGljay5oaWdobGlnaHRzID0ge1xuXHRcdFx0XHRcdGxhYmVsOiBsYWJlbEhpZ2hsaWdodHMsXG5cdFx0XHRcdFx0ZGV0YWlsOiB0aGlzLm9wdGlvbnMuc2hvd0FsaWFzID8gYWxpYXNIaWdobGlnaHRzIDogdW5kZWZpbmVkXG5cdFx0XHRcdH07XG5cblx0XHRcdFx0ZmlsdGVyZWRDb21tYW5kUGlja3MucHVzaChjb21tYW5kUGljayk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIEFsc28gYWRkIGlmIHdlIGhhdmUgYSAxMDAlIGNvbW1hbmQgSUQgbWF0Y2hcblx0XHRcdGVsc2UgaWYgKGZpbHRlciA9PT0gY29tbWFuZFBpY2suY29tbWFuZElkKSB7XG5cdFx0XHRcdGZpbHRlcmVkQ29tbWFuZFBpY2tzLnB1c2goY29tbWFuZFBpY2spO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBIYW5kbGUgdGYtaWRmIHNjb3JpbmcgZm9yIHRoZSByZXN0IGlmIHRoZXJlJ3MgYSBmaWx0ZXJcblx0XHRcdGVsc2UgaWYgKGZpbHRlci5sZW5ndGggPj0gMykge1xuXHRcdFx0XHRjb25zdCB0ZmlkZiA9IHJ1blRmaWRmKCk7XG5cdFx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRcdHJldHVybiBbXTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIEFkZCBpZiB3ZSBoYXZlIGEgdGYtaWRmIHNjb3JlXG5cdFx0XHRcdGNvbnN0IHRmaWRmU2NvcmUgPSB0ZmlkZi5maW5kKHNjb3JlID0+IHNjb3JlLmtleSA9PT0gY29tbWFuZFBpY2suY29tbWFuZElkKTtcblx0XHRcdFx0aWYgKHRmaWRmU2NvcmUpIHtcblx0XHRcdFx0XHRjb21tYW5kUGljay50ZklkZlNjb3JlID0gdGZpZGZTY29yZS5zY29yZTtcblx0XHRcdFx0XHRmaWx0ZXJlZENvbW1hbmRQaWNrcy5wdXNoKGNvbW1hbmRQaWNrKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIEFkZCBkZXNjcmlwdGlvbiB0byBjb21tYW5kcyB0aGF0IGhhdmUgZHVwbGljYXRlIGxhYmVsc1xuXHRcdGNvbnN0IG1hcExhYmVsVG9Db21tYW5kID0gbmV3IE1hcDxzdHJpbmcsIElDb21tYW5kUXVpY2tQaWNrPigpO1xuXHRcdGZvciAoY29uc3QgY29tbWFuZFBpY2sgb2YgZmlsdGVyZWRDb21tYW5kUGlja3MpIHtcblx0XHRcdGNvbnN0IGV4aXN0aW5nQ29tbWFuZEZvckxhYmVsID0gbWFwTGFiZWxUb0NvbW1hbmQuZ2V0KGNvbW1hbmRQaWNrLmxhYmVsKTtcblx0XHRcdGlmIChleGlzdGluZ0NvbW1hbmRGb3JMYWJlbCkge1xuXHRcdFx0XHRjb21tYW5kUGljay5kZXNjcmlwdGlvbiA9IGNvbW1hbmRQaWNrLmNvbW1hbmRJZDtcblx0XHRcdFx0ZXhpc3RpbmdDb21tYW5kRm9yTGFiZWwuZGVzY3JpcHRpb24gPSBleGlzdGluZ0NvbW1hbmRGb3JMYWJlbC5jb21tYW5kSWQ7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRtYXBMYWJlbFRvQ29tbWFuZC5zZXQoY29tbWFuZFBpY2subGFiZWwsIGNvbW1hbmRQaWNrKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBTb3J0IGJ5IE1SVSBvcmRlciBhbmQgZmFsbGJhY2sgdG8gbmFtZSBvdGhlcndpc2Vcblx0XHRmaWx0ZXJlZENvbW1hbmRQaWNrcy5zb3J0KChjb21tYW5kUGlja0EsIGNvbW1hbmRQaWNrQikgPT4ge1xuXG5cdFx0XHQvLyBJZiBhIHJlc3VsdCBjYW1lIGZyb20gdGYtaWRmLCB3ZSB3YW50IHRvIHB1dCB0aGF0IHRvd2FyZHMgdGhlIGJvdHRvbVxuXHRcdFx0aWYgKGNvbW1hbmRQaWNrQS50ZklkZlNjb3JlICYmIGNvbW1hbmRQaWNrQi50ZklkZlNjb3JlKSB7XG5cdFx0XHRcdGlmIChjb21tYW5kUGlja0EudGZJZGZTY29yZSA9PT0gY29tbWFuZFBpY2tCLnRmSWRmU2NvcmUpIHtcblx0XHRcdFx0XHRyZXR1cm4gY29tbWFuZFBpY2tBLmxhYmVsLmxvY2FsZUNvbXBhcmUoY29tbWFuZFBpY2tCLmxhYmVsKTsgLy8gcHJlZmVyIGxleGljb2dyYXBoaWNhbGx5IHNtYWxsZXIgY29tbWFuZFxuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuIGNvbW1hbmRQaWNrQi50ZklkZlNjb3JlIC0gY29tbWFuZFBpY2tBLnRmSWRmU2NvcmU7IC8vIHByZWZlciBoaWdoZXIgdGYtaWRmIHNjb3JlXG5cdFx0XHR9IGVsc2UgaWYgKGNvbW1hbmRQaWNrQS50ZklkZlNjb3JlKSB7XG5cdFx0XHRcdHJldHVybiAxOyAvLyBmaXJzdCBjb21tYW5kIGhhcyBhIHNjb3JlIGJ1dCBvdGhlciBkb2Vzbid0IHNvIG90aGVyIHdpbnNcblx0XHRcdH0gZWxzZSBpZiAoY29tbWFuZFBpY2tCLnRmSWRmU2NvcmUpIHtcblx0XHRcdFx0cmV0dXJuIC0xOyAvLyBvdGhlciBjb21tYW5kIGhhcyBhIHNjb3JlIGJ1dCBmaXJzdCBkb2Vzbid0IHNvIGZpcnN0IHdpbnNcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgY29tbWFuZEFDb3VudGVyID0gdGhpcy5jb21tYW5kc0hpc3RvcnkucGVlayhjb21tYW5kUGlja0EuY29tbWFuZElkKTtcblx0XHRcdGNvbnN0IGNvbW1hbmRCQ291bnRlciA9IHRoaXMuY29tbWFuZHNIaXN0b3J5LnBlZWsoY29tbWFuZFBpY2tCLmNvbW1hbmRJZCk7XG5cblx0XHRcdGlmIChjb21tYW5kQUNvdW50ZXIgJiYgY29tbWFuZEJDb3VudGVyKSB7XG5cdFx0XHRcdHJldHVybiBjb21tYW5kQUNvdW50ZXIgPiBjb21tYW5kQkNvdW50ZXIgPyAtMSA6IDE7IC8vIHVzZSBtb3JlIHJlY2VudGx5IHVzZWQgY29tbWFuZCBiZWZvcmUgb2xkZXJcblx0XHRcdH1cblxuXHRcdFx0aWYgKGNvbW1hbmRBQ291bnRlcikge1xuXHRcdFx0XHRyZXR1cm4gLTE7IC8vIGZpcnN0IGNvbW1hbmQgd2FzIHVzZWQsIHNvIGl0IHdpbnMgb3ZlciB0aGUgbm9uIHVzZWQgb25lXG5cdFx0XHR9XG5cblx0XHRcdGlmIChjb21tYW5kQkNvdW50ZXIpIHtcblx0XHRcdFx0cmV0dXJuIDE7IC8vIG90aGVyIGNvbW1hbmQgd2FzIHVzZWQgc28gaXQgd2lucyBvdmVyIHRoZSBjb21tYW5kXG5cdFx0XHR9XG5cblx0XHRcdGlmICh0aGlzLm9wdGlvbnMuc3VnZ2VzdGVkQ29tbWFuZElkcykge1xuXHRcdFx0XHRjb25zdCBjb21tYW5kQVN1Z2dlc3Rpb24gPSB0aGlzLm9wdGlvbnMuc3VnZ2VzdGVkQ29tbWFuZElkcy5oYXMoY29tbWFuZFBpY2tBLmNvbW1hbmRJZCk7XG5cdFx0XHRcdGNvbnN0IGNvbW1hbmRCU3VnZ2VzdGlvbiA9IHRoaXMub3B0aW9ucy5zdWdnZXN0ZWRDb21tYW5kSWRzLmhhcyhjb21tYW5kUGlja0IuY29tbWFuZElkKTtcblx0XHRcdFx0aWYgKGNvbW1hbmRBU3VnZ2VzdGlvbiAmJiBjb21tYW5kQlN1Z2dlc3Rpb24pIHtcblx0XHRcdFx0XHRyZXR1cm4gMDsgLy8gaG9ub3IgdGhlIG9yZGVyIG9mIHRoZSBhcnJheVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKGNvbW1hbmRBU3VnZ2VzdGlvbikge1xuXHRcdFx0XHRcdHJldHVybiAtMTsgLy8gZmlyc3QgY29tbWFuZCB3YXMgc3VnZ2VzdGVkLCBzbyBpdCB3aW5zIG92ZXIgdGhlIG5vbiBzdWdnZXN0ZWQgb25lXG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoY29tbWFuZEJTdWdnZXN0aW9uKSB7XG5cdFx0XHRcdFx0cmV0dXJuIDE7IC8vIG90aGVyIGNvbW1hbmQgd2FzIHN1Z2dlc3RlZCBzbyBpdCB3aW5zIG92ZXIgdGhlIGNvbW1hbmRcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBpZiBvbmUgaXMgRGV2ZWxvcGVyIGFuZCB0aGUgb3RoZXIgaXNuJ3QsIHB1dCBub24tRGV2ZWxvcGVyIGZpcnN0XG5cdFx0XHRjb25zdCBpc0RldmVsb3BlckEgPSBjb21tYW5kUGlja0EuY29tbWFuZENhdGVnb3J5ID09PSBDYXRlZ29yaWVzLkRldmVsb3Blci52YWx1ZTtcblx0XHRcdGNvbnN0IGlzRGV2ZWxvcGVyQiA9IGNvbW1hbmRQaWNrQi5jb21tYW5kQ2F0ZWdvcnkgPT09IENhdGVnb3JpZXMuRGV2ZWxvcGVyLnZhbHVlO1xuXHRcdFx0aWYgKGlzRGV2ZWxvcGVyQSAmJiAhaXNEZXZlbG9wZXJCKSB7XG5cdFx0XHRcdHJldHVybiAxO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCFpc0RldmVsb3BlckEgJiYgaXNEZXZlbG9wZXJCKSB7XG5cdFx0XHRcdHJldHVybiAtMTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gYm90aCBjb21tYW5kcyB3ZXJlIG5ldmVyIHVzZWQsIHNvIHdlIHNvcnQgYnkgbmFtZVxuXHRcdFx0cmV0dXJuIGNvbW1hbmRQaWNrQS5sYWJlbC5sb2NhbGVDb21wYXJlKGNvbW1hbmRQaWNrQi5sYWJlbCk7XG5cdFx0fSk7XG5cblx0XHRjb25zdCBjb21tYW5kUGlja3M6IEFycmF5PElDb21tYW5kUXVpY2tQaWNrIHwgSVF1aWNrUGlja1NlcGFyYXRvcj4gPSBbXTtcblxuXHRcdGxldCBhZGRPdGhlclNlcGFyYXRvciA9IGZhbHNlO1xuXHRcdGxldCBhZGRTdWdnZXN0ZWRTZXBhcmF0b3IgPSB0cnVlO1xuXHRcdGxldCBhZGRDb21tb25seVVzZWRTZXBhcmF0b3IgPSAhIXRoaXMub3B0aW9ucy5zdWdnZXN0ZWRDb21tYW5kSWRzO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgZmlsdGVyZWRDb21tYW5kUGlja3MubGVuZ3RoOyBpKyspIHtcblx0XHRcdGNvbnN0IGNvbW1hbmRQaWNrID0gZmlsdGVyZWRDb21tYW5kUGlja3NbaV07XG5cdFx0XHRjb25zdCBpc0luSGlzdG9yeSA9ICEhdGhpcy5jb21tYW5kc0hpc3RvcnkucGVlayhjb21tYW5kUGljay5jb21tYW5kSWQpO1xuXG5cdFx0XHQvLyBTZXBhcmF0b3I6IHJlY2VudGx5IHVzZWRcblx0XHRcdGlmIChpID09PSAwICYmIGlzSW5IaXN0b3J5KSB7XG5cdFx0XHRcdGNvbW1hbmRQaWNrcy5wdXNoKHsgdHlwZTogJ3NlcGFyYXRvcicsIGxhYmVsOiBsb2NhbGl6ZSgncmVjZW50bHlVc2VkJywgXCJyZWNlbnRseSB1c2VkXCIpIH0pO1xuXHRcdFx0XHRhZGRPdGhlclNlcGFyYXRvciA9IHRydWU7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChhZGRTdWdnZXN0ZWRTZXBhcmF0b3IgJiYgY29tbWFuZFBpY2sudGZJZGZTY29yZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdGNvbW1hbmRQaWNrcy5wdXNoKHsgdHlwZTogJ3NlcGFyYXRvcicsIGxhYmVsOiBsb2NhbGl6ZSgnc3VnZ2VzdGVkJywgXCJzaW1pbGFyIGNvbW1hbmRzXCIpIH0pO1xuXHRcdFx0XHRhZGRTdWdnZXN0ZWRTZXBhcmF0b3IgPSBmYWxzZTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gU2VwYXJhdG9yOiBjb21tb25seSB1c2VkXG5cdFx0XHRpZiAoYWRkQ29tbW9ubHlVc2VkU2VwYXJhdG9yICYmIGNvbW1hbmRQaWNrLnRmSWRmU2NvcmUgPT09IHVuZGVmaW5lZCAmJiAhaXNJbkhpc3RvcnkgJiYgdGhpcy5vcHRpb25zLnN1Z2dlc3RlZENvbW1hbmRJZHM/Lmhhcyhjb21tYW5kUGljay5jb21tYW5kSWQpKSB7XG5cdFx0XHRcdGNvbW1hbmRQaWNrcy5wdXNoKHsgdHlwZTogJ3NlcGFyYXRvcicsIGxhYmVsOiBsb2NhbGl6ZSgnY29tbW9ubHlVc2VkJywgXCJjb21tb25seSB1c2VkXCIpIH0pO1xuXHRcdFx0XHRhZGRPdGhlclNlcGFyYXRvciA9IHRydWU7XG5cdFx0XHRcdGFkZENvbW1vbmx5VXNlZFNlcGFyYXRvciA9IGZhbHNlO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBTZXBhcmF0b3I6IG90aGVyIGNvbW1hbmRzXG5cdFx0XHRpZiAoYWRkT3RoZXJTZXBhcmF0b3IgJiYgY29tbWFuZFBpY2sudGZJZGZTY29yZSA9PT0gdW5kZWZpbmVkICYmICFpc0luSGlzdG9yeSAmJiAhdGhpcy5vcHRpb25zLnN1Z2dlc3RlZENvbW1hbmRJZHM/Lmhhcyhjb21tYW5kUGljay5jb21tYW5kSWQpKSB7XG5cdFx0XHRcdGNvbW1hbmRQaWNrcy5wdXNoKHsgdHlwZTogJ3NlcGFyYXRvcicsIGxhYmVsOiBsb2NhbGl6ZSgnbW9yZWNDb21tYW5kcycsIFwib3RoZXIgY29tbWFuZHNcIikgfSk7XG5cdFx0XHRcdGFkZE90aGVyU2VwYXJhdG9yID0gZmFsc2U7XG5cdFx0XHR9XG5cblx0XHRcdC8vIENvbW1hbmRcblx0XHRcdGNvbW1hbmRQaWNrcy5wdXNoKHRoaXMudG9Db21tYW5kUGljayhjb21tYW5kUGljaywgcnVuT3B0aW9ucywgaXNJbkhpc3RvcnkpKTtcblx0XHR9XG5cblx0XHRpZiAoIXRoaXMuaGFzQWRkaXRpb25hbENvbW1hbmRQaWNrcyhmaWx0ZXIsIHRva2VuKSkge1xuXHRcdFx0cmV0dXJuIGNvbW1hbmRQaWNrcztcblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0cGlja3M6IGNvbW1hbmRQaWNrcyxcblx0XHRcdGFkZGl0aW9uYWxQaWNrczogKGFzeW5jICgpOiBQcm9taXNlPFBpY2tzPElDb21tYW5kUXVpY2tQaWNrPj4gPT4ge1xuXHRcdFx0XHRjb25zdCBhZGRpdGlvbmFsQ29tbWFuZFBpY2tzID0gYXdhaXQgdGhpcy5nZXRBZGRpdGlvbmFsQ29tbWFuZFBpY2tzKGFsbENvbW1hbmRQaWNrcywgZmlsdGVyZWRDb21tYW5kUGlja3MsIGZpbHRlciwgdG9rZW4pO1xuXHRcdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0XHRyZXR1cm4gW107XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBjb21tYW5kUGlja3M6IEFycmF5PElDb21tYW5kUXVpY2tQaWNrIHwgSVF1aWNrUGlja1NlcGFyYXRvcj4gPSBhZGRpdGlvbmFsQ29tbWFuZFBpY2tzLm1hcChjb21tYW5kUGljayA9PiB0aGlzLnRvQ29tbWFuZFBpY2soY29tbWFuZFBpY2ssIHJ1bk9wdGlvbnMpKTtcblx0XHRcdFx0Ly8gQmFzaWNhbGx5LCBpZiB3ZSBoYXZlbid0IGFscmVhZHkgYWRkZWQgYSBzZXBhcmF0b3IsIHdlIGFkZCBvbmUgYmVmb3JlIHRoZSBhZGRpdGlvbmFsIHBpY2tzIHNvIGxvbmdcblx0XHRcdFx0Ly8gYXMgb25lIGhhc24ndCBiZWVuIGFkZGVkIHRvIHRoZSBzdGFydCBvZiB0aGUgYXJyYXkuXG5cdFx0XHRcdGlmIChhZGRTdWdnZXN0ZWRTZXBhcmF0b3IgJiYgY29tbWFuZFBpY2tzWzBdPy50eXBlICE9PSAnc2VwYXJhdG9yJykge1xuXHRcdFx0XHRcdGNvbW1hbmRQaWNrcy51bnNoaWZ0KHsgdHlwZTogJ3NlcGFyYXRvcicsIGxhYmVsOiBsb2NhbGl6ZSgnc3VnZ2VzdGVkJywgXCJzaW1pbGFyIGNvbW1hbmRzXCIpIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBjb21tYW5kUGlja3M7XG5cdFx0XHR9KSgpXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgdG9Db21tYW5kUGljayhjb21tYW5kUGljazogSUNvbW1hbmRRdWlja1BpY2sgfCBJUXVpY2tQaWNrU2VwYXJhdG9yLCBydW5PcHRpb25zPzogSVF1aWNrQWNjZXNzUHJvdmlkZXJSdW5PcHRpb25zLCBpc1JlY2VudGx5VXNlZDogYm9vbGVhbiA9IGZhbHNlKTogSUNvbW1hbmRRdWlja1BpY2sgfCBJUXVpY2tQaWNrU2VwYXJhdG9yIHtcblx0XHRpZiAoY29tbWFuZFBpY2sudHlwZSA9PT0gJ3NlcGFyYXRvcicpIHtcblx0XHRcdHJldHVybiBjb21tYW5kUGljaztcblx0XHR9XG5cdFx0Y29uc3QgdG9vbHRpcCA9IGNvbW1hbmRQaWNrLnRvb2x0aXBcblx0XHRcdD8/IGNvbW1hbmRQaWNrLmNvbW1hbmREZXNjcmlwdGlvbj8udmFsdWU7XG5cblx0XHRjb25zdCBrZXliaW5kaW5nID0gdGhpcy5rZXliaW5kaW5nU2VydmljZS5sb29rdXBLZXliaW5kaW5nKGNvbW1hbmRQaWNrLmNvbW1hbmRJZCk7XG5cdFx0Y29uc3QgYXJpYUxhYmVsID0ga2V5YmluZGluZyA/XG5cdFx0XHRsb2NhbGl6ZSgnY29tbWFuZFBpY2tBcmlhTGFiZWxXaXRoS2V5YmluZGluZycsIFwiezB9LCB7MX1cIiwgY29tbWFuZFBpY2subGFiZWwsIGtleWJpbmRpbmcuZ2V0QXJpYUxhYmVsKCkpIDpcblx0XHRcdGNvbW1hbmRQaWNrLmxhYmVsO1xuXG5cdFx0Ly8gQWRkIHJlbW92ZSBidXR0b24gZm9yIHJlY2VudGx5IHVzZWQgaXRlbXMgKGFzIHRoZSBsYXN0IGJ1dHRvbiwgdG8gdGhlIHJpZ2h0KVxuXHRcdGNvbnN0IGV4aXN0aW5nQnV0dG9ucyA9IGNvbW1hbmRQaWNrLmJ1dHRvbnMgfHwgW107XG5cdFx0Y29uc3QgYnV0dG9ucyA9IGlzUmVjZW50bHlVc2VkID8gW1xuXHRcdFx0Li4uZXhpc3RpbmdCdXR0b25zLFxuXHRcdFx0e1xuXHRcdFx0XHRpY29uQ2xhc3M6IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShDb2RpY29uLmNsb3NlKSxcblx0XHRcdFx0dG9vbHRpcDogbG9jYWxpemUoJ3JlbW92ZUZyb21SZWNlbnRseVVzZWQnLCBcIlJlbW92ZSBmcm9tIFJlY2VudGx5IFVzZWRcIilcblx0XHRcdH1cblx0XHRdIDogY29tbWFuZFBpY2suYnV0dG9ucztcblxuXHRcdHJldHVybiB7XG5cdFx0XHQuLi5jb21tYW5kUGljayxcblx0XHRcdHRvb2x0aXAsXG5cdFx0XHRhcmlhTGFiZWwsXG5cdFx0XHRkZXRhaWw6IHRoaXMub3B0aW9ucy5zaG93QWxpYXMgJiYgY29tbWFuZFBpY2suY29tbWFuZEFsaWFzICE9PSBjb21tYW5kUGljay5sYWJlbCA/IGNvbW1hbmRQaWNrLmNvbW1hbmRBbGlhcyA6IHVuZGVmaW5lZCxcblx0XHRcdGtleWJpbmRpbmcsXG5cdFx0XHRidXR0b25zLFxuXHRcdFx0YWNjZXB0OiBhc3luYyAoKSA9PiB7XG5cblx0XHRcdFx0Ly8gQWRkIHRvIGhpc3Rvcnlcblx0XHRcdFx0dGhpcy5jb21tYW5kc0hpc3RvcnkucHVzaChjb21tYW5kUGljay5jb21tYW5kSWQpO1xuXG5cdFx0XHRcdC8vIFRlbGVtZW50cnlcblx0XHRcdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8V29ya2JlbmNoQWN0aW9uRXhlY3V0ZWRFdmVudCwgV29ya2JlbmNoQWN0aW9uRXhlY3V0ZWRDbGFzc2lmaWNhdGlvbj4oJ3dvcmtiZW5jaEFjdGlvbkV4ZWN1dGVkJywge1xuXHRcdFx0XHRcdGlkOiBjb21tYW5kUGljay5jb21tYW5kSWQsXG5cdFx0XHRcdFx0ZnJvbTogcnVuT3B0aW9ucz8uZnJvbSA/PyAncXVpY2sgb3Blbidcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0Ly8gUnVuXG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0Y29tbWFuZFBpY2suYXJncz8ubGVuZ3RoXG5cdFx0XHRcdFx0XHQ/IGF3YWl0IHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoY29tbWFuZFBpY2suY29tbWFuZElkLCAuLi5jb21tYW5kUGljay5hcmdzKVxuXHRcdFx0XHRcdFx0OiBhd2FpdCB0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKGNvbW1hbmRQaWNrLmNvbW1hbmRJZCk7XG5cdFx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdFx0aWYgKCFpc0NhbmNlbGxhdGlvbkVycm9yKGVycm9yKSkge1xuXHRcdFx0XHRcdFx0dGhpcy5kaWFsb2dTZXJ2aWNlLmVycm9yKGxvY2FsaXplKCdjYW5Ob3RSdW4nLCBcIkNvbW1hbmQgJ3swfScgcmVzdWx0ZWQgaW4gYW4gZXJyb3JcIiwgY29tbWFuZFBpY2subGFiZWwpLCB0b0Vycm9yTWVzc2FnZShlcnJvcikpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdHRyaWdnZXI6IGlzUmVjZW50bHlVc2VkID8gKGJ1dHRvbkluZGV4OiBudW1iZXIsIGtleU1vZHM6IElLZXlNb2RzKTogVHJpZ2dlckFjdGlvbiB8IFByb21pc2U8VHJpZ2dlckFjdGlvbj4gPT4ge1xuXHRcdFx0XHQvLyBUaGUgcmVtb3ZlIGJ1dHRvbiBpcyBub3cgdGhlIGxhc3QgYnV0dG9uXG5cdFx0XHRcdGNvbnN0IHJlbW92ZUJ1dHRvbkluZGV4ID0gZXhpc3RpbmdCdXR0b25zLmxlbmd0aDtcblx0XHRcdFx0aWYgKGJ1dHRvbkluZGV4ID09PSByZW1vdmVCdXR0b25JbmRleCkge1xuXHRcdFx0XHRcdHRoaXMuY29tbWFuZHNIaXN0b3J5LnJlbW92ZShjb21tYW5kUGljay5jb21tYW5kSWQpO1xuXHRcdFx0XHRcdHJldHVybiBUcmlnZ2VyQWN0aW9uLlJFTU9WRV9JVEVNO1xuXHRcdFx0XHR9XG5cdFx0XHRcdC8vIEhhbmRsZSBvdGhlciBidXR0b25zIChlLmcuLCBjb25maWd1cmUga2V5YmluZGluZyBidXR0b24pXG5cdFx0XHRcdGlmIChjb21tYW5kUGljay50cmlnZ2VyKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGNvbW1hbmRQaWNrLnRyaWdnZXIoYnV0dG9uSW5kZXgsIGtleU1vZHMpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBUcmlnZ2VyQWN0aW9uLk5PX0FDVElPTjtcblx0XHRcdH0gOiBjb21tYW5kUGljay50cmlnZ2VyXG5cdFx0fTtcblx0fVxuXG5cdC8vIFRGLUlERiBzdHJpbmcgdG8gYmUgaW5kZXhlZFxuXHRwcml2YXRlIGdldFRmSWRmQ2h1bmsoeyBsYWJlbCwgY29tbWFuZEFsaWFzLCBjb21tYW5kRGVzY3JpcHRpb24gfTogSUNvbW1hbmRRdWlja1BpY2spIHtcblx0XHRsZXQgY2h1bmsgPSBsYWJlbDtcblx0XHRpZiAoY29tbWFuZEFsaWFzICYmIGNvbW1hbmRBbGlhcyAhPT0gbGFiZWwpIHtcblx0XHRcdGNodW5rICs9IGAgLSAke2NvbW1hbmRBbGlhc31gO1xuXHRcdH1cblx0XHRpZiAoY29tbWFuZERlc2NyaXB0aW9uICYmIGNvbW1hbmREZXNjcmlwdGlvbi52YWx1ZSAhPT0gbGFiZWwpIHtcblx0XHRcdC8vIElmIHRoZSBvcmlnaW5hbCBpcyB0aGUgc2FtZSBhcyB0aGUgdmFsdWUsIGRvbid0IGFkZCBpdFxuXHRcdFx0Y2h1bmsgKz0gYCAtICR7Y29tbWFuZERlc2NyaXB0aW9uLnZhbHVlID09PSBjb21tYW5kRGVzY3JpcHRpb24ub3JpZ2luYWwgPyBjb21tYW5kRGVzY3JpcHRpb24udmFsdWUgOiBgJHtjb21tYW5kRGVzY3JpcHRpb24udmFsdWV9ICgke2NvbW1hbmREZXNjcmlwdGlvbi5vcmlnaW5hbH0pYH1gO1xuXHRcdH1cblx0XHRyZXR1cm4gY2h1bms7XG5cdH1cblxuXHRwcm90ZWN0ZWQgYWJzdHJhY3QgZ2V0Q29tbWFuZFBpY2tzKHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8QXJyYXk8SUNvbW1hbmRRdWlja1BpY2s+PjtcblxuXHRwcm90ZWN0ZWQgYWJzdHJhY3QgaGFzQWRkaXRpb25hbENvbW1hbmRQaWNrcyhmaWx0ZXI6IHN0cmluZywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogYm9vbGVhbjtcblx0cHJvdGVjdGVkIGFic3RyYWN0IGdldEFkZGl0aW9uYWxDb21tYW5kUGlja3MoYWxsUGlja3M6IElDb21tYW5kUXVpY2tQaWNrW10sIHBpY2tzU29GYXI6IElDb21tYW5kUXVpY2tQaWNrW10sIGZpbHRlcjogc3RyaW5nLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPEFycmF5PElDb21tYW5kUXVpY2tQaWNrIHwgSVF1aWNrUGlja1NlcGFyYXRvcj4+O1xufVxuXG5pbnRlcmZhY2UgSVNlcmlhbGl6ZWRDb21tYW5kSGlzdG9yeSB7XG5cdHJlYWRvbmx5IHVzZXNMUlU/OiBib29sZWFuO1xuXHRyZWFkb25seSBlbnRyaWVzOiB7IGtleTogc3RyaW5nOyB2YWx1ZTogbnVtYmVyIH1bXTtcbn1cblxuaW50ZXJmYWNlIElDb21tYW5kc1F1aWNrQWNjZXNzQ29uZmlndXJhdGlvbiB7XG5cdHJlYWRvbmx5IHdvcmtiZW5jaDoge1xuXHRcdHJlYWRvbmx5IGNvbW1hbmRQYWxldHRlOiB7XG5cdFx0XHRyZWFkb25seSBoaXN0b3J5OiBudW1iZXI7XG5cdFx0XHRyZWFkb25seSBwcmVzZXJ2ZUlucHV0OiBib29sZWFuO1xuXHRcdH07XG5cdH07XG59XG5cbmV4cG9ydCBjbGFzcyBDb21tYW5kc0hpc3RvcnkgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgREVGQVVMVF9DT01NQU5EU19ISVNUT1JZX0xFTkdUSCA9IDUwO1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IFBSRUZfS0VZX0NBQ0hFID0gJ2NvbW1hbmRQYWxldHRlLm1ydS5jYWNoZSc7XG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IFBSRUZfS0VZX0NPVU5URVIgPSAnY29tbWFuZFBhbGV0dGUubXJ1LmNvdW50ZXInO1xuXG5cdHByaXZhdGUgc3RhdGljIGNhY2hlOiBMUlVDYWNoZTxzdHJpbmcsIG51bWJlcj4gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgc3RhdGljIGNvdW50ZXIgPSAxO1xuXHRwcml2YXRlIHN0YXRpYyBoYXNDaGFuZ2VzID0gZmFsc2U7XG5cblx0cHJpdmF0ZSBjb25maWd1cmVkQ29tbWFuZHNIaXN0b3J5TGVuZ3RoID0gMDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy51cGRhdGVDb25maWd1cmF0aW9uKCk7XG5cdFx0dGhpcy5sb2FkKCk7XG5cblx0XHR0aGlzLnJlZ2lzdGVyTGlzdGVuZXJzKCk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyTGlzdGVuZXJzKCk6IHZvaWQge1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4gdGhpcy51cGRhdGVDb25maWd1cmF0aW9uKGUpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5zdG9yYWdlU2VydmljZS5vbldpbGxTYXZlU3RhdGUoZSA9PiB7XG5cdFx0XHRpZiAoZS5yZWFzb24gPT09IFdpbGxTYXZlU3RhdGVSZWFzb24uU0hVVERPV04pIHtcblx0XHRcdFx0Ly8gQ29tbWFuZHMgaGlzdG9yeSBpcyB2ZXJ5IGR5bmFtaWMgYW5kIHNvIHdlIGxpbWl0IGltcGFjdFxuXHRcdFx0XHQvLyBvbiBzdG9yYWdlIHRvIG9ubHkgc2F2ZSBvbiBzaHV0ZG93bi4gVGhpcyBoZWxwcyByZWR1Y2Vcblx0XHRcdFx0Ly8gdGhlIG92ZXJoZWFkIG9mIHN5bmNpbmcgdGhpcyBkYXRhIGFjcm9zcyBtYWNoaW5lcy5cblx0XHRcdFx0dGhpcy5zYXZlU3RhdGUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUNvbmZpZ3VyYXRpb24oZT86IElDb25maWd1cmF0aW9uQ2hhbmdlRXZlbnQpOiB2b2lkIHtcblx0XHRpZiAoZSAmJiAhZS5hZmZlY3RzQ29uZmlndXJhdGlvbignd29ya2JlbmNoLmNvbW1hbmRQYWxldHRlLmhpc3RvcnknKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuY29uZmlndXJlZENvbW1hbmRzSGlzdG9yeUxlbmd0aCA9IENvbW1hbmRzSGlzdG9yeS5nZXRDb25maWd1cmVkQ29tbWFuZEhpc3RvcnlMZW5ndGgodGhpcy5jb25maWd1cmF0aW9uU2VydmljZSk7XG5cblx0XHRpZiAoQ29tbWFuZHNIaXN0b3J5LmNhY2hlICYmIENvbW1hbmRzSGlzdG9yeS5jYWNoZS5saW1pdCAhPT0gdGhpcy5jb25maWd1cmVkQ29tbWFuZHNIaXN0b3J5TGVuZ3RoKSB7XG5cdFx0XHRDb21tYW5kc0hpc3RvcnkuY2FjaGUubGltaXQgPSB0aGlzLmNvbmZpZ3VyZWRDb21tYW5kc0hpc3RvcnlMZW5ndGg7XG5cdFx0XHRDb21tYW5kc0hpc3RvcnkuaGFzQ2hhbmdlcyA9IHRydWU7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBsb2FkKCk6IHZvaWQge1xuXHRcdGNvbnN0IHJhdyA9IHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0KENvbW1hbmRzSGlzdG9yeS5QUkVGX0tFWV9DQUNIRSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUpO1xuXHRcdGxldCBzZXJpYWxpemVkQ2FjaGU6IElTZXJpYWxpemVkQ29tbWFuZEhpc3RvcnkgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKHJhdykge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0c2VyaWFsaXplZENhY2hlID0gSlNPTi5wYXJzZShyYXcpO1xuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGBbQ29tbWFuZHNIaXN0b3J5XSBpbnZhbGlkIGRhdGE6ICR7ZXJyb3J9YCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgY2FjaGUgPSBDb21tYW5kc0hpc3RvcnkuY2FjaGUgPSBuZXcgTFJVQ2FjaGU8c3RyaW5nLCBudW1iZXI+KHRoaXMuY29uZmlndXJlZENvbW1hbmRzSGlzdG9yeUxlbmd0aCwgMSk7XG5cdFx0aWYgKHNlcmlhbGl6ZWRDYWNoZSkge1xuXHRcdFx0bGV0IGVudHJpZXM6IHsga2V5OiBzdHJpbmc7IHZhbHVlOiBudW1iZXIgfVtdO1xuXHRcdFx0aWYgKHNlcmlhbGl6ZWRDYWNoZS51c2VzTFJVKSB7XG5cdFx0XHRcdGVudHJpZXMgPSBzZXJpYWxpemVkQ2FjaGUuZW50cmllcztcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGVudHJpZXMgPSBzZXJpYWxpemVkQ2FjaGUuZW50cmllcy5zb3J0KChhLCBiKSA9PiBhLnZhbHVlIC0gYi52YWx1ZSk7XG5cdFx0XHR9XG5cdFx0XHRlbnRyaWVzLmZvckVhY2goZW50cnkgPT4gY2FjaGUuc2V0KGVudHJ5LmtleSwgZW50cnkudmFsdWUpKTtcblx0XHR9XG5cblx0XHRDb21tYW5kc0hpc3RvcnkuY291bnRlciA9IHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0TnVtYmVyKENvbW1hbmRzSGlzdG9yeS5QUkVGX0tFWV9DT1VOVEVSLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgQ29tbWFuZHNIaXN0b3J5LmNvdW50ZXIpO1xuXHR9XG5cblx0cHVzaChjb21tYW5kSWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdGlmICghQ29tbWFuZHNIaXN0b3J5LmNhY2hlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Q29tbWFuZHNIaXN0b3J5LmNhY2hlLnNldChjb21tYW5kSWQsIENvbW1hbmRzSGlzdG9yeS5jb3VudGVyKyspOyAvLyBzZXQgY291bnRlciB0byBjb21tYW5kXG5cdFx0Q29tbWFuZHNIaXN0b3J5Lmhhc0NoYW5nZXMgPSB0cnVlO1xuXHR9XG5cblx0cGVlayhjb21tYW5kSWQ6IHN0cmluZyk6IG51bWJlciB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIENvbW1hbmRzSGlzdG9yeS5jYWNoZT8ucGVlayhjb21tYW5kSWQpO1xuXHR9XG5cblx0cmVtb3ZlKGNvbW1hbmRJZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0aWYgKCFDb21tYW5kc0hpc3RvcnkuY2FjaGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRDb21tYW5kc0hpc3RvcnkuY2FjaGUuZGVsZXRlKGNvbW1hbmRJZCk7XG5cdFx0Q29tbWFuZHNIaXN0b3J5Lmhhc0NoYW5nZXMgPSB0cnVlO1xuXHR9XG5cblx0cHJpdmF0ZSBzYXZlU3RhdGUoKTogdm9pZCB7XG5cdFx0aWYgKCFDb21tYW5kc0hpc3RvcnkuY2FjaGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoIUNvbW1hbmRzSGlzdG9yeS5oYXNDaGFuZ2VzKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2VyaWFsaXplZENhY2hlOiBJU2VyaWFsaXplZENvbW1hbmRIaXN0b3J5ID0geyB1c2VzTFJVOiB0cnVlLCBlbnRyaWVzOiBbXSB9O1xuXHRcdENvbW1hbmRzSGlzdG9yeS5jYWNoZS5mb3JFYWNoKCh2YWx1ZSwga2V5KSA9PiBzZXJpYWxpemVkQ2FjaGUuZW50cmllcy5wdXNoKHsga2V5LCB2YWx1ZSB9KSk7XG5cblx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlKENvbW1hbmRzSGlzdG9yeS5QUkVGX0tFWV9DQUNIRSwgSlNPTi5zdHJpbmdpZnkoc2VyaWFsaXplZENhY2hlKSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUsIFN0b3JhZ2VUYXJnZXQuVVNFUik7XG5cdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZShDb21tYW5kc0hpc3RvcnkuUFJFRl9LRVlfQ09VTlRFUiwgQ29tbWFuZHNIaXN0b3J5LmNvdW50ZXIsIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBTdG9yYWdlVGFyZ2V0LlVTRVIpO1xuXHRcdENvbW1hbmRzSGlzdG9yeS5oYXNDaGFuZ2VzID0gZmFsc2U7XG5cdH1cblxuXHRzdGF0aWMgZ2V0Q29uZmlndXJlZENvbW1hbmRIaXN0b3J5TGVuZ3RoKGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UpOiBudW1iZXIge1xuXHRcdGNvbnN0IGNvbmZpZyA9IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPElDb21tYW5kc1F1aWNrQWNjZXNzQ29uZmlndXJhdGlvbj4oKTtcblxuXHRcdGNvbnN0IGNvbmZpZ3VyZWRDb21tYW5kSGlzdG9yeUxlbmd0aCA9IGNvbmZpZy53b3JrYmVuY2g/LmNvbW1hbmRQYWxldHRlPy5oaXN0b3J5O1xuXHRcdGlmICh0eXBlb2YgY29uZmlndXJlZENvbW1hbmRIaXN0b3J5TGVuZ3RoID09PSAnbnVtYmVyJykge1xuXHRcdFx0cmV0dXJuIGNvbmZpZ3VyZWRDb21tYW5kSGlzdG9yeUxlbmd0aDtcblx0XHR9XG5cblx0XHRyZXR1cm4gQ29tbWFuZHNIaXN0b3J5LkRFRkFVTFRfQ09NTUFORFNfSElTVE9SWV9MRU5HVEg7XG5cdH1cblxuXHRzdGF0aWMgY2xlYXJIaXN0b3J5KGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsIHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UpOiB2b2lkIHtcblx0XHRjb25zdCBjb21tYW5kSGlzdG9yeUxlbmd0aCA9IENvbW1hbmRzSGlzdG9yeS5nZXRDb25maWd1cmVkQ29tbWFuZEhpc3RvcnlMZW5ndGgoY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdENvbW1hbmRzSGlzdG9yeS5jYWNoZSA9IG5ldyBMUlVDYWNoZTxzdHJpbmcsIG51bWJlcj4oY29tbWFuZEhpc3RvcnlMZW5ndGgpO1xuXHRcdENvbW1hbmRzSGlzdG9yeS5jb3VudGVyID0gMTtcblxuXHRcdENvbW1hbmRzSGlzdG9yeS5oYXNDaGFuZ2VzID0gdHJ1ZTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFPQSxTQUFTLGVBQWU7QUFDeEIsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUywyQkFBMkI7QUFDcEMsU0FBaUIsZ0NBQWdDLGNBQWMsVUFBVTtBQUN6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
