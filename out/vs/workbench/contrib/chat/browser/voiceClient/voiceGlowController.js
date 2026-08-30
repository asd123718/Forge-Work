import "./media/voiceGlow.css";
import { $ } from "../../../../../base/browser/dom.js";
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from "../../../../../base/common/lifecycle.js";
import { DEFAULT_VOICE_GLOW_COLORS, resolveVoiceRimAccent, voiceGlowStateColor } from "./voiceGlow.js";
const FADE = "opacity .6s cubic-bezier(.4,0,.2,1)";
const FADE_OUT_MS = 650;
const ACTIVE_RIM_STRENGTH = 1.02;
const RIM_LAYER_OPACITY = {
  dark: { ring: 1, inner: 0.44, bloom: 0.66 },
  light: { ring: 1, inner: 0.3, bloom: 0.8 }
};
const RIM_DURATION = 2.3;
function rimMotionParams(theme, duration) {
  const dark = theme === "dark";
  const scale = duration / RIM_DURATION;
  return {
    /** How much the blobs grow and shrink. */
    spread: 0.28,
    /** How far the blobs drift, in px. */
    drift: dark ? 33 : 40,
    /** Depth of the per-quadrant opacity swell. */
    opacityDepth: dark ? 0.48 : 0.45,
    /** Depth of the global height swell. */
    breathDepth: dark ? 0.34 : 0.22,
    /** Base period for the opacity swell. */
    opacityPeriod: (dark ? 1.9 : 2.6) * scale,
    /** Base period for the size swell. */
    sizePeriod: (dark ? 2.6 : 4.6) * scale,
    /** Period of the global height swell. */
    breathPeriod: (dark ? 2.4 : 5.5) * scale
  };
}
function rimOscillators(theme, duration) {
  const { spread, drift, opacityDepth, breathDepth, opacityPeriod, sizePeriod, breathPeriod } = rimMotionParams(theme, duration);
  return [
    { prop: "--vg-w1", from: 1 - spread, to: 1 + spread * 1.1, period: sizePeriod * 0.9, delay: 0, unit: "" },
    { prop: "--vg-h1", from: 1 + spread * 0.9, to: 1 - spread * 0.85, period: sizePeriod * 1.26, delay: 0, unit: "" },
    { prop: "--vg-x1", from: -drift, to: drift * 0.9, period: opacityPeriod * 1.6, delay: 0, unit: "px" },
    { prop: "--vg-y1", from: drift * 0.55, to: -drift * 0.7, period: opacityPeriod * 1.6, delay: 0, unit: "px" },
    { prop: "--vg-w2", from: 1 + spread, to: 1 - spread * 0.85, period: sizePeriod * 1.1, delay: 0, unit: "" },
    { prop: "--vg-h2", from: 1 - spread * 0.8, to: 1 + spread * 1.05, period: sizePeriod * 0.81, delay: 0, unit: "" },
    { prop: "--vg-x2", from: drift * 0.8, to: -drift * 0.9, period: opacityPeriod * 1.88, delay: 0, unit: "px" },
    { prop: "--vg-y2", from: -drift, to: drift * 0.65, period: opacityPeriod * 1.88, delay: 0, unit: "px" },
    { prop: "--vg-w3", from: 1 - spread * 0.6, to: 1 + spread * 1.15, period: sizePeriod * 0.98, delay: 0, unit: "" },
    { prop: "--vg-h3", from: 1 + spread * 0.75, to: 1 - spread, period: sizePeriod * 1.4, delay: 0, unit: "" },
    { prop: "--vg-x3", from: -drift * 0.6, to: drift, period: opacityPeriod * 1.45, delay: 0, unit: "px" },
    { prop: "--vg-y3", from: -drift * 0.85, to: drift * 0.45, period: opacityPeriod * 1.45, delay: 0, unit: "px" },
    { prop: "--vg-breath", from: 1 - breathDepth, to: 1 + breathDepth, period: breathPeriod, delay: 0, unit: "" },
    { prop: "--vg-op-tl", from: 1 - opacityDepth, to: 1, period: opacityPeriod, delay: 0, unit: "" },
    { prop: "--vg-op-tr", from: 1 - opacityDepth, to: 1, period: opacityPeriod * 1.32, delay: opacityPeriod * 0.28, unit: "" },
    { prop: "--vg-op-bl", from: 1 - opacityDepth, to: 1, period: opacityPeriod * 0.84, delay: opacityPeriod * 0.55, unit: "" },
    { prop: "--vg-op-br", from: 1 - opacityDepth, to: 1, period: opacityPeriod * 1.58, delay: opacityPeriod * 0.83, unit: "" }
  ];
}
function applyOscillators(host, oscillators, time, animate) {
  for (const osc of oscillators) {
    const value = animate ? osc.from + (osc.to - osc.from) * ((1 - Math.cos(2 * Math.PI * ((time - osc.delay) / osc.period))) / 2) : (osc.from + osc.to) / 2;
    host.style.setProperty(osc.prop, osc.unit === "px" ? `${value.toFixed(2)}px` : value.toFixed(4));
  }
}
function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}
function nowSeconds(el) {
  const view = el.ownerDocument.defaultView;
  return (view?.performance ?? performance).now() / 1e3;
}
function mountRimLayers(host, options) {
  const store = new DisposableStore();
  const moodClass = `voice-glow-rim-${options.mood}`;
  host.classList.add("voice-glow-rim", moodClass);
  store.add(toDisposable(() => host.classList.remove("voice-glow-rim", moodClass)));
  for (const cls of ["voice-glow-rim-corners", "voice-glow-rim-bloom"]) {
    const el = $("div");
    el.className = cls;
    host.appendChild(el);
    store.add(toDisposable(() => el.remove()));
  }
  const layerOpacity = RIM_LAYER_OPACITY[options.theme];
  host.style.setProperty("--vg-sat", `${options.saturation}%`);
  host.style.setProperty("--vg-light", `${options.lightness}%`);
  host.style.setProperty("--vg-ring-opacity", String(layerOpacity.ring));
  host.style.setProperty("--vg-inner-opacity", String(layerOpacity.inner));
  host.style.setProperty("--vg-bloom-opacity", String(layerOpacity.bloom));
  if (options.size !== void 0) {
    host.style.setProperty("--vg-size", options.size.toFixed(3));
  }
  const oscillators = rimOscillators(options.theme, options.duration);
  let time = 0;
  let previousTimestamp;
  let level = 0.2;
  const apply = (input, animate) => {
    if (animate) {
      const timestamp = nowSeconds(host);
      const delta = previousTimestamp === void 0 ? 0 : Math.min(0.05, timestamp - previousTimestamp);
      previousTimestamp = timestamp;
      const target = clamp01(input);
      level += (target - level) * (target > level ? 0.3 : 0.08);
      time += delta * (options.speedGain === 0 ? 0.22 : 0.4 + options.speedGain * level);
    } else {
      level = clamp01(input);
    }
    applyOscillators(host, oscillators, time, animate);
    const peak = level * level;
    host.style.setProperty("--vg-strength", (options.strength * (0.5 + options.audioGain * level + options.peakGain * peak)).toFixed(3));
    host.style.setProperty("--vg-bloom-opacity", (layerOpacity.bloom * (1 + options.peakGain * peak)).toFixed(3));
    const drift = animate ? 14 * Math.sin(time * 0.4) : 0;
    host.style.setProperty("--vg-hue", (options.hue + drift).toFixed(1));
  };
  return {
    host,
    drive: (input) => apply(input, true),
    driveStatic: (input) => apply(input, false),
    dispose: () => store.dispose()
  };
}
function createVoiceGlowController(target, themeKind, colors) {
  return new VoiceGlowController(target, themeKind, colors);
}
const RIM_REFERENCE_HEIGHT = 78;
const RIM_SIZE_FLOOR = 0.35;
function createVoiceRimLight(target, accent, theme, mood = "cool", background) {
  const store = new DisposableStore();
  if (!target.style.position) {
    target.style.position = "relative";
  }
  const slot = $(".voice-glow-slot.voice-glow-slot-inline");
  target.appendChild(slot);
  store.add(toDisposable(() => slot.remove()));
  const mount = store.add(new MutableDisposable());
  let level = 0.3;
  const remount = (nextAccent, nextTheme, nextBackground) => {
    const rim = resolveVoiceRimAccent(nextAccent, mood, nextTheme, nextBackground);
    const height = target.getBoundingClientRect().height;
    const proportion = height > 0 ? Math.min(1, height / RIM_REFERENCE_HEIGHT) : 0;
    mount.clear();
    mount.value = mountRimLayers(slot, {
      theme: nextTheme,
      mood,
      hue: rim.hue,
      saturation: rim.saturation,
      lightness: rim.lightness,
      strength: ACTIVE_RIM_STRENGTH,
      duration: RIM_DURATION,
      audioGain: 0.8,
      peakGain: 0.95,
      speedGain: 0.9,
      size: RIM_SIZE_FLOOR + (1 - RIM_SIZE_FLOOR) * proportion
    });
    mount.value.driveStatic(level);
  };
  remount(accent, theme, background);
  return {
    drive: (input) => {
      level = input;
      mount.value?.drive(input);
    },
    driveStatic: (input) => {
      level = input;
      mount.value?.driveStatic(input);
    },
    refresh: remount,
    dispose: () => store.dispose()
  };
}
class VoiceGlowController extends Disposable {
  constructor(_target, _themeKind = () => "dark", _colorsProvider = () => DEFAULT_VOICE_GLOW_COLORS) {
    super();
    this._target = _target;
    this._themeKind = _themeKind;
    this._colorsProvider = _colorsProvider;
    /** One mount per slot, so mounting a new layer tears the old one down. */
    this._mounts = /* @__PURE__ */ new Map();
    this._currentState = "none";
    this._reducedMotion = false;
    this._disposed = false;
    try {
      this._colors = this._colorsProvider();
      _target.style.position = _target.style.position || "relative";
      const createSlot = () => {
        const el = $("div");
        el.className = "voice-glow-slot";
        el.style.zIndex = "11";
        _target.appendChild(el);
        this._register(toDisposable(() => el.remove()));
        this._mounts.set(el, this._register(new MutableDisposable()));
        return el;
      };
      this._slots = [createSlot(), createSlot()];
      this._register(toDisposable(() => {
        this._disposed = true;
        if (this._clearTimer !== void 0) {
          clearTimeout(this._clearTimer);
          this._clearTimer = void 0;
        }
      }));
    } catch (error) {
      this.dispose();
      throw error;
    }
  }
  dispose() {
    this._disposed = true;
    super.dispose();
  }
  render(state, level, reducedMotion) {
    if (this._disposed) {
      return;
    }
    const mood = resolveMood(state);
    this._reducedMotion = reducedMotion;
    if (!mood) {
      this.clear();
      return;
    }
    if (mood !== this._currentMood) {
      this._currentMood = mood;
      if (this._clearTimer !== void 0) {
        clearTimeout(this._clearTimer);
        this._clearTimer = void 0;
      }
      this._showLayer(mood, reducedMotion);
    }
    if (state !== this._currentState) {
      this._currentState = state;
      this._target.classList.add("voice-active");
      this._target.classList.toggle("voice-listening", state === "listening");
      this._target.classList.toggle("voice-processing", state === "processing");
      this._target.classList.toggle("voice-speaking", state === "speaking");
      const accent = resolveVoiceRimAccent(voiceGlowStateColor(state, this._colors), mood, this._themeKind(), this._colors.background);
      this._target.style.setProperty("--voice-accent", `hsl(${accent.hue} ${accent.saturation}% ${accent.lightness}%)`);
    }
    if (this._front && !reducedMotion) {
      this._front.drive(level);
    }
  }
  clear() {
    if (this._disposed || this._currentState === "none") {
      return;
    }
    this._currentState = "none";
    this._currentMood = void 0;
    this._target.classList.remove("voice-active", "voice-listening", "voice-processing", "voice-speaking");
    this._target.style.removeProperty("--voice-accent");
    const previous = this._front;
    this._front = void 0;
    if (previous) {
      this._fadeOut(previous.host);
      this._scheduleTeardown(previous.host);
    }
  }
  /**
   * Tear a slot's mount down once it has faded out so it stops driving CSS
   * variables. Guarded on re-entry: if the slot has since been reused as the
   * front layer, the new mount must survive.
   */
  _scheduleTeardown(host) {
    if (this._clearTimer !== void 0) {
      clearTimeout(this._clearTimer);
    }
    this._clearTimer = setTimeout(() => {
      this._clearTimer = void 0;
      if (this._front?.host !== host) {
        this._mounts.get(host)?.clear();
      }
    }, FADE_OUT_MS);
  }
  refreshTheme() {
    if (this._disposed) {
      return;
    }
    this._colors = this._colorsProvider();
    const state = this._currentState;
    if (this._front && state !== "none") {
      this._currentState = "none";
      this._currentMood = void 0;
      this.render(state, 0.3, this._reducedMotion);
    }
  }
  _showLayer(mood, reducedMotion) {
    const host = this._slots.find((slot) => slot !== this._front?.host) ?? this._slots[0];
    this._mounts.get(host).clear();
    const mounted = this._mount(host, mood);
    this._mounts.get(host).value = mounted;
    if (reducedMotion) {
      mounted.driveStatic(0.4);
    }
    const fade = reducedMotion ? "none" : FADE;
    const previous = this._front;
    host.style.transition = "none";
    host.style.opacity = "0";
    void host.offsetWidth;
    host.style.transition = fade;
    host.style.opacity = "1";
    if (previous && previous.host !== host) {
      this._fadeOut(previous.host, fade);
      this._scheduleTeardown(previous.host);
    }
    this._front = mounted;
  }
  _fadeOut(host, fade = FADE) {
    host.style.transition = fade;
    host.style.opacity = "0";
  }
  _mount(host, mood) {
    const theme = this._themeKind();
    const accentColor = mood === "warm" ? this._colors.speaking : this._colors.listening;
    const accent = resolveVoiceRimAccent(accentColor, mood, theme, this._colors.background);
    return mountRimLayers(host, {
      theme,
      mood,
      hue: accent.hue,
      saturation: accent.saturation,
      lightness: accent.lightness,
      strength: ACTIVE_RIM_STRENGTH,
      duration: RIM_DURATION,
      audioGain: 0.8,
      // Lets the loudest moments read visibly denser rather than leaving the
      // whole range in a narrow band.
      peakGain: 0.95,
      speedGain: 0.9
    });
  }
}
function resolveMood(state) {
  switch (state) {
    case "listening":
      return "cool";
    case "speaking":
      return "warm";
    default:
      return void 0;
  }
}
export {
  createVoiceGlowController,
  createVoiceRimLight
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXHZvaWNlQ2xpZW50XFx2b2ljZUdsb3dDb250cm9sbGVyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICcuL21lZGlhL3ZvaWNlR2xvdy5jc3MnO1xuaW1wb3J0IHsgJCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgQ29sb3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2xvci5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlLCBNdXRhYmxlRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IERFRkFVTFRfVk9JQ0VfR0xPV19DT0xPUlMsIEdsb3dUaGVtZUtpbmQsIElWb2ljZUdsb3dDb2xvcnMsIHJlc29sdmVWb2ljZVJpbUFjY2VudCwgdm9pY2VHbG93U3RhdGVDb2xvciwgVm9pY2VHbG93U3RhdGUsIFZvaWNlUmltTW9vZCB9IGZyb20gJy4vdm9pY2VHbG93LmpzJztcblxuZXhwb3J0IHR5cGUgeyBHbG93VGhlbWVLaW5kIH07XG5cbi8qKlxuICogVGhlIERPTSBhcHBsaWVyIGZvciB0aGUgVm9pY2UgTW9kZSBhbWJpZW50IGdsb3cuXG4gKlxuICogYGxpc3RlbmluZ2AgYW5kIGBzcGVha2luZ2AgcmVuZGVyIGFuIGF1ZGlvLXJlYWN0aXZlIGludGVyaW9yIHJpbS4gRXZlcnkgb3RoZXJcbiAqIHN0YXRlIHJlbmRlcnMgbm90aGluZy5cbiAqXG4gKiBFdmVyeSBzdGF0ZSBjaGFuZ2UgaXMgYSB0cnVlIGNyb3NzLWZhZGUgYmV0d2VlbiB0d28gYnVmZmVyZWQgc2xvdHMsIHNvXG4gKiBgbGlzdGVuaW5nIC0+IHNwZWFraW5nYCBkaXNzb2x2ZXMgY29vbCAtPiB3YXJtIHJhdGhlciB0aGFuIHNuYXBwaW5nLiBDb2xvcnMgYXJlXG4gKiBkZXJpdmVkIGZyb20gdGhlIHRoZW1lIGFjY2VudCAoc2VlIGByZXNvbHZlVm9pY2VHbG93Q29sb3JzYCkuXG4gKlxuICogVGhlIHJpbSBkZXNpZ24gaXMgaW5zcGlyZWQgYnkgdGhlIHdvcmsgb2YgSmFrdWIgQW50YWxpayAoQEpha3ViYW50YWxpaykuXG4gKi9cblxuLyoqXG4gKiBDcm9zcy1mYWRlIHRpbWluZyBzaGFyZWQgYnkgZXZlcnkgc3RhdGUgdHJhbnNpdGlvbi4gT3BhY2l0eSBvbmx5OiB0aGUgZ2xvdyBpc1xuICogbGlnaHQsIGFuZCBsaWdodCBkaXNzb2x2ZXMgXHUyMDE0IHNjYWxpbmcgaXQgd291bGQgcmVhZCBhcyB0aGUgYm94IFwiem9vbWluZ1wiLCB3aGljaFxuICogcHVsbHMgdGhlIGV5ZSB0byBhIHNpemUgY2hhbmdlIHRoYXQgaXNuJ3QgaGFwcGVuaW5nLlxuICovXG5jb25zdCBGQURFID0gJ29wYWNpdHkgLjZzIGN1YmljLWJlemllciguNCwwLC4yLDEpJztcbi8qKiBIb3cgbG9uZyBhIGZhZGVkLW91dCBzbG90IGlzIGtlcHQgbW91bnRlZCBiZWZvcmUgaXRzIGxheWVyIGlzIHRvcm4gZG93bi4gKi9cbmNvbnN0IEZBREVfT1VUX01TID0gNjUwO1xuXG4vKiogQmFzZSBzdHJlbmd0aCBvZiBhbiBhY3RpdmUgcmltLCBiZWZvcmUgdGhlIGF1ZGlvIGxldmVsIGlzIGFwcGxpZWQuICovXG5jb25zdCBBQ1RJVkVfUklNX1NUUkVOR1RIID0gMS4wMjtcblxuLyoqIFBlci10aGVtZSBvcGFjaXR5IG9mIHRoZSB0aHJlZSByaW0gbGF5ZXJzIChyaW5nIC8gaW5uZXIgd2FzaCAvIGJsb29tKS4gKi9cbmNvbnN0IFJJTV9MQVlFUl9PUEFDSVRZID0ge1xuXHRkYXJrOiB7IHJpbmc6IDEsIGlubmVyOiAwLjQ0LCBibG9vbTogMC42NiB9LFxuXHRsaWdodDogeyByaW5nOiAxLCBpbm5lcjogMC4zLCBibG9vbTogMC44IH0sXG59IGFzIGNvbnN0O1xuXG4vKiogU2Vjb25kcyBmb3Igb25lIGZ1bGwgYnJlYXRoIGN5Y2xlLiAqL1xuY29uc3QgUklNX0RVUkFUSU9OID0gMi4zO1xuXG4vKipcbiAqIFdoaWNoIG9mIHRoZSB0d28gdGFsa2luZyBzdGF0ZXMgdGhlIHJpbSBpcyBzaG93aW5nLiBQdWJsaXNoZWQgYXMgYSBjbGFzcyBzb1xuICogaGlnaC1jb250cmFzdCB0aGVtZXMgY2FuIHN0eWxlIGVhY2ggb25lLlxuICovXG50eXBlIFJpbU1vb2QgPSBWb2ljZVJpbU1vb2Q7XG5cbi8qKiBBIGxpdmUgbGF5ZXIgbW91bnRlZCBvbiBvbmUgb2YgdGhlIGJ1ZmZlcmVkIHNsb3RzLiAqL1xuaW50ZXJmYWNlIElNb3VudGVkTGF5ZXIgZXh0ZW5kcyBJRGlzcG9zYWJsZSB7XG5cdHJlYWRvbmx5IGhvc3Q6IEhUTUxFbGVtZW50O1xuXHQvKiogQWR2YW5jZSBtb3Rpb24gKyBpbnRlbnNpdHkgZnJvbSB0aGUgc21vb3RoZWQgYXVkaW8gYGxldmVsYCAoWzAsMV0pLiAqL1xuXHRkcml2ZShsZXZlbDogbnVtYmVyKTogdm9pZDtcblx0LyoqIFBpbiB0byBhIHJlcHJlc2VudGF0aXZlIHN0aWxsIGZyYW1lIChyZWR1Y2VkIG1vdGlvbikuICovXG5cdGRyaXZlU3RhdGljKGxldmVsOiBudW1iZXIpOiB2b2lkO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElWb2ljZUdsb3dDb250cm9sbGVyIGV4dGVuZHMgSURpc3Bvc2FibGUge1xuXHQvKiogU2hvdy9rZWVwIHRoZSBnbG93IGZvciBgc3RhdGVgLCBkcml2aW5nIGludGVuc2l0eSBmcm9tIGBsZXZlbGAgKFswLDFdKS4gKi9cblx0cmVuZGVyKHN0YXRlOiBWb2ljZUdsb3dTdGF0ZSwgbGV2ZWw6IG51bWJlciwgcmVkdWNlZE1vdGlvbjogYm9vbGVhbik6IHZvaWQ7XG5cdC8qKiBGYWRlIHRoZSBnbG93IG91dCAobm90LW93bmVyIC8gZGlzY29ubmVjdGVkKS4gKi9cblx0Y2xlYXIoKTogdm9pZDtcblx0LyoqIFJlLWFwcGx5IHRoZSBjdXJyZW50IHN0YXRlIGFmdGVyIGEgY29sb3ItdGhlbWUgY2hhbmdlLiAqL1xuXHRyZWZyZXNoVGhlbWUoKTogdm9pZDtcbn1cblxuLyoqXG4gKiBBIHNpbmdsZSBzaW51c29pZGFsIG9zY2lsbGF0b3IgcGluZy1wb25naW5nIGEgQ1NTIGN1c3RvbSBwcm9wZXJ0eSBiZXR3ZWVuIGBmcm9tYFxuICogYW5kIGB0b2AuIERlc3luY2VkIHBlcmlvZHMgYXJlIHdoYXQga2VlcCB0aGUgcmltIGZyb20gcmVhZGluZyBhcyBhIG1lY2hhbmljYWxcbiAqIHB1bHNlOiBubyB0d28gcmVnaW9ucyBzd2VsbCBhdCB0aGUgc2FtZSB0aW1lLlxuICovXG5pbnRlcmZhY2UgSU9zY2lsbGF0b3Ige1xuXHRyZWFkb25seSBwcm9wOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGZyb206IG51bWJlcjtcblx0cmVhZG9ubHkgdG86IG51bWJlcjtcblx0LyoqIEZ1bGwgcGVyaW9kLCBpbiBzZWNvbmRzLiAqL1xuXHRyZWFkb25seSBwZXJpb2Q6IG51bWJlcjtcblx0LyoqIFBoYXNlIG9mZnNldCwgaW4gc2Vjb25kcy4gKi9cblx0cmVhZG9ubHkgZGVsYXk6IG51bWJlcjtcblx0cmVhZG9ubHkgdW5pdDogJycgfCAncHgnO1xufVxuXG4vKiogQnJlYXRoaW5nIHBhcmFtZXRlcnMsIHRoZW1lLXR1bmVkLiAqL1xuZnVuY3Rpb24gcmltTW90aW9uUGFyYW1zKHRoZW1lOiBHbG93VGhlbWVLaW5kLCBkdXJhdGlvbjogbnVtYmVyKSB7XG5cdGNvbnN0IGRhcmsgPSB0aGVtZSA9PT0gJ2RhcmsnO1xuXHRjb25zdCBzY2FsZSA9IGR1cmF0aW9uIC8gUklNX0RVUkFUSU9OO1xuXHRyZXR1cm4ge1xuXHRcdC8qKiBIb3cgbXVjaCB0aGUgYmxvYnMgZ3JvdyBhbmQgc2hyaW5rLiAqL1xuXHRcdHNwcmVhZDogMC4yOCxcblx0XHQvKiogSG93IGZhciB0aGUgYmxvYnMgZHJpZnQsIGluIHB4LiAqL1xuXHRcdGRyaWZ0OiBkYXJrID8gMzMgOiA0MCxcblx0XHQvKiogRGVwdGggb2YgdGhlIHBlci1xdWFkcmFudCBvcGFjaXR5IHN3ZWxsLiAqL1xuXHRcdG9wYWNpdHlEZXB0aDogZGFyayA/IDAuNDggOiAwLjQ1LFxuXHRcdC8qKiBEZXB0aCBvZiB0aGUgZ2xvYmFsIGhlaWdodCBzd2VsbC4gKi9cblx0XHRicmVhdGhEZXB0aDogZGFyayA/IDAuMzQgOiAwLjIyLFxuXHRcdC8qKiBCYXNlIHBlcmlvZCBmb3IgdGhlIG9wYWNpdHkgc3dlbGwuICovXG5cdFx0b3BhY2l0eVBlcmlvZDogKGRhcmsgPyAxLjkgOiAyLjYpICogc2NhbGUsXG5cdFx0LyoqIEJhc2UgcGVyaW9kIGZvciB0aGUgc2l6ZSBzd2VsbC4gKi9cblx0XHRzaXplUGVyaW9kOiAoZGFyayA/IDIuNiA6IDQuNikgKiBzY2FsZSxcblx0XHQvKiogUGVyaW9kIG9mIHRoZSBnbG9iYWwgaGVpZ2h0IHN3ZWxsLiAqL1xuXHRcdGJyZWF0aFBlcmlvZDogKGRhcmsgPyAyLjQgOiA1LjUpICogc2NhbGUsXG5cdH07XG59XG5cbmZ1bmN0aW9uIHJpbU9zY2lsbGF0b3JzKHRoZW1lOiBHbG93VGhlbWVLaW5kLCBkdXJhdGlvbjogbnVtYmVyKTogSU9zY2lsbGF0b3JbXSB7XG5cdGNvbnN0IHsgc3ByZWFkLCBkcmlmdCwgb3BhY2l0eURlcHRoLCBicmVhdGhEZXB0aCwgb3BhY2l0eVBlcmlvZCwgc2l6ZVBlcmlvZCwgYnJlYXRoUGVyaW9kIH0gPSByaW1Nb3Rpb25QYXJhbXModGhlbWUsIGR1cmF0aW9uKTtcblx0cmV0dXJuIFtcblx0XHR7IHByb3A6ICctLXZnLXcxJywgZnJvbTogMSAtIHNwcmVhZCwgdG86IDEgKyBzcHJlYWQgKiAxLjEsIHBlcmlvZDogc2l6ZVBlcmlvZCAqIDAuOSwgZGVsYXk6IDAsIHVuaXQ6ICcnIH0sXG5cdFx0eyBwcm9wOiAnLS12Zy1oMScsIGZyb206IDEgKyBzcHJlYWQgKiAwLjksIHRvOiAxIC0gc3ByZWFkICogMC44NSwgcGVyaW9kOiBzaXplUGVyaW9kICogMS4yNiwgZGVsYXk6IDAsIHVuaXQ6ICcnIH0sXG5cdFx0eyBwcm9wOiAnLS12Zy14MScsIGZyb206IC1kcmlmdCwgdG86IGRyaWZ0ICogMC45LCBwZXJpb2Q6IG9wYWNpdHlQZXJpb2QgKiAxLjYsIGRlbGF5OiAwLCB1bml0OiAncHgnIH0sXG5cdFx0eyBwcm9wOiAnLS12Zy15MScsIGZyb206IGRyaWZ0ICogMC41NSwgdG86IC1kcmlmdCAqIDAuNywgcGVyaW9kOiBvcGFjaXR5UGVyaW9kICogMS42LCBkZWxheTogMCwgdW5pdDogJ3B4JyB9LFxuXHRcdHsgcHJvcDogJy0tdmctdzInLCBmcm9tOiAxICsgc3ByZWFkLCB0bzogMSAtIHNwcmVhZCAqIDAuODUsIHBlcmlvZDogc2l6ZVBlcmlvZCAqIDEuMSwgZGVsYXk6IDAsIHVuaXQ6ICcnIH0sXG5cdFx0eyBwcm9wOiAnLS12Zy1oMicsIGZyb206IDEgLSBzcHJlYWQgKiAwLjgsIHRvOiAxICsgc3ByZWFkICogMS4wNSwgcGVyaW9kOiBzaXplUGVyaW9kICogMC44MSwgZGVsYXk6IDAsIHVuaXQ6ICcnIH0sXG5cdFx0eyBwcm9wOiAnLS12Zy14MicsIGZyb206IGRyaWZ0ICogMC44LCB0bzogLWRyaWZ0ICogMC45LCBwZXJpb2Q6IG9wYWNpdHlQZXJpb2QgKiAxLjg4LCBkZWxheTogMCwgdW5pdDogJ3B4JyB9LFxuXHRcdHsgcHJvcDogJy0tdmcteTInLCBmcm9tOiAtZHJpZnQsIHRvOiBkcmlmdCAqIDAuNjUsIHBlcmlvZDogb3BhY2l0eVBlcmlvZCAqIDEuODgsIGRlbGF5OiAwLCB1bml0OiAncHgnIH0sXG5cdFx0eyBwcm9wOiAnLS12Zy13MycsIGZyb206IDEgLSBzcHJlYWQgKiAwLjYsIHRvOiAxICsgc3ByZWFkICogMS4xNSwgcGVyaW9kOiBzaXplUGVyaW9kICogMC45OCwgZGVsYXk6IDAsIHVuaXQ6ICcnIH0sXG5cdFx0eyBwcm9wOiAnLS12Zy1oMycsIGZyb206IDEgKyBzcHJlYWQgKiAwLjc1LCB0bzogMSAtIHNwcmVhZCwgcGVyaW9kOiBzaXplUGVyaW9kICogMS40LCBkZWxheTogMCwgdW5pdDogJycgfSxcblx0XHR7IHByb3A6ICctLXZnLXgzJywgZnJvbTogLWRyaWZ0ICogMC42LCB0bzogZHJpZnQsIHBlcmlvZDogb3BhY2l0eVBlcmlvZCAqIDEuNDUsIGRlbGF5OiAwLCB1bml0OiAncHgnIH0sXG5cdFx0eyBwcm9wOiAnLS12Zy15MycsIGZyb206IC1kcmlmdCAqIDAuODUsIHRvOiBkcmlmdCAqIDAuNDUsIHBlcmlvZDogb3BhY2l0eVBlcmlvZCAqIDEuNDUsIGRlbGF5OiAwLCB1bml0OiAncHgnIH0sXG5cdFx0eyBwcm9wOiAnLS12Zy1icmVhdGgnLCBmcm9tOiAxIC0gYnJlYXRoRGVwdGgsIHRvOiAxICsgYnJlYXRoRGVwdGgsIHBlcmlvZDogYnJlYXRoUGVyaW9kLCBkZWxheTogMCwgdW5pdDogJycgfSxcblx0XHR7IHByb3A6ICctLXZnLW9wLXRsJywgZnJvbTogMSAtIG9wYWNpdHlEZXB0aCwgdG86IDEsIHBlcmlvZDogb3BhY2l0eVBlcmlvZCwgZGVsYXk6IDAsIHVuaXQ6ICcnIH0sXG5cdFx0eyBwcm9wOiAnLS12Zy1vcC10cicsIGZyb206IDEgLSBvcGFjaXR5RGVwdGgsIHRvOiAxLCBwZXJpb2Q6IG9wYWNpdHlQZXJpb2QgKiAxLjMyLCBkZWxheTogb3BhY2l0eVBlcmlvZCAqIDAuMjgsIHVuaXQ6ICcnIH0sXG5cdFx0eyBwcm9wOiAnLS12Zy1vcC1ibCcsIGZyb206IDEgLSBvcGFjaXR5RGVwdGgsIHRvOiAxLCBwZXJpb2Q6IG9wYWNpdHlQZXJpb2QgKiAwLjg0LCBkZWxheTogb3BhY2l0eVBlcmlvZCAqIDAuNTUsIHVuaXQ6ICcnIH0sXG5cdFx0eyBwcm9wOiAnLS12Zy1vcC1icicsIGZyb206IDEgLSBvcGFjaXR5RGVwdGgsIHRvOiAxLCBwZXJpb2Q6IG9wYWNpdHlQZXJpb2QgKiAxLjU4LCBkZWxheTogb3BhY2l0eVBlcmlvZCAqIDAuODMsIHVuaXQ6ICcnIH0sXG5cdF07XG59XG5cbmZ1bmN0aW9uIGFwcGx5T3NjaWxsYXRvcnMoaG9zdDogSFRNTEVsZW1lbnQsIG9zY2lsbGF0b3JzOiByZWFkb25seSBJT3NjaWxsYXRvcltdLCB0aW1lOiBudW1iZXIsIGFuaW1hdGU6IGJvb2xlYW4pOiB2b2lkIHtcblx0Zm9yIChjb25zdCBvc2Mgb2Ygb3NjaWxsYXRvcnMpIHtcblx0XHRjb25zdCB2YWx1ZSA9IGFuaW1hdGVcblx0XHRcdD8gb3NjLmZyb20gKyAob3NjLnRvIC0gb3NjLmZyb20pICogKCgxIC0gTWF0aC5jb3MoMiAqIE1hdGguUEkgKiAoKHRpbWUgLSBvc2MuZGVsYXkpIC8gb3NjLnBlcmlvZCkpKSAvIDIpXG5cdFx0XHQ6IChvc2MuZnJvbSArIG9zYy50bykgLyAyO1xuXHRcdGhvc3Quc3R5bGUuc2V0UHJvcGVydHkob3NjLnByb3AsIG9zYy51bml0ID09PSAncHgnID8gYCR7dmFsdWUudG9GaXhlZCgyKX1weGAgOiB2YWx1ZS50b0ZpeGVkKDQpKTtcblx0fVxufVxuXG5mdW5jdGlvbiBjbGFtcDAxKHZhbHVlOiBudW1iZXIpOiBudW1iZXIge1xuXHRyZXR1cm4gTWF0aC5tYXgoMCwgTWF0aC5taW4oMSwgdmFsdWUpKTtcbn1cblxuZnVuY3Rpb24gbm93U2Vjb25kcyhlbDogSFRNTEVsZW1lbnQpOiBudW1iZXIge1xuXHRjb25zdCB2aWV3ID0gZWwub3duZXJEb2N1bWVudC5kZWZhdWx0Vmlldztcblx0cmV0dXJuICh2aWV3Py5wZXJmb3JtYW5jZSA/PyBwZXJmb3JtYW5jZSkubm93KCkgLyAxMDAwO1xufVxuXG4vKipcbiAqIE1vdW50IHRoZSByaW0gbGF5ZXJzIChyaW5nLCBpbm5lciB3YXNoLCBibG9vbSBhbmQgY29ybmVyIGNhdGNoZXMpIG9uIGBob3N0YCBhbmRcbiAqIHJldHVybiBhIGRyaXZlciBmb3IgdGhlbS4gYGhvc3RgIGFscmVhZHkgY2FycmllcyB0aGUgYHZvaWNlLWdsb3ctcmltYCBjbGFzcy5cbiAqL1xuZnVuY3Rpb24gbW91bnRSaW1MYXllcnMoaG9zdDogSFRNTEVsZW1lbnQsIG9wdGlvbnM6IHtcblx0cmVhZG9ubHkgdGhlbWU6IEdsb3dUaGVtZUtpbmQ7XG5cdHJlYWRvbmx5IG1vb2Q6IFJpbU1vb2Q7XG5cdHJlYWRvbmx5IGh1ZTogbnVtYmVyO1xuXHRyZWFkb25seSBzYXR1cmF0aW9uOiBudW1iZXI7XG5cdHJlYWRvbmx5IGxpZ2h0bmVzczogbnVtYmVyO1xuXHRyZWFkb25seSBzdHJlbmd0aDogbnVtYmVyO1xuXHRyZWFkb25seSBkdXJhdGlvbjogbnVtYmVyO1xuXHQvKiogSG93IHN0cm9uZ2x5IHRoZSBhdWRpbyBsZXZlbCBtb2R1bGF0ZXMgdGhlIHJpbS4gKi9cblx0cmVhZG9ubHkgYXVkaW9HYWluOiBudW1iZXI7XG5cdC8qKiBFeHRyYSwgc3VwZXItbGluZWFyIHJlc3BvbnNlIHNvIGxvdWQgcGVha3MgYmxvb20gcmF0aGVyIHRoYW4ganVzdCBicmlnaHRlbi4gKi9cblx0cmVhZG9ubHkgcGVha0dhaW46IG51bWJlcjtcblx0LyoqIEhvdyBzdHJvbmdseSB0aGUgYXVkaW8gbGV2ZWwgc3BlZWRzIHRoZSBicmVhdGggdXAuICovXG5cdHJlYWRvbmx5IHNwZWVkR2FpbjogbnVtYmVyO1xuXHQvKiogU2NhbGVzIHRoZSByaW0ncyBhYnNvbHV0ZSBibG9iIHNpemVzIHRvIHRoZSBob3N0ICgxID0gYSBjaGF0IGlucHV0IGJveCkuICovXG5cdHJlYWRvbmx5IHNpemU/OiBudW1iZXI7XG59KTogSU1vdW50ZWRMYXllciB7XG5cdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdGNvbnN0IG1vb2RDbGFzcyA9IGB2b2ljZS1nbG93LXJpbS0ke29wdGlvbnMubW9vZH1gO1xuXHRob3N0LmNsYXNzTGlzdC5hZGQoJ3ZvaWNlLWdsb3ctcmltJywgbW9vZENsYXNzKTtcblx0c3RvcmUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBob3N0LmNsYXNzTGlzdC5yZW1vdmUoJ3ZvaWNlLWdsb3ctcmltJywgbW9vZENsYXNzKSkpO1xuXG5cdGZvciAoY29uc3QgY2xzIG9mIFsndm9pY2UtZ2xvdy1yaW0tY29ybmVycycsICd2b2ljZS1nbG93LXJpbS1ibG9vbSddKSB7XG5cdFx0Y29uc3QgZWwgPSAkKCdkaXYnKTtcblx0XHRlbC5jbGFzc05hbWUgPSBjbHM7XG5cdFx0aG9zdC5hcHBlbmRDaGlsZChlbCk7XG5cdFx0c3RvcmUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBlbC5yZW1vdmUoKSkpO1xuXHR9XG5cblx0Y29uc3QgbGF5ZXJPcGFjaXR5ID0gUklNX0xBWUVSX09QQUNJVFlbb3B0aW9ucy50aGVtZV07XG5cdGhvc3Quc3R5bGUuc2V0UHJvcGVydHkoJy0tdmctc2F0JywgYCR7b3B0aW9ucy5zYXR1cmF0aW9ufSVgKTtcblx0aG9zdC5zdHlsZS5zZXRQcm9wZXJ0eSgnLS12Zy1saWdodCcsIGAke29wdGlvbnMubGlnaHRuZXNzfSVgKTtcblx0aG9zdC5zdHlsZS5zZXRQcm9wZXJ0eSgnLS12Zy1yaW5nLW9wYWNpdHknLCBTdHJpbmcobGF5ZXJPcGFjaXR5LnJpbmcpKTtcblx0aG9zdC5zdHlsZS5zZXRQcm9wZXJ0eSgnLS12Zy1pbm5lci1vcGFjaXR5JywgU3RyaW5nKGxheWVyT3BhY2l0eS5pbm5lcikpO1xuXHRob3N0LnN0eWxlLnNldFByb3BlcnR5KCctLXZnLWJsb29tLW9wYWNpdHknLCBTdHJpbmcobGF5ZXJPcGFjaXR5LmJsb29tKSk7XG5cdGlmIChvcHRpb25zLnNpemUgIT09IHVuZGVmaW5lZCkge1xuXHRcdGhvc3Quc3R5bGUuc2V0UHJvcGVydHkoJy0tdmctc2l6ZScsIG9wdGlvbnMuc2l6ZS50b0ZpeGVkKDMpKTtcblx0fVxuXG5cdGNvbnN0IG9zY2lsbGF0b3JzID0gcmltT3NjaWxsYXRvcnMob3B0aW9ucy50aGVtZSwgb3B0aW9ucy5kdXJhdGlvbik7XG5cdGxldCB0aW1lID0gMDtcblx0bGV0IHByZXZpb3VzVGltZXN0YW1wOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdGxldCBsZXZlbCA9IDAuMjtcblxuXHRjb25zdCBhcHBseSA9IChpbnB1dDogbnVtYmVyLCBhbmltYXRlOiBib29sZWFuKTogdm9pZCA9PiB7XG5cdFx0aWYgKGFuaW1hdGUpIHtcblx0XHRcdGNvbnN0IHRpbWVzdGFtcCA9IG5vd1NlY29uZHMoaG9zdCk7XG5cdFx0XHRjb25zdCBkZWx0YSA9IHByZXZpb3VzVGltZXN0YW1wID09PSB1bmRlZmluZWQgPyAwIDogTWF0aC5taW4oMC4wNSwgdGltZXN0YW1wIC0gcHJldmlvdXNUaW1lc3RhbXApO1xuXHRcdFx0cHJldmlvdXNUaW1lc3RhbXAgPSB0aW1lc3RhbXA7XG5cdFx0XHRjb25zdCB0YXJnZXQgPSBjbGFtcDAxKGlucHV0KTtcblx0XHRcdC8vIEFzeW1tZXRyaWM6IHN3ZWxsIGludG8gc3BlZWNoIHF1aWNrbHksIGRyaWZ0IGJhY2sgb3V0IG9mIGl0IHNsb3dseSwgc29cblx0XHRcdC8vIHRoZSByaW0gcmVhZHMgYXMgYW1iaWVudCBsaWdodCByYXRoZXIgdGhhbiBhcyBhIGxldmVsIG1ldGVyLlxuXHRcdFx0bGV2ZWwgKz0gKHRhcmdldCAtIGxldmVsKSAqICh0YXJnZXQgPiBsZXZlbCA/IDAuMyA6IDAuMDgpO1xuXHRcdFx0dGltZSArPSBkZWx0YSAqIChvcHRpb25zLnNwZWVkR2FpbiA9PT0gMCA/IDAuMjIgOiAwLjQgKyBvcHRpb25zLnNwZWVkR2FpbiAqIGxldmVsKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0bGV2ZWwgPSBjbGFtcDAxKGlucHV0KTtcblx0XHR9XG5cdFx0YXBwbHlPc2NpbGxhdG9ycyhob3N0LCBvc2NpbGxhdG9ycywgdGltZSwgYW5pbWF0ZSk7XG5cdFx0Ly8gUGVha3MgcmVhZCBkZW5zZXIgdGhhbiBhIGxpbmVhciByZXNwb25zZSB3b3VsZCBnaXZlOiB0aGUgZXh0cmEgY3VydmUgb25cblx0XHQvLyB0b3Agb2YgdGhlIGxpbmVhciB0ZXJtIGxlYXZlcyBxdWlldCBzcGVlY2ggY2FsbSBidXQgbGV0cyBhIGxvdWQgbW9tZW50XG5cdFx0Ly8gZ2VudWluZWx5IGJsb29tLCBpbnN0ZWFkIG9mIHRoZSB3aG9sZSByYW5nZSBzaXR0aW5nIGluIGEgbmFycm93IGJhbmQuXG5cdFx0Y29uc3QgcGVhayA9IGxldmVsICogbGV2ZWw7XG5cdFx0aG9zdC5zdHlsZS5zZXRQcm9wZXJ0eSgnLS12Zy1zdHJlbmd0aCcsIChvcHRpb25zLnN0cmVuZ3RoICogKDAuNSArIG9wdGlvbnMuYXVkaW9HYWluICogbGV2ZWwgKyBvcHRpb25zLnBlYWtHYWluICogcGVhaykpLnRvRml4ZWQoMykpO1xuXHRcdC8vIFRoZSBibG9vbSB0aGlja2VucyB3aXRoIHRoZSBwZWFrIHRvbywgc28gXCJsb3VkZXJcIiByZWFkcyBhcyBtb3JlIGxpZ2h0XG5cdFx0Ly8gcmF0aGVyIHRoYW4gb25seSBhcyBhIGJyaWdodGVyIGhhaXJsaW5lLlxuXHRcdGhvc3Quc3R5bGUuc2V0UHJvcGVydHkoJy0tdmctYmxvb20tb3BhY2l0eScsIChsYXllck9wYWNpdHkuYmxvb20gKiAoMSArIG9wdGlvbnMucGVha0dhaW4gKiBwZWFrKSkudG9GaXhlZCgzKSk7XG5cdFx0Ly8gQSBzbG93IGh1ZSB3YW5kZXIga2VlcHMgdGhlIGxpZ2h0IGFsaXZlIHdpdGhvdXQgZXZlciBsZWF2aW5nIHRoZSBhY2NlbnQuXG5cdFx0Y29uc3QgZHJpZnQgPSBhbmltYXRlID8gMTQgKiBNYXRoLnNpbih0aW1lICogMC40KSA6IDA7XG5cdFx0aG9zdC5zdHlsZS5zZXRQcm9wZXJ0eSgnLS12Zy1odWUnLCAob3B0aW9ucy5odWUgKyBkcmlmdCkudG9GaXhlZCgxKSk7XG5cdH07XG5cblx0cmV0dXJuIHtcblx0XHRob3N0LFxuXHRcdGRyaXZlOiAoaW5wdXQ6IG51bWJlcikgPT4gYXBwbHkoaW5wdXQsIHRydWUpLFxuXHRcdGRyaXZlU3RhdGljOiAoaW5wdXQ6IG51bWJlcikgPT4gYXBwbHkoaW5wdXQsIGZhbHNlKSxcblx0XHRkaXNwb3NlOiAoKSA9PiBzdG9yZS5kaXNwb3NlKCksXG5cdH07XG59XG5cbi8qKlxuICogQ3JlYXRlIGEgdm9pY2UgZ2xvdyBjb250cm9sbGVyIGJvdW5kIHRvIGB0YXJnZXRgICh0aGUgaW5wdXQgYm94KS4gYHRoZW1lS2luZGBcbiAqIGxldHMgdGhlIGNhbGxlciBzdXBwbHkgdGhlIGFjdGl2ZSBsaWdodC9kYXJrIHRoZW1lLCBhbmQgYGNvbG9yc2AgdGhlIHJlc29sdmVkXG4gKiB0aGVtZSBhY2NlbnRzOyBib3RoIGFyZSByZS1yZWFkIG9uIHtAbGluayBJVm9pY2VHbG93Q29udHJvbGxlci5yZWZyZXNoVGhlbWV9LlxuICovXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlVm9pY2VHbG93Q29udHJvbGxlcih0YXJnZXQ6IEhUTUxFbGVtZW50LCB0aGVtZUtpbmQ/OiAoKSA9PiBHbG93VGhlbWVLaW5kLCBjb2xvcnM/OiAoKSA9PiBJVm9pY2VHbG93Q29sb3JzKTogSVZvaWNlR2xvd0NvbnRyb2xsZXIge1xuXHRyZXR1cm4gbmV3IFZvaWNlR2xvd0NvbnRyb2xsZXIodGFyZ2V0LCB0aGVtZUtpbmQsIGNvbG9ycyk7XG59XG5cbi8qKiBBIHN0YW5kYWxvbmUgcmltIGxpZ2h0IG1vdW50ZWQgb3ZlciBhIHNpbmdsZSBlbGVtZW50LiAqL1xuZXhwb3J0IGludGVyZmFjZSBJVm9pY2VSaW1MaWdodCBleHRlbmRzIElEaXNwb3NhYmxlIHtcblx0LyoqIEFkdmFuY2UgdGhlIHJpbSBmcm9tIHRoZSBzbW9vdGhlZCBhdWRpbyBgbGV2ZWxgIChbMCwxXSkuICovXG5cdGRyaXZlKGxldmVsOiBudW1iZXIpOiB2b2lkO1xuXHQvKiogUGluIHRvIGEgcmVwcmVzZW50YXRpdmUgc3RpbGwgZnJhbWUgKHJlZHVjZWQgbW90aW9uKS4gKi9cblx0ZHJpdmVTdGF0aWMobGV2ZWw6IG51bWJlcik6IHZvaWQ7XG5cdC8qKiBSZS1tb3VudCB3aXRoIGEgZnJlc2hseSByZXNvbHZlZCBhY2NlbnQgLyB0aGVtZS4gKi9cblx0cmVmcmVzaChhY2NlbnQ6IENvbG9yLCB0aGVtZTogR2xvd1RoZW1lS2luZCwgYmFja2dyb3VuZD86IENvbG9yKTogdm9pZDtcbn1cblxuLyoqXG4gKiBUaGUgaGVpZ2h0IChweCkgdGhlIHJpbSdzIGJsb2Igc2l6ZXMgYXJlIGF1dGhvcmVkIGFnYWluc3QgXHUyMDE0IGEgY2hhdCBpbnB1dCBib3guXG4gKiBTbWFsbGVyIGhvc3RzIHNjYWxlIHRoZWlyIGJsb2JzIGRvd24gZnJvbSB0aGlzLCBzbyBhIG1pYyBidXR0b24gZ2V0cyB0aGUgc2FtZVxuICogbGlnaHQgcmF0aGVyIHRoYW4gb25lIGJsb2IgY292ZXJpbmcgdGhlIHdob2xlIGVsZW1lbnQuXG4gKi9cbmNvbnN0IFJJTV9SRUZFUkVOQ0VfSEVJR0hUID0gNzg7XG5cbi8qKlxuICogSG93IG11Y2ggb2YgdGhlIHJpbSdzIHNjYWxlIGlzIGZpeGVkIHJhdGhlciB0aGFuIHByb3BvcnRpb25hbCB0byB0aGUgaG9zdC5cbiAqXG4gKiBTY2FsaW5nIHRoZSBibG9icyBzdHJpY3RseSB3aXRoIHRoZSBob3N0IGNvbGxhcHNlcyB0aGUgZWZmZWN0IG9uIGEgY29udHJvbDpcbiAqIHRoZSBibG9icyBzdG9wIG92ZXJsYXBwaW5nLCBzbyB0aGUgd2FzaCBicmVha3MgaW50byBzY2F0dGVyZWQgZG90cyBhbmQgb25seVxuICogdGhlIGhhaXJsaW5lIHN1cnZpdmVzLiBIb2xkaW5nIHBhcnQgb2YgdGhlIHNjYWxlIGJhY2sga2VlcHMgdGhlbSBsYXJnZSBlbm91Z2hcbiAqIHRvIGJsZWVkIGludG8gb25lIGFub3RoZXIsIHdoaWNoIGlzIHdoYXQgbWFrZXMgdGhlIHJpbSByZWFkIGFzIGxpZ2h0LlxuICovXG5jb25zdCBSSU1fU0laRV9GTE9PUiA9IDAuMzU7XG5cbi8qKlxuICogTW91bnQgdGhlIHJpbSBvdmVyIGB0YXJnZXRgIGFzIGFuIGFsd2F5cy1vbiBsaWdodCwgZm9yIGhvc3RzIHRoYXQgbGlnaHQgYVxuICogc2luZ2xlIGVsZW1lbnQgcmF0aGVyIHRoYW4gY3Jvc3MtZmFkaW5nIGJldHdlZW4gdm9pY2Ugc3RhdGVzIFx1MjAxNCB0aGUgZGljdGF0aW9uXG4gKiBtaWNyb3Bob25lLCB3aGljaCBpcyBlaXRoZXIgb3BlbiBvciBjbG9zZWQuXG4gKlxuICogVGhlIHJpbSBsaXZlcyBpbiBpdHMgb3duIGFic29sdXRlbHktcG9zaXRpb25lZCBzbG90LCBzbyBob3N0cyB0aGF0IHJlYnVpbGRcbiAqIHRoZWlyIGJ1dHRvbiBjb250ZW50cyBkb24ndCB0ZWFyIGl0IG91dC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZVZvaWNlUmltTGlnaHQodGFyZ2V0OiBIVE1MRWxlbWVudCwgYWNjZW50OiBDb2xvciwgdGhlbWU6IEdsb3dUaGVtZUtpbmQsIG1vb2Q6IFZvaWNlUmltTW9vZCA9ICdjb29sJywgYmFja2dyb3VuZD86IENvbG9yKTogSVZvaWNlUmltTGlnaHQge1xuXHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRpZiAoIXRhcmdldC5zdHlsZS5wb3NpdGlvbikge1xuXHRcdHRhcmdldC5zdHlsZS5wb3NpdGlvbiA9ICdyZWxhdGl2ZSc7XG5cdH1cblx0Y29uc3Qgc2xvdCA9ICQoJy52b2ljZS1nbG93LXNsb3Qudm9pY2UtZ2xvdy1zbG90LWlubGluZScpO1xuXHR0YXJnZXQuYXBwZW5kQ2hpbGQoc2xvdCk7XG5cdHN0b3JlLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gc2xvdC5yZW1vdmUoKSkpO1xuXG5cdGNvbnN0IG1vdW50ID0gc3RvcmUuYWRkKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxJTW91bnRlZExheWVyPigpKTtcblx0bGV0IGxldmVsID0gMC4zO1xuXG5cdGNvbnN0IHJlbW91bnQgPSAobmV4dEFjY2VudDogQ29sb3IsIG5leHRUaGVtZTogR2xvd1RoZW1lS2luZCwgbmV4dEJhY2tncm91bmQ/OiBDb2xvcikgPT4ge1xuXHRcdGNvbnN0IHJpbSA9IHJlc29sdmVWb2ljZVJpbUFjY2VudChuZXh0QWNjZW50LCBtb29kLCBuZXh0VGhlbWUsIG5leHRCYWNrZ3JvdW5kKTtcblx0XHQvLyBNZWFzdXJlZCBsYXppbHk6IGhvc3RzIGNvbW1vbmx5IGJ1aWxkIHRoZSBidXR0b24gYmVmb3JlIGl0IGlzIGF0dGFjaGVkLFxuXHRcdC8vIGFuZCBhIGRldGFjaGVkIGVsZW1lbnQgaGFzIG5vIGJveCB0byBtZWFzdXJlLlxuXHRcdGNvbnN0IGhlaWdodCA9IHRhcmdldC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKS5oZWlnaHQ7XG5cdFx0Y29uc3QgcHJvcG9ydGlvbiA9IGhlaWdodCA+IDAgPyBNYXRoLm1pbigxLCBoZWlnaHQgLyBSSU1fUkVGRVJFTkNFX0hFSUdIVCkgOiAwO1xuXHRcdG1vdW50LmNsZWFyKCk7XG5cdFx0bW91bnQudmFsdWUgPSBtb3VudFJpbUxheWVycyhzbG90LCB7XG5cdFx0XHR0aGVtZTogbmV4dFRoZW1lLFxuXHRcdFx0bW9vZCxcblx0XHRcdGh1ZTogcmltLmh1ZSxcblx0XHRcdHNhdHVyYXRpb246IHJpbS5zYXR1cmF0aW9uLFxuXHRcdFx0bGlnaHRuZXNzOiByaW0ubGlnaHRuZXNzLFxuXHRcdFx0c3RyZW5ndGg6IEFDVElWRV9SSU1fU1RSRU5HVEgsXG5cdFx0XHRkdXJhdGlvbjogUklNX0RVUkFUSU9OLFxuXHRcdFx0YXVkaW9HYWluOiAwLjgsXG5cdFx0XHRwZWFrR2FpbjogMC45NSxcblx0XHRcdHNwZWVkR2FpbjogMC45LFxuXHRcdFx0c2l6ZTogUklNX1NJWkVfRkxPT1IgKyAoMSAtIFJJTV9TSVpFX0ZMT09SKSAqIHByb3BvcnRpb24sXG5cdFx0fSk7XG5cdFx0bW91bnQudmFsdWUuZHJpdmVTdGF0aWMobGV2ZWwpO1xuXHR9O1xuXHRyZW1vdW50KGFjY2VudCwgdGhlbWUsIGJhY2tncm91bmQpO1xuXG5cdHJldHVybiB7XG5cdFx0ZHJpdmU6IChpbnB1dDogbnVtYmVyKSA9PiB7XG5cdFx0XHRsZXZlbCA9IGlucHV0O1xuXHRcdFx0bW91bnQudmFsdWU/LmRyaXZlKGlucHV0KTtcblx0XHR9LFxuXHRcdGRyaXZlU3RhdGljOiAoaW5wdXQ6IG51bWJlcikgPT4ge1xuXHRcdFx0bGV2ZWwgPSBpbnB1dDtcblx0XHRcdG1vdW50LnZhbHVlPy5kcml2ZVN0YXRpYyhpbnB1dCk7XG5cdFx0fSxcblx0XHRyZWZyZXNoOiByZW1vdW50LFxuXHRcdGRpc3Bvc2U6ICgpID0+IHN0b3JlLmRpc3Bvc2UoKSxcblx0fTtcbn1cblxuY2xhc3MgVm9pY2VHbG93Q29udHJvbGxlciBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJVm9pY2VHbG93Q29udHJvbGxlciB7XG5cblx0LyoqIFR3byBidWZmZXJlZCBvdmVybGF5IHNsb3RzLCBzbyBzdGF0ZSBjaGFuZ2VzIGNyb3NzLWZhZGUgaW5zdGVhZCBvZiBzbmFwcGluZy4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfc2xvdHM6IHJlYWRvbmx5IEhUTUxFbGVtZW50W107XG5cdC8qKiBPbmUgbW91bnQgcGVyIHNsb3QsIHNvIG1vdW50aW5nIGEgbmV3IGxheWVyIHRlYXJzIHRoZSBvbGQgb25lIGRvd24uICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX21vdW50cyA9IG5ldyBNYXA8SFRNTEVsZW1lbnQsIE11dGFibGVEaXNwb3NhYmxlPElNb3VudGVkTGF5ZXI+PigpO1xuXG5cdHByaXZhdGUgX2Zyb250OiBJTW91bnRlZExheWVyIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9jdXJyZW50U3RhdGU6IFZvaWNlR2xvd1N0YXRlIHwgJ25vbmUnID0gJ25vbmUnO1xuXHRwcml2YXRlIF9jdXJyZW50TW9vZDogUmltTW9vZCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfY2xlYXJUaW1lcjogUmV0dXJuVHlwZTx0eXBlb2Ygc2V0VGltZW91dD4gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2NvbG9yczogSVZvaWNlR2xvd0NvbG9ycztcblx0cHJpdmF0ZSBfcmVkdWNlZE1vdGlvbiA9IGZhbHNlO1xuXHRwcml2YXRlIF9kaXNwb3NlZCA9IGZhbHNlO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3RhcmdldDogSFRNTEVsZW1lbnQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfdGhlbWVLaW5kOiAoKSA9PiBHbG93VGhlbWVLaW5kID0gKCkgPT4gJ2RhcmsnLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2NvbG9yc1Byb3ZpZGVyOiAoKSA9PiBJVm9pY2VHbG93Q29sb3JzID0gKCkgPT4gREVGQVVMVF9WT0lDRV9HTE9XX0NPTE9SUyxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0cnkge1xuXHRcdFx0dGhpcy5fY29sb3JzID0gdGhpcy5fY29sb3JzUHJvdmlkZXIoKTtcblx0XHRcdF90YXJnZXQuc3R5bGUucG9zaXRpb24gPSBfdGFyZ2V0LnN0eWxlLnBvc2l0aW9uIHx8ICdyZWxhdGl2ZSc7XG5cblx0XHRcdGNvbnN0IGNyZWF0ZVNsb3QgPSAoKTogSFRNTEVsZW1lbnQgPT4ge1xuXHRcdFx0XHRjb25zdCBlbCA9ICQoJ2RpdicpO1xuXHRcdFx0XHRlbC5jbGFzc05hbWUgPSAndm9pY2UtZ2xvdy1zbG90Jztcblx0XHRcdFx0Ly8gQWJvdmUgdGhlIHRyYW5zY3JpcHQgb3ZlcmxheSwgd2hpY2ggaXMgb3BhcXVlIGFuZCB3b3VsZCBvdGhlcndpc2Vcblx0XHRcdFx0Ly8gcGFpbnQgb3ZlciB0aGUgdG9wIG9mIHRoZSBib3ggYW5kIGxlYXZlIHRoZSBnbG93IHZpc2libGUgb25seSBhbG9uZ1xuXHRcdFx0XHQvLyB0aGUgYm90dG9tIHRvb2xiYXIgc3RyaXAuXG5cdFx0XHRcdGVsLnN0eWxlLnpJbmRleCA9ICcxMSc7XG5cdFx0XHRcdF90YXJnZXQuYXBwZW5kQ2hpbGQoZWwpO1xuXHRcdFx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4gZWwucmVtb3ZlKCkpKTtcblx0XHRcdFx0dGhpcy5fbW91bnRzLnNldChlbCwgdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPElNb3VudGVkTGF5ZXI+KCkpKTtcblx0XHRcdFx0cmV0dXJuIGVsO1xuXHRcdFx0fTtcblx0XHRcdHRoaXMuX3Nsb3RzID0gW2NyZWF0ZVNsb3QoKSwgY3JlYXRlU2xvdCgpXTtcblxuXHRcdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdFx0dGhpcy5fZGlzcG9zZWQgPSB0cnVlO1xuXHRcdFx0XHRpZiAodGhpcy5fY2xlYXJUaW1lciAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0Y2xlYXJUaW1lb3V0KHRoaXMuX2NsZWFyVGltZXIpO1xuXHRcdFx0XHRcdHRoaXMuX2NsZWFyVGltZXIgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhpcy5kaXNwb3NlKCk7XG5cdFx0XHR0aHJvdyBlcnJvcjtcblx0XHR9XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdC8vIEhvc3RzIGNvbW1vbmx5IHJlZ2lzdGVyIHRoZSBjb250cm9sbGVyIGJlZm9yZSB0aGUgc3RvcC1ob29rIHRoYXQgY2FsbHNcblx0XHQvLyBgY2xlYXIoKWAsIGFuZCBhIGBEaXNwb3NhYmxlU3RvcmVgIGRpc3Bvc2VzIGluIGluc2VydGlvbiBvcmRlciBcdTIwMTQgc29cblx0XHQvLyBgY2xlYXIoKWAgY2FuIHJ1biBhZnRlciB0aGlzLiBGbGFnIGl0IHVwIGZyb250IHNvIHRoYXQgY2FsbCBpcyBhIG5vLW9wXG5cdFx0Ly8gYW5kIGNhbid0IGFybSBhIHRlYXJkb3duIHRpbWVyIG5vdGhpbmcgd2lsbCBjYW5jZWwuXG5cdFx0dGhpcy5fZGlzcG9zZWQgPSB0cnVlO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxuXG5cdHJlbmRlcihzdGF0ZTogVm9pY2VHbG93U3RhdGUsIGxldmVsOiBudW1iZXIsIHJlZHVjZWRNb3Rpb246IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fZGlzcG9zZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgbW9vZCA9IHJlc29sdmVNb29kKHN0YXRlKTtcblx0XHR0aGlzLl9yZWR1Y2VkTW90aW9uID0gcmVkdWNlZE1vdGlvbjtcblx0XHRpZiAoIW1vb2QpIHtcblx0XHRcdHRoaXMuY2xlYXIoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBLZXllZCBvbiB0aGUgbW9vZCwgbm90IHRoZSBzdGF0ZSwgc28gc3RhdGVzIHRoYXQgc2hhcmUgYSBsb29rIG5ldmVyXG5cdFx0Ly8gcmUtbW91bnQgb3IgY3Jvc3MtZmFkZSBiZXR3ZWVuIGVhY2ggb3RoZXIuXG5cdFx0aWYgKG1vb2QgIT09IHRoaXMuX2N1cnJlbnRNb29kKSB7XG5cdFx0XHR0aGlzLl9jdXJyZW50TW9vZCA9IG1vb2Q7XG5cdFx0XHRpZiAodGhpcy5fY2xlYXJUaW1lciAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdGNsZWFyVGltZW91dCh0aGlzLl9jbGVhclRpbWVyKTtcblx0XHRcdFx0dGhpcy5fY2xlYXJUaW1lciA9IHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdHRoaXMuX3Nob3dMYXllcihtb29kLCByZWR1Y2VkTW90aW9uKTtcblx0XHR9XG5cblx0XHQvLyBTdGF0ZSBjbGFzc2VzIHN0aWxsIHRyYWNrIHRoZSByZWFsIHN0YXRlLCBzbyBzdXJmYWNlIENTUyB0aGF0IHRpbnRzIHRoZVxuXHRcdC8vIG1pYyBnbHlwaCBjYW4gdGVsbCB0aGUgc3RhdGVzIGFwYXJ0IGV2ZW4gd2hlbiB0aGV5IHNoYXJlIGEgcmltLlxuXHRcdGlmIChzdGF0ZSAhPT0gdGhpcy5fY3VycmVudFN0YXRlKSB7XG5cdFx0XHR0aGlzLl9jdXJyZW50U3RhdGUgPSBzdGF0ZTtcblx0XHRcdHRoaXMuX3RhcmdldC5jbGFzc0xpc3QuYWRkKCd2b2ljZS1hY3RpdmUnKTtcblx0XHRcdHRoaXMuX3RhcmdldC5jbGFzc0xpc3QudG9nZ2xlKCd2b2ljZS1saXN0ZW5pbmcnLCBzdGF0ZSA9PT0gJ2xpc3RlbmluZycpO1xuXHRcdFx0dGhpcy5fdGFyZ2V0LmNsYXNzTGlzdC50b2dnbGUoJ3ZvaWNlLXByb2Nlc3NpbmcnLCBzdGF0ZSA9PT0gJ3Byb2Nlc3NpbmcnKTtcblx0XHRcdHRoaXMuX3RhcmdldC5jbGFzc0xpc3QudG9nZ2xlKCd2b2ljZS1zcGVha2luZycsIHN0YXRlID09PSAnc3BlYWtpbmcnKTtcblx0XHRcdGNvbnN0IGFjY2VudCA9IHJlc29sdmVWb2ljZVJpbUFjY2VudCh2b2ljZUdsb3dTdGF0ZUNvbG9yKHN0YXRlLCB0aGlzLl9jb2xvcnMpLCBtb29kLCB0aGlzLl90aGVtZUtpbmQoKSwgdGhpcy5fY29sb3JzLmJhY2tncm91bmQpO1xuXHRcdFx0dGhpcy5fdGFyZ2V0LnN0eWxlLnNldFByb3BlcnR5KCctLXZvaWNlLWFjY2VudCcsIGBoc2woJHthY2NlbnQuaHVlfSAke2FjY2VudC5zYXR1cmF0aW9ufSUgJHthY2NlbnQubGlnaHRuZXNzfSUpYCk7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX2Zyb250ICYmICFyZWR1Y2VkTW90aW9uKSB7XG5cdFx0XHR0aGlzLl9mcm9udC5kcml2ZShsZXZlbCk7XG5cdFx0fVxuXHR9XG5cblx0Y2xlYXIoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2Rpc3Bvc2VkIHx8IHRoaXMuX2N1cnJlbnRTdGF0ZSA9PT0gJ25vbmUnKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2N1cnJlbnRTdGF0ZSA9ICdub25lJztcblx0XHR0aGlzLl9jdXJyZW50TW9vZCA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl90YXJnZXQuY2xhc3NMaXN0LnJlbW92ZSgndm9pY2UtYWN0aXZlJywgJ3ZvaWNlLWxpc3RlbmluZycsICd2b2ljZS1wcm9jZXNzaW5nJywgJ3ZvaWNlLXNwZWFraW5nJyk7XG5cdFx0dGhpcy5fdGFyZ2V0LnN0eWxlLnJlbW92ZVByb3BlcnR5KCctLXZvaWNlLWFjY2VudCcpO1xuXHRcdGNvbnN0IHByZXZpb3VzID0gdGhpcy5fZnJvbnQ7XG5cdFx0dGhpcy5fZnJvbnQgPSB1bmRlZmluZWQ7XG5cdFx0aWYgKHByZXZpb3VzKSB7XG5cdFx0XHR0aGlzLl9mYWRlT3V0KHByZXZpb3VzLmhvc3QpO1xuXHRcdFx0dGhpcy5fc2NoZWR1bGVUZWFyZG93bihwcmV2aW91cy5ob3N0KTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogVGVhciBhIHNsb3QncyBtb3VudCBkb3duIG9uY2UgaXQgaGFzIGZhZGVkIG91dCBzbyBpdCBzdG9wcyBkcml2aW5nIENTU1xuXHQgKiB2YXJpYWJsZXMuIEd1YXJkZWQgb24gcmUtZW50cnk6IGlmIHRoZSBzbG90IGhhcyBzaW5jZSBiZWVuIHJldXNlZCBhcyB0aGVcblx0ICogZnJvbnQgbGF5ZXIsIHRoZSBuZXcgbW91bnQgbXVzdCBzdXJ2aXZlLlxuXHQgKi9cblx0cHJpdmF0ZSBfc2NoZWR1bGVUZWFyZG93bihob3N0OiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9jbGVhclRpbWVyICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdGNsZWFyVGltZW91dCh0aGlzLl9jbGVhclRpbWVyKTtcblx0XHR9XG5cdFx0dGhpcy5fY2xlYXJUaW1lciA9IHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0dGhpcy5fY2xlYXJUaW1lciA9IHVuZGVmaW5lZDtcblx0XHRcdGlmICh0aGlzLl9mcm9udD8uaG9zdCAhPT0gaG9zdCkge1xuXHRcdFx0XHR0aGlzLl9tb3VudHMuZ2V0KGhvc3QpPy5jbGVhcigpO1xuXHRcdFx0fVxuXHRcdH0sIEZBREVfT1VUX01TKTtcblx0fVxuXG5cdHJlZnJlc2hUaGVtZSgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fZGlzcG9zZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fY29sb3JzID0gdGhpcy5fY29sb3JzUHJvdmlkZXIoKTtcblx0XHRjb25zdCBzdGF0ZSA9IHRoaXMuX2N1cnJlbnRTdGF0ZTtcblx0XHRpZiAodGhpcy5fZnJvbnQgJiYgc3RhdGUgIT09ICdub25lJykge1xuXHRcdFx0Ly8gUmUtbW91bnQgdGhlIGN1cnJlbnQgbGF5ZXIgc28gaXQgcGlja3MgdXAgdGhlIG5ldyBhY2NlbnQgLyB0aGVtZS5cblx0XHRcdHRoaXMuX2N1cnJlbnRTdGF0ZSA9ICdub25lJztcblx0XHRcdHRoaXMuX2N1cnJlbnRNb29kID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy5yZW5kZXIoc3RhdGUsIDAuMywgdGhpcy5fcmVkdWNlZE1vdGlvbik7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfc2hvd0xheWVyKG1vb2Q6IFJpbU1vb2QsIHJlZHVjZWRNb3Rpb246IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRjb25zdCBob3N0ID0gdGhpcy5fc2xvdHMuZmluZChzbG90ID0+IHNsb3QgIT09IHRoaXMuX2Zyb250Py5ob3N0KSA/PyB0aGlzLl9zbG90c1swXTtcblxuXHRcdC8vIERpc3Bvc2UgYW55IHByaW9yIG1vdW50IG9uIHRoaXMgc2xvdCBGSVJTVDogbW91bnRzIG93biB0aGUgc2xvdCdzIGNsYXNzZXNcblx0XHQvLyBhbmQgY3VzdG9tIHByb3BlcnRpZXMsIHNvIGRpc3Bvc2luZyBhZnRlciBtb3VudGluZyB0aGUgbmV3IGxheWVyIHdvdWxkXG5cdFx0Ly8gc3RyaXAgdGhlIGZyZXNoIG9uZXMuXG5cdFx0dGhpcy5fbW91bnRzLmdldChob3N0KSEuY2xlYXIoKTtcblx0XHRjb25zdCBtb3VudGVkID0gdGhpcy5fbW91bnQoaG9zdCwgbW9vZCk7XG5cdFx0dGhpcy5fbW91bnRzLmdldChob3N0KSEudmFsdWUgPSBtb3VudGVkO1xuXHRcdGlmIChyZWR1Y2VkTW90aW9uKSB7XG5cdFx0XHRtb3VudGVkLmRyaXZlU3RhdGljKDAuNCk7XG5cdFx0fVxuXG5cdFx0Ly8gVW5kZXIgcmVkdWNlZCBtb3Rpb24gdGhlIGxheWVycyBzd2FwIG91dHJpZ2h0OiBhIDYwMG1zIGNyb3NzLWZhZGUgaXNcblx0XHQvLyBzdGlsbCBtb3Rpb24sIGFuZCB0aGUgZml4dHVyZXMgcmVseSBvbiB0aGUgZnJhbWUgYmVpbmcgc2V0dGxlZC5cblx0XHRjb25zdCBmYWRlID0gcmVkdWNlZE1vdGlvbiA/ICdub25lJyA6IEZBREU7XG5cdFx0Y29uc3QgcHJldmlvdXMgPSB0aGlzLl9mcm9udDtcblx0XHRob3N0LnN0eWxlLnRyYW5zaXRpb24gPSAnbm9uZSc7XG5cdFx0aG9zdC5zdHlsZS5vcGFjaXR5ID0gJzAnO1xuXHRcdHZvaWQgaG9zdC5vZmZzZXRXaWR0aDsgLy8gY29tbWl0IHRoZSBzdGFydCBwb3NlIGJlZm9yZSB0cmFuc2l0aW9uaW5nIGZyb20gaXRcblx0XHRob3N0LnN0eWxlLnRyYW5zaXRpb24gPSBmYWRlO1xuXHRcdGhvc3Quc3R5bGUub3BhY2l0eSA9ICcxJztcblx0XHRpZiAocHJldmlvdXMgJiYgcHJldmlvdXMuaG9zdCAhPT0gaG9zdCkge1xuXHRcdFx0dGhpcy5fZmFkZU91dChwcmV2aW91cy5ob3N0LCBmYWRlKTtcblx0XHRcdC8vIFN0b3AgdGhlIG91dGdvaW5nIGxheWVyIGRyaXZpbmcgQ1NTIHZhcnMgb25jZSBpdCBpcyBvdXQgb2Ygc2lnaHQuXG5cdFx0XHR0aGlzLl9zY2hlZHVsZVRlYXJkb3duKHByZXZpb3VzLmhvc3QpO1xuXHRcdH1cblx0XHR0aGlzLl9mcm9udCA9IG1vdW50ZWQ7XG5cdH1cblxuXHRwcml2YXRlIF9mYWRlT3V0KGhvc3Q6IEhUTUxFbGVtZW50LCBmYWRlOiBzdHJpbmcgPSBGQURFKTogdm9pZCB7XG5cdFx0aG9zdC5zdHlsZS50cmFuc2l0aW9uID0gZmFkZTtcblx0XHRob3N0LnN0eWxlLm9wYWNpdHkgPSAnMCc7XG5cdH1cblxuXHRwcml2YXRlIF9tb3VudChob3N0OiBIVE1MRWxlbWVudCwgbW9vZDogUmltTW9vZCk6IElNb3VudGVkTGF5ZXIge1xuXHRcdGNvbnN0IHRoZW1lID0gdGhpcy5fdGhlbWVLaW5kKCk7XG5cdFx0Y29uc3QgYWNjZW50Q29sb3IgPSBtb29kID09PSAnd2FybScgPyB0aGlzLl9jb2xvcnMuc3BlYWtpbmcgOiB0aGlzLl9jb2xvcnMubGlzdGVuaW5nO1xuXHRcdGNvbnN0IGFjY2VudCA9IHJlc29sdmVWb2ljZVJpbUFjY2VudChhY2NlbnRDb2xvciwgbW9vZCwgdGhlbWUsIHRoaXMuX2NvbG9ycy5iYWNrZ3JvdW5kKTtcblx0XHRyZXR1cm4gbW91bnRSaW1MYXllcnMoaG9zdCwge1xuXHRcdFx0dGhlbWUsXG5cdFx0XHRtb29kLFxuXHRcdFx0aHVlOiBhY2NlbnQuaHVlLFxuXHRcdFx0c2F0dXJhdGlvbjogYWNjZW50LnNhdHVyYXRpb24sXG5cdFx0XHRsaWdodG5lc3M6IGFjY2VudC5saWdodG5lc3MsXG5cdFx0XHRzdHJlbmd0aDogQUNUSVZFX1JJTV9TVFJFTkdUSCxcblx0XHRcdGR1cmF0aW9uOiBSSU1fRFVSQVRJT04sXG5cdFx0XHRhdWRpb0dhaW46IDAuOCxcblx0XHRcdC8vIExldHMgdGhlIGxvdWRlc3QgbW9tZW50cyByZWFkIHZpc2libHkgZGVuc2VyIHJhdGhlciB0aGFuIGxlYXZpbmcgdGhlXG5cdFx0XHQvLyB3aG9sZSByYW5nZSBpbiBhIG5hcnJvdyBiYW5kLlxuXHRcdFx0cGVha0dhaW46IDAuOTUsXG5cdFx0XHRzcGVlZEdhaW46IDAuOSxcblx0XHR9KTtcblx0fVxufVxuXG4vKipcbiAqIE1hcCBhIHZvaWNlIHN0YXRlIHRvIHRoZSByaW0gbW9vZCB0aGF0IHJlbmRlcnMgaXQsIG9yIGB1bmRlZmluZWRgIGZvciBubyBnbG93LlxuICogVGhpbmtpbmcgYW5kIGNvbm5lY3RlZC1pZGxlIHJlbmRlciBub3RoaW5nLlxuICovXG5mdW5jdGlvbiByZXNvbHZlTW9vZChzdGF0ZTogVm9pY2VHbG93U3RhdGUpOiBSaW1Nb29kIHwgdW5kZWZpbmVkIHtcblx0c3dpdGNoIChzdGF0ZSkge1xuXHRcdGNhc2UgJ2xpc3RlbmluZyc6IHJldHVybiAnY29vbCc7XG5cdFx0Y2FzZSAnc3BlYWtpbmcnOiByZXR1cm4gJ3dhcm0nO1xuXHRcdGRlZmF1bHQ6IHJldHVybiB1bmRlZmluZWQ7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU87QUFDUCxTQUFTLFNBQVM7QUFFbEIsU0FBUyxZQUFZLGlCQUE4QixtQkFBbUIsb0JBQW9CO0FBQzFGLFNBQVMsMkJBQTRELHVCQUF1QiwyQkFBeUQ7QUFzQnJKLE1BQU0sT0FBTztBQUViLE1BQU0sY0FBYztBQUdwQixNQUFNLHNCQUFzQjtBQUc1QixNQUFNLG9CQUFvQjtBQUFBLEVBQ3pCLE1BQU0sRUFBRSxNQUFNLEdBQUcsT0FBTyxNQUFNLE9BQU8sS0FBSztBQUFBLEVBQzFDLE9BQU8sRUFBRSxNQUFNLEdBQUcsT0FBTyxLQUFLLE9BQU8sSUFBSTtBQUMxQztBQUdBLE1BQU0sZUFBZTtBQTJDckIsU0FBUyxnQkFBZ0IsT0FBc0IsVUFBa0I7QUFDaEUsUUFBTSxPQUFPLFVBQVU7QUFDdkIsUUFBTSxRQUFRLFdBQVc7QUFDekIsU0FBTztBQUFBO0FBQUEsSUFFTixRQUFRO0FBQUE7QUFBQSxJQUVSLE9BQU8sT0FBTyxLQUFLO0FBQUE7QUFBQSxJQUVuQixjQUFjLE9BQU8sT0FBTztBQUFBO0FBQUEsSUFFNUIsYUFBYSxPQUFPLE9BQU87QUFBQTtBQUFBLElBRTNCLGdCQUFnQixPQUFPLE1BQU0sT0FBTztBQUFBO0FBQUEsSUFF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
