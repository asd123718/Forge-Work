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
import { RunOnceScheduler } from "../../../../base/common/async.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { LRUCache } from "../../../../base/common/map.js";
import { TernarySearchTree } from "../../../../base/common/ternarySearchTree.js";
import { CompletionItemKinds } from "../../../common/languages.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { createDecorator } from "../../../../platform/instantiation/common/instantiation.js";
import { IStorageService, StorageScope, StorageTarget, WillSaveStateReason } from "../../../../platform/storage/common/storage.js";
class Memory {
  constructor(name) {
    this.name = name;
  }
  select(model, pos, items) {
    if (items.length === 0) {
      return 0;
    }
    const topScore = items[0].score[0];
    for (let i = 0; i < items.length; i++) {
      const { score, completion: suggestion } = items[i];
      if (score[0] !== topScore) {
        break;
      }
      if (suggestion.preselect) {
        return i;
      }
    }
    return 0;
  }
}
class NoMemory extends Memory {
  constructor() {
    super("first");
  }
  memorize(model, pos, item) {
  }
  toJSON() {
    return void 0;
  }
  fromJSON() {
  }
}
class LRUMemory extends Memory {
  constructor() {
    super("recentlyUsed");
    this._cache = new LRUCache(300, 0.66);
    this._seq = 0;
  }
  memorize(model, pos, item) {
    const key = `${model.getLanguageId()}/${item.textLabel}`;
    this._cache.set(key, {
      touch: this._seq++,
      type: item.completion.kind,
      insertText: item.completion.insertText
    });
  }
  select(model, pos, items) {
    if (items.length === 0) {
      return 0;
    }
    const lineSuffix = model.getLineContent(pos.lineNumber).substr(pos.column - 10, pos.column - 1);
    if (/\s$/.test(lineSuffix)) {
      return super.select(model, pos, items);
    }
    const topScore = items[0].score[0];
    let indexPreselect = -1;
    let indexRecency = -1;
    let seq = -1;
    for (let i = 0; i < items.length; i++) {
      if (items[i].score[0] !== topScore) {
        break;
      }
      const key = `${model.getLanguageId()}/${items[i].textLabel}`;
      const item = this._cache.peek(key);
      if (item && item.touch > seq && item.type === items[i].completion.kind && item.insertText === items[i].completion.insertText) {
        seq = item.touch;
        indexRecency = i;
      }
      if (items[i].completion.preselect && indexPreselect === -1) {
        return indexPreselect = i;
      }
    }
    if (indexRecency !== -1) {
      return indexRecency;
    } else if (indexPreselect !== -1) {
      return indexPreselect;
    } else {
      return 0;
    }
  }
  toJSON() {
    return this._cache.toJSON();
  }
  fromJSON(data) {
    this._cache.clear();
    const seq = 0;
    for (const [key, value] of data) {
      value.touch = seq;
      value.type = typeof value.type === "number" ? value.type : CompletionItemKinds.fromString(value.type);
      this._cache.set(key, value);
    }
    this._seq = this._cache.size;
  }
}
class PrefixMemory extends Memory {
  constructor() {
    super("recentlyUsedByPrefix");
    this._trie = TernarySearchTree.forStrings();
    this._seq = 0;
  }
  memorize(model, pos, item) {
    const { word } = model.getWordUntilPosition(pos);
    const key = `${model.getLanguageId()}/${word}`;
    this._trie.set(key, {
      type: item.completion.kind,
      insertText: item.completion.insertText,
      touch: this._seq++
    });
  }
  select(model, pos, items) {
    const { word } = model.getWordUntilPosition(pos);
    if (!word) {
      return super.select(model, pos, items);
    }
    const key = `${model.getLanguageId()}/${word}`;
    let item = this._trie.get(key);
    if (!item) {
      item = this._trie.findSubstr(key);
    }
    if (item) {
      for (let i = 0; i < items.length; i++) {
        const { kind, insertText } = items[i].completion;
        if (kind === item.type && insertText === item.insertText) {
          return i;
        }
      }
    }
    return super.select(model, pos, items);
  }
  toJSON() {
    const entries = [];
    this._trie.forEach((value, key) => entries.push([key, value]));
    entries.sort((a, b) => -(a[1].touch - b[1].touch)).forEach((value, i) => value[1].touch = i);
    return entries.slice(0, 200);
  }
  fromJSON(data) {
    this._trie.clear();
    if (data.length > 0) {
      this._seq = data[0][1].touch + 1;
      for (const [key, value] of data) {
        value.type = typeof value.type === "number" ? value.type : CompletionItemKinds.fromString(value.type);
        this._trie.set(key, value);
      }
    }
  }
}
let SuggestMemoryService = class {
  constructor(_storageService, _configService) {
    this._storageService = _storageService;
    this._configService = _configService;
    this._disposables = new DisposableStore();
    this._persistSoon = new RunOnceScheduler(() => this._saveState(), 500);
    this._disposables.add(_storageService.onWillSaveState((e) => {
      if (e.reason === WillSaveStateReason.SHUTDOWN) {
        this._saveState();
      }
    }));
  }
  dispose() {
    this._disposables.dispose();
    this._persistSoon.dispose();
  }
  memorize(model, pos, item) {
    this._withStrategy(model, pos).memorize(model, pos, item);
    this._persistSoon.schedule();
  }
  select(model, pos, items) {
    return this._withStrategy(model, pos).select(model, pos, items);
  }
  _withStrategy(model, pos) {
    const mode = this._configService.getValue("editor.suggestSelection", {
      overrideIdentifier: model.getLanguageIdAtPosition(pos.lineNumber, pos.column),
      resource: model.uri
    });
    if (this._strategy?.name !== mode) {
      this._saveState();
      const ctor = SuggestMemoryService._strategyCtors.get(mode) || NoMemory;
      this._strategy = new ctor();
      try {
        const share = this._configService.getValue("editor.suggest.shareSuggestSelections");
        const scope = share ? StorageScope.PROFILE : StorageScope.WORKSPACE;
        const raw = this._storageService.get(`${SuggestMemoryService._storagePrefix}/${mode}`, scope);
        if (raw) {
          this._strategy.fromJSON(JSON.parse(raw));
        }
      } catch (e) {
      }
    }
    return this._strategy;
  }
  _saveState() {
    if (this._strategy) {
      const share = this._configService.getValue("editor.suggest.shareSuggestSelections");
      const scope = share ? StorageScope.PROFILE : StorageScope.WORKSPACE;
      const raw = JSON.stringify(this._strategy);
      this._storageService.store(`${SuggestMemoryService._storagePrefix}/${this._strategy.name}`, raw, scope, StorageTarget.MACHINE);
    }
  }
};
SuggestMemoryService._strategyCtors = /* @__PURE__ */ new Map([
  ["recentlyUsedByPrefix", PrefixMemory],
  ["recentlyUsed", LRUMemory],
  ["first", NoMemory]
]);
SuggestMemoryService._storagePrefix = "suggest/memories";
SuggestMemoryService = __decorateClass([
  __decorateParam(0, IStorageService),
  __decorateParam(1, IConfigurationService)
], SuggestMemoryService);
const ISuggestMemoryService = createDecorator("ISuggestMemories");
registerSingleton(ISuggestMemoryService, SuggestMemoryService, InstantiationType.Delayed);
export {
  ISuggestMemoryService,
  LRUMemory,
  Memory,
  NoMemory,
  PrefixMemory,
  SuggestMemoryService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXHN1Z2dlc3RcXGJyb3dzZXJcXHN1Z2dlc3RNZW1vcnkudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5cbmltcG9ydCB7IFJ1bk9uY2VTY2hlZHVsZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgTFJVQ2FjaGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXAuanMnO1xuaW1wb3J0IHsgVGVybmFyeVNlYXJjaFRyZWUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90ZXJuYXJ5U2VhcmNoVHJlZS5qcyc7XG5pbXBvcnQgeyBJUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IENvbXBsZXRpb25JdGVtS2luZCwgQ29tcGxldGlvbkl0ZW1LaW5kcyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0IHsgQ29tcGxldGlvbkl0ZW0gfSBmcm9tICcuL3N1Z2dlc3QuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJbnN0YW50aWF0aW9uVHlwZSwgcmVnaXN0ZXJTaW5nbGV0b24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IGNyZWF0ZURlY29yYXRvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQsIFdpbGxTYXZlU3RhdGVSZWFzb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcblxuZXhwb3J0IGFic3RyYWN0IGNsYXNzIE1lbW9yeSB7XG5cblx0Y29uc3RydWN0b3IocmVhZG9ubHkgbmFtZTogTWVtTW9kZSkgeyB9XG5cblx0c2VsZWN0KG1vZGVsOiBJVGV4dE1vZGVsLCBwb3M6IElQb3NpdGlvbiwgaXRlbXM6IENvbXBsZXRpb25JdGVtW10pOiBudW1iZXIge1xuXHRcdGlmIChpdGVtcy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiAwO1xuXHRcdH1cblx0XHRjb25zdCB0b3BTY29yZSA9IGl0ZW1zWzBdLnNjb3JlWzBdO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgaXRlbXMubGVuZ3RoOyBpKyspIHtcblx0XHRcdGNvbnN0IHsgc2NvcmUsIGNvbXBsZXRpb246IHN1Z2dlc3Rpb24gfSA9IGl0ZW1zW2ldO1xuXHRcdFx0aWYgKHNjb3JlWzBdICE9PSB0b3BTY29yZSkge1xuXHRcdFx0XHQvLyBzdG9wIHdoZW4gbGVhdmluZyB0aGUgZ3JvdXAgb2YgdG9wIG1hdGNoZXNcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRpZiAoc3VnZ2VzdGlvbi5wcmVzZWxlY3QpIHtcblx0XHRcdFx0Ly8gc3RvcCB3aGVuIHNlZWluZyBhbiBhdXRvLXNlbGVjdC1pdGVtXG5cdFx0XHRcdHJldHVybiBpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gMDtcblx0fVxuXG5cdGFic3RyYWN0IG1lbW9yaXplKG1vZGVsOiBJVGV4dE1vZGVsLCBwb3M6IElQb3NpdGlvbiwgaXRlbTogQ29tcGxldGlvbkl0ZW0pOiB2b2lkO1xuXG5cdGFic3RyYWN0IHRvSlNPTigpOiBvYmplY3QgfCB1bmRlZmluZWQ7XG5cblx0YWJzdHJhY3QgZnJvbUpTT04oZGF0YTogb2JqZWN0KTogdm9pZDtcbn1cblxuZXhwb3J0IGNsYXNzIE5vTWVtb3J5IGV4dGVuZHMgTWVtb3J5IHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcignZmlyc3QnKTtcblx0fVxuXG5cdG1lbW9yaXplKG1vZGVsOiBJVGV4dE1vZGVsLCBwb3M6IElQb3NpdGlvbiwgaXRlbTogQ29tcGxldGlvbkl0ZW0pOiB2b2lkIHtcblx0XHQvLyBuby1vcFxuXHR9XG5cblx0dG9KU09OKCkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRmcm9tSlNPTigpIHtcblx0XHQvL1xuXHR9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgTWVtSXRlbSB7XG5cdHR5cGU6IHN0cmluZyB8IENvbXBsZXRpb25JdGVtS2luZDtcblx0aW5zZXJ0VGV4dDogc3RyaW5nO1xuXHR0b3VjaDogbnVtYmVyO1xufVxuXG5leHBvcnQgY2xhc3MgTFJVTWVtb3J5IGV4dGVuZHMgTWVtb3J5IHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcigncmVjZW50bHlVc2VkJyk7XG5cdH1cblxuXHRwcml2YXRlIF9jYWNoZSA9IG5ldyBMUlVDYWNoZTxzdHJpbmcsIE1lbUl0ZW0+KDMwMCwgMC42Nik7XG5cdHByaXZhdGUgX3NlcSA9IDA7XG5cblx0bWVtb3JpemUobW9kZWw6IElUZXh0TW9kZWwsIHBvczogSVBvc2l0aW9uLCBpdGVtOiBDb21wbGV0aW9uSXRlbSk6IHZvaWQge1xuXHRcdGNvbnN0IGtleSA9IGAke21vZGVsLmdldExhbmd1YWdlSWQoKX0vJHtpdGVtLnRleHRMYWJlbH1gO1xuXHRcdHRoaXMuX2NhY2hlLnNldChrZXksIHtcblx0XHRcdHRvdWNoOiB0aGlzLl9zZXErKyxcblx0XHRcdHR5cGU6IGl0ZW0uY29tcGxldGlvbi5raW5kLFxuXHRcdFx0aW5zZXJ0VGV4dDogaXRlbS5jb21wbGV0aW9uLmluc2VydFRleHRcblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIHNlbGVjdChtb2RlbDogSVRleHRNb2RlbCwgcG9zOiBJUG9zaXRpb24sIGl0ZW1zOiBDb21wbGV0aW9uSXRlbVtdKTogbnVtYmVyIHtcblxuXHRcdGlmIChpdGVtcy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiAwO1xuXHRcdH1cblxuXHRcdGNvbnN0IGxpbmVTdWZmaXggPSBtb2RlbC5nZXRMaW5lQ29udGVudChwb3MubGluZU51bWJlcikuc3Vic3RyKHBvcy5jb2x1bW4gLSAxMCwgcG9zLmNvbHVtbiAtIDEpO1xuXHRcdGlmICgvXFxzJC8udGVzdChsaW5lU3VmZml4KSkge1xuXHRcdFx0cmV0dXJuIHN1cGVyLnNlbGVjdChtb2RlbCwgcG9zLCBpdGVtcyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdG9wU2NvcmUgPSBpdGVtc1swXS5zY29yZVswXTtcblx0XHRsZXQgaW5kZXhQcmVzZWxlY3QgPSAtMTtcblx0XHRsZXQgaW5kZXhSZWNlbmN5ID0gLTE7XG5cdFx0bGV0IHNlcSA9IC0xO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgaXRlbXMubGVuZ3RoOyBpKyspIHtcblx0XHRcdGlmIChpdGVtc1tpXS5zY29yZVswXSAhPT0gdG9wU2NvcmUpIHtcblx0XHRcdFx0Ly8gY29uc2lkZXIgb25seSB0b3AgaXRlbXNcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBrZXkgPSBgJHttb2RlbC5nZXRMYW5ndWFnZUlkKCl9LyR7aXRlbXNbaV0udGV4dExhYmVsfWA7XG5cdFx0XHRjb25zdCBpdGVtID0gdGhpcy5fY2FjaGUucGVlayhrZXkpO1xuXHRcdFx0aWYgKGl0ZW0gJiYgaXRlbS50b3VjaCA+IHNlcSAmJiBpdGVtLnR5cGUgPT09IGl0ZW1zW2ldLmNvbXBsZXRpb24ua2luZCAmJiBpdGVtLmluc2VydFRleHQgPT09IGl0ZW1zW2ldLmNvbXBsZXRpb24uaW5zZXJ0VGV4dCkge1xuXHRcdFx0XHRzZXEgPSBpdGVtLnRvdWNoO1xuXHRcdFx0XHRpbmRleFJlY2VuY3kgPSBpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGl0ZW1zW2ldLmNvbXBsZXRpb24ucHJlc2VsZWN0ICYmIGluZGV4UHJlc2VsZWN0ID09PSAtMSkge1xuXHRcdFx0XHQvLyBzdG9wIHdoZW4gc2VlaW5nIGFuIGF1dG8tc2VsZWN0LWl0ZW1cblx0XHRcdFx0cmV0dXJuIGluZGV4UHJlc2VsZWN0ID0gaTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKGluZGV4UmVjZW5jeSAhPT0gLTEpIHtcblx0XHRcdHJldHVybiBpbmRleFJlY2VuY3k7XG5cdFx0fSBlbHNlIGlmIChpbmRleFByZXNlbGVjdCAhPT0gLTEpIHtcblx0XHRcdHJldHVybiBpbmRleFByZXNlbGVjdDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIDA7XG5cdFx0fVxuXHR9XG5cblx0dG9KU09OKCk6IG9iamVjdCB7XG5cdFx0cmV0dXJuIHRoaXMuX2NhY2hlLnRvSlNPTigpO1xuXHR9XG5cblx0ZnJvbUpTT04oZGF0YTogW3N0cmluZywgTWVtSXRlbV1bXSk6IHZvaWQge1xuXHRcdHRoaXMuX2NhY2hlLmNsZWFyKCk7XG5cdFx0Y29uc3Qgc2VxID0gMDtcblx0XHRmb3IgKGNvbnN0IFtrZXksIHZhbHVlXSBvZiBkYXRhKSB7XG5cdFx0XHR2YWx1ZS50b3VjaCA9IHNlcTtcblx0XHRcdHZhbHVlLnR5cGUgPSB0eXBlb2YgdmFsdWUudHlwZSA9PT0gJ251bWJlcicgPyB2YWx1ZS50eXBlIDogQ29tcGxldGlvbkl0ZW1LaW5kcy5mcm9tU3RyaW5nKHZhbHVlLnR5cGUpO1xuXHRcdFx0dGhpcy5fY2FjaGUuc2V0KGtleSwgdmFsdWUpO1xuXHRcdH1cblx0XHR0aGlzLl9zZXEgPSB0aGlzLl9jYWNoZS5zaXplO1xuXHR9XG59XG5cblxuZXhwb3J0IGNsYXNzIFByZWZpeE1lbW9yeSBleHRlbmRzIE1lbW9yeSB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoJ3JlY2VudGx5VXNlZEJ5UHJlZml4Jyk7XG5cdH1cblxuXHRwcml2YXRlIF90cmllID0gVGVybmFyeVNlYXJjaFRyZWUuZm9yU3RyaW5nczxNZW1JdGVtPigpO1xuXHRwcml2YXRlIF9zZXEgPSAwO1xuXG5cdG1lbW9yaXplKG1vZGVsOiBJVGV4dE1vZGVsLCBwb3M6IElQb3NpdGlvbiwgaXRlbTogQ29tcGxldGlvbkl0ZW0pOiB2b2lkIHtcblx0XHRjb25zdCB7IHdvcmQgfSA9IG1vZGVsLmdldFdvcmRVbnRpbFBvc2l0aW9uKHBvcyk7XG5cdFx0Y29uc3Qga2V5ID0gYCR7bW9kZWwuZ2V0TGFuZ3VhZ2VJZCgpfS8ke3dvcmR9YDtcblx0XHR0aGlzLl90cmllLnNldChrZXksIHtcblx0XHRcdHR5cGU6IGl0ZW0uY29tcGxldGlvbi5raW5kLFxuXHRcdFx0aW5zZXJ0VGV4dDogaXRlbS5jb21wbGV0aW9uLmluc2VydFRleHQsXG5cdFx0XHR0b3VjaDogdGhpcy5fc2VxKytcblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIHNlbGVjdChtb2RlbDogSVRleHRNb2RlbCwgcG9zOiBJUG9zaXRpb24sIGl0ZW1zOiBDb21wbGV0aW9uSXRlbVtdKTogbnVtYmVyIHtcblx0XHRjb25zdCB7IHdvcmQgfSA9IG1vZGVsLmdldFdvcmRVbnRpbFBvc2l0aW9uKHBvcyk7XG5cdFx0aWYgKCF3b3JkKSB7XG5cdFx0XHRyZXR1cm4gc3VwZXIuc2VsZWN0KG1vZGVsLCBwb3MsIGl0ZW1zKTtcblx0XHR9XG5cdFx0Y29uc3Qga2V5ID0gYCR7bW9kZWwuZ2V0TGFuZ3VhZ2VJZCgpfS8ke3dvcmR9YDtcblx0XHRsZXQgaXRlbSA9IHRoaXMuX3RyaWUuZ2V0KGtleSk7XG5cdFx0aWYgKCFpdGVtKSB7XG5cdFx0XHRpdGVtID0gdGhpcy5fdHJpZS5maW5kU3Vic3RyKGtleSk7XG5cdFx0fVxuXHRcdGlmIChpdGVtKSB7XG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGl0ZW1zLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdGNvbnN0IHsga2luZCwgaW5zZXJ0VGV4dCB9ID0gaXRlbXNbaV0uY29tcGxldGlvbjtcblx0XHRcdFx0aWYgKGtpbmQgPT09IGl0ZW0udHlwZSAmJiBpbnNlcnRUZXh0ID09PSBpdGVtLmluc2VydFRleHQpIHtcblx0XHRcdFx0XHRyZXR1cm4gaTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gc3VwZXIuc2VsZWN0KG1vZGVsLCBwb3MsIGl0ZW1zKTtcblx0fVxuXG5cdHRvSlNPTigpOiBvYmplY3Qge1xuXG5cdFx0Y29uc3QgZW50cmllczogW3N0cmluZywgTWVtSXRlbV1bXSA9IFtdO1xuXHRcdHRoaXMuX3RyaWUuZm9yRWFjaCgodmFsdWUsIGtleSkgPT4gZW50cmllcy5wdXNoKFtrZXksIHZhbHVlXSkpO1xuXG5cdFx0Ly8gc29ydCBieSBsYXN0IHJlY2VudGx5IHVzZWQgKHRvdWNoKSwgdGhlblxuXHRcdC8vIHRha2UgdGhlIHRvcCAyMDAgaXRlbSBhbmQgbm9ybWFsaXplIHRoZWlyXG5cdFx0Ly8gdG91Y2hcblx0XHRlbnRyaWVzXG5cdFx0XHQuc29ydCgoYSwgYikgPT4gLShhWzFdLnRvdWNoIC0gYlsxXS50b3VjaCkpXG5cdFx0XHQuZm9yRWFjaCgodmFsdWUsIGkpID0+IHZhbHVlWzFdLnRvdWNoID0gaSk7XG5cblx0XHRyZXR1cm4gZW50cmllcy5zbGljZSgwLCAyMDApO1xuXHR9XG5cblx0ZnJvbUpTT04oZGF0YTogW3N0cmluZywgTWVtSXRlbV1bXSk6IHZvaWQge1xuXHRcdHRoaXMuX3RyaWUuY2xlYXIoKTtcblx0XHRpZiAoZGF0YS5sZW5ndGggPiAwKSB7XG5cdFx0XHR0aGlzLl9zZXEgPSBkYXRhWzBdWzFdLnRvdWNoICsgMTtcblx0XHRcdGZvciAoY29uc3QgW2tleSwgdmFsdWVdIG9mIGRhdGEpIHtcblx0XHRcdFx0dmFsdWUudHlwZSA9IHR5cGVvZiB2YWx1ZS50eXBlID09PSAnbnVtYmVyJyA/IHZhbHVlLnR5cGUgOiBDb21wbGV0aW9uSXRlbUtpbmRzLmZyb21TdHJpbmcodmFsdWUudHlwZSk7XG5cdFx0XHRcdHRoaXMuX3RyaWUuc2V0KGtleSwgdmFsdWUpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgdHlwZSBNZW1Nb2RlID0gJ2ZpcnN0JyB8ICdyZWNlbnRseVVzZWQnIHwgJ3JlY2VudGx5VXNlZEJ5UHJlZml4JztcblxuZXhwb3J0IGNsYXNzIFN1Z2dlc3RNZW1vcnlTZXJ2aWNlIGltcGxlbWVudHMgSVN1Z2dlc3RNZW1vcnlTZXJ2aWNlIHtcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBfc3RyYXRlZ3lDdG9ycyA9IG5ldyBNYXA8TWVtTW9kZSwgeyBuZXcoKTogTWVtb3J5IH0+KFtcblx0XHRbJ3JlY2VudGx5VXNlZEJ5UHJlZml4JywgUHJlZml4TWVtb3J5XSxcblx0XHRbJ3JlY2VudGx5VXNlZCcsIExSVU1lbW9yeV0sXG5cdFx0WydmaXJzdCcsIE5vTWVtb3J5XVxuXHRdKTtcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBfc3RvcmFnZVByZWZpeCA9ICdzdWdnZXN0L21lbW9yaWVzJztcblxuXHRyZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9wZXJzaXN0U29vbjogUnVuT25jZVNjaGVkdWxlcjtcblx0cHJpdmF0ZSByZWFkb25seSBfZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0cHJpdmF0ZSBfc3RyYXRlZ3k/OiBNZW1vcnk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9zdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29uZmlnU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHR0aGlzLl9wZXJzaXN0U29vbiA9IG5ldyBSdW5PbmNlU2NoZWR1bGVyKCgpID0+IHRoaXMuX3NhdmVTdGF0ZSgpLCA1MDApO1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZChfc3RvcmFnZVNlcnZpY2Uub25XaWxsU2F2ZVN0YXRlKGUgPT4ge1xuXHRcdFx0aWYgKGUucmVhc29uID09PSBXaWxsU2F2ZVN0YXRlUmVhc29uLlNIVVRET1dOKSB7XG5cdFx0XHRcdHRoaXMuX3NhdmVTdGF0ZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX3BlcnNpc3RTb29uLmRpc3Bvc2UoKTtcblx0fVxuXG5cdG1lbW9yaXplKG1vZGVsOiBJVGV4dE1vZGVsLCBwb3M6IElQb3NpdGlvbiwgaXRlbTogQ29tcGxldGlvbkl0ZW0pOiB2b2lkIHtcblx0XHR0aGlzLl93aXRoU3RyYXRlZ3kobW9kZWwsIHBvcykubWVtb3JpemUobW9kZWwsIHBvcywgaXRlbSk7XG5cdFx0dGhpcy5fcGVyc2lzdFNvb24uc2NoZWR1bGUoKTtcblx0fVxuXG5cdHNlbGVjdChtb2RlbDogSVRleHRNb2RlbCwgcG9zOiBJUG9zaXRpb24sIGl0ZW1zOiBDb21wbGV0aW9uSXRlbVtdKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5fd2l0aFN0cmF0ZWd5KG1vZGVsLCBwb3MpLnNlbGVjdChtb2RlbCwgcG9zLCBpdGVtcyk7XG5cdH1cblxuXHRwcml2YXRlIF93aXRoU3RyYXRlZ3kobW9kZWw6IElUZXh0TW9kZWwsIHBvczogSVBvc2l0aW9uKTogTWVtb3J5IHtcblxuXHRcdGNvbnN0IG1vZGUgPSB0aGlzLl9jb25maWdTZXJ2aWNlLmdldFZhbHVlPE1lbU1vZGU+KCdlZGl0b3Iuc3VnZ2VzdFNlbGVjdGlvbicsIHtcblx0XHRcdG92ZXJyaWRlSWRlbnRpZmllcjogbW9kZWwuZ2V0TGFuZ3VhZ2VJZEF0UG9zaXRpb24ocG9zLmxpbmVOdW1iZXIsIHBvcy5jb2x1bW4pLFxuXHRcdFx0cmVzb3VyY2U6IG1vZGVsLnVyaVxuXHRcdH0pO1xuXG5cdFx0aWYgKHRoaXMuX3N0cmF0ZWd5Py5uYW1lICE9PSBtb2RlKSB7XG5cblx0XHRcdHRoaXMuX3NhdmVTdGF0ZSgpO1xuXHRcdFx0Y29uc3QgY3RvciA9IFN1Z2dlc3RNZW1vcnlTZXJ2aWNlLl9zdHJhdGVneUN0b3JzLmdldChtb2RlKSB8fCBOb01lbW9yeTtcblx0XHRcdHRoaXMuX3N0cmF0ZWd5ID0gbmV3IGN0b3IoKTtcblxuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3Qgc2hhcmUgPSB0aGlzLl9jb25maWdTZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KCdlZGl0b3Iuc3VnZ2VzdC5zaGFyZVN1Z2dlc3RTZWxlY3Rpb25zJyk7XG5cdFx0XHRcdGNvbnN0IHNjb3BlID0gc2hhcmUgPyBTdG9yYWdlU2NvcGUuUFJPRklMRSA6IFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0U7XG5cdFx0XHRcdGNvbnN0IHJhdyA9IHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLmdldChgJHtTdWdnZXN0TWVtb3J5U2VydmljZS5fc3RvcmFnZVByZWZpeH0vJHttb2RlfWAsIHNjb3BlKTtcblx0XHRcdFx0aWYgKHJhdykge1xuXHRcdFx0XHRcdHRoaXMuX3N0cmF0ZWd5LmZyb21KU09OKEpTT04ucGFyc2UocmF3KSk7XG5cdFx0XHRcdH1cblx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0Ly8gdGhpbmdzIGNhbiBnbyB3cm9uZyB3aXRoIEpTT04uLi5cblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5fc3RyYXRlZ3k7XG5cdH1cblxuXHRwcml2YXRlIF9zYXZlU3RhdGUoKSB7XG5cdFx0aWYgKHRoaXMuX3N0cmF0ZWd5KSB7XG5cdFx0XHRjb25zdCBzaGFyZSA9IHRoaXMuX2NvbmZpZ1NlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oJ2VkaXRvci5zdWdnZXN0LnNoYXJlU3VnZ2VzdFNlbGVjdGlvbnMnKTtcblx0XHRcdGNvbnN0IHNjb3BlID0gc2hhcmUgPyBTdG9yYWdlU2NvcGUuUFJPRklMRSA6IFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0U7XG5cdFx0XHRjb25zdCByYXcgPSBKU09OLnN0cmluZ2lmeSh0aGlzLl9zdHJhdGVneSk7XG5cdFx0XHR0aGlzLl9zdG9yYWdlU2VydmljZS5zdG9yZShgJHtTdWdnZXN0TWVtb3J5U2VydmljZS5fc3RvcmFnZVByZWZpeH0vJHt0aGlzLl9zdHJhdGVneS5uYW1lfWAsIHJhdywgc2NvcGUsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdFx0fVxuXHR9XG59XG5cblxuZXhwb3J0IGNvbnN0IElTdWdnZXN0TWVtb3J5U2VydmljZSA9IGNyZWF0ZURlY29yYXRvcjxJU3VnZ2VzdE1lbW9yeVNlcnZpY2U+KCdJU3VnZ2VzdE1lbW9yaWVzJyk7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVN1Z2dlc3RNZW1vcnlTZXJ2aWNlIHtcblx0cmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXHRtZW1vcml6ZShtb2RlbDogSVRleHRNb2RlbCwgcG9zOiBJUG9zaXRpb24sIGl0ZW06IENvbXBsZXRpb25JdGVtKTogdm9pZDtcblx0c2VsZWN0KG1vZGVsOiBJVGV4dE1vZGVsLCBwb3M6IElQb3NpdGlvbiwgaXRlbXM6IENvbXBsZXRpb25JdGVtW10pOiBudW1iZXI7XG59XG5cbnJlZ2lzdGVyU2luZ2xldG9uKElTdWdnZXN0TWVtb3J5U2VydmljZSwgU3VnZ2VzdE1lbW9yeVNlcnZpY2UsIEluc3RhbnRpYXRpb25UeXBlLkRlbGF5ZWQpO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFNQSxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHlCQUF5QjtBQUdsQyxTQUE2QiwyQkFBMkI7QUFFeEQsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxtQkFBbUIseUJBQXlCO0FBQ3JELFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsaUJBQWlCLGNBQWMsZUFBZSwyQkFBMkI7QUFFM0UsTUFBZSxPQUFPO0FBQUEsRUFFNUIsWUFBcUIsTUFBZTtBQUFmO0FBQUEsRUFBaUI7QUFBQSxFQUV0QyxPQUFPLE9BQW1CLEtBQWdCLE9BQWlDO0FBQzFFLFFBQUksTUFBTSxXQUFXLEdBQUc7QUFDdkIsYUFBTztBQUFBLElBQ1I7QUFDQSxVQUFNLFdBQVcsTUFBTSxDQUFDLEVBQUUsTUFBTSxDQUFDO0FBQ2pDLGFBQVMsSUFBSSxHQUFHLElBQUksTUFBTSxRQUFRLEtBQUs7QUFDdEMsWUFBTSxFQUFFLE9BQU8sWUFBWSxXQUFXLElBQUksTUFBTSxDQUFDO0FBQ2pELFVBQUksTUFBTSxDQUFDLE1BQU0sVUFBVTtBQUUxQjtBQUFBLE1BQ0Q7QUFDQSxVQUFJLFdBQVcsV0FBVztBQUV6QixlQUFPO0FBQUEsTUFDUjtBQUFBLElBQ0Q7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQU9EO0FBRU8sTUFBTSxpQkFBaUIsT0FBTztBQUFBLEVBRXBDLGNBQWM7QUFDYixVQUFNLE9BQU87QUFBQSxFQUNkO0FBQUEsRUFFQSxTQUFTLE9BQW1CLEtBQWdCLE1BQTRC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RWhFLFVBQU0sT0FBTyxLQUFLLGVBQWUsU0FBa0IsMkJBQTJCO0FBQUEsTUFDN0Usb0JBQW9CLE1BQU0sd0JBQXdCLElBQUksWUFBWSxJQUFJLE1BQU07QUFBQSxNQUM1RSxVQUFVLE1BQU07QUFBQSxJQUNqQixDQUFDO0FBRUQsUUFBSSxLQUFLLFdBQVcsU0FBUyxNQUFNO0FBRWxDLFdBQUssV0FBVztBQUNoQixZQUFNLE9BQU8scUJBQXFCLGVBQWUsSUFBSSxJQUFJLEtBQUs7QUFDOUQsV0FBSyxZQUFZLElBQUksS0FBSztBQUUxQixVQUFJO0FBQ0gsY0FBTSxRQUFRLEtBQUssZUFBZSxTQUFrQix1Q0FBdUM7QUFDM0YsY0FBTSxRQUFRLFFBQVEsYUFBYSxVQUFVLGFBQWE7QUFDMUQsY0FBTSxNQUFNLEtBQUssZ0JBQWdCLElBQUksR0FBRyxxQkFBcUIsY0FBYyxJQUFJLElBQUksSUFBSSxLQUFLO0FBQzVGLFlBQUksS0FBSztBQUNSLGVBQUssVUFBVSxTQUFTLEtBQUssTUFBTSxHQUFHLENBQUM7QUFBQSxRQUN4QztBQUFBLE1BQ0QsU0FBUyxHQUFHO0FBQUEsTUFFWjtBQUFBLElBQ0Q7QUFFQSxXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQUEsRUFFUSxhQUFhO0FBQ3BCLFFBQUksS0FBSyxXQUFXO0FBQ25CLFlBQU0sUUFBUSxLQUFLLGVBQWUsU0FBa0IsdUNBQXVDO0FBQzNGLFlBQU0sUUFBUSxRQUFRLGFBQWEsVUFBVSxhQUFhO0FBQzFELFlBQU0sTUFBTSxLQUFLLFVBQVUsS0FBSyxTQUFTO0FBQ3pDLFdBQUssZ0JBQWdCLE1BQU0sR0FBRyxxQkFBcUIsY0FBYyxJQUFJLEtBQUssVUFBVSxJQUFJLElBQUksS0FBSyxPQUFPLGNBQWMsT0FBTztBQUFBLElBQzlIO0FBQUEsRUFDRDtBQUNEO0FBaEZhLHFCQUVZLGlCQUFpQixvQkFBSSxJQUFnQztBQUFBLEVBQzVFLENBQUMsd0JBQXdCLFlBQVk7QUFBQSxFQUNyQyxDQUFDLGdCQUFnQixTQUFTO0FBQUEsRUFDMUIsQ0FBQyxTQUFTLFFBQVE7QUFDbkIsQ0FBQztBQU5XLHFCQVFZLGlCQUFpQjtBQVI3Qix1QkFBTjtBQUFBLEVBbUJKO0FBQUEsRUFDQTtBQUFBLEdBcEJVO0FBbUZOLE1BQU0sd0JBQXdCLGdCQUF1QyxrQkFBa0I7QUFROUYsa0JBQWtCLHVCQUF1QixzQkFBc0Isa0JBQWtCLE9BQU87IiwKICAibmFtZXMiOiBbXQp9Cg==
