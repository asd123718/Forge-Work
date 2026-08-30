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
import { $, n } from "../../../../../../../base/browser/dom.js";
import { renderIcon } from "../../../../../../../base/browser/ui/iconLabel/iconLabels.js";
import { KeybindingLabel, unthemedKeybindingLabelOptions } from "../../../../../../../base/browser/ui/keybindingLabel/keybindingLabel.js";
import { Emitter } from "../../../../../../../base/common/event.js";
import { Disposable } from "../../../../../../../base/common/lifecycle.js";
import { constObservable, derived, observableFromEvent, observableFromPromise, observableValue } from "../../../../../../../base/common/observable.js";
import { OS } from "../../../../../../../base/common/platform.js";
import { localize } from "../../../../../../../nls.js";
import { IHoverService } from "../../../../../../../platform/hover/browser/hover.js";
import { IKeybindingService } from "../../../../../../../platform/keybinding/common/keybinding.js";
import { editorHoverForeground } from "../../../../../../../platform/theme/common/colorRegistry.js";
import { contrastBorder } from "../../../../../../../platform/theme/common/colors/baseColors.js";
import { asCssVariable } from "../../../../../../../platform/theme/common/colorUtils.js";
import { IThemeService } from "../../../../../../../platform/theme/common/themeService.js";
import { LineSource, renderLines, RenderOptions } from "../../../../../../browser/widget/diffEditor/components/diffEditorViewZones/renderLines.js";
import { EditorOption } from "../../../../../../common/config/editorOptions.js";
import { Point } from "../../../../../../common/core/2d/point.js";
import { Rect } from "../../../../../../common/core/2d/rect.js";
import { StringReplacement } from "../../../../../../common/core/edits/stringEdit.js";
import { OffsetRange } from "../../../../../../common/core/ranges/offsetRange.js";
import { ILanguageService } from "../../../../../../common/languages/language.js";
import { LineTokens, TokenArray } from "../../../../../../common/tokens/lineTokens.js";
import { inlineSuggestCommitAlternativeActionId } from "../../../controller/commandIds.js";
import { InlineEditClickEvent } from "../inlineEditsViewInterface.js";
import { getEditorBackgroundColor, getModifiedBorderColor, getOriginalBorderColor, INLINE_EDITS_BORDER_RADIUS, inlineEditIndicatorPrimaryBackground, inlineEditIndicatorPrimaryBorder, inlineEditIndicatorPrimaryForeground, modifiedChangedTextOverlayColor, observeColor, originalChangedTextOverlayColor } from "../theme.js";
import { getEditorValidOverlayRect, mapOutFalsy, rectToProps } from "../utils/utils.js";
import { IUserInteractionService } from "../../../../../../../platform/userInteraction/browser/userInteractionService.js";
class WordReplacementsViewData {
  constructor(edit, editorType, alternativeAction) {
    this.edit = edit;
    this.editorType = editorType;
    this.alternativeAction = alternativeAction;
  }
  equals(other) {
    return this.edit.equals(other.edit) && this.alternativeAction === other.alternativeAction;
  }
}
const BORDER_WIDTH = 1;
const DOM_ID_OVERLAY = "word-replacement-view-overlay";
const DOM_ID_WIDGET = "word-replacement-view-widget";
const DOM_ID_REPLACEMENT = "word-replacement-view-replacement";
const DOM_ID_RENAME = "word-replacement-view-rename";
let InlineEditsWordReplacementView = class extends Disposable {
  constructor(_editor, _viewData, _tabAction, _languageService, _themeService, _keybindingService, _hoverService, _userInteractionService) {
    super();
    this._editor = _editor;
    this._viewData = _viewData;
    this._tabAction = _tabAction;
    this._languageService = _languageService;
    this._themeService = _themeService;
    this._keybindingService = _keybindingService;
    this._hoverService = _hoverService;
    this._userInteractionService = _userInteractionService;
    this._onDidClick = this._register(new Emitter());
    this.onDidClick = this._onDidClick.event;
    this._start = this._editor.observePosition(constObservable(this._viewData.edit.range.getStartPosition()), this._store);
    this._end = this._editor.observePosition(constObservable(this._viewData.edit.range.getEndPosition()), this._store);
    this._line = document.createElement("div");
    this._primaryElement = observableValue(this, null);
    this._secondaryElement = observableValue(this, null);
    this.isHovered = derived(this, (reader) => {
      const elem = this._primaryElement.read(reader);
      if (!elem) {
        return false;
      }
      return this._userInteractionService.createHoverTracker(elem.element, reader.store).read(reader);
    });
    this._renderTextEffect = derived(this, (_reader) => {
      const tm = this._editor.model.read(void 0);
      if (!tm) {
        return;
      }
      const origLine = tm.getLineContent(this._viewData.edit.range.startLineNumber);
      const edit = StringReplacement.replace(new OffsetRange(this._viewData.edit.range.startColumn - 1, this._viewData.edit.range.endColumn - 1), this._viewData.edit.text);
      const lineToTokenize = edit.replace(origLine);
      const t = tm.tokenization.tokenizeLinesAt(this._viewData.edit.range.startLineNumber, [lineToTokenize])?.[0];
      let tokens;
      if (t) {
        tokens = TokenArray.fromLineTokens(t).slice(edit.getRangeAfterReplace()).toLineTokens(this._viewData.edit.text, this._languageService.languageIdCodec);
      } else {
        tokens = LineTokens.createEmpty(this._viewData.edit.text, this._languageService.languageIdCodec);
      }
      const res = renderLines(new LineSource([tokens]), RenderOptions.fromEditor(this._editor.editor).withSetWidth(false).withScrollBeyondLastColumn(0), [], this._line, true);
      this._line.style.width = `${res.minWidthInPx}px`;
    });
    const modifiedLineHeight = this._editor.observeLineHeightForPosition(this._viewData.edit.range.getStartPosition());
    const altCount = observableFromPromise(this._viewData.alternativeAction?.count ?? new Promise((resolve) => resolve(void 0))).map((c) => c.value);
    const altModifierActive = derived(this, (reader) => this._userInteractionService.readModifierKeyStatus(this._editor.editor.getDomNode(), reader).shiftKey);
    this._layout = derived(this, (reader) => {
      this._renderTextEffect.read(reader);
      const widgetStart = this._start.read(reader);
      const widgetEnd = this._end.read(reader);
      if (!widgetStart || !widgetEnd || widgetStart.x > widgetEnd.x || widgetStart.y > widgetEnd.y) {
        return void 0;
      }
      const lineHeight = modifiedLineHeight.read(reader);
      if (lineHeight <= 0) {
        return void 0;
      }
      const scrollLeft = this._editor.scrollLeft.read(reader);
      const w = this._editor.getOption(EditorOption.fontInfo).read(reader).typicalHalfwidthCharacterWidth;
      const modifiedLeftOffset = 3 * w;
      const modifiedTopOffset = 4;
      const modifiedOffset = new Point(modifiedLeftOffset, modifiedTopOffset);
      let alternativeAction = void 0;
      if (this._viewData.alternativeAction) {
        const label = this._viewData.alternativeAction.label;
        const count = altCount.read(reader);
        const active = altModifierActive.read(reader);
        const occurrencesLabel = count !== void 0 ? count === 1 ? localize("labelOccurence", "{0} 1 occurrence", label) : localize("labelOccurences", "{0} {1} occurrences", label, count) : label;
        const keybindingTooltip = localize("shiftToSeeOccurences", "{0} show occurrences", "[shift]");
        alternativeAction = {
          label: count !== void 0 ? active ? occurrencesLabel : label : label,
          tooltip: occurrencesLabel ? `${occurrencesLabel}
${keybindingTooltip}` : void 0,
          icon: void 0,
          //this._viewData.alternativeAction.icon, Do not render icon fo the moment
          count,
          keybinding: this._keybindingService.lookupKeybinding(inlineSuggestCommitAlternativeActionId),
          active: altModifierActive
        };
      }
      const originalLine = Rect.fromPoints(widgetStart, widgetEnd).withHeight(lineHeight).translateX(-scrollLeft);
      const codeLine = Rect.fromPointSize(originalLine.getLeftBottom().add(modifiedOffset), new Point(this._viewData.edit.text.length * w, originalLine.height));
      const modifiedLine = codeLine.withWidth(codeLine.width + (alternativeAction ? alternativeAction.label.length * w + 8 + 4 + 12 : 0));
      const lowerBackground = modifiedLine.withLeft(originalLine.left);
      return {
        alternativeAction,
        originalLine,
        codeLine,
        modifiedLine,
        lowerBackground,
        lineHeight
      };
    });
    this.minEditorScrollHeight = derived(this, (reader) => {
      const layout = mapOutFalsy(this._layout).read(reader);
      if (!layout) {
        return 0;
      }
      return layout.read(reader).modifiedLine.bottom + BORDER_WIDTH + this._editor.editor.getScrollTop();
    });
    this._root = n.div({
      class: "word-replacement"
    }, [
      derived(this, (reader) => {
        const layout = mapOutFalsy(this._layout).read(reader);
        if (!layout) {
          return [];
        }
        const originalBorderColor = getOriginalBorderColor(this._tabAction).map((c) => asCssVariable(c)).read(reader);
        const modifiedBorderColor = getModifiedBorderColor(this._tabAction).map((c) => asCssVariable(c)).read(reader);
        this._line.style.lineHeight = `${layout.read(reader).modifiedLine.height + 2 * BORDER_WIDTH}px`;
        const secondaryElementHovered = constObservable(false);
        const alternativeAction = layout.map((l) => l.alternativeAction);
        const alternativeActionActive = derived((reader2) => (alternativeAction.read(reader2)?.active.read(reader2) ?? false) || secondaryElementHovered.read(reader2));
        const isHighContrast = observableFromEvent(this._themeService.onDidColorThemeChange, () => {
          const theme = this._themeService.getColorTheme();
          return theme.type === "hcDark" || theme.type === "hcLight";
        }).read(reader);
        const hcBorderColor = isHighContrast ? observeColor(contrastBorder, this._themeService).read(reader) : null;
        const primaryActiveStyles = {
          borderColor: hcBorderColor ? hcBorderColor.toString() : modifiedBorderColor,
          backgroundColor: asCssVariable(modifiedChangedTextOverlayColor),
          color: "",
          opacity: "1"
        };
        const secondaryActiveStyles = {
          borderColor: hcBorderColor ? hcBorderColor.toString() : asCssVariable(inlineEditIndicatorPrimaryBorder),
          backgroundColor: asCssVariable(inlineEditIndicatorPrimaryBackground),
          color: asCssVariable(inlineEditIndicatorPrimaryForeground),
          opacity: "1"
        };
        const passiveStyles = {
          borderColor: hcBorderColor ? hcBorderColor.toString() : observeColor(editorHoverForeground, this._themeService).map((c) => c.transparent(0.2).toString()).read(reader),
          backgroundColor: getEditorBackgroundColor(this._viewData.editorType),
          color: "",
          opacity: "0.7"
        };
        const editorBackground = getEditorBackgroundColor(this._viewData.editorType);
        const primaryActionStyles = derived(this, (r) => alternativeActionActive.read(r) ? primaryActiveStyles : primaryActiveStyles);
        const secondaryActionStyles = derived(this, (r) => alternativeActionActive.read(r) ? secondaryActiveStyles : passiveStyles);
        return [
          n.div({
            id: DOM_ID_OVERLAY,
            style: {
              position: "absolute",
              ...rectToProps((r) => getEditorValidOverlayRect(this._editor).read(r)),
              overflow: "hidden",
              pointerEvents: "none"
            }
          }, [
            n.div({
              style: {
                position: "absolute",
                ...rectToProps((reader2) => layout.read(reader2).lowerBackground.withMargin(BORDER_WIDTH, 2 * BORDER_WIDTH, BORDER_WIDTH, 0)),
                background: editorBackground,
                cursor: "pointer",
                pointerEvents: "auto"
              },
              onmousedown: (e) => this._mouseDown(e)
            }),
            n.div({
              id: DOM_ID_WIDGET,
              style: {
                position: "absolute",
                ...rectToProps((reader2) => layout.read(reader2).modifiedLine.withMargin(BORDER_WIDTH, 2 * BORDER_WIDTH)),
                width: void 0,
                pointerEvents: "auto",
                boxSizing: "border-box",
                borderRadius: `${INLINE_EDITS_BORDER_RADIUS}px`,
                background: editorBackground,
                display: "flex",
                justifyContent: "left",
                outline: `2px solid ${editorBackground}`
              },
              onmousedown: (e) => this._mouseDown(e)
            }, [
              n.div({
                id: DOM_ID_REPLACEMENT,
                style: {
                  fontFamily: this._editor.getOption(EditorOption.fontFamily),
                  fontSize: this._editor.getOption(EditorOption.fontSize),
                  fontWeight: this._editor.getOption(EditorOption.fontWeight),
                  width: rectToProps((reader2) => layout.read(reader2).codeLine.withMargin(BORDER_WIDTH, 2 * BORDER_WIDTH)).width,
                  borderRadius: `${INLINE_EDITS_BORDER_RADIUS}px`,
                  border: primaryActionStyles.map((s) => `${BORDER_WIDTH}px solid ${s.borderColor}`),
                  boxSizing: "border-box",
                  padding: `${BORDER_WIDTH}px`,
                  opacity: primaryActionStyles.map((s) => s.opacity),
                  background: primaryActionStyles.map((s) => s.backgroundColor),
                  display: "flex",
                  justifyContent: "left",
                  alignItems: "center",
                  pointerEvents: "auto",
                  cursor: "pointer"
                },
                obsRef: (elem) => {
                  this._primaryElement.set(elem, void 0);
                }
              }, [this._line]),
              derived(this, (reader2) => {
                const altAction = alternativeAction.read(reader2);
                if (!altAction) {
                  return void 0;
                }
                const keybinding = document.createElement("div");
                const keybindingLabel = reader2.store.add(new KeybindingLabel(keybinding, OS, { ...unthemedKeybindingLabelOptions, disableTitle: true }));
                keybindingLabel.set(altAction.keybinding);
                return n.div({
                  id: DOM_ID_RENAME,
                  style: {
                    position: "relative",
                    borderRadius: `${INLINE_EDITS_BORDER_RADIUS}px`,
                    borderTop: `${BORDER_WIDTH}px solid`,
                    borderRight: `${BORDER_WIDTH}px solid`,
                    borderBottom: `${BORDER_WIDTH}px solid`,
                    borderLeft: `${BORDER_WIDTH}px solid`,
                    borderColor: secondaryActionStyles.map((s) => s.borderColor),
                    opacity: secondaryActionStyles.map((s) => s.opacity),
                    color: secondaryActionStyles.map((s) => s.color),
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    padding: "0 4px 0 1px",
                    marginLeft: "4px",
                    background: secondaryActionStyles.map((s) => s.backgroundColor),
                    cursor: "pointer",
                    textWrap: "nowrap"
                  },
                  class: "inline-edit-alternative-action-label",
                  obsRef: (elem) => {
                    this._secondaryElement.set(elem, void 0);
                  },
                  ref: (elem) => {
                    if (altAction.tooltip) {
                      reader2.store.add(this._hoverService.setupDelayedHoverAtMouse(elem, { content: altAction.tooltip, appearance: { compact: true } }));
                    }
                  }
                }, [
                  keybinding,
                  $("div.inline-edit-alternative-action-label-separator"),
                  altAction.icon ? renderIcon(altAction.icon) : void 0,
                  altAction.label
                ]);
              })
            ]),
            n.div({
              style: {
                position: "absolute",
                ...rectToProps((reader2) => layout.read(reader2).originalLine.withMargin(BORDER_WIDTH)),
                boxSizing: "border-box",
                borderRadius: `${INLINE_EDITS_BORDER_RADIUS}px`,
                border: `${BORDER_WIDTH}px solid ${originalBorderColor}`,
                background: asCssVariable(originalChangedTextOverlayColor),
                pointerEvents: "none"
              }
            }, []),
            n.svg({
              width: 11,
              height: 14,
              viewBox: "0 0 11 14",
              fill: "none",
              style: {
                position: "absolute",
                left: layout.map((l) => l.modifiedLine.left - 16),
                top: layout.map((l) => l.modifiedLine.top + Math.round((l.lineHeight - 14 - 5) / 2)),
                pointerEvents: "none"
              },
              onmousedown: (e) => this._mouseDown(e)
            }, [
              n.svgElem("path", {
                d: "M1 0C1 2.98966 1 5.92087 1 8.49952C1 9.60409 1.89543 10.5 3 10.5H10.5",
                stroke: asCssVariable(editorHoverForeground)
              }),
              n.svgElem("path", {
                d: "M6 7.5L9.99999 10.49998L6 13.5",
                stroke: asCssVariable(editorHoverForeground)
              })
            ])
          ])
        ];
      })
    ]).keepUpdated(this._store);
    this._register(this._editor.createOverlayWidget({
      domNode: this._root.element,
      minContentWidthInPx: constObservable(0),
      position: constObservable({ preference: { top: 0, left: 0 } }),
      allowEditorOverflow: false
    }));
  }
  _mouseDown(e) {
    const target_id = traverseParentsUntilId(e.target, /* @__PURE__ */ new Set([DOM_ID_WIDGET, DOM_ID_REPLACEMENT, DOM_ID_RENAME, DOM_ID_OVERLAY]));
    if (!target_id) {
      return;
    }
    e.preventDefault();
    this._onDidClick.fire(InlineEditClickEvent.create(e, target_id === DOM_ID_RENAME));
  }
};
InlineEditsWordReplacementView.MAX_LENGTH = 100;
InlineEditsWordReplacementView = __decorateClass([
  __decorateParam(3, ILanguageService),
  __decorateParam(4, IThemeService),
  __decorateParam(5, IKeybindingService),
  __decorateParam(6, IHoverService),
  __decorateParam(7, IUserInteractionService)
], InlineEditsWordReplacementView);
function traverseParentsUntilId(element, ids) {
  let current = element;
  while (current) {
    if (ids.has(current.id)) {
      return current.id;
    }
    current = current.parentElement;
  }
  return null;
}
export {
  InlineEditsWordReplacementView,
  WordReplacementsViewData
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXGlubGluZUNvbXBsZXRpb25zXFxicm93c2VyXFx2aWV3XFxpbmxpbmVFZGl0c1xcaW5saW5lRWRpdHNWaWV3c1xcaW5saW5lRWRpdHNXb3JkUmVwbGFjZW1lbnRWaWV3LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgJCwgbiwgT2JzZXJ2ZXJOb2RlV2l0aEVsZW1lbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IHJlbmRlckljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaWNvbkxhYmVsL2ljb25MYWJlbHMuanMnO1xuaW1wb3J0IHsgS2V5YmluZGluZ0xhYmVsLCB1bnRoZW1lZEtleWJpbmRpbmdMYWJlbE9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkva2V5YmluZGluZ0xhYmVsL2tleWJpbmRpbmdMYWJlbC5qcyc7XG5pbXBvcnQgeyBJRXF1YXRhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXF1YWxzLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGNvbnN0T2JzZXJ2YWJsZSwgZGVyaXZlZCwgSU9ic2VydmFibGUsIG9ic2VydmFibGVGcm9tRXZlbnQsIG9ic2VydmFibGVGcm9tUHJvbWlzZSwgb2JzZXJ2YWJsZVZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBPUyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElIb3ZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9ob3Zlci9icm93c2VyL2hvdmVyLmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgZWRpdG9ySG92ZXJGb3JlZ3JvdW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2NvbG9yUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgY29udHJhc3RCb3JkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vY29sb3JzL2Jhc2VDb2xvcnMuanMnO1xuaW1wb3J0IHsgYXNDc3NWYXJpYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9jb2xvclV0aWxzLmpzJztcbmltcG9ydCB7IElUaGVtZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IE9ic2VydmFibGVDb2RlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYnJvd3Nlci9vYnNlcnZhYmxlQ29kZUVkaXRvci5qcyc7XG5pbXBvcnQgeyBMaW5lU291cmNlLCByZW5kZXJMaW5lcywgUmVuZGVyT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jyb3dzZXIvd2lkZ2V0L2RpZmZFZGl0b3IvY29tcG9uZW50cy9kaWZmRWRpdG9yVmlld1pvbmVzL3JlbmRlckxpbmVzLmpzJztcbmltcG9ydCB7IEVkaXRvck9wdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2NvbW1vbi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBQb2ludCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2NvbW1vbi9jb3JlLzJkL3BvaW50LmpzJztcbmltcG9ydCB7IFJlY3QgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9jb21tb24vY29yZS8yZC9yZWN0LmpzJztcbmltcG9ydCB7IFN0cmluZ1JlcGxhY2VtZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vY29tbW9uL2NvcmUvZWRpdHMvc3RyaW5nRWRpdC5qcyc7XG5pbXBvcnQgeyBUZXh0UmVwbGFjZW1lbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9jb21tb24vY29yZS9lZGl0cy90ZXh0RWRpdC5qcyc7XG5pbXBvcnQgeyBPZmZzZXRSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2NvbW1vbi9jb3JlL3Jhbmdlcy9vZmZzZXRSYW5nZS5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlcy9sYW5ndWFnZS5qcyc7XG5pbXBvcnQgeyBMaW5lVG9rZW5zLCBUb2tlbkFycmF5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vY29tbW9uL3Rva2Vucy9saW5lVG9rZW5zLmpzJztcbmltcG9ydCB7IGlubGluZVN1Z2dlc3RDb21taXRBbHRlcm5hdGl2ZUFjdGlvbklkIH0gZnJvbSAnLi4vLi4vLi4vY29udHJvbGxlci9jb21tYW5kSWRzLmpzJztcbmltcG9ydCB7IElubGluZVN1Z2dlc3RBbHRlcm5hdGl2ZUFjdGlvbiB9IGZyb20gJy4uLy4uLy4uL21vZGVsL0lubGluZVN1Z2dlc3RBbHRlcm5hdGl2ZUFjdGlvbi5qcyc7XG5pbXBvcnQgeyBJbmxpbmVDb21wbGV0aW9uRWRpdG9yVHlwZSB9IGZyb20gJy4uLy4uLy4uL21vZGVsL3Byb3ZpZGVJbmxpbmVDb21wbGV0aW9ucy5qcyc7XG5pbXBvcnQgeyBJSW5saW5lRWRpdHNWaWV3LCBJbmxpbmVFZGl0Q2xpY2tFdmVudCwgSW5saW5lRWRpdFRhYkFjdGlvbiB9IGZyb20gJy4uL2lubGluZUVkaXRzVmlld0ludGVyZmFjZS5qcyc7XG5pbXBvcnQgeyBnZXRFZGl0b3JCYWNrZ3JvdW5kQ29sb3IsIGdldE1vZGlmaWVkQm9yZGVyQ29sb3IsIGdldE9yaWdpbmFsQm9yZGVyQ29sb3IsIElOTElORV9FRElUU19CT1JERVJfUkFESVVTLCBpbmxpbmVFZGl0SW5kaWNhdG9yUHJpbWFyeUJhY2tncm91bmQsIGlubGluZUVkaXRJbmRpY2F0b3JQcmltYXJ5Qm9yZGVyLCBpbmxpbmVFZGl0SW5kaWNhdG9yUHJpbWFyeUZvcmVncm91bmQsIG1vZGlmaWVkQ2hhbmdlZFRleHRPdmVybGF5Q29sb3IsIG9ic2VydmVDb2xvciwgb3JpZ2luYWxDaGFuZ2VkVGV4dE92ZXJsYXlDb2xvciB9IGZyb20gJy4uL3RoZW1lLmpzJztcbmltcG9ydCB7IGdldEVkaXRvclZhbGlkT3ZlcmxheVJlY3QsIG1hcE91dEZhbHN5LCByZWN0VG9Qcm9wcyB9IGZyb20gJy4uL3V0aWxzL3V0aWxzLmpzJztcbmltcG9ydCB7IElVc2VySW50ZXJhY3Rpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXNlckludGVyYWN0aW9uL2Jyb3dzZXIvdXNlckludGVyYWN0aW9uU2VydmljZS5qcyc7XG5cbmV4cG9ydCBjbGFzcyBXb3JkUmVwbGFjZW1lbnRzVmlld0RhdGEgaW1wbGVtZW50cyBJRXF1YXRhYmxlPFdvcmRSZXBsYWNlbWVudHNWaWV3RGF0YT4ge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgcmVhZG9ubHkgZWRpdDogVGV4dFJlcGxhY2VtZW50LFxuXHRcdHB1YmxpYyByZWFkb25seSBlZGl0b3JUeXBlOiBJbmxpbmVDb21wbGV0aW9uRWRpdG9yVHlwZSxcblx0XHRwdWJsaWMgcmVhZG9ubHkgYWx0ZXJuYXRpdmVBY3Rpb246IElubGluZVN1Z2dlc3RBbHRlcm5hdGl2ZUFjdGlvbiB8IHVuZGVmaW5lZCxcblx0KSB7IH1cblxuXHRlcXVhbHMob3RoZXI6IFdvcmRSZXBsYWNlbWVudHNWaWV3RGF0YSk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLmVkaXQuZXF1YWxzKG90aGVyLmVkaXQpICYmIHRoaXMuYWx0ZXJuYXRpdmVBY3Rpb24gPT09IG90aGVyLmFsdGVybmF0aXZlQWN0aW9uO1xuXHR9XG59XG5cbmNvbnN0IEJPUkRFUl9XSURUSCA9IDE7XG5jb25zdCBET01fSURfT1ZFUkxBWSA9ICd3b3JkLXJlcGxhY2VtZW50LXZpZXctb3ZlcmxheSc7XG5jb25zdCBET01fSURfV0lER0VUID0gJ3dvcmQtcmVwbGFjZW1lbnQtdmlldy13aWRnZXQnO1xuY29uc3QgRE9NX0lEX1JFUExBQ0VNRU5UID0gJ3dvcmQtcmVwbGFjZW1lbnQtdmlldy1yZXBsYWNlbWVudCc7XG5jb25zdCBET01fSURfUkVOQU1FID0gJ3dvcmQtcmVwbGFjZW1lbnQtdmlldy1yZW5hbWUnO1xuXG5leHBvcnQgY2xhc3MgSW5saW5lRWRpdHNXb3JkUmVwbGFjZW1lbnRWaWV3IGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElJbmxpbmVFZGl0c1ZpZXcge1xuXG5cdHB1YmxpYyBzdGF0aWMgTUFYX0xFTkdUSCA9IDEwMDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENsaWNrID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SW5saW5lRWRpdENsaWNrRXZlbnQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENsaWNrID0gdGhpcy5fb25EaWRDbGljay5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9zdGFydDtcblx0cHJpdmF0ZSByZWFkb25seSBfZW5kO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2xpbmU7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfcHJpbWFyeUVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3NlY29uZGFyeUVsZW1lbnQ7XG5cblx0cmVhZG9ubHkgaXNIb3ZlcmVkO1xuXG5cdHJlYWRvbmx5IG1pbkVkaXRvclNjcm9sbEhlaWdodDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3I6IE9ic2VydmFibGVDb2RlRWRpdG9yLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3ZpZXdEYXRhOiBXb3JkUmVwbGFjZW1lbnRzVmlld0RhdGEsXG5cdFx0cHJvdGVjdGVkIHJlYWRvbmx5IF90YWJBY3Rpb246IElPYnNlcnZhYmxlPElubGluZUVkaXRUYWJBY3Rpb24+LFxuXHRcdEBJTGFuZ3VhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xhbmd1YWdlU2VydmljZTogSUxhbmd1YWdlU2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9rZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2hvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0XHRASVVzZXJJbnRlcmFjdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdXNlckludGVyYWN0aW9uU2VydmljZTogSVVzZXJJbnRlcmFjdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fc3RhcnQgPSB0aGlzLl9lZGl0b3Iub2JzZXJ2ZVBvc2l0aW9uKGNvbnN0T2JzZXJ2YWJsZSh0aGlzLl92aWV3RGF0YS5lZGl0LnJhbmdlLmdldFN0YXJ0UG9zaXRpb24oKSksIHRoaXMuX3N0b3JlKTtcblx0XHR0aGlzLl9lbmQgPSB0aGlzLl9lZGl0b3Iub2JzZXJ2ZVBvc2l0aW9uKGNvbnN0T2JzZXJ2YWJsZSh0aGlzLl92aWV3RGF0YS5lZGl0LnJhbmdlLmdldEVuZFBvc2l0aW9uKCkpLCB0aGlzLl9zdG9yZSk7XG5cdFx0dGhpcy5fbGluZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdHRoaXMuX3ByaW1hcnlFbGVtZW50ID0gb2JzZXJ2YWJsZVZhbHVlPE9ic2VydmVyTm9kZVdpdGhFbGVtZW50IHwgbnVsbD4odGhpcywgbnVsbCk7XG5cdFx0dGhpcy5fc2Vjb25kYXJ5RWxlbWVudCA9IG9ic2VydmFibGVWYWx1ZTxPYnNlcnZlck5vZGVXaXRoRWxlbWVudCB8IG51bGw+KHRoaXMsIG51bGwpO1xuXHRcdHRoaXMuaXNIb3ZlcmVkID0gZGVyaXZlZCh0aGlzLCByZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgZWxlbSA9IHRoaXMuX3ByaW1hcnlFbGVtZW50LnJlYWQocmVhZGVyKTtcblx0XHRcdGlmICghZWxlbSkgeyByZXR1cm4gZmFsc2U7IH1cblx0XHRcdHJldHVybiB0aGlzLl91c2VySW50ZXJhY3Rpb25TZXJ2aWNlLmNyZWF0ZUhvdmVyVHJhY2tlcihlbGVtLmVsZW1lbnQsIHJlYWRlci5zdG9yZSkucmVhZChyZWFkZXIpO1xuXHRcdH0pO1xuXHRcdHRoaXMuX3JlbmRlclRleHRFZmZlY3QgPSBkZXJpdmVkKHRoaXMsIF9yZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgdG0gPSB0aGlzLl9lZGl0b3IubW9kZWwucmVhZCh1bmRlZmluZWQpO1xuXHRcdFx0aWYgKCF0bSkgeyByZXR1cm47IH1cblx0XHRcdGNvbnN0IG9yaWdMaW5lID0gdG0uZ2V0TGluZUNvbnRlbnQodGhpcy5fdmlld0RhdGEuZWRpdC5yYW5nZS5zdGFydExpbmVOdW1iZXIpO1xuXG5cdFx0XHRjb25zdCBlZGl0ID0gU3RyaW5nUmVwbGFjZW1lbnQucmVwbGFjZShuZXcgT2Zmc2V0UmFuZ2UodGhpcy5fdmlld0RhdGEuZWRpdC5yYW5nZS5zdGFydENvbHVtbiAtIDEsIHRoaXMuX3ZpZXdEYXRhLmVkaXQucmFuZ2UuZW5kQ29sdW1uIC0gMSksIHRoaXMuX3ZpZXdEYXRhLmVkaXQudGV4dCk7XG5cdFx0XHRjb25zdCBsaW5lVG9Ub2tlbml6ZSA9IGVkaXQucmVwbGFjZShvcmlnTGluZSk7XG5cdFx0XHRjb25zdCB0ID0gdG0udG9rZW5pemF0aW9uLnRva2VuaXplTGluZXNBdCh0aGlzLl92aWV3RGF0YS5lZGl0LnJhbmdlLnN0YXJ0TGluZU51bWJlciwgW2xpbmVUb1Rva2VuaXplXSk/LlswXTtcblx0XHRcdGxldCB0b2tlbnM6IExpbmVUb2tlbnM7XG5cdFx0XHRpZiAodCkge1xuXHRcdFx0XHR0b2tlbnMgPSBUb2tlbkFycmF5LmZyb21MaW5lVG9rZW5zKHQpLnNsaWNlKGVkaXQuZ2V0UmFuZ2VBZnRlclJlcGxhY2UoKSkudG9MaW5lVG9rZW5zKHRoaXMuX3ZpZXdEYXRhLmVkaXQudGV4dCwgdGhpcy5fbGFuZ3VhZ2VTZXJ2aWNlLmxhbmd1YWdlSWRDb2RlYyk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0b2tlbnMgPSBMaW5lVG9rZW5zLmNyZWF0ZUVtcHR5KHRoaXMuX3ZpZXdEYXRhLmVkaXQudGV4dCwgdGhpcy5fbGFuZ3VhZ2VTZXJ2aWNlLmxhbmd1YWdlSWRDb2RlYyk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCByZXMgPSByZW5kZXJMaW5lcyhuZXcgTGluZVNvdXJjZShbdG9rZW5zXSksIFJlbmRlck9wdGlvbnMuZnJvbUVkaXRvcih0aGlzLl9lZGl0b3IuZWRpdG9yKS53aXRoU2V0V2lkdGgoZmFsc2UpLndpdGhTY3JvbGxCZXlvbmRMYXN0Q29sdW1uKDApLCBbXSwgdGhpcy5fbGluZSwgdHJ1ZSk7XG5cdFx0XHR0aGlzLl9saW5lLnN0eWxlLndpZHRoID0gYCR7cmVzLm1pbldpZHRoSW5QeH1weGA7XG5cdFx0fSk7XG5cdFx0Y29uc3QgbW9kaWZpZWRMaW5lSGVpZ2h0ID0gdGhpcy5fZWRpdG9yLm9ic2VydmVMaW5lSGVpZ2h0Rm9yUG9zaXRpb24odGhpcy5fdmlld0RhdGEuZWRpdC5yYW5nZS5nZXRTdGFydFBvc2l0aW9uKCkpO1xuXHRcdGNvbnN0IGFsdENvdW50ID0gb2JzZXJ2YWJsZUZyb21Qcm9taXNlKHRoaXMuX3ZpZXdEYXRhLmFsdGVybmF0aXZlQWN0aW9uPy5jb3VudCA/PyBuZXcgUHJvbWlzZTx1bmRlZmluZWQ+KHJlc29sdmUgPT4gcmVzb2x2ZSh1bmRlZmluZWQpKSkubWFwKGMgPT4gYy52YWx1ZSk7XG5cdFx0Y29uc3QgYWx0TW9kaWZpZXJBY3RpdmUgPSBkZXJpdmVkKHRoaXMsIHJlYWRlciA9PiB0aGlzLl91c2VySW50ZXJhY3Rpb25TZXJ2aWNlLnJlYWRNb2RpZmllcktleVN0YXR1cyh0aGlzLl9lZGl0b3IuZWRpdG9yLmdldERvbU5vZGUoKSEsIHJlYWRlcikuc2hpZnRLZXkpO1xuXHRcdHRoaXMuX2xheW91dCA9IGRlcml2ZWQodGhpcywgcmVhZGVyID0+IHtcblx0XHRcdHRoaXMuX3JlbmRlclRleHRFZmZlY3QucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3Qgd2lkZ2V0U3RhcnQgPSB0aGlzLl9zdGFydC5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCB3aWRnZXRFbmQgPSB0aGlzLl9lbmQucmVhZChyZWFkZXIpO1xuXG5cdFx0XHQvLyBUT0RPQGhlZGlldCBiZXR0ZXIgYWJvdXQgd2lkZ2V0U3RhcnQgYW5kIHdpZGdldEVuZCBpbiBhIHNpbmdsZSB0cmFuc2FjdGlvbiFcblx0XHRcdGlmICghd2lkZ2V0U3RhcnQgfHwgIXdpZGdldEVuZCB8fCB3aWRnZXRTdGFydC54ID4gd2lkZ2V0RW5kLnggfHwgd2lkZ2V0U3RhcnQueSA+IHdpZGdldEVuZC55KSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGxpbmVIZWlnaHQgPSBtb2RpZmllZExpbmVIZWlnaHQucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKGxpbmVIZWlnaHQgPD0gMCkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3Qgc2Nyb2xsTGVmdCA9IHRoaXMuX2VkaXRvci5zY3JvbGxMZWZ0LnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IHcgPSB0aGlzLl9lZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5mb250SW5mbykucmVhZChyZWFkZXIpLnR5cGljYWxIYWxmd2lkdGhDaGFyYWN0ZXJXaWR0aDtcblxuXHRcdFx0Y29uc3QgbW9kaWZpZWRMZWZ0T2Zmc2V0ID0gMyAqIHc7XG5cdFx0XHRjb25zdCBtb2RpZmllZFRvcE9mZnNldCA9IDQ7XG5cdFx0XHRjb25zdCBtb2RpZmllZE9mZnNldCA9IG5ldyBQb2ludChtb2RpZmllZExlZnRPZmZzZXQsIG1vZGlmaWVkVG9wT2Zmc2V0KTtcblxuXHRcdFx0bGV0IGFsdGVybmF0aXZlQWN0aW9uID0gdW5kZWZpbmVkO1xuXHRcdFx0aWYgKHRoaXMuX3ZpZXdEYXRhLmFsdGVybmF0aXZlQWN0aW9uKSB7XG5cdFx0XHRcdGNvbnN0IGxhYmVsID0gdGhpcy5fdmlld0RhdGEuYWx0ZXJuYXRpdmVBY3Rpb24ubGFiZWw7XG5cdFx0XHRcdGNvbnN0IGNvdW50ID0gYWx0Q291bnQucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRjb25zdCBhY3RpdmUgPSBhbHRNb2RpZmllckFjdGl2ZS5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdGNvbnN0IG9jY3VycmVuY2VzTGFiZWwgPSBjb3VudCAhPT0gdW5kZWZpbmVkID8gY291bnQgPT09IDEgP1xuXHRcdFx0XHRcdGxvY2FsaXplKCdsYWJlbE9jY3VyZW5jZScsIFwiezB9IDEgb2NjdXJyZW5jZVwiLCBsYWJlbCkgOlxuXHRcdFx0XHRcdGxvY2FsaXplKCdsYWJlbE9jY3VyZW5jZXMnLCBcInswfSB7MX0gb2NjdXJyZW5jZXNcIiwgbGFiZWwsIGNvdW50KVxuXHRcdFx0XHRcdDogbGFiZWw7XG5cdFx0XHRcdGNvbnN0IGtleWJpbmRpbmdUb29sdGlwID0gbG9jYWxpemUoJ3NoaWZ0VG9TZWVPY2N1cmVuY2VzJywgXCJ7MH0gc2hvdyBvY2N1cnJlbmNlc1wiLCAnW3NoaWZ0XScpO1xuXHRcdFx0XHRhbHRlcm5hdGl2ZUFjdGlvbiA9IHtcblx0XHRcdFx0XHRsYWJlbDogY291bnQgIT09IHVuZGVmaW5lZCA/IChhY3RpdmUgPyBvY2N1cnJlbmNlc0xhYmVsIDogbGFiZWwpIDogbGFiZWwsXG5cdFx0XHRcdFx0dG9vbHRpcDogb2NjdXJyZW5jZXNMYWJlbCA/IGAke29jY3VycmVuY2VzTGFiZWx9XFxuJHtrZXliaW5kaW5nVG9vbHRpcH1gIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGljb246IHVuZGVmaW5lZCwgLy90aGlzLl92aWV3RGF0YS5hbHRlcm5hdGl2ZUFjdGlvbi5pY29uLCBEbyBub3QgcmVuZGVyIGljb24gZm8gdGhlIG1vbWVudFxuXHRcdFx0XHRcdGNvdW50LFxuXHRcdFx0XHRcdGtleWJpbmRpbmc6IHRoaXMuX2tleWJpbmRpbmdTZXJ2aWNlLmxvb2t1cEtleWJpbmRpbmcoaW5saW5lU3VnZ2VzdENvbW1pdEFsdGVybmF0aXZlQWN0aW9uSWQpLFxuXHRcdFx0XHRcdGFjdGl2ZTogYWx0TW9kaWZpZXJBY3RpdmUsXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IG9yaWdpbmFsTGluZSA9IFJlY3QuZnJvbVBvaW50cyh3aWRnZXRTdGFydCwgd2lkZ2V0RW5kKS53aXRoSGVpZ2h0KGxpbmVIZWlnaHQpLnRyYW5zbGF0ZVgoLXNjcm9sbExlZnQpO1xuXHRcdFx0Y29uc3QgY29kZUxpbmUgPSBSZWN0LmZyb21Qb2ludFNpemUob3JpZ2luYWxMaW5lLmdldExlZnRCb3R0b20oKS5hZGQobW9kaWZpZWRPZmZzZXQpLCBuZXcgUG9pbnQodGhpcy5fdmlld0RhdGEuZWRpdC50ZXh0Lmxlbmd0aCAqIHcsIG9yaWdpbmFsTGluZS5oZWlnaHQpKTtcblx0XHRcdGNvbnN0IG1vZGlmaWVkTGluZSA9IGNvZGVMaW5lLndpdGhXaWR0aChjb2RlTGluZS53aWR0aCArIChhbHRlcm5hdGl2ZUFjdGlvbiA/IGFsdGVybmF0aXZlQWN0aW9uLmxhYmVsLmxlbmd0aCAqIHcgKyA4ICsgNCArIDEyIDogMCkpO1xuXHRcdFx0Y29uc3QgbG93ZXJCYWNrZ3JvdW5kID0gbW9kaWZpZWRMaW5lLndpdGhMZWZ0KG9yaWdpbmFsTGluZS5sZWZ0KTtcblxuXHRcdFx0Ly8gZGVidWdWaWV3KGRlYnVnTG9nUmVjdHMoeyBsb3dlckJhY2tncm91bmQgfSwgdGhpcy5fZWRpdG9yLmVkaXRvci5nZXRDb250YWluZXJEb21Ob2RlKCkpLCByZWFkZXIpO1xuXG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRhbHRlcm5hdGl2ZUFjdGlvbixcblx0XHRcdFx0b3JpZ2luYWxMaW5lLFxuXHRcdFx0XHRjb2RlTGluZSxcblx0XHRcdFx0bW9kaWZpZWRMaW5lLFxuXHRcdFx0XHRsb3dlckJhY2tncm91bmQsXG5cdFx0XHRcdGxpbmVIZWlnaHQsXG5cdFx0XHR9O1xuXHRcdH0pO1xuXHRcdHRoaXMubWluRWRpdG9yU2Nyb2xsSGVpZ2h0ID0gZGVyaXZlZCh0aGlzLCByZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgbGF5b3V0ID0gbWFwT3V0RmFsc3kodGhpcy5fbGF5b3V0KS5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAoIWxheW91dCkge1xuXHRcdFx0XHRyZXR1cm4gMDtcblx0XHRcdH1cblx0XHRcdHJldHVybiBsYXlvdXQucmVhZChyZWFkZXIpLm1vZGlmaWVkTGluZS5ib3R0b20gKyBCT1JERVJfV0lEVEggKyB0aGlzLl9lZGl0b3IuZWRpdG9yLmdldFNjcm9sbFRvcCgpO1xuXHRcdH0pO1xuXHRcdHRoaXMuX3Jvb3QgPSBuLmRpdih7XG5cdFx0XHRjbGFzczogJ3dvcmQtcmVwbGFjZW1lbnQnLFxuXHRcdH0sIFtcblx0XHRcdGRlcml2ZWQodGhpcywgcmVhZGVyID0+IHtcblx0XHRcdFx0Y29uc3QgbGF5b3V0ID0gbWFwT3V0RmFsc3kodGhpcy5fbGF5b3V0KS5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdGlmICghbGF5b3V0KSB7XG5cdFx0XHRcdFx0cmV0dXJuIFtdO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3Qgb3JpZ2luYWxCb3JkZXJDb2xvciA9IGdldE9yaWdpbmFsQm9yZGVyQ29sb3IodGhpcy5fdGFiQWN0aW9uKS5tYXAoYyA9PiBhc0Nzc1ZhcmlhYmxlKGMpKS5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdGNvbnN0IG1vZGlmaWVkQm9yZGVyQ29sb3IgPSBnZXRNb2RpZmllZEJvcmRlckNvbG9yKHRoaXMuX3RhYkFjdGlvbikubWFwKGMgPT4gYXNDc3NWYXJpYWJsZShjKSkucmVhZChyZWFkZXIpO1xuXHRcdFx0XHR0aGlzLl9saW5lLnN0eWxlLmxpbmVIZWlnaHQgPSBgJHtsYXlvdXQucmVhZChyZWFkZXIpLm1vZGlmaWVkTGluZS5oZWlnaHQgKyAyICogQk9SREVSX1dJRFRIfXB4YDtcblxuXHRcdFx0XHRjb25zdCBzZWNvbmRhcnlFbGVtZW50SG92ZXJlZCA9IGNvbnN0T2JzZXJ2YWJsZShmYWxzZSk7Ly90aGlzLl9zZWNvbmRhcnlFbGVtZW50Lm1hcCgoZSwgcikgPT4gZT8uaXNIb3ZlcmVkLnJlYWQocikgPz8gZmFsc2UpO1xuXHRcdFx0XHRjb25zdCBhbHRlcm5hdGl2ZUFjdGlvbiA9IGxheW91dC5tYXAobCA9PiBsLmFsdGVybmF0aXZlQWN0aW9uKTtcblx0XHRcdFx0Y29uc3QgYWx0ZXJuYXRpdmVBY3Rpb25BY3RpdmUgPSBkZXJpdmVkKHJlYWRlciA9PiAoYWx0ZXJuYXRpdmVBY3Rpb24ucmVhZChyZWFkZXIpPy5hY3RpdmUucmVhZChyZWFkZXIpID8/IGZhbHNlKSB8fCBzZWNvbmRhcnlFbGVtZW50SG92ZXJlZC5yZWFkKHJlYWRlcikpO1xuXG5cdFx0XHRcdGNvbnN0IGlzSGlnaENvbnRyYXN0ID0gb2JzZXJ2YWJsZUZyb21FdmVudCh0aGlzLl90aGVtZVNlcnZpY2Uub25EaWRDb2xvclRoZW1lQ2hhbmdlLCAoKSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgdGhlbWUgPSB0aGlzLl90aGVtZVNlcnZpY2UuZ2V0Q29sb3JUaGVtZSgpO1xuXHRcdFx0XHRcdHJldHVybiB0aGVtZS50eXBlID09PSAnaGNEYXJrJyB8fCB0aGVtZS50eXBlID09PSAnaGNMaWdodCc7XG5cdFx0XHRcdH0pLnJlYWQocmVhZGVyKTtcblx0XHRcdFx0Y29uc3QgaGNCb3JkZXJDb2xvciA9IGlzSGlnaENvbnRyYXN0ID8gb2JzZXJ2ZUNvbG9yKGNvbnRyYXN0Qm9yZGVyLCB0aGlzLl90aGVtZVNlcnZpY2UpLnJlYWQocmVhZGVyKSA6IG51bGw7XG5cblx0XHRcdFx0Y29uc3QgcHJpbWFyeUFjdGl2ZVN0eWxlcyA9IHtcblx0XHRcdFx0XHRib3JkZXJDb2xvcjogaGNCb3JkZXJDb2xvciA/IGhjQm9yZGVyQ29sb3IudG9TdHJpbmcoKSA6IG1vZGlmaWVkQm9yZGVyQ29sb3IsXG5cdFx0XHRcdFx0YmFja2dyb3VuZENvbG9yOiBhc0Nzc1ZhcmlhYmxlKG1vZGlmaWVkQ2hhbmdlZFRleHRPdmVybGF5Q29sb3IpLFxuXHRcdFx0XHRcdGNvbG9yOiAnJyxcblx0XHRcdFx0XHRvcGFjaXR5OiAnMScsXG5cdFx0XHRcdH07XG5cblx0XHRcdFx0Y29uc3Qgc2Vjb25kYXJ5QWN0aXZlU3R5bGVzID0ge1xuXHRcdFx0XHRcdGJvcmRlckNvbG9yOiBoY0JvcmRlckNvbG9yID8gaGNCb3JkZXJDb2xvci50b1N0cmluZygpIDogYXNDc3NWYXJpYWJsZShpbmxpbmVFZGl0SW5kaWNhdG9yUHJpbWFyeUJvcmRlciksXG5cdFx0XHRcdFx0YmFja2dyb3VuZENvbG9yOiBhc0Nzc1ZhcmlhYmxlKGlubGluZUVkaXRJbmRpY2F0b3JQcmltYXJ5QmFja2dyb3VuZCksXG5cdFx0XHRcdFx0Y29sb3I6IGFzQ3NzVmFyaWFibGUoaW5saW5lRWRpdEluZGljYXRvclByaW1hcnlGb3JlZ3JvdW5kKSxcblx0XHRcdFx0XHRvcGFjaXR5OiAnMScsXG5cdFx0XHRcdH07XG5cblx0XHRcdFx0Y29uc3QgcGFzc2l2ZVN0eWxlcyA9IHtcblx0XHRcdFx0XHRib3JkZXJDb2xvcjogaGNCb3JkZXJDb2xvciA/IGhjQm9yZGVyQ29sb3IudG9TdHJpbmcoKSA6IG9ic2VydmVDb2xvcihlZGl0b3JIb3ZlckZvcmVncm91bmQsIHRoaXMuX3RoZW1lU2VydmljZSkubWFwKGMgPT4gYy50cmFuc3BhcmVudCgwLjIpLnRvU3RyaW5nKCkpLnJlYWQocmVhZGVyKSxcblx0XHRcdFx0XHRiYWNrZ3JvdW5kQ29sb3I6IGdldEVkaXRvckJhY2tncm91bmRDb2xvcih0aGlzLl92aWV3RGF0YS5lZGl0b3JUeXBlKSxcblx0XHRcdFx0XHRjb2xvcjogJycsXG5cdFx0XHRcdFx0b3BhY2l0eTogJzAuNycsXG5cdFx0XHRcdH07XG5cblx0XHRcdFx0Y29uc3QgZWRpdG9yQmFja2dyb3VuZCA9IGdldEVkaXRvckJhY2tncm91bmRDb2xvcih0aGlzLl92aWV3RGF0YS5lZGl0b3JUeXBlKTtcblx0XHRcdFx0Y29uc3QgcHJpbWFyeUFjdGlvblN0eWxlcyA9IGRlcml2ZWQodGhpcywgciA9PiBhbHRlcm5hdGl2ZUFjdGlvbkFjdGl2ZS5yZWFkKHIpID8gcHJpbWFyeUFjdGl2ZVN0eWxlcyA6IHByaW1hcnlBY3RpdmVTdHlsZXMpO1xuXHRcdFx0XHRjb25zdCBzZWNvbmRhcnlBY3Rpb25TdHlsZXMgPSBkZXJpdmVkKHRoaXMsIHIgPT4gYWx0ZXJuYXRpdmVBY3Rpb25BY3RpdmUucmVhZChyKSA/IHNlY29uZGFyeUFjdGl2ZVN0eWxlcyA6IHBhc3NpdmVTdHlsZXMpO1xuXHRcdFx0XHQvLyBUT0RPQGJlbmliZW5qIGNsaWNraW5nIHRoZSBhcnJvdyBkb2VzIG5vdCBhY2NlcHQgc3VnZ2VzdGlvbiBhbnltb3JlXG5cdFx0XHRcdHJldHVybiBbXG5cdFx0XHRcdFx0bi5kaXYoe1xuXHRcdFx0XHRcdFx0aWQ6IERPTV9JRF9PVkVSTEFZLFxuXHRcdFx0XHRcdFx0c3R5bGU6IHtcblx0XHRcdFx0XHRcdFx0cG9zaXRpb246ICdhYnNvbHV0ZScsXG5cdFx0XHRcdFx0XHRcdC4uLnJlY3RUb1Byb3BzKChyKSA9PiBnZXRFZGl0b3JWYWxpZE92ZXJsYXlSZWN0KHRoaXMuX2VkaXRvcikucmVhZChyKSksXG5cdFx0XHRcdFx0XHRcdG92ZXJmbG93OiAnaGlkZGVuJyxcblx0XHRcdFx0XHRcdFx0cG9pbnRlckV2ZW50czogJ25vbmUnLFxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0sIFtcblx0XHRcdFx0XHRcdG4uZGl2KHtcblx0XHRcdFx0XHRcdFx0c3R5bGU6IHtcblx0XHRcdFx0XHRcdFx0XHRwb3NpdGlvbjogJ2Fic29sdXRlJyxcblx0XHRcdFx0XHRcdFx0XHQuLi5yZWN0VG9Qcm9wcyhyZWFkZXIgPT4gbGF5b3V0LnJlYWQocmVhZGVyKS5sb3dlckJhY2tncm91bmQud2l0aE1hcmdpbihCT1JERVJfV0lEVEgsIDIgKiBCT1JERVJfV0lEVEgsIEJPUkRFUl9XSURUSCwgMCkpLFxuXHRcdFx0XHRcdFx0XHRcdGJhY2tncm91bmQ6IGVkaXRvckJhY2tncm91bmQsXG5cdFx0XHRcdFx0XHRcdFx0Y3Vyc29yOiAncG9pbnRlcicsXG5cdFx0XHRcdFx0XHRcdFx0cG9pbnRlckV2ZW50czogJ2F1dG8nLFxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRvbm1vdXNlZG93bjogKGUpID0+IHRoaXMuX21vdXNlRG93bihlKSxcblx0XHRcdFx0XHRcdH0pLFxuXHRcdFx0XHRcdFx0bi5kaXYoe1xuXHRcdFx0XHRcdFx0XHRpZDogRE9NX0lEX1dJREdFVCxcblx0XHRcdFx0XHRcdFx0c3R5bGU6IHtcblx0XHRcdFx0XHRcdFx0XHRwb3NpdGlvbjogJ2Fic29sdXRlJyxcblx0XHRcdFx0XHRcdFx0XHQuLi5yZWN0VG9Qcm9wcyhyZWFkZXIgPT4gbGF5b3V0LnJlYWQocmVhZGVyKS5tb2RpZmllZExpbmUud2l0aE1hcmdpbihCT1JERVJfV0lEVEgsIDIgKiBCT1JERVJfV0lEVEgpKSxcblx0XHRcdFx0XHRcdFx0XHR3aWR0aDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0XHRcdHBvaW50ZXJFdmVudHM6ICdhdXRvJyxcblx0XHRcdFx0XHRcdFx0XHRib3hTaXppbmc6ICdib3JkZXItYm94Jyxcblx0XHRcdFx0XHRcdFx0XHRib3JkZXJSYWRpdXM6IGAke0lOTElORV9FRElUU19CT1JERVJfUkFESVVTfXB4YCxcblxuXHRcdFx0XHRcdFx0XHRcdGJhY2tncm91bmQ6IGVkaXRvckJhY2tncm91bmQsXG5cdFx0XHRcdFx0XHRcdFx0ZGlzcGxheTogJ2ZsZXgnLFxuXHRcdFx0XHRcdFx0XHRcdGp1c3RpZnlDb250ZW50OiAnbGVmdCcsXG5cblx0XHRcdFx0XHRcdFx0XHRvdXRsaW5lOiBgMnB4IHNvbGlkICR7ZWRpdG9yQmFja2dyb3VuZH1gLFxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRvbm1vdXNlZG93bjogKGUpID0+IHRoaXMuX21vdXNlRG93bihlKSxcblx0XHRcdFx0XHRcdH0sIFtcblx0XHRcdFx0XHRcdFx0bi5kaXYoe1xuXHRcdFx0XHRcdFx0XHRcdGlkOiBET01fSURfUkVQTEFDRU1FTlQsXG5cdFx0XHRcdFx0XHRcdFx0c3R5bGU6IHtcblx0XHRcdFx0XHRcdFx0XHRcdGZvbnRGYW1pbHk6IHRoaXMuX2VkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmZvbnRGYW1pbHkpLFxuXHRcdFx0XHRcdFx0XHRcdFx0Zm9udFNpemU6IHRoaXMuX2VkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmZvbnRTaXplKSxcblx0XHRcdFx0XHRcdFx0XHRcdGZvbnRXZWlnaHQ6IHRoaXMuX2VkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmZvbnRXZWlnaHQpLFxuXHRcdFx0XHRcdFx0XHRcdFx0d2lkdGg6IHJlY3RUb1Byb3BzKHJlYWRlciA9PiBsYXlvdXQucmVhZChyZWFkZXIpLmNvZGVMaW5lLndpdGhNYXJnaW4oQk9SREVSX1dJRFRILCAyICogQk9SREVSX1dJRFRIKSkud2lkdGgsXG5cdFx0XHRcdFx0XHRcdFx0XHRib3JkZXJSYWRpdXM6IGAke0lOTElORV9FRElUU19CT1JERVJfUkFESVVTfXB4YCxcblx0XHRcdFx0XHRcdFx0XHRcdGJvcmRlcjogcHJpbWFyeUFjdGlvblN0eWxlcy5tYXAocyA9PiBgJHtCT1JERVJfV0lEVEh9cHggc29saWQgJHtzLmJvcmRlckNvbG9yfWApLFxuXHRcdFx0XHRcdFx0XHRcdFx0Ym94U2l6aW5nOiAnYm9yZGVyLWJveCcsXG5cdFx0XHRcdFx0XHRcdFx0XHRwYWRkaW5nOiBgJHtCT1JERVJfV0lEVEh9cHhgLFxuXHRcdFx0XHRcdFx0XHRcdFx0b3BhY2l0eTogcHJpbWFyeUFjdGlvblN0eWxlcy5tYXAocyA9PiBzLm9wYWNpdHkpLFxuXHRcdFx0XHRcdFx0XHRcdFx0YmFja2dyb3VuZDogcHJpbWFyeUFjdGlvblN0eWxlcy5tYXAocyA9PiBzLmJhY2tncm91bmRDb2xvciksXG5cdFx0XHRcdFx0XHRcdFx0XHRkaXNwbGF5OiAnZmxleCcsXG5cdFx0XHRcdFx0XHRcdFx0XHRqdXN0aWZ5Q29udGVudDogJ2xlZnQnLFxuXHRcdFx0XHRcdFx0XHRcdFx0YWxpZ25JdGVtczogJ2NlbnRlcicsXG5cdFx0XHRcdFx0XHRcdFx0XHRwb2ludGVyRXZlbnRzOiAnYXV0bycsXG5cdFx0XHRcdFx0XHRcdFx0XHRjdXJzb3I6ICdwb2ludGVyJyxcblx0XHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRcdG9ic1JlZjogKGVsZW0pID0+IHtcblx0XHRcdFx0XHRcdFx0XHRcdHRoaXMuX3ByaW1hcnlFbGVtZW50LnNldChlbGVtLCB1bmRlZmluZWQpO1xuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fSwgW3RoaXMuX2xpbmVdKSxcblx0XHRcdFx0XHRcdFx0ZGVyaXZlZCh0aGlzLCByZWFkZXIgPT4ge1xuXHRcdFx0XHRcdFx0XHRcdGNvbnN0IGFsdEFjdGlvbiA9IGFsdGVybmF0aXZlQWN0aW9uLnJlYWQocmVhZGVyKTtcblx0XHRcdFx0XHRcdFx0XHRpZiAoIWFsdEFjdGlvbikge1xuXHRcdFx0XHRcdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0Y29uc3Qga2V5YmluZGluZyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdFx0XHRcdFx0XHRcdGNvbnN0IGtleWJpbmRpbmdMYWJlbCA9IHJlYWRlci5zdG9yZS5hZGQobmV3IEtleWJpbmRpbmdMYWJlbChrZXliaW5kaW5nLCBPUywgeyAuLi51bnRoZW1lZEtleWJpbmRpbmdMYWJlbE9wdGlvbnMsIGRpc2FibGVUaXRsZTogdHJ1ZSB9KSk7XG5cdFx0XHRcdFx0XHRcdFx0a2V5YmluZGluZ0xhYmVsLnNldChhbHRBY3Rpb24ua2V5YmluZGluZyk7XG5cblx0XHRcdFx0XHRcdFx0XHRyZXR1cm4gbi5kaXYoe1xuXHRcdFx0XHRcdFx0XHRcdFx0aWQ6IERPTV9JRF9SRU5BTUUsXG5cdFx0XHRcdFx0XHRcdFx0XHRzdHlsZToge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRwb3NpdGlvbjogJ3JlbGF0aXZlJyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0Ym9yZGVyUmFkaXVzOiBgJHtJTkxJTkVfRURJVFNfQk9SREVSX1JBRElVU31weGAsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdGJvcmRlclRvcDogYCR7Qk9SREVSX1dJRFRIfXB4IHNvbGlkYCxcblx0XHRcdFx0XHRcdFx0XHRcdFx0Ym9yZGVyUmlnaHQ6IGAke0JPUkRFUl9XSURUSH1weCBzb2xpZGAsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdGJvcmRlckJvdHRvbTogYCR7Qk9SREVSX1dJRFRIfXB4IHNvbGlkYCxcblx0XHRcdFx0XHRcdFx0XHRcdFx0Ym9yZGVyTGVmdDogYCR7Qk9SREVSX1dJRFRIfXB4IHNvbGlkYCxcblx0XHRcdFx0XHRcdFx0XHRcdFx0Ym9yZGVyQ29sb3I6IHNlY29uZGFyeUFjdGlvblN0eWxlcy5tYXAocyA9PiBzLmJvcmRlckNvbG9yKSxcblx0XHRcdFx0XHRcdFx0XHRcdFx0b3BhY2l0eTogc2Vjb25kYXJ5QWN0aW9uU3R5bGVzLm1hcChzID0+IHMub3BhY2l0eSksXG5cdFx0XHRcdFx0XHRcdFx0XHRcdGNvbG9yOiBzZWNvbmRhcnlBY3Rpb25TdHlsZXMubWFwKHMgPT4gcy5jb2xvciksXG5cdFx0XHRcdFx0XHRcdFx0XHRcdGRpc3BsYXk6ICdmbGV4Jyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0anVzdGlmeUNvbnRlbnQ6ICdjZW50ZXInLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRhbGlnbkl0ZW1zOiAnY2VudGVyJyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0cGFkZGluZzogJzAgNHB4IDAgMXB4Jyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0bWFyZ2luTGVmdDogJzRweCcsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdGJhY2tncm91bmQ6IHNlY29uZGFyeUFjdGlvblN0eWxlcy5tYXAocyA9PiBzLmJhY2tncm91bmRDb2xvciksXG5cdFx0XHRcdFx0XHRcdFx0XHRcdGN1cnNvcjogJ3BvaW50ZXInLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHR0ZXh0V3JhcDogJ25vd3JhcCcsXG5cdFx0XHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRcdFx0Y2xhc3M6ICdpbmxpbmUtZWRpdC1hbHRlcm5hdGl2ZS1hY3Rpb24tbGFiZWwnLFxuXHRcdFx0XHRcdFx0XHRcdFx0b2JzUmVmOiAoZWxlbSkgPT4ge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHR0aGlzLl9zZWNvbmRhcnlFbGVtZW50LnNldChlbGVtLCB1bmRlZmluZWQpO1xuXHRcdFx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0XHRcdHJlZjogKGVsZW0pID0+IHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0aWYgKGFsdEFjdGlvbi50b29sdGlwKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0cmVhZGVyLnN0b3JlLmFkZCh0aGlzLl9ob3ZlclNlcnZpY2Uuc2V0dXBEZWxheWVkSG92ZXJBdE1vdXNlKGVsZW0sIHsgY29udGVudDogYWx0QWN0aW9uLnRvb2x0aXAsIGFwcGVhcmFuY2U6IHsgY29tcGFjdDogdHJ1ZSB9IH0pKTtcblx0XHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdH0sIFtcblx0XHRcdFx0XHRcdFx0XHRcdGtleWJpbmRpbmcsXG5cdFx0XHRcdFx0XHRcdFx0XHQkKCdkaXYuaW5saW5lLWVkaXQtYWx0ZXJuYXRpdmUtYWN0aW9uLWxhYmVsLXNlcGFyYXRvcicpLFxuXHRcdFx0XHRcdFx0XHRcdFx0YWx0QWN0aW9uLmljb24gPyByZW5kZXJJY29uKGFsdEFjdGlvbi5pY29uKSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdFx0XHRcdGFsdEFjdGlvbi5sYWJlbCxcblx0XHRcdFx0XHRcdFx0XHRdKTtcblx0XHRcdFx0XHRcdFx0fSlcblx0XHRcdFx0XHRcdF0pLFxuXHRcdFx0XHRcdFx0bi5kaXYoe1xuXHRcdFx0XHRcdFx0XHRzdHlsZToge1xuXHRcdFx0XHRcdFx0XHRcdHBvc2l0aW9uOiAnYWJzb2x1dGUnLFxuXHRcdFx0XHRcdFx0XHRcdC4uLnJlY3RUb1Byb3BzKHJlYWRlciA9PiBsYXlvdXQucmVhZChyZWFkZXIpLm9yaWdpbmFsTGluZS53aXRoTWFyZ2luKEJPUkRFUl9XSURUSCkpLFxuXHRcdFx0XHRcdFx0XHRcdGJveFNpemluZzogJ2JvcmRlci1ib3gnLFxuXHRcdFx0XHRcdFx0XHRcdGJvcmRlclJhZGl1czogYCR7SU5MSU5FX0VESVRTX0JPUkRFUl9SQURJVVN9cHhgLFxuXHRcdFx0XHRcdFx0XHRcdGJvcmRlcjogYCR7Qk9SREVSX1dJRFRIfXB4IHNvbGlkICR7b3JpZ2luYWxCb3JkZXJDb2xvcn1gLFxuXHRcdFx0XHRcdFx0XHRcdGJhY2tncm91bmQ6IGFzQ3NzVmFyaWFibGUob3JpZ2luYWxDaGFuZ2VkVGV4dE92ZXJsYXlDb2xvciksXG5cdFx0XHRcdFx0XHRcdFx0cG9pbnRlckV2ZW50czogJ25vbmUnLFxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9LCBbXSksXG5cblx0XHRcdFx0XHRcdG4uc3ZnKHtcblx0XHRcdFx0XHRcdFx0d2lkdGg6IDExLFxuXHRcdFx0XHRcdFx0XHRoZWlnaHQ6IDE0LFxuXHRcdFx0XHRcdFx0XHR2aWV3Qm94OiAnMCAwIDExIDE0Jyxcblx0XHRcdFx0XHRcdFx0ZmlsbDogJ25vbmUnLFxuXHRcdFx0XHRcdFx0XHRzdHlsZToge1xuXHRcdFx0XHRcdFx0XHRcdHBvc2l0aW9uOiAnYWJzb2x1dGUnLFxuXHRcdFx0XHRcdFx0XHRcdGxlZnQ6IGxheW91dC5tYXAobCA9PiBsLm1vZGlmaWVkTGluZS5sZWZ0IC0gMTYpLFxuXHRcdFx0XHRcdFx0XHRcdHRvcDogbGF5b3V0Lm1hcChsID0+IGwubW9kaWZpZWRMaW5lLnRvcCArIE1hdGgucm91bmQoKGwubGluZUhlaWdodCAtIDE0IC0gNSkgLyAyKSksXG5cdFx0XHRcdFx0XHRcdFx0cG9pbnRlckV2ZW50czogJ25vbmUnLFxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRvbm1vdXNlZG93bjogKGUpID0+IHRoaXMuX21vdXNlRG93bihlKSxcblx0XHRcdFx0XHRcdH0sIFtcblx0XHRcdFx0XHRcdFx0bi5zdmdFbGVtKCdwYXRoJywge1xuXHRcdFx0XHRcdFx0XHRcdGQ6ICdNMSAwQzEgMi45ODk2NiAxIDUuOTIwODcgMSA4LjQ5OTUyQzEgOS42MDQwOSAxLjg5NTQzIDEwLjUgMyAxMC41SDEwLjUnLFxuXHRcdFx0XHRcdFx0XHRcdHN0cm9rZTogYXNDc3NWYXJpYWJsZShlZGl0b3JIb3ZlckZvcmVncm91bmQpLFxuXHRcdFx0XHRcdFx0XHR9KSxcblx0XHRcdFx0XHRcdFx0bi5zdmdFbGVtKCdwYXRoJywge1xuXHRcdFx0XHRcdFx0XHRcdGQ6ICdNNiA3LjVMOS45OTk5OSAxMC40OTk5OEw2IDEzLjUnLFxuXHRcdFx0XHRcdFx0XHRcdHN0cm9rZTogYXNDc3NWYXJpYWJsZShlZGl0b3JIb3ZlckZvcmVncm91bmQpLFxuXHRcdFx0XHRcdFx0XHR9KVxuXHRcdFx0XHRcdFx0XSksXG5cblx0XHRcdFx0XHRdKVxuXHRcdFx0XHRdO1xuXHRcdFx0fSlcblx0XHRdKS5rZWVwVXBkYXRlZCh0aGlzLl9zdG9yZSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9lZGl0b3IuY3JlYXRlT3ZlcmxheVdpZGdldCh7XG5cdFx0XHRkb21Ob2RlOiB0aGlzLl9yb290LmVsZW1lbnQsXG5cdFx0XHRtaW5Db250ZW50V2lkdGhJblB4OiBjb25zdE9ic2VydmFibGUoMCksXG5cdFx0XHRwb3NpdGlvbjogY29uc3RPYnNlcnZhYmxlKHsgcHJlZmVyZW5jZTogeyB0b3A6IDAsIGxlZnQ6IDAgfSB9KSxcblx0XHRcdGFsbG93RWRpdG9yT3ZlcmZsb3c6IGZhbHNlLFxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3JlbmRlclRleHRFZmZlY3Q7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfbGF5b3V0O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Jvb3Q7XG5cblx0cHJpdmF0ZSBfbW91c2VEb3duKGU6IE1vdXNlRXZlbnQpOiB2b2lkIHtcblx0XHRjb25zdCB0YXJnZXRfaWQgPSB0cmF2ZXJzZVBhcmVudHNVbnRpbElkKGUudGFyZ2V0IGFzIEhUTUxFbGVtZW50LCBuZXcgU2V0KFtET01fSURfV0lER0VULCBET01fSURfUkVQTEFDRU1FTlQsIERPTV9JRF9SRU5BTUUsIERPTV9JRF9PVkVSTEFZXSkpO1xuXHRcdGlmICghdGFyZ2V0X2lkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGUucHJldmVudERlZmF1bHQoKTsgLy8gVGhpcyBwcmV2ZW50cyB0aGF0IHRoZSBlZGl0b3IgbG9zZXMgZm9jdXNcblx0XHR0aGlzLl9vbkRpZENsaWNrLmZpcmUoSW5saW5lRWRpdENsaWNrRXZlbnQuY3JlYXRlKGUsIHRhcmdldF9pZCA9PT0gRE9NX0lEX1JFTkFNRSkpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIHRyYXZlcnNlUGFyZW50c1VudGlsSWQoZWxlbWVudDogSFRNTEVsZW1lbnQsIGlkczogU2V0PHN0cmluZz4pOiBzdHJpbmcgfCBudWxsIHtcblx0bGV0IGN1cnJlbnQ6IEhUTUxFbGVtZW50IHwgbnVsbCA9IGVsZW1lbnQ7XG5cdHdoaWxlIChjdXJyZW50KSB7XG5cdFx0aWYgKGlkcy5oYXMoY3VycmVudC5pZCkpIHtcblx0XHRcdHJldHVybiBjdXJyZW50LmlkO1xuXHRcdH1cblx0XHRjdXJyZW50ID0gY3VycmVudC5wYXJlbnRFbGVtZW50O1xuXHR9XG5cdHJldHVybiBudWxsO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLEdBQUcsU0FBa0M7QUFDOUMsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxpQkFBaUIsc0NBQXNDO0FBRWhFLFNBQVMsZUFBZTtBQUN4QixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGlCQUFpQixTQUFzQixxQkFBcUIsdUJBQXVCLHVCQUF1QjtBQUNuSCxTQUFTLFVBQVU7QUFDbkIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxxQkFBcUI7QUFDOUIsU0FB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
