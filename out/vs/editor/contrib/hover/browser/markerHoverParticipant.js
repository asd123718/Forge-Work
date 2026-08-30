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
import { isNonEmptyArray } from "../../../../base/common/arrays.js";
import { createCancelablePromise, disposableTimeout } from "../../../../base/common/async.js";
import { onUnexpectedError } from "../../../../base/common/errors.js";
import { Disposable, DisposableStore, toDisposable } from "../../../../base/common/lifecycle.js";
import { basename } from "../../../../base/common/resources.js";
import { EditorOption } from "../../../common/config/editorOptions.js";
import { Range } from "../../../common/core/range.js";
import { CodeActionTriggerType } from "../../../common/languages.js";
import { ILanguageFeaturesService } from "../../../common/services/languageFeatures.js";
import { IMarkerDecorationsService } from "../../../common/services/markerDecorations.js";
import { ApplyCodeActionReason, getCodeActions, quickFixCommandId } from "../../codeAction/browser/codeAction.js";
import { CodeActionController } from "../../codeAction/browser/codeActionController.js";
import { CodeActionKind, CodeActionTriggerSource } from "../../codeAction/common/types.js";
import { MarkerController, NextMarkerAction } from "../../gotoError/browser/gotoError.js";
import { HoverAnchorType, RenderedHoverParts } from "./hoverTypes.js";
import * as nls from "../../../../nls.js";
import { IMenuService, MenuId, MenuItemAction } from "../../../../platform/actions/common/actions.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IMarkerData, MarkerSeverity } from "../../../../platform/markers/common/markers.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { Progress } from "../../../../platform/progress/common/progress.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { Codicon } from "../../../../base/common/codicons.js";
const $ = dom.$;
class MarkerHover {
  constructor(owner, range, marker) {
    this.owner = owner;
    this.range = range;
    this.marker = marker;
  }
  isValidForHoverAnchor(anchor) {
    return anchor.type === HoverAnchorType.Range && this.range.startColumn <= anchor.range.startColumn && this.range.endColumn >= anchor.range.endColumn;
  }
}
const markerCodeActionTrigger = {
  type: CodeActionTriggerType.Invoke,
  filter: { include: CodeActionKind.QuickFix },
  triggerAction: CodeActionTriggerSource.QuickFixHover
};
let MarkerHoverParticipant = class {
  constructor(_editor, _markerDecorationsService, _openerService, _languageFeaturesService, _menuService, _contextKeyService) {
    this._editor = _editor;
    this._markerDecorationsService = _markerDecorationsService;
    this._openerService = _openerService;
    this._languageFeaturesService = _languageFeaturesService;
    this._menuService = _menuService;
    this._contextKeyService = _contextKeyService;
    this.hoverOrdinal = 1;
    this.recentMarkerCodeActionsInfo = void 0;
  }
  computeSync(anchor, lineDecorations) {
    if (!this._editor.hasModel() || anchor.type !== HoverAnchorType.Range && !anchor.supportsMarkerHover) {
      return [];
    }
    const model = this._editor.getModel();
    const anchorRange = anchor.range;
    if (!model.isValidRange(anchor.range)) {
      return [];
    }
    const lineNumber = anchorRange.startLineNumber;
    const maxColumn = model.getLineMaxColumn(lineNumber);
    const result = [];
    for (const d of lineDecorations) {
      const startColumn = d.range.startLineNumber === lineNumber ? d.range.startColumn : 1;
      const endColumn = d.range.endLineNumber === lineNumber ? d.range.endColumn : maxColumn;
      const marker = this._markerDecorationsService.getMarker(model.uri, d);
      if (!marker) {
        continue;
      }
      const range = new Range(anchor.range.startLineNumber, startColumn, anchor.range.startLineNumber, endColumn);
      result.push(new MarkerHover(this, range, marker));
    }
    return result;
  }
  renderHoverParts(context, hoverParts) {
    if (!hoverParts.length) {
      return new RenderedHoverParts([]);
    }
    const renderedHoverParts = [];
    hoverParts.forEach((hoverPart) => {
      const renderedMarkerHover = this._renderMarkerHover(hoverPart);
      context.fragment.appendChild(renderedMarkerHover.hoverElement);
      renderedHoverParts.push(renderedMarkerHover);
    });
    const markerHoverForStatusbar = hoverParts.length === 1 ? hoverParts[0] : hoverParts.sort((a, b) => MarkerSeverity.compare(a.marker.severity, b.marker.severity))[0];
    const disposables = this._renderMarkerStatusbar(context, markerHoverForStatusbar);
    return new RenderedHoverParts(renderedHoverParts, disposables);
  }
  getAccessibleContent(hoverPart) {
    const { marker } = hoverPart;
    const relatedInformation = isNonEmptyArray(marker.relatedInformation) ? marker.relatedInformation.map((related) => `${basename(related.resource)}(${related.startLineNumber}, ${related.startColumn}): ${related.message}`).join("\n") : void 0;
    return [marker.message, relatedInformation].filter((value) => !!value).join("\n");
  }
  _renderMarkerHover(markerHover) {
    const disposables = new DisposableStore();
    const hoverElement = $("div.hover-row");
    const markerElement = dom.append(hoverElement, $("div.marker.hover-contents"));
    const { source, message, code, relatedInformation } = markerHover.marker;
    this._editor.applyFontInfo(markerElement);
    const messageElement = dom.append(markerElement, $("span"));
    messageElement.style.whiteSpace = "pre-wrap";
    messageElement.innerText = message;
    if (source || code) {
      if (code && typeof code !== "string") {
        const sourceAndCodeElement = $("span");
        if (source) {
          const sourceElement = dom.append(sourceAndCodeElement, $("span"));
          sourceElement.innerText = source;
        }
        const codeLink = dom.append(sourceAndCodeElement, $("a.code-link"));
        codeLink.setAttribute("href", code.target.toString(true));
        disposables.add(dom.addDisposableListener(codeLink, "click", (e) => {
          this._openerService.open(code.target);
          e.preventDefault();
          e.stopPropagation();
        }));
        const codeElement = dom.append(codeLink, $("span"));
        codeElement.innerText = code.value;
        const detailsElement = dom.append(markerElement, sourceAndCodeElement);
        detailsElement.style.opacity = "0.6";
        detailsElement.style.paddingLeft = "6px";
      } else {
        const detailsElement = dom.append(markerElement, $("span"));
        detailsElement.style.opacity = "0.6";
        detailsElement.style.paddingLeft = "6px";
        detailsElement.innerText = source && code ? `${source}(${code})` : source ? source : `(${code})`;
      }
    }
    if (isNonEmptyArray(relatedInformation)) {
      for (const { message: message2, resource, startLineNumber, startColumn } of relatedInformation) {
        const relatedInfoContainer = dom.append(markerElement, $("div"));
        relatedInfoContainer.style.marginTop = "8px";
        const a = dom.append(relatedInfoContainer, $("a"));
        a.innerText = `${basename(resource)}(${startLineNumber}, ${startColumn}): `;
        a.style.cursor = "pointer";
        disposables.add(dom.addDisposableListener(a, "click", (e) => {
          e.stopPropagation();
          e.preventDefault();
          if (this._openerService) {
            const editorOptions = { selection: { startLineNumber, startColumn } };
            this._openerService.open(resource, {
              fromUserGesture: true,
              editorOptions
            }).catch(onUnexpectedError);
          }
        }));
        const messageElement2 = dom.append(relatedInfoContainer, $("span"));
        messageElement2.innerText = message2;
        this._editor.applyFontInfo(messageElement2);
      }
    }
    const renderedHoverPart = {
      hoverPart: markerHover,
      hoverElement,
      dispose: () => disposables.dispose()
    };
    return renderedHoverPart;
  }
  _renderMarkerStatusbar(context, markerHover) {
    const disposables = new DisposableStore();
    if (markerHover.marker.severity === MarkerSeverity.Error || markerHover.marker.severity === MarkerSeverity.Warning || markerHover.marker.severity === MarkerSeverity.Info) {
      const markerController = MarkerController.get(this._editor);
      if (markerController) {
        context.statusBar.addAction({
          label: nls.localize("view problem", "View Problem"),
          commandId: NextMarkerAction.ID,
          run: () => {
            context.hide();
            markerController.showAtMarker(markerHover.marker);
            this._editor.focus();
          }
        });
      }
    }
    const menuActions = [];
    for (const [, actions] of this._menuService.getMenuActions(MenuId.MarkerHoverStatusBar, this._contextKeyService)) {
      for (const action of actions) {
        if (action instanceof MenuItemAction && action.enabled) {
          menuActions.push(action);
        }
      }
    }
    const renderMenuActions = () => {
      for (const action of menuActions) {
        context.statusBar.addAction({
          label: action.label,
          commandId: action.id,
          iconClass: action.class,
          run: () => {
            context.hide();
            this._editor.setSelection(Range.lift(markerHover.range));
            action.run();
          }
        });
      }
    };
    if (!this._editor.getOption(EditorOption.readOnly)) {
      const quickfixPlaceholderElement = context.statusBar.append($("div"));
      if (this.recentMarkerCodeActionsInfo) {
        if (IMarkerData.makeKey(this.recentMarkerCodeActionsInfo.marker) === IMarkerData.makeKey(markerHover.marker)) {
          if (!this.recentMarkerCodeActionsInfo.hasCodeActions) {
            if (menuActions.length === 0) {
              quickfixPlaceholderElement.textContent = nls.localize("noQuickFixes", "No quick fixes available");
            }
          }
        } else {
          this.recentMarkerCodeActionsInfo = void 0;
        }
      }
      const updatePlaceholderDisposable = this.recentMarkerCodeActionsInfo && !this.recentMarkerCodeActionsInfo.hasCodeActions ? Disposable.None : disposableTimeout(() => quickfixPlaceholderElement.textContent = nls.localize("checkingForQuickFixes", "Checking for quick fixes..."), 200, disposables);
      if (!quickfixPlaceholderElement.textContent) {
        quickfixPlaceholderElement.textContent = String.fromCharCode(160);
      }
      const codeActionsPromise = this.getCodeActions(markerHover.marker);
      disposables.add(toDisposable(() => codeActionsPromise.cancel()));
      codeActionsPromise.then((actions) => {
        updatePlaceholderDisposable.dispose();
        this.recentMarkerCodeActionsInfo = { marker: markerHover.marker, hasCodeActions: actions.validActions.length > 0 };
        if (!this.recentMarkerCodeActionsInfo.hasCodeActions) {
          actions.dispose();
          if (menuActions.length === 0) {
            quickfixPlaceholderElement.textContent = nls.localize("noQuickFixes", "No quick fixes available");
          } else {
            quickfixPlaceholderElement.style.display = "none";
          }
          renderMenuActions();
          return;
        }
        quickfixPlaceholderElement.style.display = "none";
        let showing = false;
        disposables.add(toDisposable(() => {
          if (!showing) {
            actions.dispose();
          }
        }));
        context.statusBar.addAction({
          label: nls.localize("quick fixes", "Quick Fix..."),
          commandId: quickFixCommandId,
          run: (target) => {
            showing = true;
            const controller = CodeActionController.get(this._editor);
            const elementPosition = dom.getDomNodePagePosition(target);
            controller?.showCodeActions(markerCodeActionTrigger, actions, {
              x: elementPosition.left,
              y: elementPosition.top,
              width: elementPosition.width,
              height: elementPosition.height
            });
          }
        });
        const aiCodeAction = actions.validActions.find((action) => action.action.isAI);
        if (aiCodeAction) {
          context.statusBar.addAction({
            label: aiCodeAction.action.title,
            commandId: aiCodeAction.action.command?.id ?? "",
            iconClass: ThemeIcon.asClassName(Codicon.sparkle),
            run: () => {
              const controller = CodeActionController.get(this._editor);
              controller?.applyCodeAction(aiCodeAction, false, false, ApplyCodeActionReason.FromProblemsHover);
            }
          });
        } else {
          renderMenuActions();
        }
        context.onContentsChanged();
      }, onUnexpectedError);
    } else {
      renderMenuActions();
    }
    return disposables;
  }
  getCodeActions(marker) {
    return createCancelablePromise((cancellationToken) => {
      return getCodeActions(
        this._languageFeaturesService.codeActionProvider,
        this._editor.getModel(),
        new Range(marker.startLineNumber, marker.startColumn, marker.endLineNumber, marker.endColumn),
        markerCodeActionTrigger,
        Progress.None,
        cancellationToken
      );
    });
  }
};
MarkerHoverParticipant = __decorateClass([
  __decorateParam(1, IMarkerDecorationsService),
  __decorateParam(2, IOpenerService),
  __decorateParam(3, ILanguageFeaturesService),
  __decorateParam(4, IMenuService),
  __decorateParam(5, IContextKeyService)
], MarkerHoverParticipant);
export {
  MarkerHover,
  MarkerHoverParticipant
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXGhvdmVyXFxicm93c2VyXFxtYXJrZXJIb3ZlclBhcnRpY2lwYW50LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgaXNOb25FbXB0eUFycmF5IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IENhbmNlbGFibGVQcm9taXNlLCBjcmVhdGVDYW5jZWxhYmxlUHJvbWlzZSwgZGlzcG9zYWJsZVRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBvblVuZXhwZWN0ZWRFcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgYmFzZW5hbWUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgRWRpdG9yT3B0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbmZpZy9lZGl0b3JPcHRpb25zLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgQ29kZUFjdGlvblRyaWdnZXJUeXBlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyBJTW9kZWxEZWNvcmF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9zZXJ2aWNlcy9sYW5ndWFnZUZlYXR1cmVzLmpzJztcbmltcG9ydCB7IElNYXJrZXJEZWNvcmF0aW9uc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vc2VydmljZXMvbWFya2VyRGVjb3JhdGlvbnMuanMnO1xuaW1wb3J0IHsgQXBwbHlDb2RlQWN0aW9uUmVhc29uLCBnZXRDb2RlQWN0aW9ucywgcXVpY2tGaXhDb21tYW5kSWQgfSBmcm9tICcuLi8uLi9jb2RlQWN0aW9uL2Jyb3dzZXIvY29kZUFjdGlvbi5qcyc7XG5pbXBvcnQgeyBDb2RlQWN0aW9uQ29udHJvbGxlciB9IGZyb20gJy4uLy4uL2NvZGVBY3Rpb24vYnJvd3Nlci9jb2RlQWN0aW9uQ29udHJvbGxlci5qcyc7XG5pbXBvcnQgeyBDb2RlQWN0aW9uS2luZCwgQ29kZUFjdGlvblNldCwgQ29kZUFjdGlvblRyaWdnZXIsIENvZGVBY3Rpb25UcmlnZ2VyU291cmNlIH0gZnJvbSAnLi4vLi4vY29kZUFjdGlvbi9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgTWFya2VyQ29udHJvbGxlciwgTmV4dE1hcmtlckFjdGlvbiB9IGZyb20gJy4uLy4uL2dvdG9FcnJvci9icm93c2VyL2dvdG9FcnJvci5qcyc7XG5pbXBvcnQgeyBIb3ZlckFuY2hvciwgSG92ZXJBbmNob3JUeXBlLCBJRWRpdG9ySG92ZXJQYXJ0aWNpcGFudCwgSUVkaXRvckhvdmVyUmVuZGVyQ29udGV4dCwgSUhvdmVyUGFydCwgSVJlbmRlcmVkSG92ZXJQYXJ0LCBJUmVuZGVyZWRIb3ZlclBhcnRzLCBSZW5kZXJlZEhvdmVyUGFydHMgfSBmcm9tICcuL2hvdmVyVHlwZXMuanMnO1xuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJTWVudVNlcnZpY2UsIE1lbnVJZCwgTWVudUl0ZW1BY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSVRleHRFZGl0b3JPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZWRpdG9yL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgSU1hcmtlciwgSU1hcmtlckRhdGEsIE1hcmtlclNldmVyaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbWFya2Vycy9jb21tb24vbWFya2Vycy5qcyc7XG5pbXBvcnQgeyBJT3BlbmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL29wZW5lci9jb21tb24vb3BlbmVyLmpzJztcbmltcG9ydCB7IFByb2dyZXNzIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZ3Jlc3MvY29tbW9uL3Byb2dyZXNzLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuXG5jb25zdCAkID0gZG9tLiQ7XG5cbmV4cG9ydCBjbGFzcyBNYXJrZXJIb3ZlciBpbXBsZW1lbnRzIElIb3ZlclBhcnQge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHB1YmxpYyByZWFkb25seSBvd25lcjogSUVkaXRvckhvdmVyUGFydGljaXBhbnQ8TWFya2VySG92ZXI+LFxuXHRcdHB1YmxpYyByZWFkb25seSByYW5nZTogUmFuZ2UsXG5cdFx0cHVibGljIHJlYWRvbmx5IG1hcmtlcjogSU1hcmtlcixcblx0KSB7IH1cblxuXHRwdWJsaWMgaXNWYWxpZEZvckhvdmVyQW5jaG9yKGFuY2hvcjogSG92ZXJBbmNob3IpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gKFxuXHRcdFx0YW5jaG9yLnR5cGUgPT09IEhvdmVyQW5jaG9yVHlwZS5SYW5nZVxuXHRcdFx0JiYgdGhpcy5yYW5nZS5zdGFydENvbHVtbiA8PSBhbmNob3IucmFuZ2Uuc3RhcnRDb2x1bW5cblx0XHRcdCYmIHRoaXMucmFuZ2UuZW5kQ29sdW1uID49IGFuY2hvci5yYW5nZS5lbmRDb2x1bW5cblx0XHQpO1xuXHR9XG59XG5cbmNvbnN0IG1hcmtlckNvZGVBY3Rpb25UcmlnZ2VyOiBDb2RlQWN0aW9uVHJpZ2dlciA9IHtcblx0dHlwZTogQ29kZUFjdGlvblRyaWdnZXJUeXBlLkludm9rZSxcblx0ZmlsdGVyOiB7IGluY2x1ZGU6IENvZGVBY3Rpb25LaW5kLlF1aWNrRml4IH0sXG5cdHRyaWdnZXJBY3Rpb246IENvZGVBY3Rpb25UcmlnZ2VyU291cmNlLlF1aWNrRml4SG92ZXJcbn07XG5cbmV4cG9ydCBjbGFzcyBNYXJrZXJIb3ZlclBhcnRpY2lwYW50IGltcGxlbWVudHMgSUVkaXRvckhvdmVyUGFydGljaXBhbnQ8TWFya2VySG92ZXI+IHtcblxuXHRwdWJsaWMgcmVhZG9ubHkgaG92ZXJPcmRpbmFsOiBudW1iZXIgPSAxO1xuXG5cdHByaXZhdGUgcmVjZW50TWFya2VyQ29kZUFjdGlvbnNJbmZvOiB7IG1hcmtlcjogSU1hcmtlcjsgaGFzQ29kZUFjdGlvbnM6IGJvb2xlYW4gfSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3I6IElDb2RlRWRpdG9yLFxuXHRcdEBJTWFya2VyRGVjb3JhdGlvbnNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX21hcmtlckRlY29yYXRpb25zU2VydmljZTogSU1hcmtlckRlY29yYXRpb25zU2VydmljZSxcblx0XHRASU9wZW5lclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfb3BlbmVyU2VydmljZTogSU9wZW5lclNlcnZpY2UsXG5cdFx0QElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sYW5ndWFnZUZlYXR1cmVzU2VydmljZTogSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLFxuXHRcdEBJTWVudVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbWVudVNlcnZpY2U6IElNZW51U2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdCkgeyB9XG5cblx0cHVibGljIGNvbXB1dGVTeW5jKGFuY2hvcjogSG92ZXJBbmNob3IsIGxpbmVEZWNvcmF0aW9uczogSU1vZGVsRGVjb3JhdGlvbltdKTogTWFya2VySG92ZXJbXSB7XG5cdFx0aWYgKCF0aGlzLl9lZGl0b3IuaGFzTW9kZWwoKSB8fCBhbmNob3IudHlwZSAhPT0gSG92ZXJBbmNob3JUeXBlLlJhbmdlICYmICFhbmNob3Iuc3VwcG9ydHNNYXJrZXJIb3Zlcikge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblxuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5fZWRpdG9yLmdldE1vZGVsKCk7XG5cdFx0Y29uc3QgYW5jaG9yUmFuZ2UgPSBhbmNob3IucmFuZ2U7XG5cdFx0aWYgKCFtb2RlbC5pc1ZhbGlkUmFuZ2UoYW5jaG9yLnJhbmdlKSkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0XHRjb25zdCBsaW5lTnVtYmVyID0gYW5jaG9yUmFuZ2Uuc3RhcnRMaW5lTnVtYmVyO1xuXHRcdGNvbnN0IG1heENvbHVtbiA9IG1vZGVsLmdldExpbmVNYXhDb2x1bW4obGluZU51bWJlcik7XG5cdFx0Y29uc3QgcmVzdWx0OiBNYXJrZXJIb3ZlcltdID0gW107XG5cdFx0Zm9yIChjb25zdCBkIG9mIGxpbmVEZWNvcmF0aW9ucykge1xuXHRcdFx0Y29uc3Qgc3RhcnRDb2x1bW4gPSAoZC5yYW5nZS5zdGFydExpbmVOdW1iZXIgPT09IGxpbmVOdW1iZXIpID8gZC5yYW5nZS5zdGFydENvbHVtbiA6IDE7XG5cdFx0XHRjb25zdCBlbmRDb2x1bW4gPSAoZC5yYW5nZS5lbmRMaW5lTnVtYmVyID09PSBsaW5lTnVtYmVyKSA/IGQucmFuZ2UuZW5kQ29sdW1uIDogbWF4Q29sdW1uO1xuXG5cdFx0XHRjb25zdCBtYXJrZXIgPSB0aGlzLl9tYXJrZXJEZWNvcmF0aW9uc1NlcnZpY2UuZ2V0TWFya2VyKG1vZGVsLnVyaSwgZCk7XG5cdFx0XHRpZiAoIW1hcmtlcikge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgcmFuZ2UgPSBuZXcgUmFuZ2UoYW5jaG9yLnJhbmdlLnN0YXJ0TGluZU51bWJlciwgc3RhcnRDb2x1bW4sIGFuY2hvci5yYW5nZS5zdGFydExpbmVOdW1iZXIsIGVuZENvbHVtbik7XG5cdFx0XHRyZXN1bHQucHVzaChuZXcgTWFya2VySG92ZXIodGhpcywgcmFuZ2UsIG1hcmtlcikpO1xuXHRcdH1cblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwdWJsaWMgcmVuZGVySG92ZXJQYXJ0cyhjb250ZXh0OiBJRWRpdG9ySG92ZXJSZW5kZXJDb250ZXh0LCBob3ZlclBhcnRzOiBNYXJrZXJIb3ZlcltdKTogSVJlbmRlcmVkSG92ZXJQYXJ0czxNYXJrZXJIb3Zlcj4ge1xuXHRcdGlmICghaG92ZXJQYXJ0cy5sZW5ndGgpIHtcblx0XHRcdHJldHVybiBuZXcgUmVuZGVyZWRIb3ZlclBhcnRzKFtdKTtcblx0XHR9XG5cdFx0Y29uc3QgcmVuZGVyZWRIb3ZlclBhcnRzOiBJUmVuZGVyZWRIb3ZlclBhcnQ8TWFya2VySG92ZXI+W10gPSBbXTtcblx0XHRob3ZlclBhcnRzLmZvckVhY2goaG92ZXJQYXJ0ID0+IHtcblx0XHRcdGNvbnN0IHJlbmRlcmVkTWFya2VySG92ZXIgPSB0aGlzLl9yZW5kZXJNYXJrZXJIb3Zlcihob3ZlclBhcnQpO1xuXHRcdFx0Y29udGV4dC5mcmFnbWVudC5hcHBlbmRDaGlsZChyZW5kZXJlZE1hcmtlckhvdmVyLmhvdmVyRWxlbWVudCk7XG5cdFx0XHRyZW5kZXJlZEhvdmVyUGFydHMucHVzaChyZW5kZXJlZE1hcmtlckhvdmVyKTtcblx0XHR9KTtcblx0XHRjb25zdCBtYXJrZXJIb3ZlckZvclN0YXR1c2JhciA9IGhvdmVyUGFydHMubGVuZ3RoID09PSAxID8gaG92ZXJQYXJ0c1swXSA6IGhvdmVyUGFydHMuc29ydCgoYSwgYikgPT4gTWFya2VyU2V2ZXJpdHkuY29tcGFyZShhLm1hcmtlci5zZXZlcml0eSwgYi5tYXJrZXIuc2V2ZXJpdHkpKVswXTtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IHRoaXMuX3JlbmRlck1hcmtlclN0YXR1c2Jhcihjb250ZXh0LCBtYXJrZXJIb3ZlckZvclN0YXR1c2Jhcik7XG5cdFx0cmV0dXJuIG5ldyBSZW5kZXJlZEhvdmVyUGFydHMocmVuZGVyZWRIb3ZlclBhcnRzLCBkaXNwb3NhYmxlcyk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0QWNjZXNzaWJsZUNvbnRlbnQoaG92ZXJQYXJ0OiBNYXJrZXJIb3Zlcik6IHN0cmluZyB7XG5cdFx0Y29uc3QgeyBtYXJrZXIgfSA9IGhvdmVyUGFydDtcblx0XHRjb25zdCByZWxhdGVkSW5mb3JtYXRpb24gPSBpc05vbkVtcHR5QXJyYXkobWFya2VyLnJlbGF0ZWRJbmZvcm1hdGlvbilcblx0XHRcdD8gbWFya2VyLnJlbGF0ZWRJbmZvcm1hdGlvbi5tYXAocmVsYXRlZCA9PiBgJHtiYXNlbmFtZShyZWxhdGVkLnJlc291cmNlKX0oJHtyZWxhdGVkLnN0YXJ0TGluZU51bWJlcn0sICR7cmVsYXRlZC5zdGFydENvbHVtbn0pOiAke3JlbGF0ZWQubWVzc2FnZX1gKS5qb2luKCdcXG4nKVxuXHRcdFx0OiB1bmRlZmluZWQ7XG5cdFx0cmV0dXJuIFttYXJrZXIubWVzc2FnZSwgcmVsYXRlZEluZm9ybWF0aW9uXS5maWx0ZXIodmFsdWUgPT4gISF2YWx1ZSkuam9pbignXFxuJyk7XG5cdH1cblxuXHRwcml2YXRlIF9yZW5kZXJNYXJrZXJIb3ZlcihtYXJrZXJIb3ZlcjogTWFya2VySG92ZXIpOiBJUmVuZGVyZWRIb3ZlclBhcnQ8TWFya2VySG92ZXI+IHtcblx0XHRjb25zdCBkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IGhvdmVyRWxlbWVudCA9ICQoJ2Rpdi5ob3Zlci1yb3cnKTtcblx0XHRjb25zdCBtYXJrZXJFbGVtZW50ID0gZG9tLmFwcGVuZChob3ZlckVsZW1lbnQsICQoJ2Rpdi5tYXJrZXIuaG92ZXItY29udGVudHMnKSk7XG5cdFx0Y29uc3QgeyBzb3VyY2UsIG1lc3NhZ2UsIGNvZGUsIHJlbGF0ZWRJbmZvcm1hdGlvbiB9ID0gbWFya2VySG92ZXIubWFya2VyO1xuXG5cdFx0dGhpcy5fZWRpdG9yLmFwcGx5Rm9udEluZm8obWFya2VyRWxlbWVudCk7XG5cdFx0Y29uc3QgbWVzc2FnZUVsZW1lbnQgPSBkb20uYXBwZW5kKG1hcmtlckVsZW1lbnQsICQoJ3NwYW4nKSk7XG5cdFx0bWVzc2FnZUVsZW1lbnQuc3R5bGUud2hpdGVTcGFjZSA9ICdwcmUtd3JhcCc7XG5cdFx0bWVzc2FnZUVsZW1lbnQuaW5uZXJUZXh0ID0gbWVzc2FnZTtcblxuXHRcdGlmIChzb3VyY2UgfHwgY29kZSkge1xuXHRcdFx0Ly8gQ29kZSBoYXMgbGlua1xuXHRcdFx0aWYgKGNvZGUgJiYgdHlwZW9mIGNvZGUgIT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdGNvbnN0IHNvdXJjZUFuZENvZGVFbGVtZW50ID0gJCgnc3BhbicpO1xuXHRcdFx0XHRpZiAoc291cmNlKSB7XG5cdFx0XHRcdFx0Y29uc3Qgc291cmNlRWxlbWVudCA9IGRvbS5hcHBlbmQoc291cmNlQW5kQ29kZUVsZW1lbnQsICQoJ3NwYW4nKSk7XG5cdFx0XHRcdFx0c291cmNlRWxlbWVudC5pbm5lclRleHQgPSBzb3VyY2U7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgY29kZUxpbmsgPSBkb20uYXBwZW5kKHNvdXJjZUFuZENvZGVFbGVtZW50LCAkKCdhLmNvZGUtbGluaycpKTtcblx0XHRcdFx0Y29kZUxpbmsuc2V0QXR0cmlidXRlKCdocmVmJywgY29kZS50YXJnZXQudG9TdHJpbmcodHJ1ZSkpO1xuXG5cdFx0XHRcdGRpc3Bvc2FibGVzLmFkZChkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGNvZGVMaW5rLCAnY2xpY2snLCAoZSkgPT4ge1xuXHRcdFx0XHRcdHRoaXMuX29wZW5lclNlcnZpY2Uub3Blbihjb2RlLnRhcmdldCk7XG5cdFx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHRcdH0pKTtcblxuXHRcdFx0XHRjb25zdCBjb2RlRWxlbWVudCA9IGRvbS5hcHBlbmQoY29kZUxpbmssICQoJ3NwYW4nKSk7XG5cdFx0XHRcdGNvZGVFbGVtZW50LmlubmVyVGV4dCA9IGNvZGUudmFsdWU7XG5cblx0XHRcdFx0Y29uc3QgZGV0YWlsc0VsZW1lbnQgPSBkb20uYXBwZW5kKG1hcmtlckVsZW1lbnQsIHNvdXJjZUFuZENvZGVFbGVtZW50KTtcblx0XHRcdFx0ZGV0YWlsc0VsZW1lbnQuc3R5bGUub3BhY2l0eSA9ICcwLjYnO1xuXHRcdFx0XHRkZXRhaWxzRWxlbWVudC5zdHlsZS5wYWRkaW5nTGVmdCA9ICc2cHgnO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3QgZGV0YWlsc0VsZW1lbnQgPSBkb20uYXBwZW5kKG1hcmtlckVsZW1lbnQsICQoJ3NwYW4nKSk7XG5cdFx0XHRcdGRldGFpbHNFbGVtZW50LnN0eWxlLm9wYWNpdHkgPSAnMC42Jztcblx0XHRcdFx0ZGV0YWlsc0VsZW1lbnQuc3R5bGUucGFkZGluZ0xlZnQgPSAnNnB4Jztcblx0XHRcdFx0ZGV0YWlsc0VsZW1lbnQuaW5uZXJUZXh0ID0gc291cmNlICYmIGNvZGUgPyBgJHtzb3VyY2V9KCR7Y29kZX0pYCA6IHNvdXJjZSA/IHNvdXJjZSA6IGAoJHtjb2RlfSlgO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChpc05vbkVtcHR5QXJyYXkocmVsYXRlZEluZm9ybWF0aW9uKSkge1xuXHRcdFx0Zm9yIChjb25zdCB7IG1lc3NhZ2UsIHJlc291cmNlLCBzdGFydExpbmVOdW1iZXIsIHN0YXJ0Q29sdW1uIH0gb2YgcmVsYXRlZEluZm9ybWF0aW9uKSB7XG5cdFx0XHRcdGNvbnN0IHJlbGF0ZWRJbmZvQ29udGFpbmVyID0gZG9tLmFwcGVuZChtYXJrZXJFbGVtZW50LCAkKCdkaXYnKSk7XG5cdFx0XHRcdHJlbGF0ZWRJbmZvQ29udGFpbmVyLnN0eWxlLm1hcmdpblRvcCA9ICc4cHgnO1xuXHRcdFx0XHRjb25zdCBhID0gZG9tLmFwcGVuZChyZWxhdGVkSW5mb0NvbnRhaW5lciwgJCgnYScpKTtcblx0XHRcdFx0YS5pbm5lclRleHQgPSBgJHtiYXNlbmFtZShyZXNvdXJjZSl9KCR7c3RhcnRMaW5lTnVtYmVyfSwgJHtzdGFydENvbHVtbn0pOiBgO1xuXHRcdFx0XHRhLnN0eWxlLmN1cnNvciA9ICdwb2ludGVyJztcblx0XHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIoYSwgJ2NsaWNrJywgKGUpID0+IHtcblx0XHRcdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0XHRpZiAodGhpcy5fb3BlbmVyU2VydmljZSkge1xuXHRcdFx0XHRcdFx0Y29uc3QgZWRpdG9yT3B0aW9uczogSVRleHRFZGl0b3JPcHRpb25zID0geyBzZWxlY3Rpb246IHsgc3RhcnRMaW5lTnVtYmVyLCBzdGFydENvbHVtbiB9IH07XG5cdFx0XHRcdFx0XHR0aGlzLl9vcGVuZXJTZXJ2aWNlLm9wZW4ocmVzb3VyY2UsIHtcblx0XHRcdFx0XHRcdFx0ZnJvbVVzZXJHZXN0dXJlOiB0cnVlLFxuXHRcdFx0XHRcdFx0XHRlZGl0b3JPcHRpb25zXG5cdFx0XHRcdFx0XHR9KS5jYXRjaChvblVuZXhwZWN0ZWRFcnJvcik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KSk7XG5cdFx0XHRcdGNvbnN0IG1lc3NhZ2VFbGVtZW50ID0gZG9tLmFwcGVuZDxIVE1MQW5jaG9yRWxlbWVudD4ocmVsYXRlZEluZm9Db250YWluZXIsICQoJ3NwYW4nKSk7XG5cdFx0XHRcdG1lc3NhZ2VFbGVtZW50LmlubmVyVGV4dCA9IG1lc3NhZ2U7XG5cdFx0XHRcdHRoaXMuX2VkaXRvci5hcHBseUZvbnRJbmZvKG1lc3NhZ2VFbGVtZW50KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCByZW5kZXJlZEhvdmVyUGFydDogSVJlbmRlcmVkSG92ZXJQYXJ0PE1hcmtlckhvdmVyPiA9IHtcblx0XHRcdGhvdmVyUGFydDogbWFya2VySG92ZXIsXG5cdFx0XHRob3ZlckVsZW1lbnQsXG5cdFx0XHRkaXNwb3NlOiAoKSA9PiBkaXNwb3NhYmxlcy5kaXNwb3NlKClcblx0XHR9O1xuXHRcdHJldHVybiByZW5kZXJlZEhvdmVyUGFydDtcblx0fVxuXG5cdHByaXZhdGUgX3JlbmRlck1hcmtlclN0YXR1c2Jhcihjb250ZXh0OiBJRWRpdG9ySG92ZXJSZW5kZXJDb250ZXh0LCBtYXJrZXJIb3ZlcjogTWFya2VySG92ZXIpOiBJRGlzcG9zYWJsZSB7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0aWYgKG1hcmtlckhvdmVyLm1hcmtlci5zZXZlcml0eSA9PT0gTWFya2VyU2V2ZXJpdHkuRXJyb3IgfHwgbWFya2VySG92ZXIubWFya2VyLnNldmVyaXR5ID09PSBNYXJrZXJTZXZlcml0eS5XYXJuaW5nIHx8IG1hcmtlckhvdmVyLm1hcmtlci5zZXZlcml0eSA9PT0gTWFya2VyU2V2ZXJpdHkuSW5mbykge1xuXHRcdFx0Y29uc3QgbWFya2VyQ29udHJvbGxlciA9IE1hcmtlckNvbnRyb2xsZXIuZ2V0KHRoaXMuX2VkaXRvcik7XG5cdFx0XHRpZiAobWFya2VyQ29udHJvbGxlcikge1xuXHRcdFx0XHRjb250ZXh0LnN0YXR1c0Jhci5hZGRBY3Rpb24oe1xuXHRcdFx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUoJ3ZpZXcgcHJvYmxlbScsIFwiVmlldyBQcm9ibGVtXCIpLFxuXHRcdFx0XHRcdGNvbW1hbmRJZDogTmV4dE1hcmtlckFjdGlvbi5JRCxcblx0XHRcdFx0XHRydW46ICgpID0+IHtcblx0XHRcdFx0XHRcdGNvbnRleHQuaGlkZSgpO1xuXHRcdFx0XHRcdFx0bWFya2VyQ29udHJvbGxlci5zaG93QXRNYXJrZXIobWFya2VySG92ZXIubWFya2VyKTtcblx0XHRcdFx0XHRcdHRoaXMuX2VkaXRvci5mb2N1cygpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gTWVudS1jb250cmlidXRlZCBhY3Rpb25zIChlLmcuIGZpeCB3aXRoIGlubGluZSBjaGF0KVxuXHRcdGNvbnN0IG1lbnVBY3Rpb25zOiBNZW51SXRlbUFjdGlvbltdID0gW107XG5cdFx0Zm9yIChjb25zdCBbLCBhY3Rpb25zXSBvZiB0aGlzLl9tZW51U2VydmljZS5nZXRNZW51QWN0aW9ucyhNZW51SWQuTWFya2VySG92ZXJTdGF0dXNCYXIsIHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlKSkge1xuXHRcdFx0Zm9yIChjb25zdCBhY3Rpb24gb2YgYWN0aW9ucykge1xuXHRcdFx0XHRpZiAoYWN0aW9uIGluc3RhbmNlb2YgTWVudUl0ZW1BY3Rpb24gJiYgYWN0aW9uLmVuYWJsZWQpIHtcblx0XHRcdFx0XHRtZW51QWN0aW9ucy5wdXNoKGFjdGlvbik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0Y29uc3QgcmVuZGVyTWVudUFjdGlvbnMgPSAoKSA9PiB7XG5cdFx0XHRmb3IgKGNvbnN0IGFjdGlvbiBvZiBtZW51QWN0aW9ucykge1xuXHRcdFx0XHRjb250ZXh0LnN0YXR1c0Jhci5hZGRBY3Rpb24oe1xuXHRcdFx0XHRcdGxhYmVsOiBhY3Rpb24ubGFiZWwsXG5cdFx0XHRcdFx0Y29tbWFuZElkOiBhY3Rpb24uaWQsXG5cdFx0XHRcdFx0aWNvbkNsYXNzOiBhY3Rpb24uY2xhc3MsXG5cdFx0XHRcdFx0cnVuOiAoKSA9PiB7XG5cdFx0XHRcdFx0XHRjb250ZXh0LmhpZGUoKTtcblx0XHRcdFx0XHRcdHRoaXMuX2VkaXRvci5zZXRTZWxlY3Rpb24oUmFuZ2UubGlmdChtYXJrZXJIb3Zlci5yYW5nZSkpO1xuXHRcdFx0XHRcdFx0YWN0aW9uLnJ1bigpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGlmICghdGhpcy5fZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24ucmVhZE9ubHkpKSB7XG5cdFx0XHRjb25zdCBxdWlja2ZpeFBsYWNlaG9sZGVyRWxlbWVudCA9IGNvbnRleHQuc3RhdHVzQmFyLmFwcGVuZCgkKCdkaXYnKSk7XG5cdFx0XHRpZiAodGhpcy5yZWNlbnRNYXJrZXJDb2RlQWN0aW9uc0luZm8pIHtcblx0XHRcdFx0aWYgKElNYXJrZXJEYXRhLm1ha2VLZXkodGhpcy5yZWNlbnRNYXJrZXJDb2RlQWN0aW9uc0luZm8ubWFya2VyKSA9PT0gSU1hcmtlckRhdGEubWFrZUtleShtYXJrZXJIb3Zlci5tYXJrZXIpKSB7XG5cdFx0XHRcdFx0aWYgKCF0aGlzLnJlY2VudE1hcmtlckNvZGVBY3Rpb25zSW5mby5oYXNDb2RlQWN0aW9ucykge1xuXHRcdFx0XHRcdFx0aWYgKG1lbnVBY3Rpb25zLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRcdFx0XHRxdWlja2ZpeFBsYWNlaG9sZGVyRWxlbWVudC50ZXh0Q29udGVudCA9IG5scy5sb2NhbGl6ZSgnbm9RdWlja0ZpeGVzJywgXCJObyBxdWljayBmaXhlcyBhdmFpbGFibGVcIik7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMucmVjZW50TWFya2VyQ29kZUFjdGlvbnNJbmZvID0gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRjb25zdCB1cGRhdGVQbGFjZWhvbGRlckRpc3Bvc2FibGUgPSB0aGlzLnJlY2VudE1hcmtlckNvZGVBY3Rpb25zSW5mbyAmJiAhdGhpcy5yZWNlbnRNYXJrZXJDb2RlQWN0aW9uc0luZm8uaGFzQ29kZUFjdGlvbnMgPyBEaXNwb3NhYmxlLk5vbmUgOiBkaXNwb3NhYmxlVGltZW91dCgoKSA9PiBxdWlja2ZpeFBsYWNlaG9sZGVyRWxlbWVudC50ZXh0Q29udGVudCA9IG5scy5sb2NhbGl6ZSgnY2hlY2tpbmdGb3JRdWlja0ZpeGVzJywgXCJDaGVja2luZyBmb3IgcXVpY2sgZml4ZXMuLi5cIiksIDIwMCwgZGlzcG9zYWJsZXMpO1xuXHRcdFx0aWYgKCFxdWlja2ZpeFBsYWNlaG9sZGVyRWxlbWVudC50ZXh0Q29udGVudCkge1xuXHRcdFx0XHQvLyBIYXZlIHNvbWUgY29udGVudCBpbiBoZXJlIHRvIGF2b2lkIGZsaWNrZXJpbmdcblx0XHRcdFx0cXVpY2tmaXhQbGFjZWhvbGRlckVsZW1lbnQudGV4dENvbnRlbnQgPSBTdHJpbmcuZnJvbUNoYXJDb2RlKDB4QTApOyAvLyAmbmJzcDtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGNvZGVBY3Rpb25zUHJvbWlzZSA9IHRoaXMuZ2V0Q29kZUFjdGlvbnMobWFya2VySG92ZXIubWFya2VyKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gY29kZUFjdGlvbnNQcm9taXNlLmNhbmNlbCgpKSk7XG5cdFx0XHRjb2RlQWN0aW9uc1Byb21pc2UudGhlbihhY3Rpb25zID0+IHtcblx0XHRcdFx0dXBkYXRlUGxhY2Vob2xkZXJEaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0XHRcdFx0dGhpcy5yZWNlbnRNYXJrZXJDb2RlQWN0aW9uc0luZm8gPSB7IG1hcmtlcjogbWFya2VySG92ZXIubWFya2VyLCBoYXNDb2RlQWN0aW9uczogYWN0aW9ucy52YWxpZEFjdGlvbnMubGVuZ3RoID4gMCB9O1xuXG5cdFx0XHRcdGlmICghdGhpcy5yZWNlbnRNYXJrZXJDb2RlQWN0aW9uc0luZm8uaGFzQ29kZUFjdGlvbnMpIHtcblx0XHRcdFx0XHRhY3Rpb25zLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRpZiAobWVudUFjdGlvbnMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdFx0XHRxdWlja2ZpeFBsYWNlaG9sZGVyRWxlbWVudC50ZXh0Q29udGVudCA9IG5scy5sb2NhbGl6ZSgnbm9RdWlja0ZpeGVzJywgXCJObyBxdWljayBmaXhlcyBhdmFpbGFibGVcIik7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHF1aWNrZml4UGxhY2Vob2xkZXJFbGVtZW50LnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJlbmRlck1lbnVBY3Rpb25zKCk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHF1aWNrZml4UGxhY2Vob2xkZXJFbGVtZW50LnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cblx0XHRcdFx0bGV0IHNob3dpbmcgPSBmYWxzZTtcblx0XHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHRcdFx0aWYgKCFzaG93aW5nKSB7XG5cdFx0XHRcdFx0XHRhY3Rpb25zLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pKTtcblxuXHRcdFx0XHRjb250ZXh0LnN0YXR1c0Jhci5hZGRBY3Rpb24oe1xuXHRcdFx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUoJ3F1aWNrIGZpeGVzJywgXCJRdWljayBGaXguLi5cIiksXG5cdFx0XHRcdFx0Y29tbWFuZElkOiBxdWlja0ZpeENvbW1hbmRJZCxcblx0XHRcdFx0XHRydW46ICh0YXJnZXQpID0+IHtcblx0XHRcdFx0XHRcdHNob3dpbmcgPSB0cnVlO1xuXHRcdFx0XHRcdFx0Y29uc3QgY29udHJvbGxlciA9IENvZGVBY3Rpb25Db250cm9sbGVyLmdldCh0aGlzLl9lZGl0b3IpO1xuXHRcdFx0XHRcdFx0Y29uc3QgZWxlbWVudFBvc2l0aW9uID0gZG9tLmdldERvbU5vZGVQYWdlUG9zaXRpb24odGFyZ2V0KTtcblx0XHRcdFx0XHRcdGNvbnRyb2xsZXI/LnNob3dDb2RlQWN0aW9ucyhtYXJrZXJDb2RlQWN0aW9uVHJpZ2dlciwgYWN0aW9ucywge1xuXHRcdFx0XHRcdFx0XHR4OiBlbGVtZW50UG9zaXRpb24ubGVmdCxcblx0XHRcdFx0XHRcdFx0eTogZWxlbWVudFBvc2l0aW9uLnRvcCxcblx0XHRcdFx0XHRcdFx0d2lkdGg6IGVsZW1lbnRQb3NpdGlvbi53aWR0aCxcblx0XHRcdFx0XHRcdFx0aGVpZ2h0OiBlbGVtZW50UG9zaXRpb24uaGVpZ2h0XG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdGNvbnN0IGFpQ29kZUFjdGlvbiA9IGFjdGlvbnMudmFsaWRBY3Rpb25zLmZpbmQoYWN0aW9uID0+IGFjdGlvbi5hY3Rpb24uaXNBSSk7XG5cdFx0XHRcdGlmIChhaUNvZGVBY3Rpb24pIHtcblx0XHRcdFx0XHRjb250ZXh0LnN0YXR1c0Jhci5hZGRBY3Rpb24oe1xuXHRcdFx0XHRcdFx0bGFiZWw6IGFpQ29kZUFjdGlvbi5hY3Rpb24udGl0bGUsXG5cdFx0XHRcdFx0XHRjb21tYW5kSWQ6IGFpQ29kZUFjdGlvbi5hY3Rpb24uY29tbWFuZD8uaWQgPz8gJycsXG5cdFx0XHRcdFx0XHRpY29uQ2xhc3M6IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShDb2RpY29uLnNwYXJrbGUpLFxuXHRcdFx0XHRcdFx0cnVuOiAoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBDb2RlQWN0aW9uQ29udHJvbGxlci5nZXQodGhpcy5fZWRpdG9yKTtcblx0XHRcdFx0XHRcdFx0Y29udHJvbGxlcj8uYXBwbHlDb2RlQWN0aW9uKGFpQ29kZUFjdGlvbiwgZmFsc2UsIGZhbHNlLCBBcHBseUNvZGVBY3Rpb25SZWFzb24uRnJvbVByb2JsZW1zSG92ZXIpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdC8vIE9ubHkgc2hvdyBtZW51LWNvbnRyaWJ1dGVkIGFjdGlvbnMgKGUuZy4gaW5saW5lIGNoYXQgRml4KSB3aGVuIHRoZXJlXG5cdFx0XHRcdFx0Ly8gaXMgbm8gQUkgY29kZSBhY3Rpb24sIHRvIGF2b2lkIGR1cGxpY2F0ZSBGaXggZW50cnkgcG9pbnRzLlxuXHRcdFx0XHRcdHJlbmRlck1lbnVBY3Rpb25zKCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBOb3RpZnkgdGhhdCB0aGUgY29udGVudHMgaGF2ZSBjaGFuZ2VkIGdpdmVuIHdlIGFkZGVkXG5cdFx0XHRcdC8vIGFjdGlvbnMgdG8gdGhlIGhvdmVyXG5cdFx0XHRcdC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8yNTA0MjRcblx0XHRcdFx0Y29udGV4dC5vbkNvbnRlbnRzQ2hhbmdlZCgpO1xuXG5cdFx0XHR9LCBvblVuZXhwZWN0ZWRFcnJvcik7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJlbmRlck1lbnVBY3Rpb25zKCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGRpc3Bvc2FibGVzO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRDb2RlQWN0aW9ucyhtYXJrZXI6IElNYXJrZXIpOiBDYW5jZWxhYmxlUHJvbWlzZTxDb2RlQWN0aW9uU2V0PiB7XG5cdFx0cmV0dXJuIGNyZWF0ZUNhbmNlbGFibGVQcm9taXNlKGNhbmNlbGxhdGlvblRva2VuID0+IHtcblx0XHRcdHJldHVybiBnZXRDb2RlQWN0aW9ucyhcblx0XHRcdFx0dGhpcy5fbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuY29kZUFjdGlvblByb3ZpZGVyLFxuXHRcdFx0XHR0aGlzLl9lZGl0b3IuZ2V0TW9kZWwoKSEsXG5cdFx0XHRcdG5ldyBSYW5nZShtYXJrZXIuc3RhcnRMaW5lTnVtYmVyLCBtYXJrZXIuc3RhcnRDb2x1bW4sIG1hcmtlci5lbmRMaW5lTnVtYmVyLCBtYXJrZXIuZW5kQ29sdW1uKSxcblx0XHRcdFx0bWFya2VyQ29kZUFjdGlvblRyaWdnZXIsXG5cdFx0XHRcdFByb2dyZXNzLk5vbmUsXG5cdFx0XHRcdGNhbmNlbGxhdGlvblRva2VuKTtcblx0XHR9KTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxZQUFZLFNBQVM7QUFDckIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBNEIseUJBQXlCLHlCQUF5QjtBQUM5RSxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLFlBQVksaUJBQThCLG9CQUFvQjtBQUN2RSxTQUFTLGdCQUFnQjtBQUV6QixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLGFBQWE7QUFDdEIsU0FBUyw2QkFBNkI7QUFFdEMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxpQ0FBaUM7QUFDMUMsU0FBUyx1QkFBdUIsZ0JBQWdCLHlCQUF5QjtBQUN6RSxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLGdCQUFrRCwrQkFBK0I7QUFD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
