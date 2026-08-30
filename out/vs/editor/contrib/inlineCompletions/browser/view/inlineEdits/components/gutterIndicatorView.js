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
import { n } from "../../../../../../../base/browser/dom.js";
import { renderIcon } from "../../../../../../../base/browser/ui/iconLabel/iconLabels.js";
import { Codicon } from "../../../../../../../base/common/codicons.js";
import { BugIndicatingError } from "../../../../../../../base/common/errors.js";
import { Disposable, DisposableStore, toDisposable } from "../../../../../../../base/common/lifecycle.js";
import { autorun, constObservable, debouncedObservable, derived, observableFromEvent, observableValue, runOnChange } from "../../../../../../../base/common/observable.js";
import { IAccessibilityService } from "../../../../../../../platform/accessibility/common/accessibility.js";
import { IHoverService } from "../../../../../../../platform/hover/browser/hover.js";
import { IInstantiationService } from "../../../../../../../platform/instantiation/common/instantiation.js";
import { IThemeService } from "../../../../../../../platform/theme/common/themeService.js";
import { Point } from "../../../../../../common/core/2d/point.js";
import { Rect } from "../../../../../../common/core/2d/rect.js";
import { EditorOption, RenderLineNumbersType } from "../../../../../../common/config/editorOptions.js";
import { OffsetRange } from "../../../../../../common/core/ranges/offsetRange.js";
import { StickyScrollController } from "../../../../../stickyScroll/browser/stickyScrollController.js";
import { InlineEditTabAction } from "../inlineEditsViewInterface.js";
import { getEditorBlendedColor, INLINE_EDITS_BORDER_RADIUS, inlineEditIndicatorBackground, inlineEditIndicatorPrimaryBackground, inlineEditIndicatorPrimaryBorder, inlineEditIndicatorPrimaryForeground, inlineEditIndicatorSecondaryBackground, inlineEditIndicatorSecondaryBorder, inlineEditIndicatorSecondaryForeground, inlineEditIndicatorSuccessfulBackground, inlineEditIndicatorSuccessfulBorder, inlineEditIndicatorSuccessfulForeground } from "../theme.js";
import { mapOutFalsy, rectToProps } from "../utils/utils.js";
import { GutterIndicatorMenuContent } from "./gutterIndicatorMenu.js";
import { assertNever } from "../../../../../../../base/common/assert.js";
import { localize } from "../../../../../../../nls.js";
import { asCssVariable } from "../../../../../../../platform/theme/common/colorUtils.js";
import { IUserInteractionService } from "../../../../../../../platform/userInteraction/browser/userInteractionService.js";
import { Emitter } from "../../../../../../../base/common/event.js";
class InlineEditsGutterIndicatorData {
  constructor(gutterMenuData, originalRange, model, altAction, customization) {
    this.gutterMenuData = gutterMenuData;
    this.originalRange = originalRange;
    this.model = model;
    this.altAction = altAction;
    this.customization = customization;
  }
}
class InlineSuggestionGutterMenuData {
  constructor(action, displayName, extensionCommands, alternativeAction, modelInfo, setModelId, extensionCommandsOnly = false) {
    this.action = action;
    this.displayName = displayName;
    this.extensionCommands = extensionCommands;
    this.alternativeAction = alternativeAction;
    this.modelInfo = modelInfo;
    this.setModelId = setModelId;
    this.extensionCommandsOnly = extensionCommandsOnly;
  }
  static fromInlineSuggestion(suggestion) {
    const alternativeAction = suggestion.action?.kind === "edit" ? suggestion.action.alternativeAction : void 0;
    const commands = suggestion.source.inlineSuggestions.commands ?? [];
    return new InlineSuggestionGutterMenuData(
      suggestion.gutterMenuLinkAction,
      suggestion.source.provider.displayName ?? localize("inlineSuggestion", "Inline Suggestion"),
      commands.length > 0 ? [commands] : [],
      alternativeAction,
      suggestion.source.provider.modelInfo,
      suggestion.source.provider.setModelId?.bind(suggestion.source.provider)
    );
  }
}
class SimpleInlineSuggestModel {
  constructor(accept, jump) {
    this.accept = accept;
    this.jump = jump;
  }
  static fromInlineCompletionModel(model) {
    return new SimpleInlineSuggestModel(
      () => model.accept(),
      () => model.jump()
    );
  }
}
const CODICON_SIZE_PX = 16;
const CODICON_PADDING_PX = 2;
let InlineEditsGutterIndicator = class extends Disposable {
  constructor(_editorObs, _data, _tabAction, _verticalOffset, _isHoveringOverInlineEdit, _focusIsInMenu, _hoverService, _instantiationService, _accessibilityService, _themeService, _userInteractionService) {
    super();
    this._editorObs = _editorObs;
    this._data = _data;
    this._tabAction = _tabAction;
    this._verticalOffset = _verticalOffset;
    this._isHoveringOverInlineEdit = _isHoveringOverInlineEdit;
    this._focusIsInMenu = _focusIsInMenu;
    this._hoverService = _hoverService;
    this._instantiationService = _instantiationService;
    this._accessibilityService = _accessibilityService;
    this._themeService = _themeService;
    this._userInteractionService = _userInteractionService;
    this._onDidCloseWithCommand = this._register(new Emitter());
    this.onDidCloseWithCommand = this._onDidCloseWithCommand.event;
    this._modifierPressed = derived(
      this,
      (reader) => this._userInteractionService.readModifierKeyStatus(this._editorObs.editor.getDomNode(), reader).shiftKey
    );
    this._gutterIndicatorStyles = derived(this, (reader) => {
      let v = this._tabAction.read(reader);
      const altAction = this._data.read(reader)?.altAction;
      const modifiedPressed = this._modifierPressed.read(reader);
      if (altAction && modifiedPressed) {
        v = InlineEditTabAction.Inactive;
      }
      switch (v) {
        case InlineEditTabAction.Inactive:
          return {
            background: getEditorBlendedColor(inlineEditIndicatorSecondaryBackground, this._themeService).read(reader).toString(),
            foreground: getEditorBlendedColor(inlineEditIndicatorSecondaryForeground, this._themeService).read(reader).toString(),
            border: getEditorBlendedColor(inlineEditIndicatorSecondaryBorder, this._themeService).read(reader).toString()
          };
        case InlineEditTabAction.Jump:
          return {
            background: getEditorBlendedColor(inlineEditIndicatorPrimaryBackground, this._themeService).read(reader).toString(),
            foreground: getEditorBlendedColor(inlineEditIndicatorPrimaryForeground, this._themeService).read(reader).toString(),
            border: getEditorBlendedColor(inlineEditIndicatorPrimaryBorder, this._themeService).read(reader).toString()
          };
        case InlineEditTabAction.Accept:
          return {
            background: getEditorBlendedColor(inlineEditIndicatorSuccessfulBackground, this._themeService).read(reader).toString(),
            foreground: getEditorBlendedColor(inlineEditIndicatorSuccessfulForeground, this._themeService).read(reader).toString(),
            border: getEditorBlendedColor(inlineEditIndicatorSuccessfulBorder, this._themeService).read(reader).toString()
          };
        default:
          assertNever(v);
      }
    });
    this._state = derived(this, (reader) => {
      const range = this._originalRangeObs.read(reader);
      if (!range) {
        return void 0;
      }
      return {
        range,
        lineOffsetRange: this._editorObs.observeLineOffsetRange(range, reader.store)
      };
    });
    this._lineNumberToRender = derived(this, (reader) => {
      if (this._verticalOffset.read(reader) !== 0) {
        return "";
      }
      const lineNumber = this._data.read(reader)?.originalRange.startLineNumber;
      const lineNumberOptions = this._editorObs.getOption(EditorOption.lineNumbers).read(reader);
      if (lineNumber === void 0 || lineNumberOptions.renderType === RenderLineNumbersType.Off) {
        return "";
      }
      if (lineNumberOptions.renderType === RenderLineNumbersType.Interval) {
        const cursorPosition = this._editorObs.cursorPosition.read(reader);
        if (lineNumber % 10 === 0 || cursorPosition && cursorPosition.lineNumber === lineNumber) {
          return lineNumber.toString();
        }
        return "";
      }
      if (lineNumberOptions.renderType === RenderLineNumbersType.Relative) {
        const cursorPosition = this._editorObs.cursorPosition.read(reader);
        if (!cursorPosition) {
          return "";
        }
        const relativeLineNumber = Math.abs(lineNumber - cursorPosition.lineNumber);
        if (relativeLineNumber === 0) {
          return lineNumber.toString();
        }
        return relativeLineNumber.toString();
      }
      if (lineNumberOptions.renderType === RenderLineNumbersType.Custom) {
        if (lineNumberOptions.renderFn) {
          return lineNumberOptions.renderFn(lineNumber);
        }
        return "";
      }
      return lineNumber.toString();
    });
    this._availableWidthForIcon = derived(this, (reader) => {
      const textModel = this._editorObs.editor.getModel();
      const editor = this._editorObs.editor;
      const layout = this._editorObs.layoutInfo.read(reader);
      const gutterWidth = layout.decorationsLeft + layout.decorationsWidth - layout.glyphMarginLeft;
      if (!textModel || gutterWidth <= 0) {
        return () => 0;
      }
      if (layout.lineNumbersLeft === 0) {
        return () => gutterWidth;
      }
      const lineNumberOptions = this._editorObs.getOption(EditorOption.lineNumbers).read(reader);
      if (lineNumberOptions.renderType === RenderLineNumbersType.Relative || /* likely to flicker */
      lineNumberOptions.renderType === RenderLineNumbersType.Off) {
        return () => gutterWidth;
      }
      const w = editor.getOption(EditorOption.fontInfo).typicalHalfwidthCharacterWidth;
      const rightOfLineNumber = layout.lineNumbersLeft + layout.lineNumbersWidth;
      const totalLines = textModel.getLineCount();
      const totalLinesDigits = (totalLines + 1).toString().length;
      const offsetDigits = [];
      for (let digits = 1; digits <= totalLinesDigits; digits++) {
        const firstLineNumberWithDigitCount = 10 ** (digits - 1);
        const topOfLineNumber = editor.getTopForLineNumber(firstLineNumberWithDigitCount);
        const digitsWidth = digits * w;
        const usableWidthLeftOfLineNumber = Math.min(gutterWidth, Math.max(0, rightOfLineNumber - digitsWidth - layout.glyphMarginLeft));
        offsetDigits.push({ firstLineNumberWithDigitCount, topOfLineNumber, usableWidthLeftOfLineNumber });
      }
      return (topOffset) => {
        for (let i = offsetDigits.length - 1; i >= 0; i--) {
          if (topOffset >= offsetDigits[i].topOfLineNumber) {
            return offsetDigits[i].usableWidthLeftOfLineNumber;
          }
        }
        throw new BugIndicatingError("Could not find avilable width for icon");
      };
    });
    this._layout = derived(this, (reader) => {
      const s = this._state.read(reader);
      if (!s) {
        return void 0;
      }
      const layout = this._editorObs.layoutInfo.read(reader);
      const lineHeight = this._editorObs.observeLineHeightForLine(s.range.map((r) => r.startLineNumber)).read(reader);
      const gutterViewPortPaddingLeft = 1;
      const gutterViewPortPaddingTop = 2;
      const gutterWidthWithoutPadding = layout.decorationsLeft + layout.decorationsWidth - layout.glyphMarginLeft - 2 * gutterViewPortPaddingLeft;
      const gutterHeightWithoutPadding = layout.height - 2 * gutterViewPortPaddingTop;
      const gutterViewPortWithStickyScroll = Rect.fromLeftTopWidthHeight(gutterViewPortPaddingLeft, gutterViewPortPaddingTop, gutterWidthWithoutPadding, gutterHeightWithoutPadding);
      const gutterViewPortWithoutStickyScrollWithoutPaddingTop = gutterViewPortWithStickyScroll.withTop(this._stickyScrollHeight.read(reader));
      const gutterViewPortWithoutStickyScroll = gutterViewPortWithStickyScroll.withTop(gutterViewPortWithoutStickyScrollWithoutPaddingTop.top + gutterViewPortPaddingTop);
      const verticalEditRange = s.lineOffsetRange.read(reader);
      const gutterEditArea = Rect.fromRanges(OffsetRange.fromTo(gutterViewPortWithoutStickyScroll.left, gutterViewPortWithoutStickyScroll.right), verticalEditRange);
      const pillHeight = lineHeight;
      const pillOffset = this._verticalOffset.read(reader);
      const pillFullyDockedRect = gutterEditArea.withHeight(pillHeight).translateY(pillOffset);
      const pillIsFullyDocked = gutterViewPortWithoutStickyScrollWithoutPaddingTop.containsRect(pillFullyDockedRect);
      const customIcon = this._data.read(reader)?.customization?.icon;
      const iconNoneDocked = customIcon ? constObservable(customIcon) : this._tabAction.map((action) => action === InlineEditTabAction.Accept ? Codicon.keyboardTab : Codicon.arrowRight);
      const iconDocked = customIcon ? constObservable(customIcon) : derived(this, (reader2) => {
        if (this._isHoveredOverIconDebounced.read(reader2) || this._isHoveredOverInlineEditDebounced.read(reader2)) {
          return Codicon.check;
        }
        if (this._tabAction.read(reader2) === InlineEditTabAction.Accept) {
          return Codicon.keyboardTab;
        }
        const cursorLineNumber = this._editorObs.cursorLineNumber.read(reader2) ?? 0;
        const editStartLineNumber = s.range.read(reader2).startLineNumber;
        return cursorLineNumber <= editStartLineNumber ? Codicon.keyboardTabAbove : Codicon.keyboardTabBelow;
      });
      const idealIconAreaWidth = 22;
      const iconWidth = (pillRect2) => {
        const availableIconAreaWidth = this._availableWidthForIcon.read(void 0)(pillRect2.bottom + this._editorObs.editor.getScrollTop()) - gutterViewPortPaddingLeft;
        return Math.max(Math.min(availableIconAreaWidth, idealIconAreaWidth), CODICON_SIZE_PX);
      };
      if (pillIsFullyDocked) {
        const pillRect2 = pillFullyDockedRect;
        let widthUntilLineNumberEnd;
        if (layout.lineNumbersWidth === 0) {
          widthUntilLineNumberEnd = Math.max(0, Math.min(Math.max(layout.lineNumbersLeft - gutterViewPortWithStickyScroll.left, 0), pillRect2.width - idealIconAreaWidth));
        } else {
          widthUntilLineNumberEnd = Math.max(layout.lineNumbersLeft + layout.lineNumbersWidth - gutterViewPortWithStickyScroll.left, 0);
        }
        const lineNumberRect = pillRect2.withWidth(widthUntilLineNumberEnd);
        const minimalIconWidthWithPadding = CODICON_SIZE_PX + CODICON_PADDING_PX;
        const iconWidth2 = Math.min(pillRect2.width - widthUntilLineNumberEnd, idealIconAreaWidth);
        const iconRect2 = pillRect2.withWidth(Math.max(iconWidth2, minimalIconWidthWithPadding)).translateX(widthUntilLineNumberEnd);
        const iconVisible = iconWidth2 >= minimalIconWidthWithPadding;
        return {
          gutterEditArea,
          icon: iconDocked,
          iconDirection: "right",
          iconRect: iconRect2,
          iconVisible,
          pillRect: pillRect2,
          lineNumberRect
        };
      }
      const pillPartiallyDockedPossibleArea = gutterViewPortWithStickyScroll.intersect(gutterEditArea);
      const pillIsPartiallyDocked = pillPartiallyDockedPossibleArea && pillPartiallyDockedPossibleArea.height >= pillHeight;
      if (pillIsPartiallyDocked) {
        const pillRectMoved2 = pillFullyDockedRect.moveToBeContainedIn(gutterViewPortWithoutStickyScroll).moveToBeContainedIn(pillPartiallyDockedPossibleArea);
        const pillRect2 = pillRectMoved2.withWidth(iconWidth(pillRectMoved2));
        const iconRect2 = pillRect2;
        return {
          gutterEditArea,
          icon: iconDocked,
          iconDirection: "right",
          iconRect: iconRect2,
          pillRect: pillRect2,
          iconVisible: true
        };
      }
      const pillRectMoved = pillFullyDockedRect.moveToBeContainedIn(gutterViewPortWithStickyScroll);
      const pillRect = pillRectMoved.withWidth(iconWidth(pillRectMoved));
      const iconRect = pillRect;
      const iconDirection = pillRect.top < pillFullyDockedRect.top ? "top" : "bottom";
      return {
        gutterEditArea,
        icon: iconNoneDocked,
        iconDirection,
        iconRect,
        pillRect,
        iconVisible: true
      };
    });
    this._iconRef = n.ref();
    this.isVisible = this._layout.map((l) => !!l);
    this._hoverVisible = observableValue(this, false);
    this.isHoverVisible = this._hoverVisible;
    this._isHoveredOverIcon = observableValue(this, false);
    this._isHoveredOverIconDebounced = debouncedObservable(this._isHoveredOverIcon, 100);
    this.isHoveredOverIcon = this._isHoveredOverIconDebounced;
    this._indicator = n.div({
      class: "inline-edits-view-gutter-indicator",
      style: {
        position: "absolute",
        overflow: "visible"
      }
    }, mapOutFalsy(this._layout).map((layout) => !layout ? [] : [
      n.div({
        style: {
          position: "absolute",
          background: asCssVariable(inlineEditIndicatorBackground),
          borderRadius: `${INLINE_EDITS_BORDER_RADIUS}px`,
          ...rectToProps((reader) => layout.read(reader).gutterEditArea)
        }
      }),
      n.div({
        class: "icon",
        ref: this._iconRef,
        tabIndex: 0,
        onclick: () => {
          const layout2 = this._layout.get();
          const acceptOnClick = layout2?.icon.get() === Codicon.check;
          const data = this._data.get();
          if (!data) {
            throw new BugIndicatingError("Gutter indicator data not available");
          }
          this._editorObs.editor.focus();
          if (acceptOnClick) {
            data.model.accept();
          } else {
            data.model.jump();
          }
        },
        onmouseenter: () => {
          this._showHover();
        },
        style: {
          cursor: "pointer",
          zIndex: "20",
          position: "absolute",
          backgroundColor: this._gutterIndicatorStyles.map((v) => v.background),
          // eslint-disable-next-line local/code-no-any-casts
          ["--vscodeIconForeground"]: this._gutterIndicatorStyles.map((v) => v.foreground),
          border: this._gutterIndicatorStyles.map((v) => `1px solid ${v.border}`),
          boxSizing: "border-box",
          borderRadius: `${INLINE_EDITS_BORDER_RADIUS}px`,
          display: "flex",
          justifyContent: layout.map((l) => l.iconDirection === "bottom" ? "flex-start" : "flex-end"),
          transition: this._modifierPressed.map((m) => m ? "" : "background-color 0.2s ease-in-out, width 0.2s ease-in-out"),
          ...rectToProps((reader) => layout.read(reader).pillRect)
        }
      }, [
        n.div(
          {
            className: "line-number",
            style: {
              lineHeight: layout.map((l) => l.lineNumberRect ? l.lineNumberRect.height : 0),
              display: layout.map((l) => l.lineNumberRect ? "flex" : "none"),
              alignItems: "center",
              justifyContent: "flex-end",
              width: layout.map((l) => l.lineNumberRect ? l.lineNumberRect.width : 0),
              height: "100%",
              color: this._gutterIndicatorStyles.map((v) => v.foreground)
            }
          },
          this._lineNumberToRender
        ),
        n.div({
          style: {
            transform: layout.map((l) => `rotate(${getRotationFromDirection(l.iconDirection)}deg)`),
            transition: "rotate 0.2s ease-in-out, opacity 0.2s ease-in-out",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
            opacity: layout.map((l) => l.iconVisible ? "1" : "0"),
            marginRight: layout.map((l) => l.pillRect.width - l.iconRect.width - (l.lineNumberRect?.width ?? 0)),
            width: layout.map((l) => l.iconRect.width),
            position: "relative",
            right: layout.map((l) => l.iconDirection === "top" ? "1px" : "0"),
            color: this._data.map((d) => d?.customization?.icon?.color ? asCssVariable(d.customization.icon.color.id) : void 0)
          }
        }, [
          layout.map((l, reader) => withStyles(renderIcon(l.icon.read(reader)), { fontSize: toPx(Math.min(l.iconRect.width - CODICON_PADDING_PX, CODICON_SIZE_PX)) }))
        ])
      ])
    ]));
    this._originalRangeObs = mapOutFalsy(this._data.map((d) => d?.originalRange));
    this._stickyScrollController = StickyScrollController.get(this._editorObs.editor);
    this._stickyScrollHeight = this._stickyScrollController ? observableFromEvent(this._stickyScrollController.onDidChangeStickyScrollHeight, () => this._stickyScrollController.stickyScrollWidgetHeight) : constObservable(0);
    this._isHoveredOverInlineEditDebounced = debouncedObservable(this._isHoveringOverInlineEdit, 100);
    const indicator = this._indicator.keepUpdated(this._store);
    this._register(this._editorObs.createOverlayWidget({
      domNode: indicator.element,
      position: constObservable(null),
      allowEditorOverflow: false,
      minContentWidthInPx: constObservable(0)
    }));
    this._register(this._editorObs.editor.onMouseMove((e) => {
      const state = this._state.get();
      if (state === void 0) {
        return;
      }
      const el = this._iconRef.element;
      const rect = el.getBoundingClientRect();
      const rectangularArea = Rect.fromLeftTopWidthHeight(rect.left, rect.top, rect.width, rect.height);
      const point = new Point(e.event.posx, e.event.posy);
      this._isHoveredOverIcon.set(rectangularArea.containsPoint(point), void 0);
    }));
    this._register(this._editorObs.editor.onDidScrollChange(() => {
      this._isHoveredOverIcon.set(false, void 0);
    }));
    this._register(runOnChange(this._isHoveredOverInlineEditDebounced, (isHovering) => {
      if (isHovering) {
        this.triggerAnimation();
      }
    }));
    this._register(autorun((reader) => {
      indicator.readEffect(reader);
      if (indicator.element) {
        this._editorObs.editor.applyFontInfo(indicator.element);
      }
    }));
  }
  triggerAnimation() {
    if (this._accessibilityService.isMotionReduced()) {
      return new Animation(null, null).finished;
    }
    const animation = this._iconRef.element.animate([
      {
        outline: `2px solid ${this._gutterIndicatorStyles.map((v) => v.border).get()}`,
        outlineOffset: "-1px",
        offset: 0
      },
      {
        outline: `2px solid transparent`,
        outlineOffset: "10px",
        offset: 1
      }
    ], { duration: 500 });
    return animation.finished;
  }
  _showHover() {
    if (this._hoverVisible.get()) {
      return;
    }
    const data = this._data.get();
    if (!data) {
      throw new BugIndicatingError("Gutter indicator data not available");
    }
    const disposableStore = new DisposableStore();
    const content = disposableStore.add(this._instantiationService.createInstance(
      GutterIndicatorMenuContent,
      this._editorObs,
      data.gutterMenuData,
      (focusEditor, commandId) => {
        if (focusEditor) {
          this._editorObs.editor.focus();
        }
        if (commandId) {
          this._onDidCloseWithCommand.fire(commandId);
        }
        h?.dispose();
      }
    ).toDisposableLiveElement());
    const isFocused = this._userInteractionService.createFocusTracker(content.element, disposableStore);
    disposableStore.add(autorun((reader) => {
      this._focusIsInMenu.set(isFocused.read(reader), void 0);
    }));
    disposableStore.add(toDisposable(() => this._focusIsInMenu.set(false, void 0)));
    const h = this._hoverService.showInstantHover({
      target: this._iconRef.element,
      content: content.element
    });
    if (h) {
      this._hoverVisible.set(true, void 0);
      disposableStore.add(this._editorObs.editor.onDidScrollChange(() => h.dispose()));
      disposableStore.add(h.onDispose(() => {
        this._hoverVisible.set(false, void 0);
        disposableStore.dispose();
      }));
    } else {
      disposableStore.dispose();
    }
  }
};
InlineEditsGutterIndicator = __decorateClass([
  __decorateParam(6, IHoverService),
  __decorateParam(7, IInstantiationService),
  __decorateParam(8, IAccessibilityService),
  __decorateParam(9, IThemeService),
  __decorateParam(10, IUserInteractionService)
], InlineEditsGutterIndicator);
function getRotationFromDirection(direction) {
  switch (direction) {
    case "top":
      return 90;
    case "bottom":
      return -90;
    case "right":
      return 0;
  }
}
function withStyles(element, styles) {
  for (const key in styles) {
    element.style[key] = styles[key];
  }
  return element;
}
function toPx(n2) {
  return `${n2}px`;
}
export {
  InlineEditsGutterIndicator,
  InlineEditsGutterIndicatorData,
  InlineSuggestionGutterMenuData,
  SimpleInlineSuggestModel
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXGlubGluZUNvbXBsZXRpb25zXFxicm93c2VyXFx2aWV3XFxpbmxpbmVFZGl0c1xcY29tcG9uZW50c1xcZ3V0dGVySW5kaWNhdG9yVmlldy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IG4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IHJlbmRlckljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaWNvbkxhYmVsL2ljb25MYWJlbHMuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IEJ1Z0luZGljYXRpbmdFcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJT2JzZXJ2YWJsZSwgSVNldHRhYmxlT2JzZXJ2YWJsZSwgYXV0b3J1biwgY29uc3RPYnNlcnZhYmxlLCBkZWJvdW5jZWRPYnNlcnZhYmxlLCBkZXJpdmVkLCBvYnNlcnZhYmxlRnJvbUV2ZW50LCBvYnNlcnZhYmxlVmFsdWUsIHJ1bk9uQ2hhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBJQWNjZXNzaWJpbGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5L2NvbW1vbi9hY2Nlc3NpYmlsaXR5LmpzJztcbmltcG9ydCB7IElIb3ZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9ob3Zlci9icm93c2VyL2hvdmVyLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSVRoZW1lU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUVkaXRvck1vdXNlRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9icm93c2VyL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgT2JzZXJ2YWJsZUNvZGVFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9icm93c2VyL29ic2VydmFibGVDb2RlRWRpdG9yLmpzJztcbmltcG9ydCB7IFBvaW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vY29tbW9uL2NvcmUvMmQvcG9pbnQuanMnO1xuaW1wb3J0IHsgUmVjdCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2NvbW1vbi9jb3JlLzJkL3JlY3QuanMnO1xuaW1wb3J0IHsgSG92ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3ZlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSG92ZXJXaWRnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9ob3Zlci9icm93c2VyL2hvdmVyV2lkZ2V0LmpzJztcbmltcG9ydCB7IEVkaXRvck9wdGlvbiwgUmVuZGVyTGluZU51bWJlcnNUeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vY29tbW9uL2NvbmZpZy9lZGl0b3JPcHRpb25zLmpzJztcbmltcG9ydCB7IExpbmVSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2NvbW1vbi9jb3JlL3Jhbmdlcy9saW5lUmFuZ2UuanMnO1xuaW1wb3J0IHsgT2Zmc2V0UmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9jb21tb24vY29yZS9yYW5nZXMvb2Zmc2V0UmFuZ2UuanMnO1xuaW1wb3J0IHsgU3RpY2t5U2Nyb2xsQ29udHJvbGxlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3N0aWNreVNjcm9sbC9icm93c2VyL3N0aWNreVNjcm9sbENvbnRyb2xsZXIuanMnO1xuaW1wb3J0IHsgSW5saW5lRWRpdFRhYkFjdGlvbiB9IGZyb20gJy4uL2lubGluZUVkaXRzVmlld0ludGVyZmFjZS5qcyc7XG5pbXBvcnQgeyBnZXRFZGl0b3JCbGVuZGVkQ29sb3IsIElOTElORV9FRElUU19CT1JERVJfUkFESVVTLCBpbmxpbmVFZGl0SW5kaWNhdG9yQmFja2dyb3VuZCwgaW5saW5lRWRpdEluZGljYXRvclByaW1hcnlCYWNrZ3JvdW5kLCBpbmxpbmVFZGl0SW5kaWNhdG9yUHJpbWFyeUJvcmRlciwgaW5saW5lRWRpdEluZGljYXRvclByaW1hcnlGb3JlZ3JvdW5kLCBpbmxpbmVFZGl0SW5kaWNhdG9yU2Vjb25kYXJ5QmFja2dyb3VuZCwgaW5saW5lRWRpdEluZGljYXRvclNlY29uZGFyeUJvcmRlciwgaW5saW5lRWRpdEluZGljYXRvclNlY29uZGFyeUZvcmVncm91bmQsIGlubGluZUVkaXRJbmRpY2F0b3JTdWNjZXNzZnVsQmFja2dyb3VuZCwgaW5saW5lRWRpdEluZGljYXRvclN1Y2Nlc3NmdWxCb3JkZXIsIGlubGluZUVkaXRJbmRpY2F0b3JTdWNjZXNzZnVsRm9yZWdyb3VuZCB9IGZyb20gJy4uL3RoZW1lLmpzJztcbmltcG9ydCB7IG1hcE91dEZhbHN5LCByZWN0VG9Qcm9wcyB9IGZyb20gJy4uL3V0aWxzL3V0aWxzLmpzJztcbmltcG9ydCB7IEd1dHRlckluZGljYXRvck1lbnVDb250ZW50IH0gZnJvbSAnLi9ndXR0ZXJJbmRpY2F0b3JNZW51LmpzJztcbmltcG9ydCB7IGFzc2VydE5ldmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXNzZXJ0LmpzJztcbmltcG9ydCB7IENvbW1hbmQsIElubGluZUNvbXBsZXRpb25Db21tYW5kLCBJSW5saW5lQ29tcGxldGlvbk1vZGVsSW5mbyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0IHsgSW5saW5lU3VnZ2VzdGlvbkl0ZW0gfSBmcm9tICcuLi8uLi8uLi9tb2RlbC9pbmxpbmVTdWdnZXN0aW9uSXRlbS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJbmxpbmVDb21wbGV0aW9uc01vZGVsIH0gZnJvbSAnLi4vLi4vLi4vbW9kZWwvaW5saW5lQ29tcGxldGlvbnNNb2RlbC5qcyc7XG5pbXBvcnQgeyBJbmxpbmVTdWdnZXN0QWx0ZXJuYXRpdmVBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi9tb2RlbC9JbmxpbmVTdWdnZXN0QWx0ZXJuYXRpdmVBY3Rpb24uanMnO1xuaW1wb3J0IHsgYXNDc3NWYXJpYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9jb2xvclV0aWxzLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBJVXNlckludGVyYWN0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VzZXJJbnRlcmFjdGlvbi9icm93c2VyL3VzZXJJbnRlcmFjdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRXZlbnQsIEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5cbi8qKlxuICogQ3VzdG9taXphdGlvbiBvcHRpb25zIGZvciB0aGUgZ3V0dGVyIGluZGljYXRvciBhcHBlYXJhbmNlIGFuZCBiZWhhdmlvci5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBHdXR0ZXJJbmRpY2F0b3JDdXN0b21pemF0aW9uIHtcblx0LyoqIE92ZXJyaWRlIHRoZSBkZWZhdWx0IGljb24gKi9cblx0cmVhZG9ubHkgaWNvbj86IFRoZW1lSWNvbjtcbn1cblxuZXhwb3J0IGNsYXNzIElubGluZUVkaXRzR3V0dGVySW5kaWNhdG9yRGF0YSB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdHJlYWRvbmx5IGd1dHRlck1lbnVEYXRhOiBJbmxpbmVTdWdnZXN0aW9uR3V0dGVyTWVudURhdGEsXG5cdFx0cmVhZG9ubHkgb3JpZ2luYWxSYW5nZTogTGluZVJhbmdlLFxuXHRcdHJlYWRvbmx5IG1vZGVsOiBTaW1wbGVJbmxpbmVTdWdnZXN0TW9kZWwsXG5cdFx0cmVhZG9ubHkgYWx0QWN0aW9uOiBJbmxpbmVTdWdnZXN0QWx0ZXJuYXRpdmVBY3Rpb24gfCB1bmRlZmluZWQsXG5cdFx0cmVhZG9ubHkgY3VzdG9taXphdGlvbj86IEd1dHRlckluZGljYXRvckN1c3RvbWl6YXRpb24sXG5cdCkgeyB9XG59XG5cbmV4cG9ydCBjbGFzcyBJbmxpbmVTdWdnZXN0aW9uR3V0dGVyTWVudURhdGEge1xuXHRwdWJsaWMgc3RhdGljIGZyb21JbmxpbmVTdWdnZXN0aW9uKHN1Z2dlc3Rpb246IElubGluZVN1Z2dlc3Rpb25JdGVtKTogSW5saW5lU3VnZ2VzdGlvbkd1dHRlck1lbnVEYXRhIHtcblx0XHRjb25zdCBhbHRlcm5hdGl2ZUFjdGlvbiA9IHN1Z2dlc3Rpb24uYWN0aW9uPy5raW5kID09PSAnZWRpdCcgPyBzdWdnZXN0aW9uLmFjdGlvbi5hbHRlcm5hdGl2ZUFjdGlvbiA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCBjb21tYW5kcyA9IHN1Z2dlc3Rpb24uc291cmNlLmlubGluZVN1Z2dlc3Rpb25zLmNvbW1hbmRzID8/IFtdO1xuXHRcdHJldHVybiBuZXcgSW5saW5lU3VnZ2VzdGlvbkd1dHRlck1lbnVEYXRhKFxuXHRcdFx0c3VnZ2VzdGlvbi5ndXR0ZXJNZW51TGlua0FjdGlvbixcblx0XHRcdHN1Z2dlc3Rpb24uc291cmNlLnByb3ZpZGVyLmRpc3BsYXlOYW1lID8/IGxvY2FsaXplKCdpbmxpbmVTdWdnZXN0aW9uJywgXCJJbmxpbmUgU3VnZ2VzdGlvblwiKSxcblx0XHRcdGNvbW1hbmRzLmxlbmd0aCA+IDAgPyBbY29tbWFuZHNdIDogW10sXG5cdFx0XHRhbHRlcm5hdGl2ZUFjdGlvbixcblx0XHRcdHN1Z2dlc3Rpb24uc291cmNlLnByb3ZpZGVyLm1vZGVsSW5mbyxcblx0XHRcdHN1Z2dlc3Rpb24uc291cmNlLnByb3ZpZGVyLnNldE1vZGVsSWQ/LmJpbmQoc3VnZ2VzdGlvbi5zb3VyY2UucHJvdmlkZXIpLFxuXHRcdCk7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRyZWFkb25seSBhY3Rpb246IENvbW1hbmQgfCB1bmRlZmluZWQsXG5cdFx0cmVhZG9ubHkgZGlzcGxheU5hbWU6IHN0cmluZyxcblx0XHRyZWFkb25seSBleHRlbnNpb25Db21tYW5kczogSW5saW5lQ29tcGxldGlvbkNvbW1hbmRbXVtdLFxuXHRcdHJlYWRvbmx5IGFsdGVybmF0aXZlQWN0aW9uOiBJbmxpbmVTdWdnZXN0QWx0ZXJuYXRpdmVBY3Rpb24gfCB1bmRlZmluZWQsXG5cdFx0cmVhZG9ubHkgbW9kZWxJbmZvOiBJSW5saW5lQ29tcGxldGlvbk1vZGVsSW5mbyB8IHVuZGVmaW5lZCxcblx0XHRyZWFkb25seSBzZXRNb2RlbElkOiAoKG1vZGVsSWQ6IHN0cmluZykgPT4gUHJvbWlzZTx2b2lkPikgfCB1bmRlZmluZWQsXG5cdFx0cmVhZG9ubHkgZXh0ZW5zaW9uQ29tbWFuZHNPbmx5OiBib29sZWFuID0gZmFsc2UsXG5cdCkgeyB9XG59XG5cbi8vIFRPRE8gdGhpcyBjbGFzcyBkb2VzIG5vdCBtYWtlIHRoYXQgbXVjaCBzZW5zZSB5ZXQuXG5leHBvcnQgY2xhc3MgU2ltcGxlSW5saW5lU3VnZ2VzdE1vZGVsIHtcblx0cHVibGljIHN0YXRpYyBmcm9tSW5saW5lQ29tcGxldGlvbk1vZGVsKG1vZGVsOiBJbmxpbmVDb21wbGV0aW9uc01vZGVsKTogU2ltcGxlSW5saW5lU3VnZ2VzdE1vZGVsIHtcblx0XHRyZXR1cm4gbmV3IFNpbXBsZUlubGluZVN1Z2dlc3RNb2RlbChcblx0XHRcdCgpID0+IG1vZGVsLmFjY2VwdCgpLFxuXHRcdFx0KCkgPT4gbW9kZWwuanVtcCgpLFxuXHRcdCk7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRyZWFkb25seSBhY2NlcHQ6ICgpID0+IHZvaWQsXG5cdFx0cmVhZG9ubHkganVtcDogKCkgPT4gdm9pZCxcblx0KSB7IH1cbn1cblxuY29uc3QgQ09ESUNPTl9TSVpFX1BYID0gMTY7XG5jb25zdCBDT0RJQ09OX1BBRERJTkdfUFggPSAyO1xuXG5leHBvcnQgY2xhc3MgSW5saW5lRWRpdHNHdXR0ZXJJbmRpY2F0b3IgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENsb3NlV2l0aENvbW1hbmQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxzdHJpbmc+KCkpO1xuXHRyZWFkb25seSBvbkRpZENsb3NlV2l0aENvbW1hbmQ6IEV2ZW50PHN0cmluZz4gPSB0aGlzLl9vbkRpZENsb3NlV2l0aENvbW1hbmQuZXZlbnQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZWRpdG9yT2JzOiBPYnNlcnZhYmxlQ29kZUVkaXRvcixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9kYXRhOiBJT2JzZXJ2YWJsZTxJbmxpbmVFZGl0c0d1dHRlckluZGljYXRvckRhdGEgfCB1bmRlZmluZWQ+LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3RhYkFjdGlvbjogSU9ic2VydmFibGU8SW5saW5lRWRpdFRhYkFjdGlvbj4sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfdmVydGljYWxPZmZzZXQ6IElPYnNlcnZhYmxlPG51bWJlcj4sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfaXNIb3ZlcmluZ092ZXJJbmxpbmVFZGl0OiBJT2JzZXJ2YWJsZTxib29sZWFuPixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9mb2N1c0lzSW5NZW51OiBJU2V0dGFibGVPYnNlcnZhYmxlPGJvb2xlYW4+LFxuXG5cdFx0QElIb3ZlclNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IF9ob3ZlclNlcnZpY2U6IEhvdmVyU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2luc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElBY2Nlc3NpYmlsaXR5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9hY2Nlc3NpYmlsaXR5U2VydmljZTogSUFjY2Vzc2liaWxpdHlTZXJ2aWNlLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3RoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASVVzZXJJbnRlcmFjdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdXNlckludGVyYWN0aW9uU2VydmljZTogSVVzZXJJbnRlcmFjdGlvblNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX29yaWdpbmFsUmFuZ2VPYnMgPSBtYXBPdXRGYWxzeSh0aGlzLl9kYXRhLm1hcChkID0+IGQ/Lm9yaWdpbmFsUmFuZ2UpKTtcblxuXHRcdHRoaXMuX3N0aWNreVNjcm9sbENvbnRyb2xsZXIgPSBTdGlja3lTY3JvbGxDb250cm9sbGVyLmdldCh0aGlzLl9lZGl0b3JPYnMuZWRpdG9yKTtcblx0XHR0aGlzLl9zdGlja3lTY3JvbGxIZWlnaHQgPSB0aGlzLl9zdGlja3lTY3JvbGxDb250cm9sbGVyXG5cdFx0XHQ/IG9ic2VydmFibGVGcm9tRXZlbnQodGhpcy5fc3RpY2t5U2Nyb2xsQ29udHJvbGxlci5vbkRpZENoYW5nZVN0aWNreVNjcm9sbEhlaWdodCwgKCkgPT4gdGhpcy5fc3RpY2t5U2Nyb2xsQ29udHJvbGxlciEuc3RpY2t5U2Nyb2xsV2lkZ2V0SGVpZ2h0KVxuXHRcdFx0OiBjb25zdE9ic2VydmFibGUoMCk7XG5cblx0XHR0aGlzLl9pc0hvdmVyZWRPdmVySW5saW5lRWRpdERlYm91bmNlZCA9IGRlYm91bmNlZE9ic2VydmFibGUodGhpcy5faXNIb3ZlcmluZ092ZXJJbmxpbmVFZGl0LCAxMDApO1xuXG5cdFx0Y29uc3QgaW5kaWNhdG9yID0gdGhpcy5faW5kaWNhdG9yLmtlZXBVcGRhdGVkKHRoaXMuX3N0b3JlKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2VkaXRvck9icy5jcmVhdGVPdmVybGF5V2lkZ2V0KHtcblx0XHRcdGRvbU5vZGU6IGluZGljYXRvci5lbGVtZW50LFxuXHRcdFx0cG9zaXRpb246IGNvbnN0T2JzZXJ2YWJsZShudWxsKSxcblx0XHRcdGFsbG93RWRpdG9yT3ZlcmZsb3c6IGZhbHNlLFxuXHRcdFx0bWluQ29udGVudFdpZHRoSW5QeDogY29uc3RPYnNlcnZhYmxlKDApLFxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2VkaXRvck9icy5lZGl0b3Iub25Nb3VzZU1vdmUoKGU6IElFZGl0b3JNb3VzZUV2ZW50KSA9PiB7XG5cdFx0XHRjb25zdCBzdGF0ZSA9IHRoaXMuX3N0YXRlLmdldCgpO1xuXHRcdFx0aWYgKHN0YXRlID09PSB1bmRlZmluZWQpIHsgcmV0dXJuOyB9XG5cblx0XHRcdGNvbnN0IGVsID0gdGhpcy5faWNvblJlZi5lbGVtZW50O1xuXHRcdFx0Y29uc3QgcmVjdCA9IGVsLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuXHRcdFx0Y29uc3QgcmVjdGFuZ3VsYXJBcmVhID0gUmVjdC5mcm9tTGVmdFRvcFdpZHRoSGVpZ2h0KHJlY3QubGVmdCwgcmVjdC50b3AsIHJlY3Qud2lkdGgsIHJlY3QuaGVpZ2h0KTtcblx0XHRcdGNvbnN0IHBvaW50ID0gbmV3IFBvaW50KGUuZXZlbnQucG9zeCwgZS5ldmVudC5wb3N5KTtcblx0XHRcdHRoaXMuX2lzSG92ZXJlZE92ZXJJY29uLnNldChyZWN0YW5ndWxhckFyZWEuY29udGFpbnNQb2ludChwb2ludCksIHVuZGVmaW5lZCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fZWRpdG9yT2JzLmVkaXRvci5vbkRpZFNjcm9sbENoYW5nZSgoKSA9PiB7XG5cdFx0XHR0aGlzLl9pc0hvdmVyZWRPdmVySWNvbi5zZXQoZmFsc2UsIHVuZGVmaW5lZCk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gcHVsc2UgYW5pbWF0aW9uIHdoZW4gaG92ZXJpbmcgaW5saW5lIGVkaXRcblx0XHR0aGlzLl9yZWdpc3RlcihydW5PbkNoYW5nZSh0aGlzLl9pc0hvdmVyZWRPdmVySW5saW5lRWRpdERlYm91bmNlZCwgKGlzSG92ZXJpbmcpID0+IHtcblx0XHRcdGlmIChpc0hvdmVyaW5nKSB7XG5cdFx0XHRcdHRoaXMudHJpZ2dlckFuaW1hdGlvbigpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGluZGljYXRvci5yZWFkRWZmZWN0KHJlYWRlcik7XG5cdFx0XHRpZiAoaW5kaWNhdG9yLmVsZW1lbnQpIHtcblx0XHRcdFx0Ly8gRm9yIHRoZSBsaW5lIG51bWJlclxuXHRcdFx0XHR0aGlzLl9lZGl0b3JPYnMuZWRpdG9yLmFwcGx5Rm9udEluZm8oaW5kaWNhdG9yLmVsZW1lbnQpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2lzSG92ZXJlZE92ZXJJbmxpbmVFZGl0RGVib3VuY2VkOiBJT2JzZXJ2YWJsZTxib29sZWFuPjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9tb2RpZmllclByZXNzZWQgPSBkZXJpdmVkKHRoaXMsIHJlYWRlciA9PlxuXHRcdHRoaXMuX3VzZXJJbnRlcmFjdGlvblNlcnZpY2UucmVhZE1vZGlmaWVyS2V5U3RhdHVzKHRoaXMuX2VkaXRvck9icy5lZGl0b3IuZ2V0RG9tTm9kZSgpISwgcmVhZGVyKS5zaGlmdEtleVxuXHQpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9ndXR0ZXJJbmRpY2F0b3JTdHlsZXMgPSBkZXJpdmVkKHRoaXMsIHJlYWRlciA9PiB7XG5cdFx0bGV0IHYgPSB0aGlzLl90YWJBY3Rpb24ucmVhZChyZWFkZXIpO1xuXG5cdFx0Ly8gVE9ETzogYWRkIHNvdXJjZSBvZiB0cnV0aCBmb3IgYWx0IGFjdGlvbiBhY3RpdmUgYW5kIGtleSBwcmVzc2VkXG5cdFx0Y29uc3QgYWx0QWN0aW9uID0gdGhpcy5fZGF0YS5yZWFkKHJlYWRlcik/LmFsdEFjdGlvbjtcblx0XHRjb25zdCBtb2RpZmllZFByZXNzZWQgPSB0aGlzLl9tb2RpZmllclByZXNzZWQucmVhZChyZWFkZXIpO1xuXHRcdGlmIChhbHRBY3Rpb24gJiYgbW9kaWZpZWRQcmVzc2VkKSB7XG5cdFx0XHR2ID0gSW5saW5lRWRpdFRhYkFjdGlvbi5JbmFjdGl2ZTtcblx0XHR9XG5cblx0XHRzd2l0Y2ggKHYpIHtcblx0XHRcdGNhc2UgSW5saW5lRWRpdFRhYkFjdGlvbi5JbmFjdGl2ZTogcmV0dXJuIHtcblx0XHRcdFx0YmFja2dyb3VuZDogZ2V0RWRpdG9yQmxlbmRlZENvbG9yKGlubGluZUVkaXRJbmRpY2F0b3JTZWNvbmRhcnlCYWNrZ3JvdW5kLCB0aGlzLl90aGVtZVNlcnZpY2UpLnJlYWQocmVhZGVyKS50b1N0cmluZygpLFxuXHRcdFx0XHRmb3JlZ3JvdW5kOiBnZXRFZGl0b3JCbGVuZGVkQ29sb3IoaW5saW5lRWRpdEluZGljYXRvclNlY29uZGFyeUZvcmVncm91bmQsIHRoaXMuX3RoZW1lU2VydmljZSkucmVhZChyZWFkZXIpLnRvU3RyaW5nKCksXG5cdFx0XHRcdGJvcmRlcjogZ2V0RWRpdG9yQmxlbmRlZENvbG9yKGlubGluZUVkaXRJbmRpY2F0b3JTZWNvbmRhcnlCb3JkZXIsIHRoaXMuX3RoZW1lU2VydmljZSkucmVhZChyZWFkZXIpLnRvU3RyaW5nKCksXG5cdFx0XHR9O1xuXHRcdFx0Y2FzZSBJbmxpbmVFZGl0VGFiQWN0aW9uLkp1bXA6IHJldHVybiB7XG5cdFx0XHRcdGJhY2tncm91bmQ6IGdldEVkaXRvckJsZW5kZWRDb2xvcihpbmxpbmVFZGl0SW5kaWNhdG9yUHJpbWFyeUJhY2tncm91bmQsIHRoaXMuX3RoZW1lU2VydmljZSkucmVhZChyZWFkZXIpLnRvU3RyaW5nKCksXG5cdFx0XHRcdGZvcmVncm91bmQ6IGdldEVkaXRvckJsZW5kZWRDb2xvcihpbmxpbmVFZGl0SW5kaWNhdG9yUHJpbWFyeUZvcmVncm91bmQsIHRoaXMuX3RoZW1lU2VydmljZSkucmVhZChyZWFkZXIpLnRvU3RyaW5nKCksXG5cdFx0XHRcdGJvcmRlcjogZ2V0RWRpdG9yQmxlbmRlZENvbG9yKGlubGluZUVkaXRJbmRpY2F0b3JQcmltYXJ5Qm9yZGVyLCB0aGlzLl90aGVtZVNlcnZpY2UpLnJlYWQocmVhZGVyKS50b1N0cmluZygpXG5cdFx0XHR9O1xuXHRcdFx0Y2FzZSBJbmxpbmVFZGl0VGFiQWN0aW9uLkFjY2VwdDogcmV0dXJuIHtcblx0XHRcdFx0YmFja2dyb3VuZDogZ2V0RWRpdG9yQmxlbmRlZENvbG9yKGlubGluZUVkaXRJbmRpY2F0b3JTdWNjZXNzZnVsQmFja2dyb3VuZCwgdGhpcy5fdGhlbWVTZXJ2aWNlKS5yZWFkKHJlYWRlcikudG9TdHJpbmcoKSxcblx0XHRcdFx0Zm9yZWdyb3VuZDogZ2V0RWRpdG9yQmxlbmRlZENvbG9yKGlubGluZUVkaXRJbmRpY2F0b3JTdWNjZXNzZnVsRm9yZWdyb3VuZCwgdGhpcy5fdGhlbWVTZXJ2aWNlKS5yZWFkKHJlYWRlcikudG9TdHJpbmcoKSxcblx0XHRcdFx0Ym9yZGVyOiBnZXRFZGl0b3JCbGVuZGVkQ29sb3IoaW5saW5lRWRpdEluZGljYXRvclN1Y2Nlc3NmdWxCb3JkZXIsIHRoaXMuX3RoZW1lU2VydmljZSkucmVhZChyZWFkZXIpLnRvU3RyaW5nKClcblx0XHRcdH07XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRhc3NlcnROZXZlcih2KTtcblx0XHR9XG5cdH0pO1xuXG5cdHB1YmxpYyB0cmlnZ2VyQW5pbWF0aW9uKCk6IFByb21pc2U8QW5pbWF0aW9uPiB7XG5cdFx0aWYgKHRoaXMuX2FjY2Vzc2liaWxpdHlTZXJ2aWNlLmlzTW90aW9uUmVkdWNlZCgpKSB7XG5cdFx0XHRyZXR1cm4gbmV3IEFuaW1hdGlvbihudWxsLCBudWxsKS5maW5pc2hlZDtcblx0XHR9XG5cblx0XHQvLyBQVUxTRSBBTklNQVRJT046XG5cdFx0Y29uc3QgYW5pbWF0aW9uID0gdGhpcy5faWNvblJlZi5lbGVtZW50LmFuaW1hdGUoW1xuXHRcdFx0e1xuXHRcdFx0XHRvdXRsaW5lOiBgMnB4IHNvbGlkICR7dGhpcy5fZ3V0dGVySW5kaWNhdG9yU3R5bGVzLm1hcCh2ID0+IHYuYm9yZGVyKS5nZXQoKX1gLFxuXHRcdFx0XHRvdXRsaW5lT2Zmc2V0OiAnLTFweCcsXG5cdFx0XHRcdG9mZnNldDogMFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0b3V0bGluZTogYDJweCBzb2xpZCB0cmFuc3BhcmVudGAsXG5cdFx0XHRcdG91dGxpbmVPZmZzZXQ6ICcxMHB4Jyxcblx0XHRcdFx0b2Zmc2V0OiAxXG5cdFx0XHR9LFxuXHRcdF0sIHsgZHVyYXRpb246IDUwMCB9KTtcblxuXHRcdHJldHVybiBhbmltYXRpb24uZmluaXNoZWQ7XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vcmlnaW5hbFJhbmdlT2JzO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3N0YXRlID0gZGVyaXZlZCh0aGlzLCByZWFkZXIgPT4ge1xuXHRcdGNvbnN0IHJhbmdlID0gdGhpcy5fb3JpZ2luYWxSYW5nZU9icy5yZWFkKHJlYWRlcik7XG5cdFx0aWYgKCFyYW5nZSkgeyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cdFx0cmV0dXJuIHtcblx0XHRcdHJhbmdlLFxuXHRcdFx0bGluZU9mZnNldFJhbmdlOiB0aGlzLl9lZGl0b3JPYnMub2JzZXJ2ZUxpbmVPZmZzZXRSYW5nZShyYW5nZSwgcmVhZGVyLnN0b3JlKSxcblx0XHR9O1xuXHR9KTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9zdGlja3lTY3JvbGxDb250cm9sbGVyO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zdGlja3lTY3JvbGxIZWlnaHQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfbGluZU51bWJlclRvUmVuZGVyID0gZGVyaXZlZCh0aGlzLCByZWFkZXIgPT4ge1xuXHRcdGlmICh0aGlzLl92ZXJ0aWNhbE9mZnNldC5yZWFkKHJlYWRlcikgIT09IDApIHtcblx0XHRcdHJldHVybiAnJztcblx0XHR9XG5cblx0XHRjb25zdCBsaW5lTnVtYmVyID0gdGhpcy5fZGF0YS5yZWFkKHJlYWRlcik/Lm9yaWdpbmFsUmFuZ2Uuc3RhcnRMaW5lTnVtYmVyO1xuXHRcdGNvbnN0IGxpbmVOdW1iZXJPcHRpb25zID0gdGhpcy5fZWRpdG9yT2JzLmdldE9wdGlvbihFZGl0b3JPcHRpb24ubGluZU51bWJlcnMpLnJlYWQocmVhZGVyKTtcblxuXHRcdGlmIChsaW5lTnVtYmVyID09PSB1bmRlZmluZWQgfHwgbGluZU51bWJlck9wdGlvbnMucmVuZGVyVHlwZSA9PT0gUmVuZGVyTGluZU51bWJlcnNUeXBlLk9mZikge1xuXHRcdFx0cmV0dXJuICcnO1xuXHRcdH1cblxuXHRcdGlmIChsaW5lTnVtYmVyT3B0aW9ucy5yZW5kZXJUeXBlID09PSBSZW5kZXJMaW5lTnVtYmVyc1R5cGUuSW50ZXJ2YWwpIHtcblx0XHRcdGNvbnN0IGN1cnNvclBvc2l0aW9uID0gdGhpcy5fZWRpdG9yT2JzLmN1cnNvclBvc2l0aW9uLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmIChsaW5lTnVtYmVyICUgMTAgPT09IDAgfHwgY3Vyc29yUG9zaXRpb24gJiYgY3Vyc29yUG9zaXRpb24ubGluZU51bWJlciA9PT0gbGluZU51bWJlcikge1xuXHRcdFx0XHRyZXR1cm4gbGluZU51bWJlci50b1N0cmluZygpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuICcnO1xuXHRcdH1cblxuXHRcdGlmIChsaW5lTnVtYmVyT3B0aW9ucy5yZW5kZXJUeXBlID09PSBSZW5kZXJMaW5lTnVtYmVyc1R5cGUuUmVsYXRpdmUpIHtcblx0XHRcdGNvbnN0IGN1cnNvclBvc2l0aW9uID0gdGhpcy5fZWRpdG9yT2JzLmN1cnNvclBvc2l0aW9uLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmICghY3Vyc29yUG9zaXRpb24pIHtcblx0XHRcdFx0cmV0dXJuICcnO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcmVsYXRpdmVMaW5lTnVtYmVyID0gTWF0aC5hYnMobGluZU51bWJlciAtIGN1cnNvclBvc2l0aW9uLmxpbmVOdW1iZXIpO1xuXHRcdFx0aWYgKHJlbGF0aXZlTGluZU51bWJlciA9PT0gMCkge1xuXHRcdFx0XHRyZXR1cm4gbGluZU51bWJlci50b1N0cmluZygpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHJlbGF0aXZlTGluZU51bWJlci50b1N0cmluZygpO1xuXHRcdH1cblxuXHRcdGlmIChsaW5lTnVtYmVyT3B0aW9ucy5yZW5kZXJUeXBlID09PSBSZW5kZXJMaW5lTnVtYmVyc1R5cGUuQ3VzdG9tKSB7XG5cdFx0XHRpZiAobGluZU51bWJlck9wdGlvbnMucmVuZGVyRm4pIHtcblx0XHRcdFx0cmV0dXJuIGxpbmVOdW1iZXJPcHRpb25zLnJlbmRlckZuKGxpbmVOdW1iZXIpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuICcnO1xuXHRcdH1cblxuXHRcdHJldHVybiBsaW5lTnVtYmVyLnRvU3RyaW5nKCk7XG5cdH0pO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2F2YWlsYWJsZVdpZHRoRm9ySWNvbiA9IGRlcml2ZWQodGhpcywgcmVhZGVyID0+IHtcblx0XHRjb25zdCB0ZXh0TW9kZWwgPSB0aGlzLl9lZGl0b3JPYnMuZWRpdG9yLmdldE1vZGVsKCk7XG5cdFx0Y29uc3QgZWRpdG9yID0gdGhpcy5fZWRpdG9yT2JzLmVkaXRvcjtcblx0XHRjb25zdCBsYXlvdXQgPSB0aGlzLl9lZGl0b3JPYnMubGF5b3V0SW5mby5yZWFkKHJlYWRlcik7XG5cdFx0Y29uc3QgZ3V0dGVyV2lkdGggPSBsYXlvdXQuZGVjb3JhdGlvbnNMZWZ0ICsgbGF5b3V0LmRlY29yYXRpb25zV2lkdGggLSBsYXlvdXQuZ2x5cGhNYXJnaW5MZWZ0O1xuXG5cdFx0aWYgKCF0ZXh0TW9kZWwgfHwgZ3V0dGVyV2lkdGggPD0gMCkge1xuXHRcdFx0cmV0dXJuICgpID0+IDA7XG5cdFx0fVxuXG5cdFx0Ly8gbm8gZ2x5cGggbWFyZ2luID0+IHRoZSBlbnRpcmUgZ3V0dGVyIHdpZHRoIGlzIGF2YWlsYWJsZSBhcyB0aGVyZSBpcyBubyBvcHRpbWFsIHBsYWNlIHRvIHB1dCB0aGUgaWNvblxuXHRcdGlmIChsYXlvdXQubGluZU51bWJlcnNMZWZ0ID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gKCkgPT4gZ3V0dGVyV2lkdGg7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbGluZU51bWJlck9wdGlvbnMgPSB0aGlzLl9lZGl0b3JPYnMuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5saW5lTnVtYmVycykucmVhZChyZWFkZXIpO1xuXHRcdGlmIChsaW5lTnVtYmVyT3B0aW9ucy5yZW5kZXJUeXBlID09PSBSZW5kZXJMaW5lTnVtYmVyc1R5cGUuUmVsYXRpdmUgfHwgLyogbGlrZWx5IHRvIGZsaWNrZXIgKi9cblx0XHRcdGxpbmVOdW1iZXJPcHRpb25zLnJlbmRlclR5cGUgPT09IFJlbmRlckxpbmVOdW1iZXJzVHlwZS5PZmYpIHtcblx0XHRcdHJldHVybiAoKSA9PiBndXR0ZXJXaWR0aDtcblx0XHR9XG5cblx0XHRjb25zdCB3ID0gZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24uZm9udEluZm8pLnR5cGljYWxIYWxmd2lkdGhDaGFyYWN0ZXJXaWR0aDtcblx0XHRjb25zdCByaWdodE9mTGluZU51bWJlciA9IGxheW91dC5saW5lTnVtYmVyc0xlZnQgKyBsYXlvdXQubGluZU51bWJlcnNXaWR0aDtcblx0XHRjb25zdCB0b3RhbExpbmVzID0gdGV4dE1vZGVsLmdldExpbmVDb3VudCgpO1xuXHRcdGNvbnN0IHRvdGFsTGluZXNEaWdpdHMgPSAodG90YWxMaW5lcyArIDEgLyogMCBiYXNlZCB0byAxIGJhc2VkKi8pLnRvU3RyaW5nKCkubGVuZ3RoO1xuXG5cdFx0Y29uc3Qgb2Zmc2V0RGlnaXRzOiB7XG5cdFx0XHRmaXJzdExpbmVOdW1iZXJXaXRoRGlnaXRDb3VudDogbnVtYmVyO1xuXHRcdFx0dG9wT2ZMaW5lTnVtYmVyOiBudW1iZXI7XG5cdFx0XHR1c2FibGVXaWR0aExlZnRPZkxpbmVOdW1iZXI6IG51bWJlcjtcblx0XHR9W10gPSBbXTtcblxuXHRcdC8vIFdlIG9ubHkgbmVlZCB0byBwcmUgY29tcHV0ZSB0aGUgdXNhYmxlIHdpZHRoIGxlZnQgb2YgdGhlIGxpbmUgbnVtYmVyIGZvciB0aGUgZmlyc3QgbGluZSBudW1iZXIgd2l0aCBhIGdpdmVuIGRpZ2l0IGNvdW50XG5cdFx0Zm9yIChsZXQgZGlnaXRzID0gMTsgZGlnaXRzIDw9IHRvdGFsTGluZXNEaWdpdHM7IGRpZ2l0cysrKSB7XG5cdFx0XHRjb25zdCBmaXJzdExpbmVOdW1iZXJXaXRoRGlnaXRDb3VudCA9IDEwICoqIChkaWdpdHMgLSAxKTtcblx0XHRcdGNvbnN0IHRvcE9mTGluZU51bWJlciA9IGVkaXRvci5nZXRUb3BGb3JMaW5lTnVtYmVyKGZpcnN0TGluZU51bWJlcldpdGhEaWdpdENvdW50KTtcblx0XHRcdGNvbnN0IGRpZ2l0c1dpZHRoID0gZGlnaXRzICogdztcblx0XHRcdGNvbnN0IHVzYWJsZVdpZHRoTGVmdE9mTGluZU51bWJlciA9IE1hdGgubWluKGd1dHRlcldpZHRoLCBNYXRoLm1heCgwLCByaWdodE9mTGluZU51bWJlciAtIGRpZ2l0c1dpZHRoIC0gbGF5b3V0LmdseXBoTWFyZ2luTGVmdCkpO1xuXHRcdFx0b2Zmc2V0RGlnaXRzLnB1c2goeyBmaXJzdExpbmVOdW1iZXJXaXRoRGlnaXRDb3VudCwgdG9wT2ZMaW5lTnVtYmVyLCB1c2FibGVXaWR0aExlZnRPZkxpbmVOdW1iZXIgfSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuICh0b3BPZmZzZXQ6IG51bWJlcikgPT4ge1xuXHRcdFx0Zm9yIChsZXQgaSA9IG9mZnNldERpZ2l0cy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuXHRcdFx0XHRpZiAodG9wT2Zmc2V0ID49IG9mZnNldERpZ2l0c1tpXS50b3BPZkxpbmVOdW1iZXIpIHtcblx0XHRcdFx0XHRyZXR1cm4gb2Zmc2V0RGlnaXRzW2ldLnVzYWJsZVdpZHRoTGVmdE9mTGluZU51bWJlcjtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0dGhyb3cgbmV3IEJ1Z0luZGljYXRpbmdFcnJvcignQ291bGQgbm90IGZpbmQgYXZpbGFibGUgd2lkdGggZm9yIGljb24nKTtcblx0XHR9O1xuXHR9KTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9sYXlvdXQgPSBkZXJpdmVkKHRoaXMsIHJlYWRlciA9PiB7XG5cdFx0Y29uc3QgcyA9IHRoaXMuX3N0YXRlLnJlYWQocmVhZGVyKTtcblx0XHRpZiAoIXMpIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXG5cdFx0Y29uc3QgbGF5b3V0ID0gdGhpcy5fZWRpdG9yT2JzLmxheW91dEluZm8ucmVhZChyZWFkZXIpO1xuXG5cdFx0Y29uc3QgbGluZUhlaWdodCA9IHRoaXMuX2VkaXRvck9icy5vYnNlcnZlTGluZUhlaWdodEZvckxpbmUocy5yYW5nZS5tYXAociA9PiByLnN0YXJ0TGluZU51bWJlcikpLnJlYWQocmVhZGVyKTtcblx0XHRjb25zdCBndXR0ZXJWaWV3UG9ydFBhZGRpbmdMZWZ0ID0gMTtcblx0XHRjb25zdCBndXR0ZXJWaWV3UG9ydFBhZGRpbmdUb3AgPSAyO1xuXG5cdFx0Ly8gRW50aXJlIGd1dHRlciB2aWV3IGZyb20gdG9wIGxlZnQgdG8gYm90dG9tIHJpZ2h0XG5cdFx0Y29uc3QgZ3V0dGVyV2lkdGhXaXRob3V0UGFkZGluZyA9IGxheW91dC5kZWNvcmF0aW9uc0xlZnQgKyBsYXlvdXQuZGVjb3JhdGlvbnNXaWR0aCAtIGxheW91dC5nbHlwaE1hcmdpbkxlZnQgLSAyICogZ3V0dGVyVmlld1BvcnRQYWRkaW5nTGVmdDtcblx0XHRjb25zdCBndXR0ZXJIZWlnaHRXaXRob3V0UGFkZGluZyA9IGxheW91dC5oZWlnaHQgLSAyICogZ3V0dGVyVmlld1BvcnRQYWRkaW5nVG9wO1xuXHRcdGNvbnN0IGd1dHRlclZpZXdQb3J0V2l0aFN0aWNreVNjcm9sbCA9IFJlY3QuZnJvbUxlZnRUb3BXaWR0aEhlaWdodChndXR0ZXJWaWV3UG9ydFBhZGRpbmdMZWZ0LCBndXR0ZXJWaWV3UG9ydFBhZGRpbmdUb3AsIGd1dHRlcldpZHRoV2l0aG91dFBhZGRpbmcsIGd1dHRlckhlaWdodFdpdGhvdXRQYWRkaW5nKTtcblx0XHRjb25zdCBndXR0ZXJWaWV3UG9ydFdpdGhvdXRTdGlja3lTY3JvbGxXaXRob3V0UGFkZGluZ1RvcCA9IGd1dHRlclZpZXdQb3J0V2l0aFN0aWNreVNjcm9sbC53aXRoVG9wKHRoaXMuX3N0aWNreVNjcm9sbEhlaWdodC5yZWFkKHJlYWRlcikpO1xuXHRcdGNvbnN0IGd1dHRlclZpZXdQb3J0V2l0aG91dFN0aWNreVNjcm9sbCA9IGd1dHRlclZpZXdQb3J0V2l0aFN0aWNreVNjcm9sbC53aXRoVG9wKGd1dHRlclZpZXdQb3J0V2l0aG91dFN0aWNreVNjcm9sbFdpdGhvdXRQYWRkaW5nVG9wLnRvcCArIGd1dHRlclZpZXdQb3J0UGFkZGluZ1RvcCk7XG5cblx0XHQvLyBUaGUgZ2x5cGggbWFyZ2luIGFyZWEgYWNyb3NzIGFsbCByZWxldmFudCBsaW5lc1xuXHRcdGNvbnN0IHZlcnRpY2FsRWRpdFJhbmdlID0gcy5saW5lT2Zmc2V0UmFuZ2UucmVhZChyZWFkZXIpO1xuXHRcdGNvbnN0IGd1dHRlckVkaXRBcmVhID0gUmVjdC5mcm9tUmFuZ2VzKE9mZnNldFJhbmdlLmZyb21UbyhndXR0ZXJWaWV3UG9ydFdpdGhvdXRTdGlja3lTY3JvbGwubGVmdCwgZ3V0dGVyVmlld1BvcnRXaXRob3V0U3RpY2t5U2Nyb2xsLnJpZ2h0KSwgdmVydGljYWxFZGl0UmFuZ2UpO1xuXG5cdFx0Ly8gVGhlIGd1dHRlciB2aWV3IGNvbnRhaW5lciAocGlsbClcblx0XHRjb25zdCBwaWxsSGVpZ2h0ID0gbGluZUhlaWdodDtcblx0XHRjb25zdCBwaWxsT2Zmc2V0ID0gdGhpcy5fdmVydGljYWxPZmZzZXQucmVhZChyZWFkZXIpO1xuXHRcdGNvbnN0IHBpbGxGdWxseURvY2tlZFJlY3QgPSBndXR0ZXJFZGl0QXJlYS53aXRoSGVpZ2h0KHBpbGxIZWlnaHQpLnRyYW5zbGF0ZVkocGlsbE9mZnNldCk7XG5cdFx0Y29uc3QgcGlsbElzRnVsbHlEb2NrZWQgPSBndXR0ZXJWaWV3UG9ydFdpdGhvdXRTdGlja3lTY3JvbGxXaXRob3V0UGFkZGluZ1RvcC5jb250YWluc1JlY3QocGlsbEZ1bGx5RG9ja2VkUmVjdCk7XG5cblx0XHQvLyBUaGUgaWNvbiB3aGljaCB3aWxsIGJlIHJlbmRlcmVkIGluIHRoZSBwaWxsXG5cdFx0Y29uc3QgY3VzdG9tSWNvbiA9IHRoaXMuX2RhdGEucmVhZChyZWFkZXIpPy5jdXN0b21pemF0aW9uPy5pY29uO1xuXHRcdGNvbnN0IGljb25Ob25lRG9ja2VkID0gY3VzdG9tSWNvblxuXHRcdFx0PyBjb25zdE9ic2VydmFibGUoY3VzdG9tSWNvbilcblx0XHRcdDogdGhpcy5fdGFiQWN0aW9uLm1hcChhY3Rpb24gPT4gYWN0aW9uID09PSBJbmxpbmVFZGl0VGFiQWN0aW9uLkFjY2VwdCA/IENvZGljb24ua2V5Ym9hcmRUYWIgOiBDb2RpY29uLmFycm93UmlnaHQpO1xuXHRcdGNvbnN0IGljb25Eb2NrZWQgPSBjdXN0b21JY29uXG5cdFx0XHQ/IGNvbnN0T2JzZXJ2YWJsZShjdXN0b21JY29uKVxuXHRcdFx0OiBkZXJpdmVkKHRoaXMsIHJlYWRlciA9PiB7XG5cdFx0XHRcdGlmICh0aGlzLl9pc0hvdmVyZWRPdmVySWNvbkRlYm91bmNlZC5yZWFkKHJlYWRlcikgfHwgdGhpcy5faXNIb3ZlcmVkT3ZlcklubGluZUVkaXREZWJvdW5jZWQucmVhZChyZWFkZXIpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIENvZGljb24uY2hlY2s7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHRoaXMuX3RhYkFjdGlvbi5yZWFkKHJlYWRlcikgPT09IElubGluZUVkaXRUYWJBY3Rpb24uQWNjZXB0KSB7XG5cdFx0XHRcdFx0cmV0dXJuIENvZGljb24ua2V5Ym9hcmRUYWI7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgY3Vyc29yTGluZU51bWJlciA9IHRoaXMuX2VkaXRvck9icy5jdXJzb3JMaW5lTnVtYmVyLnJlYWQocmVhZGVyKSA/PyAwO1xuXHRcdFx0XHRjb25zdCBlZGl0U3RhcnRMaW5lTnVtYmVyID0gcy5yYW5nZS5yZWFkKHJlYWRlcikuc3RhcnRMaW5lTnVtYmVyO1xuXHRcdFx0XHRyZXR1cm4gY3Vyc29yTGluZU51bWJlciA8PSBlZGl0U3RhcnRMaW5lTnVtYmVyID8gQ29kaWNvbi5rZXlib2FyZFRhYkFib3ZlIDogQ29kaWNvbi5rZXlib2FyZFRhYkJlbG93O1xuXHRcdFx0fSk7XG5cblx0XHRjb25zdCBpZGVhbEljb25BcmVhV2lkdGggPSAyMjtcblx0XHRjb25zdCBpY29uV2lkdGggPSAocGlsbFJlY3Q6IFJlY3QpID0+IHtcblx0XHRcdGNvbnN0IGF2YWlsYWJsZUljb25BcmVhV2lkdGggPSB0aGlzLl9hdmFpbGFibGVXaWR0aEZvckljb24ucmVhZCh1bmRlZmluZWQpKHBpbGxSZWN0LmJvdHRvbSArIHRoaXMuX2VkaXRvck9icy5lZGl0b3IuZ2V0U2Nyb2xsVG9wKCkpIC0gZ3V0dGVyVmlld1BvcnRQYWRkaW5nTGVmdDtcblx0XHRcdHJldHVybiBNYXRoLm1heChNYXRoLm1pbihhdmFpbGFibGVJY29uQXJlYVdpZHRoLCBpZGVhbEljb25BcmVhV2lkdGgpLCBDT0RJQ09OX1NJWkVfUFgpO1xuXHRcdH07XG5cblx0XHRpZiAocGlsbElzRnVsbHlEb2NrZWQpIHtcblx0XHRcdGNvbnN0IHBpbGxSZWN0ID0gcGlsbEZ1bGx5RG9ja2VkUmVjdDtcblxuXHRcdFx0bGV0IHdpZHRoVW50aWxMaW5lTnVtYmVyRW5kO1xuXHRcdFx0aWYgKGxheW91dC5saW5lTnVtYmVyc1dpZHRoID09PSAwKSB7XG5cdFx0XHRcdHdpZHRoVW50aWxMaW5lTnVtYmVyRW5kID0gTWF0aC5tYXgoMCwgTWF0aC5taW4oTWF0aC5tYXgobGF5b3V0LmxpbmVOdW1iZXJzTGVmdCAtIGd1dHRlclZpZXdQb3J0V2l0aFN0aWNreVNjcm9sbC5sZWZ0LCAwKSwgcGlsbFJlY3Qud2lkdGggLSBpZGVhbEljb25BcmVhV2lkdGgpKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHdpZHRoVW50aWxMaW5lTnVtYmVyRW5kID0gTWF0aC5tYXgobGF5b3V0LmxpbmVOdW1iZXJzTGVmdCArIGxheW91dC5saW5lTnVtYmVyc1dpZHRoIC0gZ3V0dGVyVmlld1BvcnRXaXRoU3RpY2t5U2Nyb2xsLmxlZnQsIDApO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBsaW5lTnVtYmVyUmVjdCA9IHBpbGxSZWN0LndpdGhXaWR0aCh3aWR0aFVudGlsTGluZU51bWJlckVuZCk7XG5cdFx0XHRjb25zdCBtaW5pbWFsSWNvbldpZHRoV2l0aFBhZGRpbmcgPSBDT0RJQ09OX1NJWkVfUFggKyBDT0RJQ09OX1BBRERJTkdfUFg7XG5cdFx0XHRjb25zdCBpY29uV2lkdGggPSBNYXRoLm1pbihwaWxsUmVjdC53aWR0aCAtIHdpZHRoVW50aWxMaW5lTnVtYmVyRW5kLCBpZGVhbEljb25BcmVhV2lkdGgpO1xuXHRcdFx0Y29uc3QgaWNvblJlY3QgPSBwaWxsUmVjdC53aXRoV2lkdGgoTWF0aC5tYXgoaWNvbldpZHRoLCBtaW5pbWFsSWNvbldpZHRoV2l0aFBhZGRpbmcpKS50cmFuc2xhdGVYKHdpZHRoVW50aWxMaW5lTnVtYmVyRW5kKTtcblx0XHRcdGNvbnN0IGljb25WaXNpYmxlID0gaWNvbldpZHRoID49IG1pbmltYWxJY29uV2lkdGhXaXRoUGFkZGluZztcblxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0Z3V0dGVyRWRpdEFyZWEsXG5cdFx0XHRcdGljb246IGljb25Eb2NrZWQsXG5cdFx0XHRcdGljb25EaXJlY3Rpb246ICdyaWdodCcgYXMgY29uc3QsXG5cdFx0XHRcdGljb25SZWN0LFxuXHRcdFx0XHRpY29uVmlzaWJsZSxcblx0XHRcdFx0cGlsbFJlY3QsXG5cdFx0XHRcdGxpbmVOdW1iZXJSZWN0LFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRjb25zdCBwaWxsUGFydGlhbGx5RG9ja2VkUG9zc2libGVBcmVhID0gZ3V0dGVyVmlld1BvcnRXaXRoU3RpY2t5U2Nyb2xsLmludGVyc2VjdChndXR0ZXJFZGl0QXJlYSk7IC8vIFRoZSBhcmVhIGluIHdoaWNoIHRoZSBwaWxsIGNvdWxkIGJlIHBhcnRpYWxseSBkb2NrZWRcblx0XHRjb25zdCBwaWxsSXNQYXJ0aWFsbHlEb2NrZWQgPSBwaWxsUGFydGlhbGx5RG9ja2VkUG9zc2libGVBcmVhICYmIHBpbGxQYXJ0aWFsbHlEb2NrZWRQb3NzaWJsZUFyZWEuaGVpZ2h0ID49IHBpbGxIZWlnaHQ7XG5cblx0XHRpZiAocGlsbElzUGFydGlhbGx5RG9ja2VkKSB7XG5cdFx0XHQvLyBwaWxsRnVsbHlEb2NrZWRSZWN0IGlzIG91dHNpZGUgdmlld3BvcnQsIG1vdmUgaXQgaW50byB0aGUgdmlld3BvcnQgdW5kZXIgc3RpY2t5IHNjcm9sbCBhcyB3ZSBwcmVmZXIgdGhlIHBpbGwgdG8gbm90IGJlIG9uIHRvcCBvZiB0aGUgc3RpY2t5IHNjcm9sbFxuXHRcdFx0Ly8gdGhlbiBtb3ZlIGl0IGludG8gdGhlIHBvc3NpYmxlIGFyZWEgd2hpY2ggd2lsbCBvbmx5IGNhdXNlIGl0IHRvIG1vdmUgaWYgaXQgaGFzIHRvIGJlIHJlbmRlcmVkIG9uIHRvcCBvZiB0aGUgc3RpY2t5IHNjcm9sbFxuXHRcdFx0Y29uc3QgcGlsbFJlY3RNb3ZlZCA9IHBpbGxGdWxseURvY2tlZFJlY3QubW92ZVRvQmVDb250YWluZWRJbihndXR0ZXJWaWV3UG9ydFdpdGhvdXRTdGlja3lTY3JvbGwpLm1vdmVUb0JlQ29udGFpbmVkSW4ocGlsbFBhcnRpYWxseURvY2tlZFBvc3NpYmxlQXJlYSk7XG5cdFx0XHRjb25zdCBwaWxsUmVjdCA9IHBpbGxSZWN0TW92ZWQud2l0aFdpZHRoKGljb25XaWR0aChwaWxsUmVjdE1vdmVkKSk7XG5cdFx0XHRjb25zdCBpY29uUmVjdCA9IHBpbGxSZWN0O1xuXG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRndXR0ZXJFZGl0QXJlYSxcblx0XHRcdFx0aWNvbjogaWNvbkRvY2tlZCxcblx0XHRcdFx0aWNvbkRpcmVjdGlvbjogJ3JpZ2h0JyBhcyBjb25zdCxcblx0XHRcdFx0aWNvblJlY3QsXG5cdFx0XHRcdHBpbGxSZWN0LFxuXHRcdFx0XHRpY29uVmlzaWJsZTogdHJ1ZSxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0Ly8gcGlsbEZ1bGx5RG9ja2VkUmVjdCBpcyBvdXRzaWRlIHZpZXdwb3J0LCBzbyBtb3ZlIGl0IGludG8gdmlld3BvcnRcblx0XHRjb25zdCBwaWxsUmVjdE1vdmVkID0gcGlsbEZ1bGx5RG9ja2VkUmVjdC5tb3ZlVG9CZUNvbnRhaW5lZEluKGd1dHRlclZpZXdQb3J0V2l0aFN0aWNreVNjcm9sbCk7XG5cdFx0Y29uc3QgcGlsbFJlY3QgPSBwaWxsUmVjdE1vdmVkLndpdGhXaWR0aChpY29uV2lkdGgocGlsbFJlY3RNb3ZlZCkpO1xuXHRcdGNvbnN0IGljb25SZWN0ID0gcGlsbFJlY3Q7XG5cblx0XHQvLyBkb2NrZWQgPSBwaWxsIHdhcyBhbHJlYWR5IGluIHRoZSB2aWV3cG9ydFxuXHRcdGNvbnN0IGljb25EaXJlY3Rpb24gPSBwaWxsUmVjdC50b3AgPCBwaWxsRnVsbHlEb2NrZWRSZWN0LnRvcCA/XG5cdFx0XHQndG9wJyBhcyBjb25zdCA6XG5cdFx0XHQnYm90dG9tJyBhcyBjb25zdDtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRndXR0ZXJFZGl0QXJlYSxcblx0XHRcdGljb246IGljb25Ob25lRG9ja2VkLFxuXHRcdFx0aWNvbkRpcmVjdGlvbixcblx0XHRcdGljb25SZWN0LFxuXHRcdFx0cGlsbFJlY3QsXG5cdFx0XHRpY29uVmlzaWJsZTogdHJ1ZSxcblx0XHR9O1xuXHR9KTtcblxuXG5cdHByb3RlY3RlZCByZWFkb25seSBfaWNvblJlZiA9IG4ucmVmPEhUTUxEaXZFbGVtZW50PigpO1xuXG5cdHB1YmxpYyByZWFkb25seSBpc1Zpc2libGUgPSB0aGlzLl9sYXlvdXQubWFwKGwgPT4gISFsKTtcblxuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX2hvdmVyVmlzaWJsZSA9IG9ic2VydmFibGVWYWx1ZSh0aGlzLCBmYWxzZSk7XG5cdHB1YmxpYyByZWFkb25seSBpc0hvdmVyVmlzaWJsZTogSU9ic2VydmFibGU8Ym9vbGVhbj4gPSB0aGlzLl9ob3ZlclZpc2libGU7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfaXNIb3ZlcmVkT3Zlckljb24gPSBvYnNlcnZhYmxlVmFsdWUodGhpcywgZmFsc2UpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9pc0hvdmVyZWRPdmVySWNvbkRlYm91bmNlZDogSU9ic2VydmFibGU8Ym9vbGVhbj4gPSBkZWJvdW5jZWRPYnNlcnZhYmxlKHRoaXMuX2lzSG92ZXJlZE92ZXJJY29uLCAxMDApO1xuXHRwdWJsaWMgcmVhZG9ubHkgaXNIb3ZlcmVkT3Zlckljb246IElPYnNlcnZhYmxlPGJvb2xlYW4+ID0gdGhpcy5faXNIb3ZlcmVkT3Zlckljb25EZWJvdW5jZWQ7XG5cblx0cHJvdGVjdGVkIF9zaG93SG92ZXIoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2hvdmVyVmlzaWJsZS5nZXQoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGRhdGEgPSB0aGlzLl9kYXRhLmdldCgpO1xuXHRcdGlmICghZGF0YSkge1xuXHRcdFx0dGhyb3cgbmV3IEJ1Z0luZGljYXRpbmdFcnJvcignR3V0dGVyIGluZGljYXRvciBkYXRhIG5vdCBhdmFpbGFibGUnKTtcblx0XHR9XG5cdFx0Y29uc3QgZGlzcG9zYWJsZVN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IGNvbnRlbnQgPSBkaXNwb3NhYmxlU3RvcmUuYWRkKHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0R3V0dGVySW5kaWNhdG9yTWVudUNvbnRlbnQsXG5cdFx0XHR0aGlzLl9lZGl0b3JPYnMsXG5cdFx0XHRkYXRhLmd1dHRlck1lbnVEYXRhLFxuXHRcdFx0KGZvY3VzRWRpdG9yLCBjb21tYW5kSWQpID0+IHtcblx0XHRcdFx0aWYgKGZvY3VzRWRpdG9yKSB7XG5cdFx0XHRcdFx0dGhpcy5fZWRpdG9yT2JzLmVkaXRvci5mb2N1cygpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChjb21tYW5kSWQpIHtcblx0XHRcdFx0XHR0aGlzLl9vbkRpZENsb3NlV2l0aENvbW1hbmQuZmlyZShjb21tYW5kSWQpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGg/LmRpc3Bvc2UoKTtcblx0XHRcdH0sXG5cdFx0KS50b0Rpc3Bvc2FibGVMaXZlRWxlbWVudCgpKTtcblxuXHRcdGNvbnN0IGlzRm9jdXNlZCA9IHRoaXMuX3VzZXJJbnRlcmFjdGlvblNlcnZpY2UuY3JlYXRlRm9jdXNUcmFja2VyKGNvbnRlbnQuZWxlbWVudCwgZGlzcG9zYWJsZVN0b3JlKTsgLy8gVE9ET0BiZW5pYmVuaiBzaG91bGQgdGhpcyBiZSByZW1vdmVkP1xuXHRcdGRpc3Bvc2FibGVTdG9yZS5hZGQoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0dGhpcy5fZm9jdXNJc0luTWVudS5zZXQoaXNGb2N1c2VkLnJlYWQocmVhZGVyKSwgdW5kZWZpbmVkKTtcblx0XHR9KSk7XG5cdFx0ZGlzcG9zYWJsZVN0b3JlLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gdGhpcy5fZm9jdXNJc0luTWVudS5zZXQoZmFsc2UsIHVuZGVmaW5lZCkpKTtcblxuXHRcdGNvbnN0IGggPSB0aGlzLl9ob3ZlclNlcnZpY2Uuc2hvd0luc3RhbnRIb3Zlcih7XG5cdFx0XHR0YXJnZXQ6IHRoaXMuX2ljb25SZWYuZWxlbWVudCxcblx0XHRcdGNvbnRlbnQ6IGNvbnRlbnQuZWxlbWVudCxcblx0XHR9KSBhcyBIb3ZlcldpZGdldCB8IHVuZGVmaW5lZDtcblx0XHRpZiAoaCkge1xuXHRcdFx0dGhpcy5faG92ZXJWaXNpYmxlLnNldCh0cnVlLCB1bmRlZmluZWQpO1xuXHRcdFx0ZGlzcG9zYWJsZVN0b3JlLmFkZCh0aGlzLl9lZGl0b3JPYnMuZWRpdG9yLm9uRGlkU2Nyb2xsQ2hhbmdlKCgpID0+IGguZGlzcG9zZSgpKSk7XG5cdFx0XHRkaXNwb3NhYmxlU3RvcmUuYWRkKGgub25EaXNwb3NlKCgpID0+IHtcblx0XHRcdFx0dGhpcy5faG92ZXJWaXNpYmxlLnNldChmYWxzZSwgdW5kZWZpbmVkKTtcblx0XHRcdFx0ZGlzcG9zYWJsZVN0b3JlLmRpc3Bvc2UoKTtcblx0XHRcdH0pKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0ZGlzcG9zYWJsZVN0b3JlLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9pbmRpY2F0b3IgPSBuLmRpdih7XG5cdFx0Y2xhc3M6ICdpbmxpbmUtZWRpdHMtdmlldy1ndXR0ZXItaW5kaWNhdG9yJyxcblx0XHRzdHlsZToge1xuXHRcdFx0cG9zaXRpb246ICdhYnNvbHV0ZScsXG5cdFx0XHRvdmVyZmxvdzogJ3Zpc2libGUnLFxuXHRcdH0sXG5cdH0sIG1hcE91dEZhbHN5KHRoaXMuX2xheW91dCkubWFwKGxheW91dCA9PiAhbGF5b3V0ID8gW10gOiBbXG5cdFx0bi5kaXYoe1xuXHRcdFx0c3R5bGU6IHtcblx0XHRcdFx0cG9zaXRpb246ICdhYnNvbHV0ZScsXG5cdFx0XHRcdGJhY2tncm91bmQ6IGFzQ3NzVmFyaWFibGUoaW5saW5lRWRpdEluZGljYXRvckJhY2tncm91bmQpLFxuXHRcdFx0XHRib3JkZXJSYWRpdXM6IGAke0lOTElORV9FRElUU19CT1JERVJfUkFESVVTfXB4YCxcblx0XHRcdFx0Li4ucmVjdFRvUHJvcHMocmVhZGVyID0+IGxheW91dC5yZWFkKHJlYWRlcikuZ3V0dGVyRWRpdEFyZWEpLFxuXHRcdFx0fVxuXHRcdH0pLFxuXHRcdG4uZGl2KHtcblx0XHRcdGNsYXNzOiAnaWNvbicsXG5cdFx0XHRyZWY6IHRoaXMuX2ljb25SZWYsXG5cblx0XHRcdHRhYkluZGV4OiAwLFxuXHRcdFx0b25jbGljazogKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBsYXlvdXQgPSB0aGlzLl9sYXlvdXQuZ2V0KCk7XG5cdFx0XHRcdGNvbnN0IGFjY2VwdE9uQ2xpY2sgPSBsYXlvdXQ/Lmljb24uZ2V0KCkgPT09IENvZGljb24uY2hlY2s7XG5cblx0XHRcdFx0Y29uc3QgZGF0YSA9IHRoaXMuX2RhdGEuZ2V0KCk7XG5cdFx0XHRcdGlmICghZGF0YSkgeyB0aHJvdyBuZXcgQnVnSW5kaWNhdGluZ0Vycm9yKCdHdXR0ZXIgaW5kaWNhdG9yIGRhdGEgbm90IGF2YWlsYWJsZScpOyB9XG5cblx0XHRcdFx0dGhpcy5fZWRpdG9yT2JzLmVkaXRvci5mb2N1cygpO1xuXHRcdFx0XHRpZiAoYWNjZXB0T25DbGljaykge1xuXHRcdFx0XHRcdGRhdGEubW9kZWwuYWNjZXB0KCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0ZGF0YS5tb2RlbC5qdW1wKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cblx0XHRcdG9ubW91c2VlbnRlcjogKCkgPT4ge1xuXHRcdFx0XHQvLyBUT0RPIHNob3cgaG92ZXIgd2hlbiBob3ZlcmluZyBnaG9zdCB0ZXh0IGV0Yy5cblx0XHRcdFx0dGhpcy5fc2hvd0hvdmVyKCk7XG5cdFx0XHR9LFxuXHRcdFx0c3R5bGU6IHtcblx0XHRcdFx0Y3Vyc29yOiAncG9pbnRlcicsXG5cdFx0XHRcdHpJbmRleDogJzIwJyxcblx0XHRcdFx0cG9zaXRpb246ICdhYnNvbHV0ZScsXG5cdFx0XHRcdGJhY2tncm91bmRDb2xvcjogdGhpcy5fZ3V0dGVySW5kaWNhdG9yU3R5bGVzLm1hcCh2ID0+IHYuYmFja2dyb3VuZCksXG5cdFx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdFx0XHRbJy0tdnNjb2RlSWNvbkZvcmVncm91bmQnIGFzIGFueV06IHRoaXMuX2d1dHRlckluZGljYXRvclN0eWxlcy5tYXAodiA9PiB2LmZvcmVncm91bmQpLFxuXHRcdFx0XHRib3JkZXI6IHRoaXMuX2d1dHRlckluZGljYXRvclN0eWxlcy5tYXAodiA9PiBgMXB4IHNvbGlkICR7di5ib3JkZXJ9YCksXG5cdFx0XHRcdGJveFNpemluZzogJ2JvcmRlci1ib3gnLFxuXHRcdFx0XHRib3JkZXJSYWRpdXM6IGAke0lOTElORV9FRElUU19CT1JERVJfUkFESVVTfXB4YCxcblx0XHRcdFx0ZGlzcGxheTogJ2ZsZXgnLFxuXHRcdFx0XHRqdXN0aWZ5Q29udGVudDogbGF5b3V0Lm1hcChsID0+IGwuaWNvbkRpcmVjdGlvbiA9PT0gJ2JvdHRvbScgPyAnZmxleC1zdGFydCcgOiAnZmxleC1lbmQnKSxcblx0XHRcdFx0dHJhbnNpdGlvbjogdGhpcy5fbW9kaWZpZXJQcmVzc2VkLm1hcChtID0+IG0gPyAnJyA6ICdiYWNrZ3JvdW5kLWNvbG9yIDAuMnMgZWFzZS1pbi1vdXQsIHdpZHRoIDAuMnMgZWFzZS1pbi1vdXQnKSxcblx0XHRcdFx0Li4ucmVjdFRvUHJvcHMocmVhZGVyID0+IGxheW91dC5yZWFkKHJlYWRlcikucGlsbFJlY3QpLFxuXHRcdFx0fVxuXHRcdH0sIFtcblx0XHRcdG4uZGl2KHtcblx0XHRcdFx0Y2xhc3NOYW1lOiAnbGluZS1udW1iZXInLFxuXHRcdFx0XHRzdHlsZToge1xuXHRcdFx0XHRcdGxpbmVIZWlnaHQ6IGxheW91dC5tYXAobCA9PiBsLmxpbmVOdW1iZXJSZWN0ID8gbC5saW5lTnVtYmVyUmVjdC5oZWlnaHQgOiAwKSxcblx0XHRcdFx0XHRkaXNwbGF5OiBsYXlvdXQubWFwKGwgPT4gbC5saW5lTnVtYmVyUmVjdCA/ICdmbGV4JyA6ICdub25lJyksXG5cdFx0XHRcdFx0YWxpZ25JdGVtczogJ2NlbnRlcicsXG5cdFx0XHRcdFx0anVzdGlmeUNvbnRlbnQ6ICdmbGV4LWVuZCcsXG5cdFx0XHRcdFx0d2lkdGg6IGxheW91dC5tYXAobCA9PiBsLmxpbmVOdW1iZXJSZWN0ID8gbC5saW5lTnVtYmVyUmVjdC53aWR0aCA6IDApLFxuXHRcdFx0XHRcdGhlaWdodDogJzEwMCUnLFxuXHRcdFx0XHRcdGNvbG9yOiB0aGlzLl9ndXR0ZXJJbmRpY2F0b3JTdHlsZXMubWFwKHYgPT4gdi5mb3JlZ3JvdW5kKSxcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdFx0dGhpcy5fbGluZU51bWJlclRvUmVuZGVyXG5cdFx0XHQpLFxuXHRcdFx0bi5kaXYoe1xuXHRcdFx0XHRzdHlsZToge1xuXHRcdFx0XHRcdHRyYW5zZm9ybTogbGF5b3V0Lm1hcChsID0+IGByb3RhdGUoJHtnZXRSb3RhdGlvbkZyb21EaXJlY3Rpb24obC5pY29uRGlyZWN0aW9uKX1kZWcpYCksXG5cdFx0XHRcdFx0dHJhbnNpdGlvbjogJ3JvdGF0ZSAwLjJzIGVhc2UtaW4tb3V0LCBvcGFjaXR5IDAuMnMgZWFzZS1pbi1vdXQnLFxuXHRcdFx0XHRcdGRpc3BsYXk6ICdmbGV4Jyxcblx0XHRcdFx0XHRhbGlnbkl0ZW1zOiAnY2VudGVyJyxcblx0XHRcdFx0XHRqdXN0aWZ5Q29udGVudDogJ2NlbnRlcicsXG5cdFx0XHRcdFx0aGVpZ2h0OiAnMTAwJScsXG5cdFx0XHRcdFx0b3BhY2l0eTogbGF5b3V0Lm1hcChsID0+IGwuaWNvblZpc2libGUgPyAnMScgOiAnMCcpLFxuXHRcdFx0XHRcdG1hcmdpblJpZ2h0OiBsYXlvdXQubWFwKGwgPT4gbC5waWxsUmVjdC53aWR0aCAtIGwuaWNvblJlY3Qud2lkdGggLSAobC5saW5lTnVtYmVyUmVjdD8ud2lkdGggPz8gMCkpLFxuXHRcdFx0XHRcdHdpZHRoOiBsYXlvdXQubWFwKGwgPT4gbC5pY29uUmVjdC53aWR0aCksXG5cdFx0XHRcdFx0cG9zaXRpb246ICdyZWxhdGl2ZScsXG5cdFx0XHRcdFx0cmlnaHQ6IGxheW91dC5tYXAobCA9PiBsLmljb25EaXJlY3Rpb24gPT09ICd0b3AnID8gJzFweCcgOiAnMCcpLFxuXHRcdFx0XHRcdGNvbG9yOiB0aGlzLl9kYXRhLm1hcChkID0+IGQ/LmN1c3RvbWl6YXRpb24/Lmljb24/LmNvbG9yID8gYXNDc3NWYXJpYWJsZShkLmN1c3RvbWl6YXRpb24uaWNvbi5jb2xvci5pZCkgOiB1bmRlZmluZWQpLFxuXHRcdFx0XHR9XG5cdFx0XHR9LCBbXG5cdFx0XHRcdGxheW91dC5tYXAoKGwsIHJlYWRlcikgPT4gd2l0aFN0eWxlcyhyZW5kZXJJY29uKGwuaWNvbi5yZWFkKHJlYWRlcikpLCB7IGZvbnRTaXplOiB0b1B4KE1hdGgubWluKGwuaWNvblJlY3Qud2lkdGggLSBDT0RJQ09OX1BBRERJTkdfUFgsIENPRElDT05fU0laRV9QWCkpIH0pKSxcblx0XHRcdF0pXG5cdFx0XSksXG5cdF0pKTtcbn1cblxuZnVuY3Rpb24gZ2V0Um90YXRpb25Gcm9tRGlyZWN0aW9uKGRpcmVjdGlvbjogJ3RvcCcgfCAnYm90dG9tJyB8ICdyaWdodCcpOiBudW1iZXIge1xuXHRzd2l0Y2ggKGRpcmVjdGlvbikge1xuXHRcdGNhc2UgJ3RvcCc6IHJldHVybiA5MDtcblx0XHRjYXNlICdib3R0b20nOiByZXR1cm4gLTkwO1xuXHRcdGNhc2UgJ3JpZ2h0JzogcmV0dXJuIDA7XG5cdH1cbn1cblxuZnVuY3Rpb24gd2l0aFN0eWxlczxUIGV4dGVuZHMgSFRNTEVsZW1lbnQ+KGVsZW1lbnQ6IFQsIHN0eWxlczogeyBba2V5OiBzdHJpbmddOiBzdHJpbmcgfSk6IFQge1xuXHRmb3IgKGNvbnN0IGtleSBpbiBzdHlsZXMpIHtcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRlbGVtZW50LnN0eWxlW2tleSBhcyBhbnldID0gc3R5bGVzW2tleV07XG5cdH1cblx0cmV0dXJuIGVsZW1lbnQ7XG59XG5cbmZ1bmN0aW9uIHRvUHgobjogbnVtYmVyKTogc3RyaW5nIHtcblx0cmV0dXJuIGAke259cHhgO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLFNBQVM7QUFDbEIsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsWUFBWSxpQkFBaUIsb0JBQW9CO0FBQzFELFNBQTJDLFNBQVMsaUJBQWlCLHFCQUFxQixTQUFTLHFCQUFxQixpQkFBaUIsbUJBQW1CO0FBQzVKLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMscUJBQXFCO0FBRzlCLFNBQVMsYUFBYTtBQUN0QixTQUFTLFlBQVk7QUFHckIsU0FBUyxjQUFjLDZCQUE2QjtBQUVwRCxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLHVCQUF1Qiw0QkFBNEIsK0JBQStCLHNDQUFzQyxrQ0FBa0Ms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QUFBQSxJQUNELEVBQUUsd0JBQXdCLENBQUM7QUFFM0IsVUFBTSxZQUFZLEtBQUssd0JBQXdCLG1CQUFtQixRQUFRLFNBQVMsZUFBZTtBQUNsRyxvQkFBZ0IsSUFBSSxRQUFRLFlBQVU7QUFDckMsV0FBSyxlQUFlLElBQUksVUFBVSxLQUFLLE1BQU0sR0FBRyxNQUFTO0FBQUEsSUFDMUQsQ0FBQyxDQUFDO0FBQ0Ysb0JBQWdCLElBQUksYUFBYSxNQUFNLEtBQUssZUFBZSxJQUFJLE9BQU8sTUFBUyxDQUFDLENBQUM7QUFFakYsVUFBTSxJQUFJLEtBQUssY0FBYyxpQkFBaUI7QUFBQSxNQUM3QyxRQUFRLEtBQUssU0FBUztBQUFBLE1BQ3RCLFNBQVMsUUFBUTtBQUFBLElBQ2xCLENBQUM7QUFDRCxRQUFJLEdBQUc7QUFDTixXQUFLLGNBQWMsSUFBSSxNQUFNLE1BQVM7QUFDdEMsc0JBQWdCLElBQUksS0FBSyxXQUFXLE9BQU8sa0JBQWtCLE1BQU0sRUFBRSxRQUFRLENBQUMsQ0FBQztBQUMvRSxzQkFBZ0IsSUFBSSxFQUFFLFVBQVUsTUFBTTtBQUNyQyxhQUFLLGNBQWMsSUFBSSxPQUFPLE1BQVM7QUFDdkMsd0JBQWdCLFFBQVE7QUFBQSxNQUN6QixDQUFDLENBQUM7QUFBQSxJQUNILE9BQU87QUFDTixzQkFBZ0IsUUFBUTtBQUFBLElBQ3pCO0FBQUEsRUFDRDtBQTJGRDtBQXRmYSw2QkFBTjtBQUFBLEVBYUo7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FqQlU7QUF3ZmIsU0FBUyx5QkFBeUIsV0FBK0M7QUFDaEYsVUFBUSxXQUFXO0FBQUEsSUFDbEIsS0FBSztBQUFPLGFBQU87QUFBQSxJQUNuQixLQUFLO0FBQVUsYUFBTztBQUFBLElBQ3RCLEtBQUs7QUFBUyxhQUFPO0FBQUEsRUFDdEI7QUFDRDtBQUVBLFNBQVMsV0FBa0MsU0FBWSxRQUFzQztBQUM1RixhQUFXLE9BQU8sUUFBUTtBQUV6QixZQUFRLE1BQU0sR0FBVSxJQUFJLE9BQU8sR0FBRztBQUFBLEVBQ3ZDO0FBQ0EsU0FBTztBQUNSO0FBRUEsU0FBUyxLQUFLQyxJQUFtQjtBQUNoQyxTQUFPLEdBQUdBLEVBQUM7QUFDWjsiLAogICJuYW1lcyI6IFsicmVhZGVyIiwgInBpbGxSZWN0IiwgImljb25XaWR0aCIsICJpY29uUmVjdCIsICJwaWxsUmVjdE1vdmVkIiwgImxheW91dCIsICJuIl0KfQo=
