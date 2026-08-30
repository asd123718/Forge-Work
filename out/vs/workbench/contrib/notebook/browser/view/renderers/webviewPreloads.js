async function webviewPreloads(ctx) {
  const userAgent = navigator.userAgent;
  const isChrome = userAgent.indexOf("Chrome") >= 0;
  const textEncoder = new TextEncoder();
  const textDecoder = new TextDecoder();
  function promiseWithResolvers() {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  }
  let currentOptions = ctx.options;
  const isWorkspaceTrusted = ctx.isWorkspaceTrusted;
  let currentRenderOptions = ctx.renderOptions;
  const settingChange = createEmitter();
  const acquireVsCodeApi = globalThis.acquireVsCodeApi;
  const vscode = acquireVsCodeApi();
  delete globalThis.acquireVsCodeApi;
  const tokenizationStyle = new CSSStyleSheet();
  tokenizationStyle.replaceSync(ctx.style.tokenizationCss);
  const runWhenIdle = typeof requestIdleCallback !== "function" || typeof cancelIdleCallback !== "function" ? (runner) => {
    setTimeout(() => {
      if (disposed) {
        return;
      }
      const end = Date.now() + 15;
      runner(Object.freeze({
        didTimeout: true,
        timeRemaining() {
          return Math.max(0, end - Date.now());
        }
      }));
    });
    let disposed = false;
    return {
      dispose() {
        if (disposed) {
          return;
        }
        disposed = true;
      }
    };
  } : (runner, timeout) => {
    const handle = requestIdleCallback(runner, typeof timeout === "number" ? { timeout } : void 0);
    let disposed = false;
    return {
      dispose() {
        if (disposed) {
          return;
        }
        disposed = true;
        cancelIdleCallback(handle);
      }
    };
  };
  function getOutputContainer(event) {
    for (const node of event.composedPath()) {
      if (node instanceof HTMLElement && node.classList.contains("output")) {
        return {
          id: node.id
        };
      }
    }
    return;
  }
  let lastFocusedOutput = void 0;
  const handleOutputFocusOut = (event) => {
    const outputFocus = event && getOutputContainer(event);
    if (!outputFocus) {
      return;
    }
    lastFocusedOutput = void 0;
    setTimeout(() => {
      if (lastFocusedOutput?.id === outputFocus.id) {
        return;
      }
      postNotebookMessage("outputBlur", outputFocus);
    }, 0);
  };
  const hasActiveEditableElement = (parent, root = document) => {
    const element = root.activeElement;
    return !!(element && parent.contains(element) && (element.matches(":read-write") || element.tagName.toLowerCase() === "select" || element.shadowRoot && hasActiveEditableElement(element.shadowRoot, element.shadowRoot)));
  };
  const checkOutputInputFocus = (e) => {
    lastFocusedOutput = getOutputContainer(e);
    const activeElement = window.document.activeElement;
    if (!activeElement) {
      return;
    }
    const id = lastFocusedOutput?.id;
    if (id && hasActiveEditableElement(activeElement, window.document)) {
      postNotebookMessage("outputInputFocus", { inputFocused: true, id });
      activeElement.addEventListener("blur", () => {
        postNotebookMessage("outputInputFocus", { inputFocused: false, id });
      }, { once: true });
    }
  };
  const handleInnerClick = (event) => {
    if (!event || !event.view || !event.view.document) {
      return;
    }
    const outputFocus = lastFocusedOutput = getOutputContainer(event);
    for (const node of event.composedPath()) {
      if (node instanceof HTMLAnchorElement && node.href) {
        if (node.href.startsWith("blob:")) {
          if (outputFocus) {
            postNotebookMessage("outputFocus", outputFocus);
          }
          handleBlobUrlClick(node.href, node.download);
        } else if (node.href.startsWith("data:")) {
          if (outputFocus) {
            postNotebookMessage("outputFocus", outputFocus);
          }
          handleDataUrl(node.href, node.download);
        } else if (node.getAttribute("href")?.trim().startsWith("#")) {
          if (!node.hash) {
            postNotebookMessage("scroll-to-reveal", { scrollTop: 0 });
            return;
          }
          const targetId = node.hash.substring(1);
          let scrollTarget = event.view.document.getElementById(targetId);
          if (!scrollTarget) {
            for (const preview of event.view.document.querySelectorAll(".preview")) {
              scrollTarget = preview.shadowRoot?.getElementById(targetId);
              if (scrollTarget) {
                break;
              }
            }
          }
          if (scrollTarget) {
            const scrollTop = scrollTarget.getBoundingClientRect().top + event.view.scrollY;
            postNotebookMessage("scroll-to-reveal", { scrollTop });
            return;
          }
        } else {
          const href = node.getAttribute("href");
          if (href) {
            if (href.startsWith("command:") && outputFocus) {
              postNotebookMessage("outputFocus", outputFocus);
            }
            postNotebookMessage("clicked-link", { href });
          }
        }
        event.preventDefault();
        event.stopPropagation();
        return;
      }
    }
    if (outputFocus) {
      postNotebookMessage("outputFocus", outputFocus);
    }
  };
  const blurOutput = () => {
    const selection = window.getSelection();
    if (!selection) {
      return;
    }
    selection.removeAllRanges();
  };
  const selectOutputContents = (cellOrOutputId) => {
    const selection = window.getSelection();
    if (!selection) {
      return;
    }
    const cellOutputContainer = window.document.getElementById(cellOrOutputId);
    if (!cellOutputContainer) {
      return;
    }
    selection.removeAllRanges();
    const range = document.createRange();
    range.selectNode(cellOutputContainer);
    selection.addRange(range);
  };
  const selectInputContents = (cellOrOutputId) => {
    const cellOutputContainer = window.document.getElementById(cellOrOutputId);
    if (!cellOutputContainer) {
      return;
    }
    const activeElement = window.document.activeElement;
    if (activeElement && hasActiveEditableElement(activeElement, window.document)) {
      activeElement.select();
    }
  };
  const onPageUpDownSelectionHandler = (e) => {
    if (!lastFocusedOutput?.id || !e.shiftKey) {
      return;
    }
    if (e.shiftKey && (e.code === "ArrowUp" || e.code === "ArrowDown")) {
      e.stopPropagation();
      return;
    }
    if (!(e.code === "PageUp" || e.code === "PageDown") && !(e.metaKey && (e.code === "ArrowDown" || e.code === "ArrowUp"))) {
      return;
    }
    const outputContainer = window.document.getElementById(lastFocusedOutput.id);
    const selection = window.getSelection();
    if (!outputContainer || !selection?.anchorNode) {
      return;
    }
    const activeElement = window.document.activeElement;
    if (activeElement && hasActiveEditableElement(activeElement, window.document)) {
      return;
    }
    e.stopPropagation();
    e.preventDefault();
    const { anchorNode, anchorOffset } = selection;
    const range = document.createRange();
    if (e.code === "PageDown" || e.code === "ArrowDown") {
      range.setStart(anchorNode, anchorOffset);
      range.setEnd(outputContainer, 1);
    } else {
      range.setStart(outputContainer, 0);
      range.setEnd(anchorNode, anchorOffset);
    }
    selection.removeAllRanges();
    selection.addRange(range);
  };
  const disableNativeSelectAll = (e) => {
    if (!lastFocusedOutput?.id) {
      return;
    }
    const activeElement = window.document.activeElement;
    if (activeElement && hasActiveEditableElement(activeElement, window.document)) {
      return;
    }
    if (e.key === "a" && e.ctrlKey || e.metaKey && e.key === "a") {
      e.preventDefault();
      return;
    }
  };
  const handleDataUrl = async (data, downloadName) => {
    postNotebookMessage("clicked-data-url", {
      data,
      downloadName
    });
  };
  const handleBlobUrlClick = async (url, downloadName) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const reader = new FileReader();
      reader.addEventListener("load", () => {
        handleDataUrl(reader.result, downloadName);
      });
      reader.readAsDataURL(blob);
    } catch (e) {
      console.error(e.message);
    }
  };
  window.document.body.addEventListener("click", handleInnerClick);
  window.document.body.addEventListener("focusin", checkOutputInputFocus);
  window.document.body.addEventListener("focusout", handleOutputFocusOut);
  window.document.body.addEventListener("keydown", onPageUpDownSelectionHandler);
  window.document.body.addEventListener("keydown", disableNativeSelectAll);
  function createKernelContext() {
    return Object.freeze({
      onDidReceiveKernelMessage: onDidReceiveKernelMessage.event,
      postKernelMessage: (data) => postNotebookMessage("customKernelMessage", { message: data })
    });
  }
  async function runKernelPreload(url) {
    try {
      return await activateModuleKernelPreload(url);
    } catch (e) {
      console.error(e);
      throw e;
    }
  }
  async function activateModuleKernelPreload(url) {
    const module = await __import(url);
    if (!module.activate) {
      console.error(`Notebook preload '${url}' was expected to be a module but it does not export an 'activate' function`);
      return;
    }
    return module.activate(createKernelContext());
  }
  const dimensionUpdater = new class {
    constructor() {
      this.pending = /* @__PURE__ */ new Map();
    }
    updateHeight(id, height, options) {
      if (!this.pending.size) {
        setTimeout(() => {
          this.updateImmediately();
        }, 0);
      }
      const update = this.pending.get(id);
      if (update && update.isOutput) {
        this.pending.set(id, {
          id,
          height,
          init: update.init,
          isOutput: update.isOutput
        });
      } else {
        this.pending.set(id, {
          id,
          height,
          ...options
        });
      }
    }
    updateImmediately() {
      if (!this.pending.size) {
        return;
      }
      postNotebookMessage("dimension", {
        updates: Array.from(this.pending.values())
      });
      this.pending.clear();
    }
  }();
  function elementHasContent(height) {
    return height > 2.1;
  }
  const resizeObserver = new class {
    constructor() {
      this._observedElements = /* @__PURE__ */ new WeakMap();
      this._observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
          if (!window.document.body.contains(entry.target)) {
            continue;
          }
          const observedElementInfo = this._observedElements.get(entry.target);
          if (!observedElementInfo) {
            continue;
          }
          this.postResizeMessage(observedElementInfo.cellId);
          if (entry.target.id !== observedElementInfo.id) {
            continue;
          }
          if (!entry.contentRect) {
            continue;
          }
          if (!observedElementInfo.output) {
            this.updateHeight(observedElementInfo, entry.target.offsetHeight);
            continue;
          }
          const hasContent = elementHasContent(entry.contentRect.height);
          const shouldUpdatePadding = hasContent && observedElementInfo.lastKnownPadding === 0 || !hasContent && observedElementInfo.lastKnownPadding !== 0;
          if (shouldUpdatePadding) {
            window.requestAnimationFrame(() => {
              if (hasContent) {
                entry.target.style.padding = `${ctx.style.outputNodePadding}px ${ctx.style.outputNodePadding}px ${ctx.style.outputNodePadding}px ${ctx.style.outputNodeLeftPadding}px`;
              } else {
                entry.target.style.padding = `0px`;
              }
              this.updateHeight(observedElementInfo, hasContent ? entry.target.offsetHeight : 0);
            });
          } else {
            this.updateHeight(observedElementInfo, hasContent ? entry.target.offsetHeight : 0);
          }
        }
      });
    }
    updateHeight(observedElementInfo, offsetHeight) {
      if (observedElementInfo.lastKnownHeight !== offsetHeight) {
        observedElementInfo.lastKnownHeight = offsetHeight;
        dimensionUpdater.updateHeight(observedElementInfo.id, offsetHeight, {
          isOutput: observedElementInfo.output
        });
      }
    }
    observe(container, id, output, cellId) {
      if (this._observedElements.has(container)) {
        return;
      }
      this._observedElements.set(container, { id, output, lastKnownPadding: ctx.style.outputNodePadding, lastKnownHeight: -1, cellId });
      this._observer.observe(container);
    }
    postResizeMessage(cellId) {
      clearTimeout(this._outputResizeTimer);
      this._outputResizeTimer = setTimeout(() => {
        postNotebookMessage("outputResized", {
          cellId
        });
      }, 250);
    }
  }();
  let previousDelta;
  let scrollTimeout;
  let scrolledElement;
  let lastTimeScrolled;
  function flagRecentlyScrolled(node, deltaY) {
    scrolledElement = node;
    if (deltaY === void 0) {
      lastTimeScrolled = Date.now();
      previousDelta = void 0;
      node.setAttribute("recentlyScrolled", "true");
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        scrolledElement?.removeAttribute("recentlyScrolled");
      }, 300);
      return true;
    }
    if (node.hasAttribute("recentlyScrolled")) {
      if (lastTimeScrolled && Date.now() - lastTimeScrolled > 400) {
        if (!!previousDelta && deltaY < 0 && deltaY < previousDelta - 8) {
          clearTimeout(scrollTimeout);
          scrolledElement?.removeAttribute("recentlyScrolled");
          return false;
        } else if (!!previousDelta && deltaY > 0 && deltaY > previousDelta + 8) {
          clearTimeout(scrollTimeout);
          scrolledElement?.removeAttribute("recentlyScrolled");
          return false;
        }
        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(() => {
          scrolledElement?.removeAttribute("recentlyScrolled");
        }, 50);
      } else {
        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(() => {
          scrolledElement?.removeAttribute("recentlyScrolled");
        }, 300);
      }
      previousDelta = deltaY;
      return true;
    }
    return false;
  }
  function eventTargetShouldHandleScroll(event) {
    for (let node = event.target; node; node = node.parentNode) {
      if (!(node instanceof Element) || node.id === "container" || node.classList.contains("cell_container") || node.classList.contains("markup") || node.classList.contains("output_container")) {
        return false;
      }
      if (event.deltaY < 0 && node.scrollTop > 0) {
        flagRecentlyScrolled(node);
        return true;
      }
      if (event.deltaY > 0 && node.scrollTop + node.clientHeight < node.scrollHeight) {
        if (node.scrollHeight - node.scrollTop - node.clientHeight < 2) {
          continue;
        }
        if (window.getComputedStyle(node).overflowY === "hidden" || window.getComputedStyle(node).overflowY === "visible") {
          continue;
        }
        flagRecentlyScrolled(node);
        return true;
      }
      if (flagRecentlyScrolled(node, event.deltaY)) {
        return true;
      }
    }
    return false;
  }
  const handleWheel = (event) => {
    if (event.defaultPrevented || eventTargetShouldHandleScroll(event)) {
      return;
    }
    postNotebookMessage("did-scroll-wheel", {
      payload: {
        deltaMode: event.deltaMode,
        deltaX: event.deltaX,
        deltaY: event.deltaY,
        deltaZ: event.deltaZ,
        // Refs https://github.com/microsoft/vscode/issues/146403#issuecomment-1854538928
        wheelDelta: event.wheelDelta && isChrome ? event.wheelDelta / window.devicePixelRatio : event.wheelDelta,
        wheelDeltaX: event.wheelDeltaX && isChrome ? event.wheelDeltaX / window.devicePixelRatio : event.wheelDeltaX,
        wheelDeltaY: event.wheelDeltaY && isChrome ? event.wheelDeltaY / window.devicePixelRatio : event.wheelDeltaY,
        detail: event.detail,
        shiftKey: event.shiftKey,
        type: event.type
      }
    });
  };
  function focusFirstFocusableOrContainerInOutput(cellOrOutputId, alternateId) {
    const cellOutputContainer = window.document.getElementById(cellOrOutputId) ?? (!!alternateId ? window.document.getElementById(alternateId) : void 0);
    if (!!cellOutputContainer) {
      if (cellOutputContainer.contains(window.document.activeElement)) {
        return;
      }
      let focusableElement = cellOutputContainer.querySelector('[tabindex="0"], [href], button, input, option, select, textarea');
      if (!focusableElement) {
        focusableElement = cellOutputContainer;
        focusableElement.tabIndex = -1;
      }
      if (lastFocusedOutput?.id !== cellOutputContainer.id) {
        lastFocusedOutput = cellOutputContainer;
        postNotebookMessage("outputFocus", { id: cellOutputContainer.id });
      }
      focusableElement.focus();
    }
  }
  function createFocusSink(cellId, focusNext) {
    const element = document.createElement("div");
    element.id = `focus-sink-${cellId}`;
    element.tabIndex = 0;
    element.addEventListener("focus", () => {
      postNotebookMessage("focus-editor", {
        cellId,
        focusNext
      });
    });
    return element;
  }
  function _internalHighlightRange(range, tagName = "mark", attributes = {}) {
    function _textNodesInRange(range2) {
      if (!range2.startContainer.ownerDocument) {
        return [];
      }
      if (range2.startContainer.nodeType === Node.TEXT_NODE && range2.startOffset > 0) {
        const startContainer = range2.startContainer;
        const endOffset = range2.endOffset;
        const createdNode = startContainer.splitText(range2.startOffset);
        if (range2.endContainer === startContainer) {
          range2.setEnd(createdNode, endOffset - range2.startOffset);
        }
        range2.setStart(createdNode, 0);
      }
      if (range2.endContainer.nodeType === Node.TEXT_NODE && range2.endOffset < range2.endContainer.length) {
        range2.endContainer.splitText(range2.endOffset);
      }
      const walker = range2.startContainer.ownerDocument.createTreeWalker(
        range2.commonAncestorContainer,
        NodeFilter.SHOW_TEXT,
        (node) => range2.intersectsNode(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT
      );
      walker.currentNode = range2.startContainer;
      const nodes2 = [];
      if (walker.currentNode.nodeType === Node.TEXT_NODE) {
        nodes2.push(walker.currentNode);
      }
      while (walker.nextNode() && range2.comparePoint(walker.currentNode, 0) !== 1) {
        if (walker.currentNode.nodeType === Node.TEXT_NODE) {
          nodes2.push(walker.currentNode);
        }
      }
      return nodes2;
    }
    function wrapNodeInHighlight(node, tagName2, attributes2) {
      const highlightElement = node.ownerDocument.createElement(tagName2);
      Object.keys(attributes2).forEach((key) => {
        highlightElement.setAttribute(key, attributes2[key]);
      });
      const tempRange = node.ownerDocument.createRange();
      tempRange.selectNode(node);
      tempRange.surroundContents(highlightElement);
      return highlightElement;
    }
    if (range.collapsed) {
      return {
        remove: () => {
        },
        update: () => {
        }
      };
    }
    const nodes = _textNodesInRange(range);
    const highlightElements = [];
    for (const nodeIdx in nodes) {
      const highlightElement = wrapNodeInHighlight(nodes[nodeIdx], tagName, attributes);
      highlightElements.push(highlightElement);
    }
    function _removeHighlight(highlightElement) {
      if (highlightElement.childNodes.length === 1) {
        highlightElement.replaceWith(highlightElement.firstChild);
      } else {
        while (highlightElement.firstChild) {
          highlightElement.parentNode?.insertBefore(highlightElement.firstChild, highlightElement);
        }
        highlightElement.remove();
      }
    }
    function _removeHighlights() {
      for (const highlightIdx in highlightElements) {
        _removeHighlight(highlightElements[highlightIdx]);
      }
    }
    function _updateHighlight(highlightElement, attributes2 = {}) {
      Object.keys(attributes2).forEach((key) => {
        highlightElement.setAttribute(key, attributes2[key]);
      });
    }
    function updateHighlights(attributes2) {
      for (const highlightIdx in highlightElements) {
        _updateHighlight(highlightElements[highlightIdx], attributes2);
      }
    }
    return {
      remove: _removeHighlights,
      update: updateHighlights
    };
  }
  function selectRange(_range) {
    const sel = window.getSelection();
    if (sel) {
      try {
        sel.removeAllRanges();
        const r = document.createRange();
        r.setStart(_range.startContainer, _range.startOffset);
        r.setEnd(_range.endContainer, _range.endOffset);
        sel.addRange(r);
      } catch (e) {
        console.log(e);
      }
    }
  }
  function highlightRange(range, useCustom, tagName = "mark", attributes = {}) {
    if (useCustom) {
      const ret = _internalHighlightRange(range, tagName, attributes);
      return {
        range,
        dispose: ret.remove,
        update: (color, className) => {
          if (className === void 0) {
            ret.update({
              "style": `background-color: ${color}`
            });
          } else {
            ret.update({
              "class": className
            });
          }
        }
      };
    } else {
      window.document.execCommand("hiliteColor", false, matchColor);
      const cloneRange = window.getSelection().getRangeAt(0).cloneRange();
      const _range = {
        collapsed: cloneRange.collapsed,
        commonAncestorContainer: cloneRange.commonAncestorContainer,
        endContainer: cloneRange.endContainer,
        endOffset: cloneRange.endOffset,
        startContainer: cloneRange.startContainer,
        startOffset: cloneRange.startOffset
      };
      return {
        range: _range,
        dispose: () => {
          selectRange(_range);
          try {
            document.designMode = "On";
            window.document.execCommand("removeFormat", false, void 0);
            document.designMode = "Off";
            window.getSelection()?.removeAllRanges();
          } catch (e) {
            console.log(e);
          }
        },
        update: (color, className) => {
          selectRange(_range);
          try {
            document.designMode = "On";
            window.document.execCommand("removeFormat", false, void 0);
            window.document.execCommand("hiliteColor", false, color);
            document.designMode = "Off";
            window.getSelection()?.removeAllRanges();
          } catch (e) {
            console.log(e);
          }
        }
      };
    }
  }
  function createEmitter(listenerChange = () => void 0) {
    const listeners = /* @__PURE__ */ new Set();
    return {
      fire(data) {
        for (const listener of [...listeners]) {
          listener.fn.call(listener.thisArg, data);
        }
      },
      event(fn, thisArg, disposables) {
        const listenerObj = { fn, thisArg };
        const disposable = {
          dispose: () => {
            listeners.delete(listenerObj);
            listenerChange(listeners);
          }
        };
        listeners.add(listenerObj);
        listenerChange(listeners);
        if (disposables instanceof Array) {
          disposables.push(disposable);
        } else if (disposables) {
          disposables.add(disposable);
        }
        return disposable;
      }
    };
  }
  function showRenderError(errorText, outputNode, errors) {
    outputNode.innerText = errorText;
    const errList = document.createElement("ul");
    for (const result of errors) {
      console.error(result);
      const item = document.createElement("li");
      item.innerText = result.message;
      errList.appendChild(item);
    }
    outputNode.appendChild(errList);
  }
  const outputItemRequests = new class {
    constructor() {
      this._requestPool = 0;
      this._requests = /* @__PURE__ */ new Map();
    }
    getOutputItem(outputId, mime) {
      const requestId = this._requestPool++;
      const { promise, resolve } = promiseWithResolvers();
      this._requests.set(requestId, { resolve });
      postNotebookMessage("getOutputItem", { requestId, outputId, mime });
      return promise;
    }
    resolveOutputItem(requestId, output) {
      const request = this._requests.get(requestId);
      if (!request) {
        return;
      }
      this._requests.delete(requestId);
      request.resolve(output);
    }
  }();
  let hasWarnedAboutAllOutputItemsProposal = false;
  function createOutputItem(id, mime, metadata, valueBytes, allOutputItemData, appended) {
    function create(id2, mime2, metadata2, valueBytes2, appended2) {
      return Object.freeze({
        id: id2,
        mime: mime2,
        metadata: metadata2,
        appendedText() {
          if (appended2) {
            return textDecoder.decode(appended2.valueBytes);
          }
          return void 0;
        },
        data() {
          return valueBytes2;
        },
        text() {
          return textDecoder.decode(valueBytes2);
        },
        json() {
          return JSON.parse(this.text());
        },
        blob() {
          return new Blob([valueBytes2], { type: this.mime });
        },
        get _allOutputItems() {
          if (!hasWarnedAboutAllOutputItemsProposal) {
            hasWarnedAboutAllOutputItemsProposal = true;
            console.warn(`'_allOutputItems' is proposed API. DO NOT ship an extension that depends on it!`);
          }
          return allOutputItemList;
        }
      });
    }
    const allOutputItemCache = /* @__PURE__ */ new Map();
    const allOutputItemList = Object.freeze(allOutputItemData.map((outputItem) => {
      const mime2 = outputItem.mime;
      return Object.freeze({
        mime: mime2,
        getItem() {
          const existingTask = allOutputItemCache.get(mime2);
          if (existingTask) {
            return existingTask;
          }
          const task = outputItemRequests.getOutputItem(id, mime2).then((item2) => {
            return item2 ? create(id, item2.mime, metadata, item2.valueBytes) : void 0;
          });
          allOutputItemCache.set(mime2, task);
          return task;
        }
      });
    }));
    const item = create(id, mime, metadata, valueBytes, appended);
    allOutputItemCache.set(mime, Promise.resolve(item));
    return item;
  }
  const onDidReceiveKernelMessage = createEmitter();
  const ttPolicy = window.trustedTypes?.createPolicy("notebookRenderer", {
    createHTML: (value) => value,
    // CodeQL [SM03712] The rendered content is provided by renderer extensions, which are responsible for sanitizing their content themselves. The notebook webview is also sandboxed.
    createScript: (value) => value
    // CodeQL [SM03712] The rendered content is provided by renderer extensions, which are responsible for sanitizing their content themselves. The notebook webview is also sandboxed.
  });
  window.addEventListener("wheel", handleWheel);
  const matchColor = window.getComputedStyle(window.document.getElementById("_defaultColorPalatte")).color;
  const currentMatchColor = window.getComputedStyle(window.document.getElementById("_defaultColorPalatte")).backgroundColor;
  class JSHighlighter {
    constructor() {
      this._activeHighlightInfo = /* @__PURE__ */ new Map();
    }
    addHighlights(matches, ownerID) {
      for (let i = matches.length - 1; i >= 0; i--) {
        const match = matches[i];
        const ret = highlightRange(match.originalRange, true, "mark", match.isShadow ? {
          "style": "background-color: " + matchColor + ";"
        } : {
          "class": "find-match"
        });
        match.highlightResult = ret;
      }
      const highlightInfo = {
        matches,
        currentMatchIndex: -1
      };
      this._activeHighlightInfo.set(ownerID, highlightInfo);
    }
    removeHighlights(ownerID) {
      this._activeHighlightInfo.get(ownerID)?.matches.forEach((match) => {
        match.highlightResult?.dispose();
      });
      this._activeHighlightInfo.delete(ownerID);
    }
    highlightCurrentMatch(index, ownerID) {
      const highlightInfo = this._activeHighlightInfo.get(ownerID);
      if (!highlightInfo) {
        console.error("Modified current highlight match before adding highlight list.");
        return;
      }
      const oldMatch = highlightInfo.matches[highlightInfo.currentMatchIndex];
      oldMatch?.highlightResult?.update(matchColor, oldMatch.isShadow ? void 0 : "find-match");
      const match = highlightInfo.matches[index];
      highlightInfo.currentMatchIndex = index;
      const sel = window.getSelection();
      if (!!match && !!sel && match.highlightResult) {
        let offset = 0;
        try {
          const outputOffset = window.document.getElementById(match.id).getBoundingClientRect().top;
          const tempRange = document.createRange();
          tempRange.selectNode(match.highlightResult.range.startContainer);
          match.highlightResult.range.startContainer.parentElement?.scrollIntoView({ behavior: "auto", block: "end", inline: "nearest" });
          const rangeOffset = tempRange.getBoundingClientRect().top;
          tempRange.detach();
          offset = rangeOffset - outputOffset;
        } catch (e) {
          console.error(e);
        }
        match.highlightResult?.update(currentMatchColor, match.isShadow ? void 0 : "current-find-match");
        window.document.getSelection()?.removeAllRanges();
        postNotebookMessage("didFindHighlightCurrent", {
          offset
        });
      }
    }
    unHighlightCurrentMatch(index, ownerID) {
      const highlightInfo = this._activeHighlightInfo.get(ownerID);
      if (!highlightInfo) {
        return;
      }
      const oldMatch = highlightInfo.matches[index];
      if (oldMatch && oldMatch.highlightResult) {
        oldMatch.highlightResult.update(matchColor, oldMatch.isShadow ? void 0 : "find-match");
      }
    }
    dispose() {
      window.document.getSelection()?.removeAllRanges();
      this._activeHighlightInfo.forEach((highlightInfo) => {
        highlightInfo.matches.forEach((match) => {
          match.highlightResult?.dispose();
        });
      });
    }
  }
  class CSSHighlighter {
    constructor() {
      this._activeHighlightInfo = /* @__PURE__ */ new Map();
      this._matchesHighlight = new Highlight();
      this._matchesHighlight.priority = 1;
      this._currentMatchesHighlight = new Highlight();
      this._currentMatchesHighlight.priority = 2;
      CSS.highlights?.set(`find-highlight`, this._matchesHighlight);
      CSS.highlights?.set(`current-find-highlight`, this._currentMatchesHighlight);
    }
    _refreshRegistry(updateMatchesHighlight = true) {
      if (updateMatchesHighlight) {
        this._matchesHighlight.clear();
      }
      this._currentMatchesHighlight.clear();
      this._activeHighlightInfo.forEach((highlightInfo) => {
        if (updateMatchesHighlight) {
          for (let i = 0; i < highlightInfo.matches.length; i++) {
            this._matchesHighlight.add(highlightInfo.matches[i].originalRange);
          }
        }
        if (highlightInfo.currentMatchIndex < highlightInfo.matches.length && highlightInfo.currentMatchIndex >= 0) {
          this._currentMatchesHighlight.add(highlightInfo.matches[highlightInfo.currentMatchIndex].originalRange);
        }
      });
    }
    addHighlights(matches, ownerID) {
      for (let i = 0; i < matches.length; i++) {
        this._matchesHighlight.add(matches[i].originalRange);
      }
      const newEntry = {
        matches,
        currentMatchIndex: -1
      };
      this._activeHighlightInfo.set(ownerID, newEntry);
    }
    highlightCurrentMatch(index, ownerID) {
      const highlightInfo = this._activeHighlightInfo.get(ownerID);
      if (!highlightInfo) {
        console.error("Modified current highlight match before adding highlight list.");
        return;
      }
      highlightInfo.currentMatchIndex = index;
      const match = highlightInfo.matches[index];
      if (match) {
        let offset = 0;
        try {
          const outputOffset = window.document.getElementById(match.id).getBoundingClientRect().top;
          match.originalRange.startContainer.parentElement?.scrollIntoView({ behavior: "auto", block: "end", inline: "nearest" });
          const rangeOffset = match.originalRange.getBoundingClientRect().top;
          offset = rangeOffset - outputOffset;
          postNotebookMessage("didFindHighlightCurrent", {
            offset
          });
        } catch (e) {
          console.error(e);
        }
      }
      this._refreshRegistry(false);
    }
    unHighlightCurrentMatch(index, ownerID) {
      const highlightInfo = this._activeHighlightInfo.get(ownerID);
      if (!highlightInfo) {
        return;
      }
      highlightInfo.currentMatchIndex = -1;
    }
    removeHighlights(ownerID) {
      this._activeHighlightInfo.delete(ownerID);
      this._refreshRegistry();
    }
    dispose() {
      window.document.getSelection()?.removeAllRanges();
      this._currentMatchesHighlight.clear();
      this._matchesHighlight.clear();
    }
  }
  const _highlighter = CSS.highlights ? new CSSHighlighter() : new JSHighlighter();
  function extractSelectionLine(selection) {
    const range = selection.getRangeAt(0);
    const oldRange = range.cloneRange();
    const captureLength = selection.toString().length;
    selection.collapseToStart();
    selection.modify("move", "backward", "lineboundary");
    selection.modify("extend", "forward", "lineboundary");
    const line = selection.toString();
    const rangeStart = getStartOffset(selection.getRangeAt(0), oldRange);
    const lineRange = {
      start: rangeStart,
      end: rangeStart + captureLength
    };
    selection.removeAllRanges();
    selection.addRange(oldRange);
    return { line, range: lineRange };
  }
  function getStartOffset(lineRange, originalRange) {
    const firstCommonAncestor = findFirstCommonAncestor(lineRange.startContainer, originalRange.startContainer);
    const selectionOffset = getSelectionOffsetRelativeTo(firstCommonAncestor, lineRange.startContainer) + lineRange.startOffset;
    const textOffset = getSelectionOffsetRelativeTo(firstCommonAncestor, originalRange.startContainer) + originalRange.startOffset;
    return textOffset - selectionOffset;
  }
  function findFirstCommonAncestor(nodeA, nodeB) {
    const range = new Range();
    range.setStart(nodeA, 0);
    range.setEnd(nodeB, 0);
    return range.commonAncestorContainer;
  }
  function getTextContentLength(node) {
    let length = 0;
    if (node.nodeType === Node.TEXT_NODE) {
      length += node.textContent?.length || 0;
    } else {
      for (const childNode of node.childNodes) {
        length += getTextContentLength(childNode);
      }
    }
    return length;
  }
  function getSelectionOffsetRelativeTo(parentElement, currentNode) {
    if (!currentNode) {
      return 0;
    }
    let offset = 0;
    if (currentNode === parentElement || !parentElement.contains(currentNode)) {
      return offset;
    }
    let prevSibling = currentNode.previousSibling;
    while (prevSibling) {
      offset += getTextContentLength(prevSibling);
      prevSibling = prevSibling.previousSibling;
    }
    return offset + getSelectionOffsetRelativeTo(parentElement, currentNode.parentNode);
  }
  const find = (query, options) => {
    let find2 = true;
    let matches = [];
    const range = document.createRange();
    range.selectNodeContents(window.document.getElementById("findStart"));
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    viewModel.toggleDragDropEnabled(false);
    try {
      document.designMode = "On";
      while (find2 && matches.length < 500) {
        find2 = window.find(
          query,
          /* caseSensitive*/
          !!options.caseSensitive,
          /* backwards*/
          false,
          /* wrapAround*/
          false,
          /* wholeWord */
          !!options.wholeWord,
          /* searchInFrames*/
          true,
          false
        );
        if (find2) {
          const selection = window.getSelection();
          if (!selection) {
            console.log("no selection");
            break;
          }
          if (options.includeMarkup && selection.rangeCount > 0 && selection.getRangeAt(0).startContainer.nodeType === 1 && selection.getRangeAt(0).startContainer.classList.contains("markup")) {
            const preview = selection.anchorNode?.firstChild;
            const root = preview.shadowRoot;
            const shadowSelection = root?.getSelection ? root?.getSelection() : null;
            if (shadowSelection && shadowSelection.anchorNode) {
              matches.push({
                type: "preview",
                id: preview.id,
                cellId: preview.id,
                container: preview,
                isShadow: true,
                originalRange: shadowSelection.getRangeAt(0),
                searchPreviewInfo: options.shouldGetSearchPreviewInfo ? extractSelectionLine(shadowSelection) : void 0
              });
            }
          }
          if (options.includeOutput && selection.rangeCount > 0 && selection.getRangeAt(0).startContainer.nodeType === 1 && selection.getRangeAt(0).startContainer.classList.contains("output_container")) {
            const cellId = selection.getRangeAt(0).startContainer.parentElement.id;
            const outputNode = selection.anchorNode?.firstChild;
            const root = outputNode.shadowRoot;
            const shadowSelection = root?.getSelection ? root?.getSelection() : null;
            if (shadowSelection && shadowSelection.anchorNode) {
              matches.push({
                type: "output",
                id: outputNode.id,
                cellId,
                container: outputNode,
                isShadow: true,
                originalRange: shadowSelection.getRangeAt(0),
                searchPreviewInfo: options.shouldGetSearchPreviewInfo ? extractSelectionLine(shadowSelection) : void 0
              });
            }
          }
          const anchorNode = selection.anchorNode?.parentElement;
          if (anchorNode) {
            const lastEl = matches.length ? matches[matches.length - 1] : null;
            if (lastEl && lastEl.container.contains(anchorNode) && options.includeOutput) {
              matches.push({
                type: lastEl.type,
                id: lastEl.id,
                cellId: lastEl.cellId,
                container: lastEl.container,
                isShadow: false,
                originalRange: selection.getRangeAt(0),
                searchPreviewInfo: options.shouldGetSearchPreviewInfo ? extractSelectionLine(selection) : void 0
              });
            } else {
              for (let node = anchorNode; node; node = node.parentElement) {
                if (!(node instanceof Element)) {
                  break;
                }
                if (node.classList.contains("output") && options.includeOutput) {
                  const cellId = node.parentElement?.parentElement?.id;
                  if (cellId) {
                    matches.push({
                      type: "output",
                      id: node.id,
                      cellId,
                      container: node,
                      isShadow: false,
                      originalRange: selection.getRangeAt(0),
                      searchPreviewInfo: options.shouldGetSearchPreviewInfo ? extractSelectionLine(selection) : void 0
                    });
                  }
                  break;
                }
                if (node.id === "container" || node === window.document.body) {
                  break;
                }
              }
            }
          } else {
            break;
          }
        }
      }
    } catch (e) {
      console.log(e);
    }
    matches = matches.filter((match) => options.findIds.length ? options.findIds.includes(match.cellId) : true);
    _highlighter.addHighlights(matches, options.ownerID);
    window.document.getSelection()?.removeAllRanges();
    viewModel.toggleDragDropEnabled(currentOptions.dragAndDropEnabled);
    document.designMode = "Off";
    postNotebookMessage("didFind", {
      matches: matches.map((match, index) => ({
        type: match.type,
        id: match.id,
        cellId: match.cellId,
        index,
        searchPreviewInfo: match.searchPreviewInfo
      }))
    });
  };
  const copyOutputImage = async (outputId, altOutputId, textAlternates, retries = 5) => {
    if (!window.document.hasFocus() && retries > 0) {
      setTimeout(() => {
        copyOutputImage(outputId, altOutputId, textAlternates, retries - 1);
      }, 50);
      return;
    }
    try {
      const outputElement = window.document.getElementById(outputId) ?? window.document.getElementById(altOutputId);
      let image = outputElement?.querySelector("img");
      if (!image) {
        const svgImage = outputElement?.querySelector("svg.output-image") ?? outputElement?.querySelector("div.svgContainerStyle > svg");
        if (svgImage) {
          image = new Image();
          image.src = "data:image/svg+xml," + encodeURIComponent(svgImage.outerHTML);
        }
      }
      if (image) {
        const ensureImageLoaded = (img) => {
          return new Promise((resolve, reject) => {
            if (img.complete && img.naturalWidth > 0) {
              resolve(img);
            } else {
              img.onload = () => resolve(img);
              img.onerror = () => reject(new Error("Failed to load image"));
              setTimeout(() => reject(new Error("Image load timeout")), 5e3);
            }
          });
        };
        const imageToCopy = await ensureImageLoaded(image);
        const clipboardData = {
          "image/png": new Promise((resolve) => {
            const canvas = document.createElement("canvas");
            canvas.width = imageToCopy.naturalWidth;
            canvas.height = imageToCopy.naturalHeight;
            const context = canvas.getContext("2d");
            context.drawImage(imageToCopy, 0, 0);
            canvas.toBlob((blob) => {
              if (blob) {
                resolve(blob);
              } else {
                console.error("No blob data to write to clipboard");
              }
              canvas.remove();
            }, "image/png");
          })
        };
        if (textAlternates) {
          for (const alternate of textAlternates) {
            clipboardData[alternate.mimeType] = alternate.content;
          }
        }
        await navigator.clipboard.write([new ClipboardItem(clipboardData)]);
      } else {
        console.error("Could not find image element to copy for output with id", outputId);
      }
    } catch (e) {
      console.error("Could not copy image:", e);
    }
  };
  window.addEventListener("message", async (rawEvent) => {
    const event = rawEvent;
    switch (event.data.type) {
      case "initializeMarkup": {
        try {
          await Promise.all(event.data.cells.map((info) => viewModel.ensureMarkupCell(info)));
        } finally {
          dimensionUpdater.updateImmediately();
          postNotebookMessage("initializedMarkup", { requestId: event.data.requestId });
        }
        break;
      }
      case "createMarkupCell":
        viewModel.ensureMarkupCell(event.data.cell);
        break;
      case "showMarkupCell":
        viewModel.showMarkupCell(event.data.id, event.data.top, event.data.content, event.data.metadata);
        break;
      case "hideMarkupCells":
        for (const id of event.data.ids) {
          viewModel.hideMarkupCell(id);
        }
        break;
      case "unhideMarkupCells":
        for (const id of event.data.ids) {
          viewModel.unhideMarkupCell(id);
        }
        break;
      case "deleteMarkupCell":
        for (const id of event.data.ids) {
          viewModel.deleteMarkupCell(id);
        }
        break;
      case "updateSelectedMarkupCells":
        viewModel.updateSelectedCells(event.data.selectedCellIds);
        break;
      case "html": {
        const data = event.data;
        if (data.createOnIdle) {
          outputRunner.enqueueIdle(data.outputId, (signal) => {
            return viewModel.renderOutputCell(data, signal);
          });
        } else {
          outputRunner.enqueue(data.outputId, (signal) => {
            return viewModel.renderOutputCell(data, signal);
          });
        }
        break;
      }
      case "view-scroll": {
        event.data.widgets.forEach((widget) => {
          outputRunner.enqueue(widget.outputId, () => {
            viewModel.updateOutputsScroll([widget]);
          });
        });
        viewModel.updateMarkupScrolls(event.data.markupCells);
        break;
      }
      case "clear":
        renderers.clearAll();
        viewModel.clearAll();
        window.document.getElementById("container").innerText = "";
        break;
      case "clearOutput": {
        const { cellId, rendererId, outputId } = event.data;
        outputRunner.cancelOutput(outputId);
        viewModel.clearOutput(cellId, outputId, rendererId);
        break;
      }
      case "hideOutput": {
        const { cellId, outputId } = event.data;
        outputRunner.enqueue(outputId, () => {
          viewModel.hideOutput(cellId);
        });
        break;
      }
      case "showOutput": {
        const { outputId, cellTop, cellId, content } = event.data;
        outputRunner.enqueue(outputId, () => {
          viewModel.showOutput(cellId, outputId, cellTop);
          if (content) {
            viewModel.updateAndRerender(cellId, outputId, content);
          }
        });
        break;
      }
      case "copyImage": {
        await copyOutputImage(event.data.outputId, event.data.altOutputId, event.data.textAlternates);
        break;
      }
      case "ack-dimension": {
        for (const { cellId, outputId, height } of event.data.updates) {
          viewModel.updateOutputHeight(cellId, outputId, height);
        }
        break;
      }
      case "preload": {
        const resources = event.data.resources;
        for (const { uri } of resources) {
          kernelPreloads.load(uri);
        }
        break;
      }
      case "updateRenderers": {
        const { rendererData } = event.data;
        renderers.updateRendererData(rendererData);
        break;
      }
      case "focus-output":
        focusFirstFocusableOrContainerInOutput(event.data.cellOrOutputId, event.data.alternateId);
        break;
      case "blur-output":
        blurOutput();
        break;
      case "select-output-contents":
        selectOutputContents(event.data.cellOrOutputId);
        break;
      case "select-input-contents":
        selectInputContents(event.data.cellOrOutputId);
        break;
      case "decorations": {
        let outputContainer = window.document.getElementById(event.data.cellId);
        if (!outputContainer) {
          viewModel.ensureOutputCell(event.data.cellId, -1e5, true);
          outputContainer = window.document.getElementById(event.data.cellId);
        }
        outputContainer?.classList.add(...event.data.addedClassNames);
        outputContainer?.classList.remove(...event.data.removedClassNames);
        break;
      }
      case "markupDecorations": {
        const markupCell = window.document.getElementById(event.data.cellId);
        if (markupCell) {
          markupCell?.classList.add(...event.data.addedClassNames);
          markupCell?.classList.remove(...event.data.removedClassNames);
        }
        break;
      }
      case "customKernelMessage":
        onDidReceiveKernelMessage.fire(event.data.message);
        break;
      case "customRendererMessage":
        renderers.getRenderer(event.data.rendererId)?.receiveMessage(event.data.message);
        break;
      case "notebookStyles": {
        const documentStyle = window.document.documentElement.style;
        for (let i = documentStyle.length - 1; i >= 0; i--) {
          const property = documentStyle[i];
          if (property && property.startsWith("--notebook-")) {
            documentStyle.removeProperty(property);
          }
        }
        for (const [name, value] of Object.entries(event.data.styles)) {
          documentStyle.setProperty(`--${name}`, value);
        }
        break;
      }
      case "notebookOptions":
        currentOptions = event.data.options;
        viewModel.toggleDragDropEnabled(currentOptions.dragAndDropEnabled);
        currentRenderOptions = event.data.renderOptions;
        settingChange.fire(currentRenderOptions);
        break;
      case "tokenizedCodeBlock": {
        const { codeBlockId, html } = event.data;
        MarkdownCodeBlock.highlightCodeBlock(codeBlockId, html);
        break;
      }
      case "tokenizedStylesChanged": {
        tokenizationStyle.replaceSync(event.data.css);
        break;
      }
      case "find": {
        _highlighter.removeHighlights(event.data.options.ownerID);
        find(event.data.query, event.data.options);
        break;
      }
      case "findHighlightCurrent": {
        _highlighter?.highlightCurrentMatch(event.data.index, event.data.ownerID);
        break;
      }
      case "findUnHighlightCurrent": {
        _highlighter?.unHighlightCurrentMatch(event.data.index, event.data.ownerID);
        break;
      }
      case "findStop": {
        _highlighter.removeHighlights(event.data.ownerID);
        break;
      }
      case "returnOutputItem": {
        outputItemRequests.resolveOutputItem(event.data.requestId, event.data.output);
      }
    }
  });
  const renderFallbackErrorName = "vscode.fallbackToNextRenderer";
  class Renderer {
    constructor(data) {
      this.data = data;
      this._onMessageEvent = createEmitter();
    }
    receiveMessage(message) {
      this._onMessageEvent.fire(message);
    }
    async renderOutputItem(item, element, signal) {
      try {
        await this.load();
      } catch (e) {
        if (!signal.aborted) {
          showRenderError(`Error loading renderer '${this.data.id}'`, element, e instanceof Error ? [e] : []);
        }
        return;
      }
      if (!this._api) {
        if (!signal.aborted) {
          showRenderError(`Renderer '${this.data.id}' does not implement renderOutputItem`, element, []);
        }
        return;
      }
      try {
        const renderStart = performance.now();
        await this._api.renderOutputItem(item, element, signal);
        this.postDebugMessage("Rendered output item", { id: item.id, duration: `${performance.now() - renderStart}ms` });
      } catch (e) {
        if (signal.aborted) {
          return;
        }
        if (e instanceof Error && e.name === renderFallbackErrorName) {
          throw e;
        }
        showRenderError(`Error rendering output item using '${this.data.id}'`, element, e instanceof Error ? [e] : []);
        this.postDebugMessage("Rendering output item failed", { id: item.id, error: e + "" });
      }
    }
    disposeOutputItem(id) {
      this._api?.disposeOutputItem?.(id);
    }
    createRendererContext() {
      const { id, messaging } = this.data;
      const context = {
        setState: (newState) => vscode.setState({ ...vscode.getState(), [id]: newState }),
        getState: () => {
          const state = vscode.getState();
          return typeof state === "object" && state ? state[id] : void 0;
        },
        getRenderer: async (id2) => {
          const renderer = renderers.getRenderer(id2);
          if (!renderer) {
            return void 0;
          }
          if (renderer._api) {
            return renderer._api;
          }
          return renderer.load();
        },
        workspace: {
          get isTrusted() {
            return isWorkspaceTrusted;
          }
        },
        settings: {
          get lineLimit() {
            return currentRenderOptions.lineLimit;
          },
          get outputScrolling() {
            return currentRenderOptions.outputScrolling;
          },
          get outputWordWrap() {
            return currentRenderOptions.outputWordWrap;
          },
          get linkifyFilePaths() {
            return currentRenderOptions.linkifyFilePaths;
          },
          get minimalError() {
            return currentRenderOptions.minimalError;
          }
        },
        get onDidChangeSettings() {
          return settingChange.event;
        }
      };
      if (messaging) {
        context.onDidReceiveMessage = this._onMessageEvent.event;
        context.postMessage = (message) => postNotebookMessage("customRendererMessage", { rendererId: id, message });
      }
      return Object.freeze(context);
    }
    load() {
      this._loadPromise ??= this._load();
      return this._loadPromise;
    }
    /** Inner function cached in the _loadPromise(). */
    async _load() {
      this.postDebugMessage("Start loading renderer");
      try {
        await kernelPreloads.waitForAllCurrent();
        const importStart = performance.now();
        const module = await __import(this.data.entrypoint.path);
        this.postDebugMessage("Imported renderer", { duration: `${performance.now() - importStart}ms` });
        if (!module) {
          return;
        }
        this._api = await module.activate(this.createRendererContext());
        this.postDebugMessage("Activated renderer", { duration: `${performance.now() - importStart}ms` });
        const dependantRenderers = ctx.rendererData.filter((d) => d.entrypoint.extends === this.data.id);
        if (dependantRenderers.length) {
          this.postDebugMessage("Activating dependant renderers", { dependents: dependantRenderers.map((x) => x.id).join(", ") });
        }
        await Promise.all(dependantRenderers.map(async (d) => {
          const renderer = renderers.getRenderer(d.id);
          if (!renderer) {
            throw new Error(`Could not find extending renderer: ${d.id}`);
          }
          try {
            return await renderer.load();
          } catch (e) {
            console.error(e);
            this.postDebugMessage("Activating dependant renderer failed", { dependent: d.id, error: e + "" });
            return void 0;
          }
        }));
        return this._api;
      } catch (e) {
        this.postDebugMessage("Loading renderer failed");
        throw e;
      }
    }
    postDebugMessage(msg, data) {
      postNotebookMessage("logRendererDebugMessage", {
        message: `[renderer ${this.data.id}] - ${msg}`,
        data
      });
    }
  }
  const kernelPreloads = new class {
    constructor() {
      this.preloads = /* @__PURE__ */ new Map();
    }
    /**
     * Returns a promise that resolves when the given preload is activated.
     */
    waitFor(uri) {
      return this.preloads.get(uri) || Promise.resolve(new Error(`Preload not ready: ${uri}`));
    }
    /**
     * Loads a preload.
     * @param uri URI to load from
     * @param originalUri URI to show in an error message if the preload is invalid.
     */
    load(uri) {
      const promise = Promise.all([
        runKernelPreload(uri),
        this.waitForAllCurrent()
      ]);
      this.preloads.set(uri, promise);
      return promise;
    }
    /**
     * Returns a promise that waits for all currently-registered preloads to
     * activate before resolving.
     */
    waitForAllCurrent() {
      return Promise.all([...this.preloads.values()].map((p) => p.catch((err) => err)));
    }
  }();
  const outputRunner = new class {
    constructor() {
      this.outputs = /* @__PURE__ */ new Map();
      this.pendingOutputCreationRequest = /* @__PURE__ */ new Map();
    }
    /**
     * Pushes the action onto the list of actions for the given output ID,
     * ensuring that it's run in-order.
     */
    enqueue(outputId, action) {
      this.pendingOutputCreationRequest.get(outputId)?.dispose();
      this.pendingOutputCreationRequest.delete(outputId);
      const record = this.outputs.get(outputId);
      if (!record) {
        const controller = new AbortController();
        this.outputs.set(outputId, { abort: controller, queue: new Promise((r) => r(action(controller.signal))) });
      } else {
        record.queue = record.queue.then(async (r) => {
          if (!record.abort.signal.aborted) {
            await action(record.abort.signal);
          }
        });
      }
    }
    enqueueIdle(outputId, action) {
      this.pendingOutputCreationRequest.get(outputId)?.dispose();
      outputRunner.pendingOutputCreationRequest.set(outputId, runWhenIdle(() => {
        outputRunner.enqueue(outputId, action);
        outputRunner.pendingOutputCreationRequest.delete(outputId);
      }));
    }
    /**
     * Cancels the rendering of all outputs.
     */
    cancelAll() {
      this.pendingOutputCreationRequest.forEach((r) => r.dispose());
      this.pendingOutputCreationRequest.clear();
      for (const { abort } of this.outputs.values()) {
        abort.abort();
      }
      this.outputs.clear();
    }
    /**
     * Cancels any ongoing rendering out an output.
     */
    cancelOutput(outputId) {
      this.pendingOutputCreationRequest.get(outputId)?.dispose();
      this.pendingOutputCreationRequest.delete(outputId);
      const output = this.outputs.get(outputId);
      if (output) {
        output.abort.abort();
        this.outputs.delete(outputId);
      }
    }
  }();
  const renderers = new class {
    constructor() {
      this._renderers = /* @__PURE__ */ new Map();
      for (const renderer of ctx.rendererData) {
        this.addRenderer(renderer);
      }
    }
    getRenderer(id) {
      return this._renderers.get(id);
    }
    rendererEqual(a, b) {
      if (a.id !== b.id || a.entrypoint.path !== b.entrypoint.path || a.entrypoint.extends !== b.entrypoint.extends || a.messaging !== b.messaging) {
        return false;
      }
      if (a.mimeTypes.length !== b.mimeTypes.length) {
        return false;
      }
      for (let i = 0; i < a.mimeTypes.length; i++) {
        if (a.mimeTypes[i] !== b.mimeTypes[i]) {
          return false;
        }
      }
      return true;
    }
    updateRendererData(rendererData) {
      const oldKeys = new Set(this._renderers.keys());
      const newKeys = new Set(rendererData.map((d) => d.id));
      for (const renderer of rendererData) {
        const existing = this._renderers.get(renderer.id);
        if (existing && this.rendererEqual(existing.data, renderer)) {
          continue;
        }
        this.addRenderer(renderer);
      }
      for (const key of oldKeys) {
        if (!newKeys.has(key)) {
          this._renderers.delete(key);
        }
      }
    }
    addRenderer(renderer) {
      this._renderers.set(renderer.id, new Renderer(renderer));
    }
    clearAll() {
      outputRunner.cancelAll();
      for (const renderer of this._renderers.values()) {
        renderer.disposeOutputItem();
      }
    }
    clearOutput(rendererId, outputId) {
      outputRunner.cancelOutput(outputId);
      this._renderers.get(rendererId)?.disposeOutputItem(outputId);
    }
    async render(item, preferredRendererId, element, signal) {
      const primaryRenderer = this.findRenderer(preferredRendererId, item);
      if (!primaryRenderer) {
        const errorMessage2 = (window.document.documentElement.style.getPropertyValue("--notebook-cell-renderer-not-found-error") || "").replace("$0", () => item.mime);
        this.showRenderError(item, element, errorMessage2);
        return;
      }
      if (!(await this._doRender(item, element, primaryRenderer, signal)).continue) {
        return;
      }
      for (const additionalItemData of item._allOutputItems) {
        if (additionalItemData.mime === item.mime) {
          continue;
        }
        const additionalItem = await additionalItemData.getItem();
        if (signal.aborted) {
          return;
        }
        if (additionalItem) {
          const renderer = this.findRenderer(void 0, additionalItem);
          if (renderer) {
            if (!(await this._doRender(additionalItem, element, renderer, signal)).continue) {
              return;
            }
          }
        }
      }
      const errorMessage = (window.document.documentElement.style.getPropertyValue("--notebook-cell-renderer-fallbacks-exhausted") || "").replace("$0", () => item.mime);
      this.showRenderError(item, element, errorMessage);
    }
    async _doRender(item, element, renderer, signal) {
      try {
        await renderer.renderOutputItem(item, element, signal);
        return { continue: false };
      } catch (e) {
        if (signal.aborted) {
          return { continue: false };
        }
        if (e instanceof Error && e.name === renderFallbackErrorName) {
          return { continue: true };
        } else {
          throw e;
        }
      }
    }
    findRenderer(preferredRendererId, info) {
      let renderer;
      if (typeof preferredRendererId === "string") {
        renderer = Array.from(this._renderers.values()).find((renderer2) => renderer2.data.id === preferredRendererId);
      } else {
        const renderers2 = Array.from(this._renderers.values()).filter((renderer2) => renderer2.data.mimeTypes.includes(info.mime) && !renderer2.data.entrypoint.extends);
        if (renderers2.length) {
          renderers2.sort((a, b) => +a.data.isBuiltin - +b.data.isBuiltin);
          renderer = renderers2[0];
        }
      }
      return renderer;
    }
    showRenderError(info, element, errorMessage) {
      const errorContainer = document.createElement("div");
      const error = document.createElement("div");
      error.className = "no-renderer-error";
      error.innerText = errorMessage;
      const cellText = document.createElement("div");
      cellText.innerText = info.text();
      errorContainer.appendChild(error);
      errorContainer.appendChild(cellText);
      element.innerText = "";
      element.appendChild(errorContainer);
    }
  }();
  const viewModel = new class ViewModel {
    constructor() {
      this._markupCells = /* @__PURE__ */ new Map();
      this._outputCells = /* @__PURE__ */ new Map();
    }
    clearAll() {
      for (const cell of this._markupCells.values()) {
        cell.dispose();
      }
      this._markupCells.clear();
      for (const output of this._outputCells.values()) {
        output.dispose();
      }
      this._outputCells.clear();
    }
    async createMarkupCell(init, top, visible) {
      const existing = this._markupCells.get(init.cellId);
      if (existing) {
        console.error(`Trying to create markup that already exists: ${init.cellId}`);
        return existing;
      }
      const cell = new MarkupCell(init.cellId, init.mime, init.content, top, init.metadata);
      cell.element.style.visibility = visible ? "" : "hidden";
      this._markupCells.set(init.cellId, cell);
      await cell.ready;
      return cell;
    }
    async ensureMarkupCell(info) {
      let cell = this._markupCells.get(info.cellId);
      if (cell) {
        cell.element.style.visibility = info.visible ? "" : "hidden";
        await cell.updateContentAndRender(info.content, info.metadata);
      } else {
        cell = await this.createMarkupCell(info, info.offset, info.visible);
      }
    }
    deleteMarkupCell(id) {
      const cell = this.getExpectedMarkupCell(id);
      if (cell) {
        cell.remove();
        cell.dispose();
        this._markupCells.delete(id);
      }
    }
    async updateMarkupContent(id, newContent, metadata) {
      const cell = this.getExpectedMarkupCell(id);
      await cell?.updateContentAndRender(newContent, metadata);
    }
    showMarkupCell(id, top, newContent, metadata) {
      const cell = this.getExpectedMarkupCell(id);
      cell?.show(top, newContent, metadata);
    }
    hideMarkupCell(id) {
      const cell = this.getExpectedMarkupCell(id);
      cell?.hide();
    }
    unhideMarkupCell(id) {
      const cell = this.getExpectedMarkupCell(id);
      cell?.unhide();
    }
    getExpectedMarkupCell(id) {
      const cell = this._markupCells.get(id);
      if (!cell) {
        console.log(`Could not find markup cell '${id}'`);
        return void 0;
      }
      return cell;
    }
    updateSelectedCells(selectedCellIds) {
      const selectedCellSet = new Set(selectedCellIds);
      for (const cell of this._markupCells.values()) {
        cell.setSelected(selectedCellSet.has(cell.id));
      }
    }
    toggleDragDropEnabled(dragAndDropEnabled) {
      for (const cell of this._markupCells.values()) {
        cell.toggleDragDropEnabled(dragAndDropEnabled);
      }
    }
    updateMarkupScrolls(markupCells) {
      for (const { id, top } of markupCells) {
        const cell = this._markupCells.get(id);
        if (cell) {
          cell.element.style.top = `${top}px`;
        }
      }
    }
    async renderOutputCell(data, signal) {
      const preloadErrors = await Promise.all(
        data.requiredPreloads.map((p) => kernelPreloads.waitFor(p.uri).then(() => void 0, (err) => err))
      );
      if (signal.aborted) {
        return;
      }
      const cellOutput = this.ensureOutputCell(data.cellId, data.cellTop, false);
      return cellOutput.renderOutputElement(data, preloadErrors, signal);
    }
    ensureOutputCell(cellId, cellTop, skipCellTopUpdateIfExist) {
      let cell = this._outputCells.get(cellId);
      const existed = !!cell;
      if (!cell) {
        cell = new OutputCell(cellId);
        this._outputCells.set(cellId, cell);
      }
      if (existed && skipCellTopUpdateIfExist) {
        return cell;
      }
      cell.element.style.top = cellTop + "px";
      return cell;
    }
    clearOutput(cellId, outputId, rendererId) {
      const cell = this._outputCells.get(cellId);
      cell?.clearOutput(outputId, rendererId);
    }
    showOutput(cellId, outputId, top) {
      const cell = this._outputCells.get(cellId);
      cell?.show(outputId, top);
    }
    updateAndRerender(cellId, outputId, content) {
      const cell = this._outputCells.get(cellId);
      cell?.updateContentAndRerender(outputId, content);
    }
    hideOutput(cellId) {
      const cell = this._outputCells.get(cellId);
      cell?.hide();
    }
    updateOutputHeight(cellId, outputId, height) {
      const cell = this._outputCells.get(cellId);
      cell?.updateOutputHeight(outputId, height);
    }
    updateOutputsScroll(updates) {
      for (const request of updates) {
        const cell = this._outputCells.get(request.cellId);
        cell?.updateScroll(request);
      }
    }
  }();
  const _MarkdownCodeBlock = class _MarkdownCodeBlock {
    static highlightCodeBlock(id, html) {
      const el = _MarkdownCodeBlock.pendingCodeBlocksToHighlight.get(id);
      if (!el) {
        return;
      }
      const trustedHtml = ttPolicy?.createHTML(html) ?? html;
      el.innerHTML = trustedHtml;
      const root = el.getRootNode();
      if (root instanceof ShadowRoot) {
        if (!root.adoptedStyleSheets.includes(tokenizationStyle)) {
          root.adoptedStyleSheets.push(tokenizationStyle);
        }
      }
    }
    static requestHighlightCodeBlock(root) {
      const codeBlocks = [];
      let i = 0;
      for (const el of root.querySelectorAll(".vscode-code-block")) {
        const lang = el.getAttribute("data-vscode-code-block-lang");
        if (el.textContent && lang) {
          const id = `${Date.now()}-${i++}`;
          codeBlocks.push({ value: el.textContent, lang, id });
          _MarkdownCodeBlock.pendingCodeBlocksToHighlight.set(id, el);
        }
      }
      return codeBlocks;
    }
  };
  _MarkdownCodeBlock.pendingCodeBlocksToHighlight = /* @__PURE__ */ new Map();
  let MarkdownCodeBlock = _MarkdownCodeBlock;
  class MarkupCell {
    constructor(id, mime, content, top, metadata) {
      this._isDisposed = false;
      const self = this;
      this.id = id;
      this._content = { value: content, version: 0, metadata };
      const { promise, resolve, reject } = promiseWithResolvers();
      this.ready = promise;
      let cachedData;
      this.outputItem = Object.freeze({
        id,
        mime,
        get metadata() {
          return self._content.metadata;
        },
        text: () => {
          return this._content.value;
        },
        json: () => {
          return void 0;
        },
        data: () => {
          if (cachedData?.version === this._content.version) {
            return cachedData.value;
          }
          const data = textEncoder.encode(this._content.value);
          cachedData = { version: this._content.version, value: data };
          return data;
        },
        blob() {
          return new Blob([this.data()], { type: this.mime });
        },
        _allOutputItems: [{
          mime,
          getItem: async () => this.outputItem
        }]
      });
      const root = window.document.getElementById("container");
      const markupCell = document.createElement("div");
      markupCell.className = "markup";
      markupCell.style.position = "absolute";
      markupCell.style.width = "100%";
      this.element = document.createElement("div");
      this.element.id = this.id;
      this.element.classList.add("preview");
      this.element.style.position = "absolute";
      this.element.style.top = top + "px";
      this.toggleDragDropEnabled(currentOptions.dragAndDropEnabled);
      markupCell.appendChild(this.element);
      root.appendChild(markupCell);
      this.addEventListeners();
      this.updateContentAndRender(this._content.value, this._content.metadata).then(() => {
        if (!this._isDisposed) {
          resizeObserver.observe(this.element, this.id, false, this.id);
        }
        resolve();
      }, () => reject());
    }
    dispose() {
      this._isDisposed = true;
      this.renderTaskAbort?.abort();
      this.renderTaskAbort = void 0;
    }
    addEventListeners() {
      this.element.addEventListener("dblclick", () => {
        postNotebookMessage("toggleMarkupPreview", { cellId: this.id });
      });
      this.element.addEventListener("click", (e) => {
        postNotebookMessage("clickMarkupCell", {
          cellId: this.id,
          altKey: e.altKey,
          ctrlKey: e.ctrlKey,
          metaKey: e.metaKey,
          shiftKey: e.shiftKey
        });
      });
      this.element.addEventListener("contextmenu", (e) => {
        postNotebookMessage("contextMenuMarkupCell", {
          cellId: this.id,
          clientX: e.clientX,
          clientY: e.clientY
        });
      });
      this.element.addEventListener("mouseenter", () => {
        postNotebookMessage("mouseEnterMarkupCell", { cellId: this.id });
      });
      this.element.addEventListener("mouseleave", () => {
        postNotebookMessage("mouseLeaveMarkupCell", { cellId: this.id });
      });
      this.element.addEventListener("dragstart", (e) => {
        markupCellDragManager.startDrag(e, this.id);
      });
      this.element.addEventListener("drag", (e) => {
        markupCellDragManager.updateDrag(e, this.id);
      });
      this.element.addEventListener("dragend", (e) => {
        markupCellDragManager.endDrag(e, this.id);
      });
    }
    async updateContentAndRender(newContent, metadata) {
      this._content = { value: newContent, version: this._content.version + 1, metadata };
      this.renderTaskAbort?.abort();
      const controller = new AbortController();
      this.renderTaskAbort = controller;
      try {
        await renderers.render(this.outputItem, void 0, this.element, this.renderTaskAbort.signal);
      } finally {
        if (this.renderTaskAbort === controller) {
          this.renderTaskAbort = void 0;
        }
      }
      const root = this.element.shadowRoot ?? this.element;
      const html = [];
      for (const child of root.children) {
        switch (child.tagName) {
          case "LINK":
          case "SCRIPT":
          case "STYLE":
            break;
          default:
            html.push(child.outerHTML);
            break;
        }
      }
      const codeBlocks = MarkdownCodeBlock.requestHighlightCodeBlock(root);
      postNotebookMessage("renderedMarkup", {
        cellId: this.id,
        html: html.join(""),
        codeBlocks
      });
      dimensionUpdater.updateHeight(this.id, this.element.offsetHeight, {
        isOutput: false
      });
    }
    show(top, newContent, metadata) {
      this.element.style.visibility = "";
      this.element.style.top = `${top}px`;
      if (typeof newContent === "string" || metadata) {
        this.updateContentAndRender(newContent ?? this._content.value, metadata ?? this._content.metadata);
      } else {
        this.updateMarkupDimensions();
      }
    }
    hide() {
      this.element.style.visibility = "hidden";
    }
    unhide() {
      this.element.style.visibility = "";
      this.updateMarkupDimensions();
    }
    remove() {
      this.element.remove();
    }
    async updateMarkupDimensions() {
      dimensionUpdater.updateHeight(this.id, this.element.offsetHeight, {
        isOutput: false
      });
    }
    setSelected(selected) {
      this.element.classList.toggle("selected", selected);
    }
    toggleDragDropEnabled(enabled) {
      if (enabled) {
        this.element.classList.add("draggable");
        this.element.setAttribute("draggable", "true");
      } else {
        this.element.classList.remove("draggable");
        this.element.removeAttribute("draggable");
      }
    }
  }
  class OutputCell {
    constructor(cellId) {
      this.outputElements = /* @__PURE__ */ new Map();
      const container = window.document.getElementById("container");
      const upperWrapperElement = createFocusSink(cellId);
      container.appendChild(upperWrapperElement);
      this.element = document.createElement("div");
      this.element.style.position = "absolute";
      this.element.style.outline = "0";
      this.element.id = cellId;
      this.element.classList.add("cell_container");
      container.appendChild(this.element);
      this.element = this.element;
      const lowerWrapperElement = createFocusSink(cellId, true);
      container.appendChild(lowerWrapperElement);
    }
    dispose() {
      for (const output of this.outputElements.values()) {
        output.dispose();
      }
      this.outputElements.clear();
    }
    createOutputElement(data) {
      let outputContainer = this.outputElements.get(data.outputId);
      if (!outputContainer) {
        outputContainer = new OutputContainer(data.outputId);
        this.element.appendChild(outputContainer.element);
        this.outputElements.set(data.outputId, outputContainer);
      }
      return outputContainer.createOutputElement(data.outputId, data.outputOffset, data.left, data.cellId);
    }
    async renderOutputElement(data, preloadErrors, signal) {
      const startTime = Date.now();
      const outputElement = this.createOutputElement(data);
      await outputElement.render(data.content, data.rendererId, preloadErrors, signal);
      outputElement.element.style.visibility = data.initiallyHidden ? "hidden" : "";
      if (!!data.executionId && !!data.rendererId) {
        let outputSize = void 0;
        if (data.content.type === 1) {
          outputSize = data.content.output.valueBytes.length;
        }
        if (outputSize !== void 0 && outputSize > 0 && outputSize < 100 * 1024) {
          postNotebookMessage("notebookPerformanceMessage", {
            cellId: data.cellId,
            executionId: data.executionId,
            duration: Date.now() - startTime,
            rendererId: data.rendererId,
            outputSize
          });
        }
      }
    }
    clearOutput(outputId, rendererId) {
      const output = this.outputElements.get(outputId);
      output?.clear(rendererId);
      output?.dispose();
      this.outputElements.delete(outputId);
    }
    show(outputId, top) {
      const outputContainer = this.outputElements.get(outputId);
      if (!outputContainer) {
        return;
      }
      this.element.style.visibility = "";
      this.element.style.top = `${top}px`;
    }
    hide() {
      this.element.style.visibility = "hidden";
    }
    updateContentAndRerender(outputId, content) {
      this.outputElements.get(outputId)?.updateContentAndRender(content);
    }
    updateOutputHeight(outputId, height) {
      this.outputElements.get(outputId)?.updateHeight(height);
    }
    updateScroll(request) {
      this.element.style.top = `${request.cellTop}px`;
      const outputElement = this.outputElements.get(request.outputId);
      if (outputElement) {
        outputElement.updateScroll(request.outputOffset);
        if (request.forceDisplay && outputElement.outputNode) {
          outputElement.outputNode.element.style.visibility = "";
        }
      }
      if (request.forceDisplay) {
        this.element.style.visibility = "";
      }
    }
  }
  class OutputContainer {
    constructor(outputId) {
      this.outputId = outputId;
      this.element = document.createElement("div");
      this.element.classList.add("output_container");
      this.element.setAttribute("data-vscode-context", JSON.stringify({ "preventDefaultContextMenuItems": true }));
      this.element.style.position = "absolute";
      this.element.style.overflow = "hidden";
    }
    get outputNode() {
      return this._outputNode;
    }
    dispose() {
      this._outputNode?.dispose();
    }
    clear(rendererId) {
      if (rendererId) {
        renderers.clearOutput(rendererId, this.outputId);
      }
      this.element.remove();
    }
    updateHeight(height) {
      this.element.style.maxHeight = `${height}px`;
      this.element.style.height = `${height}px`;
    }
    updateScroll(outputOffset) {
      this.element.style.top = `${outputOffset}px`;
    }
    createOutputElement(outputId, outputOffset, left, cellId) {
      this.element.innerText = "";
      this.element.style.maxHeight = "0px";
      this.element.style.top = `${outputOffset}px`;
      this._outputNode?.dispose();
      this._outputNode = new OutputElement(outputId, left, cellId);
      this.element.appendChild(this._outputNode.element);
      return this._outputNode;
    }
    updateContentAndRender(content) {
      this._outputNode?.updateAndRerender(content);
    }
  }
  vscode.postMessage({
    __vscode_notebook_message: true,
    type: "initialized"
  });
  for (const preload of ctx.staticPreloadsData) {
    kernelPreloads.load(preload.entrypoint);
  }
  function postNotebookMessage(type, properties) {
    vscode.postMessage({
      __vscode_notebook_message: true,
      type,
      ...properties
    });
  }
  class OutputElement {
    constructor(outputId, left, cellId) {
      this.outputId = outputId;
      this.cellId = cellId;
      this.hasResizeObserver = false;
      this.isImageOutput = false;
      this.element = document.createElement("div");
      this.element.id = outputId;
      this.element.classList.add("output");
      this.element.style.position = "absolute";
      this.element.style.top = `0px`;
      this.element.style.left = left + "px";
      this.element.style.padding = `${ctx.style.outputNodePadding}px ${ctx.style.outputNodePadding}px ${ctx.style.outputNodePadding}px ${ctx.style.outputNodeLeftPadding}`;
      this.element.addEventListener("mouseenter", () => {
        postNotebookMessage("mouseenter", { id: outputId });
      });
      this.element.addEventListener("mouseleave", () => {
        postNotebookMessage("mouseleave", { id: outputId });
      });
      this.element.addEventListener("dragstart", (e) => {
        if (!e.dataTransfer) {
          return;
        }
        const outputData = {
          outputId: this.outputId
        };
        e.dataTransfer.setData("notebook-cell-output", JSON.stringify(outputData));
      });
      window.addEventListener("keydown", (e) => {
        if (e.altKey) {
          this.element.draggable = true;
        }
      });
      window.addEventListener("keyup", (e) => {
        if (!e.altKey) {
          this.element.draggable = this.isImageOutput;
        }
      });
      window.addEventListener("blur", () => {
        this.element.draggable = this.isImageOutput;
      });
    }
    dispose() {
      this.renderTaskAbort?.abort();
      this.renderTaskAbort = void 0;
    }
    async render(content, preferredRendererId, preloadErrors, signal) {
      this.renderTaskAbort?.abort();
      this.renderTaskAbort = void 0;
      this._content = { preferredRendererId, preloadErrors };
      if (content.type === 0) {
        const trustedHtml = ttPolicy?.createHTML(content.htmlContent) ?? content.htmlContent;
        this.element.innerHTML = trustedHtml;
      } else if (preloadErrors.some((e) => e instanceof Error)) {
        const errors = preloadErrors.filter((e) => e instanceof Error);
        showRenderError(`Error loading preloads`, this.element, errors);
      } else {
        const imageMimeTypes = ["image/png", "image/jpeg", "image/svg"];
        this.isImageOutput = imageMimeTypes.includes(content.output.mime);
        this.element.draggable = this.isImageOutput;
        const item = createOutputItem(this.outputId, content.output.mime, content.metadata, content.output.valueBytes, content.allOutputs, content.output.appended);
        const controller = new AbortController();
        this.renderTaskAbort = controller;
        signal?.addEventListener("abort", () => controller.abort());
        try {
          await renderers.render(item, preferredRendererId, this.element, controller.signal);
        } finally {
          if (this.renderTaskAbort === controller) {
            this.renderTaskAbort = void 0;
          }
        }
      }
      if (!this.hasResizeObserver) {
        this.hasResizeObserver = true;
        resizeObserver.observe(this.element, this.outputId, true, this.cellId);
      }
      const offsetHeight = this.element.offsetHeight;
      const cps = document.defaultView.getComputedStyle(this.element);
      const verticalPadding = parseFloat(cps.paddingTop) + parseFloat(cps.paddingBottom);
      const contentHeight = offsetHeight - verticalPadding;
      if (elementHasContent(contentHeight) && cps.padding === "0px") {
        dimensionUpdater.updateHeight(this.outputId, offsetHeight + ctx.style.outputNodePadding * 2, {
          isOutput: true,
          init: true
        });
        this.element.style.padding = `${ctx.style.outputNodePadding}px ${ctx.style.outputNodePadding}px ${ctx.style.outputNodePadding}px ${ctx.style.outputNodeLeftPadding}`;
      } else if (elementHasContent(contentHeight)) {
        dimensionUpdater.updateHeight(this.outputId, this.element.offsetHeight, {
          isOutput: true,
          init: true
        });
        this.element.style.padding = `0 ${ctx.style.outputNodePadding}px 0 ${ctx.style.outputNodeLeftPadding}`;
      } else {
        dimensionUpdater.updateHeight(this.outputId, 0, {
          isOutput: true,
          init: true
        });
      }
      const root = this.element.shadowRoot ?? this.element;
      const codeBlocks = MarkdownCodeBlock.requestHighlightCodeBlock(root);
      if (codeBlocks.length > 0) {
        postNotebookMessage("renderedCellOutput", {
          codeBlocks
        });
      }
    }
    updateAndRerender(content) {
      if (this._content) {
        this.render(content, this._content.preferredRendererId, this._content.preloadErrors);
      }
    }
  }
  const markupCellDragManager = new class MarkupCellDragManager {
    constructor() {
      window.document.addEventListener("dragover", (e) => {
        e.preventDefault();
      });
      window.document.addEventListener("drop", (e) => {
        e.preventDefault();
        const drag = this.currentDrag;
        if (!drag) {
          return;
        }
        this.currentDrag = void 0;
        postNotebookMessage("cell-drop", {
          cellId: drag.cellId,
          ctrlKey: e.ctrlKey,
          altKey: e.altKey,
          dragOffsetY: e.clientY
        });
      });
    }
    startDrag(e, cellId) {
      if (!e.dataTransfer) {
        return;
      }
      if (!currentOptions.dragAndDropEnabled) {
        return;
      }
      this.currentDrag = { cellId, clientY: e.clientY };
      const overlayZIndex = 9999;
      if (!this.dragOverlay) {
        this.dragOverlay = document.createElement("div");
        this.dragOverlay.style.position = "absolute";
        this.dragOverlay.style.top = "0";
        this.dragOverlay.style.left = "0";
        this.dragOverlay.style.zIndex = `${overlayZIndex}`;
        this.dragOverlay.style.width = "100%";
        this.dragOverlay.style.height = "100%";
        this.dragOverlay.style.background = "transparent";
        window.document.body.appendChild(this.dragOverlay);
      }
      e.target.style.zIndex = `${overlayZIndex + 1}`;
      e.target.classList.add("dragging");
      postNotebookMessage("cell-drag-start", {
        cellId,
        dragOffsetY: e.clientY
      });
      const trySendDragUpdate = () => {
        if (this.currentDrag?.cellId !== cellId) {
          return;
        }
        postNotebookMessage("cell-drag", {
          cellId,
          dragOffsetY: this.currentDrag.clientY
        });
        window.requestAnimationFrame(trySendDragUpdate);
      };
      window.requestAnimationFrame(trySendDragUpdate);
    }
    updateDrag(e, cellId) {
      if (cellId !== this.currentDrag?.cellId) {
        this.currentDrag = void 0;
      } else {
        this.currentDrag = { cellId, clientY: e.clientY };
      }
    }
    endDrag(e, cellId) {
      this.currentDrag = void 0;
      e.target.classList.remove("dragging");
      postNotebookMessage("cell-drag-end", {
        cellId
      });
      if (this.dragOverlay) {
        this.dragOverlay.remove();
        this.dragOverlay = void 0;
      }
      e.target.style.zIndex = "";
    }
  }();
}
function preloadsScriptStr(styleValues, options, renderOptions, renderers, preloads, isWorkspaceTrusted, nonce) {
  const ctx = {
    style: styleValues,
    options,
    renderOptions,
    rendererData: renderers,
    staticPreloadsData: preloads,
    isWorkspaceTrusted,
    nonce
  };
  return `
		const __import = (x) => import(x);
		(${webviewPreloads})(
			JSON.parse(decodeURIComponent("${encodeURIComponent(JSON.stringify(ctx))}"))
		)
//# sourceURL=notebookWebviewPreloads.js
`;
}
export {
  preloadsScriptStr
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG5vdGVib29rXFxicm93c2VyXFx2aWV3XFxyZW5kZXJlcnNcXHdlYnZpZXdQcmVsb2Fkcy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB0eXBlIHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgdHlwZSB7IElEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB0eXBlICogYXMgd2Vidmlld01lc3NhZ2VzIGZyb20gJy4vd2Vidmlld01lc3NhZ2VzLmpzJztcbmltcG9ydCB0eXBlIHsgTm90ZWJvb2tDZWxsTWV0YWRhdGEgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbm90ZWJvb2tDb21tb24uanMnO1xuaW1wb3J0IHR5cGUgKiBhcyByZW5kZXJlckFwaSBmcm9tICd2c2NvZGUtbm90ZWJvb2stcmVuZGVyZXInO1xuaW1wb3J0IHR5cGUgeyBOb3RlYm9va0NlbGxPdXRwdXRUcmFuc2ZlckRhdGEgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9kbmQvYnJvd3Nlci9kbmQuanMnO1xuXG4vLyAhISBJTVBPUlRBTlQgISEgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuLy8gaW1wb3J0IHsgUmVuZGVyT3V0cHV0VHlwZSB9IGZyb20gJ3ZzL3dvcmtiZW5jaC9jb250cmliL25vdGVib29rL2Jyb3dzZXIvbm90ZWJvb2tCcm93c2VyJztcbi8vIFdlIGNhbiBPTkxZIElNUE9SVCBhcyB0eXBlIGluIHRoaXMgbW9kdWxlLiBUaGlzIGFsc28gYXBwbGllcyB0byBjb25zdCBlbnVtcyB0aGF0IHdvdWxkIGV2YXBvcmF0ZVxuLy8gaW4gbm9ybWFsIGNvbXBpbGVzIGJ1dCByZW1haW4gYSBkZXBlbmRlbmN5IGluIHRyYW5zcGlsZS1vbmx5IGNvbXBpbGVzXG4vLyAhISBJTVBPUlRBTlQgISEgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG4vLyAhISBJTVBPUlRBTlQgISEgZXZlcnl0aGluZyBtdXN0IGJlIGluLWxpbmUgd2l0aGluIHRoZSB3ZWJ2aWV3UHJlbG9hZHNcbi8vIGZ1bmN0aW9uLiBJbXBvcnRzIGFyZSBub3QgYWxsb3dlZC4gVGhpcyBpcyBzdHJpbmdpZmllZCBhbmQgaW5qZWN0ZWQgaW50b1xuLy8gdGhlIHdlYnZpZXcuXG5cbmRlY2xhcmUgbmFtZXNwYWNlIGdsb2JhbFRoaXMge1xuXHRjb25zdCBhY3F1aXJlVnNDb2RlQXBpOiAoKSA9PiAoe1xuXHRcdGdldFN0YXRlKCk6IHsgW2tleTogc3RyaW5nXTogdW5rbm93biB9O1xuXHRcdHNldFN0YXRlKGRhdGE6IHsgW2tleTogc3RyaW5nXTogdW5rbm93biB9KTogdm9pZDtcblx0XHRwb3N0TWVzc2FnZTogKG1zZzogdW5rbm93bikgPT4gdm9pZDtcblx0fSk7XG59XG5cbmRlY2xhcmUgY2xhc3MgUmVzaXplT2JzZXJ2ZXIge1xuXHRjb25zdHJ1Y3RvcihvbkNoYW5nZTogKGVudHJpZXM6IHsgdGFyZ2V0OiBIVE1MRWxlbWVudDsgY29udGVudFJlY3Q/OiBDbGllbnRSZWN0IH1bXSkgPT4gdm9pZCk7XG5cdG9ic2VydmUoZWxlbWVudDogRWxlbWVudCk6IHZvaWQ7XG5cdGRpc2Nvbm5lY3QoKTogdm9pZDtcbn1cblxuZGVjbGFyZSBjbGFzcyBIaWdobGlnaHQge1xuXHRjb25zdHJ1Y3RvcigpO1xuXHRhZGQocmFuZ2U6IEFic3RyYWN0UmFuZ2UpOiB2b2lkO1xuXHRjbGVhcigpOiB2b2lkO1xuXHRwcmlvcml0eTogbnVtYmVyO1xufVxuXG5pbnRlcmZhY2UgQ1NTSGlnaGxpZ2h0cyB7XG5cdHNldChydWxlOiBzdHJpbmcsIGhpZ2hsaWdodDogSGlnaGxpZ2h0KTogdm9pZDtcbn1cbmRlY2xhcmUgbmFtZXNwYWNlIENTUyB7XG5cdGxldCBoaWdobGlnaHRzOiBDU1NIaWdobGlnaHRzIHwgdW5kZWZpbmVkO1xufVxuXG5cbnR5cGUgTGlzdGVuZXI8VD4gPSB7IGZuOiAoZXZ0OiBUKSA9PiB2b2lkOyB0aGlzQXJnOiB1bmtub3duIH07XG5cbmludGVyZmFjZSBFbWl0dGVyTGlrZTxUPiB7XG5cdGZpcmUoZGF0YTogVCk6IHZvaWQ7XG5cdHJlYWRvbmx5IGV2ZW50OiBFdmVudDxUPjtcbn1cblxuaW50ZXJmYWNlIFByZWxvYWRTdHlsZXMge1xuXHRyZWFkb25seSBvdXRwdXROb2RlUGFkZGluZzogbnVtYmVyO1xuXHRyZWFkb25seSBvdXRwdXROb2RlTGVmdFBhZGRpbmc6IG51bWJlcjtcblx0cmVhZG9ubHkgdG9rZW5pemF0aW9uQ3NzOiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUHJlbG9hZE9wdGlvbnMge1xuXHRkcmFnQW5kRHJvcEVuYWJsZWQ6IGJvb2xlYW47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUmVuZGVyT3B0aW9ucyB7XG5cdHJlYWRvbmx5IGxpbmVMaW1pdDogbnVtYmVyO1xuXHRyZWFkb25seSBvdXRwdXRTY3JvbGxpbmc6IGJvb2xlYW47XG5cdHJlYWRvbmx5IG91dHB1dFdvcmRXcmFwOiBib29sZWFuO1xuXHRyZWFkb25seSBsaW5raWZ5RmlsZVBhdGhzOiBib29sZWFuO1xuXHRyZWFkb25seSBtaW5pbWFsRXJyb3I6IGJvb2xlYW47XG59XG5cbmludGVyZmFjZSBQcmVsb2FkQ29udGV4dCB7XG5cdHJlYWRvbmx5IG5vbmNlOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHN0eWxlOiBQcmVsb2FkU3R5bGVzO1xuXHRyZWFkb25seSBvcHRpb25zOiBQcmVsb2FkT3B0aW9ucztcblx0cmVhZG9ubHkgcmVuZGVyT3B0aW9uczogUmVuZGVyT3B0aW9ucztcblx0cmVhZG9ubHkgcmVuZGVyZXJEYXRhOiByZWFkb25seSB3ZWJ2aWV3TWVzc2FnZXMuUmVuZGVyZXJNZXRhZGF0YVtdO1xuXHRyZWFkb25seSBzdGF0aWNQcmVsb2Fkc0RhdGE6IHJlYWRvbmx5IHdlYnZpZXdNZXNzYWdlcy5TdGF0aWNQcmVsb2FkTWV0YWRhdGFbXTtcblx0cmVhZG9ubHkgaXNXb3Jrc3BhY2VUcnVzdGVkOiBib29sZWFuO1xufVxuXG5kZWNsYXJlIGZ1bmN0aW9uIHJlcXVlc3RJZGxlQ2FsbGJhY2soY2FsbGJhY2s6IChhcmdzOiBJZGxlRGVhZGxpbmUpID0+IHZvaWQsIG9wdGlvbnM/OiB7IHRpbWVvdXQ6IG51bWJlciB9KTogbnVtYmVyO1xuZGVjbGFyZSBmdW5jdGlvbiBjYW5jZWxJZGxlQ2FsbGJhY2soaGFuZGxlOiBudW1iZXIpOiB2b2lkO1xuXG5kZWNsYXJlIGZ1bmN0aW9uIF9faW1wb3J0KHBhdGg6IHN0cmluZyk6IFByb21pc2U8YW55PjtcblxuYXN5bmMgZnVuY3Rpb24gd2Vidmlld1ByZWxvYWRzKGN0eDogUHJlbG9hZENvbnRleHQpIHtcblxuXHQvKiBlc2xpbnQtZGlzYWJsZSBuby1yZXN0cmljdGVkLWdsb2JhbHMsIG5vLXJlc3RyaWN0ZWQtc3ludGF4ICovXG5cblx0Ly8gVGhlIHVzZSBvZiBnbG9iYWwgYHdpbmRvd2Agc2hvdWxkIGJlIGZpbmUgaW4gdGhpcyBjb250ZXh0LCBldmVuXG5cdC8vIHdpdGggYXV4IHdpbmRvd3MuIFRoaXMgY29kZSBpcyBydW5uaW5nIGZyb20gd2l0aGluIGFuIGBpZnJhbWVgXG5cdC8vIHdoZXJlIHRoZXJlIGlzIG9ubHkgb25lIGB3aW5kb3dgIG9iamVjdCBhbnl3YXkuXG5cblx0Y29uc3QgdXNlckFnZW50ID0gbmF2aWdhdG9yLnVzZXJBZ2VudDtcblx0Y29uc3QgaXNDaHJvbWUgPSAodXNlckFnZW50LmluZGV4T2YoJ0Nocm9tZScpID49IDApO1xuXHRjb25zdCB0ZXh0RW5jb2RlciA9IG5ldyBUZXh0RW5jb2RlcigpO1xuXHRjb25zdCB0ZXh0RGVjb2RlciA9IG5ldyBUZXh0RGVjb2RlcigpO1xuXG5cdGZ1bmN0aW9uIHByb21pc2VXaXRoUmVzb2x2ZXJzPFQ+KCk6IHsgcHJvbWlzZTogUHJvbWlzZTxUPjsgcmVzb2x2ZTogKHZhbHVlOiBUIHwgUHJvbWlzZUxpa2U8VD4pID0+IHZvaWQ7IHJlamVjdDogKGVycj86IGFueSkgPT4gdm9pZCB9IHtcblx0XHRsZXQgcmVzb2x2ZTogKHZhbHVlOiBUIHwgUHJvbWlzZUxpa2U8VD4pID0+IHZvaWQ7XG5cdFx0bGV0IHJlamVjdDogKHJlYXNvbj86IGFueSkgPT4gdm9pZDtcblx0XHRjb25zdCBwcm9taXNlID0gbmV3IFByb21pc2U8VD4oKHJlcywgcmVqKSA9PiB7XG5cdFx0XHRyZXNvbHZlID0gcmVzO1xuXHRcdFx0cmVqZWN0ID0gcmVqO1xuXHRcdH0pO1xuXHRcdHJldHVybiB7IHByb21pc2UsIHJlc29sdmU6IHJlc29sdmUhLCByZWplY3Q6IHJlamVjdCEgfTtcblx0fVxuXG5cdGxldCBjdXJyZW50T3B0aW9ucyA9IGN0eC5vcHRpb25zO1xuXHRjb25zdCBpc1dvcmtzcGFjZVRydXN0ZWQgPSBjdHguaXNXb3Jrc3BhY2VUcnVzdGVkO1xuXHRsZXQgY3VycmVudFJlbmRlck9wdGlvbnMgPSBjdHgucmVuZGVyT3B0aW9ucztcblx0Y29uc3Qgc2V0dGluZ0NoYW5nZTogRW1pdHRlckxpa2U8UmVuZGVyT3B0aW9ucz4gPSBjcmVhdGVFbWl0dGVyPFJlbmRlck9wdGlvbnM+KCk7XG5cblx0Y29uc3QgYWNxdWlyZVZzQ29kZUFwaSA9IGdsb2JhbFRoaXMuYWNxdWlyZVZzQ29kZUFwaTtcblx0Y29uc3QgdnNjb2RlID0gYWNxdWlyZVZzQ29kZUFwaSgpO1xuXHRkZWxldGUgKGdsb2JhbFRoaXMgYXMgeyBhY3F1aXJlVnNDb2RlQXBpOiB1bmtub3duIH0pLmFjcXVpcmVWc0NvZGVBcGk7XG5cblx0Y29uc3QgdG9rZW5pemF0aW9uU3R5bGUgPSBuZXcgQ1NTU3R5bGVTaGVldCgpO1xuXHR0b2tlbml6YXRpb25TdHlsZS5yZXBsYWNlU3luYyhjdHguc3R5bGUudG9rZW5pemF0aW9uQ3NzKTtcblxuXHRjb25zdCBydW5XaGVuSWRsZTogKGNhbGxiYWNrOiAoaWRsZTogSWRsZURlYWRsaW5lKSA9PiB2b2lkLCB0aW1lb3V0PzogbnVtYmVyKSA9PiBJRGlzcG9zYWJsZSA9ICh0eXBlb2YgcmVxdWVzdElkbGVDYWxsYmFjayAhPT0gJ2Z1bmN0aW9uJyB8fCB0eXBlb2YgY2FuY2VsSWRsZUNhbGxiYWNrICE9PSAnZnVuY3Rpb24nKVxuXHRcdD8gKHJ1bm5lcikgPT4ge1xuXHRcdFx0c2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHRcdGlmIChkaXNwb3NlZCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBlbmQgPSBEYXRlLm5vdygpICsgMTU7IC8vIG9uZSBmcmFtZSBhdCA2NGZwc1xuXHRcdFx0XHRydW5uZXIoT2JqZWN0LmZyZWV6ZSh7XG5cdFx0XHRcdFx0ZGlkVGltZW91dDogdHJ1ZSxcblx0XHRcdFx0XHR0aW1lUmVtYWluaW5nKCkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIE1hdGgubWF4KDAsIGVuZCAtIERhdGUubm93KCkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSkpO1xuXHRcdFx0fSk7XG5cdFx0XHRsZXQgZGlzcG9zZWQgPSBmYWxzZTtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGRpc3Bvc2UoKSB7XG5cdFx0XHRcdFx0aWYgKGRpc3Bvc2VkKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGRpc3Bvc2VkID0gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fTtcblx0XHR9XG5cdFx0OiAocnVubmVyLCB0aW1lb3V0PykgPT4ge1xuXHRcdFx0Y29uc3QgaGFuZGxlOiBudW1iZXIgPSByZXF1ZXN0SWRsZUNhbGxiYWNrKHJ1bm5lciwgdHlwZW9mIHRpbWVvdXQgPT09ICdudW1iZXInID8geyB0aW1lb3V0IH0gOiB1bmRlZmluZWQpO1xuXHRcdFx0bGV0IGRpc3Bvc2VkID0gZmFsc2U7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRkaXNwb3NlKCkge1xuXHRcdFx0XHRcdGlmIChkaXNwb3NlZCkge1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRkaXNwb3NlZCA9IHRydWU7XG5cdFx0XHRcdFx0Y2FuY2VsSWRsZUNhbGxiYWNrKGhhbmRsZSk7XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cdFx0fTtcblx0ZnVuY3Rpb24gZ2V0T3V0cHV0Q29udGFpbmVyKGV2ZW50OiBGb2N1c0V2ZW50IHwgTW91c2VFdmVudCkge1xuXHRcdGZvciAoY29uc3Qgbm9kZSBvZiBldmVudC5jb21wb3NlZFBhdGgoKSkge1xuXHRcdFx0aWYgKG5vZGUgaW5zdGFuY2VvZiBIVE1MRWxlbWVudCAmJiBub2RlLmNsYXNzTGlzdC5jb250YWlucygnb3V0cHV0JykpIHtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRpZDogbm9kZS5pZFxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm47XG5cdH1cblx0bGV0IGxhc3RGb2N1c2VkT3V0cHV0OiB7IGlkOiBzdHJpbmcgfSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0Y29uc3QgaGFuZGxlT3V0cHV0Rm9jdXNPdXQgPSAoZXZlbnQ6IEZvY3VzRXZlbnQpID0+IHtcblx0XHRjb25zdCBvdXRwdXRGb2N1cyA9IGV2ZW50ICYmIGdldE91dHB1dENvbnRhaW5lcihldmVudCk7XG5cdFx0aWYgKCFvdXRwdXRGb2N1cykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHQvLyBQb3NzaWJsZSB3ZSdyZSB0YWJiaW5nIHRocm91Z2ggdGhlIGVsZW1lbnRzIG9mIHRoZSBzYW1lIG91dHB1dC5cblx0XHQvLyBMZXRzIHNlZSBpZiBmb2N1cyBpcyBzZXQgYmFjayB0byB0aGUgc2FtZSBvdXRwdXQuXG5cdFx0bGFzdEZvY3VzZWRPdXRwdXQgPSB1bmRlZmluZWQ7XG5cdFx0c2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHRpZiAobGFzdEZvY3VzZWRPdXRwdXQ/LmlkID09PSBvdXRwdXRGb2N1cy5pZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRwb3N0Tm90ZWJvb2tNZXNzYWdlPHdlYnZpZXdNZXNzYWdlcy5JT3V0cHV0Qmx1ck1lc3NhZ2U+KCdvdXRwdXRCbHVyJywgb3V0cHV0Rm9jdXMpO1xuXHRcdH0sIDApO1xuXHR9O1xuXG5cdGNvbnN0IGhhc0FjdGl2ZUVkaXRhYmxlRWxlbWVudCA9IChcblx0XHRwYXJlbnQ6IE5vZGUgfCBEb2N1bWVudEZyYWdtZW50LFxuXHRcdHJvb3Q6IFNoYWRvd1Jvb3QgfCBEb2N1bWVudCA9IGRvY3VtZW50XG5cdCk6IGJvb2xlYW4gPT4ge1xuXHRcdGNvbnN0IGVsZW1lbnQgPSByb290LmFjdGl2ZUVsZW1lbnQ7XG5cdFx0cmV0dXJuICEhKGVsZW1lbnQgJiYgcGFyZW50LmNvbnRhaW5zKGVsZW1lbnQpXG5cdFx0XHQmJiAoZWxlbWVudC5tYXRjaGVzKCc6cmVhZC13cml0ZScpIHx8IGVsZW1lbnQudGFnTmFtZS50b0xvd2VyQ2FzZSgpID09PSAnc2VsZWN0J1xuXHRcdFx0XHR8fCAoZWxlbWVudC5zaGFkb3dSb290ICYmIGhhc0FjdGl2ZUVkaXRhYmxlRWxlbWVudChlbGVtZW50LnNoYWRvd1Jvb3QsIGVsZW1lbnQuc2hhZG93Um9vdCkpKVxuXHRcdCk7XG5cdH07XG5cblx0Ly8gY2hlY2sgaWYgYW4gaW5wdXQgZWxlbWVudCBpcyBmb2N1c2VkIHdpdGhpbiB0aGUgb3V0cHV0IGVsZW1lbnRcblx0Y29uc3QgY2hlY2tPdXRwdXRJbnB1dEZvY3VzID0gKGU6IEZvY3VzRXZlbnQpID0+IHtcblx0XHRsYXN0Rm9jdXNlZE91dHB1dCA9IGdldE91dHB1dENvbnRhaW5lcihlKTtcblx0XHRjb25zdCBhY3RpdmVFbGVtZW50ID0gd2luZG93LmRvY3VtZW50LmFjdGl2ZUVsZW1lbnQ7XG5cdFx0aWYgKCFhY3RpdmVFbGVtZW50KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgaWQgPSBsYXN0Rm9jdXNlZE91dHB1dD8uaWQ7XG5cdFx0aWYgKGlkICYmIChoYXNBY3RpdmVFZGl0YWJsZUVsZW1lbnQoYWN0aXZlRWxlbWVudCwgd2luZG93LmRvY3VtZW50KSkpIHtcblx0XHRcdHBvc3ROb3RlYm9va01lc3NhZ2U8d2Vidmlld01lc3NhZ2VzLklPdXRwdXRJbnB1dEZvY3VzTWVzc2FnZT4oJ291dHB1dElucHV0Rm9jdXMnLCB7IGlucHV0Rm9jdXNlZDogdHJ1ZSwgaWQgfSk7XG5cblx0XHRcdGFjdGl2ZUVsZW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignYmx1cicsICgpID0+IHtcblx0XHRcdFx0cG9zdE5vdGVib29rTWVzc2FnZTx3ZWJ2aWV3TWVzc2FnZXMuSU91dHB1dElucHV0Rm9jdXNNZXNzYWdlPignb3V0cHV0SW5wdXRGb2N1cycsIHsgaW5wdXRGb2N1c2VkOiBmYWxzZSwgaWQgfSk7XG5cdFx0XHR9LCB7IG9uY2U6IHRydWUgfSk7XG5cdFx0fVxuXHR9O1xuXG5cdGNvbnN0IGhhbmRsZUlubmVyQ2xpY2sgPSAoZXZlbnQ6IE1vdXNlRXZlbnQpID0+IHtcblx0XHRpZiAoIWV2ZW50IHx8ICFldmVudC52aWV3IHx8ICFldmVudC52aWV3LmRvY3VtZW50KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgb3V0cHV0Rm9jdXMgPSBsYXN0Rm9jdXNlZE91dHB1dCA9IGdldE91dHB1dENvbnRhaW5lcihldmVudCk7XG5cdFx0Zm9yIChjb25zdCBub2RlIG9mIGV2ZW50LmNvbXBvc2VkUGF0aCgpKSB7XG5cdFx0XHRpZiAobm9kZSBpbnN0YW5jZW9mIEhUTUxBbmNob3JFbGVtZW50ICYmIG5vZGUuaHJlZikge1xuXHRcdFx0XHRpZiAobm9kZS5ocmVmLnN0YXJ0c1dpdGgoJ2Jsb2I6JykpIHtcblx0XHRcdFx0XHRpZiAob3V0cHV0Rm9jdXMpIHtcblx0XHRcdFx0XHRcdHBvc3ROb3RlYm9va01lc3NhZ2U8d2Vidmlld01lc3NhZ2VzLklPdXRwdXRGb2N1c01lc3NhZ2U+KCdvdXRwdXRGb2N1cycsIG91dHB1dEZvY3VzKTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRoYW5kbGVCbG9iVXJsQ2xpY2sobm9kZS5ocmVmLCBub2RlLmRvd25sb2FkKTtcblx0XHRcdFx0fSBlbHNlIGlmIChub2RlLmhyZWYuc3RhcnRzV2l0aCgnZGF0YTonKSkge1xuXHRcdFx0XHRcdGlmIChvdXRwdXRGb2N1cykge1xuXHRcdFx0XHRcdFx0cG9zdE5vdGVib29rTWVzc2FnZTx3ZWJ2aWV3TWVzc2FnZXMuSU91dHB1dEZvY3VzTWVzc2FnZT4oJ291dHB1dEZvY3VzJywgb3V0cHV0Rm9jdXMpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRoYW5kbGVEYXRhVXJsKG5vZGUuaHJlZiwgbm9kZS5kb3dubG9hZCk7XG5cdFx0XHRcdH0gZWxzZSBpZiAobm9kZS5nZXRBdHRyaWJ1dGUoJ2hyZWYnKT8udHJpbSgpLnN0YXJ0c1dpdGgoJyMnKSkge1xuXHRcdFx0XHRcdC8vIFNjcm9sbGluZyB0byBsb2NhdGlvbiB3aXRoaW4gY3VycmVudCBkb2NcblxuXHRcdFx0XHRcdGlmICghbm9kZS5oYXNoKSB7XG5cdFx0XHRcdFx0XHRwb3N0Tm90ZWJvb2tNZXNzYWdlPHdlYnZpZXdNZXNzYWdlcy5JU2Nyb2xsVG9SZXZlYWxNZXNzYWdlPignc2Nyb2xsLXRvLXJldmVhbCcsIHsgc2Nyb2xsVG9wOiAwIH0pO1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGNvbnN0IHRhcmdldElkID0gbm9kZS5oYXNoLnN1YnN0cmluZygxKTtcblxuXHRcdFx0XHRcdC8vIENoZWNrIG91dGVyIGRvY3VtZW50IGZpcnN0XG5cdFx0XHRcdFx0bGV0IHNjcm9sbFRhcmdldDogRWxlbWVudCB8IG51bGwgfCB1bmRlZmluZWQgPSBldmVudC52aWV3LmRvY3VtZW50LmdldEVsZW1lbnRCeUlkKHRhcmdldElkKTtcblxuXHRcdFx0XHRcdGlmICghc2Nyb2xsVGFyZ2V0KSB7XG5cdFx0XHRcdFx0XHQvLyBGYWxsYmFjayB0byBjaGVja2luZyBwcmV2aWV3IHNoYWRvdyBkb21zXG5cdFx0XHRcdFx0XHRmb3IgKGNvbnN0IHByZXZpZXcgb2YgZXZlbnQudmlldy5kb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCcucHJldmlldycpKSB7XG5cdFx0XHRcdFx0XHRcdHNjcm9sbFRhcmdldCA9IHByZXZpZXcuc2hhZG93Um9vdD8uZ2V0RWxlbWVudEJ5SWQodGFyZ2V0SWQpO1xuXHRcdFx0XHRcdFx0XHRpZiAoc2Nyb2xsVGFyZ2V0KSB7XG5cdFx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRpZiAoc2Nyb2xsVGFyZ2V0KSB7XG5cdFx0XHRcdFx0XHRjb25zdCBzY3JvbGxUb3AgPSBzY3JvbGxUYXJnZXQuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCkudG9wICsgZXZlbnQudmlldy5zY3JvbGxZO1xuXHRcdFx0XHRcdFx0cG9zdE5vdGVib29rTWVzc2FnZTx3ZWJ2aWV3TWVzc2FnZXMuSVNjcm9sbFRvUmV2ZWFsTWVzc2FnZT4oJ3Njcm9sbC10by1yZXZlYWwnLCB7IHNjcm9sbFRvcCB9KTtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Y29uc3QgaHJlZiA9IG5vZGUuZ2V0QXR0cmlidXRlKCdocmVmJyk7XG5cdFx0XHRcdFx0aWYgKGhyZWYpIHtcblx0XHRcdFx0XHRcdGlmIChocmVmLnN0YXJ0c1dpdGgoJ2NvbW1hbmQ6JykgJiYgb3V0cHV0Rm9jdXMpIHtcblx0XHRcdFx0XHRcdFx0cG9zdE5vdGVib29rTWVzc2FnZTx3ZWJ2aWV3TWVzc2FnZXMuSU91dHB1dEZvY3VzTWVzc2FnZT4oJ291dHB1dEZvY3VzJywgb3V0cHV0Rm9jdXMpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0cG9zdE5vdGVib29rTWVzc2FnZTx3ZWJ2aWV3TWVzc2FnZXMuSUNsaWNrZWRMaW5rTWVzc2FnZT4oJ2NsaWNrZWQtbGluaycsIHsgaHJlZiB9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHRldmVudC5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChvdXRwdXRGb2N1cykge1xuXHRcdFx0cG9zdE5vdGVib29rTWVzc2FnZTx3ZWJ2aWV3TWVzc2FnZXMuSU91dHB1dEZvY3VzTWVzc2FnZT4oJ291dHB1dEZvY3VzJywgb3V0cHV0Rm9jdXMpO1xuXHRcdH1cblx0fTtcblxuXHRjb25zdCBibHVyT3V0cHV0ID0gKCkgPT4ge1xuXHRcdGNvbnN0IHNlbGVjdGlvbiA9IHdpbmRvdy5nZXRTZWxlY3Rpb24oKTtcblx0XHRpZiAoIXNlbGVjdGlvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRzZWxlY3Rpb24ucmVtb3ZlQWxsUmFuZ2VzKCk7XG5cdH07XG5cblx0Y29uc3Qgc2VsZWN0T3V0cHV0Q29udGVudHMgPSAoY2VsbE9yT3V0cHV0SWQ6IHN0cmluZykgPT4ge1xuXHRcdGNvbnN0IHNlbGVjdGlvbiA9IHdpbmRvdy5nZXRTZWxlY3Rpb24oKTtcblx0XHRpZiAoIXNlbGVjdGlvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBjZWxsT3V0cHV0Q29udGFpbmVyID0gd2luZG93LmRvY3VtZW50LmdldEVsZW1lbnRCeUlkKGNlbGxPck91dHB1dElkKTtcblx0XHRpZiAoIWNlbGxPdXRwdXRDb250YWluZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0c2VsZWN0aW9uLnJlbW92ZUFsbFJhbmdlcygpO1xuXHRcdGNvbnN0IHJhbmdlID0gZG9jdW1lbnQuY3JlYXRlUmFuZ2UoKTtcblx0XHRyYW5nZS5zZWxlY3ROb2RlKGNlbGxPdXRwdXRDb250YWluZXIpO1xuXHRcdHNlbGVjdGlvbi5hZGRSYW5nZShyYW5nZSk7XG5cblx0fTtcblxuXHRjb25zdCBzZWxlY3RJbnB1dENvbnRlbnRzID0gKGNlbGxPck91dHB1dElkOiBzdHJpbmcpID0+IHtcblx0XHRjb25zdCBjZWxsT3V0cHV0Q29udGFpbmVyID0gd2luZG93LmRvY3VtZW50LmdldEVsZW1lbnRCeUlkKGNlbGxPck91dHB1dElkKTtcblx0XHRpZiAoIWNlbGxPdXRwdXRDb250YWluZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgYWN0aXZlRWxlbWVudCA9IHdpbmRvdy5kb2N1bWVudC5hY3RpdmVFbGVtZW50O1xuXHRcdGlmIChhY3RpdmVFbGVtZW50ICYmIGhhc0FjdGl2ZUVkaXRhYmxlRWxlbWVudChhY3RpdmVFbGVtZW50LCB3aW5kb3cuZG9jdW1lbnQpKSB7XG5cdFx0XHQoYWN0aXZlRWxlbWVudCBhcyBIVE1MSW5wdXRFbGVtZW50KS5zZWxlY3QoKTtcblx0XHR9XG5cdH07XG5cblx0Y29uc3Qgb25QYWdlVXBEb3duU2VsZWN0aW9uSGFuZGxlciA9IChlOiBLZXlib2FyZEV2ZW50KSA9PiB7XG5cdFx0aWYgKCFsYXN0Rm9jdXNlZE91dHB1dD8uaWQgfHwgIWUuc2hpZnRLZXkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBJZiB3ZSdyZSBwcmVzc2luZyBgU2hpZnQrVXAvRG93bmAgdGhlbiB3ZSB3YW50IHRvIHNlbGVjdCBhIGxpbmUgYXQgYSB0aW1lLlxuXHRcdGlmIChlLnNoaWZ0S2V5ICYmIChlLmNvZGUgPT09ICdBcnJvd1VwJyB8fCBlLmNvZGUgPT09ICdBcnJvd0Rvd24nKSkge1xuXHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTsgLy8gV2UgZG9uJ3Qgd2FudCB0aGUgbm90ZWJvb2sgdG8gaGFuZGxlIHRoaXMsIGRlZmF1bHQgYmVoYXZpb3IgaXMgd2hhdCB3ZSBuZWVkLlxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIFdlIHdhbnQgdG8gaGFuZGxlIGp1c3QgYFNoaWZ0ICsgUGFnZVVwL1BhZ2VEb3duYCAmIGBTaGlmdCArIENtZCArIEFycm93VXAvQXJyb3dEb3duYCAoZm9yIG1hYylcblx0XHRpZiAoIShlLmNvZGUgPT09ICdQYWdlVXAnIHx8IGUuY29kZSA9PT0gJ1BhZ2VEb3duJykgJiYgIShlLm1ldGFLZXkgJiYgKGUuY29kZSA9PT0gJ0Fycm93RG93bicgfHwgZS5jb2RlID09PSAnQXJyb3dVcCcpKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBvdXRwdXRDb250YWluZXIgPSB3aW5kb3cuZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQobGFzdEZvY3VzZWRPdXRwdXQuaWQpO1xuXHRcdGNvbnN0IHNlbGVjdGlvbiA9IHdpbmRvdy5nZXRTZWxlY3Rpb24oKTtcblx0XHRpZiAoIW91dHB1dENvbnRhaW5lciB8fCAhc2VsZWN0aW9uPy5hbmNob3JOb2RlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGFjdGl2ZUVsZW1lbnQgPSB3aW5kb3cuZG9jdW1lbnQuYWN0aXZlRWxlbWVudDtcblx0XHRpZiAoYWN0aXZlRWxlbWVudCAmJiBoYXNBY3RpdmVFZGl0YWJsZUVsZW1lbnQoYWN0aXZlRWxlbWVudCwgd2luZG93LmRvY3VtZW50KSkge1xuXHRcdFx0Ly8gTGVhdmUgZm9yIGRlZmF1bHQgYmVoYXZpb3IuXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gVGhlc2Ugc2hvdWxkIGNoYW5nZSB0aGUgc2Nyb2xsIHBvc2l0aW9uLCBub3QgYWRqdXN0IHRoZSBzZWxlY3RlZCBjZWxsIGluIHRoZSBub3RlYm9va1xuXHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7IC8vIFdlIGRvbid0IHdhbnQgdGhlIG5vdGVib29rIHRvIGhhbmRsZSB0aGlzLlxuXHRcdGUucHJldmVudERlZmF1bHQoKTsgLy8gV2Ugd2lsbCBoYW5kbGUgc2VsZWN0aW9uLlxuXG5cdFx0Y29uc3QgeyBhbmNob3JOb2RlLCBhbmNob3JPZmZzZXQgfSA9IHNlbGVjdGlvbjtcblx0XHRjb25zdCByYW5nZSA9IGRvY3VtZW50LmNyZWF0ZVJhbmdlKCk7XG5cdFx0aWYgKGUuY29kZSA9PT0gJ1BhZ2VEb3duJyB8fCBlLmNvZGUgPT09ICdBcnJvd0Rvd24nKSB7XG5cdFx0XHRyYW5nZS5zZXRTdGFydChhbmNob3JOb2RlLCBhbmNob3JPZmZzZXQpO1xuXHRcdFx0cmFuZ2Uuc2V0RW5kKG91dHB1dENvbnRhaW5lciwgMSk7XG5cdFx0fVxuXHRcdGVsc2Uge1xuXHRcdFx0cmFuZ2Uuc2V0U3RhcnQob3V0cHV0Q29udGFpbmVyLCAwKTtcblx0XHRcdHJhbmdlLnNldEVuZChhbmNob3JOb2RlLCBhbmNob3JPZmZzZXQpO1xuXHRcdH1cblx0XHRzZWxlY3Rpb24ucmVtb3ZlQWxsUmFuZ2VzKCk7XG5cdFx0c2VsZWN0aW9uLmFkZFJhbmdlKHJhbmdlKTtcblx0fTtcblxuXHRjb25zdCBkaXNhYmxlTmF0aXZlU2VsZWN0QWxsID0gKGU6IEtleWJvYXJkRXZlbnQpID0+IHtcblx0XHRpZiAoIWxhc3RGb2N1c2VkT3V0cHV0Py5pZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBhY3RpdmVFbGVtZW50ID0gd2luZG93LmRvY3VtZW50LmFjdGl2ZUVsZW1lbnQ7XG5cdFx0aWYgKGFjdGl2ZUVsZW1lbnQgJiYgaGFzQWN0aXZlRWRpdGFibGVFbGVtZW50KGFjdGl2ZUVsZW1lbnQsIHdpbmRvdy5kb2N1bWVudCkpIHtcblx0XHRcdC8vIFRoZSBpbnB1dCBlbGVtZW50IHdpbGwgaGFuZGxlIHRoaXMuXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKChlLmtleSA9PT0gJ2EnICYmIGUuY3RybEtleSkgfHwgKGUubWV0YUtleSAmJiBlLmtleSA9PT0gJ2EnKSkge1xuXHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpOyAvLyBXZSB3aWxsIGhhbmRsZSBzZWxlY3Rpb24gaW4gZWRpdG9yIGNvZGUuXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHR9O1xuXG5cdGNvbnN0IGhhbmRsZURhdGFVcmwgPSBhc3luYyAoZGF0YTogc3RyaW5nIHwgQXJyYXlCdWZmZXIgfCBudWxsLCBkb3dubG9hZE5hbWU6IHN0cmluZykgPT4ge1xuXHRcdHBvc3ROb3RlYm9va01lc3NhZ2U8d2Vidmlld01lc3NhZ2VzLklDbGlja2VkRGF0YVVybE1lc3NhZ2U+KCdjbGlja2VkLWRhdGEtdXJsJywge1xuXHRcdFx0ZGF0YSxcblx0XHRcdGRvd25sb2FkTmFtZVxuXHRcdH0pO1xuXHR9O1xuXG5cdGNvbnN0IGhhbmRsZUJsb2JVcmxDbGljayA9IGFzeW5jICh1cmw6IHN0cmluZywgZG93bmxvYWROYW1lOiBzdHJpbmcpID0+IHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaCh1cmwpO1xuXHRcdFx0Y29uc3QgYmxvYiA9IGF3YWl0IHJlc3BvbnNlLmJsb2IoKTtcblx0XHRcdGNvbnN0IHJlYWRlciA9IG5ldyBGaWxlUmVhZGVyKCk7XG5cdFx0XHRyZWFkZXIuYWRkRXZlbnRMaXN0ZW5lcignbG9hZCcsICgpID0+IHtcblx0XHRcdFx0aGFuZGxlRGF0YVVybChyZWFkZXIucmVzdWx0LCBkb3dubG9hZE5hbWUpO1xuXHRcdFx0fSk7XG5cdFx0XHRyZWFkZXIucmVhZEFzRGF0YVVSTChibG9iKTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRjb25zb2xlLmVycm9yKGUubWVzc2FnZSk7XG5cdFx0fVxuXHR9O1xuXG5cdHdpbmRvdy5kb2N1bWVudC5ib2R5LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgaGFuZGxlSW5uZXJDbGljayk7XG5cdHdpbmRvdy5kb2N1bWVudC5ib2R5LmFkZEV2ZW50TGlzdGVuZXIoJ2ZvY3VzaW4nLCBjaGVja091dHB1dElucHV0Rm9jdXMpO1xuXHR3aW5kb3cuZG9jdW1lbnQuYm9keS5hZGRFdmVudExpc3RlbmVyKCdmb2N1c291dCcsIGhhbmRsZU91dHB1dEZvY3VzT3V0KTtcblx0d2luZG93LmRvY3VtZW50LmJvZHkuYWRkRXZlbnRMaXN0ZW5lcigna2V5ZG93bicsIG9uUGFnZVVwRG93blNlbGVjdGlvbkhhbmRsZXIpO1xuXHR3aW5kb3cuZG9jdW1lbnQuYm9keS5hZGRFdmVudExpc3RlbmVyKCdrZXlkb3duJywgZGlzYWJsZU5hdGl2ZVNlbGVjdEFsbCk7XG5cblx0aW50ZXJmYWNlIFJlbmRlcmVyQ29udGV4dCBleHRlbmRzIHJlbmRlcmVyQXBpLlJlbmRlcmVyQ29udGV4dDx1bmtub3duPiB7XG5cdFx0cmVhZG9ubHkgb25EaWRDaGFuZ2VTZXR0aW5nczogRXZlbnQ8UmVuZGVyT3B0aW9ucz47XG5cdFx0cmVhZG9ubHkgc2V0dGluZ3M6IFJlbmRlck9wdGlvbnM7XG5cdH1cblxuXHRpbnRlcmZhY2UgUmVuZGVyZXJNb2R1bGUge1xuXHRcdHJlYWRvbmx5IGFjdGl2YXRlOiByZW5kZXJlckFwaS5BY3RpdmF0aW9uRnVuY3Rpb247XG5cdH1cblxuXHRpbnRlcmZhY2UgS2VybmVsUHJlbG9hZENvbnRleHQge1xuXHRcdHJlYWRvbmx5IG9uRGlkUmVjZWl2ZUtlcm5lbE1lc3NhZ2U6IEV2ZW50PHVua25vd24+O1xuXHRcdHBvc3RLZXJuZWxNZXNzYWdlKGRhdGE6IHVua25vd24pOiB2b2lkO1xuXHR9XG5cblx0aW50ZXJmYWNlIEtlcm5lbFByZWxvYWRNb2R1bGUge1xuXHRcdGFjdGl2YXRlKGN0eDogS2VybmVsUHJlbG9hZENvbnRleHQpOiBQcm9taXNlPHZvaWQ+IHwgdm9pZDtcblx0fVxuXG5cdGludGVyZmFjZSBJT2JzZXJ2ZWRFbGVtZW50IHtcblx0XHRpZDogc3RyaW5nO1xuXHRcdG91dHB1dDogYm9vbGVhbjtcblx0XHRsYXN0S25vd25QYWRkaW5nOiBudW1iZXI7XG5cdFx0bGFzdEtub3duSGVpZ2h0OiBudW1iZXI7XG5cdFx0Y2VsbElkOiBzdHJpbmc7XG5cdH1cblxuXHRmdW5jdGlvbiBjcmVhdGVLZXJuZWxDb250ZXh0KCk6IEtlcm5lbFByZWxvYWRDb250ZXh0IHtcblx0XHRyZXR1cm4gT2JqZWN0LmZyZWV6ZSh7XG5cdFx0XHRvbkRpZFJlY2VpdmVLZXJuZWxNZXNzYWdlOiBvbkRpZFJlY2VpdmVLZXJuZWxNZXNzYWdlLmV2ZW50LFxuXHRcdFx0cG9zdEtlcm5lbE1lc3NhZ2U6IChkYXRhOiB1bmtub3duKSA9PiBwb3N0Tm90ZWJvb2tNZXNzYWdlKCdjdXN0b21LZXJuZWxNZXNzYWdlJywgeyBtZXNzYWdlOiBkYXRhIH0pLFxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgZnVuY3Rpb24gcnVuS2VybmVsUHJlbG9hZCh1cmw6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRyeSB7XG5cdFx0XHRyZXR1cm4gYXdhaXQgYWN0aXZhdGVNb2R1bGVLZXJuZWxQcmVsb2FkKHVybCk7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0Y29uc29sZS5lcnJvcihlKTtcblx0XHRcdHRocm93IGU7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgZnVuY3Rpb24gYWN0aXZhdGVNb2R1bGVLZXJuZWxQcmVsb2FkKHVybDogc3RyaW5nKSB7XG5cdFx0Y29uc3QgbW9kdWxlOiBLZXJuZWxQcmVsb2FkTW9kdWxlID0gYXdhaXQgX19pbXBvcnQodXJsKTtcblx0XHRpZiAoIW1vZHVsZS5hY3RpdmF0ZSkge1xuXHRcdFx0Y29uc29sZS5lcnJvcihgTm90ZWJvb2sgcHJlbG9hZCAnJHt1cmx9JyB3YXMgZXhwZWN0ZWQgdG8gYmUgYSBtb2R1bGUgYnV0IGl0IGRvZXMgbm90IGV4cG9ydCBhbiAnYWN0aXZhdGUnIGZ1bmN0aW9uYCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHJldHVybiBtb2R1bGUuYWN0aXZhdGUoY3JlYXRlS2VybmVsQ29udGV4dCgpKTtcblx0fVxuXG5cdGNvbnN0IGRpbWVuc2lvblVwZGF0ZXIgPSBuZXcgY2xhc3Mge1xuXHRcdHByaXZhdGUgcmVhZG9ubHkgcGVuZGluZyA9IG5ldyBNYXA8c3RyaW5nLCB3ZWJ2aWV3TWVzc2FnZXMuRGltZW5zaW9uVXBkYXRlPigpO1xuXG5cdFx0dXBkYXRlSGVpZ2h0KGlkOiBzdHJpbmcsIGhlaWdodDogbnVtYmVyLCBvcHRpb25zOiB7IGluaXQ/OiBib29sZWFuOyBpc091dHB1dD86IGJvb2xlYW4gfSkge1xuXHRcdFx0aWYgKCF0aGlzLnBlbmRpbmcuc2l6ZSkge1xuXHRcdFx0XHRzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdFx0XHR0aGlzLnVwZGF0ZUltbWVkaWF0ZWx5KCk7XG5cdFx0XHRcdH0sIDApO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgdXBkYXRlID0gdGhpcy5wZW5kaW5nLmdldChpZCk7XG5cdFx0XHRpZiAodXBkYXRlICYmIHVwZGF0ZS5pc091dHB1dCkge1xuXHRcdFx0XHR0aGlzLnBlbmRpbmcuc2V0KGlkLCB7XG5cdFx0XHRcdFx0aWQsXG5cdFx0XHRcdFx0aGVpZ2h0LFxuXHRcdFx0XHRcdGluaXQ6IHVwZGF0ZS5pbml0LFxuXHRcdFx0XHRcdGlzT3V0cHV0OiB1cGRhdGUuaXNPdXRwdXRcblx0XHRcdFx0fSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLnBlbmRpbmcuc2V0KGlkLCB7XG5cdFx0XHRcdFx0aWQsXG5cdFx0XHRcdFx0aGVpZ2h0LFxuXHRcdFx0XHRcdC4uLm9wdGlvbnMsXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHVwZGF0ZUltbWVkaWF0ZWx5KCkge1xuXHRcdFx0aWYgKCF0aGlzLnBlbmRpbmcuc2l6ZSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHBvc3ROb3RlYm9va01lc3NhZ2U8d2Vidmlld01lc3NhZ2VzLklEaW1lbnNpb25NZXNzYWdlPignZGltZW5zaW9uJywge1xuXHRcdFx0XHR1cGRhdGVzOiBBcnJheS5mcm9tKHRoaXMucGVuZGluZy52YWx1ZXMoKSlcblx0XHRcdH0pO1xuXHRcdFx0dGhpcy5wZW5kaW5nLmNsZWFyKCk7XG5cdFx0fVxuXHR9O1xuXG5cdGZ1bmN0aW9uIGVsZW1lbnRIYXNDb250ZW50KGhlaWdodDogbnVtYmVyKSB7XG5cdFx0Ly8gd2UgbmVlZCB0byBhY2NvdW50IGZvciBhIHBvdGVudGlhbCAxcHggdG9wIGFuZCBib3R0b20gYm9yZGVyIG9uIGEgY2hpbGQgd2l0aGluIHRoZSBvdXRwdXQgY29udGFpbmVyXG5cdFx0cmV0dXJuIGhlaWdodCA+IDIuMTtcblx0fVxuXG5cdGNvbnN0IHJlc2l6ZU9ic2VydmVyID0gbmV3IGNsYXNzIHtcblxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX29ic2VydmVyOiBSZXNpemVPYnNlcnZlcjtcblxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX29ic2VydmVkRWxlbWVudHMgPSBuZXcgV2Vha01hcDxFbGVtZW50LCBJT2JzZXJ2ZWRFbGVtZW50PigpO1xuXHRcdHByaXZhdGUgX291dHB1dFJlc2l6ZVRpbWVyOiBUaW1lb3V0IHwgdW5kZWZpbmVkO1xuXG5cdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHR0aGlzLl9vYnNlcnZlciA9IG5ldyBSZXNpemVPYnNlcnZlcihlbnRyaWVzID0+IHtcblx0XHRcdFx0Zm9yIChjb25zdCBlbnRyeSBvZiBlbnRyaWVzKSB7XG5cdFx0XHRcdFx0aWYgKCF3aW5kb3cuZG9jdW1lbnQuYm9keS5jb250YWlucyhlbnRyeS50YXJnZXQpKSB7XG5cdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRjb25zdCBvYnNlcnZlZEVsZW1lbnRJbmZvID0gdGhpcy5fb2JzZXJ2ZWRFbGVtZW50cy5nZXQoZW50cnkudGFyZ2V0KTtcblx0XHRcdFx0XHRpZiAoIW9ic2VydmVkRWxlbWVudEluZm8pIHtcblx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHRoaXMucG9zdFJlc2l6ZU1lc3NhZ2Uob2JzZXJ2ZWRFbGVtZW50SW5mby5jZWxsSWQpO1xuXG5cdFx0XHRcdFx0aWYgKGVudHJ5LnRhcmdldC5pZCAhPT0gb2JzZXJ2ZWRFbGVtZW50SW5mby5pZCkge1xuXHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0aWYgKCFlbnRyeS5jb250ZW50UmVjdCkge1xuXHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0aWYgKCFvYnNlcnZlZEVsZW1lbnRJbmZvLm91dHB1dCkge1xuXHRcdFx0XHRcdFx0Ly8gbWFya3VwLCB1cGRhdGUgZGlyZWN0bHlcblx0XHRcdFx0XHRcdHRoaXMudXBkYXRlSGVpZ2h0KG9ic2VydmVkRWxlbWVudEluZm8sIGVudHJ5LnRhcmdldC5vZmZzZXRIZWlnaHQpO1xuXHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Y29uc3QgaGFzQ29udGVudCA9IGVsZW1lbnRIYXNDb250ZW50KGVudHJ5LmNvbnRlbnRSZWN0LmhlaWdodCk7XG5cdFx0XHRcdFx0Y29uc3Qgc2hvdWxkVXBkYXRlUGFkZGluZyA9XG5cdFx0XHRcdFx0XHQoaGFzQ29udGVudCAmJiBvYnNlcnZlZEVsZW1lbnRJbmZvLmxhc3RLbm93blBhZGRpbmcgPT09IDApIHx8XG5cdFx0XHRcdFx0XHQoIWhhc0NvbnRlbnQgJiYgb2JzZXJ2ZWRFbGVtZW50SW5mby5sYXN0S25vd25QYWRkaW5nICE9PSAwKTtcblxuXHRcdFx0XHRcdGlmIChzaG91bGRVcGRhdGVQYWRkaW5nKSB7XG5cdFx0XHRcdFx0XHQvLyBEbyBub3QgdXBkYXRlIGRpbWVuc2lvbiBpbiByZXNpemUgb2JzZXJ2ZXJcblx0XHRcdFx0XHRcdHdpbmRvdy5yZXF1ZXN0QW5pbWF0aW9uRnJhbWUoKCkgPT4ge1xuXHRcdFx0XHRcdFx0XHRpZiAoaGFzQ29udGVudCkge1xuXHRcdFx0XHRcdFx0XHRcdGVudHJ5LnRhcmdldC5zdHlsZS5wYWRkaW5nID0gYCR7Y3R4LnN0eWxlLm91dHB1dE5vZGVQYWRkaW5nfXB4ICR7Y3R4LnN0eWxlLm91dHB1dE5vZGVQYWRkaW5nfXB4ICR7Y3R4LnN0eWxlLm91dHB1dE5vZGVQYWRkaW5nfXB4ICR7Y3R4LnN0eWxlLm91dHB1dE5vZGVMZWZ0UGFkZGluZ31weGA7XG5cdFx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdFx0ZW50cnkudGFyZ2V0LnN0eWxlLnBhZGRpbmcgPSBgMHB4YDtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR0aGlzLnVwZGF0ZUhlaWdodChvYnNlcnZlZEVsZW1lbnRJbmZvLCBoYXNDb250ZW50ID8gZW50cnkudGFyZ2V0Lm9mZnNldEhlaWdodCA6IDApO1xuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHRoaXMudXBkYXRlSGVpZ2h0KG9ic2VydmVkRWxlbWVudEluZm8sIGhhc0NvbnRlbnQgPyBlbnRyeS50YXJnZXQub2Zmc2V0SGVpZ2h0IDogMCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRwcml2YXRlIHVwZGF0ZUhlaWdodChvYnNlcnZlZEVsZW1lbnRJbmZvOiBJT2JzZXJ2ZWRFbGVtZW50LCBvZmZzZXRIZWlnaHQ6IG51bWJlcikge1xuXHRcdFx0aWYgKG9ic2VydmVkRWxlbWVudEluZm8ubGFzdEtub3duSGVpZ2h0ICE9PSBvZmZzZXRIZWlnaHQpIHtcblx0XHRcdFx0b2JzZXJ2ZWRFbGVtZW50SW5mby5sYXN0S25vd25IZWlnaHQgPSBvZmZzZXRIZWlnaHQ7XG5cdFx0XHRcdGRpbWVuc2lvblVwZGF0ZXIudXBkYXRlSGVpZ2h0KG9ic2VydmVkRWxlbWVudEluZm8uaWQsIG9mZnNldEhlaWdodCwge1xuXHRcdFx0XHRcdGlzT3V0cHV0OiBvYnNlcnZlZEVsZW1lbnRJbmZvLm91dHB1dFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRwdWJsaWMgb2JzZXJ2ZShjb250YWluZXI6IEVsZW1lbnQsIGlkOiBzdHJpbmcsIG91dHB1dDogYm9vbGVhbiwgY2VsbElkOiBzdHJpbmcpIHtcblx0XHRcdGlmICh0aGlzLl9vYnNlcnZlZEVsZW1lbnRzLmhhcyhjb250YWluZXIpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5fb2JzZXJ2ZWRFbGVtZW50cy5zZXQoY29udGFpbmVyLCB7IGlkLCBvdXRwdXQsIGxhc3RLbm93blBhZGRpbmc6IGN0eC5zdHlsZS5vdXRwdXROb2RlUGFkZGluZywgbGFzdEtub3duSGVpZ2h0OiAtMSwgY2VsbElkIH0pO1xuXHRcdFx0dGhpcy5fb2JzZXJ2ZXIub2JzZXJ2ZShjb250YWluZXIpO1xuXHRcdH1cblxuXHRcdHByaXZhdGUgcG9zdFJlc2l6ZU1lc3NhZ2UoY2VsbElkOiBzdHJpbmcpIHtcblx0XHRcdC8vIERlYm91bmNlIHRoaXMgY2FsbGJhY2sgdG8gb25seSBoYXBwZW4gYWZ0ZXJcblx0XHRcdC8vIDI1MCBtcy4gRG9uJ3QgbmVlZCByZXNpemUgZXZlbnRzIHRoYXQgb2Z0ZW4uXG5cdFx0XHRjbGVhclRpbWVvdXQodGhpcy5fb3V0cHV0UmVzaXplVGltZXIpO1xuXHRcdFx0dGhpcy5fb3V0cHV0UmVzaXplVGltZXIgPSBzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdFx0cG9zdE5vdGVib29rTWVzc2FnZSgnb3V0cHV0UmVzaXplZCcsIHtcblx0XHRcdFx0XHRjZWxsSWRcblx0XHRcdFx0fSk7XG5cdFx0XHR9LCAyNTApO1xuXG5cdFx0fVxuXHR9O1xuXG5cdGxldCBwcmV2aW91c0RlbHRhOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdGxldCBzY3JvbGxUaW1lb3V0OiBUaW1lb3V0IHwgdW5kZWZpbmVkO1xuXHRsZXQgc2Nyb2xsZWRFbGVtZW50OiBFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRsZXQgbGFzdFRpbWVTY3JvbGxlZDogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRmdW5jdGlvbiBmbGFnUmVjZW50bHlTY3JvbGxlZChub2RlOiBFbGVtZW50LCBkZWx0YVk/OiBudW1iZXIpIHtcblx0XHRzY3JvbGxlZEVsZW1lbnQgPSBub2RlO1xuXHRcdGlmIChkZWx0YVkgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0bGFzdFRpbWVTY3JvbGxlZCA9IERhdGUubm93KCk7XG5cdFx0XHRwcmV2aW91c0RlbHRhID0gdW5kZWZpbmVkO1xuXHRcdFx0bm9kZS5zZXRBdHRyaWJ1dGUoJ3JlY2VudGx5U2Nyb2xsZWQnLCAndHJ1ZScpO1xuXHRcdFx0Y2xlYXJUaW1lb3V0KHNjcm9sbFRpbWVvdXQpO1xuXHRcdFx0c2Nyb2xsVGltZW91dCA9IHNldFRpbWVvdXQoKCkgPT4geyBzY3JvbGxlZEVsZW1lbnQ/LnJlbW92ZUF0dHJpYnV0ZSgncmVjZW50bHlTY3JvbGxlZCcpOyB9LCAzMDApO1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0aWYgKG5vZGUuaGFzQXR0cmlidXRlKCdyZWNlbnRseVNjcm9sbGVkJykpIHtcblx0XHRcdGlmIChsYXN0VGltZVNjcm9sbGVkICYmIERhdGUubm93KCkgLSBsYXN0VGltZVNjcm9sbGVkID4gNDAwKSB7XG5cdFx0XHRcdC8vIGl0IGhhcyBiZWVuIGEgd2hpbGUgc2luY2Ugd2UgYWN0dWFsbHkgc2Nyb2xsZWRcblx0XHRcdFx0Ly8gaWYgc2Nyb2xsIHZlbG9jaXR5IGluY3JlYXNlcyBzaWduaWZpY2FudGx5LCBpdCdzIGxpa2VseSBhIG5ldyBzY3JvbGwgZXZlbnRcblx0XHRcdFx0aWYgKCEhcHJldmlvdXNEZWx0YSAmJiBkZWx0YVkgPCAwICYmIGRlbHRhWSA8IHByZXZpb3VzRGVsdGEgLSA4KSB7XG5cdFx0XHRcdFx0Y2xlYXJUaW1lb3V0KHNjcm9sbFRpbWVvdXQpO1xuXHRcdFx0XHRcdHNjcm9sbGVkRWxlbWVudD8ucmVtb3ZlQXR0cmlidXRlKCdyZWNlbnRseVNjcm9sbGVkJyk7XG5cdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHR9IGVsc2UgaWYgKCEhcHJldmlvdXNEZWx0YSAmJiBkZWx0YVkgPiAwICYmIGRlbHRhWSA+IHByZXZpb3VzRGVsdGEgKyA4KSB7XG5cdFx0XHRcdFx0Y2xlYXJUaW1lb3V0KHNjcm9sbFRpbWVvdXQpO1xuXHRcdFx0XHRcdHNjcm9sbGVkRWxlbWVudD8ucmVtb3ZlQXR0cmlidXRlKCdyZWNlbnRseVNjcm9sbGVkJyk7XG5cdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gdGhlIHRhaWwgZW5kIG9mIGEgc21vb3RoIHNjcm9sbGluZyBldmVudCAoZnJvbSBhIHRyYWNrcGFkKSBjYW4gZ28gb24gZm9yIGEgd2hpbGVcblx0XHRcdFx0Ly8gc28ga2VlcCBzd2FsbG93aW5nIGl0LCBidXQgd2UgY2FuIHNob3J0ZW4gdGhlIHRpbWVvdXQgc2luY2UgdGhlIGV2ZW50cyBvY2N1ciByYXBpZGx5XG5cdFx0XHRcdGNsZWFyVGltZW91dChzY3JvbGxUaW1lb3V0KTtcblx0XHRcdFx0c2Nyb2xsVGltZW91dCA9IHNldFRpbWVvdXQoKCkgPT4geyBzY3JvbGxlZEVsZW1lbnQ/LnJlbW92ZUF0dHJpYnV0ZSgncmVjZW50bHlTY3JvbGxlZCcpOyB9LCA1MCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjbGVhclRpbWVvdXQoc2Nyb2xsVGltZW91dCk7XG5cdFx0XHRcdHNjcm9sbFRpbWVvdXQgPSBzZXRUaW1lb3V0KCgpID0+IHsgc2Nyb2xsZWRFbGVtZW50Py5yZW1vdmVBdHRyaWJ1dGUoJ3JlY2VudGx5U2Nyb2xsZWQnKTsgfSwgMzAwKTtcblx0XHRcdH1cblxuXHRcdFx0cHJldmlvdXNEZWx0YSA9IGRlbHRhWTtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdGZ1bmN0aW9uIGV2ZW50VGFyZ2V0U2hvdWxkSGFuZGxlU2Nyb2xsKGV2ZW50OiBXaGVlbEV2ZW50KSB7XG5cdFx0Zm9yIChsZXQgbm9kZSA9IGV2ZW50LnRhcmdldCBhcyBOb2RlIHwgbnVsbDsgbm9kZTsgbm9kZSA9IG5vZGUucGFyZW50Tm9kZSkge1xuXHRcdFx0aWYgKCEobm9kZSBpbnN0YW5jZW9mIEVsZW1lbnQpIHx8IG5vZGUuaWQgPT09ICdjb250YWluZXInIHx8IG5vZGUuY2xhc3NMaXN0LmNvbnRhaW5zKCdjZWxsX2NvbnRhaW5lcicpIHx8IG5vZGUuY2xhc3NMaXN0LmNvbnRhaW5zKCdtYXJrdXAnKSB8fCBub2RlLmNsYXNzTGlzdC5jb250YWlucygnb3V0cHV0X2NvbnRhaW5lcicpKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gc2Nyb2xsIHVwXG5cdFx0XHRpZiAoZXZlbnQuZGVsdGFZIDwgMCAmJiBub2RlLnNjcm9sbFRvcCA+IDApIHtcblx0XHRcdFx0Ly8gdGhlcmUgaXMgc3RpbGwgc29tZSBjb250ZW50IHRvIHNjcm9sbFxuXHRcdFx0XHRmbGFnUmVjZW50bHlTY3JvbGxlZChub2RlKTtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cblx0XHRcdC8vIHNjcm9sbCBkb3duXG5cdFx0XHRpZiAoZXZlbnQuZGVsdGFZID4gMCAmJiBub2RlLnNjcm9sbFRvcCArIG5vZGUuY2xpZW50SGVpZ2h0IDwgbm9kZS5zY3JvbGxIZWlnaHQpIHtcblx0XHRcdFx0Ly8gcGVyIGh0dHBzOi8vZGV2ZWxvcGVyLm1vemlsbGEub3JnL2VuLVVTL2RvY3MvV2ViL0FQSS9FbGVtZW50L3Njcm9sbEhlaWdodFxuXHRcdFx0XHQvLyBzY3JvbGxUb3AgaXMgbm90IHJvdW5kZWQgYnV0IHNjcm9sbEhlaWdodCBhbmQgY2xpZW50SGVpZ2h0IGFyZVxuXHRcdFx0XHQvLyBzbyB3ZSBuZWVkIHRvIGNoZWNrIGlmIHRoZSBkaWZmZXJlbmNlIGlzIGxlc3MgdGhhbiBzb21lIHRocmVzaG9sZFxuXHRcdFx0XHRpZiAobm9kZS5zY3JvbGxIZWlnaHQgLSBub2RlLnNjcm9sbFRvcCAtIG5vZGUuY2xpZW50SGVpZ2h0IDwgMikge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gaWYgdGhlIG5vZGUgaXMgbm90IHNjcm9sbGFibGUsIHdlIGNhbiBjb250aW51ZS4gV2UgZG9uJ3QgY2hlY2sgdGhlIGNvbXB1dGVkIHN0eWxlIGFsd2F5cyBhcyBpdCdzIGV4cGVuc2l2ZVxuXHRcdFx0XHRpZiAod2luZG93LmdldENvbXB1dGVkU3R5bGUobm9kZSkub3ZlcmZsb3dZID09PSAnaGlkZGVuJyB8fCB3aW5kb3cuZ2V0Q29tcHV0ZWRTdHlsZShub2RlKS5vdmVyZmxvd1kgPT09ICd2aXNpYmxlJykge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0ZmxhZ1JlY2VudGx5U2Nyb2xsZWQobm9kZSk7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoZmxhZ1JlY2VudGx5U2Nyb2xsZWQobm9kZSwgZXZlbnQuZGVsdGFZKSkge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRjb25zdCBoYW5kbGVXaGVlbCA9IChldmVudDogV2hlZWxFdmVudCAmIHsgd2hlZWxEZWx0YVg/OiBudW1iZXI7IHdoZWVsRGVsdGFZPzogbnVtYmVyOyB3aGVlbERlbHRhPzogbnVtYmVyIH0pID0+IHtcblx0XHRpZiAoZXZlbnQuZGVmYXVsdFByZXZlbnRlZCB8fCBldmVudFRhcmdldFNob3VsZEhhbmRsZVNjcm9sbChldmVudCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0cG9zdE5vdGVib29rTWVzc2FnZTx3ZWJ2aWV3TWVzc2FnZXMuSVdoZWVsTWVzc2FnZT4oJ2RpZC1zY3JvbGwtd2hlZWwnLCB7XG5cdFx0XHRwYXlsb2FkOiB7XG5cdFx0XHRcdGRlbHRhTW9kZTogZXZlbnQuZGVsdGFNb2RlLFxuXHRcdFx0XHRkZWx0YVg6IGV2ZW50LmRlbHRhWCxcblx0XHRcdFx0ZGVsdGFZOiBldmVudC5kZWx0YVksXG5cdFx0XHRcdGRlbHRhWjogZXZlbnQuZGVsdGFaLFxuXHRcdFx0XHQvLyBSZWZzIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xNDY0MDMjaXNzdWVjb21tZW50LTE4NTQ1Mzg5Mjhcblx0XHRcdFx0d2hlZWxEZWx0YTogZXZlbnQud2hlZWxEZWx0YSAmJiBpc0Nocm9tZSA/IChldmVudC53aGVlbERlbHRhIC8gd2luZG93LmRldmljZVBpeGVsUmF0aW8pIDogZXZlbnQud2hlZWxEZWx0YSxcblx0XHRcdFx0d2hlZWxEZWx0YVg6IGV2ZW50LndoZWVsRGVsdGFYICYmIGlzQ2hyb21lID8gKGV2ZW50LndoZWVsRGVsdGFYIC8gd2luZG93LmRldmljZVBpeGVsUmF0aW8pIDogZXZlbnQud2hlZWxEZWx0YVgsXG5cdFx0XHRcdHdoZWVsRGVsdGFZOiBldmVudC53aGVlbERlbHRhWSAmJiBpc0Nocm9tZSA/IChldmVudC53aGVlbERlbHRhWSAvIHdpbmRvdy5kZXZpY2VQaXhlbFJhdGlvKSA6IGV2ZW50LndoZWVsRGVsdGFZLFxuXHRcdFx0XHRkZXRhaWw6IGV2ZW50LmRldGFpbCxcblx0XHRcdFx0c2hpZnRLZXk6IGV2ZW50LnNoaWZ0S2V5LFxuXHRcdFx0XHR0eXBlOiBldmVudC50eXBlXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH07XG5cblx0ZnVuY3Rpb24gZm9jdXNGaXJzdEZvY3VzYWJsZU9yQ29udGFpbmVySW5PdXRwdXQoY2VsbE9yT3V0cHV0SWQ6IHN0cmluZywgYWx0ZXJuYXRlSWQ/OiBzdHJpbmcpIHtcblx0XHRjb25zdCBjZWxsT3V0cHV0Q29udGFpbmVyID0gd2luZG93LmRvY3VtZW50LmdldEVsZW1lbnRCeUlkKGNlbGxPck91dHB1dElkKSA/P1xuXHRcdFx0KCEhYWx0ZXJuYXRlSWQgPyB3aW5kb3cuZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoYWx0ZXJuYXRlSWQpIDogdW5kZWZpbmVkKTtcblx0XHRpZiAoISFjZWxsT3V0cHV0Q29udGFpbmVyKSB7XG5cdFx0XHRpZiAoY2VsbE91dHB1dENvbnRhaW5lci5jb250YWlucyh3aW5kb3cuZG9jdW1lbnQuYWN0aXZlRWxlbWVudCkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0bGV0IGZvY3VzYWJsZUVsZW1lbnQgPSBjZWxsT3V0cHV0Q29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoJ1t0YWJpbmRleD1cIjBcIl0sIFtocmVmXSwgYnV0dG9uLCBpbnB1dCwgb3B0aW9uLCBzZWxlY3QsIHRleHRhcmVhJykgYXMgSFRNTEVsZW1lbnQgfCBudWxsO1xuXHRcdFx0aWYgKCFmb2N1c2FibGVFbGVtZW50KSB7XG5cdFx0XHRcdGZvY3VzYWJsZUVsZW1lbnQgPSBjZWxsT3V0cHV0Q29udGFpbmVyO1xuXHRcdFx0XHRmb2N1c2FibGVFbGVtZW50LnRhYkluZGV4ID0gLTE7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChsYXN0Rm9jdXNlZE91dHB1dD8uaWQgIT09IGNlbGxPdXRwdXRDb250YWluZXIuaWQpIHtcblx0XHRcdFx0bGFzdEZvY3VzZWRPdXRwdXQgPSBjZWxsT3V0cHV0Q29udGFpbmVyO1xuXHRcdFx0XHRwb3N0Tm90ZWJvb2tNZXNzYWdlPHdlYnZpZXdNZXNzYWdlcy5JT3V0cHV0Rm9jdXNNZXNzYWdlPignb3V0cHV0Rm9jdXMnLCB7IGlkOiBjZWxsT3V0cHV0Q29udGFpbmVyLmlkIH0pO1xuXHRcdFx0fVxuXHRcdFx0Zm9jdXNhYmxlRWxlbWVudC5mb2N1cygpO1xuXHRcdH1cblx0fVxuXG5cdGZ1bmN0aW9uIGNyZWF0ZUZvY3VzU2luayhjZWxsSWQ6IHN0cmluZywgZm9jdXNOZXh0PzogYm9vbGVhbikge1xuXHRcdGNvbnN0IGVsZW1lbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRlbGVtZW50LmlkID0gYGZvY3VzLXNpbmstJHtjZWxsSWR9YDtcblx0XHRlbGVtZW50LnRhYkluZGV4ID0gMDtcblx0XHRlbGVtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2ZvY3VzJywgKCkgPT4ge1xuXHRcdFx0cG9zdE5vdGVib29rTWVzc2FnZTx3ZWJ2aWV3TWVzc2FnZXMuSUZvY3VzRWRpdG9yTWVzc2FnZT4oJ2ZvY3VzLWVkaXRvcicsIHtcblx0XHRcdFx0Y2VsbElkOiBjZWxsSWQsXG5cdFx0XHRcdGZvY3VzTmV4dFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gZWxlbWVudDtcblx0fVxuXG5cdGZ1bmN0aW9uIF9pbnRlcm5hbEhpZ2hsaWdodFJhbmdlKHJhbmdlOiBSYW5nZSwgdGFnTmFtZSA9ICdtYXJrJywgYXR0cmlidXRlcyA9IHt9KSB7XG5cdFx0Ly8gZGVyaXZlZCBmcm9tIGh0dHBzOi8vZ2l0aHViLmNvbS9UcmVvcmEvZG9tLWhpZ2hsaWdodC1yYW5nZS9ibG9iL21hc3Rlci9oaWdobGlnaHQtcmFuZ2UuanNcblxuXHRcdC8vIFJldHVybiBhbiBhcnJheSBvZiB0aGUgdGV4dCBub2RlcyBpbiB0aGUgcmFuZ2UuIFNwbGl0IHRoZSBzdGFydCBhbmQgZW5kIG5vZGVzIGlmIHJlcXVpcmVkLlxuXHRcdGZ1bmN0aW9uIF90ZXh0Tm9kZXNJblJhbmdlKHJhbmdlOiBSYW5nZSk6IFRleHRbXSB7XG5cdFx0XHRpZiAoIXJhbmdlLnN0YXJ0Q29udGFpbmVyLm93bmVyRG9jdW1lbnQpIHtcblx0XHRcdFx0cmV0dXJuIFtdO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBJZiB0aGUgc3RhcnQgb3IgZW5kIG5vZGUgaXMgYSB0ZXh0IG5vZGUgYW5kIG9ubHkgcGFydGx5IGluIHRoZSByYW5nZSwgc3BsaXQgaXQuXG5cdFx0XHRpZiAocmFuZ2Uuc3RhcnRDb250YWluZXIubm9kZVR5cGUgPT09IE5vZGUuVEVYVF9OT0RFICYmIHJhbmdlLnN0YXJ0T2Zmc2V0ID4gMCkge1xuXHRcdFx0XHRjb25zdCBzdGFydENvbnRhaW5lciA9IHJhbmdlLnN0YXJ0Q29udGFpbmVyIGFzIFRleHQ7XG5cdFx0XHRcdGNvbnN0IGVuZE9mZnNldCA9IHJhbmdlLmVuZE9mZnNldDsgLy8gKHRoaXMgbWF5IGdldCBsb3N0IHdoZW4gdGhlIHNwbGl0dGluZyB0aGUgbm9kZSlcblx0XHRcdFx0Y29uc3QgY3JlYXRlZE5vZGUgPSBzdGFydENvbnRhaW5lci5zcGxpdFRleHQocmFuZ2Uuc3RhcnRPZmZzZXQpO1xuXHRcdFx0XHRpZiAocmFuZ2UuZW5kQ29udGFpbmVyID09PSBzdGFydENvbnRhaW5lcikge1xuXHRcdFx0XHRcdC8vIElmIHRoZSBlbmQgd2FzIGluIHRoZSBzYW1lIGNvbnRhaW5lciwgaXQgd2lsbCBub3cgYmUgaW4gdGhlIG5ld2x5IGNyZWF0ZWQgbm9kZS5cblx0XHRcdFx0XHRyYW5nZS5zZXRFbmQoY3JlYXRlZE5vZGUsIGVuZE9mZnNldCAtIHJhbmdlLnN0YXJ0T2Zmc2V0KTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJhbmdlLnNldFN0YXJ0KGNyZWF0ZWROb2RlLCAwKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKFxuXHRcdFx0XHRyYW5nZS5lbmRDb250YWluZXIubm9kZVR5cGUgPT09IE5vZGUuVEVYVF9OT0RFXG5cdFx0XHRcdCYmIHJhbmdlLmVuZE9mZnNldCA8IChyYW5nZS5lbmRDb250YWluZXIgYXMgVGV4dCkubGVuZ3RoXG5cdFx0XHQpIHtcblx0XHRcdFx0KHJhbmdlLmVuZENvbnRhaW5lciBhcyBUZXh0KS5zcGxpdFRleHQocmFuZ2UuZW5kT2Zmc2V0KTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gQ29sbGVjdCB0aGUgdGV4dCBub2Rlcy5cblx0XHRcdGNvbnN0IHdhbGtlciA9IHJhbmdlLnN0YXJ0Q29udGFpbmVyLm93bmVyRG9jdW1lbnQuY3JlYXRlVHJlZVdhbGtlcihcblx0XHRcdFx0cmFuZ2UuY29tbW9uQW5jZXN0b3JDb250YWluZXIsXG5cdFx0XHRcdE5vZGVGaWx0ZXIuU0hPV19URVhULFxuXHRcdFx0XHRub2RlID0+IHJhbmdlLmludGVyc2VjdHNOb2RlKG5vZGUpID8gTm9kZUZpbHRlci5GSUxURVJfQUNDRVBUIDogTm9kZUZpbHRlci5GSUxURVJfUkVKRUNULFxuXHRcdFx0KTtcblxuXHRcdFx0d2Fsa2VyLmN1cnJlbnROb2RlID0gcmFuZ2Uuc3RhcnRDb250YWluZXI7XG5cblx0XHRcdC8vIC8vIE9wdGltaXNlIGJ5IHNraXBwaW5nIG5vZGVzIHRoYXQgYXJlIGV4cGxpY2l0bHkgb3V0c2lkZSB0aGUgcmFuZ2UuXG5cdFx0XHQvLyBjb25zdCBOb2RlVHlwZXNXaXRoQ2hhcmFjdGVyT2Zmc2V0ID0gW1xuXHRcdFx0Ly8gIE5vZGUuVEVYVF9OT0RFLFxuXHRcdFx0Ly8gIE5vZGUuUFJPQ0VTU0lOR19JTlNUUlVDVElPTl9OT0RFLFxuXHRcdFx0Ly8gIE5vZGUuQ09NTUVOVF9OT0RFLFxuXHRcdFx0Ly8gXTtcblx0XHRcdC8vIGlmICghTm9kZVR5cGVzV2l0aENoYXJhY3Rlck9mZnNldC5pbmNsdWRlcyhyYW5nZS5zdGFydENvbnRhaW5lci5ub2RlVHlwZSkpIHtcblx0XHRcdC8vICAgaWYgKHJhbmdlLnN0YXJ0T2Zmc2V0IDwgcmFuZ2Uuc3RhcnRDb250YWluZXIuY2hpbGROb2Rlcy5sZW5ndGgpIHtcblx0XHRcdC8vICAgICB3YWxrZXIuY3VycmVudE5vZGUgPSByYW5nZS5zdGFydENvbnRhaW5lci5jaGlsZE5vZGVzW3JhbmdlLnN0YXJ0T2Zmc2V0XTtcblx0XHRcdC8vICAgfSBlbHNlIHtcblx0XHRcdC8vICAgICB3YWxrZXIubmV4dFNpYmxpbmcoKTsgLy8gVE9ETyB2ZXJpZnkgdGhpcyBpcyBjb3JyZWN0LlxuXHRcdFx0Ly8gICB9XG5cdFx0XHQvLyB9XG5cblx0XHRcdGNvbnN0IG5vZGVzOiBUZXh0W10gPSBbXTtcblx0XHRcdGlmICh3YWxrZXIuY3VycmVudE5vZGUubm9kZVR5cGUgPT09IE5vZGUuVEVYVF9OT0RFKSB7XG5cdFx0XHRcdG5vZGVzLnB1c2god2Fsa2VyLmN1cnJlbnROb2RlIGFzIFRleHQpO1xuXHRcdFx0fVxuXG5cdFx0XHR3aGlsZSAod2Fsa2VyLm5leHROb2RlKCkgJiYgcmFuZ2UuY29tcGFyZVBvaW50KHdhbGtlci5jdXJyZW50Tm9kZSwgMCkgIT09IDEpIHtcblx0XHRcdFx0aWYgKHdhbGtlci5jdXJyZW50Tm9kZS5ub2RlVHlwZSA9PT0gTm9kZS5URVhUX05PREUpIHtcblx0XHRcdFx0XHRub2Rlcy5wdXNoKHdhbGtlci5jdXJyZW50Tm9kZSBhcyBUZXh0KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gbm9kZXM7XG5cdFx0fVxuXG5cdFx0Ly8gUmVwbGFjZSBbbm9kZV0gd2l0aCA8dGFnTmFtZSAuLi5hdHRyaWJ1dGVzPltub2RlXTwvdGFnTmFtZT5cblx0XHRmdW5jdGlvbiB3cmFwTm9kZUluSGlnaGxpZ2h0KG5vZGU6IFRleHQsIHRhZ05hbWU6IHN0cmluZywgYXR0cmlidXRlczogYW55KSB7XG5cdFx0XHRjb25zdCBoaWdobGlnaHRFbGVtZW50ID0gbm9kZS5vd25lckRvY3VtZW50LmNyZWF0ZUVsZW1lbnQodGFnTmFtZSk7XG5cdFx0XHRPYmplY3Qua2V5cyhhdHRyaWJ1dGVzKS5mb3JFYWNoKGtleSA9PiB7XG5cdFx0XHRcdGhpZ2hsaWdodEVsZW1lbnQuc2V0QXR0cmlidXRlKGtleSwgYXR0cmlidXRlc1trZXldKTtcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgdGVtcFJhbmdlID0gbm9kZS5vd25lckRvY3VtZW50LmNyZWF0ZVJhbmdlKCk7XG5cdFx0XHR0ZW1wUmFuZ2Uuc2VsZWN0Tm9kZShub2RlKTtcblx0XHRcdHRlbXBSYW5nZS5zdXJyb3VuZENvbnRlbnRzKGhpZ2hsaWdodEVsZW1lbnQpO1xuXHRcdFx0cmV0dXJuIGhpZ2hsaWdodEVsZW1lbnQ7XG5cdFx0fVxuXG5cdFx0aWYgKHJhbmdlLmNvbGxhcHNlZCkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0cmVtb3ZlOiAoKSA9PiB7IH0sXG5cdFx0XHRcdHVwZGF0ZTogKCkgPT4geyB9XG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdC8vIEZpcnN0IHB1dCBhbGwgbm9kZXMgaW4gYW4gYXJyYXkgKHNwbGl0cyBzdGFydCBhbmQgZW5kIG5vZGVzIGlmIG5lZWRlZClcblx0XHRjb25zdCBub2RlcyA9IF90ZXh0Tm9kZXNJblJhbmdlKHJhbmdlKTtcblxuXHRcdC8vIEhpZ2hsaWdodCBlYWNoIG5vZGVcblx0XHRjb25zdCBoaWdobGlnaHRFbGVtZW50czogRWxlbWVudFtdID0gW107XG5cdFx0Zm9yIChjb25zdCBub2RlSWR4IGluIG5vZGVzKSB7XG5cdFx0XHRjb25zdCBoaWdobGlnaHRFbGVtZW50ID0gd3JhcE5vZGVJbkhpZ2hsaWdodChub2Rlc1tub2RlSWR4XSwgdGFnTmFtZSwgYXR0cmlidXRlcyk7XG5cdFx0XHRoaWdobGlnaHRFbGVtZW50cy5wdXNoKGhpZ2hsaWdodEVsZW1lbnQpO1xuXHRcdH1cblxuXHRcdC8vIFJlbW92ZSBhIGhpZ2hsaWdodCBlbGVtZW50IGNyZWF0ZWQgd2l0aCB3cmFwTm9kZUluSGlnaGxpZ2h0LlxuXHRcdGZ1bmN0aW9uIF9yZW1vdmVIaWdobGlnaHQoaGlnaGxpZ2h0RWxlbWVudDogRWxlbWVudCkge1xuXHRcdFx0aWYgKGhpZ2hsaWdodEVsZW1lbnQuY2hpbGROb2Rlcy5sZW5ndGggPT09IDEpIHtcblx0XHRcdFx0aGlnaGxpZ2h0RWxlbWVudC5yZXBsYWNlV2l0aChoaWdobGlnaHRFbGVtZW50LmZpcnN0Q2hpbGQhKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIElmIHRoZSBoaWdobGlnaHQgc29tZWhvdyBjb250YWlucyBtdWx0aXBsZSBub2RlcyBub3csIG1vdmUgdGhlbSBhbGwuXG5cdFx0XHRcdHdoaWxlIChoaWdobGlnaHRFbGVtZW50LmZpcnN0Q2hpbGQpIHtcblx0XHRcdFx0XHRoaWdobGlnaHRFbGVtZW50LnBhcmVudE5vZGU/Lmluc2VydEJlZm9yZShoaWdobGlnaHRFbGVtZW50LmZpcnN0Q2hpbGQsIGhpZ2hsaWdodEVsZW1lbnQpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGhpZ2hsaWdodEVsZW1lbnQucmVtb3ZlKCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gUmV0dXJuIGEgZnVuY3Rpb24gdGhhdCBjbGVhbnMgdXAgdGhlIGhpZ2hsaWdodEVsZW1lbnRzLlxuXHRcdGZ1bmN0aW9uIF9yZW1vdmVIaWdobGlnaHRzKCkge1xuXHRcdFx0Ly8gUmVtb3ZlIGVhY2ggb2YgdGhlIGNyZWF0ZWQgaGlnaGxpZ2h0RWxlbWVudHMuXG5cdFx0XHRmb3IgKGNvbnN0IGhpZ2hsaWdodElkeCBpbiBoaWdobGlnaHRFbGVtZW50cykge1xuXHRcdFx0XHRfcmVtb3ZlSGlnaGxpZ2h0KGhpZ2hsaWdodEVsZW1lbnRzW2hpZ2hsaWdodElkeF0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGZ1bmN0aW9uIF91cGRhdGVIaWdobGlnaHQoaGlnaGxpZ2h0RWxlbWVudDogRWxlbWVudCwgYXR0cmlidXRlczogYW55ID0ge30pIHtcblx0XHRcdE9iamVjdC5rZXlzKGF0dHJpYnV0ZXMpLmZvckVhY2goa2V5ID0+IHtcblx0XHRcdFx0aGlnaGxpZ2h0RWxlbWVudC5zZXRBdHRyaWJ1dGUoa2V5LCBhdHRyaWJ1dGVzW2tleV0pO1xuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0ZnVuY3Rpb24gdXBkYXRlSGlnaGxpZ2h0cyhhdHRyaWJ1dGVzOiBhbnkpIHtcblx0XHRcdGZvciAoY29uc3QgaGlnaGxpZ2h0SWR4IGluIGhpZ2hsaWdodEVsZW1lbnRzKSB7XG5cdFx0XHRcdF91cGRhdGVIaWdobGlnaHQoaGlnaGxpZ2h0RWxlbWVudHNbaGlnaGxpZ2h0SWR4XSwgYXR0cmlidXRlcyk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdHJlbW92ZTogX3JlbW92ZUhpZ2hsaWdodHMsXG5cdFx0XHR1cGRhdGU6IHVwZGF0ZUhpZ2hsaWdodHNcblx0XHR9O1xuXHR9XG5cblx0aW50ZXJmYWNlIElDb21tb25SYW5nZSB7XG5cdFx0Y29sbGFwc2VkOiBib29sZWFuO1xuXHRcdGNvbW1vbkFuY2VzdG9yQ29udGFpbmVyOiBOb2RlO1xuXHRcdGVuZENvbnRhaW5lcjogTm9kZTtcblx0XHRlbmRPZmZzZXQ6IG51bWJlcjtcblx0XHRzdGFydENvbnRhaW5lcjogTm9kZTtcblx0XHRzdGFydE9mZnNldDogbnVtYmVyO1xuXG5cdH1cblxuXHRpbnRlcmZhY2UgSUhpZ2hsaWdodFJlc3VsdCB7XG5cdFx0cmFuZ2U6IElDb21tb25SYW5nZTtcblx0XHRkaXNwb3NlOiAoKSA9PiB2b2lkO1xuXHRcdHVwZGF0ZTogKGNvbG9yOiBzdHJpbmcgfCB1bmRlZmluZWQsIGNsYXNzTmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkKSA9PiB2b2lkO1xuXHR9XG5cblx0ZnVuY3Rpb24gc2VsZWN0UmFuZ2UoX3JhbmdlOiBJQ29tbW9uUmFuZ2UpIHtcblx0XHRjb25zdCBzZWwgPSB3aW5kb3cuZ2V0U2VsZWN0aW9uKCk7XG5cdFx0aWYgKHNlbCkge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0c2VsLnJlbW92ZUFsbFJhbmdlcygpO1xuXHRcdFx0XHRjb25zdCByID0gZG9jdW1lbnQuY3JlYXRlUmFuZ2UoKTtcblx0XHRcdFx0ci5zZXRTdGFydChfcmFuZ2Uuc3RhcnRDb250YWluZXIsIF9yYW5nZS5zdGFydE9mZnNldCk7XG5cdFx0XHRcdHIuc2V0RW5kKF9yYW5nZS5lbmRDb250YWluZXIsIF9yYW5nZS5lbmRPZmZzZXQpO1xuXHRcdFx0XHRzZWwuYWRkUmFuZ2Uocik7XG5cdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdGNvbnNvbGUubG9nKGUpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGZ1bmN0aW9uIGhpZ2hsaWdodFJhbmdlKHJhbmdlOiBSYW5nZSwgdXNlQ3VzdG9tOiBib29sZWFuLCB0YWdOYW1lID0gJ21hcmsnLCBhdHRyaWJ1dGVzID0ge30pOiBJSGlnaGxpZ2h0UmVzdWx0IHtcblx0XHRpZiAodXNlQ3VzdG9tKSB7XG5cdFx0XHRjb25zdCByZXQgPSBfaW50ZXJuYWxIaWdobGlnaHRSYW5nZShyYW5nZSwgdGFnTmFtZSwgYXR0cmlidXRlcyk7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRyYW5nZTogcmFuZ2UsXG5cdFx0XHRcdGRpc3Bvc2U6IHJldC5yZW1vdmUsXG5cdFx0XHRcdHVwZGF0ZTogKGNvbG9yOiBzdHJpbmcgfCB1bmRlZmluZWQsIGNsYXNzTmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkKSA9PiB7XG5cdFx0XHRcdFx0aWYgKGNsYXNzTmFtZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0XHRyZXQudXBkYXRlKHtcblx0XHRcdFx0XHRcdFx0J3N0eWxlJzogYGJhY2tncm91bmQtY29sb3I6ICR7Y29sb3J9YFxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHJldC51cGRhdGUoe1xuXHRcdFx0XHRcdFx0XHQnY2xhc3MnOiBjbGFzc05hbWVcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0d2luZG93LmRvY3VtZW50LmV4ZWNDb21tYW5kKCdoaWxpdGVDb2xvcicsIGZhbHNlLCBtYXRjaENvbG9yKTtcblx0XHRcdGNvbnN0IGNsb25lUmFuZ2UgPSB3aW5kb3cuZ2V0U2VsZWN0aW9uKCkhLmdldFJhbmdlQXQoMCkuY2xvbmVSYW5nZSgpO1xuXHRcdFx0Y29uc3QgX3JhbmdlID0ge1xuXHRcdFx0XHRjb2xsYXBzZWQ6IGNsb25lUmFuZ2UuY29sbGFwc2VkLFxuXHRcdFx0XHRjb21tb25BbmNlc3RvckNvbnRhaW5lcjogY2xvbmVSYW5nZS5jb21tb25BbmNlc3RvckNvbnRhaW5lcixcblx0XHRcdFx0ZW5kQ29udGFpbmVyOiBjbG9uZVJhbmdlLmVuZENvbnRhaW5lcixcblx0XHRcdFx0ZW5kT2Zmc2V0OiBjbG9uZVJhbmdlLmVuZE9mZnNldCxcblx0XHRcdFx0c3RhcnRDb250YWluZXI6IGNsb25lUmFuZ2Uuc3RhcnRDb250YWluZXIsXG5cdFx0XHRcdHN0YXJ0T2Zmc2V0OiBjbG9uZVJhbmdlLnN0YXJ0T2Zmc2V0XG5cdFx0XHR9O1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0cmFuZ2U6IF9yYW5nZSxcblx0XHRcdFx0ZGlzcG9zZTogKCkgPT4ge1xuXHRcdFx0XHRcdHNlbGVjdFJhbmdlKF9yYW5nZSk7XG5cdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdGRvY3VtZW50LmRlc2lnbk1vZGUgPSAnT24nO1xuXHRcdFx0XHRcdFx0d2luZG93LmRvY3VtZW50LmV4ZWNDb21tYW5kKCdyZW1vdmVGb3JtYXQnLCBmYWxzZSwgdW5kZWZpbmVkKTtcblx0XHRcdFx0XHRcdGRvY3VtZW50LmRlc2lnbk1vZGUgPSAnT2ZmJztcblx0XHRcdFx0XHRcdHdpbmRvdy5nZXRTZWxlY3Rpb24oKT8ucmVtb3ZlQWxsUmFuZ2VzKCk7XG5cdFx0XHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRcdFx0Y29uc29sZS5sb2coZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR1cGRhdGU6IChjb2xvcjogc3RyaW5nIHwgdW5kZWZpbmVkLCBjbGFzc05hbWU6IHN0cmluZyB8IHVuZGVmaW5lZCkgPT4ge1xuXHRcdFx0XHRcdHNlbGVjdFJhbmdlKF9yYW5nZSk7XG5cdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdGRvY3VtZW50LmRlc2lnbk1vZGUgPSAnT24nO1xuXHRcdFx0XHRcdFx0d2luZG93LmRvY3VtZW50LmV4ZWNDb21tYW5kKCdyZW1vdmVGb3JtYXQnLCBmYWxzZSwgdW5kZWZpbmVkKTtcblx0XHRcdFx0XHRcdHdpbmRvdy5kb2N1bWVudC5leGVjQ29tbWFuZCgnaGlsaXRlQ29sb3InLCBmYWxzZSwgY29sb3IpO1xuXHRcdFx0XHRcdFx0ZG9jdW1lbnQuZGVzaWduTW9kZSA9ICdPZmYnO1xuXHRcdFx0XHRcdFx0d2luZG93LmdldFNlbGVjdGlvbigpPy5yZW1vdmVBbGxSYW5nZXMoKTtcblx0XHRcdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdFx0XHRjb25zb2xlLmxvZyhlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cdFx0fVxuXHR9XG5cblx0ZnVuY3Rpb24gY3JlYXRlRW1pdHRlcjxUPihsaXN0ZW5lckNoYW5nZTogKGxpc3RlbmVyczogU2V0PExpc3RlbmVyPFQ+PikgPT4gdm9pZCA9ICgpID0+IHVuZGVmaW5lZCk6IEVtaXR0ZXJMaWtlPFQ+IHtcblx0XHRjb25zdCBsaXN0ZW5lcnMgPSBuZXcgU2V0PExpc3RlbmVyPFQ+PigpO1xuXHRcdHJldHVybiB7XG5cdFx0XHRmaXJlKGRhdGEpIHtcblx0XHRcdFx0Zm9yIChjb25zdCBsaXN0ZW5lciBvZiBbLi4ubGlzdGVuZXJzXSkge1xuXHRcdFx0XHRcdGxpc3RlbmVyLmZuLmNhbGwobGlzdGVuZXIudGhpc0FyZywgZGF0YSk7XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHRldmVudChmbiwgdGhpc0FyZywgZGlzcG9zYWJsZXMpIHtcblx0XHRcdFx0Y29uc3QgbGlzdGVuZXJPYmogPSB7IGZuLCB0aGlzQXJnIH07XG5cdFx0XHRcdGNvbnN0IGRpc3Bvc2FibGU6IElEaXNwb3NhYmxlID0ge1xuXHRcdFx0XHRcdGRpc3Bvc2U6ICgpID0+IHtcblx0XHRcdFx0XHRcdGxpc3RlbmVycy5kZWxldGUobGlzdGVuZXJPYmopO1xuXHRcdFx0XHRcdFx0bGlzdGVuZXJDaGFuZ2UobGlzdGVuZXJzKTtcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9O1xuXG5cdFx0XHRcdGxpc3RlbmVycy5hZGQobGlzdGVuZXJPYmopO1xuXHRcdFx0XHRsaXN0ZW5lckNoYW5nZShsaXN0ZW5lcnMpO1xuXG5cdFx0XHRcdGlmIChkaXNwb3NhYmxlcyBpbnN0YW5jZW9mIEFycmF5KSB7XG5cdFx0XHRcdFx0ZGlzcG9zYWJsZXMucHVzaChkaXNwb3NhYmxlKTtcblx0XHRcdFx0fSBlbHNlIGlmIChkaXNwb3NhYmxlcykge1xuXHRcdFx0XHRcdGRpc3Bvc2FibGVzLmFkZChkaXNwb3NhYmxlKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiBkaXNwb3NhYmxlO1xuXHRcdFx0fSxcblx0XHR9O1xuXHR9XG5cblx0ZnVuY3Rpb24gc2hvd1JlbmRlckVycm9yKGVycm9yVGV4dDogc3RyaW5nLCBvdXRwdXROb2RlOiBIVE1MRWxlbWVudCwgZXJyb3JzOiByZWFkb25seSBFcnJvcltdKSB7XG5cdFx0b3V0cHV0Tm9kZS5pbm5lclRleHQgPSBlcnJvclRleHQ7XG5cdFx0Y29uc3QgZXJyTGlzdCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3VsJyk7XG5cdFx0Zm9yIChjb25zdCByZXN1bHQgb2YgZXJyb3JzKSB7XG5cdFx0XHRjb25zb2xlLmVycm9yKHJlc3VsdCk7XG5cdFx0XHRjb25zdCBpdGVtID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnbGknKTtcblx0XHRcdGl0ZW0uaW5uZXJUZXh0ID0gcmVzdWx0Lm1lc3NhZ2U7XG5cdFx0XHRlcnJMaXN0LmFwcGVuZENoaWxkKGl0ZW0pO1xuXHRcdH1cblx0XHRvdXRwdXROb2RlLmFwcGVuZENoaWxkKGVyckxpc3QpO1xuXHR9XG5cblx0Y29uc3Qgb3V0cHV0SXRlbVJlcXVlc3RzID0gbmV3IGNsYXNzIHtcblx0XHRwcml2YXRlIF9yZXF1ZXN0UG9vbCA9IDA7XG5cdFx0cHJpdmF0ZSByZWFkb25seSBfcmVxdWVzdHMgPSBuZXcgTWFwPC8qcmVxdWVzdElkKi9udW1iZXIsIHsgcmVzb2x2ZTogKHg6IHdlYnZpZXdNZXNzYWdlcy5PdXRwdXRJdGVtRW50cnkgfCB1bmRlZmluZWQpID0+IHZvaWQgfT4oKTtcblxuXHRcdGdldE91dHB1dEl0ZW0ob3V0cHV0SWQ6IHN0cmluZywgbWltZTogc3RyaW5nKSB7XG5cdFx0XHRjb25zdCByZXF1ZXN0SWQgPSB0aGlzLl9yZXF1ZXN0UG9vbCsrO1xuXG5cdFx0XHRjb25zdCB7IHByb21pc2UsIHJlc29sdmUgfSA9IHByb21pc2VXaXRoUmVzb2x2ZXJzPHdlYnZpZXdNZXNzYWdlcy5PdXRwdXRJdGVtRW50cnkgfCB1bmRlZmluZWQ+KCk7XG5cdFx0XHR0aGlzLl9yZXF1ZXN0cy5zZXQocmVxdWVzdElkLCB7IHJlc29sdmUgfSk7XG5cblx0XHRcdHBvc3ROb3RlYm9va01lc3NhZ2U8d2Vidmlld01lc3NhZ2VzLklHZXRPdXRwdXRJdGVtTWVzc2FnZT4oJ2dldE91dHB1dEl0ZW0nLCB7IHJlcXVlc3RJZCwgb3V0cHV0SWQsIG1pbWUgfSk7XG5cdFx0XHRyZXR1cm4gcHJvbWlzZTtcblx0XHR9XG5cblx0XHRyZXNvbHZlT3V0cHV0SXRlbShyZXF1ZXN0SWQ6IG51bWJlciwgb3V0cHV0OiB3ZWJ2aWV3TWVzc2FnZXMuT3V0cHV0SXRlbUVudHJ5IHwgdW5kZWZpbmVkKSB7XG5cdFx0XHRjb25zdCByZXF1ZXN0ID0gdGhpcy5fcmVxdWVzdHMuZ2V0KHJlcXVlc3RJZCk7XG5cdFx0XHRpZiAoIXJlcXVlc3QpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9yZXF1ZXN0cy5kZWxldGUocmVxdWVzdElkKTtcblx0XHRcdHJlcXVlc3QucmVzb2x2ZShvdXRwdXQpO1xuXHRcdH1cblx0fTtcblxuXHRpbnRlcmZhY2UgQWRkaXRpb25hbE91dHB1dEl0ZW1JbmZvIHtcblx0XHRyZWFkb25seSBtaW1lOiBzdHJpbmc7XG5cdFx0Z2V0SXRlbSgpOiBQcm9taXNlPHJlbmRlcmVyQXBpLk91dHB1dEl0ZW0gfCB1bmRlZmluZWQ+O1xuXHR9XG5cblx0aW50ZXJmYWNlIEV4dGVuZGVkT3V0cHV0SXRlbSBleHRlbmRzIHJlbmRlcmVyQXBpLk91dHB1dEl0ZW0ge1xuXHRcdHJlYWRvbmx5IF9hbGxPdXRwdXRJdGVtczogUmVhZG9ubHlBcnJheTxBZGRpdGlvbmFsT3V0cHV0SXRlbUluZm8+O1xuXHRcdGFwcGVuZGVkVGV4dD8oKTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHR9XG5cblx0bGV0IGhhc1dhcm5lZEFib3V0QWxsT3V0cHV0SXRlbXNQcm9wb3NhbCA9IGZhbHNlO1xuXG5cdGZ1bmN0aW9uIGNyZWF0ZU91dHB1dEl0ZW0oXG5cdFx0aWQ6IHN0cmluZyxcblx0XHRtaW1lOiBzdHJpbmcsXG5cdFx0bWV0YWRhdGE6IHVua25vd24sXG5cdFx0dmFsdWVCeXRlczogVWludDhBcnJheSxcblx0XHRhbGxPdXRwdXRJdGVtRGF0YTogUmVhZG9ubHlBcnJheTx7IHJlYWRvbmx5IG1pbWU6IHN0cmluZyB9Pixcblx0XHRhcHBlbmRlZD86IHsgdmFsdWVCeXRlczogVWludDhBcnJheTsgcHJldmlvdXNWZXJzaW9uOiBudW1iZXIgfVxuXHQpOiBFeHRlbmRlZE91dHB1dEl0ZW0ge1xuXG5cdFx0ZnVuY3Rpb24gY3JlYXRlKFxuXHRcdFx0aWQ6IHN0cmluZyxcblx0XHRcdG1pbWU6IHN0cmluZyxcblx0XHRcdG1ldGFkYXRhOiB1bmtub3duLFxuXHRcdFx0dmFsdWVCeXRlczogVWludDhBcnJheSxcblx0XHRcdGFwcGVuZGVkPzogeyB2YWx1ZUJ5dGVzOiBVaW50OEFycmF5OyBwcmV2aW91c1ZlcnNpb246IG51bWJlciB9XG5cdFx0KTogRXh0ZW5kZWRPdXRwdXRJdGVtIHtcblx0XHRcdHJldHVybiBPYmplY3QuZnJlZXplPEV4dGVuZGVkT3V0cHV0SXRlbT4oe1xuXHRcdFx0XHRpZCxcblx0XHRcdFx0bWltZSxcblx0XHRcdFx0bWV0YWRhdGEsXG5cblx0XHRcdFx0YXBwZW5kZWRUZXh0KCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0XHRcdFx0aWYgKGFwcGVuZGVkKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gdGV4dERlY29kZXIuZGVjb2RlKGFwcGVuZGVkLnZhbHVlQnl0ZXMpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHR9LFxuXG5cdFx0XHRcdGRhdGEoKTogVWludDhBcnJheSB7XG5cdFx0XHRcdFx0cmV0dXJuIHZhbHVlQnl0ZXM7XG5cdFx0XHRcdH0sXG5cblx0XHRcdFx0dGV4dCgpOiBzdHJpbmcge1xuXHRcdFx0XHRcdHJldHVybiB0ZXh0RGVjb2Rlci5kZWNvZGUodmFsdWVCeXRlcyk7XG5cdFx0XHRcdH0sXG5cblx0XHRcdFx0anNvbigpIHtcblx0XHRcdFx0XHRyZXR1cm4gSlNPTi5wYXJzZSh0aGlzLnRleHQoKSk7XG5cdFx0XHRcdH0sXG5cblx0XHRcdFx0YmxvYigpOiBCbG9iIHtcblx0XHRcdFx0XHRyZXR1cm4gbmV3IEJsb2IoW3ZhbHVlQnl0ZXMgYXMgVWludDhBcnJheTxBcnJheUJ1ZmZlcj5dLCB7IHR5cGU6IHRoaXMubWltZSB9KTtcblx0XHRcdFx0fSxcblxuXHRcdFx0XHRnZXQgX2FsbE91dHB1dEl0ZW1zKCkge1xuXHRcdFx0XHRcdGlmICghaGFzV2FybmVkQWJvdXRBbGxPdXRwdXRJdGVtc1Byb3Bvc2FsKSB7XG5cdFx0XHRcdFx0XHRoYXNXYXJuZWRBYm91dEFsbE91dHB1dEl0ZW1zUHJvcG9zYWwgPSB0cnVlO1xuXHRcdFx0XHRcdFx0Y29uc29sZS53YXJuKGAnX2FsbE91dHB1dEl0ZW1zJyBpcyBwcm9wb3NlZCBBUEkuIERPIE5PVCBzaGlwIGFuIGV4dGVuc2lvbiB0aGF0IGRlcGVuZHMgb24gaXQhYCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiBhbGxPdXRwdXRJdGVtTGlzdDtcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdGNvbnN0IGFsbE91dHB1dEl0ZW1DYWNoZSA9IG5ldyBNYXA8LyptaW1lKi9zdHJpbmcsIFByb21pc2U8KHJlbmRlcmVyQXBpLk91dHB1dEl0ZW0gJiBFeHRlbmRlZE91dHB1dEl0ZW0pIHwgdW5kZWZpbmVkPj4oKTtcblx0XHRjb25zdCBhbGxPdXRwdXRJdGVtTGlzdCA9IE9iamVjdC5mcmVlemUoYWxsT3V0cHV0SXRlbURhdGEubWFwKG91dHB1dEl0ZW0gPT4ge1xuXHRcdFx0Y29uc3QgbWltZSA9IG91dHB1dEl0ZW0ubWltZTtcblx0XHRcdHJldHVybiBPYmplY3QuZnJlZXplKHtcblx0XHRcdFx0bWltZSxcblx0XHRcdFx0Z2V0SXRlbSgpIHtcblx0XHRcdFx0XHRjb25zdCBleGlzdGluZ1Rhc2sgPSBhbGxPdXRwdXRJdGVtQ2FjaGUuZ2V0KG1pbWUpO1xuXHRcdFx0XHRcdGlmIChleGlzdGluZ1Rhc2spIHtcblx0XHRcdFx0XHRcdHJldHVybiBleGlzdGluZ1Rhc2s7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Y29uc3QgdGFzayA9IG91dHB1dEl0ZW1SZXF1ZXN0cy5nZXRPdXRwdXRJdGVtKGlkLCBtaW1lKS50aGVuKGl0ZW0gPT4ge1xuXHRcdFx0XHRcdFx0cmV0dXJuIGl0ZW0gPyBjcmVhdGUoaWQsIGl0ZW0ubWltZSwgbWV0YWRhdGEsIGl0ZW0udmFsdWVCeXRlcykgOiB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0YWxsT3V0cHV0SXRlbUNhY2hlLnNldChtaW1lLCB0YXNrKTtcblxuXHRcdFx0XHRcdHJldHVybiB0YXNrO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9KSk7XG5cblx0XHRjb25zdCBpdGVtID0gY3JlYXRlKGlkLCBtaW1lLCBtZXRhZGF0YSwgdmFsdWVCeXRlcywgYXBwZW5kZWQpO1xuXHRcdGFsbE91dHB1dEl0ZW1DYWNoZS5zZXQobWltZSwgUHJvbWlzZS5yZXNvbHZlKGl0ZW0pKTtcblx0XHRyZXR1cm4gaXRlbTtcblx0fVxuXG5cdGNvbnN0IG9uRGlkUmVjZWl2ZUtlcm5lbE1lc3NhZ2UgPSBjcmVhdGVFbWl0dGVyPHVua25vd24+KCk7XG5cblx0Y29uc3QgdHRQb2xpY3kgPSB3aW5kb3cudHJ1c3RlZFR5cGVzPy5jcmVhdGVQb2xpY3koJ25vdGVib29rUmVuZGVyZXInLCB7XG5cdFx0Y3JlYXRlSFRNTDogdmFsdWUgPT4gdmFsdWUsIC8vIENvZGVRTCBbU00wMzcxMl0gVGhlIHJlbmRlcmVkIGNvbnRlbnQgaXMgcHJvdmlkZWQgYnkgcmVuZGVyZXIgZXh0ZW5zaW9ucywgd2hpY2ggYXJlIHJlc3BvbnNpYmxlIGZvciBzYW5pdGl6aW5nIHRoZWlyIGNvbnRlbnQgdGhlbXNlbHZlcy4gVGhlIG5vdGVib29rIHdlYnZpZXcgaXMgYWxzbyBzYW5kYm94ZWQuXG5cdFx0Y3JlYXRlU2NyaXB0OiB2YWx1ZSA9PiB2YWx1ZSwgLy8gQ29kZVFMIFtTTTAzNzEyXSBUaGUgcmVuZGVyZWQgY29udGVudCBpcyBwcm92aWRlZCBieSByZW5kZXJlciBleHRlbnNpb25zLCB3aGljaCBhcmUgcmVzcG9uc2libGUgZm9yIHNhbml0aXppbmcgdGhlaXIgY29udGVudCB0aGVtc2VsdmVzLiBUaGUgbm90ZWJvb2sgd2VidmlldyBpcyBhbHNvIHNhbmRib3hlZC5cblx0fSk7XG5cblx0d2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ3doZWVsJywgaGFuZGxlV2hlZWwpO1xuXG5cdGludGVyZmFjZSBJRmluZE1hdGNoIHtcblx0XHR0eXBlOiAncHJldmlldycgfCAnb3V0cHV0Jztcblx0XHRpZDogc3RyaW5nO1xuXHRcdGNlbGxJZDogc3RyaW5nO1xuXHRcdGNvbnRhaW5lcjogTm9kZTtcblx0XHRvcmlnaW5hbFJhbmdlOiBSYW5nZTtcblx0XHRpc1NoYWRvdzogYm9vbGVhbjtcblx0XHRzZWFyY2hQcmV2aWV3SW5mbz86IElTZWFyY2hQcmV2aWV3SW5mbztcblx0XHRoaWdobGlnaHRSZXN1bHQ/OiBJSGlnaGxpZ2h0UmVzdWx0O1xuXHR9XG5cblx0aW50ZXJmYWNlIElTZWFyY2hQcmV2aWV3SW5mbyB7XG5cdFx0bGluZTogc3RyaW5nO1xuXHRcdHJhbmdlOiB7XG5cdFx0XHRzdGFydDogbnVtYmVyO1xuXHRcdFx0ZW5kOiBudW1iZXI7XG5cdFx0fTtcblx0fVxuXG5cdGludGVyZmFjZSBJSGlnaGxpZ2h0ZXIge1xuXHRcdGFkZEhpZ2hsaWdodHMobWF0Y2hlczogSUZpbmRNYXRjaFtdLCBvd25lcklEOiBzdHJpbmcpOiB2b2lkO1xuXHRcdHJlbW92ZUhpZ2hsaWdodHMob3duZXJJRDogc3RyaW5nKTogdm9pZDtcblx0XHRoaWdobGlnaHRDdXJyZW50TWF0Y2goaW5kZXg6IG51bWJlciwgb3duZXJJRDogc3RyaW5nKTogdm9pZDtcblx0XHR1bkhpZ2hsaWdodEN1cnJlbnRNYXRjaChpbmRleDogbnVtYmVyLCBvd25lcklEOiBzdHJpbmcpOiB2b2lkO1xuXHRcdGRpc3Bvc2UoKTogdm9pZDtcblx0fVxuXG5cdGludGVyZmFjZSBJSGlnaGxpZ2h0SW5mbyB7XG5cdFx0bWF0Y2hlczogSUZpbmRNYXRjaFtdO1xuXHRcdGN1cnJlbnRNYXRjaEluZGV4OiBudW1iZXI7XG5cdH1cblxuXHRjb25zdCBtYXRjaENvbG9yID0gd2luZG93LmdldENvbXB1dGVkU3R5bGUod2luZG93LmRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdfZGVmYXVsdENvbG9yUGFsYXR0ZScpISkuY29sb3I7XG5cdGNvbnN0IGN1cnJlbnRNYXRjaENvbG9yID0gd2luZG93LmdldENvbXB1dGVkU3R5bGUod2luZG93LmRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdfZGVmYXVsdENvbG9yUGFsYXR0ZScpISkuYmFja2dyb3VuZENvbG9yO1xuXG5cdGNsYXNzIEpTSGlnaGxpZ2h0ZXIgaW1wbGVtZW50cyBJSGlnaGxpZ2h0ZXIge1xuXHRcdHByaXZhdGUgX2FjdGl2ZUhpZ2hsaWdodEluZm86IE1hcDxzdHJpbmcsIElIaWdobGlnaHRJbmZvPjtcblxuXHRcdGNvbnN0cnVjdG9yKFxuXHRcdCkge1xuXHRcdFx0dGhpcy5fYWN0aXZlSGlnaGxpZ2h0SW5mbyA9IG5ldyBNYXAoKTtcblx0XHR9XG5cblx0XHRhZGRIaWdobGlnaHRzKG1hdGNoZXM6IElGaW5kTWF0Y2hbXSwgb3duZXJJRDogc3RyaW5nKTogdm9pZCB7XG5cdFx0XHRmb3IgKGxldCBpID0gbWF0Y2hlcy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuXHRcdFx0XHRjb25zdCBtYXRjaCA9IG1hdGNoZXNbaV07XG5cdFx0XHRcdGNvbnN0IHJldCA9IGhpZ2hsaWdodFJhbmdlKG1hdGNoLm9yaWdpbmFsUmFuZ2UsIHRydWUsICdtYXJrJywgbWF0Y2guaXNTaGFkb3cgPyB7XG5cdFx0XHRcdFx0J3N0eWxlJzogJ2JhY2tncm91bmQtY29sb3I6ICcgKyBtYXRjaENvbG9yICsgJzsnLFxuXHRcdFx0XHR9IDoge1xuXHRcdFx0XHRcdCdjbGFzcyc6ICdmaW5kLW1hdGNoJ1xuXHRcdFx0XHR9KTtcblx0XHRcdFx0bWF0Y2guaGlnaGxpZ2h0UmVzdWx0ID0gcmV0O1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBoaWdobGlnaHRJbmZvOiBJSGlnaGxpZ2h0SW5mbyA9IHtcblx0XHRcdFx0bWF0Y2hlcyxcblx0XHRcdFx0Y3VycmVudE1hdGNoSW5kZXg6IC0xXG5cdFx0XHR9O1xuXHRcdFx0dGhpcy5fYWN0aXZlSGlnaGxpZ2h0SW5mby5zZXQob3duZXJJRCwgaGlnaGxpZ2h0SW5mbyk7XG5cdFx0fVxuXG5cdFx0cmVtb3ZlSGlnaGxpZ2h0cyhvd25lcklEOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRcdHRoaXMuX2FjdGl2ZUhpZ2hsaWdodEluZm8uZ2V0KG93bmVySUQpPy5tYXRjaGVzLmZvckVhY2gobWF0Y2ggPT4ge1xuXHRcdFx0XHRtYXRjaC5oaWdobGlnaHRSZXN1bHQ/LmRpc3Bvc2UoKTtcblx0XHRcdH0pO1xuXHRcdFx0dGhpcy5fYWN0aXZlSGlnaGxpZ2h0SW5mby5kZWxldGUob3duZXJJRCk7XG5cdFx0fVxuXG5cdFx0aGlnaGxpZ2h0Q3VycmVudE1hdGNoKGluZGV4OiBudW1iZXIsIG93bmVySUQ6IHN0cmluZykge1xuXHRcdFx0Y29uc3QgaGlnaGxpZ2h0SW5mbyA9IHRoaXMuX2FjdGl2ZUhpZ2hsaWdodEluZm8uZ2V0KG93bmVySUQpO1xuXHRcdFx0aWYgKCFoaWdobGlnaHRJbmZvKSB7XG5cdFx0XHRcdGNvbnNvbGUuZXJyb3IoJ01vZGlmaWVkIGN1cnJlbnQgaGlnaGxpZ2h0IG1hdGNoIGJlZm9yZSBhZGRpbmcgaGlnaGxpZ2h0IGxpc3QuJyk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IG9sZE1hdGNoID0gaGlnaGxpZ2h0SW5mby5tYXRjaGVzW2hpZ2hsaWdodEluZm8uY3VycmVudE1hdGNoSW5kZXhdO1xuXHRcdFx0b2xkTWF0Y2g/LmhpZ2hsaWdodFJlc3VsdD8udXBkYXRlKG1hdGNoQ29sb3IsIG9sZE1hdGNoLmlzU2hhZG93ID8gdW5kZWZpbmVkIDogJ2ZpbmQtbWF0Y2gnKTtcblxuXHRcdFx0Y29uc3QgbWF0Y2ggPSBoaWdobGlnaHRJbmZvLm1hdGNoZXNbaW5kZXhdO1xuXHRcdFx0aGlnaGxpZ2h0SW5mby5jdXJyZW50TWF0Y2hJbmRleCA9IGluZGV4O1xuXHRcdFx0Y29uc3Qgc2VsID0gd2luZG93LmdldFNlbGVjdGlvbigpO1xuXHRcdFx0aWYgKCEhbWF0Y2ggJiYgISFzZWwgJiYgbWF0Y2guaGlnaGxpZ2h0UmVzdWx0KSB7XG5cdFx0XHRcdGxldCBvZmZzZXQgPSAwO1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGNvbnN0IG91dHB1dE9mZnNldCA9IHdpbmRvdy5kb2N1bWVudC5nZXRFbGVtZW50QnlJZChtYXRjaC5pZCkhLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpLnRvcDtcblx0XHRcdFx0XHRjb25zdCB0ZW1wUmFuZ2UgPSBkb2N1bWVudC5jcmVhdGVSYW5nZSgpO1xuXHRcdFx0XHRcdHRlbXBSYW5nZS5zZWxlY3ROb2RlKG1hdGNoLmhpZ2hsaWdodFJlc3VsdC5yYW5nZS5zdGFydENvbnRhaW5lcik7XG5cblx0XHRcdFx0XHRtYXRjaC5oaWdobGlnaHRSZXN1bHQucmFuZ2Uuc3RhcnRDb250YWluZXIucGFyZW50RWxlbWVudD8uc2Nyb2xsSW50b1ZpZXcoeyBiZWhhdmlvcjogJ2F1dG8nLCBibG9jazogJ2VuZCcsIGlubGluZTogJ25lYXJlc3QnIH0pO1xuXG5cdFx0XHRcdFx0Y29uc3QgcmFuZ2VPZmZzZXQgPSB0ZW1wUmFuZ2UuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCkudG9wO1xuXHRcdFx0XHRcdHRlbXBSYW5nZS5kZXRhY2goKTtcblxuXHRcdFx0XHRcdG9mZnNldCA9IHJhbmdlT2Zmc2V0IC0gb3V0cHV0T2Zmc2V0O1xuXHRcdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdFx0Y29uc29sZS5lcnJvcihlKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdG1hdGNoLmhpZ2hsaWdodFJlc3VsdD8udXBkYXRlKGN1cnJlbnRNYXRjaENvbG9yLCBtYXRjaC5pc1NoYWRvdyA/IHVuZGVmaW5lZCA6ICdjdXJyZW50LWZpbmQtbWF0Y2gnKTtcblxuXHRcdFx0XHR3aW5kb3cuZG9jdW1lbnQuZ2V0U2VsZWN0aW9uKCk/LnJlbW92ZUFsbFJhbmdlcygpO1xuXHRcdFx0XHRwb3N0Tm90ZWJvb2tNZXNzYWdlKCdkaWRGaW5kSGlnaGxpZ2h0Q3VycmVudCcsIHtcblx0XHRcdFx0XHRvZmZzZXRcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dW5IaWdobGlnaHRDdXJyZW50TWF0Y2goaW5kZXg6IG51bWJlciwgb3duZXJJRDogc3RyaW5nKSB7XG5cdFx0XHRjb25zdCBoaWdobGlnaHRJbmZvID0gdGhpcy5fYWN0aXZlSGlnaGxpZ2h0SW5mby5nZXQob3duZXJJRCk7XG5cdFx0XHRpZiAoIWhpZ2hsaWdodEluZm8pIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3Qgb2xkTWF0Y2ggPSBoaWdobGlnaHRJbmZvLm1hdGNoZXNbaW5kZXhdO1xuXHRcdFx0aWYgKG9sZE1hdGNoICYmIG9sZE1hdGNoLmhpZ2hsaWdodFJlc3VsdCkge1xuXHRcdFx0XHRvbGRNYXRjaC5oaWdobGlnaHRSZXN1bHQudXBkYXRlKG1hdGNoQ29sb3IsIG9sZE1hdGNoLmlzU2hhZG93ID8gdW5kZWZpbmVkIDogJ2ZpbmQtbWF0Y2gnKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRkaXNwb3NlKCkge1xuXHRcdFx0d2luZG93LmRvY3VtZW50LmdldFNlbGVjdGlvbigpPy5yZW1vdmVBbGxSYW5nZXMoKTtcblx0XHRcdHRoaXMuX2FjdGl2ZUhpZ2hsaWdodEluZm8uZm9yRWFjaChoaWdobGlnaHRJbmZvID0+IHtcblx0XHRcdFx0aGlnaGxpZ2h0SW5mby5tYXRjaGVzLmZvckVhY2gobWF0Y2ggPT4ge1xuXHRcdFx0XHRcdG1hdGNoLmhpZ2hsaWdodFJlc3VsdD8uZGlzcG9zZSgpO1xuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXG5cdGNsYXNzIENTU0hpZ2hsaWdodGVyIGltcGxlbWVudHMgSUhpZ2hsaWdodGVyIHtcblx0XHRwcml2YXRlIF9hY3RpdmVIaWdobGlnaHRJbmZvOiBNYXA8c3RyaW5nLCBJSGlnaGxpZ2h0SW5mbz47XG5cdFx0cHJpdmF0ZSBfbWF0Y2hlc0hpZ2hsaWdodDogSGlnaGxpZ2h0O1xuXHRcdHByaXZhdGUgX2N1cnJlbnRNYXRjaGVzSGlnaGxpZ2h0OiBIaWdobGlnaHQ7XG5cblx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdHRoaXMuX2FjdGl2ZUhpZ2hsaWdodEluZm8gPSBuZXcgTWFwKCk7XG5cdFx0XHR0aGlzLl9tYXRjaGVzSGlnaGxpZ2h0ID0gbmV3IEhpZ2hsaWdodCgpO1xuXHRcdFx0dGhpcy5fbWF0Y2hlc0hpZ2hsaWdodC5wcmlvcml0eSA9IDE7XG5cdFx0XHR0aGlzLl9jdXJyZW50TWF0Y2hlc0hpZ2hsaWdodCA9IG5ldyBIaWdobGlnaHQoKTtcblx0XHRcdHRoaXMuX2N1cnJlbnRNYXRjaGVzSGlnaGxpZ2h0LnByaW9yaXR5ID0gMjtcblx0XHRcdENTUy5oaWdobGlnaHRzPy5zZXQoYGZpbmQtaGlnaGxpZ2h0YCwgdGhpcy5fbWF0Y2hlc0hpZ2hsaWdodCk7XG5cdFx0XHRDU1MuaGlnaGxpZ2h0cz8uc2V0KGBjdXJyZW50LWZpbmQtaGlnaGxpZ2h0YCwgdGhpcy5fY3VycmVudE1hdGNoZXNIaWdobGlnaHQpO1xuXHRcdH1cblxuXHRcdF9yZWZyZXNoUmVnaXN0cnkodXBkYXRlTWF0Y2hlc0hpZ2hsaWdodCA9IHRydWUpIHtcblx0XHRcdC8vIGZvciBwZXJmb3JtYW5jZSByZWFzb25zLCBvbmx5IHVwZGF0ZSB0aGUgZnVsbCBsaXN0IG9mIGhpZ2hsaWdodHMgd2hlbiB3ZSBuZWVkIHRvXG5cdFx0XHRpZiAodXBkYXRlTWF0Y2hlc0hpZ2hsaWdodCkge1xuXHRcdFx0XHR0aGlzLl9tYXRjaGVzSGlnaGxpZ2h0LmNsZWFyKCk7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX2N1cnJlbnRNYXRjaGVzSGlnaGxpZ2h0LmNsZWFyKCk7XG5cblx0XHRcdHRoaXMuX2FjdGl2ZUhpZ2hsaWdodEluZm8uZm9yRWFjaCgoaGlnaGxpZ2h0SW5mbykgPT4ge1xuXG5cdFx0XHRcdGlmICh1cGRhdGVNYXRjaGVzSGlnaGxpZ2h0KSB7XG5cdFx0XHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBoaWdobGlnaHRJbmZvLm1hdGNoZXMubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0XHRcdHRoaXMuX21hdGNoZXNIaWdobGlnaHQuYWRkKGhpZ2hsaWdodEluZm8ubWF0Y2hlc1tpXS5vcmlnaW5hbFJhbmdlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGhpZ2hsaWdodEluZm8uY3VycmVudE1hdGNoSW5kZXggPCBoaWdobGlnaHRJbmZvLm1hdGNoZXMubGVuZ3RoICYmIGhpZ2hsaWdodEluZm8uY3VycmVudE1hdGNoSW5kZXggPj0gMCkge1xuXHRcdFx0XHRcdHRoaXMuX2N1cnJlbnRNYXRjaGVzSGlnaGxpZ2h0LmFkZChoaWdobGlnaHRJbmZvLm1hdGNoZXNbaGlnaGxpZ2h0SW5mby5jdXJyZW50TWF0Y2hJbmRleF0ub3JpZ2luYWxSYW5nZSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdGFkZEhpZ2hsaWdodHMoXG5cdFx0XHRtYXRjaGVzOiBJRmluZE1hdGNoW10sXG5cdFx0XHRvd25lcklEOiBzdHJpbmdcblx0XHQpIHtcblxuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBtYXRjaGVzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdHRoaXMuX21hdGNoZXNIaWdobGlnaHQuYWRkKG1hdGNoZXNbaV0ub3JpZ2luYWxSYW5nZSk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IG5ld0VudHJ5OiBJSGlnaGxpZ2h0SW5mbyA9IHtcblx0XHRcdFx0bWF0Y2hlcyxcblx0XHRcdFx0Y3VycmVudE1hdGNoSW5kZXg6IC0xLFxuXHRcdFx0fTtcblxuXHRcdFx0dGhpcy5fYWN0aXZlSGlnaGxpZ2h0SW5mby5zZXQob3duZXJJRCwgbmV3RW50cnkpO1xuXHRcdH1cblxuXHRcdGhpZ2hsaWdodEN1cnJlbnRNYXRjaChpbmRleDogbnVtYmVyLCBvd25lcklEOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRcdGNvbnN0IGhpZ2hsaWdodEluZm8gPSB0aGlzLl9hY3RpdmVIaWdobGlnaHRJbmZvLmdldChvd25lcklEKTtcblx0XHRcdGlmICghaGlnaGxpZ2h0SW5mbykge1xuXHRcdFx0XHRjb25zb2xlLmVycm9yKCdNb2RpZmllZCBjdXJyZW50IGhpZ2hsaWdodCBtYXRjaCBiZWZvcmUgYWRkaW5nIGhpZ2hsaWdodCBsaXN0LicpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGhpZ2hsaWdodEluZm8uY3VycmVudE1hdGNoSW5kZXggPSBpbmRleDtcblx0XHRcdGNvbnN0IG1hdGNoID0gaGlnaGxpZ2h0SW5mby5tYXRjaGVzW2luZGV4XTtcblxuXHRcdFx0aWYgKG1hdGNoKSB7XG5cdFx0XHRcdGxldCBvZmZzZXQgPSAwO1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGNvbnN0IG91dHB1dE9mZnNldCA9IHdpbmRvdy5kb2N1bWVudC5nZXRFbGVtZW50QnlJZChtYXRjaC5pZCkhLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpLnRvcDtcblx0XHRcdFx0XHRtYXRjaC5vcmlnaW5hbFJhbmdlLnN0YXJ0Q29udGFpbmVyLnBhcmVudEVsZW1lbnQ/LnNjcm9sbEludG9WaWV3KHsgYmVoYXZpb3I6ICdhdXRvJywgYmxvY2s6ICdlbmQnLCBpbmxpbmU6ICduZWFyZXN0JyB9KTtcblx0XHRcdFx0XHRjb25zdCByYW5nZU9mZnNldCA9IG1hdGNoLm9yaWdpbmFsUmFuZ2UuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCkudG9wO1xuXHRcdFx0XHRcdG9mZnNldCA9IHJhbmdlT2Zmc2V0IC0gb3V0cHV0T2Zmc2V0O1xuXHRcdFx0XHRcdHBvc3ROb3RlYm9va01lc3NhZ2UoJ2RpZEZpbmRIaWdobGlnaHRDdXJyZW50Jywge1xuXHRcdFx0XHRcdFx0b2Zmc2V0XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0XHRjb25zb2xlLmVycm9yKGUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9yZWZyZXNoUmVnaXN0cnkoZmFsc2UpO1xuXHRcdH1cblxuXHRcdHVuSGlnaGxpZ2h0Q3VycmVudE1hdGNoKGluZGV4OiBudW1iZXIsIG93bmVySUQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdFx0Y29uc3QgaGlnaGxpZ2h0SW5mbyA9IHRoaXMuX2FjdGl2ZUhpZ2hsaWdodEluZm8uZ2V0KG93bmVySUQpO1xuXHRcdFx0aWYgKCFoaWdobGlnaHRJbmZvKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0aGlnaGxpZ2h0SW5mby5jdXJyZW50TWF0Y2hJbmRleCA9IC0xO1xuXHRcdH1cblxuXHRcdHJlbW92ZUhpZ2hsaWdodHMob3duZXJJRDogc3RyaW5nKSB7XG5cdFx0XHR0aGlzLl9hY3RpdmVIaWdobGlnaHRJbmZvLmRlbGV0ZShvd25lcklEKTtcblx0XHRcdHRoaXMuX3JlZnJlc2hSZWdpc3RyeSgpO1xuXHRcdH1cblxuXHRcdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0XHR3aW5kb3cuZG9jdW1lbnQuZ2V0U2VsZWN0aW9uKCk/LnJlbW92ZUFsbFJhbmdlcygpO1xuXHRcdFx0dGhpcy5fY3VycmVudE1hdGNoZXNIaWdobGlnaHQuY2xlYXIoKTtcblx0XHRcdHRoaXMuX21hdGNoZXNIaWdobGlnaHQuY2xlYXIoKTtcblx0XHR9XG5cdH1cblxuXHRjb25zdCBfaGlnaGxpZ2h0ZXIgPSAoQ1NTLmhpZ2hsaWdodHMpID8gbmV3IENTU0hpZ2hsaWdodGVyKCkgOiBuZXcgSlNIaWdobGlnaHRlcigpO1xuXG5cdGZ1bmN0aW9uIGV4dHJhY3RTZWxlY3Rpb25MaW5lKHNlbGVjdGlvbjogU2VsZWN0aW9uKTogSVNlYXJjaFByZXZpZXdJbmZvIHtcblx0XHRjb25zdCByYW5nZSA9IHNlbGVjdGlvbi5nZXRSYW5nZUF0KDApO1xuXG5cdFx0Ly8gd2UgbmVlZCB0byBrZWVwIGEgcmVmZXJlbmNlIHRvIHRoZSBvbGQgc2VsZWN0aW9uIHJhbmdlIHRvIHJlLWFwcGx5IGxhdGVyXG5cdFx0Y29uc3Qgb2xkUmFuZ2UgPSByYW5nZS5jbG9uZVJhbmdlKCk7XG5cdFx0Y29uc3QgY2FwdHVyZUxlbmd0aCA9IHNlbGVjdGlvbi50b1N0cmluZygpLmxlbmd0aDtcblxuXHRcdC8vIHVzZSBzZWxlY3Rpb24gQVBJIHRvIG1vZGlmeSBzZWxlY3Rpb24gdG8gZ2V0IGVudGlyZSBsaW5lICh0aGUgZmlyc3QgbGluZSBpZiBtdWx0aS1zZWxlY3QpXG5cblx0XHQvLyBjb2xsYXBzZSBzZWxlY3Rpb24gdG8gc3RhcnQgc28gdGhhdCB0aGUgY3Vyc29yIHBvc2l0aW9uIGlzIGF0IGJlZ2lubmluZyBvZiBtYXRjaFxuXHRcdHNlbGVjdGlvbi5jb2xsYXBzZVRvU3RhcnQoKTtcblxuXHRcdC8vIGV4dGVuZCBzZWxlY3Rpb24gaW4gYm90aCBkaXJlY3Rpb25zIHRvIHNlbGVjdCB0aGUgbGluZVxuXHRcdHNlbGVjdGlvbi5tb2RpZnkoJ21vdmUnLCAnYmFja3dhcmQnLCAnbGluZWJvdW5kYXJ5Jyk7XG5cdFx0c2VsZWN0aW9uLm1vZGlmeSgnZXh0ZW5kJywgJ2ZvcndhcmQnLCAnbGluZWJvdW5kYXJ5Jyk7XG5cblx0XHRjb25zdCBsaW5lID0gc2VsZWN0aW9uLnRvU3RyaW5nKCk7XG5cblx0XHQvLyB1c2luZyB0aGUgb3JpZ2luYWwgcmFuZ2UgYW5kIHRoZSBuZXcgcmFuZ2UsIHdlIGNhbiBmaW5kIHRoZSBvZmZzZXQgb2YgdGhlIG1hdGNoIGZyb20gdGhlIGxpbmUgc3RhcnQuXG5cdFx0Y29uc3QgcmFuZ2VTdGFydCA9IGdldFN0YXJ0T2Zmc2V0KHNlbGVjdGlvbi5nZXRSYW5nZUF0KDApLCBvbGRSYW5nZSk7XG5cblx0XHQvLyBsaW5lIHJhbmdlIGZvciBtYXRjaFxuXHRcdGNvbnN0IGxpbmVSYW5nZSA9IHtcblx0XHRcdHN0YXJ0OiByYW5nZVN0YXJ0LFxuXHRcdFx0ZW5kOiByYW5nZVN0YXJ0ICsgY2FwdHVyZUxlbmd0aCxcblx0XHR9O1xuXG5cdFx0Ly8gcmUtYWRkIHRoZSBvbGQgcmFuZ2Ugc28gdGhhdCB0aGUgc2VsZWN0aW9uIGlzIHJlc3RvcmVkXG5cdFx0c2VsZWN0aW9uLnJlbW92ZUFsbFJhbmdlcygpO1xuXHRcdHNlbGVjdGlvbi5hZGRSYW5nZShvbGRSYW5nZSk7XG5cblx0XHRyZXR1cm4geyBsaW5lLCByYW5nZTogbGluZVJhbmdlIH07XG5cdH1cblxuXHRmdW5jdGlvbiBnZXRTdGFydE9mZnNldChsaW5lUmFuZ2U6IFJhbmdlLCBvcmlnaW5hbFJhbmdlOiBSYW5nZSkge1xuXHRcdC8vIHNvbWV0aW1lcywgdGhlIG9sZCBhbmQgbmV3IHJhbmdlIGFyZSBpbiBkaWZmZXJlbnQgRE9NIGVsZW1lbnRzIChpZTogd2hlbiB0aGUgbWF0Y2ggaXMgaW5zaWRlIG9mIDxiPjwvYj4pXG5cdFx0Ly8gc28gd2UgbmVlZCB0byBmaW5kIHRoZSBmaXJzdCBjb21tb24gYW5jZXN0b3IgRE9NIGVsZW1lbnQgYW5kIGZpbmQgdGhlIHBvc2l0aW9ucyBvZiB0aGUgb2xkIGFuZCBuZXcgcmFuZ2UgcmVsYXRpdmUgdG8gdGhhdC5cblx0XHRjb25zdCBmaXJzdENvbW1vbkFuY2VzdG9yID0gZmluZEZpcnN0Q29tbW9uQW5jZXN0b3IobGluZVJhbmdlLnN0YXJ0Q29udGFpbmVyLCBvcmlnaW5hbFJhbmdlLnN0YXJ0Q29udGFpbmVyKTtcblxuXHRcdGNvbnN0IHNlbGVjdGlvbk9mZnNldCA9IGdldFNlbGVjdGlvbk9mZnNldFJlbGF0aXZlVG8oZmlyc3RDb21tb25BbmNlc3RvciwgbGluZVJhbmdlLnN0YXJ0Q29udGFpbmVyKSArIGxpbmVSYW5nZS5zdGFydE9mZnNldDtcblx0XHRjb25zdCB0ZXh0T2Zmc2V0ID0gZ2V0U2VsZWN0aW9uT2Zmc2V0UmVsYXRpdmVUbyhmaXJzdENvbW1vbkFuY2VzdG9yLCBvcmlnaW5hbFJhbmdlLnN0YXJ0Q29udGFpbmVyKSArIG9yaWdpbmFsUmFuZ2Uuc3RhcnRPZmZzZXQ7XG5cdFx0cmV0dXJuIHRleHRPZmZzZXQgLSBzZWxlY3Rpb25PZmZzZXQ7XG5cdH1cblxuXHQvLyBtb2RpZmllZCBmcm9tIGh0dHBzOi8vc3RhY2tvdmVyZmxvdy5jb20vYS82ODU4MzQ2Ni8xNjI1MzgyM1xuXHRmdW5jdGlvbiBmaW5kRmlyc3RDb21tb25BbmNlc3Rvcihub2RlQTogTm9kZSwgbm9kZUI6IE5vZGUpIHtcblx0XHRjb25zdCByYW5nZSA9IG5ldyBSYW5nZSgpO1xuXHRcdHJhbmdlLnNldFN0YXJ0KG5vZGVBLCAwKTtcblx0XHRyYW5nZS5zZXRFbmQobm9kZUIsIDApO1xuXHRcdHJldHVybiByYW5nZS5jb21tb25BbmNlc3RvckNvbnRhaW5lcjtcblx0fVxuXG5cdGZ1bmN0aW9uIGdldFRleHRDb250ZW50TGVuZ3RoKG5vZGU6IE5vZGUpOiBudW1iZXIge1xuXHRcdGxldCBsZW5ndGggPSAwO1xuXG5cdFx0aWYgKG5vZGUubm9kZVR5cGUgPT09IE5vZGUuVEVYVF9OT0RFKSB7XG5cdFx0XHRsZW5ndGggKz0gbm9kZS50ZXh0Q29udGVudD8ubGVuZ3RoIHx8IDA7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGZvciAoY29uc3QgY2hpbGROb2RlIG9mIG5vZGUuY2hpbGROb2Rlcykge1xuXHRcdFx0XHRsZW5ndGggKz0gZ2V0VGV4dENvbnRlbnRMZW5ndGgoY2hpbGROb2RlKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gbGVuZ3RoO1xuXHR9XG5cblx0Ly8gbW9kaWZpZWQgZnJvbSBodHRwczovL3N0YWNrb3ZlcmZsb3cuY29tL2EvNDg4MTI1MjkvMTYyNTM4MjNcblx0ZnVuY3Rpb24gZ2V0U2VsZWN0aW9uT2Zmc2V0UmVsYXRpdmVUbyhwYXJlbnRFbGVtZW50OiBOb2RlLCBjdXJyZW50Tm9kZTogTm9kZSB8IG51bGwpOiBudW1iZXIge1xuXHRcdGlmICghY3VycmVudE5vZGUpIHtcblx0XHRcdHJldHVybiAwO1xuXHRcdH1cblx0XHRsZXQgb2Zmc2V0ID0gMDtcblxuXHRcdGlmIChjdXJyZW50Tm9kZSA9PT0gcGFyZW50RWxlbWVudCB8fCAhcGFyZW50RWxlbWVudC5jb250YWlucyhjdXJyZW50Tm9kZSkpIHtcblx0XHRcdHJldHVybiBvZmZzZXQ7XG5cdFx0fVxuXG5cblx0XHQvLyBjb3VudCB0aGUgbnVtYmVyIG9mIGNoYXJzIGJlZm9yZSB0aGUgY3VycmVudCBkb20gZWxlbSBhbmQgdGhlIHN0YXJ0IG9mIHRoZSBkb21cblx0XHRsZXQgcHJldlNpYmxpbmcgPSBjdXJyZW50Tm9kZS5wcmV2aW91c1NpYmxpbmc7XG5cdFx0d2hpbGUgKHByZXZTaWJsaW5nKSB7XG5cdFx0XHRvZmZzZXQgKz0gZ2V0VGV4dENvbnRlbnRMZW5ndGgocHJldlNpYmxpbmcpO1xuXHRcdFx0cHJldlNpYmxpbmcgPSBwcmV2U2libGluZy5wcmV2aW91c1NpYmxpbmc7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG9mZnNldCArIGdldFNlbGVjdGlvbk9mZnNldFJlbGF0aXZlVG8ocGFyZW50RWxlbWVudCwgY3VycmVudE5vZGUucGFyZW50Tm9kZSk7XG5cdH1cblxuXHRjb25zdCBmaW5kID0gKHF1ZXJ5OiBzdHJpbmcsIG9wdGlvbnM6IHsgd2hvbGVXb3JkPzogYm9vbGVhbjsgY2FzZVNlbnNpdGl2ZT86IGJvb2xlYW47IGluY2x1ZGVNYXJrdXA6IGJvb2xlYW47IGluY2x1ZGVPdXRwdXQ6IGJvb2xlYW47IHNob3VsZEdldFNlYXJjaFByZXZpZXdJbmZvOiBib29sZWFuOyBvd25lcklEOiBzdHJpbmc7IGZpbmRJZHM6IHN0cmluZ1tdIH0pID0+IHtcblx0XHRsZXQgZmluZCA9IHRydWU7XG5cdFx0bGV0IG1hdGNoZXM6IElGaW5kTWF0Y2hbXSA9IFtdO1xuXG5cdFx0Y29uc3QgcmFuZ2UgPSBkb2N1bWVudC5jcmVhdGVSYW5nZSgpO1xuXHRcdHJhbmdlLnNlbGVjdE5vZGVDb250ZW50cyh3aW5kb3cuZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2ZpbmRTdGFydCcpISk7XG5cdFx0Y29uc3Qgc2VsID0gd2luZG93LmdldFNlbGVjdGlvbigpO1xuXHRcdHNlbD8ucmVtb3ZlQWxsUmFuZ2VzKCk7XG5cdFx0c2VsPy5hZGRSYW5nZShyYW5nZSk7XG5cblx0XHR2aWV3TW9kZWwudG9nZ2xlRHJhZ0Ryb3BFbmFibGVkKGZhbHNlKTtcblxuXHRcdHRyeSB7XG5cdFx0XHRkb2N1bWVudC5kZXNpZ25Nb2RlID0gJ09uJztcblxuXHRcdFx0d2hpbGUgKGZpbmQgJiYgbWF0Y2hlcy5sZW5ndGggPCA1MDApIHtcblx0XHRcdFx0ZmluZCA9ICh3aW5kb3cgYXMgdW5rbm93biBhcyB7IGZpbmQ6IChxdWVyeTogc3RyaW5nLCBjYXNlU2Vuc2l0aXZlOiBib29sZWFuLCBiYWNrd2FyZHM6IGJvb2xlYW4sIHdyYXBBcm91bmQ6IGJvb2xlYW4sIHdob2xlV29yZDogYm9vbGVhbiwgc2VhcmNoSW5GcmFtZXM6IGJvb2xlYW4sIGluY2x1ZGVNYXJrdXA6IGJvb2xlYW4pID0+IGJvb2xlYW4gfSkuZmluZChxdWVyeSwgLyogY2FzZVNlbnNpdGl2ZSovICEhb3B0aW9ucy5jYXNlU2Vuc2l0aXZlLFxuXHRcdFx0XHQvKiBiYWNrd2FyZHMqLyBmYWxzZSxcblx0XHRcdFx0Lyogd3JhcEFyb3VuZCovIGZhbHNlLFxuXHRcdFx0XHQvKiB3aG9sZVdvcmQgKi8gISFvcHRpb25zLndob2xlV29yZCxcblx0XHRcdFx0Lyogc2VhcmNoSW5GcmFtZXMqLyB0cnVlLFxuXHRcdFx0XHRcdGZhbHNlKTtcblxuXHRcdFx0XHRpZiAoZmluZCkge1xuXHRcdFx0XHRcdGNvbnN0IHNlbGVjdGlvbiA9IHdpbmRvdy5nZXRTZWxlY3Rpb24oKTtcblx0XHRcdFx0XHRpZiAoIXNlbGVjdGlvbikge1xuXHRcdFx0XHRcdFx0Y29uc29sZS5sb2coJ25vIHNlbGVjdGlvbicpO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Ly8gTWFya2Rvd24gcHJldmlldyBhcmUgcmVuZGVyZWQgaW4gYSBzaGFkb3cgRE9NLlxuXHRcdFx0XHRcdGlmIChvcHRpb25zLmluY2x1ZGVNYXJrdXAgJiYgc2VsZWN0aW9uLnJhbmdlQ291bnQgPiAwICYmIHNlbGVjdGlvbi5nZXRSYW5nZUF0KDApLnN0YXJ0Q29udGFpbmVyLm5vZGVUeXBlID09PSAxXG5cdFx0XHRcdFx0XHQmJiAoc2VsZWN0aW9uLmdldFJhbmdlQXQoMCkuc3RhcnRDb250YWluZXIgYXMgRWxlbWVudCkuY2xhc3NMaXN0LmNvbnRhaW5zKCdtYXJrdXAnKSkge1xuXHRcdFx0XHRcdFx0Ly8gbWFya2Rvd24gcHJldmlldyBjb250YWluZXJcblx0XHRcdFx0XHRcdGNvbnN0IHByZXZpZXcgPSAoc2VsZWN0aW9uLmFuY2hvck5vZGU/LmZpcnN0Q2hpbGQgYXMgRWxlbWVudCk7XG5cdFx0XHRcdFx0XHRjb25zdCByb290ID0gcHJldmlldy5zaGFkb3dSb290IGFzIFNoYWRvd1Jvb3QgJiB7IGdldFNlbGVjdGlvbjogKCkgPT4gU2VsZWN0aW9uIH07XG5cdFx0XHRcdFx0XHRjb25zdCBzaGFkb3dTZWxlY3Rpb24gPSByb290Py5nZXRTZWxlY3Rpb24gPyByb290Py5nZXRTZWxlY3Rpb24oKSA6IG51bGw7XG5cdFx0XHRcdFx0XHQvLyBmaW5kIHRoZSBtYXRjaCBpbiB0aGUgc2hhZG93IGRvbSBieSBjaGVja2luZyB0aGUgc2VsZWN0aW9uIGluc2lkZSB0aGUgc2hhZG93IGRvbVxuXHRcdFx0XHRcdFx0aWYgKHNoYWRvd1NlbGVjdGlvbiAmJiBzaGFkb3dTZWxlY3Rpb24uYW5jaG9yTm9kZSkge1xuXHRcdFx0XHRcdFx0XHRtYXRjaGVzLnB1c2goe1xuXHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdwcmV2aWV3Jyxcblx0XHRcdFx0XHRcdFx0XHRpZDogcHJldmlldy5pZCxcblx0XHRcdFx0XHRcdFx0XHRjZWxsSWQ6IHByZXZpZXcuaWQsXG5cdFx0XHRcdFx0XHRcdFx0Y29udGFpbmVyOiBwcmV2aWV3LFxuXHRcdFx0XHRcdFx0XHRcdGlzU2hhZG93OiB0cnVlLFxuXHRcdFx0XHRcdFx0XHRcdG9yaWdpbmFsUmFuZ2U6IHNoYWRvd1NlbGVjdGlvbi5nZXRSYW5nZUF0KDApLFxuXHRcdFx0XHRcdFx0XHRcdHNlYXJjaFByZXZpZXdJbmZvOiBvcHRpb25zLnNob3VsZEdldFNlYXJjaFByZXZpZXdJbmZvID8gZXh0cmFjdFNlbGVjdGlvbkxpbmUoc2hhZG93U2VsZWN0aW9uKSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Ly8gT3V0cHV0cyBtaWdodCBiZSByZW5kZXJlZCBpbnNpZGUgYSBzaGFkb3cgRE9NLlxuXHRcdFx0XHRcdGlmIChvcHRpb25zLmluY2x1ZGVPdXRwdXQgJiYgc2VsZWN0aW9uLnJhbmdlQ291bnQgPiAwICYmIHNlbGVjdGlvbi5nZXRSYW5nZUF0KDApLnN0YXJ0Q29udGFpbmVyLm5vZGVUeXBlID09PSAxXG5cdFx0XHRcdFx0XHQmJiAoc2VsZWN0aW9uLmdldFJhbmdlQXQoMCkuc3RhcnRDb250YWluZXIgYXMgRWxlbWVudCkuY2xhc3NMaXN0LmNvbnRhaW5zKCdvdXRwdXRfY29udGFpbmVyJykpIHtcblx0XHRcdFx0XHRcdC8vIG91dHB1dCBjb250YWluZXJcblx0XHRcdFx0XHRcdGNvbnN0IGNlbGxJZCA9IHNlbGVjdGlvbi5nZXRSYW5nZUF0KDApLnN0YXJ0Q29udGFpbmVyLnBhcmVudEVsZW1lbnQhLmlkO1xuXHRcdFx0XHRcdFx0Y29uc3Qgb3V0cHV0Tm9kZSA9IChzZWxlY3Rpb24uYW5jaG9yTm9kZT8uZmlyc3RDaGlsZCBhcyBFbGVtZW50KTtcblx0XHRcdFx0XHRcdGNvbnN0IHJvb3QgPSBvdXRwdXROb2RlLnNoYWRvd1Jvb3QgYXMgU2hhZG93Um9vdCAmIHsgZ2V0U2VsZWN0aW9uOiAoKSA9PiBTZWxlY3Rpb24gfTtcblx0XHRcdFx0XHRcdGNvbnN0IHNoYWRvd1NlbGVjdGlvbiA9IHJvb3Q/LmdldFNlbGVjdGlvbiA/IHJvb3Q/LmdldFNlbGVjdGlvbigpIDogbnVsbDtcblx0XHRcdFx0XHRcdGlmIChzaGFkb3dTZWxlY3Rpb24gJiYgc2hhZG93U2VsZWN0aW9uLmFuY2hvck5vZGUpIHtcblx0XHRcdFx0XHRcdFx0bWF0Y2hlcy5wdXNoKHtcblx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnb3V0cHV0Jyxcblx0XHRcdFx0XHRcdFx0XHRpZDogb3V0cHV0Tm9kZS5pZCxcblx0XHRcdFx0XHRcdFx0XHRjZWxsSWQ6IGNlbGxJZCxcblx0XHRcdFx0XHRcdFx0XHRjb250YWluZXI6IG91dHB1dE5vZGUsXG5cdFx0XHRcdFx0XHRcdFx0aXNTaGFkb3c6IHRydWUsXG5cdFx0XHRcdFx0XHRcdFx0b3JpZ2luYWxSYW5nZTogc2hhZG93U2VsZWN0aW9uLmdldFJhbmdlQXQoMCksXG5cdFx0XHRcdFx0XHRcdFx0c2VhcmNoUHJldmlld0luZm86IG9wdGlvbnMuc2hvdWxkR2V0U2VhcmNoUHJldmlld0luZm8gPyBleHRyYWN0U2VsZWN0aW9uTGluZShzaGFkb3dTZWxlY3Rpb24pIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRjb25zdCBhbmNob3JOb2RlID0gc2VsZWN0aW9uLmFuY2hvck5vZGU/LnBhcmVudEVsZW1lbnQ7XG5cblx0XHRcdFx0XHRpZiAoYW5jaG9yTm9kZSkge1xuXHRcdFx0XHRcdFx0Y29uc3QgbGFzdEVsOiBhbnkgPSBtYXRjaGVzLmxlbmd0aCA/IG1hdGNoZXNbbWF0Y2hlcy5sZW5ndGggLSAxXSA6IG51bGw7XG5cblx0XHRcdFx0XHRcdC8vIE9wdGltaXphdGlvbjogYXZvaWQgc2VhcmNoaW5nIGZvciB0aGUgb3V0cHV0IGNvbnRhaW5lclxuXHRcdFx0XHRcdFx0aWYgKGxhc3RFbCAmJiBsYXN0RWwuY29udGFpbmVyLmNvbnRhaW5zKGFuY2hvck5vZGUpICYmIG9wdGlvbnMuaW5jbHVkZU91dHB1dCkge1xuXHRcdFx0XHRcdFx0XHRtYXRjaGVzLnB1c2goe1xuXHRcdFx0XHRcdFx0XHRcdHR5cGU6IGxhc3RFbC50eXBlLFxuXHRcdFx0XHRcdFx0XHRcdGlkOiBsYXN0RWwuaWQsXG5cdFx0XHRcdFx0XHRcdFx0Y2VsbElkOiBsYXN0RWwuY2VsbElkLFxuXHRcdFx0XHRcdFx0XHRcdGNvbnRhaW5lcjogbGFzdEVsLmNvbnRhaW5lcixcblx0XHRcdFx0XHRcdFx0XHRpc1NoYWRvdzogZmFsc2UsXG5cdFx0XHRcdFx0XHRcdFx0b3JpZ2luYWxSYW5nZTogc2VsZWN0aW9uLmdldFJhbmdlQXQoMCksXG5cdFx0XHRcdFx0XHRcdFx0c2VhcmNoUHJldmlld0luZm86IG9wdGlvbnMuc2hvdWxkR2V0U2VhcmNoUHJldmlld0luZm8gPyBleHRyYWN0U2VsZWN0aW9uTGluZShzZWxlY3Rpb24pIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0XHR9KTtcblxuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0Ly8gVHJhdmVyc2UgdXAgdGhlIERPTSB0byBmaW5kIHRoZSBjb250YWluZXJcblx0XHRcdFx0XHRcdFx0Zm9yIChsZXQgbm9kZSA9IGFuY2hvck5vZGUgYXMgRWxlbWVudCB8IG51bGw7IG5vZGU7IG5vZGUgPSBub2RlLnBhcmVudEVsZW1lbnQpIHtcblx0XHRcdFx0XHRcdFx0XHRpZiAoIShub2RlIGluc3RhbmNlb2YgRWxlbWVudCkpIHtcblx0XHRcdFx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0XHRcdGlmIChub2RlLmNsYXNzTGlzdC5jb250YWlucygnb3V0cHV0JykgJiYgb3B0aW9ucy5pbmNsdWRlT3V0cHV0KSB7XG5cdFx0XHRcdFx0XHRcdFx0XHQvLyBpbnNpZGUgb3V0cHV0XG5cdFx0XHRcdFx0XHRcdFx0XHRjb25zdCBjZWxsSWQgPSBub2RlLnBhcmVudEVsZW1lbnQ/LnBhcmVudEVsZW1lbnQ/LmlkO1xuXHRcdFx0XHRcdFx0XHRcdFx0aWYgKGNlbGxJZCkge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRtYXRjaGVzLnB1c2goe1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdvdXRwdXQnLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdGlkOiBub2RlLmlkLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdGNlbGxJZDogY2VsbElkLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdGNvbnRhaW5lcjogbm9kZSxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRpc1NoYWRvdzogZmFsc2UsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0b3JpZ2luYWxSYW5nZTogc2VsZWN0aW9uLmdldFJhbmdlQXQoMCksXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0c2VhcmNoUHJldmlld0luZm86IG9wdGlvbnMuc2hvdWxkR2V0U2VhcmNoUHJldmlld0luZm8gPyBleHRyYWN0U2VsZWN0aW9uTGluZShzZWxlY3Rpb24pIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0XHRcdGlmIChub2RlLmlkID09PSAnY29udGFpbmVyJyB8fCBub2RlID09PSB3aW5kb3cuZG9jdW1lbnQuYm9keSkge1xuXHRcdFx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0Y29uc29sZS5sb2coZSk7XG5cdFx0fVxuXG5cblx0XHRtYXRjaGVzID0gbWF0Y2hlcy5maWx0ZXIobWF0Y2ggPT4gb3B0aW9ucy5maW5kSWRzLmxlbmd0aCA/IG9wdGlvbnMuZmluZElkcy5pbmNsdWRlcyhtYXRjaC5jZWxsSWQpIDogdHJ1ZSk7XG5cdFx0X2hpZ2hsaWdodGVyLmFkZEhpZ2hsaWdodHMobWF0Y2hlcywgb3B0aW9ucy5vd25lcklEKTtcblx0XHR3aW5kb3cuZG9jdW1lbnQuZ2V0U2VsZWN0aW9uKCk/LnJlbW92ZUFsbFJhbmdlcygpO1xuXG5cdFx0dmlld01vZGVsLnRvZ2dsZURyYWdEcm9wRW5hYmxlZChjdXJyZW50T3B0aW9ucy5kcmFnQW5kRHJvcEVuYWJsZWQpO1xuXG5cdFx0ZG9jdW1lbnQuZGVzaWduTW9kZSA9ICdPZmYnO1xuXG5cdFx0cG9zdE5vdGVib29rTWVzc2FnZSgnZGlkRmluZCcsIHtcblx0XHRcdG1hdGNoZXM6IG1hdGNoZXMubWFwKChtYXRjaCwgaW5kZXgpID0+ICh7XG5cdFx0XHRcdHR5cGU6IG1hdGNoLnR5cGUsXG5cdFx0XHRcdGlkOiBtYXRjaC5pZCxcblx0XHRcdFx0Y2VsbElkOiBtYXRjaC5jZWxsSWQsXG5cdFx0XHRcdGluZGV4LFxuXHRcdFx0XHRzZWFyY2hQcmV2aWV3SW5mbzogbWF0Y2guc2VhcmNoUHJldmlld0luZm8sXG5cdFx0XHR9KSlcblx0XHR9KTtcblx0fTtcblxuXHRjb25zdCBjb3B5T3V0cHV0SW1hZ2UgPSBhc3luYyAob3V0cHV0SWQ6IHN0cmluZywgYWx0T3V0cHV0SWQ6IHN0cmluZywgdGV4dEFsdGVybmF0ZXM/OiB7IG1pbWVUeXBlOiBzdHJpbmc7IGNvbnRlbnQ6IHN0cmluZyB9W10sIHJldHJpZXMgPSA1KSA9PiB7XG5cdFx0aWYgKCF3aW5kb3cuZG9jdW1lbnQuaGFzRm9jdXMoKSAmJiByZXRyaWVzID4gMCkge1xuXHRcdFx0Ly8gY29weUltYWdlIGNhbiBiZSBjYWxsZWQgZnJvbSBvdXRzaWRlIG9mIHRoZSB3ZWJ2aWV3LCB3aGljaCBtZWFucyB0aGlzIGZ1bmN0aW9uIG1heSBiZSBydW5uaW5nIHdoaWxzdCB0aGUgd2VidmlldyBpcyBnYWluaW5nIGZvY3VzLlxuXHRcdFx0Ly8gU2luY2UgbmF2aWdhdG9yLmNsaXBib2FyZC53cml0ZSByZXF1aXJlcyB0aGUgZG9jdW1lbnQgdG8gYmUgZm9jdXNlZCwgd2UgbmVlZCB0byB3YWl0IGZvciBmb2N1cy5cblx0XHRcdC8vIFdlIGNhbm5vdCB1c2UgYSBsaXN0ZW5lciwgYXMgdGhlcmUgaXMgYSBoaWdoIGNoYW5jZSB0aGUgZm9jdXMgaXMgZ2FpbmVkIGR1cmluZyB0aGUgc2V0dXAgb2YgdGhlIGxpc3RlbmVyIHJlc3VsdGluZyBpbiB1cyBtaXNzaW5nIGl0LlxuXHRcdFx0c2V0VGltZW91dCgoKSA9PiB7IGNvcHlPdXRwdXRJbWFnZShvdXRwdXRJZCwgYWx0T3V0cHV0SWQsIHRleHRBbHRlcm5hdGVzLCByZXRyaWVzIC0gMSk7IH0sIDUwKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3Qgb3V0cHV0RWxlbWVudCA9IHdpbmRvdy5kb2N1bWVudC5nZXRFbGVtZW50QnlJZChvdXRwdXRJZClcblx0XHRcdFx0Pz8gd2luZG93LmRvY3VtZW50LmdldEVsZW1lbnRCeUlkKGFsdE91dHB1dElkKTtcblxuXHRcdFx0bGV0IGltYWdlID0gb3V0cHV0RWxlbWVudD8ucXVlcnlTZWxlY3RvcignaW1nJyk7XG5cblx0XHRcdGlmICghaW1hZ2UpIHtcblx0XHRcdFx0Y29uc3Qgc3ZnSW1hZ2UgPSBvdXRwdXRFbGVtZW50Py5xdWVyeVNlbGVjdG9yKCdzdmcub3V0cHV0LWltYWdlJykgPz9cblx0XHRcdFx0XHRvdXRwdXRFbGVtZW50Py5xdWVyeVNlbGVjdG9yKCdkaXYuc3ZnQ29udGFpbmVyU3R5bGUgPiBzdmcnKTtcblxuXHRcdFx0XHRpZiAoc3ZnSW1hZ2UpIHtcblx0XHRcdFx0XHRpbWFnZSA9IG5ldyBJbWFnZSgpO1xuXHRcdFx0XHRcdGltYWdlLnNyYyA9ICdkYXRhOmltYWdlL3N2Zyt4bWwsJyArIGVuY29kZVVSSUNvbXBvbmVudChzdmdJbWFnZS5vdXRlckhUTUwpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGlmIChpbWFnZSkge1xuXHRcdFx0XHRjb25zdCBlbnN1cmVJbWFnZUxvYWRlZCA9IChpbWc6IEhUTUxJbWFnZUVsZW1lbnQpOiBQcm9taXNlPEhUTUxJbWFnZUVsZW1lbnQ+ID0+IHtcblx0XHRcdFx0XHRyZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdFx0XHRcdFx0aWYgKGltZy5jb21wbGV0ZSAmJiBpbWcubmF0dXJhbFdpZHRoID4gMCkge1xuXHRcdFx0XHRcdFx0XHRyZXNvbHZlKGltZyk7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRpbWcub25sb2FkID0gKCkgPT4gcmVzb2x2ZShpbWcpO1xuXHRcdFx0XHRcdFx0XHRpbWcub25lcnJvciA9ICgpID0+IHJlamVjdChuZXcgRXJyb3IoJ0ZhaWxlZCB0byBsb2FkIGltYWdlJykpO1xuXHRcdFx0XHRcdFx0XHRzZXRUaW1lb3V0KCgpID0+IHJlamVjdChuZXcgRXJyb3IoJ0ltYWdlIGxvYWQgdGltZW91dCcpKSwgNTAwMCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH07XG5cdFx0XHRcdGNvbnN0IGltYWdlVG9Db3B5ID0gYXdhaXQgZW5zdXJlSW1hZ2VMb2FkZWQoaW1hZ2UpO1xuXG5cdFx0XHRcdC8vIEJ1aWxkIGNsaXBib2FyZCBkYXRhIHdpdGggYm90aCBpbWFnZSBhbmQgdGV4dCBmb3JtYXRzXG5cdFx0XHRcdGNvbnN0IGNsaXBib2FyZERhdGE6IFJlY29yZDxzdHJpbmcsIGFueT4gPSB7XG5cdFx0XHRcdFx0J2ltYWdlL3BuZyc6IG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG5cdFx0XHRcdFx0XHRjb25zdCBjYW52YXMgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdjYW52YXMnKTtcblx0XHRcdFx0XHRcdGNhbnZhcy53aWR0aCA9IGltYWdlVG9Db3B5Lm5hdHVyYWxXaWR0aDtcblx0XHRcdFx0XHRcdGNhbnZhcy5oZWlnaHQgPSBpbWFnZVRvQ29weS5uYXR1cmFsSGVpZ2h0O1xuXHRcdFx0XHRcdFx0Y29uc3QgY29udGV4dCA9IGNhbnZhcy5nZXRDb250ZXh0KCcyZCcpO1xuXHRcdFx0XHRcdFx0Y29udGV4dCEuZHJhd0ltYWdlKGltYWdlVG9Db3B5LCAwLCAwKTtcblxuXHRcdFx0XHRcdFx0Y2FudmFzLnRvQmxvYigoYmxvYikgPT4ge1xuXHRcdFx0XHRcdFx0XHRpZiAoYmxvYikge1xuXHRcdFx0XHRcdFx0XHRcdHJlc29sdmUoYmxvYik7XG5cdFx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdFx0Y29uc29sZS5lcnJvcignTm8gYmxvYiBkYXRhIHRvIHdyaXRlIHRvIGNsaXBib2FyZCcpO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdGNhbnZhcy5yZW1vdmUoKTtcblx0XHRcdFx0XHRcdH0sICdpbWFnZS9wbmcnKTtcblx0XHRcdFx0XHR9KVxuXHRcdFx0XHR9O1xuXG5cdFx0XHRcdC8vIEFkZCB0ZXh0IGFsdGVybmF0ZXMgaWYgcHJvdmlkZWRcblx0XHRcdFx0aWYgKHRleHRBbHRlcm5hdGVzKSB7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBhbHRlcm5hdGUgb2YgdGV4dEFsdGVybmF0ZXMpIHtcblx0XHRcdFx0XHRcdGNsaXBib2FyZERhdGFbYWx0ZXJuYXRlLm1pbWVUeXBlXSA9IGFsdGVybmF0ZS5jb250ZW50O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdGF3YWl0IG5hdmlnYXRvci5jbGlwYm9hcmQud3JpdGUoW25ldyBDbGlwYm9hcmRJdGVtKGNsaXBib2FyZERhdGEpXSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zb2xlLmVycm9yKCdDb3VsZCBub3QgZmluZCBpbWFnZSBlbGVtZW50IHRvIGNvcHkgZm9yIG91dHB1dCB3aXRoIGlkJywgb3V0cHV0SWQpO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdGNvbnNvbGUuZXJyb3IoJ0NvdWxkIG5vdCBjb3B5IGltYWdlOicsIGUpO1xuXHRcdH1cblx0fTtcblxuXHR3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignbWVzc2FnZScsIGFzeW5jIHJhd0V2ZW50ID0+IHtcblx0XHRjb25zdCBldmVudCA9IHJhd0V2ZW50IGFzICh7IGRhdGE6IHdlYnZpZXdNZXNzYWdlcy5Ub1dlYnZpZXdNZXNzYWdlIH0pO1xuXG5cdFx0c3dpdGNoIChldmVudC5kYXRhLnR5cGUpIHtcblx0XHRcdGNhc2UgJ2luaXRpYWxpemVNYXJrdXAnOiB7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0YXdhaXQgUHJvbWlzZS5hbGwoZXZlbnQuZGF0YS5jZWxscy5tYXAoaW5mbyA9PiB2aWV3TW9kZWwuZW5zdXJlTWFya3VwQ2VsbChpbmZvKSkpO1xuXHRcdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRcdGRpbWVuc2lvblVwZGF0ZXIudXBkYXRlSW1tZWRpYXRlbHkoKTtcblx0XHRcdFx0XHRwb3N0Tm90ZWJvb2tNZXNzYWdlKCdpbml0aWFsaXplZE1hcmt1cCcsIHsgcmVxdWVzdElkOiBldmVudC5kYXRhLnJlcXVlc3RJZCB9KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGNhc2UgJ2NyZWF0ZU1hcmt1cENlbGwnOlxuXHRcdFx0XHR2aWV3TW9kZWwuZW5zdXJlTWFya3VwQ2VsbChldmVudC5kYXRhLmNlbGwpO1xuXHRcdFx0XHRicmVhaztcblxuXHRcdFx0Y2FzZSAnc2hvd01hcmt1cENlbGwnOlxuXHRcdFx0XHR2aWV3TW9kZWwuc2hvd01hcmt1cENlbGwoZXZlbnQuZGF0YS5pZCwgZXZlbnQuZGF0YS50b3AsIGV2ZW50LmRhdGEuY29udGVudCwgZXZlbnQuZGF0YS5tZXRhZGF0YSk7XG5cdFx0XHRcdGJyZWFrO1xuXG5cdFx0XHRjYXNlICdoaWRlTWFya3VwQ2VsbHMnOlxuXHRcdFx0XHRmb3IgKGNvbnN0IGlkIG9mIGV2ZW50LmRhdGEuaWRzKSB7XG5cdFx0XHRcdFx0dmlld01vZGVsLmhpZGVNYXJrdXBDZWxsKGlkKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRicmVhaztcblxuXHRcdFx0Y2FzZSAndW5oaWRlTWFya3VwQ2VsbHMnOlxuXHRcdFx0XHRmb3IgKGNvbnN0IGlkIG9mIGV2ZW50LmRhdGEuaWRzKSB7XG5cdFx0XHRcdFx0dmlld01vZGVsLnVuaGlkZU1hcmt1cENlbGwoaWQpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGJyZWFrO1xuXG5cdFx0XHRjYXNlICdkZWxldGVNYXJrdXBDZWxsJzpcblx0XHRcdFx0Zm9yIChjb25zdCBpZCBvZiBldmVudC5kYXRhLmlkcykge1xuXHRcdFx0XHRcdHZpZXdNb2RlbC5kZWxldGVNYXJrdXBDZWxsKGlkKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRicmVhaztcblxuXHRcdFx0Y2FzZSAndXBkYXRlU2VsZWN0ZWRNYXJrdXBDZWxscyc6XG5cdFx0XHRcdHZpZXdNb2RlbC51cGRhdGVTZWxlY3RlZENlbGxzKGV2ZW50LmRhdGEuc2VsZWN0ZWRDZWxsSWRzKTtcblx0XHRcdFx0YnJlYWs7XG5cblx0XHRcdGNhc2UgJ2h0bWwnOiB7XG5cdFx0XHRcdGNvbnN0IGRhdGEgPSBldmVudC5kYXRhO1xuXHRcdFx0XHRpZiAoZGF0YS5jcmVhdGVPbklkbGUpIHtcblx0XHRcdFx0XHRvdXRwdXRSdW5uZXIuZW5xdWV1ZUlkbGUoZGF0YS5vdXRwdXRJZCwgc2lnbmFsID0+IHtcblx0XHRcdFx0XHRcdC8vIGNhbmNlbCB0aGUgaWRsZSBjYWxsYmFjayBpZiBpdCBleGlzdHNcblx0XHRcdFx0XHRcdHJldHVybiB2aWV3TW9kZWwucmVuZGVyT3V0cHV0Q2VsbChkYXRhLCBzaWduYWwpO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdG91dHB1dFJ1bm5lci5lbnF1ZXVlKGRhdGEub3V0cHV0SWQsIHNpZ25hbCA9PiB7XG5cdFx0XHRcdFx0XHQvLyBjYW5jZWwgdGhlIGlkbGUgY2FsbGJhY2sgaWYgaXQgZXhpc3RzXG5cdFx0XHRcdFx0XHRyZXR1cm4gdmlld01vZGVsLnJlbmRlck91dHB1dENlbGwoZGF0YSwgc2lnbmFsKTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGNhc2UgJ3ZpZXctc2Nyb2xsJzpcblx0XHRcdFx0e1xuXHRcdFx0XHRcdC8vIGNvbnN0IGRhdGUgPSBuZXcgRGF0ZSgpO1xuXHRcdFx0XHRcdC8vIGNvbnNvbGUubG9nKCctLS0tLSB3aWxsIHNjcm9sbCAtLS0tICAnLCBkYXRlLmdldE1pbnV0ZXMoKSArICc6JyArIGRhdGUuZ2V0U2Vjb25kcygpICsgJzonICsgZGF0ZS5nZXRNaWxsaXNlY29uZHMoKSk7XG5cblx0XHRcdFx0XHRldmVudC5kYXRhLndpZGdldHMuZm9yRWFjaCh3aWRnZXQgPT4ge1xuXHRcdFx0XHRcdFx0b3V0cHV0UnVubmVyLmVucXVldWUod2lkZ2V0Lm91dHB1dElkLCAoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdHZpZXdNb2RlbC51cGRhdGVPdXRwdXRzU2Nyb2xsKFt3aWRnZXRdKTtcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdHZpZXdNb2RlbC51cGRhdGVNYXJrdXBTY3JvbGxzKGV2ZW50LmRhdGEubWFya3VwQ2VsbHMpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRjYXNlICdjbGVhcic6XG5cdFx0XHRcdHJlbmRlcmVycy5jbGVhckFsbCgpO1xuXHRcdFx0XHR2aWV3TW9kZWwuY2xlYXJBbGwoKTtcblx0XHRcdFx0d2luZG93LmRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdjb250YWluZXInKSEuaW5uZXJUZXh0ID0gJyc7XG5cdFx0XHRcdGJyZWFrO1xuXG5cdFx0XHRjYXNlICdjbGVhck91dHB1dCc6IHtcblx0XHRcdFx0Y29uc3QgeyBjZWxsSWQsIHJlbmRlcmVySWQsIG91dHB1dElkIH0gPSBldmVudC5kYXRhO1xuXHRcdFx0XHRvdXRwdXRSdW5uZXIuY2FuY2VsT3V0cHV0KG91dHB1dElkKTtcblx0XHRcdFx0dmlld01vZGVsLmNsZWFyT3V0cHV0KGNlbGxJZCwgb3V0cHV0SWQsIHJlbmRlcmVySWQpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGNhc2UgJ2hpZGVPdXRwdXQnOiB7XG5cdFx0XHRcdGNvbnN0IHsgY2VsbElkLCBvdXRwdXRJZCB9ID0gZXZlbnQuZGF0YTtcblx0XHRcdFx0b3V0cHV0UnVubmVyLmVucXVldWUob3V0cHV0SWQsICgpID0+IHtcblx0XHRcdFx0XHR2aWV3TW9kZWwuaGlkZU91dHB1dChjZWxsSWQpO1xuXHRcdFx0XHR9KTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRjYXNlICdzaG93T3V0cHV0Jzoge1xuXHRcdFx0XHRjb25zdCB7IG91dHB1dElkLCBjZWxsVG9wLCBjZWxsSWQsIGNvbnRlbnQgfSA9IGV2ZW50LmRhdGE7XG5cdFx0XHRcdG91dHB1dFJ1bm5lci5lbnF1ZXVlKG91dHB1dElkLCAoKSA9PiB7XG5cdFx0XHRcdFx0dmlld01vZGVsLnNob3dPdXRwdXQoY2VsbElkLCBvdXRwdXRJZCwgY2VsbFRvcCk7XG5cdFx0XHRcdFx0aWYgKGNvbnRlbnQpIHtcblx0XHRcdFx0XHRcdHZpZXdNb2RlbC51cGRhdGVBbmRSZXJlbmRlcihjZWxsSWQsIG91dHB1dElkLCBjb250ZW50KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGNhc2UgJ2NvcHlJbWFnZSc6IHtcblx0XHRcdFx0YXdhaXQgY29weU91dHB1dEltYWdlKGV2ZW50LmRhdGEub3V0cHV0SWQsIGV2ZW50LmRhdGEuYWx0T3V0cHV0SWQsIGV2ZW50LmRhdGEudGV4dEFsdGVybmF0ZXMpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGNhc2UgJ2Fjay1kaW1lbnNpb24nOiB7XG5cdFx0XHRcdGZvciAoY29uc3QgeyBjZWxsSWQsIG91dHB1dElkLCBoZWlnaHQgfSBvZiBldmVudC5kYXRhLnVwZGF0ZXMpIHtcblx0XHRcdFx0XHR2aWV3TW9kZWwudXBkYXRlT3V0cHV0SGVpZ2h0KGNlbGxJZCwgb3V0cHV0SWQsIGhlaWdodCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRjYXNlICdwcmVsb2FkJzoge1xuXHRcdFx0XHRjb25zdCByZXNvdXJjZXMgPSBldmVudC5kYXRhLnJlc291cmNlcztcblx0XHRcdFx0Zm9yIChjb25zdCB7IHVyaSB9IG9mIHJlc291cmNlcykge1xuXHRcdFx0XHRcdGtlcm5lbFByZWxvYWRzLmxvYWQodXJpKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGNhc2UgJ3VwZGF0ZVJlbmRlcmVycyc6IHtcblx0XHRcdFx0Y29uc3QgeyByZW5kZXJlckRhdGEgfSA9IGV2ZW50LmRhdGE7XG5cdFx0XHRcdHJlbmRlcmVycy51cGRhdGVSZW5kZXJlckRhdGEocmVuZGVyZXJEYXRhKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRjYXNlICdmb2N1cy1vdXRwdXQnOlxuXHRcdFx0XHRmb2N1c0ZpcnN0Rm9jdXNhYmxlT3JDb250YWluZXJJbk91dHB1dChldmVudC5kYXRhLmNlbGxPck91dHB1dElkLCBldmVudC5kYXRhLmFsdGVybmF0ZUlkKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlICdibHVyLW91dHB1dCc6XG5cdFx0XHRcdGJsdXJPdXRwdXQoKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlICdzZWxlY3Qtb3V0cHV0LWNvbnRlbnRzJzpcblx0XHRcdFx0c2VsZWN0T3V0cHV0Q29udGVudHMoZXZlbnQuZGF0YS5jZWxsT3JPdXRwdXRJZCk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSAnc2VsZWN0LWlucHV0LWNvbnRlbnRzJzpcblx0XHRcdFx0c2VsZWN0SW5wdXRDb250ZW50cyhldmVudC5kYXRhLmNlbGxPck91dHB1dElkKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlICdkZWNvcmF0aW9ucyc6IHtcblx0XHRcdFx0bGV0IG91dHB1dENvbnRhaW5lciA9IHdpbmRvdy5kb2N1bWVudC5nZXRFbGVtZW50QnlJZChldmVudC5kYXRhLmNlbGxJZCk7XG5cdFx0XHRcdGlmICghb3V0cHV0Q29udGFpbmVyKSB7XG5cdFx0XHRcdFx0dmlld01vZGVsLmVuc3VyZU91dHB1dENlbGwoZXZlbnQuZGF0YS5jZWxsSWQsIC0xMDAwMDAsIHRydWUpO1xuXHRcdFx0XHRcdG91dHB1dENvbnRhaW5lciA9IHdpbmRvdy5kb2N1bWVudC5nZXRFbGVtZW50QnlJZChldmVudC5kYXRhLmNlbGxJZCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0b3V0cHV0Q29udGFpbmVyPy5jbGFzc0xpc3QuYWRkKC4uLmV2ZW50LmRhdGEuYWRkZWRDbGFzc05hbWVzKTtcblx0XHRcdFx0b3V0cHV0Q29udGFpbmVyPy5jbGFzc0xpc3QucmVtb3ZlKC4uLmV2ZW50LmRhdGEucmVtb3ZlZENsYXNzTmFtZXMpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGNhc2UgJ21hcmt1cERlY29yYXRpb25zJzoge1xuXHRcdFx0XHRjb25zdCBtYXJrdXBDZWxsID0gd2luZG93LmRvY3VtZW50LmdldEVsZW1lbnRCeUlkKGV2ZW50LmRhdGEuY2VsbElkKTtcblx0XHRcdFx0Ly8gVGhlIGNlbGwgbWF5IG5vdCBoYXZlIGJlZW4gYWRkZWQgeWV0IGlmIGl0IGlzIG91dCBvZiB2aWV3LlxuXHRcdFx0XHQvLyBEZWNvcmF0aW9ucyB3aWxsIGJlIGFkZGVkIHdoZW4gdGhlIGNlbGwgaXMgc2hvd24uXG5cdFx0XHRcdGlmIChtYXJrdXBDZWxsKSB7XG5cdFx0XHRcdFx0bWFya3VwQ2VsbD8uY2xhc3NMaXN0LmFkZCguLi5ldmVudC5kYXRhLmFkZGVkQ2xhc3NOYW1lcyk7XG5cdFx0XHRcdFx0bWFya3VwQ2VsbD8uY2xhc3NMaXN0LnJlbW92ZSguLi5ldmVudC5kYXRhLnJlbW92ZWRDbGFzc05hbWVzKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGNhc2UgJ2N1c3RvbUtlcm5lbE1lc3NhZ2UnOlxuXHRcdFx0XHRvbkRpZFJlY2VpdmVLZXJuZWxNZXNzYWdlLmZpcmUoZXZlbnQuZGF0YS5tZXNzYWdlKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlICdjdXN0b21SZW5kZXJlck1lc3NhZ2UnOlxuXHRcdFx0XHRyZW5kZXJlcnMuZ2V0UmVuZGVyZXIoZXZlbnQuZGF0YS5yZW5kZXJlcklkKT8ucmVjZWl2ZU1lc3NhZ2UoZXZlbnQuZGF0YS5tZXNzYWdlKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlICdub3RlYm9va1N0eWxlcyc6IHtcblx0XHRcdFx0Y29uc3QgZG9jdW1lbnRTdHlsZSA9IHdpbmRvdy5kb2N1bWVudC5kb2N1bWVudEVsZW1lbnQuc3R5bGU7XG5cblx0XHRcdFx0Zm9yIChsZXQgaSA9IGRvY3VtZW50U3R5bGUubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcblx0XHRcdFx0XHRjb25zdCBwcm9wZXJ0eSA9IGRvY3VtZW50U3R5bGVbaV07XG5cblx0XHRcdFx0XHQvLyBEb24ndCByZW1vdmUgcHJvcGVydGllcyB0aGF0IHRoZSB3ZWJ2aWV3IG1pZ2h0IGhhdmUgYWRkZWQgc2VwYXJhdGVseVxuXHRcdFx0XHRcdGlmIChwcm9wZXJ0eSAmJiBwcm9wZXJ0eS5zdGFydHNXaXRoKCctLW5vdGVib29rLScpKSB7XG5cdFx0XHRcdFx0XHRkb2N1bWVudFN0eWxlLnJlbW92ZVByb3BlcnR5KHByb3BlcnR5KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBSZS1hZGQgbmV3IHByb3BlcnRpZXNcblx0XHRcdFx0Zm9yIChjb25zdCBbbmFtZSwgdmFsdWVdIG9mIE9iamVjdC5lbnRyaWVzKGV2ZW50LmRhdGEuc3R5bGVzKSkge1xuXHRcdFx0XHRcdGRvY3VtZW50U3R5bGUuc2V0UHJvcGVydHkoYC0tJHtuYW1lfWAsIHZhbHVlKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGNhc2UgJ25vdGVib29rT3B0aW9ucyc6XG5cdFx0XHRcdGN1cnJlbnRPcHRpb25zID0gZXZlbnQuZGF0YS5vcHRpb25zO1xuXHRcdFx0XHR2aWV3TW9kZWwudG9nZ2xlRHJhZ0Ryb3BFbmFibGVkKGN1cnJlbnRPcHRpb25zLmRyYWdBbmREcm9wRW5hYmxlZCk7XG5cdFx0XHRcdGN1cnJlbnRSZW5kZXJPcHRpb25zID0gZXZlbnQuZGF0YS5yZW5kZXJPcHRpb25zO1xuXHRcdFx0XHRzZXR0aW5nQ2hhbmdlLmZpcmUoY3VycmVudFJlbmRlck9wdGlvbnMpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgJ3Rva2VuaXplZENvZGVCbG9jayc6IHtcblx0XHRcdFx0Y29uc3QgeyBjb2RlQmxvY2tJZCwgaHRtbCB9ID0gZXZlbnQuZGF0YTtcblx0XHRcdFx0TWFya2Rvd25Db2RlQmxvY2suaGlnaGxpZ2h0Q29kZUJsb2NrKGNvZGVCbG9ja0lkLCBodG1sKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRjYXNlICd0b2tlbml6ZWRTdHlsZXNDaGFuZ2VkJzoge1xuXHRcdFx0XHR0b2tlbml6YXRpb25TdHlsZS5yZXBsYWNlU3luYyhldmVudC5kYXRhLmNzcyk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSAnZmluZCc6IHtcblx0XHRcdFx0X2hpZ2hsaWdodGVyLnJlbW92ZUhpZ2hsaWdodHMoZXZlbnQuZGF0YS5vcHRpb25zLm93bmVySUQpO1xuXHRcdFx0XHRmaW5kKGV2ZW50LmRhdGEucXVlcnksIGV2ZW50LmRhdGEub3B0aW9ucyk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSAnZmluZEhpZ2hsaWdodEN1cnJlbnQnOiB7XG5cdFx0XHRcdF9oaWdobGlnaHRlcj8uaGlnaGxpZ2h0Q3VycmVudE1hdGNoKGV2ZW50LmRhdGEuaW5kZXgsIGV2ZW50LmRhdGEub3duZXJJRCk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSAnZmluZFVuSGlnaGxpZ2h0Q3VycmVudCc6IHtcblx0XHRcdFx0X2hpZ2hsaWdodGVyPy51bkhpZ2hsaWdodEN1cnJlbnRNYXRjaChldmVudC5kYXRhLmluZGV4LCBldmVudC5kYXRhLm93bmVySUQpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGNhc2UgJ2ZpbmRTdG9wJzoge1xuXHRcdFx0XHRfaGlnaGxpZ2h0ZXIucmVtb3ZlSGlnaGxpZ2h0cyhldmVudC5kYXRhLm93bmVySUQpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGNhc2UgJ3JldHVybk91dHB1dEl0ZW0nOiB7XG5cdFx0XHRcdG91dHB1dEl0ZW1SZXF1ZXN0cy5yZXNvbHZlT3V0cHV0SXRlbShldmVudC5kYXRhLnJlcXVlc3RJZCwgZXZlbnQuZGF0YS5vdXRwdXQpO1xuXHRcdFx0fVxuXHRcdH1cblx0fSk7XG5cblx0Y29uc3QgcmVuZGVyRmFsbGJhY2tFcnJvck5hbWUgPSAndnNjb2RlLmZhbGxiYWNrVG9OZXh0UmVuZGVyZXInO1xuXG5cdGNsYXNzIFJlbmRlcmVyIHtcblxuXHRcdHByaXZhdGUgX29uTWVzc2FnZUV2ZW50ID0gY3JlYXRlRW1pdHRlcigpO1xuXHRcdHByaXZhdGUgX2xvYWRQcm9taXNlPzogUHJvbWlzZTxyZW5kZXJlckFwaS5SZW5kZXJlckFwaSB8IHVuZGVmaW5lZD47XG5cdFx0cHJpdmF0ZSBfYXBpOiByZW5kZXJlckFwaS5SZW5kZXJlckFwaSB8IHVuZGVmaW5lZDtcblxuXHRcdGNvbnN0cnVjdG9yKFxuXHRcdFx0cHVibGljIHJlYWRvbmx5IGRhdGE6IHdlYnZpZXdNZXNzYWdlcy5SZW5kZXJlck1ldGFkYXRhLFxuXHRcdCkgeyB9XG5cblx0XHRwdWJsaWMgcmVjZWl2ZU1lc3NhZ2UobWVzc2FnZTogdW5rbm93bikge1xuXHRcdFx0dGhpcy5fb25NZXNzYWdlRXZlbnQuZmlyZShtZXNzYWdlKTtcblx0XHR9XG5cblx0XHRwdWJsaWMgYXN5bmMgcmVuZGVyT3V0cHV0SXRlbShpdGVtOiByZW5kZXJlckFwaS5PdXRwdXRJdGVtLCBlbGVtZW50OiBIVE1MRWxlbWVudCwgc2lnbmFsOiBBYm9ydFNpZ25hbCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgdGhpcy5sb2FkKCk7XG5cdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdGlmICghc2lnbmFsLmFib3J0ZWQpIHtcblx0XHRcdFx0XHRzaG93UmVuZGVyRXJyb3IoYEVycm9yIGxvYWRpbmcgcmVuZGVyZXIgJyR7dGhpcy5kYXRhLmlkfSdgLCBlbGVtZW50LCBlIGluc3RhbmNlb2YgRXJyb3IgPyBbZV0gOiBbXSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoIXRoaXMuX2FwaSkge1xuXHRcdFx0XHRpZiAoIXNpZ25hbC5hYm9ydGVkKSB7XG5cdFx0XHRcdFx0c2hvd1JlbmRlckVycm9yKGBSZW5kZXJlciAnJHt0aGlzLmRhdGEuaWR9JyBkb2VzIG5vdCBpbXBsZW1lbnQgcmVuZGVyT3V0cHV0SXRlbWAsIGVsZW1lbnQsIFtdKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IHJlbmRlclN0YXJ0ID0gcGVyZm9ybWFuY2Uubm93KCk7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX2FwaS5yZW5kZXJPdXRwdXRJdGVtKGl0ZW0sIGVsZW1lbnQsIHNpZ25hbCk7XG5cdFx0XHRcdHRoaXMucG9zdERlYnVnTWVzc2FnZSgnUmVuZGVyZWQgb3V0cHV0IGl0ZW0nLCB7IGlkOiBpdGVtLmlkLCBkdXJhdGlvbjogYCR7cGVyZm9ybWFuY2Uubm93KCkgLSByZW5kZXJTdGFydH1tc2AgfSk7XG5cblx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0aWYgKHNpZ25hbC5hYm9ydGVkKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKGUgaW5zdGFuY2VvZiBFcnJvciAmJiBlLm5hbWUgPT09IHJlbmRlckZhbGxiYWNrRXJyb3JOYW1lKSB7XG5cdFx0XHRcdFx0dGhyb3cgZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHNob3dSZW5kZXJFcnJvcihgRXJyb3IgcmVuZGVyaW5nIG91dHB1dCBpdGVtIHVzaW5nICcke3RoaXMuZGF0YS5pZH0nYCwgZWxlbWVudCwgZSBpbnN0YW5jZW9mIEVycm9yID8gW2VdIDogW10pO1xuXHRcdFx0XHR0aGlzLnBvc3REZWJ1Z01lc3NhZ2UoJ1JlbmRlcmluZyBvdXRwdXQgaXRlbSBmYWlsZWQnLCB7IGlkOiBpdGVtLmlkLCBlcnJvcjogZSArICcnIH0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHB1YmxpYyBkaXNwb3NlT3V0cHV0SXRlbShpZD86IHN0cmluZyk6IHZvaWQge1xuXHRcdFx0dGhpcy5fYXBpPy5kaXNwb3NlT3V0cHV0SXRlbT8uKGlkKTtcblx0XHR9XG5cblx0XHRwcml2YXRlIGNyZWF0ZVJlbmRlcmVyQ29udGV4dCgpOiBSZW5kZXJlckNvbnRleHQge1xuXHRcdFx0Y29uc3QgeyBpZCwgbWVzc2FnaW5nIH0gPSB0aGlzLmRhdGE7XG5cdFx0XHRjb25zdCBjb250ZXh0OiBSZW5kZXJlckNvbnRleHQgPSB7XG5cdFx0XHRcdHNldFN0YXRlOiBuZXdTdGF0ZSA9PiB2c2NvZGUuc2V0U3RhdGUoeyAuLi52c2NvZGUuZ2V0U3RhdGUoKSwgW2lkXTogbmV3U3RhdGUgfSksXG5cdFx0XHRcdGdldFN0YXRlOiA8VD4oKSA9PiB7XG5cdFx0XHRcdFx0Y29uc3Qgc3RhdGUgPSB2c2NvZGUuZ2V0U3RhdGUoKTtcblx0XHRcdFx0XHRyZXR1cm4gdHlwZW9mIHN0YXRlID09PSAnb2JqZWN0JyAmJiBzdGF0ZSA/IHN0YXRlW2lkXSBhcyBUIDogdW5kZWZpbmVkO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRnZXRSZW5kZXJlcjogYXN5bmMgKGlkOiBzdHJpbmcpID0+IHtcblx0XHRcdFx0XHRjb25zdCByZW5kZXJlciA9IHJlbmRlcmVycy5nZXRSZW5kZXJlcihpZCk7XG5cdFx0XHRcdFx0aWYgKCFyZW5kZXJlcikge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKHJlbmRlcmVyLl9hcGkpIHtcblx0XHRcdFx0XHRcdHJldHVybiByZW5kZXJlci5fYXBpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm4gcmVuZGVyZXIubG9hZCgpO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHR3b3Jrc3BhY2U6IHtcblx0XHRcdFx0XHRnZXQgaXNUcnVzdGVkKCkgeyByZXR1cm4gaXNXb3Jrc3BhY2VUcnVzdGVkOyB9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHNldHRpbmdzOiB7XG5cdFx0XHRcdFx0Z2V0IGxpbmVMaW1pdCgpIHsgcmV0dXJuIGN1cnJlbnRSZW5kZXJPcHRpb25zLmxpbmVMaW1pdDsgfSxcblx0XHRcdFx0XHRnZXQgb3V0cHV0U2Nyb2xsaW5nKCkgeyByZXR1cm4gY3VycmVudFJlbmRlck9wdGlvbnMub3V0cHV0U2Nyb2xsaW5nOyB9LFxuXHRcdFx0XHRcdGdldCBvdXRwdXRXb3JkV3JhcCgpIHsgcmV0dXJuIGN1cnJlbnRSZW5kZXJPcHRpb25zLm91dHB1dFdvcmRXcmFwOyB9LFxuXHRcdFx0XHRcdGdldCBsaW5raWZ5RmlsZVBhdGhzKCkgeyByZXR1cm4gY3VycmVudFJlbmRlck9wdGlvbnMubGlua2lmeUZpbGVQYXRoczsgfSxcblx0XHRcdFx0XHRnZXQgbWluaW1hbEVycm9yKCkgeyByZXR1cm4gY3VycmVudFJlbmRlck9wdGlvbnMubWluaW1hbEVycm9yOyB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRnZXQgb25EaWRDaGFuZ2VTZXR0aW5ncygpIHsgcmV0dXJuIHNldHRpbmdDaGFuZ2UuZXZlbnQ7IH1cblx0XHRcdH07XG5cblx0XHRcdGlmIChtZXNzYWdpbmcpIHtcblx0XHRcdFx0Y29udGV4dC5vbkRpZFJlY2VpdmVNZXNzYWdlID0gdGhpcy5fb25NZXNzYWdlRXZlbnQuZXZlbnQ7XG5cdFx0XHRcdGNvbnRleHQucG9zdE1lc3NhZ2UgPSBtZXNzYWdlID0+IHBvc3ROb3RlYm9va01lc3NhZ2UoJ2N1c3RvbVJlbmRlcmVyTWVzc2FnZScsIHsgcmVuZGVyZXJJZDogaWQsIG1lc3NhZ2UgfSk7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBPYmplY3QuZnJlZXplKGNvbnRleHQpO1xuXHRcdH1cblxuXHRcdHByaXZhdGUgbG9hZCgpOiBQcm9taXNlPHJlbmRlcmVyQXBpLlJlbmRlcmVyQXBpIHwgdW5kZWZpbmVkPiB7XG5cdFx0XHR0aGlzLl9sb2FkUHJvbWlzZSA/Pz0gdGhpcy5fbG9hZCgpO1xuXHRcdFx0cmV0dXJuIHRoaXMuX2xvYWRQcm9taXNlO1xuXHRcdH1cblxuXHRcdC8qKiBJbm5lciBmdW5jdGlvbiBjYWNoZWQgaW4gdGhlIF9sb2FkUHJvbWlzZSgpLiAqL1xuXHRcdHByaXZhdGUgYXN5bmMgX2xvYWQoKTogUHJvbWlzZTxyZW5kZXJlckFwaS5SZW5kZXJlckFwaSB8IHVuZGVmaW5lZD4ge1xuXHRcdFx0dGhpcy5wb3N0RGVidWdNZXNzYWdlKCdTdGFydCBsb2FkaW5nIHJlbmRlcmVyJyk7XG5cblx0XHRcdHRyeSB7XG5cdFx0XHRcdC8vIFByZWxvYWRzIG5lZWQgdG8gYmUgbG9hZGVkIGJlZm9yZSBsb2FkaW5nIHJlbmRlcmVycy5cblx0XHRcdFx0YXdhaXQga2VybmVsUHJlbG9hZHMud2FpdEZvckFsbEN1cnJlbnQoKTtcblxuXHRcdFx0XHRjb25zdCBpbXBvcnRTdGFydCA9IHBlcmZvcm1hbmNlLm5vdygpO1xuXHRcdFx0XHRjb25zdCBtb2R1bGU6IFJlbmRlcmVyTW9kdWxlID0gYXdhaXQgX19pbXBvcnQodGhpcy5kYXRhLmVudHJ5cG9pbnQucGF0aCk7XG5cdFx0XHRcdHRoaXMucG9zdERlYnVnTWVzc2FnZSgnSW1wb3J0ZWQgcmVuZGVyZXInLCB7IGR1cmF0aW9uOiBgJHtwZXJmb3JtYW5jZS5ub3coKSAtIGltcG9ydFN0YXJ0fW1zYCB9KTtcblxuXHRcdFx0XHRpZiAoIW1vZHVsZSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRoaXMuX2FwaSA9IGF3YWl0IG1vZHVsZS5hY3RpdmF0ZSh0aGlzLmNyZWF0ZVJlbmRlcmVyQ29udGV4dCgpKTtcblx0XHRcdFx0dGhpcy5wb3N0RGVidWdNZXNzYWdlKCdBY3RpdmF0ZWQgcmVuZGVyZXInLCB7IGR1cmF0aW9uOiBgJHtwZXJmb3JtYW5jZS5ub3coKSAtIGltcG9ydFN0YXJ0fW1zYCB9KTtcblxuXHRcdFx0XHRjb25zdCBkZXBlbmRhbnRSZW5kZXJlcnMgPSBjdHgucmVuZGVyZXJEYXRhXG5cdFx0XHRcdFx0LmZpbHRlcihkID0+IGQuZW50cnlwb2ludC5leHRlbmRzID09PSB0aGlzLmRhdGEuaWQpO1xuXG5cdFx0XHRcdGlmIChkZXBlbmRhbnRSZW5kZXJlcnMubGVuZ3RoKSB7XG5cdFx0XHRcdFx0dGhpcy5wb3N0RGVidWdNZXNzYWdlKCdBY3RpdmF0aW5nIGRlcGVuZGFudCByZW5kZXJlcnMnLCB7IGRlcGVuZGVudHM6IGRlcGVuZGFudFJlbmRlcmVycy5tYXAoeCA9PiB4LmlkKS5qb2luKCcsICcpIH0pO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gTG9hZCBhbGwgcmVuZGVyZXJzIHRoYXQgZXh0ZW5kIHRoaXMgcmVuZGVyZXJcblx0XHRcdFx0YXdhaXQgUHJvbWlzZS5hbGwoZGVwZW5kYW50UmVuZGVyZXJzLm1hcChhc3luYyBkID0+IHtcblx0XHRcdFx0XHRjb25zdCByZW5kZXJlciA9IHJlbmRlcmVycy5nZXRSZW5kZXJlcihkLmlkKTtcblx0XHRcdFx0XHRpZiAoIXJlbmRlcmVyKSB7XG5cdFx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYENvdWxkIG5vdCBmaW5kIGV4dGVuZGluZyByZW5kZXJlcjogJHtkLmlkfWApO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gYXdhaXQgcmVuZGVyZXIubG9hZCgpO1xuXHRcdFx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0XHRcdC8vIFNxdWFzaCBhbnkgZXJyb3JzIGV4dGVuZHMgZXJyb3JzLiBUaGV5IHdvbid0IHByZXZlbnQgdGhlIHJlbmRlcmVyXG5cdFx0XHRcdFx0XHQvLyBpdHNlbGYgZnJvbSB3b3JraW5nLCBzbyBqdXN0IGxvZyB0aGVtLlxuXHRcdFx0XHRcdFx0Y29uc29sZS5lcnJvcihlKTtcblx0XHRcdFx0XHRcdHRoaXMucG9zdERlYnVnTWVzc2FnZSgnQWN0aXZhdGluZyBkZXBlbmRhbnQgcmVuZGVyZXIgZmFpbGVkJywgeyBkZXBlbmRlbnQ6IGQuaWQsIGVycm9yOiBlICsgJycgfSk7XG5cdFx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSkpO1xuXG5cdFx0XHRcdHJldHVybiB0aGlzLl9hcGk7XG5cdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdHRoaXMucG9zdERlYnVnTWVzc2FnZSgnTG9hZGluZyByZW5kZXJlciBmYWlsZWQnKTtcblx0XHRcdFx0dGhyb3cgZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRwcml2YXRlIHBvc3REZWJ1Z01lc3NhZ2UobXNnOiBzdHJpbmcsIGRhdGE/OiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+KSB7XG5cdFx0XHRwb3N0Tm90ZWJvb2tNZXNzYWdlPHdlYnZpZXdNZXNzYWdlcy5JTG9nUmVuZGVyZXJEZWJ1Z01lc3NhZ2U+KCdsb2dSZW5kZXJlckRlYnVnTWVzc2FnZScsIHtcblx0XHRcdFx0bWVzc2FnZTogYFtyZW5kZXJlciAke3RoaXMuZGF0YS5pZH1dIC0gJHttc2d9YCxcblx0XHRcdFx0ZGF0YVxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0Y29uc3Qga2VybmVsUHJlbG9hZHMgPSBuZXcgY2xhc3Mge1xuXHRcdHByaXZhdGUgcmVhZG9ubHkgcHJlbG9hZHMgPSBuZXcgTWFwPHN0cmluZyAvKiB1cmkgKi8sIFByb21pc2U8dW5rbm93bj4+KCk7XG5cblx0XHQvKipcblx0XHQgKiBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHdoZW4gdGhlIGdpdmVuIHByZWxvYWQgaXMgYWN0aXZhdGVkLlxuXHRcdCAqL1xuXHRcdHB1YmxpYyB3YWl0Rm9yKHVyaTogc3RyaW5nKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5wcmVsb2Fkcy5nZXQodXJpKSB8fCBQcm9taXNlLnJlc29sdmUobmV3IEVycm9yKGBQcmVsb2FkIG5vdCByZWFkeTogJHt1cml9YCkpO1xuXHRcdH1cblxuXHRcdC8qKlxuXHRcdCAqIExvYWRzIGEgcHJlbG9hZC5cblx0XHQgKiBAcGFyYW0gdXJpIFVSSSB0byBsb2FkIGZyb21cblx0XHQgKiBAcGFyYW0gb3JpZ2luYWxVcmkgVVJJIHRvIHNob3cgaW4gYW4gZXJyb3IgbWVzc2FnZSBpZiB0aGUgcHJlbG9hZCBpcyBpbnZhbGlkLlxuXHRcdCAqL1xuXHRcdHB1YmxpYyBsb2FkKHVyaTogc3RyaW5nKSB7XG5cdFx0XHRjb25zdCBwcm9taXNlID0gUHJvbWlzZS5hbGwoW1xuXHRcdFx0XHRydW5LZXJuZWxQcmVsb2FkKHVyaSksXG5cdFx0XHRcdHRoaXMud2FpdEZvckFsbEN1cnJlbnQoKSxcblx0XHRcdF0pO1xuXG5cdFx0XHR0aGlzLnByZWxvYWRzLnNldCh1cmksIHByb21pc2UpO1xuXHRcdFx0cmV0dXJuIHByb21pc2U7XG5cdFx0fVxuXG5cdFx0LyoqXG5cdFx0ICogUmV0dXJucyBhIHByb21pc2UgdGhhdCB3YWl0cyBmb3IgYWxsIGN1cnJlbnRseS1yZWdpc3RlcmVkIHByZWxvYWRzIHRvXG5cdFx0ICogYWN0aXZhdGUgYmVmb3JlIHJlc29sdmluZy5cblx0XHQgKi9cblx0XHRwdWJsaWMgd2FpdEZvckFsbEN1cnJlbnQoKSB7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5hbGwoWy4uLnRoaXMucHJlbG9hZHMudmFsdWVzKCldLm1hcChwID0+IHAuY2F0Y2goZXJyID0+IGVycikpKTtcblx0XHR9XG5cdH07XG5cblx0Y29uc3Qgb3V0cHV0UnVubmVyID0gbmV3IGNsYXNzIHtcblx0XHRwcml2YXRlIHJlYWRvbmx5IG91dHB1dHMgPSBuZXcgTWFwPHN0cmluZywgeyBhYm9ydDogQWJvcnRDb250cm9sbGVyOyBxdWV1ZTogUHJvbWlzZTx1bmtub3duPiB9PigpO1xuXG5cdFx0LyoqXG5cdFx0ICogUHVzaGVzIHRoZSBhY3Rpb24gb250byB0aGUgbGlzdCBvZiBhY3Rpb25zIGZvciB0aGUgZ2l2ZW4gb3V0cHV0IElELFxuXHRcdCAqIGVuc3VyaW5nIHRoYXQgaXQncyBydW4gaW4tb3JkZXIuXG5cdFx0ICovXG5cdFx0cHVibGljIGVucXVldWUob3V0cHV0SWQ6IHN0cmluZywgYWN0aW9uOiAoY2FuY2VsU2lnbmFsOiBBYm9ydFNpZ25hbCkgPT4gdW5rbm93bikge1xuXHRcdFx0dGhpcy5wZW5kaW5nT3V0cHV0Q3JlYXRpb25SZXF1ZXN0LmdldChvdXRwdXRJZCk/LmRpc3Bvc2UoKTtcblx0XHRcdHRoaXMucGVuZGluZ091dHB1dENyZWF0aW9uUmVxdWVzdC5kZWxldGUob3V0cHV0SWQpO1xuXG5cdFx0XHRjb25zdCByZWNvcmQgPSB0aGlzLm91dHB1dHMuZ2V0KG91dHB1dElkKTtcblx0XHRcdGlmICghcmVjb3JkKSB7XG5cdFx0XHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBuZXcgQWJvcnRDb250cm9sbGVyKCk7XG5cdFx0XHRcdHRoaXMub3V0cHV0cy5zZXQob3V0cHV0SWQsIHsgYWJvcnQ6IGNvbnRyb2xsZXIsIHF1ZXVlOiBuZXcgUHJvbWlzZShyID0+IHIoYWN0aW9uKGNvbnRyb2xsZXIuc2lnbmFsKSkpIH0pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmVjb3JkLnF1ZXVlID0gcmVjb3JkLnF1ZXVlLnRoZW4oYXN5bmMgciA9PiB7XG5cdFx0XHRcdFx0aWYgKCFyZWNvcmQuYWJvcnQuc2lnbmFsLmFib3J0ZWQpIHtcblx0XHRcdFx0XHRcdGF3YWl0IGFjdGlvbihyZWNvcmQuYWJvcnQuc2lnbmFsKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHByaXZhdGUgcGVuZGluZ091dHB1dENyZWF0aW9uUmVxdWVzdDogTWFwPHN0cmluZywgSURpc3Bvc2FibGU+ID0gbmV3IE1hcCgpO1xuXG5cdFx0cHVibGljIGVucXVldWVJZGxlKG91dHB1dElkOiBzdHJpbmcsIGFjdGlvbjogKGNhbmNlbFNpZ25hbDogQWJvcnRTaWduYWwpID0+IHVua25vd24pIHtcblx0XHRcdHRoaXMucGVuZGluZ091dHB1dENyZWF0aW9uUmVxdWVzdC5nZXQob3V0cHV0SWQpPy5kaXNwb3NlKCk7XG5cdFx0XHRvdXRwdXRSdW5uZXIucGVuZGluZ091dHB1dENyZWF0aW9uUmVxdWVzdC5zZXQob3V0cHV0SWQsIHJ1bldoZW5JZGxlKCgpID0+IHtcblx0XHRcdFx0b3V0cHV0UnVubmVyLmVucXVldWUob3V0cHV0SWQsIGFjdGlvbik7XG5cdFx0XHRcdG91dHB1dFJ1bm5lci5wZW5kaW5nT3V0cHV0Q3JlYXRpb25SZXF1ZXN0LmRlbGV0ZShvdXRwdXRJZCk7XG5cdFx0XHR9KSk7XG5cdFx0fVxuXG5cdFx0LyoqXG5cdFx0ICogQ2FuY2VscyB0aGUgcmVuZGVyaW5nIG9mIGFsbCBvdXRwdXRzLlxuXHRcdCAqL1xuXHRcdHB1YmxpYyBjYW5jZWxBbGwoKSB7XG5cdFx0XHQvLyBEZWxldGUgYWxsIHBlbmRpbmcgaWRsZSByZXF1ZXN0c1xuXHRcdFx0dGhpcy5wZW5kaW5nT3V0cHV0Q3JlYXRpb25SZXF1ZXN0LmZvckVhY2gociA9PiByLmRpc3Bvc2UoKSk7XG5cdFx0XHR0aGlzLnBlbmRpbmdPdXRwdXRDcmVhdGlvblJlcXVlc3QuY2xlYXIoKTtcblxuXHRcdFx0Zm9yIChjb25zdCB7IGFib3J0IH0gb2YgdGhpcy5vdXRwdXRzLnZhbHVlcygpKSB7XG5cdFx0XHRcdGFib3J0LmFib3J0KCk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLm91dHB1dHMuY2xlYXIoKTtcblx0XHR9XG5cblx0XHQvKipcblx0XHQgKiBDYW5jZWxzIGFueSBvbmdvaW5nIHJlbmRlcmluZyBvdXQgYW4gb3V0cHV0LlxuXHRcdCAqL1xuXHRcdHB1YmxpYyBjYW5jZWxPdXRwdXQob3V0cHV0SWQ6IHN0cmluZykge1xuXHRcdFx0Ly8gRGVsZXRlIHRoZSBwZW5kaW5nIGlkbGUgcmVxdWVzdCBpZiBpdCBleGlzdHNcblx0XHRcdHRoaXMucGVuZGluZ091dHB1dENyZWF0aW9uUmVxdWVzdC5nZXQob3V0cHV0SWQpPy5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLnBlbmRpbmdPdXRwdXRDcmVhdGlvblJlcXVlc3QuZGVsZXRlKG91dHB1dElkKTtcblxuXHRcdFx0Y29uc3Qgb3V0cHV0ID0gdGhpcy5vdXRwdXRzLmdldChvdXRwdXRJZCk7XG5cdFx0XHRpZiAob3V0cHV0KSB7XG5cdFx0XHRcdG91dHB1dC5hYm9ydC5hYm9ydCgpO1xuXHRcdFx0XHR0aGlzLm91dHB1dHMuZGVsZXRlKG91dHB1dElkKTtcblx0XHRcdH1cblx0XHR9XG5cdH07XG5cblx0Y29uc3QgcmVuZGVyZXJzID0gbmV3IGNsYXNzIHtcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9yZW5kZXJlcnMgPSBuZXcgTWFwPC8qIGlkICovIHN0cmluZywgUmVuZGVyZXI+KCk7XG5cblx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdGZvciAoY29uc3QgcmVuZGVyZXIgb2YgY3R4LnJlbmRlcmVyRGF0YSkge1xuXHRcdFx0XHR0aGlzLmFkZFJlbmRlcmVyKHJlbmRlcmVyKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRwdWJsaWMgZ2V0UmVuZGVyZXIoaWQ6IHN0cmluZyk6IFJlbmRlcmVyIHwgdW5kZWZpbmVkIHtcblx0XHRcdHJldHVybiB0aGlzLl9yZW5kZXJlcnMuZ2V0KGlkKTtcblx0XHR9XG5cblx0XHRwcml2YXRlIHJlbmRlcmVyRXF1YWwoYTogd2Vidmlld01lc3NhZ2VzLlJlbmRlcmVyTWV0YWRhdGEsIGI6IHdlYnZpZXdNZXNzYWdlcy5SZW5kZXJlck1ldGFkYXRhKSB7XG5cdFx0XHRpZiAoYS5pZCAhPT0gYi5pZCB8fCBhLmVudHJ5cG9pbnQucGF0aCAhPT0gYi5lbnRyeXBvaW50LnBhdGggfHwgYS5lbnRyeXBvaW50LmV4dGVuZHMgIT09IGIuZW50cnlwb2ludC5leHRlbmRzIHx8IGEubWVzc2FnaW5nICE9PSBiLm1lc3NhZ2luZykge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChhLm1pbWVUeXBlcy5sZW5ndGggIT09IGIubWltZVR5cGVzLmxlbmd0aCkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgYS5taW1lVHlwZXMubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0aWYgKGEubWltZVR5cGVzW2ldICE9PSBiLm1pbWVUeXBlc1tpXSkge1xuXHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRwdWJsaWMgdXBkYXRlUmVuZGVyZXJEYXRhKHJlbmRlcmVyRGF0YTogcmVhZG9ubHkgd2Vidmlld01lc3NhZ2VzLlJlbmRlcmVyTWV0YWRhdGFbXSkge1xuXHRcdFx0Y29uc3Qgb2xkS2V5cyA9IG5ldyBTZXQodGhpcy5fcmVuZGVyZXJzLmtleXMoKSk7XG5cdFx0XHRjb25zdCBuZXdLZXlzID0gbmV3IFNldChyZW5kZXJlckRhdGEubWFwKGQgPT4gZC5pZCkpO1xuXG5cdFx0XHRmb3IgKGNvbnN0IHJlbmRlcmVyIG9mIHJlbmRlcmVyRGF0YSkge1xuXHRcdFx0XHRjb25zdCBleGlzdGluZyA9IHRoaXMuX3JlbmRlcmVycy5nZXQocmVuZGVyZXIuaWQpO1xuXHRcdFx0XHRpZiAoZXhpc3RpbmcgJiYgdGhpcy5yZW5kZXJlckVxdWFsKGV4aXN0aW5nLmRhdGEsIHJlbmRlcmVyKSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGhpcy5hZGRSZW5kZXJlcihyZW5kZXJlcik7XG5cdFx0XHR9XG5cblx0XHRcdGZvciAoY29uc3Qga2V5IG9mIG9sZEtleXMpIHtcblx0XHRcdFx0aWYgKCFuZXdLZXlzLmhhcyhrZXkpKSB7XG5cdFx0XHRcdFx0dGhpcy5fcmVuZGVyZXJzLmRlbGV0ZShrZXkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cHJpdmF0ZSBhZGRSZW5kZXJlcihyZW5kZXJlcjogd2Vidmlld01lc3NhZ2VzLlJlbmRlcmVyTWV0YWRhdGEpIHtcblx0XHRcdHRoaXMuX3JlbmRlcmVycy5zZXQocmVuZGVyZXIuaWQsIG5ldyBSZW5kZXJlcihyZW5kZXJlcikpO1xuXHRcdH1cblxuXHRcdHB1YmxpYyBjbGVhckFsbCgpIHtcblx0XHRcdG91dHB1dFJ1bm5lci5jYW5jZWxBbGwoKTtcblx0XHRcdGZvciAoY29uc3QgcmVuZGVyZXIgb2YgdGhpcy5fcmVuZGVyZXJzLnZhbHVlcygpKSB7XG5cdFx0XHRcdHJlbmRlcmVyLmRpc3Bvc2VPdXRwdXRJdGVtKCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cHVibGljIGNsZWFyT3V0cHV0KHJlbmRlcmVySWQ6IHN0cmluZywgb3V0cHV0SWQ6IHN0cmluZykge1xuXHRcdFx0b3V0cHV0UnVubmVyLmNhbmNlbE91dHB1dChvdXRwdXRJZCk7XG5cdFx0XHR0aGlzLl9yZW5kZXJlcnMuZ2V0KHJlbmRlcmVySWQpPy5kaXNwb3NlT3V0cHV0SXRlbShvdXRwdXRJZCk7XG5cdFx0fVxuXG5cdFx0cHVibGljIGFzeW5jIHJlbmRlcihpdGVtOiBFeHRlbmRlZE91dHB1dEl0ZW0sIHByZWZlcnJlZFJlbmRlcmVySWQ6IHN0cmluZyB8IHVuZGVmaW5lZCwgZWxlbWVudDogSFRNTEVsZW1lbnQsIHNpZ25hbDogQWJvcnRTaWduYWwpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdGNvbnN0IHByaW1hcnlSZW5kZXJlciA9IHRoaXMuZmluZFJlbmRlcmVyKHByZWZlcnJlZFJlbmRlcmVySWQsIGl0ZW0pO1xuXHRcdFx0aWYgKCFwcmltYXJ5UmVuZGVyZXIpIHtcblx0XHRcdFx0Y29uc3QgZXJyb3JNZXNzYWdlID0gKHdpbmRvdy5kb2N1bWVudC5kb2N1bWVudEVsZW1lbnQuc3R5bGUuZ2V0UHJvcGVydHlWYWx1ZSgnLS1ub3RlYm9vay1jZWxsLXJlbmRlcmVyLW5vdC1mb3VuZC1lcnJvcicpIHx8ICcnKS5yZXBsYWNlKCckMCcsICgpID0+IGl0ZW0ubWltZSk7XG5cdFx0XHRcdHRoaXMuc2hvd1JlbmRlckVycm9yKGl0ZW0sIGVsZW1lbnQsIGVycm9yTWVzc2FnZSk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Ly8gVHJ5IHByaW1hcnkgcmVuZGVyZXIgZmlyc3Rcblx0XHRcdGlmICghKGF3YWl0IHRoaXMuX2RvUmVuZGVyKGl0ZW0sIGVsZW1lbnQsIHByaW1hcnlSZW5kZXJlciwgc2lnbmFsKSkuY29udGludWUpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBQcmltYXJ5IHJlbmRlcmVyIGZhaWxlZCBpbiBhbiBleHBlY3RlZCB3YXkuIEZhbGxiYWNrIHRvIHJlbmRlciB0aGUgbmV4dCBtaW1lIHR5cGVzXG5cdFx0XHRmb3IgKGNvbnN0IGFkZGl0aW9uYWxJdGVtRGF0YSBvZiBpdGVtLl9hbGxPdXRwdXRJdGVtcykge1xuXHRcdFx0XHRpZiAoYWRkaXRpb25hbEl0ZW1EYXRhLm1pbWUgPT09IGl0ZW0ubWltZSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgYWRkaXRpb25hbEl0ZW0gPSBhd2FpdCBhZGRpdGlvbmFsSXRlbURhdGEuZ2V0SXRlbSgpO1xuXHRcdFx0XHRpZiAoc2lnbmFsLmFib3J0ZWQpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoYWRkaXRpb25hbEl0ZW0pIHtcblx0XHRcdFx0XHRjb25zdCByZW5kZXJlciA9IHRoaXMuZmluZFJlbmRlcmVyKHVuZGVmaW5lZCwgYWRkaXRpb25hbEl0ZW0pO1xuXHRcdFx0XHRcdGlmIChyZW5kZXJlcikge1xuXHRcdFx0XHRcdFx0aWYgKCEoYXdhaXQgdGhpcy5fZG9SZW5kZXIoYWRkaXRpb25hbEl0ZW0sIGVsZW1lbnQsIHJlbmRlcmVyLCBzaWduYWwpKS5jb250aW51ZSkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm47IC8vIFdlIHJlbmRlcmVkIHN1Y2Nlc3NmdWxseVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBBbGwgcmVuZGVyZXJzIGhhdmUgZmFpbGVkIGFuZCB0aGVyZSBpcyBub3RoaW5nIGxlZnQgdG8gZmFsbGJhY2sgdG9cblx0XHRcdGNvbnN0IGVycm9yTWVzc2FnZSA9ICh3aW5kb3cuZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50LnN0eWxlLmdldFByb3BlcnR5VmFsdWUoJy0tbm90ZWJvb2stY2VsbC1yZW5kZXJlci1mYWxsYmFja3MtZXhoYXVzdGVkJykgfHwgJycpLnJlcGxhY2UoJyQwJywgKCkgPT4gaXRlbS5taW1lKTtcblx0XHRcdHRoaXMuc2hvd1JlbmRlckVycm9yKGl0ZW0sIGVsZW1lbnQsIGVycm9yTWVzc2FnZSk7XG5cdFx0fVxuXG5cdFx0cHJpdmF0ZSBhc3luYyBfZG9SZW5kZXIoaXRlbTogcmVuZGVyZXJBcGkuT3V0cHV0SXRlbSwgZWxlbWVudDogSFRNTEVsZW1lbnQsIHJlbmRlcmVyOiBSZW5kZXJlciwgc2lnbmFsOiBBYm9ydFNpZ25hbCk6IFByb21pc2U8eyBjb250aW51ZTogYm9vbGVhbiB9PiB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCByZW5kZXJlci5yZW5kZXJPdXRwdXRJdGVtKGl0ZW0sIGVsZW1lbnQsIHNpZ25hbCk7XG5cdFx0XHRcdHJldHVybiB7IGNvbnRpbnVlOiBmYWxzZSB9OyAvLyBXZSByZW5kZXJlZCBzdWNjZXNzZnVsbHlcblx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0aWYgKHNpZ25hbC5hYm9ydGVkKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHsgY29udGludWU6IGZhbHNlIH07XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoZSBpbnN0YW5jZW9mIEVycm9yICYmIGUubmFtZSA9PT0gcmVuZGVyRmFsbGJhY2tFcnJvck5hbWUpIHtcblx0XHRcdFx0XHRyZXR1cm4geyBjb250aW51ZTogdHJ1ZSB9O1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRocm93IGU7IC8vIEJhaWwgYW5kIGxldCBjYWxsZXJzIGhhbmRsZSB1bmtub3duIGVycm9yc1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cHJpdmF0ZSBmaW5kUmVuZGVyZXIocHJlZmVycmVkUmVuZGVyZXJJZDogc3RyaW5nIHwgdW5kZWZpbmVkLCBpbmZvOiByZW5kZXJlckFwaS5PdXRwdXRJdGVtKSB7XG5cdFx0XHRsZXQgcmVuZGVyZXI6IFJlbmRlcmVyIHwgdW5kZWZpbmVkO1xuXG5cdFx0XHRpZiAodHlwZW9mIHByZWZlcnJlZFJlbmRlcmVySWQgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdHJlbmRlcmVyID0gQXJyYXkuZnJvbSh0aGlzLl9yZW5kZXJlcnMudmFsdWVzKCkpXG5cdFx0XHRcdFx0LmZpbmQoKHJlbmRlcmVyKSA9PiByZW5kZXJlci5kYXRhLmlkID09PSBwcmVmZXJyZWRSZW5kZXJlcklkKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IHJlbmRlcmVycyA9IEFycmF5LmZyb20odGhpcy5fcmVuZGVyZXJzLnZhbHVlcygpKVxuXHRcdFx0XHRcdC5maWx0ZXIoKHJlbmRlcmVyKSA9PiByZW5kZXJlci5kYXRhLm1pbWVUeXBlcy5pbmNsdWRlcyhpbmZvLm1pbWUpICYmICFyZW5kZXJlci5kYXRhLmVudHJ5cG9pbnQuZXh0ZW5kcyk7XG5cblx0XHRcdFx0aWYgKHJlbmRlcmVycy5sZW5ndGgpIHtcblx0XHRcdFx0XHQvLyBEZS1wcmlvcml0aXplIGJ1aWx0LWluIHJlbmRlcmVyc1xuXHRcdFx0XHRcdHJlbmRlcmVycy5zb3J0KChhLCBiKSA9PiArYS5kYXRhLmlzQnVpbHRpbiAtICtiLmRhdGEuaXNCdWlsdGluKTtcblxuXHRcdFx0XHRcdC8vIFVzZSBmaXJzdCByZW5kZXJlciB3ZSBmaW5kIGluIHNvcnRlZCBsaXN0XG5cdFx0XHRcdFx0cmVuZGVyZXIgPSByZW5kZXJlcnNbMF07XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiByZW5kZXJlcjtcblx0XHR9XG5cblx0XHRwcml2YXRlIHNob3dSZW5kZXJFcnJvcihpbmZvOiByZW5kZXJlckFwaS5PdXRwdXRJdGVtLCBlbGVtZW50OiBIVE1MRWxlbWVudCwgZXJyb3JNZXNzYWdlOiBzdHJpbmcpIHtcblx0XHRcdGNvbnN0IGVycm9yQ29udGFpbmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cblx0XHRcdGNvbnN0IGVycm9yID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0XHRlcnJvci5jbGFzc05hbWUgPSAnbm8tcmVuZGVyZXItZXJyb3InO1xuXHRcdFx0ZXJyb3IuaW5uZXJUZXh0ID0gZXJyb3JNZXNzYWdlO1xuXG5cdFx0XHRjb25zdCBjZWxsVGV4dCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdFx0Y2VsbFRleHQuaW5uZXJUZXh0ID0gaW5mby50ZXh0KCk7XG5cblx0XHRcdGVycm9yQ29udGFpbmVyLmFwcGVuZENoaWxkKGVycm9yKTtcblx0XHRcdGVycm9yQ29udGFpbmVyLmFwcGVuZENoaWxkKGNlbGxUZXh0KTtcblxuXHRcdFx0ZWxlbWVudC5pbm5lclRleHQgPSAnJztcblx0XHRcdGVsZW1lbnQuYXBwZW5kQ2hpbGQoZXJyb3JDb250YWluZXIpO1xuXHRcdH1cblx0fSgpO1xuXG5cdGNvbnN0IHZpZXdNb2RlbCA9IG5ldyBjbGFzcyBWaWV3TW9kZWwge1xuXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfbWFya3VwQ2VsbHMgPSBuZXcgTWFwPHN0cmluZywgTWFya3VwQ2VsbD4oKTtcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9vdXRwdXRDZWxscyA9IG5ldyBNYXA8c3RyaW5nLCBPdXRwdXRDZWxsPigpO1xuXG5cdFx0cHVibGljIGNsZWFyQWxsKCkge1xuXHRcdFx0Zm9yIChjb25zdCBjZWxsIG9mIHRoaXMuX21hcmt1cENlbGxzLnZhbHVlcygpKSB7XG5cdFx0XHRcdGNlbGwuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fbWFya3VwQ2VsbHMuY2xlYXIoKTtcblxuXHRcdFx0Zm9yIChjb25zdCBvdXRwdXQgb2YgdGhpcy5fb3V0cHV0Q2VsbHMudmFsdWVzKCkpIHtcblx0XHRcdFx0b3V0cHV0LmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX291dHB1dENlbGxzLmNsZWFyKCk7XG5cdFx0fVxuXG5cdFx0cHJpdmF0ZSBhc3luYyBjcmVhdGVNYXJrdXBDZWxsKGluaXQ6IHdlYnZpZXdNZXNzYWdlcy5JTWFya3VwQ2VsbEluaXRpYWxpemF0aW9uLCB0b3A6IG51bWJlciwgdmlzaWJsZTogYm9vbGVhbik6IFByb21pc2U8TWFya3VwQ2VsbD4ge1xuXHRcdFx0Y29uc3QgZXhpc3RpbmcgPSB0aGlzLl9tYXJrdXBDZWxscy5nZXQoaW5pdC5jZWxsSWQpO1xuXHRcdFx0aWYgKGV4aXN0aW5nKSB7XG5cdFx0XHRcdGNvbnNvbGUuZXJyb3IoYFRyeWluZyB0byBjcmVhdGUgbWFya3VwIHRoYXQgYWxyZWFkeSBleGlzdHM6ICR7aW5pdC5jZWxsSWR9YCk7XG5cdFx0XHRcdHJldHVybiBleGlzdGluZztcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgY2VsbCA9IG5ldyBNYXJrdXBDZWxsKGluaXQuY2VsbElkLCBpbml0Lm1pbWUsIGluaXQuY29udGVudCwgdG9wLCBpbml0Lm1ldGFkYXRhKTtcblx0XHRcdGNlbGwuZWxlbWVudC5zdHlsZS52aXNpYmlsaXR5ID0gdmlzaWJsZSA/ICcnIDogJ2hpZGRlbic7XG5cdFx0XHR0aGlzLl9tYXJrdXBDZWxscy5zZXQoaW5pdC5jZWxsSWQsIGNlbGwpO1xuXG5cdFx0XHRhd2FpdCBjZWxsLnJlYWR5O1xuXHRcdFx0cmV0dXJuIGNlbGw7XG5cdFx0fVxuXG5cdFx0cHVibGljIGFzeW5jIGVuc3VyZU1hcmt1cENlbGwoaW5mbzogd2Vidmlld01lc3NhZ2VzLklNYXJrdXBDZWxsSW5pdGlhbGl6YXRpb24pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdGxldCBjZWxsID0gdGhpcy5fbWFya3VwQ2VsbHMuZ2V0KGluZm8uY2VsbElkKTtcblx0XHRcdGlmIChjZWxsKSB7XG5cdFx0XHRcdGNlbGwuZWxlbWVudC5zdHlsZS52aXNpYmlsaXR5ID0gaW5mby52aXNpYmxlID8gJycgOiAnaGlkZGVuJztcblx0XHRcdFx0YXdhaXQgY2VsbC51cGRhdGVDb250ZW50QW5kUmVuZGVyKGluZm8uY29udGVudCwgaW5mby5tZXRhZGF0YSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjZWxsID0gYXdhaXQgdGhpcy5jcmVhdGVNYXJrdXBDZWxsKGluZm8sIGluZm8ub2Zmc2V0LCBpbmZvLnZpc2libGUpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHB1YmxpYyBkZWxldGVNYXJrdXBDZWxsKGlkOiBzdHJpbmcpIHtcblx0XHRcdGNvbnN0IGNlbGwgPSB0aGlzLmdldEV4cGVjdGVkTWFya3VwQ2VsbChpZCk7XG5cdFx0XHRpZiAoY2VsbCkge1xuXHRcdFx0XHRjZWxsLnJlbW92ZSgpO1xuXHRcdFx0XHRjZWxsLmRpc3Bvc2UoKTtcblx0XHRcdFx0dGhpcy5fbWFya3VwQ2VsbHMuZGVsZXRlKGlkKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRwdWJsaWMgYXN5bmMgdXBkYXRlTWFya3VwQ29udGVudChpZDogc3RyaW5nLCBuZXdDb250ZW50OiBzdHJpbmcsIG1ldGFkYXRhOiBOb3RlYm9va0NlbGxNZXRhZGF0YSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0Y29uc3QgY2VsbCA9IHRoaXMuZ2V0RXhwZWN0ZWRNYXJrdXBDZWxsKGlkKTtcblx0XHRcdGF3YWl0IGNlbGw/LnVwZGF0ZUNvbnRlbnRBbmRSZW5kZXIobmV3Q29udGVudCwgbWV0YWRhdGEpO1xuXHRcdH1cblxuXHRcdHB1YmxpYyBzaG93TWFya3VwQ2VsbChpZDogc3RyaW5nLCB0b3A6IG51bWJlciwgbmV3Q29udGVudDogc3RyaW5nIHwgdW5kZWZpbmVkLCBtZXRhZGF0YTogTm90ZWJvb2tDZWxsTWV0YWRhdGEgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRcdGNvbnN0IGNlbGwgPSB0aGlzLmdldEV4cGVjdGVkTWFya3VwQ2VsbChpZCk7XG5cdFx0XHRjZWxsPy5zaG93KHRvcCwgbmV3Q29udGVudCwgbWV0YWRhdGEpO1xuXHRcdH1cblxuXHRcdHB1YmxpYyBoaWRlTWFya3VwQ2VsbChpZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0XHRjb25zdCBjZWxsID0gdGhpcy5nZXRFeHBlY3RlZE1hcmt1cENlbGwoaWQpO1xuXHRcdFx0Y2VsbD8uaGlkZSgpO1xuXHRcdH1cblxuXHRcdHB1YmxpYyB1bmhpZGVNYXJrdXBDZWxsKGlkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRcdGNvbnN0IGNlbGwgPSB0aGlzLmdldEV4cGVjdGVkTWFya3VwQ2VsbChpZCk7XG5cdFx0XHRjZWxsPy51bmhpZGUoKTtcblx0XHR9XG5cblx0XHRwcml2YXRlIGdldEV4cGVjdGVkTWFya3VwQ2VsbChpZDogc3RyaW5nKTogTWFya3VwQ2VsbCB8IHVuZGVmaW5lZCB7XG5cdFx0XHRjb25zdCBjZWxsID0gdGhpcy5fbWFya3VwQ2VsbHMuZ2V0KGlkKTtcblx0XHRcdGlmICghY2VsbCkge1xuXHRcdFx0XHRjb25zb2xlLmxvZyhgQ291bGQgbm90IGZpbmQgbWFya3VwIGNlbGwgJyR7aWR9J2ApO1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGNlbGw7XG5cdFx0fVxuXG5cdFx0cHVibGljIHVwZGF0ZVNlbGVjdGVkQ2VsbHMoc2VsZWN0ZWRDZWxsSWRzOiByZWFkb25seSBzdHJpbmdbXSkge1xuXHRcdFx0Y29uc3Qgc2VsZWN0ZWRDZWxsU2V0ID0gbmV3IFNldDxzdHJpbmc+KHNlbGVjdGVkQ2VsbElkcyk7XG5cdFx0XHRmb3IgKGNvbnN0IGNlbGwgb2YgdGhpcy5fbWFya3VwQ2VsbHMudmFsdWVzKCkpIHtcblx0XHRcdFx0Y2VsbC5zZXRTZWxlY3RlZChzZWxlY3RlZENlbGxTZXQuaGFzKGNlbGwuaWQpKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRwdWJsaWMgdG9nZ2xlRHJhZ0Ryb3BFbmFibGVkKGRyYWdBbmREcm9wRW5hYmxlZDogYm9vbGVhbikge1xuXHRcdFx0Zm9yIChjb25zdCBjZWxsIG9mIHRoaXMuX21hcmt1cENlbGxzLnZhbHVlcygpKSB7XG5cdFx0XHRcdGNlbGwudG9nZ2xlRHJhZ0Ryb3BFbmFibGVkKGRyYWdBbmREcm9wRW5hYmxlZCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cHVibGljIHVwZGF0ZU1hcmt1cFNjcm9sbHMobWFya3VwQ2VsbHM6IHJlYWRvbmx5IHdlYnZpZXdNZXNzYWdlcy5JTWFya3VwQ2VsbFNjcm9sbFRvcHNbXSkge1xuXHRcdFx0Zm9yIChjb25zdCB7IGlkLCB0b3AgfSBvZiBtYXJrdXBDZWxscykge1xuXHRcdFx0XHRjb25zdCBjZWxsID0gdGhpcy5fbWFya3VwQ2VsbHMuZ2V0KGlkKTtcblx0XHRcdFx0aWYgKGNlbGwpIHtcblx0XHRcdFx0XHRjZWxsLmVsZW1lbnQuc3R5bGUudG9wID0gYCR7dG9wfXB4YDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHB1YmxpYyBhc3luYyByZW5kZXJPdXRwdXRDZWxsKGRhdGE6IHdlYnZpZXdNZXNzYWdlcy5JQ3JlYXRpb25SZXF1ZXN0TWVzc2FnZSwgc2lnbmFsOiBBYm9ydFNpZ25hbCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0Y29uc3QgcHJlbG9hZEVycm9ycyA9IGF3YWl0IFByb21pc2UuYWxsPHVuZGVmaW5lZCB8IEVycm9yPihcblx0XHRcdFx0ZGF0YS5yZXF1aXJlZFByZWxvYWRzLm1hcChwID0+IGtlcm5lbFByZWxvYWRzLndhaXRGb3IocC51cmkpLnRoZW4oKCkgPT4gdW5kZWZpbmVkLCBlcnIgPT4gZXJyKSlcblx0XHRcdCk7XG5cdFx0XHRpZiAoc2lnbmFsLmFib3J0ZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBjZWxsT3V0cHV0ID0gdGhpcy5lbnN1cmVPdXRwdXRDZWxsKGRhdGEuY2VsbElkLCBkYXRhLmNlbGxUb3AsIGZhbHNlKTtcblx0XHRcdHJldHVybiBjZWxsT3V0cHV0LnJlbmRlck91dHB1dEVsZW1lbnQoZGF0YSwgcHJlbG9hZEVycm9ycywgc2lnbmFsKTtcblx0XHR9XG5cblx0XHRwdWJsaWMgZW5zdXJlT3V0cHV0Q2VsbChjZWxsSWQ6IHN0cmluZywgY2VsbFRvcDogbnVtYmVyLCBza2lwQ2VsbFRvcFVwZGF0ZUlmRXhpc3Q6IGJvb2xlYW4pOiBPdXRwdXRDZWxsIHtcblx0XHRcdGxldCBjZWxsID0gdGhpcy5fb3V0cHV0Q2VsbHMuZ2V0KGNlbGxJZCk7XG5cdFx0XHRjb25zdCBleGlzdGVkID0gISFjZWxsO1xuXHRcdFx0aWYgKCFjZWxsKSB7XG5cdFx0XHRcdGNlbGwgPSBuZXcgT3V0cHV0Q2VsbChjZWxsSWQpO1xuXHRcdFx0XHR0aGlzLl9vdXRwdXRDZWxscy5zZXQoY2VsbElkLCBjZWxsKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGV4aXN0ZWQgJiYgc2tpcENlbGxUb3BVcGRhdGVJZkV4aXN0KSB7XG5cdFx0XHRcdHJldHVybiBjZWxsO1xuXHRcdFx0fVxuXG5cdFx0XHRjZWxsLmVsZW1lbnQuc3R5bGUudG9wID0gY2VsbFRvcCArICdweCc7XG5cdFx0XHRyZXR1cm4gY2VsbDtcblx0XHR9XG5cblx0XHRwdWJsaWMgY2xlYXJPdXRwdXQoY2VsbElkOiBzdHJpbmcsIG91dHB1dElkOiBzdHJpbmcsIHJlbmRlcmVySWQ6IHN0cmluZyB8IHVuZGVmaW5lZCkge1xuXHRcdFx0Y29uc3QgY2VsbCA9IHRoaXMuX291dHB1dENlbGxzLmdldChjZWxsSWQpO1xuXHRcdFx0Y2VsbD8uY2xlYXJPdXRwdXQob3V0cHV0SWQsIHJlbmRlcmVySWQpO1xuXHRcdH1cblxuXHRcdHB1YmxpYyBzaG93T3V0cHV0KGNlbGxJZDogc3RyaW5nLCBvdXRwdXRJZDogc3RyaW5nLCB0b3A6IG51bWJlcikge1xuXHRcdFx0Y29uc3QgY2VsbCA9IHRoaXMuX291dHB1dENlbGxzLmdldChjZWxsSWQpO1xuXHRcdFx0Y2VsbD8uc2hvdyhvdXRwdXRJZCwgdG9wKTtcblx0XHR9XG5cblx0XHRwdWJsaWMgdXBkYXRlQW5kUmVyZW5kZXIoY2VsbElkOiBzdHJpbmcsIG91dHB1dElkOiBzdHJpbmcsIGNvbnRlbnQ6IHdlYnZpZXdNZXNzYWdlcy5JQ3JlYXRpb25Db250ZW50KSB7XG5cdFx0XHRjb25zdCBjZWxsID0gdGhpcy5fb3V0cHV0Q2VsbHMuZ2V0KGNlbGxJZCk7XG5cdFx0XHRjZWxsPy51cGRhdGVDb250ZW50QW5kUmVyZW5kZXIob3V0cHV0SWQsIGNvbnRlbnQpO1xuXHRcdH1cblxuXHRcdHB1YmxpYyBoaWRlT3V0cHV0KGNlbGxJZDogc3RyaW5nKSB7XG5cdFx0XHRjb25zdCBjZWxsID0gdGhpcy5fb3V0cHV0Q2VsbHMuZ2V0KGNlbGxJZCk7XG5cdFx0XHRjZWxsPy5oaWRlKCk7XG5cdFx0fVxuXG5cdFx0cHVibGljIHVwZGF0ZU91dHB1dEhlaWdodChjZWxsSWQ6IHN0cmluZywgb3V0cHV0SWQ6IHN0cmluZywgaGVpZ2h0OiBudW1iZXIpIHtcblx0XHRcdGNvbnN0IGNlbGwgPSB0aGlzLl9vdXRwdXRDZWxscy5nZXQoY2VsbElkKTtcblx0XHRcdGNlbGw/LnVwZGF0ZU91dHB1dEhlaWdodChvdXRwdXRJZCwgaGVpZ2h0KTtcblx0XHR9XG5cblx0XHRwdWJsaWMgdXBkYXRlT3V0cHV0c1Njcm9sbCh1cGRhdGVzOiB3ZWJ2aWV3TWVzc2FnZXMuSUNvbnRlbnRXaWRnZXRUb3BSZXF1ZXN0W10pIHtcblx0XHRcdGZvciAoY29uc3QgcmVxdWVzdCBvZiB1cGRhdGVzKSB7XG5cdFx0XHRcdGNvbnN0IGNlbGwgPSB0aGlzLl9vdXRwdXRDZWxscy5nZXQocmVxdWVzdC5jZWxsSWQpO1xuXHRcdFx0XHRjZWxsPy51cGRhdGVTY3JvbGwocmVxdWVzdCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9KCk7XG5cblx0Y2xhc3MgTWFya2Rvd25Db2RlQmxvY2sge1xuXHRcdHByaXZhdGUgc3RhdGljIHBlbmRpbmdDb2RlQmxvY2tzVG9IaWdobGlnaHQgPSBuZXcgTWFwPHN0cmluZywgSFRNTEVsZW1lbnQ+KCk7XG5cblx0XHRwdWJsaWMgc3RhdGljIGhpZ2hsaWdodENvZGVCbG9jayhpZDogc3RyaW5nLCBodG1sOiBzdHJpbmcpIHtcblx0XHRcdGNvbnN0IGVsID0gTWFya2Rvd25Db2RlQmxvY2sucGVuZGluZ0NvZGVCbG9ja3NUb0hpZ2hsaWdodC5nZXQoaWQpO1xuXHRcdFx0aWYgKCFlbCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCB0cnVzdGVkSHRtbCA9IHR0UG9saWN5Py5jcmVhdGVIVE1MKGh0bWwpID8/IGh0bWw7XG5cdFx0XHRlbC5pbm5lckhUTUwgPSB0cnVzdGVkSHRtbCBhcyBzdHJpbmc7IC8vIENvZGVRTCBbU00wMzcxMl0gVGhlIHJlbmRlcmVkIGNvbnRlbnQgY29tZXMgZnJvbSBWUyBDb2RlJ3MgdG9rZW5pemVyIGFuZCBpcyBjb25zaWRlcmVkIHNhZmVcblx0XHRcdGNvbnN0IHJvb3QgPSBlbC5nZXRSb290Tm9kZSgpO1xuXHRcdFx0aWYgKHJvb3QgaW5zdGFuY2VvZiBTaGFkb3dSb290KSB7XG5cdFx0XHRcdGlmICghcm9vdC5hZG9wdGVkU3R5bGVTaGVldHMuaW5jbHVkZXModG9rZW5pemF0aW9uU3R5bGUpKSB7XG5cdFx0XHRcdFx0cm9vdC5hZG9wdGVkU3R5bGVTaGVldHMucHVzaCh0b2tlbml6YXRpb25TdHlsZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRwdWJsaWMgc3RhdGljIHJlcXVlc3RIaWdobGlnaHRDb2RlQmxvY2socm9vdDogSFRNTEVsZW1lbnQgfCBTaGFkb3dSb290KSB7XG5cdFx0XHRjb25zdCBjb2RlQmxvY2tzOiBBcnJheTx7IHZhbHVlOiBzdHJpbmc7IGxhbmc6IHN0cmluZzsgaWQ6IHN0cmluZyB9PiA9IFtdO1xuXHRcdFx0bGV0IGkgPSAwO1xuXHRcdFx0Zm9yIChjb25zdCBlbCBvZiByb290LnF1ZXJ5U2VsZWN0b3JBbGwoJy52c2NvZGUtY29kZS1ibG9jaycpKSB7XG5cdFx0XHRcdGNvbnN0IGxhbmcgPSBlbC5nZXRBdHRyaWJ1dGUoJ2RhdGEtdnNjb2RlLWNvZGUtYmxvY2stbGFuZycpO1xuXHRcdFx0XHRpZiAoZWwudGV4dENvbnRlbnQgJiYgbGFuZykge1xuXHRcdFx0XHRcdGNvbnN0IGlkID0gYCR7RGF0ZS5ub3coKX0tJHtpKyt9YDtcblx0XHRcdFx0XHRjb2RlQmxvY2tzLnB1c2goeyB2YWx1ZTogZWwudGV4dENvbnRlbnQsIGxhbmc6IGxhbmcsIGlkIH0pO1xuXHRcdFx0XHRcdE1hcmtkb3duQ29kZUJsb2NrLnBlbmRpbmdDb2RlQmxvY2tzVG9IaWdobGlnaHQuc2V0KGlkLCBlbCBhcyBIVE1MRWxlbWVudCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIGNvZGVCbG9ja3M7XG5cdFx0fVxuXHR9XG5cblx0Y2xhc3MgTWFya3VwQ2VsbCB7XG5cblx0XHRwdWJsaWMgcmVhZG9ubHkgcmVhZHk6IFByb21pc2U8dm9pZD47XG5cblx0XHRwdWJsaWMgcmVhZG9ubHkgaWQ6IHN0cmluZztcblx0XHRwdWJsaWMgcmVhZG9ubHkgZWxlbWVudDogSFRNTEVsZW1lbnQ7XG5cblx0XHRwcml2YXRlIHJlYWRvbmx5IG91dHB1dEl0ZW06IEV4dGVuZGVkT3V0cHV0SXRlbTtcblxuXHRcdC8vLyBJbnRlcm5hbCBmaWVsZCB0aGF0IGhvbGRzIHRleHQgY29udGVudFxuXHRcdHByaXZhdGUgX2NvbnRlbnQ6IHsgcmVhZG9ubHkgdmFsdWU6IHN0cmluZzsgcmVhZG9ubHkgdmVyc2lvbjogbnVtYmVyOyByZWFkb25seSBtZXRhZGF0YTogTm90ZWJvb2tDZWxsTWV0YWRhdGEgfTtcblxuXHRcdHByaXZhdGUgX2lzRGlzcG9zZWQgPSBmYWxzZTtcblx0XHRwcml2YXRlIHJlbmRlclRhc2tBYm9ydD86IEFib3J0Q29udHJvbGxlcjtcblxuXHRcdGNvbnN0cnVjdG9yKGlkOiBzdHJpbmcsIG1pbWU6IHN0cmluZywgY29udGVudDogc3RyaW5nLCB0b3A6IG51bWJlciwgbWV0YWRhdGE6IE5vdGVib29rQ2VsbE1ldGFkYXRhKSB7XG5cdFx0XHRjb25zdCBzZWxmID0gdGhpcztcblx0XHRcdHRoaXMuaWQgPSBpZDtcblx0XHRcdHRoaXMuX2NvbnRlbnQgPSB7IHZhbHVlOiBjb250ZW50LCB2ZXJzaW9uOiAwLCBtZXRhZGF0YTogbWV0YWRhdGEgfTtcblxuXHRcdFx0Y29uc3QgeyBwcm9taXNlLCByZXNvbHZlLCByZWplY3QgfSA9IHByb21pc2VXaXRoUmVzb2x2ZXJzPHZvaWQ+KCk7XG5cdFx0XHR0aGlzLnJlYWR5ID0gcHJvbWlzZTtcblxuXHRcdFx0bGV0IGNhY2hlZERhdGE6IHsgcmVhZG9ubHkgdmVyc2lvbjogbnVtYmVyOyByZWFkb25seSB2YWx1ZTogVWludDhBcnJheSB9IHwgdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy5vdXRwdXRJdGVtID0gT2JqZWN0LmZyZWV6ZTxFeHRlbmRlZE91dHB1dEl0ZW0+KHtcblx0XHRcdFx0aWQsXG5cdFx0XHRcdG1pbWUsXG5cblx0XHRcdFx0Z2V0IG1ldGFkYXRhKCk6IE5vdGVib29rQ2VsbE1ldGFkYXRhIHtcblx0XHRcdFx0XHRyZXR1cm4gc2VsZi5fY29udGVudC5tZXRhZGF0YTtcblx0XHRcdFx0fSxcblxuXHRcdFx0XHR0ZXh0OiAoKTogc3RyaW5nID0+IHtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5fY29udGVudC52YWx1ZTtcblx0XHRcdFx0fSxcblxuXHRcdFx0XHRqc29uOiAoKSA9PiB7XG5cdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0fSxcblxuXHRcdFx0XHRkYXRhOiAoKTogVWludDhBcnJheSA9PiB7XG5cdFx0XHRcdFx0aWYgKGNhY2hlZERhdGE/LnZlcnNpb24gPT09IHRoaXMuX2NvbnRlbnQudmVyc2lvbikge1xuXHRcdFx0XHRcdFx0cmV0dXJuIGNhY2hlZERhdGEudmFsdWU7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Y29uc3QgZGF0YSA9IHRleHRFbmNvZGVyLmVuY29kZSh0aGlzLl9jb250ZW50LnZhbHVlKTtcblx0XHRcdFx0XHRjYWNoZWREYXRhID0geyB2ZXJzaW9uOiB0aGlzLl9jb250ZW50LnZlcnNpb24sIHZhbHVlOiBkYXRhIH07XG5cdFx0XHRcdFx0cmV0dXJuIGRhdGE7XG5cdFx0XHRcdH0sXG5cblx0XHRcdFx0YmxvYigpOiBCbG9iIHtcblx0XHRcdFx0XHRyZXR1cm4gbmV3IEJsb2IoW3RoaXMuZGF0YSgpIGFzIFVpbnQ4QXJyYXk8QXJyYXlCdWZmZXI+XSwgeyB0eXBlOiB0aGlzLm1pbWUgfSk7XG5cdFx0XHRcdH0sXG5cblx0XHRcdFx0X2FsbE91dHB1dEl0ZW1zOiBbe1xuXHRcdFx0XHRcdG1pbWUsXG5cdFx0XHRcdFx0Z2V0SXRlbTogYXN5bmMgKCkgPT4gdGhpcy5vdXRwdXRJdGVtLFxuXHRcdFx0XHR9XVxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHJvb3QgPSB3aW5kb3cuZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2NvbnRhaW5lcicpITtcblx0XHRcdGNvbnN0IG1hcmt1cENlbGwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRcdG1hcmt1cENlbGwuY2xhc3NOYW1lID0gJ21hcmt1cCc7XG5cdFx0XHRtYXJrdXBDZWxsLnN0eWxlLnBvc2l0aW9uID0gJ2Fic29sdXRlJztcblx0XHRcdG1hcmt1cENlbGwuc3R5bGUud2lkdGggPSAnMTAwJSc7XG5cblx0XHRcdHRoaXMuZWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdFx0dGhpcy5lbGVtZW50LmlkID0gdGhpcy5pZDtcblx0XHRcdHRoaXMuZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdwcmV2aWV3Jyk7XG5cdFx0XHR0aGlzLmVsZW1lbnQuc3R5bGUucG9zaXRpb24gPSAnYWJzb2x1dGUnO1xuXHRcdFx0dGhpcy5lbGVtZW50LnN0eWxlLnRvcCA9IHRvcCArICdweCc7XG5cdFx0XHR0aGlzLnRvZ2dsZURyYWdEcm9wRW5hYmxlZChjdXJyZW50T3B0aW9ucy5kcmFnQW5kRHJvcEVuYWJsZWQpO1xuXHRcdFx0bWFya3VwQ2VsbC5hcHBlbmRDaGlsZCh0aGlzLmVsZW1lbnQpO1xuXHRcdFx0cm9vdC5hcHBlbmRDaGlsZChtYXJrdXBDZWxsKTtcblxuXHRcdFx0dGhpcy5hZGRFdmVudExpc3RlbmVycygpO1xuXG5cdFx0XHR0aGlzLnVwZGF0ZUNvbnRlbnRBbmRSZW5kZXIodGhpcy5fY29udGVudC52YWx1ZSwgdGhpcy5fY29udGVudC5tZXRhZGF0YSkudGhlbigoKSA9PiB7XG5cdFx0XHRcdGlmICghdGhpcy5faXNEaXNwb3NlZCkge1xuXHRcdFx0XHRcdHJlc2l6ZU9ic2VydmVyLm9ic2VydmUodGhpcy5lbGVtZW50LCB0aGlzLmlkLCBmYWxzZSwgdGhpcy5pZCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmVzb2x2ZSgpO1xuXHRcdFx0fSwgKCkgPT4gcmVqZWN0KCkpO1xuXHRcdH1cblxuXHRcdHB1YmxpYyBkaXNwb3NlKCkge1xuXHRcdFx0dGhpcy5faXNEaXNwb3NlZCA9IHRydWU7XG5cdFx0XHR0aGlzLnJlbmRlclRhc2tBYm9ydD8uYWJvcnQoKTtcblx0XHRcdHRoaXMucmVuZGVyVGFza0Fib3J0ID0gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHByaXZhdGUgYWRkRXZlbnRMaXN0ZW5lcnMoKSB7XG5cdFx0XHR0aGlzLmVsZW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignZGJsY2xpY2snLCAoKSA9PiB7XG5cdFx0XHRcdHBvc3ROb3RlYm9va01lc3NhZ2U8d2Vidmlld01lc3NhZ2VzLklUb2dnbGVNYXJrdXBQcmV2aWV3TWVzc2FnZT4oJ3RvZ2dsZU1hcmt1cFByZXZpZXcnLCB7IGNlbGxJZDogdGhpcy5pZCB9KTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0aGlzLmVsZW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBlID0+IHtcblx0XHRcdFx0cG9zdE5vdGVib29rTWVzc2FnZTx3ZWJ2aWV3TWVzc2FnZXMuSUNsaWNrTWFya3VwQ2VsbE1lc3NhZ2U+KCdjbGlja01hcmt1cENlbGwnLCB7XG5cdFx0XHRcdFx0Y2VsbElkOiB0aGlzLmlkLFxuXHRcdFx0XHRcdGFsdEtleTogZS5hbHRLZXksXG5cdFx0XHRcdFx0Y3RybEtleTogZS5jdHJsS2V5LFxuXHRcdFx0XHRcdG1ldGFLZXk6IGUubWV0YUtleSxcblx0XHRcdFx0XHRzaGlmdEtleTogZS5zaGlmdEtleSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGhpcy5lbGVtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2NvbnRleHRtZW51JywgZSA9PiB7XG5cdFx0XHRcdHBvc3ROb3RlYm9va01lc3NhZ2U8d2Vidmlld01lc3NhZ2VzLklDb250ZXh0TWVudU1hcmt1cENlbGxNZXNzYWdlPignY29udGV4dE1lbnVNYXJrdXBDZWxsJywge1xuXHRcdFx0XHRcdGNlbGxJZDogdGhpcy5pZCxcblx0XHRcdFx0XHRjbGllbnRYOiBlLmNsaWVudFgsXG5cdFx0XHRcdFx0Y2xpZW50WTogZS5jbGllbnRZLFxuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0aGlzLmVsZW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignbW91c2VlbnRlcicsICgpID0+IHtcblx0XHRcdFx0cG9zdE5vdGVib29rTWVzc2FnZTx3ZWJ2aWV3TWVzc2FnZXMuSU1vdXNlRW50ZXJNYXJrdXBDZWxsTWVzc2FnZT4oJ21vdXNlRW50ZXJNYXJrdXBDZWxsJywgeyBjZWxsSWQ6IHRoaXMuaWQgfSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGhpcy5lbGVtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlbGVhdmUnLCAoKSA9PiB7XG5cdFx0XHRcdHBvc3ROb3RlYm9va01lc3NhZ2U8d2Vidmlld01lc3NhZ2VzLklNb3VzZUxlYXZlTWFya3VwQ2VsbE1lc3NhZ2U+KCdtb3VzZUxlYXZlTWFya3VwQ2VsbCcsIHsgY2VsbElkOiB0aGlzLmlkIH0pO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRoaXMuZWxlbWVudC5hZGRFdmVudExpc3RlbmVyKCdkcmFnc3RhcnQnLCBlID0+IHtcblx0XHRcdFx0bWFya3VwQ2VsbERyYWdNYW5hZ2VyLnN0YXJ0RHJhZyhlLCB0aGlzLmlkKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0aGlzLmVsZW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignZHJhZycsIGUgPT4ge1xuXHRcdFx0XHRtYXJrdXBDZWxsRHJhZ01hbmFnZXIudXBkYXRlRHJhZyhlLCB0aGlzLmlkKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0aGlzLmVsZW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignZHJhZ2VuZCcsIGUgPT4ge1xuXHRcdFx0XHRtYXJrdXBDZWxsRHJhZ01hbmFnZXIuZW5kRHJhZyhlLCB0aGlzLmlkKTtcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHB1YmxpYyBhc3luYyB1cGRhdGVDb250ZW50QW5kUmVuZGVyKG5ld0NvbnRlbnQ6IHN0cmluZywgbWV0YWRhdGE6IE5vdGVib29rQ2VsbE1ldGFkYXRhKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHR0aGlzLl9jb250ZW50ID0geyB2YWx1ZTogbmV3Q29udGVudCwgdmVyc2lvbjogdGhpcy5fY29udGVudC52ZXJzaW9uICsgMSwgbWV0YWRhdGEgfTtcblxuXHRcdFx0dGhpcy5yZW5kZXJUYXNrQWJvcnQ/LmFib3J0KCk7XG5cblx0XHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBuZXcgQWJvcnRDb250cm9sbGVyKCk7XG5cdFx0XHR0aGlzLnJlbmRlclRhc2tBYm9ydCA9IGNvbnRyb2xsZXI7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCByZW5kZXJlcnMucmVuZGVyKHRoaXMub3V0cHV0SXRlbSwgdW5kZWZpbmVkLCB0aGlzLmVsZW1lbnQsIHRoaXMucmVuZGVyVGFza0Fib3J0LnNpZ25hbCk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRpZiAodGhpcy5yZW5kZXJUYXNrQWJvcnQgPT09IGNvbnRyb2xsZXIpIHtcblx0XHRcdFx0XHR0aGlzLnJlbmRlclRhc2tBYm9ydCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCByb290ID0gKHRoaXMuZWxlbWVudC5zaGFkb3dSb290ID8/IHRoaXMuZWxlbWVudCk7XG5cdFx0XHRjb25zdCBodG1sID0gW107XG5cdFx0XHRmb3IgKGNvbnN0IGNoaWxkIG9mIHJvb3QuY2hpbGRyZW4pIHtcblx0XHRcdFx0c3dpdGNoIChjaGlsZC50YWdOYW1lKSB7XG5cdFx0XHRcdFx0Y2FzZSAnTElOSyc6XG5cdFx0XHRcdFx0Y2FzZSAnU0NSSVBUJzpcblx0XHRcdFx0XHRjYXNlICdTVFlMRSc6XG5cdFx0XHRcdFx0XHQvLyBub3Qgd29ydGggc2VuZGluZyBvdmVyIHNpbmNlIGl0IHdpbGwgYmUgc3RyaXBwZWQgYmVmb3JlIHJlbmRlcmluZ1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cblx0XHRcdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRcdFx0aHRtbC5wdXNoKGNoaWxkLm91dGVySFRNTCk7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBjb2RlQmxvY2tzOiBBcnJheTx7IHZhbHVlOiBzdHJpbmc7IGxhbmc6IHN0cmluZzsgaWQ6IHN0cmluZyB9PiA9IE1hcmtkb3duQ29kZUJsb2NrLnJlcXVlc3RIaWdobGlnaHRDb2RlQmxvY2socm9vdCk7XG5cblx0XHRcdHBvc3ROb3RlYm9va01lc3NhZ2U8d2Vidmlld01lc3NhZ2VzLklSZW5kZXJlZE1hcmt1cE1lc3NhZ2U+KCdyZW5kZXJlZE1hcmt1cCcsIHtcblx0XHRcdFx0Y2VsbElkOiB0aGlzLmlkLFxuXHRcdFx0XHRodG1sOiBodG1sLmpvaW4oJycpLFxuXHRcdFx0XHRjb2RlQmxvY2tzXG5cdFx0XHR9KTtcblxuXHRcdFx0ZGltZW5zaW9uVXBkYXRlci51cGRhdGVIZWlnaHQodGhpcy5pZCwgdGhpcy5lbGVtZW50Lm9mZnNldEhlaWdodCwge1xuXHRcdFx0XHRpc091dHB1dDogZmFsc2Vcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHB1YmxpYyBzaG93KHRvcDogbnVtYmVyLCBuZXdDb250ZW50OiBzdHJpbmcgfCB1bmRlZmluZWQsIG1ldGFkYXRhOiBOb3RlYm9va0NlbGxNZXRhZGF0YSB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdFx0dGhpcy5lbGVtZW50LnN0eWxlLnZpc2liaWxpdHkgPSAnJztcblx0XHRcdHRoaXMuZWxlbWVudC5zdHlsZS50b3AgPSBgJHt0b3B9cHhgO1xuXHRcdFx0aWYgKHR5cGVvZiBuZXdDb250ZW50ID09PSAnc3RyaW5nJyB8fCBtZXRhZGF0YSkge1xuXHRcdFx0XHR0aGlzLnVwZGF0ZUNvbnRlbnRBbmRSZW5kZXIobmV3Q29udGVudCA/PyB0aGlzLl9jb250ZW50LnZhbHVlLCBtZXRhZGF0YSA/PyB0aGlzLl9jb250ZW50Lm1ldGFkYXRhKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMudXBkYXRlTWFya3VwRGltZW5zaW9ucygpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHB1YmxpYyBoaWRlKCkge1xuXHRcdFx0dGhpcy5lbGVtZW50LnN0eWxlLnZpc2liaWxpdHkgPSAnaGlkZGVuJztcblx0XHR9XG5cblx0XHRwdWJsaWMgdW5oaWRlKCkge1xuXHRcdFx0dGhpcy5lbGVtZW50LnN0eWxlLnZpc2liaWxpdHkgPSAnJztcblx0XHRcdHRoaXMudXBkYXRlTWFya3VwRGltZW5zaW9ucygpO1xuXHRcdH1cblxuXHRcdHB1YmxpYyByZW1vdmUoKSB7XG5cdFx0XHR0aGlzLmVsZW1lbnQucmVtb3ZlKCk7XG5cdFx0fVxuXG5cdFx0cHJpdmF0ZSBhc3luYyB1cGRhdGVNYXJrdXBEaW1lbnNpb25zKCkge1xuXHRcdFx0ZGltZW5zaW9uVXBkYXRlci51cGRhdGVIZWlnaHQodGhpcy5pZCwgdGhpcy5lbGVtZW50Lm9mZnNldEhlaWdodCwge1xuXHRcdFx0XHRpc091dHB1dDogZmFsc2Vcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHB1YmxpYyBzZXRTZWxlY3RlZChzZWxlY3RlZDogYm9vbGVhbikge1xuXHRcdFx0dGhpcy5lbGVtZW50LmNsYXNzTGlzdC50b2dnbGUoJ3NlbGVjdGVkJywgc2VsZWN0ZWQpO1xuXHRcdH1cblxuXHRcdHB1YmxpYyB0b2dnbGVEcmFnRHJvcEVuYWJsZWQoZW5hYmxlZDogYm9vbGVhbikge1xuXHRcdFx0aWYgKGVuYWJsZWQpIHtcblx0XHRcdFx0dGhpcy5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2RyYWdnYWJsZScpO1xuXHRcdFx0XHR0aGlzLmVsZW1lbnQuc2V0QXR0cmlidXRlKCdkcmFnZ2FibGUnLCAndHJ1ZScpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5lbGVtZW50LmNsYXNzTGlzdC5yZW1vdmUoJ2RyYWdnYWJsZScpO1xuXHRcdFx0XHR0aGlzLmVsZW1lbnQucmVtb3ZlQXR0cmlidXRlKCdkcmFnZ2FibGUnKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRjbGFzcyBPdXRwdXRDZWxsIHtcblx0XHRwdWJsaWMgcmVhZG9ubHkgZWxlbWVudDogSFRNTEVsZW1lbnQ7XG5cdFx0cHJpdmF0ZSByZWFkb25seSBvdXRwdXRFbGVtZW50cyA9IG5ldyBNYXA8LypvdXRwdXRJZCovIHN0cmluZywgT3V0cHV0Q29udGFpbmVyPigpO1xuXG5cdFx0Y29uc3RydWN0b3IoY2VsbElkOiBzdHJpbmcpIHtcblx0XHRcdGNvbnN0IGNvbnRhaW5lciA9IHdpbmRvdy5kb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnY29udGFpbmVyJykhO1xuXG5cdFx0XHRjb25zdCB1cHBlcldyYXBwZXJFbGVtZW50ID0gY3JlYXRlRm9jdXNTaW5rKGNlbGxJZCk7XG5cdFx0XHRjb250YWluZXIuYXBwZW5kQ2hpbGQodXBwZXJXcmFwcGVyRWxlbWVudCk7XG5cblx0XHRcdHRoaXMuZWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdFx0dGhpcy5lbGVtZW50LnN0eWxlLnBvc2l0aW9uID0gJ2Fic29sdXRlJztcblx0XHRcdHRoaXMuZWxlbWVudC5zdHlsZS5vdXRsaW5lID0gJzAnO1xuXG5cdFx0XHR0aGlzLmVsZW1lbnQuaWQgPSBjZWxsSWQ7XG5cdFx0XHR0aGlzLmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnY2VsbF9jb250YWluZXInKTtcblxuXHRcdFx0Y29udGFpbmVyLmFwcGVuZENoaWxkKHRoaXMuZWxlbWVudCk7XG5cdFx0XHR0aGlzLmVsZW1lbnQgPSB0aGlzLmVsZW1lbnQ7XG5cblx0XHRcdGNvbnN0IGxvd2VyV3JhcHBlckVsZW1lbnQgPSBjcmVhdGVGb2N1c1NpbmsoY2VsbElkLCB0cnVlKTtcblx0XHRcdGNvbnRhaW5lci5hcHBlbmRDaGlsZChsb3dlcldyYXBwZXJFbGVtZW50KTtcblx0XHR9XG5cblx0XHRwdWJsaWMgZGlzcG9zZSgpIHtcblx0XHRcdGZvciAoY29uc3Qgb3V0cHV0IG9mIHRoaXMub3V0cHV0RWxlbWVudHMudmFsdWVzKCkpIHtcblx0XHRcdFx0b3V0cHV0LmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHRcdHRoaXMub3V0cHV0RWxlbWVudHMuY2xlYXIoKTtcblx0XHR9XG5cblx0XHRwcml2YXRlIGNyZWF0ZU91dHB1dEVsZW1lbnQoZGF0YTogd2Vidmlld01lc3NhZ2VzLklDcmVhdGlvblJlcXVlc3RNZXNzYWdlKTogT3V0cHV0RWxlbWVudCB7XG5cdFx0XHRsZXQgb3V0cHV0Q29udGFpbmVyID0gdGhpcy5vdXRwdXRFbGVtZW50cy5nZXQoZGF0YS5vdXRwdXRJZCk7XG5cdFx0XHRpZiAoIW91dHB1dENvbnRhaW5lcikge1xuXHRcdFx0XHRvdXRwdXRDb250YWluZXIgPSBuZXcgT3V0cHV0Q29udGFpbmVyKGRhdGEub3V0cHV0SWQpO1xuXHRcdFx0XHR0aGlzLmVsZW1lbnQuYXBwZW5kQ2hpbGQob3V0cHV0Q29udGFpbmVyLmVsZW1lbnQpO1xuXHRcdFx0XHR0aGlzLm91dHB1dEVsZW1lbnRzLnNldChkYXRhLm91dHB1dElkLCBvdXRwdXRDb250YWluZXIpO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gb3V0cHV0Q29udGFpbmVyLmNyZWF0ZU91dHB1dEVsZW1lbnQoZGF0YS5vdXRwdXRJZCwgZGF0YS5vdXRwdXRPZmZzZXQsIGRhdGEubGVmdCwgZGF0YS5jZWxsSWQpO1xuXHRcdH1cblxuXHRcdHB1YmxpYyBhc3luYyByZW5kZXJPdXRwdXRFbGVtZW50KGRhdGE6IHdlYnZpZXdNZXNzYWdlcy5JQ3JlYXRpb25SZXF1ZXN0TWVzc2FnZSwgcHJlbG9hZEVycm9yczogUmVhZG9ubHlBcnJheTxFcnJvciB8IHVuZGVmaW5lZD4sIHNpZ25hbDogQWJvcnRTaWduYWwpIHtcblx0XHRcdGNvbnN0IHN0YXJ0VGltZSA9IERhdGUubm93KCk7XG5cdFx0XHRjb25zdCBvdXRwdXRFbGVtZW50IC8qKiBvdXRwdXROb2RlICovID0gdGhpcy5jcmVhdGVPdXRwdXRFbGVtZW50KGRhdGEpO1xuXHRcdFx0YXdhaXQgb3V0cHV0RWxlbWVudC5yZW5kZXIoZGF0YS5jb250ZW50LCBkYXRhLnJlbmRlcmVySWQsIHByZWxvYWRFcnJvcnMsIHNpZ25hbCk7XG5cblx0XHRcdC8vIGRvbid0IGhpZGUgdW50aWwgYWZ0ZXIgdGhpcyBzdGVwIHNvIHRoYXQgdGhlIGhlaWdodCBpcyByaWdodFxuXHRcdFx0b3V0cHV0RWxlbWVudC8qKiBvdXRwdXROb2RlICovLmVsZW1lbnQuc3R5bGUudmlzaWJpbGl0eSA9IGRhdGEuaW5pdGlhbGx5SGlkZGVuID8gJ2hpZGRlbicgOiAnJztcblxuXHRcdFx0aWYgKCEhZGF0YS5leGVjdXRpb25JZCAmJiAhIWRhdGEucmVuZGVyZXJJZCkge1xuXHRcdFx0XHRsZXQgb3V0cHV0U2l6ZTogbnVtYmVyIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRpZiAoZGF0YS5jb250ZW50LnR5cGUgPT09IDEgLyogZXh0ZW5zaW9uICovKSB7XG5cdFx0XHRcdFx0b3V0cHV0U2l6ZSA9IGRhdGEuY29udGVudC5vdXRwdXQudmFsdWVCeXRlcy5sZW5ndGg7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBPbmx5IHNlbmQgcGVyZm9ybWFuY2UgbWVzc2FnZXMgZm9yIG5vbi1lbXB0eSBvdXRwdXRzIHVwIHRvIGEgY2VydGFpbiBzaXplXG5cdFx0XHRcdGlmIChvdXRwdXRTaXplICE9PSB1bmRlZmluZWQgJiYgb3V0cHV0U2l6ZSA+IDAgJiYgb3V0cHV0U2l6ZSA8IDEwMCAqIDEwMjQpIHtcblx0XHRcdFx0XHRwb3N0Tm90ZWJvb2tNZXNzYWdlPHdlYnZpZXdNZXNzYWdlcy5JUGVyZm9ybWFuY2VNZXNzYWdlPignbm90ZWJvb2tQZXJmb3JtYW5jZU1lc3NhZ2UnLCB7XG5cdFx0XHRcdFx0XHRjZWxsSWQ6IGRhdGEuY2VsbElkLFxuXHRcdFx0XHRcdFx0ZXhlY3V0aW9uSWQ6IGRhdGEuZXhlY3V0aW9uSWQsXG5cdFx0XHRcdFx0XHRkdXJhdGlvbjogRGF0ZS5ub3coKSAtIHN0YXJ0VGltZSxcblx0XHRcdFx0XHRcdHJlbmRlcmVySWQ6IGRhdGEucmVuZGVyZXJJZCxcblx0XHRcdFx0XHRcdG91dHB1dFNpemVcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHB1YmxpYyBjbGVhck91dHB1dChvdXRwdXRJZDogc3RyaW5nLCByZW5kZXJlcklkOiBzdHJpbmcgfCB1bmRlZmluZWQpIHtcblx0XHRcdGNvbnN0IG91dHB1dCA9IHRoaXMub3V0cHV0RWxlbWVudHMuZ2V0KG91dHB1dElkKTtcblx0XHRcdG91dHB1dD8uY2xlYXIocmVuZGVyZXJJZCk7XG5cdFx0XHRvdXRwdXQ/LmRpc3Bvc2UoKTtcblx0XHRcdHRoaXMub3V0cHV0RWxlbWVudHMuZGVsZXRlKG91dHB1dElkKTtcblx0XHR9XG5cblx0XHRwdWJsaWMgc2hvdyhvdXRwdXRJZDogc3RyaW5nLCB0b3A6IG51bWJlcikge1xuXHRcdFx0Y29uc3Qgb3V0cHV0Q29udGFpbmVyID0gdGhpcy5vdXRwdXRFbGVtZW50cy5nZXQob3V0cHV0SWQpO1xuXHRcdFx0aWYgKCFvdXRwdXRDb250YWluZXIpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLmVsZW1lbnQuc3R5bGUudmlzaWJpbGl0eSA9ICcnO1xuXHRcdFx0dGhpcy5lbGVtZW50LnN0eWxlLnRvcCA9IGAke3RvcH1weGA7XG5cdFx0fVxuXG5cdFx0cHVibGljIGhpZGUoKSB7XG5cdFx0XHR0aGlzLmVsZW1lbnQuc3R5bGUudmlzaWJpbGl0eSA9ICdoaWRkZW4nO1xuXHRcdH1cblxuXHRcdHB1YmxpYyB1cGRhdGVDb250ZW50QW5kUmVyZW5kZXIob3V0cHV0SWQ6IHN0cmluZywgY29udGVudDogd2Vidmlld01lc3NhZ2VzLklDcmVhdGlvbkNvbnRlbnQpIHtcblx0XHRcdHRoaXMub3V0cHV0RWxlbWVudHMuZ2V0KG91dHB1dElkKT8udXBkYXRlQ29udGVudEFuZFJlbmRlcihjb250ZW50KTtcblx0XHR9XG5cblx0XHRwdWJsaWMgdXBkYXRlT3V0cHV0SGVpZ2h0KG91dHB1dElkOiBzdHJpbmcsIGhlaWdodDogbnVtYmVyKSB7XG5cdFx0XHR0aGlzLm91dHB1dEVsZW1lbnRzLmdldChvdXRwdXRJZCk/LnVwZGF0ZUhlaWdodChoZWlnaHQpO1xuXHRcdH1cblxuXHRcdHB1YmxpYyB1cGRhdGVTY3JvbGwocmVxdWVzdDogd2Vidmlld01lc3NhZ2VzLklDb250ZW50V2lkZ2V0VG9wUmVxdWVzdCkge1xuXHRcdFx0dGhpcy5lbGVtZW50LnN0eWxlLnRvcCA9IGAke3JlcXVlc3QuY2VsbFRvcH1weGA7XG5cblx0XHRcdGNvbnN0IG91dHB1dEVsZW1lbnQgPSB0aGlzLm91dHB1dEVsZW1lbnRzLmdldChyZXF1ZXN0Lm91dHB1dElkKTtcblx0XHRcdGlmIChvdXRwdXRFbGVtZW50KSB7XG5cdFx0XHRcdG91dHB1dEVsZW1lbnQudXBkYXRlU2Nyb2xsKHJlcXVlc3Qub3V0cHV0T2Zmc2V0KTtcblxuXHRcdFx0XHRpZiAocmVxdWVzdC5mb3JjZURpc3BsYXkgJiYgb3V0cHV0RWxlbWVudC5vdXRwdXROb2RlKSB7XG5cdFx0XHRcdFx0Ly8gVE9ETyBAcmVib3JuaXggQG1qYnZ6LCB0aGVyZSBpcyBhIG1pc2FsaWdubWVudCBoZXJlLlxuXHRcdFx0XHRcdC8vIFdlIHNldCBvdXRwdXQgdmlzaWJpbGl0eSBvbiBjZWxsIGNvbnRhaW5lciwgb3RoZXIgdGhhbiBvdXRwdXQgY29udGFpbmVyIG9yIG91dHB1dCBub2RlIGl0c2VsZi5cblx0XHRcdFx0XHRvdXRwdXRFbGVtZW50Lm91dHB1dE5vZGUuZWxlbWVudC5zdHlsZS52aXNpYmlsaXR5ID0gJyc7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKHJlcXVlc3QuZm9yY2VEaXNwbGF5KSB7XG5cdFx0XHRcdHRoaXMuZWxlbWVudC5zdHlsZS52aXNpYmlsaXR5ID0gJyc7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0Y2xhc3MgT3V0cHV0Q29udGFpbmVyIHtcblxuXHRcdHB1YmxpYyByZWFkb25seSBlbGVtZW50OiBIVE1MRWxlbWVudDtcblxuXHRcdHByaXZhdGUgX291dHB1dE5vZGU/OiBPdXRwdXRFbGVtZW50O1xuXG5cdFx0Z2V0IG91dHB1dE5vZGUoKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fb3V0cHV0Tm9kZTtcblx0XHR9XG5cblx0XHRjb25zdHJ1Y3Rvcihcblx0XHRcdHByaXZhdGUgcmVhZG9ubHkgb3V0cHV0SWQ6IHN0cmluZyxcblx0XHQpIHtcblx0XHRcdHRoaXMuZWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdFx0dGhpcy5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ291dHB1dF9jb250YWluZXInKTtcblx0XHRcdHRoaXMuZWxlbWVudC5zZXRBdHRyaWJ1dGUoJ2RhdGEtdnNjb2RlLWNvbnRleHQnLCBKU09OLnN0cmluZ2lmeSh7ICdwcmV2ZW50RGVmYXVsdENvbnRleHRNZW51SXRlbXMnOiB0cnVlIH0pKTtcblx0XHRcdHRoaXMuZWxlbWVudC5zdHlsZS5wb3NpdGlvbiA9ICdhYnNvbHV0ZSc7XG5cdFx0XHR0aGlzLmVsZW1lbnQuc3R5bGUub3ZlcmZsb3cgPSAnaGlkZGVuJztcblx0XHR9XG5cblx0XHRwdWJsaWMgZGlzcG9zZSgpIHtcblx0XHRcdHRoaXMuX291dHB1dE5vZGU/LmRpc3Bvc2UoKTtcblx0XHR9XG5cblx0XHRwdWJsaWMgY2xlYXIocmVuZGVyZXJJZDogc3RyaW5nIHwgdW5kZWZpbmVkKSB7XG5cdFx0XHRpZiAocmVuZGVyZXJJZCkge1xuXHRcdFx0XHRyZW5kZXJlcnMuY2xlYXJPdXRwdXQocmVuZGVyZXJJZCwgdGhpcy5vdXRwdXRJZCk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmVsZW1lbnQucmVtb3ZlKCk7XG5cdFx0fVxuXG5cdFx0cHVibGljIHVwZGF0ZUhlaWdodChoZWlnaHQ6IG51bWJlcikge1xuXHRcdFx0dGhpcy5lbGVtZW50LnN0eWxlLm1heEhlaWdodCA9IGAke2hlaWdodH1weGA7XG5cdFx0XHR0aGlzLmVsZW1lbnQuc3R5bGUuaGVpZ2h0ID0gYCR7aGVpZ2h0fXB4YDtcblx0XHR9XG5cblx0XHRwdWJsaWMgdXBkYXRlU2Nyb2xsKG91dHB1dE9mZnNldDogbnVtYmVyKSB7XG5cdFx0XHR0aGlzLmVsZW1lbnQuc3R5bGUudG9wID0gYCR7b3V0cHV0T2Zmc2V0fXB4YDtcblx0XHR9XG5cblx0XHRwdWJsaWMgY3JlYXRlT3V0cHV0RWxlbWVudChvdXRwdXRJZDogc3RyaW5nLCBvdXRwdXRPZmZzZXQ6IG51bWJlciwgbGVmdDogbnVtYmVyLCBjZWxsSWQ6IHN0cmluZyk6IE91dHB1dEVsZW1lbnQge1xuXHRcdFx0dGhpcy5lbGVtZW50LmlubmVyVGV4dCA9ICcnO1xuXHRcdFx0dGhpcy5lbGVtZW50LnN0eWxlLm1heEhlaWdodCA9ICcwcHgnO1xuXHRcdFx0dGhpcy5lbGVtZW50LnN0eWxlLnRvcCA9IGAke291dHB1dE9mZnNldH1weGA7XG5cblx0XHRcdHRoaXMuX291dHB1dE5vZGU/LmRpc3Bvc2UoKTtcblx0XHRcdHRoaXMuX291dHB1dE5vZGUgPSBuZXcgT3V0cHV0RWxlbWVudChvdXRwdXRJZCwgbGVmdCwgY2VsbElkKTtcblx0XHRcdHRoaXMuZWxlbWVudC5hcHBlbmRDaGlsZCh0aGlzLl9vdXRwdXROb2RlLmVsZW1lbnQpO1xuXHRcdFx0cmV0dXJuIHRoaXMuX291dHB1dE5vZGU7XG5cdFx0fVxuXG5cdFx0cHVibGljIHVwZGF0ZUNvbnRlbnRBbmRSZW5kZXIoY29udGVudDogd2Vidmlld01lc3NhZ2VzLklDcmVhdGlvbkNvbnRlbnQpIHtcblx0XHRcdHRoaXMuX291dHB1dE5vZGU/LnVwZGF0ZUFuZFJlcmVuZGVyKGNvbnRlbnQpO1xuXHRcdH1cblx0fVxuXG5cdHZzY29kZS5wb3N0TWVzc2FnZSh7XG5cdFx0X192c2NvZGVfbm90ZWJvb2tfbWVzc2FnZTogdHJ1ZSxcblx0XHR0eXBlOiAnaW5pdGlhbGl6ZWQnXG5cdH0pO1xuXG5cdGZvciAoY29uc3QgcHJlbG9hZCBvZiBjdHguc3RhdGljUHJlbG9hZHNEYXRhKSB7XG5cdFx0a2VybmVsUHJlbG9hZHMubG9hZChwcmVsb2FkLmVudHJ5cG9pbnQpO1xuXHR9XG5cblx0ZnVuY3Rpb24gcG9zdE5vdGVib29rTWVzc2FnZTxUIGV4dGVuZHMgd2Vidmlld01lc3NhZ2VzLkZyb21XZWJ2aWV3TWVzc2FnZT4oXG5cdFx0dHlwZTogVFsndHlwZSddLFxuXHRcdHByb3BlcnRpZXM6IE9taXQ8VCwgJ19fdnNjb2RlX25vdGVib29rX21lc3NhZ2UnIHwgJ3R5cGUnPlxuXHQpIHtcblx0XHR2c2NvZGUucG9zdE1lc3NhZ2Uoe1xuXHRcdFx0X192c2NvZGVfbm90ZWJvb2tfbWVzc2FnZTogdHJ1ZSxcblx0XHRcdHR5cGUsXG5cdFx0XHQuLi5wcm9wZXJ0aWVzXG5cdFx0fSk7XG5cdH1cblxuXHRjbGFzcyBPdXRwdXRFbGVtZW50IHtcblx0XHRwdWJsaWMgcmVhZG9ubHkgZWxlbWVudDogSFRNTEVsZW1lbnQ7XG5cdFx0cHJpdmF0ZSBfY29udGVudD86IHtcblx0XHRcdHJlYWRvbmx5IHByZWZlcnJlZFJlbmRlcmVySWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRcdHJlYWRvbmx5IHByZWxvYWRFcnJvcnM6IFJlYWRvbmx5QXJyYXk8RXJyb3IgfCB1bmRlZmluZWQ+O1xuXHRcdH07XG5cdFx0cHJpdmF0ZSBoYXNSZXNpemVPYnNlcnZlciA9IGZhbHNlO1xuXG5cdFx0cHJpdmF0ZSByZW5kZXJUYXNrQWJvcnQ/OiBBYm9ydENvbnRyb2xsZXI7XG5cdFx0cHJpdmF0ZSBpc0ltYWdlT3V0cHV0ID0gZmFsc2U7XG5cblx0XHRjb25zdHJ1Y3Rvcihcblx0XHRcdHByaXZhdGUgcmVhZG9ubHkgb3V0cHV0SWQ6IHN0cmluZyxcblx0XHRcdGxlZnQ6IG51bWJlcixcblx0XHRcdHB1YmxpYyByZWFkb25seSBjZWxsSWQ6IHN0cmluZ1xuXHRcdCkge1xuXHRcdFx0dGhpcy5lbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0XHR0aGlzLmVsZW1lbnQuaWQgPSBvdXRwdXRJZDtcblx0XHRcdHRoaXMuZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdvdXRwdXQnKTtcblx0XHRcdHRoaXMuZWxlbWVudC5zdHlsZS5wb3NpdGlvbiA9ICdhYnNvbHV0ZSc7XG5cdFx0XHR0aGlzLmVsZW1lbnQuc3R5bGUudG9wID0gYDBweGA7XG5cdFx0XHR0aGlzLmVsZW1lbnQuc3R5bGUubGVmdCA9IGxlZnQgKyAncHgnO1xuXHRcdFx0dGhpcy5lbGVtZW50LnN0eWxlLnBhZGRpbmcgPSBgJHtjdHguc3R5bGUub3V0cHV0Tm9kZVBhZGRpbmd9cHggJHtjdHguc3R5bGUub3V0cHV0Tm9kZVBhZGRpbmd9cHggJHtjdHguc3R5bGUub3V0cHV0Tm9kZVBhZGRpbmd9cHggJHtjdHguc3R5bGUub3V0cHV0Tm9kZUxlZnRQYWRkaW5nfWA7XG5cblx0XHRcdHRoaXMuZWxlbWVudC5hZGRFdmVudExpc3RlbmVyKCdtb3VzZWVudGVyJywgKCkgPT4ge1xuXHRcdFx0XHRwb3N0Tm90ZWJvb2tNZXNzYWdlPHdlYnZpZXdNZXNzYWdlcy5JTW91c2VFbnRlck1lc3NhZ2U+KCdtb3VzZWVudGVyJywgeyBpZDogb3V0cHV0SWQgfSk7XG5cdFx0XHR9KTtcblx0XHRcdHRoaXMuZWxlbWVudC5hZGRFdmVudExpc3RlbmVyKCdtb3VzZWxlYXZlJywgKCkgPT4ge1xuXHRcdFx0XHRwb3N0Tm90ZWJvb2tNZXNzYWdlPHdlYnZpZXdNZXNzYWdlcy5JTW91c2VMZWF2ZU1lc3NhZ2U+KCdtb3VzZWxlYXZlJywgeyBpZDogb3V0cHV0SWQgfSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gQWRkIGRyYWcgaGFuZGxlclxuXHRcdFx0dGhpcy5lbGVtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2RyYWdzdGFydCcsIChlOiBEcmFnRXZlbnQpID0+IHtcblx0XHRcdFx0aWYgKCFlLmRhdGFUcmFuc2Zlcikge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IG91dHB1dERhdGE6IE5vdGVib29rQ2VsbE91dHB1dFRyYW5zZmVyRGF0YSA9IHtcblx0XHRcdFx0XHRvdXRwdXRJZDogdGhpcy5vdXRwdXRJZCxcblx0XHRcdFx0fTtcblxuXHRcdFx0XHRlLmRhdGFUcmFuc2Zlci5zZXREYXRhKCdub3RlYm9vay1jZWxsLW91dHB1dCcsIEpTT04uc3RyaW5naWZ5KG91dHB1dERhdGEpKTtcblx0XHRcdH0pO1xuXG5cdFx0XHQvLyBBZGQgYWx0IGtleSBoYW5kbGVyc1xuXHRcdFx0d2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCAoZSkgPT4ge1xuXHRcdFx0XHRpZiAoZS5hbHRLZXkpIHtcblx0XHRcdFx0XHR0aGlzLmVsZW1lbnQuZHJhZ2dhYmxlID0gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cblx0XHRcdHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdrZXl1cCcsIChlKSA9PiB7XG5cdFx0XHRcdGlmICghZS5hbHRLZXkpIHtcblx0XHRcdFx0XHR0aGlzLmVsZW1lbnQuZHJhZ2dhYmxlID0gdGhpcy5pc0ltYWdlT3V0cHV0O1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gSGFuZGxlIHdpbmRvdyBibHVyIHRvIHJlc2V0IGRyYWdnYWJsZSBzdGF0ZVxuXHRcdFx0d2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ2JsdXInLCAoKSA9PiB7XG5cdFx0XHRcdHRoaXMuZWxlbWVudC5kcmFnZ2FibGUgPSB0aGlzLmlzSW1hZ2VPdXRwdXQ7XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRwdWJsaWMgZGlzcG9zZSgpIHtcblx0XHRcdHRoaXMucmVuZGVyVGFza0Fib3J0Py5hYm9ydCgpO1xuXHRcdFx0dGhpcy5yZW5kZXJUYXNrQWJvcnQgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0cHVibGljIGFzeW5jIHJlbmRlcihjb250ZW50OiB3ZWJ2aWV3TWVzc2FnZXMuSUNyZWF0aW9uQ29udGVudCwgcHJlZmVycmVkUmVuZGVyZXJJZDogc3RyaW5nIHwgdW5kZWZpbmVkLCBwcmVsb2FkRXJyb3JzOiBSZWFkb25seUFycmF5PEVycm9yIHwgdW5kZWZpbmVkPiwgc2lnbmFsPzogQWJvcnRTaWduYWwpIHtcblx0XHRcdHRoaXMucmVuZGVyVGFza0Fib3J0Py5hYm9ydCgpO1xuXHRcdFx0dGhpcy5yZW5kZXJUYXNrQWJvcnQgPSB1bmRlZmluZWQ7XG5cblx0XHRcdHRoaXMuX2NvbnRlbnQgPSB7IHByZWZlcnJlZFJlbmRlcmVySWQsIHByZWxvYWRFcnJvcnMgfTtcblx0XHRcdGlmIChjb250ZW50LnR5cGUgPT09IDAgLyogUmVuZGVyT3V0cHV0VHlwZS5IdG1sICovKSB7XG5cdFx0XHRcdGNvbnN0IHRydXN0ZWRIdG1sID0gdHRQb2xpY3k/LmNyZWF0ZUhUTUwoY29udGVudC5odG1sQ29udGVudCkgPz8gY29udGVudC5odG1sQ29udGVudDtcblx0XHRcdFx0dGhpcy5lbGVtZW50LmlubmVySFRNTCA9IHRydXN0ZWRIdG1sIGFzIHN0cmluZzsgIC8vIENvZGVRTCBbU00wMzcxMl0gVGhlIGNvbnRlbnQgY29tZXMgZnJvbSByZW5kZXJlciBleHRlbnNpb25zLCBub3QgZnJvbSBkaXJlY3QgdXNlciBpbnB1dC5cblx0XHRcdH0gZWxzZSBpZiAocHJlbG9hZEVycm9ycy5zb21lKGUgPT4gZSBpbnN0YW5jZW9mIEVycm9yKSkge1xuXHRcdFx0XHRjb25zdCBlcnJvcnMgPSBwcmVsb2FkRXJyb3JzLmZpbHRlcigoZSk6IGUgaXMgRXJyb3IgPT4gZSBpbnN0YW5jZW9mIEVycm9yKTtcblx0XHRcdFx0c2hvd1JlbmRlckVycm9yKGBFcnJvciBsb2FkaW5nIHByZWxvYWRzYCwgdGhpcy5lbGVtZW50LCBlcnJvcnMpO1xuXHRcdFx0fSBlbHNlIHtcblxuXHRcdFx0XHRjb25zdCBpbWFnZU1pbWVUeXBlcyA9IFsnaW1hZ2UvcG5nJywgJ2ltYWdlL2pwZWcnLCAnaW1hZ2Uvc3ZnJ107XG5cdFx0XHRcdHRoaXMuaXNJbWFnZU91dHB1dCA9IGltYWdlTWltZVR5cGVzLmluY2x1ZGVzKGNvbnRlbnQub3V0cHV0Lm1pbWUpO1xuXHRcdFx0XHR0aGlzLmVsZW1lbnQuZHJhZ2dhYmxlID0gdGhpcy5pc0ltYWdlT3V0cHV0O1xuXG5cdFx0XHRcdGNvbnN0IGl0ZW0gPSBjcmVhdGVPdXRwdXRJdGVtKHRoaXMub3V0cHV0SWQsIGNvbnRlbnQub3V0cHV0Lm1pbWUsIGNvbnRlbnQubWV0YWRhdGEsIGNvbnRlbnQub3V0cHV0LnZhbHVlQnl0ZXMsIGNvbnRlbnQuYWxsT3V0cHV0cywgY29udGVudC5vdXRwdXQuYXBwZW5kZWQpO1xuXG5cdFx0XHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBuZXcgQWJvcnRDb250cm9sbGVyKCk7XG5cdFx0XHRcdHRoaXMucmVuZGVyVGFza0Fib3J0ID0gY29udHJvbGxlcjtcblxuXHRcdFx0XHQvLyBBYm9ydCByZW5kZXJpbmcgaWYgY2FsbGVyIGFib3J0c1xuXHRcdFx0XHRzaWduYWw/LmFkZEV2ZW50TGlzdGVuZXIoJ2Fib3J0JywgKCkgPT4gY29udHJvbGxlci5hYm9ydCgpKTtcblxuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGF3YWl0IHJlbmRlcmVycy5yZW5kZXIoaXRlbSwgcHJlZmVycmVkUmVuZGVyZXJJZCwgdGhpcy5lbGVtZW50LCBjb250cm9sbGVyLnNpZ25hbCk7XG5cdFx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdFx0aWYgKHRoaXMucmVuZGVyVGFza0Fib3J0ID09PSBjb250cm9sbGVyKSB7XG5cdFx0XHRcdFx0XHR0aGlzLnJlbmRlclRhc2tBYm9ydCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKCF0aGlzLmhhc1Jlc2l6ZU9ic2VydmVyKSB7XG5cdFx0XHRcdHRoaXMuaGFzUmVzaXplT2JzZXJ2ZXIgPSB0cnVlO1xuXHRcdFx0XHRyZXNpemVPYnNlcnZlci5vYnNlcnZlKHRoaXMuZWxlbWVudCwgdGhpcy5vdXRwdXRJZCwgdHJ1ZSwgdGhpcy5jZWxsSWQpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBvZmZzZXRIZWlnaHQgPSB0aGlzLmVsZW1lbnQub2Zmc2V0SGVpZ2h0O1xuXHRcdFx0Y29uc3QgY3BzID0gZG9jdW1lbnQuZGVmYXVsdFZpZXchLmdldENvbXB1dGVkU3R5bGUodGhpcy5lbGVtZW50KTtcblx0XHRcdGNvbnN0IHZlcnRpY2FsUGFkZGluZyA9IHBhcnNlRmxvYXQoY3BzLnBhZGRpbmdUb3ApICsgcGFyc2VGbG9hdChjcHMucGFkZGluZ0JvdHRvbSk7XG5cdFx0XHRjb25zdCBjb250ZW50SGVpZ2h0ID0gb2Zmc2V0SGVpZ2h0IC0gdmVydGljYWxQYWRkaW5nO1xuXHRcdFx0aWYgKGVsZW1lbnRIYXNDb250ZW50KGNvbnRlbnRIZWlnaHQpICYmIGNwcy5wYWRkaW5nID09PSAnMHB4Jykge1xuXHRcdFx0XHQvLyB3ZSBzZXQgcGFkZGluZyB0byB6ZXJvIGlmIHRoZSBvdXRwdXQgaGFzIG5vIGNvbnRlbnQgKHRoZW4gd2UgY2FuIGhhdmUgYSB6ZXJvLWhlaWdodCBvdXRwdXQgRE9NIG5vZGUpXG5cdFx0XHRcdC8vIHRodXMgd2UgbmVlZCB0byBlbnN1cmUgdGhlIHBhZGRpbmcgaXMgYWNjb3VudGVkIHdoZW4gdXBkYXRpbmcgdGhlIGluaXQgaGVpZ2h0IG9mIHRoZSBvdXRwdXRcblx0XHRcdFx0ZGltZW5zaW9uVXBkYXRlci51cGRhdGVIZWlnaHQodGhpcy5vdXRwdXRJZCwgb2Zmc2V0SGVpZ2h0ICsgY3R4LnN0eWxlLm91dHB1dE5vZGVQYWRkaW5nICogMiwge1xuXHRcdFx0XHRcdGlzT3V0cHV0OiB0cnVlLFxuXHRcdFx0XHRcdGluaXQ6IHRydWVcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0dGhpcy5lbGVtZW50LnN0eWxlLnBhZGRpbmcgPSBgJHtjdHguc3R5bGUub3V0cHV0Tm9kZVBhZGRpbmd9cHggJHtjdHguc3R5bGUub3V0cHV0Tm9kZVBhZGRpbmd9cHggJHtjdHguc3R5bGUub3V0cHV0Tm9kZVBhZGRpbmd9cHggJHtjdHguc3R5bGUub3V0cHV0Tm9kZUxlZnRQYWRkaW5nfWA7XG5cdFx0XHR9IGVsc2UgaWYgKGVsZW1lbnRIYXNDb250ZW50KGNvbnRlbnRIZWlnaHQpKSB7XG5cdFx0XHRcdGRpbWVuc2lvblVwZGF0ZXIudXBkYXRlSGVpZ2h0KHRoaXMub3V0cHV0SWQsIHRoaXMuZWxlbWVudC5vZmZzZXRIZWlnaHQsIHtcblx0XHRcdFx0XHRpc091dHB1dDogdHJ1ZSxcblx0XHRcdFx0XHRpbml0OiB0cnVlXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHR0aGlzLmVsZW1lbnQuc3R5bGUucGFkZGluZyA9IGAwICR7Y3R4LnN0eWxlLm91dHB1dE5vZGVQYWRkaW5nfXB4IDAgJHtjdHguc3R5bGUub3V0cHV0Tm9kZUxlZnRQYWRkaW5nfWA7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyB3ZSBoYXZlIGEgemVyby1oZWlnaHQgb3V0cHV0IERPTSBub2RlXG5cdFx0XHRcdGRpbWVuc2lvblVwZGF0ZXIudXBkYXRlSGVpZ2h0KHRoaXMub3V0cHV0SWQsIDAsIHtcblx0XHRcdFx0XHRpc091dHB1dDogdHJ1ZSxcblx0XHRcdFx0XHRpbml0OiB0cnVlLFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgcm9vdCA9IHRoaXMuZWxlbWVudC5zaGFkb3dSb290ID8/IHRoaXMuZWxlbWVudDtcblx0XHRcdGNvbnN0IGNvZGVCbG9ja3M6IEFycmF5PHsgdmFsdWU6IHN0cmluZzsgbGFuZzogc3RyaW5nOyBpZDogc3RyaW5nIH0+ID0gTWFya2Rvd25Db2RlQmxvY2sucmVxdWVzdEhpZ2hsaWdodENvZGVCbG9jayhyb290KTtcblxuXHRcdFx0aWYgKGNvZGVCbG9ja3MubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRwb3N0Tm90ZWJvb2tNZXNzYWdlPHdlYnZpZXdNZXNzYWdlcy5JUmVuZGVyZWRDZWxsT3V0cHV0TWVzc2FnZT4oJ3JlbmRlcmVkQ2VsbE91dHB1dCcsIHtcblx0XHRcdFx0XHRjb2RlQmxvY2tzXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHB1YmxpYyB1cGRhdGVBbmRSZXJlbmRlcihjb250ZW50OiB3ZWJ2aWV3TWVzc2FnZXMuSUNyZWF0aW9uQ29udGVudCkge1xuXHRcdFx0aWYgKHRoaXMuX2NvbnRlbnQpIHtcblx0XHRcdFx0dGhpcy5yZW5kZXIoY29udGVudCwgdGhpcy5fY29udGVudC5wcmVmZXJyZWRSZW5kZXJlcklkLCB0aGlzLl9jb250ZW50LnByZWxvYWRFcnJvcnMpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGNvbnN0IG1hcmt1cENlbGxEcmFnTWFuYWdlciA9IG5ldyBjbGFzcyBNYXJrdXBDZWxsRHJhZ01hbmFnZXIge1xuXG5cdFx0cHJpdmF0ZSBjdXJyZW50RHJhZzogeyBjZWxsSWQ6IHN0cmluZzsgY2xpZW50WTogbnVtYmVyIH0gfCB1bmRlZmluZWQ7XG5cblx0XHQvLyBUcmFuc3BhcmVudCBvdmVybGF5IHRoYXQgcHJldmVudHMgZWxlbWVudHMgZnJvbSBpbnNpZGUgdGhlIHdlYnZpZXcgZnJvbSBlYXRpbmdcblx0XHQvLyBkcmFnIGV2ZW50cy5cblx0XHRwcml2YXRlIGRyYWdPdmVybGF5PzogSFRNTEVsZW1lbnQ7XG5cblx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdHdpbmRvdy5kb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdkcmFnb3ZlcicsIGUgPT4ge1xuXHRcdFx0XHQvLyBBbGxvdyBkcm9wcGluZyBkcmFnZ2VkIG1hcmt1cCBjZWxsc1xuXHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHR9KTtcblxuXHRcdFx0d2luZG93LmRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2Ryb3AnLCBlID0+IHtcblx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXG5cdFx0XHRcdGNvbnN0IGRyYWcgPSB0aGlzLmN1cnJlbnREcmFnO1xuXHRcdFx0XHRpZiAoIWRyYWcpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0aGlzLmN1cnJlbnREcmFnID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRwb3N0Tm90ZWJvb2tNZXNzYWdlPHdlYnZpZXdNZXNzYWdlcy5JQ2VsbERyb3BNZXNzYWdlPignY2VsbC1kcm9wJywge1xuXHRcdFx0XHRcdGNlbGxJZDogZHJhZy5jZWxsSWQsXG5cdFx0XHRcdFx0Y3RybEtleTogZS5jdHJsS2V5LFxuXHRcdFx0XHRcdGFsdEtleTogZS5hbHRLZXksXG5cdFx0XHRcdFx0ZHJhZ09mZnNldFk6IGUuY2xpZW50WSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRzdGFydERyYWcoZTogRHJhZ0V2ZW50LCBjZWxsSWQ6IHN0cmluZykge1xuXHRcdFx0aWYgKCFlLmRhdGFUcmFuc2Zlcikge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGlmICghY3VycmVudE9wdGlvbnMuZHJhZ0FuZERyb3BFbmFibGVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5jdXJyZW50RHJhZyA9IHsgY2VsbElkLCBjbGllbnRZOiBlLmNsaWVudFkgfTtcblxuXHRcdFx0Y29uc3Qgb3ZlcmxheVpJbmRleCA9IDk5OTk7XG5cdFx0XHRpZiAoIXRoaXMuZHJhZ092ZXJsYXkpIHtcblx0XHRcdFx0dGhpcy5kcmFnT3ZlcmxheSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdFx0XHR0aGlzLmRyYWdPdmVybGF5LnN0eWxlLnBvc2l0aW9uID0gJ2Fic29sdXRlJztcblx0XHRcdFx0dGhpcy5kcmFnT3ZlcmxheS5zdHlsZS50b3AgPSAnMCc7XG5cdFx0XHRcdHRoaXMuZHJhZ092ZXJsYXkuc3R5bGUubGVmdCA9ICcwJztcblx0XHRcdFx0dGhpcy5kcmFnT3ZlcmxheS5zdHlsZS56SW5kZXggPSBgJHtvdmVybGF5WkluZGV4fWA7XG5cdFx0XHRcdHRoaXMuZHJhZ092ZXJsYXkuc3R5bGUud2lkdGggPSAnMTAwJSc7XG5cdFx0XHRcdHRoaXMuZHJhZ092ZXJsYXkuc3R5bGUuaGVpZ2h0ID0gJzEwMCUnO1xuXHRcdFx0XHR0aGlzLmRyYWdPdmVybGF5LnN0eWxlLmJhY2tncm91bmQgPSAndHJhbnNwYXJlbnQnO1xuXHRcdFx0XHR3aW5kb3cuZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZCh0aGlzLmRyYWdPdmVybGF5KTtcblx0XHRcdH1cblx0XHRcdChlLnRhcmdldCBhcyBIVE1MRWxlbWVudCkuc3R5bGUuekluZGV4ID0gYCR7b3ZlcmxheVpJbmRleCArIDF9YDtcblx0XHRcdChlLnRhcmdldCBhcyBIVE1MRWxlbWVudCkuY2xhc3NMaXN0LmFkZCgnZHJhZ2dpbmcnKTtcblxuXHRcdFx0cG9zdE5vdGVib29rTWVzc2FnZTx3ZWJ2aWV3TWVzc2FnZXMuSUNlbGxEcmFnU3RhcnRNZXNzYWdlPignY2VsbC1kcmFnLXN0YXJ0Jywge1xuXHRcdFx0XHRjZWxsSWQ6IGNlbGxJZCxcblx0XHRcdFx0ZHJhZ09mZnNldFk6IGUuY2xpZW50WSxcblx0XHRcdH0pO1xuXG5cdFx0XHQvLyBDb250aW51b3VzbHkgc2VuZCB1cGRhdGVzIHdoaWxlIGRyYWdnaW5nIGluc3RlYWQgb2YgcmVseWluZyBvbiBgdXBkYXRlRHJhZ2AuXG5cdFx0XHQvLyBUaGlzIGxldHMgdXMgc2Nyb2xsIHRoZSBsaXN0IGJhc2VkIG9uIGRyYWcgcG9zaXRpb24uXG5cdFx0XHRjb25zdCB0cnlTZW5kRHJhZ1VwZGF0ZSA9ICgpID0+IHtcblx0XHRcdFx0aWYgKHRoaXMuY3VycmVudERyYWc/LmNlbGxJZCAhPT0gY2VsbElkKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cG9zdE5vdGVib29rTWVzc2FnZTx3ZWJ2aWV3TWVzc2FnZXMuSUNlbGxEcmFnTWVzc2FnZT4oJ2NlbGwtZHJhZycsIHtcblx0XHRcdFx0XHRjZWxsSWQ6IGNlbGxJZCxcblx0XHRcdFx0XHRkcmFnT2Zmc2V0WTogdGhpcy5jdXJyZW50RHJhZy5jbGllbnRZLFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0d2luZG93LnJlcXVlc3RBbmltYXRpb25GcmFtZSh0cnlTZW5kRHJhZ1VwZGF0ZSk7XG5cdFx0XHR9O1xuXHRcdFx0d2luZG93LnJlcXVlc3RBbmltYXRpb25GcmFtZSh0cnlTZW5kRHJhZ1VwZGF0ZSk7XG5cdFx0fVxuXG5cdFx0dXBkYXRlRHJhZyhlOiBEcmFnRXZlbnQsIGNlbGxJZDogc3RyaW5nKSB7XG5cdFx0XHRpZiAoY2VsbElkICE9PSB0aGlzLmN1cnJlbnREcmFnPy5jZWxsSWQpIHtcblx0XHRcdFx0dGhpcy5jdXJyZW50RHJhZyA9IHVuZGVmaW5lZDtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuY3VycmVudERyYWcgPSB7IGNlbGxJZCwgY2xpZW50WTogZS5jbGllbnRZIH07XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0ZW5kRHJhZyhlOiBEcmFnRXZlbnQsIGNlbGxJZDogc3RyaW5nKSB7XG5cdFx0XHR0aGlzLmN1cnJlbnREcmFnID0gdW5kZWZpbmVkO1xuXHRcdFx0KGUudGFyZ2V0IGFzIEhUTUxFbGVtZW50KS5jbGFzc0xpc3QucmVtb3ZlKCdkcmFnZ2luZycpO1xuXHRcdFx0cG9zdE5vdGVib29rTWVzc2FnZTx3ZWJ2aWV3TWVzc2FnZXMuSUNlbGxEcmFnRW5kTWVzc2FnZT4oJ2NlbGwtZHJhZy1lbmQnLCB7XG5cdFx0XHRcdGNlbGxJZDogY2VsbElkXG5cdFx0XHR9KTtcblxuXHRcdFx0aWYgKHRoaXMuZHJhZ092ZXJsYXkpIHtcblx0XHRcdFx0dGhpcy5kcmFnT3ZlcmxheS5yZW1vdmUoKTtcblx0XHRcdFx0dGhpcy5kcmFnT3ZlcmxheSA9IHVuZGVmaW5lZDtcblx0XHRcdH1cblxuXHRcdFx0KGUudGFyZ2V0IGFzIEhUTUxFbGVtZW50KS5zdHlsZS56SW5kZXggPSAnJztcblx0XHR9XG5cdH0oKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHByZWxvYWRzU2NyaXB0U3RyKHN0eWxlVmFsdWVzOiBQcmVsb2FkU3R5bGVzLCBvcHRpb25zOiBQcmVsb2FkT3B0aW9ucywgcmVuZGVyT3B0aW9uczogUmVuZGVyT3B0aW9ucywgcmVuZGVyZXJzOiByZWFkb25seSB3ZWJ2aWV3TWVzc2FnZXMuUmVuZGVyZXJNZXRhZGF0YVtdLCBwcmVsb2FkczogcmVhZG9ubHkgd2Vidmlld01lc3NhZ2VzLlN0YXRpY1ByZWxvYWRNZXRhZGF0YVtdLCBpc1dvcmtzcGFjZVRydXN0ZWQ6IGJvb2xlYW4sIG5vbmNlOiBzdHJpbmcpIHtcblx0Y29uc3QgY3R4OiBQcmVsb2FkQ29udGV4dCA9IHtcblx0XHRzdHlsZTogc3R5bGVWYWx1ZXMsXG5cdFx0b3B0aW9ucyxcblx0XHRyZW5kZXJPcHRpb25zLFxuXHRcdHJlbmRlcmVyRGF0YTogcmVuZGVyZXJzLFxuXHRcdHN0YXRpY1ByZWxvYWRzRGF0YTogcHJlbG9hZHMsXG5cdFx0aXNXb3Jrc3BhY2VUcnVzdGVkLFxuXHRcdG5vbmNlLFxuXHR9O1xuXHQvLyBUUyB3aWxsIHRyeSBjb21waWxpbmcgYGltcG9ydCgpYCBpbiB3ZWJ2aWV3UHJlbG9hZHMsIHNvIHVzZSBhIGhlbHBlciBmdW5jdGlvbiBpbnN0ZWFkXG5cdC8vIG9mIHVzaW5nIGBpbXBvcnQoLi4uKWAgZGlyZWN0bHlcblx0cmV0dXJuIGBcblx0XHRjb25zdCBfX2ltcG9ydCA9ICh4KSA9PiBpbXBvcnQoeCk7XG5cdFx0KCR7d2Vidmlld1ByZWxvYWRzfSkoXG5cdFx0XHRKU09OLnBhcnNlKGRlY29kZVVSSUNvbXBvbmVudChcIiR7ZW5jb2RlVVJJQ29tcG9uZW50KEpTT04uc3RyaW5naWZ5KGN0eCkpfVwiKSlcblx0XHQpXFxuLy8jIHNvdXJjZVVSTD1ub3RlYm9va1dlYnZpZXdQcmVsb2Fkcy5qc1xcbmA7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUEyRkEsZUFBZSxnQkFBZ0IsS0FBcUI7QUFRbkQsUUFBTSxZQUFZLFVBQVU7QUFDNUIsUUFBTSxXQUFZLFVB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RSxRQUFRLFNBQVMsRUFBRSxRQUFRO0FBQUEsTUFDakQ7QUFBQSxJQUNEO0FBQUEsSUFFQSxRQUFRLEdBQWMsUUFBZ0I7QUFDckMsV0FBSyxjQUFjO0FBQ25CLE1BQUMsRUFBRSxPQUF1QixVQUFVLE9BQU8sVUFBVTtBQUNyRCwwQkFBeUQsaUJBQWlCO0FBQUEsUUFDekU7QUFBQSxNQUNELENBQUM7QUFFRCxVQUFJLEtBQUssYUFBYTtBQUNyQixhQUFLLFlBQVksT0FBTztBQUN4QixhQUFLLGNBQWM7QUFBQSxNQUNwQjtBQUVBLE1BQUMsRUFBRSxPQUF1QixNQUFNLFNBQVM7QUFBQSxJQUMxQztBQUFBLEVBQ0QsRUFBRTtBQUNIO0FBRU8sU0FBUyxrQkFBa0IsYUFBNEIsU0FBeUIsZUFBOEIsV0FBd0QsVUFBNEQsb0JBQTZCLE9BQWU7QUFDcFIsUUFBTSxNQUFzQjtBQUFBLElBQzNCLE9BQU87QUFBQSxJQUNQO0FBQUEsSUFDQTtBQUFBLElBQ0EsY0FBYztBQUFBLElBQ2Qsb0JBQW9CO0FBQUEsSUFDcEI7QUFBQSxJQUNBO0FBQUEsRUFDRDtBQUdBLFNBQU87QUFBQTtBQUFBLEtBRUgsZUFBZTtBQUFBLG9DQUNnQixtQkFBbUIsS0FBSyxVQUFVLEdBQUcsQ0FBQyxDQUFDO0FBQUE7QUFBQTtBQUFBO0FBRTNFOyIsCiAgIm5hbWVzIjogWyJyYW5nZSIsICJub2RlcyIsICJ0YWdOYW1lIiwgImF0dHJpYnV0ZXMiLCAiaWQiLCAibWltZSIsICJtZXRhZGF0YSIsICJ2YWx1ZUJ5dGVzIiwgImFwcGVuZGVkIiwgIml0ZW0iLCAiZmluZCIsICJlcnJvck1lc3NhZ2UiLCAicmVuZGVyZXIiLCAicmVuZGVyZXJzIl0KfQo=
