import assert from "assert";
import { DecorationsService } from "../../browser/decorationsService.js";
import { URI } from "../../../../../base/common/uri.js";
import { Event, Emitter } from "../../../../../base/common/event.js";
import * as resources from "../../../../../base/common/resources.js";
import { mock } from "../../../../../base/test/common/mock.js";
import { TestThemeService } from "../../../../../platform/theme/test/common/testThemeService.js";
import { runWithFakedTimers } from "../../../../../base/test/common/timeTravelScheduler.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import * as DOM from "../../../../../base/browser/dom.js";
suite("DecorationsService", function() {
  let service;
  setup(function() {
    service = new DecorationsService(
      new class extends mock() {
        constructor() {
          super(...arguments);
          this.extUri = resources.extUri;
        }
      }(),
      new TestThemeService()
    );
  });
  teardown(function() {
    service.dispose();
  });
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  test("Async provider, async/evented result", function() {
    return runWithFakedTimers({}, async function() {
      const uri = URI.parse("foo:bar");
      let callCounter = 0;
      const reg = service.registerDecorationsProvider(new class {
        constructor() {
          this.label = "Test";
          this.onDidChange = Event.None;
        }
        provideDecorations(uri2) {
          callCounter += 1;
          return new Promise((resolve) => {
            setTimeout(() => resolve({
              color: "someBlue",
              tooltip: "T",
              strikethrough: true
            }));
          });
        }
      }());
      assert.strictEqual(service.getDecoration(uri, false), void 0);
      assert.strictEqual(callCounter, 1);
      const e = await Event.toPromise(service.onDidChangeDecorations);
      assert.strictEqual(e.affectsResource(uri), true);
      assert.deepStrictEqual(service.getDecoration(uri, false).tooltip, "T");
      assert.deepStrictEqual(service.getDecoration(uri, false).strikethrough, true);
      assert.strictEqual(callCounter, 1);
      reg.dispose();
    });
  });
  test("Sync provider, sync result", function() {
    const uri = URI.parse("foo:bar");
    let callCounter = 0;
    const reg = service.registerDecorationsProvider(new class {
      constructor() {
        this.label = "Test";
        this.onDidChange = Event.None;
      }
      provideDecorations(uri2) {
        callCounter += 1;
        return { color: "someBlue", tooltip: "Z" };
      }
    }());
    assert.deepStrictEqual(service.getDecoration(uri, false).tooltip, "Z");
    assert.deepStrictEqual(service.getDecoration(uri, false).strikethrough, false);
    assert.strictEqual(callCounter, 1);
    reg.dispose();
  });
  test("Falls back to lower-weight decoration color when a theme color is undefined", function() {
    const uri = URI.parse("foo:/folder/file");
    const parentUri = URI.parse("foo:/folder/");
    const highPriority = service.registerDecorationsProvider({
      label: "High priority",
      onDidChange: Event.None,
      provideDecorations: (resource) => resource.toString() === uri.toString() ? { color: "highPriorityColor", weight: 10, letter: "H", bubble: true } : void 0
    });
    const lowPriority = service.registerDecorationsProvider({
      label: "Low priority",
      onDidChange: Event.None,
      provideDecorations: (resource) => resource.toString() === uri.toString() ? { color: "lowPriorityColor", weight: 5, letter: "L", bubble: true } : void 0
    });
    const decoration = service.getDecoration(uri, false);
    const bubbleDecoration = service.getDecoration(parentUri, true);
    for (const [className, pseudoElement] of [
      [decoration.labelClassName, void 0],
      [decoration.badgeClassName, "::after"],
      [bubbleDecoration.badgeClassName, "::after"]
    ]) {
      const element = document.createElement("div");
      element.className = className;
      element.style.setProperty("--vscode-lowPriorityColor", "#ff0000");
      document.body.appendChild(element);
      assert.strictEqual(DOM.getWindow(element).getComputedStyle(element, pseudoElement).color, "rgb(255, 0, 0)");
      element.remove();
    }
    decoration.dispose();
    bubbleDecoration.dispose();
    highPriority.dispose();
    lowPriority.dispose();
  });
  test("Clear decorations on provider dispose", async function() {
    return runWithFakedTimers({}, async function() {
      const uri = URI.parse("foo:bar");
      let callCounter = 0;
      const reg = service.registerDecorationsProvider(new class {
        constructor() {
          this.label = "Test";
          this.onDidChange = Event.None;
        }
        provideDecorations(uri2) {
          callCounter += 1;
          return { color: "someBlue", tooltip: "J" };
        }
      }());
      assert.deepStrictEqual(service.getDecoration(uri, false).tooltip, "J");
      assert.strictEqual(callCounter, 1);
      let didSeeEvent = false;
      const p = new Promise((resolve) => {
        const l = service.onDidChangeDecorations((e) => {
          assert.strictEqual(e.affectsResource(uri), true);
          assert.deepStrictEqual(service.getDecoration(uri, false), void 0);
          assert.strictEqual(callCounter, 1);
          didSeeEvent = true;
          l.dispose();
          resolve();
        });
      });
      reg.dispose();
      await p;
      assert.strictEqual(didSeeEvent, true);
    });
  });
  test("No default bubbling", function() {
    let reg = service.registerDecorationsProvider({
      label: "Test",
      onDidChange: Event.None,
      provideDecorations(uri) {
        return uri.path.match(/\.txt/) ? { tooltip: ".txt", weight: 17 } : void 0;
      }
    });
    const childUri = URI.parse("file:///some/path/some/file.txt");
    let deco = service.getDecoration(childUri, false);
    assert.strictEqual(deco.tooltip, ".txt");
    deco = service.getDecoration(childUri.with({ path: "some/path/" }), true);
    assert.strictEqual(deco, void 0);
    reg.dispose();
    reg = service.registerDecorationsProvider({
      label: "Test",
      onDidChange: Event.None,
      provideDecorations(uri) {
        return uri.path.match(/\.txt/) ? { tooltip: ".txt.bubble", weight: 71, bubble: true } : void 0;
      }
    });
    deco = service.getDecoration(childUri, false);
    assert.strictEqual(deco.tooltip, ".txt.bubble");
    deco = service.getDecoration(childUri.with({ path: "some/path/" }), true);
    assert.strictEqual(typeof deco.tooltip, "string");
    reg.dispose();
  });
  test("Decorations not showing up for second root folder #48502", async function() {
    let cancelCount = 0;
    let callCount = 0;
    const provider = new class {
      constructor() {
        this._onDidChange = new Emitter();
        this.onDidChange = this._onDidChange.event;
        this.label = "foo";
      }
      provideDecorations(uri2, token) {
        store.add(token.onCancellationRequested(() => {
          cancelCount += 1;
        }));
        return new Promise((resolve) => {
          callCount += 1;
          setTimeout(() => {
            resolve({ letter: "foo" });
          }, 10);
        });
      }
    }();
    const reg = service.registerDecorationsProvider(provider);
    const uri = URI.parse("foo://bar");
    const d1 = service.getDecoration(uri, false);
    provider._onDidChange.fire([uri]);
    const d2 = service.getDecoration(uri, false);
    assert.strictEqual(cancelCount, 1);
    assert.strictEqual(callCount, 2);
    d1?.dispose();
    d2?.dispose();
    reg.dispose();
  });
  test("Decorations not bubbling... #48745", function() {
    const reg = service.registerDecorationsProvider({
      label: "Test",
      onDidChange: Event.None,
      provideDecorations(uri) {
        if (uri.path.match(/hello$/)) {
          return { tooltip: "FOO", weight: 17, bubble: true };
        } else {
          return new Promise((_resolve) => {
          });
        }
      }
    });
    const data1 = service.getDecoration(URI.parse("a:b/"), true);
    assert.ok(!data1);
    const data2 = service.getDecoration(URI.parse("a:b/c.hello"), false);
    assert.ok(data2.tooltip);
    const data3 = service.getDecoration(URI.parse("a:b/"), true);
    assert.ok(data3);
    reg.dispose();
  });
  test("Folder decorations don't go away when file with problems is deleted #61919 (part1)", function() {
    const emitter = new Emitter();
    let gone = false;
    const reg = service.registerDecorationsProvider({
      label: "Test",
      onDidChange: emitter.event,
      provideDecorations(uri3) {
        if (!gone && uri3.path.match(/file.ts$/)) {
          return { tooltip: "FOO", weight: 17, bubble: true };
        }
        return void 0;
      }
    });
    const uri = URI.parse("foo:/folder/file.ts");
    const uri2 = URI.parse("foo:/folder/");
    let data = service.getDecoration(uri, true);
    assert.strictEqual(data.tooltip, "FOO");
    data = service.getDecoration(uri2, true);
    assert.ok(data.tooltip);
    gone = true;
    emitter.fire([uri]);
    data = service.getDecoration(uri, true);
    assert.strictEqual(data, void 0);
    data = service.getDecoration(uri2, true);
    assert.strictEqual(data, void 0);
    reg.dispose();
  });
  test("Folder decorations don't go away when file with problems is deleted #61919 (part2)", function() {
    return runWithFakedTimers({}, async function() {
      const emitter = new Emitter();
      let gone = false;
      const reg = service.registerDecorationsProvider({
        label: "Test",
        onDidChange: emitter.event,
        provideDecorations(uri3) {
          if (!gone && uri3.path.match(/file.ts$/)) {
            return { tooltip: "FOO", weight: 17, bubble: true };
          }
          return void 0;
        }
      });
      const uri = URI.parse("foo:/folder/file.ts");
      const uri2 = URI.parse("foo:/folder/");
      let data = service.getDecoration(uri, true);
      assert.strictEqual(data.tooltip, "FOO");
      data = service.getDecoration(uri2, true);
      assert.ok(data.tooltip);
      return new Promise((resolve, reject) => {
        const l = service.onDidChangeDecorations((e) => {
          l.dispose();
          try {
            assert.ok(e.affectsResource(uri));
            assert.ok(e.affectsResource(uri2));
            resolve();
            reg.dispose();
          } catch (err) {
            reject(err);
            reg.dispose();
          }
        });
        gone = true;
        emitter.fire([uri]);
      });
    });
  });
  test("FileDecorationProvider intermittently fails #133210", async function() {
    const invokeOrder = [];
    store.add(service.registerDecorationsProvider(new class {
      constructor() {
        this.label = "Provider-1";
        this.onDidChange = Event.None;
      }
      provideDecorations() {
        invokeOrder.push(this.label);
        return void 0;
      }
    }()));
    store.add(service.registerDecorationsProvider(new class {
      constructor() {
        this.label = "Provider-2";
        this.onDidChange = Event.None;
      }
      provideDecorations() {
        invokeOrder.push(this.label);
        return void 0;
      }
    }()));
    service.getDecoration(URI.parse("test://me/path"), false);
    assert.deepStrictEqual(invokeOrder, ["Provider-2", "Provider-1"]);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxkZWNvcmF0aW9uc1xcdGVzdFxcYnJvd3NlclxcZGVjb3JhdGlvbnNTZXJ2aWNlLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBEZWNvcmF0aW9uc1NlcnZpY2UgfSBmcm9tICcuLi8uLi9icm93c2VyL2RlY29yYXRpb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRGVjb3JhdGlvbnNQcm92aWRlciwgSURlY29yYXRpb25EYXRhIH0gZnJvbSAnLi4vLi4vY29tbW9uL2RlY29yYXRpb25zLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBFdmVudCwgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCAqIGFzIHJlc291cmNlcyBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgbW9jayB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vbW9jay5qcyc7XG5pbXBvcnQgeyBJVXJpSWRlbnRpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXJpSWRlbnRpdHkvY29tbW9uL3VyaUlkZW50aXR5LmpzJztcbmltcG9ydCB7IFRlc3RUaGVtZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS90ZXN0L2NvbW1vbi90ZXN0VGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IHJ1bldpdGhGYWtlZFRpbWVycyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdGltZVRyYXZlbFNjaGVkdWxlci5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCAqIGFzIERPTSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcblxuc3VpdGUoJ0RlY29yYXRpb25zU2VydmljZScsIGZ1bmN0aW9uICgpIHtcblxuXHRsZXQgc2VydmljZTogRGVjb3JhdGlvbnNTZXJ2aWNlO1xuXG5cdHNldHVwKGZ1bmN0aW9uICgpIHtcblx0XHRzZXJ2aWNlID0gbmV3IERlY29yYXRpb25zU2VydmljZShcblx0XHRcdG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVVyaUlkZW50aXR5U2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIGV4dFVyaSA9IHJlc291cmNlcy5leHRVcmk7XG5cdFx0XHR9LFxuXHRcdFx0bmV3IFRlc3RUaGVtZVNlcnZpY2UoKVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlYXJkb3duKGZ1bmN0aW9uICgpIHtcblx0XHRzZXJ2aWNlLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0Y29uc3Qgc3RvcmUgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXG5cdHRlc3QoJ0FzeW5jIHByb3ZpZGVyLCBhc3luYy9ldmVudGVkIHJlc3VsdCcsIGZ1bmN0aW9uICgpIHtcblxuXHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jIGZ1bmN0aW9uICgpIHtcblxuXHRcdFx0Y29uc3QgdXJpID0gVVJJLnBhcnNlKCdmb286YmFyJyk7XG5cdFx0XHRsZXQgY2FsbENvdW50ZXIgPSAwO1xuXG5cdFx0XHRjb25zdCByZWcgPSBzZXJ2aWNlLnJlZ2lzdGVyRGVjb3JhdGlvbnNQcm92aWRlcihuZXcgY2xhc3MgaW1wbGVtZW50cyBJRGVjb3JhdGlvbnNQcm92aWRlciB7XG5cdFx0XHRcdHJlYWRvbmx5IGxhYmVsOiBzdHJpbmcgPSAnVGVzdCc7XG5cdFx0XHRcdHJlYWRvbmx5IG9uRGlkQ2hhbmdlOiBFdmVudDxyZWFkb25seSBVUklbXT4gPSBFdmVudC5Ob25lO1xuXHRcdFx0XHRwcm92aWRlRGVjb3JhdGlvbnModXJpOiBVUkkpIHtcblx0XHRcdFx0XHRjYWxsQ291bnRlciArPSAxO1xuXHRcdFx0XHRcdHJldHVybiBuZXcgUHJvbWlzZTxJRGVjb3JhdGlvbkRhdGE+KHJlc29sdmUgPT4ge1xuXHRcdFx0XHRcdFx0c2V0VGltZW91dCgoKSA9PiByZXNvbHZlKHtcblx0XHRcdFx0XHRcdFx0Y29sb3I6ICdzb21lQmx1ZScsXG5cdFx0XHRcdFx0XHRcdHRvb2x0aXA6ICdUJyxcblx0XHRcdFx0XHRcdFx0c3RyaWtldGhyb3VnaDogdHJ1ZVxuXHRcdFx0XHRcdFx0fSkpO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gdHJpZ2dlciAtPiBhc3luY1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuZ2V0RGVjb3JhdGlvbih1cmksIGZhbHNlKSwgdW5kZWZpbmVkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjYWxsQ291bnRlciwgMSk7XG5cblx0XHRcdC8vIGV2ZW50IHdoZW4gcmVzdWx0IGlzIGNvbXB1dGVkXG5cdFx0XHRjb25zdCBlID0gYXdhaXQgRXZlbnQudG9Qcm9taXNlKHNlcnZpY2Uub25EaWRDaGFuZ2VEZWNvcmF0aW9ucyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZS5hZmZlY3RzUmVzb3VyY2UodXJpKSwgdHJ1ZSk7XG5cdFx0XHQvLyBzeW5jIHJlc3VsdFxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZXJ2aWNlLmdldERlY29yYXRpb24odXJpLCBmYWxzZSkhLnRvb2x0aXAsICdUJyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlcnZpY2UuZ2V0RGVjb3JhdGlvbih1cmksIGZhbHNlKSEuc3RyaWtldGhyb3VnaCwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2FsbENvdW50ZXIsIDEpO1xuXG5cdFx0XHRyZWcuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdTeW5jIHByb3ZpZGVyLCBzeW5jIHJlc3VsdCcsIGZ1bmN0aW9uICgpIHtcblxuXHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZSgnZm9vOmJhcicpO1xuXHRcdGxldCBjYWxsQ291bnRlciA9IDA7XG5cblx0XHRjb25zdCByZWcgPSBzZXJ2aWNlLnJlZ2lzdGVyRGVjb3JhdGlvbnNQcm92aWRlcihuZXcgY2xhc3MgaW1wbGVtZW50cyBJRGVjb3JhdGlvbnNQcm92aWRlciB7XG5cdFx0XHRyZWFkb25seSBsYWJlbDogc3RyaW5nID0gJ1Rlc3QnO1xuXHRcdFx0cmVhZG9ubHkgb25EaWRDaGFuZ2U6IEV2ZW50PHJlYWRvbmx5IFVSSVtdPiA9IEV2ZW50Lk5vbmU7XG5cdFx0XHRwcm92aWRlRGVjb3JhdGlvbnModXJpOiBVUkkpIHtcblx0XHRcdFx0Y2FsbENvdW50ZXIgKz0gMTtcblx0XHRcdFx0cmV0dXJuIHsgY29sb3I6ICdzb21lQmx1ZScsIHRvb2x0aXA6ICdaJyB9O1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Ly8gdHJpZ2dlciAtPiBzeW5jXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZXJ2aWNlLmdldERlY29yYXRpb24odXJpLCBmYWxzZSkhLnRvb2x0aXAsICdaJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZXJ2aWNlLmdldERlY29yYXRpb24odXJpLCBmYWxzZSkhLnN0cmlrZXRocm91Z2gsIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2FsbENvdW50ZXIsIDEpO1xuXG5cdFx0cmVnLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnRmFsbHMgYmFjayB0byBsb3dlci13ZWlnaHQgZGVjb3JhdGlvbiBjb2xvciB3aGVuIGEgdGhlbWUgY29sb3IgaXMgdW5kZWZpbmVkJywgZnVuY3Rpb24gKCkge1xuXG5cdFx0Y29uc3QgdXJpID0gVVJJLnBhcnNlKCdmb286L2ZvbGRlci9maWxlJyk7XG5cdFx0Y29uc3QgcGFyZW50VXJpID0gVVJJLnBhcnNlKCdmb286L2ZvbGRlci8nKTtcblx0XHRjb25zdCBoaWdoUHJpb3JpdHkgPSBzZXJ2aWNlLnJlZ2lzdGVyRGVjb3JhdGlvbnNQcm92aWRlcih7XG5cdFx0XHRsYWJlbDogJ0hpZ2ggcHJpb3JpdHknLFxuXHRcdFx0b25EaWRDaGFuZ2U6IEV2ZW50Lk5vbmUsXG5cdFx0XHRwcm92aWRlRGVjb3JhdGlvbnM6IHJlc291cmNlID0+IHJlc291cmNlLnRvU3RyaW5nKCkgPT09IHVyaS50b1N0cmluZygpID8geyBjb2xvcjogJ2hpZ2hQcmlvcml0eUNvbG9yJywgd2VpZ2h0OiAxMCwgbGV0dGVyOiAnSCcsIGJ1YmJsZTogdHJ1ZSB9IDogdW5kZWZpbmVkXG5cdFx0fSk7XG5cdFx0Y29uc3QgbG93UHJpb3JpdHkgPSBzZXJ2aWNlLnJlZ2lzdGVyRGVjb3JhdGlvbnNQcm92aWRlcih7XG5cdFx0XHRsYWJlbDogJ0xvdyBwcmlvcml0eScsXG5cdFx0XHRvbkRpZENoYW5nZTogRXZlbnQuTm9uZSxcblx0XHRcdHByb3ZpZGVEZWNvcmF0aW9uczogcmVzb3VyY2UgPT4gcmVzb3VyY2UudG9TdHJpbmcoKSA9PT0gdXJpLnRvU3RyaW5nKCkgPyB7IGNvbG9yOiAnbG93UHJpb3JpdHlDb2xvcicsIHdlaWdodDogNSwgbGV0dGVyOiAnTCcsIGJ1YmJsZTogdHJ1ZSB9IDogdW5kZWZpbmVkXG5cdFx0fSk7XG5cblx0XHRjb25zdCBkZWNvcmF0aW9uID0gc2VydmljZS5nZXREZWNvcmF0aW9uKHVyaSwgZmFsc2UpITtcblx0XHRjb25zdCBidWJibGVEZWNvcmF0aW9uID0gc2VydmljZS5nZXREZWNvcmF0aW9uKHBhcmVudFVyaSwgdHJ1ZSkhO1xuXHRcdGZvciAoY29uc3QgW2NsYXNzTmFtZSwgcHNldWRvRWxlbWVudF0gb2YgW1xuXHRcdFx0W2RlY29yYXRpb24ubGFiZWxDbGFzc05hbWUsIHVuZGVmaW5lZF0sXG5cdFx0XHRbZGVjb3JhdGlvbi5iYWRnZUNsYXNzTmFtZSwgJzo6YWZ0ZXInXSxcblx0XHRcdFtidWJibGVEZWNvcmF0aW9uLmJhZGdlQ2xhc3NOYW1lLCAnOjphZnRlciddXG5cdFx0XSBhcyBjb25zdCkge1xuXHRcdFx0Y29uc3QgZWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdFx0ZWxlbWVudC5jbGFzc05hbWUgPSBjbGFzc05hbWU7XG5cdFx0XHRlbGVtZW50LnN0eWxlLnNldFByb3BlcnR5KCctLXZzY29kZS1sb3dQcmlvcml0eUNvbG9yJywgJyNmZjAwMDAnKTtcblx0XHRcdGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQoZWxlbWVudCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChET00uZ2V0V2luZG93KGVsZW1lbnQpLmdldENvbXB1dGVkU3R5bGUoZWxlbWVudCwgcHNldWRvRWxlbWVudCkuY29sb3IsICdyZ2IoMjU1LCAwLCAwKScpO1xuXHRcdFx0ZWxlbWVudC5yZW1vdmUoKTtcblx0XHR9XG5cblx0XHRkZWNvcmF0aW9uLmRpc3Bvc2UoKTtcblx0XHRidWJibGVEZWNvcmF0aW9uLmRpc3Bvc2UoKTtcblx0XHRoaWdoUHJpb3JpdHkuZGlzcG9zZSgpO1xuXHRcdGxvd1ByaW9yaXR5LmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnQ2xlYXIgZGVjb3JhdGlvbnMgb24gcHJvdmlkZXIgZGlzcG9zZScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cblx0XHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZSgnZm9vOmJhcicpO1xuXHRcdFx0bGV0IGNhbGxDb3VudGVyID0gMDtcblxuXHRcdFx0Y29uc3QgcmVnID0gc2VydmljZS5yZWdpc3RlckRlY29yYXRpb25zUHJvdmlkZXIobmV3IGNsYXNzIGltcGxlbWVudHMgSURlY29yYXRpb25zUHJvdmlkZXIge1xuXHRcdFx0XHRyZWFkb25seSBsYWJlbDogc3RyaW5nID0gJ1Rlc3QnO1xuXHRcdFx0XHRyZWFkb25seSBvbkRpZENoYW5nZTogRXZlbnQ8cmVhZG9ubHkgVVJJW10+ID0gRXZlbnQuTm9uZTtcblx0XHRcdFx0cHJvdmlkZURlY29yYXRpb25zKHVyaTogVVJJKSB7XG5cdFx0XHRcdFx0Y2FsbENvdW50ZXIgKz0gMTtcblx0XHRcdFx0XHRyZXR1cm4geyBjb2xvcjogJ3NvbWVCbHVlJywgdG9vbHRpcDogJ0onIH07XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXG5cdFx0XHQvLyB0cmlnZ2VyIC0+IHN5bmNcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2VydmljZS5nZXREZWNvcmF0aW9uKHVyaSwgZmFsc2UpIS50b29sdGlwLCAnSicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNhbGxDb3VudGVyLCAxKTtcblxuXHRcdFx0Ly8gdW4tcmVnaXN0ZXIgLT4gZW5zdXJlIGdvb2QgZXZlbnRcblx0XHRcdGxldCBkaWRTZWVFdmVudCA9IGZhbHNlO1xuXHRcdFx0Y29uc3QgcCA9IG5ldyBQcm9taXNlPHZvaWQ+KHJlc29sdmUgPT4ge1xuXHRcdFx0XHRjb25zdCBsID0gc2VydmljZS5vbkRpZENoYW5nZURlY29yYXRpb25zKGUgPT4ge1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlLmFmZmVjdHNSZXNvdXJjZSh1cmkpLCB0cnVlKTtcblx0XHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlcnZpY2UuZ2V0RGVjb3JhdGlvbih1cmksIGZhbHNlKSwgdW5kZWZpbmVkKTtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2FsbENvdW50ZXIsIDEpO1xuXHRcdFx0XHRcdGRpZFNlZUV2ZW50ID0gdHJ1ZTtcblx0XHRcdFx0XHRsLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRyZXNvbHZlKCk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cdFx0XHRyZWcuZGlzcG9zZSgpOyAvLyB3aWxsIGNsZWFyIGFsbCBkYXRhXG5cdFx0XHRhd2FpdCBwO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpZFNlZUV2ZW50LCB0cnVlKTtcblxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdObyBkZWZhdWx0IGJ1YmJsaW5nJywgZnVuY3Rpb24gKCkge1xuXG5cdFx0bGV0IHJlZyA9IHNlcnZpY2UucmVnaXN0ZXJEZWNvcmF0aW9uc1Byb3ZpZGVyKHtcblx0XHRcdGxhYmVsOiAnVGVzdCcsXG5cdFx0XHRvbkRpZENoYW5nZTogRXZlbnQuTm9uZSxcblx0XHRcdHByb3ZpZGVEZWNvcmF0aW9ucyh1cmk6IFVSSSkge1xuXHRcdFx0XHRyZXR1cm4gdXJpLnBhdGgubWF0Y2goL1xcLnR4dC8pXG5cdFx0XHRcdFx0PyB7IHRvb2x0aXA6ICcudHh0Jywgd2VpZ2h0OiAxNyB9XG5cdFx0XHRcdFx0OiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRjb25zdCBjaGlsZFVyaSA9IFVSSS5wYXJzZSgnZmlsZTovLy9zb21lL3BhdGgvc29tZS9maWxlLnR4dCcpO1xuXG5cdFx0bGV0IGRlY28gPSBzZXJ2aWNlLmdldERlY29yYXRpb24oY2hpbGRVcmksIGZhbHNlKSE7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRlY28udG9vbHRpcCwgJy50eHQnKTtcblxuXHRcdGRlY28gPSBzZXJ2aWNlLmdldERlY29yYXRpb24oY2hpbGRVcmkud2l0aCh7IHBhdGg6ICdzb21lL3BhdGgvJyB9KSwgdHJ1ZSkhO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkZWNvLCB1bmRlZmluZWQpO1xuXHRcdHJlZy5kaXNwb3NlKCk7XG5cblx0XHQvLyBidWJibGVcblx0XHRyZWcgPSBzZXJ2aWNlLnJlZ2lzdGVyRGVjb3JhdGlvbnNQcm92aWRlcih7XG5cdFx0XHRsYWJlbDogJ1Rlc3QnLFxuXHRcdFx0b25EaWRDaGFuZ2U6IEV2ZW50Lk5vbmUsXG5cdFx0XHRwcm92aWRlRGVjb3JhdGlvbnModXJpOiBVUkkpIHtcblx0XHRcdFx0cmV0dXJuIHVyaS5wYXRoLm1hdGNoKC9cXC50eHQvKVxuXHRcdFx0XHRcdD8geyB0b29sdGlwOiAnLnR4dC5idWJibGUnLCB3ZWlnaHQ6IDcxLCBidWJibGU6IHRydWUgfVxuXHRcdFx0XHRcdDogdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0ZGVjbyA9IHNlcnZpY2UuZ2V0RGVjb3JhdGlvbihjaGlsZFVyaSwgZmFsc2UpITtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGVjby50b29sdGlwLCAnLnR4dC5idWJibGUnKTtcblxuXHRcdGRlY28gPSBzZXJ2aWNlLmdldERlY29yYXRpb24oY2hpbGRVcmkud2l0aCh7IHBhdGg6ICdzb21lL3BhdGgvJyB9KSwgdHJ1ZSkhO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0eXBlb2YgZGVjby50b29sdGlwLCAnc3RyaW5nJyk7XG5cdFx0cmVnLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnRGVjb3JhdGlvbnMgbm90IHNob3dpbmcgdXAgZm9yIHNlY29uZCByb290IGZvbGRlciAjNDg1MDInLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cblx0XHRsZXQgY2FuY2VsQ291bnQgPSAwO1xuXHRcdGxldCBjYWxsQ291bnQgPSAwO1xuXG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBuZXcgY2xhc3MgaW1wbGVtZW50cyBJRGVjb3JhdGlvbnNQcm92aWRlciB7XG5cblx0XHRcdF9vbkRpZENoYW5nZSA9IG5ldyBFbWl0dGVyPFVSSVtdPigpO1xuXHRcdFx0cmVhZG9ubHkgb25EaWRDaGFuZ2U6IEV2ZW50PHJlYWRvbmx5IFVSSVtdPiA9IHRoaXMuX29uRGlkQ2hhbmdlLmV2ZW50O1xuXG5cdFx0XHRsYWJlbDogc3RyaW5nID0gJ2Zvbyc7XG5cblx0XHRcdHByb3ZpZGVEZWNvcmF0aW9ucyh1cmk6IFVSSSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJRGVjb3JhdGlvbkRhdGE+IHtcblxuXHRcdFx0XHRzdG9yZS5hZGQodG9rZW4ub25DYW5jZWxsYXRpb25SZXF1ZXN0ZWQoKCkgPT4ge1xuXHRcdFx0XHRcdGNhbmNlbENvdW50ICs9IDE7XG5cdFx0XHRcdH0pKTtcblxuXHRcdFx0XHRyZXR1cm4gbmV3IFByb21pc2UocmVzb2x2ZSA9PiB7XG5cdFx0XHRcdFx0Y2FsbENvdW50ICs9IDE7XG5cdFx0XHRcdFx0c2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHRcdFx0XHRyZXNvbHZlKHsgbGV0dGVyOiAnZm9vJyB9KTtcblx0XHRcdFx0XHR9LCAxMCk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRjb25zdCByZWcgPSBzZXJ2aWNlLnJlZ2lzdGVyRGVjb3JhdGlvbnNQcm92aWRlcihwcm92aWRlcik7XG5cblx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UoJ2ZvbzovL2JhcicpO1xuXHRcdGNvbnN0IGQxID0gc2VydmljZS5nZXREZWNvcmF0aW9uKHVyaSwgZmFsc2UpO1xuXG5cdFx0cHJvdmlkZXIuX29uRGlkQ2hhbmdlLmZpcmUoW3VyaV0pO1xuXHRcdGNvbnN0IGQyID0gc2VydmljZS5nZXREZWNvcmF0aW9uKHVyaSwgZmFsc2UpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNhbmNlbENvdW50LCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2FsbENvdW50LCAyKTtcblxuXHRcdGQxPy5kaXNwb3NlKCk7XG5cdFx0ZDI/LmRpc3Bvc2UoKTtcblx0XHRyZWcuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdEZWNvcmF0aW9ucyBub3QgYnViYmxpbmcuLi4gIzQ4NzQ1JywgZnVuY3Rpb24gKCkge1xuXG5cdFx0Y29uc3QgcmVnID0gc2VydmljZS5yZWdpc3RlckRlY29yYXRpb25zUHJvdmlkZXIoe1xuXHRcdFx0bGFiZWw6ICdUZXN0Jyxcblx0XHRcdG9uRGlkQ2hhbmdlOiBFdmVudC5Ob25lLFxuXHRcdFx0cHJvdmlkZURlY29yYXRpb25zKHVyaTogVVJJKSB7XG5cdFx0XHRcdGlmICh1cmkucGF0aC5tYXRjaCgvaGVsbG8kLykpIHtcblx0XHRcdFx0XHRyZXR1cm4geyB0b29sdGlwOiAnRk9PJywgd2VpZ2h0OiAxNywgYnViYmxlOiB0cnVlIH07XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cmV0dXJuIG5ldyBQcm9taXNlPElEZWNvcmF0aW9uRGF0YT4oX3Jlc29sdmUgPT4geyB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgZGF0YTEgPSBzZXJ2aWNlLmdldERlY29yYXRpb24oVVJJLnBhcnNlKCdhOmIvJyksIHRydWUpO1xuXHRcdGFzc2VydC5vayghZGF0YTEpO1xuXG5cdFx0Y29uc3QgZGF0YTIgPSBzZXJ2aWNlLmdldERlY29yYXRpb24oVVJJLnBhcnNlKCdhOmIvYy5oZWxsbycpLCBmYWxzZSkhO1xuXHRcdGFzc2VydC5vayhkYXRhMi50b29sdGlwKTtcblxuXHRcdGNvbnN0IGRhdGEzID0gc2VydmljZS5nZXREZWNvcmF0aW9uKFVSSS5wYXJzZSgnYTpiLycpLCB0cnVlKTtcblx0XHRhc3NlcnQub2soZGF0YTMpO1xuXG5cblx0XHRyZWcuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdGb2xkZXIgZGVjb3JhdGlvbnMgZG9uXFwndCBnbyBhd2F5IHdoZW4gZmlsZSB3aXRoIHByb2JsZW1zIGlzIGRlbGV0ZWQgIzYxOTE5IChwYXJ0MSknLCBmdW5jdGlvbiAoKSB7XG5cblx0XHRjb25zdCBlbWl0dGVyID0gbmV3IEVtaXR0ZXI8VVJJW10+KCk7XG5cdFx0bGV0IGdvbmUgPSBmYWxzZTtcblx0XHRjb25zdCByZWcgPSBzZXJ2aWNlLnJlZ2lzdGVyRGVjb3JhdGlvbnNQcm92aWRlcih7XG5cdFx0XHRsYWJlbDogJ1Rlc3QnLFxuXHRcdFx0b25EaWRDaGFuZ2U6IGVtaXR0ZXIuZXZlbnQsXG5cdFx0XHRwcm92aWRlRGVjb3JhdGlvbnModXJpOiBVUkkpIHtcblx0XHRcdFx0aWYgKCFnb25lICYmIHVyaS5wYXRoLm1hdGNoKC9maWxlLnRzJC8pKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHsgdG9vbHRpcDogJ0ZPTycsIHdlaWdodDogMTcsIGJ1YmJsZTogdHJ1ZSB9O1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UoJ2ZvbzovZm9sZGVyL2ZpbGUudHMnKTtcblx0XHRjb25zdCB1cmkyID0gVVJJLnBhcnNlKCdmb286L2ZvbGRlci8nKTtcblx0XHRsZXQgZGF0YSA9IHNlcnZpY2UuZ2V0RGVjb3JhdGlvbih1cmksIHRydWUpITtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGF0YS50b29sdGlwLCAnRk9PJyk7XG5cblx0XHRkYXRhID0gc2VydmljZS5nZXREZWNvcmF0aW9uKHVyaTIsIHRydWUpITtcblx0XHRhc3NlcnQub2soZGF0YS50b29sdGlwKTsgLy8gZW1waGF6aWVkIGl0ZW1zLi4uXG5cblx0XHRnb25lID0gdHJ1ZTtcblx0XHRlbWl0dGVyLmZpcmUoW3VyaV0pO1xuXG5cdFx0ZGF0YSA9IHNlcnZpY2UuZ2V0RGVjb3JhdGlvbih1cmksIHRydWUpITtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGF0YSwgdW5kZWZpbmVkKTtcblxuXHRcdGRhdGEgPSBzZXJ2aWNlLmdldERlY29yYXRpb24odXJpMiwgdHJ1ZSkhO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkYXRhLCB1bmRlZmluZWQpO1xuXG5cdFx0cmVnLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnRm9sZGVyIGRlY29yYXRpb25zIGRvblxcJ3QgZ28gYXdheSB3aGVuIGZpbGUgd2l0aCBwcm9ibGVtcyBpcyBkZWxldGVkICM2MTkxOSAocGFydDIpJywgZnVuY3Rpb24gKCkge1xuXG5cdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgZnVuY3Rpb24gKCkge1xuXG5cdFx0XHRjb25zdCBlbWl0dGVyID0gbmV3IEVtaXR0ZXI8VVJJW10+KCk7XG5cdFx0XHRsZXQgZ29uZSA9IGZhbHNlO1xuXHRcdFx0Y29uc3QgcmVnID0gc2VydmljZS5yZWdpc3RlckRlY29yYXRpb25zUHJvdmlkZXIoe1xuXHRcdFx0XHRsYWJlbDogJ1Rlc3QnLFxuXHRcdFx0XHRvbkRpZENoYW5nZTogZW1pdHRlci5ldmVudCxcblx0XHRcdFx0cHJvdmlkZURlY29yYXRpb25zKHVyaTogVVJJKSB7XG5cdFx0XHRcdFx0aWYgKCFnb25lICYmIHVyaS5wYXRoLm1hdGNoKC9maWxlLnRzJC8pKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4geyB0b29sdGlwOiAnRk9PJywgd2VpZ2h0OiAxNywgYnViYmxlOiB0cnVlIH07XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UoJ2ZvbzovZm9sZGVyL2ZpbGUudHMnKTtcblx0XHRcdGNvbnN0IHVyaTIgPSBVUkkucGFyc2UoJ2ZvbzovZm9sZGVyLycpO1xuXHRcdFx0bGV0IGRhdGEgPSBzZXJ2aWNlLmdldERlY29yYXRpb24odXJpLCB0cnVlKSE7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGF0YS50b29sdGlwLCAnRk9PJyk7XG5cblx0XHRcdGRhdGEgPSBzZXJ2aWNlLmdldERlY29yYXRpb24odXJpMiwgdHJ1ZSkhO1xuXHRcdFx0YXNzZXJ0Lm9rKGRhdGEudG9vbHRpcCk7IC8vIGVtcGhhemllZCBpdGVtcy4uLlxuXG5cdFx0XHRyZXR1cm4gbmV3IFByb21pc2U8dm9pZD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdFx0XHRjb25zdCBsID0gc2VydmljZS5vbkRpZENoYW5nZURlY29yYXRpb25zKGUgPT4ge1xuXHRcdFx0XHRcdGwuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRhc3NlcnQub2soZS5hZmZlY3RzUmVzb3VyY2UodXJpKSk7XG5cdFx0XHRcdFx0XHRhc3NlcnQub2soZS5hZmZlY3RzUmVzb3VyY2UodXJpMikpO1xuXHRcdFx0XHRcdFx0cmVzb2x2ZSgpO1xuXHRcdFx0XHRcdFx0cmVnLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0XHRcdHJlamVjdChlcnIpO1xuXHRcdFx0XHRcdFx0cmVnLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRnb25lID0gdHJ1ZTtcblx0XHRcdFx0ZW1pdHRlci5maXJlKFt1cmldKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdGaWxlRGVjb3JhdGlvblByb3ZpZGVyIGludGVybWl0dGVudGx5IGZhaWxzICMxMzMyMTAnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cblx0XHRjb25zdCBpbnZva2VPcmRlcjogc3RyaW5nW10gPSBbXTtcblxuXHRcdHN0b3JlLmFkZChzZXJ2aWNlLnJlZ2lzdGVyRGVjb3JhdGlvbnNQcm92aWRlcihuZXcgY2xhc3Mge1xuXHRcdFx0bGFiZWwgPSAnUHJvdmlkZXItMSc7XG5cdFx0XHRvbkRpZENoYW5nZSA9IEV2ZW50Lk5vbmU7XG5cdFx0XHRwcm92aWRlRGVjb3JhdGlvbnMoKSB7XG5cdFx0XHRcdGludm9rZU9yZGVyLnB1c2godGhpcy5sYWJlbCk7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0c3RvcmUuYWRkKHNlcnZpY2UucmVnaXN0ZXJEZWNvcmF0aW9uc1Byb3ZpZGVyKG5ldyBjbGFzcyB7XG5cdFx0XHRsYWJlbCA9ICdQcm92aWRlci0yJztcblx0XHRcdG9uRGlkQ2hhbmdlID0gRXZlbnQuTm9uZTtcblx0XHRcdHByb3ZpZGVEZWNvcmF0aW9ucygpIHtcblx0XHRcdFx0aW52b2tlT3JkZXIucHVzaCh0aGlzLmxhYmVsKTtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRzZXJ2aWNlLmdldERlY29yYXRpb24oVVJJLnBhcnNlKCd0ZXN0Oi8vbWUvcGF0aCcpLCBmYWxzZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGludm9rZU9yZGVyLCBbJ1Byb3ZpZGVyLTInLCAnUHJvdmlkZXItMSddKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLDBCQUEwQjtBQUVuQyxTQUFTLFdBQVc7QUFDcEIsU0FBUyxPQUFPLGVBQWU7QUFDL0IsWUFBWSxlQUFlO0FBRTNCLFNBQVMsWUFBWTtBQUVyQixTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLCtDQUErQztBQUN4RCxZQUFZLFNBQVM7QUFFckIsTUFBTSxzQkFBc0IsV0FBWTtBQUV2QyxNQUFJO0FBRUosUUFBTSxXQUFZO0FBQ2pCLGNBQVUsSUFB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
