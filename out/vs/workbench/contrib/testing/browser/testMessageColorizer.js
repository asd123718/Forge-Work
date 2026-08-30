import { renderAsPlaintext } from "../../../../base/browser/markdownRenderer.js";
import { toDisposable } from "../../../../base/common/lifecycle.js";
import { GraphemeIterator, forAnsiStringParts, removeAnsiEscapeCodes } from "../../../../base/common/strings.js";
import "./media/testMessageColorizer.css";
import { Position } from "../../../../editor/common/core/position.js";
import { Range } from "../../../../editor/common/core/range.js";
const colorAttrRe = /^\x1b\[([0-9]+)m$/;
var Classes = /* @__PURE__ */ ((Classes2) => {
  Classes2["Prefix"] = "tstm-ansidec-";
  Classes2["ForegroundPrefix"] = "tstm-ansidec-fg";
  Classes2["BackgroundPrefix"] = "tstm-ansidec-bg";
  Classes2["Bold"] = "tstm-ansidec-1";
  Classes2["Faint"] = "tstm-ansidec-2";
  Classes2["Italic"] = "tstm-ansidec-3";
  Classes2["Underline"] = "tstm-ansidec-4";
  return Classes2;
})(Classes || {});
const renderTestMessageAsText = (tm) => typeof tm === "string" ? removeAnsiEscapeCodes(tm) : renderAsPlaintext(tm);
const colorizeTestMessageInEditor = (message, editor) => {
  const decos = [];
  editor.changeDecorations((changeAccessor) => {
    let start = new Position(1, 1);
    let cls = [];
    for (const part of forAnsiStringParts(message)) {
      if (part.isCode) {
        const colorAttr = colorAttrRe.exec(part.str)?.[1];
        if (!colorAttr) {
          continue;
        }
        const n = Number(colorAttr);
        if (n === 0) {
          cls.length = 0;
        } else if (n === 22) {
          cls = cls.filter((c) => c !== "tstm-ansidec-1" /* Bold */ && c !== "tstm-ansidec-3" /* Italic */);
        } else if (n === 23) {
          cls = cls.filter((c) => c !== "tstm-ansidec-3" /* Italic */);
        } else if (n === 24) {
          cls = cls.filter((c) => c !== "tstm-ansidec-4" /* Underline */);
        } else if (n >= 30 && n <= 39 || n >= 90 && n <= 99) {
          cls = cls.filter((c) => !c.startsWith("tstm-ansidec-fg" /* ForegroundPrefix */));
          cls.push("tstm-ansidec-fg" /* ForegroundPrefix */ + colorAttr);
        } else if (n >= 40 && n <= 49 || n >= 100 && n <= 109) {
          cls = cls.filter((c) => !c.startsWith("tstm-ansidec-bg" /* BackgroundPrefix */));
          cls.push("tstm-ansidec-bg" /* BackgroundPrefix */ + colorAttr);
        } else {
          cls.push("tstm-ansidec-" /* Prefix */ + colorAttr);
        }
      } else {
        let line = start.lineNumber;
        let col = start.column;
        const graphemes = new GraphemeIterator(part.str);
        for (let i = 0; !graphemes.eol(); i += graphemes.nextGraphemeLength()) {
          if (part.str[i] === "\n") {
            line++;
            col = 1;
          } else {
            col++;
          }
        }
        const end = new Position(line, col);
        if (cls.length) {
          decos.push(changeAccessor.addDecoration(Range.fromPositions(start, end), {
            inlineClassName: cls.join(" "),
            description: "test-message-colorized"
          }));
        }
        start = end;
      }
    }
  });
  return toDisposable(() => editor.removeDecorations(decos));
};
export {
  colorizeTestMessageInEditor,
  renderTestMessageAsText
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlc3RpbmdcXGJyb3dzZXJcXHRlc3RNZXNzYWdlQ29sb3JpemVyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgcmVuZGVyQXNQbGFpbnRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvbWFya2Rvd25SZW5kZXJlci5qcyc7XG5pbXBvcnQgeyBJTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBJRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IEdyYXBoZW1lSXRlcmF0b3IsIGZvckFuc2lTdHJpbmdQYXJ0cywgcmVtb3ZlQW5zaUVzY2FwZUNvZGVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgJy4vbWVkaWEvdGVzdE1lc3NhZ2VDb2xvcml6ZXIuY3NzJztcbmltcG9ydCB7IENvZGVFZGl0b3JXaWRnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci93aWRnZXQvY29kZUVkaXRvci9jb2RlRWRpdG9yV2lkZ2V0LmpzJztcbmltcG9ydCB7IFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcblxuY29uc3QgY29sb3JBdHRyUmUgPSAvXlxceDFiXFxbKFswLTldKyltJC87XG5cbmNvbnN0IGVudW0gQ2xhc3NlcyB7XG5cdFByZWZpeCA9ICd0c3RtLWFuc2lkZWMtJyxcblx0Rm9yZWdyb3VuZFByZWZpeCA9IENsYXNzZXMuUHJlZml4ICsgJ2ZnJyxcblx0QmFja2dyb3VuZFByZWZpeCA9IENsYXNzZXMuUHJlZml4ICsgJ2JnJyxcblx0Qm9sZCA9IENsYXNzZXMuUHJlZml4ICsgJzEnLFxuXHRGYWludCA9IENsYXNzZXMuUHJlZml4ICsgJzInLFxuXHRJdGFsaWMgPSBDbGFzc2VzLlByZWZpeCArICczJyxcblx0VW5kZXJsaW5lID0gQ2xhc3Nlcy5QcmVmaXggKyAnNCcsXG59XG5cbmV4cG9ydCBjb25zdCByZW5kZXJUZXN0TWVzc2FnZUFzVGV4dCA9ICh0bTogc3RyaW5nIHwgSU1hcmtkb3duU3RyaW5nKSA9PlxuXHR0eXBlb2YgdG0gPT09ICdzdHJpbmcnID8gcmVtb3ZlQW5zaUVzY2FwZUNvZGVzKHRtKSA6IHJlbmRlckFzUGxhaW50ZXh0KHRtKTtcblxuXG4vKipcbiAqIEFwcGxpZXMgZGVjb3JhdGlvbnMgYmFzZWQgb24gQU5TSSBzdHlsZXMgZnJvbSB0aGUgdGVzdCBtZXNzYWdlIGluIHRoZSBlZGl0b3IuXG4gKiBBTlNJIHNlcXVlbmNlcyBhcmUgc3RyaXBwZWQgZnJvbSB0aGUgdGV4dCBkaXNwbGF5ZWQgaW4gZWRpdG9yLCBhbmQgdGhpc1xuICogcmUtYXBwbGllcyB0aGVpciBjb2xvcml6YXRpb24uXG4gKlxuICogVGhpcyB1c2VzIGRlY29yYXRpb25zIHJhdGhlciB0aGFuIGxhbmd1YWdlIGZlYXR1cmVzIGJlY2F1c2UgdGhlIHN0cmluZ1xuICogcmVuZGVyZWQgaW4gdGhlIGVkaXRvciBsYWNrcyB0aGUgQU5TSSBjb2RlcyBuZWVkZWQgdG8gYWN0dWFsbHkgYXBwbHkgdGhlXG4gKiBjb2xvcml6YXRpb24uXG4gKlxuICogTm90ZTogZG9lcyBub3Qgc3VwcG9ydCBUcnVlQ29sb3IuXG4gKi9cbmV4cG9ydCBjb25zdCBjb2xvcml6ZVRlc3RNZXNzYWdlSW5FZGl0b3IgPSAobWVzc2FnZTogc3RyaW5nLCBlZGl0b3I6IENvZGVFZGl0b3JXaWRnZXQpOiBJRGlzcG9zYWJsZSA9PiB7XG5cdGNvbnN0IGRlY29zOiBzdHJpbmdbXSA9IFtdO1xuXG5cdGVkaXRvci5jaGFuZ2VEZWNvcmF0aW9ucyhjaGFuZ2VBY2Nlc3NvciA9PiB7XG5cdFx0bGV0IHN0YXJ0ID0gbmV3IFBvc2l0aW9uKDEsIDEpO1xuXHRcdGxldCBjbHM6IHN0cmluZ1tdID0gW107XG5cdFx0Zm9yIChjb25zdCBwYXJ0IG9mIGZvckFuc2lTdHJpbmdQYXJ0cyhtZXNzYWdlKSkge1xuXHRcdFx0aWYgKHBhcnQuaXNDb2RlKSB7XG5cdFx0XHRcdGNvbnN0IGNvbG9yQXR0ciA9IGNvbG9yQXR0clJlLmV4ZWMocGFydC5zdHIpPy5bMV07XG5cdFx0XHRcdGlmICghY29sb3JBdHRyKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBuID0gTnVtYmVyKGNvbG9yQXR0cik7XG5cdFx0XHRcdGlmIChuID09PSAwKSB7XG5cdFx0XHRcdFx0Y2xzLmxlbmd0aCA9IDA7XG5cdFx0XHRcdH0gZWxzZSBpZiAobiA9PT0gMjIpIHtcblx0XHRcdFx0XHRjbHMgPSBjbHMuZmlsdGVyKGMgPT4gYyAhPT0gQ2xhc3Nlcy5Cb2xkICYmIGMgIT09IENsYXNzZXMuSXRhbGljKTtcblx0XHRcdFx0fSBlbHNlIGlmIChuID09PSAyMykge1xuXHRcdFx0XHRcdGNscyA9IGNscy5maWx0ZXIoYyA9PiBjICE9PSBDbGFzc2VzLkl0YWxpYyk7XG5cdFx0XHRcdH0gZWxzZSBpZiAobiA9PT0gMjQpIHtcblx0XHRcdFx0XHRjbHMgPSBjbHMuZmlsdGVyKGMgPT4gYyAhPT0gQ2xhc3Nlcy5VbmRlcmxpbmUpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKChuID49IDMwICYmIG4gPD0gMzkpIHx8IChuID49IDkwICYmIG4gPD0gOTkpKSB7XG5cdFx0XHRcdFx0Y2xzID0gY2xzLmZpbHRlcihjID0+ICFjLnN0YXJ0c1dpdGgoQ2xhc3Nlcy5Gb3JlZ3JvdW5kUHJlZml4KSk7XG5cdFx0XHRcdFx0Y2xzLnB1c2goQ2xhc3Nlcy5Gb3JlZ3JvdW5kUHJlZml4ICsgY29sb3JBdHRyKTtcblx0XHRcdFx0fSBlbHNlIGlmICgobiA+PSA0MCAmJiBuIDw9IDQ5KSB8fCAobiA+PSAxMDAgJiYgbiA8PSAxMDkpKSB7XG5cdFx0XHRcdFx0Y2xzID0gY2xzLmZpbHRlcihjID0+ICFjLnN0YXJ0c1dpdGgoQ2xhc3Nlcy5CYWNrZ3JvdW5kUHJlZml4KSk7XG5cdFx0XHRcdFx0Y2xzLnB1c2goQ2xhc3Nlcy5CYWNrZ3JvdW5kUHJlZml4ICsgY29sb3JBdHRyKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRjbHMucHVzaChDbGFzc2VzLlByZWZpeCArIGNvbG9yQXR0cik7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGxldCBsaW5lID0gc3RhcnQubGluZU51bWJlcjtcblx0XHRcdFx0bGV0IGNvbCA9IHN0YXJ0LmNvbHVtbjtcblxuXHRcdFx0XHRjb25zdCBncmFwaGVtZXMgPSBuZXcgR3JhcGhlbWVJdGVyYXRvcihwYXJ0LnN0cik7XG5cdFx0XHRcdGZvciAobGV0IGkgPSAwOyAhZ3JhcGhlbWVzLmVvbCgpOyBpICs9IGdyYXBoZW1lcy5uZXh0R3JhcGhlbWVMZW5ndGgoKSkge1xuXHRcdFx0XHRcdGlmIChwYXJ0LnN0cltpXSA9PT0gJ1xcbicpIHtcblx0XHRcdFx0XHRcdGxpbmUrKztcblx0XHRcdFx0XHRcdGNvbCA9IDE7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGNvbCsrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IGVuZCA9IG5ldyBQb3NpdGlvbihsaW5lLCBjb2wpO1xuXHRcdFx0XHRpZiAoY2xzLmxlbmd0aCkge1xuXHRcdFx0XHRcdGRlY29zLnB1c2goY2hhbmdlQWNjZXNzb3IuYWRkRGVjb3JhdGlvbihSYW5nZS5mcm9tUG9zaXRpb25zKHN0YXJ0LCBlbmQpLCB7XG5cdFx0XHRcdFx0XHRpbmxpbmVDbGFzc05hbWU6IGNscy5qb2luKCcgJyksXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ3Rlc3QtbWVzc2FnZS1jb2xvcml6ZWQnLFxuXHRcdFx0XHRcdH0pKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRzdGFydCA9IGVuZDtcblx0XHRcdH1cblx0XHR9XG5cdH0pO1xuXG5cdHJldHVybiB0b0Rpc3Bvc2FibGUoKCkgPT4gZWRpdG9yLnJlbW92ZURlY29yYXRpb25zKGRlY29zKSk7XG59O1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyx5QkFBeUI7QUFFbEMsU0FBc0Isb0JBQW9CO0FBQzFDLFNBQVMsa0JBQWtCLG9CQUFvQiw2QkFBNkI7QUFDNUUsT0FBTztBQUVQLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsYUFBYTtBQUV0QixNQUFNLGNBQWM7QUFFcEIsSUFBVyxVQUFYLGtCQUFXQSxhQUFYO0FBQ0MsRUFBQUEsU0FBQSxZQUFTO0FBQ1QsRUFBQUEsU0FBQSxzQkFBbUI7QUFDbkIsRUFBQUEsU0FBQSxzQkFBbUI7QUFDbkIsRUFBQUEsU0FBQSxVQUFPO0FBQ1AsRUFBQUEsU0FBQSxXQUFRO0FBQ1IsRUFBQUEsU0FBQSxZQUFTO0FBQ1QsRUFBQUEsU0FBQSxlQUFZO0FBUEYsU0FBQUE7QUFBQSxHQUFBO0FBVUosTUFBTSwwQkFBMEIsQ0FBQyxPQUN2QyxPQUFPLE9BQU8sV0FBVyxzQkFBc0IsRUFBRSxJQUFJLGtCQUFrQixFQUFFO0FBY25FLE1BQU0sOEJBQThCLENBQUMsU0FBaUIsV0FBMEM7QUFDdEcsUUFBTSxRQUFrQixDQUFDO0FBRXpCLFNBQU8sa0JBQWtCLG9CQUFrQjtBQUMxQyxRQUFJLFFBQVEsSUFBSSxTQUFTLEdBQUcsQ0FBQztBQUM3QixRQUFJLE1BQWdCLENBQUM7QUFDckIsZUFBVyxRQUFRLG1CQUFtQixPQUFPLEdBQUc7QUFDL0MsVUFBSSxLQUFLLFFBQVE7QUFDaEIsY0FBTSxZQUFZLFlBQVksS0FBSyxLQUFLLEdBQUcsSUFBSSxDQUFDO0FBQ2hELFlBQUksQ0FBQyxXQUFXO0FBQ2Y7QUFBQSxRQUNEO0FBRUEsY0FBTSxJQUFJLE9BQU8sU0FBUztBQUMxQixZQUFJLE1BQU0sR0FBRztBQUNaLGNBQUksU0FBUztBQUFBLFFBQ2QsV0FBVyxNQUFNLElBQUk7QUFDcEIsZ0JBQU0sSUFBSSxPQUFPLE9BQUssTUFBTSwrQkFBZ0IsTUFBTSw2QkFBYztBQUFBLFFBQ2pFLFdBQVcsTUFBTSxJQUFJO0FBQ3BCLGdCQUFNLElBQUksT0FBTyxPQUFLLE1BQU0sNkJBQWM7QUFBQSxRQUMzQyxXQUFXLE1BQU0sSUFBSTtBQUNwQixnQkFBTSxJQUFJLE9BQU8sT0FBSyxNQUFNLGdDQUFpQjtBQUFBLFFBQzlDLFdBQVksS0FBSyxNQUFNLEtBQUssTUFBUSxLQUFLLE1BQU0sS0FBSyxJQUFLO0FBQ3hELGdCQUFNLElBQUksT0FBTyxPQUFLLENBQUMsRUFBRSxXQUFXLHdDQUF3QixDQUFDO0FBQzdELGNBQUksS0FBSywyQ0FBMkIsU0FBUztBQUFBLFFBQzlDLFdBQVksS0FBSyxNQUFNLEtBQUssTUFBUSxLQUFLLE9BQU8sS0FBSyxLQUFNO0FBQzFELGdCQUFNLElBQUksT0FBTyxPQUFLLENBQUMsRUFBRSxXQUFXLHdDQUF3QixDQUFDO0FBQzdELGNBQUksS0FBSywyQ0FBMkIsU0FBUztBQUFBLFFBQzlDLE9BQU87QUFDTixjQUFJLEtBQUssK0JBQWlCLFNBQVM7QUFBQSxRQUNwQztBQUFBLE1BQ0QsT0FBTztBQUNOLFlBQUksT0FBTyxNQUFNO0FBQ2pCLFlBQUksTUFBTSxNQUFNO0FBRWhCLGNBQU0sWUFBWSxJQUFJLGlCQUFpQixLQUFLLEdBQUc7QUFDL0MsaUJBQVMsSUFBSSxHQUFHLENBQUMsVUFBVSxJQUFJLEdBQUcsS0FBSyxVQUFVLG1CQUFtQixHQUFHO0FBQ3RFLGNBQUksS0FBSyxJQUFJLENBQUMsTUFBTSxNQUFNO0FBQ3pCO0FBQ0Esa0JBQU07QUFBQSxVQUNQLE9BQU87QUFDTjtBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBRUEsY0FBTSxNQUFNLElBQUksU0FBUyxNQUFNLEdBQUc7QUFDbEMsWUFBSSxJQUFJLFFBQVE7QUFDZixnQkFBTSxLQUFLLGVBQWUsY0FBYyxNQUFNLGNBQWMsT0FBTyxHQUFHLEdBQUc7QUFBQSxZQUN4RSxpQkFBaUIsSUFBSSxLQUFLLEdBQUc7QUFBQSxZQUM3QixhQUFhO0FBQUEsVUFDZCxDQUFDLENBQUM7QUFBQSxRQUNIO0FBQ0EsZ0JBQVE7QUFBQSxNQUNUO0FBQUEsSUFDRDtBQUFBLEVBQ0QsQ0FBQztBQUVELFNBQU8sYUFBYSxNQUFNLE9BQU8sa0JBQWtCLEtBQUssQ0FBQztBQUMxRDsiLAogICJuYW1lcyI6IFsiQ2xhc3NlcyJdCn0K
