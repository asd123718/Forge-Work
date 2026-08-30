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
import { isHTMLElement, ModifierKeyEmitter } from "../../../../base/browser/dom.js";
import { isNonEmptyArray } from "../../../../base/common/arrays.js";
import { disposableTimeout, RunOnceScheduler } from "../../../../base/common/async.js";
import { CancellationToken, CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { onUnexpectedError } from "../../../../base/common/errors.js";
import { DisposableStore, MutableDisposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { LRUCache } from "../../../../base/common/map.js";
import { assertType } from "../../../../base/common/types.js";
import { URI } from "../../../../base/common/uri.js";
import { MouseTargetType } from "../../../browser/editorBrowser.js";
import { DynamicCssRules } from "../../../browser/editorDom.js";
import { StableEditorScrollState } from "../../../browser/stableEditorScroll.js";
import { EditorOption } from "../../../common/config/editorOptions.js";
import { EDITOR_FONT_DEFAULTS } from "../../../common/config/fontInfo.js";
import { EditOperation } from "../../../common/core/editOperation.js";
import { Range } from "../../../common/core/range.js";
import * as languages from "../../../common/languages.js";
import { InjectedTextCursorStops, TrackedRangeStickiness } from "../../../common/model.js";
import { ModelDecorationInjectedTextOptions } from "../../../common/model/textModel.js";
import { ILanguageFeatureDebounceService } from "../../../common/services/languageFeatureDebounce.js";
import { ILanguageFeaturesService } from "../../../common/services/languageFeatures.js";
import { ITextModelService } from "../../../common/services/resolverService.js";
import { ClickLinkGesture } from "../../gotoSymbol/browser/link/clickLinkGesture.js";
import { InlayHintAnchor, InlayHintsFragments } from "./inlayHints.js";
import { goToDefinitionWithLocation, showGoToContextMenu } from "./inlayHintsLocations.js";
import { CommandsRegistry, ICommandService } from "../../../../platform/commands/common/commands.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { createDecorator, IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { INotificationService, Severity } from "../../../../platform/notification/common/notification.js";
import * as colors from "../../../../platform/theme/common/colorRegistry.js";
import { themeColorFromId } from "../../../../platform/theme/common/themeService.js";
class InlayHintsCache {
  constructor() {
    this._entries = new LRUCache(50);
  }
  get(model) {
    const key = InlayHintsCache._key(model);
    return this._entries.get(key);
  }
  set(model, value) {
    const key = InlayHintsCache._key(model);
    this._entries.set(key, value);
  }
  static _key(model) {
    return `${model.uri.toString()}/${model.getVersionId()}`;
  }
}
const IInlayHintsCache = createDecorator("IInlayHintsCache");
registerSingleton(IInlayHintsCache, InlayHintsCache, InstantiationType.Delayed);
class RenderedInlayHintLabelPart {
  constructor(item, index) {
    this.item = item;
    this.index = index;
  }
  get part() {
    const label = this.item.hint.label;
    if (typeof label === "string") {
      return { label };
    } else {
      return label[this.index];
    }
  }
}
class ActiveInlayHintInfo {
  constructor(part, hasTriggerModifier) {
    this.part = part;
    this.hasTriggerModifier = hasTriggerModifier;
  }
}
var RenderMode = /* @__PURE__ */ ((RenderMode2) => {
  RenderMode2[RenderMode2["Normal"] = 0] = "Normal";
  RenderMode2[RenderMode2["Invisible"] = 1] = "Invisible";
  return RenderMode2;
})(RenderMode || {});
class CancellationStore {
  constructor() {
    this._store = new MutableDisposable();
    this._tokenSource = new CancellationTokenSource();
  }
  dispose() {
    this._store.dispose();
    this._tokenSource.dispose(true);
  }
  reset() {
    this._tokenSource.dispose(true);
    this._tokenSource = new CancellationTokenSource();
    this._store.value = new DisposableStore();
    return {
      store: this._store.value,
      token: this._tokenSource.token
    };
  }
}
let InlayHintsController = class {
  constructor(_editor, _languageFeaturesService, _featureDebounce, _inlayHintsCache, _commandService, _notificationService, _instaService) {
    this._editor = _editor;
    this._languageFeaturesService = _languageFeaturesService;
    this._inlayHintsCache = _inlayHintsCache;
    this._commandService = _commandService;
    this._notificationService = _notificationService;
    this._instaService = _instaService;
    this._disposables = new DisposableStore();
    this._sessionDisposables = new DisposableStore();
    this._decorationsMetadata = /* @__PURE__ */ new Map();
    this._activeRenderMode = 0 /* Normal */;
    this._ruleFactory = this._disposables.add(new DynamicCssRules(this._editor));
    this._debounceInfo = _featureDebounce.for(_languageFeaturesService.inlayHintsProvider, "InlayHint", { min: 25 });
    this._disposables.add(_languageFeaturesService.inlayHintsProvider.onDidChange(() => this._update()));
    this._disposables.add(_editor.onDidChangeModel(() => this._update()));
    this._disposables.add(_editor.onDidChangeModelLanguage(() => this._update()));
    this._disposables.add(_editor.onDidChangeConfiguration((e) => {
      if (e.hasChanged(EditorOption.inlayHints)) {
        this._update();
      }
    }));
    this._update();
  }
  static get(editor) {
    return editor.getContribution(InlayHintsController.ID) ?? void 0;
  }
  dispose() {
    this._sessionDisposables.dispose();
    this._removeAllDecorations();
    this._disposables.dispose();
  }
  _update() {
    this._sessionDisposables.clear();
    this._removeAllDecorations();
    const options = this._editor.getOption(EditorOption.inlayHints);
    if (options.enabled === "off") {
      return;
    }
    const model = this._editor.getModel();
    if (!model || !this._languageFeaturesService.inlayHintsProvider.has(model)) {
      return;
    }
    if (options.enabled === "on") {
      this._activeRenderMode = 0 /* Normal */;
    } else {
      let defaultMode;
      let altMode;
      if (options.enabled === "onUnlessPressed") {
        defaultMode = 0 /* Normal */;
        altMode = 1 /* Invisible */;
      } else {
        defaultMode = 1 /* Invisible */;
        altMode = 0 /* Normal */;
      }
      this._activeRenderMode = defaultMode;
      this._sessionDisposables.add(ModifierKeyEmitter.getInstance().event((e) => {
        if (!this._editor.hasModel()) {
          return;
        }
        const newRenderMode = e.altKey && e.ctrlKey && !(e.shiftKey || e.metaKey) ? altMode : defaultMode;
        if (newRenderMode !== this._activeRenderMode) {
          this._activeRenderMode = newRenderMode;
          const model2 = this._editor.getModel();
          const copies = this._copyInlayHintsWithCurrentAnchor(model2);
          this._updateHintsDecorators([model2.getFullModelRange()], copies);
          scheduler.schedule(0);
        }
      }));
    }
    const cached = this._inlayHintsCache.get(model);
    if (cached) {
      this._updateHintsDecorators([model.getFullModelRange()], cached);
    }
    this._sessionDisposables.add(toDisposable(() => {
      if (!model.isDisposed()) {
        this._cacheHintsForFastRestore(model);
      }
    }));
    let cts;
    const watchedProviders = /* @__PURE__ */ new Set();
    this._sessionDisposables.add(model.onWillDispose(() => cts?.cancel()));
    const cancellationStore = this._sessionDisposables.add(new CancellationStore());
    const scheduler = new RunOnceScheduler(async () => {
      const t1 = Date.now();
      const { store, token } = cancellationStore.reset();
      try {
        const inlayHints = await InlayHintsFragments.create(this._languageFeaturesService.inlayHintsProvider, model, this._getHintsRanges(), token);
        scheduler.delay = this._debounceInfo.update(model, Date.now() - t1);
        if (token.isCancellationRequested) {
          inlayHints.dispose();
          return;
        }
        for (const provider of inlayHints.provider) {
          if (typeof provider.onDidChangeInlayHints === "function" && !watchedProviders.has(provider)) {
            watchedProviders.add(provider);
            store.add(provider.onDidChangeInlayHints(() => {
              if (!scheduler.isScheduled()) {
                scheduler.schedule();
              }
            }));
          }
        }
        store.add(inlayHints);
        store.add(toDisposable(() => watchedProviders.clear()));
        this._updateHintsDecorators(inlayHints.ranges, inlayHints.items);
        this._cacheHintsForFastRestore(model);
      } catch (err) {
        onUnexpectedError(err);
      }
    }, this._debounceInfo.get(model));
    this._sessionDisposables.add(scheduler);
    scheduler.schedule(0);
    this._sessionDisposables.add(this._editor.onDidScrollChange((e) => {
      if (e.scrollTopChanged || !scheduler.isScheduled()) {
        scheduler.schedule();
      }
    }));
    const cursor = this._sessionDisposables.add(new MutableDisposable());
    this._sessionDisposables.add(this._editor.onDidChangeModelContent((e) => {
      cts?.cancel();
      const delay = Math.max(scheduler.delay, 800);
      this._cursorInfo = { position: this._editor.getPosition(), notEarlierThan: Date.now() + delay };
      cursor.value = disposableTimeout(() => scheduler.schedule(0), delay);
      scheduler.schedule();
    }));
    this._sessionDisposables.add(this._editor.onDidChangeConfiguration((e) => {
      if (e.hasChanged(EditorOption.inlayHints)) {
        scheduler.schedule();
      }
    }));
    this._sessionDisposables.add(this._installDblClickGesture(() => scheduler.schedule(0)));
    this._sessionDisposables.add(this._installLinkGesture());
    this._sessionDisposables.add(this._installContextMenu());
  }
  _installLinkGesture() {
    const store = new DisposableStore();
    const gesture = store.add(new ClickLinkGesture(this._editor));
    const sessionStore = new DisposableStore();
    store.add(sessionStore);
    store.add(gesture.onMouseMoveOrRelevantKeyDown((e) => {
      const [mouseEvent] = e;
      const labelPart = this._getInlayHintLabelPart(mouseEvent);
      const model = this._editor.getModel();
      if (!labelPart || !model) {
        sessionStore.clear();
        return;
      }
      const cts = new CancellationTokenSource();
      sessionStore.add(toDisposable(() => cts.dispose(true)));
      labelPart.item.resolve(cts.token);
      this._activeInlayHintPart = labelPart.part.command || labelPart.part.location ? new ActiveInlayHintInfo(labelPart, mouseEvent.hasTriggerModifier) : void 0;
      const lineNumber = model.validatePosition(labelPart.item.hint.position).lineNumber;
      const range = new Range(lineNumber, 1, lineNumber, model.getLineMaxColumn(lineNumber));
      const lineHints = this._getInlineHintsForRange(range);
      this._updateHintsDecorators([range], lineHints);
      sessionStore.add(toDisposable(() => {
        this._activeInlayHintPart = void 0;
        this._updateHintsDecorators([range], lineHints);
      }));
    }));
    store.add(gesture.onCancel(() => sessionStore.clear()));
    store.add(gesture.onExecute(async (e) => {
      const label = this._getInlayHintLabelPart(e);
      if (label) {
        const part = label.part;
        if (part.location) {
          this._instaService.invokeFunction(goToDefinitionWithLocation, e, this._editor, part.location);
        } else if (languages.Command.is(part.command)) {
          await this._invokeCommand(part.command, label.item);
        }
      }
    }));
    return store;
  }
  _getInlineHintsForRange(range) {
    const lineHints = /* @__PURE__ */ new Set();
    for (const data of this._decorationsMetadata.values()) {
      if (range.containsRange(data.item.anchor.range)) {
        lineHints.add(data.item);
      }
    }
    return Array.from(lineHints);
  }
  _installDblClickGesture(updateInlayHints) {
    return this._editor.onMouseUp(async (e) => {
      if (e.event.detail !== 2) {
        return;
      }
      const part = this._getInlayHintLabelPart(e);
      if (!part) {
        return;
      }
      e.event.preventDefault();
      await part.item.resolve(CancellationToken.None);
      if (isNonEmptyArray(part.item.hint.textEdits)) {
        const edits = part.item.hint.textEdits.map((edit) => EditOperation.replace(Range.lift(edit.range), edit.text));
        this._editor.executeEdits("inlayHint.default", edits);
        updateInlayHints();
      }
    });
  }
  _installContextMenu() {
    return this._editor.onContextMenu(async (e) => {
      if (!isHTMLElement(e.event.target)) {
        return;
      }
      const part = this._getInlayHintLabelPart(e);
      if (part) {
        await this._instaService.invokeFunction(showGoToContextMenu, this._editor, e.event.target, part);
      }
    });
  }
  _getInlayHintLabelPart(e) {
    if (e.target.type !== MouseTargetType.CONTENT_TEXT) {
      return void 0;
    }
    const options = e.target.detail.injectedText?.options;
    if (options instanceof ModelDecorationInjectedTextOptions && options?.attachedData instanceof RenderedInlayHintLabelPart) {
      return options.attachedData;
    }
    return void 0;
  }
  async _invokeCommand(command, item) {
    try {
      await this._commandService.executeCommand(command.id, ...command.arguments ?? []);
    } catch (err) {
      this._notificationService.notify({
        severity: Severity.Error,
        source: item.provider.displayName,
        message: err
      });
    }
  }
  _cacheHintsForFastRestore(model) {
    const hints = this._copyInlayHintsWithCurrentAnchor(model);
    this._inlayHintsCache.set(model, hints);
  }
  // return inlay hints but with an anchor that reflects "updates"
  // that happened after receiving them, e.g adding new lines before a hint
  _copyInlayHintsWithCurrentAnchor(model) {
    const items = /* @__PURE__ */ new Map();
    for (const [id, obj] of this._decorationsMetadata) {
      if (items.has(obj.item)) {
        continue;
      }
      const range = model.getDecorationRange(id);
      if (range) {
        const anchor = new InlayHintAnchor(range, obj.item.anchor.direction);
        const copy = obj.item.with({ anchor });
        items.set(obj.item, copy);
      }
    }
    return Array.from(items.values());
  }
  _getHintsRanges() {
    const extra = 30;
    const model = this._editor.getModel();
    const visibleRanges = this._editor.getVisibleRangesPlusViewportAboveBelow();
    const result = [];
    for (const range of visibleRanges.sort(Range.compareRangesUsingStarts)) {
      const extendedRange = model.validateRange(new Range(range.startLineNumber - extra, range.startColumn, range.endLineNumber + extra, range.endColumn));
      if (result.length === 0 || !Range.areIntersectingOrTouching(result[result.length - 1], extendedRange)) {
        result.push(extendedRange);
      } else {
        result[result.length - 1] = Range.plusRange(result[result.length - 1], extendedRange);
      }
    }
    return result;
  }
  _updateHintsDecorators(ranges, items) {
    const itemFixedLengths = /* @__PURE__ */ new Map();
    if (this._cursorInfo && this._cursorInfo.notEarlierThan > Date.now() && ranges.some((range) => range.containsPosition(this._cursorInfo.position))) {
      const { position } = this._cursorInfo;
      this._cursorInfo = void 0;
      const lengths = /* @__PURE__ */ new Map();
      for (const deco of this._editor.getLineDecorations(position.lineNumber) ?? []) {
        const data = this._decorationsMetadata.get(deco.id);
        if (deco.range.startColumn > position.column) {
          continue;
        }
        const opts = data?.decoration.options[data.item.anchor.direction];
        if (opts && opts.attachedData !== InlayHintsController._whitespaceData) {
          const len = lengths.get(data.item) ?? 0;
          lengths.set(data.item, len + opts.content.length);
        }
      }
      const newItemsWithFixedLength = items.filter((item) => item.anchor.range.startLineNumber === position.lineNumber && item.anchor.range.endColumn <= position.column);
      const fixedLengths = Array.from(lengths.values());
      let lastItem;
      while (true) {
        const targetItem = newItemsWithFixedLength.shift();
        const fixedLength = fixedLengths.shift();
        if (!fixedLength && !targetItem) {
          break;
        }
        if (targetItem) {
          itemFixedLengths.set(targetItem, fixedLength ?? 0);
          lastItem = targetItem;
        } else if (lastItem && fixedLength) {
          let len = itemFixedLengths.get(lastItem);
          len += fixedLength;
          len += fixedLengths.reduce((p, c) => p + c, 0);
          fixedLengths.length = 0;
          break;
        }
      }
    }
    const newDecorationsData = [];
    const addInjectedText = (item, ref, content, cursorStops, attachedData) => {
      const opts = {
        content,
        inlineClassNameAffectsLetterSpacing: true,
        inlineClassName: ref.className,
        cursorStops,
        attachedData
      };
      newDecorationsData.push({
        item,
        classNameRef: ref,
        decoration: {
          range: item.anchor.range,
          options: {
            // className: "rangeHighlight", // DEBUG highlight to see to what range a hint is attached
            description: "InlayHint",
            showIfCollapsed: item.anchor.range.isEmpty(),
            // "original" range is empty
            collapseOnReplaceEdit: !item.anchor.range.isEmpty(),
            stickiness: TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges,
            [item.anchor.direction]: this._activeRenderMode === 0 /* Normal */ ? opts : void 0
          }
        }
      });
    };
    const addInjectedWhitespace = (item, isLast) => {
      const marginRule = this._ruleFactory.createClassNameRef({
        width: `${fontSize / 3 | 0}px`,
        display: "inline-block"
      });
      addInjectedText(item, marginRule, "\u200A", isLast ? InjectedTextCursorStops.Right : InjectedTextCursorStops.None, InlayHintsController._whitespaceData);
    };
    const { fontSize, fontFamily, padding, isUniform } = this._getLayoutInfo();
    const maxLength = this._editor.getOption(EditorOption.inlayHints).maximumLength;
    const fontFamilyVar = "--code-editorInlayHintsFontFamily";
    this._editor.getContainerDomNode().style.setProperty(fontFamilyVar, fontFamily);
    let currentLineInfo = { line: 0, totalLen: 0 };
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (currentLineInfo.line !== item.anchor.range.startLineNumber) {
        currentLineInfo = { line: item.anchor.range.startLineNumber, totalLen: 0 };
      }
      if (maxLength && currentLineInfo.totalLen > maxLength) {
        continue;
      }
      if (item.hint.paddingLeft) {
        addInjectedWhitespace(item, false);
      }
      const parts = typeof item.hint.label === "string" ? [{ label: item.hint.label }] : item.hint.label;
      const itemFixedLength = itemFixedLengths.get(item);
      let itemActualLength = 0;
      for (let i2 = 0; i2 < parts.length; i2++) {
        const part = parts[i2];
        const isFirst = i2 === 0;
        const isLast = i2 === parts.length - 1;
        const cssProperties = {
          fontSize: `${fontSize}px`,
          fontFamily: `var(${fontFamilyVar}), ${EDITOR_FONT_DEFAULTS.fontFamily}`,
          verticalAlign: isUniform ? "baseline" : "middle",
          unicodeBidi: "isolate"
        };
        if (isNonEmptyArray(item.hint.textEdits)) {
          cssProperties.cursor = "default";
        }
        this._fillInColors(cssProperties, item.hint);
        if ((part.command || part.location) && this._activeInlayHintPart?.part.item === item && this._activeInlayHintPart.part.index === i2) {
          cssProperties.textDecoration = "underline";
          if (this._activeInlayHintPart.hasTriggerModifier) {
            cssProperties.color = themeColorFromId(colors.editorActiveLinkForeground);
            cssProperties.cursor = "pointer";
          }
        }
        let textlabel = part.label;
        currentLineInfo.totalLen += textlabel.length;
        let tooLong = false;
        const over = maxLength !== 0 ? currentLineInfo.totalLen - maxLength : 0;
        if (over > 0) {
          textlabel = textlabel.slice(0, -over) + "\u2026";
          tooLong = true;
        }
        itemActualLength += textlabel.length;
        if (itemFixedLength !== void 0) {
          const overFixedLength = itemActualLength - itemFixedLength;
          if (overFixedLength >= 0) {
            itemActualLength -= overFixedLength;
            textlabel = textlabel.slice(0, -(1 + overFixedLength)) + "\u2026";
            tooLong = true;
          }
        }
        if (padding) {
          if (isFirst && (isLast || tooLong)) {
            cssProperties.padding = `1px ${Math.max(1, fontSize / 4) | 0}px`;
            cssProperties.borderRadius = `${fontSize / 4 | 0}px`;
          } else if (isFirst) {
            cssProperties.padding = `1px 0 1px ${Math.max(1, fontSize / 4) | 0}px`;
            cssProperties.borderRadius = `${fontSize / 4 | 0}px 0 0 ${fontSize / 4 | 0}px`;
          } else if (isLast || tooLong) {
            cssProperties.padding = `1px ${Math.max(1, fontSize / 4) | 0}px 1px 0`;
            cssProperties.borderRadius = `0 ${fontSize / 4 | 0}px ${fontSize / 4 | 0}px 0`;
          } else {
            cssProperties.padding = `1px 0 1px 0`;
          }
        }
        addInjectedText(
          item,
          this._ruleFactory.createClassNameRef(cssProperties),
          fixSpace(textlabel),
          isLast && !item.hint.paddingRight ? InjectedTextCursorStops.Right : InjectedTextCursorStops.None,
          new RenderedInlayHintLabelPart(item, i2)
        );
        if (tooLong) {
          break;
        }
      }
      if (itemFixedLength !== void 0 && itemActualLength < itemFixedLength) {
        const pad = itemFixedLength - itemActualLength;
        addInjectedText(
          item,
          this._ruleFactory.createClassNameRef({}),
          "\u200A".repeat(pad),
          InjectedTextCursorStops.None
        );
      }
      if (item.hint.paddingRight) {
        addInjectedWhitespace(item, true);
      }
      if (newDecorationsData.length > InlayHintsController._MAX_DECORATORS) {
        break;
      }
    }
    const decorationIdsToReplace = [];
    for (const [id, metadata] of this._decorationsMetadata) {
      const range = this._editor.getModel()?.getDecorationRange(id);
      if (range && ranges.some((r) => r.containsRange(range))) {
        decorationIdsToReplace.push(id);
        metadata.classNameRef.dispose();
        this._decorationsMetadata.delete(id);
      }
    }
    const scrollState = StableEditorScrollState.capture(this._editor);
    this._editor.changeDecorations((accessor) => {
      const newDecorationIds = accessor.deltaDecorations(decorationIdsToReplace, newDecorationsData.map((d) => d.decoration));
      for (let i = 0; i < newDecorationIds.length; i++) {
        const data = newDecorationsData[i];
        this._decorationsMetadata.set(newDecorationIds[i], data);
      }
    });
    scrollState.restore(this._editor);
  }
  _fillInColors(props, hint) {
    if (hint.kind === languages.InlayHintKind.Parameter) {
      props.backgroundColor = themeColorFromId(colors.editorInlayHintParameterBackground);
      props.color = themeColorFromId(colors.editorInlayHintParameterForeground);
    } else if (hint.kind === languages.InlayHintKind.Type) {
      props.backgroundColor = themeColorFromId(colors.editorInlayHintTypeBackground);
      props.color = themeColorFromId(colors.editorInlayHintTypeForeground);
    } else {
      props.backgroundColor = themeColorFromId(colors.editorInlayHintBackground);
      props.color = themeColorFromId(colors.editorInlayHintForeground);
    }
  }
  _getLayoutInfo() {
    const options = this._editor.getOption(EditorOption.inlayHints);
    const padding = options.padding;
    const editorFontSize = this._editor.getOption(EditorOption.fontSize);
    const editorFontFamily = this._editor.getOption(EditorOption.fontFamily);
    let fontSize = options.fontSize;
    if (!fontSize || fontSize < 5 || fontSize > editorFontSize) {
      fontSize = editorFontSize;
    }
    const fontFamily = options.fontFamily || editorFontFamily;
    const isUniform = !padding && fontFamily === editorFontFamily && fontSize === editorFontSize;
    return { fontSize, fontFamily, padding, isUniform };
  }
  _removeAllDecorations() {
    this._editor.removeDecorations(Array.from(this._decorationsMetadata.keys()));
    for (const obj of this._decorationsMetadata.values()) {
      obj.classNameRef.dispose();
    }
    this._decorationsMetadata.clear();
  }
  // --- accessibility
  getInlayHintsForLine(line) {
    if (!this._editor.hasModel()) {
      return [];
    }
    const set = /* @__PURE__ */ new Set();
    const result = [];
    for (const deco of this._editor.getLineDecorations(line)) {
      const data = this._decorationsMetadata.get(deco.id);
      if (data && !set.has(data.item.hint)) {
        set.add(data.item.hint);
        result.push(data.item);
      }
    }
    return result;
  }
};
InlayHintsController.ID = "editor.contrib.InlayHints";
InlayHintsController._MAX_DECORATORS = 1500;
InlayHintsController._whitespaceData = {};
InlayHintsController = __decorateClass([
  __decorateParam(1, ILanguageFeaturesService),
  __decorateParam(2, ILanguageFeatureDebounceService),
  __decorateParam(3, IInlayHintsCache),
  __decorateParam(4, ICommandService),
  __decorateParam(5, INotificationService),
  __decorateParam(6, IInstantiationService)
], InlayHintsController);
function fixSpace(str) {
  const noBreakWhitespace = "\xA0";
  return str.replace(/[ \t]/g, noBreakWhitespace);
}
CommandsRegistry.registerCommand("_executeInlayHintProvider", async (accessor, ...args) => {
  const [uri, range] = args;
  assertType(URI.isUri(uri));
  assertType(Range.isIRange(range));
  const { inlayHintsProvider } = accessor.get(ILanguageFeaturesService);
  const ref = await accessor.get(ITextModelService).createModelReference(uri);
  try {
    const model = await InlayHintsFragments.create(inlayHintsProvider, ref.object.textEditorModel, [Range.lift(range)], CancellationToken.None);
    const result = model.items.map((i) => i.hint);
    setTimeout(() => model.dispose(), 0);
    return result;
  } finally {
    ref.dispose();
  }
});
export {
  InlayHintsController,
  RenderedInlayHintLabelPart
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXGlubGF5SGludHNcXGJyb3dzZXJcXGlubGF5SGludHNDb250cm9sbGVyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgaXNIVE1MRWxlbWVudCwgTW9kaWZpZXJLZXlFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBpc05vbkVtcHR5QXJyYXkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgZGlzcG9zYWJsZVRpbWVvdXQsIFJ1bk9uY2VTY2hlZHVsZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiwgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgb25VbmV4cGVjdGVkRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSwgTXV0YWJsZURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBMUlVDYWNoZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcC5qcyc7XG5pbXBvcnQgeyBJUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yYW5nZS5qcyc7XG5pbXBvcnQgeyBhc3NlcnRUeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElBY3RpdmVDb2RlRWRpdG9yLCBJQ29kZUVkaXRvciwgSUVkaXRvck1vdXNlRXZlbnQsIE1vdXNlVGFyZ2V0VHlwZSB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBDbGFzc05hbWVSZWZlcmVuY2UsIENzc1Byb3BlcnRpZXMsIER5bmFtaWNDc3NSdWxlcyB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvZWRpdG9yRG9tLmpzJztcbmltcG9ydCB7IFN0YWJsZUVkaXRvclNjcm9sbFN0YXRlIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9zdGFibGVFZGl0b3JTY3JvbGwuanMnO1xuaW1wb3J0IHsgRWRpdG9yT3B0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbmZpZy9lZGl0b3JPcHRpb25zLmpzJztcbmltcG9ydCB7IEVESVRPUl9GT05UX0RFRkFVTFRTIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbmZpZy9mb250SW5mby5qcyc7XG5pbXBvcnQgeyBFZGl0T3BlcmF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvZWRpdE9wZXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IElFZGl0b3JDb250cmlidXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yQ29tbW9uLmpzJztcbmltcG9ydCAqIGFzIGxhbmd1YWdlcyBmcm9tICcuLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VzLmpzJztcbmltcG9ydCB7IElNb2RlbERlbHRhRGVjb3JhdGlvbiwgSW5qZWN0ZWRUZXh0Q3Vyc29yU3RvcHMsIEluamVjdGVkVGV4dE9wdGlvbnMsIElUZXh0TW9kZWwsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgTW9kZWxEZWNvcmF0aW9uSW5qZWN0ZWRUZXh0T3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC90ZXh0TW9kZWwuanMnO1xuaW1wb3J0IHsgSUZlYXR1cmVEZWJvdW5jZUluZm9ybWF0aW9uLCBJTGFuZ3VhZ2VGZWF0dXJlRGVib3VuY2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3NlcnZpY2VzL2xhbmd1YWdlRmVhdHVyZURlYm91bmNlLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9zZXJ2aWNlcy9sYW5ndWFnZUZlYXR1cmVzLmpzJztcbmltcG9ydCB7IElUZXh0TW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3NlcnZpY2VzL3Jlc29sdmVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDbGlja0xpbmtHZXN0dXJlLCBDbGlja0xpbmtNb3VzZUV2ZW50IH0gZnJvbSAnLi4vLi4vZ290b1N5bWJvbC9icm93c2VyL2xpbmsvY2xpY2tMaW5rR2VzdHVyZS5qcyc7XG5pbXBvcnQgeyBJbmxheUhpbnRBbmNob3IsIElubGF5SGludEl0ZW0sIElubGF5SGludHNGcmFnbWVudHMgfSBmcm9tICcuL2lubGF5SGludHMuanMnO1xuaW1wb3J0IHsgZ29Ub0RlZmluaXRpb25XaXRoTG9jYXRpb24sIHNob3dHb1RvQ29udGV4dE1lbnUgfSBmcm9tICcuL2lubGF5SGludHNMb2NhdGlvbnMuanMnO1xuaW1wb3J0IHsgQ29tbWFuZHNSZWdpc3RyeSwgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IEluc3RhbnRpYXRpb25UeXBlLCByZWdpc3RlclNpbmdsZXRvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgY3JlYXRlRGVjb3JhdG9yLCBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlLCBTZXZlcml0eSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCAqIGFzIGNvbG9ycyBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vY29sb3JSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyB0aGVtZUNvbG9yRnJvbUlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3Bvc2l0aW9uLmpzJztcblxuLy8gLS0tIGhpbnQgY2FjaGluZyBzZXJ2aWNlIChwZXIgc2Vzc2lvbilcblxuY2xhc3MgSW5sYXlIaW50c0NhY2hlIHtcblxuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9lbnRyaWVzID0gbmV3IExSVUNhY2hlPHN0cmluZywgSW5sYXlIaW50SXRlbVtdPig1MCk7XG5cblx0Z2V0KG1vZGVsOiBJVGV4dE1vZGVsKTogSW5sYXlIaW50SXRlbVtdIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBrZXkgPSBJbmxheUhpbnRzQ2FjaGUuX2tleShtb2RlbCk7XG5cdFx0cmV0dXJuIHRoaXMuX2VudHJpZXMuZ2V0KGtleSk7XG5cdH1cblxuXHRzZXQobW9kZWw6IElUZXh0TW9kZWwsIHZhbHVlOiBJbmxheUhpbnRJdGVtW10pOiB2b2lkIHtcblx0XHRjb25zdCBrZXkgPSBJbmxheUhpbnRzQ2FjaGUuX2tleShtb2RlbCk7XG5cdFx0dGhpcy5fZW50cmllcy5zZXQoa2V5LCB2YWx1ZSk7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfa2V5KG1vZGVsOiBJVGV4dE1vZGVsKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gYCR7bW9kZWwudXJpLnRvU3RyaW5nKCl9LyR7bW9kZWwuZ2V0VmVyc2lvbklkKCl9YDtcblx0fVxufVxuXG5pbnRlcmZhY2UgSUlubGF5SGludHNDYWNoZSBleHRlbmRzIElubGF5SGludHNDYWNoZSB7IH1cbmNvbnN0IElJbmxheUhpbnRzQ2FjaGUgPSBjcmVhdGVEZWNvcmF0b3I8SUlubGF5SGludHNDYWNoZT4oJ0lJbmxheUhpbnRzQ2FjaGUnKTtcbnJlZ2lzdGVyU2luZ2xldG9uKElJbmxheUhpbnRzQ2FjaGUsIElubGF5SGludHNDYWNoZSwgSW5zdGFudGlhdGlvblR5cGUuRGVsYXllZCk7XG5cbi8vIC0tLSByZW5kZXJlZCBsYWJlbFxuXG5leHBvcnQgY2xhc3MgUmVuZGVyZWRJbmxheUhpbnRMYWJlbFBhcnQge1xuXHRjb25zdHJ1Y3RvcihyZWFkb25seSBpdGVtOiBJbmxheUhpbnRJdGVtLCByZWFkb25seSBpbmRleDogbnVtYmVyKSB7IH1cblxuXHRnZXQgcGFydCgpIHtcblx0XHRjb25zdCBsYWJlbCA9IHRoaXMuaXRlbS5oaW50LmxhYmVsO1xuXHRcdGlmICh0eXBlb2YgbGFiZWwgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRyZXR1cm4geyBsYWJlbCB9O1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gbGFiZWxbdGhpcy5pbmRleF07XG5cdFx0fVxuXHR9XG59XG5cbmNsYXNzIEFjdGl2ZUlubGF5SGludEluZm8ge1xuXHRjb25zdHJ1Y3RvcihyZWFkb25seSBwYXJ0OiBSZW5kZXJlZElubGF5SGludExhYmVsUGFydCwgcmVhZG9ubHkgaGFzVHJpZ2dlck1vZGlmaWVyOiBib29sZWFuKSB7IH1cbn1cblxudHlwZSBJbmxheUhpbnREZWNvcmF0aW9uUmVuZGVySW5mbyA9IHtcblx0aXRlbTogSW5sYXlIaW50SXRlbTtcblx0ZGVjb3JhdGlvbjogSU1vZGVsRGVsdGFEZWNvcmF0aW9uO1xuXHRjbGFzc05hbWVSZWY6IENsYXNzTmFtZVJlZmVyZW5jZTtcbn07XG5cbmNvbnN0IGVudW0gUmVuZGVyTW9kZSB7XG5cdE5vcm1hbCxcblx0SW52aXNpYmxlXG59XG5cblxuXG4vKipcbiAqICBNaXggb2YgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UsIERpc3Bvc2FibGVTdG9yZSBhbmQgTXV0YWJsZURpc3Bvc2FibGVcbiAqL1xuY2xhc3MgQ2FuY2VsbGF0aW9uU3RvcmUgaW1wbGVtZW50cyBJRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfc3RvcmUgPSBuZXcgTXV0YWJsZURpc3Bvc2FibGU8RGlzcG9zYWJsZVN0b3JlPigpO1xuXHRwcml2YXRlIF90b2tlblNvdXJjZSA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXG5cdGRpc3Bvc2UoKSB7XG5cdFx0dGhpcy5fc3RvcmUuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX3Rva2VuU291cmNlLmRpc3Bvc2UodHJ1ZSk7XG5cdH1cblxuXHRyZXNldCgpIHtcblx0XHR0aGlzLl90b2tlblNvdXJjZS5kaXNwb3NlKHRydWUpO1xuXHRcdHRoaXMuX3Rva2VuU291cmNlID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCk7XG5cdFx0dGhpcy5fc3RvcmUudmFsdWUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0c3RvcmU6IHRoaXMuX3N0b3JlLnZhbHVlLFxuXHRcdFx0dG9rZW46IHRoaXMuX3Rva2VuU291cmNlLnRva2VuXG5cdFx0fTtcblx0fVxufVxuXG5cbi8vIC0tLSBjb250cm9sbGVyXG5cblxuZXhwb3J0IGNsYXNzIElubGF5SGludHNDb250cm9sbGVyIGltcGxlbWVudHMgSUVkaXRvckNvbnRyaWJ1dGlvbiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEOiBzdHJpbmcgPSAnZWRpdG9yLmNvbnRyaWIuSW5sYXlIaW50cyc7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgX01BWF9ERUNPUkFUT1JTID0gMTUwMDtcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgX3doaXRlc3BhY2VEYXRhID0ge307XG5cblx0c3RhdGljIGdldChlZGl0b3I6IElDb2RlRWRpdG9yKTogSW5sYXlIaW50c0NvbnRyb2xsZXIgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiBlZGl0b3IuZ2V0Q29udHJpYnV0aW9uPElubGF5SGludHNDb250cm9sbGVyPihJbmxheUhpbnRzQ29udHJvbGxlci5JRCkgPz8gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb25EaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0cHJpdmF0ZSByZWFkb25seSBfZGVjb3JhdGlvbnNNZXRhZGF0YSA9IG5ldyBNYXA8c3RyaW5nLCBJbmxheUhpbnREZWNvcmF0aW9uUmVuZGVySW5mbz4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfZGVib3VuY2VJbmZvOiBJRmVhdHVyZURlYm91bmNlSW5mb3JtYXRpb247XG5cdHByaXZhdGUgcmVhZG9ubHkgX3J1bGVGYWN0b3J5OiBEeW5hbWljQ3NzUnVsZXM7XG5cblx0cHJpdmF0ZSBfY3Vyc29ySW5mbz86IHsgcG9zaXRpb246IFBvc2l0aW9uOyBub3RFYXJsaWVyVGhhbjogbnVtYmVyIH07XG5cdHByaXZhdGUgX2FjdGl2ZVJlbmRlck1vZGUgPSBSZW5kZXJNb2RlLk5vcm1hbDtcblx0cHJpdmF0ZSBfYWN0aXZlSW5sYXlIaW50UGFydD86IEFjdGl2ZUlubGF5SGludEluZm87XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZWRpdG9yOiBJQ29kZUVkaXRvcixcblx0XHRASUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlOiBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UsXG5cdFx0QElMYW5ndWFnZUZlYXR1cmVEZWJvdW5jZVNlcnZpY2UgX2ZlYXR1cmVEZWJvdW5jZTogSUxhbmd1YWdlRmVhdHVyZURlYm91bmNlU2VydmljZSxcblx0XHRASUlubGF5SGludHNDYWNoZSBwcml2YXRlIHJlYWRvbmx5IF9pbmxheUhpbnRzQ2FjaGU6IElJbmxheUhpbnRzQ2FjaGUsXG5cdFx0QElDb21tYW5kU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJTm90aWZpY2F0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9ub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2luc3RhU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHR0aGlzLl9ydWxlRmFjdG9yeSA9IHRoaXMuX2Rpc3Bvc2FibGVzLmFkZChuZXcgRHluYW1pY0Nzc1J1bGVzKHRoaXMuX2VkaXRvcikpO1xuXHRcdHRoaXMuX2RlYm91bmNlSW5mbyA9IF9mZWF0dXJlRGVib3VuY2UuZm9yKF9sYW5ndWFnZUZlYXR1cmVzU2VydmljZS5pbmxheUhpbnRzUHJvdmlkZXIsICdJbmxheUhpbnQnLCB7IG1pbjogMjUgfSk7XG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuYWRkKF9sYW5ndWFnZUZlYXR1cmVzU2VydmljZS5pbmxheUhpbnRzUHJvdmlkZXIub25EaWRDaGFuZ2UoKCkgPT4gdGhpcy5fdXBkYXRlKCkpKTtcblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5hZGQoX2VkaXRvci5vbkRpZENoYW5nZU1vZGVsKCgpID0+IHRoaXMuX3VwZGF0ZSgpKSk7XG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuYWRkKF9lZGl0b3Iub25EaWRDaGFuZ2VNb2RlbExhbmd1YWdlKCgpID0+IHRoaXMuX3VwZGF0ZSgpKSk7XG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuYWRkKF9lZGl0b3Iub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0aWYgKGUuaGFzQ2hhbmdlZChFZGl0b3JPcHRpb24uaW5sYXlIaW50cykpIHtcblx0XHRcdFx0dGhpcy5fdXBkYXRlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3VwZGF0ZSgpO1xuXG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX3Nlc3Npb25EaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fcmVtb3ZlQWxsRGVjb3JhdGlvbnMoKTtcblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGUoKTogdm9pZCB7XG5cdFx0dGhpcy5fc2Vzc2lvbkRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0dGhpcy5fcmVtb3ZlQWxsRGVjb3JhdGlvbnMoKTtcblxuXHRcdGNvbnN0IG9wdGlvbnMgPSB0aGlzLl9lZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5pbmxheUhpbnRzKTtcblx0XHRpZiAob3B0aW9ucy5lbmFibGVkID09PSAnb2ZmJykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5fZWRpdG9yLmdldE1vZGVsKCk7XG5cdFx0aWYgKCFtb2RlbCB8fCAhdGhpcy5fbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuaW5sYXlIaW50c1Byb3ZpZGVyLmhhcyhtb2RlbCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAob3B0aW9ucy5lbmFibGVkID09PSAnb24nKSB7XG5cdFx0XHQvLyBkaWZmZXJlbnQgXCJvblwiIG1vZGVzOiBhbHdheXNcblx0XHRcdHRoaXMuX2FjdGl2ZVJlbmRlck1vZGUgPSBSZW5kZXJNb2RlLk5vcm1hbDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gZGlmZmVyZW50IFwib25cIiBtb2Rlczogb2ZmVW5sZXNzUHJlc3NlZCwgb3Igb25Vbmxlc3NQcmVzc2VkXG5cdFx0XHRsZXQgZGVmYXVsdE1vZGU6IFJlbmRlck1vZGU7XG5cdFx0XHRsZXQgYWx0TW9kZTogUmVuZGVyTW9kZTtcblx0XHRcdGlmIChvcHRpb25zLmVuYWJsZWQgPT09ICdvblVubGVzc1ByZXNzZWQnKSB7XG5cdFx0XHRcdGRlZmF1bHRNb2RlID0gUmVuZGVyTW9kZS5Ob3JtYWw7XG5cdFx0XHRcdGFsdE1vZGUgPSBSZW5kZXJNb2RlLkludmlzaWJsZTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGRlZmF1bHRNb2RlID0gUmVuZGVyTW9kZS5JbnZpc2libGU7XG5cdFx0XHRcdGFsdE1vZGUgPSBSZW5kZXJNb2RlLk5vcm1hbDtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2FjdGl2ZVJlbmRlck1vZGUgPSBkZWZhdWx0TW9kZTtcblxuXHRcdFx0dGhpcy5fc2Vzc2lvbkRpc3Bvc2FibGVzLmFkZChNb2RpZmllcktleUVtaXR0ZXIuZ2V0SW5zdGFuY2UoKS5ldmVudChlID0+IHtcblx0XHRcdFx0aWYgKCF0aGlzLl9lZGl0b3IuaGFzTW9kZWwoKSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBuZXdSZW5kZXJNb2RlID0gZS5hbHRLZXkgJiYgZS5jdHJsS2V5ICYmICEoZS5zaGlmdEtleSB8fCBlLm1ldGFLZXkpID8gYWx0TW9kZSA6IGRlZmF1bHRNb2RlO1xuXHRcdFx0XHRpZiAobmV3UmVuZGVyTW9kZSAhPT0gdGhpcy5fYWN0aXZlUmVuZGVyTW9kZSkge1xuXHRcdFx0XHRcdHRoaXMuX2FjdGl2ZVJlbmRlck1vZGUgPSBuZXdSZW5kZXJNb2RlO1xuXHRcdFx0XHRcdGNvbnN0IG1vZGVsID0gdGhpcy5fZWRpdG9yLmdldE1vZGVsKCk7XG5cdFx0XHRcdFx0Y29uc3QgY29waWVzID0gdGhpcy5fY29weUlubGF5SGludHNXaXRoQ3VycmVudEFuY2hvcihtb2RlbCk7XG5cdFx0XHRcdFx0dGhpcy5fdXBkYXRlSGludHNEZWNvcmF0b3JzKFttb2RlbC5nZXRGdWxsTW9kZWxSYW5nZSgpXSwgY29waWVzKTtcblx0XHRcdFx0XHRzY2hlZHVsZXIuc2NoZWR1bGUoMCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHQvLyBpZmYgcG9zc2libGUsIHF1aWNrbHkgdXBkYXRlIGZyb20gY2FjaGVcblx0XHRjb25zdCBjYWNoZWQgPSB0aGlzLl9pbmxheUhpbnRzQ2FjaGUuZ2V0KG1vZGVsKTtcblx0XHRpZiAoY2FjaGVkKSB7XG5cdFx0XHR0aGlzLl91cGRhdGVIaW50c0RlY29yYXRvcnMoW21vZGVsLmdldEZ1bGxNb2RlbFJhbmdlKCldLCBjYWNoZWQpO1xuXHRcdH1cblx0XHR0aGlzLl9zZXNzaW9uRGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHQvLyBjYWNoZSBpdGVtcyB3aGVuIHN3aXRjaGluZyBmaWxlcyBldGNcblx0XHRcdGlmICghbW9kZWwuaXNEaXNwb3NlZCgpKSB7XG5cdFx0XHRcdHRoaXMuX2NhY2hlSGludHNGb3JGYXN0UmVzdG9yZShtb2RlbCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0bGV0IGN0czogQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3Qgd2F0Y2hlZFByb3ZpZGVycyA9IG5ldyBTZXQ8bGFuZ3VhZ2VzLklubGF5SGludHNQcm92aWRlcj4oKTtcblxuXHRcdHRoaXMuX3Nlc3Npb25EaXNwb3NhYmxlcy5hZGQobW9kZWwub25XaWxsRGlzcG9zZSgoKSA9PiBjdHM/LmNhbmNlbCgpKSk7XG5cblx0XHRjb25zdCBjYW5jZWxsYXRpb25TdG9yZSA9IHRoaXMuX3Nlc3Npb25EaXNwb3NhYmxlcy5hZGQobmV3IENhbmNlbGxhdGlvblN0b3JlKCkpO1xuXG5cdFx0Y29uc3Qgc2NoZWR1bGVyID0gbmV3IFJ1bk9uY2VTY2hlZHVsZXIoYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdDEgPSBEYXRlLm5vdygpO1xuXG5cdFx0XHRjb25zdCB7IHN0b3JlLCB0b2tlbiB9ID0gY2FuY2VsbGF0aW9uU3RvcmUucmVzZXQoKTtcblxuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgaW5sYXlIaW50cyA9IGF3YWl0IElubGF5SGludHNGcmFnbWVudHMuY3JlYXRlKHRoaXMuX2xhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmlubGF5SGludHNQcm92aWRlciwgbW9kZWwsIHRoaXMuX2dldEhpbnRzUmFuZ2VzKCksIHRva2VuKTtcblx0XHRcdFx0c2NoZWR1bGVyLmRlbGF5ID0gdGhpcy5fZGVib3VuY2VJbmZvLnVwZGF0ZShtb2RlbCwgRGF0ZS5ub3coKSAtIHQxKTtcblx0XHRcdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdFx0aW5sYXlIaW50cy5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gbGlzdGVuIHRvIHByb3ZpZGVyIGNoYW5nZXNcblx0XHRcdFx0Zm9yIChjb25zdCBwcm92aWRlciBvZiBpbmxheUhpbnRzLnByb3ZpZGVyKSB7XG5cdFx0XHRcdFx0aWYgKHR5cGVvZiBwcm92aWRlci5vbkRpZENoYW5nZUlubGF5SGludHMgPT09ICdmdW5jdGlvbicgJiYgIXdhdGNoZWRQcm92aWRlcnMuaGFzKHByb3ZpZGVyKSkge1xuXHRcdFx0XHRcdFx0d2F0Y2hlZFByb3ZpZGVycy5hZGQocHJvdmlkZXIpO1xuXHRcdFx0XHRcdFx0c3RvcmUuYWRkKHByb3ZpZGVyLm9uRGlkQ2hhbmdlSW5sYXlIaW50cygoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdGlmICghc2NoZWR1bGVyLmlzU2NoZWR1bGVkKCkpIHsgLy8gaWdub3JlIGV2ZW50IHdoZW4gcmVxdWVzdCBpcyBhbHJlYWR5IHNjaGVkdWxlZFxuXHRcdFx0XHRcdFx0XHRcdHNjaGVkdWxlci5zY2hlZHVsZSgpO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9KSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0c3RvcmUuYWRkKGlubGF5SGludHMpO1xuXHRcdFx0XHRzdG9yZS5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHdhdGNoZWRQcm92aWRlcnMuY2xlYXIoKSkpO1xuXHRcdFx0XHR0aGlzLl91cGRhdGVIaW50c0RlY29yYXRvcnMoaW5sYXlIaW50cy5yYW5nZXMsIGlubGF5SGludHMuaXRlbXMpO1xuXHRcdFx0XHR0aGlzLl9jYWNoZUhpbnRzRm9yRmFzdFJlc3RvcmUobW9kZWwpO1xuXG5cdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0b25VbmV4cGVjdGVkRXJyb3IoZXJyKTtcblx0XHRcdH1cblx0XHR9LCB0aGlzLl9kZWJvdW5jZUluZm8uZ2V0KG1vZGVsKSk7XG5cblx0XHR0aGlzLl9zZXNzaW9uRGlzcG9zYWJsZXMuYWRkKHNjaGVkdWxlcik7XG5cdFx0c2NoZWR1bGVyLnNjaGVkdWxlKDApO1xuXG5cdFx0dGhpcy5fc2Vzc2lvbkRpc3Bvc2FibGVzLmFkZCh0aGlzLl9lZGl0b3Iub25EaWRTY3JvbGxDaGFuZ2UoKGUpID0+IHtcblx0XHRcdC8vIHVwZGF0ZSB3aGVuIHNjcm9sbCBwb3NpdGlvbiBjaGFuZ2VzXG5cdFx0XHQvLyB1c2VzIHNjcm9sbFRvcENoYW5nZWQgaGFzIHdlYWsgaGV1cmlzdGljIHRvIGRpZmZlcmVuYXRpYXRlIGJldHdlZW4gc2Nyb2xsaW5nIGR1ZSB0b1xuXHRcdFx0Ly8gdHlwaW5nIG9yIGR1ZSB0byBcImFjdHVhbFwiIHNjcm9sbGluZ1xuXHRcdFx0aWYgKGUuc2Nyb2xsVG9wQ2hhbmdlZCB8fCAhc2NoZWR1bGVyLmlzU2NoZWR1bGVkKCkpIHtcblx0XHRcdFx0c2NoZWR1bGVyLnNjaGVkdWxlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgY3Vyc29yID0gdGhpcy5fc2Vzc2lvbkRpc3Bvc2FibGVzLmFkZChuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cdFx0dGhpcy5fc2Vzc2lvbkRpc3Bvc2FibGVzLmFkZCh0aGlzLl9lZGl0b3Iub25EaWRDaGFuZ2VNb2RlbENvbnRlbnQoKGUpID0+IHtcblx0XHRcdGN0cz8uY2FuY2VsKCk7XG5cblx0XHRcdC8vIG1hcmsgY3VycmVudCBjdXJzb3IgcG9zaXRpb24gYW5kIHRpbWUgYWZ0ZXIgd2hpY2ggdGhlIHdob2xlIGNhbiBiZSB1cGRhdGVkL3JlZHJhd25cblx0XHRcdGNvbnN0IGRlbGF5ID0gTWF0aC5tYXgoc2NoZWR1bGVyLmRlbGF5LCA4MDApO1xuXHRcdFx0dGhpcy5fY3Vyc29ySW5mbyA9IHsgcG9zaXRpb246IHRoaXMuX2VkaXRvci5nZXRQb3NpdGlvbigpISwgbm90RWFybGllclRoYW46IERhdGUubm93KCkgKyBkZWxheSB9O1xuXHRcdFx0Y3Vyc29yLnZhbHVlID0gZGlzcG9zYWJsZVRpbWVvdXQoKCkgPT4gc2NoZWR1bGVyLnNjaGVkdWxlKDApLCBkZWxheSk7XG5cblx0XHRcdHNjaGVkdWxlci5zY2hlZHVsZSgpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3Nlc3Npb25EaXNwb3NhYmxlcy5hZGQodGhpcy5fZWRpdG9yLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHtcblx0XHRcdGlmIChlLmhhc0NoYW5nZWQoRWRpdG9yT3B0aW9uLmlubGF5SGludHMpKSB7XG5cdFx0XHRcdHNjaGVkdWxlci5zY2hlZHVsZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIG1vdXNlIGdlc3R1cmVzXG5cdFx0dGhpcy5fc2Vzc2lvbkRpc3Bvc2FibGVzLmFkZCh0aGlzLl9pbnN0YWxsRGJsQ2xpY2tHZXN0dXJlKCgpID0+IHNjaGVkdWxlci5zY2hlZHVsZSgwKSkpO1xuXHRcdHRoaXMuX3Nlc3Npb25EaXNwb3NhYmxlcy5hZGQodGhpcy5faW5zdGFsbExpbmtHZXN0dXJlKCkpO1xuXHRcdHRoaXMuX3Nlc3Npb25EaXNwb3NhYmxlcy5hZGQodGhpcy5faW5zdGFsbENvbnRleHRNZW51KCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfaW5zdGFsbExpbmtHZXN0dXJlKCk6IElEaXNwb3NhYmxlIHtcblxuXHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IGdlc3R1cmUgPSBzdG9yZS5hZGQobmV3IENsaWNrTGlua0dlc3R1cmUodGhpcy5fZWRpdG9yKSk7XG5cblx0XHQvLyBsZXQgcmVtb3ZlSGlnaGxpZ2h0ID0gKCkgPT4geyB9O1xuXG5cdFx0Y29uc3Qgc2Vzc2lvblN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdHN0b3JlLmFkZChzZXNzaW9uU3RvcmUpO1xuXG5cdFx0c3RvcmUuYWRkKGdlc3R1cmUub25Nb3VzZU1vdmVPclJlbGV2YW50S2V5RG93bihlID0+IHtcblx0XHRcdGNvbnN0IFttb3VzZUV2ZW50XSA9IGU7XG5cdFx0XHRjb25zdCBsYWJlbFBhcnQgPSB0aGlzLl9nZXRJbmxheUhpbnRMYWJlbFBhcnQobW91c2VFdmVudCk7XG5cdFx0XHRjb25zdCBtb2RlbCA9IHRoaXMuX2VkaXRvci5nZXRNb2RlbCgpO1xuXG5cdFx0XHRpZiAoIWxhYmVsUGFydCB8fCAhbW9kZWwpIHtcblx0XHRcdFx0c2Vzc2lvblN0b3JlLmNsZWFyKCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Ly8gcmVzb2x2ZSB0aGUgaXRlbVxuXHRcdFx0Y29uc3QgY3RzID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCk7XG5cdFx0XHRzZXNzaW9uU3RvcmUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBjdHMuZGlzcG9zZSh0cnVlKSkpO1xuXHRcdFx0bGFiZWxQYXJ0Lml0ZW0ucmVzb2x2ZShjdHMudG9rZW4pO1xuXG5cdFx0XHQvLyByZW5kZXIgbGluayA9PiB3aGVuIHRoZSBtb2RpZmllciBpcyBwcmVzc2VkIGFuZCB3aGVuIHRoZXJlIGlzIGEgY29tbWFuZCBvciBsb2NhdGlvblxuXHRcdFx0dGhpcy5fYWN0aXZlSW5sYXlIaW50UGFydCA9IGxhYmVsUGFydC5wYXJ0LmNvbW1hbmQgfHwgbGFiZWxQYXJ0LnBhcnQubG9jYXRpb25cblx0XHRcdFx0PyBuZXcgQWN0aXZlSW5sYXlIaW50SW5mbyhsYWJlbFBhcnQsIG1vdXNlRXZlbnQuaGFzVHJpZ2dlck1vZGlmaWVyKVxuXHRcdFx0XHQ6IHVuZGVmaW5lZDtcblxuXHRcdFx0Y29uc3QgbGluZU51bWJlciA9IG1vZGVsLnZhbGlkYXRlUG9zaXRpb24obGFiZWxQYXJ0Lml0ZW0uaGludC5wb3NpdGlvbikubGluZU51bWJlcjtcblx0XHRcdGNvbnN0IHJhbmdlID0gbmV3IFJhbmdlKGxpbmVOdW1iZXIsIDEsIGxpbmVOdW1iZXIsIG1vZGVsLmdldExpbmVNYXhDb2x1bW4obGluZU51bWJlcikpO1xuXHRcdFx0Y29uc3QgbGluZUhpbnRzID0gdGhpcy5fZ2V0SW5saW5lSGludHNGb3JSYW5nZShyYW5nZSk7XG5cdFx0XHR0aGlzLl91cGRhdGVIaW50c0RlY29yYXRvcnMoW3JhbmdlXSwgbGluZUhpbnRzKTtcblx0XHRcdHNlc3Npb25TdG9yZS5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdFx0dGhpcy5fYWN0aXZlSW5sYXlIaW50UGFydCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0dGhpcy5fdXBkYXRlSGludHNEZWNvcmF0b3JzKFtyYW5nZV0sIGxpbmVIaW50cyk7XG5cdFx0XHR9KSk7XG5cdFx0fSkpO1xuXHRcdHN0b3JlLmFkZChnZXN0dXJlLm9uQ2FuY2VsKCgpID0+IHNlc3Npb25TdG9yZS5jbGVhcigpKSk7XG5cdFx0c3RvcmUuYWRkKGdlc3R1cmUub25FeGVjdXRlKGFzeW5jIGUgPT4ge1xuXHRcdFx0Y29uc3QgbGFiZWwgPSB0aGlzLl9nZXRJbmxheUhpbnRMYWJlbFBhcnQoZSk7XG5cdFx0XHRpZiAobGFiZWwpIHtcblx0XHRcdFx0Y29uc3QgcGFydCA9IGxhYmVsLnBhcnQ7XG5cdFx0XHRcdGlmIChwYXJ0LmxvY2F0aW9uKSB7XG5cdFx0XHRcdFx0Ly8gbG9jYXRpb24gLT4gZXhlY3V0ZSBnbyB0byBkZWZcblx0XHRcdFx0XHR0aGlzLl9pbnN0YVNlcnZpY2UuaW52b2tlRnVuY3Rpb24oZ29Ub0RlZmluaXRpb25XaXRoTG9jYXRpb24sIGUsIHRoaXMuX2VkaXRvciBhcyBJQWN0aXZlQ29kZUVkaXRvciwgcGFydC5sb2NhdGlvbik7XG5cdFx0XHRcdH0gZWxzZSBpZiAobGFuZ3VhZ2VzLkNvbW1hbmQuaXMocGFydC5jb21tYW5kKSkge1xuXHRcdFx0XHRcdC8vIGNvbW1hbmQgLT4gZXhlY3V0ZSBpdFxuXHRcdFx0XHRcdGF3YWl0IHRoaXMuX2ludm9rZUNvbW1hbmQocGFydC5jb21tYW5kLCBsYWJlbC5pdGVtKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHRyZXR1cm4gc3RvcmU7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRJbmxpbmVIaW50c0ZvclJhbmdlKHJhbmdlOiBSYW5nZSkge1xuXHRcdGNvbnN0IGxpbmVIaW50cyA9IG5ldyBTZXQ8SW5sYXlIaW50SXRlbT4oKTtcblx0XHRmb3IgKGNvbnN0IGRhdGEgb2YgdGhpcy5fZGVjb3JhdGlvbnNNZXRhZGF0YS52YWx1ZXMoKSkge1xuXHRcdFx0aWYgKHJhbmdlLmNvbnRhaW5zUmFuZ2UoZGF0YS5pdGVtLmFuY2hvci5yYW5nZSkpIHtcblx0XHRcdFx0bGluZUhpbnRzLmFkZChkYXRhLml0ZW0pO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gQXJyYXkuZnJvbShsaW5lSGludHMpO1xuXHR9XG5cblx0cHJpdmF0ZSBfaW5zdGFsbERibENsaWNrR2VzdHVyZSh1cGRhdGVJbmxheUhpbnRzOiBGdW5jdGlvbik6IElEaXNwb3NhYmxlIHtcblx0XHRyZXR1cm4gdGhpcy5fZWRpdG9yLm9uTW91c2VVcChhc3luYyBlID0+IHtcblx0XHRcdGlmIChlLmV2ZW50LmRldGFpbCAhPT0gMikge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBwYXJ0ID0gdGhpcy5fZ2V0SW5sYXlIaW50TGFiZWxQYXJ0KGUpO1xuXHRcdFx0aWYgKCFwYXJ0KSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGUuZXZlbnQucHJldmVudERlZmF1bHQoKTtcblx0XHRcdGF3YWl0IHBhcnQuaXRlbS5yZXNvbHZlKENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0aWYgKGlzTm9uRW1wdHlBcnJheShwYXJ0Lml0ZW0uaGludC50ZXh0RWRpdHMpKSB7XG5cdFx0XHRcdGNvbnN0IGVkaXRzID0gcGFydC5pdGVtLmhpbnQudGV4dEVkaXRzLm1hcChlZGl0ID0+IEVkaXRPcGVyYXRpb24ucmVwbGFjZShSYW5nZS5saWZ0KGVkaXQucmFuZ2UpLCBlZGl0LnRleHQpKTtcblx0XHRcdFx0dGhpcy5fZWRpdG9yLmV4ZWN1dGVFZGl0cygnaW5sYXlIaW50LmRlZmF1bHQnLCBlZGl0cyk7XG5cdFx0XHRcdHVwZGF0ZUlubGF5SGludHMoKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX2luc3RhbGxDb250ZXh0TWVudSgpOiBJRGlzcG9zYWJsZSB7XG5cdFx0cmV0dXJuIHRoaXMuX2VkaXRvci5vbkNvbnRleHRNZW51KGFzeW5jIGUgPT4ge1xuXHRcdFx0aWYgKCEoaXNIVE1MRWxlbWVudChlLmV2ZW50LnRhcmdldCkpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHBhcnQgPSB0aGlzLl9nZXRJbmxheUhpbnRMYWJlbFBhcnQoZSk7XG5cdFx0XHRpZiAocGFydCkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLl9pbnN0YVNlcnZpY2UuaW52b2tlRnVuY3Rpb24oc2hvd0dvVG9Db250ZXh0TWVudSwgdGhpcy5fZWRpdG9yLCBlLmV2ZW50LnRhcmdldCwgcGFydCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRJbmxheUhpbnRMYWJlbFBhcnQoZTogSUVkaXRvck1vdXNlRXZlbnQgfCBDbGlja0xpbmtNb3VzZUV2ZW50KTogUmVuZGVyZWRJbmxheUhpbnRMYWJlbFBhcnQgfCB1bmRlZmluZWQge1xuXHRcdGlmIChlLnRhcmdldC50eXBlICE9PSBNb3VzZVRhcmdldFR5cGUuQ09OVEVOVF9URVhUKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBvcHRpb25zID0gZS50YXJnZXQuZGV0YWlsLmluamVjdGVkVGV4dD8ub3B0aW9ucztcblx0XHRpZiAob3B0aW9ucyBpbnN0YW5jZW9mIE1vZGVsRGVjb3JhdGlvbkluamVjdGVkVGV4dE9wdGlvbnMgJiYgb3B0aW9ucz8uYXR0YWNoZWREYXRhIGluc3RhbmNlb2YgUmVuZGVyZWRJbmxheUhpbnRMYWJlbFBhcnQpIHtcblx0XHRcdHJldHVybiBvcHRpb25zLmF0dGFjaGVkRGF0YTtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2ludm9rZUNvbW1hbmQoY29tbWFuZDogbGFuZ3VhZ2VzLkNvbW1hbmQsIGl0ZW06IElubGF5SGludEl0ZW0pIHtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgdGhpcy5fY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoY29tbWFuZC5pZCwgLi4uKGNvbW1hbmQuYXJndW1lbnRzID8/IFtdKSk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLl9ub3RpZmljYXRpb25TZXJ2aWNlLm5vdGlmeSh7XG5cdFx0XHRcdHNldmVyaXR5OiBTZXZlcml0eS5FcnJvcixcblx0XHRcdFx0c291cmNlOiBpdGVtLnByb3ZpZGVyLmRpc3BsYXlOYW1lLFxuXHRcdFx0XHRtZXNzYWdlOiBlcnJcblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2NhY2hlSGludHNGb3JGYXN0UmVzdG9yZShtb2RlbDogSVRleHRNb2RlbCk6IHZvaWQge1xuXHRcdGNvbnN0IGhpbnRzID0gdGhpcy5fY29weUlubGF5SGludHNXaXRoQ3VycmVudEFuY2hvcihtb2RlbCk7XG5cdFx0dGhpcy5faW5sYXlIaW50c0NhY2hlLnNldChtb2RlbCwgaGludHMpO1xuXHR9XG5cblx0Ly8gcmV0dXJuIGlubGF5IGhpbnRzIGJ1dCB3aXRoIGFuIGFuY2hvciB0aGF0IHJlZmxlY3RzIFwidXBkYXRlc1wiXG5cdC8vIHRoYXQgaGFwcGVuZWQgYWZ0ZXIgcmVjZWl2aW5nIHRoZW0sIGUuZyBhZGRpbmcgbmV3IGxpbmVzIGJlZm9yZSBhIGhpbnRcblx0cHJpdmF0ZSBfY29weUlubGF5SGludHNXaXRoQ3VycmVudEFuY2hvcihtb2RlbDogSVRleHRNb2RlbCk6IElubGF5SGludEl0ZW1bXSB7XG5cdFx0Y29uc3QgaXRlbXMgPSBuZXcgTWFwPElubGF5SGludEl0ZW0sIElubGF5SGludEl0ZW0+KCk7XG5cdFx0Zm9yIChjb25zdCBbaWQsIG9ial0gb2YgdGhpcy5fZGVjb3JhdGlvbnNNZXRhZGF0YSkge1xuXHRcdFx0aWYgKGl0ZW1zLmhhcyhvYmouaXRlbSkpIHtcblx0XHRcdFx0Ly8gYW4gaW5sYXkgaXRlbSBjYW4gYmUgcmVuZGVyZWQgYXMgbXVsdGlwbGUgZGVjb3JhdGlvbnNcblx0XHRcdFx0Ly8gYnV0IHRoZXkgd2lsbCBhbGwgdXNlcyB0aGUgc2FtZSByYW5nZVxuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHJhbmdlID0gbW9kZWwuZ2V0RGVjb3JhdGlvblJhbmdlKGlkKTtcblx0XHRcdGlmIChyYW5nZSkge1xuXHRcdFx0XHQvLyB1cGRhdGUgcmFuZ2Ugd2l0aCB3aGF0ZXZlciB0aGUgZWRpdG9yIGhhcyB0d2Vha2VkIGl0IHRvXG5cdFx0XHRcdGNvbnN0IGFuY2hvciA9IG5ldyBJbmxheUhpbnRBbmNob3IocmFuZ2UsIG9iai5pdGVtLmFuY2hvci5kaXJlY3Rpb24pO1xuXHRcdFx0XHRjb25zdCBjb3B5ID0gb2JqLml0ZW0ud2l0aCh7IGFuY2hvciB9KTtcblx0XHRcdFx0aXRlbXMuc2V0KG9iai5pdGVtLCBjb3B5KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIEFycmF5LmZyb20oaXRlbXMudmFsdWVzKCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0SGludHNSYW5nZXMoKTogUmFuZ2VbXSB7XG5cdFx0Y29uc3QgZXh0cmEgPSAzMDtcblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuX2VkaXRvci5nZXRNb2RlbCgpITtcblx0XHRjb25zdCB2aXNpYmxlUmFuZ2VzID0gdGhpcy5fZWRpdG9yLmdldFZpc2libGVSYW5nZXNQbHVzVmlld3BvcnRBYm92ZUJlbG93KCk7XG5cdFx0Y29uc3QgcmVzdWx0OiBSYW5nZVtdID0gW107XG5cdFx0Zm9yIChjb25zdCByYW5nZSBvZiB2aXNpYmxlUmFuZ2VzLnNvcnQoUmFuZ2UuY29tcGFyZVJhbmdlc1VzaW5nU3RhcnRzKSkge1xuXHRcdFx0Y29uc3QgZXh0ZW5kZWRSYW5nZSA9IG1vZGVsLnZhbGlkYXRlUmFuZ2UobmV3IFJhbmdlKHJhbmdlLnN0YXJ0TGluZU51bWJlciAtIGV4dHJhLCByYW5nZS5zdGFydENvbHVtbiwgcmFuZ2UuZW5kTGluZU51bWJlciArIGV4dHJhLCByYW5nZS5lbmRDb2x1bW4pKTtcblx0XHRcdGlmIChyZXN1bHQubGVuZ3RoID09PSAwIHx8ICFSYW5nZS5hcmVJbnRlcnNlY3RpbmdPclRvdWNoaW5nKHJlc3VsdFtyZXN1bHQubGVuZ3RoIC0gMV0sIGV4dGVuZGVkUmFuZ2UpKSB7XG5cdFx0XHRcdHJlc3VsdC5wdXNoKGV4dGVuZGVkUmFuZ2UpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmVzdWx0W3Jlc3VsdC5sZW5ndGggLSAxXSA9IFJhbmdlLnBsdXNSYW5nZShyZXN1bHRbcmVzdWx0Lmxlbmd0aCAtIDFdLCBleHRlbmRlZFJhbmdlKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZUhpbnRzRGVjb3JhdG9ycyhyYW5nZXM6IHJlYWRvbmx5IFJhbmdlW10sIGl0ZW1zOiByZWFkb25seSBJbmxheUhpbnRJdGVtW10pOiB2b2lkIHtcblxuXHRcdGNvbnN0IGl0ZW1GaXhlZExlbmd0aHMgPSBuZXcgTWFwPElubGF5SGludEl0ZW0sIG51bWJlcj4oKTtcblxuXHRcdGlmICh0aGlzLl9jdXJzb3JJbmZvXG5cdFx0XHQmJiB0aGlzLl9jdXJzb3JJbmZvLm5vdEVhcmxpZXJUaGFuID4gRGF0ZS5ub3coKVxuXHRcdFx0JiYgcmFuZ2VzLnNvbWUocmFuZ2UgPT4gcmFuZ2UuY29udGFpbnNQb3NpdGlvbih0aGlzLl9jdXJzb3JJbmZvIS5wb3NpdGlvbikpXG5cdFx0KSB7XG5cdFx0XHQvLyBjb2xsZWN0IGlubGF5IGhpbnRzIHRoYXQgYXJlIG9uIHRoZSBzYW1lIGxpbmUgYW5kIGJlZm9yZSB0aGUgY3Vyc29yLiBUaG9zZSBcIm9sZFwiIGhpbnRzXG5cdFx0XHQvLyBkZWZpbmUgZml4ZWQgbGVuZ3RocyBzbyB0aGF0IHRoZSBjdXJzb3IgZG9lcyBub3QganVtcCBiYWNrIGFuZCB3b3J0aCB3aGlsZSB0eXBpbmcuXG5cdFx0XHRjb25zdCB7IHBvc2l0aW9uIH0gPSB0aGlzLl9jdXJzb3JJbmZvO1xuXHRcdFx0dGhpcy5fY3Vyc29ySW5mbyA9IHVuZGVmaW5lZDtcblxuXHRcdFx0Y29uc3QgbGVuZ3RocyA9IG5ldyBNYXA8SW5sYXlIaW50SXRlbSwgbnVtYmVyPigpO1xuXG5cdFx0XHRmb3IgKGNvbnN0IGRlY28gb2YgdGhpcy5fZWRpdG9yLmdldExpbmVEZWNvcmF0aW9ucyhwb3NpdGlvbi5saW5lTnVtYmVyKSA/PyBbXSkge1xuXG5cdFx0XHRcdGNvbnN0IGRhdGEgPSB0aGlzLl9kZWNvcmF0aW9uc01ldGFkYXRhLmdldChkZWNvLmlkKTtcblx0XHRcdFx0aWYgKGRlY28ucmFuZ2Uuc3RhcnRDb2x1bW4gPiBwb3NpdGlvbi5jb2x1bW4pIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBvcHRzID0gZGF0YT8uZGVjb3JhdGlvbi5vcHRpb25zW2RhdGEuaXRlbS5hbmNob3IuZGlyZWN0aW9uXTtcblx0XHRcdFx0aWYgKG9wdHMgJiYgb3B0cy5hdHRhY2hlZERhdGEgIT09IElubGF5SGludHNDb250cm9sbGVyLl93aGl0ZXNwYWNlRGF0YSkge1xuXHRcdFx0XHRcdGNvbnN0IGxlbiA9IGxlbmd0aHMuZ2V0KGRhdGEuaXRlbSkgPz8gMDtcblx0XHRcdFx0XHRsZW5ndGhzLnNldChkYXRhLml0ZW0sIGxlbiArIG9wdHMuY29udGVudC5sZW5ndGgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblxuXHRcdFx0Ly8gb24gdGhlIGN1cnNvciBsaW5lIGFuZCBiZWZvcmUgdGhlIGN1cnNvci1jb2x1bW5cblx0XHRcdGNvbnN0IG5ld0l0ZW1zV2l0aEZpeGVkTGVuZ3RoID0gaXRlbXMuZmlsdGVyKGl0ZW0gPT4gaXRlbS5hbmNob3IucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyID09PSBwb3NpdGlvbi5saW5lTnVtYmVyICYmIGl0ZW0uYW5jaG9yLnJhbmdlLmVuZENvbHVtbiA8PSBwb3NpdGlvbi5jb2x1bW4pO1xuXHRcdFx0Y29uc3QgZml4ZWRMZW5ndGhzID0gQXJyYXkuZnJvbShsZW5ndGhzLnZhbHVlcygpKTtcblxuXHRcdFx0Ly8gbWF0Y2ggdXAgZml4ZWQgbGVuZ3RocyB3aXRoIGl0ZW1zIGFuZCBkaXN0cmlidXRlIHRoZSByZW1haW5pbmcgbGVuZ3RocyB0byB0aGUgbGFzdCBpdGVtXG5cdFx0XHRsZXQgbGFzdEl0ZW06IElubGF5SGludEl0ZW0gfCB1bmRlZmluZWQ7XG5cdFx0XHR3aGlsZSAodHJ1ZSkge1xuXHRcdFx0XHRjb25zdCB0YXJnZXRJdGVtID0gbmV3SXRlbXNXaXRoRml4ZWRMZW5ndGguc2hpZnQoKTtcblx0XHRcdFx0Y29uc3QgZml4ZWRMZW5ndGggPSBmaXhlZExlbmd0aHMuc2hpZnQoKTtcblxuXHRcdFx0XHRpZiAoIWZpeGVkTGVuZ3RoICYmICF0YXJnZXRJdGVtKSB7XG5cdFx0XHRcdFx0YnJlYWs7IC8vIERPTkVcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmICh0YXJnZXRJdGVtKSB7XG5cdFx0XHRcdFx0aXRlbUZpeGVkTGVuZ3Rocy5zZXQodGFyZ2V0SXRlbSwgZml4ZWRMZW5ndGggPz8gMCk7XG5cdFx0XHRcdFx0bGFzdEl0ZW0gPSB0YXJnZXRJdGVtO1xuXG5cdFx0XHRcdH0gZWxzZSBpZiAobGFzdEl0ZW0gJiYgZml4ZWRMZW5ndGgpIHtcblx0XHRcdFx0XHQvLyBzdGlsbCBsZW5ndGhzIGJ1dCBubyBtb3JlIGl0ZW0uIGdpdmUgaXQgYWxsIHRvIHRoZSBsYXN0XG5cdFx0XHRcdFx0bGV0IGxlbiA9IGl0ZW1GaXhlZExlbmd0aHMuZ2V0KGxhc3RJdGVtKSE7XG5cdFx0XHRcdFx0bGVuICs9IGZpeGVkTGVuZ3RoO1xuXHRcdFx0XHRcdGxlbiArPSBmaXhlZExlbmd0aHMucmVkdWNlKChwLCBjKSA9PiBwICsgYywgMCk7XG5cdFx0XHRcdFx0Zml4ZWRMZW5ndGhzLmxlbmd0aCA9IDA7XG5cdFx0XHRcdFx0YnJlYWs7IC8vIERPTkVcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIHV0aWxzIHRvIGNvbGxlY3QvY3JlYXRlIGluamVjdGVkIHRleHQgZGVjb3JhdGlvbnNcblx0XHRjb25zdCBuZXdEZWNvcmF0aW9uc0RhdGE6IElubGF5SGludERlY29yYXRpb25SZW5kZXJJbmZvW10gPSBbXTtcblx0XHRjb25zdCBhZGRJbmplY3RlZFRleHQgPSAoaXRlbTogSW5sYXlIaW50SXRlbSwgcmVmOiBDbGFzc05hbWVSZWZlcmVuY2UsIGNvbnRlbnQ6IHN0cmluZywgY3Vyc29yU3RvcHM6IEluamVjdGVkVGV4dEN1cnNvclN0b3BzLCBhdHRhY2hlZERhdGE/OiBSZW5kZXJlZElubGF5SGludExhYmVsUGFydCB8IG9iamVjdCk6IHZvaWQgPT4ge1xuXHRcdFx0Y29uc3Qgb3B0czogSW5qZWN0ZWRUZXh0T3B0aW9ucyA9IHtcblx0XHRcdFx0Y29udGVudCxcblx0XHRcdFx0aW5saW5lQ2xhc3NOYW1lQWZmZWN0c0xldHRlclNwYWNpbmc6IHRydWUsXG5cdFx0XHRcdGlubGluZUNsYXNzTmFtZTogcmVmLmNsYXNzTmFtZSxcblx0XHRcdFx0Y3Vyc29yU3RvcHMsXG5cdFx0XHRcdGF0dGFjaGVkRGF0YVxuXHRcdFx0fTtcblx0XHRcdG5ld0RlY29yYXRpb25zRGF0YS5wdXNoKHtcblx0XHRcdFx0aXRlbSxcblx0XHRcdFx0Y2xhc3NOYW1lUmVmOiByZWYsXG5cdFx0XHRcdGRlY29yYXRpb246IHtcblx0XHRcdFx0XHRyYW5nZTogaXRlbS5hbmNob3IucmFuZ2UsXG5cdFx0XHRcdFx0b3B0aW9uczoge1xuXHRcdFx0XHRcdFx0Ly8gY2xhc3NOYW1lOiBcInJhbmdlSGlnaGxpZ2h0XCIsIC8vIERFQlVHIGhpZ2hsaWdodCB0byBzZWUgdG8gd2hhdCByYW5nZSBhIGhpbnQgaXMgYXR0YWNoZWRcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnSW5sYXlIaW50Jyxcblx0XHRcdFx0XHRcdHNob3dJZkNvbGxhcHNlZDogaXRlbS5hbmNob3IucmFuZ2UuaXNFbXB0eSgpLCAvLyBcIm9yaWdpbmFsXCIgcmFuZ2UgaXMgZW1wdHlcblx0XHRcdFx0XHRcdGNvbGxhcHNlT25SZXBsYWNlRWRpdDogIWl0ZW0uYW5jaG9yLnJhbmdlLmlzRW1wdHkoKSxcblx0XHRcdFx0XHRcdHN0aWNraW5lc3M6IFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuQWx3YXlzR3Jvd3NXaGVuVHlwaW5nQXRFZGdlcyxcblx0XHRcdFx0XHRcdFtpdGVtLmFuY2hvci5kaXJlY3Rpb25dOiB0aGlzLl9hY3RpdmVSZW5kZXJNb2RlID09PSBSZW5kZXJNb2RlLk5vcm1hbCA/IG9wdHMgOiB1bmRlZmluZWRcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH07XG5cblx0XHRjb25zdCBhZGRJbmplY3RlZFdoaXRlc3BhY2UgPSAoaXRlbTogSW5sYXlIaW50SXRlbSwgaXNMYXN0OiBib29sZWFuKTogdm9pZCA9PiB7XG5cdFx0XHRjb25zdCBtYXJnaW5SdWxlID0gdGhpcy5fcnVsZUZhY3RvcnkuY3JlYXRlQ2xhc3NOYW1lUmVmKHtcblx0XHRcdFx0d2lkdGg6IGAkeyhmb250U2l6ZSAvIDMpIHwgMH1weGAsXG5cdFx0XHRcdGRpc3BsYXk6ICdpbmxpbmUtYmxvY2snXG5cdFx0XHR9KTtcblx0XHRcdGFkZEluamVjdGVkVGV4dChpdGVtLCBtYXJnaW5SdWxlLCAnXFx1MjAwYScsIGlzTGFzdCA/IEluamVjdGVkVGV4dEN1cnNvclN0b3BzLlJpZ2h0IDogSW5qZWN0ZWRUZXh0Q3Vyc29yU3RvcHMuTm9uZSwgSW5sYXlIaW50c0NvbnRyb2xsZXIuX3doaXRlc3BhY2VEYXRhKTtcblx0XHR9O1xuXG5cblx0XHQvL1xuXHRcdGNvbnN0IHsgZm9udFNpemUsIGZvbnRGYW1pbHksIHBhZGRpbmcsIGlzVW5pZm9ybSB9ID0gdGhpcy5fZ2V0TGF5b3V0SW5mbygpO1xuXHRcdGNvbnN0IG1heExlbmd0aCA9IHRoaXMuX2VkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmlubGF5SGludHMpLm1heGltdW1MZW5ndGg7XG5cdFx0Y29uc3QgZm9udEZhbWlseVZhciA9ICctLWNvZGUtZWRpdG9ySW5sYXlIaW50c0ZvbnRGYW1pbHknO1xuXHRcdHRoaXMuX2VkaXRvci5nZXRDb250YWluZXJEb21Ob2RlKCkuc3R5bGUuc2V0UHJvcGVydHkoZm9udEZhbWlseVZhciwgZm9udEZhbWlseSk7XG5cblxuXHRcdHR5cGUgSUxpbmVJbmZvID0geyBsaW5lOiBudW1iZXI7IHRvdGFsTGVuOiBudW1iZXIgfTtcblx0XHRsZXQgY3VycmVudExpbmVJbmZvOiBJTGluZUluZm8gPSB7IGxpbmU6IDAsIHRvdGFsTGVuOiAwIH07XG5cblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGl0ZW1zLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRjb25zdCBpdGVtID0gaXRlbXNbaV07XG5cblx0XHRcdGlmIChjdXJyZW50TGluZUluZm8ubGluZSAhPT0gaXRlbS5hbmNob3IucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyKSB7XG5cdFx0XHRcdGN1cnJlbnRMaW5lSW5mbyA9IHsgbGluZTogaXRlbS5hbmNob3IucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCB0b3RhbExlbjogMCB9O1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAobWF4TGVuZ3RoICYmIGN1cnJlbnRMaW5lSW5mby50b3RhbExlbiA+IG1heExlbmd0aCkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gd2hpdGVzcGFjZSBsZWFkaW5nIHRoZSBhY3R1YWwgbGFiZWxcblx0XHRcdGlmIChpdGVtLmhpbnQucGFkZGluZ0xlZnQpIHtcblx0XHRcdFx0YWRkSW5qZWN0ZWRXaGl0ZXNwYWNlKGl0ZW0sIGZhbHNlKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gdGhlIGxhYmVsIHdpdGggaXRzIHBhcnRzXG5cdFx0XHRjb25zdCBwYXJ0czogbGFuZ3VhZ2VzLklubGF5SGludExhYmVsUGFydFtdID0gdHlwZW9mIGl0ZW0uaGludC5sYWJlbCA9PT0gJ3N0cmluZydcblx0XHRcdFx0PyBbeyBsYWJlbDogaXRlbS5oaW50LmxhYmVsIH1dXG5cdFx0XHRcdDogaXRlbS5oaW50LmxhYmVsO1xuXG5cdFx0XHRjb25zdCBpdGVtRml4ZWRMZW5ndGggPSBpdGVtRml4ZWRMZW5ndGhzLmdldChpdGVtKTtcblx0XHRcdGxldCBpdGVtQWN0dWFsTGVuZ3RoID0gMDtcblxuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBwYXJ0cy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRjb25zdCBwYXJ0ID0gcGFydHNbaV07XG5cblx0XHRcdFx0Y29uc3QgaXNGaXJzdCA9IGkgPT09IDA7XG5cdFx0XHRcdGNvbnN0IGlzTGFzdCA9IGkgPT09IHBhcnRzLmxlbmd0aCAtIDE7XG5cblx0XHRcdFx0Y29uc3QgY3NzUHJvcGVydGllczogQ3NzUHJvcGVydGllcyA9IHtcblx0XHRcdFx0XHRmb250U2l6ZTogYCR7Zm9udFNpemV9cHhgLFxuXHRcdFx0XHRcdGZvbnRGYW1pbHk6IGB2YXIoJHtmb250RmFtaWx5VmFyfSksICR7RURJVE9SX0ZPTlRfREVGQVVMVFMuZm9udEZhbWlseX1gLFxuXHRcdFx0XHRcdHZlcnRpY2FsQWxpZ246IGlzVW5pZm9ybSA/ICdiYXNlbGluZScgOiAnbWlkZGxlJyxcblx0XHRcdFx0XHR1bmljb2RlQmlkaTogJ2lzb2xhdGUnXG5cdFx0XHRcdH07XG5cblx0XHRcdFx0aWYgKGlzTm9uRW1wdHlBcnJheShpdGVtLmhpbnQudGV4dEVkaXRzKSkge1xuXHRcdFx0XHRcdGNzc1Byb3BlcnRpZXMuY3Vyc29yID0gJ2RlZmF1bHQnO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGhpcy5fZmlsbEluQ29sb3JzKGNzc1Byb3BlcnRpZXMsIGl0ZW0uaGludCk7XG5cblx0XHRcdFx0aWYgKChwYXJ0LmNvbW1hbmQgfHwgcGFydC5sb2NhdGlvbikgJiYgdGhpcy5fYWN0aXZlSW5sYXlIaW50UGFydD8ucGFydC5pdGVtID09PSBpdGVtICYmIHRoaXMuX2FjdGl2ZUlubGF5SGludFBhcnQucGFydC5pbmRleCA9PT0gaSkge1xuXHRcdFx0XHRcdC8vIGFjdGl2ZSBsaW5rIVxuXHRcdFx0XHRcdGNzc1Byb3BlcnRpZXMudGV4dERlY29yYXRpb24gPSAndW5kZXJsaW5lJztcblx0XHRcdFx0XHRpZiAodGhpcy5fYWN0aXZlSW5sYXlIaW50UGFydC5oYXNUcmlnZ2VyTW9kaWZpZXIpIHtcblx0XHRcdFx0XHRcdGNzc1Byb3BlcnRpZXMuY29sb3IgPSB0aGVtZUNvbG9yRnJvbUlkKGNvbG9ycy5lZGl0b3JBY3RpdmVMaW5rRm9yZWdyb3VuZCk7XG5cdFx0XHRcdFx0XHRjc3NQcm9wZXJ0aWVzLmN1cnNvciA9ICdwb2ludGVyJztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRsZXQgdGV4dGxhYmVsID0gcGFydC5sYWJlbDtcblx0XHRcdFx0Y3VycmVudExpbmVJbmZvLnRvdGFsTGVuICs9IHRleHRsYWJlbC5sZW5ndGg7XG5cdFx0XHRcdGxldCB0b29Mb25nID0gZmFsc2U7XG5cdFx0XHRcdGNvbnN0IG92ZXIgPSBtYXhMZW5ndGggIT09IDAgPyAoY3VycmVudExpbmVJbmZvLnRvdGFsTGVuIC0gbWF4TGVuZ3RoKSA6IDA7XG5cdFx0XHRcdGlmIChvdmVyID4gMCkge1xuXHRcdFx0XHRcdHRleHRsYWJlbCA9IHRleHRsYWJlbC5zbGljZSgwLCAtb3ZlcikgKyAnXHUyMDI2Jztcblx0XHRcdFx0XHR0b29Mb25nID0gdHJ1ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGl0ZW1BY3R1YWxMZW5ndGggKz0gdGV4dGxhYmVsLmxlbmd0aDtcblxuXHRcdFx0XHRpZiAoaXRlbUZpeGVkTGVuZ3RoICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRjb25zdCBvdmVyRml4ZWRMZW5ndGggPSBpdGVtQWN0dWFsTGVuZ3RoIC0gaXRlbUZpeGVkTGVuZ3RoO1xuXHRcdFx0XHRcdGlmIChvdmVyRml4ZWRMZW5ndGggPj0gMCkge1xuXHRcdFx0XHRcdFx0Ly8gbG9uZ2VyIHRoYW4gZml4ZWQgbGVuZ3RoLCB0cmltXG5cdFx0XHRcdFx0XHRpdGVtQWN0dWFsTGVuZ3RoIC09IG92ZXJGaXhlZExlbmd0aDtcblx0XHRcdFx0XHRcdHRleHRsYWJlbCA9IHRleHRsYWJlbC5zbGljZSgwLCAtKDEgKyBvdmVyRml4ZWRMZW5ndGgpKSArICdcdTIwMjYnO1xuXHRcdFx0XHRcdFx0dG9vTG9uZyA9IHRydWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKHBhZGRpbmcpIHtcblx0XHRcdFx0XHRpZiAoaXNGaXJzdCAmJiAoaXNMYXN0IHx8IHRvb0xvbmcpKSB7XG5cdFx0XHRcdFx0XHQvLyBvbmx5IGVsZW1lbnRcblx0XHRcdFx0XHRcdGNzc1Byb3BlcnRpZXMucGFkZGluZyA9IGAxcHggJHtNYXRoLm1heCgxLCBmb250U2l6ZSAvIDQpIHwgMH1weGA7XG5cdFx0XHRcdFx0XHRjc3NQcm9wZXJ0aWVzLmJvcmRlclJhZGl1cyA9IGAkeyhmb250U2l6ZSAvIDQpIHwgMH1weGA7XG5cdFx0XHRcdFx0fSBlbHNlIGlmIChpc0ZpcnN0KSB7XG5cdFx0XHRcdFx0XHQvLyBmaXJzdCBlbGVtZW50XG5cdFx0XHRcdFx0XHRjc3NQcm9wZXJ0aWVzLnBhZGRpbmcgPSBgMXB4IDAgMXB4ICR7TWF0aC5tYXgoMSwgZm9udFNpemUgLyA0KSB8IDB9cHhgO1xuXHRcdFx0XHRcdFx0Y3NzUHJvcGVydGllcy5ib3JkZXJSYWRpdXMgPSBgJHsoZm9udFNpemUgLyA0KSB8IDB9cHggMCAwICR7KGZvbnRTaXplIC8gNCkgfCAwfXB4YDtcblx0XHRcdFx0XHR9IGVsc2UgaWYgKChpc0xhc3QgfHwgdG9vTG9uZykpIHtcblx0XHRcdFx0XHRcdC8vIGxhc3QgZWxlbWVudFxuXHRcdFx0XHRcdFx0Y3NzUHJvcGVydGllcy5wYWRkaW5nID0gYDFweCAke01hdGgubWF4KDEsIGZvbnRTaXplIC8gNCkgfCAwfXB4IDFweCAwYDtcblx0XHRcdFx0XHRcdGNzc1Byb3BlcnRpZXMuYm9yZGVyUmFkaXVzID0gYDAgJHsoZm9udFNpemUgLyA0KSB8IDB9cHggJHsoZm9udFNpemUgLyA0KSB8IDB9cHggMGA7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGNzc1Byb3BlcnRpZXMucGFkZGluZyA9IGAxcHggMCAxcHggMGA7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0YWRkSW5qZWN0ZWRUZXh0KFxuXHRcdFx0XHRcdGl0ZW0sXG5cdFx0XHRcdFx0dGhpcy5fcnVsZUZhY3RvcnkuY3JlYXRlQ2xhc3NOYW1lUmVmKGNzc1Byb3BlcnRpZXMpLFxuXHRcdFx0XHRcdGZpeFNwYWNlKHRleHRsYWJlbCksXG5cdFx0XHRcdFx0aXNMYXN0ICYmICFpdGVtLmhpbnQucGFkZGluZ1JpZ2h0ID8gSW5qZWN0ZWRUZXh0Q3Vyc29yU3RvcHMuUmlnaHQgOiBJbmplY3RlZFRleHRDdXJzb3JTdG9wcy5Ob25lLFxuXHRcdFx0XHRcdG5ldyBSZW5kZXJlZElubGF5SGludExhYmVsUGFydChpdGVtLCBpKVxuXHRcdFx0XHQpO1xuXG5cdFx0XHRcdGlmICh0b29Mb25nKSB7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKGl0ZW1GaXhlZExlbmd0aCAhPT0gdW5kZWZpbmVkICYmIGl0ZW1BY3R1YWxMZW5ndGggPCBpdGVtRml4ZWRMZW5ndGgpIHtcblx0XHRcdFx0Ly8gc2hvcnRlciB0aGFuIGZpeGVkIGxlbmd0aCwgcGFkXG5cdFx0XHRcdGNvbnN0IHBhZCA9IChpdGVtRml4ZWRMZW5ndGggLSBpdGVtQWN0dWFsTGVuZ3RoKTtcblx0XHRcdFx0YWRkSW5qZWN0ZWRUZXh0KFxuXHRcdFx0XHRcdGl0ZW0sXG5cdFx0XHRcdFx0dGhpcy5fcnVsZUZhY3RvcnkuY3JlYXRlQ2xhc3NOYW1lUmVmKHt9KSxcblx0XHRcdFx0XHQnXFx1MjAwYScucmVwZWF0KHBhZCksXG5cdFx0XHRcdFx0SW5qZWN0ZWRUZXh0Q3Vyc29yU3RvcHMuTm9uZVxuXHRcdFx0XHQpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyB3aGl0ZXNwYWNlIHRyYWlsaW5nIHRoZSBhY3R1YWwgbGFiZWxcblx0XHRcdGlmIChpdGVtLmhpbnQucGFkZGluZ1JpZ2h0KSB7XG5cdFx0XHRcdGFkZEluamVjdGVkV2hpdGVzcGFjZShpdGVtLCB0cnVlKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKG5ld0RlY29yYXRpb25zRGF0YS5sZW5ndGggPiBJbmxheUhpbnRzQ29udHJvbGxlci5fTUFYX0RFQ09SQVRPUlMpIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gY29sbGVjdCBhbGwgZGVjb3JhdGlvbiBpZHMgdGhhdCBhcmUgYWZmZWN0ZWQgYnkgdGhlIHJhbmdlc1xuXHRcdC8vIGFuZCBvbmx5IHVwZGF0ZSB0aG9zZSBkZWNvcmF0aW9uc1xuXHRcdGNvbnN0IGRlY29yYXRpb25JZHNUb1JlcGxhY2U6IHN0cmluZ1tdID0gW107XG5cdFx0Zm9yIChjb25zdCBbaWQsIG1ldGFkYXRhXSBvZiB0aGlzLl9kZWNvcmF0aW9uc01ldGFkYXRhKSB7XG5cdFx0XHRjb25zdCByYW5nZSA9IHRoaXMuX2VkaXRvci5nZXRNb2RlbCgpPy5nZXREZWNvcmF0aW9uUmFuZ2UoaWQpO1xuXHRcdFx0aWYgKHJhbmdlICYmIHJhbmdlcy5zb21lKHIgPT4gci5jb250YWluc1JhbmdlKHJhbmdlKSkpIHtcblx0XHRcdFx0ZGVjb3JhdGlvbklkc1RvUmVwbGFjZS5wdXNoKGlkKTtcblx0XHRcdFx0bWV0YWRhdGEuY2xhc3NOYW1lUmVmLmRpc3Bvc2UoKTtcblx0XHRcdFx0dGhpcy5fZGVjb3JhdGlvbnNNZXRhZGF0YS5kZWxldGUoaWQpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IHNjcm9sbFN0YXRlID0gU3RhYmxlRWRpdG9yU2Nyb2xsU3RhdGUuY2FwdHVyZSh0aGlzLl9lZGl0b3IpO1xuXG5cdFx0dGhpcy5fZWRpdG9yLmNoYW5nZURlY29yYXRpb25zKGFjY2Vzc29yID0+IHtcblx0XHRcdGNvbnN0IG5ld0RlY29yYXRpb25JZHMgPSBhY2Nlc3Nvci5kZWx0YURlY29yYXRpb25zKGRlY29yYXRpb25JZHNUb1JlcGxhY2UsIG5ld0RlY29yYXRpb25zRGF0YS5tYXAoZCA9PiBkLmRlY29yYXRpb24pKTtcblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgbmV3RGVjb3JhdGlvbklkcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRjb25zdCBkYXRhID0gbmV3RGVjb3JhdGlvbnNEYXRhW2ldO1xuXHRcdFx0XHR0aGlzLl9kZWNvcmF0aW9uc01ldGFkYXRhLnNldChuZXdEZWNvcmF0aW9uSWRzW2ldLCBkYXRhKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHNjcm9sbFN0YXRlLnJlc3RvcmUodGhpcy5fZWRpdG9yKTtcblx0fVxuXG5cdHByaXZhdGUgX2ZpbGxJbkNvbG9ycyhwcm9wczogQ3NzUHJvcGVydGllcywgaGludDogbGFuZ3VhZ2VzLklubGF5SGludCk6IHZvaWQge1xuXHRcdGlmIChoaW50LmtpbmQgPT09IGxhbmd1YWdlcy5JbmxheUhpbnRLaW5kLlBhcmFtZXRlcikge1xuXHRcdFx0cHJvcHMuYmFja2dyb3VuZENvbG9yID0gdGhlbWVDb2xvckZyb21JZChjb2xvcnMuZWRpdG9ySW5sYXlIaW50UGFyYW1ldGVyQmFja2dyb3VuZCk7XG5cdFx0XHRwcm9wcy5jb2xvciA9IHRoZW1lQ29sb3JGcm9tSWQoY29sb3JzLmVkaXRvcklubGF5SGludFBhcmFtZXRlckZvcmVncm91bmQpO1xuXHRcdH0gZWxzZSBpZiAoaGludC5raW5kID09PSBsYW5ndWFnZXMuSW5sYXlIaW50S2luZC5UeXBlKSB7XG5cdFx0XHRwcm9wcy5iYWNrZ3JvdW5kQ29sb3IgPSB0aGVtZUNvbG9yRnJvbUlkKGNvbG9ycy5lZGl0b3JJbmxheUhpbnRUeXBlQmFja2dyb3VuZCk7XG5cdFx0XHRwcm9wcy5jb2xvciA9IHRoZW1lQ29sb3JGcm9tSWQoY29sb3JzLmVkaXRvcklubGF5SGludFR5cGVGb3JlZ3JvdW5kKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cHJvcHMuYmFja2dyb3VuZENvbG9yID0gdGhlbWVDb2xvckZyb21JZChjb2xvcnMuZWRpdG9ySW5sYXlIaW50QmFja2dyb3VuZCk7XG5cdFx0XHRwcm9wcy5jb2xvciA9IHRoZW1lQ29sb3JGcm9tSWQoY29sb3JzLmVkaXRvcklubGF5SGludEZvcmVncm91bmQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2dldExheW91dEluZm8oKSB7XG5cdFx0Y29uc3Qgb3B0aW9ucyA9IHRoaXMuX2VkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmlubGF5SGludHMpO1xuXHRcdGNvbnN0IHBhZGRpbmcgPSBvcHRpb25zLnBhZGRpbmc7XG5cblx0XHRjb25zdCBlZGl0b3JGb250U2l6ZSA9IHRoaXMuX2VkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmZvbnRTaXplKTtcblx0XHRjb25zdCBlZGl0b3JGb250RmFtaWx5ID0gdGhpcy5fZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24uZm9udEZhbWlseSk7XG5cblx0XHRsZXQgZm9udFNpemUgPSBvcHRpb25zLmZvbnRTaXplO1xuXHRcdGlmICghZm9udFNpemUgfHwgZm9udFNpemUgPCA1IHx8IGZvbnRTaXplID4gZWRpdG9yRm9udFNpemUpIHtcblx0XHRcdGZvbnRTaXplID0gZWRpdG9yRm9udFNpemU7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZm9udEZhbWlseSA9IG9wdGlvbnMuZm9udEZhbWlseSB8fCBlZGl0b3JGb250RmFtaWx5O1xuXG5cdFx0Y29uc3QgaXNVbmlmb3JtID0gIXBhZGRpbmdcblx0XHRcdCYmIGZvbnRGYW1pbHkgPT09IGVkaXRvckZvbnRGYW1pbHlcblx0XHRcdCYmIGZvbnRTaXplID09PSBlZGl0b3JGb250U2l6ZTtcblxuXHRcdHJldHVybiB7IGZvbnRTaXplLCBmb250RmFtaWx5LCBwYWRkaW5nLCBpc1VuaWZvcm0gfTtcblx0fVxuXG5cdHByaXZhdGUgX3JlbW92ZUFsbERlY29yYXRpb25zKCk6IHZvaWQge1xuXHRcdHRoaXMuX2VkaXRvci5yZW1vdmVEZWNvcmF0aW9ucyhBcnJheS5mcm9tKHRoaXMuX2RlY29yYXRpb25zTWV0YWRhdGEua2V5cygpKSk7XG5cdFx0Zm9yIChjb25zdCBvYmogb2YgdGhpcy5fZGVjb3JhdGlvbnNNZXRhZGF0YS52YWx1ZXMoKSkge1xuXHRcdFx0b2JqLmNsYXNzTmFtZVJlZi5kaXNwb3NlKCk7XG5cdFx0fVxuXHRcdHRoaXMuX2RlY29yYXRpb25zTWV0YWRhdGEuY2xlYXIoKTtcblx0fVxuXG5cblx0Ly8gLS0tIGFjY2Vzc2liaWxpdHlcblxuXHRnZXRJbmxheUhpbnRzRm9yTGluZShsaW5lOiBudW1iZXIpOiBJbmxheUhpbnRJdGVtW10ge1xuXHRcdGlmICghdGhpcy5fZWRpdG9yLmhhc01vZGVsKCkpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdFx0Y29uc3Qgc2V0ID0gbmV3IFNldDxsYW5ndWFnZXMuSW5sYXlIaW50PigpO1xuXHRcdGNvbnN0IHJlc3VsdDogSW5sYXlIaW50SXRlbVtdID0gW107XG5cdFx0Zm9yIChjb25zdCBkZWNvIG9mIHRoaXMuX2VkaXRvci5nZXRMaW5lRGVjb3JhdGlvbnMobGluZSkpIHtcblx0XHRcdGNvbnN0IGRhdGEgPSB0aGlzLl9kZWNvcmF0aW9uc01ldGFkYXRhLmdldChkZWNvLmlkKTtcblx0XHRcdGlmIChkYXRhICYmICFzZXQuaGFzKGRhdGEuaXRlbS5oaW50KSkge1xuXHRcdFx0XHRzZXQuYWRkKGRhdGEuaXRlbS5oaW50KTtcblx0XHRcdFx0cmVzdWx0LnB1c2goZGF0YS5pdGVtKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxufVxuXG5cbi8vIFByZXZlbnRzIHRoZSB2aWV3IGZyb20gcG90ZW50aWFsbHkgdmlzaWJsZSB3aGl0ZXNwYWNlXG5mdW5jdGlvbiBmaXhTcGFjZShzdHI6IHN0cmluZyk6IHN0cmluZyB7XG5cdGNvbnN0IG5vQnJlYWtXaGl0ZXNwYWNlID0gJ1xceGEwJztcblx0cmV0dXJuIHN0ci5yZXBsYWNlKC9bIFxcdF0vZywgbm9CcmVha1doaXRlc3BhY2UpO1xufVxuXG5Db21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZCgnX2V4ZWN1dGVJbmxheUhpbnRQcm92aWRlcicsIGFzeW5jIChhY2Nlc3NvciwgLi4uYXJnczogW1VSSSwgSVJhbmdlXSk6IFByb21pc2U8bGFuZ3VhZ2VzLklubGF5SGludFtdPiA9PiB7XG5cblx0Y29uc3QgW3VyaSwgcmFuZ2VdID0gYXJncztcblx0YXNzZXJ0VHlwZShVUkkuaXNVcmkodXJpKSk7XG5cdGFzc2VydFR5cGUoUmFuZ2UuaXNJUmFuZ2UocmFuZ2UpKTtcblxuXHRjb25zdCB7IGlubGF5SGludHNQcm92aWRlciB9ID0gYWNjZXNzb3IuZ2V0KElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSk7XG5cdGNvbnN0IHJlZiA9IGF3YWl0IGFjY2Vzc29yLmdldChJVGV4dE1vZGVsU2VydmljZSkuY3JlYXRlTW9kZWxSZWZlcmVuY2UodXJpKTtcblx0dHJ5IHtcblx0XHRjb25zdCBtb2RlbCA9IGF3YWl0IElubGF5SGludHNGcmFnbWVudHMuY3JlYXRlKGlubGF5SGludHNQcm92aWRlciwgcmVmLm9iamVjdC50ZXh0RWRpdG9yTW9kZWwsIFtSYW5nZS5saWZ0KHJhbmdlKV0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IG1vZGVsLml0ZW1zLm1hcChpID0+IGkuaGludCk7XG5cdFx0c2V0VGltZW91dCgoKSA9PiBtb2RlbC5kaXNwb3NlKCksIDApOyAvLyBkaXNwb3NlIGFmdGVyIHNlbmRpbmcgdG8gZXh0IGhvc3Rcblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9IGZpbmFsbHkge1xuXHRcdHJlZi5kaXNwb3NlKCk7XG5cdH1cbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGVBQWUsMEJBQTBCO0FBQ2xELFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsbUJBQW1CLHdCQUF3QjtBQUNwRCxTQUFTLG1CQUFtQiwrQkFBK0I7QUFDM0QsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxpQkFB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
