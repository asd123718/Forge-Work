const commentElementSelectionMode = "comment";
let localizedStrings = {
  addComment: "Add Comment",
  addCommentPlaceholder: "Add a comment",
  commentOnSelectedElement: "Comment on selected element",
  elementComment: "Element comment {0}",
  elementCommentWithBody: "Element comment {0}: {1}",
  emptyElementComment: "Empty element comment {0}",
  removeComment: "Remove Comment",
  removeElementComment: "Remove element comment"
};
function init() {
  const { contextBridge, ipcRenderer } = require("electron");
  const nativeCtrlCmdKeybindings = {
    mac: {
      always: /* @__PURE__ */ new Set(["arrowup", "arrowdown", "arrowleft", "arrowright", "backspace", "delete"]),
      noShift: /* @__PURE__ */ new Set(["a", "c", "v", "x", "z"]),
      withShift: /* @__PURE__ */ new Set(["v", "z"])
    },
    nonMac: {
      always: /* @__PURE__ */ new Set(["arrowup", "arrowdown", "arrowleft", "arrowright", "home", "end", "backspace", "delete"]),
      noShift: /* @__PURE__ */ new Set(["a", "c", "v", "x", "z", "y"]),
      withShift: /* @__PURE__ */ new Set(["v", "z"])
    }
  };
  window.addEventListener("keydown", (event) => {
    if (!(event instanceof KeyboardEvent) || !event.isTrusted) {
      return;
    }
    if (event.defaultPrevented) {
      return;
    }
    const isNonEditingKey = event.key === "Escape" || /^F\d+$/.test(event.key) || event.key.startsWith("Audio") || event.key.startsWith("Media") || event.key.startsWith("Browser");
    if (!(event.ctrlKey || event.altKey || event.metaKey) && !isNonEditingKey) {
      return;
    }
    if (event.key === "Control" || event.key === "Shift" || event.key === "Alt" || event.key === "Meta") {
      return;
    }
    const isMac = navigator.platform.indexOf("Mac") >= 0;
    if (event.altKey && !event.ctrlKey && !event.metaKey) {
      if (isMac || /^Numpad\d+$/.test(event.code)) {
        return;
      }
    }
    if (event.key === "F10" && event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey) {
      return;
    }
    const ctrlCmd = isMac ? event.metaKey : event.ctrlKey;
    if (ctrlCmd && !event.altKey) {
      let key = event.key.toLowerCase();
      if (!/^[a-z]$/.test(key) && /^Key[A-Z]$/.test(event.code)) {
        key = event.code.slice(3).toLowerCase();
      }
      const keySetsToCheck = [
        nativeCtrlCmdKeybindings[isMac ? "mac" : "nonMac"].always,
        nativeCtrlCmdKeybindings[isMac ? "mac" : "nonMac"][event.shiftKey ? "withShift" : "noShift"]
      ];
      if (keySetsToCheck.some((set) => set.has(key))) {
        return;
      }
      if (isMac && event.ctrlKey && !event.shiftKey && key === " ") {
        return;
      }
    }
    event.preventDefault();
    event.stopPropagation();
    ipcRenderer.send("vscode:browserView:keydown", {
      key: event.key,
      keyCode: event.keyCode,
      code: event.code,
      ctrlKey: event.ctrlKey,
      shiftKey: event.shiftKey,
      altKey: event.altKey,
      metaKey: event.metaKey,
      repeat: event.repeat
    });
  });
  const elementPicker = new ElementPicker(
    (el, comment) => {
      const elementId = track(el);
      ipcRenderer.send("vscode:browserView:elementPicked", { elementId, comment });
      return elementId;
    },
    (elementId) => ipcRenderer.send("vscode:browserView:elementCommentRemoved", elementId),
    () => ipcRenderer.send("vscode:browserView:elementPickStopped")
  );
  const areaPicker = new AreaPicker(
    (rect) => ipcRenderer.send("vscode:browserView:areaPicked", rect),
    () => ipcRenderer.send("vscode:browserView:areaPickStopped")
  );
  const trackedElementsById = /* @__PURE__ */ new Map();
  const finalizationRegistry = new FinalizationRegistry((id) => {
    trackedElementsById.delete(id);
  });
  function track(element) {
    const id = `el-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    trackedElementsById.set(id, new WeakRef(element));
    finalizationRegistry.register(element, id);
    return id;
  }
  let contextMenuTarget;
  window.addEventListener("contextmenu", (event) => {
    if (!event.isTrusted) {
      return;
    }
    const target = elementPicker.resolveContextMenuTarget(event);
    if (target) {
      const els = [target];
      const selection = window.getSelection();
      if (selection && !selection.isCollapsed) {
        els.push(selection.anchorNode, selection.focusNode);
      }
      contextMenuTarget = {
        ref: new WeakRef(findCommonVisibleAncestor(els) ?? target),
        anchor: { x: event.clientX, y: event.clientY }
      };
    } else {
      contextMenuTarget = void 0;
    }
  }, { capture: true });
  ipcRenderer.on("vscode:browserView:setTheme", (_event, theme) => {
    elementPicker.setTheme(theme);
    areaPicker.setTheme(theme);
  });
  ipcRenderer.on("vscode:browserView:setLocalizedStrings", (_event, strings) => {
    localizedStrings = strings;
    elementPicker.updateLocalizedStrings();
  });
  ipcRenderer.on("vscode:browserView:startElementPicker", (_event, options) => {
    elementPicker.start(options);
  });
  ipcRenderer.on("vscode:browserView:stopElementPicker", (_event) => {
    elementPicker.stop();
  });
  ipcRenderer.on("vscode:browserView:startAreaPicker", (_event) => {
    areaPicker.start();
  });
  ipcRenderer.on("vscode:browserView:stopAreaPicker", (_event) => {
    areaPicker.stop();
  });
  ipcRenderer.on("vscode:browserView:highlightElement", (_event, { elementId }) => {
    const element = getElement(elementId);
    if (element) {
      elementPicker.highlight(element);
    }
  });
  ipcRenderer.on("vscode:browserView:showElementComment", (_event, { elementId }) => {
    const element = getElement(elementId);
    if (element && contextMenuTarget) {
      elementPicker.comment(element, contextMenuTarget.anchor);
    }
  });
  ipcRenderer.on("vscode:browserView:hideHighlight", (_event) => {
    elementPicker.hideHighlight();
  });
  ipcRenderer.on("vscode:browserView:setElementComments", (_event, update) => {
    elementPicker.updateComments(update);
  });
  const getElement = (id) => {
    switch (id) {
      case "active":
        return document.activeElement;
      case "context-menu-target":
        return contextMenuTarget?.ref.deref() ?? null;
      default:
        return trackedElementsById.get(id)?.deref() ?? null;
    }
  };
  const isolatedHelpers = {
    /**
     * Get the currently selected text in the page.
     */
    getSelectedText() {
      try {
        return window.getSelection()?.toString() ?? "";
      } catch {
        return "";
      }
    }
  };
  const frameToken = `frame-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const mainWorldHelpers = {
    getElement,
    /** Opaque token exposed for CDP-side frame matching. */
    getFrameToken() {
      return frameToken;
    }
  };
  try {
    contextBridge.exposeInIsolatedWorld(999, "browserViewAPI", isolatedHelpers);
    contextBridge.exposeInMainWorld("__vscode_helpers", mainWorldHelpers);
  } catch (error) {
    console.error(error);
  }
  ipcRenderer.send("vscode:browserView:preloadReady", frameToken);
}
function findCommonVisibleAncestor(candidates) {
  const filteredNodes = candidates.filter((c) => !!c);
  const unique = [...new Set(filteredNodes.map((node) => node instanceof Element ? node : node.parentElement).filter((e) => !!e))];
  if (unique.length === 0) {
    return void 0;
  }
  const findVisible = (el) => {
    for (let cur = el; cur; cur = cur.parentElement) {
      const width = cur instanceof HTMLElement ? cur.offsetWidth : cur.clientWidth;
      const height = cur instanceof HTMLElement ? cur.offsetHeight : cur.clientHeight;
      if (width > 0 && height > 0) {
        return cur;
      }
    }
    return el;
  };
  if (unique.length === 1) {
    return findVisible(unique[0]);
  }
  const firstChain = [];
  for (let cur = unique[0]; cur; cur = cur.parentElement) {
    firstChain.unshift(cur);
  }
  let common = firstChain;
  for (let i = 1; i < unique.length; i++) {
    const otherChain = [];
    for (let cur = unique[i]; cur; cur = cur.parentElement) {
      otherChain.unshift(cur);
    }
    let j = 0;
    const limit = Math.min(common.length, otherChain.length);
    while (j < limit && common[j] === otherChain[j]) {
      j++;
    }
    common = common.slice(0, j);
    if (common.length === 0) {
      return void 0;
    }
  }
  return findVisible(common[common.length - 1]);
}
const _ElementPicker = class _ElementPicker {
  constructor(_onPicked, _onCommentRemoved, _onStopped) {
    this._onPicked = _onPicked;
    this._onCommentRemoved = _onCommentRemoved;
    this._onStopped = _onStopped;
    this._selectionActive = false;
    this._continuous = false;
    this._commentMode = false;
    this._comments = /* @__PURE__ */ new Map();
    this._pendingComments = /* @__PURE__ */ new Map();
    this._scheduledCommentPins = /* @__PURE__ */ new Map();
    this._dismissedCommentOnPointerDown = false;
    this._commentPointerInteraction = false;
    this._commentBackdropRequest = 0;
    this._commentPreviewCollapsing = false;
    this._reducedMotion = false;
    // --- Event handlers ---
    this._onPointerMove = (e) => {
      if (!this._selectionActive) {
        return;
      }
      const isOverPicker = e.composedPath().includes(this._shadowHost);
      if (this._commentTarget) {
        if (!isOverPicker) {
          this._commentPointerInteraction = true;
        }
        return;
      }
      const pendingComment = this._pendingCommentInteractionId ? this._pendingComments.get(this._pendingCommentInteractionId) : void 0;
      if (pendingComment) {
        if (!isOverPicker) {
          pendingComment.pointerInteraction = true;
        }
        return;
      }
      if (this._commentPreviewElementId || this._externalHighlightTarget || isOverPicker) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      if (!this._dragStart) {
        this._updateHighlight(this._pickElementAt(e.clientX, e.clientY));
        return;
      }
      const dx = Math.abs(e.clientX - this._dragStart.x);
      const dy = Math.abs(e.clientY - this._dragStart.y);
      if (dx < _ElementPicker._DRAG_THRESHOLD_PX && dy < _ElementPicker._DRAG_THRESHOLD_PX) {
        return;
      }
      const left = Math.min(this._dragStart.x, e.clientX);
      const top = Math.min(this._dragStart.y, e.clientY);
      this._dragbox.style.display = "block";
      this._dragbox.style.left = `${left}px`;
      this._dragbox.style.top = `${top}px`;
      this._dragbox.style.width = `${dx}px`;
      this._dragbox.style.height = `${dy}px`;
      this._updateHighlight(this._pickRegionAncestor({ x: left, y: top, width: dx, height: dy }));
    };
    this._onPointerLeave = () => {
      if (!this._selectionActive) {
        return;
      }
      if (this._commentTarget) {
        this._commentPointerInteraction = true;
        return;
      }
      const pendingComment = this._pendingCommentInteractionId ? this._pendingComments.get(this._pendingCommentInteractionId) : void 0;
      if (pendingComment) {
        pendingComment.pointerInteraction = true;
        return;
      }
      if (this._commentPreviewElementId || this._externalHighlightTarget) {
        return;
      }
      if (!this._dragStart) {
        this._updateHighlight(this._focusedTarget);
      }
    };
    this._onPointerDown = (e) => {
      if (!this._selectionActive) {
        return;
      }
      this._dismissedCommentOnPointerDown = false;
      if (e.composedPath().includes(this._shadowHost)) {
        return;
      }
      if (this._pendingCommentInteractionId) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (this._commentTarget) {
        this._dismissedCommentOnPointerDown = true;
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      this._dragStart = { x: e.clientX, y: e.clientY };
      this._dragStartTarget = this._pickElementAt(e.clientX, e.clientY);
      if (this._cursorStylesheet) {
        this._cursorStylesheet.textContent = _ElementPicker._CURSOR_CROSSHAIR;
      }
      e.preventDefault();
      e.stopPropagation();
    };
    this._onPointerUp = (e) => {
      if (!this._selectionActive) {
        return;
      }
      if (this._dismissedCommentOnPointerDown) {
        e.preventDefault();
        e.stopPropagation();
        const commentTarget = this._commentTarget;
        if (commentTarget) {
          window.setTimeout(() => {
            if (this._commentTarget === commentTarget) {
              this._finishCommentInteraction();
            }
          });
        }
        return;
      }
      if (e.composedPath().includes(this._shadowHost)) {
        return;
      }
      if (!this._dragStart) {
        return;
      }
      const dx = Math.abs(e.clientX - this._dragStart.x);
      const dy = Math.abs(e.clientY - this._dragStart.y);
      const start = this._dragStart;
      this._dragStart = void 0;
      if (this._cursorStylesheet) {
        this._cursorStylesheet.textContent = _ElementPicker._CURSOR_DEFAULT;
      }
      if (dx < _ElementPicker._DRAG_THRESHOLD_PX && dy < _ElementPicker._DRAG_THRESHOLD_PX) {
        const target = this._dragStartTarget ?? this._pickElementAt(e.clientX, e.clientY);
        this._dragStartTarget = void 0;
        if (target) {
          this._commit(target, { x: e.clientX, y: e.clientY });
        }
      } else {
        this._dragStartTarget = void 0;
        this._dragbox.style.display = "none";
        this._updateHighlight(void 0);
        const left = Math.min(start.x, e.clientX);
        const top = Math.min(start.y, e.clientY);
        const ancestor = this._pickRegionAncestor({ x: left, y: top, width: dx, height: dy });
        if (ancestor) {
          this._commit(ancestor, { x: e.clientX, y: e.clientY });
        }
      }
      e.preventDefault();
      e.stopPropagation();
    };
    this._onClick = (e) => {
      if (!this._selectionActive) {
        return;
      }
      if (this._dismissedCommentOnPointerDown) {
        this._dismissedCommentOnPointerDown = false;
        e.preventDefault();
        e.stopPropagation();
        this._finishCommentInteraction();
        return;
      }
      if (e.composedPath().includes(this._shadowHost)) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
    };
    this._onFocusIn = (event) => {
      if (!this._selectionActive || this._commentTarget || this._pendingCommentInteractionId || this._externalHighlightTarget) {
        return;
      }
      if (event.composedPath().includes(this._shadowHost)) {
        return;
      }
      const focusedElement = this._getFocusedElement();
      this._focusedTarget = focusedElement?.matches(":focus-visible") ? focusedElement : void 0;
      this._updateHighlight(this._focusedTarget);
    };
    this._onWindowBlur = () => {
      if (!this._selectionActive || this._commentTarget || this._externalHighlightTarget) {
        return;
      }
      this._focusedTarget = void 0;
      this._updateHighlight(void 0);
    };
    this._onKeyDown = (e) => {
      if (!this._selectionActive) {
        return;
      }
      if (e.key === "Escape") {
        if (this._commentTarget) {
          const target = this._commentTarget;
          this._focusCommentTarget(target);
          this._finishCommentInteraction();
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        this.stop();
        e.preventDefault();
        e.stopPropagation();
      } else if (e.key === "Enter" && !e.isComposing) {
        if (this._pendingCommentInteractionId) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        const focusedElement = this._getFocusedElement();
        if (focusedElement) {
          e.preventDefault();
          e.stopPropagation();
          this._commit(focusedElement);
        }
      }
    };
    const shadowHost = document.createElement("div");
    shadowHost.setAttribute("data-vscode-pick-host", "");
    shadowHost.style.cssText = "position: absolute; top: 0; left: 0; width: 0; height: 0; z-index: 2147483647; pointer-events: none;";
    const root = shadowHost.attachShadow({ mode: "closed" });
    root.appendChild(_ElementPicker._buildStyle());
    this._shadowHost = shadowHost;
    const svgNamespace = "http://www.w3.org/2000/svg";
    const commentBackdrop = document.createElementNS(svgNamespace, "svg");
    commentBackdrop.classList.add("comment-backdrop");
    const backdropMaskId = `vscode-comment-cutout-${Math.random().toString(36).slice(2)}`;
    const backdropDefinitions = document.createElementNS(svgNamespace, "defs");
    const backdropMask = document.createElementNS(svgNamespace, "mask");
    backdropMask.id = backdropMaskId;
    backdropMask.setAttribute("maskUnits", "userSpaceOnUse");
    backdropMask.setAttribute("x", "0");
    backdropMask.setAttribute("y", "0");
    backdropMask.setAttribute("width", "100%");
    backdropMask.setAttribute("height", "100%");
    const backdropMaskFill = document.createElementNS(svgNamespace, "rect");
    backdropMaskFill.setAttribute("width", "100%");
    backdropMaskFill.setAttribute("height", "100%");
    backdropMaskFill.setAttribute("fill", "white");
    const backdropCutout = document.createElementNS(svgNamespace, "rect");
    backdropCutout.setAttribute("fill", "black");
    backdropMask.append(backdropMaskFill, backdropCutout);
    backdropDefinitions.appendChild(backdropMask);
    const backdropFill = document.createElementNS(svgNamespace, "rect");
    backdropFill.classList.add("comment-backdrop-fill");
    backdropFill.setAttribute("width", "100%");
    backdropFill.setAttribute("height", "100%");
    backdropFill.setAttribute("mask", `url(#${backdropMaskId})`);
    const highlightShape = document.createElementNS(svgNamespace, "rect");
    highlightShape.classList.add("highlight-shape");
    highlightShape.style.display = "none";
    commentBackdrop.append(backdropDefinitions, backdropFill, highlightShape);
    root.appendChild(commentBackdrop);
    this._commentBackdrop = commentBackdrop;
    this._commentBackdropCutout = backdropCutout;
    this._highlightShape = highlightShape;
    const highlight = document.createElement("div");
    highlight.className = "highlight";
    highlight.style.display = "none";
    root.appendChild(highlight);
    this._highlight = highlight;
    const commentPreviewRemoveButton = document.createElement("button");
    commentPreviewRemoveButton.className = "comment-preview-remove";
    commentPreviewRemoveButton.type = "button";
    const commentPreviewRemoveIcon = document.createElementNS(svgNamespace, "svg");
    commentPreviewRemoveIcon.setAttribute("viewBox", "0 0 16 16");
    commentPreviewRemoveIcon.setAttribute("fill", "currentColor");
    commentPreviewRemoveIcon.setAttribute("aria-hidden", "true");
    const commentPreviewRemoveIconPath = document.createElementNS(svgNamespace, "path");
    commentPreviewRemoveIconPath.setAttribute("d", "M3.854 3.146a.5.5 0 0 0-.708.708L7.293 8l-4.147 4.146a.5.5 0 0 0 .708.708L8 8.707l4.146 4.147a.5.5 0 0 0 .708-.708L8.707 8l4.147-4.146a.5.5 0 0 0-.708-.708L8 7.293 3.854 3.146Z");
    commentPreviewRemoveIcon.appendChild(commentPreviewRemoveIconPath);
    commentPreviewRemoveButton.appendChild(commentPreviewRemoveIcon);
    commentPreviewRemoveButton.title = localizedStrings.removeComment;
    commentPreviewRemoveButton.setAttribute("aria-label", localizedStrings.removeElementComment);
    commentPreviewRemoveButton.addEventListener("click", () => {
      if (this._commentPreviewElementId) {
        this._removeComment(this._commentPreviewElementId);
      }
    });
    this._commentPreviewRemoveButton = commentPreviewRemoveButton;
    const overlay = document.createElement("div");
    overlay.className = "overlay";
    root.appendChild(overlay);
    this._overlay = overlay;
    const label = document.createElement("div");
    label.className = "label";
    label.style.display = "none";
    root.appendChild(label);
    this._label = label;
    const labelInfo = document.createElement("span");
    labelInfo.className = "label-info";
    label.appendChild(labelInfo);
    const labelSelector = document.createElement("span");
    labelSelector.className = "label-selector";
    labelInfo.appendChild(labelSelector);
    this._labelSelector = labelSelector;
    const labelClasses = document.createElement("span");
    labelClasses.className = "label-classes";
    labelInfo.appendChild(labelClasses);
    this._labelClasses = labelClasses;
    const labelDims = document.createElement("span");
    labelDims.className = "label-dims";
    label.appendChild(labelDims);
    this._labelDims = labelDims;
    const commentPreviewHitArea = document.createElement("div");
    commentPreviewHitArea.className = "comment-preview-hit-area";
    commentPreviewHitArea.style.display = "none";
    root.appendChild(commentPreviewHitArea);
    this._commentPreviewHitArea = commentPreviewHitArea;
    const commentPreview = document.createElement("div");
    commentPreview.className = "comment-surface comment-preview";
    commentPreview.style.display = "none";
    commentPreview.setAttribute("role", "note");
    const commentPreviewBody = document.createElement("span");
    commentPreviewBody.className = "comment-preview-body";
    commentPreview.appendChild(commentPreviewBody);
    commentPreview.appendChild(commentPreviewRemoveButton);
    commentPreviewHitArea.appendChild(commentPreview);
    this._commentPreview = commentPreview;
    this._commentPreviewBody = commentPreviewBody;
    commentPreviewHitArea.addEventListener("mouseenter", () => this._cancelCommentPreviewHide());
    commentPreviewHitArea.addEventListener("mouseleave", () => this._scheduleCommentPreviewHide());
    commentPreviewHitArea.addEventListener("focusin", () => this._cancelCommentPreviewHide());
    commentPreviewHitArea.addEventListener("focusout", () => this._scheduleCommentPreviewHide());
    const dragbox = document.createElement("div");
    dragbox.className = "dragbox";
    dragbox.style.display = "none";
    root.appendChild(dragbox);
    this._dragbox = dragbox;
    const commentLayer = document.createElement("div");
    commentLayer.className = "comment-layer";
    root.appendChild(commentLayer);
    this._commentLayer = commentLayer;
    const commentComposer = document.createElement("div");
    commentComposer.className = "comment-surface comment-composer";
    commentComposer.style.display = "none";
    commentComposer.setAttribute("role", "dialog");
    commentComposer.setAttribute("aria-label", localizedStrings.commentOnSelectedElement);
    commentComposer.setAttribute("aria-modal", "true");
    commentLayer.appendChild(commentComposer);
    this._commentComposer = commentComposer;
    const commentInput = document.createElement("textarea");
    commentInput.className = "comment-input";
    commentInput.rows = 1;
    commentInput.placeholder = localizedStrings.addCommentPlaceholder;
    commentInput.setAttribute("aria-label", localizedStrings.commentOnSelectedElement);
    commentInput.addEventListener("input", () => this._layoutCommentInput());
    commentInput.addEventListener("keydown", (event) => {
      event.stopPropagation();
      if (event.key === "Enter" && !event.isComposing) {
        event.preventDefault();
        this._submitComment();
      }
    });
    commentInput.addEventListener("keypress", (event) => event.stopPropagation());
    commentInput.addEventListener("keyup", (event) => event.stopPropagation());
    commentComposer.appendChild(commentInput);
    this._commentInput = commentInput;
    const sendButton = document.createElement("button");
    sendButton.className = "comment-send";
    sendButton.type = "button";
    const sendButtonIcon = document.createElementNS(svgNamespace, "svg");
    sendButtonIcon.setAttribute("viewBox", "0 0 16 16");
    sendButtonIcon.setAttribute("fill", "currentColor");
    sendButtonIcon.setAttribute("aria-hidden", "true");
    const sendButtonIconPath = document.createElementNS(svgNamespace, "path");
    sendButtonIconPath.setAttribute("d", "M8.5 3a.5.5 0 0 0-1 0v4.5H3a.5.5 0 0 0 0 1h4.5V13a.5.5 0 0 0 1 0V8.5H13a.5.5 0 0 0 0-1H8.5V3Z");
    sendButtonIcon.appendChild(sendButtonIconPath);
    sendButton.appendChild(sendButtonIcon);
    sendButton.title = localizedStrings.addComment;
    sendButton.setAttribute("aria-label", localizedStrings.addComment);
    sendButton.addEventListener("click", () => this._submitComment());
    commentComposer.appendChild(sendButton);
    this._commentSendButton = sendButton;
    commentComposer.addEventListener("keydown", (event) => {
      if (event.key !== "Tab") {
        return;
      }
      if (event.shiftKey && event.target === commentInput) {
        event.preventDefault();
        sendButton.focus();
      } else if (!event.shiftKey && event.target === sendButton) {
        event.preventDefault();
        commentInput.focus();
      }
    });
    window.addEventListener("scroll", () => this._onScrollOrResize(), { passive: true, capture: true });
    window.addEventListener("resize", () => this._onScrollOrResize());
  }
  start(options) {
    if (this._selectionActive) {
      this._updateSelectionOptions(options);
      return true;
    }
    this._commentMode = options.mode === commentElementSelectionMode;
    this._continuous = options.continuous ?? false;
    this._ensureMounted();
    this._selectionActive = true;
    this._overlay.style.display = "block";
    const cursorStyle = document.createElement("style");
    cursorStyle.textContent = _ElementPicker._CURSOR_DEFAULT;
    document.head.appendChild(cursorStyle);
    this._cursorStylesheet = cursorStyle;
    window.addEventListener("pointermove", this._onPointerMove, true);
    document.addEventListener("pointerleave", this._onPointerLeave, true);
    window.addEventListener("pointerdown", this._onPointerDown, true);
    window.addEventListener("pointerup", this._onPointerUp, true);
    window.addEventListener("click", this._onClick, true);
    window.addEventListener("contextmenu", this._onClick, true);
    window.addEventListener("focusin", this._onFocusIn, true);
    window.addEventListener("blur", this._onWindowBlur);
    window.addEventListener("keydown", this._onKeyDown, true);
    if (!this._externalHighlightTarget) {
      const focusedElement = this._getFocusedElement();
      this._focusedTarget = options.highlightFocusedElement ? focusedElement : void 0;
      this._updateHighlight(this._focusedTarget);
    }
    return true;
  }
  _updateSelectionOptions(options) {
    const wasCommentMode = this._commentMode;
    this._commentMode = options.mode === commentElementSelectionMode;
    this._continuous = options.continuous ?? false;
    if (wasCommentMode && !this._commentMode && this._commentTarget) {
      this._closeCommentComposer();
    }
    if (options.highlightFocusedElement && !this._commentTarget && !this._commentPreviewElementId && !this._externalHighlightTarget) {
      this._focusedTarget = this._getFocusedElement();
      this._updateHighlight(this._focusedTarget);
    }
  }
  stop() {
    if (!this._selectionActive) {
      return;
    }
    this._hideActiveCommentPreview();
    this._selectionActive = false;
    this._closeCommentComposer();
    this._overlay.style.display = "none";
    this._cursorStylesheet?.remove();
    this._cursorStylesheet = void 0;
    window.removeEventListener("pointermove", this._onPointerMove, true);
    document.removeEventListener("pointerleave", this._onPointerLeave, true);
    window.removeEventListener("pointerdown", this._onPointerDown, true);
    window.removeEventListener("pointerup", this._onPointerUp, true);
    window.removeEventListener("click", this._onClick, true);
    window.removeEventListener("contextmenu", this._onClick, true);
    window.removeEventListener("focusin", this._onFocusIn, true);
    window.removeEventListener("blur", this._onWindowBlur);
    window.removeEventListener("keydown", this._onKeyDown, true);
    this._highlight.style.display = "none";
    this._label.style.display = "none";
    this._dragbox.style.display = "none";
    this._dragStart = void 0;
    this._dragStartTarget = void 0;
    this._dismissedCommentOnPointerDown = false;
    this._highlightTarget = void 0;
    this._focusedTarget = void 0;
    if (this._externalHighlightTarget) {
      this._updateHighlight(this._externalHighlightTarget);
    }
    this._onStopped();
    this._unmountWhenIdle();
  }
  /**
   * Update the theme colors applied to the overlay.
   * Can be called at any time; takes effect immediately.
   */
  setTheme(theme) {
    _ElementPicker._applyTheme(this._shadowHost, theme);
    this._reducedMotion = theme.reducedMotion ?? false;
    this._shadowHost.classList.toggle("reduce-motion", this._reducedMotion);
  }
  updateLocalizedStrings() {
    this._applyLocalizedStrings();
  }
  resolveContextMenuTarget(event) {
    if (this._commentPreviewElementId && event.composedPath().includes(this._shadowHost)) {
      this._hideActiveCommentPreview();
      return this._pickElementAt(event.clientX, event.clientY);
    }
    return event.target instanceof Element ? event.target : void 0;
  }
  /**
   * Highlight a specific element without starting a pick session.
   * Mounts the shadow host if not already in the document.
   */
  highlight(element) {
    this._ensureMounted();
    this._externalHighlightTarget = element;
    this._hideActiveCommentPreview();
    this._updateHighlight(element);
  }
  /**
   * Hide any current highlight. If no pick session is active, also
   * removes the shadow host from the document.
   */
  hideHighlight() {
    this._externalHighlightTarget = void 0;
    if (this._commentTarget) {
      return;
    }
    this._updateHighlight(void 0);
    this._unmountWhenIdle();
  }
  comment(element, anchor) {
    this._externalHighlightTarget = void 0;
    if (this._selectionActive) {
      this.stop();
    }
    this.start({ mode: commentElementSelectionMode });
    this._showCommentComposer(element, anchor, true);
  }
  updateComments(update) {
    if (update.comments) {
      const incoming = new Map(update.comments.map((comment, index) => [comment.elementId, { body: comment.body, ordinal: index + 1 }]));
      for (const [elementId, comment] of this._comments) {
        const incomingComment = incoming.get(elementId);
        if (!incomingComment) {
          if (this._commentPreviewElementId === elementId) {
            this._hideActiveCommentPreview();
          }
          comment.pin.remove();
          this._comments.delete(elementId);
        } else {
          comment.ordinal = incomingComment.ordinal;
          if (incomingComment.body === comment.body) {
            continue;
          }
          comment.body = incomingComment.body;
          if (this._commentPreviewElementId === elementId) {
            this._setCommentPreviewBody(incomingComment.body);
            this._renderHighlight(comment.target);
          }
        }
      }
      for (const [elementId, comment] of incoming) {
        if (this._comments.has(elementId)) {
          continue;
        }
        const pending = this._pendingComments.get(elementId);
        if (pending) {
          this._scheduleCommentPin(elementId, comment.body, comment.ordinal);
        }
      }
      for (const elementId of this._scheduledCommentPins.keys()) {
        if (!incoming.has(elementId)) {
          this._discardPendingComment(elementId);
        }
      }
    }
    for (const elementId of update.pendingCommentIdsToDiscard ?? []) {
      this._discardPendingComment(elementId);
    }
    this._updateCommentPinNumbers();
    this._unmountWhenIdle();
  }
  _onScrollOrResize() {
    if (this._commentPreviewCollapsing) {
      this._hideActiveCommentPreview();
    }
    this._cancelCommentAnimations();
    if (this._highlightTarget) {
      this._renderHighlight(this._highlightTarget);
    }
    if (this._commentBackdropTarget) {
      this._layoutCommentBackdrop(this._commentBackdropTarget);
    }
    for (const comment of this._comments.values()) {
      this._layoutCommentPin(comment);
    }
  }
  // --- Picking helpers ---
  _getFocusedElement() {
    if (!document.hasFocus()) {
      return void 0;
    }
    let activeElement = document.activeElement;
    while (activeElement?.shadowRoot?.activeElement) {
      activeElement = activeElement.shadowRoot.activeElement;
    }
    if (!activeElement || activeElement === document.body || activeElement === document.documentElement || activeElement === this._shadowHost || activeElement instanceof HTMLIFrameElement) {
      return void 0;
    }
    return activeElement;
  }
  /** Return the page element under a viewport point, skipping our own overlay host. */
  _pickElementAt(x, y) {
    const candidates = document.elementsFromPoint(x, y);
    for (const el of candidates) {
      if (el === this._shadowHost || this._shadowHost.contains(el)) {
        continue;
      }
      return el;
    }
    return void 0;
  }
  /**
   * Resolve the element that "covers" a drag rectangle.
   *
   * Samples `elementFromPoint` at the 4 corners, 4 edge midpoints, and
   * center, then returns their deepest common ancestor.
   */
  _pickRegionAncestor(rect) {
    const { x, y, width, height } = rect;
    const x2 = x + width;
    const y2 = y + height;
    const cx = x + width / 2;
    const cy = y + height / 2;
    const samples = [];
    for (const [sx, sy] of [
      [x, y],
      [x2, y],
      [x, y2],
      [x2, y2],
      // corners
      [cx, y],
      [cx, y2],
      [x, cy],
      [x2, cy],
      // edge midpoints
      [cx, cy]
      // center
    ]) {
      const el = this._pickElementAt(sx, sy);
      if (el) {
        samples.push(el);
      }
    }
    return findCommonVisibleAncestor(samples);
  }
  // --- Highlight ---
  _renderHighlight(target) {
    const highlight = this._highlight;
    const label = this._label;
    const rect = target.getBoundingClientRect();
    const scrollX = window.scrollX || 0;
    const scrollY = window.scrollY || 0;
    const viewportHeight = window.innerHeight;
    const viewportWidth = document.documentElement.clientWidth;
    const visibleRect = this._getVisibleTargetBounds(rect);
    const labelHeight = 22;
    highlight.style.display = "block";
    highlight.style.left = `${rect.left + scrollX}px`;
    highlight.style.top = `${rect.top + scrollY}px`;
    highlight.style.width = `${rect.width}px`;
    highlight.style.height = `${rect.height}px`;
    this._highlightShape.style.display = "block";
    this._highlightShape.setAttribute("x", `${visibleRect.x}`);
    this._highlightShape.setAttribute("y", `${visibleRect.y}`);
    this._highlightShape.setAttribute("width", `${visibleRect.width}`);
    this._highlightShape.setAttribute("height", `${visibleRect.height}`);
    this._highlightShape.setAttribute("rx", "2");
    const tagName = String(target.tagName || "").toLowerCase();
    const idPart = target.id ? `#${target.id}` : "";
    const classPart = target.classList.length ? "." + [...target.classList].join(".") : "";
    this._labelSelector.textContent = tagName + idPart;
    this._labelClasses.textContent = classPart;
    this._labelDims.textContent = `${Math.round(rect.width)} \xD7 ${Math.round(rect.height)}`;
    label.style.display = "inline-flex";
    const idealTop = rect.top - labelHeight;
    const labelTop = Math.max(0, Math.min(viewportHeight - labelHeight, idealTop));
    label.style.left = "0";
    const naturalWidth = label.offsetWidth;
    const idealLeft = rect.left;
    const labelLeft = Math.max(0, Math.min(idealLeft, viewportWidth - naturalWidth));
    label.style.left = `${labelLeft}px`;
    label.style.top = `${labelTop}px`;
    if (this._commentPreview.style.display !== "none") {
      const previewPlacement = this._layoutCommentSurface(this._commentPreview, visibleRect, viewportWidth, viewportHeight);
      if (this._commentPreviewElementId && previewPlacement === "above" && this._elementsOverlap(label, this._commentPreview)) {
        label.style.top = `${Math.max(0, Math.min(viewportHeight - labelHeight, visibleRect.bottom + 2))}px`;
      }
    }
    if (this._commentComposer.style.display !== "none") {
      this._layoutCommentSurface(this._commentComposer, visibleRect, viewportWidth, viewportHeight);
    }
  }
  _elementsOverlap(first, second) {
    const firstBounds = first.getBoundingClientRect();
    const secondBounds = second.getBoundingClientRect();
    return firstBounds.left < secondBounds.right && firstBounds.right > secondBounds.left && firstBounds.top < secondBounds.bottom && firstBounds.bottom > secondBounds.top;
  }
  _getVisibleTargetBounds(rect) {
    const left = Math.max(0, Math.min(rect.left, window.innerWidth));
    const right = Math.max(left, Math.min(rect.right, window.innerWidth));
    const top = Math.max(0, Math.min(rect.top, window.innerHeight));
    const bottom = Math.max(top, Math.min(rect.bottom, window.innerHeight));
    return new DOMRect(left, top, right - left, bottom - top);
  }
  _layoutCommentSurface(surface, targetBounds, viewportWidth, viewportHeight) {
    if (surface === this._commentPreview) {
      surface.style.width = "max-content";
      surface.style.minWidth = "0";
      surface.style.maxWidth = `${Math.min(320, viewportWidth - 16)}px`;
      const comment = this._commentPreviewElementId ? this._comments.get(this._commentPreviewElementId) : void 0;
      if (comment) {
        const pinBounds = comment.pin.getBoundingClientRect();
        return this._layoutCommentSurfaceAtAnchor(
          surface,
          { x: pinBounds.left + pinBounds.width / 2, y: pinBounds.top + pinBounds.height / 2 },
          viewportWidth,
          viewportHeight
        );
      }
    } else if (surface === this._commentComposer && this._commentAnchor) {
      surface.style.maxWidth = `${Math.min(320, viewportWidth - 16)}px`;
      return this._layoutCommentSurfaceAtAnchor(
        surface,
        { x: this._commentAnchor.x - window.scrollX, y: this._commentAnchor.y - window.scrollY },
        viewportWidth,
        viewportHeight
      );
    }
    const surfaceHeight = surface.offsetHeight;
    const belowTop = targetBounds.bottom;
    const placement = belowTop + surfaceHeight <= viewportHeight - 8 ? "below" : "above";
    const surfaceTop = belowTop + surfaceHeight <= viewportHeight - 8 ? belowTop : Math.max(0, targetBounds.top - surfaceHeight);
    const surfaceWidth = surface.offsetWidth;
    const alignLeft = targetBounds.left + surfaceWidth <= viewportWidth;
    const alignment = alignLeft ? "left" : "right";
    const surfaceLeft = alignLeft ? Math.max(0, targetBounds.left) : Math.max(0, targetBounds.right - surfaceWidth);
    surface.dataset.attachmentCorner = `${placement === "below" ? "top" : "bottom"}-${alignment}`;
    this._setCommentSurfacePosition(surface, surfaceLeft, surfaceTop);
    return placement;
  }
  _layoutCommentSurfaceAtAnchor(surface, anchor, viewportWidth, viewportHeight) {
    const viewportInset = 8;
    let surfaceWidth = surface.offsetWidth;
    const availableRight = Math.max(0, viewportWidth - viewportInset - anchor.x);
    const availableLeft = Math.max(0, anchor.x - viewportInset);
    const opensRight = surfaceWidth <= availableRight || surfaceWidth > availableLeft && availableRight >= availableLeft;
    const availableWidth = opensRight ? availableRight : availableLeft;
    if (surfaceWidth > availableWidth) {
      surface.style.maxWidth = `${availableWidth}px`;
      surfaceWidth = surface.offsetWidth;
    }
    const surfaceHeight = surface.offsetHeight;
    const availableBelow = Math.max(0, viewportHeight - viewportInset - anchor.y);
    const availableAbove = Math.max(0, anchor.y - viewportInset);
    const opensAbove = surfaceHeight <= availableAbove || surfaceHeight > availableBelow && availableAbove >= availableBelow;
    const opensBelow = !opensAbove;
    const placement = opensBelow ? "below" : "above";
    const alignment = opensRight ? "left" : "right";
    surface.dataset.attachmentCorner = `${opensBelow ? "top" : "bottom"}-${alignment}`;
    const surfaceLeft = opensRight ? anchor.x : anchor.x - surfaceWidth;
    const surfaceTop = opensBelow ? anchor.y : Math.max(viewportInset, anchor.y - surfaceHeight);
    this._setCommentSurfacePosition(surface, surfaceLeft, surfaceTop);
    return placement;
  }
  _setCommentSurfacePosition(surface, left, top) {
    if (surface !== this._commentPreview) {
      surface.style.left = `${left}px`;
      surface.style.top = `${top}px`;
      return;
    }
    const padding = _ElementPicker._COMMENT_PREVIEW_HIT_PADDING;
    this._commentPreviewHitArea.style.left = `${left - padding}px`;
    this._commentPreviewHitArea.style.top = `${top - padding}px`;
    this._commentPreviewHitArea.style.width = `${surface.offsetWidth + padding * 2}px`;
    this._commentPreviewHitArea.style.height = `${surface.offsetHeight + padding * 2}px`;
    surface.style.left = `${padding}px`;
    surface.style.top = `${padding}px`;
  }
  _updateHighlight(target) {
    this._highlightTarget = target;
    if (!target) {
      this._highlight.style.display = "none";
      this._highlightShape.style.display = "none";
      this._label.style.display = "none";
      return;
    }
    this._renderHighlight(target);
  }
  // --- Commit ---
  _commit(target, anchor) {
    if (!this._selectionActive) {
      return;
    }
    if (this._commentMode) {
      this._showCommentComposer(target, anchor ?? this._getDefaultCommentAnchor(target), anchor !== void 0);
      return;
    }
    requestAnimationFrame(() => {
      if (!this._continuous) {
        this.stop();
      } else {
        this._updateHighlight(void 0);
      }
      this._onPicked(target);
    });
  }
  _getDefaultCommentAnchor(target) {
    const bounds = target.getBoundingClientRect();
    return { x: bounds.left, y: bounds.bottom };
  }
  _showCommentComposer(target, anchor, pointerInteraction = false) {
    this._externalHighlightTarget = void 0;
    this._hideActiveCommentPreview();
    this._commentTarget = target;
    this._commentPointerInteraction = pointerInteraction;
    this._commentAnchor = {
      x: anchor.x + window.scrollX,
      y: anchor.y + window.scrollY
    };
    this._showCommentBackdrop(target);
    this._commentLayer.classList.add("composing");
    this._commentInput.value = "";
    this._commentComposer.style.display = "flex";
    this._resizeCommentInput();
    this._updateHighlight(target);
    this._animateCommentComposer();
    this._commentInput.focus({ preventScroll: true });
    requestAnimationFrame(() => {
      if (this._commentTarget === target) {
        this._commentInput.focus({ preventScroll: true });
      }
    });
  }
  _animateCommentComposer() {
    if (this._reducedMotion) {
      return;
    }
    this._cancelCommentAnimations();
    this._commentAnimation = {
      surface: this._animateCommentSurface(this._commentComposer),
      supporting: []
    };
  }
  _setCommentSurfaceTransformOrigin(surface) {
    const [verticalOrigin, horizontalOrigin] = (surface.dataset.attachmentCorner ?? "top-left").split("-");
    surface.style.transformOrigin = `${horizontalOrigin} ${verticalOrigin}`;
  }
  _closeCommentComposer() {
    this._commentTarget = void 0;
    this._commentAnchor = void 0;
    this._hideCommentBackdrop();
    this._commentLayer.classList.remove("composing");
    this._commentComposer.style.display = "none";
    this._commentInput.value = "";
    this._cancelCommentAnimations();
    this._updateHighlight(void 0);
  }
  _finishCommentInteraction() {
    if (this._continuous) {
      this._closeCommentComposer();
    } else {
      this.stop();
    }
  }
  _submitComment() {
    const target = this._commentTarget;
    const anchor = this._commentAnchor;
    if (!target || !anchor) {
      return;
    }
    const body = this._commentInput.value.replace(/\r?\n/g, " ");
    const pendingComment = {
      target,
      anchor,
      body,
      pointerInteraction: this._commentPointerInteraction
    };
    this._commentLayer.classList.add("comment-capture-pending");
    this._finishCommentInteraction();
    const elementId = this._onPicked(target, body);
    this._pendingComments.set(elementId, pendingComment);
    this._pendingCommentInteractionId = elementId;
  }
  _restoreInteractionAfterComment(elementId, pending) {
    if (this._pendingCommentInteractionId === elementId) {
      this._pendingCommentInteractionId = void 0;
      this._commentLayer.classList.remove("comment-capture-pending");
    }
    if (this._commentTarget) {
      return;
    }
    if (!pending.pointerInteraction) {
      this._focusCommentTarget(pending.target);
    }
  }
  _focusCommentTarget(target) {
    if (!target.isConnected || !(target instanceof HTMLElement || target instanceof SVGElement)) {
      return;
    }
    const hadTabIndex = target.hasAttribute("tabindex");
    if (!hadTabIndex) {
      target.tabIndex = -1;
    }
    target.focus({ preventScroll: true });
    if (!hadTabIndex) {
      target.removeAttribute("tabindex");
    }
  }
  _discardPendingComment(elementId) {
    const pending = this._pendingComments.get(elementId);
    this._pendingComments.delete(elementId);
    this._cancelScheduledCommentPin(elementId);
    if (pending) {
      this._restoreInteractionAfterComment(elementId, pending);
    }
  }
  _cancelScheduledCommentPin(elementId) {
    const scheduled = this._scheduledCommentPins.get(elementId);
    if (!scheduled) {
      return;
    }
    window.clearTimeout(scheduled.timeout);
    cancelAnimationFrame(scheduled.animationFrame);
    this._scheduledCommentPins.delete(elementId);
  }
  _scheduleCommentPin(elementId, body, ordinal) {
    const existing = this._scheduledCommentPins.get(elementId);
    if (existing) {
      existing.body = body;
      existing.ordinal = ordinal;
      return;
    }
    const scheduled = { body, ordinal, animationFrame: 0, timeout: 0 };
    this._scheduledCommentPins.set(elementId, scheduled);
    let frameCount = 0;
    const finish = () => {
      if (this._scheduledCommentPins.get(elementId) !== scheduled) {
        return;
      }
      this._cancelScheduledCommentPin(elementId);
      const pending = this._pendingComments.get(elementId);
      if (pending) {
        this._createCommentPin(elementId, pending.target, pending.anchor, scheduled.body, scheduled.ordinal);
      }
    };
    const waitForFrame = () => {
      if (this._scheduledCommentPins.get(elementId) !== scheduled) {
        return;
      }
      frameCount++;
      if (frameCount >= _ElementPicker._COMMENT_PIN_RESTORE_FRAMES) {
        finish();
      } else {
        scheduled.animationFrame = requestAnimationFrame(waitForFrame);
      }
    };
    scheduled.timeout = window.setTimeout(finish, _ElementPicker._COMMENT_PIN_RESTORE_TIMEOUT);
    scheduled.animationFrame = requestAnimationFrame(waitForFrame);
  }
  _createCommentPin(elementId, target, anchor, body, ordinal) {
    this._ensureMounted();
    const existing = this._comments.get(elementId);
    if (existing && this._commentPreviewElementId === elementId) {
      this._hideActiveCommentPreview();
    }
    existing?.pin.remove();
    const pending = this._pendingComments.get(elementId);
    this._pendingComments.delete(elementId);
    const rect = target.getBoundingClientRect();
    const offset = {
      x: anchor.x - (rect.left + window.scrollX),
      y: anchor.y - (rect.top + window.scrollY)
    };
    const pin = document.createElement("div");
    pin.className = "comment-pin";
    pin.tabIndex = 0;
    pin.setAttribute("role", "note");
    const bubble = document.createElement("span");
    bubble.className = "comment-pin-bubble";
    const numberElement = document.createElement("span");
    numberElement.className = "comment-pin-number";
    bubble.appendChild(numberElement);
    pin.appendChild(bubble);
    const show = () => {
      if (this._commentTarget || this._pendingCommentInteractionId || this._externalHighlightTarget) {
        return;
      }
      this._showCommentPreview(elementId, target, body);
    };
    pin.addEventListener("pointermove", show);
    pin.addEventListener("focusin", show);
    pin.addEventListener("focusout", () => this._scheduleCommentPreviewHide());
    this._commentLayer.appendChild(pin);
    const comment = { target, pin, numberElement, body, ordinal, offset };
    this._comments.set(elementId, comment);
    this._updateCommentPinNumbers();
    this._layoutCommentPin(comment);
    if (pending) {
      this._restoreInteractionAfterComment(elementId, pending);
    }
  }
  _updateCommentPinNumbers() {
    for (const comment of this._comments.values()) {
      const numberLabel = String(comment.ordinal);
      comment.numberElement.textContent = numberLabel;
      comment.pin.title = comment.body || this._formatLocalizedString(localizedStrings.elementComment, numberLabel);
      comment.pin.setAttribute(
        "aria-label",
        comment.body ? this._formatLocalizedString(localizedStrings.elementCommentWithBody, numberLabel, comment.body) : this._formatLocalizedString(localizedStrings.emptyElementComment, numberLabel)
      );
    }
  }
  _applyLocalizedStrings() {
    this._commentPreviewRemoveButton.title = localizedStrings.removeComment;
    this._commentPreviewRemoveButton.setAttribute("aria-label", localizedStrings.removeElementComment);
    this._commentComposer.setAttribute("aria-label", localizedStrings.commentOnSelectedElement);
    this._commentInput.placeholder = localizedStrings.addCommentPlaceholder;
    this._commentInput.setAttribute("aria-label", localizedStrings.commentOnSelectedElement);
    this._commentSendButton.title = localizedStrings.addComment;
    this._commentSendButton.setAttribute("aria-label", localizedStrings.addComment);
    this._updateCommentPinNumbers();
  }
  _formatLocalizedString(template, ...values) {
    return template.replace(/\{(\d+)\}/g, (_, index) => values[Number(index)] ?? "");
  }
  _layoutCommentPin(comment) {
    const rect = comment.target.getBoundingClientRect();
    const x = rect.left + window.scrollX + comment.offset.x;
    const y = rect.top + window.scrollY + comment.offset.y;
    const scrollingElement = document.scrollingElement ?? document.documentElement;
    const halfWidth = comment.pin.offsetWidth / 2;
    const halfHeight = comment.pin.offsetHeight / 2;
    const clampedX = Math.max(halfWidth, Math.min(x, scrollingElement.scrollWidth - halfWidth));
    const clampedY = Math.max(halfHeight, Math.min(y, scrollingElement.scrollHeight - halfHeight));
    comment.pin.style.left = `${clampedX}px`;
    comment.pin.style.top = `${clampedY}px`;
  }
  _showCommentPreview(elementId, target, fallbackBody) {
    if (this._pendingCommentInteractionId || this._commentPreviewCollapsing) {
      return;
    }
    if (this._commentPreviewElementId === elementId) {
      this._cancelCommentPreviewHide();
      return;
    }
    this._hideActiveCommentPreview();
    this._commentPreviewElementId = elementId;
    const comment = this._comments.get(elementId);
    if (comment) {
      comment.pin.classList.add("previewing");
      comment.pin.after(this._commentPreviewHitArea);
    }
    const body = comment?.body ?? fallbackBody;
    this._setCommentPreviewBody(body);
    this._shadowHost.classList.add("comment-preview-active");
    this._updateHighlight(target);
    this._showCommentBackdrop(target);
    if (comment) {
      this._animateCommentPreview();
    }
  }
  _setCommentPreviewBody(body) {
    this._commentPreviewBody.textContent = body;
    this._commentPreview.title = body;
    this._commentPreview.classList.toggle("empty", !body);
    this._commentPreviewHitArea.style.display = "block";
    this._commentPreview.style.display = "flex";
  }
  _animateCommentPreview(collapsing = false) {
    if (this._reducedMotion) {
      return void 0;
    }
    const previewAnimation = this._animateCommentSurface(this._commentPreview, collapsing);
    const supportingKeyframes = collapsing ? [{ opacity: 1 }, { opacity: 0 }] : [{ opacity: 0 }, { opacity: 1 }];
    const supportingAnimations = [];
    for (const element of [this._highlightShape, this._label]) {
      if (element.style.display === "none") {
        continue;
      }
      const animation = element.animate(supportingKeyframes, { duration: _ElementPicker._COMMENT_SUPPORTING_FADE_DURATION, easing: "linear", fill: "both" });
      supportingAnimations.push(animation);
    }
    this._commentAnimation = { surface: previewAnimation, supporting: supportingAnimations };
    return previewAnimation;
  }
  _animateCommentSurface(surface, collapsing = false) {
    this._setCommentSurfaceTransformOrigin(surface);
    return surface.animate(
      collapsing ? [{ transform: "scale(1)" }, { transform: "scale(0)" }] : [{ transform: "scale(0)" }, { transform: "scale(1)" }],
      { duration: _ElementPicker._COMMENT_SURFACE_ANIMATION_DURATION, easing: "cubic-bezier(0.2, 0, 0, 1)", fill: "forwards" }
    );
  }
  _scheduleCommentPreviewHide() {
    if (this._commentPreviewCollapsing) {
      return;
    }
    this._cancelCommentPreviewHide();
    this._commentPreviewHideTimeout = window.setTimeout(() => {
      this._commentPreviewHideTimeout = void 0;
      const comment = this._commentPreviewElementId ? this._comments.get(this._commentPreviewElementId) : void 0;
      const pinFocused = comment?.pin.matches(":focus-within") ?? false;
      const hitAreaActive = this._commentPreviewHitArea.matches(":hover, :focus-within");
      if (pinFocused || hitAreaActive) {
        return;
      }
      this._collapseActiveCommentPreview();
    }, _ElementPicker._COMMENT_PREVIEW_HIDE_DELAY);
  }
  _cancelCommentPreviewHide() {
    if (this._commentPreviewHideTimeout !== void 0) {
      window.clearTimeout(this._commentPreviewHideTimeout);
      this._commentPreviewHideTimeout = void 0;
    }
  }
  _collapseActiveCommentPreview() {
    if (this._commentPreviewCollapsing) {
      return;
    }
    const elementId = this._commentPreviewElementId;
    const comment = elementId ? this._comments.get(elementId) : void 0;
    if (!elementId || !comment || this._reducedMotion) {
      this._hideActiveCommentPreview();
      return;
    }
    this._commentPreviewCollapsing = true;
    this._shadowHost.classList.add("comment-preview-collapsing");
    this._hideCommentBackdrop();
    const commentAnimation = this._commentAnimation;
    let surfaceAnimation;
    if (commentAnimation) {
      surfaceAnimation = commentAnimation.surface;
      surfaceAnimation.reverse();
      for (const animation of commentAnimation.supporting) {
        animation.reverse();
      }
    } else {
      surfaceAnimation = this._animateCommentPreview(true);
    }
    if (!surfaceAnimation) {
      this._hideActiveCommentPreview();
      return;
    }
    surfaceAnimation.onfinish = () => {
      if (this._commentPreviewCollapsing && this._commentPreviewElementId === elementId) {
        this._commentPreviewCollapsing = false;
        this._hideActiveCommentPreview();
      }
    };
  }
  _cancelCommentAnimations() {
    if (!this._commentAnimation) {
      return;
    }
    this._commentAnimation.surface.cancel();
    for (const animation of this._commentAnimation.supporting) {
      animation.cancel();
    }
    this._commentAnimation = void 0;
  }
  _hideActiveCommentPreview() {
    this._cancelCommentPreviewHide();
    this._commentPreviewCollapsing = false;
    this._shadowHost.classList.remove("comment-preview-collapsing");
    if (this._commentPreviewElementId) {
      this._comments.get(this._commentPreviewElementId)?.pin.classList.remove("previewing");
    }
    this._commentPreviewElementId = void 0;
    this._shadowHost.classList.remove("comment-preview-active");
    this._commentPreviewHitArea.style.display = "none";
    this._commentPreview.style.display = "none";
    this._hideCommentBackdrop();
    if (!this._commentTarget) {
      this._updateHighlight(this._externalHighlightTarget);
    }
    this._cancelCommentAnimations();
  }
  _removeComment(elementId) {
    const comment = this._comments.get(elementId);
    if (!comment) {
      return;
    }
    this._hideActiveCommentPreview();
    comment.pin.remove();
    this._comments.delete(elementId);
    this._updateCommentPinNumbers();
    this._unmountWhenIdle();
    this._onCommentRemoved(elementId);
  }
  _layoutCommentInput() {
    this._resizeCommentInput();
    this._layoutCommentComposer();
  }
  _resizeCommentInput() {
    this._commentInput.style.height = "auto";
    this._commentInput.style.height = `${Math.min(this._commentInput.scrollHeight, 96)}px`;
  }
  _layoutCommentBackdrop(target) {
    const rect = this._getVisibleTargetBounds(target.getBoundingClientRect());
    this._commentBackdropCutout.setAttribute("x", `${rect.x}`);
    this._commentBackdropCutout.setAttribute("y", `${rect.y}`);
    this._commentBackdropCutout.setAttribute("width", `${rect.width}`);
    this._commentBackdropCutout.setAttribute("height", `${rect.height}`);
    this._commentBackdropCutout.setAttribute("rx", "2");
  }
  _showCommentBackdrop(target) {
    const request = ++this._commentBackdropRequest;
    this._commentBackdropTarget = target;
    this._layoutCommentBackdrop(target);
    this._commentBackdrop.classList.remove("visible");
    requestAnimationFrame(() => {
      if (this._commentBackdropRequest === request) {
        this._commentBackdrop.classList.add("visible");
      }
    });
  }
  _hideCommentBackdrop() {
    this._commentBackdropRequest++;
    this._commentBackdropTarget = void 0;
    this._commentBackdrop.classList.remove("visible");
  }
  _layoutCommentComposer() {
    if (!this._commentTarget) {
      return;
    }
    this._renderHighlight(this._commentTarget);
  }
  _ensureMounted() {
    if (!this._shadowHost.parentNode) {
      document.documentElement.appendChild(this._shadowHost);
    }
  }
  _unmountWhenIdle() {
    if (!this._selectionActive && !this._highlightTarget && this._comments.size === 0) {
      this._shadowHost.remove();
    }
  }
  // --- Static helpers ---
  /**
   * Inject the shadow-root stylesheet. Custom properties on the host
   * element drive the colors so the workbench can theme them.
   *
   * We deliberately do **not** use a `*` selector with `all: initial` —
   * that would also reset `<style>`'s default `display: none`, causing
   * the literal CSS source to render as page text.
   */
  static _buildStyle() {
    const style = document.createElement("style");
    style.textContent = `
			:host {
				all: initial;
				font-family: var(--pick-font, system-ui, -apple-system, sans-serif);
				pointer-events: none !important;
			}
			.highlight {
				position: absolute; box-sizing: border-box;
				z-index: 2;
			}
			.comment-backdrop {
				position: fixed;
				inset: 0;
				width: 100%;
				height: 100%;
				pointer-events: none;
				z-index: 2;
			}
			.comment-backdrop-fill {
				fill: var(--vscode-widget-shadow, transparent);
				opacity: 0;
				transition: opacity 120ms linear;
			}
			.comment-backdrop.visible .comment-backdrop-fill {
				opacity: 1;
			}
			.highlight-shape {
				fill: color-mix(in srgb, var(--vscode-focusBorder, #0078d4) 12%, transparent);
				stroke: var(--vscode-focusBorder, #0078d4);
				stroke-width: 2px;
			}
			.overlay {
				position: fixed; inset: 0;
				background: transparent; box-sizing: border-box;
				z-index: 2;
			}
			.comment-layer {
				position: absolute; inset: 0; pointer-events: none;
			}
			.comment-surface {
				position: fixed;
				box-sizing: border-box;
				width: min(320px, calc(100vw - 16px));
				border: var(--vscode-strokeThickness, 1px) solid var(--vscode-editorWidget-border, var(--vscode-contrastBorder, #454545));
				border-radius: var(--vscode-cornerRadius-large, 8px);
				background: var(--vscode-editorWidget-background, #252526);
				color: var(--vscode-editorWidget-foreground, #cccccc);
				box-shadow: 0 2px 6px var(--vscode-widget-shadow, transparent);
				font-size: 13px;
				font-weight: 400;
				z-index: 4;
			}
			.comment-surface[data-attachment-corner='top-left'] {
				border-top-left-radius: 0;
			}
			.comment-surface[data-attachment-corner='top-right'] {
				border-top-right-radius: 0;
			}
			.comment-surface[data-attachment-corner='bottom-left'] {
				border-bottom-left-radius: 0;
			}
			.comment-surface[data-attachment-corner='bottom-right'] {
				border-bottom-right-radius: 0;
			}
			.comment-preview-hit-area {
				position: fixed;
				pointer-events: none;
				z-index: 4;
			}
			.comment-preview {
				position: absolute;
				align-items: flex-start;
				gap: 8px;
				max-height: 96px;
				padding: 6px 8px;
				overflow: hidden;
				line-height: 20px;
				pointer-events: none;
			}
			.comment-preview.empty {
				gap: 0;
				padding: 4px;
			}
			.comment-preview.empty .comment-preview-body {
				display: none;
			}
			.comment-preview.empty .comment-preview-remove {
				margin-block: 0;
			}
			.comment-preview-body {
				flex: 1;
				min-width: 0;
				max-height: 82px;
				overflow-x: hidden;
				overflow-y: auto;
				overflow-wrap: anywhere;
				scrollbar-width: thin;
				white-space: pre-wrap;
			}
			:host(.comment-preview-active) .comment-preview-hit-area,
			:host(.comment-preview-active) .comment-preview {
				pointer-events: auto;
			}
			:host(.comment-preview-collapsing) .comment-preview-hit-area,
			:host(.comment-preview-collapsing) .comment-preview {
				pointer-events: none;
			}
			.comment-preview-remove {
				flex: none;
				display: grid;
				place-items: center;
				box-sizing: border-box;
				width: 24px;
				height: 24px;
				margin-block: -2px;
				padding: 0;
				border: 0;
				border-radius: var(--vscode-cornerRadius-small, 4px);
				background: transparent;
				color: var(--vscode-editorWidget-foreground, inherit);
				cursor: pointer;
				font-family: inherit;
			}
			.comment-preview-remove svg {
				display: block;
				width: var(--vscode-codiconFontSize, 16px);
				height: var(--vscode-codiconFontSize, 16px);
			}
			.comment-preview-remove:hover {
				background: var(--vscode-toolbar-hoverBackground, transparent);
			}
			.comment-composer {
				align-items: flex-end; gap: 6px; padding: 6px;
				pointer-events: auto;
			}
			.comment-input {
				flex: 1; min-width: 0; resize: none; overflow: auto;
				scrollbar-width: none;
				box-sizing: border-box; margin: 0; padding: 2px 6px;
				background: transparent; color: inherit;
				border: var(--vscode-strokeThickness, 1px) solid var(--vscode-editorWidget-border, var(--vscode-contrastBorder, #454545));
				border-radius: var(--vscode-cornerRadius-small, 4px);
				outline: 0;
				font: inherit;
				line-height: 20px;
				caret-color: var(--vscode-focusBorder, currentColor);
			}
			.comment-input::-webkit-scrollbar {
				display: none;
			}
			.comment-input::placeholder {
				color: var(--vscode-input-placeholderForeground, var(--vscode-descriptionForeground, #ccccccb3));
				opacity: 1;
			}
			.comment-send {
				box-sizing: border-box; border: 0; cursor: pointer; font-family: inherit;
			}
			.comment-send {
				flex: none; width: 24px; height: 24px; padding: 0;
				border-radius: var(--vscode-cornerRadius-small, 4px);
				background: transparent;
				color: var(--vscode-editorWidget-foreground, #cccccc);
				display: grid;
				place-items: center;
			}
			.comment-send svg {
				display: block;
				width: var(--vscode-codiconFontSize, 16px);
				height: var(--vscode-codiconFontSize, 16px);
			}
			.comment-send:hover {
				background: var(--vscode-toolbar-hoverBackground, transparent);
			}
			.comment-pin {
				position: absolute;
				display: grid;
				place-items: center;
				width: 22px;
				height: 22px;
				transform: translate(-11px, -11px);
				pointer-events: auto;
				z-index: 0;
				transition: opacity 120ms linear;
			}
			.comment-layer.composing .comment-pin {
				opacity: 0;
				pointer-events: none;
				z-index: auto;
			}
			.comment-layer.comment-capture-pending .comment-pin {
				visibility: hidden;
			}
			.comment-pin:hover, .comment-pin:focus-within {
				z-index: 1;
			}
			.comment-pin.previewing {
				z-index: 0;
			}
			:host(.comment-preview-active) .comment-pin:not(.previewing) {
				opacity: 0.35;
			}
			.comment-pin.previewing .comment-pin-bubble {
				width: 6px;
				height: 6px;
				border-width: 0;
			}
			.comment-pin.previewing .comment-pin-number {
				opacity: 0;
			}
			.comment-pin-bubble {
				box-sizing: border-box;
				display: grid;
				place-items: center;
				width: 22px;
				height: 22px;
				padding: 0;
				border: var(--vscode-strokeThickness, 1px) solid var(--vscode-editorWidget-background, #252526);
				border-radius: var(--vscode-cornerRadius-circle, 9999px);
				background: var(--vscode-button-background, #0078d4);
				color: var(--vscode-button-foreground, white);
				box-shadow: 0 2px 6px var(--vscode-widget-shadow, transparent);
				transition: width 140ms cubic-bezier(0.2, 0, 0, 1), height 140ms cubic-bezier(0.2, 0, 0, 1), border-width 140ms cubic-bezier(0.2, 0, 0, 1);
			}
			.comment-pin-number {
				display: block;
				width: 100%;
				font-size: 11px;
				font-weight: 600;
				line-height: 12px;
				text-align: center;
				transition: opacity 80ms linear;
			}
			.comment-send:focus-visible, .comment-preview-remove:focus-visible, .comment-pin:focus-visible, .comment-input:focus-visible {
				outline: 2px solid var(--vscode-focusBorder, #0078d4);
				outline-offset: 2px;
			}
			:host(.reduce-motion) .comment-backdrop-fill,
			:host(.reduce-motion) .comment-pin,
			:host(.reduce-motion) .comment-pin-bubble,
			:host(.reduce-motion) .comment-pin-number {
				transition: none;
			}
			.label {
				position: fixed; box-sizing: border-box;
				display: inline-flex; align-items: center; gap: 6px; height: 20px; padding: 0 6px;
				max-width: min(100%, 320px);
				background: var(--vscode-button-background, #0078d4);
				color: var(--vscode-button-foreground, white);
				font-family: inherit;
				font-size: 11px; line-height: 20px;
				white-space: nowrap;
				border-radius: 2px;
				box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
				z-index: 3;
			}
			.label-info {
				display: inline-block; overflow: hidden; text-overflow: ellipsis; min-width: 0;
			}
			.label-selector {
				font-weight: 600;
			}
			.label-dims {
				flex-shrink: 0; opacity: 0.8;
			}
			.dragbox {
				position: fixed; box-sizing: border-box;
				border: 1px dotted var(--vscode-focusBorder, #a0aabe);
				background: transparent;
				z-index: 2;
			}
		`;
    return style;
  }
  static _applyTheme(host, theme) {
    host.style.setProperty("--vscode-focusBorder", theme?.focusBorder ?? null);
    host.style.setProperty("--vscode-button-background", theme?.buttonBackground ?? null);
    host.style.setProperty("--vscode-button-foreground", theme?.buttonForeground ?? null);
    host.style.setProperty("--vscode-editorWidget-background", theme?.widgetBackground ?? null);
    host.style.setProperty("--vscode-editorWidget-foreground", theme?.widgetForeground ?? null);
    host.style.setProperty("--vscode-editorWidget-border", theme?.widgetBorder ?? null);
    host.style.setProperty("--vscode-widget-shadow", theme?.widgetShadow ?? null);
    host.style.setProperty("--vscode-contrastBorder", theme?.contrastBorder ?? null);
    host.style.setProperty("--vscode-descriptionForeground", theme?.descriptionForeground ?? null);
    host.style.setProperty("--vscode-input-placeholderForeground", theme?.inputPlaceholderForeground ?? null);
    host.style.setProperty("--vscode-toolbar-hoverBackground", theme?.toolbarHoverBackground ?? null);
    host.style.setProperty("--pick-font", theme?.font ?? null);
  }
};
_ElementPicker._DRAG_THRESHOLD_PX = 4;
_ElementPicker._COMMENT_PIN_SIZE = 22;
_ElementPicker._COMMENT_PIN_RESTORE_FRAMES = 5;
_ElementPicker._COMMENT_PIN_RESTORE_TIMEOUT = 100;
_ElementPicker._COMMENT_PREVIEW_HIT_PADDING = _ElementPicker._COMMENT_PIN_SIZE / 2;
_ElementPicker._COMMENT_PREVIEW_HIDE_DELAY = 80;
_ElementPicker._COMMENT_SURFACE_ANIMATION_DURATION = 140;
_ElementPicker._COMMENT_SUPPORTING_FADE_DURATION = 120;
_ElementPicker._CURSOR_DEFAULT = "/* VS Code injected style */ * { cursor: default !important; }";
_ElementPicker._CURSOR_CROSSHAIR = "/* VS Code injected style */ * { cursor: crosshair !important; }";
let ElementPicker = _ElementPicker;
const _AreaPicker = class _AreaPicker {
  constructor(_onPicked, _onStopped) {
    this._onPicked = _onPicked;
    this._onStopped = _onStopped;
    this._selectionActive = false;
    this._onPointerDown = (e) => {
      if (!this._selectionActive || e.button !== 0) {
        return;
      }
      this._dragStart = { x: e.clientX, y: e.clientY };
      this._dragbox.style.display = "block";
      this._dragbox.style.left = `${e.clientX}px`;
      this._dragbox.style.top = `${e.clientY}px`;
      this._dragbox.style.width = "0px";
      this._dragbox.style.height = "0px";
      e.preventDefault();
      e.stopPropagation();
    };
    this._onPointerMove = (e) => {
      if (!this._selectionActive || !this._dragStart) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      const left = Math.min(this._dragStart.x, e.clientX);
      const top = Math.min(this._dragStart.y, e.clientY);
      const width = Math.abs(e.clientX - this._dragStart.x);
      const height = Math.abs(e.clientY - this._dragStart.y);
      this._dragbox.style.left = `${left}px`;
      this._dragbox.style.top = `${top}px`;
      this._dragbox.style.width = `${width}px`;
      this._dragbox.style.height = `${height}px`;
    };
    this._onPointerUp = (e) => {
      if (!this._selectionActive || !this._dragStart) {
        return;
      }
      const start = this._dragStart;
      const left = Math.min(start.x, e.clientX);
      const top = Math.min(start.y, e.clientY);
      const width = Math.abs(e.clientX - start.x);
      const height = Math.abs(e.clientY - start.y);
      this._teardown();
      e.preventDefault();
      e.stopPropagation();
      if (width < _AreaPicker._MIN_AREA_PX || height < _AreaPicker._MIN_AREA_PX) {
        this._onStopped();
        return;
      }
      const vv = window.visualViewport;
      const offsetLeft = vv?.offsetLeft ?? 0;
      const offsetTop = vv?.offsetTop ?? 0;
      const rect = { x: left - offsetLeft, y: top - offsetTop, width, height };
      this._onPicked(rect);
    };
    this._onClick = (e) => {
      if (!this._selectionActive) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
    };
    this._onKeyDown = (e) => {
      if (!this._selectionActive) {
        return;
      }
      if (e.key === "Escape") {
        this.stop();
        e.preventDefault();
        e.stopPropagation();
      }
    };
    const shadowHost = document.createElement("div");
    shadowHost.setAttribute("data-vscode-area-pick-host", "");
    shadowHost.style.cssText = "position: absolute; top: 0; left: 0; width: 0; height: 0; z-index: 2147483647; pointer-events: none;";
    const root = shadowHost.attachShadow({ mode: "closed" });
    root.appendChild(_AreaPicker._buildStyle());
    this._shadowHost = shadowHost;
    const overlay = document.createElement("div");
    overlay.className = "overlay";
    root.appendChild(overlay);
    const dragbox = document.createElement("div");
    dragbox.className = "dragbox";
    dragbox.style.display = "none";
    root.appendChild(dragbox);
    this._dragbox = dragbox;
  }
  start() {
    if (this._selectionActive) {
      return;
    }
    this._dragStart = void 0;
    document.documentElement.appendChild(this._shadowHost);
    this._selectionActive = true;
    const cursorStyle = document.createElement("style");
    cursorStyle.setAttribute("data-vscode-area-pick-cursor", "");
    cursorStyle.textContent = _AreaPicker._CURSOR_CROSSHAIR;
    document.head.appendChild(cursorStyle);
    this._cursorStylesheet = cursorStyle;
    window.addEventListener("pointermove", this._onPointerMove, true);
    window.addEventListener("pointerdown", this._onPointerDown, true);
    window.addEventListener("pointerup", this._onPointerUp, true);
    window.addEventListener("click", this._onClick, true);
    window.addEventListener("contextmenu", this._onClick, true);
    window.addEventListener("keydown", this._onKeyDown, true);
  }
  stop() {
    if (!this._selectionActive) {
      return;
    }
    this._teardown();
    this._onStopped();
  }
  /**
   * Synchronous teardown of the overlay, cursor style, and event listeners.
   * Used by both {@link stop} (which then fires `_onStopped`) and `_onPointerUp`
   * (which fires `_onPicked` or `_onStopped` after teardown completes, so the
   * IPC consumer can capture the page without our overlay in the frame).
   */
  _teardown() {
    this._selectionActive = false;
    this._shadowHost.remove();
    this._cursorStylesheet?.remove();
    this._cursorStylesheet = void 0;
    window.removeEventListener("pointermove", this._onPointerMove, true);
    window.removeEventListener("pointerdown", this._onPointerDown, true);
    window.removeEventListener("pointerup", this._onPointerUp, true);
    window.removeEventListener("click", this._onClick, true);
    window.removeEventListener("contextmenu", this._onClick, true);
    window.removeEventListener("keydown", this._onKeyDown, true);
    this._dragbox.style.display = "none";
    this._dragbox.style.left = "0px";
    this._dragbox.style.top = "0px";
    this._dragbox.style.width = "0px";
    this._dragbox.style.height = "0px";
    this._dragStart = void 0;
  }
  setTheme(theme) {
    this._shadowHost.style.setProperty("--vscode-focusBorder", theme?.focusBorder ?? null);
  }
  static _buildStyle() {
    const style = document.createElement("style");
    style.textContent = `
			:host {
				all: initial;
				pointer-events: none !important;
			}
			.overlay {
				position: fixed; inset: 0;
				background: transparent;
				z-index: 1;
				/* Capture hit-testing so pointer events don't reach the underlying
				 * page during a pick \u2014 otherwise hover/:hover styles would
				 * fire on elements beneath the cursor while we're dragging. */
				pointer-events: auto;
			}
			.dragbox {
				position: fixed; box-sizing: border-box;
				border: 1px dashed var(--vscode-focusBorder, #0078d4);
				background: color-mix(in srgb, var(--vscode-focusBorder, #0078d4) 12%, transparent);
				z-index: 2;
				pointer-events: auto;
			}
		`;
    return style;
  }
};
_AreaPicker._MIN_AREA_PX = 4;
_AreaPicker._CURSOR_CROSSHAIR = "/* VS Code injected style */ * { cursor: crosshair !important; }";
let AreaPicker = _AreaPicker;
init();
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYnJvd3NlclZpZXdcXGVsZWN0cm9uLWJyb3dzZXJcXHByZWxvYWQtYnJvd3NlclZpZXcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG4vKiBlc2xpbnQtZGlzYWJsZSBuby1yZXN0cmljdGVkLWdsb2JhbHMgKi9cbi8qIGVzbGludC1kaXNhYmxlIG5vLXJlc3RyaWN0ZWQtc3ludGF4ICovXG5cbi8vIE9ubHkgYGltcG9ydCB0eXBlYCBpcyBhbGxvd2VkIGluIHByZWxvYWQgc2NyaXB0cyBcdTIwMTQgRWxlY3Ryb24gcHJlbG9hZHMgY2Fubm90IHJlc29sdmUgbW9kdWxlIGltcG9ydHMgYXQgcnVudGltZS5cbmltcG9ydCB0eXBlIHsgQnJvd3NlckVsZW1lbnRTZWxlY3Rpb25Nb2RlLCBJQnJvd3NlckVsZW1lbnRDb21tZW50c1VwZGF0ZSwgSUJyb3dzZXJFbGVtZW50U2VsZWN0aW9uT3B0aW9ucywgSUJyb3dzZXJWaWV3UHJlbG9hZExvY2FsaXplZFN0cmluZ3MsIElCcm93c2VyVmlld1RoZW1lLCBJQnJvd3NlclZpZXdSZWN0IH0gZnJvbSAnLi4vY29tbW9uL2Jyb3dzZXJWaWV3LmpzJztcblxuY29uc3QgY29tbWVudEVsZW1lbnRTZWxlY3Rpb25Nb2RlID0gJ2NvbW1lbnQnIGFzIEJyb3dzZXJFbGVtZW50U2VsZWN0aW9uTW9kZTtcbmxldCBsb2NhbGl6ZWRTdHJpbmdzOiBJQnJvd3NlclZpZXdQcmVsb2FkTG9jYWxpemVkU3RyaW5ncyA9IHtcblx0YWRkQ29tbWVudDogJ0FkZCBDb21tZW50Jyxcblx0YWRkQ29tbWVudFBsYWNlaG9sZGVyOiAnQWRkIGEgY29tbWVudCcsXG5cdGNvbW1lbnRPblNlbGVjdGVkRWxlbWVudDogJ0NvbW1lbnQgb24gc2VsZWN0ZWQgZWxlbWVudCcsXG5cdGVsZW1lbnRDb21tZW50OiAnRWxlbWVudCBjb21tZW50IHswfScsXG5cdGVsZW1lbnRDb21tZW50V2l0aEJvZHk6ICdFbGVtZW50IGNvbW1lbnQgezB9OiB7MX0nLFxuXHRlbXB0eUVsZW1lbnRDb21tZW50OiAnRW1wdHkgZWxlbWVudCBjb21tZW50IHswfScsXG5cdHJlbW92ZUNvbW1lbnQ6ICdSZW1vdmUgQ29tbWVudCcsXG5cdHJlbW92ZUVsZW1lbnRDb21tZW50OiAnUmVtb3ZlIGVsZW1lbnQgY29tbWVudCcsXG59O1xuXG4vKipcbiAqIFByZWxvYWQgc2NyaXB0IGZvciBwYWdlcyBsb2FkZWQgaW4gSW50ZWdyYXRlZCBCcm93c2VyXG4gKlxuICogSXQgcnVucyBpbiBhbiBpc29sYXRlZCBjb250ZXh0IHRoYXQgRWxlY3Ryb24gY2FsbHMgYW4gXCJpc29sYXRlZCB3b3JsZFwiLlxuICogU3BlY2lmaWNhbGx5IHRoZSBpc29sYXRlZCB3b3JsZCB3aXRoIHdvcmxkSWQgOTk5LCB3aGljaCBzaG93cyBpbiBEZXZUb29scyBhcyBcIkVsZWN0cm9uIElzb2xhdGVkIENvbnRleHRcIi5cbiAqIERlc3BpdGUgYmVpbmcgaXNvbGF0ZWQsIGl0IHN0aWxsIHJ1bnMgb24gdGhlIHNhbWUgcGFnZSBhcyB0aGUgSlMgZnJvbSB0aGUgYWN0dWFsIGxvYWRlZCB3ZWJzaXRlXG4gKiB3aGljaCBydW5zIG9uIHRoZSBzby1jYWxsZWQgXCJtYWluIHdvcmxkXCIgKHdvcmxkSWQgMC4gSW4gRGV2VG9vbHMgYXMgXCJ0b3BcIikuXG4gKlxuICogTGVhcm4gbW9yZTogc2VlIEVsZWN0cm9uIGRvY3MgZm9yIFNlY3VyaXR5LCBjb250ZXh0QnJpZGdlLCBhbmQgQ29udGV4dCBJc29sYXRpb24uXG4gKi9cbmZ1bmN0aW9uIGluaXQoKSB7XG5cdGNvbnN0IHsgY29udGV4dEJyaWRnZSwgaXBjUmVuZGVyZXIgfSA9IHJlcXVpcmUoJ2VsZWN0cm9uJyk7XG5cblx0Ly8gIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyNcblx0Ly8gIyMjICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAjIyNcblx0Ly8gIyMjICAgICAgICEhISBETyBOT1QgVVNFIEdFVC9TRVQgUFJPUEVSVElFUyBBTllXSEVSRSBIRVJFICEhISAgICAgICAjIyNcblx0Ly8gIyMjICAgICAgICEhISAgVU5MRVNTIFRIRSBBQ0NFU1MgSVMgV0lUSE9VVCBTSURFIEVGRkVDVFMgICEhISAgICAgICAjIyNcblx0Ly8gIyMjICAgICAgIChodHRwczovL2dpdGh1Yi5jb20vZWxlY3Ryb24vZWxlY3Ryb24vaXNzdWVzLzI1NTE2KSAgICAgICAjIyNcblx0Ly8gIyMjICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAjIyNcblx0Ly8gIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyNcblxuXHQvLyBDdHJsL0NtZCBrZXliaW5kaW5ncyB0aGF0IGNvcnJlc3BvbmQgdG8gbmF0aXZlIGVkaXRpbmcgc2hvcnRjdXRzIGFuZCBzaG91bGQgYmUgaGFuZGxlZCBieSB0aGUgYnJvd3NlciAvIE9TIGFuZCBub3QgZm9yd2FyZGVkIHRvIHRoZSB3b3JrYmVuY2guXG5cdGNvbnN0IG5hdGl2ZUN0cmxDbWRLZXliaW5kaW5ncyA9IHtcblx0XHRtYWM6IHtcblx0XHRcdGFsd2F5czogbmV3IFNldChbJ2Fycm93dXAnLCAnYXJyb3dkb3duJywgJ2Fycm93bGVmdCcsICdhcnJvd3JpZ2h0JywgJ2JhY2tzcGFjZScsICdkZWxldGUnXSksXG5cdFx0XHRub1NoaWZ0OiBuZXcgU2V0KFsnYScsICdjJywgJ3YnLCAneCcsICd6J10pLFxuXHRcdFx0d2l0aFNoaWZ0OiBuZXcgU2V0KFsndicsICd6J10pLFxuXHRcdH0sXG5cdFx0bm9uTWFjOiB7XG5cdFx0XHRhbHdheXM6IG5ldyBTZXQoWydhcnJvd3VwJywgJ2Fycm93ZG93bicsICdhcnJvd2xlZnQnLCAnYXJyb3dyaWdodCcsICdob21lJywgJ2VuZCcsICdiYWNrc3BhY2UnLCAnZGVsZXRlJ10pLFxuXHRcdFx0bm9TaGlmdDogbmV3IFNldChbJ2EnLCAnYycsICd2JywgJ3gnLCAneicsICd5J10pLFxuXHRcdFx0d2l0aFNoaWZ0OiBuZXcgU2V0KFsndicsICd6J10pLFxuXHRcdH1cblx0fTtcblxuXHQvLyBMaXN0ZW4gZm9yIGtleWRvd24gZXZlbnRzIHRoYXQgdGhlIHBhZ2UgZGlkIG5vdCBoYW5kbGUgYW5kIGZvcndhcmQgdGhlbSBmb3Igc2hvcnRjdXQgaGFuZGxpbmcuXG5cdHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdrZXlkb3duJywgKGV2ZW50KSA9PiB7XG5cdFx0Ly8gUmVxdWlyZSB0aGF0IHRoZSBldmVudCBpcyB0cnVzdGVkIC0tIGkuZS4gdXNlci1pbml0aWF0ZWQuXG5cdFx0aWYgKCEoZXZlbnQgaW5zdGFuY2VvZiBLZXlib2FyZEV2ZW50KSB8fCAhZXZlbnQuaXNUcnVzdGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gSWYgdGhlIGV2ZW50IHdhcyBhbHJlYWR5IGhhbmRsZWQgYnkgdGhlIHBhZ2UsIGRvIG5vdCBmb3J3YXJkIGl0LlxuXHRcdGlmIChldmVudC5kZWZhdWx0UHJldmVudGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgaXNOb25FZGl0aW5nS2V5ID1cblx0XHRcdGV2ZW50LmtleSA9PT0gJ0VzY2FwZScgfHxcblx0XHRcdC9eRlxcZCskLy50ZXN0KGV2ZW50LmtleSkgfHxcblx0XHRcdGV2ZW50LmtleS5zdGFydHNXaXRoKCdBdWRpbycpIHx8IGV2ZW50LmtleS5zdGFydHNXaXRoKCdNZWRpYScpIHx8IGV2ZW50LmtleS5zdGFydHNXaXRoKCdCcm93c2VyJyk7XG5cblx0XHQvLyBPbmx5IGZvcndhcmQgaWYgdGhlcmUncyBhIGNvbW1hbmQgbW9kaWZpZXIgb3IgaXQncyBhIG5vbi1lZGl0aW5nIGtleVxuXHRcdC8vIChtb3N0IHBsYWluIGtleSBldmVudHMgc2hvdWxkIGp1c3QgYmUgaGFuZGxlZCBuYXRpdmVseSBieSB0aGUgYnJvd3NlciBhbmQgbm90IGZvcndhcmRlZClcblx0XHRpZiAoIShldmVudC5jdHJsS2V5IHx8IGV2ZW50LmFsdEtleSB8fCBldmVudC5tZXRhS2V5KSAmJiAhaXNOb25FZGl0aW5nS2V5KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gTmV2ZXIgaGFuZGxlIHBsYWluIG1vZGlmaWVyIGtleSBwcmVzc2VzIGFzIGtleWJpbmRpbmdzXG5cdFx0aWYgKGV2ZW50LmtleSA9PT0gJ0NvbnRyb2wnIHx8IGV2ZW50LmtleSA9PT0gJ1NoaWZ0JyB8fCBldmVudC5rZXkgPT09ICdBbHQnIHx8IGV2ZW50LmtleSA9PT0gJ01ldGEnKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgaXNNYWMgPSBuYXZpZ2F0b3IucGxhdGZvcm0uaW5kZXhPZignTWFjJykgPj0gMDtcblxuXHRcdC8vIEFsdCtLZXkgc3BlY2lhbCBjaGFyYWN0ZXIgaGFuZGxpbmcgKEFsdCArIE51bXBhZCBrZXlzIG9uIFdpbmRvd3MvTGludXgsIEFsdCArIGFueSBrZXkgb24gTWFjKVxuXHRcdGlmIChldmVudC5hbHRLZXkgJiYgIWV2ZW50LmN0cmxLZXkgJiYgIWV2ZW50Lm1ldGFLZXkpIHtcblx0XHRcdGlmIChpc01hYyB8fCAvXk51bXBhZFxcZCskLy50ZXN0KGV2ZW50LmNvZGUpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBBbGxvdyBTaGlmdCtGMTAgZm9yIGNvbnRleHQgbWVudVxuXHRcdGlmIChldmVudC5rZXkgPT09ICdGMTAnICYmIGV2ZW50LnNoaWZ0S2V5ICYmICFldmVudC5jdHJsS2V5ICYmICFldmVudC5hbHRLZXkgJiYgIWV2ZW50Lm1ldGFLZXkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBBbGxvdyBuYXRpdmUgc2hvcnRjdXRzIHRvIGJlIGhhbmRsZWQgYnkgdGhlIGJyb3dzZXJcblx0XHRjb25zdCBjdHJsQ21kID0gaXNNYWMgPyBldmVudC5tZXRhS2V5IDogZXZlbnQuY3RybEtleTtcblx0XHRpZiAoY3RybENtZCAmJiAhZXZlbnQuYWx0S2V5KSB7XG5cdFx0XHRsZXQga2V5ID0gZXZlbnQua2V5LnRvTG93ZXJDYXNlKCk7XG5cdFx0XHQvLyBQcmVmZXIgcmVtYXBwZWQgTGF0aW4gbGV0dGVycywgZmFsbGluZyBiYWNrIHRvIHRoZSBwaHlzaWNhbCBrZXkgZm9yIG5vbi1MYXRpbiBsYXlvdXRzLlxuXHRcdFx0aWYgKCEvXlthLXpdJC8udGVzdChrZXkpICYmIC9eS2V5W0EtWl0kLy50ZXN0KGV2ZW50LmNvZGUpKSB7XG5cdFx0XHRcdGtleSA9IGV2ZW50LmNvZGUuc2xpY2UoMykudG9Mb3dlckNhc2UoKTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGtleVNldHNUb0NoZWNrID0gW1xuXHRcdFx0XHRuYXRpdmVDdHJsQ21kS2V5YmluZGluZ3NbaXNNYWMgPyAnbWFjJyA6ICdub25NYWMnXS5hbHdheXMsXG5cdFx0XHRcdG5hdGl2ZUN0cmxDbWRLZXliaW5kaW5nc1tpc01hYyA/ICdtYWMnIDogJ25vbk1hYyddW2V2ZW50LnNoaWZ0S2V5ID8gJ3dpdGhTaGlmdCcgOiAnbm9TaGlmdCddLFxuXHRcdFx0XTtcblx0XHRcdGlmIChrZXlTZXRzVG9DaGVjay5zb21lKHNldCA9PiBzZXQuaGFzKGtleSkpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Ly8gRW1vamkgcGlja2VyIG9uIE1hY1xuXHRcdFx0aWYgKGlzTWFjICYmIGV2ZW50LmN0cmxLZXkgJiYgIWV2ZW50LnNoaWZ0S2V5ICYmIGtleSA9PT0gJyAnKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBFdmVyeXRoaW5nIGVsc2Ugc2hvdWxkIGJlIGZvcndhcmRlZCB0byB0aGUgd29ya2JlbmNoIGZvciBwb3RlbnRpYWwgc2hvcnRjdXQgaGFuZGxpbmcuXG5cdFx0ZXZlbnQucHJldmVudERlZmF1bHQoKTtcblx0XHRldmVudC5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRpcGNSZW5kZXJlci5zZW5kKCd2c2NvZGU6YnJvd3NlclZpZXc6a2V5ZG93bicsIHtcblx0XHRcdGtleTogZXZlbnQua2V5LFxuXHRcdFx0a2V5Q29kZTogZXZlbnQua2V5Q29kZSxcblx0XHRcdGNvZGU6IGV2ZW50LmNvZGUsXG5cdFx0XHRjdHJsS2V5OiBldmVudC5jdHJsS2V5LFxuXHRcdFx0c2hpZnRLZXk6IGV2ZW50LnNoaWZ0S2V5LFxuXHRcdFx0YWx0S2V5OiBldmVudC5hbHRLZXksXG5cdFx0XHRtZXRhS2V5OiBldmVudC5tZXRhS2V5LFxuXHRcdFx0cmVwZWF0OiBldmVudC5yZXBlYXRcblx0XHR9KTtcblx0fSk7XG5cblx0Y29uc3QgZWxlbWVudFBpY2tlciA9IG5ldyBFbGVtZW50UGlja2VyKFxuXHRcdChlbCwgY29tbWVudCkgPT4ge1xuXHRcdFx0Y29uc3QgZWxlbWVudElkID0gdHJhY2soZWwpO1xuXHRcdFx0aXBjUmVuZGVyZXIuc2VuZCgndnNjb2RlOmJyb3dzZXJWaWV3OmVsZW1lbnRQaWNrZWQnLCB7IGVsZW1lbnRJZCwgY29tbWVudCB9KTtcblx0XHRcdHJldHVybiBlbGVtZW50SWQ7XG5cdFx0fSxcblx0XHRlbGVtZW50SWQgPT4gaXBjUmVuZGVyZXIuc2VuZCgndnNjb2RlOmJyb3dzZXJWaWV3OmVsZW1lbnRDb21tZW50UmVtb3ZlZCcsIGVsZW1lbnRJZCksXG5cdFx0KCkgPT4gaXBjUmVuZGVyZXIuc2VuZCgndnNjb2RlOmJyb3dzZXJWaWV3OmVsZW1lbnRQaWNrU3RvcHBlZCcpXG5cdCk7XG5cblx0Y29uc3QgYXJlYVBpY2tlciA9IG5ldyBBcmVhUGlja2VyKFxuXHRcdHJlY3QgPT4gaXBjUmVuZGVyZXIuc2VuZCgndnNjb2RlOmJyb3dzZXJWaWV3OmFyZWFQaWNrZWQnLCByZWN0KSxcblx0XHQoKSA9PiBpcGNSZW5kZXJlci5zZW5kKCd2c2NvZGU6YnJvd3NlclZpZXc6YXJlYVBpY2tTdG9wcGVkJylcblx0KTtcblxuXHRjb25zdCB0cmFja2VkRWxlbWVudHNCeUlkID0gbmV3IE1hcDxzdHJpbmcsIFdlYWtSZWY8RWxlbWVudD4+KCk7XG5cdGNvbnN0IGZpbmFsaXphdGlvblJlZ2lzdHJ5ID0gbmV3IEZpbmFsaXphdGlvblJlZ2lzdHJ5PHN0cmluZz4oaWQgPT4ge1xuXHRcdHRyYWNrZWRFbGVtZW50c0J5SWQuZGVsZXRlKGlkKTtcblx0fSk7XG5cblx0ZnVuY3Rpb24gdHJhY2soZWxlbWVudDogRWxlbWVudCk6IHN0cmluZyB7XG5cdFx0Y29uc3QgaWQgPSBgZWwtJHtEYXRlLm5vdygpfS0ke01hdGgucmFuZG9tKCkudG9TdHJpbmcoMzYpLnNsaWNlKDIpfWA7XG5cdFx0dHJhY2tlZEVsZW1lbnRzQnlJZC5zZXQoaWQsIG5ldyBXZWFrUmVmKGVsZW1lbnQpKTtcblx0XHRmaW5hbGl6YXRpb25SZWdpc3RyeS5yZWdpc3RlcihlbGVtZW50LCBpZCk7XG5cdFx0cmV0dXJuIGlkO1xuXHR9XG5cblx0bGV0IGNvbnRleHRNZW51VGFyZ2V0OiB7IHJlZjogV2Vha1JlZjxFbGVtZW50PjsgYW5jaG9yOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH0gfSB8IHVuZGVmaW5lZDtcblx0d2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ2NvbnRleHRtZW51JywgKGV2ZW50KSA9PiB7XG5cdFx0aWYgKCFldmVudC5pc1RydXN0ZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgdGFyZ2V0ID0gZWxlbWVudFBpY2tlci5yZXNvbHZlQ29udGV4dE1lbnVUYXJnZXQoZXZlbnQpO1xuXHRcdGlmICh0YXJnZXQpIHtcblx0XHRcdGNvbnN0IGVscyA9IFt0YXJnZXRdO1xuXHRcdFx0Y29uc3Qgc2VsZWN0aW9uID0gd2luZG93LmdldFNlbGVjdGlvbigpO1xuXHRcdFx0aWYgKHNlbGVjdGlvbiAmJiAhc2VsZWN0aW9uLmlzQ29sbGFwc2VkKSB7XG5cdFx0XHRcdGVscy5wdXNoKHNlbGVjdGlvbi5hbmNob3JOb2RlIGFzIEVsZW1lbnQsIHNlbGVjdGlvbi5mb2N1c05vZGUgYXMgRWxlbWVudCk7XG5cdFx0XHR9XG5cdFx0XHRjb250ZXh0TWVudVRhcmdldCA9IHtcblx0XHRcdFx0cmVmOiBuZXcgV2Vha1JlZihmaW5kQ29tbW9uVmlzaWJsZUFuY2VzdG9yKGVscykgPz8gdGFyZ2V0KSxcblx0XHRcdFx0YW5jaG9yOiB7IHg6IGV2ZW50LmNsaWVudFgsIHk6IGV2ZW50LmNsaWVudFkgfSxcblx0XHRcdH07XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnRleHRNZW51VGFyZ2V0ID0gdW5kZWZpbmVkO1xuXHRcdH1cblx0fSwgeyBjYXB0dXJlOiB0cnVlIH0pO1xuXG5cdC8vIEludm9rZWQgb3ZlciBJUEMgdG8gc3VwcG9ydCBmcmFtZXMgKGV4ZWN1dGVKYXZhU2NyaXB0SW5Jc29sYXRlZFdvcmxkIGRvZXNuJ3QgZXhpc3Qgb24gV2ViRnJhbWVNYWluKS5cblx0aXBjUmVuZGVyZXIub24oJ3ZzY29kZTpicm93c2VyVmlldzpzZXRUaGVtZScsIChfZXZlbnQ6IHVua25vd24sIHRoZW1lOiBJQnJvd3NlclZpZXdUaGVtZSkgPT4ge1xuXHRcdGVsZW1lbnRQaWNrZXIuc2V0VGhlbWUodGhlbWUpO1xuXHRcdGFyZWFQaWNrZXIuc2V0VGhlbWUodGhlbWUpO1xuXHR9KTtcblx0aXBjUmVuZGVyZXIub24oJ3ZzY29kZTpicm93c2VyVmlldzpzZXRMb2NhbGl6ZWRTdHJpbmdzJywgKF9ldmVudDogdW5rbm93biwgc3RyaW5nczogSUJyb3dzZXJWaWV3UHJlbG9hZExvY2FsaXplZFN0cmluZ3MpID0+IHtcblx0XHRsb2NhbGl6ZWRTdHJpbmdzID0gc3RyaW5ncztcblx0XHRlbGVtZW50UGlja2VyLnVwZGF0ZUxvY2FsaXplZFN0cmluZ3MoKTtcblx0fSk7XG5cdGlwY1JlbmRlcmVyLm9uKCd2c2NvZGU6YnJvd3NlclZpZXc6c3RhcnRFbGVtZW50UGlja2VyJywgKF9ldmVudDogdW5rbm93biwgb3B0aW9uczogSUJyb3dzZXJFbGVtZW50U2VsZWN0aW9uT3B0aW9ucykgPT4ge1xuXHRcdGVsZW1lbnRQaWNrZXIuc3RhcnQob3B0aW9ucyk7XG5cdH0pO1xuXHRpcGNSZW5kZXJlci5vbigndnNjb2RlOmJyb3dzZXJWaWV3OnN0b3BFbGVtZW50UGlja2VyJywgKF9ldmVudDogdW5rbm93bikgPT4ge1xuXHRcdGVsZW1lbnRQaWNrZXIuc3RvcCgpO1xuXHR9KTtcblx0aXBjUmVuZGVyZXIub24oJ3ZzY29kZTpicm93c2VyVmlldzpzdGFydEFyZWFQaWNrZXInLCAoX2V2ZW50OiB1bmtub3duKSA9PiB7XG5cdFx0YXJlYVBpY2tlci5zdGFydCgpO1xuXHR9KTtcblx0aXBjUmVuZGVyZXIub24oJ3ZzY29kZTpicm93c2VyVmlldzpzdG9wQXJlYVBpY2tlcicsIChfZXZlbnQ6IHVua25vd24pID0+IHtcblx0XHRhcmVhUGlja2VyLnN0b3AoKTtcblx0fSk7XG5cdGlwY1JlbmRlcmVyLm9uKCd2c2NvZGU6YnJvd3NlclZpZXc6aGlnaGxpZ2h0RWxlbWVudCcsIChfZXZlbnQ6IHVua25vd24sIHsgZWxlbWVudElkIH06IHsgZWxlbWVudElkOiBzdHJpbmcgfSkgPT4ge1xuXHRcdGNvbnN0IGVsZW1lbnQgPSBnZXRFbGVtZW50KGVsZW1lbnRJZCk7XG5cdFx0aWYgKGVsZW1lbnQpIHtcblx0XHRcdGVsZW1lbnRQaWNrZXIuaGlnaGxpZ2h0KGVsZW1lbnQpO1xuXHRcdH1cblx0fSk7XG5cdGlwY1JlbmRlcmVyLm9uKCd2c2NvZGU6YnJvd3NlclZpZXc6c2hvd0VsZW1lbnRDb21tZW50JywgKF9ldmVudDogdW5rbm93biwgeyBlbGVtZW50SWQgfTogeyBlbGVtZW50SWQ6IHN0cmluZyB9KSA9PiB7XG5cdFx0Y29uc3QgZWxlbWVudCA9IGdldEVsZW1lbnQoZWxlbWVudElkKTtcblx0XHRpZiAoZWxlbWVudCAmJiBjb250ZXh0TWVudVRhcmdldCkge1xuXHRcdFx0ZWxlbWVudFBpY2tlci5jb21tZW50KGVsZW1lbnQsIGNvbnRleHRNZW51VGFyZ2V0LmFuY2hvcik7XG5cdFx0fVxuXHR9KTtcblx0aXBjUmVuZGVyZXIub24oJ3ZzY29kZTpicm93c2VyVmlldzpoaWRlSGlnaGxpZ2h0JywgKF9ldmVudDogdW5rbm93bikgPT4ge1xuXHRcdGVsZW1lbnRQaWNrZXIuaGlkZUhpZ2hsaWdodCgpO1xuXHR9KTtcblx0aXBjUmVuZGVyZXIub24oJ3ZzY29kZTpicm93c2VyVmlldzpzZXRFbGVtZW50Q29tbWVudHMnLCAoX2V2ZW50OiB1bmtub3duLCB1cGRhdGU6IElCcm93c2VyRWxlbWVudENvbW1lbnRzVXBkYXRlKSA9PiB7XG5cdFx0ZWxlbWVudFBpY2tlci51cGRhdGVDb21tZW50cyh1cGRhdGUpO1xuXHR9KTtcblxuXHRjb25zdCBnZXRFbGVtZW50ID0gKGlkOiBzdHJpbmcpOiBFbGVtZW50IHwgbnVsbCA9PiB7XG5cdFx0c3dpdGNoIChpZCkge1xuXHRcdFx0Y2FzZSAnYWN0aXZlJzpcblx0XHRcdFx0cmV0dXJuIGRvY3VtZW50LmFjdGl2ZUVsZW1lbnQ7XG5cdFx0XHRjYXNlICdjb250ZXh0LW1lbnUtdGFyZ2V0Jzpcblx0XHRcdFx0cmV0dXJuIGNvbnRleHRNZW51VGFyZ2V0Py5yZWYuZGVyZWYoKSA/PyBudWxsO1xuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0cmV0dXJuIHRyYWNrZWRFbGVtZW50c0J5SWQuZ2V0KGlkKT8uZGVyZWYoKSA/PyBudWxsO1xuXHRcdH1cblx0fTtcblxuXHRjb25zdCBpc29sYXRlZEhlbHBlcnMgPSB7XG5cdFx0LyoqXG5cdFx0ICogR2V0IHRoZSBjdXJyZW50bHkgc2VsZWN0ZWQgdGV4dCBpbiB0aGUgcGFnZS5cblx0XHQgKi9cblx0XHRnZXRTZWxlY3RlZFRleHQoKTogc3RyaW5nIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdC8vIEV2ZW4gaWYgdGhlIHBhZ2UgaGFzIG92ZXJyaWRkZW4gd2luZG93LmdldFNlbGVjdGlvbiwgb3VyIGNhbGwgaGVyZSB3aWxsIHN0aWxsIHJlYWNoIHRoZSBvcmlnaW5hbFxuXHRcdFx0XHQvLyBpbXBsZW1lbnRhdGlvbi4gVGhhdCdzIGJlY2F1c2UgRWxlY3Ryb24gcHJveGllcyBmdW5jdGlvbnMsIHN1Y2ggYXMgZ2V0U2VsZWN0ZWRUZXh0IGhlcmUsIHRoYXQgYXJlXG5cdFx0XHRcdC8vIGV4cG9zZWQgdG8gYSBkaWZmZXJlbnQgY29udGV4dCB2aWEgZXhwb3NlSW5Jc29sYXRlZFdvcmxkIG9yIGV4cG9zZUluTWFpbldvcmxkLlxuXHRcdFx0XHRyZXR1cm4gd2luZG93LmdldFNlbGVjdGlvbigpPy50b1N0cmluZygpID8/ICcnO1xuXHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdHJldHVybiAnJztcblx0XHRcdH1cblx0XHR9XG5cdH07XG5cblx0Ly8gR2VuZXJhdGUgYSB1bmlxdWUgdG9rZW4gZm9yIHRoaXMgZnJhbWUgaW5zdGFuY2UuIFRoaXMgdG9rZW4gaXMgdXNlZCB0b1xuXHQvLyBjb3JyZWxhdGUgdGhlIEVsZWN0cm9uIFdlYkZyYW1lTWFpbiAoYXZhaWxhYmxlIHZpYSBJUEMgc2VuZGVyRnJhbWUpIHdpdGhcblx0Ly8gdGhlIENEUCB0YXJnZXQgc2Vzc2lvbiAoZGlzY292ZXJhYmxlIHZpYSBSdW50aW1lLmV2YWx1YXRlIGluIHRoZSBtYWluIHdvcmxkKS5cblx0Y29uc3QgZnJhbWVUb2tlbiA9IGBmcmFtZS0ke0RhdGUubm93KCl9LSR7TWF0aC5yYW5kb20oKS50b1N0cmluZygzNikuc2xpY2UoMil9YDtcblxuXHRjb25zdCBtYWluV29ybGRIZWxwZXJzID0ge1xuXHRcdGdldEVsZW1lbnQsXG5cdFx0LyoqIE9wYXF1ZSB0b2tlbiBleHBvc2VkIGZvciBDRFAtc2lkZSBmcmFtZSBtYXRjaGluZy4gKi9cblx0XHRnZXRGcmFtZVRva2VuKCk6IHN0cmluZyB7IHJldHVybiBmcmFtZVRva2VuOyB9XG5cdH07XG5cblx0dHJ5IHtcblx0XHQvLyBVc2UgYGNvbnRleHRCcmlkZ2VgIEFQSXMgdG8gZXhwb3NlIGdsb2JhbHMgdG8gdGhlIHNhbWUgaXNvbGF0ZWQgd29ybGQgd2hlcmUgdGhpcyBwcmVsb2FkIHNjcmlwdCBydW5zICh3b3JsZElkIDk5OSkuXG5cdFx0Ly8gVGhlIGlzb2xhdGVkSGVscGVycyBvYmplY3Qgd2lsbCBiZSByZWN1cnNpdmVseSBmcm96ZW4gKGFuZCBmb3IgZnVuY3Rpb25zIGFsc28gcHJveGllZCkgYnkgRWxlY3Ryb24gdG8gcHJldmVudFxuXHRcdC8vIG1vZGlmaWNhdGlvbiB3aXRoaW4gdGhlIGdpdmVuIGNvbnRleHQuXG5cdFx0Y29udGV4dEJyaWRnZS5leHBvc2VJbklzb2xhdGVkV29ybGQoOTk5LCAnYnJvd3NlclZpZXdBUEknLCBpc29sYXRlZEhlbHBlcnMpO1xuXHRcdC8vIEV4cG9zZSBoZWxwZXJzIG9uIGB3aW5kb3cuX192c2NvZGVfaGVscGVyc2AgaW4gdGhlIHBhZ2UncyBtYWluIHdvcmxkXG5cdFx0Ly8gZm9yIENEUCBgUnVudGltZS5ldmFsdWF0ZWAgKHdoaWNoIHJ1bnMgYWdhaW5zdCB0aGUgbWFpbiB3b3JsZCkgdG8gdXNlLlxuXHRcdGNvbnRleHRCcmlkZ2UuZXhwb3NlSW5NYWluV29ybGQoJ19fdnNjb2RlX2hlbHBlcnMnLCBtYWluV29ybGRIZWxwZXJzKTtcblx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRjb25zb2xlLmVycm9yKGVycm9yKTtcblx0fVxuXG5cdGlwY1JlbmRlcmVyLnNlbmQoJ3ZzY29kZTpicm93c2VyVmlldzpwcmVsb2FkUmVhZHknLCBmcmFtZVRva2VuKTtcbn1cblxuLyoqXG4gKiBGaW5kIHRoZSBkZWVwZXN0IGVsZW1lbnQgdGhhdCBjb250YWlucyBldmVyeSBlbGVtZW50IGluIGBjYW5kaWRhdGVzYC5cbiAqIFdhbGtzIHVwIGBwYXJlbnRFbGVtZW50YCBmcm9tIGVhY2ggY2FuZGlkYXRlIHRvIGJ1aWxkIGNoYWlucywgdGhlblxuICogcmV0dXJucyB0aGUgbGFzdCBzaGFyZWQgZWxlbWVudC4gUmV0dXJucyBgdW5kZWZpbmVkYCBpZiB0aGUgY2hhaW5zXG4gKiBkb24ndCBvdmVybGFwIChzaG91bGRuJ3QgaGFwcGVuIGZvciBlbGVtZW50cyBpbiB0aGUgc2FtZSBkb2N1bWVudCkuXG4gKi9cbmZ1bmN0aW9uIGZpbmRDb21tb25WaXNpYmxlQW5jZXN0b3IoY2FuZGlkYXRlczogcmVhZG9ubHkgKE5vZGUgfCBudWxsIHwgdW5kZWZpbmVkKVtdKTogRWxlbWVudCB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IGZpbHRlcmVkTm9kZXMgPSBjYW5kaWRhdGVzLmZpbHRlcihjID0+ICEhYykgYXMgTm9kZVtdO1xuXHRjb25zdCB1bmlxdWUgPSBbLi4ubmV3IFNldChmaWx0ZXJlZE5vZGVzLm1hcChub2RlID0+IG5vZGUgaW5zdGFuY2VvZiBFbGVtZW50ID8gbm9kZSA6IG5vZGUucGFyZW50RWxlbWVudCkuZmlsdGVyKGUgPT4gISFlKSldIGFzIEVsZW1lbnRbXTtcblx0aWYgKHVuaXF1ZS5sZW5ndGggPT09IDApIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0Ly8gRmluZCB0aGUgbmVhcmVzdCB2aXNpYmxlIGFuY2VzdG9yIG9mIGEgc2luZ2xlIGVsZW1lbnQuXG5cdGNvbnN0IGZpbmRWaXNpYmxlID0gKGVsOiBFbGVtZW50KTogRWxlbWVudCA9PiB7XG5cdFx0Zm9yIChsZXQgY3VyOiBFbGVtZW50IHwgbnVsbCA9IGVsOyBjdXI7IGN1ciA9IGN1ci5wYXJlbnRFbGVtZW50KSB7XG5cdFx0XHRjb25zdCB3aWR0aCA9IGN1ciBpbnN0YW5jZW9mIEhUTUxFbGVtZW50ID8gY3VyLm9mZnNldFdpZHRoIDogY3VyLmNsaWVudFdpZHRoO1xuXHRcdFx0Y29uc3QgaGVpZ2h0ID0gY3VyIGluc3RhbmNlb2YgSFRNTEVsZW1lbnQgPyBjdXIub2Zmc2V0SGVpZ2h0IDogY3VyLmNsaWVudEhlaWdodDtcblx0XHRcdGlmICh3aWR0aCA+IDAgJiYgaGVpZ2h0ID4gMCkge1xuXHRcdFx0XHRyZXR1cm4gY3VyO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gZWw7XG5cdH07XG5cblx0aWYgKHVuaXF1ZS5sZW5ndGggPT09IDEpIHtcblx0XHRyZXR1cm4gZmluZFZpc2libGUodW5pcXVlWzBdKTtcblx0fVxuXG5cdC8vIEJ1aWxkIHRoZSBhbmNlc3RvciBjaGFpbiBmb3IgdGhlIGZpcnN0IGNhbmRpZGF0ZSAocm9vdCBcdTIxOTIgZWxlbWVudCkuXG5cdGNvbnN0IGZpcnN0Q2hhaW46IEVsZW1lbnRbXSA9IFtdO1xuXHRmb3IgKGxldCBjdXI6IEVsZW1lbnQgfCBudWxsID0gdW5pcXVlWzBdOyBjdXI7IGN1ciA9IGN1ci5wYXJlbnRFbGVtZW50KSB7XG5cdFx0Zmlyc3RDaGFpbi51bnNoaWZ0KGN1cik7XG5cdH1cblxuXHQvLyBSZWR1Y2UgdG8gY2hhaW4gcHJlZml4IHNoYXJlZCB3aXRoIGV2ZXJ5IG90aGVyIGNhbmRpZGF0ZS5cblx0bGV0IGNvbW1vbiA9IGZpcnN0Q2hhaW47XG5cdGZvciAobGV0IGkgPSAxOyBpIDwgdW5pcXVlLmxlbmd0aDsgaSsrKSB7XG5cdFx0Y29uc3Qgb3RoZXJDaGFpbjogRWxlbWVudFtdID0gW107XG5cdFx0Zm9yIChsZXQgY3VyOiBFbGVtZW50IHwgbnVsbCA9IHVuaXF1ZVtpXTsgY3VyOyBjdXIgPSBjdXIucGFyZW50RWxlbWVudCkge1xuXHRcdFx0b3RoZXJDaGFpbi51bnNoaWZ0KGN1cik7XG5cdFx0fVxuXHRcdGxldCBqID0gMDtcblx0XHRjb25zdCBsaW1pdCA9IE1hdGgubWluKGNvbW1vbi5sZW5ndGgsIG90aGVyQ2hhaW4ubGVuZ3RoKTtcblx0XHR3aGlsZSAoaiA8IGxpbWl0ICYmIGNvbW1vbltqXSA9PT0gb3RoZXJDaGFpbltqXSkge1xuXHRcdFx0aisrO1xuXHRcdH1cblx0XHRjb21tb24gPSBjb21tb24uc2xpY2UoMCwgaik7XG5cdFx0aWYgKGNvbW1vbi5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cdHJldHVybiBmaW5kVmlzaWJsZShjb21tb25bY29tbW9uLmxlbmd0aCAtIDFdKTtcbn1cblxudHlwZSBFbGVtZW50Q29tbWVudCA9IHtcblx0dGFyZ2V0OiBFbGVtZW50O1xuXHRwaW46IEhUTUxEaXZFbGVtZW50O1xuXHRudW1iZXJFbGVtZW50OiBIVE1MU3BhbkVsZW1lbnQ7XG5cdGJvZHk6IHN0cmluZztcblx0b3JkaW5hbDogbnVtYmVyO1xuXHRvZmZzZXQ6IHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfTtcbn07XG5cbnR5cGUgUGVuZGluZ0VsZW1lbnRDb21tZW50ID0ge1xuXHR0YXJnZXQ6IEVsZW1lbnQ7XG5cdGFuY2hvcjogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9O1xuXHRib2R5OiBzdHJpbmc7XG5cdHBvaW50ZXJJbnRlcmFjdGlvbjogYm9vbGVhbjtcbn07XG5cbnR5cGUgU2NoZWR1bGVkQ29tbWVudFBpbiA9IHtcblx0Ym9keTogc3RyaW5nO1xuXHRvcmRpbmFsOiBudW1iZXI7XG5cdGFuaW1hdGlvbkZyYW1lOiBudW1iZXI7XG5cdHRpbWVvdXQ6IG51bWJlcjtcbn07XG5cbnR5cGUgQ29tbWVudEFuaW1hdGlvbiA9IHtcblx0c3VyZmFjZTogQW5pbWF0aW9uO1xuXHRzdXBwb3J0aW5nOiBBbmltYXRpb25bXTtcbn07XG5cbi8qKlxuICogRWxlbWVudC1waWNrIGNvbnRyb2xsZXIgdXNlZCBieSB0aGUgXCJBZGQgRWxlbWVudCB0byBDaGF0XCIgZmxvdy5cbiAqXG4gKiBgc3RhcnQoeyB0aGVtZSB9KWAgbW91bnRzIGEgdHJhbnNwYXJlbnQgb3ZlcmxheSBvbiB0aGUgcGFnZSB0aGF0XG4gKiBoaWdobGlnaHRzIHRoZSBlbGVtZW50IHVuZGVyIHRoZSBwb2ludGVyIChjbGljaykgb3IgZmluZHMgdGhlIGRlZXBlc3RcbiAqIGNvbW1vbiBhbmNlc3RvciBvZiB0aGUgZWxlbWVudHMgY292ZXJlZCBieSBhIGNsaWNrK2RyYWcgcmVjdGFuZ2xlLiBPblxuICogc2VsZWN0aW9uIHRoZSBwaWNrZWQgYEVsZW1lbnRgIGlzIHJlZ2lzdGVyZWQgd2l0aCB0aGUgc2hhcmVkIGB0cmFjaygpYFxuICogaGVscGVyIGFuZCB0aGUgaG9zdCBpcyBub3RpZmllZCB3aXRoIHRoZSByZXN1bHRpbmcgaWQ7IHRoZSBvdmVybGF5IGlzXG4gKiB0aGVuIHRvcm4gZG93bi4gYHN0b3AoKWAgdGVhcnMgZG93biB3aXRob3V0IHBpY2tpbmcuXG4gKi9cbmNsYXNzIEVsZW1lbnRQaWNrZXIge1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBfRFJBR19USFJFU0hPTERfUFggPSA0O1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBfQ09NTUVOVF9QSU5fU0laRSA9IDIyO1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBfQ09NTUVOVF9QSU5fUkVTVE9SRV9GUkFNRVMgPSA1O1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBfQ09NTUVOVF9QSU5fUkVTVE9SRV9USU1FT1VUID0gMTAwO1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBfQ09NTUVOVF9QUkVWSUVXX0hJVF9QQURESU5HID0gRWxlbWVudFBpY2tlci5fQ09NTUVOVF9QSU5fU0laRSAvIDI7XG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IF9DT01NRU5UX1BSRVZJRVdfSElERV9ERUxBWSA9IDgwO1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBfQ09NTUVOVF9TVVJGQUNFX0FOSU1BVElPTl9EVVJBVElPTiA9IDE0MDtcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgX0NPTU1FTlRfU1VQUE9SVElOR19GQURFX0RVUkFUSU9OID0gMTIwO1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBfQ1VSU09SX0RFRkFVTFQgPSAnLyogVlMgQ29kZSBpbmplY3RlZCBzdHlsZSAqLyAqIHsgY3Vyc29yOiBkZWZhdWx0ICFpbXBvcnRhbnQ7IH0nO1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBfQ1VSU09SX0NST1NTSEFJUiA9ICcvKiBWUyBDb2RlIGluamVjdGVkIHN0eWxlICovICogeyBjdXJzb3I6IGNyb3NzaGFpciAhaW1wb3J0YW50OyB9JztcblxuXHRwcml2YXRlIF9zZWxlY3Rpb25BY3RpdmUgPSBmYWxzZTtcblx0cHJpdmF0ZSBfY29udGludW91cyA9IGZhbHNlO1xuXHRwcml2YXRlIF9jb21tZW50TW9kZSA9IGZhbHNlO1xuXG5cdC8vIERPTSBcdTIwMTQgY3JlYXRlZCBvbmNlIGluIHRoZSBjb25zdHJ1Y3RvciwgcmV1c2VkIGFjcm9zcyBzdGFydC9zdG9wIGN5Y2xlcy5cblx0cHJpdmF0ZSByZWFkb25seSBfc2hhZG93SG9zdDogSFRNTERpdkVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NvbW1lbnRCYWNrZHJvcDogU1ZHU1ZHRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfY29tbWVudEJhY2tkcm9wQ3V0b3V0OiBTVkdSZWN0RWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfaGlnaGxpZ2h0U2hhcGU6IFNWR1JlY3RFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9oaWdobGlnaHQ6IEhUTUxEaXZFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jb21tZW50UHJldmlld1JlbW92ZUJ1dHRvbjogSFRNTEJ1dHRvbkVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX292ZXJsYXk6IEhUTUxEaXZFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9sYWJlbDogSFRNTERpdkVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2xhYmVsU2VsZWN0b3I6IEhUTUxTcGFuRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfbGFiZWxDbGFzc2VzOiBIVE1MU3BhbkVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2xhYmVsRGltczogSFRNTFNwYW5FbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jb21tZW50UHJldmlld0hpdEFyZWE6IEhUTUxEaXZFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jb21tZW50UHJldmlldzogSFRNTERpdkVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NvbW1lbnRQcmV2aWV3Qm9keTogSFRNTFNwYW5FbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kcmFnYm94OiBIVE1MRGl2RWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfY29tbWVudExheWVyOiBIVE1MRGl2RWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfY29tbWVudENvbXBvc2VyOiBIVE1MRGl2RWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfY29tbWVudElucHV0OiBIVE1MVGV4dEFyZWFFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jb21tZW50U2VuZEJ1dHRvbjogSFRNTEJ1dHRvbkVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NvbW1lbnRzID0gbmV3IE1hcDxzdHJpbmcsIEVsZW1lbnRDb21tZW50PigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wZW5kaW5nQ29tbWVudHMgPSBuZXcgTWFwPHN0cmluZywgUGVuZGluZ0VsZW1lbnRDb21tZW50PigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zY2hlZHVsZWRDb21tZW50UGlucyA9IG5ldyBNYXA8c3RyaW5nLCBTY2hlZHVsZWRDb21tZW50UGluPigpO1xuXG5cdC8vIEludGVyYWN0aW9uIHN0YXRlIChyZXNldCBvbiBzdG9wKVxuXHRwcml2YXRlIF9kcmFnU3RhcnQ6IHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfZHJhZ1N0YXJ0VGFyZ2V0OiBFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9oaWdobGlnaHRUYXJnZXQ6IEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2V4dGVybmFsSGlnaGxpZ2h0VGFyZ2V0OiBFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9mb2N1c2VkVGFyZ2V0OiBFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9jdXJzb3JTdHlsZXNoZWV0OiBIVE1MU3R5bGVFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9kaXNtaXNzZWRDb21tZW50T25Qb2ludGVyRG93biA9IGZhbHNlO1xuXHRwcml2YXRlIF9jb21tZW50VGFyZ2V0OiBFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9jb21tZW50QW5jaG9yOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH0gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2NvbW1lbnRQb2ludGVySW50ZXJhY3Rpb24gPSBmYWxzZTtcblx0cHJpdmF0ZSBfcGVuZGluZ0NvbW1lbnRJbnRlcmFjdGlvbklkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2NvbW1lbnRCYWNrZHJvcFRhcmdldDogRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfY29tbWVudEJhY2tkcm9wUmVxdWVzdCA9IDA7XG5cdHByaXZhdGUgX2NvbW1lbnRQcmV2aWV3RWxlbWVudElkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2NvbW1lbnRQcmV2aWV3SGlkZVRpbWVvdXQ6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfY29tbWVudEFuaW1hdGlvbjogQ29tbWVudEFuaW1hdGlvbiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfY29tbWVudFByZXZpZXdDb2xsYXBzaW5nID0gZmFsc2U7XG5cdHByaXZhdGUgX3JlZHVjZWRNb3Rpb24gPSBmYWxzZTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9vblBpY2tlZDogKGVsZW1lbnQ6IEVsZW1lbnQsIGNvbW1lbnQ/OiBzdHJpbmcpID0+IHN0cmluZyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9vbkNvbW1lbnRSZW1vdmVkOiAoZWxlbWVudElkOiBzdHJpbmcpID0+IHZvaWQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfb25TdG9wcGVkOiAoKSA9PiB2b2lkXG5cdCkge1xuXHRcdC8vIEJ1aWxkIHRoZSBzaGFkb3cgRE9NIHRyZWUgb25jZS4gVGhlIGhvc3QgaXMgYXBwZW5kZWQvcmVtb3ZlZCBmcm9tIHRoZVxuXHRcdC8vIGRvY3VtZW50IG9uIHN0YXJ0L3N0b3Agc28gdGhlIG92ZXJsYXkgb25seSBjYXB0dXJlcyBldmVudHMgd2hlbiBhY3RpdmUuXG5cdFx0Y29uc3Qgc2hhZG93SG9zdCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdHNoYWRvd0hvc3Quc2V0QXR0cmlidXRlKCdkYXRhLXZzY29kZS1waWNrLWhvc3QnLCAnJyk7XG5cdFx0c2hhZG93SG9zdC5zdHlsZS5jc3NUZXh0ID0gJ3Bvc2l0aW9uOiBhYnNvbHV0ZTsgdG9wOiAwOyBsZWZ0OiAwOyB3aWR0aDogMDsgaGVpZ2h0OiAwOyB6LWluZGV4OiAyMTQ3NDgzNjQ3OyBwb2ludGVyLWV2ZW50czogbm9uZTsnO1xuXHRcdGNvbnN0IHJvb3QgPSBzaGFkb3dIb3N0LmF0dGFjaFNoYWRvdyh7IG1vZGU6ICdjbG9zZWQnIH0pO1xuXHRcdHJvb3QuYXBwZW5kQ2hpbGQoRWxlbWVudFBpY2tlci5fYnVpbGRTdHlsZSgpKTtcblx0XHR0aGlzLl9zaGFkb3dIb3N0ID0gc2hhZG93SG9zdDtcblxuXHRcdGNvbnN0IHN2Z05hbWVzcGFjZSA9ICdodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2Zyc7XG5cdFx0Y29uc3QgY29tbWVudEJhY2tkcm9wID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudE5TKHN2Z05hbWVzcGFjZSwgJ3N2ZycpO1xuXHRcdGNvbW1lbnRCYWNrZHJvcC5jbGFzc0xpc3QuYWRkKCdjb21tZW50LWJhY2tkcm9wJyk7XG5cdFx0Y29uc3QgYmFja2Ryb3BNYXNrSWQgPSBgdnNjb2RlLWNvbW1lbnQtY3V0b3V0LSR7TWF0aC5yYW5kb20oKS50b1N0cmluZygzNikuc2xpY2UoMil9YDtcblx0XHRjb25zdCBiYWNrZHJvcERlZmluaXRpb25zID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudE5TKHN2Z05hbWVzcGFjZSwgJ2RlZnMnKTtcblx0XHRjb25zdCBiYWNrZHJvcE1hc2sgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50TlMoc3ZnTmFtZXNwYWNlLCAnbWFzaycpO1xuXHRcdGJhY2tkcm9wTWFzay5pZCA9IGJhY2tkcm9wTWFza0lkO1xuXHRcdGJhY2tkcm9wTWFzay5zZXRBdHRyaWJ1dGUoJ21hc2tVbml0cycsICd1c2VyU3BhY2VPblVzZScpO1xuXHRcdGJhY2tkcm9wTWFzay5zZXRBdHRyaWJ1dGUoJ3gnLCAnMCcpO1xuXHRcdGJhY2tkcm9wTWFzay5zZXRBdHRyaWJ1dGUoJ3knLCAnMCcpO1xuXHRcdGJhY2tkcm9wTWFzay5zZXRBdHRyaWJ1dGUoJ3dpZHRoJywgJzEwMCUnKTtcblx0XHRiYWNrZHJvcE1hc2suc2V0QXR0cmlidXRlKCdoZWlnaHQnLCAnMTAwJScpO1xuXHRcdGNvbnN0IGJhY2tkcm9wTWFza0ZpbGwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50TlMoc3ZnTmFtZXNwYWNlLCAncmVjdCcpO1xuXHRcdGJhY2tkcm9wTWFza0ZpbGwuc2V0QXR0cmlidXRlKCd3aWR0aCcsICcxMDAlJyk7XG5cdFx0YmFja2Ryb3BNYXNrRmlsbC5zZXRBdHRyaWJ1dGUoJ2hlaWdodCcsICcxMDAlJyk7XG5cdFx0YmFja2Ryb3BNYXNrRmlsbC5zZXRBdHRyaWJ1dGUoJ2ZpbGwnLCAnd2hpdGUnKTtcblx0XHRjb25zdCBiYWNrZHJvcEN1dG91dCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnROUyhzdmdOYW1lc3BhY2UsICdyZWN0Jyk7XG5cdFx0YmFja2Ryb3BDdXRvdXQuc2V0QXR0cmlidXRlKCdmaWxsJywgJ2JsYWNrJyk7XG5cdFx0YmFja2Ryb3BNYXNrLmFwcGVuZChiYWNrZHJvcE1hc2tGaWxsLCBiYWNrZHJvcEN1dG91dCk7XG5cdFx0YmFja2Ryb3BEZWZpbml0aW9ucy5hcHBlbmRDaGlsZChiYWNrZHJvcE1hc2spO1xuXHRcdGNvbnN0IGJhY2tkcm9wRmlsbCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnROUyhzdmdOYW1lc3BhY2UsICdyZWN0Jyk7XG5cdFx0YmFja2Ryb3BGaWxsLmNsYXNzTGlzdC5hZGQoJ2NvbW1lbnQtYmFja2Ryb3AtZmlsbCcpO1xuXHRcdGJhY2tkcm9wRmlsbC5zZXRBdHRyaWJ1dGUoJ3dpZHRoJywgJzEwMCUnKTtcblx0XHRiYWNrZHJvcEZpbGwuc2V0QXR0cmlidXRlKCdoZWlnaHQnLCAnMTAwJScpO1xuXHRcdGJhY2tkcm9wRmlsbC5zZXRBdHRyaWJ1dGUoJ21hc2snLCBgdXJsKCMke2JhY2tkcm9wTWFza0lkfSlgKTtcblx0XHRjb25zdCBoaWdobGlnaHRTaGFwZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnROUyhzdmdOYW1lc3BhY2UsICdyZWN0Jyk7XG5cdFx0aGlnaGxpZ2h0U2hhcGUuY2xhc3NMaXN0LmFkZCgnaGlnaGxpZ2h0LXNoYXBlJyk7XG5cdFx0aGlnaGxpZ2h0U2hhcGUuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHRjb21tZW50QmFja2Ryb3AuYXBwZW5kKGJhY2tkcm9wRGVmaW5pdGlvbnMsIGJhY2tkcm9wRmlsbCwgaGlnaGxpZ2h0U2hhcGUpO1xuXHRcdHJvb3QuYXBwZW5kQ2hpbGQoY29tbWVudEJhY2tkcm9wKTtcblx0XHR0aGlzLl9jb21tZW50QmFja2Ryb3AgPSBjb21tZW50QmFja2Ryb3A7XG5cdFx0dGhpcy5fY29tbWVudEJhY2tkcm9wQ3V0b3V0ID0gYmFja2Ryb3BDdXRvdXQ7XG5cdFx0dGhpcy5faGlnaGxpZ2h0U2hhcGUgPSBoaWdobGlnaHRTaGFwZTtcblxuXHRcdGNvbnN0IGhpZ2hsaWdodCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdGhpZ2hsaWdodC5jbGFzc05hbWUgPSAnaGlnaGxpZ2h0Jztcblx0XHRoaWdobGlnaHQuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHRyb290LmFwcGVuZENoaWxkKGhpZ2hsaWdodCk7XG5cdFx0dGhpcy5faGlnaGxpZ2h0ID0gaGlnaGxpZ2h0O1xuXG5cdFx0Y29uc3QgY29tbWVudFByZXZpZXdSZW1vdmVCdXR0b24gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdidXR0b24nKTtcblx0XHRjb21tZW50UHJldmlld1JlbW92ZUJ1dHRvbi5jbGFzc05hbWUgPSAnY29tbWVudC1wcmV2aWV3LXJlbW92ZSc7XG5cdFx0Y29tbWVudFByZXZpZXdSZW1vdmVCdXR0b24udHlwZSA9ICdidXR0b24nO1xuXHRcdGNvbnN0IGNvbW1lbnRQcmV2aWV3UmVtb3ZlSWNvbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnROUyhzdmdOYW1lc3BhY2UsICdzdmcnKTtcblx0XHRjb21tZW50UHJldmlld1JlbW92ZUljb24uc2V0QXR0cmlidXRlKCd2aWV3Qm94JywgJzAgMCAxNiAxNicpO1xuXHRcdGNvbW1lbnRQcmV2aWV3UmVtb3ZlSWNvbi5zZXRBdHRyaWJ1dGUoJ2ZpbGwnLCAnY3VycmVudENvbG9yJyk7XG5cdFx0Y29tbWVudFByZXZpZXdSZW1vdmVJY29uLnNldEF0dHJpYnV0ZSgnYXJpYS1oaWRkZW4nLCAndHJ1ZScpO1xuXHRcdGNvbnN0IGNvbW1lbnRQcmV2aWV3UmVtb3ZlSWNvblBhdGggPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50TlMoc3ZnTmFtZXNwYWNlLCAncGF0aCcpO1xuXHRcdGNvbW1lbnRQcmV2aWV3UmVtb3ZlSWNvblBhdGguc2V0QXR0cmlidXRlKCdkJywgJ00zLjg1NCAzLjE0NmEuNS41IDAgMCAwLS43MDguNzA4TDcuMjkzIDhsLTQuMTQ3IDQuMTQ2YS41LjUgMCAwIDAgLjcwOC43MDhMOCA4LjcwN2w0LjE0NiA0LjE0N2EuNS41IDAgMCAwIC43MDgtLjcwOEw4LjcwNyA4bDQuMTQ3LTQuMTQ2YS41LjUgMCAwIDAtLjcwOC0uNzA4TDggNy4yOTMgMy44NTQgMy4xNDZaJyk7XG5cdFx0Y29tbWVudFByZXZpZXdSZW1vdmVJY29uLmFwcGVuZENoaWxkKGNvbW1lbnRQcmV2aWV3UmVtb3ZlSWNvblBhdGgpO1xuXHRcdGNvbW1lbnRQcmV2aWV3UmVtb3ZlQnV0dG9uLmFwcGVuZENoaWxkKGNvbW1lbnRQcmV2aWV3UmVtb3ZlSWNvbik7XG5cdFx0Y29tbWVudFByZXZpZXdSZW1vdmVCdXR0b24udGl0bGUgPSBsb2NhbGl6ZWRTdHJpbmdzLnJlbW92ZUNvbW1lbnQ7XG5cdFx0Y29tbWVudFByZXZpZXdSZW1vdmVCdXR0b24uc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgbG9jYWxpemVkU3RyaW5ncy5yZW1vdmVFbGVtZW50Q29tbWVudCk7XG5cdFx0Y29tbWVudFByZXZpZXdSZW1vdmVCdXR0b24uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5fY29tbWVudFByZXZpZXdFbGVtZW50SWQpIHtcblx0XHRcdFx0dGhpcy5fcmVtb3ZlQ29tbWVudCh0aGlzLl9jb21tZW50UHJldmlld0VsZW1lbnRJZCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0dGhpcy5fY29tbWVudFByZXZpZXdSZW1vdmVCdXR0b24gPSBjb21tZW50UHJldmlld1JlbW92ZUJ1dHRvbjtcblxuXHRcdGNvbnN0IG92ZXJsYXkgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRvdmVybGF5LmNsYXNzTmFtZSA9ICdvdmVybGF5Jztcblx0XHRyb290LmFwcGVuZENoaWxkKG92ZXJsYXkpO1xuXHRcdHRoaXMuX292ZXJsYXkgPSBvdmVybGF5O1xuXG5cdFx0Y29uc3QgbGFiZWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRsYWJlbC5jbGFzc05hbWUgPSAnbGFiZWwnO1xuXHRcdGxhYmVsLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0cm9vdC5hcHBlbmRDaGlsZChsYWJlbCk7XG5cdFx0dGhpcy5fbGFiZWwgPSBsYWJlbDtcblxuXHRcdGNvbnN0IGxhYmVsSW5mbyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NwYW4nKTtcblx0XHRsYWJlbEluZm8uY2xhc3NOYW1lID0gJ2xhYmVsLWluZm8nO1xuXHRcdGxhYmVsLmFwcGVuZENoaWxkKGxhYmVsSW5mbyk7XG5cblx0XHRjb25zdCBsYWJlbFNlbGVjdG9yID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3BhbicpO1xuXHRcdGxhYmVsU2VsZWN0b3IuY2xhc3NOYW1lID0gJ2xhYmVsLXNlbGVjdG9yJztcblx0XHRsYWJlbEluZm8uYXBwZW5kQ2hpbGQobGFiZWxTZWxlY3Rvcik7XG5cdFx0dGhpcy5fbGFiZWxTZWxlY3RvciA9IGxhYmVsU2VsZWN0b3I7XG5cblx0XHRjb25zdCBsYWJlbENsYXNzZXMgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzcGFuJyk7XG5cdFx0bGFiZWxDbGFzc2VzLmNsYXNzTmFtZSA9ICdsYWJlbC1jbGFzc2VzJztcblx0XHRsYWJlbEluZm8uYXBwZW5kQ2hpbGQobGFiZWxDbGFzc2VzKTtcblx0XHR0aGlzLl9sYWJlbENsYXNzZXMgPSBsYWJlbENsYXNzZXM7XG5cblx0XHRjb25zdCBsYWJlbERpbXMgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzcGFuJyk7XG5cdFx0bGFiZWxEaW1zLmNsYXNzTmFtZSA9ICdsYWJlbC1kaW1zJztcblx0XHRsYWJlbC5hcHBlbmRDaGlsZChsYWJlbERpbXMpO1xuXHRcdHRoaXMuX2xhYmVsRGltcyA9IGxhYmVsRGltcztcblxuXHRcdGNvbnN0IGNvbW1lbnRQcmV2aWV3SGl0QXJlYSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdGNvbW1lbnRQcmV2aWV3SGl0QXJlYS5jbGFzc05hbWUgPSAnY29tbWVudC1wcmV2aWV3LWhpdC1hcmVhJztcblx0XHRjb21tZW50UHJldmlld0hpdEFyZWEuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHRyb290LmFwcGVuZENoaWxkKGNvbW1lbnRQcmV2aWV3SGl0QXJlYSk7XG5cdFx0dGhpcy5fY29tbWVudFByZXZpZXdIaXRBcmVhID0gY29tbWVudFByZXZpZXdIaXRBcmVhO1xuXG5cdFx0Y29uc3QgY29tbWVudFByZXZpZXcgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRjb21tZW50UHJldmlldy5jbGFzc05hbWUgPSAnY29tbWVudC1zdXJmYWNlIGNvbW1lbnQtcHJldmlldyc7XG5cdFx0Y29tbWVudFByZXZpZXcuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHRjb21tZW50UHJldmlldy5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAnbm90ZScpO1xuXHRcdGNvbnN0IGNvbW1lbnRQcmV2aWV3Qm9keSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NwYW4nKTtcblx0XHRjb21tZW50UHJldmlld0JvZHkuY2xhc3NOYW1lID0gJ2NvbW1lbnQtcHJldmlldy1ib2R5Jztcblx0XHRjb21tZW50UHJldmlldy5hcHBlbmRDaGlsZChjb21tZW50UHJldmlld0JvZHkpO1xuXHRcdGNvbW1lbnRQcmV2aWV3LmFwcGVuZENoaWxkKGNvbW1lbnRQcmV2aWV3UmVtb3ZlQnV0dG9uKTtcblx0XHRjb21tZW50UHJldmlld0hpdEFyZWEuYXBwZW5kQ2hpbGQoY29tbWVudFByZXZpZXcpO1xuXHRcdHRoaXMuX2NvbW1lbnRQcmV2aWV3ID0gY29tbWVudFByZXZpZXc7XG5cdFx0dGhpcy5fY29tbWVudFByZXZpZXdCb2R5ID0gY29tbWVudFByZXZpZXdCb2R5O1xuXG5cdFx0Y29tbWVudFByZXZpZXdIaXRBcmVhLmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlZW50ZXInLCAoKSA9PiB0aGlzLl9jYW5jZWxDb21tZW50UHJldmlld0hpZGUoKSk7XG5cdFx0Y29tbWVudFByZXZpZXdIaXRBcmVhLmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlbGVhdmUnLCAoKSA9PiB0aGlzLl9zY2hlZHVsZUNvbW1lbnRQcmV2aWV3SGlkZSgpKTtcblx0XHRjb21tZW50UHJldmlld0hpdEFyZWEuYWRkRXZlbnRMaXN0ZW5lcignZm9jdXNpbicsICgpID0+IHRoaXMuX2NhbmNlbENvbW1lbnRQcmV2aWV3SGlkZSgpKTtcblx0XHRjb21tZW50UHJldmlld0hpdEFyZWEuYWRkRXZlbnRMaXN0ZW5lcignZm9jdXNvdXQnLCAoKSA9PiB0aGlzLl9zY2hlZHVsZUNvbW1lbnRQcmV2aWV3SGlkZSgpKTtcblxuXHRcdGNvbnN0IGRyYWdib3ggPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRkcmFnYm94LmNsYXNzTmFtZSA9ICdkcmFnYm94Jztcblx0XHRkcmFnYm94LnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0cm9vdC5hcHBlbmRDaGlsZChkcmFnYm94KTtcblx0XHR0aGlzLl9kcmFnYm94ID0gZHJhZ2JveDtcblxuXHRcdGNvbnN0IGNvbW1lbnRMYXllciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdGNvbW1lbnRMYXllci5jbGFzc05hbWUgPSAnY29tbWVudC1sYXllcic7XG5cdFx0cm9vdC5hcHBlbmRDaGlsZChjb21tZW50TGF5ZXIpO1xuXHRcdHRoaXMuX2NvbW1lbnRMYXllciA9IGNvbW1lbnRMYXllcjtcblxuXHRcdGNvbnN0IGNvbW1lbnRDb21wb3NlciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdGNvbW1lbnRDb21wb3Nlci5jbGFzc05hbWUgPSAnY29tbWVudC1zdXJmYWNlIGNvbW1lbnQtY29tcG9zZXInO1xuXHRcdGNvbW1lbnRDb21wb3Nlci5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdGNvbW1lbnRDb21wb3Nlci5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAnZGlhbG9nJyk7XG5cdFx0Y29tbWVudENvbXBvc2VyLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIGxvY2FsaXplZFN0cmluZ3MuY29tbWVudE9uU2VsZWN0ZWRFbGVtZW50KTtcblx0XHRjb21tZW50Q29tcG9zZXIuc2V0QXR0cmlidXRlKCdhcmlhLW1vZGFsJywgJ3RydWUnKTtcblx0XHRjb21tZW50TGF5ZXIuYXBwZW5kQ2hpbGQoY29tbWVudENvbXBvc2VyKTtcblx0XHR0aGlzLl9jb21tZW50Q29tcG9zZXIgPSBjb21tZW50Q29tcG9zZXI7XG5cblx0XHRjb25zdCBjb21tZW50SW5wdXQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCd0ZXh0YXJlYScpO1xuXHRcdGNvbW1lbnRJbnB1dC5jbGFzc05hbWUgPSAnY29tbWVudC1pbnB1dCc7XG5cdFx0Y29tbWVudElucHV0LnJvd3MgPSAxO1xuXHRcdGNvbW1lbnRJbnB1dC5wbGFjZWhvbGRlciA9IGxvY2FsaXplZFN0cmluZ3MuYWRkQ29tbWVudFBsYWNlaG9sZGVyO1xuXHRcdGNvbW1lbnRJbnB1dC5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBsb2NhbGl6ZWRTdHJpbmdzLmNvbW1lbnRPblNlbGVjdGVkRWxlbWVudCk7XG5cdFx0Y29tbWVudElucHV0LmFkZEV2ZW50TGlzdGVuZXIoJ2lucHV0JywgKCkgPT4gdGhpcy5fbGF5b3V0Q29tbWVudElucHV0KCkpO1xuXHRcdGNvbW1lbnRJbnB1dC5hZGRFdmVudExpc3RlbmVyKCdrZXlkb3duJywgZXZlbnQgPT4ge1xuXHRcdFx0ZXZlbnQuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHRpZiAoZXZlbnQua2V5ID09PSAnRW50ZXInICYmICFldmVudC5pc0NvbXBvc2luZykge1xuXHRcdFx0XHRldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHR0aGlzLl9zdWJtaXRDb21tZW50KCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0Y29tbWVudElucHV0LmFkZEV2ZW50TGlzdGVuZXIoJ2tleXByZXNzJywgZXZlbnQgPT4gZXZlbnQuc3RvcFByb3BhZ2F0aW9uKCkpO1xuXHRcdGNvbW1lbnRJbnB1dC5hZGRFdmVudExpc3RlbmVyKCdrZXl1cCcsIGV2ZW50ID0+IGV2ZW50LnN0b3BQcm9wYWdhdGlvbigpKTtcblx0XHRjb21tZW50Q29tcG9zZXIuYXBwZW5kQ2hpbGQoY29tbWVudElucHV0KTtcblx0XHR0aGlzLl9jb21tZW50SW5wdXQgPSBjb21tZW50SW5wdXQ7XG5cblx0XHRjb25zdCBzZW5kQnV0dG9uID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYnV0dG9uJyk7XG5cdFx0c2VuZEJ1dHRvbi5jbGFzc05hbWUgPSAnY29tbWVudC1zZW5kJztcblx0XHRzZW5kQnV0dG9uLnR5cGUgPSAnYnV0dG9uJztcblx0XHRjb25zdCBzZW5kQnV0dG9uSWNvbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnROUyhzdmdOYW1lc3BhY2UsICdzdmcnKTtcblx0XHRzZW5kQnV0dG9uSWNvbi5zZXRBdHRyaWJ1dGUoJ3ZpZXdCb3gnLCAnMCAwIDE2IDE2Jyk7XG5cdFx0c2VuZEJ1dHRvbkljb24uc2V0QXR0cmlidXRlKCdmaWxsJywgJ2N1cnJlbnRDb2xvcicpO1xuXHRcdHNlbmRCdXR0b25JY29uLnNldEF0dHJpYnV0ZSgnYXJpYS1oaWRkZW4nLCAndHJ1ZScpO1xuXHRcdGNvbnN0IHNlbmRCdXR0b25JY29uUGF0aCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnROUyhzdmdOYW1lc3BhY2UsICdwYXRoJyk7XG5cdFx0c2VuZEJ1dHRvbkljb25QYXRoLnNldEF0dHJpYnV0ZSgnZCcsICdNOC41IDNhLjUuNSAwIDAgMC0xIDB2NC41SDNhLjUuNSAwIDAgMCAwIDFoNC41VjEzYS41LjUgMCAwIDAgMSAwVjguNUgxM2EuNS41IDAgMCAwIDAtMUg4LjVWM1onKTtcblx0XHRzZW5kQnV0dG9uSWNvbi5hcHBlbmRDaGlsZChzZW5kQnV0dG9uSWNvblBhdGgpO1xuXHRcdHNlbmRCdXR0b24uYXBwZW5kQ2hpbGQoc2VuZEJ1dHRvbkljb24pO1xuXHRcdHNlbmRCdXR0b24udGl0bGUgPSBsb2NhbGl6ZWRTdHJpbmdzLmFkZENvbW1lbnQ7XG5cdFx0c2VuZEJ1dHRvbi5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBsb2NhbGl6ZWRTdHJpbmdzLmFkZENvbW1lbnQpO1xuXHRcdHNlbmRCdXR0b24uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB0aGlzLl9zdWJtaXRDb21tZW50KCkpO1xuXHRcdGNvbW1lbnRDb21wb3Nlci5hcHBlbmRDaGlsZChzZW5kQnV0dG9uKTtcblx0XHR0aGlzLl9jb21tZW50U2VuZEJ1dHRvbiA9IHNlbmRCdXR0b247XG5cblx0XHRjb21tZW50Q29tcG9zZXIuYWRkRXZlbnRMaXN0ZW5lcigna2V5ZG93bicsIGV2ZW50ID0+IHtcblx0XHRcdGlmIChldmVudC5rZXkgIT09ICdUYWInKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGlmIChldmVudC5zaGlmdEtleSAmJiBldmVudC50YXJnZXQgPT09IGNvbW1lbnRJbnB1dCkge1xuXHRcdFx0XHRldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHRzZW5kQnV0dG9uLmZvY3VzKCk7XG5cdFx0XHR9IGVsc2UgaWYgKCFldmVudC5zaGlmdEtleSAmJiBldmVudC50YXJnZXQgPT09IHNlbmRCdXR0b24pIHtcblx0XHRcdFx0ZXZlbnQucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0Y29tbWVudElucHV0LmZvY3VzKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignc2Nyb2xsJywgKCkgPT4gdGhpcy5fb25TY3JvbGxPclJlc2l6ZSgpLCB7IHBhc3NpdmU6IHRydWUsIGNhcHR1cmU6IHRydWUgfSk7XG5cdFx0d2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ3Jlc2l6ZScsICgpID0+IHRoaXMuX29uU2Nyb2xsT3JSZXNpemUoKSk7XG5cdH1cblxuXHRzdGFydChvcHRpb25zOiBJQnJvd3NlckVsZW1lbnRTZWxlY3Rpb25PcHRpb25zKTogYm9vbGVhbiB7XG5cdFx0aWYgKHRoaXMuX3NlbGVjdGlvbkFjdGl2ZSkge1xuXHRcdFx0dGhpcy5fdXBkYXRlU2VsZWN0aW9uT3B0aW9ucyhvcHRpb25zKTtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHR0aGlzLl9jb21tZW50TW9kZSA9IG9wdGlvbnMubW9kZSA9PT0gY29tbWVudEVsZW1lbnRTZWxlY3Rpb25Nb2RlO1xuXHRcdHRoaXMuX2NvbnRpbnVvdXMgPSBvcHRpb25zLmNvbnRpbnVvdXMgPz8gZmFsc2U7XG5cdFx0dGhpcy5fZW5zdXJlTW91bnRlZCgpO1xuXHRcdHRoaXMuX3NlbGVjdGlvbkFjdGl2ZSA9IHRydWU7XG5cdFx0dGhpcy5fb3ZlcmxheS5zdHlsZS5kaXNwbGF5ID0gJ2Jsb2NrJztcblxuXHRcdC8vIEluamVjdCBhIHN0eWxlc2hlZXQgaW50byB0aGUgcGFnZSB0byBvdmVycmlkZSBhbGwgY3Vyc29ycyB3aGlsZSBlbGVtZW50IHNlbGVjdGlvbiBpcyBhY3RpdmUsXG5cdFx0Ly8gc28gdGhlIGN1cnNvciBhbHdheXMgYXBwZWFycyBhcyBhIG5vcm1hbCBwb2ludGVyIGV2ZW4gd2hlbiBvdmVyIGUuZy4gbGlua3MuXG5cdFx0Ly8gVXBkYXRlZCB0byBjcm9zc2hhaXIgaW4gX29uUG9pbnRlckRvd24sIHJlc2V0IGluIF9vblBvaW50ZXJVcC5cblx0XHRjb25zdCBjdXJzb3JTdHlsZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3N0eWxlJyk7XG5cdFx0Y3Vyc29yU3R5bGUudGV4dENvbnRlbnQgPSBFbGVtZW50UGlja2VyLl9DVVJTT1JfREVGQVVMVDtcblx0XHRkb2N1bWVudC5oZWFkLmFwcGVuZENoaWxkKGN1cnNvclN0eWxlKTtcblx0XHR0aGlzLl9jdXJzb3JTdHlsZXNoZWV0ID0gY3Vyc29yU3R5bGU7XG5cblx0XHQvLyBSZWdpc3RlciBoaWdoLWZyZXF1ZW5jeSBsaXN0ZW5lcnMgb25seSB3aGlsZSBzZWxlY3Rpb24gaXMgYWN0aXZlLlxuXHRcdHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdwb2ludGVybW92ZScsIHRoaXMuX29uUG9pbnRlck1vdmUsIHRydWUpO1xuXHRcdGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ3BvaW50ZXJsZWF2ZScsIHRoaXMuX29uUG9pbnRlckxlYXZlLCB0cnVlKTtcblx0XHR3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcigncG9pbnRlcmRvd24nLCB0aGlzLl9vblBvaW50ZXJEb3duLCB0cnVlKTtcblx0XHR3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcigncG9pbnRlcnVwJywgdGhpcy5fb25Qb2ludGVyVXAsIHRydWUpO1xuXHRcdHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIHRoaXMuX29uQ2xpY2ssIHRydWUpO1xuXHRcdHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdjb250ZXh0bWVudScsIHRoaXMuX29uQ2xpY2ssIHRydWUpO1xuXHRcdHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdmb2N1c2luJywgdGhpcy5fb25Gb2N1c0luLCB0cnVlKTtcblx0XHR3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignYmx1cicsIHRoaXMuX29uV2luZG93Qmx1cik7XG5cdFx0d2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCB0aGlzLl9vbktleURvd24sIHRydWUpO1xuXG5cdFx0aWYgKCF0aGlzLl9leHRlcm5hbEhpZ2hsaWdodFRhcmdldCkge1xuXHRcdFx0Y29uc3QgZm9jdXNlZEVsZW1lbnQgPSB0aGlzLl9nZXRGb2N1c2VkRWxlbWVudCgpO1xuXHRcdFx0dGhpcy5fZm9jdXNlZFRhcmdldCA9IG9wdGlvbnMuaGlnaGxpZ2h0Rm9jdXNlZEVsZW1lbnQgPyBmb2N1c2VkRWxlbWVudCA6IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMuX3VwZGF0ZUhpZ2hsaWdodCh0aGlzLl9mb2N1c2VkVGFyZ2V0KTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZVNlbGVjdGlvbk9wdGlvbnMob3B0aW9uczogSUJyb3dzZXJFbGVtZW50U2VsZWN0aW9uT3B0aW9ucyk6IHZvaWQge1xuXHRcdGNvbnN0IHdhc0NvbW1lbnRNb2RlID0gdGhpcy5fY29tbWVudE1vZGU7XG5cdFx0dGhpcy5fY29tbWVudE1vZGUgPSBvcHRpb25zLm1vZGUgPT09IGNvbW1lbnRFbGVtZW50U2VsZWN0aW9uTW9kZTtcblx0XHR0aGlzLl9jb250aW51b3VzID0gb3B0aW9ucy5jb250aW51b3VzID8/IGZhbHNlO1xuXHRcdGlmICh3YXNDb21tZW50TW9kZSAmJiAhdGhpcy5fY29tbWVudE1vZGUgJiYgdGhpcy5fY29tbWVudFRhcmdldCkge1xuXHRcdFx0dGhpcy5fY2xvc2VDb21tZW50Q29tcG9zZXIoKTtcblx0XHR9XG5cdFx0aWYgKG9wdGlvbnMuaGlnaGxpZ2h0Rm9jdXNlZEVsZW1lbnQgJiYgIXRoaXMuX2NvbW1lbnRUYXJnZXQgJiYgIXRoaXMuX2NvbW1lbnRQcmV2aWV3RWxlbWVudElkICYmICF0aGlzLl9leHRlcm5hbEhpZ2hsaWdodFRhcmdldCkge1xuXHRcdFx0dGhpcy5fZm9jdXNlZFRhcmdldCA9IHRoaXMuX2dldEZvY3VzZWRFbGVtZW50KCk7XG5cdFx0XHR0aGlzLl91cGRhdGVIaWdobGlnaHQodGhpcy5fZm9jdXNlZFRhcmdldCk7XG5cdFx0fVxuXHR9XG5cblx0c3RvcCgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX3NlbGVjdGlvbkFjdGl2ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9oaWRlQWN0aXZlQ29tbWVudFByZXZpZXcoKTtcblx0XHR0aGlzLl9zZWxlY3Rpb25BY3RpdmUgPSBmYWxzZTtcblx0XHR0aGlzLl9jbG9zZUNvbW1lbnRDb21wb3NlcigpO1xuXHRcdHRoaXMuX292ZXJsYXkuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblxuXHRcdHRoaXMuX2N1cnNvclN0eWxlc2hlZXQ/LnJlbW92ZSgpO1xuXHRcdHRoaXMuX2N1cnNvclN0eWxlc2hlZXQgPSB1bmRlZmluZWQ7XG5cblx0XHQvLyBSZW1vdmUgaGlnaC1mcmVxdWVuY3kgbGlzdGVuZXJzLlxuXHRcdHdpbmRvdy5yZW1vdmVFdmVudExpc3RlbmVyKCdwb2ludGVybW92ZScsIHRoaXMuX29uUG9pbnRlck1vdmUsIHRydWUpO1xuXHRcdGRvY3VtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ3BvaW50ZXJsZWF2ZScsIHRoaXMuX29uUG9pbnRlckxlYXZlLCB0cnVlKTtcblx0XHR3aW5kb3cucmVtb3ZlRXZlbnRMaXN0ZW5lcigncG9pbnRlcmRvd24nLCB0aGlzLl9vblBvaW50ZXJEb3duLCB0cnVlKTtcblx0XHR3aW5kb3cucmVtb3ZlRXZlbnRMaXN0ZW5lcigncG9pbnRlcnVwJywgdGhpcy5fb25Qb2ludGVyVXAsIHRydWUpO1xuXHRcdHdpbmRvdy5yZW1vdmVFdmVudExpc3RlbmVyKCdjbGljaycsIHRoaXMuX29uQ2xpY2ssIHRydWUpO1xuXHRcdHdpbmRvdy5yZW1vdmVFdmVudExpc3RlbmVyKCdjb250ZXh0bWVudScsIHRoaXMuX29uQ2xpY2ssIHRydWUpO1xuXHRcdHdpbmRvdy5yZW1vdmVFdmVudExpc3RlbmVyKCdmb2N1c2luJywgdGhpcy5fb25Gb2N1c0luLCB0cnVlKTtcblx0XHR3aW5kb3cucmVtb3ZlRXZlbnRMaXN0ZW5lcignYmx1cicsIHRoaXMuX29uV2luZG93Qmx1cik7XG5cdFx0d2luZG93LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCB0aGlzLl9vbktleURvd24sIHRydWUpO1xuXG5cdFx0dGhpcy5faGlnaGxpZ2h0LnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0dGhpcy5fbGFiZWwuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHR0aGlzLl9kcmFnYm94LnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0dGhpcy5fZHJhZ1N0YXJ0ID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX2RyYWdTdGFydFRhcmdldCA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9kaXNtaXNzZWRDb21tZW50T25Qb2ludGVyRG93biA9IGZhbHNlO1xuXHRcdHRoaXMuX2hpZ2hsaWdodFRhcmdldCA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9mb2N1c2VkVGFyZ2V0ID0gdW5kZWZpbmVkO1xuXHRcdGlmICh0aGlzLl9leHRlcm5hbEhpZ2hsaWdodFRhcmdldCkge1xuXHRcdFx0dGhpcy5fdXBkYXRlSGlnaGxpZ2h0KHRoaXMuX2V4dGVybmFsSGlnaGxpZ2h0VGFyZ2V0KTtcblx0XHR9XG5cblx0XHR0aGlzLl9vblN0b3BwZWQoKTtcblx0XHR0aGlzLl91bm1vdW50V2hlbklkbGUoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBVcGRhdGUgdGhlIHRoZW1lIGNvbG9ycyBhcHBsaWVkIHRvIHRoZSBvdmVybGF5LlxuXHQgKiBDYW4gYmUgY2FsbGVkIGF0IGFueSB0aW1lOyB0YWtlcyBlZmZlY3QgaW1tZWRpYXRlbHkuXG5cdCAqL1xuXHRzZXRUaGVtZSh0aGVtZTogSUJyb3dzZXJWaWV3VGhlbWUpOiB2b2lkIHtcblx0XHRFbGVtZW50UGlja2VyLl9hcHBseVRoZW1lKHRoaXMuX3NoYWRvd0hvc3QsIHRoZW1lKTtcblx0XHR0aGlzLl9yZWR1Y2VkTW90aW9uID0gdGhlbWUucmVkdWNlZE1vdGlvbiA/PyBmYWxzZTtcblx0XHR0aGlzLl9zaGFkb3dIb3N0LmNsYXNzTGlzdC50b2dnbGUoJ3JlZHVjZS1tb3Rpb24nLCB0aGlzLl9yZWR1Y2VkTW90aW9uKTtcblx0fVxuXG5cdHVwZGF0ZUxvY2FsaXplZFN0cmluZ3MoKTogdm9pZCB7XG5cdFx0dGhpcy5fYXBwbHlMb2NhbGl6ZWRTdHJpbmdzKCk7XG5cdH1cblxuXHRyZXNvbHZlQ29udGV4dE1lbnVUYXJnZXQoZXZlbnQ6IE1vdXNlRXZlbnQpOiBFbGVtZW50IHwgdW5kZWZpbmVkIHtcblx0XHRpZiAodGhpcy5fY29tbWVudFByZXZpZXdFbGVtZW50SWQgJiYgZXZlbnQuY29tcG9zZWRQYXRoKCkuaW5jbHVkZXModGhpcy5fc2hhZG93SG9zdCkpIHtcblx0XHRcdHRoaXMuX2hpZGVBY3RpdmVDb21tZW50UHJldmlldygpO1xuXHRcdFx0cmV0dXJuIHRoaXMuX3BpY2tFbGVtZW50QXQoZXZlbnQuY2xpZW50WCwgZXZlbnQuY2xpZW50WSk7XG5cdFx0fVxuXHRcdHJldHVybiBldmVudC50YXJnZXQgaW5zdGFuY2VvZiBFbGVtZW50ID8gZXZlbnQudGFyZ2V0IDogdW5kZWZpbmVkO1xuXHR9XG5cblx0LyoqXG5cdCAqIEhpZ2hsaWdodCBhIHNwZWNpZmljIGVsZW1lbnQgd2l0aG91dCBzdGFydGluZyBhIHBpY2sgc2Vzc2lvbi5cblx0ICogTW91bnRzIHRoZSBzaGFkb3cgaG9zdCBpZiBub3QgYWxyZWFkeSBpbiB0aGUgZG9jdW1lbnQuXG5cdCAqL1xuXHRoaWdobGlnaHQoZWxlbWVudDogRWxlbWVudCk6IHZvaWQge1xuXHRcdHRoaXMuX2Vuc3VyZU1vdW50ZWQoKTtcblx0XHR0aGlzLl9leHRlcm5hbEhpZ2hsaWdodFRhcmdldCA9IGVsZW1lbnQ7XG5cdFx0dGhpcy5faGlkZUFjdGl2ZUNvbW1lbnRQcmV2aWV3KCk7XG5cdFx0dGhpcy5fdXBkYXRlSGlnaGxpZ2h0KGVsZW1lbnQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEhpZGUgYW55IGN1cnJlbnQgaGlnaGxpZ2h0LiBJZiBubyBwaWNrIHNlc3Npb24gaXMgYWN0aXZlLCBhbHNvXG5cdCAqIHJlbW92ZXMgdGhlIHNoYWRvdyBob3N0IGZyb20gdGhlIGRvY3VtZW50LlxuXHQgKi9cblx0aGlkZUhpZ2hsaWdodCgpOiB2b2lkIHtcblx0XHR0aGlzLl9leHRlcm5hbEhpZ2hsaWdodFRhcmdldCA9IHVuZGVmaW5lZDtcblx0XHRpZiAodGhpcy5fY29tbWVudFRhcmdldCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl91cGRhdGVIaWdobGlnaHQodW5kZWZpbmVkKTtcblx0XHR0aGlzLl91bm1vdW50V2hlbklkbGUoKTtcblx0fVxuXG5cdGNvbW1lbnQoZWxlbWVudDogRWxlbWVudCwgYW5jaG9yOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH0pOiB2b2lkIHtcblx0XHR0aGlzLl9leHRlcm5hbEhpZ2hsaWdodFRhcmdldCA9IHVuZGVmaW5lZDtcblx0XHRpZiAodGhpcy5fc2VsZWN0aW9uQWN0aXZlKSB7XG5cdFx0XHR0aGlzLnN0b3AoKTtcblx0XHR9XG5cdFx0dGhpcy5zdGFydCh7IG1vZGU6IGNvbW1lbnRFbGVtZW50U2VsZWN0aW9uTW9kZSB9KTtcblx0XHR0aGlzLl9zaG93Q29tbWVudENvbXBvc2VyKGVsZW1lbnQsIGFuY2hvciwgdHJ1ZSk7XG5cdH1cblxuXHR1cGRhdGVDb21tZW50cyh1cGRhdGU6IElCcm93c2VyRWxlbWVudENvbW1lbnRzVXBkYXRlKTogdm9pZCB7XG5cdFx0aWYgKHVwZGF0ZS5jb21tZW50cykge1xuXHRcdFx0Y29uc3QgaW5jb21pbmcgPSBuZXcgTWFwKHVwZGF0ZS5jb21tZW50cy5tYXAoKGNvbW1lbnQsIGluZGV4KSA9PiBbY29tbWVudC5lbGVtZW50SWQsIHsgYm9keTogY29tbWVudC5ib2R5LCBvcmRpbmFsOiBpbmRleCArIDEgfV0pKTtcblx0XHRcdGZvciAoY29uc3QgW2VsZW1lbnRJZCwgY29tbWVudF0gb2YgdGhpcy5fY29tbWVudHMpIHtcblx0XHRcdFx0Y29uc3QgaW5jb21pbmdDb21tZW50ID0gaW5jb21pbmcuZ2V0KGVsZW1lbnRJZCk7XG5cdFx0XHRcdGlmICghaW5jb21pbmdDb21tZW50KSB7XG5cdFx0XHRcdFx0aWYgKHRoaXMuX2NvbW1lbnRQcmV2aWV3RWxlbWVudElkID09PSBlbGVtZW50SWQpIHtcblx0XHRcdFx0XHRcdHRoaXMuX2hpZGVBY3RpdmVDb21tZW50UHJldmlldygpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb21tZW50LnBpbi5yZW1vdmUoKTtcblx0XHRcdFx0XHR0aGlzLl9jb21tZW50cy5kZWxldGUoZWxlbWVudElkKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRjb21tZW50Lm9yZGluYWwgPSBpbmNvbWluZ0NvbW1lbnQub3JkaW5hbDtcblx0XHRcdFx0XHRpZiAoaW5jb21pbmdDb21tZW50LmJvZHkgPT09IGNvbW1lbnQuYm9keSkge1xuXHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbW1lbnQuYm9keSA9IGluY29taW5nQ29tbWVudC5ib2R5O1xuXHRcdFx0XHRcdGlmICh0aGlzLl9jb21tZW50UHJldmlld0VsZW1lbnRJZCA9PT0gZWxlbWVudElkKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9zZXRDb21tZW50UHJldmlld0JvZHkoaW5jb21pbmdDb21tZW50LmJvZHkpO1xuXHRcdFx0XHRcdFx0dGhpcy5fcmVuZGVySGlnaGxpZ2h0KGNvbW1lbnQudGFyZ2V0KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGZvciAoY29uc3QgW2VsZW1lbnRJZCwgY29tbWVudF0gb2YgaW5jb21pbmcpIHtcblx0XHRcdFx0aWYgKHRoaXMuX2NvbW1lbnRzLmhhcyhlbGVtZW50SWQpKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgcGVuZGluZyA9IHRoaXMuX3BlbmRpbmdDb21tZW50cy5nZXQoZWxlbWVudElkKTtcblx0XHRcdFx0aWYgKHBlbmRpbmcpIHtcblx0XHRcdFx0XHR0aGlzLl9zY2hlZHVsZUNvbW1lbnRQaW4oZWxlbWVudElkLCBjb21tZW50LmJvZHksIGNvbW1lbnQub3JkaW5hbCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGZvciAoY29uc3QgZWxlbWVudElkIG9mIHRoaXMuX3NjaGVkdWxlZENvbW1lbnRQaW5zLmtleXMoKSkge1xuXHRcdFx0XHRpZiAoIWluY29taW5nLmhhcyhlbGVtZW50SWQpKSB7XG5cdFx0XHRcdFx0dGhpcy5fZGlzY2FyZFBlbmRpbmdDb21tZW50KGVsZW1lbnRJZCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0Zm9yIChjb25zdCBlbGVtZW50SWQgb2YgdXBkYXRlLnBlbmRpbmdDb21tZW50SWRzVG9EaXNjYXJkID8/IFtdKSB7XG5cdFx0XHR0aGlzLl9kaXNjYXJkUGVuZGluZ0NvbW1lbnQoZWxlbWVudElkKTtcblx0XHR9XG5cdFx0dGhpcy5fdXBkYXRlQ29tbWVudFBpbk51bWJlcnMoKTtcblx0XHR0aGlzLl91bm1vdW50V2hlbklkbGUoKTtcblx0fVxuXG5cdC8vIC0tLSBFdmVudCBoYW5kbGVycyAtLS1cblxuXHRwcml2YXRlIF9vblBvaW50ZXJNb3ZlID0gKGU6IFBvaW50ZXJFdmVudCk6IHZvaWQgPT4ge1xuXHRcdGlmICghdGhpcy5fc2VsZWN0aW9uQWN0aXZlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGlzT3ZlclBpY2tlciA9IGUuY29tcG9zZWRQYXRoKCkuaW5jbHVkZXModGhpcy5fc2hhZG93SG9zdCk7XG5cdFx0aWYgKHRoaXMuX2NvbW1lbnRUYXJnZXQpIHtcblx0XHRcdGlmICghaXNPdmVyUGlja2VyKSB7XG5cdFx0XHRcdHRoaXMuX2NvbW1lbnRQb2ludGVySW50ZXJhY3Rpb24gPSB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBwZW5kaW5nQ29tbWVudCA9IHRoaXMuX3BlbmRpbmdDb21tZW50SW50ZXJhY3Rpb25JZCA/IHRoaXMuX3BlbmRpbmdDb21tZW50cy5nZXQodGhpcy5fcGVuZGluZ0NvbW1lbnRJbnRlcmFjdGlvbklkKSA6IHVuZGVmaW5lZDtcblx0XHRpZiAocGVuZGluZ0NvbW1lbnQpIHtcblx0XHRcdGlmICghaXNPdmVyUGlja2VyKSB7XG5cdFx0XHRcdHBlbmRpbmdDb21tZW50LnBvaW50ZXJJbnRlcmFjdGlvbiA9IHRydWU7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9jb21tZW50UHJldmlld0VsZW1lbnRJZCB8fCB0aGlzLl9leHRlcm5hbEhpZ2hsaWdodFRhcmdldCB8fCBpc092ZXJQaWNrZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0aWYgKCF0aGlzLl9kcmFnU3RhcnQpIHtcblx0XHRcdHRoaXMuX3VwZGF0ZUhpZ2hsaWdodCh0aGlzLl9waWNrRWxlbWVudEF0KGUuY2xpZW50WCwgZS5jbGllbnRZKSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGR4ID0gTWF0aC5hYnMoZS5jbGllbnRYIC0gdGhpcy5fZHJhZ1N0YXJ0LngpO1xuXHRcdGNvbnN0IGR5ID0gTWF0aC5hYnMoZS5jbGllbnRZIC0gdGhpcy5fZHJhZ1N0YXJ0LnkpO1xuXHRcdGlmIChkeCA8IEVsZW1lbnRQaWNrZXIuX0RSQUdfVEhSRVNIT0xEX1BYICYmIGR5IDwgRWxlbWVudFBpY2tlci5fRFJBR19USFJFU0hPTERfUFgpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgbGVmdCA9IE1hdGgubWluKHRoaXMuX2RyYWdTdGFydC54LCBlLmNsaWVudFgpO1xuXHRcdGNvbnN0IHRvcCA9IE1hdGgubWluKHRoaXMuX2RyYWdTdGFydC55LCBlLmNsaWVudFkpO1xuXHRcdHRoaXMuX2RyYWdib3guc3R5bGUuZGlzcGxheSA9ICdibG9jayc7XG5cdFx0dGhpcy5fZHJhZ2JveC5zdHlsZS5sZWZ0ID0gYCR7bGVmdH1weGA7XG5cdFx0dGhpcy5fZHJhZ2JveC5zdHlsZS50b3AgPSBgJHt0b3B9cHhgO1xuXHRcdHRoaXMuX2RyYWdib3guc3R5bGUud2lkdGggPSBgJHtkeH1weGA7XG5cdFx0dGhpcy5fZHJhZ2JveC5zdHlsZS5oZWlnaHQgPSBgJHtkeX1weGA7XG5cdFx0Ly8gTGl2ZSBwcmV2aWV3IG9mIHRoZSBkZWVwZXN0IGNvbW1vbiBhbmNlc3RvciB0aGF0IHRoZSByZWdpb25cblx0XHQvLyBjdXJyZW50bHkgcmVzb2x2ZXMgdG8sIHNvIHRoZSB1c2VyIHNlZXMgZXhhY3RseSB3aGF0IHdpbGwgYmVcblx0XHQvLyBzZWxlY3RlZCBpZiB0aGV5IHJlbGVhc2UgdGhlIGRyYWcgbm93LlxuXHRcdHRoaXMuX3VwZGF0ZUhpZ2hsaWdodCh0aGlzLl9waWNrUmVnaW9uQW5jZXN0b3IoeyB4OiBsZWZ0LCB5OiB0b3AsIHdpZHRoOiBkeCwgaGVpZ2h0OiBkeSB9KSk7XG5cdH07XG5cblx0cHJpdmF0ZSBfb25Qb2ludGVyTGVhdmUgPSAoKTogdm9pZCA9PiB7XG5cdFx0aWYgKCF0aGlzLl9zZWxlY3Rpb25BY3RpdmUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX2NvbW1lbnRUYXJnZXQpIHtcblx0XHRcdHRoaXMuX2NvbW1lbnRQb2ludGVySW50ZXJhY3Rpb24gPSB0cnVlO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBwZW5kaW5nQ29tbWVudCA9IHRoaXMuX3BlbmRpbmdDb21tZW50SW50ZXJhY3Rpb25JZCA/IHRoaXMuX3BlbmRpbmdDb21tZW50cy5nZXQodGhpcy5fcGVuZGluZ0NvbW1lbnRJbnRlcmFjdGlvbklkKSA6IHVuZGVmaW5lZDtcblx0XHRpZiAocGVuZGluZ0NvbW1lbnQpIHtcblx0XHRcdHBlbmRpbmdDb21tZW50LnBvaW50ZXJJbnRlcmFjdGlvbiA9IHRydWU7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9jb21tZW50UHJldmlld0VsZW1lbnRJZCB8fCB0aGlzLl9leHRlcm5hbEhpZ2hsaWdodFRhcmdldCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoIXRoaXMuX2RyYWdTdGFydCkge1xuXHRcdFx0dGhpcy5fdXBkYXRlSGlnaGxpZ2h0KHRoaXMuX2ZvY3VzZWRUYXJnZXQpO1xuXHRcdH1cblx0fTtcblxuXHRwcml2YXRlIF9vblBvaW50ZXJEb3duID0gKGU6IFBvaW50ZXJFdmVudCk6IHZvaWQgPT4ge1xuXHRcdGlmICghdGhpcy5fc2VsZWN0aW9uQWN0aXZlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2Rpc21pc3NlZENvbW1lbnRPblBvaW50ZXJEb3duID0gZmFsc2U7XG5cdFx0aWYgKGUuY29tcG9zZWRQYXRoKCkuaW5jbHVkZXModGhpcy5fc2hhZG93SG9zdCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX3BlbmRpbmdDb21tZW50SW50ZXJhY3Rpb25JZCkge1xuXHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX2NvbW1lbnRUYXJnZXQpIHtcblx0XHRcdHRoaXMuX2Rpc21pc3NlZENvbW1lbnRPblBvaW50ZXJEb3duID0gdHJ1ZTtcblx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2RyYWdTdGFydCA9IHsgeDogZS5jbGllbnRYLCB5OiBlLmNsaWVudFkgfTtcblx0XHR0aGlzLl9kcmFnU3RhcnRUYXJnZXQgPSB0aGlzLl9waWNrRWxlbWVudEF0KGUuY2xpZW50WCwgZS5jbGllbnRZKTtcblx0XHRpZiAodGhpcy5fY3Vyc29yU3R5bGVzaGVldCkge1xuXHRcdFx0dGhpcy5fY3Vyc29yU3R5bGVzaGVldC50ZXh0Q29udGVudCA9IEVsZW1lbnRQaWNrZXIuX0NVUlNPUl9DUk9TU0hBSVI7XG5cdFx0fVxuXHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHR9O1xuXG5cdHByaXZhdGUgX29uUG9pbnRlclVwID0gKGU6IFBvaW50ZXJFdmVudCk6IHZvaWQgPT4ge1xuXHRcdGlmICghdGhpcy5fc2VsZWN0aW9uQWN0aXZlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9kaXNtaXNzZWRDb21tZW50T25Qb2ludGVyRG93bikge1xuXHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdGNvbnN0IGNvbW1lbnRUYXJnZXQgPSB0aGlzLl9jb21tZW50VGFyZ2V0O1xuXHRcdFx0aWYgKGNvbW1lbnRUYXJnZXQpIHtcblx0XHRcdFx0d2luZG93LnNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0XHRcdGlmICh0aGlzLl9jb21tZW50VGFyZ2V0ID09PSBjb21tZW50VGFyZ2V0KSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9maW5pc2hDb21tZW50SW50ZXJhY3Rpb24oKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoZS5jb21wb3NlZFBhdGgoKS5pbmNsdWRlcyh0aGlzLl9zaGFkb3dIb3N0KSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoIXRoaXMuX2RyYWdTdGFydCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBkeCA9IE1hdGguYWJzKGUuY2xpZW50WCAtIHRoaXMuX2RyYWdTdGFydC54KTtcblx0XHRjb25zdCBkeSA9IE1hdGguYWJzKGUuY2xpZW50WSAtIHRoaXMuX2RyYWdTdGFydC55KTtcblx0XHRjb25zdCBzdGFydCA9IHRoaXMuX2RyYWdTdGFydDtcblx0XHR0aGlzLl9kcmFnU3RhcnQgPSB1bmRlZmluZWQ7XG5cdFx0aWYgKHRoaXMuX2N1cnNvclN0eWxlc2hlZXQpIHtcblx0XHRcdHRoaXMuX2N1cnNvclN0eWxlc2hlZXQudGV4dENvbnRlbnQgPSBFbGVtZW50UGlja2VyLl9DVVJTT1JfREVGQVVMVDtcblx0XHR9XG5cblx0XHRpZiAoZHggPCBFbGVtZW50UGlja2VyLl9EUkFHX1RIUkVTSE9MRF9QWCAmJiBkeSA8IEVsZW1lbnRQaWNrZXIuX0RSQUdfVEhSRVNIT0xEX1BYKSB7XG5cdFx0XHQvLyBDbGljayBcdTIxOTIgcGljayB0aGUgZWxlbWVudCB1bmRlciB0aGUgcG9pbnRlci5cblx0XHRcdGNvbnN0IHRhcmdldCA9IHRoaXMuX2RyYWdTdGFydFRhcmdldCA/PyB0aGlzLl9waWNrRWxlbWVudEF0KGUuY2xpZW50WCwgZS5jbGllbnRZKTtcblx0XHRcdHRoaXMuX2RyYWdTdGFydFRhcmdldCA9IHVuZGVmaW5lZDtcblx0XHRcdGlmICh0YXJnZXQpIHtcblx0XHRcdFx0dGhpcy5fY29tbWl0KHRhcmdldCwgeyB4OiBlLmNsaWVudFgsIHk6IGUuY2xpZW50WSB9KTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gRHJhZyBcdTIxOTIgcGljayB0aGUgZGVlcGVzdCBjb21tb24gYW5jZXN0b3Igb2YgdGhlIHJlZ2lvbi5cblx0XHRcdHRoaXMuX2RyYWdTdGFydFRhcmdldCA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMuX2RyYWdib3guc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHRcdHRoaXMuX3VwZGF0ZUhpZ2hsaWdodCh1bmRlZmluZWQpO1xuXHRcdFx0Y29uc3QgbGVmdCA9IE1hdGgubWluKHN0YXJ0LngsIGUuY2xpZW50WCk7XG5cdFx0XHRjb25zdCB0b3AgPSBNYXRoLm1pbihzdGFydC55LCBlLmNsaWVudFkpO1xuXHRcdFx0Y29uc3QgYW5jZXN0b3IgPSB0aGlzLl9waWNrUmVnaW9uQW5jZXN0b3IoeyB4OiBsZWZ0LCB5OiB0b3AsIHdpZHRoOiBkeCwgaGVpZ2h0OiBkeSB9KTtcblx0XHRcdGlmIChhbmNlc3Rvcikge1xuXHRcdFx0XHR0aGlzLl9jb21taXQoYW5jZXN0b3IsIHsgeDogZS5jbGllbnRYLCB5OiBlLmNsaWVudFkgfSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHR9O1xuXG5cdHByaXZhdGUgX29uQ2xpY2sgPSAoZTogRXZlbnQpOiB2b2lkID0+IHtcblx0XHRpZiAoIXRoaXMuX3NlbGVjdGlvbkFjdGl2ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fZGlzbWlzc2VkQ29tbWVudE9uUG9pbnRlckRvd24pIHtcblx0XHRcdHRoaXMuX2Rpc21pc3NlZENvbW1lbnRPblBvaW50ZXJEb3duID0gZmFsc2U7XG5cdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0dGhpcy5fZmluaXNoQ29tbWVudEludGVyYWN0aW9uKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmIChlLmNvbXBvc2VkUGF0aCgpLmluY2x1ZGVzKHRoaXMuX3NoYWRvd0hvc3QpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHR9O1xuXG5cdHByaXZhdGUgX29uRm9jdXNJbiA9IChldmVudDogRm9jdXNFdmVudCk6IHZvaWQgPT4ge1xuXHRcdGlmICghdGhpcy5fc2VsZWN0aW9uQWN0aXZlIHx8IHRoaXMuX2NvbW1lbnRUYXJnZXQgfHwgdGhpcy5fcGVuZGluZ0NvbW1lbnRJbnRlcmFjdGlvbklkIHx8IHRoaXMuX2V4dGVybmFsSGlnaGxpZ2h0VGFyZ2V0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmIChldmVudC5jb21wb3NlZFBhdGgoKS5pbmNsdWRlcyh0aGlzLl9zaGFkb3dIb3N0KSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBmb2N1c2VkRWxlbWVudCA9IHRoaXMuX2dldEZvY3VzZWRFbGVtZW50KCk7XG5cdFx0dGhpcy5fZm9jdXNlZFRhcmdldCA9IGZvY3VzZWRFbGVtZW50Py5tYXRjaGVzKCc6Zm9jdXMtdmlzaWJsZScpID8gZm9jdXNlZEVsZW1lbnQgOiB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fdXBkYXRlSGlnaGxpZ2h0KHRoaXMuX2ZvY3VzZWRUYXJnZXQpO1xuXHR9O1xuXG5cdHByaXZhdGUgX29uV2luZG93Qmx1ciA9ICgpOiB2b2lkID0+IHtcblx0XHRpZiAoIXRoaXMuX3NlbGVjdGlvbkFjdGl2ZSB8fCB0aGlzLl9jb21tZW50VGFyZ2V0IHx8IHRoaXMuX2V4dGVybmFsSGlnaGxpZ2h0VGFyZ2V0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2ZvY3VzZWRUYXJnZXQgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fdXBkYXRlSGlnaGxpZ2h0KHVuZGVmaW5lZCk7XG5cdH07XG5cblx0cHJpdmF0ZSBfb25LZXlEb3duID0gKGU6IEtleWJvYXJkRXZlbnQpOiB2b2lkID0+IHtcblx0XHRpZiAoIXRoaXMuX3NlbGVjdGlvbkFjdGl2ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoZS5rZXkgPT09ICdFc2NhcGUnKSB7XG5cdFx0XHRpZiAodGhpcy5fY29tbWVudFRhcmdldCkge1xuXHRcdFx0XHRjb25zdCB0YXJnZXQgPSB0aGlzLl9jb21tZW50VGFyZ2V0O1xuXHRcdFx0XHR0aGlzLl9mb2N1c0NvbW1lbnRUYXJnZXQodGFyZ2V0KTtcblx0XHRcdFx0dGhpcy5fZmluaXNoQ29tbWVudEludGVyYWN0aW9uKCk7XG5cdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5zdG9wKCk7XG5cdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdH0gZWxzZSBpZiAoZS5rZXkgPT09ICdFbnRlcicgJiYgIWUuaXNDb21wb3NpbmcpIHtcblx0XHRcdGlmICh0aGlzLl9wZW5kaW5nQ29tbWVudEludGVyYWN0aW9uSWQpIHtcblx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBmb2N1c2VkRWxlbWVudCA9IHRoaXMuX2dldEZvY3VzZWRFbGVtZW50KCk7XG5cdFx0XHRpZiAoZm9jdXNlZEVsZW1lbnQpIHtcblx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0XHR0aGlzLl9jb21taXQoZm9jdXNlZEVsZW1lbnQpO1xuXHRcdFx0fVxuXHRcdH1cblx0fTtcblxuXHRwcml2YXRlIF9vblNjcm9sbE9yUmVzaXplKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9jb21tZW50UHJldmlld0NvbGxhcHNpbmcpIHtcblx0XHRcdHRoaXMuX2hpZGVBY3RpdmVDb21tZW50UHJldmlldygpO1xuXHRcdH1cblx0XHR0aGlzLl9jYW5jZWxDb21tZW50QW5pbWF0aW9ucygpO1xuXHRcdGlmICh0aGlzLl9oaWdobGlnaHRUYXJnZXQpIHtcblx0XHRcdHRoaXMuX3JlbmRlckhpZ2hsaWdodCh0aGlzLl9oaWdobGlnaHRUYXJnZXQpO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fY29tbWVudEJhY2tkcm9wVGFyZ2V0KSB7XG5cdFx0XHR0aGlzLl9sYXlvdXRDb21tZW50QmFja2Ryb3AodGhpcy5fY29tbWVudEJhY2tkcm9wVGFyZ2V0KTtcblx0XHR9XG5cdFx0Zm9yIChjb25zdCBjb21tZW50IG9mIHRoaXMuX2NvbW1lbnRzLnZhbHVlcygpKSB7XG5cdFx0XHR0aGlzLl9sYXlvdXRDb21tZW50UGluKGNvbW1lbnQpO1xuXHRcdH1cblx0fVxuXG5cdC8vIC0tLSBQaWNraW5nIGhlbHBlcnMgLS0tXG5cblx0cHJpdmF0ZSBfZ2V0Rm9jdXNlZEVsZW1lbnQoKTogRWxlbWVudCB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCFkb2N1bWVudC5oYXNGb2N1cygpKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRsZXQgYWN0aXZlRWxlbWVudCA9IGRvY3VtZW50LmFjdGl2ZUVsZW1lbnQ7XG5cdFx0d2hpbGUgKGFjdGl2ZUVsZW1lbnQ/LnNoYWRvd1Jvb3Q/LmFjdGl2ZUVsZW1lbnQpIHtcblx0XHRcdGFjdGl2ZUVsZW1lbnQgPSBhY3RpdmVFbGVtZW50LnNoYWRvd1Jvb3QuYWN0aXZlRWxlbWVudDtcblx0XHR9XG5cdFx0aWYgKCFhY3RpdmVFbGVtZW50IHx8IGFjdGl2ZUVsZW1lbnQgPT09IGRvY3VtZW50LmJvZHkgfHwgYWN0aXZlRWxlbWVudCA9PT0gZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50IHx8IGFjdGl2ZUVsZW1lbnQgPT09IHRoaXMuX3NoYWRvd0hvc3QgfHwgYWN0aXZlRWxlbWVudCBpbnN0YW5jZW9mIEhUTUxJRnJhbWVFbGVtZW50KSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gYWN0aXZlRWxlbWVudDtcblx0fVxuXG5cdC8qKiBSZXR1cm4gdGhlIHBhZ2UgZWxlbWVudCB1bmRlciBhIHZpZXdwb3J0IHBvaW50LCBza2lwcGluZyBvdXIgb3duIG92ZXJsYXkgaG9zdC4gKi9cblx0cHJpdmF0ZSBfcGlja0VsZW1lbnRBdCh4OiBudW1iZXIsIHk6IG51bWJlcik6IEVsZW1lbnQgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGNhbmRpZGF0ZXMgPSBkb2N1bWVudC5lbGVtZW50c0Zyb21Qb2ludCh4LCB5KTtcblx0XHRmb3IgKGNvbnN0IGVsIG9mIGNhbmRpZGF0ZXMpIHtcblx0XHRcdGlmIChlbCA9PT0gdGhpcy5fc2hhZG93SG9zdCB8fCB0aGlzLl9zaGFkb3dIb3N0LmNvbnRhaW5zKGVsKSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBlbDtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXNvbHZlIHRoZSBlbGVtZW50IHRoYXQgXCJjb3ZlcnNcIiBhIGRyYWcgcmVjdGFuZ2xlLlxuXHQgKlxuXHQgKiBTYW1wbGVzIGBlbGVtZW50RnJvbVBvaW50YCBhdCB0aGUgNCBjb3JuZXJzLCA0IGVkZ2UgbWlkcG9pbnRzLCBhbmRcblx0ICogY2VudGVyLCB0aGVuIHJldHVybnMgdGhlaXIgZGVlcGVzdCBjb21tb24gYW5jZXN0b3IuXG5cdCAqL1xuXHRwcml2YXRlIF9waWNrUmVnaW9uQW5jZXN0b3IocmVjdDogSUJyb3dzZXJWaWV3UmVjdCk6IEVsZW1lbnQgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHsgeCwgeSwgd2lkdGgsIGhlaWdodCB9ID0gcmVjdDtcblx0XHRjb25zdCB4MiA9IHggKyB3aWR0aDtcblx0XHRjb25zdCB5MiA9IHkgKyBoZWlnaHQ7XG5cdFx0Y29uc3QgY3ggPSB4ICsgd2lkdGggLyAyO1xuXHRcdGNvbnN0IGN5ID0geSArIGhlaWdodCAvIDI7XG5cdFx0Y29uc3Qgc2FtcGxlczogRWxlbWVudFtdID0gW107XG5cdFx0Zm9yIChjb25zdCBbc3gsIHN5XSBvZiBbXG5cdFx0XHRbeCwgeV0sIFt4MiwgeV0sIFt4LCB5Ml0sIFt4MiwgeTJdLCAgICAgICAvLyBjb3JuZXJzXG5cdFx0XHRbY3gsIHldLCBbY3gsIHkyXSwgW3gsIGN5XSwgW3gyLCBjeV0sICAgICAgLy8gZWRnZSBtaWRwb2ludHNcblx0XHRcdFtjeCwgY3ldICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIGNlbnRlclxuXHRcdF0pIHtcblx0XHRcdGNvbnN0IGVsID0gdGhpcy5fcGlja0VsZW1lbnRBdChzeCwgc3kpO1xuXHRcdFx0aWYgKGVsKSB7XG5cdFx0XHRcdHNhbXBsZXMucHVzaChlbCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBmaW5kQ29tbW9uVmlzaWJsZUFuY2VzdG9yKHNhbXBsZXMpO1xuXHR9XG5cblx0Ly8gLS0tIEhpZ2hsaWdodCAtLS1cblxuXHRwcml2YXRlIF9yZW5kZXJIaWdobGlnaHQodGFyZ2V0OiBFbGVtZW50KTogdm9pZCB7XG5cdFx0Y29uc3QgaGlnaGxpZ2h0ID0gdGhpcy5faGlnaGxpZ2h0O1xuXHRcdGNvbnN0IGxhYmVsID0gdGhpcy5fbGFiZWw7XG5cblx0XHRjb25zdCByZWN0ID0gdGFyZ2V0LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuXHRcdGNvbnN0IHNjcm9sbFggPSB3aW5kb3cuc2Nyb2xsWCB8fCAwO1xuXHRcdGNvbnN0IHNjcm9sbFkgPSB3aW5kb3cuc2Nyb2xsWSB8fCAwO1xuXHRcdGNvbnN0IHZpZXdwb3J0SGVpZ2h0ID0gd2luZG93LmlubmVySGVpZ2h0O1xuXHRcdGNvbnN0IHZpZXdwb3J0V2lkdGggPSBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQuY2xpZW50V2lkdGg7XG5cdFx0Y29uc3QgdmlzaWJsZVJlY3QgPSB0aGlzLl9nZXRWaXNpYmxlVGFyZ2V0Qm91bmRzKHJlY3QpO1xuXHRcdGNvbnN0IGxhYmVsSGVpZ2h0ID0gMjI7IC8vIGxhYmVsIGhlaWdodCAoMjApICsgMnB4IGdhcCBhYm92ZSB0aGUgYm94LlxuXG5cdFx0Ly8gSGlnaGxpZ2h0IGJveCBpcyBpbiAqcGFnZSogY29vcmRpbmF0ZXMgc28gaXQgc2Nyb2xscyB3aXRoIHRoZSBkb2N1bWVudC5cblx0XHRoaWdobGlnaHQuc3R5bGUuZGlzcGxheSA9ICdibG9jayc7XG5cdFx0aGlnaGxpZ2h0LnN0eWxlLmxlZnQgPSBgJHtyZWN0LmxlZnQgKyBzY3JvbGxYfXB4YDtcblx0XHRoaWdobGlnaHQuc3R5bGUudG9wID0gYCR7cmVjdC50b3AgKyBzY3JvbGxZfXB4YDtcblx0XHRoaWdobGlnaHQuc3R5bGUud2lkdGggPSBgJHtyZWN0LndpZHRofXB4YDtcblx0XHRoaWdobGlnaHQuc3R5bGUuaGVpZ2h0ID0gYCR7cmVjdC5oZWlnaHR9cHhgO1xuXHRcdHRoaXMuX2hpZ2hsaWdodFNoYXBlLnN0eWxlLmRpc3BsYXkgPSAnYmxvY2snO1xuXHRcdHRoaXMuX2hpZ2hsaWdodFNoYXBlLnNldEF0dHJpYnV0ZSgneCcsIGAke3Zpc2libGVSZWN0Lnh9YCk7XG5cdFx0dGhpcy5faGlnaGxpZ2h0U2hhcGUuc2V0QXR0cmlidXRlKCd5JywgYCR7dmlzaWJsZVJlY3QueX1gKTtcblx0XHR0aGlzLl9oaWdobGlnaHRTaGFwZS5zZXRBdHRyaWJ1dGUoJ3dpZHRoJywgYCR7dmlzaWJsZVJlY3Qud2lkdGh9YCk7XG5cdFx0dGhpcy5faGlnaGxpZ2h0U2hhcGUuc2V0QXR0cmlidXRlKCdoZWlnaHQnLCBgJHt2aXNpYmxlUmVjdC5oZWlnaHR9YCk7XG5cdFx0dGhpcy5faGlnaGxpZ2h0U2hhcGUuc2V0QXR0cmlidXRlKCdyeCcsICcyJyk7XG5cdFx0Ly8gTGFiZWwgaXMgaW4gKnZpZXdwb3J0KiBjb29yZGluYXRlcyBhbmQgc3RpY2t5LWNsYW1wZWQgdG8gdGhlIHZpZXdwb3J0LlxuXHRcdGNvbnN0IHRhZ05hbWUgPSBTdHJpbmcodGFyZ2V0LnRhZ05hbWUgfHwgJycpLnRvTG93ZXJDYXNlKCk7XG5cdFx0Y29uc3QgaWRQYXJ0ID0gdGFyZ2V0LmlkID8gYCMke3RhcmdldC5pZH1gIDogJyc7XG5cdFx0Y29uc3QgY2xhc3NQYXJ0ID0gdGFyZ2V0LmNsYXNzTGlzdC5sZW5ndGhcblx0XHRcdD8gJy4nICsgWy4uLnRhcmdldC5jbGFzc0xpc3RdLmpvaW4oJy4nKVxuXHRcdFx0OiAnJztcblx0XHR0aGlzLl9sYWJlbFNlbGVjdG9yLnRleHRDb250ZW50ID0gdGFnTmFtZSArIGlkUGFydDtcblx0XHR0aGlzLl9sYWJlbENsYXNzZXMudGV4dENvbnRlbnQgPSBjbGFzc1BhcnQ7XG5cdFx0dGhpcy5fbGFiZWxEaW1zLnRleHRDb250ZW50ID0gYCR7TWF0aC5yb3VuZChyZWN0LndpZHRoKX0gXFx1MDBkNyAke01hdGgucm91bmQocmVjdC5oZWlnaHQpfWA7XG5cdFx0bGFiZWwuc3R5bGUuZGlzcGxheSA9ICdpbmxpbmUtZmxleCc7XG5cdFx0Y29uc3QgaWRlYWxUb3AgPSByZWN0LnRvcCAtIGxhYmVsSGVpZ2h0O1xuXHRcdGNvbnN0IGxhYmVsVG9wID0gTWF0aC5tYXgoMCwgTWF0aC5taW4odmlld3BvcnRIZWlnaHQgLSBsYWJlbEhlaWdodCwgaWRlYWxUb3ApKTtcblx0XHQvLyBVc2UgY2xpZW50V2lkdGggKGV4Y2x1ZGVzIHNjcm9sbGJhcikgcmF0aGVyIHRoYW4gaW5uZXJXaWR0aCBzbyB0aGVcblx0XHQvLyBsYWJlbCBkb2Vzbid0IGV4dGVuZCBiZWhpbmQgdGhlIHNjcm9sbGJhciBvbiBXaW5kb3dzL0xpbnV4LlxuXHRcdC8vIFBvc2l0aW9uIGxhYmVsIGF0IHRoZSBlbGVtZW50J3MgbGVmdCBlZGdlLCBidXQgcHVzaCBpdCBsZWZ0IGlmIGl0XG5cdFx0Ly8gd291bGQgb3ZlcmZsb3cgdGhlIHZpZXdwb3J0LiBDbGFtcCB0byAwIHNvIGl0IG5ldmVyIGdvZXMgb2ZmLXNjcmVlbi5cblx0XHRsYWJlbC5zdHlsZS5sZWZ0ID0gJzAnO1xuXHRcdGNvbnN0IG5hdHVyYWxXaWR0aCA9IGxhYmVsLm9mZnNldFdpZHRoO1xuXHRcdGNvbnN0IGlkZWFsTGVmdCA9IHJlY3QubGVmdDtcblx0XHRjb25zdCBsYWJlbExlZnQgPSBNYXRoLm1heCgwLCBNYXRoLm1pbihpZGVhbExlZnQsIHZpZXdwb3J0V2lkdGggLSBuYXR1cmFsV2lkdGgpKTtcblx0XHRsYWJlbC5zdHlsZS5sZWZ0ID0gYCR7bGFiZWxMZWZ0fXB4YDtcblx0XHRsYWJlbC5zdHlsZS50b3AgPSBgJHtsYWJlbFRvcH1weGA7XG5cblx0XHRpZiAodGhpcy5fY29tbWVudFByZXZpZXcuc3R5bGUuZGlzcGxheSAhPT0gJ25vbmUnKSB7XG5cdFx0XHRjb25zdCBwcmV2aWV3UGxhY2VtZW50ID0gdGhpcy5fbGF5b3V0Q29tbWVudFN1cmZhY2UodGhpcy5fY29tbWVudFByZXZpZXcsIHZpc2libGVSZWN0LCB2aWV3cG9ydFdpZHRoLCB2aWV3cG9ydEhlaWdodCk7XG5cdFx0XHRpZiAodGhpcy5fY29tbWVudFByZXZpZXdFbGVtZW50SWQgJiYgcHJldmlld1BsYWNlbWVudCA9PT0gJ2Fib3ZlJyAmJiB0aGlzLl9lbGVtZW50c092ZXJsYXAobGFiZWwsIHRoaXMuX2NvbW1lbnRQcmV2aWV3KSkge1xuXHRcdFx0XHRsYWJlbC5zdHlsZS50b3AgPSBgJHtNYXRoLm1heCgwLCBNYXRoLm1pbih2aWV3cG9ydEhlaWdodCAtIGxhYmVsSGVpZ2h0LCB2aXNpYmxlUmVjdC5ib3R0b20gKyAyKSl9cHhgO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAodGhpcy5fY29tbWVudENvbXBvc2VyLnN0eWxlLmRpc3BsYXkgIT09ICdub25lJykge1xuXHRcdFx0dGhpcy5fbGF5b3V0Q29tbWVudFN1cmZhY2UodGhpcy5fY29tbWVudENvbXBvc2VyLCB2aXNpYmxlUmVjdCwgdmlld3BvcnRXaWR0aCwgdmlld3BvcnRIZWlnaHQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2VsZW1lbnRzT3ZlcmxhcChmaXJzdDogSFRNTEVsZW1lbnQsIHNlY29uZDogSFRNTEVsZW1lbnQpOiBib29sZWFuIHtcblx0XHRjb25zdCBmaXJzdEJvdW5kcyA9IGZpcnN0LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuXHRcdGNvbnN0IHNlY29uZEJvdW5kcyA9IHNlY29uZC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcblx0XHRyZXR1cm4gZmlyc3RCb3VuZHMubGVmdCA8IHNlY29uZEJvdW5kcy5yaWdodFxuXHRcdFx0JiYgZmlyc3RCb3VuZHMucmlnaHQgPiBzZWNvbmRCb3VuZHMubGVmdFxuXHRcdFx0JiYgZmlyc3RCb3VuZHMudG9wIDwgc2Vjb25kQm91bmRzLmJvdHRvbVxuXHRcdFx0JiYgZmlyc3RCb3VuZHMuYm90dG9tID4gc2Vjb25kQm91bmRzLnRvcDtcblx0fVxuXG5cdHByaXZhdGUgX2dldFZpc2libGVUYXJnZXRCb3VuZHMocmVjdDogRE9NUmVjdCk6IERPTVJlY3Qge1xuXHRcdGNvbnN0IGxlZnQgPSBNYXRoLm1heCgwLCBNYXRoLm1pbihyZWN0LmxlZnQsIHdpbmRvdy5pbm5lcldpZHRoKSk7XG5cdFx0Y29uc3QgcmlnaHQgPSBNYXRoLm1heChsZWZ0LCBNYXRoLm1pbihyZWN0LnJpZ2h0LCB3aW5kb3cuaW5uZXJXaWR0aCkpO1xuXHRcdGNvbnN0IHRvcCA9IE1hdGgubWF4KDAsIE1hdGgubWluKHJlY3QudG9wLCB3aW5kb3cuaW5uZXJIZWlnaHQpKTtcblx0XHRjb25zdCBib3R0b20gPSBNYXRoLm1heCh0b3AsIE1hdGgubWluKHJlY3QuYm90dG9tLCB3aW5kb3cuaW5uZXJIZWlnaHQpKTtcblx0XHRyZXR1cm4gbmV3IERPTVJlY3QobGVmdCwgdG9wLCByaWdodCAtIGxlZnQsIGJvdHRvbSAtIHRvcCk7XG5cdH1cblxuXHRwcml2YXRlIF9sYXlvdXRDb21tZW50U3VyZmFjZShzdXJmYWNlOiBIVE1MRWxlbWVudCwgdGFyZ2V0Qm91bmRzOiBET01SZWN0LCB2aWV3cG9ydFdpZHRoOiBudW1iZXIsIHZpZXdwb3J0SGVpZ2h0OiBudW1iZXIpOiAnYWJvdmUnIHwgJ2JlbG93JyB7XG5cdFx0aWYgKHN1cmZhY2UgPT09IHRoaXMuX2NvbW1lbnRQcmV2aWV3KSB7XG5cdFx0XHRzdXJmYWNlLnN0eWxlLndpZHRoID0gJ21heC1jb250ZW50Jztcblx0XHRcdHN1cmZhY2Uuc3R5bGUubWluV2lkdGggPSAnMCc7XG5cdFx0XHRzdXJmYWNlLnN0eWxlLm1heFdpZHRoID0gYCR7TWF0aC5taW4oMzIwLCB2aWV3cG9ydFdpZHRoIC0gMTYpfXB4YDtcblx0XHRcdGNvbnN0IGNvbW1lbnQgPSB0aGlzLl9jb21tZW50UHJldmlld0VsZW1lbnRJZCA/IHRoaXMuX2NvbW1lbnRzLmdldCh0aGlzLl9jb21tZW50UHJldmlld0VsZW1lbnRJZCkgOiB1bmRlZmluZWQ7XG5cdFx0XHRpZiAoY29tbWVudCkge1xuXHRcdFx0XHRjb25zdCBwaW5Cb3VuZHMgPSBjb21tZW50LnBpbi5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcblx0XHRcdFx0cmV0dXJuIHRoaXMuX2xheW91dENvbW1lbnRTdXJmYWNlQXRBbmNob3IoXG5cdFx0XHRcdFx0c3VyZmFjZSxcblx0XHRcdFx0XHR7IHg6IHBpbkJvdW5kcy5sZWZ0ICsgcGluQm91bmRzLndpZHRoIC8gMiwgeTogcGluQm91bmRzLnRvcCArIHBpbkJvdW5kcy5oZWlnaHQgLyAyIH0sXG5cdFx0XHRcdFx0dmlld3BvcnRXaWR0aCxcblx0XHRcdFx0XHR2aWV3cG9ydEhlaWdodFxuXHRcdFx0XHQpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAoc3VyZmFjZSA9PT0gdGhpcy5fY29tbWVudENvbXBvc2VyICYmIHRoaXMuX2NvbW1lbnRBbmNob3IpIHtcblx0XHRcdHN1cmZhY2Uuc3R5bGUubWF4V2lkdGggPSBgJHtNYXRoLm1pbigzMjAsIHZpZXdwb3J0V2lkdGggLSAxNil9cHhgO1xuXHRcdFx0cmV0dXJuIHRoaXMuX2xheW91dENvbW1lbnRTdXJmYWNlQXRBbmNob3IoXG5cdFx0XHRcdHN1cmZhY2UsXG5cdFx0XHRcdHsgeDogdGhpcy5fY29tbWVudEFuY2hvci54IC0gd2luZG93LnNjcm9sbFgsIHk6IHRoaXMuX2NvbW1lbnRBbmNob3IueSAtIHdpbmRvdy5zY3JvbGxZIH0sXG5cdFx0XHRcdHZpZXdwb3J0V2lkdGgsXG5cdFx0XHRcdHZpZXdwb3J0SGVpZ2h0XG5cdFx0XHQpO1xuXHRcdH1cblx0XHRjb25zdCBzdXJmYWNlSGVpZ2h0ID0gc3VyZmFjZS5vZmZzZXRIZWlnaHQ7XG5cdFx0Y29uc3QgYmVsb3dUb3AgPSB0YXJnZXRCb3VuZHMuYm90dG9tO1xuXHRcdGNvbnN0IHBsYWNlbWVudCA9IGJlbG93VG9wICsgc3VyZmFjZUhlaWdodCA8PSB2aWV3cG9ydEhlaWdodCAtIDggPyAnYmVsb3cnIDogJ2Fib3ZlJztcblx0XHRjb25zdCBzdXJmYWNlVG9wID0gYmVsb3dUb3AgKyBzdXJmYWNlSGVpZ2h0IDw9IHZpZXdwb3J0SGVpZ2h0IC0gOFxuXHRcdFx0PyBiZWxvd1RvcFxuXHRcdFx0OiBNYXRoLm1heCgwLCB0YXJnZXRCb3VuZHMudG9wIC0gc3VyZmFjZUhlaWdodCk7XG5cdFx0Y29uc3Qgc3VyZmFjZVdpZHRoID0gc3VyZmFjZS5vZmZzZXRXaWR0aDtcblx0XHRjb25zdCBhbGlnbkxlZnQgPSB0YXJnZXRCb3VuZHMubGVmdCArIHN1cmZhY2VXaWR0aCA8PSB2aWV3cG9ydFdpZHRoO1xuXHRcdGNvbnN0IGFsaWdubWVudCA9IGFsaWduTGVmdCA/ICdsZWZ0JyA6ICdyaWdodCc7XG5cdFx0Y29uc3Qgc3VyZmFjZUxlZnQgPSBhbGlnbkxlZnRcblx0XHRcdD8gTWF0aC5tYXgoMCwgdGFyZ2V0Qm91bmRzLmxlZnQpXG5cdFx0XHQ6IE1hdGgubWF4KDAsIHRhcmdldEJvdW5kcy5yaWdodCAtIHN1cmZhY2VXaWR0aCk7XG5cdFx0c3VyZmFjZS5kYXRhc2V0LmF0dGFjaG1lbnRDb3JuZXIgPSBgJHtwbGFjZW1lbnQgPT09ICdiZWxvdycgPyAndG9wJyA6ICdib3R0b20nfS0ke2FsaWdubWVudH1gO1xuXHRcdHRoaXMuX3NldENvbW1lbnRTdXJmYWNlUG9zaXRpb24oc3VyZmFjZSwgc3VyZmFjZUxlZnQsIHN1cmZhY2VUb3ApO1xuXHRcdHJldHVybiBwbGFjZW1lbnQ7XG5cdH1cblxuXHRwcml2YXRlIF9sYXlvdXRDb21tZW50U3VyZmFjZUF0QW5jaG9yKHN1cmZhY2U6IEhUTUxFbGVtZW50LCBhbmNob3I6IHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfSwgdmlld3BvcnRXaWR0aDogbnVtYmVyLCB2aWV3cG9ydEhlaWdodDogbnVtYmVyKTogJ2Fib3ZlJyB8ICdiZWxvdycge1xuXHRcdGNvbnN0IHZpZXdwb3J0SW5zZXQgPSA4O1xuXHRcdGxldCBzdXJmYWNlV2lkdGggPSBzdXJmYWNlLm9mZnNldFdpZHRoO1xuXHRcdGNvbnN0IGF2YWlsYWJsZVJpZ2h0ID0gTWF0aC5tYXgoMCwgdmlld3BvcnRXaWR0aCAtIHZpZXdwb3J0SW5zZXQgLSBhbmNob3IueCk7XG5cdFx0Y29uc3QgYXZhaWxhYmxlTGVmdCA9IE1hdGgubWF4KDAsIGFuY2hvci54IC0gdmlld3BvcnRJbnNldCk7XG5cdFx0Y29uc3Qgb3BlbnNSaWdodCA9IHN1cmZhY2VXaWR0aCA8PSBhdmFpbGFibGVSaWdodCB8fCAoc3VyZmFjZVdpZHRoID4gYXZhaWxhYmxlTGVmdCAmJiBhdmFpbGFibGVSaWdodCA+PSBhdmFpbGFibGVMZWZ0KTtcblx0XHRjb25zdCBhdmFpbGFibGVXaWR0aCA9IG9wZW5zUmlnaHQgPyBhdmFpbGFibGVSaWdodCA6IGF2YWlsYWJsZUxlZnQ7XG5cdFx0aWYgKHN1cmZhY2VXaWR0aCA+IGF2YWlsYWJsZVdpZHRoKSB7XG5cdFx0XHRzdXJmYWNlLnN0eWxlLm1heFdpZHRoID0gYCR7YXZhaWxhYmxlV2lkdGh9cHhgO1xuXHRcdFx0c3VyZmFjZVdpZHRoID0gc3VyZmFjZS5vZmZzZXRXaWR0aDtcblx0XHR9XG5cblx0XHRjb25zdCBzdXJmYWNlSGVpZ2h0ID0gc3VyZmFjZS5vZmZzZXRIZWlnaHQ7XG5cdFx0Y29uc3QgYXZhaWxhYmxlQmVsb3cgPSBNYXRoLm1heCgwLCB2aWV3cG9ydEhlaWdodCAtIHZpZXdwb3J0SW5zZXQgLSBhbmNob3IueSk7XG5cdFx0Y29uc3QgYXZhaWxhYmxlQWJvdmUgPSBNYXRoLm1heCgwLCBhbmNob3IueSAtIHZpZXdwb3J0SW5zZXQpO1xuXHRcdGNvbnN0IG9wZW5zQWJvdmUgPSBzdXJmYWNlSGVpZ2h0IDw9IGF2YWlsYWJsZUFib3ZlIHx8IChzdXJmYWNlSGVpZ2h0ID4gYXZhaWxhYmxlQmVsb3cgJiYgYXZhaWxhYmxlQWJvdmUgPj0gYXZhaWxhYmxlQmVsb3cpO1xuXHRcdGNvbnN0IG9wZW5zQmVsb3cgPSAhb3BlbnNBYm92ZTtcblx0XHRjb25zdCBwbGFjZW1lbnQgPSBvcGVuc0JlbG93ID8gJ2JlbG93JyA6ICdhYm92ZSc7XG5cdFx0Y29uc3QgYWxpZ25tZW50ID0gb3BlbnNSaWdodCA/ICdsZWZ0JyA6ICdyaWdodCc7XG5cdFx0c3VyZmFjZS5kYXRhc2V0LmF0dGFjaG1lbnRDb3JuZXIgPSBgJHtvcGVuc0JlbG93ID8gJ3RvcCcgOiAnYm90dG9tJ30tJHthbGlnbm1lbnR9YDtcblx0XHRjb25zdCBzdXJmYWNlTGVmdCA9IG9wZW5zUmlnaHQgPyBhbmNob3IueCA6IGFuY2hvci54IC0gc3VyZmFjZVdpZHRoO1xuXHRcdGNvbnN0IHN1cmZhY2VUb3AgPSBvcGVuc0JlbG93ID8gYW5jaG9yLnkgOiBNYXRoLm1heCh2aWV3cG9ydEluc2V0LCBhbmNob3IueSAtIHN1cmZhY2VIZWlnaHQpO1xuXHRcdHRoaXMuX3NldENvbW1lbnRTdXJmYWNlUG9zaXRpb24oc3VyZmFjZSwgc3VyZmFjZUxlZnQsIHN1cmZhY2VUb3ApO1xuXHRcdHJldHVybiBwbGFjZW1lbnQ7XG5cdH1cblxuXHRwcml2YXRlIF9zZXRDb21tZW50U3VyZmFjZVBvc2l0aW9uKHN1cmZhY2U6IEhUTUxFbGVtZW50LCBsZWZ0OiBudW1iZXIsIHRvcDogbnVtYmVyKTogdm9pZCB7XG5cdFx0aWYgKHN1cmZhY2UgIT09IHRoaXMuX2NvbW1lbnRQcmV2aWV3KSB7XG5cdFx0XHRzdXJmYWNlLnN0eWxlLmxlZnQgPSBgJHtsZWZ0fXB4YDtcblx0XHRcdHN1cmZhY2Uuc3R5bGUudG9wID0gYCR7dG9wfXB4YDtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBwYWRkaW5nID0gRWxlbWVudFBpY2tlci5fQ09NTUVOVF9QUkVWSUVXX0hJVF9QQURESU5HO1xuXHRcdHRoaXMuX2NvbW1lbnRQcmV2aWV3SGl0QXJlYS5zdHlsZS5sZWZ0ID0gYCR7bGVmdCAtIHBhZGRpbmd9cHhgO1xuXHRcdHRoaXMuX2NvbW1lbnRQcmV2aWV3SGl0QXJlYS5zdHlsZS50b3AgPSBgJHt0b3AgLSBwYWRkaW5nfXB4YDtcblx0XHR0aGlzLl9jb21tZW50UHJldmlld0hpdEFyZWEuc3R5bGUud2lkdGggPSBgJHtzdXJmYWNlLm9mZnNldFdpZHRoICsgcGFkZGluZyAqIDJ9cHhgO1xuXHRcdHRoaXMuX2NvbW1lbnRQcmV2aWV3SGl0QXJlYS5zdHlsZS5oZWlnaHQgPSBgJHtzdXJmYWNlLm9mZnNldEhlaWdodCArIHBhZGRpbmcgKiAyfXB4YDtcblx0XHRzdXJmYWNlLnN0eWxlLmxlZnQgPSBgJHtwYWRkaW5nfXB4YDtcblx0XHRzdXJmYWNlLnN0eWxlLnRvcCA9IGAke3BhZGRpbmd9cHhgO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlSGlnaGxpZ2h0KHRhcmdldDogRWxlbWVudCB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdHRoaXMuX2hpZ2hsaWdodFRhcmdldCA9IHRhcmdldDtcblx0XHRpZiAoIXRhcmdldCkge1xuXHRcdFx0dGhpcy5faGlnaGxpZ2h0LnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0XHR0aGlzLl9oaWdobGlnaHRTaGFwZS5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdFx0dGhpcy5fbGFiZWwuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fcmVuZGVySGlnaGxpZ2h0KHRhcmdldCk7XG5cdH1cblxuXHQvLyAtLS0gQ29tbWl0IC0tLVxuXG5cdHByaXZhdGUgX2NvbW1pdCh0YXJnZXQ6IEVsZW1lbnQsIGFuY2hvcj86IHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfSk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fc2VsZWN0aW9uQWN0aXZlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9jb21tZW50TW9kZSkge1xuXHRcdFx0dGhpcy5fc2hvd0NvbW1lbnRDb21wb3Nlcih0YXJnZXQsIGFuY2hvciA/PyB0aGlzLl9nZXREZWZhdWx0Q29tbWVudEFuY2hvcih0YXJnZXQpLCBhbmNob3IgIT09IHVuZGVmaW5lZCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdC8vIFdhaXQgYSBmcmFtZSBzbyBhbnkgcGVuZGluZyBldmVudCBoYW5kbGVycyBjYW4gYmUgY29tcGxldGVkIGluIHRoZSBzZWxlY3RpbmcgYWN0aXZlIHN0YXRlLlxuXHRcdHJlcXVlc3RBbmltYXRpb25GcmFtZSgoKSA9PiB7XG5cdFx0XHRpZiAoIXRoaXMuX2NvbnRpbnVvdXMpIHtcblx0XHRcdFx0Ly8gVGVhciBkb3duIHRoZSBvdmVybGF5IGJlZm9yZSBub3RpZnlpbmcgdGhlIGhvc3Qgc28gYW55XG5cdFx0XHRcdC8vIHNjcmVlbnNob3QgY2FwdHVyZSBkb2Vzbid0IGluY2x1ZGUgb3VyIGNocm9tZS5cblx0XHRcdFx0dGhpcy5zdG9wKCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl91cGRhdGVIaWdobGlnaHQodW5kZWZpbmVkKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX29uUGlja2VkKHRhcmdldCk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIF9nZXREZWZhdWx0Q29tbWVudEFuY2hvcih0YXJnZXQ6IEVsZW1lbnQpOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH0ge1xuXHRcdGNvbnN0IGJvdW5kcyA9IHRhcmdldC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcblx0XHRyZXR1cm4geyB4OiBib3VuZHMubGVmdCwgeTogYm91bmRzLmJvdHRvbSB9O1xuXHR9XG5cblx0cHJpdmF0ZSBfc2hvd0NvbW1lbnRDb21wb3Nlcih0YXJnZXQ6IEVsZW1lbnQsIGFuY2hvcjogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9LCBwb2ludGVySW50ZXJhY3Rpb24gPSBmYWxzZSk6IHZvaWQge1xuXHRcdHRoaXMuX2V4dGVybmFsSGlnaGxpZ2h0VGFyZ2V0ID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX2hpZGVBY3RpdmVDb21tZW50UHJldmlldygpO1xuXHRcdHRoaXMuX2NvbW1lbnRUYXJnZXQgPSB0YXJnZXQ7XG5cdFx0dGhpcy5fY29tbWVudFBvaW50ZXJJbnRlcmFjdGlvbiA9IHBvaW50ZXJJbnRlcmFjdGlvbjtcblx0XHR0aGlzLl9jb21tZW50QW5jaG9yID0ge1xuXHRcdFx0eDogYW5jaG9yLnggKyB3aW5kb3cuc2Nyb2xsWCxcblx0XHRcdHk6IGFuY2hvci55ICsgd2luZG93LnNjcm9sbFlcblx0XHR9O1xuXHRcdHRoaXMuX3Nob3dDb21tZW50QmFja2Ryb3AodGFyZ2V0KTtcblx0XHR0aGlzLl9jb21tZW50TGF5ZXIuY2xhc3NMaXN0LmFkZCgnY29tcG9zaW5nJyk7XG5cdFx0dGhpcy5fY29tbWVudElucHV0LnZhbHVlID0gJyc7XG5cdFx0dGhpcy5fY29tbWVudENvbXBvc2VyLnN0eWxlLmRpc3BsYXkgPSAnZmxleCc7XG5cdFx0dGhpcy5fcmVzaXplQ29tbWVudElucHV0KCk7XG5cdFx0dGhpcy5fdXBkYXRlSGlnaGxpZ2h0KHRhcmdldCk7XG5cdFx0dGhpcy5fYW5pbWF0ZUNvbW1lbnRDb21wb3NlcigpO1xuXHRcdHRoaXMuX2NvbW1lbnRJbnB1dC5mb2N1cyh7IHByZXZlbnRTY3JvbGw6IHRydWUgfSk7XG5cdFx0cmVxdWVzdEFuaW1hdGlvbkZyYW1lKCgpID0+IHtcblx0XHRcdGlmICh0aGlzLl9jb21tZW50VGFyZ2V0ID09PSB0YXJnZXQpIHtcblx0XHRcdFx0dGhpcy5fY29tbWVudElucHV0LmZvY3VzKHsgcHJldmVudFNjcm9sbDogdHJ1ZSB9KTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX2FuaW1hdGVDb21tZW50Q29tcG9zZXIoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3JlZHVjZWRNb3Rpb24pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fY2FuY2VsQ29tbWVudEFuaW1hdGlvbnMoKTtcblx0XHR0aGlzLl9jb21tZW50QW5pbWF0aW9uID0ge1xuXHRcdFx0c3VyZmFjZTogdGhpcy5fYW5pbWF0ZUNvbW1lbnRTdXJmYWNlKHRoaXMuX2NvbW1lbnRDb21wb3NlciksXG5cdFx0XHRzdXBwb3J0aW5nOiBbXVxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIF9zZXRDb21tZW50U3VyZmFjZVRyYW5zZm9ybU9yaWdpbihzdXJmYWNlOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdGNvbnN0IFt2ZXJ0aWNhbE9yaWdpbiwgaG9yaXpvbnRhbE9yaWdpbl0gPSAoc3VyZmFjZS5kYXRhc2V0LmF0dGFjaG1lbnRDb3JuZXIgPz8gJ3RvcC1sZWZ0Jykuc3BsaXQoJy0nKTtcblx0XHRzdXJmYWNlLnN0eWxlLnRyYW5zZm9ybU9yaWdpbiA9IGAke2hvcml6b250YWxPcmlnaW59ICR7dmVydGljYWxPcmlnaW59YDtcblx0fVxuXG5cdHByaXZhdGUgX2Nsb3NlQ29tbWVudENvbXBvc2VyKCk6IHZvaWQge1xuXHRcdHRoaXMuX2NvbW1lbnRUYXJnZXQgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fY29tbWVudEFuY2hvciA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9oaWRlQ29tbWVudEJhY2tkcm9wKCk7XG5cdFx0dGhpcy5fY29tbWVudExheWVyLmNsYXNzTGlzdC5yZW1vdmUoJ2NvbXBvc2luZycpO1xuXHRcdHRoaXMuX2NvbW1lbnRDb21wb3Nlci5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdHRoaXMuX2NvbW1lbnRJbnB1dC52YWx1ZSA9ICcnO1xuXHRcdHRoaXMuX2NhbmNlbENvbW1lbnRBbmltYXRpb25zKCk7XG5cdFx0dGhpcy5fdXBkYXRlSGlnaGxpZ2h0KHVuZGVmaW5lZCk7XG5cdH1cblxuXHRwcml2YXRlIF9maW5pc2hDb21tZW50SW50ZXJhY3Rpb24oKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2NvbnRpbnVvdXMpIHtcblx0XHRcdHRoaXMuX2Nsb3NlQ29tbWVudENvbXBvc2VyKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuc3RvcCgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3N1Ym1pdENvbW1lbnQoKTogdm9pZCB7XG5cdFx0Y29uc3QgdGFyZ2V0ID0gdGhpcy5fY29tbWVudFRhcmdldDtcblx0XHRjb25zdCBhbmNob3IgPSB0aGlzLl9jb21tZW50QW5jaG9yO1xuXHRcdGlmICghdGFyZ2V0IHx8ICFhbmNob3IpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgYm9keSA9IHRoaXMuX2NvbW1lbnRJbnB1dC52YWx1ZS5yZXBsYWNlKC9cXHI/XFxuL2csICcgJyk7XG5cdFx0Y29uc3QgcGVuZGluZ0NvbW1lbnQgPSB7XG5cdFx0XHR0YXJnZXQsXG5cdFx0XHRhbmNob3IsXG5cdFx0XHRib2R5LFxuXHRcdFx0cG9pbnRlckludGVyYWN0aW9uOiB0aGlzLl9jb21tZW50UG9pbnRlckludGVyYWN0aW9uXG5cdFx0fTtcblx0XHR0aGlzLl9jb21tZW50TGF5ZXIuY2xhc3NMaXN0LmFkZCgnY29tbWVudC1jYXB0dXJlLXBlbmRpbmcnKTtcblx0XHR0aGlzLl9maW5pc2hDb21tZW50SW50ZXJhY3Rpb24oKTtcblx0XHRjb25zdCBlbGVtZW50SWQgPSB0aGlzLl9vblBpY2tlZCh0YXJnZXQsIGJvZHkpO1xuXHRcdHRoaXMuX3BlbmRpbmdDb21tZW50cy5zZXQoZWxlbWVudElkLCBwZW5kaW5nQ29tbWVudCk7XG5cdFx0dGhpcy5fcGVuZGluZ0NvbW1lbnRJbnRlcmFjdGlvbklkID0gZWxlbWVudElkO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVzdG9yZUludGVyYWN0aW9uQWZ0ZXJDb21tZW50KGVsZW1lbnRJZDogc3RyaW5nLCBwZW5kaW5nOiBQZW5kaW5nRWxlbWVudENvbW1lbnQpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fcGVuZGluZ0NvbW1lbnRJbnRlcmFjdGlvbklkID09PSBlbGVtZW50SWQpIHtcblx0XHRcdHRoaXMuX3BlbmRpbmdDb21tZW50SW50ZXJhY3Rpb25JZCA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMuX2NvbW1lbnRMYXllci5jbGFzc0xpc3QucmVtb3ZlKCdjb21tZW50LWNhcHR1cmUtcGVuZGluZycpO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fY29tbWVudFRhcmdldCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoIXBlbmRpbmcucG9pbnRlckludGVyYWN0aW9uKSB7XG5cdFx0XHR0aGlzLl9mb2N1c0NvbW1lbnRUYXJnZXQocGVuZGluZy50YXJnZXQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2ZvY3VzQ29tbWVudFRhcmdldCh0YXJnZXQ6IEVsZW1lbnQpOiB2b2lkIHtcblx0XHRpZiAoIXRhcmdldC5pc0Nvbm5lY3RlZCB8fCAhKHRhcmdldCBpbnN0YW5jZW9mIEhUTUxFbGVtZW50IHx8IHRhcmdldCBpbnN0YW5jZW9mIFNWR0VsZW1lbnQpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgaGFkVGFiSW5kZXggPSB0YXJnZXQuaGFzQXR0cmlidXRlKCd0YWJpbmRleCcpO1xuXHRcdGlmICghaGFkVGFiSW5kZXgpIHtcblx0XHRcdHRhcmdldC50YWJJbmRleCA9IC0xO1xuXHRcdH1cblx0XHR0YXJnZXQuZm9jdXMoeyBwcmV2ZW50U2Nyb2xsOiB0cnVlIH0pO1xuXHRcdGlmICghaGFkVGFiSW5kZXgpIHtcblx0XHRcdHRhcmdldC5yZW1vdmVBdHRyaWJ1dGUoJ3RhYmluZGV4Jyk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZGlzY2FyZFBlbmRpbmdDb21tZW50KGVsZW1lbnRJZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgcGVuZGluZyA9IHRoaXMuX3BlbmRpbmdDb21tZW50cy5nZXQoZWxlbWVudElkKTtcblx0XHR0aGlzLl9wZW5kaW5nQ29tbWVudHMuZGVsZXRlKGVsZW1lbnRJZCk7XG5cdFx0dGhpcy5fY2FuY2VsU2NoZWR1bGVkQ29tbWVudFBpbihlbGVtZW50SWQpO1xuXHRcdGlmIChwZW5kaW5nKSB7XG5cdFx0XHR0aGlzLl9yZXN0b3JlSW50ZXJhY3Rpb25BZnRlckNvbW1lbnQoZWxlbWVudElkLCBwZW5kaW5nKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9jYW5jZWxTY2hlZHVsZWRDb21tZW50UGluKGVsZW1lbnRJZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3Qgc2NoZWR1bGVkID0gdGhpcy5fc2NoZWR1bGVkQ29tbWVudFBpbnMuZ2V0KGVsZW1lbnRJZCk7XG5cdFx0aWYgKCFzY2hlZHVsZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0d2luZG93LmNsZWFyVGltZW91dChzY2hlZHVsZWQudGltZW91dCk7XG5cdFx0Y2FuY2VsQW5pbWF0aW9uRnJhbWUoc2NoZWR1bGVkLmFuaW1hdGlvbkZyYW1lKTtcblx0XHR0aGlzLl9zY2hlZHVsZWRDb21tZW50UGlucy5kZWxldGUoZWxlbWVudElkKTtcblx0fVxuXG5cdHByaXZhdGUgX3NjaGVkdWxlQ29tbWVudFBpbihlbGVtZW50SWQ6IHN0cmluZywgYm9keTogc3RyaW5nLCBvcmRpbmFsOiBudW1iZXIpOiB2b2lkIHtcblx0XHRjb25zdCBleGlzdGluZyA9IHRoaXMuX3NjaGVkdWxlZENvbW1lbnRQaW5zLmdldChlbGVtZW50SWQpO1xuXHRcdGlmIChleGlzdGluZykge1xuXHRcdFx0ZXhpc3RpbmcuYm9keSA9IGJvZHk7XG5cdFx0XHRleGlzdGluZy5vcmRpbmFsID0gb3JkaW5hbDtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBzY2hlZHVsZWQ6IFNjaGVkdWxlZENvbW1lbnRQaW4gPSB7IGJvZHksIG9yZGluYWwsIGFuaW1hdGlvbkZyYW1lOiAwLCB0aW1lb3V0OiAwIH07XG5cdFx0dGhpcy5fc2NoZWR1bGVkQ29tbWVudFBpbnMuc2V0KGVsZW1lbnRJZCwgc2NoZWR1bGVkKTtcblx0XHRsZXQgZnJhbWVDb3VudCA9IDA7XG5cdFx0Y29uc3QgZmluaXNoID0gKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX3NjaGVkdWxlZENvbW1lbnRQaW5zLmdldChlbGVtZW50SWQpICE9PSBzY2hlZHVsZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fY2FuY2VsU2NoZWR1bGVkQ29tbWVudFBpbihlbGVtZW50SWQpO1xuXHRcdFx0Y29uc3QgcGVuZGluZyA9IHRoaXMuX3BlbmRpbmdDb21tZW50cy5nZXQoZWxlbWVudElkKTtcblx0XHRcdGlmIChwZW5kaW5nKSB7XG5cdFx0XHRcdHRoaXMuX2NyZWF0ZUNvbW1lbnRQaW4oZWxlbWVudElkLCBwZW5kaW5nLnRhcmdldCwgcGVuZGluZy5hbmNob3IsIHNjaGVkdWxlZC5ib2R5LCBzY2hlZHVsZWQub3JkaW5hbCk7XG5cdFx0XHR9XG5cdFx0fTtcblx0XHRjb25zdCB3YWl0Rm9yRnJhbWUgPSAoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5fc2NoZWR1bGVkQ29tbWVudFBpbnMuZ2V0KGVsZW1lbnRJZCkgIT09IHNjaGVkdWxlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRmcmFtZUNvdW50Kys7XG5cdFx0XHRpZiAoZnJhbWVDb3VudCA+PSBFbGVtZW50UGlja2VyLl9DT01NRU5UX1BJTl9SRVNUT1JFX0ZSQU1FUykge1xuXHRcdFx0XHRmaW5pc2goKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHNjaGVkdWxlZC5hbmltYXRpb25GcmFtZSA9IHJlcXVlc3RBbmltYXRpb25GcmFtZSh3YWl0Rm9yRnJhbWUpO1xuXHRcdFx0fVxuXHRcdH07XG5cdFx0c2NoZWR1bGVkLnRpbWVvdXQgPSB3aW5kb3cuc2V0VGltZW91dChmaW5pc2gsIEVsZW1lbnRQaWNrZXIuX0NPTU1FTlRfUElOX1JFU1RPUkVfVElNRU9VVCk7XG5cdFx0c2NoZWR1bGVkLmFuaW1hdGlvbkZyYW1lID0gcmVxdWVzdEFuaW1hdGlvbkZyYW1lKHdhaXRGb3JGcmFtZSk7XG5cdH1cblxuXHRwcml2YXRlIF9jcmVhdGVDb21tZW50UGluKGVsZW1lbnRJZDogc3RyaW5nLCB0YXJnZXQ6IEVsZW1lbnQsIGFuY2hvcjogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9LCBib2R5OiBzdHJpbmcsIG9yZGluYWw6IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMuX2Vuc3VyZU1vdW50ZWQoKTtcblx0XHRjb25zdCBleGlzdGluZyA9IHRoaXMuX2NvbW1lbnRzLmdldChlbGVtZW50SWQpO1xuXHRcdGlmIChleGlzdGluZyAmJiB0aGlzLl9jb21tZW50UHJldmlld0VsZW1lbnRJZCA9PT0gZWxlbWVudElkKSB7XG5cdFx0XHR0aGlzLl9oaWRlQWN0aXZlQ29tbWVudFByZXZpZXcoKTtcblx0XHR9XG5cdFx0ZXhpc3Rpbmc/LnBpbi5yZW1vdmUoKTtcblx0XHRjb25zdCBwZW5kaW5nID0gdGhpcy5fcGVuZGluZ0NvbW1lbnRzLmdldChlbGVtZW50SWQpO1xuXHRcdHRoaXMuX3BlbmRpbmdDb21tZW50cy5kZWxldGUoZWxlbWVudElkKTtcblx0XHRjb25zdCByZWN0ID0gdGFyZ2V0LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuXHRcdGNvbnN0IG9mZnNldCA9IHtcblx0XHRcdHg6IGFuY2hvci54IC0gKHJlY3QubGVmdCArIHdpbmRvdy5zY3JvbGxYKSxcblx0XHRcdHk6IGFuY2hvci55IC0gKHJlY3QudG9wICsgd2luZG93LnNjcm9sbFkpXG5cdFx0fTtcblxuXHRcdGNvbnN0IHBpbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdHBpbi5jbGFzc05hbWUgPSAnY29tbWVudC1waW4nO1xuXHRcdHBpbi50YWJJbmRleCA9IDA7XG5cdFx0cGluLnNldEF0dHJpYnV0ZSgncm9sZScsICdub3RlJyk7XG5cdFx0Y29uc3QgYnViYmxlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3BhbicpO1xuXHRcdGJ1YmJsZS5jbGFzc05hbWUgPSAnY29tbWVudC1waW4tYnViYmxlJztcblx0XHRjb25zdCBudW1iZXJFbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3BhbicpO1xuXHRcdG51bWJlckVsZW1lbnQuY2xhc3NOYW1lID0gJ2NvbW1lbnQtcGluLW51bWJlcic7XG5cdFx0YnViYmxlLmFwcGVuZENoaWxkKG51bWJlckVsZW1lbnQpO1xuXHRcdHBpbi5hcHBlbmRDaGlsZChidWJibGUpO1xuXG5cdFx0Y29uc3Qgc2hvdyA9ICgpID0+IHtcblx0XHRcdGlmICh0aGlzLl9jb21tZW50VGFyZ2V0IHx8IHRoaXMuX3BlbmRpbmdDb21tZW50SW50ZXJhY3Rpb25JZCB8fCB0aGlzLl9leHRlcm5hbEhpZ2hsaWdodFRhcmdldCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9zaG93Q29tbWVudFByZXZpZXcoZWxlbWVudElkLCB0YXJnZXQsIGJvZHkpO1xuXHRcdH07XG5cdFx0cGluLmFkZEV2ZW50TGlzdGVuZXIoJ3BvaW50ZXJtb3ZlJywgc2hvdyk7XG5cdFx0cGluLmFkZEV2ZW50TGlzdGVuZXIoJ2ZvY3VzaW4nLCBzaG93KTtcblx0XHRwaW4uYWRkRXZlbnRMaXN0ZW5lcignZm9jdXNvdXQnLCAoKSA9PiB0aGlzLl9zY2hlZHVsZUNvbW1lbnRQcmV2aWV3SGlkZSgpKTtcblx0XHR0aGlzLl9jb21tZW50TGF5ZXIuYXBwZW5kQ2hpbGQocGluKTtcblx0XHRjb25zdCBjb21tZW50ID0geyB0YXJnZXQsIHBpbiwgbnVtYmVyRWxlbWVudCwgYm9keSwgb3JkaW5hbCwgb2Zmc2V0IH07XG5cdFx0dGhpcy5fY29tbWVudHMuc2V0KGVsZW1lbnRJZCwgY29tbWVudCk7XG5cdFx0dGhpcy5fdXBkYXRlQ29tbWVudFBpbk51bWJlcnMoKTtcblx0XHR0aGlzLl9sYXlvdXRDb21tZW50UGluKGNvbW1lbnQpO1xuXHRcdGlmIChwZW5kaW5nKSB7XG5cdFx0XHR0aGlzLl9yZXN0b3JlSW50ZXJhY3Rpb25BZnRlckNvbW1lbnQoZWxlbWVudElkLCBwZW5kaW5nKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVDb21tZW50UGluTnVtYmVycygpOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IGNvbW1lbnQgb2YgdGhpcy5fY29tbWVudHMudmFsdWVzKCkpIHtcblx0XHRcdGNvbnN0IG51bWJlckxhYmVsID0gU3RyaW5nKGNvbW1lbnQub3JkaW5hbCk7XG5cdFx0XHRjb21tZW50Lm51bWJlckVsZW1lbnQudGV4dENvbnRlbnQgPSBudW1iZXJMYWJlbDtcblx0XHRcdGNvbW1lbnQucGluLnRpdGxlID0gY29tbWVudC5ib2R5IHx8IHRoaXMuX2Zvcm1hdExvY2FsaXplZFN0cmluZyhsb2NhbGl6ZWRTdHJpbmdzLmVsZW1lbnRDb21tZW50LCBudW1iZXJMYWJlbCk7XG5cdFx0XHRjb21tZW50LnBpbi5zZXRBdHRyaWJ1dGUoXG5cdFx0XHRcdCdhcmlhLWxhYmVsJyxcblx0XHRcdFx0Y29tbWVudC5ib2R5XG5cdFx0XHRcdFx0PyB0aGlzLl9mb3JtYXRMb2NhbGl6ZWRTdHJpbmcobG9jYWxpemVkU3RyaW5ncy5lbGVtZW50Q29tbWVudFdpdGhCb2R5LCBudW1iZXJMYWJlbCwgY29tbWVudC5ib2R5KVxuXHRcdFx0XHRcdDogdGhpcy5fZm9ybWF0TG9jYWxpemVkU3RyaW5nKGxvY2FsaXplZFN0cmluZ3MuZW1wdHlFbGVtZW50Q29tbWVudCwgbnVtYmVyTGFiZWwpXG5cdFx0XHQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2FwcGx5TG9jYWxpemVkU3RyaW5ncygpOiB2b2lkIHtcblx0XHR0aGlzLl9jb21tZW50UHJldmlld1JlbW92ZUJ1dHRvbi50aXRsZSA9IGxvY2FsaXplZFN0cmluZ3MucmVtb3ZlQ29tbWVudDtcblx0XHR0aGlzLl9jb21tZW50UHJldmlld1JlbW92ZUJ1dHRvbi5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBsb2NhbGl6ZWRTdHJpbmdzLnJlbW92ZUVsZW1lbnRDb21tZW50KTtcblx0XHR0aGlzLl9jb21tZW50Q29tcG9zZXIuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgbG9jYWxpemVkU3RyaW5ncy5jb21tZW50T25TZWxlY3RlZEVsZW1lbnQpO1xuXHRcdHRoaXMuX2NvbW1lbnRJbnB1dC5wbGFjZWhvbGRlciA9IGxvY2FsaXplZFN0cmluZ3MuYWRkQ29tbWVudFBsYWNlaG9sZGVyO1xuXHRcdHRoaXMuX2NvbW1lbnRJbnB1dC5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBsb2NhbGl6ZWRTdHJpbmdzLmNvbW1lbnRPblNlbGVjdGVkRWxlbWVudCk7XG5cdFx0dGhpcy5fY29tbWVudFNlbmRCdXR0b24udGl0bGUgPSBsb2NhbGl6ZWRTdHJpbmdzLmFkZENvbW1lbnQ7XG5cdFx0dGhpcy5fY29tbWVudFNlbmRCdXR0b24uc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgbG9jYWxpemVkU3RyaW5ncy5hZGRDb21tZW50KTtcblx0XHR0aGlzLl91cGRhdGVDb21tZW50UGluTnVtYmVycygpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZm9ybWF0TG9jYWxpemVkU3RyaW5nKHRlbXBsYXRlOiBzdHJpbmcsIC4uLnZhbHVlczogcmVhZG9ubHkgc3RyaW5nW10pOiBzdHJpbmcge1xuXHRcdHJldHVybiB0ZW1wbGF0ZS5yZXBsYWNlKC9cXHsoXFxkKylcXH0vZywgKF8sIGluZGV4KSA9PiB2YWx1ZXNbTnVtYmVyKGluZGV4KV0gPz8gJycpO1xuXHR9XG5cblx0cHJpdmF0ZSBfbGF5b3V0Q29tbWVudFBpbihjb21tZW50OiB7IHRhcmdldDogRWxlbWVudDsgcGluOiBIVE1MRGl2RWxlbWVudDsgb2Zmc2V0OiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH0gfSk6IHZvaWQge1xuXHRcdGNvbnN0IHJlY3QgPSBjb21tZW50LnRhcmdldC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcblx0XHRjb25zdCB4ID0gcmVjdC5sZWZ0ICsgd2luZG93LnNjcm9sbFggKyBjb21tZW50Lm9mZnNldC54O1xuXHRcdGNvbnN0IHkgPSByZWN0LnRvcCArIHdpbmRvdy5zY3JvbGxZICsgY29tbWVudC5vZmZzZXQueTtcblx0XHRjb25zdCBzY3JvbGxpbmdFbGVtZW50ID0gZG9jdW1lbnQuc2Nyb2xsaW5nRWxlbWVudCA/PyBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQ7XG5cdFx0Y29uc3QgaGFsZldpZHRoID0gY29tbWVudC5waW4ub2Zmc2V0V2lkdGggLyAyO1xuXHRcdGNvbnN0IGhhbGZIZWlnaHQgPSBjb21tZW50LnBpbi5vZmZzZXRIZWlnaHQgLyAyO1xuXHRcdGNvbnN0IGNsYW1wZWRYID0gTWF0aC5tYXgoaGFsZldpZHRoLCBNYXRoLm1pbih4LCBzY3JvbGxpbmdFbGVtZW50LnNjcm9sbFdpZHRoIC0gaGFsZldpZHRoKSk7XG5cdFx0Y29uc3QgY2xhbXBlZFkgPSBNYXRoLm1heChoYWxmSGVpZ2h0LCBNYXRoLm1pbih5LCBzY3JvbGxpbmdFbGVtZW50LnNjcm9sbEhlaWdodCAtIGhhbGZIZWlnaHQpKTtcblx0XHRjb21tZW50LnBpbi5zdHlsZS5sZWZ0ID0gYCR7Y2xhbXBlZFh9cHhgO1xuXHRcdGNvbW1lbnQucGluLnN0eWxlLnRvcCA9IGAke2NsYW1wZWRZfXB4YDtcblx0fVxuXG5cdHByaXZhdGUgX3Nob3dDb21tZW50UHJldmlldyhlbGVtZW50SWQ6IHN0cmluZywgdGFyZ2V0OiBFbGVtZW50LCBmYWxsYmFja0JvZHk6IHN0cmluZyk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9wZW5kaW5nQ29tbWVudEludGVyYWN0aW9uSWQgfHwgdGhpcy5fY29tbWVudFByZXZpZXdDb2xsYXBzaW5nKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9jb21tZW50UHJldmlld0VsZW1lbnRJZCA9PT0gZWxlbWVudElkKSB7XG5cdFx0XHR0aGlzLl9jYW5jZWxDb21tZW50UHJldmlld0hpZGUoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5faGlkZUFjdGl2ZUNvbW1lbnRQcmV2aWV3KCk7XG5cdFx0dGhpcy5fY29tbWVudFByZXZpZXdFbGVtZW50SWQgPSBlbGVtZW50SWQ7XG5cdFx0Y29uc3QgY29tbWVudCA9IHRoaXMuX2NvbW1lbnRzLmdldChlbGVtZW50SWQpO1xuXHRcdGlmIChjb21tZW50KSB7XG5cdFx0XHRjb21tZW50LnBpbi5jbGFzc0xpc3QuYWRkKCdwcmV2aWV3aW5nJyk7XG5cdFx0XHRjb21tZW50LnBpbi5hZnRlcih0aGlzLl9jb21tZW50UHJldmlld0hpdEFyZWEpO1xuXHRcdH1cblx0XHRjb25zdCBib2R5ID0gY29tbWVudD8uYm9keSA/PyBmYWxsYmFja0JvZHk7XG5cdFx0dGhpcy5fc2V0Q29tbWVudFByZXZpZXdCb2R5KGJvZHkpO1xuXHRcdHRoaXMuX3NoYWRvd0hvc3QuY2xhc3NMaXN0LmFkZCgnY29tbWVudC1wcmV2aWV3LWFjdGl2ZScpO1xuXHRcdHRoaXMuX3VwZGF0ZUhpZ2hsaWdodCh0YXJnZXQpO1xuXHRcdHRoaXMuX3Nob3dDb21tZW50QmFja2Ryb3AodGFyZ2V0KTtcblx0XHRpZiAoY29tbWVudCkge1xuXHRcdFx0dGhpcy5fYW5pbWF0ZUNvbW1lbnRQcmV2aWV3KCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfc2V0Q29tbWVudFByZXZpZXdCb2R5KGJvZHk6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX2NvbW1lbnRQcmV2aWV3Qm9keS50ZXh0Q29udGVudCA9IGJvZHk7XG5cdFx0dGhpcy5fY29tbWVudFByZXZpZXcudGl0bGUgPSBib2R5O1xuXHRcdHRoaXMuX2NvbW1lbnRQcmV2aWV3LmNsYXNzTGlzdC50b2dnbGUoJ2VtcHR5JywgIWJvZHkpO1xuXHRcdHRoaXMuX2NvbW1lbnRQcmV2aWV3SGl0QXJlYS5zdHlsZS5kaXNwbGF5ID0gJ2Jsb2NrJztcblx0XHR0aGlzLl9jb21tZW50UHJldmlldy5zdHlsZS5kaXNwbGF5ID0gJ2ZsZXgnO1xuXHR9XG5cblx0cHJpdmF0ZSBfYW5pbWF0ZUNvbW1lbnRQcmV2aWV3KGNvbGxhcHNpbmcgPSBmYWxzZSk6IEFuaW1hdGlvbiB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHRoaXMuX3JlZHVjZWRNb3Rpb24pIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IHByZXZpZXdBbmltYXRpb24gPSB0aGlzLl9hbmltYXRlQ29tbWVudFN1cmZhY2UodGhpcy5fY29tbWVudFByZXZpZXcsIGNvbGxhcHNpbmcpO1xuXHRcdGNvbnN0IHN1cHBvcnRpbmdLZXlmcmFtZXM6IEtleWZyYW1lW10gPSBjb2xsYXBzaW5nID8gW3sgb3BhY2l0eTogMSB9LCB7IG9wYWNpdHk6IDAgfV0gOiBbeyBvcGFjaXR5OiAwIH0sIHsgb3BhY2l0eTogMSB9XTtcblx0XHRjb25zdCBzdXBwb3J0aW5nQW5pbWF0aW9uczogQW5pbWF0aW9uW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGVsZW1lbnQgb2YgW3RoaXMuX2hpZ2hsaWdodFNoYXBlLCB0aGlzLl9sYWJlbF0pIHtcblx0XHRcdGlmIChlbGVtZW50LnN0eWxlLmRpc3BsYXkgPT09ICdub25lJykge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGFuaW1hdGlvbiA9IGVsZW1lbnQuYW5pbWF0ZShzdXBwb3J0aW5nS2V5ZnJhbWVzLCB7IGR1cmF0aW9uOiBFbGVtZW50UGlja2VyLl9DT01NRU5UX1NVUFBPUlRJTkdfRkFERV9EVVJBVElPTiwgZWFzaW5nOiAnbGluZWFyJywgZmlsbDogJ2JvdGgnIH0pO1xuXHRcdFx0c3VwcG9ydGluZ0FuaW1hdGlvbnMucHVzaChhbmltYXRpb24pO1xuXHRcdH1cblx0XHR0aGlzLl9jb21tZW50QW5pbWF0aW9uID0geyBzdXJmYWNlOiBwcmV2aWV3QW5pbWF0aW9uLCBzdXBwb3J0aW5nOiBzdXBwb3J0aW5nQW5pbWF0aW9ucyB9O1xuXHRcdHJldHVybiBwcmV2aWV3QW5pbWF0aW9uO1xuXHR9XG5cblx0cHJpdmF0ZSBfYW5pbWF0ZUNvbW1lbnRTdXJmYWNlKHN1cmZhY2U6IEhUTUxFbGVtZW50LCBjb2xsYXBzaW5nID0gZmFsc2UpOiBBbmltYXRpb24ge1xuXHRcdHRoaXMuX3NldENvbW1lbnRTdXJmYWNlVHJhbnNmb3JtT3JpZ2luKHN1cmZhY2UpO1xuXHRcdHJldHVybiBzdXJmYWNlLmFuaW1hdGUoXG5cdFx0XHRjb2xsYXBzaW5nID8gW3sgdHJhbnNmb3JtOiAnc2NhbGUoMSknIH0sIHsgdHJhbnNmb3JtOiAnc2NhbGUoMCknIH1dIDogW3sgdHJhbnNmb3JtOiAnc2NhbGUoMCknIH0sIHsgdHJhbnNmb3JtOiAnc2NhbGUoMSknIH1dLFxuXHRcdFx0eyBkdXJhdGlvbjogRWxlbWVudFBpY2tlci5fQ09NTUVOVF9TVVJGQUNFX0FOSU1BVElPTl9EVVJBVElPTiwgZWFzaW5nOiAnY3ViaWMtYmV6aWVyKDAuMiwgMCwgMCwgMSknLCBmaWxsOiAnZm9yd2FyZHMnIH1cblx0XHQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2NoZWR1bGVDb21tZW50UHJldmlld0hpZGUoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2NvbW1lbnRQcmV2aWV3Q29sbGFwc2luZykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9jYW5jZWxDb21tZW50UHJldmlld0hpZGUoKTtcblx0XHR0aGlzLl9jb21tZW50UHJldmlld0hpZGVUaW1lb3V0ID0gd2luZG93LnNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0dGhpcy5fY29tbWVudFByZXZpZXdIaWRlVGltZW91dCA9IHVuZGVmaW5lZDtcblx0XHRcdGNvbnN0IGNvbW1lbnQgPSB0aGlzLl9jb21tZW50UHJldmlld0VsZW1lbnRJZCA/IHRoaXMuX2NvbW1lbnRzLmdldCh0aGlzLl9jb21tZW50UHJldmlld0VsZW1lbnRJZCkgOiB1bmRlZmluZWQ7XG5cdFx0XHRjb25zdCBwaW5Gb2N1c2VkID0gY29tbWVudD8ucGluLm1hdGNoZXMoJzpmb2N1cy13aXRoaW4nKSA/PyBmYWxzZTtcblx0XHRcdGNvbnN0IGhpdEFyZWFBY3RpdmUgPSB0aGlzLl9jb21tZW50UHJldmlld0hpdEFyZWEubWF0Y2hlcygnOmhvdmVyLCA6Zm9jdXMtd2l0aGluJyk7XG5cdFx0XHRpZiAocGluRm9jdXNlZCB8fCBoaXRBcmVhQWN0aXZlKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2NvbGxhcHNlQWN0aXZlQ29tbWVudFByZXZpZXcoKTtcblx0XHR9LCBFbGVtZW50UGlja2VyLl9DT01NRU5UX1BSRVZJRVdfSElERV9ERUxBWSk7XG5cdH1cblxuXHRwcml2YXRlIF9jYW5jZWxDb21tZW50UHJldmlld0hpZGUoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2NvbW1lbnRQcmV2aWV3SGlkZVRpbWVvdXQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0d2luZG93LmNsZWFyVGltZW91dCh0aGlzLl9jb21tZW50UHJldmlld0hpZGVUaW1lb3V0KTtcblx0XHRcdHRoaXMuX2NvbW1lbnRQcmV2aWV3SGlkZVRpbWVvdXQgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfY29sbGFwc2VBY3RpdmVDb21tZW50UHJldmlldygpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fY29tbWVudFByZXZpZXdDb2xsYXBzaW5nKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGVsZW1lbnRJZCA9IHRoaXMuX2NvbW1lbnRQcmV2aWV3RWxlbWVudElkO1xuXHRcdGNvbnN0IGNvbW1lbnQgPSBlbGVtZW50SWQgPyB0aGlzLl9jb21tZW50cy5nZXQoZWxlbWVudElkKSA6IHVuZGVmaW5lZDtcblx0XHRpZiAoIWVsZW1lbnRJZCB8fCAhY29tbWVudCB8fCB0aGlzLl9yZWR1Y2VkTW90aW9uKSB7XG5cdFx0XHR0aGlzLl9oaWRlQWN0aXZlQ29tbWVudFByZXZpZXcoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9jb21tZW50UHJldmlld0NvbGxhcHNpbmcgPSB0cnVlO1xuXHRcdHRoaXMuX3NoYWRvd0hvc3QuY2xhc3NMaXN0LmFkZCgnY29tbWVudC1wcmV2aWV3LWNvbGxhcHNpbmcnKTtcblx0XHR0aGlzLl9oaWRlQ29tbWVudEJhY2tkcm9wKCk7XG5cdFx0Y29uc3QgY29tbWVudEFuaW1hdGlvbiA9IHRoaXMuX2NvbW1lbnRBbmltYXRpb247XG5cdFx0bGV0IHN1cmZhY2VBbmltYXRpb246IEFuaW1hdGlvbiB8IHVuZGVmaW5lZDtcblx0XHRpZiAoY29tbWVudEFuaW1hdGlvbikge1xuXHRcdFx0c3VyZmFjZUFuaW1hdGlvbiA9IGNvbW1lbnRBbmltYXRpb24uc3VyZmFjZTtcblx0XHRcdHN1cmZhY2VBbmltYXRpb24ucmV2ZXJzZSgpO1xuXHRcdFx0Zm9yIChjb25zdCBhbmltYXRpb24gb2YgY29tbWVudEFuaW1hdGlvbi5zdXBwb3J0aW5nKSB7XG5cdFx0XHRcdGFuaW1hdGlvbi5yZXZlcnNlKCk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdHN1cmZhY2VBbmltYXRpb24gPSB0aGlzLl9hbmltYXRlQ29tbWVudFByZXZpZXcodHJ1ZSk7XG5cdFx0fVxuXHRcdGlmICghc3VyZmFjZUFuaW1hdGlvbikge1xuXHRcdFx0dGhpcy5faGlkZUFjdGl2ZUNvbW1lbnRQcmV2aWV3KCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHN1cmZhY2VBbmltYXRpb24ub25maW5pc2ggPSAoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5fY29tbWVudFByZXZpZXdDb2xsYXBzaW5nICYmIHRoaXMuX2NvbW1lbnRQcmV2aWV3RWxlbWVudElkID09PSBlbGVtZW50SWQpIHtcblx0XHRcdFx0dGhpcy5fY29tbWVudFByZXZpZXdDb2xsYXBzaW5nID0gZmFsc2U7XG5cdFx0XHRcdHRoaXMuX2hpZGVBY3RpdmVDb21tZW50UHJldmlldygpO1xuXHRcdFx0fVxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIF9jYW5jZWxDb21tZW50QW5pbWF0aW9ucygpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2NvbW1lbnRBbmltYXRpb24pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fY29tbWVudEFuaW1hdGlvbi5zdXJmYWNlLmNhbmNlbCgpO1xuXHRcdGZvciAoY29uc3QgYW5pbWF0aW9uIG9mIHRoaXMuX2NvbW1lbnRBbmltYXRpb24uc3VwcG9ydGluZykge1xuXHRcdFx0YW5pbWF0aW9uLmNhbmNlbCgpO1xuXHRcdH1cblx0XHR0aGlzLl9jb21tZW50QW5pbWF0aW9uID0gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBfaGlkZUFjdGl2ZUNvbW1lbnRQcmV2aWV3KCk6IHZvaWQge1xuXHRcdHRoaXMuX2NhbmNlbENvbW1lbnRQcmV2aWV3SGlkZSgpO1xuXHRcdHRoaXMuX2NvbW1lbnRQcmV2aWV3Q29sbGFwc2luZyA9IGZhbHNlO1xuXHRcdHRoaXMuX3NoYWRvd0hvc3QuY2xhc3NMaXN0LnJlbW92ZSgnY29tbWVudC1wcmV2aWV3LWNvbGxhcHNpbmcnKTtcblx0XHRpZiAodGhpcy5fY29tbWVudFByZXZpZXdFbGVtZW50SWQpIHtcblx0XHRcdHRoaXMuX2NvbW1lbnRzLmdldCh0aGlzLl9jb21tZW50UHJldmlld0VsZW1lbnRJZCk/LnBpbi5jbGFzc0xpc3QucmVtb3ZlKCdwcmV2aWV3aW5nJyk7XG5cdFx0fVxuXHRcdHRoaXMuX2NvbW1lbnRQcmV2aWV3RWxlbWVudElkID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX3NoYWRvd0hvc3QuY2xhc3NMaXN0LnJlbW92ZSgnY29tbWVudC1wcmV2aWV3LWFjdGl2ZScpO1xuXHRcdHRoaXMuX2NvbW1lbnRQcmV2aWV3SGl0QXJlYS5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdHRoaXMuX2NvbW1lbnRQcmV2aWV3LnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0dGhpcy5faGlkZUNvbW1lbnRCYWNrZHJvcCgpO1xuXHRcdGlmICghdGhpcy5fY29tbWVudFRhcmdldCkge1xuXHRcdFx0dGhpcy5fdXBkYXRlSGlnaGxpZ2h0KHRoaXMuX2V4dGVybmFsSGlnaGxpZ2h0VGFyZ2V0KTtcblx0XHR9XG5cdFx0dGhpcy5fY2FuY2VsQ29tbWVudEFuaW1hdGlvbnMoKTtcblx0fVxuXG5cdHByaXZhdGUgX3JlbW92ZUNvbW1lbnQoZWxlbWVudElkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBjb21tZW50ID0gdGhpcy5fY29tbWVudHMuZ2V0KGVsZW1lbnRJZCk7XG5cdFx0aWYgKCFjb21tZW50KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2hpZGVBY3RpdmVDb21tZW50UHJldmlldygpO1xuXHRcdGNvbW1lbnQucGluLnJlbW92ZSgpO1xuXHRcdHRoaXMuX2NvbW1lbnRzLmRlbGV0ZShlbGVtZW50SWQpO1xuXHRcdHRoaXMuX3VwZGF0ZUNvbW1lbnRQaW5OdW1iZXJzKCk7XG5cdFx0dGhpcy5fdW5tb3VudFdoZW5JZGxlKCk7XG5cdFx0dGhpcy5fb25Db21tZW50UmVtb3ZlZChlbGVtZW50SWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfbGF5b3V0Q29tbWVudElucHV0KCk6IHZvaWQge1xuXHRcdHRoaXMuX3Jlc2l6ZUNvbW1lbnRJbnB1dCgpO1xuXHRcdHRoaXMuX2xheW91dENvbW1lbnRDb21wb3NlcigpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVzaXplQ29tbWVudElucHV0KCk6IHZvaWQge1xuXHRcdHRoaXMuX2NvbW1lbnRJbnB1dC5zdHlsZS5oZWlnaHQgPSAnYXV0byc7XG5cdFx0dGhpcy5fY29tbWVudElucHV0LnN0eWxlLmhlaWdodCA9IGAke01hdGgubWluKHRoaXMuX2NvbW1lbnRJbnB1dC5zY3JvbGxIZWlnaHQsIDk2KX1weGA7XG5cdH1cblxuXHRwcml2YXRlIF9sYXlvdXRDb21tZW50QmFja2Ryb3AodGFyZ2V0OiBFbGVtZW50KTogdm9pZCB7XG5cdFx0Y29uc3QgcmVjdCA9IHRoaXMuX2dldFZpc2libGVUYXJnZXRCb3VuZHModGFyZ2V0LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpKTtcblx0XHR0aGlzLl9jb21tZW50QmFja2Ryb3BDdXRvdXQuc2V0QXR0cmlidXRlKCd4JywgYCR7cmVjdC54fWApO1xuXHRcdHRoaXMuX2NvbW1lbnRCYWNrZHJvcEN1dG91dC5zZXRBdHRyaWJ1dGUoJ3knLCBgJHtyZWN0Lnl9YCk7XG5cdFx0dGhpcy5fY29tbWVudEJhY2tkcm9wQ3V0b3V0LnNldEF0dHJpYnV0ZSgnd2lkdGgnLCBgJHtyZWN0LndpZHRofWApO1xuXHRcdHRoaXMuX2NvbW1lbnRCYWNrZHJvcEN1dG91dC5zZXRBdHRyaWJ1dGUoJ2hlaWdodCcsIGAke3JlY3QuaGVpZ2h0fWApO1xuXHRcdHRoaXMuX2NvbW1lbnRCYWNrZHJvcEN1dG91dC5zZXRBdHRyaWJ1dGUoJ3J4JywgJzInKTtcblx0fVxuXG5cdHByaXZhdGUgX3Nob3dDb21tZW50QmFja2Ryb3AodGFyZ2V0OiBFbGVtZW50KTogdm9pZCB7XG5cdFx0Y29uc3QgcmVxdWVzdCA9ICsrdGhpcy5fY29tbWVudEJhY2tkcm9wUmVxdWVzdDtcblx0XHR0aGlzLl9jb21tZW50QmFja2Ryb3BUYXJnZXQgPSB0YXJnZXQ7XG5cdFx0dGhpcy5fbGF5b3V0Q29tbWVudEJhY2tkcm9wKHRhcmdldCk7XG5cdFx0dGhpcy5fY29tbWVudEJhY2tkcm9wLmNsYXNzTGlzdC5yZW1vdmUoJ3Zpc2libGUnKTtcblx0XHRyZXF1ZXN0QW5pbWF0aW9uRnJhbWUoKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX2NvbW1lbnRCYWNrZHJvcFJlcXVlc3QgPT09IHJlcXVlc3QpIHtcblx0XHRcdFx0dGhpcy5fY29tbWVudEJhY2tkcm9wLmNsYXNzTGlzdC5hZGQoJ3Zpc2libGUnKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX2hpZGVDb21tZW50QmFja2Ryb3AoKTogdm9pZCB7XG5cdFx0dGhpcy5fY29tbWVudEJhY2tkcm9wUmVxdWVzdCsrO1xuXHRcdHRoaXMuX2NvbW1lbnRCYWNrZHJvcFRhcmdldCA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9jb21tZW50QmFja2Ryb3AuY2xhc3NMaXN0LnJlbW92ZSgndmlzaWJsZScpO1xuXHR9XG5cblx0cHJpdmF0ZSBfbGF5b3V0Q29tbWVudENvbXBvc2VyKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fY29tbWVudFRhcmdldCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9yZW5kZXJIaWdobGlnaHQodGhpcy5fY29tbWVudFRhcmdldCk7XG5cdH1cblxuXHRwcml2YXRlIF9lbnN1cmVNb3VudGVkKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fc2hhZG93SG9zdC5wYXJlbnROb2RlKSB7XG5cdFx0XHRkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQuYXBwZW5kQ2hpbGQodGhpcy5fc2hhZG93SG9zdCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfdW5tb3VudFdoZW5JZGxlKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fc2VsZWN0aW9uQWN0aXZlICYmICF0aGlzLl9oaWdobGlnaHRUYXJnZXQgJiYgdGhpcy5fY29tbWVudHMuc2l6ZSA9PT0gMCkge1xuXHRcdFx0dGhpcy5fc2hhZG93SG9zdC5yZW1vdmUoKTtcblx0XHR9XG5cdH1cblxuXHQvLyAtLS0gU3RhdGljIGhlbHBlcnMgLS0tXG5cblx0LyoqXG5cdCAqIEluamVjdCB0aGUgc2hhZG93LXJvb3Qgc3R5bGVzaGVldC4gQ3VzdG9tIHByb3BlcnRpZXMgb24gdGhlIGhvc3Rcblx0ICogZWxlbWVudCBkcml2ZSB0aGUgY29sb3JzIHNvIHRoZSB3b3JrYmVuY2ggY2FuIHRoZW1lIHRoZW0uXG5cdCAqXG5cdCAqIFdlIGRlbGliZXJhdGVseSBkbyAqKm5vdCoqIHVzZSBhIGAqYCBzZWxlY3RvciB3aXRoIGBhbGw6IGluaXRpYWxgIFx1MjAxNFxuXHQgKiB0aGF0IHdvdWxkIGFsc28gcmVzZXQgYDxzdHlsZT5gJ3MgZGVmYXVsdCBgZGlzcGxheTogbm9uZWAsIGNhdXNpbmdcblx0ICogdGhlIGxpdGVyYWwgQ1NTIHNvdXJjZSB0byByZW5kZXIgYXMgcGFnZSB0ZXh0LlxuXHQgKi9cblx0cHJpdmF0ZSBzdGF0aWMgX2J1aWxkU3R5bGUoKTogSFRNTFN0eWxlRWxlbWVudCB7XG5cdFx0Y29uc3Qgc3R5bGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzdHlsZScpO1xuXHRcdHN0eWxlLnRleHRDb250ZW50ID0gYFxuXHRcdFx0Omhvc3Qge1xuXHRcdFx0XHRhbGw6IGluaXRpYWw7XG5cdFx0XHRcdGZvbnQtZmFtaWx5OiB2YXIoLS1waWNrLWZvbnQsIHN5c3RlbS11aSwgLWFwcGxlLXN5c3RlbSwgc2Fucy1zZXJpZik7XG5cdFx0XHRcdHBvaW50ZXItZXZlbnRzOiBub25lICFpbXBvcnRhbnQ7XG5cdFx0XHR9XG5cdFx0XHQuaGlnaGxpZ2h0IHtcblx0XHRcdFx0cG9zaXRpb246IGFic29sdXRlOyBib3gtc2l6aW5nOiBib3JkZXItYm94O1xuXHRcdFx0XHR6LWluZGV4OiAyO1xuXHRcdFx0fVxuXHRcdFx0LmNvbW1lbnQtYmFja2Ryb3Age1xuXHRcdFx0XHRwb3NpdGlvbjogZml4ZWQ7XG5cdFx0XHRcdGluc2V0OiAwO1xuXHRcdFx0XHR3aWR0aDogMTAwJTtcblx0XHRcdFx0aGVpZ2h0OiAxMDAlO1xuXHRcdFx0XHRwb2ludGVyLWV2ZW50czogbm9uZTtcblx0XHRcdFx0ei1pbmRleDogMjtcblx0XHRcdH1cblx0XHRcdC5jb21tZW50LWJhY2tkcm9wLWZpbGwge1xuXHRcdFx0XHRmaWxsOiB2YXIoLS12c2NvZGUtd2lkZ2V0LXNoYWRvdywgdHJhbnNwYXJlbnQpO1xuXHRcdFx0XHRvcGFjaXR5OiAwO1xuXHRcdFx0XHR0cmFuc2l0aW9uOiBvcGFjaXR5IDEyMG1zIGxpbmVhcjtcblx0XHRcdH1cblx0XHRcdC5jb21tZW50LWJhY2tkcm9wLnZpc2libGUgLmNvbW1lbnQtYmFja2Ryb3AtZmlsbCB7XG5cdFx0XHRcdG9wYWNpdHk6IDE7XG5cdFx0XHR9XG5cdFx0XHQuaGlnaGxpZ2h0LXNoYXBlIHtcblx0XHRcdFx0ZmlsbDogY29sb3ItbWl4KGluIHNyZ2IsIHZhcigtLXZzY29kZS1mb2N1c0JvcmRlciwgIzAwNzhkNCkgMTIlLCB0cmFuc3BhcmVudCk7XG5cdFx0XHRcdHN0cm9rZTogdmFyKC0tdnNjb2RlLWZvY3VzQm9yZGVyLCAjMDA3OGQ0KTtcblx0XHRcdFx0c3Ryb2tlLXdpZHRoOiAycHg7XG5cdFx0XHR9XG5cdFx0XHQub3ZlcmxheSB7XG5cdFx0XHRcdHBvc2l0aW9uOiBmaXhlZDsgaW5zZXQ6IDA7XG5cdFx0XHRcdGJhY2tncm91bmQ6IHRyYW5zcGFyZW50OyBib3gtc2l6aW5nOiBib3JkZXItYm94O1xuXHRcdFx0XHR6LWluZGV4OiAyO1xuXHRcdFx0fVxuXHRcdFx0LmNvbW1lbnQtbGF5ZXIge1xuXHRcdFx0XHRwb3NpdGlvbjogYWJzb2x1dGU7IGluc2V0OiAwOyBwb2ludGVyLWV2ZW50czogbm9uZTtcblx0XHRcdH1cblx0XHRcdC5jb21tZW50LXN1cmZhY2Uge1xuXHRcdFx0XHRwb3NpdGlvbjogZml4ZWQ7XG5cdFx0XHRcdGJveC1zaXppbmc6IGJvcmRlci1ib3g7XG5cdFx0XHRcdHdpZHRoOiBtaW4oMzIwcHgsIGNhbGMoMTAwdncgLSAxNnB4KSk7XG5cdFx0XHRcdGJvcmRlcjogdmFyKC0tdnNjb2RlLXN0cm9rZVRoaWNrbmVzcywgMXB4KSBzb2xpZCB2YXIoLS12c2NvZGUtZWRpdG9yV2lkZ2V0LWJvcmRlciwgdmFyKC0tdnNjb2RlLWNvbnRyYXN0Qm9yZGVyLCAjNDU0NTQ1KSk7XG5cdFx0XHRcdGJvcmRlci1yYWRpdXM6IHZhcigtLXZzY29kZS1jb3JuZXJSYWRpdXMtbGFyZ2UsIDhweCk7XG5cdFx0XHRcdGJhY2tncm91bmQ6IHZhcigtLXZzY29kZS1lZGl0b3JXaWRnZXQtYmFja2dyb3VuZCwgIzI1MjUyNik7XG5cdFx0XHRcdGNvbG9yOiB2YXIoLS12c2NvZGUtZWRpdG9yV2lkZ2V0LWZvcmVncm91bmQsICNjY2NjY2MpO1xuXHRcdFx0XHRib3gtc2hhZG93OiAwIDJweCA2cHggdmFyKC0tdnNjb2RlLXdpZGdldC1zaGFkb3csIHRyYW5zcGFyZW50KTtcblx0XHRcdFx0Zm9udC1zaXplOiAxM3B4O1xuXHRcdFx0XHRmb250LXdlaWdodDogNDAwO1xuXHRcdFx0XHR6LWluZGV4OiA0O1xuXHRcdFx0fVxuXHRcdFx0LmNvbW1lbnQtc3VyZmFjZVtkYXRhLWF0dGFjaG1lbnQtY29ybmVyPSd0b3AtbGVmdCddIHtcblx0XHRcdFx0Ym9yZGVyLXRvcC1sZWZ0LXJhZGl1czogMDtcblx0XHRcdH1cblx0XHRcdC5jb21tZW50LXN1cmZhY2VbZGF0YS1hdHRhY2htZW50LWNvcm5lcj0ndG9wLXJpZ2h0J10ge1xuXHRcdFx0XHRib3JkZXItdG9wLXJpZ2h0LXJhZGl1czogMDtcblx0XHRcdH1cblx0XHRcdC5jb21tZW50LXN1cmZhY2VbZGF0YS1hdHRhY2htZW50LWNvcm5lcj0nYm90dG9tLWxlZnQnXSB7XG5cdFx0XHRcdGJvcmRlci1ib3R0b20tbGVmdC1yYWRpdXM6IDA7XG5cdFx0XHR9XG5cdFx0XHQuY29tbWVudC1zdXJmYWNlW2RhdGEtYXR0YWNobWVudC1jb3JuZXI9J2JvdHRvbS1yaWdodCddIHtcblx0XHRcdFx0Ym9yZGVyLWJvdHRvbS1yaWdodC1yYWRpdXM6IDA7XG5cdFx0XHR9XG5cdFx0XHQuY29tbWVudC1wcmV2aWV3LWhpdC1hcmVhIHtcblx0XHRcdFx0cG9zaXRpb246IGZpeGVkO1xuXHRcdFx0XHRwb2ludGVyLWV2ZW50czogbm9uZTtcblx0XHRcdFx0ei1pbmRleDogNDtcblx0XHRcdH1cblx0XHRcdC5jb21tZW50LXByZXZpZXcge1xuXHRcdFx0XHRwb3NpdGlvbjogYWJzb2x1dGU7XG5cdFx0XHRcdGFsaWduLWl0ZW1zOiBmbGV4LXN0YXJ0O1xuXHRcdFx0XHRnYXA6IDhweDtcblx0XHRcdFx0bWF4LWhlaWdodDogOTZweDtcblx0XHRcdFx0cGFkZGluZzogNnB4IDhweDtcblx0XHRcdFx0b3ZlcmZsb3c6IGhpZGRlbjtcblx0XHRcdFx0bGluZS1oZWlnaHQ6IDIwcHg7XG5cdFx0XHRcdHBvaW50ZXItZXZlbnRzOiBub25lO1xuXHRcdFx0fVxuXHRcdFx0LmNvbW1lbnQtcHJldmlldy5lbXB0eSB7XG5cdFx0XHRcdGdhcDogMDtcblx0XHRcdFx0cGFkZGluZzogNHB4O1xuXHRcdFx0fVxuXHRcdFx0LmNvbW1lbnQtcHJldmlldy5lbXB0eSAuY29tbWVudC1wcmV2aWV3LWJvZHkge1xuXHRcdFx0XHRkaXNwbGF5OiBub25lO1xuXHRcdFx0fVxuXHRcdFx0LmNvbW1lbnQtcHJldmlldy5lbXB0eSAuY29tbWVudC1wcmV2aWV3LXJlbW92ZSB7XG5cdFx0XHRcdG1hcmdpbi1ibG9jazogMDtcblx0XHRcdH1cblx0XHRcdC5jb21tZW50LXByZXZpZXctYm9keSB7XG5cdFx0XHRcdGZsZXg6IDE7XG5cdFx0XHRcdG1pbi13aWR0aDogMDtcblx0XHRcdFx0bWF4LWhlaWdodDogODJweDtcblx0XHRcdFx0b3ZlcmZsb3cteDogaGlkZGVuO1xuXHRcdFx0XHRvdmVyZmxvdy15OiBhdXRvO1xuXHRcdFx0XHRvdmVyZmxvdy13cmFwOiBhbnl3aGVyZTtcblx0XHRcdFx0c2Nyb2xsYmFyLXdpZHRoOiB0aGluO1xuXHRcdFx0XHR3aGl0ZS1zcGFjZTogcHJlLXdyYXA7XG5cdFx0XHR9XG5cdFx0XHQ6aG9zdCguY29tbWVudC1wcmV2aWV3LWFjdGl2ZSkgLmNvbW1lbnQtcHJldmlldy1oaXQtYXJlYSxcblx0XHRcdDpob3N0KC5jb21tZW50LXByZXZpZXctYWN0aXZlKSAuY29tbWVudC1wcmV2aWV3IHtcblx0XHRcdFx0cG9pbnRlci1ldmVudHM6IGF1dG87XG5cdFx0XHR9XG5cdFx0XHQ6aG9zdCguY29tbWVudC1wcmV2aWV3LWNvbGxhcHNpbmcpIC5jb21tZW50LXByZXZpZXctaGl0LWFyZWEsXG5cdFx0XHQ6aG9zdCguY29tbWVudC1wcmV2aWV3LWNvbGxhcHNpbmcpIC5jb21tZW50LXByZXZpZXcge1xuXHRcdFx0XHRwb2ludGVyLWV2ZW50czogbm9uZTtcblx0XHRcdH1cblx0XHRcdC5jb21tZW50LXByZXZpZXctcmVtb3ZlIHtcblx0XHRcdFx0ZmxleDogbm9uZTtcblx0XHRcdFx0ZGlzcGxheTogZ3JpZDtcblx0XHRcdFx0cGxhY2UtaXRlbXM6IGNlbnRlcjtcblx0XHRcdFx0Ym94LXNpemluZzogYm9yZGVyLWJveDtcblx0XHRcdFx0d2lkdGg6IDI0cHg7XG5cdFx0XHRcdGhlaWdodDogMjRweDtcblx0XHRcdFx0bWFyZ2luLWJsb2NrOiAtMnB4O1xuXHRcdFx0XHRwYWRkaW5nOiAwO1xuXHRcdFx0XHRib3JkZXI6IDA7XG5cdFx0XHRcdGJvcmRlci1yYWRpdXM6IHZhcigtLXZzY29kZS1jb3JuZXJSYWRpdXMtc21hbGwsIDRweCk7XG5cdFx0XHRcdGJhY2tncm91bmQ6IHRyYW5zcGFyZW50O1xuXHRcdFx0XHRjb2xvcjogdmFyKC0tdnNjb2RlLWVkaXRvcldpZGdldC1mb3JlZ3JvdW5kLCBpbmhlcml0KTtcblx0XHRcdFx0Y3Vyc29yOiBwb2ludGVyO1xuXHRcdFx0XHRmb250LWZhbWlseTogaW5oZXJpdDtcblx0XHRcdH1cblx0XHRcdC5jb21tZW50LXByZXZpZXctcmVtb3ZlIHN2ZyB7XG5cdFx0XHRcdGRpc3BsYXk6IGJsb2NrO1xuXHRcdFx0XHR3aWR0aDogdmFyKC0tdnNjb2RlLWNvZGljb25Gb250U2l6ZSwgMTZweCk7XG5cdFx0XHRcdGhlaWdodDogdmFyKC0tdnNjb2RlLWNvZGljb25Gb250U2l6ZSwgMTZweCk7XG5cdFx0XHR9XG5cdFx0XHQuY29tbWVudC1wcmV2aWV3LXJlbW92ZTpob3ZlciB7XG5cdFx0XHRcdGJhY2tncm91bmQ6IHZhcigtLXZzY29kZS10b29sYmFyLWhvdmVyQmFja2dyb3VuZCwgdHJhbnNwYXJlbnQpO1xuXHRcdFx0fVxuXHRcdFx0LmNvbW1lbnQtY29tcG9zZXIge1xuXHRcdFx0XHRhbGlnbi1pdGVtczogZmxleC1lbmQ7IGdhcDogNnB4OyBwYWRkaW5nOiA2cHg7XG5cdFx0XHRcdHBvaW50ZXItZXZlbnRzOiBhdXRvO1xuXHRcdFx0fVxuXHRcdFx0LmNvbW1lbnQtaW5wdXQge1xuXHRcdFx0XHRmbGV4OiAxOyBtaW4td2lkdGg6IDA7IHJlc2l6ZTogbm9uZTsgb3ZlcmZsb3c6IGF1dG87XG5cdFx0XHRcdHNjcm9sbGJhci13aWR0aDogbm9uZTtcblx0XHRcdFx0Ym94LXNpemluZzogYm9yZGVyLWJveDsgbWFyZ2luOiAwOyBwYWRkaW5nOiAycHggNnB4O1xuXHRcdFx0XHRiYWNrZ3JvdW5kOiB0cmFuc3BhcmVudDsgY29sb3I6IGluaGVyaXQ7XG5cdFx0XHRcdGJvcmRlcjogdmFyKC0tdnNjb2RlLXN0cm9rZVRoaWNrbmVzcywgMXB4KSBzb2xpZCB2YXIoLS12c2NvZGUtZWRpdG9yV2lkZ2V0LWJvcmRlciwgdmFyKC0tdnNjb2RlLWNvbnRyYXN0Qm9yZGVyLCAjNDU0NTQ1KSk7XG5cdFx0XHRcdGJvcmRlci1yYWRpdXM6IHZhcigtLXZzY29kZS1jb3JuZXJSYWRpdXMtc21hbGwsIDRweCk7XG5cdFx0XHRcdG91dGxpbmU6IDA7XG5cdFx0XHRcdGZvbnQ6IGluaGVyaXQ7XG5cdFx0XHRcdGxpbmUtaGVpZ2h0OiAyMHB4O1xuXHRcdFx0XHRjYXJldC1jb2xvcjogdmFyKC0tdnNjb2RlLWZvY3VzQm9yZGVyLCBjdXJyZW50Q29sb3IpO1xuXHRcdFx0fVxuXHRcdFx0LmNvbW1lbnQtaW5wdXQ6Oi13ZWJraXQtc2Nyb2xsYmFyIHtcblx0XHRcdFx0ZGlzcGxheTogbm9uZTtcblx0XHRcdH1cblx0XHRcdC5jb21tZW50LWlucHV0OjpwbGFjZWhvbGRlciB7XG5cdFx0XHRcdGNvbG9yOiB2YXIoLS12c2NvZGUtaW5wdXQtcGxhY2Vob2xkZXJGb3JlZ3JvdW5kLCB2YXIoLS12c2NvZGUtZGVzY3JpcHRpb25Gb3JlZ3JvdW5kLCAjY2NjY2NjYjMpKTtcblx0XHRcdFx0b3BhY2l0eTogMTtcblx0XHRcdH1cblx0XHRcdC5jb21tZW50LXNlbmQge1xuXHRcdFx0XHRib3gtc2l6aW5nOiBib3JkZXItYm94OyBib3JkZXI6IDA7IGN1cnNvcjogcG9pbnRlcjsgZm9udC1mYW1pbHk6IGluaGVyaXQ7XG5cdFx0XHR9XG5cdFx0XHQuY29tbWVudC1zZW5kIHtcblx0XHRcdFx0ZmxleDogbm9uZTsgd2lkdGg6IDI0cHg7IGhlaWdodDogMjRweDsgcGFkZGluZzogMDtcblx0XHRcdFx0Ym9yZGVyLXJhZGl1czogdmFyKC0tdnNjb2RlLWNvcm5lclJhZGl1cy1zbWFsbCwgNHB4KTtcblx0XHRcdFx0YmFja2dyb3VuZDogdHJhbnNwYXJlbnQ7XG5cdFx0XHRcdGNvbG9yOiB2YXIoLS12c2NvZGUtZWRpdG9yV2lkZ2V0LWZvcmVncm91bmQsICNjY2NjY2MpO1xuXHRcdFx0XHRkaXNwbGF5OiBncmlkO1xuXHRcdFx0XHRwbGFjZS1pdGVtczogY2VudGVyO1xuXHRcdFx0fVxuXHRcdFx0LmNvbW1lbnQtc2VuZCBzdmcge1xuXHRcdFx0XHRkaXNwbGF5OiBibG9jaztcblx0XHRcdFx0d2lkdGg6IHZhcigtLXZzY29kZS1jb2RpY29uRm9udFNpemUsIDE2cHgpO1xuXHRcdFx0XHRoZWlnaHQ6IHZhcigtLXZzY29kZS1jb2RpY29uRm9udFNpemUsIDE2cHgpO1xuXHRcdFx0fVxuXHRcdFx0LmNvbW1lbnQtc2VuZDpob3ZlciB7XG5cdFx0XHRcdGJhY2tncm91bmQ6IHZhcigtLXZzY29kZS10b29sYmFyLWhvdmVyQmFja2dyb3VuZCwgdHJhbnNwYXJlbnQpO1xuXHRcdFx0fVxuXHRcdFx0LmNvbW1lbnQtcGluIHtcblx0XHRcdFx0cG9zaXRpb246IGFic29sdXRlO1xuXHRcdFx0XHRkaXNwbGF5OiBncmlkO1xuXHRcdFx0XHRwbGFjZS1pdGVtczogY2VudGVyO1xuXHRcdFx0XHR3aWR0aDogMjJweDtcblx0XHRcdFx0aGVpZ2h0OiAyMnB4O1xuXHRcdFx0XHR0cmFuc2Zvcm06IHRyYW5zbGF0ZSgtMTFweCwgLTExcHgpO1xuXHRcdFx0XHRwb2ludGVyLWV2ZW50czogYXV0bztcblx0XHRcdFx0ei1pbmRleDogMDtcblx0XHRcdFx0dHJhbnNpdGlvbjogb3BhY2l0eSAxMjBtcyBsaW5lYXI7XG5cdFx0XHR9XG5cdFx0XHQuY29tbWVudC1sYXllci5jb21wb3NpbmcgLmNvbW1lbnQtcGluIHtcblx0XHRcdFx0b3BhY2l0eTogMDtcblx0XHRcdFx0cG9pbnRlci1ldmVudHM6IG5vbmU7XG5cdFx0XHRcdHotaW5kZXg6IGF1dG87XG5cdFx0XHR9XG5cdFx0XHQuY29tbWVudC1sYXllci5jb21tZW50LWNhcHR1cmUtcGVuZGluZyAuY29tbWVudC1waW4ge1xuXHRcdFx0XHR2aXNpYmlsaXR5OiBoaWRkZW47XG5cdFx0XHR9XG5cdFx0XHQuY29tbWVudC1waW46aG92ZXIsIC5jb21tZW50LXBpbjpmb2N1cy13aXRoaW4ge1xuXHRcdFx0XHR6LWluZGV4OiAxO1xuXHRcdFx0fVxuXHRcdFx0LmNvbW1lbnQtcGluLnByZXZpZXdpbmcge1xuXHRcdFx0XHR6LWluZGV4OiAwO1xuXHRcdFx0fVxuXHRcdFx0Omhvc3QoLmNvbW1lbnQtcHJldmlldy1hY3RpdmUpIC5jb21tZW50LXBpbjpub3QoLnByZXZpZXdpbmcpIHtcblx0XHRcdFx0b3BhY2l0eTogMC4zNTtcblx0XHRcdH1cblx0XHRcdC5jb21tZW50LXBpbi5wcmV2aWV3aW5nIC5jb21tZW50LXBpbi1idWJibGUge1xuXHRcdFx0XHR3aWR0aDogNnB4O1xuXHRcdFx0XHRoZWlnaHQ6IDZweDtcblx0XHRcdFx0Ym9yZGVyLXdpZHRoOiAwO1xuXHRcdFx0fVxuXHRcdFx0LmNvbW1lbnQtcGluLnByZXZpZXdpbmcgLmNvbW1lbnQtcGluLW51bWJlciB7XG5cdFx0XHRcdG9wYWNpdHk6IDA7XG5cdFx0XHR9XG5cdFx0XHQuY29tbWVudC1waW4tYnViYmxlIHtcblx0XHRcdFx0Ym94LXNpemluZzogYm9yZGVyLWJveDtcblx0XHRcdFx0ZGlzcGxheTogZ3JpZDtcblx0XHRcdFx0cGxhY2UtaXRlbXM6IGNlbnRlcjtcblx0XHRcdFx0d2lkdGg6IDIycHg7XG5cdFx0XHRcdGhlaWdodDogMjJweDtcblx0XHRcdFx0cGFkZGluZzogMDtcblx0XHRcdFx0Ym9yZGVyOiB2YXIoLS12c2NvZGUtc3Ryb2tlVGhpY2tuZXNzLCAxcHgpIHNvbGlkIHZhcigtLXZzY29kZS1lZGl0b3JXaWRnZXQtYmFja2dyb3VuZCwgIzI1MjUyNik7XG5cdFx0XHRcdGJvcmRlci1yYWRpdXM6IHZhcigtLXZzY29kZS1jb3JuZXJSYWRpdXMtY2lyY2xlLCA5OTk5cHgpO1xuXHRcdFx0XHRiYWNrZ3JvdW5kOiB2YXIoLS12c2NvZGUtYnV0dG9uLWJhY2tncm91bmQsICMwMDc4ZDQpO1xuXHRcdFx0XHRjb2xvcjogdmFyKC0tdnNjb2RlLWJ1dHRvbi1mb3JlZ3JvdW5kLCB3aGl0ZSk7XG5cdFx0XHRcdGJveC1zaGFkb3c6IDAgMnB4IDZweCB2YXIoLS12c2NvZGUtd2lkZ2V0LXNoYWRvdywgdHJhbnNwYXJlbnQpO1xuXHRcdFx0XHR0cmFuc2l0aW9uOiB3aWR0aCAxNDBtcyBjdWJpYy1iZXppZXIoMC4yLCAwLCAwLCAxKSwgaGVpZ2h0IDE0MG1zIGN1YmljLWJlemllcigwLjIsIDAsIDAsIDEpLCBib3JkZXItd2lkdGggMTQwbXMgY3ViaWMtYmV6aWVyKDAuMiwgMCwgMCwgMSk7XG5cdFx0XHR9XG5cdFx0XHQuY29tbWVudC1waW4tbnVtYmVyIHtcblx0XHRcdFx0ZGlzcGxheTogYmxvY2s7XG5cdFx0XHRcdHdpZHRoOiAxMDAlO1xuXHRcdFx0XHRmb250LXNpemU6IDExcHg7XG5cdFx0XHRcdGZvbnQtd2VpZ2h0OiA2MDA7XG5cdFx0XHRcdGxpbmUtaGVpZ2h0OiAxMnB4O1xuXHRcdFx0XHR0ZXh0LWFsaWduOiBjZW50ZXI7XG5cdFx0XHRcdHRyYW5zaXRpb246IG9wYWNpdHkgODBtcyBsaW5lYXI7XG5cdFx0XHR9XG5cdFx0XHQuY29tbWVudC1zZW5kOmZvY3VzLXZpc2libGUsIC5jb21tZW50LXByZXZpZXctcmVtb3ZlOmZvY3VzLXZpc2libGUsIC5jb21tZW50LXBpbjpmb2N1cy12aXNpYmxlLCAuY29tbWVudC1pbnB1dDpmb2N1cy12aXNpYmxlIHtcblx0XHRcdFx0b3V0bGluZTogMnB4IHNvbGlkIHZhcigtLXZzY29kZS1mb2N1c0JvcmRlciwgIzAwNzhkNCk7XG5cdFx0XHRcdG91dGxpbmUtb2Zmc2V0OiAycHg7XG5cdFx0XHR9XG5cdFx0XHQ6aG9zdCgucmVkdWNlLW1vdGlvbikgLmNvbW1lbnQtYmFja2Ryb3AtZmlsbCxcblx0XHRcdDpob3N0KC5yZWR1Y2UtbW90aW9uKSAuY29tbWVudC1waW4sXG5cdFx0XHQ6aG9zdCgucmVkdWNlLW1vdGlvbikgLmNvbW1lbnQtcGluLWJ1YmJsZSxcblx0XHRcdDpob3N0KC5yZWR1Y2UtbW90aW9uKSAuY29tbWVudC1waW4tbnVtYmVyIHtcblx0XHRcdFx0dHJhbnNpdGlvbjogbm9uZTtcblx0XHRcdH1cblx0XHRcdC5sYWJlbCB7XG5cdFx0XHRcdHBvc2l0aW9uOiBmaXhlZDsgYm94LXNpemluZzogYm9yZGVyLWJveDtcblx0XHRcdFx0ZGlzcGxheTogaW5saW5lLWZsZXg7IGFsaWduLWl0ZW1zOiBjZW50ZXI7IGdhcDogNnB4OyBoZWlnaHQ6IDIwcHg7IHBhZGRpbmc6IDAgNnB4O1xuXHRcdFx0XHRtYXgtd2lkdGg6IG1pbigxMDAlLCAzMjBweCk7XG5cdFx0XHRcdGJhY2tncm91bmQ6IHZhcigtLXZzY29kZS1idXR0b24tYmFja2dyb3VuZCwgIzAwNzhkNCk7XG5cdFx0XHRcdGNvbG9yOiB2YXIoLS12c2NvZGUtYnV0dG9uLWZvcmVncm91bmQsIHdoaXRlKTtcblx0XHRcdFx0Zm9udC1mYW1pbHk6IGluaGVyaXQ7XG5cdFx0XHRcdGZvbnQtc2l6ZTogMTFweDsgbGluZS1oZWlnaHQ6IDIwcHg7XG5cdFx0XHRcdHdoaXRlLXNwYWNlOiBub3dyYXA7XG5cdFx0XHRcdGJvcmRlci1yYWRpdXM6IDJweDtcblx0XHRcdFx0Ym94LXNoYWRvdzogMCAxcHggNHB4IHJnYmEoMCwgMCwgMCwgMC4yNSk7XG5cdFx0XHRcdHotaW5kZXg6IDM7XG5cdFx0XHR9XG5cdFx0XHQubGFiZWwtaW5mbyB7XG5cdFx0XHRcdGRpc3BsYXk6IGlubGluZS1ibG9jazsgb3ZlcmZsb3c6IGhpZGRlbjsgdGV4dC1vdmVyZmxvdzogZWxsaXBzaXM7IG1pbi13aWR0aDogMDtcblx0XHRcdH1cblx0XHRcdC5sYWJlbC1zZWxlY3RvciB7XG5cdFx0XHRcdGZvbnQtd2VpZ2h0OiA2MDA7XG5cdFx0XHR9XG5cdFx0XHQubGFiZWwtZGltcyB7XG5cdFx0XHRcdGZsZXgtc2hyaW5rOiAwOyBvcGFjaXR5OiAwLjg7XG5cdFx0XHR9XG5cdFx0XHQuZHJhZ2JveCB7XG5cdFx0XHRcdHBvc2l0aW9uOiBmaXhlZDsgYm94LXNpemluZzogYm9yZGVyLWJveDtcblx0XHRcdFx0Ym9yZGVyOiAxcHggZG90dGVkIHZhcigtLXZzY29kZS1mb2N1c0JvcmRlciwgI2EwYWFiZSk7XG5cdFx0XHRcdGJhY2tncm91bmQ6IHRyYW5zcGFyZW50O1xuXHRcdFx0XHR6LWluZGV4OiAyO1xuXHRcdFx0fVxuXHRcdGA7XG5cdFx0cmV0dXJuIHN0eWxlO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX2FwcGx5VGhlbWUoaG9zdDogSFRNTEVsZW1lbnQsIHRoZW1lOiBJQnJvd3NlclZpZXdUaGVtZSB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGhvc3Quc3R5bGUuc2V0UHJvcGVydHkoJy0tdnNjb2RlLWZvY3VzQm9yZGVyJywgdGhlbWU/LmZvY3VzQm9yZGVyID8/IG51bGwpO1xuXHRcdGhvc3Quc3R5bGUuc2V0UHJvcGVydHkoJy0tdnNjb2RlLWJ1dHRvbi1iYWNrZ3JvdW5kJywgdGhlbWU/LmJ1dHRvbkJhY2tncm91bmQgPz8gbnVsbCk7XG5cdFx0aG9zdC5zdHlsZS5zZXRQcm9wZXJ0eSgnLS12c2NvZGUtYnV0dG9uLWZvcmVncm91bmQnLCB0aGVtZT8uYnV0dG9uRm9yZWdyb3VuZCA/PyBudWxsKTtcblx0XHRob3N0LnN0eWxlLnNldFByb3BlcnR5KCctLXZzY29kZS1lZGl0b3JXaWRnZXQtYmFja2dyb3VuZCcsIHRoZW1lPy53aWRnZXRCYWNrZ3JvdW5kID8/IG51bGwpO1xuXHRcdGhvc3Quc3R5bGUuc2V0UHJvcGVydHkoJy0tdnNjb2RlLWVkaXRvcldpZGdldC1mb3JlZ3JvdW5kJywgdGhlbWU/LndpZGdldEZvcmVncm91bmQgPz8gbnVsbCk7XG5cdFx0aG9zdC5zdHlsZS5zZXRQcm9wZXJ0eSgnLS12c2NvZGUtZWRpdG9yV2lkZ2V0LWJvcmRlcicsIHRoZW1lPy53aWRnZXRCb3JkZXIgPz8gbnVsbCk7XG5cdFx0aG9zdC5zdHlsZS5zZXRQcm9wZXJ0eSgnLS12c2NvZGUtd2lkZ2V0LXNoYWRvdycsIHRoZW1lPy53aWRnZXRTaGFkb3cgPz8gbnVsbCk7XG5cdFx0aG9zdC5zdHlsZS5zZXRQcm9wZXJ0eSgnLS12c2NvZGUtY29udHJhc3RCb3JkZXInLCB0aGVtZT8uY29udHJhc3RCb3JkZXIgPz8gbnVsbCk7XG5cdFx0aG9zdC5zdHlsZS5zZXRQcm9wZXJ0eSgnLS12c2NvZGUtZGVzY3JpcHRpb25Gb3JlZ3JvdW5kJywgdGhlbWU/LmRlc2NyaXB0aW9uRm9yZWdyb3VuZCA/PyBudWxsKTtcblx0XHRob3N0LnN0eWxlLnNldFByb3BlcnR5KCctLXZzY29kZS1pbnB1dC1wbGFjZWhvbGRlckZvcmVncm91bmQnLCB0aGVtZT8uaW5wdXRQbGFjZWhvbGRlckZvcmVncm91bmQgPz8gbnVsbCk7XG5cdFx0aG9zdC5zdHlsZS5zZXRQcm9wZXJ0eSgnLS12c2NvZGUtdG9vbGJhci1ob3ZlckJhY2tncm91bmQnLCB0aGVtZT8udG9vbGJhckhvdmVyQmFja2dyb3VuZCA/PyBudWxsKTtcblx0XHRob3N0LnN0eWxlLnNldFByb3BlcnR5KCctLXBpY2stZm9udCcsIHRoZW1lPy5mb250ID8/IG51bGwpO1xuXHR9XG59XG5cbi8qKlxuICogRHJhZy10by1zZWxlY3QgcmVjdGFuZ2xlIHBpY2tlciB1c2VkIGJ5IHRoZSBcIkFkZCBBcmVhIFNjcmVlbnNob3QgdG8gQ2hhdFwiXG4gKiBmbG93LiBNb3VudHMgYSB0cmFuc3BhcmVudCBzaGFkb3cgb3ZlcmxheSB0aGF0IGNhcHR1cmVzIHBvaW50ZXJcbiAqIGV2ZW50cywgZHJhd3MgYSBkb3R0ZWQgcnViYmVyLWJhbmQgcmVjdGFuZ2xlIHdoaWxlIGRyYWdnaW5nLCBhbmQgb24gcG9pbnRlclxuICogdXAgcmVwb3J0cyB0aGUgc2VsZWN0ZWQgcmVnaW9uIGluICoqdmlld3BvcnQgY29vcmRpbmF0ZXMqKi4gRVNDIG9yIGFcbiAqIHplcm8tYXJlYSBkcmFnIGNhbmNlbHMgdGhlIHBpY2suXG4gKi9cbmNsYXNzIEFyZWFQaWNrZXIge1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBfTUlOX0FSRUFfUFggPSA0O1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBfQ1VSU09SX0NST1NTSEFJUiA9ICcvKiBWUyBDb2RlIGluamVjdGVkIHN0eWxlICovICogeyBjdXJzb3I6IGNyb3NzaGFpciAhaW1wb3J0YW50OyB9JztcblxuXHRwcml2YXRlIF9zZWxlY3Rpb25BY3RpdmUgPSBmYWxzZTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9zaGFkb3dIb3N0OiBIVE1MRGl2RWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfZHJhZ2JveDogSFRNTERpdkVsZW1lbnQ7XG5cblx0cHJpdmF0ZSBfZHJhZ1N0YXJ0OiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH0gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2N1cnNvclN0eWxlc2hlZXQ6IEhUTUxTdHlsZUVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfb25QaWNrZWQ6IChyZWN0OiBJQnJvd3NlclZpZXdSZWN0KSA9PiB2b2lkLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX29uU3RvcHBlZDogKCkgPT4gdm9pZFxuXHQpIHtcblx0XHRjb25zdCBzaGFkb3dIb3N0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0c2hhZG93SG9zdC5zZXRBdHRyaWJ1dGUoJ2RhdGEtdnNjb2RlLWFyZWEtcGljay1ob3N0JywgJycpO1xuXHRcdHNoYWRvd0hvc3Quc3R5bGUuY3NzVGV4dCA9ICdwb3NpdGlvbjogYWJzb2x1dGU7IHRvcDogMDsgbGVmdDogMDsgd2lkdGg6IDA7IGhlaWdodDogMDsgei1pbmRleDogMjE0NzQ4MzY0NzsgcG9pbnRlci1ldmVudHM6IG5vbmU7Jztcblx0XHRjb25zdCByb290ID0gc2hhZG93SG9zdC5hdHRhY2hTaGFkb3coeyBtb2RlOiAnY2xvc2VkJyB9KTtcblx0XHRyb290LmFwcGVuZENoaWxkKEFyZWFQaWNrZXIuX2J1aWxkU3R5bGUoKSk7XG5cdFx0dGhpcy5fc2hhZG93SG9zdCA9IHNoYWRvd0hvc3Q7XG5cblx0XHQvLyBBIGZpeGVkIGZ1bGwtdmlld3BvcnQgbGF5ZXIgYmVsb3cgdGhlIGRyYWdib3ggc28gdGhlIHBhZ2UgdW5kZXJuZWF0aFxuXHRcdC8vIGRvZXNuJ3QgcmVjZWl2ZSBob3Zlci9jbGljayBldmVudHMgd2hpbGUgd2UncmUgcGlja2luZy4gVGhlIGxheWVyIGlzXG5cdFx0Ly8gdHJhbnNwYXJlbnQgXHUyMDE0IHRoZSBhY3R1YWwgcGFnZSBpcyBzdGlsbCB2aXNpYmxlLlxuXHRcdGNvbnN0IG92ZXJsYXkgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRvdmVybGF5LmNsYXNzTmFtZSA9ICdvdmVybGF5Jztcblx0XHRyb290LmFwcGVuZENoaWxkKG92ZXJsYXkpO1xuXG5cdFx0Y29uc3QgZHJhZ2JveCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdGRyYWdib3guY2xhc3NOYW1lID0gJ2RyYWdib3gnO1xuXHRcdGRyYWdib3guc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHRyb290LmFwcGVuZENoaWxkKGRyYWdib3gpO1xuXHRcdHRoaXMuX2RyYWdib3ggPSBkcmFnYm94O1xuXHR9XG5cblx0c3RhcnQoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3NlbGVjdGlvbkFjdGl2ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9kcmFnU3RhcnQgPSB1bmRlZmluZWQ7XG5cblx0XHRkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQuYXBwZW5kQ2hpbGQodGhpcy5fc2hhZG93SG9zdCk7XG5cdFx0dGhpcy5fc2VsZWN0aW9uQWN0aXZlID0gdHJ1ZTtcblxuXHRcdC8vIEZvcmNlIGEgY3Jvc3NoYWlyIGN1cnNvciBhY3Jvc3MgdGhlIHdob2xlIHBhZ2Ugd2hpbGUgcGlja2luZy5cblx0XHRjb25zdCBjdXJzb3JTdHlsZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3N0eWxlJyk7XG5cdFx0Y3Vyc29yU3R5bGUuc2V0QXR0cmlidXRlKCdkYXRhLXZzY29kZS1hcmVhLXBpY2stY3Vyc29yJywgJycpO1xuXHRcdGN1cnNvclN0eWxlLnRleHRDb250ZW50ID0gQXJlYVBpY2tlci5fQ1VSU09SX0NST1NTSEFJUjtcblx0XHRkb2N1bWVudC5oZWFkLmFwcGVuZENoaWxkKGN1cnNvclN0eWxlKTtcblx0XHR0aGlzLl9jdXJzb3JTdHlsZXNoZWV0ID0gY3Vyc29yU3R5bGU7XG5cblx0XHR3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcigncG9pbnRlcm1vdmUnLCB0aGlzLl9vblBvaW50ZXJNb3ZlLCB0cnVlKTtcblx0XHR3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcigncG9pbnRlcmRvd24nLCB0aGlzLl9vblBvaW50ZXJEb3duLCB0cnVlKTtcblx0XHR3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcigncG9pbnRlcnVwJywgdGhpcy5fb25Qb2ludGVyVXAsIHRydWUpO1xuXHRcdHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIHRoaXMuX29uQ2xpY2ssIHRydWUpO1xuXHRcdHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdjb250ZXh0bWVudScsIHRoaXMuX29uQ2xpY2ssIHRydWUpO1xuXHRcdHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdrZXlkb3duJywgdGhpcy5fb25LZXlEb3duLCB0cnVlKTtcblx0fVxuXG5cdHN0b3AoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9zZWxlY3Rpb25BY3RpdmUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fdGVhcmRvd24oKTtcblx0XHR0aGlzLl9vblN0b3BwZWQoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBTeW5jaHJvbm91cyB0ZWFyZG93biBvZiB0aGUgb3ZlcmxheSwgY3Vyc29yIHN0eWxlLCBhbmQgZXZlbnQgbGlzdGVuZXJzLlxuXHQgKiBVc2VkIGJ5IGJvdGgge0BsaW5rIHN0b3B9ICh3aGljaCB0aGVuIGZpcmVzIGBfb25TdG9wcGVkYCkgYW5kIGBfb25Qb2ludGVyVXBgXG5cdCAqICh3aGljaCBmaXJlcyBgX29uUGlja2VkYCBvciBgX29uU3RvcHBlZGAgYWZ0ZXIgdGVhcmRvd24gY29tcGxldGVzLCBzbyB0aGVcblx0ICogSVBDIGNvbnN1bWVyIGNhbiBjYXB0dXJlIHRoZSBwYWdlIHdpdGhvdXQgb3VyIG92ZXJsYXkgaW4gdGhlIGZyYW1lKS5cblx0ICovXG5cdHByaXZhdGUgX3RlYXJkb3duKCk6IHZvaWQge1xuXHRcdHRoaXMuX3NlbGVjdGlvbkFjdGl2ZSA9IGZhbHNlO1xuXHRcdHRoaXMuX3NoYWRvd0hvc3QucmVtb3ZlKCk7XG5cblx0XHR0aGlzLl9jdXJzb3JTdHlsZXNoZWV0Py5yZW1vdmUoKTtcblx0XHR0aGlzLl9jdXJzb3JTdHlsZXNoZWV0ID0gdW5kZWZpbmVkO1xuXG5cdFx0d2luZG93LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ3BvaW50ZXJtb3ZlJywgdGhpcy5fb25Qb2ludGVyTW92ZSwgdHJ1ZSk7XG5cdFx0d2luZG93LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ3BvaW50ZXJkb3duJywgdGhpcy5fb25Qb2ludGVyRG93biwgdHJ1ZSk7XG5cdFx0d2luZG93LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ3BvaW50ZXJ1cCcsIHRoaXMuX29uUG9pbnRlclVwLCB0cnVlKTtcblx0XHR3aW5kb3cucmVtb3ZlRXZlbnRMaXN0ZW5lcignY2xpY2snLCB0aGlzLl9vbkNsaWNrLCB0cnVlKTtcblx0XHR3aW5kb3cucmVtb3ZlRXZlbnRMaXN0ZW5lcignY29udGV4dG1lbnUnLCB0aGlzLl9vbkNsaWNrLCB0cnVlKTtcblx0XHR3aW5kb3cucmVtb3ZlRXZlbnRMaXN0ZW5lcigna2V5ZG93bicsIHRoaXMuX29uS2V5RG93biwgdHJ1ZSk7XG5cblx0XHR0aGlzLl9kcmFnYm94LnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0dGhpcy5fZHJhZ2JveC5zdHlsZS5sZWZ0ID0gJzBweCc7XG5cdFx0dGhpcy5fZHJhZ2JveC5zdHlsZS50b3AgPSAnMHB4Jztcblx0XHR0aGlzLl9kcmFnYm94LnN0eWxlLndpZHRoID0gJzBweCc7XG5cdFx0dGhpcy5fZHJhZ2JveC5zdHlsZS5oZWlnaHQgPSAnMHB4Jztcblx0XHR0aGlzLl9kcmFnU3RhcnQgPSB1bmRlZmluZWQ7XG5cdH1cblxuXHRzZXRUaGVtZSh0aGVtZTogSUJyb3dzZXJWaWV3VGhlbWUpOiB2b2lkIHtcblx0XHR0aGlzLl9zaGFkb3dIb3N0LnN0eWxlLnNldFByb3BlcnR5KCctLXZzY29kZS1mb2N1c0JvcmRlcicsIHRoZW1lPy5mb2N1c0JvcmRlciA/PyBudWxsKTtcblx0fVxuXG5cdHByaXZhdGUgX29uUG9pbnRlckRvd24gPSAoZTogUG9pbnRlckV2ZW50KTogdm9pZCA9PiB7XG5cdFx0aWYgKCF0aGlzLl9zZWxlY3Rpb25BY3RpdmUgfHwgZS5idXR0b24gIT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fZHJhZ1N0YXJ0ID0geyB4OiBlLmNsaWVudFgsIHk6IGUuY2xpZW50WSB9O1xuXHRcdHRoaXMuX2RyYWdib3guc3R5bGUuZGlzcGxheSA9ICdibG9jayc7XG5cdFx0dGhpcy5fZHJhZ2JveC5zdHlsZS5sZWZ0ID0gYCR7ZS5jbGllbnRYfXB4YDtcblx0XHR0aGlzLl9kcmFnYm94LnN0eWxlLnRvcCA9IGAke2UuY2xpZW50WX1weGA7XG5cdFx0dGhpcy5fZHJhZ2JveC5zdHlsZS53aWR0aCA9ICcwcHgnO1xuXHRcdHRoaXMuX2RyYWdib3guc3R5bGUuaGVpZ2h0ID0gJzBweCc7XG5cdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdH07XG5cblx0cHJpdmF0ZSBfb25Qb2ludGVyTW92ZSA9IChlOiBQb2ludGVyRXZlbnQpOiB2b2lkID0+IHtcblx0XHRpZiAoIXRoaXMuX3NlbGVjdGlvbkFjdGl2ZSB8fCAhdGhpcy5fZHJhZ1N0YXJ0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdGNvbnN0IGxlZnQgPSBNYXRoLm1pbih0aGlzLl9kcmFnU3RhcnQueCwgZS5jbGllbnRYKTtcblx0XHRjb25zdCB0b3AgPSBNYXRoLm1pbih0aGlzLl9kcmFnU3RhcnQueSwgZS5jbGllbnRZKTtcblx0XHRjb25zdCB3aWR0aCA9IE1hdGguYWJzKGUuY2xpZW50WCAtIHRoaXMuX2RyYWdTdGFydC54KTtcblx0XHRjb25zdCBoZWlnaHQgPSBNYXRoLmFicyhlLmNsaWVudFkgLSB0aGlzLl9kcmFnU3RhcnQueSk7XG5cdFx0dGhpcy5fZHJhZ2JveC5zdHlsZS5sZWZ0ID0gYCR7bGVmdH1weGA7XG5cdFx0dGhpcy5fZHJhZ2JveC5zdHlsZS50b3AgPSBgJHt0b3B9cHhgO1xuXHRcdHRoaXMuX2RyYWdib3guc3R5bGUud2lkdGggPSBgJHt3aWR0aH1weGA7XG5cdFx0dGhpcy5fZHJhZ2JveC5zdHlsZS5oZWlnaHQgPSBgJHtoZWlnaHR9cHhgO1xuXHR9O1xuXG5cdHByaXZhdGUgX29uUG9pbnRlclVwID0gKGU6IFBvaW50ZXJFdmVudCk6IHZvaWQgPT4ge1xuXHRcdGlmICghdGhpcy5fc2VsZWN0aW9uQWN0aXZlIHx8ICF0aGlzLl9kcmFnU3RhcnQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3Qgc3RhcnQgPSB0aGlzLl9kcmFnU3RhcnQ7XG5cblx0XHRjb25zdCBsZWZ0ID0gTWF0aC5taW4oc3RhcnQueCwgZS5jbGllbnRYKTtcblx0XHRjb25zdCB0b3AgPSBNYXRoLm1pbihzdGFydC55LCBlLmNsaWVudFkpO1xuXHRcdGNvbnN0IHdpZHRoID0gTWF0aC5hYnMoZS5jbGllbnRYIC0gc3RhcnQueCk7XG5cdFx0Y29uc3QgaGVpZ2h0ID0gTWF0aC5hYnMoZS5jbGllbnRZIC0gc3RhcnQueSk7XG5cblx0XHQvLyBUZWFyIGRvd24gdGhlIG92ZXJsYXkgYmVmb3JlIGNvbW1pdHRpbmcgc28gdGhlIElQQyBjb25zdW1lciBjYW5cblx0XHQvLyBpbW1lZGlhdGVseSBzdGFydCBhIHNjcmVlbnNob3Qgd2l0aG91dCBvdXIgZHJhZ2JveCBiZWluZyBpbiB0aGUgd2F5LlxuXHRcdHRoaXMuX3RlYXJkb3duKCk7XG5cblx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblxuXHRcdGlmICh3aWR0aCA8IEFyZWFQaWNrZXIuX01JTl9BUkVBX1BYIHx8IGhlaWdodCA8IEFyZWFQaWNrZXIuX01JTl9BUkVBX1BYKSB7XG5cdFx0XHR0aGlzLl9vblN0b3BwZWQoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBLZWVwIHJlY3RhbmdsZSBpbiB2aWV3cG9ydCAoY2xpZW50KSBjb29yZGluYXRlcyB0byBtYXRjaCBvdGhlciBzY3JlZW5zaG90XG5cdFx0Ly8gY2FwdHVyZSBjYWxsIHNpdGVzIHRoYXQgcGFzcyB2aWV3cG9ydC1zcGFjZSBib3VuZHMgYXMgcGFnZVJlY3QuIFRoZVxuXHRcdC8vIG1haW4tcHJvY2VzcyBjbGlwIG1hdGggKGBwYWdlUmVjdCAqIHZpc3VhbFZpZXdwb3J0U2NhbGUgKiB6b29tRmFjdG9yYClcblx0XHQvLyBtZWFzdXJlcyBmcm9tIHRoZSB2aXN1YWwgdmlld3BvcnQgb3JpZ2luLCBzbyBzdWJ0cmFjdCB0aGUgdmlzdWFsXG5cdFx0Ly8gdmlld3BvcnQncyBvZmZzZXQgKG5vbi16ZXJvIG9ubHkgd2hlbiBwaW5jaC1wYW5uZWQpIHRvIGNvbnZlcnQgbGF5b3V0LVxuXHRcdC8vIHZpZXdwb3J0IGNsaWVudCBjb29yZHMgaW50byB0aGUgc2FtZSBjb29yZCBzcGFjZSB0aGF0IEFkZCBFbGVtZW50IHRvXG5cdFx0Ly8gQ2hhdCdzIENEUCBib3gtbW9kZWwgYm91bmRzIHVzZS5cblx0XHRjb25zdCB2diA9IHdpbmRvdy52aXN1YWxWaWV3cG9ydDtcblx0XHRjb25zdCBvZmZzZXRMZWZ0ID0gdnY/Lm9mZnNldExlZnQgPz8gMDtcblx0XHRjb25zdCBvZmZzZXRUb3AgPSB2dj8ub2Zmc2V0VG9wID8/IDA7XG5cdFx0Y29uc3QgcmVjdCA9IHsgeDogbGVmdCAtIG9mZnNldExlZnQsIHk6IHRvcCAtIG9mZnNldFRvcCwgd2lkdGgsIGhlaWdodCB9O1xuXG5cdFx0Ly8gVGhlIHN5bmNocm9ub3VzIERPTSB0ZWFyZG93biBhYm92ZSBpcyB0aGUgcHJlcmVxdWlzaXRlIFx1MjAxNCB0aGUgbmV4dCBjb21wb3NpdG9yXG5cdFx0Ly8gZnJhbWUgd29uJ3QgY29udGFpbiB0aGUgb3ZlcmxheS4gV2FpdGluZyBmb3IgdGhhdCBmcmFtZSB0byBhY3R1YWxseSBsYW5kXG5cdFx0Ly8gYmVmb3JlIHJlYWRpbmcgdGhlIEdQVSBzdXJmYWNlIGlzIHRoZSBjb25zdW1lcidzIHJlc3BvbnNpYmlsaXR5IChzZWVcblx0XHQvLyBgYXdhaXROZXh0UGFpbnRgIGluIGBCcm93c2VyVmlldy5jYXB0dXJlU2NyZWVuc2hvdGApLlxuXHRcdHRoaXMuX29uUGlja2VkKHJlY3QpO1xuXHR9O1xuXG5cdHByaXZhdGUgX29uQ2xpY2sgPSAoZTogRXZlbnQpOiB2b2lkID0+IHtcblx0XHRpZiAoIXRoaXMuX3NlbGVjdGlvbkFjdGl2ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0fTtcblxuXHRwcml2YXRlIF9vbktleURvd24gPSAoZTogS2V5Ym9hcmRFdmVudCk6IHZvaWQgPT4ge1xuXHRcdGlmICghdGhpcy5fc2VsZWN0aW9uQWN0aXZlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmIChlLmtleSA9PT0gJ0VzY2FwZScpIHtcblx0XHRcdHRoaXMuc3RvcCgpO1xuXHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHR9XG5cdH07XG5cblx0cHJpdmF0ZSBzdGF0aWMgX2J1aWxkU3R5bGUoKTogSFRNTFN0eWxlRWxlbWVudCB7XG5cdFx0Y29uc3Qgc3R5bGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzdHlsZScpO1xuXHRcdHN0eWxlLnRleHRDb250ZW50ID0gYFxuXHRcdFx0Omhvc3Qge1xuXHRcdFx0XHRhbGw6IGluaXRpYWw7XG5cdFx0XHRcdHBvaW50ZXItZXZlbnRzOiBub25lICFpbXBvcnRhbnQ7XG5cdFx0XHR9XG5cdFx0XHQub3ZlcmxheSB7XG5cdFx0XHRcdHBvc2l0aW9uOiBmaXhlZDsgaW5zZXQ6IDA7XG5cdFx0XHRcdGJhY2tncm91bmQ6IHRyYW5zcGFyZW50O1xuXHRcdFx0XHR6LWluZGV4OiAxO1xuXHRcdFx0XHQvKiBDYXB0dXJlIGhpdC10ZXN0aW5nIHNvIHBvaW50ZXIgZXZlbnRzIGRvbid0IHJlYWNoIHRoZSB1bmRlcmx5aW5nXG5cdFx0XHRcdCAqIHBhZ2UgZHVyaW5nIGEgcGljayBcdTIwMTQgb3RoZXJ3aXNlIGhvdmVyLzpob3ZlciBzdHlsZXMgd291bGRcblx0XHRcdFx0ICogZmlyZSBvbiBlbGVtZW50cyBiZW5lYXRoIHRoZSBjdXJzb3Igd2hpbGUgd2UncmUgZHJhZ2dpbmcuICovXG5cdFx0XHRcdHBvaW50ZXItZXZlbnRzOiBhdXRvO1xuXHRcdFx0fVxuXHRcdFx0LmRyYWdib3gge1xuXHRcdFx0XHRwb3NpdGlvbjogZml4ZWQ7IGJveC1zaXppbmc6IGJvcmRlci1ib3g7XG5cdFx0XHRcdGJvcmRlcjogMXB4IGRhc2hlZCB2YXIoLS12c2NvZGUtZm9jdXNCb3JkZXIsICMwMDc4ZDQpO1xuXHRcdFx0XHRiYWNrZ3JvdW5kOiBjb2xvci1taXgoaW4gc3JnYiwgdmFyKC0tdnNjb2RlLWZvY3VzQm9yZGVyLCAjMDA3OGQ0KSAxMiUsIHRyYW5zcGFyZW50KTtcblx0XHRcdFx0ei1pbmRleDogMjtcblx0XHRcdFx0cG9pbnRlci1ldmVudHM6IGF1dG87XG5cdFx0XHR9XG5cdFx0YDtcblx0XHRyZXR1cm4gc3R5bGU7XG5cdH1cbn1cblxuaW5pdCgpO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBV0EsTUFBTSw4QkFBOEI7QUFDcEMsSUFBSSxtQkFBd0Q7QUFBQSxFQUMzRCxZQUFZO0FBQUEsRUFDWix1QkFBdUI7QUFBQSxFQUN2QiwwQkFBMEI7QUFBQSxFQUMxQixnQkFBZ0I7QUFBQSxFQUNoQix3QkFB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O0FBQ2xGLFdBQUssWUFBWSxPQUFPO0FBQUEsSUFDekI7QUFBQSxFQUNEO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFZQSxPQUFlLGNBQWdDO0FBQzlDLFVBQU0sUUFBUSxTQUFTLGNBQWMsT0FBTztBQUM1QyxVQUFNLGNBQWM7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFB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
