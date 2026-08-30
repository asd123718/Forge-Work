import assert from "assert";
import { $, h, trackAttributes, copyAttributes, disposableWindowInterval, getWindows, getWindowsCount, getWindowId, getWindowById, hasWindow, getWindow, getDocument, isHTMLElement, SafeTriangle, AnimationFrameScheduler, DisposableResizeObserver, getRecentDisposableResizeObserverContextForLoopError, findParentWithClass, hasParentWithClass } from "../../browser/dom.js";
import { asCssValueWithDefault } from "../../../base/browser/cssValue.js";
import { ensureCodeWindow, isAuxiliaryWindow, mainWindow } from "../../browser/window.js";
import { DeferredPromise, timeout } from "../../common/async.js";
import { errorHandler, setUnexpectedErrorHandler } from "../../common/errors.js";
import { runWithFakedTimers } from "../common/timeTravelScheduler.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../common/utils.js";
suite("dom", () => {
  test("hasClass", () => {
    const element = document.createElement("div");
    element.className = "foobar boo far";
    assert(element.classList.contains("foobar"));
    assert(element.classList.contains("boo"));
    assert(element.classList.contains("far"));
    assert(!element.classList.contains("bar"));
    assert(!element.classList.contains("foo"));
    assert(!element.classList.contains(""));
  });
  test("findParentWithClass supports multiple required classes", () => {
    const root = $("div.modern-ui.motion-enabled");
    const intermediate = $("div.modern-ui");
    const child = $("div");
    root.appendChild(intermediate).appendChild(child);
    assert.deepStrictEqual({
      multipleClasses: findParentWithClass(child, ["modern-ui", "motion-enabled"]) === root,
      singleClass: findParentWithClass(child, "modern-ui") === intermediate,
      missingClass: hasParentWithClass(child, ["modern-ui", "missing"]),
      stoppedBeforeMatch: hasParentWithClass(child, ["modern-ui", "motion-enabled"], intermediate)
    }, {
      multipleClasses: true,
      singleClass: true,
      missingClass: false,
      stoppedBeforeMatch: false
    });
  });
  test("removeClass", () => {
    let element = document.createElement("div");
    element.className = "foobar boo far";
    element.classList.remove("boo");
    assert(element.classList.contains("far"));
    assert(!element.classList.contains("boo"));
    assert(element.classList.contains("foobar"));
    assert.strictEqual(element.className, "foobar far");
    element = document.createElement("div");
    element.className = "foobar boo far";
    element.classList.remove("far");
    assert(!element.classList.contains("far"));
    assert(element.classList.contains("boo"));
    assert(element.classList.contains("foobar"));
    assert.strictEqual(element.className, "foobar boo");
    element.classList.remove("boo");
    assert(!element.classList.contains("far"));
    assert(!element.classList.contains("boo"));
    assert(element.classList.contains("foobar"));
    assert.strictEqual(element.className, "foobar");
    element.classList.remove("foobar");
    assert(!element.classList.contains("far"));
    assert(!element.classList.contains("boo"));
    assert(!element.classList.contains("foobar"));
    assert.strictEqual(element.className, "");
  });
  test("removeClass should consider hyphens", function() {
    const element = document.createElement("div");
    element.classList.add("foo-bar");
    element.classList.add("bar");
    assert(element.classList.contains("foo-bar"));
    assert(element.classList.contains("bar"));
    element.classList.remove("bar");
    assert(element.classList.contains("foo-bar"));
    assert(!element.classList.contains("bar"));
    element.classList.remove("foo-bar");
    assert(!element.classList.contains("foo-bar"));
    assert(!element.classList.contains("bar"));
  });
  suite("$", () => {
    test("should build simple nodes", () => {
      const div = $("div");
      assert(div);
      assert(isHTMLElement(div));
      assert.strictEqual(div.tagName, "DIV");
      assert(!div.firstChild);
    });
    test("should build nodes with id", () => {
      const div = $("div#foo");
      assert(div);
      assert(isHTMLElement(div));
      assert.strictEqual(div.tagName, "DIV");
      assert.strictEqual(div.id, "foo");
    });
    test("should build nodes with class-name", () => {
      const div = $("div.foo");
      assert(div);
      assert(isHTMLElement(div));
      assert.strictEqual(div.tagName, "DIV");
      assert.strictEqual(div.className, "foo");
    });
    test("should build nodes with attributes", () => {
      let div = $("div", { class: "test" });
      assert.strictEqual(div.className, "test");
      div = $("div", void 0);
      assert.strictEqual(div.className, "");
    });
    test("should build nodes with children", () => {
      let div = $("div", void 0, $("span", { id: "demospan" }));
      const firstChild = div.firstChild;
      assert.strictEqual(firstChild.tagName, "SPAN");
      assert.strictEqual(firstChild.id, "demospan");
      div = $("div", void 0, "hello");
      assert.strictEqual(div.firstChild && div.firstChild.textContent, "hello");
    });
    test("should build nodes with text children", () => {
      const div = $("div", void 0, "foobar");
      const firstChild = div.firstChild;
      assert.strictEqual(firstChild.tagName, void 0);
      assert.strictEqual(firstChild.textContent, "foobar");
    });
  });
  suite("h", () => {
    test("should build simple nodes", () => {
      const div = h("div");
      assert(isHTMLElement(div.root));
      assert.strictEqual(div.root.tagName, "DIV");
      const span = h("span");
      assert(isHTMLElement(span.root));
      assert.strictEqual(span.root.tagName, "SPAN");
      const img = h("img");
      assert(isHTMLElement(img.root));
      assert.strictEqual(img.root.tagName, "IMG");
    });
    test("should handle ids and classes", () => {
      const divId = h("div#myid");
      assert.strictEqual(divId.root.tagName, "DIV");
      assert.strictEqual(divId.root.id, "myid");
      const divClass = h("div.a");
      assert.strictEqual(divClass.root.tagName, "DIV");
      assert.strictEqual(divClass.root.classList.length, 1);
      assert(divClass.root.classList.contains("a"));
      const divClasses = h("div.a.b.c");
      assert.strictEqual(divClasses.root.tagName, "DIV");
      assert.strictEqual(divClasses.root.classList.length, 3);
      assert(divClasses.root.classList.contains("a"));
      assert(divClasses.root.classList.contains("b"));
      assert(divClasses.root.classList.contains("c"));
      const divAll = h("div#myid.a.b.c");
      assert.strictEqual(divAll.root.tagName, "DIV");
      assert.strictEqual(divAll.root.id, "myid");
      assert.strictEqual(divAll.root.classList.length, 3);
      assert(divAll.root.classList.contains("a"));
      assert(divAll.root.classList.contains("b"));
      assert(divAll.root.classList.contains("c"));
      const spanId = h("span#myid");
      assert.strictEqual(spanId.root.tagName, "SPAN");
      assert.strictEqual(spanId.root.id, "myid");
      const spanClass = h("span.a");
      assert.strictEqual(spanClass.root.tagName, "SPAN");
      assert.strictEqual(spanClass.root.classList.length, 1);
      assert(spanClass.root.classList.contains("a"));
      const spanClasses = h("span.a.b.c");
      assert.strictEqual(spanClasses.root.tagName, "SPAN");
      assert.strictEqual(spanClasses.root.classList.length, 3);
      assert(spanClasses.root.classList.contains("a"));
      assert(spanClasses.root.classList.contains("b"));
      assert(spanClasses.root.classList.contains("c"));
      const spanAll = h("span#myid.a.b.c");
      assert.strictEqual(spanAll.root.tagName, "SPAN");
      assert.strictEqual(spanAll.root.id, "myid");
      assert.strictEqual(spanAll.root.classList.length, 3);
      assert(spanAll.root.classList.contains("a"));
      assert(spanAll.root.classList.contains("b"));
      assert(spanAll.root.classList.contains("c"));
    });
    test("should implicitly handle ids and classes", () => {
      const divId = h("#myid");
      assert.strictEqual(divId.root.tagName, "DIV");
      assert.strictEqual(divId.root.id, "myid");
      const divClass = h(".a");
      assert.strictEqual(divClass.root.tagName, "DIV");
      assert.strictEqual(divClass.root.classList.length, 1);
      assert(divClass.root.classList.contains("a"));
      const divClasses = h(".a.b.c");
      assert.strictEqual(divClasses.root.tagName, "DIV");
      assert.strictEqual(divClasses.root.classList.length, 3);
      assert(divClasses.root.classList.contains("a"));
      assert(divClasses.root.classList.contains("b"));
      assert(divClasses.root.classList.contains("c"));
      const divAll = h("#myid.a.b.c");
      assert.strictEqual(divAll.root.tagName, "DIV");
      assert.strictEqual(divAll.root.id, "myid");
      assert.strictEqual(divAll.root.classList.length, 3);
      assert(divAll.root.classList.contains("a"));
      assert(divAll.root.classList.contains("b"));
      assert(divAll.root.classList.contains("c"));
    });
    test("should handle @ identifiers", () => {
      const implicit = h("@el");
      assert.strictEqual(implicit.root, implicit.el);
      assert.strictEqual(implicit.el.tagName, "DIV");
      const explicit = h("div@el");
      assert.strictEqual(explicit.root, explicit.el);
      assert.strictEqual(explicit.el.tagName, "DIV");
      const implicitId = h("#myid@el");
      assert.strictEqual(implicitId.root, implicitId.el);
      assert.strictEqual(implicitId.el.tagName, "DIV");
      assert.strictEqual(implicitId.root.id, "myid");
      const explicitId = h("div#myid@el");
      assert.strictEqual(explicitId.root, explicitId.el);
      assert.strictEqual(explicitId.el.tagName, "DIV");
      assert.strictEqual(explicitId.root.id, "myid");
      const implicitClass = h(".a@el");
      assert.strictEqual(implicitClass.root, implicitClass.el);
      assert.strictEqual(implicitClass.el.tagName, "DIV");
      assert.strictEqual(implicitClass.root.classList.length, 1);
      assert(implicitClass.root.classList.contains("a"));
      const explicitClass = h("div.a@el");
      assert.strictEqual(explicitClass.root, explicitClass.el);
      assert.strictEqual(explicitClass.el.tagName, "DIV");
      assert.strictEqual(explicitClass.root.classList.length, 1);
      assert(explicitClass.root.classList.contains("a"));
    });
  });
  test("should recurse", () => {
    const result = h("div.code-view", [
      h("div.title@title"),
      h("div.container", [
        h("div.gutter@gutterDiv"),
        h("span@editor")
      ])
    ]);
    assert.strictEqual(result.root.tagName, "DIV");
    assert.strictEqual(result.root.className, "code-view");
    assert.strictEqual(result.root.childElementCount, 2);
    assert.strictEqual(result.root.firstElementChild, result.title);
    assert.strictEqual(result.title.tagName, "DIV");
    assert.strictEqual(result.title.className, "title");
    assert.strictEqual(result.title.childElementCount, 0);
    assert.strictEqual(result.gutterDiv.tagName, "DIV");
    assert.strictEqual(result.gutterDiv.className, "gutter");
    assert.strictEqual(result.gutterDiv.childElementCount, 0);
    assert.strictEqual(result.editor.tagName, "SPAN");
    assert.strictEqual(result.editor.className, "");
    assert.strictEqual(result.editor.childElementCount, 0);
  });
  test("cssValueWithDefault", () => {
    assert.strictEqual(asCssValueWithDefault("red", "blue"), "red");
    assert.strictEqual(asCssValueWithDefault(void 0, "blue"), "blue");
    assert.strictEqual(asCssValueWithDefault("var(--my-var)", "blue"), "var(--my-var, blue)");
    assert.strictEqual(asCssValueWithDefault("var(--my-var, red)", "blue"), "var(--my-var, red)");
    assert.strictEqual(asCssValueWithDefault("var(--my-var, var(--my-var2))", "blue"), "var(--my-var, var(--my-var2, blue))");
  });
  test("copyAttributes", () => {
    const elementSource = document.createElement("div");
    elementSource.setAttribute("foo", "bar");
    elementSource.setAttribute("bar", "foo");
    const elementTarget = document.createElement("div");
    copyAttributes(elementSource, elementTarget);
    assert.strictEqual(elementTarget.getAttribute("foo"), "bar");
    assert.strictEqual(elementTarget.getAttribute("bar"), "foo");
  });
  test("trackAttributes (unfiltered)", async () => {
    return runWithFakedTimers({ useFakeTimers: true }, async () => {
      const elementSource = document.createElement("div");
      const elementTarget = document.createElement("div");
      const disposable = trackAttributes(elementSource, elementTarget);
      elementSource.setAttribute("foo", "bar");
      elementSource.setAttribute("bar", "foo");
      await timeout(1);
      assert.strictEqual(elementTarget.getAttribute("foo"), "bar");
      assert.strictEqual(elementTarget.getAttribute("bar"), "foo");
      disposable.dispose();
    });
  });
  test("trackAttributes (filtered)", async () => {
    return runWithFakedTimers({ useFakeTimers: true }, async () => {
      const elementSource = document.createElement("div");
      const elementTarget = document.createElement("div");
      const disposable = trackAttributes(elementSource, elementTarget, ["foo"]);
      elementSource.setAttribute("foo", "bar");
      elementSource.setAttribute("bar", "foo");
      await timeout(1);
      assert.strictEqual(elementTarget.getAttribute("foo"), "bar");
      assert.strictEqual(elementTarget.getAttribute("bar"), null);
      disposable.dispose();
    });
  });
  test("window utilities", () => {
    const windows = Array.from(getWindows());
    assert.strictEqual(windows.length, 1);
    assert.strictEqual(getWindowsCount(), 1);
    const windowId = getWindowId(mainWindow);
    assert.ok(typeof windowId === "number");
    assert.strictEqual(getWindowById(windowId)?.window, mainWindow);
    assert.strictEqual(getWindowById(void 0, true).window, mainWindow);
    assert.strictEqual(hasWindow(windowId), true);
    assert.strictEqual(isAuxiliaryWindow(mainWindow), false);
    ensureCodeWindow(mainWindow, 1);
    assert.ok(typeof mainWindow.vscodeWindowId === "number");
    const div = document.createElement("div");
    assert.strictEqual(getWindow(div), mainWindow);
    assert.strictEqual(getDocument(div), mainWindow.document);
    const event = document.createEvent("MouseEvent");
    assert.strictEqual(getWindow(event), mainWindow);
    assert.strictEqual(getDocument(event), mainWindow.document);
  });
  suite("disposableWindowInterval", () => {
    test("basics", async () => {
      let count = 0;
      const promise = new DeferredPromise();
      const interval = disposableWindowInterval(mainWindow, () => {
        count++;
        if (count === 3) {
          promise.complete(void 0);
          return true;
        } else {
          return false;
        }
      }, 0, 10);
      await promise.p;
      assert.strictEqual(count, 3);
      interval.dispose();
    });
    test("iterations", async () => {
      let count = 0;
      const interval = disposableWindowInterval(mainWindow, () => {
        count++;
        return false;
      }, 0, 0);
      await timeout(5);
      assert.strictEqual(count, 0);
      interval.dispose();
    });
    test("dispose", async () => {
      let count = 0;
      const interval = disposableWindowInterval(mainWindow, () => {
        count++;
        return false;
      }, 0, 10);
      interval.dispose();
      await timeout(5);
      assert.strictEqual(count, 0);
    });
  });
  suite("SafeTriangle", () => {
    const fakeElement = (left, right, top, bottom) => {
      return { getBoundingClientRect: () => ({ left, right, top, bottom }) };
    };
    test("works", () => {
      const safeTriangle = new SafeTriangle(0, 0, fakeElement(10, 20, 10, 20));
      assert.strictEqual(safeTriangle.contains(5, 5), true);
      assert.strictEqual(safeTriangle.contains(15, 5), false);
      assert.strictEqual(safeTriangle.contains(25, 5), false);
      assert.strictEqual(safeTriangle.contains(5, 15), false);
      assert.strictEqual(safeTriangle.contains(15, 15), true);
      assert.strictEqual(safeTriangle.contains(25, 15), false);
      assert.strictEqual(safeTriangle.contains(5, 25), false);
      assert.strictEqual(safeTriangle.contains(15, 25), false);
      assert.strictEqual(safeTriangle.contains(25, 25), false);
    });
    test("other dirations", () => {
      const a = new SafeTriangle(30, 30, fakeElement(10, 20, 10, 20));
      assert.strictEqual(a.contains(25, 25), true);
      const b = new SafeTriangle(0, 30, fakeElement(10, 20, 10, 20));
      assert.strictEqual(b.contains(5, 25), true);
      const c = new SafeTriangle(30, 0, fakeElement(10, 20, 10, 20));
      assert.strictEqual(c.contains(25, 5), true);
    });
  });
  suite("AnimationFrameScheduler", () => {
    const waitForAnimationFrame = () => new Promise((resolve) => mainWindow.requestAnimationFrame(() => resolve()));
    test("schedules and runs the callback", async () => {
      const node = document.createElement("div");
      let callCount = 0;
      const scheduler = new AnimationFrameScheduler(node, () => {
        callCount++;
      });
      assert.strictEqual(scheduler.isScheduled(), false);
      scheduler.schedule();
      assert.strictEqual(scheduler.isScheduled(), true);
      await waitForAnimationFrame();
      assert.strictEqual(callCount, 1);
      assert.strictEqual(scheduler.isScheduled(), false);
      scheduler.dispose();
    });
    test("coalesces multiple schedule calls", async () => {
      const node = document.createElement("div");
      let callCount = 0;
      const scheduler = new AnimationFrameScheduler(node, () => {
        callCount++;
      });
      scheduler.schedule();
      scheduler.schedule();
      scheduler.schedule();
      assert.strictEqual(scheduler.isScheduled(), true);
      await waitForAnimationFrame();
      assert.strictEqual(callCount, 1);
      scheduler.dispose();
    });
    test("cancel prevents execution", async () => {
      const node = document.createElement("div");
      let callCount = 0;
      const scheduler = new AnimationFrameScheduler(node, () => {
        callCount++;
      });
      scheduler.schedule();
      assert.strictEqual(scheduler.isScheduled(), true);
      scheduler.cancel();
      assert.strictEqual(scheduler.isScheduled(), false);
      await waitForAnimationFrame();
      assert.strictEqual(callCount, 0);
      scheduler.dispose();
    });
    test("dispose prevents execution", async () => {
      const node = document.createElement("div");
      let callCount = 0;
      const scheduler = new AnimationFrameScheduler(node, () => {
        callCount++;
      });
      scheduler.schedule();
      scheduler.dispose();
      await waitForAnimationFrame();
      assert.strictEqual(callCount, 0);
    });
    test("can schedule again after execution", async () => {
      const node = document.createElement("div");
      let callCount = 0;
      const scheduler = new AnimationFrameScheduler(node, () => {
        callCount++;
      });
      scheduler.schedule();
      await waitForAnimationFrame();
      assert.strictEqual(callCount, 1);
      scheduler.schedule();
      await waitForAnimationFrame();
      assert.strictEqual(callCount, 2);
      scheduler.dispose();
    });
  });
  suite("DisposableResizeObserver", () => {
    teardown(() => new Promise((resolve) => mainWindow.requestAnimationFrame(() => resolve())));
    function createFakeResizeObserverCtor() {
      const handle = {
        ctor: void 0,
        fire: () => {
          throw new Error("observer not constructed");
        },
        disconnects: 0
      };
      class FakeResizeObserver {
        constructor(callback) {
          handle.fire = (entries) => callback(entries, this);
        }
        observe(_target, _options) {
        }
        unobserve(_target) {
        }
        disconnect() {
          handle.disconnects++;
        }
      }
      handle.ctor = FakeResizeObserver;
      return handle;
    }
    function fakeEntry(target = document.createElement("div")) {
      const size = { blockSize: 0, inlineSize: 0 };
      return {
        target,
        contentRect: target.getBoundingClientRect(),
        borderBoxSize: [size],
        contentBoxSize: [size],
        devicePixelContentBoxSize: [size]
      };
    }
    test("callback runs synchronously with the entries the browser delivered", () => {
      const fake = createFakeResizeObserverCtor();
      let calls = 0;
      let received;
      const observer = new DisposableResizeObserver("test.sync", (entries) => {
        calls++;
        received = entries;
      }, mainWindow, { resizeObserverCtor: fake.ctor });
      const a = fakeEntry();
      const b = fakeEntry();
      fake.fire([a, b]);
      assert.strictEqual(calls, 1, "callback runs synchronously inside the resize-observation phase");
      assert.deepStrictEqual(received, [a, b], "entries are forwarded as-is");
      observer.dispose();
    });
    test("each native delivery invokes the callback once (no batching)", () => {
      const fake = createFakeResizeObserverCtor();
      let calls = 0;
      const observer = new DisposableResizeObserver("test.noBatch", () => {
        calls++;
      }, mainWindow, { resizeObserverCtor: fake.ctor });
      fake.fire([fakeEntry()]);
      fake.fire([fakeEntry()]);
      assert.strictEqual(calls, 2, "wrapper does not coalesce deliveries");
      observer.dispose();
    });
    test("dispose disconnects the underlying observer", () => {
      const fake = createFakeResizeObserverCtor();
      const observer = new DisposableResizeObserver("test.dispose", () => {
      }, mainWindow, { resizeObserverCtor: fake.ctor });
      observer.dispose();
      assert.strictEqual(fake.disconnects, 1);
    });
    test("exceptions in the user callback do not propagate", () => {
      const fake = createFakeResizeObserverCtor();
      const observer = new DisposableResizeObserver("test.throw", () => {
        throw new Error("boom");
      }, mainWindow, { resizeObserverCtor: fake.ctor });
      const originalErrorHandler = errorHandler.getUnexpectedErrorHandler();
      setUnexpectedErrorHandler(() => {
      });
      try {
        assert.doesNotThrow(() => fake.fire([fakeEntry()]));
      } finally {
        setUnexpectedErrorHandler(originalErrorHandler);
      }
      observer.dispose();
    });
    test("exposes the configured name for loop-warning context", () => {
      const fake = createFakeResizeObserverCtor();
      const observer = new DisposableResizeObserver(
        "my-observer",
        () => {
        },
        mainWindow,
        { resizeObserverCtor: fake.ctor }
      );
      assert.strictEqual(observer.name, "my-observer");
      observer.dispose();
    });
    test("getRecentDisposableResizeObserverContextForLoopError returns undefined for unrelated messages", () => {
      assert.strictEqual(getRecentDisposableResizeObserverContextForLoopError(void 0), void 0);
      assert.strictEqual(getRecentDisposableResizeObserverContextForLoopError("Uncaught TypeError: foo"), void 0);
    });
    test("getRecentDisposableResizeObserverContextForLoopError returns sorted unique wrapped observers from the current frame", () => {
      const fake = createFakeResizeObserverCtor();
      const a = new DisposableResizeObserver("a", () => {
      }, mainWindow, { resizeObserverCtor: fake.ctor });
      fake.fire([fakeEntry()]);
      const fakeB = createFakeResizeObserverCtor();
      const b = new DisposableResizeObserver("b", () => {
      }, mainWindow, { resizeObserverCtor: fakeB.ctor });
      fakeB.fire([fakeEntry()]);
      fake.fire([fakeEntry()]);
      const context = getRecentDisposableResizeObserverContextForLoopError(
        "ResizeObserver loop completed with undelivered notifications."
      );
      assert.strictEqual(
        context,
        "[ResizeObserverLoopContext(a,b)] ResizeObserver loop completed with undelivered notifications."
      );
      a.dispose();
      b.dispose();
    });
    test("getRecentDisposableResizeObserverContextForLoopError marks bounded participant overflow", () => {
      const observers = [];
      for (let i = 8; i >= 0; i--) {
        const fake = createFakeResizeObserverCtor();
        observers.push(new DisposableResizeObserver(`observer-${i}`, () => {
        }, mainWindow, { resizeObserverCtor: fake.ctor }));
        fake.fire([fakeEntry()]);
      }
      assert.strictEqual(
        getRecentDisposableResizeObserverContextForLoopError("ResizeObserver loop completed with undelivered notifications."),
        "[ResizeObserverLoopContext(observer-0,observer-1,observer-2,observer-3,observer-4,observer-5,observer-6,observer-7,<overflow>)] ResizeObserver loop completed with undelivered notifications."
      );
      observers.forEach((observer) => observer.dispose());
    });
    test("getRecentDisposableResizeObserverContextForLoopError is scoped to the observer window", async () => {
      const iframe = document.createElement("iframe");
      document.body.appendChild(iframe);
      const auxiliaryWindow = iframe.contentWindow;
      ensureCodeWindow(auxiliaryWindow, 999);
      const fake = createFakeResizeObserverCtor();
      const observer = new DisposableResizeObserver("auxiliary", () => {
      }, auxiliaryWindow, { resizeObserverCtor: fake.ctor });
      fake.fire([fakeEntry()]);
      assert.strictEqual(
        getRecentDisposableResizeObserverContextForLoopError("ResizeObserver loop completed with undelivered notifications.", mainWindow),
        void 0
      );
      assert.strictEqual(
        getRecentDisposableResizeObserverContextForLoopError("ResizeObserver loop completed with undelivered notifications.", auxiliaryWindow),
        "[ResizeObserverLoopContext(auxiliary)] ResizeObserver loop completed with undelivered notifications."
      );
      observer.dispose();
      await new Promise((resolve) => auxiliaryWindow.requestAnimationFrame(() => resolve()));
      iframe.remove();
    });
    test("getRecentDisposableResizeObserverContextForLoopError clears at the next animation frame", async () => {
      const fake = createFakeResizeObserverCtor();
      const observer = new DisposableResizeObserver("scoped", () => {
      }, mainWindow, { resizeObserverCtor: fake.ctor });
      fake.fire([fakeEntry()]);
      await Promise.resolve();
      assert.ok(getRecentDisposableResizeObserverContextForLoopError("ResizeObserver loop completed with undelivered notifications."));
      await new Promise((resolve) => mainWindow.requestAnimationFrame(() => resolve()));
      assert.strictEqual(
        getRecentDisposableResizeObserverContextForLoopError("ResizeObserver loop completed with undelivered notifications."),
        void 0,
        "context must be cleared at the next frame so a later rendering update does not inherit stale observers"
      );
      observer.dispose();
    });
  });
  ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFx0ZXN0XFxicm93c2VyXFxkb20udGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7ICQsIGgsIHRyYWNrQXR0cmlidXRlcywgY29weUF0dHJpYnV0ZXMsIGRpc3Bvc2FibGVXaW5kb3dJbnRlcnZhbCwgZ2V0V2luZG93cywgZ2V0V2luZG93c0NvdW50LCBnZXRXaW5kb3dJZCwgZ2V0V2luZG93QnlJZCwgaGFzV2luZG93LCBnZXRXaW5kb3csIGdldERvY3VtZW50LCBpc0hUTUxFbGVtZW50LCBTYWZlVHJpYW5nbGUsIEFuaW1hdGlvbkZyYW1lU2NoZWR1bGVyLCBEaXNwb3NhYmxlUmVzaXplT2JzZXJ2ZXIsIGdldFJlY2VudERpc3Bvc2FibGVSZXNpemVPYnNlcnZlckNvbnRleHRGb3JMb29wRXJyb3IsIGZpbmRQYXJlbnRXaXRoQ2xhc3MsIGhhc1BhcmVudFdpdGhDbGFzcyB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IGFzQ3NzVmFsdWVXaXRoRGVmYXVsdCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9jc3NWYWx1ZS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVDb2RlV2luZG93LCBpc0F1eGlsaWFyeVdpbmRvdywgbWFpbldpbmRvdyB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvd2luZG93LmpzJztcbmltcG9ydCB7IERlZmVycmVkUHJvbWlzZSwgdGltZW91dCB9IGZyb20gJy4uLy4uL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBlcnJvckhhbmRsZXIsIHNldFVuZXhwZWN0ZWRFcnJvckhhbmRsZXIgfSBmcm9tICcuLi8uLi9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IHJ1bldpdGhGYWtlZFRpbWVycyB9IGZyb20gJy4uL2NvbW1vbi90aW1lVHJhdmVsU2NoZWR1bGVyLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uL2NvbW1vbi91dGlscy5qcyc7XG5cbnN1aXRlKCdkb20nLCAoKSA9PiB7XG5cdHRlc3QoJ2hhc0NsYXNzJywgKCkgPT4ge1xuXG5cdFx0Y29uc3QgZWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdGVsZW1lbnQuY2xhc3NOYW1lID0gJ2Zvb2JhciBib28gZmFyJztcblxuXHRcdGFzc2VydChlbGVtZW50LmNsYXNzTGlzdC5jb250YWlucygnZm9vYmFyJykpO1xuXHRcdGFzc2VydChlbGVtZW50LmNsYXNzTGlzdC5jb250YWlucygnYm9vJykpO1xuXHRcdGFzc2VydChlbGVtZW50LmNsYXNzTGlzdC5jb250YWlucygnZmFyJykpO1xuXHRcdGFzc2VydCghZWxlbWVudC5jbGFzc0xpc3QuY29udGFpbnMoJ2JhcicpKTtcblx0XHRhc3NlcnQoIWVsZW1lbnQuY2xhc3NMaXN0LmNvbnRhaW5zKCdmb28nKSk7XG5cdFx0YXNzZXJ0KCFlbGVtZW50LmNsYXNzTGlzdC5jb250YWlucygnJykpO1xuXHR9KTtcblxuXHR0ZXN0KCdmaW5kUGFyZW50V2l0aENsYXNzIHN1cHBvcnRzIG11bHRpcGxlIHJlcXVpcmVkIGNsYXNzZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgcm9vdCA9ICQoJ2Rpdi5tb2Rlcm4tdWkubW90aW9uLWVuYWJsZWQnKTtcblx0XHRjb25zdCBpbnRlcm1lZGlhdGUgPSAkKCdkaXYubW9kZXJuLXVpJyk7XG5cdFx0Y29uc3QgY2hpbGQgPSAkKCdkaXYnKTtcblx0XHRyb290LmFwcGVuZENoaWxkKGludGVybWVkaWF0ZSkuYXBwZW5kQ2hpbGQoY2hpbGQpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRtdWx0aXBsZUNsYXNzZXM6IGZpbmRQYXJlbnRXaXRoQ2xhc3MoY2hpbGQsIFsnbW9kZXJuLXVpJywgJ21vdGlvbi1lbmFibGVkJ10pID09PSByb290LFxuXHRcdFx0c2luZ2xlQ2xhc3M6IGZpbmRQYXJlbnRXaXRoQ2xhc3MoY2hpbGQsICdtb2Rlcm4tdWknKSA9PT0gaW50ZXJtZWRpYXRlLFxuXHRcdFx0bWlzc2luZ0NsYXNzOiBoYXNQYXJlbnRXaXRoQ2xhc3MoY2hpbGQsIFsnbW9kZXJuLXVpJywgJ21pc3NpbmcnXSksXG5cdFx0XHRzdG9wcGVkQmVmb3JlTWF0Y2g6IGhhc1BhcmVudFdpdGhDbGFzcyhjaGlsZCwgWydtb2Rlcm4tdWknLCAnbW90aW9uLWVuYWJsZWQnXSwgaW50ZXJtZWRpYXRlKSxcblx0XHR9LCB7XG5cdFx0XHRtdWx0aXBsZUNsYXNzZXM6IHRydWUsXG5cdFx0XHRzaW5nbGVDbGFzczogdHJ1ZSxcblx0XHRcdG1pc3NpbmdDbGFzczogZmFsc2UsXG5cdFx0XHRzdG9wcGVkQmVmb3JlTWF0Y2g6IGZhbHNlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZW1vdmVDbGFzcycsICgpID0+IHtcblxuXHRcdGxldCBlbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0ZWxlbWVudC5jbGFzc05hbWUgPSAnZm9vYmFyIGJvbyBmYXInO1xuXG5cdFx0ZWxlbWVudC5jbGFzc0xpc3QucmVtb3ZlKCdib28nKTtcblx0XHRhc3NlcnQoZWxlbWVudC5jbGFzc0xpc3QuY29udGFpbnMoJ2ZhcicpKTtcblx0XHRhc3NlcnQoIWVsZW1lbnQuY2xhc3NMaXN0LmNvbnRhaW5zKCdib28nKSk7XG5cdFx0YXNzZXJ0KGVsZW1lbnQuY2xhc3NMaXN0LmNvbnRhaW5zKCdmb29iYXInKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVsZW1lbnQuY2xhc3NOYW1lLCAnZm9vYmFyIGZhcicpO1xuXG5cdFx0ZWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdGVsZW1lbnQuY2xhc3NOYW1lID0gJ2Zvb2JhciBib28gZmFyJztcblxuXHRcdGVsZW1lbnQuY2xhc3NMaXN0LnJlbW92ZSgnZmFyJyk7XG5cdFx0YXNzZXJ0KCFlbGVtZW50LmNsYXNzTGlzdC5jb250YWlucygnZmFyJykpO1xuXHRcdGFzc2VydChlbGVtZW50LmNsYXNzTGlzdC5jb250YWlucygnYm9vJykpO1xuXHRcdGFzc2VydChlbGVtZW50LmNsYXNzTGlzdC5jb250YWlucygnZm9vYmFyJykpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbGVtZW50LmNsYXNzTmFtZSwgJ2Zvb2JhciBib28nKTtcblxuXHRcdGVsZW1lbnQuY2xhc3NMaXN0LnJlbW92ZSgnYm9vJyk7XG5cdFx0YXNzZXJ0KCFlbGVtZW50LmNsYXNzTGlzdC5jb250YWlucygnZmFyJykpO1xuXHRcdGFzc2VydCghZWxlbWVudC5jbGFzc0xpc3QuY29udGFpbnMoJ2JvbycpKTtcblx0XHRhc3NlcnQoZWxlbWVudC5jbGFzc0xpc3QuY29udGFpbnMoJ2Zvb2JhcicpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWxlbWVudC5jbGFzc05hbWUsICdmb29iYXInKTtcblxuXHRcdGVsZW1lbnQuY2xhc3NMaXN0LnJlbW92ZSgnZm9vYmFyJyk7XG5cdFx0YXNzZXJ0KCFlbGVtZW50LmNsYXNzTGlzdC5jb250YWlucygnZmFyJykpO1xuXHRcdGFzc2VydCghZWxlbWVudC5jbGFzc0xpc3QuY29udGFpbnMoJ2JvbycpKTtcblx0XHRhc3NlcnQoIWVsZW1lbnQuY2xhc3NMaXN0LmNvbnRhaW5zKCdmb29iYXInKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVsZW1lbnQuY2xhc3NOYW1lLCAnJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlbW92ZUNsYXNzIHNob3VsZCBjb25zaWRlciBoeXBoZW5zJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IGVsZW1lbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblxuXHRcdGVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnZm9vLWJhcicpO1xuXHRcdGVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnYmFyJyk7XG5cblx0XHRhc3NlcnQoZWxlbWVudC5jbGFzc0xpc3QuY29udGFpbnMoJ2Zvby1iYXInKSk7XG5cdFx0YXNzZXJ0KGVsZW1lbnQuY2xhc3NMaXN0LmNvbnRhaW5zKCdiYXInKSk7XG5cblx0XHRlbGVtZW50LmNsYXNzTGlzdC5yZW1vdmUoJ2JhcicpO1xuXHRcdGFzc2VydChlbGVtZW50LmNsYXNzTGlzdC5jb250YWlucygnZm9vLWJhcicpKTtcblx0XHRhc3NlcnQoIWVsZW1lbnQuY2xhc3NMaXN0LmNvbnRhaW5zKCdiYXInKSk7XG5cblx0XHRlbGVtZW50LmNsYXNzTGlzdC5yZW1vdmUoJ2Zvby1iYXInKTtcblx0XHRhc3NlcnQoIWVsZW1lbnQuY2xhc3NMaXN0LmNvbnRhaW5zKCdmb28tYmFyJykpO1xuXHRcdGFzc2VydCghZWxlbWVudC5jbGFzc0xpc3QuY29udGFpbnMoJ2JhcicpKTtcblx0fSk7XG5cblx0c3VpdGUoJyQnLCAoKSA9PiB7XG5cdFx0dGVzdCgnc2hvdWxkIGJ1aWxkIHNpbXBsZSBub2RlcycsICgpID0+IHtcblx0XHRcdGNvbnN0IGRpdiA9ICQoJ2RpdicpO1xuXHRcdFx0YXNzZXJ0KGRpdik7XG5cdFx0XHRhc3NlcnQoaXNIVE1MRWxlbWVudChkaXYpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaXYudGFnTmFtZSwgJ0RJVicpO1xuXHRcdFx0YXNzZXJ0KCFkaXYuZmlyc3RDaGlsZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgYnVpbGQgbm9kZXMgd2l0aCBpZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGRpdiA9ICQoJ2RpdiNmb28nKTtcblx0XHRcdGFzc2VydChkaXYpO1xuXHRcdFx0YXNzZXJ0KGlzSFRNTEVsZW1lbnQoZGl2KSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGl2LnRhZ05hbWUsICdESVYnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaXYuaWQsICdmb28nKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBidWlsZCBub2RlcyB3aXRoIGNsYXNzLW5hbWUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBkaXYgPSAkKCdkaXYuZm9vJyk7XG5cdFx0XHRhc3NlcnQoZGl2KTtcblx0XHRcdGFzc2VydChpc0hUTUxFbGVtZW50KGRpdikpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpdi50YWdOYW1lLCAnRElWJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGl2LmNsYXNzTmFtZSwgJ2ZvbycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGJ1aWxkIG5vZGVzIHdpdGggYXR0cmlidXRlcycsICgpID0+IHtcblx0XHRcdGxldCBkaXYgPSAkKCdkaXYnLCB7IGNsYXNzOiAndGVzdCcgfSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGl2LmNsYXNzTmFtZSwgJ3Rlc3QnKTtcblxuXHRcdFx0ZGl2ID0gJCgnZGl2JywgdW5kZWZpbmVkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaXYuY2xhc3NOYW1lLCAnJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgYnVpbGQgbm9kZXMgd2l0aCBjaGlsZHJlbicsICgpID0+IHtcblx0XHRcdGxldCBkaXYgPSAkKCdkaXYnLCB1bmRlZmluZWQsICQoJ3NwYW4nLCB7IGlkOiAnZGVtb3NwYW4nIH0pKTtcblx0XHRcdGNvbnN0IGZpcnN0Q2hpbGQgPSBkaXYuZmlyc3RDaGlsZCBhcyBIVE1MRWxlbWVudDtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJzdENoaWxkLnRhZ05hbWUsICdTUEFOJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyc3RDaGlsZC5pZCwgJ2RlbW9zcGFuJyk7XG5cblx0XHRcdGRpdiA9ICQoJ2RpdicsIHVuZGVmaW5lZCwgJ2hlbGxvJyk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaXYuZmlyc3RDaGlsZCAmJiBkaXYuZmlyc3RDaGlsZC50ZXh0Q29udGVudCwgJ2hlbGxvJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgYnVpbGQgbm9kZXMgd2l0aCB0ZXh0IGNoaWxkcmVuJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZGl2ID0gJCgnZGl2JywgdW5kZWZpbmVkLCAnZm9vYmFyJyk7XG5cdFx0XHRjb25zdCBmaXJzdENoaWxkID0gZGl2LmZpcnN0Q2hpbGQgYXMgSFRNTEVsZW1lbnQ7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyc3RDaGlsZC50YWdOYW1lLCB1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcnN0Q2hpbGQudGV4dENvbnRlbnQsICdmb29iYXInKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2gnLCAoKSA9PiB7XG5cdFx0dGVzdCgnc2hvdWxkIGJ1aWxkIHNpbXBsZSBub2RlcycsICgpID0+IHtcblx0XHRcdGNvbnN0IGRpdiA9IGgoJ2RpdicpO1xuXHRcdFx0YXNzZXJ0KGlzSFRNTEVsZW1lbnQoZGl2LnJvb3QpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaXYucm9vdC50YWdOYW1lLCAnRElWJyk7XG5cblx0XHRcdGNvbnN0IHNwYW4gPSBoKCdzcGFuJyk7XG5cdFx0XHRhc3NlcnQoaXNIVE1MRWxlbWVudChzcGFuLnJvb3QpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzcGFuLnJvb3QudGFnTmFtZSwgJ1NQQU4nKTtcblxuXHRcdFx0Y29uc3QgaW1nID0gaCgnaW1nJyk7XG5cdFx0XHRhc3NlcnQoaXNIVE1MRWxlbWVudChpbWcucm9vdCkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGltZy5yb290LnRhZ05hbWUsICdJTUcnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBoYW5kbGUgaWRzIGFuZCBjbGFzc2VzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZGl2SWQgPSBoKCdkaXYjbXlpZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpdklkLnJvb3QudGFnTmFtZSwgJ0RJVicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpdklkLnJvb3QuaWQsICdteWlkJyk7XG5cblx0XHRcdGNvbnN0IGRpdkNsYXNzID0gaCgnZGl2LmEnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaXZDbGFzcy5yb290LnRhZ05hbWUsICdESVYnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaXZDbGFzcy5yb290LmNsYXNzTGlzdC5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0KGRpdkNsYXNzLnJvb3QuY2xhc3NMaXN0LmNvbnRhaW5zKCdhJykpO1xuXG5cdFx0XHRjb25zdCBkaXZDbGFzc2VzID0gaCgnZGl2LmEuYi5jJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGl2Q2xhc3Nlcy5yb290LnRhZ05hbWUsICdESVYnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaXZDbGFzc2VzLnJvb3QuY2xhc3NMaXN0Lmxlbmd0aCwgMyk7XG5cdFx0XHRhc3NlcnQoZGl2Q2xhc3Nlcy5yb290LmNsYXNzTGlzdC5jb250YWlucygnYScpKTtcblx0XHRcdGFzc2VydChkaXZDbGFzc2VzLnJvb3QuY2xhc3NMaXN0LmNvbnRhaW5zKCdiJykpO1xuXHRcdFx0YXNzZXJ0KGRpdkNsYXNzZXMucm9vdC5jbGFzc0xpc3QuY29udGFpbnMoJ2MnKSk7XG5cblx0XHRcdGNvbnN0IGRpdkFsbCA9IGgoJ2RpdiNteWlkLmEuYi5jJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGl2QWxsLnJvb3QudGFnTmFtZSwgJ0RJVicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpdkFsbC5yb290LmlkLCAnbXlpZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpdkFsbC5yb290LmNsYXNzTGlzdC5sZW5ndGgsIDMpO1xuXHRcdFx0YXNzZXJ0KGRpdkFsbC5yb290LmNsYXNzTGlzdC5jb250YWlucygnYScpKTtcblx0XHRcdGFzc2VydChkaXZBbGwucm9vdC5jbGFzc0xpc3QuY29udGFpbnMoJ2InKSk7XG5cdFx0XHRhc3NlcnQoZGl2QWxsLnJvb3QuY2xhc3NMaXN0LmNvbnRhaW5zKCdjJykpO1xuXG5cdFx0XHRjb25zdCBzcGFuSWQgPSBoKCdzcGFuI215aWQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzcGFuSWQucm9vdC50YWdOYW1lLCAnU1BBTicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNwYW5JZC5yb290LmlkLCAnbXlpZCcpO1xuXG5cdFx0XHRjb25zdCBzcGFuQ2xhc3MgPSBoKCdzcGFuLmEnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzcGFuQ2xhc3Mucm9vdC50YWdOYW1lLCAnU1BBTicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNwYW5DbGFzcy5yb290LmNsYXNzTGlzdC5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0KHNwYW5DbGFzcy5yb290LmNsYXNzTGlzdC5jb250YWlucygnYScpKTtcblxuXHRcdFx0Y29uc3Qgc3BhbkNsYXNzZXMgPSBoKCdzcGFuLmEuYi5jJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3BhbkNsYXNzZXMucm9vdC50YWdOYW1lLCAnU1BBTicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNwYW5DbGFzc2VzLnJvb3QuY2xhc3NMaXN0Lmxlbmd0aCwgMyk7XG5cdFx0XHRhc3NlcnQoc3BhbkNsYXNzZXMucm9vdC5jbGFzc0xpc3QuY29udGFpbnMoJ2EnKSk7XG5cdFx0XHRhc3NlcnQoc3BhbkNsYXNzZXMucm9vdC5jbGFzc0xpc3QuY29udGFpbnMoJ2InKSk7XG5cdFx0XHRhc3NlcnQoc3BhbkNsYXNzZXMucm9vdC5jbGFzc0xpc3QuY29udGFpbnMoJ2MnKSk7XG5cblx0XHRcdGNvbnN0IHNwYW5BbGwgPSBoKCdzcGFuI215aWQuYS5iLmMnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzcGFuQWxsLnJvb3QudGFnTmFtZSwgJ1NQQU4nKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzcGFuQWxsLnJvb3QuaWQsICdteWlkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3BhbkFsbC5yb290LmNsYXNzTGlzdC5sZW5ndGgsIDMpO1xuXHRcdFx0YXNzZXJ0KHNwYW5BbGwucm9vdC5jbGFzc0xpc3QuY29udGFpbnMoJ2EnKSk7XG5cdFx0XHRhc3NlcnQoc3BhbkFsbC5yb290LmNsYXNzTGlzdC5jb250YWlucygnYicpKTtcblx0XHRcdGFzc2VydChzcGFuQWxsLnJvb3QuY2xhc3NMaXN0LmNvbnRhaW5zKCdjJykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGltcGxpY2l0bHkgaGFuZGxlIGlkcyBhbmQgY2xhc3NlcycsICgpID0+IHtcblx0XHRcdGNvbnN0IGRpdklkID0gaCgnI215aWQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaXZJZC5yb290LnRhZ05hbWUsICdESVYnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaXZJZC5yb290LmlkLCAnbXlpZCcpO1xuXG5cdFx0XHRjb25zdCBkaXZDbGFzcyA9IGgoJy5hJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGl2Q2xhc3Mucm9vdC50YWdOYW1lLCAnRElWJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGl2Q2xhc3Mucm9vdC5jbGFzc0xpc3QubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydChkaXZDbGFzcy5yb290LmNsYXNzTGlzdC5jb250YWlucygnYScpKTtcblxuXHRcdFx0Y29uc3QgZGl2Q2xhc3NlcyA9IGgoJy5hLmIuYycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpdkNsYXNzZXMucm9vdC50YWdOYW1lLCAnRElWJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGl2Q2xhc3Nlcy5yb290LmNsYXNzTGlzdC5sZW5ndGgsIDMpO1xuXHRcdFx0YXNzZXJ0KGRpdkNsYXNzZXMucm9vdC5jbGFzc0xpc3QuY29udGFpbnMoJ2EnKSk7XG5cdFx0XHRhc3NlcnQoZGl2Q2xhc3Nlcy5yb290LmNsYXNzTGlzdC5jb250YWlucygnYicpKTtcblx0XHRcdGFzc2VydChkaXZDbGFzc2VzLnJvb3QuY2xhc3NMaXN0LmNvbnRhaW5zKCdjJykpO1xuXG5cdFx0XHRjb25zdCBkaXZBbGwgPSBoKCcjbXlpZC5hLmIuYycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpdkFsbC5yb290LnRhZ05hbWUsICdESVYnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaXZBbGwucm9vdC5pZCwgJ215aWQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaXZBbGwucm9vdC5jbGFzc0xpc3QubGVuZ3RoLCAzKTtcblx0XHRcdGFzc2VydChkaXZBbGwucm9vdC5jbGFzc0xpc3QuY29udGFpbnMoJ2EnKSk7XG5cdFx0XHRhc3NlcnQoZGl2QWxsLnJvb3QuY2xhc3NMaXN0LmNvbnRhaW5zKCdiJykpO1xuXHRcdFx0YXNzZXJ0KGRpdkFsbC5yb290LmNsYXNzTGlzdC5jb250YWlucygnYycpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBoYW5kbGUgQCBpZGVudGlmaWVycycsICgpID0+IHtcblx0XHRcdGNvbnN0IGltcGxpY2l0ID0gaCgnQGVsJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW1wbGljaXQucm9vdCwgaW1wbGljaXQuZWwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGltcGxpY2l0LmVsLnRhZ05hbWUsICdESVYnKTtcblxuXHRcdFx0Y29uc3QgZXhwbGljaXQgPSBoKCdkaXZAZWwnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHBsaWNpdC5yb290LCBleHBsaWNpdC5lbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXhwbGljaXQuZWwudGFnTmFtZSwgJ0RJVicpO1xuXG5cdFx0XHRjb25zdCBpbXBsaWNpdElkID0gaCgnI215aWRAZWwnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbXBsaWNpdElkLnJvb3QsIGltcGxpY2l0SWQuZWwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGltcGxpY2l0SWQuZWwudGFnTmFtZSwgJ0RJVicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGltcGxpY2l0SWQucm9vdC5pZCwgJ215aWQnKTtcblxuXHRcdFx0Y29uc3QgZXhwbGljaXRJZCA9IGgoJ2RpdiNteWlkQGVsJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXhwbGljaXRJZC5yb290LCBleHBsaWNpdElkLmVsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHBsaWNpdElkLmVsLnRhZ05hbWUsICdESVYnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHBsaWNpdElkLnJvb3QuaWQsICdteWlkJyk7XG5cblx0XHRcdGNvbnN0IGltcGxpY2l0Q2xhc3MgPSBoKCcuYUBlbCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGltcGxpY2l0Q2xhc3Mucm9vdCwgaW1wbGljaXRDbGFzcy5lbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW1wbGljaXRDbGFzcy5lbC50YWdOYW1lLCAnRElWJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW1wbGljaXRDbGFzcy5yb290LmNsYXNzTGlzdC5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0KGltcGxpY2l0Q2xhc3Mucm9vdC5jbGFzc0xpc3QuY29udGFpbnMoJ2EnKSk7XG5cblx0XHRcdGNvbnN0IGV4cGxpY2l0Q2xhc3MgPSBoKCdkaXYuYUBlbCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4cGxpY2l0Q2xhc3Mucm9vdCwgZXhwbGljaXRDbGFzcy5lbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXhwbGljaXRDbGFzcy5lbC50YWdOYW1lLCAnRElWJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXhwbGljaXRDbGFzcy5yb290LmNsYXNzTGlzdC5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0KGV4cGxpY2l0Q2xhc3Mucm9vdC5jbGFzc0xpc3QuY29udGFpbnMoJ2EnKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCByZWN1cnNlJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IGgoJ2Rpdi5jb2RlLXZpZXcnLCBbXG5cdFx0XHRoKCdkaXYudGl0bGVAdGl0bGUnKSxcblx0XHRcdGgoJ2Rpdi5jb250YWluZXInLCBbXG5cdFx0XHRcdGgoJ2Rpdi5ndXR0ZXJAZ3V0dGVyRGl2JyksXG5cdFx0XHRcdGgoJ3NwYW5AZWRpdG9yJyksXG5cdFx0XHRdKSxcblx0XHRdKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQucm9vdC50YWdOYW1lLCAnRElWJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5yb290LmNsYXNzTmFtZSwgJ2NvZGUtdmlldycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQucm9vdC5jaGlsZEVsZW1lbnRDb3VudCwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5yb290LmZpcnN0RWxlbWVudENoaWxkLCByZXN1bHQudGl0bGUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQudGl0bGUudGFnTmFtZSwgJ0RJVicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQudGl0bGUuY2xhc3NOYW1lLCAndGl0bGUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnRpdGxlLmNoaWxkRWxlbWVudENvdW50LCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmd1dHRlckRpdi50YWdOYW1lLCAnRElWJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5ndXR0ZXJEaXYuY2xhc3NOYW1lLCAnZ3V0dGVyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5ndXR0ZXJEaXYuY2hpbGRFbGVtZW50Q291bnQsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuZWRpdG9yLnRhZ05hbWUsICdTUEFOJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5lZGl0b3IuY2xhc3NOYW1lLCAnJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5lZGl0b3IuY2hpbGRFbGVtZW50Q291bnQsIDApO1xuXHR9KTtcblxuXHR0ZXN0KCdjc3NWYWx1ZVdpdGhEZWZhdWx0JywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhc0Nzc1ZhbHVlV2l0aERlZmF1bHQoJ3JlZCcsICdibHVlJyksICdyZWQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXNDc3NWYWx1ZVdpdGhEZWZhdWx0KHVuZGVmaW5lZCwgJ2JsdWUnKSwgJ2JsdWUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXNDc3NWYWx1ZVdpdGhEZWZhdWx0KCd2YXIoLS1teS12YXIpJywgJ2JsdWUnKSwgJ3ZhcigtLW15LXZhciwgYmx1ZSknKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXNDc3NWYWx1ZVdpdGhEZWZhdWx0KCd2YXIoLS1teS12YXIsIHJlZCknLCAnYmx1ZScpLCAndmFyKC0tbXktdmFyLCByZWQpJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFzQ3NzVmFsdWVXaXRoRGVmYXVsdCgndmFyKC0tbXktdmFyLCB2YXIoLS1teS12YXIyKSknLCAnYmx1ZScpLCAndmFyKC0tbXktdmFyLCB2YXIoLS1teS12YXIyLCBibHVlKSknKTtcblx0fSk7XG5cblx0dGVzdCgnY29weUF0dHJpYnV0ZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZWxlbWVudFNvdXJjZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdGVsZW1lbnRTb3VyY2Uuc2V0QXR0cmlidXRlKCdmb28nLCAnYmFyJyk7XG5cdFx0ZWxlbWVudFNvdXJjZS5zZXRBdHRyaWJ1dGUoJ2JhcicsICdmb28nKTtcblxuXHRcdGNvbnN0IGVsZW1lbnRUYXJnZXQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRjb3B5QXR0cmlidXRlcyhlbGVtZW50U291cmNlLCBlbGVtZW50VGFyZ2V0KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbGVtZW50VGFyZ2V0LmdldEF0dHJpYnV0ZSgnZm9vJyksICdiYXInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWxlbWVudFRhcmdldC5nZXRBdHRyaWJ1dGUoJ2JhcicpLCAnZm9vJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3RyYWNrQXR0cmlidXRlcyAodW5maWx0ZXJlZCknLCBhc3luYyAoKSA9PiB7XG5cdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZWxlbWVudFNvdXJjZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdFx0Y29uc3QgZWxlbWVudFRhcmdldCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXG5cdFx0XHRjb25zdCBkaXNwb3NhYmxlID0gdHJhY2tBdHRyaWJ1dGVzKGVsZW1lbnRTb3VyY2UsIGVsZW1lbnRUYXJnZXQpO1xuXG5cdFx0XHRlbGVtZW50U291cmNlLnNldEF0dHJpYnV0ZSgnZm9vJywgJ2JhcicpO1xuXHRcdFx0ZWxlbWVudFNvdXJjZS5zZXRBdHRyaWJ1dGUoJ2JhcicsICdmb28nKTtcblxuXHRcdFx0YXdhaXQgdGltZW91dCgxKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVsZW1lbnRUYXJnZXQuZ2V0QXR0cmlidXRlKCdmb28nKSwgJ2JhcicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVsZW1lbnRUYXJnZXQuZ2V0QXR0cmlidXRlKCdiYXInKSwgJ2ZvbycpO1xuXG5cdFx0XHRkaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgndHJhY2tBdHRyaWJ1dGVzIChmaWx0ZXJlZCknLCBhc3luYyAoKSA9PiB7XG5cdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZWxlbWVudFNvdXJjZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdFx0Y29uc3QgZWxlbWVudFRhcmdldCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXG5cdFx0XHRjb25zdCBkaXNwb3NhYmxlID0gdHJhY2tBdHRyaWJ1dGVzKGVsZW1lbnRTb3VyY2UsIGVsZW1lbnRUYXJnZXQsIFsnZm9vJ10pO1xuXG5cdFx0XHRlbGVtZW50U291cmNlLnNldEF0dHJpYnV0ZSgnZm9vJywgJ2JhcicpO1xuXHRcdFx0ZWxlbWVudFNvdXJjZS5zZXRBdHRyaWJ1dGUoJ2JhcicsICdmb28nKTtcblxuXHRcdFx0YXdhaXQgdGltZW91dCgxKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVsZW1lbnRUYXJnZXQuZ2V0QXR0cmlidXRlKCdmb28nKSwgJ2JhcicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVsZW1lbnRUYXJnZXQuZ2V0QXR0cmlidXRlKCdiYXInKSwgbnVsbCk7XG5cblx0XHRcdGRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCd3aW5kb3cgdXRpbGl0aWVzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHdpbmRvd3MgPSBBcnJheS5mcm9tKGdldFdpbmRvd3MoKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdpbmRvd3MubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0V2luZG93c0NvdW50KCksIDEpO1xuXHRcdGNvbnN0IHdpbmRvd0lkID0gZ2V0V2luZG93SWQobWFpbldpbmRvdyk7XG5cdFx0YXNzZXJ0Lm9rKHR5cGVvZiB3aW5kb3dJZCA9PT0gJ251bWJlcicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRXaW5kb3dCeUlkKHdpbmRvd0lkKT8ud2luZG93LCBtYWluV2luZG93KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0V2luZG93QnlJZCh1bmRlZmluZWQsIHRydWUpLndpbmRvdywgbWFpbldpbmRvdyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhhc1dpbmRvdyh3aW5kb3dJZCksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0F1eGlsaWFyeVdpbmRvdyhtYWluV2luZG93KSwgZmFsc2UpO1xuXHRcdGVuc3VyZUNvZGVXaW5kb3cobWFpbldpbmRvdywgMSk7XG5cdFx0YXNzZXJ0Lm9rKHR5cGVvZiBtYWluV2luZG93LnZzY29kZVdpbmRvd0lkID09PSAnbnVtYmVyJyk7XG5cblx0XHRjb25zdCBkaXYgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0V2luZG93KGRpdiksIG1haW5XaW5kb3cpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXREb2N1bWVudChkaXYpLCBtYWluV2luZG93LmRvY3VtZW50KTtcblxuXHRcdGNvbnN0IGV2ZW50ID0gZG9jdW1lbnQuY3JlYXRlRXZlbnQoJ01vdXNlRXZlbnQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0V2luZG93KGV2ZW50KSwgbWFpbldpbmRvdyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldERvY3VtZW50KGV2ZW50KSwgbWFpbldpbmRvdy5kb2N1bWVudCk7XG5cdH0pO1xuXG5cdHN1aXRlKCdkaXNwb3NhYmxlV2luZG93SW50ZXJ2YWwnLCAoKSA9PiB7XG5cdFx0dGVzdCgnYmFzaWNzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0bGV0IGNvdW50ID0gMDtcblx0XHRcdGNvbnN0IHByb21pc2UgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cdFx0XHRjb25zdCBpbnRlcnZhbCA9IGRpc3Bvc2FibGVXaW5kb3dJbnRlcnZhbChtYWluV2luZG93LCAoKSA9PiB7XG5cdFx0XHRcdGNvdW50Kys7XG5cdFx0XHRcdGlmIChjb3VudCA9PT0gMykge1xuXHRcdFx0XHRcdHByb21pc2UuY29tcGxldGUodW5kZWZpbmVkKTtcblx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH1cblx0XHRcdH0sIDAsIDEwKTtcblxuXHRcdFx0YXdhaXQgcHJvbWlzZS5wO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvdW50LCAzKTtcblx0XHRcdGludGVydmFsLmRpc3Bvc2UoKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2l0ZXJhdGlvbnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRsZXQgY291bnQgPSAwO1xuXHRcdFx0Y29uc3QgaW50ZXJ2YWwgPSBkaXNwb3NhYmxlV2luZG93SW50ZXJ2YWwobWFpbldpbmRvdywgKCkgPT4ge1xuXHRcdFx0XHRjb3VudCsrO1xuXG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH0sIDAsIDApO1xuXG5cdFx0XHRhd2FpdCB0aW1lb3V0KDUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvdW50LCAwKTtcblx0XHRcdGludGVydmFsLmRpc3Bvc2UoKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2Rpc3Bvc2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRsZXQgY291bnQgPSAwO1xuXHRcdFx0Y29uc3QgaW50ZXJ2YWwgPSBkaXNwb3NhYmxlV2luZG93SW50ZXJ2YWwobWFpbldpbmRvdywgKCkgPT4ge1xuXHRcdFx0XHRjb3VudCsrO1xuXG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH0sIDAsIDEwKTtcblxuXHRcdFx0aW50ZXJ2YWwuZGlzcG9zZSgpO1xuXHRcdFx0YXdhaXQgdGltZW91dCg1KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb3VudCwgMCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdTYWZlVHJpYW5nbGUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZmFrZUVsZW1lbnQgPSAobGVmdDogbnVtYmVyLCByaWdodDogbnVtYmVyLCB0b3A6IG51bWJlciwgYm90dG9tOiBudW1iZXIpOiBIVE1MRWxlbWVudCA9PiB7XG5cdFx0XHRyZXR1cm4geyBnZXRCb3VuZGluZ0NsaWVudFJlY3Q6ICgpID0+ICh7IGxlZnQsIHJpZ2h0LCB0b3AsIGJvdHRvbSB9KSB9IGFzIEhUTUxFbGVtZW50O1xuXHRcdH07XG5cblx0XHR0ZXN0KCd3b3JrcycsICgpID0+IHtcblx0XHRcdGNvbnN0IHNhZmVUcmlhbmdsZSA9IG5ldyBTYWZlVHJpYW5nbGUoMCwgMCwgZmFrZUVsZW1lbnQoMTAsIDIwLCAxMCwgMjApKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNhZmVUcmlhbmdsZS5jb250YWlucyg1LCA1KSwgdHJ1ZSk7IC8vIGluIHRyaWFuZ2xlIHJlZ2lvblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNhZmVUcmlhbmdsZS5jb250YWlucygxNSwgNSksIGZhbHNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzYWZlVHJpYW5nbGUuY29udGFpbnMoMjUsIDUpLCBmYWxzZSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzYWZlVHJpYW5nbGUuY29udGFpbnMoNSwgMTUpLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2FmZVRyaWFuZ2xlLmNvbnRhaW5zKDE1LCAxNSksIHRydWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNhZmVUcmlhbmdsZS5jb250YWlucygyNSwgMTUpLCBmYWxzZSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzYWZlVHJpYW5nbGUuY29udGFpbnMoNSwgMjUpLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2FmZVRyaWFuZ2xlLmNvbnRhaW5zKDE1LCAyNSksIGZhbHNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzYWZlVHJpYW5nbGUuY29udGFpbnMoMjUsIDI1KSwgZmFsc2UpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnb3RoZXIgZGlyYXRpb25zJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgYSA9IG5ldyBTYWZlVHJpYW5nbGUoMzAsIDMwLCBmYWtlRWxlbWVudCgxMCwgMjAsIDEwLCAyMCkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGEuY29udGFpbnMoMjUsIDI1KSwgdHJ1ZSk7XG5cblx0XHRcdGNvbnN0IGIgPSBuZXcgU2FmZVRyaWFuZ2xlKDAsIDMwLCBmYWtlRWxlbWVudCgxMCwgMjAsIDEwLCAyMCkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGIuY29udGFpbnMoNSwgMjUpLCB0cnVlKTtcblxuXHRcdFx0Y29uc3QgYyA9IG5ldyBTYWZlVHJpYW5nbGUoMzAsIDAsIGZha2VFbGVtZW50KDEwLCAyMCwgMTAsIDIwKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYy5jb250YWlucygyNSwgNSksIHRydWUpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnQW5pbWF0aW9uRnJhbWVTY2hlZHVsZXInLCAoKSA9PiB7XG5cdFx0Ly8gSGVscGVyIHRvIHdhaXQgZm9yIGFuIGFuaW1hdGlvbiBmcmFtZVxuXHRcdGNvbnN0IHdhaXRGb3JBbmltYXRpb25GcmFtZSA9ICgpID0+IG5ldyBQcm9taXNlPHZvaWQ+KHJlc29sdmUgPT4gbWFpbldpbmRvdy5yZXF1ZXN0QW5pbWF0aW9uRnJhbWUoKCkgPT4gcmVzb2x2ZSgpKSk7XG5cblx0XHR0ZXN0KCdzY2hlZHVsZXMgYW5kIHJ1bnMgdGhlIGNhbGxiYWNrJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgbm9kZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdFx0bGV0IGNhbGxDb3VudCA9IDA7XG5cdFx0XHRjb25zdCBzY2hlZHVsZXIgPSBuZXcgQW5pbWF0aW9uRnJhbWVTY2hlZHVsZXIobm9kZSwgKCkgPT4ge1xuXHRcdFx0XHRjYWxsQ291bnQrKztcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2NoZWR1bGVyLmlzU2NoZWR1bGVkKCksIGZhbHNlKTtcblx0XHRcdHNjaGVkdWxlci5zY2hlZHVsZSgpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNjaGVkdWxlci5pc1NjaGVkdWxlZCgpLCB0cnVlKTtcblxuXHRcdFx0Ly8gV2FpdCBmb3IgdGhlIGFuaW1hdGlvbiBmcmFtZVxuXHRcdFx0YXdhaXQgd2FpdEZvckFuaW1hdGlvbkZyYW1lKCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjYWxsQ291bnQsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNjaGVkdWxlci5pc1NjaGVkdWxlZCgpLCBmYWxzZSk7XG5cdFx0XHRzY2hlZHVsZXIuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY29hbGVzY2VzIG11bHRpcGxlIHNjaGVkdWxlIGNhbGxzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgbm9kZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdFx0bGV0IGNhbGxDb3VudCA9IDA7XG5cdFx0XHRjb25zdCBzY2hlZHVsZXIgPSBuZXcgQW5pbWF0aW9uRnJhbWVTY2hlZHVsZXIobm9kZSwgKCkgPT4ge1xuXHRcdFx0XHRjYWxsQ291bnQrKztcblx0XHRcdH0pO1xuXG5cdFx0XHRzY2hlZHVsZXIuc2NoZWR1bGUoKTtcblx0XHRcdHNjaGVkdWxlci5zY2hlZHVsZSgpO1xuXHRcdFx0c2NoZWR1bGVyLnNjaGVkdWxlKCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzY2hlZHVsZXIuaXNTY2hlZHVsZWQoKSwgdHJ1ZSk7XG5cblx0XHRcdC8vIFdhaXQgZm9yIHRoZSBhbmltYXRpb24gZnJhbWVcblx0XHRcdGF3YWl0IHdhaXRGb3JBbmltYXRpb25GcmFtZSgpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2FsbENvdW50LCAxKTtcblx0XHRcdHNjaGVkdWxlci5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjYW5jZWwgcHJldmVudHMgZXhlY3V0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgbm9kZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdFx0bGV0IGNhbGxDb3VudCA9IDA7XG5cdFx0XHRjb25zdCBzY2hlZHVsZXIgPSBuZXcgQW5pbWF0aW9uRnJhbWVTY2hlZHVsZXIobm9kZSwgKCkgPT4ge1xuXHRcdFx0XHRjYWxsQ291bnQrKztcblx0XHRcdH0pO1xuXG5cdFx0XHRzY2hlZHVsZXIuc2NoZWR1bGUoKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzY2hlZHVsZXIuaXNTY2hlZHVsZWQoKSwgdHJ1ZSk7XG5cdFx0XHRzY2hlZHVsZXIuY2FuY2VsKCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2NoZWR1bGVyLmlzU2NoZWR1bGVkKCksIGZhbHNlKTtcblxuXHRcdFx0Ly8gV2FpdCBmb3IgdGhlIGFuaW1hdGlvbiBmcmFtZVxuXHRcdFx0YXdhaXQgd2FpdEZvckFuaW1hdGlvbkZyYW1lKCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjYWxsQ291bnQsIDApO1xuXHRcdFx0c2NoZWR1bGVyLmRpc3Bvc2UoKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2Rpc3Bvc2UgcHJldmVudHMgZXhlY3V0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgbm9kZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdFx0bGV0IGNhbGxDb3VudCA9IDA7XG5cdFx0XHRjb25zdCBzY2hlZHVsZXIgPSBuZXcgQW5pbWF0aW9uRnJhbWVTY2hlZHVsZXIobm9kZSwgKCkgPT4ge1xuXHRcdFx0XHRjYWxsQ291bnQrKztcblx0XHRcdH0pO1xuXG5cdFx0XHRzY2hlZHVsZXIuc2NoZWR1bGUoKTtcblx0XHRcdHNjaGVkdWxlci5kaXNwb3NlKCk7XG5cblx0XHRcdC8vIFdhaXQgZm9yIHRoZSBhbmltYXRpb24gZnJhbWVcblx0XHRcdGF3YWl0IHdhaXRGb3JBbmltYXRpb25GcmFtZSgpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2FsbENvdW50LCAwKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NhbiBzY2hlZHVsZSBhZ2FpbiBhZnRlciBleGVjdXRpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBub2RlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0XHRsZXQgY2FsbENvdW50ID0gMDtcblx0XHRcdGNvbnN0IHNjaGVkdWxlciA9IG5ldyBBbmltYXRpb25GcmFtZVNjaGVkdWxlcihub2RlLCAoKSA9PiB7XG5cdFx0XHRcdGNhbGxDb3VudCsrO1xuXHRcdFx0fSk7XG5cblx0XHRcdHNjaGVkdWxlci5zY2hlZHVsZSgpO1xuXHRcdFx0YXdhaXQgd2FpdEZvckFuaW1hdGlvbkZyYW1lKCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2FsbENvdW50LCAxKTtcblxuXHRcdFx0c2NoZWR1bGVyLnNjaGVkdWxlKCk7XG5cdFx0XHRhd2FpdCB3YWl0Rm9yQW5pbWF0aW9uRnJhbWUoKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjYWxsQ291bnQsIDIpO1xuXG5cdFx0XHRzY2hlZHVsZXIuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnRGlzcG9zYWJsZVJlc2l6ZU9ic2VydmVyJywgKCkgPT4ge1xuXHRcdHRlYXJkb3duKCgpID0+IG5ldyBQcm9taXNlPHZvaWQ+KHJlc29sdmUgPT4gbWFpbldpbmRvdy5yZXF1ZXN0QW5pbWF0aW9uRnJhbWUoKCkgPT4gcmVzb2x2ZSgpKSkpO1xuXG5cdFx0Ly8gQ2FwdHVyZXMgdGhlIGNhbGxiYWNrIGhhbmRlZCB0byBhIGBSZXNpemVPYnNlcnZlcmAgc28gdGVzdHMgY2FuIGZpcmVcblx0XHQvLyBkZWxpdmVyaWVzIHN5bnRoZXRpY2FsbHkuIFJldHVybmVkIHZpYSBkZXBlbmRlbmN5IGluamVjdGlvbiBcdTIwMTQgbm9cblx0XHQvLyBnbG9iYWwgbXV0YXRpb24sIG5vIGBhbnlgIGNhc3RzLlxuXHRcdGludGVyZmFjZSBGYWtlUmVzaXplT2JzZXJ2ZXJIYW5kbGUge1xuXHRcdFx0Y3RvcjogdHlwZW9mIFJlc2l6ZU9ic2VydmVyO1xuXHRcdFx0ZmlyZTogKGVudHJpZXM6IFJlc2l6ZU9ic2VydmVyRW50cnlbXSkgPT4gdm9pZDtcblx0XHRcdGRpc2Nvbm5lY3RzOiBudW1iZXI7XG5cdFx0fVxuXG5cdFx0ZnVuY3Rpb24gY3JlYXRlRmFrZVJlc2l6ZU9ic2VydmVyQ3RvcigpOiBGYWtlUmVzaXplT2JzZXJ2ZXJIYW5kbGUge1xuXHRcdFx0Y29uc3QgaGFuZGxlOiBGYWtlUmVzaXplT2JzZXJ2ZXJIYW5kbGUgPSB7XG5cdFx0XHRcdGN0b3I6IHVuZGVmaW5lZCEsXG5cdFx0XHRcdGZpcmU6ICgpID0+IHsgdGhyb3cgbmV3IEVycm9yKCdvYnNlcnZlciBub3QgY29uc3RydWN0ZWQnKTsgfSxcblx0XHRcdFx0ZGlzY29ubmVjdHM6IDAsXG5cdFx0XHR9O1xuXHRcdFx0Y2xhc3MgRmFrZVJlc2l6ZU9ic2VydmVyIGltcGxlbWVudHMgUmVzaXplT2JzZXJ2ZXIge1xuXHRcdFx0XHRjb25zdHJ1Y3RvcihjYWxsYmFjazogUmVzaXplT2JzZXJ2ZXJDYWxsYmFjaykge1xuXHRcdFx0XHRcdGhhbmRsZS5maXJlID0gZW50cmllcyA9PiBjYWxsYmFjayhlbnRyaWVzLCB0aGlzKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRvYnNlcnZlKF90YXJnZXQ6IEVsZW1lbnQsIF9vcHRpb25zPzogUmVzaXplT2JzZXJ2ZXJPcHRpb25zKTogdm9pZCB7IC8qIG5vLW9wICovIH1cblx0XHRcdFx0dW5vYnNlcnZlKF90YXJnZXQ6IEVsZW1lbnQpOiB2b2lkIHsgLyogbm8tb3AgKi8gfVxuXHRcdFx0XHRkaXNjb25uZWN0KCk6IHZvaWQgeyBoYW5kbGUuZGlzY29ubmVjdHMrKzsgfVxuXHRcdFx0fVxuXHRcdFx0aGFuZGxlLmN0b3IgPSBGYWtlUmVzaXplT2JzZXJ2ZXI7XG5cdFx0XHRyZXR1cm4gaGFuZGxlO1xuXHRcdH1cblxuXHRcdGZ1bmN0aW9uIGZha2VFbnRyeSh0YXJnZXQ6IEVsZW1lbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKSk6IFJlc2l6ZU9ic2VydmVyRW50cnkge1xuXHRcdFx0Y29uc3Qgc2l6ZTogUmVzaXplT2JzZXJ2ZXJTaXplID0geyBibG9ja1NpemU6IDAsIGlubGluZVNpemU6IDAgfTtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHRhcmdldCxcblx0XHRcdFx0Y29udGVudFJlY3Q6IHRhcmdldC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKSxcblx0XHRcdFx0Ym9yZGVyQm94U2l6ZTogW3NpemVdLFxuXHRcdFx0XHRjb250ZW50Qm94U2l6ZTogW3NpemVdLFxuXHRcdFx0XHRkZXZpY2VQaXhlbENvbnRlbnRCb3hTaXplOiBbc2l6ZV0sXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdHRlc3QoJ2NhbGxiYWNrIHJ1bnMgc3luY2hyb25vdXNseSB3aXRoIHRoZSBlbnRyaWVzIHRoZSBicm93c2VyIGRlbGl2ZXJlZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGZha2UgPSBjcmVhdGVGYWtlUmVzaXplT2JzZXJ2ZXJDdG9yKCk7XG5cdFx0XHRsZXQgY2FsbHMgPSAwO1xuXHRcdFx0bGV0IHJlY2VpdmVkOiBSZXNpemVPYnNlcnZlckVudHJ5W10gfCB1bmRlZmluZWQ7XG5cdFx0XHRjb25zdCBvYnNlcnZlciA9IG5ldyBEaXNwb3NhYmxlUmVzaXplT2JzZXJ2ZXIoJ3Rlc3Quc3luYycsIChlbnRyaWVzKSA9PiB7XG5cdFx0XHRcdGNhbGxzKys7XG5cdFx0XHRcdHJlY2VpdmVkID0gZW50cmllcztcblx0XHRcdH0sIG1haW5XaW5kb3csIHsgcmVzaXplT2JzZXJ2ZXJDdG9yOiBmYWtlLmN0b3IgfSk7XG5cdFx0XHRjb25zdCBhID0gZmFrZUVudHJ5KCk7XG5cdFx0XHRjb25zdCBiID0gZmFrZUVudHJ5KCk7XG5cdFx0XHRmYWtlLmZpcmUoW2EsIGJdKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjYWxscywgMSwgJ2NhbGxiYWNrIHJ1bnMgc3luY2hyb25vdXNseSBpbnNpZGUgdGhlIHJlc2l6ZS1vYnNlcnZhdGlvbiBwaGFzZScpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZWNlaXZlZCwgW2EsIGJdLCAnZW50cmllcyBhcmUgZm9yd2FyZGVkIGFzLWlzJyk7XG5cdFx0XHRvYnNlcnZlci5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdlYWNoIG5hdGl2ZSBkZWxpdmVyeSBpbnZva2VzIHRoZSBjYWxsYmFjayBvbmNlIChubyBiYXRjaGluZyknLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBmYWtlID0gY3JlYXRlRmFrZVJlc2l6ZU9ic2VydmVyQ3RvcigpO1xuXHRcdFx0bGV0IGNhbGxzID0gMDtcblx0XHRcdGNvbnN0IG9ic2VydmVyID0gbmV3IERpc3Bvc2FibGVSZXNpemVPYnNlcnZlcigndGVzdC5ub0JhdGNoJywgKCkgPT4geyBjYWxscysrOyB9LCBtYWluV2luZG93LCB7IHJlc2l6ZU9ic2VydmVyQ3RvcjogZmFrZS5jdG9yIH0pO1xuXHRcdFx0ZmFrZS5maXJlKFtmYWtlRW50cnkoKV0pO1xuXHRcdFx0ZmFrZS5maXJlKFtmYWtlRW50cnkoKV0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNhbGxzLCAyLCAnd3JhcHBlciBkb2VzIG5vdCBjb2FsZXNjZSBkZWxpdmVyaWVzJyk7XG5cdFx0XHRvYnNlcnZlci5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkaXNwb3NlIGRpc2Nvbm5lY3RzIHRoZSB1bmRlcmx5aW5nIG9ic2VydmVyJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZmFrZSA9IGNyZWF0ZUZha2VSZXNpemVPYnNlcnZlckN0b3IoKTtcblx0XHRcdGNvbnN0IG9ic2VydmVyID0gbmV3IERpc3Bvc2FibGVSZXNpemVPYnNlcnZlcigndGVzdC5kaXNwb3NlJywgKCkgPT4geyAvKiBub29wICovIH0sIG1haW5XaW5kb3csIHsgcmVzaXplT2JzZXJ2ZXJDdG9yOiBmYWtlLmN0b3IgfSk7XG5cdFx0XHRvYnNlcnZlci5kaXNwb3NlKCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmFrZS5kaXNjb25uZWN0cywgMSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdleGNlcHRpb25zIGluIHRoZSB1c2VyIGNhbGxiYWNrIGRvIG5vdCBwcm9wYWdhdGUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBmYWtlID0gY3JlYXRlRmFrZVJlc2l6ZU9ic2VydmVyQ3RvcigpO1xuXHRcdFx0Y29uc3Qgb2JzZXJ2ZXIgPSBuZXcgRGlzcG9zYWJsZVJlc2l6ZU9ic2VydmVyKCd0ZXN0LnRocm93JywgKCkgPT4geyB0aHJvdyBuZXcgRXJyb3IoJ2Jvb20nKTsgfSwgbWFpbldpbmRvdywgeyByZXNpemVPYnNlcnZlckN0b3I6IGZha2UuY3RvciB9KTtcblx0XHRcdC8vIEJyb3dzZXIgd291bGQgbm90IGNhdGNoIGEgdGhyb3cgb3V0IG9mIHRoZSBuYXRpdmUgY2FsbGJhY2s7IHdlXG5cdFx0XHQvLyBtdXN0IGd1YXJkIHNvIGEgc2luZ2xlIGJhZCBjb25zdW1lciBkb2VzIG5vdCBicmVhayBkZWxpdmVyeSBmb3Jcblx0XHRcdC8vIGV2ZXJ5IG90aGVyIG9ic2VydmVyIGluIHRoZSByZWFsbS4gVGhlIHdyYXBwZXIgcm91dGVzIHRoZSB0aHJvd1xuXHRcdFx0Ly8gdG8gb25VbmV4cGVjdGVkRXJyb3IsIHNvIHN3YXAgdGhlIGhhbmRsZXIgZm9yIHRoZSBkdXJhdGlvbiBvZlxuXHRcdFx0Ly8gdGhpcyB0ZXN0IHNvIHRoZSB0ZXN0IHJ1bm5lciBkb2VzIG5vdCBmbGFnIGl0IGFzIGEgZmFpbHVyZS5cblx0XHRcdGNvbnN0IG9yaWdpbmFsRXJyb3JIYW5kbGVyID0gZXJyb3JIYW5kbGVyLmdldFVuZXhwZWN0ZWRFcnJvckhhbmRsZXIoKTtcblx0XHRcdHNldFVuZXhwZWN0ZWRFcnJvckhhbmRsZXIoKCkgPT4geyAvKiBzd2FsbG93IGV4cGVjdGVkICovIH0pO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXNzZXJ0LmRvZXNOb3RUaHJvdygoKSA9PiBmYWtlLmZpcmUoW2Zha2VFbnRyeSgpXSkpO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0c2V0VW5leHBlY3RlZEVycm9ySGFuZGxlcihvcmlnaW5hbEVycm9ySGFuZGxlcik7XG5cdFx0XHR9XG5cdFx0XHRvYnNlcnZlci5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdleHBvc2VzIHRoZSBjb25maWd1cmVkIG5hbWUgZm9yIGxvb3Atd2FybmluZyBjb250ZXh0JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZmFrZSA9IGNyZWF0ZUZha2VSZXNpemVPYnNlcnZlckN0b3IoKTtcblx0XHRcdGNvbnN0IG9ic2VydmVyID0gbmV3IERpc3Bvc2FibGVSZXNpemVPYnNlcnZlcihcblx0XHRcdFx0J215LW9ic2VydmVyJyxcblx0XHRcdFx0KCkgPT4geyAvKiBub29wICovIH0sXG5cdFx0XHRcdG1haW5XaW5kb3csXG5cdFx0XHRcdHsgcmVzaXplT2JzZXJ2ZXJDdG9yOiBmYWtlLmN0b3IgfSxcblx0XHRcdCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwob2JzZXJ2ZXIubmFtZSwgJ215LW9ic2VydmVyJyk7XG5cdFx0XHRvYnNlcnZlci5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdnZXRSZWNlbnREaXNwb3NhYmxlUmVzaXplT2JzZXJ2ZXJDb250ZXh0Rm9yTG9vcEVycm9yIHJldHVybnMgdW5kZWZpbmVkIGZvciB1bnJlbGF0ZWQgbWVzc2FnZXMnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0UmVjZW50RGlzcG9zYWJsZVJlc2l6ZU9ic2VydmVyQ29udGV4dEZvckxvb3BFcnJvcih1bmRlZmluZWQpLCB1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFJlY2VudERpc3Bvc2FibGVSZXNpemVPYnNlcnZlckNvbnRleHRGb3JMb29wRXJyb3IoJ1VuY2F1Z2h0IFR5cGVFcnJvcjogZm9vJyksIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdnZXRSZWNlbnREaXNwb3NhYmxlUmVzaXplT2JzZXJ2ZXJDb250ZXh0Rm9yTG9vcEVycm9yIHJldHVybnMgc29ydGVkIHVuaXF1ZSB3cmFwcGVkIG9ic2VydmVycyBmcm9tIHRoZSBjdXJyZW50IGZyYW1lJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZmFrZSA9IGNyZWF0ZUZha2VSZXNpemVPYnNlcnZlckN0b3IoKTtcblx0XHRcdGNvbnN0IGEgPSBuZXcgRGlzcG9zYWJsZVJlc2l6ZU9ic2VydmVyKCdhJywgKCkgPT4geyAvKiBub29wICovIH0sIG1haW5XaW5kb3csIHsgcmVzaXplT2JzZXJ2ZXJDdG9yOiBmYWtlLmN0b3IgfSk7XG5cdFx0XHRmYWtlLmZpcmUoW2Zha2VFbnRyeSgpXSk7XG5cdFx0XHRjb25zdCBmYWtlQiA9IGNyZWF0ZUZha2VSZXNpemVPYnNlcnZlckN0b3IoKTtcblx0XHRcdGNvbnN0IGIgPSBuZXcgRGlzcG9zYWJsZVJlc2l6ZU9ic2VydmVyKCdiJywgKCkgPT4geyAvKiBub29wICovIH0sIG1haW5XaW5kb3csIHsgcmVzaXplT2JzZXJ2ZXJDdG9yOiBmYWtlQi5jdG9yIH0pO1xuXHRcdFx0ZmFrZUIuZmlyZShbZmFrZUVudHJ5KCldKTtcblx0XHRcdGZha2UuZmlyZShbZmFrZUVudHJ5KCldKTtcblx0XHRcdGNvbnN0IGNvbnRleHQgPSBnZXRSZWNlbnREaXNwb3NhYmxlUmVzaXplT2JzZXJ2ZXJDb250ZXh0Rm9yTG9vcEVycm9yKFxuXHRcdFx0XHQnUmVzaXplT2JzZXJ2ZXIgbG9vcCBjb21wbGV0ZWQgd2l0aCB1bmRlbGl2ZXJlZCBub3RpZmljYXRpb25zLicsXG5cdFx0XHQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0XHRjb250ZXh0LFxuXHRcdFx0XHQnW1Jlc2l6ZU9ic2VydmVyTG9vcENvbnRleHQoYSxiKV0gUmVzaXplT2JzZXJ2ZXIgbG9vcCBjb21wbGV0ZWQgd2l0aCB1bmRlbGl2ZXJlZCBub3RpZmljYXRpb25zLicsXG5cdFx0XHQpO1xuXHRcdFx0YS5kaXNwb3NlKCk7XG5cdFx0XHRiLmRpc3Bvc2UoKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2dldFJlY2VudERpc3Bvc2FibGVSZXNpemVPYnNlcnZlckNvbnRleHRGb3JMb29wRXJyb3IgbWFya3MgYm91bmRlZCBwYXJ0aWNpcGFudCBvdmVyZmxvdycsICgpID0+IHtcblx0XHRcdGNvbnN0IG9ic2VydmVyczogRGlzcG9zYWJsZVJlc2l6ZU9ic2VydmVyW10gPSBbXTtcblx0XHRcdGZvciAobGV0IGkgPSA4OyBpID49IDA7IGktLSkge1xuXHRcdFx0XHRjb25zdCBmYWtlID0gY3JlYXRlRmFrZVJlc2l6ZU9ic2VydmVyQ3RvcigpO1xuXHRcdFx0XHRvYnNlcnZlcnMucHVzaChuZXcgRGlzcG9zYWJsZVJlc2l6ZU9ic2VydmVyKGBvYnNlcnZlci0ke2l9YCwgKCkgPT4geyAvKiBub29wICovIH0sIG1haW5XaW5kb3csIHsgcmVzaXplT2JzZXJ2ZXJDdG9yOiBmYWtlLmN0b3IgfSkpO1xuXHRcdFx0XHRmYWtlLmZpcmUoW2Zha2VFbnRyeSgpXSk7XG5cdFx0XHR9XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRcdGdldFJlY2VudERpc3Bvc2FibGVSZXNpemVPYnNlcnZlckNvbnRleHRGb3JMb29wRXJyb3IoJ1Jlc2l6ZU9ic2VydmVyIGxvb3AgY29tcGxldGVkIHdpdGggdW5kZWxpdmVyZWQgbm90aWZpY2F0aW9ucy4nKSxcblx0XHRcdFx0J1tSZXNpemVPYnNlcnZlckxvb3BDb250ZXh0KG9ic2VydmVyLTAsb2JzZXJ2ZXItMSxvYnNlcnZlci0yLG9ic2VydmVyLTMsb2JzZXJ2ZXItNCxvYnNlcnZlci01LG9ic2VydmVyLTYsb2JzZXJ2ZXItNyw8b3ZlcmZsb3c+KV0gUmVzaXplT2JzZXJ2ZXIgbG9vcCBjb21wbGV0ZWQgd2l0aCB1bmRlbGl2ZXJlZCBub3RpZmljYXRpb25zLicsXG5cdFx0XHQpO1xuXHRcdFx0b2JzZXJ2ZXJzLmZvckVhY2gob2JzZXJ2ZXIgPT4gb2JzZXJ2ZXIuZGlzcG9zZSgpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2dldFJlY2VudERpc3Bvc2FibGVSZXNpemVPYnNlcnZlckNvbnRleHRGb3JMb29wRXJyb3IgaXMgc2NvcGVkIHRvIHRoZSBvYnNlcnZlciB3aW5kb3cnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBpZnJhbWUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdpZnJhbWUnKTtcblx0XHRcdGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQoaWZyYW1lKTtcblx0XHRcdGNvbnN0IGF1eGlsaWFyeVdpbmRvdyA9IGlmcmFtZS5jb250ZW50V2luZG93ITtcblx0XHRcdGVuc3VyZUNvZGVXaW5kb3coYXV4aWxpYXJ5V2luZG93LCA5OTkpO1xuXG5cdFx0XHRjb25zdCBmYWtlID0gY3JlYXRlRmFrZVJlc2l6ZU9ic2VydmVyQ3RvcigpO1xuXHRcdFx0Y29uc3Qgb2JzZXJ2ZXIgPSBuZXcgRGlzcG9zYWJsZVJlc2l6ZU9ic2VydmVyKCdhdXhpbGlhcnknLCAoKSA9PiB7IC8qIG5vb3AgKi8gfSwgYXV4aWxpYXJ5V2luZG93LCB7IHJlc2l6ZU9ic2VydmVyQ3RvcjogZmFrZS5jdG9yIH0pO1xuXHRcdFx0ZmFrZS5maXJlKFtmYWtlRW50cnkoKV0pO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRcdGdldFJlY2VudERpc3Bvc2FibGVSZXNpemVPYnNlcnZlckNvbnRleHRGb3JMb29wRXJyb3IoJ1Jlc2l6ZU9ic2VydmVyIGxvb3AgY29tcGxldGVkIHdpdGggdW5kZWxpdmVyZWQgbm90aWZpY2F0aW9ucy4nLCBtYWluV2luZG93KSxcblx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdFx0Z2V0UmVjZW50RGlzcG9zYWJsZVJlc2l6ZU9ic2VydmVyQ29udGV4dEZvckxvb3BFcnJvcignUmVzaXplT2JzZXJ2ZXIgbG9vcCBjb21wbGV0ZWQgd2l0aCB1bmRlbGl2ZXJlZCBub3RpZmljYXRpb25zLicsIGF1eGlsaWFyeVdpbmRvdyksXG5cdFx0XHRcdCdbUmVzaXplT2JzZXJ2ZXJMb29wQ29udGV4dChhdXhpbGlhcnkpXSBSZXNpemVPYnNlcnZlciBsb29wIGNvbXBsZXRlZCB3aXRoIHVuZGVsaXZlcmVkIG5vdGlmaWNhdGlvbnMuJyxcblx0XHRcdCk7XG5cblx0XHRcdG9ic2VydmVyLmRpc3Bvc2UoKTtcblx0XHRcdGF3YWl0IG5ldyBQcm9taXNlPHZvaWQ+KHJlc29sdmUgPT4gYXV4aWxpYXJ5V2luZG93LnJlcXVlc3RBbmltYXRpb25GcmFtZSgoKSA9PiByZXNvbHZlKCkpKTtcblx0XHRcdGlmcmFtZS5yZW1vdmUoKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2dldFJlY2VudERpc3Bvc2FibGVSZXNpemVPYnNlcnZlckNvbnRleHRGb3JMb29wRXJyb3IgY2xlYXJzIGF0IHRoZSBuZXh0IGFuaW1hdGlvbiBmcmFtZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGZha2UgPSBjcmVhdGVGYWtlUmVzaXplT2JzZXJ2ZXJDdG9yKCk7XG5cdFx0XHRjb25zdCBvYnNlcnZlciA9IG5ldyBEaXNwb3NhYmxlUmVzaXplT2JzZXJ2ZXIoJ3Njb3BlZCcsICgpID0+IHsgLyogbm9vcCAqLyB9LCBtYWluV2luZG93LCB7IHJlc2l6ZU9ic2VydmVyQ3RvcjogZmFrZS5jdG9yIH0pO1xuXHRcdFx0ZmFrZS5maXJlKFtmYWtlRW50cnkoKV0pO1xuXHRcdFx0Ly8gQ29udGV4dCBpcyByZWNvcmRlZCBzeW5jaHJvbm91c2x5IGFuZCBzdXJ2aXZlcyBtaWNyb3Rhc2tzIChzbyBpdCBpc1xuXHRcdFx0Ly8gc3RpbGwgc2V0IHdoZW4gQ2hyb21pdW0gZGlzcGF0Y2hlcyB0aGUgbG9vcCB3YXJuaW5nIGF0IHRoZSBlbmRcblx0XHRcdC8vIG9mIHRoZSByZXNpemUtb2JzZXJ2YXRpb24gcGhhc2UpLlxuXHRcdFx0YXdhaXQgUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0XHRhc3NlcnQub2soZ2V0UmVjZW50RGlzcG9zYWJsZVJlc2l6ZU9ic2VydmVyQ29udGV4dEZvckxvb3BFcnJvcignUmVzaXplT2JzZXJ2ZXIgbG9vcCBjb21wbGV0ZWQgd2l0aCB1bmRlbGl2ZXJlZCBub3RpZmljYXRpb25zLicpKTtcblx0XHRcdGF3YWl0IG5ldyBQcm9taXNlPHZvaWQ+KHJlc29sdmUgPT4gbWFpbldpbmRvdy5yZXF1ZXN0QW5pbWF0aW9uRnJhbWUoKCkgPT4gcmVzb2x2ZSgpKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRcdGdldFJlY2VudERpc3Bvc2FibGVSZXNpemVPYnNlcnZlckNvbnRleHRGb3JMb29wRXJyb3IoJ1Jlc2l6ZU9ic2VydmVyIGxvb3AgY29tcGxldGVkIHdpdGggdW5kZWxpdmVyZWQgbm90aWZpY2F0aW9ucy4nKSxcblx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0XHQnY29udGV4dCBtdXN0IGJlIGNsZWFyZWQgYXQgdGhlIG5leHQgZnJhbWUgc28gYSBsYXRlciByZW5kZXJpbmcgdXBkYXRlIGRvZXMgbm90IGluaGVyaXQgc3RhbGUgb2JzZXJ2ZXJzJyxcblx0XHRcdCk7XG5cdFx0XHRvYnNlcnZlci5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxHQUFHLEdBQUcsaUJBQWlCLGdCQUFnQiwwQkFBMEIsWUFBWSxpQkFBaUIsYUFBYSxlQUFlLFdBQVcsV0FBVyxhQUFhLGVBQWUsY0FBYyx5QkFBeUIsMEJBQTBCLHNEQUFzRCxxQkFBcUIsMEJBQTBCO0FBQzNWLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsa0JBQWtCLG1CQUFtQixrQkFBa0I7QUFDaEUsU0FBUyxpQkFBaUIsZUFBZTtBQUN6QyxTQUFTLGNBQWMsaUNBQWlDO0FBQ3hELFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsK0NBQStDO0FBRXhELE1BQU0sT0FBTyxNQUFNO0FBQ2xCLE9BQUssWUFBWSxNQUFNO0FBRXRCLFVBQU0sVUFBVSxTQUFTLGNBQWMsS0FBSztBQUM1QyxZQUFRLFlBQVk7QUFFcEIsV0FBTyxRQUFRLFVBQVUsU0FBUyxRQUFRLENBQUM7QUFDM0MsV0FBTyxRQUFRLFVBQVUsU0FBUyxLQUFLLENBQUM7QUFDeEMsV0FBTyxRQUFRLFVBQVUsU0FBUyxLQUFLLENBQUM7QUFDeEMsV0FBTyxDQUFDLFFBQVEsVUFBVSxTQUFTLEtBQUssQ0FBQztBQUN6QyxXQUFPLENBQUMsUUFBUSxVQUFVLFNBQVMsS0FBSyxDQUFDO0FBQ3pDLFdBQU8sQ0FBQyxRQUFRLFVBQVUsU0FBUyxFQUFFLENBQUM7QUFBQSxFQUN2QyxDQUFDO0FBRUQsT0FBSywwREFBMEQsTUFBTTtBQUNwRSxVQUFNLE9BQU8sRUFBRSw4QkFBOEI7QUFDN0Ms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
