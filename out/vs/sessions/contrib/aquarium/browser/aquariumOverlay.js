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
import { $, addDisposableGenericMouseDownListener, addDisposableGenericMouseMoveListener, addDisposableListener, EventType, getWindow, scheduleAtNextAnimationFrame } from "../../../../base/browser/dom.js";
import { createInstantHoverDelegate } from "../../../../base/browser/ui/hover/hoverDelegateFactory.js";
import { RunOnceScheduler } from "../../../../base/common/async.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { observableValue } from "../../../../base/common/observable.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { localize } from "../../../../nls.js";
import { IAccessibilityService } from "../../../../platform/accessibility/common/accessibility.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { createDecorator } from "../../../../platform/instantiation/common/instantiation.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { IWorkbenchLayoutService, Parts } from "../../../../workbench/services/layout/browser/layoutService.js";
import { SessionsAquariumActiveContext } from "../../../common/contextkeys.js";
import { disposeSharedFishDefs, Fish, pickRandomSpecies } from "./fish.js";
import { FishFeedingStreak } from "./fishFeedingStreak.js";
const SESSIONS_DEVELOPER_JOY_ENABLED_SETTING = "sessions.developerJoy.enabled";
const FISH_COUNT = 50;
const FISH_MIN_SIZE = 22;
const FISH_MAX_SIZE = 48;
const FISH_GROWTH_FACTOR = 1.08;
const SCATTER_RADIUS = 145;
const SCATTER_RADIUS_SQ = SCATTER_RADIUS * SCATTER_RADIUS;
const EAT_RADIUS = 14;
const FOOD_DETECT_RADIUS = 160;
const FOOD_DETECT_RADIUS_SQ = FOOD_DETECT_RADIUS * FOOD_DETECT_RADIUS;
const MAX_FOOD = 12;
const WALL_MARGIN = 36;
const BASE_SPEED = 24;
const MAX_SPEED = 50;
const MAX_SPEED_SQ = MAX_SPEED * MAX_SPEED;
const PANIC_MAX_SPEED = 240;
const PANIC_MAX_SPEED_SQ = PANIC_MAX_SPEED * PANIC_MAX_SPEED;
const PANIC_DURATION_MS = 600;
const EXIT_DURATION_MS = 900;
const ACTIVE_FRAME_INTERVAL_MS = 1e3 / 30;
const DART_RATE_PER_SECOND = 0.04;
const DART_IMPULSE = 150;
const ENABLED_STORAGE_KEY = "sessions.developerJoy.enabled";
const ACTION_VISIBLE_STORAGE_KEY = "sessions.aquarium.action.visible";
const FISH_HUNGER_ICONS = {
  happy: Codicon.fish1Happy,
  neutral: Codicon.fish1Neutral,
  sad: Codicon.fish1Sad,
  verySad: Codicon.fish1VerySad
};
const IAquariumService = createDecorator("aquariumService");
let AquariumService = class extends Disposable {
  constructor(layoutService, contextKeyService, hoverService, storageService, configurationService, accessibilityService, telemetryService) {
    super();
    this.layoutService = layoutService;
    this.hoverService = hoverService;
    this.storageService = storageService;
    this.configurationService = configurationService;
    this.accessibilityService = accessibilityService;
    this.telemetryService = telemetryService;
    this.mounts = /* @__PURE__ */ new Set();
    this.activeRef = this._register(new MutableDisposable());
    this.pendingExit = this._register(new MutableDisposable());
    this._actionVisible = observableValue(this, true);
    this.actionVisible = this._actionVisible;
    this.mainContainer = layoutService.mainContainer;
    this.activeContextKey = SessionsAquariumActiveContext.bindTo(contextKeyService);
    this.streak = new FishFeedingStreak(storageService);
    this._actionVisible.set(this.storageService.getBoolean(ACTION_VISIBLE_STORAGE_KEY, StorageScope.APPLICATION, true), void 0);
    this.hungerRefreshScheduler = this._register(new RunOnceScheduler(() => {
      this.updateAllToggleButtonsVisual(!!this.activeRef.value);
    }, 0));
    this._register(this.storageService.onDidChangeValue(StorageScope.APPLICATION, ACTION_VISIBLE_STORAGE_KEY, this._store)(() => {
      this.setActionVisible(this.storageService.getBoolean(ACTION_VISIBLE_STORAGE_KEY, StorageScope.APPLICATION, true));
    }));
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(SESSIONS_DEVELOPER_JOY_ENABLED_SETTING)) {
        this.applyFeatureEnabledState();
      }
    }));
  }
  mountToggle(parent) {
    const button = $("button.agents-aquarium-toggle");
    button.type = "button";
    this.updateToggleButtonVisual(button, !!this.activeRef.value);
    const store = new DisposableStore();
    store.add(addDisposableListener(button, EventType.CLICK, (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.toggle();
    }));
    const hoverDelegate = store.add(createInstantHoverDelegate());
    store.add(this.hoverService.setupManagedHover(
      hoverDelegate,
      button,
      () => this.getToggleLabel(!!this.activeRef.value)
    ));
    parent.appendChild(button);
    const mount = { button, hostVisible: true };
    this.mounts.add(mount);
    this.applyFeatureEnabledStateForButton(button);
    this.reconcileActivation();
    this.scheduleHungerRefresh();
    return {
      setHostVisible: (visible) => {
        if (mount.hostVisible === visible) {
          return;
        }
        mount.hostVisible = visible;
        this.reconcileActivation();
      },
      dispose: () => {
        store.dispose();
        button.remove();
        this.mounts.delete(mount);
        if (this.mounts.size === 0) {
          this.hungerRefreshScheduler.cancel();
        }
        this.reconcileActivation();
      }
    };
  }
  toggleActionVisibility() {
    const visible = !this._actionVisible.get();
    this.setActionVisible(visible);
    this.storageService.store(ACTION_VISIBLE_STORAGE_KEY, visible, StorageScope.APPLICATION, StorageTarget.USER);
    this.accessibilityService.status(visible ? localize("aquarium.action.shown", "Aquarium action shown") : localize("aquarium.action.hidden", "Aquarium action hidden"));
    return visible;
  }
  simulateStreak(count, alive) {
    this.streak.simulate(count, alive);
    this.updateAllToggleButtonsVisual(!!this.activeRef.value);
  }
  setActionVisible(visible) {
    this._actionVisible.set(visible, void 0);
    for (const mount of this.mounts) {
      this.applyFeatureEnabledStateForButton(mount.button);
    }
  }
  /**
   * Activate when at least one mount is host-visible and the user has it on;
   * otherwise deactivate synchronously (no fade) so the aquarium can't flash
   * behind a sibling view during a view swap.
   */
  reconcileActivation() {
    const anyHostVisible = this.hasVisibleMount();
    if (anyHostVisible && this.isFeatureEnabled() && this.isStoredEnabled() && !this.activeRef.value) {
      this.activate(
        /* persist */
        false
      );
    } else if (!anyHostVisible) {
      this.pendingExit.clear();
      if (this.activeRef.value) {
        this.deactivate(
          /* persist */
          false,
          /* animate */
          false
        );
      }
    }
  }
  hasVisibleMount() {
    for (const m of this.mounts) {
      if (m.hostVisible) {
        return true;
      }
    }
    return false;
  }
  isFeatureEnabled() {
    return this.configurationService.getValue(SESSIONS_DEVELOPER_JOY_ENABLED_SETTING) === true;
  }
  isStoredEnabled() {
    return this.storageService.getBoolean(ENABLED_STORAGE_KEY, StorageScope.APPLICATION, false);
  }
  setStoredEnabled(enabled) {
    this.storageService.store(ENABLED_STORAGE_KEY, enabled, StorageScope.APPLICATION, StorageTarget.USER);
  }
  applyFeatureEnabledState() {
    for (const mount of this.mounts) {
      this.applyFeatureEnabledStateForButton(mount.button);
    }
    if (!this.isFeatureEnabled() && this.activeRef.value) {
      this.deactivate(
        /* persist */
        false
      );
    } else if (this.isFeatureEnabled()) {
      this.reconcileActivation();
    }
  }
  applyFeatureEnabledStateForButton(button) {
    button.style.display = this.isFeatureEnabled() && this._actionVisible.get() ? "" : "none";
  }
  updateToggleButtonVisual(button, active) {
    button.classList.toggle("active", active);
    this.streak.collectExpired();
    const streak = this.streak.count;
    const revivable = streak > 0 ? 0 : this.streak.revivableCount;
    const hungerIcon = FISH_HUNGER_ICONS[this.streak.hungerState];
    const icon = active ? Codicon.close : hungerIcon;
    button.replaceChildren();
    const iconSpan = $("span");
    iconSpan.setAttribute("aria-hidden", "true");
    addIconClasses(iconSpan, icon);
    if (!active) {
      button.appendChild(iconSpan);
    }
    const showStreak = streak > 0 || revivable > 0;
    button.classList.toggle("has-streak", showStreak);
    if (showStreak) {
      const streakSpan = $("span");
      streakSpan.className = "agents-aquarium-toggle-streak";
      streakSpan.setAttribute("aria-hidden", "true");
      if (active) {
        const hungerIconSpan = $("span");
        addIconClasses(hungerIconSpan, hungerIcon);
        streakSpan.appendChild(hungerIconSpan);
      }
      if (streak > 0) {
        streakSpan.append(String(streak));
      } else {
        streakSpan.classList.add("revivable");
        streakSpan.append(localize("aquarium.reviveBadge", "{0} \xB7 Feed again to revive", revivable));
      }
      button.appendChild(streakSpan);
    }
    if (active) {
      button.appendChild(iconSpan);
    }
    const label = this.getToggleLabel(active);
    button.setAttribute("aria-pressed", String(active));
    button.setAttribute("aria-label", label);
  }
  getToggleLabel(active) {
    const base = active ? localize("aquarium.hide", "Hide Aquarium") : localize("aquarium.show", "Show Aquarium");
    const streak = this.streak.count;
    if (streak > 0) {
      const hungerDescription = getFishHungerDescription(this.streak.hungerState);
      return streak === 1 ? localize("aquarium.streakLabel.one", "{0} \u2014 {1} \u2014 {2} day feeding streak", base, hungerDescription, streak) : localize("aquarium.streakLabel.other", "{0} \u2014 {1} \u2014 {2} days feeding streak", base, hungerDescription, streak);
    }
    const revivable = this.streak.revivableCount;
    if (revivable > 0) {
      return revivable === 1 ? localize("aquarium.reviveLabel.one", "{0} \u2014 feed a fish to revive your {1} day streak", base, revivable) : localize("aquarium.reviveLabel.other", "{0} \u2014 feed a fish to revive your {1} day streak", base, revivable);
    }
    return base;
  }
  toggle() {
    const willActivate = !this.activeRef.value;
    this.telemetryService.publicLog2("vscodeAgents.aquarium/toggle", {
      activated: willActivate
    });
    if (this.activeRef.value) {
      this.deactivate(
        /* persist */
        true
      );
    } else if (this.hasVisibleMount()) {
      this.activate(
        /* persist */
        true
      );
    }
  }
  updateAllToggleButtonsVisual(active) {
    for (const mount of this.mounts) {
      this.updateToggleButtonVisual(mount.button, active);
    }
    this.scheduleHungerRefresh();
  }
  scheduleHungerRefresh() {
    this.hungerRefreshScheduler.cancel();
    if (this.mounts.size === 0) {
      return;
    }
    const delay = this.streak.millisecondsUntilHungerStateChange;
    if (delay !== void 0) {
      this.hungerRefreshScheduler.schedule(delay);
    }
  }
  /** @param persist false when restoring previously-stored state. */
  activate(persist) {
    if (this.activeRef.value) {
      return;
    }
    this.pendingExit.clear();
    let active;
    try {
      active = createActiveAquarium(this.mainContainer, this.layoutService, this.accessibilityService, () => this.handleFishFed());
    } catch (e) {
      console.error("[aquarium] failed to activate", e);
      return;
    }
    if (!active) {
      return;
    }
    this.activeRef.value = active;
    this.activeContextKey.set(true);
    this.updateAllToggleButtonsVisual(true);
    if (persist) {
      this.setStoredEnabled(true);
    }
    this.streak.collectExpired();
    this.updateAllToggleButtonsVisual(true);
  }
  /** Called whenever a fish eats a pellet. */
  handleFishFed() {
    const before = this.streak.count;
    const result = this.streak.recordFeed();
    if (result.count !== before || result.revived) {
      this.updateAllToggleButtonsVisual(!!this.activeRef.value);
    }
  }
  /**
   * @param persist false when tearing down for non-user reasons.
   * @param animate false to dispose synchronously (no fade-out). Used for
   * host-driven teardown where running a 900ms fade would let fish stay
   * visible while the next view layers on top.
   */
  deactivate(persist, animate = true) {
    if (!animate) {
      this.activeRef.clear();
      this.activeContextKey.set(false);
      this.updateAllToggleButtonsVisual(false);
      if (persist) {
        this.setStoredEnabled(false);
      }
      return;
    }
    const active = this.activeRef.clearAndLeak();
    if (!active) {
      return;
    }
    this.activeContextKey.set(false);
    this.updateAllToggleButtonsVisual(false);
    const pending = active.exit(() => {
      if (this.pendingExit.value === pending) {
        this.pendingExit.clear();
      }
    });
    this.pendingExit.value = pending;
    if (persist) {
      this.setStoredEnabled(false);
    }
  }
};
AquariumService = __decorateClass([
  __decorateParam(0, IWorkbenchLayoutService),
  __decorateParam(1, IContextKeyService),
  __decorateParam(2, IHoverService),
  __decorateParam(3, IStorageService),
  __decorateParam(4, IConfigurationService),
  __decorateParam(5, IAccessibilityService),
  __decorateParam(6, ITelemetryService)
], AquariumService);
function createActiveAquarium(mainContainer, layoutService, accessibilityService, onFishFed) {
  const targetWindow = getWindow(mainContainer);
  const sessionsContainer = layoutService.getContainer(targetWindow, Parts.SESSIONS_PART);
  if (!sessionsContainer || !layoutService.isVisible(Parts.SESSIONS_PART, targetWindow)) {
    return void 0;
  }
  const store = new DisposableStore();
  const water = $(".agents-aquarium-water");
  water.setAttribute("aria-hidden", "true");
  sessionsContainer.insertBefore(water, sessionsContainer.firstChild);
  sessionsContainer.classList.add("aquarium-active");
  store.add(toDisposable(() => {
    water.remove();
    sessionsContainer.classList.remove("aquarium-active");
  }));
  const fishLayer = $(".agents-aquarium-fish-layer");
  water.appendChild(fishLayer);
  const foodLayer = $(".agents-aquarium-food-layer");
  water.appendChild(foodLayer);
  const bounds = { width: 0, height: 0 };
  const waterScreenOffset = { left: 0, top: 0 };
  const updateBounds = () => {
    bounds.width = water.clientWidth;
    bounds.height = water.clientHeight;
    const rect = water.getBoundingClientRect();
    waterScreenOffset.left = rect.left;
    waterScreenOffset.top = rect.top;
  };
  const fish = [];
  updateBounds();
  const resizeObserver = new ResizeObserver(() => {
    updateBounds();
    for (const f of fish) {
      f.positionX = Math.min(f.positionX, Math.max(0, bounds.width - f.size));
      f.positionY = Math.min(f.positionY, Math.max(0, bounds.height - f.size));
    }
  });
  resizeObserver.observe(water);
  store.add(toDisposable(() => resizeObserver.disconnect()));
  for (let i = 0; i < FISH_COUNT; i++) {
    const size = randomBetween(FISH_MIN_SIZE, FISH_MAX_SIZE);
    const angle = Math.random() * Math.PI * 2;
    const speed = randomBetween(BASE_SPEED * 0.6, BASE_SPEED * 1.2);
    const f = new Fish({
      species: pickRandomSpecies(),
      size,
      positionX: randomBetween(0, Math.max(1, bounds.width - size)),
      positionY: randomBetween(0, Math.max(1, bounds.height - size)),
      velocityX: Math.cos(angle) * speed,
      velocityY: Math.sin(angle) * speed
    }, targetWindow.document);
    fish.push(f);
  }
  const SYNC_BATCH = Math.ceil(FISH_COUNT / 2);
  const firstBatch = targetWindow.document.createDocumentFragment();
  for (let i = 0; i < Math.min(SYNC_BATCH, fish.length); i++) {
    firstBatch.appendChild(fish[i].element);
  }
  fishLayer.appendChild(firstBatch);
  let exiting = false;
  if (SYNC_BATCH < fish.length) {
    const deferred = scheduleAtNextAnimationFrame(targetWindow, () => {
      if (exiting) {
        return;
      }
      const restBatch = targetWindow.document.createDocumentFragment();
      for (let i = SYNC_BATCH; i < fish.length; i++) {
        restBatch.appendChild(fish[i].element);
      }
      fishLayer.appendChild(restBatch);
      const fadeIn2 = scheduleAtNextAnimationFrame(targetWindow, () => {
        if (exiting) {
          return;
        }
        for (let i = SYNC_BATCH; i < fish.length; i++) {
          const localIndex = i - SYNC_BATCH;
          const delay = Math.min(localIndex * 12, 400);
          fish[i].element.style.transitionDelay = `${delay}ms`;
          fish[i].element.classList.add("visible");
        }
      });
      store.add(fadeIn2);
    });
    store.add(deferred);
  }
  store.add(toDisposable(() => {
    for (const f of fish) {
      f.element.remove();
    }
    disposeSharedFishDefs(targetWindow.document);
  }));
  const food = [];
  const removeFood = (pellet) => {
    const idx = food.indexOf(pellet);
    if (idx !== -1) {
      food.splice(idx, 1);
      pellet.element.remove();
    }
  };
  let boundsDirty = false;
  const markBoundsDirty = () => {
    boundsDirty = true;
  };
  store.add(addDisposableListener(targetWindow, EventType.RESIZE, markBoundsDirty, { passive: true }));
  store.add(addDisposableListener(targetWindow, "scroll", markBoundsDirty, { passive: true, capture: true }));
  let mouseX = -1e6;
  let mouseY = -1e6;
  const resetMousePosition = () => {
    mouseX = -1e6;
    mouseY = -1e6;
  };
  store.add(addDisposableGenericMouseMoveListener(mainContainer, (e) => {
    mouseX = e.clientX - waterScreenOffset.left;
    mouseY = e.clientY - waterScreenOffset.top;
  }));
  store.add(addDisposableListener(mainContainer, EventType.MOUSE_LEAVE, resetMousePosition, { passive: true }));
  store.add(addDisposableListener(mainContainer, EventType.POINTER_LEAVE, resetMousePosition, { passive: true }));
  store.add(addDisposableGenericMouseDownListener(mainContainer, (e) => {
    if (e.button !== 0) {
      return;
    }
    const target = e.target;
    if (!isBackgroundClick(target)) {
      return;
    }
    updateBounds();
    const dropX = e.clientX - waterScreenOffset.left;
    const dropY = e.clientY - waterScreenOffset.top;
    if (dropX < 0 || dropY < 0 || dropX > bounds.width || dropY > bounds.height) {
      return;
    }
    spawnFood(dropX, dropY);
  }));
  function spawnFood(dropX, dropY) {
    while (food.length >= MAX_FOOD) {
      const oldest = food[0];
      removeFood(oldest);
    }
    const el = $(".agents-aquarium-food");
    el.style.transform = `translate(${dropX}px, ${dropY}px)`;
    foodLayer.appendChild(el);
    food.push({ element: el, positionX: dropX, positionY: dropY, fallSpeed: randomBetween(20, 35) });
  }
  let lastFrame = performance.now();
  let rafDisposable;
  const stopAnimation = () => {
    rafDisposable?.dispose();
    rafDisposable = void 0;
  };
  const startAnimation = () => {
    if (rafDisposable || accessibilityService.isMotionReduced()) {
      return;
    }
    lastFrame = performance.now();
    rafDisposable = scheduleAtNextAnimationFrame(targetWindow, tick);
  };
  const tick = () => {
    rafDisposable = void 0;
    const now = performance.now();
    const elapsedMs = now - lastFrame;
    if (elapsedMs < ACTIVE_FRAME_INTERVAL_MS) {
      rafDisposable = scheduleAtNextAnimationFrame(targetWindow, tick);
      return;
    }
    const dtMs = Math.min(elapsedMs, 100);
    const dt = dtMs / 1e3;
    lastFrame = now;
    if (boundsDirty) {
      boundsDirty = false;
      updateBounds();
    }
    if (!accessibilityService.isMotionReduced() && targetWindow.document.visibilityState !== "hidden") {
      updateFood(dt);
      updateFish(dt);
    }
    if (!accessibilityService.isMotionReduced()) {
      rafDisposable = scheduleAtNextAnimationFrame(targetWindow, tick);
    }
  };
  function updateFood(dt) {
    for (let i = food.length - 1; i >= 0; i--) {
      const pellet = food[i];
      pellet.positionY += pellet.fallSpeed * dt;
      pellet.element.style.transform = `translate(${pellet.positionX.toFixed(1)}px, ${pellet.positionY.toFixed(1)}px)`;
      if (pellet.positionY > bounds.height + 10) {
        removeFood(pellet);
      }
    }
  }
  function updateFish(dt) {
    const now = performance.now();
    for (const f of fish) {
      const centerX = f.positionX + f.size / 2;
      const centerY = f.positionY + f.size / 2;
      const wallEscapeAngle = computeWallAvoidAngle(centerX, centerY, bounds.width, bounds.height);
      if (wallEscapeAngle !== void 0) {
        const turnDelta = shortestAngleDelta(f.wanderAngle, wallEscapeAngle);
        const maxTurnPerFrame = 4 * dt;
        f.wanderAngle += Math.max(-maxTurnPerFrame, Math.min(maxTurnPerFrame, turnDelta));
      } else {
        f.wanderAngle += (Math.random() - 0.5) * 1.2 * dt + (Math.random() - 0.5) * 0.04;
      }
      const thrust = 32;
      let accelX = Math.cos(f.wanderAngle) * thrust;
      let accelY = Math.sin(f.wanderAngle) * thrust;
      if (Math.random() < DART_RATE_PER_SECOND * dt) {
        const dartAngle = Math.random() * Math.PI * 2;
        f.velocityX += Math.cos(dartAngle) * DART_IMPULSE;
        f.velocityY += Math.sin(dartAngle) * DART_IMPULSE;
        f.panicUntil = now + PANIC_DURATION_MS;
      }
      if (centerX < WALL_MARGIN) {
        accelX += (WALL_MARGIN - centerX) * 6;
      } else if (centerX > bounds.width - WALL_MARGIN) {
        accelX -= (centerX - (bounds.width - WALL_MARGIN)) * 6;
      }
      if (centerY < WALL_MARGIN) {
        accelY += (WALL_MARGIN - centerY) * 6;
      } else if (centerY > bounds.height - WALL_MARGIN) {
        accelY -= (centerY - (bounds.height - WALL_MARGIN)) * 6;
      }
      const mouseDeltaX = centerX - mouseX;
      const mouseDeltaY = centerY - mouseY;
      const mouseDistSq = mouseDeltaX * mouseDeltaX + mouseDeltaY * mouseDeltaY;
      if (mouseDistSq < SCATTER_RADIUS_SQ) {
        const mouseDist = Math.max(Math.sqrt(mouseDistSq), 1);
        const force = (1 - mouseDist / SCATTER_RADIUS) * 1100;
        accelX += mouseDeltaX / mouseDist * force;
        accelY += mouseDeltaY / mouseDist * force;
        f.panicUntil = now + PANIC_DURATION_MS;
      }
      let nearestPellet;
      let nearestDistSq = FOOD_DETECT_RADIUS_SQ;
      for (const pellet of food) {
        const foodDeltaX = pellet.positionX - centerX;
        const foodDeltaY = pellet.positionY - centerY;
        const distSq = foodDeltaX * foodDeltaX + foodDeltaY * foodDeltaY;
        if (distSq < nearestDistSq) {
          nearestDistSq = distSq;
          nearestPellet = pellet;
        }
      }
      if (nearestPellet) {
        const nearestDist = Math.max(Math.sqrt(nearestDistSq), 1);
        if (nearestDist < EAT_RADIUS) {
          removeFood(nearestPellet);
          f.grow(FISH_GROWTH_FACTOR);
          onFishFed?.();
        } else {
          accelX += (nearestPellet.positionX - centerX) / nearestDist * 200;
          accelY += (nearestPellet.positionY - centerY) / nearestDist * 200;
        }
      }
      f.velocityX += accelX * dt;
      f.velocityY += accelY * dt;
      const speedSq = f.velocityX * f.velocityX + f.velocityY * f.velocityY;
      const maxSpeed = now < f.panicUntil ? PANIC_MAX_SPEED : MAX_SPEED;
      const maxSpeedSq = now < f.panicUntil ? PANIC_MAX_SPEED_SQ : MAX_SPEED_SQ;
      if (speedSq > maxSpeedSq) {
        const speed = Math.sqrt(speedSq);
        f.velocityX = f.velocityX / speed * maxSpeed;
        f.velocityY = f.velocityY / speed * maxSpeed;
      }
      f.positionX += f.velocityX * dt;
      f.positionY += f.velocityY * dt;
      f.positionX = clamp(f.positionX, -f.size * 0.25, bounds.width - f.size * 0.75);
      f.positionY = clamp(f.positionY, -f.size * 0.25, bounds.height - f.size * 0.75);
      f.applyTransform(dt);
    }
  }
  store.add(accessibilityService.onDidChangeReducedMotion(() => {
    if (accessibilityService.isMotionReduced()) {
      stopAnimation();
    } else {
      startAnimation();
    }
  }));
  store.add(toDisposable(() => stopAnimation()));
  startAnimation();
  const fadeIn = scheduleAtNextAnimationFrame(targetWindow, () => {
    if (exiting) {
      return;
    }
    water.classList.add("visible");
    for (let i = 0; i < Math.min(SYNC_BATCH, fish.length); i++) {
      const f = fish[i];
      const delay = Math.min(i * 12, 400);
      f.element.style.transitionDelay = `${delay}ms`;
      f.element.classList.add("visible");
    }
  });
  store.add(fadeIn);
  const result = new class extends Disposable {
    constructor() {
      super();
      this._register(store);
    }
    exit(onDidComplete) {
      if (exiting) {
        return toDisposable(() => this.dispose());
      }
      exiting = true;
      for (let i = 0; i < fish.length; i++) {
        const f = fish[i];
        const delay = Math.min(i * 12, 400);
        f.element.style.transitionDelay = `${delay}ms`;
        f.element.classList.remove("visible");
      }
      water.classList.remove("visible");
      let timer = setTimeout(() => {
        timer = void 0;
        this.dispose();
        onDidComplete();
      }, EXIT_DURATION_MS);
      return toDisposable(() => {
        if (timer !== void 0) {
          clearTimeout(timer);
          timer = void 0;
        }
        this.dispose();
      });
    }
  }();
  return result;
}
function isBackgroundClick(target) {
  if (!target) {
    return false;
  }
  if (target.closest('input, textarea, select, button, a, [role="button"], [role="link"], [role="textbox"], [role="combobox"], [role="menuitem"], [role="tab"], .monaco-editor, .scroll-decoration, .monaco-list-row')) {
    return false;
  }
  return true;
}
function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}
function clamp(value, min, max) {
  if (max < min) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
}
function addIconClasses(element, icon) {
  const iconClasses = ThemeIcon.asClassName(icon).split(/\s+/).filter(Boolean);
  for (const cls of iconClasses) {
    element.classList.add(cls);
  }
}
function getFishHungerDescription(state) {
  switch (state) {
    case "happy":
      return localize("aquarium.hunger.happy", "fish is happy");
    case "neutral":
      return localize("aquarium.hunger.neutral", "fish is getting hungry");
    case "sad":
      return localize("aquarium.hunger.sad", "fish is hungry");
    case "verySad":
      return localize("aquarium.hunger.verySad", "fish is starving");
  }
}
function computeWallAvoidAngle(centerX, centerY, width, height) {
  let escapeX = 0;
  let escapeY = 0;
  if (centerX < WALL_MARGIN) {
    escapeX += (WALL_MARGIN - centerX) / WALL_MARGIN;
  } else if (centerX > width - WALL_MARGIN) {
    escapeX -= (centerX - (width - WALL_MARGIN)) / WALL_MARGIN;
  }
  if (centerY < WALL_MARGIN) {
    escapeY += (WALL_MARGIN - centerY) / WALL_MARGIN;
  } else if (centerY > height - WALL_MARGIN) {
    escapeY -= (centerY - (height - WALL_MARGIN)) / WALL_MARGIN;
  }
  if (escapeX === 0 && escapeY === 0) {
    return void 0;
  }
  return Math.atan2(escapeY, escapeX) + (Math.random() - 0.5) * 0.4;
}
function shortestAngleDelta(from, to) {
  let delta = (to - from) % (Math.PI * 2);
  if (delta > Math.PI) {
    delta -= Math.PI * 2;
  } else if (delta < -Math.PI) {
    delta += Math.PI * 2;
  }
  return delta;
}
export {
  AquariumService,
  IAquariumService,
  SESSIONS_DEVELOPER_JOY_ENABLED_SETTING
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcYXF1YXJpdW1cXGJyb3dzZXJcXGFxdWFyaXVtT3ZlcmxheS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7ICQsIGFkZERpc3Bvc2FibGVHZW5lcmljTW91c2VEb3duTGlzdGVuZXIsIGFkZERpc3Bvc2FibGVHZW5lcmljTW91c2VNb3ZlTGlzdGVuZXIsIGFkZERpc3Bvc2FibGVMaXN0ZW5lciwgRXZlbnRUeXBlLCBnZXRXaW5kb3csIHNjaGVkdWxlQXROZXh0QW5pbWF0aW9uRnJhbWUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IGNyZWF0ZUluc3RhbnRIb3ZlckRlbGVnYXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2hvdmVyL2hvdmVyRGVsZWdhdGVGYWN0b3J5LmpzJztcbmltcG9ydCB7IFJ1bk9uY2VTY2hlZHVsZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSwgTXV0YWJsZURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJT2JzZXJ2YWJsZSwgb2JzZXJ2YWJsZVZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUFjY2Vzc2liaWxpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWNjZXNzaWJpbGl0eS9jb21tb24vYWNjZXNzaWJpbGl0eS5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5LCBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElIb3ZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ob3Zlci9icm93c2VyL2hvdmVyLmpzJztcbmltcG9ydCB7IGNyZWF0ZURlY29yYXRvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaExheW91dFNlcnZpY2UsIFBhcnRzIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL3NlcnZpY2VzL2xheW91dC9icm93c2VyL2xheW91dFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgU2Vzc2lvbnNBcXVhcml1bUFjdGl2ZUNvbnRleHQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udGV4dGtleXMuanMnO1xuaW1wb3J0IHsgZGlzcG9zZVNoYXJlZEZpc2hEZWZzLCBGaXNoLCBwaWNrUmFuZG9tU3BlY2llcyB9IGZyb20gJy4vZmlzaC5qcyc7XG5pbXBvcnQgeyBGaXNoRmVlZGluZ1N0cmVhaywgdHlwZSBGaXNoSHVuZ2VyU3RhdGUgfSBmcm9tICcuL2Zpc2hGZWVkaW5nU3RyZWFrLmpzJztcblxuZXhwb3J0IGNvbnN0IFNFU1NJT05TX0RFVkVMT1BFUl9KT1lfRU5BQkxFRF9TRVRUSU5HID0gJ3Nlc3Npb25zLmRldmVsb3BlckpveS5lbmFibGVkJztcblxuY29uc3QgRklTSF9DT1VOVCA9IDUwO1xuY29uc3QgRklTSF9NSU5fU0laRSA9IDIyO1xuY29uc3QgRklTSF9NQVhfU0laRSA9IDQ4O1xuLyoqIEVhY2ggZWF0ZW4gcGVsbGV0IG11bHRpcGxpZXMgdGhlIGZpc2gncyBzaXplIGJ5IHRoaXMuIFVuYm91bmRlZCBvbiBwdXJwb3NlLiAqL1xuY29uc3QgRklTSF9HUk9XVEhfRkFDVE9SID0gMS4wODtcblxuY29uc3QgU0NBVFRFUl9SQURJVVMgPSAxNDU7XG5jb25zdCBTQ0FUVEVSX1JBRElVU19TUSA9IFNDQVRURVJfUkFESVVTICogU0NBVFRFUl9SQURJVVM7XG5jb25zdCBFQVRfUkFESVVTID0gMTQ7XG5jb25zdCBGT09EX0RFVEVDVF9SQURJVVMgPSAxNjA7XG5jb25zdCBGT09EX0RFVEVDVF9SQURJVVNfU1EgPSBGT09EX0RFVEVDVF9SQURJVVMgKiBGT09EX0RFVEVDVF9SQURJVVM7XG5jb25zdCBNQVhfRk9PRCA9IDEyO1xuLyoqIFNvZnQgbWFyZ2luIHdoZXJlIGZpc2ggc3RhcnQgdG8gdHVybiBiYWNrLiAqL1xuY29uc3QgV0FMTF9NQVJHSU4gPSAzNjtcblxuY29uc3QgQkFTRV9TUEVFRCA9IDI0O1xuY29uc3QgTUFYX1NQRUVEID0gNTA7XG5jb25zdCBNQVhfU1BFRURfU1EgPSBNQVhfU1BFRUQgKiBNQVhfU1BFRUQ7XG5jb25zdCBQQU5JQ19NQVhfU1BFRUQgPSAyNDA7XG5jb25zdCBQQU5JQ19NQVhfU1BFRURfU1EgPSBQQU5JQ19NQVhfU1BFRUQgKiBQQU5JQ19NQVhfU1BFRUQ7XG5jb25zdCBQQU5JQ19EVVJBVElPTl9NUyA9IDYwMDtcbmNvbnN0IEVYSVRfRFVSQVRJT05fTVMgPSA5MDA7XG5cbi8qKiBEZWNvcmF0aXZlIGVmZmVjdDogMzBIeiBrZWVwcyBtb3Rpb24gc21vb3RoIGVub3VnaCB3aGlsZSBoYWx2aW5nIEpTIHdvcmsuICovXG5jb25zdCBBQ1RJVkVfRlJBTUVfSU5URVJWQUxfTVMgPSAxMDAwIC8gMzA7XG5cbi8qKiBQZXItZmlzaCBwZXItc2Vjb25kIHByb2JhYmlsaXR5IG9mIHN0YXJ0aW5nIGEgc3BvbnRhbmVvdXMgYnVyc3QuICovXG5jb25zdCBEQVJUX1JBVEVfUEVSX1NFQ09ORCA9IDAuMDQ7XG5jb25zdCBEQVJUX0lNUFVMU0UgPSAxNTA7XG5cbmNvbnN0IEVOQUJMRURfU1RPUkFHRV9LRVkgPSAnc2Vzc2lvbnMuZGV2ZWxvcGVySm95LmVuYWJsZWQnO1xuY29uc3QgQUNUSU9OX1ZJU0lCTEVfU1RPUkFHRV9LRVkgPSAnc2Vzc2lvbnMuYXF1YXJpdW0uYWN0aW9uLnZpc2libGUnO1xuXG5jb25zdCBGSVNIX0hVTkdFUl9JQ09OUzogUmVjb3JkPEZpc2hIdW5nZXJTdGF0ZSwgVGhlbWVJY29uPiA9IHtcblx0aGFwcHk6IENvZGljb24uZmlzaDFIYXBweSxcblx0bmV1dHJhbDogQ29kaWNvbi5maXNoMU5ldXRyYWwsXG5cdHNhZDogQ29kaWNvbi5maXNoMVNhZCxcblx0dmVyeVNhZDogQ29kaWNvbi5maXNoMVZlcnlTYWQsXG59O1xuXG5pbnRlcmZhY2UgSUZvb2RQZWxsZXQge1xuXHRyZWFkb25seSBlbGVtZW50OiBIVE1MRGl2RWxlbWVudDtcblx0cG9zaXRpb25YOiBudW1iZXI7XG5cdHBvc2l0aW9uWTogbnVtYmVyO1xuXHRmYWxsU3BlZWQ6IG51bWJlcjtcbn1cblxuLyoqXG4gKiBPd25zIHRoZSB0b2dnbGUgYnV0dG9uKHMpLCB0aGUgcGVyc2lzdGVkIG9uL29mZiBwcmVmZXJlbmNlLCBhbmQgdGhlIGFjdGl2ZVxuICogYXF1YXJpdW0uIEhvc3RzIGNhbGwge0BsaW5rIElBcXVhcml1bVNlcnZpY2UubW91bnRUb2dnbGV9IHRvIGF0dGFjaCBhIGJ1dHRvblxuICogYXMgYSBjaGlsZCBvZiB0aGVpciBjb250YWluZXI7IHRoZSBhY3RpdmUgYXF1YXJpdW0gaXRzZWxmIGlzIG1vdW50ZWQgaW5zaWRlXG4gKiB0aGUgY2hhdCBiYXIgcGFydCBzbyB0aGUgY2hhdCBpbnB1dCBuYXR1cmFsbHkgcGFpbnRzIG9uIHRvcCBvZiB0aGUgd2F0ZXIuXG4gKi9cbmV4cG9ydCBjb25zdCBJQXF1YXJpdW1TZXJ2aWNlID0gY3JlYXRlRGVjb3JhdG9yPElBcXVhcml1bVNlcnZpY2U+KCdhcXVhcml1bVNlcnZpY2UnKTtcblxuZXhwb3J0IGludGVyZmFjZSBJQXF1YXJpdW1TZXJ2aWNlIHtcblx0cmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXHQvKiogV2hldGhlciB0aGUgYXF1YXJpdW0gYWN0aW9uIGlzIHZpc2libGUgb24gaXRzIG1vdW50ZWQgaG9zdHMuICovXG5cdHJlYWRvbmx5IGFjdGlvblZpc2libGU6IElPYnNlcnZhYmxlPGJvb2xlYW4+O1xuXG5cdC8qKlxuXHQgKiBNb3VudCBhIHRvZ2dsZSBidXR0b24gaW50byBgcGFyZW50YC4gUmV0dXJucyBhIGhhbmRsZSB0aGF0IGV4cG9zZXMgYVxuXHQgKiB7QGxpbmsgSU1vdW50ZWRUb2dnbGVIYW5kbGUuc2V0SG9zdFZpc2libGV9IGhvb2sgc28gY2FsbGVycyBjYW4ga2VlcCB0aGVcblx0ICogYXF1YXJpdW0gdGllZCB0byB0aGVpciBvd24gdmlzaWJpbGl0eSAoZS5nLiBhIHZpZXcgcGFuZSkuIERpc3Bvc2luZyB0aGVcblx0ICogaGFuZGxlIHJlbW92ZXMgdGhlIGJ1dHRvbiBhbmQgdGVhcnMgZG93biB0aGUgYWN0aXZlIGFxdWFyaXVtIGlmIGl0IHdhc1xuXHQgKiB0aGUgbGFzdCBtb3VudC5cblx0ICovXG5cdG1vdW50VG9nZ2xlKHBhcmVudDogSFRNTEVsZW1lbnQpOiBJTW91bnRlZFRvZ2dsZUhhbmRsZTtcblxuXHQvKiogVG9nZ2xlcyBhbmQgcGVyc2lzdHMgdGhlIGFxdWFyaXVtIGFjdGlvbiB2aXNpYmlsaXR5LiAqL1xuXHR0b2dnbGVBY3Rpb25WaXNpYmlsaXR5KCk6IGJvb2xlYW47XG5cblx0LyoqXG5cdCAqIERldmVsb3BtZW50L2RlbW8gaG9vazogZm9yY2UgdGhlIHBlcnNpc3RlZCBmZWVkaW5nIHN0cmVhayBpbnRvIGEgc3BlY2lmaWNcblx0ICogc3RhdGUgYW5kIHJlZnJlc2ggdGhlIHRvZ2dsZSB0b29sdGlwKHMpIGxpdmUuIFdoZW4gYGFsaXZlYCBpcyBmYWxzZSB0aGVcblx0ICogc3RyZWFrIGlzIHBhcmtlZCBhcyBhIGRpZWQvcmV2aXZhYmxlIHN0cmVhayBhbmQgdGhlIHJldml2YWwgcHJvbXB0IGlzXG5cdCAqIG9mZmVyZWQgKHdoZW4gYW4gYXF1YXJpdW0gaXMgYWN0aXZlKS4gQSBgY291bnRgIG9mIDAgY2xlYXJzIHRoZSBzdHJlYWsuXG5cdCAqL1xuXHRzaW11bGF0ZVN0cmVhayhjb3VudDogbnVtYmVyLCBhbGl2ZTogYm9vbGVhbik6IHZvaWQ7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSU1vdW50ZWRUb2dnbGVIYW5kbGUgZXh0ZW5kcyBJRGlzcG9zYWJsZSB7XG5cdC8qKlxuXHQgKiBJbmZvcm0gdGhlIHNlcnZpY2Ugd2hldGhlciB0aGlzIG1vdW50J3MgaG9zdCBpcyBjdXJyZW50bHkgdmlzaWJsZS4gVGhlXG5cdCAqIGFxdWFyaXVtIGlzIG9ubHkgY29uc2lkZXJlZCBhY3RpdmUgd2hlbiBhdCBsZWFzdCBvbmUgbW91bnQgaXMgdmlzaWJsZTtcblx0ICogd2hlbiB0aGUgbGFzdCB2aXNpYmxlIG1vdW50IGdvZXMgaW52aXNpYmxlIHRoZSBhcXVhcml1bSBpcyBkaXNwb3NlZFxuXHQgKiBzeW5jaHJvbm91c2x5IChubyBmYWRlLW91dCkgc28gaXQgY2Fubm90IGZsYXNoIGJlaGluZCBhIHNpYmxpbmcgdmlldy5cblx0ICogSG9zdHMgdGhhdCBkb24ndCBjYXJlIGNhbiBsZWF2ZSB0aGlzIGFsb25lIFx1MjAxNCBtb3VudHMgZGVmYXVsdCB0byB2aXNpYmxlLlxuXHQgKi9cblx0c2V0SG9zdFZpc2libGUodmlzaWJsZTogYm9vbGVhbik6IHZvaWQ7XG59XG5cbmludGVyZmFjZSBJTW91bnRlZFRvZ2dsZSB7XG5cdHJlYWRvbmx5IGJ1dHRvbjogSFRNTEJ1dHRvbkVsZW1lbnQ7XG5cdGhvc3RWaXNpYmxlOiBib29sZWFuO1xufVxuXG5leHBvcnQgY2xhc3MgQXF1YXJpdW1TZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElBcXVhcml1bVNlcnZpY2Uge1xuXG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgbWFpbkNvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBtb3VudHMgPSBuZXcgU2V0PElNb3VudGVkVG9nZ2xlPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IGFjdGl2ZVJlZiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxJQWN0aXZlQXF1YXJpdW0+KCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IHBlbmRpbmdFeGl0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPElEaXNwb3NhYmxlPigpKTtcblx0cHJpdmF0ZSByZWFkb25seSBhY3RpdmVDb250ZXh0S2V5OiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSByZWFkb25seSBzdHJlYWs6IEZpc2hGZWVkaW5nU3RyZWFrO1xuXHRwcml2YXRlIHJlYWRvbmx5IGh1bmdlclJlZnJlc2hTY2hlZHVsZXI6IFJ1bk9uY2VTY2hlZHVsZXI7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2FjdGlvblZpc2libGUgPSBvYnNlcnZhYmxlVmFsdWUodGhpcywgdHJ1ZSk7XG5cdHJlYWRvbmx5IGFjdGlvblZpc2libGU6IElPYnNlcnZhYmxlPGJvb2xlYW4+ID0gdGhpcy5fYWN0aW9uVmlzaWJsZTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVdvcmtiZW5jaExheW91dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYXlvdXRTZXJ2aWNlOiBJV29ya2JlbmNoTGF5b3V0U2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElBY2Nlc3NpYmlsaXR5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGFjY2Vzc2liaWxpdHlTZXJ2aWNlOiBJQWNjZXNzaWJpbGl0eVNlcnZpY2UsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLm1haW5Db250YWluZXIgPSBsYXlvdXRTZXJ2aWNlLm1haW5Db250YWluZXI7XG5cdFx0dGhpcy5hY3RpdmVDb250ZXh0S2V5ID0gU2Vzc2lvbnNBcXVhcml1bUFjdGl2ZUNvbnRleHQuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLnN0cmVhayA9IG5ldyBGaXNoRmVlZGluZ1N0cmVhayhzdG9yYWdlU2VydmljZSk7XG5cdFx0dGhpcy5fYWN0aW9uVmlzaWJsZS5zZXQodGhpcy5zdG9yYWdlU2VydmljZS5nZXRCb29sZWFuKEFDVElPTl9WSVNJQkxFX1NUT1JBR0VfS0VZLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04sIHRydWUpLCB1bmRlZmluZWQpO1xuXHRcdHRoaXMuaHVuZ2VyUmVmcmVzaFNjaGVkdWxlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBSdW5PbmNlU2NoZWR1bGVyKCgpID0+IHtcblx0XHRcdHRoaXMudXBkYXRlQWxsVG9nZ2xlQnV0dG9uc1Zpc3VhbCghIXRoaXMuYWN0aXZlUmVmLnZhbHVlKTtcblx0XHR9LCAwKSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnN0b3JhZ2VTZXJ2aWNlLm9uRGlkQ2hhbmdlVmFsdWUoU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCBBQ1RJT05fVklTSUJMRV9TVE9SQUdFX0tFWSwgdGhpcy5fc3RvcmUpKCgpID0+IHtcblx0XHRcdHRoaXMuc2V0QWN0aW9uVmlzaWJsZSh0aGlzLnN0b3JhZ2VTZXJ2aWNlLmdldEJvb2xlYW4oQUNUSU9OX1ZJU0lCTEVfU1RPUkFHRV9LRVksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgdHJ1ZSkpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHtcblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKFNFU1NJT05TX0RFVkVMT1BFUl9KT1lfRU5BQkxFRF9TRVRUSU5HKSkge1xuXHRcdFx0XHR0aGlzLmFwcGx5RmVhdHVyZUVuYWJsZWRTdGF0ZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdG1vdW50VG9nZ2xlKHBhcmVudDogSFRNTEVsZW1lbnQpOiBJTW91bnRlZFRvZ2dsZUhhbmRsZSB7XG5cdFx0Y29uc3QgYnV0dG9uID0gJDxIVE1MQnV0dG9uRWxlbWVudD4oJ2J1dHRvbi5hZ2VudHMtYXF1YXJpdW0tdG9nZ2xlJyk7XG5cdFx0YnV0dG9uLnR5cGUgPSAnYnV0dG9uJztcblx0XHR0aGlzLnVwZGF0ZVRvZ2dsZUJ1dHRvblZpc3VhbChidXR0b24sICEhdGhpcy5hY3RpdmVSZWYudmFsdWUpO1xuXG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0c3RvcmUuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihidXR0b24sIEV2ZW50VHlwZS5DTElDSywgZSA9PiB7XG5cdFx0XHQvLyBEb24ndCBidWJibGUgaW50byB0aGUgY2hhdCB3aWRnZXQncyBvd24gY2xpY2sgaGFuZGxlcnMuXG5cdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0dGhpcy50b2dnbGUoKTtcblx0XHR9KSk7XG5cdFx0Y29uc3QgaG92ZXJEZWxlZ2F0ZSA9IHN0b3JlLmFkZChjcmVhdGVJbnN0YW50SG92ZXJEZWxlZ2F0ZSgpKTtcblx0XHRzdG9yZS5hZGQodGhpcy5ob3ZlclNlcnZpY2Uuc2V0dXBNYW5hZ2VkSG92ZXIoXG5cdFx0XHRob3ZlckRlbGVnYXRlLFxuXHRcdFx0YnV0dG9uLFxuXHRcdFx0KCkgPT4gdGhpcy5nZXRUb2dnbGVMYWJlbCghIXRoaXMuYWN0aXZlUmVmLnZhbHVlKSxcblx0XHQpKTtcblxuXHRcdHBhcmVudC5hcHBlbmRDaGlsZChidXR0b24pO1xuXG5cdFx0Y29uc3QgbW91bnQ6IElNb3VudGVkVG9nZ2xlID0geyBidXR0b24sIGhvc3RWaXNpYmxlOiB0cnVlIH07XG5cdFx0dGhpcy5tb3VudHMuYWRkKG1vdW50KTtcblx0XHR0aGlzLmFwcGx5RmVhdHVyZUVuYWJsZWRTdGF0ZUZvckJ1dHRvbihidXR0b24pO1xuXHRcdHRoaXMucmVjb25jaWxlQWN0aXZhdGlvbigpO1xuXHRcdHRoaXMuc2NoZWR1bGVIdW5nZXJSZWZyZXNoKCk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0c2V0SG9zdFZpc2libGU6ICh2aXNpYmxlOiBib29sZWFuKSA9PiB7XG5cdFx0XHRcdGlmIChtb3VudC5ob3N0VmlzaWJsZSA9PT0gdmlzaWJsZSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRtb3VudC5ob3N0VmlzaWJsZSA9IHZpc2libGU7XG5cdFx0XHRcdHRoaXMucmVjb25jaWxlQWN0aXZhdGlvbigpO1xuXHRcdFx0fSxcblx0XHRcdGRpc3Bvc2U6ICgpID0+IHtcblx0XHRcdFx0c3RvcmUuZGlzcG9zZSgpO1xuXHRcdFx0XHRidXR0b24ucmVtb3ZlKCk7XG5cdFx0XHRcdHRoaXMubW91bnRzLmRlbGV0ZShtb3VudCk7XG5cdFx0XHRcdGlmICh0aGlzLm1vdW50cy5zaXplID09PSAwKSB7XG5cdFx0XHRcdFx0dGhpcy5odW5nZXJSZWZyZXNoU2NoZWR1bGVyLmNhbmNlbCgpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMucmVjb25jaWxlQWN0aXZhdGlvbigpO1xuXHRcdFx0fSxcblx0XHR9O1xuXHR9XG5cblx0dG9nZ2xlQWN0aW9uVmlzaWJpbGl0eSgpOiBib29sZWFuIHtcblx0XHRjb25zdCB2aXNpYmxlID0gIXRoaXMuX2FjdGlvblZpc2libGUuZ2V0KCk7XG5cdFx0dGhpcy5zZXRBY3Rpb25WaXNpYmxlKHZpc2libGUpO1xuXHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUoQUNUSU9OX1ZJU0lCTEVfU1RPUkFHRV9LRVksIHZpc2libGUsIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgU3RvcmFnZVRhcmdldC5VU0VSKTtcblx0XHR0aGlzLmFjY2Vzc2liaWxpdHlTZXJ2aWNlLnN0YXR1cyh2aXNpYmxlXG5cdFx0XHQ/IGxvY2FsaXplKCdhcXVhcml1bS5hY3Rpb24uc2hvd24nLCBcIkFxdWFyaXVtIGFjdGlvbiBzaG93blwiKVxuXHRcdFx0OiBsb2NhbGl6ZSgnYXF1YXJpdW0uYWN0aW9uLmhpZGRlbicsIFwiQXF1YXJpdW0gYWN0aW9uIGhpZGRlblwiKSk7XG5cdFx0cmV0dXJuIHZpc2libGU7XG5cdH1cblxuXHRzaW11bGF0ZVN0cmVhayhjb3VudDogbnVtYmVyLCBhbGl2ZTogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMuc3RyZWFrLnNpbXVsYXRlKGNvdW50LCBhbGl2ZSk7XG5cdFx0dGhpcy51cGRhdGVBbGxUb2dnbGVCdXR0b25zVmlzdWFsKCEhdGhpcy5hY3RpdmVSZWYudmFsdWUpO1xuXHR9XG5cblx0cHJpdmF0ZSBzZXRBY3Rpb25WaXNpYmxlKHZpc2libGU6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLl9hY3Rpb25WaXNpYmxlLnNldCh2aXNpYmxlLCB1bmRlZmluZWQpO1xuXHRcdGZvciAoY29uc3QgbW91bnQgb2YgdGhpcy5tb3VudHMpIHtcblx0XHRcdHRoaXMuYXBwbHlGZWF0dXJlRW5hYmxlZFN0YXRlRm9yQnV0dG9uKG1vdW50LmJ1dHRvbik7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIEFjdGl2YXRlIHdoZW4gYXQgbGVhc3Qgb25lIG1vdW50IGlzIGhvc3QtdmlzaWJsZSBhbmQgdGhlIHVzZXIgaGFzIGl0IG9uO1xuXHQgKiBvdGhlcndpc2UgZGVhY3RpdmF0ZSBzeW5jaHJvbm91c2x5IChubyBmYWRlKSBzbyB0aGUgYXF1YXJpdW0gY2FuJ3QgZmxhc2hcblx0ICogYmVoaW5kIGEgc2libGluZyB2aWV3IGR1cmluZyBhIHZpZXcgc3dhcC5cblx0ICovXG5cdHByaXZhdGUgcmVjb25jaWxlQWN0aXZhdGlvbigpOiB2b2lkIHtcblx0XHRjb25zdCBhbnlIb3N0VmlzaWJsZSA9IHRoaXMuaGFzVmlzaWJsZU1vdW50KCk7XG5cdFx0aWYgKGFueUhvc3RWaXNpYmxlICYmIHRoaXMuaXNGZWF0dXJlRW5hYmxlZCgpICYmIHRoaXMuaXNTdG9yZWRFbmFibGVkKCkgJiYgIXRoaXMuYWN0aXZlUmVmLnZhbHVlKSB7XG5cdFx0XHR0aGlzLmFjdGl2YXRlKC8qIHBlcnNpc3QgKi8gZmFsc2UpO1xuXHRcdH0gZWxzZSBpZiAoIWFueUhvc3RWaXNpYmxlKSB7XG5cdFx0XHQvLyBIb3N0IGhpZGU6IGRpc3Bvc2UgYW55IGFjdGl2ZSBhcXVhcml1bSBzeW5jaHJvbm91c2x5IEFORCBjYW5jZWxcblx0XHRcdC8vIGFueSBpbi1mbGlnaHQgYW5pbWF0ZWQgZXhpdCAoZnJvbSBhIHByaW9yIHVzZXIgdG9nZ2xlLW9mZikgc28gaXRcblx0XHRcdC8vIGNhbid0IGtlZXAgcGFpbnRpbmcgZmlzaCBiZWhpbmQgd2hhdGV2ZXIgdmlldyB0b29rIG91ciBwbGFjZS5cblx0XHRcdHRoaXMucGVuZGluZ0V4aXQuY2xlYXIoKTtcblx0XHRcdGlmICh0aGlzLmFjdGl2ZVJlZi52YWx1ZSkge1xuXHRcdFx0XHR0aGlzLmRlYWN0aXZhdGUoLyogcGVyc2lzdCAqLyBmYWxzZSwgLyogYW5pbWF0ZSAqLyBmYWxzZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBoYXNWaXNpYmxlTW91bnQoKTogYm9vbGVhbiB7XG5cdFx0Zm9yIChjb25zdCBtIG9mIHRoaXMubW91bnRzKSB7XG5cdFx0XHRpZiAobS5ob3N0VmlzaWJsZSkge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHJpdmF0ZSBpc0ZlYXR1cmVFbmFibGVkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KFNFU1NJT05TX0RFVkVMT1BFUl9KT1lfRU5BQkxFRF9TRVRUSU5HKSA9PT0gdHJ1ZTtcblx0fVxuXG5cdHByaXZhdGUgaXNTdG9yZWRFbmFibGVkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLnN0b3JhZ2VTZXJ2aWNlLmdldEJvb2xlYW4oRU5BQkxFRF9TVE9SQUdFX0tFWSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCBmYWxzZSk7XG5cdH1cblxuXHRwcml2YXRlIHNldFN0b3JlZEVuYWJsZWQoZW5hYmxlZDogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUoRU5BQkxFRF9TVE9SQUdFX0tFWSwgZW5hYmxlZCwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCBTdG9yYWdlVGFyZ2V0LlVTRVIpO1xuXHR9XG5cblx0cHJpdmF0ZSBhcHBseUZlYXR1cmVFbmFibGVkU3RhdGUoKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBtb3VudCBvZiB0aGlzLm1vdW50cykge1xuXHRcdFx0dGhpcy5hcHBseUZlYXR1cmVFbmFibGVkU3RhdGVGb3JCdXR0b24obW91bnQuYnV0dG9uKTtcblx0XHR9XG5cdFx0aWYgKCF0aGlzLmlzRmVhdHVyZUVuYWJsZWQoKSAmJiB0aGlzLmFjdGl2ZVJlZi52YWx1ZSkge1xuXHRcdFx0Ly8gU2V0dGluZyB0dXJuZWQgb2ZmIFx1MjAxNCBkb24ndCBwZXJzaXN0IHNvIHRoZSBwcmlvciBwcmVmZXJlbmNlIHN1cnZpdmVzIGEgcmUtZW5hYmxlLlxuXHRcdFx0dGhpcy5kZWFjdGl2YXRlKC8qIHBlcnNpc3QgKi8gZmFsc2UpO1xuXHRcdH0gZWxzZSBpZiAodGhpcy5pc0ZlYXR1cmVFbmFibGVkKCkpIHtcblx0XHRcdHRoaXMucmVjb25jaWxlQWN0aXZhdGlvbigpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXBwbHlGZWF0dXJlRW5hYmxlZFN0YXRlRm9yQnV0dG9uKGJ1dHRvbjogSFRNTEJ1dHRvbkVsZW1lbnQpOiB2b2lkIHtcblx0XHRidXR0b24uc3R5bGUuZGlzcGxheSA9IHRoaXMuaXNGZWF0dXJlRW5hYmxlZCgpICYmIHRoaXMuX2FjdGlvblZpc2libGUuZ2V0KCkgPyAnJyA6ICdub25lJztcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlVG9nZ2xlQnV0dG9uVmlzdWFsKGJ1dHRvbjogSFRNTEJ1dHRvbkVsZW1lbnQsIGFjdGl2ZTogYm9vbGVhbik6IHZvaWQge1xuXHRcdGJ1dHRvbi5jbGFzc0xpc3QudG9nZ2xlKCdhY3RpdmUnLCBhY3RpdmUpO1xuXHRcdHRoaXMuc3RyZWFrLmNvbGxlY3RFeHBpcmVkKCk7XG5cdFx0Y29uc3Qgc3RyZWFrID0gdGhpcy5zdHJlYWsuY291bnQ7XG5cdFx0Y29uc3QgcmV2aXZhYmxlID0gc3RyZWFrID4gMCA/IDAgOiB0aGlzLnN0cmVhay5yZXZpdmFibGVDb3VudDtcblx0XHRjb25zdCBodW5nZXJJY29uID0gRklTSF9IVU5HRVJfSUNPTlNbdGhpcy5zdHJlYWsuaHVuZ2VyU3RhdGVdO1xuXHRcdGNvbnN0IGljb24gPSBhY3RpdmUgPyBDb2RpY29uLmNsb3NlIDogaHVuZ2VySWNvbjtcblxuXHRcdC8vIEJ1aWxkIHRoZSBpY29uIGFzIGEgcmVhbCBET00gY2hpbGQgaW5zdGVhZCBvZiBpbm5lckhUTUwgdG8gc2F0aXNmeSBUcnVzdGVkIFR5cGVzLlxuXHRcdGJ1dHRvbi5yZXBsYWNlQ2hpbGRyZW4oKTtcblx0XHRjb25zdCBpY29uU3BhbiA9ICQ8SFRNTFNwYW5FbGVtZW50Pignc3BhbicpO1xuXHRcdC8vIFRoZSBpY29uIGlzIHB1cmVseSBkZWNvcmF0aXZlOyB0aGUgYnV0dG9uIGFscmVhZHkgaGFzIGFuIGFyaWEtbGFiZWwuXG5cdFx0aWNvblNwYW4uc2V0QXR0cmlidXRlKCdhcmlhLWhpZGRlbicsICd0cnVlJyk7XG5cdFx0YWRkSWNvbkNsYXNzZXMoaWNvblNwYW4sIGljb24pO1xuXHRcdGlmICghYWN0aXZlKSB7XG5cdFx0XHRidXR0b24uYXBwZW5kQ2hpbGQoaWNvblNwYW4pO1xuXHRcdH1cblxuXHRcdC8vIFN1cmZhY2UgdGhlIGZlZWRpbmcgc3RyZWFrIGFzIGEgdmlzaWJsZSBiYWRnZSBiZXNpZGUgdGhlIGljb24gKG5vdCBhXG5cdFx0Ly8gbm90aWZpY2F0aW9uKTogYSBsaXZlIHN0cmVhayBzaG93cyB0aGUgY291bnQsIHdoaWxlIGEgZGllZCBzdHJlYWtcblx0XHQvLyBzaG93cyBhIHF1aWV0IGhpbnQgdGhhdCBmZWVkaW5nIGEgZmlzaCB3aWxsIHJldml2ZSBpdC5cblx0XHRjb25zdCBzaG93U3RyZWFrID0gc3RyZWFrID4gMCB8fCByZXZpdmFibGUgPiAwO1xuXHRcdGJ1dHRvbi5jbGFzc0xpc3QudG9nZ2xlKCdoYXMtc3RyZWFrJywgc2hvd1N0cmVhayk7XG5cdFx0aWYgKHNob3dTdHJlYWspIHtcblx0XHRcdGNvbnN0IHN0cmVha1NwYW4gPSAkPEhUTUxTcGFuRWxlbWVudD4oJ3NwYW4nKTtcblx0XHRcdHN0cmVha1NwYW4uY2xhc3NOYW1lID0gJ2FnZW50cy1hcXVhcml1bS10b2dnbGUtc3RyZWFrJztcblx0XHRcdHN0cmVha1NwYW4uc2V0QXR0cmlidXRlKCdhcmlhLWhpZGRlbicsICd0cnVlJyk7XG5cdFx0XHRpZiAoYWN0aXZlKSB7XG5cdFx0XHRcdGNvbnN0IGh1bmdlckljb25TcGFuID0gJDxIVE1MU3BhbkVsZW1lbnQ+KCdzcGFuJyk7XG5cdFx0XHRcdGFkZEljb25DbGFzc2VzKGh1bmdlckljb25TcGFuLCBodW5nZXJJY29uKTtcblx0XHRcdFx0c3RyZWFrU3Bhbi5hcHBlbmRDaGlsZChodW5nZXJJY29uU3Bhbik7XG5cdFx0XHR9XG5cdFx0XHRpZiAoc3RyZWFrID4gMCkge1xuXHRcdFx0XHRzdHJlYWtTcGFuLmFwcGVuZChTdHJpbmcoc3RyZWFrKSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRzdHJlYWtTcGFuLmNsYXNzTGlzdC5hZGQoJ3Jldml2YWJsZScpO1xuXHRcdFx0XHRzdHJlYWtTcGFuLmFwcGVuZChsb2NhbGl6ZSgnYXF1YXJpdW0ucmV2aXZlQmFkZ2UnLCBcInswfSBcdTAwQjcgRmVlZCBhZ2FpbiB0byByZXZpdmVcIiwgcmV2aXZhYmxlKSk7XG5cdFx0XHR9XG5cdFx0XHRidXR0b24uYXBwZW5kQ2hpbGQoc3RyZWFrU3Bhbik7XG5cdFx0fVxuXHRcdGlmIChhY3RpdmUpIHtcblx0XHRcdGJ1dHRvbi5hcHBlbmRDaGlsZChpY29uU3Bhbik7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbGFiZWwgPSB0aGlzLmdldFRvZ2dsZUxhYmVsKGFjdGl2ZSk7XG5cdFx0YnV0dG9uLnNldEF0dHJpYnV0ZSgnYXJpYS1wcmVzc2VkJywgU3RyaW5nKGFjdGl2ZSkpO1xuXHRcdGJ1dHRvbi5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBsYWJlbCk7XG5cdH1cblxuXHRwcml2YXRlIGdldFRvZ2dsZUxhYmVsKGFjdGl2ZTogYm9vbGVhbik6IHN0cmluZyB7XG5cdFx0Y29uc3QgYmFzZSA9IGFjdGl2ZSA/IGxvY2FsaXplKCdhcXVhcml1bS5oaWRlJywgXCJIaWRlIEFxdWFyaXVtXCIpIDogbG9jYWxpemUoJ2FxdWFyaXVtLnNob3cnLCBcIlNob3cgQXF1YXJpdW1cIik7XG5cdFx0Y29uc3Qgc3RyZWFrID0gdGhpcy5zdHJlYWsuY291bnQ7XG5cdFx0aWYgKHN0cmVhayA+IDApIHtcblx0XHRcdGNvbnN0IGh1bmdlckRlc2NyaXB0aW9uID0gZ2V0RmlzaEh1bmdlckRlc2NyaXB0aW9uKHRoaXMuc3RyZWFrLmh1bmdlclN0YXRlKTtcblx0XHRcdHJldHVybiBzdHJlYWsgPT09IDFcblx0XHRcdFx0Ly8gYWxsb3ctYW55LXVuaWNvZGUtbmV4dC1saW5lXG5cdFx0XHRcdD8gbG9jYWxpemUoJ2FxdWFyaXVtLnN0cmVha0xhYmVsLm9uZScsIFwiezB9IFx1MjAxNCB7MX0gXHUyMDE0IHsyfSBkYXkgZmVlZGluZyBzdHJlYWtcIiwgYmFzZSwgaHVuZ2VyRGVzY3JpcHRpb24sIHN0cmVhaylcblx0XHRcdFx0Ly8gYWxsb3ctYW55LXVuaWNvZGUtbmV4dC1saW5lXG5cdFx0XHRcdDogbG9jYWxpemUoJ2FxdWFyaXVtLnN0cmVha0xhYmVsLm90aGVyJywgXCJ7MH0gXHUyMDE0IHsxfSBcdTIwMTQgezJ9IGRheXMgZmVlZGluZyBzdHJlYWtcIiwgYmFzZSwgaHVuZ2VyRGVzY3JpcHRpb24sIHN0cmVhayk7XG5cdFx0fVxuXHRcdGNvbnN0IHJldml2YWJsZSA9IHRoaXMuc3RyZWFrLnJldml2YWJsZUNvdW50O1xuXHRcdGlmIChyZXZpdmFibGUgPiAwKSB7XG5cdFx0XHQvLyBBIGRpZWQgc3RyZWFrIHRoYXQgY29tZXMgYmFjayB0byBsaWZlIGJ5IGZlZWRpbmcgYSBmaXNoIGFnYWluLlxuXHRcdFx0cmV0dXJuIHJldml2YWJsZSA9PT0gMVxuXHRcdFx0XHQ/IGxvY2FsaXplKCdhcXVhcml1bS5yZXZpdmVMYWJlbC5vbmUnLCBcInswfSBcdTIwMTQgZmVlZCBhIGZpc2ggdG8gcmV2aXZlIHlvdXIgezF9IGRheSBzdHJlYWtcIiwgYmFzZSwgcmV2aXZhYmxlKVxuXHRcdFx0XHQ6IGxvY2FsaXplKCdhcXVhcml1bS5yZXZpdmVMYWJlbC5vdGhlcicsIFwiezB9IFx1MjAxNCBmZWVkIGEgZmlzaCB0byByZXZpdmUgeW91ciB7MX0gZGF5IHN0cmVha1wiLCBiYXNlLCByZXZpdmFibGUpO1xuXHRcdH1cblx0XHRyZXR1cm4gYmFzZTtcblx0fVxuXG5cdHByaXZhdGUgdG9nZ2xlKCk6IHZvaWQge1xuXHRcdGNvbnN0IHdpbGxBY3RpdmF0ZSA9ICF0aGlzLmFjdGl2ZVJlZi52YWx1ZTtcblx0XHR0eXBlIEFxdWFyaXVtVG9nZ2xlRXZlbnQgPSB7XG5cdFx0XHRhY3RpdmF0ZWQ6IGJvb2xlYW47XG5cdFx0fTtcblx0XHR0eXBlIEFxdWFyaXVtVG9nZ2xlQ2xhc3NpZmljYXRpb24gPSB7XG5cdFx0XHRhY3RpdmF0ZWQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGlzTWVhc3VyZW1lbnQ6IHRydWU7IGNvbW1lbnQ6ICdXaGV0aGVyIHRoZSB0b2dnbGUgYWN0aXZhdGVkICh0cnVlKSBvciBkZWFjdGl2YXRlZCAoZmFsc2UpIHRoZSBhcXVhcml1bS4nIH07XG5cdFx0XHRvd25lcjogJ2p1c3RzY2hlbic7XG5cdFx0XHRjb21tZW50OiAnVHJhY2tzIGhvdyBvZnRlbiB1c2VycyBjbGljayB0aGUgQWdlbnRzIHdpbmRvdyBhcXVhcml1bSBlYXN0ZXItZWdnIHRvZ2dsZS4nO1xuXHRcdH07XG5cdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8QXF1YXJpdW1Ub2dnbGVFdmVudCwgQXF1YXJpdW1Ub2dnbGVDbGFzc2lmaWNhdGlvbj4oJ3ZzY29kZUFnZW50cy5hcXVhcml1bS90b2dnbGUnLCB7XG5cdFx0XHRhY3RpdmF0ZWQ6IHdpbGxBY3RpdmF0ZSxcblx0XHR9KTtcblx0XHRpZiAodGhpcy5hY3RpdmVSZWYudmFsdWUpIHtcblx0XHRcdHRoaXMuZGVhY3RpdmF0ZSgvKiBwZXJzaXN0ICovIHRydWUpO1xuXHRcdH0gZWxzZSBpZiAodGhpcy5oYXNWaXNpYmxlTW91bnQoKSkge1xuXHRcdFx0dGhpcy5hY3RpdmF0ZSgvKiBwZXJzaXN0ICovIHRydWUpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlQWxsVG9nZ2xlQnV0dG9uc1Zpc3VhbChhY3RpdmU6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IG1vdW50IG9mIHRoaXMubW91bnRzKSB7XG5cdFx0XHR0aGlzLnVwZGF0ZVRvZ2dsZUJ1dHRvblZpc3VhbChtb3VudC5idXR0b24sIGFjdGl2ZSk7XG5cdFx0fVxuXHRcdHRoaXMuc2NoZWR1bGVIdW5nZXJSZWZyZXNoKCk7XG5cdH1cblxuXHRwcml2YXRlIHNjaGVkdWxlSHVuZ2VyUmVmcmVzaCgpOiB2b2lkIHtcblx0XHR0aGlzLmh1bmdlclJlZnJlc2hTY2hlZHVsZXIuY2FuY2VsKCk7XG5cdFx0aWYgKHRoaXMubW91bnRzLnNpemUgPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgZGVsYXkgPSB0aGlzLnN0cmVhay5taWxsaXNlY29uZHNVbnRpbEh1bmdlclN0YXRlQ2hhbmdlO1xuXHRcdGlmIChkZWxheSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLmh1bmdlclJlZnJlc2hTY2hlZHVsZXIuc2NoZWR1bGUoZGVsYXkpO1xuXHRcdH1cblx0fVxuXG5cdC8qKiBAcGFyYW0gcGVyc2lzdCBmYWxzZSB3aGVuIHJlc3RvcmluZyBwcmV2aW91c2x5LXN0b3JlZCBzdGF0ZS4gKi9cblx0cHJpdmF0ZSBhY3RpdmF0ZShwZXJzaXN0OiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuYWN0aXZlUmVmLnZhbHVlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdC8vIENhbmNlbCBhbnkgaW4tZmxpZ2h0IGV4aXQgc28gaXRzIGRlbGF5ZWQgZGlzcG9zZSBjYW4ndCB0ZWFyIGRvd25cblx0XHQvLyB0aGUgbmV3IGFxdWFyaXVtJ3Mgc2hhcmVkIFNWRyBkZWZzLlxuXHRcdHRoaXMucGVuZGluZ0V4aXQuY2xlYXIoKTtcblx0XHRsZXQgYWN0aXZlOiBJQWN0aXZlQXF1YXJpdW0gfCB1bmRlZmluZWQ7XG5cdFx0dHJ5IHtcblx0XHRcdGFjdGl2ZSA9IGNyZWF0ZUFjdGl2ZUFxdWFyaXVtKHRoaXMubWFpbkNvbnRhaW5lciwgdGhpcy5sYXlvdXRTZXJ2aWNlLCB0aGlzLmFjY2Vzc2liaWxpdHlTZXJ2aWNlLCAoKSA9PiB0aGlzLmhhbmRsZUZpc2hGZWQoKSk7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0Y29uc29sZS5lcnJvcignW2FxdWFyaXVtXSBmYWlsZWQgdG8gYWN0aXZhdGUnLCBlKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Ly8gTm8gaG9zdCAoZS5nLiBjaGF0IGJhciBpc24ndCB2aXNpYmxlIHlldCkgXHUyMDE0IGxlYXZlIHRoZSB0b2dnbGVcblx0XHQvLyB1bnRvdWNoZWQgYW5kIGRvbid0IHBlcnNpc3Q7IGEgbGF0ZXIgdG9nZ2xlIGF0dGVtcHQgd2lsbCByZXRyeS5cblx0XHRpZiAoIWFjdGl2ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLmFjdGl2ZVJlZi52YWx1ZSA9IGFjdGl2ZTtcblx0XHR0aGlzLmFjdGl2ZUNvbnRleHRLZXkuc2V0KHRydWUpO1xuXHRcdHRoaXMudXBkYXRlQWxsVG9nZ2xlQnV0dG9uc1Zpc3VhbCh0cnVlKTtcblx0XHRpZiAocGVyc2lzdCkge1xuXHRcdFx0dGhpcy5zZXRTdG9yZWRFbmFibGVkKHRydWUpO1xuXHRcdH1cblx0XHQvLyBQYXJrIGEgc3RyZWFrIHRoYXQgYWdlZCBvdXQgd2hpbGUgdGhlIGFxdWFyaXVtIHdhcyBjbG9zZWQgc28gaXQgc2hvd3Ncblx0XHQvLyB1cCBhcyBhIHJldml2YWJsZSBiYWRnZSBvbiB0aGUgdG9nZ2xlLlxuXHRcdHRoaXMuc3RyZWFrLmNvbGxlY3RFeHBpcmVkKCk7XG5cdFx0dGhpcy51cGRhdGVBbGxUb2dnbGVCdXR0b25zVmlzdWFsKHRydWUpO1xuXHR9XG5cblx0LyoqIENhbGxlZCB3aGVuZXZlciBhIGZpc2ggZWF0cyBhIHBlbGxldC4gKi9cblx0cHJpdmF0ZSBoYW5kbGVGaXNoRmVkKCk6IHZvaWQge1xuXHRcdGNvbnN0IGJlZm9yZSA9IHRoaXMuc3RyZWFrLmNvdW50O1xuXHRcdGNvbnN0IHJlc3VsdCA9IHRoaXMuc3RyZWFrLnJlY29yZEZlZWQoKTtcblx0XHQvLyBSZWZyZXNoIHRoZSB0b2dnbGUgc28gdGhlIHN0cmVhayBiYWRnZSBzdGF5cyBpbiBzeW5jIChjb3VudCBjaGFuZ2Ugb3Jcblx0XHQvLyBhIGRpZWQgc3RyZWFrIHJldml2ZWQgYmFjayB0byBsaWZlIGJ5IHRoaXMgZmVlZCkuXG5cdFx0aWYgKHJlc3VsdC5jb3VudCAhPT0gYmVmb3JlIHx8IHJlc3VsdC5yZXZpdmVkKSB7XG5cdFx0XHR0aGlzLnVwZGF0ZUFsbFRvZ2dsZUJ1dHRvbnNWaXN1YWwoISF0aGlzLmFjdGl2ZVJlZi52YWx1ZSk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIEBwYXJhbSBwZXJzaXN0IGZhbHNlIHdoZW4gdGVhcmluZyBkb3duIGZvciBub24tdXNlciByZWFzb25zLlxuXHQgKiBAcGFyYW0gYW5pbWF0ZSBmYWxzZSB0byBkaXNwb3NlIHN5bmNocm9ub3VzbHkgKG5vIGZhZGUtb3V0KS4gVXNlZCBmb3Jcblx0ICogaG9zdC1kcml2ZW4gdGVhcmRvd24gd2hlcmUgcnVubmluZyBhIDkwMG1zIGZhZGUgd291bGQgbGV0IGZpc2ggc3RheVxuXHQgKiB2aXNpYmxlIHdoaWxlIHRoZSBuZXh0IHZpZXcgbGF5ZXJzIG9uIHRvcC5cblx0ICovXG5cdHByaXZhdGUgZGVhY3RpdmF0ZShwZXJzaXN0OiBib29sZWFuLCBhbmltYXRlOiBib29sZWFuID0gdHJ1ZSk6IHZvaWQge1xuXHRcdGlmICghYW5pbWF0ZSkge1xuXHRcdFx0dGhpcy5hY3RpdmVSZWYuY2xlYXIoKTtcblx0XHRcdHRoaXMuYWN0aXZlQ29udGV4dEtleS5zZXQoZmFsc2UpO1xuXHRcdFx0dGhpcy51cGRhdGVBbGxUb2dnbGVCdXR0b25zVmlzdWFsKGZhbHNlKTtcblx0XHRcdGlmIChwZXJzaXN0KSB7XG5cdFx0XHRcdHRoaXMuc2V0U3RvcmVkRW5hYmxlZChmYWxzZSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdC8vIERldGFjaCBmcm9tIGFjdGl2ZVJlZiBXSVRIT1VUIGRpc3Bvc2luZyAoY2xlYXJBbmRMZWFrKSBzbyB0aGUgZXhpdFxuXHRcdC8vIGFuaW1hdGlvbiBjYW4gcnVuOyB0aGUgcmV0dXJuZWQgaGFuZGxlIGZyb20gYWN0aXZlLmV4aXQoKSBpcyBwYXJrZWRcblx0XHQvLyBpbiBgcGVuZGluZ0V4aXRgIGFuZCBkaXNwb3NlcyB0aGUgdW5kZXJseWluZyBzdG9yZSBlaXRoZXIgd2hlbiB0aGVcblx0XHQvLyBhbmltYXRpb24gY29tcGxldGVzLCB3aGVuIHRoZSBzZXJ2aWNlIHRlYXJzIGRvd24sIG9yIHdoZW4gYSByYXBpZFxuXHRcdC8vIHJlLWFjdGl2YXRlIHJlcGxhY2VzIGl0LlxuXHRcdGNvbnN0IGFjdGl2ZSA9IHRoaXMuYWN0aXZlUmVmLmNsZWFyQW5kTGVhaygpO1xuXHRcdGlmICghYWN0aXZlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuYWN0aXZlQ29udGV4dEtleS5zZXQoZmFsc2UpO1xuXHRcdHRoaXMudXBkYXRlQWxsVG9nZ2xlQnV0dG9uc1Zpc3VhbChmYWxzZSk7XG5cdFx0Y29uc3QgcGVuZGluZyA9IGFjdGl2ZS5leGl0KCgpID0+IHtcblx0XHRcdGlmICh0aGlzLnBlbmRpbmdFeGl0LnZhbHVlID09PSBwZW5kaW5nKSB7XG5cdFx0XHRcdHRoaXMucGVuZGluZ0V4aXQuY2xlYXIoKTtcblx0XHRcdH1cblx0XHR9KTtcblx0XHR0aGlzLnBlbmRpbmdFeGl0LnZhbHVlID0gcGVuZGluZztcblx0XHRpZiAocGVyc2lzdCkge1xuXHRcdFx0dGhpcy5zZXRTdG9yZWRFbmFibGVkKGZhbHNlKTtcblx0XHR9XG5cdH1cbn1cblxuaW50ZXJmYWNlIElBY3RpdmVBcXVhcml1bSBleHRlbmRzIElEaXNwb3NhYmxlIHtcblx0LyoqXG5cdCAqIFRyaWdnZXIgdGhlIGV4aXQgYW5pbWF0aW9uIGFuZCBkaXNwb3NlIHdoZW4gaXQgY29tcGxldGVzLiBEaXNwb3NpbmcgdGhlXG5cdCAqIHJldHVybmVkIGhhbmRsZSBiZWZvcmUgdGhlIGFuaW1hdGlvbiBmaW5pc2hlcyBkaXNwb3NlcyBpbW1lZGlhdGVseS5cblx0ICovXG5cdGV4aXQob25EaWRDb21wbGV0ZTogKCkgPT4gdm9pZCk6IElEaXNwb3NhYmxlO1xufVxuXG4vKipcbiAqIEJ1aWxkIHRoZSBsaXZlIGFxdWFyaXVtOiB3YXRlciwgZmlzaCwgZm9vZCwgbW91c2UgaGFuZGxpbmcsIFJBRiBsb29wLlxuICogUmV0dXJucyBgdW5kZWZpbmVkYCBpZiB0aGUgY2hhdCBiYXIgaXNuJ3QgYXZhaWxhYmxlIHNvIGNhbGxlcnMgY2FuIGJhaWxcbiAqIHdpdGhvdXQgbGVhdmluZyB0aGUgdG9nZ2xlIGJ1dHRvbiBzdHVjayBpbiBhbiBcImFjdGl2ZSBidXQgaW52aXNpYmxlXCIgc3RhdGUuXG4gKi9cbmZ1bmN0aW9uIGNyZWF0ZUFjdGl2ZUFxdWFyaXVtKG1haW5Db250YWluZXI6IEhUTUxFbGVtZW50LCBsYXlvdXRTZXJ2aWNlOiBJV29ya2JlbmNoTGF5b3V0U2VydmljZSwgYWNjZXNzaWJpbGl0eVNlcnZpY2U6IElBY2Nlc3NpYmlsaXR5U2VydmljZSwgb25GaXNoRmVkPzogKCkgPT4gdm9pZCk6IElBY3RpdmVBcXVhcml1bSB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IHRhcmdldFdpbmRvdyA9IGdldFdpbmRvdyhtYWluQ29udGFpbmVyKTtcblxuXHQvLyBIb3N0IGluc2lkZSB0aGUgY2hhdCBiYXIgc28gY2hhdCBpbnB1dCBVSSBuYXR1cmFsbHkgcGFpbnRzIG9uIHRvcCBcdTIwMTRcblx0Ly8gbm8gei1pbmRleCBneW1uYXN0aWNzIHJlcXVpcmVkLlxuXHRjb25zdCBzZXNzaW9uc0NvbnRhaW5lciA9IGxheW91dFNlcnZpY2UuZ2V0Q29udGFpbmVyKHRhcmdldFdpbmRvdywgUGFydHMuU0VTU0lPTlNfUEFSVCk7XG5cdGlmICghc2Vzc2lvbnNDb250YWluZXIgfHwgIWxheW91dFNlcnZpY2UuaXNWaXNpYmxlKFBhcnRzLlNFU1NJT05TX1BBUlQsIHRhcmdldFdpbmRvdykpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdGNvbnN0IHdhdGVyID0gJCgnLmFnZW50cy1hcXVhcml1bS13YXRlcicpO1xuXHQvLyBEZWNvcmF0aXZlOiBoaWRlIHRoZSBlbnRpcmUgc3VidHJlZSBmcm9tIGExMXkgdHJlZS5cblx0d2F0ZXIuc2V0QXR0cmlidXRlKCdhcmlhLWhpZGRlbicsICd0cnVlJyk7XG5cdC8vIEZpcnN0IGNoaWxkIHNvIHN1YnNlcXVlbnQgY2hhdCBiYXIgY29udGVudCBwYWludHMgb3ZlciBpdC5cblx0c2Vzc2lvbnNDb250YWluZXIuaW5zZXJ0QmVmb3JlKHdhdGVyLCBzZXNzaW9uc0NvbnRhaW5lci5maXJzdENoaWxkKTtcblx0Ly8gU2Vzc2lvbnMgR3JpZCB3cmFwcyB0aGUgY2hhdCBjb250ZW50IGluIGAuc2Vzc2lvbi12aWV3YCAvIGAuc2Vzc2lvbi12aWV3LWNvbnRlbnRgXG5cdC8vIHdpdGggb3BhcXVlIGJhY2tncm91bmRzIChzZWUgc2Vzc2lvbnNQYXJ0LmNzcykuIE1hcmsgdGhlIHBhcnQgc28gYSBzY29wZWRcblx0Ly8gQ1NTIG92ZXJyaWRlIGNhbiBjbGVhciB0aG9zZSBiYWNrZ3JvdW5kcyBhbmQgbGV0IHRoZSB3YXRlciBsYXllciBzaG93IHRocm91Z2guXG5cdHNlc3Npb25zQ29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ2FxdWFyaXVtLWFjdGl2ZScpO1xuXHRzdG9yZS5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHR3YXRlci5yZW1vdmUoKTtcblx0XHRzZXNzaW9uc0NvbnRhaW5lci5jbGFzc0xpc3QucmVtb3ZlKCdhcXVhcml1bS1hY3RpdmUnKTtcblx0fSkpO1xuXG5cdGNvbnN0IGZpc2hMYXllciA9ICQoJy5hZ2VudHMtYXF1YXJpdW0tZmlzaC1sYXllcicpO1xuXHR3YXRlci5hcHBlbmRDaGlsZChmaXNoTGF5ZXIpO1xuXG5cdGNvbnN0IGZvb2RMYXllciA9ICQoJy5hZ2VudHMtYXF1YXJpdW0tZm9vZC1sYXllcicpO1xuXHR3YXRlci5hcHBlbmRDaGlsZChmb29kTGF5ZXIpO1xuXG5cdGNvbnN0IGJvdW5kcyA9IHsgd2lkdGg6IDAsIGhlaWdodDogMCB9O1xuXHQvLyBDYWNoZWQgc28gdGhlIHBlci1tb3VzZW1vdmUgaGFuZGxlciBkb2Vzbid0IHRyaWdnZXIgYSBsYXlvdXQgZmx1c2guXG5cdGNvbnN0IHdhdGVyU2NyZWVuT2Zmc2V0ID0geyBsZWZ0OiAwLCB0b3A6IDAgfTtcblx0Y29uc3QgdXBkYXRlQm91bmRzID0gKCkgPT4ge1xuXHRcdGJvdW5kcy53aWR0aCA9IHdhdGVyLmNsaWVudFdpZHRoO1xuXHRcdGJvdW5kcy5oZWlnaHQgPSB3YXRlci5jbGllbnRIZWlnaHQ7XG5cdFx0Y29uc3QgcmVjdCA9IHdhdGVyLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuXHRcdHdhdGVyU2NyZWVuT2Zmc2V0LmxlZnQgPSByZWN0LmxlZnQ7XG5cdFx0d2F0ZXJTY3JlZW5PZmZzZXQudG9wID0gcmVjdC50b3A7XG5cdH07XG5cblx0Y29uc3QgZmlzaDogRmlzaFtdID0gW107XG5cblx0dXBkYXRlQm91bmRzKCk7XG5cdGNvbnN0IHJlc2l6ZU9ic2VydmVyID0gbmV3IFJlc2l6ZU9ic2VydmVyKCgpID0+IHtcblx0XHR1cGRhdGVCb3VuZHMoKTtcblx0XHRmb3IgKGNvbnN0IGYgb2YgZmlzaCkge1xuXHRcdFx0Zi5wb3NpdGlvblggPSBNYXRoLm1pbihmLnBvc2l0aW9uWCwgTWF0aC5tYXgoMCwgYm91bmRzLndpZHRoIC0gZi5zaXplKSk7XG5cdFx0XHRmLnBvc2l0aW9uWSA9IE1hdGgubWluKGYucG9zaXRpb25ZLCBNYXRoLm1heCgwLCBib3VuZHMuaGVpZ2h0IC0gZi5zaXplKSk7XG5cdFx0fVxuXHR9KTtcblx0cmVzaXplT2JzZXJ2ZXIub2JzZXJ2ZSh3YXRlcik7XG5cdHN0b3JlLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gcmVzaXplT2JzZXJ2ZXIuZGlzY29ubmVjdCgpKSk7XG5cblx0Zm9yIChsZXQgaSA9IDA7IGkgPCBGSVNIX0NPVU5UOyBpKyspIHtcblx0XHRjb25zdCBzaXplID0gcmFuZG9tQmV0d2VlbihGSVNIX01JTl9TSVpFLCBGSVNIX01BWF9TSVpFKTtcblx0XHRjb25zdCBhbmdsZSA9IE1hdGgucmFuZG9tKCkgKiBNYXRoLlBJICogMjtcblx0XHRjb25zdCBzcGVlZCA9IHJhbmRvbUJldHdlZW4oQkFTRV9TUEVFRCAqIDAuNiwgQkFTRV9TUEVFRCAqIDEuMik7XG5cdFx0Y29uc3QgZiA9IG5ldyBGaXNoKHtcblx0XHRcdHNwZWNpZXM6IHBpY2tSYW5kb21TcGVjaWVzKCksXG5cdFx0XHRzaXplLFxuXHRcdFx0cG9zaXRpb25YOiByYW5kb21CZXR3ZWVuKDAsIE1hdGgubWF4KDEsIGJvdW5kcy53aWR0aCAtIHNpemUpKSxcblx0XHRcdHBvc2l0aW9uWTogcmFuZG9tQmV0d2VlbigwLCBNYXRoLm1heCgxLCBib3VuZHMuaGVpZ2h0IC0gc2l6ZSkpLFxuXHRcdFx0dmVsb2NpdHlYOiBNYXRoLmNvcyhhbmdsZSkgKiBzcGVlZCxcblx0XHRcdHZlbG9jaXR5WTogTWF0aC5zaW4oYW5nbGUpICogc3BlZWQsXG5cdFx0fSwgdGFyZ2V0V2luZG93LmRvY3VtZW50KTtcblx0XHRmaXNoLnB1c2goZik7XG5cdH1cblx0Ly8gU3Bhd24gaW4gdHdvIGJhdGNoZXM6IGZpcnN0IGhhbGYgc3luY2hyb25vdXMgKHNpbmdsZSBsYXlvdXQgcGFzcyB2aWFcblx0Ly8gRG9jdW1lbnRGcmFnbWVudCksIHJlc3Qgb24gdGhlIG5leHQgZnJhbWUgc28gdGhlIHRvZ2dsZSBjbGljayBzdGF5cyBzbmFwcHkuXG5cdGNvbnN0IFNZTkNfQkFUQ0ggPSBNYXRoLmNlaWwoRklTSF9DT1VOVCAvIDIpO1xuXHRjb25zdCBmaXJzdEJhdGNoID0gdGFyZ2V0V2luZG93LmRvY3VtZW50LmNyZWF0ZURvY3VtZW50RnJhZ21lbnQoKTtcblx0Zm9yIChsZXQgaSA9IDA7IGkgPCBNYXRoLm1pbihTWU5DX0JBVENILCBmaXNoLmxlbmd0aCk7IGkrKykge1xuXHRcdGZpcnN0QmF0Y2guYXBwZW5kQ2hpbGQoZmlzaFtpXS5lbGVtZW50KTtcblx0fVxuXHRmaXNoTGF5ZXIuYXBwZW5kQ2hpbGQoZmlyc3RCYXRjaCk7XG5cdGxldCBleGl0aW5nID0gZmFsc2U7XG5cblx0aWYgKFNZTkNfQkFUQ0ggPCBmaXNoLmxlbmd0aCkge1xuXHRcdGNvbnN0IGRlZmVycmVkID0gc2NoZWR1bGVBdE5leHRBbmltYXRpb25GcmFtZSh0YXJnZXRXaW5kb3csICgpID0+IHtcblx0XHRcdGlmIChleGl0aW5nKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHJlc3RCYXRjaCA9IHRhcmdldFdpbmRvdy5kb2N1bWVudC5jcmVhdGVEb2N1bWVudEZyYWdtZW50KCk7XG5cdFx0XHRmb3IgKGxldCBpID0gU1lOQ19CQVRDSDsgaSA8IGZpc2gubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0cmVzdEJhdGNoLmFwcGVuZENoaWxkKGZpc2hbaV0uZWxlbWVudCk7XG5cdFx0XHR9XG5cdFx0XHRmaXNoTGF5ZXIuYXBwZW5kQ2hpbGQocmVzdEJhdGNoKTtcblx0XHRcdC8vIEFkZCBgLnZpc2libGVgIG9uIHRoZSBORVhUIGZyYW1lIHNvIGEgcGFpbnQgYXQgb3BhY2l0eTowIGhhcHBlbnNcblx0XHRcdC8vIGZpcnN0IFx1MjAxNCBndWFyYW50ZWVzIHRoZSBDU1MgdHJhbnNpdGlvbiBmaXJlcy5cblx0XHRcdGNvbnN0IGZhZGVJbiA9IHNjaGVkdWxlQXROZXh0QW5pbWF0aW9uRnJhbWUodGFyZ2V0V2luZG93LCAoKSA9PiB7XG5cdFx0XHRcdGlmIChleGl0aW5nKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGZvciAobGV0IGkgPSBTWU5DX0JBVENIOyBpIDwgZmlzaC5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRcdGNvbnN0IGxvY2FsSW5kZXggPSBpIC0gU1lOQ19CQVRDSDtcblx0XHRcdFx0XHRjb25zdCBkZWxheSA9IE1hdGgubWluKGxvY2FsSW5kZXggKiAxMiwgNDAwKTtcblx0XHRcdFx0XHRmaXNoW2ldLmVsZW1lbnQuc3R5bGUudHJhbnNpdGlvbkRlbGF5ID0gYCR7ZGVsYXl9bXNgO1xuXHRcdFx0XHRcdGZpc2hbaV0uZWxlbWVudC5jbGFzc0xpc3QuYWRkKCd2aXNpYmxlJyk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdFx0c3RvcmUuYWRkKGZhZGVJbik7XG5cdFx0fSk7XG5cdFx0c3RvcmUuYWRkKGRlZmVycmVkKTtcblx0fVxuXHRzdG9yZS5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRmb3IgKGNvbnN0IGYgb2YgZmlzaCkge1xuXHRcdFx0Zi5lbGVtZW50LnJlbW92ZSgpO1xuXHRcdH1cblx0XHQvLyBUZWFyIGRvd24gc2hhcmVkIFNWRyBkZWZzIHNvIHdlIGRvbid0IGxlYWsgYWNyb3NzIHJlbG9hZHMuXG5cdFx0ZGlzcG9zZVNoYXJlZEZpc2hEZWZzKHRhcmdldFdpbmRvdy5kb2N1bWVudCk7XG5cdH0pKTtcblxuXHRjb25zdCBmb29kOiBJRm9vZFBlbGxldFtdID0gW107XG5cdGNvbnN0IHJlbW92ZUZvb2QgPSAocGVsbGV0OiBJRm9vZFBlbGxldCkgPT4ge1xuXHRcdGNvbnN0IGlkeCA9IGZvb2QuaW5kZXhPZihwZWxsZXQpO1xuXHRcdGlmIChpZHggIT09IC0xKSB7XG5cdFx0XHRmb29kLnNwbGljZShpZHgsIDEpO1xuXHRcdFx0cGVsbGV0LmVsZW1lbnQucmVtb3ZlKCk7XG5cdFx0fVxuXHR9O1xuXG5cdC8vIExpc3RlbiBvbiB0aGUgbWFpbiBjb250YWluZXIgc28gd2UgYWx3YXlzIGtub3cgY3Vyc29yIHBvc2l0aW9uIGV2ZW5cblx0Ly8gd2hlbiBvdmVyIHRoZSBjaGF0IGlucHV0ICh3YXRlciBoYXMgcG9pbnRlci1ldmVudHM6bm9uZSkuXG5cdC8vXG5cdC8vIENvYWxlc2NlIHVwZGF0ZUJvdW5kcygpIGFjcm9zcyBzY3JvbGwvcmVzaXplIHN0b3Jtczogc2Nyb2xsIHdpdGggY2FwdHVyZVxuXHQvLyBmaXJlcyBmb3IgQU5ZIGRlc2NlbmRhbnQgc2Nyb2xsLCBhbmQgdXBkYXRlQm91bmRzKCkgcmVhZHMgbGF5b3V0LiBNYXJrXG5cdC8vIGRpcnR5IGhlcmUgYW5kIGxldCB0aGUgUkFGIHRpY2sgcmVmcmVzaCBhdCBtb3N0IG9uY2UgcGVyIGZyYW1lLlxuXHRsZXQgYm91bmRzRGlydHkgPSBmYWxzZTtcblx0Y29uc3QgbWFya0JvdW5kc0RpcnR5ID0gKCkgPT4geyBib3VuZHNEaXJ0eSA9IHRydWU7IH07XG5cdHN0b3JlLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIodGFyZ2V0V2luZG93LCBFdmVudFR5cGUuUkVTSVpFLCBtYXJrQm91bmRzRGlydHksIHsgcGFzc2l2ZTogdHJ1ZSB9KSk7XG5cdHN0b3JlLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIodGFyZ2V0V2luZG93LCAnc2Nyb2xsJywgbWFya0JvdW5kc0RpcnR5LCB7IHBhc3NpdmU6IHRydWUsIGNhcHR1cmU6IHRydWUgfSkpO1xuXG5cdGxldCBtb3VzZVggPSAtMWU2O1xuXHRsZXQgbW91c2VZID0gLTFlNjtcblx0Y29uc3QgcmVzZXRNb3VzZVBvc2l0aW9uID0gKCkgPT4ge1xuXHRcdG1vdXNlWCA9IC0xZTY7XG5cdFx0bW91c2VZID0gLTFlNjtcblx0fTtcblx0Ly8gR2VuZXJpYyBoZWxwZXJzIHNvIHRoaXMgYWxzbyB3b3JrcyB1bmRlciBpT1MgcG9pbnRlciBldmVudHMuXG5cdHN0b3JlLmFkZChhZGREaXNwb3NhYmxlR2VuZXJpY01vdXNlTW92ZUxpc3RlbmVyKG1haW5Db250YWluZXIsIChlOiBNb3VzZUV2ZW50KSA9PiB7XG5cdFx0bW91c2VYID0gZS5jbGllbnRYIC0gd2F0ZXJTY3JlZW5PZmZzZXQubGVmdDtcblx0XHRtb3VzZVkgPSBlLmNsaWVudFkgLSB3YXRlclNjcmVlbk9mZnNldC50b3A7XG5cdH0pKTtcblx0Ly8gQm90aCBtb3VzZWxlYXZlIEFORCBwb2ludGVybGVhdmUgc28gcmVzZXQgd29ya3Mgb24gdG91Y2gvcG9pbnRlci1vbmx5IHBsYXRmb3Jtcy5cblx0c3RvcmUuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihtYWluQ29udGFpbmVyLCBFdmVudFR5cGUuTU9VU0VfTEVBVkUsIHJlc2V0TW91c2VQb3NpdGlvbiwgeyBwYXNzaXZlOiB0cnVlIH0pKTtcblx0c3RvcmUuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihtYWluQ29udGFpbmVyLCBFdmVudFR5cGUuUE9JTlRFUl9MRUFWRSwgcmVzZXRNb3VzZVBvc2l0aW9uLCB7IHBhc3NpdmU6IHRydWUgfSkpO1xuXG5cdHN0b3JlLmFkZChhZGREaXNwb3NhYmxlR2VuZXJpY01vdXNlRG93bkxpc3RlbmVyKG1haW5Db250YWluZXIsIChlOiBNb3VzZUV2ZW50KSA9PiB7XG5cdFx0Ly8gT25seSBzcGF3biBmb29kIG9uIHBsYWluIGxlZnQgY2xpY2tzIGFnYWluc3QgYmFja2dyb3VuZC1pc2ggc3VyZmFjZXMuXG5cdFx0aWYgKGUuYnV0dG9uICE9PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHRhcmdldCA9IGUudGFyZ2V0IGFzIEhUTUxFbGVtZW50IHwgbnVsbDtcblx0XHRpZiAoIWlzQmFja2dyb3VuZENsaWNrKHRhcmdldCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Ly8gUmVmcmVzaCBvbmNlIHRvIGJlIHNhZmUgKG1vdXNlZG93biBpcyByYXJlKS5cblx0XHR1cGRhdGVCb3VuZHMoKTtcblx0XHRjb25zdCBkcm9wWCA9IGUuY2xpZW50WCAtIHdhdGVyU2NyZWVuT2Zmc2V0LmxlZnQ7XG5cdFx0Y29uc3QgZHJvcFkgPSBlLmNsaWVudFkgLSB3YXRlclNjcmVlbk9mZnNldC50b3A7XG5cdFx0aWYgKGRyb3BYIDwgMCB8fCBkcm9wWSA8IDAgfHwgZHJvcFggPiBib3VuZHMud2lkdGggfHwgZHJvcFkgPiBib3VuZHMuaGVpZ2h0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHNwYXduRm9vZChkcm9wWCwgZHJvcFkpO1xuXHR9KSk7XG5cblx0ZnVuY3Rpb24gc3Bhd25Gb29kKGRyb3BYOiBudW1iZXIsIGRyb3BZOiBudW1iZXIpOiB2b2lkIHtcblx0XHQvLyBDYXAgY29uY3VycmVudCBmb29kOiBkcm9wIHRoZSBvbGRlc3QgcGVsbGV0IHRvIG1ha2Ugcm9vbS5cblx0XHR3aGlsZSAoZm9vZC5sZW5ndGggPj0gTUFYX0ZPT0QpIHtcblx0XHRcdGNvbnN0IG9sZGVzdCA9IGZvb2RbMF07XG5cdFx0XHRyZW1vdmVGb29kKG9sZGVzdCk7XG5cdFx0fVxuXHRcdGNvbnN0IGVsID0gJDxIVE1MRGl2RWxlbWVudD4oJy5hZ2VudHMtYXF1YXJpdW0tZm9vZCcpO1xuXHRcdGVsLnN0eWxlLnRyYW5zZm9ybSA9IGB0cmFuc2xhdGUoJHtkcm9wWH1weCwgJHtkcm9wWX1weClgO1xuXHRcdGZvb2RMYXllci5hcHBlbmRDaGlsZChlbCk7XG5cdFx0Zm9vZC5wdXNoKHsgZWxlbWVudDogZWwsIHBvc2l0aW9uWDogZHJvcFgsIHBvc2l0aW9uWTogZHJvcFksIGZhbGxTcGVlZDogcmFuZG9tQmV0d2VlbigyMCwgMzUpIH0pO1xuXHR9XG5cblx0bGV0IGxhc3RGcmFtZSA9IHBlcmZvcm1hbmNlLm5vdygpO1xuXHRsZXQgcmFmRGlzcG9zYWJsZTogSURpc3Bvc2FibGUgfCB1bmRlZmluZWQ7XG5cblx0Y29uc3Qgc3RvcEFuaW1hdGlvbiA9ICgpID0+IHtcblx0XHRyYWZEaXNwb3NhYmxlPy5kaXNwb3NlKCk7XG5cdFx0cmFmRGlzcG9zYWJsZSA9IHVuZGVmaW5lZDtcblx0fTtcblx0Y29uc3Qgc3RhcnRBbmltYXRpb24gPSAoKSA9PiB7XG5cdFx0aWYgKHJhZkRpc3Bvc2FibGUgfHwgYWNjZXNzaWJpbGl0eVNlcnZpY2UuaXNNb3Rpb25SZWR1Y2VkKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0bGFzdEZyYW1lID0gcGVyZm9ybWFuY2Uubm93KCk7XG5cdFx0cmFmRGlzcG9zYWJsZSA9IHNjaGVkdWxlQXROZXh0QW5pbWF0aW9uRnJhbWUodGFyZ2V0V2luZG93LCB0aWNrKTtcblx0fTtcblxuXHRjb25zdCB0aWNrID0gKCkgPT4ge1xuXHRcdHJhZkRpc3Bvc2FibGUgPSB1bmRlZmluZWQ7XG5cdFx0Y29uc3Qgbm93ID0gcGVyZm9ybWFuY2Uubm93KCk7XG5cdFx0Y29uc3QgZWxhcHNlZE1zID0gbm93IC0gbGFzdEZyYW1lO1xuXHRcdGlmIChlbGFwc2VkTXMgPCBBQ1RJVkVfRlJBTUVfSU5URVJWQUxfTVMpIHtcblx0XHRcdHJhZkRpc3Bvc2FibGUgPSBzY2hlZHVsZUF0TmV4dEFuaW1hdGlvbkZyYW1lKHRhcmdldFdpbmRvdywgdGljayk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZHRNcyA9IE1hdGgubWluKGVsYXBzZWRNcywgMTAwKTsgLy8gY2xhbXAgYmlnIHN0YWxsc1xuXHRcdGNvbnN0IGR0ID0gZHRNcyAvIDEwMDA7XG5cdFx0bGFzdEZyYW1lID0gbm93O1xuXG5cdFx0aWYgKGJvdW5kc0RpcnR5KSB7XG5cdFx0XHRib3VuZHNEaXJ0eSA9IGZhbHNlO1xuXHRcdFx0dXBkYXRlQm91bmRzKCk7XG5cdFx0fVxuXG5cdFx0Ly8gU2tpcCB3b3JrIHdoZW4gd2luZG93IGlzIGhpZGRlbiAoUkFGIHN0YXlzIGFsaXZlIGxhemlseSkuXG5cdFx0aWYgKCFhY2Nlc3NpYmlsaXR5U2VydmljZS5pc01vdGlvblJlZHVjZWQoKSAmJiB0YXJnZXRXaW5kb3cuZG9jdW1lbnQudmlzaWJpbGl0eVN0YXRlICE9PSAnaGlkZGVuJykge1xuXHRcdFx0dXBkYXRlRm9vZChkdCk7XG5cdFx0XHR1cGRhdGVGaXNoKGR0KTtcblx0XHR9XG5cblx0XHRpZiAoIWFjY2Vzc2liaWxpdHlTZXJ2aWNlLmlzTW90aW9uUmVkdWNlZCgpKSB7XG5cdFx0XHRyYWZEaXNwb3NhYmxlID0gc2NoZWR1bGVBdE5leHRBbmltYXRpb25GcmFtZSh0YXJnZXRXaW5kb3csIHRpY2spO1xuXHRcdH1cblx0fTtcblxuXHRmdW5jdGlvbiB1cGRhdGVGb29kKGR0OiBudW1iZXIpOiB2b2lkIHtcblx0XHRmb3IgKGxldCBpID0gZm9vZC5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuXHRcdFx0Y29uc3QgcGVsbGV0ID0gZm9vZFtpXTtcblx0XHRcdHBlbGxldC5wb3NpdGlvblkgKz0gcGVsbGV0LmZhbGxTcGVlZCAqIGR0O1xuXHRcdFx0cGVsbGV0LmVsZW1lbnQuc3R5bGUudHJhbnNmb3JtID0gYHRyYW5zbGF0ZSgke3BlbGxldC5wb3NpdGlvblgudG9GaXhlZCgxKX1weCwgJHtwZWxsZXQucG9zaXRpb25ZLnRvRml4ZWQoMSl9cHgpYDtcblx0XHRcdGlmIChwZWxsZXQucG9zaXRpb25ZID4gYm91bmRzLmhlaWdodCArIDEwKSB7XG5cdFx0XHRcdHJlbW92ZUZvb2QocGVsbGV0KTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRmdW5jdGlvbiB1cGRhdGVGaXNoKGR0OiBudW1iZXIpOiB2b2lkIHtcblx0XHRjb25zdCBub3cgPSBwZXJmb3JtYW5jZS5ub3coKTtcblx0XHRmb3IgKGNvbnN0IGYgb2YgZmlzaCkge1xuXHRcdFx0Y29uc3QgY2VudGVyWCA9IGYucG9zaXRpb25YICsgZi5zaXplIC8gMjtcblx0XHRcdGNvbnN0IGNlbnRlclkgPSBmLnBvc2l0aW9uWSArIGYuc2l6ZSAvIDI7XG5cblx0XHRcdC8vIFdhbGwgc3RlZXJpbmc6IHR1cm4gdGhlIGhlYWRpbmcgKG5vdCBqdXN0IGFjY2VsZXJhdGlvbikgYXdheSBmcm9tXG5cdFx0XHQvLyB3YWxscywgb3RoZXJ3aXNlIGZpc2ggcGFyayBhZ2FpbnN0IHRoZSBlZGdlIHdpdGggdGhlaXIgdGhydXN0XG5cdFx0XHQvLyBwaW5uaW5nIHRoZW0gaW4gcGxhY2UuXG5cdFx0XHRjb25zdCB3YWxsRXNjYXBlQW5nbGUgPSBjb21wdXRlV2FsbEF2b2lkQW5nbGUoY2VudGVyWCwgY2VudGVyWSwgYm91bmRzLndpZHRoLCBib3VuZHMuaGVpZ2h0KTtcblx0XHRcdGlmICh3YWxsRXNjYXBlQW5nbGUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHQvLyBUdXJuIGF0IHVwIHRvIDQgcmFkL3MgdG93YXJkIHRoZSBzYWZlIGRpcmVjdGlvbi5cblx0XHRcdFx0Y29uc3QgdHVybkRlbHRhID0gc2hvcnRlc3RBbmdsZURlbHRhKGYud2FuZGVyQW5nbGUsIHdhbGxFc2NhcGVBbmdsZSk7XG5cdFx0XHRcdGNvbnN0IG1heFR1cm5QZXJGcmFtZSA9IDQgKiBkdDtcblx0XHRcdFx0Zi53YW5kZXJBbmdsZSArPSBNYXRoLm1heCgtbWF4VHVyblBlckZyYW1lLCBNYXRoLm1pbihtYXhUdXJuUGVyRnJhbWUsIHR1cm5EZWx0YSkpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8gRnJlZSB3YXRlcjogZHJpZnQgdGhlIGhlYWRpbmcgYnkgYSBzbWFsbCByYW5kb20gZGVsdGEuXG5cdFx0XHRcdGYud2FuZGVyQW5nbGUgKz0gKE1hdGgucmFuZG9tKCkgLSAwLjUpICogMS4yICogZHQgKyAoTWF0aC5yYW5kb20oKSAtIDAuNSkgKiAwLjA0O1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCB0aHJ1c3QgPSAzMjtcblx0XHRcdGxldCBhY2NlbFggPSBNYXRoLmNvcyhmLndhbmRlckFuZ2xlKSAqIHRocnVzdDtcblx0XHRcdGxldCBhY2NlbFkgPSBNYXRoLnNpbihmLndhbmRlckFuZ2xlKSAqIHRocnVzdDtcblxuXHRcdFx0Ly8gU3BvbnRhbmVvdXMgZGFydCB3aXRoIGJyaWVmIHBhbmljIHNvIGl0IGNhbiBleGNlZWQgbm9ybWFsIG1heCBzcGVlZC5cblx0XHRcdGlmIChNYXRoLnJhbmRvbSgpIDwgREFSVF9SQVRFX1BFUl9TRUNPTkQgKiBkdCkge1xuXHRcdFx0XHRjb25zdCBkYXJ0QW5nbGUgPSBNYXRoLnJhbmRvbSgpICogTWF0aC5QSSAqIDI7XG5cdFx0XHRcdGYudmVsb2NpdHlYICs9IE1hdGguY29zKGRhcnRBbmdsZSkgKiBEQVJUX0lNUFVMU0U7XG5cdFx0XHRcdGYudmVsb2NpdHlZICs9IE1hdGguc2luKGRhcnRBbmdsZSkgKiBEQVJUX0lNUFVMU0U7XG5cdFx0XHRcdGYucGFuaWNVbnRpbCA9IG5vdyArIFBBTklDX0RVUkFUSU9OX01TO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBXYWxsIHJlcGVsIFx1MjAxNCBiYWNrc3RvcCBzbyBhIGZpc2ggZW50ZXJpbmcgdGhlIG1hcmdpbiBpcyBwdXNoZWQgaW53YXJkIGltbWVkaWF0ZWx5LlxuXHRcdFx0aWYgKGNlbnRlclggPCBXQUxMX01BUkdJTikge1xuXHRcdFx0XHRhY2NlbFggKz0gKFdBTExfTUFSR0lOIC0gY2VudGVyWCkgKiA2O1xuXHRcdFx0fSBlbHNlIGlmIChjZW50ZXJYID4gYm91bmRzLndpZHRoIC0gV0FMTF9NQVJHSU4pIHtcblx0XHRcdFx0YWNjZWxYIC09IChjZW50ZXJYIC0gKGJvdW5kcy53aWR0aCAtIFdBTExfTUFSR0lOKSkgKiA2O1xuXHRcdFx0fVxuXHRcdFx0aWYgKGNlbnRlclkgPCBXQUxMX01BUkdJTikge1xuXHRcdFx0XHRhY2NlbFkgKz0gKFdBTExfTUFSR0lOIC0gY2VudGVyWSkgKiA2O1xuXHRcdFx0fSBlbHNlIGlmIChjZW50ZXJZID4gYm91bmRzLmhlaWdodCAtIFdBTExfTUFSR0lOKSB7XG5cdFx0XHRcdGFjY2VsWSAtPSAoY2VudGVyWSAtIChib3VuZHMuaGVpZ2h0IC0gV0FMTF9NQVJHSU4pKSAqIDY7XG5cdFx0XHR9XG5cblx0XHRcdC8vIE1vdXNlIHNjYXR0ZXJcblx0XHRcdGNvbnN0IG1vdXNlRGVsdGFYID0gY2VudGVyWCAtIG1vdXNlWDtcblx0XHRcdGNvbnN0IG1vdXNlRGVsdGFZID0gY2VudGVyWSAtIG1vdXNlWTtcblx0XHRcdGNvbnN0IG1vdXNlRGlzdFNxID0gbW91c2VEZWx0YVggKiBtb3VzZURlbHRhWCArIG1vdXNlRGVsdGFZICogbW91c2VEZWx0YVk7XG5cdFx0XHRpZiAobW91c2VEaXN0U3EgPCBTQ0FUVEVSX1JBRElVU19TUSkge1xuXHRcdFx0XHRjb25zdCBtb3VzZURpc3QgPSBNYXRoLm1heChNYXRoLnNxcnQobW91c2VEaXN0U3EpLCAxKTtcblx0XHRcdFx0Y29uc3QgZm9yY2UgPSAoMSAtIG1vdXNlRGlzdCAvIFNDQVRURVJfUkFESVVTKSAqIDExMDA7XG5cdFx0XHRcdGFjY2VsWCArPSAobW91c2VEZWx0YVggLyBtb3VzZURpc3QpICogZm9yY2U7XG5cdFx0XHRcdGFjY2VsWSArPSAobW91c2VEZWx0YVkgLyBtb3VzZURpc3QpICogZm9yY2U7XG5cdFx0XHRcdGYucGFuaWNVbnRpbCA9IG5vdyArIFBBTklDX0RVUkFUSU9OX01TO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBTZWVrIG5lYXJlc3QgZm9vZCB3aXRoaW4gRk9PRF9ERVRFQ1RfUkFESVVTXG5cdFx0XHRsZXQgbmVhcmVzdFBlbGxldDogSUZvb2RQZWxsZXQgfCB1bmRlZmluZWQ7XG5cdFx0XHRsZXQgbmVhcmVzdERpc3RTcSA9IEZPT0RfREVURUNUX1JBRElVU19TUTtcblx0XHRcdGZvciAoY29uc3QgcGVsbGV0IG9mIGZvb2QpIHtcblx0XHRcdFx0Y29uc3QgZm9vZERlbHRhWCA9IHBlbGxldC5wb3NpdGlvblggLSBjZW50ZXJYO1xuXHRcdFx0XHRjb25zdCBmb29kRGVsdGFZID0gcGVsbGV0LnBvc2l0aW9uWSAtIGNlbnRlclk7XG5cdFx0XHRcdGNvbnN0IGRpc3RTcSA9IGZvb2REZWx0YVggKiBmb29kRGVsdGFYICsgZm9vZERlbHRhWSAqIGZvb2REZWx0YVk7XG5cdFx0XHRcdGlmIChkaXN0U3EgPCBuZWFyZXN0RGlzdFNxKSB7XG5cdFx0XHRcdFx0bmVhcmVzdERpc3RTcSA9IGRpc3RTcTtcblx0XHRcdFx0XHRuZWFyZXN0UGVsbGV0ID0gcGVsbGV0O1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAobmVhcmVzdFBlbGxldCkge1xuXHRcdFx0XHRjb25zdCBuZWFyZXN0RGlzdCA9IE1hdGgubWF4KE1hdGguc3FydChuZWFyZXN0RGlzdFNxKSwgMSk7XG5cdFx0XHRcdGlmIChuZWFyZXN0RGlzdCA8IEVBVF9SQURJVVMpIHtcblx0XHRcdFx0XHRyZW1vdmVGb29kKG5lYXJlc3RQZWxsZXQpO1xuXHRcdFx0XHRcdGYuZ3JvdyhGSVNIX0dST1dUSF9GQUNUT1IpO1xuXHRcdFx0XHRcdG9uRmlzaEZlZD8uKCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0YWNjZWxYICs9IChuZWFyZXN0UGVsbGV0LnBvc2l0aW9uWCAtIGNlbnRlclgpIC8gbmVhcmVzdERpc3QgKiAyMDA7XG5cdFx0XHRcdFx0YWNjZWxZICs9IChuZWFyZXN0UGVsbGV0LnBvc2l0aW9uWSAtIGNlbnRlclkpIC8gbmVhcmVzdERpc3QgKiAyMDA7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Zi52ZWxvY2l0eVggKz0gYWNjZWxYICogZHQ7XG5cdFx0XHRmLnZlbG9jaXR5WSArPSBhY2NlbFkgKiBkdDtcblxuXHRcdFx0Y29uc3Qgc3BlZWRTcSA9IGYudmVsb2NpdHlYICogZi52ZWxvY2l0eVggKyBmLnZlbG9jaXR5WSAqIGYudmVsb2NpdHlZO1xuXHRcdFx0Y29uc3QgbWF4U3BlZWQgPSBub3cgPCBmLnBhbmljVW50aWwgPyBQQU5JQ19NQVhfU1BFRUQgOiBNQVhfU1BFRUQ7XG5cdFx0XHRjb25zdCBtYXhTcGVlZFNxID0gbm93IDwgZi5wYW5pY1VudGlsID8gUEFOSUNfTUFYX1NQRUVEX1NRIDogTUFYX1NQRUVEX1NRO1xuXHRcdFx0aWYgKHNwZWVkU3EgPiBtYXhTcGVlZFNxKSB7XG5cdFx0XHRcdGNvbnN0IHNwZWVkID0gTWF0aC5zcXJ0KHNwZWVkU3EpO1xuXHRcdFx0XHRmLnZlbG9jaXR5WCA9IChmLnZlbG9jaXR5WCAvIHNwZWVkKSAqIG1heFNwZWVkO1xuXHRcdFx0XHRmLnZlbG9jaXR5WSA9IChmLnZlbG9jaXR5WSAvIHNwZWVkKSAqIG1heFNwZWVkO1xuXHRcdFx0fVxuXG5cdFx0XHRmLnBvc2l0aW9uWCArPSBmLnZlbG9jaXR5WCAqIGR0O1xuXHRcdFx0Zi5wb3NpdGlvblkgKz0gZi52ZWxvY2l0eVkgKiBkdDtcblxuXHRcdFx0Ly8gSGFyZCBjbGFtcCBzYWZldHkgbmV0LlxuXHRcdFx0Zi5wb3NpdGlvblggPSBjbGFtcChmLnBvc2l0aW9uWCwgLWYuc2l6ZSAqIDAuMjUsIGJvdW5kcy53aWR0aCAtIGYuc2l6ZSAqIDAuNzUpO1xuXHRcdFx0Zi5wb3NpdGlvblkgPSBjbGFtcChmLnBvc2l0aW9uWSwgLWYuc2l6ZSAqIDAuMjUsIGJvdW5kcy5oZWlnaHQgLSBmLnNpemUgKiAwLjc1KTtcblxuXHRcdFx0Zi5hcHBseVRyYW5zZm9ybShkdCk7XG5cdFx0fVxuXHR9XG5cblx0c3RvcmUuYWRkKGFjY2Vzc2liaWxpdHlTZXJ2aWNlLm9uRGlkQ2hhbmdlUmVkdWNlZE1vdGlvbigoKSA9PiB7XG5cdFx0aWYgKGFjY2Vzc2liaWxpdHlTZXJ2aWNlLmlzTW90aW9uUmVkdWNlZCgpKSB7XG5cdFx0XHRzdG9wQW5pbWF0aW9uKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHN0YXJ0QW5pbWF0aW9uKCk7XG5cdFx0fVxuXHR9KSk7XG5cdHN0b3JlLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gc3RvcEFuaW1hdGlvbigpKSk7XG5cdHN0YXJ0QW5pbWF0aW9uKCk7XG5cblx0Ly8gRmlyc3QtYmF0Y2ggZmFkZS1pbiAodGhlIGRlZmVycmVkIGJhdGNoIGZhZGVzIGluIHdoZW4gaXQgbW91bnRzKS5cblx0Y29uc3QgZmFkZUluID0gc2NoZWR1bGVBdE5leHRBbmltYXRpb25GcmFtZSh0YXJnZXRXaW5kb3csICgpID0+IHtcblx0XHRpZiAoZXhpdGluZykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR3YXRlci5jbGFzc0xpc3QuYWRkKCd2aXNpYmxlJyk7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBNYXRoLm1pbihTWU5DX0JBVENILCBmaXNoLmxlbmd0aCk7IGkrKykge1xuXHRcdFx0Y29uc3QgZiA9IGZpc2hbaV07XG5cdFx0XHQvLyBTbGlnaHQgc3RhZ2dlciwgY2FwcGVkIGF0IH40MDBtcyBzbyBpdCBkb2Vzbid0IGRyYWcgb24uXG5cdFx0XHRjb25zdCBkZWxheSA9IE1hdGgubWluKGkgKiAxMiwgNDAwKTtcblx0XHRcdGYuZWxlbWVudC5zdHlsZS50cmFuc2l0aW9uRGVsYXkgPSBgJHtkZWxheX1tc2A7XG5cdFx0XHRmLmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgndmlzaWJsZScpO1xuXHRcdH1cblx0fSk7XG5cdHN0b3JlLmFkZChmYWRlSW4pO1xuXG5cdGNvbnN0IHJlc3VsdCA9IG5ldyBjbGFzcyBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJQWN0aXZlQXF1YXJpdW0ge1xuXG5cdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRzdXBlcigpO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoc3RvcmUpO1xuXHRcdH1cblxuXHRcdGV4aXQob25EaWRDb21wbGV0ZTogKCkgPT4gdm9pZCk6IElEaXNwb3NhYmxlIHtcblx0XHRcdGlmIChleGl0aW5nKSB7XG5cdFx0XHRcdHJldHVybiB0b0Rpc3Bvc2FibGUoKCkgPT4gdGhpcy5kaXNwb3NlKCkpO1xuXHRcdFx0fVxuXHRcdFx0ZXhpdGluZyA9IHRydWU7XG5cblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgZmlzaC5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRjb25zdCBmID0gZmlzaFtpXTtcblx0XHRcdFx0Y29uc3QgZGVsYXkgPSBNYXRoLm1pbihpICogMTIsIDQwMCk7XG5cdFx0XHRcdGYuZWxlbWVudC5zdHlsZS50cmFuc2l0aW9uRGVsYXkgPSBgJHtkZWxheX1tc2A7XG5cdFx0XHRcdGYuZWxlbWVudC5jbGFzc0xpc3QucmVtb3ZlKCd2aXNpYmxlJyk7XG5cdFx0XHR9XG5cdFx0XHR3YXRlci5jbGFzc0xpc3QucmVtb3ZlKCd2aXNpYmxlJyk7XG5cblx0XHRcdGxldCB0aW1lcjogUmV0dXJuVHlwZTx0eXBlb2Ygc2V0VGltZW91dD4gfCB1bmRlZmluZWQgPSBzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdFx0dGltZXIgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdHRoaXMuZGlzcG9zZSgpO1xuXHRcdFx0XHRvbkRpZENvbXBsZXRlKCk7XG5cdFx0XHR9LCBFWElUX0RVUkFUSU9OX01TKTtcblx0XHRcdHJldHVybiB0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0XHRpZiAodGltZXIgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdGNsZWFyVGltZW91dCh0aW1lcik7XG5cdFx0XHRcdFx0dGltZXIgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5kaXNwb3NlKCk7XG5cdFx0XHR9KTtcblx0XHR9XG5cdH07XG5cblx0cmV0dXJuIHJlc3VsdDtcbn1cblxuLyoqIFRydWUgZm9yIGNsaWNrcyBub3Qgb24gYSBjb250cm9sIFx1MjAxNCBpLmUuIHNhZmUgdGFyZ2V0cyBmb3Igc3Bhd25pbmcgZm9vZC4gKi9cbmZ1bmN0aW9uIGlzQmFja2dyb3VuZENsaWNrKHRhcmdldDogSFRNTEVsZW1lbnQgfCBudWxsKTogYm9vbGVhbiB7XG5cdGlmICghdGFyZ2V0KSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdGlmICh0YXJnZXQuY2xvc2VzdCgnaW5wdXQsIHRleHRhcmVhLCBzZWxlY3QsIGJ1dHRvbiwgYSwgW3JvbGU9XCJidXR0b25cIl0sIFtyb2xlPVwibGlua1wiXSwgW3JvbGU9XCJ0ZXh0Ym94XCJdLCBbcm9sZT1cImNvbWJvYm94XCJdLCBbcm9sZT1cIm1lbnVpdGVtXCJdLCBbcm9sZT1cInRhYlwiXSwgLm1vbmFjby1lZGl0b3IsIC5zY3JvbGwtZGVjb3JhdGlvbiwgLm1vbmFjby1saXN0LXJvdycpKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdHJldHVybiB0cnVlO1xufVxuXG5mdW5jdGlvbiByYW5kb21CZXR3ZWVuKG1pbjogbnVtYmVyLCBtYXg6IG51bWJlcik6IG51bWJlciB7XG5cdHJldHVybiBtaW4gKyBNYXRoLnJhbmRvbSgpICogKG1heCAtIG1pbik7XG59XG5cbmZ1bmN0aW9uIGNsYW1wKHZhbHVlOiBudW1iZXIsIG1pbjogbnVtYmVyLCBtYXg6IG51bWJlcik6IG51bWJlciB7XG5cdGlmIChtYXggPCBtaW4pIHtcblx0XHRyZXR1cm4gbWluO1xuXHR9XG5cdHJldHVybiBNYXRoLm1pbihNYXRoLm1heCh2YWx1ZSwgbWluKSwgbWF4KTtcbn1cblxuZnVuY3Rpb24gYWRkSWNvbkNsYXNzZXMoZWxlbWVudDogSFRNTEVsZW1lbnQsIGljb246IFRoZW1lSWNvbik6IHZvaWQge1xuXHRjb25zdCBpY29uQ2xhc3NlcyA9IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShpY29uKS5zcGxpdCgvXFxzKy8pLmZpbHRlcihCb29sZWFuKTtcblx0Zm9yIChjb25zdCBjbHMgb2YgaWNvbkNsYXNzZXMpIHtcblx0XHRlbGVtZW50LmNsYXNzTGlzdC5hZGQoY2xzKTtcblx0fVxufVxuXG5mdW5jdGlvbiBnZXRGaXNoSHVuZ2VyRGVzY3JpcHRpb24oc3RhdGU6IEZpc2hIdW5nZXJTdGF0ZSk6IHN0cmluZyB7XG5cdHN3aXRjaCAoc3RhdGUpIHtcblx0XHRjYXNlICdoYXBweSc6XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoJ2FxdWFyaXVtLmh1bmdlci5oYXBweScsIFwiZmlzaCBpcyBoYXBweVwiKTtcblx0XHRjYXNlICduZXV0cmFsJzpcblx0XHRcdHJldHVybiBsb2NhbGl6ZSgnYXF1YXJpdW0uaHVuZ2VyLm5ldXRyYWwnLCBcImZpc2ggaXMgZ2V0dGluZyBodW5ncnlcIik7XG5cdFx0Y2FzZSAnc2FkJzpcblx0XHRcdHJldHVybiBsb2NhbGl6ZSgnYXF1YXJpdW0uaHVuZ2VyLnNhZCcsIFwiZmlzaCBpcyBodW5ncnlcIik7XG5cdFx0Y2FzZSAndmVyeVNhZCc6XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoJ2FxdWFyaXVtLmh1bmdlci52ZXJ5U2FkJywgXCJmaXNoIGlzIHN0YXJ2aW5nXCIpO1xuXHR9XG59XG5cbi8qKlxuICogSWYgdGhlIGZpc2ggaXMgaW5zaWRlIHRoZSB3YWxsIG1hcmdpbiwgcmV0dXJuIHRoZSBoZWFkaW5nIChyYWRpYW5zKSBwb2ludGluZ1xuICogYmFjayBpbnRvIG9wZW4gd2F0ZXIuIFJldHVybnMgYHVuZGVmaW5lZGAgd2hlbiB0aGUgZmlzaCBpcyBjb21mb3J0YWJseSBhd2F5XG4gKiBmcm9tIGFsbCB3YWxscy4gRGlyZWN0aW9uIHN1bXMgcGVyLXdhbGwgdmVjdG9ycyB3ZWlnaHRlZCBieSBlbmNyb2FjaG1lbnQsXG4gKiB3aXRoIGEgc21hbGwgdGFuZ2VudGlhbCBwZXJ0dXJiYXRpb24gc28gbmVpZ2hib3JzIGRvbid0IGFsbCBjb252ZXJnZSB0byB0aGVcbiAqIHNhbWUgaGVhZGluZy5cbiAqL1xuZnVuY3Rpb24gY29tcHV0ZVdhbGxBdm9pZEFuZ2xlKGNlbnRlclg6IG51bWJlciwgY2VudGVyWTogbnVtYmVyLCB3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlcik6IG51bWJlciB8IHVuZGVmaW5lZCB7XG5cdGxldCBlc2NhcGVYID0gMDtcblx0bGV0IGVzY2FwZVkgPSAwO1xuXHRpZiAoY2VudGVyWCA8IFdBTExfTUFSR0lOKSB7XG5cdFx0ZXNjYXBlWCArPSAoV0FMTF9NQVJHSU4gLSBjZW50ZXJYKSAvIFdBTExfTUFSR0lOO1xuXHR9IGVsc2UgaWYgKGNlbnRlclggPiB3aWR0aCAtIFdBTExfTUFSR0lOKSB7XG5cdFx0ZXNjYXBlWCAtPSAoY2VudGVyWCAtICh3aWR0aCAtIFdBTExfTUFSR0lOKSkgLyBXQUxMX01BUkdJTjtcblx0fVxuXHRpZiAoY2VudGVyWSA8IFdBTExfTUFSR0lOKSB7XG5cdFx0ZXNjYXBlWSArPSAoV0FMTF9NQVJHSU4gLSBjZW50ZXJZKSAvIFdBTExfTUFSR0lOO1xuXHR9IGVsc2UgaWYgKGNlbnRlclkgPiBoZWlnaHQgLSBXQUxMX01BUkdJTikge1xuXHRcdGVzY2FwZVkgLT0gKGNlbnRlclkgLSAoaGVpZ2h0IC0gV0FMTF9NQVJHSU4pKSAvIFdBTExfTUFSR0lOO1xuXHR9XG5cdGlmIChlc2NhcGVYID09PSAwICYmIGVzY2FwZVkgPT09IDApIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdHJldHVybiBNYXRoLmF0YW4yKGVzY2FwZVksIGVzY2FwZVgpICsgKE1hdGgucmFuZG9tKCkgLSAwLjUpICogMC40O1xufVxuXG4vKiogU21hbGxlc3Qgc2lnbmVkIGFuZ3VsYXIgZGVsdGEgZnJvbSBgZnJvbWAgdG8gYHRvYCwgaW4gWy1QSSwgUEldLiAqL1xuZnVuY3Rpb24gc2hvcnRlc3RBbmdsZURlbHRhKGZyb206IG51bWJlciwgdG86IG51bWJlcik6IG51bWJlciB7XG5cdGxldCBkZWx0YSA9ICh0byAtIGZyb20pICUgKE1hdGguUEkgKiAyKTtcblx0aWYgKGRlbHRhID4gTWF0aC5QSSkge1xuXHRcdGRlbHRhIC09IE1hdGguUEkgKiAyO1xuXHR9IGVsc2UgaWYgKGRlbHRhIDwgLU1hdGguUEkpIHtcblx0XHRkZWx0YSArPSBNYXRoLlBJICogMjtcblx0fVxuXHRyZXR1cm4gZGVsdGE7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsR0FBRyx1Q0FBdUMsdUNBQXVDLHVCQUF1QixXQUFXLFdBQVcsb0NBQW9DO0FBQzNLLFNBQVMsa0NBQWtDO0FBQzNDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsZUFBZTtBQUN4QixTQUFTLFlBQVksaUJBQThCLG1CQUFtQixvQkFBb0I7QUFDMUYsU0FBc0IsdUJBQXVCO0FBQzdDLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQXNCLDBCQUEwQjtBQUNoRCxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGlCQUFpQixjQUFjLHFCQUFxQjtBQUM3RCxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLHlCQUF5QixhQUFhO0FBQy9DLFNBQVMscUNBQXFDO0FBQzlDLFNBQVMsdUJBQXVCLE1BQU0seUJBQXlCO0FBQy9ELFNBQVMseUJBQStDO0FBRWpELE1BQU0seUNBQXlDO0FBRXRELE1BQU0sYUFBYTtBQUNuQixNQUFNLGdCQUFnQjtBQUN0QixNQUFNLGdCQUFnQjtBQUV0QixNQUFNLHFCQUFxQjtBQUUzQixNQUFNLGlCQUFpQjtBQUN2QixNQUFNLG9CQUFvQixpQkFBaUI7QUFDM0MsTUFBTSxhQUFhO0FBQ25CLE1BQU0scUJBQXFCO0FBQzNCLE1BQU0sd0JBQXdCLHFCQUFxQjtBQUNuRCxNQUFNLFdBQVc7QUFFakIsTUFBTSxjQUFj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
