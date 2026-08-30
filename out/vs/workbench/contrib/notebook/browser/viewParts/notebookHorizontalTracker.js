import { addDisposableListener, EventType, getWindow } from "../../../../../base/browser/dom.js";
import { Disposable } from "../../../../../base/common/lifecycle.js";
import { isChrome, isMacintosh } from "../../../../../base/common/platform.js";
class NotebookHorizontalTracker extends Disposable {
  constructor(_notebookEditor, _listViewScrollablement) {
    super();
    this._notebookEditor = _notebookEditor;
    this._listViewScrollablement = _listViewScrollablement;
    this._register(addDisposableListener(this._listViewScrollablement, EventType.MOUSE_WHEEL, (event) => {
      let deltaX = event.deltaX;
      let deltaY = event.deltaY;
      let wheelDeltaX = event.wheelDeltaX;
      let wheelDeltaY = event.wheelDeltaY;
      const wheelDelta = event.wheelDelta;
      const shiftConvert = !isMacintosh && event.shiftKey;
      if (shiftConvert && !deltaX) {
        deltaX = deltaY;
        deltaY = 0;
        wheelDeltaX = wheelDeltaY;
        wheelDeltaY = 0;
      }
      if (deltaX === 0) {
        return;
      }
      const hoveringOnEditor = this._notebookEditor.codeEditors.find((editor) => {
        const editorLayout = editor[1].getLayoutInfo();
        if (editorLayout.contentWidth === editorLayout.width) {
          return false;
        }
        const editorDOM = editor[1].getDomNode();
        if (editorDOM && editorDOM.contains(event.target)) {
          return true;
        }
        return false;
      });
      if (!hoveringOnEditor) {
        return;
      }
      const targetWindow = getWindow(event);
      const evt = {
        deltaMode: event.deltaMode,
        deltaX,
        deltaY: 0,
        deltaZ: 0,
        wheelDelta: wheelDelta && isChrome ? wheelDelta / targetWindow.devicePixelRatio : wheelDelta,
        wheelDeltaX: wheelDeltaX && isChrome ? wheelDeltaX / targetWindow.devicePixelRatio : wheelDeltaX,
        wheelDeltaY: 0,
        detail: event.detail,
        shiftKey: event.shiftKey,
        type: event.type,
        defaultPrevented: false,
        preventDefault: () => {
        },
        stopPropagation: () => {
        }
      };
      hoveringOnEditor[1].delegateScrollFromMouseWheelEvent(evt);
    }));
  }
}
export {
  NotebookHorizontalTracker
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG5vdGVib29rXFxicm93c2VyXFx2aWV3UGFydHNcXG5vdGVib29rSG9yaXpvbnRhbFRyYWNrZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBhZGREaXNwb3NhYmxlTGlzdGVuZXIsIEV2ZW50VHlwZSwgZ2V0V2luZG93IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBJTW91c2VXaGVlbEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL21vdXNlRXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBpc0Nocm9tZSwgaXNNYWNpbnRvc2ggfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBDb2RlRWRpdG9yV2lkZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvd2lkZ2V0L2NvZGVFZGl0b3IvY29kZUVkaXRvcldpZGdldC5qcyc7XG5pbXBvcnQgeyBJTm90ZWJvb2tFZGl0b3JEZWxlZ2F0ZSB9IGZyb20gJy4uL25vdGVib29rQnJvd3Nlci5qcyc7XG5cbmV4cG9ydCBjbGFzcyBOb3RlYm9va0hvcml6b250YWxUcmFja2VyIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX25vdGVib29rRWRpdG9yOiBJTm90ZWJvb2tFZGl0b3JEZWxlZ2F0ZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9saXN0Vmlld1Njcm9sbGFibGVtZW50OiBIVE1MRWxlbWVudCxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLl9saXN0Vmlld1Njcm9sbGFibGVtZW50LCBFdmVudFR5cGUuTU9VU0VfV0hFRUwsIChldmVudDogSU1vdXNlV2hlZWxFdmVudCkgPT4ge1xuXHRcdFx0bGV0IGRlbHRhWCA9IGV2ZW50LmRlbHRhWDtcblx0XHRcdGxldCBkZWx0YVkgPSBldmVudC5kZWx0YVk7XG5cdFx0XHRsZXQgd2hlZWxEZWx0YVggPSBldmVudC53aGVlbERlbHRhWDtcblx0XHRcdGxldCB3aGVlbERlbHRhWSA9IGV2ZW50LndoZWVsRGVsdGFZO1xuXHRcdFx0Y29uc3Qgd2hlZWxEZWx0YSA9IGV2ZW50LndoZWVsRGVsdGE7XG5cblx0XHRcdGNvbnN0IHNoaWZ0Q29udmVydCA9ICFpc01hY2ludG9zaCAmJiBldmVudC5zaGlmdEtleTtcblx0XHRcdGlmIChzaGlmdENvbnZlcnQgJiYgIWRlbHRhWCkge1xuXHRcdFx0XHRkZWx0YVggPSBkZWx0YVk7XG5cdFx0XHRcdGRlbHRhWSA9IDA7XG5cdFx0XHRcdHdoZWVsRGVsdGFYID0gd2hlZWxEZWx0YVk7XG5cdFx0XHRcdHdoZWVsRGVsdGFZID0gMDtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGRlbHRhWCA9PT0gMCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGhvdmVyaW5nT25FZGl0b3IgPSB0aGlzLl9ub3RlYm9va0VkaXRvci5jb2RlRWRpdG9ycy5maW5kKGVkaXRvciA9PiB7XG5cdFx0XHRcdGNvbnN0IGVkaXRvckxheW91dCA9IGVkaXRvclsxXS5nZXRMYXlvdXRJbmZvKCk7XG5cdFx0XHRcdGlmIChlZGl0b3JMYXlvdXQuY29udGVudFdpZHRoID09PSBlZGl0b3JMYXlvdXQud2lkdGgpIHtcblx0XHRcdFx0XHQvLyBubyBvdmVyZmxvd1xuXHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IGVkaXRvckRPTSA9IGVkaXRvclsxXS5nZXREb21Ob2RlKCk7XG5cdFx0XHRcdGlmIChlZGl0b3JET00gJiYgZWRpdG9yRE9NLmNvbnRhaW5zKGV2ZW50LnRhcmdldCBhcyBIVE1MRWxlbWVudCkpIHtcblx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH0pO1xuXG5cdFx0XHRpZiAoIWhvdmVyaW5nT25FZGl0b3IpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCB0YXJnZXRXaW5kb3cgPSBnZXRXaW5kb3coZXZlbnQpO1xuXHRcdFx0Y29uc3QgZXZ0ID0ge1xuXHRcdFx0XHRkZWx0YU1vZGU6IGV2ZW50LmRlbHRhTW9kZSxcblx0XHRcdFx0ZGVsdGFYOiBkZWx0YVgsXG5cdFx0XHRcdGRlbHRhWTogMCxcblx0XHRcdFx0ZGVsdGFaOiAwLFxuXHRcdFx0XHR3aGVlbERlbHRhOiB3aGVlbERlbHRhICYmIGlzQ2hyb21lID8gKHdoZWVsRGVsdGEgLyB0YXJnZXRXaW5kb3cuZGV2aWNlUGl4ZWxSYXRpbykgOiB3aGVlbERlbHRhLFxuXHRcdFx0XHR3aGVlbERlbHRhWDogd2hlZWxEZWx0YVggJiYgaXNDaHJvbWUgPyAod2hlZWxEZWx0YVggLyB0YXJnZXRXaW5kb3cuZGV2aWNlUGl4ZWxSYXRpbykgOiB3aGVlbERlbHRhWCxcblx0XHRcdFx0d2hlZWxEZWx0YVk6IDAsXG5cdFx0XHRcdGRldGFpbDogZXZlbnQuZGV0YWlsLFxuXHRcdFx0XHRzaGlmdEtleTogZXZlbnQuc2hpZnRLZXksXG5cdFx0XHRcdHR5cGU6IGV2ZW50LnR5cGUsXG5cdFx0XHRcdGRlZmF1bHRQcmV2ZW50ZWQ6IGZhbHNlLFxuXHRcdFx0XHRwcmV2ZW50RGVmYXVsdDogKCkgPT4geyB9LFxuXHRcdFx0XHRzdG9wUHJvcGFnYXRpb246ICgpID0+IHsgfVxuXHRcdFx0fTtcblxuXHRcdFx0KGhvdmVyaW5nT25FZGl0b3JbMV0gYXMgQ29kZUVkaXRvcldpZGdldCkuZGVsZWdhdGVTY3JvbGxGcm9tTW91c2VXaGVlbEV2ZW50KGV2dCBhcyB1bmtub3duIGFzIElNb3VzZVdoZWVsRXZlbnQpO1xuXHRcdH0pKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyx1QkFBdUIsV0FBVyxpQkFBaUI7QUFFNUQsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxVQUFVLG1CQUFtQjtBQUkvQixNQUFNLGtDQUFrQyxXQUFXO0FBQUEsRUFDekQsWUFDa0IsaUJBQ0EseUJBQ2hCO0FBQ0QsVUFBTTtBQUhXO0FBQ0E7QUFJakIsU0FBSyxVQUFVLHNCQUFzQixLQUFLLHlCQUF5QixVQUFVLGFBQWEsQ0FBQyxVQUE0QjtBQUN0SCxVQUFJLFNBQVMsTUFBTTtBQUNuQixVQUFJLFNBQVMsTUFBTTtBQUNuQixVQUFJLGNBQWMsTUFBTTtBQUN4QixVQUFJLGNBQWMsTUFBTTtBQUN4QixZQUFNLGFBQWEsTUFBTTtBQUV6QixZQUFNLGVBQWUsQ0FBQyxlQUFlLE1BQU07QUFDM0MsVUFBSSxnQkFBZ0IsQ0FBQyxRQUFRO0FBQzVCLGlCQUFTO0FBQ1QsaUJBQVM7QUFDVCxzQkFBYztBQUNkLHNCQUFjO0FBQUEsTUFDZjtBQUVBLFVBQUksV0FBVyxHQUFHO0FBQ2pCO0FBQUEsTUFDRDtBQUVBLFlBQU0sbUJBQW1CLEtBQUssZ0JBQWdCLFlBQVksS0FBSyxZQUFVO0FBQ3hFLGNBQU0sZUFBZSxPQUFPLENBQUMsRUFBRSxjQUFjO0FBQzdDLFlBQUksYUFBYSxpQkFBaUIsYUFBYSxPQUFPO0FBRXJELGlCQUFPO0FBQUEsUUFDUjtBQUVBLGNBQU0sWUFBWSxPQUFPLENBQUMsRUFBRSxXQUFXO0FBQ3ZDLFlBQUksYUFBYSxVQUFVLFNBQVMsTUFBTSxNQUFxQixHQUFHO0FBQ2pFLGlCQUFPO0FBQUEsUUFDUjtBQUVBLGVBQU87QUFBQSxNQUNSLENBQUM7QUFFRCxVQUFJLENBQUMsa0JBQWtCO0FBQ3RCO0FBQUEsTUFDRDtBQUVBLFlBQU0sZUFBZSxVQUFVLEtBQUs7QUFDcEMsWUFBTSxNQUFNO0FBQUEsUUFDWCxXQUFXLE1BQU07QUFBQSxRQUNqQjtBQUFBLFFBQ0EsUUFBUTtBQUFBLFFBQ1IsUUFBUTtBQUFBLFFBQ1IsWUFBWSxjQUFjLFdBQVksYUFBYSxhQUFhLG1CQUFvQjtBQUFBLFFBQ3BGLGFBQWEsZUFBZSxXQUFZLGNBQWMsYUFBYSxtQkFBb0I7QUFBQSxRQUN2RixhQUFhO0FBQUEsUUFDYixRQUFRLE1BQU07QUFBQSxRQUNkLFVBQVUsTUFBTTtBQUFBLFFBQ2hCLE1BQU0sTUFBTTtBQUFBLFFBQ1osa0JBQWtCO0FBQUEsUUFDbEIsZ0JBQWdCLE1BQU07QUFBQSxRQUFFO0FBQUEsUUFDeEIsaUJBQWlCLE1BQU07QUFBQSxRQUFFO0FBQUEsTUFDMUI7QUFFQSxNQUFDLGlCQUFpQixDQUFDLEVBQXVCLGtDQUFrQyxHQUFrQztBQUFBLElBQy9HLENBQUMsQ0FBQztBQUFBLEVBQ0g7QUFDRDsiLAogICJuYW1lcyI6IFtdCn0K
