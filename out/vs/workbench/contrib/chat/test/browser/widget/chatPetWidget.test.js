import assert from "assert";
import sinon from "sinon";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { NullTelemetryServiceShape } from "../../../../../../platform/telemetry/common/telemetryUtils.js";
import { TestStorageService } from "../../../../../test/common/workbenchTestServices.js";
import { ChatPetService, getChatPetVariant } from "../../../browser/chatPetService.js";
import { CHAT_PET_CONFIRMATION_ATTENTION_DURATION, CHAT_PET_ICON_TRANSFORMATION_CHANCE, CHAT_PET_IDLE_SLEEP_DELAY, CHAT_PET_YAPPING_CHANCE, ChatPetDirectionChangeController, ChatPetFacingController, ChatPetHopController, advanceChatPetThrow, doesChatPetStateBlink, doesChatPetStateTrackCursor, getChatPetAnimationFrame, getChatPetBaseState, getChatPetBuddyName, getChatPetClickInteraction, getChatPetDefaultHorizontalPosition, getChatPetDragPosition, getChatPetFallDuration, getChatPetFallTarget, getChatPetFrameDurations, getChatPetGazeDirection, getChatPetHorizontalPosition, getChatPetPlatformTop, getChatPetRenderedState, getChatPetRespawnFrameDurations, getChatPetRestoredHorizontalPosition, getChatPetScale, getChatPetSpeechFrameDurations, getChatPetSpriteName, getChatPetThrowLanding, getChatPetThrowVelocity, getChatPetVerticalOffset, getChatPetWideSpriteHorizontalOffset, isChatPetImageSource, isChatPetKeyboardInteractionEnabled, isChatPetVisible, shouldPlaceChatPetSpeechBubbleLeft, shouldSettleChatPetThrow } from "../../../browser/widget/chatPetWidget.js";
suite("ChatPetWidget", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  teardown(() => sinon.restore());
  class TestTelemetryService extends NullTelemetryServiceShape {
    constructor() {
      super(...arguments);
      this.events = [];
    }
    publicLog2(eventName, data) {
      if (eventName) {
        this.events.push({ name: eventName, data });
      }
    }
  }
  function createHopHarness(initialLeft = 48, minimumLeft = 0, maximumLeft = 96) {
    const events = [];
    let left = initialLeft;
    const controller = new ChatPetHopController({
      onDirectionChange: (direction) => events.push(`direction:${direction}`),
      onMove: (delta) => {
        left = getChatPetHorizontalPosition(left + delta, minimumLeft, maximumLeft);
        events.push(`move:${delta}:${left}`);
      },
      onStart: () => events.push("start"),
      onReducedMotionStart: () => events.push("reduced"),
      onRequest: () => events.push("request")
    });
    return { controller, events, getLeft: () => left };
  }
  test("runs one timed hop for a single key press", () => {
    const clock = sinon.useFakeTimers();
    const { controller, events } = createHopHarness();
    try {
      controller.request(1, false);
      clock.tick(299);
      clock.tick(1);
      clock.tick(300);
      controller.onAnimationComplete();
      clock.tick(1e3);
      assert.deepStrictEqual(events, [
        "direction:1",
        "request",
        "start",
        "move:24:72"
      ]);
    } finally {
      controller.dispose();
    }
  });
  test("repeats hops while key requests remain within the hold grace period", () => {
    const clock = sinon.useFakeTimers();
    const { controller, events } = createHopHarness();
    try {
      controller.request(1, false);
      clock.tick(300);
      controller.request(1, false);
      clock.tick(300);
      controller.onAnimationComplete();
      clock.tick(90);
      clock.tick(300);
      assert.deepStrictEqual(events, [
        "direction:1",
        "request",
        "start",
        "move:24:72",
        "direction:1",
        "request",
        "start",
        "move:24:96"
      ]);
    } finally {
      controller.dispose();
    }
  });
  test("uses the latest direction when a hop changes direction before its step", () => {
    const clock = sinon.useFakeTimers();
    const { controller, events, getLeft } = createHopHarness();
    try {
      controller.request(-1, false);
      clock.tick(100);
      controller.request(1, false);
      clock.tick(200);
      assert.deepStrictEqual({
        events,
        left: getLeft()
      }, {
        events: [
          "direction:-1",
          "request",
          "start",
          "direction:1",
          "request",
          "move:24:72"
        ],
        left: 72
      });
    } finally {
      controller.dispose();
    }
  });
  test("moves immediately without repetition when motion is reduced", () => {
    const clock = sinon.useFakeTimers();
    const { controller, events } = createHopHarness();
    try {
      controller.request(-1, true);
      clock.tick(1e3);
      controller.onAnimationComplete();
      assert.deepStrictEqual(events, [
        "direction:-1",
        "request",
        "move:-24:24",
        "reduced"
      ]);
    } finally {
      controller.dispose();
    }
  });
  test("clamps repeated hop steps to the movement bounds", () => {
    const clock = sinon.useFakeTimers();
    const { controller, events, getLeft } = createHopHarness(0, 0, 24);
    try {
      controller.request(-1, false);
      clock.tick(600);
      controller.onAnimationComplete();
      controller.request(1, false);
      clock.tick(600);
      controller.onAnimationComplete();
      controller.request(1, false);
      clock.tick(300);
      assert.deepStrictEqual({
        moves: events.filter((event) => event.startsWith("move:")),
        left: getLeft()
      }, {
        moves: [
          "move:-24:0",
          "move:24:24",
          "move:24:24"
        ],
        left: 24
      });
    } finally {
      controller.dispose();
    }
  });
  test("cancels pending steps and rests when disabled or sent on the run", () => {
    const clock = sinon.useFakeTimers();
    const { controller, events } = createHopHarness();
    try {
      controller.request(1, false);
      clock.tick(100);
      controller.cancel();
      clock.tick(1e3);
      controller.request(1, false);
      clock.tick(300);
      controller.request(1, false);
      clock.tick(300);
      controller.onAnimationComplete();
      controller.cancel();
      clock.tick(1e3);
      assert.deepStrictEqual(events, [
        "direction:1",
        "request",
        "start",
        "direction:1",
        "request",
        "start",
        "move:24:72",
        "direction:1",
        "request"
      ]);
    } finally {
      controller.dispose();
    }
  });
  test("maps chat activity to pet states by priority", () => {
    assert.deepStrictEqual([
      getChatPetBaseState(false, false, false, false, false),
      getChatPetBaseState(false, false, false, false, true),
      getChatPetBaseState(false, false, false, true, false),
      getChatPetBaseState(false, false, false, true, true),
      getChatPetBaseState(true, false, false, true, true),
      getChatPetBaseState(true, true, false, true, true),
      getChatPetBaseState(true, true, true, true, true)
    ], [
      "idle",
      "sleep",
      "typing",
      "sleep",
      "rendering",
      "clapping",
      "idle"
    ]);
  });
  test("limits confirmation attention to two seconds", () => {
    assert.strictEqual(CHAT_PET_CONFIRMATION_ATTENTION_DURATION, 2e3);
  });
  test("only shows in the latest focused chat widget when enabled", () => {
    assert.deepStrictEqual([
      isChatPetVisible(false, false),
      isChatPetVisible(false, true),
      isChatPetVisible(true, false),
      isChatPetVisible(true, true)
    ], [
      false,
      false,
      false,
      true
    ]);
  });
  test("blocks keyboard interaction while unavailable or already interacting", () => {
    assert.deepStrictEqual([
      isChatPetKeyboardInteractionEnabled(false, false, false, false, false),
      isChatPetKeyboardInteractionEnabled(true, true, false, false, false),
      isChatPetKeyboardInteractionEnabled(true, false, true, false, false),
      isChatPetKeyboardInteractionEnabled(true, false, false, true, false),
      isChatPetKeyboardInteractionEnabled(true, false, false, false, true),
      isChatPetKeyboardInteractionEnabled(true, false, false, false, false)
    ], [
      false,
      false,
      false,
      false,
      false,
      true
    ]);
  });
  test("restores a custom position or uses the default position when reopening", () => {
    assert.deepStrictEqual([
      getChatPetRestoredHorizontalPosition(void 0, 20, 220),
      getChatPetRestoredHorizontalPosition(80, 20, 220),
      getChatPetRestoredHorizontalPosition(0, 20, 220),
      getChatPetRestoredHorizontalPosition(240, 20, 220)
    ], [
      188,
      80,
      20,
      220
    ]);
  });
  test("gives dragging precedence over base and transient states", () => {
    assert.deepStrictEqual([
      getChatPetRenderedState("rendering", void 0, false),
      getChatPetRenderedState("rendering", "complete", false),
      getChatPetRenderedState("rendering", void 0, true),
      getChatPetRenderedState("rendering", "complete", true),
      getChatPetRenderedState("idle", "yappingMouthOpen", false),
      getChatPetRenderedState("typing", "yappingMouthOpen", false),
      getChatPetRenderedState("rendering", "yapping", false),
      getChatPetRenderedState("sleep", "yappingMouthOpen", false)
    ], [
      "rendering",
      "complete",
      "idle",
      "idle",
      "yappingMouthOpen",
      "typing",
      "rendering",
      "sleep"
    ]);
  });
  test("sleeps after twenty seconds of inactivity", () => {
    assert.strictEqual(CHAT_PET_IDLE_SLEEP_DELAY, 2e4);
  });
  test("selects the buddy for the product quality", () => {
    assert.deepStrictEqual([
      getChatPetBuddyName("stable"),
      getChatPetBuddyName("insider"),
      getChatPetBuddyName(void 0)
    ], [
      "buddy-idle-stable",
      "buddy-idle-insiders",
      "buddy-idle-insiders"
    ]);
  });
  test("resolves configured and product pet variants", () => {
    assert.deepStrictEqual([
      getChatPetVariant("stable", "insider"),
      getChatPetVariant("insiders", "stable"),
      getChatPetVariant(void 0, "stable"),
      getChatPetVariant(void 0, "insider")
    ], [
      "stable",
      "insiders",
      "stable",
      "insiders"
    ]);
  });
  test("logs pet enablement at startup and when toggled", () => {
    const telemetryService = new TestTelemetryService();
    const service = disposables.add(new ChatPetService(disposables.add(new TestStorageService()), telemetryService));
    service.toggle();
    service.toggle();
    assert.deepStrictEqual(telemetryService.events, [
      { name: "chatPetEnablement", data: { enabled: false, source: "startup" } },
      { name: "chatPetEnablement", data: { enabled: true, source: "change" } },
      { name: "chatPetEnablement", data: { enabled: false, source: "change" } }
    ]);
  });
  test("shares pet scale until the pet is dismissed", () => {
    const service = disposables.add(new ChatPetService(disposables.add(new TestStorageService()), new TestTelemetryService()));
    service.toggle();
    service.setScale(1.4);
    const firstChatScale = service.scale.get();
    const secondChatScale = service.scale.get();
    const dismissed = service.toggle();
    const resetScale = service.scale.get();
    const restored = service.toggle();
    assert.deepStrictEqual([
      firstChatScale,
      secondChatScale,
      dismissed,
      resetScale,
      restored,
      service.scale.get()
    ], [
      1.4,
      1.4,
      false,
      1,
      true,
      1
    ]);
  });
  test("cycles through click interactions without repeating and reserves one percent each for icon and yapping", () => {
    const interactionInterval = 0.98 / 6;
    assert.strictEqual(CHAT_PET_ICON_TRANSFORMATION_CHANCE, 1 / 100);
    assert.strictEqual(CHAT_PET_YAPPING_CHANCE, 1 / 100);
    assert.deepStrictEqual([
      getChatPetClickInteraction(0),
      getChatPetClickInteraction(9999e-6),
      getChatPetClickInteraction(0.01),
      getChatPetClickInteraction(0.019999),
      getChatPetClickInteraction(0.02),
      getChatPetClickInteraction(0.02 + interactionInterval * 1.5),
      getChatPetClickInteraction(0.02 + interactionInterval * 2.5),
      getChatPetClickInteraction(0.02 + interactionInterval * 3.5),
      getChatPetClickInteraction(0.02 + interactionInterval * 4.5),
      getChatPetClickInteraction(0.02 + interactionInterval * 5.5),
      getChatPetClickInteraction(0.99),
      getChatPetClickInteraction(0.02, "buttonPress"),
      getChatPetClickInteraction(0.99, "worry")
    ], [
      "complete",
      "complete",
      "yapping",
      "yapping",
      "buttonPress",
      "love",
      "cool",
      "sing",
      "speechless",
      "worry",
      "worry",
      "love",
      "speechless"
    ]);
  });
  test("blinks fixed eyes during typing, love, and button press", () => {
    assert.deepStrictEqual([
      doesChatPetStateBlink("typing"),
      doesChatPetStateBlink("love"),
      doesChatPetStateBlink("buttonPress"),
      doesChatPetStateBlink("buttonPress", 4),
      doesChatPetStateBlink("buttonPress", 5),
      doesChatPetStateBlink("idle"),
      doesChatPetStateBlink("rendering"),
      doesChatPetStateBlink(void 0)
    ], [
      true,
      true,
      true,
      true,
      false,
      false,
      false,
      false
    ]);
  });
  test("disables cursor tracking for fixed-eye sprite states", () => {
    assert.deepStrictEqual({
      idle: doesChatPetStateTrackCursor("idle"),
      sleep: doesChatPetStateTrackCursor("sleep"),
      waking: doesChatPetStateTrackCursor("waking"),
      typing: doesChatPetStateTrackCursor("typing"),
      rendering: doesChatPetStateTrackCursor("rendering"),
      buttonPress: doesChatPetStateTrackCursor("buttonPress"),
      complete: doesChatPetStateTrackCursor("complete"),
      jump: doesChatPetStateTrackCursor("jump"),
      love: doesChatPetStateTrackCursor("love"),
      cool: doesChatPetStateTrackCursor("cool"),
      yapping: doesChatPetStateTrackCursor("yapping"),
      yappingMouthOpen: doesChatPetStateTrackCursor("yappingMouthOpen"),
      sing: doesChatPetStateTrackCursor("sing"),
      speechless: doesChatPetStateTrackCursor("speechless"),
      worry: doesChatPetStateTrackCursor("worry"),
      dizzy: doesChatPetStateTrackCursor("dizzy"),
      falling: doesChatPetStateTrackCursor("falling"),
      wallImpact: doesChatPetStateTrackCursor("wallImpact"),
      splat: doesChatPetStateTrackCursor("splat"),
      onTheRun: doesChatPetStateTrackCursor("onTheRun"),
      searching: doesChatPetStateTrackCursor("searching")
    }, {
      idle: true,
      sleep: false,
      waking: false,
      typing: false,
      rendering: true,
      buttonPress: false,
      complete: false,
      jump: false,
      love: false,
      cool: false,
      yapping: true,
      yappingMouthOpen: false,
      sing: false,
      speechless: false,
      worry: false,
      dizzy: false,
      falling: false,
      wallImpact: false,
      splat: false,
      onTheRun: false,
      searching: false
    });
  });
  test("tracks body facing while idle and locks it during animations", () => {
    const controller = new ChatPetFacingController();
    const directions = [controller.direction];
    controller.setState("idle", false);
    directions.push(controller.update(-10, 0));
    controller.setState("typing", false);
    directions.push(controller.update(10, 0));
    controller.setState("buttonPress", false);
    directions.push(controller.update(10, 0));
    controller.setState("sing", false);
    directions.push(controller.update(10, 0));
    controller.setState("idle", false);
    directions.push(controller.update(10, 0));
    controller.setState("idle", true);
    directions.push(controller.update(-10, 0));
    assert.deepStrictEqual(directions, [
      "right",
      "left",
      "left",
      "left",
      "left",
      "right",
      "right"
    ]);
  });
  test("snapshots the splat direction after falling and locks it during the animation", () => {
    const controller = new ChatPetFacingController();
    controller.setState("falling", false);
    const fallingDirection = controller.update(-10, 0);
    const splatDirection = controller.snapToCursor(-10, 0);
    controller.setState("splat", false);
    const splatDirectionAfterPointerMove = controller.update(10, 0);
    assert.deepStrictEqual({
      fallingDirection,
      splatDirection,
      splatDirectionAfterPointerMove
    }, {
      fallingDirection: "right",
      splatDirection: "left",
      splatDirectionAfterPointerMove: "left"
    });
  });
  test("gets dizzy after rapid direction changes and resets slow sequences", () => {
    const controller = new ChatPetDirectionChangeController(3, 500);
    assert.deepStrictEqual([
      controller.record("left", 0),
      controller.record("left", 50),
      controller.record("right", 100),
      controller.record("left", 200),
      controller.record("right", 300),
      controller.record("left", 400),
      controller.record("right", 1e3),
      controller.record("left", 1100),
      controller.record("right", 1200)
    ], [
      false,
      false,
      false,
      false,
      true,
      false,
      false,
      false,
      true
    ]);
  });
  test("maps activity and interaction states to their sprites", () => {
    assert.deepStrictEqual([
      getChatPetSpriteName("complete", "insider"),
      getChatPetSpriteName("buttonPress", "insider"),
      getChatPetSpriteName("sleep", "insider"),
      getChatPetSpriteName("waking", "stable"),
      getChatPetSpriteName("typing", "insider"),
      getChatPetSpriteName("rendering", "stable"),
      getChatPetSpriteName("cool", "stable"),
      getChatPetSpriteName("searching", "stable"),
      getChatPetSpriteName("yappingMouthOpen", "insider"),
      getChatPetSpriteName("sing", "stable"),
      getChatPetSpriteName("sing", "insider"),
      getChatPetSpriteName("speechless", "stable"),
      getChatPetSpriteName("speechless", "insider"),
      getChatPetSpriteName("worry", "stable"),
      getChatPetSpriteName("worry", "insider"),
      getChatPetSpriteName("dizzy", "stable"),
      getChatPetSpriteName("dizzy", "insider"),
      getChatPetSpriteName("falling", "stable"),
      getChatPetSpriteName("wallImpact", "stable"),
      getChatPetSpriteName("wallImpact", "insider"),
      getChatPetSpriteName("jump", "stable"),
      getChatPetSpriteName("jump", "insider"),
      getChatPetSpriteName("splat", "insider")
    ], [
      "buddy-idle-insiders",
      "buddy-press-button-insiders",
      "buddy-sleep-insiders",
      "buddy-waking-stable",
      "buddy-typing-insiders",
      "buddy-rendering-stable",
      "buddy-cool-stable",
      "buddy-search-stable",
      "buddy-yapping-insiders",
      "buddy-sing-stable",
      "buddy-sing-insiders",
      "buddy-speechless-stable",
      "buddy-speechless-insiders",
      "buddy-worry-stable",
      "buddy-worry-insiders",
      "buddy-dizzy-stable",
      "buddy-dizzy-insiders",
      "buddy-falling-stable",
      "buddy-wall-impact-stable",
      "buddy-wall-impact-insiders",
      "buddy-jump-stable",
      "buddy-jump-insiders",
      "buddy-splat-insiders"
    ]);
  });
  test("preserves the source animation timing", () => {
    assert.deepStrictEqual([
      getChatPetFrameDurations("idle"),
      getChatPetFrameDurations("sleep"),
      getChatPetFrameDurations("waking"),
      getChatPetFrameDurations("typing"),
      getChatPetFrameDurations("rendering"),
      getChatPetFrameDurations("buttonPress"),
      getChatPetFrameDurations("clapping"),
      getChatPetFrameDurations("love"),
      getChatPetFrameDurations("cool"),
      getChatPetFrameDurations("sing"),
      getChatPetFrameDurations("speechless"),
      getChatPetFrameDurations("worry"),
      getChatPetFrameDurations("dizzy"),
      getChatPetFrameDurations("searching"),
      getChatPetFrameDurations("yapping"),
      getChatPetFrameDurations("yappingMouthOpen"),
      getChatPetFrameDurations("falling"),
      getChatPetFrameDurations("wallImpact"),
      getChatPetFrameDurations("jump"),
      getChatPetFrameDurations("splat"),
      getChatPetRespawnFrameDurations(),
      getChatPetSpeechFrameDurations()
    ], [
      Array.from({ length: 50 }, () => 40),
      Array.from({ length: 8 }, () => 300),
      [160, 100, 80, 90, 90, 90, 100, 170],
      [320, 480],
      Array.from({ length: 50 }, () => 40),
      [500, 300, 350, 250, 450, 1e3],
      [80, 40, 40, 40, 80, 40, 40, 40, 40, 80, 40, 40, 80],
      [200, 200, 380, 100, 80, 1980],
      [600, 120, 120, 120, 160, 80, 80, 80, 1640],
      [180, 180, 180, 180],
      [400, 120, 1e3, 120, 1080],
      [600, 600],
      Array.from({ length: 8 }, () => 120),
      [500, 500, 500, 500],
      [],
      [],
      [120, 80, 80, 120, 80, 80],
      [],
      [70, 80, 90, 160, 100, 100],
      [120, 100, 100, 200],
      [120, 100, 120, 240, 100, 120],
      [220, 220, 220, 100, 160, 180]
    ]);
  });
  test("selects animation frames and completes on the final frame", () => {
    const frameDurations = [100, 50, 150];
    assert.deepStrictEqual([
      getChatPetAnimationFrame([], 0, 1),
      getChatPetAnimationFrame(frameDurations, -1, 1),
      getChatPetAnimationFrame(frameDurations, 99, 1),
      getChatPetAnimationFrame(frameDurations, 100, 1),
      getChatPetAnimationFrame(frameDurations, 149, 1),
      getChatPetAnimationFrame(frameDurations, 150, 1),
      getChatPetAnimationFrame(frameDurations, 299, 1),
      getChatPetAnimationFrame(frameDurations, 300, 1),
      getChatPetAnimationFrame(frameDurations, 300, Infinity),
      getChatPetAnimationFrame(frameDurations, 600, 2),
      getChatPetAnimationFrame(frameDurations, -1, 1, true),
      getChatPetAnimationFrame(frameDurations, 149, 1, true),
      getChatPetAnimationFrame(frameDurations, 150, 1, true),
      getChatPetAnimationFrame(frameDurations, 199, 1, true),
      getChatPetAnimationFrame(frameDurations, 200, 1, true),
      getChatPetAnimationFrame(frameDurations, 299, 1, true),
      getChatPetAnimationFrame(frameDurations, 300, 1, true)
    ], [
      { frameIndex: 0, complete: true },
      { frameIndex: 0, complete: false, nextFrameDelay: 100 },
      { frameIndex: 0, complete: false, nextFrameDelay: 1 },
      { frameIndex: 1, complete: false, nextFrameDelay: 50 },
      { frameIndex: 1, complete: false, nextFrameDelay: 1 },
      { frameIndex: 2, complete: false, nextFrameDelay: 150 },
      { frameIndex: 2, complete: false, nextFrameDelay: 1 },
      { frameIndex: 2, complete: true },
      { frameIndex: 0, complete: false, nextFrameDelay: 100 },
      { frameIndex: 2, complete: true },
      { frameIndex: 2, complete: false, nextFrameDelay: 150 },
      { frameIndex: 2, complete: false, nextFrameDelay: 1 },
      { frameIndex: 1, complete: false, nextFrameDelay: 50 },
      { frameIndex: 1, complete: false, nextFrameDelay: 1 },
      { frameIndex: 0, complete: false, nextFrameDelay: 100 },
      { frameIndex: 0, complete: false, nextFrameDelay: 1 },
      { frameIndex: 0, complete: true }
    ]);
  });
  test("matches sprite sources without browser URL normalization", () => {
    const source = "vscode-file://vscode-app/Applications/Visual Studio Code - Insiders.app/pet.gif";
    const image = document.createElement("img");
    image.src = source;
    assert.deepStrictEqual([
      image.src === source,
      isChatPetImageSource(image, source)
    ], [
      false,
      true
    ]);
  });
  test("maps the cursor to pixel-snapped gaze directions", () => {
    assert.deepStrictEqual([
      getChatPetGazeDirection(10, 0, 0, 0),
      getChatPetGazeDirection(10, 10, 0, 0),
      getChatPetGazeDirection(0, 10, 0, 0),
      getChatPetGazeDirection(-10, 10, 0, 0),
      getChatPetGazeDirection(-10, 0, 0, 0),
      getChatPetGazeDirection(-10, -10, 0, 0),
      getChatPetGazeDirection(0, -10, 0, 0),
      getChatPetGazeDirection(10, -10, 0, 0),
      getChatPetGazeDirection(0, 0, 0, 0)
    ], [
      [1, 0],
      [1, 1],
      [0, 1],
      [-1, 1],
      [-1, 0],
      [-1, -1],
      [0, -1],
      [1, -1],
      [0, 0]
    ]);
  });
  test("clamps horizontal movement to the input bounds", () => {
    assert.deepStrictEqual([
      getChatPetHorizontalPosition(-20, 10, 100),
      getChatPetHorizontalPosition(50, 10, 100),
      getChatPetHorizontalPosition(120, 10, 100),
      getChatPetHorizontalPosition(20, 40, 20)
    ], [
      10,
      50,
      100,
      40
    ]);
  });
  test("places the default position thirty-two pixels from the right edge", () => {
    assert.deepStrictEqual([
      getChatPetDefaultHorizontalPosition(0, 100),
      getChatPetDefaultHorizontalPosition(20, 120),
      getChatPetDefaultHorizontalPosition(40, 20)
    ], [
      68,
      88,
      40
    ]);
  });
  test("changes size in twenty-percent steps with only a minimum", () => {
    assert.deepStrictEqual([
      getChatPetScale(1, 0.2),
      getChatPetScale(1, -0.2),
      getChatPetScale(0.4, -0.2),
      getChatPetScale(10, 0.2)
    ], [
      1.2,
      0.8,
      0.4,
      10.2
    ]);
  });
  test("clamps two-dimensional dragging to the chat bounds", () => {
    assert.deepStrictEqual([
      getChatPetDragPosition(-20, -40, 10, 100, -300, 200),
      getChatPetDragPosition(50, -100, 10, 100, -300, 200),
      getChatPetDragPosition(120, 240, 10, 100, -300, 200)
    ], [
      [10, -40],
      [50, -100],
      [100, 200]
    ]);
  });
  test("turns recent horizontal flicks into bounded wall throws", () => {
    assert.deepStrictEqual([
      getChatPetThrowVelocity([{ x: 0, y: 0, time: 0 }, { x: 60, y: 10, time: 40 }, { x: 120, y: 20, time: 80 }], 100),
      getChatPetThrowVelocity([{ x: 200, y: 100, time: 0 }, { x: 150, y: 60, time: 50 }, { x: 120, y: 40, time: 80 }], 90),
      getChatPetThrowVelocity([{ x: 0, y: 0, time: 0 }, { x: 40, y: 0, time: 100 }], 100),
      getChatPetThrowVelocity([{ x: 0, y: 0, time: 0 }, { x: 50, y: 100, time: 50 }], 50),
      getChatPetThrowVelocity([{ x: 0, y: 0, time: 0 }, { x: 70, y: 90, time: 100 }], 100),
      getChatPetThrowVelocity([{ x: 0, y: 0, time: 0 }, { x: 120, y: 0, time: 80 }], 161)
    ], [
      { x: 1500, y: -420 },
      { x: -1e3, y: -750 },
      void 0,
      void 0,
      void 0,
      void 0
    ]);
  });
  test("advances wall throws through gravity and bounded collisions", () => {
    const bounds = { minimumLeft: 0, maximumLeft: 80, minimumTop: 0 };
    const frames = [
      advanceChatPetThrow({ left: 10, top: 100, x: 500, y: -100 }, 20, bounds),
      advanceChatPetThrow({ left: 70, top: 100, x: 1e3, y: 0 }, 20, bounds),
      advanceChatPetThrow({ left: 10, top: 1, x: 0, y: -200 }, 10, bounds),
      advanceChatPetThrow({ left: 0, top: 100, x: 1e3, y: 0 }, 20, { minimumLeft: 0, maximumLeft: 0, minimumTop: 0 })
    ].map((frame) => ({
      ...frame,
      left: Math.round(frame.left * 100) / 100,
      top: Math.round(frame.top * 100) / 100,
      y: Math.round(frame.y * 100) / 100
    }));
    assert.deepStrictEqual(frames, [
      { left: 20, top: 98.36, x: 500, y: -64, wall: void 0 },
      { left: 80, top: 100.09, x: 1e3, y: 18, wall: "right" },
      { left: 10, top: 0, x: 0, y: 36.4, wall: void 0 },
      { left: 0, top: 100.36, x: 0, y: 36, wall: void 0 }
    ]);
  });
  test("settles throws that exceed their bounds or maximum duration", () => {
    assert.deepStrictEqual([
      shouldSettleChatPetThrow(0, 3999, 100, 200, 400),
      shouldSettleChatPetThrow(0, 4e3, 100, -200, 400),
      shouldSettleChatPetThrow(0, 100, 401, -1, 400),
      shouldSettleChatPetThrow(0, 100, 401, 0, 400)
    ], [
      false,
      true,
      false,
      true
    ]);
  });
  test("lands a throw at the first platform or floor crossing", () => {
    assert.deepStrictEqual([
      getChatPetThrowLanding(10, 80, 30, 120, 48, 48, 0, 100, 148, 400),
      getChatPetThrowLanding(80, 80, 120, 120, 48, 48, 0, 100, 148, 400),
      getChatPetThrowLanding(120, 360, 140, 420, 48, 48, 0, 100, 148, 400),
      getChatPetThrowLanding(10, 120, 30, 80, 48, 48, 0, 100, 148, 400)
    ], [
      { left: 20, top: 100, landsOnPlatform: true },
      void 0,
      { left: 133.33333333333334, top: 400, landsOnPlatform: false },
      void 0
    ]);
  });
  test("lands on the input only when dropped above its horizontal span", () => {
    assert.deepStrictEqual([
      getChatPetFallTarget(50, 20, 48, 48, 40, 200, 200, 400),
      getChatPetFallTarget(0, 20, 48, 48, 40, 200, 200, 400),
      getChatPetFallTarget(50, 152, 48, 48, 40, 200, 200, 400),
      getChatPetFallTarget(50, 190, 48, 48, 40, 200, 200, 400),
      getChatPetFallTarget(50, 151.5, 48, 48, 40, 200, 200, 400),
      getChatPetFallTarget(50, 152.5, 48, 48, 40, 200, 200, 400),
      getChatPetFallTarget(50, 220, 48, 48, 40, 200, 200, 400)
    ], [
      { top: 152, landsOnPlatform: true },
      { top: 352, landsOnPlatform: false },
      { top: 152, landsOnPlatform: true },
      { top: 352, landsOnPlatform: false },
      { top: 152, landsOnPlatform: true },
      { top: 352, landsOnPlatform: false },
      { top: 352, landsOnPlatform: false }
    ]);
  });
  test("scales fall duration with distance within motion bounds", () => {
    assert.deepStrictEqual([
      getChatPetFallDuration(0),
      getChatPetFallDuration(100),
      getChatPetFallDuration(400),
      getChatPetFallDuration(1225)
    ], [
      180,
      200,
      400,
      700
    ]);
  });
  test("adapts vertical alignment to the input stack", () => {
    assert.deepStrictEqual([
      getChatPetVerticalOffset(100, 98),
      getChatPetVerticalOffset(100, 108),
      getChatPetVerticalOffset(100, 112),
      getChatPetVerticalOffset(100, 160)
    ], [
      0,
      8,
      10,
      10
    ]);
  });
  test("ignores passive pills when choosing the active platform", () => {
    assert.deepStrictEqual([
      getChatPetPlatformTop(100, 160),
      getChatPetPlatformTop(100, 160, 120),
      getChatPetPlatformTop(100, 160, 158),
      getChatPetPlatformTop(100, 160, 170)
    ], [
      110,
      120,
      158,
      110
    ]);
  });
  test("moves only the rendering speech bubble before it crosses the input edge", () => {
    assert.deepStrictEqual([
      shouldPlaceChatPetSpeechBubbleLeft("rendering", 980, 1e3),
      shouldPlaceChatPetSpeechBubbleLeft("rendering", 981, 1e3),
      shouldPlaceChatPetSpeechBubbleLeft("yapping", 981, 1e3),
      shouldPlaceChatPetSpeechBubbleLeft("yappingMouthOpen", 981, 1e3)
    ], [
      false,
      true,
      false,
      false
    ]);
  });
  test("keeps wide sprites within the input without changing direction", () => {
    assert.deepStrictEqual([
      getChatPetWideSpriteHorizontalOffset("sleep", "right", 932, 980, 0, 1e3),
      getChatPetWideSpriteHorizontalOffset("waking", "left", 20, 68, 0, 1e3),
      getChatPetWideSpriteHorizontalOffset("typing", "right", 915, 963, 0, 1e3),
      getChatPetWideSpriteHorizontalOffset("typing", "right", 917, 965, 0, 1e3),
      getChatPetWideSpriteHorizontalOffset("buttonPress", "right", 921, 969, 0, 1e3),
      getChatPetWideSpriteHorizontalOffset("sing", "right", 919, 967, 0, 1e3),
      getChatPetWideSpriteHorizontalOffset("typing", "left", 37, 85, 0, 1e3),
      getChatPetWideSpriteHorizontalOffset("typing", "left", 35, 83, 0, 1e3),
      getChatPetWideSpriteHorizontalOffset("typing", "right", 882, 978, 0, 1048, 2),
      getChatPetWideSpriteHorizontalOffset("idle", "right", 952, 1e3, 0, 1e3)
    ], [
      0,
      0,
      0,
      -1,
      -1,
      -1,
      0,
      1,
      -1,
      0
    ]);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGJyb3dzZXJcXHdpZGdldFxcY2hhdFBldFdpZGdldC50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHNpbm9uIGZyb20gJ3Npbm9uJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgTnVsbFRlbGVtZXRyeVNlcnZpY2VTaGFwZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5VXRpbHMuanMnO1xuaW1wb3J0IHsgVGVzdFN0b3JhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vdGVzdC9jb21tb24vd29ya2JlbmNoVGVzdFNlcnZpY2VzLmpzJztcbmltcG9ydCB7IENoYXRQZXRTZXJ2aWNlLCBnZXRDaGF0UGV0VmFyaWFudCB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvY2hhdFBldFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ0hBVF9QRVRfQ09ORklSTUFUSU9OX0FUVEVOVElPTl9EVVJBVElPTiwgQ0hBVF9QRVRfSUNPTl9UUkFOU0ZPUk1BVElPTl9DSEFOQ0UsIENIQVRfUEVUX0lETEVfU0xFRVBfREVMQVksIENIQVRfUEVUX1lBUFBJTkdfQ0hBTkNFLCBDaGF0UGV0RGlyZWN0aW9uQ2hhbmdlQ29udHJvbGxlciwgQ2hhdFBldEZhY2luZ0NvbnRyb2xsZXIsIENoYXRQZXRIb3BDb250cm9sbGVyLCBhZHZhbmNlQ2hhdFBldFRocm93LCBkb2VzQ2hhdFBldFN0YXRlQmxpbmssIGRvZXNDaGF0UGV0U3RhdGVUcmFja0N1cnNvciwgZ2V0Q2hhdFBldEFuaW1hdGlvbkZyYW1lLCBnZXRDaGF0UGV0QmFzZVN0YXRlLCBnZXRDaGF0UGV0QnVkZHlOYW1lLCBnZXRDaGF0UGV0Q2xpY2tJbnRlcmFjdGlvbiwgZ2V0Q2hhdFBldERlZmF1bHRIb3Jpem9udGFsUG9zaXRpb24sIGdldENoYXRQZXREcmFnUG9zaXRpb24sIGdldENoYXRQZXRGYWxsRHVyYXRpb24sIGdldENoYXRQZXRGYWxsVGFyZ2V0LCBnZXRDaGF0UGV0RnJhbWVEdXJhdGlvbnMsIGdldENoYXRQZXRHYXplRGlyZWN0aW9uLCBnZXRDaGF0UGV0SG9yaXpvbnRhbFBvc2l0aW9uLCBnZXRDaGF0UGV0UGxhdGZvcm1Ub3AsIGdldENoYXRQZXRSZW5kZXJlZFN0YXRlLCBnZXRDaGF0UGV0UmVzcGF3bkZyYW1lRHVyYXRpb25zLCBnZXRDaGF0UGV0UmVzdG9yZWRIb3Jpem9udGFsUG9zaXRpb24sIGdldENoYXRQZXRTY2FsZSwgZ2V0Q2hhdFBldFNwZWVjaEZyYW1lRHVyYXRpb25zLCBnZXRDaGF0UGV0U3ByaXRlTmFtZSwgZ2V0Q2hhdFBldFRocm93TGFuZGluZywgZ2V0Q2hhdFBldFRocm93VmVsb2NpdHksIGdldENoYXRQZXRWZXJ0aWNhbE9mZnNldCwgZ2V0Q2hhdFBldFdpZGVTcHJpdGVIb3Jpem9udGFsT2Zmc2V0LCBpc0NoYXRQZXRJbWFnZVNvdXJjZSwgaXNDaGF0UGV0S2V5Ym9hcmRJbnRlcmFjdGlvbkVuYWJsZWQsIGlzQ2hhdFBldFZpc2libGUsIHNob3VsZFBsYWNlQ2hhdFBldFNwZWVjaEJ1YmJsZUxlZnQsIHNob3VsZFNldHRsZUNoYXRQZXRUaHJvdyB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvd2lkZ2V0L2NoYXRQZXRXaWRnZXQuanMnO1xuXG5zdWl0ZSgnQ2hhdFBldFdpZGdldCcsICgpID0+IHtcblxuXHRjb25zdCBkaXNwb3NhYmxlcyA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlYXJkb3duKCgpID0+IHNpbm9uLnJlc3RvcmUoKSk7XG5cblx0Y2xhc3MgVGVzdFRlbGVtZXRyeVNlcnZpY2UgZXh0ZW5kcyBOdWxsVGVsZW1ldHJ5U2VydmljZVNoYXBlIHtcblx0XHRyZWFkb25seSBldmVudHM6IHsgcmVhZG9ubHkgbmFtZTogc3RyaW5nOyByZWFkb25seSBkYXRhOiB1bmtub3duIH1bXSA9IFtdO1xuXG5cdFx0b3ZlcnJpZGUgcHVibGljTG9nMihldmVudE5hbWU/OiBzdHJpbmcsIGRhdGE/OiB1bmtub3duKTogdm9pZCB7XG5cdFx0XHRpZiAoZXZlbnROYW1lKSB7XG5cdFx0XHRcdHRoaXMuZXZlbnRzLnB1c2goeyBuYW1lOiBldmVudE5hbWUsIGRhdGEgfSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0ZnVuY3Rpb24gY3JlYXRlSG9wSGFybmVzcyhpbml0aWFsTGVmdCA9IDQ4LCBtaW5pbXVtTGVmdCA9IDAsIG1heGltdW1MZWZ0ID0gOTYpIHtcblx0XHRjb25zdCBldmVudHM6IHN0cmluZ1tdID0gW107XG5cdFx0bGV0IGxlZnQgPSBpbml0aWFsTGVmdDtcblx0XHRjb25zdCBjb250cm9sbGVyID0gbmV3IENoYXRQZXRIb3BDb250cm9sbGVyKHtcblx0XHRcdG9uRGlyZWN0aW9uQ2hhbmdlOiBkaXJlY3Rpb24gPT4gZXZlbnRzLnB1c2goYGRpcmVjdGlvbjoke2RpcmVjdGlvbn1gKSxcblx0XHRcdG9uTW92ZTogZGVsdGEgPT4ge1xuXHRcdFx0XHRsZWZ0ID0gZ2V0Q2hhdFBldEhvcml6b250YWxQb3NpdGlvbihsZWZ0ICsgZGVsdGEsIG1pbmltdW1MZWZ0LCBtYXhpbXVtTGVmdCk7XG5cdFx0XHRcdGV2ZW50cy5wdXNoKGBtb3ZlOiR7ZGVsdGF9OiR7bGVmdH1gKTtcblx0XHRcdH0sXG5cdFx0XHRvblN0YXJ0OiAoKSA9PiBldmVudHMucHVzaCgnc3RhcnQnKSxcblx0XHRcdG9uUmVkdWNlZE1vdGlvblN0YXJ0OiAoKSA9PiBldmVudHMucHVzaCgncmVkdWNlZCcpLFxuXHRcdFx0b25SZXF1ZXN0OiAoKSA9PiBldmVudHMucHVzaCgncmVxdWVzdCcpLFxuXHRcdH0pO1xuXHRcdHJldHVybiB7IGNvbnRyb2xsZXIsIGV2ZW50cywgZ2V0TGVmdDogKCkgPT4gbGVmdCB9O1xuXHR9XG5cblx0dGVzdCgncnVucyBvbmUgdGltZWQgaG9wIGZvciBhIHNpbmdsZSBrZXkgcHJlc3MnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY2xvY2sgPSBzaW5vbi51c2VGYWtlVGltZXJzKCk7XG5cdFx0Y29uc3QgeyBjb250cm9sbGVyLCBldmVudHMgfSA9IGNyZWF0ZUhvcEhhcm5lc3MoKTtcblx0XHR0cnkge1xuXHRcdFx0Y29udHJvbGxlci5yZXF1ZXN0KDEsIGZhbHNlKTtcblx0XHRcdGNsb2NrLnRpY2soMjk5KTtcblx0XHRcdGNsb2NrLnRpY2soMSk7XG5cdFx0XHRjbG9jay50aWNrKDMwMCk7XG5cdFx0XHRjb250cm9sbGVyLm9uQW5pbWF0aW9uQ29tcGxldGUoKTtcblx0XHRcdGNsb2NrLnRpY2soMV8wMDApO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGV2ZW50cywgW1xuXHRcdFx0XHQnZGlyZWN0aW9uOjEnLFxuXHRcdFx0XHQncmVxdWVzdCcsXG5cdFx0XHRcdCdzdGFydCcsXG5cdFx0XHRcdCdtb3ZlOjI0OjcyJyxcblx0XHRcdF0pO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRjb250cm9sbGVyLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ3JlcGVhdHMgaG9wcyB3aGlsZSBrZXkgcmVxdWVzdHMgcmVtYWluIHdpdGhpbiB0aGUgaG9sZCBncmFjZSBwZXJpb2QnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY2xvY2sgPSBzaW5vbi51c2VGYWtlVGltZXJzKCk7XG5cdFx0Y29uc3QgeyBjb250cm9sbGVyLCBldmVudHMgfSA9IGNyZWF0ZUhvcEhhcm5lc3MoKTtcblx0XHR0cnkge1xuXHRcdFx0Y29udHJvbGxlci5yZXF1ZXN0KDEsIGZhbHNlKTtcblx0XHRcdGNsb2NrLnRpY2soMzAwKTtcblx0XHRcdGNvbnRyb2xsZXIucmVxdWVzdCgxLCBmYWxzZSk7XG5cdFx0XHRjbG9jay50aWNrKDMwMCk7XG5cdFx0XHRjb250cm9sbGVyLm9uQW5pbWF0aW9uQ29tcGxldGUoKTtcblx0XHRcdGNsb2NrLnRpY2soOTApO1xuXHRcdFx0Y2xvY2sudGljaygzMDApO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGV2ZW50cywgW1xuXHRcdFx0XHQnZGlyZWN0aW9uOjEnLFxuXHRcdFx0XHQncmVxdWVzdCcsXG5cdFx0XHRcdCdzdGFydCcsXG5cdFx0XHRcdCdtb3ZlOjI0OjcyJyxcblx0XHRcdFx0J2RpcmVjdGlvbjoxJyxcblx0XHRcdFx0J3JlcXVlc3QnLFxuXHRcdFx0XHQnc3RhcnQnLFxuXHRcdFx0XHQnbW92ZToyNDo5NicsXG5cdFx0XHRdKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0Y29udHJvbGxlci5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCd1c2VzIHRoZSBsYXRlc3QgZGlyZWN0aW9uIHdoZW4gYSBob3AgY2hhbmdlcyBkaXJlY3Rpb24gYmVmb3JlIGl0cyBzdGVwJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNsb2NrID0gc2lub24udXNlRmFrZVRpbWVycygpO1xuXHRcdGNvbnN0IHsgY29udHJvbGxlciwgZXZlbnRzLCBnZXRMZWZ0IH0gPSBjcmVhdGVIb3BIYXJuZXNzKCk7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnRyb2xsZXIucmVxdWVzdCgtMSwgZmFsc2UpO1xuXHRcdFx0Y2xvY2sudGljaygxMDApO1xuXHRcdFx0Y29udHJvbGxlci5yZXF1ZXN0KDEsIGZhbHNlKTtcblx0XHRcdGNsb2NrLnRpY2soMjAwKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdGV2ZW50cyxcblx0XHRcdFx0bGVmdDogZ2V0TGVmdCgpLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRldmVudHM6IFtcblx0XHRcdFx0XHQnZGlyZWN0aW9uOi0xJyxcblx0XHRcdFx0XHQncmVxdWVzdCcsXG5cdFx0XHRcdFx0J3N0YXJ0Jyxcblx0XHRcdFx0XHQnZGlyZWN0aW9uOjEnLFxuXHRcdFx0XHRcdCdyZXF1ZXN0Jyxcblx0XHRcdFx0XHQnbW92ZToyNDo3MicsXG5cdFx0XHRcdF0sXG5cdFx0XHRcdGxlZnQ6IDcyLFxuXHRcdFx0fSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGNvbnRyb2xsZXIuZGlzcG9zZSgpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnbW92ZXMgaW1tZWRpYXRlbHkgd2l0aG91dCByZXBldGl0aW9uIHdoZW4gbW90aW9uIGlzIHJlZHVjZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY2xvY2sgPSBzaW5vbi51c2VGYWtlVGltZXJzKCk7XG5cdFx0Y29uc3QgeyBjb250cm9sbGVyLCBldmVudHMgfSA9IGNyZWF0ZUhvcEhhcm5lc3MoKTtcblx0XHR0cnkge1xuXHRcdFx0Y29udHJvbGxlci5yZXF1ZXN0KC0xLCB0cnVlKTtcblx0XHRcdGNsb2NrLnRpY2soMV8wMDApO1xuXHRcdFx0Y29udHJvbGxlci5vbkFuaW1hdGlvbkNvbXBsZXRlKCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZXZlbnRzLCBbXG5cdFx0XHRcdCdkaXJlY3Rpb246LTEnLFxuXHRcdFx0XHQncmVxdWVzdCcsXG5cdFx0XHRcdCdtb3ZlOi0yNDoyNCcsXG5cdFx0XHRcdCdyZWR1Y2VkJyxcblx0XHRcdF0pO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRjb250cm9sbGVyLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ2NsYW1wcyByZXBlYXRlZCBob3Agc3RlcHMgdG8gdGhlIG1vdmVtZW50IGJvdW5kcycsICgpID0+IHtcblx0XHRjb25zdCBjbG9jayA9IHNpbm9uLnVzZUZha2VUaW1lcnMoKTtcblx0XHRjb25zdCB7IGNvbnRyb2xsZXIsIGV2ZW50cywgZ2V0TGVmdCB9ID0gY3JlYXRlSG9wSGFybmVzcygwLCAwLCAyNCk7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnRyb2xsZXIucmVxdWVzdCgtMSwgZmFsc2UpO1xuXHRcdFx0Y2xvY2sudGljayg2MDApO1xuXHRcdFx0Y29udHJvbGxlci5vbkFuaW1hdGlvbkNvbXBsZXRlKCk7XG5cdFx0XHRjb250cm9sbGVyLnJlcXVlc3QoMSwgZmFsc2UpO1xuXHRcdFx0Y2xvY2sudGljayg2MDApO1xuXHRcdFx0Y29udHJvbGxlci5vbkFuaW1hdGlvbkNvbXBsZXRlKCk7XG5cdFx0XHRjb250cm9sbGVyLnJlcXVlc3QoMSwgZmFsc2UpO1xuXHRcdFx0Y2xvY2sudGljaygzMDApO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0bW92ZXM6IGV2ZW50cy5maWx0ZXIoZXZlbnQgPT4gZXZlbnQuc3RhcnRzV2l0aCgnbW92ZTonKSksXG5cdFx0XHRcdGxlZnQ6IGdldExlZnQoKSxcblx0XHRcdH0sIHtcblx0XHRcdFx0bW92ZXM6IFtcblx0XHRcdFx0XHQnbW92ZTotMjQ6MCcsXG5cdFx0XHRcdFx0J21vdmU6MjQ6MjQnLFxuXHRcdFx0XHRcdCdtb3ZlOjI0OjI0Jyxcblx0XHRcdFx0XSxcblx0XHRcdFx0bGVmdDogMjQsXG5cdFx0XHR9KTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0Y29udHJvbGxlci5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdjYW5jZWxzIHBlbmRpbmcgc3RlcHMgYW5kIHJlc3RzIHdoZW4gZGlzYWJsZWQgb3Igc2VudCBvbiB0aGUgcnVuJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNsb2NrID0gc2lub24udXNlRmFrZVRpbWVycygpO1xuXHRcdGNvbnN0IHsgY29udHJvbGxlciwgZXZlbnRzIH0gPSBjcmVhdGVIb3BIYXJuZXNzKCk7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnRyb2xsZXIucmVxdWVzdCgxLCBmYWxzZSk7XG5cdFx0XHRjbG9jay50aWNrKDEwMCk7XG5cdFx0XHRjb250cm9sbGVyLmNhbmNlbCgpO1xuXHRcdFx0Y2xvY2sudGljaygxXzAwMCk7XG5cblx0XHRcdGNvbnRyb2xsZXIucmVxdWVzdCgxLCBmYWxzZSk7XG5cdFx0XHRjbG9jay50aWNrKDMwMCk7XG5cdFx0XHRjb250cm9sbGVyLnJlcXVlc3QoMSwgZmFsc2UpO1xuXHRcdFx0Y2xvY2sudGljaygzMDApO1xuXHRcdFx0Y29udHJvbGxlci5vbkFuaW1hdGlvbkNvbXBsZXRlKCk7XG5cdFx0XHRjb250cm9sbGVyLmNhbmNlbCgpO1xuXHRcdFx0Y2xvY2sudGljaygxXzAwMCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZXZlbnRzLCBbXG5cdFx0XHRcdCdkaXJlY3Rpb246MScsXG5cdFx0XHRcdCdyZXF1ZXN0Jyxcblx0XHRcdFx0J3N0YXJ0Jyxcblx0XHRcdFx0J2RpcmVjdGlvbjoxJyxcblx0XHRcdFx0J3JlcXVlc3QnLFxuXHRcdFx0XHQnc3RhcnQnLFxuXHRcdFx0XHQnbW92ZToyNDo3MicsXG5cdFx0XHRcdCdkaXJlY3Rpb246MScsXG5cdFx0XHRcdCdyZXF1ZXN0Jyxcblx0XHRcdF0pO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRjb250cm9sbGVyLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ21hcHMgY2hhdCBhY3Rpdml0eSB0byBwZXQgc3RhdGVzIGJ5IHByaW9yaXR5JywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoW1xuXHRcdFx0Z2V0Q2hhdFBldEJhc2VTdGF0ZShmYWxzZSwgZmFsc2UsIGZhbHNlLCBmYWxzZSwgZmFsc2UpLFxuXHRcdFx0Z2V0Q2hhdFBldEJhc2VTdGF0ZShmYWxzZSwgZmFsc2UsIGZhbHNlLCBmYWxzZSwgdHJ1ZSksXG5cdFx0XHRnZXRDaGF0UGV0QmFzZVN0YXRlKGZhbHNlLCBmYWxzZSwgZmFsc2UsIHRydWUsIGZhbHNlKSxcblx0XHRcdGdldENoYXRQZXRCYXNlU3RhdGUoZmFsc2UsIGZhbHNlLCBmYWxzZSwgdHJ1ZSwgdHJ1ZSksXG5cdFx0XHRnZXRDaGF0UGV0QmFzZVN0YXRlKHRydWUsIGZhbHNlLCBmYWxzZSwgdHJ1ZSwgdHJ1ZSksXG5cdFx0XHRnZXRDaGF0UGV0QmFzZVN0YXRlKHRydWUsIHRydWUsIGZhbHNlLCB0cnVlLCB0cnVlKSxcblx0XHRcdGdldENoYXRQZXRCYXNlU3RhdGUodHJ1ZSwgdHJ1ZSwgdHJ1ZSwgdHJ1ZSwgdHJ1ZSksXG5cdFx0XSwgW1xuXHRcdFx0J2lkbGUnLFxuXHRcdFx0J3NsZWVwJyxcblx0XHRcdCd0eXBpbmcnLFxuXHRcdFx0J3NsZWVwJyxcblx0XHRcdCdyZW5kZXJpbmcnLFxuXHRcdFx0J2NsYXBwaW5nJyxcblx0XHRcdCdpZGxlJyxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnbGltaXRzIGNvbmZpcm1hdGlvbiBhdHRlbnRpb24gdG8gdHdvIHNlY29uZHMnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKENIQVRfUEVUX0NPTkZJUk1BVElPTl9BVFRFTlRJT05fRFVSQVRJT04sIDJfMDAwKTtcblx0fSk7XG5cblx0dGVzdCgnb25seSBzaG93cyBpbiB0aGUgbGF0ZXN0IGZvY3VzZWQgY2hhdCB3aWRnZXQgd2hlbiBlbmFibGVkJywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoW1xuXHRcdFx0aXNDaGF0UGV0VmlzaWJsZShmYWxzZSwgZmFsc2UpLFxuXHRcdFx0aXNDaGF0UGV0VmlzaWJsZShmYWxzZSwgdHJ1ZSksXG5cdFx0XHRpc0NoYXRQZXRWaXNpYmxlKHRydWUsIGZhbHNlKSxcblx0XHRcdGlzQ2hhdFBldFZpc2libGUodHJ1ZSwgdHJ1ZSksXG5cdFx0XSwgW1xuXHRcdFx0ZmFsc2UsXG5cdFx0XHRmYWxzZSxcblx0XHRcdGZhbHNlLFxuXHRcdFx0dHJ1ZSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnYmxvY2tzIGtleWJvYXJkIGludGVyYWN0aW9uIHdoaWxlIHVuYXZhaWxhYmxlIG9yIGFscmVhZHkgaW50ZXJhY3RpbmcnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbXG5cdFx0XHRpc0NoYXRQZXRLZXlib2FyZEludGVyYWN0aW9uRW5hYmxlZChmYWxzZSwgZmFsc2UsIGZhbHNlLCBmYWxzZSwgZmFsc2UpLFxuXHRcdFx0aXNDaGF0UGV0S2V5Ym9hcmRJbnRlcmFjdGlvbkVuYWJsZWQodHJ1ZSwgdHJ1ZSwgZmFsc2UsIGZhbHNlLCBmYWxzZSksXG5cdFx0XHRpc0NoYXRQZXRLZXlib2FyZEludGVyYWN0aW9uRW5hYmxlZCh0cnVlLCBmYWxzZSwgdHJ1ZSwgZmFsc2UsIGZhbHNlKSxcblx0XHRcdGlzQ2hhdFBldEtleWJvYXJkSW50ZXJhY3Rpb25FbmFibGVkKHRydWUsIGZhbHNlLCBmYWxzZSwgdHJ1ZSwgZmFsc2UpLFxuXHRcdFx0aXNDaGF0UGV0S2V5Ym9hcmRJbnRlcmFjdGlvbkVuYWJsZWQodHJ1ZSwgZmFsc2UsIGZhbHNlLCBmYWxzZSwgdHJ1ZSksXG5cdFx0XHRpc0NoYXRQZXRLZXlib2FyZEludGVyYWN0aW9uRW5hYmxlZCh0cnVlLCBmYWxzZSwgZmFsc2UsIGZhbHNlLCBmYWxzZSksXG5cdFx0XSwgW1xuXHRcdFx0ZmFsc2UsXG5cdFx0XHRmYWxzZSxcblx0XHRcdGZhbHNlLFxuXHRcdFx0ZmFsc2UsXG5cdFx0XHRmYWxzZSxcblx0XHRcdHRydWUsXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc3RvcmVzIGEgY3VzdG9tIHBvc2l0aW9uIG9yIHVzZXMgdGhlIGRlZmF1bHQgcG9zaXRpb24gd2hlbiByZW9wZW5pbmcnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbXG5cdFx0XHRnZXRDaGF0UGV0UmVzdG9yZWRIb3Jpem9udGFsUG9zaXRpb24odW5kZWZpbmVkLCAyMCwgMjIwKSxcblx0XHRcdGdldENoYXRQZXRSZXN0b3JlZEhvcml6b250YWxQb3NpdGlvbig4MCwgMjAsIDIyMCksXG5cdFx0XHRnZXRDaGF0UGV0UmVzdG9yZWRIb3Jpem9udGFsUG9zaXRpb24oMCwgMjAsIDIyMCksXG5cdFx0XHRnZXRDaGF0UGV0UmVzdG9yZWRIb3Jpem9udGFsUG9zaXRpb24oMjQwLCAyMCwgMjIwKSxcblx0XHRdLCBbXG5cdFx0XHQxODgsXG5cdFx0XHQ4MCxcblx0XHRcdDIwLFxuXHRcdFx0MjIwLFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdnaXZlcyBkcmFnZ2luZyBwcmVjZWRlbmNlIG92ZXIgYmFzZSBhbmQgdHJhbnNpZW50IHN0YXRlcycsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFtcblx0XHRcdGdldENoYXRQZXRSZW5kZXJlZFN0YXRlKCdyZW5kZXJpbmcnLCB1bmRlZmluZWQsIGZhbHNlKSxcblx0XHRcdGdldENoYXRQZXRSZW5kZXJlZFN0YXRlKCdyZW5kZXJpbmcnLCAnY29tcGxldGUnLCBmYWxzZSksXG5cdFx0XHRnZXRDaGF0UGV0UmVuZGVyZWRTdGF0ZSgncmVuZGVyaW5nJywgdW5kZWZpbmVkLCB0cnVlKSxcblx0XHRcdGdldENoYXRQZXRSZW5kZXJlZFN0YXRlKCdyZW5kZXJpbmcnLCAnY29tcGxldGUnLCB0cnVlKSxcblx0XHRcdGdldENoYXRQZXRSZW5kZXJlZFN0YXRlKCdpZGxlJywgJ3lhcHBpbmdNb3V0aE9wZW4nLCBmYWxzZSksXG5cdFx0XHRnZXRDaGF0UGV0UmVuZGVyZWRTdGF0ZSgndHlwaW5nJywgJ3lhcHBpbmdNb3V0aE9wZW4nLCBmYWxzZSksXG5cdFx0XHRnZXRDaGF0UGV0UmVuZGVyZWRTdGF0ZSgncmVuZGVyaW5nJywgJ3lhcHBpbmcnLCBmYWxzZSksXG5cdFx0XHRnZXRDaGF0UGV0UmVuZGVyZWRTdGF0ZSgnc2xlZXAnLCAneWFwcGluZ01vdXRoT3BlbicsIGZhbHNlKSxcblx0XHRdLCBbXG5cdFx0XHQncmVuZGVyaW5nJyxcblx0XHRcdCdjb21wbGV0ZScsXG5cdFx0XHQnaWRsZScsXG5cdFx0XHQnaWRsZScsXG5cdFx0XHQneWFwcGluZ01vdXRoT3BlbicsXG5cdFx0XHQndHlwaW5nJyxcblx0XHRcdCdyZW5kZXJpbmcnLFxuXHRcdFx0J3NsZWVwJyxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnc2xlZXBzIGFmdGVyIHR3ZW50eSBzZWNvbmRzIG9mIGluYWN0aXZpdHknLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKENIQVRfUEVUX0lETEVfU0xFRVBfREVMQVksIDIwXzAwMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NlbGVjdHMgdGhlIGJ1ZGR5IGZvciB0aGUgcHJvZHVjdCBxdWFsaXR5JywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoW1xuXHRcdFx0Z2V0Q2hhdFBldEJ1ZGR5TmFtZSgnc3RhYmxlJyksXG5cdFx0XHRnZXRDaGF0UGV0QnVkZHlOYW1lKCdpbnNpZGVyJyksXG5cdFx0XHRnZXRDaGF0UGV0QnVkZHlOYW1lKHVuZGVmaW5lZCksXG5cdFx0XSwgW1xuXHRcdFx0J2J1ZGR5LWlkbGUtc3RhYmxlJyxcblx0XHRcdCdidWRkeS1pZGxlLWluc2lkZXJzJyxcblx0XHRcdCdidWRkeS1pZGxlLWluc2lkZXJzJyxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgncmVzb2x2ZXMgY29uZmlndXJlZCBhbmQgcHJvZHVjdCBwZXQgdmFyaWFudHMnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbXG5cdFx0XHRnZXRDaGF0UGV0VmFyaWFudCgnc3RhYmxlJywgJ2luc2lkZXInKSxcblx0XHRcdGdldENoYXRQZXRWYXJpYW50KCdpbnNpZGVycycsICdzdGFibGUnKSxcblx0XHRcdGdldENoYXRQZXRWYXJpYW50KHVuZGVmaW5lZCwgJ3N0YWJsZScpLFxuXHRcdFx0Z2V0Q2hhdFBldFZhcmlhbnQodW5kZWZpbmVkLCAnaW5zaWRlcicpLFxuXHRcdF0sIFtcblx0XHRcdCdzdGFibGUnLFxuXHRcdFx0J2luc2lkZXJzJyxcblx0XHRcdCdzdGFibGUnLFxuXHRcdFx0J2luc2lkZXJzJyxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnbG9ncyBwZXQgZW5hYmxlbWVudCBhdCBzdGFydHVwIGFuZCB3aGVuIHRvZ2dsZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdGVsZW1ldHJ5U2VydmljZSA9IG5ldyBUZXN0VGVsZW1ldHJ5U2VydmljZSgpO1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IENoYXRQZXRTZXJ2aWNlKGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdFN0b3JhZ2VTZXJ2aWNlKCkpLCB0ZWxlbWV0cnlTZXJ2aWNlKSk7XG5cblx0XHRzZXJ2aWNlLnRvZ2dsZSgpO1xuXHRcdHNlcnZpY2UudG9nZ2xlKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlbGVtZXRyeVNlcnZpY2UuZXZlbnRzLCBbXG5cdFx0XHR7IG5hbWU6ICdjaGF0UGV0RW5hYmxlbWVudCcsIGRhdGE6IHsgZW5hYmxlZDogZmFsc2UsIHNvdXJjZTogJ3N0YXJ0dXAnIH0gfSxcblx0XHRcdHsgbmFtZTogJ2NoYXRQZXRFbmFibGVtZW50JywgZGF0YTogeyBlbmFibGVkOiB0cnVlLCBzb3VyY2U6ICdjaGFuZ2UnIH0gfSxcblx0XHRcdHsgbmFtZTogJ2NoYXRQZXRFbmFibGVtZW50JywgZGF0YTogeyBlbmFibGVkOiBmYWxzZSwgc291cmNlOiAnY2hhbmdlJyB9IH0sXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NoYXJlcyBwZXQgc2NhbGUgdW50aWwgdGhlIHBldCBpcyBkaXNtaXNzZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQ2hhdFBldFNlcnZpY2UoZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0U3RvcmFnZVNlcnZpY2UoKSksIG5ldyBUZXN0VGVsZW1ldHJ5U2VydmljZSgpKSk7XG5cdFx0c2VydmljZS50b2dnbGUoKTtcblx0XHRzZXJ2aWNlLnNldFNjYWxlKDEuNCk7XG5cdFx0Y29uc3QgZmlyc3RDaGF0U2NhbGUgPSBzZXJ2aWNlLnNjYWxlLmdldCgpO1xuXHRcdGNvbnN0IHNlY29uZENoYXRTY2FsZSA9IHNlcnZpY2Uuc2NhbGUuZ2V0KCk7XG5cdFx0Y29uc3QgZGlzbWlzc2VkID0gc2VydmljZS50b2dnbGUoKTtcblx0XHRjb25zdCByZXNldFNjYWxlID0gc2VydmljZS5zY2FsZS5nZXQoKTtcblx0XHRjb25zdCByZXN0b3JlZCA9IHNlcnZpY2UudG9nZ2xlKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFtcblx0XHRcdGZpcnN0Q2hhdFNjYWxlLFxuXHRcdFx0c2Vjb25kQ2hhdFNjYWxlLFxuXHRcdFx0ZGlzbWlzc2VkLFxuXHRcdFx0cmVzZXRTY2FsZSxcblx0XHRcdHJlc3RvcmVkLFxuXHRcdFx0c2VydmljZS5zY2FsZS5nZXQoKSxcblx0XHRdLCBbXG5cdFx0XHQxLjQsXG5cdFx0XHQxLjQsXG5cdFx0XHRmYWxzZSxcblx0XHRcdDEsXG5cdFx0XHR0cnVlLFxuXHRcdFx0MSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnY3ljbGVzIHRocm91Z2ggY2xpY2sgaW50ZXJhY3Rpb25zIHdpdGhvdXQgcmVwZWF0aW5nIGFuZCByZXNlcnZlcyBvbmUgcGVyY2VudCBlYWNoIGZvciBpY29uIGFuZCB5YXBwaW5nJywgKCkgPT4ge1xuXHRcdGNvbnN0IGludGVyYWN0aW9uSW50ZXJ2YWwgPSAwLjk4IC8gNjtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoQ0hBVF9QRVRfSUNPTl9UUkFOU0ZPUk1BVElPTl9DSEFOQ0UsIDEgLyAxMDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChDSEFUX1BFVF9ZQVBQSU5HX0NIQU5DRSwgMSAvIDEwMCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbXG5cdFx0XHRnZXRDaGF0UGV0Q2xpY2tJbnRlcmFjdGlvbigwKSxcblx0XHRcdGdldENoYXRQZXRDbGlja0ludGVyYWN0aW9uKDAuMDA5Xzk5OSksXG5cdFx0XHRnZXRDaGF0UGV0Q2xpY2tJbnRlcmFjdGlvbigwLjAxKSxcblx0XHRcdGdldENoYXRQZXRDbGlja0ludGVyYWN0aW9uKDAuMDE5Xzk5OSksXG5cdFx0XHRnZXRDaGF0UGV0Q2xpY2tJbnRlcmFjdGlvbigwLjAyKSxcblx0XHRcdGdldENoYXRQZXRDbGlja0ludGVyYWN0aW9uKDAuMDIgKyBpbnRlcmFjdGlvbkludGVydmFsICogMS41KSxcblx0XHRcdGdldENoYXRQZXRDbGlja0ludGVyYWN0aW9uKDAuMDIgKyBpbnRlcmFjdGlvbkludGVydmFsICogMi41KSxcblx0XHRcdGdldENoYXRQZXRDbGlja0ludGVyYWN0aW9uKDAuMDIgKyBpbnRlcmFjdGlvbkludGVydmFsICogMy41KSxcblx0XHRcdGdldENoYXRQZXRDbGlja0ludGVyYWN0aW9uKDAuMDIgKyBpbnRlcmFjdGlvbkludGVydmFsICogNC41KSxcblx0XHRcdGdldENoYXRQZXRDbGlja0ludGVyYWN0aW9uKDAuMDIgKyBpbnRlcmFjdGlvbkludGVydmFsICogNS41KSxcblx0XHRcdGdldENoYXRQZXRDbGlja0ludGVyYWN0aW9uKDAuOTkpLFxuXHRcdFx0Z2V0Q2hhdFBldENsaWNrSW50ZXJhY3Rpb24oMC4wMiwgJ2J1dHRvblByZXNzJyksXG5cdFx0XHRnZXRDaGF0UGV0Q2xpY2tJbnRlcmFjdGlvbigwLjk5LCAnd29ycnknKSxcblx0XHRdLCBbXG5cdFx0XHQnY29tcGxldGUnLFxuXHRcdFx0J2NvbXBsZXRlJyxcblx0XHRcdCd5YXBwaW5nJyxcblx0XHRcdCd5YXBwaW5nJyxcblx0XHRcdCdidXR0b25QcmVzcycsXG5cdFx0XHQnbG92ZScsXG5cdFx0XHQnY29vbCcsXG5cdFx0XHQnc2luZycsXG5cdFx0XHQnc3BlZWNobGVzcycsXG5cdFx0XHQnd29ycnknLFxuXHRcdFx0J3dvcnJ5Jyxcblx0XHRcdCdsb3ZlJyxcblx0XHRcdCdzcGVlY2hsZXNzJyxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnYmxpbmtzIGZpeGVkIGV5ZXMgZHVyaW5nIHR5cGluZywgbG92ZSwgYW5kIGJ1dHRvbiBwcmVzcycsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFtcblx0XHRcdGRvZXNDaGF0UGV0U3RhdGVCbGluaygndHlwaW5nJyksXG5cdFx0XHRkb2VzQ2hhdFBldFN0YXRlQmxpbmsoJ2xvdmUnKSxcblx0XHRcdGRvZXNDaGF0UGV0U3RhdGVCbGluaygnYnV0dG9uUHJlc3MnKSxcblx0XHRcdGRvZXNDaGF0UGV0U3RhdGVCbGluaygnYnV0dG9uUHJlc3MnLCA0KSxcblx0XHRcdGRvZXNDaGF0UGV0U3RhdGVCbGluaygnYnV0dG9uUHJlc3MnLCA1KSxcblx0XHRcdGRvZXNDaGF0UGV0U3RhdGVCbGluaygnaWRsZScpLFxuXHRcdFx0ZG9lc0NoYXRQZXRTdGF0ZUJsaW5rKCdyZW5kZXJpbmcnKSxcblx0XHRcdGRvZXNDaGF0UGV0U3RhdGVCbGluayh1bmRlZmluZWQpLFxuXHRcdF0sIFtcblx0XHRcdHRydWUsXG5cdFx0XHR0cnVlLFxuXHRcdFx0dHJ1ZSxcblx0XHRcdHRydWUsXG5cdFx0XHRmYWxzZSxcblx0XHRcdGZhbHNlLFxuXHRcdFx0ZmFsc2UsXG5cdFx0XHRmYWxzZSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnZGlzYWJsZXMgY3Vyc29yIHRyYWNraW5nIGZvciBmaXhlZC1leWUgc3ByaXRlIHN0YXRlcycsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGlkbGU6IGRvZXNDaGF0UGV0U3RhdGVUcmFja0N1cnNvcignaWRsZScpLFxuXHRcdFx0c2xlZXA6IGRvZXNDaGF0UGV0U3RhdGVUcmFja0N1cnNvcignc2xlZXAnKSxcblx0XHRcdHdha2luZzogZG9lc0NoYXRQZXRTdGF0ZVRyYWNrQ3Vyc29yKCd3YWtpbmcnKSxcblx0XHRcdHR5cGluZzogZG9lc0NoYXRQZXRTdGF0ZVRyYWNrQ3Vyc29yKCd0eXBpbmcnKSxcblx0XHRcdHJlbmRlcmluZzogZG9lc0NoYXRQZXRTdGF0ZVRyYWNrQ3Vyc29yKCdyZW5kZXJpbmcnKSxcblx0XHRcdGJ1dHRvblByZXNzOiBkb2VzQ2hhdFBldFN0YXRlVHJhY2tDdXJzb3IoJ2J1dHRvblByZXNzJyksXG5cdFx0XHRjb21wbGV0ZTogZG9lc0NoYXRQZXRTdGF0ZVRyYWNrQ3Vyc29yKCdjb21wbGV0ZScpLFxuXHRcdFx0anVtcDogZG9lc0NoYXRQZXRTdGF0ZVRyYWNrQ3Vyc29yKCdqdW1wJyksXG5cdFx0XHRsb3ZlOiBkb2VzQ2hhdFBldFN0YXRlVHJhY2tDdXJzb3IoJ2xvdmUnKSxcblx0XHRcdGNvb2w6IGRvZXNDaGF0UGV0U3RhdGVUcmFja0N1cnNvcignY29vbCcpLFxuXHRcdFx0eWFwcGluZzogZG9lc0NoYXRQZXRTdGF0ZVRyYWNrQ3Vyc29yKCd5YXBwaW5nJyksXG5cdFx0XHR5YXBwaW5nTW91dGhPcGVuOiBkb2VzQ2hhdFBldFN0YXRlVHJhY2tDdXJzb3IoJ3lhcHBpbmdNb3V0aE9wZW4nKSxcblx0XHRcdHNpbmc6IGRvZXNDaGF0UGV0U3RhdGVUcmFja0N1cnNvcignc2luZycpLFxuXHRcdFx0c3BlZWNobGVzczogZG9lc0NoYXRQZXRTdGF0ZVRyYWNrQ3Vyc29yKCdzcGVlY2hsZXNzJyksXG5cdFx0XHR3b3JyeTogZG9lc0NoYXRQZXRTdGF0ZVRyYWNrQ3Vyc29yKCd3b3JyeScpLFxuXHRcdFx0ZGl6enk6IGRvZXNDaGF0UGV0U3RhdGVUcmFja0N1cnNvcignZGl6enknKSxcblx0XHRcdGZhbGxpbmc6IGRvZXNDaGF0UGV0U3RhdGVUcmFja0N1cnNvcignZmFsbGluZycpLFxuXHRcdFx0d2FsbEltcGFjdDogZG9lc0NoYXRQZXRTdGF0ZVRyYWNrQ3Vyc29yKCd3YWxsSW1wYWN0JyksXG5cdFx0XHRzcGxhdDogZG9lc0NoYXRQZXRTdGF0ZVRyYWNrQ3Vyc29yKCdzcGxhdCcpLFxuXHRcdFx0b25UaGVSdW46IGRvZXNDaGF0UGV0U3RhdGVUcmFja0N1cnNvcignb25UaGVSdW4nKSxcblx0XHRcdHNlYXJjaGluZzogZG9lc0NoYXRQZXRTdGF0ZVRyYWNrQ3Vyc29yKCdzZWFyY2hpbmcnKSxcblx0XHR9LCB7XG5cdFx0XHRpZGxlOiB0cnVlLFxuXHRcdFx0c2xlZXA6IGZhbHNlLFxuXHRcdFx0d2FraW5nOiBmYWxzZSxcblx0XHRcdHR5cGluZzogZmFsc2UsXG5cdFx0XHRyZW5kZXJpbmc6IHRydWUsXG5cdFx0XHRidXR0b25QcmVzczogZmFsc2UsXG5cdFx0XHRjb21wbGV0ZTogZmFsc2UsXG5cdFx0XHRqdW1wOiBmYWxzZSxcblx0XHRcdGxvdmU6IGZhbHNlLFxuXHRcdFx0Y29vbDogZmFsc2UsXG5cdFx0XHR5YXBwaW5nOiB0cnVlLFxuXHRcdFx0eWFwcGluZ01vdXRoT3BlbjogZmFsc2UsXG5cdFx0XHRzaW5nOiBmYWxzZSxcblx0XHRcdHNwZWVjaGxlc3M6IGZhbHNlLFxuXHRcdFx0d29ycnk6IGZhbHNlLFxuXHRcdFx0ZGl6enk6IGZhbHNlLFxuXHRcdFx0ZmFsbGluZzogZmFsc2UsXG5cdFx0XHR3YWxsSW1wYWN0OiBmYWxzZSxcblx0XHRcdHNwbGF0OiBmYWxzZSxcblx0XHRcdG9uVGhlUnVuOiBmYWxzZSxcblx0XHRcdHNlYXJjaGluZzogZmFsc2UsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3RyYWNrcyBib2R5IGZhY2luZyB3aGlsZSBpZGxlIGFuZCBsb2NrcyBpdCBkdXJpbmcgYW5pbWF0aW9ucycsICgpID0+IHtcblx0XHRjb25zdCBjb250cm9sbGVyID0gbmV3IENoYXRQZXRGYWNpbmdDb250cm9sbGVyKCk7XG5cdFx0Y29uc3QgZGlyZWN0aW9ucyA9IFtjb250cm9sbGVyLmRpcmVjdGlvbl07XG5cblx0XHRjb250cm9sbGVyLnNldFN0YXRlKCdpZGxlJywgZmFsc2UpO1xuXHRcdGRpcmVjdGlvbnMucHVzaChjb250cm9sbGVyLnVwZGF0ZSgtMTAsIDApKTtcblx0XHRjb250cm9sbGVyLnNldFN0YXRlKCd0eXBpbmcnLCBmYWxzZSk7XG5cdFx0ZGlyZWN0aW9ucy5wdXNoKGNvbnRyb2xsZXIudXBkYXRlKDEwLCAwKSk7XG5cdFx0Y29udHJvbGxlci5zZXRTdGF0ZSgnYnV0dG9uUHJlc3MnLCBmYWxzZSk7XG5cdFx0ZGlyZWN0aW9ucy5wdXNoKGNvbnRyb2xsZXIudXBkYXRlKDEwLCAwKSk7XG5cdFx0Y29udHJvbGxlci5zZXRTdGF0ZSgnc2luZycsIGZhbHNlKTtcblx0XHRkaXJlY3Rpb25zLnB1c2goY29udHJvbGxlci51cGRhdGUoMTAsIDApKTtcblx0XHRjb250cm9sbGVyLnNldFN0YXRlKCdpZGxlJywgZmFsc2UpO1xuXHRcdGRpcmVjdGlvbnMucHVzaChjb250cm9sbGVyLnVwZGF0ZSgxMCwgMCkpO1xuXHRcdGNvbnRyb2xsZXIuc2V0U3RhdGUoJ2lkbGUnLCB0cnVlKTtcblx0XHRkaXJlY3Rpb25zLnB1c2goY29udHJvbGxlci51cGRhdGUoLTEwLCAwKSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGRpcmVjdGlvbnMsIFtcblx0XHRcdCdyaWdodCcsXG5cdFx0XHQnbGVmdCcsXG5cdFx0XHQnbGVmdCcsXG5cdFx0XHQnbGVmdCcsXG5cdFx0XHQnbGVmdCcsXG5cdFx0XHQncmlnaHQnLFxuXHRcdFx0J3JpZ2h0Jyxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnc25hcHNob3RzIHRoZSBzcGxhdCBkaXJlY3Rpb24gYWZ0ZXIgZmFsbGluZyBhbmQgbG9ja3MgaXQgZHVyaW5nIHRoZSBhbmltYXRpb24nLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IG5ldyBDaGF0UGV0RmFjaW5nQ29udHJvbGxlcigpO1xuXG5cdFx0Y29udHJvbGxlci5zZXRTdGF0ZSgnZmFsbGluZycsIGZhbHNlKTtcblx0XHRjb25zdCBmYWxsaW5nRGlyZWN0aW9uID0gY29udHJvbGxlci51cGRhdGUoLTEwLCAwKTtcblx0XHRjb25zdCBzcGxhdERpcmVjdGlvbiA9IGNvbnRyb2xsZXIuc25hcFRvQ3Vyc29yKC0xMCwgMCk7XG5cdFx0Y29udHJvbGxlci5zZXRTdGF0ZSgnc3BsYXQnLCBmYWxzZSk7XG5cdFx0Y29uc3Qgc3BsYXREaXJlY3Rpb25BZnRlclBvaW50ZXJNb3ZlID0gY29udHJvbGxlci51cGRhdGUoMTAsIDApO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRmYWxsaW5nRGlyZWN0aW9uLFxuXHRcdFx0c3BsYXREaXJlY3Rpb24sXG5cdFx0XHRzcGxhdERpcmVjdGlvbkFmdGVyUG9pbnRlck1vdmUsXG5cdFx0fSwge1xuXHRcdFx0ZmFsbGluZ0RpcmVjdGlvbjogJ3JpZ2h0Jyxcblx0XHRcdHNwbGF0RGlyZWN0aW9uOiAnbGVmdCcsXG5cdFx0XHRzcGxhdERpcmVjdGlvbkFmdGVyUG9pbnRlck1vdmU6ICdsZWZ0Jyxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0cyBkaXp6eSBhZnRlciByYXBpZCBkaXJlY3Rpb24gY2hhbmdlcyBhbmQgcmVzZXRzIHNsb3cgc2VxdWVuY2VzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBuZXcgQ2hhdFBldERpcmVjdGlvbkNoYW5nZUNvbnRyb2xsZXIoMywgNTAwKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoW1xuXHRcdFx0Y29udHJvbGxlci5yZWNvcmQoJ2xlZnQnLCAwKSxcblx0XHRcdGNvbnRyb2xsZXIucmVjb3JkKCdsZWZ0JywgNTApLFxuXHRcdFx0Y29udHJvbGxlci5yZWNvcmQoJ3JpZ2h0JywgMTAwKSxcblx0XHRcdGNvbnRyb2xsZXIucmVjb3JkKCdsZWZ0JywgMjAwKSxcblx0XHRcdGNvbnRyb2xsZXIucmVjb3JkKCdyaWdodCcsIDMwMCksXG5cdFx0XHRjb250cm9sbGVyLnJlY29yZCgnbGVmdCcsIDQwMCksXG5cdFx0XHRjb250cm9sbGVyLnJlY29yZCgncmlnaHQnLCAxXzAwMCksXG5cdFx0XHRjb250cm9sbGVyLnJlY29yZCgnbGVmdCcsIDFfMTAwKSxcblx0XHRcdGNvbnRyb2xsZXIucmVjb3JkKCdyaWdodCcsIDFfMjAwKSxcblx0XHRdLCBbXG5cdFx0XHRmYWxzZSxcblx0XHRcdGZhbHNlLFxuXHRcdFx0ZmFsc2UsXG5cdFx0XHRmYWxzZSxcblx0XHRcdHRydWUsXG5cdFx0XHRmYWxzZSxcblx0XHRcdGZhbHNlLFxuXHRcdFx0ZmFsc2UsXG5cdFx0XHR0cnVlLFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdtYXBzIGFjdGl2aXR5IGFuZCBpbnRlcmFjdGlvbiBzdGF0ZXMgdG8gdGhlaXIgc3ByaXRlcycsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFtcblx0XHRcdGdldENoYXRQZXRTcHJpdGVOYW1lKCdjb21wbGV0ZScsICdpbnNpZGVyJyksXG5cdFx0XHRnZXRDaGF0UGV0U3ByaXRlTmFtZSgnYnV0dG9uUHJlc3MnLCAnaW5zaWRlcicpLFxuXHRcdFx0Z2V0Q2hhdFBldFNwcml0ZU5hbWUoJ3NsZWVwJywgJ2luc2lkZXInKSxcblx0XHRcdGdldENoYXRQZXRTcHJpdGVOYW1lKCd3YWtpbmcnLCAnc3RhYmxlJyksXG5cdFx0XHRnZXRDaGF0UGV0U3ByaXRlTmFtZSgndHlwaW5nJywgJ2luc2lkZXInKSxcblx0XHRcdGdldENoYXRQZXRTcHJpdGVOYW1lKCdyZW5kZXJpbmcnLCAnc3RhYmxlJyksXG5cdFx0XHRnZXRDaGF0UGV0U3ByaXRlTmFtZSgnY29vbCcsICdzdGFibGUnKSxcblx0XHRcdGdldENoYXRQZXRTcHJpdGVOYW1lKCdzZWFyY2hpbmcnLCAnc3RhYmxlJyksXG5cdFx0XHRnZXRDaGF0UGV0U3ByaXRlTmFtZSgneWFwcGluZ01vdXRoT3BlbicsICdpbnNpZGVyJyksXG5cdFx0XHRnZXRDaGF0UGV0U3ByaXRlTmFtZSgnc2luZycsICdzdGFibGUnKSxcblx0XHRcdGdldENoYXRQZXRTcHJpdGVOYW1lKCdzaW5nJywgJ2luc2lkZXInKSxcblx0XHRcdGdldENoYXRQZXRTcHJpdGVOYW1lKCdzcGVlY2hsZXNzJywgJ3N0YWJsZScpLFxuXHRcdFx0Z2V0Q2hhdFBldFNwcml0ZU5hbWUoJ3NwZWVjaGxlc3MnLCAnaW5zaWRlcicpLFxuXHRcdFx0Z2V0Q2hhdFBldFNwcml0ZU5hbWUoJ3dvcnJ5JywgJ3N0YWJsZScpLFxuXHRcdFx0Z2V0Q2hhdFBldFNwcml0ZU5hbWUoJ3dvcnJ5JywgJ2luc2lkZXInKSxcblx0XHRcdGdldENoYXRQZXRTcHJpdGVOYW1lKCdkaXp6eScsICdzdGFibGUnKSxcblx0XHRcdGdldENoYXRQZXRTcHJpdGVOYW1lKCdkaXp6eScsICdpbnNpZGVyJyksXG5cdFx0XHRnZXRDaGF0UGV0U3ByaXRlTmFtZSgnZmFsbGluZycsICdzdGFibGUnKSxcblx0XHRcdGdldENoYXRQZXRTcHJpdGVOYW1lKCd3YWxsSW1wYWN0JywgJ3N0YWJsZScpLFxuXHRcdFx0Z2V0Q2hhdFBldFNwcml0ZU5hbWUoJ3dhbGxJbXBhY3QnLCAnaW5zaWRlcicpLFxuXHRcdFx0Z2V0Q2hhdFBldFNwcml0ZU5hbWUoJ2p1bXAnLCAnc3RhYmxlJyksXG5cdFx0XHRnZXRDaGF0UGV0U3ByaXRlTmFtZSgnanVtcCcsICdpbnNpZGVyJyksXG5cdFx0XHRnZXRDaGF0UGV0U3ByaXRlTmFtZSgnc3BsYXQnLCAnaW5zaWRlcicpLFxuXHRcdF0sIFtcblx0XHRcdCdidWRkeS1pZGxlLWluc2lkZXJzJyxcblx0XHRcdCdidWRkeS1wcmVzcy1idXR0b24taW5zaWRlcnMnLFxuXHRcdFx0J2J1ZGR5LXNsZWVwLWluc2lkZXJzJyxcblx0XHRcdCdidWRkeS13YWtpbmctc3RhYmxlJyxcblx0XHRcdCdidWRkeS10eXBpbmctaW5zaWRlcnMnLFxuXHRcdFx0J2J1ZGR5LXJlbmRlcmluZy1zdGFibGUnLFxuXHRcdFx0J2J1ZGR5LWNvb2wtc3RhYmxlJyxcblx0XHRcdCdidWRkeS1zZWFyY2gtc3RhYmxlJyxcblx0XHRcdCdidWRkeS15YXBwaW5nLWluc2lkZXJzJyxcblx0XHRcdCdidWRkeS1zaW5nLXN0YWJsZScsXG5cdFx0XHQnYnVkZHktc2luZy1pbnNpZGVycycsXG5cdFx0XHQnYnVkZHktc3BlZWNobGVzcy1zdGFibGUnLFxuXHRcdFx0J2J1ZGR5LXNwZWVjaGxlc3MtaW5zaWRlcnMnLFxuXHRcdFx0J2J1ZGR5LXdvcnJ5LXN0YWJsZScsXG5cdFx0XHQnYnVkZHktd29ycnktaW5zaWRlcnMnLFxuXHRcdFx0J2J1ZGR5LWRpenp5LXN0YWJsZScsXG5cdFx0XHQnYnVkZHktZGl6enktaW5zaWRlcnMnLFxuXHRcdFx0J2J1ZGR5LWZhbGxpbmctc3RhYmxlJyxcblx0XHRcdCdidWRkeS13YWxsLWltcGFjdC1zdGFibGUnLFxuXHRcdFx0J2J1ZGR5LXdhbGwtaW1wYWN0LWluc2lkZXJzJyxcblx0XHRcdCdidWRkeS1qdW1wLXN0YWJsZScsXG5cdFx0XHQnYnVkZHktanVtcC1pbnNpZGVycycsXG5cdFx0XHQnYnVkZHktc3BsYXQtaW5zaWRlcnMnLFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdwcmVzZXJ2ZXMgdGhlIHNvdXJjZSBhbmltYXRpb24gdGltaW5nJywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoW1xuXHRcdFx0Z2V0Q2hhdFBldEZyYW1lRHVyYXRpb25zKCdpZGxlJyksXG5cdFx0XHRnZXRDaGF0UGV0RnJhbWVEdXJhdGlvbnMoJ3NsZWVwJyksXG5cdFx0XHRnZXRDaGF0UGV0RnJhbWVEdXJhdGlvbnMoJ3dha2luZycpLFxuXHRcdFx0Z2V0Q2hhdFBldEZyYW1lRHVyYXRpb25zKCd0eXBpbmcnKSxcblx0XHRcdGdldENoYXRQZXRGcmFtZUR1cmF0aW9ucygncmVuZGVyaW5nJyksXG5cdFx0XHRnZXRDaGF0UGV0RnJhbWVEdXJhdGlvbnMoJ2J1dHRvblByZXNzJyksXG5cdFx0XHRnZXRDaGF0UGV0RnJhbWVEdXJhdGlvbnMoJ2NsYXBwaW5nJyksXG5cdFx0XHRnZXRDaGF0UGV0RnJhbWVEdXJhdGlvbnMoJ2xvdmUnKSxcblx0XHRcdGdldENoYXRQZXRGcmFtZUR1cmF0aW9ucygnY29vbCcpLFxuXHRcdFx0Z2V0Q2hhdFBldEZyYW1lRHVyYXRpb25zKCdzaW5nJyksXG5cdFx0XHRnZXRDaGF0UGV0RnJhbWVEdXJhdGlvbnMoJ3NwZWVjaGxlc3MnKSxcblx0XHRcdGdldENoYXRQZXRGcmFtZUR1cmF0aW9ucygnd29ycnknKSxcblx0XHRcdGdldENoYXRQZXRGcmFtZUR1cmF0aW9ucygnZGl6enknKSxcblx0XHRcdGdldENoYXRQZXRGcmFtZUR1cmF0aW9ucygnc2VhcmNoaW5nJyksXG5cdFx0XHRnZXRDaGF0UGV0RnJhbWVEdXJhdGlvbnMoJ3lhcHBpbmcnKSxcblx0XHRcdGdldENoYXRQZXRGcmFtZUR1cmF0aW9ucygneWFwcGluZ01vdXRoT3BlbicpLFxuXHRcdFx0Z2V0Q2hhdFBldEZyYW1lRHVyYXRpb25zKCdmYWxsaW5nJyksXG5cdFx0XHRnZXRDaGF0UGV0RnJhbWVEdXJhdGlvbnMoJ3dhbGxJbXBhY3QnKSxcblx0XHRcdGdldENoYXRQZXRGcmFtZUR1cmF0aW9ucygnanVtcCcpLFxuXHRcdFx0Z2V0Q2hhdFBldEZyYW1lRHVyYXRpb25zKCdzcGxhdCcpLFxuXHRcdFx0Z2V0Q2hhdFBldFJlc3Bhd25GcmFtZUR1cmF0aW9ucygpLFxuXHRcdFx0Z2V0Q2hhdFBldFNwZWVjaEZyYW1lRHVyYXRpb25zKCksXG5cdFx0XSwgW1xuXHRcdFx0QXJyYXkuZnJvbSh7IGxlbmd0aDogNTAgfSwgKCkgPT4gNDApLFxuXHRcdFx0QXJyYXkuZnJvbSh7IGxlbmd0aDogOCB9LCAoKSA9PiAzMDApLFxuXHRcdFx0WzE2MCwgMTAwLCA4MCwgOTAsIDkwLCA5MCwgMTAwLCAxNzBdLFxuXHRcdFx0WzMyMCwgNDgwXSxcblx0XHRcdEFycmF5LmZyb20oeyBsZW5ndGg6IDUwIH0sICgpID0+IDQwKSxcblx0XHRcdFs1MDAsIDMwMCwgMzUwLCAyNTAsIDQ1MCwgMV8wMDBdLFxuXHRcdFx0WzgwLCA0MCwgNDAsIDQwLCA4MCwgNDAsIDQwLCA0MCwgNDAsIDgwLCA0MCwgNDAsIDgwXSxcblx0XHRcdFsyMDAsIDIwMCwgMzgwLCAxMDAsIDgwLCAxXzk4MF0sXG5cdFx0XHRbNjAwLCAxMjAsIDEyMCwgMTIwLCAxNjAsIDgwLCA4MCwgODAsIDFfNjQwXSxcblx0XHRcdFsxODAsIDE4MCwgMTgwLCAxODBdLFxuXHRcdFx0WzQwMCwgMTIwLCAxXzAwMCwgMTIwLCAxXzA4MF0sXG5cdFx0XHRbNjAwLCA2MDBdLFxuXHRcdFx0QXJyYXkuZnJvbSh7IGxlbmd0aDogOCB9LCAoKSA9PiAxMjApLFxuXHRcdFx0WzUwMCwgNTAwLCA1MDAsIDUwMF0sXG5cdFx0XHRbXSxcblx0XHRcdFtdLFxuXHRcdFx0WzEyMCwgODAsIDgwLCAxMjAsIDgwLCA4MF0sXG5cdFx0XHRbXSxcblx0XHRcdFs3MCwgODAsIDkwLCAxNjAsIDEwMCwgMTAwXSxcblx0XHRcdFsxMjAsIDEwMCwgMTAwLCAyMDBdLFxuXHRcdFx0WzEyMCwgMTAwLCAxMjAsIDI0MCwgMTAwLCAxMjBdLFxuXHRcdFx0WzIyMCwgMjIwLCAyMjAsIDEwMCwgMTYwLCAxODBdLFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzZWxlY3RzIGFuaW1hdGlvbiBmcmFtZXMgYW5kIGNvbXBsZXRlcyBvbiB0aGUgZmluYWwgZnJhbWUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZnJhbWVEdXJhdGlvbnMgPSBbMTAwLCA1MCwgMTUwXTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFtcblx0XHRcdGdldENoYXRQZXRBbmltYXRpb25GcmFtZShbXSwgMCwgMSksXG5cdFx0XHRnZXRDaGF0UGV0QW5pbWF0aW9uRnJhbWUoZnJhbWVEdXJhdGlvbnMsIC0xLCAxKSxcblx0XHRcdGdldENoYXRQZXRBbmltYXRpb25GcmFtZShmcmFtZUR1cmF0aW9ucywgOTksIDEpLFxuXHRcdFx0Z2V0Q2hhdFBldEFuaW1hdGlvbkZyYW1lKGZyYW1lRHVyYXRpb25zLCAxMDAsIDEpLFxuXHRcdFx0Z2V0Q2hhdFBldEFuaW1hdGlvbkZyYW1lKGZyYW1lRHVyYXRpb25zLCAxNDksIDEpLFxuXHRcdFx0Z2V0Q2hhdFBldEFuaW1hdGlvbkZyYW1lKGZyYW1lRHVyYXRpb25zLCAxNTAsIDEpLFxuXHRcdFx0Z2V0Q2hhdFBldEFuaW1hdGlvbkZyYW1lKGZyYW1lRHVyYXRpb25zLCAyOTksIDEpLFxuXHRcdFx0Z2V0Q2hhdFBldEFuaW1hdGlvbkZyYW1lKGZyYW1lRHVyYXRpb25zLCAzMDAsIDEpLFxuXHRcdFx0Z2V0Q2hhdFBldEFuaW1hdGlvbkZyYW1lKGZyYW1lRHVyYXRpb25zLCAzMDAsIEluZmluaXR5KSxcblx0XHRcdGdldENoYXRQZXRBbmltYXRpb25GcmFtZShmcmFtZUR1cmF0aW9ucywgNjAwLCAyKSxcblx0XHRcdGdldENoYXRQZXRBbmltYXRpb25GcmFtZShmcmFtZUR1cmF0aW9ucywgLTEsIDEsIHRydWUpLFxuXHRcdFx0Z2V0Q2hhdFBldEFuaW1hdGlvbkZyYW1lKGZyYW1lRHVyYXRpb25zLCAxNDksIDEsIHRydWUpLFxuXHRcdFx0Z2V0Q2hhdFBldEFuaW1hdGlvbkZyYW1lKGZyYW1lRHVyYXRpb25zLCAxNTAsIDEsIHRydWUpLFxuXHRcdFx0Z2V0Q2hhdFBldEFuaW1hdGlvbkZyYW1lKGZyYW1lRHVyYXRpb25zLCAxOTksIDEsIHRydWUpLFxuXHRcdFx0Z2V0Q2hhdFBldEFuaW1hdGlvbkZyYW1lKGZyYW1lRHVyYXRpb25zLCAyMDAsIDEsIHRydWUpLFxuXHRcdFx0Z2V0Q2hhdFBldEFuaW1hdGlvbkZyYW1lKGZyYW1lRHVyYXRpb25zLCAyOTksIDEsIHRydWUpLFxuXHRcdFx0Z2V0Q2hhdFBldEFuaW1hdGlvbkZyYW1lKGZyYW1lRHVyYXRpb25zLCAzMDAsIDEsIHRydWUpLFxuXHRcdF0sIFtcblx0XHRcdHsgZnJhbWVJbmRleDogMCwgY29tcGxldGU6IHRydWUgfSxcblx0XHRcdHsgZnJhbWVJbmRleDogMCwgY29tcGxldGU6IGZhbHNlLCBuZXh0RnJhbWVEZWxheTogMTAwIH0sXG5cdFx0XHR7IGZyYW1lSW5kZXg6IDAsIGNvbXBsZXRlOiBmYWxzZSwgbmV4dEZyYW1lRGVsYXk6IDEgfSxcblx0XHRcdHsgZnJhbWVJbmRleDogMSwgY29tcGxldGU6IGZhbHNlLCBuZXh0RnJhbWVEZWxheTogNTAgfSxcblx0XHRcdHsgZnJhbWVJbmRleDogMSwgY29tcGxldGU6IGZhbHNlLCBuZXh0RnJhbWVEZWxheTogMSB9LFxuXHRcdFx0eyBmcmFtZUluZGV4OiAyLCBjb21wbGV0ZTogZmFsc2UsIG5leHRGcmFtZURlbGF5OiAxNTAgfSxcblx0XHRcdHsgZnJhbWVJbmRleDogMiwgY29tcGxldGU6IGZhbHNlLCBuZXh0RnJhbWVEZWxheTogMSB9LFxuXHRcdFx0eyBmcmFtZUluZGV4OiAyLCBjb21wbGV0ZTogdHJ1ZSB9LFxuXHRcdFx0eyBmcmFtZUluZGV4OiAwLCBjb21wbGV0ZTogZmFsc2UsIG5leHRGcmFtZURlbGF5OiAxMDAgfSxcblx0XHRcdHsgZnJhbWVJbmRleDogMiwgY29tcGxldGU6IHRydWUgfSxcblx0XHRcdHsgZnJhbWVJbmRleDogMiwgY29tcGxldGU6IGZhbHNlLCBuZXh0RnJhbWVEZWxheTogMTUwIH0sXG5cdFx0XHR7IGZyYW1lSW5kZXg6IDIsIGNvbXBsZXRlOiBmYWxzZSwgbmV4dEZyYW1lRGVsYXk6IDEgfSxcblx0XHRcdHsgZnJhbWVJbmRleDogMSwgY29tcGxldGU6IGZhbHNlLCBuZXh0RnJhbWVEZWxheTogNTAgfSxcblx0XHRcdHsgZnJhbWVJbmRleDogMSwgY29tcGxldGU6IGZhbHNlLCBuZXh0RnJhbWVEZWxheTogMSB9LFxuXHRcdFx0eyBmcmFtZUluZGV4OiAwLCBjb21wbGV0ZTogZmFsc2UsIG5leHRGcmFtZURlbGF5OiAxMDAgfSxcblx0XHRcdHsgZnJhbWVJbmRleDogMCwgY29tcGxldGU6IGZhbHNlLCBuZXh0RnJhbWVEZWxheTogMSB9LFxuXHRcdFx0eyBmcmFtZUluZGV4OiAwLCBjb21wbGV0ZTogdHJ1ZSB9LFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdtYXRjaGVzIHNwcml0ZSBzb3VyY2VzIHdpdGhvdXQgYnJvd3NlciBVUkwgbm9ybWFsaXphdGlvbicsICgpID0+IHtcblx0XHRjb25zdCBzb3VyY2UgPSAndnNjb2RlLWZpbGU6Ly92c2NvZGUtYXBwL0FwcGxpY2F0aW9ucy9WaXN1YWwgU3R1ZGlvIENvZGUgLSBJbnNpZGVycy5hcHAvcGV0LmdpZic7XG5cdFx0Y29uc3QgaW1hZ2UgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdpbWcnKTtcblx0XHRpbWFnZS5zcmMgPSBzb3VyY2U7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFtcblx0XHRcdGltYWdlLnNyYyA9PT0gc291cmNlLFxuXHRcdFx0aXNDaGF0UGV0SW1hZ2VTb3VyY2UoaW1hZ2UsIHNvdXJjZSksXG5cdFx0XSwgW1xuXHRcdFx0ZmFsc2UsXG5cdFx0XHR0cnVlLFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdtYXBzIHRoZSBjdXJzb3IgdG8gcGl4ZWwtc25hcHBlZCBnYXplIGRpcmVjdGlvbnMnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbXG5cdFx0XHRnZXRDaGF0UGV0R2F6ZURpcmVjdGlvbigxMCwgMCwgMCwgMCksXG5cdFx0XHRnZXRDaGF0UGV0R2F6ZURpcmVjdGlvbigxMCwgMTAsIDAsIDApLFxuXHRcdFx0Z2V0Q2hhdFBldEdhemVEaXJlY3Rpb24oMCwgMTAsIDAsIDApLFxuXHRcdFx0Z2V0Q2hhdFBldEdhemVEaXJlY3Rpb24oLTEwLCAxMCwgMCwgMCksXG5cdFx0XHRnZXRDaGF0UGV0R2F6ZURpcmVjdGlvbigtMTAsIDAsIDAsIDApLFxuXHRcdFx0Z2V0Q2hhdFBldEdhemVEaXJlY3Rpb24oLTEwLCAtMTAsIDAsIDApLFxuXHRcdFx0Z2V0Q2hhdFBldEdhemVEaXJlY3Rpb24oMCwgLTEwLCAwLCAwKSxcblx0XHRcdGdldENoYXRQZXRHYXplRGlyZWN0aW9uKDEwLCAtMTAsIDAsIDApLFxuXHRcdFx0Z2V0Q2hhdFBldEdhemVEaXJlY3Rpb24oMCwgMCwgMCwgMCksXG5cdFx0XSwgW1xuXHRcdFx0WzEsIDBdLFxuXHRcdFx0WzEsIDFdLFxuXHRcdFx0WzAsIDFdLFxuXHRcdFx0Wy0xLCAxXSxcblx0XHRcdFstMSwgMF0sXG5cdFx0XHRbLTEsIC0xXSxcblx0XHRcdFswLCAtMV0sXG5cdFx0XHRbMSwgLTFdLFxuXHRcdFx0WzAsIDBdLFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjbGFtcHMgaG9yaXpvbnRhbCBtb3ZlbWVudCB0byB0aGUgaW5wdXQgYm91bmRzJywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoW1xuXHRcdFx0Z2V0Q2hhdFBldEhvcml6b250YWxQb3NpdGlvbigtMjAsIDEwLCAxMDApLFxuXHRcdFx0Z2V0Q2hhdFBldEhvcml6b250YWxQb3NpdGlvbig1MCwgMTAsIDEwMCksXG5cdFx0XHRnZXRDaGF0UGV0SG9yaXpvbnRhbFBvc2l0aW9uKDEyMCwgMTAsIDEwMCksXG5cdFx0XHRnZXRDaGF0UGV0SG9yaXpvbnRhbFBvc2l0aW9uKDIwLCA0MCwgMjApLFxuXHRcdF0sIFtcblx0XHRcdDEwLFxuXHRcdFx0NTAsXG5cdFx0XHQxMDAsXG5cdFx0XHQ0MCxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgncGxhY2VzIHRoZSBkZWZhdWx0IHBvc2l0aW9uIHRoaXJ0eS10d28gcGl4ZWxzIGZyb20gdGhlIHJpZ2h0IGVkZ2UnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbXG5cdFx0XHRnZXRDaGF0UGV0RGVmYXVsdEhvcml6b250YWxQb3NpdGlvbigwLCAxMDApLFxuXHRcdFx0Z2V0Q2hhdFBldERlZmF1bHRIb3Jpem9udGFsUG9zaXRpb24oMjAsIDEyMCksXG5cdFx0XHRnZXRDaGF0UGV0RGVmYXVsdEhvcml6b250YWxQb3NpdGlvbig0MCwgMjApLFxuXHRcdF0sIFtcblx0XHRcdDY4LFxuXHRcdFx0ODgsXG5cdFx0XHQ0MCxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnY2hhbmdlcyBzaXplIGluIHR3ZW50eS1wZXJjZW50IHN0ZXBzIHdpdGggb25seSBhIG1pbmltdW0nLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbXG5cdFx0XHRnZXRDaGF0UGV0U2NhbGUoMSwgMC4yKSxcblx0XHRcdGdldENoYXRQZXRTY2FsZSgxLCAtMC4yKSxcblx0XHRcdGdldENoYXRQZXRTY2FsZSgwLjQsIC0wLjIpLFxuXHRcdFx0Z2V0Q2hhdFBldFNjYWxlKDEwLCAwLjIpLFxuXHRcdF0sIFtcblx0XHRcdDEuMixcblx0XHRcdDAuOCxcblx0XHRcdDAuNCxcblx0XHRcdDEwLjIsXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NsYW1wcyB0d28tZGltZW5zaW9uYWwgZHJhZ2dpbmcgdG8gdGhlIGNoYXQgYm91bmRzJywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoW1xuXHRcdFx0Z2V0Q2hhdFBldERyYWdQb3NpdGlvbigtMjAsIC00MCwgMTAsIDEwMCwgLTMwMCwgMjAwKSxcblx0XHRcdGdldENoYXRQZXREcmFnUG9zaXRpb24oNTAsIC0xMDAsIDEwLCAxMDAsIC0zMDAsIDIwMCksXG5cdFx0XHRnZXRDaGF0UGV0RHJhZ1Bvc2l0aW9uKDEyMCwgMjQwLCAxMCwgMTAwLCAtMzAwLCAyMDApLFxuXHRcdF0sIFtcblx0XHRcdFsxMCwgLTQwXSxcblx0XHRcdFs1MCwgLTEwMF0sXG5cdFx0XHRbMTAwLCAyMDBdLFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCd0dXJucyByZWNlbnQgaG9yaXpvbnRhbCBmbGlja3MgaW50byBib3VuZGVkIHdhbGwgdGhyb3dzJywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoW1xuXHRcdFx0Z2V0Q2hhdFBldFRocm93VmVsb2NpdHkoW3sgeDogMCwgeTogMCwgdGltZTogMCB9LCB7IHg6IDYwLCB5OiAxMCwgdGltZTogNDAgfSwgeyB4OiAxMjAsIHk6IDIwLCB0aW1lOiA4MCB9XSwgMTAwKSxcblx0XHRcdGdldENoYXRQZXRUaHJvd1ZlbG9jaXR5KFt7IHg6IDIwMCwgeTogMTAwLCB0aW1lOiAwIH0sIHsgeDogMTUwLCB5OiA2MCwgdGltZTogNTAgfSwgeyB4OiAxMjAsIHk6IDQwLCB0aW1lOiA4MCB9XSwgOTApLFxuXHRcdFx0Z2V0Q2hhdFBldFRocm93VmVsb2NpdHkoW3sgeDogMCwgeTogMCwgdGltZTogMCB9LCB7IHg6IDQwLCB5OiAwLCB0aW1lOiAxMDAgfV0sIDEwMCksXG5cdFx0XHRnZXRDaGF0UGV0VGhyb3dWZWxvY2l0eShbeyB4OiAwLCB5OiAwLCB0aW1lOiAwIH0sIHsgeDogNTAsIHk6IDEwMCwgdGltZTogNTAgfV0sIDUwKSxcblx0XHRcdGdldENoYXRQZXRUaHJvd1ZlbG9jaXR5KFt7IHg6IDAsIHk6IDAsIHRpbWU6IDAgfSwgeyB4OiA3MCwgeTogOTAsIHRpbWU6IDEwMCB9XSwgMTAwKSxcblx0XHRcdGdldENoYXRQZXRUaHJvd1ZlbG9jaXR5KFt7IHg6IDAsIHk6IDAsIHRpbWU6IDAgfSwgeyB4OiAxMjAsIHk6IDAsIHRpbWU6IDgwIH1dLCAxNjEpLFxuXHRcdF0sIFtcblx0XHRcdHsgeDogMV81MDAsIHk6IC00MjAgfSxcblx0XHRcdHsgeDogLTFfMDAwLCB5OiAtNzUwIH0sXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FkdmFuY2VzIHdhbGwgdGhyb3dzIHRocm91Z2ggZ3Jhdml0eSBhbmQgYm91bmRlZCBjb2xsaXNpb25zJywgKCkgPT4ge1xuXHRcdGNvbnN0IGJvdW5kcyA9IHsgbWluaW11bUxlZnQ6IDAsIG1heGltdW1MZWZ0OiA4MCwgbWluaW11bVRvcDogMCB9O1xuXHRcdGNvbnN0IGZyYW1lcyA9IFtcblx0XHRcdGFkdmFuY2VDaGF0UGV0VGhyb3coeyBsZWZ0OiAxMCwgdG9wOiAxMDAsIHg6IDUwMCwgeTogLTEwMCB9LCAyMCwgYm91bmRzKSxcblx0XHRcdGFkdmFuY2VDaGF0UGV0VGhyb3coeyBsZWZ0OiA3MCwgdG9wOiAxMDAsIHg6IDFfMDAwLCB5OiAwIH0sIDIwLCBib3VuZHMpLFxuXHRcdFx0YWR2YW5jZUNoYXRQZXRUaHJvdyh7IGxlZnQ6IDEwLCB0b3A6IDEsIHg6IDAsIHk6IC0yMDAgfSwgMTAsIGJvdW5kcyksXG5cdFx0XHRhZHZhbmNlQ2hhdFBldFRocm93KHsgbGVmdDogMCwgdG9wOiAxMDAsIHg6IDFfMDAwLCB5OiAwIH0sIDIwLCB7IG1pbmltdW1MZWZ0OiAwLCBtYXhpbXVtTGVmdDogMCwgbWluaW11bVRvcDogMCB9KSxcblx0XHRdLm1hcChmcmFtZSA9PiAoe1xuXHRcdFx0Li4uZnJhbWUsXG5cdFx0XHRsZWZ0OiBNYXRoLnJvdW5kKGZyYW1lLmxlZnQgKiAxMDApIC8gMTAwLFxuXHRcdFx0dG9wOiBNYXRoLnJvdW5kKGZyYW1lLnRvcCAqIDEwMCkgLyAxMDAsXG5cdFx0XHR5OiBNYXRoLnJvdW5kKGZyYW1lLnkgKiAxMDApIC8gMTAwLFxuXHRcdH0pKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZnJhbWVzLCBbXG5cdFx0XHR7IGxlZnQ6IDIwLCB0b3A6IDk4LjM2LCB4OiA1MDAsIHk6IC02NCwgd2FsbDogdW5kZWZpbmVkIH0sXG5cdFx0XHR7IGxlZnQ6IDgwLCB0b3A6IDEwMC4wOSwgeDogMV8wMDAsIHk6IDE4LCB3YWxsOiAncmlnaHQnIH0sXG5cdFx0XHR7IGxlZnQ6IDEwLCB0b3A6IDAsIHg6IDAsIHk6IDM2LjQsIHdhbGw6IHVuZGVmaW5lZCB9LFxuXHRcdFx0eyBsZWZ0OiAwLCB0b3A6IDEwMC4zNiwgeDogMCwgeTogMzYsIHdhbGw6IHVuZGVmaW5lZCB9LFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzZXR0bGVzIHRocm93cyB0aGF0IGV4Y2VlZCB0aGVpciBib3VuZHMgb3IgbWF4aW11bSBkdXJhdGlvbicsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFtcblx0XHRcdHNob3VsZFNldHRsZUNoYXRQZXRUaHJvdygwLCAzXzk5OSwgMTAwLCAyMDAsIDQwMCksXG5cdFx0XHRzaG91bGRTZXR0bGVDaGF0UGV0VGhyb3coMCwgNF8wMDAsIDEwMCwgLTIwMCwgNDAwKSxcblx0XHRcdHNob3VsZFNldHRsZUNoYXRQZXRUaHJvdygwLCAxMDAsIDQwMSwgLTEsIDQwMCksXG5cdFx0XHRzaG91bGRTZXR0bGVDaGF0UGV0VGhyb3coMCwgMTAwLCA0MDEsIDAsIDQwMCksXG5cdFx0XSwgW1xuXHRcdFx0ZmFsc2UsXG5cdFx0XHR0cnVlLFxuXHRcdFx0ZmFsc2UsXG5cdFx0XHR0cnVlLFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdsYW5kcyBhIHRocm93IGF0IHRoZSBmaXJzdCBwbGF0Zm9ybSBvciBmbG9vciBjcm9zc2luZycsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFtcblx0XHRcdGdldENoYXRQZXRUaHJvd0xhbmRpbmcoMTAsIDgwLCAzMCwgMTIwLCA0OCwgNDgsIDAsIDEwMCwgMTQ4LCA0MDApLFxuXHRcdFx0Z2V0Q2hhdFBldFRocm93TGFuZGluZyg4MCwgODAsIDEyMCwgMTIwLCA0OCwgNDgsIDAsIDEwMCwgMTQ4LCA0MDApLFxuXHRcdFx0Z2V0Q2hhdFBldFRocm93TGFuZGluZygxMjAsIDM2MCwgMTQwLCA0MjAsIDQ4LCA0OCwgMCwgMTAwLCAxNDgsIDQwMCksXG5cdFx0XHRnZXRDaGF0UGV0VGhyb3dMYW5kaW5nKDEwLCAxMjAsIDMwLCA4MCwgNDgsIDQ4LCAwLCAxMDAsIDE0OCwgNDAwKSxcblx0XHRdLCBbXG5cdFx0XHR7IGxlZnQ6IDIwLCB0b3A6IDEwMCwgbGFuZHNPblBsYXRmb3JtOiB0cnVlIH0sXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHR7IGxlZnQ6IDEzMy4zMzMzMzMzMzMzMzMzNCwgdG9wOiA0MDAsIGxhbmRzT25QbGF0Zm9ybTogZmFsc2UgfSxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnbGFuZHMgb24gdGhlIGlucHV0IG9ubHkgd2hlbiBkcm9wcGVkIGFib3ZlIGl0cyBob3Jpem9udGFsIHNwYW4nLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbXG5cdFx0XHRnZXRDaGF0UGV0RmFsbFRhcmdldCg1MCwgMjAsIDQ4LCA0OCwgNDAsIDIwMCwgMjAwLCA0MDApLFxuXHRcdFx0Z2V0Q2hhdFBldEZhbGxUYXJnZXQoMCwgMjAsIDQ4LCA0OCwgNDAsIDIwMCwgMjAwLCA0MDApLFxuXHRcdFx0Z2V0Q2hhdFBldEZhbGxUYXJnZXQoNTAsIDE1MiwgNDgsIDQ4LCA0MCwgMjAwLCAyMDAsIDQwMCksXG5cdFx0XHRnZXRDaGF0UGV0RmFsbFRhcmdldCg1MCwgMTkwLCA0OCwgNDgsIDQwLCAyMDAsIDIwMCwgNDAwKSxcblx0XHRcdGdldENoYXRQZXRGYWxsVGFyZ2V0KDUwLCAxNTEuNSwgNDgsIDQ4LCA0MCwgMjAwLCAyMDAsIDQwMCksXG5cdFx0XHRnZXRDaGF0UGV0RmFsbFRhcmdldCg1MCwgMTUyLjUsIDQ4LCA0OCwgNDAsIDIwMCwgMjAwLCA0MDApLFxuXHRcdFx0Z2V0Q2hhdFBldEZhbGxUYXJnZXQoNTAsIDIyMCwgNDgsIDQ4LCA0MCwgMjAwLCAyMDAsIDQwMCksXG5cdFx0XSwgW1xuXHRcdFx0eyB0b3A6IDE1MiwgbGFuZHNPblBsYXRmb3JtOiB0cnVlIH0sXG5cdFx0XHR7IHRvcDogMzUyLCBsYW5kc09uUGxhdGZvcm06IGZhbHNlIH0sXG5cdFx0XHR7IHRvcDogMTUyLCBsYW5kc09uUGxhdGZvcm06IHRydWUgfSxcblx0XHRcdHsgdG9wOiAzNTIsIGxhbmRzT25QbGF0Zm9ybTogZmFsc2UgfSxcblx0XHRcdHsgdG9wOiAxNTIsIGxhbmRzT25QbGF0Zm9ybTogdHJ1ZSB9LFxuXHRcdFx0eyB0b3A6IDM1MiwgbGFuZHNPblBsYXRmb3JtOiBmYWxzZSB9LFxuXHRcdFx0eyB0b3A6IDM1MiwgbGFuZHNPblBsYXRmb3JtOiBmYWxzZSB9LFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzY2FsZXMgZmFsbCBkdXJhdGlvbiB3aXRoIGRpc3RhbmNlIHdpdGhpbiBtb3Rpb24gYm91bmRzJywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoW1xuXHRcdFx0Z2V0Q2hhdFBldEZhbGxEdXJhdGlvbigwKSxcblx0XHRcdGdldENoYXRQZXRGYWxsRHVyYXRpb24oMTAwKSxcblx0XHRcdGdldENoYXRQZXRGYWxsRHVyYXRpb24oNDAwKSxcblx0XHRcdGdldENoYXRQZXRGYWxsRHVyYXRpb24oMV8yMjUpLFxuXHRcdF0sIFtcblx0XHRcdDE4MCxcblx0XHRcdDIwMCxcblx0XHRcdDQwMCxcblx0XHRcdDcwMCxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnYWRhcHRzIHZlcnRpY2FsIGFsaWdubWVudCB0byB0aGUgaW5wdXQgc3RhY2snLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbXG5cdFx0XHRnZXRDaGF0UGV0VmVydGljYWxPZmZzZXQoMTAwLCA5OCksXG5cdFx0XHRnZXRDaGF0UGV0VmVydGljYWxPZmZzZXQoMTAwLCAxMDgpLFxuXHRcdFx0Z2V0Q2hhdFBldFZlcnRpY2FsT2Zmc2V0KDEwMCwgMTEyKSxcblx0XHRcdGdldENoYXRQZXRWZXJ0aWNhbE9mZnNldCgxMDAsIDE2MCksXG5cdFx0XSwgW1xuXHRcdFx0MCxcblx0XHRcdDgsXG5cdFx0XHQxMCxcblx0XHRcdDEwLFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpZ25vcmVzIHBhc3NpdmUgcGlsbHMgd2hlbiBjaG9vc2luZyB0aGUgYWN0aXZlIHBsYXRmb3JtJywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoW1xuXHRcdFx0Z2V0Q2hhdFBldFBsYXRmb3JtVG9wKDEwMCwgMTYwKSxcblx0XHRcdGdldENoYXRQZXRQbGF0Zm9ybVRvcCgxMDAsIDE2MCwgMTIwKSxcblx0XHRcdGdldENoYXRQZXRQbGF0Zm9ybVRvcCgxMDAsIDE2MCwgMTU4KSxcblx0XHRcdGdldENoYXRQZXRQbGF0Zm9ybVRvcCgxMDAsIDE2MCwgMTcwKSxcblx0XHRdLCBbXG5cdFx0XHQxMTAsXG5cdFx0XHQxMjAsXG5cdFx0XHQxNTgsXG5cdFx0XHQxMTAsXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21vdmVzIG9ubHkgdGhlIHJlbmRlcmluZyBzcGVlY2ggYnViYmxlIGJlZm9yZSBpdCBjcm9zc2VzIHRoZSBpbnB1dCBlZGdlJywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoW1xuXHRcdFx0c2hvdWxkUGxhY2VDaGF0UGV0U3BlZWNoQnViYmxlTGVmdCgncmVuZGVyaW5nJywgOTgwLCAxMDAwKSxcblx0XHRcdHNob3VsZFBsYWNlQ2hhdFBldFNwZWVjaEJ1YmJsZUxlZnQoJ3JlbmRlcmluZycsIDk4MSwgMTAwMCksXG5cdFx0XHRzaG91bGRQbGFjZUNoYXRQZXRTcGVlY2hCdWJibGVMZWZ0KCd5YXBwaW5nJywgOTgxLCAxMDAwKSxcblx0XHRcdHNob3VsZFBsYWNlQ2hhdFBldFNwZWVjaEJ1YmJsZUxlZnQoJ3lhcHBpbmdNb3V0aE9wZW4nLCA5ODEsIDEwMDApLFxuXHRcdF0sIFtcblx0XHRcdGZhbHNlLFxuXHRcdFx0dHJ1ZSxcblx0XHRcdGZhbHNlLFxuXHRcdFx0ZmFsc2UsXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2tlZXBzIHdpZGUgc3ByaXRlcyB3aXRoaW4gdGhlIGlucHV0IHdpdGhvdXQgY2hhbmdpbmcgZGlyZWN0aW9uJywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoW1xuXHRcdFx0Z2V0Q2hhdFBldFdpZGVTcHJpdGVIb3Jpem9udGFsT2Zmc2V0KCdzbGVlcCcsICdyaWdodCcsIDkzMiwgOTgwLCAwLCAxMDAwKSxcblx0XHRcdGdldENoYXRQZXRXaWRlU3ByaXRlSG9yaXpvbnRhbE9mZnNldCgnd2FraW5nJywgJ2xlZnQnLCAyMCwgNjgsIDAsIDEwMDApLFxuXHRcdFx0Z2V0Q2hhdFBldFdpZGVTcHJpdGVIb3Jpem9udGFsT2Zmc2V0KCd0eXBpbmcnLCAncmlnaHQnLCA5MTUsIDk2MywgMCwgMTAwMCksXG5cdFx0XHRnZXRDaGF0UGV0V2lkZVNwcml0ZUhvcml6b250YWxPZmZzZXQoJ3R5cGluZycsICdyaWdodCcsIDkxNywgOTY1LCAwLCAxMDAwKSxcblx0XHRcdGdldENoYXRQZXRXaWRlU3ByaXRlSG9yaXpvbnRhbE9mZnNldCgnYnV0dG9uUHJlc3MnLCAncmlnaHQnLCA5MjEsIDk2OSwgMCwgMTAwMCksXG5cdFx0XHRnZXRDaGF0UGV0V2lkZVNwcml0ZUhvcml6b250YWxPZmZzZXQoJ3NpbmcnLCAncmlnaHQnLCA5MTksIDk2NywgMCwgMTAwMCksXG5cdFx0XHRnZXRDaGF0UGV0V2lkZVNwcml0ZUhvcml6b250YWxPZmZzZXQoJ3R5cGluZycsICdsZWZ0JywgMzcsIDg1LCAwLCAxMDAwKSxcblx0XHRcdGdldENoYXRQZXRXaWRlU3ByaXRlSG9yaXpvbnRhbE9mZnNldCgndHlwaW5nJywgJ2xlZnQnLCAzNSwgODMsIDAsIDEwMDApLFxuXHRcdFx0Z2V0Q2hhdFBldFdpZGVTcHJpdGVIb3Jpem9udGFsT2Zmc2V0KCd0eXBpbmcnLCAncmlnaHQnLCA4ODIsIDk3OCwgMCwgMTA0OCwgMiksXG5cdFx0XHRnZXRDaGF0UGV0V2lkZVNwcml0ZUhvcml6b250YWxPZmZzZXQoJ2lkbGUnLCAncmlnaHQnLCA5NTIsIDEwMDAsIDAsIDEwMDApLFxuXHRcdF0sIFtcblx0XHRcdDAsXG5cdFx0XHQwLFxuXHRcdFx0MCxcblx0XHRcdC0xLFxuXHRcdFx0LTEsXG5cdFx0XHQtMSxcblx0XHRcdDAsXG5cdFx0XHQxLFxuXHRcdFx0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
