import assert from "assert";
import sinon from "sinon";
import { $, getDomNodePagePosition, getWindow } from "../../../../browser/dom.js";
import { CONTEXT_VIEW_CLOSE_ANIMATION_DURATION_VARIABLE, CONTEXT_VIEW_MENU_MOTION_CLASS, ContextView, ContextViewDOMPosition } from "../../../../browser/ui/contextview/contextview.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../common/utils.js";
suite("ContextView", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  teardown(() => {
    sinon.restore();
  });
  test("hide() is re-entrant safe and does not double-dispose render result (#319393)", () => {
    const container = $(".container");
    const contextView = new ContextView(container, ContextViewDOMPosition.ABSOLUTE);
    let disposeCount = 0;
    const delegate = {
      getAnchor: () => ({ x: 0, y: 0 }),
      render: () => ({
        dispose: () => {
          disposeCount++;
          if (disposeCount === 1) {
            contextView.hide();
          }
        }
      })
    };
    contextView.show(delegate);
    assert.doesNotThrow(() => contextView.hide());
    assert.strictEqual(disposeCount, 1, "render disposable must be disposed exactly once");
    contextView.dispose();
    container.remove();
  });
  test("hide() delays render disposal for close animations", () => {
    const clock = sinon.useFakeTimers();
    const container = $(".container");
    container.classList.add("style-override", "monaco-enable-motion");
    const contextView = new ContextView(container, ContextViewDOMPosition.ABSOLUTE);
    let disposeCount = 0;
    const delegate = {
      getAnchor: () => ({ x: 0, y: 0 }),
      render: () => ({
        dispose: () => {
          disposeCount++;
        }
      }),
      closeAnimation: {
        className: "closing",
        duration: 100,
        requiredAncestorClasses: ["style-override", "monaco-enable-motion"]
      }
    };
    contextView.show(delegate);
    contextView.hide();
    contextView.hide();
    assert.deepStrictEqual({
      disposeCount,
      hasClosingClass: contextView.getViewElement().classList.contains("closing"),
      animationDuration: contextView.getViewElement().style.getPropertyValue(CONTEXT_VIEW_CLOSE_ANIMATION_DURATION_VARIABLE),
      inert: contextView.getViewElement().inert
    }, {
      disposeCount: 0,
      hasClosingClass: true,
      animationDuration: "100ms",
      inert: true
    });
    clock.tick(100);
    assert.deepStrictEqual({
      disposeCount,
      hasClosingClass: contextView.getViewElement().classList.contains("closing"),
      animationDuration: contextView.getViewElement().style.getPropertyValue(CONTEXT_VIEW_CLOSE_ANIMATION_DURATION_VARIABLE),
      inert: contextView.getViewElement().inert
    }, {
      disposeCount: 1,
      hasClosingClass: false,
      animationDuration: "",
      inert: false
    });
    contextView.dispose();
    assert.strictEqual(disposeCount, 1);
    container.remove();
  });
  test("positions absolute view when the container is position: static", () => {
    const host = $(".host");
    const spacer = $(".spacer");
    spacer.style.height = "60px";
    const container = $(".container");
    host.append(spacer, container);
    document.body.appendChild(host);
    const contextView = new ContextView(container, ContextViewDOMPosition.ABSOLUTE);
    contextView.show({
      getAnchor: () => ({ x: 100, y: 100, width: 1, height: 1 }),
      render: (view) => {
        view.style.width = "10px";
        view.style.height = "10px";
        return null;
      }
    });
    const position = getDomNodePagePosition(contextView.getViewElement());
    assert.deepStrictEqual({
      left: Math.round(position.left),
      top: Math.round(position.top)
    }, {
      left: 100,
      top: 101
    });
    contextView.dispose();
    host.remove();
  });
  test("positions absolute view in a bordered scrolling containing block", () => {
    const ancestor = $(".ancestor");
    ancestor.style.position = "relative";
    ancestor.style.border = "10px solid transparent";
    ancestor.style.overflow = "scroll";
    ancestor.style.width = "200px";
    ancestor.style.height = "200px";
    const container = $(".container");
    container.style.width = "500px";
    container.style.height = "500px";
    ancestor.appendChild(container);
    document.body.appendChild(ancestor);
    ancestor.scrollLeft = 30;
    ancestor.scrollTop = 40;
    const ancestorPosition = getDomNodePagePosition(ancestor);
    const anchor = {
      x: ancestorPosition.left + 100,
      y: ancestorPosition.top + 100,
      width: 1,
      height: 1
    };
    const contextView = new ContextView(container, ContextViewDOMPosition.ABSOLUTE);
    contextView.show({
      getAnchor: () => anchor,
      render: (view) => {
        view.style.width = "10px";
        view.style.height = "10px";
        return null;
      }
    });
    const position = getDomNodePagePosition(contextView.getViewElement());
    assert.deepStrictEqual({
      scrollLeft: ancestor.scrollLeft,
      scrollTop: ancestor.scrollTop,
      left: Math.round(position.left),
      top: Math.round(position.top)
    }, {
      scrollLeft: 30,
      scrollTop: 40,
      left: Math.round(anchor.x),
      top: Math.round(anchor.y + anchor.height)
    });
    contextView.dispose();
    ancestor.remove();
  });
  test("relayouts fixed view from the positioning origin", () => {
    const container = $(".container");
    document.body.appendChild(container);
    let anchorY = 100;
    const contextView = new ContextView(container, ContextViewDOMPosition.FIXED);
    contextView.show({
      getAnchor: () => ({ x: 100, y: anchorY, width: 1, height: 1 }),
      render: (view) => {
        view.textContent = "x";
        view.style.width = "10px";
        view.style.height = "10px";
        return null;
      }
    });
    anchorY = 200;
    contextView.layout();
    const position = getDomNodePagePosition(contextView.getViewElement());
    assert.deepStrictEqual({
      left: Math.round(position.left),
      top: Math.round(position.top)
    }, {
      left: 100,
      top: 201
    });
    contextView.dispose();
    container.remove();
  });
  test("menu motion does not retain a containing block for submenus (#326248)", () => {
    const container = $(".container");
    container.classList.add("style-override", "monaco-enable-motion");
    document.body.appendChild(container);
    const surface = $(".monaco-scrollable-element");
    const contextView = new ContextView(container, ContextViewDOMPosition.ABSOLUTE);
    contextView.show({
      getAnchor: () => ({ x: 0, y: 0 }),
      render: (view) => {
        view.appendChild(surface);
        return null;
      }
    });
    contextView.getViewElement().classList.add(CONTEXT_VIEW_MENU_MOTION_CLASS);
    const style = getWindow(surface).getComputedStyle(surface);
    assert.deepStrictEqual({
      animationFillMode: style.animationFillMode,
      willChange: style.willChange
    }, {
      animationFillMode: "backwards",
      willChange: "opacity"
    });
    contextView.dispose();
    container.remove();
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFx0ZXN0XFxicm93c2VyXFx1aVxcY29udGV4dHZpZXdcXGNvbnRleHR2aWV3LnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgc2lub24gZnJvbSAnc2lub24nO1xuaW1wb3J0IHsgJCwgZ2V0RG9tTm9kZVBhZ2VQb3NpdGlvbiwgZ2V0V2luZG93IH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgQ09OVEVYVF9WSUVXX0NMT1NFX0FOSU1BVElPTl9EVVJBVElPTl9WQVJJQUJMRSwgQ09OVEVYVF9WSUVXX01FTlVfTU9USU9OX0NMQVNTLCBDb250ZXh0VmlldywgQ29udGV4dFZpZXdET01Qb3NpdGlvbiwgSURlbGVnYXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci91aS9jb250ZXh0dmlldy9jb250ZXh0dmlldy5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdXRpbHMuanMnO1xuXG5zdWl0ZSgnQ29udGV4dFZpZXcnLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlYXJkb3duKCgpID0+IHtcblx0XHRzaW5vbi5yZXN0b3JlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2hpZGUoKSBpcyByZS1lbnRyYW50IHNhZmUgYW5kIGRvZXMgbm90IGRvdWJsZS1kaXNwb3NlIHJlbmRlciByZXN1bHQgKCMzMTkzOTMpJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRhaW5lciA9ICQoJy5jb250YWluZXInKTtcblx0XHRjb25zdCBjb250ZXh0VmlldyA9IG5ldyBDb250ZXh0Vmlldyhjb250YWluZXIsIENvbnRleHRWaWV3RE9NUG9zaXRpb24uQUJTT0xVVEUpO1xuXG5cdFx0bGV0IGRpc3Bvc2VDb3VudCA9IDA7XG5cdFx0Y29uc3QgZGVsZWdhdGU6IElEZWxlZ2F0ZSA9IHtcblx0XHRcdGdldEFuY2hvcjogKCkgPT4gKHsgeDogMCwgeTogMCB9KSxcblx0XHRcdHJlbmRlcjogKCkgPT4gKHtcblx0XHRcdFx0ZGlzcG9zZTogKCkgPT4ge1xuXHRcdFx0XHRcdGRpc3Bvc2VDb3VudCsrO1xuXHRcdFx0XHRcdGlmIChkaXNwb3NlQ291bnQgPT09IDEpIHtcblx0XHRcdFx0XHRcdC8vIFNpbXVsYXRlIGEgcmUtZW50cmFudCBoaWRlKCkgY2FsbCAoZS5nLiB2aWEgYSBibHVyIGV2ZW50XG5cdFx0XHRcdFx0XHQvLyBmaXJlZCB3aGlsZSByZW1vdmluZyB0aGUgcmVuZGVyZWQgRE9NIG5vZGUgZnJvbSB0aGUgZG9jdW1lbnQpLlxuXHRcdFx0XHRcdFx0Y29udGV4dFZpZXcuaGlkZSgpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSlcblx0XHR9O1xuXG5cdFx0Y29udGV4dFZpZXcuc2hvdyhkZWxlZ2F0ZSk7XG5cblx0XHRhc3NlcnQuZG9lc05vdFRocm93KCgpID0+IGNvbnRleHRWaWV3LmhpZGUoKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpc3Bvc2VDb3VudCwgMSwgJ3JlbmRlciBkaXNwb3NhYmxlIG11c3QgYmUgZGlzcG9zZWQgZXhhY3RseSBvbmNlJyk7XG5cblx0XHRjb250ZXh0Vmlldy5kaXNwb3NlKCk7XG5cdFx0Y29udGFpbmVyLnJlbW92ZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdoaWRlKCkgZGVsYXlzIHJlbmRlciBkaXNwb3NhbCBmb3IgY2xvc2UgYW5pbWF0aW9ucycsICgpID0+IHtcblx0XHRjb25zdCBjbG9jayA9IHNpbm9uLnVzZUZha2VUaW1lcnMoKTtcblx0XHRjb25zdCBjb250YWluZXIgPSAkKCcuY29udGFpbmVyJyk7XG5cdFx0Y29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ3N0eWxlLW92ZXJyaWRlJywgJ21vbmFjby1lbmFibGUtbW90aW9uJyk7XG5cdFx0Y29uc3QgY29udGV4dFZpZXcgPSBuZXcgQ29udGV4dFZpZXcoY29udGFpbmVyLCBDb250ZXh0Vmlld0RPTVBvc2l0aW9uLkFCU09MVVRFKTtcblxuXHRcdGxldCBkaXNwb3NlQ291bnQgPSAwO1xuXHRcdGNvbnN0IGRlbGVnYXRlOiBJRGVsZWdhdGUgPSB7XG5cdFx0XHRnZXRBbmNob3I6ICgpID0+ICh7IHg6IDAsIHk6IDAgfSksXG5cdFx0XHRyZW5kZXI6ICgpID0+ICh7XG5cdFx0XHRcdGRpc3Bvc2U6ICgpID0+IHtcblx0XHRcdFx0XHRkaXNwb3NlQ291bnQrKztcblx0XHRcdFx0fVxuXHRcdFx0fSksXG5cdFx0XHRjbG9zZUFuaW1hdGlvbjoge1xuXHRcdFx0XHRjbGFzc05hbWU6ICdjbG9zaW5nJyxcblx0XHRcdFx0ZHVyYXRpb246IDEwMCxcblx0XHRcdFx0cmVxdWlyZWRBbmNlc3RvckNsYXNzZXM6IFsnc3R5bGUtb3ZlcnJpZGUnLCAnbW9uYWNvLWVuYWJsZS1tb3Rpb24nXVxuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRjb250ZXh0Vmlldy5zaG93KGRlbGVnYXRlKTtcblx0XHRjb250ZXh0Vmlldy5oaWRlKCk7XG5cdFx0Y29udGV4dFZpZXcuaGlkZSgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRkaXNwb3NlQ291bnQsXG5cdFx0XHRoYXNDbG9zaW5nQ2xhc3M6IGNvbnRleHRWaWV3LmdldFZpZXdFbGVtZW50KCkuY2xhc3NMaXN0LmNvbnRhaW5zKCdjbG9zaW5nJyksXG5cdFx0XHRhbmltYXRpb25EdXJhdGlvbjogY29udGV4dFZpZXcuZ2V0Vmlld0VsZW1lbnQoKS5zdHlsZS5nZXRQcm9wZXJ0eVZhbHVlKENPTlRFWFRfVklFV19DTE9TRV9BTklNQVRJT05fRFVSQVRJT05fVkFSSUFCTEUpLFxuXHRcdFx0aW5lcnQ6IGNvbnRleHRWaWV3LmdldFZpZXdFbGVtZW50KCkuaW5lcnRcblx0XHR9LCB7XG5cdFx0XHRkaXNwb3NlQ291bnQ6IDAsXG5cdFx0XHRoYXNDbG9zaW5nQ2xhc3M6IHRydWUsXG5cdFx0XHRhbmltYXRpb25EdXJhdGlvbjogJzEwMG1zJyxcblx0XHRcdGluZXJ0OiB0cnVlXG5cdFx0fSk7XG5cblx0XHRjbG9jay50aWNrKDEwMCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGRpc3Bvc2VDb3VudCxcblx0XHRcdGhhc0Nsb3NpbmdDbGFzczogY29udGV4dFZpZXcuZ2V0Vmlld0VsZW1lbnQoKS5jbGFzc0xpc3QuY29udGFpbnMoJ2Nsb3NpbmcnKSxcblx0XHRcdGFuaW1hdGlvbkR1cmF0aW9uOiBjb250ZXh0Vmlldy5nZXRWaWV3RWxlbWVudCgpLnN0eWxlLmdldFByb3BlcnR5VmFsdWUoQ09OVEVYVF9WSUVXX0NMT1NFX0FOSU1BVElPTl9EVVJBVElPTl9WQVJJQUJMRSksXG5cdFx0XHRpbmVydDogY29udGV4dFZpZXcuZ2V0Vmlld0VsZW1lbnQoKS5pbmVydFxuXHRcdH0sIHtcblx0XHRcdGRpc3Bvc2VDb3VudDogMSxcblx0XHRcdGhhc0Nsb3NpbmdDbGFzczogZmFsc2UsXG5cdFx0XHRhbmltYXRpb25EdXJhdGlvbjogJycsXG5cdFx0XHRpbmVydDogZmFsc2Vcblx0XHR9KTtcblxuXHRcdGNvbnRleHRWaWV3LmRpc3Bvc2UoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlzcG9zZUNvdW50LCAxKTtcblx0XHRjb250YWluZXIucmVtb3ZlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Bvc2l0aW9ucyBhYnNvbHV0ZSB2aWV3IHdoZW4gdGhlIGNvbnRhaW5lciBpcyBwb3NpdGlvbjogc3RhdGljJywgKCkgPT4ge1xuXHRcdGNvbnN0IGhvc3QgPSAkKCcuaG9zdCcpO1xuXHRcdGNvbnN0IHNwYWNlciA9ICQoJy5zcGFjZXInKTtcblx0XHRzcGFjZXIuc3R5bGUuaGVpZ2h0ID0gJzYwcHgnO1xuXHRcdGNvbnN0IGNvbnRhaW5lciA9ICQoJy5jb250YWluZXInKTtcblx0XHRob3N0LmFwcGVuZChzcGFjZXIsIGNvbnRhaW5lcik7XG5cdFx0ZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChob3N0KTtcblxuXHRcdGNvbnN0IGNvbnRleHRWaWV3ID0gbmV3IENvbnRleHRWaWV3KGNvbnRhaW5lciwgQ29udGV4dFZpZXdET01Qb3NpdGlvbi5BQlNPTFVURSk7XG5cdFx0Y29udGV4dFZpZXcuc2hvdyh7XG5cdFx0XHRnZXRBbmNob3I6ICgpID0+ICh7IHg6IDEwMCwgeTogMTAwLCB3aWR0aDogMSwgaGVpZ2h0OiAxIH0pLFxuXHRcdFx0cmVuZGVyOiB2aWV3ID0+IHtcblx0XHRcdFx0dmlldy5zdHlsZS53aWR0aCA9ICcxMHB4Jztcblx0XHRcdFx0dmlldy5zdHlsZS5oZWlnaHQgPSAnMTBweCc7XG5cdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgcG9zaXRpb24gPSBnZXREb21Ob2RlUGFnZVBvc2l0aW9uKGNvbnRleHRWaWV3LmdldFZpZXdFbGVtZW50KCkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0bGVmdDogTWF0aC5yb3VuZChwb3NpdGlvbi5sZWZ0KSxcblx0XHRcdHRvcDogTWF0aC5yb3VuZChwb3NpdGlvbi50b3ApXG5cdFx0fSwge1xuXHRcdFx0bGVmdDogMTAwLFxuXHRcdFx0dG9wOiAxMDFcblx0XHR9KTtcblxuXHRcdGNvbnRleHRWaWV3LmRpc3Bvc2UoKTtcblx0XHRob3N0LnJlbW92ZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdwb3NpdGlvbnMgYWJzb2x1dGUgdmlldyBpbiBhIGJvcmRlcmVkIHNjcm9sbGluZyBjb250YWluaW5nIGJsb2NrJywgKCkgPT4ge1xuXHRcdGNvbnN0IGFuY2VzdG9yID0gJCgnLmFuY2VzdG9yJyk7XG5cdFx0YW5jZXN0b3Iuc3R5bGUucG9zaXRpb24gPSAncmVsYXRpdmUnO1xuXHRcdGFuY2VzdG9yLnN0eWxlLmJvcmRlciA9ICcxMHB4IHNvbGlkIHRyYW5zcGFyZW50Jztcblx0XHRhbmNlc3Rvci5zdHlsZS5vdmVyZmxvdyA9ICdzY3JvbGwnO1xuXHRcdGFuY2VzdG9yLnN0eWxlLndpZHRoID0gJzIwMHB4Jztcblx0XHRhbmNlc3Rvci5zdHlsZS5oZWlnaHQgPSAnMjAwcHgnO1xuXG5cdFx0Y29uc3QgY29udGFpbmVyID0gJCgnLmNvbnRhaW5lcicpO1xuXHRcdGNvbnRhaW5lci5zdHlsZS53aWR0aCA9ICc1MDBweCc7XG5cdFx0Y29udGFpbmVyLnN0eWxlLmhlaWdodCA9ICc1MDBweCc7XG5cdFx0YW5jZXN0b3IuYXBwZW5kQ2hpbGQoY29udGFpbmVyKTtcblx0XHRkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKGFuY2VzdG9yKTtcblx0XHRhbmNlc3Rvci5zY3JvbGxMZWZ0ID0gMzA7XG5cdFx0YW5jZXN0b3Iuc2Nyb2xsVG9wID0gNDA7XG5cblx0XHRjb25zdCBhbmNlc3RvclBvc2l0aW9uID0gZ2V0RG9tTm9kZVBhZ2VQb3NpdGlvbihhbmNlc3Rvcik7XG5cdFx0Y29uc3QgYW5jaG9yID0ge1xuXHRcdFx0eDogYW5jZXN0b3JQb3NpdGlvbi5sZWZ0ICsgMTAwLFxuXHRcdFx0eTogYW5jZXN0b3JQb3NpdGlvbi50b3AgKyAxMDAsXG5cdFx0XHR3aWR0aDogMSxcblx0XHRcdGhlaWdodDogMVxuXHRcdH07XG5cdFx0Y29uc3QgY29udGV4dFZpZXcgPSBuZXcgQ29udGV4dFZpZXcoY29udGFpbmVyLCBDb250ZXh0Vmlld0RPTVBvc2l0aW9uLkFCU09MVVRFKTtcblx0XHRjb250ZXh0Vmlldy5zaG93KHtcblx0XHRcdGdldEFuY2hvcjogKCkgPT4gYW5jaG9yLFxuXHRcdFx0cmVuZGVyOiB2aWV3ID0+IHtcblx0XHRcdFx0dmlldy5zdHlsZS53aWR0aCA9ICcxMHB4Jztcblx0XHRcdFx0dmlldy5zdHlsZS5oZWlnaHQgPSAnMTBweCc7XG5cdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgcG9zaXRpb24gPSBnZXREb21Ob2RlUGFnZVBvc2l0aW9uKGNvbnRleHRWaWV3LmdldFZpZXdFbGVtZW50KCkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0c2Nyb2xsTGVmdDogYW5jZXN0b3Iuc2Nyb2xsTGVmdCxcblx0XHRcdHNjcm9sbFRvcDogYW5jZXN0b3Iuc2Nyb2xsVG9wLFxuXHRcdFx0bGVmdDogTWF0aC5yb3VuZChwb3NpdGlvbi5sZWZ0KSxcblx0XHRcdHRvcDogTWF0aC5yb3VuZChwb3NpdGlvbi50b3ApXG5cdFx0fSwge1xuXHRcdFx0c2Nyb2xsTGVmdDogMzAsXG5cdFx0XHRzY3JvbGxUb3A6IDQwLFxuXHRcdFx0bGVmdDogTWF0aC5yb3VuZChhbmNob3IueCksXG5cdFx0XHR0b3A6IE1hdGgucm91bmQoYW5jaG9yLnkgKyBhbmNob3IuaGVpZ2h0KVxuXHRcdH0pO1xuXG5cdFx0Y29udGV4dFZpZXcuZGlzcG9zZSgpO1xuXHRcdGFuY2VzdG9yLnJlbW92ZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWxheW91dHMgZml4ZWQgdmlldyBmcm9tIHRoZSBwb3NpdGlvbmluZyBvcmlnaW4nLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29udGFpbmVyID0gJCgnLmNvbnRhaW5lcicpO1xuXHRcdGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQoY29udGFpbmVyKTtcblxuXHRcdGxldCBhbmNob3JZID0gMTAwO1xuXHRcdGNvbnN0IGNvbnRleHRWaWV3ID0gbmV3IENvbnRleHRWaWV3KGNvbnRhaW5lciwgQ29udGV4dFZpZXdET01Qb3NpdGlvbi5GSVhFRCk7XG5cdFx0Y29udGV4dFZpZXcuc2hvdyh7XG5cdFx0XHRnZXRBbmNob3I6ICgpID0+ICh7IHg6IDEwMCwgeTogYW5jaG9yWSwgd2lkdGg6IDEsIGhlaWdodDogMSB9KSxcblx0XHRcdHJlbmRlcjogdmlldyA9PiB7XG5cdFx0XHRcdHZpZXcudGV4dENvbnRlbnQgPSAneCc7XG5cdFx0XHRcdHZpZXcuc3R5bGUud2lkdGggPSAnMTBweCc7XG5cdFx0XHRcdHZpZXcuc3R5bGUuaGVpZ2h0ID0gJzEwcHgnO1xuXHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGFuY2hvclkgPSAyMDA7XG5cdFx0Y29udGV4dFZpZXcubGF5b3V0KCk7XG5cblx0XHRjb25zdCBwb3NpdGlvbiA9IGdldERvbU5vZGVQYWdlUG9zaXRpb24oY29udGV4dFZpZXcuZ2V0Vmlld0VsZW1lbnQoKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRsZWZ0OiBNYXRoLnJvdW5kKHBvc2l0aW9uLmxlZnQpLFxuXHRcdFx0dG9wOiBNYXRoLnJvdW5kKHBvc2l0aW9uLnRvcClcblx0XHR9LCB7XG5cdFx0XHRsZWZ0OiAxMDAsXG5cdFx0XHR0b3A6IDIwMVxuXHRcdH0pO1xuXG5cdFx0Y29udGV4dFZpZXcuZGlzcG9zZSgpO1xuXHRcdGNvbnRhaW5lci5yZW1vdmUoKTtcblx0fSk7XG5cblx0dGVzdCgnbWVudSBtb3Rpb24gZG9lcyBub3QgcmV0YWluIGEgY29udGFpbmluZyBibG9jayBmb3Igc3VibWVudXMgKCMzMjYyNDgpJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRhaW5lciA9ICQoJy5jb250YWluZXInKTtcblx0XHRjb250YWluZXIuY2xhc3NMaXN0LmFkZCgnc3R5bGUtb3ZlcnJpZGUnLCAnbW9uYWNvLWVuYWJsZS1tb3Rpb24nKTtcblx0XHRkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKGNvbnRhaW5lcik7XG5cblx0XHRjb25zdCBzdXJmYWNlID0gJCgnLm1vbmFjby1zY3JvbGxhYmxlLWVsZW1lbnQnKTtcblx0XHRjb25zdCBjb250ZXh0VmlldyA9IG5ldyBDb250ZXh0Vmlldyhjb250YWluZXIsIENvbnRleHRWaWV3RE9NUG9zaXRpb24uQUJTT0xVVEUpO1xuXHRcdGNvbnRleHRWaWV3LnNob3coe1xuXHRcdFx0Z2V0QW5jaG9yOiAoKSA9PiAoeyB4OiAwLCB5OiAwIH0pLFxuXHRcdFx0cmVuZGVyOiB2aWV3ID0+IHtcblx0XHRcdFx0dmlldy5hcHBlbmRDaGlsZChzdXJmYWNlKTtcblx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0Y29udGV4dFZpZXcuZ2V0Vmlld0VsZW1lbnQoKS5jbGFzc0xpc3QuYWRkKENPTlRFWFRfVklFV19NRU5VX01PVElPTl9DTEFTUyk7XG5cblx0XHRjb25zdCBzdHlsZSA9IGdldFdpbmRvdyhzdXJmYWNlKS5nZXRDb21wdXRlZFN0eWxlKHN1cmZhY2UpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0YW5pbWF0aW9uRmlsbE1vZGU6IHN0eWxlLmFuaW1hdGlvbkZpbGxNb2RlLFxuXHRcdFx0d2lsbENoYW5nZTogc3R5bGUud2lsbENoYW5nZVxuXHRcdH0sIHtcblx0XHRcdGFuaW1hdGlvbkZpbGxNb2RlOiAnYmFja3dhcmRzJyxcblx0XHRcdHdpbGxDaGFuZ2U6ICdvcGFjaXR5J1xuXHRcdH0pO1xuXG5cdFx0Y29udGV4dFZpZXcuZGlzcG9zZSgpO1xuXHRcdGNvbnRhaW5lci5yZW1vdmUoKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBw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
