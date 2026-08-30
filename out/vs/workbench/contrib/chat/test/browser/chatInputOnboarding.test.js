import assert from "assert";
import * as dom from "../../../../../base/browser/dom.js";
import { errorHandler, setUnexpectedErrorHandler } from "../../../../../base/common/errors.js";
import { DisposableStore, toDisposable } from "../../../../../base/common/lifecycle.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { workbenchInstantiationService } from "../../../../test/browser/workbenchTestServices.js";
import { IStorageService, StorageScope } from "../../../../../platform/storage/common/storage.js";
import { ChatInputOnboarding } from "../../browser/widget/input/chatInputOnboarding.js";
import { ChatInputNoticeHost, ChatInputNoticeLane } from "../../browser/widget/input/chatInputNoticeHost.js";
import { isChatInputStackSlotShowing } from "../../browser/widget/input/chatInputStack.js";
suite("Chat input onboarding", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  function createHost(store) {
    const root = dom.$("div");
    root.tabIndex = 0;
    const container = dom.append(root, dom.$(".chat-input-onboarding-container"));
    document.body.appendChild(root);
    store.add(toDisposable(() => root.remove()));
    return { root, container, addContainer: () => dom.append(root, dom.$(".chat-input-onboarding-container")) };
  }
  function createClaim(noticeHost) {
    return (options) => noticeHost.occupy(ChatInputNoticeLane.Onboarding, options);
  }
  function laneClaimed(noticeHost) {
    let led = false;
    noticeHost.occupy(ChatInputNoticeLane.Tip, { onDidChangeLeading: (leading) => {
      led ||= leading;
    } }).dispose();
    return !led;
  }
  function createNoticeHost(store, focusInput = () => {
  }) {
    return store.add(new ChatInputNoticeHost(focusInput));
  }
  function createOnboarding(store, storageKey) {
    const instantiationService = workbenchInstantiationService(void 0, store);
    return store.add(instantiationService.createInstance(ChatInputOnboarding, {
      storageKey
    }));
  }
  function createCard(context) {
    const card = context.container.ownerDocument.createElement("div");
    card.classList.add("chat-input-onboarding-card");
    context.container.appendChild(card);
    card.tabIndex = 0;
    const disposable = toDisposable(() => card.remove());
    return {
      announce: () => {
        announceCalls++;
      },
      hasFocus: () => dom.isAncestorOfActiveElement(card),
      focus: () => card.focus(),
      dispose: () => disposable.dispose()
    };
  }
  function visibleCards(container) {
    return isChatInputStackSlotShowing(container) ? container.querySelectorAll(".chat-input-onboarding-card").length : 0;
  }
  let announceCalls = 0;
  setup(() => {
    announceCalls = 0;
  });
  test("owns one card and restores focus when it is dismissed", () => {
    const onboarding = createOnboarding(disposables, "test.chatInputOnboarding.ownsCard");
    const host = createHost(disposables);
    const noticeHost = createNoticeHost(disposables);
    let focusCalls = 0;
    disposables.add(onboarding.registerHost({
      container: host.container,
      focusRoot: host.root,
      focus: () => focusCalls++,
      claimNotice: createClaim(noticeHost)
    }));
    let context;
    let cardsCreated = 0;
    const shown = onboarding.showIfNeeded((value) => {
      context = value;
      cardsCreated++;
      return createCard(value);
    });
    const stillTakenOver = onboarding.showIfNeeded((value) => {
      cardsCreated++;
      return createCard(value);
    });
    assert.deepStrictEqual(
      {
        shown,
        stillTakenOver,
        cardsCreated,
        visible: isChatInputStackSlotShowing(host.container),
        isVisible: onboarding.isVisible,
        laneClaimed: laneClaimed(noticeHost),
        cards: visibleCards(host.container)
      },
      { shown: true, stillTakenOver: true, cardsCreated: 1, visible: true, isVisible: true, laneClaimed: true, cards: 1 }
    );
    context.dismiss();
    assert.deepStrictEqual(
      {
        focusCalls,
        visible: isChatInputStackSlotShowing(host.container),
        isVisible: onboarding.isVisible,
        // Dismissal releases the space, so a tip may take it.
        laneClaimed: laneClaimed(noticeHost),
        cards: visibleCards(host.container),
        shownAgain: onboarding.showIfNeeded(createCard)
      },
      { focusCalls: 1, visible: false, isVisible: false, laneClaimed: false, cards: 0, shownAgain: false }
    );
  });
  test("does not consume first-run state until a card can be shown", () => {
    const onboarding = createOnboarding(disposables, "test.chatInputOnboarding.waitsForHost");
    assert.strictEqual(onboarding.showIfNeeded(createCard), false);
    const host = createHost(disposables);
    disposables.add(onboarding.registerHost({ container: host.container, focusRoot: host.root }));
    assert.strictEqual(onboarding.showIfNeeded(createCard), true);
  });
  test("builds nothing while the space is taken, then shows the card once", () => {
    const store = disposables.add(new DisposableStore());
    const instantiationService = workbenchInstantiationService(void 0, store);
    const storageService = instantiationService.get(IStorageService);
    const onboarding = store.add(instantiationService.createInstance(ChatInputOnboarding, {
      storageKey: "test.chatInputOnboarding.deferWhenTaken"
    }));
    const host = createHost(store);
    const noticeHost = createNoticeHost(store);
    store.add(onboarding.registerHost({
      container: host.container,
      focusRoot: host.root,
      claimNotice: createClaim(noticeHost)
    }));
    const notification = noticeHost.occupy(ChatInputNoticeLane.Notification);
    let cardsCreated = 0;
    onboarding.showIfNeeded((context) => {
      cardsCreated++;
      return createCard(context);
    });
    const whileTaken = {
      cardsCreated,
      announceCalls,
      seen: storageService.getBoolean("test.chatInputOnboarding.deferWhenTaken", StorageScope.APPLICATION, false),
      isVisible: onboarding.isVisible
    };
    notification.dispose();
    assert.deepStrictEqual(
      {
        whileTaken,
        afterFreed: {
          cardsCreated,
          announceCalls,
          seen: storageService.getBoolean("test.chatInputOnboarding.deferWhenTaken", StorageScope.APPLICATION, false),
          isVisible: onboarding.isVisible
        }
      },
      {
        whileTaken: { cardsCreated: 0, announceCalls: 0, seen: false, isVisible: false },
        afterFreed: { cardsCreated: 1, announceCalls: 1, seen: true, isVisible: true }
      }
    );
  });
  test("stands down while the space is taken and comes back without rebuilding", () => {
    const onboarding = createOnboarding(disposables, "test.chatInputOnboarding.standsDown");
    const host = createHost(disposables);
    const noticeHost = createNoticeHost(disposables);
    disposables.add(onboarding.registerHost({
      container: host.container,
      focusRoot: host.root,
      claimNotice: createClaim(noticeHost)
    }));
    let cardsCreated = 0;
    onboarding.showIfNeeded((context) => {
      cardsCreated++;
      return createCard(context);
    });
    const whileFree = onboarding.isVisible;
    const notification = noticeHost.occupy(ChatInputNoticeLane.Notification);
    const whileTaken = { isVisible: onboarding.isVisible, cards: visibleCards(host.container) };
    const tipWhileTaken = laneClaimed(noticeHost);
    notification.dispose();
    assert.deepStrictEqual(
      { whileFree, whileTaken, tipWhileTaken, afterFreed: onboarding.isVisible, cardsCreated, announceCalls },
      {
        whileFree: true,
        whileTaken: { isVisible: false, cards: 0 },
        tipWhileTaken: true,
        afterFreed: true,
        cardsCreated: 1,
        announceCalls: 1
      }
    );
  });
  test("stands the card's live parts down while it is put away", () => {
    const onboarding = createOnboarding(disposables, "test.chatInputOnboarding.suspends");
    const host = createHost(disposables);
    const noticeHost = createNoticeHost(disposables);
    disposables.add(onboarding.registerHost({
      container: host.container,
      focusRoot: host.root,
      claimNotice: createClaim(noticeHost)
    }));
    const visibility = [];
    onboarding.showIfNeeded((context) => ({
      ...createCard(context),
      setVisible: (visible) => visibility.push(visible)
    }));
    const notification = noticeHost.occupy(ChatInputNoticeLane.Notification);
    notification.dispose();
    assert.deepStrictEqual(visibility, [false, true]);
  });
  test("docks to the input the user is in, even before it is the most recent", () => {
    const onboarding = createOnboarding(disposables, "test.chatInputOnboarding.picksFocused");
    const store = disposables.add(new DisposableStore());
    const noticeHost = createNoticeHost(store);
    const first = createHost(store);
    const second = createHost(store);
    store.add(onboarding.registerHost({ container: first.container, focusRoot: first.root, claimNotice: createClaim(noticeHost) }));
    store.add(onboarding.registerHost({ container: second.container, focusRoot: second.root, claimNotice: createClaim(noticeHost) }));
    second.root.focus();
    onboarding.show(createCard);
    assert.deepStrictEqual(
      { first: visibleCards(first.container), second: visibleCards(second.container) },
      { first: 0, second: 1 }
    );
  });
  test("a dismissed card does not come back when the space frees", () => {
    const onboarding = createOnboarding(disposables, "test.chatInputOnboarding.dismissedStaysGone");
    const host = createHost(disposables);
    const noticeHost = createNoticeHost(disposables);
    disposables.add(onboarding.registerHost({
      container: host.container,
      focusRoot: host.root,
      claimNotice: createClaim(noticeHost)
    }));
    let dismiss;
    onboarding.showIfNeeded((context) => {
      dismiss = () => context.dismiss(false);
      return createCard(context);
    });
    dismiss();
    const notification = noticeHost.occupy(ChatInputNoticeLane.Notification);
    notification.dispose();
    assert.deepStrictEqual(
      { isVisible: onboarding.isVisible, laneClaimed: laneClaimed(noticeHost) },
      { isVisible: false, laneClaimed: false }
    );
  });
  test("only the newest introduction is on screen, and the other returns after it", () => {
    const store = disposables.add(new DisposableStore());
    const instantiationService = workbenchInstantiationService(void 0, store);
    const make = (storageKey) => store.add(instantiationService.createInstance(ChatInputOnboarding, {
      storageKey
    }));
    const first = make("test.chatInputOnboarding.introA");
    const second = make("test.chatInputOnboarding.introB");
    const host = createHost(store);
    const noticeHost = createNoticeHost(store);
    const firstContainer = host.addContainer();
    const secondContainer = host.addContainer();
    const claim = createClaim(noticeHost);
    store.add(first.registerHost({ container: firstContainer, focusRoot: host.root, claimNotice: claim }));
    store.add(second.registerHost({ container: secondContainer, focusRoot: host.root, claimNotice: claim }));
    let dismissSecond;
    first.showIfNeeded(createCard);
    second.showIfNeeded((context) => {
      dismissSecond = () => context.dismiss(false);
      return createCard(context);
    });
    const whileBothWant = { first: first.isVisible, second: second.isVisible };
    dismissSecond();
    assert.deepStrictEqual(
      { whileBothWant, afterSecondDismissed: { first: first.isVisible, second: second.isVisible } },
      { whileBothWant: { first: false, second: true }, afterSecondDismissed: { first: true, second: false } }
    );
  });
  test("moving an introduction to another input does not put the new card away", () => {
    const onboarding = createOnboarding(disposables, "test.chatInputOnboarding.movesHosts");
    const store = disposables.add(new DisposableStore());
    const first = createHost(store);
    const second = createHost(store);
    const firstNoticeHost = createNoticeHost(store);
    const secondNoticeHost = createNoticeHost(store);
    store.add(onboarding.registerHost({ container: first.container, focusRoot: first.root, claimNotice: createClaim(firstNoticeHost) }));
    onboarding.show(createCard);
    store.add(onboarding.registerHost({ container: second.container, focusRoot: second.root, claimNotice: createClaim(secondNoticeHost) }));
    second.root.focus();
    second.root.dispatchEvent(new FocusEvent("focus"));
    onboarding.show(createCard);
    assert.deepStrictEqual(
      {
        isVisible: onboarding.isVisible,
        movedOff: visibleCards(first.container),
        movedTo: visibleCards(second.container)
      },
      { isVisible: true, movedOff: 0, movedTo: 1 }
    );
  });
  test("alternating introductions settle instead of reopening forever", () => {
    const store = disposables.add(new DisposableStore());
    const instantiationService = workbenchInstantiationService(void 0, store);
    const make = (storageKey) => store.add(instantiationService.createInstance(ChatInputOnboarding, {
      storageKey
    }));
    const first = make("test.chatInputOnboarding.pingA");
    const second = make("test.chatInputOnboarding.pingB");
    const host = createHost(store);
    const noticeHost = createNoticeHost(store);
    const claim = createClaim(noticeHost);
    store.add(first.registerHost({ container: host.addContainer(), focusRoot: host.root, claimNotice: claim }));
    store.add(second.registerHost({ container: host.addContainer(), focusRoot: host.root, claimNotice: claim }));
    let cardsCreated = 0;
    for (let i = 0; i < 10; i++) {
      const onboarding = i % 2 === 0 ? first : second;
      onboarding.showIfNeeded((context) => {
        cardsCreated++;
        return createCard(context);
      });
    }
    assert.strictEqual(cardsCreated, 2);
  });
  test("a card that fails to build releases the space it was standing on", () => {
    const onboarding = createOnboarding(disposables, "test.chatInputOnboarding.buildThrows");
    const host = createHost(disposables);
    const noticeHost = createNoticeHost(disposables);
    disposables.add(onboarding.registerHost({
      container: host.container,
      focusRoot: host.root,
      claimNotice: createClaim(noticeHost)
    }));
    const originalHandler = errorHandler.getUnexpectedErrorHandler();
    const reported = [];
    setUnexpectedErrorHandler((error) => reported.push(error.message));
    try {
      onboarding.showIfNeeded(() => {
        throw new Error("card exploded");
      });
    } finally {
      setUnexpectedErrorHandler(originalHandler);
    }
    assert.deepStrictEqual(
      {
        reported,
        isVisible: onboarding.isVisible,
        laneClaimed: laneClaimed(noticeHost),
        showing: isChatInputStackSlotShowing(host.container)
      },
      { reported: ["card exploded"], isVisible: false, laneClaimed: false, showing: false }
    );
  });
  test("a card that is taken down while building is not installed anyway", () => {
    const store = disposables.add(new DisposableStore());
    const instantiationService = workbenchInstantiationService(void 0, store);
    const storageService = instantiationService.get(IStorageService);
    const onboarding = store.add(instantiationService.createInstance(ChatInputOnboarding, {
      storageKey: "test.chatInputOnboarding.cancelledWhileBuilding"
    }));
    const host = createHost(store);
    const noticeHost = createNoticeHost(store);
    const registration = store.add(onboarding.registerHost({
      container: host.container,
      focusRoot: host.root,
      claimNotice: createClaim(noticeHost)
    }));
    onboarding.showIfNeeded((context) => {
      const card = createCard(context);
      registration.dispose();
      return card;
    });
    assert.deepStrictEqual(
      {
        isVisible: onboarding.isVisible,
        cards: host.container.querySelectorAll(".chat-input-onboarding-card").length,
        showing: isChatInputStackSlotShowing(host.container),
        laneClaimed: laneClaimed(noticeHost),
        announceCalls,
        seen: storageService.getBoolean("test.chatInputOnboarding.cancelledWhileBuilding", StorageScope.APPLICATION, false)
      },
      { isVisible: false, cards: 0, showing: false, laneClaimed: false, announceCalls: 0, seen: false }
    );
  });
  test("announces once on show", () => {
    const onboarding = createOnboarding(disposables, "test.chatInputOnboarding.announces");
    const host = createHost(disposables);
    disposables.add(onboarding.registerHost({ container: host.container, focusRoot: host.root }));
    const shown = onboarding.show(createCard);
    onboarding.showIfNeeded(createCard);
    assert.deepStrictEqual(
      { shown, announceCalls },
      { shown: true, announceCalls: 1 }
    );
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGJyb3dzZXJcXGNoYXRJbnB1dE9uYm9hcmRpbmcudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IGVycm9ySGFuZGxlciwgc2V0VW5leHBlY3RlZEVycm9ySGFuZGxlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vdGVzdC9icm93c2VyL3dvcmtiZW5jaFRlc3RTZXJ2aWNlcy5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgQ2hhdElucHV0Tm90aWNlQ2xhaW0sIENoYXRJbnB1dE9uYm9hcmRpbmcsIElDaGF0SW5wdXRPbmJvYXJkaW5nQ29udGV4dCB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvd2lkZ2V0L2lucHV0L2NoYXRJbnB1dE9uYm9hcmRpbmcuanMnO1xuaW1wb3J0IHsgQ2hhdElucHV0Tm90aWNlSG9zdCwgQ2hhdElucHV0Tm90aWNlTGFuZSB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvd2lkZ2V0L2lucHV0L2NoYXRJbnB1dE5vdGljZUhvc3QuanMnO1xuaW1wb3J0IHsgaXNDaGF0SW5wdXRTdGFja1Nsb3RTaG93aW5nIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci93aWRnZXQvaW5wdXQvY2hhdElucHV0U3RhY2suanMnO1xuXG5zdWl0ZSgnQ2hhdCBpbnB1dCBvbmJvYXJkaW5nJywgKCkgPT4ge1xuXG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0ZnVuY3Rpb24gY3JlYXRlSG9zdChzdG9yZTogUGljazxEaXNwb3NhYmxlU3RvcmUsICdhZGQnPik6IHsgcm9vdDogSFRNTEVsZW1lbnQ7IGNvbnRhaW5lcjogSFRNTEVsZW1lbnQ7IGFkZENvbnRhaW5lcigpOiBIVE1MRWxlbWVudCB9IHtcblx0XHRjb25zdCByb290ID0gZG9tLiQoJ2RpdicpO1xuXHRcdHJvb3QudGFiSW5kZXggPSAwO1xuXHRcdGNvbnN0IGNvbnRhaW5lciA9IGRvbS5hcHBlbmQocm9vdCwgZG9tLiQoJy5jaGF0LWlucHV0LW9uYm9hcmRpbmctY29udGFpbmVyJykpO1xuXHRcdGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQocm9vdCk7XG5cdFx0c3RvcmUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiByb290LnJlbW92ZSgpKSk7XG5cdFx0cmV0dXJuIHsgcm9vdCwgY29udGFpbmVyLCBhZGRDb250YWluZXI6ICgpID0+IGRvbS5hcHBlbmQocm9vdCwgZG9tLiQoJy5jaGF0LWlucHV0LW9uYm9hcmRpbmctY29udGFpbmVyJykpIH07XG5cdH1cblxuXHQvKipcblx0ICogVGhlIHNwYWNlIGFib3ZlIHRoZSBpbnB1dCwgd2lyZWQgZXhhY3RseSBhcyBgcmVnaXN0ZXJDaGF0SW5wdXRPbmJvYXJkaW5nSG9zdHNgXG5cdCAqIHdpcmVzIGl0LCBzbyB0aGVzZSB0ZXN0cyBleGVyY2lzZSB0aGUgcmVhbCBhcmJpdHJhdGlvbiByYXRoZXIgdGhhbiBhIHN0YW5kLWluLlxuXHQgKi9cblx0ZnVuY3Rpb24gY3JlYXRlQ2xhaW0obm90aWNlSG9zdDogQ2hhdElucHV0Tm90aWNlSG9zdCk6IENoYXRJbnB1dE5vdGljZUNsYWltIHtcblx0XHRyZXR1cm4gb3B0aW9ucyA9PiBub3RpY2VIb3N0Lm9jY3VweShDaGF0SW5wdXROb3RpY2VMYW5lLk9uYm9hcmRpbmcsIG9wdGlvbnMpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFdoZXRoZXIgYW55dGhpbmcgaXMgc3RpbGwgaG9sZGluZyB0aGUgc3BhY2UgYWJvdmUgdGhlIGlucHV0LiBQcm9iZWQgYnlcblx0ICogY2xhaW1pbmcgdGhlIGxvd2VzdCBsYW5lIGFuZCBhc2tpbmcgd2hldGhlciBpdCBnb3QgdG8gbGVhZC5cblx0ICovXG5cdGZ1bmN0aW9uIGxhbmVDbGFpbWVkKG5vdGljZUhvc3Q6IENoYXRJbnB1dE5vdGljZUhvc3QpOiBib29sZWFuIHtcblx0XHRsZXQgbGVkID0gZmFsc2U7XG5cdFx0bm90aWNlSG9zdC5vY2N1cHkoQ2hhdElucHV0Tm90aWNlTGFuZS5UaXAsIHsgb25EaWRDaGFuZ2VMZWFkaW5nOiBsZWFkaW5nID0+IHsgbGVkIHx8PSBsZWFkaW5nOyB9IH0pLmRpc3Bvc2UoKTtcblx0XHRyZXR1cm4gIWxlZDtcblx0fVxuXG5cdGZ1bmN0aW9uIGNyZWF0ZU5vdGljZUhvc3Qoc3RvcmU6IFBpY2s8RGlzcG9zYWJsZVN0b3JlLCAnYWRkJz4sIGZvY3VzSW5wdXQ6ICgpID0+IHZvaWQgPSAoKSA9PiB7IH0pOiBDaGF0SW5wdXROb3RpY2VIb3N0IHtcblx0XHRyZXR1cm4gc3RvcmUuYWRkKG5ldyBDaGF0SW5wdXROb3RpY2VIb3N0KGZvY3VzSW5wdXQpKTtcblx0fVxuXG5cdGZ1bmN0aW9uIGNyZWF0ZU9uYm9hcmRpbmcoc3RvcmU6IFBpY2s8RGlzcG9zYWJsZVN0b3JlLCAnYWRkJz4sIHN0b3JhZ2VLZXk6IHN0cmluZyk6IENoYXRJbnB1dE9uYm9hcmRpbmcge1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gd29ya2JlbmNoSW5zdGFudGlhdGlvblNlcnZpY2UodW5kZWZpbmVkLCBzdG9yZSk7XG5cdFx0cmV0dXJuIHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0SW5wdXRPbmJvYXJkaW5nLCB7XG5cdFx0XHRzdG9yYWdlS2V5LFxuXHRcdH0pKTtcblx0fVxuXG5cdGZ1bmN0aW9uIGNyZWF0ZUNhcmQoY29udGV4dDogSUNoYXRJbnB1dE9uYm9hcmRpbmdDb250ZXh0KSB7XG5cdFx0Y29uc3QgY2FyZCA9IGNvbnRleHQuY29udGFpbmVyLm93bmVyRG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0Y2FyZC5jbGFzc0xpc3QuYWRkKCdjaGF0LWlucHV0LW9uYm9hcmRpbmctY2FyZCcpO1xuXHRcdGNvbnRleHQuY29udGFpbmVyLmFwcGVuZENoaWxkKGNhcmQpO1xuXHRcdGNhcmQudGFiSW5kZXggPSAwO1xuXHRcdGNvbnN0IGRpc3Bvc2FibGUgPSB0b0Rpc3Bvc2FibGUoKCkgPT4gY2FyZC5yZW1vdmUoKSk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGFubm91bmNlOiAoKSA9PiB7IGFubm91bmNlQ2FsbHMrKzsgfSxcblx0XHRcdGhhc0ZvY3VzOiAoKSA9PiBkb20uaXNBbmNlc3Rvck9mQWN0aXZlRWxlbWVudChjYXJkKSxcblx0XHRcdGZvY3VzOiAoKSA9PiBjYXJkLmZvY3VzKCksXG5cdFx0XHRkaXNwb3NlOiAoKSA9PiBkaXNwb3NhYmxlLmRpc3Bvc2UoKSxcblx0XHR9O1xuXHR9XG5cblx0LyoqIEEgY2FyZCBpcyBvbiBzY3JlZW4gb25seSBpZiBpdCBpcyBidWlsdCBhbmQgaXRzIGNvbnRhaW5lciBpcyBub3QgaGlkZGVuLiAqL1xuXHRmdW5jdGlvbiB2aXNpYmxlQ2FyZHMoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIGlzQ2hhdElucHV0U3RhY2tTbG90U2hvd2luZyhjb250YWluZXIpID8gY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3JBbGwoJy5jaGF0LWlucHV0LW9uYm9hcmRpbmctY2FyZCcpLmxlbmd0aCA6IDA7XG5cdH1cblxuXHRsZXQgYW5ub3VuY2VDYWxscyA9IDA7XG5cdHNldHVwKCgpID0+IHtcblx0XHRhbm5vdW5jZUNhbGxzID0gMDtcblx0fSk7XG5cblx0dGVzdCgnb3ducyBvbmUgY2FyZCBhbmQgcmVzdG9yZXMgZm9jdXMgd2hlbiBpdCBpcyBkaXNtaXNzZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgb25ib2FyZGluZyA9IGNyZWF0ZU9uYm9hcmRpbmcoZGlzcG9zYWJsZXMsICd0ZXN0LmNoYXRJbnB1dE9uYm9hcmRpbmcub3duc0NhcmQnKTtcblx0XHRjb25zdCBob3N0ID0gY3JlYXRlSG9zdChkaXNwb3NhYmxlcyk7XG5cdFx0Y29uc3Qgbm90aWNlSG9zdCA9IGNyZWF0ZU5vdGljZUhvc3QoZGlzcG9zYWJsZXMpO1xuXHRcdGxldCBmb2N1c0NhbGxzID0gMDtcblx0XHRkaXNwb3NhYmxlcy5hZGQob25ib2FyZGluZy5yZWdpc3Rlckhvc3Qoe1xuXHRcdFx0Y29udGFpbmVyOiBob3N0LmNvbnRhaW5lcixcblx0XHRcdGZvY3VzUm9vdDogaG9zdC5yb290LFxuXHRcdFx0Zm9jdXM6ICgpID0+IGZvY3VzQ2FsbHMrKyxcblx0XHRcdGNsYWltTm90aWNlOiBjcmVhdGVDbGFpbShub3RpY2VIb3N0KSxcblx0XHR9KSk7XG5cblx0XHRsZXQgY29udGV4dDogSUNoYXRJbnB1dE9uYm9hcmRpbmdDb250ZXh0IHwgdW5kZWZpbmVkO1xuXHRcdGxldCBjYXJkc0NyZWF0ZWQgPSAwO1xuXHRcdGNvbnN0IHNob3duID0gb25ib2FyZGluZy5zaG93SWZOZWVkZWQodmFsdWUgPT4ge1xuXHRcdFx0Y29udGV4dCA9IHZhbHVlO1xuXHRcdFx0Y2FyZHNDcmVhdGVkKys7XG5cdFx0XHRyZXR1cm4gY3JlYXRlQ2FyZCh2YWx1ZSk7XG5cdFx0fSk7XG5cdFx0Y29uc3Qgc3RpbGxUYWtlbk92ZXIgPSBvbmJvYXJkaW5nLnNob3dJZk5lZWRlZCh2YWx1ZSA9PiB7XG5cdFx0XHRjYXJkc0NyZWF0ZWQrKztcblx0XHRcdHJldHVybiBjcmVhdGVDYXJkKHZhbHVlKTtcblx0XHR9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHR7XG5cdFx0XHRcdHNob3duLFxuXHRcdFx0XHRzdGlsbFRha2VuT3Zlcixcblx0XHRcdFx0Y2FyZHNDcmVhdGVkLFxuXHRcdFx0XHR2aXNpYmxlOiBpc0NoYXRJbnB1dFN0YWNrU2xvdFNob3dpbmcoaG9zdC5jb250YWluZXIpLFxuXHRcdFx0XHRpc1Zpc2libGU6IG9uYm9hcmRpbmcuaXNWaXNpYmxlLFxuXHRcdFx0XHRsYW5lQ2xhaW1lZDogbGFuZUNsYWltZWQobm90aWNlSG9zdCksXG5cdFx0XHRcdGNhcmRzOiB2aXNpYmxlQ2FyZHMoaG9zdC5jb250YWluZXIpLFxuXHRcdFx0fSxcblx0XHRcdHsgc2hvd246IHRydWUsIHN0aWxsVGFrZW5PdmVyOiB0cnVlLCBjYXJkc0NyZWF0ZWQ6IDEsIHZpc2libGU6IHRydWUsIGlzVmlzaWJsZTogdHJ1ZSwgbGFuZUNsYWltZWQ6IHRydWUsIGNhcmRzOiAxIH0pO1xuXG5cdFx0Y29udGV4dCEuZGlzbWlzcygpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHtcblx0XHRcdFx0Zm9jdXNDYWxscyxcblx0XHRcdFx0dmlzaWJsZTogaXNDaGF0SW5wdXRTdGFja1Nsb3RTaG93aW5nKGhvc3QuY29udGFpbmVyKSxcblx0XHRcdFx0aXNWaXNpYmxlOiBvbmJvYXJkaW5nLmlzVmlzaWJsZSxcblx0XHRcdFx0Ly8gRGlzbWlzc2FsIHJlbGVhc2VzIHRoZSBzcGFjZSwgc28gYSB0aXAgbWF5IHRha2UgaXQuXG5cdFx0XHRcdGxhbmVDbGFpbWVkOiBsYW5lQ2xhaW1lZChub3RpY2VIb3N0KSxcblx0XHRcdFx0Y2FyZHM6IHZpc2libGVDYXJkcyhob3N0LmNvbnRhaW5lciksXG5cdFx0XHRcdHNob3duQWdhaW46IG9uYm9hcmRpbmcuc2hvd0lmTmVlZGVkKGNyZWF0ZUNhcmQpLFxuXHRcdFx0fSxcblx0XHRcdHsgZm9jdXNDYWxsczogMSwgdmlzaWJsZTogZmFsc2UsIGlzVmlzaWJsZTogZmFsc2UsIGxhbmVDbGFpbWVkOiBmYWxzZSwgY2FyZHM6IDAsIHNob3duQWdhaW46IGZhbHNlIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCBjb25zdW1lIGZpcnN0LXJ1biBzdGF0ZSB1bnRpbCBhIGNhcmQgY2FuIGJlIHNob3duJywgKCkgPT4ge1xuXHRcdGNvbnN0IG9uYm9hcmRpbmcgPSBjcmVhdGVPbmJvYXJkaW5nKGRpc3Bvc2FibGVzLCAndGVzdC5jaGF0SW5wdXRPbmJvYXJkaW5nLndhaXRzRm9ySG9zdCcpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG9uYm9hcmRpbmcuc2hvd0lmTmVlZGVkKGNyZWF0ZUNhcmQpLCBmYWxzZSk7XG5cblx0XHRjb25zdCBob3N0ID0gY3JlYXRlSG9zdChkaXNwb3NhYmxlcyk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKG9uYm9hcmRpbmcucmVnaXN0ZXJIb3N0KHsgY29udGFpbmVyOiBob3N0LmNvbnRhaW5lciwgZm9jdXNSb290OiBob3N0LnJvb3QgfSkpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG9uYm9hcmRpbmcuc2hvd0lmTmVlZGVkKGNyZWF0ZUNhcmQpLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnYnVpbGRzIG5vdGhpbmcgd2hpbGUgdGhlIHNwYWNlIGlzIHRha2VuLCB0aGVuIHNob3dzIHRoZSBjYXJkIG9uY2UnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RvcmUgPSBkaXNwb3NhYmxlcy5hZGQobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlKHVuZGVmaW5lZCwgc3RvcmUpO1xuXHRcdGNvbnN0IHN0b3JhZ2VTZXJ2aWNlID0gaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElTdG9yYWdlU2VydmljZSk7XG5cdFx0Y29uc3Qgb25ib2FyZGluZyA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0SW5wdXRPbmJvYXJkaW5nLCB7XG5cdFx0XHRzdG9yYWdlS2V5OiAndGVzdC5jaGF0SW5wdXRPbmJvYXJkaW5nLmRlZmVyV2hlblRha2VuJyxcblx0XHR9KSk7XG5cdFx0Y29uc3QgaG9zdCA9IGNyZWF0ZUhvc3Qoc3RvcmUpO1xuXHRcdGNvbnN0IG5vdGljZUhvc3QgPSBjcmVhdGVOb3RpY2VIb3N0KHN0b3JlKTtcblx0XHRzdG9yZS5hZGQob25ib2FyZGluZy5yZWdpc3Rlckhvc3Qoe1xuXHRcdFx0Y29udGFpbmVyOiBob3N0LmNvbnRhaW5lcixcblx0XHRcdGZvY3VzUm9vdDogaG9zdC5yb290LFxuXHRcdFx0Y2xhaW1Ob3RpY2U6IGNyZWF0ZUNsYWltKG5vdGljZUhvc3QpLFxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IG5vdGlmaWNhdGlvbiA9IG5vdGljZUhvc3Qub2NjdXB5KENoYXRJbnB1dE5vdGljZUxhbmUuTm90aWZpY2F0aW9uKTtcblx0XHRsZXQgY2FyZHNDcmVhdGVkID0gMDtcblx0XHRvbmJvYXJkaW5nLnNob3dJZk5lZWRlZChjb250ZXh0ID0+IHtcblx0XHRcdGNhcmRzQ3JlYXRlZCsrO1xuXHRcdFx0cmV0dXJuIGNyZWF0ZUNhcmQoY29udGV4dCk7XG5cdFx0fSk7XG5cblx0XHQvLyBOb3RoaW5nIGlzIGJ1aWx0LCBhbm5vdW5jZWQgb3IgcmVjb3JkZWQgd2hpbGUgdGhlIGNhcmQgY291bGQgbm90IGJlIHNlZW46XG5cdFx0Ly8gdGhlIG9uZSBmaXJzdC1ydW4gc2hvd2luZyBpcyBub3Qgc3BlbnQgb24gYSBzcGFjZSB0aGUgdXNlciBuZXZlciBzYXcuXG5cdFx0Y29uc3Qgd2hpbGVUYWtlbiA9IHtcblx0XHRcdGNhcmRzQ3JlYXRlZCxcblx0XHRcdGFubm91bmNlQ2FsbHMsXG5cdFx0XHRzZWVuOiBzdG9yYWdlU2VydmljZS5nZXRCb29sZWFuKCd0ZXN0LmNoYXRJbnB1dE9uYm9hcmRpbmcuZGVmZXJXaGVuVGFrZW4nLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04sIGZhbHNlKSxcblx0XHRcdGlzVmlzaWJsZTogb25ib2FyZGluZy5pc1Zpc2libGUsXG5cdFx0fTtcblx0XHRub3RpZmljYXRpb24uZGlzcG9zZSgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHtcblx0XHRcdFx0d2hpbGVUYWtlbixcblx0XHRcdFx0YWZ0ZXJGcmVlZDoge1xuXHRcdFx0XHRcdGNhcmRzQ3JlYXRlZCxcblx0XHRcdFx0XHRhbm5vdW5jZUNhbGxzLFxuXHRcdFx0XHRcdHNlZW46IHN0b3JhZ2VTZXJ2aWNlLmdldEJvb2xlYW4oJ3Rlc3QuY2hhdElucHV0T25ib2FyZGluZy5kZWZlcldoZW5UYWtlbicsIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgZmFsc2UpLFxuXHRcdFx0XHRcdGlzVmlzaWJsZTogb25ib2FyZGluZy5pc1Zpc2libGUsXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHR3aGlsZVRha2VuOiB7IGNhcmRzQ3JlYXRlZDogMCwgYW5ub3VuY2VDYWxsczogMCwgc2VlbjogZmFsc2UsIGlzVmlzaWJsZTogZmFsc2UgfSxcblx0XHRcdFx0YWZ0ZXJGcmVlZDogeyBjYXJkc0NyZWF0ZWQ6IDEsIGFubm91bmNlQ2FsbHM6IDEsIHNlZW46IHRydWUsIGlzVmlzaWJsZTogdHJ1ZSB9LFxuXHRcdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N0YW5kcyBkb3duIHdoaWxlIHRoZSBzcGFjZSBpcyB0YWtlbiBhbmQgY29tZXMgYmFjayB3aXRob3V0IHJlYnVpbGRpbmcnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgb25ib2FyZGluZyA9IGNyZWF0ZU9uYm9hcmRpbmcoZGlzcG9zYWJsZXMsICd0ZXN0LmNoYXRJbnB1dE9uYm9hcmRpbmcuc3RhbmRzRG93bicpO1xuXHRcdGNvbnN0IGhvc3QgPSBjcmVhdGVIb3N0KGRpc3Bvc2FibGVzKTtcblx0XHRjb25zdCBub3RpY2VIb3N0ID0gY3JlYXRlTm90aWNlSG9zdChkaXNwb3NhYmxlcyk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKG9uYm9hcmRpbmcucmVnaXN0ZXJIb3N0KHtcblx0XHRcdGNvbnRhaW5lcjogaG9zdC5jb250YWluZXIsXG5cdFx0XHRmb2N1c1Jvb3Q6IGhvc3Qucm9vdCxcblx0XHRcdGNsYWltTm90aWNlOiBjcmVhdGVDbGFpbShub3RpY2VIb3N0KSxcblx0XHR9KSk7XG5cblx0XHRsZXQgY2FyZHNDcmVhdGVkID0gMDtcblx0XHRvbmJvYXJkaW5nLnNob3dJZk5lZWRlZChjb250ZXh0ID0+IHtcblx0XHRcdGNhcmRzQ3JlYXRlZCsrO1xuXHRcdFx0cmV0dXJuIGNyZWF0ZUNhcmQoY29udGV4dCk7XG5cdFx0fSk7XG5cblx0XHRjb25zdCB3aGlsZUZyZWUgPSBvbmJvYXJkaW5nLmlzVmlzaWJsZTtcblx0XHRjb25zdCBub3RpZmljYXRpb24gPSBub3RpY2VIb3N0Lm9jY3VweShDaGF0SW5wdXROb3RpY2VMYW5lLk5vdGlmaWNhdGlvbik7XG5cdFx0Y29uc3Qgd2hpbGVUYWtlbiA9IHsgaXNWaXNpYmxlOiBvbmJvYXJkaW5nLmlzVmlzaWJsZSwgY2FyZHM6IHZpc2libGVDYXJkcyhob3N0LmNvbnRhaW5lcikgfTtcblx0XHQvLyBUaGUgY2FyZCBpcyBvbmx5IHB1dCBhd2F5LCBzbyB0aGUgdGlwIG11c3Qgbm90IG1vdmUgaW50byB0aGUgc3BhY2UuXG5cdFx0Y29uc3QgdGlwV2hpbGVUYWtlbiA9IGxhbmVDbGFpbWVkKG5vdGljZUhvc3QpO1xuXHRcdG5vdGlmaWNhdGlvbi5kaXNwb3NlKCk7XG5cblx0XHQvLyBPbmUgY2FyZCwgYnVpbHQgYW5kIGFubm91bmNlZCBvbmNlOiBzdGFuZGluZyBkb3duIGhpZGVzIGl0IHJhdGhlciB0aGFuXG5cdFx0Ly8gdGVhcmluZyBpdCBkb3duLCBzbyBpbi1mbGlnaHQgc3RhdGUgc3Vydml2ZXMgYW5kIGl0IGlzIG5vdCByZS1hbm5vdW5jZWQuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHsgd2hpbGVGcmVlLCB3aGlsZVRha2VuLCB0aXBXaGlsZVRha2VuLCBhZnRlckZyZWVkOiBvbmJvYXJkaW5nLmlzVmlzaWJsZSwgY2FyZHNDcmVhdGVkLCBhbm5vdW5jZUNhbGxzIH0sXG5cdFx0XHR7XG5cdFx0XHRcdHdoaWxlRnJlZTogdHJ1ZSxcblx0XHRcdFx0d2hpbGVUYWtlbjogeyBpc1Zpc2libGU6IGZhbHNlLCBjYXJkczogMCB9LFxuXHRcdFx0XHR0aXBXaGlsZVRha2VuOiB0cnVlLFxuXHRcdFx0XHRhZnRlckZyZWVkOiB0cnVlLFxuXHRcdFx0XHRjYXJkc0NyZWF0ZWQ6IDEsXG5cdFx0XHRcdGFubm91bmNlQ2FsbHM6IDEsXG5cdFx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnc3RhbmRzIHRoZSBjYXJkXFwncyBsaXZlIHBhcnRzIGRvd24gd2hpbGUgaXQgaXMgcHV0IGF3YXknLCAoKSA9PiB7XG5cdFx0Y29uc3Qgb25ib2FyZGluZyA9IGNyZWF0ZU9uYm9hcmRpbmcoZGlzcG9zYWJsZXMsICd0ZXN0LmNoYXRJbnB1dE9uYm9hcmRpbmcuc3VzcGVuZHMnKTtcblx0XHRjb25zdCBob3N0ID0gY3JlYXRlSG9zdChkaXNwb3NhYmxlcyk7XG5cdFx0Y29uc3Qgbm90aWNlSG9zdCA9IGNyZWF0ZU5vdGljZUhvc3QoZGlzcG9zYWJsZXMpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChvbmJvYXJkaW5nLnJlZ2lzdGVySG9zdCh7XG5cdFx0XHRjb250YWluZXI6IGhvc3QuY29udGFpbmVyLFxuXHRcdFx0Zm9jdXNSb290OiBob3N0LnJvb3QsXG5cdFx0XHRjbGFpbU5vdGljZTogY3JlYXRlQ2xhaW0obm90aWNlSG9zdCksXG5cdFx0fSkpO1xuXG5cdFx0Ly8gVGhlIGNhcmQgaXMga2VwdCBhbGl2ZSB3aGlsZSBkaXNwbGFjZWQsIHNvIGFueXRoaW5nIGl0IHJ1bnMgd2hpbGUgb25cblx0XHQvLyBzY3JlZW4gLSBtaWNyb3Bob25lIGNhcHR1cmUsIGF1ZGlvLCBhbmltYXRpb24gLSBoYXMgdG8gYmUgdG9sZCB0byBzdG9wLlxuXHRcdC8vIE90aGVyd2lzZSBhIGhpZGRlbiBpbnRyb2R1Y3Rpb24gaG9sZHMgdGhlIG1pY3JvcGhvbmUgb3Blbi5cblx0XHRjb25zdCB2aXNpYmlsaXR5OiBib29sZWFuW10gPSBbXTtcblx0XHRvbmJvYXJkaW5nLnNob3dJZk5lZWRlZChjb250ZXh0ID0+ICh7XG5cdFx0XHQuLi5jcmVhdGVDYXJkKGNvbnRleHQpLFxuXHRcdFx0c2V0VmlzaWJsZTogKHZpc2libGU6IGJvb2xlYW4pID0+IHZpc2liaWxpdHkucHVzaCh2aXNpYmxlKSxcblx0XHR9KSk7XG5cdFx0Y29uc3Qgbm90aWZpY2F0aW9uID0gbm90aWNlSG9zdC5vY2N1cHkoQ2hhdElucHV0Tm90aWNlTGFuZS5Ob3RpZmljYXRpb24pO1xuXHRcdG5vdGlmaWNhdGlvbi5kaXNwb3NlKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpc2liaWxpdHksIFtmYWxzZSwgdHJ1ZV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2NrcyB0byB0aGUgaW5wdXQgdGhlIHVzZXIgaXMgaW4sIGV2ZW4gYmVmb3JlIGl0IGlzIHRoZSBtb3N0IHJlY2VudCcsICgpID0+IHtcblx0XHRjb25zdCBvbmJvYXJkaW5nID0gY3JlYXRlT25ib2FyZGluZyhkaXNwb3NhYmxlcywgJ3Rlc3QuY2hhdElucHV0T25ib2FyZGluZy5waWNrc0ZvY3VzZWQnKTtcblx0XHRjb25zdCBzdG9yZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRcdGNvbnN0IG5vdGljZUhvc3QgPSBjcmVhdGVOb3RpY2VIb3N0KHN0b3JlKTtcblx0XHRjb25zdCBmaXJzdCA9IGNyZWF0ZUhvc3Qoc3RvcmUpO1xuXHRcdGNvbnN0IHNlY29uZCA9IGNyZWF0ZUhvc3Qoc3RvcmUpO1xuXHRcdHN0b3JlLmFkZChvbmJvYXJkaW5nLnJlZ2lzdGVySG9zdCh7IGNvbnRhaW5lcjogZmlyc3QuY29udGFpbmVyLCBmb2N1c1Jvb3Q6IGZpcnN0LnJvb3QsIGNsYWltTm90aWNlOiBjcmVhdGVDbGFpbShub3RpY2VIb3N0KSB9KSk7XG5cdFx0c3RvcmUuYWRkKG9uYm9hcmRpbmcucmVnaXN0ZXJIb3N0KHsgY29udGFpbmVyOiBzZWNvbmQuY29udGFpbmVyLCBmb2N1c1Jvb3Q6IHNlY29uZC5yb290LCBjbGFpbU5vdGljZTogY3JlYXRlQ2xhaW0obm90aWNlSG9zdCkgfSkpO1xuXG5cdFx0Ly8gUmVhbCBmb2N1cyBvbmx5OiBubyBzeW50aGV0aWMgZm9jdXMgZXZlbnQsIHNvIG5laXRoZXIgaW5wdXQgaGFzIHJlY29yZGVkXG5cdFx0Ly8gYW55IHJlY2VuY3kuIFRoZSBvbmUgaG9sZGluZyBmb2N1cyBpcyBzdGlsbCB0aGUgb25lIHRoZSB1c2VyIHdvdWxkIHNlZSBhXG5cdFx0Ly8gY2FyZCBpbiwgc28gcmFua2luZyBieSByZWNlbmN5IGFsb25lIGlzIG5vdCBlbm91Z2guXG5cdFx0c2Vjb25kLnJvb3QuZm9jdXMoKTtcblx0XHRvbmJvYXJkaW5nLnNob3coY3JlYXRlQ2FyZCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0eyBmaXJzdDogdmlzaWJsZUNhcmRzKGZpcnN0LmNvbnRhaW5lciksIHNlY29uZDogdmlzaWJsZUNhcmRzKHNlY29uZC5jb250YWluZXIpIH0sXG5cdFx0XHR7IGZpcnN0OiAwLCBzZWNvbmQ6IDEgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2EgZGlzbWlzc2VkIGNhcmQgZG9lcyBub3QgY29tZSBiYWNrIHdoZW4gdGhlIHNwYWNlIGZyZWVzJywgKCkgPT4ge1xuXHRcdGNvbnN0IG9uYm9hcmRpbmcgPSBjcmVhdGVPbmJvYXJkaW5nKGRpc3Bvc2FibGVzLCAndGVzdC5jaGF0SW5wdXRPbmJvYXJkaW5nLmRpc21pc3NlZFN0YXlzR29uZScpO1xuXHRcdGNvbnN0IGhvc3QgPSBjcmVhdGVIb3N0KGRpc3Bvc2FibGVzKTtcblx0XHRjb25zdCBub3RpY2VIb3N0ID0gY3JlYXRlTm90aWNlSG9zdChkaXNwb3NhYmxlcyk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKG9uYm9hcmRpbmcucmVnaXN0ZXJIb3N0KHtcblx0XHRcdGNvbnRhaW5lcjogaG9zdC5jb250YWluZXIsXG5cdFx0XHRmb2N1c1Jvb3Q6IGhvc3Qucm9vdCxcblx0XHRcdGNsYWltTm90aWNlOiBjcmVhdGVDbGFpbShub3RpY2VIb3N0KSxcblx0XHR9KSk7XG5cblx0XHRsZXQgZGlzbWlzczogKCgpID0+IHZvaWQpIHwgdW5kZWZpbmVkO1xuXHRcdG9uYm9hcmRpbmcuc2hvd0lmTmVlZGVkKGNvbnRleHQgPT4ge1xuXHRcdFx0ZGlzbWlzcyA9ICgpID0+IGNvbnRleHQuZGlzbWlzcyhmYWxzZSk7XG5cdFx0XHRyZXR1cm4gY3JlYXRlQ2FyZChjb250ZXh0KTtcblx0XHR9KTtcblx0XHRkaXNtaXNzISgpO1xuXHRcdGNvbnN0IG5vdGlmaWNhdGlvbiA9IG5vdGljZUhvc3Qub2NjdXB5KENoYXRJbnB1dE5vdGljZUxhbmUuTm90aWZpY2F0aW9uKTtcblx0XHRub3RpZmljYXRpb24uZGlzcG9zZSgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHsgaXNWaXNpYmxlOiBvbmJvYXJkaW5nLmlzVmlzaWJsZSwgbGFuZUNsYWltZWQ6IGxhbmVDbGFpbWVkKG5vdGljZUhvc3QpIH0sXG5cdFx0XHR7IGlzVmlzaWJsZTogZmFsc2UsIGxhbmVDbGFpbWVkOiBmYWxzZSB9KTtcblx0fSk7XG5cblx0dGVzdCgnb25seSB0aGUgbmV3ZXN0IGludHJvZHVjdGlvbiBpcyBvbiBzY3JlZW4sIGFuZCB0aGUgb3RoZXIgcmV0dXJucyBhZnRlciBpdCcsICgpID0+IHtcblx0XHRjb25zdCBzdG9yZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gd29ya2JlbmNoSW5zdGFudGlhdGlvblNlcnZpY2UodW5kZWZpbmVkLCBzdG9yZSk7XG5cdFx0Y29uc3QgbWFrZSA9IChzdG9yYWdlS2V5OiBzdHJpbmcpID0+IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0SW5wdXRPbmJvYXJkaW5nLCB7XG5cdFx0XHRzdG9yYWdlS2V5LFxuXHRcdH0pKTtcblx0XHRjb25zdCBmaXJzdCA9IG1ha2UoJ3Rlc3QuY2hhdElucHV0T25ib2FyZGluZy5pbnRyb0EnKTtcblx0XHRjb25zdCBzZWNvbmQgPSBtYWtlKCd0ZXN0LmNoYXRJbnB1dE9uYm9hcmRpbmcuaW50cm9CJyk7XG5cdFx0Y29uc3QgaG9zdCA9IGNyZWF0ZUhvc3Qoc3RvcmUpO1xuXHRcdGNvbnN0IG5vdGljZUhvc3QgPSBjcmVhdGVOb3RpY2VIb3N0KHN0b3JlKTtcblx0XHQvLyBFYWNoIGludHJvZHVjdGlvbiBvd25zIGl0cyBvd24gY29udGFpbmVyLCBhcyB2b2ljZSBhbmQgZGljdGF0aW9uIGRvLlxuXHRcdGNvbnN0IGZpcnN0Q29udGFpbmVyID0gaG9zdC5hZGRDb250YWluZXIoKTtcblx0XHRjb25zdCBzZWNvbmRDb250YWluZXIgPSBob3N0LmFkZENvbnRhaW5lcigpO1xuXHRcdGNvbnN0IGNsYWltID0gY3JlYXRlQ2xhaW0obm90aWNlSG9zdCk7XG5cdFx0c3RvcmUuYWRkKGZpcnN0LnJlZ2lzdGVySG9zdCh7IGNvbnRhaW5lcjogZmlyc3RDb250YWluZXIsIGZvY3VzUm9vdDogaG9zdC5yb290LCBjbGFpbU5vdGljZTogY2xhaW0gfSkpO1xuXHRcdHN0b3JlLmFkZChzZWNvbmQucmVnaXN0ZXJIb3N0KHsgY29udGFpbmVyOiBzZWNvbmRDb250YWluZXIsIGZvY3VzUm9vdDogaG9zdC5yb290LCBjbGFpbU5vdGljZTogY2xhaW0gfSkpO1xuXG5cdFx0bGV0IGRpc21pc3NTZWNvbmQ6ICgoKSA9PiB2b2lkKSB8IHVuZGVmaW5lZDtcblx0XHRmaXJzdC5zaG93SWZOZWVkZWQoY3JlYXRlQ2FyZCk7XG5cdFx0c2Vjb25kLnNob3dJZk5lZWRlZChjb250ZXh0ID0+IHtcblx0XHRcdGRpc21pc3NTZWNvbmQgPSAoKSA9PiBjb250ZXh0LmRpc21pc3MoZmFsc2UpO1xuXHRcdFx0cmV0dXJuIGNyZWF0ZUNhcmQoY29udGV4dCk7XG5cdFx0fSk7XG5cdFx0Ly8gVHdvIGludHJvZHVjdGlvbnMgc2hhcmUgdGhlIG9uYm9hcmRpbmcgbGFuZSwgc28gdGhlIG5ld2VyIG9uZSB0YWtlcyB0aGVcblx0XHQvLyBzcGFjZSB0aHJvdWdoIHRoZSBzYW1lIG1lY2hhbmlzbSBhIG5vdGlmaWNhdGlvbiB3b3VsZC5cblx0XHRjb25zdCB3aGlsZUJvdGhXYW50ID0geyBmaXJzdDogZmlyc3QuaXNWaXNpYmxlLCBzZWNvbmQ6IHNlY29uZC5pc1Zpc2libGUgfTtcblx0XHRkaXNtaXNzU2Vjb25kISgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHsgd2hpbGVCb3RoV2FudCwgYWZ0ZXJTZWNvbmREaXNtaXNzZWQ6IHsgZmlyc3Q6IGZpcnN0LmlzVmlzaWJsZSwgc2Vjb25kOiBzZWNvbmQuaXNWaXNpYmxlIH0gfSxcblx0XHRcdHsgd2hpbGVCb3RoV2FudDogeyBmaXJzdDogZmFsc2UsIHNlY29uZDogdHJ1ZSB9LCBhZnRlclNlY29uZERpc21pc3NlZDogeyBmaXJzdDogdHJ1ZSwgc2Vjb25kOiBmYWxzZSB9IH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdtb3ZpbmcgYW4gaW50cm9kdWN0aW9uIHRvIGFub3RoZXIgaW5wdXQgZG9lcyBub3QgcHV0IHRoZSBuZXcgY2FyZCBhd2F5JywgKCkgPT4ge1xuXHRcdGNvbnN0IG9uYm9hcmRpbmcgPSBjcmVhdGVPbmJvYXJkaW5nKGRpc3Bvc2FibGVzLCAndGVzdC5jaGF0SW5wdXRPbmJvYXJkaW5nLm1vdmVzSG9zdHMnKTtcblx0XHRjb25zdCBzdG9yZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRcdC8vIFR3byBjaGF0IGlucHV0cywgZWFjaCB3aXRoIGl0cyBvd24gbm90aWNlIGhvc3QgLSBhIHBhbmVsIGFuZCBhbiBlZGl0b3IsXG5cdFx0Ly8gb3IgYSBzZWNvbmQgQWdlbnRzIHdpbmRvdyBjb21wb3Nlci5cblx0XHRjb25zdCBmaXJzdCA9IGNyZWF0ZUhvc3Qoc3RvcmUpO1xuXHRcdGNvbnN0IHNlY29uZCA9IGNyZWF0ZUhvc3Qoc3RvcmUpO1xuXHRcdGNvbnN0IGZpcnN0Tm90aWNlSG9zdCA9IGNyZWF0ZU5vdGljZUhvc3Qoc3RvcmUpO1xuXHRcdGNvbnN0IHNlY29uZE5vdGljZUhvc3QgPSBjcmVhdGVOb3RpY2VIb3N0KHN0b3JlKTtcblx0XHRzdG9yZS5hZGQob25ib2FyZGluZy5yZWdpc3Rlckhvc3QoeyBjb250YWluZXI6IGZpcnN0LmNvbnRhaW5lciwgZm9jdXNSb290OiBmaXJzdC5yb290LCBjbGFpbU5vdGljZTogY3JlYXRlQ2xhaW0oZmlyc3ROb3RpY2VIb3N0KSB9KSk7XG5cdFx0b25ib2FyZGluZy5zaG93KGNyZWF0ZUNhcmQpO1xuXG5cdFx0Ly8gVGhlIHNlY29uZCBpbnB1dCBiZWNvbWVzIHRoZSBtb3N0IHJlY2VudGx5IGZvY3VzZWQgb25lLCBzbyBhbiBleHBsaWNpdFxuXHRcdC8vIHJlLXNob3cgbW92ZXMgdGhlIGNhcmQgdGhlcmUuIFJlbGVhc2luZyB0aGUgY2xhaW0gbGVmdCBiZWhpbmQgb24gdGhlXG5cdFx0Ly8gZmlyc3QgaW5wdXQgbXVzdCBub3QgYmUgbWlzdGFrZW4gZm9yIHRoZSBuZXcgY2FyZCBzdGFuZGluZyBkb3duLlxuXHRcdHN0b3JlLmFkZChvbmJvYXJkaW5nLnJlZ2lzdGVySG9zdCh7IGNvbnRhaW5lcjogc2Vjb25kLmNvbnRhaW5lciwgZm9jdXNSb290OiBzZWNvbmQucm9vdCwgY2xhaW1Ob3RpY2U6IGNyZWF0ZUNsYWltKHNlY29uZE5vdGljZUhvc3QpIH0pKTtcblx0XHQvLyBUaGUgcmVuZGVyZXIgcnVubmluZyB0aGVzZSB0ZXN0cyBkb2VzIG5vdCByZWxpYWJseSBoYW5kIG91dCByZWFsIGZvY3VzLFxuXHRcdC8vIHNvIHJhaXNlIHRoZSBzYW1lIGV2ZW50IHRoZSBmb2N1cyB0cmFja2VyIGxpc3RlbnMgZm9yLlxuXHRcdHNlY29uZC5yb290LmZvY3VzKCk7XG5cdFx0c2Vjb25kLnJvb3QuZGlzcGF0Y2hFdmVudChuZXcgRm9jdXNFdmVudCgnZm9jdXMnKSk7XG5cdFx0b25ib2FyZGluZy5zaG93KGNyZWF0ZUNhcmQpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHtcblx0XHRcdFx0aXNWaXNpYmxlOiBvbmJvYXJkaW5nLmlzVmlzaWJsZSxcblx0XHRcdFx0bW92ZWRPZmY6IHZpc2libGVDYXJkcyhmaXJzdC5jb250YWluZXIpLFxuXHRcdFx0XHRtb3ZlZFRvOiB2aXNpYmxlQ2FyZHMoc2Vjb25kLmNvbnRhaW5lciksXG5cdFx0XHR9LFxuXHRcdFx0eyBpc1Zpc2libGU6IHRydWUsIG1vdmVkT2ZmOiAwLCBtb3ZlZFRvOiAxIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdhbHRlcm5hdGluZyBpbnRyb2R1Y3Rpb25zIHNldHRsZSBpbnN0ZWFkIG9mIHJlb3BlbmluZyBmb3JldmVyJywgKCkgPT4ge1xuXHRcdGNvbnN0IHN0b3JlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSh1bmRlZmluZWQsIHN0b3JlKTtcblx0XHRjb25zdCBtYWtlID0gKHN0b3JhZ2VLZXk6IHN0cmluZykgPT4gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRJbnB1dE9uYm9hcmRpbmcsIHtcblx0XHRcdHN0b3JhZ2VLZXksXG5cdFx0fSkpO1xuXHRcdGNvbnN0IGZpcnN0ID0gbWFrZSgndGVzdC5jaGF0SW5wdXRPbmJvYXJkaW5nLnBpbmdBJyk7XG5cdFx0Y29uc3Qgc2Vjb25kID0gbWFrZSgndGVzdC5jaGF0SW5wdXRPbmJvYXJkaW5nLnBpbmdCJyk7XG5cdFx0Y29uc3QgaG9zdCA9IGNyZWF0ZUhvc3Qoc3RvcmUpO1xuXHRcdGNvbnN0IG5vdGljZUhvc3QgPSBjcmVhdGVOb3RpY2VIb3N0KHN0b3JlKTtcblx0XHRjb25zdCBjbGFpbSA9IGNyZWF0ZUNsYWltKG5vdGljZUhvc3QpO1xuXHRcdHN0b3JlLmFkZChmaXJzdC5yZWdpc3Rlckhvc3QoeyBjb250YWluZXI6IGhvc3QuYWRkQ29udGFpbmVyKCksIGZvY3VzUm9vdDogaG9zdC5yb290LCBjbGFpbU5vdGljZTogY2xhaW0gfSkpO1xuXHRcdHN0b3JlLmFkZChzZWNvbmQucmVnaXN0ZXJIb3N0KHsgY29udGFpbmVyOiBob3N0LmFkZENvbnRhaW5lcigpLCBmb2N1c1Jvb3Q6IGhvc3Qucm9vdCwgY2xhaW1Ob3RpY2U6IGNsYWltIH0pKTtcblxuXHRcdC8vIEVhY2ggaW50cm9kdWN0aW9uIGlzIGJ1aWx0IGF0IG1vc3Qgb25jZTogc3RhbmRpbmcgZG93biBmb3IgdGhlIG90aGVyIG5vXG5cdFx0Ly8gbG9uZ2VyIGhhbmRzIGJhY2sgYSBmaXJzdC1ydW4gc2hvd2luZywgc28gdGhlcmUgaXMgbm90aGluZyB0byBwaW5nLXBvbmcuXG5cdFx0bGV0IGNhcmRzQ3JlYXRlZCA9IDA7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCAxMDsgaSsrKSB7XG5cdFx0XHRjb25zdCBvbmJvYXJkaW5nID0gaSAlIDIgPT09IDAgPyBmaXJzdCA6IHNlY29uZDtcblx0XHRcdG9uYm9hcmRpbmcuc2hvd0lmTmVlZGVkKGNvbnRleHQgPT4ge1xuXHRcdFx0XHRjYXJkc0NyZWF0ZWQrKztcblx0XHRcdFx0cmV0dXJuIGNyZWF0ZUNhcmQoY29udGV4dCk7XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2FyZHNDcmVhdGVkLCAyKTtcblx0fSk7XG5cblx0dGVzdCgnYSBjYXJkIHRoYXQgZmFpbHMgdG8gYnVpbGQgcmVsZWFzZXMgdGhlIHNwYWNlIGl0IHdhcyBzdGFuZGluZyBvbicsICgpID0+IHtcblx0XHQvLyBgYnVpbGQoKWAgcnVucyBmcm9tIHRoZSBob3N0IHJlcG9ydGluZyB0aGF0IHdlIGxlYWQsIHdoaWNoIGhhcHBlbnMgYmVmb3JlXG5cdFx0Ly8gdGhlIGNsYWltIGRpc3Bvc2FibGUgaXMgaW4gaGFuZC4gQSB0aHJvdyB0aGVyZSBtdXN0IG5vdCBzdHJhbmQgdGhlIGNsYWltOlxuXHRcdC8vIHRoZSBsYW5lIHdvdWxkIHN0YXkgb2NjdXBpZWQgZm9yZXZlciB3aXRoIG5vdGhpbmcgb24gc2NyZWVuLCBzaWxlbnRseVxuXHRcdC8vIHN1cHByZXNzaW5nIGV2ZXJ5dGhpbmcgYmVsb3cgaXQuXG5cdFx0Y29uc3Qgb25ib2FyZGluZyA9IGNyZWF0ZU9uYm9hcmRpbmcoZGlzcG9zYWJsZXMsICd0ZXN0LmNoYXRJbnB1dE9uYm9hcmRpbmcuYnVpbGRUaHJvd3MnKTtcblx0XHRjb25zdCBob3N0ID0gY3JlYXRlSG9zdChkaXNwb3NhYmxlcyk7XG5cdFx0Y29uc3Qgbm90aWNlSG9zdCA9IGNyZWF0ZU5vdGljZUhvc3QoZGlzcG9zYWJsZXMpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChvbmJvYXJkaW5nLnJlZ2lzdGVySG9zdCh7XG5cdFx0XHRjb250YWluZXI6IGhvc3QuY29udGFpbmVyLFxuXHRcdFx0Zm9jdXNSb290OiBob3N0LnJvb3QsXG5cdFx0XHRjbGFpbU5vdGljZTogY3JlYXRlQ2xhaW0obm90aWNlSG9zdCksXG5cdFx0fSkpO1xuXG5cdFx0Y29uc3Qgb3JpZ2luYWxIYW5kbGVyID0gZXJyb3JIYW5kbGVyLmdldFVuZXhwZWN0ZWRFcnJvckhhbmRsZXIoKTtcblx0XHRjb25zdCByZXBvcnRlZDogc3RyaW5nW10gPSBbXTtcblx0XHRzZXRVbmV4cGVjdGVkRXJyb3JIYW5kbGVyKGVycm9yID0+IHJlcG9ydGVkLnB1c2goKGVycm9yIGFzIEVycm9yKS5tZXNzYWdlKSk7XG5cdFx0dHJ5IHtcblx0XHRcdG9uYm9hcmRpbmcuc2hvd0lmTmVlZGVkKCgpID0+IHsgdGhyb3cgbmV3IEVycm9yKCdjYXJkIGV4cGxvZGVkJyk7IH0pO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRzZXRVbmV4cGVjdGVkRXJyb3JIYW5kbGVyKG9yaWdpbmFsSGFuZGxlcik7XG5cdFx0fVxuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHtcblx0XHRcdFx0cmVwb3J0ZWQsXG5cdFx0XHRcdGlzVmlzaWJsZTogb25ib2FyZGluZy5pc1Zpc2libGUsXG5cdFx0XHRcdGxhbmVDbGFpbWVkOiBsYW5lQ2xhaW1lZChub3RpY2VIb3N0KSxcblx0XHRcdFx0c2hvd2luZzogaXNDaGF0SW5wdXRTdGFja1Nsb3RTaG93aW5nKGhvc3QuY29udGFpbmVyKSxcblx0XHRcdH0sXG5cdFx0XHR7IHJlcG9ydGVkOiBbJ2NhcmQgZXhwbG9kZWQnXSwgaXNWaXNpYmxlOiBmYWxzZSwgbGFuZUNsYWltZWQ6IGZhbHNlLCBzaG93aW5nOiBmYWxzZSB9KTtcblx0fSk7XG5cblx0dGVzdCgnYSBjYXJkIHRoYXQgaXMgdGFrZW4gZG93biB3aGlsZSBidWlsZGluZyBpcyBub3QgaW5zdGFsbGVkIGFueXdheScsICgpID0+IHtcblx0XHQvLyBUaGUgZmFjdG9yeSBjYW4gc3luY2hyb25vdXNseSB0YWtlIHRoZSBjYXJkIGRvd24gLSBieSBkaXNtaXNzaW5nIHN0cmFpZ2h0XG5cdFx0Ly8gYXdheSwgb3IgYmVjYXVzZSB0aGUgaW5wdXQgaXQgaXMgZG9ja2VkIHRvIGdvZXMgYXdheSBtaWQtY29uc3RydWN0aW9uLlxuXHRcdC8vIENvbW1pdHRpbmcgaXQgcmVnYXJkbGVzcyB3b3VsZCBzaG93IGEgY2FyZCBpbiBhbiB1bnJlZ2lzdGVyZWQgaG9zdCBhbmRcblx0XHQvLyBzcGVuZCBpdHMgb25lIHNob3dpbmcuXG5cdFx0Y29uc3Qgc3RvcmUgPSBkaXNwb3NhYmxlcy5hZGQobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlKHVuZGVmaW5lZCwgc3RvcmUpO1xuXHRcdGNvbnN0IHN0b3JhZ2VTZXJ2aWNlID0gaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElTdG9yYWdlU2VydmljZSk7XG5cdFx0Y29uc3Qgb25ib2FyZGluZyA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0SW5wdXRPbmJvYXJkaW5nLCB7XG5cdFx0XHRzdG9yYWdlS2V5OiAndGVzdC5jaGF0SW5wdXRPbmJvYXJkaW5nLmNhbmNlbGxlZFdoaWxlQnVpbGRpbmcnLFxuXHRcdH0pKTtcblx0XHRjb25zdCBob3N0ID0gY3JlYXRlSG9zdChzdG9yZSk7XG5cdFx0Y29uc3Qgbm90aWNlSG9zdCA9IGNyZWF0ZU5vdGljZUhvc3Qoc3RvcmUpO1xuXHRcdGNvbnN0IHJlZ2lzdHJhdGlvbiA9IHN0b3JlLmFkZChvbmJvYXJkaW5nLnJlZ2lzdGVySG9zdCh7XG5cdFx0XHRjb250YWluZXI6IGhvc3QuY29udGFpbmVyLFxuXHRcdFx0Zm9jdXNSb290OiBob3N0LnJvb3QsXG5cdFx0XHRjbGFpbU5vdGljZTogY3JlYXRlQ2xhaW0obm90aWNlSG9zdCksXG5cdFx0fSkpO1xuXG5cdFx0b25ib2FyZGluZy5zaG93SWZOZWVkZWQoY29udGV4dCA9PiB7XG5cdFx0XHRjb25zdCBjYXJkID0gY3JlYXRlQ2FyZChjb250ZXh0KTtcblx0XHRcdHJlZ2lzdHJhdGlvbi5kaXNwb3NlKCk7XG5cdFx0XHRyZXR1cm4gY2FyZDtcblx0XHR9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHR7XG5cdFx0XHRcdGlzVmlzaWJsZTogb25ib2FyZGluZy5pc1Zpc2libGUsXG5cdFx0XHRcdGNhcmRzOiBob3N0LmNvbnRhaW5lci5xdWVyeVNlbGVjdG9yQWxsKCcuY2hhdC1pbnB1dC1vbmJvYXJkaW5nLWNhcmQnKS5sZW5ndGgsXG5cdFx0XHRcdHNob3dpbmc6IGlzQ2hhdElucHV0U3RhY2tTbG90U2hvd2luZyhob3N0LmNvbnRhaW5lciksXG5cdFx0XHRcdGxhbmVDbGFpbWVkOiBsYW5lQ2xhaW1lZChub3RpY2VIb3N0KSxcblx0XHRcdFx0YW5ub3VuY2VDYWxscyxcblx0XHRcdFx0c2Vlbjogc3RvcmFnZVNlcnZpY2UuZ2V0Qm9vbGVhbigndGVzdC5jaGF0SW5wdXRPbmJvYXJkaW5nLmNhbmNlbGxlZFdoaWxlQnVpbGRpbmcnLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04sIGZhbHNlKSxcblx0XHRcdH0sXG5cdFx0XHR7IGlzVmlzaWJsZTogZmFsc2UsIGNhcmRzOiAwLCBzaG93aW5nOiBmYWxzZSwgbGFuZUNsYWltZWQ6IGZhbHNlLCBhbm5vdW5jZUNhbGxzOiAwLCBzZWVuOiBmYWxzZSB9KTtcblx0fSk7XG5cblx0dGVzdCgnYW5ub3VuY2VzIG9uY2Ugb24gc2hvdycsICgpID0+IHtcblx0XHRjb25zdCBvbmJvYXJkaW5nID0gY3JlYXRlT25ib2FyZGluZyhkaXNwb3NhYmxlcywgJ3Rlc3QuY2hhdElucHV0T25ib2FyZGluZy5hbm5vdW5jZXMnKTtcblx0XHRjb25zdCBob3N0ID0gY3JlYXRlSG9zdChkaXNwb3NhYmxlcyk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKG9uYm9hcmRpbmcucmVnaXN0ZXJIb3N0KHsgY29udGFpbmVyOiBob3N0LmNvbnRhaW5lciwgZm9jdXNSb290OiBob3N0LnJvb3QgfSkpO1xuXG5cdFx0Y29uc3Qgc2hvd24gPSBvbmJvYXJkaW5nLnNob3coY3JlYXRlQ2FyZCk7XG5cdFx0b25ib2FyZGluZy5zaG93SWZOZWVkZWQoY3JlYXRlQ2FyZCk7IC8vIG5vLW9wIHdoaWxlIGFscmVhZHkgdmlzaWJsZSwgbXVzdCBub3QgcmUtYW5ub3VuY2VcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHR7IHNob3duLCBhbm5vdW5jZUNhbGxzIH0sXG5cdFx0XHR7IHNob3duOiB0cnVlLCBhbm5vdW5jZUNhbGxzOiAxIH0pO1xuXHR9KTtcblxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsY0FBYyxpQ0FBaUM7QUFDeEQsU0FBUyxpQkFBaUIsb0JBQW9CO0FBQzlDLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMscUNBQXFDO0FBQzlDLFNBQVMsaUJBQWlCLG9CQUFvQjtBQUM5QyxTQUErQiwyQkFBd0Q7QUFDdkYsU0FBUyxxQkFBcUIsMkJBQTJCO0FBQ3pELFNBQVMsbUNBQW1DO0FBRTVDLE1BQU0seUJBQXlCLE1BQU07QUFFcEMsUUFBTSxjQUFjLHdDQUF3QztBQUU1RCxXQUFTLFdBQVcsT0FBaUg7QUFDcEksVUFBTSxPQUFPLElBQUksRUFBRSxLQUFLO0FBQ3hCLFNBQUssV0FBVztBQUNoQixVQUFNLFlBQVksSUFBSSxPQUFPLE1BQU0sSUFBSSxFQUFFLGtDQUFrQyxDQUFDO0FBQzVFLGFBQVMsS0FBSyxZQUFZLElBQUk7QUFDOUIsVUFBTSxJQUFJ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
