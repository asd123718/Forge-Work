import assert from "assert";
import { $ } from "../../../../../base/browser/dom.js";
import { mainWindow } from "../../../../../base/browser/window.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { BrowserOverlayManager, BrowserOverlayType } from "../../electron-browser/overlayManager.js";
suite("BrowserOverlayManager", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  let manager;
  let elements;
  function addElement(className, styles, parent = mainWindow.document.body) {
    const el = $(`.${className}`);
    Object.assign(el.style, styles);
    parent.appendChild(el);
    elements.push(el);
    return el;
  }
  setup(() => {
    elements = [];
    manager = store.add(new BrowserOverlayManager(mainWindow));
  });
  teardown(() => {
    for (const el of elements) {
      el.remove();
    }
    elements = [];
  });
  test("detects a modal overlay covering the browser container", () => {
    const browserContainer = addElement("browser-container", {
      position: "absolute",
      left: "0px",
      top: "0px",
      width: "300px",
      height: "300px"
    });
    addElement("monaco-modal-editor-block", {
      position: "fixed",
      left: "0px",
      top: "0px",
      width: "400px",
      height: "400px",
      zIndex: "2540"
    });
    const overlays = manager.getOverlappingOverlays(browserContainer);
    assert.deepStrictEqual(overlays.map((o) => o.type), [BrowserOverlayType.Dialog]);
  });
  test("does not detect an overlay that does not overlap the browser container", () => {
    const browserContainer = addElement("browser-container", {
      position: "absolute",
      left: "0px",
      top: "0px",
      width: "100px",
      height: "100px"
    });
    addElement("monaco-menu-container", {
      position: "fixed",
      left: "500px",
      top: "500px",
      width: "100px",
      height: "100px",
      zIndex: "2575"
    });
    const overlays = manager.getOverlappingOverlays(browserContainer);
    assert.deepStrictEqual(overlays, []);
  });
  test("detects an overlay beneath detached webview content", () => {
    const browserContainer = addElement("browser-container", {
      position: "absolute",
      left: "0px",
      top: "0px",
      width: "300px",
      height: "300px"
    });
    const contextView = addElement("context-view", {
      position: "fixed",
      left: "0px",
      top: "0px",
      width: "200px",
      height: "200px"
    });
    addElement("overlay-anchor", {
      position: "absolute",
      left: "0px",
      top: "0px",
      width: "200px",
      height: "200px"
    }, contextView);
    const overlayContent = addElement("webview-overlay-content", {
      position: "fixed",
      left: "0px",
      top: "0px",
      width: "200px",
      height: "200px",
      zIndex: "1"
    });
    addElement("webview", {
      width: "100%",
      height: "100%"
    }, overlayContent);
    const overlays = manager.getOverlappingOverlays(browserContainer);
    assert.deepStrictEqual(overlays.map((o) => o.type), [BrowserOverlayType.Unknown]);
  });
  test("detects obscuring when a context-view block covers the browser on top of a modal", () => {
    const browserContainer = addElement("browser-container", {
      position: "absolute",
      left: "0px",
      top: "0px",
      width: "300px",
      height: "300px"
    });
    addElement("monaco-modal-editor-block", {
      position: "fixed",
      left: "0px",
      top: "0px",
      width: "400px",
      height: "400px",
      zIndex: "2540"
    });
    const contextView = addElement("context-view", {
      position: "fixed",
      left: "320px",
      top: "320px",
      width: "60px",
      height: "60px",
      zIndex: "2575"
    });
    addElement("context-view-block", {
      position: "fixed",
      left: "0px",
      top: "0px",
      width: "400px",
      height: "400px",
      zIndex: "-1"
    }, contextView);
    const overlays = manager.getOverlappingOverlays(browserContainer);
    assert.deepStrictEqual(overlays.map((o) => o.type), [BrowserOverlayType.Dialog]);
  });
  test("detects obscuring when a context-view pointer block covers the browser on top of a modal", () => {
    const browserContainer = addElement("browser-container", {
      position: "absolute",
      left: "0px",
      top: "0px",
      width: "300px",
      height: "300px"
    });
    addElement("monaco-modal-editor-block", {
      position: "fixed",
      left: "0px",
      top: "0px",
      width: "400px",
      height: "400px",
      zIndex: "2540"
    });
    const contextView = addElement("context-view", {
      position: "fixed",
      left: "320px",
      top: "320px",
      width: "60px",
      height: "60px",
      zIndex: "2575"
    });
    addElement("context-view-pointerBlock", {
      position: "fixed",
      left: "0px",
      top: "0px",
      width: "400px",
      height: "400px",
      zIndex: "2"
    }, contextView);
    const overlays = manager.getOverlappingOverlays(browserContainer);
    assert.deepStrictEqual(overlays.map((o) => o.type), [BrowserOverlayType.Dialog]);
  });
  test("reports the dialog, not a notification covered by it", () => {
    const browserContainer = addElement("browser-container", {
      position: "absolute",
      left: "0px",
      top: "0px",
      width: "300px",
      height: "300px"
    });
    addElement("notification-toast-container", {
      position: "fixed",
      left: "0px",
      top: "0px",
      width: "200px",
      height: "200px",
      zIndex: "2000"
    });
    addElement("monaco-modal-editor-block", {
      position: "fixed",
      left: "0px",
      top: "0px",
      width: "400px",
      height: "400px",
      zIndex: "2540"
    });
    const overlays = manager.getOverlappingOverlays(browserContainer);
    assert.deepStrictEqual(overlays.map((o) => o.type), [BrowserOverlayType.Dialog]);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGJyb3dzZXJWaWV3XFx0ZXN0XFxlbGVjdHJvbi1icm93c2VyXFxvdmVybGF5TWFuYWdlci50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgJCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgbWFpbldpbmRvdyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci93aW5kb3cuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBCcm93c2VyT3ZlcmxheU1hbmFnZXIsIEJyb3dzZXJPdmVybGF5VHlwZSB9IGZyb20gJy4uLy4uL2VsZWN0cm9uLWJyb3dzZXIvb3ZlcmxheU1hbmFnZXIuanMnO1xuXG5zdWl0ZSgnQnJvd3Nlck92ZXJsYXlNYW5hZ2VyJywgKCkgPT4ge1xuXG5cdGNvbnN0IHN0b3JlID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0bGV0IG1hbmFnZXI6IEJyb3dzZXJPdmVybGF5TWFuYWdlcjtcblx0bGV0IGVsZW1lbnRzOiBIVE1MRWxlbWVudFtdO1xuXG5cdGZ1bmN0aW9uIGFkZEVsZW1lbnQoY2xhc3NOYW1lOiBzdHJpbmcsIHN0eWxlczogUGFydGlhbDxDU1NTdHlsZURlY2xhcmF0aW9uPiwgcGFyZW50OiBIVE1MRWxlbWVudCA9IG1haW5XaW5kb3cuZG9jdW1lbnQuYm9keSk6IEhUTUxFbGVtZW50IHtcblx0XHRjb25zdCBlbCA9ICQoYC4ke2NsYXNzTmFtZX1gKTtcblx0XHRPYmplY3QuYXNzaWduKGVsLnN0eWxlLCBzdHlsZXMpO1xuXHRcdHBhcmVudC5hcHBlbmRDaGlsZChlbCk7XG5cdFx0ZWxlbWVudHMucHVzaChlbCk7XG5cdFx0cmV0dXJuIGVsO1xuXHR9XG5cblx0c2V0dXAoKCkgPT4ge1xuXHRcdGVsZW1lbnRzID0gW107XG5cdFx0bWFuYWdlciA9IHN0b3JlLmFkZChuZXcgQnJvd3Nlck92ZXJsYXlNYW5hZ2VyKG1haW5XaW5kb3cpKTtcblx0fSk7XG5cblx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdGZvciAoY29uc3QgZWwgb2YgZWxlbWVudHMpIHtcblx0XHRcdGVsLnJlbW92ZSgpO1xuXHRcdH1cblx0XHRlbGVtZW50cyA9IFtdO1xuXHR9KTtcblxuXHR0ZXN0KCdkZXRlY3RzIGEgbW9kYWwgb3ZlcmxheSBjb3ZlcmluZyB0aGUgYnJvd3NlciBjb250YWluZXInLCAoKSA9PiB7XG5cdFx0Y29uc3QgYnJvd3NlckNvbnRhaW5lciA9IGFkZEVsZW1lbnQoJ2Jyb3dzZXItY29udGFpbmVyJywge1xuXHRcdFx0cG9zaXRpb246ICdhYnNvbHV0ZScsIGxlZnQ6ICcwcHgnLCB0b3A6ICcwcHgnLCB3aWR0aDogJzMwMHB4JywgaGVpZ2h0OiAnMzAwcHgnXG5cdFx0fSk7XG5cdFx0YWRkRWxlbWVudCgnbW9uYWNvLW1vZGFsLWVkaXRvci1ibG9jaycsIHtcblx0XHRcdHBvc2l0aW9uOiAnZml4ZWQnLCBsZWZ0OiAnMHB4JywgdG9wOiAnMHB4Jywgd2lkdGg6ICc0MDBweCcsIGhlaWdodDogJzQwMHB4JywgekluZGV4OiAnMjU0MCdcblx0XHR9KTtcblxuXHRcdGNvbnN0IG92ZXJsYXlzID0gbWFuYWdlci5nZXRPdmVybGFwcGluZ092ZXJsYXlzKGJyb3dzZXJDb250YWluZXIpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChvdmVybGF5cy5tYXAobyA9PiBvLnR5cGUpLCBbQnJvd3Nlck92ZXJsYXlUeXBlLkRpYWxvZ10pO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCBkZXRlY3QgYW4gb3ZlcmxheSB0aGF0IGRvZXMgbm90IG92ZXJsYXAgdGhlIGJyb3dzZXIgY29udGFpbmVyJywgKCkgPT4ge1xuXHRcdGNvbnN0IGJyb3dzZXJDb250YWluZXIgPSBhZGRFbGVtZW50KCdicm93c2VyLWNvbnRhaW5lcicsIHtcblx0XHRcdHBvc2l0aW9uOiAnYWJzb2x1dGUnLCBsZWZ0OiAnMHB4JywgdG9wOiAnMHB4Jywgd2lkdGg6ICcxMDBweCcsIGhlaWdodDogJzEwMHB4J1xuXHRcdH0pO1xuXHRcdGFkZEVsZW1lbnQoJ21vbmFjby1tZW51LWNvbnRhaW5lcicsIHtcblx0XHRcdHBvc2l0aW9uOiAnZml4ZWQnLCBsZWZ0OiAnNTAwcHgnLCB0b3A6ICc1MDBweCcsIHdpZHRoOiAnMTAwcHgnLCBoZWlnaHQ6ICcxMDBweCcsIHpJbmRleDogJzI1NzUnXG5cdFx0fSk7XG5cblx0XHRjb25zdCBvdmVybGF5cyA9IG1hbmFnZXIuZ2V0T3ZlcmxhcHBpbmdPdmVybGF5cyhicm93c2VyQ29udGFpbmVyKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwob3ZlcmxheXMsIFtdKTtcblx0fSk7XG5cblx0dGVzdCgnZGV0ZWN0cyBhbiBvdmVybGF5IGJlbmVhdGggZGV0YWNoZWQgd2VidmlldyBjb250ZW50JywgKCkgPT4ge1xuXHRcdGNvbnN0IGJyb3dzZXJDb250YWluZXIgPSBhZGRFbGVtZW50KCdicm93c2VyLWNvbnRhaW5lcicsIHtcblx0XHRcdHBvc2l0aW9uOiAnYWJzb2x1dGUnLCBsZWZ0OiAnMHB4JywgdG9wOiAnMHB4Jywgd2lkdGg6ICczMDBweCcsIGhlaWdodDogJzMwMHB4J1xuXHRcdH0pO1xuXHRcdGNvbnN0IGNvbnRleHRWaWV3ID0gYWRkRWxlbWVudCgnY29udGV4dC12aWV3Jywge1xuXHRcdFx0cG9zaXRpb246ICdmaXhlZCcsIGxlZnQ6ICcwcHgnLCB0b3A6ICcwcHgnLCB3aWR0aDogJzIwMHB4JywgaGVpZ2h0OiAnMjAwcHgnXG5cdFx0fSk7XG5cdFx0YWRkRWxlbWVudCgnb3ZlcmxheS1hbmNob3InLCB7XG5cdFx0XHRwb3NpdGlvbjogJ2Fic29sdXRlJywgbGVmdDogJzBweCcsIHRvcDogJzBweCcsIHdpZHRoOiAnMjAwcHgnLCBoZWlnaHQ6ICcyMDBweCdcblx0XHR9LCBjb250ZXh0Vmlldyk7XG5cblx0XHRjb25zdCBvdmVybGF5Q29udGVudCA9IGFkZEVsZW1lbnQoJ3dlYnZpZXctb3ZlcmxheS1jb250ZW50Jywge1xuXHRcdFx0cG9zaXRpb246ICdmaXhlZCcsIGxlZnQ6ICcwcHgnLCB0b3A6ICcwcHgnLCB3aWR0aDogJzIwMHB4JywgaGVpZ2h0OiAnMjAwcHgnLCB6SW5kZXg6ICcxJ1xuXHRcdH0pO1xuXHRcdGFkZEVsZW1lbnQoJ3dlYnZpZXcnLCB7XG5cdFx0XHR3aWR0aDogJzEwMCUnLCBoZWlnaHQ6ICcxMDAlJ1xuXHRcdH0sIG92ZXJsYXlDb250ZW50KTtcblxuXHRcdGNvbnN0IG92ZXJsYXlzID0gbWFuYWdlci5nZXRPdmVybGFwcGluZ092ZXJsYXlzKGJyb3dzZXJDb250YWluZXIpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChvdmVybGF5cy5tYXAobyA9PiBvLnR5cGUpLCBbQnJvd3Nlck92ZXJsYXlUeXBlLlVua25vd25dKTtcblx0fSk7XG5cblx0Ly8gUmVncmVzc2lvbiB0ZXN0IGZvciAjMzIxMDg4OiBhIGNvbnRleHQgbWVudSAoZS5nLiB0aGUgXCJBZGQgTW9kZWxzXCJcblx0Ly8gZHJvcGRvd24pIHJlbmRlcnMgYSBmdWxsLXNjcmVlbiBgLmNvbnRleHQtdmlldy1ibG9ja2AgaW5zaWRlIGAuY29udGV4dC12aWV3YFxuXHQvLyB0aGF0IHN0YWNrcyBhYm92ZSBhbiBhbHJlYWR5LW9wZW4gbW9kYWwuIFRoZSBibG9jayBpc24ndCBhIHRyYWNrZWQgb3ZlcmxheVxuXHQvLyBjbGFzcywgYnV0IGl0J3MgYSBkZXNjZW5kYW50IG9mIHRoZSB0cmFja2VkIGAuY29udGV4dC12aWV3YCwgc28gdGhlIGJyb3dzZXJcblx0Ly8gbXVzdCBzdGlsbCBiZSByZXBvcnRlZCBhcyBvYnNjdXJlZC5cblx0dGVzdCgnZGV0ZWN0cyBvYnNjdXJpbmcgd2hlbiBhIGNvbnRleHQtdmlldyBibG9jayBjb3ZlcnMgdGhlIGJyb3dzZXIgb24gdG9wIG9mIGEgbW9kYWwnLCAoKSA9PiB7XG5cdFx0Y29uc3QgYnJvd3NlckNvbnRhaW5lciA9IGFkZEVsZW1lbnQoJ2Jyb3dzZXItY29udGFpbmVyJywge1xuXHRcdFx0cG9zaXRpb246ICdhYnNvbHV0ZScsIGxlZnQ6ICcwcHgnLCB0b3A6ICcwcHgnLCB3aWR0aDogJzMwMHB4JywgaGVpZ2h0OiAnMzAwcHgnXG5cdFx0fSk7XG5cblx0XHQvLyBNb2RhbCBzaXR0aW5nIG9uIHRvcCBvZiAoYW5kIGZ1bGx5IGNvdmVyaW5nKSB0aGUgYnJvd3Nlci5cblx0XHRhZGRFbGVtZW50KCdtb25hY28tbW9kYWwtZWRpdG9yLWJsb2NrJywge1xuXHRcdFx0cG9zaXRpb246ICdmaXhlZCcsIGxlZnQ6ICcwcHgnLCB0b3A6ICcwcHgnLCB3aWR0aDogJzQwMHB4JywgaGVpZ2h0OiAnNDAwcHgnLCB6SW5kZXg6ICcyNTQwJ1xuXHRcdH0pO1xuXG5cdFx0Ly8gQ29udGV4dCBtZW51IGFuY2hvcmVkIG91dHNpZGUgdGhlIGJyb3dzZXIsIHNvIGl0cyBvd24gcmVjdCBkb2Vzbid0IG92ZXJsYXAuXG5cdFx0Y29uc3QgY29udGV4dFZpZXcgPSBhZGRFbGVtZW50KCdjb250ZXh0LXZpZXcnLCB7XG5cdFx0XHRwb3NpdGlvbjogJ2ZpeGVkJywgbGVmdDogJzMyMHB4JywgdG9wOiAnMzIwcHgnLCB3aWR0aDogJzYwcHgnLCBoZWlnaHQ6ICc2MHB4JywgekluZGV4OiAnMjU3NSdcblx0XHR9KTtcblx0XHQvLyBGdWxsLXNjcmVlbiBtb3VzZS1ibG9ja2luZyBjaGlsZCwgc3RhY2tlZCBhYm92ZSB0aGUgbW9kYWwuXG5cdFx0YWRkRWxlbWVudCgnY29udGV4dC12aWV3LWJsb2NrJywge1xuXHRcdFx0cG9zaXRpb246ICdmaXhlZCcsIGxlZnQ6ICcwcHgnLCB0b3A6ICcwcHgnLCB3aWR0aDogJzQwMHB4JywgaGVpZ2h0OiAnNDAwcHgnLCB6SW5kZXg6ICctMSdcblx0XHR9LCBjb250ZXh0Vmlldyk7XG5cblx0XHRjb25zdCBvdmVybGF5cyA9IG1hbmFnZXIuZ2V0T3ZlcmxhcHBpbmdPdmVybGF5cyhicm93c2VyQ29udGFpbmVyKTtcblxuXHRcdC8vIFRoZSB0cmFuc3BhcmVudCBibG9jayBpcyBza2lwcGVkLCBzbyB0aGUgbW9kYWwgYmVuZWF0aCBpdCBpcyB0b3Btb3N0LlxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwob3ZlcmxheXMubWFwKG8gPT4gby50eXBlKSwgW0Jyb3dzZXJPdmVybGF5VHlwZS5EaWFsb2ddKTtcblx0fSk7XG5cblx0dGVzdCgnZGV0ZWN0cyBvYnNjdXJpbmcgd2hlbiBhIGNvbnRleHQtdmlldyBwb2ludGVyIGJsb2NrIGNvdmVycyB0aGUgYnJvd3NlciBvbiB0b3Agb2YgYSBtb2RhbCcsICgpID0+IHtcblx0XHRjb25zdCBicm93c2VyQ29udGFpbmVyID0gYWRkRWxlbWVudCgnYnJvd3Nlci1jb250YWluZXInLCB7XG5cdFx0XHRwb3NpdGlvbjogJ2Fic29sdXRlJywgbGVmdDogJzBweCcsIHRvcDogJzBweCcsIHdpZHRoOiAnMzAwcHgnLCBoZWlnaHQ6ICczMDBweCdcblx0XHR9KTtcblxuXHRcdGFkZEVsZW1lbnQoJ21vbmFjby1tb2RhbC1lZGl0b3ItYmxvY2snLCB7XG5cdFx0XHRwb3NpdGlvbjogJ2ZpeGVkJywgbGVmdDogJzBweCcsIHRvcDogJzBweCcsIHdpZHRoOiAnNDAwcHgnLCBoZWlnaHQ6ICc0MDBweCcsIHpJbmRleDogJzI1NDAnXG5cdFx0fSk7XG5cblx0XHRjb25zdCBjb250ZXh0VmlldyA9IGFkZEVsZW1lbnQoJ2NvbnRleHQtdmlldycsIHtcblx0XHRcdHBvc2l0aW9uOiAnZml4ZWQnLCBsZWZ0OiAnMzIwcHgnLCB0b3A6ICczMjBweCcsIHdpZHRoOiAnNjBweCcsIGhlaWdodDogJzYwcHgnLCB6SW5kZXg6ICcyNTc1J1xuXHRcdH0pO1xuXHRcdGFkZEVsZW1lbnQoJ2NvbnRleHQtdmlldy1wb2ludGVyQmxvY2snLCB7XG5cdFx0XHRwb3NpdGlvbjogJ2ZpeGVkJywgbGVmdDogJzBweCcsIHRvcDogJzBweCcsIHdpZHRoOiAnNDAwcHgnLCBoZWlnaHQ6ICc0MDBweCcsIHpJbmRleDogJzInXG5cdFx0fSwgY29udGV4dFZpZXcpO1xuXG5cdFx0Y29uc3Qgb3ZlcmxheXMgPSBtYW5hZ2VyLmdldE92ZXJsYXBwaW5nT3ZlcmxheXMoYnJvd3NlckNvbnRhaW5lcik7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG92ZXJsYXlzLm1hcChvID0+IG8udHlwZSksIFtCcm93c2VyT3ZlcmxheVR5cGUuRGlhbG9nXSk7XG5cdH0pO1xuXG5cdC8vIEEgbm90aWZpY2F0aW9uIHRvYXN0IGZ1bGx5IGNvdmVyZWQgYnkgYSBtb2RhbCBtdXN0IGJlIHJlcG9ydGVkIGFzIHRoZVxuXHQvLyBkaWFsb2csIG5vdCB0aGUgbm90aWZpY2F0aW9uLCBzbyBjYWxsZXJzIGRvbid0IHRyZWF0IGEgaGlkZGVuIHRvYXN0IGFzXG5cdC8vIHRoZSBhY3RpdmUgb2JzY3VyaW5nIG92ZXJsYXkuXG5cdHRlc3QoJ3JlcG9ydHMgdGhlIGRpYWxvZywgbm90IGEgbm90aWZpY2F0aW9uIGNvdmVyZWQgYnkgaXQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgYnJvd3NlckNvbnRhaW5lciA9IGFkZEVsZW1lbnQoJ2Jyb3dzZXItY29udGFpbmVyJywge1xuXHRcdFx0cG9zaXRpb246ICdhYnNvbHV0ZScsIGxlZnQ6ICcwcHgnLCB0b3A6ICcwcHgnLCB3aWR0aDogJzMwMHB4JywgaGVpZ2h0OiAnMzAwcHgnXG5cdFx0fSk7XG5cdFx0YWRkRWxlbWVudCgnbm90aWZpY2F0aW9uLXRvYXN0LWNvbnRhaW5lcicsIHtcblx0XHRcdHBvc2l0aW9uOiAnZml4ZWQnLCBsZWZ0OiAnMHB4JywgdG9wOiAnMHB4Jywgd2lkdGg6ICcyMDBweCcsIGhlaWdodDogJzIwMHB4JywgekluZGV4OiAnMjAwMCdcblx0XHR9KTtcblx0XHRhZGRFbGVtZW50KCdtb25hY28tbW9kYWwtZWRpdG9yLWJsb2NrJywge1xuXHRcdFx0cG9zaXRpb246ICdmaXhlZCcsIGxlZnQ6ICcwcHgnLCB0b3A6ICcwcHgnLCB3aWR0aDogJzQwMHB4JywgaGVpZ2h0OiAnNDAwcHgnLCB6SW5kZXg6ICcyNTQwJ1xuXHRcdH0pO1xuXG5cdFx0Y29uc3Qgb3ZlcmxheXMgPSBtYW5hZ2VyLmdldE92ZXJsYXBwaW5nT3ZlcmxheXMoYnJvd3NlckNvbnRhaW5lcik7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG92ZXJsYXlzLm1hcChvID0+IG8udHlwZSksIFtCcm93c2VyT3ZlcmxheVR5cGUuRGlhbG9nXSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxTQUFTO0FBQ2xCLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsdUJBQXVCLDBCQUEwQjtBQUUxRCxNQUFNLHlCQUF5QixNQUFNO0FBRXBDLFFBQU0sUUFBUSx3Q0FBd0M7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
