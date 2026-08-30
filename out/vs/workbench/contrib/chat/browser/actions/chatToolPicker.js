import { assertNever } from "../../../../../base/common/assert.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { toErrorMessage } from "../../../../../base/common/errorMessage.js";
import { Emitter, Event } from "../../../../../base/common/event.js";
import { DisposableStore } from "../../../../../base/common/lifecycle.js";
import { ThemeIcon } from "../../../../../base/common/themables.js";
import { localize } from "../../../../../nls.js";
import { ICommandService } from "../../../../../platform/commands/common/commands.js";
import { IDialogService } from "../../../../../platform/dialogs/common/dialogs.js";
import { ExtensionIdentifier } from "../../../../../platform/extensions/common/extensions.js";
import { FileSystemProviderCapabilities, IFileService } from "../../../../../platform/files/common/files.js";
import { INotificationService } from "../../../../../platform/notification/common/notification.js";
import { IQuickInputService } from "../../../../../platform/quickinput/common/quickInput.js";
import { ITelemetryService } from "../../../../../platform/telemetry/common/telemetry.js";
import { IEditorService } from "../../../../services/editor/common/editorService.js";
import { ITextFileService } from "../../../../services/textfile/common/textfiles.js";
import { ExtensionEditorTab, IExtensionsWorkbenchService } from "../../../extensions/common/extensions.js";
import { McpCommandIds } from "../../../mcp/common/mcpCommandIds.js";
import { IMcpRegistry } from "../../../mcp/common/mcpRegistryTypes.js";
import { IMcpService, IMcpWorkbenchService, McpConnectionState, McpServerCacheState, McpServerEditorTab } from "../../../mcp/common/mcpTypes.js";
import { startServerAndWaitForLiveTools } from "../../../mcp/common/mcpTypesUtils.js";
import { ILanguageModelToolsConfirmationService } from "../../common/tools/languageModelToolsConfirmationService.js";
import { ILanguageModelToolsService, ToolAndToolSetEnablementMap, ToolDataSource } from "../../common/tools/languageModelToolsService.js";
import { ConfigureToolSets, deleteToolSetFromFileContents } from "../tools/toolSetsContribution.js";
var BucketOrdinal = /* @__PURE__ */ ((BucketOrdinal2) => {
  BucketOrdinal2[BucketOrdinal2["User"] = 0] = "User";
  BucketOrdinal2[BucketOrdinal2["BuiltIn"] = 1] = "BuiltIn";
  BucketOrdinal2[BucketOrdinal2["Mcp"] = 2] = "Mcp";
  BucketOrdinal2[BucketOrdinal2["Extension"] = 3] = "Extension";
  return BucketOrdinal2;
})(BucketOrdinal || {});
function isBucketTreeItem(item) {
  return item.itemType === "bucket";
}
function isToolSetTreeItem(item) {
  return item.itemType === "toolset";
}
function isToolTreeItem(item) {
  return item.itemType === "tool";
}
function isCallbackTreeItem(item) {
  return item.itemType === "callback";
}
function mapIconToTreeItem(icon, useDefaultToolIcon = false) {
  if (!icon) {
    if (useDefaultToolIcon) {
      return { iconClass: ThemeIcon.asClassName(Codicon.tools) };
    }
    return {};
  }
  if (ThemeIcon.isThemeIcon(icon)) {
    return { iconClass: ThemeIcon.asClassName(icon) };
  } else {
    return { iconPath: icon };
  }
}
function createToolTreeItemFromData(tool, checked) {
  const iconProps = mapIconToTreeItem(tool.icon, true);
  return {
    itemType: "tool",
    tool,
    id: tool.id,
    label: tool.toolReferenceName ?? tool.displayName,
    description: tool.userDescription ?? tool.modelDescription,
    checked,
    ...iconProps
  };
}
function createToolSetTreeItem(toolset, checked, editorService, removeToolSet) {
  const iconProps = mapIconToTreeItem(toolset.icon);
  const buttons = [];
  if (toolset.source.type === "user") {
    const resource = toolset.source.file;
    buttons.push({
      iconClass: ThemeIcon.asClassName(Codicon.edit),
      tooltip: localize("editUserBucket", "Edit Tool Set"),
      action: () => editorService.openEditor({ resource })
    }, {
      iconClass: ThemeIcon.asClassName(Codicon.trash),
      tooltip: localize("deleteUserBucket", "Delete Tool Set"),
      action: () => removeToolSet(toolset)
    });
  }
  return {
    itemType: "toolset",
    toolset,
    buttons,
    id: toolset.id,
    label: toolset.referenceName,
    description: toolset.description,
    checked,
    children: void 0,
    collapsed: true,
    ...iconProps
  };
}
async function showToolsPicker(accessor, placeHolder, source, description, getToolsEntries, model, token) {
  const quickPickService = accessor.get(IQuickInputService);
  const mcpService = accessor.get(IMcpService);
  const mcpRegistry = accessor.get(IMcpRegistry);
  const commandService = accessor.get(ICommandService);
  const extensionsWorkbenchService = accessor.get(IExtensionsWorkbenchService);
  const editorService = accessor.get(IEditorService);
  const mcpWorkbenchService = accessor.get(IMcpWorkbenchService);
  const toolsService = accessor.get(ILanguageModelToolsService);
  const confirmationService = accessor.get(ILanguageModelToolsConfirmationService);
  const telemetryService = accessor.get(ITelemetryService);
  const dialogService = accessor.get(IDialogService);
  const textFileService = accessor.get(ITextFileService);
  const fileService = accessor.get(IFileService);
  const notificationService = accessor.get(INotificationService);
  const removeToolSet = async (toolSet) => {
    if (toolSet.source.type !== "user") {
      return;
    }
    const result = await dialogService.confirm({
      type: "warning",
      message: localize("deleteToolSet.confirm.message", "Delete tool set '{0}'?", toolSet.referenceName),
      detail: localize("deleteToolSet.confirm.detail", "This removes the tool set definition from {0}.", toolSet.source.label),
      primaryButton: localize("deleteToolSet.confirm.primary", "Delete")
    });
    if (!result.confirmed) {
      return;
    }
    try {
      const rawContent = await textFileService.read(toolSet.source.file);
      const updated = deleteToolSetFromFileContents(rawContent.value, toolSet.referenceName);
      if (!updated) {
        return;
      }
      if (updated.isEmpty) {
        const useTrash = fileService.hasCapability(toolSet.source.file, FileSystemProviderCapabilities.Trash);
        await fileService.del(toolSet.source.file, { useTrash });
      } else {
        await textFileService.write(toolSet.source.file, updated.contents);
      }
    } catch (error) {
      notificationService.error(localize("deleteToolSet.error", "Failed to delete tool set '{0}': {1}", toolSet.referenceName, toErrorMessage(error)));
    }
  };
  const mcpServerByTool = /* @__PURE__ */ new Map();
  for (const server of mcpService.servers.get()) {
    for (const tool of server.tools.get()) {
      mcpServerByTool.set(tool.id, server);
    }
  }
  function computeItems(previousToolsEntries) {
    let toolsEntries = getToolsEntries ? new Map([...getToolsEntries()].map(([k, enabled]) => [k.id, enabled])) : void 0;
    if (!toolsEntries) {
      const defaultEntries = /* @__PURE__ */ new Map();
      for (const tool of toolsService.getTools(model)) {
        if (tool.canBeReferencedInPrompt) {
          defaultEntries.set(tool, false);
        }
      }
      for (const toolSet of toolsService.getToolSetsForModel(model)) {
        if (toolSet.hiddenInToolsPicker) {
          continue;
        }
        defaultEntries.set(toolSet, false);
      }
      toolsEntries = defaultEntries;
    }
    for (const [entry, enabled] of previousToolsEntries ?? []) {
      toolsEntries.set(entry.id, enabled);
    }
    const treeItems = [];
    const bucketMap = /* @__PURE__ */ new Map();
    const getKey = (source2) => {
      switch (source2.type) {
        case "mcp":
        case "extension":
          return ToolDataSource.toKey(source2);
        case "internal":
          return 1 /* BuiltIn */.toString();
        case "user":
          return 0 /* User */.toString();
        case "external":
          throw new Error("should not be reachable");
        default:
          assertNever(source2);
      }
    };
    const mcpServers = new Map(mcpService.servers.get().map((s) => [s.definition.id, { server: s, seen: false }]));
    const createBucket = (source2, key) => {
      if (source2.type === "mcp") {
        const mcpServerEntry = mcpServers.get(source2.definitionId);
        if (!mcpServerEntry) {
          return void 0;
        }
        mcpServerEntry.seen = true;
        const mcpServer = mcpServerEntry.server;
        const buttons = [];
        const collection = mcpRegistry.collections.get().find((c) => c.id === mcpServer.collection.id);
        if (collection?.source) {
          buttons.push({
            iconClass: ThemeIcon.asClassName(Codicon.settingsGear),
            tooltip: localize("configMcpCol", "Configure {0}", collection.label),
            action: () => collection.source ? collection.source instanceof ExtensionIdentifier ? extensionsWorkbenchService.open(collection.source.value, { tab: ExtensionEditorTab.Features, feature: "mcp" }) : mcpWorkbenchService.open(collection.source, { tab: McpServerEditorTab.Configuration }) : void 0
          });
        } else if (collection?.presentation?.origin) {
          buttons.push({
            iconClass: ThemeIcon.asClassName(Codicon.settingsGear),
            tooltip: localize("configMcpCol", "Configure {0}", collection.label),
            action: () => editorService.openEditor({
              resource: collection.presentation.origin
            })
          });
        }
        if (mcpServer.connectionState.get().state === McpConnectionState.Kind.Error) {
          buttons.push({
            iconClass: ThemeIcon.asClassName(Codicon.warning),
            tooltip: localize("mcpShowOutput", "Show Output"),
            action: () => mcpServer.showOutput()
          });
        }
        const cacheState = mcpServer.cacheState.get();
        const children = [];
        let collapsed = true;
        if (cacheState === McpServerCacheState.Unknown || cacheState === McpServerCacheState.Outdated) {
          collapsed = false;
          children.push({
            itemType: "callback",
            iconClass: ThemeIcon.asClassName(Codicon.sync),
            label: localize("mcpUpdate", "Update Tools"),
            pickable: false,
            run: () => {
              treePicker.busy = true;
              (async () => {
                const ok = await startServerAndWaitForLiveTools(mcpServer, { promptType: "all-untrusted" });
                if (!ok) {
                  mcpServer.showOutput();
                  treePicker.hide();
                  return;
                }
                treePicker.busy = false;
                computeItems(collectResults());
              })();
              return false;
            }
          });
        }
        const bucket = {
          itemType: "bucket",
          ordinal: 2 /* Mcp */,
          id: key,
          label: source2.serverLabel || source2.label,
          checked: void 0,
          collapsed,
          children,
          buttons,
          sortOrder: 2
        };
        const iconPath = mcpServer.serverMetadata.get()?.icons.getUrl(22);
        if (iconPath) {
          bucket.iconPath = iconPath;
        } else {
          bucket.iconClass = ThemeIcon.asClassName(Codicon.mcp);
        }
        return bucket;
      } else if (source2.type === "extension") {
        return {
          itemType: "bucket",
          ordinal: 3 /* Extension */,
          id: key,
          label: source2.label,
          checked: void 0,
          children: [],
          buttons: [],
          collapsed: true,
          iconClass: ThemeIcon.asClassName(Codicon.extensions),
          sortOrder: 3
        };
      } else if (source2.type === "internal") {
        return {
          itemType: "bucket",
          ordinal: 1 /* BuiltIn */,
          id: key,
          label: localize("defaultBucketLabel", "Built-In"),
          checked: void 0,
          children: [],
          buttons: [],
          collapsed: false,
          sortOrder: 1
        };
      } else {
        return {
          itemType: "bucket",
          ordinal: 0 /* User */,
          id: key,
          label: localize("userBucket", "User Defined Tool Sets"),
          checked: void 0,
          children: [],
          buttons: [],
          collapsed: true,
          sortOrder: 4
        };
      }
    };
    const getBucket = (source2) => {
      const key = getKey(source2);
      let bucket = bucketMap.get(key);
      if (!bucket) {
        bucket = createBucket(source2, key);
        if (bucket) {
          bucketMap.set(key, bucket);
        }
      }
      return bucket;
    };
    for (const toolSet of toolsService.getToolSetsForModel(model)) {
      if (toolSet.hiddenInToolsPicker) {
        continue;
      }
      if (!toolsEntries.has(toolSet.id)) {
        continue;
      }
      const bucket = getBucket(toolSet.source);
      if (!bucket) {
        continue;
      }
      const toolSetChecked = toolsEntries.get(toolSet.id) === true;
      if (toolSet.source.type === "mcp") {
        bucket.toolset = toolSet;
        if (toolSetChecked) {
          bucket.checked = toolSetChecked;
        }
      } else {
        const treeItem = createToolSetTreeItem(toolSet, toolSetChecked, editorService, (toolSet2) => void removeToolSet(toolSet2));
        bucket.children.push(treeItem);
        const children = [];
        for (const tool of toolSet.getTools()) {
          const toolChecked = toolSetChecked || toolsEntries.get(tool.id) === true;
          const toolTreeItem = createToolTreeItemFromData(tool, toolChecked);
          children.push(toolTreeItem);
        }
        if (children.length > 0) {
          treeItem.children = children;
        }
      }
    }
    for (const tool of toolsService.getAllToolsIncludingDisabled()) {
      if (!tool.canBeReferencedInPrompt || !toolsEntries.has(tool.id)) {
        continue;
      }
      const bucket = getBucket(tool.source);
      if (!bucket) {
        continue;
      }
      const toolChecked = bucket.checked === true || toolsEntries.get(tool.id) === true;
      const toolTreeItem = createToolTreeItemFromData(tool, toolChecked);
      bucket.children.push(toolTreeItem);
    }
    for (const { server, seen } of mcpServers.values()) {
      const cacheState = server.cacheState.get();
      if (!seen && (cacheState === McpServerCacheState.Unknown || cacheState === McpServerCacheState.Outdated)) {
        getBucket({ type: "mcp", definitionId: server.definition.id, label: server.definition.label, instructions: "", serverLabel: "", collectionId: server.collection.id });
      }
    }
    const sortedBuckets = Array.from(bucketMap.values()).sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) {
        return a.sortOrder - b.sortOrder;
      }
      return a.label.localeCompare(b.label);
    });
    for (const bucket of sortedBuckets) {
      treeItems.push(bucket);
      bucket.children.sort((a, b) => a.label.localeCompare(b.label));
      for (const child of bucket.children) {
        if (isToolSetTreeItem(child) && child.children) {
          child.children.sort((a, b) => a.label.localeCompare(b.label));
        }
      }
    }
    for (const bucket of sortedBuckets) {
      const isMcpBucket = bucket.ordinal === 2 /* Mcp */;
      const addConfirmationButton = (toolItem) => {
        if (!confirmationService.toolCanManageConfirmation(toolItem.tool)) {
          return;
        }
        const tool = toolItem.tool;
        const manageTools = isMcpBucket ? bucket.children.flatMap((c) => isToolTreeItem(c) ? [c.tool] : isToolSetTreeItem(c) && c.children ? c.children.filter(isToolTreeItem).map((gc) => gc.tool) : []) : [tool];
        const buttons = toolItem.buttons ? [...toolItem.buttons] : [];
        buttons.push({
          iconClass: ThemeIcon.asClassName(Codicon.pass),
          tooltip: localize("manageToolApproval", "Manage Approval"),
          keepOpen: true,
          action: () => confirmationService.manageConfirmationPreferences(manageTools, { focusToolId: tool.id })
        });
        toolItem.buttons = buttons;
      };
      for (const child of bucket.children) {
        if (isToolTreeItem(child)) {
          addConfirmationButton(child);
        } else if (isToolSetTreeItem(child) && child.children) {
          for (const grandchild of child.children) {
            if (isToolTreeItem(grandchild)) {
              addConfirmationButton(grandchild);
            }
          }
        }
      }
    }
    if (treeItems.length === 0) {
      treePicker.placeholder = localize("noTools", "Add tools to chat");
    } else {
      treePicker.placeholder = placeHolder;
    }
    treePicker.setItemTree(treeItems);
  }
  const store = new DisposableStore();
  const treePicker = store.add(quickPickService.createQuickTree());
  treePicker.placeholder = placeHolder;
  treePicker.description = description;
  treePicker.matchOnDescription = true;
  treePicker.matchOnLabel = true;
  treePicker.sortByLabel = false;
  computeItems();
  store.add(treePicker.onDidTriggerItemButton((e) => {
    if (e.button && typeof e.button.action === "function") {
      const actionableButton = e.button;
      actionableButton.action();
      store.dispose();
    }
  }));
  const collectResults = () => {
    const result = /* @__PURE__ */ new Map();
    const traverse = (items) => {
      for (const item of items) {
        if (isBucketTreeItem(item)) {
          if (item.toolset) {
            const allChecked = item.checked === true;
            result.set(item.toolset, allChecked);
          }
          traverse(item.children);
        } else if (isToolSetTreeItem(item)) {
          let toolSetChecked = item.checked === true;
          if (item.children) {
            const allChildrenChecked = item.children.filter(isToolTreeItem).every((child) => child.checked === true);
            toolSetChecked = toolSetChecked && allChildrenChecked;
          }
          result.set(item.toolset, toolSetChecked);
          if (item.children) {
            traverse(item.children);
          }
        } else if (isToolTreeItem(item)) {
          const checked = item.checked === true;
          const previous = result.get(item.tool);
          result.set(item.tool, previous === void 0 ? checked : previous && checked);
        }
      }
    };
    traverse(treePicker.itemTree);
    return ToolAndToolSetEnablementMap.fromMap(result);
  };
  let didAccept = false;
  const didAcceptFinalItem = store.add(new Emitter());
  store.add(treePicker.onDidAccept(() => {
    const activeItems = treePicker.activeItems;
    const callbackItem = activeItems.find(isCallbackTreeItem);
    if (!callbackItem) {
      didAccept = true;
      treePicker.hide();
      return;
    }
    const ret = callbackItem.run();
    if (ret !== false) {
      didAcceptFinalItem.fire();
    }
  }));
  const addMcpServerButton = {
    iconClass: ThemeIcon.asClassName(Codicon.mcp),
    tooltip: localize("addMcpServer", "Add MCP Server...")
  };
  const installExtension = {
    iconClass: ThemeIcon.asClassName(Codicon.extensions),
    tooltip: localize("addExtensionButton", "Install Extension...")
  };
  const configureToolSets = {
    iconClass: ThemeIcon.asClassName(Codicon.gear),
    tooltip: localize("configToolSets", "Configure Tool Sets...")
  };
  treePicker.title = localize("configureTools", "Configure Tools");
  treePicker.buttons = [addMcpServerButton, installExtension, configureToolSets];
  store.add(treePicker.onDidTriggerButton((button) => {
    if (button === addMcpServerButton) {
      commandService.executeCommand(McpCommandIds.AddConfiguration);
    } else if (button === installExtension) {
      extensionsWorkbenchService.openSearch("@tag:language-model-tools");
    } else if (button === configureToolSets) {
      commandService.executeCommand(ConfigureToolSets.ID, { selection: collectResults() });
    }
    treePicker.hide();
  }));
  if (token) {
    store.add(token.onCancellationRequested(() => {
      treePicker.hide();
    }));
  }
  const initialState = collectResults();
  treePicker.show();
  await Promise.race([Event.toPromise(Event.any(treePicker.onDidHide, didAcceptFinalItem.event), store)]);
  sendDidChangeEvent(source, telemetryService, initialState, collectResults(), mcpRegistry);
  store.dispose();
  return didAccept ? collectResults() : void 0;
}
function categorizeTool(item, mcpRegistry) {
  const source = item.source;
  switch (source.type) {
    case "internal":
      return { category: "builtin", name: item.id };
    case "extension":
      return { category: "extension", name: item.id, extensionId: source.extensionId.value };
    case "mcp": {
      const collection = mcpRegistry.collections.get().find((c) => c.id === source.collectionId);
      if (collection?.source instanceof ExtensionIdentifier) {
        return { category: "extension-mcp", extensionId: collection.source.value };
      }
      return { category: "user-mcp" };
    }
    case "user":
      return { category: "user-toolset" };
    case "external":
      return { category: "user-toolset" };
    default:
      assertNever(source);
  }
}
function computeToolToggleSummary(initialState, finalState, mcpRegistry) {
  const summary = {
    builtinEnabled: 0,
    builtinDisabled: 0,
    extensionEnabled: 0,
    extensionDisabled: 0,
    extensionMcpEnabled: 0,
    extensionMcpDisabled: 0,
    userMcpEnabled: 0,
    userMcpDisabled: 0,
    userToolsetEnabled: 0,
    userToolsetDisabled: 0,
    details: ""
  };
  const detailItems = [];
  for (const [item, finalEnabled] of finalState) {
    const initialEnabled = initialState.get(item) ?? false;
    if (initialEnabled === finalEnabled) {
      continue;
    }
    const categorized = categorizeTool(item, mcpRegistry);
    const enabled = finalEnabled;
    switch (categorized.category) {
      case "builtin":
        if (enabled) {
          summary.builtinEnabled++;
        } else {
          summary.builtinDisabled++;
        }
        detailItems.push({ category: "builtin", name: categorized.name, enabled });
        break;
      case "extension":
        if (enabled) {
          summary.extensionEnabled++;
        } else {
          summary.extensionDisabled++;
        }
        detailItems.push({ category: "extension", name: categorized.name, extensionId: categorized.extensionId, enabled });
        break;
      case "extension-mcp":
        if (enabled) {
          summary.extensionMcpEnabled++;
        } else {
          summary.extensionMcpDisabled++;
        }
        detailItems.push({ category: "extension-mcp", extensionId: categorized.extensionId, enabled });
        break;
      case "user-mcp":
        if (enabled) {
          summary.userMcpEnabled++;
        } else {
          summary.userMcpDisabled++;
        }
        detailItems.push({ category: "user-mcp", enabled });
        break;
      case "user-toolset":
        if (enabled) {
          summary.userToolsetEnabled++;
        } else {
          summary.userToolsetDisabled++;
        }
        detailItems.push({ category: "user-toolset", enabled });
        break;
    }
  }
  summary.details = JSON.stringify(detailItems);
  return summary;
}
function sendDidChangeEvent(source, telemetryService, initialState, finalState, mcpRegistry) {
  const summary = computeToolToggleSummary(initialState, finalState, mcpRegistry);
  const changed = summary.builtinEnabled > 0 || summary.builtinDisabled > 0 || summary.extensionEnabled > 0 || summary.extensionDisabled > 0 || summary.extensionMcpEnabled > 0 || summary.extensionMcpDisabled > 0 || summary.userMcpEnabled > 0 || summary.userMcpDisabled > 0 || summary.userToolsetEnabled > 0 || summary.userToolsetDisabled > 0;
  telemetryService.publicLog2("chatToolPickerClosed", {
    source,
    changed,
    builtinEnabled: summary.builtinEnabled,
    builtinDisabled: summary.builtinDisabled,
    extensionEnabled: summary.extensionEnabled,
    extensionDisabled: summary.extensionDisabled,
    extensionMcpEnabled: summary.extensionMcpEnabled,
    extensionMcpDisabled: summary.extensionMcpDisabled,
    userMcpEnabled: summary.userMcpEnabled,
    userMcpDisabled: summary.userMcpDisabled,
    userToolsetEnabled: summary.userToolsetEnabled,
    userToolsetDisabled: summary.userToolsetDisabled,
    details: summary.details
  });
}
export {
  showToolsPicker
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXGFjdGlvbnNcXGNoYXRUb29sUGlja2VyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cbmltcG9ydCB7IGFzc2VydE5ldmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXNzZXJ0LmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyB0b0Vycm9yTWVzc2FnZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9yTWVzc2FnZS5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJRGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uSWRlbnRpZmllciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLCBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBJUXVpY2tJbnB1dEJ1dHRvbiwgSVF1aWNrSW5wdXRTZXJ2aWNlLCBJUXVpY2tQaWNrSXRlbSwgSVF1aWNrVHJlZUl0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2NvbW1vbi9xdWlja0lucHV0LmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVRleHRGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3RleHRmaWxlL2NvbW1vbi90ZXh0ZmlsZXMuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uRWRpdG9yVGFiLCBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IE1jcENvbW1hbmRJZHMgfSBmcm9tICcuLi8uLi8uLi9tY3AvY29tbW9uL21jcENvbW1hbmRJZHMuanMnO1xuaW1wb3J0IHsgSU1jcFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vbWNwL2NvbW1vbi9tY3BSZWdpc3RyeVR5cGVzLmpzJztcbmltcG9ydCB7IElNY3BTZXJ2ZXIsIElNY3BTZXJ2aWNlLCBJTWNwV29ya2JlbmNoU2VydmljZSwgTWNwQ29ubmVjdGlvblN0YXRlLCBNY3BTZXJ2ZXJDYWNoZVN0YXRlLCBNY3BTZXJ2ZXJFZGl0b3JUYWIgfSBmcm9tICcuLi8uLi8uLi9tY3AvY29tbW9uL21jcFR5cGVzLmpzJztcbmltcG9ydCB7IHN0YXJ0U2VydmVyQW5kV2FpdEZvckxpdmVUb29scyB9IGZyb20gJy4uLy4uLy4uL21jcC9jb21tb24vbWNwVHlwZXNVdGlscy5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YSB9IGZyb20gJy4uLy4uL2NvbW1vbi9sYW5ndWFnZU1vZGVscy5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VNb2RlbFRvb2xzQ29uZmlybWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi90b29scy9sYW5ndWFnZU1vZGVsVG9vbHNDb25maXJtYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLCBJVG9vbERhdGEsIElUb29sU2V0LCBUb29sQW5kVG9vbFNldEVuYWJsZW1lbnRNYXAsIFRvb2xEYXRhU291cmNlLCBUb29sU2V0IH0gZnJvbSAnLi4vLi4vY29tbW9uL3Rvb2xzL2xhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ29uZmlndXJlVG9vbFNldHMsIGRlbGV0ZVRvb2xTZXRGcm9tRmlsZUNvbnRlbnRzIH0gZnJvbSAnLi4vdG9vbHMvdG9vbFNldHNDb250cmlidXRpb24uanMnO1xuXG5jb25zdCBlbnVtIEJ1Y2tldE9yZGluYWwgeyBVc2VyLCBCdWlsdEluLCBNY3AsIEV4dGVuc2lvbiB9XG5cbi8vIExlZ2FjeSBRdWlja1BpY2sgdHlwZXMgKGV4aXN0aW5nIGltcGxlbWVudGF0aW9uKVxudHlwZSBCdWNrZXRQaWNrID0gSVF1aWNrUGlja0l0ZW0gJiB7IHBpY2tlZDogYm9vbGVhbjsgb3JkaW5hbDogQnVja2V0T3JkaW5hbDsgc3RhdHVzPzogc3RyaW5nOyB0b29sc2V0PzogVG9vbFNldDsgY2hpbGRyZW46IChUb29sUGljayB8IFRvb2xTZXRQaWNrKVtdIH07XG50eXBlIFRvb2xTZXRQaWNrID0gSVF1aWNrUGlja0l0ZW0gJiB7IHBpY2tlZDogYm9vbGVhbjsgdG9vbHNldDogVG9vbFNldDsgcGFyZW50OiBCdWNrZXRQaWNrIH07XG50eXBlIFRvb2xQaWNrID0gSVF1aWNrUGlja0l0ZW0gJiB7IHBpY2tlZDogYm9vbGVhbjsgdG9vbDogSVRvb2xEYXRhOyBwYXJlbnQ6IEJ1Y2tldFBpY2sgfTtcbnR5cGUgQWN0aW9uYWJsZUJ1dHRvbiA9IElRdWlja0lucHV0QnV0dG9uICYgeyBhY3Rpb246ICgpID0+IHZvaWQ7IGtlZXBPcGVuPzogYm9vbGVhbiB9O1xuXG4vLyBOZXcgUXVpY2tUcmVlIHR5cGVzIGZvciB0cmVlLWJhc2VkIGltcGxlbWVudGF0aW9uXG5cbi8qKlxuICogQmFzZSBpbnRlcmZhY2UgZm9yIGFsbCB0cmVlIGl0ZW1zIGluIHRoZSBRdWlja1RyZWUgaW1wbGVtZW50YXRpb24uXG4gKiBFeHRlbmRzIElRdWlja1RyZWVJdGVtIHdpdGggY29tbW9uIHByb3BlcnRpZXMgZm9yIHRvb2wgcGlja2VyIGl0ZW1zLlxuICovXG5pbnRlcmZhY2UgSVRvb2xUcmVlSXRlbSBleHRlbmRzIElRdWlja1RyZWVJdGVtIHtcblx0cmVhZG9ubHkgaXRlbVR5cGU6ICdidWNrZXQnIHwgJ3Rvb2xzZXQnIHwgJ3Rvb2wnIHwgJ2NhbGxiYWNrJztcblx0cmVhZG9ubHkgb3JkaW5hbD86IEJ1Y2tldE9yZGluYWw7XG5cdHJlYWRvbmx5IGJ1dHRvbnM/OiByZWFkb25seSBBY3Rpb25hYmxlQnV0dG9uW107XG59XG5cbi8qKlxuICogQnVja2V0IHRyZWUgaXRlbSAtIHJlcHJlc2VudHMgYSBjYXRlZ29yeSBvZiB0b29scyAoVXNlciwgQnVpbHRJbiwgTUNQIFNlcnZlciwgRXh0ZW5zaW9uKS5cbiAqIEZvciBNQ1Agc2VydmVycywgdGhlIGJ1Y2tldCBkaXJlY3RseSByZXByZXNlbnRzIHRoZSBzZXJ2ZXIgYW5kIHN0b3JlcyB0aGUgdG9vbHNldC5cbiAqL1xuaW50ZXJmYWNlIElCdWNrZXRUcmVlSXRlbSBleHRlbmRzIElUb29sVHJlZUl0ZW0ge1xuXHRyZWFkb25seSBpdGVtVHlwZTogJ2J1Y2tldCc7XG5cdHJlYWRvbmx5IG9yZGluYWw6IEJ1Y2tldE9yZGluYWw7XG5cdHRvb2xzZXQ/OiBJVG9vbFNldDsgLy8gRm9yIE1DUCBzZXJ2ZXJzIHdoZXJlIHRoZSBidWNrZXQgcmVwcmVzZW50cyB0aGUgVG9vbFNldCAtIG11dGFibGVcblx0cmVhZG9ubHkgc3RhdHVzPzogc3RyaW5nO1xuXHRyZWFkb25seSBjaGlsZHJlbjogQW55VHJlZUl0ZW1bXTtcblx0Y2hlY2tlZDogYm9vbGVhbiB8ICdtaXhlZCcgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IHNvcnRPcmRlcjogbnVtYmVyO1xufVxuXG4vKipcbiAqIFRvb2xTZXQgdHJlZSBpdGVtIC0gcmVwcmVzZW50cyBhIGNvbGxlY3Rpb24gb2YgdG9vbHMgdGhhdCBjYW4gYmUgbWFuYWdlZCB0b2dldGhlci5cbiAqIFVzZWQgZm9yIHJlZ3VsYXIgKG5vbi1NQ1ApIHRvb2xzZXRzIHRoYXQgYXBwZWFyIGFzIGludGVybWVkaWF0ZSBub2RlcyBpbiB0aGUgdHJlZS5cbiAqL1xuaW50ZXJmYWNlIElUb29sU2V0VHJlZUl0ZW0gZXh0ZW5kcyBJVG9vbFRyZWVJdGVtIHtcblx0cmVhZG9ubHkgaXRlbVR5cGU6ICd0b29sc2V0Jztcblx0cmVhZG9ubHkgdG9vbHNldDogSVRvb2xTZXQ7XG5cdGNoaWxkcmVuOiBBbnlUcmVlSXRlbVtdIHwgdW5kZWZpbmVkO1xuXHRjaGVja2VkOiBib29sZWFuIHwgJ21peGVkJztcbn1cblxuLyoqXG4gKiBUb29sIHRyZWUgaXRlbSAtIHJlcHJlc2VudHMgYW4gaW5kaXZpZHVhbCB0b29sIHRoYXQgY2FuIGJlIHNlbGVjdGVkL2Rlc2VsZWN0ZWQuXG4gKiBUaGlzIGlzIGEgbGVhZiBub2RlIGluIHRoZSB0cmVlIHN0cnVjdHVyZS5cbiAqL1xuaW50ZXJmYWNlIElUb29sVHJlZUl0ZW1EYXRhIGV4dGVuZHMgSVRvb2xUcmVlSXRlbSB7XG5cdHJlYWRvbmx5IGl0ZW1UeXBlOiAndG9vbCc7XG5cdHJlYWRvbmx5IHRvb2w6IElUb29sRGF0YTtcblx0YnV0dG9ucz86IEFjdGlvbmFibGVCdXR0b25bXTtcblx0Y2hlY2tlZDogYm9vbGVhbjtcbn1cblxuLyoqXG4gKiBDYWxsYmFjayB0cmVlIGl0ZW0gLSByZXByZXNlbnRzIGFjdGlvbiBpdGVtcyBsaWtlIFwiQWRkIE1DUCBTZXJ2ZXJcIiBvciBcIkNvbmZpZ3VyZSBUb29sIFNldHNcIi5cbiAqIFRoZXNlIGFyZSBub24tc2VsZWN0YWJsZSBpdGVtcyB0aGF0IGV4ZWN1dGUgYWN0aW9ucyB3aGVuIGNsaWNrZWQuIENhbiByZXR1cm5cbiAqIGZhbHNlIHRvIGtlZXAgdGhlIHBpY2tlciBvcGVuLlxuICovXG5pbnRlcmZhY2UgSUNhbGxiYWNrVHJlZUl0ZW0gZXh0ZW5kcyBJVG9vbFRyZWVJdGVtIHtcblx0cmVhZG9ubHkgaXRlbVR5cGU6ICdjYWxsYmFjayc7XG5cdHJlYWRvbmx5IHJ1bjogKCkgPT4gYm9vbGVhbiB8IHZvaWQ7XG5cdHJlYWRvbmx5IHBpY2thYmxlOiBmYWxzZTtcbn1cblxudHlwZSBBbnlUcmVlSXRlbSA9IElCdWNrZXRUcmVlSXRlbSB8IElUb29sU2V0VHJlZUl0ZW0gfCBJVG9vbFRyZWVJdGVtRGF0YSB8IElDYWxsYmFja1RyZWVJdGVtO1xuXG4vLyBUeXBlIGd1YXJkcyBmb3IgbmV3IFF1aWNrVHJlZSB0eXBlc1xuZnVuY3Rpb24gaXNCdWNrZXRUcmVlSXRlbShpdGVtOiBBbnlUcmVlSXRlbSk6IGl0ZW0gaXMgSUJ1Y2tldFRyZWVJdGVtIHtcblx0cmV0dXJuIGl0ZW0uaXRlbVR5cGUgPT09ICdidWNrZXQnO1xufVxuZnVuY3Rpb24gaXNUb29sU2V0VHJlZUl0ZW0oaXRlbTogQW55VHJlZUl0ZW0pOiBpdGVtIGlzIElUb29sU2V0VHJlZUl0ZW0ge1xuXHRyZXR1cm4gaXRlbS5pdGVtVHlwZSA9PT0gJ3Rvb2xzZXQnO1xufVxuZnVuY3Rpb24gaXNUb29sVHJlZUl0ZW0oaXRlbTogQW55VHJlZUl0ZW0pOiBpdGVtIGlzIElUb29sVHJlZUl0ZW1EYXRhIHtcblx0cmV0dXJuIGl0ZW0uaXRlbVR5cGUgPT09ICd0b29sJztcbn1cbmZ1bmN0aW9uIGlzQ2FsbGJhY2tUcmVlSXRlbShpdGVtOiBBbnlUcmVlSXRlbSk6IGl0ZW0gaXMgSUNhbGxiYWNrVHJlZUl0ZW0ge1xuXHRyZXR1cm4gaXRlbS5pdGVtVHlwZSA9PT0gJ2NhbGxiYWNrJztcbn1cblxuLyoqXG4gKiBNYXBzIGRpZmZlcmVudCBpY29uIHR5cGVzIChUaGVtZUljb24gb3IgVVJJLWJhc2VkKSB0byBRdWlja1RyZWVJdGVtIGljb24gcHJvcGVydGllcy5cbiAqIEhhbmRsZXMgdGhlIGNvbnZlcnNpb24gYmV0d2VlbiBUb29sU2V0L0lUb29sRGF0YSBpY29uIGZvcm1hdHMgYW5kIHRyZWUgaXRlbSByZXF1aXJlbWVudHMuXG4gKiBQcm92aWRlcyBhIGRlZmF1bHQgdG9vbCBpY29uIHdoZW4gbm8gaWNvbiBpcyBzcGVjaWZpZWQuXG4gKlxuICogQHBhcmFtIGljb24gLSBJY29uIHRvIG1hcCAoVGhlbWVJY29uLCBVUkkgb2JqZWN0LCBvciB1bmRlZmluZWQpXG4gKiBAcGFyYW0gdXNlRGVmYXVsdFRvb2xJY29uIC0gV2hldGhlciB0byB1c2UgYSBkZWZhdWx0IHRvb2wgaWNvbiB3aGVuIG5vbmUgaXMgcHJvdmlkZWRcbiAqIEByZXR1cm5zIE9iamVjdCB3aXRoIGljb25DbGFzcyAoZm9yIFRoZW1lSWNvbikgb3IgaWNvblBhdGggKGZvciBVUklzKSBwcm9wZXJ0aWVzXG4gKi9cbmZ1bmN0aW9uIG1hcEljb25Ub1RyZWVJdGVtKGljb246IFRoZW1lSWNvbiB8IHsgZGFyazogVVJJOyBsaWdodD86IFVSSSB9IHwgdW5kZWZpbmVkLCB1c2VEZWZhdWx0VG9vbEljb246IGJvb2xlYW4gPSBmYWxzZSk6IFBpY2s8SVF1aWNrVHJlZUl0ZW0sICdpY29uQ2xhc3MnIHwgJ2ljb25QYXRoJz4ge1xuXHRpZiAoIWljb24pIHtcblx0XHRpZiAodXNlRGVmYXVsdFRvb2xJY29uKSB7XG5cdFx0XHRyZXR1cm4geyBpY29uQ2xhc3M6IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShDb2RpY29uLnRvb2xzKSB9O1xuXHRcdH1cblx0XHRyZXR1cm4ge307XG5cdH1cblxuXHRpZiAoVGhlbWVJY29uLmlzVGhlbWVJY29uKGljb24pKSB7XG5cdFx0cmV0dXJuIHsgaWNvbkNsYXNzOiBUaGVtZUljb24uYXNDbGFzc05hbWUoaWNvbikgfTtcblx0fSBlbHNlIHtcblx0XHRyZXR1cm4geyBpY29uUGF0aDogaWNvbiB9O1xuXHR9XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZVRvb2xUcmVlSXRlbUZyb21EYXRhKHRvb2w6IElUb29sRGF0YSwgY2hlY2tlZDogYm9vbGVhbik6IElUb29sVHJlZUl0ZW1EYXRhIHtcblx0Y29uc3QgaWNvblByb3BzID0gbWFwSWNvblRvVHJlZUl0ZW0odG9vbC5pY29uLCB0cnVlKTsgLy8gVXNlIGRlZmF1bHQgdG9vbCBpY29uIGlmIG5vbmUgcHJvdmlkZWRcblxuXHRyZXR1cm4ge1xuXHRcdGl0ZW1UeXBlOiAndG9vbCcsXG5cdFx0dG9vbCxcblx0XHRpZDogdG9vbC5pZCxcblx0XHRsYWJlbDogdG9vbC50b29sUmVmZXJlbmNlTmFtZSA/PyB0b29sLmRpc3BsYXlOYW1lLFxuXHRcdGRlc2NyaXB0aW9uOiB0b29sLnVzZXJEZXNjcmlwdGlvbiA/PyB0b29sLm1vZGVsRGVzY3JpcHRpb24sXG5cdFx0Y2hlY2tlZCxcblx0XHQuLi5pY29uUHJvcHNcblx0fTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlVG9vbFNldFRyZWVJdGVtKHRvb2xzZXQ6IElUb29sU2V0LCBjaGVja2VkOiBib29sZWFuLCBlZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSwgcmVtb3ZlVG9vbFNldDogKHRvb2xTZXQ6IElUb29sU2V0KSA9PiB2b2lkKTogSVRvb2xTZXRUcmVlSXRlbSB7XG5cdGNvbnN0IGljb25Qcm9wcyA9IG1hcEljb25Ub1RyZWVJdGVtKHRvb2xzZXQuaWNvbik7XG5cdGNvbnN0IGJ1dHRvbnMgPSBbXTtcblx0aWYgKHRvb2xzZXQuc291cmNlLnR5cGUgPT09ICd1c2VyJykge1xuXHRcdGNvbnN0IHJlc291cmNlID0gdG9vbHNldC5zb3VyY2UuZmlsZTtcblx0XHRidXR0b25zLnB1c2goe1xuXHRcdFx0aWNvbkNsYXNzOiBUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi5lZGl0KSxcblx0XHRcdHRvb2x0aXA6IGxvY2FsaXplKCdlZGl0VXNlckJ1Y2tldCcsIFwiRWRpdCBUb29sIFNldFwiKSxcblx0XHRcdGFjdGlvbjogKCkgPT4gZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHsgcmVzb3VyY2UgfSlcblx0XHR9LCB7XG5cdFx0XHRpY29uQ2xhc3M6IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShDb2RpY29uLnRyYXNoKSxcblx0XHRcdHRvb2x0aXA6IGxvY2FsaXplKCdkZWxldGVVc2VyQnVja2V0JywgXCJEZWxldGUgVG9vbCBTZXRcIiksXG5cdFx0XHRhY3Rpb246ICgpID0+IHJlbW92ZVRvb2xTZXQodG9vbHNldClcblx0XHR9KTtcblx0fVxuXHRyZXR1cm4ge1xuXHRcdGl0ZW1UeXBlOiAndG9vbHNldCcsXG5cdFx0dG9vbHNldCxcblx0XHRidXR0b25zLFxuXHRcdGlkOiB0b29sc2V0LmlkLFxuXHRcdGxhYmVsOiB0b29sc2V0LnJlZmVyZW5jZU5hbWUsXG5cdFx0ZGVzY3JpcHRpb246IHRvb2xzZXQuZGVzY3JpcHRpb24sXG5cdFx0Y2hlY2tlZCxcblx0XHRjaGlsZHJlbjogdW5kZWZpbmVkLFxuXHRcdGNvbGxhcHNlZDogdHJ1ZSxcblx0XHQuLi5pY29uUHJvcHNcblx0fTtcbn1cblxuLyoqXG4gKiBOZXcgUXVpY2tUcmVlIGltcGxlbWVudGF0aW9uIG9mIHRoZSB0b29scyBwaWNrZXIuXG4gKiBVc2VzIElRdWlja1RyZWUgdG8gcHJvdmlkZSBhIHRydWUgaGllcmFyY2hpY2FsIHRyZWUgc3RydWN0dXJlIHdpdGg6XG4gKiAtIENvbGxhcHNpYmxlIG5vZGVzIGZvciBidWNrZXRzIGFuZCB0b29sc2V0c1xuICogLSBDaGVja2JveCBzdGF0ZSBtYW5hZ2VtZW50IHdpdGggcGFyZW50LWNoaWxkIHJlbGF0aW9uc2hpcHNcbiAqIC0gU3BlY2lhbCBoYW5kbGluZyBmb3IgTUNQIHNlcnZlcnMgKHNlcnZlciBhcyBidWNrZXQsIHRvb2xzIGFzIGRpcmVjdCBjaGlsZHJlbilcbiAqIC0gQnVpbHQtaW4gZmlsdGVyaW5nIGFuZCBzZWFyY2ggY2FwYWJpbGl0aWVzXG4gKlxuICogQHBhcmFtIGFjY2Vzc29yIC0gU2VydmljZSBhY2Nlc3NvciBmb3IgZGVwZW5kZW5jeSBpbmplY3Rpb25cbiAqIEBwYXJhbSBwbGFjZUhvbGRlciAtIFBsYWNlaG9sZGVyIHRleHQgc2hvd24gaW4gdGhlIHBpY2tlclxuICogQHBhcmFtIGRlc2NyaXB0aW9uIC0gT3B0aW9uYWwgZGVzY3JpcHRpb24gdGV4dCBzaG93biBpbiB0aGUgcGlja2VyXG4gKiBAcGFyYW0gdG9vbHNFbnRyaWVzIC0gT3B0aW9uYWwgaW5pdGlhbCBzZWxlY3Rpb24gc3RhdGUgZm9yIHRvb2xzIGFuZCB0b29sc2V0c1xuICogQHBhcmFtIG1vZGVsSWQgLSBPcHRpb25hbCBtb2RlbCBJRCB0byBmaWx0ZXIgdG9vbHMgYnkgc3VwcG9ydGVkIG1vZGVsc1xuICogQHBhcmFtIG9uVXBkYXRlIC0gT3B0aW9uYWwgY2FsbGJhY2sgZmlyZWQgd2hlbiB0aGUgc2VsZWN0aW9uIGNoYW5nZXNcbiAqIEBwYXJhbSB0b2tlbiAtIE9wdGlvbmFsIGNhbmNlbGxhdGlvbiB0b2tlbiB0byBjbG9zZSB0aGUgcGlja2VyIHdoZW4gY2FuY2VsbGVkXG4gKiBAcmV0dXJucyBQcm9taXNlIHJlc29sdmluZyB0byB0aGUgZmluYWwgc2VsZWN0aW9uIG1hcCwgb3IgdW5kZWZpbmVkIGlmIGNhbmNlbGxlZFxuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gc2hvd1Rvb2xzUGlja2VyKFxuXHRhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcixcblx0cGxhY2VIb2xkZXI6IHN0cmluZyxcblx0c291cmNlOiBzdHJpbmcsXG5cdGRlc2NyaXB0aW9uPzogc3RyaW5nLFxuXHRnZXRUb29sc0VudHJpZXM/OiAoKSA9PiBUb29sQW5kVG9vbFNldEVuYWJsZW1lbnRNYXAsXG5cdG1vZGVsPzogSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGEgfCB1bmRlZmluZWQsXG5cdHRva2VuPzogQ2FuY2VsbGF0aW9uVG9rZW5cbik6IFByb21pc2U8VG9vbEFuZFRvb2xTZXRFbmFibGVtZW50TWFwIHwgdW5kZWZpbmVkPiB7XG5cblx0Y29uc3QgcXVpY2tQaWNrU2VydmljZSA9IGFjY2Vzc29yLmdldChJUXVpY2tJbnB1dFNlcnZpY2UpO1xuXHRjb25zdCBtY3BTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElNY3BTZXJ2aWNlKTtcblx0Y29uc3QgbWNwUmVnaXN0cnkgPSBhY2Nlc3Nvci5nZXQoSU1jcFJlZ2lzdHJ5KTtcblx0Y29uc3QgY29tbWFuZFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbW1hbmRTZXJ2aWNlKTtcblx0Y29uc3QgZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlKTtcblx0Y29uc3QgZWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cdGNvbnN0IG1jcFdvcmtiZW5jaFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSU1jcFdvcmtiZW5jaFNlcnZpY2UpO1xuXHRjb25zdCB0b29sc1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UpO1xuXHRjb25zdCBjb25maXJtYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElMYW5ndWFnZU1vZGVsVG9vbHNDb25maXJtYXRpb25TZXJ2aWNlKTtcblx0Y29uc3QgdGVsZW1ldHJ5U2VydmljZSA9IGFjY2Vzc29yLmdldChJVGVsZW1ldHJ5U2VydmljZSk7XG5cdGNvbnN0IGRpYWxvZ1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSURpYWxvZ1NlcnZpY2UpO1xuXHRjb25zdCB0ZXh0RmlsZVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVRleHRGaWxlU2VydmljZSk7XG5cdGNvbnN0IGZpbGVTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElGaWxlU2VydmljZSk7XG5cdGNvbnN0IG5vdGlmaWNhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSU5vdGlmaWNhdGlvblNlcnZpY2UpO1xuXG5cdGNvbnN0IHJlbW92ZVRvb2xTZXQgPSBhc3luYyAodG9vbFNldDogSVRvb2xTZXQpOiBQcm9taXNlPHZvaWQ+ID0+IHtcblx0XHRpZiAodG9vbFNldC5zb3VyY2UudHlwZSAhPT0gJ3VzZXInKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgZGlhbG9nU2VydmljZS5jb25maXJtKHtcblx0XHRcdHR5cGU6ICd3YXJuaW5nJyxcblx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKCdkZWxldGVUb29sU2V0LmNvbmZpcm0ubWVzc2FnZScsIFwiRGVsZXRlIHRvb2wgc2V0ICd7MH0nP1wiLCB0b29sU2V0LnJlZmVyZW5jZU5hbWUpLFxuXHRcdFx0ZGV0YWlsOiBsb2NhbGl6ZSgnZGVsZXRlVG9vbFNldC5jb25maXJtLmRldGFpbCcsIFwiVGhpcyByZW1vdmVzIHRoZSB0b29sIHNldCBkZWZpbml0aW9uIGZyb20gezB9LlwiLCB0b29sU2V0LnNvdXJjZS5sYWJlbCksXG5cdFx0XHRwcmltYXJ5QnV0dG9uOiBsb2NhbGl6ZSgnZGVsZXRlVG9vbFNldC5jb25maXJtLnByaW1hcnknLCBcIkRlbGV0ZVwiKVxuXHRcdH0pO1xuXG5cdFx0aWYgKCFyZXN1bHQuY29uZmlybWVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHJhd0NvbnRlbnQgPSBhd2FpdCB0ZXh0RmlsZVNlcnZpY2UucmVhZCh0b29sU2V0LnNvdXJjZS5maWxlKTtcblx0XHRcdGNvbnN0IHVwZGF0ZWQgPSBkZWxldGVUb29sU2V0RnJvbUZpbGVDb250ZW50cyhyYXdDb250ZW50LnZhbHVlLCB0b29sU2V0LnJlZmVyZW5jZU5hbWUpO1xuXHRcdFx0aWYgKCF1cGRhdGVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHVwZGF0ZWQuaXNFbXB0eSkge1xuXHRcdFx0XHQvLyBObyB0b29sIHNldHMgcmVtYWluIGluIHRoZSBmaWxlLCBzbyByZW1vdmUgdGhlIGZpbGUgZW50aXJlbHkuXG5cdFx0XHRcdGNvbnN0IHVzZVRyYXNoID0gZmlsZVNlcnZpY2UuaGFzQ2FwYWJpbGl0eSh0b29sU2V0LnNvdXJjZS5maWxlLCBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuVHJhc2gpO1xuXHRcdFx0XHRhd2FpdCBmaWxlU2VydmljZS5kZWwodG9vbFNldC5zb3VyY2UuZmlsZSwgeyB1c2VUcmFzaCB9KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGF3YWl0IHRleHRGaWxlU2VydmljZS53cml0ZSh0b29sU2V0LnNvdXJjZS5maWxlLCB1cGRhdGVkLmNvbnRlbnRzKTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0bm90aWZpY2F0aW9uU2VydmljZS5lcnJvcihsb2NhbGl6ZSgnZGVsZXRlVG9vbFNldC5lcnJvcicsIFwiRmFpbGVkIHRvIGRlbGV0ZSB0b29sIHNldCAnezB9JzogezF9XCIsIHRvb2xTZXQucmVmZXJlbmNlTmFtZSwgdG9FcnJvck1lc3NhZ2UoZXJyb3IpKSk7XG5cdFx0fVxuXHR9O1xuXG5cdGNvbnN0IG1jcFNlcnZlckJ5VG9vbCA9IG5ldyBNYXA8c3RyaW5nLCBJTWNwU2VydmVyPigpO1xuXHRmb3IgKGNvbnN0IHNlcnZlciBvZiBtY3BTZXJ2aWNlLnNlcnZlcnMuZ2V0KCkpIHtcblx0XHRmb3IgKGNvbnN0IHRvb2wgb2Ygc2VydmVyLnRvb2xzLmdldCgpKSB7XG5cdFx0XHRtY3BTZXJ2ZXJCeVRvb2wuc2V0KHRvb2wuaWQsIHNlcnZlcik7XG5cdFx0fVxuXHR9XG5cblx0ZnVuY3Rpb24gY29tcHV0ZUl0ZW1zKHByZXZpb3VzVG9vbHNFbnRyaWVzPzogVG9vbEFuZFRvb2xTZXRFbmFibGVtZW50TWFwKSB7XG5cdFx0Ly8gQ3JlYXRlIGRlZmF1bHQgZW50cmllcyBpZiBub25lIHByb3ZpZGVkXG5cdFx0bGV0IHRvb2xzRW50cmllcyA9IGdldFRvb2xzRW50cmllcyA/IG5ldyBNYXAoWy4uLmdldFRvb2xzRW50cmllcygpXS5tYXAoKFtrLCBlbmFibGVkXSkgPT4gW2suaWQsIGVuYWJsZWRdKSkgOiB1bmRlZmluZWQ7XG5cdFx0aWYgKCF0b29sc0VudHJpZXMpIHtcblx0XHRcdGNvbnN0IGRlZmF1bHRFbnRyaWVzID0gbmV3IE1hcCgpO1xuXHRcdFx0Zm9yIChjb25zdCB0b29sIG9mIHRvb2xzU2VydmljZS5nZXRUb29scyhtb2RlbCkpIHtcblx0XHRcdFx0aWYgKHRvb2wuY2FuQmVSZWZlcmVuY2VkSW5Qcm9tcHQpIHtcblx0XHRcdFx0XHRkZWZhdWx0RW50cmllcy5zZXQodG9vbCwgZmFsc2UpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRmb3IgKGNvbnN0IHRvb2xTZXQgb2YgdG9vbHNTZXJ2aWNlLmdldFRvb2xTZXRzRm9yTW9kZWwobW9kZWwpKSB7XG5cdFx0XHRcdGlmICh0b29sU2V0LmhpZGRlbkluVG9vbHNQaWNrZXIpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRkZWZhdWx0RW50cmllcy5zZXQodG9vbFNldCwgZmFsc2UpO1xuXHRcdFx0fVxuXHRcdFx0dG9vbHNFbnRyaWVzID0gZGVmYXVsdEVudHJpZXM7XG5cdFx0fVxuXHRcdGZvciAoY29uc3QgW2VudHJ5LCBlbmFibGVkXSBvZiBwcmV2aW91c1Rvb2xzRW50cmllcyA/PyBbXSkge1xuXHRcdFx0dG9vbHNFbnRyaWVzLnNldChlbnRyeS5pZCwgZW5hYmxlZCk7XG5cdFx0fVxuXG5cdFx0Ly8gQnVpbGQgdHJlZSBzdHJ1Y3R1cmVcblx0XHRjb25zdCB0cmVlSXRlbXM6IEFueVRyZWVJdGVtW10gPSBbXTtcblx0XHRjb25zdCBidWNrZXRNYXAgPSBuZXcgTWFwPHN0cmluZywgSUJ1Y2tldFRyZWVJdGVtPigpO1xuXG5cdFx0Y29uc3QgZ2V0S2V5ID0gKHNvdXJjZTogVG9vbERhdGFTb3VyY2UpOiBzdHJpbmcgPT4ge1xuXHRcdFx0c3dpdGNoIChzb3VyY2UudHlwZSkge1xuXHRcdFx0XHRjYXNlICdtY3AnOlxuXHRcdFx0XHRjYXNlICdleHRlbnNpb24nOlxuXHRcdFx0XHRcdHJldHVybiBUb29sRGF0YVNvdXJjZS50b0tleShzb3VyY2UpO1xuXHRcdFx0XHRjYXNlICdpbnRlcm5hbCc6XG5cdFx0XHRcdFx0cmV0dXJuIEJ1Y2tldE9yZGluYWwuQnVpbHRJbi50b1N0cmluZygpO1xuXHRcdFx0XHRjYXNlICd1c2VyJzpcblx0XHRcdFx0XHRyZXR1cm4gQnVja2V0T3JkaW5hbC5Vc2VyLnRvU3RyaW5nKCk7XG5cdFx0XHRcdGNhc2UgJ2V4dGVybmFsJzpcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ3Nob3VsZCBub3QgYmUgcmVhY2hhYmxlJyk7XG5cdFx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdFx0YXNzZXJ0TmV2ZXIoc291cmNlKTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0Y29uc3QgbWNwU2VydmVycyA9IG5ldyBNYXAobWNwU2VydmljZS5zZXJ2ZXJzLmdldCgpLm1hcChzID0+IFtzLmRlZmluaXRpb24uaWQsIHsgc2VydmVyOiBzLCBzZWVuOiBmYWxzZSB9XSkpO1xuXHRcdGNvbnN0IGNyZWF0ZUJ1Y2tldCA9IChzb3VyY2U6IFRvb2xEYXRhU291cmNlLCBrZXk6IHN0cmluZyk6IElCdWNrZXRUcmVlSXRlbSB8IHVuZGVmaW5lZCA9PiB7XG5cdFx0XHRpZiAoc291cmNlLnR5cGUgPT09ICdtY3AnKSB7XG5cdFx0XHRcdGNvbnN0IG1jcFNlcnZlckVudHJ5ID0gbWNwU2VydmVycy5nZXQoc291cmNlLmRlZmluaXRpb25JZCk7XG5cdFx0XHRcdGlmICghbWNwU2VydmVyRW50cnkpIHtcblx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHRcdG1jcFNlcnZlckVudHJ5LnNlZW4gPSB0cnVlO1xuXHRcdFx0XHRjb25zdCBtY3BTZXJ2ZXIgPSBtY3BTZXJ2ZXJFbnRyeS5zZXJ2ZXI7XG5cdFx0XHRcdGNvbnN0IGJ1dHRvbnM6IEFjdGlvbmFibGVCdXR0b25bXSA9IFtdO1xuXHRcdFx0XHRjb25zdCBjb2xsZWN0aW9uID0gbWNwUmVnaXN0cnkuY29sbGVjdGlvbnMuZ2V0KCkuZmluZChjID0+IGMuaWQgPT09IG1jcFNlcnZlci5jb2xsZWN0aW9uLmlkKTtcblx0XHRcdFx0aWYgKGNvbGxlY3Rpb24/LnNvdXJjZSkge1xuXHRcdFx0XHRcdGJ1dHRvbnMucHVzaCh7XG5cdFx0XHRcdFx0XHRpY29uQ2xhc3M6IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShDb2RpY29uLnNldHRpbmdzR2VhciksXG5cdFx0XHRcdFx0XHR0b29sdGlwOiBsb2NhbGl6ZSgnY29uZmlnTWNwQ29sJywgXCJDb25maWd1cmUgezB9XCIsIGNvbGxlY3Rpb24ubGFiZWwpLFxuXHRcdFx0XHRcdFx0YWN0aW9uOiAoKSA9PiBjb2xsZWN0aW9uLnNvdXJjZSA/IGNvbGxlY3Rpb24uc291cmNlIGluc3RhbmNlb2YgRXh0ZW5zaW9uSWRlbnRpZmllciA/IGV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLm9wZW4oY29sbGVjdGlvbi5zb3VyY2UudmFsdWUsIHsgdGFiOiBFeHRlbnNpb25FZGl0b3JUYWIuRmVhdHVyZXMsIGZlYXR1cmU6ICdtY3AnIH0pIDogbWNwV29ya2JlbmNoU2VydmljZS5vcGVuKGNvbGxlY3Rpb24uc291cmNlLCB7IHRhYjogTWNwU2VydmVyRWRpdG9yVGFiLkNvbmZpZ3VyYXRpb24gfSkgOiB1bmRlZmluZWRcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSBlbHNlIGlmIChjb2xsZWN0aW9uPy5wcmVzZW50YXRpb24/Lm9yaWdpbikge1xuXHRcdFx0XHRcdGJ1dHRvbnMucHVzaCh7XG5cdFx0XHRcdFx0XHRpY29uQ2xhc3M6IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShDb2RpY29uLnNldHRpbmdzR2VhciksXG5cdFx0XHRcdFx0XHR0b29sdGlwOiBsb2NhbGl6ZSgnY29uZmlnTWNwQ29sJywgXCJDb25maWd1cmUgezB9XCIsIGNvbGxlY3Rpb24ubGFiZWwpLFxuXHRcdFx0XHRcdFx0YWN0aW9uOiAoKSA9PiBlZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3Ioe1xuXHRcdFx0XHRcdFx0XHRyZXNvdXJjZTogY29sbGVjdGlvbiEucHJlc2VudGF0aW9uIS5vcmlnaW4sXG5cdFx0XHRcdFx0XHR9KVxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChtY3BTZXJ2ZXIuY29ubmVjdGlvblN0YXRlLmdldCgpLnN0YXRlID09PSBNY3BDb25uZWN0aW9uU3RhdGUuS2luZC5FcnJvcikge1xuXHRcdFx0XHRcdGJ1dHRvbnMucHVzaCh7XG5cdFx0XHRcdFx0XHRpY29uQ2xhc3M6IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShDb2RpY29uLndhcm5pbmcpLFxuXHRcdFx0XHRcdFx0dG9vbHRpcDogbG9jYWxpemUoJ21jcFNob3dPdXRwdXQnLCBcIlNob3cgT3V0cHV0XCIpLFxuXHRcdFx0XHRcdFx0YWN0aW9uOiAoKSA9PiBtY3BTZXJ2ZXIuc2hvd091dHB1dCgpLFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGNhY2hlU3RhdGUgPSBtY3BTZXJ2ZXIuY2FjaGVTdGF0ZS5nZXQoKTtcblx0XHRcdFx0Y29uc3QgY2hpbGRyZW46IEFueVRyZWVJdGVtW10gPSBbXTtcblx0XHRcdFx0bGV0IGNvbGxhcHNlZCA9IHRydWU7XG5cdFx0XHRcdGlmIChjYWNoZVN0YXRlID09PSBNY3BTZXJ2ZXJDYWNoZVN0YXRlLlVua25vd24gfHwgY2FjaGVTdGF0ZSA9PT0gTWNwU2VydmVyQ2FjaGVTdGF0ZS5PdXRkYXRlZCkge1xuXHRcdFx0XHRcdGNvbGxhcHNlZCA9IGZhbHNlO1xuXHRcdFx0XHRcdGNoaWxkcmVuLnB1c2goe1xuXHRcdFx0XHRcdFx0aXRlbVR5cGU6ICdjYWxsYmFjaycsXG5cdFx0XHRcdFx0XHRpY29uQ2xhc3M6IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShDb2RpY29uLnN5bmMpLFxuXHRcdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdtY3BVcGRhdGUnLCBcIlVwZGF0ZSBUb29sc1wiKSxcblx0XHRcdFx0XHRcdHBpY2thYmxlOiBmYWxzZSxcblx0XHRcdFx0XHRcdHJ1bjogKCkgPT4ge1xuXHRcdFx0XHRcdFx0XHR0cmVlUGlja2VyLmJ1c3kgPSB0cnVlO1xuXHRcdFx0XHRcdFx0XHQoYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdFx0XHRcdGNvbnN0IG9rID0gYXdhaXQgc3RhcnRTZXJ2ZXJBbmRXYWl0Rm9yTGl2ZVRvb2xzKG1jcFNlcnZlciwgeyBwcm9tcHRUeXBlOiAnYWxsLXVudHJ1c3RlZCcgfSk7XG5cdFx0XHRcdFx0XHRcdFx0aWYgKCFvaykge1xuXHRcdFx0XHRcdFx0XHRcdFx0bWNwU2VydmVyLnNob3dPdXRwdXQoKTtcblx0XHRcdFx0XHRcdFx0XHRcdHRyZWVQaWNrZXIuaGlkZSgpO1xuXHRcdFx0XHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHR0cmVlUGlja2VyLmJ1c3kgPSBmYWxzZTtcblx0XHRcdFx0XHRcdFx0XHRjb21wdXRlSXRlbXMoY29sbGVjdFJlc3VsdHMoKSk7XG5cdFx0XHRcdFx0XHRcdH0pKCk7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgYnVja2V0OiBJQnVja2V0VHJlZUl0ZW0gPSB7XG5cdFx0XHRcdFx0aXRlbVR5cGU6ICdidWNrZXQnLFxuXHRcdFx0XHRcdG9yZGluYWw6IEJ1Y2tldE9yZGluYWwuTWNwLFxuXHRcdFx0XHRcdGlkOiBrZXksXG5cdFx0XHRcdFx0bGFiZWw6IHNvdXJjZS5zZXJ2ZXJMYWJlbCB8fCBzb3VyY2UubGFiZWwsXG5cdFx0XHRcdFx0Y2hlY2tlZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGNvbGxhcHNlZCxcblx0XHRcdFx0XHRjaGlsZHJlbixcblx0XHRcdFx0XHRidXR0b25zLFxuXHRcdFx0XHRcdHNvcnRPcmRlcjogMixcblx0XHRcdFx0fTtcblx0XHRcdFx0Y29uc3QgaWNvblBhdGggPSBtY3BTZXJ2ZXIuc2VydmVyTWV0YWRhdGEuZ2V0KCk/Lmljb25zLmdldFVybCgyMik7XG5cdFx0XHRcdGlmIChpY29uUGF0aCkge1xuXHRcdFx0XHRcdGJ1Y2tldC5pY29uUGF0aCA9IGljb25QYXRoO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGJ1Y2tldC5pY29uQ2xhc3MgPSBUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi5tY3ApO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBidWNrZXQ7XG5cdFx0XHR9IGVsc2UgaWYgKHNvdXJjZS50eXBlID09PSAnZXh0ZW5zaW9uJykge1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGl0ZW1UeXBlOiAnYnVja2V0Jyxcblx0XHRcdFx0XHRvcmRpbmFsOiBCdWNrZXRPcmRpbmFsLkV4dGVuc2lvbixcblx0XHRcdFx0XHRpZDoga2V5LFxuXHRcdFx0XHRcdGxhYmVsOiBzb3VyY2UubGFiZWwsXG5cdFx0XHRcdFx0Y2hlY2tlZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGNoaWxkcmVuOiBbXSxcblx0XHRcdFx0XHRidXR0b25zOiBbXSxcblx0XHRcdFx0XHRjb2xsYXBzZWQ6IHRydWUsXG5cdFx0XHRcdFx0aWNvbkNsYXNzOiBUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi5leHRlbnNpb25zKSxcblx0XHRcdFx0XHRzb3J0T3JkZXI6IDMsXG5cdFx0XHRcdH07XG5cdFx0XHR9IGVsc2UgaWYgKHNvdXJjZS50eXBlID09PSAnaW50ZXJuYWwnKSB7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0aXRlbVR5cGU6ICdidWNrZXQnLFxuXHRcdFx0XHRcdG9yZGluYWw6IEJ1Y2tldE9yZGluYWwuQnVpbHRJbixcblx0XHRcdFx0XHRpZDoga2V5LFxuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnZGVmYXVsdEJ1Y2tldExhYmVsJywgXCJCdWlsdC1JblwiKSxcblx0XHRcdFx0XHRjaGVja2VkOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0Y2hpbGRyZW46IFtdLFxuXHRcdFx0XHRcdGJ1dHRvbnM6IFtdLFxuXHRcdFx0XHRcdGNvbGxhcHNlZDogZmFsc2UsXG5cdFx0XHRcdFx0c29ydE9yZGVyOiAxLFxuXHRcdFx0XHR9O1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRpdGVtVHlwZTogJ2J1Y2tldCcsXG5cdFx0XHRcdFx0b3JkaW5hbDogQnVja2V0T3JkaW5hbC5Vc2VyLFxuXHRcdFx0XHRcdGlkOiBrZXksXG5cdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCd1c2VyQnVja2V0JywgXCJVc2VyIERlZmluZWQgVG9vbCBTZXRzXCIpLFxuXHRcdFx0XHRcdGNoZWNrZWQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRjaGlsZHJlbjogW10sXG5cdFx0XHRcdFx0YnV0dG9uczogW10sXG5cdFx0XHRcdFx0Y29sbGFwc2VkOiB0cnVlLFxuXHRcdFx0XHRcdHNvcnRPcmRlcjogNCxcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0Y29uc3QgZ2V0QnVja2V0ID0gKHNvdXJjZTogVG9vbERhdGFTb3VyY2UpOiBJQnVja2V0VHJlZUl0ZW0gfCB1bmRlZmluZWQgPT4ge1xuXHRcdFx0Y29uc3Qga2V5ID0gZ2V0S2V5KHNvdXJjZSk7XG5cdFx0XHRsZXQgYnVja2V0ID0gYnVja2V0TWFwLmdldChrZXkpO1xuXHRcdFx0aWYgKCFidWNrZXQpIHtcblx0XHRcdFx0YnVja2V0ID0gY3JlYXRlQnVja2V0KHNvdXJjZSwga2V5KTtcblx0XHRcdFx0aWYgKGJ1Y2tldCkge1xuXHRcdFx0XHRcdGJ1Y2tldE1hcC5zZXQoa2V5LCBidWNrZXQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gYnVja2V0O1xuXHRcdH07XG5cblx0XHRmb3IgKGNvbnN0IHRvb2xTZXQgb2YgdG9vbHNTZXJ2aWNlLmdldFRvb2xTZXRzRm9yTW9kZWwobW9kZWwpKSB7XG5cdFx0XHRpZiAodG9vbFNldC5oaWRkZW5JblRvb2xzUGlja2VyKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCF0b29sc0VudHJpZXMuaGFzKHRvb2xTZXQuaWQpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgYnVja2V0ID0gZ2V0QnVja2V0KHRvb2xTZXQuc291cmNlKTtcblx0XHRcdGlmICghYnVja2V0KSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgdG9vbFNldENoZWNrZWQgPSB0b29sc0VudHJpZXMuZ2V0KHRvb2xTZXQuaWQpID09PSB0cnVlO1xuXHRcdFx0aWYgKHRvb2xTZXQuc291cmNlLnR5cGUgPT09ICdtY3AnKSB7XG5cdFx0XHRcdC8vIGJ1Y2tldCByZXByZXNlbnRzIHRoZSB0b29sc2V0XG5cdFx0XHRcdGJ1Y2tldC50b29sc2V0ID0gdG9vbFNldDtcblx0XHRcdFx0aWYgKHRvb2xTZXRDaGVja2VkKSB7XG5cdFx0XHRcdFx0YnVja2V0LmNoZWNrZWQgPSB0b29sU2V0Q2hlY2tlZDtcblx0XHRcdFx0fVxuXHRcdFx0XHQvLyBhbGwgbWNwIHRvb2xzIGFyZSBwYXJ0IG9mIHRvb2xzU2VydmljZS5nZXRUb29scygpXG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCB0cmVlSXRlbSA9IGNyZWF0ZVRvb2xTZXRUcmVlSXRlbSh0b29sU2V0LCB0b29sU2V0Q2hlY2tlZCwgZWRpdG9yU2VydmljZSwgdG9vbFNldCA9PiB2b2lkIHJlbW92ZVRvb2xTZXQodG9vbFNldCkpO1xuXHRcdFx0XHRidWNrZXQuY2hpbGRyZW4ucHVzaCh0cmVlSXRlbSk7XG5cdFx0XHRcdGNvbnN0IGNoaWxkcmVuID0gW107XG5cdFx0XHRcdGZvciAoY29uc3QgdG9vbCBvZiB0b29sU2V0LmdldFRvb2xzKCkpIHtcblx0XHRcdFx0XHRjb25zdCB0b29sQ2hlY2tlZCA9IHRvb2xTZXRDaGVja2VkIHx8IHRvb2xzRW50cmllcy5nZXQodG9vbC5pZCkgPT09IHRydWU7XG5cdFx0XHRcdFx0Y29uc3QgdG9vbFRyZWVJdGVtID0gY3JlYXRlVG9vbFRyZWVJdGVtRnJvbURhdGEodG9vbCwgdG9vbENoZWNrZWQpO1xuXHRcdFx0XHRcdGNoaWxkcmVuLnB1c2godG9vbFRyZWVJdGVtKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoY2hpbGRyZW4ubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdHRyZWVJdGVtLmNoaWxkcmVuID0gY2hpbGRyZW47XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0Ly8gZ2V0dGluZyBwb3RlbnRpYWxseSBkaXNhYmxlZCB0b29scyBpcyBmaW5lIGhlcmUgYmVjYXVzZSB3ZSBmaWx0ZXIgYHRvb2xzRW50cmllcy5oYXNgXG5cdFx0Zm9yIChjb25zdCB0b29sIG9mIHRvb2xzU2VydmljZS5nZXRBbGxUb29sc0luY2x1ZGluZ0Rpc2FibGVkKCkpIHtcblx0XHRcdGlmICghdG9vbC5jYW5CZVJlZmVyZW5jZWRJblByb21wdCB8fCAhdG9vbHNFbnRyaWVzLmhhcyh0b29sLmlkKSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGJ1Y2tldCA9IGdldEJ1Y2tldCh0b29sLnNvdXJjZSk7XG5cdFx0XHRpZiAoIWJ1Y2tldCkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHRvb2xDaGVja2VkID0gYnVja2V0LmNoZWNrZWQgPT09IHRydWUgfHwgdG9vbHNFbnRyaWVzLmdldCh0b29sLmlkKSA9PT0gdHJ1ZTtcblx0XHRcdGNvbnN0IHRvb2xUcmVlSXRlbSA9IGNyZWF0ZVRvb2xUcmVlSXRlbUZyb21EYXRhKHRvb2wsIHRvb2xDaGVja2VkKTtcblx0XHRcdGJ1Y2tldC5jaGlsZHJlbi5wdXNoKHRvb2xUcmVlSXRlbSk7XG5cdFx0fVxuXG5cdFx0Ly8gU2hvdyBlbnRyaWVzIGZvciBNQ1Agc2VydmVycyB0aGF0IGRvbid0IGhhdmUgYW55IHRvb2xzIGluIHRoZW0gYW5kIG1pZ2h0IG5lZWQgdG8gYmUgc3RhcnRlZC5cblx0XHRmb3IgKGNvbnN0IHsgc2VydmVyLCBzZWVuIH0gb2YgbWNwU2VydmVycy52YWx1ZXMoKSkge1xuXHRcdFx0Y29uc3QgY2FjaGVTdGF0ZSA9IHNlcnZlci5jYWNoZVN0YXRlLmdldCgpO1xuXHRcdFx0aWYgKCFzZWVuICYmIChjYWNoZVN0YXRlID09PSBNY3BTZXJ2ZXJDYWNoZVN0YXRlLlVua25vd24gfHwgY2FjaGVTdGF0ZSA9PT0gTWNwU2VydmVyQ2FjaGVTdGF0ZS5PdXRkYXRlZCkpIHtcblx0XHRcdFx0Z2V0QnVja2V0KHsgdHlwZTogJ21jcCcsIGRlZmluaXRpb25JZDogc2VydmVyLmRlZmluaXRpb24uaWQsIGxhYmVsOiBzZXJ2ZXIuZGVmaW5pdGlvbi5sYWJlbCwgaW5zdHJ1Y3Rpb25zOiAnJywgc2VydmVyTGFiZWw6ICcnLCBjb2xsZWN0aW9uSWQ6IHNlcnZlci5jb2xsZWN0aW9uLmlkIH0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIENvbnZlcnQgYnVja2V0IG1hcCB0byBzb3J0ZWQgdHJlZSBpdGVtc1xuXHRcdGNvbnN0IHNvcnRlZEJ1Y2tldHMgPSBBcnJheS5mcm9tKGJ1Y2tldE1hcC52YWx1ZXMoKSkuc29ydCgoYSwgYikgPT4ge1xuXHRcdFx0aWYgKGEuc29ydE9yZGVyICE9PSBiLnNvcnRPcmRlcikge1xuXHRcdFx0XHRyZXR1cm4gYS5zb3J0T3JkZXIgLSBiLnNvcnRPcmRlcjtcblx0XHRcdH1cblx0XHRcdHJldHVybiBhLmxhYmVsLmxvY2FsZUNvbXBhcmUoYi5sYWJlbCk7XG5cdFx0fSk7XG5cdFx0Zm9yIChjb25zdCBidWNrZXQgb2Ygc29ydGVkQnVja2V0cykge1xuXHRcdFx0dHJlZUl0ZW1zLnB1c2goYnVja2V0KTtcblx0XHRcdC8vIFNvcnQgY2hpbGRyZW4gYWxwaGFiZXRpY2FsbHlcblx0XHRcdGJ1Y2tldC5jaGlsZHJlbi5zb3J0KChhLCBiKSA9PiBhLmxhYmVsLmxvY2FsZUNvbXBhcmUoYi5sYWJlbCkpO1xuXHRcdFx0Zm9yIChjb25zdCBjaGlsZCBvZiBidWNrZXQuY2hpbGRyZW4pIHtcblx0XHRcdFx0aWYgKGlzVG9vbFNldFRyZWVJdGVtKGNoaWxkKSAmJiBjaGlsZC5jaGlsZHJlbikge1xuXHRcdFx0XHRcdGNoaWxkLmNoaWxkcmVuLnNvcnQoKGEsIGIpID0+IGEubGFiZWwubG9jYWxlQ29tcGFyZShiLmxhYmVsKSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0Ly8gQWRkIGFwcHJvdmFsIG1hbmFnZW1lbnQgYnV0dG9ucyB0byB0b29sIGl0ZW1zIHRoYXQgc3VwcG9ydCBjb25maXJtYXRpb25cblx0XHRmb3IgKGNvbnN0IGJ1Y2tldCBvZiBzb3J0ZWRCdWNrZXRzKSB7XG5cdFx0XHRjb25zdCBpc01jcEJ1Y2tldCA9IGJ1Y2tldC5vcmRpbmFsID09PSBCdWNrZXRPcmRpbmFsLk1jcDtcblx0XHRcdGNvbnN0IGFkZENvbmZpcm1hdGlvbkJ1dHRvbiA9ICh0b29sSXRlbTogSVRvb2xUcmVlSXRlbURhdGEpID0+IHtcblx0XHRcdFx0aWYgKCFjb25maXJtYXRpb25TZXJ2aWNlLnRvb2xDYW5NYW5hZ2VDb25maXJtYXRpb24odG9vbEl0ZW0udG9vbCkpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgdG9vbCA9IHRvb2xJdGVtLnRvb2w7XG5cdFx0XHRcdGNvbnN0IG1hbmFnZVRvb2xzID0gaXNNY3BCdWNrZXQgPyBidWNrZXQuY2hpbGRyZW4uZmxhdE1hcChjID0+IGlzVG9vbFRyZWVJdGVtKGMpID8gW2MudG9vbF0gOiBpc1Rvb2xTZXRUcmVlSXRlbShjKSAmJiBjLmNoaWxkcmVuID8gYy5jaGlsZHJlbi5maWx0ZXIoaXNUb29sVHJlZUl0ZW0pLm1hcChnYyA9PiBnYy50b29sKSA6IFtdKSA6IFt0b29sXTtcblx0XHRcdFx0Y29uc3QgYnV0dG9uczogQWN0aW9uYWJsZUJ1dHRvbltdID0gdG9vbEl0ZW0uYnV0dG9ucyA/IFsuLi50b29sSXRlbS5idXR0b25zXSA6IFtdO1xuXHRcdFx0XHRidXR0b25zLnB1c2goe1xuXHRcdFx0XHRcdGljb25DbGFzczogVGhlbWVJY29uLmFzQ2xhc3NOYW1lKENvZGljb24ucGFzcyksXG5cdFx0XHRcdFx0dG9vbHRpcDogbG9jYWxpemUoJ21hbmFnZVRvb2xBcHByb3ZhbCcsIFwiTWFuYWdlIEFwcHJvdmFsXCIpLFxuXHRcdFx0XHRcdGtlZXBPcGVuOiB0cnVlLFxuXHRcdFx0XHRcdGFjdGlvbjogKCkgPT4gY29uZmlybWF0aW9uU2VydmljZS5tYW5hZ2VDb25maXJtYXRpb25QcmVmZXJlbmNlcyhtYW5hZ2VUb29scywgeyBmb2N1c1Rvb2xJZDogdG9vbC5pZCB9KVxuXHRcdFx0XHR9KTtcblx0XHRcdFx0dG9vbEl0ZW0uYnV0dG9ucyA9IGJ1dHRvbnM7XG5cdFx0XHR9O1xuXG5cdFx0XHRmb3IgKGNvbnN0IGNoaWxkIG9mIGJ1Y2tldC5jaGlsZHJlbikge1xuXHRcdFx0XHRpZiAoaXNUb29sVHJlZUl0ZW0oY2hpbGQpKSB7XG5cdFx0XHRcdFx0YWRkQ29uZmlybWF0aW9uQnV0dG9uKGNoaWxkKTtcblx0XHRcdFx0fSBlbHNlIGlmIChpc1Rvb2xTZXRUcmVlSXRlbShjaGlsZCkgJiYgY2hpbGQuY2hpbGRyZW4pIHtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IGdyYW5kY2hpbGQgb2YgY2hpbGQuY2hpbGRyZW4pIHtcblx0XHRcdFx0XHRcdGlmIChpc1Rvb2xUcmVlSXRlbShncmFuZGNoaWxkKSkge1xuXHRcdFx0XHRcdFx0XHRhZGRDb25maXJtYXRpb25CdXR0b24oZ3JhbmRjaGlsZCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKHRyZWVJdGVtcy5sZW5ndGggPT09IDApIHtcblx0XHRcdHRyZWVQaWNrZXIucGxhY2Vob2xkZXIgPSBsb2NhbGl6ZSgnbm9Ub29scycsIFwiQWRkIHRvb2xzIHRvIGNoYXRcIik7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRyZWVQaWNrZXIucGxhY2Vob2xkZXIgPSBwbGFjZUhvbGRlcjtcblx0XHR9XG5cdFx0dHJlZVBpY2tlci5zZXRJdGVtVHJlZSh0cmVlSXRlbXMpO1xuXHR9XG5cblx0Ly8gQ3JlYXRlIGFuZCBjb25maWd1cmUgdGhlIHRyZWUgcGlja2VyXG5cdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRjb25zdCB0cmVlUGlja2VyID0gc3RvcmUuYWRkKHF1aWNrUGlja1NlcnZpY2UuY3JlYXRlUXVpY2tUcmVlPEFueVRyZWVJdGVtPigpKTtcblxuXHR0cmVlUGlja2VyLnBsYWNlaG9sZGVyID0gcGxhY2VIb2xkZXI7XG5cdHRyZWVQaWNrZXIuZGVzY3JpcHRpb24gPSBkZXNjcmlwdGlvbjtcblx0dHJlZVBpY2tlci5tYXRjaE9uRGVzY3JpcHRpb24gPSB0cnVlO1xuXHR0cmVlUGlja2VyLm1hdGNoT25MYWJlbCA9IHRydWU7XG5cdHRyZWVQaWNrZXIuc29ydEJ5TGFiZWwgPSBmYWxzZTtcblxuXHRjb21wdXRlSXRlbXMoKTtcblxuXHQvLyBIYW5kbGUgYnV0dG9uIHRyaWdnZXJzXG5cdHN0b3JlLmFkZCh0cmVlUGlja2VyLm9uRGlkVHJpZ2dlckl0ZW1CdXR0b24oZSA9PiB7XG5cdFx0aWYgKGUuYnV0dG9uICYmIHR5cGVvZiAoZS5idXR0b24gYXMgQWN0aW9uYWJsZUJ1dHRvbikuYWN0aW9uID09PSAnZnVuY3Rpb24nKSB7XG5cdFx0XHRjb25zdCBhY3Rpb25hYmxlQnV0dG9uID0gZS5idXR0b24gYXMgQWN0aW9uYWJsZUJ1dHRvbjtcblx0XHRcdGFjdGlvbmFibGVCdXR0b24uYWN0aW9uKCk7XG5cdFx0XHRzdG9yZS5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9KSk7XG5cblx0Y29uc3QgY29sbGVjdFJlc3VsdHMgPSAoKTogVG9vbEFuZFRvb2xTZXRFbmFibGVtZW50TWFwID0+IHtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IG5ldyBNYXA8SVRvb2xEYXRhIHwgSVRvb2xTZXQsIGJvb2xlYW4+KCk7XG5cdFx0Y29uc3QgdHJhdmVyc2UgPSAoaXRlbXM6IHJlYWRvbmx5IEFueVRyZWVJdGVtW10pID0+IHtcblx0XHRcdGZvciAoY29uc3QgaXRlbSBvZiBpdGVtcykge1xuXHRcdFx0XHRpZiAoaXNCdWNrZXRUcmVlSXRlbShpdGVtKSkge1xuXHRcdFx0XHRcdGlmIChpdGVtLnRvb2xzZXQpIHsgLy8gTUNQIHNlcnZlclxuXHRcdFx0XHRcdFx0Ly8gTUNQIHRvb2xzZXQgaXMgZW5hYmxlZCBvbmx5IGlmIGFsbCB0b29scyBhcmUgZW5hYmxlZFxuXHRcdFx0XHRcdFx0Y29uc3QgYWxsQ2hlY2tlZCA9IGl0ZW0uY2hlY2tlZCA9PT0gdHJ1ZTtcblx0XHRcdFx0XHRcdHJlc3VsdC5zZXQoaXRlbS50b29sc2V0LCBhbGxDaGVja2VkKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0dHJhdmVyc2UoaXRlbS5jaGlsZHJlbik7XG5cdFx0XHRcdH0gZWxzZSBpZiAoaXNUb29sU2V0VHJlZUl0ZW0oaXRlbSkpIHtcblx0XHRcdFx0XHRsZXQgdG9vbFNldENoZWNrZWQgPSBpdGVtLmNoZWNrZWQgPT09IHRydWU7XG5cdFx0XHRcdFx0aWYgKGl0ZW0uY2hpbGRyZW4pIHtcblx0XHRcdFx0XHRcdGNvbnN0IGFsbENoaWxkcmVuQ2hlY2tlZCA9IGl0ZW0uY2hpbGRyZW4uZmlsdGVyKGlzVG9vbFRyZWVJdGVtKS5ldmVyeShjaGlsZCA9PiBjaGlsZC5jaGVja2VkID09PSB0cnVlKTtcblx0XHRcdFx0XHRcdHRvb2xTZXRDaGVja2VkID0gdG9vbFNldENoZWNrZWQgJiYgYWxsQ2hpbGRyZW5DaGVja2VkO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXN1bHQuc2V0KGl0ZW0udG9vbHNldCwgdG9vbFNldENoZWNrZWQpO1xuXHRcdFx0XHRcdGlmIChpdGVtLmNoaWxkcmVuKSB7XG5cdFx0XHRcdFx0XHR0cmF2ZXJzZShpdGVtLmNoaWxkcmVuKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSBpZiAoaXNUb29sVHJlZUl0ZW0oaXRlbSkpIHtcblx0XHRcdFx0XHRjb25zdCBjaGVja2VkID0gaXRlbS5jaGVja2VkID09PSB0cnVlO1xuXHRcdFx0XHRcdGNvbnN0IHByZXZpb3VzID0gcmVzdWx0LmdldChpdGVtLnRvb2wpO1xuXHRcdFx0XHRcdC8vIFRvb2xzIGNhbiBzaG93IHVwIGluIG11bHRpcGxlIHBsYWNlcyAoZS5nLiBidWNrZXRzIGFuZCB0b29sIHNldHMpLiBJZiBhIHRvb2wgaXNcblx0XHRcdFx0XHQvLyBleHBsaWNpdGx5IHVuY2hlY2tlZCBhbnl3aGVyZSwgcHJlc2VydmUgdGhhdCBkZXNlbGVjdGlvbi5cblx0XHRcdFx0XHRyZXN1bHQuc2V0KGl0ZW0udG9vbCwgcHJldmlvdXMgPT09IHVuZGVmaW5lZCA/IGNoZWNrZWQgOiBwcmV2aW91cyAmJiBjaGVja2VkKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH07XG5cblx0XHR0cmF2ZXJzZSh0cmVlUGlja2VyLml0ZW1UcmVlKTtcblx0XHRyZXR1cm4gVG9vbEFuZFRvb2xTZXRFbmFibGVtZW50TWFwLmZyb21NYXAocmVzdWx0KTtcblx0fTtcblxuXHQvLyBIYW5kbGUgYWNjZXB0YW5jZVxuXHRsZXQgZGlkQWNjZXB0ID0gZmFsc2U7XG5cdGNvbnN0IGRpZEFjY2VwdEZpbmFsSXRlbSA9IHN0b3JlLmFkZChuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0c3RvcmUuYWRkKHRyZWVQaWNrZXIub25EaWRBY2NlcHQoKCkgPT4ge1xuXHRcdC8vIENoZWNrIGlmIGEgY2FsbGJhY2sgaXRlbSB3YXMgYWN0aXZhdGVkXG5cdFx0Y29uc3QgYWN0aXZlSXRlbXMgPSB0cmVlUGlja2VyLmFjdGl2ZUl0ZW1zO1xuXHRcdGNvbnN0IGNhbGxiYWNrSXRlbSA9IGFjdGl2ZUl0ZW1zLmZpbmQoaXNDYWxsYmFja1RyZWVJdGVtKTtcblx0XHRpZiAoIWNhbGxiYWNrSXRlbSkge1xuXHRcdFx0ZGlkQWNjZXB0ID0gdHJ1ZTtcblx0XHRcdHRyZWVQaWNrZXIuaGlkZSgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJldCA9IGNhbGxiYWNrSXRlbS5ydW4oKTtcblx0XHRpZiAocmV0ICE9PSBmYWxzZSkge1xuXHRcdFx0ZGlkQWNjZXB0RmluYWxJdGVtLmZpcmUoKTtcblx0XHR9XG5cdH0pKTtcblxuXHRjb25zdCBhZGRNY3BTZXJ2ZXJCdXR0b24gPSB7XG5cdFx0aWNvbkNsYXNzOiBUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi5tY3ApLFxuXHRcdHRvb2x0aXA6IGxvY2FsaXplKCdhZGRNY3BTZXJ2ZXInLCAnQWRkIE1DUCBTZXJ2ZXIuLi4nKVxuXHR9O1xuXHRjb25zdCBpbnN0YWxsRXh0ZW5zaW9uID0ge1xuXHRcdGljb25DbGFzczogVGhlbWVJY29uLmFzQ2xhc3NOYW1lKENvZGljb24uZXh0ZW5zaW9ucyksXG5cdFx0dG9vbHRpcDogbG9jYWxpemUoJ2FkZEV4dGVuc2lvbkJ1dHRvbicsICdJbnN0YWxsIEV4dGVuc2lvbi4uLicpXG5cdH07XG5cdGNvbnN0IGNvbmZpZ3VyZVRvb2xTZXRzID0ge1xuXHRcdGljb25DbGFzczogVGhlbWVJY29uLmFzQ2xhc3NOYW1lKENvZGljb24uZ2VhciksXG5cdFx0dG9vbHRpcDogbG9jYWxpemUoJ2NvbmZpZ1Rvb2xTZXRzJywgJ0NvbmZpZ3VyZSBUb29sIFNldHMuLi4nKVxuXHR9O1xuXHR0cmVlUGlja2VyLnRpdGxlID0gbG9jYWxpemUoJ2NvbmZpZ3VyZVRvb2xzJywgXCJDb25maWd1cmUgVG9vbHNcIik7XG5cdHRyZWVQaWNrZXIuYnV0dG9ucyA9IFthZGRNY3BTZXJ2ZXJCdXR0b24sIGluc3RhbGxFeHRlbnNpb24sIGNvbmZpZ3VyZVRvb2xTZXRzXTtcblx0c3RvcmUuYWRkKHRyZWVQaWNrZXIub25EaWRUcmlnZ2VyQnV0dG9uKGJ1dHRvbiA9PiB7XG5cdFx0aWYgKGJ1dHRvbiA9PT0gYWRkTWNwU2VydmVyQnV0dG9uKSB7XG5cdFx0XHRjb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChNY3BDb21tYW5kSWRzLkFkZENvbmZpZ3VyYXRpb24pO1xuXHRcdH0gZWxzZSBpZiAoYnV0dG9uID09PSBpbnN0YWxsRXh0ZW5zaW9uKSB7XG5cdFx0XHRleHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5vcGVuU2VhcmNoKCdAdGFnOmxhbmd1YWdlLW1vZGVsLXRvb2xzJyk7XG5cdFx0fSBlbHNlIGlmIChidXR0b24gPT09IGNvbmZpZ3VyZVRvb2xTZXRzKSB7XG5cdFx0XHRjb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChDb25maWd1cmVUb29sU2V0cy5JRCwgeyBzZWxlY3Rpb246IGNvbGxlY3RSZXN1bHRzKCkgfSk7XG5cdFx0fVxuXHRcdHRyZWVQaWNrZXIuaGlkZSgpO1xuXHR9KSk7XG5cblx0Ly8gQ2xvc2UgcGlja2VyIHdoZW4gY2FuY2VsbGVkIChlLmcuLCB3aGVuIG1vZGUgY2hhbmdlcylcblx0aWYgKHRva2VuKSB7XG5cdFx0c3RvcmUuYWRkKHRva2VuLm9uQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKCgpID0+IHtcblx0XHRcdHRyZWVQaWNrZXIuaGlkZSgpO1xuXHRcdH0pKTtcblx0fVxuXG5cdC8vIENhcHR1cmUgaW5pdGlhbCBzdGF0ZSBmb3IgdGVsZW1ldHJ5IGNvbXBhcmlzb25cblx0Y29uc3QgaW5pdGlhbFN0YXRlID0gY29sbGVjdFJlc3VsdHMoKTtcblxuXHR0cmVlUGlja2VyLnNob3coKTtcblxuXHRhd2FpdCBQcm9taXNlLnJhY2UoW0V2ZW50LnRvUHJvbWlzZShFdmVudC5hbnkodHJlZVBpY2tlci5vbkRpZEhpZGUsIGRpZEFjY2VwdEZpbmFsSXRlbS5ldmVudCksIHN0b3JlKV0pO1xuXG5cdC8vIFNlbmQgdGVsZW1ldHJ5IGFib3V0IHRvb2wgc2VsZWN0aW9uIGNoYW5nZXNcblx0c2VuZERpZENoYW5nZUV2ZW50KHNvdXJjZSwgdGVsZW1ldHJ5U2VydmljZSwgaW5pdGlhbFN0YXRlLCBjb2xsZWN0UmVzdWx0cygpLCBtY3BSZWdpc3RyeSk7XG5cblx0c3RvcmUuZGlzcG9zZSgpO1xuXG5cdHJldHVybiBkaWRBY2NlcHQgPyBjb2xsZWN0UmVzdWx0cygpIDogdW5kZWZpbmVkO1xufVxuXG4vKipcbiAqIENhdGVnb3JpemVzIGEgdG9vbCBvciB0b29sc2V0IHNvdXJjZSBmb3IgcHJpdmFjeS1zYWZlIHRlbGVtZXRyeS5cbiAqIFJldHVybnMgaWRlbnRpZnlpbmcgaW5mbyBvbmx5IGZvciBidWlsdC1pbi9leHRlbnNpb24gdG9vbHMgd2hlcmUgbmFtZXMgYXJlIHB1YmxpYy5cbiAqIEZvciB1c2VyLWRlZmluZWQgYW5kIHVzZXIgTUNQIHRvb2xzLCBvbmx5IHRoZSBjYXRlZ29yeSBpcyByZXR1cm5lZC5cbiAqXG4gKiBAcGFyYW0gaXRlbSAtIFRoZSB0b29sIG9yIHRvb2xzZXQgdG8gY2F0ZWdvcml6ZVxuICogQHBhcmFtIG1jcFJlZ2lzdHJ5IC0gVGhlIE1DUCByZWdpc3RyeSB0byBsb29rIHVwIGNvbGxlY3Rpb24gc291cmNlcyBmb3IgTUNQIHRvb2xzXG4gKi9cbmZ1bmN0aW9uIGNhdGVnb3JpemVUb29sKGl0ZW06IElUb29sRGF0YSB8IElUb29sU2V0LCBtY3BSZWdpc3RyeTogSU1jcFJlZ2lzdHJ5KTogeyBjYXRlZ29yeTogJ2J1aWx0aW4nIHwgJ2V4dGVuc2lvbicgfCAnZXh0ZW5zaW9uLW1jcCcgfCAndXNlci1tY3AnIHwgJ3VzZXItdG9vbHNldCc7IG5hbWU/OiBzdHJpbmc7IGV4dGVuc2lvbklkPzogc3RyaW5nIH0ge1xuXHRjb25zdCBzb3VyY2UgPSBpdGVtLnNvdXJjZTtcblx0c3dpdGNoIChzb3VyY2UudHlwZSkge1xuXHRcdGNhc2UgJ2ludGVybmFsJzpcblx0XHRcdC8vIEJ1aWx0LWluIHRvb2xzIGFyZSBzYWZlIHRvIGlkZW50aWZ5IGJ5IG5hbWVcblx0XHRcdHJldHVybiB7IGNhdGVnb3J5OiAnYnVpbHRpbicsIG5hbWU6IGl0ZW0uaWQgfTtcblx0XHRjYXNlICdleHRlbnNpb24nOlxuXHRcdFx0Ly8gRXh0ZW5zaW9uIHRvb2xzIGFyZSBwdWJsaWMsIHNhZmUgdG8gaW5jbHVkZSBuYW1lIGFuZCBleHRlbnNpb24gSURcblx0XHRcdHJldHVybiB7IGNhdGVnb3J5OiAnZXh0ZW5zaW9uJywgbmFtZTogaXRlbS5pZCwgZXh0ZW5zaW9uSWQ6IHNvdXJjZS5leHRlbnNpb25JZC52YWx1ZSB9O1xuXHRcdGNhc2UgJ21jcCc6IHtcblx0XHRcdC8vIE1DUCB0b29sczogY2hlY2sgaWYgdGhlIGNvbGxlY3Rpb24gY29tZXMgZnJvbSBhbiBleHRlbnNpb25cblx0XHRcdC8vIE5ldmVyIGluY2x1ZGUgdG9vbCBuYW1lcyBmb3IgcHJpdmFjeSwgYnV0IGluY2x1ZGUgZXh0ZW5zaW9uIElEIGlmIGZyb20gYW4gZXh0ZW5zaW9uXG5cdFx0XHRjb25zdCBjb2xsZWN0aW9uID0gbWNwUmVnaXN0cnkuY29sbGVjdGlvbnMuZ2V0KCkuZmluZChjID0+IGMuaWQgPT09IHNvdXJjZS5jb2xsZWN0aW9uSWQpO1xuXHRcdFx0aWYgKGNvbGxlY3Rpb24/LnNvdXJjZSBpbnN0YW5jZW9mIEV4dGVuc2lvbklkZW50aWZpZXIpIHtcblx0XHRcdFx0cmV0dXJuIHsgY2F0ZWdvcnk6ICdleHRlbnNpb24tbWNwJywgZXh0ZW5zaW9uSWQ6IGNvbGxlY3Rpb24uc291cmNlLnZhbHVlIH07XG5cdFx0XHR9XG5cdFx0XHQvLyBVc2VyLWNvbmZpZ3VyZWQgTUNQIHNlcnZlciAtIGRvbid0IGluY2x1ZGUgYW55IGlkZW50aWZ5aW5nIGluZm9cblx0XHRcdHJldHVybiB7IGNhdGVnb3J5OiAndXNlci1tY3AnIH07XG5cdFx0fVxuXHRcdGNhc2UgJ3VzZXInOlxuXHRcdFx0Ly8gVXNlci1kZWZpbmVkIHRvb2wgc2V0czogZG9uJ3QgaW5jbHVkZSBuYW1lcyBmb3IgcHJpdmFjeVxuXHRcdFx0cmV0dXJuIHsgY2F0ZWdvcnk6ICd1c2VyLXRvb2xzZXQnIH07XG5cdFx0Y2FzZSAnZXh0ZXJuYWwnOlxuXHRcdFx0Ly8gRXh0ZXJuYWwgdG9vbHMgc2hvdWxkbid0IGFwcGVhciBpbiB0aGUgcGlja2VyLCB0cmVhdCBhcyB1c2VyLWRlZmluZWQgZm9yIHNhZmV0eVxuXHRcdFx0cmV0dXJuIHsgY2F0ZWdvcnk6ICd1c2VyLXRvb2xzZXQnIH07XG5cdFx0ZGVmYXVsdDpcblx0XHRcdGFzc2VydE5ldmVyKHNvdXJjZSk7XG5cdH1cbn1cblxuaW50ZXJmYWNlIElUb29sVG9nZ2xlU3VtbWFyeSB7XG5cdC8qKiBOdW1iZXIgb2YgYnVpbHQtaW4gdG9vbHMgZW5hYmxlZCAqL1xuXHRidWlsdGluRW5hYmxlZDogbnVtYmVyO1xuXHQvKiogTnVtYmVyIG9mIGJ1aWx0LWluIHRvb2xzIGRpc2FibGVkICovXG5cdGJ1aWx0aW5EaXNhYmxlZDogbnVtYmVyO1xuXHQvKiogTnVtYmVyIG9mIGV4dGVuc2lvbiB0b29scyBlbmFibGVkICovXG5cdGV4dGVuc2lvbkVuYWJsZWQ6IG51bWJlcjtcblx0LyoqIE51bWJlciBvZiBleHRlbnNpb24gdG9vbHMgZGlzYWJsZWQgKi9cblx0ZXh0ZW5zaW9uRGlzYWJsZWQ6IG51bWJlcjtcblx0LyoqIE51bWJlciBvZiBleHRlbnNpb24gTUNQIHRvb2xzIGVuYWJsZWQgKi9cblx0ZXh0ZW5zaW9uTWNwRW5hYmxlZDogbnVtYmVyO1xuXHQvKiogTnVtYmVyIG9mIGV4dGVuc2lvbiBNQ1AgdG9vbHMgZGlzYWJsZWQgKi9cblx0ZXh0ZW5zaW9uTWNwRGlzYWJsZWQ6IG51bWJlcjtcblx0LyoqIE51bWJlciBvZiB1c2VyIE1DUCB0b29scyBlbmFibGVkICovXG5cdHVzZXJNY3BFbmFibGVkOiBudW1iZXI7XG5cdC8qKiBOdW1iZXIgb2YgdXNlciBNQ1AgdG9vbHMgZGlzYWJsZWQgKi9cblx0dXNlck1jcERpc2FibGVkOiBudW1iZXI7XG5cdC8qKiBOdW1iZXIgb2YgdXNlciB0b29sIHNldHMgZW5hYmxlZCAqL1xuXHR1c2VyVG9vbHNldEVuYWJsZWQ6IG51bWJlcjtcblx0LyoqIE51bWJlciBvZiB1c2VyIHRvb2wgc2V0cyBkaXNhYmxlZCAqL1xuXHR1c2VyVG9vbHNldERpc2FibGVkOiBudW1iZXI7XG5cdC8qKiBEZXRhaWxlZCBsaXN0IG9mIHRvZ2dsZWQgaXRlbXMgKG9ubHkgc2FmZS10by1sb2cgaXRlbXMgaW5jbHVkZSBuYW1lcykgKi9cblx0ZGV0YWlsczogc3RyaW5nO1xufVxuXG5mdW5jdGlvbiBjb21wdXRlVG9vbFRvZ2dsZVN1bW1hcnkoXG5cdGluaXRpYWxTdGF0ZTogVG9vbEFuZFRvb2xTZXRFbmFibGVtZW50TWFwLFxuXHRmaW5hbFN0YXRlOiBUb29sQW5kVG9vbFNldEVuYWJsZW1lbnRNYXAsXG5cdG1jcFJlZ2lzdHJ5OiBJTWNwUmVnaXN0cnlcbik6IElUb29sVG9nZ2xlU3VtbWFyeSB7XG5cdGNvbnN0IHN1bW1hcnk6IElUb29sVG9nZ2xlU3VtbWFyeSA9IHtcblx0XHRidWlsdGluRW5hYmxlZDogMCxcblx0XHRidWlsdGluRGlzYWJsZWQ6IDAsXG5cdFx0ZXh0ZW5zaW9uRW5hYmxlZDogMCxcblx0XHRleHRlbnNpb25EaXNhYmxlZDogMCxcblx0XHRleHRlbnNpb25NY3BFbmFibGVkOiAwLFxuXHRcdGV4dGVuc2lvbk1jcERpc2FibGVkOiAwLFxuXHRcdHVzZXJNY3BFbmFibGVkOiAwLFxuXHRcdHVzZXJNY3BEaXNhYmxlZDogMCxcblx0XHR1c2VyVG9vbHNldEVuYWJsZWQ6IDAsXG5cdFx0dXNlclRvb2xzZXREaXNhYmxlZDogMCxcblx0XHRkZXRhaWxzOiAnJ1xuXHR9O1xuXG5cdGNvbnN0IGRldGFpbEl0ZW1zOiB7IGNhdGVnb3J5OiBzdHJpbmc7IG5hbWU/OiBzdHJpbmc7IGV4dGVuc2lvbklkPzogc3RyaW5nOyBlbmFibGVkOiBib29sZWFuIH1bXSA9IFtdO1xuXG5cdC8vIENvbXBhcmUgc3RhdGVzIGFuZCByZWNvcmQgY2hhbmdlc1xuXHRmb3IgKGNvbnN0IFtpdGVtLCBmaW5hbEVuYWJsZWRdIG9mIGZpbmFsU3RhdGUpIHtcblx0XHRjb25zdCBpbml0aWFsRW5hYmxlZCA9IGluaXRpYWxTdGF0ZS5nZXQoaXRlbSkgPz8gZmFsc2U7XG5cdFx0aWYgKGluaXRpYWxFbmFibGVkID09PSBmaW5hbEVuYWJsZWQpIHtcblx0XHRcdGNvbnRpbnVlOyAvLyBObyBjaGFuZ2Vcblx0XHR9XG5cblx0XHRjb25zdCBjYXRlZ29yaXplZCA9IGNhdGVnb3JpemVUb29sKGl0ZW0sIG1jcFJlZ2lzdHJ5KTtcblx0XHRjb25zdCBlbmFibGVkID0gZmluYWxFbmFibGVkO1xuXG5cdFx0c3dpdGNoIChjYXRlZ29yaXplZC5jYXRlZ29yeSkge1xuXHRcdFx0Y2FzZSAnYnVpbHRpbic6XG5cdFx0XHRcdGlmIChlbmFibGVkKSB7IHN1bW1hcnkuYnVpbHRpbkVuYWJsZWQrKzsgfSBlbHNlIHsgc3VtbWFyeS5idWlsdGluRGlzYWJsZWQrKzsgfVxuXHRcdFx0XHRkZXRhaWxJdGVtcy5wdXNoKHsgY2F0ZWdvcnk6ICdidWlsdGluJywgbmFtZTogY2F0ZWdvcml6ZWQubmFtZSwgZW5hYmxlZCB9KTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlICdleHRlbnNpb24nOlxuXHRcdFx0XHRpZiAoZW5hYmxlZCkgeyBzdW1tYXJ5LmV4dGVuc2lvbkVuYWJsZWQrKzsgfSBlbHNlIHsgc3VtbWFyeS5leHRlbnNpb25EaXNhYmxlZCsrOyB9XG5cdFx0XHRcdGRldGFpbEl0ZW1zLnB1c2goeyBjYXRlZ29yeTogJ2V4dGVuc2lvbicsIG5hbWU6IGNhdGVnb3JpemVkLm5hbWUsIGV4dGVuc2lvbklkOiBjYXRlZ29yaXplZC5leHRlbnNpb25JZCwgZW5hYmxlZCB9KTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlICdleHRlbnNpb24tbWNwJzpcblx0XHRcdFx0aWYgKGVuYWJsZWQpIHsgc3VtbWFyeS5leHRlbnNpb25NY3BFbmFibGVkKys7IH0gZWxzZSB7IHN1bW1hcnkuZXh0ZW5zaW9uTWNwRGlzYWJsZWQrKzsgfVxuXHRcdFx0XHRkZXRhaWxJdGVtcy5wdXNoKHsgY2F0ZWdvcnk6ICdleHRlbnNpb24tbWNwJywgZXh0ZW5zaW9uSWQ6IGNhdGVnb3JpemVkLmV4dGVuc2lvbklkLCBlbmFibGVkIH0pO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgJ3VzZXItbWNwJzpcblx0XHRcdFx0aWYgKGVuYWJsZWQpIHsgc3VtbWFyeS51c2VyTWNwRW5hYmxlZCsrOyB9IGVsc2UgeyBzdW1tYXJ5LnVzZXJNY3BEaXNhYmxlZCsrOyB9XG5cdFx0XHRcdC8vIERvbid0IGluY2x1ZGUgbmFtZSBmb3IgcHJpdmFjeVxuXHRcdFx0XHRkZXRhaWxJdGVtcy5wdXNoKHsgY2F0ZWdvcnk6ICd1c2VyLW1jcCcsIGVuYWJsZWQgfSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSAndXNlci10b29sc2V0Jzpcblx0XHRcdFx0aWYgKGVuYWJsZWQpIHsgc3VtbWFyeS51c2VyVG9vbHNldEVuYWJsZWQrKzsgfSBlbHNlIHsgc3VtbWFyeS51c2VyVG9vbHNldERpc2FibGVkKys7IH1cblx0XHRcdFx0Ly8gRG9uJ3QgaW5jbHVkZSBuYW1lIGZvciBwcml2YWN5XG5cdFx0XHRcdGRldGFpbEl0ZW1zLnB1c2goeyBjYXRlZ29yeTogJ3VzZXItdG9vbHNldCcsIGVuYWJsZWQgfSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdH1cblx0fVxuXG5cdC8vIFNlcmlhbGl6ZSBkZXRhaWxzIGFzIEpTT05cblx0c3VtbWFyeS5kZXRhaWxzID0gSlNPTi5zdHJpbmdpZnkoZGV0YWlsSXRlbXMpO1xuXHRyZXR1cm4gc3VtbWFyeTtcbn1cblxuZnVuY3Rpb24gc2VuZERpZENoYW5nZUV2ZW50KFxuXHRzb3VyY2U6IHN0cmluZyxcblx0dGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdGluaXRpYWxTdGF0ZTogVG9vbEFuZFRvb2xTZXRFbmFibGVtZW50TWFwLFxuXHRmaW5hbFN0YXRlOiBUb29sQW5kVG9vbFNldEVuYWJsZW1lbnRNYXAsXG5cdG1jcFJlZ2lzdHJ5OiBJTWNwUmVnaXN0cnlcbik6IHZvaWQge1xuXHRjb25zdCBzdW1tYXJ5ID0gY29tcHV0ZVRvb2xUb2dnbGVTdW1tYXJ5KGluaXRpYWxTdGF0ZSwgZmluYWxTdGF0ZSwgbWNwUmVnaXN0cnkpO1xuXHRjb25zdCBjaGFuZ2VkID0gc3VtbWFyeS5idWlsdGluRW5hYmxlZCA+IDAgfHwgc3VtbWFyeS5idWlsdGluRGlzYWJsZWQgPiAwIHx8XG5cdFx0c3VtbWFyeS5leHRlbnNpb25FbmFibGVkID4gMCB8fCBzdW1tYXJ5LmV4dGVuc2lvbkRpc2FibGVkID4gMCB8fFxuXHRcdHN1bW1hcnkuZXh0ZW5zaW9uTWNwRW5hYmxlZCA+IDAgfHwgc3VtbWFyeS5leHRlbnNpb25NY3BEaXNhYmxlZCA+IDAgfHxcblx0XHRzdW1tYXJ5LnVzZXJNY3BFbmFibGVkID4gMCB8fCBzdW1tYXJ5LnVzZXJNY3BEaXNhYmxlZCA+IDAgfHxcblx0XHRzdW1tYXJ5LnVzZXJUb29sc2V0RW5hYmxlZCA+IDAgfHwgc3VtbWFyeS51c2VyVG9vbHNldERpc2FibGVkID4gMDtcblxuXHR0eXBlIFRvb2xQaWNrZXJDbG9zZWRFdmVudCA9IHtcblx0XHRjaGFuZ2VkOiBib29sZWFuO1xuXHRcdHNvdXJjZTogc3RyaW5nO1xuXHRcdGJ1aWx0aW5FbmFibGVkOiBudW1iZXI7XG5cdFx0YnVpbHRpbkRpc2FibGVkOiBudW1iZXI7XG5cdFx0ZXh0ZW5zaW9uRW5hYmxlZDogbnVtYmVyO1xuXHRcdGV4dGVuc2lvbkRpc2FibGVkOiBudW1iZXI7XG5cdFx0ZXh0ZW5zaW9uTWNwRW5hYmxlZDogbnVtYmVyO1xuXHRcdGV4dGVuc2lvbk1jcERpc2FibGVkOiBudW1iZXI7XG5cdFx0dXNlck1jcEVuYWJsZWQ6IG51bWJlcjtcblx0XHR1c2VyTWNwRGlzYWJsZWQ6IG51bWJlcjtcblx0XHR1c2VyVG9vbHNldEVuYWJsZWQ6IG51bWJlcjtcblx0XHR1c2VyVG9vbHNldERpc2FibGVkOiBudW1iZXI7XG5cdFx0ZGV0YWlsczogc3RyaW5nO1xuXHR9O1xuXG5cdHR5cGUgVG9vbFBpY2tlckNsb3NlZENsYXNzaWZpY2F0aW9uID0ge1xuXHRcdGNoYW5nZWQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdXaGV0aGVyIHRoZSB1c2VyIGNoYW5nZWQgdGhlIHRvb2wgc2VsZWN0aW9uIGZyb20gdGhlIGluaXRpYWwgc3RhdGUuJyB9O1xuXHRcdHNvdXJjZTogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RoZSBzb3VyY2Ugb2YgdGhlIHRvb2wgcGlja2VyIGV2ZW50LicgfTtcblx0XHRidWlsdGluRW5hYmxlZDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ051bWJlciBvZiBidWlsdC1pbiB0b29scyB0aGF0IHdlcmUgZW5hYmxlZC4nIH07XG5cdFx0YnVpbHRpbkRpc2FibGVkOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnTnVtYmVyIG9mIGJ1aWx0LWluIHRvb2xzIHRoYXQgd2VyZSBkaXNhYmxlZC4nIH07XG5cdFx0ZXh0ZW5zaW9uRW5hYmxlZDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ051bWJlciBvZiBleHRlbnNpb24gdG9vbHMgdGhhdCB3ZXJlIGVuYWJsZWQuJyB9O1xuXHRcdGV4dGVuc2lvbkRpc2FibGVkOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnTnVtYmVyIG9mIGV4dGVuc2lvbiB0b29scyB0aGF0IHdlcmUgZGlzYWJsZWQuJyB9O1xuXHRcdGV4dGVuc2lvbk1jcEVuYWJsZWQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdOdW1iZXIgb2YgZXh0ZW5zaW9uIE1DUCB0b29scyB0aGF0IHdlcmUgZW5hYmxlZC4nIH07XG5cdFx0ZXh0ZW5zaW9uTWNwRGlzYWJsZWQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdOdW1iZXIgb2YgZXh0ZW5zaW9uIE1DUCB0b29scyB0aGF0IHdlcmUgZGlzYWJsZWQuJyB9O1xuXHRcdHVzZXJNY3BFbmFibGVkOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnTnVtYmVyIG9mIHVzZXIgTUNQIHRvb2xzIHRoYXQgd2VyZSBlbmFibGVkLicgfTtcblx0XHR1c2VyTWNwRGlzYWJsZWQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdOdW1iZXIgb2YgdXNlciBNQ1AgdG9vbHMgdGhhdCB3ZXJlIGRpc2FibGVkLicgfTtcblx0XHR1c2VyVG9vbHNldEVuYWJsZWQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdOdW1iZXIgb2YgdXNlciB0b29sIHNldHMgdGhhdCB3ZXJlIGVuYWJsZWQuJyB9O1xuXHRcdHVzZXJUb29sc2V0RGlzYWJsZWQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdOdW1iZXIgb2YgdXNlciB0b29sIHNldHMgdGhhdCB3ZXJlIGRpc2FibGVkLicgfTtcblx0XHRkZXRhaWxzOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnSlNPTiBhcnJheSBvZiB0b2dnbGVkIGl0ZW1zLiBCdWlsdC1pbiBhbmQgZXh0ZW5zaW9uIHRvb2xzIGluY2x1ZGUgbmFtZXM7IHVzZXItZGVmaW5lZCBpdGVtcyBvbmx5IGluY2x1ZGUgY2F0ZWdvcnkuJyB9O1xuXHRcdG93bmVyOiAnYmVuaWJlbmonO1xuXHRcdGNvbW1lbnQ6ICdUcmFja3Mgd2hpY2ggdG9vbHMgdXNlcnMgdG9nZ2xlIGluIHRoZSB0b29sIHBpY2tlciwgd2l0aCBwcml2YWN5LXNhZmUgY2F0ZWdvcml6YXRpb24uJztcblx0fTtcblxuXHR0ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8VG9vbFBpY2tlckNsb3NlZEV2ZW50LCBUb29sUGlja2VyQ2xvc2VkQ2xhc3NpZmljYXRpb24+KCdjaGF0VG9vbFBpY2tlckNsb3NlZCcsIHtcblx0XHRzb3VyY2UsXG5cdFx0Y2hhbmdlZCxcblx0XHRidWlsdGluRW5hYmxlZDogc3VtbWFyeS5idWlsdGluRW5hYmxlZCxcblx0XHRidWlsdGluRGlzYWJsZWQ6IHN1bW1hcnkuYnVpbHRpbkRpc2FibGVkLFxuXHRcdGV4dGVuc2lvbkVuYWJsZWQ6IHN1bW1hcnkuZXh0ZW5zaW9uRW5hYmxlZCxcblx0XHRleHRlbnNpb25EaXNhYmxlZDogc3VtbWFyeS5leHRlbnNpb25EaXNhYmxlZCxcblx0XHRleHRlbnNpb25NY3BFbmFibGVkOiBzdW1tYXJ5LmV4dGVuc2lvbk1jcEVuYWJsZWQsXG5cdFx0ZXh0ZW5zaW9uTWNwRGlzYWJsZWQ6IHN1bW1hcnkuZXh0ZW5zaW9uTWNwRGlzYWJsZWQsXG5cdFx0dXNlck1jcEVuYWJsZWQ6IHN1bW1hcnkudXNlck1jcEVuYWJsZWQsXG5cdFx0dXNlck1jcERpc2FibGVkOiBzdW1tYXJ5LnVzZXJNY3BEaXNhYmxlZCxcblx0XHR1c2VyVG9vbHNldEVuYWJsZWQ6IHN1bW1hcnkudXNlclRvb2xzZXRFbmFibGVkLFxuXHRcdHVzZXJUb29sc2V0RGlzYWJsZWQ6IHN1bW1hcnkudXNlclRvb2xzZXREaXNhYmxlZCxcblx0XHRkZXRhaWxzOiBzdW1tYXJ5LmRldGFpbHMsXG5cdH0pO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBSUEsU0FBUyxtQkFBbUI7QUFFNUIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsU0FBUyxhQUFhO0FBQy9CLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsaUJBQWlCO0FBRTFCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsZ0NBQWdDLG9CQUFvQjtBQUU3RCxTQUFTLDRCQUE0QjtBQUNyQyxTQUE0QiwwQkFBMEQ7QUFDdEYsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxvQkFBb0IsbUNBQW1DO0FBQ2hFLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsb0JBQW9CO0FBQzdCLFNBQXFCLGFBQWEsc0JBQXNCLG9CQUFvQixxQkFBcUIsMEJBQTBCO0FBQzNILFNBQVMsc0NBQXNDO0FBRS9DLFNBQVMsOENBQThDO0FBQ3ZELFNBQVMsNEJBQWlELDZCQUE2QixzQkFBK0I7QUFDdEgsU0FBUyxtQkFBbUIscUNBQXFDO0FBRWpFLElBQVcsZ0JBQVgsa0JBQVdBLG1CQUFYO0FBQTJCLEVBQUFBLDhCQUFBO0FBQU0sRUFBQUEsOEJBQUE7QUFBUyxFQUFBQSw4QkFBQTtBQUFLLEVBQUFBLDhCQUFBO0FBQXBDLFNBQUFBO0FBQUEsR0FBQTtBQXNFWCxTQUFTLGlCQUFpQixNQUE0QztBQUNyRSxTQUFPLEtBQUssYUFBYTtBQUMxQjtBQUNBLFNBQVMsa0JBQWtCLE1BQTZDO0FBQ3ZFLFNBQU8sS0FBSyxhQUFhO0FBQzFCO0FBQ0EsU0FBUyxlQUFlLE1BQThDO0FBQ3JFLFNBQU8sS0FBSyxhQUFhO0FBQzFCO0FBQ0EsU0FBUyxtQkFBbUIsTUFBOEM7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LGtCQUFRO0FBQUEsUUFBdUIsT0FBTztBQUFFLGtCQUFRO0FBQUEsUUFBd0I7QUFDdkYsb0JBQVksS0FBSyxFQUFFLFVBQVUsaUJBQWlCLGFBQWEsWUFBWSxhQUFhLFFBQVEsQ0FBQztBQUM3RjtBQUFBLE1BQ0QsS0FBSztBQUNKLFlBQUksU0FBUztBQUFFLGtCQUFRO0FBQUEsUUFBa0IsT0FBTztBQUFFLGtCQUFRO0FBQUEsUUFBbUI7QUFFN0Usb0JBQVksS0FBSyxFQUFFLFVBQVUsWUFBWSxRQUFRLENBQUM7QUFDbEQ7QUFBQSxNQUNELEtBQUs7QUFDSixZQUFJLFNBQVM7QUFBRSxrQkFBUTtBQUFBLFFBQXNCLE9BQU87QUFBRSxrQkFBUTtBQUFBLFFBQXVCO0FBRXJGLG9CQUFZLEtBQUssRUFBRSxVQUFVLGdCQUFnQixRQUFRLENBQUM7QUFDdEQ7QUFBQSxJQUNGO0FBQUEsRUFDRDtBQUdBLFVBQVEsVUFBVSxLQUFLLFVBQVUsV0FBVztBQUM1QyxTQUFPO0FBQ1I7QUFFQSxTQUFTLG1CQUNSLFFBQ0Esa0JBQ0EsY0FDQSxZQUNBLGFBQ087QUFDUCxRQUFNLFVBQVUseUJBQXlCLGNBQWMsWUFBWSxXQUFXO0FBQzlFLFFBQU0sVUFBVSxRQUFRLGlCQUFpQixLQUFLLFFBQVEsa0JBQWtCLEtBQ3ZFLFFBQVEsbUJBQW1CLEtBQUssUUFBUSxvQkFBb0IsS0FDNUQsUUFBUSxzQkFBc0IsS0FBSyxRQUFRLHVCQUF1QixLQUNsRSxRQUFRLGlCQUFpQixLQUFLLFFBQVEsa0JBQWtCLEtBQ3hELFFBQVEscUJBQXFCLEtBQUssUUFBUSxzQkFBc0I7QUFvQ2pFLG1CQUFpQixXQUFrRSx3QkFBd0I7QUFBQSxJQUMxRztBQUFBLElBQ0E7QUFBQSxJQUNBLGdCQUFnQixRQUFRO0FBQUEsSUFDeEIsaUJBQWlCLFFBQVE7QUFBQSxJQUN6QixrQkFBa0IsUUFBUTtBQUFBLElBQzFCLG1CQUFtQixRQUFRO0FBQUEsSUFDM0IscUJBQXFCLFFBQVE7QUFBQSxJQUM3QixzQkFBc0IsUUFBUTtBQUFBLElBQzlCLGdCQUFnQixRQUFRO0FBQUEsSUFDeEIsaUJBQWlCLFFBQVE7QUFBQSxJQUN6QixvQkFBb0IsUUFBUTtBQUFBLElBQzVCLHFCQUFxQixRQUFRO0FBQUEsSUFDN0IsU0FBUyxRQUFRO0FBQUEsRUFDbEIsQ0FBQztBQUNGOyIsCiAgIm5hbWVzIjogWyJCdWNrZXRPcmRpbmFsIiwgInNvdXJjZSIsICJ0b29sU2V0Il0KfQo=
