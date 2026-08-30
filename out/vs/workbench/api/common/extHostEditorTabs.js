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
import { diffSets } from "../../../base/common/collections.js";
import { Emitter } from "../../../base/common/event.js";
import { assertReturnsDefined } from "../../../base/common/types.js";
import { URI } from "../../../base/common/uri.js";
import { createDecorator } from "../../../platform/instantiation/common/instantiation.js";
import { MainContext, TabInputKind, TabModelOperationKind } from "./extHost.protocol.js";
import { IExtHostRpcService } from "./extHostRpcService.js";
import * as typeConverters from "./extHostTypeConverters.js";
import { ChatEditorTabInput, CustomEditorTabInput, InteractiveWindowInput, NotebookDiffEditorTabInput, NotebookEditorTabInput, TerminalEditorTabInput, TextDiffTabInput, TextMergeTabInput, TextTabInput, WebviewEditorTabInput, TextMultiDiffTabInput } from "./extHostTypes.js";
const IExtHostEditorTabs = createDecorator("IExtHostEditorTabs");
class ExtHostEditorTab {
  constructor(dto, parentGroup, activeTabIdGetter) {
    this._activeTabIdGetter = activeTabIdGetter;
    this._parentGroup = parentGroup;
    this.acceptDtoUpdate(dto);
  }
  get apiObject() {
    if (!this._apiObject) {
      const that = this;
      const obj = {
        get isActive() {
          return that._dto.id === that._activeTabIdGetter();
        },
        get label() {
          return that._dto.label;
        },
        get input() {
          return that._input;
        },
        get isDirty() {
          return that._dto.isDirty;
        },
        get isPinned() {
          return that._dto.isPinned;
        },
        get isPreview() {
          return that._dto.isPreview;
        },
        get group() {
          return that._parentGroup.apiObject;
        }
      };
      this._apiObject = Object.freeze(obj);
    }
    return this._apiObject;
  }
  get tabId() {
    return this._dto.id;
  }
  acceptDtoUpdate(dto) {
    this._dto = dto;
    this._input = this._initInput();
  }
  _initInput() {
    switch (this._dto.input.kind) {
      case TabInputKind.TextInput:
        return new TextTabInput(URI.revive(this._dto.input.uri));
      case TabInputKind.TextDiffInput:
        return new TextDiffTabInput(URI.revive(this._dto.input.original), URI.revive(this._dto.input.modified));
      case TabInputKind.TextMergeInput:
        return new TextMergeTabInput(URI.revive(this._dto.input.base), URI.revive(this._dto.input.input1), URI.revive(this._dto.input.input2), URI.revive(this._dto.input.result));
      case TabInputKind.CustomEditorInput:
        return new CustomEditorTabInput(URI.revive(this._dto.input.uri), this._dto.input.viewType);
      case TabInputKind.WebviewEditorInput:
        return new WebviewEditorTabInput(this._dto.input.viewType);
      case TabInputKind.NotebookInput:
        return new NotebookEditorTabInput(URI.revive(this._dto.input.uri), this._dto.input.notebookType);
      case TabInputKind.NotebookDiffInput:
        return new NotebookDiffEditorTabInput(URI.revive(this._dto.input.original), URI.revive(this._dto.input.modified), this._dto.input.notebookType);
      case TabInputKind.TerminalEditorInput:
        return new TerminalEditorTabInput();
      case TabInputKind.InteractiveEditorInput:
        return new InteractiveWindowInput(URI.revive(this._dto.input.uri), URI.revive(this._dto.input.inputBoxUri));
      case TabInputKind.ChatEditorInput:
        return new ChatEditorTabInput();
      case TabInputKind.MultiDiffEditorInput:
        return new TextMultiDiffTabInput(this._dto.input.diffEditors.map((diff) => new TextDiffTabInput(URI.revive(diff.original), URI.revive(diff.modified))));
      default:
        return void 0;
    }
  }
}
class ExtHostEditorTabGroup {
  constructor(dto, activeGroupIdGetter) {
    this._tabs = [];
    this._activeTabId = "";
    this._dto = dto;
    this._activeGroupIdGetter = activeGroupIdGetter;
    this._reconcileTabs(dto);
  }
  get apiObject() {
    if (!this._apiObject) {
      const that = this;
      const obj = {
        get isActive() {
          return that._dto.groupId === that._activeGroupIdGetter();
        },
        get viewColumn() {
          return typeConverters.ViewColumn.to(that._dto.viewColumn);
        },
        get activeTab() {
          return that._tabs.find((tab) => tab.tabId === that._activeTabId)?.apiObject;
        },
        get tabs() {
          return Object.freeze(that._tabs.map((tab) => tab.apiObject));
        }
      };
      this._apiObject = Object.freeze(obj);
    }
    return this._apiObject;
  }
  get groupId() {
    return this._dto.groupId;
  }
  get tabs() {
    return this._tabs;
  }
  acceptGroupDtoUpdate(dto) {
    this._dto = dto;
  }
  /**
   * Accepts a full group dto during a complete tab-model resync, reusing the
   * existing {@link ExtHostEditorTab} instances for tabs that still exist so
   * their (and this group's) frozen `apiObject` keeps a stable identity.
   * Extensions routinely key `Map`/`WeakMap`/`Set` collections by these
   * objects, so recreating them on every resync would break those lookups and
   * leak whatever they retain.
   */
  acceptModelUpdate(dto) {
    this._dto = dto;
    this._reconcileTabs(dto);
  }
  _reconcileTabs(dto) {
    const existingTabsById = /* @__PURE__ */ new Map();
    for (const tab of this._tabs) {
      existingTabsById.set(tab.tabId, tab);
    }
    this._activeTabId = "";
    this._tabs = dto.tabs.map((tabDto) => {
      if (tabDto.isActive) {
        this._activeTabId = tabDto.id;
      }
      const existing = existingTabsById.get(tabDto.id);
      if (existing) {
        existing.acceptDtoUpdate(tabDto);
        return existing;
      }
      return new ExtHostEditorTab(tabDto, this, () => this.activeTabId());
    });
  }
  acceptTabOperation(operation) {
    if (operation.kind === TabModelOperationKind.TAB_OPEN) {
      const tab2 = new ExtHostEditorTab(operation.tabDto, this, () => this.activeTabId());
      this._tabs.splice(operation.index, 0, tab2);
      if (operation.tabDto.isActive) {
        this._activeTabId = tab2.tabId;
      }
      return tab2;
    } else if (operation.kind === TabModelOperationKind.TAB_CLOSE) {
      const tab2 = this._tabs.splice(operation.index, 1)[0];
      if (!tab2) {
        throw new Error(`Tab close updated received for index ${operation.index} which does not exist`);
      }
      if (tab2.tabId === this._activeTabId) {
        this._activeTabId = "";
      }
      return tab2;
    } else if (operation.kind === TabModelOperationKind.TAB_MOVE) {
      if (operation.oldIndex === void 0) {
        throw new Error("Invalid old index on move IPC");
      }
      const tab2 = this._tabs.splice(operation.oldIndex, 1)[0];
      if (!tab2) {
        throw new Error(`Tab move updated received for index ${operation.oldIndex} which does not exist`);
      }
      this._tabs.splice(operation.index, 0, tab2);
      return tab2;
    }
    const tab = this._tabs.find((extHostTab) => extHostTab.tabId === operation.tabDto.id);
    if (!tab) {
      throw new Error("INVALID tab");
    }
    if (operation.tabDto.isActive) {
      this._activeTabId = operation.tabDto.id;
    } else if (this._activeTabId === operation.tabDto.id && !operation.tabDto.isActive) {
      this._activeTabId = "";
    }
    tab.acceptDtoUpdate(operation.tabDto);
    return tab;
  }
  // Not a getter since it must be a function to be used as a callback for the tabs
  activeTabId() {
    return this._activeTabId;
  }
}
let ExtHostEditorTabs = class {
  constructor(extHostRpc) {
    this._onDidChangeTabs = new Emitter();
    this._onDidChangeTabGroups = new Emitter();
    this._extHostTabGroups = [];
    this._proxy = extHostRpc.getProxy(MainContext.MainThreadEditorTabs);
  }
  get tabGroups() {
    if (!this._apiObject) {
      const that = this;
      const obj = {
        // never changes -> simple value
        onDidChangeTabGroups: that._onDidChangeTabGroups.event,
        onDidChangeTabs: that._onDidChangeTabs.event,
        // dynamic -> getters
        get all() {
          return Object.freeze(that._extHostTabGroups.map((group) => group.apiObject));
        },
        get activeTabGroup() {
          const activeTabGroupId = that._activeGroupId;
          const activeTabGroup = assertReturnsDefined(that._extHostTabGroups.find((candidate) => candidate.groupId === activeTabGroupId)?.apiObject);
          return activeTabGroup;
        },
        close: async (tabOrTabGroup, preserveFocus) => {
          const tabsOrTabGroups = Array.isArray(tabOrTabGroup) ? tabOrTabGroup : [tabOrTabGroup];
          if (!tabsOrTabGroups.length) {
            return true;
          }
          if (isTabGroup(tabsOrTabGroups[0])) {
            return this._closeGroups(tabsOrTabGroups, preserveFocus);
          } else {
            return this._closeTabs(tabsOrTabGroups, preserveFocus);
          }
        }
        // move: async (tab: vscode.Tab, viewColumn: ViewColumn, index: number, preserveFocus?: boolean) => {
        // 	const extHostTab = this._findExtHostTabFromApi(tab);
        // 	if (!extHostTab) {
        // 		throw new Error('Invalid tab');
        // 	}
        // 	this._proxy.$moveTab(extHostTab.tabId, index, typeConverters.ViewColumn.from(viewColumn), preserveFocus);
        // 	return;
        // }
      };
      this._apiObject = Object.freeze(obj);
    }
    return this._apiObject;
  }
  $acceptEditorTabModel(tabGroups) {
    const groupIdsBefore = new Set(this._extHostTabGroups.map((group) => group.groupId));
    const groupIdsAfter = new Set(tabGroups.map((dto) => dto.groupId));
    const diff = diffSets(groupIdsBefore, groupIdsAfter);
    const closed = this._extHostTabGroups.filter((group) => diff.removed.includes(group.groupId)).map((group) => group.apiObject);
    const opened = [];
    const changed = [];
    const existingGroupsById = /* @__PURE__ */ new Map();
    for (const group of this._extHostTabGroups) {
      existingGroupsById.set(group.groupId, group);
    }
    this._extHostTabGroups = tabGroups.map((tabGroup) => {
      const existing = existingGroupsById.get(tabGroup.groupId);
      if (existing) {
        existing.acceptModelUpdate(tabGroup);
        changed.push(existing.apiObject);
        return existing;
      }
      const group = new ExtHostEditorTabGroup(tabGroup, () => this._activeGroupId);
      opened.push(group.apiObject);
      return group;
    });
    const activeTabGroupId = assertReturnsDefined(tabGroups.find((group) => group.isActive === true)?.groupId);
    if (activeTabGroupId !== void 0 && this._activeGroupId !== activeTabGroupId) {
      this._activeGroupId = activeTabGroupId;
    }
    this._onDidChangeTabGroups.fire(Object.freeze({ opened, closed, changed }));
  }
  $acceptTabGroupUpdate(groupDto) {
    const group = this._extHostTabGroups.find((group2) => group2.groupId === groupDto.groupId);
    if (!group) {
      throw new Error("Update Group IPC call received before group creation.");
    }
    group.acceptGroupDtoUpdate(groupDto);
    if (groupDto.isActive) {
      this._activeGroupId = groupDto.groupId;
    }
    this._onDidChangeTabGroups.fire(Object.freeze({ changed: [group.apiObject], opened: [], closed: [] }));
  }
  $acceptTabOperation(operation) {
    const group = this._extHostTabGroups.find((group2) => group2.groupId === operation.groupId);
    if (!group) {
      throw new Error("Update Tabs IPC call received before group creation.");
    }
    const tab = group.acceptTabOperation(operation);
    switch (operation.kind) {
      case TabModelOperationKind.TAB_OPEN:
        this._onDidChangeTabs.fire(Object.freeze({
          opened: [tab.apiObject],
          closed: [],
          changed: []
        }));
        return;
      case TabModelOperationKind.TAB_CLOSE:
        this._onDidChangeTabs.fire(Object.freeze({
          opened: [],
          closed: [tab.apiObject],
          changed: []
        }));
        return;
      case TabModelOperationKind.TAB_MOVE:
      case TabModelOperationKind.TAB_UPDATE:
        this._onDidChangeTabs.fire(Object.freeze({
          opened: [],
          closed: [],
          changed: [tab.apiObject]
        }));
        return;
    }
  }
  _findExtHostTabFromApi(apiTab) {
    for (const group of this._extHostTabGroups) {
      for (const tab of group.tabs) {
        if (tab.apiObject === apiTab) {
          return tab;
        }
      }
    }
    return;
  }
  _findExtHostTabGroupFromApi(apiTabGroup) {
    return this._extHostTabGroups.find((candidate) => candidate.apiObject === apiTabGroup);
  }
  async _closeTabs(tabs, preserveFocus) {
    const extHostTabIds = [];
    for (const tab of tabs) {
      const extHostTab = this._findExtHostTabFromApi(tab);
      if (!extHostTab) {
        throw new Error("Tab close: Invalid tab not found!");
      }
      extHostTabIds.push(extHostTab.tabId);
    }
    return this._proxy.$closeTab(extHostTabIds, preserveFocus);
  }
  async _closeGroups(groups, preserverFoucs) {
    const extHostGroupIds = [];
    for (const group of groups) {
      const extHostGroup = this._findExtHostTabGroupFromApi(group);
      if (!extHostGroup) {
        throw new Error("Group close: Invalid group not found!");
      }
      extHostGroupIds.push(extHostGroup.groupId);
    }
    return this._proxy.$closeGroup(extHostGroupIds, preserverFoucs);
  }
};
ExtHostEditorTabs = __decorateClass([
  __decorateParam(0, IExtHostRpcService)
], ExtHostEditorTabs);
function isTabGroup(obj) {
  const tabGroup = obj;
  if (tabGroup.tabs !== void 0) {
    return true;
  }
  return false;
}
export {
  ExtHostEditorTabs,
  IExtHostEditorTabs
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcY29tbW9uXFxleHRIb3N0RWRpdG9yVGFicy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGRpZmZTZXRzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vY29sbGVjdGlvbnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IGFzc2VydFJldHVybnNEZWZpbmVkIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGNyZWF0ZURlY29yYXRvciB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUVkaXRvclRhYkR0bywgSUVkaXRvclRhYkdyb3VwRHRvLCBJRXh0SG9zdEVkaXRvclRhYnNTaGFwZSwgTWFpbkNvbnRleHQsIE1haW5UaHJlYWRFZGl0b3JUYWJzU2hhcGUsIFRhYklucHV0S2luZCwgVGFiTW9kZWxPcGVyYXRpb25LaW5kLCBUYWJPcGVyYXRpb24gfSBmcm9tICcuL2V4dEhvc3QucHJvdG9jb2wuanMnO1xuaW1wb3J0IHsgSUV4dEhvc3RScGNTZXJ2aWNlIH0gZnJvbSAnLi9leHRIb3N0UnBjU2VydmljZS5qcyc7XG5pbXBvcnQgKiBhcyB0eXBlQ29udmVydGVycyBmcm9tICcuL2V4dEhvc3RUeXBlQ29udmVydGVycy5qcyc7XG5pbXBvcnQgeyBDaGF0RWRpdG9yVGFiSW5wdXQsIEN1c3RvbUVkaXRvclRhYklucHV0LCBJbnRlcmFjdGl2ZVdpbmRvd0lucHV0LCBOb3RlYm9va0RpZmZFZGl0b3JUYWJJbnB1dCwgTm90ZWJvb2tFZGl0b3JUYWJJbnB1dCwgVGVybWluYWxFZGl0b3JUYWJJbnB1dCwgVGV4dERpZmZUYWJJbnB1dCwgVGV4dE1lcmdlVGFiSW5wdXQsIFRleHRUYWJJbnB1dCwgV2Vidmlld0VkaXRvclRhYklucHV0LCBUZXh0TXVsdGlEaWZmVGFiSW5wdXQgfSBmcm9tICcuL2V4dEhvc3RUeXBlcy5qcyc7XG5pbXBvcnQgdHlwZSAqIGFzIHZzY29kZSBmcm9tICd2c2NvZGUnO1xuXG5leHBvcnQgaW50ZXJmYWNlIElFeHRIb3N0RWRpdG9yVGFicyBleHRlbmRzIElFeHRIb3N0RWRpdG9yVGFic1NoYXBlIHtcblx0cmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXHR0YWJHcm91cHM6IHZzY29kZS5UYWJHcm91cHM7XG59XG5cbmV4cG9ydCBjb25zdCBJRXh0SG9zdEVkaXRvclRhYnMgPSBjcmVhdGVEZWNvcmF0b3I8SUV4dEhvc3RFZGl0b3JUYWJzPignSUV4dEhvc3RFZGl0b3JUYWJzJyk7XG5cbnR5cGUgQW55VGFiSW5wdXQgPSBUZXh0VGFiSW5wdXQgfCBUZXh0RGlmZlRhYklucHV0IHwgVGV4dE11bHRpRGlmZlRhYklucHV0IHwgQ3VzdG9tRWRpdG9yVGFiSW5wdXQgfCBOb3RlYm9va0VkaXRvclRhYklucHV0IHwgTm90ZWJvb2tEaWZmRWRpdG9yVGFiSW5wdXQgfCBXZWJ2aWV3RWRpdG9yVGFiSW5wdXQgfCBUZXJtaW5hbEVkaXRvclRhYklucHV0IHwgSW50ZXJhY3RpdmVXaW5kb3dJbnB1dCB8IENoYXRFZGl0b3JUYWJJbnB1dDtcblxuY2xhc3MgRXh0SG9zdEVkaXRvclRhYiB7XG5cdHByaXZhdGUgX2FwaU9iamVjdDogdnNjb2RlLlRhYiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfZHRvITogSUVkaXRvclRhYkR0bztcblx0cHJpdmF0ZSBfaW5wdXQ6IEFueVRhYklucHV0IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9wYXJlbnRHcm91cDogRXh0SG9zdEVkaXRvclRhYkdyb3VwO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9hY3RpdmVUYWJJZEdldHRlcjogKCkgPT4gc3RyaW5nO1xuXG5cdGNvbnN0cnVjdG9yKGR0bzogSUVkaXRvclRhYkR0bywgcGFyZW50R3JvdXA6IEV4dEhvc3RFZGl0b3JUYWJHcm91cCwgYWN0aXZlVGFiSWRHZXR0ZXI6ICgpID0+IHN0cmluZykge1xuXHRcdHRoaXMuX2FjdGl2ZVRhYklkR2V0dGVyID0gYWN0aXZlVGFiSWRHZXR0ZXI7XG5cdFx0dGhpcy5fcGFyZW50R3JvdXAgPSBwYXJlbnRHcm91cDtcblx0XHR0aGlzLmFjY2VwdER0b1VwZGF0ZShkdG8pO1xuXHR9XG5cblx0Z2V0IGFwaU9iamVjdCgpOiB2c2NvZGUuVGFiIHtcblx0XHRpZiAoIXRoaXMuX2FwaU9iamVjdCkge1xuXHRcdFx0Ly8gRG9uJ3Qgd2FudCB0byBsb3NlIHJlZmVyZW5jZSB0byBwYXJlbnQgYHRoaXNgIGluIHRoZSBnZXR0ZXJzXG5cdFx0XHRjb25zdCB0aGF0ID0gdGhpcztcblx0XHRcdGNvbnN0IG9iajogdnNjb2RlLlRhYiA9IHtcblx0XHRcdFx0Z2V0IGlzQWN0aXZlKCkge1xuXHRcdFx0XHRcdC8vIFdlIHVzZSBhIGdldHRlciBmdW5jdGlvbiBoZXJlIHRvIGFsd2F5cyBlbnN1cmUgYXQgbW9zdCAxIGFjdGl2ZSB0YWIgcGVyIGdyb3VwIGFuZCBwcmV2ZW50IGl0ZXJhdGlvbiBmb3IgYmVpbmcgcmVxdWlyZWRcblx0XHRcdFx0XHRyZXR1cm4gdGhhdC5fZHRvLmlkID09PSB0aGF0Ll9hY3RpdmVUYWJJZEdldHRlcigpO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRnZXQgbGFiZWwoKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRoYXQuX2R0by5sYWJlbDtcblx0XHRcdFx0fSxcblx0XHRcdFx0Z2V0IGlucHV0KCkge1xuXHRcdFx0XHRcdHJldHVybiB0aGF0Ll9pbnB1dDtcblx0XHRcdFx0fSxcblx0XHRcdFx0Z2V0IGlzRGlydHkoKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRoYXQuX2R0by5pc0RpcnR5O1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRnZXQgaXNQaW5uZWQoKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRoYXQuX2R0by5pc1Bpbm5lZDtcblx0XHRcdFx0fSxcblx0XHRcdFx0Z2V0IGlzUHJldmlldygpIHtcblx0XHRcdFx0XHRyZXR1cm4gdGhhdC5fZHRvLmlzUHJldmlldztcblx0XHRcdFx0fSxcblx0XHRcdFx0Z2V0IGdyb3VwKCkge1xuXHRcdFx0XHRcdHJldHVybiB0aGF0Ll9wYXJlbnRHcm91cC5hcGlPYmplY3Q7XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cdFx0XHR0aGlzLl9hcGlPYmplY3QgPSBPYmplY3QuZnJlZXplPHZzY29kZS5UYWI+KG9iaik7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9hcGlPYmplY3Q7XG5cdH1cblxuXHRnZXQgdGFiSWQoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5fZHRvLmlkO1xuXHR9XG5cblx0YWNjZXB0RHRvVXBkYXRlKGR0bzogSUVkaXRvclRhYkR0bykge1xuXHRcdHRoaXMuX2R0byA9IGR0bztcblx0XHR0aGlzLl9pbnB1dCA9IHRoaXMuX2luaXRJbnB1dCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfaW5pdElucHV0KCkge1xuXHRcdHN3aXRjaCAodGhpcy5fZHRvLmlucHV0LmtpbmQpIHtcblx0XHRcdGNhc2UgVGFiSW5wdXRLaW5kLlRleHRJbnB1dDpcblx0XHRcdFx0cmV0dXJuIG5ldyBUZXh0VGFiSW5wdXQoVVJJLnJldml2ZSh0aGlzLl9kdG8uaW5wdXQudXJpKSk7XG5cdFx0XHRjYXNlIFRhYklucHV0S2luZC5UZXh0RGlmZklucHV0OlxuXHRcdFx0XHRyZXR1cm4gbmV3IFRleHREaWZmVGFiSW5wdXQoVVJJLnJldml2ZSh0aGlzLl9kdG8uaW5wdXQub3JpZ2luYWwpLCBVUkkucmV2aXZlKHRoaXMuX2R0by5pbnB1dC5tb2RpZmllZCkpO1xuXHRcdFx0Y2FzZSBUYWJJbnB1dEtpbmQuVGV4dE1lcmdlSW5wdXQ6XG5cdFx0XHRcdHJldHVybiBuZXcgVGV4dE1lcmdlVGFiSW5wdXQoVVJJLnJldml2ZSh0aGlzLl9kdG8uaW5wdXQuYmFzZSksIFVSSS5yZXZpdmUodGhpcy5fZHRvLmlucHV0LmlucHV0MSksIFVSSS5yZXZpdmUodGhpcy5fZHRvLmlucHV0LmlucHV0MiksIFVSSS5yZXZpdmUodGhpcy5fZHRvLmlucHV0LnJlc3VsdCkpO1xuXHRcdFx0Y2FzZSBUYWJJbnB1dEtpbmQuQ3VzdG9tRWRpdG9ySW5wdXQ6XG5cdFx0XHRcdHJldHVybiBuZXcgQ3VzdG9tRWRpdG9yVGFiSW5wdXQoVVJJLnJldml2ZSh0aGlzLl9kdG8uaW5wdXQudXJpKSwgdGhpcy5fZHRvLmlucHV0LnZpZXdUeXBlKTtcblx0XHRcdGNhc2UgVGFiSW5wdXRLaW5kLldlYnZpZXdFZGl0b3JJbnB1dDpcblx0XHRcdFx0cmV0dXJuIG5ldyBXZWJ2aWV3RWRpdG9yVGFiSW5wdXQodGhpcy5fZHRvLmlucHV0LnZpZXdUeXBlKTtcblx0XHRcdGNhc2UgVGFiSW5wdXRLaW5kLk5vdGVib29rSW5wdXQ6XG5cdFx0XHRcdHJldHVybiBuZXcgTm90ZWJvb2tFZGl0b3JUYWJJbnB1dChVUkkucmV2aXZlKHRoaXMuX2R0by5pbnB1dC51cmkpLCB0aGlzLl9kdG8uaW5wdXQubm90ZWJvb2tUeXBlKTtcblx0XHRcdGNhc2UgVGFiSW5wdXRLaW5kLk5vdGVib29rRGlmZklucHV0OlxuXHRcdFx0XHRyZXR1cm4gbmV3IE5vdGVib29rRGlmZkVkaXRvclRhYklucHV0KFVSSS5yZXZpdmUodGhpcy5fZHRvLmlucHV0Lm9yaWdpbmFsKSwgVVJJLnJldml2ZSh0aGlzLl9kdG8uaW5wdXQubW9kaWZpZWQpLCB0aGlzLl9kdG8uaW5wdXQubm90ZWJvb2tUeXBlKTtcblx0XHRcdGNhc2UgVGFiSW5wdXRLaW5kLlRlcm1pbmFsRWRpdG9ySW5wdXQ6XG5cdFx0XHRcdHJldHVybiBuZXcgVGVybWluYWxFZGl0b3JUYWJJbnB1dCgpO1xuXHRcdFx0Y2FzZSBUYWJJbnB1dEtpbmQuSW50ZXJhY3RpdmVFZGl0b3JJbnB1dDpcblx0XHRcdFx0cmV0dXJuIG5ldyBJbnRlcmFjdGl2ZVdpbmRvd0lucHV0KFVSSS5yZXZpdmUodGhpcy5fZHRvLmlucHV0LnVyaSksIFVSSS5yZXZpdmUodGhpcy5fZHRvLmlucHV0LmlucHV0Qm94VXJpKSk7XG5cdFx0XHRjYXNlIFRhYklucHV0S2luZC5DaGF0RWRpdG9ySW5wdXQ6XG5cdFx0XHRcdHJldHVybiBuZXcgQ2hhdEVkaXRvclRhYklucHV0KCk7XG5cdFx0XHRjYXNlIFRhYklucHV0S2luZC5NdWx0aURpZmZFZGl0b3JJbnB1dDpcblx0XHRcdFx0cmV0dXJuIG5ldyBUZXh0TXVsdGlEaWZmVGFiSW5wdXQodGhpcy5fZHRvLmlucHV0LmRpZmZFZGl0b3JzLm1hcChkaWZmID0+IG5ldyBUZXh0RGlmZlRhYklucHV0KFVSSS5yZXZpdmUoZGlmZi5vcmlnaW5hbCksIFVSSS5yZXZpdmUoZGlmZi5tb2RpZmllZCkpKSk7XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxufVxuXG5jbGFzcyBFeHRIb3N0RWRpdG9yVGFiR3JvdXAge1xuXG5cdHByaXZhdGUgX2FwaU9iamVjdDogdnNjb2RlLlRhYkdyb3VwIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9kdG86IElFZGl0b3JUYWJHcm91cER0bztcblx0cHJpdmF0ZSBfdGFiczogRXh0SG9zdEVkaXRvclRhYltdID0gW107XG5cdHByaXZhdGUgX2FjdGl2ZVRhYklkOiBzdHJpbmcgPSAnJztcblx0cHJpdmF0ZSBfYWN0aXZlR3JvdXBJZEdldHRlcjogKCkgPT4gbnVtYmVyIHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKGR0bzogSUVkaXRvclRhYkdyb3VwRHRvLCBhY3RpdmVHcm91cElkR2V0dGVyOiAoKSA9PiBudW1iZXIgfCB1bmRlZmluZWQpIHtcblx0XHR0aGlzLl9kdG8gPSBkdG87XG5cdFx0dGhpcy5fYWN0aXZlR3JvdXBJZEdldHRlciA9IGFjdGl2ZUdyb3VwSWRHZXR0ZXI7XG5cdFx0Ly8gQ29uc3RydWN0IGFsbCB0YWJzIGZyb20gdGhlIGdpdmVuIGR0b1xuXHRcdHRoaXMuX3JlY29uY2lsZVRhYnMoZHRvKTtcblx0fVxuXG5cdGdldCBhcGlPYmplY3QoKTogdnNjb2RlLlRhYkdyb3VwIHtcblx0XHRpZiAoIXRoaXMuX2FwaU9iamVjdCkge1xuXHRcdFx0Ly8gRG9uJ3Qgd2FudCB0byBsb3NlIHJlZmVyZW5jZSB0byBwYXJlbnQgYHRoaXNgIGluIHRoZSBnZXR0ZXJzXG5cdFx0XHRjb25zdCB0aGF0ID0gdGhpcztcblx0XHRcdGNvbnN0IG9iajogdnNjb2RlLlRhYkdyb3VwID0ge1xuXHRcdFx0XHRnZXQgaXNBY3RpdmUoKSB7XG5cdFx0XHRcdFx0Ly8gV2UgdXNlIGEgZ2V0dGVyIGZ1bmN0aW9uIGhlcmUgdG8gYWx3YXlzIGVuc3VyZSBhdCBtb3N0IDEgYWN0aXZlIGdyb3VwIGFuZCBwcmV2ZW50IGl0ZXJhdGlvbiBmb3IgYmVpbmcgcmVxdWlyZWRcblx0XHRcdFx0XHRyZXR1cm4gdGhhdC5fZHRvLmdyb3VwSWQgPT09IHRoYXQuX2FjdGl2ZUdyb3VwSWRHZXR0ZXIoKTtcblx0XHRcdFx0fSxcblx0XHRcdFx0Z2V0IHZpZXdDb2x1bW4oKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHR5cGVDb252ZXJ0ZXJzLlZpZXdDb2x1bW4udG8odGhhdC5fZHRvLnZpZXdDb2x1bW4pO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRnZXQgYWN0aXZlVGFiKCkge1xuXHRcdFx0XHRcdHJldHVybiB0aGF0Ll90YWJzLmZpbmQodGFiID0+IHRhYi50YWJJZCA9PT0gdGhhdC5fYWN0aXZlVGFiSWQpPy5hcGlPYmplY3Q7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGdldCB0YWJzKCkge1xuXHRcdFx0XHRcdHJldHVybiBPYmplY3QuZnJlZXplKHRoYXQuX3RhYnMubWFwKHRhYiA9PiB0YWIuYXBpT2JqZWN0KSk7XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cdFx0XHR0aGlzLl9hcGlPYmplY3QgPSBPYmplY3QuZnJlZXplPHZzY29kZS5UYWJHcm91cD4ob2JqKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2FwaU9iamVjdDtcblx0fVxuXG5cdGdldCBncm91cElkKCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuX2R0by5ncm91cElkO1xuXHR9XG5cblx0Z2V0IHRhYnMoKTogRXh0SG9zdEVkaXRvclRhYltdIHtcblx0XHRyZXR1cm4gdGhpcy5fdGFicztcblx0fVxuXG5cdGFjY2VwdEdyb3VwRHRvVXBkYXRlKGR0bzogSUVkaXRvclRhYkdyb3VwRHRvKSB7XG5cdFx0dGhpcy5fZHRvID0gZHRvO1xuXHR9XG5cblx0LyoqXG5cdCAqIEFjY2VwdHMgYSBmdWxsIGdyb3VwIGR0byBkdXJpbmcgYSBjb21wbGV0ZSB0YWItbW9kZWwgcmVzeW5jLCByZXVzaW5nIHRoZVxuXHQgKiBleGlzdGluZyB7QGxpbmsgRXh0SG9zdEVkaXRvclRhYn0gaW5zdGFuY2VzIGZvciB0YWJzIHRoYXQgc3RpbGwgZXhpc3Qgc29cblx0ICogdGhlaXIgKGFuZCB0aGlzIGdyb3VwJ3MpIGZyb3plbiBgYXBpT2JqZWN0YCBrZWVwcyBhIHN0YWJsZSBpZGVudGl0eS5cblx0ICogRXh0ZW5zaW9ucyByb3V0aW5lbHkga2V5IGBNYXBgL2BXZWFrTWFwYC9gU2V0YCBjb2xsZWN0aW9ucyBieSB0aGVzZVxuXHQgKiBvYmplY3RzLCBzbyByZWNyZWF0aW5nIHRoZW0gb24gZXZlcnkgcmVzeW5jIHdvdWxkIGJyZWFrIHRob3NlIGxvb2t1cHMgYW5kXG5cdCAqIGxlYWsgd2hhdGV2ZXIgdGhleSByZXRhaW4uXG5cdCAqL1xuXHRhY2NlcHRNb2RlbFVwZGF0ZShkdG86IElFZGl0b3JUYWJHcm91cER0bykge1xuXHRcdHRoaXMuX2R0byA9IGR0bztcblx0XHR0aGlzLl9yZWNvbmNpbGVUYWJzKGR0byk7XG5cdH1cblxuXHRwcml2YXRlIF9yZWNvbmNpbGVUYWJzKGR0bzogSUVkaXRvclRhYkdyb3VwRHRvKSB7XG5cdFx0Y29uc3QgZXhpc3RpbmdUYWJzQnlJZCA9IG5ldyBNYXA8c3RyaW5nLCBFeHRIb3N0RWRpdG9yVGFiPigpO1xuXHRcdGZvciAoY29uc3QgdGFiIG9mIHRoaXMuX3RhYnMpIHtcblx0XHRcdGV4aXN0aW5nVGFic0J5SWQuc2V0KHRhYi50YWJJZCwgdGFiKTtcblx0XHR9XG5cblx0XHR0aGlzLl9hY3RpdmVUYWJJZCA9ICcnO1xuXHRcdHRoaXMuX3RhYnMgPSBkdG8udGFicy5tYXAodGFiRHRvID0+IHtcblx0XHRcdGlmICh0YWJEdG8uaXNBY3RpdmUpIHtcblx0XHRcdFx0dGhpcy5fYWN0aXZlVGFiSWQgPSB0YWJEdG8uaWQ7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBleGlzdGluZyA9IGV4aXN0aW5nVGFic0J5SWQuZ2V0KHRhYkR0by5pZCk7XG5cdFx0XHRpZiAoZXhpc3RpbmcpIHtcblx0XHRcdFx0ZXhpc3RpbmcuYWNjZXB0RHRvVXBkYXRlKHRhYkR0byk7XG5cdFx0XHRcdHJldHVybiBleGlzdGluZztcblx0XHRcdH1cblx0XHRcdHJldHVybiBuZXcgRXh0SG9zdEVkaXRvclRhYih0YWJEdG8sIHRoaXMsICgpID0+IHRoaXMuYWN0aXZlVGFiSWQoKSk7XG5cdFx0fSk7XG5cdH1cblxuXHRhY2NlcHRUYWJPcGVyYXRpb24ob3BlcmF0aW9uOiBUYWJPcGVyYXRpb24pOiBFeHRIb3N0RWRpdG9yVGFiIHtcblx0XHQvLyBJbiB0aGUgb3BlbiBjYXNlIHdlIGFkZCB0aGUgdGFiIHRvIHRoZSBncm91cFxuXHRcdGlmIChvcGVyYXRpb24ua2luZCA9PT0gVGFiTW9kZWxPcGVyYXRpb25LaW5kLlRBQl9PUEVOKSB7XG5cdFx0XHRjb25zdCB0YWIgPSBuZXcgRXh0SG9zdEVkaXRvclRhYihvcGVyYXRpb24udGFiRHRvLCB0aGlzLCAoKSA9PiB0aGlzLmFjdGl2ZVRhYklkKCkpO1xuXHRcdFx0Ly8gSW5zZXJ0IHRhYiBhdCBlZGl0b3IgaW5kZXhcblx0XHRcdHRoaXMuX3RhYnMuc3BsaWNlKG9wZXJhdGlvbi5pbmRleCwgMCwgdGFiKTtcblx0XHRcdGlmIChvcGVyYXRpb24udGFiRHRvLmlzQWN0aXZlKSB7XG5cdFx0XHRcdHRoaXMuX2FjdGl2ZVRhYklkID0gdGFiLnRhYklkO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHRhYjtcblx0XHR9IGVsc2UgaWYgKG9wZXJhdGlvbi5raW5kID09PSBUYWJNb2RlbE9wZXJhdGlvbktpbmQuVEFCX0NMT1NFKSB7XG5cdFx0XHRjb25zdCB0YWIgPSB0aGlzLl90YWJzLnNwbGljZShvcGVyYXRpb24uaW5kZXgsIDEpWzBdO1xuXHRcdFx0aWYgKCF0YWIpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBUYWIgY2xvc2UgdXBkYXRlZCByZWNlaXZlZCBmb3IgaW5kZXggJHtvcGVyYXRpb24uaW5kZXh9IHdoaWNoIGRvZXMgbm90IGV4aXN0YCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAodGFiLnRhYklkID09PSB0aGlzLl9hY3RpdmVUYWJJZCkge1xuXHRcdFx0XHR0aGlzLl9hY3RpdmVUYWJJZCA9ICcnO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHRhYjtcblx0XHR9IGVsc2UgaWYgKG9wZXJhdGlvbi5raW5kID09PSBUYWJNb2RlbE9wZXJhdGlvbktpbmQuVEFCX01PVkUpIHtcblx0XHRcdGlmIChvcGVyYXRpb24ub2xkSW5kZXggPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgb2xkIGluZGV4IG9uIG1vdmUgSVBDJyk7XG5cdFx0XHR9XG5cdFx0XHQvLyBTcGxpY2UgdG8gcmVtb3ZlIGF0IG9sZCBpbmRleCBhbmQgaW5zZXJ0IGF0IG5ldyBpbmRleCA9PT0gbW92aW5nIHRoZSB0YWJcblx0XHRcdGNvbnN0IHRhYiA9IHRoaXMuX3RhYnMuc3BsaWNlKG9wZXJhdGlvbi5vbGRJbmRleCwgMSlbMF07XG5cdFx0XHRpZiAoIXRhYikge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFRhYiBtb3ZlIHVwZGF0ZWQgcmVjZWl2ZWQgZm9yIGluZGV4ICR7b3BlcmF0aW9uLm9sZEluZGV4fSB3aGljaCBkb2VzIG5vdCBleGlzdGApO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fdGFicy5zcGxpY2Uob3BlcmF0aW9uLmluZGV4LCAwLCB0YWIpO1xuXHRcdFx0cmV0dXJuIHRhYjtcblx0XHR9XG5cdFx0Y29uc3QgdGFiID0gdGhpcy5fdGFicy5maW5kKGV4dEhvc3RUYWIgPT4gZXh0SG9zdFRhYi50YWJJZCA9PT0gb3BlcmF0aW9uLnRhYkR0by5pZCk7XG5cdFx0aWYgKCF0YWIpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignSU5WQUxJRCB0YWInKTtcblx0XHR9XG5cdFx0aWYgKG9wZXJhdGlvbi50YWJEdG8uaXNBY3RpdmUpIHtcblx0XHRcdHRoaXMuX2FjdGl2ZVRhYklkID0gb3BlcmF0aW9uLnRhYkR0by5pZDtcblx0XHR9IGVsc2UgaWYgKHRoaXMuX2FjdGl2ZVRhYklkID09PSBvcGVyYXRpb24udGFiRHRvLmlkICYmICFvcGVyYXRpb24udGFiRHRvLmlzQWN0aXZlKSB7XG5cdFx0XHQvLyBFdmVudHMgYXJlbid0IGd1YXJhbnRlZWQgdG8gYmUgaW4gb3JkZXIgc28gaWYgd2UgcmVjZWl2ZSBhIGR0byB0aGF0IG1hdGNoZXMgdGhlIGFjdGl2ZSB0YWIgaWRcblx0XHRcdC8vIGJ1dCBpc24ndCBhY3RpdmUgd2UgbWFyayB0aGUgYWN0aXZlIHRhYiBpZCBhcyBlbXB0eS4gVGhpcyBwcmV2ZW50IG9uRGlkQWN0aXZlVGFiQ2hhbmdlIGZyb21cblx0XHRcdC8vIGZpcmluZyBpbmNvcnJlY3RseVxuXHRcdFx0dGhpcy5fYWN0aXZlVGFiSWQgPSAnJztcblx0XHR9XG5cdFx0dGFiLmFjY2VwdER0b1VwZGF0ZShvcGVyYXRpb24udGFiRHRvKTtcblx0XHRyZXR1cm4gdGFiO1xuXHR9XG5cblx0Ly8gTm90IGEgZ2V0dGVyIHNpbmNlIGl0IG11c3QgYmUgYSBmdW5jdGlvbiB0byBiZSB1c2VkIGFzIGEgY2FsbGJhY2sgZm9yIHRoZSB0YWJzXG5cdGFjdGl2ZVRhYklkKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuX2FjdGl2ZVRhYklkO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBFeHRIb3N0RWRpdG9yVGFicyBpbXBsZW1lbnRzIElFeHRIb3N0RWRpdG9yVGFicyB7XG5cdHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9wcm94eTogTWFpblRocmVhZEVkaXRvclRhYnNTaGFwZTtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VUYWJzID0gbmV3IEVtaXR0ZXI8dnNjb2RlLlRhYkNoYW5nZUV2ZW50PigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVRhYkdyb3VwcyA9IG5ldyBFbWl0dGVyPHZzY29kZS5UYWJHcm91cENoYW5nZUV2ZW50PigpO1xuXG5cdC8vIEhhdmUgdG8gdXNlICEgYmVjYXVzZSB0aGlzIGdldHMgaW5pdGlhbGl6ZWQgdmlhIGFuIFJQQyBwcm94eVxuXHRwcml2YXRlIF9hY3RpdmVHcm91cElkITogbnVtYmVyO1xuXG5cdHByaXZhdGUgX2V4dEhvc3RUYWJHcm91cHM6IEV4dEhvc3RFZGl0b3JUYWJHcm91cFtdID0gW107XG5cblx0cHJpdmF0ZSBfYXBpT2JqZWN0OiB2c2NvZGUuVGFiR3JvdXBzIHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKEBJRXh0SG9zdFJwY1NlcnZpY2UgZXh0SG9zdFJwYzogSUV4dEhvc3RScGNTZXJ2aWNlKSB7XG5cdFx0dGhpcy5fcHJveHkgPSBleHRIb3N0UnBjLmdldFByb3h5KE1haW5Db250ZXh0Lk1haW5UaHJlYWRFZGl0b3JUYWJzKTtcblx0fVxuXG5cdGdldCB0YWJHcm91cHMoKTogdnNjb2RlLlRhYkdyb3VwcyB7XG5cdFx0aWYgKCF0aGlzLl9hcGlPYmplY3QpIHtcblx0XHRcdGNvbnN0IHRoYXQgPSB0aGlzO1xuXHRcdFx0Y29uc3Qgb2JqOiB2c2NvZGUuVGFiR3JvdXBzID0ge1xuXHRcdFx0XHQvLyBuZXZlciBjaGFuZ2VzIC0+IHNpbXBsZSB2YWx1ZVxuXHRcdFx0XHRvbkRpZENoYW5nZVRhYkdyb3VwczogdGhhdC5fb25EaWRDaGFuZ2VUYWJHcm91cHMuZXZlbnQsXG5cdFx0XHRcdG9uRGlkQ2hhbmdlVGFiczogdGhhdC5fb25EaWRDaGFuZ2VUYWJzLmV2ZW50LFxuXHRcdFx0XHQvLyBkeW5hbWljIC0+IGdldHRlcnNcblx0XHRcdFx0Z2V0IGFsbCgpIHtcblx0XHRcdFx0XHRyZXR1cm4gT2JqZWN0LmZyZWV6ZSh0aGF0Ll9leHRIb3N0VGFiR3JvdXBzLm1hcChncm91cCA9PiBncm91cC5hcGlPYmplY3QpKTtcblx0XHRcdFx0fSxcblx0XHRcdFx0Z2V0IGFjdGl2ZVRhYkdyb3VwKCkge1xuXHRcdFx0XHRcdGNvbnN0IGFjdGl2ZVRhYkdyb3VwSWQgPSB0aGF0Ll9hY3RpdmVHcm91cElkO1xuXHRcdFx0XHRcdGNvbnN0IGFjdGl2ZVRhYkdyb3VwID0gYXNzZXJ0UmV0dXJuc0RlZmluZWQodGhhdC5fZXh0SG9zdFRhYkdyb3Vwcy5maW5kKGNhbmRpZGF0ZSA9PiBjYW5kaWRhdGUuZ3JvdXBJZCA9PT0gYWN0aXZlVGFiR3JvdXBJZCk/LmFwaU9iamVjdCk7XG5cdFx0XHRcdFx0cmV0dXJuIGFjdGl2ZVRhYkdyb3VwO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRjbG9zZTogYXN5bmMgKHRhYk9yVGFiR3JvdXA6IHZzY29kZS5UYWIgfCByZWFkb25seSB2c2NvZGUuVGFiW10gfCB2c2NvZGUuVGFiR3JvdXAgfCByZWFkb25seSB2c2NvZGUuVGFiR3JvdXBbXSwgcHJlc2VydmVGb2N1cz86IGJvb2xlYW4pID0+IHtcblx0XHRcdFx0XHRjb25zdCB0YWJzT3JUYWJHcm91cHMgPSBBcnJheS5pc0FycmF5KHRhYk9yVGFiR3JvdXApID8gdGFiT3JUYWJHcm91cCA6IFt0YWJPclRhYkdyb3VwXTtcblx0XHRcdFx0XHRpZiAoIXRhYnNPclRhYkdyb3Vwcy5sZW5ndGgpIHtcblx0XHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHQvLyBDaGVjayB3aGljaCB0eXBlIHdhcyBwYXNzZWQgaW4gYW5kIGNhbGwgdGhlIGFwcHJvcHJpYXRlIGNsb3NlXG5cdFx0XHRcdFx0Ly8gQ2FzdGluZyBpcyBuZWVkZWQgYXMgdHlwZXNjcmlwdCBkb2Vzbid0IHNlZW0gdG8gaW5mZXIgZW5vdWdoIGZyb20gdGhpc1xuXHRcdFx0XHRcdGlmIChpc1RhYkdyb3VwKHRhYnNPclRhYkdyb3Vwc1swXSkpIHtcblx0XHRcdFx0XHRcdHJldHVybiB0aGlzLl9jbG9zZUdyb3Vwcyh0YWJzT3JUYWJHcm91cHMgYXMgdnNjb2RlLlRhYkdyb3VwW10sIHByZXNlcnZlRm9jdXMpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gdGhpcy5fY2xvc2VUYWJzKHRhYnNPclRhYkdyb3VwcyBhcyB2c2NvZGUuVGFiW10sIHByZXNlcnZlRm9jdXMpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdFx0Ly8gbW92ZTogYXN5bmMgKHRhYjogdnNjb2RlLlRhYiwgdmlld0NvbHVtbjogVmlld0NvbHVtbiwgaW5kZXg6IG51bWJlciwgcHJlc2VydmVGb2N1cz86IGJvb2xlYW4pID0+IHtcblx0XHRcdFx0Ly8gXHRjb25zdCBleHRIb3N0VGFiID0gdGhpcy5fZmluZEV4dEhvc3RUYWJGcm9tQXBpKHRhYik7XG5cdFx0XHRcdC8vIFx0aWYgKCFleHRIb3N0VGFiKSB7XG5cdFx0XHRcdC8vIFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgdGFiJyk7XG5cdFx0XHRcdC8vIFx0fVxuXHRcdFx0XHQvLyBcdHRoaXMuX3Byb3h5LiRtb3ZlVGFiKGV4dEhvc3RUYWIudGFiSWQsIGluZGV4LCB0eXBlQ29udmVydGVycy5WaWV3Q29sdW1uLmZyb20odmlld0NvbHVtbiksIHByZXNlcnZlRm9jdXMpO1xuXHRcdFx0XHQvLyBcdHJldHVybjtcblx0XHRcdFx0Ly8gfVxuXHRcdFx0fTtcblx0XHRcdHRoaXMuX2FwaU9iamVjdCA9IE9iamVjdC5mcmVlemUob2JqKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2FwaU9iamVjdDtcblx0fVxuXG5cdCRhY2NlcHRFZGl0b3JUYWJNb2RlbCh0YWJHcm91cHM6IElFZGl0b3JUYWJHcm91cER0b1tdKTogdm9pZCB7XG5cblx0XHRjb25zdCBncm91cElkc0JlZm9yZSA9IG5ldyBTZXQodGhpcy5fZXh0SG9zdFRhYkdyb3Vwcy5tYXAoZ3JvdXAgPT4gZ3JvdXAuZ3JvdXBJZCkpO1xuXHRcdGNvbnN0IGdyb3VwSWRzQWZ0ZXIgPSBuZXcgU2V0KHRhYkdyb3Vwcy5tYXAoZHRvID0+IGR0by5ncm91cElkKSk7XG5cdFx0Y29uc3QgZGlmZiA9IGRpZmZTZXRzKGdyb3VwSWRzQmVmb3JlLCBncm91cElkc0FmdGVyKTtcblxuXHRcdGNvbnN0IGNsb3NlZDogdnNjb2RlLlRhYkdyb3VwW10gPSB0aGlzLl9leHRIb3N0VGFiR3JvdXBzLmZpbHRlcihncm91cCA9PiBkaWZmLnJlbW92ZWQuaW5jbHVkZXMoZ3JvdXAuZ3JvdXBJZCkpLm1hcChncm91cCA9PiBncm91cC5hcGlPYmplY3QpO1xuXHRcdGNvbnN0IG9wZW5lZDogdnNjb2RlLlRhYkdyb3VwW10gPSBbXTtcblx0XHRjb25zdCBjaGFuZ2VkOiB2c2NvZGUuVGFiR3JvdXBbXSA9IFtdO1xuXG5cdFx0Ly8gUmV1c2UgdGhlIGV4aXN0aW5nIGdyb3VwIGluc3RhbmNlcyBmb3IgZ3JvdXBzIHRoYXQgc3RpbGwgZXhpc3Qgc28gdGhhdFxuXHRcdC8vIHRoZSBgdnNjb2RlLlRhYkdyb3VwYCAoYW5kIG5lc3RlZCBgdnNjb2RlLlRhYmApIG9iamVjdHMga2VlcCBhIHN0YWJsZVxuXHRcdC8vIGlkZW50aXR5IGFjcm9zcyBhIGZ1bGwgbW9kZWwgcmVzeW5jLCBtYXRjaGluZyB0aGUgZ3JhbnVsYXIgdXBkYXRlXG5cdFx0Ly8gcGF0aHMuIFdpdGhvdXQgdGhpcywgZXZlcnkgcmVzeW5jIChlLmcuIG9wZW5pbmcvY2xvc2luZyBhbiBlZGl0b3Jcblx0XHQvLyBncm91cCkgaGFuZHMgZXh0ZW5zaW9ucyBicmFuZC1uZXcgb2JqZWN0cywgc2lsZW50bHkgYnJlYWtpbmcgYW5kXG5cdFx0Ly8gbGVha2luZyBhbnkgYE1hcGAvYFdlYWtNYXBgL2BTZXRgIGtleWVkIGJ5IHRhYiBncm91cHMgb3IgdGFicy5cblx0XHRjb25zdCBleGlzdGluZ0dyb3Vwc0J5SWQgPSBuZXcgTWFwPG51bWJlciwgRXh0SG9zdEVkaXRvclRhYkdyb3VwPigpO1xuXHRcdGZvciAoY29uc3QgZ3JvdXAgb2YgdGhpcy5fZXh0SG9zdFRhYkdyb3Vwcykge1xuXHRcdFx0ZXhpc3RpbmdHcm91cHNCeUlkLnNldChncm91cC5ncm91cElkLCBncm91cCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fZXh0SG9zdFRhYkdyb3VwcyA9IHRhYkdyb3Vwcy5tYXAodGFiR3JvdXAgPT4ge1xuXHRcdFx0Y29uc3QgZXhpc3RpbmcgPSBleGlzdGluZ0dyb3Vwc0J5SWQuZ2V0KHRhYkdyb3VwLmdyb3VwSWQpO1xuXHRcdFx0aWYgKGV4aXN0aW5nKSB7XG5cdFx0XHRcdGV4aXN0aW5nLmFjY2VwdE1vZGVsVXBkYXRlKHRhYkdyb3VwKTtcblx0XHRcdFx0Y2hhbmdlZC5wdXNoKGV4aXN0aW5nLmFwaU9iamVjdCk7XG5cdFx0XHRcdHJldHVybiBleGlzdGluZztcblx0XHRcdH1cblx0XHRcdGNvbnN0IGdyb3VwID0gbmV3IEV4dEhvc3RFZGl0b3JUYWJHcm91cCh0YWJHcm91cCwgKCkgPT4gdGhpcy5fYWN0aXZlR3JvdXBJZCk7XG5cdFx0XHRvcGVuZWQucHVzaChncm91cC5hcGlPYmplY3QpO1xuXHRcdFx0cmV0dXJuIGdyb3VwO1xuXHRcdH0pO1xuXG5cdFx0Ly8gU2V0IHRoZSBhY3RpdmUgdGFiIGdyb3VwIGlkXG5cdFx0Y29uc3QgYWN0aXZlVGFiR3JvdXBJZCA9IGFzc2VydFJldHVybnNEZWZpbmVkKHRhYkdyb3Vwcy5maW5kKGdyb3VwID0+IGdyb3VwLmlzQWN0aXZlID09PSB0cnVlKT8uZ3JvdXBJZCk7XG5cdFx0aWYgKGFjdGl2ZVRhYkdyb3VwSWQgIT09IHVuZGVmaW5lZCAmJiB0aGlzLl9hY3RpdmVHcm91cElkICE9PSBhY3RpdmVUYWJHcm91cElkKSB7XG5cdFx0XHR0aGlzLl9hY3RpdmVHcm91cElkID0gYWN0aXZlVGFiR3JvdXBJZDtcblx0XHR9XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VUYWJHcm91cHMuZmlyZShPYmplY3QuZnJlZXplKHsgb3BlbmVkLCBjbG9zZWQsIGNoYW5nZWQgfSkpO1xuXHR9XG5cblx0JGFjY2VwdFRhYkdyb3VwVXBkYXRlKGdyb3VwRHRvOiBJRWRpdG9yVGFiR3JvdXBEdG8pIHtcblx0XHRjb25zdCBncm91cCA9IHRoaXMuX2V4dEhvc3RUYWJHcm91cHMuZmluZChncm91cCA9PiBncm91cC5ncm91cElkID09PSBncm91cER0by5ncm91cElkKTtcblx0XHRpZiAoIWdyb3VwKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ1VwZGF0ZSBHcm91cCBJUEMgY2FsbCByZWNlaXZlZCBiZWZvcmUgZ3JvdXAgY3JlYXRpb24uJyk7XG5cdFx0fVxuXHRcdGdyb3VwLmFjY2VwdEdyb3VwRHRvVXBkYXRlKGdyb3VwRHRvKTtcblx0XHRpZiAoZ3JvdXBEdG8uaXNBY3RpdmUpIHtcblx0XHRcdHRoaXMuX2FjdGl2ZUdyb3VwSWQgPSBncm91cER0by5ncm91cElkO1xuXHRcdH1cblx0XHR0aGlzLl9vbkRpZENoYW5nZVRhYkdyb3Vwcy5maXJlKE9iamVjdC5mcmVlemUoeyBjaGFuZ2VkOiBbZ3JvdXAuYXBpT2JqZWN0XSwgb3BlbmVkOiBbXSwgY2xvc2VkOiBbXSB9KSk7XG5cdH1cblxuXHQkYWNjZXB0VGFiT3BlcmF0aW9uKG9wZXJhdGlvbjogVGFiT3BlcmF0aW9uKSB7XG5cdFx0Y29uc3QgZ3JvdXAgPSB0aGlzLl9leHRIb3N0VGFiR3JvdXBzLmZpbmQoZ3JvdXAgPT4gZ3JvdXAuZ3JvdXBJZCA9PT0gb3BlcmF0aW9uLmdyb3VwSWQpO1xuXHRcdGlmICghZ3JvdXApIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignVXBkYXRlIFRhYnMgSVBDIGNhbGwgcmVjZWl2ZWQgYmVmb3JlIGdyb3VwIGNyZWF0aW9uLicpO1xuXHRcdH1cblx0XHRjb25zdCB0YWIgPSBncm91cC5hY2NlcHRUYWJPcGVyYXRpb24ob3BlcmF0aW9uKTtcblxuXHRcdC8vIENvbnN0cnVjdCB0aGUgdGFiIGNoYW5nZSBldmVudCBiYXNlZCBvbiB0aGUgb3BlcmF0aW9uXG5cdFx0c3dpdGNoIChvcGVyYXRpb24ua2luZCkge1xuXHRcdFx0Y2FzZSBUYWJNb2RlbE9wZXJhdGlvbktpbmQuVEFCX09QRU46XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlVGFicy5maXJlKE9iamVjdC5mcmVlemUoe1xuXHRcdFx0XHRcdG9wZW5lZDogW3RhYi5hcGlPYmplY3RdLFxuXHRcdFx0XHRcdGNsb3NlZDogW10sXG5cdFx0XHRcdFx0Y2hhbmdlZDogW11cblx0XHRcdFx0fSkpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHRjYXNlIFRhYk1vZGVsT3BlcmF0aW9uS2luZC5UQUJfQ0xPU0U6XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlVGFicy5maXJlKE9iamVjdC5mcmVlemUoe1xuXHRcdFx0XHRcdG9wZW5lZDogW10sXG5cdFx0XHRcdFx0Y2xvc2VkOiBbdGFiLmFwaU9iamVjdF0sXG5cdFx0XHRcdFx0Y2hhbmdlZDogW11cblx0XHRcdFx0fSkpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHRjYXNlIFRhYk1vZGVsT3BlcmF0aW9uS2luZC5UQUJfTU9WRTpcblx0XHRcdGNhc2UgVGFiTW9kZWxPcGVyYXRpb25LaW5kLlRBQl9VUERBVEU6XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlVGFicy5maXJlKE9iamVjdC5mcmVlemUoe1xuXHRcdFx0XHRcdG9wZW5lZDogW10sXG5cdFx0XHRcdFx0Y2xvc2VkOiBbXSxcblx0XHRcdFx0XHRjaGFuZ2VkOiBbdGFiLmFwaU9iamVjdF1cblx0XHRcdFx0fSkpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZmluZEV4dEhvc3RUYWJGcm9tQXBpKGFwaVRhYjogdnNjb2RlLlRhYik6IEV4dEhvc3RFZGl0b3JUYWIgfCB1bmRlZmluZWQge1xuXHRcdGZvciAoY29uc3QgZ3JvdXAgb2YgdGhpcy5fZXh0SG9zdFRhYkdyb3Vwcykge1xuXHRcdFx0Zm9yIChjb25zdCB0YWIgb2YgZ3JvdXAudGFicykge1xuXHRcdFx0XHRpZiAodGFiLmFwaU9iamVjdCA9PT0gYXBpVGFiKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRhYjtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm47XG5cdH1cblxuXHRwcml2YXRlIF9maW5kRXh0SG9zdFRhYkdyb3VwRnJvbUFwaShhcGlUYWJHcm91cDogdnNjb2RlLlRhYkdyb3VwKTogRXh0SG9zdEVkaXRvclRhYkdyb3VwIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fZXh0SG9zdFRhYkdyb3Vwcy5maW5kKGNhbmRpZGF0ZSA9PiBjYW5kaWRhdGUuYXBpT2JqZWN0ID09PSBhcGlUYWJHcm91cCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9jbG9zZVRhYnModGFiczogdnNjb2RlLlRhYltdLCBwcmVzZXJ2ZUZvY3VzPzogYm9vbGVhbik6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGNvbnN0IGV4dEhvc3RUYWJJZHM6IHN0cmluZ1tdID0gW107XG5cdFx0Zm9yIChjb25zdCB0YWIgb2YgdGFicykge1xuXHRcdFx0Y29uc3QgZXh0SG9zdFRhYiA9IHRoaXMuX2ZpbmRFeHRIb3N0VGFiRnJvbUFwaSh0YWIpO1xuXHRcdFx0aWYgKCFleHRIb3N0VGFiKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcignVGFiIGNsb3NlOiBJbnZhbGlkIHRhYiBub3QgZm91bmQhJyk7XG5cdFx0XHR9XG5cdFx0XHRleHRIb3N0VGFiSWRzLnB1c2goZXh0SG9zdFRhYi50YWJJZCk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9wcm94eS4kY2xvc2VUYWIoZXh0SG9zdFRhYklkcywgcHJlc2VydmVGb2N1cyk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9jbG9zZUdyb3Vwcyhncm91cHM6IHZzY29kZS5UYWJHcm91cFtdLCBwcmVzZXJ2ZXJGb3Vjcz86IGJvb2xlYW4pOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRjb25zdCBleHRIb3N0R3JvdXBJZHM6IG51bWJlcltdID0gW107XG5cdFx0Zm9yIChjb25zdCBncm91cCBvZiBncm91cHMpIHtcblx0XHRcdGNvbnN0IGV4dEhvc3RHcm91cCA9IHRoaXMuX2ZpbmRFeHRIb3N0VGFiR3JvdXBGcm9tQXBpKGdyb3VwKTtcblx0XHRcdGlmICghZXh0SG9zdEdyb3VwKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcignR3JvdXAgY2xvc2U6IEludmFsaWQgZ3JvdXAgbm90IGZvdW5kIScpO1xuXHRcdFx0fVxuXHRcdFx0ZXh0SG9zdEdyb3VwSWRzLnB1c2goZXh0SG9zdEdyb3VwLmdyb3VwSWQpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fcHJveHkuJGNsb3NlR3JvdXAoZXh0SG9zdEdyb3VwSWRzLCBwcmVzZXJ2ZXJGb3Vjcyk7XG5cdH1cbn1cblxuLy8jcmVnaW9uIFV0aWxzXG5mdW5jdGlvbiBpc1RhYkdyb3VwKG9iajogdW5rbm93bik6IG9iaiBpcyB2c2NvZGUuVGFiR3JvdXAge1xuXHRjb25zdCB0YWJHcm91cCA9IG9iaiBhcyB2c2NvZGUuVGFiR3JvdXA7XG5cdGlmICh0YWJHcm91cC50YWJzICE9PSB1bmRlZmluZWQpIHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXHRyZXR1cm4gZmFsc2U7XG59XG4vLyNlbmRyZWdpb25cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsV0FBVztBQUNwQixTQUFTLHVCQUF1QjtBQUNoQyxTQUFxRSxhQUF3QyxjQUFjLDZCQUEyQztBQUN0SyxTQUFTLDBCQUEwQjtBQUNuQyxZQUFZLG9CQUFvQjtBQUNoQyxTQUFTLG9CQUFvQixzQkFBc0Isd0JBQXdCLDRCQUE0Qix3QkFBd0Isd0JBQXdCLGtCQUFrQixtQkFBbUIsY0FBYyx1QkFBdUIsNkJBQTZCO0FBUXZQLE1BQU0scUJBQXFCLGdCQUFvQyxvQkFBb0I7QUFJMUYsTUFBTSxpQkFBaUI7QUFBQSxFQU90QixZQUFZLEtBQW9CLGFBQW9DLG1CQUFpQztBQUNwRyxTQUFLLHFCQUFxQjtBQUMxQixTQUFLLGVBQWU7QUFDcEIsU0FBSyxnQkFBZ0IsR0FBRztBQUFBLEVBQ3pCO0FBQUEsRUFFQSxJQUFJLFlBQXdCO0FBQzNCLFFBQUksQ0FBQyxLQUFLLFlBQVk7QUFFckIsWUFBTSxPQUFPO0FBQ2IsWUFBTSxNQUFrQjtBQUFBLFFBQ3ZCLElBQUksV0FBVztBQUVkLGlCQUFPLEtBQUssS0FBSyxPQUFPLEtBQUssbUJBQW1CO0FBQUEsUUFDakQ7QUFBQSxRQUNBLElBQUksUUFBUTtBQUNYLGlCQUFPLEtBQUssS0FBSztBQUFBLFFBQ2xCO0FBQUEsUUFDQSxJQUFJLFFBQVE7QUFD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
