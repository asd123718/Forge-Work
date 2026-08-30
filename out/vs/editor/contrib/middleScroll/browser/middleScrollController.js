import { getWindow, addDisposableListener, n } from "../../../../base/browser/dom.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { EditorOption } from "../../../common/config/editorOptions.js";
import { autorun, derived, disposableObservableValue, observableValue } from "../../../../base/common/observable.js";
import { observableCodeEditor } from "../../../browser/observableCodeEditor.js";
import { Point } from "../../../common/core/2d/point.js";
import { AnimationFrameScheduler } from "../../../../base/browser/animatedValue.js";
import { appendRemoveOnDispose } from "../../../browser/widget/diffEditor/utils.js";
import "./middleScroll.css";
const _MiddleScrollController = class _MiddleScrollController extends Disposable {
  constructor(_editor) {
    super();
    this._editor = _editor;
    const obsEditor = observableCodeEditor(this._editor);
    const scrollOnMiddleClick = obsEditor.getOption(EditorOption.scrollOnMiddleClick);
    this._register(autorun((reader) => {
      if (!scrollOnMiddleClick.read(reader)) {
        return;
      }
      const editorDomNode = obsEditor.domNode.read(reader);
      if (!editorDomNode) {
        return;
      }
      const scrollingSession = reader.store.add(
        disposableObservableValue(
          "scrollingSession",
          void 0
        )
      );
      reader.store.add(this._editor.onMouseDown((e) => {
        const session = scrollingSession.read(void 0);
        if (session) {
          scrollingSession.set(void 0, void 0);
          return;
        }
        if (!e.event.middleButton) {
          return;
        }
        e.event.stopPropagation();
        e.event.preventDefault();
        const store = new DisposableStore();
        const initialPos = new Point(e.event.posx, e.event.posy);
        const mousePos = observeWindowMousePos(getWindow(editorDomNode), initialPos, store);
        const mouseDeltaAfterThreshold = mousePos.map((v) => v.subtract(initialPos).withThreshold(5));
        const editorDomNodeRect = editorDomNode.getBoundingClientRect();
        const initialMousePosInEditor = new Point(initialPos.x - editorDomNodeRect.left, initialPos.y - editorDomNodeRect.top);
        scrollingSession.set({
          mouseDeltaAfterThreshold,
          initialMousePosInEditor,
          didScroll: false,
          dispose: () => store.dispose()
        }, void 0);
        store.add(this._editor.onMouseUp((e2) => {
          const session2 = scrollingSession.read(void 0);
          if (session2 && session2.didScroll) {
            scrollingSession.set(void 0, void 0);
          }
        }));
        store.add(this._editor.onKeyDown((e2) => {
          scrollingSession.set(void 0, void 0);
        }));
      }));
      reader.store.add(autorun((reader2) => {
        const session = scrollingSession.read(reader2);
        if (!session) {
          return;
        }
        let lastTime = Date.now();
        reader2.store.add(autorun((reader3) => {
          AnimationFrameScheduler.instance.invalidateOnNextAnimationFrame(reader3);
          const curTime = Date.now();
          const frameDurationMs = curTime - lastTime;
          lastTime = curTime;
          const mouseDelta = session.mouseDeltaAfterThreshold.read(void 0);
          const factor = frameDurationMs / 32;
          const scrollDelta = mouseDelta.scale(factor);
          const scrollPos = new Point(this._editor.getScrollLeft(), this._editor.getScrollTop());
          this._editor.setScrollPosition(toScrollPosition(scrollPos.add(scrollDelta)));
          if (!scrollDelta.isZero()) {
            session.didScroll = true;
          }
        }));
        const directionAttr = derived((reader3) => {
          const delta = session.mouseDeltaAfterThreshold.read(reader3);
          let direction = "";
          direction += delta.y < 0 ? "n" : delta.y > 0 ? "s" : "";
          direction += delta.x < 0 ? "w" : delta.x > 0 ? "e" : "";
          return direction;
        });
        reader2.store.add(autorun((reader3) => {
          editorDomNode.setAttribute("data-scroll-direction", directionAttr.read(reader3));
        }));
      }));
      const dotDomElem = reader.store.add(n.div({
        class: ["scroll-editor-on-middle-click-dot", scrollingSession.map((session) => session ? "" : "hidden")],
        style: {
          left: scrollingSession.map((session) => session ? session.initialMousePosInEditor.x : 0),
          top: scrollingSession.map((session) => session ? session.initialMousePosInEditor.y : 0)
        }
      }).toDisposableLiveElement());
      reader.store.add(appendRemoveOnDispose(editorDomNode, dotDomElem.element));
      reader.store.add(autorun((reader2) => {
        const session = scrollingSession.read(reader2);
        editorDomNode.classList.toggle("scroll-editor-on-middle-click-editor", !!session);
      }));
    }));
  }
  static get(editor) {
    return editor.getContribution(_MiddleScrollController.ID);
  }
};
_MiddleScrollController.ID = "editor.contrib.middleScroll";
let MiddleScrollController = _MiddleScrollController;
function observeWindowMousePos(window, initialPos, store) {
  const val = observableValue("pos", initialPos);
  store.add(addDisposableListener(window, "mousemove", (e) => {
    val.set(new Point(e.pageX, e.pageY), void 0);
  }));
  return val;
}
function toScrollPosition(p) {
  return {
    scrollLeft: p.x,
    scrollTop: p.y
  };
}
export {
  MiddleScrollController
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXG1pZGRsZVNjcm9sbFxcYnJvd3NlclxcbWlkZGxlU2Nyb2xsQ29udHJvbGxlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGdldFdpbmRvdywgYWRkRGlzcG9zYWJsZUxpc3RlbmVyLCBuIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IElFZGl0b3JDb250cmlidXRpb24sIElOZXdTY3JvbGxQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3JDb21tb24uanMnO1xuaW1wb3J0IHsgRWRpdG9yT3B0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbmZpZy9lZGl0b3JPcHRpb25zLmpzJztcbmltcG9ydCB7IGF1dG9ydW4sIGRlcml2ZWQsIGRpc3Bvc2FibGVPYnNlcnZhYmxlVmFsdWUsIElPYnNlcnZhYmxlLCBvYnNlcnZhYmxlVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IG9ic2VydmFibGVDb2RlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9vYnNlcnZhYmxlQ29kZUVkaXRvci5qcyc7XG5pbXBvcnQgeyBQb2ludCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlLzJkL3BvaW50LmpzJztcbmltcG9ydCB7IEFuaW1hdGlvbkZyYW1lU2NoZWR1bGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2FuaW1hdGVkVmFsdWUuanMnO1xuaW1wb3J0IHsgYXBwZW5kUmVtb3ZlT25EaXNwb3NlIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci93aWRnZXQvZGlmZkVkaXRvci91dGlscy5qcyc7XG5pbXBvcnQgJy4vbWlkZGxlU2Nyb2xsLmNzcyc7XG5cbmV4cG9ydCBjbGFzcyBNaWRkbGVTY3JvbGxDb250cm9sbGVyIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElFZGl0b3JDb250cmlidXRpb24ge1xuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IElEID0gJ2VkaXRvci5jb250cmliLm1pZGRsZVNjcm9sbCc7XG5cblx0c3RhdGljIGdldChlZGl0b3I6IElDb2RlRWRpdG9yKTogTWlkZGxlU2Nyb2xsQ29udHJvbGxlciB8IG51bGwge1xuXHRcdHJldHVybiBlZGl0b3IuZ2V0Q29udHJpYnV0aW9uPE1pZGRsZVNjcm9sbENvbnRyb2xsZXI+KE1pZGRsZVNjcm9sbENvbnRyb2xsZXIuSUQpO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZWRpdG9yOiBJQ29kZUVkaXRvclxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0Y29uc3Qgb2JzRWRpdG9yID0gb2JzZXJ2YWJsZUNvZGVFZGl0b3IodGhpcy5fZWRpdG9yKTtcblx0XHRjb25zdCBzY3JvbGxPbk1pZGRsZUNsaWNrID0gb2JzRWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24uc2Nyb2xsT25NaWRkbGVDbGljayk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRpZiAoIXNjcm9sbE9uTWlkZGxlQ2xpY2sucmVhZChyZWFkZXIpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGVkaXRvckRvbU5vZGUgPSBvYnNFZGl0b3IuZG9tTm9kZS5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAoIWVkaXRvckRvbU5vZGUpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBzY3JvbGxpbmdTZXNzaW9uID0gcmVhZGVyLnN0b3JlLmFkZChcblx0XHRcdFx0ZGlzcG9zYWJsZU9ic2VydmFibGVWYWx1ZShcblx0XHRcdFx0XHQnc2Nyb2xsaW5nU2Vzc2lvbicsXG5cdFx0XHRcdFx0dW5kZWZpbmVkIGFzIHVuZGVmaW5lZCB8IHsgbW91c2VEZWx0YUFmdGVyVGhyZXNob2xkOiBJT2JzZXJ2YWJsZTxQb2ludD47IGluaXRpYWxNb3VzZVBvc0luRWRpdG9yOiBQb2ludDsgZGlkU2Nyb2xsOiBib29sZWFuIH0gJiBJRGlzcG9zYWJsZVxuXHRcdFx0XHQpXG5cdFx0XHQpO1xuXG5cdFx0XHRyZWFkZXIuc3RvcmUuYWRkKHRoaXMuX2VkaXRvci5vbk1vdXNlRG93bihlID0+IHtcblx0XHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IHNjcm9sbGluZ1Nlc3Npb24ucmVhZCh1bmRlZmluZWQpO1xuXHRcdFx0XHRpZiAoc2Vzc2lvbikge1xuXHRcdFx0XHRcdHNjcm9sbGluZ1Nlc3Npb24uc2V0KHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoIWUuZXZlbnQubWlkZGxlQnV0dG9uKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGUuZXZlbnQuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHRcdGUuZXZlbnQucHJldmVudERlZmF1bHQoKTtcblxuXHRcdFx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRcdFx0Y29uc3QgaW5pdGlhbFBvcyA9IG5ldyBQb2ludChlLmV2ZW50LnBvc3gsIGUuZXZlbnQucG9zeSk7XG5cdFx0XHRcdGNvbnN0IG1vdXNlUG9zID0gb2JzZXJ2ZVdpbmRvd01vdXNlUG9zKGdldFdpbmRvdyhlZGl0b3JEb21Ob2RlKSwgaW5pdGlhbFBvcywgc3RvcmUpO1xuXHRcdFx0XHRjb25zdCBtb3VzZURlbHRhQWZ0ZXJUaHJlc2hvbGQgPSBtb3VzZVBvcy5tYXAodiA9PiB2LnN1YnRyYWN0KGluaXRpYWxQb3MpLndpdGhUaHJlc2hvbGQoNSkpO1xuXG5cdFx0XHRcdGNvbnN0IGVkaXRvckRvbU5vZGVSZWN0ID0gZWRpdG9yRG9tTm9kZS5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcblx0XHRcdFx0Y29uc3QgaW5pdGlhbE1vdXNlUG9zSW5FZGl0b3IgPSBuZXcgUG9pbnQoaW5pdGlhbFBvcy54IC0gZWRpdG9yRG9tTm9kZVJlY3QubGVmdCwgaW5pdGlhbFBvcy55IC0gZWRpdG9yRG9tTm9kZVJlY3QudG9wKTtcblxuXHRcdFx0XHRzY3JvbGxpbmdTZXNzaW9uLnNldCh7XG5cdFx0XHRcdFx0bW91c2VEZWx0YUFmdGVyVGhyZXNob2xkLFxuXHRcdFx0XHRcdGluaXRpYWxNb3VzZVBvc0luRWRpdG9yLFxuXHRcdFx0XHRcdGRpZFNjcm9sbDogZmFsc2UsXG5cdFx0XHRcdFx0ZGlzcG9zZTogKCkgPT4gc3RvcmUuZGlzcG9zZSgpLFxuXHRcdFx0XHR9LCB1bmRlZmluZWQpO1xuXG5cdFx0XHRcdHN0b3JlLmFkZCh0aGlzLl9lZGl0b3Iub25Nb3VzZVVwKGUgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IHNlc3Npb24gPSBzY3JvbGxpbmdTZXNzaW9uLnJlYWQodW5kZWZpbmVkKTtcblx0XHRcdFx0XHRpZiAoc2Vzc2lvbiAmJiBzZXNzaW9uLmRpZFNjcm9sbCkge1xuXHRcdFx0XHRcdFx0Ly8gT25seSBjYW5jZWwgc2Vzc2lvbiBvbiByZWxlYXNlIGlmIHRoZSB1c2VyIHNjcm9sbGVkIGR1cmluZyBpdFxuXHRcdFx0XHRcdFx0c2Nyb2xsaW5nU2Vzc2lvbi5zZXQodW5kZWZpbmVkLCB1bmRlZmluZWQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSkpO1xuXG5cdFx0XHRcdHN0b3JlLmFkZCh0aGlzLl9lZGl0b3Iub25LZXlEb3duKGUgPT4ge1xuXHRcdFx0XHRcdHNjcm9sbGluZ1Nlc3Npb24uc2V0KHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcblx0XHRcdFx0fSkpO1xuXHRcdFx0fSkpO1xuXG5cdFx0XHRyZWFkZXIuc3RvcmUuYWRkKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IHNjcm9sbGluZ1Nlc3Npb24ucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRpZiAoIXNlc3Npb24pIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRsZXQgbGFzdFRpbWUgPSBEYXRlLm5vdygpO1xuXHRcdFx0XHRyZWFkZXIuc3RvcmUuYWRkKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdFx0XHRBbmltYXRpb25GcmFtZVNjaGVkdWxlci5pbnN0YW5jZS5pbnZhbGlkYXRlT25OZXh0QW5pbWF0aW9uRnJhbWUocmVhZGVyKTtcblxuXHRcdFx0XHRcdGNvbnN0IGN1clRpbWUgPSBEYXRlLm5vdygpO1xuXHRcdFx0XHRcdGNvbnN0IGZyYW1lRHVyYXRpb25NcyA9IGN1clRpbWUgLSBsYXN0VGltZTtcblx0XHRcdFx0XHRsYXN0VGltZSA9IGN1clRpbWU7XG5cblx0XHRcdFx0XHRjb25zdCBtb3VzZURlbHRhID0gc2Vzc2lvbi5tb3VzZURlbHRhQWZ0ZXJUaHJlc2hvbGQucmVhZCh1bmRlZmluZWQpO1xuXG5cdFx0XHRcdFx0Ly8gc2Nyb2xsIGJ5IG1vdXNlIGRlbHRhIGV2ZXJ5IDMybXNcblx0XHRcdFx0XHRjb25zdCBmYWN0b3IgPSBmcmFtZUR1cmF0aW9uTXMgLyAzMjtcblx0XHRcdFx0XHRjb25zdCBzY3JvbGxEZWx0YSA9IG1vdXNlRGVsdGEuc2NhbGUoZmFjdG9yKTtcblxuXHRcdFx0XHRcdGNvbnN0IHNjcm9sbFBvcyA9IG5ldyBQb2ludCh0aGlzLl9lZGl0b3IuZ2V0U2Nyb2xsTGVmdCgpLCB0aGlzLl9lZGl0b3IuZ2V0U2Nyb2xsVG9wKCkpO1xuXHRcdFx0XHRcdHRoaXMuX2VkaXRvci5zZXRTY3JvbGxQb3NpdGlvbih0b1Njcm9sbFBvc2l0aW9uKHNjcm9sbFBvcy5hZGQoc2Nyb2xsRGVsdGEpKSk7XG5cdFx0XHRcdFx0aWYgKCFzY3JvbGxEZWx0YS5pc1plcm8oKSkge1xuXHRcdFx0XHRcdFx0c2Vzc2lvbi5kaWRTY3JvbGwgPSB0cnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSkpO1xuXG5cdFx0XHRcdGNvbnN0IGRpcmVjdGlvbkF0dHIgPSBkZXJpdmVkKHJlYWRlciA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgZGVsdGEgPSBzZXNzaW9uLm1vdXNlRGVsdGFBZnRlclRocmVzaG9sZC5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdFx0bGV0IGRpcmVjdGlvbjogc3RyaW5nID0gJyc7XG5cdFx0XHRcdFx0ZGlyZWN0aW9uICs9IChkZWx0YS55IDwgMCA/ICduJyA6IChkZWx0YS55ID4gMCA/ICdzJyA6ICcnKSk7XG5cdFx0XHRcdFx0ZGlyZWN0aW9uICs9IChkZWx0YS54IDwgMCA/ICd3JyA6IChkZWx0YS54ID4gMCA/ICdlJyA6ICcnKSk7XG5cdFx0XHRcdFx0cmV0dXJuIGRpcmVjdGlvbjtcblx0XHRcdFx0fSk7XG5cdFx0XHRcdHJlYWRlci5zdG9yZS5hZGQoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0XHRcdGVkaXRvckRvbU5vZGUuc2V0QXR0cmlidXRlKCdkYXRhLXNjcm9sbC1kaXJlY3Rpb24nLCBkaXJlY3Rpb25BdHRyLnJlYWQocmVhZGVyKSk7XG5cdFx0XHRcdH0pKTtcblx0XHRcdH0pKTtcblxuXHRcdFx0Y29uc3QgZG90RG9tRWxlbSA9IHJlYWRlci5zdG9yZS5hZGQobi5kaXYoe1xuXHRcdFx0XHRjbGFzczogWydzY3JvbGwtZWRpdG9yLW9uLW1pZGRsZS1jbGljay1kb3QnLCBzY3JvbGxpbmdTZXNzaW9uLm1hcChzZXNzaW9uID0+IHNlc3Npb24gPyAnJyA6ICdoaWRkZW4nKV0sXG5cdFx0XHRcdHN0eWxlOiB7XG5cdFx0XHRcdFx0bGVmdDogc2Nyb2xsaW5nU2Vzc2lvbi5tYXAoKHNlc3Npb24pID0+IHNlc3Npb24gPyBzZXNzaW9uLmluaXRpYWxNb3VzZVBvc0luRWRpdG9yLnggOiAwKSxcblx0XHRcdFx0XHR0b3A6IHNjcm9sbGluZ1Nlc3Npb24ubWFwKChzZXNzaW9uKSA9PiBzZXNzaW9uID8gc2Vzc2lvbi5pbml0aWFsTW91c2VQb3NJbkVkaXRvci55IDogMCksXG5cdFx0XHRcdH1cblx0XHRcdH0pLnRvRGlzcG9zYWJsZUxpdmVFbGVtZW50KCkpO1xuXHRcdFx0cmVhZGVyLnN0b3JlLmFkZChhcHBlbmRSZW1vdmVPbkRpc3Bvc2UoZWRpdG9yRG9tTm9kZSwgZG90RG9tRWxlbS5lbGVtZW50KSk7XG5cblx0XHRcdHJlYWRlci5zdG9yZS5hZGQoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0XHRjb25zdCBzZXNzaW9uID0gc2Nyb2xsaW5nU2Vzc2lvbi5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdGVkaXRvckRvbU5vZGUuY2xhc3NMaXN0LnRvZ2dsZSgnc2Nyb2xsLWVkaXRvci1vbi1taWRkbGUtY2xpY2stZWRpdG9yJywgISFzZXNzaW9uKTtcblx0XHRcdH0pKTtcblx0XHR9KSk7XG5cdH1cbn1cblxuZnVuY3Rpb24gb2JzZXJ2ZVdpbmRvd01vdXNlUG9zKHdpbmRvdzogV2luZG93LCBpbml0aWFsUG9zOiBQb2ludCwgc3RvcmU6IERpc3Bvc2FibGVTdG9yZSk6IElPYnNlcnZhYmxlPFBvaW50PiB7XG5cdGNvbnN0IHZhbCA9IG9ic2VydmFibGVWYWx1ZSgncG9zJywgaW5pdGlhbFBvcyk7XG5cdHN0b3JlLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIod2luZG93LCAnbW91c2Vtb3ZlJywgKGU6IE1vdXNlRXZlbnQpID0+IHtcblx0XHR2YWwuc2V0KG5ldyBQb2ludChlLnBhZ2VYLCBlLnBhZ2VZKSwgdW5kZWZpbmVkKTtcblx0fSkpO1xuXHRyZXR1cm4gdmFsO1xufVxuXG5mdW5jdGlvbiB0b1Njcm9sbFBvc2l0aW9uKHA6IFBvaW50KTogSU5ld1Njcm9sbFBvc2l0aW9uIHtcblx0cmV0dXJuIHtcblx0XHRzY3JvbGxMZWZ0OiBwLngsXG5cdFx0c2Nyb2xsVG9wOiBwLnksXG5cdH07XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLFdBQVcsdUJBQXVCLFNBQVM7QUFDcEQsU0FBUyxZQUFZLHVCQUFvQztBQUd6RCxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLFNBQVMsU0FBUywyQkFBd0MsdUJBQXVCO0FBQzFGLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsYUFBYTtBQUN0QixTQUFTLCtCQUErQjtBQUN4QyxTQUFTLDZCQUE2QjtBQUN0QyxPQUFPO0FBRUEsTUFBTSwwQkFBTixNQUFNLGdDQUErQixXQUEwQztBQUFBLEVBT3JGLFlBQ2tCLFNBQ2hCO0FBQ0QsVUFBTTtBQUZXO0FBSWpCLFVBQU0sWUFBWSxxQkFBcUIsS0FBSyxPQUFPO0FBQ25ELFVBQU0sc0JBQXNCLFVBQVUsVUFBVSxhQUFhLG1CQUFtQjtBQUVoRixTQUFLLFVBQVUsUUFBUSxZQUFVO0FBQ2hDLFVBQUksQ0FBQyxvQkFBb0IsS0FBSyxNQUFNLEdBQUc7QUFDdEM7QUFBQSxNQUNEO0FBQ0EsWUFBTSxnQkFBZ0IsVUFBVSxRQUFRLEtBQUssTUFBTTtBQUNuRCxVQUFJLENBQUMsZUFB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TSxJQUFJLFFBQVEsQ0FBQUEsWUFBVTtBQUNsQyx3QkFBYyxhQUFhLHlCQUF5QixjQUFjLEtBQUtBLE9BQU0sQ0FBQztBQUFBLFFBQy9FLENBQUMsQ0FBQztBQUFBLE1BQ0gsQ0FBQyxDQUFDO0FBRUYsWUFBTSxhQUFhLE9BQU8sTUFBTSxJQUFJLEVBQUUsSUFBSTtBQUFBLFFBQ3pDLE9BQU8sQ0FBQyxxQ0FBcUMsaUJBQWlCLElBQUksYUFBVyxVQUFVLEtBQUssUUFBUSxDQUFDO0FBQUEsUUFDckcsT0FBTztBQUFBLFVBQ04sTUFBTSxpQkFBaUIsSUFBSSxDQUFDLFlBQVksVUFBVSxRQUFRLHdCQUF3QixJQUFJLENBQUM7QUFBQSxVQUN2RixLQUFLLGlCQUFpQixJQUFJLENBQUMsWUFBWSxVQUFVLFFBQVEsd0JBQXdCLElBQUksQ0FBQztBQUFBLFFBQ3ZGO0FBQUEsTUFDRCxDQUFDLEVBQUUsd0JBQXdCLENBQUM7QUFDNUIsYUFBTyxNQUFNLElBQUksc0JBQXNCLGVBQWUsV0FBVyxPQUFPLENBQUM7QUFFekUsYUFBTyxNQUFNLElBQUksUUFBUSxDQUFBQSxZQUFVO0FBQ2xDLGNBQU0sVUFBVSxpQkFBaUIsS0FBS0EsT0FBTTtBQUM1QyxzQkFBYyxVQUFVLE9BQU8sd0NBQXdDLENBQUMsQ0FBQyxPQUFPO0FBQUEsTUFDakYsQ0FBQyxDQUFDO0FBQUEsSUFDSCxDQUFDLENBQUM7QUFBQSxFQUNIO0FBQUEsRUExSEEsT0FBTyxJQUFJLFFBQW9EO0FBQzlELFdBQU8sT0FBTyxnQkFBd0Msd0JBQXVCLEVBQUU7QUFBQSxFQUNoRjtBQXlIRDtBQTlIYSx3QkFDVyxLQUFLO0FBRHRCLElBQU0seUJBQU47QUFnSVAsU0FBUyxzQkFBc0IsUUFBZ0IsWUFBbUIsT0FBNEM7QUFDN0csUUFBTSxNQUFNLGdCQUFnQixPQUFPLFVBQVU7QUFDN0MsUUFBTSxJQUFJLHNCQUFzQixRQUFRLGFBQWEsQ0FBQyxNQUFrQjtBQUN2RSxRQUFJLElBQUksSUFBSSxNQUFNLEVBQUUsT0FBTyxFQUFFLEtBQUssR0FBRyxNQUFTO0FBQUEsRUFDL0MsQ0FBQyxDQUFDO0FBQ0YsU0FBTztBQUNSO0FBRUEsU0FBUyxpQkFBaUIsR0FBOEI7QUFDdkQsU0FBTztBQUFBLElBQ04sWUFBWSxFQUFFO0FBQUEsSUFDZCxXQUFXLEVBQUU7QUFBQSxFQUNkO0FBQ0Q7IiwKICAibmFtZXMiOiBbImUiLCAic2Vzc2lvbiIsICJyZWFkZXIiXQp9Cg==
