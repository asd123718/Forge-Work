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
import { localize } from "../../../../nls.js";
import { distinct, coalesce } from "../../../../base/common/arrays.js";
import * as strings from "../../../../base/common/strings.js";
import { Language } from "../../../../base/common/platform.js";
import { or, matchesCamelCase, matchesWords, matchesBaseContiguousSubString, matchesContiguousSubString } from "../../../../base/common/filters.js";
import { AriaLabelProvider, UserSettingsLabelProvider, UILabelProvider } from "../../../../base/common/keybindingLabels.js";
import { MenuRegistry } from "../../../../platform/actions/common/actions.js";
import { EditorModel } from "../../../common/editor/editorModel.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { ResolvedKeybindingItem } from "../../../../platform/keybinding/common/resolvedKeybindingItem.js";
import { getAllUnboundCommands } from "../../keybinding/browser/unboundCommands.js";
import { isEmptyObject, isString } from "../../../../base/common/types.js";
import { IExtensionService } from "../../extensions/common/extensions.js";
import { ExtensionIdentifier, ExtensionIdentifierMap } from "../../../../platform/extensions/common/extensions.js";
import { ContextKeyExpr } from "../../../../platform/contextkey/common/contextkey.js";
const KEYBINDING_ENTRY_TEMPLATE_ID = "keybinding.entry.template";
const SOURCE_SYSTEM = localize("default", "System");
const SOURCE_EXTENSION = localize("extension", "Extension");
const SOURCE_USER = localize("user", "User");
function createKeybindingCommandQuery(commandId, when) {
  const whenPart = when ? ` +when:${when}` : "";
  return `@command:${commandId}${whenPart}`;
}
const wordFilter = or(matchesBaseContiguousSubString, matchesWords);
const COMMAND_REGEX = /@command:\s*([^\+]+)/i;
const WHEN_REGEX = /\+when:\s*(.+)/i;
const SOURCE_REGEX = /@source:\s*(user|default|system|extension)/i;
const EXTENSION_REGEX = /@ext:\s*((".+")|([^\s]+))/i;
const KEYBINDING_REGEX = /@keybinding:\s*((\".+\")|(\S+))/i;
let KeybindingsEditorModel = class extends EditorModel {
  constructor(os, keybindingsService, extensionService) {
    super();
    this.keybindingsService = keybindingsService;
    this.extensionService = extensionService;
    this._keybindingItems = [];
    this._keybindingItemsSortedByPrecedence = [];
    this.modifierLabels = {
      ui: UILabelProvider.modifierLabels[os],
      aria: AriaLabelProvider.modifierLabels[os],
      user: UserSettingsLabelProvider.modifierLabels[os]
    };
  }
  fetch(searchValue, sortByPrecedence = false) {
    let keybindingItems = sortByPrecedence ? this._keybindingItemsSortedByPrecedence : this._keybindingItems;
    const commandIdMatches = COMMAND_REGEX.exec(searchValue);
    if (commandIdMatches && commandIdMatches[1]) {
      const command = commandIdMatches[1].trim();
      let filteredKeybindingItems = keybindingItems.filter((k) => k.command === command);
      if (filteredKeybindingItems.length) {
        const whenMatches = WHEN_REGEX.exec(searchValue);
        if (whenMatches && whenMatches[1]) {
          const whenValue = whenMatches[1].trim();
          filteredKeybindingItems = this.filterByWhen(filteredKeybindingItems, command, whenValue);
        }
      }
      return filteredKeybindingItems.map((keybindingItem) => ({ id: KeybindingsEditorModel.getId(keybindingItem), keybindingItem, templateId: KEYBINDING_ENTRY_TEMPLATE_ID }));
    }
    if (SOURCE_REGEX.test(searchValue)) {
      keybindingItems = this.filterBySource(keybindingItems, searchValue);
      searchValue = searchValue.replace(SOURCE_REGEX, "");
    } else {
      const extensionMatches = EXTENSION_REGEX.exec(searchValue);
      if (extensionMatches && (extensionMatches[2] || extensionMatches[3])) {
        const extensionId = extensionMatches[2] ? extensionMatches[2].substring(1, extensionMatches[2].length - 1) : extensionMatches[3];
        keybindingItems = this.filterByExtension(keybindingItems, extensionId);
        searchValue = searchValue.replace(EXTENSION_REGEX, "");
      } else {
        const keybindingMatches = KEYBINDING_REGEX.exec(searchValue);
        if (keybindingMatches && (keybindingMatches[2] || keybindingMatches[3])) {
          searchValue = keybindingMatches[2] || `"${keybindingMatches[3]}"`;
        }
      }
    }
    searchValue = searchValue.trim();
    if (!searchValue) {
      return keybindingItems.map((keybindingItem) => ({ id: KeybindingsEditorModel.getId(keybindingItem), keybindingItem, templateId: KEYBINDING_ENTRY_TEMPLATE_ID }));
    }
    return this.filterByText(keybindingItems, searchValue);
  }
  filterBySource(keybindingItems, searchValue) {
    if (/@source:\s*default/i.test(searchValue) || /@source:\s*system/i.test(searchValue)) {
      return keybindingItems.filter((k) => k.source === SOURCE_SYSTEM);
    }
    if (/@source:\s*user/i.test(searchValue)) {
      return keybindingItems.filter((k) => k.source === SOURCE_USER);
    }
    if (/@source:\s*extension/i.test(searchValue)) {
      return keybindingItems.filter((k) => !isString(k.source) || k.source === SOURCE_EXTENSION);
    }
    return keybindingItems;
  }
  filterByExtension(keybindingItems, extension) {
    extension = extension.toLowerCase().trim();
    return keybindingItems.filter((k) => !isString(k.source) && (ExtensionIdentifier.equals(k.source.identifier, extension) || k.source.displayName?.toLowerCase() === extension.toLowerCase()));
  }
  filterByText(keybindingItems, searchValue) {
    const quoteAtFirstChar = searchValue.charAt(0) === '"';
    const quoteAtLastChar = searchValue.charAt(searchValue.length - 1) === '"';
    const completeMatch = quoteAtFirstChar && quoteAtLastChar;
    if (quoteAtFirstChar) {
      searchValue = searchValue.substring(1);
    }
    if (quoteAtLastChar) {
      searchValue = searchValue.substring(0, searchValue.length - 1);
    }
    searchValue = searchValue.trim();
    const result = [];
    const words = searchValue.split(" ");
    const keybindingWords = this.splitKeybindingWords(words);
    for (const keybindingItem of keybindingItems) {
      const keybindingMatches = new KeybindingItemMatches(this.modifierLabels, keybindingItem, searchValue, words, keybindingWords, completeMatch);
      if (keybindingMatches.commandIdMatches || keybindingMatches.commandLabelMatches || keybindingMatches.commandDefaultLabelMatches || keybindingMatches.sourceMatches || keybindingMatches.whenMatches || keybindingMatches.keybindingMatches || keybindingMatches.extensionIdMatches || keybindingMatches.extensionLabelMatches) {
        result.push({
          id: KeybindingsEditorModel.getId(keybindingItem),
          templateId: KEYBINDING_ENTRY_TEMPLATE_ID,
          commandLabelMatches: keybindingMatches.commandLabelMatches || void 0,
          commandDefaultLabelMatches: keybindingMatches.commandDefaultLabelMatches || void 0,
          keybindingItem,
          keybindingMatches: keybindingMatches.keybindingMatches || void 0,
          commandIdMatches: keybindingMatches.commandIdMatches || void 0,
          sourceMatches: keybindingMatches.sourceMatches || void 0,
          whenMatches: keybindingMatches.whenMatches || void 0,
          extensionIdMatches: keybindingMatches.extensionIdMatches || void 0,
          extensionLabelMatches: keybindingMatches.extensionLabelMatches || void 0
        });
      }
    }
    return result;
  }
  filterByWhen(keybindingItems, command, when) {
    if (keybindingItems.length === 0) {
      return [];
    }
    const keybindingItemsWithWhen = keybindingItems.filter((k) => k.when === when);
    if (keybindingItemsWithWhen.length) {
      return keybindingItemsWithWhen;
    }
    const commandLabel = keybindingItems[0].commandLabel;
    const keybindingItem = new ResolvedKeybindingItem(void 0, command, null, ContextKeyExpr.deserialize(when), false, null, false);
    const actionLabels = /* @__PURE__ */ new Map([[command, commandLabel]]);
    return [KeybindingsEditorModel.toKeybindingEntry(command, keybindingItem, actionLabels, this.getExtensionsMapping())];
  }
  splitKeybindingWords(wordsSeparatedBySpaces) {
    const result = [];
    for (const word of wordsSeparatedBySpaces) {
      result.push(...coalesce(word.split("+")));
    }
    return result;
  }
  async resolve(actionLabels = /* @__PURE__ */ new Map()) {
    const extensions = this.getExtensionsMapping();
    this._keybindingItemsSortedByPrecedence = [];
    const boundCommands = /* @__PURE__ */ new Map();
    for (const keybinding of this.keybindingsService.getKeybindings()) {
      if (keybinding.command) {
        this._keybindingItemsSortedByPrecedence.push(KeybindingsEditorModel.toKeybindingEntry(keybinding.command, keybinding, actionLabels, extensions));
        boundCommands.set(keybinding.command, true);
      }
    }
    const commandsWithDefaultKeybindings = this.keybindingsService.getDefaultKeybindings().map((keybinding) => keybinding.command);
    for (const command of getAllUnboundCommands(boundCommands)) {
      const keybindingItem = new ResolvedKeybindingItem(void 0, command, null, void 0, commandsWithDefaultKeybindings.indexOf(command) === -1, null, false);
      this._keybindingItemsSortedByPrecedence.push(KeybindingsEditorModel.toKeybindingEntry(command, keybindingItem, actionLabels, extensions));
    }
    this._keybindingItemsSortedByPrecedence = distinct(this._keybindingItemsSortedByPrecedence, (keybindingItem) => KeybindingsEditorModel.getId(keybindingItem));
    this._keybindingItems = this._keybindingItemsSortedByPrecedence.slice(0).sort((a, b) => KeybindingsEditorModel.compareKeybindingData(a, b));
    return super.resolve();
  }
  static getId(keybindingItem) {
    return keybindingItem.command + (keybindingItem?.keybinding?.getAriaLabel() ?? "") + keybindingItem.when + (isString(keybindingItem.source) ? keybindingItem.source : keybindingItem.source.identifier.value);
  }
  getExtensionsMapping() {
    const extensions = new ExtensionIdentifierMap();
    for (const extension of this.extensionService.extensions) {
      extensions.set(extension.identifier, extension);
    }
    return extensions;
  }
  static compareKeybindingData(a, b) {
    if (a.keybinding && !b.keybinding) {
      return -1;
    }
    if (b.keybinding && !a.keybinding) {
      return 1;
    }
    if (a.commandLabel && !b.commandLabel) {
      return -1;
    }
    if (b.commandLabel && !a.commandLabel) {
      return 1;
    }
    if (a.commandLabel && b.commandLabel) {
      if (a.commandLabel !== b.commandLabel) {
        return a.commandLabel.localeCompare(b.commandLabel);
      }
    }
    if (a.command === b.command) {
      return a.keybindingItem.isDefault ? 1 : -1;
    }
    return a.command.localeCompare(b.command);
  }
  static toKeybindingEntry(command, keybindingItem, actions, extensions) {
    const menuCommand = MenuRegistry.getCommand(command);
    const editorActionLabel = actions.get(command);
    let source = SOURCE_USER;
    if (keybindingItem.isDefault) {
      const extensionId = keybindingItem.extensionId ?? (keybindingItem.resolvedKeybinding ? void 0 : menuCommand?.source?.id);
      source = extensionId ? extensions.get(extensionId) ?? SOURCE_EXTENSION : SOURCE_SYSTEM;
    }
    return {
      keybinding: keybindingItem.resolvedKeybinding,
      keybindingItem,
      command,
      commandLabel: KeybindingsEditorModel.getCommandLabel(menuCommand, editorActionLabel),
      commandDefaultLabel: KeybindingsEditorModel.getCommandDefaultLabel(menuCommand),
      when: keybindingItem.when ? keybindingItem.when.serialize() : "",
      source
    };
  }
  static getCommandDefaultLabel(menuCommand) {
    if (!Language.isDefaultVariant()) {
      if (menuCommand && menuCommand.title && menuCommand.title.original) {
        const category = menuCommand.category ? menuCommand.category.original : void 0;
        const title = menuCommand.title.original;
        return category ? localize("cat.title", "{0}: {1}", category, title) : title;
      }
    }
    return null;
  }
  static getCommandLabel(menuCommand, editorActionLabel) {
    if (menuCommand) {
      const category = menuCommand.category ? typeof menuCommand.category === "string" ? menuCommand.category : menuCommand.category.value : void 0;
      const title = typeof menuCommand.title === "string" ? menuCommand.title : menuCommand.title.value;
      return category ? localize("cat.title", "{0}: {1}", category, title) : title;
    }
    if (editorActionLabel) {
      return editorActionLabel;
    }
    return "";
  }
};
KeybindingsEditorModel = __decorateClass([
  __decorateParam(1, IKeybindingService),
  __decorateParam(2, IExtensionService)
], KeybindingsEditorModel);
class KeybindingItemMatches {
  constructor(modifierLabels, keybindingItem, searchValue, words, keybindingWords, completeMatch) {
    this.modifierLabels = modifierLabels;
    this.commandIdMatches = null;
    this.commandLabelMatches = null;
    this.commandDefaultLabelMatches = null;
    this.sourceMatches = null;
    this.whenMatches = null;
    this.keybindingMatches = null;
    this.extensionIdMatches = null;
    this.extensionLabelMatches = null;
    if (!completeMatch) {
      this.commandIdMatches = this.matches(searchValue, keybindingItem.command, or(matchesWords, matchesCamelCase), words);
      this.commandLabelMatches = keybindingItem.commandLabel ? this.matches(searchValue, keybindingItem.commandLabel, (word, wordToMatchAgainst) => matchesWords(word, keybindingItem.commandLabel, true), words) : null;
      this.commandDefaultLabelMatches = keybindingItem.commandDefaultLabel ? this.matches(searchValue, keybindingItem.commandDefaultLabel, (word, wordToMatchAgainst) => matchesWords(word, keybindingItem.commandDefaultLabel, true), words) : null;
      this.whenMatches = keybindingItem.when ? this.matches(null, keybindingItem.when, or(matchesWords, matchesCamelCase), words) : null;
      if (isString(keybindingItem.source)) {
        this.sourceMatches = this.matches(searchValue, keybindingItem.source, (word, wordToMatchAgainst) => matchesWords(word, keybindingItem.source, true), words);
      } else {
        this.extensionLabelMatches = keybindingItem.source.displayName ? this.matches(searchValue, keybindingItem.source.displayName, (word, wordToMatchAgainst) => matchesWords(word, keybindingItem.commandLabel, true), words) : null;
      }
    }
    this.keybindingMatches = keybindingItem.keybinding ? this.matchesKeybinding(keybindingItem.keybinding, searchValue, keybindingWords, completeMatch) : null;
  }
  matches(searchValue, wordToMatchAgainst, wordMatchesFilter, words) {
    let matches = searchValue ? wordFilter(searchValue, wordToMatchAgainst) : null;
    if (!matches) {
      matches = this.matchesWords(words, wordToMatchAgainst, wordMatchesFilter);
    }
    if (matches) {
      matches = this.filterAndSort(matches);
    }
    return matches;
  }
  matchesWords(words, wordToMatchAgainst, wordMatchesFilter) {
    let matches = [];
    for (const word of words) {
      const wordMatches = wordMatchesFilter(word, wordToMatchAgainst);
      if (wordMatches) {
        matches = [...matches || [], ...wordMatches];
      } else {
        matches = null;
        break;
      }
    }
    return matches;
  }
  filterAndSort(matches) {
    return distinct(matches, ((a) => a.start + "." + a.end)).filter((match) => !matches.some((m) => !(m.start === match.start && m.end === match.end) && (m.start <= match.start && m.end >= match.end))).sort((a, b) => a.start - b.start);
  }
  matchesKeybinding(keybinding, searchValue, words, completeMatch) {
    const [firstPart, chordPart] = keybinding.getChords();
    const userSettingsLabel = keybinding.getUserSettingsLabel();
    const ariaLabel = keybinding.getAriaLabel();
    const label = keybinding.getLabel();
    if (userSettingsLabel && strings.compareIgnoreCase(searchValue, userSettingsLabel) === 0 || ariaLabel && strings.compareIgnoreCase(searchValue, ariaLabel) === 0 || label && strings.compareIgnoreCase(searchValue, label) === 0) {
      return {
        firstPart: this.createCompleteMatch(firstPart),
        chordPart: this.createCompleteMatch(chordPart)
      };
    }
    const firstPartMatch = {};
    let chordPartMatch = {};
    const matchedWords = [];
    const firstPartMatchedWords = [];
    let chordPartMatchedWords = [];
    let matchFirstPart = true;
    for (let index = 0; index < words.length; index++) {
      const word = words[index];
      let firstPartMatched = false;
      let chordPartMatched = false;
      matchFirstPart = matchFirstPart && !firstPartMatch.keyCode;
      let matchChordPart = !chordPartMatch.keyCode;
      if (matchFirstPart) {
        firstPartMatched = this.matchPart(firstPart, firstPartMatch, word, completeMatch);
        if (firstPartMatch.keyCode) {
          for (const cordPartMatchedWordIndex of chordPartMatchedWords) {
            if (firstPartMatchedWords.indexOf(cordPartMatchedWordIndex) === -1) {
              matchedWords.splice(matchedWords.indexOf(cordPartMatchedWordIndex), 1);
            }
          }
          chordPartMatch = {};
          chordPartMatchedWords = [];
          matchChordPart = false;
        }
      }
      if (matchChordPart) {
        chordPartMatched = this.matchPart(chordPart, chordPartMatch, word, completeMatch);
      }
      if (firstPartMatched) {
        firstPartMatchedWords.push(index);
      }
      if (chordPartMatched) {
        chordPartMatchedWords.push(index);
      }
      if (firstPartMatched || chordPartMatched) {
        matchedWords.push(index);
      }
      matchFirstPart = matchFirstPart && this.isModifier(word);
    }
    if (matchedWords.length !== words.length) {
      return null;
    }
    if (completeMatch) {
      if (!this.isCompleteMatch(firstPart, firstPartMatch)) {
        return null;
      }
      if (!isEmptyObject(chordPartMatch) && !this.isCompleteMatch(chordPart, chordPartMatch)) {
        return null;
      }
    }
    return this.hasAnyMatch(firstPartMatch) || this.hasAnyMatch(chordPartMatch) ? { firstPart: firstPartMatch, chordPart: chordPartMatch } : null;
  }
  matchPart(chord, match, word, completeMatch) {
    let matched = false;
    if (this.matchesMetaModifier(chord, word)) {
      matched = true;
      match.metaKey = true;
    }
    if (this.matchesCtrlModifier(chord, word)) {
      matched = true;
      match.ctrlKey = true;
    }
    if (this.matchesShiftModifier(chord, word)) {
      matched = true;
      match.shiftKey = true;
    }
    if (this.matchesAltModifier(chord, word)) {
      matched = true;
      match.altKey = true;
    }
    if (this.matchesKeyCode(chord, word, completeMatch)) {
      match.keyCode = true;
      matched = true;
    }
    return matched;
  }
  matchesKeyCode(chord, word, completeMatch) {
    if (!chord) {
      return false;
    }
    const ariaLabel = chord.keyAriaLabel || "";
    if (completeMatch || ariaLabel.length === 1 || word.length === 1) {
      if (strings.compareIgnoreCase(ariaLabel, word) === 0) {
        return true;
      }
    } else {
      if (matchesContiguousSubString(word, ariaLabel)) {
        return true;
      }
    }
    return false;
  }
  matchesMetaModifier(chord, word) {
    if (!chord) {
      return false;
    }
    if (!chord.metaKey) {
      return false;
    }
    return this.wordMatchesMetaModifier(word);
  }
  matchesCtrlModifier(chord, word) {
    if (!chord) {
      return false;
    }
    if (!chord.ctrlKey) {
      return false;
    }
    return this.wordMatchesCtrlModifier(word);
  }
  matchesShiftModifier(chord, word) {
    if (!chord) {
      return false;
    }
    if (!chord.shiftKey) {
      return false;
    }
    return this.wordMatchesShiftModifier(word);
  }
  matchesAltModifier(chord, word) {
    if (!chord) {
      return false;
    }
    if (!chord.altKey) {
      return false;
    }
    return this.wordMatchesAltModifier(word);
  }
  hasAnyMatch(keybindingMatch) {
    return !!keybindingMatch.altKey || !!keybindingMatch.ctrlKey || !!keybindingMatch.metaKey || !!keybindingMatch.shiftKey || !!keybindingMatch.keyCode;
  }
  isCompleteMatch(chord, match) {
    if (!chord) {
      return true;
    }
    if (!match.keyCode) {
      return false;
    }
    if (chord.metaKey && !match.metaKey) {
      return false;
    }
    if (chord.altKey && !match.altKey) {
      return false;
    }
    if (chord.ctrlKey && !match.ctrlKey) {
      return false;
    }
    if (chord.shiftKey && !match.shiftKey) {
      return false;
    }
    return true;
  }
  createCompleteMatch(chord) {
    const match = {};
    if (chord) {
      match.keyCode = true;
      if (chord.metaKey) {
        match.metaKey = true;
      }
      if (chord.altKey) {
        match.altKey = true;
      }
      if (chord.ctrlKey) {
        match.ctrlKey = true;
      }
      if (chord.shiftKey) {
        match.shiftKey = true;
      }
    }
    return match;
  }
  isModifier(word) {
    if (this.wordMatchesAltModifier(word)) {
      return true;
    }
    if (this.wordMatchesCtrlModifier(word)) {
      return true;
    }
    if (this.wordMatchesMetaModifier(word)) {
      return true;
    }
    if (this.wordMatchesShiftModifier(word)) {
      return true;
    }
    return false;
  }
  wordMatchesAltModifier(word) {
    if (strings.equalsIgnoreCase(this.modifierLabels.ui.altKey, word)) {
      return true;
    }
    if (strings.equalsIgnoreCase(this.modifierLabels.aria.altKey, word)) {
      return true;
    }
    if (strings.equalsIgnoreCase(this.modifierLabels.user.altKey, word)) {
      return true;
    }
    if (strings.equalsIgnoreCase(localize("option", "option"), word)) {
      return true;
    }
    return false;
  }
  wordMatchesCtrlModifier(word) {
    if (strings.equalsIgnoreCase(this.modifierLabels.ui.ctrlKey, word)) {
      return true;
    }
    if (strings.equalsIgnoreCase(this.modifierLabels.aria.ctrlKey, word)) {
      return true;
    }
    if (strings.equalsIgnoreCase(this.modifierLabels.user.ctrlKey, word)) {
      return true;
    }
    return false;
  }
  wordMatchesMetaModifier(word) {
    if (strings.equalsIgnoreCase(this.modifierLabels.ui.metaKey, word)) {
      return true;
    }
    if (strings.equalsIgnoreCase(this.modifierLabels.aria.metaKey, word)) {
      return true;
    }
    if (strings.equalsIgnoreCase(this.modifierLabels.user.metaKey, word)) {
      return true;
    }
    if (strings.equalsIgnoreCase(localize("meta", "meta"), word)) {
      return true;
    }
    return false;
  }
  wordMatchesShiftModifier(word) {
    if (strings.equalsIgnoreCase(this.modifierLabels.ui.shiftKey, word)) {
      return true;
    }
    if (strings.equalsIgnoreCase(this.modifierLabels.aria.shiftKey, word)) {
      return true;
    }
    if (strings.equalsIgnoreCase(this.modifierLabels.user.shiftKey, word)) {
      return true;
    }
    return false;
  }
}
export {
  KEYBINDING_ENTRY_TEMPLATE_ID,
  KeybindingsEditorModel,
  createKeybindingCommandQuery
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxwcmVmZXJlbmNlc1xcYnJvd3Nlclxca2V5YmluZGluZ3NFZGl0b3JNb2RlbC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IGRpc3RpbmN0LCBjb2FsZXNjZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgKiBhcyBzdHJpbmdzIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0IHsgT3BlcmF0aW5nU3lzdGVtLCBMYW5ndWFnZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IElNYXRjaCwgSUZpbHRlciwgb3IsIG1hdGNoZXNDYW1lbENhc2UsIG1hdGNoZXNXb3JkcywgbWF0Y2hlc0Jhc2VDb250aWd1b3VzU3ViU3RyaW5nLCBtYXRjaGVzQ29udGlndW91c1N1YlN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2ZpbHRlcnMuanMnO1xuaW1wb3J0IHsgUmVzb2x2ZWRLZXliaW5kaW5nLCBSZXNvbHZlZENob3JkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5YmluZGluZ3MuanMnO1xuaW1wb3J0IHsgQXJpYUxhYmVsUHJvdmlkZXIsIFVzZXJTZXR0aW5nc0xhYmVsUHJvdmlkZXIsIFVJTGFiZWxQcm92aWRlciwgTW9kaWZpZXJMYWJlbHMgYXMgTW9kTGFiZWxzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5YmluZGluZ0xhYmVscy5qcyc7XG5pbXBvcnQgeyBNZW51UmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IEVkaXRvck1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvci9lZGl0b3JNb2RlbC5qcyc7XG5pbXBvcnQgeyBJS2V5YmluZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nLmpzJztcbmltcG9ydCB7IFJlc29sdmVkS2V5YmluZGluZ0l0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9yZXNvbHZlZEtleWJpbmRpbmdJdGVtLmpzJztcbmltcG9ydCB7IGdldEFsbFVuYm91bmRDb21tYW5kcyB9IGZyb20gJy4uLy4uL2tleWJpbmRpbmcvYnJvd3Nlci91bmJvdW5kQ29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdJdGVtRW50cnksIEtleWJpbmRpbmdNYXRjaGVzLCBLZXliaW5kaW5nTWF0Y2gsIElLZXliaW5kaW5nSXRlbSB9IGZyb20gJy4uL2NvbW1vbi9wcmVmZXJlbmNlcy5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZEFjdGlvbiwgSUxvY2FsaXplZFN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbi9jb21tb24vYWN0aW9uLmpzJztcbmltcG9ydCB7IGlzRW1wdHlPYmplY3QsIGlzU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbklkZW50aWZpZXIsIEV4dGVuc2lvbklkZW50aWZpZXJNYXAsIElFeHRlbnNpb25EZXNjcmlwdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcblxuZXhwb3J0IGNvbnN0IEtFWUJJTkRJTkdfRU5UUllfVEVNUExBVEVfSUQgPSAna2V5YmluZGluZy5lbnRyeS50ZW1wbGF0ZSc7XG5cbmNvbnN0IFNPVVJDRV9TWVNURU0gPSBsb2NhbGl6ZSgnZGVmYXVsdCcsIFwiU3lzdGVtXCIpO1xuY29uc3QgU09VUkNFX0VYVEVOU0lPTiA9IGxvY2FsaXplKCdleHRlbnNpb24nLCBcIkV4dGVuc2lvblwiKTtcbmNvbnN0IFNPVVJDRV9VU0VSID0gbG9jYWxpemUoJ3VzZXInLCBcIlVzZXJcIik7XG5cbmludGVyZmFjZSBNb2RpZmllckxhYmVscyB7XG5cdHVpOiBNb2RMYWJlbHM7XG5cdGFyaWE6IE1vZExhYmVscztcblx0dXNlcjogTW9kTGFiZWxzO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlS2V5YmluZGluZ0NvbW1hbmRRdWVyeShjb21tYW5kSWQ6IHN0cmluZywgd2hlbj86IHN0cmluZyk6IHN0cmluZyB7XG5cdGNvbnN0IHdoZW5QYXJ0ID0gd2hlbiA/IGAgK3doZW46JHt3aGVufWAgOiAnJztcblx0cmV0dXJuIGBAY29tbWFuZDoke2NvbW1hbmRJZH0ke3doZW5QYXJ0fWA7XG59XG5cbmNvbnN0IHdvcmRGaWx0ZXIgPSBvcihtYXRjaGVzQmFzZUNvbnRpZ3VvdXNTdWJTdHJpbmcsIG1hdGNoZXNXb3Jkcyk7XG5jb25zdCBDT01NQU5EX1JFR0VYID0gL0Bjb21tYW5kOlxccyooW15cXCtdKykvaTtcbmNvbnN0IFdIRU5fUkVHRVggPSAvXFwrd2hlbjpcXHMqKC4rKS9pO1xuY29uc3QgU09VUkNFX1JFR0VYID0gL0Bzb3VyY2U6XFxzKih1c2VyfGRlZmF1bHR8c3lzdGVtfGV4dGVuc2lvbikvaTtcbmNvbnN0IEVYVEVOU0lPTl9SRUdFWCA9IC9AZXh0OlxccyooKFwiLitcIil8KFteXFxzXSspKS9pO1xuY29uc3QgS0VZQklORElOR19SRUdFWCA9IC9Aa2V5YmluZGluZzpcXHMqKChcXFwiLitcXFwiKXwoXFxTKykpL2k7XG5cbmV4cG9ydCBjbGFzcyBLZXliaW5kaW5nc0VkaXRvck1vZGVsIGV4dGVuZHMgRWRpdG9yTW9kZWwge1xuXG5cdHByaXZhdGUgX2tleWJpbmRpbmdJdGVtczogSUtleWJpbmRpbmdJdGVtW107XG5cdHByaXZhdGUgX2tleWJpbmRpbmdJdGVtc1NvcnRlZEJ5UHJlY2VkZW5jZTogSUtleWJpbmRpbmdJdGVtW107XG5cdHByaXZhdGUgbW9kaWZpZXJMYWJlbHM6IE1vZGlmaWVyTGFiZWxzO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdG9zOiBPcGVyYXRpbmdTeXN0ZW0sXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGtleWJpbmRpbmdzU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvblNlcnZpY2U6IElFeHRlbnNpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX2tleWJpbmRpbmdJdGVtcyA9IFtdO1xuXHRcdHRoaXMuX2tleWJpbmRpbmdJdGVtc1NvcnRlZEJ5UHJlY2VkZW5jZSA9IFtdO1xuXHRcdHRoaXMubW9kaWZpZXJMYWJlbHMgPSB7XG5cdFx0XHR1aTogVUlMYWJlbFByb3ZpZGVyLm1vZGlmaWVyTGFiZWxzW29zXSxcblx0XHRcdGFyaWE6IEFyaWFMYWJlbFByb3ZpZGVyLm1vZGlmaWVyTGFiZWxzW29zXSxcblx0XHRcdHVzZXI6IFVzZXJTZXR0aW5nc0xhYmVsUHJvdmlkZXIubW9kaWZpZXJMYWJlbHNbb3NdXG5cdFx0fTtcblx0fVxuXG5cdGZldGNoKHNlYXJjaFZhbHVlOiBzdHJpbmcsIHNvcnRCeVByZWNlZGVuY2U6IGJvb2xlYW4gPSBmYWxzZSk6IElLZXliaW5kaW5nSXRlbUVudHJ5W10ge1xuXHRcdGxldCBrZXliaW5kaW5nSXRlbXMgPSBzb3J0QnlQcmVjZWRlbmNlID8gdGhpcy5fa2V5YmluZGluZ0l0ZW1zU29ydGVkQnlQcmVjZWRlbmNlIDogdGhpcy5fa2V5YmluZGluZ0l0ZW1zO1xuXG5cdFx0Ly8gQGNvbW1hbmQ6Q09NTUFORF9JRFxuXHRcdGNvbnN0IGNvbW1hbmRJZE1hdGNoZXMgPSBDT01NQU5EX1JFR0VYLmV4ZWMoc2VhcmNoVmFsdWUpO1xuXHRcdGlmIChjb21tYW5kSWRNYXRjaGVzICYmIGNvbW1hbmRJZE1hdGNoZXNbMV0pIHtcblx0XHRcdGNvbnN0IGNvbW1hbmQgPSBjb21tYW5kSWRNYXRjaGVzWzFdLnRyaW0oKTtcblx0XHRcdGxldCBmaWx0ZXJlZEtleWJpbmRpbmdJdGVtcyA9IGtleWJpbmRpbmdJdGVtcy5maWx0ZXIoayA9PiBrLmNvbW1hbmQgPT09IGNvbW1hbmQpO1xuXG5cdFx0XHQvLyArd2hlbjpXSEVOX0VYUFJFU1NJT05cblx0XHRcdGlmIChmaWx0ZXJlZEtleWJpbmRpbmdJdGVtcy5sZW5ndGgpIHtcblx0XHRcdFx0Y29uc3Qgd2hlbk1hdGNoZXMgPSBXSEVOX1JFR0VYLmV4ZWMoc2VhcmNoVmFsdWUpO1xuXHRcdFx0XHRpZiAod2hlbk1hdGNoZXMgJiYgd2hlbk1hdGNoZXNbMV0pIHtcblx0XHRcdFx0XHRjb25zdCB3aGVuVmFsdWUgPSB3aGVuTWF0Y2hlc1sxXS50cmltKCk7XG5cdFx0XHRcdFx0ZmlsdGVyZWRLZXliaW5kaW5nSXRlbXMgPSB0aGlzLmZpbHRlckJ5V2hlbihmaWx0ZXJlZEtleWJpbmRpbmdJdGVtcywgY29tbWFuZCwgd2hlblZhbHVlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gZmlsdGVyZWRLZXliaW5kaW5nSXRlbXMubWFwKChrZXliaW5kaW5nSXRlbSk6IElLZXliaW5kaW5nSXRlbUVudHJ5ID0+ICh7IGlkOiBLZXliaW5kaW5nc0VkaXRvck1vZGVsLmdldElkKGtleWJpbmRpbmdJdGVtKSwga2V5YmluZGluZ0l0ZW0sIHRlbXBsYXRlSWQ6IEtFWUJJTkRJTkdfRU5UUllfVEVNUExBVEVfSUQgfSkpO1xuXHRcdH1cblxuXHRcdC8vIEBzb3VyY2U6U09VUkNFXG5cdFx0aWYgKFNPVVJDRV9SRUdFWC50ZXN0KHNlYXJjaFZhbHVlKSkge1xuXHRcdFx0a2V5YmluZGluZ0l0ZW1zID0gdGhpcy5maWx0ZXJCeVNvdXJjZShrZXliaW5kaW5nSXRlbXMsIHNlYXJjaFZhbHVlKTtcblx0XHRcdHNlYXJjaFZhbHVlID0gc2VhcmNoVmFsdWUucmVwbGFjZShTT1VSQ0VfUkVHRVgsICcnKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gQGV4dDpFWFRFTlNJT05fSURcblx0XHRcdGNvbnN0IGV4dGVuc2lvbk1hdGNoZXMgPSBFWFRFTlNJT05fUkVHRVguZXhlYyhzZWFyY2hWYWx1ZSk7XG5cdFx0XHRpZiAoZXh0ZW5zaW9uTWF0Y2hlcyAmJiAoZXh0ZW5zaW9uTWF0Y2hlc1syXSB8fCBleHRlbnNpb25NYXRjaGVzWzNdKSkge1xuXHRcdFx0XHRjb25zdCBleHRlbnNpb25JZCA9IGV4dGVuc2lvbk1hdGNoZXNbMl0gPyBleHRlbnNpb25NYXRjaGVzWzJdLnN1YnN0cmluZygxLCBleHRlbnNpb25NYXRjaGVzWzJdLmxlbmd0aCAtIDEpIDogZXh0ZW5zaW9uTWF0Y2hlc1szXTtcblx0XHRcdFx0a2V5YmluZGluZ0l0ZW1zID0gdGhpcy5maWx0ZXJCeUV4dGVuc2lvbihrZXliaW5kaW5nSXRlbXMsIGV4dGVuc2lvbklkKTtcblx0XHRcdFx0c2VhcmNoVmFsdWUgPSBzZWFyY2hWYWx1ZS5yZXBsYWNlKEVYVEVOU0lPTl9SRUdFWCwgJycpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8gQGtleWJpbmRpbmc6S0VZQklORElOR1xuXHRcdFx0XHRjb25zdCBrZXliaW5kaW5nTWF0Y2hlcyA9IEtFWUJJTkRJTkdfUkVHRVguZXhlYyhzZWFyY2hWYWx1ZSk7XG5cdFx0XHRcdGlmIChrZXliaW5kaW5nTWF0Y2hlcyAmJiAoa2V5YmluZGluZ01hdGNoZXNbMl0gfHwga2V5YmluZGluZ01hdGNoZXNbM10pKSB7XG5cdFx0XHRcdFx0c2VhcmNoVmFsdWUgPSBrZXliaW5kaW5nTWF0Y2hlc1syXSB8fCBgXCIke2tleWJpbmRpbmdNYXRjaGVzWzNdfVwiYDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHNlYXJjaFZhbHVlID0gc2VhcmNoVmFsdWUudHJpbSgpO1xuXHRcdGlmICghc2VhcmNoVmFsdWUpIHtcblx0XHRcdHJldHVybiBrZXliaW5kaW5nSXRlbXMubWFwKChrZXliaW5kaW5nSXRlbSk6IElLZXliaW5kaW5nSXRlbUVudHJ5ID0+ICh7IGlkOiBLZXliaW5kaW5nc0VkaXRvck1vZGVsLmdldElkKGtleWJpbmRpbmdJdGVtKSwga2V5YmluZGluZ0l0ZW0sIHRlbXBsYXRlSWQ6IEtFWUJJTkRJTkdfRU5UUllfVEVNUExBVEVfSUQgfSkpO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLmZpbHRlckJ5VGV4dChrZXliaW5kaW5nSXRlbXMsIHNlYXJjaFZhbHVlKTtcblx0fVxuXG5cdHByaXZhdGUgZmlsdGVyQnlTb3VyY2Uoa2V5YmluZGluZ0l0ZW1zOiBJS2V5YmluZGluZ0l0ZW1bXSwgc2VhcmNoVmFsdWU6IHN0cmluZyk6IElLZXliaW5kaW5nSXRlbVtdIHtcblx0XHRpZiAoL0Bzb3VyY2U6XFxzKmRlZmF1bHQvaS50ZXN0KHNlYXJjaFZhbHVlKSB8fCAvQHNvdXJjZTpcXHMqc3lzdGVtL2kudGVzdChzZWFyY2hWYWx1ZSkpIHtcblx0XHRcdHJldHVybiBrZXliaW5kaW5nSXRlbXMuZmlsdGVyKGsgPT4gay5zb3VyY2UgPT09IFNPVVJDRV9TWVNURU0pO1xuXHRcdH1cblx0XHRpZiAoL0Bzb3VyY2U6XFxzKnVzZXIvaS50ZXN0KHNlYXJjaFZhbHVlKSkge1xuXHRcdFx0cmV0dXJuIGtleWJpbmRpbmdJdGVtcy5maWx0ZXIoayA9PiBrLnNvdXJjZSA9PT0gU09VUkNFX1VTRVIpO1xuXHRcdH1cblx0XHRpZiAoL0Bzb3VyY2U6XFxzKmV4dGVuc2lvbi9pLnRlc3Qoc2VhcmNoVmFsdWUpKSB7XG5cdFx0XHRyZXR1cm4ga2V5YmluZGluZ0l0ZW1zLmZpbHRlcihrID0+ICFpc1N0cmluZyhrLnNvdXJjZSkgfHwgay5zb3VyY2UgPT09IFNPVVJDRV9FWFRFTlNJT04pO1xuXHRcdH1cblx0XHRyZXR1cm4ga2V5YmluZGluZ0l0ZW1zO1xuXHR9XG5cblx0cHJpdmF0ZSBmaWx0ZXJCeUV4dGVuc2lvbihrZXliaW5kaW5nSXRlbXM6IElLZXliaW5kaW5nSXRlbVtdLCBleHRlbnNpb246IHN0cmluZyk6IElLZXliaW5kaW5nSXRlbVtdIHtcblx0XHRleHRlbnNpb24gPSBleHRlbnNpb24udG9Mb3dlckNhc2UoKS50cmltKCk7XG5cdFx0cmV0dXJuIGtleWJpbmRpbmdJdGVtcy5maWx0ZXIoayA9PiAhaXNTdHJpbmcoay5zb3VyY2UpICYmIChFeHRlbnNpb25JZGVudGlmaWVyLmVxdWFscyhrLnNvdXJjZS5pZGVudGlmaWVyLCBleHRlbnNpb24pIHx8IGsuc291cmNlLmRpc3BsYXlOYW1lPy50b0xvd2VyQ2FzZSgpID09PSBleHRlbnNpb24udG9Mb3dlckNhc2UoKSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBmaWx0ZXJCeVRleHQoa2V5YmluZGluZ0l0ZW1zOiBJS2V5YmluZGluZ0l0ZW1bXSwgc2VhcmNoVmFsdWU6IHN0cmluZyk6IElLZXliaW5kaW5nSXRlbUVudHJ5W10ge1xuXHRcdGNvbnN0IHF1b3RlQXRGaXJzdENoYXIgPSBzZWFyY2hWYWx1ZS5jaGFyQXQoMCkgPT09ICdcIic7XG5cdFx0Y29uc3QgcXVvdGVBdExhc3RDaGFyID0gc2VhcmNoVmFsdWUuY2hhckF0KHNlYXJjaFZhbHVlLmxlbmd0aCAtIDEpID09PSAnXCInO1xuXHRcdGNvbnN0IGNvbXBsZXRlTWF0Y2ggPSBxdW90ZUF0Rmlyc3RDaGFyICYmIHF1b3RlQXRMYXN0Q2hhcjtcblx0XHRpZiAocXVvdGVBdEZpcnN0Q2hhcikge1xuXHRcdFx0c2VhcmNoVmFsdWUgPSBzZWFyY2hWYWx1ZS5zdWJzdHJpbmcoMSk7XG5cdFx0fVxuXHRcdGlmIChxdW90ZUF0TGFzdENoYXIpIHtcblx0XHRcdHNlYXJjaFZhbHVlID0gc2VhcmNoVmFsdWUuc3Vic3RyaW5nKDAsIHNlYXJjaFZhbHVlLmxlbmd0aCAtIDEpO1xuXHRcdH1cblx0XHRzZWFyY2hWYWx1ZSA9IHNlYXJjaFZhbHVlLnRyaW0oKTtcblxuXHRcdGNvbnN0IHJlc3VsdDogSUtleWJpbmRpbmdJdGVtRW50cnlbXSA9IFtdO1xuXHRcdGNvbnN0IHdvcmRzID0gc2VhcmNoVmFsdWUuc3BsaXQoJyAnKTtcblx0XHRjb25zdCBrZXliaW5kaW5nV29yZHMgPSB0aGlzLnNwbGl0S2V5YmluZGluZ1dvcmRzKHdvcmRzKTtcblx0XHRmb3IgKGNvbnN0IGtleWJpbmRpbmdJdGVtIG9mIGtleWJpbmRpbmdJdGVtcykge1xuXHRcdFx0Y29uc3Qga2V5YmluZGluZ01hdGNoZXMgPSBuZXcgS2V5YmluZGluZ0l0ZW1NYXRjaGVzKHRoaXMubW9kaWZpZXJMYWJlbHMsIGtleWJpbmRpbmdJdGVtLCBzZWFyY2hWYWx1ZSwgd29yZHMsIGtleWJpbmRpbmdXb3JkcywgY29tcGxldGVNYXRjaCk7XG5cdFx0XHRpZiAoa2V5YmluZGluZ01hdGNoZXMuY29tbWFuZElkTWF0Y2hlc1xuXHRcdFx0XHR8fCBrZXliaW5kaW5nTWF0Y2hlcy5jb21tYW5kTGFiZWxNYXRjaGVzXG5cdFx0XHRcdHx8IGtleWJpbmRpbmdNYXRjaGVzLmNvbW1hbmREZWZhdWx0TGFiZWxNYXRjaGVzXG5cdFx0XHRcdHx8IGtleWJpbmRpbmdNYXRjaGVzLnNvdXJjZU1hdGNoZXNcblx0XHRcdFx0fHwga2V5YmluZGluZ01hdGNoZXMud2hlbk1hdGNoZXNcblx0XHRcdFx0fHwga2V5YmluZGluZ01hdGNoZXMua2V5YmluZGluZ01hdGNoZXNcblx0XHRcdFx0fHwga2V5YmluZGluZ01hdGNoZXMuZXh0ZW5zaW9uSWRNYXRjaGVzXG5cdFx0XHRcdHx8IGtleWJpbmRpbmdNYXRjaGVzLmV4dGVuc2lvbkxhYmVsTWF0Y2hlc1xuXHRcdFx0KSB7XG5cdFx0XHRcdHJlc3VsdC5wdXNoKHtcblx0XHRcdFx0XHRpZDogS2V5YmluZGluZ3NFZGl0b3JNb2RlbC5nZXRJZChrZXliaW5kaW5nSXRlbSksXG5cdFx0XHRcdFx0dGVtcGxhdGVJZDogS0VZQklORElOR19FTlRSWV9URU1QTEFURV9JRCxcblx0XHRcdFx0XHRjb21tYW5kTGFiZWxNYXRjaGVzOiBrZXliaW5kaW5nTWF0Y2hlcy5jb21tYW5kTGFiZWxNYXRjaGVzIHx8IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRjb21tYW5kRGVmYXVsdExhYmVsTWF0Y2hlczoga2V5YmluZGluZ01hdGNoZXMuY29tbWFuZERlZmF1bHRMYWJlbE1hdGNoZXMgfHwgdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGtleWJpbmRpbmdJdGVtLFxuXHRcdFx0XHRcdGtleWJpbmRpbmdNYXRjaGVzOiBrZXliaW5kaW5nTWF0Y2hlcy5rZXliaW5kaW5nTWF0Y2hlcyB8fCB1bmRlZmluZWQsXG5cdFx0XHRcdFx0Y29tbWFuZElkTWF0Y2hlczoga2V5YmluZGluZ01hdGNoZXMuY29tbWFuZElkTWF0Y2hlcyB8fCB1bmRlZmluZWQsXG5cdFx0XHRcdFx0c291cmNlTWF0Y2hlczoga2V5YmluZGluZ01hdGNoZXMuc291cmNlTWF0Y2hlcyB8fCB1bmRlZmluZWQsXG5cdFx0XHRcdFx0d2hlbk1hdGNoZXM6IGtleWJpbmRpbmdNYXRjaGVzLndoZW5NYXRjaGVzIHx8IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRleHRlbnNpb25JZE1hdGNoZXM6IGtleWJpbmRpbmdNYXRjaGVzLmV4dGVuc2lvbklkTWF0Y2hlcyB8fCB1bmRlZmluZWQsXG5cdFx0XHRcdFx0ZXh0ZW5zaW9uTGFiZWxNYXRjaGVzOiBrZXliaW5kaW5nTWF0Y2hlcy5leHRlbnNpb25MYWJlbE1hdGNoZXMgfHwgdW5kZWZpbmVkXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSBmaWx0ZXJCeVdoZW4oa2V5YmluZGluZ0l0ZW1zOiBJS2V5YmluZGluZ0l0ZW1bXSwgY29tbWFuZDogc3RyaW5nLCB3aGVuOiBzdHJpbmcpOiBJS2V5YmluZGluZ0l0ZW1bXSB7XG5cdFx0aWYgKGtleWJpbmRpbmdJdGVtcy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHQvLyBDaGVjayBpZiBhIGtleWJpbmRpbmcgd2l0aCB0aGUgc2FtZSBjb21tYW5kIGlkIGFuZCB3aGVuIGNsYXVzZSBleGlzdHNcblx0XHRjb25zdCBrZXliaW5kaW5nSXRlbXNXaXRoV2hlbiA9IGtleWJpbmRpbmdJdGVtcy5maWx0ZXIoayA9PiBrLndoZW4gPT09IHdoZW4pO1xuXHRcdGlmIChrZXliaW5kaW5nSXRlbXNXaXRoV2hlbi5sZW5ndGgpIHtcblx0XHRcdHJldHVybiBrZXliaW5kaW5nSXRlbXNXaXRoV2hlbjtcblx0XHR9XG5cblx0XHQvLyBDcmVhdGUgYSBuZXcgZW50cnkgd2l0aCB0aGUgd2hlbiBjbGF1c2Ugd2hpY2ggZG9lcyBub3QgbGl2ZSBpbiB0aGUgbW9kZWxcblx0XHQvLyBXZSBjYW4gcmV1c2Ugc29tZSBvZiB0aGUgcHJvcGVydGllcyBmcm9tIHRoZSBzYW1lIGNvbW1hbmQgd2l0aCBkaWZmZXJlbnQgd2hlbiBjbGF1c2Vcblx0XHRjb25zdCBjb21tYW5kTGFiZWwgPSBrZXliaW5kaW5nSXRlbXNbMF0uY29tbWFuZExhYmVsO1xuXG5cdFx0Y29uc3Qga2V5YmluZGluZ0l0ZW0gPSBuZXcgUmVzb2x2ZWRLZXliaW5kaW5nSXRlbSh1bmRlZmluZWQsIGNvbW1hbmQsIG51bGwsIENvbnRleHRLZXlFeHByLmRlc2VyaWFsaXplKHdoZW4pLCBmYWxzZSwgbnVsbCwgZmFsc2UpO1xuXHRcdGNvbnN0IGFjdGlvbkxhYmVscyA9IG5ldyBNYXAoW1tjb21tYW5kLCBjb21tYW5kTGFiZWxdXSk7XG5cdFx0cmV0dXJuIFtLZXliaW5kaW5nc0VkaXRvck1vZGVsLnRvS2V5YmluZGluZ0VudHJ5KGNvbW1hbmQsIGtleWJpbmRpbmdJdGVtLCBhY3Rpb25MYWJlbHMsIHRoaXMuZ2V0RXh0ZW5zaW9uc01hcHBpbmcoKSldO1xuXHR9XG5cblx0cHJpdmF0ZSBzcGxpdEtleWJpbmRpbmdXb3Jkcyh3b3Jkc1NlcGFyYXRlZEJ5U3BhY2VzOiBzdHJpbmdbXSk6IHN0cmluZ1tdIHtcblx0XHRjb25zdCByZXN1bHQ6IHN0cmluZ1tdID0gW107XG5cdFx0Zm9yIChjb25zdCB3b3JkIG9mIHdvcmRzU2VwYXJhdGVkQnlTcGFjZXMpIHtcblx0XHRcdHJlc3VsdC5wdXNoKC4uLmNvYWxlc2NlKHdvcmQuc3BsaXQoJysnKSkpO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcmVzb2x2ZShhY3Rpb25MYWJlbHMgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nPigpKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZXh0ZW5zaW9ucyA9IHRoaXMuZ2V0RXh0ZW5zaW9uc01hcHBpbmcoKTtcblxuXHRcdHRoaXMuX2tleWJpbmRpbmdJdGVtc1NvcnRlZEJ5UHJlY2VkZW5jZSA9IFtdO1xuXHRcdGNvbnN0IGJvdW5kQ29tbWFuZHM6IE1hcDxzdHJpbmcsIGJvb2xlYW4+ID0gbmV3IE1hcDxzdHJpbmcsIGJvb2xlYW4+KCk7XG5cdFx0Zm9yIChjb25zdCBrZXliaW5kaW5nIG9mIHRoaXMua2V5YmluZGluZ3NTZXJ2aWNlLmdldEtleWJpbmRpbmdzKCkpIHtcblx0XHRcdGlmIChrZXliaW5kaW5nLmNvbW1hbmQpIHsgLy8gU2tpcCBrZXliaW5kaW5ncyB3aXRob3V0IGNvbW1hbmRzXG5cdFx0XHRcdHRoaXMuX2tleWJpbmRpbmdJdGVtc1NvcnRlZEJ5UHJlY2VkZW5jZS5wdXNoKEtleWJpbmRpbmdzRWRpdG9yTW9kZWwudG9LZXliaW5kaW5nRW50cnkoa2V5YmluZGluZy5jb21tYW5kLCBrZXliaW5kaW5nLCBhY3Rpb25MYWJlbHMsIGV4dGVuc2lvbnMpKTtcblx0XHRcdFx0Ym91bmRDb21tYW5kcy5zZXQoa2V5YmluZGluZy5jb21tYW5kLCB0cnVlKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBjb21tYW5kc1dpdGhEZWZhdWx0S2V5YmluZGluZ3MgPSB0aGlzLmtleWJpbmRpbmdzU2VydmljZS5nZXREZWZhdWx0S2V5YmluZGluZ3MoKS5tYXAoa2V5YmluZGluZyA9PiBrZXliaW5kaW5nLmNvbW1hbmQpO1xuXHRcdGZvciAoY29uc3QgY29tbWFuZCBvZiBnZXRBbGxVbmJvdW5kQ29tbWFuZHMoYm91bmRDb21tYW5kcykpIHtcblx0XHRcdGNvbnN0IGtleWJpbmRpbmdJdGVtID0gbmV3IFJlc29sdmVkS2V5YmluZGluZ0l0ZW0odW5kZWZpbmVkLCBjb21tYW5kLCBudWxsLCB1bmRlZmluZWQsIGNvbW1hbmRzV2l0aERlZmF1bHRLZXliaW5kaW5ncy5pbmRleE9mKGNvbW1hbmQpID09PSAtMSwgbnVsbCwgZmFsc2UpO1xuXHRcdFx0dGhpcy5fa2V5YmluZGluZ0l0ZW1zU29ydGVkQnlQcmVjZWRlbmNlLnB1c2goS2V5YmluZGluZ3NFZGl0b3JNb2RlbC50b0tleWJpbmRpbmdFbnRyeShjb21tYW5kLCBrZXliaW5kaW5nSXRlbSwgYWN0aW9uTGFiZWxzLCBleHRlbnNpb25zKSk7XG5cdFx0fVxuXHRcdHRoaXMuX2tleWJpbmRpbmdJdGVtc1NvcnRlZEJ5UHJlY2VkZW5jZSA9IGRpc3RpbmN0KHRoaXMuX2tleWJpbmRpbmdJdGVtc1NvcnRlZEJ5UHJlY2VkZW5jZSwga2V5YmluZGluZ0l0ZW0gPT4gS2V5YmluZGluZ3NFZGl0b3JNb2RlbC5nZXRJZChrZXliaW5kaW5nSXRlbSkpO1xuXHRcdHRoaXMuX2tleWJpbmRpbmdJdGVtcyA9IHRoaXMuX2tleWJpbmRpbmdJdGVtc1NvcnRlZEJ5UHJlY2VkZW5jZS5zbGljZSgwKS5zb3J0KChhLCBiKSA9PiBLZXliaW5kaW5nc0VkaXRvck1vZGVsLmNvbXBhcmVLZXliaW5kaW5nRGF0YShhLCBiKSk7XG5cblx0XHRyZXR1cm4gc3VwZXIucmVzb2x2ZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgZ2V0SWQoa2V5YmluZGluZ0l0ZW06IElLZXliaW5kaW5nSXRlbSk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGtleWJpbmRpbmdJdGVtLmNvbW1hbmQgKyAoa2V5YmluZGluZ0l0ZW0/LmtleWJpbmRpbmc/LmdldEFyaWFMYWJlbCgpID8/ICcnKSArIGtleWJpbmRpbmdJdGVtLndoZW4gKyAoaXNTdHJpbmcoa2V5YmluZGluZ0l0ZW0uc291cmNlKSA/IGtleWJpbmRpbmdJdGVtLnNvdXJjZSA6IGtleWJpbmRpbmdJdGVtLnNvdXJjZS5pZGVudGlmaWVyLnZhbHVlKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0RXh0ZW5zaW9uc01hcHBpbmcoKTogRXh0ZW5zaW9uSWRlbnRpZmllck1hcDxJRXh0ZW5zaW9uRGVzY3JpcHRpb24+IHtcblx0XHRjb25zdCBleHRlbnNpb25zID0gbmV3IEV4dGVuc2lvbklkZW50aWZpZXJNYXA8SUV4dGVuc2lvbkRlc2NyaXB0aW9uPigpO1xuXHRcdGZvciAoY29uc3QgZXh0ZW5zaW9uIG9mIHRoaXMuZXh0ZW5zaW9uU2VydmljZS5leHRlbnNpb25zKSB7XG5cdFx0XHRleHRlbnNpb25zLnNldChleHRlbnNpb24uaWRlbnRpZmllciwgZXh0ZW5zaW9uKTtcblx0XHR9XG5cdFx0cmV0dXJuIGV4dGVuc2lvbnM7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBjb21wYXJlS2V5YmluZGluZ0RhdGEoYTogSUtleWJpbmRpbmdJdGVtLCBiOiBJS2V5YmluZGluZ0l0ZW0pOiBudW1iZXIge1xuXHRcdGlmIChhLmtleWJpbmRpbmcgJiYgIWIua2V5YmluZGluZykge1xuXHRcdFx0cmV0dXJuIC0xO1xuXHRcdH1cblx0XHRpZiAoYi5rZXliaW5kaW5nICYmICFhLmtleWJpbmRpbmcpIHtcblx0XHRcdHJldHVybiAxO1xuXHRcdH1cblx0XHRpZiAoYS5jb21tYW5kTGFiZWwgJiYgIWIuY29tbWFuZExhYmVsKSB7XG5cdFx0XHRyZXR1cm4gLTE7XG5cdFx0fVxuXHRcdGlmIChiLmNvbW1hbmRMYWJlbCAmJiAhYS5jb21tYW5kTGFiZWwpIHtcblx0XHRcdHJldHVybiAxO1xuXHRcdH1cblx0XHRpZiAoYS5jb21tYW5kTGFiZWwgJiYgYi5jb21tYW5kTGFiZWwpIHtcblx0XHRcdGlmIChhLmNvbW1hbmRMYWJlbCAhPT0gYi5jb21tYW5kTGFiZWwpIHtcblx0XHRcdFx0cmV0dXJuIGEuY29tbWFuZExhYmVsLmxvY2FsZUNvbXBhcmUoYi5jb21tYW5kTGFiZWwpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAoYS5jb21tYW5kID09PSBiLmNvbW1hbmQpIHtcblx0XHRcdHJldHVybiBhLmtleWJpbmRpbmdJdGVtLmlzRGVmYXVsdCA/IDEgOiAtMTtcblx0XHR9XG5cdFx0cmV0dXJuIGEuY29tbWFuZC5sb2NhbGVDb21wYXJlKGIuY29tbWFuZCk7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyB0b0tleWJpbmRpbmdFbnRyeShjb21tYW5kOiBzdHJpbmcsIGtleWJpbmRpbmdJdGVtOiBSZXNvbHZlZEtleWJpbmRpbmdJdGVtLCBhY3Rpb25zOiBNYXA8c3RyaW5nLCBzdHJpbmc+LCBleHRlbnNpb25zOiBFeHRlbnNpb25JZGVudGlmaWVyTWFwPElFeHRlbnNpb25EZXNjcmlwdGlvbj4pOiBJS2V5YmluZGluZ0l0ZW0ge1xuXHRcdGNvbnN0IG1lbnVDb21tYW5kID0gTWVudVJlZ2lzdHJ5LmdldENvbW1hbmQoY29tbWFuZCk7XG5cdFx0Y29uc3QgZWRpdG9yQWN0aW9uTGFiZWwgPSBhY3Rpb25zLmdldChjb21tYW5kKTtcblx0XHRsZXQgc291cmNlOiBzdHJpbmcgfCBJRXh0ZW5zaW9uRGVzY3JpcHRpb24gPSBTT1VSQ0VfVVNFUjtcblx0XHRpZiAoa2V5YmluZGluZ0l0ZW0uaXNEZWZhdWx0KSB7XG5cdFx0XHRjb25zdCBleHRlbnNpb25JZCA9IGtleWJpbmRpbmdJdGVtLmV4dGVuc2lvbklkID8/IChrZXliaW5kaW5nSXRlbS5yZXNvbHZlZEtleWJpbmRpbmcgPyB1bmRlZmluZWQgOiBtZW51Q29tbWFuZD8uc291cmNlPy5pZCk7XG5cdFx0XHRzb3VyY2UgPSBleHRlbnNpb25JZCA/IGV4dGVuc2lvbnMuZ2V0KGV4dGVuc2lvbklkKSA/PyBTT1VSQ0VfRVhURU5TSU9OIDogU09VUkNFX1NZU1RFTTtcblx0XHR9XG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tZGFuZ2Vyb3VzLXR5cGUtYXNzZXJ0aW9uc1xuXHRcdHJldHVybiA8SUtleWJpbmRpbmdJdGVtPntcblx0XHRcdGtleWJpbmRpbmc6IGtleWJpbmRpbmdJdGVtLnJlc29sdmVkS2V5YmluZGluZyxcblx0XHRcdGtleWJpbmRpbmdJdGVtLFxuXHRcdFx0Y29tbWFuZCxcblx0XHRcdGNvbW1hbmRMYWJlbDogS2V5YmluZGluZ3NFZGl0b3JNb2RlbC5nZXRDb21tYW5kTGFiZWwobWVudUNvbW1hbmQsIGVkaXRvckFjdGlvbkxhYmVsKSxcblx0XHRcdGNvbW1hbmREZWZhdWx0TGFiZWw6IEtleWJpbmRpbmdzRWRpdG9yTW9kZWwuZ2V0Q29tbWFuZERlZmF1bHRMYWJlbChtZW51Q29tbWFuZCksXG5cdFx0XHR3aGVuOiBrZXliaW5kaW5nSXRlbS53aGVuID8ga2V5YmluZGluZ0l0ZW0ud2hlbi5zZXJpYWxpemUoKSA6ICcnLFxuXHRcdFx0c291cmNlXG5cblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgZ2V0Q29tbWFuZERlZmF1bHRMYWJlbChtZW51Q29tbWFuZDogSUNvbW1hbmRBY3Rpb24gfCB1bmRlZmluZWQpOiBzdHJpbmcgfCBudWxsIHtcblx0XHRpZiAoIUxhbmd1YWdlLmlzRGVmYXVsdFZhcmlhbnQoKSkge1xuXHRcdFx0aWYgKG1lbnVDb21tYW5kICYmIG1lbnVDb21tYW5kLnRpdGxlICYmICg8SUxvY2FsaXplZFN0cmluZz5tZW51Q29tbWFuZC50aXRsZSkub3JpZ2luYWwpIHtcblx0XHRcdFx0Y29uc3QgY2F0ZWdvcnk6IHN0cmluZyB8IHVuZGVmaW5lZCA9IG1lbnVDb21tYW5kLmNhdGVnb3J5ID8gKDxJTG9jYWxpemVkU3RyaW5nPm1lbnVDb21tYW5kLmNhdGVnb3J5KS5vcmlnaW5hbCA6IHVuZGVmaW5lZDtcblx0XHRcdFx0Y29uc3QgdGl0bGUgPSAoPElMb2NhbGl6ZWRTdHJpbmc+bWVudUNvbW1hbmQudGl0bGUpLm9yaWdpbmFsO1xuXHRcdFx0XHRyZXR1cm4gY2F0ZWdvcnkgPyBsb2NhbGl6ZSgnY2F0LnRpdGxlJywgXCJ7MH06IHsxfVwiLCBjYXRlZ29yeSwgdGl0bGUpIDogdGl0bGU7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgZ2V0Q29tbWFuZExhYmVsKG1lbnVDb21tYW5kOiBJQ29tbWFuZEFjdGlvbiB8IHVuZGVmaW5lZCwgZWRpdG9yQWN0aW9uTGFiZWw6IHN0cmluZyB8IHVuZGVmaW5lZCk6IHN0cmluZyB7XG5cdFx0aWYgKG1lbnVDb21tYW5kKSB7XG5cdFx0XHRjb25zdCBjYXRlZ29yeTogc3RyaW5nIHwgdW5kZWZpbmVkID0gbWVudUNvbW1hbmQuY2F0ZWdvcnkgPyB0eXBlb2YgbWVudUNvbW1hbmQuY2F0ZWdvcnkgPT09ICdzdHJpbmcnID8gbWVudUNvbW1hbmQuY2F0ZWdvcnkgOiBtZW51Q29tbWFuZC5jYXRlZ29yeS52YWx1ZSA6IHVuZGVmaW5lZDtcblx0XHRcdGNvbnN0IHRpdGxlID0gdHlwZW9mIG1lbnVDb21tYW5kLnRpdGxlID09PSAnc3RyaW5nJyA/IG1lbnVDb21tYW5kLnRpdGxlIDogbWVudUNvbW1hbmQudGl0bGUudmFsdWU7XG5cdFx0XHRyZXR1cm4gY2F0ZWdvcnkgPyBsb2NhbGl6ZSgnY2F0LnRpdGxlJywgXCJ7MH06IHsxfVwiLCBjYXRlZ29yeSwgdGl0bGUpIDogdGl0bGU7XG5cdFx0fVxuXG5cdFx0aWYgKGVkaXRvckFjdGlvbkxhYmVsKSB7XG5cdFx0XHRyZXR1cm4gZWRpdG9yQWN0aW9uTGFiZWw7XG5cdFx0fVxuXG5cdFx0cmV0dXJuICcnO1xuXHR9XG59XG5cbmNsYXNzIEtleWJpbmRpbmdJdGVtTWF0Y2hlcyB7XG5cblx0cmVhZG9ubHkgY29tbWFuZElkTWF0Y2hlczogSU1hdGNoW10gfCBudWxsID0gbnVsbDtcblx0cmVhZG9ubHkgY29tbWFuZExhYmVsTWF0Y2hlczogSU1hdGNoW10gfCBudWxsID0gbnVsbDtcblx0cmVhZG9ubHkgY29tbWFuZERlZmF1bHRMYWJlbE1hdGNoZXM6IElNYXRjaFtdIHwgbnVsbCA9IG51bGw7XG5cdHJlYWRvbmx5IHNvdXJjZU1hdGNoZXM6IElNYXRjaFtdIHwgbnVsbCA9IG51bGw7XG5cdHJlYWRvbmx5IHdoZW5NYXRjaGVzOiBJTWF0Y2hbXSB8IG51bGwgPSBudWxsO1xuXHRyZWFkb25seSBrZXliaW5kaW5nTWF0Y2hlczogS2V5YmluZGluZ01hdGNoZXMgfCBudWxsID0gbnVsbDtcblx0cmVhZG9ubHkgZXh0ZW5zaW9uSWRNYXRjaGVzOiBJTWF0Y2hbXSB8IG51bGwgPSBudWxsO1xuXHRyZWFkb25seSBleHRlbnNpb25MYWJlbE1hdGNoZXM6IElNYXRjaFtdIHwgbnVsbCA9IG51bGw7XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSBtb2RpZmllckxhYmVsczogTW9kaWZpZXJMYWJlbHMsIGtleWJpbmRpbmdJdGVtOiBJS2V5YmluZGluZ0l0ZW0sIHNlYXJjaFZhbHVlOiBzdHJpbmcsIHdvcmRzOiBzdHJpbmdbXSwga2V5YmluZGluZ1dvcmRzOiBzdHJpbmdbXSwgY29tcGxldGVNYXRjaDogYm9vbGVhbikge1xuXHRcdGlmICghY29tcGxldGVNYXRjaCkge1xuXHRcdFx0dGhpcy5jb21tYW5kSWRNYXRjaGVzID0gdGhpcy5tYXRjaGVzKHNlYXJjaFZhbHVlLCBrZXliaW5kaW5nSXRlbS5jb21tYW5kLCBvcihtYXRjaGVzV29yZHMsIG1hdGNoZXNDYW1lbENhc2UpLCB3b3Jkcyk7XG5cdFx0XHR0aGlzLmNvbW1hbmRMYWJlbE1hdGNoZXMgPSBrZXliaW5kaW5nSXRlbS5jb21tYW5kTGFiZWwgPyB0aGlzLm1hdGNoZXMoc2VhcmNoVmFsdWUsIGtleWJpbmRpbmdJdGVtLmNvbW1hbmRMYWJlbCwgKHdvcmQsIHdvcmRUb01hdGNoQWdhaW5zdCkgPT4gbWF0Y2hlc1dvcmRzKHdvcmQsIGtleWJpbmRpbmdJdGVtLmNvbW1hbmRMYWJlbCwgdHJ1ZSksIHdvcmRzKSA6IG51bGw7XG5cdFx0XHR0aGlzLmNvbW1hbmREZWZhdWx0TGFiZWxNYXRjaGVzID0ga2V5YmluZGluZ0l0ZW0uY29tbWFuZERlZmF1bHRMYWJlbCA/IHRoaXMubWF0Y2hlcyhzZWFyY2hWYWx1ZSwga2V5YmluZGluZ0l0ZW0uY29tbWFuZERlZmF1bHRMYWJlbCwgKHdvcmQsIHdvcmRUb01hdGNoQWdhaW5zdCkgPT4gbWF0Y2hlc1dvcmRzKHdvcmQsIGtleWJpbmRpbmdJdGVtLmNvbW1hbmREZWZhdWx0TGFiZWwsIHRydWUpLCB3b3JkcykgOiBudWxsO1xuXHRcdFx0dGhpcy53aGVuTWF0Y2hlcyA9IGtleWJpbmRpbmdJdGVtLndoZW4gPyB0aGlzLm1hdGNoZXMobnVsbCwga2V5YmluZGluZ0l0ZW0ud2hlbiwgb3IobWF0Y2hlc1dvcmRzLCBtYXRjaGVzQ2FtZWxDYXNlKSwgd29yZHMpIDogbnVsbDtcblx0XHRcdGlmIChpc1N0cmluZyhrZXliaW5kaW5nSXRlbS5zb3VyY2UpKSB7XG5cdFx0XHRcdHRoaXMuc291cmNlTWF0Y2hlcyA9IHRoaXMubWF0Y2hlcyhzZWFyY2hWYWx1ZSwga2V5YmluZGluZ0l0ZW0uc291cmNlLCAod29yZCwgd29yZFRvTWF0Y2hBZ2FpbnN0KSA9PiBtYXRjaGVzV29yZHMod29yZCwga2V5YmluZGluZ0l0ZW0uc291cmNlIGFzIHN0cmluZywgdHJ1ZSksIHdvcmRzKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuZXh0ZW5zaW9uTGFiZWxNYXRjaGVzID0ga2V5YmluZGluZ0l0ZW0uc291cmNlLmRpc3BsYXlOYW1lID8gdGhpcy5tYXRjaGVzKHNlYXJjaFZhbHVlLCBrZXliaW5kaW5nSXRlbS5zb3VyY2UuZGlzcGxheU5hbWUsICh3b3JkLCB3b3JkVG9NYXRjaEFnYWluc3QpID0+IG1hdGNoZXNXb3Jkcyh3b3JkLCBrZXliaW5kaW5nSXRlbS5jb21tYW5kTGFiZWwsIHRydWUpLCB3b3JkcykgOiBudWxsO1xuXHRcdFx0fVxuXHRcdH1cblx0XHR0aGlzLmtleWJpbmRpbmdNYXRjaGVzID0ga2V5YmluZGluZ0l0ZW0ua2V5YmluZGluZyA/IHRoaXMubWF0Y2hlc0tleWJpbmRpbmcoa2V5YmluZGluZ0l0ZW0ua2V5YmluZGluZywgc2VhcmNoVmFsdWUsIGtleWJpbmRpbmdXb3JkcywgY29tcGxldGVNYXRjaCkgOiBudWxsO1xuXHR9XG5cblx0cHJpdmF0ZSBtYXRjaGVzKHNlYXJjaFZhbHVlOiBzdHJpbmcgfCBudWxsLCB3b3JkVG9NYXRjaEFnYWluc3Q6IHN0cmluZywgd29yZE1hdGNoZXNGaWx0ZXI6IElGaWx0ZXIsIHdvcmRzOiBzdHJpbmdbXSk6IElNYXRjaFtdIHwgbnVsbCB7XG5cdFx0bGV0IG1hdGNoZXMgPSBzZWFyY2hWYWx1ZSA/IHdvcmRGaWx0ZXIoc2VhcmNoVmFsdWUsIHdvcmRUb01hdGNoQWdhaW5zdCkgOiBudWxsO1xuXHRcdGlmICghbWF0Y2hlcykge1xuXHRcdFx0bWF0Y2hlcyA9IHRoaXMubWF0Y2hlc1dvcmRzKHdvcmRzLCB3b3JkVG9NYXRjaEFnYWluc3QsIHdvcmRNYXRjaGVzRmlsdGVyKTtcblx0XHR9XG5cdFx0aWYgKG1hdGNoZXMpIHtcblx0XHRcdG1hdGNoZXMgPSB0aGlzLmZpbHRlckFuZFNvcnQobWF0Y2hlcyk7XG5cdFx0fVxuXHRcdHJldHVybiBtYXRjaGVzO1xuXHR9XG5cblx0cHJpdmF0ZSBtYXRjaGVzV29yZHMod29yZHM6IHN0cmluZ1tdLCB3b3JkVG9NYXRjaEFnYWluc3Q6IHN0cmluZywgd29yZE1hdGNoZXNGaWx0ZXI6IElGaWx0ZXIpOiBJTWF0Y2hbXSB8IG51bGwge1xuXHRcdGxldCBtYXRjaGVzOiBJTWF0Y2hbXSB8IG51bGwgPSBbXTtcblx0XHRmb3IgKGNvbnN0IHdvcmQgb2Ygd29yZHMpIHtcblx0XHRcdGNvbnN0IHdvcmRNYXRjaGVzID0gd29yZE1hdGNoZXNGaWx0ZXIod29yZCwgd29yZFRvTWF0Y2hBZ2FpbnN0KTtcblx0XHRcdGlmICh3b3JkTWF0Y2hlcykge1xuXHRcdFx0XHRtYXRjaGVzID0gWy4uLihtYXRjaGVzIHx8IFtdKSwgLi4ud29yZE1hdGNoZXNdO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0bWF0Y2hlcyA9IG51bGw7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gbWF0Y2hlcztcblx0fVxuXG5cdHByaXZhdGUgZmlsdGVyQW5kU29ydChtYXRjaGVzOiBJTWF0Y2hbXSk6IElNYXRjaFtdIHtcblx0XHRyZXR1cm4gZGlzdGluY3QobWF0Y2hlcywgKGEgPT4gYS5zdGFydCArICcuJyArIGEuZW5kKSkuZmlsdGVyKG1hdGNoID0+ICFtYXRjaGVzLnNvbWUobSA9PiAhKG0uc3RhcnQgPT09IG1hdGNoLnN0YXJ0ICYmIG0uZW5kID09PSBtYXRjaC5lbmQpICYmIChtLnN0YXJ0IDw9IG1hdGNoLnN0YXJ0ICYmIG0uZW5kID49IG1hdGNoLmVuZCkpKS5zb3J0KChhLCBiKSA9PiBhLnN0YXJ0IC0gYi5zdGFydCk7XG5cdH1cblxuXHRwcml2YXRlIG1hdGNoZXNLZXliaW5kaW5nKGtleWJpbmRpbmc6IFJlc29sdmVkS2V5YmluZGluZywgc2VhcmNoVmFsdWU6IHN0cmluZywgd29yZHM6IHN0cmluZ1tdLCBjb21wbGV0ZU1hdGNoOiBib29sZWFuKTogS2V5YmluZGluZ01hdGNoZXMgfCBudWxsIHtcblx0XHRjb25zdCBbZmlyc3RQYXJ0LCBjaG9yZFBhcnRdID0ga2V5YmluZGluZy5nZXRDaG9yZHMoKTtcblxuXHRcdGNvbnN0IHVzZXJTZXR0aW5nc0xhYmVsID0ga2V5YmluZGluZy5nZXRVc2VyU2V0dGluZ3NMYWJlbCgpO1xuXHRcdGNvbnN0IGFyaWFMYWJlbCA9IGtleWJpbmRpbmcuZ2V0QXJpYUxhYmVsKCk7XG5cdFx0Y29uc3QgbGFiZWwgPSBrZXliaW5kaW5nLmdldExhYmVsKCk7XG5cdFx0aWYgKCh1c2VyU2V0dGluZ3NMYWJlbCAmJiBzdHJpbmdzLmNvbXBhcmVJZ25vcmVDYXNlKHNlYXJjaFZhbHVlLCB1c2VyU2V0dGluZ3NMYWJlbCkgPT09IDApXG5cdFx0XHR8fCAoYXJpYUxhYmVsICYmIHN0cmluZ3MuY29tcGFyZUlnbm9yZUNhc2Uoc2VhcmNoVmFsdWUsIGFyaWFMYWJlbCkgPT09IDApXG5cdFx0XHR8fCAobGFiZWwgJiYgc3RyaW5ncy5jb21wYXJlSWdub3JlQ2FzZShzZWFyY2hWYWx1ZSwgbGFiZWwpID09PSAwKSkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0Zmlyc3RQYXJ0OiB0aGlzLmNyZWF0ZUNvbXBsZXRlTWF0Y2goZmlyc3RQYXJ0KSxcblx0XHRcdFx0Y2hvcmRQYXJ0OiB0aGlzLmNyZWF0ZUNvbXBsZXRlTWF0Y2goY2hvcmRQYXJ0KVxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRjb25zdCBmaXJzdFBhcnRNYXRjaDogS2V5YmluZGluZ01hdGNoID0ge307XG5cdFx0bGV0IGNob3JkUGFydE1hdGNoOiBLZXliaW5kaW5nTWF0Y2ggPSB7fTtcblxuXHRcdGNvbnN0IG1hdGNoZWRXb3JkczogbnVtYmVyW10gPSBbXTtcblx0XHRjb25zdCBmaXJzdFBhcnRNYXRjaGVkV29yZHM6IG51bWJlcltdID0gW107XG5cdFx0bGV0IGNob3JkUGFydE1hdGNoZWRXb3JkczogbnVtYmVyW10gPSBbXTtcblx0XHRsZXQgbWF0Y2hGaXJzdFBhcnQgPSB0cnVlO1xuXHRcdGZvciAobGV0IGluZGV4ID0gMDsgaW5kZXggPCB3b3Jkcy5sZW5ndGg7IGluZGV4KyspIHtcblx0XHRcdGNvbnN0IHdvcmQgPSB3b3Jkc1tpbmRleF07XG5cdFx0XHRsZXQgZmlyc3RQYXJ0TWF0Y2hlZCA9IGZhbHNlO1xuXHRcdFx0bGV0IGNob3JkUGFydE1hdGNoZWQgPSBmYWxzZTtcblxuXHRcdFx0bWF0Y2hGaXJzdFBhcnQgPSBtYXRjaEZpcnN0UGFydCAmJiAhZmlyc3RQYXJ0TWF0Y2gua2V5Q29kZTtcblx0XHRcdGxldCBtYXRjaENob3JkUGFydCA9ICFjaG9yZFBhcnRNYXRjaC5rZXlDb2RlO1xuXG5cdFx0XHRpZiAobWF0Y2hGaXJzdFBhcnQpIHtcblx0XHRcdFx0Zmlyc3RQYXJ0TWF0Y2hlZCA9IHRoaXMubWF0Y2hQYXJ0KGZpcnN0UGFydCwgZmlyc3RQYXJ0TWF0Y2gsIHdvcmQsIGNvbXBsZXRlTWF0Y2gpO1xuXHRcdFx0XHRpZiAoZmlyc3RQYXJ0TWF0Y2gua2V5Q29kZSkge1xuXHRcdFx0XHRcdGZvciAoY29uc3QgY29yZFBhcnRNYXRjaGVkV29yZEluZGV4IG9mIGNob3JkUGFydE1hdGNoZWRXb3Jkcykge1xuXHRcdFx0XHRcdFx0aWYgKGZpcnN0UGFydE1hdGNoZWRXb3Jkcy5pbmRleE9mKGNvcmRQYXJ0TWF0Y2hlZFdvcmRJbmRleCkgPT09IC0xKSB7XG5cdFx0XHRcdFx0XHRcdG1hdGNoZWRXb3Jkcy5zcGxpY2UobWF0Y2hlZFdvcmRzLmluZGV4T2YoY29yZFBhcnRNYXRjaGVkV29yZEluZGV4KSwgMSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNob3JkUGFydE1hdGNoID0ge307XG5cdFx0XHRcdFx0Y2hvcmRQYXJ0TWF0Y2hlZFdvcmRzID0gW107XG5cdFx0XHRcdFx0bWF0Y2hDaG9yZFBhcnQgPSBmYWxzZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAobWF0Y2hDaG9yZFBhcnQpIHtcblx0XHRcdFx0Y2hvcmRQYXJ0TWF0Y2hlZCA9IHRoaXMubWF0Y2hQYXJ0KGNob3JkUGFydCwgY2hvcmRQYXJ0TWF0Y2gsIHdvcmQsIGNvbXBsZXRlTWF0Y2gpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoZmlyc3RQYXJ0TWF0Y2hlZCkge1xuXHRcdFx0XHRmaXJzdFBhcnRNYXRjaGVkV29yZHMucHVzaChpbmRleCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoY2hvcmRQYXJ0TWF0Y2hlZCkge1xuXHRcdFx0XHRjaG9yZFBhcnRNYXRjaGVkV29yZHMucHVzaChpbmRleCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoZmlyc3RQYXJ0TWF0Y2hlZCB8fCBjaG9yZFBhcnRNYXRjaGVkKSB7XG5cdFx0XHRcdG1hdGNoZWRXb3Jkcy5wdXNoKGluZGV4KTtcblx0XHRcdH1cblxuXHRcdFx0bWF0Y2hGaXJzdFBhcnQgPSBtYXRjaEZpcnN0UGFydCAmJiB0aGlzLmlzTW9kaWZpZXIod29yZCk7XG5cdFx0fVxuXHRcdGlmIChtYXRjaGVkV29yZHMubGVuZ3RoICE9PSB3b3Jkcy5sZW5ndGgpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblx0XHRpZiAoY29tcGxldGVNYXRjaCkge1xuXHRcdFx0aWYgKCF0aGlzLmlzQ29tcGxldGVNYXRjaChmaXJzdFBhcnQsIGZpcnN0UGFydE1hdGNoKSkge1xuXHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdH1cblx0XHRcdGlmICghaXNFbXB0eU9iamVjdChjaG9yZFBhcnRNYXRjaCkgJiYgIXRoaXMuaXNDb21wbGV0ZU1hdGNoKGNob3JkUGFydCwgY2hvcmRQYXJ0TWF0Y2gpKSB7XG5cdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5oYXNBbnlNYXRjaChmaXJzdFBhcnRNYXRjaCkgfHwgdGhpcy5oYXNBbnlNYXRjaChjaG9yZFBhcnRNYXRjaCkgPyB7IGZpcnN0UGFydDogZmlyc3RQYXJ0TWF0Y2gsIGNob3JkUGFydDogY2hvcmRQYXJ0TWF0Y2ggfSA6IG51bGw7XG5cdH1cblxuXHRwcml2YXRlIG1hdGNoUGFydChjaG9yZDogUmVzb2x2ZWRDaG9yZCB8IG51bGwsIG1hdGNoOiBLZXliaW5kaW5nTWF0Y2gsIHdvcmQ6IHN0cmluZywgY29tcGxldGVNYXRjaDogYm9vbGVhbik6IGJvb2xlYW4ge1xuXHRcdGxldCBtYXRjaGVkID0gZmFsc2U7XG5cdFx0aWYgKHRoaXMubWF0Y2hlc01ldGFNb2RpZmllcihjaG9yZCwgd29yZCkpIHtcblx0XHRcdG1hdGNoZWQgPSB0cnVlO1xuXHRcdFx0bWF0Y2gubWV0YUtleSA9IHRydWU7XG5cdFx0fVxuXHRcdGlmICh0aGlzLm1hdGNoZXNDdHJsTW9kaWZpZXIoY2hvcmQsIHdvcmQpKSB7XG5cdFx0XHRtYXRjaGVkID0gdHJ1ZTtcblx0XHRcdG1hdGNoLmN0cmxLZXkgPSB0cnVlO1xuXHRcdH1cblx0XHRpZiAodGhpcy5tYXRjaGVzU2hpZnRNb2RpZmllcihjaG9yZCwgd29yZCkpIHtcblx0XHRcdG1hdGNoZWQgPSB0cnVlO1xuXHRcdFx0bWF0Y2guc2hpZnRLZXkgPSB0cnVlO1xuXHRcdH1cblx0XHRpZiAodGhpcy5tYXRjaGVzQWx0TW9kaWZpZXIoY2hvcmQsIHdvcmQpKSB7XG5cdFx0XHRtYXRjaGVkID0gdHJ1ZTtcblx0XHRcdG1hdGNoLmFsdEtleSA9IHRydWU7XG5cdFx0fVxuXHRcdGlmICh0aGlzLm1hdGNoZXNLZXlDb2RlKGNob3JkLCB3b3JkLCBjb21wbGV0ZU1hdGNoKSkge1xuXHRcdFx0bWF0Y2gua2V5Q29kZSA9IHRydWU7XG5cdFx0XHRtYXRjaGVkID0gdHJ1ZTtcblx0XHR9XG5cdFx0cmV0dXJuIG1hdGNoZWQ7XG5cdH1cblxuXHRwcml2YXRlIG1hdGNoZXNLZXlDb2RlKGNob3JkOiBSZXNvbHZlZENob3JkIHwgbnVsbCwgd29yZDogc3RyaW5nLCBjb21wbGV0ZU1hdGNoOiBib29sZWFuKTogYm9vbGVhbiB7XG5cdFx0aWYgKCFjaG9yZCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRjb25zdCBhcmlhTGFiZWw6IHN0cmluZyA9IGNob3JkLmtleUFyaWFMYWJlbCB8fCAnJztcblx0XHRpZiAoY29tcGxldGVNYXRjaCB8fCBhcmlhTGFiZWwubGVuZ3RoID09PSAxIHx8IHdvcmQubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRpZiAoc3RyaW5ncy5jb21wYXJlSWdub3JlQ2FzZShhcmlhTGFiZWwsIHdvcmQpID09PSAwKSB7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRpZiAobWF0Y2hlc0NvbnRpZ3VvdXNTdWJTdHJpbmcod29yZCwgYXJpYUxhYmVsKSkge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHJpdmF0ZSBtYXRjaGVzTWV0YU1vZGlmaWVyKGNob3JkOiBSZXNvbHZlZENob3JkIHwgbnVsbCwgd29yZDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0aWYgKCFjaG9yZCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRpZiAoIWNob3JkLm1ldGFLZXkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMud29yZE1hdGNoZXNNZXRhTW9kaWZpZXIod29yZCk7XG5cdH1cblxuXHRwcml2YXRlIG1hdGNoZXNDdHJsTW9kaWZpZXIoY2hvcmQ6IFJlc29sdmVkQ2hvcmQgfCBudWxsLCB3b3JkOiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRpZiAoIWNob3JkKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGlmICghY2hvcmQuY3RybEtleSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy53b3JkTWF0Y2hlc0N0cmxNb2RpZmllcih3b3JkKTtcblx0fVxuXG5cdHByaXZhdGUgbWF0Y2hlc1NoaWZ0TW9kaWZpZXIoY2hvcmQ6IFJlc29sdmVkQ2hvcmQgfCBudWxsLCB3b3JkOiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRpZiAoIWNob3JkKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGlmICghY2hvcmQuc2hpZnRLZXkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMud29yZE1hdGNoZXNTaGlmdE1vZGlmaWVyKHdvcmQpO1xuXHR9XG5cblx0cHJpdmF0ZSBtYXRjaGVzQWx0TW9kaWZpZXIoY2hvcmQ6IFJlc29sdmVkQ2hvcmQgfCBudWxsLCB3b3JkOiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRpZiAoIWNob3JkKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGlmICghY2hvcmQuYWx0S2V5KSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLndvcmRNYXRjaGVzQWx0TW9kaWZpZXIod29yZCk7XG5cdH1cblxuXHRwcml2YXRlIGhhc0FueU1hdGNoKGtleWJpbmRpbmdNYXRjaDogS2V5YmluZGluZ01hdGNoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICEha2V5YmluZGluZ01hdGNoLmFsdEtleSB8fFxuXHRcdFx0ISFrZXliaW5kaW5nTWF0Y2guY3RybEtleSB8fFxuXHRcdFx0ISFrZXliaW5kaW5nTWF0Y2gubWV0YUtleSB8fFxuXHRcdFx0ISFrZXliaW5kaW5nTWF0Y2guc2hpZnRLZXkgfHxcblx0XHRcdCEha2V5YmluZGluZ01hdGNoLmtleUNvZGU7XG5cdH1cblxuXHRwcml2YXRlIGlzQ29tcGxldGVNYXRjaChjaG9yZDogUmVzb2x2ZWRDaG9yZCB8IG51bGwsIG1hdGNoOiBLZXliaW5kaW5nTWF0Y2gpOiBib29sZWFuIHtcblx0XHRpZiAoIWNob3JkKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0aWYgKCFtYXRjaC5rZXlDb2RlKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGlmIChjaG9yZC5tZXRhS2V5ICYmICFtYXRjaC5tZXRhS2V5KSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGlmIChjaG9yZC5hbHRLZXkgJiYgIW1hdGNoLmFsdEtleSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRpZiAoY2hvcmQuY3RybEtleSAmJiAhbWF0Y2guY3RybEtleSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRpZiAoY2hvcmQuc2hpZnRLZXkgJiYgIW1hdGNoLnNoaWZ0S2V5KSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVDb21wbGV0ZU1hdGNoKGNob3JkOiBSZXNvbHZlZENob3JkIHwgbnVsbCk6IEtleWJpbmRpbmdNYXRjaCB7XG5cdFx0Y29uc3QgbWF0Y2g6IEtleWJpbmRpbmdNYXRjaCA9IHt9O1xuXHRcdGlmIChjaG9yZCkge1xuXHRcdFx0bWF0Y2gua2V5Q29kZSA9IHRydWU7XG5cdFx0XHRpZiAoY2hvcmQubWV0YUtleSkge1xuXHRcdFx0XHRtYXRjaC5tZXRhS2V5ID0gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdGlmIChjaG9yZC5hbHRLZXkpIHtcblx0XHRcdFx0bWF0Y2guYWx0S2V5ID0gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdGlmIChjaG9yZC5jdHJsS2V5KSB7XG5cdFx0XHRcdG1hdGNoLmN0cmxLZXkgPSB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGNob3JkLnNoaWZ0S2V5KSB7XG5cdFx0XHRcdG1hdGNoLnNoaWZ0S2V5ID0gdHJ1ZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIG1hdGNoO1xuXHR9XG5cblx0cHJpdmF0ZSBpc01vZGlmaWVyKHdvcmQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLndvcmRNYXRjaGVzQWx0TW9kaWZpZXIod29yZCkpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRpZiAodGhpcy53b3JkTWF0Y2hlc0N0cmxNb2RpZmllcih3b3JkKSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdGlmICh0aGlzLndvcmRNYXRjaGVzTWV0YU1vZGlmaWVyKHdvcmQpKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0aWYgKHRoaXMud29yZE1hdGNoZXNTaGlmdE1vZGlmaWVyKHdvcmQpKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHJpdmF0ZSB3b3JkTWF0Y2hlc0FsdE1vZGlmaWVyKHdvcmQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdGlmIChzdHJpbmdzLmVxdWFsc0lnbm9yZUNhc2UodGhpcy5tb2RpZmllckxhYmVscy51aS5hbHRLZXksIHdvcmQpKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0aWYgKHN0cmluZ3MuZXF1YWxzSWdub3JlQ2FzZSh0aGlzLm1vZGlmaWVyTGFiZWxzLmFyaWEuYWx0S2V5LCB3b3JkKSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdGlmIChzdHJpbmdzLmVxdWFsc0lnbm9yZUNhc2UodGhpcy5tb2RpZmllckxhYmVscy51c2VyLmFsdEtleSwgd29yZCkpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRpZiAoc3RyaW5ncy5lcXVhbHNJZ25vcmVDYXNlKGxvY2FsaXplKCdvcHRpb24nLCBcIm9wdGlvblwiKSwgd29yZCkpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwcml2YXRlIHdvcmRNYXRjaGVzQ3RybE1vZGlmaWVyKHdvcmQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdGlmIChzdHJpbmdzLmVxdWFsc0lnbm9yZUNhc2UodGhpcy5tb2RpZmllckxhYmVscy51aS5jdHJsS2V5LCB3b3JkKSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdGlmIChzdHJpbmdzLmVxdWFsc0lnbm9yZUNhc2UodGhpcy5tb2RpZmllckxhYmVscy5hcmlhLmN0cmxLZXksIHdvcmQpKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0aWYgKHN0cmluZ3MuZXF1YWxzSWdub3JlQ2FzZSh0aGlzLm1vZGlmaWVyTGFiZWxzLnVzZXIuY3RybEtleSwgd29yZCkpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwcml2YXRlIHdvcmRNYXRjaGVzTWV0YU1vZGlmaWVyKHdvcmQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdGlmIChzdHJpbmdzLmVxdWFsc0lnbm9yZUNhc2UodGhpcy5tb2RpZmllckxhYmVscy51aS5tZXRhS2V5LCB3b3JkKSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdGlmIChzdHJpbmdzLmVxdWFsc0lnbm9yZUNhc2UodGhpcy5tb2RpZmllckxhYmVscy5hcmlhLm1ldGFLZXksIHdvcmQpKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0aWYgKHN0cmluZ3MuZXF1YWxzSWdub3JlQ2FzZSh0aGlzLm1vZGlmaWVyTGFiZWxzLnVzZXIubWV0YUtleSwgd29yZCkpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRpZiAoc3RyaW5ncy5lcXVhbHNJZ25vcmVDYXNlKGxvY2FsaXplKCdtZXRhJywgXCJtZXRhXCIpLCB3b3JkKSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHByaXZhdGUgd29yZE1hdGNoZXNTaGlmdE1vZGlmaWVyKHdvcmQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdGlmIChzdHJpbmdzLmVxdWFsc0lnbm9yZUNhc2UodGhpcy5tb2RpZmllckxhYmVscy51aS5zaGlmdEtleSwgd29yZCkpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRpZiAoc3RyaW5ncy5lcXVhbHNJZ25vcmVDYXNlKHRoaXMubW9kaWZpZXJMYWJlbHMuYXJpYS5zaGlmdEtleSwgd29yZCkpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRpZiAoc3RyaW5ncy5lcXVhbHNJZ25vcmVDYXNlKHRoaXMubW9kaWZpZXJMYWJlbHMudXNlci5zaGlmdEtleSwgd29yZCkpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxVQUFVLGdCQUFnQjtBQUNuQyxZQUFZLGFBQWE7QUFDekIsU0FBMEIsZ0JBQWdCO0FBQzFDLFNBQTBCLElBQUksa0JBQWtCLGNBQWMsZ0NBQWdDLGtDQUFrQztBQUVoSSxTQUFTLG1CQUFtQiwyQkFBMkIsdUJBQW9EO0FBQzNHLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsNkJBQTZCO0FBR3RDLFNBQVMsZUFBZSxnQkFBZ0I7QUFDeEMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxxQkFBcUIsOEJBQXFEO0FBQ25GLFNBQVMsc0JBQXNCO0FBRXhCLE1BQU0sK0JBQStCO0FBRTVDLE1BQU0sZ0JBQWdCLFNBQVMsV0FBVyxRQUFRO0FBQ2xELE1BQU0sbUJBQW1CLFNBQVMsYUFBYSxXQUFXO0FBQzFELE1BQU0sY0FBYyxTQUFTLFFBQVEsTUFBTTtBQVFwQyxTQUFTLDZCQUE2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
