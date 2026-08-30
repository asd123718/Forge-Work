import { ContextKeyExprType, implies } from "../../contextkey/common/contextkey.js";
var ResultKind = /* @__PURE__ */ ((ResultKind2) => {
  ResultKind2[ResultKind2["NoMatchingKb"] = 0] = "NoMatchingKb";
  ResultKind2[ResultKind2["MoreChordsNeeded"] = 1] = "MoreChordsNeeded";
  ResultKind2[ResultKind2["KbFound"] = 2] = "KbFound";
  return ResultKind2;
})(ResultKind || {});
const NoMatchingKb = { kind: 0 /* NoMatchingKb */ };
const MoreChordsNeeded = { kind: 1 /* MoreChordsNeeded */ };
function KbFound(commandId, commandArgs, isBubble) {
  return { kind: 2 /* KbFound */, commandId, commandArgs, isBubble };
}
class KeybindingResolver {
  constructor(defaultKeybindings, overrides, log) {
    this._log = log;
    this._defaultKeybindings = defaultKeybindings;
    this._defaultBoundCommands = /* @__PURE__ */ new Map();
    for (const defaultKeybinding of defaultKeybindings) {
      const command = defaultKeybinding.command;
      if (command && command.charAt(0) !== "-") {
        this._defaultBoundCommands.set(command, true);
      }
    }
    this._map = /* @__PURE__ */ new Map();
    this._lookupMap = /* @__PURE__ */ new Map();
    this._keybindings = KeybindingResolver.handleRemovals([].concat(defaultKeybindings).concat(overrides));
    for (let i = 0, len = this._keybindings.length; i < len; i++) {
      const k = this._keybindings[i];
      if (k.chords.length === 0) {
        continue;
      }
      const when = k.when?.substituteConstants();
      if (when && when.type === ContextKeyExprType.False) {
        continue;
      }
      this._addKeyPress(k.chords[0], k);
    }
  }
  static _isTargetedForRemoval(defaultKb, keypress, when) {
    if (keypress) {
      for (let i = 0; i < keypress.length; i++) {
        if (keypress[i] !== defaultKb.chords[i]) {
          return false;
        }
      }
    }
    if (when && when.type !== ContextKeyExprType.True) {
      if (!defaultKb.when) {
        return false;
      }
      const defaultWhen = defaultKb.when.substituteConstants();
      const removalWhen = when.substituteConstants();
      if (!KeybindingResolver.whenIsEntirelyIncluded(defaultWhen, removalWhen)) {
        return false;
      }
    }
    return true;
  }
  /**
   * Looks for rules containing "-commandId" and removes them.
   */
  static handleRemovals(rules) {
    const removals = /* @__PURE__ */ new Map();
    for (let i = 0, len = rules.length; i < len; i++) {
      const rule = rules[i];
      if (rule.command && rule.command.charAt(0) === "-") {
        const command = rule.command.substring(1);
        if (!removals.has(command)) {
          removals.set(command, [rule]);
        } else {
          removals.get(command).push(rule);
        }
      }
    }
    if (removals.size === 0) {
      return rules;
    }
    const result = [];
    for (let i = 0, len = rules.length; i < len; i++) {
      const rule = rules[i];
      if (!rule.command || rule.command.length === 0) {
        result.push(rule);
        continue;
      }
      if (rule.command.charAt(0) === "-") {
        continue;
      }
      const commandRemovals = removals.get(rule.command);
      if (!commandRemovals || !rule.isDefault) {
        result.push(rule);
        continue;
      }
      let isRemoved = false;
      for (const commandRemoval of commandRemovals) {
        const when = commandRemoval.when;
        if (this._isTargetedForRemoval(rule, commandRemoval.chords, when)) {
          isRemoved = true;
          break;
        }
      }
      if (!isRemoved) {
        result.push(rule);
        continue;
      }
    }
    return result;
  }
  _addKeyPress(keypress, item) {
    const conflicts = this._map.get(keypress);
    if (typeof conflicts === "undefined") {
      this._map.set(keypress, [item]);
      this._addToLookupMap(item);
      return;
    }
    for (let i = conflicts.length - 1; i >= 0; i--) {
      const conflict = conflicts[i];
      if (conflict.command === item.command) {
        continue;
      }
      let isShorterKbPrefix = true;
      for (let i2 = 1; i2 < conflict.chords.length && i2 < item.chords.length; i2++) {
        if (conflict.chords[i2] !== item.chords[i2]) {
          isShorterKbPrefix = false;
          break;
        }
      }
      if (!isShorterKbPrefix) {
        continue;
      }
      if (KeybindingResolver.whenIsEntirelyIncluded(conflict.when, item.when)) {
        this._removeFromLookupMap(conflict);
      }
    }
    conflicts.push(item);
    this._addToLookupMap(item);
  }
  _addToLookupMap(item) {
    if (!item.command) {
      return;
    }
    let arr = this._lookupMap.get(item.command);
    if (typeof arr === "undefined") {
      arr = [item];
      this._lookupMap.set(item.command, arr);
    } else {
      arr.push(item);
    }
  }
  _removeFromLookupMap(item) {
    if (!item.command) {
      return;
    }
    const arr = this._lookupMap.get(item.command);
    if (typeof arr === "undefined") {
      return;
    }
    for (let i = 0, len = arr.length; i < len; i++) {
      if (arr[i] === item) {
        arr.splice(i, 1);
        return;
      }
    }
  }
  /**
   * Returns true if it is provable `a` implies `b`.
   */
  static whenIsEntirelyIncluded(a, b) {
    if (!b || b.type === ContextKeyExprType.True) {
      return true;
    }
    if (!a || a.type === ContextKeyExprType.True) {
      return false;
    }
    return implies(a, b);
  }
  getDefaultBoundCommands() {
    return this._defaultBoundCommands;
  }
  getDefaultKeybindings() {
    return this._defaultKeybindings;
  }
  getKeybindings() {
    return this._keybindings;
  }
  lookupKeybindings(commandId) {
    const items = this._lookupMap.get(commandId);
    if (typeof items === "undefined" || items.length === 0) {
      return [];
    }
    const result = [];
    let resultLen = 0;
    for (let i = items.length - 1; i >= 0; i--) {
      result[resultLen++] = items[i];
    }
    return result;
  }
  lookupPrimaryKeybinding(commandId, context, enforceContextCheck = false) {
    const items = this._lookupMap.get(commandId);
    if (typeof items === "undefined" || items.length === 0) {
      return null;
    }
    if (items.length === 1 && !enforceContextCheck) {
      return items[0];
    }
    for (let i = items.length - 1; i >= 0; i--) {
      const item = items[i];
      if (context.contextMatchesRules(item.when)) {
        return item;
      }
    }
    if (enforceContextCheck) {
      return null;
    }
    return items[items.length - 1];
  }
  /**
   * Looks up a keybinding trigged as a result of pressing a sequence of chords - `[...currentChords, keypress]`
   *
   * Example: resolving 3 chords pressed sequentially - `cmd+k cmd+p cmd+i`:
   * 	`currentChords = [ 'cmd+k' , 'cmd+p' ]` and `keypress = `cmd+i` - last pressed chord
   */
  resolve(context, currentChords, keypress) {
    const pressedChords = [...currentChords, keypress];
    this._log(`| Resolving ${pressedChords}`);
    const kbCandidates = this._map.get(pressedChords[0]);
    if (kbCandidates === void 0) {
      this._log(`\\ No keybinding entries.`);
      return NoMatchingKb;
    }
    let lookupMap = null;
    if (pressedChords.length < 2) {
      lookupMap = kbCandidates;
    } else {
      lookupMap = [];
      for (let i = 0, len = kbCandidates.length; i < len; i++) {
        const candidate = kbCandidates[i];
        if (pressedChords.length > candidate.chords.length) {
          continue;
        }
        let prefixMatches = true;
        for (let i2 = 1; i2 < pressedChords.length; i2++) {
          if (candidate.chords[i2] !== pressedChords[i2]) {
            prefixMatches = false;
            break;
          }
        }
        if (prefixMatches) {
          lookupMap.push(candidate);
        }
      }
    }
    const result = this._findCommand(context, lookupMap);
    if (!result) {
      this._log(`\\ From ${lookupMap.length} keybinding entries, no when clauses matched the context.`);
      return NoMatchingKb;
    }
    if (pressedChords.length < result.chords.length) {
      this._log(`\\ From ${lookupMap.length} keybinding entries, awaiting ${result.chords.length - pressedChords.length} more chord(s), when: ${printWhenExplanation(result.when)}, source: ${printSourceExplanation(result)}.`);
      return MoreChordsNeeded;
    }
    this._log(`\\ From ${lookupMap.length} keybinding entries, matched ${result.command}, when: ${printWhenExplanation(result.when)}, source: ${printSourceExplanation(result)}.`);
    return KbFound(result.command, result.commandArgs, result.bubble);
  }
  _findCommand(context, matches) {
    for (let i = matches.length - 1; i >= 0; i--) {
      const k = matches[i];
      if (!KeybindingResolver._contextMatchesRules(context, k.when)) {
        continue;
      }
      return k;
    }
    return null;
  }
  static _contextMatchesRules(context, rules) {
    if (!rules) {
      return true;
    }
    return rules.evaluate(context);
  }
}
function printWhenExplanation(when) {
  if (!when) {
    return `no when condition`;
  }
  return `${when.serialize()}`;
}
function printSourceExplanation(kb) {
  return kb.extensionId ? kb.isBuiltinExtension ? `built-in extension ${kb.extensionId}` : `user extension ${kb.extensionId}` : kb.isDefault ? `built-in` : `user`;
}
export {
  KeybindingResolver,
  NoMatchingKb,
  ResultKind
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxca2V5YmluZGluZ1xcY29tbW9uXFxrZXliaW5kaW5nUmVzb2x2ZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBDb250ZXh0S2V5RXhwcmVzc2lvbiwgQ29udGV4dEtleUV4cHJUeXBlLCBJQ29udGV4dCwgSUNvbnRleHRLZXlTZXJ2aWNlLCBpbXBsaWVzIH0gZnJvbSAnLi4vLi4vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBSZXNvbHZlZEtleWJpbmRpbmdJdGVtIH0gZnJvbSAnLi9yZXNvbHZlZEtleWJpbmRpbmdJdGVtLmpzJztcblxuLy8jcmVnaW9uIHJlc29sdXRpb24tcmVzdWx0XG5cbmV4cG9ydCBjb25zdCBlbnVtIFJlc3VsdEtpbmQge1xuXHQvKiogTm8ga2V5YmluZGluZyBmb3VuZCB0aGlzIHNlcXVlbmNlIG9mIGNob3JkcyAqL1xuXHROb01hdGNoaW5nS2IsXG5cblx0LyoqIFRoZXJlJ3JlIHNldmVyYWwga2V5YmluZGluZ3MgdGhhdCBoYXZlIHRoZSBnaXZlbiBzZXF1ZW5jZSBvZiBjaG9yZHMgYXMgYSBwcmVmaXggKi9cblx0TW9yZUNob3Jkc05lZWRlZCxcblxuXHQvKiogQSBzaW5nbGUga2V5YmluZGluZyBmb3VuZCB0byBiZSBkaXNwYXRjaGVkL2ludm9rZWQgKi9cblx0S2JGb3VuZFxufVxuXG5leHBvcnQgdHlwZSBSZXNvbHV0aW9uUmVzdWx0ID1cblx0fCB7IGtpbmQ6IFJlc3VsdEtpbmQuTm9NYXRjaGluZ0tiIH1cblx0fCB7IGtpbmQ6IFJlc3VsdEtpbmQuTW9yZUNob3Jkc05lZWRlZCB9XG5cdHwgeyBraW5kOiBSZXN1bHRLaW5kLktiRm91bmQ7IGNvbW1hbmRJZDogc3RyaW5nIHwgbnVsbDsgY29tbWFuZEFyZ3M6IGFueTsgaXNCdWJibGU6IGJvb2xlYW4gfTtcblxuXG4vLyB1dGlsIGRlZmluaXRpb25zIHRvIG1ha2Ugd29ya2luZyB3aXRoIHRoZSBhYm92ZSB0eXBlcyBlYXNpZXIgd2l0aGluIHRoaXMgbW9kdWxlOlxuXG5leHBvcnQgY29uc3QgTm9NYXRjaGluZ0tiOiBSZXNvbHV0aW9uUmVzdWx0ID0geyBraW5kOiBSZXN1bHRLaW5kLk5vTWF0Y2hpbmdLYiB9O1xuY29uc3QgTW9yZUNob3Jkc05lZWRlZDogUmVzb2x1dGlvblJlc3VsdCA9IHsga2luZDogUmVzdWx0S2luZC5Nb3JlQ2hvcmRzTmVlZGVkIH07XG5mdW5jdGlvbiBLYkZvdW5kKGNvbW1hbmRJZDogc3RyaW5nIHwgbnVsbCwgY29tbWFuZEFyZ3M6IGFueSwgaXNCdWJibGU6IGJvb2xlYW4pOiBSZXNvbHV0aW9uUmVzdWx0IHtcblx0cmV0dXJuIHsga2luZDogUmVzdWx0S2luZC5LYkZvdW5kLCBjb21tYW5kSWQsIGNvbW1hbmRBcmdzLCBpc0J1YmJsZSB9O1xufVxuXG4vLyNlbmRyZWdpb25cblxuLyoqXG4gKiBTdG9yZXMgbWFwcGluZ3MgZnJvbSBrZXliaW5kaW5ncyB0byBjb21tYW5kcyBhbmQgZnJvbSBjb21tYW5kcyB0byBrZXliaW5kaW5ncy5cbiAqIEdpdmVuIGEgc2VxdWVuY2Ugb2YgY2hvcmRzLCBgcmVzb2x2ZWBzIHdoaWNoIGtleWJpbmRpbmcgaXQgbWF0Y2hlc1xuICovXG5leHBvcnQgY2xhc3MgS2V5YmluZGluZ1Jlc29sdmVyIHtcblx0cHJpdmF0ZSByZWFkb25seSBfbG9nOiAoc3RyOiBzdHJpbmcpID0+IHZvaWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2RlZmF1bHRLZXliaW5kaW5nczogUmVzb2x2ZWRLZXliaW5kaW5nSXRlbVtdO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9rZXliaW5kaW5nczogUmVzb2x2ZWRLZXliaW5kaW5nSXRlbVtdO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kZWZhdWx0Qm91bmRDb21tYW5kczogTWFwPC8qIGNvbW1hbmRJZCAqLyBzdHJpbmcsIGJvb2xlYW4+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9tYXA6IE1hcDwvKiAxc3QgY2hvcmQncyBrZXlwcmVzcyAqLyBzdHJpbmcsIFJlc29sdmVkS2V5YmluZGluZ0l0ZW1bXT47XG5cdHByaXZhdGUgcmVhZG9ubHkgX2xvb2t1cE1hcDogTWFwPC8qIGNvbW1hbmRJZCAqLyBzdHJpbmcsIFJlc29sdmVkS2V5YmluZGluZ0l0ZW1bXT47XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0LyoqIGJ1aWx0LWluIGFuZCBleHRlbnNpb24tcHJvdmlkZWQga2V5YmluZGluZ3MgKi9cblx0XHRkZWZhdWx0S2V5YmluZGluZ3M6IFJlc29sdmVkS2V5YmluZGluZ0l0ZW1bXSxcblx0XHQvKiogdXNlcidzIGtleWJpbmRpbmdzICovXG5cdFx0b3ZlcnJpZGVzOiBSZXNvbHZlZEtleWJpbmRpbmdJdGVtW10sXG5cdFx0bG9nOiAoc3RyOiBzdHJpbmcpID0+IHZvaWRcblx0KSB7XG5cdFx0dGhpcy5fbG9nID0gbG9nO1xuXHRcdHRoaXMuX2RlZmF1bHRLZXliaW5kaW5ncyA9IGRlZmF1bHRLZXliaW5kaW5ncztcblxuXHRcdHRoaXMuX2RlZmF1bHRCb3VuZENvbW1hbmRzID0gbmV3IE1hcDxzdHJpbmcsIGJvb2xlYW4+KCk7XG5cdFx0Zm9yIChjb25zdCBkZWZhdWx0S2V5YmluZGluZyBvZiBkZWZhdWx0S2V5YmluZGluZ3MpIHtcblx0XHRcdGNvbnN0IGNvbW1hbmQgPSBkZWZhdWx0S2V5YmluZGluZy5jb21tYW5kO1xuXHRcdFx0aWYgKGNvbW1hbmQgJiYgY29tbWFuZC5jaGFyQXQoMCkgIT09ICctJykge1xuXHRcdFx0XHR0aGlzLl9kZWZhdWx0Qm91bmRDb21tYW5kcy5zZXQoY29tbWFuZCwgdHJ1ZSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5fbWFwID0gbmV3IE1hcDxzdHJpbmcsIFJlc29sdmVkS2V5YmluZGluZ0l0ZW1bXT4oKTtcblx0XHR0aGlzLl9sb29rdXBNYXAgPSBuZXcgTWFwPHN0cmluZywgUmVzb2x2ZWRLZXliaW5kaW5nSXRlbVtdPigpO1xuXG5cdFx0dGhpcy5fa2V5YmluZGluZ3MgPSBLZXliaW5kaW5nUmVzb2x2ZXIuaGFuZGxlUmVtb3ZhbHMoKFtdIGFzIFJlc29sdmVkS2V5YmluZGluZ0l0ZW1bXSkuY29uY2F0KGRlZmF1bHRLZXliaW5kaW5ncykuY29uY2F0KG92ZXJyaWRlcykpO1xuXHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSB0aGlzLl9rZXliaW5kaW5ncy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0Y29uc3QgayA9IHRoaXMuX2tleWJpbmRpbmdzW2ldO1xuXHRcdFx0aWYgKGsuY2hvcmRzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHQvLyB1bmJvdW5kXG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBzdWJzdGl0dXRlIHdpdGggY29uc3RhbnRzIHRoYXQgYXJlIHJlZ2lzdGVyZWQgYWZ0ZXIgc3RhcnR1cCAtIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xNzQyMTgjaXNzdWVjb21tZW50LTE0Mzc5NzIxMjdcblx0XHRcdGNvbnN0IHdoZW4gPSBrLndoZW4/LnN1YnN0aXR1dGVDb25zdGFudHMoKTtcblxuXHRcdFx0aWYgKHdoZW4gJiYgd2hlbi50eXBlID09PSBDb250ZXh0S2V5RXhwclR5cGUuRmFsc2UpIHtcblx0XHRcdFx0Ly8gd2hlbiBjb25kaXRpb24gaXMgZmFsc2Vcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX2FkZEtleVByZXNzKGsuY2hvcmRzWzBdLCBrKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfaXNUYXJnZXRlZEZvclJlbW92YWwoZGVmYXVsdEtiOiBSZXNvbHZlZEtleWJpbmRpbmdJdGVtLCBrZXlwcmVzczogc3RyaW5nW10gfCBudWxsLCB3aGVuOiBDb250ZXh0S2V5RXhwcmVzc2lvbiB8IHVuZGVmaW5lZCk6IGJvb2xlYW4ge1xuXHRcdGlmIChrZXlwcmVzcykge1xuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBrZXlwcmVzcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRpZiAoa2V5cHJlc3NbaV0gIT09IGRlZmF1bHRLYi5jaG9yZHNbaV0pIHtcblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBgdHJ1ZWAgbWVhbnMgYWx3YXlzLCBhcyBkb2VzIGB1bmRlZmluZWRgXG5cdFx0Ly8gc28gd2Ugd2lsbCB0cmVhdCBgdHJ1ZWAgPT09IGB1bmRlZmluZWRgXG5cdFx0aWYgKHdoZW4gJiYgd2hlbi50eXBlICE9PSBDb250ZXh0S2V5RXhwclR5cGUuVHJ1ZSkge1xuXHRcdFx0aWYgKCFkZWZhdWx0S2Iud2hlbikge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFVzZSBpbXBsaWNhdGlvbiBpbnN0ZWFkIG9mIHN0cmljdCBlcXVhbGl0eSBzbyB0aGF0IGEgcmVtb3ZhbCBzdGlsbCBtYXRjaGVzXG5cdFx0XHQvLyB3aGVuIHRoZSBkZWZhdWx0IGtleWJpbmRpbmcncyB3aGVuIGNsYXVzZSBiZWNvbWVzIG1vcmUgc3BlY2lmaWMgYWNyb3NzXG5cdFx0XHQvLyB1cGRhdGVzIChlLmcuIFwiaW5DaGF0SW5wdXRcIiBcdTIxOTIgXCJpbkNoYXRJbnB1dCAmJiAhd2l0aGluRWRpdFNlc3Npb25EaWZmXCIpLlxuXHRcdFx0Ly8gU2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8yOTM4MDJcblx0XHRcdGNvbnN0IGRlZmF1bHRXaGVuID0gZGVmYXVsdEtiLndoZW4uc3Vic3RpdHV0ZUNvbnN0YW50cygpO1xuXHRcdFx0Y29uc3QgcmVtb3ZhbFdoZW4gPSB3aGVuLnN1YnN0aXR1dGVDb25zdGFudHMoKTtcblx0XHRcdGlmICghS2V5YmluZGluZ1Jlc29sdmVyLndoZW5Jc0VudGlyZWx5SW5jbHVkZWQoZGVmYXVsdFdoZW4sIHJlbW92YWxXaGVuKSkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB0cnVlO1xuXG5cdH1cblxuXHQvKipcblx0ICogTG9va3MgZm9yIHJ1bGVzIGNvbnRhaW5pbmcgXCItY29tbWFuZElkXCIgYW5kIHJlbW92ZXMgdGhlbS5cblx0ICovXG5cdHB1YmxpYyBzdGF0aWMgaGFuZGxlUmVtb3ZhbHMocnVsZXM6IFJlc29sdmVkS2V5YmluZGluZ0l0ZW1bXSk6IFJlc29sdmVkS2V5YmluZGluZ0l0ZW1bXSB7XG5cdFx0Ly8gRG8gYSBmaXJzdCBwYXNzIGFuZCBjb25zdHJ1Y3QgYSBoYXNoLW1hcCBmb3IgcmVtb3ZhbHNcblx0XHRjb25zdCByZW1vdmFscyA9IG5ldyBNYXA8LyogY29tbWFuZElkICovIHN0cmluZywgUmVzb2x2ZWRLZXliaW5kaW5nSXRlbVtdPigpO1xuXHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSBydWxlcy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0Y29uc3QgcnVsZSA9IHJ1bGVzW2ldO1xuXHRcdFx0aWYgKHJ1bGUuY29tbWFuZCAmJiBydWxlLmNvbW1hbmQuY2hhckF0KDApID09PSAnLScpIHtcblx0XHRcdFx0Y29uc3QgY29tbWFuZCA9IHJ1bGUuY29tbWFuZC5zdWJzdHJpbmcoMSk7XG5cdFx0XHRcdGlmICghcmVtb3ZhbHMuaGFzKGNvbW1hbmQpKSB7XG5cdFx0XHRcdFx0cmVtb3ZhbHMuc2V0KGNvbW1hbmQsIFtydWxlXSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cmVtb3ZhbHMuZ2V0KGNvbW1hbmQpIS5wdXNoKHJ1bGUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKHJlbW92YWxzLnNpemUgPT09IDApIHtcblx0XHRcdC8vIFRoZXJlIGFyZSBubyByZW1vdmFsc1xuXHRcdFx0cmV0dXJuIHJ1bGVzO1xuXHRcdH1cblxuXHRcdC8vIERvIGEgc2Vjb25kIHBhc3MgYW5kIGtlZXAgb25seSBub24tcmVtb3ZlZCBrZXliaW5kaW5nc1xuXHRcdGNvbnN0IHJlc3VsdDogUmVzb2x2ZWRLZXliaW5kaW5nSXRlbVtdID0gW107XG5cdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IHJ1bGVzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRjb25zdCBydWxlID0gcnVsZXNbaV07XG5cblx0XHRcdGlmICghcnVsZS5jb21tYW5kIHx8IHJ1bGUuY29tbWFuZC5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0cmVzdWx0LnB1c2gocnVsZSk7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHJ1bGUuY29tbWFuZC5jaGFyQXQoMCkgPT09ICctJykge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGNvbW1hbmRSZW1vdmFscyA9IHJlbW92YWxzLmdldChydWxlLmNvbW1hbmQpO1xuXHRcdFx0aWYgKCFjb21tYW5kUmVtb3ZhbHMgfHwgIXJ1bGUuaXNEZWZhdWx0KSB7XG5cdFx0XHRcdHJlc3VsdC5wdXNoKHJ1bGUpO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGxldCBpc1JlbW92ZWQgPSBmYWxzZTtcblx0XHRcdGZvciAoY29uc3QgY29tbWFuZFJlbW92YWwgb2YgY29tbWFuZFJlbW92YWxzKSB7XG5cdFx0XHRcdGNvbnN0IHdoZW4gPSBjb21tYW5kUmVtb3ZhbC53aGVuO1xuXHRcdFx0XHRpZiAodGhpcy5faXNUYXJnZXRlZEZvclJlbW92YWwocnVsZSwgY29tbWFuZFJlbW92YWwuY2hvcmRzLCB3aGVuKSkge1xuXHRcdFx0XHRcdGlzUmVtb3ZlZCA9IHRydWU7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGlmICghaXNSZW1vdmVkKSB7XG5cdFx0XHRcdHJlc3VsdC5wdXNoKHJ1bGUpO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByaXZhdGUgX2FkZEtleVByZXNzKGtleXByZXNzOiBzdHJpbmcsIGl0ZW06IFJlc29sdmVkS2V5YmluZGluZ0l0ZW0pOiB2b2lkIHtcblxuXHRcdGNvbnN0IGNvbmZsaWN0cyA9IHRoaXMuX21hcC5nZXQoa2V5cHJlc3MpO1xuXG5cdFx0aWYgKHR5cGVvZiBjb25mbGljdHMgPT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHQvLyBUaGVyZSBpcyBubyBjb25mbGljdCBzbyBmYXJcblx0XHRcdHRoaXMuX21hcC5zZXQoa2V5cHJlc3MsIFtpdGVtXSk7XG5cdFx0XHR0aGlzLl9hZGRUb0xvb2t1cE1hcChpdGVtKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRmb3IgKGxldCBpID0gY29uZmxpY3RzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG5cdFx0XHRjb25zdCBjb25mbGljdCA9IGNvbmZsaWN0c1tpXTtcblxuXHRcdFx0aWYgKGNvbmZsaWN0LmNvbW1hbmQgPT09IGl0ZW0uY29tbWFuZCkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gVGVzdCBpZiB0aGUgc2hvcnRlciBrZXliaW5kaW5nIGlzIGEgcHJlZml4IG9mIHRoZSBsb25nZXIgb25lLlxuXHRcdFx0Ly8gSWYgdGhlIHNob3J0ZXIga2V5YmluZGluZyBpcyBhIHByZWZpeCwgaXQgZWZmZWN0aXZlbHkgd2lsbCBzaGFkb3cgdGhlIGxvbmdlciBvbmUgYW5kIGlzIGNvbnNpZGVyZWQgYSBjb25mbGljdC5cblx0XHRcdGxldCBpc1Nob3J0ZXJLYlByZWZpeCA9IHRydWU7XG5cdFx0XHRmb3IgKGxldCBpID0gMTsgaSA8IGNvbmZsaWN0LmNob3Jkcy5sZW5ndGggJiYgaSA8IGl0ZW0uY2hvcmRzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdGlmIChjb25mbGljdC5jaG9yZHNbaV0gIT09IGl0ZW0uY2hvcmRzW2ldKSB7XG5cdFx0XHRcdFx0Ly8gVGhlIGl0aCBzdGVwIGRvZXMgbm90IGNvbmZsaWN0XG5cdFx0XHRcdFx0aXNTaG9ydGVyS2JQcmVmaXggPSBmYWxzZTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKCFpc1Nob3J0ZXJLYlByZWZpeCkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKEtleWJpbmRpbmdSZXNvbHZlci53aGVuSXNFbnRpcmVseUluY2x1ZGVkKGNvbmZsaWN0LndoZW4sIGl0ZW0ud2hlbikpIHtcblx0XHRcdFx0Ly8gYGl0ZW1gIGNvbXBsZXRlbHkgb3ZlcndyaXRlcyBgY29uZmxpY3RgXG5cdFx0XHRcdC8vIFJlbW92ZSBjb25mbGljdCBmcm9tIHRoZSBsb29rdXBNYXBcblx0XHRcdFx0dGhpcy5fcmVtb3ZlRnJvbUxvb2t1cE1hcChjb25mbGljdCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uZmxpY3RzLnB1c2goaXRlbSk7XG5cdFx0dGhpcy5fYWRkVG9Mb29rdXBNYXAoaXRlbSk7XG5cdH1cblxuXHRwcml2YXRlIF9hZGRUb0xvb2t1cE1hcChpdGVtOiBSZXNvbHZlZEtleWJpbmRpbmdJdGVtKTogdm9pZCB7XG5cdFx0aWYgKCFpdGVtLmNvbW1hbmQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRsZXQgYXJyID0gdGhpcy5fbG9va3VwTWFwLmdldChpdGVtLmNvbW1hbmQpO1xuXHRcdGlmICh0eXBlb2YgYXJyID09PSAndW5kZWZpbmVkJykge1xuXHRcdFx0YXJyID0gW2l0ZW1dO1xuXHRcdFx0dGhpcy5fbG9va3VwTWFwLnNldChpdGVtLmNvbW1hbmQsIGFycik7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGFyci5wdXNoKGl0ZW0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3JlbW92ZUZyb21Mb29rdXBNYXAoaXRlbTogUmVzb2x2ZWRLZXliaW5kaW5nSXRlbSk6IHZvaWQge1xuXHRcdGlmICghaXRlbS5jb21tYW5kKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGFyciA9IHRoaXMuX2xvb2t1cE1hcC5nZXQoaXRlbS5jb21tYW5kKTtcblx0XHRpZiAodHlwZW9mIGFyciA9PT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IGFyci5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0aWYgKGFycltpXSA9PT0gaXRlbSkge1xuXHRcdFx0XHRhcnIuc3BsaWNlKGksIDEpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFJldHVybnMgdHJ1ZSBpZiBpdCBpcyBwcm92YWJsZSBgYWAgaW1wbGllcyBgYmAuXG5cdCAqL1xuXHRwdWJsaWMgc3RhdGljIHdoZW5Jc0VudGlyZWx5SW5jbHVkZWQoYTogQ29udGV4dEtleUV4cHJlc3Npb24gfCBudWxsIHwgdW5kZWZpbmVkLCBiOiBDb250ZXh0S2V5RXhwcmVzc2lvbiB8IG51bGwgfCB1bmRlZmluZWQpOiBib29sZWFuIHtcblx0XHRpZiAoIWIgfHwgYi50eXBlID09PSBDb250ZXh0S2V5RXhwclR5cGUuVHJ1ZSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdGlmICghYSB8fCBhLnR5cGUgPT09IENvbnRleHRLZXlFeHByVHlwZS5UcnVlKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGltcGxpZXMoYSwgYik7XG5cdH1cblxuXHRwdWJsaWMgZ2V0RGVmYXVsdEJvdW5kQ29tbWFuZHMoKTogTWFwPHN0cmluZywgYm9vbGVhbj4ge1xuXHRcdHJldHVybiB0aGlzLl9kZWZhdWx0Qm91bmRDb21tYW5kcztcblx0fVxuXG5cdHB1YmxpYyBnZXREZWZhdWx0S2V5YmluZGluZ3MoKTogcmVhZG9ubHkgUmVzb2x2ZWRLZXliaW5kaW5nSXRlbVtdIHtcblx0XHRyZXR1cm4gdGhpcy5fZGVmYXVsdEtleWJpbmRpbmdzO1xuXHR9XG5cblx0cHVibGljIGdldEtleWJpbmRpbmdzKCk6IHJlYWRvbmx5IFJlc29sdmVkS2V5YmluZGluZ0l0ZW1bXSB7XG5cdFx0cmV0dXJuIHRoaXMuX2tleWJpbmRpbmdzO1xuXHR9XG5cblx0cHVibGljIGxvb2t1cEtleWJpbmRpbmdzKGNvbW1hbmRJZDogc3RyaW5nKTogUmVzb2x2ZWRLZXliaW5kaW5nSXRlbVtdIHtcblx0XHRjb25zdCBpdGVtcyA9IHRoaXMuX2xvb2t1cE1hcC5nZXQoY29tbWFuZElkKTtcblx0XHRpZiAodHlwZW9mIGl0ZW1zID09PSAndW5kZWZpbmVkJyB8fCBpdGVtcy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHQvLyBSZXZlcnNlIHRvIGdldCB0aGUgbW9zdCBzcGVjaWZpYyBpdGVtIGZpcnN0XG5cdFx0Y29uc3QgcmVzdWx0OiBSZXNvbHZlZEtleWJpbmRpbmdJdGVtW10gPSBbXTtcblx0XHRsZXQgcmVzdWx0TGVuID0gMDtcblx0XHRmb3IgKGxldCBpID0gaXRlbXMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcblx0XHRcdHJlc3VsdFtyZXN1bHRMZW4rK10gPSBpdGVtc1tpXTtcblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHB1YmxpYyBsb29rdXBQcmltYXJ5S2V5YmluZGluZyhjb21tYW5kSWQ6IHN0cmluZywgY29udGV4dDogSUNvbnRleHRLZXlTZXJ2aWNlLCBlbmZvcmNlQ29udGV4dENoZWNrID0gZmFsc2UpOiBSZXNvbHZlZEtleWJpbmRpbmdJdGVtIHwgbnVsbCB7XG5cdFx0Y29uc3QgaXRlbXMgPSB0aGlzLl9sb29rdXBNYXAuZ2V0KGNvbW1hbmRJZCk7XG5cdFx0aWYgKHR5cGVvZiBpdGVtcyA9PT0gJ3VuZGVmaW5lZCcgfHwgaXRlbXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0aWYgKGl0ZW1zLmxlbmd0aCA9PT0gMSAmJiAhZW5mb3JjZUNvbnRleHRDaGVjaykge1xuXHRcdFx0cmV0dXJuIGl0ZW1zWzBdO1xuXHRcdH1cblxuXHRcdGZvciAobGV0IGkgPSBpdGVtcy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuXHRcdFx0Y29uc3QgaXRlbSA9IGl0ZW1zW2ldO1xuXHRcdFx0aWYgKGNvbnRleHQuY29udGV4dE1hdGNoZXNSdWxlcyhpdGVtLndoZW4pKSB7XG5cdFx0XHRcdHJldHVybiBpdGVtO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChlbmZvcmNlQ29udGV4dENoZWNrKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRyZXR1cm4gaXRlbXNbaXRlbXMubGVuZ3RoIC0gMV07XG5cdH1cblxuXHQvKipcblx0ICogTG9va3MgdXAgYSBrZXliaW5kaW5nIHRyaWdnZWQgYXMgYSByZXN1bHQgb2YgcHJlc3NpbmcgYSBzZXF1ZW5jZSBvZiBjaG9yZHMgLSBgWy4uLmN1cnJlbnRDaG9yZHMsIGtleXByZXNzXWBcblx0ICpcblx0ICogRXhhbXBsZTogcmVzb2x2aW5nIDMgY2hvcmRzIHByZXNzZWQgc2VxdWVudGlhbGx5IC0gYGNtZCtrIGNtZCtwIGNtZCtpYDpcblx0ICogXHRgY3VycmVudENob3JkcyA9IFsgJ2NtZCtrJyAsICdjbWQrcCcgXWAgYW5kIGBrZXlwcmVzcyA9IGBjbWQraWAgLSBsYXN0IHByZXNzZWQgY2hvcmRcblx0ICovXG5cdHB1YmxpYyByZXNvbHZlKGNvbnRleHQ6IElDb250ZXh0LCBjdXJyZW50Q2hvcmRzOiBzdHJpbmdbXSwga2V5cHJlc3M6IHN0cmluZyk6IFJlc29sdXRpb25SZXN1bHQge1xuXG5cdFx0Y29uc3QgcHJlc3NlZENob3JkcyA9IFsuLi5jdXJyZW50Q2hvcmRzLCBrZXlwcmVzc107XG5cblx0XHR0aGlzLl9sb2coYHwgUmVzb2x2aW5nICR7cHJlc3NlZENob3Jkc31gKTtcblxuXHRcdGNvbnN0IGtiQ2FuZGlkYXRlcyA9IHRoaXMuX21hcC5nZXQocHJlc3NlZENob3Jkc1swXSk7XG5cdFx0aWYgKGtiQ2FuZGlkYXRlcyA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHQvLyBObyBiaW5kaW5ncyB3aXRoIHN1Y2ggMC10aCBjaG9yZFxuXHRcdFx0dGhpcy5fbG9nKGBcXFxcIE5vIGtleWJpbmRpbmcgZW50cmllcy5gKTtcblx0XHRcdHJldHVybiBOb01hdGNoaW5nS2I7XG5cdFx0fVxuXG5cdFx0bGV0IGxvb2t1cE1hcDogUmVzb2x2ZWRLZXliaW5kaW5nSXRlbVtdIHwgbnVsbCA9IG51bGw7XG5cblx0XHRpZiAocHJlc3NlZENob3Jkcy5sZW5ndGggPCAyKSB7XG5cdFx0XHRsb29rdXBNYXAgPSBrYkNhbmRpZGF0ZXM7XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIEZldGNoIGFsbCBjaG9yZCBiaW5kaW5ncyBmb3IgYGN1cnJlbnRDaG9yZHNgXG5cdFx0XHRsb29rdXBNYXAgPSBbXTtcblx0XHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSBrYkNhbmRpZGF0ZXMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblxuXHRcdFx0XHRjb25zdCBjYW5kaWRhdGUgPSBrYkNhbmRpZGF0ZXNbaV07XG5cblx0XHRcdFx0aWYgKHByZXNzZWRDaG9yZHMubGVuZ3RoID4gY2FuZGlkYXRlLmNob3Jkcy5sZW5ndGgpIHsgLy8gIyBvZiBwcmVzc2VkIGNob3JkcyBjYW4ndCBiZSBsZXNzIHRoYW4gIyBvZiBjaG9yZHMgaW4gYSBrZXliaW5kaW5nIHRvIGludm9rZVxuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0bGV0IHByZWZpeE1hdGNoZXMgPSB0cnVlO1xuXHRcdFx0XHRmb3IgKGxldCBpID0gMTsgaSA8IHByZXNzZWRDaG9yZHMubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0XHRpZiAoY2FuZGlkYXRlLmNob3Jkc1tpXSAhPT0gcHJlc3NlZENob3Jkc1tpXSkge1xuXHRcdFx0XHRcdFx0cHJlZml4TWF0Y2hlcyA9IGZhbHNlO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChwcmVmaXhNYXRjaGVzKSB7XG5cdFx0XHRcdFx0bG9va3VwTWFwLnB1c2goY2FuZGlkYXRlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIGNoZWNrIHRoZXJlJ3MgYSBrZXliaW5kaW5nIHdpdGggYSBtYXRjaGluZyB3aGVuIGNsYXVzZVxuXHRcdGNvbnN0IHJlc3VsdCA9IHRoaXMuX2ZpbmRDb21tYW5kKGNvbnRleHQsIGxvb2t1cE1hcCk7XG5cdFx0aWYgKCFyZXN1bHQpIHtcblx0XHRcdHRoaXMuX2xvZyhgXFxcXCBGcm9tICR7bG9va3VwTWFwLmxlbmd0aH0ga2V5YmluZGluZyBlbnRyaWVzLCBubyB3aGVuIGNsYXVzZXMgbWF0Y2hlZCB0aGUgY29udGV4dC5gKTtcblx0XHRcdHJldHVybiBOb01hdGNoaW5nS2I7XG5cdFx0fVxuXG5cdFx0Ly8gY2hlY2sgd2UgZ290IGFsbCBjaG9yZHMgbmVjZXNzYXJ5IHRvIGJlIHN1cmUgYSBwYXJ0aWN1bGFyIGtleWJpbmRpbmcgbmVlZHMgdG8gYmUgaW52b2tlZFxuXHRcdGlmIChwcmVzc2VkQ2hvcmRzLmxlbmd0aCA8IHJlc3VsdC5jaG9yZHMubGVuZ3RoKSB7XG5cdFx0XHQvLyBUaGUgY2hvcmQgc2VxdWVuY2UgaXMgbm90IGNvbXBsZXRlXG5cdFx0XHR0aGlzLl9sb2coYFxcXFwgRnJvbSAke2xvb2t1cE1hcC5sZW5ndGh9IGtleWJpbmRpbmcgZW50cmllcywgYXdhaXRpbmcgJHtyZXN1bHQuY2hvcmRzLmxlbmd0aCAtIHByZXNzZWRDaG9yZHMubGVuZ3RofSBtb3JlIGNob3JkKHMpLCB3aGVuOiAke3ByaW50V2hlbkV4cGxhbmF0aW9uKHJlc3VsdC53aGVuKX0sIHNvdXJjZTogJHtwcmludFNvdXJjZUV4cGxhbmF0aW9uKHJlc3VsdCl9LmApO1xuXHRcdFx0cmV0dXJuIE1vcmVDaG9yZHNOZWVkZWQ7XG5cdFx0fVxuXG5cdFx0dGhpcy5fbG9nKGBcXFxcIEZyb20gJHtsb29rdXBNYXAubGVuZ3RofSBrZXliaW5kaW5nIGVudHJpZXMsIG1hdGNoZWQgJHtyZXN1bHQuY29tbWFuZH0sIHdoZW46ICR7cHJpbnRXaGVuRXhwbGFuYXRpb24ocmVzdWx0LndoZW4pfSwgc291cmNlOiAke3ByaW50U291cmNlRXhwbGFuYXRpb24ocmVzdWx0KX0uYCk7XG5cblx0XHRyZXR1cm4gS2JGb3VuZChyZXN1bHQuY29tbWFuZCwgcmVzdWx0LmNvbW1hbmRBcmdzLCByZXN1bHQuYnViYmxlKTtcblx0fVxuXG5cdHByaXZhdGUgX2ZpbmRDb21tYW5kKGNvbnRleHQ6IElDb250ZXh0LCBtYXRjaGVzOiBSZXNvbHZlZEtleWJpbmRpbmdJdGVtW10pOiBSZXNvbHZlZEtleWJpbmRpbmdJdGVtIHwgbnVsbCB7XG5cdFx0Zm9yIChsZXQgaSA9IG1hdGNoZXMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcblx0XHRcdGNvbnN0IGsgPSBtYXRjaGVzW2ldO1xuXG5cdFx0XHRpZiAoIUtleWJpbmRpbmdSZXNvbHZlci5fY29udGV4dE1hdGNoZXNSdWxlcyhjb250ZXh0LCBrLndoZW4pKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gaztcblx0XHR9XG5cblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9jb250ZXh0TWF0Y2hlc1J1bGVzKGNvbnRleHQ6IElDb250ZXh0LCBydWxlczogQ29udGV4dEtleUV4cHJlc3Npb24gfCBudWxsIHwgdW5kZWZpbmVkKTogYm9vbGVhbiB7XG5cdFx0aWYgKCFydWxlcykge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdHJldHVybiBydWxlcy5ldmFsdWF0ZShjb250ZXh0KTtcblx0fVxufVxuXG5mdW5jdGlvbiBwcmludFdoZW5FeHBsYW5hdGlvbih3aGVuOiBDb250ZXh0S2V5RXhwcmVzc2lvbiB8IHVuZGVmaW5lZCk6IHN0cmluZyB7XG5cdGlmICghd2hlbikge1xuXHRcdHJldHVybiBgbm8gd2hlbiBjb25kaXRpb25gO1xuXHR9XG5cdHJldHVybiBgJHt3aGVuLnNlcmlhbGl6ZSgpfWA7XG59XG5cbmZ1bmN0aW9uIHByaW50U291cmNlRXhwbGFuYXRpb24oa2I6IFJlc29sdmVkS2V5YmluZGluZ0l0ZW0pOiBzdHJpbmcge1xuXHRyZXR1cm4gKFxuXHRcdGtiLmV4dGVuc2lvbklkXG5cdFx0XHQ/IChrYi5pc0J1aWx0aW5FeHRlbnNpb24gPyBgYnVpbHQtaW4gZXh0ZW5zaW9uICR7a2IuZXh0ZW5zaW9uSWR9YCA6IGB1c2VyIGV4dGVuc2lvbiAke2tiLmV4dGVuc2lvbklkfWApXG5cdFx0XHQ6IChrYi5pc0RlZmF1bHQgPyBgYnVpbHQtaW5gIDogYHVzZXJgKVxuXHQpO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBK0Isb0JBQWtELGVBQWU7QUFLekYsSUFBVyxhQUFYLGtCQUFXQSxnQkFBWDtBQUVOLEVBQUFBLHdCQUFBO0FBR0EsRUFBQUEsd0JBQUE7QUFHQSxFQUFBQSx3QkFBQTtBQVJpQixTQUFBQTtBQUFBLEdBQUE7QUFtQlgsTUFBTSxlQUFpQyxFQUFFLE1BQU0scUJBQXdCO0FBQzlFLE1BQU0sbUJBQXFDLEVBQUUsTUFBTSx5QkFBNEI7QUFDL0UsU0FBUyxRQUFRLFdBQTBCLGFBQWtCLFVBQXFDO0FBQ2pHLFNBQU8sRUFBRSxNQUFNLGlCQUFvQixXQUFXLGFBQWEsU0FBUztBQUNyRTtBQVFPLE1BQU0sbUJBQW1CO0FBQUEsRUFRL0IsWUFFQyxvQkFFQSxXQUNBLEtBQ0M7QUFDRCxTQUFLLE9BQU87QUFDWixTQUFLLHNCQUFzQjtBQUUzQixTQUFLLHdCQUF3QixvQkFBSSxJQUFxQjtBQUN0RCxlQUFXLHFCQUFxQixvQkFBb0I7QUFDbkQsWUFBTSxVQUFVLGtCQUFrQjtBQUNsQyxVQUFJLFdBQVcsUUFBUSxPQUFPLENBQUMsTUFBTSxLQUFLO0FBQ3pDLGFBQUssc0JBQXNCLElBQUksU0FBUyxJQUFJO0FBQUEsTUFDN0M7QUFBQSxJQUNEO0FBRUEsU0FBSyxPQUFPLG9CQUFJLElBQXNDO0FBQ3RELFNBQUssYUFBYSxvQkFBSSxJQUFzQztBQUU1RCxTQUFLLGVBQWUsbUJBQW1CLGVBQWdCLENBQUMsRUFBK0IsT0FBTyxrQkFBa0IsRUFBRSxPQUFPLFNBQVMsQ0FBQztBQUNuSSxhQUFTLElBQUksR0FBRyxNQUFNLEtBQUssYUFBYSxRQUFRLElBQUksS0FBSyxLQUFLO0FBQzdELFlBQU0sSUFBSSxLQUFLLGFBQWEsQ0FBQztBQUM3QixVQUFJLEVBQUUsT0FBTyxXQUFXLEdBQUc7QUFFMUI7QUFBQSxNQUNEO0FBR0EsWUFBTSxPQUFPLEVBQUUsTUFBTSxvQkFBb0I7QUFFekMsVUFBSSxRQUFRLEtBQUssU0FBUyxtQkFBbUIsT0FBTztBQUVuRDtBQUFBLE1BQ0Q7QUFFQSxXQUFLLGFBQWEsRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDO0FBQUEsSUFDakM7QUFBQSxFQUNEO0FBQUEsRUFFQSxPQUFlLHNCQUFzQixXQUFtQyxVQUEyQixNQUFpRDtBQUNuSixRQUFJLFVBQVU7QUFDYixlQUFTLElBQUksR0FBRyxJQUFJLFNBQVMsUUFBUSxLQUFLO0FBQ3pDLFlBQUksU0FBUyxDQUFDLE1BQU0sVUFBVSxPQUFPLENBQUMsR0FBRztBQUN4QyxpQkFBTztBQUFBLFFBQ1I7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUlBLFFBQUksUUFBUSxLQUFLLFNBQVMsbUJBQW1CLE1BQU07QUFDbEQsVUFBSSxDQUFDLFVBQVUsTUFBTTtBQUNwQixlQUFPO0FBQUEsTUFDUjtBQU1BLFlBQU0sY0FBYyxVQUFVLEtBQUssb0JBQW9CO0FBQ3ZELFlBQU0sY0FBYyxLQUFLLG9CQUFvQjtBQUM3QyxVQUFJLENBQUMsbUJBQW1CLHVCQUF1QixhQUFhLFdBQVcsR0FBRztBQUN6RSxlQUFPO0FBQUEsTUFDUjtBQUFBLElBQ0Q7QUFDQSxXQUFPO0FBQUEsRUFFUjtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBS0EsT0FBYyxlQUFlLE9BQTJEO0FBRXZGLFVBQU0sV0FBVyxvQkFBSSxJQUFzRDtBQUMzRSxhQUFTLElBQUksR0FBRyxNQUFNLE1BQU0sUUFBUSxJQUFJLEtBQUssS0FBSztBQUNqRCxZQUFNLE9BQU8sTUFBTSxDQUFDO0FBQ3BCLFVBQUksS0FBSyxXQUFXLEtBQUssUUFBUSxPQUFPLENBQUMsTUFBTSxLQUFLO0FBQ25ELGNBQU0sVUFBVSxLQUFLLFFBQVEsVUFBVSxDQUFDO0FBQ3hDLFlBQUksQ0FBQyxTQUFTLElBQUksT0FBTyxHQUFHO0FBQzNCLG1CQUFTLElBQUksU0FBUyxDQUFDLElBQUksQ0FBQztBQUFBLFFBQzdCLE9BQU87QUFDTixtQkFBUyxJQUFJLE9BQU8sRUFBRyxLQUFLLElBQUk7QUFBQSxRQUNqQztBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBRUEsUUFBSSxTQUFTLFNBQVMsR0FBRztBQUV4QixhQUFPO0FBQUEsSUFDUjtBQUdBLFVBQU0sU0FBbUMsQ0FBQztBQUMxQyxhQUFTLElBQUksR0FBRyxNQUFNLE1BQU0sUUFBUSxJQUFJLEtBQUssS0FBSztBQUNqRCxZQUFNLE9BQU8sTUFBTSxDQUFDO0FBRXBCLFVBQUksQ0FBQyxLQUFLLFdBQVcsS0FBSyxRQUFRLFdBQVcsR0FBRztBQUMvQyxlQUFPLEtBQUssSUFBSTtBQUNoQjtBQUFBLE1BQ0Q7QUFDQSxVQUFJLEtBQUssUUFBUSxPQUFPLENBQUMsTUFBTSxLQUFLO0FBQ25DO0FBQUEsTUFDRDtBQUNBLFlBQU0sa0JBQWtCLFNBQVMsSUFBSSxLQUFLLE9BQU87QUFDakQsVUFBSSxDQUFDLG1CQUFtQixDQUFDLEtBQUssV0FBVztBQUN4QyxlQUFPLEtBQUssSUFBSTtBQUNoQjtBQUFBLE1BQ0Q7QUFDQSxVQUFJLFlBQVk7QUFDaEIsaUJBQVcsa0JBQWtCLGlCQUFpQjtBQUM3QyxjQUFNLE9BQU8sZUFBZTtBQUM1QixZQUFJLEtBQUssc0JBQXNCLE1BQU0sZUFBZSxRQUFRLElBQUksR0FBRztBQUNsRSxzQkFBWTtBQUNaO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFDQSxVQUFJLENBQUMsV0FBVztBQUNmLGVBQU8sS0FBSyxJQUFJO0FBQ2hCO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRVEsYUFBYSxVQUFrQixNQUFvQztBQUUxRSxVQUFNLFlBQVksS0FBSyxLQUFLLElBQUksUUFBUTtBQUV4QyxRQUFJLE9BQU8sY0FBYyxhQUFhO0FBRXJDLFdBQUssS0FBSyxJQUFJLFVBQVUsQ0FBQyxJQUFJLENBQUM7QUFDOUIsV0FBSyxnQkFBZ0IsSUFBSTtBQUN6QjtBQUFBLElBQ0Q7QUFFQSxhQUFTLElBQUksVUFBVSxTQUFTLEdBQUcsS0FBSyxHQUFHLEtBQUs7QUFDL0MsWUFBTSxXQUFXLFVBQVUsQ0FBQztBQUU1QixVQUFJLFNBQVMsWUFBWSxLQUFLLFNBQVM7QUFDdEM7QUFBQSxNQUNEO0FBSUEsVUFBSSxvQkFBb0I7QUFDeEIsZUFBU0MsS0FBSSxHQUFHQSxLQUFJLFNBQVMsT0FBTyxVQUFVQSxLQUFJLEtBQUssT0FBTyxRQUFRQSxNQUFLO0FBQzFFLFlBQUksU0FBUyxPQUFPQSxFQUFDLE1BQU0sS0FBSyxPQUFPQSxFQUFDLEdBQUc7QUFFMUMsOEJBQW9CO0FBQ3BCO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFDQSxVQUFJLENBQUMsbUJBQW1CO0FBQ3ZCO0FBQUEsTUFDRDtBQUVBLFVBQUksbUJBQW1CLHVCQUF1QixTQUFTLE1BQU0sS0FBSyxJQUFJLEdBQUc7QUFHeEUsYUFBSyxxQkFBcUIsUUFBUTtBQUFBLE1BQ25DO0FBQUEsSUFDRDtBQUVBLGNBQVUsS0FBSyxJQUFJO0FBQ25CLFNBQUssZ0JBQWdCLElBQUk7QUFBQSxFQUMxQjtBQUFBLEVBRVEsZ0JBQWdCLE1BQW9DO0FBQzNELFFBQUksQ0FBQyxLQUFLLFNBQVM7QUFDbEI7QUFBQSxJQUNEO0FBRUEsUUFBSSxNQUFNLEtBQUssV0FBVyxJQUFJLEtBQUssT0FBTztBQUMxQyxRQUFJLE9BQU8sUUFBUSxhQUFhO0FBQy9CLFlBQU0sQ0FBQyxJQUFJO0FBQ1gsV0FBSyxXQUFXLElBQUksS0FBSyxTQUFTLEdBQUc7QUFBQSxJQUN0QyxPQUFPO0FBQ04sVUFBSSxLQUFLLElBQUk7QUFBQSxJQUNkO0FBQUEsRUFDRDtBQUFBLEVBRVEscUJBQXFCLE1BQW9DO0FBQ2hFLFFBQUksQ0FBQyxLQUFLLFNBQVM7QUFDbEI7QUFBQSxJQUNEO0FBQ0EsVUFBTSxNQUFNLEtBQUssV0FBVyxJQUFJLEtBQUssT0FBTztBQUM1QyxRQUFJLE9BQU8sUUFBUSxhQUFhO0FBQy9CO0FBQUEsSUFDRDtBQUNBLGFBQVMsSUFBSSxHQUFHLE1BQU0sSUFBSSxRQUFRLElBQUksS0FBSyxLQUFLO0FBQy9DLFVBQUksSUFBSSxDQUFDLE1BQU0sTUFBTTtBQUNwQixZQUFJLE9BQU8sR0FBRyxDQUFDO0FBQ2Y7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUtBLE9BQWMsdUJBQXVCLEdBQTRDLEdBQXFEO0FBQ3JJLFFBQUksQ0FBQyxLQUFLLEVBQUUsU0FBUyxtQkFBbUIsTUFBTTtBQUM3QyxhQUFPO0FBQUEsSUFDUjtBQUNBLFFBQUksQ0FBQyxLQUFLLEVBQUUsU0FBUyxtQkFBbUIsTUFBTTtBQUM3QyxhQUFPO0FBQUEsSUFDUjtBQUVBLFdBQU8sUUFBUSxHQUFHLENBQUM7QUFBQSxFQUNwQjtBQUFBLEVBRU8sMEJBQWdEO0FBQ3RELFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQSxFQUVPLHdCQUEyRDtBQUNqRSxXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQUEsRUFFTyxpQkFBb0Q7QUFDMUQsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBLEVBRU8sa0JBQWtCLFdBQTZDO0FBQ3JFLFVBQU0sUUFBUSxLQUFLLFdBQVcsSUFBSSxTQUFTO0FBQzNDLFFBQUksT0FBTyxVQUFVLGVBQWUsTUFBTSxXQUFXLEdBQUc7QUFDdkQsYUFBTyxDQUFDO0FBQUEsSUFDVDtBQUdBLFVBQU0sU0FBbUMsQ0FBQztBQUMxQyxRQUFJLFlBQVk7QUFDaEIsYUFBUyxJQUFJLE1BQU0sU0FBUyxHQUFHLEtBQUssR0FBRyxLQUFLO0FBQzNDLGFBQU8sV0FBVyxJQUFJLE1BQU0sQ0FBQztBQUFBLElBQzlCO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVPLHdCQUF3QixXQUFtQixTQUE2QixzQkFBc0IsT0FBc0M7QUFDMUksVUFBTSxRQUFRLEtBQUssV0FBVyxJQUFJLFNBQVM7QUFDM0MsUUFBSSxPQUFPLFVBQVUsZUFBZSxNQUFNLFdBQVcsR0FBRztBQUN2RCxhQUFPO0FBQUEsSUFDUjtBQUNBLFFBQUksTUFBTSxXQUFXLEtBQUssQ0FBQyxxQkFBcUI7QUFDL0MsYUFBTyxNQUFNLENBQUM7QUFBQSxJQUNmO0FBRUEsYUFBUyxJQUFJLE1BQU0sU0FBUyxHQUFHLEtBQUssR0FBRyxLQUFLO0FBQzNDLFlBQU0sT0FBTyxNQUFNLENBQUM7QUFDcEIsVUFBSSxRQUFRLG9CQUFvQixLQUFLLElBQUksR0FBRztBQUMzQyxlQUFPO0FBQUEsTUFDUjtBQUFBLElBQ0Q7QUFFQSxRQUFJLHFCQUFxQjtBQUN4QixhQUFPO0FBQUEsSUFDUjtBQUVBLFdBQU8sTUFBTSxNQUFNLFNBQVMsQ0FBQztBQUFBLEVBQzlCO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFRTyxRQUFRLFNBQW1CLGVBQXlCLFVBQW9DO0FBRTlGLFVBQU0sZ0JBQWdCLENBQUMsR0FBRyxlQUFlLFFBQVE7QUFFakQsU0FBSyxLQUFLLGVBQWUsYUFBYSxFQUFFO0FBRXhDLFVBQU0sZUFBZSxLQUFLLEtBQUssSUFBSSxjQUFjLENBQUMsQ0FBQztBQUNuRCxRQUFJLGlCQUFpQixRQUFXO0FBRS9CLFdBQUssS0FBSywyQkFBMkI7QUFDckMsYUFBTztBQUFBLElBQ1I7QUFFQSxRQUFJLFlBQTZDO0FBRWpELFFBQUksY0FBYyxTQUFTLEdBQUc7QUFDN0Isa0JBQVk7QUFBQSxJQUNiLE9BQU87QUFFTixrQkFBWSxDQUFDO0FBQ2IsZUFBUyxJQUFJLEdBQUcsTUFBTSxhQUFhLFFBQVEsSUFBSSxLQUFLLEtBQUs7QUFFeEQsY0FBTSxZQUFZLGFBQWEsQ0FBQztBQUVoQyxZQUFJLGNBQWMsU0FBUyxVQUFVLE9BQU8sUUFBUTtBQUNuRDtBQUFBLFFBQ0Q7QUFFQSxZQUFJLGdCQUFnQjtBQUNwQixpQkFBU0EsS0FBSSxHQUFHQSxLQUFJLGNBQWMsUUFBUUEsTUFBSztBQUM5QyxjQUFJLFVBQVUsT0FBT0EsRUFBQyxNQUFNLGNBQWNBLEVBQUMsR0FBRztBQUM3Qyw0QkFBZ0I7QUFDaEI7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUNBLFlBQUksZUFBZTtBQUNsQixvQkFBVSxLQUFLLFNBQVM7QUFBQSxRQUN6QjtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBR0EsVUFBTSxTQUFTLEtBQUssYUFBYSxTQUFTLFNBQVM7QUFDbkQsUUFBSSxDQUFDLFFBQVE7QUFDWixXQUFLLEtBQUssV0FBVyxVQUFVLE1BQU0sMkRBQTJEO0FBQ2hHLGFBQU87QUFBQSxJQUNSO0FBR0EsUUFBSSxjQUFjLFNBQVMsT0FBTyxPQUFPLFFBQVE7QUFFaEQsV0FBSyxLQUFLLFdBQVcsVUFBVSxNQUFNLGlDQUFpQyxPQUFPLE9BQU8sU0FBUyxjQUFjLE1BQU0seUJBQXlCLHFCQUFxQixPQUFPLElBQUksQ0FBQyxhQUFhLHVCQUF1QixNQUFNLENBQUMsR0FBRztBQUN6TixhQUFPO0FBQUEsSUFDUjtBQUVBLFNBQUssS0FBSyxXQUFXLFVBQVUsTUFBTSxnQ0FBZ0MsT0FBTyxPQUFPLFdBQVcscUJBQXFCLE9BQU8sSUFBSSxDQUFDLGFBQWEsdUJBQXVCLE1BQU0sQ0FBQyxHQUFHO0FBRTdLLFdBQU8sUUFBUSxPQUFPLFNBQVMsT0FBTyxhQUFhLE9BQU8sTUFBTTtBQUFBLEVBQ2pFO0FBQUEsRUFFUSxhQUFhLFNBQW1CLFNBQWtFO0FBQ3pHLGFBQVMsSUFBSSxRQUFRLFNBQVMsR0FBRyxLQUFLLEdBQUcsS0FBSztBQUM3QyxZQUFNLElBQUksUUFBUSxDQUFDO0FBRW5CLFVBQUksQ0FBQyxtQkFBbUIscUJBQXFCLFNBQVMsRUFBRSxJQUFJLEdBQUc7QUFDOUQ7QUFBQSxNQUNEO0FBRUEsYUFBTztBQUFBLElBQ1I7QUFFQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsT0FBZSxxQkFBcUIsU0FBbUIsT0FBeUQ7QUFDL0csUUFBSSxDQUFDLE9BQU87QUFDWCxhQUFPO0FBQUEsSUFDUjtBQUNBLFdBQU8sTUFBTSxTQUFTLE9BQU87QUFBQSxFQUM5QjtBQUNEO0FBRUEsU0FBUyxxQkFBcUIsTUFBZ0Q7QUFDN0UsTUFBSSxDQUFDLE1BQU07QUFDVixXQUFPO0FBQUEsRUFDUjtBQUNBLFNBQU8sR0FBRyxLQUFLLFVBQVUsQ0FBQztBQUMzQjtBQUVBLFNBQVMsdUJBQXVCLElBQW9DO0FBQ25FLFNBQ0MsR0FBRyxjQUNDLEdBQUcscUJBQXFCLHNCQUFzQixHQUFHLFdBQVcsS0FBSyxrQkFBa0IsR0FBRyxXQUFXLEtBQ2pHLEdBQUcsWUFBWSxhQUFhO0FBRWxDOyIsCiAgIm5hbWVzIjogWyJSZXN1bHRLaW5kIiwgImkiXQp9Cg==
