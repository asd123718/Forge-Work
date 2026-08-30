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
import { CancellationToken } from "../../../../../../base/common/cancellation.js";
import { Disposable } from "../../../../../../base/common/lifecycle.js";
import { derived, ObservableMap } from "../../../../../../base/common/observable.js";
import { isObject } from "../../../../../../base/common/types.js";
import { IInstantiationService } from "../../../../../../platform/instantiation/common/instantiation.js";
import { observableMemento } from "../../../../../../platform/observable/common/observableMemento.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../../../platform/storage/common/storage.js";
import { ChatModeKind } from "../../../common/constants.js";
import { PromptsStorage } from "../../../common/promptSyntax/service/promptsService.js";
import { ILanguageModelToolsService, isToolSet, ToolAndToolSetEnablementMap } from "../../../common/tools/languageModelToolsService.js";
import { PromptFileRewriter } from "../../promptSyntax/promptFileRewriter.js";
var ToolEnablementStates;
((ToolEnablementStates2) => {
  function fromMap(map) {
    const toolSets = /* @__PURE__ */ new Map(), tools = /* @__PURE__ */ new Map();
    for (const [entry, enabled] of map) {
      if (isToolSet(entry)) {
        toolSets.set(entry.id, enabled);
      } else {
        tools.set(entry.id, enabled);
      }
    }
    return { toolSets, tools };
  }
  ToolEnablementStates2.fromMap = fromMap;
  function isStoredDataV1(data) {
    return isObject(data) && data.version === void 0 && (data.disabledTools === void 0 || Array.isArray(data.disabledTools)) && (data.disabledToolSets === void 0 || Array.isArray(data.disabledToolSets));
  }
  function isStoredDataV2(data) {
    return isObject(data) && data.version === 2 && Array.isArray(data.toolSetEntries) && Array.isArray(data.toolEntries);
  }
  function fromStorage(storage) {
    try {
      const parsed = JSON.parse(storage);
      if (isStoredDataV2(parsed)) {
        return { toolSets: new Map(parsed.toolSetEntries), tools: new Map(parsed.toolEntries) };
      } else if (isStoredDataV1(parsed)) {
        const toolSetEntries = parsed.disabledToolSets?.map((id) => [id, false]);
        const toolEntries = parsed.disabledTools?.map((id) => [id, false]);
        return { toolSets: new Map(toolSetEntries), tools: new Map(toolEntries) };
      }
    } catch {
    }
    return { toolSets: /* @__PURE__ */ new Map(), tools: /* @__PURE__ */ new Map() };
  }
  ToolEnablementStates2.fromStorage = fromStorage;
  function toStorage(state) {
    const storageData = {
      version: 2,
      toolSetEntries: Array.from(state.toolSets.entries()),
      toolEntries: Array.from(state.tools.entries())
    };
    return JSON.stringify(storageData);
  }
  ToolEnablementStates2.toStorage = toStorage;
})(ToolEnablementStates || (ToolEnablementStates = {}));
var ToolsScope = /* @__PURE__ */ ((ToolsScope2) => {
  ToolsScope2[ToolsScope2["Global"] = 0] = "Global";
  ToolsScope2[ToolsScope2["Session"] = 1] = "Session";
  ToolsScope2[ToolsScope2["Agent"] = 2] = "Agent";
  ToolsScope2[ToolsScope2["Agent_ReadOnly"] = 3] = "Agent_ReadOnly";
  return ToolsScope2;
})(ToolsScope || {});
let ChatSelectedTools = class extends Disposable {
  constructor(_mode, languageModel, _toolsService, _storageService, _instantiationService) {
    super();
    this._mode = _mode;
    this.languageModel = languageModel;
    this._toolsService = _toolsService;
    this._instantiationService = _instantiationService;
    this._sessionStates = new ObservableMap();
    /**
     * All tools and tool sets with their enabled state.
     * Tools are filtered based on the current model context.
     */
    this.entriesMap = derived((r) => {
      const map = /* @__PURE__ */ new Map();
      const lm = this.languageModel.read(r)?.metadata;
      const currentMode = this._mode.read(r);
      let currentMap = this._sessionStates.observable.read(r).get(currentMode.id);
      if (!currentMap && currentMode.kind === ChatModeKind.Agent) {
        const modeTools = currentMode.customTools?.read(r);
        if (modeTools) {
          currentMap = ToolEnablementStates.fromMap(this._toolsService.toToolAndToolSetEnablementMap(modeTools, lm));
        }
      }
      if (!currentMap) {
        currentMap = this._globalState.read(r);
      }
      for (const tool of this._currentTools.read(r)) {
        if (tool.canBeReferencedInPrompt) {
          map.set(tool, currentMap.tools.get(tool.id) !== false);
        }
      }
      for (const toolSet of this._toolsService.getToolSetsForModel(lm, r)) {
        if (toolSet.hiddenInToolsPicker) {
          continue;
        }
        const toolSetEnabled = currentMap.toolSets.get(toolSet.id) !== false;
        map.set(toolSet, toolSetEnabled);
        for (const tool of toolSet.getTools(r)) {
          map.set(tool, toolSetEnabled || currentMap.tools.get(tool.id) === true);
        }
      }
      return ToolAndToolSetEnablementMap.fromMap(map);
    });
    this.userSelectedTools = derived((r) => {
      const result = {};
      const map = this.entriesMap.read(r);
      for (const [item, enabled] of map) {
        if (!isToolSet(item)) {
          result[item.id] = enabled;
        }
      }
      return result;
    });
    const globalStateMemento = observableMemento({
      key: "chat/selectedTools",
      defaultValue: { toolSets: /* @__PURE__ */ new Map(), tools: /* @__PURE__ */ new Map() },
      fromStorage: ToolEnablementStates.fromStorage,
      toStorage: ToolEnablementStates.toStorage
    });
    this._globalState = this._store.add(globalStateMemento(StorageScope.PROFILE, StorageTarget.MACHINE, _storageService));
    this._currentTools = languageModel.map((lm) => _toolsService.observeTools(lm?.metadata)).map((o, r) => o.read(r));
  }
  get entriesScope() {
    const mode = this._mode.get();
    if (this._sessionStates.has(mode.id)) {
      return 1 /* Session */;
    }
    if (mode.kind === ChatModeKind.Agent && mode.customTools?.get() && mode.uri) {
      return mode.source?.storage !== PromptsStorage.extension ? 2 /* Agent */ : 3 /* Agent_ReadOnly */;
    }
    return 0 /* Global */;
  }
  get currentMode() {
    return this._mode.get();
  }
  resetSessionEnablementState() {
    const mode = this._mode.get();
    this._sessionStates.delete(mode.id);
  }
  set(enablementMap, sessionOnly) {
    const mode = this._mode.get();
    if (sessionOnly || this._sessionStates.has(mode.id)) {
      this._sessionStates.set(mode.id, ToolEnablementStates.fromMap(enablementMap));
      return;
    }
    if (mode.kind === ChatModeKind.Agent && mode.customTools?.get() && mode.uri) {
      if (mode.source?.storage !== PromptsStorage.extension) {
        this.updateCustomModeTools(mode.uri.get(), enablementMap);
        return;
      } else {
        this._sessionStates.set(mode.id, ToolEnablementStates.fromMap(enablementMap));
        return;
      }
    }
    this._globalState.set(ToolEnablementStates.fromMap(enablementMap), void 0);
  }
  async updateCustomModeTools(uri, enablementMap) {
    await this._instantiationService.createInstance(PromptFileRewriter).openAndRewriteTools(uri, enablementMap, CancellationToken.None);
  }
};
ChatSelectedTools = __decorateClass([
  __decorateParam(2, ILanguageModelToolsService),
  __decorateParam(3, IStorageService),
  __decorateParam(4, IInstantiationService)
], ChatSelectedTools);
export {
  ChatSelectedTools,
  ToolsScope
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXHdpZGdldFxcaW5wdXRcXGNoYXRTZWxlY3RlZFRvb2xzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBkZXJpdmVkLCBJT2JzZXJ2YWJsZSwgT2JzZXJ2YWJsZU1hcCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgaXNPYmplY3QgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBPYnNlcnZhYmxlTWVtZW50bywgb2JzZXJ2YWJsZU1lbWVudG8gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9vYnNlcnZhYmxlL2NvbW1vbi9vYnNlcnZhYmxlTWVtZW50by5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSUNoYXRNb2RlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NoYXRNb2Rlcy5qcyc7XG5pbXBvcnQgeyBDaGF0TW9kZUtpbmQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhQW5kSWRlbnRpZmllciB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZU1vZGVscy5qcyc7XG5pbXBvcnQgeyBVc2VyU2VsZWN0ZWRUb29scyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9wYXJ0aWNpcGFudHMvY2hhdEFnZW50cy5qcyc7XG5pbXBvcnQgeyBQcm9tcHRzU3RvcmFnZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9wcm9tcHRTeW50YXgvc2VydmljZS9wcm9tcHRzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSwgSVRvb2xEYXRhLCBpc1Rvb2xTZXQsIFRvb2xBbmRUb29sU2V0RW5hYmxlbWVudE1hcCwgSVRvb2xTZXQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdG9vbHMvbGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBQcm9tcHRGaWxlUmV3cml0ZXIgfSBmcm9tICcuLi8uLi9wcm9tcHRTeW50YXgvcHJvbXB0RmlsZVJld3JpdGVyLmpzJztcblxuXG4vLyB0b2RvQGNvbm5vcjQzMTIvYmhhdnlhdXM6IG1ha2UgdG9vbHMga2V5IG9mZiBkaXNwbGF5TmFtZSBzbyBtb2RlbC1zcGVjaWZpYyB0b29sXG4vLyBlbmFibGVtZW50IGNhbiBzdGljayBiZXR3ZWVuIG1vZGVscyB3aXRoIGRpZmZlcmVudCB1bmRlcmx5aW5nIHRvb2wgZGVmaW5pdGlvbnNcbnR5cGUgVG9vbEVuYWJsZW1lbnRTdGF0ZXMgPSB7XG5cdHJlYWRvbmx5IHRvb2xTZXRzOiBSZWFkb25seU1hcDxzdHJpbmcsIGJvb2xlYW4+O1xuXHRyZWFkb25seSB0b29sczogUmVhZG9ubHlNYXA8c3RyaW5nLCBib29sZWFuPjtcbn07XG5cbnR5cGUgU3RvcmVkRGF0YVYyID0ge1xuXHRyZWFkb25seSB2ZXJzaW9uOiAyO1xuXHRyZWFkb25seSB0b29sU2V0RW50cmllczogW3N0cmluZywgYm9vbGVhbl1bXTtcblx0cmVhZG9ubHkgdG9vbEVudHJpZXM6IFtzdHJpbmcsIGJvb2xlYW5dW107XG59O1xuXG50eXBlIFN0b3JlZERhdGFWMSA9IHtcblx0cmVhZG9ubHkgdmVyc2lvbjogdW5kZWZpbmVkO1xuXHRyZWFkb25seSBkaXNhYmxlZFRvb2xTZXRzPzogc3RyaW5nW107XG5cdHJlYWRvbmx5IGRpc2FibGVkVG9vbHM/OiBzdHJpbmdbXTtcbn07XG5cbm5hbWVzcGFjZSBUb29sRW5hYmxlbWVudFN0YXRlcyB7XG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tTWFwKG1hcDogVG9vbEFuZFRvb2xTZXRFbmFibGVtZW50TWFwKTogVG9vbEVuYWJsZW1lbnRTdGF0ZXMge1xuXHRcdGNvbnN0IHRvb2xTZXRzOiBNYXA8c3RyaW5nLCBib29sZWFuPiA9IG5ldyBNYXAoKSwgdG9vbHM6IE1hcDxzdHJpbmcsIGJvb2xlYW4+ID0gbmV3IE1hcCgpO1xuXHRcdGZvciAoY29uc3QgW2VudHJ5LCBlbmFibGVkXSBvZiBtYXApIHtcblx0XHRcdGlmIChpc1Rvb2xTZXQoZW50cnkpKSB7XG5cdFx0XHRcdHRvb2xTZXRzLnNldChlbnRyeS5pZCwgZW5hYmxlZCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0b29scy5zZXQoZW50cnkuaWQsIGVuYWJsZWQpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4geyB0b29sU2V0cywgdG9vbHMgfTtcblx0fVxuXG5cdGZ1bmN0aW9uIGlzU3RvcmVkRGF0YVYxKGRhdGE6IFN0b3JlZERhdGFWMSB8IFN0b3JlZERhdGFWMiB8IHVuZGVmaW5lZCk6IGRhdGEgaXMgU3RvcmVkRGF0YVYxIHtcblx0XHRyZXR1cm4gaXNPYmplY3QoZGF0YSkgJiYgZGF0YS52ZXJzaW9uID09PSB1bmRlZmluZWRcblx0XHRcdCYmIChkYXRhLmRpc2FibGVkVG9vbHMgPT09IHVuZGVmaW5lZCB8fCBBcnJheS5pc0FycmF5KGRhdGEuZGlzYWJsZWRUb29scykpXG5cdFx0XHQmJiAoZGF0YS5kaXNhYmxlZFRvb2xTZXRzID09PSB1bmRlZmluZWQgfHwgQXJyYXkuaXNBcnJheShkYXRhLmRpc2FibGVkVG9vbFNldHMpKTtcblx0fVxuXG5cdGZ1bmN0aW9uIGlzU3RvcmVkRGF0YVYyKGRhdGE6IFN0b3JlZERhdGFWMSB8IFN0b3JlZERhdGFWMiB8IHVuZGVmaW5lZCk6IGRhdGEgaXMgU3RvcmVkRGF0YVYyIHtcblx0XHRyZXR1cm4gaXNPYmplY3QoZGF0YSkgJiYgZGF0YS52ZXJzaW9uID09PSAyICYmIEFycmF5LmlzQXJyYXkoZGF0YS50b29sU2V0RW50cmllcykgJiYgQXJyYXkuaXNBcnJheShkYXRhLnRvb2xFbnRyaWVzKTtcblx0fVxuXG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tU3RvcmFnZShzdG9yYWdlOiBzdHJpbmcpOiBUb29sRW5hYmxlbWVudFN0YXRlcyB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHBhcnNlZCA9IEpTT04ucGFyc2Uoc3RvcmFnZSk7XG5cdFx0XHRpZiAoaXNTdG9yZWREYXRhVjIocGFyc2VkKSkge1xuXHRcdFx0XHRyZXR1cm4geyB0b29sU2V0czogbmV3IE1hcChwYXJzZWQudG9vbFNldEVudHJpZXMpLCB0b29sczogbmV3IE1hcChwYXJzZWQudG9vbEVudHJpZXMpIH07XG5cdFx0XHR9IGVsc2UgaWYgKGlzU3RvcmVkRGF0YVYxKHBhcnNlZCkpIHtcblx0XHRcdFx0Y29uc3QgdG9vbFNldEVudHJpZXMgPSBwYXJzZWQuZGlzYWJsZWRUb29sU2V0cz8ubWFwKGlkID0+IFtpZCwgZmFsc2VdIGFzIFtzdHJpbmcsIGJvb2xlYW5dKTtcblx0XHRcdFx0Y29uc3QgdG9vbEVudHJpZXMgPSBwYXJzZWQuZGlzYWJsZWRUb29scz8ubWFwKGlkID0+IFtpZCwgZmFsc2VdIGFzIFtzdHJpbmcsIGJvb2xlYW5dKTtcblx0XHRcdFx0cmV0dXJuIHsgdG9vbFNldHM6IG5ldyBNYXAodG9vbFNldEVudHJpZXMpLCB0b29sczogbmV3IE1hcCh0b29sRW50cmllcykgfTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIHtcblx0XHRcdC8vIGlnbm9yZVxuXHRcdH1cblx0XHQvLyBpbnZhbGlkIGRhdGFcblx0XHRyZXR1cm4geyB0b29sU2V0czogbmV3IE1hcCgpLCB0b29sczogbmV3IE1hcCgpIH07XG5cdH1cblxuXHRleHBvcnQgZnVuY3Rpb24gdG9TdG9yYWdlKHN0YXRlOiBUb29sRW5hYmxlbWVudFN0YXRlcyk6IHN0cmluZyB7XG5cdFx0Y29uc3Qgc3RvcmFnZURhdGE6IFN0b3JlZERhdGFWMiA9IHtcblx0XHRcdHZlcnNpb246IDIsXG5cdFx0XHR0b29sU2V0RW50cmllczogQXJyYXkuZnJvbShzdGF0ZS50b29sU2V0cy5lbnRyaWVzKCkpLFxuXHRcdFx0dG9vbEVudHJpZXM6IEFycmF5LmZyb20oc3RhdGUudG9vbHMuZW50cmllcygpKVxuXHRcdH07XG5cdFx0cmV0dXJuIEpTT04uc3RyaW5naWZ5KHN0b3JhZ2VEYXRhKTtcblx0fVxufVxuXG5leHBvcnQgZW51bSBUb29sc1Njb3BlIHtcblx0R2xvYmFsLFxuXHRTZXNzaW9uLFxuXHRBZ2VudCxcblx0QWdlbnRfUmVhZE9ubHksXG59XG5cbmV4cG9ydCBjbGFzcyBDaGF0U2VsZWN0ZWRUb29scyBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2dsb2JhbFN0YXRlOiBPYnNlcnZhYmxlTWVtZW50bzxUb29sRW5hYmxlbWVudFN0YXRlcz47XG5cblx0cHJpdmF0ZSByZWFkb25seSBfc2Vzc2lvblN0YXRlcyA9IG5ldyBPYnNlcnZhYmxlTWFwPHN0cmluZywgVG9vbEVuYWJsZW1lbnRTdGF0ZXMgfCB1bmRlZmluZWQ+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2N1cnJlbnRUb29sczogSU9ic2VydmFibGU8cmVhZG9ubHkgSVRvb2xEYXRhW10+O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX21vZGU6IElPYnNlcnZhYmxlPElDaGF0TW9kZT4sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBsYW5ndWFnZU1vZGVsOiBJT2JzZXJ2YWJsZTxJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YUFuZElkZW50aWZpZXIgfCB1bmRlZmluZWQ+LFxuXHRcdEBJTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90b29sc1NlcnZpY2U6IElMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2UgX3N0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9pbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0Y29uc3QgZ2xvYmFsU3RhdGVNZW1lbnRvID0gb2JzZXJ2YWJsZU1lbWVudG88VG9vbEVuYWJsZW1lbnRTdGF0ZXM+KHtcblx0XHRcdGtleTogJ2NoYXQvc2VsZWN0ZWRUb29scycsXG5cdFx0XHRkZWZhdWx0VmFsdWU6IHsgdG9vbFNldHM6IG5ldyBNYXAoKSwgdG9vbHM6IG5ldyBNYXAoKSB9LFxuXHRcdFx0ZnJvbVN0b3JhZ2U6IFRvb2xFbmFibGVtZW50U3RhdGVzLmZyb21TdG9yYWdlLFxuXHRcdFx0dG9TdG9yYWdlOiBUb29sRW5hYmxlbWVudFN0YXRlcy50b1N0b3JhZ2Vcblx0XHR9KTtcblxuXHRcdHRoaXMuX2dsb2JhbFN0YXRlID0gdGhpcy5fc3RvcmUuYWRkKGdsb2JhbFN0YXRlTWVtZW50byhTdG9yYWdlU2NvcGUuUFJPRklMRSwgU3RvcmFnZVRhcmdldC5NQUNISU5FLCBfc3RvcmFnZVNlcnZpY2UpKTtcblx0XHR0aGlzLl9jdXJyZW50VG9vbHMgPSBsYW5ndWFnZU1vZGVsLm1hcChsbSA9PlxuXHRcdFx0X3Rvb2xzU2VydmljZS5vYnNlcnZlVG9vbHMobG0/Lm1ldGFkYXRhKSkubWFwKChvLCByKSA9PiBvLnJlYWQocikpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEFsbCB0b29scyBhbmQgdG9vbCBzZXRzIHdpdGggdGhlaXIgZW5hYmxlZCBzdGF0ZS5cblx0ICogVG9vbHMgYXJlIGZpbHRlcmVkIGJhc2VkIG9uIHRoZSBjdXJyZW50IG1vZGVsIGNvbnRleHQuXG5cdCAqL1xuXHRwdWJsaWMgcmVhZG9ubHkgZW50cmllc01hcDogSU9ic2VydmFibGU8VG9vbEFuZFRvb2xTZXRFbmFibGVtZW50TWFwPiA9IGRlcml2ZWQociA9PiB7XG5cdFx0Y29uc3QgbWFwID0gbmV3IE1hcDxJVG9vbERhdGEgfCBJVG9vbFNldCwgYm9vbGVhbj4oKTtcblx0XHRjb25zdCBsbSA9IHRoaXMubGFuZ3VhZ2VNb2RlbC5yZWFkKHIpPy5tZXRhZGF0YTtcblxuXHRcdC8vIGxvb2sgdXAgdGhlIHRvb2xzIGluIHRoZSBoaWVyYXJjaHk6IHNlc3Npb24gPiBtb2RlID4gZ2xvYmFsXG5cdFx0Y29uc3QgY3VycmVudE1vZGUgPSB0aGlzLl9tb2RlLnJlYWQocik7XG5cdFx0bGV0IGN1cnJlbnRNYXAgPSB0aGlzLl9zZXNzaW9uU3RhdGVzLm9ic2VydmFibGUucmVhZChyKS5nZXQoY3VycmVudE1vZGUuaWQpO1xuXHRcdGlmICghY3VycmVudE1hcCAmJiBjdXJyZW50TW9kZS5raW5kID09PSBDaGF0TW9kZUtpbmQuQWdlbnQpIHtcblx0XHRcdGNvbnN0IG1vZGVUb29scyA9IGN1cnJlbnRNb2RlLmN1c3RvbVRvb2xzPy5yZWFkKHIpO1xuXHRcdFx0aWYgKG1vZGVUb29scykge1xuXHRcdFx0XHRjdXJyZW50TWFwID0gVG9vbEVuYWJsZW1lbnRTdGF0ZXMuZnJvbU1hcCh0aGlzLl90b29sc1NlcnZpY2UudG9Ub29sQW5kVG9vbFNldEVuYWJsZW1lbnRNYXAobW9kZVRvb2xzLCBsbSkpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAoIWN1cnJlbnRNYXApIHtcblx0XHRcdGN1cnJlbnRNYXAgPSB0aGlzLl9nbG9iYWxTdGF0ZS5yZWFkKHIpO1xuXHRcdH1cblx0XHQvLyBVc2UgZ2V0VG9vbHMgd2l0aCBjb250ZXh0S2V5U2VydmljZSB0byBmaWx0ZXIgdG9vbHMgYnkgY3VycmVudCBtb2RlbFxuXHRcdGZvciAoY29uc3QgdG9vbCBvZiB0aGlzLl9jdXJyZW50VG9vbHMucmVhZChyKSkge1xuXHRcdFx0aWYgKHRvb2wuY2FuQmVSZWZlcmVuY2VkSW5Qcm9tcHQpIHtcblx0XHRcdFx0bWFwLnNldCh0b29sLCBjdXJyZW50TWFwLnRvb2xzLmdldCh0b29sLmlkKSAhPT0gZmFsc2UpOyAvLyBpZiB1bmtub3duLCBpdCdzIGVuYWJsZWRcblx0XHRcdH1cblx0XHR9XG5cdFx0Zm9yIChjb25zdCB0b29sU2V0IG9mIHRoaXMuX3Rvb2xzU2VydmljZS5nZXRUb29sU2V0c0Zvck1vZGVsKGxtLCByKSkge1xuXHRcdFx0Ly8gSGlkZGVuIHRvb2wgc2V0cyAoZS5nLiB0aGUgYnVpbHQtaW4gY2xpZW50IHRvb2wgc2V0cyB0aGF0IG9ubHkgZXhpc3QgdG8gZ3JvdXAgdG9vbHNcblx0XHRcdC8vIGluIHRoZSBDaGF0IEN1c3RvbWl6YXRpb25zIFVJKSBjYW4ndCBiZSB0b2dnbGVkIGhlcmUgYW5kIGFyZSBpZ25vcmVkIGJ5IHRoZSBwaWNrZXIuXG5cdFx0XHQvLyBUaGVpciBtZW1iZXIgdG9vbHMgYXJlIGFscmVhZHkgcmVzb2x2ZWQgYnkgdGhlIGxvb3AgYWJvdmUsIHNvIHNraXAgdGhlbSBlbnRpcmVseSAtXG5cdFx0XHQvLyBvdGhlcndpc2UgdGhleSdkIG92ZXJyaWRlIGluZGl2aWR1YWwgdG9vbCBzdGF0ZSBhbmQgcmUtZW5hYmxlIGRpc2FibGVkIHRvb2xzLlxuXHRcdFx0aWYgKHRvb2xTZXQuaGlkZGVuSW5Ub29sc1BpY2tlcikge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHRvb2xTZXRFbmFibGVkID0gY3VycmVudE1hcC50b29sU2V0cy5nZXQodG9vbFNldC5pZCkgIT09IGZhbHNlOyAvLyBpZiB1bmtub3duLCBpdCdzIGVuYWJsZWRcblx0XHRcdG1hcC5zZXQodG9vbFNldCwgdG9vbFNldEVuYWJsZWQpO1xuXHRcdFx0Zm9yIChjb25zdCB0b29sIG9mIHRvb2xTZXQuZ2V0VG9vbHMocikpIHtcblx0XHRcdFx0bWFwLnNldCh0b29sLCB0b29sU2V0RW5hYmxlZCB8fCBjdXJyZW50TWFwLnRvb2xzLmdldCh0b29sLmlkKSA9PT0gdHJ1ZSk7IC8vIGlmIHVua25vd24sIHVzZSB0b29sU2V0RW5hYmxlZFxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gVG9vbEFuZFRvb2xTZXRFbmFibGVtZW50TWFwLmZyb21NYXAobWFwKTtcblx0fSk7XG5cblx0cHVibGljIHJlYWRvbmx5IHVzZXJTZWxlY3RlZFRvb2xzOiBJT2JzZXJ2YWJsZTxVc2VyU2VsZWN0ZWRUb29scz4gPSBkZXJpdmVkKHIgPT4ge1xuXHRcdC8vIGV4dHJhY3QgYSBtYXAgb2YgdG9vbCBpZHNcblx0XHRjb25zdCByZXN1bHQ6IFVzZXJTZWxlY3RlZFRvb2xzID0ge307XG5cdFx0Y29uc3QgbWFwID0gdGhpcy5lbnRyaWVzTWFwLnJlYWQocik7XG5cdFx0Zm9yIChjb25zdCBbaXRlbSwgZW5hYmxlZF0gb2YgbWFwKSB7XG5cdFx0XHRpZiAoIWlzVG9vbFNldChpdGVtKSkge1xuXHRcdFx0XHRyZXN1bHRbaXRlbS5pZF0gPSBlbmFibGVkO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9KTtcblxuXHRnZXQgZW50cmllc1Njb3BlKCkge1xuXHRcdGNvbnN0IG1vZGUgPSB0aGlzLl9tb2RlLmdldCgpO1xuXHRcdGlmICh0aGlzLl9zZXNzaW9uU3RhdGVzLmhhcyhtb2RlLmlkKSkge1xuXHRcdFx0cmV0dXJuIFRvb2xzU2NvcGUuU2Vzc2lvbjtcblx0XHR9XG5cdFx0aWYgKG1vZGUua2luZCA9PT0gQ2hhdE1vZGVLaW5kLkFnZW50ICYmIG1vZGUuY3VzdG9tVG9vbHM/LmdldCgpICYmIG1vZGUudXJpKSB7XG5cdFx0XHRyZXR1cm4gbW9kZS5zb3VyY2U/LnN0b3JhZ2UgIT09IFByb21wdHNTdG9yYWdlLmV4dGVuc2lvbiA/IFRvb2xzU2NvcGUuQWdlbnQgOiBUb29sc1Njb3BlLkFnZW50X1JlYWRPbmx5O1xuXHRcdH1cblx0XHRyZXR1cm4gVG9vbHNTY29wZS5HbG9iYWw7XG5cdH1cblxuXHRnZXQgY3VycmVudE1vZGUoKTogSUNoYXRNb2RlIHtcblx0XHRyZXR1cm4gdGhpcy5fbW9kZS5nZXQoKTtcblx0fVxuXG5cdHJlc2V0U2Vzc2lvbkVuYWJsZW1lbnRTdGF0ZSgpIHtcblx0XHRjb25zdCBtb2RlID0gdGhpcy5fbW9kZS5nZXQoKTtcblx0XHR0aGlzLl9zZXNzaW9uU3RhdGVzLmRlbGV0ZShtb2RlLmlkKTtcblx0fVxuXG5cdHNldChlbmFibGVtZW50TWFwOiBUb29sQW5kVG9vbFNldEVuYWJsZW1lbnRNYXAsIHNlc3Npb25Pbmx5OiBib29sZWFuKTogdm9pZCB7XG5cdFx0Y29uc3QgbW9kZSA9IHRoaXMuX21vZGUuZ2V0KCk7XG5cdFx0aWYgKHNlc3Npb25Pbmx5IHx8IHRoaXMuX3Nlc3Npb25TdGF0ZXMuaGFzKG1vZGUuaWQpKSB7XG5cdFx0XHR0aGlzLl9zZXNzaW9uU3RhdGVzLnNldChtb2RlLmlkLCBUb29sRW5hYmxlbWVudFN0YXRlcy5mcm9tTWFwKGVuYWJsZW1lbnRNYXApKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKG1vZGUua2luZCA9PT0gQ2hhdE1vZGVLaW5kLkFnZW50ICYmIG1vZGUuY3VzdG9tVG9vbHM/LmdldCgpICYmIG1vZGUudXJpKSB7XG5cdFx0XHRpZiAobW9kZS5zb3VyY2U/LnN0b3JhZ2UgIT09IFByb21wdHNTdG9yYWdlLmV4dGVuc2lvbikge1xuXHRcdFx0XHQvLyBhcHBseSBkaXJlY3RseSB0byBtb2RlIGZpbGUuXG5cdFx0XHRcdHRoaXMudXBkYXRlQ3VzdG9tTW9kZVRvb2xzKG1vZGUudXJpLmdldCgpLCBlbmFibGVtZW50TWFwKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8gY2FuIG5vdCB3cml0ZSB0byBleHRlbnNpb25zLCBzdG9yZVxuXHRcdFx0XHR0aGlzLl9zZXNzaW9uU3RhdGVzLnNldChtb2RlLmlkLCBUb29sRW5hYmxlbWVudFN0YXRlcy5mcm9tTWFwKGVuYWJsZW1lbnRNYXApKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH1cblx0XHR0aGlzLl9nbG9iYWxTdGF0ZS5zZXQoVG9vbEVuYWJsZW1lbnRTdGF0ZXMuZnJvbU1hcChlbmFibGVtZW50TWFwKSwgdW5kZWZpbmVkKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgdXBkYXRlQ3VzdG9tTW9kZVRvb2xzKHVyaTogVVJJLCBlbmFibGVtZW50TWFwOiBUb29sQW5kVG9vbFNldEVuYWJsZW1lbnRNYXApOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShQcm9tcHRGaWxlUmV3cml0ZXIpLm9wZW5BbmRSZXdyaXRlVG9vbHModXJpLCBlbmFibGVtZW50TWFwLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLFNBQXNCLHFCQUFxQjtBQUNwRCxTQUFTLGdCQUFnQjtBQUV6QixTQUFTLDZCQUE2QjtBQUN0QyxTQUE0Qix5QkFBeUI7QUFDckQsU0FBUyxpQkFBaUIsY0FBYyxxQkFBcUI7QUFFN0QsU0FBUyxvQkFBb0I7QUFHN0IsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyw0QkFBdUMsV0FBVyxtQ0FBNkM7QUFDeEcsU0FBUywwQkFBMEI7QUFzQm5DLElBQVU7QUFBQSxDQUFWLENBQVVBLDBCQUFWO0FBQ1EsV0FBUyxRQUFRLEtBQXdEO0FBQy9FLFVBQU0sV0FBaUMsb0JBQUksSUFBSSxHQUFHLFFBQThCLG9CQUFJLElBQUk7QUFDeEYsZUFBVyxDQUFDLE9BQU8sT0FBTyxLQUFLLEtBQUs7QUFDbkMsVUFBSSxVQUFVLEtBQUssR0FBRztBQUNyQixpQkFBUyxJQUFJLE1BQU0sSUFBSSxPQUFPO0FBQUEsTUFDL0IsT0FBTztBQUNOLGNBQU0sSUFBSSxNQUFNLElBQUksT0FBTztBQUFBLE1BQzVCO0FBQUEsSUFDRDtBQUNBLFdBQU8sRUFBRSxVQUFVLE1BQU07QUFBQSxFQUMxQjtBQVZPLEVBQUFBLHNCQUFTO0FBWWhCLFdBQVMsZUFBZSxNQUFxRTtBQUM1RixXQUFPLFNBQVMsSUFBSSxLQUFLLEtBQUssWUFBWSxXQUNyQyxLQUFLLGtCQUFrQixVQUFhLE1BQU0sUUFBUSxLQUFLLGFBQWEsT0FDcEUsS0FBSyxxQkFBcUIsVUFBYSxNQUFNLFFBQVEsS0FBSyxnQkFBZ0I7QUFBQSxFQUNoRjtBQUVBLFdBQVMsZUFBZSxNQUFxRTtBQUM1RixXQUFPLFNBQVMsSUFBSSxLQUFLLEtBQUssWUFBWSxLQUFLLE1BQU0sUUFBUSxLQUFLLGNBQWMs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
