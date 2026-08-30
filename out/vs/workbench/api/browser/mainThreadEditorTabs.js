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
import { Event } from "../../../base/common/event.js";
import { DisposableMap, DisposableStore } from "../../../base/common/lifecycle.js";
import { isEqual } from "../../../base/common/resources.js";
import { URI } from "../../../base/common/uri.js";
import { IConfigurationService } from "../../../platform/configuration/common/configuration.js";
import { ILogService } from "../../../platform/log/common/log.js";
import { ExtHostContext, MainContext, TabInputKind, TabModelOperationKind } from "../common/extHost.protocol.js";
import { EditorResourceAccessor, GroupModelChangeKind, SideBySideEditor } from "../../common/editor.js";
import { DiffEditorInput } from "../../common/editor/diffEditorInput.js";
import { isGroupEditorMoveEvent } from "../../common/editor/editorGroupModel.js";
import { SideBySideEditorInput } from "../../common/editor/sideBySideEditorInput.js";
import { AbstractTextResourceEditorInput } from "../../common/editor/textResourceEditorInput.js";
import { ChatEditorInput } from "../../contrib/chat/browser/widgetHosts/editor/chatEditorInput.js";
import { CustomEditorInput } from "../../contrib/customEditor/browser/customEditorInput.js";
import { InteractiveEditorInput } from "../../contrib/interactive/browser/interactiveEditorInput.js";
import { MergeEditorInput } from "../../contrib/mergeEditor/browser/mergeEditorInput.js";
import { MultiDiffEditorInput } from "../../contrib/multiDiffEditor/browser/multiDiffEditorInput.js";
import { NotebookEditorInput } from "../../contrib/notebook/common/notebookEditorInput.js";
import { TerminalEditorInput } from "../../contrib/terminal/browser/terminalEditorInput.js";
import { WebviewInput } from "../../contrib/webviewPanel/browser/webviewEditorInput.js";
import { columnToEditorGroup, editorGroupToColumn } from "../../services/editor/common/editorGroupColumn.js";
import { GroupDirection, IEditorGroupsService, preferredSideBySideGroupDirection } from "../../services/editor/common/editorGroupsService.js";
import { IEditorService, SIDE_GROUP } from "../../services/editor/common/editorService.js";
import { extHostNamedCustomer } from "../../services/extensions/common/extHostCustomers.js";
let MainThreadEditorTabs = class {
  constructor(extHostContext, _editorGroupsService, _configurationService, _logService, editorService) {
    this._editorGroupsService = _editorGroupsService;
    this._configurationService = _configurationService;
    this._logService = _logService;
    this._dispoables = new DisposableStore();
    // List of all groups and their corresponding tabs, this is **the** model
    this._tabGroupModel = [];
    // Lookup table for finding group by id
    this._groupLookup = /* @__PURE__ */ new Map();
    // Lookup table for finding tab by id
    this._tabInfoLookup = /* @__PURE__ */ new Map();
    // Tracks the currently open MultiDiffEditorInputs to listen to resource changes
    this._multiDiffEditorInputListeners = new DisposableMap();
    this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostEditorTabs);
    this._dispoables.add(editorService.onDidEditorsChange((event) => {
      try {
        this._updateTabsModel(event);
      } catch {
        this._logService.error("Failed to update model, rebuilding");
        this._createTabsModel();
      }
    }));
    this._dispoables.add(this._multiDiffEditorInputListeners);
    this._dispoables.add(this._editorGroupsService.onDidAddGroup(() => this._createTabsModel()));
    this._dispoables.add(this._editorGroupsService.onDidRemoveGroup(() => this._createTabsModel()));
    this._editorGroupsService.whenReady.then(() => this._createTabsModel());
  }
  dispose() {
    this._groupLookup.clear();
    this._tabInfoLookup.clear();
    this._dispoables.dispose();
  }
  /**
   * Creates a tab object with the correct properties
   * @param editor The editor input represented by the tab
   * @param group The group the tab is in
   * @returns A tab object
   */
  _buildTabObject(group, editor, editorIndex) {
    const editorId = editor.editorId;
    const tab = {
      id: this._generateTabId(editor, group.id),
      label: editor.getName(),
      editorId,
      input: this._editorInputToDto(editor),
      isPinned: group.isSticky(editorIndex),
      isPreview: !group.isPinned(editorIndex),
      isActive: group.isActive(editor),
      isDirty: editor.isDirty()
    };
    return tab;
  }
  _editorInputToDto(editor) {
    if (editor instanceof MergeEditorInput) {
      return {
        kind: TabInputKind.TextMergeInput,
        base: editor.base,
        input1: editor.input1.uri,
        input2: editor.input2.uri,
        result: editor.resource
      };
    }
    if (editor instanceof AbstractTextResourceEditorInput) {
      return {
        kind: TabInputKind.TextInput,
        uri: editor.resource
      };
    }
    if (editor instanceof SideBySideEditorInput && !(editor instanceof DiffEditorInput)) {
      const primaryResource = editor.primary.resource;
      const secondaryResource = editor.secondary.resource;
      if (editor.primary instanceof AbstractTextResourceEditorInput && editor.secondary instanceof AbstractTextResourceEditorInput && isEqual(primaryResource, secondaryResource) && primaryResource && secondaryResource) {
        return {
          kind: TabInputKind.TextInput,
          uri: primaryResource
        };
      }
      return { kind: TabInputKind.UnknownInput };
    }
    if (editor instanceof NotebookEditorInput) {
      return {
        kind: TabInputKind.NotebookInput,
        notebookType: editor.viewType,
        uri: editor.resource
      };
    }
    if (editor instanceof CustomEditorInput) {
      return {
        kind: TabInputKind.CustomEditorInput,
        viewType: editor.viewType,
        uri: editor.resource
      };
    }
    if (editor instanceof WebviewInput) {
      return {
        kind: TabInputKind.WebviewEditorInput,
        viewType: editor.viewType
      };
    }
    if (editor instanceof TerminalEditorInput) {
      return {
        kind: TabInputKind.TerminalEditorInput
      };
    }
    if (editor instanceof DiffEditorInput) {
      if (editor.modified instanceof AbstractTextResourceEditorInput && editor.original instanceof AbstractTextResourceEditorInput) {
        return {
          kind: TabInputKind.TextDiffInput,
          modified: editor.modified.resource,
          original: editor.original.resource
        };
      }
      if (editor.modified instanceof NotebookEditorInput && editor.original instanceof NotebookEditorInput) {
        return {
          kind: TabInputKind.NotebookDiffInput,
          notebookType: editor.original.viewType,
          modified: editor.modified.resource,
          original: editor.original.resource
        };
      }
    }
    if (editor instanceof InteractiveEditorInput) {
      return {
        kind: TabInputKind.InteractiveEditorInput,
        uri: editor.resource,
        inputBoxUri: editor.inputResource
      };
    }
    if (editor instanceof ChatEditorInput) {
      return {
        kind: TabInputKind.ChatEditorInput
      };
    }
    if (editor instanceof MultiDiffEditorInput) {
      const diffEditors = [];
      for (const resource of editor?.resources.get() ?? []) {
        if (resource.originalUri && resource.modifiedUri) {
          diffEditors.push({
            kind: TabInputKind.TextDiffInput,
            original: resource.originalUri,
            modified: resource.modifiedUri
          });
        }
      }
      return {
        kind: TabInputKind.MultiDiffEditorInput,
        diffEditors
      };
    }
    return { kind: TabInputKind.UnknownInput };
  }
  /**
   * Generates a unique id for a tab
   * @param editor The editor input
   * @param groupId The group id
   * @returns A unique identifier for a specific tab
   */
  _generateTabId(editor, groupId) {
    let resourceString;
    const resource = EditorResourceAccessor.getCanonicalUri(editor, { supportSideBySide: SideBySideEditor.BOTH });
    if (resource instanceof URI) {
      resourceString = resource.toString();
    } else {
      resourceString = `${resource?.primary?.toString()}-${resource?.secondary?.toString()}`;
    }
    return `${groupId}~${editor.editorId}-${editor.typeId}-${resourceString} `;
  }
  /**
   * Called whenever a group activates, updates the model by marking the group as active an notifies the extension host
   */
  _onDidGroupActivate() {
    const activeGroupId = this._editorGroupsService.activeGroup.id;
    const activeGroup = this._groupLookup.get(activeGroupId);
    if (activeGroup) {
      activeGroup.isActive = true;
      this._proxy.$acceptTabGroupUpdate(activeGroup);
    }
  }
  /**
   * Called when the tab label changes
   * @param groupId The id of the group the tab exists in
   * @param editorInput The editor input represented by the tab
   */
  _onDidTabLabelChange(groupId, editorInput, editorIndex) {
    const tabId = this._generateTabId(editorInput, groupId);
    const tabInfo = this._tabInfoLookup.get(tabId);
    if (tabInfo) {
      tabInfo.tab.label = editorInput.getName();
      this._proxy.$acceptTabOperation({
        groupId,
        index: editorIndex,
        tabDto: tabInfo.tab,
        kind: TabModelOperationKind.TAB_UPDATE
      });
    } else {
      if (this._editorGroupsService.activeModalEditorPart?.groups.some((group) => group.id === groupId)) {
        return;
      }
      this._logService.error("Invalid model for label change, rebuilding");
      this._createTabsModel();
    }
  }
  /**
   * Called when a new tab is opened
   * @param groupId The id of the group the tab is being created in
   * @param editorInput The editor input being opened
   * @param editorIndex The index of the editor within that group
   */
  _onDidTabOpen(groupId, editorInput, editorIndex) {
    const group = this._editorGroupsService.getGroup(groupId);
    const groupInModel = this._groupLookup.get(groupId) !== void 0;
    if (!group || !groupInModel) {
      this._createTabsModel();
      return;
    }
    const tabs = this._groupLookup.get(groupId)?.tabs;
    if (!tabs) {
      return;
    }
    const tabObject = this._buildTabObject(group, editorInput, editorIndex);
    tabs.splice(editorIndex, 0, tabObject);
    const tabId = this._generateTabId(editorInput, groupId);
    this._tabInfoLookup.set(tabId, { group, editorInput, tab: tabObject });
    if (editorInput instanceof MultiDiffEditorInput) {
      this._multiDiffEditorInputListeners.set(editorInput, Event.fromObservableLight(editorInput.resources)(() => {
        const tabInfo = this._tabInfoLookup.get(tabId);
        if (!tabInfo) {
          return;
        }
        tabInfo.tab = this._buildTabObject(group, editorInput, editorIndex);
        this._proxy.$acceptTabOperation({
          groupId,
          index: editorIndex,
          tabDto: tabInfo.tab,
          kind: TabModelOperationKind.TAB_UPDATE
        });
      }));
    }
    this._proxy.$acceptTabOperation({
      groupId,
      index: editorIndex,
      tabDto: tabObject,
      kind: TabModelOperationKind.TAB_OPEN
    });
  }
  /**
   * Called when a tab is closed
   * @param groupId The id of the group the tab is being removed from
   * @param editorIndex The index of the editor within that group
   */
  _onDidTabClose(groupId, editorIndex) {
    const group = this._editorGroupsService.getGroup(groupId);
    const tabs = this._groupLookup.get(groupId)?.tabs;
    if (!group || !tabs) {
      this._createTabsModel();
      return;
    }
    const removedTab = tabs.splice(editorIndex, 1);
    if (removedTab.length === 0) {
      return;
    }
    this._tabInfoLookup.delete(removedTab[0]?.id ?? "");
    if (removedTab[0]?.input instanceof MultiDiffEditorInput) {
      this._multiDiffEditorInputListeners.deleteAndDispose(removedTab[0]?.input);
    }
    this._proxy.$acceptTabOperation({
      groupId,
      index: editorIndex,
      tabDto: removedTab[0],
      kind: TabModelOperationKind.TAB_CLOSE
    });
  }
  /**
   * Called when the active tab changes
   * @param groupId The id of the group the tab is contained in
   * @param editorIndex The index of the tab
   */
  _onDidTabActiveChange(groupId, editorIndex) {
    const tabs = this._groupLookup.get(groupId)?.tabs;
    if (!tabs) {
      return;
    }
    const activeTab = tabs[editorIndex];
    activeTab.isActive = true;
    this._proxy.$acceptTabOperation({
      groupId,
      index: editorIndex,
      tabDto: activeTab,
      kind: TabModelOperationKind.TAB_UPDATE
    });
  }
  /**
   * Called when the dirty indicator on the tab changes
   * @param groupId The id of the group the tab is in
   * @param editorIndex The index of the tab
   * @param editor The editor input represented by the tab
   */
  _onDidTabDirty(groupId, editorIndex, editor) {
    const tabId = this._generateTabId(editor, groupId);
    const tabInfo = this._tabInfoLookup.get(tabId);
    if (!tabInfo) {
      this._logService.error("Invalid model for dirty change, rebuilding");
      this._createTabsModel();
      return;
    }
    tabInfo.tab.isDirty = editor.isDirty();
    this._proxy.$acceptTabOperation({
      groupId,
      index: editorIndex,
      tabDto: tabInfo.tab,
      kind: TabModelOperationKind.TAB_UPDATE
    });
  }
  /**
   * Called when the tab is pinned/unpinned
   * @param groupId The id of the group the tab is in
   * @param editorIndex The index of the tab
   * @param editor The editor input represented by the tab
   */
  _onDidTabPinChange(groupId, editorIndex, editor) {
    const tabId = this._generateTabId(editor, groupId);
    const tabInfo = this._tabInfoLookup.get(tabId);
    const group = tabInfo?.group;
    const tab = tabInfo?.tab;
    if (!group || !tab) {
      this._logService.error("Invalid model for sticky change, rebuilding");
      this._createTabsModel();
      return;
    }
    tab.isPinned = group.isSticky(editorIndex);
    this._proxy.$acceptTabOperation({
      groupId,
      index: editorIndex,
      tabDto: tab,
      kind: TabModelOperationKind.TAB_UPDATE
    });
  }
  /**
  * Called when the tab is preview / unpreviewed
  * @param groupId The id of the group the tab is in
  * @param editorIndex The index of the tab
  * @param editor The editor input represented by the tab
  */
  _onDidTabPreviewChange(groupId, editorIndex, editor) {
    const tabId = this._generateTabId(editor, groupId);
    const tabInfo = this._tabInfoLookup.get(tabId);
    const group = tabInfo?.group;
    const tab = tabInfo?.tab;
    if (!group || !tab) {
      this._logService.error("Invalid model for sticky change, rebuilding");
      this._createTabsModel();
      return;
    }
    tab.isPreview = !group.isPinned(editorIndex);
    this._proxy.$acceptTabOperation({
      kind: TabModelOperationKind.TAB_UPDATE,
      groupId,
      tabDto: tab,
      index: editorIndex
    });
  }
  _onDidTabMove(groupId, editorIndex, oldEditorIndex, editor) {
    const tabs = this._groupLookup.get(groupId)?.tabs;
    if (!tabs) {
      this._logService.error("Invalid model for move change, rebuilding");
      this._createTabsModel();
      return;
    }
    const removedTab = tabs.splice(oldEditorIndex, 1);
    if (removedTab.length === 0) {
      return;
    }
    tabs.splice(editorIndex, 0, removedTab[0]);
    this._proxy.$acceptTabOperation({
      kind: TabModelOperationKind.TAB_MOVE,
      groupId,
      tabDto: removedTab[0],
      index: editorIndex,
      oldIndex: oldEditorIndex
    });
  }
  /**
   * Builds the model from scratch based on the current state of the editor service.
   */
  _createTabsModel() {
    if (this._editorGroupsService.groups.length === 0) {
      return;
    }
    this._tabGroupModel = [];
    this._groupLookup.clear();
    this._tabInfoLookup.clear();
    let tabs = [];
    for (const group of this._editorGroupsService.groups) {
      const currentTabGroupModel = {
        groupId: group.id,
        isActive: group.id === this._editorGroupsService.activeGroup.id,
        viewColumn: editorGroupToColumn(this._editorGroupsService, group),
        tabs: []
      };
      group.editors.forEach((editor, editorIndex) => {
        const tab = this._buildTabObject(group, editor, editorIndex);
        tabs.push(tab);
        this._tabInfoLookup.set(this._generateTabId(editor, group.id), {
          group,
          tab,
          editorInput: editor
        });
      });
      currentTabGroupModel.tabs = tabs;
      this._tabGroupModel.push(currentTabGroupModel);
      this._groupLookup.set(group.id, currentTabGroupModel);
      tabs = [];
    }
    this._proxy.$acceptEditorTabModel(this._tabGroupModel);
  }
  /**
   * The main handler for the tab events
   * @param events The list of events to process
   */
  _updateTabsModel(changeEvent) {
    const event = changeEvent.event;
    const groupId = changeEvent.groupId;
    switch (event.kind) {
      case GroupModelChangeKind.GROUP_ACTIVE:
        if (groupId === this._editorGroupsService.activeGroup.id) {
          this._onDidGroupActivate();
          break;
        } else {
          return;
        }
      case GroupModelChangeKind.EDITOR_LABEL:
        if (event.editor !== void 0 && event.editorIndex !== void 0) {
          this._onDidTabLabelChange(groupId, event.editor, event.editorIndex);
          break;
        }
      case GroupModelChangeKind.EDITOR_OPEN:
        if (event.editor !== void 0 && event.editorIndex !== void 0) {
          this._onDidTabOpen(groupId, event.editor, event.editorIndex);
          break;
        }
      case GroupModelChangeKind.EDITOR_CLOSE:
        if (event.editorIndex !== void 0) {
          this._onDidTabClose(groupId, event.editorIndex);
          break;
        }
      case GroupModelChangeKind.EDITOR_ACTIVE:
        if (event.editorIndex !== void 0) {
          this._onDidTabActiveChange(groupId, event.editorIndex);
          break;
        }
      case GroupModelChangeKind.EDITOR_DIRTY:
        if (event.editorIndex !== void 0 && event.editor !== void 0) {
          this._onDidTabDirty(groupId, event.editorIndex, event.editor);
          break;
        }
      case GroupModelChangeKind.EDITOR_STICKY:
        if (event.editorIndex !== void 0 && event.editor !== void 0) {
          this._onDidTabPinChange(groupId, event.editorIndex, event.editor);
          break;
        }
      case GroupModelChangeKind.EDITOR_PIN:
        if (event.editorIndex !== void 0 && event.editor !== void 0) {
          this._onDidTabPreviewChange(groupId, event.editorIndex, event.editor);
          break;
        }
      case GroupModelChangeKind.EDITOR_TRANSIENT:
        break;
      case GroupModelChangeKind.EDITORS_SELECTION:
        break;
      case GroupModelChangeKind.EDITOR_MOVE:
        if (isGroupEditorMoveEvent(event) && event.editor && event.editorIndex !== void 0 && event.oldEditorIndex !== void 0) {
          this._onDidTabMove(groupId, event.editorIndex, event.oldEditorIndex, event.editor);
          break;
        }
      default:
        this._createTabsModel();
    }
  }
  //#region Messages received from Ext Host
  $moveTab(tabId, index, viewColumn, preserveFocus) {
    const groupId = columnToEditorGroup(this._editorGroupsService, this._configurationService, viewColumn);
    const tabInfo = this._tabInfoLookup.get(tabId);
    const tab = tabInfo?.tab;
    if (!tab) {
      throw new Error(`Attempted to close tab with id ${tabId} which does not exist`);
    }
    let targetGroup;
    const sourceGroup = this._editorGroupsService.getGroup(tabInfo.group.id);
    if (!sourceGroup) {
      return;
    }
    if (this._groupLookup.get(groupId) === void 0) {
      let direction = GroupDirection.RIGHT;
      if (viewColumn === SIDE_GROUP) {
        direction = preferredSideBySideGroupDirection(this._configurationService);
      }
      targetGroup = this._editorGroupsService.addGroup(this._editorGroupsService.groups[this._editorGroupsService.groups.length - 1], direction);
    } else {
      targetGroup = this._editorGroupsService.getGroup(groupId);
    }
    if (!targetGroup) {
      return;
    }
    if (index < 0 || index > targetGroup.editors.length) {
      index = targetGroup.editors.length;
    }
    const editorInput = tabInfo?.editorInput;
    if (!editorInput) {
      return;
    }
    sourceGroup.moveEditor(editorInput, targetGroup, { index, preserveFocus });
    return;
  }
  async $closeTab(tabIds, preserveFocus) {
    const groups = /* @__PURE__ */ new Map();
    for (const tabId of tabIds) {
      const tabInfo = this._tabInfoLookup.get(tabId);
      const tab = tabInfo?.tab;
      const group = tabInfo?.group;
      const editorTab = tabInfo?.editorInput;
      if (!group || !tab || !tabInfo || !editorTab) {
        continue;
      }
      const groupEditors = groups.get(group);
      if (!groupEditors) {
        groups.set(group, [editorTab]);
      } else {
        groupEditors.push(editorTab);
      }
    }
    const results = [];
    for (const [group, editors] of groups) {
      results.push(await group.closeEditors(editors, { preserveFocus }));
    }
    return results.every((result) => result);
  }
  async $closeGroup(groupIds, preserveFocus) {
    const groupCloseResults = [];
    for (const groupId of groupIds) {
      const group = this._editorGroupsService.getGroup(groupId);
      if (group) {
        groupCloseResults.push(await group.closeAllEditors());
        if (group.count === 0 && this._editorGroupsService.getGroup(group.id)) {
          this._editorGroupsService.removeGroup(group);
        }
      }
    }
    return groupCloseResults.every((result) => result);
  }
  //#endregion
};
MainThreadEditorTabs = __decorateClass([
  extHostNamedCustomer(MainContext.MainThreadEditorTabs),
  __decorateParam(1, IEditorGroupsService),
  __decorateParam(2, IConfigurationService),
  __decorateParam(3, ILogService),
  __decorateParam(4, IEditorService)
], MainThreadEditorTabs);
export {
  MainThreadEditorTabs
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcYnJvd3NlclxcbWFpblRocmVhZEVkaXRvclRhYnMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVNYXAsIERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBpc0VxdWFsIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgQW55SW5wdXREdG8sIEV4dEhvc3RDb250ZXh0LCBJRWRpdG9yVGFiRHRvLCBJRWRpdG9yVGFiR3JvdXBEdG8sIElFeHRIb3N0RWRpdG9yVGFic1NoYXBlLCBNYWluQ29udGV4dCwgTWFpblRocmVhZEVkaXRvclRhYnNTaGFwZSwgVGFiSW5wdXRLaW5kLCBUYWJNb2RlbE9wZXJhdGlvbktpbmQsIFRleHREaWZmSW5wdXREdG8gfSBmcm9tICcuLi9jb21tb24vZXh0SG9zdC5wcm90b2NvbC5qcyc7XG5pbXBvcnQgeyBFZGl0b3JSZXNvdXJjZUFjY2Vzc29yLCBHcm91cE1vZGVsQ2hhbmdlS2luZCwgU2lkZUJ5U2lkZUVkaXRvciB9IGZyb20gJy4uLy4uL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgRGlmZkVkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vY29tbW9uL2VkaXRvci9kaWZmRWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgaXNHcm91cEVkaXRvck1vdmVFdmVudCB9IGZyb20gJy4uLy4uL2NvbW1vbi9lZGl0b3IvZWRpdG9yR3JvdXBNb2RlbC5qcyc7XG5pbXBvcnQgeyBFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uL2NvbW1vbi9lZGl0b3IvZWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgU2lkZUJ5U2lkZUVkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vY29tbW9uL2VkaXRvci9zaWRlQnlTaWRlRWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgQWJzdHJhY3RUZXh0UmVzb3VyY2VFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uL2NvbW1vbi9lZGl0b3IvdGV4dFJlc291cmNlRWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgQ2hhdEVkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vY29udHJpYi9jaGF0L2Jyb3dzZXIvd2lkZ2V0SG9zdHMvZWRpdG9yL2NoYXRFZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBDdXN0b21FZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uL2NvbnRyaWIvY3VzdG9tRWRpdG9yL2Jyb3dzZXIvY3VzdG9tRWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgSW50ZXJhY3RpdmVFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uL2NvbnRyaWIvaW50ZXJhY3RpdmUvYnJvd3Nlci9pbnRlcmFjdGl2ZUVkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IE1lcmdlRWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi9jb250cmliL21lcmdlRWRpdG9yL2Jyb3dzZXIvbWVyZ2VFZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBNdWx0aURpZmZFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uL2NvbnRyaWIvbXVsdGlEaWZmRWRpdG9yL2Jyb3dzZXIvbXVsdGlEaWZmRWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgTm90ZWJvb2tFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uL2NvbnRyaWIvbm90ZWJvb2svY29tbW9uL25vdGVib29rRWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgVGVybWluYWxFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uL2NvbnRyaWIvdGVybWluYWwvYnJvd3Nlci90ZXJtaW5hbEVkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IFdlYnZpZXdJbnB1dCB9IGZyb20gJy4uLy4uL2NvbnRyaWIvd2Vidmlld1BhbmVsL2Jyb3dzZXIvd2Vidmlld0VkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IGNvbHVtblRvRWRpdG9yR3JvdXAsIEVkaXRvckdyb3VwQ29sdW1uLCBlZGl0b3JHcm91cFRvQ29sdW1uIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JHcm91cENvbHVtbi5qcyc7XG5pbXBvcnQgeyBHcm91cERpcmVjdGlvbiwgSUVkaXRvckdyb3VwLCBJRWRpdG9yR3JvdXBzU2VydmljZSwgcHJlZmVycmVkU2lkZUJ5U2lkZUdyb3VwRGlyZWN0aW9uIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JHcm91cHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFZGl0b3JzQ2hhbmdlRXZlbnQsIElFZGl0b3JTZXJ2aWNlLCBTSURFX0dST1VQIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGV4dEhvc3ROYW1lZEN1c3RvbWVyLCBJRXh0SG9zdENvbnRleHQgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRIb3N0Q3VzdG9tZXJzLmpzJztcblxuaW50ZXJmYWNlIFRhYkluZm8ge1xuXHR0YWI6IElFZGl0b3JUYWJEdG87XG5cdGdyb3VwOiBJRWRpdG9yR3JvdXA7XG5cdGVkaXRvcklucHV0OiBFZGl0b3JJbnB1dDtcbn1cbkBleHRIb3N0TmFtZWRDdXN0b21lcihNYWluQ29udGV4dC5NYWluVGhyZWFkRWRpdG9yVGFicylcbmV4cG9ydCBjbGFzcyBNYWluVGhyZWFkRWRpdG9yVGFicyBpbXBsZW1lbnRzIE1haW5UaHJlYWRFZGl0b3JUYWJzU2hhcGUge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2Rpc3BvYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Byb3h5OiBJRXh0SG9zdEVkaXRvclRhYnNTaGFwZTtcblx0Ly8gTGlzdCBvZiBhbGwgZ3JvdXBzIGFuZCB0aGVpciBjb3JyZXNwb25kaW5nIHRhYnMsIHRoaXMgaXMgKip0aGUqKiBtb2RlbFxuXHRwcml2YXRlIF90YWJHcm91cE1vZGVsOiBJRWRpdG9yVGFiR3JvdXBEdG9bXSA9IFtdO1xuXHQvLyBMb29rdXAgdGFibGUgZm9yIGZpbmRpbmcgZ3JvdXAgYnkgaWRcblx0cHJpdmF0ZSByZWFkb25seSBfZ3JvdXBMb29rdXA6IE1hcDxudW1iZXIsIElFZGl0b3JUYWJHcm91cER0bz4gPSBuZXcgTWFwKCk7XG5cdC8vIExvb2t1cCB0YWJsZSBmb3IgZmluZGluZyB0YWIgYnkgaWRcblx0cHJpdmF0ZSByZWFkb25seSBfdGFiSW5mb0xvb2t1cDogTWFwPHN0cmluZywgVGFiSW5mbz4gPSBuZXcgTWFwKCk7XG5cdC8vIFRyYWNrcyB0aGUgY3VycmVudGx5IG9wZW4gTXVsdGlEaWZmRWRpdG9ySW5wdXRzIHRvIGxpc3RlbiB0byByZXNvdXJjZSBjaGFuZ2VzXG5cdHByaXZhdGUgcmVhZG9ubHkgX211bHRpRGlmZkVkaXRvcklucHV0TGlzdGVuZXJzOiBEaXNwb3NhYmxlTWFwPE11bHRpRGlmZkVkaXRvcklucHV0PiA9IG5ldyBEaXNwb3NhYmxlTWFwKCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0ZXh0SG9zdENvbnRleHQ6IElFeHRIb3N0Q29udGV4dCxcblx0XHRASUVkaXRvckdyb3Vwc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZWRpdG9yR3JvdXBzU2VydmljZTogSUVkaXRvckdyb3Vwc1NlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASUVkaXRvclNlcnZpY2UgZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2Vcblx0KSB7XG5cblx0XHR0aGlzLl9wcm94eSA9IGV4dEhvc3RDb250ZXh0LmdldFByb3h5KEV4dEhvc3RDb250ZXh0LkV4dEhvc3RFZGl0b3JUYWJzKTtcblxuXHRcdC8vIE1haW4gbGlzdGVuZXIgd2hpY2ggcmVzcG9uZHMgdG8gZXZlbnRzIGZyb20gdGhlIGVkaXRvciBzZXJ2aWNlXG5cdFx0dGhpcy5fZGlzcG9hYmxlcy5hZGQoZWRpdG9yU2VydmljZS5vbkRpZEVkaXRvcnNDaGFuZ2UoKGV2ZW50KSA9PiB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHR0aGlzLl91cGRhdGVUYWJzTW9kZWwoZXZlbnQpO1xuXHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoJ0ZhaWxlZCB0byB1cGRhdGUgbW9kZWwsIHJlYnVpbGRpbmcnKTtcblx0XHRcdFx0dGhpcy5fY3JlYXRlVGFic01vZGVsKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fZGlzcG9hYmxlcy5hZGQodGhpcy5fbXVsdGlEaWZmRWRpdG9ySW5wdXRMaXN0ZW5lcnMpO1xuXG5cdFx0Ly8gU3RydWN0dXJhbCBncm91cCBjaGFuZ2VzIChhZGQsIHJlbW92ZSwgbW92ZSwgZXRjKSBhcmUgZGlmZmljdWx0IHRvIHBhdGNoLlxuXHRcdC8vIFNpbmNlIHRoZXkgaGFwcGVuIGluZnJlcXVlbnRseSB3ZSBqdXN0IHJlYnVpbGQgdGhlIGVudGlyZSBtb2RlbFxuXHRcdHRoaXMuX2Rpc3BvYWJsZXMuYWRkKHRoaXMuX2VkaXRvckdyb3Vwc1NlcnZpY2Uub25EaWRBZGRHcm91cCgoKSA9PiB0aGlzLl9jcmVhdGVUYWJzTW9kZWwoKSkpO1xuXHRcdHRoaXMuX2Rpc3BvYWJsZXMuYWRkKHRoaXMuX2VkaXRvckdyb3Vwc1NlcnZpY2Uub25EaWRSZW1vdmVHcm91cCgoKSA9PiB0aGlzLl9jcmVhdGVUYWJzTW9kZWwoKSkpO1xuXG5cdFx0Ly8gT25jZSBldmVyeXRoaW5nIGlzIHJlYWQgZ28gYWhlYWQgYW5kIGluaXRpYWxpemUgdGhlIG1vZGVsXG5cdFx0dGhpcy5fZWRpdG9yR3JvdXBzU2VydmljZS53aGVuUmVhZHkudGhlbigoKSA9PiB0aGlzLl9jcmVhdGVUYWJzTW9kZWwoKSk7XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX2dyb3VwTG9va3VwLmNsZWFyKCk7XG5cdFx0dGhpcy5fdGFiSW5mb0xvb2t1cC5jbGVhcigpO1xuXHRcdHRoaXMuX2Rpc3BvYWJsZXMuZGlzcG9zZSgpO1xuXHR9XG5cblx0LyoqXG5cdCAqIENyZWF0ZXMgYSB0YWIgb2JqZWN0IHdpdGggdGhlIGNvcnJlY3QgcHJvcGVydGllc1xuXHQgKiBAcGFyYW0gZWRpdG9yIFRoZSBlZGl0b3IgaW5wdXQgcmVwcmVzZW50ZWQgYnkgdGhlIHRhYlxuXHQgKiBAcGFyYW0gZ3JvdXAgVGhlIGdyb3VwIHRoZSB0YWIgaXMgaW5cblx0ICogQHJldHVybnMgQSB0YWIgb2JqZWN0XG5cdCAqL1xuXHRwcml2YXRlIF9idWlsZFRhYk9iamVjdChncm91cDogSUVkaXRvckdyb3VwLCBlZGl0b3I6IEVkaXRvcklucHV0LCBlZGl0b3JJbmRleDogbnVtYmVyKTogSUVkaXRvclRhYkR0byB7XG5cdFx0Y29uc3QgZWRpdG9ySWQgPSBlZGl0b3IuZWRpdG9ySWQ7XG5cdFx0Y29uc3QgdGFiOiBJRWRpdG9yVGFiRHRvID0ge1xuXHRcdFx0aWQ6IHRoaXMuX2dlbmVyYXRlVGFiSWQoZWRpdG9yLCBncm91cC5pZCksXG5cdFx0XHRsYWJlbDogZWRpdG9yLmdldE5hbWUoKSxcblx0XHRcdGVkaXRvcklkLFxuXHRcdFx0aW5wdXQ6IHRoaXMuX2VkaXRvcklucHV0VG9EdG8oZWRpdG9yKSxcblx0XHRcdGlzUGlubmVkOiBncm91cC5pc1N0aWNreShlZGl0b3JJbmRleCksXG5cdFx0XHRpc1ByZXZpZXc6ICFncm91cC5pc1Bpbm5lZChlZGl0b3JJbmRleCksXG5cdFx0XHRpc0FjdGl2ZTogZ3JvdXAuaXNBY3RpdmUoZWRpdG9yKSxcblx0XHRcdGlzRGlydHk6IGVkaXRvci5pc0RpcnR5KClcblx0XHR9O1xuXHRcdHJldHVybiB0YWI7XG5cdH1cblxuXHRwcml2YXRlIF9lZGl0b3JJbnB1dFRvRHRvKGVkaXRvcjogRWRpdG9ySW5wdXQpOiBBbnlJbnB1dER0byB7XG5cblx0XHRpZiAoZWRpdG9yIGluc3RhbmNlb2YgTWVyZ2VFZGl0b3JJbnB1dCkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0a2luZDogVGFiSW5wdXRLaW5kLlRleHRNZXJnZUlucHV0LFxuXHRcdFx0XHRiYXNlOiBlZGl0b3IuYmFzZSxcblx0XHRcdFx0aW5wdXQxOiBlZGl0b3IuaW5wdXQxLnVyaSxcblx0XHRcdFx0aW5wdXQyOiBlZGl0b3IuaW5wdXQyLnVyaSxcblx0XHRcdFx0cmVzdWx0OiBlZGl0b3IucmVzb3VyY2Vcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0aWYgKGVkaXRvciBpbnN0YW5jZW9mIEFic3RyYWN0VGV4dFJlc291cmNlRWRpdG9ySW5wdXQpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGtpbmQ6IFRhYklucHV0S2luZC5UZXh0SW5wdXQsXG5cdFx0XHRcdHVyaTogZWRpdG9yLnJlc291cmNlXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGlmIChlZGl0b3IgaW5zdGFuY2VvZiBTaWRlQnlTaWRlRWRpdG9ySW5wdXQgJiYgIShlZGl0b3IgaW5zdGFuY2VvZiBEaWZmRWRpdG9ySW5wdXQpKSB7XG5cdFx0XHRjb25zdCBwcmltYXJ5UmVzb3VyY2UgPSBlZGl0b3IucHJpbWFyeS5yZXNvdXJjZTtcblx0XHRcdGNvbnN0IHNlY29uZGFyeVJlc291cmNlID0gZWRpdG9yLnNlY29uZGFyeS5yZXNvdXJjZTtcblx0XHRcdC8vIElmIHNpZGUgYnkgc2lkZSBlZGl0b3Igd2l0aCBzYW1lIHJlc291cmNlIG9uIGJvdGggc2lkZXMgdHJlYXQgaXQgYXMgYSBzaW5ndWxhciB0YWIga2luZFxuXHRcdFx0aWYgKGVkaXRvci5wcmltYXJ5IGluc3RhbmNlb2YgQWJzdHJhY3RUZXh0UmVzb3VyY2VFZGl0b3JJbnB1dFxuXHRcdFx0XHQmJiBlZGl0b3Iuc2Vjb25kYXJ5IGluc3RhbmNlb2YgQWJzdHJhY3RUZXh0UmVzb3VyY2VFZGl0b3JJbnB1dFxuXHRcdFx0XHQmJiBpc0VxdWFsKHByaW1hcnlSZXNvdXJjZSwgc2Vjb25kYXJ5UmVzb3VyY2UpXG5cdFx0XHRcdCYmIHByaW1hcnlSZXNvdXJjZVxuXHRcdFx0XHQmJiBzZWNvbmRhcnlSZXNvdXJjZVxuXHRcdFx0KSB7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0a2luZDogVGFiSW5wdXRLaW5kLlRleHRJbnB1dCxcblx0XHRcdFx0XHR1cmk6IHByaW1hcnlSZXNvdXJjZVxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHsga2luZDogVGFiSW5wdXRLaW5kLlVua25vd25JbnB1dCB9O1xuXHRcdH1cblxuXHRcdGlmIChlZGl0b3IgaW5zdGFuY2VvZiBOb3RlYm9va0VkaXRvcklucHV0KSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRraW5kOiBUYWJJbnB1dEtpbmQuTm90ZWJvb2tJbnB1dCxcblx0XHRcdFx0bm90ZWJvb2tUeXBlOiBlZGl0b3Iudmlld1R5cGUsXG5cdFx0XHRcdHVyaTogZWRpdG9yLnJlc291cmNlXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGlmIChlZGl0b3IgaW5zdGFuY2VvZiBDdXN0b21FZGl0b3JJbnB1dCkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0a2luZDogVGFiSW5wdXRLaW5kLkN1c3RvbUVkaXRvcklucHV0LFxuXHRcdFx0XHR2aWV3VHlwZTogZWRpdG9yLnZpZXdUeXBlLFxuXHRcdFx0XHR1cmk6IGVkaXRvci5yZXNvdXJjZSxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0aWYgKGVkaXRvciBpbnN0YW5jZW9mIFdlYnZpZXdJbnB1dCkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0a2luZDogVGFiSW5wdXRLaW5kLldlYnZpZXdFZGl0b3JJbnB1dCxcblx0XHRcdFx0dmlld1R5cGU6IGVkaXRvci52aWV3VHlwZVxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRpZiAoZWRpdG9yIGluc3RhbmNlb2YgVGVybWluYWxFZGl0b3JJbnB1dCkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0a2luZDogVGFiSW5wdXRLaW5kLlRlcm1pbmFsRWRpdG9ySW5wdXRcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0aWYgKGVkaXRvciBpbnN0YW5jZW9mIERpZmZFZGl0b3JJbnB1dCkge1xuXHRcdFx0aWYgKGVkaXRvci5tb2RpZmllZCBpbnN0YW5jZW9mIEFic3RyYWN0VGV4dFJlc291cmNlRWRpdG9ySW5wdXQgJiYgZWRpdG9yLm9yaWdpbmFsIGluc3RhbmNlb2YgQWJzdHJhY3RUZXh0UmVzb3VyY2VFZGl0b3JJbnB1dCkge1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGtpbmQ6IFRhYklucHV0S2luZC5UZXh0RGlmZklucHV0LFxuXHRcdFx0XHRcdG1vZGlmaWVkOiBlZGl0b3IubW9kaWZpZWQucmVzb3VyY2UsXG5cdFx0XHRcdFx0b3JpZ2luYWw6IGVkaXRvci5vcmlnaW5hbC5yZXNvdXJjZVxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdFx0aWYgKGVkaXRvci5tb2RpZmllZCBpbnN0YW5jZW9mIE5vdGVib29rRWRpdG9ySW5wdXQgJiYgZWRpdG9yLm9yaWdpbmFsIGluc3RhbmNlb2YgTm90ZWJvb2tFZGl0b3JJbnB1dCkge1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGtpbmQ6IFRhYklucHV0S2luZC5Ob3RlYm9va0RpZmZJbnB1dCxcblx0XHRcdFx0XHRub3RlYm9va1R5cGU6IGVkaXRvci5vcmlnaW5hbC52aWV3VHlwZSxcblx0XHRcdFx0XHRtb2RpZmllZDogZWRpdG9yLm1vZGlmaWVkLnJlc291cmNlLFxuXHRcdFx0XHRcdG9yaWdpbmFsOiBlZGl0b3Iub3JpZ2luYWwucmVzb3VyY2Vcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoZWRpdG9yIGluc3RhbmNlb2YgSW50ZXJhY3RpdmVFZGl0b3JJbnB1dCkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0a2luZDogVGFiSW5wdXRLaW5kLkludGVyYWN0aXZlRWRpdG9ySW5wdXQsXG5cdFx0XHRcdHVyaTogZWRpdG9yLnJlc291cmNlLFxuXHRcdFx0XHRpbnB1dEJveFVyaTogZWRpdG9yLmlucHV0UmVzb3VyY2Vcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0aWYgKGVkaXRvciBpbnN0YW5jZW9mIENoYXRFZGl0b3JJbnB1dCkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0a2luZDogVGFiSW5wdXRLaW5kLkNoYXRFZGl0b3JJbnB1dCxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0aWYgKGVkaXRvciBpbnN0YW5jZW9mIE11bHRpRGlmZkVkaXRvcklucHV0KSB7XG5cdFx0XHRjb25zdCBkaWZmRWRpdG9yczogVGV4dERpZmZJbnB1dER0b1tdID0gW107XG5cdFx0XHRmb3IgKGNvbnN0IHJlc291cmNlIG9mIChlZGl0b3I/LnJlc291cmNlcy5nZXQoKSA/PyBbXSkpIHtcblx0XHRcdFx0aWYgKHJlc291cmNlLm9yaWdpbmFsVXJpICYmIHJlc291cmNlLm1vZGlmaWVkVXJpKSB7XG5cdFx0XHRcdFx0ZGlmZkVkaXRvcnMucHVzaCh7XG5cdFx0XHRcdFx0XHRraW5kOiBUYWJJbnB1dEtpbmQuVGV4dERpZmZJbnB1dCxcblx0XHRcdFx0XHRcdG9yaWdpbmFsOiByZXNvdXJjZS5vcmlnaW5hbFVyaSxcblx0XHRcdFx0XHRcdG1vZGlmaWVkOiByZXNvdXJjZS5tb2RpZmllZFVyaVxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGtpbmQ6IFRhYklucHV0S2luZC5NdWx0aURpZmZFZGl0b3JJbnB1dCxcblx0XHRcdFx0ZGlmZkVkaXRvcnNcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHsga2luZDogVGFiSW5wdXRLaW5kLlVua25vd25JbnB1dCB9O1xuXHR9XG5cblx0LyoqXG5cdCAqIEdlbmVyYXRlcyBhIHVuaXF1ZSBpZCBmb3IgYSB0YWJcblx0ICogQHBhcmFtIGVkaXRvciBUaGUgZWRpdG9yIGlucHV0XG5cdCAqIEBwYXJhbSBncm91cElkIFRoZSBncm91cCBpZFxuXHQgKiBAcmV0dXJucyBBIHVuaXF1ZSBpZGVudGlmaWVyIGZvciBhIHNwZWNpZmljIHRhYlxuXHQgKi9cblx0cHJpdmF0ZSBfZ2VuZXJhdGVUYWJJZChlZGl0b3I6IEVkaXRvcklucHV0LCBncm91cElkOiBudW1iZXIpIHtcblx0XHRsZXQgcmVzb3VyY2VTdHJpbmc6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHQvLyBQcm9wZXJseSBnZXQgdGhlIHJlc291cmNlIGFuZCBhY2NvdW50IGZvciBzaWRlIGJ5IHNpZGUgZWRpdG9yc1xuXHRcdGNvbnN0IHJlc291cmNlID0gRWRpdG9yUmVzb3VyY2VBY2Nlc3Nvci5nZXRDYW5vbmljYWxVcmkoZWRpdG9yLCB7IHN1cHBvcnRTaWRlQnlTaWRlOiBTaWRlQnlTaWRlRWRpdG9yLkJPVEggfSk7XG5cdFx0aWYgKHJlc291cmNlIGluc3RhbmNlb2YgVVJJKSB7XG5cdFx0XHRyZXNvdXJjZVN0cmluZyA9IHJlc291cmNlLnRvU3RyaW5nKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJlc291cmNlU3RyaW5nID0gYCR7cmVzb3VyY2U/LnByaW1hcnk/LnRvU3RyaW5nKCl9LSR7cmVzb3VyY2U/LnNlY29uZGFyeT8udG9TdHJpbmcoKX1gO1xuXHRcdH1cblx0XHRyZXR1cm4gYCR7Z3JvdXBJZH1+JHtlZGl0b3IuZWRpdG9ySWR9LSR7ZWRpdG9yLnR5cGVJZH0tJHtyZXNvdXJjZVN0cmluZ30gYDtcblx0fVxuXG5cdC8qKlxuXHQgKiBDYWxsZWQgd2hlbmV2ZXIgYSBncm91cCBhY3RpdmF0ZXMsIHVwZGF0ZXMgdGhlIG1vZGVsIGJ5IG1hcmtpbmcgdGhlIGdyb3VwIGFzIGFjdGl2ZSBhbiBub3RpZmllcyB0aGUgZXh0ZW5zaW9uIGhvc3Rcblx0ICovXG5cdHByaXZhdGUgX29uRGlkR3JvdXBBY3RpdmF0ZSgpIHtcblx0XHRjb25zdCBhY3RpdmVHcm91cElkID0gdGhpcy5fZWRpdG9yR3JvdXBzU2VydmljZS5hY3RpdmVHcm91cC5pZDtcblx0XHRjb25zdCBhY3RpdmVHcm91cCA9IHRoaXMuX2dyb3VwTG9va3VwLmdldChhY3RpdmVHcm91cElkKTtcblx0XHRpZiAoYWN0aXZlR3JvdXApIHtcblx0XHRcdC8vIE9rIG5vdCB0byBsb29wIGFzIGV4dGhvc3QgYWNjZXB0cyBsYXN0IGFjdGl2ZSBncm91cFxuXHRcdFx0YWN0aXZlR3JvdXAuaXNBY3RpdmUgPSB0cnVlO1xuXHRcdFx0dGhpcy5fcHJveHkuJGFjY2VwdFRhYkdyb3VwVXBkYXRlKGFjdGl2ZUdyb3VwKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogQ2FsbGVkIHdoZW4gdGhlIHRhYiBsYWJlbCBjaGFuZ2VzXG5cdCAqIEBwYXJhbSBncm91cElkIFRoZSBpZCBvZiB0aGUgZ3JvdXAgdGhlIHRhYiBleGlzdHMgaW5cblx0ICogQHBhcmFtIGVkaXRvcklucHV0IFRoZSBlZGl0b3IgaW5wdXQgcmVwcmVzZW50ZWQgYnkgdGhlIHRhYlxuXHQgKi9cblx0cHJpdmF0ZSBfb25EaWRUYWJMYWJlbENoYW5nZShncm91cElkOiBudW1iZXIsIGVkaXRvcklucHV0OiBFZGl0b3JJbnB1dCwgZWRpdG9ySW5kZXg6IG51bWJlcikge1xuXHRcdGNvbnN0IHRhYklkID0gdGhpcy5fZ2VuZXJhdGVUYWJJZChlZGl0b3JJbnB1dCwgZ3JvdXBJZCk7XG5cdFx0Y29uc3QgdGFiSW5mbyA9IHRoaXMuX3RhYkluZm9Mb29rdXAuZ2V0KHRhYklkKTtcblx0XHQvLyBJZiB0YWIgaXMgZm91bmQgcGF0Y2gsIGVsc2UgcmVidWlsZFxuXHRcdGlmICh0YWJJbmZvKSB7XG5cdFx0XHR0YWJJbmZvLnRhYi5sYWJlbCA9IGVkaXRvcklucHV0LmdldE5hbWUoKTtcblx0XHRcdHRoaXMuX3Byb3h5LiRhY2NlcHRUYWJPcGVyYXRpb24oe1xuXHRcdFx0XHRncm91cElkLFxuXHRcdFx0XHRpbmRleDogZWRpdG9ySW5kZXgsXG5cdFx0XHRcdHRhYkR0bzogdGFiSW5mby50YWIsXG5cdFx0XHRcdGtpbmQ6IFRhYk1vZGVsT3BlcmF0aW9uS2luZC5UQUJfVVBEQVRFXG5cdFx0XHR9KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0aWYgKHRoaXMuX2VkaXRvckdyb3Vwc1NlcnZpY2UuYWN0aXZlTW9kYWxFZGl0b3JQYXJ0Py5ncm91cHMuc29tZShncm91cCA9PiBncm91cC5pZCA9PT0gZ3JvdXBJZCkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcignSW52YWxpZCBtb2RlbCBmb3IgbGFiZWwgY2hhbmdlLCByZWJ1aWxkaW5nJyk7XG5cdFx0XHR0aGlzLl9jcmVhdGVUYWJzTW9kZWwoKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogQ2FsbGVkIHdoZW4gYSBuZXcgdGFiIGlzIG9wZW5lZFxuXHQgKiBAcGFyYW0gZ3JvdXBJZCBUaGUgaWQgb2YgdGhlIGdyb3VwIHRoZSB0YWIgaXMgYmVpbmcgY3JlYXRlZCBpblxuXHQgKiBAcGFyYW0gZWRpdG9ySW5wdXQgVGhlIGVkaXRvciBpbnB1dCBiZWluZyBvcGVuZWRcblx0ICogQHBhcmFtIGVkaXRvckluZGV4IFRoZSBpbmRleCBvZiB0aGUgZWRpdG9yIHdpdGhpbiB0aGF0IGdyb3VwXG5cdCAqL1xuXHRwcml2YXRlIF9vbkRpZFRhYk9wZW4oZ3JvdXBJZDogbnVtYmVyLCBlZGl0b3JJbnB1dDogRWRpdG9ySW5wdXQsIGVkaXRvckluZGV4OiBudW1iZXIpIHtcblx0XHRjb25zdCBncm91cCA9IHRoaXMuX2VkaXRvckdyb3Vwc1NlcnZpY2UuZ2V0R3JvdXAoZ3JvdXBJZCk7XG5cdFx0Ly8gRXZlbiBpZiB0aGUgZWRpdG9yIHNlcnZpY2Uga25vd3MgYWJvdXQgdGhlIGdyb3VwIHRoZSBncm91cCBtaWdodCBub3QgZXhpc3QgeWV0IGluIG91ciBtb2RlbFxuXHRcdGNvbnN0IGdyb3VwSW5Nb2RlbCA9IHRoaXMuX2dyb3VwTG9va3VwLmdldChncm91cElkKSAhPT0gdW5kZWZpbmVkO1xuXHRcdC8vIE1lYW5zIGEgbmV3IGdyb3VwIHdhcyBsaWtlbHkgY3JlYXRlZCBzbyB3ZSByZWJ1aWxkIHRoZSBtb2RlbFxuXHRcdGlmICghZ3JvdXAgfHwgIWdyb3VwSW5Nb2RlbCkge1xuXHRcdFx0dGhpcy5fY3JlYXRlVGFic01vZGVsKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHRhYnMgPSB0aGlzLl9ncm91cExvb2t1cC5nZXQoZ3JvdXBJZCk/LnRhYnM7XG5cdFx0aWYgKCF0YWJzKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdC8vIFNwbGljZSB0YWIgaW50byBncm91cCBhdCBpbmRleCBlZGl0b3JJbmRleFxuXHRcdGNvbnN0IHRhYk9iamVjdCA9IHRoaXMuX2J1aWxkVGFiT2JqZWN0KGdyb3VwLCBlZGl0b3JJbnB1dCwgZWRpdG9ySW5kZXgpO1xuXHRcdHRhYnMuc3BsaWNlKGVkaXRvckluZGV4LCAwLCB0YWJPYmplY3QpO1xuXHRcdC8vIFVwZGF0ZSBsb29rdXBcblx0XHRjb25zdCB0YWJJZCA9IHRoaXMuX2dlbmVyYXRlVGFiSWQoZWRpdG9ySW5wdXQsIGdyb3VwSWQpO1xuXHRcdHRoaXMuX3RhYkluZm9Mb29rdXAuc2V0KHRhYklkLCB7IGdyb3VwLCBlZGl0b3JJbnB1dCwgdGFiOiB0YWJPYmplY3QgfSk7XG5cblx0XHRpZiAoZWRpdG9ySW5wdXQgaW5zdGFuY2VvZiBNdWx0aURpZmZFZGl0b3JJbnB1dCkge1xuXHRcdFx0dGhpcy5fbXVsdGlEaWZmRWRpdG9ySW5wdXRMaXN0ZW5lcnMuc2V0KGVkaXRvcklucHV0LCBFdmVudC5mcm9tT2JzZXJ2YWJsZUxpZ2h0KGVkaXRvcklucHV0LnJlc291cmNlcykoKCkgPT4ge1xuXHRcdFx0XHRjb25zdCB0YWJJbmZvID0gdGhpcy5fdGFiSW5mb0xvb2t1cC5nZXQodGFiSWQpO1xuXHRcdFx0XHRpZiAoIXRhYkluZm8pIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0dGFiSW5mby50YWIgPSB0aGlzLl9idWlsZFRhYk9iamVjdChncm91cCwgZWRpdG9ySW5wdXQsIGVkaXRvckluZGV4KTtcblx0XHRcdFx0dGhpcy5fcHJveHkuJGFjY2VwdFRhYk9wZXJhdGlvbih7XG5cdFx0XHRcdFx0Z3JvdXBJZCxcblx0XHRcdFx0XHRpbmRleDogZWRpdG9ySW5kZXgsXG5cdFx0XHRcdFx0dGFiRHRvOiB0YWJJbmZvLnRhYixcblx0XHRcdFx0XHRraW5kOiBUYWJNb2RlbE9wZXJhdGlvbktpbmQuVEFCX1VQREFURVxuXHRcdFx0XHR9KTtcblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHR0aGlzLl9wcm94eS4kYWNjZXB0VGFiT3BlcmF0aW9uKHtcblx0XHRcdGdyb3VwSWQsXG5cdFx0XHRpbmRleDogZWRpdG9ySW5kZXgsXG5cdFx0XHR0YWJEdG86IHRhYk9iamVjdCxcblx0XHRcdGtpbmQ6IFRhYk1vZGVsT3BlcmF0aW9uS2luZC5UQUJfT1BFTlxuXHRcdH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIENhbGxlZCB3aGVuIGEgdGFiIGlzIGNsb3NlZFxuXHQgKiBAcGFyYW0gZ3JvdXBJZCBUaGUgaWQgb2YgdGhlIGdyb3VwIHRoZSB0YWIgaXMgYmVpbmcgcmVtb3ZlZCBmcm9tXG5cdCAqIEBwYXJhbSBlZGl0b3JJbmRleCBUaGUgaW5kZXggb2YgdGhlIGVkaXRvciB3aXRoaW4gdGhhdCBncm91cFxuXHQgKi9cblx0cHJpdmF0ZSBfb25EaWRUYWJDbG9zZShncm91cElkOiBudW1iZXIsIGVkaXRvckluZGV4OiBudW1iZXIpIHtcblx0XHRjb25zdCBncm91cCA9IHRoaXMuX2VkaXRvckdyb3Vwc1NlcnZpY2UuZ2V0R3JvdXAoZ3JvdXBJZCk7XG5cdFx0Y29uc3QgdGFicyA9IHRoaXMuX2dyb3VwTG9va3VwLmdldChncm91cElkKT8udGFicztcblx0XHQvLyBTb21ldGhpbmcgaXMgd3Jvbmcgd2l0aCB0aGUgbW9kZWwgc3RhdGUgc28gd2UgcmVidWlsZFxuXHRcdGlmICghZ3JvdXAgfHwgIXRhYnMpIHtcblx0XHRcdHRoaXMuX2NyZWF0ZVRhYnNNb2RlbCgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHQvLyBTcGxpY2UgdGFiIGludG8gZ3JvdXAgYXQgaW5kZXggZWRpdG9ySW5kZXhcblx0XHRjb25zdCByZW1vdmVkVGFiID0gdGFicy5zcGxpY2UoZWRpdG9ySW5kZXgsIDEpO1xuXG5cdFx0Ly8gSW5kZXggbXVzdCBubyBsb25nZXIgYmUgdmFsaWQgc28gd2UgcmV0dXJuIHByZW1hdHVyZWx5XG5cdFx0aWYgKHJlbW92ZWRUYWIubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gVXBkYXRlIGxvb2t1cFxuXHRcdHRoaXMuX3RhYkluZm9Mb29rdXAuZGVsZXRlKHJlbW92ZWRUYWJbMF0/LmlkID8/ICcnKTtcblxuXHRcdGlmIChyZW1vdmVkVGFiWzBdPy5pbnB1dCBpbnN0YW5jZW9mIE11bHRpRGlmZkVkaXRvcklucHV0KSB7XG5cdFx0XHR0aGlzLl9tdWx0aURpZmZFZGl0b3JJbnB1dExpc3RlbmVycy5kZWxldGVBbmREaXNwb3NlKHJlbW92ZWRUYWJbMF0/LmlucHV0KTtcblx0XHR9XG5cblx0XHR0aGlzLl9wcm94eS4kYWNjZXB0VGFiT3BlcmF0aW9uKHtcblx0XHRcdGdyb3VwSWQsXG5cdFx0XHRpbmRleDogZWRpdG9ySW5kZXgsXG5cdFx0XHR0YWJEdG86IHJlbW92ZWRUYWJbMF0sXG5cdFx0XHRraW5kOiBUYWJNb2RlbE9wZXJhdGlvbktpbmQuVEFCX0NMT1NFXG5cdFx0fSk7XG5cdH1cblxuXHQvKipcblx0ICogQ2FsbGVkIHdoZW4gdGhlIGFjdGl2ZSB0YWIgY2hhbmdlc1xuXHQgKiBAcGFyYW0gZ3JvdXBJZCBUaGUgaWQgb2YgdGhlIGdyb3VwIHRoZSB0YWIgaXMgY29udGFpbmVkIGluXG5cdCAqIEBwYXJhbSBlZGl0b3JJbmRleCBUaGUgaW5kZXggb2YgdGhlIHRhYlxuXHQgKi9cblx0cHJpdmF0ZSBfb25EaWRUYWJBY3RpdmVDaGFuZ2UoZ3JvdXBJZDogbnVtYmVyLCBlZGl0b3JJbmRleDogbnVtYmVyKSB7XG5cdFx0Ly8gVE9ETyBAbHJhbW9zMTUgdXNlIHRoZSB0YWIgbG9va3VwIGhlcmUgaWYgcG9zc2libGUuIERvIHdlIGhhdmUgYW4gZWRpdG9yIGlucHV0PyFcblx0XHRjb25zdCB0YWJzID0gdGhpcy5fZ3JvdXBMb29rdXAuZ2V0KGdyb3VwSWQpPy50YWJzO1xuXHRcdGlmICghdGFicykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBhY3RpdmVUYWIgPSB0YWJzW2VkaXRvckluZGV4XTtcblx0XHQvLyBObyBuZWVkIHRvIGxvb3Agb3ZlciBhcyB0aGUgZXh0aG9zdCB1c2VzIHRoZSBtb3N0IHJlY2VudGx5IG1hcmtlZCBhY3RpdmUgdGFiXG5cdFx0YWN0aXZlVGFiLmlzQWN0aXZlID0gdHJ1ZTtcblx0XHQvLyBTZW5kIERUTyB1cGRhdGUgdG8gdGhlIGV4dGhvc3Rcblx0XHR0aGlzLl9wcm94eS4kYWNjZXB0VGFiT3BlcmF0aW9uKHtcblx0XHRcdGdyb3VwSWQsXG5cdFx0XHRpbmRleDogZWRpdG9ySW5kZXgsXG5cdFx0XHR0YWJEdG86IGFjdGl2ZVRhYixcblx0XHRcdGtpbmQ6IFRhYk1vZGVsT3BlcmF0aW9uS2luZC5UQUJfVVBEQVRFXG5cdFx0fSk7XG5cblx0fVxuXG5cdC8qKlxuXHQgKiBDYWxsZWQgd2hlbiB0aGUgZGlydHkgaW5kaWNhdG9yIG9uIHRoZSB0YWIgY2hhbmdlc1xuXHQgKiBAcGFyYW0gZ3JvdXBJZCBUaGUgaWQgb2YgdGhlIGdyb3VwIHRoZSB0YWIgaXMgaW5cblx0ICogQHBhcmFtIGVkaXRvckluZGV4IFRoZSBpbmRleCBvZiB0aGUgdGFiXG5cdCAqIEBwYXJhbSBlZGl0b3IgVGhlIGVkaXRvciBpbnB1dCByZXByZXNlbnRlZCBieSB0aGUgdGFiXG5cdCAqL1xuXHRwcml2YXRlIF9vbkRpZFRhYkRpcnR5KGdyb3VwSWQ6IG51bWJlciwgZWRpdG9ySW5kZXg6IG51bWJlciwgZWRpdG9yOiBFZGl0b3JJbnB1dCkge1xuXHRcdGNvbnN0IHRhYklkID0gdGhpcy5fZ2VuZXJhdGVUYWJJZChlZGl0b3IsIGdyb3VwSWQpO1xuXHRcdGNvbnN0IHRhYkluZm8gPSB0aGlzLl90YWJJbmZvTG9va3VwLmdldCh0YWJJZCk7XG5cdFx0Ly8gU29tZXRoaW5nIHdyb25nIHdpdGggdGhlIG1vZGVsIHN0YXRlIHNvIHdlIHJlYnVpbGRcblx0XHRpZiAoIXRhYkluZm8pIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoJ0ludmFsaWQgbW9kZWwgZm9yIGRpcnR5IGNoYW5nZSwgcmVidWlsZGluZycpO1xuXHRcdFx0dGhpcy5fY3JlYXRlVGFic01vZGVsKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRhYkluZm8udGFiLmlzRGlydHkgPSBlZGl0b3IuaXNEaXJ0eSgpO1xuXHRcdHRoaXMuX3Byb3h5LiRhY2NlcHRUYWJPcGVyYXRpb24oe1xuXHRcdFx0Z3JvdXBJZCxcblx0XHRcdGluZGV4OiBlZGl0b3JJbmRleCxcblx0XHRcdHRhYkR0bzogdGFiSW5mby50YWIsXG5cdFx0XHRraW5kOiBUYWJNb2RlbE9wZXJhdGlvbktpbmQuVEFCX1VQREFURVxuXHRcdH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIENhbGxlZCB3aGVuIHRoZSB0YWIgaXMgcGlubmVkL3VucGlubmVkXG5cdCAqIEBwYXJhbSBncm91cElkIFRoZSBpZCBvZiB0aGUgZ3JvdXAgdGhlIHRhYiBpcyBpblxuXHQgKiBAcGFyYW0gZWRpdG9ySW5kZXggVGhlIGluZGV4IG9mIHRoZSB0YWJcblx0ICogQHBhcmFtIGVkaXRvciBUaGUgZWRpdG9yIGlucHV0IHJlcHJlc2VudGVkIGJ5IHRoZSB0YWJcblx0ICovXG5cdHByaXZhdGUgX29uRGlkVGFiUGluQ2hhbmdlKGdyb3VwSWQ6IG51bWJlciwgZWRpdG9ySW5kZXg6IG51bWJlciwgZWRpdG9yOiBFZGl0b3JJbnB1dCkge1xuXHRcdGNvbnN0IHRhYklkID0gdGhpcy5fZ2VuZXJhdGVUYWJJZChlZGl0b3IsIGdyb3VwSWQpO1xuXHRcdGNvbnN0IHRhYkluZm8gPSB0aGlzLl90YWJJbmZvTG9va3VwLmdldCh0YWJJZCk7XG5cdFx0Y29uc3QgZ3JvdXAgPSB0YWJJbmZvPy5ncm91cDtcblx0XHRjb25zdCB0YWIgPSB0YWJJbmZvPy50YWI7XG5cdFx0Ly8gU29tZXRoaW5nIHdyb25nIHdpdGggdGhlIG1vZGVsIHN0YXRlIHNvIHdlIHJlYnVpbGRcblx0XHRpZiAoIWdyb3VwIHx8ICF0YWIpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoJ0ludmFsaWQgbW9kZWwgZm9yIHN0aWNreSBjaGFuZ2UsIHJlYnVpbGRpbmcnKTtcblx0XHRcdHRoaXMuX2NyZWF0ZVRhYnNNb2RlbCgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHQvLyBXaGV0aGVyIG9yIG5vdCB0aGUgdGFiIGhhcyB0aGUgcGluIGljb24gKGludGVybmFsbHkgaXQncyBjYWxsZWQgc3RpY2t5KVxuXHRcdHRhYi5pc1Bpbm5lZCA9IGdyb3VwLmlzU3RpY2t5KGVkaXRvckluZGV4KTtcblx0XHR0aGlzLl9wcm94eS4kYWNjZXB0VGFiT3BlcmF0aW9uKHtcblx0XHRcdGdyb3VwSWQsXG5cdFx0XHRpbmRleDogZWRpdG9ySW5kZXgsXG5cdFx0XHR0YWJEdG86IHRhYixcblx0XHRcdGtpbmQ6IFRhYk1vZGVsT3BlcmF0aW9uS2luZC5UQUJfVVBEQVRFXG5cdFx0fSk7XG5cdH1cblxuXHQvKipcbiAqIENhbGxlZCB3aGVuIHRoZSB0YWIgaXMgcHJldmlldyAvIHVucHJldmlld2VkXG4gKiBAcGFyYW0gZ3JvdXBJZCBUaGUgaWQgb2YgdGhlIGdyb3VwIHRoZSB0YWIgaXMgaW5cbiAqIEBwYXJhbSBlZGl0b3JJbmRleCBUaGUgaW5kZXggb2YgdGhlIHRhYlxuICogQHBhcmFtIGVkaXRvciBUaGUgZWRpdG9yIGlucHV0IHJlcHJlc2VudGVkIGJ5IHRoZSB0YWJcbiAqL1xuXHRwcml2YXRlIF9vbkRpZFRhYlByZXZpZXdDaGFuZ2UoZ3JvdXBJZDogbnVtYmVyLCBlZGl0b3JJbmRleDogbnVtYmVyLCBlZGl0b3I6IEVkaXRvcklucHV0KSB7XG5cdFx0Y29uc3QgdGFiSWQgPSB0aGlzLl9nZW5lcmF0ZVRhYklkKGVkaXRvciwgZ3JvdXBJZCk7XG5cdFx0Y29uc3QgdGFiSW5mbyA9IHRoaXMuX3RhYkluZm9Mb29rdXAuZ2V0KHRhYklkKTtcblx0XHRjb25zdCBncm91cCA9IHRhYkluZm8/Lmdyb3VwO1xuXHRcdGNvbnN0IHRhYiA9IHRhYkluZm8/LnRhYjtcblx0XHQvLyBTb21ldGhpbmcgd3Jvbmcgd2l0aCB0aGUgbW9kZWwgc3RhdGUgc28gd2UgcmVidWlsZFxuXHRcdGlmICghZ3JvdXAgfHwgIXRhYikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcignSW52YWxpZCBtb2RlbCBmb3Igc3RpY2t5IGNoYW5nZSwgcmVidWlsZGluZycpO1xuXHRcdFx0dGhpcy5fY3JlYXRlVGFic01vZGVsKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdC8vIFdoZXRoZXIgb3Igbm90IHRoZSB0YWIgaGFzIHRoZSBwaW4gaWNvbiAoaW50ZXJuYWxseSBpdCdzIGNhbGxlZCBwaW5uZWQpXG5cdFx0dGFiLmlzUHJldmlldyA9ICFncm91cC5pc1Bpbm5lZChlZGl0b3JJbmRleCk7XG5cdFx0dGhpcy5fcHJveHkuJGFjY2VwdFRhYk9wZXJhdGlvbih7XG5cdFx0XHRraW5kOiBUYWJNb2RlbE9wZXJhdGlvbktpbmQuVEFCX1VQREFURSxcblx0XHRcdGdyb3VwSWQsXG5cdFx0XHR0YWJEdG86IHRhYixcblx0XHRcdGluZGV4OiBlZGl0b3JJbmRleFxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfb25EaWRUYWJNb3ZlKGdyb3VwSWQ6IG51bWJlciwgZWRpdG9ySW5kZXg6IG51bWJlciwgb2xkRWRpdG9ySW5kZXg6IG51bWJlciwgZWRpdG9yOiBFZGl0b3JJbnB1dCkge1xuXHRcdGNvbnN0IHRhYnMgPSB0aGlzLl9ncm91cExvb2t1cC5nZXQoZ3JvdXBJZCk/LnRhYnM7XG5cdFx0Ly8gU29tZXRoaW5nIHdyb25nIHdpdGggdGhlIG1vZGVsIHN0YXRlIHNvIHdlIHJlYnVpbGRcblx0XHRpZiAoIXRhYnMpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoJ0ludmFsaWQgbW9kZWwgZm9yIG1vdmUgY2hhbmdlLCByZWJ1aWxkaW5nJyk7XG5cdFx0XHR0aGlzLl9jcmVhdGVUYWJzTW9kZWwoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBNb3ZlIHRhYiBmcm9tIG9sZCBpbmRleCB0byBuZXcgaW5kZXhcblx0XHRjb25zdCByZW1vdmVkVGFiID0gdGFicy5zcGxpY2Uob2xkRWRpdG9ySW5kZXgsIDEpO1xuXHRcdGlmIChyZW1vdmVkVGFiLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0YWJzLnNwbGljZShlZGl0b3JJbmRleCwgMCwgcmVtb3ZlZFRhYlswXSk7XG5cblx0XHQvLyBOb3RpZnkgZXh0aG9zdCBvZiBtb3ZlXG5cdFx0dGhpcy5fcHJveHkuJGFjY2VwdFRhYk9wZXJhdGlvbih7XG5cdFx0XHRraW5kOiBUYWJNb2RlbE9wZXJhdGlvbktpbmQuVEFCX01PVkUsXG5cdFx0XHRncm91cElkLFxuXHRcdFx0dGFiRHRvOiByZW1vdmVkVGFiWzBdLFxuXHRcdFx0aW5kZXg6IGVkaXRvckluZGV4LFxuXHRcdFx0b2xkSW5kZXg6IG9sZEVkaXRvckluZGV4XG5cdFx0fSk7XG5cdH1cblxuXHQvKipcblx0ICogQnVpbGRzIHRoZSBtb2RlbCBmcm9tIHNjcmF0Y2ggYmFzZWQgb24gdGhlIGN1cnJlbnQgc3RhdGUgb2YgdGhlIGVkaXRvciBzZXJ2aWNlLlxuXHQgKi9cblx0cHJpdmF0ZSBfY3JlYXRlVGFic01vZGVsKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9lZGl0b3JHcm91cHNTZXJ2aWNlLmdyb3Vwcy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybjsgLy8gc2tpcCB0aGlzIGludmFsaWQgc3RhdGUsIGl0IG1heSBoYXBwZW4gd2hlbiB0aGUgZW50aXJlIGVkaXRvciBhcmVhIGlzIHRyYW5zaXRpb25pbmcgdG8gb3RoZXIgc3RhdGUgKFwiZWRpdG9yIHdvcmtpbmcgc2V0c1wiKVxuXHRcdH1cblxuXHRcdHRoaXMuX3RhYkdyb3VwTW9kZWwgPSBbXTtcblx0XHR0aGlzLl9ncm91cExvb2t1cC5jbGVhcigpO1xuXHRcdHRoaXMuX3RhYkluZm9Mb29rdXAuY2xlYXIoKTtcblx0XHRsZXQgdGFiczogSUVkaXRvclRhYkR0b1tdID0gW107XG5cdFx0Zm9yIChjb25zdCBncm91cCBvZiB0aGlzLl9lZGl0b3JHcm91cHNTZXJ2aWNlLmdyb3Vwcykge1xuXHRcdFx0Y29uc3QgY3VycmVudFRhYkdyb3VwTW9kZWw6IElFZGl0b3JUYWJHcm91cER0byA9IHtcblx0XHRcdFx0Z3JvdXBJZDogZ3JvdXAuaWQsXG5cdFx0XHRcdGlzQWN0aXZlOiBncm91cC5pZCA9PT0gdGhpcy5fZWRpdG9yR3JvdXBzU2VydmljZS5hY3RpdmVHcm91cC5pZCxcblx0XHRcdFx0dmlld0NvbHVtbjogZWRpdG9yR3JvdXBUb0NvbHVtbih0aGlzLl9lZGl0b3JHcm91cHNTZXJ2aWNlLCBncm91cCksXG5cdFx0XHRcdHRhYnM6IFtdXG5cdFx0XHR9O1xuXHRcdFx0Z3JvdXAuZWRpdG9ycy5mb3JFYWNoKChlZGl0b3IsIGVkaXRvckluZGV4KSA9PiB7XG5cdFx0XHRcdGNvbnN0IHRhYiA9IHRoaXMuX2J1aWxkVGFiT2JqZWN0KGdyb3VwLCBlZGl0b3IsIGVkaXRvckluZGV4KTtcblx0XHRcdFx0dGFicy5wdXNoKHRhYik7XG5cdFx0XHRcdC8vIEFkZCBpbmZvcm1hdGlvbiBhYm91dCB0aGUgdGFiIHRvIHRoZSBsb29rdXBcblx0XHRcdFx0dGhpcy5fdGFiSW5mb0xvb2t1cC5zZXQodGhpcy5fZ2VuZXJhdGVUYWJJZChlZGl0b3IsIGdyb3VwLmlkKSwge1xuXHRcdFx0XHRcdGdyb3VwLFxuXHRcdFx0XHRcdHRhYixcblx0XHRcdFx0XHRlZGl0b3JJbnB1dDogZWRpdG9yXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cdFx0XHRjdXJyZW50VGFiR3JvdXBNb2RlbC50YWJzID0gdGFicztcblx0XHRcdHRoaXMuX3RhYkdyb3VwTW9kZWwucHVzaChjdXJyZW50VGFiR3JvdXBNb2RlbCk7XG5cdFx0XHR0aGlzLl9ncm91cExvb2t1cC5zZXQoZ3JvdXAuaWQsIGN1cnJlbnRUYWJHcm91cE1vZGVsKTtcblx0XHRcdHRhYnMgPSBbXTtcblx0XHR9XG5cdFx0Ly8gbm90aWZ5IHRoZSBleHQgaG9zdCBvZiB0aGUgbmV3IG1vZGVsXG5cdFx0dGhpcy5fcHJveHkuJGFjY2VwdEVkaXRvclRhYk1vZGVsKHRoaXMuX3RhYkdyb3VwTW9kZWwpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFRoZSBtYWluIGhhbmRsZXIgZm9yIHRoZSB0YWIgZXZlbnRzXG5cdCAqIEBwYXJhbSBldmVudHMgVGhlIGxpc3Qgb2YgZXZlbnRzIHRvIHByb2Nlc3Ncblx0ICovXG5cdHByaXZhdGUgX3VwZGF0ZVRhYnNNb2RlbChjaGFuZ2VFdmVudDogSUVkaXRvcnNDaGFuZ2VFdmVudCk6IHZvaWQge1xuXHRcdGNvbnN0IGV2ZW50ID0gY2hhbmdlRXZlbnQuZXZlbnQ7XG5cdFx0Y29uc3QgZ3JvdXBJZCA9IGNoYW5nZUV2ZW50Lmdyb3VwSWQ7XG5cdFx0c3dpdGNoIChldmVudC5raW5kKSB7XG5cdFx0XHRjYXNlIEdyb3VwTW9kZWxDaGFuZ2VLaW5kLkdST1VQX0FDVElWRTpcblx0XHRcdFx0aWYgKGdyb3VwSWQgPT09IHRoaXMuX2VkaXRvckdyb3Vwc1NlcnZpY2UuYWN0aXZlR3JvdXAuaWQpIHtcblx0XHRcdFx0XHR0aGlzLl9vbkRpZEdyb3VwQWN0aXZhdGUoKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdGNhc2UgR3JvdXBNb2RlbENoYW5nZUtpbmQuRURJVE9SX0xBQkVMOlxuXHRcdFx0XHRpZiAoZXZlbnQuZWRpdG9yICE9PSB1bmRlZmluZWQgJiYgZXZlbnQuZWRpdG9ySW5kZXggIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdHRoaXMuX29uRGlkVGFiTGFiZWxDaGFuZ2UoZ3JvdXBJZCwgZXZlbnQuZWRpdG9yLCBldmVudC5lZGl0b3JJbmRleCk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdGNhc2UgR3JvdXBNb2RlbENoYW5nZUtpbmQuRURJVE9SX09QRU46XG5cdFx0XHRcdGlmIChldmVudC5lZGl0b3IgIT09IHVuZGVmaW5lZCAmJiBldmVudC5lZGl0b3JJbmRleCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRUYWJPcGVuKGdyb3VwSWQsIGV2ZW50LmVkaXRvciwgZXZlbnQuZWRpdG9ySW5kZXgpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRjYXNlIEdyb3VwTW9kZWxDaGFuZ2VLaW5kLkVESVRPUl9DTE9TRTpcblx0XHRcdFx0aWYgKGV2ZW50LmVkaXRvckluZGV4ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHR0aGlzLl9vbkRpZFRhYkNsb3NlKGdyb3VwSWQsIGV2ZW50LmVkaXRvckluZGV4KTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0Y2FzZSBHcm91cE1vZGVsQ2hhbmdlS2luZC5FRElUT1JfQUNUSVZFOlxuXHRcdFx0XHRpZiAoZXZlbnQuZWRpdG9ySW5kZXggIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdHRoaXMuX29uRGlkVGFiQWN0aXZlQ2hhbmdlKGdyb3VwSWQsIGV2ZW50LmVkaXRvckluZGV4KTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0Y2FzZSBHcm91cE1vZGVsQ2hhbmdlS2luZC5FRElUT1JfRElSVFk6XG5cdFx0XHRcdGlmIChldmVudC5lZGl0b3JJbmRleCAhPT0gdW5kZWZpbmVkICYmIGV2ZW50LmVkaXRvciAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRUYWJEaXJ0eShncm91cElkLCBldmVudC5lZGl0b3JJbmRleCwgZXZlbnQuZWRpdG9yKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0Y2FzZSBHcm91cE1vZGVsQ2hhbmdlS2luZC5FRElUT1JfU1RJQ0tZOlxuXHRcdFx0XHRpZiAoZXZlbnQuZWRpdG9ySW5kZXggIT09IHVuZGVmaW5lZCAmJiBldmVudC5lZGl0b3IgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdHRoaXMuX29uRGlkVGFiUGluQ2hhbmdlKGdyb3VwSWQsIGV2ZW50LmVkaXRvckluZGV4LCBldmVudC5lZGl0b3IpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRjYXNlIEdyb3VwTW9kZWxDaGFuZ2VLaW5kLkVESVRPUl9QSU46XG5cdFx0XHRcdGlmIChldmVudC5lZGl0b3JJbmRleCAhPT0gdW5kZWZpbmVkICYmIGV2ZW50LmVkaXRvciAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRUYWJQcmV2aWV3Q2hhbmdlKGdyb3VwSWQsIGV2ZW50LmVkaXRvckluZGV4LCBldmVudC5lZGl0b3IpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRjYXNlIEdyb3VwTW9kZWxDaGFuZ2VLaW5kLkVESVRPUl9UUkFOU0lFTlQ6XG5cdFx0XHRcdC8vIEN1cnJlbnRseSBub3QgZXhwb3NlZCBpbiB0aGUgQVBJXG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBHcm91cE1vZGVsQ2hhbmdlS2luZC5FRElUT1JTX1NFTEVDVElPTjpcblx0XHRcdFx0Ly8gTXVsdGktc2VsZWN0IHN0YXRlIG9mIGVkaXRvcnMgaXMgd29ya2JlbmNoLWludGVybmFsIGFuZCBub3QgZXhwb3NlZCBpbiB0aGUgdGFicyBBUEkuXG5cdFx0XHRcdC8vIFRyZWF0IGFzIG5vLW9wIHNvIHdlIGRvIG5vdCByZWJ1aWxkIHRoZSBlbnRpcmUgbW9kZWwgKHdoaWNoIHdvdWxkIGludmFsaWRhdGVcblx0XHRcdFx0Ly8gYW55IGB2c2NvZGUuVGFiYCByZWZlcmVuY2VzIHRoZSBleHRlbnNpb24gaXMgY3VycmVudGx5IGhvbGRpbmcpLlxuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgR3JvdXBNb2RlbENoYW5nZUtpbmQuRURJVE9SX01PVkU6XG5cdFx0XHRcdGlmIChpc0dyb3VwRWRpdG9yTW92ZUV2ZW50KGV2ZW50KSAmJiBldmVudC5lZGl0b3IgJiYgZXZlbnQuZWRpdG9ySW5kZXggIT09IHVuZGVmaW5lZCAmJiBldmVudC5vbGRFZGl0b3JJbmRleCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRUYWJNb3ZlKGdyb3VwSWQsIGV2ZW50LmVkaXRvckluZGV4LCBldmVudC5vbGRFZGl0b3JJbmRleCwgZXZlbnQuZWRpdG9yKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0Ly8gSWYgaXQncyBub3QgYW4gb3B0aW1pemVkIGNhc2Ugd2UgcmVidWlsZCB0aGUgdGFicyBtb2RlbCBmcm9tIHNjcmF0Y2hcblx0XHRcdFx0dGhpcy5fY3JlYXRlVGFic01vZGVsKCk7XG5cdFx0fVxuXHR9XG5cdC8vI3JlZ2lvbiBNZXNzYWdlcyByZWNlaXZlZCBmcm9tIEV4dCBIb3N0XG5cdCRtb3ZlVGFiKHRhYklkOiBzdHJpbmcsIGluZGV4OiBudW1iZXIsIHZpZXdDb2x1bW46IEVkaXRvckdyb3VwQ29sdW1uLCBwcmVzZXJ2ZUZvY3VzPzogYm9vbGVhbik6IHZvaWQge1xuXHRcdGNvbnN0IGdyb3VwSWQgPSBjb2x1bW5Ub0VkaXRvckdyb3VwKHRoaXMuX2VkaXRvckdyb3Vwc1NlcnZpY2UsIHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLCB2aWV3Q29sdW1uKTtcblx0XHRjb25zdCB0YWJJbmZvID0gdGhpcy5fdGFiSW5mb0xvb2t1cC5nZXQodGFiSWQpO1xuXHRcdGNvbnN0IHRhYiA9IHRhYkluZm8/LnRhYjtcblx0XHRpZiAoIXRhYikge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBBdHRlbXB0ZWQgdG8gY2xvc2UgdGFiIHdpdGggaWQgJHt0YWJJZH0gd2hpY2ggZG9lcyBub3QgZXhpc3RgKTtcblx0XHR9XG5cdFx0bGV0IHRhcmdldEdyb3VwOiBJRWRpdG9yR3JvdXAgfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3Qgc291cmNlR3JvdXAgPSB0aGlzLl9lZGl0b3JHcm91cHNTZXJ2aWNlLmdldEdyb3VwKHRhYkluZm8uZ3JvdXAuaWQpO1xuXHRcdGlmICghc291cmNlR3JvdXApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Ly8gSWYgZ3JvdXAgaW5kZXggaXMgb3V0IG9mIGJvdW5kcyB0aGVuIHdlIG1ha2UgYSBuZXcgb25lIHRoYXQncyB0byB0aGUgcmlnaHQgb2YgdGhlIGxhc3QgZ3JvdXBcblx0XHRpZiAodGhpcy5fZ3JvdXBMb29rdXAuZ2V0KGdyb3VwSWQpID09PSB1bmRlZmluZWQpIHtcblx0XHRcdGxldCBkaXJlY3Rpb24gPSBHcm91cERpcmVjdGlvbi5SSUdIVDtcblx0XHRcdC8vIE1ha2Ugc3VyZSB3ZSByZXNwZWN0IHRoZSB1c2VyJ3MgcHJlZmVycmVkIHNpZGUgZGlyZWN0aW9uXG5cdFx0XHRpZiAodmlld0NvbHVtbiA9PT0gU0lERV9HUk9VUCkge1xuXHRcdFx0XHRkaXJlY3Rpb24gPSBwcmVmZXJyZWRTaWRlQnlTaWRlR3JvdXBEaXJlY3Rpb24odGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdFx0fVxuXHRcdFx0dGFyZ2V0R3JvdXAgPSB0aGlzLl9lZGl0b3JHcm91cHNTZXJ2aWNlLmFkZEdyb3VwKHRoaXMuX2VkaXRvckdyb3Vwc1NlcnZpY2UuZ3JvdXBzW3RoaXMuX2VkaXRvckdyb3Vwc1NlcnZpY2UuZ3JvdXBzLmxlbmd0aCAtIDFdLCBkaXJlY3Rpb24pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0YXJnZXRHcm91cCA9IHRoaXMuX2VkaXRvckdyb3Vwc1NlcnZpY2UuZ2V0R3JvdXAoZ3JvdXBJZCk7XG5cdFx0fVxuXHRcdGlmICghdGFyZ2V0R3JvdXApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBTaW1pbGFyIGxvZ2ljIHRvIGlmIGluZGV4IGlzIG91dCBvZiBib3VuZHMgd2UgcGxhY2UgaXQgYXQgdGhlIGVuZFxuXHRcdGlmIChpbmRleCA8IDAgfHwgaW5kZXggPiB0YXJnZXRHcm91cC5lZGl0b3JzLmxlbmd0aCkge1xuXHRcdFx0aW5kZXggPSB0YXJnZXRHcm91cC5lZGl0b3JzLmxlbmd0aDtcblx0XHR9XG5cdFx0Ly8gRmluZCB0aGUgY29ycmVjdCBFZGl0b3JJbnB1dCB1c2luZyB0aGUgdGFiIGluZm9cblx0XHRjb25zdCBlZGl0b3JJbnB1dCA9IHRhYkluZm8/LmVkaXRvcklucHV0O1xuXHRcdGlmICghZWRpdG9ySW5wdXQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Ly8gTW92ZSB0aGUgZWRpdG9yIHRvIHRoZSB0YXJnZXQgZ3JvdXBcblx0XHRzb3VyY2VHcm91cC5tb3ZlRWRpdG9yKGVkaXRvcklucHV0LCB0YXJnZXRHcm91cCwgeyBpbmRleCwgcHJlc2VydmVGb2N1cyB9KTtcblx0XHRyZXR1cm47XG5cdH1cblxuXHRhc3luYyAkY2xvc2VUYWIodGFiSWRzOiBzdHJpbmdbXSwgcHJlc2VydmVGb2N1cz86IGJvb2xlYW4pOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRjb25zdCBncm91cHM6IE1hcDxJRWRpdG9yR3JvdXAsIEVkaXRvcklucHV0W10+ID0gbmV3IE1hcCgpO1xuXHRcdGZvciAoY29uc3QgdGFiSWQgb2YgdGFiSWRzKSB7XG5cdFx0XHRjb25zdCB0YWJJbmZvID0gdGhpcy5fdGFiSW5mb0xvb2t1cC5nZXQodGFiSWQpO1xuXHRcdFx0Y29uc3QgdGFiID0gdGFiSW5mbz8udGFiO1xuXHRcdFx0Y29uc3QgZ3JvdXAgPSB0YWJJbmZvPy5ncm91cDtcblx0XHRcdGNvbnN0IGVkaXRvclRhYiA9IHRhYkluZm8/LmVkaXRvcklucHV0O1xuXHRcdFx0Ly8gSWYgbm90IGZvdW5kIHNraXBcblx0XHRcdGlmICghZ3JvdXAgfHwgIXRhYiB8fCAhdGFiSW5mbyB8fCAhZWRpdG9yVGFiKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgZ3JvdXBFZGl0b3JzID0gZ3JvdXBzLmdldChncm91cCk7XG5cdFx0XHRpZiAoIWdyb3VwRWRpdG9ycykge1xuXHRcdFx0XHRncm91cHMuc2V0KGdyb3VwLCBbZWRpdG9yVGFiXSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRncm91cEVkaXRvcnMucHVzaChlZGl0b3JUYWIpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHQvLyBMb29wIG92ZXIga2V5cyBvZiB0aGUgZ3JvdXBzIG1hcCBhbmQgY2FsbCBjbG9zZUVkaXRvcnNcblx0XHRjb25zdCByZXN1bHRzOiBib29sZWFuW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IFtncm91cCwgZWRpdG9yc10gb2YgZ3JvdXBzKSB7XG5cdFx0XHRyZXN1bHRzLnB1c2goYXdhaXQgZ3JvdXAuY2xvc2VFZGl0b3JzKGVkaXRvcnMsIHsgcHJlc2VydmVGb2N1cyB9KSk7XG5cdFx0fVxuXHRcdC8vIFRPRE8gQGpyaWVrZW4gVGhpcyBpc24ndCBxdWl0ZSByaWdodCBob3cgY2FuIHdlIHNheSB0cnVlIGZvciBzb21lIGJ1dCBub3Qgb3RoZXJzP1xuXHRcdHJldHVybiByZXN1bHRzLmV2ZXJ5KHJlc3VsdCA9PiByZXN1bHQpO1xuXHR9XG5cblx0YXN5bmMgJGNsb3NlR3JvdXAoZ3JvdXBJZHM6IG51bWJlcltdLCBwcmVzZXJ2ZUZvY3VzPzogYm9vbGVhbik6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGNvbnN0IGdyb3VwQ2xvc2VSZXN1bHRzOiBib29sZWFuW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGdyb3VwSWQgb2YgZ3JvdXBJZHMpIHtcblx0XHRcdGNvbnN0IGdyb3VwID0gdGhpcy5fZWRpdG9yR3JvdXBzU2VydmljZS5nZXRHcm91cChncm91cElkKTtcblx0XHRcdGlmIChncm91cCkge1xuXHRcdFx0XHRncm91cENsb3NlUmVzdWx0cy5wdXNoKGF3YWl0IGdyb3VwLmNsb3NlQWxsRWRpdG9ycygpKTtcblx0XHRcdFx0Ly8gTWFrZSBzdXJlIGdyb3VwIGlzIGVtcHR5IGJ1dCBzdGlsbCB0aGVyZSBiZWZvcmUgcmVtb3ZpbmcgaXRcblx0XHRcdFx0aWYgKGdyb3VwLmNvdW50ID09PSAwICYmIHRoaXMuX2VkaXRvckdyb3Vwc1NlcnZpY2UuZ2V0R3JvdXAoZ3JvdXAuaWQpKSB7XG5cdFx0XHRcdFx0dGhpcy5fZWRpdG9yR3JvdXBzU2VydmljZS5yZW1vdmVHcm91cChncm91cCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGdyb3VwQ2xvc2VSZXN1bHRzLmV2ZXJ5KHJlc3VsdCA9PiByZXN1bHQpO1xuXHR9XG5cdC8vI2VuZHJlZ2lvblxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGFBQWE7QUFDdEIsU0FBUyxlQUFlLHVCQUF1QjtBQUMvQyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsbUJBQW1CO0FBQzVCLFNBQXNCLGdCQUE0RSxhQUF3QyxjQUFjLDZCQUErQztBQUN2TSxTQUFTLHdCQUF3QixzQkFBc0Isd0JBQXdCO0FBQy9FLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsOEJBQThCO0FBRXZDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsdUNBQXVDO0FBQ2hELFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMscUJBQXdDLDJCQUEyQjtBQUM1RSxTQUFTLGdCQUE4QixzQkFBc0IseUNBQXlDO0FBQ3RHLFNBQThCLGdCQUFnQixrQkFBa0I7QUFDaEUsU0FBUyw0QkFBNkM7QUFRL0MsSUFBTSx1QkFBTixNQUFnRTtBQUFBLEVBYXRFLFlBQ0MsZ0JBQ3VDLHNCQUNDLHVCQUNWLGFBQ2QsZUFDZjtBQUpzQztBQUNDO0FBQ1Y7QUFmL0IsU0FBaUIsY0FBYyxJQUFJLGdCQUFnQjtBQUduRDtBQUFBLFNBQVEsaUJBQXVDLENBQUM7QUFFaEQ7QUFBQSxT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
