import assert from "assert";
import * as dom from "../../../../../../../base/browser/dom.js";
import { setARIAContainer } from "../../../../../../../base/browser/ui/aria/aria.js";
import { Codicon } from "../../../../../../../base/common/codicons.js";
import { DisposableStore, toDisposable } from "../../../../../../../base/common/lifecycle.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../../base/test/common/utils.js";
import { ChatInputNoticeVariant, ChatInputNoticeWidget } from "../../../../browser/widget/input/chatInputNoticeWidget.js";
suite("ChatInputNoticeWidget", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  function createContainer(store) {
    const root = dom.$("div");
    document.body.appendChild(root);
    store.add(toDisposable(() => root.remove()));
    return root;
  }
  function createNotice(container) {
    return disposables.add(new ChatInputNoticeWidget({
      container,
      variant: ChatInputNoticeVariant.Onboarding,
      className: "test-notice",
      ariaLabel: "Test notice",
      ariaDescription: "Test description."
    }));
  }
  test("builds one shared frame carrying the variant and the producer class", () => {
    const container = createContainer(disposables);
    const notice = createNotice(container);
    assert.deepStrictEqual(
      {
        classes: [...notice.domNode.classList],
        parented: notice.domNode.parentElement === container,
        role: notice.domNode.getAttribute("role"),
        label: notice.domNode.getAttribute("aria-label"),
        description: notice.domNode.getAttribute("aria-description"),
        tabIndex: notice.domNode.tabIndex
      },
      {
        classes: ["chat-input-notice", "chat-input-notice-onboarding", "test-notice"],
        parented: true,
        role: "region",
        label: "Test notice",
        description: "Test description.",
        tabIndex: 0
      }
    );
  });
  test("leaves the node unparented when no container is given", () => {
    const notice = createNotice();
    assert.deepStrictEqual(
      { parented: !!notice.domNode.parentElement, connected: notice.domNode.isConnected },
      { parented: false, connected: false }
    );
  });
  test("creates the notice and its actions for an auxiliary window", () => {
    const iframe = document.createElement("iframe");
    document.body.appendChild(iframe);
    disposables.add(toDisposable(() => iframe.remove()));
    const auxiliaryDocument = iframe.contentDocument;
    const container = document.createElement("div");
    auxiliaryDocument.body.appendChild(container);
    const createElement = auxiliaryDocument.createElement;
    auxiliaryDocument.createElement = () => {
      throw new Error("Not allowed to create elements in child window JavaScript context.");
    };
    disposables.add(toDisposable(() => auxiliaryDocument.createElement = createElement));
    const notice = createNotice(container);
    const action = notice.addAction({
      ariaLabel: "Continue",
      icon: Codicon.check,
      onActivate: () => {
      }
    });
    assert.deepStrictEqual({
      noticeOwnerDocument: notice.domNode.ownerDocument === auxiliaryDocument,
      actionOwnerDocument: action.ownerDocument === auxiliaryDocument,
      mainRealmNotice: notice.domNode instanceof HTMLElement,
      mainRealmAction: action instanceof HTMLElement
    }, {
      noticeOwnerDocument: true,
      actionOwnerDocument: true,
      mainRealmNotice: true,
      mainRealmAction: true
    });
  });
  test("interrupts for an introduction, but waits its turn for a tip", () => {
    const container = createContainer(disposables);
    const ariaContainer = dom.append(container, dom.$("div"));
    setARIAContainer(ariaContainer);
    const spoken = (selector) => ariaContainer.querySelector(selector)?.textContent ?? "";
    disposables.add(new ChatInputNoticeWidget({
      container,
      variant: ChatInputNoticeVariant.Onboarding,
      ariaLabel: "An introduction"
    })).announce();
    disposables.add(new ChatInputNoticeWidget({
      container,
      variant: ChatInputNoticeVariant.Tip,
      ariaLabel: "A tip"
    })).announce();
    assert.deepStrictEqual(
      { assertive: spoken(".monaco-alert"), polite: spoken(".monaco-status") },
      {
        assertive: "An introduction. Use Shift+Tab to reach the notice.",
        polite: "A tip. Use Shift+Tab to reach the notice."
      }
    );
  });
  test("dismisses on unmodified Escape only, and activates its actions", () => {
    const container = createContainer(disposables);
    let dismissals = 0;
    let activations = 0;
    const notice = disposables.add(new ChatInputNoticeWidget({
      container,
      variant: ChatInputNoticeVariant.Onboarding,
      ariaLabel: "Test notice",
      onEscape: () => dismissals++
    }));
    const action = notice.addAction({
      ariaLabel: "Continue",
      icon: Codicon.check,
      onActivate: () => activations++
    });
    notice.domNode.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", keyCode: 27, shiftKey: true, bubbles: true }));
    notice.domNode.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", keyCode: 27, bubbles: true }));
    action.querySelector(".action-label").click();
    assert.deepStrictEqual({ dismissals, activations }, { dismissals: 1, activations: 1 });
  });
  test("gives the dismiss action a standard shape, and honours the parent it is given", () => {
    const container = createContainer(disposables);
    const notice = createNotice(container);
    const header = dom.append(notice.domNode, dom.$(".header"));
    const housing = notice.addDismissAction({ parent: header, onActivate: () => {
    } });
    const dismiss = housing.querySelector(".action-label");
    assert.deepStrictEqual(
      {
        classes: [...dismiss.classList],
        role: dismiss.getAttribute("role"),
        label: dismiss.getAttribute("aria-label"),
        tabIndex: dismiss.tabIndex,
        inHeader: housing.parentElement === header
      },
      {
        classes: ["action-label", "codicon", "codicon-close-compact", "chat-input-notice-dismiss"],
        role: "button",
        label: "Dismiss",
        tabIndex: 0,
        inHeader: true
      }
    );
  });
  test("registers action listeners in the store it is given, so a rebuilt notice does not accumulate them", () => {
    const container = createContainer(disposables);
    const notice = createNotice(container);
    const renderStore = disposables.add(new DisposableStore());
    let activations = 0;
    const action = notice.addAction({
      ariaLabel: "Continue",
      icon: Codicon.check,
      store: renderStore,
      onActivate: () => activations++
    });
    const button = () => action.querySelector(".action-label");
    button()?.click();
    renderStore.clear();
    button()?.click();
    assert.strictEqual(activations, 1);
  });
  test("stops being a landmark and a tab stop while put away, and comes back intact", () => {
    const container = createContainer(disposables);
    const notice = createNotice(container);
    const read = () => ({
      role: notice.domNode.getAttribute("role"),
      label: notice.domNode.getAttribute("aria-label"),
      tabIndex: notice.domNode.getAttribute("tabindex"),
      hidden: notice.domNode.style.display === "none"
    });
    const shown = read();
    notice.setVisible(false);
    const away = read();
    notice.setVisible(true);
    const back = read();
    assert.deepStrictEqual(
      { shown, away, back },
      {
        shown: { role: "region", label: "Test notice", tabIndex: "0", hidden: false },
        away: { role: null, label: null, tabIndex: null, hidden: true },
        back: { role: "region", label: "Test notice", tabIndex: "0", hidden: false }
      }
    );
  });
  test("renames the region for notices whose message is only known per render", () => {
    const container = createContainer(disposables);
    const notice = createNotice(container);
    notice.setAriaLabel("Approaching your quota");
    const named = notice.domNode.getAttribute("aria-label");
    notice.setAriaLabel(void 0);
    assert.deepStrictEqual(
      { named, cleared: notice.domNode.getAttribute("aria-label") },
      { named: "Approaching your quota", cleared: null }
    );
  });
  test("reports focus through the notice host contract", () => {
    const container = createContainer(disposables);
    const notice = createNotice(container);
    const before = notice.hasFocus();
    notice.focus();
    assert.deepStrictEqual({ before, after: notice.hasFocus() }, { before: false, after: true });
  });
  test("takes itself out of the DOM when disposed", () => {
    const container = createContainer(disposables);
    const store = new DisposableStore();
    const notice = store.add(new ChatInputNoticeWidget({
      container,
      variant: ChatInputNoticeVariant.Tip,
      ariaLabel: "Test tip"
    }));
    const attached = notice.domNode.parentElement === container;
    store.dispose();
    assert.deepStrictEqual({ attached, remaining: container.childElementCount }, { attached: true, remaining: 0 });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGJyb3dzZXJcXHdpZGdldFxcaW5wdXRcXGNoYXRJbnB1dE5vdGljZVdpZGdldC50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgc2V0QVJJQUNvbnRhaW5lciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hcmlhL2FyaWEuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgQ2hhdElucHV0Tm90aWNlVmFyaWFudCwgQ2hhdElucHV0Tm90aWNlV2lkZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci93aWRnZXQvaW5wdXQvY2hhdElucHV0Tm90aWNlV2lkZ2V0LmpzJztcblxuc3VpdGUoJ0NoYXRJbnB1dE5vdGljZVdpZGdldCcsICgpID0+IHtcblxuXHRjb25zdCBkaXNwb3NhYmxlcyA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGZ1bmN0aW9uIGNyZWF0ZUNvbnRhaW5lcihzdG9yZTogUGljazxEaXNwb3NhYmxlU3RvcmUsICdhZGQnPik6IEhUTUxFbGVtZW50IHtcblx0XHRjb25zdCByb290ID0gZG9tLiQoJ2RpdicpO1xuXHRcdGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQocm9vdCk7XG5cdFx0c3RvcmUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiByb290LnJlbW92ZSgpKSk7XG5cdFx0cmV0dXJuIHJvb3Q7XG5cdH1cblxuXHRmdW5jdGlvbiBjcmVhdGVOb3RpY2UoY29udGFpbmVyPzogSFRNTEVsZW1lbnQpOiBDaGF0SW5wdXROb3RpY2VXaWRnZXQge1xuXHRcdHJldHVybiBkaXNwb3NhYmxlcy5hZGQobmV3IENoYXRJbnB1dE5vdGljZVdpZGdldCh7XG5cdFx0XHRjb250YWluZXIsXG5cdFx0XHR2YXJpYW50OiBDaGF0SW5wdXROb3RpY2VWYXJpYW50Lk9uYm9hcmRpbmcsXG5cdFx0XHRjbGFzc05hbWU6ICd0ZXN0LW5vdGljZScsXG5cdFx0XHRhcmlhTGFiZWw6ICdUZXN0IG5vdGljZScsXG5cdFx0XHRhcmlhRGVzY3JpcHRpb246ICdUZXN0IGRlc2NyaXB0aW9uLicsXG5cdFx0fSkpO1xuXHR9XG5cblx0dGVzdCgnYnVpbGRzIG9uZSBzaGFyZWQgZnJhbWUgY2FycnlpbmcgdGhlIHZhcmlhbnQgYW5kIHRoZSBwcm9kdWNlciBjbGFzcycsICgpID0+IHtcblx0XHRjb25zdCBjb250YWluZXIgPSBjcmVhdGVDb250YWluZXIoZGlzcG9zYWJsZXMpO1xuXHRcdGNvbnN0IG5vdGljZSA9IGNyZWF0ZU5vdGljZShjb250YWluZXIpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHtcblx0XHRcdFx0Y2xhc3NlczogWy4uLm5vdGljZS5kb21Ob2RlLmNsYXNzTGlzdF0sXG5cdFx0XHRcdHBhcmVudGVkOiBub3RpY2UuZG9tTm9kZS5wYXJlbnRFbGVtZW50ID09PSBjb250YWluZXIsXG5cdFx0XHRcdHJvbGU6IG5vdGljZS5kb21Ob2RlLmdldEF0dHJpYnV0ZSgncm9sZScpLFxuXHRcdFx0XHRsYWJlbDogbm90aWNlLmRvbU5vZGUuZ2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJyksXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBub3RpY2UuZG9tTm9kZS5nZXRBdHRyaWJ1dGUoJ2FyaWEtZGVzY3JpcHRpb24nKSxcblx0XHRcdFx0dGFiSW5kZXg6IG5vdGljZS5kb21Ob2RlLnRhYkluZGV4LFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0Y2xhc3NlczogWydjaGF0LWlucHV0LW5vdGljZScsICdjaGF0LWlucHV0LW5vdGljZS1vbmJvYXJkaW5nJywgJ3Rlc3Qtbm90aWNlJ10sXG5cdFx0XHRcdHBhcmVudGVkOiB0cnVlLFxuXHRcdFx0XHRyb2xlOiAncmVnaW9uJyxcblx0XHRcdFx0bGFiZWw6ICdUZXN0IG5vdGljZScsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiAnVGVzdCBkZXNjcmlwdGlvbi4nLFxuXHRcdFx0XHR0YWJJbmRleDogMCxcblx0XHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdsZWF2ZXMgdGhlIG5vZGUgdW5wYXJlbnRlZCB3aGVuIG5vIGNvbnRhaW5lciBpcyBnaXZlbicsICgpID0+IHtcblx0XHRjb25zdCBub3RpY2UgPSBjcmVhdGVOb3RpY2UoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHR7IHBhcmVudGVkOiAhIW5vdGljZS5kb21Ob2RlLnBhcmVudEVsZW1lbnQsIGNvbm5lY3RlZDogbm90aWNlLmRvbU5vZGUuaXNDb25uZWN0ZWQgfSxcblx0XHRcdHsgcGFyZW50ZWQ6IGZhbHNlLCBjb25uZWN0ZWQ6IGZhbHNlIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjcmVhdGVzIHRoZSBub3RpY2UgYW5kIGl0cyBhY3Rpb25zIGZvciBhbiBhdXhpbGlhcnkgd2luZG93JywgKCkgPT4ge1xuXHRcdGNvbnN0IGlmcmFtZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2lmcmFtZScpO1xuXHRcdGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQoaWZyYW1lKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IGlmcmFtZS5yZW1vdmUoKSkpO1xuXG5cdFx0Y29uc3QgYXV4aWxpYXJ5RG9jdW1lbnQgPSBpZnJhbWUuY29udGVudERvY3VtZW50ITtcblx0XHRjb25zdCBjb250YWluZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRhdXhpbGlhcnlEb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKGNvbnRhaW5lcik7XG5cdFx0Y29uc3QgY3JlYXRlRWxlbWVudCA9IGF1eGlsaWFyeURvY3VtZW50LmNyZWF0ZUVsZW1lbnQ7XG5cdFx0YXV4aWxpYXJ5RG9jdW1lbnQuY3JlYXRlRWxlbWVudCA9ICgpID0+IHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignTm90IGFsbG93ZWQgdG8gY3JlYXRlIGVsZW1lbnRzIGluIGNoaWxkIHdpbmRvdyBKYXZhU2NyaXB0IGNvbnRleHQuJyk7XG5cdFx0fTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IGF1eGlsaWFyeURvY3VtZW50LmNyZWF0ZUVsZW1lbnQgPSBjcmVhdGVFbGVtZW50KSk7XG5cblx0XHRjb25zdCBub3RpY2UgPSBjcmVhdGVOb3RpY2UoY29udGFpbmVyKTtcblx0XHRjb25zdCBhY3Rpb24gPSBub3RpY2UuYWRkQWN0aW9uKHtcblx0XHRcdGFyaWFMYWJlbDogJ0NvbnRpbnVlJyxcblx0XHRcdGljb246IENvZGljb24uY2hlY2ssXG5cdFx0XHRvbkFjdGl2YXRlOiAoKSA9PiB7IH0sXG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdG5vdGljZU93bmVyRG9jdW1lbnQ6IG5vdGljZS5kb21Ob2RlLm93bmVyRG9jdW1lbnQgPT09IGF1eGlsaWFyeURvY3VtZW50LFxuXHRcdFx0YWN0aW9uT3duZXJEb2N1bWVudDogYWN0aW9uLm93bmVyRG9jdW1lbnQgPT09IGF1eGlsaWFyeURvY3VtZW50LFxuXHRcdFx0bWFpblJlYWxtTm90aWNlOiBub3RpY2UuZG9tTm9kZSBpbnN0YW5jZW9mIEhUTUxFbGVtZW50LFxuXHRcdFx0bWFpblJlYWxtQWN0aW9uOiBhY3Rpb24gaW5zdGFuY2VvZiBIVE1MRWxlbWVudCxcblx0XHR9LCB7XG5cdFx0XHRub3RpY2VPd25lckRvY3VtZW50OiB0cnVlLFxuXHRcdFx0YWN0aW9uT3duZXJEb2N1bWVudDogdHJ1ZSxcblx0XHRcdG1haW5SZWFsbU5vdGljZTogdHJ1ZSxcblx0XHRcdG1haW5SZWFsbUFjdGlvbjogdHJ1ZSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaW50ZXJydXB0cyBmb3IgYW4gaW50cm9kdWN0aW9uLCBidXQgd2FpdHMgaXRzIHR1cm4gZm9yIGEgdGlwJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRhaW5lciA9IGNyZWF0ZUNvbnRhaW5lcihkaXNwb3NhYmxlcyk7XG5cdFx0Y29uc3QgYXJpYUNvbnRhaW5lciA9IGRvbS5hcHBlbmQoY29udGFpbmVyLCBkb20uJCgnZGl2JykpO1xuXHRcdHNldEFSSUFDb250YWluZXIoYXJpYUNvbnRhaW5lcik7XG5cdFx0Y29uc3Qgc3Bva2VuID0gKHNlbGVjdG9yOiBzdHJpbmcpID0+IGFyaWFDb250YWluZXIucXVlcnlTZWxlY3RvcihzZWxlY3Rvcik/LnRleHRDb250ZW50ID8/ICcnO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKG5ldyBDaGF0SW5wdXROb3RpY2VXaWRnZXQoe1xuXHRcdFx0Y29udGFpbmVyLFxuXHRcdFx0dmFyaWFudDogQ2hhdElucHV0Tm90aWNlVmFyaWFudC5PbmJvYXJkaW5nLFxuXHRcdFx0YXJpYUxhYmVsOiAnQW4gaW50cm9kdWN0aW9uJyxcblx0XHR9KSkuYW5ub3VuY2UoKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQobmV3IENoYXRJbnB1dE5vdGljZVdpZGdldCh7XG5cdFx0XHRjb250YWluZXIsXG5cdFx0XHR2YXJpYW50OiBDaGF0SW5wdXROb3RpY2VWYXJpYW50LlRpcCxcblx0XHRcdGFyaWFMYWJlbDogJ0EgdGlwJyxcblx0XHR9KSkuYW5ub3VuY2UoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHR7IGFzc2VydGl2ZTogc3Bva2VuKCcubW9uYWNvLWFsZXJ0JyksIHBvbGl0ZTogc3Bva2VuKCcubW9uYWNvLXN0YXR1cycpIH0sXG5cdFx0XHR7XG5cdFx0XHRcdGFzc2VydGl2ZTogJ0FuIGludHJvZHVjdGlvbi4gVXNlIFNoaWZ0K1RhYiB0byByZWFjaCB0aGUgbm90aWNlLicsXG5cdFx0XHRcdHBvbGl0ZTogJ0EgdGlwLiBVc2UgU2hpZnQrVGFiIHRvIHJlYWNoIHRoZSBub3RpY2UuJyxcblx0XHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkaXNtaXNzZXMgb24gdW5tb2RpZmllZCBFc2NhcGUgb25seSwgYW5kIGFjdGl2YXRlcyBpdHMgYWN0aW9ucycsICgpID0+IHtcblx0XHRjb25zdCBjb250YWluZXIgPSBjcmVhdGVDb250YWluZXIoZGlzcG9zYWJsZXMpO1xuXHRcdGxldCBkaXNtaXNzYWxzID0gMDtcblx0XHRsZXQgYWN0aXZhdGlvbnMgPSAwO1xuXHRcdGNvbnN0IG5vdGljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQ2hhdElucHV0Tm90aWNlV2lkZ2V0KHtcblx0XHRcdGNvbnRhaW5lcixcblx0XHRcdHZhcmlhbnQ6IENoYXRJbnB1dE5vdGljZVZhcmlhbnQuT25ib2FyZGluZyxcblx0XHRcdGFyaWFMYWJlbDogJ1Rlc3Qgbm90aWNlJyxcblx0XHRcdG9uRXNjYXBlOiAoKSA9PiBkaXNtaXNzYWxzKyssXG5cdFx0fSkpO1xuXHRcdGNvbnN0IGFjdGlvbiA9IG5vdGljZS5hZGRBY3Rpb24oe1xuXHRcdFx0YXJpYUxhYmVsOiAnQ29udGludWUnLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5jaGVjayxcblx0XHRcdG9uQWN0aXZhdGU6ICgpID0+IGFjdGl2YXRpb25zKyssXG5cdFx0fSk7XG5cblx0XHRub3RpY2UuZG9tTm9kZS5kaXNwYXRjaEV2ZW50KG5ldyBLZXlib2FyZEV2ZW50KCdrZXlkb3duJywgeyBrZXk6ICdFc2NhcGUnLCBrZXlDb2RlOiAyNywgc2hpZnRLZXk6IHRydWUsIGJ1YmJsZXM6IHRydWUgfSkpO1xuXHRcdG5vdGljZS5kb21Ob2RlLmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleWRvd24nLCB7IGtleTogJ0VzY2FwZScsIGtleUNvZGU6IDI3LCBidWJibGVzOiB0cnVlIH0pKTtcblx0XHRhY3Rpb24ucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oJy5hY3Rpb24tbGFiZWwnKSEuY2xpY2soKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBkaXNtaXNzYWxzLCBhY3RpdmF0aW9ucyB9LCB7IGRpc21pc3NhbHM6IDEsIGFjdGl2YXRpb25zOiAxIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdnaXZlcyB0aGUgZGlzbWlzcyBhY3Rpb24gYSBzdGFuZGFyZCBzaGFwZSwgYW5kIGhvbm91cnMgdGhlIHBhcmVudCBpdCBpcyBnaXZlbicsICgpID0+IHtcblx0XHRjb25zdCBjb250YWluZXIgPSBjcmVhdGVDb250YWluZXIoZGlzcG9zYWJsZXMpO1xuXHRcdGNvbnN0IG5vdGljZSA9IGNyZWF0ZU5vdGljZShjb250YWluZXIpO1xuXHRcdGNvbnN0IGhlYWRlciA9IGRvbS5hcHBlbmQobm90aWNlLmRvbU5vZGUsIGRvbS4kKCcuaGVhZGVyJykpO1xuXG5cdFx0Y29uc3QgaG91c2luZyA9IG5vdGljZS5hZGREaXNtaXNzQWN0aW9uKHsgcGFyZW50OiBoZWFkZXIsIG9uQWN0aXZhdGU6ICgpID0+IHsgfSB9KTtcblx0XHRjb25zdCBkaXNtaXNzID0gaG91c2luZy5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PignLmFjdGlvbi1sYWJlbCcpITtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHR7XG5cdFx0XHRcdGNsYXNzZXM6IFsuLi5kaXNtaXNzLmNsYXNzTGlzdF0sXG5cdFx0XHRcdHJvbGU6IGRpc21pc3MuZ2V0QXR0cmlidXRlKCdyb2xlJyksXG5cdFx0XHRcdGxhYmVsOiBkaXNtaXNzLmdldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcpLFxuXHRcdFx0XHR0YWJJbmRleDogZGlzbWlzcy50YWJJbmRleCxcblx0XHRcdFx0aW5IZWFkZXI6IGhvdXNpbmcucGFyZW50RWxlbWVudCA9PT0gaGVhZGVyLFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0Y2xhc3NlczogWydhY3Rpb24tbGFiZWwnLCAnY29kaWNvbicsICdjb2RpY29uLWNsb3NlLWNvbXBhY3QnLCAnY2hhdC1pbnB1dC1ub3RpY2UtZGlzbWlzcyddLFxuXHRcdFx0XHRyb2xlOiAnYnV0dG9uJyxcblx0XHRcdFx0bGFiZWw6ICdEaXNtaXNzJyxcblx0XHRcdFx0dGFiSW5kZXg6IDAsXG5cdFx0XHRcdGluSGVhZGVyOiB0cnVlLFxuXHRcdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlZ2lzdGVycyBhY3Rpb24gbGlzdGVuZXJzIGluIHRoZSBzdG9yZSBpdCBpcyBnaXZlbiwgc28gYSByZWJ1aWx0IG5vdGljZSBkb2VzIG5vdCBhY2N1bXVsYXRlIHRoZW0nLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29udGFpbmVyID0gY3JlYXRlQ29udGFpbmVyKGRpc3Bvc2FibGVzKTtcblx0XHRjb25zdCBub3RpY2UgPSBjcmVhdGVOb3RpY2UoY29udGFpbmVyKTtcblx0XHRjb25zdCByZW5kZXJTdG9yZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRcdGxldCBhY3RpdmF0aW9ucyA9IDA7XG5cblx0XHRjb25zdCBhY3Rpb24gPSBub3RpY2UuYWRkQWN0aW9uKHtcblx0XHRcdGFyaWFMYWJlbDogJ0NvbnRpbnVlJyxcblx0XHRcdGljb246IENvZGljb24uY2hlY2ssXG5cdFx0XHRzdG9yZTogcmVuZGVyU3RvcmUsXG5cdFx0XHRvbkFjdGl2YXRlOiAoKSA9PiBhY3RpdmF0aW9ucysrLFxuXHRcdH0pO1xuXHRcdGNvbnN0IGJ1dHRvbiA9ICgpID0+IGFjdGlvbi5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PignLmFjdGlvbi1sYWJlbCcpO1xuXHRcdGJ1dHRvbigpPy5jbGljaygpO1xuXHRcdHJlbmRlclN0b3JlLmNsZWFyKCk7XG5cdFx0YnV0dG9uKCk/LmNsaWNrKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aXZhdGlvbnMsIDEpO1xuXHR9KTtcblxuXHR0ZXN0KCdzdG9wcyBiZWluZyBhIGxhbmRtYXJrIGFuZCBhIHRhYiBzdG9wIHdoaWxlIHB1dCBhd2F5LCBhbmQgY29tZXMgYmFjayBpbnRhY3QnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29udGFpbmVyID0gY3JlYXRlQ29udGFpbmVyKGRpc3Bvc2FibGVzKTtcblx0XHRjb25zdCBub3RpY2UgPSBjcmVhdGVOb3RpY2UoY29udGFpbmVyKTtcblxuXHRcdGNvbnN0IHJlYWQgPSAoKSA9PiAoe1xuXHRcdFx0cm9sZTogbm90aWNlLmRvbU5vZGUuZ2V0QXR0cmlidXRlKCdyb2xlJyksXG5cdFx0XHRsYWJlbDogbm90aWNlLmRvbU5vZGUuZ2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJyksXG5cdFx0XHR0YWJJbmRleDogbm90aWNlLmRvbU5vZGUuZ2V0QXR0cmlidXRlKCd0YWJpbmRleCcpLFxuXHRcdFx0aGlkZGVuOiBub3RpY2UuZG9tTm9kZS5zdHlsZS5kaXNwbGF5ID09PSAnbm9uZScsXG5cdFx0fSk7XG5cblx0XHRjb25zdCBzaG93biA9IHJlYWQoKTtcblx0XHRub3RpY2Uuc2V0VmlzaWJsZShmYWxzZSk7XG5cdFx0Y29uc3QgYXdheSA9IHJlYWQoKTtcblx0XHRub3RpY2Uuc2V0VmlzaWJsZSh0cnVlKTtcblx0XHRjb25zdCBiYWNrID0gcmVhZCgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHsgc2hvd24sIGF3YXksIGJhY2sgfSxcblx0XHRcdHtcblx0XHRcdFx0c2hvd246IHsgcm9sZTogJ3JlZ2lvbicsIGxhYmVsOiAnVGVzdCBub3RpY2UnLCB0YWJJbmRleDogJzAnLCBoaWRkZW46IGZhbHNlIH0sXG5cdFx0XHRcdGF3YXk6IHsgcm9sZTogbnVsbCwgbGFiZWw6IG51bGwsIHRhYkluZGV4OiBudWxsLCBoaWRkZW46IHRydWUgfSxcblx0XHRcdFx0YmFjazogeyByb2xlOiAncmVnaW9uJywgbGFiZWw6ICdUZXN0IG5vdGljZScsIHRhYkluZGV4OiAnMCcsIGhpZGRlbjogZmFsc2UgfSxcblx0XHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZW5hbWVzIHRoZSByZWdpb24gZm9yIG5vdGljZXMgd2hvc2UgbWVzc2FnZSBpcyBvbmx5IGtub3duIHBlciByZW5kZXInLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29udGFpbmVyID0gY3JlYXRlQ29udGFpbmVyKGRpc3Bvc2FibGVzKTtcblx0XHRjb25zdCBub3RpY2UgPSBjcmVhdGVOb3RpY2UoY29udGFpbmVyKTtcblxuXHRcdG5vdGljZS5zZXRBcmlhTGFiZWwoJ0FwcHJvYWNoaW5nIHlvdXIgcXVvdGEnKTtcblx0XHRjb25zdCBuYW1lZCA9IG5vdGljZS5kb21Ob2RlLmdldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcpO1xuXHRcdG5vdGljZS5zZXRBcmlhTGFiZWwodW5kZWZpbmVkKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHR7IG5hbWVkLCBjbGVhcmVkOiBub3RpY2UuZG9tTm9kZS5nZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnKSB9LFxuXHRcdFx0eyBuYW1lZDogJ0FwcHJvYWNoaW5nIHlvdXIgcXVvdGEnLCBjbGVhcmVkOiBudWxsIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXBvcnRzIGZvY3VzIHRocm91Z2ggdGhlIG5vdGljZSBob3N0IGNvbnRyYWN0JywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRhaW5lciA9IGNyZWF0ZUNvbnRhaW5lcihkaXNwb3NhYmxlcyk7XG5cdFx0Y29uc3Qgbm90aWNlID0gY3JlYXRlTm90aWNlKGNvbnRhaW5lcik7XG5cblx0XHRjb25zdCBiZWZvcmUgPSBub3RpY2UuaGFzRm9jdXMoKTtcblx0XHRub3RpY2UuZm9jdXMoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBiZWZvcmUsIGFmdGVyOiBub3RpY2UuaGFzRm9jdXMoKSB9LCB7IGJlZm9yZTogZmFsc2UsIGFmdGVyOiB0cnVlIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCd0YWtlcyBpdHNlbGYgb3V0IG9mIHRoZSBET00gd2hlbiBkaXNwb3NlZCcsICgpID0+IHtcblx0XHRjb25zdCBjb250YWluZXIgPSBjcmVhdGVDb250YWluZXIoZGlzcG9zYWJsZXMpO1xuXHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IG5vdGljZSA9IHN0b3JlLmFkZChuZXcgQ2hhdElucHV0Tm90aWNlV2lkZ2V0KHtcblx0XHRcdGNvbnRhaW5lcixcblx0XHRcdHZhcmlhbnQ6IENoYXRJbnB1dE5vdGljZVZhcmlhbnQuVGlwLFxuXHRcdFx0YXJpYUxhYmVsOiAnVGVzdCB0aXAnLFxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGF0dGFjaGVkID0gbm90aWNlLmRvbU5vZGUucGFyZW50RWxlbWVudCA9PT0gY29udGFpbmVyO1xuXHRcdHN0b3JlLmRpc3Bvc2UoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBhdHRhY2hlZCwgcmVtYWluaW5nOiBjb250YWluZXIuY2hpbGRFbGVtZW50Q291bnQgfSwgeyBhdHRhY2hlZDogdHJ1ZSwgcmVtYWluaW5nOiAwIH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFlBQVksU0FBUztBQUNyQixTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxpQkFBaUIsb0JBQW9CO0FBQzlDLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsd0JBQXdCLDZCQUE2QjtBQUU5RCxNQUFNLHlCQUF5QixNQUFNO0FBRXBDLFFBQU0sY0FBYyx3Q0FBd0M7QUFFNUQsV0FBUyxnQkFBZ0IsT0FBa0Q7QUFDMUUsVUFBTSxPQUFPLElBQUksRUFBRSxLQUFLO0FBQ3hCLGFBQVMsS0FBSyxZQUFZLElBQUk7QUFDOUIsVUFBTSxJQUFJLGFBQWEsTUFBTSxLQUFLLE9BQU8sQ0FBQyxDQUFDO0FBQzNDLFdBQU87QUFBQSxFQUNSO0FBRUEsV0FBUyxhQUFhLFdBQWdEO0FBQ3JFLFdBQU8sWUFBWSxJQUFJLElBQUksc0JBQXNCO0FBQUEsTUFDaEQ7QUFBQSxNQUNBLFNBQVMsdUJBQXVCO0FBQUEsTUFDaEMsV0FBVztBQUFBLE1BQ1gsV0FBVztBQUFBLE1BQ1gsaUJBQWlCO0FBQUEsSUFDbEIsQ0FBQyxDQUFDO0FBQUEsRUFDSDtBQUVBLE9BQUssdUVBQXVFLE1BQU07QUFDakYsVUFBTSxZQUFZLGdCQUFnQixXQUFXO0FBQzdDLFVBQU0sU0FBUyxhQUFhLFNBQVM7QUFFckMsV0FBTztBQUFBLE1BQ047QUFBQSxRQUNDLFNBQVMsQ0FBQyxHQUFHLE9BQU8sUUFBUSxTQUFTO0FBQUEsUUFDckMsVUFBVSxPQUFPLFFBQVEsa0JBQWtCO0FBQUEsUUFDM0MsTUFBTSxP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
