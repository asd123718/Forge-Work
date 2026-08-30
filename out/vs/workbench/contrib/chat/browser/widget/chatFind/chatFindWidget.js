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
import "./chatFindWidget.css";
import * as dom from "../../../../../../base/browser/dom.js";
import { Delayer } from "../../../../../../base/common/async.js";
import { createRegExp } from "../../../../../../base/common/strings.js";
import { isDefined } from "../../../../../../base/common/types.js";
import { MutableDisposable } from "../../../../../../base/common/lifecycle.js";
import { Range as EditorRange } from "../../../../../../editor/common/core/range.js";
import { IAccessibilityService } from "../../../../../../platform/accessibility/common/accessibility.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../../../platform/contextkey/common/contextkey.js";
import { IContextViewService } from "../../../../../../platform/contextview/browser/contextView.js";
import { IHoverService } from "../../../../../../platform/hover/browser/hover.js";
import { IKeybindingService } from "../../../../../../platform/keybinding/common/keybinding.js";
import { SimpleFindWidget } from "../../../../codeEditor/browser/find/simpleFindWidget.js";
import { ChatContextKeys } from "../../../common/actions/chatContextKeys.js";
import { ChatFindCommandId } from "./chatFindCommandIds.js";
import { getChatFindHighlightRegistry, supportsCssHighlightApi } from "./chatFindHighlights.js";
import { ChatFindModel } from "./chatFindModel.js";
const MAX_VISIBLE_HIGHLIGHTS = 500;
const CHAT_FIND_WIDGET_INITIAL_WIDTH = 350;
const CURRENT_MATCH_HIGHLIGHT_NAME = "chat-find-current-match";
const OTHER_MATCH_HIGHLIGHT_NAME = "chat-find-other-match";
const INLINE_TAGS = /* @__PURE__ */ new Set(["A", "ABBR", "B", "BDI", "BDO", "CITE", "CODE", "DATA", "DEL", "DFN", "EM", "I", "INS", "KBD", "MARK", "Q", "S", "SAMP", "SMALL", "SPAN", "STRONG", "SUB", "SUP", "TIME", "U", "VAR"]);
function nearestBlock(node, root) {
  let element = node.parentElement;
  while (element && element !== root && INLINE_TAGS.has(element.tagName)) {
    element = element.parentElement;
  }
  return element ?? root;
}
function findMatchRangesInDom(root, regex, limit, excludedRoots = []) {
  const ownerDocument = root.ownerDocument;
  const nodes = [];
  let buffer = "";
  let block;
  let separatorPending = false;
  const walker = ownerDocument.createTreeWalker(
    root,
    5
    /* NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT */
  );
  let current;
  while (current = walker.nextNode()) {
    if (excludedRoots.some((candidate) => candidate.contains(current))) {
      separatorPending = true;
      continue;
    }
    if (current.nodeType !== 3) {
      separatorPending ||= current.tagName === "BR";
      continue;
    }
    const text = current.textContent;
    if (!text) {
      continue;
    }
    const nodeBlock = nearestBlock(current, root);
    if (buffer && (separatorPending || nodeBlock !== block)) {
      buffer += "\n";
    }
    block = nodeBlock;
    separatorPending = false;
    nodes.push({ node: current, start: buffer.length, end: buffer.length + text.length });
    buffer += text;
  }
  if (!buffer) {
    return [];
  }
  const ranges = [];
  regex.lastIndex = 0;
  let match;
  while (match = regex.exec(buffer)) {
    const range = toDomRange(ownerDocument, nodes, match.index, match.index + match[0].length);
    if (range) {
      ranges.push(range);
    }
    if (match[0].length === 0) {
      regex.lastIndex++;
    }
    if (ranges.length >= limit) {
      break;
    }
  }
  return ranges;
}
function toDomRange(ownerDocument, nodes, start, end) {
  const startEntry = nodes.find((n) => start < n.end);
  const endEntry = nodes.find((n) => end <= n.end);
  if (!startEntry || !endEntry || endEntry.start < startEntry.start) {
    return void 0;
  }
  const range = ownerDocument.createRange();
  range.setStart(startEntry.node, Math.max(start - startEntry.start, 0));
  range.setEnd(endEntry.node, Math.max(end - endEntry.start, 0));
  return range;
}
function isDetailsElement(node) {
  return node.tagName === "DETAILS";
}
function openAncestorDisclosures(root, node) {
  let opened = false;
  let current = node;
  while (current && current !== root) {
    if (isDetailsElement(current) && !current.open) {
      current.open = true;
      opened = true;
    }
    current = current.parentNode;
  }
  return opened;
}
function shouldCaptureFocusBeforeShow(wasVisible) {
  return !wasVisible;
}
function rangesEqual(a, b) {
  return a.startContainer === b.startContainer && a.startOffset === b.startOffset && a.endContainer === b.endContainer && a.endOffset === b.endOffset;
}
function isCodeMatch(match) {
  return "codeBlock" in match;
}
function findMatchRangesInCodeBlock(codeBlock, regex, limit) {
  const model = codeBlock.editor.getModel();
  if (!model) {
    return [];
  }
  const ranges = [];
  regex.lastIndex = 0;
  let match;
  while (match = regex.exec(model.getValue())) {
    const start = model.getPositionAt(match.index);
    const end = model.getPositionAt(match.index + match[0].length);
    ranges.push(EditorRange.fromPositions(start, end));
    if (match[0].length === 0) {
      regex.lastIndex++;
    }
    if (ranges.length >= limit) {
      break;
    }
  }
  return ranges;
}
let ChatFindWidget = class extends SimpleFindWidget {
  constructor(host, contextViewService, contextKeyService, hoverService, keybindingService, configurationService, accessibilityService) {
    super({
      showCommonFindToggles: true,
      showResultCount: true,
      initialWidth: CHAT_FIND_WIDGET_INITIAL_WIDTH,
      enableSash: true,
      appendCaseSensitiveActionId: ChatFindCommandId.ToggleFindCaseSensitive,
      appendRegexActionId: ChatFindCommandId.ToggleFindRegex,
      appendWholeWordsActionId: ChatFindCommandId.ToggleFindWholeWord,
      previousMatchActionId: ChatFindCommandId.FindPrevious,
      nextMatchActionId: ChatFindCommandId.FindNext,
      closeWidgetActionId: ChatFindCommandId.FindHide
    }, contextViewService, contextKeyService, hoverService, keybindingService, configurationService, accessibilityService);
    this.host = host;
    this._repaintScheduler = this._register(new MutableDisposable());
    this._revealScheduler = this._register(new MutableDisposable());
    this._recomputeDelayer = this._register(new Delayer(200));
    this._codeDecorations = /* @__PURE__ */ new Map();
    this._lastNavigationWasPrevious = false;
    this._unlocatableSkips = 0;
    this._targetWindow = dom.getWindow(this.host.transcriptDomNode);
    this._findWidgetVisibleKey = ChatContextKeys.findWidgetVisible.bindTo(contextKeyService);
    this._findWidgetFocusedKey = ChatContextKeys.findWidgetFocused.bindTo(contextKeyService);
    this._findInputFocusedKey = ChatContextKeys.findInputFocused.bindTo(contextKeyService);
    this._model = this._register(new ChatFindModel(() => this.host.getItems()));
    this._register(this._model.onDidChangeMatches(() => this._onMatchesChanged()));
    this._register(this.host.onDidChangeContent(() => {
      if (this.isVisible()) {
        this._recomputeDelayer.trigger(() => {
          this._model.recompute();
          this._scheduleRepaint();
        }).catch(() => {
        });
      }
    }));
    this._register(this.host.onDidRerenderRow(() => {
      if (this.isVisible()) {
        this._scheduleRepaint();
      }
    }));
    dom.append(this.host.transcriptDomNode.parentElement ?? this.host.transcriptDomNode, this.getDomNode());
  }
  get visible() {
    return this.isVisible();
  }
  show(seedText, focus = true) {
    if (shouldCaptureFocusBeforeShow(this.isVisible())) {
      this._lastFocusedElement = this._targetWindow.document.activeElement;
    }
    this._findWidgetVisibleKey.set(true);
    if (focus) {
      super.reveal(seedText);
    } else {
      super.show(seedText);
    }
    this._model.setQuery(this.inputValue, this._currentFindOptions());
    this._navigateToActive();
  }
  hide() {
    super.hide();
    this._findWidgetVisibleKey.reset();
    this._recomputeDelayer.cancel();
    this._clearHighlights();
    this._model.clear();
    this._restoreFocus();
  }
  find(previous) {
    this._lastNavigationWasPrevious = previous;
    this._unlocatableSkips = 0;
    this._advanceActiveMatch(previous);
  }
  _advanceActiveMatch(previous) {
    if (previous) {
      this._model.previous();
    } else {
      this._model.next();
    }
    this._navigateToActive();
    void this.updateResultCount();
  }
  /**
   * Moves past a match the DOM cannot produce, so navigation never appears to do nothing. The
   * index predicts where the renderer will put content, and a part nested in a lazily-built
   * container has no DOM node to land on; rather than stall, continue in the same direction.
   */
  _skipUnlocatableMatch() {
    if (this._unlocatableSkips >= ChatFindWidget.MAX_UNLOCATABLE_SKIPS) {
      return;
    }
    this._unlocatableSkips++;
    this._advanceActiveMatch(this._lastNavigationWasPrevious);
  }
  findFirst() {
    this._model.setQuery(this.inputValue, this._currentFindOptions());
    this._navigateToActive();
  }
  next() {
    this.find(false);
  }
  previous() {
    this.find(true);
  }
  focus() {
    this.focusFindBox();
  }
  toggleCaseSensitive() {
    this.changeState({ matchCase: !this._getCaseSensitiveValue() });
  }
  toggleWholeWord() {
    this.changeState({ wholeWord: !this._getWholeWordValue() });
  }
  toggleRegex() {
    this.changeState({ isRegex: !this._getRegexValue() });
  }
  _onInputChanged() {
    this._model.setQuery(this.inputValue, this._currentFindOptions());
    this._navigateToActive();
    return this._model.matches.length > 0;
  }
  async _getResultCount() {
    if (this._model.isInvalidRegex) {
      return void 0;
    }
    return { resultIndex: this._model.activeIndex, resultCount: this._model.matches.length };
  }
  _onFocusTrackerFocus() {
    this._findWidgetFocusedKey.set(true);
  }
  _onFocusTrackerBlur() {
    this._findWidgetFocusedKey.reset();
  }
  _onFindInputFocusTrackerFocus() {
    this._findInputFocusedKey.set(true);
  }
  _onFindInputFocusTrackerBlur() {
    this._findInputFocusedKey.reset();
  }
  _currentFindOptions() {
    return { isRegex: this._getRegexValue(), matchCase: this._getCaseSensitiveValue(), wholeWord: this._getWholeWordValue() };
  }
  _onMatchesChanged() {
    void this.updateResultCount();
  }
  _navigateToActive() {
    const match = this._model.activeMatch;
    this._clearHighlights();
    if (!match) {
      return;
    }
    const item = this._findItemForMatch(match);
    if (item) {
      this.host.reveal(item);
    }
    this._revealScheduler.value = dom.scheduleAtNextAnimationFrame(this._targetWindow, () => this._revealActiveMatch(match));
  }
  _revealActiveMatch(match) {
    const locatedMatch = this._locateMatch(match);
    if (!locatedMatch) {
      this._repaintVisibleHighlights();
      this._skipUnlocatableMatch();
      return;
    }
    if (isCodeMatch(locatedMatch)) {
      const revealCodeMatch = () => {
        locatedMatch.codeBlock.editor.revealRangeInCenter(locatedMatch.range);
        this._repaintVisibleHighlights();
      };
      if (openAncestorDisclosures(this.host.transcriptDomNode, locatedMatch.codeBlock.element)) {
        this._revealScheduler.value = dom.scheduleAtNextAnimationFrame(this._targetWindow, revealCodeMatch);
      } else {
        revealCodeMatch();
      }
      return;
    }
    const range = locatedMatch;
    const opened = this._openAncestorDisclosures(range);
    this._repaintVisibleHighlights();
    if (opened) {
      this._revealScheduler.value = dom.scheduleAtNextAnimationFrame(this._targetWindow, () => this._scrollRangeIntoView(range));
    } else {
      this._scrollRangeIntoView(range);
    }
  }
  _scrollRangeIntoView(range) {
    const container = range && (range.startContainer.nodeType === this._targetWindow.Node.ELEMENT_NODE ? range.startContainer : range.startContainer.parentElement);
    container?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
  _findItemForMatch(match) {
    return this.host.getItems().find((item) => item.id === match.itemId);
  }
  /** Opens every closed `<details>` ancestor of `range`, up to the transcript root. Returns whether any were toggled. */
  _openAncestorDisclosures(range) {
    return openAncestorDisclosures(this.host.transcriptDomNode, range.startContainer);
  }
  _scheduleRepaint() {
    this._repaintScheduler.value = dom.scheduleAtNextAnimationFrame(this._targetWindow, () => this._repaintVisibleHighlights());
  }
  _tryCreateRegex() {
    try {
      return createRegExp(this._model.query, this._model.options.isRegex, {
        matchCase: this._model.options.matchCase,
        wholeWord: this._model.options.wholeWord,
        global: true,
        unicode: true
      });
    } catch {
      return void 0;
    }
  }
  /**
   * The DOM subtrees that can own `match`, in document order. Matches with a rendered part use
   * it directly; row-level response matches search the trailing parts (error details and other
   * content following the response body) so their occurrence is not counted against the body.
   */
  _locateMatchRoots(match, template) {
    if (match.partIndex >= 0) {
      const partRoot = template?.renderedParts?.[match.partIndex]?.domNode;
      if (partRoot) {
        return [partRoot];
      }
    } else if (match.scopeStartPartIndex !== void 0 && template?.renderedParts) {
      const trailing = template.renderedParts.slice(match.scopeStartPartIndex).map((part) => part?.domNode).filter(isDefined);
      if (trailing.length) {
        return trailing;
      }
    }
    return template?.value ? [template.value] : [];
  }
  /** Locates the active match's DOM range within its rendered content part (or the whole row as a fallback). */
  _locateMatch(match, regex) {
    const template = this.host.getTemplateDataForRequestId(match.itemId);
    const roots = this._locateMatchRoots(match, template);
    if (!roots.length) {
      return void 0;
    }
    const effectiveRegex = regex ?? this._tryCreateRegex();
    if (!effectiveRegex) {
      return void 0;
    }
    const locations = [];
    for (const root of roots) {
      const codeBlocks = [...this.host.editorsInUse()].filter((codeBlock) => root.contains(codeBlock.element)).sort((first, second) => first.element.compareDocumentPosition(second.element) & 4 ? -1 : 1);
      findMatchRangesInDom(
        root,
        effectiveRegex,
        match.occurrenceIndex + 1,
        codeBlocks.map((codeBlock) => codeBlock.element)
      ).forEach((range, order) => locations.push({ node: range.startContainer, order, match: range }));
      for (const codeBlock of codeBlocks) {
        const ranges = findMatchRangesInCodeBlock(codeBlock, effectiveRegex, match.occurrenceIndex + 1);
        for (let order = 0; order < ranges.length; order++) {
          locations.push({
            node: codeBlock.element,
            order,
            match: { codeBlock, range: ranges[order] }
          });
        }
      }
    }
    locations.sort((first, second) => first.node === second.node ? first.order - second.order : first.node.compareDocumentPosition(second.node) & 4 ? -1 : 1);
    return locations[match.occurrenceIndex]?.match;
  }
  _repaintVisibleHighlights() {
    const registry = getChatFindHighlightRegistry(this._targetWindow);
    if (!this.isVisible() || !this._model.matches.length || !this._model.query) {
      registry.clear(this);
      this._updateCodeDecorations(/* @__PURE__ */ new Map());
      return;
    }
    const regex = this._tryCreateRegex();
    if (!regex) {
      registry.clear(this);
      this._updateCodeDecorations(/* @__PURE__ */ new Map());
      return;
    }
    const currentRanges = [];
    const otherRanges = [];
    const codeDecorations = /* @__PURE__ */ new Map();
    let locatedCount = 0;
    const renderedRows = /* @__PURE__ */ new Map();
    for (let index = 0; index < this._model.matches.length && locatedCount < MAX_VISIBLE_HIGHLIGHTS; index++) {
      const match = this._model.matches[index];
      let isRendered = renderedRows.get(match.itemId);
      if (isRendered === void 0) {
        isRendered = !!this.host.getTemplateDataForRequestId(match.itemId);
        renderedRows.set(match.itemId, isRendered);
      }
      if (!isRendered) {
        continue;
      }
      const locatedMatch = this._locateMatch(match, regex);
      if (!locatedMatch) {
        continue;
      }
      locatedCount++;
      if (isCodeMatch(locatedMatch)) {
        const decorations = codeDecorations.get(locatedMatch.codeBlock) ?? [];
        decorations.push({ range: locatedMatch.range, current: index === this._model.activeIndex });
        codeDecorations.set(locatedMatch.codeBlock, decorations);
      } else {
        (index === this._model.activeIndex ? currentRanges : otherRanges).push(locatedMatch);
      }
    }
    if (supportsCssHighlightApi(this._targetWindow)) {
      registry.setRanges(this, CURRENT_MATCH_HIGHLIGHT_NAME, currentRanges, 1);
      registry.setRanges(this, OTHER_MATCH_HIGHLIGHT_NAME, otherRanges, 0);
    } else {
      registry.clear(this);
    }
    this._updateCodeDecorations(codeDecorations);
  }
  _updateCodeDecorations(matches) {
    for (const [codeBlock, collection] of this._codeDecorations) {
      collection.clear();
      if (!matches.has(codeBlock)) {
        this._codeDecorations.delete(codeBlock);
      }
    }
    for (const [codeBlock, decorations] of matches) {
      let collection = this._codeDecorations.get(codeBlock);
      if (!collection) {
        collection = codeBlock.editor.createDecorationsCollection();
        this._codeDecorations.set(codeBlock, collection);
      }
      collection.set(decorations.map(({ range, current }) => ({
        range,
        options: {
          description: current ? "chat-find-current-match" : "chat-find-other-match",
          inlineClassName: current ? "chat-find-current-match" : "chat-find-other-match"
        }
      })));
    }
  }
  _clearHighlights() {
    getChatFindHighlightRegistry(this._targetWindow).clear(this);
    this._updateCodeDecorations(/* @__PURE__ */ new Map());
  }
  _restoreFocus() {
    const target = this._lastFocusedElement;
    this._lastFocusedElement = void 0;
    if (target && target.isConnected) {
      target.focus();
    } else {
      this.host.transcriptDomNode.focus();
    }
  }
  dispose() {
    this._clearHighlights();
    super.dispose();
  }
};
/** Bounds the skip walk so a query whose matches are all unlocatable cannot spin. */
ChatFindWidget.MAX_UNLOCATABLE_SKIPS = 50;
ChatFindWidget = __decorateClass([
  __decorateParam(1, IContextViewService),
  __decorateParam(2, IContextKeyService),
  __decorateParam(3, IHoverService),
  __decorateParam(4, IKeybindingService),
  __decorateParam(5, IConfigurationService),
  __decorateParam(6, IAccessibilityService)
], ChatFindWidget);
export {
  ChatFindWidget,
  findMatchRangesInCodeBlock,
  findMatchRangesInDom,
  openAncestorDisclosures,
  rangesEqual,
  shouldCaptureFocusBeforeShow
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXHdpZGdldFxcY2hhdEZpbmRcXGNoYXRGaW5kV2lkZ2V0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICcuL2NoYXRGaW5kV2lkZ2V0LmNzcyc7XG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBEZWxheWVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgY3JlYXRlUmVnRXhwIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBpc0RlZmluZWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IE11dGFibGVEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFJhbmdlIGFzIEVkaXRvclJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IElFZGl0b3JEZWNvcmF0aW9uc0NvbGxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2VkaXRvckNvbW1vbi5qcyc7XG5pbXBvcnQgeyBJQWNjZXNzaWJpbGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5L2NvbW1vbi9hY2Nlc3NpYmlsaXR5LmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXksIElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRWaWV3U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dFZpZXcuanMnO1xuaW1wb3J0IHsgSUhvdmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2hvdmVyL2Jyb3dzZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBTaW1wbGVGaW5kV2lkZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vY29kZUVkaXRvci9icm93c2VyL2ZpbmQvc2ltcGxlRmluZFdpZGdldC5qcyc7XG5pbXBvcnQgeyBDaGF0Q29udGV4dEtleXMgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vYWN0aW9ucy9jaGF0Q29udGV4dEtleXMuanMnO1xuaW1wb3J0IHsgQ2hhdFRyZWVJdGVtLCBJQ2hhdEZpbmRDb250cm9sbGVyIH0gZnJvbSAnLi4vLi4vY2hhdC5qcyc7XG5pbXBvcnQgeyBJQ2hhdExpc3RJdGVtVGVtcGxhdGUgfSBmcm9tICcuLi9jaGF0TGlzdFJlbmRlcmVyLmpzJztcbmltcG9ydCB7IENvZGVCbG9ja1BhcnQgfSBmcm9tICcuLi9jaGF0Q29udGVudFBhcnRzL2NvZGVCbG9ja1BhcnQuanMnO1xuaW1wb3J0IHsgQ2hhdEZpbmRDb21tYW5kSWQgfSBmcm9tICcuL2NoYXRGaW5kQ29tbWFuZElkcy5qcyc7XG5pbXBvcnQgeyBnZXRDaGF0RmluZEhpZ2hsaWdodFJlZ2lzdHJ5LCBzdXBwb3J0c0Nzc0hpZ2hsaWdodEFwaSB9IGZyb20gJy4vY2hhdEZpbmRIaWdobGlnaHRzLmpzJztcbmltcG9ydCB7IENoYXRGaW5kTW9kZWwsIElDaGF0RmluZE1hdGNoIH0gZnJvbSAnLi9jaGF0RmluZE1vZGVsLmpzJztcblxuZXhwb3J0IGludGVyZmFjZSBJQ2hhdEZpbmRIb3N0IHtcblx0cmVhZG9ubHkgdHJhbnNjcmlwdERvbU5vZGU6IEhUTUxFbGVtZW50O1xuXHRnZXRJdGVtcygpOiByZWFkb25seSBDaGF0VHJlZUl0ZW1bXTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VDb250ZW50OiBFdmVudDx2b2lkPjtcblx0cmV2ZWFsKGl0ZW06IENoYXRUcmVlSXRlbSwgcmVsYXRpdmVUb3A/OiBudW1iZXIpOiB2b2lkO1xuXHRnZXRUZW1wbGF0ZURhdGFGb3JSZXF1ZXN0SWQocmVxdWVzdElkOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBJQ2hhdExpc3RJdGVtVGVtcGxhdGUgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IG9uRGlkUmVyZW5kZXJSb3c6IEV2ZW50PElDaGF0TGlzdEl0ZW1UZW1wbGF0ZT47XG5cdGVkaXRvcnNJblVzZSgpOiBJdGVyYWJsZTxDb2RlQmxvY2tQYXJ0Pjtcbn1cblxuLyoqIFVwcGVyIGJvdW5kIG9uIHRoZSBudW1iZXIgb2YgRE9NIHJhbmdlcyBoaWdobGlnaHRlZCBhdCBvbmNlIChvbmx5IGV2ZXIgdGhlIGN1cnJlbnRseSBtb3VudGVkL3Zpc2libGUgcm93cykuICovXG5jb25zdCBNQVhfVklTSUJMRV9ISUdITElHSFRTID0gNTAwO1xuXG5jb25zdCBDSEFUX0ZJTkRfV0lER0VUX0lOSVRJQUxfV0lEVEggPSAzNTA7XG5cbmNvbnN0IENVUlJFTlRfTUFUQ0hfSElHSExJR0hUX05BTUUgPSAnY2hhdC1maW5kLWN1cnJlbnQtbWF0Y2gnO1xuY29uc3QgT1RIRVJfTUFUQ0hfSElHSExJR0hUX05BTUUgPSAnY2hhdC1maW5kLW90aGVyLW1hdGNoJztcblxuLyoqXG4gKiBFbGVtZW50cyB0aGF0IGRvIG5vdCBpbnRlcnJ1cHQgdGhlIGZsb3cgb2YgYSBsaW5lLCBzbyBgSGkgPGI+dGhlcmU8L2I+YCByZWFkcyBhcyBgSGkgdGhlcmVgLlxuICogQW55dGhpbmcgZWxzZSBzdGFydHMgYSBuZXcgbGluZSwgc28gdGhlIHRhaWwgb2Ygb25lIGJsb2NrIGNhbm5vdCBmdXNlIHdpdGggdGhlIGhlYWQgb2YgdGhlIG5leHQuXG4gKi9cbmNvbnN0IElOTElORV9UQUdTID0gbmV3IFNldChbJ0EnLCAnQUJCUicsICdCJywgJ0JESScsICdCRE8nLCAnQ0lURScsICdDT0RFJywgJ0RBVEEnLCAnREVMJywgJ0RGTicsICdFTScsICdJJywgJ0lOUycsICdLQkQnLCAnTUFSSycsICdRJywgJ1MnLCAnU0FNUCcsICdTTUFMTCcsICdTUEFOJywgJ1NUUk9ORycsICdTVUInLCAnU1VQJywgJ1RJTUUnLCAnVScsICdWQVInXSk7XG5cbi8qKiBUaGUgY2xvc2VzdCBhbmNlc3RvciBvZiBgbm9kZWAgdGhhdCBzdGFydHMgYSBuZXcgbGluZSwgYXQgbW9zdCBgcm9vdGAuICovXG5mdW5jdGlvbiBuZWFyZXN0QmxvY2sobm9kZTogTm9kZSwgcm9vdDogSFRNTEVsZW1lbnQpOiBFbGVtZW50IHtcblx0bGV0IGVsZW1lbnQgPSBub2RlLnBhcmVudEVsZW1lbnQ7XG5cdHdoaWxlIChlbGVtZW50ICYmIGVsZW1lbnQgIT09IHJvb3QgJiYgSU5MSU5FX1RBR1MuaGFzKGVsZW1lbnQudGFnTmFtZSkpIHtcblx0XHRlbGVtZW50ID0gZWxlbWVudC5wYXJlbnRFbGVtZW50O1xuXHR9XG5cdHJldHVybiBlbGVtZW50ID8/IHJvb3Q7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBmaW5kTWF0Y2hSYW5nZXNJbkRvbShyb290OiBIVE1MRWxlbWVudCwgcmVnZXg6IFJlZ0V4cCwgbGltaXQ6IG51bWJlciwgZXhjbHVkZWRSb290czogcmVhZG9ubHkgSFRNTEVsZW1lbnRbXSA9IFtdKTogUmFuZ2VbXSB7XG5cdGNvbnN0IG93bmVyRG9jdW1lbnQgPSByb290Lm93bmVyRG9jdW1lbnQ7XG5cdGNvbnN0IG5vZGVzOiB7IG5vZGU6IFRleHQ7IHN0YXJ0OiBudW1iZXI7IGVuZDogbnVtYmVyIH1bXSA9IFtdO1xuXHRsZXQgYnVmZmVyID0gJyc7XG5cdGxldCBibG9jazogRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0bGV0IHNlcGFyYXRvclBlbmRpbmcgPSBmYWxzZTtcblx0Y29uc3Qgd2Fsa2VyID0gb3duZXJEb2N1bWVudC5jcmVhdGVUcmVlV2Fsa2VyKHJvb3QsIDUgLyogTm9kZUZpbHRlci5TSE9XX0VMRU1FTlQgfCBOb2RlRmlsdGVyLlNIT1dfVEVYVCAqLyk7XG5cdGxldCBjdXJyZW50OiBOb2RlIHwgbnVsbDtcblx0d2hpbGUgKChjdXJyZW50ID0gd2Fsa2VyLm5leHROb2RlKCkpKSB7XG5cdFx0aWYgKGV4Y2x1ZGVkUm9vdHMuc29tZShjYW5kaWRhdGUgPT4gY2FuZGlkYXRlLmNvbnRhaW5zKGN1cnJlbnQpKSkge1xuXHRcdFx0c2VwYXJhdG9yUGVuZGluZyA9IHRydWU7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cdFx0aWYgKGN1cnJlbnQubm9kZVR5cGUgIT09IDMgLyogTm9kZS5URVhUX05PREUgKi8pIHtcblx0XHRcdHNlcGFyYXRvclBlbmRpbmcgfHw9IChjdXJyZW50IGFzIEVsZW1lbnQpLnRhZ05hbWUgPT09ICdCUic7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cdFx0Y29uc3QgdGV4dCA9IGN1cnJlbnQudGV4dENvbnRlbnQ7XG5cdFx0aWYgKCF0ZXh0KSB7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cdFx0Y29uc3Qgbm9kZUJsb2NrID0gbmVhcmVzdEJsb2NrKGN1cnJlbnQsIHJvb3QpO1xuXHRcdGlmIChidWZmZXIgJiYgKHNlcGFyYXRvclBlbmRpbmcgfHwgbm9kZUJsb2NrICE9PSBibG9jaykpIHtcblx0XHRcdGJ1ZmZlciArPSAnXFxuJztcblx0XHR9XG5cdFx0YmxvY2sgPSBub2RlQmxvY2s7XG5cdFx0c2VwYXJhdG9yUGVuZGluZyA9IGZhbHNlO1xuXHRcdG5vZGVzLnB1c2goeyBub2RlOiBjdXJyZW50IGFzIFRleHQsIHN0YXJ0OiBidWZmZXIubGVuZ3RoLCBlbmQ6IGJ1ZmZlci5sZW5ndGggKyB0ZXh0Lmxlbmd0aCB9KTtcblx0XHRidWZmZXIgKz0gdGV4dDtcblx0fVxuXG5cdGlmICghYnVmZmVyKSB7XG5cdFx0cmV0dXJuIFtdO1xuXHR9XG5cblx0Y29uc3QgcmFuZ2VzOiBSYW5nZVtdID0gW107XG5cdHJlZ2V4Lmxhc3RJbmRleCA9IDA7XG5cdGxldCBtYXRjaDogUmVnRXhwRXhlY0FycmF5IHwgbnVsbDtcblx0d2hpbGUgKChtYXRjaCA9IHJlZ2V4LmV4ZWMoYnVmZmVyKSkpIHtcblx0XHRjb25zdCByYW5nZSA9IHRvRG9tUmFuZ2Uob3duZXJEb2N1bWVudCwgbm9kZXMsIG1hdGNoLmluZGV4LCBtYXRjaC5pbmRleCArIG1hdGNoWzBdLmxlbmd0aCk7XG5cdFx0aWYgKHJhbmdlKSB7XG5cdFx0XHRyYW5nZXMucHVzaChyYW5nZSk7XG5cdFx0fVxuXHRcdGlmIChtYXRjaFswXS5sZW5ndGggPT09IDApIHtcblx0XHRcdHJlZ2V4Lmxhc3RJbmRleCsrO1xuXHRcdH1cblx0XHRpZiAocmFuZ2VzLmxlbmd0aCA+PSBsaW1pdCkge1xuXHRcdFx0YnJlYWs7XG5cdFx0fVxuXHR9XG5cdHJldHVybiByYW5nZXM7XG59XG5cbmZ1bmN0aW9uIHRvRG9tUmFuZ2Uob3duZXJEb2N1bWVudDogRG9jdW1lbnQsIG5vZGVzOiB7IG5vZGU6IFRleHQ7IHN0YXJ0OiBudW1iZXI7IGVuZDogbnVtYmVyIH1bXSwgc3RhcnQ6IG51bWJlciwgZW5kOiBudW1iZXIpOiBSYW5nZSB8IHVuZGVmaW5lZCB7XG5cdC8vIEEgbWF0Y2ggY2FuIGJlZ2luIG9yIGVuZCBvbiBhIGJsb2NrIHNlcGFyYXRvciwgd2hpY2ggYmVsb25ncyB0byBubyB0ZXh0IG5vZGUsIHNvIHRoZVxuXHQvLyBvZmZzZXRzIGFyZSBjbGFtcGVkIGludG8gdGhlIG5lYXJlc3Qgbm9kZSByYXRoZXIgdGhhbiBkcm9wcGluZyB0aGUgbWF0Y2guXG5cdGNvbnN0IHN0YXJ0RW50cnkgPSBub2Rlcy5maW5kKG4gPT4gc3RhcnQgPCBuLmVuZCk7XG5cdGNvbnN0IGVuZEVudHJ5ID0gbm9kZXMuZmluZChuID0+IGVuZCA8PSBuLmVuZCk7XG5cdGlmICghc3RhcnRFbnRyeSB8fCAhZW5kRW50cnkgfHwgZW5kRW50cnkuc3RhcnQgPCBzdGFydEVudHJ5LnN0YXJ0KSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRjb25zdCByYW5nZSA9IG93bmVyRG9jdW1lbnQuY3JlYXRlUmFuZ2UoKTtcblx0cmFuZ2Uuc2V0U3RhcnQoc3RhcnRFbnRyeS5ub2RlLCBNYXRoLm1heChzdGFydCAtIHN0YXJ0RW50cnkuc3RhcnQsIDApKTtcblx0cmFuZ2Uuc2V0RW5kKGVuZEVudHJ5Lm5vZGUsIE1hdGgubWF4KGVuZCAtIGVuZEVudHJ5LnN0YXJ0LCAwKSk7XG5cdHJldHVybiByYW5nZTtcbn1cblxuZnVuY3Rpb24gaXNEZXRhaWxzRWxlbWVudChub2RlOiBOb2RlKTogbm9kZSBpcyBIVE1MRGV0YWlsc0VsZW1lbnQge1xuXHRyZXR1cm4gKG5vZGUgYXMgRWxlbWVudCkudGFnTmFtZSA9PT0gJ0RFVEFJTFMnO1xufVxuXG4vKiogT3BlbnMgZXZlcnkgY2xvc2VkIGA8ZGV0YWlscz5gIGFuY2VzdG9yIG9mIGBub2RlYCwgc3RvcHBpbmcgYXQgKGFuZCBleGNsdWRpbmcpIGByb290YC4gUmV0dXJucyB3aGV0aGVyIGFueSB3ZXJlIHRvZ2dsZWQuICovXG5leHBvcnQgZnVuY3Rpb24gb3BlbkFuY2VzdG9yRGlzY2xvc3VyZXMocm9vdDogSFRNTEVsZW1lbnQsIG5vZGU6IE5vZGUpOiBib29sZWFuIHtcblx0bGV0IG9wZW5lZCA9IGZhbHNlO1xuXHRsZXQgY3VycmVudDogTm9kZSB8IG51bGwgPSBub2RlO1xuXHR3aGlsZSAoY3VycmVudCAmJiBjdXJyZW50ICE9PSByb290KSB7XG5cdFx0aWYgKGlzRGV0YWlsc0VsZW1lbnQoY3VycmVudCkgJiYgIWN1cnJlbnQub3Blbikge1xuXHRcdFx0Y3VycmVudC5vcGVuID0gdHJ1ZTtcblx0XHRcdG9wZW5lZCA9IHRydWU7XG5cdFx0fVxuXHRcdGN1cnJlbnQgPSBjdXJyZW50LnBhcmVudE5vZGU7XG5cdH1cblx0cmV0dXJuIG9wZW5lZDtcbn1cblxuLyoqIFdoZXRoZXIgYHNob3coKWAgc2hvdWxkIGNhcHR1cmUgdGhlIHByZS1GaW5kIGZvY3VzIHRhcmdldCwgc28gcmVwZWF0ZWRseSBvcGVuaW5nIGFuIGFscmVhZHktdmlzaWJsZSB3aWRnZXQgZG9lc24ndCBjbG9iYmVyIGl0LiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHNob3VsZENhcHR1cmVGb2N1c0JlZm9yZVNob3cod2FzVmlzaWJsZTogYm9vbGVhbik6IGJvb2xlYW4ge1xuXHRyZXR1cm4gIXdhc1Zpc2libGU7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByYW5nZXNFcXVhbChhOiBSYW5nZSwgYjogUmFuZ2UpOiBib29sZWFuIHtcblx0cmV0dXJuIGEuc3RhcnRDb250YWluZXIgPT09IGIuc3RhcnRDb250YWluZXIgJiYgYS5zdGFydE9mZnNldCA9PT0gYi5zdGFydE9mZnNldFxuXHRcdCYmIGEuZW5kQ29udGFpbmVyID09PSBiLmVuZENvbnRhaW5lciAmJiBhLmVuZE9mZnNldCA9PT0gYi5lbmRPZmZzZXQ7XG59XG5cbmludGVyZmFjZSBJTG9jYXRlZENvZGVNYXRjaCB7XG5cdHJlYWRvbmx5IGNvZGVCbG9jazogQ29kZUJsb2NrUGFydDtcblx0cmVhZG9ubHkgcmFuZ2U6IEVkaXRvclJhbmdlO1xufVxuXG50eXBlIExvY2F0ZWRNYXRjaCA9IFJhbmdlIHwgSUxvY2F0ZWRDb2RlTWF0Y2g7XG5cbmZ1bmN0aW9uIGlzQ29kZU1hdGNoKG1hdGNoOiBMb2NhdGVkTWF0Y2gpOiBtYXRjaCBpcyBJTG9jYXRlZENvZGVNYXRjaCB7XG5cdHJldHVybiAnY29kZUJsb2NrJyBpbiBtYXRjaDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGZpbmRNYXRjaFJhbmdlc0luQ29kZUJsb2NrKGNvZGVCbG9jazogQ29kZUJsb2NrUGFydCwgcmVnZXg6IFJlZ0V4cCwgbGltaXQ6IG51bWJlcik6IEVkaXRvclJhbmdlW10ge1xuXHRjb25zdCBtb2RlbCA9IGNvZGVCbG9jay5lZGl0b3IuZ2V0TW9kZWwoKTtcblx0aWYgKCFtb2RlbCkge1xuXHRcdHJldHVybiBbXTtcblx0fVxuXG5cdGNvbnN0IHJhbmdlczogRWRpdG9yUmFuZ2VbXSA9IFtdO1xuXHRyZWdleC5sYXN0SW5kZXggPSAwO1xuXHRsZXQgbWF0Y2g6IFJlZ0V4cEV4ZWNBcnJheSB8IG51bGw7XG5cdHdoaWxlICgobWF0Y2ggPSByZWdleC5leGVjKG1vZGVsLmdldFZhbHVlKCkpKSkge1xuXHRcdGNvbnN0IHN0YXJ0ID0gbW9kZWwuZ2V0UG9zaXRpb25BdChtYXRjaC5pbmRleCk7XG5cdFx0Y29uc3QgZW5kID0gbW9kZWwuZ2V0UG9zaXRpb25BdChtYXRjaC5pbmRleCArIG1hdGNoWzBdLmxlbmd0aCk7XG5cdFx0cmFuZ2VzLnB1c2goRWRpdG9yUmFuZ2UuZnJvbVBvc2l0aW9ucyhzdGFydCwgZW5kKSk7XG5cdFx0aWYgKG1hdGNoWzBdLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmVnZXgubGFzdEluZGV4Kys7XG5cdFx0fVxuXHRcdGlmIChyYW5nZXMubGVuZ3RoID49IGxpbWl0KSB7XG5cdFx0XHRicmVhaztcblx0XHR9XG5cdH1cblx0cmV0dXJuIHJhbmdlcztcbn1cblxuLyoqIEZpbmRzIHRleHQgYWNyb3NzIGEgY2hhdCB3aWRnZXQncyBsb2dpY2FsIHRyYW5zY3JpcHQuICovXG5leHBvcnQgY2xhc3MgQ2hhdEZpbmRXaWRnZXQgZXh0ZW5kcyBTaW1wbGVGaW5kV2lkZ2V0IGltcGxlbWVudHMgSUNoYXRGaW5kQ29udHJvbGxlciB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfbW9kZWw6IENoYXRGaW5kTW9kZWw7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZmluZFdpZGdldFZpc2libGVLZXk6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9maW5kV2lkZ2V0Rm9jdXNlZEtleTogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgcmVhZG9ubHkgX2ZpbmRJbnB1dEZvY3VzZWRLZXk6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3RhcmdldFdpbmRvdzogV2luZG93ICYgdHlwZW9mIGdsb2JhbFRoaXM7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfcmVwYWludFNjaGVkdWxlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfcmV2ZWFsU2NoZWR1bGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9yZWNvbXB1dGVEZWxheWVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IERlbGF5ZXI8dm9pZD4oMjAwKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NvZGVEZWNvcmF0aW9ucyA9IG5ldyBNYXA8Q29kZUJsb2NrUGFydCwgSUVkaXRvckRlY29yYXRpb25zQ29sbGVjdGlvbj4oKTtcblxuXHRwcml2YXRlIF9sYXN0Rm9jdXNlZEVsZW1lbnQ6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9sYXN0TmF2aWdhdGlvbldhc1ByZXZpb3VzID0gZmFsc2U7XG5cdHByaXZhdGUgX3VubG9jYXRhYmxlU2tpcHMgPSAwO1xuXG5cdC8qKiBCb3VuZHMgdGhlIHNraXAgd2FsayBzbyBhIHF1ZXJ5IHdob3NlIG1hdGNoZXMgYXJlIGFsbCB1bmxvY2F0YWJsZSBjYW5ub3Qgc3Bpbi4gKi9cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgTUFYX1VOTE9DQVRBQkxFX1NLSVBTID0gNTA7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBob3N0OiBJQ2hhdEZpbmRIb3N0LFxuXHRcdEBJQ29udGV4dFZpZXdTZXJ2aWNlIGNvbnRleHRWaWV3U2VydmljZTogSUNvbnRleHRWaWV3U2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2Uga2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElBY2Nlc3NpYmlsaXR5U2VydmljZSBhY2Nlc3NpYmlsaXR5U2VydmljZTogSUFjY2Vzc2liaWxpdHlTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRzaG93Q29tbW9uRmluZFRvZ2dsZXM6IHRydWUsXG5cdFx0XHRzaG93UmVzdWx0Q291bnQ6IHRydWUsXG5cdFx0XHRpbml0aWFsV2lkdGg6IENIQVRfRklORF9XSURHRVRfSU5JVElBTF9XSURUSCxcblx0XHRcdGVuYWJsZVNhc2g6IHRydWUsXG5cdFx0XHRhcHBlbmRDYXNlU2Vuc2l0aXZlQWN0aW9uSWQ6IENoYXRGaW5kQ29tbWFuZElkLlRvZ2dsZUZpbmRDYXNlU2Vuc2l0aXZlLFxuXHRcdFx0YXBwZW5kUmVnZXhBY3Rpb25JZDogQ2hhdEZpbmRDb21tYW5kSWQuVG9nZ2xlRmluZFJlZ2V4LFxuXHRcdFx0YXBwZW5kV2hvbGVXb3Jkc0FjdGlvbklkOiBDaGF0RmluZENvbW1hbmRJZC5Ub2dnbGVGaW5kV2hvbGVXb3JkLFxuXHRcdFx0cHJldmlvdXNNYXRjaEFjdGlvbklkOiBDaGF0RmluZENvbW1hbmRJZC5GaW5kUHJldmlvdXMsXG5cdFx0XHRuZXh0TWF0Y2hBY3Rpb25JZDogQ2hhdEZpbmRDb21tYW5kSWQuRmluZE5leHQsXG5cdFx0XHRjbG9zZVdpZGdldEFjdGlvbklkOiBDaGF0RmluZENvbW1hbmRJZC5GaW5kSGlkZSxcblx0XHR9LCBjb250ZXh0Vmlld1NlcnZpY2UsIGNvbnRleHRLZXlTZXJ2aWNlLCBob3ZlclNlcnZpY2UsIGtleWJpbmRpbmdTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSwgYWNjZXNzaWJpbGl0eVNlcnZpY2UpO1xuXG5cdFx0dGhpcy5fdGFyZ2V0V2luZG93ID0gZG9tLmdldFdpbmRvdyh0aGlzLmhvc3QudHJhbnNjcmlwdERvbU5vZGUpO1xuXG5cdFx0dGhpcy5fZmluZFdpZGdldFZpc2libGVLZXkgPSBDaGF0Q29udGV4dEtleXMuZmluZFdpZGdldFZpc2libGUuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLl9maW5kV2lkZ2V0Rm9jdXNlZEtleSA9IENoYXRDb250ZXh0S2V5cy5maW5kV2lkZ2V0Rm9jdXNlZC5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuX2ZpbmRJbnB1dEZvY3VzZWRLZXkgPSBDaGF0Q29udGV4dEtleXMuZmluZElucHV0Rm9jdXNlZC5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXG5cdFx0dGhpcy5fbW9kZWwgPSB0aGlzLl9yZWdpc3RlcihuZXcgQ2hhdEZpbmRNb2RlbCgoKSA9PiB0aGlzLmhvc3QuZ2V0SXRlbXMoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX21vZGVsLm9uRGlkQ2hhbmdlTWF0Y2hlcygoKSA9PiB0aGlzLl9vbk1hdGNoZXNDaGFuZ2VkKCkpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuaG9zdC5vbkRpZENoYW5nZUNvbnRlbnQoKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuaXNWaXNpYmxlKCkpIHtcblx0XHRcdFx0dGhpcy5fcmVjb21wdXRlRGVsYXllci50cmlnZ2VyKCgpID0+IHtcblx0XHRcdFx0XHR0aGlzLl9tb2RlbC5yZWNvbXB1dGUoKTtcblx0XHRcdFx0XHQvLyBUaGUgcm93IHVzdWFsbHkgcmVyZW5kZXJzIGJlZm9yZSB0aGlzIGRlYm91bmNlZCBwYXNzLCBzbyBpdHMgcmVwYWludCByYW5cblx0XHRcdFx0XHQvLyBhZ2FpbnN0IHRoZSBwcmV2aW91cyBtYXRjaCBzZXQ7IHJlcGFpbnQgYWdhaW4gbm93IHRoZSBuZXcgbWF0Y2hlcyBleGlzdC5cblx0XHRcdFx0XHR0aGlzLl9zY2hlZHVsZVJlcGFpbnQoKTtcblx0XHRcdFx0fSkuY2F0Y2goKCkgPT4geyB9KTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5ob3N0Lm9uRGlkUmVyZW5kZXJSb3coKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuaXNWaXNpYmxlKCkpIHtcblx0XHRcdFx0dGhpcy5fc2NoZWR1bGVSZXBhaW50KCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0ZG9tLmFwcGVuZCh0aGlzLmhvc3QudHJhbnNjcmlwdERvbU5vZGUucGFyZW50RWxlbWVudCA/PyB0aGlzLmhvc3QudHJhbnNjcmlwdERvbU5vZGUsIHRoaXMuZ2V0RG9tTm9kZSgpKTtcblx0fVxuXG5cdGdldCB2aXNpYmxlKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLmlzVmlzaWJsZSgpO1xuXHR9XG5cblx0b3ZlcnJpZGUgc2hvdyhzZWVkVGV4dD86IHN0cmluZywgZm9jdXM6IGJvb2xlYW4gPSB0cnVlKTogdm9pZCB7XG5cdFx0aWYgKHNob3VsZENhcHR1cmVGb2N1c0JlZm9yZVNob3codGhpcy5pc1Zpc2libGUoKSkpIHtcblx0XHRcdHRoaXMuX2xhc3RGb2N1c2VkRWxlbWVudCA9IHRoaXMuX3RhcmdldFdpbmRvdy5kb2N1bWVudC5hY3RpdmVFbGVtZW50IGFzIEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRcdH1cblx0XHR0aGlzLl9maW5kV2lkZ2V0VmlzaWJsZUtleS5zZXQodHJ1ZSk7XG5cdFx0aWYgKGZvY3VzKSB7XG5cdFx0XHRzdXBlci5yZXZlYWwoc2VlZFRleHQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRzdXBlci5zaG93KHNlZWRUZXh0KTtcblx0XHR9XG5cdFx0dGhpcy5fbW9kZWwuc2V0UXVlcnkodGhpcy5pbnB1dFZhbHVlLCB0aGlzLl9jdXJyZW50RmluZE9wdGlvbnMoKSk7XG5cdFx0dGhpcy5fbmF2aWdhdGVUb0FjdGl2ZSgpO1xuXHR9XG5cblx0b3ZlcnJpZGUgaGlkZSgpOiB2b2lkIHtcblx0XHRzdXBlci5oaWRlKCk7XG5cdFx0dGhpcy5fZmluZFdpZGdldFZpc2libGVLZXkucmVzZXQoKTtcblx0XHR0aGlzLl9yZWNvbXB1dGVEZWxheWVyLmNhbmNlbCgpO1xuXHRcdHRoaXMuX2NsZWFySGlnaGxpZ2h0cygpO1xuXHRcdHRoaXMuX21vZGVsLmNsZWFyKCk7XG5cdFx0dGhpcy5fcmVzdG9yZUZvY3VzKCk7XG5cdH1cblxuXHRmaW5kKHByZXZpb3VzOiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy5fbGFzdE5hdmlnYXRpb25XYXNQcmV2aW91cyA9IHByZXZpb3VzO1xuXHRcdHRoaXMuX3VubG9jYXRhYmxlU2tpcHMgPSAwO1xuXHRcdHRoaXMuX2FkdmFuY2VBY3RpdmVNYXRjaChwcmV2aW91cyk7XG5cdH1cblxuXHRwcml2YXRlIF9hZHZhbmNlQWN0aXZlTWF0Y2gocHJldmlvdXM6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAocHJldmlvdXMpIHtcblx0XHRcdHRoaXMuX21vZGVsLnByZXZpb3VzKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX21vZGVsLm5leHQoKTtcblx0XHR9XG5cdFx0dGhpcy5fbmF2aWdhdGVUb0FjdGl2ZSgpO1xuXHRcdHZvaWQgdGhpcy51cGRhdGVSZXN1bHRDb3VudCgpO1xuXHR9XG5cblx0LyoqXG5cdCAqIE1vdmVzIHBhc3QgYSBtYXRjaCB0aGUgRE9NIGNhbm5vdCBwcm9kdWNlLCBzbyBuYXZpZ2F0aW9uIG5ldmVyIGFwcGVhcnMgdG8gZG8gbm90aGluZy4gVGhlXG5cdCAqIGluZGV4IHByZWRpY3RzIHdoZXJlIHRoZSByZW5kZXJlciB3aWxsIHB1dCBjb250ZW50LCBhbmQgYSBwYXJ0IG5lc3RlZCBpbiBhIGxhemlseS1idWlsdFxuXHQgKiBjb250YWluZXIgaGFzIG5vIERPTSBub2RlIHRvIGxhbmQgb247IHJhdGhlciB0aGFuIHN0YWxsLCBjb250aW51ZSBpbiB0aGUgc2FtZSBkaXJlY3Rpb24uXG5cdCAqL1xuXHRwcml2YXRlIF9za2lwVW5sb2NhdGFibGVNYXRjaCgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fdW5sb2NhdGFibGVTa2lwcyA+PSBDaGF0RmluZFdpZGdldC5NQVhfVU5MT0NBVEFCTEVfU0tJUFMpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fdW5sb2NhdGFibGVTa2lwcysrO1xuXHRcdHRoaXMuX2FkdmFuY2VBY3RpdmVNYXRjaCh0aGlzLl9sYXN0TmF2aWdhdGlvbldhc1ByZXZpb3VzKTtcblx0fVxuXG5cdGZpbmRGaXJzdCgpOiB2b2lkIHtcblx0XHR0aGlzLl9tb2RlbC5zZXRRdWVyeSh0aGlzLmlucHV0VmFsdWUsIHRoaXMuX2N1cnJlbnRGaW5kT3B0aW9ucygpKTtcblx0XHR0aGlzLl9uYXZpZ2F0ZVRvQWN0aXZlKCk7XG5cdH1cblxuXHRuZXh0KCk6IHZvaWQge1xuXHRcdHRoaXMuZmluZChmYWxzZSk7XG5cdH1cblxuXHRwcmV2aW91cygpOiB2b2lkIHtcblx0XHR0aGlzLmZpbmQodHJ1ZSk7XG5cdH1cblxuXHRmb2N1cygpOiB2b2lkIHtcblx0XHR0aGlzLmZvY3VzRmluZEJveCgpO1xuXHR9XG5cblx0dG9nZ2xlQ2FzZVNlbnNpdGl2ZSgpOiB2b2lkIHtcblx0XHR0aGlzLmNoYW5nZVN0YXRlKHsgbWF0Y2hDYXNlOiAhdGhpcy5fZ2V0Q2FzZVNlbnNpdGl2ZVZhbHVlKCkgfSk7XG5cdH1cblxuXHR0b2dnbGVXaG9sZVdvcmQoKTogdm9pZCB7XG5cdFx0dGhpcy5jaGFuZ2VTdGF0ZSh7IHdob2xlV29yZDogIXRoaXMuX2dldFdob2xlV29yZFZhbHVlKCkgfSk7XG5cdH1cblxuXHR0b2dnbGVSZWdleCgpOiB2b2lkIHtcblx0XHR0aGlzLmNoYW5nZVN0YXRlKHsgaXNSZWdleDogIXRoaXMuX2dldFJlZ2V4VmFsdWUoKSB9KTtcblx0fVxuXG5cdHByb3RlY3RlZCBfb25JbnB1dENoYW5nZWQoKTogYm9vbGVhbiB7XG5cdFx0dGhpcy5fbW9kZWwuc2V0UXVlcnkodGhpcy5pbnB1dFZhbHVlLCB0aGlzLl9jdXJyZW50RmluZE9wdGlvbnMoKSk7XG5cdFx0dGhpcy5fbmF2aWdhdGVUb0FjdGl2ZSgpO1xuXHRcdHJldHVybiB0aGlzLl9tb2RlbC5tYXRjaGVzLmxlbmd0aCA+IDA7XG5cdH1cblxuXHRwcm90ZWN0ZWQgYXN5bmMgX2dldFJlc3VsdENvdW50KCk6IFByb21pc2U8eyByZXN1bHRJbmRleDogbnVtYmVyOyByZXN1bHRDb3VudDogbnVtYmVyIH0gfCB1bmRlZmluZWQ+IHtcblx0XHRpZiAodGhpcy5fbW9kZWwuaXNJbnZhbGlkUmVnZXgpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiB7IHJlc3VsdEluZGV4OiB0aGlzLl9tb2RlbC5hY3RpdmVJbmRleCwgcmVzdWx0Q291bnQ6IHRoaXMuX21vZGVsLm1hdGNoZXMubGVuZ3RoIH07XG5cdH1cblxuXHRwcm90ZWN0ZWQgX29uRm9jdXNUcmFja2VyRm9jdXMoKTogdm9pZCB7XG5cdFx0dGhpcy5fZmluZFdpZGdldEZvY3VzZWRLZXkuc2V0KHRydWUpO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9vbkZvY3VzVHJhY2tlckJsdXIoKTogdm9pZCB7XG5cdFx0dGhpcy5fZmluZFdpZGdldEZvY3VzZWRLZXkucmVzZXQoKTtcblx0fVxuXG5cdHByb3RlY3RlZCBfb25GaW5kSW5wdXRGb2N1c1RyYWNrZXJGb2N1cygpOiB2b2lkIHtcblx0XHR0aGlzLl9maW5kSW5wdXRGb2N1c2VkS2V5LnNldCh0cnVlKTtcblx0fVxuXG5cdHByb3RlY3RlZCBfb25GaW5kSW5wdXRGb2N1c1RyYWNrZXJCbHVyKCk6IHZvaWQge1xuXHRcdHRoaXMuX2ZpbmRJbnB1dEZvY3VzZWRLZXkucmVzZXQoKTtcblx0fVxuXG5cdHByaXZhdGUgX2N1cnJlbnRGaW5kT3B0aW9ucygpIHtcblx0XHRyZXR1cm4geyBpc1JlZ2V4OiB0aGlzLl9nZXRSZWdleFZhbHVlKCksIG1hdGNoQ2FzZTogdGhpcy5fZ2V0Q2FzZVNlbnNpdGl2ZVZhbHVlKCksIHdob2xlV29yZDogdGhpcy5fZ2V0V2hvbGVXb3JkVmFsdWUoKSB9O1xuXHR9XG5cblx0cHJpdmF0ZSBfb25NYXRjaGVzQ2hhbmdlZCgpOiB2b2lkIHtcblx0XHR2b2lkIHRoaXMudXBkYXRlUmVzdWx0Q291bnQoKTtcblx0fVxuXG5cdHByaXZhdGUgX25hdmlnYXRlVG9BY3RpdmUoKTogdm9pZCB7XG5cdFx0Y29uc3QgbWF0Y2ggPSB0aGlzLl9tb2RlbC5hY3RpdmVNYXRjaDtcblx0XHR0aGlzLl9jbGVhckhpZ2hsaWdodHMoKTtcblxuXHRcdGlmICghbWF0Y2gpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBpdGVtID0gdGhpcy5fZmluZEl0ZW1Gb3JNYXRjaChtYXRjaCk7XG5cdFx0aWYgKGl0ZW0pIHtcblx0XHRcdHRoaXMuaG9zdC5yZXZlYWwoaXRlbSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fcmV2ZWFsU2NoZWR1bGVyLnZhbHVlID0gZG9tLnNjaGVkdWxlQXROZXh0QW5pbWF0aW9uRnJhbWUodGhpcy5fdGFyZ2V0V2luZG93LCAoKSA9PiB0aGlzLl9yZXZlYWxBY3RpdmVNYXRjaChtYXRjaCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmV2ZWFsQWN0aXZlTWF0Y2gobWF0Y2g6IElDaGF0RmluZE1hdGNoKTogdm9pZCB7XG5cdFx0Y29uc3QgbG9jYXRlZE1hdGNoID0gdGhpcy5fbG9jYXRlTWF0Y2gobWF0Y2gpO1xuXHRcdGlmICghbG9jYXRlZE1hdGNoKSB7XG5cdFx0XHR0aGlzLl9yZXBhaW50VmlzaWJsZUhpZ2hsaWdodHMoKTtcblx0XHRcdHRoaXMuX3NraXBVbmxvY2F0YWJsZU1hdGNoKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmIChpc0NvZGVNYXRjaChsb2NhdGVkTWF0Y2gpKSB7XG5cdFx0XHRjb25zdCByZXZlYWxDb2RlTWF0Y2ggPSAoKSA9PiB7XG5cdFx0XHRcdGxvY2F0ZWRNYXRjaC5jb2RlQmxvY2suZWRpdG9yLnJldmVhbFJhbmdlSW5DZW50ZXIobG9jYXRlZE1hdGNoLnJhbmdlKTtcblx0XHRcdFx0dGhpcy5fcmVwYWludFZpc2libGVIaWdobGlnaHRzKCk7XG5cdFx0XHR9O1xuXHRcdFx0aWYgKG9wZW5BbmNlc3RvckRpc2Nsb3N1cmVzKHRoaXMuaG9zdC50cmFuc2NyaXB0RG9tTm9kZSwgbG9jYXRlZE1hdGNoLmNvZGVCbG9jay5lbGVtZW50KSkge1xuXHRcdFx0XHR0aGlzLl9yZXZlYWxTY2hlZHVsZXIudmFsdWUgPSBkb20uc2NoZWR1bGVBdE5leHRBbmltYXRpb25GcmFtZSh0aGlzLl90YXJnZXRXaW5kb3csIHJldmVhbENvZGVNYXRjaCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXZlYWxDb2RlTWF0Y2goKTtcblx0XHRcdH1cblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCByYW5nZSA9IGxvY2F0ZWRNYXRjaDtcblx0XHRjb25zdCBvcGVuZWQgPSB0aGlzLl9vcGVuQW5jZXN0b3JEaXNjbG9zdXJlcyhyYW5nZSk7XG5cdFx0dGhpcy5fcmVwYWludFZpc2libGVIaWdobGlnaHRzKCk7XG5cdFx0aWYgKG9wZW5lZCkge1xuXHRcdFx0dGhpcy5fcmV2ZWFsU2NoZWR1bGVyLnZhbHVlID0gZG9tLnNjaGVkdWxlQXROZXh0QW5pbWF0aW9uRnJhbWUodGhpcy5fdGFyZ2V0V2luZG93LCAoKSA9PiB0aGlzLl9zY3JvbGxSYW5nZUludG9WaWV3KHJhbmdlKSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX3Njcm9sbFJhbmdlSW50b1ZpZXcocmFuZ2UpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3Njcm9sbFJhbmdlSW50b1ZpZXcocmFuZ2U6IFJhbmdlIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0Y29uc3QgY29udGFpbmVyID0gcmFuZ2UgJiYgKHJhbmdlLnN0YXJ0Q29udGFpbmVyLm5vZGVUeXBlID09PSB0aGlzLl90YXJnZXRXaW5kb3cuTm9kZS5FTEVNRU5UX05PREUgPyByYW5nZS5zdGFydENvbnRhaW5lciBhcyBFbGVtZW50IDogcmFuZ2Uuc3RhcnRDb250YWluZXIucGFyZW50RWxlbWVudCk7XG5cdFx0Y29udGFpbmVyPy5zY3JvbGxJbnRvVmlldyh7IGJsb2NrOiAnbmVhcmVzdCcsIGlubGluZTogJ25lYXJlc3QnIH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfZmluZEl0ZW1Gb3JNYXRjaChtYXRjaDogSUNoYXRGaW5kTWF0Y2gpOiBDaGF0VHJlZUl0ZW0gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLmhvc3QuZ2V0SXRlbXMoKS5maW5kKGl0ZW0gPT4gaXRlbS5pZCA9PT0gbWF0Y2guaXRlbUlkKTtcblx0fVxuXG5cdC8qKiBPcGVucyBldmVyeSBjbG9zZWQgYDxkZXRhaWxzPmAgYW5jZXN0b3Igb2YgYHJhbmdlYCwgdXAgdG8gdGhlIHRyYW5zY3JpcHQgcm9vdC4gUmV0dXJucyB3aGV0aGVyIGFueSB3ZXJlIHRvZ2dsZWQuICovXG5cdHByaXZhdGUgX29wZW5BbmNlc3RvckRpc2Nsb3N1cmVzKHJhbmdlOiBSYW5nZSk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBvcGVuQW5jZXN0b3JEaXNjbG9zdXJlcyh0aGlzLmhvc3QudHJhbnNjcmlwdERvbU5vZGUsIHJhbmdlLnN0YXJ0Q29udGFpbmVyKTtcblx0fVxuXG5cdHByaXZhdGUgX3NjaGVkdWxlUmVwYWludCgpOiB2b2lkIHtcblx0XHR0aGlzLl9yZXBhaW50U2NoZWR1bGVyLnZhbHVlID0gZG9tLnNjaGVkdWxlQXROZXh0QW5pbWF0aW9uRnJhbWUodGhpcy5fdGFyZ2V0V2luZG93LCAoKSA9PiB0aGlzLl9yZXBhaW50VmlzaWJsZUhpZ2hsaWdodHMoKSk7XG5cdH1cblxuXHRwcml2YXRlIF90cnlDcmVhdGVSZWdleCgpOiBSZWdFeHAgfCB1bmRlZmluZWQge1xuXHRcdHRyeSB7XG5cdFx0XHRyZXR1cm4gY3JlYXRlUmVnRXhwKHRoaXMuX21vZGVsLnF1ZXJ5LCB0aGlzLl9tb2RlbC5vcHRpb25zLmlzUmVnZXgsIHtcblx0XHRcdFx0bWF0Y2hDYXNlOiB0aGlzLl9tb2RlbC5vcHRpb25zLm1hdGNoQ2FzZSxcblx0XHRcdFx0d2hvbGVXb3JkOiB0aGlzLl9tb2RlbC5vcHRpb25zLndob2xlV29yZCxcblx0XHRcdFx0Z2xvYmFsOiB0cnVlLFxuXHRcdFx0XHR1bmljb2RlOiB0cnVlLFxuXHRcdFx0fSk7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBUaGUgRE9NIHN1YnRyZWVzIHRoYXQgY2FuIG93biBgbWF0Y2hgLCBpbiBkb2N1bWVudCBvcmRlci4gTWF0Y2hlcyB3aXRoIGEgcmVuZGVyZWQgcGFydCB1c2Vcblx0ICogaXQgZGlyZWN0bHk7IHJvdy1sZXZlbCByZXNwb25zZSBtYXRjaGVzIHNlYXJjaCB0aGUgdHJhaWxpbmcgcGFydHMgKGVycm9yIGRldGFpbHMgYW5kIG90aGVyXG5cdCAqIGNvbnRlbnQgZm9sbG93aW5nIHRoZSByZXNwb25zZSBib2R5KSBzbyB0aGVpciBvY2N1cnJlbmNlIGlzIG5vdCBjb3VudGVkIGFnYWluc3QgdGhlIGJvZHkuXG5cdCAqL1xuXHRwcml2YXRlIF9sb2NhdGVNYXRjaFJvb3RzKG1hdGNoOiBJQ2hhdEZpbmRNYXRjaCwgdGVtcGxhdGU6IElDaGF0TGlzdEl0ZW1UZW1wbGF0ZSB8IHVuZGVmaW5lZCk6IEhUTUxFbGVtZW50W10ge1xuXHRcdGlmIChtYXRjaC5wYXJ0SW5kZXggPj0gMCkge1xuXHRcdFx0Y29uc3QgcGFydFJvb3QgPSB0ZW1wbGF0ZT8ucmVuZGVyZWRQYXJ0cz8uW21hdGNoLnBhcnRJbmRleF0/LmRvbU5vZGU7XG5cdFx0XHRpZiAocGFydFJvb3QpIHtcblx0XHRcdFx0cmV0dXJuIFtwYXJ0Um9vdF07XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmIChtYXRjaC5zY29wZVN0YXJ0UGFydEluZGV4ICE9PSB1bmRlZmluZWQgJiYgdGVtcGxhdGU/LnJlbmRlcmVkUGFydHMpIHtcblx0XHRcdGNvbnN0IHRyYWlsaW5nID0gdGVtcGxhdGUucmVuZGVyZWRQYXJ0cy5zbGljZShtYXRjaC5zY29wZVN0YXJ0UGFydEluZGV4KS5tYXAocGFydCA9PiBwYXJ0Py5kb21Ob2RlKS5maWx0ZXIoaXNEZWZpbmVkKTtcblx0XHRcdGlmICh0cmFpbGluZy5sZW5ndGgpIHtcblx0XHRcdFx0cmV0dXJuIHRyYWlsaW5nO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdGVtcGxhdGU/LnZhbHVlID8gW3RlbXBsYXRlLnZhbHVlXSA6IFtdO1xuXHR9XG5cblx0LyoqIExvY2F0ZXMgdGhlIGFjdGl2ZSBtYXRjaCdzIERPTSByYW5nZSB3aXRoaW4gaXRzIHJlbmRlcmVkIGNvbnRlbnQgcGFydCAob3IgdGhlIHdob2xlIHJvdyBhcyBhIGZhbGxiYWNrKS4gKi9cblx0cHJpdmF0ZSBfbG9jYXRlTWF0Y2gobWF0Y2g6IElDaGF0RmluZE1hdGNoLCByZWdleD86IFJlZ0V4cCk6IExvY2F0ZWRNYXRjaCB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgdGVtcGxhdGUgPSB0aGlzLmhvc3QuZ2V0VGVtcGxhdGVEYXRhRm9yUmVxdWVzdElkKG1hdGNoLml0ZW1JZCk7XG5cdFx0Y29uc3Qgcm9vdHMgPSB0aGlzLl9sb2NhdGVNYXRjaFJvb3RzKG1hdGNoLCB0ZW1wbGF0ZSk7XG5cdFx0aWYgKCFyb290cy5sZW5ndGgpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IGVmZmVjdGl2ZVJlZ2V4ID0gcmVnZXggPz8gdGhpcy5fdHJ5Q3JlYXRlUmVnZXgoKTtcblx0XHRpZiAoIWVmZmVjdGl2ZVJlZ2V4KSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IGxvY2F0aW9uczogeyBub2RlOiBOb2RlOyBvcmRlcjogbnVtYmVyOyBtYXRjaDogTG9jYXRlZE1hdGNoIH1bXSA9IFtdO1xuXHRcdGZvciAoY29uc3Qgcm9vdCBvZiByb290cykge1xuXHRcdFx0Y29uc3QgY29kZUJsb2NrcyA9IFsuLi50aGlzLmhvc3QuZWRpdG9yc0luVXNlKCldXG5cdFx0XHRcdC5maWx0ZXIoY29kZUJsb2NrID0+IHJvb3QuY29udGFpbnMoY29kZUJsb2NrLmVsZW1lbnQpKVxuXHRcdFx0XHQuc29ydCgoZmlyc3QsIHNlY29uZCkgPT4gZmlyc3QuZWxlbWVudC5jb21wYXJlRG9jdW1lbnRQb3NpdGlvbihzZWNvbmQuZWxlbWVudCkgJiA0ID8gLTEgOiAxKTtcblxuXHRcdFx0ZmluZE1hdGNoUmFuZ2VzSW5Eb20oXG5cdFx0XHRcdHJvb3QsXG5cdFx0XHRcdGVmZmVjdGl2ZVJlZ2V4LFxuXHRcdFx0XHRtYXRjaC5vY2N1cnJlbmNlSW5kZXggKyAxLFxuXHRcdFx0XHRjb2RlQmxvY2tzLm1hcChjb2RlQmxvY2sgPT4gY29kZUJsb2NrLmVsZW1lbnQpXG5cdFx0XHQpLmZvckVhY2goKHJhbmdlLCBvcmRlcikgPT4gbG9jYXRpb25zLnB1c2goeyBub2RlOiByYW5nZS5zdGFydENvbnRhaW5lciwgb3JkZXIsIG1hdGNoOiByYW5nZSB9KSk7XG5cblx0XHRcdGZvciAoY29uc3QgY29kZUJsb2NrIG9mIGNvZGVCbG9ja3MpIHtcblx0XHRcdFx0Y29uc3QgcmFuZ2VzID0gZmluZE1hdGNoUmFuZ2VzSW5Db2RlQmxvY2soY29kZUJsb2NrLCBlZmZlY3RpdmVSZWdleCwgbWF0Y2gub2NjdXJyZW5jZUluZGV4ICsgMSk7XG5cdFx0XHRcdGZvciAobGV0IG9yZGVyID0gMDsgb3JkZXIgPCByYW5nZXMubGVuZ3RoOyBvcmRlcisrKSB7XG5cdFx0XHRcdFx0bG9jYXRpb25zLnB1c2goe1xuXHRcdFx0XHRcdFx0bm9kZTogY29kZUJsb2NrLmVsZW1lbnQsXG5cdFx0XHRcdFx0XHRvcmRlcixcblx0XHRcdFx0XHRcdG1hdGNoOiB7IGNvZGVCbG9jaywgcmFuZ2U6IHJhbmdlc1tvcmRlcl0gfSxcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRsb2NhdGlvbnMuc29ydCgoZmlyc3QsIHNlY29uZCkgPT4gZmlyc3Qubm9kZSA9PT0gc2Vjb25kLm5vZGVcblx0XHRcdD8gZmlyc3Qub3JkZXIgLSBzZWNvbmQub3JkZXJcblx0XHRcdDogZmlyc3Qubm9kZS5jb21wYXJlRG9jdW1lbnRQb3NpdGlvbihzZWNvbmQubm9kZSkgJiA0ID8gLTEgOiAxKTtcblx0XHRyZXR1cm4gbG9jYXRpb25zW21hdGNoLm9jY3VycmVuY2VJbmRleF0/Lm1hdGNoO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVwYWludFZpc2libGVIaWdobGlnaHRzKCk6IHZvaWQge1xuXHRcdGNvbnN0IHJlZ2lzdHJ5ID0gZ2V0Q2hhdEZpbmRIaWdobGlnaHRSZWdpc3RyeSh0aGlzLl90YXJnZXRXaW5kb3cpO1xuXG5cdFx0aWYgKCF0aGlzLmlzVmlzaWJsZSgpIHx8ICF0aGlzLl9tb2RlbC5tYXRjaGVzLmxlbmd0aCB8fCAhdGhpcy5fbW9kZWwucXVlcnkpIHtcblx0XHRcdHJlZ2lzdHJ5LmNsZWFyKHRoaXMpO1xuXHRcdFx0dGhpcy5fdXBkYXRlQ29kZURlY29yYXRpb25zKG5ldyBNYXAoKSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVnZXggPSB0aGlzLl90cnlDcmVhdGVSZWdleCgpO1xuXHRcdGlmICghcmVnZXgpIHtcblx0XHRcdHJlZ2lzdHJ5LmNsZWFyKHRoaXMpO1xuXHRcdFx0dGhpcy5fdXBkYXRlQ29kZURlY29yYXRpb25zKG5ldyBNYXAoKSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgY3VycmVudFJhbmdlczogUmFuZ2VbXSA9IFtdO1xuXHRcdGNvbnN0IG90aGVyUmFuZ2VzOiBSYW5nZVtdID0gW107XG5cdFx0Y29uc3QgY29kZURlY29yYXRpb25zID0gbmV3IE1hcDxDb2RlQmxvY2tQYXJ0LCB7IHJhbmdlOiBFZGl0b3JSYW5nZTsgY3VycmVudDogYm9vbGVhbiB9W10+KCk7XG5cdFx0Ly8gQ291bnRzIGNvZGUtYmxvY2sgbWF0Y2hlcyB0b286IHRoZXkgYXJlIHBhaW50ZWQgYXMgZWRpdG9yIGRlY29yYXRpb25zIHJhdGhlciB0aGFuIERPTVxuXHRcdC8vIHJhbmdlcywgc28gYm91bmRpbmcgb25seSB0aGUgcmFuZ2VzIHdvdWxkIGxldCBhbiBhbGwtY29kZSByZXN1bHQgc2V0IHJlc2NhbiBldmVyeSBtYXRjaC5cblx0XHRsZXQgbG9jYXRlZENvdW50ID0gMDtcblx0XHQvLyBNb3N0IG1hdGNoZXMgdXN1YWxseSBiZWxvbmcgdG8gcm93cyB0aGUgdmlydHVhbGl6ZWQgbGlzdCBoYXMgbm90IHJlbmRlcmVkLiBTa2lwcGluZyB0aGVtXG5cdFx0Ly8gb24gdGhlIHJvdyBsb29rdXAgYWxvbmUga2VlcHMgYSB0cmFuc2NyaXB0LXdpZGUgcmVzdWx0IHNldCBmcm9tIHNjYW5uaW5nIHBhcnRzIHBlciByZXBhaW50LlxuXHRcdGNvbnN0IHJlbmRlcmVkUm93cyA9IG5ldyBNYXA8c3RyaW5nLCBib29sZWFuPigpO1xuXHRcdGZvciAobGV0IGluZGV4ID0gMDsgaW5kZXggPCB0aGlzLl9tb2RlbC5tYXRjaGVzLmxlbmd0aCAmJiBsb2NhdGVkQ291bnQgPCBNQVhfVklTSUJMRV9ISUdITElHSFRTOyBpbmRleCsrKSB7XG5cdFx0XHRjb25zdCBtYXRjaCA9IHRoaXMuX21vZGVsLm1hdGNoZXNbaW5kZXhdO1xuXHRcdFx0bGV0IGlzUmVuZGVyZWQgPSByZW5kZXJlZFJvd3MuZ2V0KG1hdGNoLml0ZW1JZCk7XG5cdFx0XHRpZiAoaXNSZW5kZXJlZCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdGlzUmVuZGVyZWQgPSAhIXRoaXMuaG9zdC5nZXRUZW1wbGF0ZURhdGFGb3JSZXF1ZXN0SWQobWF0Y2guaXRlbUlkKTtcblx0XHRcdFx0cmVuZGVyZWRSb3dzLnNldChtYXRjaC5pdGVtSWQsIGlzUmVuZGVyZWQpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCFpc1JlbmRlcmVkKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgbG9jYXRlZE1hdGNoID0gdGhpcy5fbG9jYXRlTWF0Y2gobWF0Y2gsIHJlZ2V4KTtcblx0XHRcdGlmICghbG9jYXRlZE1hdGNoKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0bG9jYXRlZENvdW50Kys7XG5cdFx0XHRpZiAoaXNDb2RlTWF0Y2gobG9jYXRlZE1hdGNoKSkge1xuXHRcdFx0XHRjb25zdCBkZWNvcmF0aW9ucyA9IGNvZGVEZWNvcmF0aW9ucy5nZXQobG9jYXRlZE1hdGNoLmNvZGVCbG9jaykgPz8gW107XG5cdFx0XHRcdGRlY29yYXRpb25zLnB1c2goeyByYW5nZTogbG9jYXRlZE1hdGNoLnJhbmdlLCBjdXJyZW50OiBpbmRleCA9PT0gdGhpcy5fbW9kZWwuYWN0aXZlSW5kZXggfSk7XG5cdFx0XHRcdGNvZGVEZWNvcmF0aW9ucy5zZXQobG9jYXRlZE1hdGNoLmNvZGVCbG9jaywgZGVjb3JhdGlvbnMpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0KGluZGV4ID09PSB0aGlzLl9tb2RlbC5hY3RpdmVJbmRleCA/IGN1cnJlbnRSYW5nZXMgOiBvdGhlclJhbmdlcykucHVzaChsb2NhdGVkTWF0Y2gpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChzdXBwb3J0c0Nzc0hpZ2hsaWdodEFwaSh0aGlzLl90YXJnZXRXaW5kb3cpKSB7XG5cdFx0XHRyZWdpc3RyeS5zZXRSYW5nZXModGhpcywgQ1VSUkVOVF9NQVRDSF9ISUdITElHSFRfTkFNRSwgY3VycmVudFJhbmdlcywgMSk7XG5cdFx0XHRyZWdpc3RyeS5zZXRSYW5nZXModGhpcywgT1RIRVJfTUFUQ0hfSElHSExJR0hUX05BTUUsIG90aGVyUmFuZ2VzLCAwKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmVnaXN0cnkuY2xlYXIodGhpcyk7XG5cdFx0fVxuXHRcdHRoaXMuX3VwZGF0ZUNvZGVEZWNvcmF0aW9ucyhjb2RlRGVjb3JhdGlvbnMpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlQ29kZURlY29yYXRpb25zKG1hdGNoZXM6IE1hcDxDb2RlQmxvY2tQYXJ0LCB7IHJhbmdlOiBFZGl0b3JSYW5nZTsgY3VycmVudDogYm9vbGVhbiB9W10+KTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBbY29kZUJsb2NrLCBjb2xsZWN0aW9uXSBvZiB0aGlzLl9jb2RlRGVjb3JhdGlvbnMpIHtcblx0XHRcdGNvbGxlY3Rpb24uY2xlYXIoKTtcblx0XHRcdGlmICghbWF0Y2hlcy5oYXMoY29kZUJsb2NrKSkge1xuXHRcdFx0XHR0aGlzLl9jb2RlRGVjb3JhdGlvbnMuZGVsZXRlKGNvZGVCbG9jayk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGZvciAoY29uc3QgW2NvZGVCbG9jaywgZGVjb3JhdGlvbnNdIG9mIG1hdGNoZXMpIHtcblx0XHRcdGxldCBjb2xsZWN0aW9uID0gdGhpcy5fY29kZURlY29yYXRpb25zLmdldChjb2RlQmxvY2spO1xuXHRcdFx0aWYgKCFjb2xsZWN0aW9uKSB7XG5cdFx0XHRcdGNvbGxlY3Rpb24gPSBjb2RlQmxvY2suZWRpdG9yLmNyZWF0ZURlY29yYXRpb25zQ29sbGVjdGlvbigpO1xuXHRcdFx0XHR0aGlzLl9jb2RlRGVjb3JhdGlvbnMuc2V0KGNvZGVCbG9jaywgY29sbGVjdGlvbik7XG5cdFx0XHR9XG5cdFx0XHRjb2xsZWN0aW9uLnNldChkZWNvcmF0aW9ucy5tYXAoKHsgcmFuZ2UsIGN1cnJlbnQgfSkgPT4gKHtcblx0XHRcdFx0cmFuZ2UsXG5cdFx0XHRcdG9wdGlvbnM6IHtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogY3VycmVudCA/ICdjaGF0LWZpbmQtY3VycmVudC1tYXRjaCcgOiAnY2hhdC1maW5kLW90aGVyLW1hdGNoJyxcblx0XHRcdFx0XHRpbmxpbmVDbGFzc05hbWU6IGN1cnJlbnQgPyAnY2hhdC1maW5kLWN1cnJlbnQtbWF0Y2gnIDogJ2NoYXQtZmluZC1vdGhlci1tYXRjaCcsXG5cdFx0XHRcdH0sXG5cdFx0XHR9KSkpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2NsZWFySGlnaGxpZ2h0cygpOiB2b2lkIHtcblx0XHRnZXRDaGF0RmluZEhpZ2hsaWdodFJlZ2lzdHJ5KHRoaXMuX3RhcmdldFdpbmRvdykuY2xlYXIodGhpcyk7XG5cdFx0dGhpcy5fdXBkYXRlQ29kZURlY29yYXRpb25zKG5ldyBNYXAoKSk7XG5cdH1cblxuXHRwcml2YXRlIF9yZXN0b3JlRm9jdXMoKTogdm9pZCB7XG5cdFx0Y29uc3QgdGFyZ2V0ID0gdGhpcy5fbGFzdEZvY3VzZWRFbGVtZW50O1xuXHRcdHRoaXMuX2xhc3RGb2N1c2VkRWxlbWVudCA9IHVuZGVmaW5lZDtcblx0XHRpZiAodGFyZ2V0ICYmIHRhcmdldC5pc0Nvbm5lY3RlZCkge1xuXHRcdFx0dGFyZ2V0LmZvY3VzKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuaG9zdC50cmFuc2NyaXB0RG9tTm9kZS5mb2N1cygpO1xuXHRcdH1cblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fY2xlYXJIaWdobGlnaHRzKCk7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLE9BQU87QUFDUCxZQUFZLFNBQVM7QUFDckIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsaUJBQWlCO0FBRTFCLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsU0FBUyxtQkFBbUI7QUFFckMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBc0IsMEJBQTBCO0FBQ2hELFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsdUJBQXVCO0FBSWhDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsOEJBQThCLCtCQUErQjtBQUN0RSxTQUFTLHFCQUFxQztBQWE5QyxNQUFNLHlCQUF5QjtBQUUvQixNQUFNLGlDQUFpQztBQUV2QyxNQUFNLCtCQUErQjtBQUNyQyxNQUFNLDZCQUE2QjtBQU1uQyxNQUFNLGNBQWMsb0JBQUksSUFBSSxDQUFDLEtBQUssUUFBUSxLQUFLLE9BQU8sT0FBTyxRQUFRLFFBQVEsUUFBUSxPQUFPLE9BQU8sTUFBTSxLQUFLLE9BQU8sT0FBTyxRQUFRLEtBQUssS0FBSyxRQUFRLFNBQVMsUUFBUSxVQUFVLE9BQU8sT0FBTyxRQUFRLEtBQUssS0FBSyxDQUFDO0FBR2xOLFNBQVMsYUFBYSxNQUFZLE1BQTRCO0FBQzdELE1BQUksVUFBVSxLQUFLO0FBQ25CLFNBQU8sV0FBVyxZQUFZLFFBQVEsWUFBWSxJQUFJLFFBQVEsT0FBTyxHQUFHO0FB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
