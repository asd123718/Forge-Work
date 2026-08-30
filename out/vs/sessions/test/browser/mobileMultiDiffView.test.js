import assert from "assert";
import { mainWindow } from "../../../base/browser/window.js";
import { EventType as TouchEventType } from "../../../base/browser/touch.js";
import { toDisposable } from "../../../base/common/lifecycle.js";
import { URI } from "../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../base/test/common/utils.js";
import { MobileMultiDiffView } from "../../browser/parts/mobile/contributions/mobileMultiDiffView.js";
suite("MobileMultiDiffView", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  test("loads visible files incrementally instead of batching the initial viewport", async () => {
    const fileCount = 100;
    const files = /* @__PURE__ */ new Map();
    const diffs = [];
    for (let i = 0; i < fileCount; i++) {
      const originalURI = URI.parse(`inmemory://original/src/file${i}.ts`);
      const modifiedURI = URI.parse(`inmemory://modified/src/file${i}.ts`);
      files.set(originalURI.toString(), `export const value${i} = ${i};
`);
      files.set(modifiedURI.toString(), `export const value${i} = ${i + 1};
`);
      diffs.push({
        originalURI,
        modifiedURI,
        identical: false,
        added: 1,
        removed: 1
      });
    }
    const readUris = [];
    const textFileService = {
      read(uri) {
        readUris.push(uri.toString());
        return Promise.resolve({ value: files.get(uri.toString()) ?? "" });
      }
    };
    const fileService = {};
    const languageService = {
      guessLanguageIdByFilepathOrFirstLine() {
        return "typescript";
      }
    };
    const container = document.createElement("div");
    document.body.appendChild(container);
    store.add(toDisposable(() => container.remove()));
    const view = store.add(new MobileMultiDiffView(container, { diffs }, textFileService, fileService, languageService));
    await animationFrames(2);
    const initialReadCount = readUris.length;
    assert.strictEqual(initialReadCount, 2, "opening the view should load one visible file pair");
    const initialMountedSections = container.querySelectorAll(".mobile-multi-diff-file-section").length;
    assert.ok(initialMountedSections > 0, "opening the view should mount visible file sections");
    assert.ok(initialMountedSections < fileCount, "opening the view should not mount every file section");
    const scrollWrapper = container.querySelector(".mobile-overlay-scroll");
    assert.ok(scrollWrapper, "scroll wrapper should exist");
    const virtualContent = container.querySelector(".mobile-multi-diff-virtual-content");
    assert.ok(virtualContent, "virtual content should exist");
    let appendChildCount = 0;
    const originalAppendChild = virtualContent.appendChild;
    virtualContent.appendChild = function(node) {
      appendChildCount++;
      return originalAppendChild.call(this, node);
    };
    store.add(toDisposable(() => {
      virtualContent.appendChild = originalAppendChild;
    }));
    scrollWrapper.scrollTop = scrollWrapper.scrollHeight;
    scrollWrapper.dispatchEvent(new Event("scroll"));
    await animationFrames(2);
    assert.ok(readUris.length > initialReadCount, "scrolling should load more files");
    assert.ok(readUris.length <= initialReadCount + 4, "scrolling should load at most one additional file pair per frame");
    const mountedSectionsAfterScroll = container.querySelectorAll(".mobile-multi-diff-file-section").length;
    assert.ok(mountedSectionsAfterScroll > 0, "scrolling should mount file sections for the new viewport");
    assert.ok(mountedSectionsAfterScroll < fileCount, "scrolling should still not mount every file section");
    scrollWrapper.scrollTop = 0;
    scrollWrapper.dispatchEvent(new Event("scroll"));
    await animationFrames(2);
    assert.strictEqual(new Set(readUris).size, readUris.length, "remounting loaded files should not reread resources");
    assert.strictEqual(appendChildCount, 0, "scrolling should not reappend mounted file sections");
    view.dispose();
  });
  test("uses a larger tappable file header to expand and collapse sections", async () => {
    const originalURI = URI.parse("inmemory://original/src/toggle.ts");
    const modifiedURI = URI.parse("inmemory://modified/src/toggle.ts");
    const files = /* @__PURE__ */ new Map([
      [originalURI.toString(), "export const value = 1;\n"],
      [modifiedURI.toString(), "export const value = 2;\n"]
    ]);
    const textFileService = {
      read(uri) {
        return Promise.resolve({ value: files.get(uri.toString()) ?? "" });
      }
    };
    const fileService = {};
    const languageService = {
      guessLanguageIdByFilepathOrFirstLine() {
        return "typescript";
      }
    };
    const container = document.createElement("div");
    document.body.appendChild(container);
    store.add(toDisposable(() => container.remove()));
    const view = store.add(new MobileMultiDiffView(container, {
      diffs: [{
        originalURI,
        modifiedURI,
        identical: false,
        added: 1,
        removed: 1
      }]
    }, textFileService, fileService, languageService));
    const section = container.querySelector(".mobile-multi-diff-file-section");
    assert.ok(section, "file section should exist");
    const header = section.querySelector(".mobile-multi-diff-file-header");
    assert.ok(header, "file header should exist");
    const chevron = header.querySelector(".mobile-multi-diff-file-chevron");
    assert.ok(chevron, "file header chevron should exist");
    assert.strictEqual(mainWindow.getComputedStyle(header).height, "44px", "file header should be a touch-friendly height");
    header.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    assert.ok(section.classList.contains("collapsed"), "tapping the header should collapse the file section");
    assert.strictEqual(chevron.getAttribute("aria-expanded"), "false");
    chevron.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    assert.ok(!section.classList.contains("collapsed"), "tapping the chevron should expand once without bubbling into a second toggle");
    assert.strictEqual(chevron.getAttribute("aria-expanded"), "true");
    chevron.dispatchEvent(new Event(TouchEventType.Tap, { bubbles: true, cancelable: true }));
    assert.ok(section.classList.contains("collapsed"), "touch tapping the chevron should collapse through the header target");
    assert.strictEqual(chevron.getAttribute("aria-expanded"), "false");
    view.dispose();
  });
  test("virtualizes rows inside a loaded large file body", async () => {
    const lineCount = 200;
    const originalURI = URI.parse("inmemory://original/src/large.ts");
    const modifiedURI = URI.parse("inmemory://modified/src/large.ts");
    const originalText = Array.from({ length: lineCount }, (_, i) => `export const fileValue${i} = ${i};`).join("\n");
    const modifiedText = Array.from({ length: lineCount }, (_, i) => `export const fileValue${i} = ${i + 1e3};`).join("\n");
    const files = /* @__PURE__ */ new Map([
      [originalURI.toString(), originalText],
      [modifiedURI.toString(), modifiedText]
    ]);
    const textFileService = {
      read(uri) {
        return Promise.resolve({ value: files.get(uri.toString()) ?? "" });
      }
    };
    const fileService = {};
    const languageService = {
      guessLanguageIdByFilepathOrFirstLine() {
        return "typescript";
      }
    };
    const container = document.createElement("div");
    document.body.appendChild(container);
    store.add(toDisposable(() => container.remove()));
    const view = store.add(new MobileMultiDiffView(container, {
      diffs: [{
        originalURI,
        modifiedURI,
        identical: false,
        added: lineCount,
        removed: lineCount
      }]
    }, textFileService, fileService, languageService));
    await waitForCondition(() => container.querySelectorAll(".mobile-diff-line").length > 0, "loaded file should render visible rows");
    const renderedRows = container.querySelectorAll(".mobile-diff-line").length;
    assert.ok(renderedRows < lineCount * 2, "loaded file should not render every diff row");
    const bodyInner = container.querySelector(".mobile-multi-diff-file-content-inner");
    assert.ok(bodyInner, "loaded file should render a stable body wrapper");
    assertEntryOrder(container);
    const scrollWrapper = container.querySelector(".mobile-overlay-scroll");
    assert.ok(scrollWrapper, "scroll wrapper should exist");
    scrollWrapper.scrollTop = 1200;
    scrollWrapper.dispatchEvent(new Event("scroll"));
    await waitForCondition(() => container.querySelector(".mobile-multi-diff-file-content-inner") === bodyInner, "scrolling should keep the same body wrapper");
    const renderedRowsAfterScroll = container.querySelectorAll(".mobile-diff-line").length;
    assert.ok(renderedRowsAfterScroll < lineCount * 2, "scrolling should keep rendering only the visible diff rows");
    assertEntryOrder(container);
    view.dispose();
  });
  test("prefetches the next file near a boundary without mounting its section", async () => {
    const fileCount = 3;
    const lineCount = 200;
    const files = /* @__PURE__ */ new Map();
    const diffs = [];
    for (let i = 0; i < fileCount; i++) {
      const originalURI = URI.parse(`inmemory://original/src/prefetch${i}.ts`);
      const modifiedURI = URI.parse(`inmemory://modified/src/prefetch${i}.ts`);
      files.set(originalURI.toString(), Array.from({ length: lineCount }, (_, line) => `export const value${line} = ${line};`).join("\n"));
      files.set(modifiedURI.toString(), Array.from({ length: lineCount }, (_, line) => `export const value${line} = ${line + 1e3};`).join("\n"));
      diffs.push({
        originalURI,
        modifiedURI,
        identical: false,
        added: lineCount,
        removed: lineCount
      });
    }
    const readUris = [];
    const textFileService = {
      read(uri) {
        readUris.push(uri.toString());
        return Promise.resolve({ value: files.get(uri.toString()) ?? "" });
      }
    };
    const fileService = {};
    const languageService = {
      guessLanguageIdByFilepathOrFirstLine() {
        return "typescript";
      }
    };
    const container = document.createElement("div");
    document.body.appendChild(container);
    store.add(toDisposable(() => container.remove()));
    const view = store.add(new MobileMultiDiffView(container, { diffs }, textFileService, fileService, languageService));
    await waitForCondition(() => container.querySelectorAll(".mobile-diff-line").length > 0, "first file should load before prefetching near its boundary");
    assert.ok(readUris.some((uri) => uri.includes("prefetch0.ts")), "opening should read the first file");
    assert.ok(!readUris.some((uri) => uri.includes("prefetch1.ts")), "opening should not immediately prefetch the next large file");
    const scrollWrapper = container.querySelector(".mobile-overlay-scroll");
    assert.ok(scrollWrapper, "scroll wrapper should exist");
    scrollWrapper.scrollTop = 5e3;
    scrollWrapper.dispatchEvent(new Event("scroll"));
    await waitForCondition(() => readUris.some((uri) => uri.includes("prefetch1.ts")), "approaching a file boundary should prefetch the next file");
    assert.strictEqual(container.querySelector('.mobile-multi-diff-file-section[data-index="1"]'), null, "prefetching should not mount the next file section");
    assert.ok(!readUris.some((uri) => uri.includes("prefetch2.ts")), "prefetching should stay bounded to the near file");
    view.dispose();
  });
  test("starts loading the newly visible file while an older load is pending", async () => {
    const fileCount = 40;
    const files = /* @__PURE__ */ new Map();
    const diffs = [];
    for (let i = 0; i < fileCount; i++) {
      const originalURI = URI.parse(`inmemory://original/src/file${i}.ts`);
      const modifiedURI = URI.parse(`inmemory://modified/src/file${i}.ts`);
      files.set(originalURI.toString(), `export const value${i} = ${i};
`);
      files.set(modifiedURI.toString(), `export const value${i} = ${i + 1};
`);
      diffs.push({
        originalURI,
        modifiedURI,
        identical: false,
        added: 100,
        removed: 100
      });
    }
    const readUris = [];
    const pendingReads = /* @__PURE__ */ new Map();
    const textFileService = {
      read(uri) {
        readUris.push(uri.toString());
        const pending = deferred();
        pendingReads.set(uri.toString(), pending);
        return pending.promise;
      }
    };
    const fileService = {};
    const languageService = {
      guessLanguageIdByFilepathOrFirstLine() {
        return "typescript";
      }
    };
    const container = document.createElement("div");
    document.body.appendChild(container);
    store.add(toDisposable(() => container.remove()));
    const view = store.add(new MobileMultiDiffView(container, { diffs }, textFileService, fileService, languageService));
    await animationFrames(2);
    assert.ok(readUris.some((uri) => uri.includes("file0.ts")), "opening the view should start loading the first file");
    const scrollWrapper = container.querySelector(".mobile-overlay-scroll");
    assert.ok(scrollWrapper, "scroll wrapper should exist");
    scrollWrapper.scrollTop = scrollWrapper.scrollHeight;
    scrollWrapper.dispatchEvent(new Event("scroll"));
    await animationFrames(3);
    assert.ok(readUris.some((uri) => uri.includes(`file${fileCount - 1}.ts`)), "scrolling should start loading the newly visible file even while the first file is pending");
    view.dispose();
    resolvePendingReads(pendingReads, files);
  });
  test("keeps an unloaded large file body covered by a sticky loading placeholder", async () => {
    const fileCount = 3;
    const files = /* @__PURE__ */ new Map();
    const diffs = [];
    for (let i = 0; i < fileCount; i++) {
      const originalURI = URI.parse(`inmemory://original/src/large${i}.ts`);
      const modifiedURI = URI.parse(`inmemory://modified/src/large${i}.ts`);
      files.set(originalURI.toString(), `export const value${i} = ${i};
`);
      files.set(modifiedURI.toString(), `export const value${i} = ${i + 1};
`);
      diffs.push({
        originalURI,
        modifiedURI,
        identical: false,
        added: 1e3,
        removed: 1e3
      });
    }
    const pendingReads = /* @__PURE__ */ new Map();
    const textFileService = {
      read(uri) {
        const pending = deferred();
        pendingReads.set(uri.toString(), pending);
        return pending.promise;
      }
    };
    const fileService = {};
    const languageService = {
      guessLanguageIdByFilepathOrFirstLine() {
        return "typescript";
      }
    };
    const container = document.createElement("div");
    document.body.appendChild(container);
    store.add(toDisposable(() => container.remove()));
    const view = store.add(new MobileMultiDiffView(container, { diffs }, textFileService, fileService, languageService));
    await animationFrames(2);
    const scrollWrapper = container.querySelector(".mobile-overlay-scroll");
    assert.ok(scrollWrapper, "scroll wrapper should exist");
    scrollWrapper.scrollTop = scrollWrapper.scrollHeight;
    scrollWrapper.dispatchEvent(new Event("scroll"));
    await animationFrames(2);
    const placeholderContent = Array.from(container.querySelectorAll(".mobile-multi-diff-file-content-placeholder"));
    const bottomFileContent = placeholderContent.find((content) => Number(content.parentElement.dataset.index) === fileCount - 1);
    assert.ok(bottomFileContent, "the unloaded file at the new scroll position should render placeholder content");
    assert.strictEqual(bottomFileContent.style.transform, "", "loading placeholders should not rely on JS scroll transforms");
    assert.ok(bottomFileContent.style.height, "the placeholder should reserve the file body height");
    const emptyState = bottomFileContent.querySelector(".mobile-diff-empty-state");
    assert.ok(emptyState, "the placeholder should contain a loading message");
    assert.ok(emptyState.textContent?.includes("Loading"), "the placeholder should not be blank");
    assert.ok(emptyState.style.height, "the placeholder message should reserve visible viewport height");
    assert.strictEqual(mainWindow.getComputedStyle(emptyState).position, "sticky", "the loading message should remain visible during native scroll");
    view.dispose();
    resolvePendingReads(pendingReads, files);
  });
});
function animationFrame() {
  return new Promise((resolve) => mainWindow.requestAnimationFrame(() => resolve()));
}
async function animationFrames(count) {
  for (let i = 0; i < count; i++) {
    await animationFrame();
  }
}
async function waitForCondition(condition, message) {
  for (let i = 0; i < 60; i++) {
    if (condition()) {
      return;
    }
    await animationFrame();
  }
  assert.fail(message);
}
function assertEntryOrder(container) {
  const indexes = Array.from(container.querySelectorAll(".mobile-multi-diff-body-entry"), (element) => Number(element.dataset.entryIndex));
  assert.deepStrictEqual(indexes, indexes.slice().sort((a, b) => a - b), "rendered body entries should stay in document order");
}
function deferred() {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
function resolvePendingReads(pendingReads, files) {
  for (const [uri, pending] of pendingReads) {
    pending.resolve({ value: files.get(uri) ?? "" });
  }
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcdGVzdFxcYnJvd3NlclxcbW9iaWxlTXVsdGlEaWZmVmlldy50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgbWFpbldpbmRvdyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci93aW5kb3cuanMnO1xuaW1wb3J0IHsgRXZlbnRUeXBlIGFzIFRvdWNoRXZlbnRUeXBlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL3RvdWNoLmpzJztcbmltcG9ydCB7IHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzL2xhbmd1YWdlLmpzJztcbmltcG9ydCB7IElUZXh0RmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi93b3JrYmVuY2gvc2VydmljZXMvdGV4dGZpbGUvY29tbW9uL3RleHRmaWxlcy5qcyc7XG5pbXBvcnQgeyBNb2JpbGVNdWx0aURpZmZWaWV3IH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9wYXJ0cy9tb2JpbGUvY29udHJpYnV0aW9ucy9tb2JpbGVNdWx0aURpZmZWaWV3LmpzJztcbmltcG9ydCB7IElGaWxlRGlmZlZpZXdEYXRhIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9wYXJ0cy9tb2JpbGUvY29udHJpYnV0aW9ucy9tb2JpbGVEaWZmVmlldy5qcyc7XG5cbnN1aXRlKCdNb2JpbGVNdWx0aURpZmZWaWV3JywgKCkgPT4ge1xuXHRjb25zdCBzdG9yZSA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ2xvYWRzIHZpc2libGUgZmlsZXMgaW5jcmVtZW50YWxseSBpbnN0ZWFkIG9mIGJhdGNoaW5nIHRoZSBpbml0aWFsIHZpZXdwb3J0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGZpbGVDb3VudCA9IDEwMDtcblx0XHRjb25zdCBmaWxlcyA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG5cdFx0Y29uc3QgZGlmZnM6IElGaWxlRGlmZlZpZXdEYXRhW10gPSBbXTtcblxuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgZmlsZUNvdW50OyBpKyspIHtcblx0XHRcdGNvbnN0IG9yaWdpbmFsVVJJID0gVVJJLnBhcnNlKGBpbm1lbW9yeTovL29yaWdpbmFsL3NyYy9maWxlJHtpfS50c2ApO1xuXHRcdFx0Y29uc3QgbW9kaWZpZWRVUkkgPSBVUkkucGFyc2UoYGlubWVtb3J5Oi8vbW9kaWZpZWQvc3JjL2ZpbGUke2l9LnRzYCk7XG5cdFx0XHRmaWxlcy5zZXQob3JpZ2luYWxVUkkudG9TdHJpbmcoKSwgYGV4cG9ydCBjb25zdCB2YWx1ZSR7aX0gPSAke2l9O1xcbmApO1xuXHRcdFx0ZmlsZXMuc2V0KG1vZGlmaWVkVVJJLnRvU3RyaW5nKCksIGBleHBvcnQgY29uc3QgdmFsdWUke2l9ID0gJHtpICsgMX07XFxuYCk7XG5cdFx0XHRkaWZmcy5wdXNoKHtcblx0XHRcdFx0b3JpZ2luYWxVUkksXG5cdFx0XHRcdG1vZGlmaWVkVVJJLFxuXHRcdFx0XHRpZGVudGljYWw6IGZhbHNlLFxuXHRcdFx0XHRhZGRlZDogMSxcblx0XHRcdFx0cmVtb3ZlZDogMSxcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlYWRVcmlzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGNvbnN0IHRleHRGaWxlU2VydmljZSA9IHtcblx0XHRcdHJlYWQodXJpOiBVUkkpIHtcblx0XHRcdFx0cmVhZFVyaXMucHVzaCh1cmkudG9TdHJpbmcoKSk7XG5cdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoeyB2YWx1ZTogZmlsZXMuZ2V0KHVyaS50b1N0cmluZygpKSA/PyAnJyB9KTtcblx0XHRcdH1cblx0XHR9IGFzIHVua25vd24gYXMgSVRleHRGaWxlU2VydmljZTtcblxuXHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0ge30gYXMgSUZpbGVTZXJ2aWNlO1xuXHRcdGNvbnN0IGxhbmd1YWdlU2VydmljZSA9IHtcblx0XHRcdGd1ZXNzTGFuZ3VhZ2VJZEJ5RmlsZXBhdGhPckZpcnN0TGluZSgpOiBzdHJpbmcge1xuXHRcdFx0XHRyZXR1cm4gJ3R5cGVzY3JpcHQnO1xuXHRcdFx0fVxuXHRcdH0gYXMgdW5rbm93biBhcyBJTGFuZ3VhZ2VTZXJ2aWNlO1xuXG5cdFx0Y29uc3QgY29udGFpbmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0ZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChjb250YWluZXIpO1xuXHRcdHN0b3JlLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gY29udGFpbmVyLnJlbW92ZSgpKSk7XG5cblx0XHRjb25zdCB2aWV3ID0gc3RvcmUuYWRkKG5ldyBNb2JpbGVNdWx0aURpZmZWaWV3KGNvbnRhaW5lciwgeyBkaWZmcyB9LCB0ZXh0RmlsZVNlcnZpY2UsIGZpbGVTZXJ2aWNlLCBsYW5ndWFnZVNlcnZpY2UpKTtcblx0XHRhd2FpdCBhbmltYXRpb25GcmFtZXMoMik7XG5cblx0XHRjb25zdCBpbml0aWFsUmVhZENvdW50ID0gcmVhZFVyaXMubGVuZ3RoO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbml0aWFsUmVhZENvdW50LCAyLCAnb3BlbmluZyB0aGUgdmlldyBzaG91bGQgbG9hZCBvbmUgdmlzaWJsZSBmaWxlIHBhaXInKTtcblx0XHRjb25zdCBpbml0aWFsTW91bnRlZFNlY3Rpb25zID0gY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3JBbGwoJy5tb2JpbGUtbXVsdGktZGlmZi1maWxlLXNlY3Rpb24nKS5sZW5ndGg7XG5cdFx0YXNzZXJ0Lm9rKGluaXRpYWxNb3VudGVkU2VjdGlvbnMgPiAwLCAnb3BlbmluZyB0aGUgdmlldyBzaG91bGQgbW91bnQgdmlzaWJsZSBmaWxlIHNlY3Rpb25zJyk7XG5cdFx0YXNzZXJ0Lm9rKGluaXRpYWxNb3VudGVkU2VjdGlvbnMgPCBmaWxlQ291bnQsICdvcGVuaW5nIHRoZSB2aWV3IHNob3VsZCBub3QgbW91bnQgZXZlcnkgZmlsZSBzZWN0aW9uJyk7XG5cblx0XHRjb25zdCBzY3JvbGxXcmFwcGVyID0gY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoJy5tb2JpbGUtb3ZlcmxheS1zY3JvbGwnKSBhcyBIVE1MRWxlbWVudCB8IG51bGw7XG5cdFx0YXNzZXJ0Lm9rKHNjcm9sbFdyYXBwZXIsICdzY3JvbGwgd3JhcHBlciBzaG91bGQgZXhpc3QnKTtcblx0XHRjb25zdCB2aXJ0dWFsQ29udGVudCA9IGNvbnRhaW5lci5xdWVyeVNlbGVjdG9yKCcubW9iaWxlLW11bHRpLWRpZmYtdmlydHVhbC1jb250ZW50JykgYXMgSFRNTEVsZW1lbnQgfCBudWxsO1xuXHRcdGFzc2VydC5vayh2aXJ0dWFsQ29udGVudCwgJ3ZpcnR1YWwgY29udGVudCBzaG91bGQgZXhpc3QnKTtcblxuXHRcdGxldCBhcHBlbmRDaGlsZENvdW50ID0gMDtcblx0XHRjb25zdCBvcmlnaW5hbEFwcGVuZENoaWxkID0gdmlydHVhbENvbnRlbnQuYXBwZW5kQ2hpbGQ7XG5cdFx0dmlydHVhbENvbnRlbnQuYXBwZW5kQ2hpbGQgPSBmdW5jdGlvbiA8VCBleHRlbmRzIE5vZGU+KG5vZGU6IFQpOiBUIHtcblx0XHRcdGFwcGVuZENoaWxkQ291bnQrKztcblx0XHRcdHJldHVybiBvcmlnaW5hbEFwcGVuZENoaWxkLmNhbGwodGhpcywgbm9kZSkgYXMgVDtcblx0XHR9O1xuXHRcdHN0b3JlLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0dmlydHVhbENvbnRlbnQuYXBwZW5kQ2hpbGQgPSBvcmlnaW5hbEFwcGVuZENoaWxkO1xuXHRcdH0pKTtcblxuXHRcdHNjcm9sbFdyYXBwZXIuc2Nyb2xsVG9wID0gc2Nyb2xsV3JhcHBlci5zY3JvbGxIZWlnaHQ7XG5cdFx0c2Nyb2xsV3JhcHBlci5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnc2Nyb2xsJykpO1xuXHRcdGF3YWl0IGFuaW1hdGlvbkZyYW1lcygyKTtcblxuXHRcdGFzc2VydC5vayhyZWFkVXJpcy5sZW5ndGggPiBpbml0aWFsUmVhZENvdW50LCAnc2Nyb2xsaW5nIHNob3VsZCBsb2FkIG1vcmUgZmlsZXMnKTtcblx0XHRhc3NlcnQub2socmVhZFVyaXMubGVuZ3RoIDw9IGluaXRpYWxSZWFkQ291bnQgKyA0LCAnc2Nyb2xsaW5nIHNob3VsZCBsb2FkIGF0IG1vc3Qgb25lIGFkZGl0aW9uYWwgZmlsZSBwYWlyIHBlciBmcmFtZScpO1xuXHRcdGNvbnN0IG1vdW50ZWRTZWN0aW9uc0FmdGVyU2Nyb2xsID0gY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3JBbGwoJy5tb2JpbGUtbXVsdGktZGlmZi1maWxlLXNlY3Rpb24nKS5sZW5ndGg7XG5cdFx0YXNzZXJ0Lm9rKG1vdW50ZWRTZWN0aW9uc0FmdGVyU2Nyb2xsID4gMCwgJ3Njcm9sbGluZyBzaG91bGQgbW91bnQgZmlsZSBzZWN0aW9ucyBmb3IgdGhlIG5ldyB2aWV3cG9ydCcpO1xuXHRcdGFzc2VydC5vayhtb3VudGVkU2VjdGlvbnNBZnRlclNjcm9sbCA8IGZpbGVDb3VudCwgJ3Njcm9sbGluZyBzaG91bGQgc3RpbGwgbm90IG1vdW50IGV2ZXJ5IGZpbGUgc2VjdGlvbicpO1xuXG5cdFx0c2Nyb2xsV3JhcHBlci5zY3JvbGxUb3AgPSAwO1xuXHRcdHNjcm9sbFdyYXBwZXIuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ3Njcm9sbCcpKTtcblx0XHRhd2FpdCBhbmltYXRpb25GcmFtZXMoMik7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobmV3IFNldChyZWFkVXJpcykuc2l6ZSwgcmVhZFVyaXMubGVuZ3RoLCAncmVtb3VudGluZyBsb2FkZWQgZmlsZXMgc2hvdWxkIG5vdCByZXJlYWQgcmVzb3VyY2VzJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFwcGVuZENoaWxkQ291bnQsIDAsICdzY3JvbGxpbmcgc2hvdWxkIG5vdCByZWFwcGVuZCBtb3VudGVkIGZpbGUgc2VjdGlvbnMnKTtcblxuXHRcdHZpZXcuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCd1c2VzIGEgbGFyZ2VyIHRhcHBhYmxlIGZpbGUgaGVhZGVyIHRvIGV4cGFuZCBhbmQgY29sbGFwc2Ugc2VjdGlvbnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgb3JpZ2luYWxVUkkgPSBVUkkucGFyc2UoJ2lubWVtb3J5Oi8vb3JpZ2luYWwvc3JjL3RvZ2dsZS50cycpO1xuXHRcdGNvbnN0IG1vZGlmaWVkVVJJID0gVVJJLnBhcnNlKCdpbm1lbW9yeTovL21vZGlmaWVkL3NyYy90b2dnbGUudHMnKTtcblx0XHRjb25zdCBmaWxlcyA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KFtcblx0XHRcdFtvcmlnaW5hbFVSSS50b1N0cmluZygpLCAnZXhwb3J0IGNvbnN0IHZhbHVlID0gMTtcXG4nXSxcblx0XHRcdFttb2RpZmllZFVSSS50b1N0cmluZygpLCAnZXhwb3J0IGNvbnN0IHZhbHVlID0gMjtcXG4nXSxcblx0XHRdKTtcblxuXHRcdGNvbnN0IHRleHRGaWxlU2VydmljZSA9IHtcblx0XHRcdHJlYWQodXJpOiBVUkkpIHtcblx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh7IHZhbHVlOiBmaWxlcy5nZXQodXJpLnRvU3RyaW5nKCkpID8/ICcnIH0pO1xuXHRcdFx0fVxuXHRcdH0gYXMgdW5rbm93biBhcyBJVGV4dEZpbGVTZXJ2aWNlO1xuXG5cdFx0Y29uc3QgZmlsZVNlcnZpY2UgPSB7fSBhcyBJRmlsZVNlcnZpY2U7XG5cdFx0Y29uc3QgbGFuZ3VhZ2VTZXJ2aWNlID0ge1xuXHRcdFx0Z3Vlc3NMYW5ndWFnZUlkQnlGaWxlcGF0aE9yRmlyc3RMaW5lKCk6IHN0cmluZyB7XG5cdFx0XHRcdHJldHVybiAndHlwZXNjcmlwdCc7XG5cdFx0XHR9XG5cdFx0fSBhcyB1bmtub3duIGFzIElMYW5ndWFnZVNlcnZpY2U7XG5cblx0XHRjb25zdCBjb250YWluZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKGNvbnRhaW5lcik7XG5cdFx0c3RvcmUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBjb250YWluZXIucmVtb3ZlKCkpKTtcblxuXHRcdGNvbnN0IHZpZXcgPSBzdG9yZS5hZGQobmV3IE1vYmlsZU11bHRpRGlmZlZpZXcoY29udGFpbmVyLCB7XG5cdFx0XHRkaWZmczogW3tcblx0XHRcdFx0b3JpZ2luYWxVUkksXG5cdFx0XHRcdG1vZGlmaWVkVVJJLFxuXHRcdFx0XHRpZGVudGljYWw6IGZhbHNlLFxuXHRcdFx0XHRhZGRlZDogMSxcblx0XHRcdFx0cmVtb3ZlZDogMSxcblx0XHRcdH1dXG5cdFx0fSwgdGV4dEZpbGVTZXJ2aWNlLCBmaWxlU2VydmljZSwgbGFuZ3VhZ2VTZXJ2aWNlKSk7XG5cblx0XHRjb25zdCBzZWN0aW9uID0gY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoJy5tb2JpbGUtbXVsdGktZGlmZi1maWxlLXNlY3Rpb24nKSBhcyBIVE1MRWxlbWVudCB8IG51bGw7XG5cdFx0YXNzZXJ0Lm9rKHNlY3Rpb24sICdmaWxlIHNlY3Rpb24gc2hvdWxkIGV4aXN0Jyk7XG5cdFx0Y29uc3QgaGVhZGVyID0gc2VjdGlvbi5xdWVyeVNlbGVjdG9yKCcubW9iaWxlLW11bHRpLWRpZmYtZmlsZS1oZWFkZXInKSBhcyBIVE1MRWxlbWVudCB8IG51bGw7XG5cdFx0YXNzZXJ0Lm9rKGhlYWRlciwgJ2ZpbGUgaGVhZGVyIHNob3VsZCBleGlzdCcpO1xuXHRcdGNvbnN0IGNoZXZyb24gPSBoZWFkZXIucXVlcnlTZWxlY3RvcignLm1vYmlsZS1tdWx0aS1kaWZmLWZpbGUtY2hldnJvbicpIGFzIEhUTUxFbGVtZW50IHwgbnVsbDtcblx0XHRhc3NlcnQub2soY2hldnJvbiwgJ2ZpbGUgaGVhZGVyIGNoZXZyb24gc2hvdWxkIGV4aXN0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1haW5XaW5kb3cuZ2V0Q29tcHV0ZWRTdHlsZShoZWFkZXIpLmhlaWdodCwgJzQ0cHgnLCAnZmlsZSBoZWFkZXIgc2hvdWxkIGJlIGEgdG91Y2gtZnJpZW5kbHkgaGVpZ2h0Jyk7XG5cblx0XHRoZWFkZXIuZGlzcGF0Y2hFdmVudChuZXcgTW91c2VFdmVudCgnY2xpY2snLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xuXHRcdGFzc2VydC5vayhzZWN0aW9uLmNsYXNzTGlzdC5jb250YWlucygnY29sbGFwc2VkJyksICd0YXBwaW5nIHRoZSBoZWFkZXIgc2hvdWxkIGNvbGxhcHNlIHRoZSBmaWxlIHNlY3Rpb24nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2hldnJvbi5nZXRBdHRyaWJ1dGUoJ2FyaWEtZXhwYW5kZWQnKSwgJ2ZhbHNlJyk7XG5cblx0XHRjaGV2cm9uLmRpc3BhdGNoRXZlbnQobmV3IE1vdXNlRXZlbnQoJ2NsaWNrJywgeyBidWJibGVzOiB0cnVlIH0pKTtcblx0XHRhc3NlcnQub2soIXNlY3Rpb24uY2xhc3NMaXN0LmNvbnRhaW5zKCdjb2xsYXBzZWQnKSwgJ3RhcHBpbmcgdGhlIGNoZXZyb24gc2hvdWxkIGV4cGFuZCBvbmNlIHdpdGhvdXQgYnViYmxpbmcgaW50byBhIHNlY29uZCB0b2dnbGUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2hldnJvbi5nZXRBdHRyaWJ1dGUoJ2FyaWEtZXhwYW5kZWQnKSwgJ3RydWUnKTtcblxuXHRcdGNoZXZyb24uZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoVG91Y2hFdmVudFR5cGUuVGFwLCB7IGJ1YmJsZXM6IHRydWUsIGNhbmNlbGFibGU6IHRydWUgfSkpO1xuXHRcdGFzc2VydC5vayhzZWN0aW9uLmNsYXNzTGlzdC5jb250YWlucygnY29sbGFwc2VkJyksICd0b3VjaCB0YXBwaW5nIHRoZSBjaGV2cm9uIHNob3VsZCBjb2xsYXBzZSB0aHJvdWdoIHRoZSBoZWFkZXIgdGFyZ2V0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNoZXZyb24uZ2V0QXR0cmlidXRlKCdhcmlhLWV4cGFuZGVkJyksICdmYWxzZScpO1xuXG5cdFx0dmlldy5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3ZpcnR1YWxpemVzIHJvd3MgaW5zaWRlIGEgbG9hZGVkIGxhcmdlIGZpbGUgYm9keScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBsaW5lQ291bnQgPSAyMDA7XG5cdFx0Y29uc3Qgb3JpZ2luYWxVUkkgPSBVUkkucGFyc2UoJ2lubWVtb3J5Oi8vb3JpZ2luYWwvc3JjL2xhcmdlLnRzJyk7XG5cdFx0Y29uc3QgbW9kaWZpZWRVUkkgPSBVUkkucGFyc2UoJ2lubWVtb3J5Oi8vbW9kaWZpZWQvc3JjL2xhcmdlLnRzJyk7XG5cdFx0Y29uc3Qgb3JpZ2luYWxUZXh0ID0gQXJyYXkuZnJvbSh7IGxlbmd0aDogbGluZUNvdW50IH0sIChfLCBpKSA9PiBgZXhwb3J0IGNvbnN0IGZpbGVWYWx1ZSR7aX0gPSAke2l9O2ApLmpvaW4oJ1xcbicpO1xuXHRcdGNvbnN0IG1vZGlmaWVkVGV4dCA9IEFycmF5LmZyb20oeyBsZW5ndGg6IGxpbmVDb3VudCB9LCAoXywgaSkgPT4gYGV4cG9ydCBjb25zdCBmaWxlVmFsdWUke2l9ID0gJHtpICsgMTAwMH07YCkuam9pbignXFxuJyk7XG5cdFx0Y29uc3QgZmlsZXMgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nPihbXG5cdFx0XHRbb3JpZ2luYWxVUkkudG9TdHJpbmcoKSwgb3JpZ2luYWxUZXh0XSxcblx0XHRcdFttb2RpZmllZFVSSS50b1N0cmluZygpLCBtb2RpZmllZFRleHRdLFxuXHRcdF0pO1xuXG5cdFx0Y29uc3QgdGV4dEZpbGVTZXJ2aWNlID0ge1xuXHRcdFx0cmVhZCh1cmk6IFVSSSkge1xuXHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHsgdmFsdWU6IGZpbGVzLmdldCh1cmkudG9TdHJpbmcoKSkgPz8gJycgfSk7XG5cdFx0XHR9XG5cdFx0fSBhcyB1bmtub3duIGFzIElUZXh0RmlsZVNlcnZpY2U7XG5cblx0XHRjb25zdCBmaWxlU2VydmljZSA9IHt9IGFzIElGaWxlU2VydmljZTtcblx0XHRjb25zdCBsYW5ndWFnZVNlcnZpY2UgPSB7XG5cdFx0XHRndWVzc0xhbmd1YWdlSWRCeUZpbGVwYXRoT3JGaXJzdExpbmUoKTogc3RyaW5nIHtcblx0XHRcdFx0cmV0dXJuICd0eXBlc2NyaXB0Jztcblx0XHRcdH1cblx0XHR9IGFzIHVua25vd24gYXMgSUxhbmd1YWdlU2VydmljZTtcblxuXHRcdGNvbnN0IGNvbnRhaW5lciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQoY29udGFpbmVyKTtcblx0XHRzdG9yZS5hZGQodG9EaXNwb3NhYmxlKCgpID0+IGNvbnRhaW5lci5yZW1vdmUoKSkpO1xuXG5cdFx0Y29uc3QgdmlldyA9IHN0b3JlLmFkZChuZXcgTW9iaWxlTXVsdGlEaWZmVmlldyhjb250YWluZXIsIHtcblx0XHRcdGRpZmZzOiBbe1xuXHRcdFx0XHRvcmlnaW5hbFVSSSxcblx0XHRcdFx0bW9kaWZpZWRVUkksXG5cdFx0XHRcdGlkZW50aWNhbDogZmFsc2UsXG5cdFx0XHRcdGFkZGVkOiBsaW5lQ291bnQsXG5cdFx0XHRcdHJlbW92ZWQ6IGxpbmVDb3VudCxcblx0XHRcdH1dXG5cdFx0fSwgdGV4dEZpbGVTZXJ2aWNlLCBmaWxlU2VydmljZSwgbGFuZ3VhZ2VTZXJ2aWNlKSk7XG5cdFx0YXdhaXQgd2FpdEZvckNvbmRpdGlvbigoKSA9PiBjb250YWluZXIucXVlcnlTZWxlY3RvckFsbCgnLm1vYmlsZS1kaWZmLWxpbmUnKS5sZW5ndGggPiAwLCAnbG9hZGVkIGZpbGUgc2hvdWxkIHJlbmRlciB2aXNpYmxlIHJvd3MnKTtcblxuXHRcdGNvbnN0IHJlbmRlcmVkUm93cyA9IGNvbnRhaW5lci5xdWVyeVNlbGVjdG9yQWxsKCcubW9iaWxlLWRpZmYtbGluZScpLmxlbmd0aDtcblx0XHRhc3NlcnQub2socmVuZGVyZWRSb3dzIDwgbGluZUNvdW50ICogMiwgJ2xvYWRlZCBmaWxlIHNob3VsZCBub3QgcmVuZGVyIGV2ZXJ5IGRpZmYgcm93Jyk7XG5cblx0XHRjb25zdCBib2R5SW5uZXIgPSBjb250YWluZXIucXVlcnlTZWxlY3RvcignLm1vYmlsZS1tdWx0aS1kaWZmLWZpbGUtY29udGVudC1pbm5lcicpIGFzIEhUTUxFbGVtZW50IHwgbnVsbDtcblx0XHRhc3NlcnQub2soYm9keUlubmVyLCAnbG9hZGVkIGZpbGUgc2hvdWxkIHJlbmRlciBhIHN0YWJsZSBib2R5IHdyYXBwZXInKTtcblx0XHRhc3NlcnRFbnRyeU9yZGVyKGNvbnRhaW5lcik7XG5cblx0XHRjb25zdCBzY3JvbGxXcmFwcGVyID0gY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoJy5tb2JpbGUtb3ZlcmxheS1zY3JvbGwnKSBhcyBIVE1MRWxlbWVudCB8IG51bGw7XG5cdFx0YXNzZXJ0Lm9rKHNjcm9sbFdyYXBwZXIsICdzY3JvbGwgd3JhcHBlciBzaG91bGQgZXhpc3QnKTtcblx0XHRzY3JvbGxXcmFwcGVyLnNjcm9sbFRvcCA9IDEyMDA7XG5cdFx0c2Nyb2xsV3JhcHBlci5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnc2Nyb2xsJykpO1xuXHRcdGF3YWl0IHdhaXRGb3JDb25kaXRpb24oKCkgPT4gY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoJy5tb2JpbGUtbXVsdGktZGlmZi1maWxlLWNvbnRlbnQtaW5uZXInKSA9PT0gYm9keUlubmVyLCAnc2Nyb2xsaW5nIHNob3VsZCBrZWVwIHRoZSBzYW1lIGJvZHkgd3JhcHBlcicpO1xuXG5cdFx0Y29uc3QgcmVuZGVyZWRSb3dzQWZ0ZXJTY3JvbGwgPSBjb250YWluZXIucXVlcnlTZWxlY3RvckFsbCgnLm1vYmlsZS1kaWZmLWxpbmUnKS5sZW5ndGg7XG5cdFx0YXNzZXJ0Lm9rKHJlbmRlcmVkUm93c0FmdGVyU2Nyb2xsIDwgbGluZUNvdW50ICogMiwgJ3Njcm9sbGluZyBzaG91bGQga2VlcCByZW5kZXJpbmcgb25seSB0aGUgdmlzaWJsZSBkaWZmIHJvd3MnKTtcblx0XHRhc3NlcnRFbnRyeU9yZGVyKGNvbnRhaW5lcik7XG5cblx0XHR2aWV3LmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgncHJlZmV0Y2hlcyB0aGUgbmV4dCBmaWxlIG5lYXIgYSBib3VuZGFyeSB3aXRob3V0IG1vdW50aW5nIGl0cyBzZWN0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGZpbGVDb3VudCA9IDM7XG5cdFx0Y29uc3QgbGluZUNvdW50ID0gMjAwO1xuXHRcdGNvbnN0IGZpbGVzID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcblx0XHRjb25zdCBkaWZmczogSUZpbGVEaWZmVmlld0RhdGFbXSA9IFtdO1xuXG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBmaWxlQ291bnQ7IGkrKykge1xuXHRcdFx0Y29uc3Qgb3JpZ2luYWxVUkkgPSBVUkkucGFyc2UoYGlubWVtb3J5Oi8vb3JpZ2luYWwvc3JjL3ByZWZldGNoJHtpfS50c2ApO1xuXHRcdFx0Y29uc3QgbW9kaWZpZWRVUkkgPSBVUkkucGFyc2UoYGlubWVtb3J5Oi8vbW9kaWZpZWQvc3JjL3ByZWZldGNoJHtpfS50c2ApO1xuXHRcdFx0ZmlsZXMuc2V0KG9yaWdpbmFsVVJJLnRvU3RyaW5nKCksIEFycmF5LmZyb20oeyBsZW5ndGg6IGxpbmVDb3VudCB9LCAoXywgbGluZSkgPT4gYGV4cG9ydCBjb25zdCB2YWx1ZSR7bGluZX0gPSAke2xpbmV9O2ApLmpvaW4oJ1xcbicpKTtcblx0XHRcdGZpbGVzLnNldChtb2RpZmllZFVSSS50b1N0cmluZygpLCBBcnJheS5mcm9tKHsgbGVuZ3RoOiBsaW5lQ291bnQgfSwgKF8sIGxpbmUpID0+IGBleHBvcnQgY29uc3QgdmFsdWUke2xpbmV9ID0gJHtsaW5lICsgMTAwMH07YCkuam9pbignXFxuJykpO1xuXHRcdFx0ZGlmZnMucHVzaCh7XG5cdFx0XHRcdG9yaWdpbmFsVVJJLFxuXHRcdFx0XHRtb2RpZmllZFVSSSxcblx0XHRcdFx0aWRlbnRpY2FsOiBmYWxzZSxcblx0XHRcdFx0YWRkZWQ6IGxpbmVDb3VudCxcblx0XHRcdFx0cmVtb3ZlZDogbGluZUNvdW50LFxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVhZFVyaXM6IHN0cmluZ1tdID0gW107XG5cdFx0Y29uc3QgdGV4dEZpbGVTZXJ2aWNlID0ge1xuXHRcdFx0cmVhZCh1cmk6IFVSSSkge1xuXHRcdFx0XHRyZWFkVXJpcy5wdXNoKHVyaS50b1N0cmluZygpKTtcblx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh7IHZhbHVlOiBmaWxlcy5nZXQodXJpLnRvU3RyaW5nKCkpID8/ICcnIH0pO1xuXHRcdFx0fVxuXHRcdH0gYXMgdW5rbm93biBhcyBJVGV4dEZpbGVTZXJ2aWNlO1xuXG5cdFx0Y29uc3QgZmlsZVNlcnZpY2UgPSB7fSBhcyBJRmlsZVNlcnZpY2U7XG5cdFx0Y29uc3QgbGFuZ3VhZ2VTZXJ2aWNlID0ge1xuXHRcdFx0Z3Vlc3NMYW5ndWFnZUlkQnlGaWxlcGF0aE9yRmlyc3RMaW5lKCk6IHN0cmluZyB7XG5cdFx0XHRcdHJldHVybiAndHlwZXNjcmlwdCc7XG5cdFx0XHR9XG5cdFx0fSBhcyB1bmtub3duIGFzIElMYW5ndWFnZVNlcnZpY2U7XG5cblx0XHRjb25zdCBjb250YWluZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKGNvbnRhaW5lcik7XG5cdFx0c3RvcmUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBjb250YWluZXIucmVtb3ZlKCkpKTtcblxuXHRcdGNvbnN0IHZpZXcgPSBzdG9yZS5hZGQobmV3IE1vYmlsZU11bHRpRGlmZlZpZXcoY29udGFpbmVyLCB7IGRpZmZzIH0sIHRleHRGaWxlU2VydmljZSwgZmlsZVNlcnZpY2UsIGxhbmd1YWdlU2VydmljZSkpO1xuXHRcdGF3YWl0IHdhaXRGb3JDb25kaXRpb24oKCkgPT4gY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3JBbGwoJy5tb2JpbGUtZGlmZi1saW5lJykubGVuZ3RoID4gMCwgJ2ZpcnN0IGZpbGUgc2hvdWxkIGxvYWQgYmVmb3JlIHByZWZldGNoaW5nIG5lYXIgaXRzIGJvdW5kYXJ5Jyk7XG5cblx0XHRhc3NlcnQub2socmVhZFVyaXMuc29tZSh1cmkgPT4gdXJpLmluY2x1ZGVzKCdwcmVmZXRjaDAudHMnKSksICdvcGVuaW5nIHNob3VsZCByZWFkIHRoZSBmaXJzdCBmaWxlJyk7XG5cdFx0YXNzZXJ0Lm9rKCFyZWFkVXJpcy5zb21lKHVyaSA9PiB1cmkuaW5jbHVkZXMoJ3ByZWZldGNoMS50cycpKSwgJ29wZW5pbmcgc2hvdWxkIG5vdCBpbW1lZGlhdGVseSBwcmVmZXRjaCB0aGUgbmV4dCBsYXJnZSBmaWxlJyk7XG5cblx0XHRjb25zdCBzY3JvbGxXcmFwcGVyID0gY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoJy5tb2JpbGUtb3ZlcmxheS1zY3JvbGwnKSBhcyBIVE1MRWxlbWVudCB8IG51bGw7XG5cdFx0YXNzZXJ0Lm9rKHNjcm9sbFdyYXBwZXIsICdzY3JvbGwgd3JhcHBlciBzaG91bGQgZXhpc3QnKTtcblx0XHRzY3JvbGxXcmFwcGVyLnNjcm9sbFRvcCA9IDUwMDA7XG5cdFx0c2Nyb2xsV3JhcHBlci5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnc2Nyb2xsJykpO1xuXG5cdFx0YXdhaXQgd2FpdEZvckNvbmRpdGlvbigoKSA9PiByZWFkVXJpcy5zb21lKHVyaSA9PiB1cmkuaW5jbHVkZXMoJ3ByZWZldGNoMS50cycpKSwgJ2FwcHJvYWNoaW5nIGEgZmlsZSBib3VuZGFyeSBzaG91bGQgcHJlZmV0Y2ggdGhlIG5leHQgZmlsZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250YWluZXIucXVlcnlTZWxlY3RvcignLm1vYmlsZS1tdWx0aS1kaWZmLWZpbGUtc2VjdGlvbltkYXRhLWluZGV4PVwiMVwiXScpLCBudWxsLCAncHJlZmV0Y2hpbmcgc2hvdWxkIG5vdCBtb3VudCB0aGUgbmV4dCBmaWxlIHNlY3Rpb24nKTtcblx0XHRhc3NlcnQub2soIXJlYWRVcmlzLnNvbWUodXJpID0+IHVyaS5pbmNsdWRlcygncHJlZmV0Y2gyLnRzJykpLCAncHJlZmV0Y2hpbmcgc2hvdWxkIHN0YXkgYm91bmRlZCB0byB0aGUgbmVhciBmaWxlJyk7XG5cblx0XHR2aWV3LmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnc3RhcnRzIGxvYWRpbmcgdGhlIG5ld2x5IHZpc2libGUgZmlsZSB3aGlsZSBhbiBvbGRlciBsb2FkIGlzIHBlbmRpbmcnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZmlsZUNvdW50ID0gNDA7XG5cdFx0Y29uc3QgZmlsZXMgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nPigpO1xuXHRcdGNvbnN0IGRpZmZzOiBJRmlsZURpZmZWaWV3RGF0YVtdID0gW107XG5cblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGZpbGVDb3VudDsgaSsrKSB7XG5cdFx0XHRjb25zdCBvcmlnaW5hbFVSSSA9IFVSSS5wYXJzZShgaW5tZW1vcnk6Ly9vcmlnaW5hbC9zcmMvZmlsZSR7aX0udHNgKTtcblx0XHRcdGNvbnN0IG1vZGlmaWVkVVJJID0gVVJJLnBhcnNlKGBpbm1lbW9yeTovL21vZGlmaWVkL3NyYy9maWxlJHtpfS50c2ApO1xuXHRcdFx0ZmlsZXMuc2V0KG9yaWdpbmFsVVJJLnRvU3RyaW5nKCksIGBleHBvcnQgY29uc3QgdmFsdWUke2l9ID0gJHtpfTtcXG5gKTtcblx0XHRcdGZpbGVzLnNldChtb2RpZmllZFVSSS50b1N0cmluZygpLCBgZXhwb3J0IGNvbnN0IHZhbHVlJHtpfSA9ICR7aSArIDF9O1xcbmApO1xuXHRcdFx0ZGlmZnMucHVzaCh7XG5cdFx0XHRcdG9yaWdpbmFsVVJJLFxuXHRcdFx0XHRtb2RpZmllZFVSSSxcblx0XHRcdFx0aWRlbnRpY2FsOiBmYWxzZSxcblx0XHRcdFx0YWRkZWQ6IDEwMCxcblx0XHRcdFx0cmVtb3ZlZDogMTAwLFxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVhZFVyaXM6IHN0cmluZ1tdID0gW107XG5cdFx0Y29uc3QgcGVuZGluZ1JlYWRzID0gbmV3IE1hcDxzdHJpbmcsIERlZmVycmVkPHsgdmFsdWU6IHN0cmluZyB9Pj4oKTtcblx0XHRjb25zdCB0ZXh0RmlsZVNlcnZpY2UgPSB7XG5cdFx0XHRyZWFkKHVyaTogVVJJKSB7XG5cdFx0XHRcdHJlYWRVcmlzLnB1c2godXJpLnRvU3RyaW5nKCkpO1xuXHRcdFx0XHRjb25zdCBwZW5kaW5nID0gZGVmZXJyZWQ8eyB2YWx1ZTogc3RyaW5nIH0+KCk7XG5cdFx0XHRcdHBlbmRpbmdSZWFkcy5zZXQodXJpLnRvU3RyaW5nKCksIHBlbmRpbmcpO1xuXHRcdFx0XHRyZXR1cm4gcGVuZGluZy5wcm9taXNlO1xuXHRcdFx0fVxuXHRcdH0gYXMgdW5rbm93biBhcyBJVGV4dEZpbGVTZXJ2aWNlO1xuXG5cdFx0Y29uc3QgZmlsZVNlcnZpY2UgPSB7fSBhcyBJRmlsZVNlcnZpY2U7XG5cdFx0Y29uc3QgbGFuZ3VhZ2VTZXJ2aWNlID0ge1xuXHRcdFx0Z3Vlc3NMYW5ndWFnZUlkQnlGaWxlcGF0aE9yRmlyc3RMaW5lKCk6IHN0cmluZyB7XG5cdFx0XHRcdHJldHVybiAndHlwZXNjcmlwdCc7XG5cdFx0XHR9XG5cdFx0fSBhcyB1bmtub3duIGFzIElMYW5ndWFnZVNlcnZpY2U7XG5cblx0XHRjb25zdCBjb250YWluZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKGNvbnRhaW5lcik7XG5cdFx0c3RvcmUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBjb250YWluZXIucmVtb3ZlKCkpKTtcblxuXHRcdGNvbnN0IHZpZXcgPSBzdG9yZS5hZGQobmV3IE1vYmlsZU11bHRpRGlmZlZpZXcoY29udGFpbmVyLCB7IGRpZmZzIH0sIHRleHRGaWxlU2VydmljZSwgZmlsZVNlcnZpY2UsIGxhbmd1YWdlU2VydmljZSkpO1xuXHRcdGF3YWl0IGFuaW1hdGlvbkZyYW1lcygyKTtcblxuXHRcdGFzc2VydC5vayhyZWFkVXJpcy5zb21lKHVyaSA9PiB1cmkuaW5jbHVkZXMoJ2ZpbGUwLnRzJykpLCAnb3BlbmluZyB0aGUgdmlldyBzaG91bGQgc3RhcnQgbG9hZGluZyB0aGUgZmlyc3QgZmlsZScpO1xuXG5cdFx0Y29uc3Qgc2Nyb2xsV3JhcHBlciA9IGNvbnRhaW5lci5xdWVyeVNlbGVjdG9yKCcubW9iaWxlLW92ZXJsYXktc2Nyb2xsJykgYXMgSFRNTEVsZW1lbnQgfCBudWxsO1xuXHRcdGFzc2VydC5vayhzY3JvbGxXcmFwcGVyLCAnc2Nyb2xsIHdyYXBwZXIgc2hvdWxkIGV4aXN0Jyk7XG5cdFx0c2Nyb2xsV3JhcHBlci5zY3JvbGxUb3AgPSBzY3JvbGxXcmFwcGVyLnNjcm9sbEhlaWdodDtcblx0XHRzY3JvbGxXcmFwcGVyLmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdzY3JvbGwnKSk7XG5cdFx0YXdhaXQgYW5pbWF0aW9uRnJhbWVzKDMpO1xuXG5cdFx0YXNzZXJ0Lm9rKHJlYWRVcmlzLnNvbWUodXJpID0+IHVyaS5pbmNsdWRlcyhgZmlsZSR7ZmlsZUNvdW50IC0gMX0udHNgKSksICdzY3JvbGxpbmcgc2hvdWxkIHN0YXJ0IGxvYWRpbmcgdGhlIG5ld2x5IHZpc2libGUgZmlsZSBldmVuIHdoaWxlIHRoZSBmaXJzdCBmaWxlIGlzIHBlbmRpbmcnKTtcblxuXHRcdHZpZXcuZGlzcG9zZSgpO1xuXHRcdHJlc29sdmVQZW5kaW5nUmVhZHMocGVuZGluZ1JlYWRzLCBmaWxlcyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2tlZXBzIGFuIHVubG9hZGVkIGxhcmdlIGZpbGUgYm9keSBjb3ZlcmVkIGJ5IGEgc3RpY2t5IGxvYWRpbmcgcGxhY2Vob2xkZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZmlsZUNvdW50ID0gMztcblx0XHRjb25zdCBmaWxlcyA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG5cdFx0Y29uc3QgZGlmZnM6IElGaWxlRGlmZlZpZXdEYXRhW10gPSBbXTtcblxuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgZmlsZUNvdW50OyBpKyspIHtcblx0XHRcdGNvbnN0IG9yaWdpbmFsVVJJID0gVVJJLnBhcnNlKGBpbm1lbW9yeTovL29yaWdpbmFsL3NyYy9sYXJnZSR7aX0udHNgKTtcblx0XHRcdGNvbnN0IG1vZGlmaWVkVVJJID0gVVJJLnBhcnNlKGBpbm1lbW9yeTovL21vZGlmaWVkL3NyYy9sYXJnZSR7aX0udHNgKTtcblx0XHRcdGZpbGVzLnNldChvcmlnaW5hbFVSSS50b1N0cmluZygpLCBgZXhwb3J0IGNvbnN0IHZhbHVlJHtpfSA9ICR7aX07XFxuYCk7XG5cdFx0XHRmaWxlcy5zZXQobW9kaWZpZWRVUkkudG9TdHJpbmcoKSwgYGV4cG9ydCBjb25zdCB2YWx1ZSR7aX0gPSAke2kgKyAxfTtcXG5gKTtcblx0XHRcdGRpZmZzLnB1c2goe1xuXHRcdFx0XHRvcmlnaW5hbFVSSSxcblx0XHRcdFx0bW9kaWZpZWRVUkksXG5cdFx0XHRcdGlkZW50aWNhbDogZmFsc2UsXG5cdFx0XHRcdGFkZGVkOiAxMDAwLFxuXHRcdFx0XHRyZW1vdmVkOiAxMDAwLFxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcGVuZGluZ1JlYWRzID0gbmV3IE1hcDxzdHJpbmcsIERlZmVycmVkPHsgdmFsdWU6IHN0cmluZyB9Pj4oKTtcblx0XHRjb25zdCB0ZXh0RmlsZVNlcnZpY2UgPSB7XG5cdFx0XHRyZWFkKHVyaTogVVJJKSB7XG5cdFx0XHRcdGNvbnN0IHBlbmRpbmcgPSBkZWZlcnJlZDx7IHZhbHVlOiBzdHJpbmcgfT4oKTtcblx0XHRcdFx0cGVuZGluZ1JlYWRzLnNldCh1cmkudG9TdHJpbmcoKSwgcGVuZGluZyk7XG5cdFx0XHRcdHJldHVybiBwZW5kaW5nLnByb21pc2U7XG5cdFx0XHR9XG5cdFx0fSBhcyB1bmtub3duIGFzIElUZXh0RmlsZVNlcnZpY2U7XG5cblx0XHRjb25zdCBmaWxlU2VydmljZSA9IHt9IGFzIElGaWxlU2VydmljZTtcblx0XHRjb25zdCBsYW5ndWFnZVNlcnZpY2UgPSB7XG5cdFx0XHRndWVzc0xhbmd1YWdlSWRCeUZpbGVwYXRoT3JGaXJzdExpbmUoKTogc3RyaW5nIHtcblx0XHRcdFx0cmV0dXJuICd0eXBlc2NyaXB0Jztcblx0XHRcdH1cblx0XHR9IGFzIHVua25vd24gYXMgSUxhbmd1YWdlU2VydmljZTtcblxuXHRcdGNvbnN0IGNvbnRhaW5lciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQoY29udGFpbmVyKTtcblx0XHRzdG9yZS5hZGQodG9EaXNwb3NhYmxlKCgpID0+IGNvbnRhaW5lci5yZW1vdmUoKSkpO1xuXG5cdFx0Y29uc3QgdmlldyA9IHN0b3JlLmFkZChuZXcgTW9iaWxlTXVsdGlEaWZmVmlldyhjb250YWluZXIsIHsgZGlmZnMgfSwgdGV4dEZpbGVTZXJ2aWNlLCBmaWxlU2VydmljZSwgbGFuZ3VhZ2VTZXJ2aWNlKSk7XG5cdFx0YXdhaXQgYW5pbWF0aW9uRnJhbWVzKDIpO1xuXG5cdFx0Y29uc3Qgc2Nyb2xsV3JhcHBlciA9IGNvbnRhaW5lci5xdWVyeVNlbGVjdG9yKCcubW9iaWxlLW92ZXJsYXktc2Nyb2xsJykgYXMgSFRNTEVsZW1lbnQgfCBudWxsO1xuXHRcdGFzc2VydC5vayhzY3JvbGxXcmFwcGVyLCAnc2Nyb2xsIHdyYXBwZXIgc2hvdWxkIGV4aXN0Jyk7XG5cdFx0c2Nyb2xsV3JhcHBlci5zY3JvbGxUb3AgPSBzY3JvbGxXcmFwcGVyLnNjcm9sbEhlaWdodDtcblx0XHRzY3JvbGxXcmFwcGVyLmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdzY3JvbGwnKSk7XG5cdFx0YXdhaXQgYW5pbWF0aW9uRnJhbWVzKDIpO1xuXG5cdFx0Y29uc3QgcGxhY2Vob2xkZXJDb250ZW50ID0gQXJyYXkuZnJvbShjb250YWluZXIucXVlcnlTZWxlY3RvckFsbCgnLm1vYmlsZS1tdWx0aS1kaWZmLWZpbGUtY29udGVudC1wbGFjZWhvbGRlcicpKSBhcyBIVE1MRWxlbWVudFtdO1xuXHRcdGNvbnN0IGJvdHRvbUZpbGVDb250ZW50ID0gcGxhY2Vob2xkZXJDb250ZW50LmZpbmQoY29udGVudCA9PiBOdW1iZXIoKGNvbnRlbnQucGFyZW50RWxlbWVudCBhcyBIVE1MRWxlbWVudCkuZGF0YXNldC5pbmRleCkgPT09IGZpbGVDb3VudCAtIDEpO1xuXHRcdGFzc2VydC5vayhib3R0b21GaWxlQ29udGVudCwgJ3RoZSB1bmxvYWRlZCBmaWxlIGF0IHRoZSBuZXcgc2Nyb2xsIHBvc2l0aW9uIHNob3VsZCByZW5kZXIgcGxhY2Vob2xkZXIgY29udGVudCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChib3R0b21GaWxlQ29udGVudC5zdHlsZS50cmFuc2Zvcm0sICcnLCAnbG9hZGluZyBwbGFjZWhvbGRlcnMgc2hvdWxkIG5vdCByZWx5IG9uIEpTIHNjcm9sbCB0cmFuc2Zvcm1zJyk7XG5cdFx0YXNzZXJ0Lm9rKGJvdHRvbUZpbGVDb250ZW50LnN0eWxlLmhlaWdodCwgJ3RoZSBwbGFjZWhvbGRlciBzaG91bGQgcmVzZXJ2ZSB0aGUgZmlsZSBib2R5IGhlaWdodCcpO1xuXG5cdFx0Y29uc3QgZW1wdHlTdGF0ZSA9IGJvdHRvbUZpbGVDb250ZW50LnF1ZXJ5U2VsZWN0b3IoJy5tb2JpbGUtZGlmZi1lbXB0eS1zdGF0ZScpIGFzIEhUTUxFbGVtZW50IHwgbnVsbDtcblx0XHRhc3NlcnQub2soZW1wdHlTdGF0ZSwgJ3RoZSBwbGFjZWhvbGRlciBzaG91bGQgY29udGFpbiBhIGxvYWRpbmcgbWVzc2FnZScpO1xuXHRcdGFzc2VydC5vayhlbXB0eVN0YXRlLnRleHRDb250ZW50Py5pbmNsdWRlcygnTG9hZGluZycpLCAndGhlIHBsYWNlaG9sZGVyIHNob3VsZCBub3QgYmUgYmxhbmsnKTtcblx0XHRhc3NlcnQub2soZW1wdHlTdGF0ZS5zdHlsZS5oZWlnaHQsICd0aGUgcGxhY2Vob2xkZXIgbWVzc2FnZSBzaG91bGQgcmVzZXJ2ZSB2aXNpYmxlIHZpZXdwb3J0IGhlaWdodCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYWluV2luZG93LmdldENvbXB1dGVkU3R5bGUoZW1wdHlTdGF0ZSkucG9zaXRpb24sICdzdGlja3knLCAndGhlIGxvYWRpbmcgbWVzc2FnZSBzaG91bGQgcmVtYWluIHZpc2libGUgZHVyaW5nIG5hdGl2ZSBzY3JvbGwnKTtcblxuXHRcdHZpZXcuZGlzcG9zZSgpO1xuXHRcdHJlc29sdmVQZW5kaW5nUmVhZHMocGVuZGluZ1JlYWRzLCBmaWxlcyk7XG5cdH0pO1xufSk7XG5cbmZ1bmN0aW9uIGFuaW1hdGlvbkZyYW1lKCk6IFByb21pc2U8dm9pZD4ge1xuXHRyZXR1cm4gbmV3IFByb21pc2UocmVzb2x2ZSA9PiBtYWluV2luZG93LnJlcXVlc3RBbmltYXRpb25GcmFtZSgoKSA9PiByZXNvbHZlKCkpKTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gYW5pbWF0aW9uRnJhbWVzKGNvdW50OiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+IHtcblx0Zm9yIChsZXQgaSA9IDA7IGkgPCBjb3VudDsgaSsrKSB7XG5cdFx0YXdhaXQgYW5pbWF0aW9uRnJhbWUoKTtcblx0fVxufVxuXG5hc3luYyBmdW5jdGlvbiB3YWl0Rm9yQ29uZGl0aW9uKGNvbmRpdGlvbjogKCkgPT4gYm9vbGVhbiwgbWVzc2FnZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdGZvciAobGV0IGkgPSAwOyBpIDwgNjA7IGkrKykge1xuXHRcdGlmIChjb25kaXRpb24oKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRhd2FpdCBhbmltYXRpb25GcmFtZSgpO1xuXHR9XG5cdGFzc2VydC5mYWlsKG1lc3NhZ2UpO1xufVxuXG5mdW5jdGlvbiBhc3NlcnRFbnRyeU9yZGVyKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0Y29uc3QgaW5kZXhlcyA9IEFycmF5LmZyb20oY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3JBbGwoJy5tb2JpbGUtbXVsdGktZGlmZi1ib2R5LWVudHJ5JyksIGVsZW1lbnQgPT4gTnVtYmVyKChlbGVtZW50IGFzIEhUTUxFbGVtZW50KS5kYXRhc2V0LmVudHJ5SW5kZXgpKTtcblx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChpbmRleGVzLCBpbmRleGVzLnNsaWNlKCkuc29ydCgoYSwgYikgPT4gYSAtIGIpLCAncmVuZGVyZWQgYm9keSBlbnRyaWVzIHNob3VsZCBzdGF5IGluIGRvY3VtZW50IG9yZGVyJyk7XG59XG5cbmludGVyZmFjZSBEZWZlcnJlZDxUPiB7XG5cdHJlYWRvbmx5IHByb21pc2U6IFByb21pc2U8VD47XG5cdHJlc29sdmUodmFsdWU6IFQpOiB2b2lkO1xufVxuXG5mdW5jdGlvbiBkZWZlcnJlZDxUPigpOiBEZWZlcnJlZDxUPiB7XG5cdGxldCByZXNvbHZlITogKHZhbHVlOiBUKSA9PiB2b2lkO1xuXHRjb25zdCBwcm9taXNlID0gbmV3IFByb21pc2U8VD4ociA9PiB7XG5cdFx0cmVzb2x2ZSA9IHI7XG5cdH0pO1xuXHRyZXR1cm4geyBwcm9taXNlLCByZXNvbHZlIH07XG59XG5cbmZ1bmN0aW9uIHJlc29sdmVQZW5kaW5nUmVhZHMocGVuZGluZ1JlYWRzOiBNYXA8c3RyaW5nLCBEZWZlcnJlZDx7IHZhbHVlOiBzdHJpbmcgfT4+LCBmaWxlczogTWFwPHN0cmluZywgc3RyaW5nPik6IHZvaWQge1xuXHRmb3IgKGNvbnN0IFt1cmksIHBlbmRpbmddIG9mIHBlbmRpbmdSZWFkcykge1xuXHRcdHBlbmRpbmcucmVzb2x2ZSh7IHZhbHVlOiBmaWxlcy5nZXQodXJpKSA/PyAnJyB9KTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsYUFBYSxzQkFBc0I7QUFDNUMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsK0NBQStDO0FBSXhELFNBQVMsMkJBQTJCO0FBR3BDLE1BQU0sdUJBQXVCLE1BQU07QUFDbEMsUUFBTSxRQUFRLHdDQUF3QztBQUV0RCxPQUFLLDhFQUE4RSxZQUFZO0FBQzlGLFVBQU0sWUFBWTtBQUNsQixVQUFNLFFBQVEsb0JBQUksSUFBb0I7QUFDdEMsVUFBTSxRQUE2QixDQUFDO0FBRXBDLGFBQVMsSUFBSSxHQUFHLElBQUksV0FBVyxLQUFLO0FBQ25DLFlBQU0sY0FBYyxJQUFJLE1BQU0sK0JBQStCLENBQUMsS0FBSztBQUNuRSxZQUFNLGNBQWMsSUFBSSxNQUFNLCtCQUErQixDQUFDLEtBQUs7QUFDbkUsWUFBTSxJQUFJLFlBQVksU0FBUyxHQUFHLHFCQUFxQixDQUFDLE1BQU0sQ0FBQztBQUFBLENBQUs7QUFDcEUsWUFBTSxJQUFJ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
