var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __decorateClass = (decorators, target, key, kind) => {
  var result = kind > 1 ? void 0 : kind ? __getOwnPropDesc(target, key) : target;
  for (var i = decorators.length - 1, decorator; i >= 0; i--)
    if (decorator = decorators[i])
      result = (kind ? decorator(target, key, result) : decorator(result)) || result;
  if (kind && result) __defProp(target, key, result);
  return result;
};
var __decorateParam = (index, decorator) => (target, key) => decorator(target, key, index);
import "./media/chatPet.css";
import * as dom from "../../../../../base/browser/dom.js";
import { GlobalPointerMoveMonitor } from "../../../../../base/browser/globalPointerMoveMonitor.js";
import { StandardKeyboardEvent } from "../../../../../base/browser/keyboardEvent.js";
import { StandardMouseEvent } from "../../../../../base/browser/mouseEvent.js";
import { Button } from "../../../../../base/browser/ui/button/button.js";
import { status } from "../../../../../base/browser/ui/aria/aria.js";
import { Action, Separator } from "../../../../../base/common/actions.js";
import { RunOnceScheduler } from "../../../../../base/common/async.js";
import { KeyCode, KeyMod } from "../../../../../base/common/keyCodes.js";
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from "../../../../../base/common/lifecycle.js";
import { FileAccess } from "../../../../../base/common/network.js";
import { autorun, observableFromEvent, observableValue } from "../../../../../base/common/observable.js";
import { localize } from "../../../../../nls.js";
import { IAccessibilityService } from "../../../../../platform/accessibility/common/accessibility.js";
import { IContextMenuService } from "../../../../../platform/contextview/browser/contextView.js";
import { IChatPetService } from "../chatPetService.js";
const CHAT_PET_IDLE_SLEEP_DELAY = 2e4;
const CHAT_PET_CONFIRMATION_ATTENTION_DURATION = 2e3;
const CHAT_PET_ICON_TRANSFORMATION_CHANCE = 1 / 100;
const CHAT_PET_YAPPING_CHANCE = 1 / 100;
const TRANSIENT_STATE_DURATION = 2e3;
const COMPLETE_STATE_DURATION = 960;
const BUTTON_PRESS_STATE_DURATION = 2850;
const SPLAT_STATE_DURATION = 520;
const LOVE_STATE_DURATION = 2940;
const COOL_STATE_DURATION = 3e3;
const SING_STATE_DURATION = 2880;
const SPEECHLESS_STATE_DURATION = 2720;
const WORRY_STATE_DURATION = 2400;
const DIZZY_STATE_DURATION = 2200;
const WAKE_STATE_DURATION = 880;
const DIZZY_DIRECTION_CHANGE_COUNT = 8;
const DIZZY_DIRECTION_CHANGE_MAX_INTERVAL = 600;
const SEARCH_INTERVAL = 1e4;
const RESPAWN_EFFECT_DURATION = 800;
const RESPAWN_EFFECT_REDUCED_MOTION_DURATION = 400;
const DRAG_THRESHOLD = 2;
const HOP_DISTANCE = 24;
const HOP_APEX_DELAY = 300;
const HOP_REST_DELAY = 90;
const HOP_HOLD_GRACE = 350;
const HOP_IDLE_DEBOUNCE = 900;
const POSITION_EPSILON = 0.5;
const THROW_VELOCITY_SAMPLE_DURATION = 100;
const THROW_RELEASE_GRACE_DURATION = 80;
const THROW_MIN_HORIZONTAL_VELOCITY = 650;
const THROW_MIN_FLIGHT_VELOCITY = 1e3;
const THROW_MAX_HORIZONTAL_VELOCITY = 2400;
const THROW_MIN_UPWARD_VELOCITY = 420;
const THROW_MAX_UPWARD_VELOCITY = 1400;
const THROW_KEYBOARD_HORIZONTAL_VELOCITY = 1400;
const THROW_GRAVITY = 1800;
const THROW_MAX_FRAME_DURATION = 32;
const THROW_MAX_DURATION = 4e3;
const THROW_WALL_IMPACT_DURATION = 110;
const THROW_WALL_RESTITUTION = 0.1;
const THROW_WALL_REBOUND_VELOCITY = 120;
const THROW_CEILING_RESTITUTION = 0.2;
const THROW_ROTATION_PER_PIXEL = 0.65;
const CHAT_PET_SOURCE_SIZE = 96;
const CHAT_PET_SLEEP_SOURCE_WIDTH = 120;
const CHAT_PET_TYPING_SOURCE_WIDTH = 168;
const CHAT_PET_BUTTON_PRESS_SOURCE_WIDTH = 160;
const CHAT_PET_SING_SOURCE_WIDTH = 164;
const CHAT_PET_SING_SOURCE_HEIGHT = 124;
const CHAT_PET_DIZZY_SOURCE_HEIGHT = 128;
const CHAT_PET_MAX_VERTICAL_OFFSET = 10;
const CHAT_PET_DEFAULT_RIGHT_INSET = 32;
const CHAT_PET_MIN_SCALE = 0.4;
const CHAT_PET_SCALE_STEP = 0.2;
const CHAT_PET_SPEECH_BUBBLE_RIGHT_OVERHANG = 20;
const CHAT_PET_SLEEP_RIGHT_OVERHANG = (CHAT_PET_SLEEP_SOURCE_WIDTH - CHAT_PET_SOURCE_SIZE) / 2;
const CHAT_PET_TYPING_RIGHT_OVERHANG = (CHAT_PET_TYPING_SOURCE_WIDTH - CHAT_PET_SOURCE_SIZE) / 2;
const CHAT_PET_BUTTON_PRESS_RIGHT_OVERHANG = (CHAT_PET_BUTTON_PRESS_SOURCE_WIDTH - CHAT_PET_SOURCE_SIZE) / 2;
const CHAT_PET_SING_RIGHT_OVERHANG = (CHAT_PET_SING_SOURCE_WIDTH - CHAT_PET_SOURCE_SIZE) / 2;
const IDLE_FRAME_DURATIONS = Array.from({ length: 50 }, () => 40);
const SLEEP_FRAME_DURATIONS = Array.from({ length: 8 }, () => 300);
const WAKE_FRAME_DURATIONS = [160, 100, 80, 90, 90, 90, 100, 170];
const TYPING_FRAME_DURATIONS = [320, 480];
const BUTTON_PRESS_FRAME_DURATIONS = [500, 300, 350, 250, 450, 1e3];
const FALLING_FRAME_DURATIONS = [120, 80, 80, 120, 80, 80];
const JUMP_FRAME_DURATIONS = [70, 80, 90, 160, 100, 100];
const SPLAT_FRAME_DURATIONS = [120, 100, 100, 200];
const RESPAWN_FRAME_DURATIONS = [120, 100, 120, 240, 100, 120];
const SPEECH_FRAME_DURATIONS = [220, 220, 220, 100, 160, 180];
const CLAPPING_FRAME_DURATIONS = [80, 40, 40, 40, 80, 40, 40, 40, 40, 80, 40, 40, 80];
const LOVE_FRAME_DURATIONS = [200, 200, 380, 100, 80, 1980];
const COOL_FRAME_DURATIONS = [600, 120, 120, 120, 160, 80, 80, 80, 1640];
const SING_FRAME_DURATIONS = [180, 180, 180, 180];
const SPEECHLESS_FRAME_DURATIONS = [400, 120, 1e3, 120, 1080];
const WORRY_FRAME_DURATIONS = [600, 600];
const DIZZY_FRAME_DURATIONS = Array.from({ length: 8 }, () => 120);
const SEARCH_FRAME_DURATIONS = [500, 500, 500, 500];
const CHAT_PET_SING_FIXED_ORIENTATION_DECORATIONS = [
  {
    frameBounds: [
      [16, 36, 80, 52],
      [16, 36, 80, 52],
      [16, 36, 80, 52],
      [16, 36, 80, 52]
    ],
    sourceFrame: 0
  },
  {
    frameBounds: [
      [96, 8, 160, 72],
      [96, 4, 160, 68],
      [100, 0, 164, 64],
      [92, 4, 156, 68]
    ],
    sourceFrame: 0
  }
];
function getChatPetBuddyName(quality) {
  return quality === "stable" ? "buddy-idle-stable" : "buddy-idle-insiders";
}
const spriteSources = /* @__PURE__ */ new Map();
const speechSpriteSources = /* @__PURE__ */ new Map();
const respawnSpriteSources = /* @__PURE__ */ new Map();
function doesChatPetStateTrackCursor(state) {
  return state !== void 0 && state !== "sleep" && state !== "waking" && state !== "typing" && state !== "buttonPress" && state !== "complete" && state !== "jump" && state !== "love" && state !== "cool" && state !== "yappingMouthOpen" && state !== "sing" && state !== "speechless" && state !== "worry" && state !== "dizzy" && state !== "falling" && state !== "wallImpact" && state !== "splat" && state !== "onTheRun" && state !== "searching" && state !== "searchingDown";
}
function doesChatPetStateBlink(state, frameIndex) {
  return (state === "typing" || state === "buttonPress" || state === "love") && (state !== "buttonPress" || frameIndex !== BUTTON_PRESS_FRAME_DURATIONS.length - 1);
}
function getChatPetSpriteName(state, quality) {
  const variant = quality === "stable" ? "stable" : "insiders";
  switch (state) {
    case "love":
      return `buddy-love-${variant}`;
    case "clapping":
      return `buddy-clapping-${variant}`;
    case "cool":
      return `buddy-cool-${variant}`;
    case "buttonPress":
      return `buddy-press-button-${variant}`;
    case "falling":
      return `buddy-falling-${variant}`;
    case "jump":
      return `buddy-jump-${variant}`;
    case "dizzy":
      return `buddy-dizzy-${variant}`;
    case "wallImpact":
      return `buddy-wall-impact-${variant}`;
    case "splat":
      return `buddy-splat-${variant}`;
    case "onTheRun":
    case "searching":
    case "searchingDown":
      return `buddy-search-${variant}`;
    case "sleep":
      return `buddy-sleep-${variant}`;
    case "waking":
      return `buddy-waking-${variant}`;
    case "typing":
      return `buddy-typing-${variant}`;
    case "rendering":
      return `buddy-rendering-${variant}`;
    case "yappingMouthOpen":
      return `buddy-yapping-${variant}`;
    case "sing":
    case "speechless":
    case "worry":
      return `buddy-${state}-${variant}`;
    default:
      return getChatPetBuddyName(quality);
  }
}
function getChatPetFrameDurations(state) {
  switch (state) {
    case "sleep":
      return SLEEP_FRAME_DURATIONS;
    case "waking":
      return WAKE_FRAME_DURATIONS;
    case "typing":
      return TYPING_FRAME_DURATIONS;
    case "buttonPress":
      return BUTTON_PRESS_FRAME_DURATIONS;
    case "falling":
      return FALLING_FRAME_DURATIONS;
    case "jump":
      return JUMP_FRAME_DURATIONS;
    case "splat":
      return SPLAT_FRAME_DURATIONS;
    case "rendering":
      return IDLE_FRAME_DURATIONS;
    case "clapping":
      return CLAPPING_FRAME_DURATIONS;
    case "love":
      return LOVE_FRAME_DURATIONS;
    case "cool":
      return COOL_FRAME_DURATIONS;
    case "sing":
      return SING_FRAME_DURATIONS;
    case "speechless":
      return SPEECHLESS_FRAME_DURATIONS;
    case "worry":
      return WORRY_FRAME_DURATIONS;
    case "dizzy":
      return DIZZY_FRAME_DURATIONS;
    case "searching":
      return SEARCH_FRAME_DURATIONS;
    case "onTheRun":
    case "wallImpact":
    case "searchingDown":
      return [];
    case "yappingMouthOpen":
    case "yapping":
      return [];
    default:
      return IDLE_FRAME_DURATIONS;
  }
}
function createSpriteSources(name, state, tracksCursor = true, sourceWidth, sourceHeight = CHAT_PET_SOURCE_SIZE, fixedOrientationDecorations) {
  const root = "vs/workbench/contrib/chat/browser/widget/media/chatPet";
  const suffix = tracksCursor ? "-tracking-96" : `-${sourceHeight}`;
  const frameDurations = getChatPetFrameDurations(state);
  const frameWidth = sourceWidth ?? (state === "typing" ? CHAT_PET_TYPING_SOURCE_WIDTH : state === "buttonPress" ? CHAT_PET_BUTTON_PRESS_SOURCE_WIDTH : CHAT_PET_SOURCE_SIZE);
  const staticSource = {
    url: FileAccess.asBrowserUri(`${root}/${name}${suffix}.png`).toString(true),
    frameWidth,
    frameHeight: sourceHeight,
    fixedOrientationDecorations,
    frameDurations: [],
    iterations: 1
  };
  return {
    animated: frameDurations.length === 0 ? staticSource : {
      url: FileAccess.asBrowserUri(`${root}/${name}${suffix}.spritesheet.png`).toString(true),
      frameWidth,
      frameHeight: sourceHeight,
      fixedOrientationDecorations,
      frameDurations,
      iterations: state === "waking" || state === "buttonPress" || state === "cool" || state === "splat" || state === "searching" || state === "jump" ? 1 : Infinity
    },
    reducedMotion: staticSource
  };
}
function getChatPetSpeechFrameDurations() {
  return SPEECH_FRAME_DURATIONS;
}
function getChatPetRespawnFrameDurations() {
  return RESPAWN_FRAME_DURATIONS;
}
function getSpriteSources(variant) {
  let sources = spriteSources.get(variant);
  if (!sources) {
    const createStateSpriteSources = (state) => createSpriteSources(getChatPetSpriteName(state, variant), state, doesChatPetStateTrackCursor(state));
    sources = {
      idle: createStateSpriteSources("idle"),
      sleep: createSpriteSources(getChatPetSpriteName("sleep", variant), "sleep", false, CHAT_PET_SLEEP_SOURCE_WIDTH),
      waking: createSpriteSources(getChatPetSpriteName("waking", variant), "waking", false, CHAT_PET_SLEEP_SOURCE_WIDTH),
      typing: createStateSpriteSources("typing"),
      rendering: createStateSpriteSources("rendering"),
      buttonPress: createStateSpriteSources("buttonPress"),
      complete: createStateSpriteSources("complete"),
      love: createStateSpriteSources("love"),
      clapping: createStateSpriteSources("clapping"),
      jump: createStateSpriteSources("jump"),
      cool: createStateSpriteSources("cool"),
      yapping: createStateSpriteSources("yapping"),
      yappingMouthOpen: createStateSpriteSources("yappingMouthOpen"),
      sing: createSpriteSources(getChatPetSpriteName("sing", variant), "sing", false, CHAT_PET_SING_SOURCE_WIDTH, CHAT_PET_SING_SOURCE_HEIGHT, CHAT_PET_SING_FIXED_ORIENTATION_DECORATIONS),
      speechless: createStateSpriteSources("speechless"),
      worry: createStateSpriteSources("worry"),
      dizzy: createSpriteSources(getChatPetSpriteName("dizzy", variant), "dizzy", false, void 0, CHAT_PET_DIZZY_SOURCE_HEIGHT),
      falling: createStateSpriteSources("falling"),
      wallImpact: createStateSpriteSources("wallImpact"),
      splat: createStateSpriteSources("splat"),
      onTheRun: createStateSpriteSources("onTheRun"),
      searching: createStateSpriteSources("searching"),
      searchingDown: createStateSpriteSources("searchingDown")
    };
    spriteSources.set(variant, sources);
  }
  return sources;
}
function getSpeechSpriteSources(variant) {
  let sources = speechSpriteSources.get(variant);
  if (!sources) {
    const root = "vs/workbench/contrib/chat/browser/widget/media/chatPet";
    const name = `buddy-speech-${variant}-96`;
    sources = {
      animated: {
        url: FileAccess.asBrowserUri(`${root}/${name}.spritesheet.png`).toString(true),
        frameWidth: CHAT_PET_SOURCE_SIZE,
        frameDurations: SPEECH_FRAME_DURATIONS,
        iterations: Infinity
      },
      reducedMotion: {
        url: FileAccess.asBrowserUri(`${root}/${name}.png`).toString(true),
        frameWidth: CHAT_PET_SOURCE_SIZE,
        frameDurations: [],
        iterations: 1
      }
    };
    speechSpriteSources.set(variant, sources);
  }
  return sources;
}
function getRespawnSpriteSources(variant) {
  let sources = respawnSpriteSources.get(variant);
  if (!sources) {
    const root = "vs/workbench/contrib/chat/browser/widget/media/chatPet";
    const name = `buddy-respawn-${variant}-96`;
    sources = {
      animated: {
        url: FileAccess.asBrowserUri(`${root}/${name}.spritesheet.png`).toString(true),
        frameWidth: CHAT_PET_SOURCE_SIZE,
        frameDurations: RESPAWN_FRAME_DURATIONS,
        iterations: 1
      },
      reducedMotion: {
        url: FileAccess.asBrowserUri(`${root}/${name}.png`).toString(true),
        frameWidth: CHAT_PET_SOURCE_SIZE,
        frameDurations: [],
        iterations: 1
      }
    };
    respawnSpriteSources.set(variant, sources);
  }
  return sources;
}
function doesChatPetStateSpeak(state) {
  return state === "rendering";
}
function isChatPetImageSource(image, source) {
  return image.getAttribute("src") === source;
}
function getChatPetBaseState(hasActiveRequest, needsInput, confirmationAttentionExpired, hasInput, idleExpired) {
  if (needsInput) {
    return confirmationAttentionExpired ? "idle" : "clapping";
  }
  if (hasActiveRequest) {
    return "rendering";
  }
  if (idleExpired) {
    return "sleep";
  }
  if (hasInput) {
    return "typing";
  }
  return "idle";
}
function isChatPetVisible(enabled, isLatestFocusedWidget) {
  return enabled && isLatestFocusedWidget;
}
function isChatPetKeyboardInteractionEnabled(enabled, isDead, hasPointerInteraction, isAirborne, onTheRun) {
  return enabled && !isDead && !hasPointerInteraction && !isAirborne && !onTheRun;
}
function isChatPetYapState(state) {
  return state === "yapping" || state === "yappingMouthOpen";
}
function getChatPetRenderedState(baseState, transientState, isDragging) {
  if (isDragging) {
    return "idle";
  }
  if (isChatPetYapState(transientState) && baseState !== "idle") {
    return baseState;
  }
  return transientState ?? baseState;
}
function getChatPetAnimationFrame(frameDurations, elapsed, iterations, reverse = false) {
  if (frameDurations.length === 0) {
    return { frameIndex: 0, complete: true };
  }
  const totalDuration = frameDurations.reduce((total, duration) => total + duration, 0);
  const lastFrameIndex = frameDurations.length - 1;
  if (elapsed >= totalDuration * iterations) {
    return { frameIndex: reverse ? 0 : lastFrameIndex, complete: true };
  }
  const iterationElapsed = Math.max(0, elapsed) % totalDuration;
  let frameEnd = 0;
  for (let animationFrameIndex = 0; animationFrameIndex < frameDurations.length; animationFrameIndex++) {
    const frameIndex = reverse ? lastFrameIndex - animationFrameIndex : animationFrameIndex;
    frameEnd += frameDurations[frameIndex];
    if (iterationElapsed < frameEnd) {
      return { frameIndex, complete: false, nextFrameDelay: frameEnd - iterationElapsed };
    }
  }
  return { frameIndex: reverse ? 0 : lastFrameIndex, complete: false, nextFrameDelay: totalDuration };
}
function getTransientStateDuration(state) {
  switch (state) {
    case "buttonPress":
      return BUTTON_PRESS_STATE_DURATION;
    case "complete":
      return COMPLETE_STATE_DURATION;
    case "splat":
      return SPLAT_STATE_DURATION;
    case "love":
      return LOVE_STATE_DURATION;
    case "cool":
      return COOL_STATE_DURATION;
    case "sing":
      return SING_STATE_DURATION;
    case "speechless":
      return SPEECHLESS_STATE_DURATION;
    case "worry":
      return WORRY_STATE_DURATION;
    case "dizzy":
      return DIZZY_STATE_DURATION;
    case "waking":
      return WAKE_STATE_DURATION;
    default:
      return TRANSIENT_STATE_DURATION;
  }
}
function getChatPetClickInteraction(random, previousInteraction) {
  if (random < CHAT_PET_ICON_TRANSFORMATION_CHANCE) {
    return "complete";
  }
  const yappingThreshold = CHAT_PET_ICON_TRANSFORMATION_CHANCE + CHAT_PET_YAPPING_CHANCE;
  if (random < yappingThreshold) {
    return "yapping";
  }
  const interactions = ["buttonPress", "love", "cool", "sing", "speechless", "worry"];
  const availableInteractions = interactions.filter((interaction) => interaction !== previousInteraction);
  const normalizedRandom = (random - yappingThreshold) / (1 - yappingThreshold);
  return availableInteractions[Math.min(Math.floor(normalizedRandom * availableInteractions.length), availableInteractions.length - 1)];
}
function getChatPetGazeDirection(cursorX, cursorY, petCenterX, petCenterY) {
  const deltaX = cursorX - petCenterX;
  const deltaY = cursorY - petCenterY;
  const distance = Math.hypot(deltaX, deltaY);
  if (distance === 0) {
    return [0, 0];
  }
  return [
    Math.round(deltaX / distance),
    Math.round(deltaY / distance)
  ];
}
class ChatPetFacingController {
  constructor() {
    this._direction = "right";
    this._tracksCursor = false;
  }
  get direction() {
    return this._direction;
  }
  setDirection(direction) {
    this._direction = direction;
  }
  setState(state, isDragging) {
    this._tracksCursor = state === "idle" && !isDragging;
  }
  snapToCursor(cursorX, petCenterX) {
    if (cursorX < petCenterX) {
      this.setDirection("left");
    } else if (cursorX > petCenterX) {
      this.setDirection("right");
    }
    return this._direction;
  }
  update(cursorX, petCenterX) {
    if (this._tracksCursor) {
      return this.snapToCursor(cursorX, petCenterX);
    }
    return this._direction;
  }
}
class ChatPetDirectionChangeController {
  constructor(directionChangeCount = DIZZY_DIRECTION_CHANGE_COUNT, maxDirectionChangeInterval = DIZZY_DIRECTION_CHANGE_MAX_INTERVAL) {
    this.directionChangeCount = directionChangeCount;
    this.maxDirectionChangeInterval = maxDirectionChangeInterval;
    this._directionChangeCount = 0;
  }
  record(direction, timestamp) {
    if (this._lastDirection === direction) {
      return false;
    }
    if (this._lastDirection === void 0) {
      this._lastDirection = direction;
      this._lastDirectionChangeTime = timestamp;
      return false;
    }
    if (this._lastDirectionChangeTime !== void 0 && timestamp - this._lastDirectionChangeTime > this.maxDirectionChangeInterval) {
      this._directionChangeCount = 0;
    }
    this._lastDirection = direction;
    this._lastDirectionChangeTime = timestamp;
    this._directionChangeCount++;
    if (this._directionChangeCount < this.directionChangeCount) {
      return false;
    }
    this.reset();
    return true;
  }
  reset() {
    this._lastDirection = void 0;
    this._lastDirectionChangeTime = void 0;
    this._directionChangeCount = 0;
  }
}
function getChatPetHorizontalPosition(left, minimumLeft, maximumLeft) {
  return Math.max(minimumLeft, Math.min(Math.max(minimumLeft, maximumLeft), left));
}
function getChatPetDefaultHorizontalPosition(minimumLeft, maximumLeft) {
  return Math.max(minimumLeft, maximumLeft - CHAT_PET_DEFAULT_RIGHT_INSET);
}
function getChatPetRestoredHorizontalPosition(previousLeft, minimumLeft, maximumLeft) {
  return previousLeft === void 0 ? getChatPetDefaultHorizontalPosition(minimumLeft, maximumLeft) : getChatPetHorizontalPosition(previousLeft, minimumLeft, maximumLeft);
}
function getChatPetScale(scale, delta) {
  return Math.max(CHAT_PET_MIN_SCALE, Math.round((scale + delta) * 10) / 10);
}
function getChatPetDragPosition(left, top, minimumLeft, maximumLeft, minimumTop, maximumTop) {
  return [
    getChatPetHorizontalPosition(left, minimumLeft, maximumLeft),
    Math.max(minimumTop, Math.min(Math.max(minimumTop, maximumTop), top))
  ];
}
function getChatPetThrowVelocity(samples, releaseTime) {
  if (samples.length < 2) {
    return void 0;
  }
  const latest = samples[samples.length - 1];
  if (releaseTime - latest.time > THROW_RELEASE_GRACE_DURATION) {
    return void 0;
  }
  let first = latest;
  for (let index = samples.length - 2; index >= 0; index--) {
    const sample = samples[index];
    if (latest.time - sample.time > THROW_VELOCITY_SAMPLE_DURATION) {
      break;
    }
    first = sample;
  }
  const elapsed = Math.max(16, latest.time - first.time);
  const velocityX = (latest.x - first.x) / elapsed * 1e3;
  const velocityY = (latest.y - first.y) / elapsed * 1e3;
  const horizontalVelocity = Math.abs(velocityX);
  if (horizontalVelocity < THROW_MIN_HORIZONTAL_VELOCITY || horizontalVelocity < Math.abs(velocityY)) {
    return void 0;
  }
  const flightVelocity = Math.min(THROW_MAX_HORIZONTAL_VELOCITY, Math.max(THROW_MIN_FLIGHT_VELOCITY, horizontalVelocity));
  return {
    x: Math.sign(velocityX) * flightVelocity,
    y: Math.max(-THROW_MAX_UPWARD_VELOCITY, Math.min(velocityY, -THROW_MIN_UPWARD_VELOCITY))
  };
}
function advanceChatPetThrow(motion, elapsed, bounds) {
  const duration = Math.max(0, elapsed) / 1e3;
  const projectedLeft = motion.left + motion.x * duration;
  const hasHorizontalRange = bounds.maximumLeft > bounds.minimumLeft;
  let wall;
  let motionDuration = duration;
  let left = hasHorizontalRange ? projectedLeft : bounds.minimumLeft;
  if (hasHorizontalRange && projectedLeft < bounds.minimumLeft) {
    wall = "left";
    motionDuration *= (bounds.minimumLeft - motion.left) / (projectedLeft - motion.left);
    left = bounds.minimumLeft;
  } else if (hasHorizontalRange && projectedLeft > bounds.maximumLeft) {
    wall = "right";
    motionDuration *= (bounds.maximumLeft - motion.left) / (projectedLeft - motion.left);
    left = bounds.maximumLeft;
  }
  let top = motion.top + motion.y * motionDuration + THROW_GRAVITY * motionDuration * motionDuration / 2;
  let velocityY = motion.y + THROW_GRAVITY * motionDuration;
  if (top < bounds.minimumTop) {
    top = bounds.minimumTop;
    velocityY = Math.abs(velocityY) * THROW_CEILING_RESTITUTION;
  }
  return {
    left,
    top,
    x: hasHorizontalRange ? motion.x : 0,
    y: velocityY,
    wall
  };
}
function shouldSettleChatPetThrow(startTime, currentTime, top, verticalVelocity, floorTop) {
  return currentTime - startTime >= THROW_MAX_DURATION || top > floorTop && verticalVelocity >= 0;
}
function getChatPetFallTarget(petLeft, petTop, petWidth, petHeight, platformLeft, platformRight, platformTop, floorBottom) {
  const petCenter = petLeft + petWidth / 2;
  const landsOnPlatform = petCenter >= platformLeft && petCenter <= platformRight && petTop + petHeight <= platformTop;
  return {
    top: landsOnPlatform ? platformTop - petHeight : floorBottom - petHeight,
    landsOnPlatform
  };
}
function getChatPetThrowLanding(previousLeft, previousTop, left, top, petWidth, petHeight, platformLeft, platformRight, platformTop, floorTop) {
  if (top <= previousTop) {
    return void 0;
  }
  const getLeftAtTop = (targetTop) => previousLeft + (left - previousLeft) * (targetTop - previousTop) / (top - previousTop);
  const platformLandingTop = platformTop - petHeight;
  if (previousTop <= platformLandingTop && top >= platformLandingTop) {
    const landingLeft = getLeftAtTop(platformLandingTop);
    const petCenter = landingLeft + petWidth / 2;
    if (petCenter >= platformLeft && petCenter <= platformRight) {
      return { left: landingLeft, top: platformLandingTop, landsOnPlatform: true };
    }
  }
  if (previousTop <= floorTop && top >= floorTop) {
    return { left: getLeftAtTop(floorTop), top: floorTop, landsOnPlatform: false };
  }
  return void 0;
}
function getChatPetFallDuration(distance) {
  return Math.max(180, Math.min(700, Math.sqrt(Math.abs(distance)) * 20));
}
function getChatPetVerticalOffset(hostTop, inputTop) {
  return Math.max(0, Math.min(CHAT_PET_MAX_VERTICAL_OFFSET, inputTop - hostTop));
}
function getChatPetPlatformTop(hostTop, inputTop, substantiveSurfaceTop) {
  if (substantiveSurfaceTop !== void 0 && substantiveSurfaceTop >= hostTop && substantiveSurfaceTop <= inputTop) {
    return substantiveSurfaceTop;
  }
  return hostTop + getChatPetVerticalOffset(hostTop, inputTop);
}
function shouldPlaceChatPetSpeechBubbleLeft(state, buttonRight, inputRight, scale = 1) {
  return state === "rendering" && buttonRight + CHAT_PET_SPEECH_BUBBLE_RIGHT_OVERHANG * scale > inputRight;
}
function getChatPetWideSpriteHorizontalOffset(state, facingDirection, buttonLeft, buttonRight, inputLeft, inputRight, scale = 1) {
  const overhang = state === "sleep" || state === "waking" ? CHAT_PET_SLEEP_RIGHT_OVERHANG : state === "typing" ? CHAT_PET_TYPING_RIGHT_OVERHANG : state === "buttonPress" ? CHAT_PET_BUTTON_PRESS_RIGHT_OVERHANG : state === "sing" ? CHAT_PET_SING_RIGHT_OVERHANG : 0;
  if (overhang === 0) {
    return 0;
  }
  return facingDirection === "left" ? Math.max(0, overhang - (buttonLeft - inputLeft) / scale) : Math.min(0, (inputRight - buttonRight) / scale - overhang);
}
class ChatPetHopController extends Disposable {
  constructor(callbacks) {
    super();
    this.callbacks = callbacks;
    this._stepScheduler = this._register(new RunOnceScheduler(() => this._applyStep(), HOP_APEX_DELAY));
    this._restScheduler = this._register(new RunOnceScheduler(() => this._beginHop(), HOP_REST_DELAY));
    this._direction = 0;
    this._heldUntil = 0;
    this._active = false;
  }
  request(direction, motionReduced) {
    this._direction = direction;
    this.callbacks.onDirectionChange(direction);
    this.callbacks.onRequest();
    if (motionReduced) {
      this.cancel();
      this.callbacks.onMove(direction * HOP_DISTANCE);
      this.callbacks.onReducedMotionStart();
      return;
    }
    this._heldUntil = Date.now() + HOP_HOLD_GRACE;
    if (!this._active) {
      this._beginHop();
    }
  }
  cancel() {
    this._active = false;
    this._direction = 0;
    this._heldUntil = 0;
    this._stepScheduler.cancel();
    this._restScheduler.cancel();
  }
  onAnimationComplete() {
    if (!this._active) {
      return;
    }
    if (Date.now() < this._heldUntil) {
      this._restScheduler.schedule();
    } else {
      this._active = false;
    }
  }
  _beginHop() {
    this._active = true;
    this.callbacks.onStart();
    this._stepScheduler.schedule();
  }
  _applyStep() {
    if (!this._active || this._direction === 0) {
      return;
    }
    this.callbacks.onMove(this._direction * HOP_DISTANCE);
  }
}
let ChatPetWidget = class extends Disposable {
  constructor(parent, dragBounds, movementBounds, model, hasInput, isLatestFocusedWidget, inputChanged, chatPetService, accessibilityService, contextMenuService) {
    super();
    this.parent = parent;
    this.dragBounds = dragBounds;
    this.movementBounds = movementBounds;
    this.chatPetService = chatPetService;
    this.accessibilityService = accessibilityService;
    this.contextMenuService = contextMenuService;
    this._pupils = [];
    this._facingController = new ChatPetFacingController();
    this._directionChangeController = new ChatPetDirectionChangeController();
    this._dragMonitor = this._register(new GlobalPointerMoveMonitor());
    this._idleExpired = observableValue(this, false);
    this._confirmationAttentionExpired = observableValue(this, false);
    this._transientState = observableValue(this, void 0);
    this._isDragging = observableValue(this, false);
    this._isDead = observableValue(this, false);
    this._idleScheduler = this._register(new RunOnceScheduler(() => this._idleExpired.set(true, void 0), CHAT_PET_IDLE_SLEEP_DELAY));
    this._confirmationAttentionScheduler = this._register(new RunOnceScheduler(() => this._confirmationAttentionExpired.set(true, void 0), CHAT_PET_CONFIRMATION_ATTENTION_DURATION));
    this._transientScheduler = this._register(new RunOnceScheduler(() => this._transientState.set(void 0, void 0), TRANSIENT_STATE_DURATION));
    this._clickSuppressionScheduler = this._register(new RunOnceScheduler(() => this._suppressNextPointerClick = false, 0));
    this._spriteAnimation = this._register(new MutableDisposable());
    this._speechAnimation = this._register(new MutableDisposable());
    this._respawnAnimation = this._register(new MutableDisposable());
    this._throwAnimation = this._register(new MutableDisposable());
    this._respawnEffectScheduler = this._register(new RunOnceScheduler(() => this._showRespawnEffect(), RESPAWN_EFFECT_DURATION));
    this._respawnFallScheduler = this._register(new RunOnceScheduler(() => this._beginRespawnFall(), RESPAWN_EFFECT_DURATION));
    this._hopController = this._register(new ChatPetHopController({
      onDirectionChange: (direction) => this._button.element.dataset.hopDirection = direction < 0 ? "left" : "right",
      onMove: (delta) => this._setHorizontalPosition(this._getCurrentLeft() + delta),
      onStart: () => {
        if (this._transientState.get() === "jump") {
          this._renderState("jump", true);
        } else {
          this._transientState.set("jump", void 0);
        }
      },
      onReducedMotionStart: () => this._transientState.set("jump", void 0),
      onRequest: () => this._transientScheduler.schedule(HOP_IDLE_DEBOUNCE)
    }));
    this._contextMenuActions = this._register(new MutableDisposable());
    this._motionReduced = false;
    this._enabled = false;
    this._busy = false;
    this._enablementInitialized = false;
    this._hasCustomPosition = false;
    this._suppressNextPointerClick = false;
    this._contextMenuVisible = false;
    this._fallLandsOnPlatform = false;
    this._throwGeometryDirty = false;
    this._respawnPhase = "none";
    this._scale = 1;
    this._variant = this.chatPetService.variant.get();
    this._searchScheduler = this._register(new RunOnceScheduler(() => this._trySearch(), SEARCH_INTERVAL));
    this.parent.classList.add("chat-pet-host");
    this._overlay = dom.$(".chat-pet-overlay");
    this.parent.prepend(this._overlay);
    this._register(toDisposable(() => this._overlay.remove()));
    this._button = this._register(new Button(this._overlay, {
      ariaLabel: this._getAriaLabel(false)
    }));
    this._button.element.classList.add("chat-pet-button");
    this._button.element.dataset.facing = this._facingController.direction;
    this._visual = dom.append(this._button.element, dom.$(".chat-pet-visual"));
    const respawnEffectCanvas = dom.append(this._overlay, dom.$("canvas.chat-pet-canvas.chat-pet-respawn-effect.hidden"));
    respawnEffectCanvas.width = CHAT_PET_SOURCE_SIZE;
    respawnEffectCanvas.height = CHAT_PET_SOURCE_SIZE;
    respawnEffectCanvas.setAttribute("aria-hidden", "true");
    const respawnEffectImage = dom.append(this._overlay, dom.$("img.chat-pet-spritesheet"));
    respawnEffectImage.alt = "";
    respawnEffectImage.setAttribute("aria-hidden", "true");
    this._respawnEffect = { container: respawnEffectCanvas, image: respawnEffectImage, canvas: respawnEffectCanvas };
    this._register(dom.addDisposableListener(respawnEffectImage, "load", () => this._startRespawnEffectAnimation()));
    this._resizeObserver = this._register(new dom.DisposableResizeObserver("ChatPetWidget.dragBounds", () => {
      this._updateSpeechBubblePosition();
      const isAirborne = this._isAirborne();
      if (this._isDead.get()) {
        this._updateRespawnEffectPosition();
      } else if (isAirborne) {
        if (this._button.element.classList.contains("throwing")) {
          this._throwGeometryDirty = true;
        }
        return;
      } else if (this._fallLandsOnPlatform && !this._isDragging.get()) {
        if (this._hasCustomPosition) {
          this._setPlatformPosition(this._getCurrentLeft());
        } else {
          this._setDefaultPlatformPosition();
        }
      } else {
        this._updateVerticalPosition();
        if (this._hasCustomPosition && !this._isDragging.get()) {
          this._setHorizontalPosition(this._getCurrentLeft());
        } else if (!this._isDragging.get()) {
          this._setDefaultHorizontalPosition();
        }
      }
    }, dom.getWindow(this._button.element)));
    this._register(this._resizeObserver.observe(this.dragBounds));
    this._register(this._resizeObserver.observe(this.movementBounds));
    this._register(this._resizeObserver.observe(this.parent));
    this._updateVerticalPosition();
    this._setDefaultHorizontalPosition();
    this._updateSpeechBubblePosition();
    this._sprites = [0, 1].map(() => {
      const container = dom.append(this._visual, dom.$(".chat-pet-sprite.hidden"));
      const canvas = dom.append(container, dom.$("canvas.chat-pet-canvas"));
      canvas.width = CHAT_PET_SOURCE_SIZE;
      canvas.height = CHAT_PET_SOURCE_SIZE;
      canvas.setAttribute("aria-hidden", "true");
      const image = dom.append(container, dom.$("img.chat-pet-spritesheet"));
      image.alt = "";
      image.setAttribute("aria-hidden", "true");
      const sprite = { container, image, canvas };
      this._register(dom.addDisposableListener(image, "load", () => this._onImageLoad(sprite)));
      return sprite;
    });
    this._eyes = dom.append(this._visual, dom.$(".chat-pet-eyes"));
    this._eyes.setAttribute("aria-hidden", "true");
    for (const side of ["left", "right"]) {
      const eye = dom.append(this._eyes, dom.$(`.chat-pet-eye.${side}`));
      this._pupils.push(dom.append(eye, dom.$(".chat-pet-pupil")));
    }
    const speechBubbleContainer = dom.append(this._visual, dom.$(".chat-pet-speech-bubble.hidden"));
    const speechBubbleCanvas = dom.append(speechBubbleContainer, dom.$("canvas.chat-pet-canvas.chat-pet-speech-canvas"));
    speechBubbleCanvas.width = CHAT_PET_SOURCE_SIZE;
    speechBubbleCanvas.height = CHAT_PET_SOURCE_SIZE;
    speechBubbleCanvas.setAttribute("aria-hidden", "true");
    const speechBubbleImage = dom.append(speechBubbleContainer, dom.$("img.chat-pet-spritesheet"));
    speechBubbleImage.alt = "";
    speechBubbleImage.setAttribute("aria-hidden", "true");
    this._speechBubble = { container: speechBubbleContainer, image: speechBubbleImage, canvas: speechBubbleCanvas };
    this._register(dom.addDisposableListener(speechBubbleImage, "load", () => this._updateSpeechBubble(this._renderedState, true)));
    this._gazeScheduler = this._register(new dom.AnimationFrameScheduler(this._button.element, () => this._updateGaze()));
    this._register(dom.addDisposableListener(dom.getWindow(this._button.element).document, dom.EventType.POINTER_MOVE, (event) => {
      this._cursorPosition = [event.clientX, event.clientY];
      if (this._enabled && doesChatPetStateTrackCursor(this._renderedState)) {
        this._gazeScheduler.schedule();
      }
    }));
    const onAnimationComplete = (event) => {
      if (event.animationName === "chat-pet-enter") {
        this._button.element.classList.remove("entering");
      } else if (event.animationName === "chat-pet-exit" && !this._enabled) {
        this._finishDisable();
      } else if (event.animationName === "chat-pet-yapping-fall" && !this._isDragging.get() && event.target === this._activeSprite?.container && this._button.element.dataset.state === "yapping") {
        this._transientState.set("yappingMouthOpen", void 0);
      } else if (event.animationName === "chat-pet-search-down" && this._button.element.dataset.state === "searchingDown") {
        this._transientState.set(void 0, void 0);
      }
    };
    this._register(dom.addDisposableListener(this._button.element, dom.EventType.ANIMATION_END, onAnimationComplete));
    this._register(dom.addDisposableListener(this._button.element, "animationcancel", onAnimationComplete));
    const onTransitionComplete = (event) => {
      if (event.propertyName === "top" && this._button.element.classList.contains("falling")) {
        this._finishFall();
      }
    };
    this._register(dom.addDisposableListener(this._button.element, "transitionend", onTransitionComplete));
    this._register(dom.addDisposableListener(this._button.element, "transitioncancel", onTransitionComplete));
    this._register(dom.addDisposableListener(this._button.element, dom.EventType.POINTER_DOWN, (event) => this._startDrag(event)));
    this._register(dom.addDisposableListener(this._button.element, dom.EventType.KEY_DOWN, (event) => this._onKeyDown(event)));
    this._register(dom.addDisposableListener(this._button.element, dom.EventType.CONTEXT_MENU, (event) => {
      if (!this._enabled) {
        return;
      }
      dom.EventHelper.stop(event, true);
      this._showContextMenu(event);
    }));
    this._register(inputChanged(() => {
      if (this._enabled && !this.chatPetService.onTheRun.get()) {
        this._wake();
      }
    }));
    this._register(this._button.onDidClick((e) => {
      dom.EventHelper.stop(e, true);
      if (this._contextMenuVisible) {
        return;
      }
      if (this._suppressNextPointerClick && e.type !== dom.EventType.KEY_DOWN) {
        this._suppressNextPointerClick = false;
        this._clickSuppressionScheduler.cancel();
        return;
      }
      if (this.chatPetService.onTheRun.get()) {
        this._transientState.set(void 0, void 0);
        this.chatPetService.setOnTheRun(false);
        return;
      }
      const wasSleeping = this._idleExpired.get() || this._renderedState === "sleep";
      if (wasSleeping) {
        this._wake();
      }
      if (wasSleeping || this._transientState.get() === "waking") {
        status(localize("chatPet.wokeUp", "The VS Code pet woke up"));
        return;
      }
      const interaction = getChatPetClickInteraction(Math.random(), this._lastClickInteraction);
      this._lastClickInteraction = interaction;
      this._showTransientState(interaction);
      switch (interaction) {
        case "buttonPress":
          status(localize("chatPet.pressedButton", "The VS Code pet pressed its button"));
          break;
        case "complete":
          status(localize("chatPet.spun", "The VS Code pet did a rare spin"));
          break;
        case "love":
          status(localize("chatPet.loved", "The VS Code pet feels loved"));
          break;
        case "cool":
          status(localize("chatPet.cool", "The VS Code pet put on sunglasses"));
          break;
        case "yapping":
          status(localize("chatPet.yapping", "The VS Code pet is yapping"));
          break;
        case "sing":
          status(localize("chatPet.singing", "The VS Code pet is singing"));
          break;
        case "speechless":
          status(localize("chatPet.speechless", "The VS Code pet is speechless"));
          break;
        case "worry":
          status(localize("chatPet.worried", "The VS Code pet is worried"));
          break;
      }
    }));
    const motionReduced = observableFromEvent(this, this.accessibilityService.onDidChangeReducedMotion, () => this.accessibilityService.isMotionReduced());
    this._register(autorun((reader) => {
      const wasMotionReduced = this._motionReduced;
      this._motionReduced = motionReduced.read(reader);
      if (!wasMotionReduced && this._motionReduced && this._button.element.classList.contains("throwing")) {
        this._finishThrow();
      }
      const serviceEnabled = this.chatPetService.enabled.read(reader);
      const scale = this.chatPetService.scale.read(reader);
      if (scale !== this._scale) {
        this._setScale(scale);
      }
      const enabled = isChatPetVisible(serviceEnabled, isLatestFocusedWidget.read(reader));
      const variant = this.chatPetService.variant.read(reader);
      const variantChanged = variant !== this._variant;
      this._variant = variant;
      const onTheRun = this.chatPetService.onTheRun.read(reader);
      const isDead = this._isDead.read(reader);
      this._button.element.classList.toggle("on-the-run", onTheRun);
      this._button.setAriaLabel(this._getAriaLabel(onTheRun));
      const chatModel = model.read(reader);
      const request = chatModel?.lastRequestObs.read(reader);
      const needsInput = !!request?.response?.isPendingConfirmation.read(reader);
      let confirmationAttentionExpired = this._confirmationAttentionExpired.read(reader);
      if (!needsInput) {
        this._confirmationAttentionScheduler.cancel();
        if (confirmationAttentionExpired) {
          confirmationAttentionExpired = false;
          this._confirmationAttentionExpired.set(false, void 0);
        }
      } else if (!confirmationAttentionExpired && !this._confirmationAttentionScheduler.isScheduled()) {
        this._confirmationAttentionScheduler.schedule();
      }
      const hasActiveRequest = chatModel?.hasActiveRequest.read(reader) ?? false;
      const inputHasContent = hasInput.read(reader);
      this._busy = hasActiveRequest || needsInput;
      let idleExpired = this._idleExpired.read(reader);
      let transientState = this._transientState.read(reader);
      const isDragging = this._isDragging.read(reader);
      if (!this._enablementInitialized || enabled !== this._enabled) {
        const wasInitialized = this._enablementInitialized;
        this._enablementInitialized = true;
        this._enabled = enabled;
        if (enabled) {
          if (isDead) {
            this._showRespawnSequence();
          } else {
            this._startEnableAnimation();
          }
        } else if (wasInitialized) {
          this._startDisableAnimation();
        } else {
          this._finishDisable();
        }
      }
      if (!enabled) {
        this._hopController.cancel();
        this._idleScheduler.cancel();
        this._searchScheduler.cancel();
        this._transientScheduler.cancel();
        if (transientState !== void 0) {
          this._transientState.set(void 0, void 0);
        }
        if (this._motionReduced) {
          this._finishDisable();
        }
        return;
      }
      if (isDead) {
        this._hopController.cancel();
        this._idleScheduler.cancel();
        this._searchScheduler.cancel();
        this._transientScheduler.cancel();
        this._showRespawnSequence();
        return;
      }
      if (onTheRun) {
        this._hopController.cancel();
        this._idleScheduler.cancel();
        if (!this._searchScheduler.isScheduled()) {
          this._searchScheduler.schedule();
        }
        const state = transientState === "searching" || transientState === "searchingDown" ? transientState : "onTheRun";
        this._renderState(state, variantChanged);
        return;
      }
      this._searchScheduler.cancel();
      if (this._busy) {
        this._idleScheduler.cancel();
        if (idleExpired) {
          idleExpired = false;
          this._idleExpired.set(false, void 0);
          transientState = this._beginWakeAnimation() ?? transientState;
        }
      } else if (!idleExpired && !this._idleScheduler.isScheduled()) {
        this._idleScheduler.schedule();
      }
      const baseState = getChatPetBaseState(hasActiveRequest, needsInput, confirmationAttentionExpired, inputHasContent, idleExpired);
      if (isChatPetYapState(transientState) && baseState !== "idle") {
        transientState = void 0;
        this._transientState.set(void 0, void 0);
      }
      const renderedState = getChatPetRenderedState(baseState, transientState, isDragging);
      if (renderedState !== "jump" || this._motionReduced) {
        this._hopController.cancel();
      }
      this._renderState(renderedState, variantChanged, isDragging);
    }));
    this._register(autorun((reader) => {
      const chatModel = model.read(reader);
      const response = chatModel?.lastRequestObs.read(reader)?.response;
      if (!response) {
        return;
      }
      reader.store.add(response.onDidChange((e) => {
        if (e.reason === "completedRequest" && !response.isCanceled) {
          this._showTransientState("buttonPress");
        }
      }));
    }));
  }
  setPlatformTopProvider(provider) {
    this._platformTopProvider = provider;
    if (this._isAirborne()) {
      if (this._button.element.classList.contains("throwing")) {
        this._throwGeometryDirty = true;
      }
      return;
    }
    this._updateVerticalPosition();
    if (this._fallLandsOnPlatform && !this._isDragging.get()) {
      if (this._hasCustomPosition) {
        this._setPlatformPosition(this._getCurrentLeft());
      } else {
        this._setDefaultPlatformPosition();
      }
    }
  }
  _startDrag(event) {
    if (!this._enabled || this._isDead.get() || this._isDragging.get() || this._isAirborne() || this.chatPetService.onTheRun.get() || event.button !== 0) {
      return;
    }
    this._wake();
    dom.EventHelper.stop(event);
    this._button.element.focus();
    const targetWindow = dom.getWindow(this._button.element);
    const startX = event.clientX;
    const startY = event.clientY;
    const pointerSamples = [{ x: startX, y: startY, time: targetWindow.performance.now() }];
    const buttonBounds = this._button.element.getBoundingClientRect();
    const overlayBounds = this._overlay.getBoundingClientRect();
    const startLeft = buttonBounds.left - overlayBounds.left;
    const startTop = buttonBounds.top - overlayBounds.top;
    let didDrag = false;
    this._dragMonitor.startMonitoring(this._button.element, event.pointerId, event.buttons, (moveEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;
      const sampleTime = targetWindow.performance.now();
      pointerSamples.push({ x: moveEvent.clientX, y: moveEvent.clientY, time: sampleTime });
      while (pointerSamples.length > 2 && sampleTime - pointerSamples[0].time > THROW_VELOCITY_SAMPLE_DURATION) {
        pointerSamples.shift();
      }
      if (!didDrag && Math.hypot(deltaX, deltaY) < DRAG_THRESHOLD) {
        return;
      }
      if (!didDrag) {
        didDrag = true;
        this._button.element.classList.remove("entering");
        this._button.element.classList.add("dragging");
        this._spriteAnimation.clear();
        this._setDragPosition(startLeft, startTop);
        this._isDragging.set(true, void 0);
      }
      dom.EventHelper.stop(moveEvent, true);
      this._setDragPosition(startLeft + deltaX, startTop + deltaY);
    }, () => {
      this._button.element.classList.remove("dragging", "resisting", "soft-resisting");
      if (didDrag) {
        this._suppressNextPointerClick = true;
        this._clickSuppressionScheduler.schedule();
        const throwVelocity = getChatPetThrowVelocity(pointerSamples, targetWindow.performance.now());
        if (!this._motionReduced && throwVelocity) {
          this._beginThrow(throwVelocity);
        } else {
          this._beginFall();
        }
      }
    });
  }
  _setDragPosition(left, top) {
    const overlayBounds = this._overlay.getBoundingClientRect();
    const movementBounds = this.movementBounds.getBoundingClientRect();
    const minimumLeft = movementBounds.left - overlayBounds.left;
    const maximumLeft = movementBounds.right - overlayBounds.left - this._button.element.offsetWidth;
    const minimumTop = movementBounds.top - overlayBounds.top;
    const maximumTop = movementBounds.bottom - overlayBounds.top - this._button.element.offsetHeight;
    const [clampedLeft, clampedTop] = getChatPetDragPosition(left, top, minimumLeft, maximumLeft, minimumTop, maximumTop);
    this._button.element.style.left = `${clampedLeft}px`;
    this._button.element.style.top = `${clampedTop}px`;
    this._button.element.style.right = "auto";
    this._button.element.style.bottom = "auto";
    this._hasCustomPosition = true;
    this._updateSpeechBubblePosition();
    if (this._button.element.classList.contains("dragging")) {
      this._updateDragWiggle();
    }
  }
  _getFallTarget() {
    const overlayBounds = this._overlay.getBoundingClientRect();
    const platformBounds = this._getPlatformBounds();
    const movementBounds = this.movementBounds.getBoundingClientRect();
    return getChatPetFallTarget(
      Number.parseFloat(this._button.element.style.left),
      Number.parseFloat(this._button.element.style.top),
      this._getDisplaySize(),
      this._getDisplaySize(),
      platformBounds.left - overlayBounds.left,
      platformBounds.right - overlayBounds.left,
      platformBounds.top - overlayBounds.top,
      movementBounds.bottom - overlayBounds.top
    );
  }
  _updateDragWiggle() {
    const landsOnPlatform = this._getFallTarget().landsOnPlatform;
    this._button.element.classList.toggle("soft-resisting", landsOnPlatform);
    this._button.element.classList.toggle("resisting", !landsOnPlatform);
  }
  _getThrowGeometry() {
    const overlayBounds = this._overlay.getBoundingClientRect();
    const movementBounds = this.movementBounds.getBoundingClientRect();
    const platformBounds = this._getPlatformBounds();
    const displaySize = this._getDisplaySize();
    return {
      bounds: {
        minimumLeft: movementBounds.left - overlayBounds.left,
        maximumLeft: Math.max(movementBounds.left - overlayBounds.left, movementBounds.right - overlayBounds.left - displaySize),
        minimumTop: movementBounds.top - overlayBounds.top
      },
      displaySize,
      overlayLeft: overlayBounds.left,
      overlayTop: overlayBounds.top,
      platformLeft: platformBounds.left - overlayBounds.left,
      platformRight: platformBounds.right - overlayBounds.left,
      platformTop: platformBounds.top - overlayBounds.top,
      floorTop: movementBounds.bottom - overlayBounds.top - displaySize
    };
  }
  _beginThrow(velocity) {
    const targetWindow = dom.getWindow(this._button.element);
    let geometry = this._getThrowGeometry();
    const buttonBounds = this._button.element.getBoundingClientRect();
    let motion = {
      left: buttonBounds.left - geometry.overlayLeft,
      top: buttonBounds.top - geometry.overlayTop,
      x: velocity.x,
      y: velocity.y
    };
    let rotation = 0;
    let wallImpact;
    const startTime = targetWindow.performance.now();
    let lastFrameTime = startTime;
    if (velocity.x !== 0) {
      this._setFacingDirection(velocity.x < 0 ? "left" : "right");
    }
    this._transientScheduler.cancel();
    this._throwWallImpact = void 0;
    this._throwGeometryDirty = false;
    this._fallLandsOnPlatform = false;
    this._setThrowPosition(motion.left, motion.top);
    this._transientState.set("falling", void 0);
    this._isDragging.set(false, void 0);
    this._renderState("falling", true);
    this._button.element.classList.add("throwing");
    const animationDisposables = new DisposableStore();
    const scheduledFrame = animationDisposables.add(new MutableDisposable());
    const scheduleFrame = () => {
      scheduledFrame.value = dom.scheduleAtNextAnimationFrame(targetWindow, updateFrame);
    };
    const updateFrame = () => {
      if (this._throwAnimation.value !== animationDisposables) {
        return;
      }
      const now = targetWindow.performance.now();
      if (this._throwGeometryDirty) {
        geometry = this._getThrowGeometry();
        this._throwGeometryDirty = false;
        motion = {
          ...motion,
          left: getChatPetHorizontalPosition(motion.left, geometry.bounds.minimumLeft, geometry.bounds.maximumLeft)
        };
        this._setThrowPosition(motion.left, motion.top);
      }
      if (shouldSettleChatPetThrow(startTime, now, motion.top, motion.y, geometry.floorTop)) {
        this._finishThrow();
        return;
      }
      if (wallImpact) {
        if (now < wallImpact.endsAt) {
          scheduleFrame();
          return;
        }
        motion = {
          ...motion,
          x: -motion.x * THROW_WALL_RESTITUTION,
          y: -THROW_WALL_REBOUND_VELOCITY
        };
        rotation = wallImpact.wall === "left" ? -90 : 90;
        wallImpact = void 0;
        lastFrameTime = now;
        this._transientState.set("falling", void 0);
        scheduleFrame();
        return;
      }
      const elapsed = Math.min(THROW_MAX_FRAME_DURATION, Math.max(0, now - lastFrameTime));
      lastFrameTime = now;
      const previousLeft = motion.left;
      const previousTop = motion.top;
      const step = advanceChatPetThrow(motion, elapsed, geometry.bounds);
      motion = step;
      rotation += (motion.left - previousLeft) * THROW_ROTATION_PER_PIXEL;
      this._setThrowPosition(motion.left, motion.top);
      const landing = getChatPetThrowLanding(previousLeft, previousTop, motion.left, motion.top, geometry.displaySize, geometry.displaySize, geometry.platformLeft, geometry.platformRight, geometry.platformTop, geometry.floorTop);
      if (motion.y >= 0 && landing) {
        motion = {
          ...motion,
          left: landing.left,
          top: landing.top
        };
        this._setThrowPosition(motion.left, motion.top);
        this._finishThrow(true, landing);
        return;
      }
      if (step.wall) {
        this._throwWallImpact = step.wall;
        wallImpact = { wall: step.wall, endsAt: now + THROW_WALL_IMPACT_DURATION };
        this._setFacingDirection(step.wall);
        rotation = step.wall === "left" ? -90 : 90;
        this._button.element.style.transform = `rotate(${rotation}deg)`;
        this._transientState.set("wallImpact", void 0);
        scheduleFrame();
        return;
      }
      this._button.element.style.transform = `rotate(${rotation}deg)`;
      scheduleFrame();
    };
    this._throwAnimation.value = animationDisposables;
    scheduleFrame();
  }
  _setThrowPosition(left, top) {
    this._button.element.style.left = `${left}px`;
    this._button.element.style.top = `${top}px`;
    this._button.element.style.right = "auto";
    this._button.element.style.bottom = "auto";
    this._hasCustomPosition = true;
  }
  _getThrowSettleTarget() {
    const geometry = this._getThrowGeometry();
    return {
      top: geometry.platformTop - geometry.displaySize,
      landsOnPlatform: true
    };
  }
  _finishThrow(announce = true, target) {
    if (!this._button.element.classList.contains("throwing")) {
      return;
    }
    const resolvedTarget = target ?? this._getThrowSettleTarget();
    const wallImpact = this._throwWallImpact;
    this._throwWallImpact = void 0;
    this._throwGeometryDirty = false;
    this._throwAnimation.clear();
    this._button.element.style.transform = "";
    this._button.element.style.top = `${resolvedTarget.top}px`;
    this._button.element.classList.remove("throwing");
    this._fallLandsOnPlatform = resolvedTarget.landsOnPlatform;
    this._completeFall(announce, wallImpact);
  }
  _isAirborne() {
    return this._button.element.classList.contains("falling") || this._button.element.classList.contains("throwing");
  }
  _beginFall() {
    const top = Number.parseFloat(this._button.element.style.top);
    const target = this._getFallTarget();
    this._transientScheduler.cancel();
    this._throwAnimation.clear();
    this._throwWallImpact = void 0;
    this._throwGeometryDirty = false;
    this._button.element.style.transform = "";
    this._button.element.classList.remove("throwing");
    this._button.element.classList.remove("resisting", "soft-resisting");
    this._fallLandsOnPlatform = target.landsOnPlatform;
    this._transientState.set("falling", void 0);
    this._isDragging.set(false, void 0);
    this._renderState("falling", true);
    this._button.element.style.transitionDuration = `${getChatPetFallDuration(target.top - top)}ms`;
    this._button.element.getBoundingClientRect();
    this._button.element.classList.add("falling");
    this._button.element.style.top = `${target.top}px`;
    if (this._motionReduced || Math.abs(target.top - top) <= POSITION_EPSILON) {
      this._finishFall();
    }
  }
  _finishFall(announce = true) {
    if (!this._button.element.classList.contains("falling")) {
      return;
    }
    this._button.element.classList.remove("falling");
    this._button.element.style.transitionDuration = "";
    this._completeFall(announce);
  }
  _completeFall(announce, wallImpact) {
    if (this._fallLandsOnPlatform) {
      const respawned = this._respawnPhase === "falling";
      this._respawnPhase = "none";
      this._respawnPosition = void 0;
      const left = this._getCurrentLeft();
      this._setPlatformPosition(left);
      if (announce) {
        this._showTransientState("splat");
        if (respawned) {
          status(localize("chatPet.respawned", "The VS Code pet respawned"));
        } else if (wallImpact === "left") {
          status(localize("chatPet.bouncedOffLeftWall", "The VS Code pet bounced off the left wall and landed on the chat input"));
        } else if (wallImpact === "right") {
          status(localize("chatPet.bouncedOffRightWall", "The VS Code pet bounced off the right wall and landed on the chat input"));
        } else {
          status(localize("chatPet.landed", "The VS Code pet landed on the chat input"));
        }
      }
      return;
    }
    this._deathPosition = [
      Number.parseFloat(this._button.element.style.left),
      Number.parseFloat(this._button.element.style.top)
    ];
    this._respawnPhase = "none";
    this._respawnPosition = void 0;
    this._button.element.classList.add("hidden");
    this._button.element.tabIndex = -1;
    this._isDead.set(true, void 0);
    if (announce) {
      if (wallImpact === "left") {
        status(localize("chatPet.bouncedOffLeftWallAndFell", "The VS Code pet bounced off the left wall, fell off, and will respawn automatically"));
      } else if (wallImpact === "right") {
        status(localize("chatPet.bouncedOffRightWallAndFell", "The VS Code pet bounced off the right wall, fell off, and will respawn automatically"));
      } else {
        status(localize("chatPet.fellOff", "The VS Code pet fell off and will respawn automatically"));
      }
    }
  }
  _showContextMenu(event) {
    this._contextMenuVisible = true;
    const onTheRun = this.chatPetService.onTheRun.get();
    const actions = new DisposableStore();
    this._contextMenuActions.value = actions;
    const stable = actions.add(new Action("chat.pet.variant.stable", localize("chatPet.variant.stable.action", "Stable Colors"), void 0, true, () => this.chatPetService.setVariant("stable")));
    stable.checked = this.chatPetService.variant.get() === "stable";
    const insiders = actions.add(new Action("chat.pet.variant.insiders", localize("chatPet.variant.insiders.action", "Insiders Colors"), void 0, true, () => this.chatPetService.setVariant("insiders")));
    insiders.checked = this.chatPetService.variant.get() === "insiders";
    const grow = actions.add(new Action("chat.pet.grow", localize("chatPet.grow.action", "Grow"), void 0, true, () => {
      const scale = getChatPetScale(this._scale, CHAT_PET_SCALE_STEP);
      this.chatPetService.setScale(scale);
      status(localize("chatPet.grew", "VS Code pet size: {0} percent", Math.round(scale * 100)));
    }));
    const shrink = actions.add(new Action("chat.pet.shrink", localize("chatPet.shrink.action", "Shrink"), void 0, this._scale > CHAT_PET_MIN_SCALE, () => {
      const scale = getChatPetScale(this._scale, -CHAT_PET_SCALE_STEP);
      this.chatPetService.setScale(scale);
      status(localize("chatPet.shrank", "VS Code pet size: {0} percent", Math.round(scale * 100)));
    }));
    const onTheRunAction = actions.add(new Action(
      "chat.pet.onTheRun",
      onTheRun ? localize("chatPet.comeBack.action", "Come Back") : localize("chatPet.goOnTheRun.action", "Go on the Run"),
      void 0,
      true,
      () => {
        this._transientState.set(void 0, void 0);
        this.chatPetService.setOnTheRun(!onTheRun);
      }
    ));
    const interactionSeparator = new Separator();
    const appearanceSeparator = new Separator();
    this.contextMenuService.showContextMenu({
      getAnchor: () => new StandardMouseEvent(dom.getWindow(this._button.element), event),
      getActions: () => [
        onTheRunAction,
        interactionSeparator,
        grow,
        shrink,
        appearanceSeparator,
        stable,
        insiders
      ],
      onHide: () => {
        this._contextMenuVisible = false;
        if (this._contextMenuActions.value === actions) {
          this._contextMenuActions.clear();
        }
      }
    });
  }
  _onKeyDown(event) {
    const hasPointerInteraction = this._isDragging.get() || this._dragMonitor.isMonitoring();
    if (!isChatPetKeyboardInteractionEnabled(this._enabled, this._isDead.get(), hasPointerInteraction, this._isAirborne(), this.chatPetService.onTheRun.get())) {
      return;
    }
    const keyboardEvent = new StandardKeyboardEvent(event);
    let direction = 0;
    let throwRequested = false;
    if (keyboardEvent.equals(KeyMod.Shift | KeyCode.LeftArrow)) {
      direction = -1;
      throwRequested = true;
    } else if (keyboardEvent.equals(KeyMod.Shift | KeyCode.RightArrow)) {
      direction = 1;
      throwRequested = true;
    } else if (keyboardEvent.equals(KeyCode.LeftArrow)) {
      direction = -1;
    } else if (keyboardEvent.equals(KeyCode.RightArrow)) {
      direction = 1;
    } else {
      return;
    }
    this._wake();
    keyboardEvent.preventDefault();
    keyboardEvent.stopPropagation();
    const facingDirection = direction < 0 ? "left" : "right";
    if (this._transientState.get() === "dizzy" || this._recordDirectionChange(facingDirection)) {
      return;
    }
    this._setFacingDirection(facingDirection);
    if (throwRequested && !this._motionReduced) {
      this._beginThrow({
        x: direction * THROW_KEYBOARD_HORIZONTAL_VELOCITY,
        y: -THROW_MIN_UPWARD_VELOCITY
      });
      status(direction < 0 ? localize("chatPet.thrownLeft", "The VS Code pet was thrown toward the left wall") : localize("chatPet.thrownRight", "The VS Code pet was thrown toward the right wall"));
      return;
    }
    this._hopController.request(direction, this._motionReduced);
    status(direction < 0 ? localize("chatPet.movedLeft", "VS Code pet moved left") : localize("chatPet.movedRight", "VS Code pet moved right"));
  }
  _getAriaLabel(onTheRun) {
    return onTheRun ? localize("chatPet.restore", "Bring back the VS Code pet") : localize("chatPet.interact", "Interact with the VS Code pet. Drag it around the chat, or flick it toward either side to throw it. Use the left and right arrow keys to make it hop, or hold Shift to throw it toward a wall. Use the context menu to put it on the run.");
  }
  _getCurrentLeft() {
    return this._button.element.offsetLeft;
  }
  _getDisplaySize() {
    return CHAT_PET_SOURCE_SIZE / 2 * this._scale;
  }
  _setScale(scale) {
    this._scale = scale;
    const displaySize = this._getDisplaySize();
    this._button.element.style.width = `${displaySize}px`;
    this._button.element.style.height = `${displaySize}px`;
    this._visual.style.transform = `scale(${scale})`;
    if (this._button.element.classList.contains("throwing")) {
      this._throwGeometryDirty = true;
    }
    if (this._isDead.get() || this._isDragging.get() || this._isAirborne()) {
      return;
    }
    if (this._fallLandsOnPlatform) {
      if (this._hasCustomPosition) {
        this._setPlatformPosition(this._getCurrentLeft());
      } else {
        this._setDefaultPlatformPosition();
      }
    } else {
      this._updateVerticalPosition();
      if (this._hasCustomPosition) {
        this._setHorizontalPosition(this._getCurrentLeft());
      } else {
        this._setDefaultHorizontalPosition();
      }
    }
  }
  _setHorizontalPosition(left) {
    const parentBounds = this._overlay.getBoundingClientRect();
    const bounds = this.dragBounds.getBoundingClientRect();
    const minimumLeft = bounds.left - parentBounds.left;
    const maximumLeft = bounds.right - parentBounds.left - this._getDisplaySize();
    const clampedLeft = getChatPetHorizontalPosition(left, minimumLeft, maximumLeft);
    this._button.element.style.left = `${clampedLeft}px`;
    this._button.element.style.right = "auto";
    this._hasCustomPosition = true;
    this._updateSpeechBubblePosition();
    return clampedLeft !== left;
  }
  _setDefaultHorizontalPosition() {
    const overlayBounds = this._overlay.getBoundingClientRect();
    const inputBounds = this.dragBounds.getBoundingClientRect();
    const minimumLeft = inputBounds.left - overlayBounds.left;
    const maximumLeft = inputBounds.right - overlayBounds.left - this._getDisplaySize();
    this._button.element.style.left = `${getChatPetDefaultHorizontalPosition(minimumLeft, maximumLeft)}px`;
    this._button.element.style.right = "auto";
    this._hasCustomPosition = false;
    this._updateSpeechBubblePosition();
  }
  _getPlatformBounds() {
    const hostBounds = this._overlay.getBoundingClientRect();
    const inputBounds = this.dragBounds.getBoundingClientRect();
    return {
      left: inputBounds.left,
      right: inputBounds.right,
      top: getChatPetPlatformTop(hostBounds.top, inputBounds.top, this._platformTopProvider?.())
    };
  }
  _updateVerticalPosition() {
    const overlayBounds = this._overlay.getBoundingClientRect();
    const platformTop = this._getPlatformBounds().top;
    this._button.element.style.bottom = `calc(100% - ${platformTop - overlayBounds.top}px)`;
  }
  _setPlatformPosition(left) {
    const overlayBounds = this._overlay.getBoundingClientRect();
    const platformBounds = this._getPlatformBounds();
    this._button.element.style.top = `${platformBounds.top - overlayBounds.top - this._getDisplaySize()}px`;
    this._button.element.style.bottom = "auto";
    this._setHorizontalPosition(left);
  }
  _setDefaultPlatformPosition() {
    const overlayBounds = this._overlay.getBoundingClientRect();
    const platformBounds = this._getPlatformBounds();
    this._button.element.style.top = `${platformBounds.top - overlayBounds.top - this._getDisplaySize()}px`;
    this._button.element.style.bottom = "auto";
    this._setDefaultHorizontalPosition();
  }
  _showRespawnSequence() {
    this._button.element.classList.add("hidden");
    this._button.element.tabIndex = -1;
    const startsDespawning = this._respawnPhase === "none";
    if (startsDespawning) {
      this._respawnPhase = "despawning";
    }
    if (this._respawnPhase !== "despawning" && this._respawnPhase !== "respawning") {
      return;
    }
    this._respawnEffect.container.classList.remove("hidden");
    this._updateRespawnEffectPosition();
    this._startRespawnEffectAnimation();
    if (startsDespawning) {
      this._respawnEffectScheduler.schedule(this._motionReduced ? RESPAWN_EFFECT_REDUCED_MOTION_DURATION : RESPAWN_EFFECT_DURATION);
    }
  }
  _updateRespawnEffectPosition() {
    const overlayBounds = this._overlay.getBoundingClientRect();
    const movementBounds = this.movementBounds.getBoundingClientRect();
    const displaySize = this._getDisplaySize();
    let left;
    let top;
    if (this._respawnPhase === "despawning") {
      if (!this._deathPosition) {
        return;
      }
      const minimumLeft = movementBounds.left - overlayBounds.left;
      const maximumLeft = movementBounds.right - overlayBounds.left - displaySize;
      const minimumTop = movementBounds.top - overlayBounds.top;
      const maximumTop = movementBounds.bottom - overlayBounds.top - displaySize;
      [left, top] = getChatPetDragPosition(this._deathPosition[0], this._deathPosition[1], minimumLeft, maximumLeft, minimumTop, maximumTop);
      this._deathPosition = [left, top];
    } else if (this._respawnPhase === "respawning") {
      const inputBounds = this.dragBounds.getBoundingClientRect();
      const minimumLeft = inputBounds.left - overlayBounds.left;
      const maximumLeft = inputBounds.right - overlayBounds.left - displaySize;
      left = getChatPetDefaultHorizontalPosition(minimumLeft, maximumLeft);
      top = movementBounds.top - overlayBounds.top;
      this._respawnPosition = [left, top];
    } else {
      return;
    }
    this._respawnEffect.container.style.left = `${left}px`;
    this._respawnEffect.container.style.top = `${top}px`;
  }
  _showRespawnEffect() {
    if (!this._enabled || !this._isDead.get() || this._respawnPhase !== "despawning") {
      return;
    }
    this._respawnPhase = "respawning";
    this._respawnAnimation.clear();
    this._updateRespawnEffectPosition();
    this._startRespawnEffectAnimation();
    this._respawnFallScheduler.schedule(this._motionReduced ? RESPAWN_EFFECT_REDUCED_MOTION_DURATION : RESPAWN_EFFECT_DURATION);
    status(localize("chatPet.respawning", "The VS Code pet is respawning"));
  }
  _startRespawnEffectAnimation() {
    if (this._respawnPhase !== "despawning" && this._respawnPhase !== "respawning") {
      return;
    }
    const sources = getRespawnSpriteSources(this._variant);
    const source = this._motionReduced ? sources.reducedMotion : sources.animated;
    if (!isChatPetImageSource(this._respawnEffect.image, source.url)) {
      this._respawnAnimation.clear();
      this._respawnEffect.image.removeAttribute("src");
      this._respawnEffect.image.src = source.url;
      return;
    }
    if (this._respawnEffect.image.complete && this._respawnEffect.image.naturalWidth > 0) {
      this._respawnAnimation.clear();
      this._startSpriteAnimation(source, this._respawnEffect, this._respawnAnimation, void 0, this._respawnPhase === "despawning");
    }
  }
  _beginRespawnFall() {
    if (!this._enabled || !this._isDead.get() || this._respawnPhase !== "respawning") {
      return;
    }
    this._respawnPhase = "falling";
    this._respawnAnimation.clear();
    this._respawnEffect.container.classList.add("hidden");
    this._deathPosition = void 0;
    this._fallLandsOnPlatform = true;
    this._transientState.set("falling", void 0);
    this._button.element.classList.remove("falling", "throwing", "dragging", "resisting", "soft-resisting");
    this._button.element.style.transform = "";
    this._button.element.classList.remove("hidden");
    this._button.element.tabIndex = 0;
    if (!this._respawnPosition) {
      this._updateRespawnEffectPosition();
    }
    const [spawnLeft, spawnTop] = this._respawnPosition ?? [this._getCurrentLeft(), 0];
    this._button.element.style.left = `${spawnLeft}px`;
    this._button.element.style.right = "auto";
    this._hasCustomPosition = false;
    const overlayBounds = this._overlay.getBoundingClientRect();
    const platformBounds = this._getPlatformBounds();
    const startTop = spawnTop;
    const targetTop = platformBounds.top - overlayBounds.top - this._getDisplaySize();
    this._button.element.style.top = `${startTop}px`;
    this._button.element.style.bottom = "auto";
    this._button.element.style.transitionDuration = `${getChatPetFallDuration(targetTop - startTop)}ms`;
    this._renderState("falling", true);
    this._isDead.set(false, void 0);
    this._button.element.getBoundingClientRect();
    this._button.element.classList.add("falling");
    this._button.element.style.top = `${targetTop}px`;
    if (this._motionReduced || startTop === targetTop) {
      this._finishFall();
    }
  }
  _updateSpeechBubblePosition() {
    const buttonBounds = this._button.element.getBoundingClientRect();
    const inputBounds = this.dragBounds.getBoundingClientRect();
    this._button.element.classList.toggle("speech-bubble-left", shouldPlaceChatPetSpeechBubbleLeft(this._renderedState, buttonBounds.right, inputBounds.right, this._scale));
    const wideSpriteOffset = getChatPetWideSpriteHorizontalOffset(this._renderedState, this._facingController.direction, buttonBounds.left, buttonBounds.right, inputBounds.left, inputBounds.right, this._scale);
    if (this._activeSprite) {
      this._activeSprite.container.style.transform = wideSpriteOffset === 0 ? "" : `translateX(${wideSpriteOffset}px)`;
    }
  }
  _updateGaze() {
    if (!this._cursorPosition) {
      return;
    }
    const bounds = this._button.element.getBoundingClientRect();
    const facingDirection = this._facingController.update(this._cursorPosition[0], bounds.left + bounds.width / 2);
    if (this._button.element.dataset.facing !== facingDirection) {
      this._button.element.dataset.facing = facingDirection;
      this._recordDirectionChange(facingDirection);
    }
    const [x, y] = getChatPetGazeDirection(
      this._cursorPosition[0],
      this._cursorPosition[1],
      bounds.left + bounds.width / 2,
      bounds.top + bounds.height / 2
    );
    for (const pupil of this._pupils) {
      pupil.style.transform = `translate(${x * 2}px, ${y * 2}px)`;
    }
  }
  _snapFacingToCursor() {
    if (!this._cursorPosition) {
      return;
    }
    const bounds = this._button.element.getBoundingClientRect();
    this._setFacingDirection(this._facingController.snapToCursor(this._cursorPosition[0], bounds.left + bounds.width / 2));
  }
  _setFacingDirection(direction) {
    this._facingController.setDirection(direction);
    this._button.element.dataset.facing = direction;
  }
  _recordDirectionChange(direction) {
    if (!this._enabled || this._isDead.get() || this.chatPetService.onTheRun.get() || this._transientState.get() === "dizzy") {
      return false;
    }
    if (!this._directionChangeController.record(direction, dom.getWindow(this._button.element).performance.now())) {
      return false;
    }
    this._setFacingDirection(direction);
    this._showTransientState("dizzy", false);
    status(localize("chatPet.dizzy", "The VS Code pet got dizzy"));
    return true;
  }
  _startEnableAnimation() {
    this._button.element.classList.remove("hidden", "exiting", "entering");
    this._button.element.tabIndex = 0;
    this._restoreHorizontalPosition();
    this._button.element.getBoundingClientRect();
    this._gazeScheduler.schedule();
    if (!this._motionReduced) {
      this._button.element.classList.add("entering");
    }
  }
  _restoreHorizontalPosition() {
    const overlayBounds = this._overlay.getBoundingClientRect();
    const inputBounds = this.dragBounds.getBoundingClientRect();
    const minimumLeft = inputBounds.left - overlayBounds.left;
    const maximumLeft = inputBounds.right - overlayBounds.left - this._getDisplaySize();
    const previousLeft = this._hasCustomPosition ? this._getCurrentLeft() : void 0;
    this._button.element.style.left = `${getChatPetRestoredHorizontalPosition(previousLeft, minimumLeft, maximumLeft)}px`;
    this._button.element.style.right = "auto";
    this._updateSpeechBubblePosition();
  }
  _startDisableAnimation() {
    if (this._button.element.classList.contains("throwing")) {
      this._finishThrow(false);
    }
    this._button.element.tabIndex = -1;
    this._button.element.classList.remove("entering");
    if (this._motionReduced || this._button.element.classList.contains("hidden")) {
      this._finishDisable();
      return;
    }
    this._button.element.classList.add("exiting");
  }
  _finishDisable() {
    if (this._button.element.classList.contains("throwing")) {
      this._finishThrow(false);
    }
    if (this._button.element.classList.contains("falling")) {
      this._finishFall(false);
    }
    this._hopController.cancel();
    if (this._isDragging.get()) {
      this._isDragging.set(false, void 0);
    }
    this._throwAnimation.clear();
    this._throwGeometryDirty = false;
    this._button.element.style.transform = "";
    this._button.element.classList.remove("entering", "exiting", "falling", "throwing", "dragging", "resisting", "soft-resisting");
    this._button.element.style.transitionDuration = "";
    this._button.element.classList.add("hidden");
    this._respawnEffectScheduler.cancel();
    this._respawnFallScheduler.cancel();
    this._respawnAnimation.clear();
    this._respawnEffect.container.classList.add("hidden");
    this._respawnPhase = "none";
    this._respawnPosition = void 0;
    this._spriteAnimation.clear();
    this._speechAnimation.clear();
    this._speechBubble.container.classList.add("hidden");
    this._speechBubble.image.removeAttribute("src");
    this._pendingSprite = void 0;
    this._pendingSource = void 0;
    this._pendingState = void 0;
    this._activeSprite = void 0;
    this._renderedState = void 0;
    this._directionChangeController.reset();
    for (const sprite of this._sprites) {
      sprite.container.classList.add("hidden");
      sprite.image.removeAttribute("src");
    }
  }
  _showTransientState(state, snapFacingToCursor = true) {
    if (!this.chatPetService.enabled.get()) {
      return;
    }
    if (snapFacingToCursor) {
      this._snapFacingToCursor();
    }
    this._wake();
    const renderedState = state === "yapping" && this._motionReduced ? "yappingMouthOpen" : state;
    this._transientState.set(renderedState, void 0);
    if (renderedState === "yappingMouthOpen" || renderedState === "yapping") {
      this._transientScheduler.cancel();
    } else {
      this._transientScheduler.schedule(getTransientStateDuration(renderedState));
    }
    if (!this._isDragging.get() && this._transientState.get() === renderedState) {
      this._renderState(renderedState, true);
    }
  }
  _trySearch() {
    if (!this._enabled || !this.chatPetService.onTheRun.get()) {
      return;
    }
    if (this._motionReduced) {
      this._searchScheduler.schedule();
      return;
    }
    this._transientState.set("searching", void 0);
    this._renderState("searching", true);
    this._searchScheduler.schedule();
  }
  _wake() {
    const wasSleeping = this._idleExpired.get() || this._renderedState === "sleep";
    this._idleExpired.set(false, void 0);
    if (this._busy) {
      this._idleScheduler.cancel();
    } else {
      this._idleScheduler.schedule();
    }
    if (wasSleeping) {
      this._beginWakeAnimation();
    }
  }
  _beginWakeAnimation() {
    if (this._motionReduced) {
      return void 0;
    }
    this._transientState.set("waking", void 0);
    this._transientScheduler.schedule(WAKE_STATE_DURATION);
    return "waking";
  }
  _renderState(state, restart = false, useStaticSprite = false) {
    if (state !== "idle" || useStaticSprite) {
      this._facingController.setState(state, useStaticSprite);
    }
    const sources = getSpriteSources(this._variant)[state];
    const source = this._motionReduced || useStaticSprite ? sources.reducedMotion : sources.animated;
    if (!restart && this._activeSprite && isChatPetImageSource(this._activeSprite.image, source.url)) {
      this._pendingSprite = void 0;
      this._pendingSource = void 0;
      this._pendingState = void 0;
      this._button.element.dataset.state = state;
      this._renderedState = state;
      this._setRenderedFacingState(state, useStaticSprite);
      this._updateEyes(state);
      this._updateSpeechBubble(state, restart);
      return;
    }
    const sprite = this._sprites.find((candidate) => candidate !== this._activeSprite);
    if (!sprite) {
      return;
    }
    this._pendingSprite = sprite;
    this._pendingSource = source;
    this._pendingState = state;
    sprite.image.removeAttribute("src");
    sprite.image.src = source.url;
  }
  _onImageLoad(sprite) {
    if (sprite !== this._pendingSprite || this._pendingSource === void 0 || !isChatPetImageSource(sprite.image, this._pendingSource.url) || this._pendingState === void 0) {
      return;
    }
    this._spriteAnimation.clear();
    this._activeSprite?.container.classList.add("hidden");
    sprite.container.classList.remove("hidden");
    this._activeSprite = sprite;
    const state = this._pendingState;
    this._startSpriteAnimation(
      this._pendingSource,
      sprite,
      this._spriteAnimation,
      () => this._onSpriteAnimationComplete(sprite, state),
      false,
      (frameIndex) => {
        if (sprite === this._activeSprite) {
          this._updateEyes(state, frameIndex);
        }
      }
    );
    this._button.element.dataset.state = state;
    this._renderedState = state;
    this._setRenderedFacingState(state, this._isDragging.get());
    this._updateEyes(state);
    this._updateSpeechBubble(state, true);
    this._pendingSprite = void 0;
    this._pendingSource = void 0;
    this._pendingState = void 0;
    this._restartEyeAnimation();
  }
  _setRenderedFacingState(state, isDragging) {
    this._facingController.setState(state, isDragging);
    if (!isDragging && doesChatPetStateTrackCursor(state)) {
      this._gazeScheduler.schedule();
    }
  }
  _updateEyes(state, frameIndex) {
    const blinking = doesChatPetStateBlink(state, frameIndex);
    this._eyes.classList.toggle("tracking", doesChatPetStateTrackCursor(state));
    this._eyes.classList.toggle("blinking", blinking);
    if (blinking) {
      for (const pupil of this._pupils) {
        pupil.style.transform = "";
      }
    }
  }
  _onSpriteAnimationComplete(sprite, state) {
    if (sprite !== this._activeSprite) {
      return;
    }
    if (state === "jump") {
      this._hopController.onAnimationComplete();
      return;
    }
    if (state !== "searching" || !this.chatPetService.onTheRun.get()) {
      return;
    }
    this._transientState.set("searchingDown", void 0);
    this._button.element.dataset.state = "searchingDown";
    this._renderedState = "searchingDown";
  }
  _startSpriteAnimation(source, sprite, animationDisposable, onComplete, reverse = false, onFrame) {
    const { frameDurations } = source;
    const { image, canvas } = sprite;
    const displaySize = sprite === this._speechBubble ? 72 : sprite === this._respawnEffect ? this._getDisplaySize() : 48;
    const frameHeight = source.frameHeight ?? CHAT_PET_SOURCE_SIZE;
    const displayScale = displaySize / CHAT_PET_SOURCE_SIZE;
    const displayWidth = source.frameWidth * displayScale;
    const displayHeight = frameHeight * displayScale;
    sprite.container.style.width = `${displayWidth}px`;
    sprite.container.style.height = `${displayHeight}px`;
    canvas.width = source.frameWidth;
    canvas.height = frameHeight;
    canvas.style.width = `${displayWidth}px`;
    canvas.style.height = `${displayHeight}px`;
    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }
    context.imageSmoothingEnabled = false;
    const drawFrame = (frameIndex) => {
      context.clearRect(0, 0, source.frameWidth, frameHeight);
      const sourceX = frameIndex * source.frameWidth;
      if (source.fixedOrientationDecorations !== void 0 && this._facingController.direction === "left") {
        context.clearRect(0, 0, source.frameWidth, frameHeight);
        context.save();
        context.translate(source.frameWidth, 0);
        context.scale(-1, 1);
        context.drawImage(
          image,
          sourceX,
          0,
          source.frameWidth,
          frameHeight,
          0,
          0,
          source.frameWidth,
          frameHeight
        );
        context.restore();
        for (let decorationIndex = 0; decorationIndex < source.fixedOrientationDecorations.length; decorationIndex++) {
          const decoration = source.fixedOrientationDecorations[decorationIndex];
          const currentBounds = decoration.frameBounds[frameIndex];
          const canonicalBounds = decoration.frameBounds[decoration.sourceFrame];
          const [currentLeft, currentTop, currentRight, currentBottom] = currentBounds;
          const [canonicalLeft, canonicalTop, canonicalRight, canonicalBottom] = canonicalBounds;
          const canonicalWidth = canonicalRight - canonicalLeft;
          const canonicalHeight = canonicalBottom - canonicalTop;
          context.clearRect(source.frameWidth - currentRight, currentTop, currentRight - currentLeft, currentBottom - currentTop);
          context.drawImage(
            image,
            decoration.sourceFrame * source.frameWidth + canonicalLeft,
            canonicalTop,
            canonicalWidth,
            canonicalHeight,
            source.frameWidth - currentLeft - canonicalWidth,
            currentTop,
            canonicalWidth,
            canonicalHeight
          );
        }
        onFrame?.(frameIndex);
        return;
      }
      context.drawImage(
        image,
        sourceX,
        0,
        source.frameWidth,
        frameHeight,
        0,
        0,
        source.frameWidth,
        frameHeight
      );
      onFrame?.(frameIndex);
    };
    const initialFrameIndex = reverse && frameDurations.length > 0 ? frameDurations.length - 1 : 0;
    drawFrame(initialFrameIndex);
    if (frameDurations.length < 2) {
      return;
    }
    const targetWindow = dom.getWindow(canvas);
    const startTime = targetWindow.performance.now();
    let currentFrame = 0;
    let frameTimer;
    const animationDisposables = new DisposableStore();
    const clearFrameTimer = () => {
      if (frameTimer !== void 0) {
        targetWindow.clearTimeout(frameTimer);
        frameTimer = void 0;
      }
    };
    const scheduleFrame = (delay) => {
      clearFrameTimer();
      if (!targetWindow.document.hidden) {
        frameTimer = targetWindow.setTimeout(updateFrame, Math.max(1, Math.ceil(delay)));
      }
    };
    const updateFrame = () => {
      frameTimer = void 0;
      const frame = getChatPetAnimationFrame(frameDurations, targetWindow.performance.now() - startTime, source.iterations, reverse);
      if (frame.complete) {
        drawFrame(frame.frameIndex);
        animationDisposables.dispose();
        onComplete?.();
        return;
      }
      if (frame.frameIndex !== currentFrame) {
        currentFrame = frame.frameIndex;
        drawFrame(frame.frameIndex);
      }
      scheduleFrame(frame.nextFrameDelay);
    };
    animationDisposables.add(dom.addDisposableListener(targetWindow.document, "visibilitychange", () => {
      clearFrameTimer();
      if (!targetWindow.document.hidden) {
        updateFrame();
      }
    }));
    animationDisposables.add(toDisposable(clearFrameTimer));
    scheduleFrame(frameDurations[initialFrameIndex]);
    animationDisposable.value = animationDisposables;
  }
  _updateSpeechBubble(state, restart = false) {
    this._updateSpeechBubblePosition();
    const visible = doesChatPetStateSpeak(state);
    this._speechBubble.container.classList.toggle("hidden", !visible);
    if (!visible) {
      this._speechAnimation.clear();
      return;
    }
    const sources = getSpeechSpriteSources(this._variant);
    const source = this._motionReduced ? sources.reducedMotion : sources.animated;
    if (!isChatPetImageSource(this._speechBubble.image, source.url)) {
      this._speechAnimation.clear();
      this._speechBubble.image.removeAttribute("src");
      this._speechBubble.image.src = source.url;
      return;
    }
    if (restart && this._speechBubble.image.complete && this._speechBubble.image.naturalWidth > 0) {
      this._speechAnimation.clear();
      this._startSpriteAnimation(source, this._speechBubble, this._speechAnimation);
    }
  }
  _restartEyeAnimation() {
    this._eyes.classList.remove("animated");
    this._eyes.getBoundingClientRect();
    if (!this._motionReduced) {
      this._eyes.classList.add("animated");
    }
  }
};
ChatPetWidget = __decorateClass([
  __decorateParam(7, IChatPetService),
  __decorateParam(8, IAccessibilityService),
  __decorateParam(9, IContextMenuService)
], ChatPetWidget);
export {
  CHAT_PET_CONFIRMATION_ATTENTION_DURATION,
  CHAT_PET_ICON_TRANSFORMATION_CHANCE,
  CHAT_PET_IDLE_SLEEP_DELAY,
  CHAT_PET_YAPPING_CHANCE,
  ChatPetDirectionChangeController,
  ChatPetFacingController,
  ChatPetHopController,
  ChatPetWidget,
  advanceChatPetThrow,
  doesChatPetStateBlink,
  doesChatPetStateTrackCursor,
  getChatPetAnimationFrame,
  getChatPetBaseState,
  getChatPetBuddyName,
  getChatPetClickInteraction,
  getChatPetDefaultHorizontalPosition,
  getChatPetDragPosition,
  getChatPetFallDuration,
  getChatPetFallTarget,
  getChatPetFrameDurations,
  getChatPetGazeDirection,
  getChatPetHorizontalPosition,
  getChatPetPlatformTop,
  getChatPetRenderedState,
  getChatPetRespawnFrameDurations,
  getChatPetRestoredHorizontalPosition,
  getChatPetScale,
  getChatPetSpeechFrameDurations,
  getChatPetSpriteName,
  getChatPetThrowLanding,
  getChatPetThrowVelocity,
  getChatPetVerticalOffset,
  getChatPetWideSpriteHorizontalOffset,
  isChatPetImageSource,
  isChatPetKeyboardInteractionEnabled,
  isChatPetVisible,
  shouldPlaceChatPetSpeechBubbleLeft,
  shouldSettleChatPetThrow
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXHdpZGdldFxcY2hhdFBldFdpZGdldC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAnLi9tZWRpYS9jaGF0UGV0LmNzcyc7XG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBHbG9iYWxQb2ludGVyTW92ZU1vbml0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZ2xvYmFsUG9pbnRlck1vdmVNb25pdG9yLmpzJztcbmltcG9ydCB7IFN0YW5kYXJkS2V5Ym9hcmRFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9rZXlib2FyZEV2ZW50LmpzJztcbmltcG9ydCB7IFN0YW5kYXJkTW91c2VFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9tb3VzZUV2ZW50LmpzJztcbmltcG9ydCB7IEJ1dHRvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9idXR0b24vYnV0dG9uLmpzJztcbmltcG9ydCB7IHN0YXR1cyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hcmlhL2FyaWEuanMnO1xuaW1wb3J0IHsgQWN0aW9uLCBJQWN0aW9uLCBTZXBhcmF0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IFJ1bk9uY2VTY2hlZHVsZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBLZXlDb2RlLCBLZXlNb2QgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlLCBNdXRhYmxlRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IEZpbGVBY2Nlc3MgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IGF1dG9ydW4sIElPYnNlcnZhYmxlLCBvYnNlcnZhYmxlRnJvbUV2ZW50LCBvYnNlcnZhYmxlVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElBY2Nlc3NpYmlsaXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjY2Vzc2liaWxpdHkvY29tbW9uL2FjY2Vzc2liaWxpdHkuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRNZW51U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dFZpZXcuanMnO1xuaW1wb3J0IHsgSUNoYXRNb2RlbCB9IGZyb20gJy4uLy4uL2NvbW1vbi9tb2RlbC9jaGF0TW9kZWwuanMnO1xuaW1wb3J0IHsgQ2hhdFBldFZhcmlhbnQsIElDaGF0UGV0U2VydmljZSB9IGZyb20gJy4uL2NoYXRQZXRTZXJ2aWNlLmpzJztcblxuZXhwb3J0IHR5cGUgQ2hhdFBldFN0YXRlID0gJ2lkbGUnIHwgJ3NsZWVwJyB8ICd3YWtpbmcnIHwgJ3R5cGluZycgfCAncmVuZGVyaW5nJyB8ICdidXR0b25QcmVzcycgfCAnY29tcGxldGUnIHwgJ2xvdmUnIHwgJ2NsYXBwaW5nJyB8ICdqdW1wJyB8ICdjb29sJyB8ICd5YXBwaW5nJyB8ICd5YXBwaW5nTW91dGhPcGVuJyB8ICdzaW5nJyB8ICdzcGVlY2hsZXNzJyB8ICd3b3JyeScgfCAnZGl6enknIHwgJ2ZhbGxpbmcnIHwgJ3dhbGxJbXBhY3QnIHwgJ3NwbGF0JyB8ICdvblRoZVJ1bicgfCAnc2VhcmNoaW5nJyB8ICdzZWFyY2hpbmdEb3duJztcbmV4cG9ydCB0eXBlIENoYXRQZXRDbGlja0ludGVyYWN0aW9uID0gRXh0cmFjdDxDaGF0UGV0U3RhdGUsICdidXR0b25QcmVzcycgfCAnY29tcGxldGUnIHwgJ2xvdmUnIHwgJ2Nvb2wnIHwgJ3lhcHBpbmcnIHwgJ3NpbmcnIHwgJ3NwZWVjaGxlc3MnIHwgJ3dvcnJ5Jz47XG5cbmV4cG9ydCBjb25zdCBDSEFUX1BFVF9JRExFX1NMRUVQX0RFTEFZID0gMjBfMDAwO1xuZXhwb3J0IGNvbnN0IENIQVRfUEVUX0NPTkZJUk1BVElPTl9BVFRFTlRJT05fRFVSQVRJT04gPSAyXzAwMDtcbmV4cG9ydCBjb25zdCBDSEFUX1BFVF9JQ09OX1RSQU5TRk9STUFUSU9OX0NIQU5DRSA9IDEgLyAxMDA7XG5leHBvcnQgY29uc3QgQ0hBVF9QRVRfWUFQUElOR19DSEFOQ0UgPSAxIC8gMTAwO1xuY29uc3QgVFJBTlNJRU5UX1NUQVRFX0RVUkFUSU9OID0gMl8wMDA7XG5jb25zdCBDT01QTEVURV9TVEFURV9EVVJBVElPTiA9IDk2MDtcbmNvbnN0IEJVVFRPTl9QUkVTU19TVEFURV9EVVJBVElPTiA9IDJfODUwO1xuY29uc3QgU1BMQVRfU1RBVEVfRFVSQVRJT04gPSA1MjA7XG5jb25zdCBMT1ZFX1NUQVRFX0RVUkFUSU9OID0gMl85NDA7XG5jb25zdCBDT09MX1NUQVRFX0RVUkFUSU9OID0gM18wMDA7XG5jb25zdCBTSU5HX1NUQVRFX0RVUkFUSU9OID0gMl84ODA7XG5jb25zdCBTUEVFQ0hMRVNTX1NUQVRFX0RVUkFUSU9OID0gMl83MjA7XG5jb25zdCBXT1JSWV9TVEFURV9EVVJBVElPTiA9IDJfNDAwO1xuY29uc3QgRElaWllfU1RBVEVfRFVSQVRJT04gPSAyXzIwMDtcbmNvbnN0IFdBS0VfU1RBVEVfRFVSQVRJT04gPSA4ODA7XG5jb25zdCBESVpaWV9ESVJFQ1RJT05fQ0hBTkdFX0NPVU5UID0gODtcbmNvbnN0IERJWlpZX0RJUkVDVElPTl9DSEFOR0VfTUFYX0lOVEVSVkFMID0gNjAwO1xuY29uc3QgU0VBUkNIX0lOVEVSVkFMID0gMTBfMDAwO1xuY29uc3QgUkVTUEFXTl9FRkZFQ1RfRFVSQVRJT04gPSA4MDA7XG5jb25zdCBSRVNQQVdOX0VGRkVDVF9SRURVQ0VEX01PVElPTl9EVVJBVElPTiA9IDQwMDtcbmNvbnN0IERSQUdfVEhSRVNIT0xEID0gMjtcbmNvbnN0IEhPUF9ESVNUQU5DRSA9IDI0O1xuY29uc3QgSE9QX0FQRVhfREVMQVkgPSAzMDA7XG5jb25zdCBIT1BfUkVTVF9ERUxBWSA9IDkwO1xuY29uc3QgSE9QX0hPTERfR1JBQ0UgPSAzNTA7XG5jb25zdCBIT1BfSURMRV9ERUJPVU5DRSA9IDkwMDtcbmNvbnN0IFBPU0lUSU9OX0VQU0lMT04gPSAwLjU7XG5jb25zdCBUSFJPV19WRUxPQ0lUWV9TQU1QTEVfRFVSQVRJT04gPSAxMDA7XG5jb25zdCBUSFJPV19SRUxFQVNFX0dSQUNFX0RVUkFUSU9OID0gODA7XG5jb25zdCBUSFJPV19NSU5fSE9SSVpPTlRBTF9WRUxPQ0lUWSA9IDY1MDtcbmNvbnN0IFRIUk9XX01JTl9GTElHSFRfVkVMT0NJVFkgPSAxXzAwMDtcbmNvbnN0IFRIUk9XX01BWF9IT1JJWk9OVEFMX1ZFTE9DSVRZID0gMl80MDA7XG5jb25zdCBUSFJPV19NSU5fVVBXQVJEX1ZFTE9DSVRZID0gNDIwO1xuY29uc3QgVEhST1dfTUFYX1VQV0FSRF9WRUxPQ0lUWSA9IDFfNDAwO1xuY29uc3QgVEhST1dfS0VZQk9BUkRfSE9SSVpPTlRBTF9WRUxPQ0lUWSA9IDFfNDAwO1xuY29uc3QgVEhST1dfR1JBVklUWSA9IDFfODAwO1xuY29uc3QgVEhST1dfTUFYX0ZSQU1FX0RVUkFUSU9OID0gMzI7XG5jb25zdCBUSFJPV19NQVhfRFVSQVRJT04gPSA0XzAwMDtcbmNvbnN0IFRIUk9XX1dBTExfSU1QQUNUX0RVUkFUSU9OID0gMTEwO1xuY29uc3QgVEhST1dfV0FMTF9SRVNUSVRVVElPTiA9IDAuMTtcbmNvbnN0IFRIUk9XX1dBTExfUkVCT1VORF9WRUxPQ0lUWSA9IDEyMDtcbmNvbnN0IFRIUk9XX0NFSUxJTkdfUkVTVElUVVRJT04gPSAwLjI7XG5jb25zdCBUSFJPV19ST1RBVElPTl9QRVJfUElYRUwgPSAwLjY1O1xuY29uc3QgQ0hBVF9QRVRfU09VUkNFX1NJWkUgPSA5NjtcbmNvbnN0IENIQVRfUEVUX1NMRUVQX1NPVVJDRV9XSURUSCA9IDEyMDtcbmNvbnN0IENIQVRfUEVUX1RZUElOR19TT1VSQ0VfV0lEVEggPSAxNjg7XG5jb25zdCBDSEFUX1BFVF9CVVRUT05fUFJFU1NfU09VUkNFX1dJRFRIID0gMTYwO1xuY29uc3QgQ0hBVF9QRVRfU0lOR19TT1VSQ0VfV0lEVEggPSAxNjQ7XG5jb25zdCBDSEFUX1BFVF9TSU5HX1NPVVJDRV9IRUlHSFQgPSAxMjQ7XG5jb25zdCBDSEFUX1BFVF9ESVpaWV9TT1VSQ0VfSEVJR0hUID0gMTI4O1xuY29uc3QgQ0hBVF9QRVRfTUFYX1ZFUlRJQ0FMX09GRlNFVCA9IDEwO1xuY29uc3QgQ0hBVF9QRVRfREVGQVVMVF9SSUdIVF9JTlNFVCA9IDMyO1xuY29uc3QgQ0hBVF9QRVRfTUlOX1NDQUxFID0gMC40O1xuY29uc3QgQ0hBVF9QRVRfU0NBTEVfU1RFUCA9IDAuMjtcbmNvbnN0IENIQVRfUEVUX1NQRUVDSF9CVUJCTEVfUklHSFRfT1ZFUkhBTkcgPSAyMDtcbmNvbnN0IENIQVRfUEVUX1NMRUVQX1JJR0hUX09WRVJIQU5HID0gKENIQVRfUEVUX1NMRUVQX1NPVVJDRV9XSURUSCAtIENIQVRfUEVUX1NPVVJDRV9TSVpFKSAvIDI7XG5jb25zdCBDSEFUX1BFVF9UWVBJTkdfUklHSFRfT1ZFUkhBTkcgPSAoQ0hBVF9QRVRfVFlQSU5HX1NPVVJDRV9XSURUSCAtIENIQVRfUEVUX1NPVVJDRV9TSVpFKSAvIDI7XG5jb25zdCBDSEFUX1BFVF9CVVRUT05fUFJFU1NfUklHSFRfT1ZFUkhBTkcgPSAoQ0hBVF9QRVRfQlVUVE9OX1BSRVNTX1NPVVJDRV9XSURUSCAtIENIQVRfUEVUX1NPVVJDRV9TSVpFKSAvIDI7XG5jb25zdCBDSEFUX1BFVF9TSU5HX1JJR0hUX09WRVJIQU5HID0gKENIQVRfUEVUX1NJTkdfU09VUkNFX1dJRFRIIC0gQ0hBVF9QRVRfU09VUkNFX1NJWkUpIC8gMjtcblxuY29uc3QgSURMRV9GUkFNRV9EVVJBVElPTlMgPSBBcnJheS5mcm9tKHsgbGVuZ3RoOiA1MCB9LCAoKSA9PiA0MCk7XG5jb25zdCBTTEVFUF9GUkFNRV9EVVJBVElPTlMgPSBBcnJheS5mcm9tKHsgbGVuZ3RoOiA4IH0sICgpID0+IDMwMCk7XG5jb25zdCBXQUtFX0ZSQU1FX0RVUkFUSU9OUyA9IFsxNjAsIDEwMCwgODAsIDkwLCA5MCwgOTAsIDEwMCwgMTcwXTtcbmNvbnN0IFRZUElOR19GUkFNRV9EVVJBVElPTlMgPSBbMzIwLCA0ODBdO1xuY29uc3QgQlVUVE9OX1BSRVNTX0ZSQU1FX0RVUkFUSU9OUyA9IFs1MDAsIDMwMCwgMzUwLCAyNTAsIDQ1MCwgMV8wMDBdO1xuY29uc3QgRkFMTElOR19GUkFNRV9EVVJBVElPTlMgPSBbMTIwLCA4MCwgODAsIDEyMCwgODAsIDgwXTtcbmNvbnN0IEpVTVBfRlJBTUVfRFVSQVRJT05TID0gWzcwLCA4MCwgOTAsIDE2MCwgMTAwLCAxMDBdO1xuY29uc3QgU1BMQVRfRlJBTUVfRFVSQVRJT05TID0gWzEyMCwgMTAwLCAxMDAsIDIwMF07XG5jb25zdCBSRVNQQVdOX0ZSQU1FX0RVUkFUSU9OUyA9IFsxMjAsIDEwMCwgMTIwLCAyNDAsIDEwMCwgMTIwXTtcbmNvbnN0IFNQRUVDSF9GUkFNRV9EVVJBVElPTlMgPSBbMjIwLCAyMjAsIDIyMCwgMTAwLCAxNjAsIDE4MF07XG5jb25zdCBDTEFQUElOR19GUkFNRV9EVVJBVElPTlMgPSBbODAsIDQwLCA0MCwgNDAsIDgwLCA0MCwgNDAsIDQwLCA0MCwgODAsIDQwLCA0MCwgODBdO1xuY29uc3QgTE9WRV9GUkFNRV9EVVJBVElPTlMgPSBbMjAwLCAyMDAsIDM4MCwgMTAwLCA4MCwgMV85ODBdO1xuY29uc3QgQ09PTF9GUkFNRV9EVVJBVElPTlMgPSBbNjAwLCAxMjAsIDEyMCwgMTIwLCAxNjAsIDgwLCA4MCwgODAsIDFfNjQwXTtcbmNvbnN0IFNJTkdfRlJBTUVfRFVSQVRJT05TID0gWzE4MCwgMTgwLCAxODAsIDE4MF07XG5jb25zdCBTUEVFQ0hMRVNTX0ZSQU1FX0RVUkFUSU9OUyA9IFs0MDAsIDEyMCwgMV8wMDAsIDEyMCwgMV8wODBdO1xuY29uc3QgV09SUllfRlJBTUVfRFVSQVRJT05TID0gWzYwMCwgNjAwXTtcbmNvbnN0IERJWlpZX0ZSQU1FX0RVUkFUSU9OUyA9IEFycmF5LmZyb20oeyBsZW5ndGg6IDggfSwgKCkgPT4gMTIwKTtcbmNvbnN0IFNFQVJDSF9GUkFNRV9EVVJBVElPTlMgPSBbNTAwLCA1MDAsIDUwMCwgNTAwXTtcblxuaW50ZXJmYWNlIENoYXRQZXRGaXhlZE9yaWVudGF0aW9uRGVjb3JhdGlvbiB7XG5cdHJlYWRvbmx5IGZyYW1lQm91bmRzOiByZWFkb25seSAocmVhZG9ubHkgW251bWJlciwgbnVtYmVyLCBudW1iZXIsIG51bWJlcl0pW107XG5cdHJlYWRvbmx5IHNvdXJjZUZyYW1lOiBudW1iZXI7XG59XG5cbmludGVyZmFjZSBDaGF0UGV0U3ByaXRlU291cmNlIHtcblx0cmVhZG9ubHkgdXJsOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGZyYW1lV2lkdGg6IG51bWJlcjtcblx0cmVhZG9ubHkgZnJhbWVIZWlnaHQ/OiBudW1iZXI7XG5cdHJlYWRvbmx5IGZpeGVkT3JpZW50YXRpb25EZWNvcmF0aW9ucz86IHJlYWRvbmx5IENoYXRQZXRGaXhlZE9yaWVudGF0aW9uRGVjb3JhdGlvbltdO1xuXHRyZWFkb25seSBmcmFtZUR1cmF0aW9uczogcmVhZG9ubHkgbnVtYmVyW107XG5cdHJlYWRvbmx5IGl0ZXJhdGlvbnM6IG51bWJlcjtcbn1cblxuaW50ZXJmYWNlIENoYXRQZXRTcHJpdGVTb3VyY2VzIHtcblx0cmVhZG9ubHkgYW5pbWF0ZWQ6IENoYXRQZXRTcHJpdGVTb3VyY2U7XG5cdHJlYWRvbmx5IHJlZHVjZWRNb3Rpb246IENoYXRQZXRTcHJpdGVTb3VyY2U7XG59XG5cbmludGVyZmFjZSBDaGF0UGV0U3ByaXRlRWxlbWVudCB7XG5cdHJlYWRvbmx5IGNvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IGltYWdlOiBIVE1MSW1hZ2VFbGVtZW50O1xuXHRyZWFkb25seSBjYW52YXM6IEhUTUxDYW52YXNFbGVtZW50O1xufVxuXG5jb25zdCBDSEFUX1BFVF9TSU5HX0ZJWEVEX09SSUVOVEFUSU9OX0RFQ09SQVRJT05TOiByZWFkb25seSBDaGF0UGV0Rml4ZWRPcmllbnRhdGlvbkRlY29yYXRpb25bXSA9IFtcblx0e1xuXHRcdGZyYW1lQm91bmRzOiBbXG5cdFx0XHRbMTYsIDM2LCA4MCwgNTJdLFxuXHRcdFx0WzE2LCAzNiwgODAsIDUyXSxcblx0XHRcdFsxNiwgMzYsIDgwLCA1Ml0sXG5cdFx0XHRbMTYsIDM2LCA4MCwgNTJdLFxuXHRcdF0sXG5cdFx0c291cmNlRnJhbWU6IDAsXG5cdH0sXG5cdHtcblx0XHRmcmFtZUJvdW5kczogW1xuXHRcdFx0Wzk2LCA4LCAxNjAsIDcyXSxcblx0XHRcdFs5NiwgNCwgMTYwLCA2OF0sXG5cdFx0XHRbMTAwLCAwLCAxNjQsIDY0XSxcblx0XHRcdFs5MiwgNCwgMTU2LCA2OF0sXG5cdFx0XSxcblx0XHRzb3VyY2VGcmFtZTogMCxcblx0fSxcbl07XG5cbmludGVyZmFjZSBDaGF0UGV0UG9pbnRlclNhbXBsZSB7XG5cdHJlYWRvbmx5IHg6IG51bWJlcjtcblx0cmVhZG9ubHkgeTogbnVtYmVyO1xuXHRyZWFkb25seSB0aW1lOiBudW1iZXI7XG59XG5cbmludGVyZmFjZSBDaGF0UGV0VGhyb3dWZWxvY2l0eSB7XG5cdHJlYWRvbmx5IHg6IG51bWJlcjtcblx0cmVhZG9ubHkgeTogbnVtYmVyO1xufVxuXG5pbnRlcmZhY2UgQ2hhdFBldFRocm93TW90aW9uIGV4dGVuZHMgQ2hhdFBldFRocm93VmVsb2NpdHkge1xuXHRyZWFkb25seSBsZWZ0OiBudW1iZXI7XG5cdHJlYWRvbmx5IHRvcDogbnVtYmVyO1xufVxuXG50eXBlIENoYXRQZXRXYWxsID0gJ2xlZnQnIHwgJ3JpZ2h0JztcblxuaW50ZXJmYWNlIENoYXRQZXRUaHJvd0JvdW5kcyB7XG5cdHJlYWRvbmx5IG1pbmltdW1MZWZ0OiBudW1iZXI7XG5cdHJlYWRvbmx5IG1heGltdW1MZWZ0OiBudW1iZXI7XG5cdHJlYWRvbmx5IG1pbmltdW1Ub3A6IG51bWJlcjtcbn1cblxuaW50ZXJmYWNlIENoYXRQZXRUaHJvd0dlb21ldHJ5IHtcblx0cmVhZG9ubHkgYm91bmRzOiBDaGF0UGV0VGhyb3dCb3VuZHM7XG5cdHJlYWRvbmx5IGRpc3BsYXlTaXplOiBudW1iZXI7XG5cdHJlYWRvbmx5IG92ZXJsYXlMZWZ0OiBudW1iZXI7XG5cdHJlYWRvbmx5IG92ZXJsYXlUb3A6IG51bWJlcjtcblx0cmVhZG9ubHkgcGxhdGZvcm1MZWZ0OiBudW1iZXI7XG5cdHJlYWRvbmx5IHBsYXRmb3JtUmlnaHQ6IG51bWJlcjtcblx0cmVhZG9ubHkgcGxhdGZvcm1Ub3A6IG51bWJlcjtcblx0cmVhZG9ubHkgZmxvb3JUb3A6IG51bWJlcjtcbn1cblxuaW50ZXJmYWNlIENoYXRQZXRUaHJvd1N0ZXAgZXh0ZW5kcyBDaGF0UGV0VGhyb3dNb3Rpb24ge1xuXHRyZWFkb25seSB3YWxsOiBDaGF0UGV0V2FsbCB8IHVuZGVmaW5lZDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldENoYXRQZXRCdWRkeU5hbWUocXVhbGl0eTogc3RyaW5nIHwgdW5kZWZpbmVkKTogJ2J1ZGR5LWlkbGUtc3RhYmxlJyB8ICdidWRkeS1pZGxlLWluc2lkZXJzJyB7XG5cdHJldHVybiBxdWFsaXR5ID09PSAnc3RhYmxlJyA/ICdidWRkeS1pZGxlLXN0YWJsZScgOiAnYnVkZHktaWRsZS1pbnNpZGVycyc7XG59XG5cbmNvbnN0IHNwcml0ZVNvdXJjZXMgPSBuZXcgTWFwPENoYXRQZXRWYXJpYW50LCBSZWNvcmQ8Q2hhdFBldFN0YXRlLCBDaGF0UGV0U3ByaXRlU291cmNlcz4+KCk7XG5jb25zdCBzcGVlY2hTcHJpdGVTb3VyY2VzID0gbmV3IE1hcDxDaGF0UGV0VmFyaWFudCwgQ2hhdFBldFNwcml0ZVNvdXJjZXM+KCk7XG5jb25zdCByZXNwYXduU3ByaXRlU291cmNlcyA9IG5ldyBNYXA8Q2hhdFBldFZhcmlhbnQsIENoYXRQZXRTcHJpdGVTb3VyY2VzPigpO1xuXG5leHBvcnQgZnVuY3Rpb24gZG9lc0NoYXRQZXRTdGF0ZVRyYWNrQ3Vyc29yKHN0YXRlOiBDaGF0UGV0U3RhdGUgfCB1bmRlZmluZWQpOiBib29sZWFuIHtcblx0cmV0dXJuIHN0YXRlICE9PSB1bmRlZmluZWQgJiYgc3RhdGUgIT09ICdzbGVlcCcgJiYgc3RhdGUgIT09ICd3YWtpbmcnICYmIHN0YXRlICE9PSAndHlwaW5nJyAmJiBzdGF0ZSAhPT0gJ2J1dHRvblByZXNzJyAmJiBzdGF0ZSAhPT0gJ2NvbXBsZXRlJyAmJiBzdGF0ZSAhPT0gJ2p1bXAnICYmIHN0YXRlICE9PSAnbG92ZScgJiYgc3RhdGUgIT09ICdjb29sJyAmJiBzdGF0ZSAhPT0gJ3lhcHBpbmdNb3V0aE9wZW4nICYmIHN0YXRlICE9PSAnc2luZycgJiYgc3RhdGUgIT09ICdzcGVlY2hsZXNzJyAmJiBzdGF0ZSAhPT0gJ3dvcnJ5JyAmJiBzdGF0ZSAhPT0gJ2Rpenp5JyAmJiBzdGF0ZSAhPT0gJ2ZhbGxpbmcnICYmIHN0YXRlICE9PSAnd2FsbEltcGFjdCcgJiYgc3RhdGUgIT09ICdzcGxhdCcgJiYgc3RhdGUgIT09ICdvblRoZVJ1bicgJiYgc3RhdGUgIT09ICdzZWFyY2hpbmcnICYmIHN0YXRlICE9PSAnc2VhcmNoaW5nRG93bic7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBkb2VzQ2hhdFBldFN0YXRlQmxpbmsoc3RhdGU6IENoYXRQZXRTdGF0ZSB8IHVuZGVmaW5lZCwgZnJhbWVJbmRleD86IG51bWJlcik6IGJvb2xlYW4ge1xuXHRyZXR1cm4gKHN0YXRlID09PSAndHlwaW5nJyB8fCBzdGF0ZSA9PT0gJ2J1dHRvblByZXNzJyB8fCBzdGF0ZSA9PT0gJ2xvdmUnKVxuXHRcdCYmIChzdGF0ZSAhPT0gJ2J1dHRvblByZXNzJyB8fCBmcmFtZUluZGV4ICE9PSBCVVRUT05fUFJFU1NfRlJBTUVfRFVSQVRJT05TLmxlbmd0aCAtIDEpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0Q2hhdFBldFNwcml0ZU5hbWUoc3RhdGU6IENoYXRQZXRTdGF0ZSwgcXVhbGl0eTogc3RyaW5nIHwgdW5kZWZpbmVkKTogc3RyaW5nIHtcblx0Y29uc3QgdmFyaWFudCA9IHF1YWxpdHkgPT09ICdzdGFibGUnID8gJ3N0YWJsZScgOiAnaW5zaWRlcnMnO1xuXHRzd2l0Y2ggKHN0YXRlKSB7XG5cdFx0Y2FzZSAnbG92ZSc6XG5cdFx0XHRyZXR1cm4gYGJ1ZGR5LWxvdmUtJHt2YXJpYW50fWA7XG5cdFx0Y2FzZSAnY2xhcHBpbmcnOlxuXHRcdFx0cmV0dXJuIGBidWRkeS1jbGFwcGluZy0ke3ZhcmlhbnR9YDtcblx0XHRjYXNlICdjb29sJzpcblx0XHRcdHJldHVybiBgYnVkZHktY29vbC0ke3ZhcmlhbnR9YDtcblx0XHRjYXNlICdidXR0b25QcmVzcyc6XG5cdFx0XHRyZXR1cm4gYGJ1ZGR5LXByZXNzLWJ1dHRvbi0ke3ZhcmlhbnR9YDtcblx0XHRjYXNlICdmYWxsaW5nJzpcblx0XHRcdHJldHVybiBgYnVkZHktZmFsbGluZy0ke3ZhcmlhbnR9YDtcblx0XHRjYXNlICdqdW1wJzpcblx0XHRcdHJldHVybiBgYnVkZHktanVtcC0ke3ZhcmlhbnR9YDtcblx0XHRjYXNlICdkaXp6eSc6XG5cdFx0XHRyZXR1cm4gYGJ1ZGR5LWRpenp5LSR7dmFyaWFudH1gO1xuXHRcdGNhc2UgJ3dhbGxJbXBhY3QnOlxuXHRcdFx0cmV0dXJuIGBidWRkeS13YWxsLWltcGFjdC0ke3ZhcmlhbnR9YDtcblx0XHRjYXNlICdzcGxhdCc6XG5cdFx0XHRyZXR1cm4gYGJ1ZGR5LXNwbGF0LSR7dmFyaWFudH1gO1xuXHRcdGNhc2UgJ29uVGhlUnVuJzpcblx0XHRjYXNlICdzZWFyY2hpbmcnOlxuXHRcdGNhc2UgJ3NlYXJjaGluZ0Rvd24nOlxuXHRcdFx0cmV0dXJuIGBidWRkeS1zZWFyY2gtJHt2YXJpYW50fWA7XG5cdFx0Y2FzZSAnc2xlZXAnOlxuXHRcdFx0cmV0dXJuIGBidWRkeS1zbGVlcC0ke3ZhcmlhbnR9YDtcblx0XHRjYXNlICd3YWtpbmcnOlxuXHRcdFx0cmV0dXJuIGBidWRkeS13YWtpbmctJHt2YXJpYW50fWA7XG5cdFx0Y2FzZSAndHlwaW5nJzpcblx0XHRcdHJldHVybiBgYnVkZHktdHlwaW5nLSR7dmFyaWFudH1gO1xuXHRcdGNhc2UgJ3JlbmRlcmluZyc6XG5cdFx0XHRyZXR1cm4gYGJ1ZGR5LXJlbmRlcmluZy0ke3ZhcmlhbnR9YDtcblx0XHRjYXNlICd5YXBwaW5nTW91dGhPcGVuJzpcblx0XHRcdHJldHVybiBgYnVkZHkteWFwcGluZy0ke3ZhcmlhbnR9YDtcblx0XHRjYXNlICdzaW5nJzpcblx0XHRjYXNlICdzcGVlY2hsZXNzJzpcblx0XHRjYXNlICd3b3JyeSc6XG5cdFx0XHRyZXR1cm4gYGJ1ZGR5LSR7c3RhdGV9LSR7dmFyaWFudH1gO1xuXHRcdGRlZmF1bHQ6XG5cdFx0XHRyZXR1cm4gZ2V0Q2hhdFBldEJ1ZGR5TmFtZShxdWFsaXR5KTtcblx0fVxufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0Q2hhdFBldEZyYW1lRHVyYXRpb25zKHN0YXRlOiBDaGF0UGV0U3RhdGUpOiByZWFkb25seSBudW1iZXJbXSB7XG5cdHN3aXRjaCAoc3RhdGUpIHtcblx0XHRjYXNlICdzbGVlcCc6XG5cdFx0XHRyZXR1cm4gU0xFRVBfRlJBTUVfRFVSQVRJT05TO1xuXHRcdGNhc2UgJ3dha2luZyc6XG5cdFx0XHRyZXR1cm4gV0FLRV9GUkFNRV9EVVJBVElPTlM7XG5cdFx0Y2FzZSAndHlwaW5nJzpcblx0XHRcdHJldHVybiBUWVBJTkdfRlJBTUVfRFVSQVRJT05TO1xuXHRcdGNhc2UgJ2J1dHRvblByZXNzJzpcblx0XHRcdHJldHVybiBCVVRUT05fUFJFU1NfRlJBTUVfRFVSQVRJT05TO1xuXHRcdGNhc2UgJ2ZhbGxpbmcnOlxuXHRcdFx0cmV0dXJuIEZBTExJTkdfRlJBTUVfRFVSQVRJT05TO1xuXHRcdGNhc2UgJ2p1bXAnOlxuXHRcdFx0cmV0dXJuIEpVTVBfRlJBTUVfRFVSQVRJT05TO1xuXHRcdGNhc2UgJ3NwbGF0Jzpcblx0XHRcdHJldHVybiBTUExBVF9GUkFNRV9EVVJBVElPTlM7XG5cdFx0Y2FzZSAncmVuZGVyaW5nJzpcblx0XHRcdHJldHVybiBJRExFX0ZSQU1FX0RVUkFUSU9OUztcblx0XHRjYXNlICdjbGFwcGluZyc6XG5cdFx0XHRyZXR1cm4gQ0xBUFBJTkdfRlJBTUVfRFVSQVRJT05TO1xuXHRcdGNhc2UgJ2xvdmUnOlxuXHRcdFx0cmV0dXJuIExPVkVfRlJBTUVfRFVSQVRJT05TO1xuXHRcdGNhc2UgJ2Nvb2wnOlxuXHRcdFx0cmV0dXJuIENPT0xfRlJBTUVfRFVSQVRJT05TO1xuXHRcdGNhc2UgJ3NpbmcnOlxuXHRcdFx0cmV0dXJuIFNJTkdfRlJBTUVfRFVSQVRJT05TO1xuXHRcdGNhc2UgJ3NwZWVjaGxlc3MnOlxuXHRcdFx0cmV0dXJuIFNQRUVDSExFU1NfRlJBTUVfRFVSQVRJT05TO1xuXHRcdGNhc2UgJ3dvcnJ5Jzpcblx0XHRcdHJldHVybiBXT1JSWV9GUkFNRV9EVVJBVElPTlM7XG5cdFx0Y2FzZSAnZGl6enknOlxuXHRcdFx0cmV0dXJuIERJWlpZX0ZSQU1FX0RVUkFUSU9OUztcblx0XHRjYXNlICdzZWFyY2hpbmcnOlxuXHRcdFx0cmV0dXJuIFNFQVJDSF9GUkFNRV9EVVJBVElPTlM7XG5cdFx0Y2FzZSAnb25UaGVSdW4nOlxuXHRcdGNhc2UgJ3dhbGxJbXBhY3QnOlxuXHRcdGNhc2UgJ3NlYXJjaGluZ0Rvd24nOlxuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdGNhc2UgJ3lhcHBpbmdNb3V0aE9wZW4nOlxuXHRcdGNhc2UgJ3lhcHBpbmcnOlxuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdGRlZmF1bHQ6XG5cdFx0XHRyZXR1cm4gSURMRV9GUkFNRV9EVVJBVElPTlM7XG5cdH1cbn1cblxuZnVuY3Rpb24gY3JlYXRlU3ByaXRlU291cmNlcyhuYW1lOiBzdHJpbmcsIHN0YXRlOiBDaGF0UGV0U3RhdGUsIHRyYWNrc0N1cnNvciA9IHRydWUsIHNvdXJjZVdpZHRoPzogbnVtYmVyLCBzb3VyY2VIZWlnaHQgPSBDSEFUX1BFVF9TT1VSQ0VfU0laRSwgZml4ZWRPcmllbnRhdGlvbkRlY29yYXRpb25zPzogcmVhZG9ubHkgQ2hhdFBldEZpeGVkT3JpZW50YXRpb25EZWNvcmF0aW9uW10pOiBDaGF0UGV0U3ByaXRlU291cmNlcyB7XG5cdGNvbnN0IHJvb3QgPSAndnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL3dpZGdldC9tZWRpYS9jaGF0UGV0Jztcblx0Y29uc3Qgc3VmZml4ID0gdHJhY2tzQ3Vyc29yID8gJy10cmFja2luZy05NicgOiBgLSR7c291cmNlSGVpZ2h0fWA7XG5cdGNvbnN0IGZyYW1lRHVyYXRpb25zID0gZ2V0Q2hhdFBldEZyYW1lRHVyYXRpb25zKHN0YXRlKTtcblx0Y29uc3QgZnJhbWVXaWR0aCA9IHNvdXJjZVdpZHRoID8/IChzdGF0ZSA9PT0gJ3R5cGluZydcblx0XHQ/IENIQVRfUEVUX1RZUElOR19TT1VSQ0VfV0lEVEhcblx0XHQ6IHN0YXRlID09PSAnYnV0dG9uUHJlc3MnXG5cdFx0XHQ/IENIQVRfUEVUX0JVVFRPTl9QUkVTU19TT1VSQ0VfV0lEVEhcblx0XHRcdDogQ0hBVF9QRVRfU09VUkNFX1NJWkUpO1xuXHRjb25zdCBzdGF0aWNTb3VyY2UgPSB7XG5cdFx0dXJsOiBGaWxlQWNjZXNzLmFzQnJvd3NlclVyaShgJHtyb290fS8ke25hbWV9JHtzdWZmaXh9LnBuZ2ApLnRvU3RyaW5nKHRydWUpLFxuXHRcdGZyYW1lV2lkdGgsXG5cdFx0ZnJhbWVIZWlnaHQ6IHNvdXJjZUhlaWdodCxcblx0XHRmaXhlZE9yaWVudGF0aW9uRGVjb3JhdGlvbnMsXG5cdFx0ZnJhbWVEdXJhdGlvbnM6IFtdLFxuXHRcdGl0ZXJhdGlvbnM6IDEsXG5cdH07XG5cdHJldHVybiB7XG5cdFx0YW5pbWF0ZWQ6IGZyYW1lRHVyYXRpb25zLmxlbmd0aCA9PT0gMCA/IHN0YXRpY1NvdXJjZSA6IHtcblx0XHRcdHVybDogRmlsZUFjY2Vzcy5hc0Jyb3dzZXJVcmkoYCR7cm9vdH0vJHtuYW1lfSR7c3VmZml4fS5zcHJpdGVzaGVldC5wbmdgKS50b1N0cmluZyh0cnVlKSxcblx0XHRcdGZyYW1lV2lkdGgsXG5cdFx0XHRmcmFtZUhlaWdodDogc291cmNlSGVpZ2h0LFxuXHRcdFx0Zml4ZWRPcmllbnRhdGlvbkRlY29yYXRpb25zLFxuXHRcdFx0ZnJhbWVEdXJhdGlvbnMsXG5cdFx0XHRpdGVyYXRpb25zOiBzdGF0ZSA9PT0gJ3dha2luZycgfHwgc3RhdGUgPT09ICdidXR0b25QcmVzcycgfHwgc3RhdGUgPT09ICdjb29sJyB8fCBzdGF0ZSA9PT0gJ3NwbGF0JyB8fCBzdGF0ZSA9PT0gJ3NlYXJjaGluZycgfHwgc3RhdGUgPT09ICdqdW1wJyA/IDEgOiBJbmZpbml0eSxcblx0XHR9LFxuXHRcdHJlZHVjZWRNb3Rpb246IHN0YXRpY1NvdXJjZSxcblx0fTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldENoYXRQZXRTcGVlY2hGcmFtZUR1cmF0aW9ucygpOiByZWFkb25seSBudW1iZXJbXSB7XG5cdHJldHVybiBTUEVFQ0hfRlJBTUVfRFVSQVRJT05TO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0Q2hhdFBldFJlc3Bhd25GcmFtZUR1cmF0aW9ucygpOiByZWFkb25seSBudW1iZXJbXSB7XG5cdHJldHVybiBSRVNQQVdOX0ZSQU1FX0RVUkFUSU9OUztcbn1cblxuZnVuY3Rpb24gZ2V0U3ByaXRlU291cmNlcyh2YXJpYW50OiBDaGF0UGV0VmFyaWFudCk6IFJlY29yZDxDaGF0UGV0U3RhdGUsIENoYXRQZXRTcHJpdGVTb3VyY2VzPiB7XG5cdGxldCBzb3VyY2VzID0gc3ByaXRlU291cmNlcy5nZXQodmFyaWFudCk7XG5cdGlmICghc291cmNlcykge1xuXHRcdGNvbnN0IGNyZWF0ZVN0YXRlU3ByaXRlU291cmNlcyA9IChzdGF0ZTogQ2hhdFBldFN0YXRlKSA9PiBjcmVhdGVTcHJpdGVTb3VyY2VzKGdldENoYXRQZXRTcHJpdGVOYW1lKHN0YXRlLCB2YXJpYW50KSwgc3RhdGUsIGRvZXNDaGF0UGV0U3RhdGVUcmFja0N1cnNvcihzdGF0ZSkpO1xuXHRcdHNvdXJjZXMgPSB7XG5cdFx0XHRpZGxlOiBjcmVhdGVTdGF0ZVNwcml0ZVNvdXJjZXMoJ2lkbGUnKSxcblx0XHRcdHNsZWVwOiBjcmVhdGVTcHJpdGVTb3VyY2VzKGdldENoYXRQZXRTcHJpdGVOYW1lKCdzbGVlcCcsIHZhcmlhbnQpLCAnc2xlZXAnLCBmYWxzZSwgQ0hBVF9QRVRfU0xFRVBfU09VUkNFX1dJRFRIKSxcblx0XHRcdHdha2luZzogY3JlYXRlU3ByaXRlU291cmNlcyhnZXRDaGF0UGV0U3ByaXRlTmFtZSgnd2FraW5nJywgdmFyaWFudCksICd3YWtpbmcnLCBmYWxzZSwgQ0hBVF9QRVRfU0xFRVBfU09VUkNFX1dJRFRIKSxcblx0XHRcdHR5cGluZzogY3JlYXRlU3RhdGVTcHJpdGVTb3VyY2VzKCd0eXBpbmcnKSxcblx0XHRcdHJlbmRlcmluZzogY3JlYXRlU3RhdGVTcHJpdGVTb3VyY2VzKCdyZW5kZXJpbmcnKSxcblx0XHRcdGJ1dHRvblByZXNzOiBjcmVhdGVTdGF0ZVNwcml0ZVNvdXJjZXMoJ2J1dHRvblByZXNzJyksXG5cdFx0XHRjb21wbGV0ZTogY3JlYXRlU3RhdGVTcHJpdGVTb3VyY2VzKCdjb21wbGV0ZScpLFxuXHRcdFx0bG92ZTogY3JlYXRlU3RhdGVTcHJpdGVTb3VyY2VzKCdsb3ZlJyksXG5cdFx0XHRjbGFwcGluZzogY3JlYXRlU3RhdGVTcHJpdGVTb3VyY2VzKCdjbGFwcGluZycpLFxuXHRcdFx0anVtcDogY3JlYXRlU3RhdGVTcHJpdGVTb3VyY2VzKCdqdW1wJyksXG5cdFx0XHRjb29sOiBjcmVhdGVTdGF0ZVNwcml0ZVNvdXJjZXMoJ2Nvb2wnKSxcblx0XHRcdHlhcHBpbmc6IGNyZWF0ZVN0YXRlU3ByaXRlU291cmNlcygneWFwcGluZycpLFxuXHRcdFx0eWFwcGluZ01vdXRoT3BlbjogY3JlYXRlU3RhdGVTcHJpdGVTb3VyY2VzKCd5YXBwaW5nTW91dGhPcGVuJyksXG5cdFx0XHRzaW5nOiBjcmVhdGVTcHJpdGVTb3VyY2VzKGdldENoYXRQZXRTcHJpdGVOYW1lKCdzaW5nJywgdmFyaWFudCksICdzaW5nJywgZmFsc2UsIENIQVRfUEVUX1NJTkdfU09VUkNFX1dJRFRILCBDSEFUX1BFVF9TSU5HX1NPVVJDRV9IRUlHSFQsIENIQVRfUEVUX1NJTkdfRklYRURfT1JJRU5UQVRJT05fREVDT1JBVElPTlMpLFxuXHRcdFx0c3BlZWNobGVzczogY3JlYXRlU3RhdGVTcHJpdGVTb3VyY2VzKCdzcGVlY2hsZXNzJyksXG5cdFx0XHR3b3JyeTogY3JlYXRlU3RhdGVTcHJpdGVTb3VyY2VzKCd3b3JyeScpLFxuXHRcdFx0ZGl6enk6IGNyZWF0ZVNwcml0ZVNvdXJjZXMoZ2V0Q2hhdFBldFNwcml0ZU5hbWUoJ2Rpenp5JywgdmFyaWFudCksICdkaXp6eScsIGZhbHNlLCB1bmRlZmluZWQsIENIQVRfUEVUX0RJWlpZX1NPVVJDRV9IRUlHSFQpLFxuXHRcdFx0ZmFsbGluZzogY3JlYXRlU3RhdGVTcHJpdGVTb3VyY2VzKCdmYWxsaW5nJyksXG5cdFx0XHR3YWxsSW1wYWN0OiBjcmVhdGVTdGF0ZVNwcml0ZVNvdXJjZXMoJ3dhbGxJbXBhY3QnKSxcblx0XHRcdHNwbGF0OiBjcmVhdGVTdGF0ZVNwcml0ZVNvdXJjZXMoJ3NwbGF0JyksXG5cdFx0XHRvblRoZVJ1bjogY3JlYXRlU3RhdGVTcHJpdGVTb3VyY2VzKCdvblRoZVJ1bicpLFxuXHRcdFx0c2VhcmNoaW5nOiBjcmVhdGVTdGF0ZVNwcml0ZVNvdXJjZXMoJ3NlYXJjaGluZycpLFxuXHRcdFx0c2VhcmNoaW5nRG93bjogY3JlYXRlU3RhdGVTcHJpdGVTb3VyY2VzKCdzZWFyY2hpbmdEb3duJyksXG5cdFx0fTtcblx0XHRzcHJpdGVTb3VyY2VzLnNldCh2YXJpYW50LCBzb3VyY2VzKTtcblx0fVxuXG5cdHJldHVybiBzb3VyY2VzO1xufVxuXG5mdW5jdGlvbiBnZXRTcGVlY2hTcHJpdGVTb3VyY2VzKHZhcmlhbnQ6IENoYXRQZXRWYXJpYW50KTogQ2hhdFBldFNwcml0ZVNvdXJjZXMge1xuXHRsZXQgc291cmNlcyA9IHNwZWVjaFNwcml0ZVNvdXJjZXMuZ2V0KHZhcmlhbnQpO1xuXHRpZiAoIXNvdXJjZXMpIHtcblx0XHRjb25zdCByb290ID0gJ3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvbWVkaWEvY2hhdFBldCc7XG5cdFx0Y29uc3QgbmFtZSA9IGBidWRkeS1zcGVlY2gtJHt2YXJpYW50fS05NmA7XG5cdFx0c291cmNlcyA9IHtcblx0XHRcdGFuaW1hdGVkOiB7XG5cdFx0XHRcdHVybDogRmlsZUFjY2Vzcy5hc0Jyb3dzZXJVcmkoYCR7cm9vdH0vJHtuYW1lfS5zcHJpdGVzaGVldC5wbmdgKS50b1N0cmluZyh0cnVlKSxcblx0XHRcdFx0ZnJhbWVXaWR0aDogQ0hBVF9QRVRfU09VUkNFX1NJWkUsXG5cdFx0XHRcdGZyYW1lRHVyYXRpb25zOiBTUEVFQ0hfRlJBTUVfRFVSQVRJT05TLFxuXHRcdFx0XHRpdGVyYXRpb25zOiBJbmZpbml0eSxcblx0XHRcdH0sXG5cdFx0XHRyZWR1Y2VkTW90aW9uOiB7XG5cdFx0XHRcdHVybDogRmlsZUFjY2Vzcy5hc0Jyb3dzZXJVcmkoYCR7cm9vdH0vJHtuYW1lfS5wbmdgKS50b1N0cmluZyh0cnVlKSxcblx0XHRcdFx0ZnJhbWVXaWR0aDogQ0hBVF9QRVRfU09VUkNFX1NJWkUsXG5cdFx0XHRcdGZyYW1lRHVyYXRpb25zOiBbXSxcblx0XHRcdFx0aXRlcmF0aW9uczogMSxcblx0XHRcdH0sXG5cdFx0fTtcblx0XHRzcGVlY2hTcHJpdGVTb3VyY2VzLnNldCh2YXJpYW50LCBzb3VyY2VzKTtcblx0fVxuXHRyZXR1cm4gc291cmNlcztcbn1cblxuZnVuY3Rpb24gZ2V0UmVzcGF3blNwcml0ZVNvdXJjZXModmFyaWFudDogQ2hhdFBldFZhcmlhbnQpOiBDaGF0UGV0U3ByaXRlU291cmNlcyB7XG5cdGxldCBzb3VyY2VzID0gcmVzcGF3blNwcml0ZVNvdXJjZXMuZ2V0KHZhcmlhbnQpO1xuXHRpZiAoIXNvdXJjZXMpIHtcblx0XHRjb25zdCByb290ID0gJ3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvbWVkaWEvY2hhdFBldCc7XG5cdFx0Y29uc3QgbmFtZSA9IGBidWRkeS1yZXNwYXduLSR7dmFyaWFudH0tOTZgO1xuXHRcdHNvdXJjZXMgPSB7XG5cdFx0XHRhbmltYXRlZDoge1xuXHRcdFx0XHR1cmw6IEZpbGVBY2Nlc3MuYXNCcm93c2VyVXJpKGAke3Jvb3R9LyR7bmFtZX0uc3ByaXRlc2hlZXQucG5nYCkudG9TdHJpbmcodHJ1ZSksXG5cdFx0XHRcdGZyYW1lV2lkdGg6IENIQVRfUEVUX1NPVVJDRV9TSVpFLFxuXHRcdFx0XHRmcmFtZUR1cmF0aW9uczogUkVTUEFXTl9GUkFNRV9EVVJBVElPTlMsXG5cdFx0XHRcdGl0ZXJhdGlvbnM6IDEsXG5cdFx0XHR9LFxuXHRcdFx0cmVkdWNlZE1vdGlvbjoge1xuXHRcdFx0XHR1cmw6IEZpbGVBY2Nlc3MuYXNCcm93c2VyVXJpKGAke3Jvb3R9LyR7bmFtZX0ucG5nYCkudG9TdHJpbmcodHJ1ZSksXG5cdFx0XHRcdGZyYW1lV2lkdGg6IENIQVRfUEVUX1NPVVJDRV9TSVpFLFxuXHRcdFx0XHRmcmFtZUR1cmF0aW9uczogW10sXG5cdFx0XHRcdGl0ZXJhdGlvbnM6IDEsXG5cdFx0XHR9LFxuXHRcdH07XG5cdFx0cmVzcGF3blNwcml0ZVNvdXJjZXMuc2V0KHZhcmlhbnQsIHNvdXJjZXMpO1xuXHR9XG5cdHJldHVybiBzb3VyY2VzO1xufVxuXG5mdW5jdGlvbiBkb2VzQ2hhdFBldFN0YXRlU3BlYWsoc3RhdGU6IENoYXRQZXRTdGF0ZSB8IHVuZGVmaW5lZCk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gc3RhdGUgPT09ICdyZW5kZXJpbmcnO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNDaGF0UGV0SW1hZ2VTb3VyY2UoaW1hZ2U6IFBpY2s8SFRNTEltYWdlRWxlbWVudCwgJ2dldEF0dHJpYnV0ZSc+LCBzb3VyY2U6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gaW1hZ2UuZ2V0QXR0cmlidXRlKCdzcmMnKSA9PT0gc291cmNlO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0Q2hhdFBldEJhc2VTdGF0ZShoYXNBY3RpdmVSZXF1ZXN0OiBib29sZWFuLCBuZWVkc0lucHV0OiBib29sZWFuLCBjb25maXJtYXRpb25BdHRlbnRpb25FeHBpcmVkOiBib29sZWFuLCBoYXNJbnB1dDogYm9vbGVhbiwgaWRsZUV4cGlyZWQ6IGJvb2xlYW4pOiBDaGF0UGV0U3RhdGUge1xuXHRpZiAobmVlZHNJbnB1dCkge1xuXHRcdHJldHVybiBjb25maXJtYXRpb25BdHRlbnRpb25FeHBpcmVkID8gJ2lkbGUnIDogJ2NsYXBwaW5nJztcblx0fVxuXHRpZiAoaGFzQWN0aXZlUmVxdWVzdCkge1xuXHRcdHJldHVybiAncmVuZGVyaW5nJztcblx0fVxuXHRpZiAoaWRsZUV4cGlyZWQpIHtcblx0XHRyZXR1cm4gJ3NsZWVwJztcblx0fVxuXHRpZiAoaGFzSW5wdXQpIHtcblx0XHRyZXR1cm4gJ3R5cGluZyc7XG5cdH1cblx0cmV0dXJuICdpZGxlJztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzQ2hhdFBldFZpc2libGUoZW5hYmxlZDogYm9vbGVhbiwgaXNMYXRlc3RGb2N1c2VkV2lkZ2V0OiBib29sZWFuKTogYm9vbGVhbiB7XG5cdHJldHVybiBlbmFibGVkICYmIGlzTGF0ZXN0Rm9jdXNlZFdpZGdldDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzQ2hhdFBldEtleWJvYXJkSW50ZXJhY3Rpb25FbmFibGVkKGVuYWJsZWQ6IGJvb2xlYW4sIGlzRGVhZDogYm9vbGVhbiwgaGFzUG9pbnRlckludGVyYWN0aW9uOiBib29sZWFuLCBpc0FpcmJvcm5lOiBib29sZWFuLCBvblRoZVJ1bjogYm9vbGVhbik6IGJvb2xlYW4ge1xuXHRyZXR1cm4gZW5hYmxlZCAmJiAhaXNEZWFkICYmICFoYXNQb2ludGVySW50ZXJhY3Rpb24gJiYgIWlzQWlyYm9ybmUgJiYgIW9uVGhlUnVuO1xufVxuXG5mdW5jdGlvbiBpc0NoYXRQZXRZYXBTdGF0ZShzdGF0ZTogQ2hhdFBldFN0YXRlIHwgdW5kZWZpbmVkKTogYm9vbGVhbiB7XG5cdHJldHVybiBzdGF0ZSA9PT0gJ3lhcHBpbmcnIHx8IHN0YXRlID09PSAneWFwcGluZ01vdXRoT3Blbic7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRDaGF0UGV0UmVuZGVyZWRTdGF0ZShiYXNlU3RhdGU6IENoYXRQZXRTdGF0ZSwgdHJhbnNpZW50U3RhdGU6IENoYXRQZXRTdGF0ZSB8IHVuZGVmaW5lZCwgaXNEcmFnZ2luZzogYm9vbGVhbik6IENoYXRQZXRTdGF0ZSB7XG5cdGlmIChpc0RyYWdnaW5nKSB7XG5cdFx0cmV0dXJuICdpZGxlJztcblx0fVxuXHRpZiAoaXNDaGF0UGV0WWFwU3RhdGUodHJhbnNpZW50U3RhdGUpICYmIGJhc2VTdGF0ZSAhPT0gJ2lkbGUnKSB7XG5cdFx0cmV0dXJuIGJhc2VTdGF0ZTtcblx0fVxuXHRyZXR1cm4gdHJhbnNpZW50U3RhdGUgPz8gYmFzZVN0YXRlO1xufVxuXG50eXBlIENoYXRQZXRBbmltYXRpb25GcmFtZSA9IHsgZnJhbWVJbmRleDogbnVtYmVyOyBjb21wbGV0ZTogdHJ1ZSB9IHwgeyBmcmFtZUluZGV4OiBudW1iZXI7IGNvbXBsZXRlOiBmYWxzZTsgbmV4dEZyYW1lRGVsYXk6IG51bWJlciB9O1xuXG5leHBvcnQgZnVuY3Rpb24gZ2V0Q2hhdFBldEFuaW1hdGlvbkZyYW1lKGZyYW1lRHVyYXRpb25zOiByZWFkb25seSBudW1iZXJbXSwgZWxhcHNlZDogbnVtYmVyLCBpdGVyYXRpb25zOiBudW1iZXIsIHJldmVyc2UgPSBmYWxzZSk6IENoYXRQZXRBbmltYXRpb25GcmFtZSB7XG5cdGlmIChmcmFtZUR1cmF0aW9ucy5sZW5ndGggPT09IDApIHtcblx0XHRyZXR1cm4geyBmcmFtZUluZGV4OiAwLCBjb21wbGV0ZTogdHJ1ZSB9O1xuXHR9XG5cblx0Y29uc3QgdG90YWxEdXJhdGlvbiA9IGZyYW1lRHVyYXRpb25zLnJlZHVjZSgodG90YWwsIGR1cmF0aW9uKSA9PiB0b3RhbCArIGR1cmF0aW9uLCAwKTtcblx0Y29uc3QgbGFzdEZyYW1lSW5kZXggPSBmcmFtZUR1cmF0aW9ucy5sZW5ndGggLSAxO1xuXHRpZiAoZWxhcHNlZCA+PSB0b3RhbER1cmF0aW9uICogaXRlcmF0aW9ucykge1xuXHRcdHJldHVybiB7IGZyYW1lSW5kZXg6IHJldmVyc2UgPyAwIDogbGFzdEZyYW1lSW5kZXgsIGNvbXBsZXRlOiB0cnVlIH07XG5cdH1cblx0Y29uc3QgaXRlcmF0aW9uRWxhcHNlZCA9IE1hdGgubWF4KDAsIGVsYXBzZWQpICUgdG90YWxEdXJhdGlvbjtcblx0bGV0IGZyYW1lRW5kID0gMDtcblx0Zm9yIChsZXQgYW5pbWF0aW9uRnJhbWVJbmRleCA9IDA7IGFuaW1hdGlvbkZyYW1lSW5kZXggPCBmcmFtZUR1cmF0aW9ucy5sZW5ndGg7IGFuaW1hdGlvbkZyYW1lSW5kZXgrKykge1xuXHRcdGNvbnN0IGZyYW1lSW5kZXggPSByZXZlcnNlID8gbGFzdEZyYW1lSW5kZXggLSBhbmltYXRpb25GcmFtZUluZGV4IDogYW5pbWF0aW9uRnJhbWVJbmRleDtcblx0XHRmcmFtZUVuZCArPSBmcmFtZUR1cmF0aW9uc1tmcmFtZUluZGV4XTtcblx0XHRpZiAoaXRlcmF0aW9uRWxhcHNlZCA8IGZyYW1lRW5kKSB7XG5cdFx0XHRyZXR1cm4geyBmcmFtZUluZGV4LCBjb21wbGV0ZTogZmFsc2UsIG5leHRGcmFtZURlbGF5OiBmcmFtZUVuZCAtIGl0ZXJhdGlvbkVsYXBzZWQgfTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIHsgZnJhbWVJbmRleDogcmV2ZXJzZSA/IDAgOiBsYXN0RnJhbWVJbmRleCwgY29tcGxldGU6IGZhbHNlLCBuZXh0RnJhbWVEZWxheTogdG90YWxEdXJhdGlvbiB9O1xufVxuXG5mdW5jdGlvbiBnZXRUcmFuc2llbnRTdGF0ZUR1cmF0aW9uKHN0YXRlOiBDaGF0UGV0U3RhdGUpOiBudW1iZXIge1xuXHRzd2l0Y2ggKHN0YXRlKSB7XG5cdFx0Y2FzZSAnYnV0dG9uUHJlc3MnOlxuXHRcdFx0cmV0dXJuIEJVVFRPTl9QUkVTU19TVEFURV9EVVJBVElPTjtcblx0XHRjYXNlICdjb21wbGV0ZSc6XG5cdFx0XHRyZXR1cm4gQ09NUExFVEVfU1RBVEVfRFVSQVRJT047XG5cdFx0Y2FzZSAnc3BsYXQnOlxuXHRcdFx0cmV0dXJuIFNQTEFUX1NUQVRFX0RVUkFUSU9OO1xuXHRcdGNhc2UgJ2xvdmUnOlxuXHRcdFx0cmV0dXJuIExPVkVfU1RBVEVfRFVSQVRJT047XG5cdFx0Y2FzZSAnY29vbCc6XG5cdFx0XHRyZXR1cm4gQ09PTF9TVEFURV9EVVJBVElPTjtcblx0XHRjYXNlICdzaW5nJzpcblx0XHRcdHJldHVybiBTSU5HX1NUQVRFX0RVUkFUSU9OO1xuXHRcdGNhc2UgJ3NwZWVjaGxlc3MnOlxuXHRcdFx0cmV0dXJuIFNQRUVDSExFU1NfU1RBVEVfRFVSQVRJT047XG5cdFx0Y2FzZSAnd29ycnknOlxuXHRcdFx0cmV0dXJuIFdPUlJZX1NUQVRFX0RVUkFUSU9OO1xuXHRcdGNhc2UgJ2Rpenp5Jzpcblx0XHRcdHJldHVybiBESVpaWV9TVEFURV9EVVJBVElPTjtcblx0XHRjYXNlICd3YWtpbmcnOlxuXHRcdFx0cmV0dXJuIFdBS0VfU1RBVEVfRFVSQVRJT047XG5cdFx0ZGVmYXVsdDpcblx0XHRcdHJldHVybiBUUkFOU0lFTlRfU1RBVEVfRFVSQVRJT047XG5cdH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldENoYXRQZXRDbGlja0ludGVyYWN0aW9uKHJhbmRvbTogbnVtYmVyLCBwcmV2aW91c0ludGVyYWN0aW9uPzogQ2hhdFBldENsaWNrSW50ZXJhY3Rpb24pOiBDaGF0UGV0Q2xpY2tJbnRlcmFjdGlvbiB7XG5cdGlmIChyYW5kb20gPCBDSEFUX1BFVF9JQ09OX1RSQU5TRk9STUFUSU9OX0NIQU5DRSkge1xuXHRcdHJldHVybiAnY29tcGxldGUnO1xuXHR9XG5cdGNvbnN0IHlhcHBpbmdUaHJlc2hvbGQgPSBDSEFUX1BFVF9JQ09OX1RSQU5TRk9STUFUSU9OX0NIQU5DRSArIENIQVRfUEVUX1lBUFBJTkdfQ0hBTkNFO1xuXHRpZiAocmFuZG9tIDwgeWFwcGluZ1RocmVzaG9sZCkge1xuXHRcdHJldHVybiAneWFwcGluZyc7XG5cdH1cblxuXHRjb25zdCBpbnRlcmFjdGlvbnM6IHJlYWRvbmx5IENoYXRQZXRDbGlja0ludGVyYWN0aW9uW10gPSBbJ2J1dHRvblByZXNzJywgJ2xvdmUnLCAnY29vbCcsICdzaW5nJywgJ3NwZWVjaGxlc3MnLCAnd29ycnknXTtcblx0Y29uc3QgYXZhaWxhYmxlSW50ZXJhY3Rpb25zID0gaW50ZXJhY3Rpb25zLmZpbHRlcihpbnRlcmFjdGlvbiA9PiBpbnRlcmFjdGlvbiAhPT0gcHJldmlvdXNJbnRlcmFjdGlvbik7XG5cdGNvbnN0IG5vcm1hbGl6ZWRSYW5kb20gPSAocmFuZG9tIC0geWFwcGluZ1RocmVzaG9sZCkgLyAoMSAtIHlhcHBpbmdUaHJlc2hvbGQpO1xuXHRyZXR1cm4gYXZhaWxhYmxlSW50ZXJhY3Rpb25zW01hdGgubWluKE1hdGguZmxvb3Iobm9ybWFsaXplZFJhbmRvbSAqIGF2YWlsYWJsZUludGVyYWN0aW9ucy5sZW5ndGgpLCBhdmFpbGFibGVJbnRlcmFjdGlvbnMubGVuZ3RoIC0gMSldO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0Q2hhdFBldEdhemVEaXJlY3Rpb24oY3Vyc29yWDogbnVtYmVyLCBjdXJzb3JZOiBudW1iZXIsIHBldENlbnRlclg6IG51bWJlciwgcGV0Q2VudGVyWTogbnVtYmVyKTogcmVhZG9ubHkgW251bWJlciwgbnVtYmVyXSB7XG5cdGNvbnN0IGRlbHRhWCA9IGN1cnNvclggLSBwZXRDZW50ZXJYO1xuXHRjb25zdCBkZWx0YVkgPSBjdXJzb3JZIC0gcGV0Q2VudGVyWTtcblx0Y29uc3QgZGlzdGFuY2UgPSBNYXRoLmh5cG90KGRlbHRhWCwgZGVsdGFZKTtcblx0aWYgKGRpc3RhbmNlID09PSAwKSB7XG5cdFx0cmV0dXJuIFswLCAwXTtcblx0fVxuXG5cdHJldHVybiBbXG5cdFx0TWF0aC5yb3VuZChkZWx0YVggLyBkaXN0YW5jZSksXG5cdFx0TWF0aC5yb3VuZChkZWx0YVkgLyBkaXN0YW5jZSksXG5cdF07XG59XG5cbnR5cGUgQ2hhdFBldEZhY2luZ0RpcmVjdGlvbiA9ICdsZWZ0JyB8ICdyaWdodCc7XG5cbmV4cG9ydCBjbGFzcyBDaGF0UGV0RmFjaW5nQ29udHJvbGxlciB7XG5cblx0cHJpdmF0ZSBfZGlyZWN0aW9uOiBDaGF0UGV0RmFjaW5nRGlyZWN0aW9uID0gJ3JpZ2h0Jztcblx0cHJpdmF0ZSBfdHJhY2tzQ3Vyc29yID0gZmFsc2U7XG5cblx0Z2V0IGRpcmVjdGlvbigpOiBDaGF0UGV0RmFjaW5nRGlyZWN0aW9uIHtcblx0XHRyZXR1cm4gdGhpcy5fZGlyZWN0aW9uO1xuXHR9XG5cblx0c2V0RGlyZWN0aW9uKGRpcmVjdGlvbjogQ2hhdFBldEZhY2luZ0RpcmVjdGlvbik6IHZvaWQge1xuXHRcdHRoaXMuX2RpcmVjdGlvbiA9IGRpcmVjdGlvbjtcblx0fVxuXG5cdHNldFN0YXRlKHN0YXRlOiBDaGF0UGV0U3RhdGUsIGlzRHJhZ2dpbmc6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLl90cmFja3NDdXJzb3IgPSBzdGF0ZSA9PT0gJ2lkbGUnICYmICFpc0RyYWdnaW5nO1xuXHR9XG5cblx0c25hcFRvQ3Vyc29yKGN1cnNvclg6IG51bWJlciwgcGV0Q2VudGVyWDogbnVtYmVyKTogQ2hhdFBldEZhY2luZ0RpcmVjdGlvbiB7XG5cdFx0aWYgKGN1cnNvclggPCBwZXRDZW50ZXJYKSB7XG5cdFx0XHR0aGlzLnNldERpcmVjdGlvbignbGVmdCcpO1xuXHRcdH0gZWxzZSBpZiAoY3Vyc29yWCA+IHBldENlbnRlclgpIHtcblx0XHRcdHRoaXMuc2V0RGlyZWN0aW9uKCdyaWdodCcpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fZGlyZWN0aW9uO1xuXHR9XG5cblx0dXBkYXRlKGN1cnNvclg6IG51bWJlciwgcGV0Q2VudGVyWDogbnVtYmVyKTogQ2hhdFBldEZhY2luZ0RpcmVjdGlvbiB7XG5cdFx0aWYgKHRoaXMuX3RyYWNrc0N1cnNvcikge1xuXHRcdFx0cmV0dXJuIHRoaXMuc25hcFRvQ3Vyc29yKGN1cnNvclgsIHBldENlbnRlclgpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fZGlyZWN0aW9uO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBDaGF0UGV0RGlyZWN0aW9uQ2hhbmdlQ29udHJvbGxlciB7XG5cblx0cHJpdmF0ZSBfbGFzdERpcmVjdGlvbjogQ2hhdFBldEZhY2luZ0RpcmVjdGlvbiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfbGFzdERpcmVjdGlvbkNoYW5nZVRpbWU6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfZGlyZWN0aW9uQ2hhbmdlQ291bnQgPSAwO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZGlyZWN0aW9uQ2hhbmdlQ291bnQgPSBESVpaWV9ESVJFQ1RJT05fQ0hBTkdFX0NPVU5ULFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgbWF4RGlyZWN0aW9uQ2hhbmdlSW50ZXJ2YWwgPSBESVpaWV9ESVJFQ1RJT05fQ0hBTkdFX01BWF9JTlRFUlZBTCxcblx0KSB7IH1cblxuXHRyZWNvcmQoZGlyZWN0aW9uOiBDaGF0UGV0RmFjaW5nRGlyZWN0aW9uLCB0aW1lc3RhbXA6IG51bWJlcik6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLl9sYXN0RGlyZWN0aW9uID09PSBkaXJlY3Rpb24pIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX2xhc3REaXJlY3Rpb24gPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy5fbGFzdERpcmVjdGlvbiA9IGRpcmVjdGlvbjtcblx0XHRcdHRoaXMuX2xhc3REaXJlY3Rpb25DaGFuZ2VUaW1lID0gdGltZXN0YW1wO1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fbGFzdERpcmVjdGlvbkNoYW5nZVRpbWUgIT09IHVuZGVmaW5lZCAmJiB0aW1lc3RhbXAgLSB0aGlzLl9sYXN0RGlyZWN0aW9uQ2hhbmdlVGltZSA+IHRoaXMubWF4RGlyZWN0aW9uQ2hhbmdlSW50ZXJ2YWwpIHtcblx0XHRcdHRoaXMuX2RpcmVjdGlvbkNoYW5nZUNvdW50ID0gMDtcblx0XHR9XG5cblx0XHR0aGlzLl9sYXN0RGlyZWN0aW9uID0gZGlyZWN0aW9uO1xuXHRcdHRoaXMuX2xhc3REaXJlY3Rpb25DaGFuZ2VUaW1lID0gdGltZXN0YW1wO1xuXHRcdHRoaXMuX2RpcmVjdGlvbkNoYW5nZUNvdW50Kys7XG5cdFx0aWYgKHRoaXMuX2RpcmVjdGlvbkNoYW5nZUNvdW50IDwgdGhpcy5kaXJlY3Rpb25DaGFuZ2VDb3VudCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdHRoaXMucmVzZXQoKTtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHJlc2V0KCk6IHZvaWQge1xuXHRcdHRoaXMuX2xhc3REaXJlY3Rpb24gPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fbGFzdERpcmVjdGlvbkNoYW5nZVRpbWUgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fZGlyZWN0aW9uQ2hhbmdlQ291bnQgPSAwO1xuXHR9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRDaGF0UGV0SG9yaXpvbnRhbFBvc2l0aW9uKGxlZnQ6IG51bWJlciwgbWluaW11bUxlZnQ6IG51bWJlciwgbWF4aW11bUxlZnQ6IG51bWJlcik6IG51bWJlciB7XG5cdHJldHVybiBNYXRoLm1heChtaW5pbXVtTGVmdCwgTWF0aC5taW4oTWF0aC5tYXgobWluaW11bUxlZnQsIG1heGltdW1MZWZ0KSwgbGVmdCkpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0Q2hhdFBldERlZmF1bHRIb3Jpem9udGFsUG9zaXRpb24obWluaW11bUxlZnQ6IG51bWJlciwgbWF4aW11bUxlZnQ6IG51bWJlcik6IG51bWJlciB7XG5cdHJldHVybiBNYXRoLm1heChtaW5pbXVtTGVmdCwgbWF4aW11bUxlZnQgLSBDSEFUX1BFVF9ERUZBVUxUX1JJR0hUX0lOU0VUKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldENoYXRQZXRSZXN0b3JlZEhvcml6b250YWxQb3NpdGlvbihwcmV2aW91c0xlZnQ6IG51bWJlciB8IHVuZGVmaW5lZCwgbWluaW11bUxlZnQ6IG51bWJlciwgbWF4aW11bUxlZnQ6IG51bWJlcik6IG51bWJlciB7XG5cdHJldHVybiBwcmV2aW91c0xlZnQgPT09IHVuZGVmaW5lZFxuXHRcdD8gZ2V0Q2hhdFBldERlZmF1bHRIb3Jpem9udGFsUG9zaXRpb24obWluaW11bUxlZnQsIG1heGltdW1MZWZ0KVxuXHRcdDogZ2V0Q2hhdFBldEhvcml6b250YWxQb3NpdGlvbihwcmV2aW91c0xlZnQsIG1pbmltdW1MZWZ0LCBtYXhpbXVtTGVmdCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRDaGF0UGV0U2NhbGUoc2NhbGU6IG51bWJlciwgZGVsdGE6IG51bWJlcik6IG51bWJlciB7XG5cdHJldHVybiBNYXRoLm1heChDSEFUX1BFVF9NSU5fU0NBTEUsIE1hdGgucm91bmQoKHNjYWxlICsgZGVsdGEpICogMTApIC8gMTApO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0Q2hhdFBldERyYWdQb3NpdGlvbihsZWZ0OiBudW1iZXIsIHRvcDogbnVtYmVyLCBtaW5pbXVtTGVmdDogbnVtYmVyLCBtYXhpbXVtTGVmdDogbnVtYmVyLCBtaW5pbXVtVG9wOiBudW1iZXIsIG1heGltdW1Ub3A6IG51bWJlcik6IHJlYWRvbmx5IFtudW1iZXIsIG51bWJlcl0ge1xuXHRyZXR1cm4gW1xuXHRcdGdldENoYXRQZXRIb3Jpem9udGFsUG9zaXRpb24obGVmdCwgbWluaW11bUxlZnQsIG1heGltdW1MZWZ0KSxcblx0XHRNYXRoLm1heChtaW5pbXVtVG9wLCBNYXRoLm1pbihNYXRoLm1heChtaW5pbXVtVG9wLCBtYXhpbXVtVG9wKSwgdG9wKSksXG5cdF07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRDaGF0UGV0VGhyb3dWZWxvY2l0eShzYW1wbGVzOiByZWFkb25seSBDaGF0UGV0UG9pbnRlclNhbXBsZVtdLCByZWxlYXNlVGltZTogbnVtYmVyKTogQ2hhdFBldFRocm93VmVsb2NpdHkgfCB1bmRlZmluZWQge1xuXHRpZiAoc2FtcGxlcy5sZW5ndGggPCAyKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGNvbnN0IGxhdGVzdCA9IHNhbXBsZXNbc2FtcGxlcy5sZW5ndGggLSAxXTtcblx0aWYgKHJlbGVhc2VUaW1lIC0gbGF0ZXN0LnRpbWUgPiBUSFJPV19SRUxFQVNFX0dSQUNFX0RVUkFUSU9OKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGxldCBmaXJzdCA9IGxhdGVzdDtcblx0Zm9yIChsZXQgaW5kZXggPSBzYW1wbGVzLmxlbmd0aCAtIDI7IGluZGV4ID49IDA7IGluZGV4LS0pIHtcblx0XHRjb25zdCBzYW1wbGUgPSBzYW1wbGVzW2luZGV4XTtcblx0XHRpZiAobGF0ZXN0LnRpbWUgLSBzYW1wbGUudGltZSA+IFRIUk9XX1ZFTE9DSVRZX1NBTVBMRV9EVVJBVElPTikge1xuXHRcdFx0YnJlYWs7XG5cdFx0fVxuXHRcdGZpcnN0ID0gc2FtcGxlO1xuXHR9XG5cblx0Y29uc3QgZWxhcHNlZCA9IE1hdGgubWF4KDE2LCBsYXRlc3QudGltZSAtIGZpcnN0LnRpbWUpO1xuXHRjb25zdCB2ZWxvY2l0eVggPSAobGF0ZXN0LnggLSBmaXJzdC54KSAvIGVsYXBzZWQgKiAxXzAwMDtcblx0Y29uc3QgdmVsb2NpdHlZID0gKGxhdGVzdC55IC0gZmlyc3QueSkgLyBlbGFwc2VkICogMV8wMDA7XG5cdGNvbnN0IGhvcml6b250YWxWZWxvY2l0eSA9IE1hdGguYWJzKHZlbG9jaXR5WCk7XG5cdGlmIChob3Jpem9udGFsVmVsb2NpdHkgPCBUSFJPV19NSU5fSE9SSVpPTlRBTF9WRUxPQ0lUWSB8fCBob3Jpem9udGFsVmVsb2NpdHkgPCBNYXRoLmFicyh2ZWxvY2l0eVkpKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGNvbnN0IGZsaWdodFZlbG9jaXR5ID0gTWF0aC5taW4oVEhST1dfTUFYX0hPUklaT05UQUxfVkVMT0NJVFksIE1hdGgubWF4KFRIUk9XX01JTl9GTElHSFRfVkVMT0NJVFksIGhvcml6b250YWxWZWxvY2l0eSkpO1xuXHRyZXR1cm4ge1xuXHRcdHg6IE1hdGguc2lnbih2ZWxvY2l0eVgpICogZmxpZ2h0VmVsb2NpdHksXG5cdFx0eTogTWF0aC5tYXgoLVRIUk9XX01BWF9VUFdBUkRfVkVMT0NJVFksIE1hdGgubWluKHZlbG9jaXR5WSwgLVRIUk9XX01JTl9VUFdBUkRfVkVMT0NJVFkpKSxcblx0fTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGFkdmFuY2VDaGF0UGV0VGhyb3cobW90aW9uOiBDaGF0UGV0VGhyb3dNb3Rpb24sIGVsYXBzZWQ6IG51bWJlciwgYm91bmRzOiBDaGF0UGV0VGhyb3dCb3VuZHMpOiBDaGF0UGV0VGhyb3dTdGVwIHtcblx0Y29uc3QgZHVyYXRpb24gPSBNYXRoLm1heCgwLCBlbGFwc2VkKSAvIDFfMDAwO1xuXHRjb25zdCBwcm9qZWN0ZWRMZWZ0ID0gbW90aW9uLmxlZnQgKyBtb3Rpb24ueCAqIGR1cmF0aW9uO1xuXHRjb25zdCBoYXNIb3Jpem9udGFsUmFuZ2UgPSBib3VuZHMubWF4aW11bUxlZnQgPiBib3VuZHMubWluaW11bUxlZnQ7XG5cdGxldCB3YWxsOiBDaGF0UGV0V2FsbCB8IHVuZGVmaW5lZDtcblx0bGV0IG1vdGlvbkR1cmF0aW9uID0gZHVyYXRpb247XG5cdGxldCBsZWZ0ID0gaGFzSG9yaXpvbnRhbFJhbmdlID8gcHJvamVjdGVkTGVmdCA6IGJvdW5kcy5taW5pbXVtTGVmdDtcblxuXHRpZiAoaGFzSG9yaXpvbnRhbFJhbmdlICYmIHByb2plY3RlZExlZnQgPCBib3VuZHMubWluaW11bUxlZnQpIHtcblx0XHR3YWxsID0gJ2xlZnQnO1xuXHRcdG1vdGlvbkR1cmF0aW9uICo9IChib3VuZHMubWluaW11bUxlZnQgLSBtb3Rpb24ubGVmdCkgLyAocHJvamVjdGVkTGVmdCAtIG1vdGlvbi5sZWZ0KTtcblx0XHRsZWZ0ID0gYm91bmRzLm1pbmltdW1MZWZ0O1xuXHR9IGVsc2UgaWYgKGhhc0hvcml6b250YWxSYW5nZSAmJiBwcm9qZWN0ZWRMZWZ0ID4gYm91bmRzLm1heGltdW1MZWZ0KSB7XG5cdFx0d2FsbCA9ICdyaWdodCc7XG5cdFx0bW90aW9uRHVyYXRpb24gKj0gKGJvdW5kcy5tYXhpbXVtTGVmdCAtIG1vdGlvbi5sZWZ0KSAvIChwcm9qZWN0ZWRMZWZ0IC0gbW90aW9uLmxlZnQpO1xuXHRcdGxlZnQgPSBib3VuZHMubWF4aW11bUxlZnQ7XG5cdH1cblxuXHRsZXQgdG9wID0gbW90aW9uLnRvcCArIG1vdGlvbi55ICogbW90aW9uRHVyYXRpb24gKyBUSFJPV19HUkFWSVRZICogbW90aW9uRHVyYXRpb24gKiBtb3Rpb25EdXJhdGlvbiAvIDI7XG5cdGxldCB2ZWxvY2l0eVkgPSBtb3Rpb24ueSArIFRIUk9XX0dSQVZJVFkgKiBtb3Rpb25EdXJhdGlvbjtcblx0aWYgKHRvcCA8IGJvdW5kcy5taW5pbXVtVG9wKSB7XG5cdFx0dG9wID0gYm91bmRzLm1pbmltdW1Ub3A7XG5cdFx0dmVsb2NpdHlZID0gTWF0aC5hYnModmVsb2NpdHlZKSAqIFRIUk9XX0NFSUxJTkdfUkVTVElUVVRJT047XG5cdH1cblxuXHRyZXR1cm4ge1xuXHRcdGxlZnQsXG5cdFx0dG9wLFxuXHRcdHg6IGhhc0hvcml6b250YWxSYW5nZSA/IG1vdGlvbi54IDogMCxcblx0XHR5OiB2ZWxvY2l0eVksXG5cdFx0d2FsbCxcblx0fTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHNob3VsZFNldHRsZUNoYXRQZXRUaHJvdyhzdGFydFRpbWU6IG51bWJlciwgY3VycmVudFRpbWU6IG51bWJlciwgdG9wOiBudW1iZXIsIHZlcnRpY2FsVmVsb2NpdHk6IG51bWJlciwgZmxvb3JUb3A6IG51bWJlcik6IGJvb2xlYW4ge1xuXHRyZXR1cm4gY3VycmVudFRpbWUgLSBzdGFydFRpbWUgPj0gVEhST1dfTUFYX0RVUkFUSU9OIHx8ICh0b3AgPiBmbG9vclRvcCAmJiB2ZXJ0aWNhbFZlbG9jaXR5ID49IDApO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0Q2hhdFBldEZhbGxUYXJnZXQocGV0TGVmdDogbnVtYmVyLCBwZXRUb3A6IG51bWJlciwgcGV0V2lkdGg6IG51bWJlciwgcGV0SGVpZ2h0OiBudW1iZXIsIHBsYXRmb3JtTGVmdDogbnVtYmVyLCBwbGF0Zm9ybVJpZ2h0OiBudW1iZXIsIHBsYXRmb3JtVG9wOiBudW1iZXIsIGZsb29yQm90dG9tOiBudW1iZXIpOiB7IHJlYWRvbmx5IHRvcDogbnVtYmVyOyByZWFkb25seSBsYW5kc09uUGxhdGZvcm06IGJvb2xlYW4gfSB7XG5cdGNvbnN0IHBldENlbnRlciA9IHBldExlZnQgKyBwZXRXaWR0aCAvIDI7XG5cdGNvbnN0IGxhbmRzT25QbGF0Zm9ybSA9IHBldENlbnRlciA+PSBwbGF0Zm9ybUxlZnQgJiYgcGV0Q2VudGVyIDw9IHBsYXRmb3JtUmlnaHQgJiYgcGV0VG9wICsgcGV0SGVpZ2h0IDw9IHBsYXRmb3JtVG9wO1xuXHRyZXR1cm4ge1xuXHRcdHRvcDogbGFuZHNPblBsYXRmb3JtID8gcGxhdGZvcm1Ub3AgLSBwZXRIZWlnaHQgOiBmbG9vckJvdHRvbSAtIHBldEhlaWdodCxcblx0XHRsYW5kc09uUGxhdGZvcm0sXG5cdH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRDaGF0UGV0VGhyb3dMYW5kaW5nKHByZXZpb3VzTGVmdDogbnVtYmVyLCBwcmV2aW91c1RvcDogbnVtYmVyLCBsZWZ0OiBudW1iZXIsIHRvcDogbnVtYmVyLCBwZXRXaWR0aDogbnVtYmVyLCBwZXRIZWlnaHQ6IG51bWJlciwgcGxhdGZvcm1MZWZ0OiBudW1iZXIsIHBsYXRmb3JtUmlnaHQ6IG51bWJlciwgcGxhdGZvcm1Ub3A6IG51bWJlciwgZmxvb3JUb3A6IG51bWJlcik6IHsgcmVhZG9ubHkgbGVmdDogbnVtYmVyOyByZWFkb25seSB0b3A6IG51bWJlcjsgcmVhZG9ubHkgbGFuZHNPblBsYXRmb3JtOiBib29sZWFuIH0gfCB1bmRlZmluZWQge1xuXHRpZiAodG9wIDw9IHByZXZpb3VzVG9wKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGNvbnN0IGdldExlZnRBdFRvcCA9ICh0YXJnZXRUb3A6IG51bWJlcikgPT4gcHJldmlvdXNMZWZ0ICsgKGxlZnQgLSBwcmV2aW91c0xlZnQpICogKHRhcmdldFRvcCAtIHByZXZpb3VzVG9wKSAvICh0b3AgLSBwcmV2aW91c1RvcCk7XG5cdGNvbnN0IHBsYXRmb3JtTGFuZGluZ1RvcCA9IHBsYXRmb3JtVG9wIC0gcGV0SGVpZ2h0O1xuXHRpZiAocHJldmlvdXNUb3AgPD0gcGxhdGZvcm1MYW5kaW5nVG9wICYmIHRvcCA+PSBwbGF0Zm9ybUxhbmRpbmdUb3ApIHtcblx0XHRjb25zdCBsYW5kaW5nTGVmdCA9IGdldExlZnRBdFRvcChwbGF0Zm9ybUxhbmRpbmdUb3ApO1xuXHRcdGNvbnN0IHBldENlbnRlciA9IGxhbmRpbmdMZWZ0ICsgcGV0V2lkdGggLyAyO1xuXHRcdGlmIChwZXRDZW50ZXIgPj0gcGxhdGZvcm1MZWZ0ICYmIHBldENlbnRlciA8PSBwbGF0Zm9ybVJpZ2h0KSB7XG5cdFx0XHRyZXR1cm4geyBsZWZ0OiBsYW5kaW5nTGVmdCwgdG9wOiBwbGF0Zm9ybUxhbmRpbmdUb3AsIGxhbmRzT25QbGF0Zm9ybTogdHJ1ZSB9O1xuXHRcdH1cblx0fVxuXG5cdGlmIChwcmV2aW91c1RvcCA8PSBmbG9vclRvcCAmJiB0b3AgPj0gZmxvb3JUb3ApIHtcblx0XHRyZXR1cm4geyBsZWZ0OiBnZXRMZWZ0QXRUb3AoZmxvb3JUb3ApLCB0b3A6IGZsb29yVG9wLCBsYW5kc09uUGxhdGZvcm06IGZhbHNlIH07XG5cdH1cblx0cmV0dXJuIHVuZGVmaW5lZDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldENoYXRQZXRGYWxsRHVyYXRpb24oZGlzdGFuY2U6IG51bWJlcik6IG51bWJlciB7XG5cdHJldHVybiBNYXRoLm1heCgxODAsIE1hdGgubWluKDcwMCwgTWF0aC5zcXJ0KE1hdGguYWJzKGRpc3RhbmNlKSkgKiAyMCkpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0Q2hhdFBldFZlcnRpY2FsT2Zmc2V0KGhvc3RUb3A6IG51bWJlciwgaW5wdXRUb3A6IG51bWJlcik6IG51bWJlciB7XG5cdHJldHVybiBNYXRoLm1heCgwLCBNYXRoLm1pbihDSEFUX1BFVF9NQVhfVkVSVElDQUxfT0ZGU0VULCBpbnB1dFRvcCAtIGhvc3RUb3ApKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldENoYXRQZXRQbGF0Zm9ybVRvcChob3N0VG9wOiBudW1iZXIsIGlucHV0VG9wOiBudW1iZXIsIHN1YnN0YW50aXZlU3VyZmFjZVRvcD86IG51bWJlcik6IG51bWJlciB7XG5cdGlmIChzdWJzdGFudGl2ZVN1cmZhY2VUb3AgIT09IHVuZGVmaW5lZCAmJiBzdWJzdGFudGl2ZVN1cmZhY2VUb3AgPj0gaG9zdFRvcCAmJiBzdWJzdGFudGl2ZVN1cmZhY2VUb3AgPD0gaW5wdXRUb3ApIHtcblx0XHRyZXR1cm4gc3Vic3RhbnRpdmVTdXJmYWNlVG9wO1xuXHR9XG5cdHJldHVybiBob3N0VG9wICsgZ2V0Q2hhdFBldFZlcnRpY2FsT2Zmc2V0KGhvc3RUb3AsIGlucHV0VG9wKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHNob3VsZFBsYWNlQ2hhdFBldFNwZWVjaEJ1YmJsZUxlZnQoc3RhdGU6IENoYXRQZXRTdGF0ZSB8IHVuZGVmaW5lZCwgYnV0dG9uUmlnaHQ6IG51bWJlciwgaW5wdXRSaWdodDogbnVtYmVyLCBzY2FsZSA9IDEpOiBib29sZWFuIHtcblx0cmV0dXJuIHN0YXRlID09PSAncmVuZGVyaW5nJyAmJiBidXR0b25SaWdodCArIENIQVRfUEVUX1NQRUVDSF9CVUJCTEVfUklHSFRfT1ZFUkhBTkcgKiBzY2FsZSA+IGlucHV0UmlnaHQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRDaGF0UGV0V2lkZVNwcml0ZUhvcml6b250YWxPZmZzZXQoc3RhdGU6IENoYXRQZXRTdGF0ZSB8IHVuZGVmaW5lZCwgZmFjaW5nRGlyZWN0aW9uOiBDaGF0UGV0RmFjaW5nRGlyZWN0aW9uLCBidXR0b25MZWZ0OiBudW1iZXIsIGJ1dHRvblJpZ2h0OiBudW1iZXIsIGlucHV0TGVmdDogbnVtYmVyLCBpbnB1dFJpZ2h0OiBudW1iZXIsIHNjYWxlID0gMSk6IG51bWJlciB7XG5cdGNvbnN0IG92ZXJoYW5nID0gc3RhdGUgPT09ICdzbGVlcCcgfHwgc3RhdGUgPT09ICd3YWtpbmcnXG5cdFx0PyBDSEFUX1BFVF9TTEVFUF9SSUdIVF9PVkVSSEFOR1xuXHRcdDogc3RhdGUgPT09ICd0eXBpbmcnXG5cdFx0XHQ/IENIQVRfUEVUX1RZUElOR19SSUdIVF9PVkVSSEFOR1xuXHRcdFx0OiBzdGF0ZSA9PT0gJ2J1dHRvblByZXNzJ1xuXHRcdFx0XHQ/IENIQVRfUEVUX0JVVFRPTl9QUkVTU19SSUdIVF9PVkVSSEFOR1xuXHRcdFx0XHQ6IHN0YXRlID09PSAnc2luZydcblx0XHRcdFx0XHQ/IENIQVRfUEVUX1NJTkdfUklHSFRfT1ZFUkhBTkdcblx0XHRcdFx0XHQ6IDA7XG5cdGlmIChvdmVyaGFuZyA9PT0gMCkge1xuXHRcdHJldHVybiAwO1xuXHR9XG5cdHJldHVybiBmYWNpbmdEaXJlY3Rpb24gPT09ICdsZWZ0J1xuXHRcdD8gTWF0aC5tYXgoMCwgb3ZlcmhhbmcgLSAoYnV0dG9uTGVmdCAtIGlucHV0TGVmdCkgLyBzY2FsZSlcblx0XHQ6IE1hdGgubWluKDAsIChpbnB1dFJpZ2h0IC0gYnV0dG9uUmlnaHQpIC8gc2NhbGUgLSBvdmVyaGFuZyk7XG59XG5cbmV4cG9ydCBjbGFzcyBDaGF0UGV0SG9wQ29udHJvbGxlciBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3N0ZXBTY2hlZHVsZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgUnVuT25jZVNjaGVkdWxlcigoKSA9PiB0aGlzLl9hcHBseVN0ZXAoKSwgSE9QX0FQRVhfREVMQVkpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfcmVzdFNjaGVkdWxlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBSdW5PbmNlU2NoZWR1bGVyKCgpID0+IHRoaXMuX2JlZ2luSG9wKCksIEhPUF9SRVNUX0RFTEFZKSk7XG5cdHByaXZhdGUgX2RpcmVjdGlvbiA9IDA7XG5cdHByaXZhdGUgX2hlbGRVbnRpbCA9IDA7XG5cdHByaXZhdGUgX2FjdGl2ZSA9IGZhbHNlO1xuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgcmVhZG9ubHkgY2FsbGJhY2tzOiB7XG5cdFx0cmVhZG9ubHkgb25EaXJlY3Rpb25DaGFuZ2U6IChkaXJlY3Rpb246IG51bWJlcikgPT4gdm9pZDtcblx0XHRyZWFkb25seSBvbk1vdmU6IChkZWx0YTogbnVtYmVyKSA9PiB2b2lkO1xuXHRcdHJlYWRvbmx5IG9uU3RhcnQ6ICgpID0+IHZvaWQ7XG5cdFx0cmVhZG9ubHkgb25SZWR1Y2VkTW90aW9uU3RhcnQ6ICgpID0+IHZvaWQ7XG5cdFx0cmVhZG9ubHkgb25SZXF1ZXN0OiAoKSA9PiB2b2lkO1xuXHR9KSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdHJlcXVlc3QoZGlyZWN0aW9uOiBudW1iZXIsIG1vdGlvblJlZHVjZWQ6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLl9kaXJlY3Rpb24gPSBkaXJlY3Rpb247XG5cdFx0dGhpcy5jYWxsYmFja3Mub25EaXJlY3Rpb25DaGFuZ2UoZGlyZWN0aW9uKTtcblx0XHR0aGlzLmNhbGxiYWNrcy5vblJlcXVlc3QoKTtcblx0XHRpZiAobW90aW9uUmVkdWNlZCkge1xuXHRcdFx0dGhpcy5jYW5jZWwoKTtcblx0XHRcdHRoaXMuY2FsbGJhY2tzLm9uTW92ZShkaXJlY3Rpb24gKiBIT1BfRElTVEFOQ0UpO1xuXHRcdFx0dGhpcy5jYWxsYmFja3Mub25SZWR1Y2VkTW90aW9uU3RhcnQoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5faGVsZFVudGlsID0gRGF0ZS5ub3coKSArIEhPUF9IT0xEX0dSQUNFO1xuXHRcdGlmICghdGhpcy5fYWN0aXZlKSB7XG5cdFx0XHR0aGlzLl9iZWdpbkhvcCgpO1xuXHRcdH1cblx0fVxuXG5cdGNhbmNlbCgpOiB2b2lkIHtcblx0XHR0aGlzLl9hY3RpdmUgPSBmYWxzZTtcblx0XHR0aGlzLl9kaXJlY3Rpb24gPSAwO1xuXHRcdHRoaXMuX2hlbGRVbnRpbCA9IDA7XG5cdFx0dGhpcy5fc3RlcFNjaGVkdWxlci5jYW5jZWwoKTtcblx0XHR0aGlzLl9yZXN0U2NoZWR1bGVyLmNhbmNlbCgpO1xuXHR9XG5cblx0b25BbmltYXRpb25Db21wbGV0ZSgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2FjdGl2ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoRGF0ZS5ub3coKSA8IHRoaXMuX2hlbGRVbnRpbCkge1xuXHRcdFx0dGhpcy5fcmVzdFNjaGVkdWxlci5zY2hlZHVsZSgpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9hY3RpdmUgPSBmYWxzZTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9iZWdpbkhvcCgpOiB2b2lkIHtcblx0XHR0aGlzLl9hY3RpdmUgPSB0cnVlO1xuXHRcdHRoaXMuY2FsbGJhY2tzLm9uU3RhcnQoKTtcblx0XHR0aGlzLl9zdGVwU2NoZWR1bGVyLnNjaGVkdWxlKCk7XG5cdH1cblxuXHRwcml2YXRlIF9hcHBseVN0ZXAoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9hY3RpdmUgfHwgdGhpcy5fZGlyZWN0aW9uID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuY2FsbGJhY2tzLm9uTW92ZSh0aGlzLl9kaXJlY3Rpb24gKiBIT1BfRElTVEFOQ0UpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBDaGF0UGV0V2lkZ2V0IGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb3ZlcmxheTogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2J1dHRvbjogQnV0dG9uO1xuXHRwcml2YXRlIHJlYWRvbmx5IF92aXN1YWw6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9yZXNwYXduRWZmZWN0OiBDaGF0UGV0U3ByaXRlRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfc3ByaXRlczogcmVhZG9ubHkgQ2hhdFBldFNwcml0ZUVsZW1lbnRbXTtcblx0cHJpdmF0ZSByZWFkb25seSBfc3BlZWNoQnViYmxlOiBDaGF0UGV0U3ByaXRlRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfZXllczogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3B1cGlsczogSFRNTEVsZW1lbnRbXSA9IFtdO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9mYWNpbmdDb250cm9sbGVyID0gbmV3IENoYXRQZXRGYWNpbmdDb250cm9sbGVyKCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2RpcmVjdGlvbkNoYW5nZUNvbnRyb2xsZXIgPSBuZXcgQ2hhdFBldERpcmVjdGlvbkNoYW5nZUNvbnRyb2xsZXIoKTtcblx0cHJpdmF0ZSByZWFkb25seSBfZ2F6ZVNjaGVkdWxlcjogZG9tLkFuaW1hdGlvbkZyYW1lU2NoZWR1bGVyO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kcmFnTW9uaXRvciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBHbG9iYWxQb2ludGVyTW92ZU1vbml0b3IoKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2lkbGVFeHBpcmVkID0gb2JzZXJ2YWJsZVZhbHVlKHRoaXMsIGZhbHNlKTtcblx0cHJpdmF0ZSByZWFkb25seSBfY29uZmlybWF0aW9uQXR0ZW50aW9uRXhwaXJlZCA9IG9ic2VydmFibGVWYWx1ZSh0aGlzLCBmYWxzZSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3RyYW5zaWVudFN0YXRlID0gb2JzZXJ2YWJsZVZhbHVlPENoYXRQZXRTdGF0ZSB8IHVuZGVmaW5lZD4odGhpcywgdW5kZWZpbmVkKTtcblx0cHJpdmF0ZSByZWFkb25seSBfaXNEcmFnZ2luZyA9IG9ic2VydmFibGVWYWx1ZSh0aGlzLCBmYWxzZSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2lzRGVhZCA9IG9ic2VydmFibGVWYWx1ZSh0aGlzLCBmYWxzZSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2lkbGVTY2hlZHVsZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgUnVuT25jZVNjaGVkdWxlcigoKSA9PiB0aGlzLl9pZGxlRXhwaXJlZC5zZXQodHJ1ZSwgdW5kZWZpbmVkKSwgQ0hBVF9QRVRfSURMRV9TTEVFUF9ERUxBWSkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jb25maXJtYXRpb25BdHRlbnRpb25TY2hlZHVsZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgUnVuT25jZVNjaGVkdWxlcigoKSA9PiB0aGlzLl9jb25maXJtYXRpb25BdHRlbnRpb25FeHBpcmVkLnNldCh0cnVlLCB1bmRlZmluZWQpLCBDSEFUX1BFVF9DT05GSVJNQVRJT05fQVRURU5USU9OX0RVUkFUSU9OKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3RyYW5zaWVudFNjaGVkdWxlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBSdW5PbmNlU2NoZWR1bGVyKCgpID0+IHRoaXMuX3RyYW5zaWVudFN0YXRlLnNldCh1bmRlZmluZWQsIHVuZGVmaW5lZCksIFRSQU5TSUVOVF9TVEFURV9EVVJBVElPTikpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zZWFyY2hTY2hlZHVsZXI6IFJ1bk9uY2VTY2hlZHVsZXI7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NsaWNrU3VwcHJlc3Npb25TY2hlZHVsZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgUnVuT25jZVNjaGVkdWxlcigoKSA9PiB0aGlzLl9zdXBwcmVzc05leHRQb2ludGVyQ2xpY2sgPSBmYWxzZSwgMCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zcHJpdGVBbmltYXRpb24gPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3NwZWVjaEFuaW1hdGlvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfcmVzcGF3bkFuaW1hdGlvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfdGhyb3dBbmltYXRpb24gPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Jlc3Bhd25FZmZlY3RTY2hlZHVsZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgUnVuT25jZVNjaGVkdWxlcigoKSA9PiB0aGlzLl9zaG93UmVzcGF3bkVmZmVjdCgpLCBSRVNQQVdOX0VGRkVDVF9EVVJBVElPTikpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9yZXNwYXduRmFsbFNjaGVkdWxlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBSdW5PbmNlU2NoZWR1bGVyKCgpID0+IHRoaXMuX2JlZ2luUmVzcGF3bkZhbGwoKSwgUkVTUEFXTl9FRkZFQ1RfRFVSQVRJT04pKTtcblx0cHJpdmF0ZSByZWFkb25seSBfaG9wQ29udHJvbGxlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBDaGF0UGV0SG9wQ29udHJvbGxlcih7XG5cdFx0b25EaXJlY3Rpb25DaGFuZ2U6IGRpcmVjdGlvbiA9PiB0aGlzLl9idXR0b24uZWxlbWVudC5kYXRhc2V0LmhvcERpcmVjdGlvbiA9IGRpcmVjdGlvbiA8IDAgPyAnbGVmdCcgOiAncmlnaHQnLFxuXHRcdG9uTW92ZTogZGVsdGEgPT4gdGhpcy5fc2V0SG9yaXpvbnRhbFBvc2l0aW9uKHRoaXMuX2dldEN1cnJlbnRMZWZ0KCkgKyBkZWx0YSksXG5cdFx0b25TdGFydDogKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX3RyYW5zaWVudFN0YXRlLmdldCgpID09PSAnanVtcCcpIHtcblx0XHRcdFx0dGhpcy5fcmVuZGVyU3RhdGUoJ2p1bXAnLCB0cnVlKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX3RyYW5zaWVudFN0YXRlLnNldCgnanVtcCcsIHVuZGVmaW5lZCk7XG5cdFx0XHR9XG5cdFx0fSxcblx0XHRvblJlZHVjZWRNb3Rpb25TdGFydDogKCkgPT4gdGhpcy5fdHJhbnNpZW50U3RhdGUuc2V0KCdqdW1wJywgdW5kZWZpbmVkKSxcblx0XHRvblJlcXVlc3Q6ICgpID0+IHRoaXMuX3RyYW5zaWVudFNjaGVkdWxlci5zY2hlZHVsZShIT1BfSURMRV9ERUJPVU5DRSksXG5cdH0pKTtcblx0cHJpdmF0ZSByZWFkb25seSBfY29udGV4dE1lbnVBY3Rpb25zID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPERpc3Bvc2FibGVTdG9yZT4oKSk7XG5cdHByaXZhdGUgX2N1cnNvclBvc2l0aW9uOiByZWFkb25seSBbbnVtYmVyLCBudW1iZXJdIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9hY3RpdmVTcHJpdGU6IENoYXRQZXRTcHJpdGVFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9wZW5kaW5nU3ByaXRlOiBDaGF0UGV0U3ByaXRlRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfcGVuZGluZ1NvdXJjZTogQ2hhdFBldFNwcml0ZVNvdXJjZSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfcGVuZGluZ1N0YXRlOiBDaGF0UGV0U3RhdGUgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3JlbmRlcmVkU3RhdGU6IENoYXRQZXRTdGF0ZSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfbW90aW9uUmVkdWNlZCA9IGZhbHNlO1xuXHRwcml2YXRlIF9lbmFibGVkID0gZmFsc2U7XG5cdHByaXZhdGUgX2J1c3kgPSBmYWxzZTtcblx0cHJpdmF0ZSBfZW5hYmxlbWVudEluaXRpYWxpemVkID0gZmFsc2U7XG5cdHByaXZhdGUgX2hhc0N1c3RvbVBvc2l0aW9uID0gZmFsc2U7XG5cdHByaXZhdGUgX3N1cHByZXNzTmV4dFBvaW50ZXJDbGljayA9IGZhbHNlO1xuXHRwcml2YXRlIF9jb250ZXh0TWVudVZpc2libGUgPSBmYWxzZTtcblx0cHJpdmF0ZSBfbGFzdENsaWNrSW50ZXJhY3Rpb246IENoYXRQZXRDbGlja0ludGVyYWN0aW9uIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9mYWxsTGFuZHNPblBsYXRmb3JtID0gZmFsc2U7XG5cdHByaXZhdGUgX3Rocm93V2FsbEltcGFjdDogQ2hhdFBldFdhbGwgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3Rocm93R2VvbWV0cnlEaXJ0eSA9IGZhbHNlO1xuXHRwcml2YXRlIF9kZWF0aFBvc2l0aW9uOiByZWFkb25seSBbbnVtYmVyLCBudW1iZXJdIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9yZXNwYXduUGhhc2U6ICdub25lJyB8ICdkZXNwYXduaW5nJyB8ICdyZXNwYXduaW5nJyB8ICdmYWxsaW5nJyA9ICdub25lJztcblx0cHJpdmF0ZSBfcmVzcGF3blBvc2l0aW9uOiByZWFkb25seSBbbnVtYmVyLCBudW1iZXJdIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9wbGF0Zm9ybVRvcFByb3ZpZGVyOiAoKCkgPT4gbnVtYmVyIHwgdW5kZWZpbmVkKSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBfcmVzaXplT2JzZXJ2ZXI6IGRvbS5EaXNwb3NhYmxlUmVzaXplT2JzZXJ2ZXI7XG5cdHByaXZhdGUgX3ZhcmlhbnQ6IENoYXRQZXRWYXJpYW50O1xuXHRwcml2YXRlIF9zY2FsZSA9IDE7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBwYXJlbnQ6IEhUTUxFbGVtZW50LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZHJhZ0JvdW5kczogSFRNTEVsZW1lbnQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBtb3ZlbWVudEJvdW5kczogSFRNTEVsZW1lbnQsXG5cdFx0bW9kZWw6IElPYnNlcnZhYmxlPElDaGF0TW9kZWwgfCB1bmRlZmluZWQ+LFxuXHRcdGhhc0lucHV0OiBJT2JzZXJ2YWJsZTxib29sZWFuPixcblx0XHRpc0xhdGVzdEZvY3VzZWRXaWRnZXQ6IElPYnNlcnZhYmxlPGJvb2xlYW4+LFxuXHRcdGlucHV0Q2hhbmdlZDogKGxpc3RlbmVyOiAoKSA9PiB2b2lkKSA9PiBJRGlzcG9zYWJsZSxcblx0XHRASUNoYXRQZXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdFBldFNlcnZpY2U6IElDaGF0UGV0U2VydmljZSxcblx0XHRASUFjY2Vzc2liaWxpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgYWNjZXNzaWJpbGl0eVNlcnZpY2U6IElBY2Nlc3NpYmlsaXR5U2VydmljZSxcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX3ZhcmlhbnQgPSB0aGlzLmNoYXRQZXRTZXJ2aWNlLnZhcmlhbnQuZ2V0KCk7XG5cdFx0dGhpcy5fc2VhcmNoU2NoZWR1bGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IFJ1bk9uY2VTY2hlZHVsZXIoKCkgPT4gdGhpcy5fdHJ5U2VhcmNoKCksIFNFQVJDSF9JTlRFUlZBTCkpO1xuXHRcdHRoaXMucGFyZW50LmNsYXNzTGlzdC5hZGQoJ2NoYXQtcGV0LWhvc3QnKTtcblx0XHR0aGlzLl9vdmVybGF5ID0gZG9tLiQoJy5jaGF0LXBldC1vdmVybGF5Jyk7XG5cdFx0dGhpcy5wYXJlbnQucHJlcGVuZCh0aGlzLl9vdmVybGF5KTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4gdGhpcy5fb3ZlcmxheS5yZW1vdmUoKSkpO1xuXHRcdHRoaXMuX2J1dHRvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBCdXR0b24odGhpcy5fb3ZlcmxheSwge1xuXHRcdFx0YXJpYUxhYmVsOiB0aGlzLl9nZXRBcmlhTGFiZWwoZmFsc2UpLFxuXHRcdH0pKTtcblx0XHR0aGlzLl9idXR0b24uZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdjaGF0LXBldC1idXR0b24nKTtcblx0XHR0aGlzLl9idXR0b24uZWxlbWVudC5kYXRhc2V0LmZhY2luZyA9IHRoaXMuX2ZhY2luZ0NvbnRyb2xsZXIuZGlyZWN0aW9uO1xuXHRcdHRoaXMuX3Zpc3VhbCA9IGRvbS5hcHBlbmQodGhpcy5fYnV0dG9uLmVsZW1lbnQsIGRvbS4kKCcuY2hhdC1wZXQtdmlzdWFsJykpO1xuXHRcdGNvbnN0IHJlc3Bhd25FZmZlY3RDYW52YXMgPSBkb20uYXBwZW5kKHRoaXMuX292ZXJsYXksIGRvbS4kKCdjYW52YXMuY2hhdC1wZXQtY2FudmFzLmNoYXQtcGV0LXJlc3Bhd24tZWZmZWN0LmhpZGRlbicpKSBhcyBIVE1MQ2FudmFzRWxlbWVudDtcblx0XHRyZXNwYXduRWZmZWN0Q2FudmFzLndpZHRoID0gQ0hBVF9QRVRfU09VUkNFX1NJWkU7XG5cdFx0cmVzcGF3bkVmZmVjdENhbnZhcy5oZWlnaHQgPSBDSEFUX1BFVF9TT1VSQ0VfU0laRTtcblx0XHRyZXNwYXduRWZmZWN0Q2FudmFzLnNldEF0dHJpYnV0ZSgnYXJpYS1oaWRkZW4nLCAndHJ1ZScpO1xuXHRcdGNvbnN0IHJlc3Bhd25FZmZlY3RJbWFnZSA9IGRvbS5hcHBlbmQodGhpcy5fb3ZlcmxheSwgZG9tLiQoJ2ltZy5jaGF0LXBldC1zcHJpdGVzaGVldCcpKSBhcyBIVE1MSW1hZ2VFbGVtZW50O1xuXHRcdHJlc3Bhd25FZmZlY3RJbWFnZS5hbHQgPSAnJztcblx0XHRyZXNwYXduRWZmZWN0SW1hZ2Uuc2V0QXR0cmlidXRlKCdhcmlhLWhpZGRlbicsICd0cnVlJyk7XG5cdFx0dGhpcy5fcmVzcGF3bkVmZmVjdCA9IHsgY29udGFpbmVyOiByZXNwYXduRWZmZWN0Q2FudmFzLCBpbWFnZTogcmVzcGF3bkVmZmVjdEltYWdlLCBjYW52YXM6IHJlc3Bhd25FZmZlY3RDYW52YXMgfTtcblx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHJlc3Bhd25FZmZlY3RJbWFnZSwgJ2xvYWQnLCAoKSA9PiB0aGlzLl9zdGFydFJlc3Bhd25FZmZlY3RBbmltYXRpb24oKSkpO1xuXHRcdHRoaXMuX3Jlc2l6ZU9ic2VydmVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IGRvbS5EaXNwb3NhYmxlUmVzaXplT2JzZXJ2ZXIoJ0NoYXRQZXRXaWRnZXQuZHJhZ0JvdW5kcycsICgpID0+IHtcblx0XHRcdHRoaXMuX3VwZGF0ZVNwZWVjaEJ1YmJsZVBvc2l0aW9uKCk7XG5cdFx0XHRjb25zdCBpc0FpcmJvcm5lID0gdGhpcy5faXNBaXJib3JuZSgpO1xuXHRcdFx0aWYgKHRoaXMuX2lzRGVhZC5nZXQoKSkge1xuXHRcdFx0XHR0aGlzLl91cGRhdGVSZXNwYXduRWZmZWN0UG9zaXRpb24oKTtcblx0XHRcdH0gZWxzZSBpZiAoaXNBaXJib3JuZSkge1xuXHRcdFx0XHRpZiAodGhpcy5fYnV0dG9uLmVsZW1lbnQuY2xhc3NMaXN0LmNvbnRhaW5zKCd0aHJvd2luZycpKSB7XG5cdFx0XHRcdFx0dGhpcy5fdGhyb3dHZW9tZXRyeURpcnR5ID0gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9IGVsc2UgaWYgKHRoaXMuX2ZhbGxMYW5kc09uUGxhdGZvcm0gJiYgIXRoaXMuX2lzRHJhZ2dpbmcuZ2V0KCkpIHtcblx0XHRcdFx0aWYgKHRoaXMuX2hhc0N1c3RvbVBvc2l0aW9uKSB7XG5cdFx0XHRcdFx0dGhpcy5fc2V0UGxhdGZvcm1Qb3NpdGlvbih0aGlzLl9nZXRDdXJyZW50TGVmdCgpKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLl9zZXREZWZhdWx0UGxhdGZvcm1Qb3NpdGlvbigpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl91cGRhdGVWZXJ0aWNhbFBvc2l0aW9uKCk7XG5cdFx0XHRcdGlmICh0aGlzLl9oYXNDdXN0b21Qb3NpdGlvbiAmJiAhdGhpcy5faXNEcmFnZ2luZy5nZXQoKSkge1xuXHRcdFx0XHRcdHRoaXMuX3NldEhvcml6b250YWxQb3NpdGlvbih0aGlzLl9nZXRDdXJyZW50TGVmdCgpKTtcblx0XHRcdFx0fSBlbHNlIGlmICghdGhpcy5faXNEcmFnZ2luZy5nZXQoKSkge1xuXHRcdFx0XHRcdHRoaXMuX3NldERlZmF1bHRIb3Jpem9udGFsUG9zaXRpb24oKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0sIGRvbS5nZXRXaW5kb3codGhpcy5fYnV0dG9uLmVsZW1lbnQpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fcmVzaXplT2JzZXJ2ZXIub2JzZXJ2ZSh0aGlzLmRyYWdCb3VuZHMpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9yZXNpemVPYnNlcnZlci5vYnNlcnZlKHRoaXMubW92ZW1lbnRCb3VuZHMpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9yZXNpemVPYnNlcnZlci5vYnNlcnZlKHRoaXMucGFyZW50KSk7XG5cdFx0dGhpcy5fdXBkYXRlVmVydGljYWxQb3NpdGlvbigpO1xuXHRcdHRoaXMuX3NldERlZmF1bHRIb3Jpem9udGFsUG9zaXRpb24oKTtcblx0XHR0aGlzLl91cGRhdGVTcGVlY2hCdWJibGVQb3NpdGlvbigpO1xuXHRcdHRoaXMuX3Nwcml0ZXMgPSBbMCwgMV0ubWFwKCgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRhaW5lciA9IGRvbS5hcHBlbmQodGhpcy5fdmlzdWFsLCBkb20uJCgnLmNoYXQtcGV0LXNwcml0ZS5oaWRkZW4nKSk7XG5cdFx0XHRjb25zdCBjYW52YXMgPSBkb20uYXBwZW5kKGNvbnRhaW5lciwgZG9tLiQoJ2NhbnZhcy5jaGF0LXBldC1jYW52YXMnKSkgYXMgSFRNTENhbnZhc0VsZW1lbnQ7XG5cdFx0XHRjYW52YXMud2lkdGggPSBDSEFUX1BFVF9TT1VSQ0VfU0laRTtcblx0XHRcdGNhbnZhcy5oZWlnaHQgPSBDSEFUX1BFVF9TT1VSQ0VfU0laRTtcblx0XHRcdGNhbnZhcy5zZXRBdHRyaWJ1dGUoJ2FyaWEtaGlkZGVuJywgJ3RydWUnKTtcblx0XHRcdGNvbnN0IGltYWdlID0gZG9tLmFwcGVuZChjb250YWluZXIsIGRvbS4kKCdpbWcuY2hhdC1wZXQtc3ByaXRlc2hlZXQnKSkgYXMgSFRNTEltYWdlRWxlbWVudDtcblx0XHRcdGltYWdlLmFsdCA9ICcnO1xuXHRcdFx0aW1hZ2Uuc2V0QXR0cmlidXRlKCdhcmlhLWhpZGRlbicsICd0cnVlJyk7XG5cdFx0XHRjb25zdCBzcHJpdGUgPSB7IGNvbnRhaW5lciwgaW1hZ2UsIGNhbnZhcyB9O1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihpbWFnZSwgJ2xvYWQnLCAoKSA9PiB0aGlzLl9vbkltYWdlTG9hZChzcHJpdGUpKSk7XG5cdFx0XHRyZXR1cm4gc3ByaXRlO1xuXHRcdH0pO1xuXHRcdHRoaXMuX2V5ZXMgPSBkb20uYXBwZW5kKHRoaXMuX3Zpc3VhbCwgZG9tLiQoJy5jaGF0LXBldC1leWVzJykpO1xuXHRcdHRoaXMuX2V5ZXMuc2V0QXR0cmlidXRlKCdhcmlhLWhpZGRlbicsICd0cnVlJyk7XG5cdFx0Zm9yIChjb25zdCBzaWRlIG9mIFsnbGVmdCcsICdyaWdodCddKSB7XG5cdFx0XHRjb25zdCBleWUgPSBkb20uYXBwZW5kKHRoaXMuX2V5ZXMsIGRvbS4kKGAuY2hhdC1wZXQtZXllLiR7c2lkZX1gKSk7XG5cdFx0XHR0aGlzLl9wdXBpbHMucHVzaChkb20uYXBwZW5kKGV5ZSwgZG9tLiQoJy5jaGF0LXBldC1wdXBpbCcpKSk7XG5cdFx0fVxuXHRcdGNvbnN0IHNwZWVjaEJ1YmJsZUNvbnRhaW5lciA9IGRvbS5hcHBlbmQodGhpcy5fdmlzdWFsLCBkb20uJCgnLmNoYXQtcGV0LXNwZWVjaC1idWJibGUuaGlkZGVuJykpO1xuXHRcdGNvbnN0IHNwZWVjaEJ1YmJsZUNhbnZhcyA9IGRvbS5hcHBlbmQoc3BlZWNoQnViYmxlQ29udGFpbmVyLCBkb20uJCgnY2FudmFzLmNoYXQtcGV0LWNhbnZhcy5jaGF0LXBldC1zcGVlY2gtY2FudmFzJykpIGFzIEhUTUxDYW52YXNFbGVtZW50O1xuXHRcdHNwZWVjaEJ1YmJsZUNhbnZhcy53aWR0aCA9IENIQVRfUEVUX1NPVVJDRV9TSVpFO1xuXHRcdHNwZWVjaEJ1YmJsZUNhbnZhcy5oZWlnaHQgPSBDSEFUX1BFVF9TT1VSQ0VfU0laRTtcblx0XHRzcGVlY2hCdWJibGVDYW52YXMuc2V0QXR0cmlidXRlKCdhcmlhLWhpZGRlbicsICd0cnVlJyk7XG5cdFx0Y29uc3Qgc3BlZWNoQnViYmxlSW1hZ2UgPSBkb20uYXBwZW5kKHNwZWVjaEJ1YmJsZUNvbnRhaW5lciwgZG9tLiQoJ2ltZy5jaGF0LXBldC1zcHJpdGVzaGVldCcpKSBhcyBIVE1MSW1hZ2VFbGVtZW50O1xuXHRcdHNwZWVjaEJ1YmJsZUltYWdlLmFsdCA9ICcnO1xuXHRcdHNwZWVjaEJ1YmJsZUltYWdlLnNldEF0dHJpYnV0ZSgnYXJpYS1oaWRkZW4nLCAndHJ1ZScpO1xuXHRcdHRoaXMuX3NwZWVjaEJ1YmJsZSA9IHsgY29udGFpbmVyOiBzcGVlY2hCdWJibGVDb250YWluZXIsIGltYWdlOiBzcGVlY2hCdWJibGVJbWFnZSwgY2FudmFzOiBzcGVlY2hCdWJibGVDYW52YXMgfTtcblx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHNwZWVjaEJ1YmJsZUltYWdlLCAnbG9hZCcsICgpID0+IHRoaXMuX3VwZGF0ZVNwZWVjaEJ1YmJsZSh0aGlzLl9yZW5kZXJlZFN0YXRlLCB0cnVlKSkpO1xuXHRcdHRoaXMuX2dhemVTY2hlZHVsZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgZG9tLkFuaW1hdGlvbkZyYW1lU2NoZWR1bGVyKHRoaXMuX2J1dHRvbi5lbGVtZW50LCAoKSA9PiB0aGlzLl91cGRhdGVHYXplKCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGRvbS5nZXRXaW5kb3codGhpcy5fYnV0dG9uLmVsZW1lbnQpLmRvY3VtZW50LCBkb20uRXZlbnRUeXBlLlBPSU5URVJfTU9WRSwgKGV2ZW50OiBQb2ludGVyRXZlbnQpID0+IHtcblx0XHRcdHRoaXMuX2N1cnNvclBvc2l0aW9uID0gW2V2ZW50LmNsaWVudFgsIGV2ZW50LmNsaWVudFldO1xuXHRcdFx0aWYgKHRoaXMuX2VuYWJsZWQgJiYgZG9lc0NoYXRQZXRTdGF0ZVRyYWNrQ3Vyc29yKHRoaXMuX3JlbmRlcmVkU3RhdGUpKSB7XG5cdFx0XHRcdHRoaXMuX2dhemVTY2hlZHVsZXIuc2NoZWR1bGUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0Y29uc3Qgb25BbmltYXRpb25Db21wbGV0ZSA9IChldmVudDogQW5pbWF0aW9uRXZlbnQpID0+IHtcblx0XHRcdGlmIChldmVudC5hbmltYXRpb25OYW1lID09PSAnY2hhdC1wZXQtZW50ZXInKSB7XG5cdFx0XHRcdHRoaXMuX2J1dHRvbi5lbGVtZW50LmNsYXNzTGlzdC5yZW1vdmUoJ2VudGVyaW5nJyk7XG5cdFx0XHR9IGVsc2UgaWYgKGV2ZW50LmFuaW1hdGlvbk5hbWUgPT09ICdjaGF0LXBldC1leGl0JyAmJiAhdGhpcy5fZW5hYmxlZCkge1xuXHRcdFx0XHR0aGlzLl9maW5pc2hEaXNhYmxlKCk7XG5cdFx0XHR9IGVsc2UgaWYgKGV2ZW50LmFuaW1hdGlvbk5hbWUgPT09ICdjaGF0LXBldC15YXBwaW5nLWZhbGwnICYmICF0aGlzLl9pc0RyYWdnaW5nLmdldCgpICYmIGV2ZW50LnRhcmdldCA9PT0gdGhpcy5fYWN0aXZlU3ByaXRlPy5jb250YWluZXIgJiYgdGhpcy5fYnV0dG9uLmVsZW1lbnQuZGF0YXNldC5zdGF0ZSA9PT0gJ3lhcHBpbmcnKSB7XG5cdFx0XHRcdHRoaXMuX3RyYW5zaWVudFN0YXRlLnNldCgneWFwcGluZ01vdXRoT3BlbicsIHVuZGVmaW5lZCk7XG5cdFx0XHR9IGVsc2UgaWYgKGV2ZW50LmFuaW1hdGlvbk5hbWUgPT09ICdjaGF0LXBldC1zZWFyY2gtZG93bicgJiYgdGhpcy5fYnV0dG9uLmVsZW1lbnQuZGF0YXNldC5zdGF0ZSA9PT0gJ3NlYXJjaGluZ0Rvd24nKSB7XG5cdFx0XHRcdHRoaXMuX3RyYW5zaWVudFN0YXRlLnNldCh1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG5cdFx0XHR9XG5cdFx0fTtcblx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuX2J1dHRvbi5lbGVtZW50LCBkb20uRXZlbnRUeXBlLkFOSU1BVElPTl9FTkQsIG9uQW5pbWF0aW9uQ29tcGxldGUpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuX2J1dHRvbi5lbGVtZW50LCAnYW5pbWF0aW9uY2FuY2VsJywgb25BbmltYXRpb25Db21wbGV0ZSkpO1xuXHRcdGNvbnN0IG9uVHJhbnNpdGlvbkNvbXBsZXRlID0gKGV2ZW50OiBUcmFuc2l0aW9uRXZlbnQpID0+IHtcblx0XHRcdGlmIChldmVudC5wcm9wZXJ0eU5hbWUgPT09ICd0b3AnICYmIHRoaXMuX2J1dHRvbi5lbGVtZW50LmNsYXNzTGlzdC5jb250YWlucygnZmFsbGluZycpKSB7XG5cdFx0XHRcdHRoaXMuX2ZpbmlzaEZhbGwoKTtcblx0XHRcdH1cblx0XHR9O1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5fYnV0dG9uLmVsZW1lbnQsICd0cmFuc2l0aW9uZW5kJywgb25UcmFuc2l0aW9uQ29tcGxldGUpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuX2J1dHRvbi5lbGVtZW50LCAndHJhbnNpdGlvbmNhbmNlbCcsIG9uVHJhbnNpdGlvbkNvbXBsZXRlKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLl9idXR0b24uZWxlbWVudCwgZG9tLkV2ZW50VHlwZS5QT0lOVEVSX0RPV04sIGV2ZW50ID0+IHRoaXMuX3N0YXJ0RHJhZyhldmVudCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuX2J1dHRvbi5lbGVtZW50LCBkb20uRXZlbnRUeXBlLktFWV9ET1dOLCBldmVudCA9PiB0aGlzLl9vbktleURvd24oZXZlbnQpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLl9idXR0b24uZWxlbWVudCwgZG9tLkV2ZW50VHlwZS5DT05URVhUX01FTlUsIGV2ZW50ID0+IHtcblx0XHRcdGlmICghdGhpcy5fZW5hYmxlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRkb20uRXZlbnRIZWxwZXIuc3RvcChldmVudCwgdHJ1ZSk7XG5cdFx0XHR0aGlzLl9zaG93Q29udGV4dE1lbnUoZXZlbnQpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3RlcihpbnB1dENoYW5nZWQoKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX2VuYWJsZWQgJiYgIXRoaXMuY2hhdFBldFNlcnZpY2Uub25UaGVSdW4uZ2V0KCkpIHtcblx0XHRcdFx0dGhpcy5fd2FrZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2J1dHRvbi5vbkRpZENsaWNrKGUgPT4ge1xuXHRcdFx0ZG9tLkV2ZW50SGVscGVyLnN0b3AoZSwgdHJ1ZSk7XG5cdFx0XHRpZiAodGhpcy5fY29udGV4dE1lbnVWaXNpYmxlKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHRoaXMuX3N1cHByZXNzTmV4dFBvaW50ZXJDbGljayAmJiBlLnR5cGUgIT09IGRvbS5FdmVudFR5cGUuS0VZX0RPV04pIHtcblx0XHRcdFx0dGhpcy5fc3VwcHJlc3NOZXh0UG9pbnRlckNsaWNrID0gZmFsc2U7XG5cdFx0XHRcdHRoaXMuX2NsaWNrU3VwcHJlc3Npb25TY2hlZHVsZXIuY2FuY2VsKCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLmNoYXRQZXRTZXJ2aWNlLm9uVGhlUnVuLmdldCgpKSB7XG5cdFx0XHRcdHRoaXMuX3RyYW5zaWVudFN0YXRlLnNldCh1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG5cdFx0XHRcdHRoaXMuY2hhdFBldFNlcnZpY2Uuc2V0T25UaGVSdW4oZmFsc2UpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCB3YXNTbGVlcGluZyA9IHRoaXMuX2lkbGVFeHBpcmVkLmdldCgpIHx8IHRoaXMuX3JlbmRlcmVkU3RhdGUgPT09ICdzbGVlcCc7XG5cdFx0XHRpZiAod2FzU2xlZXBpbmcpIHtcblx0XHRcdFx0dGhpcy5fd2FrZSgpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHdhc1NsZWVwaW5nIHx8IHRoaXMuX3RyYW5zaWVudFN0YXRlLmdldCgpID09PSAnd2FraW5nJykge1xuXHRcdFx0XHRzdGF0dXMobG9jYWxpemUoJ2NoYXRQZXQud29rZVVwJywgXCJUaGUgVlMgQ29kZSBwZXQgd29rZSB1cFwiKSk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGludGVyYWN0aW9uID0gZ2V0Q2hhdFBldENsaWNrSW50ZXJhY3Rpb24oTWF0aC5yYW5kb20oKSwgdGhpcy5fbGFzdENsaWNrSW50ZXJhY3Rpb24pO1xuXHRcdFx0dGhpcy5fbGFzdENsaWNrSW50ZXJhY3Rpb24gPSBpbnRlcmFjdGlvbjtcblx0XHRcdHRoaXMuX3Nob3dUcmFuc2llbnRTdGF0ZShpbnRlcmFjdGlvbik7XG5cdFx0XHRzd2l0Y2ggKGludGVyYWN0aW9uKSB7XG5cdFx0XHRcdGNhc2UgJ2J1dHRvblByZXNzJzpcblx0XHRcdFx0XHRzdGF0dXMobG9jYWxpemUoJ2NoYXRQZXQucHJlc3NlZEJ1dHRvbicsIFwiVGhlIFZTIENvZGUgcGV0IHByZXNzZWQgaXRzIGJ1dHRvblwiKSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgJ2NvbXBsZXRlJzpcblx0XHRcdFx0XHRzdGF0dXMobG9jYWxpemUoJ2NoYXRQZXQuc3B1bicsIFwiVGhlIFZTIENvZGUgcGV0IGRpZCBhIHJhcmUgc3BpblwiKSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgJ2xvdmUnOlxuXHRcdFx0XHRcdHN0YXR1cyhsb2NhbGl6ZSgnY2hhdFBldC5sb3ZlZCcsIFwiVGhlIFZTIENvZGUgcGV0IGZlZWxzIGxvdmVkXCIpKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSAnY29vbCc6XG5cdFx0XHRcdFx0c3RhdHVzKGxvY2FsaXplKCdjaGF0UGV0LmNvb2wnLCBcIlRoZSBWUyBDb2RlIHBldCBwdXQgb24gc3VuZ2xhc3Nlc1wiKSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgJ3lhcHBpbmcnOlxuXHRcdFx0XHRcdHN0YXR1cyhsb2NhbGl6ZSgnY2hhdFBldC55YXBwaW5nJywgXCJUaGUgVlMgQ29kZSBwZXQgaXMgeWFwcGluZ1wiKSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgJ3NpbmcnOlxuXHRcdFx0XHRcdHN0YXR1cyhsb2NhbGl6ZSgnY2hhdFBldC5zaW5naW5nJywgXCJUaGUgVlMgQ29kZSBwZXQgaXMgc2luZ2luZ1wiKSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgJ3NwZWVjaGxlc3MnOlxuXHRcdFx0XHRcdHN0YXR1cyhsb2NhbGl6ZSgnY2hhdFBldC5zcGVlY2hsZXNzJywgXCJUaGUgVlMgQ29kZSBwZXQgaXMgc3BlZWNobGVzc1wiKSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgJ3dvcnJ5Jzpcblx0XHRcdFx0XHRzdGF0dXMobG9jYWxpemUoJ2NoYXRQZXQud29ycmllZCcsIFwiVGhlIFZTIENvZGUgcGV0IGlzIHdvcnJpZWRcIikpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IG1vdGlvblJlZHVjZWQgPSBvYnNlcnZhYmxlRnJvbUV2ZW50KHRoaXMsIHRoaXMuYWNjZXNzaWJpbGl0eVNlcnZpY2Uub25EaWRDaGFuZ2VSZWR1Y2VkTW90aW9uLCAoKSA9PiB0aGlzLmFjY2Vzc2liaWxpdHlTZXJ2aWNlLmlzTW90aW9uUmVkdWNlZCgpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCB3YXNNb3Rpb25SZWR1Y2VkID0gdGhpcy5fbW90aW9uUmVkdWNlZDtcblx0XHRcdHRoaXMuX21vdGlvblJlZHVjZWQgPSBtb3Rpb25SZWR1Y2VkLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmICghd2FzTW90aW9uUmVkdWNlZCAmJiB0aGlzLl9tb3Rpb25SZWR1Y2VkICYmIHRoaXMuX2J1dHRvbi5lbGVtZW50LmNsYXNzTGlzdC5jb250YWlucygndGhyb3dpbmcnKSkge1xuXHRcdFx0XHR0aGlzLl9maW5pc2hUaHJvdygpO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3Qgc2VydmljZUVuYWJsZWQgPSB0aGlzLmNoYXRQZXRTZXJ2aWNlLmVuYWJsZWQucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3Qgc2NhbGUgPSB0aGlzLmNoYXRQZXRTZXJ2aWNlLnNjYWxlLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmIChzY2FsZSAhPT0gdGhpcy5fc2NhbGUpIHtcblx0XHRcdFx0dGhpcy5fc2V0U2NhbGUoc2NhbGUpO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgZW5hYmxlZCA9IGlzQ2hhdFBldFZpc2libGUoc2VydmljZUVuYWJsZWQsIGlzTGF0ZXN0Rm9jdXNlZFdpZGdldC5yZWFkKHJlYWRlcikpO1xuXHRcdFx0Y29uc3QgdmFyaWFudCA9IHRoaXMuY2hhdFBldFNlcnZpY2UudmFyaWFudC5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCB2YXJpYW50Q2hhbmdlZCA9IHZhcmlhbnQgIT09IHRoaXMuX3ZhcmlhbnQ7XG5cdFx0XHR0aGlzLl92YXJpYW50ID0gdmFyaWFudDtcblx0XHRcdGNvbnN0IG9uVGhlUnVuID0gdGhpcy5jaGF0UGV0U2VydmljZS5vblRoZVJ1bi5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBpc0RlYWQgPSB0aGlzLl9pc0RlYWQucmVhZChyZWFkZXIpO1xuXHRcdFx0dGhpcy5fYnV0dG9uLmVsZW1lbnQuY2xhc3NMaXN0LnRvZ2dsZSgnb24tdGhlLXJ1bicsIG9uVGhlUnVuKTtcblx0XHRcdHRoaXMuX2J1dHRvbi5zZXRBcmlhTGFiZWwodGhpcy5fZ2V0QXJpYUxhYmVsKG9uVGhlUnVuKSk7XG5cdFx0XHRjb25zdCBjaGF0TW9kZWwgPSBtb2RlbC5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCByZXF1ZXN0ID0gY2hhdE1vZGVsPy5sYXN0UmVxdWVzdE9icy5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBuZWVkc0lucHV0ID0gISFyZXF1ZXN0Py5yZXNwb25zZT8uaXNQZW5kaW5nQ29uZmlybWF0aW9uLnJlYWQocmVhZGVyKTtcblx0XHRcdGxldCBjb25maXJtYXRpb25BdHRlbnRpb25FeHBpcmVkID0gdGhpcy5fY29uZmlybWF0aW9uQXR0ZW50aW9uRXhwaXJlZC5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAoIW5lZWRzSW5wdXQpIHtcblx0XHRcdFx0dGhpcy5fY29uZmlybWF0aW9uQXR0ZW50aW9uU2NoZWR1bGVyLmNhbmNlbCgpO1xuXHRcdFx0XHRpZiAoY29uZmlybWF0aW9uQXR0ZW50aW9uRXhwaXJlZCkge1xuXHRcdFx0XHRcdGNvbmZpcm1hdGlvbkF0dGVudGlvbkV4cGlyZWQgPSBmYWxzZTtcblx0XHRcdFx0XHR0aGlzLl9jb25maXJtYXRpb25BdHRlbnRpb25FeHBpcmVkLnNldChmYWxzZSwgdW5kZWZpbmVkKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIGlmICghY29uZmlybWF0aW9uQXR0ZW50aW9uRXhwaXJlZCAmJiAhdGhpcy5fY29uZmlybWF0aW9uQXR0ZW50aW9uU2NoZWR1bGVyLmlzU2NoZWR1bGVkKCkpIHtcblx0XHRcdFx0dGhpcy5fY29uZmlybWF0aW9uQXR0ZW50aW9uU2NoZWR1bGVyLnNjaGVkdWxlKCk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBoYXNBY3RpdmVSZXF1ZXN0ID0gY2hhdE1vZGVsPy5oYXNBY3RpdmVSZXF1ZXN0LnJlYWQocmVhZGVyKSA/PyBmYWxzZTtcblx0XHRcdGNvbnN0IGlucHV0SGFzQ29udGVudCA9IGhhc0lucHV0LnJlYWQocmVhZGVyKTtcblx0XHRcdHRoaXMuX2J1c3kgPSBoYXNBY3RpdmVSZXF1ZXN0IHx8IG5lZWRzSW5wdXQ7XG5cdFx0XHRsZXQgaWRsZUV4cGlyZWQgPSB0aGlzLl9pZGxlRXhwaXJlZC5yZWFkKHJlYWRlcik7XG5cdFx0XHRsZXQgdHJhbnNpZW50U3RhdGUgPSB0aGlzLl90cmFuc2llbnRTdGF0ZS5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBpc0RyYWdnaW5nID0gdGhpcy5faXNEcmFnZ2luZy5yZWFkKHJlYWRlcik7XG5cblx0XHRcdGlmICghdGhpcy5fZW5hYmxlbWVudEluaXRpYWxpemVkIHx8IGVuYWJsZWQgIT09IHRoaXMuX2VuYWJsZWQpIHtcblx0XHRcdFx0Y29uc3Qgd2FzSW5pdGlhbGl6ZWQgPSB0aGlzLl9lbmFibGVtZW50SW5pdGlhbGl6ZWQ7XG5cdFx0XHRcdHRoaXMuX2VuYWJsZW1lbnRJbml0aWFsaXplZCA9IHRydWU7XG5cdFx0XHRcdHRoaXMuX2VuYWJsZWQgPSBlbmFibGVkO1xuXHRcdFx0XHRpZiAoZW5hYmxlZCkge1xuXHRcdFx0XHRcdGlmIChpc0RlYWQpIHtcblx0XHRcdFx0XHRcdHRoaXMuX3Nob3dSZXNwYXduU2VxdWVuY2UoKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0dGhpcy5fc3RhcnRFbmFibGVBbmltYXRpb24oKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSBpZiAod2FzSW5pdGlhbGl6ZWQpIHtcblx0XHRcdFx0XHR0aGlzLl9zdGFydERpc2FibGVBbmltYXRpb24oKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLl9maW5pc2hEaXNhYmxlKCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKCFlbmFibGVkKSB7XG5cdFx0XHRcdHRoaXMuX2hvcENvbnRyb2xsZXIuY2FuY2VsKCk7XG5cdFx0XHRcdHRoaXMuX2lkbGVTY2hlZHVsZXIuY2FuY2VsKCk7XG5cdFx0XHRcdHRoaXMuX3NlYXJjaFNjaGVkdWxlci5jYW5jZWwoKTtcblx0XHRcdFx0dGhpcy5fdHJhbnNpZW50U2NoZWR1bGVyLmNhbmNlbCgpO1xuXHRcdFx0XHRpZiAodHJhbnNpZW50U3RhdGUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdHRoaXMuX3RyYW5zaWVudFN0YXRlLnNldCh1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHRoaXMuX21vdGlvblJlZHVjZWQpIHtcblx0XHRcdFx0XHR0aGlzLl9maW5pc2hEaXNhYmxlKCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoaXNEZWFkKSB7XG5cdFx0XHRcdHRoaXMuX2hvcENvbnRyb2xsZXIuY2FuY2VsKCk7XG5cdFx0XHRcdHRoaXMuX2lkbGVTY2hlZHVsZXIuY2FuY2VsKCk7XG5cdFx0XHRcdHRoaXMuX3NlYXJjaFNjaGVkdWxlci5jYW5jZWwoKTtcblx0XHRcdFx0dGhpcy5fdHJhbnNpZW50U2NoZWR1bGVyLmNhbmNlbCgpO1xuXHRcdFx0XHR0aGlzLl9zaG93UmVzcGF3blNlcXVlbmNlKCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKG9uVGhlUnVuKSB7XG5cdFx0XHRcdHRoaXMuX2hvcENvbnRyb2xsZXIuY2FuY2VsKCk7XG5cdFx0XHRcdHRoaXMuX2lkbGVTY2hlZHVsZXIuY2FuY2VsKCk7XG5cdFx0XHRcdGlmICghdGhpcy5fc2VhcmNoU2NoZWR1bGVyLmlzU2NoZWR1bGVkKCkpIHtcblx0XHRcdFx0XHR0aGlzLl9zZWFyY2hTY2hlZHVsZXIuc2NoZWR1bGUoKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBzdGF0ZSA9IHRyYW5zaWVudFN0YXRlID09PSAnc2VhcmNoaW5nJyB8fCB0cmFuc2llbnRTdGF0ZSA9PT0gJ3NlYXJjaGluZ0Rvd24nID8gdHJhbnNpZW50U3RhdGUgOiAnb25UaGVSdW4nO1xuXHRcdFx0XHR0aGlzLl9yZW5kZXJTdGF0ZShzdGF0ZSwgdmFyaWFudENoYW5nZWQpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9zZWFyY2hTY2hlZHVsZXIuY2FuY2VsKCk7XG5cblx0XHRcdGlmICh0aGlzLl9idXN5KSB7XG5cdFx0XHRcdHRoaXMuX2lkbGVTY2hlZHVsZXIuY2FuY2VsKCk7XG5cdFx0XHRcdGlmIChpZGxlRXhwaXJlZCkge1xuXHRcdFx0XHRcdGlkbGVFeHBpcmVkID0gZmFsc2U7XG5cdFx0XHRcdFx0dGhpcy5faWRsZUV4cGlyZWQuc2V0KGZhbHNlLCB1bmRlZmluZWQpO1xuXHRcdFx0XHRcdHRyYW5zaWVudFN0YXRlID0gdGhpcy5fYmVnaW5XYWtlQW5pbWF0aW9uKCkgPz8gdHJhbnNpZW50U3RhdGU7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSBpZiAoIWlkbGVFeHBpcmVkICYmICF0aGlzLl9pZGxlU2NoZWR1bGVyLmlzU2NoZWR1bGVkKCkpIHtcblx0XHRcdFx0dGhpcy5faWRsZVNjaGVkdWxlci5zY2hlZHVsZSgpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBiYXNlU3RhdGUgPSBnZXRDaGF0UGV0QmFzZVN0YXRlKGhhc0FjdGl2ZVJlcXVlc3QsIG5lZWRzSW5wdXQsIGNvbmZpcm1hdGlvbkF0dGVudGlvbkV4cGlyZWQsIGlucHV0SGFzQ29udGVudCwgaWRsZUV4cGlyZWQpO1xuXHRcdFx0aWYgKGlzQ2hhdFBldFlhcFN0YXRlKHRyYW5zaWVudFN0YXRlKSAmJiBiYXNlU3RhdGUgIT09ICdpZGxlJykge1xuXHRcdFx0XHR0cmFuc2llbnRTdGF0ZSA9IHVuZGVmaW5lZDtcblx0XHRcdFx0dGhpcy5fdHJhbnNpZW50U3RhdGUuc2V0KHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHJlbmRlcmVkU3RhdGUgPSBnZXRDaGF0UGV0UmVuZGVyZWRTdGF0ZShiYXNlU3RhdGUsIHRyYW5zaWVudFN0YXRlLCBpc0RyYWdnaW5nKTtcblx0XHRcdGlmIChyZW5kZXJlZFN0YXRlICE9PSAnanVtcCcgfHwgdGhpcy5fbW90aW9uUmVkdWNlZCkge1xuXHRcdFx0XHR0aGlzLl9ob3BDb250cm9sbGVyLmNhbmNlbCgpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fcmVuZGVyU3RhdGUocmVuZGVyZWRTdGF0ZSwgdmFyaWFudENoYW5nZWQsIGlzRHJhZ2dpbmcpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IGNoYXRNb2RlbCA9IG1vZGVsLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IHJlc3BvbnNlID0gY2hhdE1vZGVsPy5sYXN0UmVxdWVzdE9icy5yZWFkKHJlYWRlcik/LnJlc3BvbnNlO1xuXHRcdFx0aWYgKCFyZXNwb25zZSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRyZWFkZXIuc3RvcmUuYWRkKHJlc3BvbnNlLm9uRGlkQ2hhbmdlKGUgPT4ge1xuXHRcdFx0XHRpZiAoZS5yZWFzb24gPT09ICdjb21wbGV0ZWRSZXF1ZXN0JyAmJiAhcmVzcG9uc2UuaXNDYW5jZWxlZCkge1xuXHRcdFx0XHRcdHRoaXMuX3Nob3dUcmFuc2llbnRTdGF0ZSgnYnV0dG9uUHJlc3MnKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH0pKTtcblx0fVxuXG5cdHNldFBsYXRmb3JtVG9wUHJvdmlkZXIocHJvdmlkZXI6ICgpID0+IG51bWJlciB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdHRoaXMuX3BsYXRmb3JtVG9wUHJvdmlkZXIgPSBwcm92aWRlcjtcblx0XHRpZiAodGhpcy5faXNBaXJib3JuZSgpKSB7XG5cdFx0XHRpZiAodGhpcy5fYnV0dG9uLmVsZW1lbnQuY2xhc3NMaXN0LmNvbnRhaW5zKCd0aHJvd2luZycpKSB7XG5cdFx0XHRcdHRoaXMuX3Rocm93R2VvbWV0cnlEaXJ0eSA9IHRydWU7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX3VwZGF0ZVZlcnRpY2FsUG9zaXRpb24oKTtcblx0XHRpZiAodGhpcy5fZmFsbExhbmRzT25QbGF0Zm9ybSAmJiAhdGhpcy5faXNEcmFnZ2luZy5nZXQoKSkge1xuXHRcdFx0aWYgKHRoaXMuX2hhc0N1c3RvbVBvc2l0aW9uKSB7XG5cdFx0XHRcdHRoaXMuX3NldFBsYXRmb3JtUG9zaXRpb24odGhpcy5fZ2V0Q3VycmVudExlZnQoKSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9zZXREZWZhdWx0UGxhdGZvcm1Qb3NpdGlvbigpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3N0YXJ0RHJhZyhldmVudDogUG9pbnRlckV2ZW50KTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9lbmFibGVkIHx8IHRoaXMuX2lzRGVhZC5nZXQoKSB8fCB0aGlzLl9pc0RyYWdnaW5nLmdldCgpIHx8IHRoaXMuX2lzQWlyYm9ybmUoKSB8fCB0aGlzLmNoYXRQZXRTZXJ2aWNlLm9uVGhlUnVuLmdldCgpIHx8IGV2ZW50LmJ1dHRvbiAhPT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl93YWtlKCk7XG5cdFx0ZG9tLkV2ZW50SGVscGVyLnN0b3AoZXZlbnQpO1xuXHRcdHRoaXMuX2J1dHRvbi5lbGVtZW50LmZvY3VzKCk7XG5cdFx0Y29uc3QgdGFyZ2V0V2luZG93ID0gZG9tLmdldFdpbmRvdyh0aGlzLl9idXR0b24uZWxlbWVudCk7XG5cdFx0Y29uc3Qgc3RhcnRYID0gZXZlbnQuY2xpZW50WDtcblx0XHRjb25zdCBzdGFydFkgPSBldmVudC5jbGllbnRZO1xuXHRcdGNvbnN0IHBvaW50ZXJTYW1wbGVzOiBDaGF0UGV0UG9pbnRlclNhbXBsZVtdID0gW3sgeDogc3RhcnRYLCB5OiBzdGFydFksIHRpbWU6IHRhcmdldFdpbmRvdy5wZXJmb3JtYW5jZS5ub3coKSB9XTtcblx0XHRjb25zdCBidXR0b25Cb3VuZHMgPSB0aGlzLl9idXR0b24uZWxlbWVudC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcblx0XHRjb25zdCBvdmVybGF5Qm91bmRzID0gdGhpcy5fb3ZlcmxheS5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcblx0XHRjb25zdCBzdGFydExlZnQgPSBidXR0b25Cb3VuZHMubGVmdCAtIG92ZXJsYXlCb3VuZHMubGVmdDtcblx0XHRjb25zdCBzdGFydFRvcCA9IGJ1dHRvbkJvdW5kcy50b3AgLSBvdmVybGF5Qm91bmRzLnRvcDtcblx0XHRsZXQgZGlkRHJhZyA9IGZhbHNlO1xuXG5cdFx0dGhpcy5fZHJhZ01vbml0b3Iuc3RhcnRNb25pdG9yaW5nKHRoaXMuX2J1dHRvbi5lbGVtZW50LCBldmVudC5wb2ludGVySWQsIGV2ZW50LmJ1dHRvbnMsIG1vdmVFdmVudCA9PiB7XG5cdFx0XHRjb25zdCBkZWx0YVggPSBtb3ZlRXZlbnQuY2xpZW50WCAtIHN0YXJ0WDtcblx0XHRcdGNvbnN0IGRlbHRhWSA9IG1vdmVFdmVudC5jbGllbnRZIC0gc3RhcnRZO1xuXHRcdFx0Y29uc3Qgc2FtcGxlVGltZSA9IHRhcmdldFdpbmRvdy5wZXJmb3JtYW5jZS5ub3coKTtcblx0XHRcdHBvaW50ZXJTYW1wbGVzLnB1c2goeyB4OiBtb3ZlRXZlbnQuY2xpZW50WCwgeTogbW92ZUV2ZW50LmNsaWVudFksIHRpbWU6IHNhbXBsZVRpbWUgfSk7XG5cdFx0XHR3aGlsZSAocG9pbnRlclNhbXBsZXMubGVuZ3RoID4gMiAmJiBzYW1wbGVUaW1lIC0gcG9pbnRlclNhbXBsZXNbMF0udGltZSA+IFRIUk9XX1ZFTE9DSVRZX1NBTVBMRV9EVVJBVElPTikge1xuXHRcdFx0XHRwb2ludGVyU2FtcGxlcy5zaGlmdCgpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCFkaWREcmFnICYmIE1hdGguaHlwb3QoZGVsdGFYLCBkZWx0YVkpIDwgRFJBR19USFJFU0hPTEQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoIWRpZERyYWcpIHtcblx0XHRcdFx0ZGlkRHJhZyA9IHRydWU7XG5cdFx0XHRcdHRoaXMuX2J1dHRvbi5lbGVtZW50LmNsYXNzTGlzdC5yZW1vdmUoJ2VudGVyaW5nJyk7XG5cdFx0XHRcdHRoaXMuX2J1dHRvbi5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2RyYWdnaW5nJyk7XG5cdFx0XHRcdHRoaXMuX3Nwcml0ZUFuaW1hdGlvbi5jbGVhcigpO1xuXHRcdFx0XHR0aGlzLl9zZXREcmFnUG9zaXRpb24oc3RhcnRMZWZ0LCBzdGFydFRvcCk7XG5cdFx0XHRcdHRoaXMuX2lzRHJhZ2dpbmcuc2V0KHRydWUsIHVuZGVmaW5lZCk7XG5cdFx0XHR9XG5cdFx0XHRkb20uRXZlbnRIZWxwZXIuc3RvcChtb3ZlRXZlbnQsIHRydWUpO1xuXHRcdFx0dGhpcy5fc2V0RHJhZ1Bvc2l0aW9uKHN0YXJ0TGVmdCArIGRlbHRhWCwgc3RhcnRUb3AgKyBkZWx0YVkpO1xuXHRcdH0sICgpID0+IHtcblx0XHRcdHRoaXMuX2J1dHRvbi5lbGVtZW50LmNsYXNzTGlzdC5yZW1vdmUoJ2RyYWdnaW5nJywgJ3Jlc2lzdGluZycsICdzb2Z0LXJlc2lzdGluZycpO1xuXHRcdFx0aWYgKGRpZERyYWcpIHtcblx0XHRcdFx0dGhpcy5fc3VwcHJlc3NOZXh0UG9pbnRlckNsaWNrID0gdHJ1ZTtcblx0XHRcdFx0dGhpcy5fY2xpY2tTdXBwcmVzc2lvblNjaGVkdWxlci5zY2hlZHVsZSgpO1xuXHRcdFx0XHRjb25zdCB0aHJvd1ZlbG9jaXR5ID0gZ2V0Q2hhdFBldFRocm93VmVsb2NpdHkocG9pbnRlclNhbXBsZXMsIHRhcmdldFdpbmRvdy5wZXJmb3JtYW5jZS5ub3coKSk7XG5cdFx0XHRcdGlmICghdGhpcy5fbW90aW9uUmVkdWNlZCAmJiB0aHJvd1ZlbG9jaXR5KSB7XG5cdFx0XHRcdFx0dGhpcy5fYmVnaW5UaHJvdyh0aHJvd1ZlbG9jaXR5KTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLl9iZWdpbkZhbGwoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2V0RHJhZ1Bvc2l0aW9uKGxlZnQ6IG51bWJlciwgdG9wOiBudW1iZXIpOiB2b2lkIHtcblx0XHRjb25zdCBvdmVybGF5Qm91bmRzID0gdGhpcy5fb3ZlcmxheS5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcblx0XHRjb25zdCBtb3ZlbWVudEJvdW5kcyA9IHRoaXMubW92ZW1lbnRCb3VuZHMuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG5cdFx0Y29uc3QgbWluaW11bUxlZnQgPSBtb3ZlbWVudEJvdW5kcy5sZWZ0IC0gb3ZlcmxheUJvdW5kcy5sZWZ0O1xuXHRcdGNvbnN0IG1heGltdW1MZWZ0ID0gbW92ZW1lbnRCb3VuZHMucmlnaHQgLSBvdmVybGF5Qm91bmRzLmxlZnQgLSB0aGlzLl9idXR0b24uZWxlbWVudC5vZmZzZXRXaWR0aDtcblx0XHRjb25zdCBtaW5pbXVtVG9wID0gbW92ZW1lbnRCb3VuZHMudG9wIC0gb3ZlcmxheUJvdW5kcy50b3A7XG5cdFx0Y29uc3QgbWF4aW11bVRvcCA9IG1vdmVtZW50Qm91bmRzLmJvdHRvbSAtIG92ZXJsYXlCb3VuZHMudG9wIC0gdGhpcy5fYnV0dG9uLmVsZW1lbnQub2Zmc2V0SGVpZ2h0O1xuXHRcdGNvbnN0IFtjbGFtcGVkTGVmdCwgY2xhbXBlZFRvcF0gPSBnZXRDaGF0UGV0RHJhZ1Bvc2l0aW9uKGxlZnQsIHRvcCwgbWluaW11bUxlZnQsIG1heGltdW1MZWZ0LCBtaW5pbXVtVG9wLCBtYXhpbXVtVG9wKTtcblx0XHR0aGlzLl9idXR0b24uZWxlbWVudC5zdHlsZS5sZWZ0ID0gYCR7Y2xhbXBlZExlZnR9cHhgO1xuXHRcdHRoaXMuX2J1dHRvbi5lbGVtZW50LnN0eWxlLnRvcCA9IGAke2NsYW1wZWRUb3B9cHhgO1xuXHRcdHRoaXMuX2J1dHRvbi5lbGVtZW50LnN0eWxlLnJpZ2h0ID0gJ2F1dG8nO1xuXHRcdHRoaXMuX2J1dHRvbi5lbGVtZW50LnN0eWxlLmJvdHRvbSA9ICdhdXRvJztcblx0XHR0aGlzLl9oYXNDdXN0b21Qb3NpdGlvbiA9IHRydWU7XG5cdFx0dGhpcy5fdXBkYXRlU3BlZWNoQnViYmxlUG9zaXRpb24oKTtcblx0XHRpZiAodGhpcy5fYnV0dG9uLmVsZW1lbnQuY2xhc3NMaXN0LmNvbnRhaW5zKCdkcmFnZ2luZycpKSB7XG5cdFx0XHR0aGlzLl91cGRhdGVEcmFnV2lnZ2xlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0RmFsbFRhcmdldCgpOiB7IHJlYWRvbmx5IHRvcDogbnVtYmVyOyByZWFkb25seSBsYW5kc09uUGxhdGZvcm06IGJvb2xlYW4gfSB7XG5cdFx0Y29uc3Qgb3ZlcmxheUJvdW5kcyA9IHRoaXMuX292ZXJsYXkuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG5cdFx0Y29uc3QgcGxhdGZvcm1Cb3VuZHMgPSB0aGlzLl9nZXRQbGF0Zm9ybUJvdW5kcygpO1xuXHRcdGNvbnN0IG1vdmVtZW50Qm91bmRzID0gdGhpcy5tb3ZlbWVudEJvdW5kcy5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcblx0XHRyZXR1cm4gZ2V0Q2hhdFBldEZhbGxUYXJnZXQoXG5cdFx0XHROdW1iZXIucGFyc2VGbG9hdCh0aGlzLl9idXR0b24uZWxlbWVudC5zdHlsZS5sZWZ0KSxcblx0XHRcdE51bWJlci5wYXJzZUZsb2F0KHRoaXMuX2J1dHRvbi5lbGVtZW50LnN0eWxlLnRvcCksXG5cdFx0XHR0aGlzLl9nZXREaXNwbGF5U2l6ZSgpLFxuXHRcdFx0dGhpcy5fZ2V0RGlzcGxheVNpemUoKSxcblx0XHRcdHBsYXRmb3JtQm91bmRzLmxlZnQgLSBvdmVybGF5Qm91bmRzLmxlZnQsXG5cdFx0XHRwbGF0Zm9ybUJvdW5kcy5yaWdodCAtIG92ZXJsYXlCb3VuZHMubGVmdCxcblx0XHRcdHBsYXRmb3JtQm91bmRzLnRvcCAtIG92ZXJsYXlCb3VuZHMudG9wLFxuXHRcdFx0bW92ZW1lbnRCb3VuZHMuYm90dG9tIC0gb3ZlcmxheUJvdW5kcy50b3AsXG5cdFx0KTtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZURyYWdXaWdnbGUoKTogdm9pZCB7XG5cdFx0Y29uc3QgbGFuZHNPblBsYXRmb3JtID0gdGhpcy5fZ2V0RmFsbFRhcmdldCgpLmxhbmRzT25QbGF0Zm9ybTtcblx0XHR0aGlzLl9idXR0b24uZWxlbWVudC5jbGFzc0xpc3QudG9nZ2xlKCdzb2Z0LXJlc2lzdGluZycsIGxhbmRzT25QbGF0Zm9ybSk7XG5cdFx0dGhpcy5fYnV0dG9uLmVsZW1lbnQuY2xhc3NMaXN0LnRvZ2dsZSgncmVzaXN0aW5nJywgIWxhbmRzT25QbGF0Zm9ybSk7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRUaHJvd0dlb21ldHJ5KCk6IENoYXRQZXRUaHJvd0dlb21ldHJ5IHtcblx0XHRjb25zdCBvdmVybGF5Qm91bmRzID0gdGhpcy5fb3ZlcmxheS5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcblx0XHRjb25zdCBtb3ZlbWVudEJvdW5kcyA9IHRoaXMubW92ZW1lbnRCb3VuZHMuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG5cdFx0Y29uc3QgcGxhdGZvcm1Cb3VuZHMgPSB0aGlzLl9nZXRQbGF0Zm9ybUJvdW5kcygpO1xuXHRcdGNvbnN0IGRpc3BsYXlTaXplID0gdGhpcy5fZ2V0RGlzcGxheVNpemUoKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0Ym91bmRzOiB7XG5cdFx0XHRcdG1pbmltdW1MZWZ0OiBtb3ZlbWVudEJvdW5kcy5sZWZ0IC0gb3ZlcmxheUJvdW5kcy5sZWZ0LFxuXHRcdFx0XHRtYXhpbXVtTGVmdDogTWF0aC5tYXgobW92ZW1lbnRCb3VuZHMubGVmdCAtIG92ZXJsYXlCb3VuZHMubGVmdCwgbW92ZW1lbnRCb3VuZHMucmlnaHQgLSBvdmVybGF5Qm91bmRzLmxlZnQgLSBkaXNwbGF5U2l6ZSksXG5cdFx0XHRcdG1pbmltdW1Ub3A6IG1vdmVtZW50Qm91bmRzLnRvcCAtIG92ZXJsYXlCb3VuZHMudG9wLFxuXHRcdFx0fSxcblx0XHRcdGRpc3BsYXlTaXplLFxuXHRcdFx0b3ZlcmxheUxlZnQ6IG92ZXJsYXlCb3VuZHMubGVmdCxcblx0XHRcdG92ZXJsYXlUb3A6IG92ZXJsYXlCb3VuZHMudG9wLFxuXHRcdFx0cGxhdGZvcm1MZWZ0OiBwbGF0Zm9ybUJvdW5kcy5sZWZ0IC0gb3ZlcmxheUJvdW5kcy5sZWZ0LFxuXHRcdFx0cGxhdGZvcm1SaWdodDogcGxhdGZvcm1Cb3VuZHMucmlnaHQgLSBvdmVybGF5Qm91bmRzLmxlZnQsXG5cdFx0XHRwbGF0Zm9ybVRvcDogcGxhdGZvcm1Cb3VuZHMudG9wIC0gb3ZlcmxheUJvdW5kcy50b3AsXG5cdFx0XHRmbG9vclRvcDogbW92ZW1lbnRCb3VuZHMuYm90dG9tIC0gb3ZlcmxheUJvdW5kcy50b3AgLSBkaXNwbGF5U2l6ZSxcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBfYmVnaW5UaHJvdyh2ZWxvY2l0eTogQ2hhdFBldFRocm93VmVsb2NpdHkpOiB2b2lkIHtcblx0XHRjb25zdCB0YXJnZXRXaW5kb3cgPSBkb20uZ2V0V2luZG93KHRoaXMuX2J1dHRvbi5lbGVtZW50KTtcblx0XHRsZXQgZ2VvbWV0cnkgPSB0aGlzLl9nZXRUaHJvd0dlb21ldHJ5KCk7XG5cdFx0Y29uc3QgYnV0dG9uQm91bmRzID0gdGhpcy5fYnV0dG9uLmVsZW1lbnQuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG5cdFx0bGV0IG1vdGlvbjogQ2hhdFBldFRocm93TW90aW9uID0ge1xuXHRcdFx0bGVmdDogYnV0dG9uQm91bmRzLmxlZnQgLSBnZW9tZXRyeS5vdmVybGF5TGVmdCxcblx0XHRcdHRvcDogYnV0dG9uQm91bmRzLnRvcCAtIGdlb21ldHJ5Lm92ZXJsYXlUb3AsXG5cdFx0XHR4OiB2ZWxvY2l0eS54LFxuXHRcdFx0eTogdmVsb2NpdHkueSxcblx0XHR9O1xuXHRcdGxldCByb3RhdGlvbiA9IDA7XG5cdFx0bGV0IHdhbGxJbXBhY3Q6IHsgcmVhZG9ubHkgd2FsbDogQ2hhdFBldFdhbGw7IHJlYWRvbmx5IGVuZHNBdDogbnVtYmVyIH0gfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3Qgc3RhcnRUaW1lID0gdGFyZ2V0V2luZG93LnBlcmZvcm1hbmNlLm5vdygpO1xuXHRcdGxldCBsYXN0RnJhbWVUaW1lID0gc3RhcnRUaW1lO1xuXG5cdFx0aWYgKHZlbG9jaXR5LnggIT09IDApIHtcblx0XHRcdHRoaXMuX3NldEZhY2luZ0RpcmVjdGlvbih2ZWxvY2l0eS54IDwgMCA/ICdsZWZ0JyA6ICdyaWdodCcpO1xuXHRcdH1cblx0XHR0aGlzLl90cmFuc2llbnRTY2hlZHVsZXIuY2FuY2VsKCk7XG5cdFx0dGhpcy5fdGhyb3dXYWxsSW1wYWN0ID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX3Rocm93R2VvbWV0cnlEaXJ0eSA9IGZhbHNlO1xuXHRcdHRoaXMuX2ZhbGxMYW5kc09uUGxhdGZvcm0gPSBmYWxzZTtcblx0XHR0aGlzLl9zZXRUaHJvd1Bvc2l0aW9uKG1vdGlvbi5sZWZ0LCBtb3Rpb24udG9wKTtcblx0XHR0aGlzLl90cmFuc2llbnRTdGF0ZS5zZXQoJ2ZhbGxpbmcnLCB1bmRlZmluZWQpO1xuXHRcdHRoaXMuX2lzRHJhZ2dpbmcuc2V0KGZhbHNlLCB1bmRlZmluZWQpO1xuXHRcdHRoaXMuX3JlbmRlclN0YXRlKCdmYWxsaW5nJywgdHJ1ZSk7XG5cdFx0dGhpcy5fYnV0dG9uLmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgndGhyb3dpbmcnKTtcblxuXHRcdGNvbnN0IGFuaW1hdGlvbkRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IHNjaGVkdWxlZEZyYW1lID0gYW5pbWF0aW9uRGlzcG9zYWJsZXMuYWRkKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxJRGlzcG9zYWJsZT4oKSk7XG5cdFx0Y29uc3Qgc2NoZWR1bGVGcmFtZSA9ICgpID0+IHtcblx0XHRcdHNjaGVkdWxlZEZyYW1lLnZhbHVlID0gZG9tLnNjaGVkdWxlQXROZXh0QW5pbWF0aW9uRnJhbWUodGFyZ2V0V2luZG93LCB1cGRhdGVGcmFtZSk7XG5cdFx0fTtcblx0XHRjb25zdCB1cGRhdGVGcmFtZSA9ICgpID0+IHtcblx0XHRcdGlmICh0aGlzLl90aHJvd0FuaW1hdGlvbi52YWx1ZSAhPT0gYW5pbWF0aW9uRGlzcG9zYWJsZXMpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBub3cgPSB0YXJnZXRXaW5kb3cucGVyZm9ybWFuY2Uubm93KCk7XG5cdFx0XHRpZiAodGhpcy5fdGhyb3dHZW9tZXRyeURpcnR5KSB7XG5cdFx0XHRcdGdlb21ldHJ5ID0gdGhpcy5fZ2V0VGhyb3dHZW9tZXRyeSgpO1xuXHRcdFx0XHR0aGlzLl90aHJvd0dlb21ldHJ5RGlydHkgPSBmYWxzZTtcblx0XHRcdFx0bW90aW9uID0ge1xuXHRcdFx0XHRcdC4uLm1vdGlvbixcblx0XHRcdFx0XHRsZWZ0OiBnZXRDaGF0UGV0SG9yaXpvbnRhbFBvc2l0aW9uKG1vdGlvbi5sZWZ0LCBnZW9tZXRyeS5ib3VuZHMubWluaW11bUxlZnQsIGdlb21ldHJ5LmJvdW5kcy5tYXhpbXVtTGVmdCksXG5cdFx0XHRcdH07XG5cdFx0XHRcdHRoaXMuX3NldFRocm93UG9zaXRpb24obW90aW9uLmxlZnQsIG1vdGlvbi50b3ApO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHNob3VsZFNldHRsZUNoYXRQZXRUaHJvdyhzdGFydFRpbWUsIG5vdywgbW90aW9uLnRvcCwgbW90aW9uLnksIGdlb21ldHJ5LmZsb29yVG9wKSkge1xuXHRcdFx0XHR0aGlzLl9maW5pc2hUaHJvdygpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRpZiAod2FsbEltcGFjdCkge1xuXHRcdFx0XHRpZiAobm93IDwgd2FsbEltcGFjdC5lbmRzQXQpIHtcblx0XHRcdFx0XHRzY2hlZHVsZUZyYW1lKCk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0bW90aW9uID0ge1xuXHRcdFx0XHRcdC4uLm1vdGlvbixcblx0XHRcdFx0XHR4OiAtbW90aW9uLnggKiBUSFJPV19XQUxMX1JFU1RJVFVUSU9OLFxuXHRcdFx0XHRcdHk6IC1USFJPV19XQUxMX1JFQk9VTkRfVkVMT0NJVFksXG5cdFx0XHRcdH07XG5cdFx0XHRcdHJvdGF0aW9uID0gd2FsbEltcGFjdC53YWxsID09PSAnbGVmdCcgPyAtOTAgOiA5MDtcblx0XHRcdFx0d2FsbEltcGFjdCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0bGFzdEZyYW1lVGltZSA9IG5vdztcblx0XHRcdFx0dGhpcy5fdHJhbnNpZW50U3RhdGUuc2V0KCdmYWxsaW5nJywgdW5kZWZpbmVkKTtcblx0XHRcdFx0c2NoZWR1bGVGcmFtZSgpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGVsYXBzZWQgPSBNYXRoLm1pbihUSFJPV19NQVhfRlJBTUVfRFVSQVRJT04sIE1hdGgubWF4KDAsIG5vdyAtIGxhc3RGcmFtZVRpbWUpKTtcblx0XHRcdGxhc3RGcmFtZVRpbWUgPSBub3c7XG5cdFx0XHRjb25zdCBwcmV2aW91c0xlZnQgPSBtb3Rpb24ubGVmdDtcblx0XHRcdGNvbnN0IHByZXZpb3VzVG9wID0gbW90aW9uLnRvcDtcblx0XHRcdGNvbnN0IHN0ZXAgPSBhZHZhbmNlQ2hhdFBldFRocm93KG1vdGlvbiwgZWxhcHNlZCwgZ2VvbWV0cnkuYm91bmRzKTtcblx0XHRcdG1vdGlvbiA9IHN0ZXA7XG5cdFx0XHRyb3RhdGlvbiArPSAobW90aW9uLmxlZnQgLSBwcmV2aW91c0xlZnQpICogVEhST1dfUk9UQVRJT05fUEVSX1BJWEVMO1xuXHRcdFx0dGhpcy5fc2V0VGhyb3dQb3NpdGlvbihtb3Rpb24ubGVmdCwgbW90aW9uLnRvcCk7XG5cblx0XHRcdGNvbnN0IGxhbmRpbmcgPSBnZXRDaGF0UGV0VGhyb3dMYW5kaW5nKHByZXZpb3VzTGVmdCwgcHJldmlvdXNUb3AsIG1vdGlvbi5sZWZ0LCBtb3Rpb24udG9wLCBnZW9tZXRyeS5kaXNwbGF5U2l6ZSwgZ2VvbWV0cnkuZGlzcGxheVNpemUsIGdlb21ldHJ5LnBsYXRmb3JtTGVmdCwgZ2VvbWV0cnkucGxhdGZvcm1SaWdodCwgZ2VvbWV0cnkucGxhdGZvcm1Ub3AsIGdlb21ldHJ5LmZsb29yVG9wKTtcblx0XHRcdGlmIChtb3Rpb24ueSA+PSAwICYmIGxhbmRpbmcpIHtcblx0XHRcdFx0bW90aW9uID0ge1xuXHRcdFx0XHRcdC4uLm1vdGlvbixcblx0XHRcdFx0XHRsZWZ0OiBsYW5kaW5nLmxlZnQsXG5cdFx0XHRcdFx0dG9wOiBsYW5kaW5nLnRvcCxcblx0XHRcdFx0fTtcblx0XHRcdFx0dGhpcy5fc2V0VGhyb3dQb3NpdGlvbihtb3Rpb24ubGVmdCwgbW90aW9uLnRvcCk7XG5cdFx0XHRcdHRoaXMuX2ZpbmlzaFRocm93KHRydWUsIGxhbmRpbmcpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGlmIChzdGVwLndhbGwpIHtcblx0XHRcdFx0dGhpcy5fdGhyb3dXYWxsSW1wYWN0ID0gc3RlcC53YWxsO1xuXHRcdFx0XHR3YWxsSW1wYWN0ID0geyB3YWxsOiBzdGVwLndhbGwsIGVuZHNBdDogbm93ICsgVEhST1dfV0FMTF9JTVBBQ1RfRFVSQVRJT04gfTtcblx0XHRcdFx0dGhpcy5fc2V0RmFjaW5nRGlyZWN0aW9uKHN0ZXAud2FsbCk7XG5cdFx0XHRcdHJvdGF0aW9uID0gc3RlcC53YWxsID09PSAnbGVmdCcgPyAtOTAgOiA5MDtcblx0XHRcdFx0dGhpcy5fYnV0dG9uLmVsZW1lbnQuc3R5bGUudHJhbnNmb3JtID0gYHJvdGF0ZSgke3JvdGF0aW9ufWRlZylgO1xuXHRcdFx0XHR0aGlzLl90cmFuc2llbnRTdGF0ZS5zZXQoJ3dhbGxJbXBhY3QnLCB1bmRlZmluZWQpO1xuXHRcdFx0XHRzY2hlZHVsZUZyYW1lKCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5fYnV0dG9uLmVsZW1lbnQuc3R5bGUudHJhbnNmb3JtID0gYHJvdGF0ZSgke3JvdGF0aW9ufWRlZylgO1xuXHRcdFx0c2NoZWR1bGVGcmFtZSgpO1xuXHRcdH07XG5cblx0XHR0aGlzLl90aHJvd0FuaW1hdGlvbi52YWx1ZSA9IGFuaW1hdGlvbkRpc3Bvc2FibGVzO1xuXHRcdHNjaGVkdWxlRnJhbWUoKTtcblx0fVxuXG5cdHByaXZhdGUgX3NldFRocm93UG9zaXRpb24obGVmdDogbnVtYmVyLCB0b3A6IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMuX2J1dHRvbi5lbGVtZW50LnN0eWxlLmxlZnQgPSBgJHtsZWZ0fXB4YDtcblx0XHR0aGlzLl9idXR0b24uZWxlbWVudC5zdHlsZS50b3AgPSBgJHt0b3B9cHhgO1xuXHRcdHRoaXMuX2J1dHRvbi5lbGVtZW50LnN0eWxlLnJpZ2h0ID0gJ2F1dG8nO1xuXHRcdHRoaXMuX2J1dHRvbi5lbGVtZW50LnN0eWxlLmJvdHRvbSA9ICdhdXRvJztcblx0XHR0aGlzLl9oYXNDdXN0b21Qb3NpdGlvbiA9IHRydWU7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRUaHJvd1NldHRsZVRhcmdldCgpOiB7IHJlYWRvbmx5IHRvcDogbnVtYmVyOyByZWFkb25seSBsYW5kc09uUGxhdGZvcm06IHRydWUgfSB7XG5cdFx0Y29uc3QgZ2VvbWV0cnkgPSB0aGlzLl9nZXRUaHJvd0dlb21ldHJ5KCk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHRvcDogZ2VvbWV0cnkucGxhdGZvcm1Ub3AgLSBnZW9tZXRyeS5kaXNwbGF5U2l6ZSxcblx0XHRcdGxhbmRzT25QbGF0Zm9ybTogdHJ1ZSxcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBfZmluaXNoVGhyb3coYW5ub3VuY2UgPSB0cnVlLCB0YXJnZXQ/OiB7IHJlYWRvbmx5IHRvcDogbnVtYmVyOyByZWFkb25seSBsYW5kc09uUGxhdGZvcm06IGJvb2xlYW4gfSk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fYnV0dG9uLmVsZW1lbnQuY2xhc3NMaXN0LmNvbnRhaW5zKCd0aHJvd2luZycpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVzb2x2ZWRUYXJnZXQgPSB0YXJnZXQgPz8gdGhpcy5fZ2V0VGhyb3dTZXR0bGVUYXJnZXQoKTtcblx0XHRjb25zdCB3YWxsSW1wYWN0ID0gdGhpcy5fdGhyb3dXYWxsSW1wYWN0O1xuXHRcdHRoaXMuX3Rocm93V2FsbEltcGFjdCA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl90aHJvd0dlb21ldHJ5RGlydHkgPSBmYWxzZTtcblx0XHR0aGlzLl90aHJvd0FuaW1hdGlvbi5jbGVhcigpO1xuXHRcdHRoaXMuX2J1dHRvbi5lbGVtZW50LnN0eWxlLnRyYW5zZm9ybSA9ICcnO1xuXHRcdHRoaXMuX2J1dHRvbi5lbGVtZW50LnN0eWxlLnRvcCA9IGAke3Jlc29sdmVkVGFyZ2V0LnRvcH1weGA7XG5cdFx0dGhpcy5fYnV0dG9uLmVsZW1lbnQuY2xhc3NMaXN0LnJlbW92ZSgndGhyb3dpbmcnKTtcblx0XHR0aGlzLl9mYWxsTGFuZHNPblBsYXRmb3JtID0gcmVzb2x2ZWRUYXJnZXQubGFuZHNPblBsYXRmb3JtO1xuXHRcdHRoaXMuX2NvbXBsZXRlRmFsbChhbm5vdW5jZSwgd2FsbEltcGFjdCk7XG5cdH1cblxuXHRwcml2YXRlIF9pc0FpcmJvcm5lKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9idXR0b24uZWxlbWVudC5jbGFzc0xpc3QuY29udGFpbnMoJ2ZhbGxpbmcnKSB8fCB0aGlzLl9idXR0b24uZWxlbWVudC5jbGFzc0xpc3QuY29udGFpbnMoJ3Rocm93aW5nJyk7XG5cdH1cblxuXHRwcml2YXRlIF9iZWdpbkZhbGwoKTogdm9pZCB7XG5cdFx0Y29uc3QgdG9wID0gTnVtYmVyLnBhcnNlRmxvYXQodGhpcy5fYnV0dG9uLmVsZW1lbnQuc3R5bGUudG9wKTtcblx0XHRjb25zdCB0YXJnZXQgPSB0aGlzLl9nZXRGYWxsVGFyZ2V0KCk7XG5cdFx0dGhpcy5fdHJhbnNpZW50U2NoZWR1bGVyLmNhbmNlbCgpO1xuXHRcdHRoaXMuX3Rocm93QW5pbWF0aW9uLmNsZWFyKCk7XG5cdFx0dGhpcy5fdGhyb3dXYWxsSW1wYWN0ID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX3Rocm93R2VvbWV0cnlEaXJ0eSA9IGZhbHNlO1xuXHRcdHRoaXMuX2J1dHRvbi5lbGVtZW50LnN0eWxlLnRyYW5zZm9ybSA9ICcnO1xuXHRcdHRoaXMuX2J1dHRvbi5lbGVtZW50LmNsYXNzTGlzdC5yZW1vdmUoJ3Rocm93aW5nJyk7XG5cdFx0dGhpcy5fYnV0dG9uLmVsZW1lbnQuY2xhc3NMaXN0LnJlbW92ZSgncmVzaXN0aW5nJywgJ3NvZnQtcmVzaXN0aW5nJyk7XG5cdFx0dGhpcy5fZmFsbExhbmRzT25QbGF0Zm9ybSA9IHRhcmdldC5sYW5kc09uUGxhdGZvcm07XG5cdFx0dGhpcy5fdHJhbnNpZW50U3RhdGUuc2V0KCdmYWxsaW5nJywgdW5kZWZpbmVkKTtcblx0XHR0aGlzLl9pc0RyYWdnaW5nLnNldChmYWxzZSwgdW5kZWZpbmVkKTtcblx0XHR0aGlzLl9yZW5kZXJTdGF0ZSgnZmFsbGluZycsIHRydWUpO1xuXHRcdHRoaXMuX2J1dHRvbi5lbGVtZW50LnN0eWxlLnRyYW5zaXRpb25EdXJhdGlvbiA9IGAke2dldENoYXRQZXRGYWxsRHVyYXRpb24odGFyZ2V0LnRvcCAtIHRvcCl9bXNgO1xuXHRcdHRoaXMuX2J1dHRvbi5lbGVtZW50LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuXHRcdHRoaXMuX2J1dHRvbi5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2ZhbGxpbmcnKTtcblx0XHR0aGlzLl9idXR0b24uZWxlbWVudC5zdHlsZS50b3AgPSBgJHt0YXJnZXQudG9wfXB4YDtcblx0XHRpZiAodGhpcy5fbW90aW9uUmVkdWNlZCB8fCBNYXRoLmFicyh0YXJnZXQudG9wIC0gdG9wKSA8PSBQT1NJVElPTl9FUFNJTE9OKSB7XG5cdFx0XHR0aGlzLl9maW5pc2hGYWxsKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZmluaXNoRmFsbChhbm5vdW5jZSA9IHRydWUpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2J1dHRvbi5lbGVtZW50LmNsYXNzTGlzdC5jb250YWlucygnZmFsbGluZycpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2J1dHRvbi5lbGVtZW50LmNsYXNzTGlzdC5yZW1vdmUoJ2ZhbGxpbmcnKTtcblx0XHR0aGlzLl9idXR0b24uZWxlbWVudC5zdHlsZS50cmFuc2l0aW9uRHVyYXRpb24gPSAnJztcblx0XHR0aGlzLl9jb21wbGV0ZUZhbGwoYW5ub3VuY2UpO1xuXHR9XG5cblx0cHJpdmF0ZSBfY29tcGxldGVGYWxsKGFubm91bmNlOiBib29sZWFuLCB3YWxsSW1wYWN0PzogQ2hhdFBldFdhbGwpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fZmFsbExhbmRzT25QbGF0Zm9ybSkge1xuXHRcdFx0Y29uc3QgcmVzcGF3bmVkID0gdGhpcy5fcmVzcGF3blBoYXNlID09PSAnZmFsbGluZyc7XG5cdFx0XHR0aGlzLl9yZXNwYXduUGhhc2UgPSAnbm9uZSc7XG5cdFx0XHR0aGlzLl9yZXNwYXduUG9zaXRpb24gPSB1bmRlZmluZWQ7XG5cdFx0XHRjb25zdCBsZWZ0ID0gdGhpcy5fZ2V0Q3VycmVudExlZnQoKTtcblx0XHRcdHRoaXMuX3NldFBsYXRmb3JtUG9zaXRpb24obGVmdCk7XG5cdFx0XHRpZiAoYW5ub3VuY2UpIHtcblx0XHRcdFx0dGhpcy5fc2hvd1RyYW5zaWVudFN0YXRlKCdzcGxhdCcpO1xuXHRcdFx0XHRpZiAocmVzcGF3bmVkKSB7XG5cdFx0XHRcdFx0c3RhdHVzKGxvY2FsaXplKCdjaGF0UGV0LnJlc3Bhd25lZCcsIFwiVGhlIFZTIENvZGUgcGV0IHJlc3Bhd25lZFwiKSk7XG5cdFx0XHRcdH0gZWxzZSBpZiAod2FsbEltcGFjdCA9PT0gJ2xlZnQnKSB7XG5cdFx0XHRcdFx0c3RhdHVzKGxvY2FsaXplKCdjaGF0UGV0LmJvdW5jZWRPZmZMZWZ0V2FsbCcsIFwiVGhlIFZTIENvZGUgcGV0IGJvdW5jZWQgb2ZmIHRoZSBsZWZ0IHdhbGwgYW5kIGxhbmRlZCBvbiB0aGUgY2hhdCBpbnB1dFwiKSk7XG5cdFx0XHRcdH0gZWxzZSBpZiAod2FsbEltcGFjdCA9PT0gJ3JpZ2h0Jykge1xuXHRcdFx0XHRcdHN0YXR1cyhsb2NhbGl6ZSgnY2hhdFBldC5ib3VuY2VkT2ZmUmlnaHRXYWxsJywgXCJUaGUgVlMgQ29kZSBwZXQgYm91bmNlZCBvZmYgdGhlIHJpZ2h0IHdhbGwgYW5kIGxhbmRlZCBvbiB0aGUgY2hhdCBpbnB1dFwiKSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0c3RhdHVzKGxvY2FsaXplKCdjaGF0UGV0LmxhbmRlZCcsIFwiVGhlIFZTIENvZGUgcGV0IGxhbmRlZCBvbiB0aGUgY2hhdCBpbnB1dFwiKSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9kZWF0aFBvc2l0aW9uID0gW1xuXHRcdFx0TnVtYmVyLnBhcnNlRmxvYXQodGhpcy5fYnV0dG9uLmVsZW1lbnQuc3R5bGUubGVmdCksXG5cdFx0XHROdW1iZXIucGFyc2VGbG9hdCh0aGlzLl9idXR0b24uZWxlbWVudC5zdHlsZS50b3ApLFxuXHRcdF07XG5cdFx0dGhpcy5fcmVzcGF3blBoYXNlID0gJ25vbmUnO1xuXHRcdHRoaXMuX3Jlc3Bhd25Qb3NpdGlvbiA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9idXR0b24uZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdoaWRkZW4nKTtcblx0XHR0aGlzLl9idXR0b24uZWxlbWVudC50YWJJbmRleCA9IC0xO1xuXHRcdHRoaXMuX2lzRGVhZC5zZXQodHJ1ZSwgdW5kZWZpbmVkKTtcblx0XHRpZiAoYW5ub3VuY2UpIHtcblx0XHRcdGlmICh3YWxsSW1wYWN0ID09PSAnbGVmdCcpIHtcblx0XHRcdFx0c3RhdHVzKGxvY2FsaXplKCdjaGF0UGV0LmJvdW5jZWRPZmZMZWZ0V2FsbEFuZEZlbGwnLCBcIlRoZSBWUyBDb2RlIHBldCBib3VuY2VkIG9mZiB0aGUgbGVmdCB3YWxsLCBmZWxsIG9mZiwgYW5kIHdpbGwgcmVzcGF3biBhdXRvbWF0aWNhbGx5XCIpKTtcblx0XHRcdH0gZWxzZSBpZiAod2FsbEltcGFjdCA9PT0gJ3JpZ2h0Jykge1xuXHRcdFx0XHRzdGF0dXMobG9jYWxpemUoJ2NoYXRQZXQuYm91bmNlZE9mZlJpZ2h0V2FsbEFuZEZlbGwnLCBcIlRoZSBWUyBDb2RlIHBldCBib3VuY2VkIG9mZiB0aGUgcmlnaHQgd2FsbCwgZmVsbCBvZmYsIGFuZCB3aWxsIHJlc3Bhd24gYXV0b21hdGljYWxseVwiKSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRzdGF0dXMobG9jYWxpemUoJ2NoYXRQZXQuZmVsbE9mZicsIFwiVGhlIFZTIENvZGUgcGV0IGZlbGwgb2ZmIGFuZCB3aWxsIHJlc3Bhd24gYXV0b21hdGljYWxseVwiKSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfc2hvd0NvbnRleHRNZW51KGV2ZW50OiBNb3VzZUV2ZW50KTogdm9pZCB7XG5cdFx0dGhpcy5fY29udGV4dE1lbnVWaXNpYmxlID0gdHJ1ZTtcblx0XHRjb25zdCBvblRoZVJ1biA9IHRoaXMuY2hhdFBldFNlcnZpY2Uub25UaGVSdW4uZ2V0KCk7XG5cdFx0Y29uc3QgYWN0aW9ucyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHR0aGlzLl9jb250ZXh0TWVudUFjdGlvbnMudmFsdWUgPSBhY3Rpb25zO1xuXHRcdGNvbnN0IHN0YWJsZSA9IGFjdGlvbnMuYWRkKG5ldyBBY3Rpb24oJ2NoYXQucGV0LnZhcmlhbnQuc3RhYmxlJywgbG9jYWxpemUoJ2NoYXRQZXQudmFyaWFudC5zdGFibGUuYWN0aW9uJywgXCJTdGFibGUgQ29sb3JzXCIpLCB1bmRlZmluZWQsIHRydWUsICgpID0+IHRoaXMuY2hhdFBldFNlcnZpY2Uuc2V0VmFyaWFudCgnc3RhYmxlJykpKTtcblx0XHRzdGFibGUuY2hlY2tlZCA9IHRoaXMuY2hhdFBldFNlcnZpY2UudmFyaWFudC5nZXQoKSA9PT0gJ3N0YWJsZSc7XG5cdFx0Y29uc3QgaW5zaWRlcnMgPSBhY3Rpb25zLmFkZChuZXcgQWN0aW9uKCdjaGF0LnBldC52YXJpYW50Lmluc2lkZXJzJywgbG9jYWxpemUoJ2NoYXRQZXQudmFyaWFudC5pbnNpZGVycy5hY3Rpb24nLCBcIkluc2lkZXJzIENvbG9yc1wiKSwgdW5kZWZpbmVkLCB0cnVlLCAoKSA9PiB0aGlzLmNoYXRQZXRTZXJ2aWNlLnNldFZhcmlhbnQoJ2luc2lkZXJzJykpKTtcblx0XHRpbnNpZGVycy5jaGVja2VkID0gdGhpcy5jaGF0UGV0U2VydmljZS52YXJpYW50LmdldCgpID09PSAnaW5zaWRlcnMnO1xuXHRcdGNvbnN0IGdyb3cgPSBhY3Rpb25zLmFkZChuZXcgQWN0aW9uKCdjaGF0LnBldC5ncm93JywgbG9jYWxpemUoJ2NoYXRQZXQuZ3Jvdy5hY3Rpb24nLCBcIkdyb3dcIiksIHVuZGVmaW5lZCwgdHJ1ZSwgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2NhbGUgPSBnZXRDaGF0UGV0U2NhbGUodGhpcy5fc2NhbGUsIENIQVRfUEVUX1NDQUxFX1NURVApO1xuXHRcdFx0dGhpcy5jaGF0UGV0U2VydmljZS5zZXRTY2FsZShzY2FsZSk7XG5cdFx0XHRzdGF0dXMobG9jYWxpemUoJ2NoYXRQZXQuZ3JldycsIFwiVlMgQ29kZSBwZXQgc2l6ZTogezB9IHBlcmNlbnRcIiwgTWF0aC5yb3VuZChzY2FsZSAqIDEwMCkpKTtcblx0XHR9KSk7XG5cdFx0Y29uc3Qgc2hyaW5rID0gYWN0aW9ucy5hZGQobmV3IEFjdGlvbignY2hhdC5wZXQuc2hyaW5rJywgbG9jYWxpemUoJ2NoYXRQZXQuc2hyaW5rLmFjdGlvbicsIFwiU2hyaW5rXCIpLCB1bmRlZmluZWQsIHRoaXMuX3NjYWxlID4gQ0hBVF9QRVRfTUlOX1NDQUxFLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzY2FsZSA9IGdldENoYXRQZXRTY2FsZSh0aGlzLl9zY2FsZSwgLUNIQVRfUEVUX1NDQUxFX1NURVApO1xuXHRcdFx0dGhpcy5jaGF0UGV0U2VydmljZS5zZXRTY2FsZShzY2FsZSk7XG5cdFx0XHRzdGF0dXMobG9jYWxpemUoJ2NoYXRQZXQuc2hyYW5rJywgXCJWUyBDb2RlIHBldCBzaXplOiB7MH0gcGVyY2VudFwiLCBNYXRoLnJvdW5kKHNjYWxlICogMTAwKSkpO1xuXHRcdH0pKTtcblx0XHRjb25zdCBvblRoZVJ1bkFjdGlvbiA9IGFjdGlvbnMuYWRkKG5ldyBBY3Rpb24oXG5cdFx0XHQnY2hhdC5wZXQub25UaGVSdW4nLFxuXHRcdFx0b25UaGVSdW4gPyBsb2NhbGl6ZSgnY2hhdFBldC5jb21lQmFjay5hY3Rpb24nLCBcIkNvbWUgQmFja1wiKSA6IGxvY2FsaXplKCdjaGF0UGV0LmdvT25UaGVSdW4uYWN0aW9uJywgXCJHbyBvbiB0aGUgUnVuXCIpLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0dHJ1ZSxcblx0XHRcdCgpID0+IHtcblx0XHRcdFx0dGhpcy5fdHJhbnNpZW50U3RhdGUuc2V0KHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcblx0XHRcdFx0dGhpcy5jaGF0UGV0U2VydmljZS5zZXRPblRoZVJ1bighb25UaGVSdW4pO1xuXHRcdFx0fVxuXHRcdCkpO1xuXHRcdGNvbnN0IGludGVyYWN0aW9uU2VwYXJhdG9yID0gbmV3IFNlcGFyYXRvcigpO1xuXHRcdGNvbnN0IGFwcGVhcmFuY2VTZXBhcmF0b3IgPSBuZXcgU2VwYXJhdG9yKCk7XG5cdFx0dGhpcy5jb250ZXh0TWVudVNlcnZpY2Uuc2hvd0NvbnRleHRNZW51KHtcblx0XHRcdGdldEFuY2hvcjogKCkgPT4gbmV3IFN0YW5kYXJkTW91c2VFdmVudChkb20uZ2V0V2luZG93KHRoaXMuX2J1dHRvbi5lbGVtZW50KSwgZXZlbnQpLFxuXHRcdFx0Z2V0QWN0aW9uczogKCk6IElBY3Rpb25bXSA9PiBbXG5cdFx0XHRcdG9uVGhlUnVuQWN0aW9uLFxuXHRcdFx0XHRpbnRlcmFjdGlvblNlcGFyYXRvcixcblx0XHRcdFx0Z3Jvdyxcblx0XHRcdFx0c2hyaW5rLFxuXHRcdFx0XHRhcHBlYXJhbmNlU2VwYXJhdG9yLFxuXHRcdFx0XHRzdGFibGUsXG5cdFx0XHRcdGluc2lkZXJzLFxuXHRcdFx0XSxcblx0XHRcdG9uSGlkZTogKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9jb250ZXh0TWVudVZpc2libGUgPSBmYWxzZTtcblx0XHRcdFx0aWYgKHRoaXMuX2NvbnRleHRNZW51QWN0aW9ucy52YWx1ZSA9PT0gYWN0aW9ucykge1xuXHRcdFx0XHRcdHRoaXMuX2NvbnRleHRNZW51QWN0aW9ucy5jbGVhcigpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfb25LZXlEb3duKGV2ZW50OiBLZXlib2FyZEV2ZW50KTogdm9pZCB7XG5cdFx0Y29uc3QgaGFzUG9pbnRlckludGVyYWN0aW9uID0gdGhpcy5faXNEcmFnZ2luZy5nZXQoKSB8fCB0aGlzLl9kcmFnTW9uaXRvci5pc01vbml0b3JpbmcoKTtcblx0XHRpZiAoIWlzQ2hhdFBldEtleWJvYXJkSW50ZXJhY3Rpb25FbmFibGVkKHRoaXMuX2VuYWJsZWQsIHRoaXMuX2lzRGVhZC5nZXQoKSwgaGFzUG9pbnRlckludGVyYWN0aW9uLCB0aGlzLl9pc0FpcmJvcm5lKCksIHRoaXMuY2hhdFBldFNlcnZpY2Uub25UaGVSdW4uZ2V0KCkpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGtleWJvYXJkRXZlbnQgPSBuZXcgU3RhbmRhcmRLZXlib2FyZEV2ZW50KGV2ZW50KTtcblx0XHRsZXQgZGlyZWN0aW9uID0gMDtcblx0XHRsZXQgdGhyb3dSZXF1ZXN0ZWQgPSBmYWxzZTtcblx0XHRpZiAoa2V5Ym9hcmRFdmVudC5lcXVhbHMoS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5MZWZ0QXJyb3cpKSB7XG5cdFx0XHRkaXJlY3Rpb24gPSAtMTtcblx0XHRcdHRocm93UmVxdWVzdGVkID0gdHJ1ZTtcblx0XHR9IGVsc2UgaWYgKGtleWJvYXJkRXZlbnQuZXF1YWxzKEtleU1vZC5TaGlmdCB8IEtleUNvZGUuUmlnaHRBcnJvdykpIHtcblx0XHRcdGRpcmVjdGlvbiA9IDE7XG5cdFx0XHR0aHJvd1JlcXVlc3RlZCA9IHRydWU7XG5cdFx0fSBlbHNlIGlmIChrZXlib2FyZEV2ZW50LmVxdWFscyhLZXlDb2RlLkxlZnRBcnJvdykpIHtcblx0XHRcdGRpcmVjdGlvbiA9IC0xO1xuXHRcdH0gZWxzZSBpZiAoa2V5Ym9hcmRFdmVudC5lcXVhbHMoS2V5Q29kZS5SaWdodEFycm93KSkge1xuXHRcdFx0ZGlyZWN0aW9uID0gMTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX3dha2UoKTtcblx0XHRrZXlib2FyZEV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG5cdFx0a2V5Ym9hcmRFdmVudC5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRjb25zdCBmYWNpbmdEaXJlY3Rpb24gPSBkaXJlY3Rpb24gPCAwID8gJ2xlZnQnIDogJ3JpZ2h0Jztcblx0XHRpZiAodGhpcy5fdHJhbnNpZW50U3RhdGUuZ2V0KCkgPT09ICdkaXp6eScgfHwgdGhpcy5fcmVjb3JkRGlyZWN0aW9uQ2hhbmdlKGZhY2luZ0RpcmVjdGlvbikpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fc2V0RmFjaW5nRGlyZWN0aW9uKGZhY2luZ0RpcmVjdGlvbik7XG5cdFx0aWYgKHRocm93UmVxdWVzdGVkICYmICF0aGlzLl9tb3Rpb25SZWR1Y2VkKSB7XG5cdFx0XHR0aGlzLl9iZWdpblRocm93KHtcblx0XHRcdFx0eDogZGlyZWN0aW9uICogVEhST1dfS0VZQk9BUkRfSE9SSVpPTlRBTF9WRUxPQ0lUWSxcblx0XHRcdFx0eTogLVRIUk9XX01JTl9VUFdBUkRfVkVMT0NJVFksXG5cdFx0XHR9KTtcblx0XHRcdHN0YXR1cyhkaXJlY3Rpb24gPCAwXG5cdFx0XHRcdD8gbG9jYWxpemUoJ2NoYXRQZXQudGhyb3duTGVmdCcsIFwiVGhlIFZTIENvZGUgcGV0IHdhcyB0aHJvd24gdG93YXJkIHRoZSBsZWZ0IHdhbGxcIilcblx0XHRcdFx0OiBsb2NhbGl6ZSgnY2hhdFBldC50aHJvd25SaWdodCcsIFwiVGhlIFZTIENvZGUgcGV0IHdhcyB0aHJvd24gdG93YXJkIHRoZSByaWdodCB3YWxsXCIpKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5faG9wQ29udHJvbGxlci5yZXF1ZXN0KGRpcmVjdGlvbiwgdGhpcy5fbW90aW9uUmVkdWNlZCk7XG5cdFx0c3RhdHVzKGRpcmVjdGlvbiA8IDBcblx0XHRcdD8gbG9jYWxpemUoJ2NoYXRQZXQubW92ZWRMZWZ0JywgXCJWUyBDb2RlIHBldCBtb3ZlZCBsZWZ0XCIpXG5cdFx0XHQ6IGxvY2FsaXplKCdjaGF0UGV0Lm1vdmVkUmlnaHQnLCBcIlZTIENvZGUgcGV0IG1vdmVkIHJpZ2h0XCIpKTtcblx0fVxuXG5cdHByaXZhdGUgX2dldEFyaWFMYWJlbChvblRoZVJ1bjogYm9vbGVhbik6IHN0cmluZyB7XG5cdFx0cmV0dXJuIG9uVGhlUnVuXG5cdFx0XHQ/IGxvY2FsaXplKCdjaGF0UGV0LnJlc3RvcmUnLCBcIkJyaW5nIGJhY2sgdGhlIFZTIENvZGUgcGV0XCIpXG5cdFx0XHQ6IGxvY2FsaXplKCdjaGF0UGV0LmludGVyYWN0JywgXCJJbnRlcmFjdCB3aXRoIHRoZSBWUyBDb2RlIHBldC4gRHJhZyBpdCBhcm91bmQgdGhlIGNoYXQsIG9yIGZsaWNrIGl0IHRvd2FyZCBlaXRoZXIgc2lkZSB0byB0aHJvdyBpdC4gVXNlIHRoZSBsZWZ0IGFuZCByaWdodCBhcnJvdyBrZXlzIHRvIG1ha2UgaXQgaG9wLCBvciBob2xkIFNoaWZ0IHRvIHRocm93IGl0IHRvd2FyZCBhIHdhbGwuIFVzZSB0aGUgY29udGV4dCBtZW51IHRvIHB1dCBpdCBvbiB0aGUgcnVuLlwiKTtcblx0fVxuXG5cdHByaXZhdGUgX2dldEN1cnJlbnRMZWZ0KCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuX2J1dHRvbi5lbGVtZW50Lm9mZnNldExlZnQ7XG5cdH1cblxuXHRwcml2YXRlIF9nZXREaXNwbGF5U2l6ZSgpOiBudW1iZXIge1xuXHRcdHJldHVybiBDSEFUX1BFVF9TT1VSQ0VfU0laRSAvIDIgKiB0aGlzLl9zY2FsZTtcblx0fVxuXG5cdHByaXZhdGUgX3NldFNjYWxlKHNjYWxlOiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLl9zY2FsZSA9IHNjYWxlO1xuXHRcdGNvbnN0IGRpc3BsYXlTaXplID0gdGhpcy5fZ2V0RGlzcGxheVNpemUoKTtcblx0XHR0aGlzLl9idXR0b24uZWxlbWVudC5zdHlsZS53aWR0aCA9IGAke2Rpc3BsYXlTaXplfXB4YDtcblx0XHR0aGlzLl9idXR0b24uZWxlbWVudC5zdHlsZS5oZWlnaHQgPSBgJHtkaXNwbGF5U2l6ZX1weGA7XG5cdFx0dGhpcy5fdmlzdWFsLnN0eWxlLnRyYW5zZm9ybSA9IGBzY2FsZSgke3NjYWxlfSlgO1xuXHRcdGlmICh0aGlzLl9idXR0b24uZWxlbWVudC5jbGFzc0xpc3QuY29udGFpbnMoJ3Rocm93aW5nJykpIHtcblx0XHRcdHRoaXMuX3Rocm93R2VvbWV0cnlEaXJ0eSA9IHRydWU7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9pc0RlYWQuZ2V0KCkgfHwgdGhpcy5faXNEcmFnZ2luZy5nZXQoKSB8fCB0aGlzLl9pc0FpcmJvcm5lKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX2ZhbGxMYW5kc09uUGxhdGZvcm0pIHtcblx0XHRcdGlmICh0aGlzLl9oYXNDdXN0b21Qb3NpdGlvbikge1xuXHRcdFx0XHR0aGlzLl9zZXRQbGF0Zm9ybVBvc2l0aW9uKHRoaXMuX2dldEN1cnJlbnRMZWZ0KCkpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fc2V0RGVmYXVsdFBsYXRmb3JtUG9zaXRpb24oKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fdXBkYXRlVmVydGljYWxQb3NpdGlvbigpO1xuXHRcdFx0aWYgKHRoaXMuX2hhc0N1c3RvbVBvc2l0aW9uKSB7XG5cdFx0XHRcdHRoaXMuX3NldEhvcml6b250YWxQb3NpdGlvbih0aGlzLl9nZXRDdXJyZW50TGVmdCgpKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX3NldERlZmF1bHRIb3Jpem9udGFsUG9zaXRpb24oKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9zZXRIb3Jpem9udGFsUG9zaXRpb24obGVmdDogbnVtYmVyKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgcGFyZW50Qm91bmRzID0gdGhpcy5fb3ZlcmxheS5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcblx0XHRjb25zdCBib3VuZHMgPSB0aGlzLmRyYWdCb3VuZHMuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG5cdFx0Y29uc3QgbWluaW11bUxlZnQgPSBib3VuZHMubGVmdCAtIHBhcmVudEJvdW5kcy5sZWZ0O1xuXHRcdGNvbnN0IG1heGltdW1MZWZ0ID0gYm91bmRzLnJpZ2h0IC0gcGFyZW50Qm91bmRzLmxlZnQgLSB0aGlzLl9nZXREaXNwbGF5U2l6ZSgpO1xuXHRcdGNvbnN0IGNsYW1wZWRMZWZ0ID0gZ2V0Q2hhdFBldEhvcml6b250YWxQb3NpdGlvbihsZWZ0LCBtaW5pbXVtTGVmdCwgbWF4aW11bUxlZnQpO1xuXHRcdHRoaXMuX2J1dHRvbi5lbGVtZW50LnN0eWxlLmxlZnQgPSBgJHtjbGFtcGVkTGVmdH1weGA7XG5cdFx0dGhpcy5fYnV0dG9uLmVsZW1lbnQuc3R5bGUucmlnaHQgPSAnYXV0byc7XG5cdFx0dGhpcy5faGFzQ3VzdG9tUG9zaXRpb24gPSB0cnVlO1xuXHRcdHRoaXMuX3VwZGF0ZVNwZWVjaEJ1YmJsZVBvc2l0aW9uKCk7XG5cdFx0cmV0dXJuIGNsYW1wZWRMZWZ0ICE9PSBsZWZ0O1xuXHR9XG5cblx0cHJpdmF0ZSBfc2V0RGVmYXVsdEhvcml6b250YWxQb3NpdGlvbigpOiB2b2lkIHtcblx0XHRjb25zdCBvdmVybGF5Qm91bmRzID0gdGhpcy5fb3ZlcmxheS5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcblx0XHRjb25zdCBpbnB1dEJvdW5kcyA9IHRoaXMuZHJhZ0JvdW5kcy5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcblx0XHRjb25zdCBtaW5pbXVtTGVmdCA9IGlucHV0Qm91bmRzLmxlZnQgLSBvdmVybGF5Qm91bmRzLmxlZnQ7XG5cdFx0Y29uc3QgbWF4aW11bUxlZnQgPSBpbnB1dEJvdW5kcy5yaWdodCAtIG92ZXJsYXlCb3VuZHMubGVmdCAtIHRoaXMuX2dldERpc3BsYXlTaXplKCk7XG5cdFx0dGhpcy5fYnV0dG9uLmVsZW1lbnQuc3R5bGUubGVmdCA9IGAke2dldENoYXRQZXREZWZhdWx0SG9yaXpvbnRhbFBvc2l0aW9uKG1pbmltdW1MZWZ0LCBtYXhpbXVtTGVmdCl9cHhgO1xuXHRcdHRoaXMuX2J1dHRvbi5lbGVtZW50LnN0eWxlLnJpZ2h0ID0gJ2F1dG8nO1xuXHRcdHRoaXMuX2hhc0N1c3RvbVBvc2l0aW9uID0gZmFsc2U7XG5cdFx0dGhpcy5fdXBkYXRlU3BlZWNoQnViYmxlUG9zaXRpb24oKTtcblx0fVxuXG5cdHByaXZhdGUgX2dldFBsYXRmb3JtQm91bmRzKCk6IHsgcmVhZG9ubHkgbGVmdDogbnVtYmVyOyByZWFkb25seSByaWdodDogbnVtYmVyOyByZWFkb25seSB0b3A6IG51bWJlciB9IHtcblx0XHRjb25zdCBob3N0Qm91bmRzID0gdGhpcy5fb3ZlcmxheS5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcblx0XHRjb25zdCBpbnB1dEJvdW5kcyA9IHRoaXMuZHJhZ0JvdW5kcy5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0bGVmdDogaW5wdXRCb3VuZHMubGVmdCxcblx0XHRcdHJpZ2h0OiBpbnB1dEJvdW5kcy5yaWdodCxcblx0XHRcdHRvcDogZ2V0Q2hhdFBldFBsYXRmb3JtVG9wKGhvc3RCb3VuZHMudG9wLCBpbnB1dEJvdW5kcy50b3AsIHRoaXMuX3BsYXRmb3JtVG9wUHJvdmlkZXI/LigpKSxcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlVmVydGljYWxQb3NpdGlvbigpOiB2b2lkIHtcblx0XHRjb25zdCBvdmVybGF5Qm91bmRzID0gdGhpcy5fb3ZlcmxheS5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcblx0XHRjb25zdCBwbGF0Zm9ybVRvcCA9IHRoaXMuX2dldFBsYXRmb3JtQm91bmRzKCkudG9wO1xuXHRcdHRoaXMuX2J1dHRvbi5lbGVtZW50LnN0eWxlLmJvdHRvbSA9IGBjYWxjKDEwMCUgLSAke3BsYXRmb3JtVG9wIC0gb3ZlcmxheUJvdW5kcy50b3B9cHgpYDtcblx0fVxuXG5cdHByaXZhdGUgX3NldFBsYXRmb3JtUG9zaXRpb24obGVmdDogbnVtYmVyKTogdm9pZCB7XG5cdFx0Y29uc3Qgb3ZlcmxheUJvdW5kcyA9IHRoaXMuX292ZXJsYXkuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG5cdFx0Y29uc3QgcGxhdGZvcm1Cb3VuZHMgPSB0aGlzLl9nZXRQbGF0Zm9ybUJvdW5kcygpO1xuXHRcdHRoaXMuX2J1dHRvbi5lbGVtZW50LnN0eWxlLnRvcCA9IGAke3BsYXRmb3JtQm91bmRzLnRvcCAtIG92ZXJsYXlCb3VuZHMudG9wIC0gdGhpcy5fZ2V0RGlzcGxheVNpemUoKX1weGA7XG5cdFx0dGhpcy5fYnV0dG9uLmVsZW1lbnQuc3R5bGUuYm90dG9tID0gJ2F1dG8nO1xuXHRcdHRoaXMuX3NldEhvcml6b250YWxQb3NpdGlvbihsZWZ0KTtcblx0fVxuXG5cdHByaXZhdGUgX3NldERlZmF1bHRQbGF0Zm9ybVBvc2l0aW9uKCk6IHZvaWQge1xuXHRcdGNvbnN0IG92ZXJsYXlCb3VuZHMgPSB0aGlzLl9vdmVybGF5LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuXHRcdGNvbnN0IHBsYXRmb3JtQm91bmRzID0gdGhpcy5fZ2V0UGxhdGZvcm1Cb3VuZHMoKTtcblx0XHR0aGlzLl9idXR0b24uZWxlbWVudC5zdHlsZS50b3AgPSBgJHtwbGF0Zm9ybUJvdW5kcy50b3AgLSBvdmVybGF5Qm91bmRzLnRvcCAtIHRoaXMuX2dldERpc3BsYXlTaXplKCl9cHhgO1xuXHRcdHRoaXMuX2J1dHRvbi5lbGVtZW50LnN0eWxlLmJvdHRvbSA9ICdhdXRvJztcblx0XHR0aGlzLl9zZXREZWZhdWx0SG9yaXpvbnRhbFBvc2l0aW9uKCk7XG5cdH1cblxuXHRwcml2YXRlIF9zaG93UmVzcGF3blNlcXVlbmNlKCk6IHZvaWQge1xuXHRcdHRoaXMuX2J1dHRvbi5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2hpZGRlbicpO1xuXHRcdHRoaXMuX2J1dHRvbi5lbGVtZW50LnRhYkluZGV4ID0gLTE7XG5cdFx0Y29uc3Qgc3RhcnRzRGVzcGF3bmluZyA9IHRoaXMuX3Jlc3Bhd25QaGFzZSA9PT0gJ25vbmUnO1xuXHRcdGlmIChzdGFydHNEZXNwYXduaW5nKSB7XG5cdFx0XHR0aGlzLl9yZXNwYXduUGhhc2UgPSAnZGVzcGF3bmluZyc7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9yZXNwYXduUGhhc2UgIT09ICdkZXNwYXduaW5nJyAmJiB0aGlzLl9yZXNwYXduUGhhc2UgIT09ICdyZXNwYXduaW5nJykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9yZXNwYXduRWZmZWN0LmNvbnRhaW5lci5jbGFzc0xpc3QucmVtb3ZlKCdoaWRkZW4nKTtcblx0XHR0aGlzLl91cGRhdGVSZXNwYXduRWZmZWN0UG9zaXRpb24oKTtcblx0XHR0aGlzLl9zdGFydFJlc3Bhd25FZmZlY3RBbmltYXRpb24oKTtcblx0XHRpZiAoc3RhcnRzRGVzcGF3bmluZykge1xuXHRcdFx0dGhpcy5fcmVzcGF3bkVmZmVjdFNjaGVkdWxlci5zY2hlZHVsZSh0aGlzLl9tb3Rpb25SZWR1Y2VkID8gUkVTUEFXTl9FRkZFQ1RfUkVEVUNFRF9NT1RJT05fRFVSQVRJT04gOiBSRVNQQVdOX0VGRkVDVF9EVVJBVElPTik7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlUmVzcGF3bkVmZmVjdFBvc2l0aW9uKCk6IHZvaWQge1xuXHRcdGNvbnN0IG92ZXJsYXlCb3VuZHMgPSB0aGlzLl9vdmVybGF5LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuXHRcdGNvbnN0IG1vdmVtZW50Qm91bmRzID0gdGhpcy5tb3ZlbWVudEJvdW5kcy5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcblx0XHRjb25zdCBkaXNwbGF5U2l6ZSA9IHRoaXMuX2dldERpc3BsYXlTaXplKCk7XG5cdFx0bGV0IGxlZnQ6IG51bWJlcjtcblx0XHRsZXQgdG9wOiBudW1iZXI7XG5cdFx0aWYgKHRoaXMuX3Jlc3Bhd25QaGFzZSA9PT0gJ2Rlc3Bhd25pbmcnKSB7XG5cdFx0XHRpZiAoIXRoaXMuX2RlYXRoUG9zaXRpb24pIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgbWluaW11bUxlZnQgPSBtb3ZlbWVudEJvdW5kcy5sZWZ0IC0gb3ZlcmxheUJvdW5kcy5sZWZ0O1xuXHRcdFx0Y29uc3QgbWF4aW11bUxlZnQgPSBtb3ZlbWVudEJvdW5kcy5yaWdodCAtIG92ZXJsYXlCb3VuZHMubGVmdCAtIGRpc3BsYXlTaXplO1xuXHRcdFx0Y29uc3QgbWluaW11bVRvcCA9IG1vdmVtZW50Qm91bmRzLnRvcCAtIG92ZXJsYXlCb3VuZHMudG9wO1xuXHRcdFx0Y29uc3QgbWF4aW11bVRvcCA9IG1vdmVtZW50Qm91bmRzLmJvdHRvbSAtIG92ZXJsYXlCb3VuZHMudG9wIC0gZGlzcGxheVNpemU7XG5cdFx0XHRbbGVmdCwgdG9wXSA9IGdldENoYXRQZXREcmFnUG9zaXRpb24odGhpcy5fZGVhdGhQb3NpdGlvblswXSwgdGhpcy5fZGVhdGhQb3NpdGlvblsxXSwgbWluaW11bUxlZnQsIG1heGltdW1MZWZ0LCBtaW5pbXVtVG9wLCBtYXhpbXVtVG9wKTtcblx0XHRcdHRoaXMuX2RlYXRoUG9zaXRpb24gPSBbbGVmdCwgdG9wXTtcblx0XHR9IGVsc2UgaWYgKHRoaXMuX3Jlc3Bhd25QaGFzZSA9PT0gJ3Jlc3Bhd25pbmcnKSB7XG5cdFx0XHRjb25zdCBpbnB1dEJvdW5kcyA9IHRoaXMuZHJhZ0JvdW5kcy5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcblx0XHRcdGNvbnN0IG1pbmltdW1MZWZ0ID0gaW5wdXRCb3VuZHMubGVmdCAtIG92ZXJsYXlCb3VuZHMubGVmdDtcblx0XHRcdGNvbnN0IG1heGltdW1MZWZ0ID0gaW5wdXRCb3VuZHMucmlnaHQgLSBvdmVybGF5Qm91bmRzLmxlZnQgLSBkaXNwbGF5U2l6ZTtcblx0XHRcdGxlZnQgPSBnZXRDaGF0UGV0RGVmYXVsdEhvcml6b250YWxQb3NpdGlvbihtaW5pbXVtTGVmdCwgbWF4aW11bUxlZnQpO1xuXHRcdFx0dG9wID0gbW92ZW1lbnRCb3VuZHMudG9wIC0gb3ZlcmxheUJvdW5kcy50b3A7XG5cdFx0XHR0aGlzLl9yZXNwYXduUG9zaXRpb24gPSBbbGVmdCwgdG9wXTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9yZXNwYXduRWZmZWN0LmNvbnRhaW5lci5zdHlsZS5sZWZ0ID0gYCR7bGVmdH1weGA7XG5cdFx0dGhpcy5fcmVzcGF3bkVmZmVjdC5jb250YWluZXIuc3R5bGUudG9wID0gYCR7dG9wfXB4YDtcblx0fVxuXG5cdHByaXZhdGUgX3Nob3dSZXNwYXduRWZmZWN0KCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fZW5hYmxlZCB8fCAhdGhpcy5faXNEZWFkLmdldCgpIHx8IHRoaXMuX3Jlc3Bhd25QaGFzZSAhPT0gJ2Rlc3Bhd25pbmcnKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX3Jlc3Bhd25QaGFzZSA9ICdyZXNwYXduaW5nJztcblx0XHR0aGlzLl9yZXNwYXduQW5pbWF0aW9uLmNsZWFyKCk7XG5cdFx0dGhpcy5fdXBkYXRlUmVzcGF3bkVmZmVjdFBvc2l0aW9uKCk7XG5cdFx0dGhpcy5fc3RhcnRSZXNwYXduRWZmZWN0QW5pbWF0aW9uKCk7XG5cdFx0dGhpcy5fcmVzcGF3bkZhbGxTY2hlZHVsZXIuc2NoZWR1bGUodGhpcy5fbW90aW9uUmVkdWNlZCA/IFJFU1BBV05fRUZGRUNUX1JFRFVDRURfTU9USU9OX0RVUkFUSU9OIDogUkVTUEFXTl9FRkZFQ1RfRFVSQVRJT04pO1xuXHRcdHN0YXR1cyhsb2NhbGl6ZSgnY2hhdFBldC5yZXNwYXduaW5nJywgXCJUaGUgVlMgQ29kZSBwZXQgaXMgcmVzcGF3bmluZ1wiKSk7XG5cdH1cblxuXHRwcml2YXRlIF9zdGFydFJlc3Bhd25FZmZlY3RBbmltYXRpb24oKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3Jlc3Bhd25QaGFzZSAhPT0gJ2Rlc3Bhd25pbmcnICYmIHRoaXMuX3Jlc3Bhd25QaGFzZSAhPT0gJ3Jlc3Bhd25pbmcnKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHNvdXJjZXMgPSBnZXRSZXNwYXduU3ByaXRlU291cmNlcyh0aGlzLl92YXJpYW50KTtcblx0XHRjb25zdCBzb3VyY2UgPSB0aGlzLl9tb3Rpb25SZWR1Y2VkID8gc291cmNlcy5yZWR1Y2VkTW90aW9uIDogc291cmNlcy5hbmltYXRlZDtcblx0XHRpZiAoIWlzQ2hhdFBldEltYWdlU291cmNlKHRoaXMuX3Jlc3Bhd25FZmZlY3QuaW1hZ2UsIHNvdXJjZS51cmwpKSB7XG5cdFx0XHR0aGlzLl9yZXNwYXduQW5pbWF0aW9uLmNsZWFyKCk7XG5cdFx0XHR0aGlzLl9yZXNwYXduRWZmZWN0LmltYWdlLnJlbW92ZUF0dHJpYnV0ZSgnc3JjJyk7XG5cdFx0XHR0aGlzLl9yZXNwYXduRWZmZWN0LmltYWdlLnNyYyA9IHNvdXJjZS51cmw7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9yZXNwYXduRWZmZWN0LmltYWdlLmNvbXBsZXRlICYmIHRoaXMuX3Jlc3Bhd25FZmZlY3QuaW1hZ2UubmF0dXJhbFdpZHRoID4gMCkge1xuXHRcdFx0dGhpcy5fcmVzcGF3bkFuaW1hdGlvbi5jbGVhcigpO1xuXHRcdFx0dGhpcy5fc3RhcnRTcHJpdGVBbmltYXRpb24oc291cmNlLCB0aGlzLl9yZXNwYXduRWZmZWN0LCB0aGlzLl9yZXNwYXduQW5pbWF0aW9uLCB1bmRlZmluZWQsIHRoaXMuX3Jlc3Bhd25QaGFzZSA9PT0gJ2Rlc3Bhd25pbmcnKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9iZWdpblJlc3Bhd25GYWxsKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fZW5hYmxlZCB8fCAhdGhpcy5faXNEZWFkLmdldCgpIHx8IHRoaXMuX3Jlc3Bhd25QaGFzZSAhPT0gJ3Jlc3Bhd25pbmcnKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX3Jlc3Bhd25QaGFzZSA9ICdmYWxsaW5nJztcblx0XHR0aGlzLl9yZXNwYXduQW5pbWF0aW9uLmNsZWFyKCk7XG5cdFx0dGhpcy5fcmVzcGF3bkVmZmVjdC5jb250YWluZXIuY2xhc3NMaXN0LmFkZCgnaGlkZGVuJyk7XG5cdFx0dGhpcy5fZGVhdGhQb3NpdGlvbiA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9mYWxsTGFuZHNPblBsYXRmb3JtID0gdHJ1ZTtcblx0XHR0aGlzLl90cmFuc2llbnRTdGF0ZS5zZXQoJ2ZhbGxpbmcnLCB1bmRlZmluZWQpO1xuXHRcdHRoaXMuX2J1dHRvbi5lbGVtZW50LmNsYXNzTGlzdC5yZW1vdmUoJ2ZhbGxpbmcnLCAndGhyb3dpbmcnLCAnZHJhZ2dpbmcnLCAncmVzaXN0aW5nJywgJ3NvZnQtcmVzaXN0aW5nJyk7XG5cdFx0dGhpcy5fYnV0dG9uLmVsZW1lbnQuc3R5bGUudHJhbnNmb3JtID0gJyc7XG5cdFx0dGhpcy5fYnV0dG9uLmVsZW1lbnQuY2xhc3NMaXN0LnJlbW92ZSgnaGlkZGVuJyk7XG5cdFx0dGhpcy5fYnV0dG9uLmVsZW1lbnQudGFiSW5kZXggPSAwO1xuXHRcdGlmICghdGhpcy5fcmVzcGF3blBvc2l0aW9uKSB7XG5cdFx0XHR0aGlzLl91cGRhdGVSZXNwYXduRWZmZWN0UG9zaXRpb24oKTtcblx0XHR9XG5cdFx0Y29uc3QgW3NwYXduTGVmdCwgc3Bhd25Ub3BdID0gdGhpcy5fcmVzcGF3blBvc2l0aW9uID8/IFt0aGlzLl9nZXRDdXJyZW50TGVmdCgpLCAwXTtcblx0XHR0aGlzLl9idXR0b24uZWxlbWVudC5zdHlsZS5sZWZ0ID0gYCR7c3Bhd25MZWZ0fXB4YDtcblx0XHR0aGlzLl9idXR0b24uZWxlbWVudC5zdHlsZS5yaWdodCA9ICdhdXRvJztcblx0XHR0aGlzLl9oYXNDdXN0b21Qb3NpdGlvbiA9IGZhbHNlO1xuXHRcdGNvbnN0IG92ZXJsYXlCb3VuZHMgPSB0aGlzLl9vdmVybGF5LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuXHRcdGNvbnN0IHBsYXRmb3JtQm91bmRzID0gdGhpcy5fZ2V0UGxhdGZvcm1Cb3VuZHMoKTtcblx0XHRjb25zdCBzdGFydFRvcCA9IHNwYXduVG9wO1xuXHRcdGNvbnN0IHRhcmdldFRvcCA9IHBsYXRmb3JtQm91bmRzLnRvcCAtIG92ZXJsYXlCb3VuZHMudG9wIC0gdGhpcy5fZ2V0RGlzcGxheVNpemUoKTtcblx0XHR0aGlzLl9idXR0b24uZWxlbWVudC5zdHlsZS50b3AgPSBgJHtzdGFydFRvcH1weGA7XG5cdFx0dGhpcy5fYnV0dG9uLmVsZW1lbnQuc3R5bGUuYm90dG9tID0gJ2F1dG8nO1xuXHRcdHRoaXMuX2J1dHRvbi5lbGVtZW50LnN0eWxlLnRyYW5zaXRpb25EdXJhdGlvbiA9IGAke2dldENoYXRQZXRGYWxsRHVyYXRpb24odGFyZ2V0VG9wIC0gc3RhcnRUb3ApfW1zYDtcblx0XHR0aGlzLl9yZW5kZXJTdGF0ZSgnZmFsbGluZycsIHRydWUpO1xuXHRcdHRoaXMuX2lzRGVhZC5zZXQoZmFsc2UsIHVuZGVmaW5lZCk7XG5cdFx0dGhpcy5fYnV0dG9uLmVsZW1lbnQuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG5cdFx0dGhpcy5fYnV0dG9uLmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnZmFsbGluZycpO1xuXHRcdHRoaXMuX2J1dHRvbi5lbGVtZW50LnN0eWxlLnRvcCA9IGAke3RhcmdldFRvcH1weGA7XG5cdFx0aWYgKHRoaXMuX21vdGlvblJlZHVjZWQgfHwgc3RhcnRUb3AgPT09IHRhcmdldFRvcCkge1xuXHRcdFx0dGhpcy5fZmluaXNoRmFsbCgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZVNwZWVjaEJ1YmJsZVBvc2l0aW9uKCk6IHZvaWQge1xuXHRcdGNvbnN0IGJ1dHRvbkJvdW5kcyA9IHRoaXMuX2J1dHRvbi5lbGVtZW50LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuXHRcdGNvbnN0IGlucHV0Qm91bmRzID0gdGhpcy5kcmFnQm91bmRzLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuXHRcdHRoaXMuX2J1dHRvbi5lbGVtZW50LmNsYXNzTGlzdC50b2dnbGUoJ3NwZWVjaC1idWJibGUtbGVmdCcsIHNob3VsZFBsYWNlQ2hhdFBldFNwZWVjaEJ1YmJsZUxlZnQodGhpcy5fcmVuZGVyZWRTdGF0ZSwgYnV0dG9uQm91bmRzLnJpZ2h0LCBpbnB1dEJvdW5kcy5yaWdodCwgdGhpcy5fc2NhbGUpKTtcblx0XHRjb25zdCB3aWRlU3ByaXRlT2Zmc2V0ID0gZ2V0Q2hhdFBldFdpZGVTcHJpdGVIb3Jpem9udGFsT2Zmc2V0KHRoaXMuX3JlbmRlcmVkU3RhdGUsIHRoaXMuX2ZhY2luZ0NvbnRyb2xsZXIuZGlyZWN0aW9uLCBidXR0b25Cb3VuZHMubGVmdCwgYnV0dG9uQm91bmRzLnJpZ2h0LCBpbnB1dEJvdW5kcy5sZWZ0LCBpbnB1dEJvdW5kcy5yaWdodCwgdGhpcy5fc2NhbGUpO1xuXHRcdGlmICh0aGlzLl9hY3RpdmVTcHJpdGUpIHtcblx0XHRcdHRoaXMuX2FjdGl2ZVNwcml0ZS5jb250YWluZXIuc3R5bGUudHJhbnNmb3JtID0gd2lkZVNwcml0ZU9mZnNldCA9PT0gMCA/ICcnIDogYHRyYW5zbGF0ZVgoJHt3aWRlU3ByaXRlT2Zmc2V0fXB4KWA7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlR2F6ZSgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2N1cnNvclBvc2l0aW9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgYm91bmRzID0gdGhpcy5fYnV0dG9uLmVsZW1lbnQuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG5cdFx0Y29uc3QgZmFjaW5nRGlyZWN0aW9uID0gdGhpcy5fZmFjaW5nQ29udHJvbGxlci51cGRhdGUodGhpcy5fY3Vyc29yUG9zaXRpb25bMF0sIGJvdW5kcy5sZWZ0ICsgYm91bmRzLndpZHRoIC8gMik7XG5cdFx0aWYgKHRoaXMuX2J1dHRvbi5lbGVtZW50LmRhdGFzZXQuZmFjaW5nICE9PSBmYWNpbmdEaXJlY3Rpb24pIHtcblx0XHRcdHRoaXMuX2J1dHRvbi5lbGVtZW50LmRhdGFzZXQuZmFjaW5nID0gZmFjaW5nRGlyZWN0aW9uO1xuXHRcdFx0dGhpcy5fcmVjb3JkRGlyZWN0aW9uQ2hhbmdlKGZhY2luZ0RpcmVjdGlvbik7XG5cdFx0fVxuXHRcdGNvbnN0IFt4LCB5XSA9IGdldENoYXRQZXRHYXplRGlyZWN0aW9uKFxuXHRcdFx0dGhpcy5fY3Vyc29yUG9zaXRpb25bMF0sXG5cdFx0XHR0aGlzLl9jdXJzb3JQb3NpdGlvblsxXSxcblx0XHRcdGJvdW5kcy5sZWZ0ICsgYm91bmRzLndpZHRoIC8gMixcblx0XHRcdGJvdW5kcy50b3AgKyBib3VuZHMuaGVpZ2h0IC8gMixcblx0XHQpO1xuXHRcdGZvciAoY29uc3QgcHVwaWwgb2YgdGhpcy5fcHVwaWxzKSB7XG5cdFx0XHRwdXBpbC5zdHlsZS50cmFuc2Zvcm0gPSBgdHJhbnNsYXRlKCR7eCAqIDJ9cHgsICR7eSAqIDJ9cHgpYDtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9zbmFwRmFjaW5nVG9DdXJzb3IoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9jdXJzb3JQb3NpdGlvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGJvdW5kcyA9IHRoaXMuX2J1dHRvbi5lbGVtZW50LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuXHRcdHRoaXMuX3NldEZhY2luZ0RpcmVjdGlvbih0aGlzLl9mYWNpbmdDb250cm9sbGVyLnNuYXBUb0N1cnNvcih0aGlzLl9jdXJzb3JQb3NpdGlvblswXSwgYm91bmRzLmxlZnQgKyBib3VuZHMud2lkdGggLyAyKSk7XG5cdH1cblxuXHRwcml2YXRlIF9zZXRGYWNpbmdEaXJlY3Rpb24oZGlyZWN0aW9uOiBDaGF0UGV0RmFjaW5nRGlyZWN0aW9uKTogdm9pZCB7XG5cdFx0dGhpcy5fZmFjaW5nQ29udHJvbGxlci5zZXREaXJlY3Rpb24oZGlyZWN0aW9uKTtcblx0XHR0aGlzLl9idXR0b24uZWxlbWVudC5kYXRhc2V0LmZhY2luZyA9IGRpcmVjdGlvbjtcblx0fVxuXG5cdHByaXZhdGUgX3JlY29yZERpcmVjdGlvbkNoYW5nZShkaXJlY3Rpb246IENoYXRQZXRGYWNpbmdEaXJlY3Rpb24pOiBib29sZWFuIHtcblx0XHRpZiAoIXRoaXMuX2VuYWJsZWQgfHwgdGhpcy5faXNEZWFkLmdldCgpIHx8IHRoaXMuY2hhdFBldFNlcnZpY2Uub25UaGVSdW4uZ2V0KCkgfHwgdGhpcy5fdHJhbnNpZW50U3RhdGUuZ2V0KCkgPT09ICdkaXp6eScpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0aWYgKCF0aGlzLl9kaXJlY3Rpb25DaGFuZ2VDb250cm9sbGVyLnJlY29yZChkaXJlY3Rpb24sIGRvbS5nZXRXaW5kb3codGhpcy5fYnV0dG9uLmVsZW1lbnQpLnBlcmZvcm1hbmNlLm5vdygpKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdHRoaXMuX3NldEZhY2luZ0RpcmVjdGlvbihkaXJlY3Rpb24pO1xuXHRcdHRoaXMuX3Nob3dUcmFuc2llbnRTdGF0ZSgnZGl6enknLCBmYWxzZSk7XG5cdFx0c3RhdHVzKGxvY2FsaXplKCdjaGF0UGV0LmRpenp5JywgXCJUaGUgVlMgQ29kZSBwZXQgZ290IGRpenp5XCIpKTtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHByaXZhdGUgX3N0YXJ0RW5hYmxlQW5pbWF0aW9uKCk6IHZvaWQge1xuXHRcdHRoaXMuX2J1dHRvbi5lbGVtZW50LmNsYXNzTGlzdC5yZW1vdmUoJ2hpZGRlbicsICdleGl0aW5nJywgJ2VudGVyaW5nJyk7XG5cdFx0dGhpcy5fYnV0dG9uLmVsZW1lbnQudGFiSW5kZXggPSAwO1xuXHRcdHRoaXMuX3Jlc3RvcmVIb3Jpem9udGFsUG9zaXRpb24oKTtcblx0XHR0aGlzLl9idXR0b24uZWxlbWVudC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcblx0XHR0aGlzLl9nYXplU2NoZWR1bGVyLnNjaGVkdWxlKCk7XG5cdFx0aWYgKCF0aGlzLl9tb3Rpb25SZWR1Y2VkKSB7XG5cdFx0XHR0aGlzLl9idXR0b24uZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdlbnRlcmluZycpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3Jlc3RvcmVIb3Jpem9udGFsUG9zaXRpb24oKTogdm9pZCB7XG5cdFx0Y29uc3Qgb3ZlcmxheUJvdW5kcyA9IHRoaXMuX292ZXJsYXkuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG5cdFx0Y29uc3QgaW5wdXRCb3VuZHMgPSB0aGlzLmRyYWdCb3VuZHMuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG5cdFx0Y29uc3QgbWluaW11bUxlZnQgPSBpbnB1dEJvdW5kcy5sZWZ0IC0gb3ZlcmxheUJvdW5kcy5sZWZ0O1xuXHRcdGNvbnN0IG1heGltdW1MZWZ0ID0gaW5wdXRCb3VuZHMucmlnaHQgLSBvdmVybGF5Qm91bmRzLmxlZnQgLSB0aGlzLl9nZXREaXNwbGF5U2l6ZSgpO1xuXHRcdGNvbnN0IHByZXZpb3VzTGVmdCA9IHRoaXMuX2hhc0N1c3RvbVBvc2l0aW9uID8gdGhpcy5fZ2V0Q3VycmVudExlZnQoKSA6IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9idXR0b24uZWxlbWVudC5zdHlsZS5sZWZ0ID0gYCR7Z2V0Q2hhdFBldFJlc3RvcmVkSG9yaXpvbnRhbFBvc2l0aW9uKHByZXZpb3VzTGVmdCwgbWluaW11bUxlZnQsIG1heGltdW1MZWZ0KX1weGA7XG5cdFx0dGhpcy5fYnV0dG9uLmVsZW1lbnQuc3R5bGUucmlnaHQgPSAnYXV0byc7XG5cdFx0dGhpcy5fdXBkYXRlU3BlZWNoQnViYmxlUG9zaXRpb24oKTtcblx0fVxuXG5cdHByaXZhdGUgX3N0YXJ0RGlzYWJsZUFuaW1hdGlvbigpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fYnV0dG9uLmVsZW1lbnQuY2xhc3NMaXN0LmNvbnRhaW5zKCd0aHJvd2luZycpKSB7XG5cdFx0XHR0aGlzLl9maW5pc2hUaHJvdyhmYWxzZSk7XG5cdFx0fVxuXHRcdHRoaXMuX2J1dHRvbi5lbGVtZW50LnRhYkluZGV4ID0gLTE7XG5cdFx0dGhpcy5fYnV0dG9uLmVsZW1lbnQuY2xhc3NMaXN0LnJlbW92ZSgnZW50ZXJpbmcnKTtcblx0XHRpZiAodGhpcy5fbW90aW9uUmVkdWNlZCB8fCB0aGlzLl9idXR0b24uZWxlbWVudC5jbGFzc0xpc3QuY29udGFpbnMoJ2hpZGRlbicpKSB7XG5cdFx0XHR0aGlzLl9maW5pc2hEaXNhYmxlKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2J1dHRvbi5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2V4aXRpbmcnKTtcblx0fVxuXG5cdHByaXZhdGUgX2ZpbmlzaERpc2FibGUoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2J1dHRvbi5lbGVtZW50LmNsYXNzTGlzdC5jb250YWlucygndGhyb3dpbmcnKSkge1xuXHRcdFx0dGhpcy5fZmluaXNoVGhyb3coZmFsc2UpO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fYnV0dG9uLmVsZW1lbnQuY2xhc3NMaXN0LmNvbnRhaW5zKCdmYWxsaW5nJykpIHtcblx0XHRcdHRoaXMuX2ZpbmlzaEZhbGwoZmFsc2UpO1xuXHRcdH1cblx0XHR0aGlzLl9ob3BDb250cm9sbGVyLmNhbmNlbCgpO1xuXHRcdGlmICh0aGlzLl9pc0RyYWdnaW5nLmdldCgpKSB7XG5cdFx0XHR0aGlzLl9pc0RyYWdnaW5nLnNldChmYWxzZSwgdW5kZWZpbmVkKTtcblx0XHR9XG5cdFx0dGhpcy5fdGhyb3dBbmltYXRpb24uY2xlYXIoKTtcblx0XHR0aGlzLl90aHJvd0dlb21ldHJ5RGlydHkgPSBmYWxzZTtcblx0XHR0aGlzLl9idXR0b24uZWxlbWVudC5zdHlsZS50cmFuc2Zvcm0gPSAnJztcblx0XHR0aGlzLl9idXR0b24uZWxlbWVudC5jbGFzc0xpc3QucmVtb3ZlKCdlbnRlcmluZycsICdleGl0aW5nJywgJ2ZhbGxpbmcnLCAndGhyb3dpbmcnLCAnZHJhZ2dpbmcnLCAncmVzaXN0aW5nJywgJ3NvZnQtcmVzaXN0aW5nJyk7XG5cdFx0dGhpcy5fYnV0dG9uLmVsZW1lbnQuc3R5bGUudHJhbnNpdGlvbkR1cmF0aW9uID0gJyc7XG5cdFx0dGhpcy5fYnV0dG9uLmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnaGlkZGVuJyk7XG5cdFx0dGhpcy5fcmVzcGF3bkVmZmVjdFNjaGVkdWxlci5jYW5jZWwoKTtcblx0XHR0aGlzLl9yZXNwYXduRmFsbFNjaGVkdWxlci5jYW5jZWwoKTtcblx0XHR0aGlzLl9yZXNwYXduQW5pbWF0aW9uLmNsZWFyKCk7XG5cdFx0dGhpcy5fcmVzcGF3bkVmZmVjdC5jb250YWluZXIuY2xhc3NMaXN0LmFkZCgnaGlkZGVuJyk7XG5cdFx0dGhpcy5fcmVzcGF3blBoYXNlID0gJ25vbmUnO1xuXHRcdHRoaXMuX3Jlc3Bhd25Qb3NpdGlvbiA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9zcHJpdGVBbmltYXRpb24uY2xlYXIoKTtcblx0XHR0aGlzLl9zcGVlY2hBbmltYXRpb24uY2xlYXIoKTtcblx0XHR0aGlzLl9zcGVlY2hCdWJibGUuY29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ2hpZGRlbicpO1xuXHRcdHRoaXMuX3NwZWVjaEJ1YmJsZS5pbWFnZS5yZW1vdmVBdHRyaWJ1dGUoJ3NyYycpO1xuXHRcdHRoaXMuX3BlbmRpbmdTcHJpdGUgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fcGVuZGluZ1NvdXJjZSA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9wZW5kaW5nU3RhdGUgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fYWN0aXZlU3ByaXRlID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX3JlbmRlcmVkU3RhdGUgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fZGlyZWN0aW9uQ2hhbmdlQ29udHJvbGxlci5yZXNldCgpO1xuXHRcdGZvciAoY29uc3Qgc3ByaXRlIG9mIHRoaXMuX3Nwcml0ZXMpIHtcblx0XHRcdHNwcml0ZS5jb250YWluZXIuY2xhc3NMaXN0LmFkZCgnaGlkZGVuJyk7XG5cdFx0XHRzcHJpdGUuaW1hZ2UucmVtb3ZlQXR0cmlidXRlKCdzcmMnKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9zaG93VHJhbnNpZW50U3RhdGUoc3RhdGU6IENoYXRQZXRTdGF0ZSwgc25hcEZhY2luZ1RvQ3Vyc29yID0gdHJ1ZSk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5jaGF0UGV0U2VydmljZS5lbmFibGVkLmdldCgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHNuYXBGYWNpbmdUb0N1cnNvcikge1xuXHRcdFx0dGhpcy5fc25hcEZhY2luZ1RvQ3Vyc29yKCk7XG5cdFx0fVxuXHRcdHRoaXMuX3dha2UoKTtcblx0XHRjb25zdCByZW5kZXJlZFN0YXRlID0gc3RhdGUgPT09ICd5YXBwaW5nJyAmJiB0aGlzLl9tb3Rpb25SZWR1Y2VkID8gJ3lhcHBpbmdNb3V0aE9wZW4nIDogc3RhdGU7XG5cdFx0dGhpcy5fdHJhbnNpZW50U3RhdGUuc2V0KHJlbmRlcmVkU3RhdGUsIHVuZGVmaW5lZCk7XG5cdFx0aWYgKHJlbmRlcmVkU3RhdGUgPT09ICd5YXBwaW5nTW91dGhPcGVuJyB8fCByZW5kZXJlZFN0YXRlID09PSAneWFwcGluZycpIHtcblx0XHRcdHRoaXMuX3RyYW5zaWVudFNjaGVkdWxlci5jYW5jZWwoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fdHJhbnNpZW50U2NoZWR1bGVyLnNjaGVkdWxlKGdldFRyYW5zaWVudFN0YXRlRHVyYXRpb24ocmVuZGVyZWRTdGF0ZSkpO1xuXHRcdH1cblx0XHRpZiAoIXRoaXMuX2lzRHJhZ2dpbmcuZ2V0KCkgJiYgdGhpcy5fdHJhbnNpZW50U3RhdGUuZ2V0KCkgPT09IHJlbmRlcmVkU3RhdGUpIHtcblx0XHRcdHRoaXMuX3JlbmRlclN0YXRlKHJlbmRlcmVkU3RhdGUsIHRydWUpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3RyeVNlYXJjaCgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2VuYWJsZWQgfHwgIXRoaXMuY2hhdFBldFNlcnZpY2Uub25UaGVSdW4uZ2V0KCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX21vdGlvblJlZHVjZWQpIHtcblx0XHRcdHRoaXMuX3NlYXJjaFNjaGVkdWxlci5zY2hlZHVsZSgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl90cmFuc2llbnRTdGF0ZS5zZXQoJ3NlYXJjaGluZycsIHVuZGVmaW5lZCk7XG5cdFx0dGhpcy5fcmVuZGVyU3RhdGUoJ3NlYXJjaGluZycsIHRydWUpO1xuXHRcdHRoaXMuX3NlYXJjaFNjaGVkdWxlci5zY2hlZHVsZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfd2FrZSgpOiB2b2lkIHtcblx0XHRjb25zdCB3YXNTbGVlcGluZyA9IHRoaXMuX2lkbGVFeHBpcmVkLmdldCgpIHx8IHRoaXMuX3JlbmRlcmVkU3RhdGUgPT09ICdzbGVlcCc7XG5cdFx0dGhpcy5faWRsZUV4cGlyZWQuc2V0KGZhbHNlLCB1bmRlZmluZWQpO1xuXHRcdGlmICh0aGlzLl9idXN5KSB7XG5cdFx0XHR0aGlzLl9pZGxlU2NoZWR1bGVyLmNhbmNlbCgpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9pZGxlU2NoZWR1bGVyLnNjaGVkdWxlKCk7XG5cdFx0fVxuXHRcdGlmICh3YXNTbGVlcGluZykge1xuXHRcdFx0dGhpcy5fYmVnaW5XYWtlQW5pbWF0aW9uKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfYmVnaW5XYWtlQW5pbWF0aW9uKCk6IENoYXRQZXRTdGF0ZSB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHRoaXMuX21vdGlvblJlZHVjZWQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0dGhpcy5fdHJhbnNpZW50U3RhdGUuc2V0KCd3YWtpbmcnLCB1bmRlZmluZWQpO1xuXHRcdHRoaXMuX3RyYW5zaWVudFNjaGVkdWxlci5zY2hlZHVsZShXQUtFX1NUQVRFX0RVUkFUSU9OKTtcblx0XHRyZXR1cm4gJ3dha2luZyc7XG5cdH1cblxuXHRwcml2YXRlIF9yZW5kZXJTdGF0ZShzdGF0ZTogQ2hhdFBldFN0YXRlLCByZXN0YXJ0ID0gZmFsc2UsIHVzZVN0YXRpY1Nwcml0ZSA9IGZhbHNlKTogdm9pZCB7XG5cdFx0aWYgKHN0YXRlICE9PSAnaWRsZScgfHwgdXNlU3RhdGljU3ByaXRlKSB7XG5cdFx0XHR0aGlzLl9mYWNpbmdDb250cm9sbGVyLnNldFN0YXRlKHN0YXRlLCB1c2VTdGF0aWNTcHJpdGUpO1xuXHRcdH1cblx0XHRjb25zdCBzb3VyY2VzID0gZ2V0U3ByaXRlU291cmNlcyh0aGlzLl92YXJpYW50KVtzdGF0ZV07XG5cdFx0Y29uc3Qgc291cmNlID0gdGhpcy5fbW90aW9uUmVkdWNlZCB8fCB1c2VTdGF0aWNTcHJpdGUgPyBzb3VyY2VzLnJlZHVjZWRNb3Rpb24gOiBzb3VyY2VzLmFuaW1hdGVkO1xuXHRcdGlmICghcmVzdGFydCAmJiB0aGlzLl9hY3RpdmVTcHJpdGUgJiYgaXNDaGF0UGV0SW1hZ2VTb3VyY2UodGhpcy5fYWN0aXZlU3ByaXRlLmltYWdlLCBzb3VyY2UudXJsKSkge1xuXHRcdFx0dGhpcy5fcGVuZGluZ1Nwcml0ZSA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMuX3BlbmRpbmdTb3VyY2UgPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLl9wZW5kaW5nU3RhdGUgPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLl9idXR0b24uZWxlbWVudC5kYXRhc2V0LnN0YXRlID0gc3RhdGU7XG5cdFx0XHR0aGlzLl9yZW5kZXJlZFN0YXRlID0gc3RhdGU7XG5cdFx0XHR0aGlzLl9zZXRSZW5kZXJlZEZhY2luZ1N0YXRlKHN0YXRlLCB1c2VTdGF0aWNTcHJpdGUpO1xuXHRcdFx0dGhpcy5fdXBkYXRlRXllcyhzdGF0ZSk7XG5cdFx0XHR0aGlzLl91cGRhdGVTcGVlY2hCdWJibGUoc3RhdGUsIHJlc3RhcnQpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNwcml0ZSA9IHRoaXMuX3Nwcml0ZXMuZmluZChjYW5kaWRhdGUgPT4gY2FuZGlkYXRlICE9PSB0aGlzLl9hY3RpdmVTcHJpdGUpO1xuXHRcdGlmICghc3ByaXRlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fcGVuZGluZ1Nwcml0ZSA9IHNwcml0ZTtcblx0XHR0aGlzLl9wZW5kaW5nU291cmNlID0gc291cmNlO1xuXHRcdHRoaXMuX3BlbmRpbmdTdGF0ZSA9IHN0YXRlO1xuXHRcdHNwcml0ZS5pbWFnZS5yZW1vdmVBdHRyaWJ1dGUoJ3NyYycpO1xuXHRcdHNwcml0ZS5pbWFnZS5zcmMgPSBzb3VyY2UudXJsO1xuXHR9XG5cblx0cHJpdmF0ZSBfb25JbWFnZUxvYWQoc3ByaXRlOiBDaGF0UGV0U3ByaXRlRWxlbWVudCk6IHZvaWQge1xuXHRcdGlmIChzcHJpdGUgIT09IHRoaXMuX3BlbmRpbmdTcHJpdGUgfHwgdGhpcy5fcGVuZGluZ1NvdXJjZSA9PT0gdW5kZWZpbmVkIHx8ICFpc0NoYXRQZXRJbWFnZVNvdXJjZShzcHJpdGUuaW1hZ2UsIHRoaXMuX3BlbmRpbmdTb3VyY2UudXJsKSB8fCB0aGlzLl9wZW5kaW5nU3RhdGUgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX3Nwcml0ZUFuaW1hdGlvbi5jbGVhcigpO1xuXHRcdHRoaXMuX2FjdGl2ZVNwcml0ZT8uY29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ2hpZGRlbicpO1xuXHRcdHNwcml0ZS5jb250YWluZXIuY2xhc3NMaXN0LnJlbW92ZSgnaGlkZGVuJyk7XG5cdFx0dGhpcy5fYWN0aXZlU3ByaXRlID0gc3ByaXRlO1xuXHRcdGNvbnN0IHN0YXRlID0gdGhpcy5fcGVuZGluZ1N0YXRlO1xuXHRcdHRoaXMuX3N0YXJ0U3ByaXRlQW5pbWF0aW9uKFxuXHRcdFx0dGhpcy5fcGVuZGluZ1NvdXJjZSxcblx0XHRcdHNwcml0ZSxcblx0XHRcdHRoaXMuX3Nwcml0ZUFuaW1hdGlvbixcblx0XHRcdCgpID0+IHRoaXMuX29uU3ByaXRlQW5pbWF0aW9uQ29tcGxldGUoc3ByaXRlLCBzdGF0ZSksXG5cdFx0XHRmYWxzZSxcblx0XHRcdGZyYW1lSW5kZXggPT4ge1xuXHRcdFx0XHRpZiAoc3ByaXRlID09PSB0aGlzLl9hY3RpdmVTcHJpdGUpIHtcblx0XHRcdFx0XHR0aGlzLl91cGRhdGVFeWVzKHN0YXRlLCBmcmFtZUluZGV4KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdCk7XG5cdFx0dGhpcy5fYnV0dG9uLmVsZW1lbnQuZGF0YXNldC5zdGF0ZSA9IHN0YXRlO1xuXHRcdHRoaXMuX3JlbmRlcmVkU3RhdGUgPSBzdGF0ZTtcblx0XHR0aGlzLl9zZXRSZW5kZXJlZEZhY2luZ1N0YXRlKHN0YXRlLCB0aGlzLl9pc0RyYWdnaW5nLmdldCgpKTtcblx0XHR0aGlzLl91cGRhdGVFeWVzKHN0YXRlKTtcblx0XHR0aGlzLl91cGRhdGVTcGVlY2hCdWJibGUoc3RhdGUsIHRydWUpO1xuXHRcdHRoaXMuX3BlbmRpbmdTcHJpdGUgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fcGVuZGluZ1NvdXJjZSA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9wZW5kaW5nU3RhdGUgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fcmVzdGFydEV5ZUFuaW1hdGlvbigpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2V0UmVuZGVyZWRGYWNpbmdTdGF0ZShzdGF0ZTogQ2hhdFBldFN0YXRlLCBpc0RyYWdnaW5nOiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy5fZmFjaW5nQ29udHJvbGxlci5zZXRTdGF0ZShzdGF0ZSwgaXNEcmFnZ2luZyk7XG5cdFx0aWYgKCFpc0RyYWdnaW5nICYmIGRvZXNDaGF0UGV0U3RhdGVUcmFja0N1cnNvcihzdGF0ZSkpIHtcblx0XHRcdHRoaXMuX2dhemVTY2hlZHVsZXIuc2NoZWR1bGUoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVFeWVzKHN0YXRlOiBDaGF0UGV0U3RhdGUsIGZyYW1lSW5kZXg/OiBudW1iZXIpOiB2b2lkIHtcblx0XHRjb25zdCBibGlua2luZyA9IGRvZXNDaGF0UGV0U3RhdGVCbGluayhzdGF0ZSwgZnJhbWVJbmRleCk7XG5cdFx0dGhpcy5fZXllcy5jbGFzc0xpc3QudG9nZ2xlKCd0cmFja2luZycsIGRvZXNDaGF0UGV0U3RhdGVUcmFja0N1cnNvcihzdGF0ZSkpO1xuXHRcdHRoaXMuX2V5ZXMuY2xhc3NMaXN0LnRvZ2dsZSgnYmxpbmtpbmcnLCBibGlua2luZyk7XG5cdFx0aWYgKGJsaW5raW5nKSB7XG5cdFx0XHRmb3IgKGNvbnN0IHB1cGlsIG9mIHRoaXMuX3B1cGlscykge1xuXHRcdFx0XHRwdXBpbC5zdHlsZS50cmFuc2Zvcm0gPSAnJztcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9vblNwcml0ZUFuaW1hdGlvbkNvbXBsZXRlKHNwcml0ZTogQ2hhdFBldFNwcml0ZUVsZW1lbnQsIHN0YXRlOiBDaGF0UGV0U3RhdGUpOiB2b2lkIHtcblx0XHRpZiAoc3ByaXRlICE9PSB0aGlzLl9hY3RpdmVTcHJpdGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKHN0YXRlID09PSAnanVtcCcpIHtcblx0XHRcdHRoaXMuX2hvcENvbnRyb2xsZXIub25BbmltYXRpb25Db21wbGV0ZSgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoc3RhdGUgIT09ICdzZWFyY2hpbmcnIHx8ICF0aGlzLmNoYXRQZXRTZXJ2aWNlLm9uVGhlUnVuLmdldCgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX3RyYW5zaWVudFN0YXRlLnNldCgnc2VhcmNoaW5nRG93bicsIHVuZGVmaW5lZCk7XG5cdFx0dGhpcy5fYnV0dG9uLmVsZW1lbnQuZGF0YXNldC5zdGF0ZSA9ICdzZWFyY2hpbmdEb3duJztcblx0XHR0aGlzLl9yZW5kZXJlZFN0YXRlID0gJ3NlYXJjaGluZ0Rvd24nO1xuXHR9XG5cblx0cHJpdmF0ZSBfc3RhcnRTcHJpdGVBbmltYXRpb24oc291cmNlOiBDaGF0UGV0U3ByaXRlU291cmNlLCBzcHJpdGU6IENoYXRQZXRTcHJpdGVFbGVtZW50LCBhbmltYXRpb25EaXNwb3NhYmxlOiBNdXRhYmxlRGlzcG9zYWJsZTxJRGlzcG9zYWJsZT4sIG9uQ29tcGxldGU/OiAoKSA9PiB2b2lkLCByZXZlcnNlID0gZmFsc2UsIG9uRnJhbWU/OiAoZnJhbWVJbmRleDogbnVtYmVyKSA9PiB2b2lkKTogdm9pZCB7XG5cdFx0Y29uc3QgeyBmcmFtZUR1cmF0aW9ucyB9ID0gc291cmNlO1xuXHRcdGNvbnN0IHsgaW1hZ2UsIGNhbnZhcyB9ID0gc3ByaXRlO1xuXHRcdGNvbnN0IGRpc3BsYXlTaXplID0gc3ByaXRlID09PSB0aGlzLl9zcGVlY2hCdWJibGUgPyA3MiA6IHNwcml0ZSA9PT0gdGhpcy5fcmVzcGF3bkVmZmVjdCA/IHRoaXMuX2dldERpc3BsYXlTaXplKCkgOiA0ODtcblx0XHRjb25zdCBmcmFtZUhlaWdodCA9IHNvdXJjZS5mcmFtZUhlaWdodCA/PyBDSEFUX1BFVF9TT1VSQ0VfU0laRTtcblx0XHRjb25zdCBkaXNwbGF5U2NhbGUgPSBkaXNwbGF5U2l6ZSAvIENIQVRfUEVUX1NPVVJDRV9TSVpFO1xuXHRcdGNvbnN0IGRpc3BsYXlXaWR0aCA9IHNvdXJjZS5mcmFtZVdpZHRoICogZGlzcGxheVNjYWxlO1xuXHRcdGNvbnN0IGRpc3BsYXlIZWlnaHQgPSBmcmFtZUhlaWdodCAqIGRpc3BsYXlTY2FsZTtcblx0XHRzcHJpdGUuY29udGFpbmVyLnN0eWxlLndpZHRoID0gYCR7ZGlzcGxheVdpZHRofXB4YDtcblx0XHRzcHJpdGUuY29udGFpbmVyLnN0eWxlLmhlaWdodCA9IGAke2Rpc3BsYXlIZWlnaHR9cHhgO1xuXHRcdGNhbnZhcy53aWR0aCA9IHNvdXJjZS5mcmFtZVdpZHRoO1xuXHRcdGNhbnZhcy5oZWlnaHQgPSBmcmFtZUhlaWdodDtcblx0XHRjYW52YXMuc3R5bGUud2lkdGggPSBgJHtkaXNwbGF5V2lkdGh9cHhgO1xuXHRcdGNhbnZhcy5zdHlsZS5oZWlnaHQgPSBgJHtkaXNwbGF5SGVpZ2h0fXB4YDtcblx0XHRjb25zdCBjb250ZXh0ID0gY2FudmFzLmdldENvbnRleHQoJzJkJyk7XG5cdFx0aWYgKCFjb250ZXh0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnRleHQuaW1hZ2VTbW9vdGhpbmdFbmFibGVkID0gZmFsc2U7XG5cdFx0Y29uc3QgZHJhd0ZyYW1lID0gKGZyYW1lSW5kZXg6IG51bWJlcikgPT4ge1xuXHRcdFx0Y29udGV4dC5jbGVhclJlY3QoMCwgMCwgc291cmNlLmZyYW1lV2lkdGgsIGZyYW1lSGVpZ2h0KTtcblx0XHRcdGNvbnN0IHNvdXJjZVggPSBmcmFtZUluZGV4ICogc291cmNlLmZyYW1lV2lkdGg7XG5cdFx0XHRpZiAoc291cmNlLmZpeGVkT3JpZW50YXRpb25EZWNvcmF0aW9ucyAhPT0gdW5kZWZpbmVkICYmIHRoaXMuX2ZhY2luZ0NvbnRyb2xsZXIuZGlyZWN0aW9uID09PSAnbGVmdCcpIHtcblx0XHRcdFx0Y29udGV4dC5jbGVhclJlY3QoMCwgMCwgc291cmNlLmZyYW1lV2lkdGgsIGZyYW1lSGVpZ2h0KTtcblx0XHRcdFx0Y29udGV4dC5zYXZlKCk7XG5cdFx0XHRcdGNvbnRleHQudHJhbnNsYXRlKHNvdXJjZS5mcmFtZVdpZHRoLCAwKTtcblx0XHRcdFx0Y29udGV4dC5zY2FsZSgtMSwgMSk7XG5cdFx0XHRcdGNvbnRleHQuZHJhd0ltYWdlKFxuXHRcdFx0XHRcdGltYWdlLFxuXHRcdFx0XHRcdHNvdXJjZVgsXG5cdFx0XHRcdFx0MCxcblx0XHRcdFx0XHRzb3VyY2UuZnJhbWVXaWR0aCxcblx0XHRcdFx0XHRmcmFtZUhlaWdodCxcblx0XHRcdFx0XHQwLFxuXHRcdFx0XHRcdDAsXG5cdFx0XHRcdFx0c291cmNlLmZyYW1lV2lkdGgsXG5cdFx0XHRcdFx0ZnJhbWVIZWlnaHRcblx0XHRcdFx0KTtcblx0XHRcdFx0Y29udGV4dC5yZXN0b3JlKCk7XG5cdFx0XHRcdGZvciAobGV0IGRlY29yYXRpb25JbmRleCA9IDA7IGRlY29yYXRpb25JbmRleCA8IHNvdXJjZS5maXhlZE9yaWVudGF0aW9uRGVjb3JhdGlvbnMubGVuZ3RoOyBkZWNvcmF0aW9uSW5kZXgrKykge1xuXHRcdFx0XHRcdGNvbnN0IGRlY29yYXRpb24gPSBzb3VyY2UuZml4ZWRPcmllbnRhdGlvbkRlY29yYXRpb25zW2RlY29yYXRpb25JbmRleF07XG5cdFx0XHRcdFx0Y29uc3QgY3VycmVudEJvdW5kcyA9IGRlY29yYXRpb24uZnJhbWVCb3VuZHNbZnJhbWVJbmRleF07XG5cdFx0XHRcdFx0Y29uc3QgY2Fub25pY2FsQm91bmRzID0gZGVjb3JhdGlvbi5mcmFtZUJvdW5kc1tkZWNvcmF0aW9uLnNvdXJjZUZyYW1lXTtcblx0XHRcdFx0XHRjb25zdCBbY3VycmVudExlZnQsIGN1cnJlbnRUb3AsIGN1cnJlbnRSaWdodCwgY3VycmVudEJvdHRvbV0gPSBjdXJyZW50Qm91bmRzO1xuXHRcdFx0XHRcdGNvbnN0IFtjYW5vbmljYWxMZWZ0LCBjYW5vbmljYWxUb3AsIGNhbm9uaWNhbFJpZ2h0LCBjYW5vbmljYWxCb3R0b21dID0gY2Fub25pY2FsQm91bmRzO1xuXHRcdFx0XHRcdGNvbnN0IGNhbm9uaWNhbFdpZHRoID0gY2Fub25pY2FsUmlnaHQgLSBjYW5vbmljYWxMZWZ0O1xuXHRcdFx0XHRcdGNvbnN0IGNhbm9uaWNhbEhlaWdodCA9IGNhbm9uaWNhbEJvdHRvbSAtIGNhbm9uaWNhbFRvcDtcblx0XHRcdFx0XHRjb250ZXh0LmNsZWFyUmVjdChzb3VyY2UuZnJhbWVXaWR0aCAtIGN1cnJlbnRSaWdodCwgY3VycmVudFRvcCwgY3VycmVudFJpZ2h0IC0gY3VycmVudExlZnQsIGN1cnJlbnRCb3R0b20gLSBjdXJyZW50VG9wKTtcblx0XHRcdFx0XHRjb250ZXh0LmRyYXdJbWFnZShcblx0XHRcdFx0XHRcdGltYWdlLFxuXHRcdFx0XHRcdFx0ZGVjb3JhdGlvbi5zb3VyY2VGcmFtZSAqIHNvdXJjZS5mcmFtZVdpZHRoICsgY2Fub25pY2FsTGVmdCxcblx0XHRcdFx0XHRcdGNhbm9uaWNhbFRvcCxcblx0XHRcdFx0XHRcdGNhbm9uaWNhbFdpZHRoLFxuXHRcdFx0XHRcdFx0Y2Fub25pY2FsSGVpZ2h0LFxuXHRcdFx0XHRcdFx0c291cmNlLmZyYW1lV2lkdGggLSBjdXJyZW50TGVmdCAtIGNhbm9uaWNhbFdpZHRoLFxuXHRcdFx0XHRcdFx0Y3VycmVudFRvcCxcblx0XHRcdFx0XHRcdGNhbm9uaWNhbFdpZHRoLFxuXHRcdFx0XHRcdFx0Y2Fub25pY2FsSGVpZ2h0XG5cdFx0XHRcdFx0KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRvbkZyYW1lPy4oZnJhbWVJbmRleCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnRleHQuZHJhd0ltYWdlKFxuXHRcdFx0XHRpbWFnZSxcblx0XHRcdFx0c291cmNlWCxcblx0XHRcdFx0MCxcblx0XHRcdFx0c291cmNlLmZyYW1lV2lkdGgsXG5cdFx0XHRcdGZyYW1lSGVpZ2h0LFxuXHRcdFx0XHQwLFxuXHRcdFx0XHQwLFxuXHRcdFx0XHRzb3VyY2UuZnJhbWVXaWR0aCxcblx0XHRcdFx0ZnJhbWVIZWlnaHRcblx0XHRcdCk7XG5cdFx0XHRvbkZyYW1lPy4oZnJhbWVJbmRleCk7XG5cdFx0fTtcblx0XHRjb25zdCBpbml0aWFsRnJhbWVJbmRleCA9IHJldmVyc2UgJiYgZnJhbWVEdXJhdGlvbnMubGVuZ3RoID4gMCA/IGZyYW1lRHVyYXRpb25zLmxlbmd0aCAtIDEgOiAwO1xuXHRcdGRyYXdGcmFtZShpbml0aWFsRnJhbWVJbmRleCk7XG5cdFx0aWYgKGZyYW1lRHVyYXRpb25zLmxlbmd0aCA8IDIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCB0YXJnZXRXaW5kb3cgPSBkb20uZ2V0V2luZG93KGNhbnZhcyk7XG5cdFx0Y29uc3Qgc3RhcnRUaW1lID0gdGFyZ2V0V2luZG93LnBlcmZvcm1hbmNlLm5vdygpO1xuXHRcdGxldCBjdXJyZW50RnJhbWUgPSAwO1xuXHRcdGxldCBmcmFtZVRpbWVyOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgYW5pbWF0aW9uRGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgY2xlYXJGcmFtZVRpbWVyID0gKCkgPT4ge1xuXHRcdFx0aWYgKGZyYW1lVGltZXIgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHR0YXJnZXRXaW5kb3cuY2xlYXJUaW1lb3V0KGZyYW1lVGltZXIpO1xuXHRcdFx0XHRmcmFtZVRpbWVyID0gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH07XG5cdFx0Y29uc3Qgc2NoZWR1bGVGcmFtZSA9IChkZWxheTogbnVtYmVyKSA9PiB7XG5cdFx0XHRjbGVhckZyYW1lVGltZXIoKTtcblx0XHRcdGlmICghdGFyZ2V0V2luZG93LmRvY3VtZW50LmhpZGRlbikge1xuXHRcdFx0XHRmcmFtZVRpbWVyID0gdGFyZ2V0V2luZG93LnNldFRpbWVvdXQodXBkYXRlRnJhbWUsIE1hdGgubWF4KDEsIE1hdGguY2VpbChkZWxheSkpKTtcblx0XHRcdH1cblx0XHR9O1xuXHRcdGNvbnN0IHVwZGF0ZUZyYW1lID0gKCkgPT4ge1xuXHRcdFx0ZnJhbWVUaW1lciA9IHVuZGVmaW5lZDtcblx0XHRcdGNvbnN0IGZyYW1lID0gZ2V0Q2hhdFBldEFuaW1hdGlvbkZyYW1lKGZyYW1lRHVyYXRpb25zLCB0YXJnZXRXaW5kb3cucGVyZm9ybWFuY2Uubm93KCkgLSBzdGFydFRpbWUsIHNvdXJjZS5pdGVyYXRpb25zLCByZXZlcnNlKTtcblx0XHRcdGlmIChmcmFtZS5jb21wbGV0ZSkge1xuXHRcdFx0XHRkcmF3RnJhbWUoZnJhbWUuZnJhbWVJbmRleCk7XG5cdFx0XHRcdGFuaW1hdGlvbkRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHRcdFx0b25Db21wbGV0ZT8uKCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGlmIChmcmFtZS5mcmFtZUluZGV4ICE9PSBjdXJyZW50RnJhbWUpIHtcblx0XHRcdFx0Y3VycmVudEZyYW1lID0gZnJhbWUuZnJhbWVJbmRleDtcblx0XHRcdFx0ZHJhd0ZyYW1lKGZyYW1lLmZyYW1lSW5kZXgpO1xuXHRcdFx0fVxuXHRcdFx0c2NoZWR1bGVGcmFtZShmcmFtZS5uZXh0RnJhbWVEZWxheSk7XG5cdFx0fTtcblx0XHRhbmltYXRpb25EaXNwb3NhYmxlcy5hZGQoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0YXJnZXRXaW5kb3cuZG9jdW1lbnQsICd2aXNpYmlsaXR5Y2hhbmdlJywgKCkgPT4ge1xuXHRcdFx0Y2xlYXJGcmFtZVRpbWVyKCk7XG5cdFx0XHRpZiAoIXRhcmdldFdpbmRvdy5kb2N1bWVudC5oaWRkZW4pIHtcblx0XHRcdFx0dXBkYXRlRnJhbWUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0YW5pbWF0aW9uRGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZShjbGVhckZyYW1lVGltZXIpKTtcblx0XHRzY2hlZHVsZUZyYW1lKGZyYW1lRHVyYXRpb25zW2luaXRpYWxGcmFtZUluZGV4XSk7XG5cdFx0YW5pbWF0aW9uRGlzcG9zYWJsZS52YWx1ZSA9IGFuaW1hdGlvbkRpc3Bvc2FibGVzO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlU3BlZWNoQnViYmxlKHN0YXRlOiBDaGF0UGV0U3RhdGUgfCB1bmRlZmluZWQsIHJlc3RhcnQgPSBmYWxzZSk6IHZvaWQge1xuXHRcdHRoaXMuX3VwZGF0ZVNwZWVjaEJ1YmJsZVBvc2l0aW9uKCk7XG5cdFx0Y29uc3QgdmlzaWJsZSA9IGRvZXNDaGF0UGV0U3RhdGVTcGVhayhzdGF0ZSk7XG5cdFx0dGhpcy5fc3BlZWNoQnViYmxlLmNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdoaWRkZW4nLCAhdmlzaWJsZSk7XG5cdFx0aWYgKCF2aXNpYmxlKSB7XG5cdFx0XHR0aGlzLl9zcGVlY2hBbmltYXRpb24uY2xlYXIoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBzb3VyY2VzID0gZ2V0U3BlZWNoU3ByaXRlU291cmNlcyh0aGlzLl92YXJpYW50KTtcblx0XHRjb25zdCBzb3VyY2UgPSB0aGlzLl9tb3Rpb25SZWR1Y2VkID8gc291cmNlcy5yZWR1Y2VkTW90aW9uIDogc291cmNlcy5hbmltYXRlZDtcblx0XHRpZiAoIWlzQ2hhdFBldEltYWdlU291cmNlKHRoaXMuX3NwZWVjaEJ1YmJsZS5pbWFnZSwgc291cmNlLnVybCkpIHtcblx0XHRcdHRoaXMuX3NwZWVjaEFuaW1hdGlvbi5jbGVhcigpO1xuXHRcdFx0dGhpcy5fc3BlZWNoQnViYmxlLmltYWdlLnJlbW92ZUF0dHJpYnV0ZSgnc3JjJyk7XG5cdFx0XHR0aGlzLl9zcGVlY2hCdWJibGUuaW1hZ2Uuc3JjID0gc291cmNlLnVybDtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKHJlc3RhcnQgJiYgdGhpcy5fc3BlZWNoQnViYmxlLmltYWdlLmNvbXBsZXRlICYmIHRoaXMuX3NwZWVjaEJ1YmJsZS5pbWFnZS5uYXR1cmFsV2lkdGggPiAwKSB7XG5cdFx0XHR0aGlzLl9zcGVlY2hBbmltYXRpb24uY2xlYXIoKTtcblx0XHRcdHRoaXMuX3N0YXJ0U3ByaXRlQW5pbWF0aW9uKHNvdXJjZSwgdGhpcy5fc3BlZWNoQnViYmxlLCB0aGlzLl9zcGVlY2hBbmltYXRpb24pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3Jlc3RhcnRFeWVBbmltYXRpb24oKTogdm9pZCB7XG5cdFx0dGhpcy5fZXllcy5jbGFzc0xpc3QucmVtb3ZlKCdhbmltYXRlZCcpO1xuXHRcdHRoaXMuX2V5ZXMuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG5cdFx0aWYgKCF0aGlzLl9tb3Rpb25SZWR1Y2VkKSB7XG5cdFx0XHR0aGlzLl9leWVzLmNsYXNzTGlzdC5hZGQoJ2FuaW1hdGVkJyk7XG5cdFx0fVxuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLE9BQU87QUFDUCxZQUFZLFNBQVM7QUFDckIsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsY0FBYztBQUN2QixTQUFTLFFBQWlCLGlCQUFpQjtBQUMzQyxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLFNBQVMsY0FBYztBQUNoQyxTQUFTLFlBQVksaUJBQThCLG1CQUFtQixvQkFBb0I7QUFDMUYsU0FB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
