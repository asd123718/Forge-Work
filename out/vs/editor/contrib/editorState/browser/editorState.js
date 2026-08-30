import * as strings from "../../../../base/common/strings.js";
import { Range } from "../../../common/core/range.js";
import { CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { EditorKeybindingCancellationTokenSource } from "./keybindingCancellation.js";
var CodeEditorStateFlag = /* @__PURE__ */ ((CodeEditorStateFlag2) => {
  CodeEditorStateFlag2[CodeEditorStateFlag2["Value"] = 1] = "Value";
  CodeEditorStateFlag2[CodeEditorStateFlag2["Selection"] = 2] = "Selection";
  CodeEditorStateFlag2[CodeEditorStateFlag2["Position"] = 4] = "Position";
  CodeEditorStateFlag2[CodeEditorStateFlag2["Scroll"] = 8] = "Scroll";
  return CodeEditorStateFlag2;
})(CodeEditorStateFlag || {});
class EditorState {
  constructor(editor, flags) {
    this.flags = flags;
    if ((this.flags & 1 /* Value */) !== 0) {
      const model = editor.getModel();
      this.modelVersionId = model ? strings.format("{0}#{1}", model.uri.toString(), model.getVersionId()) : null;
    } else {
      this.modelVersionId = null;
    }
    if ((this.flags & 4 /* Position */) !== 0) {
      this.position = editor.getPosition();
    } else {
      this.position = null;
    }
    if ((this.flags & 2 /* Selection */) !== 0) {
      this.selection = editor.getSelection();
    } else {
      this.selection = null;
    }
    if ((this.flags & 8 /* Scroll */) !== 0) {
      this.scrollLeft = editor.getScrollLeft();
      this.scrollTop = editor.getScrollTop();
    } else {
      this.scrollLeft = -1;
      this.scrollTop = -1;
    }
  }
  _equals(other) {
    if (!(other instanceof EditorState)) {
      return false;
    }
    const state = other;
    if (this.modelVersionId !== state.modelVersionId) {
      return false;
    }
    if (this.scrollLeft !== state.scrollLeft || this.scrollTop !== state.scrollTop) {
      return false;
    }
    if (!this.position && state.position || this.position && !state.position || this.position && state.position && !this.position.equals(state.position)) {
      return false;
    }
    if (!this.selection && state.selection || this.selection && !state.selection || this.selection && state.selection && !this.selection.equalsRange(state.selection)) {
      return false;
    }
    return true;
  }
  validate(editor) {
    return this._equals(new EditorState(editor, this.flags));
  }
}
class EditorStateCancellationTokenSource extends EditorKeybindingCancellationTokenSource {
  constructor(editor, flags, range, parent) {
    super(editor, parent);
    this._listener = new DisposableStore();
    if (flags & 4 /* Position */) {
      this._listener.add(editor.onDidChangeCursorPosition((e) => {
        if (!range || !Range.containsPosition(range, e.position)) {
          this.cancel();
        }
      }));
    }
    if (flags & 2 /* Selection */) {
      this._listener.add(editor.onDidChangeCursorSelection((e) => {
        if (!range || !Range.containsRange(range, e.selection)) {
          this.cancel();
        }
      }));
    }
    if (flags & 8 /* Scroll */) {
      this._listener.add(editor.onDidScrollChange((_) => this.cancel()));
    }
    if (flags & 1 /* Value */) {
      this._listener.add(editor.onDidChangeModel((_) => this.cancel()));
      this._listener.add(editor.onDidChangeModelContent((_) => this.cancel()));
    }
  }
  dispose() {
    this._listener.dispose();
    super.dispose();
  }
}
class TextModelCancellationTokenSource extends CancellationTokenSource {
  constructor(model, parent) {
    super(parent);
    this._listener = model.onDidChangeContent(() => this.cancel());
  }
  dispose() {
    this._listener.dispose();
    super.dispose();
  }
}
export {
  CodeEditorStateFlag,
  EditorState,
  EditorStateCancellationTokenSource,
  TextModelCancellationTokenSource
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXGVkaXRvclN0YXRlXFxicm93c2VyXFxlZGl0b3JTdGF0ZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIHN0cmluZ3MgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvciwgSUFjdGl2ZUNvZGVFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBSYW5nZSwgSVJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UsIENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IElEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBFZGl0b3JLZXliaW5kaW5nQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuL2tleWJpbmRpbmdDYW5jZWxsYXRpb24uanMnO1xuXG5leHBvcnQgY29uc3QgZW51bSBDb2RlRWRpdG9yU3RhdGVGbGFnIHtcblx0VmFsdWUgPSAxLFxuXHRTZWxlY3Rpb24gPSAyLFxuXHRQb3NpdGlvbiA9IDQsXG5cdFNjcm9sbCA9IDhcbn1cblxuZXhwb3J0IGNsYXNzIEVkaXRvclN0YXRlIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGZsYWdzOiBudW1iZXI7XG5cblx0cHJpdmF0ZSByZWFkb25seSBwb3NpdGlvbjogUG9zaXRpb24gfCBudWxsO1xuXHRwcml2YXRlIHJlYWRvbmx5IHNlbGVjdGlvbjogUmFuZ2UgfCBudWxsO1xuXHRwcml2YXRlIHJlYWRvbmx5IG1vZGVsVmVyc2lvbklkOiBzdHJpbmcgfCBudWxsO1xuXHRwcml2YXRlIHJlYWRvbmx5IHNjcm9sbExlZnQ6IG51bWJlcjtcblx0cHJpdmF0ZSByZWFkb25seSBzY3JvbGxUb3A6IG51bWJlcjtcblxuXHRjb25zdHJ1Y3RvcihlZGl0b3I6IElDb2RlRWRpdG9yLCBmbGFnczogbnVtYmVyKSB7XG5cdFx0dGhpcy5mbGFncyA9IGZsYWdzO1xuXG5cdFx0aWYgKCh0aGlzLmZsYWdzICYgQ29kZUVkaXRvclN0YXRlRmxhZy5WYWx1ZSkgIT09IDApIHtcblx0XHRcdGNvbnN0IG1vZGVsID0gZWRpdG9yLmdldE1vZGVsKCk7XG5cdFx0XHR0aGlzLm1vZGVsVmVyc2lvbklkID0gbW9kZWwgPyBzdHJpbmdzLmZvcm1hdCgnezB9I3sxfScsIG1vZGVsLnVyaS50b1N0cmluZygpLCBtb2RlbC5nZXRWZXJzaW9uSWQoKSkgOiBudWxsO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLm1vZGVsVmVyc2lvbklkID0gbnVsbDtcblx0XHR9XG5cdFx0aWYgKCh0aGlzLmZsYWdzICYgQ29kZUVkaXRvclN0YXRlRmxhZy5Qb3NpdGlvbikgIT09IDApIHtcblx0XHRcdHRoaXMucG9zaXRpb24gPSBlZGl0b3IuZ2V0UG9zaXRpb24oKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5wb3NpdGlvbiA9IG51bGw7XG5cdFx0fVxuXHRcdGlmICgodGhpcy5mbGFncyAmIENvZGVFZGl0b3JTdGF0ZUZsYWcuU2VsZWN0aW9uKSAhPT0gMCkge1xuXHRcdFx0dGhpcy5zZWxlY3Rpb24gPSBlZGl0b3IuZ2V0U2VsZWN0aW9uKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuc2VsZWN0aW9uID0gbnVsbDtcblx0XHR9XG5cdFx0aWYgKCh0aGlzLmZsYWdzICYgQ29kZUVkaXRvclN0YXRlRmxhZy5TY3JvbGwpICE9PSAwKSB7XG5cdFx0XHR0aGlzLnNjcm9sbExlZnQgPSBlZGl0b3IuZ2V0U2Nyb2xsTGVmdCgpO1xuXHRcdFx0dGhpcy5zY3JvbGxUb3AgPSBlZGl0b3IuZ2V0U2Nyb2xsVG9wKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuc2Nyb2xsTGVmdCA9IC0xO1xuXHRcdFx0dGhpcy5zY3JvbGxUb3AgPSAtMTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9lcXVhbHMob3RoZXI6IHVua25vd24pOiBib29sZWFuIHtcblxuXHRcdGlmICghKG90aGVyIGluc3RhbmNlb2YgRWRpdG9yU3RhdGUpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGNvbnN0IHN0YXRlID0gb3RoZXI7XG5cblx0XHRpZiAodGhpcy5tb2RlbFZlcnNpb25JZCAhPT0gc3RhdGUubW9kZWxWZXJzaW9uSWQpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuc2Nyb2xsTGVmdCAhPT0gc3RhdGUuc2Nyb2xsTGVmdCB8fCB0aGlzLnNjcm9sbFRvcCAhPT0gc3RhdGUuc2Nyb2xsVG9wKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGlmICghdGhpcy5wb3NpdGlvbiAmJiBzdGF0ZS5wb3NpdGlvbiB8fCB0aGlzLnBvc2l0aW9uICYmICFzdGF0ZS5wb3NpdGlvbiB8fCB0aGlzLnBvc2l0aW9uICYmIHN0YXRlLnBvc2l0aW9uICYmICF0aGlzLnBvc2l0aW9uLmVxdWFscyhzdGF0ZS5wb3NpdGlvbikpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0aWYgKCF0aGlzLnNlbGVjdGlvbiAmJiBzdGF0ZS5zZWxlY3Rpb24gfHwgdGhpcy5zZWxlY3Rpb24gJiYgIXN0YXRlLnNlbGVjdGlvbiB8fCB0aGlzLnNlbGVjdGlvbiAmJiBzdGF0ZS5zZWxlY3Rpb24gJiYgIXRoaXMuc2VsZWN0aW9uLmVxdWFsc1JhbmdlKHN0YXRlLnNlbGVjdGlvbikpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwdWJsaWMgdmFsaWRhdGUoZWRpdG9yOiBJQ29kZUVkaXRvcik6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9lcXVhbHMobmV3IEVkaXRvclN0YXRlKGVkaXRvciwgdGhpcy5mbGFncykpO1xuXHR9XG59XG5cbi8qKlxuICogQSBjYW5jZWxsYXRpb24gdG9rZW4gc291cmNlIHRoYXQgY2FuY2VscyB3aGVuIHRoZSBlZGl0b3IgY2hhbmdlcyBhcyBleHByZXNzZWRcbiAqIGJ5IHRoZSBwcm92aWRlZCBmbGFnc1xuICogQHBhcmFtIHJhbmdlIElmIHByb3ZpZGVkLCBjaGFuZ2VzIGluIHBvc2l0aW9uIGFuZCBzZWxlY3Rpb24gd2l0aGluIHRoaXMgcmFuZ2Ugd2lsbCBub3QgdHJpZ2dlciBjYW5jZWxsYXRpb25cbiAqL1xuZXhwb3J0IGNsYXNzIEVkaXRvclN0YXRlQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgZXh0ZW5kcyBFZGl0b3JLZXliaW5kaW5nQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgaW1wbGVtZW50cyBJRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfbGlzdGVuZXIgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0Y29uc3RydWN0b3IoZWRpdG9yOiBJQWN0aXZlQ29kZUVkaXRvciwgZmxhZ3M6IENvZGVFZGl0b3JTdGF0ZUZsYWcsIHJhbmdlPzogSVJhbmdlLCBwYXJlbnQ/OiBDYW5jZWxsYXRpb25Ub2tlbikge1xuXHRcdHN1cGVyKGVkaXRvciwgcGFyZW50KTtcblxuXHRcdGlmIChmbGFncyAmIENvZGVFZGl0b3JTdGF0ZUZsYWcuUG9zaXRpb24pIHtcblx0XHRcdHRoaXMuX2xpc3RlbmVyLmFkZChlZGl0b3Iub25EaWRDaGFuZ2VDdXJzb3JQb3NpdGlvbihlID0+IHtcblx0XHRcdFx0aWYgKCFyYW5nZSB8fCAhUmFuZ2UuY29udGFpbnNQb3NpdGlvbihyYW5nZSwgZS5wb3NpdGlvbikpIHtcblx0XHRcdFx0XHR0aGlzLmNhbmNlbCgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fVxuXHRcdGlmIChmbGFncyAmIENvZGVFZGl0b3JTdGF0ZUZsYWcuU2VsZWN0aW9uKSB7XG5cdFx0XHR0aGlzLl9saXN0ZW5lci5hZGQoZWRpdG9yLm9uRGlkQ2hhbmdlQ3Vyc29yU2VsZWN0aW9uKGUgPT4ge1xuXHRcdFx0XHRpZiAoIXJhbmdlIHx8ICFSYW5nZS5jb250YWluc1JhbmdlKHJhbmdlLCBlLnNlbGVjdGlvbikpIHtcblx0XHRcdFx0XHR0aGlzLmNhbmNlbCgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fVxuXHRcdGlmIChmbGFncyAmIENvZGVFZGl0b3JTdGF0ZUZsYWcuU2Nyb2xsKSB7XG5cdFx0XHR0aGlzLl9saXN0ZW5lci5hZGQoZWRpdG9yLm9uRGlkU2Nyb2xsQ2hhbmdlKF8gPT4gdGhpcy5jYW5jZWwoKSkpO1xuXHRcdH1cblx0XHRpZiAoZmxhZ3MgJiBDb2RlRWRpdG9yU3RhdGVGbGFnLlZhbHVlKSB7XG5cdFx0XHR0aGlzLl9saXN0ZW5lci5hZGQoZWRpdG9yLm9uRGlkQ2hhbmdlTW9kZWwoXyA9PiB0aGlzLmNhbmNlbCgpKSk7XG5cdFx0XHR0aGlzLl9saXN0ZW5lci5hZGQoZWRpdG9yLm9uRGlkQ2hhbmdlTW9kZWxDb250ZW50KF8gPT4gdGhpcy5jYW5jZWwoKSkpO1xuXHRcdH1cblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKSB7XG5cdFx0dGhpcy5fbGlzdGVuZXIuZGlzcG9zZSgpO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxufVxuXG4vKipcbiAqIEEgY2FuY2VsbGF0aW9uIHRva2VuIHNvdXJjZSB0aGF0IGNhbmNlbHMgd2hlbiB0aGUgcHJvdmlkZWQgbW9kZWwgY2hhbmdlc1xuICovXG5leHBvcnQgY2xhc3MgVGV4dE1vZGVsQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgZXh0ZW5kcyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSBpbXBsZW1lbnRzIElEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIF9saXN0ZW5lcjogSURpc3Bvc2FibGU7XG5cblx0Y29uc3RydWN0b3IobW9kZWw6IElUZXh0TW9kZWwsIHBhcmVudD86IENhbmNlbGxhdGlvblRva2VuKSB7XG5cdFx0c3VwZXIocGFyZW50KTtcblx0XHR0aGlzLl9saXN0ZW5lciA9IG1vZGVsLm9uRGlkQ2hhbmdlQ29udGVudCgoKSA9PiB0aGlzLmNhbmNlbCgpKTtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKSB7XG5cdFx0dGhpcy5fbGlzdGVuZXIuZGlzcG9zZSgpO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsWUFBWSxhQUFhO0FBR3pCLFNBQVMsYUFBcUI7QUFDOUIsU0FBUywrQkFBa0Q7QUFDM0QsU0FBc0IsdUJBQXVCO0FBRTdDLFNBQVMsK0NBQStDO0FBRWpELElBQVcsc0JBQVgsa0JBQVdBLHlCQUFYO0FBQ04sRUFBQUEs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QUFJLE9BQU8sa0JBQWtCLE9BQUssS0FBSyxPQUFPLENBQUMsQ0FBQztBQUFBLElBQ2hFO0FBQ0EsUUFBSSxRQUFRLGVBQTJCO0FBQ3RDLFdBQUssVUFBVSxJQUFJLE9BQU8saUJBQWlCLE9BQUssS0FBSyxPQUFPLENBQUMsQ0FBQztBQUM5RCxXQUFLLFVBQVUsSUFBSSxPQUFPLHdCQUF3QixPQUFLLEtBQUssT0FBTyxDQUFDLENBQUM7QUFBQSxJQUN0RTtBQUFBLEVBQ0Q7QUFBQSxFQUVTLFVBQVU7QUFDbEIsU0FBSyxVQUFVLFFBQVE7QUFDdkIsVUFBTSxRQUFRO0FBQUEsRUFDZjtBQUNEO0FBS08sTUFBTSx5Q0FBeUMsd0JBQStDO0FBQUEsRUFJcEcsWUFBWSxPQUFtQixRQUE0QjtBQUMxRCxVQUFNLE1BQU07QUFDWixTQUFLLFlBQVksTUFBTSxtQkFBbUIsTUFBTSxLQUFLLE9BQU8sQ0FBQztBQUFBLEVBQzlEO0FBQUEsRUFFUyxVQUFVO0FBQ2xCLFNBQUssVUFBVSxRQUFRO0FBQ3ZCLFVBQU0sUUFBUTtBQUFBLEVBQ2Y7QUFDRDsiLAogICJuYW1lcyI6IFsiQ29kZUVkaXRvclN0YXRlRmxhZyJdCn0K
