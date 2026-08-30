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
import { getWindow } from "../../../../../base/browser/dom.js";
import { createFastDomNode } from "../../../../../base/browser/fastDomNode.js";
import { PixelRatio } from "../../../../../base/browser/pixelRatio.js";
import { IThemeService, Themable } from "../../../../../platform/theme/common/themeService.js";
import { NotebookOverviewRulerLane } from "../notebookBrowser.js";
let NotebookOverviewRuler = class extends Themable {
  constructor(notebookEditor, container, themeService) {
    super(themeService);
    this.notebookEditor = notebookEditor;
    this._lanes = 3;
    this._domNode = createFastDomNode(document.createElement("canvas"));
    this._domNode.setPosition("relative");
    this._domNode.setLayerHinting(true);
    this._domNode.setContain("strict");
    container.appendChild(this._domNode.domNode);
    this._register(notebookEditor.onDidChangeDecorations(() => {
      this.layout();
    }));
    this._register(PixelRatio.getInstance(getWindow(this._domNode.domNode)).onDidChange(() => {
      this.layout();
    }));
  }
  layout() {
    const width = 10;
    const layoutInfo = this.notebookEditor.getLayoutInfo();
    const scrollHeight = layoutInfo.scrollHeight;
    const height = layoutInfo.height;
    const ratio = PixelRatio.getInstance(getWindow(this._domNode.domNode)).value;
    this._domNode.setWidth(width);
    this._domNode.setHeight(height);
    this._domNode.domNode.width = width * ratio;
    this._domNode.domNode.height = height * ratio;
    const ctx = this._domNode.domNode.getContext("2d");
    ctx.clearRect(0, 0, width * ratio, height * ratio);
    this._render(ctx, width * ratio, height * ratio, scrollHeight * ratio, ratio);
  }
  _render(ctx, width, height, scrollHeight, ratio) {
    const viewModel = this.notebookEditor.getViewModel();
    const fontInfo = this.notebookEditor.getLayoutInfo().fontInfo;
    const laneWidth = width / this._lanes;
    let currentFrom = 0;
    if (viewModel) {
      for (let i = 0; i < viewModel.viewCells.length; i++) {
        const viewCell = viewModel.viewCells[i];
        const textBuffer = viewCell.textBuffer;
        const decorations = viewCell.getCellDecorations();
        const cellHeight = viewCell.layoutInfo.totalHeight / scrollHeight * ratio * height;
        decorations.filter((decoration) => decoration.overviewRuler).forEach((decoration) => {
          const overviewRuler = decoration.overviewRuler;
          const fillStyle = this.getColor(overviewRuler.color) ?? "#000000";
          const lineHeight = Math.min(fontInfo.lineHeight, viewCell.layoutInfo.editorHeight / scrollHeight / textBuffer.getLineCount() * ratio * height);
          const lineNumbers = overviewRuler.modelRanges.map((range) => range.startLineNumber).reduce((previous, current) => {
            if (previous.length === 0) {
              previous.push(current);
            } else {
              const last = previous[previous.length - 1];
              if (last !== current) {
                previous.push(current);
              }
            }
            return previous;
          }, []);
          let x = 0;
          switch (overviewRuler.position) {
            case NotebookOverviewRulerLane.Left:
              x = 0;
              break;
            case NotebookOverviewRulerLane.Center:
              x = laneWidth;
              break;
            case NotebookOverviewRulerLane.Right:
              x = laneWidth * 2;
              break;
            default:
              break;
          }
          const width2 = overviewRuler.position === NotebookOverviewRulerLane.Full ? laneWidth * 3 : laneWidth;
          for (let i2 = 0; i2 < lineNumbers.length; i2++) {
            ctx.fillStyle = fillStyle;
            const lineNumber = lineNumbers[i2];
            const offset = (lineNumber - 1) * lineHeight;
            ctx.fillRect(x, currentFrom + offset, width2, lineHeight);
          }
          if (overviewRuler.includeOutput) {
            ctx.fillStyle = fillStyle;
            const outputOffset = viewCell.layoutInfo.editorHeight / scrollHeight * ratio * height;
            const decorationHeight = fontInfo.lineHeight / scrollHeight * ratio * height;
            ctx.fillRect(laneWidth, currentFrom + outputOffset, laneWidth, decorationHeight);
          }
        });
        currentFrom += cellHeight;
      }
      const overviewRulerDecorations = viewModel.getOverviewRulerDecorations();
      for (let i = 0; i < overviewRulerDecorations.length; i++) {
        const decoration = overviewRulerDecorations[i];
        if (!decoration.options.overviewRuler) {
          continue;
        }
        const viewZoneInfo = this.notebookEditor.getViewZoneLayoutInfo(decoration.viewZoneId);
        if (!viewZoneInfo) {
          continue;
        }
        const fillStyle = this.getColor(decoration.options.overviewRuler.color) ?? "#000000";
        let x = 0;
        switch (decoration.options.overviewRuler.position) {
          case NotebookOverviewRulerLane.Left:
            x = 0;
            break;
          case NotebookOverviewRulerLane.Center:
            x = laneWidth;
            break;
          case NotebookOverviewRulerLane.Right:
            x = laneWidth * 2;
            break;
          default:
            break;
        }
        const width2 = decoration.options.overviewRuler.position === NotebookOverviewRulerLane.Full ? laneWidth * 3 : laneWidth;
        ctx.fillStyle = fillStyle;
        const viewZoneHeight = viewZoneInfo.height / scrollHeight * ratio * height;
        const viewZoneTop = viewZoneInfo.top / scrollHeight * ratio * height;
        ctx.fillRect(x, viewZoneTop, width2, viewZoneHeight);
      }
    }
  }
};
NotebookOverviewRuler = __decorateClass([
  __decorateParam(2, IThemeService)
], NotebookOverviewRuler);
export {
  NotebookOverviewRuler
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG5vdGVib29rXFxicm93c2VyXFx2aWV3UGFydHNcXG5vdGVib29rT3ZlcnZpZXdSdWxlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGdldFdpbmRvdyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgY3JlYXRlRmFzdERvbU5vZGUsIEZhc3REb21Ob2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2Zhc3REb21Ob2RlLmpzJztcbmltcG9ydCB7IFBpeGVsUmF0aW8gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvcGl4ZWxSYXRpby5qcyc7XG5pbXBvcnQgeyBJVGhlbWVTZXJ2aWNlLCBUaGVtYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSU5vdGVib29rRWRpdG9yRGVsZWdhdGUsIE5vdGVib29rT3ZlcnZpZXdSdWxlckxhbmUgfSBmcm9tICcuLi9ub3RlYm9va0Jyb3dzZXIuanMnO1xuXG5leHBvcnQgY2xhc3MgTm90ZWJvb2tPdmVydmlld1J1bGVyIGV4dGVuZHMgVGhlbWFibGUge1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kb21Ob2RlOiBGYXN0RG9tTm9kZTxIVE1MQ2FudmFzRWxlbWVudD47XG5cdHByaXZhdGUgX2xhbmVzID0gMztcblxuXHRjb25zdHJ1Y3RvcihyZWFkb25seSBub3RlYm9va0VkaXRvcjogSU5vdGVib29rRWRpdG9yRGVsZWdhdGUsIGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIEBJVGhlbWVTZXJ2aWNlIHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSkge1xuXHRcdHN1cGVyKHRoZW1lU2VydmljZSk7XG5cdFx0dGhpcy5fZG9tTm9kZSA9IGNyZWF0ZUZhc3REb21Ob2RlKGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2NhbnZhcycpKTtcblx0XHR0aGlzLl9kb21Ob2RlLnNldFBvc2l0aW9uKCdyZWxhdGl2ZScpO1xuXHRcdHRoaXMuX2RvbU5vZGUuc2V0TGF5ZXJIaW50aW5nKHRydWUpO1xuXHRcdHRoaXMuX2RvbU5vZGUuc2V0Q29udGFpbignc3RyaWN0Jyk7XG5cblx0XHRjb250YWluZXIuYXBwZW5kQ2hpbGQodGhpcy5fZG9tTm9kZS5kb21Ob2RlKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKG5vdGVib29rRWRpdG9yLm9uRGlkQ2hhbmdlRGVjb3JhdGlvbnMoKCkgPT4ge1xuXHRcdFx0dGhpcy5sYXlvdXQoKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihQaXhlbFJhdGlvLmdldEluc3RhbmNlKGdldFdpbmRvdyh0aGlzLl9kb21Ob2RlLmRvbU5vZGUpKS5vbkRpZENoYW5nZSgoKSA9PiB7XG5cdFx0XHR0aGlzLmxheW91dCgpO1xuXHRcdH0pKTtcblx0fVxuXG5cdGxheW91dCgpIHtcblx0XHRjb25zdCB3aWR0aCA9IDEwO1xuXHRcdGNvbnN0IGxheW91dEluZm8gPSB0aGlzLm5vdGVib29rRWRpdG9yLmdldExheW91dEluZm8oKTtcblx0XHRjb25zdCBzY3JvbGxIZWlnaHQgPSBsYXlvdXRJbmZvLnNjcm9sbEhlaWdodDtcblx0XHRjb25zdCBoZWlnaHQgPSBsYXlvdXRJbmZvLmhlaWdodDtcblx0XHRjb25zdCByYXRpbyA9IFBpeGVsUmF0aW8uZ2V0SW5zdGFuY2UoZ2V0V2luZG93KHRoaXMuX2RvbU5vZGUuZG9tTm9kZSkpLnZhbHVlO1xuXHRcdHRoaXMuX2RvbU5vZGUuc2V0V2lkdGgod2lkdGgpO1xuXHRcdHRoaXMuX2RvbU5vZGUuc2V0SGVpZ2h0KGhlaWdodCk7XG5cdFx0dGhpcy5fZG9tTm9kZS5kb21Ob2RlLndpZHRoID0gd2lkdGggKiByYXRpbztcblx0XHR0aGlzLl9kb21Ob2RlLmRvbU5vZGUuaGVpZ2h0ID0gaGVpZ2h0ICogcmF0aW87XG5cdFx0Y29uc3QgY3R4ID0gdGhpcy5fZG9tTm9kZS5kb21Ob2RlLmdldENvbnRleHQoJzJkJykhO1xuXHRcdGN0eC5jbGVhclJlY3QoMCwgMCwgd2lkdGggKiByYXRpbywgaGVpZ2h0ICogcmF0aW8pO1xuXHRcdHRoaXMuX3JlbmRlcihjdHgsIHdpZHRoICogcmF0aW8sIGhlaWdodCAqIHJhdGlvLCBzY3JvbGxIZWlnaHQgKiByYXRpbywgcmF0aW8pO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVuZGVyKGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJELCB3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlciwgc2Nyb2xsSGVpZ2h0OiBudW1iZXIsIHJhdGlvOiBudW1iZXIpIHtcblx0XHRjb25zdCB2aWV3TW9kZWwgPSB0aGlzLm5vdGVib29rRWRpdG9yLmdldFZpZXdNb2RlbCgpO1xuXHRcdGNvbnN0IGZvbnRJbmZvID0gdGhpcy5ub3RlYm9va0VkaXRvci5nZXRMYXlvdXRJbmZvKCkuZm9udEluZm87XG5cdFx0Y29uc3QgbGFuZVdpZHRoID0gd2lkdGggLyB0aGlzLl9sYW5lcztcblxuXHRcdGxldCBjdXJyZW50RnJvbSA9IDA7XG5cblx0XHRpZiAodmlld01vZGVsKSB7XG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHZpZXdNb2RlbC52aWV3Q2VsbHMubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0Y29uc3Qgdmlld0NlbGwgPSB2aWV3TW9kZWwudmlld0NlbGxzW2ldO1xuXHRcdFx0XHRjb25zdCB0ZXh0QnVmZmVyID0gdmlld0NlbGwudGV4dEJ1ZmZlcjtcblx0XHRcdFx0Y29uc3QgZGVjb3JhdGlvbnMgPSB2aWV3Q2VsbC5nZXRDZWxsRGVjb3JhdGlvbnMoKTtcblx0XHRcdFx0Y29uc3QgY2VsbEhlaWdodCA9ICh2aWV3Q2VsbC5sYXlvdXRJbmZvLnRvdGFsSGVpZ2h0IC8gc2Nyb2xsSGVpZ2h0KSAqIHJhdGlvICogaGVpZ2h0O1xuXG5cdFx0XHRcdGRlY29yYXRpb25zLmZpbHRlcihkZWNvcmF0aW9uID0+IGRlY29yYXRpb24ub3ZlcnZpZXdSdWxlcikuZm9yRWFjaChkZWNvcmF0aW9uID0+IHtcblx0XHRcdFx0XHRjb25zdCBvdmVydmlld1J1bGVyID0gZGVjb3JhdGlvbi5vdmVydmlld1J1bGVyITtcblx0XHRcdFx0XHRjb25zdCBmaWxsU3R5bGUgPSB0aGlzLmdldENvbG9yKG92ZXJ2aWV3UnVsZXIuY29sb3IpID8/ICcjMDAwMDAwJztcblx0XHRcdFx0XHRjb25zdCBsaW5lSGVpZ2h0ID0gTWF0aC5taW4oZm9udEluZm8ubGluZUhlaWdodCwgKHZpZXdDZWxsLmxheW91dEluZm8uZWRpdG9ySGVpZ2h0IC8gc2Nyb2xsSGVpZ2h0IC8gdGV4dEJ1ZmZlci5nZXRMaW5lQ291bnQoKSkgKiByYXRpbyAqIGhlaWdodCk7XG5cdFx0XHRcdFx0Y29uc3QgbGluZU51bWJlcnMgPSBvdmVydmlld1J1bGVyLm1vZGVsUmFuZ2VzLm1hcChyYW5nZSA9PiByYW5nZS5zdGFydExpbmVOdW1iZXIpLnJlZHVjZSgocHJldmlvdXM6IG51bWJlcltdLCBjdXJyZW50OiBudW1iZXIpID0+IHtcblx0XHRcdFx0XHRcdGlmIChwcmV2aW91cy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0XHRcdFx0cHJldmlvdXMucHVzaChjdXJyZW50KTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGxhc3QgPSBwcmV2aW91c1twcmV2aW91cy5sZW5ndGggLSAxXTtcblx0XHRcdFx0XHRcdFx0aWYgKGxhc3QgIT09IGN1cnJlbnQpIHtcblx0XHRcdFx0XHRcdFx0XHRwcmV2aW91cy5wdXNoKGN1cnJlbnQpO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdHJldHVybiBwcmV2aW91cztcblx0XHRcdFx0XHR9LCBbXSBhcyBudW1iZXJbXSk7XG5cblx0XHRcdFx0XHRsZXQgeCA9IDA7XG5cdFx0XHRcdFx0c3dpdGNoIChvdmVydmlld1J1bGVyLnBvc2l0aW9uKSB7XG5cdFx0XHRcdFx0XHRjYXNlIE5vdGVib29rT3ZlcnZpZXdSdWxlckxhbmUuTGVmdDpcblx0XHRcdFx0XHRcdFx0eCA9IDA7XG5cdFx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdFx0Y2FzZSBOb3RlYm9va092ZXJ2aWV3UnVsZXJMYW5lLkNlbnRlcjpcblx0XHRcdFx0XHRcdFx0eCA9IGxhbmVXaWR0aDtcblx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHRjYXNlIE5vdGVib29rT3ZlcnZpZXdSdWxlckxhbmUuUmlnaHQ6XG5cdFx0XHRcdFx0XHRcdHggPSBsYW5lV2lkdGggKiAyO1xuXHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGNvbnN0IHdpZHRoID0gb3ZlcnZpZXdSdWxlci5wb3NpdGlvbiA9PT0gTm90ZWJvb2tPdmVydmlld1J1bGVyTGFuZS5GdWxsID8gbGFuZVdpZHRoICogMyA6IGxhbmVXaWR0aDtcblxuXHRcdFx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgbGluZU51bWJlcnMubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0XHRcdGN0eC5maWxsU3R5bGUgPSBmaWxsU3R5bGU7XG5cdFx0XHRcdFx0XHRjb25zdCBsaW5lTnVtYmVyID0gbGluZU51bWJlcnNbaV07XG5cdFx0XHRcdFx0XHRjb25zdCBvZmZzZXQgPSAobGluZU51bWJlciAtIDEpICogbGluZUhlaWdodDtcblx0XHRcdFx0XHRcdGN0eC5maWxsUmVjdCh4LCBjdXJyZW50RnJvbSArIG9mZnNldCwgd2lkdGgsIGxpbmVIZWlnaHQpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGlmIChvdmVydmlld1J1bGVyLmluY2x1ZGVPdXRwdXQpIHtcblx0XHRcdFx0XHRcdGN0eC5maWxsU3R5bGUgPSBmaWxsU3R5bGU7XG5cdFx0XHRcdFx0XHRjb25zdCBvdXRwdXRPZmZzZXQgPSAodmlld0NlbGwubGF5b3V0SW5mby5lZGl0b3JIZWlnaHQgLyBzY3JvbGxIZWlnaHQpICogcmF0aW8gKiBoZWlnaHQ7XG5cdFx0XHRcdFx0XHRjb25zdCBkZWNvcmF0aW9uSGVpZ2h0ID0gKGZvbnRJbmZvLmxpbmVIZWlnaHQgLyBzY3JvbGxIZWlnaHQpICogcmF0aW8gKiBoZWlnaHQ7XG5cdFx0XHRcdFx0XHRjdHguZmlsbFJlY3QobGFuZVdpZHRoLCBjdXJyZW50RnJvbSArIG91dHB1dE9mZnNldCwgbGFuZVdpZHRoLCBkZWNvcmF0aW9uSGVpZ2h0KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdGN1cnJlbnRGcm9tICs9IGNlbGxIZWlnaHQ7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IG92ZXJ2aWV3UnVsZXJEZWNvcmF0aW9ucyA9IHZpZXdNb2RlbC5nZXRPdmVydmlld1J1bGVyRGVjb3JhdGlvbnMoKTtcblxuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBvdmVydmlld1J1bGVyRGVjb3JhdGlvbnMubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0Y29uc3QgZGVjb3JhdGlvbiA9IG92ZXJ2aWV3UnVsZXJEZWNvcmF0aW9uc1tpXTtcblx0XHRcdFx0aWYgKCFkZWNvcmF0aW9uLm9wdGlvbnMub3ZlcnZpZXdSdWxlcikge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IHZpZXdab25lSW5mbyA9IHRoaXMubm90ZWJvb2tFZGl0b3IuZ2V0Vmlld1pvbmVMYXlvdXRJbmZvKGRlY29yYXRpb24udmlld1pvbmVJZCk7XG5cblx0XHRcdFx0aWYgKCF2aWV3Wm9uZUluZm8pIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IGZpbGxTdHlsZSA9IHRoaXMuZ2V0Q29sb3IoZGVjb3JhdGlvbi5vcHRpb25zLm92ZXJ2aWV3UnVsZXIuY29sb3IpID8/ICcjMDAwMDAwJztcblx0XHRcdFx0bGV0IHggPSAwO1xuXHRcdFx0XHRzd2l0Y2ggKGRlY29yYXRpb24ub3B0aW9ucy5vdmVydmlld1J1bGVyLnBvc2l0aW9uKSB7XG5cdFx0XHRcdFx0Y2FzZSBOb3RlYm9va092ZXJ2aWV3UnVsZXJMYW5lLkxlZnQ6XG5cdFx0XHRcdFx0XHR4ID0gMDtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdGNhc2UgTm90ZWJvb2tPdmVydmlld1J1bGVyTGFuZS5DZW50ZXI6XG5cdFx0XHRcdFx0XHR4ID0gbGFuZVdpZHRoO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0Y2FzZSBOb3RlYm9va092ZXJ2aWV3UnVsZXJMYW5lLlJpZ2h0OlxuXHRcdFx0XHRcdFx0eCA9IGxhbmVXaWR0aCAqIDI7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCB3aWR0aCA9IGRlY29yYXRpb24ub3B0aW9ucy5vdmVydmlld1J1bGVyLnBvc2l0aW9uID09PSBOb3RlYm9va092ZXJ2aWV3UnVsZXJMYW5lLkZ1bGwgPyBsYW5lV2lkdGggKiAzIDogbGFuZVdpZHRoO1xuXG5cdFx0XHRcdGN0eC5maWxsU3R5bGUgPSBmaWxsU3R5bGU7XG5cblx0XHRcdFx0Y29uc3Qgdmlld1pvbmVIZWlnaHQgPSAodmlld1pvbmVJbmZvLmhlaWdodCAvIHNjcm9sbEhlaWdodCkgKiByYXRpbyAqIGhlaWdodDtcblx0XHRcdFx0Y29uc3Qgdmlld1pvbmVUb3AgPSAodmlld1pvbmVJbmZvLnRvcCAvIHNjcm9sbEhlaWdodCkgKiByYXRpbyAqIGhlaWdodDtcblxuXHRcdFx0XHRjdHguZmlsbFJlY3QoeCwgdmlld1pvbmVUb3AsIHdpZHRoLCB2aWV3Wm9uZUhlaWdodCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMseUJBQXNDO0FBQy9DLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsZUFBZSxnQkFBZ0I7QUFDeEMsU0FBa0MsaUNBQWlDO0FBRTVELElBQU0sd0JBQU4sY0FBb0MsU0FBUztBQUFBLEVBSW5ELFlBQXFCLGdCQUF5QyxXQUF1QyxjQUE2QjtBQUNqSSxVQUFNLFlBQVk7QUFERTtBQUZyQixTQUFRLFNBQVM7QUFJaEIsU0FBSyxXQUFXLGtCQUFrQixTQUFTLGNBQWMsUUFBUSxDQUFDO0FBQ2xFLFNBQUssU0FBUyxZQUFZLFVBQVU7QUFDcEMsU0FBSyxTQUFTLGdCQUFnQixJQUFJO0FBQ2xDLFNBQUssU0FBUyxXQUFXLFFBQVE7QUFFakMsY0FBVSxZQUFZLEtBQUssU0FBUyxPQUFPO0FBRTNDLFNBQUssVUFBVSxlQUFlLHVCQUF1QixNQUFNO0FBQzFELFdBQUssT0FBTztBQUFBLElBQ2IsQ0FBQyxDQUFDO0FBRUYsU0FBSyxVQUFVLFdBQVcsWUFBWSxVQUFVLEtBQUssU0FBUyxPQUFPLENBQUMsRUFBRSxZQUFZLE1BQU07QUFDekYsV0FBSyxPQUFPO0FBQUEsSUFDYixDQUFDLENBQUM7QUFBQSxFQUNIO0FBQUEsRUFFQSxTQUFTO0FBQ1Is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
