import { addStandardDisposableListener, getDomNodePagePosition } from "../../../../../../base/browser/dom.js";
import { Action } from "../../../../../../base/common/actions.js";
import { Codicon } from "../../../../../../base/common/codicons.js";
import { Disposable } from "../../../../../../base/common/lifecycle.js";
import { isIOS } from "../../../../../../base/common/platform.js";
import { ThemeIcon } from "../../../../../../base/common/themables.js";
import { MouseTargetType } from "../../../../editorBrowser.js";
import { EditorOption } from "../../../../../common/config/editorOptions.js";
import { EndOfLineSequence } from "../../../../../common/model.js";
import { localize } from "../../../../../../nls.js";
import { enableCopySelection } from "./copySelection.js";
class InlineDiffDeletedCodeMargin extends Disposable {
  constructor(_getViewZoneId, _marginDomNode, _deletedCodeDomNode, _modifiedEditor, _diff, _editor, _renderLinesResult, _originalTextModel, _contextMenuService, _clipboardService) {
    super();
    this._getViewZoneId = _getViewZoneId;
    this._marginDomNode = _marginDomNode;
    this._deletedCodeDomNode = _deletedCodeDomNode;
    this._modifiedEditor = _modifiedEditor;
    this._diff = _diff;
    this._editor = _editor;
    this._renderLinesResult = _renderLinesResult;
    this._originalTextModel = _originalTextModel;
    this._contextMenuService = _contextMenuService;
    this._clipboardService = _clipboardService;
    this._visibility = false;
    this._marginDomNode.style.zIndex = "10";
    this._diffActions = document.createElement("div");
    this._diffActions.className = ThemeIcon.asClassName(Codicon.lightBulb) + " lightbulb-glyph";
    this._diffActions.style.position = "absolute";
    const lineHeight = this._modifiedEditor.getOption(EditorOption.lineHeight);
    this._diffActions.style.right = "0px";
    this._diffActions.style.visibility = "hidden";
    this._diffActions.style.height = `${lineHeight}px`;
    this._diffActions.style.lineHeight = `${lineHeight}px`;
    this._marginDomNode.appendChild(this._diffActions);
    let currentLineNumberOffset = 0;
    const useShadowDOM = _modifiedEditor.getOption(EditorOption.useShadowDOM) && !isIOS;
    const showContextMenu = (anchor, baseActions, onHide) => {
      this._contextMenuService.showContextMenu({
        domForShadowRoot: useShadowDOM ? _modifiedEditor.getDomNode() ?? void 0 : void 0,
        getAnchor: () => anchor,
        onHide,
        getActions: () => {
          const actions = baseActions ?? [];
          const isDeletion = _diff.modified.isEmpty;
          actions.push(new Action(
            "diff.clipboard.copyDeletedContent",
            isDeletion ? _diff.original.length > 1 ? localize("diff.clipboard.copyDeletedLinesContent.label", "Copy deleted lines") : localize("diff.clipboard.copyDeletedLinesContent.single.label", "Copy deleted line") : _diff.original.length > 1 ? localize("diff.clipboard.copyChangedLinesContent.label", "Copy changed lines") : localize("diff.clipboard.copyChangedLinesContent.single.label", "Copy changed line"),
            void 0,
            true,
            async () => {
              const originalText = this._originalTextModel.getValueInRange(_diff.original.toExclusiveRange());
              await this._clipboardService.writeText(originalText);
            }
          ));
          if (_diff.original.length > 1) {
            actions.push(new Action(
              "diff.clipboard.copyDeletedLineContent",
              isDeletion ? localize(
                "diff.clipboard.copyDeletedLineContent.label",
                "Copy deleted line ({0})",
                _diff.original.startLineNumber + currentLineNumberOffset
              ) : localize(
                "diff.clipboard.copyChangedLineContent.label",
                "Copy changed line ({0})",
                _diff.original.startLineNumber + currentLineNumberOffset
              ),
              void 0,
              true,
              async () => {
                let lineContent = this._originalTextModel.getLineContent(_diff.original.startLineNumber + currentLineNumberOffset);
                if (lineContent === "") {
                  const eof = this._originalTextModel.getEndOfLineSequence();
                  lineContent = eof === EndOfLineSequence.LF ? "\n" : "\r\n";
                }
                await this._clipboardService.writeText(lineContent);
              }
            ));
          }
          const readOnly = _modifiedEditor.getOption(EditorOption.readOnly);
          if (!readOnly) {
            actions.push(
              new Action(
                "diff.inline.revertChange",
                localize("diff.inline.revertChange.label", "Revert this change"),
                void 0,
                true,
                async () => {
                  this._editor.revert(this._diff);
                }
              )
            );
          }
          return actions;
        },
        autoSelectFirstItem: true
      });
    };
    this._register(addStandardDisposableListener(this._diffActions, "mousedown", (e) => {
      if (!e.leftButton) {
        return;
      }
      const { top, height } = getDomNodePagePosition(this._diffActions);
      const pad = Math.floor(lineHeight / 3);
      e.preventDefault();
      showContextMenu({ x: e.posx, y: top + height + pad });
    }));
    this._register(_modifiedEditor.onMouseMove((e) => {
      if ((e.target.type === MouseTargetType.CONTENT_VIEW_ZONE || e.target.type === MouseTargetType.GUTTER_VIEW_ZONE) && e.target.detail.viewZoneId === this._getViewZoneId()) {
        currentLineNumberOffset = this._updateLightBulbPosition(this._marginDomNode, e.event.browserEvent.y, lineHeight);
        this.visibility = true;
      } else {
        this.visibility = false;
      }
    }));
    this._register(enableCopySelection({
      domNode: this._deletedCodeDomNode,
      diffEntry: _diff,
      originalModel: this._originalTextModel,
      renderLinesResult: this._renderLinesResult,
      clipboardService: _clipboardService
    }));
  }
  get visibility() {
    return this._visibility;
  }
  set visibility(_visibility) {
    if (this._visibility !== _visibility) {
      this._visibility = _visibility;
      this._diffActions.style.visibility = _visibility ? "visible" : "hidden";
    }
  }
  _updateLightBulbPosition(marginDomNode, y, lineHeight) {
    const { top } = getDomNodePagePosition(marginDomNode);
    const offset = y - top;
    const lineNumberOffset = Math.floor(offset / lineHeight);
    const newTop = lineNumberOffset * lineHeight;
    this._diffActions.style.top = `${newTop}px`;
    if (this._renderLinesResult.viewLineCounts) {
      let acc = 0;
      for (let i = 0; i < this._renderLinesResult.viewLineCounts.length; i++) {
        acc += this._renderLinesResult.viewLineCounts[i];
        if (lineNumberOffset < acc) {
          return i;
        }
      }
    }
    return lineNumberOffset;
  }
}
export {
  InlineDiffDeletedCodeMargin
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGJyb3dzZXJcXHdpZGdldFxcZGlmZkVkaXRvclxcY29tcG9uZW50c1xcZGlmZkVkaXRvclZpZXdab25lc1xcaW5saW5lRGlmZkRlbGV0ZWRDb2RlTWFyZ2luLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgYWRkU3RhbmRhcmREaXNwb3NhYmxlTGlzdGVuZXIsIGdldERvbU5vZGVQYWdlUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IEFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgaXNJT1MgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgSUVkaXRvck1vdXNlRXZlbnQsIE1vdXNlVGFyZ2V0VHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgQ29kZUVkaXRvcldpZGdldCB9IGZyb20gJy4uLy4uLy4uL2NvZGVFZGl0b3IvY29kZUVkaXRvcldpZGdldC5qcyc7XG5pbXBvcnQgeyBEaWZmRWRpdG9yV2lkZ2V0IH0gZnJvbSAnLi4vLi4vZGlmZkVkaXRvcldpZGdldC5qcyc7XG5pbXBvcnQgeyBFZGl0b3JPcHRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9jb21tb24vY29uZmlnL2VkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgRGV0YWlsZWRMaW5lUmFuZ2VNYXBwaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vY29tbW9uL2RpZmYvcmFuZ2VNYXBwaW5nLmpzJztcbmltcG9ydCB7IEVuZE9mTGluZVNlcXVlbmNlLCBJVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElDbGlwYm9hcmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY2xpcGJvYXJkL2NvbW1vbi9jbGlwYm9hcmRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDb250ZXh0TWVudVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IGVuYWJsZUNvcHlTZWxlY3Rpb24gfSBmcm9tICcuL2NvcHlTZWxlY3Rpb24uanMnO1xuaW1wb3J0IHsgUmVuZGVyTGluZXNSZXN1bHQgfSBmcm9tICcuL3JlbmRlckxpbmVzLmpzJztcblxuZXhwb3J0IGNsYXNzIElubGluZURpZmZEZWxldGVkQ29kZU1hcmdpbiBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kaWZmQWN0aW9uczogSFRNTEVsZW1lbnQ7XG5cblx0cHJpdmF0ZSBfdmlzaWJpbGl0eTogYm9vbGVhbiA9IGZhbHNlO1xuXG5cdGdldCB2aXNpYmlsaXR5KCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl92aXNpYmlsaXR5O1xuXHR9XG5cblx0c2V0IHZpc2liaWxpdHkoX3Zpc2liaWxpdHk6IGJvb2xlYW4pIHtcblx0XHRpZiAodGhpcy5fdmlzaWJpbGl0eSAhPT0gX3Zpc2liaWxpdHkpIHtcblx0XHRcdHRoaXMuX3Zpc2liaWxpdHkgPSBfdmlzaWJpbGl0eTtcblx0XHRcdHRoaXMuX2RpZmZBY3Rpb25zLnN0eWxlLnZpc2liaWxpdHkgPSBfdmlzaWJpbGl0eSA/ICd2aXNpYmxlJyA6ICdoaWRkZW4nO1xuXHRcdH1cblx0fVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2dldFZpZXdab25lSWQ6ICgpID0+IHN0cmluZyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9tYXJnaW5Eb21Ob2RlOiBIVE1MRWxlbWVudCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9kZWxldGVkQ29kZURvbU5vZGU6IEhUTUxFbGVtZW50LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX21vZGlmaWVkRWRpdG9yOiBDb2RlRWRpdG9yV2lkZ2V0LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2RpZmY6IERldGFpbGVkTGluZVJhbmdlTWFwcGluZyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3I6IERpZmZFZGl0b3JXaWRnZXQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfcmVuZGVyTGluZXNSZXN1bHQ6IFJlbmRlckxpbmVzUmVzdWx0LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX29yaWdpbmFsVGV4dE1vZGVsOiBJVGV4dE1vZGVsLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2NvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9jbGlwYm9hcmRTZXJ2aWNlOiBJQ2xpcGJvYXJkU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdC8vIG1ha2Ugc3VyZSB0aGUgZGlmZiBtYXJnaW4gc2hvd3MgYWJvdmUgb3ZlcmxheS5cblx0XHR0aGlzLl9tYXJnaW5Eb21Ob2RlLnN0eWxlLnpJbmRleCA9ICcxMCc7XG5cblx0XHR0aGlzLl9kaWZmQWN0aW9ucyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdHRoaXMuX2RpZmZBY3Rpb25zLmNsYXNzTmFtZSA9IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShDb2RpY29uLmxpZ2h0QnVsYikgKyAnIGxpZ2h0YnVsYi1nbHlwaCc7XG5cdFx0dGhpcy5fZGlmZkFjdGlvbnMuc3R5bGUucG9zaXRpb24gPSAnYWJzb2x1dGUnO1xuXHRcdGNvbnN0IGxpbmVIZWlnaHQgPSB0aGlzLl9tb2RpZmllZEVkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmxpbmVIZWlnaHQpO1xuXHRcdHRoaXMuX2RpZmZBY3Rpb25zLnN0eWxlLnJpZ2h0ID0gJzBweCc7XG5cdFx0dGhpcy5fZGlmZkFjdGlvbnMuc3R5bGUudmlzaWJpbGl0eSA9ICdoaWRkZW4nO1xuXHRcdHRoaXMuX2RpZmZBY3Rpb25zLnN0eWxlLmhlaWdodCA9IGAke2xpbmVIZWlnaHR9cHhgO1xuXHRcdHRoaXMuX2RpZmZBY3Rpb25zLnN0eWxlLmxpbmVIZWlnaHQgPSBgJHtsaW5lSGVpZ2h0fXB4YDtcblx0XHR0aGlzLl9tYXJnaW5Eb21Ob2RlLmFwcGVuZENoaWxkKHRoaXMuX2RpZmZBY3Rpb25zKTtcblxuXHRcdGxldCBjdXJyZW50TGluZU51bWJlck9mZnNldCA9IDA7XG5cblx0XHRjb25zdCB1c2VTaGFkb3dET00gPSBfbW9kaWZpZWRFZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi51c2VTaGFkb3dET00pICYmICFpc0lPUzsgLy8gRG8gbm90IHVzZSBzaGFkb3cgZG9tIG9uIElPUyAjMTIyMDM1XG5cdFx0Y29uc3Qgc2hvd0NvbnRleHRNZW51ID0gKGFuY2hvcjogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9LCBiYXNlQWN0aW9ucz86IEFjdGlvbltdLCBvbkhpZGU/OiAoKSA9PiB2b2lkKSA9PiB7XG5cdFx0XHR0aGlzLl9jb250ZXh0TWVudVNlcnZpY2Uuc2hvd0NvbnRleHRNZW51KHtcblx0XHRcdFx0ZG9tRm9yU2hhZG93Um9vdDogdXNlU2hhZG93RE9NID8gX21vZGlmaWVkRWRpdG9yLmdldERvbU5vZGUoKSA/PyB1bmRlZmluZWQgOiB1bmRlZmluZWQsXG5cdFx0XHRcdGdldEFuY2hvcjogKCkgPT4gYW5jaG9yLFxuXHRcdFx0XHRvbkhpZGUsXG5cdFx0XHRcdGdldEFjdGlvbnM6ICgpID0+IHtcblx0XHRcdFx0XHRjb25zdCBhY3Rpb25zOiBBY3Rpb25bXSA9IGJhc2VBY3Rpb25zID8/IFtdO1xuXHRcdFx0XHRcdGNvbnN0IGlzRGVsZXRpb24gPSBfZGlmZi5tb2RpZmllZC5pc0VtcHR5O1xuXG5cdFx0XHRcdFx0Ly8gZGVmYXVsdCBhY3Rpb25cblx0XHRcdFx0XHRhY3Rpb25zLnB1c2gobmV3IEFjdGlvbihcblx0XHRcdFx0XHRcdCdkaWZmLmNsaXBib2FyZC5jb3B5RGVsZXRlZENvbnRlbnQnLFxuXHRcdFx0XHRcdFx0aXNEZWxldGlvblxuXHRcdFx0XHRcdFx0XHQ/IChfZGlmZi5vcmlnaW5hbC5sZW5ndGggPiAxXG5cdFx0XHRcdFx0XHRcdFx0PyBsb2NhbGl6ZSgnZGlmZi5jbGlwYm9hcmQuY29weURlbGV0ZWRMaW5lc0NvbnRlbnQubGFiZWwnLCBcIkNvcHkgZGVsZXRlZCBsaW5lc1wiKVxuXHRcdFx0XHRcdFx0XHRcdDogbG9jYWxpemUoJ2RpZmYuY2xpcGJvYXJkLmNvcHlEZWxldGVkTGluZXNDb250ZW50LnNpbmdsZS5sYWJlbCcsIFwiQ29weSBkZWxldGVkIGxpbmVcIikpXG5cdFx0XHRcdFx0XHRcdDogKF9kaWZmLm9yaWdpbmFsLmxlbmd0aCA+IDFcblx0XHRcdFx0XHRcdFx0XHQ/IGxvY2FsaXplKCdkaWZmLmNsaXBib2FyZC5jb3B5Q2hhbmdlZExpbmVzQ29udGVudC5sYWJlbCcsIFwiQ29weSBjaGFuZ2VkIGxpbmVzXCIpXG5cdFx0XHRcdFx0XHRcdFx0OiBsb2NhbGl6ZSgnZGlmZi5jbGlwYm9hcmQuY29weUNoYW5nZWRMaW5lc0NvbnRlbnQuc2luZ2xlLmxhYmVsJywgXCJDb3B5IGNoYW5nZWQgbGluZVwiKSksXG5cdFx0XHRcdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHR0cnVlLFxuXHRcdFx0XHRcdFx0YXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBvcmlnaW5hbFRleHQgPSB0aGlzLl9vcmlnaW5hbFRleHRNb2RlbC5nZXRWYWx1ZUluUmFuZ2UoX2RpZmYub3JpZ2luYWwudG9FeGNsdXNpdmVSYW5nZSgpKTtcblx0XHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5fY2xpcGJvYXJkU2VydmljZS53cml0ZVRleHQob3JpZ2luYWxUZXh0KTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHQpKTtcblxuXHRcdFx0XHRcdGlmIChfZGlmZi5vcmlnaW5hbC5sZW5ndGggPiAxKSB7XG5cdFx0XHRcdFx0XHRhY3Rpb25zLnB1c2gobmV3IEFjdGlvbihcblx0XHRcdFx0XHRcdFx0J2RpZmYuY2xpcGJvYXJkLmNvcHlEZWxldGVkTGluZUNvbnRlbnQnLFxuXHRcdFx0XHRcdFx0XHRpc0RlbGV0aW9uXG5cdFx0XHRcdFx0XHRcdFx0PyBsb2NhbGl6ZSgnZGlmZi5jbGlwYm9hcmQuY29weURlbGV0ZWRMaW5lQ29udGVudC5sYWJlbCcsIFwiQ29weSBkZWxldGVkIGxpbmUgKHswfSlcIixcblx0XHRcdFx0XHRcdFx0XHRcdF9kaWZmLm9yaWdpbmFsLnN0YXJ0TGluZU51bWJlciArIGN1cnJlbnRMaW5lTnVtYmVyT2Zmc2V0KVxuXHRcdFx0XHRcdFx0XHRcdDogbG9jYWxpemUoJ2RpZmYuY2xpcGJvYXJkLmNvcHlDaGFuZ2VkTGluZUNvbnRlbnQubGFiZWwnLCBcIkNvcHkgY2hhbmdlZCBsaW5lICh7MH0pXCIsXG5cdFx0XHRcdFx0XHRcdFx0XHRfZGlmZi5vcmlnaW5hbC5zdGFydExpbmVOdW1iZXIgKyBjdXJyZW50TGluZU51bWJlck9mZnNldCksXG5cdFx0XHRcdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdFx0dHJ1ZSxcblx0XHRcdFx0XHRcdFx0YXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdFx0XHRcdGxldCBsaW5lQ29udGVudCA9IHRoaXMuX29yaWdpbmFsVGV4dE1vZGVsLmdldExpbmVDb250ZW50KF9kaWZmLm9yaWdpbmFsLnN0YXJ0TGluZU51bWJlciArIGN1cnJlbnRMaW5lTnVtYmVyT2Zmc2V0KTtcblx0XHRcdFx0XHRcdFx0XHRpZiAobGluZUNvbnRlbnQgPT09ICcnKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHQvLyBlbXB0eSBsaW5lIC0+IG5ldyBsaW5lXG5cdFx0XHRcdFx0XHRcdFx0XHRjb25zdCBlb2YgPSB0aGlzLl9vcmlnaW5hbFRleHRNb2RlbC5nZXRFbmRPZkxpbmVTZXF1ZW5jZSgpO1xuXHRcdFx0XHRcdFx0XHRcdFx0bGluZUNvbnRlbnQgPSBlb2YgPT09IEVuZE9mTGluZVNlcXVlbmNlLkxGID8gJ1xcbicgOiAnXFxyXFxuJztcblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5fY2xpcGJvYXJkU2VydmljZS53cml0ZVRleHQobGluZUNvbnRlbnQpO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHQpKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y29uc3QgcmVhZE9ubHkgPSBfbW9kaWZpZWRFZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5yZWFkT25seSk7XG5cdFx0XHRcdFx0aWYgKCFyZWFkT25seSkge1xuXHRcdFx0XHRcdFx0YWN0aW9ucy5wdXNoKG5ldyBBY3Rpb24oXG5cdFx0XHRcdFx0XHRcdCdkaWZmLmlubGluZS5yZXZlcnRDaGFuZ2UnLFxuXHRcdFx0XHRcdFx0XHRsb2NhbGl6ZSgnZGlmZi5pbmxpbmUucmV2ZXJ0Q2hhbmdlLmxhYmVsJywgXCJSZXZlcnQgdGhpcyBjaGFuZ2VcIiksXG5cdFx0XHRcdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdFx0dHJ1ZSxcblx0XHRcdFx0XHRcdFx0YXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdFx0XHRcdHRoaXMuX2VkaXRvci5yZXZlcnQodGhpcy5fZGlmZik7XG5cdFx0XHRcdFx0XHRcdH0pXG5cdFx0XHRcdFx0XHQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm4gYWN0aW9ucztcblx0XHRcdFx0fSxcblx0XHRcdFx0YXV0b1NlbGVjdEZpcnN0SXRlbTogdHJ1ZVxuXHRcdFx0fSk7XG5cdFx0fTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGFkZFN0YW5kYXJkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuX2RpZmZBY3Rpb25zLCAnbW91c2Vkb3duJywgZSA9PiB7XG5cdFx0XHRpZiAoIWUubGVmdEJ1dHRvbikgeyByZXR1cm47IH1cblxuXHRcdFx0Y29uc3QgeyB0b3AsIGhlaWdodCB9ID0gZ2V0RG9tTm9kZVBhZ2VQb3NpdGlvbih0aGlzLl9kaWZmQWN0aW9ucyk7XG5cdFx0XHRjb25zdCBwYWQgPSBNYXRoLmZsb29yKGxpbmVIZWlnaHQgLyAzKTtcblx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdHNob3dDb250ZXh0TWVudSh7IHg6IGUucG9zeCwgeTogdG9wICsgaGVpZ2h0ICsgcGFkIH0pO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKF9tb2RpZmllZEVkaXRvci5vbk1vdXNlTW92ZSgoZTogSUVkaXRvck1vdXNlRXZlbnQpID0+IHtcblx0XHRcdGlmICgoZS50YXJnZXQudHlwZSA9PT0gTW91c2VUYXJnZXRUeXBlLkNPTlRFTlRfVklFV19aT05FIHx8IGUudGFyZ2V0LnR5cGUgPT09IE1vdXNlVGFyZ2V0VHlwZS5HVVRURVJfVklFV19aT05FKSAmJiBlLnRhcmdldC5kZXRhaWwudmlld1pvbmVJZCA9PT0gdGhpcy5fZ2V0Vmlld1pvbmVJZCgpKSB7XG5cdFx0XHRcdGN1cnJlbnRMaW5lTnVtYmVyT2Zmc2V0ID0gdGhpcy5fdXBkYXRlTGlnaHRCdWxiUG9zaXRpb24odGhpcy5fbWFyZ2luRG9tTm9kZSwgZS5ldmVudC5icm93c2VyRXZlbnQueSwgbGluZUhlaWdodCk7XG5cdFx0XHRcdHRoaXMudmlzaWJpbGl0eSA9IHRydWU7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLnZpc2liaWxpdHkgPSBmYWxzZTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihlbmFibGVDb3B5U2VsZWN0aW9uKHtcblx0XHRcdGRvbU5vZGU6IHRoaXMuX2RlbGV0ZWRDb2RlRG9tTm9kZSxcblx0XHRcdGRpZmZFbnRyeTogX2RpZmYsXG5cdFx0XHRvcmlnaW5hbE1vZGVsOiB0aGlzLl9vcmlnaW5hbFRleHRNb2RlbCxcblx0XHRcdHJlbmRlckxpbmVzUmVzdWx0OiB0aGlzLl9yZW5kZXJMaW5lc1Jlc3VsdCxcblx0XHRcdGNsaXBib2FyZFNlcnZpY2U6IF9jbGlwYm9hcmRTZXJ2aWNlLFxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZUxpZ2h0QnVsYlBvc2l0aW9uKG1hcmdpbkRvbU5vZGU6IEhUTUxFbGVtZW50LCB5OiBudW1iZXIsIGxpbmVIZWlnaHQ6IG51bWJlcik6IG51bWJlciB7XG5cdFx0Y29uc3QgeyB0b3AgfSA9IGdldERvbU5vZGVQYWdlUG9zaXRpb24obWFyZ2luRG9tTm9kZSk7XG5cdFx0Y29uc3Qgb2Zmc2V0ID0geSAtIHRvcDtcblx0XHRjb25zdCBsaW5lTnVtYmVyT2Zmc2V0ID0gTWF0aC5mbG9vcihvZmZzZXQgLyBsaW5lSGVpZ2h0KTtcblx0XHRjb25zdCBuZXdUb3AgPSBsaW5lTnVtYmVyT2Zmc2V0ICogbGluZUhlaWdodDtcblx0XHR0aGlzLl9kaWZmQWN0aW9ucy5zdHlsZS50b3AgPSBgJHtuZXdUb3B9cHhgO1xuXHRcdGlmICh0aGlzLl9yZW5kZXJMaW5lc1Jlc3VsdC52aWV3TGluZUNvdW50cykge1xuXHRcdFx0bGV0IGFjYyA9IDA7XG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMuX3JlbmRlckxpbmVzUmVzdWx0LnZpZXdMaW5lQ291bnRzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdGFjYyArPSB0aGlzLl9yZW5kZXJMaW5lc1Jlc3VsdC52aWV3TGluZUNvdW50c1tpXTtcblx0XHRcdFx0aWYgKGxpbmVOdW1iZXJPZmZzZXQgPCBhY2MpIHtcblx0XHRcdFx0XHRyZXR1cm4gaTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gbGluZU51bWJlck9mZnNldDtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUywrQkFBK0IsOEJBQThCO0FBQ3RFLFNBQVMsY0FBYztBQUN2QixTQUFTLGVBQWU7QUFDeEIsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsaUJBQWlCO0FBQzFCLFNBQTRCLHVCQUF1QjtBQUduRCxTQUFTLG9CQUFvQjtBQUU3QixTQUFTLHlCQUFxQztBQUM5QyxTQUFTLGdCQUFnQjtBQUd6QixTQUFTLDJCQUEyQjtBQUc3QixNQUFNLG9DQUFvQyxXQUFXO0FBQUEsRUFnQjNELFlBQ2tCLGdCQUNBLGdCQUNBLHFCQUNBLGlCQUNBLE9BQ0EsU0FDQSxvQkFDQSxvQkFDQSxxQkFDQSxtQkFDaEI7QUFDRCxVQUFNO0FBWFc7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUF2QmxCLFNBQVEsY0FBdUI7QUE0QjlCLFNBQUssZUFBZSxNQUFNLFNB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
