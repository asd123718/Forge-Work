import { ThemeIcon } from "../../../common/themables.js";
import * as dom from "../../dom.js";
var ClickAnimation = /* @__PURE__ */ ((ClickAnimation2) => {
  ClickAnimation2[ClickAnimation2["Confetti"] = 1] = "Confetti";
  ClickAnimation2[ClickAnimation2["FloatingIcons"] = 2] = "FloatingIcons";
  ClickAnimation2[ClickAnimation2["PulseWave"] = 3] = "PulseWave";
  ClickAnimation2[ClickAnimation2["RadiantLines"] = 4] = "RadiantLines";
  return ClickAnimation2;
})(ClickAnimation || {});
const confettiColors = [
  "#007acc",
  "#005a9e",
  "#0098ff",
  "#4fc3f7",
  "#64b5f6",
  "#42a5f5"
];
let activeOverlay;
function createOverlay(element) {
  if (activeOverlay) {
    return void 0;
  }
  const rect = element.getBoundingClientRect();
  const ownerDocument = dom.getWindow(element).document;
  const overlay = dom.$(".animation-overlay");
  overlay.style.position = "fixed";
  overlay.style.left = `${rect.left}px`;
  overlay.style.top = `${rect.top}px`;
  overlay.style.width = `${rect.width}px`;
  overlay.style.height = `${rect.height}px`;
  overlay.style.pointerEvents = "none";
  overlay.style.overflow = "visible";
  overlay.style.zIndex = "10000";
  ownerDocument.body.appendChild(overlay);
  activeOverlay = overlay;
  return { overlay, cx: rect.width / 2, cy: rect.height / 2 };
}
function cleanupOverlay(duration) {
  setTimeout(() => {
    if (activeOverlay) {
      activeOverlay.remove();
      activeOverlay = void 0;
    }
  }, duration);
}
function bounceElement(element, opts) {
  const frames = [];
  const steps = Math.max(opts.scale?.length ?? 0, opts.rotate?.length ?? 0, opts.translateY?.length ?? 0);
  if (steps === 0) {
    return;
  }
  for (let i = 0; i < steps; i++) {
    const frame = { offset: steps === 1 ? 1 : i / (steps - 1) };
    let transformParts = "";
    const scale = opts.scale?.[i];
    if (scale !== void 0) {
      transformParts += `scale(${scale})`;
    }
    const rotate = opts.rotate?.[i];
    if (rotate !== void 0) {
      transformParts += ` rotate(${rotate}deg)`;
    }
    const translateY = opts.translateY?.[i];
    if (translateY !== void 0) {
      transformParts += ` translateY(${translateY}px)`;
    }
    if (transformParts) {
      frame.transform = transformParts.trim();
    }
    frames.push(frame);
  }
  element.animate(frames, {
    duration: opts.duration ?? 350,
    easing: "cubic-bezier(0.4, 0, 0.2, 1)",
    fill: "forwards"
  });
}
function triggerConfettiAnimation(element) {
  const result = createOverlay(element);
  if (!result) {
    return;
  }
  const { overlay, cx, cy } = result;
  const rect = element.getBoundingClientRect();
  bounceElement(element, {
    scale: [1, 1.3, 1],
    rotate: [0, -10, 10, 0],
    duration: 350
  });
  const particleCount = 10;
  for (let i = 0; i < particleCount; i++) {
    const size = 3 + i % 3 * 1.5;
    const angle = i * 36 * Math.PI / 180;
    const distance = 35;
    const particleOpacity = 0.6 + i % 4 * 0.1;
    const part = dom.$(".animation-particle");
    part.style.position = "absolute";
    part.style.width = `${size}px`;
    part.style.height = `${size}px`;
    part.style.borderRadius = "50%";
    part.style.backgroundColor = confettiColors[i % confettiColors.length];
    part.style.left = `${cx - size / 2}px`;
    part.style.top = `${cy - size / 2}px`;
    overlay.appendChild(part);
    const tx = Math.cos(angle) * distance;
    const ty = Math.sin(angle) * distance;
    part.animate([
      { opacity: 0, transform: "scale(0) translate(0, 0)" },
      { opacity: particleOpacity, transform: `scale(1) translate(${tx * 0.5}px, ${ty * 0.5}px)`, offset: 0.3 },
      { opacity: particleOpacity, transform: `scale(1) translate(${tx}px, ${ty}px)`, offset: 0.7 },
      { opacity: 0, transform: `scale(0) translate(${tx}px, ${ty}px)` }
    ], {
      duration: 1100,
      easing: "cubic-bezier(0.4, 0, 0.2, 1)",
      fill: "forwards"
    });
  }
  const ring = dom.$(".animation-particle");
  ring.style.position = "absolute";
  ring.style.left = "0";
  ring.style.top = "0";
  ring.style.width = `${rect.width}px`;
  ring.style.height = `${rect.height}px`;
  ring.style.borderRadius = "50%";
  ring.style.border = "2px solid var(--vscode-focusBorder, #007acc)";
  ring.style.boxSizing = "border-box";
  overlay.appendChild(ring);
  ring.animate([
    { transform: "scale(1)", opacity: 1 },
    { transform: "scale(2)", opacity: 0 }
  ], {
    duration: 800,
    easing: "cubic-bezier(0.4, 0, 0.2, 1)",
    fill: "forwards"
  });
  cleanupOverlay(2e3);
}
function triggerFloatingIconsAnimation(element, icon) {
  const result = createOverlay(element);
  if (!result) {
    return;
  }
  const { overlay, cx, cy } = result;
  const rect = element.getBoundingClientRect();
  bounceElement(element, {
    translateY: [0, -6, 0],
    duration: 350
  });
  const iconCount = 6;
  for (let i = 0; i < iconCount; i++) {
    const size = 12 + i % 3 * 2;
    const iconEl = dom.$(".animation-particle");
    iconEl.style.position = "absolute";
    iconEl.style.left = `${cx}px`;
    iconEl.style.top = `${cy}px`;
    iconEl.style.fontSize = `${size}px`;
    iconEl.style.lineHeight = "1";
    iconEl.style.color = "var(--vscode-focusBorder, #007acc)";
    iconEl.classList.add(...ThemeIcon.asClassNameArray(icon));
    overlay.appendChild(iconEl);
    const driftX = (Math.random() - 0.5) * 50;
    const floatY = -50 - i % 3 * 10;
    const rotate1 = (Math.random() - 0.5) * 20;
    const rotate2 = (Math.random() - 0.5) * 40;
    iconEl.animate([
      { opacity: 0, transform: `translate(-50%, -50%) scale(0) rotate(${rotate1}deg)` },
      { opacity: 1, transform: `translate(calc(-50% + ${driftX * 0.3}px), calc(-50% + ${floatY * 0.3}px)) scale(1) rotate(${(rotate1 + rotate2) * 0.3}deg)`, offset: 0.3 },
      { opacity: 1, transform: `translate(calc(-50% + ${driftX * 0.7}px), calc(-50% + ${floatY * 0.7}px)) scale(1) rotate(${(rotate1 + rotate2) * 0.7}deg)`, offset: 0.7 },
      { opacity: 0, transform: `translate(calc(-50% + ${driftX}px), calc(-50% + ${floatY}px)) scale(0.8) rotate(${rotate2}deg)` }
    ], {
      duration: 800 + i % 3 * 200,
      delay: i * 80,
      easing: "cubic-bezier(0.4, 0, 0.2, 1)",
      fill: "forwards"
    });
  }
  const ring = dom.$(".animation-particle");
  ring.style.position = "absolute";
  ring.style.left = "0";
  ring.style.top = "0";
  ring.style.width = `${rect.width}px`;
  ring.style.height = `${rect.height}px`;
  ring.style.borderRadius = "50%";
  ring.style.border = "2px solid var(--vscode-focusBorder, #007acc)";
  ring.style.boxSizing = "border-box";
  overlay.appendChild(ring);
  ring.animate([
    { transform: "scale(1)", opacity: 1 },
    { transform: "scale(2)", opacity: 0 }
  ], {
    duration: 500,
    easing: "cubic-bezier(0.4, 0, 0.2, 1)",
    fill: "forwards"
  });
  cleanupOverlay(2e3);
}
function triggerPulseWaveAnimation(element) {
  const result = createOverlay(element);
  if (!result) {
    return;
  }
  const { overlay, cx, cy } = result;
  const rect = element.getBoundingClientRect();
  bounceElement(element, {
    scale: [1, 1.1, 1],
    rotate: [0, -12, 0],
    duration: 400
  });
  for (let i = 0; i < 2; i++) {
    const ring = dom.$(".animation-particle");
    ring.style.position = "absolute";
    ring.style.left = "0";
    ring.style.top = "0";
    ring.style.width = `${rect.width}px`;
    ring.style.height = `${rect.height}px`;
    ring.style.borderRadius = "50%";
    ring.style.border = "2px solid var(--vscode-focusBorder, #007acc)";
    ring.style.boxSizing = "border-box";
    overlay.appendChild(ring);
    ring.animate([
      { transform: "scale(0.8)", opacity: 0 },
      { transform: "scale(0.8)", opacity: 0.6, offset: 0.01 },
      { transform: "scale(2.5)", opacity: 0 }
    ], {
      duration: 800,
      delay: i * 150,
      easing: "cubic-bezier(0.4, 0, 0.2, 1)",
      fill: "forwards"
    });
  }
  for (let i = 0; i < 6; i++) {
    const angle = i * 60 * Math.PI / 180;
    const distance = 30 + i % 2 * 10;
    const size = 3.5;
    const dot = dom.$(".animation-particle");
    dot.style.position = "absolute";
    dot.style.width = `${size}px`;
    dot.style.height = `${size}px`;
    dot.style.borderRadius = "50%";
    dot.style.backgroundColor = "#0098ff";
    dot.style.left = `${cx - size / 2}px`;
    dot.style.top = `${cy - size / 2}px`;
    overlay.appendChild(dot);
    const tx = Math.cos(angle) * distance;
    const ty = Math.sin(angle) * distance;
    dot.animate([
      { opacity: 0, transform: "scale(0) translate(0, 0)" },
      { opacity: 1, transform: `scale(1) translate(${tx}px, ${ty}px)`, offset: 0.5 },
      { opacity: 0, transform: `scale(0) translate(${tx}px, ${ty}px)` }
    ], {
      duration: 600,
      delay: 100 + i * 50,
      easing: "cubic-bezier(0.4, 0, 0.2, 1)",
      fill: "forwards"
    });
  }
  const glow = dom.$(".animation-particle");
  glow.style.position = "absolute";
  glow.style.left = "0";
  glow.style.top = "0";
  glow.style.width = `${rect.width}px`;
  glow.style.height = `${rect.height}px`;
  glow.style.borderRadius = "50%";
  glow.style.backgroundColor = "var(--vscode-focusBorder, #007acc)";
  overlay.appendChild(glow);
  glow.animate([
    { transform: "scale(0.9)", opacity: 0 },
    { transform: "scale(0.9)", opacity: 0.5, offset: 0.01 },
    { transform: "scale(1.5)", opacity: 0 }
  ], {
    duration: 500,
    easing: "cubic-bezier(0.4, 0, 0.2, 1)",
    fill: "forwards"
  });
  cleanupOverlay(2e3);
}
function triggerRadiantLinesAnimation(element) {
  const result = createOverlay(element);
  if (!result) {
    return;
  }
  const { overlay, cx, cy } = result;
  bounceElement(element, {
    scale: [1, 1.15, 1],
    duration: 350
  });
  for (let i = 0; i < 8; i++) {
    const size = 3;
    const dotOpacity = 0.7;
    const angle = (i * 45 + 22.5) * Math.PI / 180;
    const startDistance = 14;
    const endDistance = 30;
    const dot = dom.$(".animation-particle");
    dot.style.position = "absolute";
    dot.style.width = `${size}px`;
    dot.style.height = `${size}px`;
    dot.style.borderRadius = "50%";
    dot.style.backgroundColor = "var(--vscode-editor-foreground, #ffffff)";
    dot.style.left = `${cx - size / 2}px`;
    dot.style.top = `${cy - size / 2}px`;
    overlay.appendChild(dot);
    const startX = Math.cos(angle) * startDistance;
    const startY = Math.sin(angle) * startDistance;
    const endX = Math.cos(angle) * endDistance;
    const endY = Math.sin(angle) * endDistance;
    dot.animate([
      { opacity: 0, transform: `scale(0) translate(${startX}px, ${startY}px)` },
      { opacity: dotOpacity, transform: `scale(1.2) translate(${(startX + endX) / 2}px, ${(startY + endY) / 2}px)`, offset: 0.25 },
      { opacity: dotOpacity, transform: `scale(1) translate(${endX * 0.8}px, ${endY * 0.8}px)`, offset: 0.5 },
      { opacity: dotOpacity * 0.5, transform: `scale(1) translate(${endX}px, ${endY}px)`, offset: 0.75 },
      { opacity: 0, transform: `scale(0.5) translate(${endX}px, ${endY}px)` }
    ], {
      duration: 1100,
      easing: "cubic-bezier(0.4, 0, 0.2, 1)",
      fill: "forwards"
    });
  }
  for (let i = 0; i < 8; i++) {
    const angleDeg = i * 45;
    const lineWrapper = dom.$(".animation-particle");
    lineWrapper.style.position = "absolute";
    lineWrapper.style.left = `${cx}px`;
    lineWrapper.style.top = `${cy}px`;
    lineWrapper.style.width = "0";
    lineWrapper.style.height = "0";
    lineWrapper.style.transform = `rotate(${angleDeg}deg)`;
    overlay.appendChild(lineWrapper);
    const line = dom.$(".animation-particle");
    line.style.position = "absolute";
    line.style.width = "2px";
    line.style.height = "10px";
    line.style.backgroundColor = "var(--vscode-focusBorder, #007acc)";
    line.style.left = "-1px";
    line.style.top = "-22px";
    line.style.transformOrigin = "bottom center";
    lineWrapper.appendChild(line);
    line.animate([
      { transform: "scale(1, 0)", opacity: 0.6 },
      { transform: "scale(1, 1)", opacity: 0.6, offset: 0.2 },
      { transform: "scale(1, 1)", opacity: 0.6, offset: 0.6 },
      { transform: "scale(1, 1)", opacity: 0.6, offset: 0.8 },
      { transform: "scale(0, 0.3)", opacity: 0 }
    ], {
      duration: 1200,
      delay: 150,
      easing: "cubic-bezier(0.4, 0, 0.2, 1)",
      fill: "forwards"
    });
  }
  cleanupOverlay(2e3);
}
function triggerClickAnimation(element, animation, icon) {
  switch (animation) {
    case 1 /* Confetti */:
      triggerConfettiAnimation(element);
      break;
    case 2 /* FloatingIcons */:
      if (icon) {
        triggerFloatingIconsAnimation(element, icon);
      }
      break;
    case 3 /* PulseWave */:
      triggerPulseWaveAnimation(element);
      break;
    case 4 /* RadiantLines */:
      triggerRadiantLinesAnimation(element);
      break;
  }
}
export {
  ClickAnimation,
  bounceElement,
  triggerClickAnimation,
  triggerConfettiAnimation,
  triggerFloatingIconsAnimation,
  triggerPulseWaveAnimation,
  triggerRadiantLinesAnimation
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFxicm93c2VyXFx1aVxcYW5pbWF0aW9uc1xcYW5pbWF0aW9ucy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uL2RvbS5qcyc7XG5cbmV4cG9ydCBjb25zdCBlbnVtIENsaWNrQW5pbWF0aW9uIHtcblx0Q29uZmV0dGkgPSAxLFxuXHRGbG9hdGluZ0ljb25zID0gMixcblx0UHVsc2VXYXZlID0gMyxcblx0UmFkaWFudExpbmVzID0gNCxcbn1cblxuY29uc3QgY29uZmV0dGlDb2xvcnMgPSBbXG5cdCcjMDA3YWNjJyxcblx0JyMwMDVhOWUnLFxuXHQnIzAwOThmZicsXG5cdCcjNGZjM2Y3Jyxcblx0JyM2NGI1ZjYnLFxuXHQnIzQyYTVmNScsXG5dO1xuXG5sZXQgYWN0aXZlT3ZlcmxheTogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cbi8qKlxuICogQ3JlYXRlcyBhIGZpeGVkLXBvc2l0aW9uZWQgb3ZlcmxheSBjZW50ZXJlZCBvbiB0aGUgZ2l2ZW4gZWxlbWVudC5cbiAqL1xuZnVuY3Rpb24gY3JlYXRlT3ZlcmxheShlbGVtZW50OiBIVE1MRWxlbWVudCk6IHsgb3ZlcmxheTogSFRNTEVsZW1lbnQ7IGN4OiBudW1iZXI7IGN5OiBudW1iZXIgfSB8IHVuZGVmaW5lZCB7XG5cdGlmIChhY3RpdmVPdmVybGF5KSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGNvbnN0IHJlY3QgPSBlbGVtZW50LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuXHRjb25zdCBvd25lckRvY3VtZW50ID0gZG9tLmdldFdpbmRvdyhlbGVtZW50KS5kb2N1bWVudDtcblxuXHRjb25zdCBvdmVybGF5ID0gZG9tLiQoJy5hbmltYXRpb24tb3ZlcmxheScpO1xuXHRvdmVybGF5LnN0eWxlLnBvc2l0aW9uID0gJ2ZpeGVkJztcblx0b3ZlcmxheS5zdHlsZS5sZWZ0ID0gYCR7cmVjdC5sZWZ0fXB4YDtcblx0b3ZlcmxheS5zdHlsZS50b3AgPSBgJHtyZWN0LnRvcH1weGA7XG5cdG92ZXJsYXkuc3R5bGUud2lkdGggPSBgJHtyZWN0LndpZHRofXB4YDtcblx0b3ZlcmxheS5zdHlsZS5oZWlnaHQgPSBgJHtyZWN0LmhlaWdodH1weGA7XG5cdG92ZXJsYXkuc3R5bGUucG9pbnRlckV2ZW50cyA9ICdub25lJztcblx0b3ZlcmxheS5zdHlsZS5vdmVyZmxvdyA9ICd2aXNpYmxlJztcblx0b3ZlcmxheS5zdHlsZS56SW5kZXggPSAnMTAwMDAnO1xuXG5cdG93bmVyRG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChvdmVybGF5KTtcblx0YWN0aXZlT3ZlcmxheSA9IG92ZXJsYXk7XG5cblx0cmV0dXJuIHsgb3ZlcmxheSwgY3g6IHJlY3Qud2lkdGggLyAyLCBjeTogcmVjdC5oZWlnaHQgLyAyIH07XG59XG5cbi8qKlxuICogQ2xlYW5zIHVwIHRoZSBvdmVybGF5IGFmdGVyIHNwZWNpZmllZCBwZXJpb2QuXG4gKi9cbmZ1bmN0aW9uIGNsZWFudXBPdmVybGF5KGR1cmF0aW9uOiBudW1iZXIpIHtcblx0c2V0VGltZW91dCgoKSA9PiB7XG5cdFx0aWYgKGFjdGl2ZU92ZXJsYXkpIHtcblx0XHRcdGFjdGl2ZU92ZXJsYXkucmVtb3ZlKCk7XG5cdFx0XHRhY3RpdmVPdmVybGF5ID0gdW5kZWZpbmVkO1xuXHRcdH1cblx0fSwgZHVyYXRpb24pO1xufVxuXG4vKipcbiAqIEJvdW5jZSB0aGUgZWxlbWVudCB3aXRoIGEgZ2l2ZW4gc2NhbGUgYW5kIG9wdGlvbmFsIHJvdGF0aW9uLlxuICovXG5leHBvcnQgZnVuY3Rpb24gYm91bmNlRWxlbWVudChlbGVtZW50OiBIVE1MRWxlbWVudCwgb3B0czogeyBzY2FsZT86IG51bWJlcltdOyByb3RhdGU/OiBudW1iZXJbXTsgdHJhbnNsYXRlWT86IG51bWJlcltdOyBkdXJhdGlvbj86IG51bWJlciB9KSB7XG5cdGNvbnN0IGZyYW1lczogS2V5ZnJhbWVbXSA9IFtdO1xuXG5cdGNvbnN0IHN0ZXBzID0gTWF0aC5tYXgob3B0cy5zY2FsZT8ubGVuZ3RoID8/IDAsIG9wdHMucm90YXRlPy5sZW5ndGggPz8gMCwgb3B0cy50cmFuc2xhdGVZPy5sZW5ndGggPz8gMCk7XG5cdGlmIChzdGVwcyA9PT0gMCkge1xuXHRcdHJldHVybjtcblx0fVxuXG5cdGZvciAobGV0IGkgPSAwOyBpIDwgc3RlcHM7IGkrKykge1xuXHRcdGNvbnN0IGZyYW1lOiBLZXlmcmFtZSA9IHsgb2Zmc2V0OiBzdGVwcyA9PT0gMSA/IDEgOiBpIC8gKHN0ZXBzIC0gMSkgfTtcblx0XHRsZXQgdHJhbnNmb3JtUGFydHMgPSAnJztcblxuXHRcdGNvbnN0IHNjYWxlID0gb3B0cy5zY2FsZT8uW2ldO1xuXHRcdGlmIChzY2FsZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0cmFuc2Zvcm1QYXJ0cyArPSBgc2NhbGUoJHtzY2FsZX0pYDtcblx0XHR9XG5cblx0XHRjb25zdCByb3RhdGUgPSBvcHRzLnJvdGF0ZT8uW2ldO1xuXHRcdGlmIChyb3RhdGUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dHJhbnNmb3JtUGFydHMgKz0gYCByb3RhdGUoJHtyb3RhdGV9ZGVnKWA7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdHJhbnNsYXRlWSA9IG9wdHMudHJhbnNsYXRlWT8uW2ldO1xuXHRcdGlmICh0cmFuc2xhdGVZICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHRyYW5zZm9ybVBhcnRzICs9IGAgdHJhbnNsYXRlWSgke3RyYW5zbGF0ZVl9cHgpYDtcblx0XHR9XG5cblx0XHRpZiAodHJhbnNmb3JtUGFydHMpIHtcblx0XHRcdGZyYW1lLnRyYW5zZm9ybSA9IHRyYW5zZm9ybVBhcnRzLnRyaW0oKTtcblx0XHR9XG5cdFx0ZnJhbWVzLnB1c2goZnJhbWUpO1xuXHR9XG5cblx0ZWxlbWVudC5hbmltYXRlKGZyYW1lcywge1xuXHRcdGR1cmF0aW9uOiBvcHRzLmR1cmF0aW9uID8/IDM1MCxcblx0XHRlYXNpbmc6ICdjdWJpYy1iZXppZXIoMC40LCAwLCAwLjIsIDEpJyxcblx0XHRmaWxsOiAnZm9yd2FyZHMnLFxuXHR9KTtcbn1cblxuLyoqXG4gKiBDb25mZXR0aTogc21hbGwgcGFydGljbGVzIGJ1cnN0IG91dHdhcmQgaW4gYSBjaXJjbGUgZnJvbSB0aGUgZWxlbWVudCBjZW50ZXIsXG4gKiB3aXRoIGFuIGV4cGFuZGluZyByaW5nLlxuICovXG5leHBvcnQgZnVuY3Rpb24gdHJpZ2dlckNvbmZldHRpQW5pbWF0aW9uKGVsZW1lbnQ6IEhUTUxFbGVtZW50KSB7XG5cdGNvbnN0IHJlc3VsdCA9IGNyZWF0ZU92ZXJsYXkoZWxlbWVudCk7XG5cdGlmICghcmVzdWx0KSB7XG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0Y29uc3QgeyBvdmVybGF5LCBjeCwgY3kgfSA9IHJlc3VsdDtcblx0Y29uc3QgcmVjdCA9IGVsZW1lbnQuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG5cblx0Ly8gRWxlbWVudCBib3VuY2Vcblx0Ym91bmNlRWxlbWVudChlbGVtZW50LCB7XG5cdFx0c2NhbGU6IFsxLCAxLjMsIDFdLFxuXHRcdHJvdGF0ZTogWzAsIC0xMCwgMTAsIDBdLFxuXHRcdGR1cmF0aW9uOiAzNTAsXG5cdH0pO1xuXG5cdC8vIENvbmZldHRpIHBhcnRpY2xlc1xuXHRjb25zdCBwYXJ0aWNsZUNvdW50ID0gMTA7XG5cdGZvciAobGV0IGkgPSAwOyBpIDwgcGFydGljbGVDb3VudDsgaSsrKSB7XG5cdFx0Y29uc3Qgc2l6ZSA9IDMgKyAoaSAlIDMpICogMS41O1xuXHRcdGNvbnN0IGFuZ2xlID0gKGkgKiAzNiAqIE1hdGguUEkpIC8gMTgwO1xuXHRcdGNvbnN0IGRpc3RhbmNlID0gMzU7XG5cdFx0Y29uc3QgcGFydGljbGVPcGFjaXR5ID0gMC42ICsgKGkgJSA0KSAqIDAuMTtcblxuXHRcdGNvbnN0IHBhcnQgPSBkb20uJCgnLmFuaW1hdGlvbi1wYXJ0aWNsZScpO1xuXHRcdHBhcnQuc3R5bGUucG9zaXRpb24gPSAnYWJzb2x1dGUnO1xuXHRcdHBhcnQuc3R5bGUud2lkdGggPSBgJHtzaXplfXB4YDtcblx0XHRwYXJ0LnN0eWxlLmhlaWdodCA9IGAke3NpemV9cHhgO1xuXHRcdHBhcnQuc3R5bGUuYm9yZGVyUmFkaXVzID0gJzUwJSc7XG5cdFx0cGFydC5zdHlsZS5iYWNrZ3JvdW5kQ29sb3IgPSBjb25mZXR0aUNvbG9yc1tpICUgY29uZmV0dGlDb2xvcnMubGVuZ3RoXTtcblx0XHRwYXJ0LnN0eWxlLmxlZnQgPSBgJHtjeCAtIHNpemUgLyAyfXB4YDtcblx0XHRwYXJ0LnN0eWxlLnRvcCA9IGAke2N5IC0gc2l6ZSAvIDJ9cHhgO1xuXHRcdG92ZXJsYXkuYXBwZW5kQ2hpbGQocGFydCk7XG5cblx0XHRjb25zdCB0eCA9IE1hdGguY29zKGFuZ2xlKSAqIGRpc3RhbmNlO1xuXHRcdGNvbnN0IHR5ID0gTWF0aC5zaW4oYW5nbGUpICogZGlzdGFuY2U7XG5cblx0XHRwYXJ0LmFuaW1hdGUoW1xuXHRcdFx0eyBvcGFjaXR5OiAwLCB0cmFuc2Zvcm06ICdzY2FsZSgwKSB0cmFuc2xhdGUoMCwgMCknIH0sXG5cdFx0XHR7IG9wYWNpdHk6IHBhcnRpY2xlT3BhY2l0eSwgdHJhbnNmb3JtOiBgc2NhbGUoMSkgdHJhbnNsYXRlKCR7dHggKiAwLjV9cHgsICR7dHkgKiAwLjV9cHgpYCwgb2Zmc2V0OiAwLjMgfSxcblx0XHRcdHsgb3BhY2l0eTogcGFydGljbGVPcGFjaXR5LCB0cmFuc2Zvcm06IGBzY2FsZSgxKSB0cmFuc2xhdGUoJHt0eH1weCwgJHt0eX1weClgLCBvZmZzZXQ6IDAuNyB9LFxuXHRcdFx0eyBvcGFjaXR5OiAwLCB0cmFuc2Zvcm06IGBzY2FsZSgwKSB0cmFuc2xhdGUoJHt0eH1weCwgJHt0eX1weClgIH0sXG5cdFx0XSwge1xuXHRcdFx0ZHVyYXRpb246IDExMDAsXG5cdFx0XHRlYXNpbmc6ICdjdWJpYy1iZXppZXIoMC40LCAwLCAwLjIsIDEpJyxcblx0XHRcdGZpbGw6ICdmb3J3YXJkcycsXG5cdFx0fSk7XG5cdH1cblxuXHQvLyBFeHBhbmRpbmcgcmluZ1xuXHRjb25zdCByaW5nID0gZG9tLiQoJy5hbmltYXRpb24tcGFydGljbGUnKTtcblx0cmluZy5zdHlsZS5wb3NpdGlvbiA9ICdhYnNvbHV0ZSc7XG5cdHJpbmcuc3R5bGUubGVmdCA9ICcwJztcblx0cmluZy5zdHlsZS50b3AgPSAnMCc7XG5cdHJpbmcuc3R5bGUud2lkdGggPSBgJHtyZWN0LndpZHRofXB4YDtcblx0cmluZy5zdHlsZS5oZWlnaHQgPSBgJHtyZWN0LmhlaWdodH1weGA7XG5cdHJpbmcuc3R5bGUuYm9yZGVyUmFkaXVzID0gJzUwJSc7XG5cdHJpbmcuc3R5bGUuYm9yZGVyID0gJzJweCBzb2xpZCB2YXIoLS12c2NvZGUtZm9jdXNCb3JkZXIsICMwMDdhY2MpJztcblx0cmluZy5zdHlsZS5ib3hTaXppbmcgPSAnYm9yZGVyLWJveCc7XG5cdG92ZXJsYXkuYXBwZW5kQ2hpbGQocmluZyk7XG5cblx0cmluZy5hbmltYXRlKFtcblx0XHR7IHRyYW5zZm9ybTogJ3NjYWxlKDEpJywgb3BhY2l0eTogMSB9LFxuXHRcdHsgdHJhbnNmb3JtOiAnc2NhbGUoMiknLCBvcGFjaXR5OiAwIH0sXG5cdF0sIHtcblx0XHRkdXJhdGlvbjogODAwLFxuXHRcdGVhc2luZzogJ2N1YmljLWJlemllcigwLjQsIDAsIDAuMiwgMSknLFxuXHRcdGZpbGw6ICdmb3J3YXJkcycsXG5cdH0pO1xuXG5cdGNsZWFudXBPdmVybGF5KDIwMDApO1xufVxuXG4vKipcbiAqIEZsb2F0aW5nIEljb25zOiBzbWFsbCBpY29ucyBmbG9hdCB1cHdhcmQgZnJvbSB0aGUgZWxlbWVudC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHRyaWdnZXJGbG9hdGluZ0ljb25zQW5pbWF0aW9uKGVsZW1lbnQ6IEhUTUxFbGVtZW50LCBpY29uOiBUaGVtZUljb24pIHtcblx0Y29uc3QgcmVzdWx0ID0gY3JlYXRlT3ZlcmxheShlbGVtZW50KTtcblx0aWYgKCFyZXN1bHQpIHtcblx0XHRyZXR1cm47XG5cdH1cblxuXHRjb25zdCB7IG92ZXJsYXksIGN4LCBjeSB9ID0gcmVzdWx0O1xuXHRjb25zdCByZWN0ID0gZWxlbWVudC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcblxuXHQvLyBFbGVtZW50IGJvdW5jZSB1cHdhcmRcblx0Ym91bmNlRWxlbWVudChlbGVtZW50LCB7XG5cdFx0dHJhbnNsYXRlWTogWzAsIC02LCAwXSxcblx0XHRkdXJhdGlvbjogMzUwLFxuXHR9KTtcblxuXHQvLyBGbG9hdGluZyBpY29uc1xuXHRjb25zdCBpY29uQ291bnQgPSA2O1xuXHRmb3IgKGxldCBpID0gMDsgaSA8IGljb25Db3VudDsgaSsrKSB7XG5cdFx0Y29uc3Qgc2l6ZSA9IDEyICsgKGkgJSAzKSAqIDI7XG5cdFx0Y29uc3QgaWNvbkVsID0gZG9tLiQoJy5hbmltYXRpb24tcGFydGljbGUnKTtcblx0XHRpY29uRWwuc3R5bGUucG9zaXRpb24gPSAnYWJzb2x1dGUnO1xuXHRcdGljb25FbC5zdHlsZS5sZWZ0ID0gYCR7Y3h9cHhgO1xuXHRcdGljb25FbC5zdHlsZS50b3AgPSBgJHtjeX1weGA7XG5cdFx0aWNvbkVsLnN0eWxlLmZvbnRTaXplID0gYCR7c2l6ZX1weGA7XG5cdFx0aWNvbkVsLnN0eWxlLmxpbmVIZWlnaHQgPSAnMSc7XG5cdFx0aWNvbkVsLnN0eWxlLmNvbG9yID0gJ3ZhcigtLXZzY29kZS1mb2N1c0JvcmRlciwgIzAwN2FjYyknO1xuXHRcdGljb25FbC5jbGFzc0xpc3QuYWRkKC4uLlRoZW1lSWNvbi5hc0NsYXNzTmFtZUFycmF5KGljb24pKTtcblx0XHRvdmVybGF5LmFwcGVuZENoaWxkKGljb25FbCk7XG5cblx0XHRjb25zdCBkcmlmdFggPSAoTWF0aC5yYW5kb20oKSAtIDAuNSkgKiA1MDtcblx0XHRjb25zdCBmbG9hdFkgPSAtNTAgLSAoaSAlIDMpICogMTA7XG5cdFx0Y29uc3Qgcm90YXRlMSA9IChNYXRoLnJhbmRvbSgpIC0gMC41KSAqIDIwO1xuXHRcdGNvbnN0IHJvdGF0ZTIgPSAoTWF0aC5yYW5kb20oKSAtIDAuNSkgKiA0MDtcblxuXHRcdGljb25FbC5hbmltYXRlKFtcblx0XHRcdHsgb3BhY2l0eTogMCwgdHJhbnNmb3JtOiBgdHJhbnNsYXRlKC01MCUsIC01MCUpIHNjYWxlKDApIHJvdGF0ZSgke3JvdGF0ZTF9ZGVnKWAgfSxcblx0XHRcdHsgb3BhY2l0eTogMSwgdHJhbnNmb3JtOiBgdHJhbnNsYXRlKGNhbGMoLTUwJSArICR7ZHJpZnRYICogMC4zfXB4KSwgY2FsYygtNTAlICsgJHtmbG9hdFkgKiAwLjN9cHgpKSBzY2FsZSgxKSByb3RhdGUoJHsocm90YXRlMSArIHJvdGF0ZTIpICogMC4zfWRlZylgLCBvZmZzZXQ6IDAuMyB9LFxuXHRcdFx0eyBvcGFjaXR5OiAxLCB0cmFuc2Zvcm06IGB0cmFuc2xhdGUoY2FsYygtNTAlICsgJHtkcmlmdFggKiAwLjd9cHgpLCBjYWxjKC01MCUgKyAke2Zsb2F0WSAqIDAuN31weCkpIHNjYWxlKDEpIHJvdGF0ZSgkeyhyb3RhdGUxICsgcm90YXRlMikgKiAwLjd9ZGVnKWAsIG9mZnNldDogMC43IH0sXG5cdFx0XHR7IG9wYWNpdHk6IDAsIHRyYW5zZm9ybTogYHRyYW5zbGF0ZShjYWxjKC01MCUgKyAke2RyaWZ0WH1weCksIGNhbGMoLTUwJSArICR7ZmxvYXRZfXB4KSkgc2NhbGUoMC44KSByb3RhdGUoJHtyb3RhdGUyfWRlZylgIH0sXG5cdFx0XSwge1xuXHRcdFx0ZHVyYXRpb246IDgwMCArIChpICUgMykgKiAyMDAsXG5cdFx0XHRkZWxheTogaSAqIDgwLFxuXHRcdFx0ZWFzaW5nOiAnY3ViaWMtYmV6aWVyKDAuNCwgMCwgMC4yLCAxKScsXG5cdFx0XHRmaWxsOiAnZm9yd2FyZHMnLFxuXHRcdH0pO1xuXHR9XG5cblx0Ly8gRXhwYW5kaW5nIHJpbmdcblx0Y29uc3QgcmluZyA9IGRvbS4kKCcuYW5pbWF0aW9uLXBhcnRpY2xlJyk7XG5cdHJpbmcuc3R5bGUucG9zaXRpb24gPSAnYWJzb2x1dGUnO1xuXHRyaW5nLnN0eWxlLmxlZnQgPSAnMCc7XG5cdHJpbmcuc3R5bGUudG9wID0gJzAnO1xuXHRyaW5nLnN0eWxlLndpZHRoID0gYCR7cmVjdC53aWR0aH1weGA7XG5cdHJpbmcuc3R5bGUuaGVpZ2h0ID0gYCR7cmVjdC5oZWlnaHR9cHhgO1xuXHRyaW5nLnN0eWxlLmJvcmRlclJhZGl1cyA9ICc1MCUnO1xuXHRyaW5nLnN0eWxlLmJvcmRlciA9ICcycHggc29saWQgdmFyKC0tdnNjb2RlLWZvY3VzQm9yZGVyLCAjMDA3YWNjKSc7XG5cdHJpbmcuc3R5bGUuYm94U2l6aW5nID0gJ2JvcmRlci1ib3gnO1xuXHRvdmVybGF5LmFwcGVuZENoaWxkKHJpbmcpO1xuXG5cdHJpbmcuYW5pbWF0ZShbXG5cdFx0eyB0cmFuc2Zvcm06ICdzY2FsZSgxKScsIG9wYWNpdHk6IDEgfSxcblx0XHR7IHRyYW5zZm9ybTogJ3NjYWxlKDIpJywgb3BhY2l0eTogMCB9LFxuXHRdLCB7XG5cdFx0ZHVyYXRpb246IDUwMCxcblx0XHRlYXNpbmc6ICdjdWJpYy1iZXppZXIoMC40LCAwLCAwLjIsIDEpJyxcblx0XHRmaWxsOiAnZm9yd2FyZHMnLFxuXHR9KTtcblxuXHRjbGVhbnVwT3ZlcmxheSgyMDAwKTtcbn1cblxuLyoqXG4gKiBQdWxzZSBXYXZlOiBleHBhbmRpbmcgcmluZ3MgYW5kIHNwYXJrbGUgZG90cyByYWRpYXRlIGZyb20gdGhlIGVsZW1lbnQgY2VudGVyLlxuICovXG5leHBvcnQgZnVuY3Rpb24gdHJpZ2dlclB1bHNlV2F2ZUFuaW1hdGlvbihlbGVtZW50OiBIVE1MRWxlbWVudCkge1xuXHRjb25zdCByZXN1bHQgPSBjcmVhdGVPdmVybGF5KGVsZW1lbnQpO1xuXHRpZiAoIXJlc3VsdCkge1xuXHRcdHJldHVybjtcblx0fVxuXG5cdGNvbnN0IHsgb3ZlcmxheSwgY3gsIGN5IH0gPSByZXN1bHQ7XG5cdGNvbnN0IHJlY3QgPSBlbGVtZW50LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuXG5cdC8vIEVsZW1lbnQgYm91bmNlIHdpdGggc2xpZ2h0IHJvdGF0aW9uXG5cdGJvdW5jZUVsZW1lbnQoZWxlbWVudCwge1xuXHRcdHNjYWxlOiBbMSwgMS4xLCAxXSxcblx0XHRyb3RhdGU6IFswLCAtMTIsIDBdLFxuXHRcdGR1cmF0aW9uOiA0MDAsXG5cdH0pO1xuXG5cdC8vIEV4cGFuZGluZyByaW5nc1xuXHRmb3IgKGxldCBpID0gMDsgaSA8IDI7IGkrKykge1xuXHRcdGNvbnN0IHJpbmcgPSBkb20uJCgnLmFuaW1hdGlvbi1wYXJ0aWNsZScpO1xuXHRcdHJpbmcuc3R5bGUucG9zaXRpb24gPSAnYWJzb2x1dGUnO1xuXHRcdHJpbmcuc3R5bGUubGVmdCA9ICcwJztcblx0XHRyaW5nLnN0eWxlLnRvcCA9ICcwJztcblx0XHRyaW5nLnN0eWxlLndpZHRoID0gYCR7cmVjdC53aWR0aH1weGA7XG5cdFx0cmluZy5zdHlsZS5oZWlnaHQgPSBgJHtyZWN0LmhlaWdodH1weGA7XG5cdFx0cmluZy5zdHlsZS5ib3JkZXJSYWRpdXMgPSAnNTAlJztcblx0XHRyaW5nLnN0eWxlLmJvcmRlciA9ICcycHggc29saWQgdmFyKC0tdnNjb2RlLWZvY3VzQm9yZGVyLCAjMDA3YWNjKSc7XG5cdFx0cmluZy5zdHlsZS5ib3hTaXppbmcgPSAnYm9yZGVyLWJveCc7XG5cdFx0b3ZlcmxheS5hcHBlbmRDaGlsZChyaW5nKTtcblxuXHRcdHJpbmcuYW5pbWF0ZShbXG5cdFx0XHR7IHRyYW5zZm9ybTogJ3NjYWxlKDAuOCknLCBvcGFjaXR5OiAwIH0sXG5cdFx0XHR7IHRyYW5zZm9ybTogJ3NjYWxlKDAuOCknLCBvcGFjaXR5OiAwLjYsIG9mZnNldDogMC4wMSB9LFxuXHRcdFx0eyB0cmFuc2Zvcm06ICdzY2FsZSgyLjUpJywgb3BhY2l0eTogMCB9LFxuXHRcdF0sIHtcblx0XHRcdGR1cmF0aW9uOiA4MDAsXG5cdFx0XHRkZWxheTogaSAqIDE1MCxcblx0XHRcdGVhc2luZzogJ2N1YmljLWJlemllcigwLjQsIDAsIDAuMiwgMSknLFxuXHRcdFx0ZmlsbDogJ2ZvcndhcmRzJyxcblx0XHR9KTtcblx0fVxuXG5cdC8vIFNwYXJrbGUgZG90c1xuXHRmb3IgKGxldCBpID0gMDsgaSA8IDY7IGkrKykge1xuXHRcdGNvbnN0IGFuZ2xlID0gKGkgKiA2MCAqIE1hdGguUEkpIC8gMTgwO1xuXHRcdGNvbnN0IGRpc3RhbmNlID0gMzAgKyAoaSAlIDIpICogMTA7XG5cdFx0Y29uc3Qgc2l6ZSA9IDMuNTtcblxuXHRcdGNvbnN0IGRvdCA9IGRvbS4kKCcuYW5pbWF0aW9uLXBhcnRpY2xlJyk7XG5cdFx0ZG90LnN0eWxlLnBvc2l0aW9uID0gJ2Fic29sdXRlJztcblx0XHRkb3Quc3R5bGUud2lkdGggPSBgJHtzaXplfXB4YDtcblx0XHRkb3Quc3R5bGUuaGVpZ2h0ID0gYCR7c2l6ZX1weGA7XG5cdFx0ZG90LnN0eWxlLmJvcmRlclJhZGl1cyA9ICc1MCUnO1xuXHRcdGRvdC5zdHlsZS5iYWNrZ3JvdW5kQ29sb3IgPSAnIzAwOThmZic7XG5cdFx0ZG90LnN0eWxlLmxlZnQgPSBgJHtjeCAtIHNpemUgLyAyfXB4YDtcblx0XHRkb3Quc3R5bGUudG9wID0gYCR7Y3kgLSBzaXplIC8gMn1weGA7XG5cdFx0b3ZlcmxheS5hcHBlbmRDaGlsZChkb3QpO1xuXG5cdFx0Y29uc3QgdHggPSBNYXRoLmNvcyhhbmdsZSkgKiBkaXN0YW5jZTtcblx0XHRjb25zdCB0eSA9IE1hdGguc2luKGFuZ2xlKSAqIGRpc3RhbmNlO1xuXG5cdFx0ZG90LmFuaW1hdGUoW1xuXHRcdFx0eyBvcGFjaXR5OiAwLCB0cmFuc2Zvcm06ICdzY2FsZSgwKSB0cmFuc2xhdGUoMCwgMCknIH0sXG5cdFx0XHR7IG9wYWNpdHk6IDEsIHRyYW5zZm9ybTogYHNjYWxlKDEpIHRyYW5zbGF0ZSgke3R4fXB4LCAke3R5fXB4KWAsIG9mZnNldDogMC41IH0sXG5cdFx0XHR7IG9wYWNpdHk6IDAsIHRyYW5zZm9ybTogYHNjYWxlKDApIHRyYW5zbGF0ZSgke3R4fXB4LCAke3R5fXB4KWAgfSxcblx0XHRdLCB7XG5cdFx0XHRkdXJhdGlvbjogNjAwLFxuXHRcdFx0ZGVsYXk6IDEwMCArIGkgKiA1MCxcblx0XHRcdGVhc2luZzogJ2N1YmljLWJlemllcigwLjQsIDAsIDAuMiwgMSknLFxuXHRcdFx0ZmlsbDogJ2ZvcndhcmRzJyxcblx0XHR9KTtcblx0fVxuXG5cdC8vIEJhY2tncm91bmQgZ2xvd1xuXHRjb25zdCBnbG93ID0gZG9tLiQoJy5hbmltYXRpb24tcGFydGljbGUnKTtcblx0Z2xvdy5zdHlsZS5wb3NpdGlvbiA9ICdhYnNvbHV0ZSc7XG5cdGdsb3cuc3R5bGUubGVmdCA9ICcwJztcblx0Z2xvdy5zdHlsZS50b3AgPSAnMCc7XG5cdGdsb3cuc3R5bGUud2lkdGggPSBgJHtyZWN0LndpZHRofXB4YDtcblx0Z2xvdy5zdHlsZS5oZWlnaHQgPSBgJHtyZWN0LmhlaWdodH1weGA7XG5cdGdsb3cuc3R5bGUuYm9yZGVyUmFkaXVzID0gJzUwJSc7XG5cdGdsb3cuc3R5bGUuYmFja2dyb3VuZENvbG9yID0gJ3ZhcigtLXZzY29kZS1mb2N1c0JvcmRlciwgIzAwN2FjYyknO1xuXHRvdmVybGF5LmFwcGVuZENoaWxkKGdsb3cpO1xuXG5cdGdsb3cuYW5pbWF0ZShbXG5cdFx0eyB0cmFuc2Zvcm06ICdzY2FsZSgwLjkpJywgb3BhY2l0eTogMCB9LFxuXHRcdHsgdHJhbnNmb3JtOiAnc2NhbGUoMC45KScsIG9wYWNpdHk6IDAuNSwgb2Zmc2V0OiAwLjAxIH0sXG5cdFx0eyB0cmFuc2Zvcm06ICdzY2FsZSgxLjUpJywgb3BhY2l0eTogMCB9LFxuXHRdLCB7XG5cdFx0ZHVyYXRpb246IDUwMCxcblx0XHRlYXNpbmc6ICdjdWJpYy1iZXppZXIoMC40LCAwLCAwLjIsIDEpJyxcblx0XHRmaWxsOiAnZm9yd2FyZHMnLFxuXHR9KTtcblxuXHRjbGVhbnVwT3ZlcmxheSgyMDAwKTtcbn1cblxuLyoqXG4gKiBSYWRpYW50IExpbmVzOiBsaW5lcyBhbmQgZG90cyBlbWFuYXRlIG91dHdhcmQgZnJvbSB0aGUgZWxlbWVudCBjZW50ZXIuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiB0cmlnZ2VyUmFkaWFudExpbmVzQW5pbWF0aW9uKGVsZW1lbnQ6IEhUTUxFbGVtZW50KSB7XG5cdGNvbnN0IHJlc3VsdCA9IGNyZWF0ZU92ZXJsYXkoZWxlbWVudCk7XG5cdGlmICghcmVzdWx0KSB7XG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0Y29uc3QgeyBvdmVybGF5LCBjeCwgY3kgfSA9IHJlc3VsdDtcblxuXHQvLyBFbGVtZW50IHNjYWxlIGJvdW5jZVxuXHRib3VuY2VFbGVtZW50KGVsZW1lbnQsIHtcblx0XHRzY2FsZTogWzEsIDEuMTUsIDFdLFxuXHRcdGR1cmF0aW9uOiAzNTAsXG5cdH0pO1xuXG5cdC8vIERvdHMgYXQgb2Zmc2V0IGFuZ2xlc1xuXHRmb3IgKGxldCBpID0gMDsgaSA8IDg7IGkrKykge1xuXHRcdGNvbnN0IHNpemUgPSAzO1xuXHRcdGNvbnN0IGRvdE9wYWNpdHkgPSAwLjc7XG5cdFx0Y29uc3QgYW5nbGUgPSAoKGkgKiA0NSArIDIyLjUpICogTWF0aC5QSSkgLyAxODA7XG5cdFx0Y29uc3Qgc3RhcnREaXN0YW5jZSA9IDE0O1xuXHRcdGNvbnN0IGVuZERpc3RhbmNlID0gMzA7XG5cblx0XHRjb25zdCBkb3QgPSBkb20uJCgnLmFuaW1hdGlvbi1wYXJ0aWNsZScpO1xuXHRcdGRvdC5zdHlsZS5wb3NpdGlvbiA9ICdhYnNvbHV0ZSc7XG5cdFx0ZG90LnN0eWxlLndpZHRoID0gYCR7c2l6ZX1weGA7XG5cdFx0ZG90LnN0eWxlLmhlaWdodCA9IGAke3NpemV9cHhgO1xuXHRcdGRvdC5zdHlsZS5ib3JkZXJSYWRpdXMgPSAnNTAlJztcblx0XHRkb3Quc3R5bGUuYmFja2dyb3VuZENvbG9yID0gJ3ZhcigtLXZzY29kZS1lZGl0b3ItZm9yZWdyb3VuZCwgI2ZmZmZmZiknO1xuXHRcdGRvdC5zdHlsZS5sZWZ0ID0gYCR7Y3ggLSBzaXplIC8gMn1weGA7XG5cdFx0ZG90LnN0eWxlLnRvcCA9IGAke2N5IC0gc2l6ZSAvIDJ9cHhgO1xuXHRcdG92ZXJsYXkuYXBwZW5kQ2hpbGQoZG90KTtcblxuXHRcdGNvbnN0IHN0YXJ0WCA9IE1hdGguY29zKGFuZ2xlKSAqIHN0YXJ0RGlzdGFuY2U7XG5cdFx0Y29uc3Qgc3RhcnRZID0gTWF0aC5zaW4oYW5nbGUpICogc3RhcnREaXN0YW5jZTtcblx0XHRjb25zdCBlbmRYID0gTWF0aC5jb3MoYW5nbGUpICogZW5kRGlzdGFuY2U7XG5cdFx0Y29uc3QgZW5kWSA9IE1hdGguc2luKGFuZ2xlKSAqIGVuZERpc3RhbmNlO1xuXG5cdFx0ZG90LmFuaW1hdGUoW1xuXHRcdFx0eyBvcGFjaXR5OiAwLCB0cmFuc2Zvcm06IGBzY2FsZSgwKSB0cmFuc2xhdGUoJHtzdGFydFh9cHgsICR7c3RhcnRZfXB4KWAgfSxcblx0XHRcdHsgb3BhY2l0eTogZG90T3BhY2l0eSwgdHJhbnNmb3JtOiBgc2NhbGUoMS4yKSB0cmFuc2xhdGUoJHsoc3RhcnRYICsgZW5kWCkgLyAyfXB4LCAkeyhzdGFydFkgKyBlbmRZKSAvIDJ9cHgpYCwgb2Zmc2V0OiAwLjI1IH0sXG5cdFx0XHR7IG9wYWNpdHk6IGRvdE9wYWNpdHksIHRyYW5zZm9ybTogYHNjYWxlKDEpIHRyYW5zbGF0ZSgke2VuZFggKiAwLjh9cHgsICR7ZW5kWSAqIDAuOH1weClgLCBvZmZzZXQ6IDAuNSB9LFxuXHRcdFx0eyBvcGFjaXR5OiBkb3RPcGFjaXR5ICogMC41LCB0cmFuc2Zvcm06IGBzY2FsZSgxKSB0cmFuc2xhdGUoJHtlbmRYfXB4LCAke2VuZFl9cHgpYCwgb2Zmc2V0OiAwLjc1IH0sXG5cdFx0XHR7IG9wYWNpdHk6IDAsIHRyYW5zZm9ybTogYHNjYWxlKDAuNSkgdHJhbnNsYXRlKCR7ZW5kWH1weCwgJHtlbmRZfXB4KWAgfSxcblx0XHRdLCB7XG5cdFx0XHRkdXJhdGlvbjogMTEwMCxcblx0XHRcdGVhc2luZzogJ2N1YmljLWJlemllcigwLjQsIDAsIDAuMiwgMSknLFxuXHRcdFx0ZmlsbDogJ2ZvcndhcmRzJyxcblx0XHR9KTtcblx0fVxuXG5cdC8vIFJhZGlhbnQgbGluZXNcblx0Zm9yIChsZXQgaSA9IDA7IGkgPCA4OyBpKyspIHtcblx0XHRjb25zdCBhbmdsZURlZyA9IGkgKiA0NTtcblxuXHRcdGNvbnN0IGxpbmVXcmFwcGVyID0gZG9tLiQoJy5hbmltYXRpb24tcGFydGljbGUnKTtcblx0XHRsaW5lV3JhcHBlci5zdHlsZS5wb3NpdGlvbiA9ICdhYnNvbHV0ZSc7XG5cdFx0bGluZVdyYXBwZXIuc3R5bGUubGVmdCA9IGAke2N4fXB4YDtcblx0XHRsaW5lV3JhcHBlci5zdHlsZS50b3AgPSBgJHtjeX1weGA7XG5cdFx0bGluZVdyYXBwZXIuc3R5bGUud2lkdGggPSAnMCc7XG5cdFx0bGluZVdyYXBwZXIuc3R5bGUuaGVpZ2h0ID0gJzAnO1xuXHRcdGxpbmVXcmFwcGVyLnN0eWxlLnRyYW5zZm9ybSA9IGByb3RhdGUoJHthbmdsZURlZ31kZWcpYDtcblx0XHRvdmVybGF5LmFwcGVuZENoaWxkKGxpbmVXcmFwcGVyKTtcblxuXHRcdGNvbnN0IGxpbmUgPSBkb20uJCgnLmFuaW1hdGlvbi1wYXJ0aWNsZScpO1xuXHRcdGxpbmUuc3R5bGUucG9zaXRpb24gPSAnYWJzb2x1dGUnO1xuXHRcdGxpbmUuc3R5bGUud2lkdGggPSAnMnB4Jztcblx0XHRsaW5lLnN0eWxlLmhlaWdodCA9ICcxMHB4Jztcblx0XHRsaW5lLnN0eWxlLmJhY2tncm91bmRDb2xvciA9ICd2YXIoLS12c2NvZGUtZm9jdXNCb3JkZXIsICMwMDdhY2MpJztcblx0XHRsaW5lLnN0eWxlLmxlZnQgPSAnLTFweCc7XG5cdFx0bGluZS5zdHlsZS50b3AgPSAnLTIycHgnO1xuXHRcdGxpbmUuc3R5bGUudHJhbnNmb3JtT3JpZ2luID0gJ2JvdHRvbSBjZW50ZXInO1xuXHRcdGxpbmVXcmFwcGVyLmFwcGVuZENoaWxkKGxpbmUpO1xuXG5cdFx0bGluZS5hbmltYXRlKFtcblx0XHRcdHsgdHJhbnNmb3JtOiAnc2NhbGUoMSwgMCknLCBvcGFjaXR5OiAwLjYgfSxcblx0XHRcdHsgdHJhbnNmb3JtOiAnc2NhbGUoMSwgMSknLCBvcGFjaXR5OiAwLjYsIG9mZnNldDogMC4yIH0sXG5cdFx0XHR7IHRyYW5zZm9ybTogJ3NjYWxlKDEsIDEpJywgb3BhY2l0eTogMC42LCBvZmZzZXQ6IDAuNiB9LFxuXHRcdFx0eyB0cmFuc2Zvcm06ICdzY2FsZSgxLCAxKScsIG9wYWNpdHk6IDAuNiwgb2Zmc2V0OiAwLjggfSxcblx0XHRcdHsgdHJhbnNmb3JtOiAnc2NhbGUoMCwgMC4zKScsIG9wYWNpdHk6IDAgfSxcblx0XHRdLCB7XG5cdFx0XHRkdXJhdGlvbjogMTIwMCxcblx0XHRcdGRlbGF5OiAxNTAsXG5cdFx0XHRlYXNpbmc6ICdjdWJpYy1iZXppZXIoMC40LCAwLCAwLjIsIDEpJyxcblx0XHRcdGZpbGw6ICdmb3J3YXJkcycsXG5cdFx0fSk7XG5cdH1cblxuXHRjbGVhbnVwT3ZlcmxheSgyMDAwKTtcbn1cblxuLyoqXG4gKiBUcmlnZ2VycyB0aGUgc3BlY2lmaWVkIGNsaWNrIGFuaW1hdGlvbiBvbiB0aGUgZWxlbWVudC5cbiAqIEBwYXJhbSBlbGVtZW50IFRoZSB0YXJnZXQgZWxlbWVudCB0byBhbmltYXRlLlxuICogQHBhcmFtIGFuaW1hdGlvbiBUaGUgdHlwZSBvZiBjbGljayBhbmltYXRpb24gdG8gdHJpZ2dlci5cbiAqIEBwYXJhbSBpY29uIE9wdGlvbmFsIGljb24gZm9yIGFuaW1hdGlvbnMgdGhhdCByZXF1aXJlIGl0IChlLmcuLCBGbG9hdGluZ0ljb25zKS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHRyaWdnZXJDbGlja0FuaW1hdGlvbihlbGVtZW50OiBIVE1MRWxlbWVudCwgYW5pbWF0aW9uOiBDbGlja0FuaW1hdGlvbiwgaWNvbj86IFRoZW1lSWNvbikge1xuXHRzd2l0Y2ggKGFuaW1hdGlvbikge1xuXHRcdGNhc2UgQ2xpY2tBbmltYXRpb24uQ29uZmV0dGk6XG5cdFx0XHR0cmlnZ2VyQ29uZmV0dGlBbmltYXRpb24oZWxlbWVudCk7XG5cdFx0XHRicmVhaztcblx0XHRjYXNlIENsaWNrQW5pbWF0aW9uLkZsb2F0aW5nSWNvbnM6XG5cdFx0XHRpZiAoaWNvbikge1xuXHRcdFx0XHR0cmlnZ2VyRmxvYXRpbmdJY29uc0FuaW1hdGlvbihlbGVtZW50LCBpY29uKTtcblx0XHRcdH1cblx0XHRcdGJyZWFrO1xuXHRcdGNhc2UgQ2xpY2tBbmltYXRpb24uUHVsc2VXYXZlOlxuXHRcdFx0dHJpZ2dlclB1bHNlV2F2ZUFuaW1hdGlvbihlbGVtZW50KTtcblx0XHRcdGJyZWFrO1xuXHRcdGNhc2UgQ2xpY2tBbmltYXRpb24uUmFkaWFudExpbmVzOlxuXHRcdFx0dHJpZ2dlclJhZGlhbnRMaW5lc0FuaW1hdGlvbihlbGVtZW50KTtcblx0XHRcdGJyZWFrO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLGlCQUFpQjtBQUMxQixZQUFZLFNBQVM7QUFFZCxJQUFXLGlCQUFYLGtCQUFXQSxvQkFBWDtBQUNOLEVBQUFBLGdDQUFBLGNBQVcsS0FBWDtBQUNBLEVBQUFBLGdDQUFBLG1CQUFnQixLQUFoQjtBQUNBLEVBQUFBLGdDQUFBLGVBQVksS0FBWjtBQUNBLEVBQUFBLGdDQUFBLGtCQUFlLEtBQWY7QUFKaUIsU0FBQUE7QUFBQSxHQUFBO0FBT2xCLE1BQU0saUJBQWlCO0FBQUEsRUFDdEI7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUNEO0FBRUEsSUFBSTtBQUtKLFNBQVMsY0FBYyxTQUFvRjtBQUMxRyxNQUFJLGVBQWU7QUFDbEIsV0FBTztBQUFBLEVBQ1I7QUFFQSxRQUFNLE9BQU8sUUFBUSxzQkFBc0I7QUFDM0MsUUFBTSxnQkFBZ0IsSUFBSSxVQUFVLE9BQU8sRUFBRTtBQUU3QyxRQUFNLFVBQVUsSUFBSSxFQUFFLG9CQUFvQjtBQUMxQyxVQUFRLE1BQU0sV0FBVztBQUN6QixVQUFRLE1BQU0sT0FBTyxHQUFHLEtBQUssSUFBSTtBQUNqQyxVQUFRLE1BQU0sTUFBTSxHQUFHLEtBQUssR0FBRztBQUMvQixVQUFRLE1BQU0sUUFBUSxHQUFHLEtBQUssS0FBSztBQUNuQyxVQUFRLE1BQU0sU0FBUyxHQUFHLEtBQUssTUFBTTtBQUNyQyxVQUFRLE1BQU0sZ0JBQWdCO0FBQzlCLFVBQVEsTUFBTSxXQUFXO0FBQ3pCLFVBQVEsTUFBTSxTQUFTO0FBRXZCLGdCQUFjLEtBQUssWUFBWSxPQUFPO0FBQ3RDLGtCQUFnQjtBQUVoQixTQUFPLEVBQUUsU0FBUyxJQUFJLEtBQUssUUFBUSxHQUFHLElBQUksS0FBSyxTQUFTLEVBQUU7QUFDM0Q7QUFLQSxTQUFTLGVBQWUsVUFBa0I7QUFDekMsYUFBVyxNQUFNO0FBQ2hCLFFBQUksZUFBZTtBQUNsQixvQkFBYyxPQUFPO0FBQ3JCLHNCQUFnQjtBQUFBLElBQ2pCO0FBQUEsRUFDRCxHQUFHLFFBQVE7QUFDWjtBQUtPLFNBQVMsY0FBYyxTQUFzQixNQUF5RjtBQUM1SSxRQUFNLFNBQXFCLENBQUM7QUFFNUIsUUFBTSxRQUFRLEtBQUssSUFBSSxLQUFLLE9BQU8sVUFBVSxHQUFHLEtBQUssUUFBUSxVQUFVLEdBQUcsS0FBSyxZQUFZLFVBQVUsQ0FBQztBQUN0RyxNQUFJLFVBQVUsR0FBRztBQUNoQjtBQUFBLEVBQ0Q7QUFFQSxXQUFTLElBQUksR0FBRyxJQUFJLE9BQU8sS0FBSztBQUMvQixVQUFNLFFBQWtCLEVBQUUsUUFBUSxVQUFVLElBQUksSUFBSSxLQUFLLFFBQVEsR0FBRztBQUNwRSxRQUFJLGlCQUFpQjtBQUVyQixVQUFNLFFBQVEsS0FBSyxRQUFRLENBQUM7QUFDNUIsUUFBSSxVQUFVLFFBQVc7QUFDeEIsd0JBQWtCLFNBQVMsS0FBSztBQUFBLElBQ2pDO0FBRUEsVUFBTSxTQUFTLEtBQUssU0FBUyxDQUFDO0FBQzlCLFFBQUksV0FBVyxRQUFXO0FBQ3pCLHdCQUFrQixXQUFXLE1BQU07QUFBQSxJQUNwQztBQUVBLFVBQU0sYUFBYSxLQUFLLGFBQWEsQ0FBQztBQUN0QyxRQUFJLGVBQWUsUUFBVztBQUM3Qix3QkFBa0IsZUFBZSxVQUFVO0FBQUEsSUFDNUM7QUFFQSxRQUFJLGdCQUFnQjtBQUNuQixZQUFNLFlBQVksZUFBZSxLQUFLO0FBQUEsSUFDdkM7QUFDQSxXQUFPLEtBQUssS0FBSztBQUFBLEVBQ2xCO0FBRUEsVUFBUSxRQUFRLFFBQVE7QUFBQSxJQUN2QixVQUFVLEtBQUssWUFBWTtBQUFBLElBQzNCLFFBQVE7QUFBQSxJQUNSLE1BQU07QUFBQSxFQUNQLENBQUM7QUFDRjtBQU1PLFNBQVMseUJBQXlCLFNBQXNCO0FBQzlELFFBQU0sU0FBUyxjQUFjLE9BQU87QUFDcEMsTUFBSSxDQUFDLFFBQVE7QUFDWjtBQUFBLEVBQ0Q7QUFFQSxRQUFNLEVBQUUsU0FBUyxJQUFJLEdBQUcsSUFBSTtBQUM1QixRQUFNLE9BQU8sUUFBUSxzQkFBc0I7QUFHM0MsZ0JBQWMsU0FBUztBQUFBLElBQ3RCLE9BQU8sQ0FBQyxHQUFHLEtBQUssQ0FBQztBQUFBLElBQ2pCLFFBQVEsQ0FBQyxHQUFHLEtBQUssSUFBSSxDQUFDO0FBQUEsSUFDdEIsVUFBVTtBQUFBLEVBQ1gsQ0FBQztBQUdELFFBQU0sZ0JBQWdCO0FBQ3RCLFdBQVMsSUFBSSxHQUFHLElBQUksZUFBZSxLQUFLO0FBQ3ZDLFVBQU0sT0FBTyxJQUFLLElBQUksSUFBSztBQUMzQixVQUFNLFFBQVMsSUFBSSxLQUFLLEtBQUssS0FBTTtBQUNuQyxVQUFNLFdBQVc7QUFDakIsVUFBTSxrQkFBa0IsTUFBTyxJQUFJLElBQUs7QUFFeEMsVUFBTSxPQUFPLElBQUksRUFBRSxxQkFBcUI7QUFDeEMsU0FBSyxNQUFNLFdBQVc7QUFDdEIsU0FBSyxNQUFNLFFBQVEsR0FBRyxJQUFJO0FBQzFCLFNBQUssTUFBTSxTQUFTLEdBQUcsSUFBSTtBQUMzQixTQUFLLE1BQU0sZUFBZTtBQUMxQixTQUFLLE1BQU0sa0JBQWtCLGVBQWUsSUFBSSxlQUFlLE1BQU07QUFDckUsU0FBSyxNQUFNLE9BQU8sR0FBRyxLQUFLLE9BQU8sQ0FBQztBQUNsQyxTQUFLLE1BQU0sTUFBTSxHQUFHLEtBQUssT0FBTyxDQUFDO0FBQ2pDLFlBQVEsWUFBWSxJQUFJO0FBRXhCLFVBQU0sS0FBSyxLQUFLLElBQUksS0FBSyxJQUFJO0FBQzdCLFVBQU0sS0FBSyxLQUFLLElBQUksS0FBSyxJQUFJO0FBRTdCLFNBQUssUUFBUTtBQUFBLE1BQ1osRUFBRSxTQUFTLEdBQUcsV0FBVywyQkFBMkI7QUFBQSxNQUNwRCxFQUFFLFNBQVMsaUJBQWlCLFdBQVcsc0JBQXNCLEtBQUssR0FBRyxPQUFPLEtBQUssR0FBRyxPQUFPLFFBQVEsSUFBSTtBQUFBLE1BQ3ZHLEVBQUUsU0FBUyxpQkFBaUIsV0FBVyxzQkFBc0IsRUFBRSxPQUFPLEVBQUUsT0FBTyxRQUFRLElBQUk7QUFBQSxNQUMzRixFQUFFLFNBQVMsR0FBRyxXQUFXLHNCQUFzQixFQUFFLE9BQU8sRUFBRSxNQUFNO0FBQUEsSUFDakUsR0FBRztBQUFBLE1BQ0YsVUFBVTtBQUFBLE1BQ1YsUUFBUTtBQUFBLE1BQ1IsTUFBTTtBQUFBLElBQ1AsQ0FBQztBQUFBLEVBQ0Y7QUFHQSxRQUFNLE9BQU8sSUFBSSxFQUFFLHFCQUFxQjtBQUN4QyxPQUFLLE1BQU0sV0FBVztBQUN0QixPQUFLLE1BQU0sT0FBTztBQUNsQixPQUFLLE1BQU0sTUFBTTtBQUNqQixPQUFLLE1BQU0sUUFBUSxHQUFHLEtBQUssS0FBSztBQUNoQyxPQUFLLE1BQU0sU0FBUyxHQUFHLEtBQUssTUFBTTtBQUNsQyxPQUFLLE1BQU0sZUFBZTtBQUMxQixPQUFLLE1BQU0sU0FBUztBQUNwQixPQUFLLE1BQU0sWUFBWTtBQUN2QixVQUFRLFlBQVksSUFBSTtBQUV4QixPQUFLLFFBQVE7QUFBQSxJQUNaLEVBQUUsV0FBVyxZQUFZLFNBQVMsRUFBRTtBQUFBLElBQ3BDLEVBQUUsV0FBVyxZQUFZLFNBQVMsRUFBRTtBQUFBLEVBQ3JDLEdBQUc7QUFBQSxJQUNGLFVBQVU7QUFBQSxJQUNWLFFBQVE7QUFBQSxJQUNSLE1BQU07QUFBQSxFQUNQLENBQUM7QUFFRCxpQkFBZSxHQUFJO0FBQ3BCO0FBS08sU0FBUyw4QkFBOEIsU0FBc0IsTUFBaUI7QUFDcEYsUUFBTSxTQUFTLGNBQWMsT0FBTztBQUNwQyxNQUFJLENBQUMsUUFBUTtBQUNaO0FBQUEsRUFDRDtBQUVBLFFBQU0sRUFBRSxTQUFTLElBQUksR0FBRyxJQUFJO0FBQzVCLFFBQU0sT0FBTyxRQUFRLHNCQUFzQjtBQUczQyxnQkFBYyxTQUFTO0FBQUEsSUFDdEIsWUFBWSxDQUFDLEdBQUcsSUFBSSxDQUFDO0FBQUEsSUFDckIsVUFBVTtBQUFBLEVBQ1gsQ0FBQztBQUdELFFBQU0sWUFBWTtBQUNsQixXQUFTLElBQUksR0FBRyxJQUFJLFdBQVcsS0FBSztBQUNuQyxVQUFNLE9BQU8sS0FBTSxJQUFJLElBQUs7QUFDNUIsVUFBTSxTQUFTLElBQUksRUFBRSxxQkFBcUI7QUFDMUMsV0FBTyxNQUFNLFdBQVc7QUFDeEIsV0FBTyxNQUFNLE9BQU8sR0FBRyxFQUFFO0FBQ3pCLFdBQU8sTUFBTSxNQUFNLEdBQUcsRUFBRTtBQUN4QixXQUFPLE1BQU0sV0FBVyxHQUFHLElBQUk7QUFDL0IsV0FBTyxNQUFNLGFBQWE7QUFDMUIsV0FBTyxNQUFNLFFBQVE7QUFDckIsV0FBTyxVQUFVLElBQUksR0FBRyxVQUFVLGlCQUFpQixJQUFJLENBQUM7QUFDeEQsWUFBUSxZQUFZLE1BQU07QUFFMUIsVUFBTSxVQUFVLEtBQUssT0FBTyxJQUFJLE9BQU87QUFDdkMsVUFBTSxTQUFTLE1BQU8sSUFBSSxJQUFLO0FBQy9CLFVBQU0sV0FBVyxLQUFLLE9BQU8sSUFBSSxPQUFPO0FBQ3hDLFVBQU0sV0FBVyxLQUFLLE9BQU8sSUFBSSxPQUFPO0FBRXhDLFdBQU8sUUFBUTtBQUFBLE1BQ2QsRUFBRSxTQUFTLEdBQUcsV0FBVyx5Q0FBeUMsT0FBTyxPQUFPO0FBQUEsTUFDaEYsRUFBRSxTQUFTLEdBQUcsV0FBVyx5QkFBeUIsU0FBUyxHQUFHLG9CQUFvQixTQUFTLEdBQUcseUJBQXlCLFVBQVUsV0FBVyxHQUFHLFFBQVEsUUFBUSxJQUFJO0FBQUEsTUFDbkssRUFBRSxTQUFTLEdBQUcsV0FBVyx5QkFBeUIsU0FBUyxHQUFHLG9CQUFvQixTQUFTLEdBQUcseUJBQXlCLFVBQVUsV0FBVyxHQUFHLFFBQVEsUUFBUSxJQUFJO0FBQUEsTUFDbkssRUFBRSxTQUFTLEdBQUcsV0FBVyx5QkFBeUIsTUFBTSxvQkFBb0IsTUFBTSwwQkFBMEIsT0FBTyxPQUFPO0FBQUEsSUFDM0gsR0FBRztBQUFBLE1BQ0YsVUFBVSxNQUFPLElBQUksSUFBSztBQUFBLE1BQzFCLE9BQU8sSUFBSTtBQUFBLE1BQ1gsUUFBUTtBQUFBLE1BQ1IsTUFBTTtBQUFBLElBQ1AsQ0FBQztBQUFBLEVBQ0Y7QUFHQSxRQUFNLE9BQU8sSUFBSSxFQUFFLHFCQUFxQjtBQUN4QyxPQUFLLE1BQU0sV0FBVztBQUN0QixPQUFLLE1BQU0sT0FBTztBQUNsQixPQUFLLE1BQU0sTUFBTTtBQUNqQixPQUFLLE1BQU0sUUFBUSxHQUFHLEtBQUssS0FBSztBQUNoQyxPQUFLLE1BQU0sU0FBUyxHQUFHLEtBQUssTUFBTTtBQUNsQyxPQUFLLE1BQU0sZUFBZTtBQUMxQixPQUFLLE1BQU0sU0FBUztBQUNwQixPQUFLLE1BQU0sWUFBWTtBQUN2QixVQUFRLFlBQVksSUFBSTtBQUV4QixPQUFLLFFBQVE7QUFBQSxJQUNaLEVBQUUsV0FBVyxZQUFZLFNBQVMsRUFBRTtBQUFBLElBQ3BDLEVBQUUsV0FBVyxZQUFZLFNBQVMsRUFBRTtBQUFBLEVBQ3JDLEdBQUc7QUFBQSxJQUNGLFVBQVU7QUFBQSxJQUNWLFFBQVE7QUFBQSxJQUNSLE1BQU07QUFBQSxFQUNQLENBQUM7QUFFRCxpQkFBZSxHQUFJO0FBQ3BCO0FBS08sU0FBUywwQkFBMEIsU0FBc0I7QUFDL0QsUUFBTSxTQUFTLGNBQWMsT0FBTztBQUNwQyxNQUFJLENBQUMsUUFBUTtBQUNaO0FBQUEsRUFDRDtBQUVBLFFBQU0sRUFBRSxTQUFTLElBQUksR0FBRyxJQUFJO0FBQzVCLFFBQU0sT0FBTyxRQUFRLHNCQUFzQjtBQUczQyxnQkFBYyxTQUFTO0FBQUEsSUFDdEIsT0FBTyxDQUFDLEdBQUcsS0FBSyxDQUFDO0FBQUEsSUFDakIsUUFBUSxDQUFDLEdBQUcsS0FBSyxDQUFDO0FBQUEsSUFDbEIsVUFBVTtBQUFBLEVBQ1gsQ0FBQztBQUdELFdBQVMsSUFBSSxHQUFHLElBQUksR0FBRyxLQUFLO0FBQzNCLFVBQU0sT0FBTyxJQUFJLEVBQUUscUJBQXFCO0FBQ3hDLFNBQUssTUFBTSxXQUFXO0FBQ3RCLFNBQUssTUFBTSxPQUFPO0FBQ2xCLFNBQUssTUFBTSxNQUFNO0FBQ2pCLFNBQUssTUFBTSxRQUFRLEdBQUcsS0FBSyxLQUFLO0FBQ2hDLFNBQUssTUFBTSxTQUFTLEdBQUcsS0FBSyxNQUFNO0FBQ2xDLFNBQUssTUFBTSxlQUFlO0FBQzFCLFNBQUssTUFBTSxTQUFTO0FBQ3BCLFNBQUssTUFBTSxZQUFZO0FBQ3ZCLFlBQVEsWUFBWSxJQUFJO0FBRXhCLFNBQUssUUFBUTtBQUFBLE1BQ1osRUFBRSxXQUFXLGNBQWMsU0FBUyxFQUFFO0FBQUEsTUFDdEMsRUFBRSxXQUFXLGNBQWMsU0FBUyxLQUFLLFFBQVEsS0FBSztBQUFBLE1BQ3RELEVBQUUsV0FBVyxjQUFjLFNBQVMsRUFBRTtBQUFBLElBQ3ZDLEdBQUc7QUFBQSxNQUNGLFVBQVU7QUFBQSxNQUNWLE9BQU8sSUFBSTtBQUFBLE1BQ1gsUUFBUTtBQUFBLE1BQ1IsTUFBTTtBQUFBLElBQ1AsQ0FBQztBQUFBLEVBQ0Y7QUFHQSxXQUFTLElBQUksR0FBRyxJQUFJLEdBQUcsS0FBSztBQUMzQixVQUFNLFFBQVMsSUFBSSxLQUFLLEtBQUssS0FBTTtBQUNuQyxVQUFNLFdBQVcsS0FBTSxJQUFJLElBQUs7QUFDaEMsVUFBTSxPQUFPO0FBRWIsVUFBTSxNQUFNLElBQUksRUFBRSxxQkFBcUI7QUFDdkMsUUFBSSxNQUFNLFdBQVc7QUFDckIsUUFBSSxNQUFNLFFBQVEsR0FBRyxJQUFJO0FBQ3pCLFFBQUksTUFBTSxTQUFTLEdBQUcsSUFBSTtBQUMxQixRQUFJLE1BQU0sZUFBZTtBQUN6QixRQUFJLE1BQU0sa0JBQWtCO0FBQzVCLFFBQUksTUFBTSxPQUFPLEdBQUcsS0FBSyxPQUFPLENBQUM7QUFDakMsUUFBSSxNQUFNLE1BQU0sR0FBRyxLQUFLLE9BQU8sQ0FBQztBQUNoQyxZQUFRLFlBQVksR0FBRztBQUV2QixVQUFNLEtBQUssS0FBSyxJQUFJLEtBQUssSUFBSTtBQUM3QixVQUFNLEtBQUssS0FBSyxJQUFJLEtBQUssSUFBSTtBQUU3QixRQUFJLFFBQVE7QUFBQSxNQUNYLEVBQUUsU0FBUyxHQUFHLFdBQVcsMkJBQTJCO0FBQUEsTUFDcEQsRUFBRSxTQUFTLEdBQUcsV0FBVyxzQkFBc0IsRUFBRSxPQUFPLEVBQUUsT0FBTyxRQUFRLElBQUk7QUFBQSxNQUM3RSxFQUFFLFNBQVMsR0FBRyxXQUFXLHNCQUFzQixFQUFFLE9BQU8sRUFBRSxNQUFNO0FBQUEsSUFDakUsR0FBRztBQUFBLE1BQ0YsVUFBVTtBQUFBLE1BQ1YsT0FBTyxNQUFNLElBQUk7QUFBQSxNQUNqQixRQUFRO0FBQUEsTUFDUixNQUFNO0FBQUEsSUFDUCxDQUFDO0FBQUEsRUFDRjtBQUdBLFFBQU0sT0FBTyxJQUFJLEVBQUUscUJBQXFCO0FBQ3hDLE9BQUssTUFBTSxXQUFXO0FBQ3RCLE9BQUssTUFBTSxPQUFPO0FBQ2xCLE9BQUssTUFBTSxNQUFNO0FBQ2pCLE9BQUssTUFBTSxRQUFRLEdBQUcsS0FBSyxLQUFLO0FBQ2hDLE9BQUssTUFBTSxTQUFTLEdBQUcsS0FBSyxNQUFNO0FBQ2xDLE9BQUssTUFBTSxlQUFlO0FBQzFCLE9BQUssTUFBTSxrQkFBa0I7QUFDN0IsVUFBUSxZQUFZLElBQUk7QUFFeEIsT0FBSyxRQUFRO0FBQUEsSUFDWixFQUFFLFdBQVcsY0FBYyxTQUFTLEVBQUU7QUFBQSxJQUN0QyxFQUFFLFdBQVcsY0FBYyxTQUFTLEtBQUssUUFBUSxLQUFLO0FBQUEsSUFDdEQsRUFBRSxXQUFXLGNBQWMsU0FBUyxFQUFFO0FBQUEsRUFDdkMsR0FBRztBQUFBLElBQ0YsVUFBVTtBQUFBLElBQ1YsUUFBUTtBQUFBLElBQ1IsTUFBTTtBQUFBLEVBQ1AsQ0FBQztBQUVELGlCQUFlLEdBQUk7QUFDcEI7QUFLTyxTQUFTLDZCQUE2QixTQUFzQjtBQUNsRSxRQUFNLFNBQVMsY0FBYyxPQUFPO0FBQ3BDLE1BQUksQ0FBQyxRQUFRO0FBQ1o7QUFBQSxFQUNEO0FBRUEsUUFBTSxFQUFFLFNBQVMsSUFBSSxHQUFHLElBQUk7QUFHNUIsZ0JBQWMsU0FBUztBQUFBLElBQ3RCLE9BQU8sQ0FBQyxHQUFHLE1BQU0sQ0FBQztBQUFBLElBQ2xCLFVBQVU7QUFBQSxFQUNYLENBQUM7QUFHRCxXQUFTLElBQUksR0FBRyxJQUFJLEdBQUcsS0FBSztBQUMzQixVQUFNLE9BQU87QUFDYixVQUFNLGFBQWE7QUFDbkIsVUFBTSxTQUFVLElBQUksS0FBSyxRQUFRLEtBQUssS0FBTTtBQUM1QyxVQUFNLGdCQUFnQjtBQUN0QixVQUFNLGNBQWM7QUFFcEIsVUFBTSxNQUFNLElBQUksRUFBRSxxQkFBcUI7QUFDdkMsUUFBSSxNQUFNLFdBQVc7QUFDckIsUUFBSSxNQUFNLFFBQVEsR0FBRyxJQUFJO0FBQ3pCLFFBQUksTUFBTSxTQUFTLEdBQUcsSUFBSTtBQUMxQixRQUFJLE1BQU0sZUFBZTtBQUN6QixRQUFJLE1BQU0sa0JBQWtCO0FBQzVCLFFBQUksTUFBTSxPQUFPLEdBQUcsS0FBSyxPQUFPLENBQUM7QUFDakMsUUFBSSxNQUFNLE1BQU0sR0FBRyxLQUFLLE9BQU8sQ0FBQztBQUNoQyxZQUFRLFlBQVksR0FBRztBQUV2QixVQUFNLFNBQVMsS0FBSyxJQUFJLEtBQUssSUFBSTtBQUNqQyxVQUFNLFNBQVMsS0FBSyxJQUFJLEtBQUssSUFBSTtBQUNqQyxVQUFNLE9BQU8sS0FBSyxJQUFJLEtBQUssSUFBSTtBQUMvQixVQUFNLE9BQU8sS0FBSyxJQUFJLEtBQUssSUFBSTtBQUUvQixRQUFJLFFBQVE7QUFBQSxNQUNYLEVBQUUsU0FBUyxHQUFHLFdBQVcsc0JBQXNCLE1BQU0sT0FBTyxNQUFNLE1BQU07QUFBQSxNQUN4RSxFQUFFLFNBQVMsWUFBWSxXQUFXLHlCQUF5QixTQUFTLFFBQVEsQ0FBQyxRQUFRLFNBQVMsUUFBUSxDQUFDLE9BQU8sUUFBUSxLQUFLO0FBQUEsTUFDM0gsRUFBRSxTQUFTLFlBQVksV0FBVyxzQkFBc0IsT0FBTyxHQUFHLE9BQU8sT0FBTyxHQUFHLE9BQU8sUUFBUSxJQUFJO0FBQUEsTUFDdEcsRUFBRSxTQUFTLGFBQWEsS0FBSyxXQUFXLHNCQUFzQixJQUFJLE9BQU8sSUFBSSxPQUFPLFFBQVEsS0FBSztBQUFBLE1BQ2pHLEVBQUUsU0FBUyxHQUFHLFdBQVcsd0JBQXdCLElBQUksT0FBTyxJQUFJLE1BQU07QUFBQSxJQUN2RSxHQUFHO0FBQUEsTUFDRixVQUFVO0FBQUEsTUFDVixRQUFRO0FBQUEsTUFDUixNQUFNO0FBQUEsSUFDUCxDQUFDO0FBQUEsRUFDRjtBQUdBLFdBQVMsSUFBSSxHQUFHLElBQUksR0FBRyxLQUFLO0FBQzNCLFVBQU0sV0FBVyxJQUFJO0FBRXJCLFVBQU0sY0FBYyxJQUFJLEVBQUUscUJBQXFCO0FBQy9DLGdCQUFZLE1BQU0sV0FBVztBQUM3QixnQkFBWSxNQUFNLE9BQU8sR0FBRyxFQUFFO0FBQzlCLGdCQUFZLE1BQU0sTUFBTSxHQUFHLEVBQUU7QUFDN0IsZ0JBQVksTUFBTSxRQUFRO0FBQzFCLGdCQUFZLE1BQU0sU0FBUztBQUMzQixnQkFBWSxNQUFNLFlBQVksVUFBVSxRQUFRO0FBQ2hELFlBQVEsWUFBWSxXQUFXO0FBRS9CLFVBQU0sT0FBTyxJQUFJLEVBQUUscUJBQXFCO0FBQ3hDLFNBQUssTUFBTSxXQUFXO0FBQ3RCLFNBQUssTUFBTSxRQUFRO0FBQ25CLFNBQUssTUFBTSxTQUFTO0FBQ3BCLFNBQUssTUFBTSxrQkFBa0I7QUFDN0IsU0FBSyxNQUFNLE9BQU87QUFDbEIsU0FBSyxNQUFNLE1BQU07QUFDakIsU0FBSyxNQUFNLGtCQUFrQjtBQUM3QixnQkFBWSxZQUFZLElBQUk7QUFFNUIsU0FBSyxRQUFRO0FBQUEsTUFDWixFQUFFLFdBQVcsZUFBZSxTQUFTLElBQUk7QUFBQSxNQUN6QyxFQUFFLFdBQVcsZUFBZSxTQUFTLEtBQUssUUFBUSxJQUFJO0FBQUEsTUFDdEQsRUFBRSxXQUFXLGVBQWUsU0FBUyxLQUFLLFFBQVEsSUFBSTtBQUFBLE1BQ3RELEVBQUUsV0FBVyxlQUFlLFNBQVMsS0FBSyxRQUFRLElBQUk7QUFBQSxNQUN0RCxFQUFFLFdBQVcsaUJBQWlCLFNBQVMsRUFBRTtBQUFBLElBQzFDLEdBQUc7QUFBQSxNQUNGLFVBQVU7QUFBQSxNQUNWLE9BQU87QUFBQSxNQUNQLFFBQVE7QUFBQSxNQUNSLE1BQU07QUFBQSxJQUNQLENBQUM7QUFBQSxFQUNGO0FBRUEsaUJBQWUsR0FBSTtBQUNwQjtBQVFPLFNBQVMsc0JBQXNCLFNBQXNCLFdBQTJCLE1BQWtCO0FBQ3hHLFVBQVEsV0FBVztBQUFBLElBQ2xCLEtBQUs7QUFDSiwrQkFBeUIsT0FBTztBQUNoQztBQUFBLElBQ0QsS0FBSztBQUNKLFVBQUksTUFBTTtBQUNULHNDQUE4QixTQUFTLElBQUk7QUFBQSxNQUM1QztBQUNBO0FBQUEsSUFDRCxLQUFLO0FBQ0osZ0NBQTBCLE9BQU87QUFDakM7QUFBQSxJQUNELEtBQUs7QUFDSixtQ0FBNkIsT0FBTztBQUNwQztBQUFBLEVBQ0Y7QUFDRDsiLAogICJuYW1lcyI6IFsiQ2xpY2tBbmltYXRpb24iXQp9Cg==
