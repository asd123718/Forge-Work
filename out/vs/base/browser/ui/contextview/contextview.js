import { BrowserFeatures } from "../../canIUse.js";
import * as DOM from "../../dom.js";
import { createStyleSheet } from "../../domStylesheets.js";
import { Disposable, DisposableStore, toDisposable } from "../../../common/lifecycle.js";
import { AnchorAlignment, AnchorPosition, layout2d } from "../../../common/layout.js";
import * as platform from "../../../common/platform.js";
import "./contextview.css";
import { AnchorAlignment as AnchorAlignment2, AnchorAxisAlignment as AnchorAxisAlignment2, AnchorPosition as AnchorPosition2 } from "../../../common/layout.js";
var ContextViewDOMPosition = /* @__PURE__ */ ((ContextViewDOMPosition2) => {
  ContextViewDOMPosition2[ContextViewDOMPosition2["ABSOLUTE"] = 1] = "ABSOLUTE";
  ContextViewDOMPosition2[ContextViewDOMPosition2["FIXED"] = 2] = "FIXED";
  ContextViewDOMPosition2[ContextViewDOMPosition2["FIXED_SHADOW"] = 3] = "FIXED_SHADOW";
  return ContextViewDOMPosition2;
})(ContextViewDOMPosition || {});
function isAnchor(obj) {
  const anchor = obj;
  return !!anchor && typeof anchor.x === "number" && typeof anchor.y === "number";
}
const CONTEXT_VIEW_MENU_MOTION_CLASS = "context-view-menu-motion";
const CONTEXT_VIEW_MENU_MOTION_CLOSING_CLASS = "context-view-menu-motion-closing";
const CONTEXT_VIEW_MENU_MOTION_CLOSE_ANIMATION_DURATION = 150;
const CONTEXT_VIEW_MENU_MOTION_ANCESTOR_CLASSES = ["style-override", "monaco-enable-motion"];
const CONTEXT_VIEW_CLOSE_ANIMATION_DURATION_VARIABLE = "--vscode-context-view-close-animation-duration";
const CONTEXT_VIEW_MENU_MOTION_SHADOW_VARIABLE = "--vscode-context-view-menu-motion-shadow";
const CONTEXT_VIEW_MENU_MOTION_CLOSE_START_OPACITY_VARIABLE = "--vscode-context-view-menu-motion-close-start-opacity";
const CONTEXT_VIEW_MENU_MOTION_CLOSE_START_TRANSFORM_VARIABLE = "--vscode-context-view-menu-motion-close-start-transform";
const CONTEXT_VIEW_MENU_MOTION_OPEN_DURATION_MS = 250;
const CONTEXT_VIEW_MENU_MOTION_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";
const contextViewMenuCloseAnimation = {
  className: CONTEXT_VIEW_MENU_MOTION_CLOSING_CLASS,
  duration: CONTEXT_VIEW_MENU_MOTION_CLOSE_ANIMATION_DURATION,
  requiredAncestorClasses: CONTEXT_VIEW_MENU_MOTION_ANCESTOR_CLASSES
};
function getContextViewMenuMotionCss(enabledSelectorPrefix) {
  return (
    /* css */
    `
	${enabledSelectorPrefix} .context-view.${CONTEXT_VIEW_MENU_MOTION_CLASS} {
		animation: none;
		box-shadow: none;
		overflow: visible;
	}

	${enabledSelectorPrefix} .context-view.${CONTEXT_VIEW_MENU_MOTION_CLASS} > .monaco-scrollable-element {
		animation: context-view-menu-motion-open ${CONTEXT_VIEW_MENU_MOTION_OPEN_DURATION_MS}ms ${CONTEXT_VIEW_MENU_MOTION_EASING} backwards;
		box-shadow: var(${CONTEXT_VIEW_MENU_MOTION_SHADOW_VARIABLE});
		transform-origin: top left;
		will-change: opacity;
	}

	${enabledSelectorPrefix} .context-view.${CONTEXT_VIEW_MENU_MOTION_CLASS}.right > .monaco-scrollable-element {
		transform-origin: top right;
	}

	${enabledSelectorPrefix} .context-view.${CONTEXT_VIEW_MENU_MOTION_CLASS}.top > .monaco-scrollable-element {
		transform-origin: bottom left;
	}

	${enabledSelectorPrefix} .context-view.${CONTEXT_VIEW_MENU_MOTION_CLASS}.top.right > .monaco-scrollable-element {
		transform-origin: bottom right;
	}

	${enabledSelectorPrefix} .context-view.${CONTEXT_VIEW_MENU_MOTION_CLASS}.${CONTEXT_VIEW_MENU_MOTION_CLOSING_CLASS} > .monaco-scrollable-element {
		animation: context-view-menu-motion-close var(${CONTEXT_VIEW_CLOSE_ANIMATION_DURATION_VARIABLE}) ${CONTEXT_VIEW_MENU_MOTION_EASING} both;
		pointer-events: none;
	}

	@keyframes context-view-menu-motion-open {
		0% {
			opacity: 0;
			transform: scale(0.97);
		}

		100% {
			opacity: 1;
			transform: scale(1);
		}
	}

	@keyframes context-view-menu-motion-close {
		0% {
			opacity: var(${CONTEXT_VIEW_MENU_MOTION_CLOSE_START_OPACITY_VARIABLE}, 1);
			transform: var(${CONTEXT_VIEW_MENU_MOTION_CLOSE_START_TRANSFORM_VARIABLE}, scale(1));
		}

		100% {
			opacity: 0;
			transform: scale(0.99);
		}
	}`
  );
}
let contextViewMenuMotionStyleSheet;
function ensureContextViewMenuMotionStyleSheet() {
  if (!contextViewMenuMotionStyleSheet) {
    contextViewMenuMotionStyleSheet = createStyleSheet(void 0, (style) => {
      style.textContent = getContextViewMenuMotionCss(".style-override.monaco-enable-motion");
    });
  }
}
function getAnchorRect(anchor) {
  if (DOM.isHTMLElement(anchor)) {
    const elementPosition = DOM.getDomNodePagePosition(anchor);
    const zoom = DOM.getDomNodeZoomLevel(anchor);
    return {
      top: elementPosition.top * zoom,
      left: elementPosition.left * zoom,
      width: elementPosition.width * zoom,
      height: elementPosition.height * zoom
    };
  } else if (isAnchor(anchor)) {
    return {
      top: anchor.y,
      left: anchor.x,
      width: anchor.width || 1,
      height: anchor.height || 2
    };
  } else {
    return {
      top: anchor.posy,
      left: anchor.posx,
      // We are about to position the context view where the mouse
      // cursor is. To prevent the view being exactly under the mouse
      // when showing and thus potentially triggering an action within,
      // we treat the mouse location like a small sized block element.
      width: 2,
      height: 2
    };
  }
}
const _ContextView = class _ContextView extends Disposable {
  constructor(container, domPosition) {
    super();
    this.container = null;
    this.useFixedPosition = false;
    this.useShadowDOM = false;
    this.delegate = null;
    this.toDisposeOnClean = Disposable.None;
    this.toDisposeOnSetContainer = Disposable.None;
    this.shadowRoot = null;
    this.shadowRootHostElement = null;
    ensureContextViewMenuMotionStyleSheet();
    this.view = DOM.$(".context-view");
    DOM.hide(this.view);
    this.setContainer(container, domPosition);
    this._register(toDisposable(() => this.setContainer(null, 1 /* ABSOLUTE */)));
  }
  setContainer(container, domPosition) {
    this.useFixedPosition = domPosition !== 1 /* ABSOLUTE */;
    const usedShadowDOM = this.useShadowDOM;
    this.useShadowDOM = domPosition === 3 /* FIXED_SHADOW */;
    if (container === this.container && usedShadowDOM === this.useShadowDOM) {
      return;
    }
    if (this.container) {
      this.toDisposeOnSetContainer.dispose();
      this.view.remove();
      if (this.shadowRoot) {
        this.shadowRoot = null;
        this.shadowRootHostElement?.remove();
        this.shadowRootHostElement = null;
      }
      this.container = null;
    }
    if (container) {
      this.container = container;
      if (this.useShadowDOM) {
        this.shadowRootHostElement = DOM.$(".shadow-root-host");
        this.container.appendChild(this.shadowRootHostElement);
        this.shadowRoot = this.shadowRootHostElement.attachShadow({ mode: "open" });
        const style = document.createElement("style");
        style.textContent = SHADOW_ROOT_CSS;
        this.shadowRoot.appendChild(style);
        this.shadowRoot.appendChild(this.view);
        this.shadowRoot.appendChild(DOM.$("slot"));
      } else {
        this.container.appendChild(this.view);
      }
      const toDisposeOnSetContainer = new DisposableStore();
      _ContextView.BUBBLE_UP_EVENTS.forEach((event) => {
        toDisposeOnSetContainer.add(DOM.addStandardDisposableListener(this.container, event, (e) => {
          this.onDOMEvent(e, false);
        }));
      });
      _ContextView.BUBBLE_DOWN_EVENTS.forEach((event) => {
        toDisposeOnSetContainer.add(DOM.addStandardDisposableListener(this.container, event, (e) => {
          this.onDOMEvent(e, true);
        }, true));
      });
      this.toDisposeOnSetContainer = toDisposeOnSetContainer;
    }
  }
  show(delegate) {
    this.completeHideAnimation();
    if (this.isVisible()) {
      this.hide(void 0, true);
    }
    DOM.clearNode(this.view);
    this.view.className = "context-view monaco-component";
    this.view.style.top = "0px";
    this.view.style.left = "0px";
    this.view.style.zIndex = `${2575 + (delegate.layer ?? 0)}`;
    this.view.style.position = this.useFixedPosition ? "fixed" : "absolute";
    DOM.show(this.view);
    this.toDisposeOnClean = delegate.render(this.view) || Disposable.None;
    this.delegate = delegate;
    this.doLayout();
    this.delegate.focus?.();
  }
  getViewElement() {
    return this.view;
  }
  layout() {
    if (!this.isVisible()) {
      return;
    }
    if (this.delegate.canRelayout === false && !(platform.isIOS && BrowserFeatures.pointerEvents)) {
      this.hide();
      return;
    }
    this.delegate?.layout?.();
    this.doLayout();
  }
  doLayout() {
    if (!this.isVisible()) {
      return;
    }
    const anchor = getAnchorRect(this.delegate.getAnchor());
    const containerWindow = this.container ? DOM.getWindow(this.container) : DOM.getActiveWindow();
    const viewport = { top: containerWindow.pageYOffset, left: containerWindow.pageXOffset, width: containerWindow.innerWidth, height: containerWindow.innerHeight };
    this.view.classList.toggle("fixed", this.useFixedPosition);
    this.view.style.top = "0px";
    this.view.style.left = "0px";
    const positioningOrigin = DOM.getDomNodePagePosition(this.view);
    const view = { width: DOM.getTotalWidth(this.view), height: DOM.getTotalHeight(this.view) };
    const anchorPosition = this.delegate.anchorPosition;
    const anchorAlignment = this.delegate.anchorAlignment;
    const anchorAxisAlignment = this.delegate.anchorAxisAlignment;
    const layoutResult = layout2d(viewport, view, anchor, { anchorAlignment, anchorPosition, anchorAxisAlignment });
    const { top, left } = layoutResult;
    this.view.classList.remove("top", "bottom", "left", "right");
    this.view.classList.add(layoutResult.anchorPosition === AnchorPosition.BELOW ? "bottom" : "top");
    this.view.classList.add(layoutResult.anchorAlignment === AnchorAlignment.LEFT ? "left" : "right");
    this.view.style.top = `${top - positioningOrigin.top}px`;
    this.view.style.left = `${left - positioningOrigin.left}px`;
    this.view.style.width = "initial";
  }
  hide(data, skipAnimation = false) {
    if (this.hidingContextView) {
      if (skipAnimation) {
        this.completeHideAnimation();
      }
      return;
    }
    const delegate = this.delegate;
    this.delegate = null;
    if (!delegate) {
      return;
    }
    const toDispose = this.toDisposeOnClean;
    this.toDisposeOnClean = Disposable.None;
    delegate.onHide?.(data);
    const closeAnimation = delegate.closeAnimation;
    if (!skipAnimation && closeAnimation && closeAnimation.duration > 0 && this.hasRequiredAncestorClasses(closeAnimation.requiredAncestorClasses)) {
      this.view.style.setProperty(CONTEXT_VIEW_CLOSE_ANIMATION_DURATION_VARIABLE, `${closeAnimation.duration}ms`);
      this.prepareMenuCloseAnimation();
      this.view.inert = true;
      this.view.classList.add(closeAnimation.className);
      const timeout = setTimeout(() => this.completeHideAnimation(), closeAnimation.duration);
      this.hidingContextView = {
        disposable: toDisposable(() => clearTimeout(timeout)),
        toDispose,
        className: closeAnimation.className
      };
      return;
    }
    toDispose.dispose();
    DOM.hide(this.view);
  }
  isVisible() {
    return !!this.delegate;
  }
  completeHideAnimation() {
    const hidingContextView = this.hidingContextView;
    if (!hidingContextView) {
      return;
    }
    this.hidingContextView = void 0;
    hidingContextView.disposable.dispose();
    this.view.classList.remove(hidingContextView.className);
    this.view.style.removeProperty(CONTEXT_VIEW_CLOSE_ANIMATION_DURATION_VARIABLE);
    this.view.style.removeProperty(CONTEXT_VIEW_MENU_MOTION_CLOSE_START_OPACITY_VARIABLE);
    this.view.style.removeProperty(CONTEXT_VIEW_MENU_MOTION_CLOSE_START_TRANSFORM_VARIABLE);
    hidingContextView.toDispose.dispose();
    DOM.hide(this.view);
    this.view.inert = false;
  }
  prepareMenuCloseAnimation() {
    if (!this.view.classList.contains(CONTEXT_VIEW_MENU_MOTION_CLASS)) {
      return;
    }
    const surface = Array.from(this.view.children).find((element) => DOM.isHTMLElement(element) && element.classList.contains("monaco-scrollable-element"));
    if (!DOM.isHTMLElement(surface)) {
      return;
    }
    const computedStyle = DOM.getWindow(surface).getComputedStyle(surface);
    this.view.style.setProperty(CONTEXT_VIEW_MENU_MOTION_CLOSE_START_OPACITY_VARIABLE, computedStyle.opacity);
    this.view.style.setProperty(CONTEXT_VIEW_MENU_MOTION_CLOSE_START_TRANSFORM_VARIABLE, computedStyle.transform);
  }
  hasRequiredAncestorClasses(classNames) {
    if (!classNames?.length) {
      return true;
    }
    for (let candidate = this.view; candidate; ) {
      const current = candidate;
      if (classNames.every((className) => current.classList.contains(className))) {
        return true;
      }
      if (current.parentElement) {
        candidate = current.parentElement;
      } else {
        const root = current.getRootNode();
        candidate = root instanceof ShadowRoot && DOM.isHTMLElement(root.host) ? root.host : null;
      }
    }
    return false;
  }
  onDOMEvent(e, onCapture) {
    if (this.delegate) {
      if (this.delegate.onDOMEvent) {
        this.delegate.onDOMEvent(e, DOM.getWindow(e).document.activeElement);
      } else if (onCapture && !DOM.isAncestor(e.target, this.container)) {
        this.hide();
      }
    }
  }
  dispose() {
    this.hide();
    this.completeHideAnimation();
    super.dispose();
  }
};
_ContextView.BUBBLE_UP_EVENTS = ["click", "keydown", "focus", "blur"];
_ContextView.BUBBLE_DOWN_EVENTS = ["click"];
let ContextView = _ContextView;
const SHADOW_ROOT_CSS = (
  /* css */
  `
	:host {
		all: initial; /* 1st rule so subsequent properties are reset. */
	}

	.codicon[class*='codicon-'] {
		font: normal normal normal 16px/1 codicon;
		display: inline-block;
		text-decoration: none;
		text-rendering: auto;
		text-align: center;
		-webkit-font-smoothing: antialiased;
		-moz-osx-font-smoothing: grayscale;
		user-select: none;
		-webkit-user-select: none;
		-ms-user-select: none;
	}

	:host {
		font-family: -apple-system, BlinkMacSystemFont, "Segoe WPC", "Segoe UI", "HelveticaNeue-Light", system-ui, "Ubuntu", "Droid Sans", sans-serif;
	}

	:host-context(.mac) { font-family: -apple-system, BlinkMacSystemFont, sans-serif; }
	:host-context(.mac:lang(zh-Hans)) { font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", sans-serif; }
	:host-context(.mac:lang(zh-Hant)) { font-family: -apple-system, BlinkMacSystemFont, "PingFang TC", sans-serif; }
	:host-context(.mac:lang(ja)) { font-family: -apple-system, BlinkMacSystemFont, "Hiragino Kaku Gothic Pro", sans-serif; }
	:host-context(.mac:lang(ko)) { font-family: -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Nanum Gothic", "AppleGothic", sans-serif; }

	:host-context(.windows) { font-family: "Segoe WPC", "Segoe UI", sans-serif; }
	:host-context(.windows:lang(zh-Hans)) { font-family: "Segoe WPC", "Segoe UI", "Microsoft YaHei", sans-serif; }
	:host-context(.windows:lang(zh-Hant)) { font-family: "Segoe WPC", "Segoe UI", "Microsoft Jhenghei", sans-serif; }
	:host-context(.windows:lang(ja)) { font-family: "Segoe WPC", "Segoe UI", "Yu Gothic UI", "Meiryo UI", sans-serif; }
	:host-context(.windows:lang(ko)) { font-family: "Segoe WPC", "Segoe UI", "Malgun Gothic", "Dotom", sans-serif; }

	:host-context(.linux) { font-family: system-ui, "Ubuntu", "Droid Sans", sans-serif; }
	:host-context(.linux:lang(zh-Hans)) { font-family: system-ui, "Ubuntu", "Droid Sans", "Source Han Sans SC", "Source Han Sans CN", "Source Han Sans", sans-serif; }
	:host-context(.linux:lang(zh-Hant)) { font-family: system-ui, "Ubuntu", "Droid Sans", "Source Han Sans TC", "Source Han Sans TW", "Source Han Sans", sans-serif; }
	:host-context(.linux:lang(ja)) { font-family: system-ui, "Ubuntu", "Droid Sans", "Source Han Sans J", "Source Han Sans JP", "Source Han Sans", sans-serif; }
	:host-context(.linux:lang(ko)) { font-family: system-ui, "Ubuntu", "Droid Sans", "Source Han Sans K", "Source Han Sans JR", "Source Han Sans", "UnDotum", "FBaekmuk Gulim", sans-serif; }
	${getContextViewMenuMotionCss(":host-context(.style-override.monaco-enable-motion)")}
`
);
export {
  AnchorAlignment2 as AnchorAlignment,
  AnchorAxisAlignment2 as AnchorAxisAlignment,
  AnchorPosition2 as AnchorPosition,
  CONTEXT_VIEW_CLOSE_ANIMATION_DURATION_VARIABLE,
  CONTEXT_VIEW_MENU_MOTION_ANCESTOR_CLASSES,
  CONTEXT_VIEW_MENU_MOTION_CLASS,
  CONTEXT_VIEW_MENU_MOTION_CLOSE_ANIMATION_DURATION,
  CONTEXT_VIEW_MENU_MOTION_CLOSING_CLASS,
  CONTEXT_VIEW_MENU_MOTION_SHADOW_VARIABLE,
  ContextView,
  ContextViewDOMPosition,
  contextViewMenuCloseAnimation,
  getAnchorRect,
  isAnchor
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFxicm93c2VyXFx1aVxcY29udGV4dHZpZXdcXGNvbnRleHR2aWV3LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQnJvd3NlckZlYXR1cmVzIH0gZnJvbSAnLi4vLi4vY2FuSVVzZS5qcyc7XG5pbXBvcnQgKiBhcyBET00gZnJvbSAnLi4vLi4vZG9tLmpzJztcbmltcG9ydCB7IGNyZWF0ZVN0eWxlU2hlZXQgfSBmcm9tICcuLi8uLi9kb21TdHlsZXNoZWV0cy5qcyc7XG5pbXBvcnQgeyBTdGFuZGFyZE1vdXNlRXZlbnQgfSBmcm9tICcuLi8uLi9tb3VzZUV2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgQW5jaG9yQWxpZ25tZW50LCBBbmNob3JBeGlzQWxpZ25tZW50LCBBbmNob3JQb3NpdGlvbiwgSVJlY3QsIGxheW91dDJkIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2xheW91dC5qcyc7XG5pbXBvcnQgKiBhcyBwbGF0Zm9ybSBmcm9tICcuLi8uLi8uLi9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgT21pdE9wdGlvbmFsIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCAnLi9jb250ZXh0dmlldy5jc3MnO1xuXG5leHBvcnQgeyBBbmNob3JBbGlnbm1lbnQsIEFuY2hvckF4aXNBbGlnbm1lbnQsIEFuY2hvclBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2xheW91dC5qcyc7XG5cbmV4cG9ydCBjb25zdCBlbnVtIENvbnRleHRWaWV3RE9NUG9zaXRpb24ge1xuXHRBQlNPTFVURSA9IDEsXG5cdEZJWEVELFxuXHRGSVhFRF9TSEFET1dcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQW5jaG9yIHtcblx0eDogbnVtYmVyO1xuXHR5OiBudW1iZXI7XG5cdHdpZHRoPzogbnVtYmVyO1xuXHRoZWlnaHQ/OiBudW1iZXI7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc0FuY2hvcihvYmo6IHVua25vd24pOiBvYmogaXMgSUFuY2hvciB8IE9taXRPcHRpb25hbDxJQW5jaG9yPiB7XG5cdGNvbnN0IGFuY2hvciA9IG9iaiBhcyBJQW5jaG9yIHwgT21pdE9wdGlvbmFsPElBbmNob3I+IHwgdW5kZWZpbmVkO1xuXG5cdHJldHVybiAhIWFuY2hvciAmJiB0eXBlb2YgYW5jaG9yLnggPT09ICdudW1iZXInICYmIHR5cGVvZiBhbmNob3IueSA9PT0gJ251bWJlcic7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSURlbGVnYXRlIHtcblx0LyoqXG5cdCAqIFRoZSBhbmNob3Igd2hlcmUgdG8gcG9zaXRpb24gdGhlIGNvbnRleHQgdmlldy5cblx0ICogVXNlIGEgYEhUTUxFbGVtZW50YCB0byBwb3NpdGlvbiB0aGUgdmlldyBhdCB0aGUgZWxlbWVudCxcblx0ICogYSBgU3RhbmRhcmRNb3VzZUV2ZW50YCB0byBwb3NpdGlvbiBpdCBhdCB0aGUgbW91c2UgcG9zaXRpb25cblx0ICogb3IgYW4gYElBbmNob3JgIHRvIHBvc2l0aW9uIGl0IGF0IGEgc3BlY2lmaWMgbG9jYXRpb24uXG5cdCAqL1xuXHRnZXRBbmNob3IoKTogSFRNTEVsZW1lbnQgfCBTdGFuZGFyZE1vdXNlRXZlbnQgfCBJQW5jaG9yO1xuXHRyZW5kZXIoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IElEaXNwb3NhYmxlIHwgbnVsbDtcblx0Zm9jdXM/KCk6IHZvaWQ7XG5cdGxheW91dD8oKTogdm9pZDtcblx0YW5jaG9yQWxpZ25tZW50PzogQW5jaG9yQWxpZ25tZW50OyAvLyBkZWZhdWx0OiBsZWZ0XG5cdGFuY2hvclBvc2l0aW9uPzogQW5jaG9yUG9zaXRpb247IC8vIGRlZmF1bHQ6IGJlbG93XG5cdGFuY2hvckF4aXNBbGlnbm1lbnQ/OiBBbmNob3JBeGlzQWxpZ25tZW50OyAvLyBkZWZhdWx0OiB2ZXJ0aWNhbFxuXHRjYW5SZWxheW91dD86IGJvb2xlYW47IC8vIGRlZmF1bHQ6IHRydWVcblx0b25ET01FdmVudD8oZTogRXZlbnQsIGFjdGl2ZUVsZW1lbnQ6IEhUTUxFbGVtZW50KTogdm9pZDtcblx0b25IaWRlPyhkYXRhPzogdW5rbm93bik6IHZvaWQ7XG5cdGNsb3NlQW5pbWF0aW9uPzogSUNvbnRleHRWaWV3Q2xvc2VBbmltYXRpb247XG5cblx0LyoqXG5cdCAqIGNvbnRleHQgdmlld3Mgd2l0aCBoaWdoZXIgbGF5ZXJzIGFyZSByZW5kZXJlZCBoaWdoZXIgaW4gei1pbmRleCBvcmRlclxuXHQgKi9cblx0bGF5ZXI/OiBudW1iZXI7IC8vIERlZmF1bHQ6IDBcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ29udGV4dFZpZXdDbG9zZUFuaW1hdGlvbiB7XG5cdHJlYWRvbmx5IGNsYXNzTmFtZTogc3RyaW5nO1xuXHRyZWFkb25seSBkdXJhdGlvbjogbnVtYmVyO1xuXHRyZWFkb25seSByZXF1aXJlZEFuY2VzdG9yQ2xhc3Nlcz86IHJlYWRvbmx5IHN0cmluZ1tdO1xufVxuXG5leHBvcnQgY29uc3QgQ09OVEVYVF9WSUVXX01FTlVfTU9USU9OX0NMQVNTID0gJ2NvbnRleHQtdmlldy1tZW51LW1vdGlvbic7XG5leHBvcnQgY29uc3QgQ09OVEVYVF9WSUVXX01FTlVfTU9USU9OX0NMT1NJTkdfQ0xBU1MgPSAnY29udGV4dC12aWV3LW1lbnUtbW90aW9uLWNsb3NpbmcnO1xuZXhwb3J0IGNvbnN0IENPTlRFWFRfVklFV19NRU5VX01PVElPTl9DTE9TRV9BTklNQVRJT05fRFVSQVRJT04gPSAxNTA7XG5leHBvcnQgY29uc3QgQ09OVEVYVF9WSUVXX01FTlVfTU9USU9OX0FOQ0VTVE9SX0NMQVNTRVMgPSBbJ3N0eWxlLW92ZXJyaWRlJywgJ21vbmFjby1lbmFibGUtbW90aW9uJ10gYXMgY29uc3Q7XG5leHBvcnQgY29uc3QgQ09OVEVYVF9WSUVXX0NMT1NFX0FOSU1BVElPTl9EVVJBVElPTl9WQVJJQUJMRSA9ICctLXZzY29kZS1jb250ZXh0LXZpZXctY2xvc2UtYW5pbWF0aW9uLWR1cmF0aW9uJztcbmV4cG9ydCBjb25zdCBDT05URVhUX1ZJRVdfTUVOVV9NT1RJT05fU0hBRE9XX1ZBUklBQkxFID0gJy0tdnNjb2RlLWNvbnRleHQtdmlldy1tZW51LW1vdGlvbi1zaGFkb3cnO1xuY29uc3QgQ09OVEVYVF9WSUVXX01FTlVfTU9USU9OX0NMT1NFX1NUQVJUX09QQUNJVFlfVkFSSUFCTEUgPSAnLS12c2NvZGUtY29udGV4dC12aWV3LW1lbnUtbW90aW9uLWNsb3NlLXN0YXJ0LW9wYWNpdHknO1xuY29uc3QgQ09OVEVYVF9WSUVXX01FTlVfTU9USU9OX0NMT1NFX1NUQVJUX1RSQU5TRk9STV9WQVJJQUJMRSA9ICctLXZzY29kZS1jb250ZXh0LXZpZXctbWVudS1tb3Rpb24tY2xvc2Utc3RhcnQtdHJhbnNmb3JtJztcblxuY29uc3QgQ09OVEVYVF9WSUVXX01FTlVfTU9USU9OX09QRU5fRFVSQVRJT05fTVMgPSAyNTA7XG5jb25zdCBDT05URVhUX1ZJRVdfTUVOVV9NT1RJT05fRUFTSU5HID0gJ2N1YmljLWJlemllcigwLjIyLCAxLCAwLjM2LCAxKSc7XG5cbmV4cG9ydCBjb25zdCBjb250ZXh0Vmlld01lbnVDbG9zZUFuaW1hdGlvbjogSUNvbnRleHRWaWV3Q2xvc2VBbmltYXRpb24gPSB7XG5cdGNsYXNzTmFtZTogQ09OVEVYVF9WSUVXX01FTlVfTU9USU9OX0NMT1NJTkdfQ0xBU1MsXG5cdGR1cmF0aW9uOiBDT05URVhUX1ZJRVdfTUVOVV9NT1RJT05fQ0xPU0VfQU5JTUFUSU9OX0RVUkFUSU9OLFxuXHRyZXF1aXJlZEFuY2VzdG9yQ2xhc3NlczogQ09OVEVYVF9WSUVXX01FTlVfTU9USU9OX0FOQ0VTVE9SX0NMQVNTRVMsXG59O1xuXG5mdW5jdGlvbiBnZXRDb250ZXh0Vmlld01lbnVNb3Rpb25Dc3MoZW5hYmxlZFNlbGVjdG9yUHJlZml4OiBzdHJpbmcpOiBzdHJpbmcge1xuXHRyZXR1cm4gLyogY3NzICovIGBcblx0JHtlbmFibGVkU2VsZWN0b3JQcmVmaXh9IC5jb250ZXh0LXZpZXcuJHtDT05URVhUX1ZJRVdfTUVOVV9NT1RJT05fQ0xBU1N9IHtcblx0XHRhbmltYXRpb246IG5vbmU7XG5cdFx0Ym94LXNoYWRvdzogbm9uZTtcblx0XHRvdmVyZmxvdzogdmlzaWJsZTtcblx0fVxuXG5cdCR7ZW5hYmxlZFNlbGVjdG9yUHJlZml4fSAuY29udGV4dC12aWV3LiR7Q09OVEVYVF9WSUVXX01FTlVfTU9USU9OX0NMQVNTfSA+IC5tb25hY28tc2Nyb2xsYWJsZS1lbGVtZW50IHtcblx0XHRhbmltYXRpb246IGNvbnRleHQtdmlldy1tZW51LW1vdGlvbi1vcGVuICR7Q09OVEVYVF9WSUVXX01FTlVfTU9USU9OX09QRU5fRFVSQVRJT05fTVN9bXMgJHtDT05URVhUX1ZJRVdfTUVOVV9NT1RJT05fRUFTSU5HfSBiYWNrd2FyZHM7XG5cdFx0Ym94LXNoYWRvdzogdmFyKCR7Q09OVEVYVF9WSUVXX01FTlVfTU9USU9OX1NIQURPV19WQVJJQUJMRX0pO1xuXHRcdHRyYW5zZm9ybS1vcmlnaW46IHRvcCBsZWZ0O1xuXHRcdHdpbGwtY2hhbmdlOiBvcGFjaXR5O1xuXHR9XG5cblx0JHtlbmFibGVkU2VsZWN0b3JQcmVmaXh9IC5jb250ZXh0LXZpZXcuJHtDT05URVhUX1ZJRVdfTUVOVV9NT1RJT05fQ0xBU1N9LnJpZ2h0ID4gLm1vbmFjby1zY3JvbGxhYmxlLWVsZW1lbnQge1xuXHRcdHRyYW5zZm9ybS1vcmlnaW46IHRvcCByaWdodDtcblx0fVxuXG5cdCR7ZW5hYmxlZFNlbGVjdG9yUHJlZml4fSAuY29udGV4dC12aWV3LiR7Q09OVEVYVF9WSUVXX01FTlVfTU9USU9OX0NMQVNTfS50b3AgPiAubW9uYWNvLXNjcm9sbGFibGUtZWxlbWVudCB7XG5cdFx0dHJhbnNmb3JtLW9yaWdpbjogYm90dG9tIGxlZnQ7XG5cdH1cblxuXHQke2VuYWJsZWRTZWxlY3RvclByZWZpeH0gLmNvbnRleHQtdmlldy4ke0NPTlRFWFRfVklFV19NRU5VX01PVElPTl9DTEFTU30udG9wLnJpZ2h0ID4gLm1vbmFjby1zY3JvbGxhYmxlLWVsZW1lbnQge1xuXHRcdHRyYW5zZm9ybS1vcmlnaW46IGJvdHRvbSByaWdodDtcblx0fVxuXG5cdCR7ZW5hYmxlZFNlbGVjdG9yUHJlZml4fSAuY29udGV4dC12aWV3LiR7Q09OVEVYVF9WSUVXX01FTlVfTU9USU9OX0NMQVNTfS4ke0NPTlRFWFRfVklFV19NRU5VX01PVElPTl9DTE9TSU5HX0NMQVNTfSA+IC5tb25hY28tc2Nyb2xsYWJsZS1lbGVtZW50IHtcblx0XHRhbmltYXRpb246IGNvbnRleHQtdmlldy1tZW51LW1vdGlvbi1jbG9zZSB2YXIoJHtDT05URVhUX1ZJRVdfQ0xPU0VfQU5JTUFUSU9OX0RVUkFUSU9OX1ZBUklBQkxFfSkgJHtDT05URVhUX1ZJRVdfTUVOVV9NT1RJT05fRUFTSU5HfSBib3RoO1xuXHRcdHBvaW50ZXItZXZlbnRzOiBub25lO1xuXHR9XG5cblx0QGtleWZyYW1lcyBjb250ZXh0LXZpZXctbWVudS1tb3Rpb24tb3BlbiB7XG5cdFx0MCUge1xuXHRcdFx0b3BhY2l0eTogMDtcblx0XHRcdHRyYW5zZm9ybTogc2NhbGUoMC45Nyk7XG5cdFx0fVxuXG5cdFx0MTAwJSB7XG5cdFx0XHRvcGFjaXR5OiAxO1xuXHRcdFx0dHJhbnNmb3JtOiBzY2FsZSgxKTtcblx0XHR9XG5cdH1cblxuXHRAa2V5ZnJhbWVzIGNvbnRleHQtdmlldy1tZW51LW1vdGlvbi1jbG9zZSB7XG5cdFx0MCUge1xuXHRcdFx0b3BhY2l0eTogdmFyKCR7Q09OVEVYVF9WSUVXX01FTlVfTU9USU9OX0NMT1NFX1NUQVJUX09QQUNJVFlfVkFSSUFCTEV9LCAxKTtcblx0XHRcdHRyYW5zZm9ybTogdmFyKCR7Q09OVEVYVF9WSUVXX01FTlVfTU9USU9OX0NMT1NFX1NUQVJUX1RSQU5TRk9STV9WQVJJQUJMRX0sIHNjYWxlKDEpKTtcblx0XHR9XG5cblx0XHQxMDAlIHtcblx0XHRcdG9wYWNpdHk6IDA7XG5cdFx0XHR0cmFuc2Zvcm06IHNjYWxlKDAuOTkpO1xuXHRcdH1cblx0fWA7XG59XG5cbmxldCBjb250ZXh0Vmlld01lbnVNb3Rpb25TdHlsZVNoZWV0OiBIVE1MU3R5bGVFbGVtZW50IHwgdW5kZWZpbmVkO1xuXG5mdW5jdGlvbiBlbnN1cmVDb250ZXh0Vmlld01lbnVNb3Rpb25TdHlsZVNoZWV0KCk6IHZvaWQge1xuXHRpZiAoIWNvbnRleHRWaWV3TWVudU1vdGlvblN0eWxlU2hlZXQpIHtcblx0XHRjb250ZXh0Vmlld01lbnVNb3Rpb25TdHlsZVNoZWV0ID0gY3JlYXRlU3R5bGVTaGVldCh1bmRlZmluZWQsIHN0eWxlID0+IHtcblx0XHRcdHN0eWxlLnRleHRDb250ZW50ID0gZ2V0Q29udGV4dFZpZXdNZW51TW90aW9uQ3NzKCcuc3R5bGUtb3ZlcnJpZGUubW9uYWNvLWVuYWJsZS1tb3Rpb24nKTtcblx0XHR9KTtcblx0fVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElDb250ZXh0Vmlld1Byb3ZpZGVyIHtcblx0c2hvd0NvbnRleHRWaWV3KGRlbGVnYXRlOiBJRGVsZWdhdGUsIGNvbnRhaW5lcj86IEhUTUxFbGVtZW50KTogdm9pZDtcblx0aGlkZUNvbnRleHRWaWV3KCk6IHZvaWQ7XG5cdGxheW91dCgpOiB2b2lkO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0QW5jaG9yUmVjdChhbmNob3I6IEhUTUxFbGVtZW50IHwgU3RhbmRhcmRNb3VzZUV2ZW50IHwgSUFuY2hvcik6IElSZWN0IHtcblx0Ly8gR2V0IHRoZSBlbGVtZW50J3MgcG9zaXRpb24gYW5kIHNpemUgKHRvIGFuY2hvciB0aGUgdmlldylcblx0aWYgKERPTS5pc0hUTUxFbGVtZW50KGFuY2hvcikpIHtcblx0XHRjb25zdCBlbGVtZW50UG9zaXRpb24gPSBET00uZ2V0RG9tTm9kZVBhZ2VQb3NpdGlvbihhbmNob3IpO1xuXG5cdFx0Ly8gSW4gYXJlYXMgd2hlcmUgem9vbSBpcyBhcHBsaWVkIHRvIHRoZSBlbGVtZW50IG9yIGl0cyBhbmNlc3RvcnMsIHdlIG5lZWQgdG8gYWRqdXN0IHRoZSBzaXplIG9mIHRoZSBlbGVtZW50XG5cdFx0Ly8gZS5nLiBUaGUgdGl0bGUgYmFyIGhhcyBjb3VudGVyIHpvb20gYmVoYXZpb3IgbWVhbmluZyBpdCBhcHBsaWVzIHRoZSBpbnZlcnNlIG9mIHpvb20gbGV2ZWwuXG5cdFx0Ly8gV2luZG93IFpvb20gTGV2ZWw6IDEuNSwgVGl0bGUgQmFyIFpvb206IDEvMS41LCBTaXplIE11bHRpcGxpZXI6IDEuNVxuXHRcdGNvbnN0IHpvb20gPSBET00uZ2V0RG9tTm9kZVpvb21MZXZlbChhbmNob3IpO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdHRvcDogZWxlbWVudFBvc2l0aW9uLnRvcCAqIHpvb20sXG5cdFx0XHRsZWZ0OiBlbGVtZW50UG9zaXRpb24ubGVmdCAqIHpvb20sXG5cdFx0XHR3aWR0aDogZWxlbWVudFBvc2l0aW9uLndpZHRoICogem9vbSxcblx0XHRcdGhlaWdodDogZWxlbWVudFBvc2l0aW9uLmhlaWdodCAqIHpvb21cblx0XHR9O1xuXHR9IGVsc2UgaWYgKGlzQW5jaG9yKGFuY2hvcikpIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0dG9wOiBhbmNob3IueSxcblx0XHRcdGxlZnQ6IGFuY2hvci54LFxuXHRcdFx0d2lkdGg6IGFuY2hvci53aWR0aCB8fCAxLFxuXHRcdFx0aGVpZ2h0OiBhbmNob3IuaGVpZ2h0IHx8IDJcblx0XHR9O1xuXHR9IGVsc2Uge1xuXHRcdHJldHVybiB7XG5cdFx0XHR0b3A6IGFuY2hvci5wb3N5LFxuXHRcdFx0bGVmdDogYW5jaG9yLnBvc3gsXG5cdFx0XHQvLyBXZSBhcmUgYWJvdXQgdG8gcG9zaXRpb24gdGhlIGNvbnRleHQgdmlldyB3aGVyZSB0aGUgbW91c2Vcblx0XHRcdC8vIGN1cnNvciBpcy4gVG8gcHJldmVudCB0aGUgdmlldyBiZWluZyBleGFjdGx5IHVuZGVyIHRoZSBtb3VzZVxuXHRcdFx0Ly8gd2hlbiBzaG93aW5nIGFuZCB0aHVzIHBvdGVudGlhbGx5IHRyaWdnZXJpbmcgYW4gYWN0aW9uIHdpdGhpbixcblx0XHRcdC8vIHdlIHRyZWF0IHRoZSBtb3VzZSBsb2NhdGlvbiBsaWtlIGEgc21hbGwgc2l6ZWQgYmxvY2sgZWxlbWVudC5cblx0XHRcdHdpZHRoOiAyLFxuXHRcdFx0aGVpZ2h0OiAyXG5cdFx0fTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQ29udGV4dFZpZXcgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBCVUJCTEVfVVBfRVZFTlRTID0gWydjbGljaycsICdrZXlkb3duJywgJ2ZvY3VzJywgJ2JsdXInXTtcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgQlVCQkxFX0RPV05fRVZFTlRTID0gWydjbGljayddO1xuXG5cdHByaXZhdGUgY29udGFpbmVyOiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xuXHRwcml2YXRlIHZpZXc6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHVzZUZpeGVkUG9zaXRpb24gPSBmYWxzZTtcblx0cHJpdmF0ZSB1c2VTaGFkb3dET00gPSBmYWxzZTtcblx0cHJpdmF0ZSBkZWxlZ2F0ZTogSURlbGVnYXRlIHwgbnVsbCA9IG51bGw7XG5cdHByaXZhdGUgdG9EaXNwb3NlT25DbGVhbjogSURpc3Bvc2FibGUgPSBEaXNwb3NhYmxlLk5vbmU7XG5cdHByaXZhdGUgdG9EaXNwb3NlT25TZXRDb250YWluZXI6IElEaXNwb3NhYmxlID0gRGlzcG9zYWJsZS5Ob25lO1xuXHRwcml2YXRlIGhpZGluZ0NvbnRleHRWaWV3OiB7IHJlYWRvbmx5IGRpc3Bvc2FibGU6IElEaXNwb3NhYmxlOyByZWFkb25seSB0b0Rpc3Bvc2U6IElEaXNwb3NhYmxlOyByZWFkb25seSBjbGFzc05hbWU6IHN0cmluZyB9IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHNoYWRvd1Jvb3Q6IFNoYWRvd1Jvb3QgfCBudWxsID0gbnVsbDtcblx0cHJpdmF0ZSBzaGFkb3dSb290SG9zdEVsZW1lbnQ6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG5cblx0Y29uc3RydWN0b3IoY29udGFpbmVyOiBIVE1MRWxlbWVudCwgZG9tUG9zaXRpb246IENvbnRleHRWaWV3RE9NUG9zaXRpb24pIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0ZW5zdXJlQ29udGV4dFZpZXdNZW51TW90aW9uU3R5bGVTaGVldCgpO1xuXG5cdFx0dGhpcy52aWV3ID0gRE9NLiQoJy5jb250ZXh0LXZpZXcnKTtcblx0XHRET00uaGlkZSh0aGlzLnZpZXcpO1xuXG5cdFx0dGhpcy5zZXRDb250YWluZXIoY29udGFpbmVyLCBkb21Qb3NpdGlvbik7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IHRoaXMuc2V0Q29udGFpbmVyKG51bGwsIENvbnRleHRWaWV3RE9NUG9zaXRpb24uQUJTT0xVVEUpKSk7XG5cdH1cblxuXHRzZXRDb250YWluZXIoY29udGFpbmVyOiBIVE1MRWxlbWVudCB8IG51bGwsIGRvbVBvc2l0aW9uOiBDb250ZXh0Vmlld0RPTVBvc2l0aW9uKTogdm9pZCB7XG5cdFx0dGhpcy51c2VGaXhlZFBvc2l0aW9uID0gZG9tUG9zaXRpb24gIT09IENvbnRleHRWaWV3RE9NUG9zaXRpb24uQUJTT0xVVEU7XG5cdFx0Y29uc3QgdXNlZFNoYWRvd0RPTSA9IHRoaXMudXNlU2hhZG93RE9NO1xuXHRcdHRoaXMudXNlU2hhZG93RE9NID0gZG9tUG9zaXRpb24gPT09IENvbnRleHRWaWV3RE9NUG9zaXRpb24uRklYRURfU0hBRE9XO1xuXG5cdFx0aWYgKGNvbnRhaW5lciA9PT0gdGhpcy5jb250YWluZXIgJiYgdXNlZFNoYWRvd0RPTSA9PT0gdGhpcy51c2VTaGFkb3dET00pIHtcblx0XHRcdHJldHVybjsgLy8gY29udGFpbmVyIGlzIHRoZSBzYW1lIGFuZCBubyBzaGFkb3cgRE9NIHVzYWdlIGhhcyBjaGFuZ2VkXG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuY29udGFpbmVyKSB7XG5cdFx0XHR0aGlzLnRvRGlzcG9zZU9uU2V0Q29udGFpbmVyLmRpc3Bvc2UoKTtcblxuXHRcdFx0dGhpcy52aWV3LnJlbW92ZSgpO1xuXHRcdFx0aWYgKHRoaXMuc2hhZG93Um9vdCkge1xuXHRcdFx0XHR0aGlzLnNoYWRvd1Jvb3QgPSBudWxsO1xuXHRcdFx0XHR0aGlzLnNoYWRvd1Jvb3RIb3N0RWxlbWVudD8ucmVtb3ZlKCk7XG5cdFx0XHRcdHRoaXMuc2hhZG93Um9vdEhvc3RFbGVtZW50ID0gbnVsbDtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5jb250YWluZXIgPSBudWxsO1xuXHRcdH1cblxuXHRcdGlmIChjb250YWluZXIpIHtcblx0XHRcdHRoaXMuY29udGFpbmVyID0gY29udGFpbmVyO1xuXG5cdFx0XHRpZiAodGhpcy51c2VTaGFkb3dET00pIHtcblx0XHRcdFx0dGhpcy5zaGFkb3dSb290SG9zdEVsZW1lbnQgPSBET00uJCgnLnNoYWRvdy1yb290LWhvc3QnKTtcblx0XHRcdFx0dGhpcy5jb250YWluZXIuYXBwZW5kQ2hpbGQodGhpcy5zaGFkb3dSb290SG9zdEVsZW1lbnQpO1xuXHRcdFx0XHR0aGlzLnNoYWRvd1Jvb3QgPSB0aGlzLnNoYWRvd1Jvb3RIb3N0RWxlbWVudC5hdHRhY2hTaGFkb3coeyBtb2RlOiAnb3BlbicgfSk7XG5cdFx0XHRcdGNvbnN0IHN0eWxlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3R5bGUnKTtcblx0XHRcdFx0c3R5bGUudGV4dENvbnRlbnQgPSBTSEFET1dfUk9PVF9DU1M7XG5cdFx0XHRcdHRoaXMuc2hhZG93Um9vdC5hcHBlbmRDaGlsZChzdHlsZSk7XG5cdFx0XHRcdHRoaXMuc2hhZG93Um9vdC5hcHBlbmRDaGlsZCh0aGlzLnZpZXcpO1xuXHRcdFx0XHR0aGlzLnNoYWRvd1Jvb3QuYXBwZW5kQ2hpbGQoRE9NLiQoJ3Nsb3QnKSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLmNvbnRhaW5lci5hcHBlbmRDaGlsZCh0aGlzLnZpZXcpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCB0b0Rpc3Bvc2VPblNldENvbnRhaW5lciA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRcdFx0Q29udGV4dFZpZXcuQlVCQkxFX1VQX0VWRU5UUy5mb3JFYWNoKGV2ZW50ID0+IHtcblx0XHRcdFx0dG9EaXNwb3NlT25TZXRDb250YWluZXIuYWRkKERPTS5hZGRTdGFuZGFyZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLmNvbnRhaW5lciEsIGV2ZW50LCBlID0+IHtcblx0XHRcdFx0XHR0aGlzLm9uRE9NRXZlbnQoZSwgZmFsc2UpO1xuXHRcdFx0XHR9KSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0Q29udGV4dFZpZXcuQlVCQkxFX0RPV05fRVZFTlRTLmZvckVhY2goZXZlbnQgPT4ge1xuXHRcdFx0XHR0b0Rpc3Bvc2VPblNldENvbnRhaW5lci5hZGQoRE9NLmFkZFN0YW5kYXJkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuY29udGFpbmVyISwgZXZlbnQsIGUgPT4ge1xuXHRcdFx0XHRcdHRoaXMub25ET01FdmVudChlLCB0cnVlKTtcblx0XHRcdFx0fSwgdHJ1ZSkpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRoaXMudG9EaXNwb3NlT25TZXRDb250YWluZXIgPSB0b0Rpc3Bvc2VPblNldENvbnRhaW5lcjtcblx0XHR9XG5cdH1cblxuXHRzaG93KGRlbGVnYXRlOiBJRGVsZWdhdGUpOiB2b2lkIHtcblx0XHR0aGlzLmNvbXBsZXRlSGlkZUFuaW1hdGlvbigpO1xuXG5cdFx0aWYgKHRoaXMuaXNWaXNpYmxlKCkpIHtcblx0XHRcdHRoaXMuaGlkZSh1bmRlZmluZWQsIHRydWUpO1xuXHRcdH1cblxuXHRcdC8vIFNob3cgc3RhdGljIGJveFxuXHRcdERPTS5jbGVhck5vZGUodGhpcy52aWV3KTtcblx0XHR0aGlzLnZpZXcuY2xhc3NOYW1lID0gJ2NvbnRleHQtdmlldyBtb25hY28tY29tcG9uZW50Jztcblx0XHR0aGlzLnZpZXcuc3R5bGUudG9wID0gJzBweCc7XG5cdFx0dGhpcy52aWV3LnN0eWxlLmxlZnQgPSAnMHB4Jztcblx0XHR0aGlzLnZpZXcuc3R5bGUuekluZGV4ID0gYCR7MjU3NSArIChkZWxlZ2F0ZS5sYXllciA/PyAwKX1gO1xuXHRcdHRoaXMudmlldy5zdHlsZS5wb3NpdGlvbiA9IHRoaXMudXNlRml4ZWRQb3NpdGlvbiA/ICdmaXhlZCcgOiAnYWJzb2x1dGUnO1xuXHRcdERPTS5zaG93KHRoaXMudmlldyk7XG5cblx0XHQvLyBSZW5kZXIgY29udGVudFxuXHRcdHRoaXMudG9EaXNwb3NlT25DbGVhbiA9IGRlbGVnYXRlLnJlbmRlcih0aGlzLnZpZXcpIHx8IERpc3Bvc2FibGUuTm9uZTtcblxuXHRcdC8vIFNldCBhY3RpdmUgZGVsZWdhdGVcblx0XHR0aGlzLmRlbGVnYXRlID0gZGVsZWdhdGU7XG5cblx0XHQvLyBMYXlvdXRcblx0XHR0aGlzLmRvTGF5b3V0KCk7XG5cblx0XHQvLyBGb2N1c1xuXHRcdHRoaXMuZGVsZWdhdGUuZm9jdXM/LigpO1xuXHR9XG5cblx0Z2V0Vmlld0VsZW1lbnQoKTogSFRNTEVsZW1lbnQge1xuXHRcdHJldHVybiB0aGlzLnZpZXc7XG5cdH1cblxuXHRsYXlvdXQoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmlzVmlzaWJsZSgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuZGVsZWdhdGUhLmNhblJlbGF5b3V0ID09PSBmYWxzZSAmJiAhKHBsYXRmb3JtLmlzSU9TICYmIEJyb3dzZXJGZWF0dXJlcy5wb2ludGVyRXZlbnRzKSkge1xuXHRcdFx0dGhpcy5oaWRlKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5kZWxlZ2F0ZT8ubGF5b3V0Py4oKTtcblxuXHRcdHRoaXMuZG9MYXlvdXQoKTtcblx0fVxuXG5cdHByaXZhdGUgZG9MYXlvdXQoKTogdm9pZCB7XG5cdFx0Ly8gQ2hlY2sgdGhhdCB3ZSBzdGlsbCBoYXZlIGEgZGVsZWdhdGUgLSB0aGlzLmRlbGVnYXRlLmxheW91dCBtYXkgaGF2ZSBoaWRkZW5cblx0XHRpZiAoIXRoaXMuaXNWaXNpYmxlKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBHZXQgYW5jaG9yXG5cdFx0Y29uc3QgYW5jaG9yID0gZ2V0QW5jaG9yUmVjdCh0aGlzLmRlbGVnYXRlIS5nZXRBbmNob3IoKSk7XG5cdFx0Y29uc3QgY29udGFpbmVyV2luZG93ID0gdGhpcy5jb250YWluZXIgPyBET00uZ2V0V2luZG93KHRoaXMuY29udGFpbmVyKSA6IERPTS5nZXRBY3RpdmVXaW5kb3coKTtcblx0XHRjb25zdCB2aWV3cG9ydCA9IHsgdG9wOiBjb250YWluZXJXaW5kb3cucGFnZVlPZmZzZXQsIGxlZnQ6IGNvbnRhaW5lcldpbmRvdy5wYWdlWE9mZnNldCwgd2lkdGg6IGNvbnRhaW5lcldpbmRvdy5pbm5lcldpZHRoLCBoZWlnaHQ6IGNvbnRhaW5lcldpbmRvdy5pbm5lckhlaWdodCB9O1xuXHRcdHRoaXMudmlldy5jbGFzc0xpc3QudG9nZ2xlKCdmaXhlZCcsIHRoaXMudXNlRml4ZWRQb3NpdGlvbik7XG5cdFx0dGhpcy52aWV3LnN0eWxlLnRvcCA9ICcwcHgnO1xuXHRcdHRoaXMudmlldy5zdHlsZS5sZWZ0ID0gJzBweCc7XG5cdFx0Y29uc3QgcG9zaXRpb25pbmdPcmlnaW4gPSBET00uZ2V0RG9tTm9kZVBhZ2VQb3NpdGlvbih0aGlzLnZpZXcpO1xuXHRcdGNvbnN0IHZpZXcgPSB7IHdpZHRoOiBET00uZ2V0VG90YWxXaWR0aCh0aGlzLnZpZXcpLCBoZWlnaHQ6IERPTS5nZXRUb3RhbEhlaWdodCh0aGlzLnZpZXcpIH07XG5cdFx0Y29uc3QgYW5jaG9yUG9zaXRpb24gPSB0aGlzLmRlbGVnYXRlIS5hbmNob3JQb3NpdGlvbjtcblx0XHRjb25zdCBhbmNob3JBbGlnbm1lbnQgPSB0aGlzLmRlbGVnYXRlIS5hbmNob3JBbGlnbm1lbnQ7XG5cdFx0Y29uc3QgYW5jaG9yQXhpc0FsaWdubWVudCA9IHRoaXMuZGVsZWdhdGUhLmFuY2hvckF4aXNBbGlnbm1lbnQ7XG5cdFx0Y29uc3QgbGF5b3V0UmVzdWx0ID0gbGF5b3V0MmQodmlld3BvcnQsIHZpZXcsIGFuY2hvciwgeyBhbmNob3JBbGlnbm1lbnQsIGFuY2hvclBvc2l0aW9uLCBhbmNob3JBeGlzQWxpZ25tZW50IH0pO1xuXHRcdGNvbnN0IHsgdG9wLCBsZWZ0IH0gPSBsYXlvdXRSZXN1bHQ7XG5cblx0XHR0aGlzLnZpZXcuY2xhc3NMaXN0LnJlbW92ZSgndG9wJywgJ2JvdHRvbScsICdsZWZ0JywgJ3JpZ2h0Jyk7XG5cdFx0dGhpcy52aWV3LmNsYXNzTGlzdC5hZGQobGF5b3V0UmVzdWx0LmFuY2hvclBvc2l0aW9uID09PSBBbmNob3JQb3NpdGlvbi5CRUxPVyA/ICdib3R0b20nIDogJ3RvcCcpO1xuXHRcdHRoaXMudmlldy5jbGFzc0xpc3QuYWRkKGxheW91dFJlc3VsdC5hbmNob3JBbGlnbm1lbnQgPT09IEFuY2hvckFsaWdubWVudC5MRUZUID8gJ2xlZnQnIDogJ3JpZ2h0Jyk7XG5cblx0XHR0aGlzLnZpZXcuc3R5bGUudG9wID0gYCR7dG9wIC0gcG9zaXRpb25pbmdPcmlnaW4udG9wfXB4YDtcblx0XHR0aGlzLnZpZXcuc3R5bGUubGVmdCA9IGAke2xlZnQgLSBwb3NpdGlvbmluZ09yaWdpbi5sZWZ0fXB4YDtcblx0XHR0aGlzLnZpZXcuc3R5bGUud2lkdGggPSAnaW5pdGlhbCc7XG5cdH1cblxuXHRoaWRlKGRhdGE/OiB1bmtub3duLCBza2lwQW5pbWF0aW9uID0gZmFsc2UpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5oaWRpbmdDb250ZXh0Vmlldykge1xuXHRcdFx0aWYgKHNraXBBbmltYXRpb24pIHtcblx0XHRcdFx0dGhpcy5jb21wbGV0ZUhpZGVBbmltYXRpb24oKTtcblx0XHRcdH1cblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBkZWxlZ2F0ZSA9IHRoaXMuZGVsZWdhdGU7XG5cdFx0dGhpcy5kZWxlZ2F0ZSA9IG51bGw7XG5cblx0XHRpZiAoIWRlbGVnYXRlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgdG9EaXNwb3NlID0gdGhpcy50b0Rpc3Bvc2VPbkNsZWFuO1xuXHRcdHRoaXMudG9EaXNwb3NlT25DbGVhbiA9IERpc3Bvc2FibGUuTm9uZTtcblxuXHRcdGRlbGVnYXRlLm9uSGlkZT8uKGRhdGEpO1xuXG5cdFx0Y29uc3QgY2xvc2VBbmltYXRpb24gPSBkZWxlZ2F0ZS5jbG9zZUFuaW1hdGlvbjtcblx0XHRpZiAoIXNraXBBbmltYXRpb24gJiYgY2xvc2VBbmltYXRpb24gJiYgY2xvc2VBbmltYXRpb24uZHVyYXRpb24gPiAwICYmIHRoaXMuaGFzUmVxdWlyZWRBbmNlc3RvckNsYXNzZXMoY2xvc2VBbmltYXRpb24ucmVxdWlyZWRBbmNlc3RvckNsYXNzZXMpKSB7XG5cdFx0XHR0aGlzLnZpZXcuc3R5bGUuc2V0UHJvcGVydHkoQ09OVEVYVF9WSUVXX0NMT1NFX0FOSU1BVElPTl9EVVJBVElPTl9WQVJJQUJMRSwgYCR7Y2xvc2VBbmltYXRpb24uZHVyYXRpb259bXNgKTtcblx0XHRcdHRoaXMucHJlcGFyZU1lbnVDbG9zZUFuaW1hdGlvbigpO1xuXHRcdFx0dGhpcy52aWV3LmluZXJ0ID0gdHJ1ZTtcblx0XHRcdHRoaXMudmlldy5jbGFzc0xpc3QuYWRkKGNsb3NlQW5pbWF0aW9uLmNsYXNzTmFtZSk7XG5cdFx0XHRjb25zdCB0aW1lb3V0ID0gc2V0VGltZW91dCgoKSA9PiB0aGlzLmNvbXBsZXRlSGlkZUFuaW1hdGlvbigpLCBjbG9zZUFuaW1hdGlvbi5kdXJhdGlvbik7XG5cdFx0XHR0aGlzLmhpZGluZ0NvbnRleHRWaWV3ID0ge1xuXHRcdFx0XHRkaXNwb3NhYmxlOiB0b0Rpc3Bvc2FibGUoKCkgPT4gY2xlYXJUaW1lb3V0KHRpbWVvdXQpKSxcblx0XHRcdFx0dG9EaXNwb3NlLFxuXHRcdFx0XHRjbGFzc05hbWU6IGNsb3NlQW5pbWF0aW9uLmNsYXNzTmFtZVxuXHRcdFx0fTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0b0Rpc3Bvc2UuZGlzcG9zZSgpO1xuXHRcdERPTS5oaWRlKHRoaXMudmlldyk7XG5cdH1cblxuXHRwcml2YXRlIGlzVmlzaWJsZSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gISF0aGlzLmRlbGVnYXRlO1xuXHR9XG5cblx0cHJpdmF0ZSBjb21wbGV0ZUhpZGVBbmltYXRpb24oKTogdm9pZCB7XG5cdFx0Y29uc3QgaGlkaW5nQ29udGV4dFZpZXcgPSB0aGlzLmhpZGluZ0NvbnRleHRWaWV3O1xuXHRcdGlmICghaGlkaW5nQ29udGV4dFZpZXcpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLmhpZGluZ0NvbnRleHRWaWV3ID0gdW5kZWZpbmVkO1xuXHRcdGhpZGluZ0NvbnRleHRWaWV3LmRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdHRoaXMudmlldy5jbGFzc0xpc3QucmVtb3ZlKGhpZGluZ0NvbnRleHRWaWV3LmNsYXNzTmFtZSk7XG5cdFx0dGhpcy52aWV3LnN0eWxlLnJlbW92ZVByb3BlcnR5KENPTlRFWFRfVklFV19DTE9TRV9BTklNQVRJT05fRFVSQVRJT05fVkFSSUFCTEUpO1xuXHRcdHRoaXMudmlldy5zdHlsZS5yZW1vdmVQcm9wZXJ0eShDT05URVhUX1ZJRVdfTUVOVV9NT1RJT05fQ0xPU0VfU1RBUlRfT1BBQ0lUWV9WQVJJQUJMRSk7XG5cdFx0dGhpcy52aWV3LnN0eWxlLnJlbW92ZVByb3BlcnR5KENPTlRFWFRfVklFV19NRU5VX01PVElPTl9DTE9TRV9TVEFSVF9UUkFOU0ZPUk1fVkFSSUFCTEUpO1xuXHRcdGhpZGluZ0NvbnRleHRWaWV3LnRvRGlzcG9zZS5kaXNwb3NlKCk7XG5cdFx0RE9NLmhpZGUodGhpcy52aWV3KTtcblx0XHR0aGlzLnZpZXcuaW5lcnQgPSBmYWxzZTtcblx0fVxuXG5cdHByaXZhdGUgcHJlcGFyZU1lbnVDbG9zZUFuaW1hdGlvbigpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMudmlldy5jbGFzc0xpc3QuY29udGFpbnMoQ09OVEVYVF9WSUVXX01FTlVfTU9USU9OX0NMQVNTKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHN1cmZhY2UgPSBBcnJheS5mcm9tKHRoaXMudmlldy5jaGlsZHJlbikuZmluZChlbGVtZW50ID0+IERPTS5pc0hUTUxFbGVtZW50KGVsZW1lbnQpICYmIGVsZW1lbnQuY2xhc3NMaXN0LmNvbnRhaW5zKCdtb25hY28tc2Nyb2xsYWJsZS1lbGVtZW50JykpO1xuXHRcdGlmICghRE9NLmlzSFRNTEVsZW1lbnQoc3VyZmFjZSkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBjb21wdXRlZFN0eWxlID0gRE9NLmdldFdpbmRvdyhzdXJmYWNlKS5nZXRDb21wdXRlZFN0eWxlKHN1cmZhY2UpO1xuXHRcdHRoaXMudmlldy5zdHlsZS5zZXRQcm9wZXJ0eShDT05URVhUX1ZJRVdfTUVOVV9NT1RJT05fQ0xPU0VfU1RBUlRfT1BBQ0lUWV9WQVJJQUJMRSwgY29tcHV0ZWRTdHlsZS5vcGFjaXR5KTtcblx0XHR0aGlzLnZpZXcuc3R5bGUuc2V0UHJvcGVydHkoQ09OVEVYVF9WSUVXX01FTlVfTU9USU9OX0NMT1NFX1NUQVJUX1RSQU5TRk9STV9WQVJJQUJMRSwgY29tcHV0ZWRTdHlsZS50cmFuc2Zvcm0pO1xuXHR9XG5cblx0cHJpdmF0ZSBoYXNSZXF1aXJlZEFuY2VzdG9yQ2xhc3NlcyhjbGFzc05hbWVzOiByZWFkb25seSBzdHJpbmdbXSB8IHVuZGVmaW5lZCk6IGJvb2xlYW4ge1xuXHRcdGlmICghY2xhc3NOYW1lcz8ubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRmb3IgKGxldCBjYW5kaWRhdGU6IEhUTUxFbGVtZW50IHwgbnVsbCA9IHRoaXMudmlldzsgY2FuZGlkYXRlOykge1xuXHRcdFx0Y29uc3QgY3VycmVudDogSFRNTEVsZW1lbnQgPSBjYW5kaWRhdGU7XG5cdFx0XHRpZiAoY2xhc3NOYW1lcy5ldmVyeShjbGFzc05hbWUgPT4gY3VycmVudC5jbGFzc0xpc3QuY29udGFpbnMoY2xhc3NOYW1lKSkpIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChjdXJyZW50LnBhcmVudEVsZW1lbnQpIHtcblx0XHRcdFx0Y2FuZGlkYXRlID0gY3VycmVudC5wYXJlbnRFbGVtZW50O1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3Qgcm9vdCA9IGN1cnJlbnQuZ2V0Um9vdE5vZGUoKTtcblx0XHRcdFx0Y2FuZGlkYXRlID0gcm9vdCBpbnN0YW5jZW9mIFNoYWRvd1Jvb3QgJiYgRE9NLmlzSFRNTEVsZW1lbnQocm9vdC5ob3N0KSA/IHJvb3QuaG9zdCA6IG51bGw7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkRPTUV2ZW50KGU6IFVJRXZlbnQsIG9uQ2FwdHVyZTogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmICh0aGlzLmRlbGVnYXRlKSB7XG5cdFx0XHRpZiAodGhpcy5kZWxlZ2F0ZS5vbkRPTUV2ZW50KSB7XG5cdFx0XHRcdHRoaXMuZGVsZWdhdGUub25ET01FdmVudChlLCA8SFRNTEVsZW1lbnQ+RE9NLmdldFdpbmRvdyhlKS5kb2N1bWVudC5hY3RpdmVFbGVtZW50KTtcblx0XHRcdH0gZWxzZSBpZiAob25DYXB0dXJlICYmICFET00uaXNBbmNlc3Rvcig8SFRNTEVsZW1lbnQ+ZS50YXJnZXQsIHRoaXMuY29udGFpbmVyKSkge1xuXHRcdFx0XHR0aGlzLmhpZGUoKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuaGlkZSgpO1xuXHRcdHRoaXMuY29tcGxldGVIaWRlQW5pbWF0aW9uKCk7XG5cblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cbn1cblxuY29uc3QgU0hBRE9XX1JPT1RfQ1NTID0gLyogY3NzICovIGBcblx0Omhvc3Qge1xuXHRcdGFsbDogaW5pdGlhbDsgLyogMXN0IHJ1bGUgc28gc3Vic2VxdWVudCBwcm9wZXJ0aWVzIGFyZSByZXNldC4gKi9cblx0fVxuXG5cdC5jb2RpY29uW2NsYXNzKj0nY29kaWNvbi0nXSB7XG5cdFx0Zm9udDogbm9ybWFsIG5vcm1hbCBub3JtYWwgMTZweC8xIGNvZGljb247XG5cdFx0ZGlzcGxheTogaW5saW5lLWJsb2NrO1xuXHRcdHRleHQtZGVjb3JhdGlvbjogbm9uZTtcblx0XHR0ZXh0LXJlbmRlcmluZzogYXV0bztcblx0XHR0ZXh0LWFsaWduOiBjZW50ZXI7XG5cdFx0LXdlYmtpdC1mb250LXNtb290aGluZzogYW50aWFsaWFzZWQ7XG5cdFx0LW1vei1vc3gtZm9udC1zbW9vdGhpbmc6IGdyYXlzY2FsZTtcblx0XHR1c2VyLXNlbGVjdDogbm9uZTtcblx0XHQtd2Via2l0LXVzZXItc2VsZWN0OiBub25lO1xuXHRcdC1tcy11c2VyLXNlbGVjdDogbm9uZTtcblx0fVxuXG5cdDpob3N0IHtcblx0XHRmb250LWZhbWlseTogLWFwcGxlLXN5c3RlbSwgQmxpbmtNYWNTeXN0ZW1Gb250LCBcIlNlZ29lIFdQQ1wiLCBcIlNlZ29lIFVJXCIsIFwiSGVsdmV0aWNhTmV1ZS1MaWdodFwiLCBzeXN0ZW0tdWksIFwiVWJ1bnR1XCIsIFwiRHJvaWQgU2Fuc1wiLCBzYW5zLXNlcmlmO1xuXHR9XG5cblx0Omhvc3QtY29udGV4dCgubWFjKSB7IGZvbnQtZmFtaWx5OiAtYXBwbGUtc3lzdGVtLCBCbGlua01hY1N5c3RlbUZvbnQsIHNhbnMtc2VyaWY7IH1cblx0Omhvc3QtY29udGV4dCgubWFjOmxhbmcoemgtSGFucykpIHsgZm9udC1mYW1pbHk6IC1hcHBsZS1zeXN0ZW0sIEJsaW5rTWFjU3lzdGVtRm9udCwgXCJQaW5nRmFuZyBTQ1wiLCBcIkhpcmFnaW5vIFNhbnMgR0JcIiwgc2Fucy1zZXJpZjsgfVxuXHQ6aG9zdC1jb250ZXh0KC5tYWM6bGFuZyh6aC1IYW50KSkgeyBmb250LWZhbWlseTogLWFwcGxlLXN5c3RlbSwgQmxpbmtNYWNTeXN0ZW1Gb250LCBcIlBpbmdGYW5nIFRDXCIsIHNhbnMtc2VyaWY7IH1cblx0Omhvc3QtY29udGV4dCgubWFjOmxhbmcoamEpKSB7IGZvbnQtZmFtaWx5OiAtYXBwbGUtc3lzdGVtLCBCbGlua01hY1N5c3RlbUZvbnQsIFwiSGlyYWdpbm8gS2FrdSBHb3RoaWMgUHJvXCIsIHNhbnMtc2VyaWY7IH1cblx0Omhvc3QtY29udGV4dCgubWFjOmxhbmcoa28pKSB7IGZvbnQtZmFtaWx5OiAtYXBwbGUtc3lzdGVtLCBCbGlua01hY1N5c3RlbUZvbnQsIFwiQXBwbGUgU0QgR290aGljIE5lb1wiLCBcIk5hbnVtIEdvdGhpY1wiLCBcIkFwcGxlR290aGljXCIsIHNhbnMtc2VyaWY7IH1cblxuXHQ6aG9zdC1jb250ZXh0KC53aW5kb3dzKSB7IGZvbnQtZmFtaWx5OiBcIlNlZ29lIFdQQ1wiLCBcIlNlZ29lIFVJXCIsIHNhbnMtc2VyaWY7IH1cblx0Omhvc3QtY29udGV4dCgud2luZG93czpsYW5nKHpoLUhhbnMpKSB7IGZvbnQtZmFtaWx5OiBcIlNlZ29lIFdQQ1wiLCBcIlNlZ29lIFVJXCIsIFwiTWljcm9zb2Z0IFlhSGVpXCIsIHNhbnMtc2VyaWY7IH1cblx0Omhvc3QtY29udGV4dCgud2luZG93czpsYW5nKHpoLUhhbnQpKSB7IGZvbnQtZmFtaWx5OiBcIlNlZ29lIFdQQ1wiLCBcIlNlZ29lIFVJXCIsIFwiTWljcm9zb2Z0IEpoZW5naGVpXCIsIHNhbnMtc2VyaWY7IH1cblx0Omhvc3QtY29udGV4dCgud2luZG93czpsYW5nKGphKSkgeyBmb250LWZhbWlseTogXCJTZWdvZSBXUENcIiwgXCJTZWdvZSBVSVwiLCBcIll1IEdvdGhpYyBVSVwiLCBcIk1laXJ5byBVSVwiLCBzYW5zLXNlcmlmOyB9XG5cdDpob3N0LWNvbnRleHQoLndpbmRvd3M6bGFuZyhrbykpIHsgZm9udC1mYW1pbHk6IFwiU2Vnb2UgV1BDXCIsIFwiU2Vnb2UgVUlcIiwgXCJNYWxndW4gR290aGljXCIsIFwiRG90b21cIiwgc2Fucy1zZXJpZjsgfVxuXG5cdDpob3N0LWNvbnRleHQoLmxpbnV4KSB7IGZvbnQtZmFtaWx5OiBzeXN0ZW0tdWksIFwiVWJ1bnR1XCIsIFwiRHJvaWQgU2Fuc1wiLCBzYW5zLXNlcmlmOyB9XG5cdDpob3N0LWNvbnRleHQoLmxpbnV4OmxhbmcoemgtSGFucykpIHsgZm9udC1mYW1pbHk6IHN5c3RlbS11aSwgXCJVYnVudHVcIiwgXCJEcm9pZCBTYW5zXCIsIFwiU291cmNlIEhhbiBTYW5zIFNDXCIsIFwiU291cmNlIEhhbiBTYW5zIENOXCIsIFwiU291cmNlIEhhbiBTYW5zXCIsIHNhbnMtc2VyaWY7IH1cblx0Omhvc3QtY29udGV4dCgubGludXg6bGFuZyh6aC1IYW50KSkgeyBmb250LWZhbWlseTogc3lzdGVtLXVpLCBcIlVidW50dVwiLCBcIkRyb2lkIFNhbnNcIiwgXCJTb3VyY2UgSGFuIFNhbnMgVENcIiwgXCJTb3VyY2UgSGFuIFNhbnMgVFdcIiwgXCJTb3VyY2UgSGFuIFNhbnNcIiwgc2Fucy1zZXJpZjsgfVxuXHQ6aG9zdC1jb250ZXh0KC5saW51eDpsYW5nKGphKSkgeyBmb250LWZhbWlseTogc3lzdGVtLXVpLCBcIlVidW50dVwiLCBcIkRyb2lkIFNhbnNcIiwgXCJTb3VyY2UgSGFuIFNhbnMgSlwiLCBcIlNvdXJjZSBIYW4gU2FucyBKUFwiLCBcIlNvdXJjZSBIYW4gU2Fuc1wiLCBzYW5zLXNlcmlmOyB9XG5cdDpob3N0LWNvbnRleHQoLmxpbnV4Omxhbmcoa28pKSB7IGZvbnQtZmFtaWx5OiBzeXN0ZW0tdWksIFwiVWJ1bnR1XCIsIFwiRHJvaWQgU2Fuc1wiLCBcIlNvdXJjZSBIYW4gU2FucyBLXCIsIFwiU291cmNlIEhhbiBTYW5zIEpSXCIsIFwiU291cmNlIEhhbiBTYW5zXCIsIFwiVW5Eb3R1bVwiLCBcIkZCYWVrbXVrIEd1bGltXCIsIHNhbnMtc2VyaWY7IH1cblx0JHtnZXRDb250ZXh0Vmlld01lbnVNb3Rpb25Dc3MoJzpob3N0LWNvbnRleHQoLnN0eWxlLW92ZXJyaWRlLm1vbmFjby1lbmFibGUtbW90aW9uKScpfVxuYDtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsdUJBQXVCO0FBQ2hDLFlBQVksU0FBUztBQUNyQixTQUFTLHdCQUF3QjtBQUVqQyxTQUFTLFlBQVksaUJBQThCLG9CQUFvQjtBQUN2RSxTQUFTLGlCQUFzQyxnQkFBdUIsZ0JBQWdCO0FBQ3RGLFlBQVksY0FBYztBQUUxQixPQUFPO0FBRVAsU0FBUyxtQkFBQUEsa0JBQWlCLHVCQUFBQyxzQkFBcUIsa0JBQUFDLHVCQUFzQjtBQUU5RCxJQUFXLHlCQUFYLGtCQUFXQyw0QkFBWDtBQUNOLEVBQUFBLGdEQUFBLGNBQVcsS0FBWDtBQUNBLEVBQUFBLGdEQUFBO0FBQ0EsRUFBQUEsZ0RBQUE7QUFIaUIsU0FBQUE7QUFBQSxHQUFBO0FBYVgsU0FBUyxTQUFTLEtBQXNEO0FBQzlFLFFBQU0sU0FBUztBQUVmLFNBQU8sQ0FBQyxDQUFDLFVBQVUsT0FBTyxPQUFPLE1BQU0sWUFBWSxPQUFPLE9BQU8sTUFBTTtBQUN4RTtBQWlDTyxNQUFNLGlDQUFpQztBQUN2QyxNQUFNLHlDQUF5QztBQUMvQyxNQUFNLG9EQUFvRDtBQUMx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b0JBQVksZ0JBQWdCLGNBQWMsSUFBSSxjQUFjLEtBQUssSUFBSSxJQUFJLEtBQUssT0FBTztBQUFBLE1BQ3RGO0FBQUEsSUFDRDtBQUVBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFUSxXQUFXLEdBQVksV0FBMEI7QUFDeEQsUUFBSSxLQUFLLFVBQVU7QUFDbEIsVUFBSSxLQUFLLFNBQVMsWUFBWTtBQUM3QixhQUFLLFNBQVMsV0FBVyxHQUFnQixJQUFJLFVBQVUsQ0FBQyxFQUFFLFNBQVMsYUFBYTtBQUFBLE1BQ2pGLFdBQVcsYUFBYSxDQUFDLElBQUksV0FBd0IsRUFBRSxRQUFRLEtBQUssU0FBUyxHQUFHO0FBQy9FLGFBQUssS0FBSztBQUFBLE1BQ1g7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUFBLEVBRVMsVUFBZ0I7QUFDeEIsU0FBSyxLQUFLO0FBQ1YsU0FBSyxzQkFBc0I7QUFFM0IsVUFBTSxRQUFRO0FBQUEsRUFDZjtBQUNEO0FBblJhLGFBRVksbUJBQW1CLENBQUMsU0FBUyxXQUFXLFNBQVMsTUFBTTtBQUZuRSxhQUdZLHFCQUFxQixDQUFDLE9BQU87QUFIL0MsSUFBTSxjQUFOO0FBcVJQLE1BQU07QUFBQTtBQUFBLEVBQTRCO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEdBdUMvQiw0QkFBNEIscURBQXFELENBQUM7QUFBQTtBQUFBOyIsCiAgIm5hbWVzIjogWyJBbmNob3JBbGlnbm1lbnQiLCAiQW5jaG9yQXhpc0FsaWdubWVudCIsICJBbmNob3JQb3NpdGlvbiIsICJDb250ZXh0Vmlld0RPTVBvc2l0aW9uIl0KfQo=
