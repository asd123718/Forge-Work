var __knownSymbol = (name, symbol) => (symbol = Symbol[name]) ? symbol : /* @__PURE__ */ Symbol.for("Symbol." + name);
var __typeError = (msg) => {
  throw TypeError(msg);
};
var __using = (stack, value, async) => {
  if (value != null) {
    if (typeof value !== "object" && typeof value !== "function") __typeError("Object expected");
    var dispose, inner;
    if (async) dispose = value[__knownSymbol("asyncDispose")];
    if (dispose === void 0) {
      dispose = value[__knownSymbol("dispose")];
      if (async) inner = dispose;
    }
    if (typeof dispose !== "function") __typeError("Object not disposable");
    if (inner) dispose = function() {
      try {
        inner.call(this);
      } catch (e) {
        return Promise.reject(e);
      }
    };
    stack.push([async, dispose, value]);
  } else if (async) {
    stack.push([async]);
  }
  return value;
};
var __callDispose = (stack, error, hasError) => {
  var E = typeof SuppressedError === "function" ? SuppressedError : function(e, s, m, _) {
    return _ = Error(m), _.name = "SuppressedError", _.error = e, _.suppressed = s, _;
  };
  var fail = (e) => error = hasError ? new E(e, error, "An error was suppressed during disposal") : (hasError = true, e);
  var next = (it) => {
    while (it = stack.pop()) {
      try {
        var result = it[1] && it[1].call(it[2]);
        if (it[0]) return Promise.resolve(result).then(next, (e) => (fail(e), next()));
      } catch (e) {
        fail(e);
      }
    }
    if (hasError) throw error;
  };
  return next();
};
import { Emitter } from "../../../base/common/event.js";
import { Disposable, DisposableStore, MutableDisposable } from "../../../base/common/lifecycle.js";
import { BrowserElementSelectionMode } from "../common/browserView.js";
import { collapseToShorthands, formatMatchedStyles, keyComputedProperties } from "../common/cssHelpers.js";
const inspectHighlightConfig = {
  showInfo: true,
  showRulers: false,
  showStyles: true,
  showAccessibilityInfo: true,
  showExtensionLines: false,
  contrastAlgorithm: "aa",
  contentColor: { r: 173, g: 216, b: 255, a: 0.8 },
  paddingColor: { r: 150, g: 200, b: 255, a: 0.5 },
  borderColor: { r: 120, g: 180, b: 255, a: 0.7 },
  marginColor: { r: 200, g: 220, b: 255, a: 0.4 },
  eventTargetColor: { r: 130, g: 160, b: 255, a: 0.8 },
  shapeColor: { r: 130, g: 160, b: 255, a: 0.8 },
  shapeMarginColor: { r: 130, g: 160, b: 255, a: 0.5 },
  gridHighlightConfig: {
    rowGapColor: { r: 140, g: 190, b: 255, a: 0.3 },
    rowHatchColor: { r: 140, g: 190, b: 255, a: 0.7 },
    columnGapColor: { r: 140, g: 190, b: 255, a: 0.3 },
    columnHatchColor: { r: 140, g: 190, b: 255, a: 0.7 },
    rowLineColor: { r: 120, g: 180, b: 255 },
    columnLineColor: { r: 120, g: 180, b: 255 },
    rowLineDash: true,
    columnLineDash: true
  },
  flexContainerHighlightConfig: {
    containerBorder: { color: { r: 120, g: 180, b: 255 }, pattern: "solid" },
    itemSeparator: { color: { r: 140, g: 190, b: 255 }, pattern: "solid" },
    lineSeparator: { color: { r: 140, g: 190, b: 255 }, pattern: "solid" },
    mainDistributedSpace: { hatchColor: { r: 140, g: 190, b: 255, a: 0.7 }, fillColor: { r: 140, g: 190, b: 255, a: 0.4 } },
    crossDistributedSpace: { hatchColor: { r: 140, g: 190, b: 255, a: 0.7 }, fillColor: { r: 140, g: 190, b: 255, a: 0.4 } },
    rowGapSpace: { hatchColor: { r: 140, g: 190, b: 255, a: 0.7 }, fillColor: { r: 140, g: 190, b: 255, a: 0.4 } },
    columnGapSpace: { hatchColor: { r: 140, g: 190, b: 255, a: 0.7 }, fillColor: { r: 140, g: 190, b: 255, a: 0.4 } }
  },
  flexItemHighlightConfig: {
    baseSizeBox: { hatchColor: { r: 130, g: 170, b: 255, a: 0.6 } },
    baseSizeBorder: { color: { r: 120, g: 180, b: 255 }, pattern: "solid" },
    flexibilityArrow: { color: { r: 130, g: 190, b: 255 } }
  }
};
function useScopedDisposal() {
  const store = new DisposableStore();
  store[Symbol.dispose] = () => store.dispose();
  return store;
}
class BrowserViewFrameInspector extends Disposable {
  /**
   * @param connection The CDP session that owns this frame's target.
   * @param frame The Electron WebFrameMain for this frame.
   * @param _uniqueContextId The unique execution context ID for Runtime calls in this frame.
   * @param _frameId The CDP frame ID for this frame.
   */
  constructor(connection, frame, _uniqueContextId, _frameId) {
    super();
    this.connection = connection;
    this.frame = frame;
    this._uniqueContextId = _uniqueContextId;
    this._frameId = _frameId;
    this._isDisposed = false;
    this._onWillDispose = this._register(new Emitter());
    this.onWillDispose = this._onWillDispose.event;
    this._onDidInspectElement = this._register(new Emitter());
    this.onDidInspectElement = this._onDidInspectElement.event;
    this._onDidRemoveElementComment = this._register(new Emitter());
    this.onDidRemoveElementComment = this._onDidRemoveElementComment.event;
    this._onDidStopPicking = this._register(new Emitter());
    this.onDidStopPicking = this._onDidStopPicking.event;
    this._isPaused = false;
    this._activeInspection = this._register(new MutableDisposable());
    this._register(connection.onClose(() => {
      this.dispose();
    }));
    this._register(connection.onEvent(async (event) => {
      switch (event.method) {
        case "Overlay.inspectNodeRequested": {
          const params = event.params;
          if (params?.backendNodeId && this.isInspecting) {
            try {
              const { node } = await this.connection.sendCommand("DOM.describeNode", {
                backendNodeId: params.backendNodeId
              });
              if (node.frameId && node.frameId !== this._frameId) {
                break;
              }
              const nodeData = await this.extractNodeData({ backendNodeId: params.backendNodeId });
              this._onDidInspectElement.fire(nodeData);
            } catch {
            }
          }
          break;
        }
        case "Debugger.paused":
          this._isPaused = true;
          break;
        case "Debugger.resumed":
          this._isPaused = false;
          break;
      }
    }));
    const onPicked = async (event, result) => {
      if (!result?.elementId || event.senderFrame !== this.frame) {
        return;
      }
      try {
        const nodeData = await this.extractNodeDataById(result.elementId);
        this._onDidInspectElement.fire({ ...nodeData, elementId: result.elementId, comment: result.comment });
      } catch {
        this._updateElementComments({ pendingCommentIdsToDiscard: [result.elementId] });
      }
    };
    frame.ipc.on("vscode:browserView:elementPicked", onPicked);
    this._register({ dispose: () => frame.ipc.removeListener("vscode:browserView:elementPicked", onPicked) });
    const onCommentRemoved = (event, elementId) => {
      if (elementId && event.senderFrame === this.frame) {
        this._onDidRemoveElementComment.fire(elementId);
      }
    };
    frame.ipc.on("vscode:browserView:elementCommentRemoved", onCommentRemoved);
    this._register({ dispose: () => frame.ipc.removeListener("vscode:browserView:elementCommentRemoved", onCommentRemoved) });
    const onPickStopped = (event) => {
      if (event.senderFrame !== this.frame) {
        return;
      }
      this._onDidStopPicking.fire();
    };
    frame.ipc.on("vscode:browserView:elementPickStopped", onPickStopped);
    this._register({ dispose: () => frame.ipc.removeListener("vscode:browserView:elementPickStopped", onPickStopped) });
    this._enableDomains().catch(() => {
    });
  }
  /** Whether this frame's JavaScript execution is currently paused by the debugger. */
  get isPaused() {
    return this._isPaused;
  }
  /** Whether element inspection is currently active on this frame. */
  get isInspecting() {
    return !!this._activeInspection.value;
  }
  /** The CDP frame ID for this frame. */
  get frameId() {
    return this._frameId;
  }
  async _enableDomains() {
    await this.connection.sendCommand("DOM.enable");
    await this.connection.sendCommand("Overlay.enable");
    await this.connection.sendCommand("CSS.enable");
    await this.connection.sendCommand("Runtime.enable");
    await this.connection.sendCommand("Page.enable");
  }
  dispose() {
    if (this._isDisposed) {
      return;
    }
    this._isDisposed = true;
    this._onWillDispose.fire();
    super.dispose();
  }
  /**
   * Send the theme to this frame's preload.
   */
  setTheme(theme) {
    this.frame.postMessage("vscode:browserView:setTheme", theme);
  }
  /**
   * Start element inspection on this frame.
   * Uses CDP inspect mode if paused, otherwise the preload picker.
   * Stores a disposable so stop always tears down the correct mode.
   */
  async startInspection(options) {
    const mode = this._isPaused && options.mode !== BrowserElementSelectionMode.Comment ? "cdp" : "preload";
    if (this._activeInspection.value?.mode === mode) {
      if (mode === "preload") {
        this.frame.postMessage("vscode:browserView:startElementPicker", options);
      }
      return;
    }
    await this._stopInspection();
    if (mode === "cdp") {
      await this.connection.sendCommand("Overlay.setInspectMode", {
        mode: "searchForNode",
        highlightConfig: inspectHighlightConfig
      });
      const stop = async () => {
        if (this.frame.isDestroyed()) {
          return;
        }
        try {
          await this.connection.sendCommand("Overlay.setInspectMode", {
            mode: "none",
            highlightConfig: { showInfo: false, showStyles: false }
          });
          await this.connection.sendCommand("Overlay.hideHighlight");
        } catch {
        }
      };
      this._activeInspection.value = {
        mode,
        stop,
        dispose: () => {
          void stop();
        }
      };
    } else {
      this.frame.postMessage("vscode:browserView:startElementPicker", options);
      const stop = async () => {
        if (!this.frame.isDestroyed()) {
          this.frame.postMessage("vscode:browserView:stopElementPicker", {});
        }
      };
      this._activeInspection.value = {
        mode,
        stop,
        dispose: () => {
          void stop();
        }
      };
    }
  }
  async _stopInspection() {
    const activeInspection = this._activeInspection.value;
    if (activeInspection) {
      this._activeInspection.clearAndLeak();
      await activeInspection.stop();
    }
  }
  /**
   * Stop element inspection on this frame.
   */
  async stopInspection() {
    await this._stopInspection();
  }
  setElementComments(update) {
    this._updateElementComments(update);
  }
  _updateElementComments(update) {
    if (!this.frame.isDestroyed()) {
      this.frame.postMessage("vscode:browserView:setElementComments", update);
    }
  }
  /**
   * Resolve an element by its preload-tracked id and extract full node data.
   */
  async extractNodeDataById(elementId) {
    const { result } = await this.connection.sendCommand("Runtime.evaluate", {
      expression: `window.__vscode_helpers?.getElement(${JSON.stringify(elementId)})`,
      returnByValue: false,
      uniqueContextId: this._uniqueContextId
    });
    if (!result?.objectId) {
      throw new Error(`Element not found: ${elementId}`);
    }
    return this.extractNodeData({ objectId: result.objectId });
  }
  /**
   * Extract full element data from a CDP node reference.
   */
  async extractNodeData(id) {
    const data = await extractNodeData(this.connection, id);
    return { ...data, url: this.frame.url };
  }
  /**
   * Get the visual viewport scale for this frame.
   */
  async getVisualViewportScale() {
    try {
      const result = await this.connection.sendCommand("Page.getLayoutMetrics");
      if (typeof result.cssVisualViewport?.scale === "number") {
        const scale = Number(result.cssVisualViewport.scale);
        if (Number.isFinite(scale) && scale > 0) {
          return scale;
        }
      }
    } catch {
    }
    return 1;
  }
  /**
   * Create a handle to an element tracked by the preload script.
   */
  getElementHandle(elementId) {
    let disposed = false;
    return {
      addToChat: async () => {
        const nodeData = await this.extractNodeDataById(elementId);
        this._onDidInspectElement.fire(nodeData);
      },
      addComment: () => {
        this.frame.postMessage("vscode:browserView:showElementComment", { elementId });
      },
      highlight: async () => {
        this.frame.postMessage("vscode:browserView:highlightElement", { elementId });
      },
      hideHighlight: async () => {
        this.frame.postMessage("vscode:browserView:hideHighlight", {});
      },
      dispose: () => {
        if (disposed) {
          return;
        }
        disposed = true;
        this.frame.postMessage("vscode:browserView:hideHighlight", {});
      }
    };
  }
}
async function extractNodeData(connection, id) {
  var _stack = [];
  try {
    const store = __using(_stack, useScopedDisposal());
    const discoveredNodesByNodeId = {};
    store.add(connection.onEvent((event) => {
      if (event.method === "DOM.setChildNodes") {
        const { nodes } = event.params;
        for (const node2 of nodes) {
          discoveredNodesByNodeId[node2.nodeId] = node2;
          if (node2.children) {
            for (const child of node2.children) {
              discoveredNodesByNodeId[child.nodeId] = {
                ...child,
                parentId: node2.nodeId
              };
            }
          }
          if (node2.pseudoElements) {
            for (const pseudo of node2.pseudoElements) {
              discoveredNodesByNodeId[pseudo.nodeId] = {
                ...pseudo,
                parentId: node2.nodeId
              };
            }
          }
        }
      }
    }));
    await connection.sendCommand("DOM.getDocument");
    const { node } = await connection.sendCommand("DOM.describeNode", id);
    if (!node) {
      throw new Error("Failed to describe node.");
    }
    let nodeId = node.nodeId;
    if (!nodeId) {
      const { nodeIds } = await connection.sendCommand("DOM.pushNodesByBackendIdsToFrontend", { backendNodeIds: [node.backendNodeId] });
      if (!nodeIds?.length) {
        throw new Error("Failed to get node ID.");
      }
      nodeId = nodeIds[0];
    }
    const { model } = await connection.sendCommand("DOM.getBoxModel", { nodeId });
    if (!model) {
      throw new Error("Failed to get box model.");
    }
    const content = model.content;
    const margin = model.margin;
    const x = Math.min(margin[0], content[0]);
    const y = Math.min(margin[1], content[1]);
    const width = Math.max(margin[2] - margin[0], content[2] - content[0]);
    const height = Math.max(margin[5] - margin[1], content[5] - content[1]);
    const matched = await connection.sendCommand("CSS.getMatchedStylesForNode", { nodeId });
    if (!matched) {
      throw new Error("Failed to get matched css.");
    }
    const { rulesText, referencedVars, authorPropertyNames, userAgentPropertyNames } = formatMatchedStyles(matched);
    const { outerHTML } = await connection.sendCommand("DOM.getOuterHTML", { nodeId });
    if (!outerHTML) {
      throw new Error("Failed to get outerHTML.");
    }
    const attributes = attributeArrayToRecord(node.attributes);
    const ancestors = [];
    let currentNode = discoveredNodesByNodeId[nodeId] ?? node;
    while (currentNode) {
      const attributes2 = attributeArrayToRecord(currentNode.attributes);
      ancestors.unshift({
        tagName: currentNode.localName,
        id: attributes2.id,
        classNames: attributes2.class?.trim().split(/\s+/).filter(Boolean)
      });
      currentNode = currentNode.parentId ? discoveredNodesByNodeId[currentNode.parentId] : void 0;
    }
    let computedStyle = rulesText;
    let computedStyles;
    try {
      const { computedStyle: computedStyleArray } = await connection.sendCommand("CSS.getComputedStyleForNode", { nodeId });
      if (computedStyleArray) {
        computedStyles = {};
        const resolvedMap = /* @__PURE__ */ new Map();
        const varLines = [];
        for (const prop of computedStyleArray) {
          if (!prop.name || typeof prop.value !== "string") {
            continue;
          }
          if (referencedVars.has(prop.name) || keyComputedProperties.has(prop.name)) {
            computedStyles[prop.name] = prop.value;
          }
          if (authorPropertyNames.has(prop.name)) {
            resolvedMap.set(prop.name, prop.value);
          } else if (userAgentPropertyNames.has(prop.name)) {
            resolvedMap.set(prop.name, `${prop.value} /*UA*/`);
          }
          if (referencedVars.has(prop.name)) {
            varLines.push(`${prop.name}: ${prop.value};`);
          }
        }
        if (resolvedMap.size > 0) {
          const resolvedLines = collapseToShorthands(resolvedMap);
          computedStyle += "\n\n/* Resolved values */\n" + resolvedLines.join("\n");
        }
        if (varLines.length > 0) {
          computedStyle += "\n\n/* CSS variables */\n" + varLines.join("\n");
        }
      }
    } catch {
    }
    return {
      outerHTML,
      computedStyle,
      bounds: { x, y, width, height },
      ancestors,
      attributes,
      computedStyles,
      dimensions: { top: y, left: x, width, height }
    };
  } catch (_) {
    var _error = _, _hasError = true;
  } finally {
    __callDispose(_stack, _error, _hasError);
  }
}
function attributeArrayToRecord(attributes) {
  const record = {};
  for (let i = 0; i < attributes.length; i += 2) {
    const name = attributes[i];
    const value = attributes[i + 1];
    record[name] = value;
  }
  return record;
}
export {
  BrowserViewFrameInspector,
  extractNodeData,
  inspectHighlightConfig
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYnJvd3NlclZpZXdcXGVsZWN0cm9uLW1haW5cXGJyb3dzZXJWaWV3RnJhbWVJbnNwZWN0b3IudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUsIE11dGFibGVEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IEJyb3dzZXJFbGVtZW50U2VsZWN0aW9uTW9kZSwgSUVsZW1lbnREYXRhLCBJRWxlbWVudEFuY2VzdG9yLCBJQnJvd3NlckVsZW1lbnRDb21tZW50c1VwZGF0ZSwgSUJyb3dzZXJFbGVtZW50U2VsZWN0aW9uT3B0aW9ucywgSUJyb3dzZXJWaWV3VGhlbWUgfSBmcm9tICcuLi9jb21tb24vYnJvd3NlclZpZXcuanMnO1xuaW1wb3J0IHsgY29sbGFwc2VUb1Nob3J0aGFuZHMsIGZvcm1hdE1hdGNoZWRTdHlsZXMsIGtleUNvbXB1dGVkUHJvcGVydGllcywgdHlwZSBJTWF0Y2hlZFN0eWxlcyB9IGZyb20gJy4uL2NvbW1vbi9jc3NIZWxwZXJzLmpzJztcbmltcG9ydCB7IElDRFBDb25uZWN0aW9uIH0gZnJvbSAnLi4vY29tbW9uL2NkcC90eXBlcy5qcyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUZyYW1lRWxlbWVudEhhbmRsZSBleHRlbmRzIElEaXNwb3NhYmxlIHtcblx0YWRkVG9DaGF0KCk6IFByb21pc2U8dm9pZD47XG5cdGFkZENvbW1lbnQoKTogdm9pZDtcblx0aGlnaGxpZ2h0KCk6IFByb21pc2U8dm9pZD47XG5cdGhpZGVIaWdobGlnaHQoKTogUHJvbWlzZTx2b2lkPjtcbn1cblxudHlwZSBRdWFkID0gW251bWJlciwgbnVtYmVyLCBudW1iZXIsIG51bWJlciwgbnVtYmVyLCBudW1iZXIsIG51bWJlciwgbnVtYmVyXTtcblxuaW50ZXJmYWNlIElCb3hNb2RlbCB7XG5cdGNvbnRlbnQ6IFF1YWQ7XG5cdHBhZGRpbmc6IFF1YWQ7XG5cdGJvcmRlcjogUXVhZDtcblx0bWFyZ2luOiBRdWFkO1xuXHR3aWR0aDogbnVtYmVyO1xuXHRoZWlnaHQ6IG51bWJlcjtcbn1cblxuaW50ZXJmYWNlIElOb2RlIHtcblx0bm9kZUlkOiBudW1iZXI7XG5cdGJhY2tlbmROb2RlSWQ6IG51bWJlcjtcblx0cGFyZW50SWQ/OiBudW1iZXI7XG5cdGxvY2FsTmFtZTogc3RyaW5nO1xuXHRhdHRyaWJ1dGVzOiBzdHJpbmdbXTtcblx0Y2hpbGRyZW4/OiBJTm9kZVtdO1xuXHRwc2V1ZG9FbGVtZW50cz86IElOb2RlW107XG59XG5cbmludGVyZmFjZSBJTGF5b3V0TWV0cmljc1Jlc3VsdCB7XG5cdGNzc1Zpc3VhbFZpZXdwb3J0Pzoge1xuXHRcdHNjYWxlPzogbnVtYmVyO1xuXHR9O1xufVxuXG5pbnRlcmZhY2UgSUFjdGl2ZUluc3BlY3Rpb24gZXh0ZW5kcyBJRGlzcG9zYWJsZSB7XG5cdHJlYWRvbmx5IG1vZGU6ICdjZHAnIHwgJ3ByZWxvYWQnO1xuXHRzdG9wKCk6IFByb21pc2U8dm9pZD47XG59XG5cbi8qKiBTbGlnaHRseSBjdXN0b21pc2VkIENEUCBkZWJ1Z2dlciBpbnNwZWN0IGhpZ2hsaWdodCBjb2xvdXJzLiAqL1xuZXhwb3J0IGNvbnN0IGluc3BlY3RIaWdobGlnaHRDb25maWcgPSB7XG5cdHNob3dJbmZvOiB0cnVlLFxuXHRzaG93UnVsZXJzOiBmYWxzZSxcblx0c2hvd1N0eWxlczogdHJ1ZSxcblx0c2hvd0FjY2Vzc2liaWxpdHlJbmZvOiB0cnVlLFxuXHRzaG93RXh0ZW5zaW9uTGluZXM6IGZhbHNlLFxuXHRjb250cmFzdEFsZ29yaXRobTogJ2FhJyxcblx0Y29udGVudENvbG9yOiB7IHI6IDE3MywgZzogMjE2LCBiOiAyNTUsIGE6IDAuOCB9LFxuXHRwYWRkaW5nQ29sb3I6IHsgcjogMTUwLCBnOiAyMDAsIGI6IDI1NSwgYTogMC41IH0sXG5cdGJvcmRlckNvbG9yOiB7IHI6IDEyMCwgZzogMTgwLCBiOiAyNTUsIGE6IDAuNyB9LFxuXHRtYXJnaW5Db2xvcjogeyByOiAyMDAsIGc6IDIyMCwgYjogMjU1LCBhOiAwLjQgfSxcblx0ZXZlbnRUYXJnZXRDb2xvcjogeyByOiAxMzAsIGc6IDE2MCwgYjogMjU1LCBhOiAwLjggfSxcblx0c2hhcGVDb2xvcjogeyByOiAxMzAsIGc6IDE2MCwgYjogMjU1LCBhOiAwLjggfSxcblx0c2hhcGVNYXJnaW5Db2xvcjogeyByOiAxMzAsIGc6IDE2MCwgYjogMjU1LCBhOiAwLjUgfSxcblx0Z3JpZEhpZ2hsaWdodENvbmZpZzoge1xuXHRcdHJvd0dhcENvbG9yOiB7IHI6IDE0MCwgZzogMTkwLCBiOiAyNTUsIGE6IDAuMyB9LFxuXHRcdHJvd0hhdGNoQ29sb3I6IHsgcjogMTQwLCBnOiAxOTAsIGI6IDI1NSwgYTogMC43IH0sXG5cdFx0Y29sdW1uR2FwQ29sb3I6IHsgcjogMTQwLCBnOiAxOTAsIGI6IDI1NSwgYTogMC4zIH0sXG5cdFx0Y29sdW1uSGF0Y2hDb2xvcjogeyByOiAxNDAsIGc6IDE5MCwgYjogMjU1LCBhOiAwLjcgfSxcblx0XHRyb3dMaW5lQ29sb3I6IHsgcjogMTIwLCBnOiAxODAsIGI6IDI1NSB9LFxuXHRcdGNvbHVtbkxpbmVDb2xvcjogeyByOiAxMjAsIGc6IDE4MCwgYjogMjU1IH0sXG5cdFx0cm93TGluZURhc2g6IHRydWUsXG5cdFx0Y29sdW1uTGluZURhc2g6IHRydWVcblx0fSxcblx0ZmxleENvbnRhaW5lckhpZ2hsaWdodENvbmZpZzoge1xuXHRcdGNvbnRhaW5lckJvcmRlcjogeyBjb2xvcjogeyByOiAxMjAsIGc6IDE4MCwgYjogMjU1IH0sIHBhdHRlcm46ICdzb2xpZCcgfSxcblx0XHRpdGVtU2VwYXJhdG9yOiB7IGNvbG9yOiB7IHI6IDE0MCwgZzogMTkwLCBiOiAyNTUgfSwgcGF0dGVybjogJ3NvbGlkJyB9LFxuXHRcdGxpbmVTZXBhcmF0b3I6IHsgY29sb3I6IHsgcjogMTQwLCBnOiAxOTAsIGI6IDI1NSB9LCBwYXR0ZXJuOiAnc29saWQnIH0sXG5cdFx0bWFpbkRpc3RyaWJ1dGVkU3BhY2U6IHsgaGF0Y2hDb2xvcjogeyByOiAxNDAsIGc6IDE5MCwgYjogMjU1LCBhOiAwLjcgfSwgZmlsbENvbG9yOiB7IHI6IDE0MCwgZzogMTkwLCBiOiAyNTUsIGE6IDAuNCB9IH0sXG5cdFx0Y3Jvc3NEaXN0cmlidXRlZFNwYWNlOiB7IGhhdGNoQ29sb3I6IHsgcjogMTQwLCBnOiAxOTAsIGI6IDI1NSwgYTogMC43IH0sIGZpbGxDb2xvcjogeyByOiAxNDAsIGc6IDE5MCwgYjogMjU1LCBhOiAwLjQgfSB9LFxuXHRcdHJvd0dhcFNwYWNlOiB7IGhhdGNoQ29sb3I6IHsgcjogMTQwLCBnOiAxOTAsIGI6IDI1NSwgYTogMC43IH0sIGZpbGxDb2xvcjogeyByOiAxNDAsIGc6IDE5MCwgYjogMjU1LCBhOiAwLjQgfSB9LFxuXHRcdGNvbHVtbkdhcFNwYWNlOiB7IGhhdGNoQ29sb3I6IHsgcjogMTQwLCBnOiAxOTAsIGI6IDI1NSwgYTogMC43IH0sIGZpbGxDb2xvcjogeyByOiAxNDAsIGc6IDE5MCwgYjogMjU1LCBhOiAwLjQgfSB9LFxuXHR9LFxuXHRmbGV4SXRlbUhpZ2hsaWdodENvbmZpZzoge1xuXHRcdGJhc2VTaXplQm94OiB7IGhhdGNoQ29sb3I6IHsgcjogMTMwLCBnOiAxNzAsIGI6IDI1NSwgYTogMC42IH0gfSxcblx0XHRiYXNlU2l6ZUJvcmRlcjogeyBjb2xvcjogeyByOiAxMjAsIGc6IDE4MCwgYjogMjU1IH0sIHBhdHRlcm46ICdzb2xpZCcgfSxcblx0XHRmbGV4aWJpbGl0eUFycm93OiB7IGNvbG9yOiB7IHI6IDEzMCwgZzogMTkwLCBiOiAyNTUgfSB9XG5cdH0sXG59O1xuXG5mdW5jdGlvbiB1c2VTY29wZWREaXNwb3NhbCgpIHtcblx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCkgYXMgRGlzcG9zYWJsZVN0b3JlICYgeyBbU3ltYm9sLmRpc3Bvc2VdKCk6IHZvaWQgfTtcblx0c3RvcmVbU3ltYm9sLmRpc3Bvc2VdID0gKCkgPT4gc3RvcmUuZGlzcG9zZSgpO1xuXHRyZXR1cm4gc3RvcmU7XG59XG5cbi8qKlxuICogUGVyLWZyYW1lIGVsZW1lbnQgaW5zcGVjdG9yIGJhY2tlZCBieSBhIGRlZGljYXRlZCBDRFAgc2Vzc2lvbi5cbiAqXG4gKiBPd25zIHRoZSBmdWxsIGxpZmVjeWNsZSBvZiBlbGVtZW50IGluc3BlY3Rpb24gZm9yIGEgc2luZ2xlIGZyYW1lOlxuICogQ0RQIGRvbWFpbiBpbml0aWFsaXphdGlvbiwgZWxlbWVudCBwaWNraW5nIChvdmVybGF5ICsgQ0RQIG1vZGVzKSxcbiAqIG5vZGUgZGF0YSBleHRyYWN0aW9uLCBhbmQgaGlnaGxpZ2h0IG1hbmFnZW1lbnQuXG4gKlxuICogRmlyZXMge0BsaW5rIG9uRGlkSW5zcGVjdEVsZW1lbnR9IHdoZW4gYW4gZWxlbWVudCBpcyBzZWxlY3RlZCB2aWFcbiAqIENEUCBpbnNwZWN0IG1vZGUgKGRlYnVnZ2VyIHBhdXNlZCkuXG4gKi9cbmV4cG9ydCBjbGFzcyBCcm93c2VyVmlld0ZyYW1lSW5zcGVjdG9yIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSBfaXNEaXNwb3NlZCA9IGZhbHNlO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbldpbGxEaXNwb3NlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uV2lsbERpc3Bvc2U6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25XaWxsRGlzcG9zZS5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZEluc3BlY3RFbGVtZW50ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SUVsZW1lbnREYXRhPigpKTtcblx0cmVhZG9ubHkgb25EaWRJbnNwZWN0RWxlbWVudDogRXZlbnQ8SUVsZW1lbnREYXRhPiA9IHRoaXMuX29uRGlkSW5zcGVjdEVsZW1lbnQuZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkUmVtb3ZlRWxlbWVudENvbW1lbnQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxzdHJpbmc+KCkpO1xuXHRyZWFkb25seSBvbkRpZFJlbW92ZUVsZW1lbnRDb21tZW50ID0gdGhpcy5fb25EaWRSZW1vdmVFbGVtZW50Q29tbWVudC5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFN0b3BQaWNraW5nID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkU3RvcFBpY2tpbmc6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25EaWRTdG9wUGlja2luZy5ldmVudDtcblxuXHRwcml2YXRlIF9pc1BhdXNlZCA9IGZhbHNlO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9hY3RpdmVJbnNwZWN0aW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPElBY3RpdmVJbnNwZWN0aW9uPigpKTtcblxuXHQvKiogV2hldGhlciB0aGlzIGZyYW1lJ3MgSmF2YVNjcmlwdCBleGVjdXRpb24gaXMgY3VycmVudGx5IHBhdXNlZCBieSB0aGUgZGVidWdnZXIuICovXG5cdGdldCBpc1BhdXNlZCgpOiBib29sZWFuIHsgcmV0dXJuIHRoaXMuX2lzUGF1c2VkOyB9XG5cblx0LyoqIFdoZXRoZXIgZWxlbWVudCBpbnNwZWN0aW9uIGlzIGN1cnJlbnRseSBhY3RpdmUgb24gdGhpcyBmcmFtZS4gKi9cblx0Z2V0IGlzSW5zcGVjdGluZygpOiBib29sZWFuIHsgcmV0dXJuICEhdGhpcy5fYWN0aXZlSW5zcGVjdGlvbi52YWx1ZTsgfVxuXG5cdC8qKiBUaGUgQ0RQIGZyYW1lIElEIGZvciB0aGlzIGZyYW1lLiAqL1xuXHRnZXQgZnJhbWVJZCgpOiBzdHJpbmcgeyByZXR1cm4gdGhpcy5fZnJhbWVJZDsgfVxuXG5cdC8qKlxuXHQgKiBAcGFyYW0gY29ubmVjdGlvbiBUaGUgQ0RQIHNlc3Npb24gdGhhdCBvd25zIHRoaXMgZnJhbWUncyB0YXJnZXQuXG5cdCAqIEBwYXJhbSBmcmFtZSBUaGUgRWxlY3Ryb24gV2ViRnJhbWVNYWluIGZvciB0aGlzIGZyYW1lLlxuXHQgKiBAcGFyYW0gX3VuaXF1ZUNvbnRleHRJZCBUaGUgdW5pcXVlIGV4ZWN1dGlvbiBjb250ZXh0IElEIGZvciBSdW50aW1lIGNhbGxzIGluIHRoaXMgZnJhbWUuXG5cdCAqIEBwYXJhbSBfZnJhbWVJZCBUaGUgQ0RQIGZyYW1lIElEIGZvciB0aGlzIGZyYW1lLlxuXHQgKi9cblx0Y29uc3RydWN0b3IoXG5cdFx0cmVhZG9ubHkgY29ubmVjdGlvbjogSUNEUENvbm5lY3Rpb24sXG5cdFx0cmVhZG9ubHkgZnJhbWU6IEVsZWN0cm9uLldlYkZyYW1lTWFpbixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF91bmlxdWVDb250ZXh0SWQ6IHN0cmluZyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9mcmFtZUlkOiBzdHJpbmcsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcihjb25uZWN0aW9uLm9uQ2xvc2UoKCkgPT4ge1xuXHRcdFx0dGhpcy5kaXNwb3NlKCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoY29ubmVjdGlvbi5vbkV2ZW50KGFzeW5jIGV2ZW50ID0+IHtcblx0XHRcdHN3aXRjaCAoZXZlbnQubWV0aG9kKSB7XG5cdFx0XHRcdGNhc2UgJ092ZXJsYXkuaW5zcGVjdE5vZGVSZXF1ZXN0ZWQnOiB7XG5cdFx0XHRcdFx0Y29uc3QgcGFyYW1zID0gZXZlbnQucGFyYW1zIGFzIHsgYmFja2VuZE5vZGVJZDogbnVtYmVyIH07XG5cdFx0XHRcdFx0Ly8gT25seSBoYW5kbGUgdGhpcyBldmVudCB3aGVuIFZTIENvZGUncyBvd24gZWxlbWVudCBwaWNrZXIgaXMgYWN0aXZlLlxuXHRcdFx0XHRcdC8vIFRoaXMgZXZlbnQgYWxzbyBmaXJlcyB3aGVuIHRoZSB1c2VyIGluc3BlY3RzIGVsZW1lbnRzIHZpYSB0aGVcblx0XHRcdFx0XHQvLyBEZXZUb29scyBidWlsdC1pbiBpbnNwZWN0IGN1cnNvciBcdTIwMTQgaW4gdGhhdCBjYXNlIHdlIG11c3Qgbm90XG5cdFx0XHRcdFx0Ly8gc2lsZW50bHkgYWRkIHRoZSBlbGVtZW50IHRvIENvcGlsb3QgQ2hhdCBhcyBjb250ZXh0LlxuXHRcdFx0XHRcdGlmIChwYXJhbXM/LmJhY2tlbmROb2RlSWQgJiYgdGhpcy5pc0luc3BlY3RpbmcpIHtcblx0XHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRcdC8vIFZlcmlmeSB0aGUgbm9kZSBiZWxvbmdzIHRvIHRoaXMgZnJhbWUgKGltcG9ydGFudCB3aGVuXG5cdFx0XHRcdFx0XHRcdC8vIHNoYXJpbmcgYSBzZXNzaW9uIHdpdGggc2FtZS1vcmlnaW4gc2libGluZ3MpLlxuXHRcdFx0XHRcdFx0XHRjb25zdCB7IG5vZGUgfSA9IGF3YWl0IHRoaXMuY29ubmVjdGlvbi5zZW5kQ29tbWFuZCgnRE9NLmRlc2NyaWJlTm9kZScsIHtcblx0XHRcdFx0XHRcdFx0XHRiYWNrZW5kTm9kZUlkOiBwYXJhbXMuYmFja2VuZE5vZGVJZCxcblx0XHRcdFx0XHRcdFx0fSkgYXMgeyBub2RlOiB7IGZyYW1lSWQ/OiBzdHJpbmcgfSB9O1xuXHRcdFx0XHRcdFx0XHRpZiAobm9kZS5mcmFtZUlkICYmIG5vZGUuZnJhbWVJZCAhPT0gdGhpcy5fZnJhbWVJZCkge1xuXHRcdFx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdGNvbnN0IG5vZGVEYXRhID0gYXdhaXQgdGhpcy5leHRyYWN0Tm9kZURhdGEoeyBiYWNrZW5kTm9kZUlkOiBwYXJhbXMuYmFja2VuZE5vZGVJZCB9KTtcblx0XHRcdFx0XHRcdFx0dGhpcy5fb25EaWRJbnNwZWN0RWxlbWVudC5maXJlKG5vZGVEYXRhKTtcblx0XHRcdFx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHRcdFx0XHQvLyBCZXN0IGVmZm9ydC5cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y2FzZSAnRGVidWdnZXIucGF1c2VkJzpcblx0XHRcdFx0XHR0aGlzLl9pc1BhdXNlZCA9IHRydWU7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgJ0RlYnVnZ2VyLnJlc3VtZWQnOlxuXHRcdFx0XHRcdHRoaXMuX2lzUGF1c2VkID0gZmFsc2U7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gTGlzdGVuIGZvciBlbGVtZW50LXBpY2tlZCBJUEMgZnJvbSB0aGlzIGZyYW1lJ3MgcHJlbG9hZFxuXHRcdGNvbnN0IG9uUGlja2VkID0gYXN5bmMgKGV2ZW50OiBFbGVjdHJvbi5JcGNNYWluRXZlbnQsIHJlc3VsdDogeyBlbGVtZW50SWQ/OiBzdHJpbmc7IGNvbW1lbnQ/OiBzdHJpbmcgfSkgPT4ge1xuXHRcdFx0aWYgKCFyZXN1bHQ/LmVsZW1lbnRJZCB8fCBldmVudC5zZW5kZXJGcmFtZSAhPT0gdGhpcy5mcmFtZSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBub2RlRGF0YSA9IGF3YWl0IHRoaXMuZXh0cmFjdE5vZGVEYXRhQnlJZChyZXN1bHQuZWxlbWVudElkKTtcblx0XHRcdFx0dGhpcy5fb25EaWRJbnNwZWN0RWxlbWVudC5maXJlKHsgLi4ubm9kZURhdGEsIGVsZW1lbnRJZDogcmVzdWx0LmVsZW1lbnRJZCwgY29tbWVudDogcmVzdWx0LmNvbW1lbnQgfSk7XG5cdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0dGhpcy5fdXBkYXRlRWxlbWVudENvbW1lbnRzKHsgcGVuZGluZ0NvbW1lbnRJZHNUb0Rpc2NhcmQ6IFtyZXN1bHQuZWxlbWVudElkXSB9KTtcblx0XHRcdFx0Ly8gQmVzdCBlZmZvcnQ7IHVzZXIgY2FuIHJlLXBpY2suXG5cdFx0XHR9XG5cdFx0fTtcblx0XHRmcmFtZS5pcGMub24oJ3ZzY29kZTpicm93c2VyVmlldzplbGVtZW50UGlja2VkJywgb25QaWNrZWQpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHsgZGlzcG9zZTogKCkgPT4gZnJhbWUuaXBjLnJlbW92ZUxpc3RlbmVyKCd2c2NvZGU6YnJvd3NlclZpZXc6ZWxlbWVudFBpY2tlZCcsIG9uUGlja2VkKSB9KTtcblx0XHRjb25zdCBvbkNvbW1lbnRSZW1vdmVkID0gKGV2ZW50OiBFbGVjdHJvbi5JcGNNYWluRXZlbnQsIGVsZW1lbnRJZDogc3RyaW5nKSA9PiB7XG5cdFx0XHRpZiAoZWxlbWVudElkICYmIGV2ZW50LnNlbmRlckZyYW1lID09PSB0aGlzLmZyYW1lKSB7XG5cdFx0XHRcdHRoaXMuX29uRGlkUmVtb3ZlRWxlbWVudENvbW1lbnQuZmlyZShlbGVtZW50SWQpO1xuXHRcdFx0fVxuXHRcdH07XG5cdFx0ZnJhbWUuaXBjLm9uKCd2c2NvZGU6YnJvd3NlclZpZXc6ZWxlbWVudENvbW1lbnRSZW1vdmVkJywgb25Db21tZW50UmVtb3ZlZCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoeyBkaXNwb3NlOiAoKSA9PiBmcmFtZS5pcGMucmVtb3ZlTGlzdGVuZXIoJ3ZzY29kZTpicm93c2VyVmlldzplbGVtZW50Q29tbWVudFJlbW92ZWQnLCBvbkNvbW1lbnRSZW1vdmVkKSB9KTtcblxuXHRcdC8vIExpc3RlbiBmb3IgcGljay1zdG9wcGVkIElQQyBmcm9tIHRoaXMgZnJhbWUncyBwcmVsb2FkXG5cdFx0Y29uc3Qgb25QaWNrU3RvcHBlZCA9IChldmVudDogRWxlY3Ryb24uSXBjTWFpbkV2ZW50KSA9PiB7XG5cdFx0XHRpZiAoZXZlbnQuc2VuZGVyRnJhbWUgIT09IHRoaXMuZnJhbWUpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fb25EaWRTdG9wUGlja2luZy5maXJlKCk7XG5cdFx0fTtcblx0XHRmcmFtZS5pcGMub24oJ3ZzY29kZTpicm93c2VyVmlldzplbGVtZW50UGlja1N0b3BwZWQnLCBvblBpY2tTdG9wcGVkKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih7IGRpc3Bvc2U6ICgpID0+IGZyYW1lLmlwYy5yZW1vdmVMaXN0ZW5lcigndnNjb2RlOmJyb3dzZXJWaWV3OmVsZW1lbnRQaWNrU3RvcHBlZCcsIG9uUGlja1N0b3BwZWQpIH0pO1xuXG5cdFx0dGhpcy5fZW5hYmxlRG9tYWlucygpLmNhdGNoKCgpID0+IHsgfSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9lbmFibGVEb21haW5zKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMuY29ubmVjdGlvbi5zZW5kQ29tbWFuZCgnRE9NLmVuYWJsZScpO1xuXHRcdGF3YWl0IHRoaXMuY29ubmVjdGlvbi5zZW5kQ29tbWFuZCgnT3ZlcmxheS5lbmFibGUnKTtcblx0XHRhd2FpdCB0aGlzLmNvbm5lY3Rpb24uc2VuZENvbW1hbmQoJ0NTUy5lbmFibGUnKTtcblx0XHRhd2FpdCB0aGlzLmNvbm5lY3Rpb24uc2VuZENvbW1hbmQoJ1J1bnRpbWUuZW5hYmxlJyk7XG5cdFx0YXdhaXQgdGhpcy5jb25uZWN0aW9uLnNlbmRDb21tYW5kKCdQYWdlLmVuYWJsZScpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpIHtcblx0XHRpZiAodGhpcy5faXNEaXNwb3NlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9pc0Rpc3Bvc2VkID0gdHJ1ZTtcblx0XHR0aGlzLl9vbldpbGxEaXNwb3NlLmZpcmUoKTtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cblxuXHQvKipcblx0ICogU2VuZCB0aGUgdGhlbWUgdG8gdGhpcyBmcmFtZSdzIHByZWxvYWQuXG5cdCAqL1xuXHRzZXRUaGVtZSh0aGVtZTogSUJyb3dzZXJWaWV3VGhlbWUpOiB2b2lkIHtcblx0XHR0aGlzLmZyYW1lLnBvc3RNZXNzYWdlKCd2c2NvZGU6YnJvd3NlclZpZXc6c2V0VGhlbWUnLCB0aGVtZSk7XG5cdH1cblxuXHQvKipcblx0ICogU3RhcnQgZWxlbWVudCBpbnNwZWN0aW9uIG9uIHRoaXMgZnJhbWUuXG5cdCAqIFVzZXMgQ0RQIGluc3BlY3QgbW9kZSBpZiBwYXVzZWQsIG90aGVyd2lzZSB0aGUgcHJlbG9hZCBwaWNrZXIuXG5cdCAqIFN0b3JlcyBhIGRpc3Bvc2FibGUgc28gc3RvcCBhbHdheXMgdGVhcnMgZG93biB0aGUgY29ycmVjdCBtb2RlLlxuXHQgKi9cblx0YXN5bmMgc3RhcnRJbnNwZWN0aW9uKG9wdGlvbnM6IElCcm93c2VyRWxlbWVudFNlbGVjdGlvbk9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBtb2RlID0gdGhpcy5faXNQYXVzZWQgJiYgb3B0aW9ucy5tb2RlICE9PSBCcm93c2VyRWxlbWVudFNlbGVjdGlvbk1vZGUuQ29tbWVudCA/ICdjZHAnIDogJ3ByZWxvYWQnO1xuXHRcdGlmICh0aGlzLl9hY3RpdmVJbnNwZWN0aW9uLnZhbHVlPy5tb2RlID09PSBtb2RlKSB7XG5cdFx0XHRpZiAobW9kZSA9PT0gJ3ByZWxvYWQnKSB7XG5cdFx0XHRcdHRoaXMuZnJhbWUucG9zdE1lc3NhZ2UoJ3ZzY29kZTpicm93c2VyVmlldzpzdGFydEVsZW1lbnRQaWNrZXInLCBvcHRpb25zKTtcblx0XHRcdH1cblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRhd2FpdCB0aGlzLl9zdG9wSW5zcGVjdGlvbigpO1xuXHRcdGlmIChtb2RlID09PSAnY2RwJykge1xuXHRcdFx0YXdhaXQgdGhpcy5jb25uZWN0aW9uLnNlbmRDb21tYW5kKCdPdmVybGF5LnNldEluc3BlY3RNb2RlJywge1xuXHRcdFx0XHRtb2RlOiAnc2VhcmNoRm9yTm9kZScsXG5cdFx0XHRcdGhpZ2hsaWdodENvbmZpZzogaW5zcGVjdEhpZ2hsaWdodENvbmZpZyxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3Qgc3RvcCA9IGFzeW5jICgpID0+IHtcblx0XHRcdFx0aWYgKHRoaXMuZnJhbWUuaXNEZXN0cm95ZWQoKSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuY29ubmVjdGlvbi5zZW5kQ29tbWFuZCgnT3ZlcmxheS5zZXRJbnNwZWN0TW9kZScsIHtcblx0XHRcdFx0XHRcdG1vZGU6ICdub25lJyxcblx0XHRcdFx0XHRcdGhpZ2hsaWdodENvbmZpZzogeyBzaG93SW5mbzogZmFsc2UsIHNob3dTdHlsZXM6IGZhbHNlIH1cblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLmNvbm5lY3Rpb24uc2VuZENvbW1hbmQoJ092ZXJsYXkuaGlkZUhpZ2hsaWdodCcpO1xuXHRcdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0XHQvLyBCZXN0IGVmZm9ydC5cblx0XHRcdFx0fVxuXHRcdFx0fTtcblx0XHRcdHRoaXMuX2FjdGl2ZUluc3BlY3Rpb24udmFsdWUgPSB7XG5cdFx0XHRcdG1vZGUsXG5cdFx0XHRcdHN0b3AsXG5cdFx0XHRcdGRpc3Bvc2U6ICgpID0+IHtcblx0XHRcdFx0XHR2b2lkIHN0b3AoKTtcblx0XHRcdFx0fVxuXHRcdFx0fTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5mcmFtZS5wb3N0TWVzc2FnZSgndnNjb2RlOmJyb3dzZXJWaWV3OnN0YXJ0RWxlbWVudFBpY2tlcicsIG9wdGlvbnMpO1xuXHRcdFx0Y29uc3Qgc3RvcCA9IGFzeW5jICgpID0+IHtcblx0XHRcdFx0aWYgKCF0aGlzLmZyYW1lLmlzRGVzdHJveWVkKCkpIHtcblx0XHRcdFx0XHR0aGlzLmZyYW1lLnBvc3RNZXNzYWdlKCd2c2NvZGU6YnJvd3NlclZpZXc6c3RvcEVsZW1lbnRQaWNrZXInLCB7fSk7XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cdFx0XHR0aGlzLl9hY3RpdmVJbnNwZWN0aW9uLnZhbHVlID0ge1xuXHRcdFx0XHRtb2RlLFxuXHRcdFx0XHRzdG9wLFxuXHRcdFx0XHRkaXNwb3NlOiAoKSA9PiB7XG5cdFx0XHRcdFx0dm9pZCBzdG9wKCk7XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfc3RvcEluc3BlY3Rpb24oKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgYWN0aXZlSW5zcGVjdGlvbiA9IHRoaXMuX2FjdGl2ZUluc3BlY3Rpb24udmFsdWU7XG5cdFx0aWYgKGFjdGl2ZUluc3BlY3Rpb24pIHtcblx0XHRcdHRoaXMuX2FjdGl2ZUluc3BlY3Rpb24uY2xlYXJBbmRMZWFrKCk7XG5cdFx0XHRhd2FpdCBhY3RpdmVJbnNwZWN0aW9uLnN0b3AoKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogU3RvcCBlbGVtZW50IGluc3BlY3Rpb24gb24gdGhpcyBmcmFtZS5cblx0ICovXG5cdGFzeW5jIHN0b3BJbnNwZWN0aW9uKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMuX3N0b3BJbnNwZWN0aW9uKCk7XG5cdH1cblxuXHRzZXRFbGVtZW50Q29tbWVudHModXBkYXRlOiBJQnJvd3NlckVsZW1lbnRDb21tZW50c1VwZGF0ZSk6IHZvaWQge1xuXHRcdHRoaXMuX3VwZGF0ZUVsZW1lbnRDb21tZW50cyh1cGRhdGUpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlRWxlbWVudENvbW1lbnRzKHVwZGF0ZTogSUJyb3dzZXJFbGVtZW50Q29tbWVudHNVcGRhdGUpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuZnJhbWUuaXNEZXN0cm95ZWQoKSkge1xuXHRcdFx0dGhpcy5mcmFtZS5wb3N0TWVzc2FnZSgndnNjb2RlOmJyb3dzZXJWaWV3OnNldEVsZW1lbnRDb21tZW50cycsIHVwZGF0ZSk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFJlc29sdmUgYW4gZWxlbWVudCBieSBpdHMgcHJlbG9hZC10cmFja2VkIGlkIGFuZCBleHRyYWN0IGZ1bGwgbm9kZSBkYXRhLlxuXHQgKi9cblx0YXN5bmMgZXh0cmFjdE5vZGVEYXRhQnlJZChlbGVtZW50SWQ6IHN0cmluZyk6IFByb21pc2U8SUVsZW1lbnREYXRhPiB7XG5cdFx0Y29uc3QgeyByZXN1bHQgfSA9IGF3YWl0IHRoaXMuY29ubmVjdGlvbi5zZW5kQ29tbWFuZCgnUnVudGltZS5ldmFsdWF0ZScsIHtcblx0XHRcdGV4cHJlc3Npb246IGB3aW5kb3cuX192c2NvZGVfaGVscGVycz8uZ2V0RWxlbWVudCgke0pTT04uc3RyaW5naWZ5KGVsZW1lbnRJZCl9KWAsXG5cdFx0XHRyZXR1cm5CeVZhbHVlOiBmYWxzZSxcblx0XHRcdHVuaXF1ZUNvbnRleHRJZDogdGhpcy5fdW5pcXVlQ29udGV4dElkLFxuXHRcdH0pIGFzIHsgcmVzdWx0OiB7IG9iamVjdElkPzogc3RyaW5nIH0gfTtcblxuXHRcdGlmICghcmVzdWx0Py5vYmplY3RJZCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBFbGVtZW50IG5vdCBmb3VuZDogJHtlbGVtZW50SWR9YCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuZXh0cmFjdE5vZGVEYXRhKHsgb2JqZWN0SWQ6IHJlc3VsdC5vYmplY3RJZCB9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBFeHRyYWN0IGZ1bGwgZWxlbWVudCBkYXRhIGZyb20gYSBDRFAgbm9kZSByZWZlcmVuY2UuXG5cdCAqL1xuXHRhc3luYyBleHRyYWN0Tm9kZURhdGEoaWQ6IHsgYmFja2VuZE5vZGVJZD86IG51bWJlcjsgb2JqZWN0SWQ/OiBzdHJpbmcgfSk6IFByb21pc2U8SUVsZW1lbnREYXRhPiB7XG5cdFx0Y29uc3QgZGF0YSA9IGF3YWl0IGV4dHJhY3ROb2RlRGF0YSh0aGlzLmNvbm5lY3Rpb24sIGlkKTtcblx0XHRyZXR1cm4geyAuLi5kYXRhLCB1cmw6IHRoaXMuZnJhbWUudXJsIH07XG5cdH1cblxuXHQvKipcblx0ICogR2V0IHRoZSB2aXN1YWwgdmlld3BvcnQgc2NhbGUgZm9yIHRoaXMgZnJhbWUuXG5cdCAqL1xuXHRhc3luYyBnZXRWaXN1YWxWaWV3cG9ydFNjYWxlKCk6IFByb21pc2U8bnVtYmVyPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuY29ubmVjdGlvbi5zZW5kQ29tbWFuZCgnUGFnZS5nZXRMYXlvdXRNZXRyaWNzJykgYXMgSUxheW91dE1ldHJpY3NSZXN1bHQ7XG5cdFx0XHRpZiAodHlwZW9mIHJlc3VsdC5jc3NWaXN1YWxWaWV3cG9ydD8uc2NhbGUgPT09ICdudW1iZXInKSB7XG5cdFx0XHRcdGNvbnN0IHNjYWxlID0gTnVtYmVyKHJlc3VsdC5jc3NWaXN1YWxWaWV3cG9ydC5zY2FsZSk7XG5cdFx0XHRcdGlmIChOdW1iZXIuaXNGaW5pdGUoc2NhbGUpICYmIHNjYWxlID4gMCkge1xuXHRcdFx0XHRcdHJldHVybiBzY2FsZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0gY2F0Y2gge1xuXHRcdFx0Ly8gSWdub3JlIGV4ZWN1dGlvbiBlcnJvcnMgd2hpbGUgbG9hZGluZyBhbmQgdXNlIGRlZmF1bHRzLlxuXHRcdH1cblx0XHRyZXR1cm4gMTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDcmVhdGUgYSBoYW5kbGUgdG8gYW4gZWxlbWVudCB0cmFja2VkIGJ5IHRoZSBwcmVsb2FkIHNjcmlwdC5cblx0ICovXG5cdGdldEVsZW1lbnRIYW5kbGUoZWxlbWVudElkOiBzdHJpbmcpOiBJRnJhbWVFbGVtZW50SGFuZGxlIHtcblx0XHRsZXQgZGlzcG9zZWQgPSBmYWxzZTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0YWRkVG9DaGF0OiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IG5vZGVEYXRhID0gYXdhaXQgdGhpcy5leHRyYWN0Tm9kZURhdGFCeUlkKGVsZW1lbnRJZCk7XG5cdFx0XHRcdHRoaXMuX29uRGlkSW5zcGVjdEVsZW1lbnQuZmlyZShub2RlRGF0YSk7XG5cdFx0XHR9LFxuXHRcdFx0YWRkQ29tbWVudDogKCkgPT4ge1xuXHRcdFx0XHR0aGlzLmZyYW1lLnBvc3RNZXNzYWdlKCd2c2NvZGU6YnJvd3NlclZpZXc6c2hvd0VsZW1lbnRDb21tZW50JywgeyBlbGVtZW50SWQgfSk7XG5cdFx0XHR9LFxuXHRcdFx0aGlnaGxpZ2h0OiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdHRoaXMuZnJhbWUucG9zdE1lc3NhZ2UoJ3ZzY29kZTpicm93c2VyVmlldzpoaWdobGlnaHRFbGVtZW50JywgeyBlbGVtZW50SWQgfSk7XG5cdFx0XHR9LFxuXHRcdFx0aGlkZUhpZ2hsaWdodDogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHR0aGlzLmZyYW1lLnBvc3RNZXNzYWdlKCd2c2NvZGU6YnJvd3NlclZpZXc6aGlkZUhpZ2hsaWdodCcsIHt9KTtcblx0XHRcdH0sXG5cdFx0XHRkaXNwb3NlOiAoKSA9PiB7XG5cdFx0XHRcdGlmIChkaXNwb3NlZCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRkaXNwb3NlZCA9IHRydWU7XG5cdFx0XHRcdHRoaXMuZnJhbWUucG9zdE1lc3NhZ2UoJ3ZzY29kZTpicm93c2VyVmlldzpoaWRlSGlnaGxpZ2h0Jywge30pO1xuXHRcdFx0fVxuXHRcdH07XG5cdH1cbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGV4dHJhY3ROb2RlRGF0YShjb25uZWN0aW9uOiBJQ0RQQ29ubmVjdGlvbiwgaWQ6IHsgYmFja2VuZE5vZGVJZD86IG51bWJlcjsgb2JqZWN0SWQ/OiBzdHJpbmcgfSk6IFByb21pc2U8SUVsZW1lbnREYXRhPiB7XG5cdHVzaW5nIHN0b3JlID0gdXNlU2NvcGVkRGlzcG9zYWwoKTtcblxuXHRjb25zdCBkaXNjb3ZlcmVkTm9kZXNCeU5vZGVJZDogUmVjb3JkPG51bWJlciwgSU5vZGU+ID0ge307XG5cdHN0b3JlLmFkZChjb25uZWN0aW9uLm9uRXZlbnQoZXZlbnQgPT4ge1xuXHRcdGlmIChldmVudC5tZXRob2QgPT09ICdET00uc2V0Q2hpbGROb2RlcycpIHtcblx0XHRcdGNvbnN0IHsgbm9kZXMgfSA9IGV2ZW50LnBhcmFtcyBhcyB7IG5vZGVzOiBJTm9kZVtdIH07XG5cdFx0XHRmb3IgKGNvbnN0IG5vZGUgb2Ygbm9kZXMpIHtcblx0XHRcdFx0ZGlzY292ZXJlZE5vZGVzQnlOb2RlSWRbbm9kZS5ub2RlSWRdID0gbm9kZTtcblx0XHRcdFx0aWYgKG5vZGUuY2hpbGRyZW4pIHtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IGNoaWxkIG9mIG5vZGUuY2hpbGRyZW4pIHtcblx0XHRcdFx0XHRcdGRpc2NvdmVyZWROb2Rlc0J5Tm9kZUlkW2NoaWxkLm5vZGVJZF0gPSB7XG5cdFx0XHRcdFx0XHRcdC4uLmNoaWxkLFxuXHRcdFx0XHRcdFx0XHRwYXJlbnRJZDogbm9kZS5ub2RlSWRcblx0XHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChub2RlLnBzZXVkb0VsZW1lbnRzKSB7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBwc2V1ZG8gb2Ygbm9kZS5wc2V1ZG9FbGVtZW50cykge1xuXHRcdFx0XHRcdFx0ZGlzY292ZXJlZE5vZGVzQnlOb2RlSWRbcHNldWRvLm5vZGVJZF0gPSB7XG5cdFx0XHRcdFx0XHRcdC4uLnBzZXVkbyxcblx0XHRcdFx0XHRcdFx0cGFyZW50SWQ6IG5vZGUubm9kZUlkXG5cdFx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fSkpO1xuXG5cdGF3YWl0IGNvbm5lY3Rpb24uc2VuZENvbW1hbmQoJ0RPTS5nZXREb2N1bWVudCcpO1xuXG5cdGNvbnN0IHsgbm9kZSB9ID0gYXdhaXQgY29ubmVjdGlvbi5zZW5kQ29tbWFuZCgnRE9NLmRlc2NyaWJlTm9kZScsIGlkKSBhcyB7IG5vZGU6IElOb2RlIH07XG5cdGlmICghbm9kZSkge1xuXHRcdHRocm93IG5ldyBFcnJvcignRmFpbGVkIHRvIGRlc2NyaWJlIG5vZGUuJyk7XG5cdH1cblx0bGV0IG5vZGVJZCA9IG5vZGUubm9kZUlkO1xuXHRpZiAoIW5vZGVJZCkge1xuXHRcdGNvbnN0IHsgbm9kZUlkcyB9ID0gYXdhaXQgY29ubmVjdGlvbi5zZW5kQ29tbWFuZCgnRE9NLnB1c2hOb2Rlc0J5QmFja2VuZElkc1RvRnJvbnRlbmQnLCB7IGJhY2tlbmROb2RlSWRzOiBbbm9kZS5iYWNrZW5kTm9kZUlkXSB9KSBhcyB7IG5vZGVJZHM6IG51bWJlcltdIH07XG5cdFx0aWYgKCFub2RlSWRzPy5sZW5ndGgpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignRmFpbGVkIHRvIGdldCBub2RlIElELicpO1xuXHRcdH1cblx0XHRub2RlSWQgPSBub2RlSWRzWzBdO1xuXHR9XG5cblx0Y29uc3QgeyBtb2RlbCB9ID0gYXdhaXQgY29ubmVjdGlvbi5zZW5kQ29tbWFuZCgnRE9NLmdldEJveE1vZGVsJywgeyBub2RlSWQgfSkgYXMgeyBtb2RlbDogSUJveE1vZGVsIH07XG5cdGlmICghbW9kZWwpIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ0ZhaWxlZCB0byBnZXQgYm94IG1vZGVsLicpO1xuXHR9XG5cblx0Y29uc3QgY29udGVudCA9IG1vZGVsLmNvbnRlbnQ7XG5cdGNvbnN0IG1hcmdpbiA9IG1vZGVsLm1hcmdpbjtcblx0Y29uc3QgeCA9IE1hdGgubWluKG1hcmdpblswXSwgY29udGVudFswXSk7XG5cdGNvbnN0IHkgPSBNYXRoLm1pbihtYXJnaW5bMV0sIGNvbnRlbnRbMV0pO1xuXHRjb25zdCB3aWR0aCA9IE1hdGgubWF4KG1hcmdpblsyXSAtIG1hcmdpblswXSwgY29udGVudFsyXSAtIGNvbnRlbnRbMF0pO1xuXHRjb25zdCBoZWlnaHQgPSBNYXRoLm1heChtYXJnaW5bNV0gLSBtYXJnaW5bMV0sIGNvbnRlbnRbNV0gLSBjb250ZW50WzFdKTtcblxuXHRjb25zdCBtYXRjaGVkID0gYXdhaXQgY29ubmVjdGlvbi5zZW5kQ29tbWFuZCgnQ1NTLmdldE1hdGNoZWRTdHlsZXNGb3JOb2RlJywgeyBub2RlSWQgfSk7XG5cdGlmICghbWF0Y2hlZCkge1xuXHRcdHRocm93IG5ldyBFcnJvcignRmFpbGVkIHRvIGdldCBtYXRjaGVkIGNzcy4nKTtcblx0fVxuXG5cdGNvbnN0IHsgcnVsZXNUZXh0LCByZWZlcmVuY2VkVmFycywgYXV0aG9yUHJvcGVydHlOYW1lcywgdXNlckFnZW50UHJvcGVydHlOYW1lcyB9ID0gZm9ybWF0TWF0Y2hlZFN0eWxlcyhtYXRjaGVkIGFzIElNYXRjaGVkU3R5bGVzKTtcblx0Y29uc3QgeyBvdXRlckhUTUwgfSA9IGF3YWl0IGNvbm5lY3Rpb24uc2VuZENvbW1hbmQoJ0RPTS5nZXRPdXRlckhUTUwnLCB7IG5vZGVJZCB9KSBhcyB7IG91dGVySFRNTDogc3RyaW5nIH07XG5cdGlmICghb3V0ZXJIVE1MKSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdGYWlsZWQgdG8gZ2V0IG91dGVySFRNTC4nKTtcblx0fVxuXG5cdGNvbnN0IGF0dHJpYnV0ZXMgPSBhdHRyaWJ1dGVBcnJheVRvUmVjb3JkKG5vZGUuYXR0cmlidXRlcyk7XG5cblx0Y29uc3QgYW5jZXN0b3JzOiBJRWxlbWVudEFuY2VzdG9yW10gPSBbXTtcblx0bGV0IGN1cnJlbnROb2RlOiBJTm9kZSB8IHVuZGVmaW5lZCA9IGRpc2NvdmVyZWROb2Rlc0J5Tm9kZUlkW25vZGVJZF0gPz8gbm9kZTtcblx0d2hpbGUgKGN1cnJlbnROb2RlKSB7XG5cdFx0Y29uc3QgYXR0cmlidXRlcyA9IGF0dHJpYnV0ZUFycmF5VG9SZWNvcmQoY3VycmVudE5vZGUuYXR0cmlidXRlcyk7XG5cdFx0YW5jZXN0b3JzLnVuc2hpZnQoe1xuXHRcdFx0dGFnTmFtZTogY3VycmVudE5vZGUubG9jYWxOYW1lLFxuXHRcdFx0aWQ6IGF0dHJpYnV0ZXMuaWQsXG5cdFx0XHRjbGFzc05hbWVzOiBhdHRyaWJ1dGVzLmNsYXNzPy50cmltKCkuc3BsaXQoL1xccysvKS5maWx0ZXIoQm9vbGVhbilcblx0XHR9KTtcblx0XHRjdXJyZW50Tm9kZSA9IGN1cnJlbnROb2RlLnBhcmVudElkID8gZGlzY292ZXJlZE5vZGVzQnlOb2RlSWRbY3VycmVudE5vZGUucGFyZW50SWRdIDogdW5kZWZpbmVkO1xuXHR9XG5cblx0Ly8gQnVpbGQgdGhlIGNvbXB1dGVkIHN0eWxlIHN0cmluZyBhbmQgZmlsdGVyZWQgY29tcHV0ZWRTdHlsZXMgcmVjb3JkXG5cdGxldCBjb21wdXRlZFN0eWxlID0gcnVsZXNUZXh0O1xuXHRsZXQgY29tcHV0ZWRTdHlsZXM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gfCB1bmRlZmluZWQ7XG5cdHRyeSB7XG5cdFx0Y29uc3QgeyBjb21wdXRlZFN0eWxlOiBjb21wdXRlZFN0eWxlQXJyYXkgfSA9IGF3YWl0IGNvbm5lY3Rpb24uc2VuZENvbW1hbmQoJ0NTUy5nZXRDb21wdXRlZFN0eWxlRm9yTm9kZScsIHsgbm9kZUlkIH0pIGFzIHsgY29tcHV0ZWRTdHlsZT86IEFycmF5PHsgbmFtZTogc3RyaW5nOyB2YWx1ZTogc3RyaW5nIH0+IH07XG5cdFx0aWYgKGNvbXB1dGVkU3R5bGVBcnJheSkge1xuXHRcdFx0Y29tcHV0ZWRTdHlsZXMgPSB7fTtcblxuXHRcdFx0Ly8gQ29sbGVjdCByZXNvbHZlZCBwcm9wZXJ0eSB2YWx1ZXMgaW50byBhIG1hcCBmb3Igc2hvcnRoYW5kIGNvbGxhcHNpbmdcblx0XHRcdGNvbnN0IHJlc29sdmVkTWFwID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcblx0XHRcdGNvbnN0IHZhckxpbmVzOiBzdHJpbmdbXSA9IFtdO1xuXG5cdFx0XHRmb3IgKGNvbnN0IHByb3Agb2YgY29tcHV0ZWRTdHlsZUFycmF5KSB7XG5cdFx0XHRcdGlmICghcHJvcC5uYW1lIHx8IHR5cGVvZiBwcm9wLnZhbHVlICE9PSAnc3RyaW5nJykge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gSW5jbHVkZSBpbiBjb21wdXRlZFN0eWxlcyByZWNvcmQ6IHJlZmVyZW5jZWQgdmFycyArIGtleSBVSSBwcm9wZXJ0aWVzXG5cdFx0XHRcdGlmIChyZWZlcmVuY2VkVmFycy5oYXMocHJvcC5uYW1lKSB8fCBrZXlDb21wdXRlZFByb3BlcnRpZXMuaGFzKHByb3AubmFtZSkpIHtcblx0XHRcdFx0XHRjb21wdXRlZFN0eWxlc1twcm9wLm5hbWVdID0gcHJvcC52YWx1ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIEluY2x1ZGUgaW4gcmVzb2x2ZWQgdmFsdWVzOiBhbnkgcHJvcGVydHkgZXhwbGljaXRseSBzZXQgYnkgc3R5bGVzaGVldHNcblx0XHRcdFx0aWYgKGF1dGhvclByb3BlcnR5TmFtZXMuaGFzKHByb3AubmFtZSkpIHtcblx0XHRcdFx0XHRyZXNvbHZlZE1hcC5zZXQocHJvcC5uYW1lLCBwcm9wLnZhbHVlKTtcblx0XHRcdFx0fSBlbHNlIGlmICh1c2VyQWdlbnRQcm9wZXJ0eU5hbWVzLmhhcyhwcm9wLm5hbWUpKSB7XG5cdFx0XHRcdFx0cmVzb2x2ZWRNYXAuc2V0KHByb3AubmFtZSwgYCR7cHJvcC52YWx1ZX0gLypVQSovYCk7IC8vIE1hcmsgaXQgYXMgY29taW5nIGZyb20gVXNlciBBZ2VudCBzdHlsZXMuXG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBJbmNsdWRlIHJlZmVyZW5jZWQgQ1NTIHZhcmlhYmxlIHZhbHVlc1xuXHRcdFx0XHRpZiAocmVmZXJlbmNlZFZhcnMuaGFzKHByb3AubmFtZSkpIHtcblx0XHRcdFx0XHR2YXJMaW5lcy5wdXNoKGAke3Byb3AubmFtZX06ICR7cHJvcC52YWx1ZX07YCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKHJlc29sdmVkTWFwLnNpemUgPiAwKSB7XG5cdFx0XHRcdGNvbnN0IHJlc29sdmVkTGluZXMgPSBjb2xsYXBzZVRvU2hvcnRoYW5kcyhyZXNvbHZlZE1hcCk7XG5cdFx0XHRcdGNvbXB1dGVkU3R5bGUgKz0gJ1xcblxcbi8qIFJlc29sdmVkIHZhbHVlcyAqL1xcbicgKyByZXNvbHZlZExpbmVzLmpvaW4oJ1xcbicpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHZhckxpbmVzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0Y29tcHV0ZWRTdHlsZSArPSAnXFxuXFxuLyogQ1NTIHZhcmlhYmxlcyAqL1xcbicgKyB2YXJMaW5lcy5qb2luKCdcXG4nKTtcblx0XHRcdH1cblx0XHR9XG5cdH0gY2F0Y2ggeyB9XG5cblx0cmV0dXJuIHtcblx0XHRvdXRlckhUTUwsXG5cdFx0Y29tcHV0ZWRTdHlsZSxcblx0XHRib3VuZHM6IHsgeCwgeSwgd2lkdGgsIGhlaWdodCB9LFxuXHRcdGFuY2VzdG9ycyxcblx0XHRhdHRyaWJ1dGVzLFxuXHRcdGNvbXB1dGVkU3R5bGVzLFxuXHRcdGRpbWVuc2lvbnM6IHsgdG9wOiB5LCBsZWZ0OiB4LCB3aWR0aCwgaGVpZ2h0IH1cblx0fTtcbn1cblxuZnVuY3Rpb24gYXR0cmlidXRlQXJyYXlUb1JlY29yZChhdHRyaWJ1dGVzOiBzdHJpbmdbXSk6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4ge1xuXHRjb25zdCByZWNvcmQ6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7fTtcblx0Zm9yIChsZXQgaSA9IDA7IGkgPCBhdHRyaWJ1dGVzLmxlbmd0aDsgaSArPSAyKSB7XG5cdFx0Y29uc3QgbmFtZSA9IGF0dHJpYnV0ZXNbaV07XG5cdFx0Y29uc3QgdmFsdWUgPSBhdHRyaWJ1dGVzW2kgKyAxXTtcblx0XHRyZWNvcmRbbmFtZV0gPSB2YWx1ZTtcblx0fVxuXHRyZXR1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
