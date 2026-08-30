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
import { splitGlobAware } from "../../../../base/common/glob.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { observableValue } from "../../../../base/common/observable.js";
import { createDecorator } from "../../../../platform/instantiation/common/instantiation.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { MutableObservableValue } from "./observableValue.js";
import { StoredValue } from "./storedValue.js";
import { namespaceTestTag } from "./testTypes.js";
const ITestExplorerFilterState = createDecorator("testingFilterState");
const tagRe = /!?@([^ ,:]+)/g;
const trimExtraWhitespace = (str) => str.replace(/\s\s+/g, " ").trim();
let TestExplorerFilterState = class extends Disposable {
  constructor(storageService) {
    super();
    this.focusEmitter = this._register(new Emitter());
    /**
     * Mapping of terms to whether they're included in the text.
     */
    this.termFilterState = {};
    /** @inheritdoc */
    this.globList = [];
    /** @inheritdoc */
    this.includeTags = /* @__PURE__ */ new Set();
    /** @inheritdoc */
    this.excludeTags = /* @__PURE__ */ new Set();
    /** @inheritdoc */
    this.text = this._register(new MutableObservableValue(""));
    this.reveal = observableValue("TestExplorerFilterState.reveal", void 0);
    this.onDidRequestInputFocus = this.focusEmitter.event;
    this.selectTestInExplorerEmitter = this._register(new Emitter());
    this.onDidSelectTestInExplorer = this.selectTestInExplorerEmitter.event;
    this.fuzzy = this._register(MutableObservableValue.stored(new StoredValue({
      key: "testHistoryFuzzy",
      scope: StorageScope.PROFILE,
      target: StorageTarget.USER
    }, storageService), false));
  }
  /** @inheritdoc */
  didSelectTestInExplorer(testId) {
    this.selectTestInExplorerEmitter.fire(testId);
  }
  /** @inheritdoc */
  focusInput() {
    this.focusEmitter.fire();
  }
  /** @inheritdoc */
  setText(text) {
    if (text === this.text.value) {
      return;
    }
    this.termFilterState = {};
    this.globList = [];
    this.includeTags.clear();
    this.excludeTags.clear();
    let globText = "";
    let lastIndex = 0;
    for (const match of text.matchAll(tagRe)) {
      let nextIndex = match.index + match[0].length;
      const tag = match[0];
      const isFilterTerm = allTestFilterTerms.includes(tag);
      if (isFilterTerm) {
        this.termFilterState[tag] = true;
      }
      let isTag = false;
      if (text[nextIndex] === ":") {
        isTag = true;
        nextIndex++;
        let delimiter = text[nextIndex];
        if (delimiter !== `"` && delimiter !== `'`) {
          delimiter = " ";
        } else {
          nextIndex++;
        }
        let tagId = "";
        while (nextIndex < text.length && text[nextIndex] !== delimiter) {
          if (text[nextIndex] === "\\") {
            tagId += text[nextIndex + 1];
            nextIndex += 2;
          } else {
            tagId += text[nextIndex];
            nextIndex++;
          }
        }
        if (match[0].startsWith("!")) {
          this.excludeTags.add(namespaceTestTag(match[1], tagId));
        } else {
          this.includeTags.add(namespaceTestTag(match[1], tagId));
        }
        nextIndex++;
      }
      if (!isFilterTerm && !isTag) {
        continue;
      }
      globText += text.slice(lastIndex, match.index);
      lastIndex = nextIndex;
    }
    globText += text.slice(lastIndex).trim();
    if (globText.length) {
      for (const filter of splitGlobAware(globText, ",").map((s) => s.trim()).filter((s) => !!s.length)) {
        if (filter.startsWith("!")) {
          this.globList.push({ include: false, text: filter.slice(1).toLowerCase() });
        } else {
          this.globList.push({ include: true, text: filter.toLowerCase() });
        }
      }
    }
    this.text.value = text;
  }
  /** @inheritdoc */
  isFilteringFor(term) {
    return !!this.termFilterState[term];
  }
  /** @inheritdoc */
  toggleFilteringFor(term, shouldFilter) {
    const text = this.text.value.trim();
    if (shouldFilter !== false && !this.termFilterState[term]) {
      this.setText(text ? `${text} ${term}` : term);
    } else if (shouldFilter !== true && this.termFilterState[term]) {
      this.setText(trimExtraWhitespace(text.replace(term, "")));
    }
  }
};
TestExplorerFilterState = __decorateClass([
  __decorateParam(0, IStorageService)
], TestExplorerFilterState);
var TestFilterTerm = /* @__PURE__ */ ((TestFilterTerm2) => {
  TestFilterTerm2["Failed"] = "@failed";
  TestFilterTerm2["Executed"] = "@executed";
  TestFilterTerm2["CurrentDoc"] = "@doc";
  TestFilterTerm2["OpenedFiles"] = "@openedFiles";
  TestFilterTerm2["Hidden"] = "@hidden";
  return TestFilterTerm2;
})(TestFilterTerm || {});
const allTestFilterTerms = [
  "@failed" /* Failed */,
  "@executed" /* Executed */,
  "@doc" /* CurrentDoc */,
  "@openedFiles" /* OpenedFiles */,
  "@hidden" /* Hidden */
];
export {
  ITestExplorerFilterState,
  TestExplorerFilterState,
  TestFilterTerm
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlc3RpbmdcXGNvbW1vblxcdGVzdEV4cGxvcmVyRmlsdGVyU3RhdGUudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBzcGxpdEdsb2JBd2FyZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2dsb2IuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJU2V0dGFibGVPYnNlcnZhYmxlLCBvYnNlcnZhYmxlVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IGNyZWF0ZURlY29yYXRvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElPYnNlcnZhYmxlVmFsdWUsIE11dGFibGVPYnNlcnZhYmxlVmFsdWUgfSBmcm9tICcuL29ic2VydmFibGVWYWx1ZS5qcyc7XG5pbXBvcnQgeyBTdG9yZWRWYWx1ZSB9IGZyb20gJy4vc3RvcmVkVmFsdWUuanMnO1xuaW1wb3J0IHsgbmFtZXNwYWNlVGVzdFRhZyB9IGZyb20gJy4vdGVzdFR5cGVzLmpzJztcblxuZXhwb3J0IGludGVyZmFjZSBJVGVzdEV4cGxvcmVyRmlsdGVyU3RhdGUge1xuXHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0LyoqIEN1cnJlbnQgZmlsdGVyIHRleHQgKi9cblx0cmVhZG9ubHkgdGV4dDogSU9ic2VydmFibGVWYWx1ZTxzdHJpbmc+O1xuXG5cdC8qKiBUZXN0IElEIHRoZSB1c2VyIHdhbnRzIHRvIHJldmVhbCBpbiB0aGUgZXhwbG9yZXIgKi9cblx0cmVhZG9ubHkgcmV2ZWFsOiBJU2V0dGFibGVPYnNlcnZhYmxlPHN0cmluZyB8IHVuZGVmaW5lZD47XG5cblx0LyoqIEEgdGVzdCB3YXMgc2VsZWN0ZWQgaW4gdGhlIGV4cGxvcmVyLiAqL1xuXHRyZWFkb25seSBvbkRpZFNlbGVjdFRlc3RJbkV4cGxvcmVyOiBFdmVudDxzdHJpbmcgfCB1bmRlZmluZWQ+O1xuXG5cdC8qKiBFdmVudCB0aGF0IGZpcmVzIHdoZW4ge0BsaW5rIGZvY3VzSW5wdXR9IGlzIGludm9rZWQuICovXG5cdHJlYWRvbmx5IG9uRGlkUmVxdWVzdElucHV0Rm9jdXM6IEV2ZW50PHZvaWQ+O1xuXG5cdC8qKlxuXHQgKiBHbG9iIGxpc3QgdG8gZmlsdGVyIGZvciBiYXNlZCBvbiB0aGUge0BsaW5rIHRleHR9XG5cdCAqL1xuXHRyZWFkb25seSBnbG9iTGlzdDogcmVhZG9ubHkgeyBpbmNsdWRlOiBib29sZWFuOyB0ZXh0OiBzdHJpbmcgfVtdO1xuXG5cdC8qKlxuXHQgKiBUaGUgdXNlciByZXF1ZXN0ZWQgdG8gZmlsdGVyIGluY2x1ZGluZyB0YWdzLlxuXHQgKi9cblx0cmVhZG9ubHkgaW5jbHVkZVRhZ3M6IFJlYWRvbmx5U2V0PHN0cmluZz47XG5cblx0LyoqXG5cdCAqIFRoZSB1c2VyIHJlcXVlc3RlZCB0byBmaWx0ZXIgZXhjbHVkaW5nIHRhZ3MuXG5cdCAqL1xuXHRyZWFkb25seSBleGNsdWRlVGFnczogUmVhZG9ubHlTZXQ8c3RyaW5nPjtcblxuXHQvKipcblx0ICogV2hldGhlciBmdXp6eSBzZWFyY2hpbmcgaXMgZW5hYmxlZC5cblx0ICovXG5cdHJlYWRvbmx5IGZ1enp5OiBNdXRhYmxlT2JzZXJ2YWJsZVZhbHVlPGJvb2xlYW4+O1xuXG5cdC8qKlxuXHQgKiBGb2N1c2VzIHRoZSBmaWx0ZXIgaW5wdXQgaW4gdGhlIHRlc3QgZXhwbG9yZXIgdmlldy5cblx0ICovXG5cdGZvY3VzSW5wdXQoKTogdm9pZDtcblxuXHQvKipcblx0ICogUmVwbGFjZXMgdGhlIGZpbHRlciB7QGxpbmsgdGV4dH0uXG5cdCAqL1xuXHRzZXRUZXh0KHRleHQ6IHN0cmluZyk6IHZvaWQ7XG5cblx0LyoqXG5cdCAqIFNldHMgd2hldGhlciB0aGUge0BsaW5rIHRleHR9IGlzIGZpbHRlcmluZyBmb3IgYSBzcGVjaWFsIHRlcm0uXG5cdCAqL1xuXHRpc0ZpbHRlcmluZ0Zvcih0ZXJtOiBUZXN0RmlsdGVyVGVybSk6IGJvb2xlYW47XG5cblx0LyoqXG5cdCAqIFNldHMgd2hldGhlciB0aGUge0BsaW5rIHRleHR9IGluY2x1ZGVzIGEgc3BlY2lhbCBmaWx0ZXIgdGVybS5cblx0ICovXG5cdHRvZ2dsZUZpbHRlcmluZ0Zvcih0ZXJtOiBUZXN0RmlsdGVyVGVybSwgc2hvdWxkRmlsdGVyPzogYm9vbGVhbik6IHZvaWQ7XG5cblx0LyoqXG5cdCAqIENhbGxlZCB3aGVuIGEgdGVzdCBpbiB0aGUgdGVzdCBleHBsb3JlciBpcyBzZWxlY3RlZC5cblx0ICovXG5cdGRpZFNlbGVjdFRlc3RJbkV4cGxvcmVyKHRlc3RJZDogc3RyaW5nKTogdm9pZDtcbn1cblxuZXhwb3J0IGNvbnN0IElUZXN0RXhwbG9yZXJGaWx0ZXJTdGF0ZSA9IGNyZWF0ZURlY29yYXRvcjxJVGVzdEV4cGxvcmVyRmlsdGVyU3RhdGU+KCd0ZXN0aW5nRmlsdGVyU3RhdGUnKTtcblxuY29uc3QgdGFnUmUgPSAvIT9AKFteICw6XSspL2c7XG5jb25zdCB0cmltRXh0cmFXaGl0ZXNwYWNlID0gKHN0cjogc3RyaW5nKSA9PiBzdHIucmVwbGFjZSgvXFxzXFxzKy9nLCAnICcpLnRyaW0oKTtcblxuZXhwb3J0IGNsYXNzIFRlc3RFeHBsb3JlckZpbHRlclN0YXRlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElUZXN0RXhwbG9yZXJGaWx0ZXJTdGF0ZSB7XG5cdGRlY2xhcmUgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IGZvY3VzRW1pdHRlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHQvKipcblx0ICogTWFwcGluZyBvZiB0ZXJtcyB0byB3aGV0aGVyIHRoZXkncmUgaW5jbHVkZWQgaW4gdGhlIHRleHQuXG5cdCAqL1xuXHRwcml2YXRlIHRlcm1GaWx0ZXJTdGF0ZTogeyBbSyBpbiBUZXN0RmlsdGVyVGVybV0/OiB0cnVlIH0gPSB7fTtcblxuXHQvKiogQGluaGVyaXRkb2MgKi9cblx0cHVibGljIGdsb2JMaXN0OiB7IGluY2x1ZGU6IGJvb2xlYW47IHRleHQ6IHN0cmluZyB9W10gPSBbXTtcblxuXHQvKiogQGluaGVyaXRkb2MgKi9cblx0cHVibGljIGluY2x1ZGVUYWdzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cblx0LyoqIEBpbmhlcml0ZG9jICovXG5cdHB1YmxpYyBleGNsdWRlVGFncyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXG5cdC8qKiBAaW5oZXJpdGRvYyAqL1xuXHRwdWJsaWMgcmVhZG9ubHkgdGV4dCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlT2JzZXJ2YWJsZVZhbHVlKCcnKSk7XG5cblx0LyoqIEBpbmhlcml0ZG9jICovXG5cdHB1YmxpYyByZWFkb25seSBmdXp6eTogTXV0YWJsZU9ic2VydmFibGVWYWx1ZTxib29sZWFuPjtcblxuXHRwdWJsaWMgcmVhZG9ubHkgcmV2ZWFsOiBJU2V0dGFibGVPYnNlcnZhYmxlPHN0cmluZyB8IHVuZGVmaW5lZD4gPSBvYnNlcnZhYmxlVmFsdWUoJ1Rlc3RFeHBsb3JlckZpbHRlclN0YXRlLnJldmVhbCcsIHVuZGVmaW5lZCk7XG5cblx0cHVibGljIHJlYWRvbmx5IG9uRGlkUmVxdWVzdElucHV0Rm9jdXMgPSB0aGlzLmZvY3VzRW1pdHRlci5ldmVudDtcblxuXHRwcml2YXRlIHNlbGVjdFRlc3RJbkV4cGxvcmVyRW1pdHRlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHN0cmluZyB8IHVuZGVmaW5lZD4oKSk7XG5cdHB1YmxpYyByZWFkb25seSBvbkRpZFNlbGVjdFRlc3RJbkV4cGxvcmVyID0gdGhpcy5zZWxlY3RUZXN0SW5FeHBsb3JlckVtaXR0ZXIuZXZlbnQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElTdG9yYWdlU2VydmljZSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuZnV6enkgPSB0aGlzLl9yZWdpc3RlcihNdXRhYmxlT2JzZXJ2YWJsZVZhbHVlLnN0b3JlZChuZXcgU3RvcmVkVmFsdWU8Ym9vbGVhbj4oe1xuXHRcdFx0a2V5OiAndGVzdEhpc3RvcnlGdXp6eScsXG5cdFx0XHRzY29wZTogU3RvcmFnZVNjb3BlLlBST0ZJTEUsXG5cdFx0XHR0YXJnZXQ6IFN0b3JhZ2VUYXJnZXQuVVNFUixcblx0XHR9LCBzdG9yYWdlU2VydmljZSksIGZhbHNlKSk7XG5cdH1cblxuXHQvKiogQGluaGVyaXRkb2MgKi9cblx0cHVibGljIGRpZFNlbGVjdFRlc3RJbkV4cGxvcmVyKHRlc3RJZDogc3RyaW5nKSB7XG5cdFx0dGhpcy5zZWxlY3RUZXN0SW5FeHBsb3JlckVtaXR0ZXIuZmlyZSh0ZXN0SWQpO1xuXHR9XG5cblx0LyoqIEBpbmhlcml0ZG9jICovXG5cdHB1YmxpYyBmb2N1c0lucHV0KCkge1xuXHRcdHRoaXMuZm9jdXNFbWl0dGVyLmZpcmUoKTtcblx0fVxuXG5cdC8qKiBAaW5oZXJpdGRvYyAqL1xuXHRwdWJsaWMgc2V0VGV4dCh0ZXh0OiBzdHJpbmcpIHtcblx0XHRpZiAodGV4dCA9PT0gdGhpcy50ZXh0LnZhbHVlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy50ZXJtRmlsdGVyU3RhdGUgPSB7fTtcblx0XHR0aGlzLmdsb2JMaXN0ID0gW107XG5cdFx0dGhpcy5pbmNsdWRlVGFncy5jbGVhcigpO1xuXHRcdHRoaXMuZXhjbHVkZVRhZ3MuY2xlYXIoKTtcblxuXHRcdGxldCBnbG9iVGV4dCA9ICcnO1xuXHRcdGxldCBsYXN0SW5kZXggPSAwO1xuXHRcdGZvciAoY29uc3QgbWF0Y2ggb2YgdGV4dC5tYXRjaEFsbCh0YWdSZSkpIHtcblx0XHRcdGxldCBuZXh0SW5kZXggPSBtYXRjaC5pbmRleCArIG1hdGNoWzBdLmxlbmd0aDtcblxuXHRcdFx0Y29uc3QgdGFnID0gbWF0Y2hbMF07XG5cdFx0XHRjb25zdCBpc0ZpbHRlclRlcm0gPSBhbGxUZXN0RmlsdGVyVGVybXMuaW5jbHVkZXModGFnIGFzIFRlc3RGaWx0ZXJUZXJtKTtcblx0XHRcdGlmIChpc0ZpbHRlclRlcm0pIHtcblx0XHRcdFx0dGhpcy50ZXJtRmlsdGVyU3RhdGVbdGFnIGFzIFRlc3RGaWx0ZXJUZXJtXSA9IHRydWU7XG5cdFx0XHR9XG5cblx0XHRcdC8vIHJlY29nbml6ZSBhbmQgcGFyc2UgQGN0cmxJZDp0YWdJZCBvciBxdW90ZWQgbGlrZSBAY3RybElkOlwidGFnIFxcXFxcImlkXCJcblx0XHRcdGxldCBpc1RhZyA9IGZhbHNlO1xuXHRcdFx0aWYgKHRleHRbbmV4dEluZGV4XSA9PT0gJzonKSB7XG5cdFx0XHRcdGlzVGFnID0gdHJ1ZTtcblx0XHRcdFx0bmV4dEluZGV4Kys7XG5cblx0XHRcdFx0bGV0IGRlbGltaXRlciA9IHRleHRbbmV4dEluZGV4XTtcblx0XHRcdFx0aWYgKGRlbGltaXRlciAhPT0gYFwiYCAmJiBkZWxpbWl0ZXIgIT09IGAnYCkge1xuXHRcdFx0XHRcdGRlbGltaXRlciA9ICcgJztcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRuZXh0SW5kZXgrKztcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGxldCB0YWdJZCA9ICcnO1xuXHRcdFx0XHR3aGlsZSAobmV4dEluZGV4IDwgdGV4dC5sZW5ndGggJiYgdGV4dFtuZXh0SW5kZXhdICE9PSBkZWxpbWl0ZXIpIHtcblx0XHRcdFx0XHRpZiAodGV4dFtuZXh0SW5kZXhdID09PSAnXFxcXCcpIHtcblx0XHRcdFx0XHRcdHRhZ0lkICs9IHRleHRbbmV4dEluZGV4ICsgMV07XG5cdFx0XHRcdFx0XHRuZXh0SW5kZXggKz0gMjtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0dGFnSWQgKz0gdGV4dFtuZXh0SW5kZXhdO1xuXHRcdFx0XHRcdFx0bmV4dEluZGV4Kys7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKG1hdGNoWzBdLnN0YXJ0c1dpdGgoJyEnKSkge1xuXHRcdFx0XHRcdHRoaXMuZXhjbHVkZVRhZ3MuYWRkKG5hbWVzcGFjZVRlc3RUYWcobWF0Y2hbMV0sIHRhZ0lkKSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5pbmNsdWRlVGFncy5hZGQobmFtZXNwYWNlVGVzdFRhZyhtYXRjaFsxXSwgdGFnSWQpKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRuZXh0SW5kZXgrKztcblx0XHRcdH1cblxuXHRcdFx0Ly8gSWYgdGhlIEAtcHJlZml4ZWQgdGV4dCBpcyBub3QgYSBrbm93biBmaWx0ZXIgdGVybSBvciB0YWcsXG5cdFx0XHQvLyB0cmVhdCBpdCBhcyByZWd1bGFyIGZpbHRlciB0ZXh0IChlLmcuLCBhIHRlc3QgbmFtZWQgXCJAc21va2VcIilcblx0XHRcdGlmICghaXNGaWx0ZXJUZXJtICYmICFpc1RhZykge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0Z2xvYlRleHQgKz0gdGV4dC5zbGljZShsYXN0SW5kZXgsIG1hdGNoLmluZGV4KTtcblx0XHRcdGxhc3RJbmRleCA9IG5leHRJbmRleDtcblx0XHR9XG5cblx0XHRnbG9iVGV4dCArPSB0ZXh0LnNsaWNlKGxhc3RJbmRleCkudHJpbSgpO1xuXG5cdFx0aWYgKGdsb2JUZXh0Lmxlbmd0aCkge1xuXHRcdFx0Zm9yIChjb25zdCBmaWx0ZXIgb2Ygc3BsaXRHbG9iQXdhcmUoZ2xvYlRleHQsICcsJykubWFwKHMgPT4gcy50cmltKCkpLmZpbHRlcihzID0+ICEhcy5sZW5ndGgpKSB7XG5cdFx0XHRcdGlmIChmaWx0ZXIuc3RhcnRzV2l0aCgnIScpKSB7XG5cdFx0XHRcdFx0dGhpcy5nbG9iTGlzdC5wdXNoKHsgaW5jbHVkZTogZmFsc2UsIHRleHQ6IGZpbHRlci5zbGljZSgxKS50b0xvd2VyQ2FzZSgpIH0pO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMuZ2xvYkxpc3QucHVzaCh7IGluY2x1ZGU6IHRydWUsIHRleHQ6IGZpbHRlci50b0xvd2VyQ2FzZSgpIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy50ZXh0LnZhbHVlID0gdGV4dDsgLy8gcHVycG9zZWx5IGFmdGVyd2FyZHMgc28gZXZlcnl0aGluZyBpcyB1cGRhdGVkIHdoZW4gdGhlIGNoYW5nZSBldmVudCBoYXBwZW5cblx0fVxuXG5cdC8qKiBAaW5oZXJpdGRvYyAqL1xuXHRwdWJsaWMgaXNGaWx0ZXJpbmdGb3IodGVybTogVGVzdEZpbHRlclRlcm0pIHtcblx0XHRyZXR1cm4gISF0aGlzLnRlcm1GaWx0ZXJTdGF0ZVt0ZXJtXTtcblx0fVxuXG5cdC8qKiBAaW5oZXJpdGRvYyAqL1xuXHRwdWJsaWMgdG9nZ2xlRmlsdGVyaW5nRm9yKHRlcm06IFRlc3RGaWx0ZXJUZXJtLCBzaG91bGRGaWx0ZXI/OiBib29sZWFuKSB7XG5cdFx0Y29uc3QgdGV4dCA9IHRoaXMudGV4dC52YWx1ZS50cmltKCk7XG5cdFx0aWYgKHNob3VsZEZpbHRlciAhPT0gZmFsc2UgJiYgIXRoaXMudGVybUZpbHRlclN0YXRlW3Rlcm1dKSB7XG5cdFx0XHR0aGlzLnNldFRleHQodGV4dCA/IGAke3RleHR9ICR7dGVybX1gIDogdGVybSk7XG5cdFx0fSBlbHNlIGlmIChzaG91bGRGaWx0ZXIgIT09IHRydWUgJiYgdGhpcy50ZXJtRmlsdGVyU3RhdGVbdGVybV0pIHtcblx0XHRcdHRoaXMuc2V0VGV4dCh0cmltRXh0cmFXaGl0ZXNwYWNlKHRleHQucmVwbGFjZSh0ZXJtLCAnJykpKTtcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGNvbnN0IGVudW0gVGVzdEZpbHRlclRlcm0ge1xuXHRGYWlsZWQgPSAnQGZhaWxlZCcsXG5cdEV4ZWN1dGVkID0gJ0BleGVjdXRlZCcsXG5cdEN1cnJlbnREb2MgPSAnQGRvYycsXG5cdE9wZW5lZEZpbGVzID0gJ0BvcGVuZWRGaWxlcycsXG5cdEhpZGRlbiA9ICdAaGlkZGVuJyxcbn1cblxuY29uc3QgYWxsVGVzdEZpbHRlclRlcm1zOiByZWFkb25seSBUZXN0RmlsdGVyVGVybVtdID0gW1xuXHRUZXN0RmlsdGVyVGVybS5GYWlsZWQsXG5cdFRlc3RGaWx0ZXJUZXJtLkV4ZWN1dGVkLFxuXHRUZXN0RmlsdGVyVGVybS5DdXJyZW50RG9jLFxuXHRUZXN0RmlsdGVyVGVybS5PcGVuZWRGaWxlcyxcblx0VGVzdEZpbHRlclRlcm0uSGlkZGVuLFxuXTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBSUEsU0FBUyxlQUFzQjtBQUMvQixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGtCQUFrQjtBQUMzQixT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QUMsR0FBRyxLQUFLLENBQUM7QUFBQSxRQUN2RDtBQUNBO0FBQUEsTUFDRDtBQUlBLFVBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxPQUFPO0FBQzVCO0FBQUEsTUFDRDtBQUVBLGtCQUFZLEtBQUssTUFBTSxXQUFXLE1BQU0sS0FBSztBQUM3QyxrQkFBWTtBQUFBLElBQ2I7QUFFQSxnQkFBWSxLQUFLLE1BQU0sU0FBUyxFQUFFLEtBQUs7QUFFdkMsUUFBSSxTQUFTLFFBQVE7QUFDcEIsaUJBQVcsVUFBVSxlQUFlLFVBQVUsR0FBRyxFQUFFLElBQUksT0FBSyxFQUFFLEtBQUssQ0FBQyxFQUFFLE9BQU8sT0FBSyxDQUFDLENBQUMsRUFBRSxNQUFNLEdBQUc7QUFDOUYsWUFBSSxPQUFPLFdBQVcsR0FBRyxHQUFHO0FBQzNCLGVBQUssU0FBUyxLQUFLLEVBQUUsU0FBUyxPQUFPLE1BQU0sT0FBTyxNQUFNLENBQUMsRUFBRSxZQUFZLEVBQUUsQ0FBQztBQUFBLFFBQzNFLE9BQU87QUFDTixlQUFLLFNBQVMsS0FBSyxFQUFFLFNBQVMsTUFBTSxNQUFNLE9BQU8sWUFBWSxFQUFFLENBQUM7QUFBQSxRQUNqRTtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBRUEsU0FBSyxLQUFLLFFBQVE7QUFBQSxFQUNuQjtBQUFBO0FBQUEsRUFHTyxlQUFlLE1BQXNCO0FBQzNDLFdBQU8sQ0FBQyxDQUFDLEtBQUssZ0JBQWdCLElBQUk7QUFBQSxFQUNuQztBQUFBO0FBQUEsRUFHTyxtQkFBbUIsTUFBc0IsY0FBd0I7QUFDdkUsVUFBTSxPQUFPLEtBQUssS0FBSyxNQUFNLEtBQUs7QUFDbEMsUUFBSSxpQkFBaUIsU0FBUyxDQUFDLEtBQUssZ0JBQWdCLElBQUksR0FBRztBQUMxRCxXQUFLLFFBQVEsT0FBTyxHQUFHLElBQUksSUFBSSxJQUFJLEtBQUssSUFBSTtBQUFBLElBQzdDLFdBQVcsaUJBQWlCLFFBQVEsS0FBSyxnQkFBZ0IsSUFBSSxHQUFHO0FBQy9ELFdBQUssUUFBUSxvQkFBb0IsS0FBSyxRQUFRLE1BQU0sRUFBRSxDQUFDLENBQUM7QUFBQSxJQUN6RDtBQUFBLEVBQ0Q7QUFDRDtBQWhKYSwwQkFBTjtBQUFBLEVBK0JKO0FBQUEsR0EvQlU7QUFrSk4sSUFBVyxpQkFBWCxrQkFBV0Esb0JBQVg7QUFDTixFQUFBQSxnQkFBQSxZQUFTO0FBQ1QsRUFBQUEsZ0JBQUEsY0FBVztBQUNYLEVBQUFBLGdCQUFBLGdCQUFhO0FBQ2IsRUFBQUEsZ0JBQUEsaUJBQWM7QUFDZCxFQUFBQSxnQkFBQSxZQUFTO0FBTFEsU0FBQUE7QUFBQSxHQUFBO0FBUWxCLE1BQU0scUJBQWdEO0FBQUEsRUFDckQ7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQ0Q7IiwKICAibmFtZXMiOiBbIlRlc3RGaWx0ZXJUZXJtIl0KfQo=
