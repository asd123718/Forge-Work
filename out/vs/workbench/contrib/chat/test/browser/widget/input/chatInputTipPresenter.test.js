import assert from "assert";
import * as dom from "../../../../../../../base/browser/dom.js";
import { DisposableStore, toDisposable } from "../../../../../../../base/common/lifecycle.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../../base/test/common/utils.js";
import { workbenchInstantiationService } from "../../../../../../test/browser/workbenchTestServices.js";
import { IChatTipService } from "../../../../browser/chatTipService.js";
import { ChatInputNoticeHost, ChatInputNoticeLane } from "../../../../browser/widget/input/chatInputNoticeHost.js";
import { ChatInputTipPresenter } from "../../../../browser/widget/input/chatInputTipPresenter.js";
suite("ChatInputTipPresenter", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  const TIP = { id: "tip.test", content: { value: "A tip" } };
  function createPresenter(store, noticeHost, options) {
    let welcomeTipCalls = 0;
    const instantiationService = workbenchInstantiationService(void 0, store);
    instantiationService.stub(IChatTipService, {
      getWelcomeTip: () => {
        welcomeTipCalls++;
        return TIP;
      },
      onDidDismissTip: () => toDisposable(() => {
      }),
      onDidNavigateTip: () => toDisposable(() => {
      }),
      onDidHideTip: () => toDisposable(() => {
      }),
      onDidDisableTips: () => toDisposable(() => {
      }),
      hasMultipleTips: () => false
    });
    const container = dom.$(".chat-getting-started-tip-container");
    document.body.appendChild(container);
    store.add(toDisposable(() => container.remove()));
    const presenter = instantiationService.createInstance(
      ChatInputTipPresenter,
      { container, isEligible: options?.isEligible ?? (() => true), focusInput: () => {
      } },
      noticeHost
    );
    return {
      presenter,
      container,
      showing: () => container.childElementCount > 0,
      // The slot only docks to the input while it is showing something, so the
      // stack knows whose corners to square without inspecting descendants.
      docked: () => container.classList.contains("chat-input-stack-docked"),
      welcomeTipCalls: () => welcomeTipCalls
    };
  }
  test("shows a tip, yields the space to a notification, and takes it back", () => {
    const store = disposables.add(new DisposableStore());
    const noticeHost = store.add(new ChatInputNoticeHost(() => {
    }));
    const { presenter, showing, docked } = createPresenter(store, noticeHost);
    store.add(presenter);
    const initially = { showing: showing(), docked: docked() };
    noticeHost.setOccupied(ChatInputNoticeLane.Notification, true, { hasFocus: () => false, focus: () => {
    } });
    const underNotification = { showing: showing(), docked: docked() };
    noticeHost.setOccupied(ChatInputNoticeLane.Notification, false);
    assert.deepStrictEqual(
      { initially, underNotification, after: { showing: showing(), docked: docked() } },
      {
        initially: { showing: true, docked: true },
        underNotification: { showing: false, docked: false },
        after: { showing: true, docked: true }
      }
    );
  });
  test("evaluates the tip once per render", () => {
    const store = disposables.add(new DisposableStore());
    const noticeHost = store.add(new ChatInputNoticeHost(() => {
    }));
    const { presenter, welcomeTipCalls } = createPresenter(store, noticeHost);
    store.add(presenter);
    assert.strictEqual(welcomeTipCalls(), 1);
  });
  test("renders nothing and holds no space while the surface is ineligible", () => {
    const store = disposables.add(new DisposableStore());
    const noticeHost = store.add(new ChatInputNoticeHost(() => {
    }));
    const { presenter, showing, welcomeTipCalls } = createPresenter(store, noticeHost, { isEligible: () => false });
    store.add(presenter);
    assert.deepStrictEqual(
      { showing: showing(), welcomeTipCalls: welcomeTipCalls(), focusable: noticeHost.hasFocusableNotice() },
      { showing: false, welcomeTipCalls: 0, focusable: false }
    );
  });
  test("disposing takes the tip down and releases the space", () => {
    const store = disposables.add(new DisposableStore());
    const noticeHost = store.add(new ChatInputNoticeHost(() => {
    }));
    const { presenter, container, showing } = createPresenter(store, noticeHost);
    const shownBeforeDispose = showing();
    presenter.dispose();
    assert.deepStrictEqual(
      { shownBeforeDispose, nodesAfterDispose: container.childElementCount, focusable: noticeHost.hasFocusableNotice() },
      { shownBeforeDispose: true, nodesAfterDispose: 0, focusable: false }
    );
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGJyb3dzZXJcXHdpZGdldFxcaW5wdXRcXGNoYXRJbnB1dFRpcFByZXNlbnRlci50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL3Rlc3QvY29tbW9uL2luc3RhbnRpYXRpb25TZXJ2aWNlTW9jay5qcyc7XG5pbXBvcnQgeyB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3Rlc3QvYnJvd3Nlci93b3JrYmVuY2hUZXN0U2VydmljZXMuanMnO1xuaW1wb3J0IHsgSUNoYXRUaXAsIElDaGF0VGlwU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvY2hhdFRpcFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2hhdElucHV0Tm90aWNlSG9zdCwgQ2hhdElucHV0Tm90aWNlTGFuZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvd2lkZ2V0L2lucHV0L2NoYXRJbnB1dE5vdGljZUhvc3QuanMnO1xuaW1wb3J0IHsgQ2hhdElucHV0VGlwUHJlc2VudGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci93aWRnZXQvaW5wdXQvY2hhdElucHV0VGlwUHJlc2VudGVyLmpzJztcblxuc3VpdGUoJ0NoYXRJbnB1dFRpcFByZXNlbnRlcicsICgpID0+IHtcblxuXHRjb25zdCBkaXNwb3NhYmxlcyA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGNvbnN0IFRJUDogSUNoYXRUaXAgPSB7IGlkOiAndGlwLnRlc3QnLCBjb250ZW50OiB7IHZhbHVlOiAnQSB0aXAnIH0gfSBhcyBJQ2hhdFRpcDtcblxuXHRmdW5jdGlvbiBjcmVhdGVQcmVzZW50ZXIoc3RvcmU6IERpc3Bvc2FibGVTdG9yZSwgbm90aWNlSG9zdDogQ2hhdElucHV0Tm90aWNlSG9zdCwgb3B0aW9ucz86IHsgaXNFbGlnaWJsZT86ICgpID0+IGJvb2xlYW4gfSkge1xuXHRcdGxldCB3ZWxjb21lVGlwQ2FsbHMgPSAwO1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gd29ya2JlbmNoSW5zdGFudGlhdGlvblNlcnZpY2UodW5kZWZpbmVkLCBzdG9yZSkgYXMgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRUaXBTZXJ2aWNlLCB7XG5cdFx0XHRnZXRXZWxjb21lVGlwOiAoKSA9PiB7IHdlbGNvbWVUaXBDYWxscysrOyByZXR1cm4gVElQOyB9LFxuXHRcdFx0b25EaWREaXNtaXNzVGlwOiAoKSA9PiB0b0Rpc3Bvc2FibGUoKCkgPT4geyB9KSxcblx0XHRcdG9uRGlkTmF2aWdhdGVUaXA6ICgpID0+IHRvRGlzcG9zYWJsZSgoKSA9PiB7IH0pLFxuXHRcdFx0b25EaWRIaWRlVGlwOiAoKSA9PiB0b0Rpc3Bvc2FibGUoKCkgPT4geyB9KSxcblx0XHRcdG9uRGlkRGlzYWJsZVRpcHM6ICgpID0+IHRvRGlzcG9zYWJsZSgoKSA9PiB7IH0pLFxuXHRcdFx0aGFzTXVsdGlwbGVUaXBzOiAoKSA9PiBmYWxzZSxcblx0XHR9IGFzIFBhcnRpYWw8SUNoYXRUaXBTZXJ2aWNlPik7XG5cblx0XHRjb25zdCBjb250YWluZXIgPSBkb20uJCgnLmNoYXQtZ2V0dGluZy1zdGFydGVkLXRpcC1jb250YWluZXInKTtcblx0XHRkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKGNvbnRhaW5lcik7XG5cdFx0c3RvcmUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBjb250YWluZXIucmVtb3ZlKCkpKTtcblxuXHRcdGNvbnN0IHByZXNlbnRlciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0Q2hhdElucHV0VGlwUHJlc2VudGVyLFxuXHRcdFx0eyBjb250YWluZXIsIGlzRWxpZ2libGU6IG9wdGlvbnM/LmlzRWxpZ2libGUgPz8gKCgpID0+IHRydWUpLCBmb2N1c0lucHV0OiAoKSA9PiB7IH0gfSxcblx0XHRcdG5vdGljZUhvc3QsXG5cdFx0KTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0cHJlc2VudGVyLFxuXHRcdFx0Y29udGFpbmVyLFxuXHRcdFx0c2hvd2luZzogKCkgPT4gY29udGFpbmVyLmNoaWxkRWxlbWVudENvdW50ID4gMCxcblx0XHRcdC8vIFRoZSBzbG90IG9ubHkgZG9ja3MgdG8gdGhlIGlucHV0IHdoaWxlIGl0IGlzIHNob3dpbmcgc29tZXRoaW5nLCBzbyB0aGVcblx0XHRcdC8vIHN0YWNrIGtub3dzIHdob3NlIGNvcm5lcnMgdG8gc3F1YXJlIHdpdGhvdXQgaW5zcGVjdGluZyBkZXNjZW5kYW50cy5cblx0XHRcdGRvY2tlZDogKCkgPT4gY29udGFpbmVyLmNsYXNzTGlzdC5jb250YWlucygnY2hhdC1pbnB1dC1zdGFjay1kb2NrZWQnKSxcblx0XHRcdHdlbGNvbWVUaXBDYWxsczogKCkgPT4gd2VsY29tZVRpcENhbGxzXG5cdFx0fTtcblx0fVxuXG5cdHRlc3QoJ3Nob3dzIGEgdGlwLCB5aWVsZHMgdGhlIHNwYWNlIHRvIGEgbm90aWZpY2F0aW9uLCBhbmQgdGFrZXMgaXQgYmFjaycsICgpID0+IHtcblx0XHRjb25zdCBzdG9yZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRcdGNvbnN0IG5vdGljZUhvc3QgPSBzdG9yZS5hZGQobmV3IENoYXRJbnB1dE5vdGljZUhvc3QoKCkgPT4geyB9KSk7XG5cdFx0Y29uc3QgeyBwcmVzZW50ZXIsIHNob3dpbmcsIGRvY2tlZCB9ID0gY3JlYXRlUHJlc2VudGVyKHN0b3JlLCBub3RpY2VIb3N0KTtcblx0XHRzdG9yZS5hZGQocHJlc2VudGVyKTtcblxuXHRcdGNvbnN0IGluaXRpYWxseSA9IHsgc2hvd2luZzogc2hvd2luZygpLCBkb2NrZWQ6IGRvY2tlZCgpIH07XG5cdFx0Ly8gQSBub3RpZmljYXRpb24gb3ducyB0aGUgc3BhY2Ugb3V0cmlnaHQ7IHRoZSB0aXAgbXVzdCBjb21lIG9mZiBzY3JlZW4gYW5kXG5cdFx0Ly8gdGhlbiByZXR1cm4gb24gaXRzIG93biBvbmNlIHRoZSBub3RpZmljYXRpb24gZ29lcyBhd2F5LlxuXHRcdG5vdGljZUhvc3Quc2V0T2NjdXBpZWQoQ2hhdElucHV0Tm90aWNlTGFuZS5Ob3RpZmljYXRpb24sIHRydWUsIHsgaGFzRm9jdXM6ICgpID0+IGZhbHNlLCBmb2N1czogKCkgPT4geyB9IH0pO1xuXHRcdGNvbnN0IHVuZGVyTm90aWZpY2F0aW9uID0geyBzaG93aW5nOiBzaG93aW5nKCksIGRvY2tlZDogZG9ja2VkKCkgfTtcblx0XHRub3RpY2VIb3N0LnNldE9jY3VwaWVkKENoYXRJbnB1dE5vdGljZUxhbmUuTm90aWZpY2F0aW9uLCBmYWxzZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0eyBpbml0aWFsbHksIHVuZGVyTm90aWZpY2F0aW9uLCBhZnRlcjogeyBzaG93aW5nOiBzaG93aW5nKCksIGRvY2tlZDogZG9ja2VkKCkgfSB9LFxuXHRcdFx0e1xuXHRcdFx0XHRpbml0aWFsbHk6IHsgc2hvd2luZzogdHJ1ZSwgZG9ja2VkOiB0cnVlIH0sXG5cdFx0XHRcdHVuZGVyTm90aWZpY2F0aW9uOiB7IHNob3dpbmc6IGZhbHNlLCBkb2NrZWQ6IGZhbHNlIH0sXG5cdFx0XHRcdGFmdGVyOiB7IHNob3dpbmc6IHRydWUsIGRvY2tlZDogdHJ1ZSB9XG5cdFx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZXZhbHVhdGVzIHRoZSB0aXAgb25jZSBwZXIgcmVuZGVyJywgKCkgPT4ge1xuXHRcdGNvbnN0IHN0b3JlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdFx0Y29uc3Qgbm90aWNlSG9zdCA9IHN0b3JlLmFkZChuZXcgQ2hhdElucHV0Tm90aWNlSG9zdCgoKSA9PiB7IH0pKTtcblx0XHQvLyBgZ2V0V2VsY29tZVRpcGAgcGVyc2lzdHMgcm90YXRpb24gc3RhdGUgYW5kIHJlcG9ydHMgdGhlIHRpcCBhcyBzaG93biwgc29cblx0XHQvLyByZW5kZXJpbmcgbXVzdCBuZXZlciBhc2sgZm9yIGl0IHR3aWNlIGZvciBhIHNpbmdsZSBhcHBlYXJhbmNlLlxuXHRcdGNvbnN0IHsgcHJlc2VudGVyLCB3ZWxjb21lVGlwQ2FsbHMgfSA9IGNyZWF0ZVByZXNlbnRlcihzdG9yZSwgbm90aWNlSG9zdCk7XG5cdFx0c3RvcmUuYWRkKHByZXNlbnRlcik7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod2VsY29tZVRpcENhbGxzKCksIDEpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZW5kZXJzIG5vdGhpbmcgYW5kIGhvbGRzIG5vIHNwYWNlIHdoaWxlIHRoZSBzdXJmYWNlIGlzIGluZWxpZ2libGUnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RvcmUgPSBkaXNwb3NhYmxlcy5hZGQobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0XHRjb25zdCBub3RpY2VIb3N0ID0gc3RvcmUuYWRkKG5ldyBDaGF0SW5wdXROb3RpY2VIb3N0KCgpID0+IHsgfSkpO1xuXHRcdGNvbnN0IHsgcHJlc2VudGVyLCBzaG93aW5nLCB3ZWxjb21lVGlwQ2FsbHMgfSA9IGNyZWF0ZVByZXNlbnRlcihzdG9yZSwgbm90aWNlSG9zdCwgeyBpc0VsaWdpYmxlOiAoKSA9PiBmYWxzZSB9KTtcblx0XHRzdG9yZS5hZGQocHJlc2VudGVyKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHR7IHNob3dpbmc6IHNob3dpbmcoKSwgd2VsY29tZVRpcENhbGxzOiB3ZWxjb21lVGlwQ2FsbHMoKSwgZm9jdXNhYmxlOiBub3RpY2VIb3N0Lmhhc0ZvY3VzYWJsZU5vdGljZSgpIH0sXG5cdFx0XHR7IHNob3dpbmc6IGZhbHNlLCB3ZWxjb21lVGlwQ2FsbHM6IDAsIGZvY3VzYWJsZTogZmFsc2UgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Rpc3Bvc2luZyB0YWtlcyB0aGUgdGlwIGRvd24gYW5kIHJlbGVhc2VzIHRoZSBzcGFjZScsICgpID0+IHtcblx0XHRjb25zdCBzdG9yZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRcdGNvbnN0IG5vdGljZUhvc3QgPSBzdG9yZS5hZGQobmV3IENoYXRJbnB1dE5vdGljZUhvc3QoKCkgPT4geyB9KSk7XG5cdFx0Y29uc3QgeyBwcmVzZW50ZXIsIGNvbnRhaW5lciwgc2hvd2luZyB9ID0gY3JlYXRlUHJlc2VudGVyKHN0b3JlLCBub3RpY2VIb3N0KTtcblxuXHRcdGNvbnN0IHNob3duQmVmb3JlRGlzcG9zZSA9IHNob3dpbmcoKTtcblx0XHRwcmVzZW50ZXIuZGlzcG9zZSgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHsgc2hvd25CZWZvcmVEaXNwb3NlLCBub2Rlc0FmdGVyRGlzcG9zZTogY29udGFpbmVyLmNoaWxkRWxlbWVudENvdW50LCBmb2N1c2FibGU6IG5vdGljZUhvc3QuaGFzRm9jdXNhYmxlTm90aWNlKCkgfSxcblx0XHRcdHsgc2hvd25CZWZvcmVEaXNwb3NlOiB0cnVlLCBub2Rlc0FmdGVyRGlzcG9zZTogMCwgZm9jdXNhYmxlOiBmYWxzZSB9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixZQUFZLFNBQVM7QUFDckIsU0FBUyxpQkFBaUIsb0JBQW9CO0FBQzlDLFNBQVMsK0NBQStDO0FBRXhELFNBQVMscUNBQXFDO0FBQzlDLFNBQW1CLHVCQUF1QjtBQUMxQyxTQUFTLHFCQUFxQiwyQkFBMkI7QUFDekQsU0FBUyw2QkFBNkI7QUFFdEMsTUFBTSx5QkFBeUIsTUFBTTtBQUVwQyxRQUFNLGNBQWMsd0NBQXdDO0FBRTVELFFBQU0sTUFBZ0IsRUFBRSxJQUFJLFlBQVksU0FBUyxFQUFFLE9BQU8sUUFBUSxFQUFFO0FBRXBFLFdBQVMsZ0JBQWdCLE9BQXdCLFlBQWlDLFNBQTBDO0FBQzNILFFBQUksa0JBQWtCO0FBQ3RCLFVBQU0sdUJBQXVCLDhCQUE4QixRQUFXLEtBQUs7QUFDM0UseUJBQXFCLEtBQUssaUJBQWlCO0FBQUEsTUFDMUMsZUFBZSxNQUFNO0FBQUU7QUFBbUIsZUFBTztBQUFBLE1BQUs7QUFBQSxNQUN0RCxpQkFBaUIsTUFBTSxhQUFhLE1BQU07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
