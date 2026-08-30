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
import * as dom from "../../../../base/browser/dom.js";
import { asArray, compareBy, numberComparator } from "../../../../base/common/arrays.js";
import { CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { isEmptyMarkdownString, MarkdownString } from "../../../../base/common/htmlContent.js";
import { DisposableStore, toDisposable } from "../../../../base/common/lifecycle.js";
import { IMarkdownRendererService } from "../../../../platform/markdown/browser/markdownRenderer.js";
import { DECREASE_HOVER_VERBOSITY_ACTION_ID, INCREASE_HOVER_VERBOSITY_ACTION_ID, HIDE_LONG_LINE_WARNING_HOVER_ACTION_ID } from "./hoverActionIds.js";
import { Range } from "../../../common/core/range.js";
import { HoverAnchorType, RenderedHoverParts } from "./hoverTypes.js";
import * as nls from "../../../../nls.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { ILanguageFeaturesService } from "../../../common/services/languageFeatures.js";
import { EditorOption } from "../../../common/config/editorOptions.js";
import { HoverVerbosityAction } from "../../../common/languages.js";
import { registerIcon } from "../../../../platform/theme/common/iconRegistry.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { onUnexpectedExternalError } from "../../../../base/common/errors.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { ClickAction, HoverPosition, KeyDownAction } from "../../../../base/browser/ui/hover/hoverWidget.js";
import { KeyCode } from "../../../../base/common/keyCodes.js";
import { IHoverService, WorkbenchHoverDelegate } from "../../../../platform/hover/browser/hover.js";
import { AsyncIterableProducer } from "../../../../base/common/async.js";
import { getHoverProviderResultsAsAsyncIterable } from "./getHover.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
const $ = dom.$;
const increaseHoverVerbosityIcon = registerIcon("hover-increase-verbosity", Codicon.addSmall, nls.localize("increaseHoverVerbosity", "Icon for increaseing hover verbosity."));
const decreaseHoverVerbosityIcon = registerIcon("hover-decrease-verbosity", Codicon.removeSmall, nls.localize("decreaseHoverVerbosity", "Icon for decreasing hover verbosity."));
class MarkdownHover {
  constructor(owner, range, contents, isBeforeContent, ordinal, source = void 0) {
    this.owner = owner;
    this.range = range;
    this.contents = contents;
    this.isBeforeContent = isBeforeContent;
    this.ordinal = ordinal;
    this.source = source;
  }
  isValidForHoverAnchor(anchor) {
    return anchor.type === HoverAnchorType.Range && this.range.startColumn <= anchor.range.startColumn && this.range.endColumn >= anchor.range.endColumn;
  }
}
class HoverSource {
  constructor(hover, hoverProvider, hoverPosition) {
    this.hover = hover;
    this.hoverProvider = hoverProvider;
    this.hoverPosition = hoverPosition;
  }
  supportsVerbosityAction(hoverVerbosityAction) {
    switch (hoverVerbosityAction) {
      case HoverVerbosityAction.Increase:
        return this.hover.canIncreaseVerbosity ?? false;
      case HoverVerbosityAction.Decrease:
        return this.hover.canDecreaseVerbosity ?? false;
    }
  }
}
let MarkdownHoverParticipant = class {
  constructor(_editor, _markdownRendererService, _configurationService, _languageFeaturesService, _keybindingService, _hoverService, _commandService) {
    this._editor = _editor;
    this._markdownRendererService = _markdownRendererService;
    this._configurationService = _configurationService;
    this._languageFeaturesService = _languageFeaturesService;
    this._keybindingService = _keybindingService;
    this._hoverService = _hoverService;
    this._commandService = _commandService;
    this.hoverOrdinal = 3;
  }
  createLoadingMessage(anchor) {
    return new MarkdownHover(this, anchor.range, [new MarkdownString().appendText(nls.localize("modesContentHover.loading", "Loading..."))], false, 2e3);
  }
  computeSync(anchor, lineDecorations) {
    if (!this._editor.hasModel() || anchor.type !== HoverAnchorType.Range) {
      return [];
    }
    const model = this._editor.getModel();
    const lineNumber = anchor.range.startLineNumber;
    const maxColumn = model.getLineMaxColumn(lineNumber);
    const result = [];
    let index = 1e3;
    const lineLength = model.getLineLength(lineNumber);
    const languageId = model.getLanguageIdAtPosition(anchor.range.startLineNumber, anchor.range.startColumn);
    const stopRenderingLineAfter = this._editor.getOption(EditorOption.stopRenderingLineAfter);
    const maxTokenizationLineLength = this._configurationService.getValue("editor.maxTokenizationLineLength", {
      overrideIdentifier: languageId
    });
    const showLongLineWarning = this._editor.getOption(EditorOption.hover).showLongLineWarning;
    let stopRenderingMessage = false;
    if (stopRenderingLineAfter >= 0 && lineLength > stopRenderingLineAfter && anchor.range.startColumn >= stopRenderingLineAfter) {
      stopRenderingMessage = true;
      if (showLongLineWarning) {
        result.push(new MarkdownHover(this, anchor.range, [{
          value: nls.localize(
            { key: "stopped rendering", comment: ['Please do not translate the word "command", it is part of our internal syntax which must not change', '{Locked="](command:{0})"}'] },
            "Rendering paused for long line for performance reasons. This can be configured via `editor.stopRenderingLineAfter`. [Don't Show Again](command:{0})",
            HIDE_LONG_LINE_WARNING_HOVER_ACTION_ID
          ),
          isTrusted: true
        }], false, index++));
      }
    }
    if (!stopRenderingMessage && typeof maxTokenizationLineLength === "number" && lineLength >= maxTokenizationLineLength) {
      if (showLongLineWarning) {
        result.push(new MarkdownHover(this, anchor.range, [{
          value: nls.localize(
            { key: "too many characters", comment: ['Please do not translate the word "command", it is part of our internal syntax which must not change', '{Locked="](command:{0})"}'] },
            "Tokenization is skipped for long lines for performance reasons. This can be configured via `editor.maxTokenizationLineLength`. [Don't Show Again](command:{0})",
            HIDE_LONG_LINE_WARNING_HOVER_ACTION_ID
          ),
          isTrusted: true
        }], false, index++));
      }
    }
    let isBeforeContent = false;
    for (const d of lineDecorations) {
      const startColumn = d.range.startLineNumber === lineNumber ? d.range.startColumn : 1;
      const endColumn = d.range.endLineNumber === lineNumber ? d.range.endColumn : maxColumn;
      const hoverMessage = d.options.hoverMessage;
      if (!hoverMessage || isEmptyMarkdownString(hoverMessage)) {
        continue;
      }
      if (d.options.beforeContentClassName) {
        isBeforeContent = true;
      }
      const range = new Range(anchor.range.startLineNumber, startColumn, anchor.range.startLineNumber, endColumn);
      result.push(new MarkdownHover(this, range, asArray(hoverMessage), isBeforeContent, index++));
    }
    return result;
  }
  computeAsync(anchor, lineDecorations, source, token) {
    if (!this._editor.hasModel() || anchor.type !== HoverAnchorType.Range) {
      return AsyncIterableProducer.EMPTY;
    }
    const model = this._editor.getModel();
    const hoverProviderRegistry = this._languageFeaturesService.hoverProvider;
    if (!hoverProviderRegistry.has(model)) {
      return AsyncIterableProducer.EMPTY;
    }
    return this._getMarkdownHovers(hoverProviderRegistry, model, anchor, token);
  }
  async *_getMarkdownHovers(hoverProviderRegistry, model, anchor, token) {
    const position = anchor.range.getStartPosition();
    const hoverProviderResults = getHoverProviderResultsAsAsyncIterable(hoverProviderRegistry, model, position, token);
    for await (const item of hoverProviderResults) {
      if (!isEmptyMarkdownString(item.hover.contents)) {
        const range = item.hover.range ? Range.lift(item.hover.range) : anchor.range;
        const hoverSource = new HoverSource(item.hover, item.provider, position);
        yield new MarkdownHover(this, range, item.hover.contents, false, item.ordinal, hoverSource);
      }
    }
  }
  renderHoverParts(context, hoverParts) {
    this._renderedHoverParts = new MarkdownRenderedHoverParts(
      hoverParts,
      context.fragment,
      this,
      this._editor,
      this._commandService,
      this._keybindingService,
      this._hoverService,
      this._configurationService,
      this._markdownRendererService,
      context.onContentsChanged
    );
    return this._renderedHoverParts;
  }
  handleScroll(e) {
    this._renderedHoverParts?.handleScroll(e);
  }
  getAccessibleContent(hoverPart) {
    return this._renderedHoverParts?.getAccessibleContent(hoverPart) ?? "";
  }
  doesMarkdownHoverAtIndexSupportVerbosityAction(index, action) {
    return this._renderedHoverParts?.doesMarkdownHoverAtIndexSupportVerbosityAction(index, action) ?? false;
  }
  updateMarkdownHoverVerbosityLevel(action, index) {
    return Promise.resolve(this._renderedHoverParts?.updateMarkdownHoverPartVerbosityLevel(action, index));
  }
};
MarkdownHoverParticipant = __decorateClass([
  __decorateParam(1, IMarkdownRendererService),
  __decorateParam(2, IConfigurationService),
  __decorateParam(3, ILanguageFeaturesService),
  __decorateParam(4, IKeybindingService),
  __decorateParam(5, IHoverService),
  __decorateParam(6, ICommandService)
], MarkdownHoverParticipant);
class RenderedMarkdownHoverPart {
  constructor(hoverPart, hoverElement, disposables, actionsContainer) {
    this.hoverPart = hoverPart;
    this.hoverElement = hoverElement;
    this.disposables = disposables;
    this.actionsContainer = actionsContainer;
  }
  get hoverAccessibleContent() {
    return this.hoverElement.innerText.trim();
  }
  dispose() {
    this.disposables.dispose();
  }
}
class MarkdownRenderedHoverParts {
  constructor(hoverParts, hoverPartsContainer, _hoverParticipant, _editor, _commandService, _keybindingService, _hoverService, _configurationService, _markdownRendererService, _onFinishedRendering) {
    this._hoverParticipant = _hoverParticipant;
    this._editor = _editor;
    this._commandService = _commandService;
    this._keybindingService = _keybindingService;
    this._hoverService = _hoverService;
    this._configurationService = _configurationService;
    this._markdownRendererService = _markdownRendererService;
    this._onFinishedRendering = _onFinishedRendering;
    this._ongoingHoverOperations = /* @__PURE__ */ new Map();
    this._disposables = new DisposableStore();
    this.renderedHoverParts = this._renderHoverParts(hoverParts, hoverPartsContainer, this._onFinishedRendering);
    this._disposables.add(toDisposable(() => {
      this.renderedHoverParts.forEach((renderedHoverPart) => {
        renderedHoverPart.dispose();
      });
      this._ongoingHoverOperations.forEach((operation) => {
        operation.tokenSource.dispose(true);
      });
    }));
  }
  _renderHoverParts(hoverParts, hoverPartsContainer, onFinishedRendering) {
    hoverParts.sort(compareBy((hover) => hover.ordinal, numberComparator));
    return hoverParts.map((hoverPart) => {
      const renderedHoverPart = this._renderHoverPart(hoverPart, onFinishedRendering);
      hoverPartsContainer.appendChild(renderedHoverPart.hoverElement);
      return renderedHoverPart;
    });
  }
  _renderHoverPart(hoverPart, onFinishedRendering) {
    const renderedMarkdownPart = this._renderMarkdownHover(hoverPart, onFinishedRendering);
    const renderedMarkdownElement = renderedMarkdownPart.hoverElement;
    const hoverSource = hoverPart.source;
    const disposables = new DisposableStore();
    disposables.add(renderedMarkdownPart);
    if (!hoverSource) {
      return new RenderedMarkdownHoverPart(hoverPart, renderedMarkdownElement, disposables);
    }
    const canIncreaseVerbosity = hoverSource.supportsVerbosityAction(HoverVerbosityAction.Increase);
    const canDecreaseVerbosity = hoverSource.supportsVerbosityAction(HoverVerbosityAction.Decrease);
    if (!canIncreaseVerbosity && !canDecreaseVerbosity) {
      return new RenderedMarkdownHoverPart(hoverPart, renderedMarkdownElement, disposables);
    }
    const actionsContainer = $("div.verbosity-actions");
    renderedMarkdownElement.prepend(actionsContainer);
    const actionsContainerInner = $("div.verbosity-actions-inner");
    actionsContainer.append(actionsContainerInner);
    disposables.add(this._renderHoverExpansionAction(actionsContainerInner, HoverVerbosityAction.Increase, canIncreaseVerbosity));
    disposables.add(this._renderHoverExpansionAction(actionsContainerInner, HoverVerbosityAction.Decrease, canDecreaseVerbosity));
    return new RenderedMarkdownHoverPart(hoverPart, renderedMarkdownElement, disposables, actionsContainerInner);
  }
  _renderMarkdownHover(markdownHover, onFinishedRendering) {
    const renderedMarkdownHover = renderMarkdown(
      this._editor,
      markdownHover,
      this._markdownRendererService,
      onFinishedRendering
    );
    return renderedMarkdownHover;
  }
  _renderHoverExpansionAction(container, action, actionEnabled) {
    const store = new DisposableStore();
    const isActionIncrease = action === HoverVerbosityAction.Increase;
    const actionElement = dom.append(container, $(ThemeIcon.asCSSSelector(isActionIncrease ? increaseHoverVerbosityIcon : decreaseHoverVerbosityIcon)));
    actionElement.tabIndex = 0;
    const hoverDelegate = store.add(new WorkbenchHoverDelegate("mouse", void 0, { target: container, position: { hoverPosition: HoverPosition.LEFT } }, this._configurationService, this._hoverService));
    store.add(this._hoverService.setupManagedHover(hoverDelegate, actionElement, labelForHoverVerbosityAction(this._keybindingService, action)));
    if (!actionEnabled) {
      actionElement.classList.add("disabled");
      return store;
    }
    actionElement.classList.add("enabled");
    const actionFunction = () => this._commandService.executeCommand(action === HoverVerbosityAction.Increase ? INCREASE_HOVER_VERBOSITY_ACTION_ID : DECREASE_HOVER_VERBOSITY_ACTION_ID, { focus: true });
    store.add(new ClickAction(actionElement, actionFunction));
    store.add(new KeyDownAction(actionElement, actionFunction, [KeyCode.Enter, KeyCode.Space]));
    return store;
  }
  handleScroll(e) {
    this.renderedHoverParts.forEach((renderedHoverPart) => {
      const actionsContainerInner = renderedHoverPart.actionsContainer;
      if (!actionsContainerInner) {
        return;
      }
      const hoverElement = renderedHoverPart.hoverElement;
      const topOfHoverScrollPosition = e.scrollTop;
      const bottomOfHoverScrollPosition = topOfHoverScrollPosition + e.height;
      const topOfRenderedPart = hoverElement.offsetTop;
      const hoverElementHeight = hoverElement.clientHeight;
      const bottomOfRenderedPart = topOfRenderedPart + hoverElementHeight;
      const iconsHeight = 22;
      let top;
      if (bottomOfRenderedPart <= bottomOfHoverScrollPosition || topOfRenderedPart >= bottomOfHoverScrollPosition) {
        top = hoverElementHeight - iconsHeight;
      } else {
        top = bottomOfHoverScrollPosition - topOfRenderedPart - iconsHeight;
      }
      actionsContainerInner.style.top = `${top}px`;
    });
  }
  async updateMarkdownHoverPartVerbosityLevel(action, index) {
    const model = this._editor.getModel();
    if (!model) {
      return void 0;
    }
    const hoverRenderedPart = this._getRenderedHoverPartAtIndex(index);
    const hoverSource = hoverRenderedPart?.hoverPart.source;
    if (!hoverRenderedPart || !hoverSource?.supportsVerbosityAction(action)) {
      return void 0;
    }
    const newHover = await this._fetchHover(hoverSource, model, action);
    if (!newHover) {
      return void 0;
    }
    const newHoverSource = new HoverSource(newHover, hoverSource.hoverProvider, hoverSource.hoverPosition);
    const initialHoverPart = hoverRenderedPart.hoverPart;
    const newHoverPart = new MarkdownHover(
      this._hoverParticipant,
      initialHoverPart.range,
      newHover.contents,
      initialHoverPart.isBeforeContent,
      initialHoverPart.ordinal,
      newHoverSource
    );
    const newHoverRenderedPart = this._updateRenderedHoverPart(index, newHoverPart);
    if (!newHoverRenderedPart) {
      return void 0;
    }
    return {
      hoverPart: newHoverPart,
      hoverElement: newHoverRenderedPart.hoverElement
    };
  }
  getAccessibleContent(hoverPart) {
    const renderedHoverPartIndex = this.renderedHoverParts.findIndex((renderedHoverPart2) => renderedHoverPart2.hoverPart === hoverPart);
    if (renderedHoverPartIndex === -1) {
      return void 0;
    }
    const renderedHoverPart = this._getRenderedHoverPartAtIndex(renderedHoverPartIndex);
    if (!renderedHoverPart) {
      return void 0;
    }
    const hoverElementInnerText = renderedHoverPart.hoverElement.innerText;
    const accessibleContent = hoverElementInnerText.replace(/[^\S\n\r]+/gu, " ");
    return accessibleContent;
  }
  doesMarkdownHoverAtIndexSupportVerbosityAction(index, action) {
    const hoverRenderedPart = this._getRenderedHoverPartAtIndex(index);
    const hoverSource = hoverRenderedPart?.hoverPart.source;
    if (!hoverRenderedPart || !hoverSource?.supportsVerbosityAction(action)) {
      return false;
    }
    return true;
  }
  async _fetchHover(hoverSource, model, action) {
    let verbosityDelta = action === HoverVerbosityAction.Increase ? 1 : -1;
    const provider = hoverSource.hoverProvider;
    const ongoingHoverOperation = this._ongoingHoverOperations.get(provider);
    if (ongoingHoverOperation) {
      ongoingHoverOperation.tokenSource.cancel();
      verbosityDelta += ongoingHoverOperation.verbosityDelta;
    }
    const tokenSource = new CancellationTokenSource();
    this._ongoingHoverOperations.set(provider, { verbosityDelta, tokenSource });
    const context = { verbosityRequest: { verbosityDelta, previousHover: hoverSource.hover } };
    let hover;
    try {
      hover = await Promise.resolve(provider.provideHover(model, hoverSource.hoverPosition, tokenSource.token, context));
    } catch (e) {
      onUnexpectedExternalError(e);
    }
    tokenSource.dispose();
    this._ongoingHoverOperations.delete(provider);
    return hover;
  }
  _updateRenderedHoverPart(index, hoverPart) {
    if (index >= this.renderedHoverParts.length || index < 0) {
      return void 0;
    }
    const renderedHoverPart = this._renderHoverPart(hoverPart, this._onFinishedRendering);
    const currentRenderedHoverPart = this.renderedHoverParts[index];
    const currentRenderedMarkdown = currentRenderedHoverPart.hoverElement;
    const renderedMarkdown = renderedHoverPart.hoverElement;
    const renderedChildrenElements = Array.from(renderedMarkdown.children);
    currentRenderedMarkdown.replaceChildren(...renderedChildrenElements);
    const newRenderedHoverPart = new RenderedMarkdownHoverPart(
      hoverPart,
      currentRenderedMarkdown,
      renderedHoverPart.disposables,
      renderedHoverPart.actionsContainer
    );
    currentRenderedHoverPart.dispose();
    this.renderedHoverParts[index] = newRenderedHoverPart;
    return newRenderedHoverPart;
  }
  _getRenderedHoverPartAtIndex(index) {
    return this.renderedHoverParts[index];
  }
  dispose() {
    this._disposables.dispose();
  }
}
function renderMarkdownHovers(context, markdownHovers, editor, markdownRendererService) {
  markdownHovers.sort(compareBy((hover) => hover.ordinal, numberComparator));
  const renderedHoverParts = [];
  for (const markdownHover of markdownHovers) {
    const renderedHoverPart = renderMarkdown(
      editor,
      markdownHover,
      markdownRendererService,
      context.onContentsChanged
    );
    context.fragment.appendChild(renderedHoverPart.hoverElement);
    renderedHoverParts.push(renderedHoverPart);
  }
  return new RenderedHoverParts(renderedHoverParts);
}
function renderMarkdown(editor, markdownHover, markdownRendererService, onFinishedRendering) {
  const disposables = new DisposableStore();
  const renderedMarkdown = $("div.hover-row");
  const renderedMarkdownContents = $("div.hover-row-contents");
  renderedMarkdown.appendChild(renderedMarkdownContents);
  const markdownStrings = markdownHover.contents;
  for (const markdownString of markdownStrings) {
    if (isEmptyMarkdownString(markdownString)) {
      continue;
    }
    const markdownHoverElement = $("div.markdown-hover");
    const hoverContentsElement = dom.append(markdownHoverElement, $("div.hover-contents"));
    const renderedContents = disposables.add(markdownRendererService.render(markdownString, {
      context: editor,
      asyncRenderCallback: () => {
        hoverContentsElement.className = "hover-contents code-hover-contents";
        onFinishedRendering();
      }
    }));
    hoverContentsElement.appendChild(renderedContents.element);
    renderedMarkdownContents.appendChild(markdownHoverElement);
  }
  const renderedHoverPart = {
    hoverPart: markdownHover,
    hoverElement: renderedMarkdown,
    dispose() {
      disposables.dispose();
    }
  };
  return renderedHoverPart;
}
function labelForHoverVerbosityAction(keybindingService, action) {
  switch (action) {
    case HoverVerbosityAction.Increase:
      return keybindingService.appendKeybinding(nls.localize("increaseVerbosity", "Increase Hover Verbosity"), INCREASE_HOVER_VERBOSITY_ACTION_ID);
    case HoverVerbosityAction.Decrease:
      return keybindingService.appendKeybinding(nls.localize("decreaseVerbosity", "Decrease Hover Verbosity"), DECREASE_HOVER_VERBOSITY_ACTION_ID);
  }
}
export {
  MarkdownHover,
  MarkdownHoverParticipant,
  labelForHoverVerbosityAction,
  renderMarkdownHovers
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXGhvdmVyXFxicm93c2VyXFxtYXJrZG93bkhvdmVyUGFydGljaXBhbnQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBhc0FycmF5LCBjb21wYXJlQnksIG51bWJlckNvbXBhcmF0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4sIENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IElNYXJrZG93blN0cmluZywgaXNFbXB0eU1hcmtkb3duU3RyaW5nLCBNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElNYXJrZG93blJlbmRlcmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL21hcmtkb3duL2Jyb3dzZXIvbWFya2Rvd25SZW5kZXJlci5qcyc7XG5pbXBvcnQgeyBERUNSRUFTRV9IT1ZFUl9WRVJCT1NJVFlfQUNUSU9OX0lELCBJTkNSRUFTRV9IT1ZFUl9WRVJCT1NJVFlfQUNUSU9OX0lELCBISURFX0xPTkdfTElORV9XQVJOSU5HX0hPVkVSX0FDVElPTl9JRCB9IGZyb20gJy4vaG92ZXJBY3Rpb25JZHMuanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IElNb2RlbERlY29yYXRpb24sIElUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgSG92ZXJBbmNob3IsIEhvdmVyQW5jaG9yVHlwZSwgSG92ZXJSYW5nZUFuY2hvciwgSUVkaXRvckhvdmVyUGFydGljaXBhbnQsIElFZGl0b3JIb3ZlclJlbmRlckNvbnRleHQsIElIb3ZlclBhcnQsIElSZW5kZXJlZEhvdmVyUGFydCwgSVJlbmRlcmVkSG92ZXJQYXJ0cywgUmVuZGVyZWRIb3ZlclBhcnRzIH0gZnJvbSAnLi9ob3ZlclR5cGVzLmpzJztcbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vc2VydmljZXMvbGFuZ3VhZ2VGZWF0dXJlcy5qcyc7XG5pbXBvcnQgeyBFZGl0b3JPcHRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29uZmlnL2VkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgSG92ZXIsIEhvdmVyQ29udGV4dCwgSG92ZXJQcm92aWRlciwgSG92ZXJWZXJib3NpdHlBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VzLmpzJztcbmltcG9ydCB7IHJlZ2lzdGVySWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9pY29uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBvblVuZXhwZWN0ZWRFeHRlcm5hbEVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgQ2xpY2tBY3Rpb24sIEhvdmVyUG9zaXRpb24sIEtleURvd25BY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaG92ZXIvaG92ZXJXaWRnZXQuanMnO1xuaW1wb3J0IHsgS2V5Q29kZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IElIb3ZlclNlcnZpY2UsIFdvcmtiZW5jaEhvdmVyRGVsZWdhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ob3Zlci9icm93c2VyL2hvdmVyLmpzJztcbmltcG9ydCB7IEFzeW5jSXRlcmFibGVQcm9kdWNlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IExhbmd1YWdlRmVhdHVyZVJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlRmVhdHVyZVJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IGdldEhvdmVyUHJvdmlkZXJSZXN1bHRzQXNBc3luY0l0ZXJhYmxlIH0gZnJvbSAnLi9nZXRIb3Zlci5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSG92ZXJTdGFydFNvdXJjZSB9IGZyb20gJy4vaG92ZXJPcGVyYXRpb24uanMnO1xuaW1wb3J0IHsgU2Nyb2xsRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zY3JvbGxhYmxlLmpzJztcblxuY29uc3QgJCA9IGRvbS4kO1xuY29uc3QgaW5jcmVhc2VIb3ZlclZlcmJvc2l0eUljb24gPSByZWdpc3Rlckljb24oJ2hvdmVyLWluY3JlYXNlLXZlcmJvc2l0eScsIENvZGljb24uYWRkU21hbGwsIG5scy5sb2NhbGl6ZSgnaW5jcmVhc2VIb3ZlclZlcmJvc2l0eScsICdJY29uIGZvciBpbmNyZWFzZWluZyBob3ZlciB2ZXJib3NpdHkuJykpO1xuY29uc3QgZGVjcmVhc2VIb3ZlclZlcmJvc2l0eUljb24gPSByZWdpc3Rlckljb24oJ2hvdmVyLWRlY3JlYXNlLXZlcmJvc2l0eScsIENvZGljb24ucmVtb3ZlU21hbGwsIG5scy5sb2NhbGl6ZSgnZGVjcmVhc2VIb3ZlclZlcmJvc2l0eScsICdJY29uIGZvciBkZWNyZWFzaW5nIGhvdmVyIHZlcmJvc2l0eS4nKSk7XG5cbmV4cG9ydCBjbGFzcyBNYXJrZG93bkhvdmVyIGltcGxlbWVudHMgSUhvdmVyUGFydCB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIHJlYWRvbmx5IG93bmVyOiBJRWRpdG9ySG92ZXJQYXJ0aWNpcGFudDxNYXJrZG93bkhvdmVyPixcblx0XHRwdWJsaWMgcmVhZG9ubHkgcmFuZ2U6IFJhbmdlLFxuXHRcdHB1YmxpYyByZWFkb25seSBjb250ZW50czogSU1hcmtkb3duU3RyaW5nW10sXG5cdFx0cHVibGljIHJlYWRvbmx5IGlzQmVmb3JlQ29udGVudDogYm9vbGVhbixcblx0XHRwdWJsaWMgcmVhZG9ubHkgb3JkaW5hbDogbnVtYmVyLFxuXHRcdHB1YmxpYyByZWFkb25seSBzb3VyY2U6IEhvdmVyU291cmNlIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkLFxuXHQpIHsgfVxuXG5cdHB1YmxpYyBpc1ZhbGlkRm9ySG92ZXJBbmNob3IoYW5jaG9yOiBIb3ZlckFuY2hvcik6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAoXG5cdFx0XHRhbmNob3IudHlwZSA9PT0gSG92ZXJBbmNob3JUeXBlLlJhbmdlXG5cdFx0XHQmJiB0aGlzLnJhbmdlLnN0YXJ0Q29sdW1uIDw9IGFuY2hvci5yYW5nZS5zdGFydENvbHVtblxuXHRcdFx0JiYgdGhpcy5yYW5nZS5lbmRDb2x1bW4gPj0gYW5jaG9yLnJhbmdlLmVuZENvbHVtblxuXHRcdCk7XG5cdH1cbn1cblxuY2xhc3MgSG92ZXJTb3VyY2Uge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHJlYWRvbmx5IGhvdmVyOiBIb3Zlcixcblx0XHRyZWFkb25seSBob3ZlclByb3ZpZGVyOiBIb3ZlclByb3ZpZGVyLFxuXHRcdHJlYWRvbmx5IGhvdmVyUG9zaXRpb246IFBvc2l0aW9uLFxuXHQpIHsgfVxuXG5cdHB1YmxpYyBzdXBwb3J0c1ZlcmJvc2l0eUFjdGlvbihob3ZlclZlcmJvc2l0eUFjdGlvbjogSG92ZXJWZXJib3NpdHlBY3Rpb24pOiBib29sZWFuIHtcblx0XHRzd2l0Y2ggKGhvdmVyVmVyYm9zaXR5QWN0aW9uKSB7XG5cdFx0XHRjYXNlIEhvdmVyVmVyYm9zaXR5QWN0aW9uLkluY3JlYXNlOlxuXHRcdFx0XHRyZXR1cm4gdGhpcy5ob3Zlci5jYW5JbmNyZWFzZVZlcmJvc2l0eSA/PyBmYWxzZTtcblx0XHRcdGNhc2UgSG92ZXJWZXJib3NpdHlBY3Rpb24uRGVjcmVhc2U6XG5cdFx0XHRcdHJldHVybiB0aGlzLmhvdmVyLmNhbkRlY3JlYXNlVmVyYm9zaXR5ID8/IGZhbHNlO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgY2xhc3MgTWFya2Rvd25Ib3ZlclBhcnRpY2lwYW50IGltcGxlbWVudHMgSUVkaXRvckhvdmVyUGFydGljaXBhbnQ8TWFya2Rvd25Ib3Zlcj4ge1xuXG5cdHB1YmxpYyByZWFkb25seSBob3Zlck9yZGluYWw6IG51bWJlciA9IDM7XG5cblx0cHJpdmF0ZSBfcmVuZGVyZWRIb3ZlclBhcnRzOiBNYXJrZG93blJlbmRlcmVkSG92ZXJQYXJ0cyB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcm90ZWN0ZWQgcmVhZG9ubHkgX2VkaXRvcjogSUNvZGVFZGl0b3IsXG5cdFx0QElNYXJrZG93blJlbmRlcmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9tYXJrZG93blJlbmRlcmVyU2VydmljZTogSU1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBfbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2U6IElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSxcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2tleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0KSB7IH1cblxuXHRwdWJsaWMgY3JlYXRlTG9hZGluZ01lc3NhZ2UoYW5jaG9yOiBIb3ZlckFuY2hvcik6IE1hcmtkb3duSG92ZXIgfCBudWxsIHtcblx0XHRyZXR1cm4gbmV3IE1hcmtkb3duSG92ZXIodGhpcywgYW5jaG9yLnJhbmdlLCBbbmV3IE1hcmtkb3duU3RyaW5nKCkuYXBwZW5kVGV4dChubHMubG9jYWxpemUoJ21vZGVzQ29udGVudEhvdmVyLmxvYWRpbmcnLCBcIkxvYWRpbmcuLi5cIikpXSwgZmFsc2UsIDIwMDApO1xuXHR9XG5cblx0cHVibGljIGNvbXB1dGVTeW5jKGFuY2hvcjogSG92ZXJBbmNob3IsIGxpbmVEZWNvcmF0aW9uczogSU1vZGVsRGVjb3JhdGlvbltdKTogTWFya2Rvd25Ib3ZlcltdIHtcblx0XHRpZiAoIXRoaXMuX2VkaXRvci5oYXNNb2RlbCgpIHx8IGFuY2hvci50eXBlICE9PSBIb3ZlckFuY2hvclR5cGUuUmFuZ2UpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuX2VkaXRvci5nZXRNb2RlbCgpO1xuXHRcdGNvbnN0IGxpbmVOdW1iZXIgPSBhbmNob3IucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyO1xuXHRcdGNvbnN0IG1heENvbHVtbiA9IG1vZGVsLmdldExpbmVNYXhDb2x1bW4obGluZU51bWJlcik7XG5cdFx0Y29uc3QgcmVzdWx0OiBNYXJrZG93bkhvdmVyW10gPSBbXTtcblxuXHRcdGxldCBpbmRleCA9IDEwMDA7XG5cblx0XHRjb25zdCBsaW5lTGVuZ3RoID0gbW9kZWwuZ2V0TGluZUxlbmd0aChsaW5lTnVtYmVyKTtcblx0XHRjb25zdCBsYW5ndWFnZUlkID0gbW9kZWwuZ2V0TGFuZ3VhZ2VJZEF0UG9zaXRpb24oYW5jaG9yLnJhbmdlLnN0YXJ0TGluZU51bWJlciwgYW5jaG9yLnJhbmdlLnN0YXJ0Q29sdW1uKTtcblx0XHRjb25zdCBzdG9wUmVuZGVyaW5nTGluZUFmdGVyID0gdGhpcy5fZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24uc3RvcFJlbmRlcmluZ0xpbmVBZnRlcik7XG5cdFx0Y29uc3QgbWF4VG9rZW5pemF0aW9uTGluZUxlbmd0aCA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPG51bWJlcj4oJ2VkaXRvci5tYXhUb2tlbml6YXRpb25MaW5lTGVuZ3RoJywge1xuXHRcdFx0b3ZlcnJpZGVJZGVudGlmaWVyOiBsYW5ndWFnZUlkXG5cdFx0fSk7XG5cdFx0Y29uc3Qgc2hvd0xvbmdMaW5lV2FybmluZyA9IHRoaXMuX2VkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmhvdmVyKS5zaG93TG9uZ0xpbmVXYXJuaW5nO1xuXHRcdGxldCBzdG9wUmVuZGVyaW5nTWVzc2FnZSA9IGZhbHNlO1xuXHRcdGlmIChzdG9wUmVuZGVyaW5nTGluZUFmdGVyID49IDAgJiYgbGluZUxlbmd0aCA+IHN0b3BSZW5kZXJpbmdMaW5lQWZ0ZXIgJiYgYW5jaG9yLnJhbmdlLnN0YXJ0Q29sdW1uID49IHN0b3BSZW5kZXJpbmdMaW5lQWZ0ZXIpIHtcblx0XHRcdHN0b3BSZW5kZXJpbmdNZXNzYWdlID0gdHJ1ZTtcblx0XHRcdGlmIChzaG93TG9uZ0xpbmVXYXJuaW5nKSB7XG5cdFx0XHRcdHJlc3VsdC5wdXNoKG5ldyBNYXJrZG93bkhvdmVyKHRoaXMsIGFuY2hvci5yYW5nZSwgW3tcblx0XHRcdFx0XHR2YWx1ZTogbmxzLmxvY2FsaXplKFxuXHRcdFx0XHRcdFx0eyBrZXk6ICdzdG9wcGVkIHJlbmRlcmluZycsIGNvbW1lbnQ6IFsnUGxlYXNlIGRvIG5vdCB0cmFuc2xhdGUgdGhlIHdvcmQgXCJjb21tYW5kXCIsIGl0IGlzIHBhcnQgb2Ygb3VyIGludGVybmFsIHN5bnRheCB3aGljaCBtdXN0IG5vdCBjaGFuZ2UnLCAne0xvY2tlZD1cIl0oY29tbWFuZDp7MH0pXCJ9J10gfSxcblx0XHRcdFx0XHRcdFwiUmVuZGVyaW5nIHBhdXNlZCBmb3IgbG9uZyBsaW5lIGZvciBwZXJmb3JtYW5jZSByZWFzb25zLiBUaGlzIGNhbiBiZSBjb25maWd1cmVkIHZpYSBgZWRpdG9yLnN0b3BSZW5kZXJpbmdMaW5lQWZ0ZXJgLiBbRG9uJ3QgU2hvdyBBZ2Fpbl0oY29tbWFuZDp7MH0pXCIsXG5cdFx0XHRcdFx0XHRISURFX0xPTkdfTElORV9XQVJOSU5HX0hPVkVSX0FDVElPTl9JRFxuXHRcdFx0XHRcdCksXG5cdFx0XHRcdFx0aXNUcnVzdGVkOiB0cnVlXG5cdFx0XHRcdH1dLCBmYWxzZSwgaW5kZXgrKykpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAoIXN0b3BSZW5kZXJpbmdNZXNzYWdlICYmIHR5cGVvZiBtYXhUb2tlbml6YXRpb25MaW5lTGVuZ3RoID09PSAnbnVtYmVyJyAmJiBsaW5lTGVuZ3RoID49IG1heFRva2VuaXphdGlvbkxpbmVMZW5ndGgpIHtcblx0XHRcdGlmIChzaG93TG9uZ0xpbmVXYXJuaW5nKSB7XG5cdFx0XHRcdHJlc3VsdC5wdXNoKG5ldyBNYXJrZG93bkhvdmVyKHRoaXMsIGFuY2hvci5yYW5nZSwgW3tcblx0XHRcdFx0XHR2YWx1ZTogbmxzLmxvY2FsaXplKFxuXHRcdFx0XHRcdFx0eyBrZXk6ICd0b28gbWFueSBjaGFyYWN0ZXJzJywgY29tbWVudDogWydQbGVhc2UgZG8gbm90IHRyYW5zbGF0ZSB0aGUgd29yZCBcImNvbW1hbmRcIiwgaXQgaXMgcGFydCBvZiBvdXIgaW50ZXJuYWwgc3ludGF4IHdoaWNoIG11c3Qgbm90IGNoYW5nZScsICd7TG9ja2VkPVwiXShjb21tYW5kOnswfSlcIn0nXSB9LFxuXHRcdFx0XHRcdFx0XCJUb2tlbml6YXRpb24gaXMgc2tpcHBlZCBmb3IgbG9uZyBsaW5lcyBmb3IgcGVyZm9ybWFuY2UgcmVhc29ucy4gVGhpcyBjYW4gYmUgY29uZmlndXJlZCB2aWEgYGVkaXRvci5tYXhUb2tlbml6YXRpb25MaW5lTGVuZ3RoYC4gW0Rvbid0IFNob3cgQWdhaW5dKGNvbW1hbmQ6ezB9KVwiLFxuXHRcdFx0XHRcdFx0SElERV9MT05HX0xJTkVfV0FSTklOR19IT1ZFUl9BQ1RJT05fSURcblx0XHRcdFx0XHQpLFxuXHRcdFx0XHRcdGlzVHJ1c3RlZDogdHJ1ZVxuXHRcdFx0XHR9XSwgZmFsc2UsIGluZGV4KyspKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRsZXQgaXNCZWZvcmVDb250ZW50ID0gZmFsc2U7XG5cblx0XHRmb3IgKGNvbnN0IGQgb2YgbGluZURlY29yYXRpb25zKSB7XG5cdFx0XHRjb25zdCBzdGFydENvbHVtbiA9IChkLnJhbmdlLnN0YXJ0TGluZU51bWJlciA9PT0gbGluZU51bWJlcikgPyBkLnJhbmdlLnN0YXJ0Q29sdW1uIDogMTtcblx0XHRcdGNvbnN0IGVuZENvbHVtbiA9IChkLnJhbmdlLmVuZExpbmVOdW1iZXIgPT09IGxpbmVOdW1iZXIpID8gZC5yYW5nZS5lbmRDb2x1bW4gOiBtYXhDb2x1bW47XG5cblx0XHRcdGNvbnN0IGhvdmVyTWVzc2FnZSA9IGQub3B0aW9ucy5ob3Zlck1lc3NhZ2U7XG5cdFx0XHRpZiAoIWhvdmVyTWVzc2FnZSB8fCBpc0VtcHR5TWFya2Rvd25TdHJpbmcoaG92ZXJNZXNzYWdlKSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGQub3B0aW9ucy5iZWZvcmVDb250ZW50Q2xhc3NOYW1lKSB7XG5cdFx0XHRcdGlzQmVmb3JlQ29udGVudCA9IHRydWU7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHJhbmdlID0gbmV3IFJhbmdlKGFuY2hvci5yYW5nZS5zdGFydExpbmVOdW1iZXIsIHN0YXJ0Q29sdW1uLCBhbmNob3IucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCBlbmRDb2x1bW4pO1xuXHRcdFx0cmVzdWx0LnB1c2gobmV3IE1hcmtkb3duSG92ZXIodGhpcywgcmFuZ2UsIGFzQXJyYXkoaG92ZXJNZXNzYWdlKSwgaXNCZWZvcmVDb250ZW50LCBpbmRleCsrKSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHB1YmxpYyBjb21wdXRlQXN5bmMoYW5jaG9yOiBIb3ZlckFuY2hvciwgbGluZURlY29yYXRpb25zOiBJTW9kZWxEZWNvcmF0aW9uW10sIHNvdXJjZTogSG92ZXJTdGFydFNvdXJjZSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogQXN5bmNJdGVyYWJsZTxNYXJrZG93bkhvdmVyPiB7XG5cdFx0aWYgKCF0aGlzLl9lZGl0b3IuaGFzTW9kZWwoKSB8fCBhbmNob3IudHlwZSAhPT0gSG92ZXJBbmNob3JUeXBlLlJhbmdlKSB7XG5cdFx0XHRyZXR1cm4gQXN5bmNJdGVyYWJsZVByb2R1Y2VyLkVNUFRZO1xuXHRcdH1cblxuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5fZWRpdG9yLmdldE1vZGVsKCk7XG5cblx0XHRjb25zdCBob3ZlclByb3ZpZGVyUmVnaXN0cnkgPSB0aGlzLl9sYW5ndWFnZUZlYXR1cmVzU2VydmljZS5ob3ZlclByb3ZpZGVyO1xuXHRcdGlmICghaG92ZXJQcm92aWRlclJlZ2lzdHJ5Lmhhcyhtb2RlbCkpIHtcblx0XHRcdHJldHVybiBBc3luY0l0ZXJhYmxlUHJvZHVjZXIuRU1QVFk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9nZXRNYXJrZG93bkhvdmVycyhob3ZlclByb3ZpZGVyUmVnaXN0cnksIG1vZGVsLCBhbmNob3IsIHRva2VuKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgKl9nZXRNYXJrZG93bkhvdmVycyhob3ZlclByb3ZpZGVyUmVnaXN0cnk6IExhbmd1YWdlRmVhdHVyZVJlZ2lzdHJ5PEhvdmVyUHJvdmlkZXI+LCBtb2RlbDogSVRleHRNb2RlbCwgYW5jaG9yOiBIb3ZlclJhbmdlQW5jaG9yLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBBc3luY0l0ZXJhYmxlPE1hcmtkb3duSG92ZXI+IHtcblx0XHRjb25zdCBwb3NpdGlvbiA9IGFuY2hvci5yYW5nZS5nZXRTdGFydFBvc2l0aW9uKCk7XG5cdFx0Y29uc3QgaG92ZXJQcm92aWRlclJlc3VsdHMgPSBnZXRIb3ZlclByb3ZpZGVyUmVzdWx0c0FzQXN5bmNJdGVyYWJsZShob3ZlclByb3ZpZGVyUmVnaXN0cnksIG1vZGVsLCBwb3NpdGlvbiwgdG9rZW4pO1xuXG5cdFx0Zm9yIGF3YWl0IChjb25zdCBpdGVtIG9mIGhvdmVyUHJvdmlkZXJSZXN1bHRzKSB7XG5cdFx0XHRpZiAoIWlzRW1wdHlNYXJrZG93blN0cmluZyhpdGVtLmhvdmVyLmNvbnRlbnRzKSkge1xuXHRcdFx0XHRjb25zdCByYW5nZSA9IGl0ZW0uaG92ZXIucmFuZ2UgPyBSYW5nZS5saWZ0KGl0ZW0uaG92ZXIucmFuZ2UpIDogYW5jaG9yLnJhbmdlO1xuXHRcdFx0XHRjb25zdCBob3ZlclNvdXJjZSA9IG5ldyBIb3ZlclNvdXJjZShpdGVtLmhvdmVyLCBpdGVtLnByb3ZpZGVyLCBwb3NpdGlvbik7XG5cdFx0XHRcdHlpZWxkIG5ldyBNYXJrZG93bkhvdmVyKHRoaXMsIHJhbmdlLCBpdGVtLmhvdmVyLmNvbnRlbnRzLCBmYWxzZSwgaXRlbS5vcmRpbmFsLCBob3ZlclNvdXJjZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIHJlbmRlckhvdmVyUGFydHMoY29udGV4dDogSUVkaXRvckhvdmVyUmVuZGVyQ29udGV4dCwgaG92ZXJQYXJ0czogTWFya2Rvd25Ib3ZlcltdKTogSVJlbmRlcmVkSG92ZXJQYXJ0czxNYXJrZG93bkhvdmVyPiB7XG5cdFx0dGhpcy5fcmVuZGVyZWRIb3ZlclBhcnRzID0gbmV3IE1hcmtkb3duUmVuZGVyZWRIb3ZlclBhcnRzKFxuXHRcdFx0aG92ZXJQYXJ0cyxcblx0XHRcdGNvbnRleHQuZnJhZ21lbnQsXG5cdFx0XHR0aGlzLFxuXHRcdFx0dGhpcy5fZWRpdG9yLFxuXHRcdFx0dGhpcy5fY29tbWFuZFNlcnZpY2UsXG5cdFx0XHR0aGlzLl9rZXliaW5kaW5nU2VydmljZSxcblx0XHRcdHRoaXMuX2hvdmVyU2VydmljZSxcblx0XHRcdHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdFx0dGhpcy5fbWFya2Rvd25SZW5kZXJlclNlcnZpY2UsXG5cdFx0XHRjb250ZXh0Lm9uQ29udGVudHNDaGFuZ2VkXG5cdFx0KTtcblx0XHRyZXR1cm4gdGhpcy5fcmVuZGVyZWRIb3ZlclBhcnRzO1xuXHR9XG5cblx0cHVibGljIGhhbmRsZVNjcm9sbChlOiBTY3JvbGxFdmVudCk6IHZvaWQge1xuXHRcdHRoaXMuX3JlbmRlcmVkSG92ZXJQYXJ0cz8uaGFuZGxlU2Nyb2xsKGUpO1xuXHR9XG5cblx0cHVibGljIGdldEFjY2Vzc2libGVDb250ZW50KGhvdmVyUGFydDogTWFya2Rvd25Ib3Zlcik6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuX3JlbmRlcmVkSG92ZXJQYXJ0cz8uZ2V0QWNjZXNzaWJsZUNvbnRlbnQoaG92ZXJQYXJ0KSA/PyAnJztcblx0fVxuXG5cdHB1YmxpYyBkb2VzTWFya2Rvd25Ib3ZlckF0SW5kZXhTdXBwb3J0VmVyYm9zaXR5QWN0aW9uKGluZGV4OiBudW1iZXIsIGFjdGlvbjogSG92ZXJWZXJib3NpdHlBY3Rpb24pOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fcmVuZGVyZWRIb3ZlclBhcnRzPy5kb2VzTWFya2Rvd25Ib3ZlckF0SW5kZXhTdXBwb3J0VmVyYm9zaXR5QWN0aW9uKGluZGV4LCBhY3Rpb24pID8/IGZhbHNlO1xuXHR9XG5cblx0cHVibGljIHVwZGF0ZU1hcmtkb3duSG92ZXJWZXJib3NpdHlMZXZlbChhY3Rpb246IEhvdmVyVmVyYm9zaXR5QWN0aW9uLCBpbmRleDogbnVtYmVyKTogUHJvbWlzZTx7IGhvdmVyUGFydDogTWFya2Rvd25Ib3ZlcjsgaG92ZXJFbGVtZW50OiBIVE1MRWxlbWVudCB9IHwgdW5kZWZpbmVkPiB7XG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh0aGlzLl9yZW5kZXJlZEhvdmVyUGFydHM/LnVwZGF0ZU1hcmtkb3duSG92ZXJQYXJ0VmVyYm9zaXR5TGV2ZWwoYWN0aW9uLCBpbmRleCkpO1xuXHR9XG59XG5cbmNsYXNzIFJlbmRlcmVkTWFya2Rvd25Ib3ZlclBhcnQgaW1wbGVtZW50cyBJUmVuZGVyZWRIb3ZlclBhcnQ8TWFya2Rvd25Ib3Zlcj4ge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHB1YmxpYyByZWFkb25seSBob3ZlclBhcnQ6IE1hcmtkb3duSG92ZXIsXG5cdFx0cHVibGljIHJlYWRvbmx5IGhvdmVyRWxlbWVudDogSFRNTEVsZW1lbnQsXG5cdFx0cHVibGljIHJlYWRvbmx5IGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmUsXG5cdFx0cHVibGljIHJlYWRvbmx5IGFjdGlvbnNDb250YWluZXI/OiBIVE1MRWxlbWVudFxuXHQpIHsgfVxuXG5cdGdldCBob3ZlckFjY2Vzc2libGVDb250ZW50KCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuaG92ZXJFbGVtZW50LmlubmVyVGV4dC50cmltKCk7XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9XG59XG5cbmNsYXNzIE1hcmtkb3duUmVuZGVyZWRIb3ZlclBhcnRzIGltcGxlbWVudHMgSVJlbmRlcmVkSG92ZXJQYXJ0czxNYXJrZG93bkhvdmVyPiB7XG5cblx0cHVibGljIHJlbmRlcmVkSG92ZXJQYXJ0czogUmVuZGVyZWRNYXJrZG93bkhvdmVyUGFydFtdO1xuXG5cdHByaXZhdGUgX29uZ29pbmdIb3Zlck9wZXJhdGlvbnM6IE1hcDxIb3ZlclByb3ZpZGVyLCB7IHZlcmJvc2l0eURlbHRhOiBudW1iZXI7IHRva2VuU291cmNlOiBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9PiA9IG5ldyBNYXAoKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9kaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRob3ZlclBhcnRzOiBNYXJrZG93bkhvdmVyW10sXG5cdFx0aG92ZXJQYXJ0c0NvbnRhaW5lcjogRG9jdW1lbnRGcmFnbWVudCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9ob3ZlclBhcnRpY2lwYW50OiBNYXJrZG93bkhvdmVyUGFydGljaXBhbnQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZWRpdG9yOiBJQ29kZUVkaXRvcixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9jb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2tleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2NvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfbWFya2Rvd25SZW5kZXJlclNlcnZpY2U6IElNYXJrZG93blJlbmRlcmVyU2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9vbkZpbmlzaGVkUmVuZGVyaW5nOiAoKSA9PiB2b2lkLFxuXHQpIHtcblx0XHR0aGlzLnJlbmRlcmVkSG92ZXJQYXJ0cyA9IHRoaXMuX3JlbmRlckhvdmVyUGFydHMoaG92ZXJQYXJ0cywgaG92ZXJQYXJ0c0NvbnRhaW5lciwgdGhpcy5fb25GaW5pc2hlZFJlbmRlcmluZyk7XG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHR0aGlzLnJlbmRlcmVkSG92ZXJQYXJ0cy5mb3JFYWNoKHJlbmRlcmVkSG92ZXJQYXJ0ID0+IHtcblx0XHRcdFx0cmVuZGVyZWRIb3ZlclBhcnQuZGlzcG9zZSgpO1xuXHRcdFx0fSk7XG5cdFx0XHR0aGlzLl9vbmdvaW5nSG92ZXJPcGVyYXRpb25zLmZvckVhY2gob3BlcmF0aW9uID0+IHtcblx0XHRcdFx0b3BlcmF0aW9uLnRva2VuU291cmNlLmRpc3Bvc2UodHJ1ZSk7XG5cdFx0XHR9KTtcblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIF9yZW5kZXJIb3ZlclBhcnRzKFxuXHRcdGhvdmVyUGFydHM6IE1hcmtkb3duSG92ZXJbXSxcblx0XHRob3ZlclBhcnRzQ29udGFpbmVyOiBEb2N1bWVudEZyYWdtZW50LFxuXHRcdG9uRmluaXNoZWRSZW5kZXJpbmc6ICgpID0+IHZvaWQsXG5cdCk6IFJlbmRlcmVkTWFya2Rvd25Ib3ZlclBhcnRbXSB7XG5cdFx0aG92ZXJQYXJ0cy5zb3J0KGNvbXBhcmVCeShob3ZlciA9PiBob3Zlci5vcmRpbmFsLCBudW1iZXJDb21wYXJhdG9yKSk7XG5cdFx0cmV0dXJuIGhvdmVyUGFydHMubWFwKGhvdmVyUGFydCA9PiB7XG5cdFx0XHRjb25zdCByZW5kZXJlZEhvdmVyUGFydCA9IHRoaXMuX3JlbmRlckhvdmVyUGFydChob3ZlclBhcnQsIG9uRmluaXNoZWRSZW5kZXJpbmcpO1xuXHRcdFx0aG92ZXJQYXJ0c0NvbnRhaW5lci5hcHBlbmRDaGlsZChyZW5kZXJlZEhvdmVyUGFydC5ob3ZlckVsZW1lbnQpO1xuXHRcdFx0cmV0dXJuIHJlbmRlcmVkSG92ZXJQYXJ0O1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVuZGVySG92ZXJQYXJ0KFxuXHRcdGhvdmVyUGFydDogTWFya2Rvd25Ib3Zlcixcblx0XHRvbkZpbmlzaGVkUmVuZGVyaW5nOiAoKSA9PiB2b2lkXG5cdCk6IFJlbmRlcmVkTWFya2Rvd25Ib3ZlclBhcnQge1xuXG5cdFx0Y29uc3QgcmVuZGVyZWRNYXJrZG93blBhcnQgPSB0aGlzLl9yZW5kZXJNYXJrZG93bkhvdmVyKGhvdmVyUGFydCwgb25GaW5pc2hlZFJlbmRlcmluZyk7XG5cdFx0Y29uc3QgcmVuZGVyZWRNYXJrZG93bkVsZW1lbnQgPSByZW5kZXJlZE1hcmtkb3duUGFydC5ob3ZlckVsZW1lbnQ7XG5cdFx0Y29uc3QgaG92ZXJTb3VyY2UgPSBob3ZlclBhcnQuc291cmNlO1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChyZW5kZXJlZE1hcmtkb3duUGFydCk7XG5cblx0XHRpZiAoIWhvdmVyU291cmNlKSB7XG5cdFx0XHRyZXR1cm4gbmV3IFJlbmRlcmVkTWFya2Rvd25Ib3ZlclBhcnQoaG92ZXJQYXJ0LCByZW5kZXJlZE1hcmtkb3duRWxlbWVudCwgZGlzcG9zYWJsZXMpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNhbkluY3JlYXNlVmVyYm9zaXR5ID0gaG92ZXJTb3VyY2Uuc3VwcG9ydHNWZXJib3NpdHlBY3Rpb24oSG92ZXJWZXJib3NpdHlBY3Rpb24uSW5jcmVhc2UpO1xuXHRcdGNvbnN0IGNhbkRlY3JlYXNlVmVyYm9zaXR5ID0gaG92ZXJTb3VyY2Uuc3VwcG9ydHNWZXJib3NpdHlBY3Rpb24oSG92ZXJWZXJib3NpdHlBY3Rpb24uRGVjcmVhc2UpO1xuXG5cdFx0aWYgKCFjYW5JbmNyZWFzZVZlcmJvc2l0eSAmJiAhY2FuRGVjcmVhc2VWZXJib3NpdHkpIHtcblx0XHRcdHJldHVybiBuZXcgUmVuZGVyZWRNYXJrZG93bkhvdmVyUGFydChob3ZlclBhcnQsIHJlbmRlcmVkTWFya2Rvd25FbGVtZW50LCBkaXNwb3NhYmxlcyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgYWN0aW9uc0NvbnRhaW5lciA9ICQoJ2Rpdi52ZXJib3NpdHktYWN0aW9ucycpO1xuXHRcdHJlbmRlcmVkTWFya2Rvd25FbGVtZW50LnByZXBlbmQoYWN0aW9uc0NvbnRhaW5lcik7XG5cdFx0Y29uc3QgYWN0aW9uc0NvbnRhaW5lcklubmVyID0gJCgnZGl2LnZlcmJvc2l0eS1hY3Rpb25zLWlubmVyJyk7XG5cdFx0YWN0aW9uc0NvbnRhaW5lci5hcHBlbmQoYWN0aW9uc0NvbnRhaW5lcklubmVyKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodGhpcy5fcmVuZGVySG92ZXJFeHBhbnNpb25BY3Rpb24oYWN0aW9uc0NvbnRhaW5lcklubmVyLCBIb3ZlclZlcmJvc2l0eUFjdGlvbi5JbmNyZWFzZSwgY2FuSW5jcmVhc2VWZXJib3NpdHkpKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodGhpcy5fcmVuZGVySG92ZXJFeHBhbnNpb25BY3Rpb24oYWN0aW9uc0NvbnRhaW5lcklubmVyLCBIb3ZlclZlcmJvc2l0eUFjdGlvbi5EZWNyZWFzZSwgY2FuRGVjcmVhc2VWZXJib3NpdHkpKTtcblx0XHRyZXR1cm4gbmV3IFJlbmRlcmVkTWFya2Rvd25Ib3ZlclBhcnQoaG92ZXJQYXJ0LCByZW5kZXJlZE1hcmtkb3duRWxlbWVudCwgZGlzcG9zYWJsZXMsIGFjdGlvbnNDb250YWluZXJJbm5lcik7XG5cdH1cblxuXHRwcml2YXRlIF9yZW5kZXJNYXJrZG93bkhvdmVyKFxuXHRcdG1hcmtkb3duSG92ZXI6IE1hcmtkb3duSG92ZXIsXG5cdFx0b25GaW5pc2hlZFJlbmRlcmluZzogKCkgPT4gdm9pZFxuXHQpOiBJUmVuZGVyZWRIb3ZlclBhcnQ8TWFya2Rvd25Ib3Zlcj4ge1xuXHRcdGNvbnN0IHJlbmRlcmVkTWFya2Rvd25Ib3ZlciA9IHJlbmRlck1hcmtkb3duKFxuXHRcdFx0dGhpcy5fZWRpdG9yLFxuXHRcdFx0bWFya2Rvd25Ib3Zlcixcblx0XHRcdHRoaXMuX21hcmtkb3duUmVuZGVyZXJTZXJ2aWNlLFxuXHRcdFx0b25GaW5pc2hlZFJlbmRlcmluZyxcblx0XHQpO1xuXHRcdHJldHVybiByZW5kZXJlZE1hcmtkb3duSG92ZXI7XG5cdH1cblxuXHRwcml2YXRlIF9yZW5kZXJIb3ZlckV4cGFuc2lvbkFjdGlvbihjb250YWluZXI6IEhUTUxFbGVtZW50LCBhY3Rpb246IEhvdmVyVmVyYm9zaXR5QWN0aW9uLCBhY3Rpb25FbmFibGVkOiBib29sZWFuKTogRGlzcG9zYWJsZVN0b3JlIHtcblx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBpc0FjdGlvbkluY3JlYXNlID0gYWN0aW9uID09PSBIb3ZlclZlcmJvc2l0eUFjdGlvbi5JbmNyZWFzZTtcblx0XHRjb25zdCBhY3Rpb25FbGVtZW50ID0gZG9tLmFwcGVuZChjb250YWluZXIsICQoVGhlbWVJY29uLmFzQ1NTU2VsZWN0b3IoaXNBY3Rpb25JbmNyZWFzZSA/IGluY3JlYXNlSG92ZXJWZXJib3NpdHlJY29uIDogZGVjcmVhc2VIb3ZlclZlcmJvc2l0eUljb24pKSk7XG5cdFx0YWN0aW9uRWxlbWVudC50YWJJbmRleCA9IDA7XG5cdFx0Y29uc3QgaG92ZXJEZWxlZ2F0ZSA9IHN0b3JlLmFkZChuZXcgV29ya2JlbmNoSG92ZXJEZWxlZ2F0ZSgnbW91c2UnLCB1bmRlZmluZWQsIHsgdGFyZ2V0OiBjb250YWluZXIsIHBvc2l0aW9uOiB7IGhvdmVyUG9zaXRpb246IEhvdmVyUG9zaXRpb24uTEVGVCB9IH0sIHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLCB0aGlzLl9ob3ZlclNlcnZpY2UpKTtcblx0XHRzdG9yZS5hZGQodGhpcy5faG92ZXJTZXJ2aWNlLnNldHVwTWFuYWdlZEhvdmVyKGhvdmVyRGVsZWdhdGUsIGFjdGlvbkVsZW1lbnQsIGxhYmVsRm9ySG92ZXJWZXJib3NpdHlBY3Rpb24odGhpcy5fa2V5YmluZGluZ1NlcnZpY2UsIGFjdGlvbikpKTtcblx0XHRpZiAoIWFjdGlvbkVuYWJsZWQpIHtcblx0XHRcdGFjdGlvbkVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnZGlzYWJsZWQnKTtcblx0XHRcdHJldHVybiBzdG9yZTtcblx0XHR9XG5cdFx0YWN0aW9uRWxlbWVudC5jbGFzc0xpc3QuYWRkKCdlbmFibGVkJyk7XG5cdFx0Y29uc3QgYWN0aW9uRnVuY3Rpb24gPSAoKSA9PiB0aGlzLl9jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChhY3Rpb24gPT09IEhvdmVyVmVyYm9zaXR5QWN0aW9uLkluY3JlYXNlID8gSU5DUkVBU0VfSE9WRVJfVkVSQk9TSVRZX0FDVElPTl9JRCA6IERFQ1JFQVNFX0hPVkVSX1ZFUkJPU0lUWV9BQ1RJT05fSUQsIHsgZm9jdXM6IHRydWUgfSk7XG5cdFx0c3RvcmUuYWRkKG5ldyBDbGlja0FjdGlvbihhY3Rpb25FbGVtZW50LCBhY3Rpb25GdW5jdGlvbikpO1xuXHRcdHN0b3JlLmFkZChuZXcgS2V5RG93bkFjdGlvbihhY3Rpb25FbGVtZW50LCBhY3Rpb25GdW5jdGlvbiwgW0tleUNvZGUuRW50ZXIsIEtleUNvZGUuU3BhY2VdKSk7XG5cdFx0cmV0dXJuIHN0b3JlO1xuXHR9XG5cblx0cHVibGljIGhhbmRsZVNjcm9sbChlOiBTY3JvbGxFdmVudCk6IHZvaWQge1xuXHRcdHRoaXMucmVuZGVyZWRIb3ZlclBhcnRzLmZvckVhY2gocmVuZGVyZWRIb3ZlclBhcnQgPT4ge1xuXHRcdFx0Y29uc3QgYWN0aW9uc0NvbnRhaW5lcklubmVyID0gcmVuZGVyZWRIb3ZlclBhcnQuYWN0aW9uc0NvbnRhaW5lcjtcblx0XHRcdGlmICghYWN0aW9uc0NvbnRhaW5lcklubmVyKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGhvdmVyRWxlbWVudCA9IHJlbmRlcmVkSG92ZXJQYXJ0LmhvdmVyRWxlbWVudDtcblx0XHRcdGNvbnN0IHRvcE9mSG92ZXJTY3JvbGxQb3NpdGlvbiA9IGUuc2Nyb2xsVG9wO1xuXHRcdFx0Y29uc3QgYm90dG9tT2ZIb3ZlclNjcm9sbFBvc2l0aW9uID0gdG9wT2ZIb3ZlclNjcm9sbFBvc2l0aW9uICsgZS5oZWlnaHQ7XG5cdFx0XHRjb25zdCB0b3BPZlJlbmRlcmVkUGFydCA9IGhvdmVyRWxlbWVudC5vZmZzZXRUb3A7XG5cdFx0XHRjb25zdCBob3ZlckVsZW1lbnRIZWlnaHQgPSBob3ZlckVsZW1lbnQuY2xpZW50SGVpZ2h0O1xuXHRcdFx0Y29uc3QgYm90dG9tT2ZSZW5kZXJlZFBhcnQgPSB0b3BPZlJlbmRlcmVkUGFydCArIGhvdmVyRWxlbWVudEhlaWdodDtcblx0XHRcdGNvbnN0IGljb25zSGVpZ2h0ID0gMjI7XG5cdFx0XHRsZXQgdG9wOiBudW1iZXI7XG5cdFx0XHRpZiAoYm90dG9tT2ZSZW5kZXJlZFBhcnQgPD0gYm90dG9tT2ZIb3ZlclNjcm9sbFBvc2l0aW9uIHx8IHRvcE9mUmVuZGVyZWRQYXJ0ID49IGJvdHRvbU9mSG92ZXJTY3JvbGxQb3NpdGlvbikge1xuXHRcdFx0XHR0b3AgPSBob3ZlckVsZW1lbnRIZWlnaHQgLSBpY29uc0hlaWdodDtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRvcCA9IGJvdHRvbU9mSG92ZXJTY3JvbGxQb3NpdGlvbiAtIHRvcE9mUmVuZGVyZWRQYXJ0IC0gaWNvbnNIZWlnaHQ7XG5cdFx0XHR9XG5cdFx0XHRhY3Rpb25zQ29udGFpbmVySW5uZXIuc3R5bGUudG9wID0gYCR7dG9wfXB4YDtcblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyB1cGRhdGVNYXJrZG93bkhvdmVyUGFydFZlcmJvc2l0eUxldmVsKGFjdGlvbjogSG92ZXJWZXJib3NpdHlBY3Rpb24sIGluZGV4OiBudW1iZXIpOiBQcm9taXNlPHsgaG92ZXJQYXJ0OiBNYXJrZG93bkhvdmVyOyBob3ZlckVsZW1lbnQ6IEhUTUxFbGVtZW50IH0gfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuX2VkaXRvci5nZXRNb2RlbCgpO1xuXHRcdGlmICghbW9kZWwpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IGhvdmVyUmVuZGVyZWRQYXJ0ID0gdGhpcy5fZ2V0UmVuZGVyZWRIb3ZlclBhcnRBdEluZGV4KGluZGV4KTtcblx0XHRjb25zdCBob3ZlclNvdXJjZSA9IGhvdmVyUmVuZGVyZWRQYXJ0Py5ob3ZlclBhcnQuc291cmNlO1xuXHRcdGlmICghaG92ZXJSZW5kZXJlZFBhcnQgfHwgIWhvdmVyU291cmNlPy5zdXBwb3J0c1ZlcmJvc2l0eUFjdGlvbihhY3Rpb24pKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBuZXdIb3ZlciA9IGF3YWl0IHRoaXMuX2ZldGNoSG92ZXIoaG92ZXJTb3VyY2UsIG1vZGVsLCBhY3Rpb24pO1xuXHRcdGlmICghbmV3SG92ZXIpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IG5ld0hvdmVyU291cmNlID0gbmV3IEhvdmVyU291cmNlKG5ld0hvdmVyLCBob3ZlclNvdXJjZS5ob3ZlclByb3ZpZGVyLCBob3ZlclNvdXJjZS5ob3ZlclBvc2l0aW9uKTtcblx0XHRjb25zdCBpbml0aWFsSG92ZXJQYXJ0ID0gaG92ZXJSZW5kZXJlZFBhcnQuaG92ZXJQYXJ0O1xuXHRcdGNvbnN0IG5ld0hvdmVyUGFydCA9IG5ldyBNYXJrZG93bkhvdmVyKFxuXHRcdFx0dGhpcy5faG92ZXJQYXJ0aWNpcGFudCxcblx0XHRcdGluaXRpYWxIb3ZlclBhcnQucmFuZ2UsXG5cdFx0XHRuZXdIb3Zlci5jb250ZW50cyxcblx0XHRcdGluaXRpYWxIb3ZlclBhcnQuaXNCZWZvcmVDb250ZW50LFxuXHRcdFx0aW5pdGlhbEhvdmVyUGFydC5vcmRpbmFsLFxuXHRcdFx0bmV3SG92ZXJTb3VyY2Vcblx0XHQpO1xuXHRcdGNvbnN0IG5ld0hvdmVyUmVuZGVyZWRQYXJ0ID0gdGhpcy5fdXBkYXRlUmVuZGVyZWRIb3ZlclBhcnQoaW5kZXgsIG5ld0hvdmVyUGFydCk7XG5cdFx0aWYgKCFuZXdIb3ZlclJlbmRlcmVkUGFydCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIHtcblx0XHRcdGhvdmVyUGFydDogbmV3SG92ZXJQYXJ0LFxuXHRcdFx0aG92ZXJFbGVtZW50OiBuZXdIb3ZlclJlbmRlcmVkUGFydC5ob3ZlckVsZW1lbnRcblx0XHR9O1xuXHR9XG5cblx0cHVibGljIGdldEFjY2Vzc2libGVDb250ZW50KGhvdmVyUGFydDogTWFya2Rvd25Ib3Zlcik6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgcmVuZGVyZWRIb3ZlclBhcnRJbmRleCA9IHRoaXMucmVuZGVyZWRIb3ZlclBhcnRzLmZpbmRJbmRleChyZW5kZXJlZEhvdmVyUGFydCA9PiByZW5kZXJlZEhvdmVyUGFydC5ob3ZlclBhcnQgPT09IGhvdmVyUGFydCk7XG5cdFx0aWYgKHJlbmRlcmVkSG92ZXJQYXJ0SW5kZXggPT09IC0xKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCByZW5kZXJlZEhvdmVyUGFydCA9IHRoaXMuX2dldFJlbmRlcmVkSG92ZXJQYXJ0QXRJbmRleChyZW5kZXJlZEhvdmVyUGFydEluZGV4KTtcblx0XHRpZiAoIXJlbmRlcmVkSG92ZXJQYXJ0KSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBob3ZlckVsZW1lbnRJbm5lclRleHQgPSByZW5kZXJlZEhvdmVyUGFydC5ob3ZlckVsZW1lbnQuaW5uZXJUZXh0O1xuXHRcdGNvbnN0IGFjY2Vzc2libGVDb250ZW50ID0gaG92ZXJFbGVtZW50SW5uZXJUZXh0LnJlcGxhY2UoL1teXFxTXFxuXFxyXSsvZ3UsICcgJyk7XG5cdFx0cmV0dXJuIGFjY2Vzc2libGVDb250ZW50O1xuXHR9XG5cblx0cHVibGljIGRvZXNNYXJrZG93bkhvdmVyQXRJbmRleFN1cHBvcnRWZXJib3NpdHlBY3Rpb24oaW5kZXg6IG51bWJlciwgYWN0aW9uOiBIb3ZlclZlcmJvc2l0eUFjdGlvbik6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IGhvdmVyUmVuZGVyZWRQYXJ0ID0gdGhpcy5fZ2V0UmVuZGVyZWRIb3ZlclBhcnRBdEluZGV4KGluZGV4KTtcblx0XHRjb25zdCBob3ZlclNvdXJjZSA9IGhvdmVyUmVuZGVyZWRQYXJ0Py5ob3ZlclBhcnQuc291cmNlO1xuXHRcdGlmICghaG92ZXJSZW5kZXJlZFBhcnQgfHwgIWhvdmVyU291cmNlPy5zdXBwb3J0c1ZlcmJvc2l0eUFjdGlvbihhY3Rpb24pKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfZmV0Y2hIb3Zlcihob3ZlclNvdXJjZTogSG92ZXJTb3VyY2UsIG1vZGVsOiBJVGV4dE1vZGVsLCBhY3Rpb246IEhvdmVyVmVyYm9zaXR5QWN0aW9uKTogUHJvbWlzZTxIb3ZlciB8IG51bGwgfCB1bmRlZmluZWQ+IHtcblx0XHRsZXQgdmVyYm9zaXR5RGVsdGEgPSBhY3Rpb24gPT09IEhvdmVyVmVyYm9zaXR5QWN0aW9uLkluY3JlYXNlID8gMSA6IC0xO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gaG92ZXJTb3VyY2UuaG92ZXJQcm92aWRlcjtcblx0XHRjb25zdCBvbmdvaW5nSG92ZXJPcGVyYXRpb24gPSB0aGlzLl9vbmdvaW5nSG92ZXJPcGVyYXRpb25zLmdldChwcm92aWRlcik7XG5cdFx0aWYgKG9uZ29pbmdIb3Zlck9wZXJhdGlvbikge1xuXHRcdFx0b25nb2luZ0hvdmVyT3BlcmF0aW9uLnRva2VuU291cmNlLmNhbmNlbCgpO1xuXHRcdFx0dmVyYm9zaXR5RGVsdGEgKz0gb25nb2luZ0hvdmVyT3BlcmF0aW9uLnZlcmJvc2l0eURlbHRhO1xuXHRcdH1cblx0XHRjb25zdCB0b2tlblNvdXJjZSA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdHRoaXMuX29uZ29pbmdIb3Zlck9wZXJhdGlvbnMuc2V0KHByb3ZpZGVyLCB7IHZlcmJvc2l0eURlbHRhLCB0b2tlblNvdXJjZSB9KTtcblx0XHRjb25zdCBjb250ZXh0OiBIb3ZlckNvbnRleHQgPSB7IHZlcmJvc2l0eVJlcXVlc3Q6IHsgdmVyYm9zaXR5RGVsdGEsIHByZXZpb3VzSG92ZXI6IGhvdmVyU291cmNlLmhvdmVyIH0gfTtcblx0XHRsZXQgaG92ZXI6IEhvdmVyIHwgbnVsbCB8IHVuZGVmaW5lZDtcblx0XHR0cnkge1xuXHRcdFx0aG92ZXIgPSBhd2FpdCBQcm9taXNlLnJlc29sdmUocHJvdmlkZXIucHJvdmlkZUhvdmVyKG1vZGVsLCBob3ZlclNvdXJjZS5ob3ZlclBvc2l0aW9uLCB0b2tlblNvdXJjZS50b2tlbiwgY29udGV4dCkpO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdG9uVW5leHBlY3RlZEV4dGVybmFsRXJyb3IoZSk7XG5cdFx0fVxuXHRcdHRva2VuU291cmNlLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9vbmdvaW5nSG92ZXJPcGVyYXRpb25zLmRlbGV0ZShwcm92aWRlcik7XG5cdFx0cmV0dXJuIGhvdmVyO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlUmVuZGVyZWRIb3ZlclBhcnQoaW5kZXg6IG51bWJlciwgaG92ZXJQYXJ0OiBNYXJrZG93bkhvdmVyKTogUmVuZGVyZWRNYXJrZG93bkhvdmVyUGFydCB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKGluZGV4ID49IHRoaXMucmVuZGVyZWRIb3ZlclBhcnRzLmxlbmd0aCB8fCBpbmRleCA8IDApIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IHJlbmRlcmVkSG92ZXJQYXJ0ID0gdGhpcy5fcmVuZGVySG92ZXJQYXJ0KGhvdmVyUGFydCwgdGhpcy5fb25GaW5pc2hlZFJlbmRlcmluZyk7XG5cdFx0Y29uc3QgY3VycmVudFJlbmRlcmVkSG92ZXJQYXJ0ID0gdGhpcy5yZW5kZXJlZEhvdmVyUGFydHNbaW5kZXhdO1xuXHRcdGNvbnN0IGN1cnJlbnRSZW5kZXJlZE1hcmtkb3duID0gY3VycmVudFJlbmRlcmVkSG92ZXJQYXJ0LmhvdmVyRWxlbWVudDtcblx0XHRjb25zdCByZW5kZXJlZE1hcmtkb3duID0gcmVuZGVyZWRIb3ZlclBhcnQuaG92ZXJFbGVtZW50O1xuXHRcdGNvbnN0IHJlbmRlcmVkQ2hpbGRyZW5FbGVtZW50cyA9IEFycmF5LmZyb20ocmVuZGVyZWRNYXJrZG93bi5jaGlsZHJlbik7XG5cdFx0Y3VycmVudFJlbmRlcmVkTWFya2Rvd24ucmVwbGFjZUNoaWxkcmVuKC4uLnJlbmRlcmVkQ2hpbGRyZW5FbGVtZW50cyk7XG5cdFx0Y29uc3QgbmV3UmVuZGVyZWRIb3ZlclBhcnQgPSBuZXcgUmVuZGVyZWRNYXJrZG93bkhvdmVyUGFydChcblx0XHRcdGhvdmVyUGFydCxcblx0XHRcdGN1cnJlbnRSZW5kZXJlZE1hcmtkb3duLFxuXHRcdFx0cmVuZGVyZWRIb3ZlclBhcnQuZGlzcG9zYWJsZXMsXG5cdFx0XHRyZW5kZXJlZEhvdmVyUGFydC5hY3Rpb25zQ29udGFpbmVyXG5cdFx0KTtcblx0XHRjdXJyZW50UmVuZGVyZWRIb3ZlclBhcnQuZGlzcG9zZSgpO1xuXHRcdHRoaXMucmVuZGVyZWRIb3ZlclBhcnRzW2luZGV4XSA9IG5ld1JlbmRlcmVkSG92ZXJQYXJ0O1xuXHRcdHJldHVybiBuZXdSZW5kZXJlZEhvdmVyUGFydDtcblx0fVxuXG5cdHByaXZhdGUgX2dldFJlbmRlcmVkSG92ZXJQYXJ0QXRJbmRleChpbmRleDogbnVtYmVyKTogUmVuZGVyZWRNYXJrZG93bkhvdmVyUGFydCB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMucmVuZGVyZWRIb3ZlclBhcnRzW2luZGV4XTtcblx0fVxuXG5cdHB1YmxpYyBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVuZGVyTWFya2Rvd25Ib3ZlcnMoXG5cdGNvbnRleHQ6IElFZGl0b3JIb3ZlclJlbmRlckNvbnRleHQsXG5cdG1hcmtkb3duSG92ZXJzOiBNYXJrZG93bkhvdmVyW10sXG5cdGVkaXRvcjogSUNvZGVFZGl0b3IsXG5cdG1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlOiBJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UsXG4pOiBJUmVuZGVyZWRIb3ZlclBhcnRzPE1hcmtkb3duSG92ZXI+IHtcblxuXHQvLyBTb3J0IGhvdmVyIHBhcnRzIHRvIGtlZXAgdGhlbSBzdGFibGUgc2luY2UgdGhleSBtaWdodCBjb21lIGluIGFzeW5jLCBvdXQtb2Ytb3JkZXJcblx0bWFya2Rvd25Ib3ZlcnMuc29ydChjb21wYXJlQnkoaG92ZXIgPT4gaG92ZXIub3JkaW5hbCwgbnVtYmVyQ29tcGFyYXRvcikpO1xuXHRjb25zdCByZW5kZXJlZEhvdmVyUGFydHM6IElSZW5kZXJlZEhvdmVyUGFydDxNYXJrZG93bkhvdmVyPltdID0gW107XG5cdGZvciAoY29uc3QgbWFya2Rvd25Ib3ZlciBvZiBtYXJrZG93bkhvdmVycykge1xuXHRcdGNvbnN0IHJlbmRlcmVkSG92ZXJQYXJ0ID0gcmVuZGVyTWFya2Rvd24oXG5cdFx0XHRlZGl0b3IsXG5cdFx0XHRtYXJrZG93bkhvdmVyLFxuXHRcdFx0bWFya2Rvd25SZW5kZXJlclNlcnZpY2UsXG5cdFx0XHRjb250ZXh0Lm9uQ29udGVudHNDaGFuZ2VkLFxuXHRcdCk7XG5cdFx0Y29udGV4dC5mcmFnbWVudC5hcHBlbmRDaGlsZChyZW5kZXJlZEhvdmVyUGFydC5ob3ZlckVsZW1lbnQpO1xuXHRcdHJlbmRlcmVkSG92ZXJQYXJ0cy5wdXNoKHJlbmRlcmVkSG92ZXJQYXJ0KTtcblx0fVxuXHRyZXR1cm4gbmV3IFJlbmRlcmVkSG92ZXJQYXJ0cyhyZW5kZXJlZEhvdmVyUGFydHMpO1xufVxuXG5mdW5jdGlvbiByZW5kZXJNYXJrZG93bihcblx0ZWRpdG9yOiBJQ29kZUVkaXRvcixcblx0bWFya2Rvd25Ib3ZlcjogTWFya2Rvd25Ib3Zlcixcblx0bWFya2Rvd25SZW5kZXJlclNlcnZpY2U6IElNYXJrZG93blJlbmRlcmVyU2VydmljZSxcblx0b25GaW5pc2hlZFJlbmRlcmluZzogKCkgPT4gdm9pZCxcbik6IElSZW5kZXJlZEhvdmVyUGFydDxNYXJrZG93bkhvdmVyPiB7XG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRjb25zdCByZW5kZXJlZE1hcmtkb3duID0gJCgnZGl2LmhvdmVyLXJvdycpO1xuXHRjb25zdCByZW5kZXJlZE1hcmtkb3duQ29udGVudHMgPSAkKCdkaXYuaG92ZXItcm93LWNvbnRlbnRzJyk7XG5cdHJlbmRlcmVkTWFya2Rvd24uYXBwZW5kQ2hpbGQocmVuZGVyZWRNYXJrZG93bkNvbnRlbnRzKTtcblx0Y29uc3QgbWFya2Rvd25TdHJpbmdzID0gbWFya2Rvd25Ib3Zlci5jb250ZW50cztcblx0Zm9yIChjb25zdCBtYXJrZG93blN0cmluZyBvZiBtYXJrZG93blN0cmluZ3MpIHtcblx0XHRpZiAoaXNFbXB0eU1hcmtkb3duU3RyaW5nKG1hcmtkb3duU3RyaW5nKSkge1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXHRcdGNvbnN0IG1hcmtkb3duSG92ZXJFbGVtZW50ID0gJCgnZGl2Lm1hcmtkb3duLWhvdmVyJyk7XG5cdFx0Y29uc3QgaG92ZXJDb250ZW50c0VsZW1lbnQgPSBkb20uYXBwZW5kKG1hcmtkb3duSG92ZXJFbGVtZW50LCAkKCdkaXYuaG92ZXItY29udGVudHMnKSk7XG5cblx0XHRjb25zdCByZW5kZXJlZENvbnRlbnRzID0gZGlzcG9zYWJsZXMuYWRkKG1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlLnJlbmRlcihtYXJrZG93blN0cmluZywge1xuXHRcdFx0Y29udGV4dDogZWRpdG9yLFxuXHRcdFx0YXN5bmNSZW5kZXJDYWxsYmFjazogKCkgPT4ge1xuXHRcdFx0XHRob3ZlckNvbnRlbnRzRWxlbWVudC5jbGFzc05hbWUgPSAnaG92ZXItY29udGVudHMgY29kZS1ob3Zlci1jb250ZW50cyc7XG5cdFx0XHRcdG9uRmluaXNoZWRSZW5kZXJpbmcoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0aG92ZXJDb250ZW50c0VsZW1lbnQuYXBwZW5kQ2hpbGQocmVuZGVyZWRDb250ZW50cy5lbGVtZW50KTtcblx0XHRyZW5kZXJlZE1hcmtkb3duQ29udGVudHMuYXBwZW5kQ2hpbGQobWFya2Rvd25Ib3ZlckVsZW1lbnQpO1xuXHR9XG5cdGNvbnN0IHJlbmRlcmVkSG92ZXJQYXJ0OiBJUmVuZGVyZWRIb3ZlclBhcnQ8TWFya2Rvd25Ib3Zlcj4gPSB7XG5cdFx0aG92ZXJQYXJ0OiBtYXJrZG93bkhvdmVyLFxuXHRcdGhvdmVyRWxlbWVudDogcmVuZGVyZWRNYXJrZG93bixcblx0XHRkaXNwb3NlKCkgeyBkaXNwb3NhYmxlcy5kaXNwb3NlKCk7IH1cblx0fTtcblx0cmV0dXJuIHJlbmRlcmVkSG92ZXJQYXJ0O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbGFiZWxGb3JIb3ZlclZlcmJvc2l0eUFjdGlvbihrZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLCBhY3Rpb246IEhvdmVyVmVyYm9zaXR5QWN0aW9uKTogc3RyaW5nIHtcblx0c3dpdGNoIChhY3Rpb24pIHtcblx0XHRjYXNlIEhvdmVyVmVyYm9zaXR5QWN0aW9uLkluY3JlYXNlOlxuXHRcdFx0cmV0dXJuIGtleWJpbmRpbmdTZXJ2aWNlLmFwcGVuZEtleWJpbmRpbmcobmxzLmxvY2FsaXplKCdpbmNyZWFzZVZlcmJvc2l0eScsIFwiSW5jcmVhc2UgSG92ZXIgVmVyYm9zaXR5XCIpLCBJTkNSRUFTRV9IT1ZFUl9WRVJCT1NJVFlfQUNUSU9OX0lEKTtcblx0XHRjYXNlIEhvdmVyVmVyYm9zaXR5QWN0aW9uLkRlY3JlYXNlOlxuXHRcdFx0cmV0dXJuIGtleWJpbmRpbmdTZXJ2aWNlLmFwcGVuZEtleWJpbmRpbmcobmxzLmxvY2FsaXplKCdkZWNyZWFzZVZlcmJvc2l0eScsIFwiRGVjcmVhc2UgSG92ZXIgVmVyYm9zaXR5XCIpLCBERUNSRUFTRV9IT1ZFUl9WRVJCT1NJVFlfQUNUSU9OX0lEKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxZQUFZLFNBQVM7QUFDckIsU0FBUyxTQUFTLFdBQVcsd0JBQXdCO0FBQ3JELFNBQTRCLCtCQUErQjtBQUMzRCxTQUEwQix1QkFBdUIsc0JBQXNCO0FBQ3ZFLFNBQVMsaUJBQWlCLG9CQUFvQjtBQUM5QyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLG9DQUFvQyxvQ0FBb0MsOENBQThDO0FBRy9ILFNBQVMsYUFBYTtBQUV0QixTQUFzQixpQkFBNEksMEJBQTBCO0FBQzVMLFlBQVksU0FBUztBQUNyQixTQUFTLDZCQUE2QjtBQUN0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
