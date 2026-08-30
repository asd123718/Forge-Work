import assert from "assert";
import { mainWindow } from "../../../../../../../base/browser/window.js";
import { Event } from "../../../../../../../base/common/event.js";
import { DisposableStore } from "../../../../../../../base/common/lifecycle.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../../base/test/common/utils.js";
import { TestConfigurationService } from "../../../../../../../platform/configuration/test/common/testConfigurationService.js";
import { IConfigurationService } from "../../../../../../../platform/configuration/common/configuration.js";
import { workbenchInstantiationService } from "../../../../../../test/browser/workbenchTestServices.js";
import { BlockAnimation, ANIMATION_DURATION_MS } from "../../../../browser/widget/chatContentParts/chatIncrementalRendering/animations/blockAnimations.js";
import { lastBlockBoundary } from "../../../../browser/widget/chatContentParts/chatIncrementalRendering/buffers/paragraphBuffer.js";
import { WordBuffer } from "../../../../browser/widget/chatContentParts/chatIncrementalRendering/buffers/wordBuffer.js";
import { IncrementalDOMMorpher } from "../../../../browser/widget/chatContentParts/chatIncrementalRendering/chatIncrementalRendering.js";
import { ChatConfiguration } from "../../../../common/constants.js";
suite("lastBlockBoundary", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("returns -1 for empty string", () => {
    assert.strictEqual(lastBlockBoundary(""), -1);
  });
  test("returns -1 for text without any block boundary", () => {
    assert.strictEqual(lastBlockBoundary("hello world"), -1);
  });
  test("returns -1 for single newline", () => {
    assert.strictEqual(lastBlockBoundary("hello\nworld"), -1);
  });
  test("finds a single block boundary", () => {
    const text = "hello\n\nworld";
    assert.strictEqual(lastBlockBoundary(text), 5);
  });
  test("finds the last block boundary among multiple", () => {
    const text = "a\n\nb\n\nc";
    assert.strictEqual(lastBlockBoundary(text), 4);
  });
  test("ignores block boundaries inside a fenced code block", () => {
    const text = "```\ncode\n\nmore code\n```";
    assert.strictEqual(lastBlockBoundary(text), -1);
  });
  test("finds boundary after closing a code fence", () => {
    const text = "```\ncode\n```\n\nafter fence";
    assert.strictEqual(lastBlockBoundary(text), 12);
  });
  test("ignores boundary inside fence but finds one outside", () => {
    const text = "before\n\n```\ninside\n\nfence\n```\n\nafter";
    const result = lastBlockBoundary(text);
    assert.ok(result > 6, `Expected boundary after fence close, got ${result}`);
  });
  test("handles code fence at the very start of the string", () => {
    const text = "```\ncode\n```\n\ntext";
    assert.strictEqual(lastBlockBoundary(text), 12);
  });
  test("handles unclosed code fence (all subsequent boundaries ignored)", () => {
    const text = "```\ncode\n\nmore\n\nstill inside";
    assert.strictEqual(lastBlockBoundary(text), -1);
  });
  test("handles multiple code fences", () => {
    const text = "```\nfirst\n```\n\nbetween\n\n```\nsecond\n```\n\nend";
    const result = lastBlockBoundary(text);
    assert.ok(result > 20, `Expected last boundary near end, got ${result}`);
  });
  test("handles triple backticks mid-line (not a fence)", () => {
    const text = "text ``` not a fence\n\nafter";
    assert.strictEqual(lastBlockBoundary(text), 20);
  });
  test("ignores block boundaries inside a tilde-fenced code block", () => {
    const text = "~~~\ncode\n\nmore code\n~~~";
    assert.strictEqual(lastBlockBoundary(text), -1);
  });
  test("finds boundary after closing a tilde fence", () => {
    const text = "~~~\ncode\n~~~\n\nafter fence";
    assert.strictEqual(lastBlockBoundary(text), 12);
  });
  test("handles unclosed tilde fence", () => {
    const text = "~~~\ncode\n\nmore\n\nstill inside";
    assert.strictEqual(lastBlockBoundary(text), -1);
  });
  test("handles mixed backtick and tilde fences", () => {
    const text = "~~~\ntilde code\n\ninside tilde\n~~~\n\n```\nbacktick code\n\ninside backtick\n```\n\nafter both";
    const result = lastBlockBoundary(text);
    assert.ok(result > 40, `Expected boundary after both fences, got ${result}`);
  });
});
suite("IncrementalDOMMorpher", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  let disposables;
  let instantiationService;
  let configService;
  setup(() => {
    disposables = store.add(new DisposableStore());
    instantiationService = workbenchInstantiationService(void 0, disposables);
    configService = new TestConfigurationService();
    configService.setUserConfiguration(ChatConfiguration.IncrementalRenderingStyle, "fade");
    instantiationService.stub(IConfigurationService, configService);
  });
  teardown(() => {
    disposables.dispose();
  });
  function createMorpher(domNode) {
    const node = domNode ?? mainWindow.document.createElement("div");
    return store.add(instantiationService.createInstance(IncrementalDOMMorpher, node));
  }
  suite("tryMorph", () => {
    test("returns false for non-append edit", () => {
      const morpher = createMorpher();
      morpher.seed("hello");
      assert.strictEqual(morpher.tryMorph("goodbye"), false);
    });
    test("returns true when content is identical (no-op)", () => {
      const morpher = createMorpher();
      morpher.seed("hello");
      assert.strictEqual(morpher.tryMorph("hello"), true);
    });
    test("returns true for appended content", () => {
      const morpher = createMorpher();
      morpher.seed("hello");
      assert.strictEqual(morpher.tryMorph("hello world"), true);
    });
    test("returns false when prefix changes", () => {
      const morpher = createMorpher();
      morpher.seed("hello world");
      assert.strictEqual(morpher.tryMorph("Hello world!"), false);
    });
    test("successive appends all succeed", () => {
      const morpher = createMorpher();
      morpher.seed("a");
      assert.strictEqual(morpher.tryMorph("ab"), true);
      assert.strictEqual(morpher.tryMorph("abc"), true);
      assert.strictEqual(morpher.tryMorph("abcd"), true);
    });
    test("fails after a non-append edit even if previous appends succeeded", () => {
      const morpher = createMorpher();
      morpher.seed("hello");
      assert.strictEqual(morpher.tryMorph("hello world"), true);
      assert.strictEqual(morpher.tryMorph("hi world"), false);
    });
    test("invokes render callback on rAF with block-boundary content", () => {
      const rendered = [];
      const morpher = createMorpher();
      morpher.setRenderCallback((md) => rendered.push(md));
      morpher.seed("");
      morpher.tryMorph("paragraph one\n\nparagraph two");
      assert.strictEqual(rendered.length, 0, "Should not render synchronously");
    });
    test("returns true for content without block boundary (buffered)", () => {
      const morpher = createMorpher();
      morpher.seed("");
      assert.strictEqual(morpher.tryMorph("partial paragraph"), true);
    });
    test("schedules render for content without any paragraph breaks", async () => {
      configService.setUserConfiguration(ChatConfiguration.IncrementalRenderingBuffering, "paragraph");
      const morpher = createMorpher();
      const rendered = [];
      morpher.setRenderCallback((md) => rendered.push(md));
      morpher.seed("");
      morpher.tryMorph("single block no paragraph breaks");
      await new Promise((r) => mainWindow.requestAnimationFrame(r));
      assert.strictEqual(rendered.length, 1);
      assert.strictEqual(rendered[0], "single block no paragraph breaks");
      morpher.tryMorph("single block no paragraph breaks \u2014 more words");
      await new Promise((r) => mainWindow.requestAnimationFrame(r));
      assert.strictEqual(rendered.length, 2);
      assert.strictEqual(rendered[1], "single block no paragraph breaks \u2014 more words");
    });
  });
  suite("seed", () => {
    test("sets baseline markdown", () => {
      const morpher = createMorpher();
      morpher.seed("initial content");
      assert.strictEqual(morpher.tryMorph("initial content"), true);
      assert.strictEqual(morpher.tryMorph("initial content more"), true);
    });
    test("with animateInitial=false uses existing child count as watermark", () => {
      const domNode = mainWindow.document.createElement("div");
      domNode.appendChild(mainWindow.document.createElement("p"));
      domNode.appendChild(mainWindow.document.createElement("p"));
      const morpher = createMorpher(domNode);
      morpher.seed("some content", false);
      for (const child of Array.from(domNode.children)) {
        assert.strictEqual(
          child.classList.contains("chat-smooth-animate-fade"),
          false,
          "Existing children should not be animated when animateInitial is false"
        );
      }
    });
    test("with animateInitial=true animates existing children", () => {
      const domNode = mainWindow.document.createElement("div");
      domNode.appendChild(mainWindow.document.createElement("p"));
      domNode.appendChild(mainWindow.document.createElement("p"));
      const morpher = createMorpher(domNode);
      morpher.seed("some content", true);
      for (const child of Array.from(domNode.children)) {
        assert.strictEqual(
          child.classList.contains("chat-smooth-animate-fade"),
          true,
          "Existing children should be animated when animateInitial is true"
        );
      }
    });
  });
  suite("animation style", () => {
    test("defaults to fade for invalid config value", () => {
      configService.setUserConfiguration(ChatConfiguration.IncrementalRenderingStyle, "invalid-style");
      const domNode = mainWindow.document.createElement("div");
      domNode.appendChild(mainWindow.document.createElement("p"));
      const morpher = createMorpher(domNode);
      morpher.seed("content", true);
      const child = domNode.children[0];
      assert.strictEqual(child.classList.contains("chat-smooth-animate-fade"), true, "Should fall back to fade");
    });
    test("uses configured animation style", () => {
      configService.setUserConfiguration(ChatConfiguration.IncrementalRenderingStyle, "rise");
      const domNode = mainWindow.document.createElement("div");
      domNode.appendChild(mainWindow.document.createElement("p"));
      const morpher = createMorpher(domNode);
      morpher.seed("content", true);
      const child = domNode.children[0];
      assert.strictEqual(child.classList.contains("chat-smooth-animate-rise"), true, "Should use rise style");
    });
    for (const style of ["fade", "rise", "blur", "scale", "slide"]) {
      test(`applies ${style} animation class`, () => {
        configService.setUserConfiguration(ChatConfiguration.IncrementalRenderingStyle, style);
        const domNode = mainWindow.document.createElement("div");
        domNode.appendChild(mainWindow.document.createElement("p"));
        const morpher = createMorpher(domNode);
        morpher.seed("content", true);
        const child = domNode.children[0];
        assert.strictEqual(
          child.classList.contains(`chat-smooth-animate-${style}`),
          true,
          `Should have chat-smooth-animate-${style} class`
        );
      });
    }
  });
  suite("dispose", () => {
    test("clears pending state on dispose", () => {
      const morpher = createMorpher();
      morpher.seed("");
      morpher.setRenderCallback(() => {
      });
      morpher.tryMorph("hello\n\nworld");
      morpher.dispose();
    });
  });
  suite("updateStreamRate", () => {
    test("flushes remaining buffered content on completion for paragraph buffer", async () => {
      configService.setUserConfiguration(ChatConfiguration.IncrementalRenderingBuffering, "paragraph");
      const morpher = createMorpher();
      const rendered = [];
      morpher.setRenderCallback((md) => rendered.push(md));
      morpher.seed("");
      const fullContent = "paragraph one\n\nparagraph two trailing";
      morpher.tryMorph(fullContent);
      await new Promise((r) => mainWindow.requestAnimationFrame(r));
      assert.strictEqual(rendered.length, 1);
      assert.strictEqual(rendered[0], "paragraph one\n\n");
      morpher.updateStreamRate(100, true);
      await new Promise((r) => mainWindow.requestAnimationFrame(r));
      assert.strictEqual(rendered.length, 2);
      assert.strictEqual(rendered[1], fullContent);
    });
    test("signals when word-buffered content has drained to the DOM", async () => {
      configService.setUserConfiguration(ChatConfiguration.IncrementalRenderingBuffering, "word");
      const morpher = createMorpher();
      morpher.setRenderCallback(() => {
      });
      let drainCount = 0;
      disposables.add(morpher.onDidDrain(() => drainCount++));
      const didDrain = Event.toPromise(morpher.onDidDrain);
      morpher.seed("one two three");
      morpher.updateStreamRate(2e3, true);
      assert.strictEqual(morpher.isDrained, false);
      await didDrain;
      assert.deepStrictEqual({
        isDrained: morpher.isDrained,
        drainCount
      }, {
        isDrained: true,
        drainCount: 1
      });
    });
  });
});
suite("BlockAnimation", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("applies animation class and custom properties to new children", () => {
    const anim = new BlockAnimation("fade");
    const container = mainWindow.document.createElement("div");
    const child = container.appendChild(mainWindow.document.createElement("p"));
    anim.animate(container.children, 0, 1, 0);
    assert.strictEqual(child.classList.contains("chat-smooth-animate-fade"), true);
    assert.strictEqual(child.style.getPropertyValue("--chat-smooth-duration"), `${ANIMATION_DURATION_MS}ms`);
    assert.ok(child.style.getPropertyValue("--chat-smooth-delay") !== "");
  });
  test("does not strip animation class on bubbled animationend from nested element", () => {
    const anim = new BlockAnimation("rise");
    const container = mainWindow.document.createElement("div");
    const parent = container.appendChild(mainWindow.document.createElement("div"));
    const nested = parent.appendChild(mainWindow.document.createElement("span"));
    anim.animate(container.children, 0, 1, 0);
    assert.strictEqual(parent.classList.contains("chat-smooth-animate-rise"), true);
    const bubbledEvent = new AnimationEvent("animationend", { bubbles: true });
    nested.dispatchEvent(bubbledEvent);
    assert.strictEqual(
      parent.classList.contains("chat-smooth-animate-rise"),
      true,
      "Animation class should not be removed by bubbled event"
    );
    assert.strictEqual(
      parent.style.getPropertyValue("--chat-smooth-duration"),
      `${ANIMATION_DURATION_MS}ms`,
      "Custom properties should not be removed by bubbled event"
    );
  });
  test("strips animation class on direct animationend from the animated element", () => {
    const anim = new BlockAnimation("blur");
    const container = mainWindow.document.createElement("div");
    const child = container.appendChild(mainWindow.document.createElement("p"));
    anim.animate(container.children, 0, 1, 0);
    assert.strictEqual(child.classList.contains("chat-smooth-animate-blur"), true);
    const directEvent = new AnimationEvent("animationend", { bubbles: true });
    child.dispatchEvent(directEvent);
    assert.strictEqual(
      child.classList.contains("chat-smooth-animate-blur"),
      false,
      "Animation class should be removed after direct animationend"
    );
    assert.strictEqual(
      child.style.getPropertyValue("--chat-smooth-duration"),
      "",
      "Custom property should be removed after direct animationend"
    );
  });
  test("staggers delay across multiple new children", () => {
    const anim = new BlockAnimation("fade");
    const container = mainWindow.document.createElement("div");
    container.appendChild(mainWindow.document.createElement("p"));
    container.appendChild(mainWindow.document.createElement("p"));
    container.appendChild(mainWindow.document.createElement("p"));
    anim.animate(container.children, 0, 3, 0);
    const delays = Array.from(container.children).map(
      (c) => parseInt(c.style.getPropertyValue("--chat-smooth-delay"))
    );
    assert.ok(delays[1] > delays[0], `Second delay ${delays[1]} should be greater than first ${delays[0]}`);
    assert.ok(delays[2] > delays[1], `Third delay ${delays[2]} should be greater than second ${delays[1]}`);
  });
});
suite("WordBuffer", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("setRate with isComplete uses at least MIN_RATE_AFTER_COMPLETE", () => {
    const buffer = new WordBuffer();
    buffer.setRate(10, true);
    const md = "word1 word2 word3 word4 word5 word6 word7 word8 word9 word10";
    const result1 = buffer.filterFlush(md);
    assert.ok(result1 !== void 0, "First flush should reveal content");
  });
  test("setRate with undefined rate and isComplete defaults to MIN_RATE_AFTER_COMPLETE", () => {
    const buffer = new WordBuffer();
    buffer.setRate(void 0, true);
    const md = "word1 word2 word3";
    const result = buffer.filterFlush(md);
    assert.ok(result !== void 0, "Should reveal content with default complete rate");
  });
  test("setRate during streaming clamps between MIN_RATE and MAX_RATE", () => {
    const buffer = new WordBuffer();
    buffer.setRate(1, false);
    const md = "word1 word2 word3";
    const result = buffer.filterFlush(md);
    assert.ok(result !== void 0, "Should reveal content even with low rate (clamped to MIN_RATE)");
  });
  test("setRate with undefined rate during streaming defaults to DEFAULT_RATE", () => {
    const buffer = new WordBuffer();
    buffer.setRate(void 0, false);
    const md = "word1 word2";
    const result = buffer.filterFlush(md);
    assert.ok(result !== void 0, "Should reveal content with default streaming rate");
  });
  test("needsNextFrame is true when words remain unrevealed", () => {
    const buffer = new WordBuffer();
    buffer.setRate(1, false);
    buffer.filterFlush("word1 word2 word3 word4 word5");
    assert.strictEqual(buffer.needsNextFrame, true, "Should need another frame when words remain");
  });
  test("needsNextFrame is false when all words are revealed", () => {
    const buffer = new WordBuffer();
    buffer.setRate(2e3, false);
    buffer.filterFlush("hello");
    assert.strictEqual(buffer.needsNextFrame, false, "Should not need another frame when all words shown");
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGJyb3dzZXJcXHdpZGdldFxcY2hhdENvbnRlbnRQYXJ0c1xcY2hhdEluY3JlbWVudGFsUmVuZGVyaW5nLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBtYWluV2luZG93IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3dpbmRvdy5qcyc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vdGVzdC9jb21tb24vdGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgd29ya2JlbmNoSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi90ZXN0L2Jyb3dzZXIvd29ya2JlbmNoVGVzdFNlcnZpY2VzLmpzJztcbmltcG9ydCB7IEJsb2NrQW5pbWF0aW9uLCBBTklNQVRJT05fRFVSQVRJT05fTVMgfSBmcm9tICcuLi8uLi8uLi8uLi9icm93c2VyL3dpZGdldC9jaGF0Q29udGVudFBhcnRzL2NoYXRJbmNyZW1lbnRhbFJlbmRlcmluZy9hbmltYXRpb25zL2Jsb2NrQW5pbWF0aW9ucy5qcyc7XG5pbXBvcnQgeyBsYXN0QmxvY2tCb3VuZGFyeSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvd2lkZ2V0L2NoYXRDb250ZW50UGFydHMvY2hhdEluY3JlbWVudGFsUmVuZGVyaW5nL2J1ZmZlcnMvcGFyYWdyYXBoQnVmZmVyLmpzJztcbmltcG9ydCB7IFdvcmRCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9icm93c2VyL3dpZGdldC9jaGF0Q29udGVudFBhcnRzL2NoYXRJbmNyZW1lbnRhbFJlbmRlcmluZy9idWZmZXJzL3dvcmRCdWZmZXIuanMnO1xuaW1wb3J0IHsgSW5jcmVtZW50YWxET01Nb3JwaGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci93aWRnZXQvY2hhdENvbnRlbnRQYXJ0cy9jaGF0SW5jcmVtZW50YWxSZW5kZXJpbmcvY2hhdEluY3JlbWVudGFsUmVuZGVyaW5nLmpzJztcbmltcG9ydCB7IENoYXRDb25maWd1cmF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NvbnN0YW50cy5qcyc7XG5cbnN1aXRlKCdsYXN0QmxvY2tCb3VuZGFyeScsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdyZXR1cm5zIC0xIGZvciBlbXB0eSBzdHJpbmcnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxhc3RCbG9ja0JvdW5kYXJ5KCcnKSwgLTEpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXR1cm5zIC0xIGZvciB0ZXh0IHdpdGhvdXQgYW55IGJsb2NrIGJvdW5kYXJ5JywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsYXN0QmxvY2tCb3VuZGFyeSgnaGVsbG8gd29ybGQnKSwgLTEpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXR1cm5zIC0xIGZvciBzaW5nbGUgbmV3bGluZScsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGFzdEJsb2NrQm91bmRhcnkoJ2hlbGxvXFxud29ybGQnKSwgLTEpO1xuXHR9KTtcblxuXHR0ZXN0KCdmaW5kcyBhIHNpbmdsZSBibG9jayBib3VuZGFyeScsICgpID0+IHtcblx0XHRjb25zdCB0ZXh0ID0gJ2hlbGxvXFxuXFxud29ybGQnO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsYXN0QmxvY2tCb3VuZGFyeSh0ZXh0KSwgNSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZpbmRzIHRoZSBsYXN0IGJsb2NrIGJvdW5kYXJ5IGFtb25nIG11bHRpcGxlJywgKCkgPT4ge1xuXHRcdGNvbnN0IHRleHQgPSAnYVxcblxcbmJcXG5cXG5jJztcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGFzdEJsb2NrQm91bmRhcnkodGV4dCksIDQpO1xuXHR9KTtcblxuXHR0ZXN0KCdpZ25vcmVzIGJsb2NrIGJvdW5kYXJpZXMgaW5zaWRlIGEgZmVuY2VkIGNvZGUgYmxvY2snLCAoKSA9PiB7XG5cdFx0Y29uc3QgdGV4dCA9ICdgYGBcXG5jb2RlXFxuXFxubW9yZSBjb2RlXFxuYGBgJztcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGFzdEJsb2NrQm91bmRhcnkodGV4dCksIC0xKTtcblx0fSk7XG5cblx0dGVzdCgnZmluZHMgYm91bmRhcnkgYWZ0ZXIgY2xvc2luZyBhIGNvZGUgZmVuY2UnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdGV4dCA9ICdgYGBcXG5jb2RlXFxuYGBgXFxuXFxuYWZ0ZXIgZmVuY2UnO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsYXN0QmxvY2tCb3VuZGFyeSh0ZXh0KSwgMTIpO1xuXHR9KTtcblxuXHR0ZXN0KCdpZ25vcmVzIGJvdW5kYXJ5IGluc2lkZSBmZW5jZSBidXQgZmluZHMgb25lIG91dHNpZGUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdGV4dCA9ICdiZWZvcmVcXG5cXG5gYGBcXG5pbnNpZGVcXG5cXG5mZW5jZVxcbmBgYFxcblxcbmFmdGVyJztcblx0XHQvLyBGaXJzdCBcXG5cXG4gYXQgaW5kZXggNiAoYmVmb3JlIGZlbmNlKSwgaW5zaWRlIGZlbmNlIGF0IH4xOCwgYWZ0ZXIgZmVuY2UgYXQgfjI4XG5cdFx0Y29uc3QgcmVzdWx0ID0gbGFzdEJsb2NrQm91bmRhcnkodGV4dCk7XG5cdFx0Ly8gVGhlIGxhc3QgdmFsaWQgYm91bmRhcnkgc2hvdWxkIGJlIHRoZSBvbmUgYWZ0ZXIgdGhlIGNsb3NpbmcgYGBgXG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdCA+IDYsIGBFeHBlY3RlZCBib3VuZGFyeSBhZnRlciBmZW5jZSBjbG9zZSwgZ290ICR7cmVzdWx0fWApO1xuXHR9KTtcblxuXHR0ZXN0KCdoYW5kbGVzIGNvZGUgZmVuY2UgYXQgdGhlIHZlcnkgc3RhcnQgb2YgdGhlIHN0cmluZycsICgpID0+IHtcblx0XHRjb25zdCB0ZXh0ID0gJ2BgYFxcbmNvZGVcXG5gYGBcXG5cXG50ZXh0Jztcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGFzdEJsb2NrQm91bmRhcnkodGV4dCksIDEyKTtcblx0fSk7XG5cblx0dGVzdCgnaGFuZGxlcyB1bmNsb3NlZCBjb2RlIGZlbmNlIChhbGwgc3Vic2VxdWVudCBib3VuZGFyaWVzIGlnbm9yZWQpJywgKCkgPT4ge1xuXHRcdGNvbnN0IHRleHQgPSAnYGBgXFxuY29kZVxcblxcbm1vcmVcXG5cXG5zdGlsbCBpbnNpZGUnO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsYXN0QmxvY2tCb3VuZGFyeSh0ZXh0KSwgLTEpO1xuXHR9KTtcblxuXHR0ZXN0KCdoYW5kbGVzIG11bHRpcGxlIGNvZGUgZmVuY2VzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHRleHQgPSAnYGBgXFxuZmlyc3RcXG5gYGBcXG5cXG5iZXR3ZWVuXFxuXFxuYGBgXFxuc2Vjb25kXFxuYGBgXFxuXFxuZW5kJztcblx0XHRjb25zdCByZXN1bHQgPSBsYXN0QmxvY2tCb3VuZGFyeSh0ZXh0KTtcblx0XHQvLyBMYXN0IHZhbGlkIFxcblxcbiBpcyBhZnRlciB0aGUgc2Vjb25kIGNsb3NpbmcgZmVuY2Vcblx0XHRhc3NlcnQub2socmVzdWx0ID4gMjAsIGBFeHBlY3RlZCBsYXN0IGJvdW5kYXJ5IG5lYXIgZW5kLCBnb3QgJHtyZXN1bHR9YCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2hhbmRsZXMgdHJpcGxlIGJhY2t0aWNrcyBtaWQtbGluZSAobm90IGEgZmVuY2UpJywgKCkgPT4ge1xuXHRcdC8vIFRyaXBsZSBiYWNrdGlja3MgbXVzdCBiZSBhdCB0aGUgc3RhcnQgb2YgYSBsaW5lIHRvIGNvdW50IGFzIGEgZmVuY2Vcblx0XHRjb25zdCB0ZXh0ID0gJ3RleHQgYGBgIG5vdCBhIGZlbmNlXFxuXFxuYWZ0ZXInO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsYXN0QmxvY2tCb3VuZGFyeSh0ZXh0KSwgMjApO1xuXHR9KTtcblxuXHR0ZXN0KCdpZ25vcmVzIGJsb2NrIGJvdW5kYXJpZXMgaW5zaWRlIGEgdGlsZGUtZmVuY2VkIGNvZGUgYmxvY2snLCAoKSA9PiB7XG5cdFx0Y29uc3QgdGV4dCA9ICd+fn5cXG5jb2RlXFxuXFxubW9yZSBjb2RlXFxufn5+Jztcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGFzdEJsb2NrQm91bmRhcnkodGV4dCksIC0xKTtcblx0fSk7XG5cblx0dGVzdCgnZmluZHMgYm91bmRhcnkgYWZ0ZXIgY2xvc2luZyBhIHRpbGRlIGZlbmNlJywgKCkgPT4ge1xuXHRcdGNvbnN0IHRleHQgPSAnfn5+XFxuY29kZVxcbn5+flxcblxcbmFmdGVyIGZlbmNlJztcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGFzdEJsb2NrQm91bmRhcnkodGV4dCksIDEyKTtcblx0fSk7XG5cblx0dGVzdCgnaGFuZGxlcyB1bmNsb3NlZCB0aWxkZSBmZW5jZScsICgpID0+IHtcblx0XHRjb25zdCB0ZXh0ID0gJ35+flxcbmNvZGVcXG5cXG5tb3JlXFxuXFxuc3RpbGwgaW5zaWRlJztcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGFzdEJsb2NrQm91bmRhcnkodGV4dCksIC0xKTtcblx0fSk7XG5cblx0dGVzdCgnaGFuZGxlcyBtaXhlZCBiYWNrdGljayBhbmQgdGlsZGUgZmVuY2VzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHRleHQgPSAnfn5+XFxudGlsZGUgY29kZVxcblxcbmluc2lkZSB0aWxkZVxcbn5+flxcblxcbmBgYFxcbmJhY2t0aWNrIGNvZGVcXG5cXG5pbnNpZGUgYmFja3RpY2tcXG5gYGBcXG5cXG5hZnRlciBib3RoJztcblx0XHRjb25zdCByZXN1bHQgPSBsYXN0QmxvY2tCb3VuZGFyeSh0ZXh0KTtcblx0XHQvLyBUaGUgbGFzdCB2YWxpZCBib3VuZGFyeSBzaG91bGQgYmUgYWZ0ZXIgdGhlIGNsb3NpbmcgYGBgXG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdCA+IDQwLCBgRXhwZWN0ZWQgYm91bmRhcnkgYWZ0ZXIgYm90aCBmZW5jZXMsIGdvdCAke3Jlc3VsdH1gKTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ0luY3JlbWVudGFsRE9NTW9ycGhlcicsICgpID0+IHtcblx0Y29uc3Qgc3RvcmUgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRsZXQgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcblx0bGV0IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBSZXR1cm5UeXBlPHR5cGVvZiB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZT47XG5cdGxldCBjb25maWdTZXJ2aWNlOiBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2U7XG5cblx0c2V0dXAoKCkgPT4ge1xuXHRcdGRpc3Bvc2FibGVzID0gc3RvcmUuYWRkKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2UgPSB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSh1bmRlZmluZWQsIGRpc3Bvc2FibGVzKTtcblxuXHRcdGNvbmZpZ1NlcnZpY2UgPSBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKCk7XG5cdFx0Y29uZmlnU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihDaGF0Q29uZmlndXJhdGlvbi5JbmNyZW1lbnRhbFJlbmRlcmluZ1N0eWxlLCAnZmFkZScpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjb25maWdTZXJ2aWNlKTtcblx0fSk7XG5cblx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0ZnVuY3Rpb24gY3JlYXRlTW9ycGhlcihkb21Ob2RlPzogSFRNTEVsZW1lbnQpOiBJbmNyZW1lbnRhbERPTU1vcnBoZXIge1xuXHRcdGNvbnN0IG5vZGUgPSBkb21Ob2RlID8/IG1haW5XaW5kb3cuZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0cmV0dXJuIHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShJbmNyZW1lbnRhbERPTU1vcnBoZXIsIG5vZGUpKTtcblx0fVxuXG5cdHN1aXRlKCd0cnlNb3JwaCcsICgpID0+IHtcblxuXHRcdHRlc3QoJ3JldHVybnMgZmFsc2UgZm9yIG5vbi1hcHBlbmQgZWRpdCcsICgpID0+IHtcblx0XHRcdGNvbnN0IG1vcnBoZXIgPSBjcmVhdGVNb3JwaGVyKCk7XG5cdFx0XHRtb3JwaGVyLnNlZWQoJ2hlbGxvJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9ycGhlci50cnlNb3JwaCgnZ29vZGJ5ZScpLCBmYWxzZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIHRydWUgd2hlbiBjb250ZW50IGlzIGlkZW50aWNhbCAobm8tb3ApJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9ycGhlciA9IGNyZWF0ZU1vcnBoZXIoKTtcblx0XHRcdG1vcnBoZXIuc2VlZCgnaGVsbG8nKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb3JwaGVyLnRyeU1vcnBoKCdoZWxsbycpLCB0cnVlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgdHJ1ZSBmb3IgYXBwZW5kZWQgY29udGVudCcsICgpID0+IHtcblx0XHRcdGNvbnN0IG1vcnBoZXIgPSBjcmVhdGVNb3JwaGVyKCk7XG5cdFx0XHRtb3JwaGVyLnNlZWQoJ2hlbGxvJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9ycGhlci50cnlNb3JwaCgnaGVsbG8gd29ybGQnKSwgdHJ1ZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIGZhbHNlIHdoZW4gcHJlZml4IGNoYW5nZXMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtb3JwaGVyID0gY3JlYXRlTW9ycGhlcigpO1xuXHRcdFx0bW9ycGhlci5zZWVkKCdoZWxsbyB3b3JsZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vcnBoZXIudHJ5TW9ycGgoJ0hlbGxvIHdvcmxkIScpLCBmYWxzZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzdWNjZXNzaXZlIGFwcGVuZHMgYWxsIHN1Y2NlZWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtb3JwaGVyID0gY3JlYXRlTW9ycGhlcigpO1xuXHRcdFx0bW9ycGhlci5zZWVkKCdhJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9ycGhlci50cnlNb3JwaCgnYWInKSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9ycGhlci50cnlNb3JwaCgnYWJjJyksIHRydWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vcnBoZXIudHJ5TW9ycGgoJ2FiY2QnKSwgdHJ1ZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdmYWlscyBhZnRlciBhIG5vbi1hcHBlbmQgZWRpdCBldmVuIGlmIHByZXZpb3VzIGFwcGVuZHMgc3VjY2VlZGVkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9ycGhlciA9IGNyZWF0ZU1vcnBoZXIoKTtcblx0XHRcdG1vcnBoZXIuc2VlZCgnaGVsbG8nKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb3JwaGVyLnRyeU1vcnBoKCdoZWxsbyB3b3JsZCcpLCB0cnVlKTtcblx0XHRcdC8vIE5vdyBhIHJld3JpdGUgb2YgZWFybGllciBjb250ZW50XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9ycGhlci50cnlNb3JwaCgnaGkgd29ybGQnKSwgZmFsc2UpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaW52b2tlcyByZW5kZXIgY2FsbGJhY2sgb24gckFGIHdpdGggYmxvY2stYm91bmRhcnkgY29udGVudCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlbmRlcmVkOiBzdHJpbmdbXSA9IFtdO1xuXHRcdFx0Y29uc3QgbW9ycGhlciA9IGNyZWF0ZU1vcnBoZXIoKTtcblx0XHRcdG1vcnBoZXIuc2V0UmVuZGVyQ2FsbGJhY2sobWQgPT4gcmVuZGVyZWQucHVzaChtZCkpO1xuXHRcdFx0bW9ycGhlci5zZWVkKCcnKTtcblxuXHRcdFx0Ly8gQXBwZW5kIGNvbnRlbnQgd2l0aCBhIGJsb2NrIGJvdW5kYXJ5XG5cdFx0XHRtb3JwaGVyLnRyeU1vcnBoKCdwYXJhZ3JhcGggb25lXFxuXFxucGFyYWdyYXBoIHR3bycpO1xuXHRcdFx0Ly8gVGhlIGNhbGxiYWNrIGZpcmVzIGFzeW5jaHJvbm91c2x5IHZpYSByQUYsIG5vdCBzeW5jaHJvbm91c2x5XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVuZGVyZWQubGVuZ3RoLCAwLCAnU2hvdWxkIG5vdCByZW5kZXIgc3luY2hyb25vdXNseScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyB0cnVlIGZvciBjb250ZW50IHdpdGhvdXQgYmxvY2sgYm91bmRhcnkgKGJ1ZmZlcmVkKScsICgpID0+IHtcblx0XHRcdGNvbnN0IG1vcnBoZXIgPSBjcmVhdGVNb3JwaGVyKCk7XG5cdFx0XHRtb3JwaGVyLnNlZWQoJycpO1xuXHRcdFx0Ly8gTm8gXFxuXFxuIFx1MjAxNCBjb250ZW50IGlzIGJ1ZmZlcmVkXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9ycGhlci50cnlNb3JwaCgncGFydGlhbCBwYXJhZ3JhcGgnKSwgdHJ1ZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzY2hlZHVsZXMgcmVuZGVyIGZvciBjb250ZW50IHdpdGhvdXQgYW55IHBhcmFncmFwaCBicmVha3MnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKENoYXRDb25maWd1cmF0aW9uLkluY3JlbWVudGFsUmVuZGVyaW5nQnVmZmVyaW5nLCAncGFyYWdyYXBoJyk7XG5cdFx0XHRjb25zdCBtb3JwaGVyID0gY3JlYXRlTW9ycGhlcigpO1xuXHRcdFx0Y29uc3QgcmVuZGVyZWQ6IHN0cmluZ1tdID0gW107XG5cdFx0XHRtb3JwaGVyLnNldFJlbmRlckNhbGxiYWNrKG1kID0+IHJlbmRlcmVkLnB1c2gobWQpKTtcblx0XHRcdG1vcnBoZXIuc2VlZCgnJyk7XG5cblx0XHRcdC8vIEFwcGVuZCBjb250ZW50IHdpdGggbm8gXFxuXFxuIGF0IGFsbCBcdTIwMTQgcHJldmlvdXNseSB0aGlzIHdvdWxkXG5cdFx0XHQvLyBuZXZlciByZW5kZXIgYmVjYXVzZSBnZXRSZW5kZXJhYmxlIHJldHVybmVkIGxhc3RSZW5kZXJlZCAoZW1wdHkgc2VlZCkuXG5cdFx0XHRtb3JwaGVyLnRyeU1vcnBoKCdzaW5nbGUgYmxvY2sgbm8gcGFyYWdyYXBoIGJyZWFrcycpO1xuXG5cdFx0XHQvLyBGbHVzaCB0aGUgckFGIFx1MjAxNCB0aGUgZnVsbCBjb250ZW50IHNob3VsZCByZW5kZXIgc2luY2Vcblx0XHRcdC8vIHRoZXJlIGFyZSBubyBwYXJhZ3JhcGggYm91bmRhcmllcyB0byBidWZmZXIgYXQuXG5cdFx0XHRhd2FpdCBuZXcgUHJvbWlzZShyID0+IG1haW5XaW5kb3cucmVxdWVzdEFuaW1hdGlvbkZyYW1lKHIpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZW5kZXJlZC5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlbmRlcmVkWzBdLCAnc2luZ2xlIGJsb2NrIG5vIHBhcmFncmFwaCBicmVha3MnKTtcblxuXHRcdFx0Ly8gRnVydGhlciBhcHBlbmRzIHNob3VsZCBhbHNvIHJlbmRlclxuXHRcdFx0bW9ycGhlci50cnlNb3JwaCgnc2luZ2xlIGJsb2NrIG5vIHBhcmFncmFwaCBicmVha3MgXHUyMDE0IG1vcmUgd29yZHMnKTtcblx0XHRcdGF3YWl0IG5ldyBQcm9taXNlKHIgPT4gbWFpbldpbmRvdy5yZXF1ZXN0QW5pbWF0aW9uRnJhbWUocikpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlbmRlcmVkLmxlbmd0aCwgMik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVuZGVyZWRbMV0sICdzaW5nbGUgYmxvY2sgbm8gcGFyYWdyYXBoIGJyZWFrcyBcdTIwMTQgbW9yZSB3b3JkcycpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnc2VlZCcsICgpID0+IHtcblxuXHRcdHRlc3QoJ3NldHMgYmFzZWxpbmUgbWFya2Rvd24nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtb3JwaGVyID0gY3JlYXRlTW9ycGhlcigpO1xuXHRcdFx0bW9ycGhlci5zZWVkKCdpbml0aWFsIGNvbnRlbnQnKTtcblx0XHRcdC8vIEFmdGVyIHNlZWRpbmcsIHRyeU1vcnBoIHdpdGggc2FtZSBjb250ZW50IGlzIGEgbm8tb3Bcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb3JwaGVyLnRyeU1vcnBoKCdpbml0aWFsIGNvbnRlbnQnKSwgdHJ1ZSk7XG5cdFx0XHQvLyBBbmQgYXBwZW5kaW5nIHdvcmtzXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9ycGhlci50cnlNb3JwaCgnaW5pdGlhbCBjb250ZW50IG1vcmUnKSwgdHJ1ZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd3aXRoIGFuaW1hdGVJbml0aWFsPWZhbHNlIHVzZXMgZXhpc3RpbmcgY2hpbGQgY291bnQgYXMgd2F0ZXJtYXJrJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZG9tTm9kZSA9IG1haW5XaW5kb3cuZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0XHRkb21Ob2RlLmFwcGVuZENoaWxkKG1haW5XaW5kb3cuZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgncCcpKTtcblx0XHRcdGRvbU5vZGUuYXBwZW5kQ2hpbGQobWFpbldpbmRvdy5kb2N1bWVudC5jcmVhdGVFbGVtZW50KCdwJykpO1xuXHRcdFx0Y29uc3QgbW9ycGhlciA9IGNyZWF0ZU1vcnBoZXIoZG9tTm9kZSk7XG5cblx0XHRcdG1vcnBoZXIuc2VlZCgnc29tZSBjb250ZW50JywgZmFsc2UpO1xuXHRcdFx0Ly8gTm8gYW5pbWF0aW9uIGNsYXNzZXMgc2hvdWxkIGJlIGFwcGxpZWQgc2luY2UgYWxsIGNoaWxkcmVuIGFyZSBcInJldmVhbGVkXCJcblx0XHRcdGZvciAoY29uc3QgY2hpbGQgb2YgQXJyYXkuZnJvbShkb21Ob2RlLmNoaWxkcmVuKSkge1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRcdFx0KGNoaWxkIGFzIEhUTUxFbGVtZW50KS5jbGFzc0xpc3QuY29udGFpbnMoJ2NoYXQtc21vb3RoLWFuaW1hdGUtZmFkZScpLFxuXHRcdFx0XHRcdGZhbHNlLFxuXHRcdFx0XHRcdCdFeGlzdGluZyBjaGlsZHJlbiBzaG91bGQgbm90IGJlIGFuaW1hdGVkIHdoZW4gYW5pbWF0ZUluaXRpYWwgaXMgZmFsc2UnXG5cdFx0XHRcdCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd3aXRoIGFuaW1hdGVJbml0aWFsPXRydWUgYW5pbWF0ZXMgZXhpc3RpbmcgY2hpbGRyZW4nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBkb21Ob2RlID0gbWFpbldpbmRvdy5kb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRcdGRvbU5vZGUuYXBwZW5kQ2hpbGQobWFpbldpbmRvdy5kb2N1bWVudC5jcmVhdGVFbGVtZW50KCdwJykpO1xuXHRcdFx0ZG9tTm9kZS5hcHBlbmRDaGlsZChtYWluV2luZG93LmRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3AnKSk7XG5cdFx0XHRjb25zdCBtb3JwaGVyID0gY3JlYXRlTW9ycGhlcihkb21Ob2RlKTtcblxuXHRcdFx0bW9ycGhlci5zZWVkKCdzb21lIGNvbnRlbnQnLCB0cnVlKTtcblx0XHRcdC8vIENoaWxkcmVuIHNob3VsZCBoYXZlIHRoZSBhbmltYXRpb24gY2xhc3Ncblx0XHRcdGZvciAoY29uc3QgY2hpbGQgb2YgQXJyYXkuZnJvbShkb21Ob2RlLmNoaWxkcmVuKSkge1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRcdFx0KGNoaWxkIGFzIEhUTUxFbGVtZW50KS5jbGFzc0xpc3QuY29udGFpbnMoJ2NoYXQtc21vb3RoLWFuaW1hdGUtZmFkZScpLFxuXHRcdFx0XHRcdHRydWUsXG5cdFx0XHRcdFx0J0V4aXN0aW5nIGNoaWxkcmVuIHNob3VsZCBiZSBhbmltYXRlZCB3aGVuIGFuaW1hdGVJbml0aWFsIGlzIHRydWUnXG5cdFx0XHRcdCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdhbmltYXRpb24gc3R5bGUnLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdkZWZhdWx0cyB0byBmYWRlIGZvciBpbnZhbGlkIGNvbmZpZyB2YWx1ZScsICgpID0+IHtcblx0XHRcdGNvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oQ2hhdENvbmZpZ3VyYXRpb24uSW5jcmVtZW50YWxSZW5kZXJpbmdTdHlsZSwgJ2ludmFsaWQtc3R5bGUnKTtcblx0XHRcdGNvbnN0IGRvbU5vZGUgPSBtYWluV2luZG93LmRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdFx0ZG9tTm9kZS5hcHBlbmRDaGlsZChtYWluV2luZG93LmRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3AnKSk7XG5cdFx0XHRjb25zdCBtb3JwaGVyID0gY3JlYXRlTW9ycGhlcihkb21Ob2RlKTtcblx0XHRcdG1vcnBoZXIuc2VlZCgnY29udGVudCcsIHRydWUpO1xuXG5cdFx0XHRjb25zdCBjaGlsZCA9IGRvbU5vZGUuY2hpbGRyZW5bMF0gYXMgSFRNTEVsZW1lbnQ7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2hpbGQuY2xhc3NMaXN0LmNvbnRhaW5zKCdjaGF0LXNtb290aC1hbmltYXRlLWZhZGUnKSwgdHJ1ZSwgJ1Nob3VsZCBmYWxsIGJhY2sgdG8gZmFkZScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndXNlcyBjb25maWd1cmVkIGFuaW1hdGlvbiBzdHlsZScsICgpID0+IHtcblx0XHRcdGNvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oQ2hhdENvbmZpZ3VyYXRpb24uSW5jcmVtZW50YWxSZW5kZXJpbmdTdHlsZSwgJ3Jpc2UnKTtcblx0XHRcdGNvbnN0IGRvbU5vZGUgPSBtYWluV2luZG93LmRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdFx0ZG9tTm9kZS5hcHBlbmRDaGlsZChtYWluV2luZG93LmRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3AnKSk7XG5cdFx0XHRjb25zdCBtb3JwaGVyID0gY3JlYXRlTW9ycGhlcihkb21Ob2RlKTtcblx0XHRcdG1vcnBoZXIuc2VlZCgnY29udGVudCcsIHRydWUpO1xuXG5cdFx0XHRjb25zdCBjaGlsZCA9IGRvbU5vZGUuY2hpbGRyZW5bMF0gYXMgSFRNTEVsZW1lbnQ7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2hpbGQuY2xhc3NMaXN0LmNvbnRhaW5zKCdjaGF0LXNtb290aC1hbmltYXRlLXJpc2UnKSwgdHJ1ZSwgJ1Nob3VsZCB1c2UgcmlzZSBzdHlsZScpO1xuXHRcdH0pO1xuXG5cdFx0Zm9yIChjb25zdCBzdHlsZSBvZiBbJ2ZhZGUnLCAncmlzZScsICdibHVyJywgJ3NjYWxlJywgJ3NsaWRlJ10gYXMgY29uc3QpIHtcblx0XHRcdHRlc3QoYGFwcGxpZXMgJHtzdHlsZX0gYW5pbWF0aW9uIGNsYXNzYCwgKCkgPT4ge1xuXHRcdFx0XHRjb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKENoYXRDb25maWd1cmF0aW9uLkluY3JlbWVudGFsUmVuZGVyaW5nU3R5bGUsIHN0eWxlKTtcblx0XHRcdFx0Y29uc3QgZG9tTm9kZSA9IG1haW5XaW5kb3cuZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0XHRcdGRvbU5vZGUuYXBwZW5kQ2hpbGQobWFpbldpbmRvdy5kb2N1bWVudC5jcmVhdGVFbGVtZW50KCdwJykpO1xuXHRcdFx0XHRjb25zdCBtb3JwaGVyID0gY3JlYXRlTW9ycGhlcihkb21Ob2RlKTtcblx0XHRcdFx0bW9ycGhlci5zZWVkKCdjb250ZW50JywgdHJ1ZSk7XG5cblx0XHRcdFx0Y29uc3QgY2hpbGQgPSBkb21Ob2RlLmNoaWxkcmVuWzBdIGFzIEhUTUxFbGVtZW50O1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRcdFx0Y2hpbGQuY2xhc3NMaXN0LmNvbnRhaW5zKGBjaGF0LXNtb290aC1hbmltYXRlLSR7c3R5bGV9YCksXG5cdFx0XHRcdFx0dHJ1ZSxcblx0XHRcdFx0XHRgU2hvdWxkIGhhdmUgY2hhdC1zbW9vdGgtYW5pbWF0ZS0ke3N0eWxlfSBjbGFzc2Bcblx0XHRcdFx0KTtcblx0XHRcdH0pO1xuXHRcdH1cblx0fSk7XG5cblx0c3VpdGUoJ2Rpc3Bvc2UnLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdjbGVhcnMgcGVuZGluZyBzdGF0ZSBvbiBkaXNwb3NlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9ycGhlciA9IGNyZWF0ZU1vcnBoZXIoKTtcblx0XHRcdG1vcnBoZXIuc2VlZCgnJyk7XG5cdFx0XHRtb3JwaGVyLnNldFJlbmRlckNhbGxiYWNrKCgpID0+IHsgfSk7XG5cdFx0XHRtb3JwaGVyLnRyeU1vcnBoKCdoZWxsb1xcblxcbndvcmxkJyk7XG5cdFx0XHQvLyBEaXNwb3NlIGJlZm9yZSByQUYgZmlyZXNcblx0XHRcdG1vcnBoZXIuZGlzcG9zZSgpO1xuXHRcdFx0Ly8gTm8gZXJyb3Igc2hvdWxkIG9jY3VyIFx1MjAxNCByQUYgaXMgY2FuY2VsbGVkXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCd1cGRhdGVTdHJlYW1SYXRlJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgnZmx1c2hlcyByZW1haW5pbmcgYnVmZmVyZWQgY29udGVudCBvbiBjb21wbGV0aW9uIGZvciBwYXJhZ3JhcGggYnVmZmVyJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Ly8gVXNlIHBhcmFncmFwaCBidWZmZXIgKGRlZmF1bHQpXG5cdFx0XHRjb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKENoYXRDb25maWd1cmF0aW9uLkluY3JlbWVudGFsUmVuZGVyaW5nQnVmZmVyaW5nLCAncGFyYWdyYXBoJyk7XG5cdFx0XHRjb25zdCBtb3JwaGVyID0gY3JlYXRlTW9ycGhlcigpO1xuXHRcdFx0Y29uc3QgcmVuZGVyZWQ6IHN0cmluZ1tdID0gW107XG5cdFx0XHRtb3JwaGVyLnNldFJlbmRlckNhbGxiYWNrKG1kID0+IHJlbmRlcmVkLnB1c2gobWQpKTtcblx0XHRcdG1vcnBoZXIuc2VlZCgnJyk7XG5cblx0XHRcdGNvbnN0IGZ1bGxDb250ZW50ID0gJ3BhcmFncmFwaCBvbmVcXG5cXG5wYXJhZ3JhcGggdHdvIHRyYWlsaW5nJztcblx0XHRcdC8vIEFwcGVuZCBjb250ZW50IHdoZXJlIHRoZSB0YWlsIGhhcyBubyBcXG5cXG4gYm91bmRhcnlcblx0XHRcdG1vcnBoZXIudHJ5TW9ycGgoZnVsbENvbnRlbnQpO1xuXG5cdFx0XHQvLyBGbHVzaCB0aGUgckFGIHNvIHRoZSBwYXJhZ3JhcGgtYm91bmRhcnkgcmVuZGVyIGZpcmVzXG5cdFx0XHRhd2FpdCBuZXcgUHJvbWlzZShyID0+IG1haW5XaW5kb3cucmVxdWVzdEFuaW1hdGlvbkZyYW1lKHIpKTtcblx0XHRcdC8vIE9ubHkgY29udGVudCB1cCB0byB0aGUgbGFzdCBcXG5cXG4gc2hvdWxkIGhhdmUgcmVuZGVyZWRcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZW5kZXJlZC5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlbmRlcmVkWzBdLCAncGFyYWdyYXBoIG9uZVxcblxcbicpO1xuXG5cdFx0XHQvLyBTaWduYWwgc3RyZWFtIGNvbXBsZXRpb24gXHUyMDE0IHNob3VsZCBzY2hlZHVsZSBhIHJlbmRlciBvZlxuXHRcdFx0Ly8gdGhlIGZ1bGwgY29udGVudCBpbmNsdWRpbmcgdGhlIHVuYm91bmRlZCB0YWlsLlxuXHRcdFx0bW9ycGhlci51cGRhdGVTdHJlYW1SYXRlKDEwMCwgdHJ1ZSk7XG5cdFx0XHRhd2FpdCBuZXcgUHJvbWlzZShyID0+IG1haW5XaW5kb3cucmVxdWVzdEFuaW1hdGlvbkZyYW1lKHIpKTtcblxuXHRcdFx0Ly8gVGhlIHJlbmRlciBjYWxsYmFjayBzaG91bGQgbm93IGhhdmUgdGhlIGZ1bGwgY29udGVudFxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlbmRlcmVkLmxlbmd0aCwgMik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVuZGVyZWRbMV0sIGZ1bGxDb250ZW50KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3NpZ25hbHMgd2hlbiB3b3JkLWJ1ZmZlcmVkIGNvbnRlbnQgaGFzIGRyYWluZWQgdG8gdGhlIERPTScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oQ2hhdENvbmZpZ3VyYXRpb24uSW5jcmVtZW50YWxSZW5kZXJpbmdCdWZmZXJpbmcsICd3b3JkJyk7XG5cdFx0XHRjb25zdCBtb3JwaGVyID0gY3JlYXRlTW9ycGhlcigpO1xuXHRcdFx0bW9ycGhlci5zZXRSZW5kZXJDYWxsYmFjaygoKSA9PiB7IH0pO1xuXHRcdFx0bGV0IGRyYWluQ291bnQgPSAwO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKG1vcnBoZXIub25EaWREcmFpbigoKSA9PiBkcmFpbkNvdW50KyspKTtcblx0XHRcdGNvbnN0IGRpZERyYWluID0gRXZlbnQudG9Qcm9taXNlKG1vcnBoZXIub25EaWREcmFpbik7XG5cblx0XHRcdG1vcnBoZXIuc2VlZCgnb25lIHR3byB0aHJlZScpO1xuXHRcdFx0bW9ycGhlci51cGRhdGVTdHJlYW1SYXRlKDIwMDAsIHRydWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vcnBoZXIuaXNEcmFpbmVkLCBmYWxzZSk7XG5cblx0XHRcdGF3YWl0IGRpZERyYWluO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0aXNEcmFpbmVkOiBtb3JwaGVyLmlzRHJhaW5lZCxcblx0XHRcdFx0ZHJhaW5Db3VudCxcblx0XHRcdH0sIHtcblx0XHRcdFx0aXNEcmFpbmVkOiB0cnVlLFxuXHRcdFx0XHRkcmFpbkNvdW50OiAxLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdCbG9ja0FuaW1hdGlvbicsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdhcHBsaWVzIGFuaW1hdGlvbiBjbGFzcyBhbmQgY3VzdG9tIHByb3BlcnRpZXMgdG8gbmV3IGNoaWxkcmVuJywgKCkgPT4ge1xuXHRcdGNvbnN0IGFuaW0gPSBuZXcgQmxvY2tBbmltYXRpb24oJ2ZhZGUnKTtcblx0XHRjb25zdCBjb250YWluZXIgPSBtYWluV2luZG93LmRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdGNvbnN0IGNoaWxkID0gY29udGFpbmVyLmFwcGVuZENoaWxkKG1haW5XaW5kb3cuZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgncCcpKTtcblxuXHRcdGFuaW0uYW5pbWF0ZShjb250YWluZXIuY2hpbGRyZW4sIDAsIDEsIDApO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNoaWxkLmNsYXNzTGlzdC5jb250YWlucygnY2hhdC1zbW9vdGgtYW5pbWF0ZS1mYWRlJyksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaGlsZC5zdHlsZS5nZXRQcm9wZXJ0eVZhbHVlKCctLWNoYXQtc21vb3RoLWR1cmF0aW9uJyksIGAke0FOSU1BVElPTl9EVVJBVElPTl9NU31tc2ApO1xuXHRcdGFzc2VydC5vayhjaGlsZC5zdHlsZS5nZXRQcm9wZXJ0eVZhbHVlKCctLWNoYXQtc21vb3RoLWRlbGF5JykgIT09ICcnKTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3Qgc3RyaXAgYW5pbWF0aW9uIGNsYXNzIG9uIGJ1YmJsZWQgYW5pbWF0aW9uZW5kIGZyb20gbmVzdGVkIGVsZW1lbnQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgYW5pbSA9IG5ldyBCbG9ja0FuaW1hdGlvbigncmlzZScpO1xuXHRcdGNvbnN0IGNvbnRhaW5lciA9IG1haW5XaW5kb3cuZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0Y29uc3QgcGFyZW50ID0gY29udGFpbmVyLmFwcGVuZENoaWxkKG1haW5XaW5kb3cuZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2JykpO1xuXHRcdGNvbnN0IG5lc3RlZCA9IHBhcmVudC5hcHBlbmRDaGlsZChtYWluV2luZG93LmRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NwYW4nKSk7XG5cblx0XHRhbmltLmFuaW1hdGUoY29udGFpbmVyLmNoaWxkcmVuLCAwLCAxLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyZW50LmNsYXNzTGlzdC5jb250YWlucygnY2hhdC1zbW9vdGgtYW5pbWF0ZS1yaXNlJyksIHRydWUpO1xuXG5cdFx0Ly8gU2ltdWxhdGUgYW5pbWF0aW9uZW5kIGJ1YmJsaW5nIGZyb20gbmVzdGVkIGNoaWxkXG5cdFx0Y29uc3QgYnViYmxlZEV2ZW50ID0gbmV3IEFuaW1hdGlvbkV2ZW50KCdhbmltYXRpb25lbmQnLCB7IGJ1YmJsZXM6IHRydWUgfSk7XG5cdFx0bmVzdGVkLmRpc3BhdGNoRXZlbnQoYnViYmxlZEV2ZW50KTtcblxuXHRcdC8vIFBhcmVudCBzaG91bGQgc3RpbGwgaGF2ZSB0aGUgYW5pbWF0aW9uIGNsYXNzXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0cGFyZW50LmNsYXNzTGlzdC5jb250YWlucygnY2hhdC1zbW9vdGgtYW5pbWF0ZS1yaXNlJyksXG5cdFx0XHR0cnVlLFxuXHRcdFx0J0FuaW1hdGlvbiBjbGFzcyBzaG91bGQgbm90IGJlIHJlbW92ZWQgYnkgYnViYmxlZCBldmVudCdcblx0XHQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdHBhcmVudC5zdHlsZS5nZXRQcm9wZXJ0eVZhbHVlKCctLWNoYXQtc21vb3RoLWR1cmF0aW9uJyksXG5cdFx0XHRgJHtBTklNQVRJT05fRFVSQVRJT05fTVN9bXNgLFxuXHRcdFx0J0N1c3RvbSBwcm9wZXJ0aWVzIHNob3VsZCBub3QgYmUgcmVtb3ZlZCBieSBidWJibGVkIGV2ZW50J1xuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N0cmlwcyBhbmltYXRpb24gY2xhc3Mgb24gZGlyZWN0IGFuaW1hdGlvbmVuZCBmcm9tIHRoZSBhbmltYXRlZCBlbGVtZW50JywgKCkgPT4ge1xuXHRcdGNvbnN0IGFuaW0gPSBuZXcgQmxvY2tBbmltYXRpb24oJ2JsdXInKTtcblx0XHRjb25zdCBjb250YWluZXIgPSBtYWluV2luZG93LmRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdGNvbnN0IGNoaWxkID0gY29udGFpbmVyLmFwcGVuZENoaWxkKG1haW5XaW5kb3cuZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgncCcpKTtcblxuXHRcdGFuaW0uYW5pbWF0ZShjb250YWluZXIuY2hpbGRyZW4sIDAsIDEsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaGlsZC5jbGFzc0xpc3QuY29udGFpbnMoJ2NoYXQtc21vb3RoLWFuaW1hdGUtYmx1cicpLCB0cnVlKTtcblxuXHRcdC8vIFNpbXVsYXRlIGRpcmVjdCBhbmltYXRpb25lbmQgb24gdGhlIGNoaWxkIGl0c2VsZlxuXHRcdGNvbnN0IGRpcmVjdEV2ZW50ID0gbmV3IEFuaW1hdGlvbkV2ZW50KCdhbmltYXRpb25lbmQnLCB7IGJ1YmJsZXM6IHRydWUgfSk7XG5cdFx0Y2hpbGQuZGlzcGF0Y2hFdmVudChkaXJlY3RFdmVudCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRjaGlsZC5jbGFzc0xpc3QuY29udGFpbnMoJ2NoYXQtc21vb3RoLWFuaW1hdGUtYmx1cicpLFxuXHRcdFx0ZmFsc2UsXG5cdFx0XHQnQW5pbWF0aW9uIGNsYXNzIHNob3VsZCBiZSByZW1vdmVkIGFmdGVyIGRpcmVjdCBhbmltYXRpb25lbmQnXG5cdFx0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRjaGlsZC5zdHlsZS5nZXRQcm9wZXJ0eVZhbHVlKCctLWNoYXQtc21vb3RoLWR1cmF0aW9uJyksXG5cdFx0XHQnJyxcblx0XHRcdCdDdXN0b20gcHJvcGVydHkgc2hvdWxkIGJlIHJlbW92ZWQgYWZ0ZXIgZGlyZWN0IGFuaW1hdGlvbmVuZCdcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdzdGFnZ2VycyBkZWxheSBhY3Jvc3MgbXVsdGlwbGUgbmV3IGNoaWxkcmVuJywgKCkgPT4ge1xuXHRcdGNvbnN0IGFuaW0gPSBuZXcgQmxvY2tBbmltYXRpb24oJ2ZhZGUnKTtcblx0XHRjb25zdCBjb250YWluZXIgPSBtYWluV2luZG93LmRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdGNvbnRhaW5lci5hcHBlbmRDaGlsZChtYWluV2luZG93LmRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3AnKSk7XG5cdFx0Y29udGFpbmVyLmFwcGVuZENoaWxkKG1haW5XaW5kb3cuZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgncCcpKTtcblx0XHRjb250YWluZXIuYXBwZW5kQ2hpbGQobWFpbldpbmRvdy5kb2N1bWVudC5jcmVhdGVFbGVtZW50KCdwJykpO1xuXG5cdFx0YW5pbS5hbmltYXRlKGNvbnRhaW5lci5jaGlsZHJlbiwgMCwgMywgMCk7XG5cblx0XHRjb25zdCBkZWxheXMgPSBBcnJheS5mcm9tKGNvbnRhaW5lci5jaGlsZHJlbikubWFwKFxuXHRcdFx0YyA9PiBwYXJzZUludCgoYyBhcyBIVE1MRWxlbWVudCkuc3R5bGUuZ2V0UHJvcGVydHlWYWx1ZSgnLS1jaGF0LXNtb290aC1kZWxheScpKVxuXHRcdCk7XG5cdFx0Ly8gRWFjaCBzdWNjZXNzaXZlIGNoaWxkIHNob3VsZCBoYXZlIGEgbGFyZ2VyIGRlbGF5XG5cdFx0YXNzZXJ0Lm9rKGRlbGF5c1sxXSA+IGRlbGF5c1swXSwgYFNlY29uZCBkZWxheSAke2RlbGF5c1sxXX0gc2hvdWxkIGJlIGdyZWF0ZXIgdGhhbiBmaXJzdCAke2RlbGF5c1swXX1gKTtcblx0XHRhc3NlcnQub2soZGVsYXlzWzJdID4gZGVsYXlzWzFdLCBgVGhpcmQgZGVsYXkgJHtkZWxheXNbMl19IHNob3VsZCBiZSBncmVhdGVyIHRoYW4gc2Vjb25kICR7ZGVsYXlzWzFdfWApO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnV29yZEJ1ZmZlcicsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdzZXRSYXRlIHdpdGggaXNDb21wbGV0ZSB1c2VzIGF0IGxlYXN0IE1JTl9SQVRFX0FGVEVSX0NPTVBMRVRFJywgKCkgPT4ge1xuXHRcdGNvbnN0IGJ1ZmZlciA9IG5ldyBXb3JkQnVmZmVyKCk7XG5cblx0XHQvLyBTZXR0aW5nIGEgbG93IHJhdGUgd2l0aCBpc0NvbXBsZXRlIHNob3VsZCBmbG9vciB0byA4MFxuXHRcdGJ1ZmZlci5zZXRSYXRlKDEwLCB0cnVlKTtcblx0XHQvLyBWZXJpZnkgYnkgY2hlY2tpbmcgZmlsdGVyRmx1c2ggYmVoYXZpb3I6IHdpdGggcmF0ZT04MCxcblx0XHQvLyBhZnRlciBlbm91Z2ggZWxhcHNlZCB0aW1lLCB3b3JkcyBzaG91bGQgYmUgcmV2ZWFsZWQgZmFzdGVyXG5cdFx0Ly8gdGhhbiBhdCByYXRlPTEwLlxuXHRcdGNvbnN0IG1kID0gJ3dvcmQxIHdvcmQyIHdvcmQzIHdvcmQ0IHdvcmQ1IHdvcmQ2IHdvcmQ3IHdvcmQ4IHdvcmQ5IHdvcmQxMCc7XG5cdFx0Y29uc3QgcmVzdWx0MSA9IGJ1ZmZlci5maWx0ZXJGbHVzaChtZCk7XG5cdFx0Ly8gRmlyc3QgY2FsbCByZXZlYWxzIDEgd29yZFxuXHRcdGFzc2VydC5vayhyZXN1bHQxICE9PSB1bmRlZmluZWQsICdGaXJzdCBmbHVzaCBzaG91bGQgcmV2ZWFsIGNvbnRlbnQnKTtcblx0fSk7XG5cblx0dGVzdCgnc2V0UmF0ZSB3aXRoIHVuZGVmaW5lZCByYXRlIGFuZCBpc0NvbXBsZXRlIGRlZmF1bHRzIHRvIE1JTl9SQVRFX0FGVEVSX0NPTVBMRVRFJywgKCkgPT4ge1xuXHRcdGNvbnN0IGJ1ZmZlciA9IG5ldyBXb3JkQnVmZmVyKCk7XG5cdFx0YnVmZmVyLnNldFJhdGUodW5kZWZpbmVkLCB0cnVlKTtcblxuXHRcdGNvbnN0IG1kID0gJ3dvcmQxIHdvcmQyIHdvcmQzJztcblx0XHRjb25zdCByZXN1bHQgPSBidWZmZXIuZmlsdGVyRmx1c2gobWQpO1xuXHRcdGFzc2VydC5vayhyZXN1bHQgIT09IHVuZGVmaW5lZCwgJ1Nob3VsZCByZXZlYWwgY29udGVudCB3aXRoIGRlZmF1bHQgY29tcGxldGUgcmF0ZScpO1xuXHR9KTtcblxuXHR0ZXN0KCdzZXRSYXRlIGR1cmluZyBzdHJlYW1pbmcgY2xhbXBzIGJldHdlZW4gTUlOX1JBVEUgYW5kIE1BWF9SQVRFJywgKCkgPT4ge1xuXHRcdGNvbnN0IGJ1ZmZlciA9IG5ldyBXb3JkQnVmZmVyKCk7XG5cblx0XHQvLyBSYXRlIGJlbG93IE1JTl9SQVRFIHNob3VsZCBiZSBjbGFtcGVkIHVwXG5cdFx0YnVmZmVyLnNldFJhdGUoMSwgZmFsc2UpO1xuXHRcdGNvbnN0IG1kID0gJ3dvcmQxIHdvcmQyIHdvcmQzJztcblx0XHRjb25zdCByZXN1bHQgPSBidWZmZXIuZmlsdGVyRmx1c2gobWQpO1xuXHRcdGFzc2VydC5vayhyZXN1bHQgIT09IHVuZGVmaW5lZCwgJ1Nob3VsZCByZXZlYWwgY29udGVudCBldmVuIHdpdGggbG93IHJhdGUgKGNsYW1wZWQgdG8gTUlOX1JBVEUpJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NldFJhdGUgd2l0aCB1bmRlZmluZWQgcmF0ZSBkdXJpbmcgc3RyZWFtaW5nIGRlZmF1bHRzIHRvIERFRkFVTFRfUkFURScsICgpID0+IHtcblx0XHRjb25zdCBidWZmZXIgPSBuZXcgV29yZEJ1ZmZlcigpO1xuXHRcdGJ1ZmZlci5zZXRSYXRlKHVuZGVmaW5lZCwgZmFsc2UpO1xuXG5cdFx0Y29uc3QgbWQgPSAnd29yZDEgd29yZDInO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGJ1ZmZlci5maWx0ZXJGbHVzaChtZCk7XG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdCAhPT0gdW5kZWZpbmVkLCAnU2hvdWxkIHJldmVhbCBjb250ZW50IHdpdGggZGVmYXVsdCBzdHJlYW1pbmcgcmF0ZScpO1xuXHR9KTtcblxuXHR0ZXN0KCduZWVkc05leHRGcmFtZSBpcyB0cnVlIHdoZW4gd29yZHMgcmVtYWluIHVucmV2ZWFsZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgYnVmZmVyID0gbmV3IFdvcmRCdWZmZXIoKTtcblx0XHRidWZmZXIuc2V0UmF0ZSgxLCBmYWxzZSk7XG5cblx0XHQvLyBGaXJzdCBmbHVzaCByZXZlYWxzIDEgd29yZCwgYnV0IHRoZXJlIGFyZSBtb3JlXG5cdFx0YnVmZmVyLmZpbHRlckZsdXNoKCd3b3JkMSB3b3JkMiB3b3JkMyB3b3JkNCB3b3JkNScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChidWZmZXIubmVlZHNOZXh0RnJhbWUsIHRydWUsICdTaG91bGQgbmVlZCBhbm90aGVyIGZyYW1lIHdoZW4gd29yZHMgcmVtYWluJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ25lZWRzTmV4dEZyYW1lIGlzIGZhbHNlIHdoZW4gYWxsIHdvcmRzIGFyZSByZXZlYWxlZCcsICgpID0+IHtcblx0XHRjb25zdCBidWZmZXIgPSBuZXcgV29yZEJ1ZmZlcigpO1xuXHRcdGJ1ZmZlci5zZXRSYXRlKDIwMDAsIGZhbHNlKTtcblxuXHRcdC8vIFdpdGggYSB2ZXJ5IGhpZ2ggcmF0ZSBhbmQgc2luZ2xlIHdvcmQsIGFsbCBjb250ZW50IGlzIHJldmVhbGVkXG5cdFx0YnVmZmVyLmZpbHRlckZsdXNoKCdoZWxsbycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChidWZmZXIubmVlZHNOZXh0RnJhbWUsIGZhbHNlLCAnU2hvdWxkIG5vdCBuZWVkIGFub3RoZXIgZnJhbWUgd2hlbiBhbGwgd29yZHMgc2hvd24nKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGFBQWE7QUFDdEIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxxQ0FBcUM7QUFDOUMsU0FBUyxnQkFBZ0IsNkJBQTZCO0FBQ3RELFNBQVMseUJBQXlC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
