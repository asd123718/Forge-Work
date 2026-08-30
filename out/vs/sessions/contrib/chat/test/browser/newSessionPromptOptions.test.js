import assert from "assert";
import { DeferredPromise, timeout } from "../../../../../base/common/async.js";
import { CancellationTokenSource } from "../../../../../base/common/cancellation.js";
import { isMarkdownString } from "../../../../../base/common/htmlContent.js";
import { Disposable, MutableDisposable } from "../../../../../base/common/lifecycle.js";
import { mock } from "../../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { NewChatInputWidget } from "../../browser/newChatInput.js";
import { NewSessionPromptOptionsWidget } from "../../browser/newSessionPromptOptions.js";
const refreshPromptOptions = Reflect.get(NewChatInputWidget.prototype, "refreshPromptOptions");
const replacePrompt = Reflect.get(NewChatInputWidget.prototype, "_replacePrompt");
class TestHoverService extends mock() {
  constructor() {
    super(...arguments);
    this.contents = [];
  }
  setupDelayedHover(_target, hoverOptions, _lifecycleOptions) {
    const options = typeof hoverOptions === "function" ? hoverOptions() : hoverOptions;
    const content = options.content;
    if (typeof content === "string") {
      this.contents.push(content);
    } else if (isMarkdownString(content)) {
      this.contents.push(content.value.replaceAll("&nbsp;", " "));
    }
    return Disposable.None;
  }
}
suite("NewSessionPromptOptionsWidget", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  test("renders loading, preserves disabled selection, and clears selection for empty input", async () => {
    const container = document.createElement("div");
    const hoverService = new TestHoverService();
    const selections = [];
    const selectedOptionIds = [];
    let inputValue = "";
    const widget = disposables.add(new NewSessionPromptOptionsWidget(container, {
      selectOption: async (option2, expectedInput, animate) => {
        selections.push({ optionId: option2.id, expectedInput, animate });
        inputValue = option2.prompt;
        widget.setInputValue(inputValue);
        return true;
      },
      onDidSelectOption: (option2) => selectedOptionIds.push(option2.id),
      onDidClose: () => void 0
    }, hoverService));
    const options = [option("feature", "Implement a feature"), option("bug", "Fix a bug")];
    widget.setState({ kind: "loading" });
    const loading = {
      busy: widget.element.getAttribute("aria-busy"),
      skeletons: widget.element.querySelectorAll(".new-session-prompt-option-skeleton").length
    };
    widget.setState({ kind: "resolved", options });
    const buttons = Array.from(widget.element.querySelectorAll(".monaco-button.new-session-prompt-option"));
    buttons[0].click();
    await timeout(0);
    const selected = snapshotButtons(buttons);
    const promptWithoutPlaceholder = options[0].prompt.replace(options[0].placeholder, "");
    widget.setInputValue(promptWithoutPlaceholder);
    const placeholderRemoved = snapshotButtons(buttons);
    buttons[1].click();
    await timeout(0);
    const replaced = snapshotButtons(buttons);
    widget.setInputValue(`${inputValue} with an edit`);
    const edited = snapshotButtons(buttons);
    widget.setInputValue(options[1].prompt);
    const restored = snapshotButtons(buttons);
    widget.setInputValue("");
    const empty = snapshotButtons(buttons);
    assert.deepStrictEqual({
      loading,
      hoverContents: hoverService.contents,
      selections,
      selectedOptionIds,
      selected,
      placeholderRemoved,
      replaced,
      edited,
      restored,
      empty
    }, {
      loading: { busy: "true", skeletons: 3 },
      hoverContents: [
        "**Implement a feature**\n\nDescription for Implement a feature",
        "**Fix a bug**\n\nDescription for Fix a bug"
      ],
      selections: [
        { optionId: "feature", expectedInput: "", animate: true },
        { optionId: "bug", expectedInput: "Prompt for Implement a feature: ", animate: false }
      ],
      selectedOptionIds: ["feature", "bug"],
      selected: [
        { selected: true, disabled: false },
        { selected: false, disabled: false }
      ],
      placeholderRemoved: [
        { selected: true, disabled: false },
        { selected: false, disabled: false }
      ],
      replaced: [
        { selected: false, disabled: false },
        { selected: true, disabled: false }
      ],
      edited: [
        { selected: false, disabled: true },
        { selected: true, disabled: true }
      ],
      restored: [
        { selected: false, disabled: false },
        { selected: true, disabled: false }
      ],
      empty: [
        { selected: false, disabled: false },
        { selected: false, disabled: false }
      ]
    });
  });
  test("renders repository content and action separately while preserving full accessible text", () => {
    const container = document.createElement("div");
    const hoverService = new TestHoverService();
    const widget = disposables.add(new NewSessionPromptOptionsWidget(container, {
      selectOption: async () => true,
      onDidSelectOption: () => void 0,
      onDidClose: () => void 0
    }, hoverService));
    const gitHubOption = {
      ...option("issue", "Tackle issue"),
      titleDetail: "#123",
      description: "A complete issue title"
    };
    widget.setState({ kind: "resolved", options: [gitHubOption] });
    const button = widget.element.querySelector(".new-session-prompt-option");
    assert.deepStrictEqual({
      hasTitleDetailClass: button?.classList.contains("has-title-detail"),
      description: button?.querySelector(".new-session-prompt-option-description")?.textContent,
      title: button?.querySelector(".new-session-prompt-option-title-label")?.textContent,
      detail: button?.querySelector(".new-session-prompt-option-title-detail")?.textContent,
      actionIconAriaHidden: button?.querySelector(".new-session-prompt-option-action-icon")?.getAttribute("aria-hidden"),
      ariaLabel: button?.getAttribute("aria-label"),
      hover: hoverService.contents
    }, {
      hasTitleDetailClass: true,
      description: "A complete issue title",
      title: "Tackle issue",
      detail: "#123",
      actionIconAriaHidden: "true",
      ariaLabel: "Tackle issue #123: A complete issue title",
      hover: ["**Tackle issue \\#123**\n\nA complete issue title"]
    });
  });
  test("renders a close action in the title row", async () => {
    const container = document.createElement("div");
    const hoverService = new TestHoverService();
    let closeCount = 0;
    const widget = disposables.add(new NewSessionPromptOptionsWidget(container, {
      selectOption: async () => true,
      onDidSelectOption: () => void 0,
      onDidClose: () => {
        closeCount++;
        widget.setState(void 0);
      }
    }, hoverService));
    widget.setState({ kind: "resolved", options: [option("feature", "Implement a feature")] });
    const closeAction = widget.element.querySelector(".new-session-prompt-options-actions .action-label");
    closeAction?.click();
    await timeout(0);
    assert.deepStrictEqual({
      closeCount,
      label: closeAction?.getAttribute("aria-label"),
      titleRow: closeAction?.closest(".new-session-prompt-options-header") !== null,
      hidden: widget.element.style.display === "none"
    }, {
      closeCount: 1,
      label: "Close",
      titleRow: true,
      hidden: true
    });
  });
  test("cancels stale prompt option refreshes", async () => {
    const first = new DeferredPromise();
    const tokens = [];
    const states = [];
    let requestCount = 0;
    const refresh = disposables.add(new MutableDisposable());
    const harness = {
      _promptOptionsRefresh: refresh,
      _promptOptionsController: {
        resolve: (token) => {
          tokens.push(token);
          requestCount++;
          return requestCount === 1 ? first.p : Promise.resolve({ kind: "resolved", options: [option("bug", "Fix a bug")] });
        },
        onDidSelectOption: () => void 0,
        onDidClose: () => void 0
      },
      preparePromptOptionsRefresh: () => {
        refresh.value?.cancel();
        refresh.clear();
        states.push({ kind: "loading" });
        return true;
      },
      showPromptOptions: (state) => {
        if (state) {
          states.push(state);
        }
        return true;
      }
    };
    const firstRefresh = refreshPromptOptions.call(harness);
    const secondRefresh = refreshPromptOptions.call(harness);
    first.complete({ kind: "resolved", options: [option("feature", "Implement a feature")] });
    assert.deepStrictEqual({
      results: await Promise.all([firstRefresh, secondRefresh]),
      firstCancelled: tokens[0].isCancellationRequested,
      states: states.map((state) => state.kind === "loading" ? "loading" : state.options[0].id)
    }, {
      results: [false, true],
      firstCancelled: true,
      states: ["loading", "loading", "bug"]
    });
  });
  test("replaces a generated prompt immediately", () => {
    let value = "old prompt";
    let placeholder;
    let position;
    const harness = {
      _editor: {
        getModel: () => ({
          getValue: () => value,
          getFullModelRange: () => ({}),
          getLineCount: () => 1,
          getLineMaxColumn: () => value.length + 1
        }),
        pushUndoStop: () => void 0,
        executeEdits: (_source, edits) => {
          value = edits[0].text;
          return true;
        },
        setPosition: (nextPosition) => position = nextPosition
      },
      _promptTypingAnimation: { clear: () => void 0 },
      _promptTemplatePlaceholder: { value: { setPlaceholder: (nextPlaceholder) => placeholder = nextPlaceholder } }
    };
    const replaced = replacePrompt.call(harness, "new [task] prompt", "[task]", "old prompt");
    assert.deepStrictEqual({ replaced, value, placeholder, position }, {
      replaced: true,
      value: "new [task] prompt",
      placeholder: "[task]",
      position: { lineNumber: 1, column: 18 }
    });
  });
  test("clears loading when the current prompt option refresh is cancelled", async () => {
    const result = new DeferredPromise();
    const source = disposables.add(new CancellationTokenSource());
    const states = [];
    const refresh = disposables.add(new MutableDisposable());
    const harness = {
      _promptOptionsRefresh: refresh,
      _promptOptionsController: {
        resolve: () => result.p,
        onDidSelectOption: () => void 0,
        onDidClose: () => void 0
      },
      preparePromptOptionsRefresh: () => {
        refresh.value?.cancel();
        refresh.clear();
        states.push({ kind: "loading" });
        return true;
      },
      showPromptOptions: (state) => {
        states.push(state);
        return true;
      }
    };
    const refreshing = refreshPromptOptions.call(harness, source.token);
    source.cancel();
    result.complete({ kind: "resolved", options: [option("feature", "Implement a feature")] });
    assert.deepStrictEqual({
      shown: await refreshing,
      states: states.map((state) => state?.kind ?? "hidden")
    }, {
      shown: false,
      states: ["loading", "hidden"]
    });
  });
  test("does not resolve prompt options after dismissal", async () => {
    let resolveCount = 0;
    const harness = {
      _promptOptionsRefresh: disposables.add(new MutableDisposable()),
      _promptOptionsController: {
        resolve: async () => {
          resolveCount++;
          return { kind: "resolved", options: [] };
        },
        onDidSelectOption: () => void 0,
        onDidClose: () => void 0
      },
      preparePromptOptionsRefresh: () => false,
      showPromptOptions: () => true
    };
    assert.deepStrictEqual({
      shown: await refreshPromptOptions.call(harness),
      resolveCount
    }, {
      shown: false,
      resolveCount: 0
    });
  });
});
function option(id, title) {
  return {
    id,
    title,
    description: `Description for ${title}`,
    prompt: `Prompt for ${title}: [${id}]`,
    placeholder: `[${id}]`
  };
}
function snapshotButtons(buttons) {
  return buttons.map((button) => ({
    selected: button.getAttribute("aria-pressed") === "true",
    disabled: button.getAttribute("aria-disabled") === "true"
  }));
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcY2hhdFxcdGVzdFxcYnJvd3NlclxcbmV3U2Vzc2lvblByb21wdE9wdGlvbnMudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IElEZWxheWVkSG92ZXJPcHRpb25zLCBJSG92ZXJMaWZlY3ljbGVPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2hvdmVyL2hvdmVyLmpzJztcbmltcG9ydCB7IERlZmVycmVkUHJvbWlzZSwgdGltZW91dCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuLCBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBpc01hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgSURpc3Bvc2FibGUsIE11dGFibGVEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IG1vY2sgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL21vY2suanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBJSG92ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBOZXdDaGF0SW5wdXRXaWRnZXQgfSBmcm9tICcuLi8uLi9icm93c2VyL25ld0NoYXRJbnB1dC5qcyc7XG5pbXBvcnQgeyBJTmV3U2Vzc2lvblByb21wdE9wdGlvbiwgSU5ld1Nlc3Npb25Qcm9tcHRPcHRpb25zQ29udHJvbGxlciwgTmV3U2Vzc2lvblByb21wdE9wdGlvbnNTdGF0ZSB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvbmV3U2Vzc2lvbkNvbXBvc2VyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBOZXdTZXNzaW9uUHJvbXB0T3B0aW9uc1dpZGdldCB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvbmV3U2Vzc2lvblByb21wdE9wdGlvbnMuanMnO1xuXG5pbnRlcmZhY2UgSVByb21wdE9wdGlvbnNSZWZyZXNoSGFybmVzcyB7XG5cdHJlYWRvbmx5IF9wcm9tcHRPcHRpb25zUmVmcmVzaDogTXV0YWJsZURpc3Bvc2FibGU8Q2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2U+O1xuXHRyZWFkb25seSBfcHJvbXB0T3B0aW9uc0NvbnRyb2xsZXI6IElOZXdTZXNzaW9uUHJvbXB0T3B0aW9uc0NvbnRyb2xsZXI7XG5cdHByZXBhcmVQcm9tcHRPcHRpb25zUmVmcmVzaCgpOiBib29sZWFuO1xuXHRzaG93UHJvbXB0T3B0aW9ucyhzdGF0ZTogTmV3U2Vzc2lvblByb21wdE9wdGlvbnNTdGF0ZSB8IHVuZGVmaW5lZCk6IGJvb2xlYW47XG59XG5cbmludGVyZmFjZSBJUmVwbGFjZVByb21wdEhhcm5lc3Mge1xuXHRyZWFkb25seSBfZWRpdG9yOiB7XG5cdFx0Z2V0TW9kZWwoKToge1xuXHRcdFx0Z2V0VmFsdWUoKTogc3RyaW5nO1xuXHRcdFx0Z2V0RnVsbE1vZGVsUmFuZ2UoKTogb2JqZWN0O1xuXHRcdFx0Z2V0TGluZUNvdW50KCk6IG51bWJlcjtcblx0XHRcdGdldExpbmVNYXhDb2x1bW4obGluZU51bWJlcjogbnVtYmVyKTogbnVtYmVyO1xuXHRcdH07XG5cdFx0cHVzaFVuZG9TdG9wKCk6IHZvaWQ7XG5cdFx0ZXhlY3V0ZUVkaXRzKHNvdXJjZTogc3RyaW5nLCBlZGl0czogcmVhZG9ubHkgeyByZWFkb25seSB0ZXh0OiBzdHJpbmcgfVtdKTogYm9vbGVhbjtcblx0XHRzZXRQb3NpdGlvbihwb3NpdGlvbjogeyByZWFkb25seSBsaW5lTnVtYmVyOiBudW1iZXI7IHJlYWRvbmx5IGNvbHVtbjogbnVtYmVyIH0pOiB2b2lkO1xuXHR9O1xuXHRyZWFkb25seSBfcHJvbXB0VHlwaW5nQW5pbWF0aW9uOiB7IGNsZWFyKCk6IHZvaWQgfTtcblx0cmVhZG9ubHkgX3Byb21wdFRlbXBsYXRlUGxhY2Vob2xkZXI6IHsgcmVhZG9ubHkgdmFsdWU6IHsgc2V0UGxhY2Vob2xkZXIocGxhY2Vob2xkZXI6IHN0cmluZyk6IHZvaWQgfSB9O1xufVxuXG5jb25zdCByZWZyZXNoUHJvbXB0T3B0aW9ucyA9IFJlZmxlY3QuZ2V0KE5ld0NoYXRJbnB1dFdpZGdldC5wcm90b3R5cGUsICdyZWZyZXNoUHJvbXB0T3B0aW9ucycpIGFzICh0aGlzOiBJUHJvbXB0T3B0aW9uc1JlZnJlc2hIYXJuZXNzLCB0b2tlbj86IENhbmNlbGxhdGlvblRva2VuKSA9PiBQcm9taXNlPGJvb2xlYW4+O1xuY29uc3QgcmVwbGFjZVByb21wdCA9IFJlZmxlY3QuZ2V0KE5ld0NoYXRJbnB1dFdpZGdldC5wcm90b3R5cGUsICdfcmVwbGFjZVByb21wdCcpIGFzICh0aGlzOiBJUmVwbGFjZVByb21wdEhhcm5lc3MsIHRleHQ6IHN0cmluZywgcGxhY2Vob2xkZXI6IHN0cmluZywgZXhwZWN0ZWRWYWx1ZTogc3RyaW5nKSA9PiBib29sZWFuO1xuXG5jbGFzcyBUZXN0SG92ZXJTZXJ2aWNlIGV4dGVuZHMgbW9jazxJSG92ZXJTZXJ2aWNlPigpIHtcblx0cmVhZG9ubHkgY29udGVudHM6IHN0cmluZ1tdID0gW107XG5cblx0b3ZlcnJpZGUgc2V0dXBEZWxheWVkSG92ZXIoXG5cdFx0X3RhcmdldDogSFRNTEVsZW1lbnQsXG5cdFx0aG92ZXJPcHRpb25zOiAoKCkgPT4gSURlbGF5ZWRIb3Zlck9wdGlvbnMpIHwgSURlbGF5ZWRIb3Zlck9wdGlvbnMsXG5cdFx0X2xpZmVjeWNsZU9wdGlvbnM/OiBJSG92ZXJMaWZlY3ljbGVPcHRpb25zLFxuXHQpOiBJRGlzcG9zYWJsZSB7XG5cdFx0Y29uc3Qgb3B0aW9ucyA9IHR5cGVvZiBob3Zlck9wdGlvbnMgPT09ICdmdW5jdGlvbicgPyBob3Zlck9wdGlvbnMoKSA6IGhvdmVyT3B0aW9ucztcblx0XHRjb25zdCBjb250ZW50ID0gb3B0aW9ucy5jb250ZW50O1xuXHRcdGlmICh0eXBlb2YgY29udGVudCA9PT0gJ3N0cmluZycpIHtcblx0XHRcdHRoaXMuY29udGVudHMucHVzaChjb250ZW50KTtcblx0XHR9IGVsc2UgaWYgKGlzTWFya2Rvd25TdHJpbmcoY29udGVudCkpIHtcblx0XHRcdHRoaXMuY29udGVudHMucHVzaChjb250ZW50LnZhbHVlLnJlcGxhY2VBbGwoJyZuYnNwOycsICcgJykpO1xuXHRcdH1cblx0XHRyZXR1cm4gRGlzcG9zYWJsZS5Ob25lO1xuXHR9XG59XG5cbnN1aXRlKCdOZXdTZXNzaW9uUHJvbXB0T3B0aW9uc1dpZGdldCcsICgpID0+IHtcblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdyZW5kZXJzIGxvYWRpbmcsIHByZXNlcnZlcyBkaXNhYmxlZCBzZWxlY3Rpb24sIGFuZCBjbGVhcnMgc2VsZWN0aW9uIGZvciBlbXB0eSBpbnB1dCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjb250YWluZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRjb25zdCBob3ZlclNlcnZpY2UgPSBuZXcgVGVzdEhvdmVyU2VydmljZSgpO1xuXHRcdGNvbnN0IHNlbGVjdGlvbnM6IHsgcmVhZG9ubHkgb3B0aW9uSWQ6IHN0cmluZzsgcmVhZG9ubHkgZXhwZWN0ZWRJbnB1dDogc3RyaW5nOyByZWFkb25seSBhbmltYXRlOiBib29sZWFuIH1bXSA9IFtdO1xuXHRcdGNvbnN0IHNlbGVjdGVkT3B0aW9uSWRzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGxldCBpbnB1dFZhbHVlID0gJyc7XG5cdFx0Y29uc3Qgd2lkZ2V0ID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBOZXdTZXNzaW9uUHJvbXB0T3B0aW9uc1dpZGdldChjb250YWluZXIsIHtcblx0XHRcdHNlbGVjdE9wdGlvbjogYXN5bmMgKG9wdGlvbiwgZXhwZWN0ZWRJbnB1dCwgYW5pbWF0ZSkgPT4ge1xuXHRcdFx0XHRzZWxlY3Rpb25zLnB1c2goeyBvcHRpb25JZDogb3B0aW9uLmlkLCBleHBlY3RlZElucHV0LCBhbmltYXRlIH0pO1xuXHRcdFx0XHRpbnB1dFZhbHVlID0gb3B0aW9uLnByb21wdDtcblx0XHRcdFx0d2lkZ2V0LnNldElucHV0VmFsdWUoaW5wdXRWYWx1ZSk7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fSxcblx0XHRcdG9uRGlkU2VsZWN0T3B0aW9uOiBvcHRpb24gPT4gc2VsZWN0ZWRPcHRpb25JZHMucHVzaChvcHRpb24uaWQpLFxuXHRcdFx0b25EaWRDbG9zZTogKCkgPT4gdW5kZWZpbmVkLFxuXHRcdH0sIGhvdmVyU2VydmljZSkpO1xuXHRcdGNvbnN0IG9wdGlvbnMgPSBbb3B0aW9uKCdmZWF0dXJlJywgJ0ltcGxlbWVudCBhIGZlYXR1cmUnKSwgb3B0aW9uKCdidWcnLCAnRml4IGEgYnVnJyldO1xuXG5cdFx0d2lkZ2V0LnNldFN0YXRlKHsga2luZDogJ2xvYWRpbmcnIH0pO1xuXHRcdGNvbnN0IGxvYWRpbmcgPSB7XG5cdFx0XHRidXN5OiB3aWRnZXQuZWxlbWVudC5nZXRBdHRyaWJ1dGUoJ2FyaWEtYnVzeScpLFxuXHRcdFx0c2tlbGV0b25zOiB3aWRnZXQuZWxlbWVudC5xdWVyeVNlbGVjdG9yQWxsKCcubmV3LXNlc3Npb24tcHJvbXB0LW9wdGlvbi1za2VsZXRvbicpLmxlbmd0aCxcblx0XHR9O1xuXG5cdFx0d2lkZ2V0LnNldFN0YXRlKHsga2luZDogJ3Jlc29sdmVkJywgb3B0aW9ucyB9KTtcblx0XHRjb25zdCBidXR0b25zID0gQXJyYXkuZnJvbSh3aWRnZXQuZWxlbWVudC5xdWVyeVNlbGVjdG9yQWxsPEhUTUxFbGVtZW50PignLm1vbmFjby1idXR0b24ubmV3LXNlc3Npb24tcHJvbXB0LW9wdGlvbicpKTtcblx0XHRidXR0b25zWzBdLmNsaWNrKCk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRjb25zdCBzZWxlY3RlZCA9IHNuYXBzaG90QnV0dG9ucyhidXR0b25zKTtcblxuXHRcdGNvbnN0IHByb21wdFdpdGhvdXRQbGFjZWhvbGRlciA9IG9wdGlvbnNbMF0ucHJvbXB0LnJlcGxhY2Uob3B0aW9uc1swXS5wbGFjZWhvbGRlciwgJycpO1xuXHRcdHdpZGdldC5zZXRJbnB1dFZhbHVlKHByb21wdFdpdGhvdXRQbGFjZWhvbGRlcik7XG5cdFx0Y29uc3QgcGxhY2Vob2xkZXJSZW1vdmVkID0gc25hcHNob3RCdXR0b25zKGJ1dHRvbnMpO1xuXHRcdGJ1dHRvbnNbMV0uY2xpY2soKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdGNvbnN0IHJlcGxhY2VkID0gc25hcHNob3RCdXR0b25zKGJ1dHRvbnMpO1xuXG5cdFx0d2lkZ2V0LnNldElucHV0VmFsdWUoYCR7aW5wdXRWYWx1ZX0gd2l0aCBhbiBlZGl0YCk7XG5cdFx0Y29uc3QgZWRpdGVkID0gc25hcHNob3RCdXR0b25zKGJ1dHRvbnMpO1xuXG5cdFx0d2lkZ2V0LnNldElucHV0VmFsdWUob3B0aW9uc1sxXS5wcm9tcHQpO1xuXHRcdGNvbnN0IHJlc3RvcmVkID0gc25hcHNob3RCdXR0b25zKGJ1dHRvbnMpO1xuXG5cdFx0d2lkZ2V0LnNldElucHV0VmFsdWUoJycpO1xuXHRcdGNvbnN0IGVtcHR5ID0gc25hcHNob3RCdXR0b25zKGJ1dHRvbnMpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRsb2FkaW5nLFxuXHRcdFx0aG92ZXJDb250ZW50czogaG92ZXJTZXJ2aWNlLmNvbnRlbnRzLFxuXHRcdFx0c2VsZWN0aW9ucyxcblx0XHRcdHNlbGVjdGVkT3B0aW9uSWRzLFxuXHRcdFx0c2VsZWN0ZWQsXG5cdFx0XHRwbGFjZWhvbGRlclJlbW92ZWQsXG5cdFx0XHRyZXBsYWNlZCxcblx0XHRcdGVkaXRlZCxcblx0XHRcdHJlc3RvcmVkLFxuXHRcdFx0ZW1wdHksXG5cdFx0fSwge1xuXHRcdFx0bG9hZGluZzogeyBidXN5OiAndHJ1ZScsIHNrZWxldG9uczogMyB9LFxuXHRcdFx0aG92ZXJDb250ZW50czogW1xuXHRcdFx0XHQnKipJbXBsZW1lbnQgYSBmZWF0dXJlKipcXG5cXG5EZXNjcmlwdGlvbiBmb3IgSW1wbGVtZW50IGEgZmVhdHVyZScsXG5cdFx0XHRcdCcqKkZpeCBhIGJ1ZyoqXFxuXFxuRGVzY3JpcHRpb24gZm9yIEZpeCBhIGJ1ZycsXG5cdFx0XHRdLFxuXHRcdFx0c2VsZWN0aW9uczogW1xuXHRcdFx0XHR7IG9wdGlvbklkOiAnZmVhdHVyZScsIGV4cGVjdGVkSW5wdXQ6ICcnLCBhbmltYXRlOiB0cnVlIH0sXG5cdFx0XHRcdHsgb3B0aW9uSWQ6ICdidWcnLCBleHBlY3RlZElucHV0OiAnUHJvbXB0IGZvciBJbXBsZW1lbnQgYSBmZWF0dXJlOiAnLCBhbmltYXRlOiBmYWxzZSB9LFxuXHRcdFx0XSxcblx0XHRcdHNlbGVjdGVkT3B0aW9uSWRzOiBbJ2ZlYXR1cmUnLCAnYnVnJ10sXG5cdFx0XHRzZWxlY3RlZDogW1xuXHRcdFx0XHR7IHNlbGVjdGVkOiB0cnVlLCBkaXNhYmxlZDogZmFsc2UgfSxcblx0XHRcdFx0eyBzZWxlY3RlZDogZmFsc2UsIGRpc2FibGVkOiBmYWxzZSB9LFxuXHRcdFx0XSxcblx0XHRcdHBsYWNlaG9sZGVyUmVtb3ZlZDogW1xuXHRcdFx0XHR7IHNlbGVjdGVkOiB0cnVlLCBkaXNhYmxlZDogZmFsc2UgfSxcblx0XHRcdFx0eyBzZWxlY3RlZDogZmFsc2UsIGRpc2FibGVkOiBmYWxzZSB9LFxuXHRcdFx0XSxcblx0XHRcdHJlcGxhY2VkOiBbXG5cdFx0XHRcdHsgc2VsZWN0ZWQ6IGZhbHNlLCBkaXNhYmxlZDogZmFsc2UgfSxcblx0XHRcdFx0eyBzZWxlY3RlZDogdHJ1ZSwgZGlzYWJsZWQ6IGZhbHNlIH0sXG5cdFx0XHRdLFxuXHRcdFx0ZWRpdGVkOiBbXG5cdFx0XHRcdHsgc2VsZWN0ZWQ6IGZhbHNlLCBkaXNhYmxlZDogdHJ1ZSB9LFxuXHRcdFx0XHR7IHNlbGVjdGVkOiB0cnVlLCBkaXNhYmxlZDogdHJ1ZSB9LFxuXHRcdFx0XSxcblx0XHRcdHJlc3RvcmVkOiBbXG5cdFx0XHRcdHsgc2VsZWN0ZWQ6IGZhbHNlLCBkaXNhYmxlZDogZmFsc2UgfSxcblx0XHRcdFx0eyBzZWxlY3RlZDogdHJ1ZSwgZGlzYWJsZWQ6IGZhbHNlIH0sXG5cdFx0XHRdLFxuXHRcdFx0ZW1wdHk6IFtcblx0XHRcdFx0eyBzZWxlY3RlZDogZmFsc2UsIGRpc2FibGVkOiBmYWxzZSB9LFxuXHRcdFx0XHR7IHNlbGVjdGVkOiBmYWxzZSwgZGlzYWJsZWQ6IGZhbHNlIH0sXG5cdFx0XHRdLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZW5kZXJzIHJlcG9zaXRvcnkgY29udGVudCBhbmQgYWN0aW9uIHNlcGFyYXRlbHkgd2hpbGUgcHJlc2VydmluZyBmdWxsIGFjY2Vzc2libGUgdGV4dCcsICgpID0+IHtcblx0XHRjb25zdCBjb250YWluZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRjb25zdCBob3ZlclNlcnZpY2UgPSBuZXcgVGVzdEhvdmVyU2VydmljZSgpO1xuXHRcdGNvbnN0IHdpZGdldCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgTmV3U2Vzc2lvblByb21wdE9wdGlvbnNXaWRnZXQoY29udGFpbmVyLCB7XG5cdFx0XHRzZWxlY3RPcHRpb246IGFzeW5jICgpID0+IHRydWUsXG5cdFx0XHRvbkRpZFNlbGVjdE9wdGlvbjogKCkgPT4gdW5kZWZpbmVkLFxuXHRcdFx0b25EaWRDbG9zZTogKCkgPT4gdW5kZWZpbmVkLFxuXHRcdH0sIGhvdmVyU2VydmljZSkpO1xuXHRcdGNvbnN0IGdpdEh1Yk9wdGlvbjogSU5ld1Nlc3Npb25Qcm9tcHRPcHRpb24gPSB7XG5cdFx0XHQuLi5vcHRpb24oJ2lzc3VlJywgJ1RhY2tsZSBpc3N1ZScpLFxuXHRcdFx0dGl0bGVEZXRhaWw6ICcjMTIzJyxcblx0XHRcdGRlc2NyaXB0aW9uOiAnQSBjb21wbGV0ZSBpc3N1ZSB0aXRsZScsXG5cdFx0fTtcblxuXHRcdHdpZGdldC5zZXRTdGF0ZSh7IGtpbmQ6ICdyZXNvbHZlZCcsIG9wdGlvbnM6IFtnaXRIdWJPcHRpb25dIH0pO1xuXHRcdGNvbnN0IGJ1dHRvbiA9IHdpZGdldC5lbGVtZW50LnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KCcubmV3LXNlc3Npb24tcHJvbXB0LW9wdGlvbicpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRoYXNUaXRsZURldGFpbENsYXNzOiBidXR0b24/LmNsYXNzTGlzdC5jb250YWlucygnaGFzLXRpdGxlLWRldGFpbCcpLFxuXHRcdFx0ZGVzY3JpcHRpb246IGJ1dHRvbj8ucXVlcnlTZWxlY3RvcignLm5ldy1zZXNzaW9uLXByb21wdC1vcHRpb24tZGVzY3JpcHRpb24nKT8udGV4dENvbnRlbnQsXG5cdFx0XHR0aXRsZTogYnV0dG9uPy5xdWVyeVNlbGVjdG9yKCcubmV3LXNlc3Npb24tcHJvbXB0LW9wdGlvbi10aXRsZS1sYWJlbCcpPy50ZXh0Q29udGVudCxcblx0XHRcdGRldGFpbDogYnV0dG9uPy5xdWVyeVNlbGVjdG9yKCcubmV3LXNlc3Npb24tcHJvbXB0LW9wdGlvbi10aXRsZS1kZXRhaWwnKT8udGV4dENvbnRlbnQsXG5cdFx0XHRhY3Rpb25JY29uQXJpYUhpZGRlbjogYnV0dG9uPy5xdWVyeVNlbGVjdG9yKCcubmV3LXNlc3Npb24tcHJvbXB0LW9wdGlvbi1hY3Rpb24taWNvbicpPy5nZXRBdHRyaWJ1dGUoJ2FyaWEtaGlkZGVuJyksXG5cdFx0XHRhcmlhTGFiZWw6IGJ1dHRvbj8uZ2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJyksXG5cdFx0XHRob3ZlcjogaG92ZXJTZXJ2aWNlLmNvbnRlbnRzLFxuXHRcdH0sIHtcblx0XHRcdGhhc1RpdGxlRGV0YWlsQ2xhc3M6IHRydWUsXG5cdFx0XHRkZXNjcmlwdGlvbjogJ0EgY29tcGxldGUgaXNzdWUgdGl0bGUnLFxuXHRcdFx0dGl0bGU6ICdUYWNrbGUgaXNzdWUnLFxuXHRcdFx0ZGV0YWlsOiAnIzEyMycsXG5cdFx0XHRhY3Rpb25JY29uQXJpYUhpZGRlbjogJ3RydWUnLFxuXHRcdFx0YXJpYUxhYmVsOiAnVGFja2xlIGlzc3VlICMxMjM6IEEgY29tcGxldGUgaXNzdWUgdGl0bGUnLFxuXHRcdFx0aG92ZXI6IFsnKipUYWNrbGUgaXNzdWUgXFxcXCMxMjMqKlxcblxcbkEgY29tcGxldGUgaXNzdWUgdGl0bGUnXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVuZGVycyBhIGNsb3NlIGFjdGlvbiBpbiB0aGUgdGl0bGUgcm93JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRhaW5lciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdGNvbnN0IGhvdmVyU2VydmljZSA9IG5ldyBUZXN0SG92ZXJTZXJ2aWNlKCk7XG5cdFx0bGV0IGNsb3NlQ291bnQgPSAwO1xuXHRcdGNvbnN0IHdpZGdldCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgTmV3U2Vzc2lvblByb21wdE9wdGlvbnNXaWRnZXQoY29udGFpbmVyLCB7XG5cdFx0XHRzZWxlY3RPcHRpb246IGFzeW5jICgpID0+IHRydWUsXG5cdFx0XHRvbkRpZFNlbGVjdE9wdGlvbjogKCkgPT4gdW5kZWZpbmVkLFxuXHRcdFx0b25EaWRDbG9zZTogKCkgPT4ge1xuXHRcdFx0XHRjbG9zZUNvdW50Kys7XG5cdFx0XHRcdHdpZGdldC5zZXRTdGF0ZSh1bmRlZmluZWQpO1xuXHRcdFx0fSxcblx0XHR9LCBob3ZlclNlcnZpY2UpKTtcblx0XHR3aWRnZXQuc2V0U3RhdGUoeyBraW5kOiAncmVzb2x2ZWQnLCBvcHRpb25zOiBbb3B0aW9uKCdmZWF0dXJlJywgJ0ltcGxlbWVudCBhIGZlYXR1cmUnKV0gfSk7XG5cblx0XHRjb25zdCBjbG9zZUFjdGlvbiA9IHdpZGdldC5lbGVtZW50LnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KCcubmV3LXNlc3Npb24tcHJvbXB0LW9wdGlvbnMtYWN0aW9ucyAuYWN0aW9uLWxhYmVsJyk7XG5cdFx0Y2xvc2VBY3Rpb24/LmNsaWNrKCk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Y2xvc2VDb3VudCxcblx0XHRcdGxhYmVsOiBjbG9zZUFjdGlvbj8uZ2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJyksXG5cdFx0XHR0aXRsZVJvdzogY2xvc2VBY3Rpb24/LmNsb3Nlc3QoJy5uZXctc2Vzc2lvbi1wcm9tcHQtb3B0aW9ucy1oZWFkZXInKSAhPT0gbnVsbCxcblx0XHRcdGhpZGRlbjogd2lkZ2V0LmVsZW1lbnQuc3R5bGUuZGlzcGxheSA9PT0gJ25vbmUnLFxuXHRcdH0sIHtcblx0XHRcdGNsb3NlQ291bnQ6IDEsXG5cdFx0XHRsYWJlbDogJ0Nsb3NlJyxcblx0XHRcdHRpdGxlUm93OiB0cnVlLFxuXHRcdFx0aGlkZGVuOiB0cnVlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjYW5jZWxzIHN0YWxlIHByb21wdCBvcHRpb24gcmVmcmVzaGVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGZpcnN0ID0gbmV3IERlZmVycmVkUHJvbWlzZTxOZXdTZXNzaW9uUHJvbXB0T3B0aW9uc1N0YXRlPigpO1xuXHRcdGNvbnN0IHRva2VuczogQ2FuY2VsbGF0aW9uVG9rZW5bXSA9IFtdO1xuXHRcdGNvbnN0IHN0YXRlczogTmV3U2Vzc2lvblByb21wdE9wdGlvbnNTdGF0ZVtdID0gW107XG5cdFx0bGV0IHJlcXVlc3RDb3VudCA9IDA7XG5cdFx0Y29uc3QgcmVmcmVzaCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgTXV0YWJsZURpc3Bvc2FibGU8Q2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2U+KCkpO1xuXHRcdGNvbnN0IGhhcm5lc3M6IElQcm9tcHRPcHRpb25zUmVmcmVzaEhhcm5lc3MgPSB7XG5cdFx0XHRfcHJvbXB0T3B0aW9uc1JlZnJlc2g6IHJlZnJlc2gsXG5cdFx0XHRfcHJvbXB0T3B0aW9uc0NvbnRyb2xsZXI6IHtcblx0XHRcdFx0cmVzb2x2ZTogdG9rZW4gPT4ge1xuXHRcdFx0XHRcdHRva2Vucy5wdXNoKHRva2VuKTtcblx0XHRcdFx0XHRyZXF1ZXN0Q291bnQrKztcblx0XHRcdFx0XHRyZXR1cm4gcmVxdWVzdENvdW50ID09PSAxID8gZmlyc3QucCA6IFByb21pc2UucmVzb2x2ZSh7IGtpbmQ6ICdyZXNvbHZlZCcsIG9wdGlvbnM6IFtvcHRpb24oJ2J1ZycsICdGaXggYSBidWcnKV0gfSk7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdG9uRGlkU2VsZWN0T3B0aW9uOiAoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHRcdG9uRGlkQ2xvc2U6ICgpID0+IHVuZGVmaW5lZCxcblx0XHRcdH0sXG5cdFx0XHRwcmVwYXJlUHJvbXB0T3B0aW9uc1JlZnJlc2g6ICgpID0+IHtcblx0XHRcdFx0cmVmcmVzaC52YWx1ZT8uY2FuY2VsKCk7XG5cdFx0XHRcdHJlZnJlc2guY2xlYXIoKTtcblx0XHRcdFx0c3RhdGVzLnB1c2goeyBraW5kOiAnbG9hZGluZycgfSk7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fSxcblx0XHRcdHNob3dQcm9tcHRPcHRpb25zOiBzdGF0ZSA9PiB7XG5cdFx0XHRcdGlmIChzdGF0ZSkge1xuXHRcdFx0XHRcdHN0YXRlcy5wdXNoKHN0YXRlKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH0sXG5cdFx0fTtcblxuXHRcdGNvbnN0IGZpcnN0UmVmcmVzaCA9IHJlZnJlc2hQcm9tcHRPcHRpb25zLmNhbGwoaGFybmVzcyk7XG5cdFx0Y29uc3Qgc2Vjb25kUmVmcmVzaCA9IHJlZnJlc2hQcm9tcHRPcHRpb25zLmNhbGwoaGFybmVzcyk7XG5cdFx0Zmlyc3QuY29tcGxldGUoeyBraW5kOiAncmVzb2x2ZWQnLCBvcHRpb25zOiBbb3B0aW9uKCdmZWF0dXJlJywgJ0ltcGxlbWVudCBhIGZlYXR1cmUnKV0gfSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHJlc3VsdHM6IGF3YWl0IFByb21pc2UuYWxsKFtmaXJzdFJlZnJlc2gsIHNlY29uZFJlZnJlc2hdKSxcblx0XHRcdGZpcnN0Q2FuY2VsbGVkOiB0b2tlbnNbMF0uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQsXG5cdFx0XHRzdGF0ZXM6IHN0YXRlcy5tYXAoc3RhdGUgPT4gc3RhdGUua2luZCA9PT0gJ2xvYWRpbmcnID8gJ2xvYWRpbmcnIDogc3RhdGUub3B0aW9uc1swXS5pZCksXG5cdFx0fSwge1xuXHRcdFx0cmVzdWx0czogW2ZhbHNlLCB0cnVlXSxcblx0XHRcdGZpcnN0Q2FuY2VsbGVkOiB0cnVlLFxuXHRcdFx0c3RhdGVzOiBbJ2xvYWRpbmcnLCAnbG9hZGluZycsICdidWcnXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVwbGFjZXMgYSBnZW5lcmF0ZWQgcHJvbXB0IGltbWVkaWF0ZWx5JywgKCkgPT4ge1xuXHRcdGxldCB2YWx1ZSA9ICdvbGQgcHJvbXB0Jztcblx0XHRsZXQgcGxhY2Vob2xkZXI6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRsZXQgcG9zaXRpb246IHsgcmVhZG9ubHkgbGluZU51bWJlcjogbnVtYmVyOyByZWFkb25seSBjb2x1bW46IG51bWJlciB9IHwgdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGhhcm5lc3M6IElSZXBsYWNlUHJvbXB0SGFybmVzcyA9IHtcblx0XHRcdF9lZGl0b3I6IHtcblx0XHRcdFx0Z2V0TW9kZWw6ICgpID0+ICh7XG5cdFx0XHRcdFx0Z2V0VmFsdWU6ICgpID0+IHZhbHVlLFxuXHRcdFx0XHRcdGdldEZ1bGxNb2RlbFJhbmdlOiAoKSA9PiAoe30pLFxuXHRcdFx0XHRcdGdldExpbmVDb3VudDogKCkgPT4gMSxcblx0XHRcdFx0XHRnZXRMaW5lTWF4Q29sdW1uOiAoKSA9PiB2YWx1ZS5sZW5ndGggKyAxLFxuXHRcdFx0XHR9KSxcblx0XHRcdFx0cHVzaFVuZG9TdG9wOiAoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHRcdGV4ZWN1dGVFZGl0czogKF9zb3VyY2UsIGVkaXRzKSA9PiB7XG5cdFx0XHRcdFx0dmFsdWUgPSBlZGl0c1swXS50ZXh0O1xuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRzZXRQb3NpdGlvbjogbmV4dFBvc2l0aW9uID0+IHBvc2l0aW9uID0gbmV4dFBvc2l0aW9uLFxuXHRcdFx0fSxcblx0XHRcdF9wcm9tcHRUeXBpbmdBbmltYXRpb246IHsgY2xlYXI6ICgpID0+IHVuZGVmaW5lZCB9LFxuXHRcdFx0X3Byb21wdFRlbXBsYXRlUGxhY2Vob2xkZXI6IHsgdmFsdWU6IHsgc2V0UGxhY2Vob2xkZXI6IG5leHRQbGFjZWhvbGRlciA9PiBwbGFjZWhvbGRlciA9IG5leHRQbGFjZWhvbGRlciB9IH0sXG5cdFx0fTtcblxuXHRcdGNvbnN0IHJlcGxhY2VkID0gcmVwbGFjZVByb21wdC5jYWxsKGhhcm5lc3MsICduZXcgW3Rhc2tdIHByb21wdCcsICdbdGFza10nLCAnb2xkIHByb21wdCcpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IHJlcGxhY2VkLCB2YWx1ZSwgcGxhY2Vob2xkZXIsIHBvc2l0aW9uIH0sIHtcblx0XHRcdHJlcGxhY2VkOiB0cnVlLFxuXHRcdFx0dmFsdWU6ICduZXcgW3Rhc2tdIHByb21wdCcsXG5cdFx0XHRwbGFjZWhvbGRlcjogJ1t0YXNrXScsXG5cdFx0XHRwb3NpdGlvbjogeyBsaW5lTnVtYmVyOiAxLCBjb2x1bW46IDE4IH0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NsZWFycyBsb2FkaW5nIHdoZW4gdGhlIGN1cnJlbnQgcHJvbXB0IG9wdGlvbiByZWZyZXNoIGlzIGNhbmNlbGxlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZXN1bHQgPSBuZXcgRGVmZXJyZWRQcm9taXNlPE5ld1Nlc3Npb25Qcm9tcHRPcHRpb25zU3RhdGU+KCk7XG5cdFx0Y29uc3Qgc291cmNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpKTtcblx0XHRjb25zdCBzdGF0ZXM6IChOZXdTZXNzaW9uUHJvbXB0T3B0aW9uc1N0YXRlIHwgdW5kZWZpbmVkKVtdID0gW107XG5cdFx0Y29uc3QgcmVmcmVzaCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgTXV0YWJsZURpc3Bvc2FibGU8Q2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2U+KCkpO1xuXHRcdGNvbnN0IGhhcm5lc3M6IElQcm9tcHRPcHRpb25zUmVmcmVzaEhhcm5lc3MgPSB7XG5cdFx0XHRfcHJvbXB0T3B0aW9uc1JlZnJlc2g6IHJlZnJlc2gsXG5cdFx0XHRfcHJvbXB0T3B0aW9uc0NvbnRyb2xsZXI6IHtcblx0XHRcdFx0cmVzb2x2ZTogKCkgPT4gcmVzdWx0LnAsXG5cdFx0XHRcdG9uRGlkU2VsZWN0T3B0aW9uOiAoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHRcdG9uRGlkQ2xvc2U6ICgpID0+IHVuZGVmaW5lZCxcblx0XHRcdH0sXG5cdFx0XHRwcmVwYXJlUHJvbXB0T3B0aW9uc1JlZnJlc2g6ICgpID0+IHtcblx0XHRcdFx0cmVmcmVzaC52YWx1ZT8uY2FuY2VsKCk7XG5cdFx0XHRcdHJlZnJlc2guY2xlYXIoKTtcblx0XHRcdFx0c3RhdGVzLnB1c2goeyBraW5kOiAnbG9hZGluZycgfSk7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fSxcblx0XHRcdHNob3dQcm9tcHRPcHRpb25zOiBzdGF0ZSA9PiB7XG5cdFx0XHRcdHN0YXRlcy5wdXNoKHN0YXRlKTtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9LFxuXHRcdH07XG5cblx0XHRjb25zdCByZWZyZXNoaW5nID0gcmVmcmVzaFByb21wdE9wdGlvbnMuY2FsbChoYXJuZXNzLCBzb3VyY2UudG9rZW4pO1xuXHRcdHNvdXJjZS5jYW5jZWwoKTtcblx0XHRyZXN1bHQuY29tcGxldGUoeyBraW5kOiAncmVzb2x2ZWQnLCBvcHRpb25zOiBbb3B0aW9uKCdmZWF0dXJlJywgJ0ltcGxlbWVudCBhIGZlYXR1cmUnKV0gfSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHNob3duOiBhd2FpdCByZWZyZXNoaW5nLFxuXHRcdFx0c3RhdGVzOiBzdGF0ZXMubWFwKHN0YXRlID0+IHN0YXRlPy5raW5kID8/ICdoaWRkZW4nKSxcblx0XHR9LCB7XG5cdFx0XHRzaG93bjogZmFsc2UsXG5cdFx0XHRzdGF0ZXM6IFsnbG9hZGluZycsICdoaWRkZW4nXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3QgcmVzb2x2ZSBwcm9tcHQgb3B0aW9ucyBhZnRlciBkaXNtaXNzYWwnLCBhc3luYyAoKSA9PiB7XG5cdFx0bGV0IHJlc29sdmVDb3VudCA9IDA7XG5cdFx0Y29uc3QgaGFybmVzczogSVByb21wdE9wdGlvbnNSZWZyZXNoSGFybmVzcyA9IHtcblx0XHRcdF9wcm9tcHRPcHRpb25zUmVmcmVzaDogZGlzcG9zYWJsZXMuYWRkKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxDYW5jZWxsYXRpb25Ub2tlblNvdXJjZT4oKSksXG5cdFx0XHRfcHJvbXB0T3B0aW9uc0NvbnRyb2xsZXI6IHtcblx0XHRcdFx0cmVzb2x2ZTogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdHJlc29sdmVDb3VudCsrO1xuXHRcdFx0XHRcdHJldHVybiB7IGtpbmQ6ICdyZXNvbHZlZCcsIG9wdGlvbnM6IFtdIH07XG5cdFx0XHRcdH0sXG5cdFx0XHRcdG9uRGlkU2VsZWN0T3B0aW9uOiAoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHRcdG9uRGlkQ2xvc2U6ICgpID0+IHVuZGVmaW5lZCxcblx0XHRcdH0sXG5cdFx0XHRwcmVwYXJlUHJvbXB0T3B0aW9uc1JlZnJlc2g6ICgpID0+IGZhbHNlLFxuXHRcdFx0c2hvd1Byb21wdE9wdGlvbnM6ICgpID0+IHRydWUsXG5cdFx0fTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0c2hvd246IGF3YWl0IHJlZnJlc2hQcm9tcHRPcHRpb25zLmNhbGwoaGFybmVzcyksXG5cdFx0XHRyZXNvbHZlQ291bnQsXG5cdFx0fSwge1xuXHRcdFx0c2hvd246IGZhbHNlLFxuXHRcdFx0cmVzb2x2ZUNvdW50OiAwLFxuXHRcdH0pO1xuXHR9KTtcbn0pO1xuXG5mdW5jdGlvbiBvcHRpb24oaWQ6IHN0cmluZywgdGl0bGU6IHN0cmluZyk6IElOZXdTZXNzaW9uUHJvbXB0T3B0aW9uIHtcblx0cmV0dXJuIHtcblx0XHRpZCxcblx0XHR0aXRsZSxcblx0XHRkZXNjcmlwdGlvbjogYERlc2NyaXB0aW9uIGZvciAke3RpdGxlfWAsXG5cdFx0cHJvbXB0OiBgUHJvbXB0IGZvciAke3RpdGxlfTogWyR7aWR9XWAsXG5cdFx0cGxhY2Vob2xkZXI6IGBbJHtpZH1dYCxcblx0fTtcbn1cblxuZnVuY3Rpb24gc25hcHNob3RCdXR0b25zKGJ1dHRvbnM6IHJlYWRvbmx5IEhUTUxFbGVtZW50W10pOiBvYmplY3RbXSB7XG5cdHJldHVybiBidXR0b25zLm1hcChidXR0b24gPT4gKHtcblx0XHRzZWxlY3RlZDogYnV0dG9uLmdldEF0dHJpYnV0ZSgnYXJpYS1wcmVzc2VkJykgPT09ICd0cnVlJyxcblx0XHRkaXNhYmxlZDogYnV0dG9uLmdldEF0dHJpYnV0ZSgnYXJpYS1kaXNhYmxlZCcpID09PSAndHJ1ZScsXG5cdH0pKTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUVuQixTQUFTLGlCQUFpQixlQUFlO0FBQ3pDLFNBQTRCLCtCQUErQjtBQUMzRCxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLFlBQXlCLHlCQUF5QjtBQUMzRCxTQUFTLFlBQVk7QUFDckIsU0FBUywrQ0FBK0M7QUFFeEQsU0FBUywwQkFBMEI7QUFFbkMsU0FBUyxxQ0FBcUM7QUF5QjlDLE1BQU0sdUJBQXVCLFFBQVEsSUFBSSxtQkFBbUIsV0FBVyxzQkFBc0I7QUFDN0YsTUFBTSxnQkFBZ0IsUUFBUSxJQUFJLG1CQUFtQixXQUFXLGdCQUFnQjtBQUVoRixNQUFNLHlCQUF5QixLQUFvQixFQUFFO0FBQUEsRUFBckQ7QUFBQTtBQUNDLFNBQVMsV0FBcUIsQ0FBQztBQUFBO0FBQUEsRUFFdEIsa0JBQ1IsU0FDQSxjQUNBLG1CQUNjO0FBQ2QsVUFBTSxVQUFVLE9BQU8saUJBQWlCLGFBQWEsYUFBYSxJQUFJO0FBQ3RFLFVBQU0sVUFBVSxRQUFRO0FBQ3hCLFFBQUksT0FBTyxZQUFZLFVBQVU7QUFDaEMsV0FBSyxTQUFTLEtBQUssT0FBTztBQUFBLElBQzNCLFdBQVcsaUJBQWlCLE9BQU8sR0FBRztBQUNyQyxXQUFLLFNBQVMsS0FBSyxRQUFRLE1BQU0sV0FBVyxVQUFVLEdBQUcsQ0FBQztBQUFBLElBQzNEO0FBQ0EsV0FBTyxXQUFXO0FB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
