import { CharCode } from "../../../base/common/charCode.js";
import { CursorColumns } from "../core/cursorColumns.js";
var Direction = /* @__PURE__ */ ((Direction2) => {
  Direction2[Direction2["Left"] = 0] = "Left";
  Direction2[Direction2["Right"] = 1] = "Right";
  Direction2[Direction2["Nearest"] = 2] = "Nearest";
  return Direction2;
})(Direction || {});
class AtomicTabMoveOperations {
  /**
   * Get the visible column at the position. If we get to a non-whitespace character first
   * or past the end of string then return -1.
   *
   * **Note** `position` and the return value are 0-based.
   */
  static whitespaceVisibleColumn(lineContent, position, tabSize) {
    const lineLength = lineContent.length;
    let visibleColumn = 0;
    let prevTabStopPosition = -1;
    let prevTabStopVisibleColumn = -1;
    for (let i = 0; i < lineLength; i++) {
      if (i === position) {
        return [prevTabStopPosition, prevTabStopVisibleColumn, visibleColumn];
      }
      if (visibleColumn % tabSize === 0) {
        prevTabStopPosition = i;
        prevTabStopVisibleColumn = visibleColumn;
      }
      const chCode = lineContent.charCodeAt(i);
      switch (chCode) {
        case CharCode.Space:
          visibleColumn += 1;
          break;
        case CharCode.Tab:
          visibleColumn = CursorColumns.nextRenderTabStop(visibleColumn, tabSize);
          break;
        default:
          return [-1, -1, -1];
      }
    }
    if (position === lineLength) {
      return [prevTabStopPosition, prevTabStopVisibleColumn, visibleColumn];
    }
    return [-1, -1, -1];
  }
  /**
   * Return the position that should result from a move left, right or to the
   * nearest tab, if atomic tabs are enabled. Left and right are used for the
   * arrow key movements, nearest is used for mouse selection. It returns
   * -1 if atomic tabs are not relevant and you should fall back to normal
   * behaviour.
   *
   * **Note**: `position` and the return value are 0-based.
   */
  static atomicPosition(lineContent, position, tabSize, direction) {
    const lineLength = lineContent.length;
    const [prevTabStopPosition, prevTabStopVisibleColumn, visibleColumn] = AtomicTabMoveOperations.whitespaceVisibleColumn(lineContent, position, tabSize);
    if (visibleColumn === -1) {
      return -1;
    }
    let left;
    switch (direction) {
      case 0 /* Left */:
        left = true;
        break;
      case 1 /* Right */:
        left = false;
        break;
      case 2 /* Nearest */:
        if (visibleColumn % tabSize === 0) {
          return position;
        }
        left = visibleColumn % tabSize <= tabSize / 2;
        break;
    }
    if (left) {
      if (prevTabStopPosition === -1) {
        return -1;
      }
      let currentVisibleColumn2 = prevTabStopVisibleColumn;
      for (let i = prevTabStopPosition; i < lineLength; ++i) {
        if (currentVisibleColumn2 === prevTabStopVisibleColumn + tabSize) {
          return prevTabStopPosition;
        }
        const chCode = lineContent.charCodeAt(i);
        switch (chCode) {
          case CharCode.Space:
            currentVisibleColumn2 += 1;
            break;
          case CharCode.Tab:
            currentVisibleColumn2 = CursorColumns.nextRenderTabStop(currentVisibleColumn2, tabSize);
            break;
          default:
            return -1;
        }
      }
      if (currentVisibleColumn2 === prevTabStopVisibleColumn + tabSize) {
        return prevTabStopPosition;
      }
      return -1;
    }
    const targetVisibleColumn = CursorColumns.nextRenderTabStop(visibleColumn, tabSize);
    let currentVisibleColumn = visibleColumn;
    for (let i = position; i < lineLength; i++) {
      if (currentVisibleColumn === targetVisibleColumn) {
        return i;
      }
      const chCode = lineContent.charCodeAt(i);
      switch (chCode) {
        case CharCode.Space:
          currentVisibleColumn += 1;
          break;
        case CharCode.Tab:
          currentVisibleColumn = CursorColumns.nextRenderTabStop(currentVisibleColumn, tabSize);
          break;
        default:
          return -1;
      }
    }
    if (currentVisibleColumn === targetVisibleColumn) {
      return lineLength;
    }
    return -1;
  }
}
export {
  AtomicTabMoveOperations,
  Direction
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbW1vblxcY3Vyc29yXFxjdXJzb3JBdG9taWNNb3ZlT3BlcmF0aW9ucy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IENoYXJDb2RlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vY2hhckNvZGUuanMnO1xuaW1wb3J0IHsgQ3Vyc29yQ29sdW1ucyB9IGZyb20gJy4uL2NvcmUvY3Vyc29yQ29sdW1ucy5qcyc7XG5cbmV4cG9ydCBjb25zdCBlbnVtIERpcmVjdGlvbiB7XG5cdExlZnQsXG5cdFJpZ2h0LFxuXHROZWFyZXN0LFxufVxuXG5leHBvcnQgY2xhc3MgQXRvbWljVGFiTW92ZU9wZXJhdGlvbnMge1xuXHQvKipcblx0ICogR2V0IHRoZSB2aXNpYmxlIGNvbHVtbiBhdCB0aGUgcG9zaXRpb24uIElmIHdlIGdldCB0byBhIG5vbi13aGl0ZXNwYWNlIGNoYXJhY3RlciBmaXJzdFxuXHQgKiBvciBwYXN0IHRoZSBlbmQgb2Ygc3RyaW5nIHRoZW4gcmV0dXJuIC0xLlxuXHQgKlxuXHQgKiAqKk5vdGUqKiBgcG9zaXRpb25gIGFuZCB0aGUgcmV0dXJuIHZhbHVlIGFyZSAwLWJhc2VkLlxuXHQgKi9cblx0cHVibGljIHN0YXRpYyB3aGl0ZXNwYWNlVmlzaWJsZUNvbHVtbihsaW5lQ29udGVudDogc3RyaW5nLCBwb3NpdGlvbjogbnVtYmVyLCB0YWJTaXplOiBudW1iZXIpOiBbbnVtYmVyLCBudW1iZXIsIG51bWJlcl0ge1xuXHRcdGNvbnN0IGxpbmVMZW5ndGggPSBsaW5lQ29udGVudC5sZW5ndGg7XG5cdFx0bGV0IHZpc2libGVDb2x1bW4gPSAwO1xuXHRcdGxldCBwcmV2VGFiU3RvcFBvc2l0aW9uID0gLTE7XG5cdFx0bGV0IHByZXZUYWJTdG9wVmlzaWJsZUNvbHVtbiA9IC0xO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgbGluZUxlbmd0aDsgaSsrKSB7XG5cdFx0XHRpZiAoaSA9PT0gcG9zaXRpb24pIHtcblx0XHRcdFx0cmV0dXJuIFtwcmV2VGFiU3RvcFBvc2l0aW9uLCBwcmV2VGFiU3RvcFZpc2libGVDb2x1bW4sIHZpc2libGVDb2x1bW5dO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHZpc2libGVDb2x1bW4gJSB0YWJTaXplID09PSAwKSB7XG5cdFx0XHRcdHByZXZUYWJTdG9wUG9zaXRpb24gPSBpO1xuXHRcdFx0XHRwcmV2VGFiU3RvcFZpc2libGVDb2x1bW4gPSB2aXNpYmxlQ29sdW1uO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgY2hDb2RlID0gbGluZUNvbnRlbnQuY2hhckNvZGVBdChpKTtcblx0XHRcdHN3aXRjaCAoY2hDb2RlKSB7XG5cdFx0XHRcdGNhc2UgQ2hhckNvZGUuU3BhY2U6XG5cdFx0XHRcdFx0dmlzaWJsZUNvbHVtbiArPSAxO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIENoYXJDb2RlLlRhYjpcblx0XHRcdFx0XHQvLyBTa2lwIHRvIHRoZSBuZXh0IG11bHRpcGxlIG9mIHRhYlNpemUuXG5cdFx0XHRcdFx0dmlzaWJsZUNvbHVtbiA9IEN1cnNvckNvbHVtbnMubmV4dFJlbmRlclRhYlN0b3AodmlzaWJsZUNvbHVtbiwgdGFiU2l6ZSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdFx0cmV0dXJuIFstMSwgLTEsIC0xXTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKHBvc2l0aW9uID09PSBsaW5lTGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4gW3ByZXZUYWJTdG9wUG9zaXRpb24sIHByZXZUYWJTdG9wVmlzaWJsZUNvbHVtbiwgdmlzaWJsZUNvbHVtbl07XG5cdFx0fVxuXHRcdHJldHVybiBbLTEsIC0xLCAtMV07XG5cdH1cblxuXHQvKipcblx0ICogUmV0dXJuIHRoZSBwb3NpdGlvbiB0aGF0IHNob3VsZCByZXN1bHQgZnJvbSBhIG1vdmUgbGVmdCwgcmlnaHQgb3IgdG8gdGhlXG5cdCAqIG5lYXJlc3QgdGFiLCBpZiBhdG9taWMgdGFicyBhcmUgZW5hYmxlZC4gTGVmdCBhbmQgcmlnaHQgYXJlIHVzZWQgZm9yIHRoZVxuXHQgKiBhcnJvdyBrZXkgbW92ZW1lbnRzLCBuZWFyZXN0IGlzIHVzZWQgZm9yIG1vdXNlIHNlbGVjdGlvbi4gSXQgcmV0dXJuc1xuXHQgKiAtMSBpZiBhdG9taWMgdGFicyBhcmUgbm90IHJlbGV2YW50IGFuZCB5b3Ugc2hvdWxkIGZhbGwgYmFjayB0byBub3JtYWxcblx0ICogYmVoYXZpb3VyLlxuXHQgKlxuXHQgKiAqKk5vdGUqKjogYHBvc2l0aW9uYCBhbmQgdGhlIHJldHVybiB2YWx1ZSBhcmUgMC1iYXNlZC5cblx0ICovXG5cdHB1YmxpYyBzdGF0aWMgYXRvbWljUG9zaXRpb24obGluZUNvbnRlbnQ6IHN0cmluZywgcG9zaXRpb246IG51bWJlciwgdGFiU2l6ZTogbnVtYmVyLCBkaXJlY3Rpb246IERpcmVjdGlvbik6IG51bWJlciB7XG5cdFx0Y29uc3QgbGluZUxlbmd0aCA9IGxpbmVDb250ZW50Lmxlbmd0aDtcblxuXHRcdC8vIEdldCB0aGUgMC1iYXNlZCB2aXNpYmxlIGNvbHVtbiBjb3JyZXNwb25kaW5nIHRvIHRoZSBwb3NpdGlvbiwgb3IgcmV0dXJuXG5cdFx0Ly8gLTEgaWYgaXQgaXMgbm90IGluIHRoZSBpbml0aWFsIHdoaXRlc3BhY2UuXG5cdFx0Y29uc3QgW3ByZXZUYWJTdG9wUG9zaXRpb24sIHByZXZUYWJTdG9wVmlzaWJsZUNvbHVtbiwgdmlzaWJsZUNvbHVtbl0gPSBBdG9taWNUYWJNb3ZlT3BlcmF0aW9ucy53aGl0ZXNwYWNlVmlzaWJsZUNvbHVtbihsaW5lQ29udGVudCwgcG9zaXRpb24sIHRhYlNpemUpO1xuXG5cdFx0aWYgKHZpc2libGVDb2x1bW4gPT09IC0xKSB7XG5cdFx0XHRyZXR1cm4gLTE7XG5cdFx0fVxuXG5cdFx0Ly8gSXMgdGhlIG91dHB1dCBsZWZ0IG9yIHJpZ2h0IG9mIHRoZSBjdXJyZW50IHBvc2l0aW9uLiBUaGUgY2FzZSBmb3IgbmVhcmVzdFxuXHRcdC8vIHdoZXJlIGl0IGlzIHRoZSBzYW1lIGFzIHRoZSBjdXJyZW50IHBvc2l0aW9uIGlzIGhhbmRsZWQgaW4gdGhlIHN3aXRjaC5cblx0XHRsZXQgbGVmdDogYm9vbGVhbjtcblx0XHRzd2l0Y2ggKGRpcmVjdGlvbikge1xuXHRcdFx0Y2FzZSBEaXJlY3Rpb24uTGVmdDpcblx0XHRcdFx0bGVmdCA9IHRydWU7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBEaXJlY3Rpb24uUmlnaHQ6XG5cdFx0XHRcdGxlZnQgPSBmYWxzZTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIERpcmVjdGlvbi5OZWFyZXN0OlxuXHRcdFx0XHQvLyBUaGUgY29kZSBiZWxvdyBhc3N1bWVzIHRoZSBvdXRwdXQgcG9zaXRpb24gaXMgZWl0aGVyIGxlZnQgb3IgcmlnaHRcblx0XHRcdFx0Ly8gb2YgdGhlIGlucHV0IHBvc2l0aW9uLiBJZiBpdCBpcyB0aGUgc2FtZSwgcmV0dXJuIGltbWVkaWF0ZWx5LlxuXHRcdFx0XHRpZiAodmlzaWJsZUNvbHVtbiAlIHRhYlNpemUgPT09IDApIHtcblx0XHRcdFx0XHRyZXR1cm4gcG9zaXRpb247XG5cdFx0XHRcdH1cblx0XHRcdFx0Ly8gR28gdG8gdGhlIG5lYXJlc3QgaW5kZW50YXRpb24uXG5cdFx0XHRcdGxlZnQgPSB2aXNpYmxlQ29sdW1uICUgdGFiU2l6ZSA8PSAodGFiU2l6ZSAvIDIpO1xuXHRcdFx0XHRicmVhaztcblx0XHR9XG5cblx0XHQvLyBJZiBnb2luZyBsZWZ0LCB3ZSBjYW4ganVzdCB1c2UgdGhlIGluZm8gYWJvdXQgdGhlIGxhc3QgdGFiIHN0b3AgcG9zaXRpb24gYW5kXG5cdFx0Ly8gbGFzdCB0YWIgc3RvcCB2aXNpYmxlIGNvbHVtbiB0aGF0IHdlIGNvbXB1dGVkIGluIHRoZSBmaXJzdCB3YWxrIG92ZXIgdGhlIHdoaXRlc3BhY2UuXG5cdFx0aWYgKGxlZnQpIHtcblx0XHRcdGlmIChwcmV2VGFiU3RvcFBvc2l0aW9uID09PSAtMSkge1xuXHRcdFx0XHRyZXR1cm4gLTE7XG5cdFx0XHR9XG5cdFx0XHQvLyBJZiB0aGUgZGlyZWN0aW9uIGlzIGxlZnQsIHdlIG5lZWQgdG8ga2VlcCBzY2FubmluZyByaWdodCB0byBlbnN1cmVcblx0XHRcdC8vIHRoYXQgdGFyZ2V0VmlzaWJsZUNvbHVtbiArIHRhYlNpemUgaXMgYmVmb3JlIG5vbi13aGl0ZXNwYWNlLlxuXHRcdFx0Ly8gVGhpcyBpcyBzbyB0aGF0IHdoZW4gd2UgcHJlc3MgbGVmdCBhdCB0aGUgZW5kIG9mIGEgcGFydGlhbFxuXHRcdFx0Ly8gaW5kZW50YXRpb24gaXQgb25seSBnb2VzIG9uZSBjaGFyYWN0ZXIuIEZvciBleGFtcGxlICcgICAgICBmb28nIHdpdGhcblx0XHRcdC8vIHRhYlNpemUgNCwgc2hvdWxkIGp1bXAgZnJvbSBwb3NpdGlvbiA2IHRvIHBvc2l0aW9uIDUsIG5vdCA0LlxuXHRcdFx0bGV0IGN1cnJlbnRWaXNpYmxlQ29sdW1uID0gcHJldlRhYlN0b3BWaXNpYmxlQ29sdW1uO1xuXHRcdFx0Zm9yIChsZXQgaSA9IHByZXZUYWJTdG9wUG9zaXRpb247IGkgPCBsaW5lTGVuZ3RoOyArK2kpIHtcblx0XHRcdFx0aWYgKGN1cnJlbnRWaXNpYmxlQ29sdW1uID09PSBwcmV2VGFiU3RvcFZpc2libGVDb2x1bW4gKyB0YWJTaXplKSB7XG5cdFx0XHRcdFx0Ly8gSXQgaXMgYSBmdWxsIGluZGVudGF0aW9uLlxuXHRcdFx0XHRcdHJldHVybiBwcmV2VGFiU3RvcFBvc2l0aW9uO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgY2hDb2RlID0gbGluZUNvbnRlbnQuY2hhckNvZGVBdChpKTtcblx0XHRcdFx0c3dpdGNoIChjaENvZGUpIHtcblx0XHRcdFx0XHRjYXNlIENoYXJDb2RlLlNwYWNlOlxuXHRcdFx0XHRcdFx0Y3VycmVudFZpc2libGVDb2x1bW4gKz0gMTtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdGNhc2UgQ2hhckNvZGUuVGFiOlxuXHRcdFx0XHRcdFx0Y3VycmVudFZpc2libGVDb2x1bW4gPSBDdXJzb3JDb2x1bW5zLm5leHRSZW5kZXJUYWJTdG9wKGN1cnJlbnRWaXNpYmxlQ29sdW1uLCB0YWJTaXplKTtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdFx0XHRyZXR1cm4gLTE7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGlmIChjdXJyZW50VmlzaWJsZUNvbHVtbiA9PT0gcHJldlRhYlN0b3BWaXNpYmxlQ29sdW1uICsgdGFiU2l6ZSkge1xuXHRcdFx0XHRyZXR1cm4gcHJldlRhYlN0b3BQb3NpdGlvbjtcblx0XHRcdH1cblx0XHRcdC8vIEl0IG11c3QgaGF2ZSBiZWVuIGEgcGFydGlhbCBpbmRlbnRhdGlvbi5cblx0XHRcdHJldHVybiAtMTtcblx0XHR9XG5cblx0XHQvLyBXZSBhcmUgZ29pbmcgcmlnaHQuXG5cdFx0Y29uc3QgdGFyZ2V0VmlzaWJsZUNvbHVtbiA9IEN1cnNvckNvbHVtbnMubmV4dFJlbmRlclRhYlN0b3AodmlzaWJsZUNvbHVtbiwgdGFiU2l6ZSk7XG5cblx0XHQvLyBXZSBjYW4ganVzdCBjb250aW51ZSBmcm9tIHdoZXJlIHdoaXRlc3BhY2VWaXNpYmxlQ29sdW1uIGdvdCB0by5cblx0XHRsZXQgY3VycmVudFZpc2libGVDb2x1bW4gPSB2aXNpYmxlQ29sdW1uO1xuXHRcdGZvciAobGV0IGkgPSBwb3NpdGlvbjsgaSA8IGxpbmVMZW5ndGg7IGkrKykge1xuXHRcdFx0aWYgKGN1cnJlbnRWaXNpYmxlQ29sdW1uID09PSB0YXJnZXRWaXNpYmxlQ29sdW1uKSB7XG5cdFx0XHRcdHJldHVybiBpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBjaENvZGUgPSBsaW5lQ29udGVudC5jaGFyQ29kZUF0KGkpO1xuXHRcdFx0c3dpdGNoIChjaENvZGUpIHtcblx0XHRcdFx0Y2FzZSBDaGFyQ29kZS5TcGFjZTpcblx0XHRcdFx0XHRjdXJyZW50VmlzaWJsZUNvbHVtbiArPSAxO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIENoYXJDb2RlLlRhYjpcblx0XHRcdFx0XHRjdXJyZW50VmlzaWJsZUNvbHVtbiA9IEN1cnNvckNvbHVtbnMubmV4dFJlbmRlclRhYlN0b3AoY3VycmVudFZpc2libGVDb2x1bW4sIHRhYlNpemUpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRcdHJldHVybiAtMTtcblx0XHRcdH1cblx0XHR9XG5cdFx0Ly8gVGhpcyBjb25kaXRpb24gaGFuZGxlcyB3aGVuIHRoZSB0YXJnZXQgY29sdW1uIGlzIGF0IHRoZSBlbmQgb2YgdGhlIGxpbmUuXG5cdFx0aWYgKGN1cnJlbnRWaXNpYmxlQ29sdW1uID09PSB0YXJnZXRWaXNpYmxlQ29sdW1uKSB7XG5cdFx0XHRyZXR1cm4gbGluZUxlbmd0aDtcblx0XHR9XG5cdFx0cmV0dXJuIC0xO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHFCQUFxQjtBQUV2QixJQUFXLFlBQVgsa0JBQVdBLGVBQVg7QUFDTixFQUFBQSxzQkFBQTtBQUNBLEVBQUFBLHNCQUFBO0FBQ0EsRUFBQUEsc0JBQUE7QUFIaUIsU0FBQUE7QUFBQSxHQUFBO0FBTVgsTUFBTSx3QkFBd0I7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQU9wQyxPQUFjLHdCQUF3QixhQUFxQixVQUFrQixTQUEyQztBQUN2SCxVQUFNLGFBQWEsWUFBWTtBQUMvQixRQUFJLGdCQUFnQjtBQUNwQixRQUFJLHNCQUFzQjtBQUMxQixRQUFJLDJCQUEyQjtBQUMvQixhQUFTLElBQUksR0FBRyxJQUFJLFlBQVksS0FBSztBQUNwQyxVQUFJLE1BQU0sVUFBVTtBQUNuQixlQUFPLENBQUMscUJBQXFCLDBCQUEwQixhQUFhO0FBQUEsTUFDckU7QUFDQSxVQUFJLGdCQUFnQixZQUFZLEdBQUc7QUFDbEMsOEJBQXNCO0FBQ3RCLG1DQUEyQjtBQUFBLE1BQzVCO0FBQ0EsWUFBTSxTQUFTLFlBQVksV0FBVyxDQUFDO0FBQ3ZDLGNBQVEsUUFBUTtBQUFBLFFBQ2YsS0FBSyxTQUFTO0FBQ2IsMkJBQWlCO0FBQ2pCO0FBQUEsUUFDRCxLQUFLLFNBQVM7QUFFYiwwQkFBZ0IsY0FBYyxrQkFBa0IsZUFBZSxPQUFPO0FBQ3RFO0FBQUEsUUFDRDtBQUNDLGlCQUFPLENBQUMsSUFBSSxJQUFJLEVBQUU7QUFBQSxNQUNwQjtBQUFBLElBQ0Q7QUFDQSxRQUFJLGFBQWEsWUFBWTtBQUM1QixhQUFPLENBQUMscUJBQXFCLDBCQUEwQixhQUFhO0FBQUEsSUFDckU7QUFDQSxXQUFPLENBQUMsSUFBSSxJQUFJLEVBQUU7QUFBQSxFQUNuQjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBV0EsT0FBYyxlQUFlLGFBQXFCLFVBQWtCLFNBQWlCLFdBQThCO0FBQ2xILFVBQU0sYUFBYSxZQUFZO0FBSS9CLFVBQU0sQ0FBQyxxQkFBcUIsMEJBQTBCLGFBQWEsSUFBSSx3QkFBd0Isd0JBQXdCLGFBQWEsVUFBVSxPQUFPO0FBRXJKLFFBQUksa0JBQWtCLElBQUk7QUFDekIsYUFBTztBQUFBLElBQ1I7QUFJQSxRQUFJO0FBQ0osWUFBUSxXQUFXO0FBQUEsTUFDbEIsS0FBSztBQUNKLGVBQU87QUFDUDtBQUFBLE1BQ0QsS0FBSztBQUNKLGVBQU87QUFDUDtBQUFBLE1BQ0QsS0FBSztBQUdKLFlBQUksZ0JBQWdCLFlBQVksR0FBRztBQUNsQyxpQkFBTztBQUFBLFFBQ1I7QUFFQSxlQUFPLGdCQUFnQixXQUFZLFVBQVU7QUFDN0M7QUFBQSxJQUNGO0FBSUEsUUFBSSxNQUFNO0FBQ1QsVUFBSSx3QkFBd0IsSUFBSTtBQUMvQixlQUFPO0FBQUEsTUFDUjtBQU1BLFVBQUlDLHdCQUF1QjtBQUMzQixlQUFTLElBQUkscUJBQXFCLElBQUksWUFBWSxFQUFFLEdBQUc7QUFDdEQsWUFBSUEsMEJBQXlCLDJCQUEyQixTQUFTO0FBRWhFLGlCQUFPO0FBQUEsUUFDUjtBQUVBLGNBQU0sU0FBUyxZQUFZLFdBQVcsQ0FBQztBQUN2QyxnQkFBUSxRQUFRO0FBQUEsVUFDZixLQUFLLFNBQVM7QUFDYixZQUFBQSx5QkFBd0I7QUFDeEI7QUFBQSxVQUNELEtBQUssU0FBUztBQUNiLFlBQUFBLHdCQUF1QixjQUFjLGtCQUFrQkEsdUJBQXNCLE9BQU87QUFDcEY7QUFBQSxVQUNEO0FBQ0MsbUJBQU87QUFBQSxRQUNUO0FBQUEsTUFDRDtBQUNBLFVBQUlBLDBCQUF5QiwyQkFBMkIsU0FBUztBQUNoRSxlQUFPO0FBQUEsTUFDUjtBQUVBLGFBQU87QUFBQSxJQUNSO0FBR0EsVUFBTSxzQkFBc0IsY0FBYyxrQkFBa0IsZUFBZSxPQUFPO0FBR2xGLFFBQUksdUJBQXVCO0FBQzNCLGFBQVMsSUFBSSxVQUFVLElBQUksWUFBWSxLQUFLO0FBQzNDLFVBQUkseUJBQXlCLHFCQUFxQjtBQUNqRCxlQUFPO0FBQUEsTUFDUjtBQUVBLFlBQU0sU0FBUyxZQUFZLFdBQVcsQ0FBQztBQUN2QyxjQUFRLFFBQVE7QUFBQSxRQUNmLEtBQUssU0FBUztBQUNiLGtDQUF3QjtBQUN4QjtBQUFBLFFBQ0QsS0FBSyxTQUFTO0FBQ2IsaUNBQXVCLGNBQWMsa0JBQWtCLHNCQUFzQixPQUFPO0FBQ3BGO0FBQUEsUUFDRDtBQUNDLGlCQUFPO0FBQUEsTUFDVDtBQUFBLElBQ0Q7QUFFQSxRQUFJLHlCQUF5QixxQkFBcUI7QUFDakQsYUFBTztBQUFBLElBQ1I7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUNEOyIsCiAgIm5hbWVzIjogWyJEaXJlY3Rpb24iLCAiY3VycmVudFZpc2libGVDb2x1bW4iXQp9Cg==
