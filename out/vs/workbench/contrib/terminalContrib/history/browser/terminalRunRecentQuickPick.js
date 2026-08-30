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
import { isMacintosh, OperatingSystem } from "../../../../../base/common/platform.js";
import { IModelService } from "../../../../../editor/common/services/model.js";
import { ITextModelService } from "../../../../../editor/common/services/resolverService.js";
import { localize } from "../../../../../nls.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { IQuickInputService, QuickInputButtonLocation } from "../../../../../platform/quickinput/common/quickInput.js";
import { TerminalCapability } from "../../../../../platform/terminal/common/capabilities/capabilities.js";
import { collapseTildePath } from "../../../../../platform/terminal/common/terminalEnvironment.js";
import { ThemeIcon } from "../../../../../base/common/themables.js";
import { commandHistoryFuzzySearchIcon, commandHistoryOpenFileIcon, commandHistoryOutputIcon, commandHistoryRemoveIcon } from "../../../terminal/browser/terminalIcons.js";
import { TerminalStorageKeys } from "../../../terminal/common/terminalStorageKeys.js";
import { terminalStrings } from "../../../terminal/common/terminalStrings.js";
import { URI } from "../../../../../base/common/uri.js";
import { fromNow } from "../../../../../base/common/date.js";
import { IEditorService } from "../../../../services/editor/common/editorService.js";
import { showWithPinnedItems } from "../../../../../platform/quickinput/browser/quickPickPin.js";
import { IStorageService } from "../../../../../platform/storage/common/storage.js";
import { AccessibleViewProviderId, IAccessibleViewService } from "../../../../../platform/accessibility/browser/accessibleView.js";
import { Disposable, DisposableStore } from "../../../../../base/common/lifecycle.js";
import { getCommandHistory, getDirectoryHistory, getShellFileHistory } from "../common/history.js";
import { ResourceSet } from "../../../../../base/common/map.js";
import { extUri, extUriIgnorePathCase } from "../../../../../base/common/resources.js";
import { IPathService } from "../../../../services/path/common/pathService.js";
import { isObject } from "../../../../../base/common/types.js";
async function showRunRecentQuickPick(accessor, instance, terminalInRunCommandPicker, type, filterMode, value) {
  if (!instance.xterm) {
    return;
  }
  const accessibleViewService = accessor.get(IAccessibleViewService);
  const editorService = accessor.get(IEditorService);
  const instantiationService = accessor.get(IInstantiationService);
  const quickInputService = accessor.get(IQuickInputService);
  const storageService = accessor.get(IStorageService);
  const pathService = accessor.get(IPathService);
  const runRecentStorageKey = `${TerminalStorageKeys.PinnedRecentCommandsPrefix}.${instance.shellType}`;
  let placeholder;
  let items = [];
  const commandMap = /* @__PURE__ */ new Set();
  const removeFromCommandHistoryButton = {
    iconClass: ThemeIcon.asClassName(commandHistoryRemoveIcon),
    tooltip: localize("removeCommand", "Remove from Command History")
  };
  const commandOutputButton = {
    iconClass: ThemeIcon.asClassName(commandHistoryOutputIcon),
    tooltip: localize("viewCommandOutput", "View Command Output"),
    alwaysVisible: false
  };
  const openResourceButtons = [];
  if (type === "command") {
    let formatLabel2 = function(label) {
      return label.replace(/\r?\n/g, "\u23CE").replace(/\s\s\s+/g, "\u22EF");
    };
    var formatLabel = formatLabel2;
    placeholder = isMacintosh ? localize("selectRecentCommandMac", "Select a command to run (hold Option-key to edit the command)") : localize("selectRecentCommand", "Select a command to run (hold Alt-key to edit the command)");
    const cmdDetection = instance.capabilities.get(TerminalCapability.CommandDetection);
    const commands = cmdDetection?.commands;
    const executingCommand = cmdDetection?.executingCommand;
    if (executingCommand) {
      commandMap.add(executingCommand);
    }
    if (commands && commands.length > 0) {
      for (let i = commands.length - 1; i >= 0; i--) {
        const entry = commands[i];
        const label = entry.command.trim();
        if (label.length === 0 || commandMap.has(label)) {
          continue;
        }
        let description = collapseTildePath(entry.cwd, instance.userHome, instance.os === OperatingSystem.Windows ? "\\" : "/");
        if (entry.exitCode) {
          if (entry.exitCode === -1) {
            description += " failed";
          } else {
            description += ` exitCode: ${entry.exitCode}`;
          }
        }
        description = description.trim();
        const buttons = [commandOutputButton];
        const lastItem = items.length > 0 ? items[items.length - 1] : void 0;
        if (lastItem?.type !== "separator" && lastItem?.label === label) {
          lastItem.id = entry.timestamp.toString();
          lastItem.description = description;
          continue;
        }
        items.push({
          label: formatLabel2(label),
          rawLabel: label,
          description,
          id: entry.timestamp.toString(),
          command: entry,
          buttons: entry.hasOutput() ? buttons : void 0
        });
        commandMap.add(label);
      }
    }
    if (executingCommand) {
      items.unshift({
        label: formatLabel2(executingCommand),
        rawLabel: executingCommand,
        description: cmdDetection.cwd
      });
    }
    if (items.length > 0) {
      items.unshift({
        type: "separator",
        buttons: [],
        // HACK: Force full sized separators as there's no flag currently
        label: terminalStrings.currentSessionCategory
      });
    }
    const history = instantiationService.invokeFunction(getCommandHistory);
    const previousSessionItems = [];
    for (const [label, info] of history.entries) {
      if (!commandMap.has(label) && info.shellType === instance.shellType) {
        previousSessionItems.unshift({
          label: formatLabel2(label),
          rawLabel: label,
          buttons: [removeFromCommandHistoryButton]
        });
        commandMap.add(label);
      }
    }
    if (previousSessionItems.length > 0) {
      items.push(
        {
          type: "separator",
          buttons: [],
          // HACK: Force full sized separators as there's no flag currently
          label: terminalStrings.previousSessionCategory
        },
        ...previousSessionItems
      );
    }
    const shellFileHistory = await instantiationService.invokeFunction(getShellFileHistory, instance.shellType);
    if (shellFileHistory !== void 0) {
      const dedupedShellFileItems = [];
      for (const label of shellFileHistory.commands) {
        if (!commandMap.has(label)) {
          dedupedShellFileItems.unshift({
            label: formatLabel2(label),
            rawLabel: label
          });
        }
      }
      if (dedupedShellFileItems.length > 0) {
        const button = {
          iconClass: ThemeIcon.asClassName(commandHistoryOpenFileIcon),
          tooltip: localize("openShellHistoryFile", "Open File"),
          alwaysVisible: false,
          resource: shellFileHistory.sourceResource
        };
        openResourceButtons.push(button);
        items.push(
          {
            type: "separator",
            buttons: [button],
            label: localize("shellFileHistoryCategory", "{0} history", instance.shellType),
            description: shellFileHistory.sourceLabel
          },
          ...dedupedShellFileItems
        );
      }
    }
  } else {
    placeholder = isMacintosh ? localize("selectRecentDirectoryMac", "Select a directory to go to (hold Option-key to edit the command)") : localize("selectRecentDirectory", "Select a directory to go to (hold Alt-key to edit the command)");
    const uriComparer = instance.os === OperatingSystem.Windows ? extUriIgnorePathCase : extUri;
    const uniqueUris = new ResourceSet((o) => uriComparer.getComparisonKey(o));
    const cwds = instance.capabilities.get(TerminalCapability.CwdDetection)?.cwds || [];
    if (cwds && cwds.length > 0) {
      for (const label of cwds) {
        const itemUri = URI.file(label);
        if (!uniqueUris.has(itemUri)) {
          uniqueUris.add(itemUri);
          items.push({
            label: await instance.getUriLabelForShell(itemUri),
            rawLabel: label
          });
        }
      }
      items = items.reverse();
      items.unshift({ type: "separator", label: terminalStrings.currentSessionCategory });
    }
    const history = instantiationService.invokeFunction(getDirectoryHistory);
    const previousSessionItems = [];
    for (const [label, info] of history.entries) {
      if (info === null || info.remoteAuthority === instance.remoteAuthority) {
        const itemUri = info?.remoteAuthority ? await pathService.fileURI(label) : URI.file(label);
        if (!uniqueUris.has(itemUri)) {
          uniqueUris.add(itemUri);
          previousSessionItems.unshift({
            label: await instance.getUriLabelForShell(itemUri),
            rawLabel: label,
            buttons: [removeFromCommandHistoryButton]
          });
        }
      }
    }
    if (previousSessionItems.length > 0) {
      items.push(
        { type: "separator", label: terminalStrings.previousSessionCategory },
        ...previousSessionItems
      );
    }
  }
  if (items.length === 0) {
    return;
  }
  const disposables = new DisposableStore();
  const fuzzySearchButton = {
    iconClass: ThemeIcon.asClassName(commandHistoryFuzzySearchIcon),
    tooltip: localize("fuzzySearch", "Fuzzy search"),
    toggle: { checked: filterMode === "fuzzy" },
    location: QuickInputButtonLocation.Input
  };
  const outputProvider = disposables.add(instantiationService.createInstance(TerminalOutputProvider));
  const quickPick = disposables.add(quickInputService.createQuickPick({ useSeparators: true }));
  const originalItems = items;
  quickPick.items = [...originalItems];
  quickPick.sortByLabel = false;
  quickPick.placeholder = placeholder;
  quickPick.matchOnLabelMode = filterMode || "contiguous";
  quickPick.buttons = [fuzzySearchButton];
  disposables.add(quickPick.onDidTriggerButton((button) => {
    if (button === fuzzySearchButton) {
      instantiationService.invokeFunction(showRunRecentQuickPick, instance, terminalInRunCommandPicker, type, fuzzySearchButton.toggle.checked ? "fuzzy" : "contiguous", quickPick.value);
    }
  }));
  disposables.add(quickPick.onDidTriggerItemButton(async (e) => {
    if (e.button === removeFromCommandHistoryButton) {
      if (type === "command") {
        instantiationService.invokeFunction(getCommandHistory)?.remove(e.item.label);
      } else {
        instantiationService.invokeFunction(getDirectoryHistory)?.remove(e.item.rawLabel);
      }
    } else if (e.button === commandOutputButton) {
      const selectedCommand = e.item.command;
      const output = selectedCommand?.getOutput();
      if (output && selectedCommand?.command) {
        const textContent = await outputProvider.provideTextContent(URI.from(
          {
            scheme: TerminalOutputProvider.scheme,
            path: `${selectedCommand.command}... ${fromNow(selectedCommand.timestamp, true)}`,
            fragment: output,
            query: `terminal-output-${selectedCommand.timestamp}-${instance.instanceId}`
          }
        ));
        if (textContent) {
          await editorService.openEditor({
            resource: textContent.uri
          });
        }
      }
    }
    await instantiationService.invokeFunction(showRunRecentQuickPick, instance, terminalInRunCommandPicker, type, filterMode, value);
  }));
  disposables.add(quickPick.onDidTriggerSeparatorButton(async (e) => {
    const resource = openResourceButtons.find((openResourceButton) => e.button === openResourceButton)?.resource;
    if (resource) {
      await editorService.openEditor({
        resource
      });
    }
  }));
  disposables.add(quickPick.onDidChangeValue(async (value2) => {
    if (!value2) {
      await instantiationService.invokeFunction(showRunRecentQuickPick, instance, terminalInRunCommandPicker, type, filterMode, value2);
    }
  }));
  let terminalScrollStateSaved = false;
  function restoreScrollState() {
    terminalScrollStateSaved = false;
    instance.xterm?.markTracker.restoreScrollState();
    instance.xterm?.markTracker.clear();
  }
  disposables.add(quickPick.onDidChangeActive(async () => {
    const xterm = instance.xterm;
    if (!xterm) {
      return;
    }
    const [item] = quickPick.activeItems;
    if (!item) {
      return;
    }
    function isItem(obj) {
      return isObject(obj) && "rawLabel" in obj;
    }
    if (isItem(item) && item.command && item.command.marker) {
      if (!terminalScrollStateSaved) {
        xterm.markTracker.saveScrollState();
        terminalScrollStateSaved = true;
      }
      const promptRowCount = item.command.getPromptRowCount();
      const commandRowCount = item.command.getCommandRowCount();
      xterm.markTracker.revealRange({
        start: {
          x: 1,
          y: item.command.marker.line - (promptRowCount - 1) + 1
        },
        end: {
          x: instance.cols,
          y: item.command.marker.line + (commandRowCount - 1) + 1
        }
      });
    } else {
      restoreScrollState();
    }
  }));
  disposables.add(quickPick.onDidAccept(async () => {
    const result = quickPick.activeItems[0];
    let text;
    if (type === "cwd") {
      text = `cd ${await instance.preparePathForShell(result.rawLabel)}`;
    } else {
      text = result.rawLabel;
    }
    quickPick.hide();
    terminalScrollStateSaved = false;
    instance.xterm?.markTracker.clear();
    instance.scrollToBottom();
    instance.runCommand(text, !quickPick.keyMods.alt);
    if (quickPick.keyMods.alt) {
      instance.focus();
    }
  }));
  disposables.add(quickPick.onDidHide(() => restoreScrollState()));
  if (value) {
    quickPick.value = value;
  }
  return new Promise((r) => {
    terminalInRunCommandPicker.set(true);
    disposables.add(showWithPinnedItems(storageService, runRecentStorageKey, quickPick, true));
    disposables.add(quickPick.onDidHide(() => {
      terminalInRunCommandPicker.set(false);
      accessibleViewService.showLastProvider(AccessibleViewProviderId.Terminal);
      r();
      disposables.dispose();
    }));
  });
}
let TerminalOutputProvider = class extends Disposable {
  constructor(textModelResolverService, _modelService) {
    super();
    this._modelService = _modelService;
    this._register(textModelResolverService.registerTextModelContentProvider(TerminalOutputProvider.scheme, this));
  }
  async provideTextContent(resource) {
    const existing = this._modelService.getModel(resource);
    if (existing && !existing.isDisposed()) {
      return existing;
    }
    return this._modelService.createModel(resource.fragment, null, resource, false);
  }
};
TerminalOutputProvider.scheme = "TERMINAL_OUTPUT";
TerminalOutputProvider = __decorateClass([
  __decorateParam(0, ITextModelService),
  __decorateParam(1, IModelService)
], TerminalOutputProvider);
export {
  showRunRecentQuickPick
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsQ29udHJpYlxcaGlzdG9yeVxcYnJvd3NlclxcdGVybWluYWxSdW5SZWNlbnRRdWlja1BpY2sudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBpc01hY2ludG9zaCwgT3BlcmF0aW5nU3lzdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgSU1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvbW9kZWwuanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbENvbnRlbnRQcm92aWRlciwgSVRleHRNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL3Jlc29sdmVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UsIFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElRdWlja0lucHV0QnV0dG9uLCBJUXVpY2tJbnB1dEJ1dHRvbldpdGhUb2dnbGUsIElRdWlja0lucHV0U2VydmljZSwgSVF1aWNrUGlja0l0ZW0sIElRdWlja1BpY2tTZXBhcmF0b3IsIFF1aWNrSW5wdXRCdXR0b25Mb2NhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3F1aWNraW5wdXQvY29tbW9uL3F1aWNrSW5wdXQuanMnO1xuaW1wb3J0IHsgSVRlcm1pbmFsQ29tbWFuZCwgVGVybWluYWxDYXBhYmlsaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvY29tbW9uL2NhcGFiaWxpdGllcy9jYXBhYmlsaXRpZXMuanMnO1xuaW1wb3J0IHsgY29sbGFwc2VUaWxkZVBhdGggfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZXJtaW5hbC9jb21tb24vdGVybWluYWxFbnZpcm9ubWVudC5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgSVRlcm1pbmFsSW5zdGFuY2UgfSBmcm9tICcuLi8uLi8uLi90ZXJtaW5hbC9icm93c2VyL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB7IGNvbW1hbmRIaXN0b3J5RnV6enlTZWFyY2hJY29uLCBjb21tYW5kSGlzdG9yeU9wZW5GaWxlSWNvbiwgY29tbWFuZEhpc3RvcnlPdXRwdXRJY29uLCBjb21tYW5kSGlzdG9yeVJlbW92ZUljb24gfSBmcm9tICcuLi8uLi8uLi90ZXJtaW5hbC9icm93c2VyL3Rlcm1pbmFsSWNvbnMuanMnO1xuaW1wb3J0IHsgVGVybWluYWxTdG9yYWdlS2V5cyB9IGZyb20gJy4uLy4uLy4uL3Rlcm1pbmFsL2NvbW1vbi90ZXJtaW5hbFN0b3JhZ2VLZXlzLmpzJztcbmltcG9ydCB7IHRlcm1pbmFsU3RyaW5ncyB9IGZyb20gJy4uLy4uLy4uL3Rlcm1pbmFsL2NvbW1vbi90ZXJtaW5hbFN0cmluZ3MuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGZyb21Ob3cgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9kYXRlLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IHNob3dXaXRoUGlubmVkSXRlbXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2Jyb3dzZXIvcXVpY2tQaWNrUGluLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IEFjY2Vzc2libGVWaWV3UHJvdmlkZXJJZCwgSUFjY2Vzc2libGVWaWV3U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjY2Vzc2liaWxpdHkvYnJvd3Nlci9hY2Nlc3NpYmxlVmlldy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgZ2V0Q29tbWFuZEhpc3RvcnksIGdldERpcmVjdG9yeUhpc3RvcnksIGdldFNoZWxsRmlsZUhpc3RvcnkgfSBmcm9tICcuLi9jb21tb24vaGlzdG9yeS5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZVNldCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcC5qcyc7XG5pbXBvcnQgeyBleHRVcmksIGV4dFVyaUlnbm9yZVBhdGhDYXNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IElQYXRoU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3BhdGgvY29tbW9uL3BhdGhTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGlzT2JqZWN0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gc2hvd1J1blJlY2VudFF1aWNrUGljayhcblx0YWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsXG5cdGluc3RhbmNlOiBJVGVybWluYWxJbnN0YW5jZSxcblx0dGVybWluYWxJblJ1bkNvbW1hbmRQaWNrZXI6IElDb250ZXh0S2V5PGJvb2xlYW4+LFxuXHR0eXBlOiAnY29tbWFuZCcgfCAnY3dkJyxcblx0ZmlsdGVyTW9kZT86ICdmdXp6eScgfCAnY29udGlndW91cycsXG5cdHZhbHVlPzogc3RyaW5nLFxuKTogUHJvbWlzZTx2b2lkPiB7XG5cdGlmICghaW5zdGFuY2UueHRlcm0pIHtcblx0XHRyZXR1cm47XG5cdH1cblxuXHRjb25zdCBhY2Nlc3NpYmxlVmlld1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUFjY2Vzc2libGVWaWV3U2VydmljZSk7XG5cdGNvbnN0IGVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpO1xuXHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJSW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXHRjb25zdCBxdWlja0lucHV0U2VydmljZSA9IGFjY2Vzc29yLmdldChJUXVpY2tJbnB1dFNlcnZpY2UpO1xuXHRjb25zdCBzdG9yYWdlU2VydmljZSA9IGFjY2Vzc29yLmdldChJU3RvcmFnZVNlcnZpY2UpO1xuXHRjb25zdCBwYXRoU2VydmljZSA9IGFjY2Vzc29yLmdldChJUGF0aFNlcnZpY2UpO1xuXG5cdGNvbnN0IHJ1blJlY2VudFN0b3JhZ2VLZXkgPSBgJHtUZXJtaW5hbFN0b3JhZ2VLZXlzLlBpbm5lZFJlY2VudENvbW1hbmRzUHJlZml4fS4ke2luc3RhbmNlLnNoZWxsVHlwZX1gO1xuXHRsZXQgcGxhY2Vob2xkZXI6IHN0cmluZztcblx0dHlwZSBJdGVtID0gSVF1aWNrUGlja0l0ZW0gJiB7IGNvbW1hbmQ/OiBJVGVybWluYWxDb21tYW5kOyByYXdMYWJlbDogc3RyaW5nIH07XG5cdGxldCBpdGVtczogKEl0ZW0gfCBJUXVpY2tQaWNrSXRlbSAmIHsgcmF3TGFiZWw6IHN0cmluZyB9IHwgSVF1aWNrUGlja1NlcGFyYXRvcilbXSA9IFtdO1xuXHRjb25zdCBjb21tYW5kTWFwOiBTZXQ8c3RyaW5nPiA9IG5ldyBTZXQoKTtcblxuXHRjb25zdCByZW1vdmVGcm9tQ29tbWFuZEhpc3RvcnlCdXR0b246IElRdWlja0lucHV0QnV0dG9uID0ge1xuXHRcdGljb25DbGFzczogVGhlbWVJY29uLmFzQ2xhc3NOYW1lKGNvbW1hbmRIaXN0b3J5UmVtb3ZlSWNvbiksXG5cdFx0dG9vbHRpcDogbG9jYWxpemUoJ3JlbW92ZUNvbW1hbmQnLCBcIlJlbW92ZSBmcm9tIENvbW1hbmQgSGlzdG9yeVwiKVxuXHR9O1xuXG5cdGNvbnN0IGNvbW1hbmRPdXRwdXRCdXR0b246IElRdWlja0lucHV0QnV0dG9uID0ge1xuXHRcdGljb25DbGFzczogVGhlbWVJY29uLmFzQ2xhc3NOYW1lKGNvbW1hbmRIaXN0b3J5T3V0cHV0SWNvbiksXG5cdFx0dG9vbHRpcDogbG9jYWxpemUoJ3ZpZXdDb21tYW5kT3V0cHV0JywgXCJWaWV3IENvbW1hbmQgT3V0cHV0XCIpLFxuXHRcdGFsd2F5c1Zpc2libGU6IGZhbHNlXG5cdH07XG5cblx0Y29uc3Qgb3BlblJlc291cmNlQnV0dG9uczogKElRdWlja0lucHV0QnV0dG9uICYgeyByZXNvdXJjZTogVVJJIH0pW10gPSBbXTtcblxuXHRpZiAodHlwZSA9PT0gJ2NvbW1hbmQnKSB7XG5cdFx0cGxhY2Vob2xkZXIgPSBpc01hY2ludG9zaCA/IGxvY2FsaXplKCdzZWxlY3RSZWNlbnRDb21tYW5kTWFjJywgJ1NlbGVjdCBhIGNvbW1hbmQgdG8gcnVuIChob2xkIE9wdGlvbi1rZXkgdG8gZWRpdCB0aGUgY29tbWFuZCknKSA6IGxvY2FsaXplKCdzZWxlY3RSZWNlbnRDb21tYW5kJywgJ1NlbGVjdCBhIGNvbW1hbmQgdG8gcnVuIChob2xkIEFsdC1rZXkgdG8gZWRpdCB0aGUgY29tbWFuZCknKTtcblx0XHRjb25zdCBjbWREZXRlY3Rpb24gPSBpbnN0YW5jZS5jYXBhYmlsaXRpZXMuZ2V0KFRlcm1pbmFsQ2FwYWJpbGl0eS5Db21tYW5kRGV0ZWN0aW9uKTtcblx0XHRjb25zdCBjb21tYW5kcyA9IGNtZERldGVjdGlvbj8uY29tbWFuZHM7XG5cdFx0Ly8gQ3VycmVudCBzZXNzaW9uIGhpc3Rvcnlcblx0XHRjb25zdCBleGVjdXRpbmdDb21tYW5kID0gY21kRGV0ZWN0aW9uPy5leGVjdXRpbmdDb21tYW5kO1xuXHRcdGlmIChleGVjdXRpbmdDb21tYW5kKSB7XG5cdFx0XHRjb21tYW5kTWFwLmFkZChleGVjdXRpbmdDb21tYW5kKTtcblx0XHR9XG5cdFx0ZnVuY3Rpb24gZm9ybWF0TGFiZWwobGFiZWw6IHN0cmluZykge1xuXHRcdFx0cmV0dXJuIGxhYmVsXG5cdFx0XHRcdC8vIFJlcGxhY2UgbmV3IGxpbmVzIHdpdGggXCJlbnRlclwiIHN5bWJvbFxuXHRcdFx0XHQucmVwbGFjZSgvXFxyP1xcbi9nLCAnXFx1MjNDRScpXG5cdFx0XHRcdC8vIFJlcGxhY2UgMyBvciBtb3JlIHNwYWNlcyB3aXRoIG1pZGxpbmUgaG9yaXpvbnRhbCBlbGxpcHNpcyB3aGljaCBsb29rcyBzaW1pbGFyXG5cdFx0XHRcdC8vIHRvIHdoaXRlc3BhY2UgaW4gdGhlIGVkaXRvclxuXHRcdFx0XHQucmVwbGFjZSgvXFxzXFxzXFxzKy9nLCAnXFx1MjJFRicpO1xuXHRcdH1cblx0XHRpZiAoY29tbWFuZHMgJiYgY29tbWFuZHMubGVuZ3RoID4gMCkge1xuXHRcdFx0Zm9yIChsZXQgaSA9IGNvbW1hbmRzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG5cdFx0XHRcdGNvbnN0IGVudHJ5ID0gY29tbWFuZHNbaV07XG5cdFx0XHRcdC8vIFRyaW0gb2ZmIGFueSB3aGl0ZXNwYWNlIGFuZC9vciBsaW5lIGVuZGluZ3MsIHJlcGxhY2UgbmV3IGxpbmVzIHdpdGggdGhlXG5cdFx0XHRcdC8vIERvd253YXJkcyBBcnJvdyB3aXRoIENvcm5lciBMZWZ0d2FyZHMgc3ltYm9sXG5cdFx0XHRcdGNvbnN0IGxhYmVsID0gZW50cnkuY29tbWFuZC50cmltKCk7XG5cdFx0XHRcdGlmIChsYWJlbC5sZW5ndGggPT09IDAgfHwgY29tbWFuZE1hcC5oYXMobGFiZWwpKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0bGV0IGRlc2NyaXB0aW9uID0gY29sbGFwc2VUaWxkZVBhdGgoZW50cnkuY3dkLCBpbnN0YW5jZS51c2VySG9tZSwgaW5zdGFuY2Uub3MgPT09IE9wZXJhdGluZ1N5c3RlbS5XaW5kb3dzID8gJ1xcXFwnIDogJy8nKTtcblx0XHRcdFx0aWYgKGVudHJ5LmV4aXRDb2RlKSB7XG5cdFx0XHRcdFx0Ly8gU2luY2UgeW91IGNhbm5vdCBnZXQgdGhlIGxhc3QgY29tbWFuZCdzIGV4aXQgY29kZSBvbiBwd3NoLCBqdXN0IHdoZXRoZXIgaXQgZmFpbGVkXG5cdFx0XHRcdFx0Ly8gb3Igbm90LCAtMSBpcyB0cmVhdGVkIHNwZWNpYWxseSBhcyBzaW1wbHkgZmFpbGVkXG5cdFx0XHRcdFx0aWYgKGVudHJ5LmV4aXRDb2RlID09PSAtMSkge1xuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb24gKz0gJyBmYWlsZWQnO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbiArPSBgIGV4aXRDb2RlOiAke2VudHJ5LmV4aXRDb2RlfWA7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdGRlc2NyaXB0aW9uID0gZGVzY3JpcHRpb24udHJpbSgpO1xuXHRcdFx0XHRjb25zdCBidXR0b25zOiBJUXVpY2tJbnB1dEJ1dHRvbltdID0gW2NvbW1hbmRPdXRwdXRCdXR0b25dO1xuXHRcdFx0XHQvLyBNZXJnZSBjb25zZWN1dGl2ZSBjb21tYW5kc1xuXHRcdFx0XHRjb25zdCBsYXN0SXRlbSA9IGl0ZW1zLmxlbmd0aCA+IDAgPyBpdGVtc1tpdGVtcy5sZW5ndGggLSAxXSA6IHVuZGVmaW5lZDtcblx0XHRcdFx0aWYgKGxhc3RJdGVtPy50eXBlICE9PSAnc2VwYXJhdG9yJyAmJiBsYXN0SXRlbT8ubGFiZWwgPT09IGxhYmVsKSB7XG5cdFx0XHRcdFx0bGFzdEl0ZW0uaWQgPSBlbnRyeS50aW1lc3RhbXAudG9TdHJpbmcoKTtcblx0XHRcdFx0XHRsYXN0SXRlbS5kZXNjcmlwdGlvbiA9IGRlc2NyaXB0aW9uO1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGl0ZW1zLnB1c2goe1xuXHRcdFx0XHRcdGxhYmVsOiBmb3JtYXRMYWJlbChsYWJlbCksXG5cdFx0XHRcdFx0cmF3TGFiZWw6IGxhYmVsLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uLFxuXHRcdFx0XHRcdGlkOiBlbnRyeS50aW1lc3RhbXAudG9TdHJpbmcoKSxcblx0XHRcdFx0XHRjb21tYW5kOiBlbnRyeSxcblx0XHRcdFx0XHRidXR0b25zOiBlbnRyeS5oYXNPdXRwdXQoKSA/IGJ1dHRvbnMgOiB1bmRlZmluZWRcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGNvbW1hbmRNYXAuYWRkKGxhYmVsKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKGV4ZWN1dGluZ0NvbW1hbmQpIHtcblx0XHRcdGl0ZW1zLnVuc2hpZnQoe1xuXHRcdFx0XHRsYWJlbDogZm9ybWF0TGFiZWwoZXhlY3V0aW5nQ29tbWFuZCksXG5cdFx0XHRcdHJhd0xhYmVsOiBleGVjdXRpbmdDb21tYW5kLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogY21kRGV0ZWN0aW9uLmN3ZFxuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdGlmIChpdGVtcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRpdGVtcy51bnNoaWZ0KHtcblx0XHRcdFx0dHlwZTogJ3NlcGFyYXRvcicsXG5cdFx0XHRcdGJ1dHRvbnM6IFtdLCAvLyBIQUNLOiBGb3JjZSBmdWxsIHNpemVkIHNlcGFyYXRvcnMgYXMgdGhlcmUncyBubyBmbGFnIGN1cnJlbnRseVxuXHRcdFx0XHRsYWJlbDogdGVybWluYWxTdHJpbmdzLmN1cnJlbnRTZXNzaW9uQ2F0ZWdvcnlcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdC8vIEdhdGhlciBwcmV2aW91cyBzZXNzaW9uIGhpc3Rvcnlcblx0XHRjb25zdCBoaXN0b3J5ID0gaW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oZ2V0Q29tbWFuZEhpc3RvcnkpO1xuXHRcdGNvbnN0IHByZXZpb3VzU2Vzc2lvbkl0ZW1zOiAoSVF1aWNrUGlja0l0ZW0gJiB7IHJhd0xhYmVsOiBzdHJpbmcgfSlbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgW2xhYmVsLCBpbmZvXSBvZiBoaXN0b3J5LmVudHJpZXMpIHtcblx0XHRcdC8vIE9ubHkgYWRkIHByZXZpb3VzIHNlc3Npb24gaXRlbSBpZiBpdCdzIG5vdCBpbiB0aGlzIHNlc3Npb25cblx0XHRcdGlmICghY29tbWFuZE1hcC5oYXMobGFiZWwpICYmIGluZm8uc2hlbGxUeXBlID09PSBpbnN0YW5jZS5zaGVsbFR5cGUpIHtcblx0XHRcdFx0cHJldmlvdXNTZXNzaW9uSXRlbXMudW5zaGlmdCh7XG5cdFx0XHRcdFx0bGFiZWw6IGZvcm1hdExhYmVsKGxhYmVsKSxcblx0XHRcdFx0XHRyYXdMYWJlbDogbGFiZWwsXG5cdFx0XHRcdFx0YnV0dG9uczogW3JlbW92ZUZyb21Db21tYW5kSGlzdG9yeUJ1dHRvbl1cblx0XHRcdFx0fSk7XG5cdFx0XHRcdGNvbW1hbmRNYXAuYWRkKGxhYmVsKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAocHJldmlvdXNTZXNzaW9uSXRlbXMubGVuZ3RoID4gMCkge1xuXHRcdFx0aXRlbXMucHVzaChcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHR5cGU6ICdzZXBhcmF0b3InLFxuXHRcdFx0XHRcdGJ1dHRvbnM6IFtdLCAvLyBIQUNLOiBGb3JjZSBmdWxsIHNpemVkIHNlcGFyYXRvcnMgYXMgdGhlcmUncyBubyBmbGFnIGN1cnJlbnRseVxuXHRcdFx0XHRcdGxhYmVsOiB0ZXJtaW5hbFN0cmluZ3MucHJldmlvdXNTZXNzaW9uQ2F0ZWdvcnlcblx0XHRcdFx0fSxcblx0XHRcdFx0Li4ucHJldmlvdXNTZXNzaW9uSXRlbXMsXG5cdFx0XHQpO1xuXHRcdH1cblxuXHRcdC8vIEdhdGhlciBzaGVsbCBmaWxlIGhpc3Rvcnlcblx0XHRjb25zdCBzaGVsbEZpbGVIaXN0b3J5ID0gYXdhaXQgaW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oZ2V0U2hlbGxGaWxlSGlzdG9yeSwgaW5zdGFuY2Uuc2hlbGxUeXBlKTtcblx0XHRpZiAoc2hlbGxGaWxlSGlzdG9yeSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRjb25zdCBkZWR1cGVkU2hlbGxGaWxlSXRlbXM6IChJUXVpY2tQaWNrSXRlbSAmIHsgcmF3TGFiZWw6IHN0cmluZyB9KVtdID0gW107XG5cdFx0XHRmb3IgKGNvbnN0IGxhYmVsIG9mIHNoZWxsRmlsZUhpc3RvcnkuY29tbWFuZHMpIHtcblx0XHRcdFx0aWYgKCFjb21tYW5kTWFwLmhhcyhsYWJlbCkpIHtcblx0XHRcdFx0XHRkZWR1cGVkU2hlbGxGaWxlSXRlbXMudW5zaGlmdCh7XG5cdFx0XHRcdFx0XHRsYWJlbDogZm9ybWF0TGFiZWwobGFiZWwpLFxuXHRcdFx0XHRcdFx0cmF3TGFiZWw6IGxhYmVsXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGlmIChkZWR1cGVkU2hlbGxGaWxlSXRlbXMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRjb25zdCBidXR0b246IElRdWlja0lucHV0QnV0dG9uICYgeyByZXNvdXJjZTogVVJJIH0gPSB7XG5cdFx0XHRcdFx0aWNvbkNsYXNzOiBUaGVtZUljb24uYXNDbGFzc05hbWUoY29tbWFuZEhpc3RvcnlPcGVuRmlsZUljb24pLFxuXHRcdFx0XHRcdHRvb2x0aXA6IGxvY2FsaXplKCdvcGVuU2hlbGxIaXN0b3J5RmlsZScsIFwiT3BlbiBGaWxlXCIpLFxuXHRcdFx0XHRcdGFsd2F5c1Zpc2libGU6IGZhbHNlLFxuXHRcdFx0XHRcdHJlc291cmNlOiBzaGVsbEZpbGVIaXN0b3J5LnNvdXJjZVJlc291cmNlXG5cdFx0XHRcdH07XG5cdFx0XHRcdG9wZW5SZXNvdXJjZUJ1dHRvbnMucHVzaChidXR0b24pO1xuXHRcdFx0XHRpdGVtcy5wdXNoKFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHR5cGU6ICdzZXBhcmF0b3InLFxuXHRcdFx0XHRcdFx0YnV0dG9uczogW2J1dHRvbl0sXG5cdFx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ3NoZWxsRmlsZUhpc3RvcnlDYXRlZ29yeScsICd7MH0gaGlzdG9yeScsIGluc3RhbmNlLnNoZWxsVHlwZSksXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogc2hlbGxGaWxlSGlzdG9yeS5zb3VyY2VMYWJlbFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0Li4uZGVkdXBlZFNoZWxsRmlsZUl0ZW1zLFxuXHRcdFx0XHQpO1xuXHRcdFx0fVxuXHRcdH1cblx0fSBlbHNlIHtcblx0XHRwbGFjZWhvbGRlciA9IGlzTWFjaW50b3NoXG5cdFx0XHQ/IGxvY2FsaXplKCdzZWxlY3RSZWNlbnREaXJlY3RvcnlNYWMnLCAnU2VsZWN0IGEgZGlyZWN0b3J5IHRvIGdvIHRvIChob2xkIE9wdGlvbi1rZXkgdG8gZWRpdCB0aGUgY29tbWFuZCknKVxuXHRcdFx0OiBsb2NhbGl6ZSgnc2VsZWN0UmVjZW50RGlyZWN0b3J5JywgJ1NlbGVjdCBhIGRpcmVjdG9yeSB0byBnbyB0byAoaG9sZCBBbHQta2V5IHRvIGVkaXQgdGhlIGNvbW1hbmQpJyk7XG5cblx0XHQvLyBDaGVjayBwYXRoIHVuaXF1ZW5lc3MgZm9sbG93aW5nIHRhcmdldCBwbGF0Zm9ybSdzIGNhc2Ugc2Vuc2l0aXZpdHkgcnVsZXMuXG5cdFx0Y29uc3QgdXJpQ29tcGFyZXIgPSBpbnN0YW5jZS5vcyA9PT0gT3BlcmF0aW5nU3lzdGVtLldpbmRvd3MgPyBleHRVcmlJZ25vcmVQYXRoQ2FzZSA6IGV4dFVyaTtcblx0XHRjb25zdCB1bmlxdWVVcmlzID0gbmV3IFJlc291cmNlU2V0KG8gPT4gdXJpQ29tcGFyZXIuZ2V0Q29tcGFyaXNvbktleShvKSk7XG5cblx0XHRjb25zdCBjd2RzID0gaW5zdGFuY2UuY2FwYWJpbGl0aWVzLmdldChUZXJtaW5hbENhcGFiaWxpdHkuQ3dkRGV0ZWN0aW9uKT8uY3dkcyB8fCBbXTtcblx0XHRpZiAoY3dkcyAmJiBjd2RzLmxlbmd0aCA+IDApIHtcblx0XHRcdGZvciAoY29uc3QgbGFiZWwgb2YgY3dkcykge1xuXHRcdFx0XHRjb25zdCBpdGVtVXJpID0gVVJJLmZpbGUobGFiZWwpO1xuXHRcdFx0XHRpZiAoIXVuaXF1ZVVyaXMuaGFzKGl0ZW1VcmkpKSB7XG5cdFx0XHRcdFx0dW5pcXVlVXJpcy5hZGQoaXRlbVVyaSk7XG5cdFx0XHRcdFx0aXRlbXMucHVzaCh7XG5cdFx0XHRcdFx0XHRsYWJlbDogYXdhaXQgaW5zdGFuY2UuZ2V0VXJpTGFiZWxGb3JTaGVsbChpdGVtVXJpKSxcblx0XHRcdFx0XHRcdHJhd0xhYmVsOiBsYWJlbFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpdGVtcyA9IGl0ZW1zLnJldmVyc2UoKTtcblx0XHRcdGl0ZW1zLnVuc2hpZnQoeyB0eXBlOiAnc2VwYXJhdG9yJywgbGFiZWw6IHRlcm1pbmFsU3RyaW5ncy5jdXJyZW50U2Vzc2lvbkNhdGVnb3J5IH0pO1xuXHRcdH1cblxuXHRcdC8vIEdhdGhlciBwcmV2aW91cyBzZXNzaW9uIGhpc3Rvcnlcblx0XHRjb25zdCBoaXN0b3J5ID0gaW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oZ2V0RGlyZWN0b3J5SGlzdG9yeSk7XG5cdFx0Y29uc3QgcHJldmlvdXNTZXNzaW9uSXRlbXM6IChJUXVpY2tQaWNrSXRlbSAmIHsgcmF3TGFiZWw6IHN0cmluZyB9KVtdID0gW107XG5cdFx0Ly8gT25seSBhZGQgcHJldmlvdXMgc2Vzc2lvbiBpdGVtIGlmIGl0J3Mgbm90IGluIHRoaXMgc2Vzc2lvbiBhbmQgaXQgbWF0Y2hlcyB0aGUgcmVtb3RlIGF1dGhvcml0eVxuXHRcdGZvciAoY29uc3QgW2xhYmVsLCBpbmZvXSBvZiBoaXN0b3J5LmVudHJpZXMpIHtcblx0XHRcdGlmIChpbmZvID09PSBudWxsIHx8IGluZm8ucmVtb3RlQXV0aG9yaXR5ID09PSBpbnN0YW5jZS5yZW1vdGVBdXRob3JpdHkpIHtcblx0XHRcdFx0Y29uc3QgaXRlbVVyaSA9IGluZm8/LnJlbW90ZUF1dGhvcml0eSA/IGF3YWl0IHBhdGhTZXJ2aWNlLmZpbGVVUkkobGFiZWwpIDogVVJJLmZpbGUobGFiZWwpO1xuXHRcdFx0XHRpZiAoIXVuaXF1ZVVyaXMuaGFzKGl0ZW1VcmkpKSB7XG5cdFx0XHRcdFx0dW5pcXVlVXJpcy5hZGQoaXRlbVVyaSk7XG5cdFx0XHRcdFx0cHJldmlvdXNTZXNzaW9uSXRlbXMudW5zaGlmdCh7XG5cdFx0XHRcdFx0XHRsYWJlbDogYXdhaXQgaW5zdGFuY2UuZ2V0VXJpTGFiZWxGb3JTaGVsbChpdGVtVXJpKSxcblx0XHRcdFx0XHRcdHJhd0xhYmVsOiBsYWJlbCxcblx0XHRcdFx0XHRcdGJ1dHRvbnM6IFtyZW1vdmVGcm9tQ29tbWFuZEhpc3RvcnlCdXR0b25dXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKHByZXZpb3VzU2Vzc2lvbkl0ZW1zLmxlbmd0aCA+IDApIHtcblx0XHRcdGl0ZW1zLnB1c2goXG5cdFx0XHRcdHsgdHlwZTogJ3NlcGFyYXRvcicsIGxhYmVsOiB0ZXJtaW5hbFN0cmluZ3MucHJldmlvdXNTZXNzaW9uQ2F0ZWdvcnkgfSxcblx0XHRcdFx0Li4ucHJldmlvdXNTZXNzaW9uSXRlbXMsXG5cdFx0XHQpO1xuXHRcdH1cblx0fVxuXHRpZiAoaXRlbXMubGVuZ3RoID09PSAwKSB7XG5cdFx0cmV0dXJuO1xuXHR9XG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRjb25zdCBmdXp6eVNlYXJjaEJ1dHRvbjogSVF1aWNrSW5wdXRCdXR0b25XaXRoVG9nZ2xlID0ge1xuXHRcdGljb25DbGFzczogVGhlbWVJY29uLmFzQ2xhc3NOYW1lKGNvbW1hbmRIaXN0b3J5RnV6enlTZWFyY2hJY29uKSxcblx0XHR0b29sdGlwOiBsb2NhbGl6ZSgnZnV6enlTZWFyY2gnLCBcIkZ1enp5IHNlYXJjaFwiKSxcblx0XHR0b2dnbGU6IHsgY2hlY2tlZDogZmlsdGVyTW9kZSA9PT0gJ2Z1enp5JyB9LFxuXHRcdGxvY2F0aW9uOiBRdWlja0lucHV0QnV0dG9uTG9jYXRpb24uSW5wdXRcblx0fTtcblx0Y29uc3Qgb3V0cHV0UHJvdmlkZXIgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVybWluYWxPdXRwdXRQcm92aWRlcikpO1xuXHRjb25zdCBxdWlja1BpY2sgPSBkaXNwb3NhYmxlcy5hZGQocXVpY2tJbnB1dFNlcnZpY2UuY3JlYXRlUXVpY2tQaWNrPEl0ZW0gfCBJUXVpY2tQaWNrSXRlbSAmIHsgcmF3TGFiZWw6IHN0cmluZyB9Pih7IHVzZVNlcGFyYXRvcnM6IHRydWUgfSkpO1xuXHRjb25zdCBvcmlnaW5hbEl0ZW1zID0gaXRlbXM7XG5cdHF1aWNrUGljay5pdGVtcyA9IFsuLi5vcmlnaW5hbEl0ZW1zXTtcblx0cXVpY2tQaWNrLnNvcnRCeUxhYmVsID0gZmFsc2U7XG5cdHF1aWNrUGljay5wbGFjZWhvbGRlciA9IHBsYWNlaG9sZGVyO1xuXHRxdWlja1BpY2subWF0Y2hPbkxhYmVsTW9kZSA9IGZpbHRlck1vZGUgfHwgJ2NvbnRpZ3VvdXMnO1xuXHRxdWlja1BpY2suYnV0dG9ucyA9IFtmdXp6eVNlYXJjaEJ1dHRvbl07XG5cdGRpc3Bvc2FibGVzLmFkZChxdWlja1BpY2sub25EaWRUcmlnZ2VyQnV0dG9uKChidXR0b24pID0+IHtcblx0XHRpZiAoYnV0dG9uID09PSBmdXp6eVNlYXJjaEJ1dHRvbikge1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oc2hvd1J1blJlY2VudFF1aWNrUGljaywgaW5zdGFuY2UsIHRlcm1pbmFsSW5SdW5Db21tYW5kUGlja2VyLCB0eXBlLCBmdXp6eVNlYXJjaEJ1dHRvbi50b2dnbGUuY2hlY2tlZCA/ICdmdXp6eScgOiAnY29udGlndW91cycsIHF1aWNrUGljay52YWx1ZSk7XG5cdFx0fVxuXHR9KSk7XG5cdGRpc3Bvc2FibGVzLmFkZChxdWlja1BpY2sub25EaWRUcmlnZ2VySXRlbUJ1dHRvbihhc3luYyBlID0+IHtcblx0XHRpZiAoZS5idXR0b24gPT09IHJlbW92ZUZyb21Db21tYW5kSGlzdG9yeUJ1dHRvbikge1xuXHRcdFx0aWYgKHR5cGUgPT09ICdjb21tYW5kJykge1xuXHRcdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihnZXRDb21tYW5kSGlzdG9yeSk/LnJlbW92ZShlLml0ZW0ubGFiZWwpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oZ2V0RGlyZWN0b3J5SGlzdG9yeSk/LnJlbW92ZShlLml0ZW0ucmF3TGFiZWwpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAoZS5idXR0b24gPT09IGNvbW1hbmRPdXRwdXRCdXR0b24pIHtcblx0XHRcdGNvbnN0IHNlbGVjdGVkQ29tbWFuZCA9IChlLml0ZW0gYXMgSXRlbSkuY29tbWFuZDtcblx0XHRcdGNvbnN0IG91dHB1dCA9IHNlbGVjdGVkQ29tbWFuZD8uZ2V0T3V0cHV0KCk7XG5cdFx0XHRpZiAob3V0cHV0ICYmIHNlbGVjdGVkQ29tbWFuZD8uY29tbWFuZCkge1xuXHRcdFx0XHRjb25zdCB0ZXh0Q29udGVudCA9IGF3YWl0IG91dHB1dFByb3ZpZGVyLnByb3ZpZGVUZXh0Q29udGVudChVUkkuZnJvbShcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRzY2hlbWU6IFRlcm1pbmFsT3V0cHV0UHJvdmlkZXIuc2NoZW1lLFxuXHRcdFx0XHRcdFx0cGF0aDogYCR7c2VsZWN0ZWRDb21tYW5kLmNvbW1hbmR9Li4uICR7ZnJvbU5vdyhzZWxlY3RlZENvbW1hbmQudGltZXN0YW1wLCB0cnVlKX1gLFxuXHRcdFx0XHRcdFx0ZnJhZ21lbnQ6IG91dHB1dCxcblx0XHRcdFx0XHRcdHF1ZXJ5OiBgdGVybWluYWwtb3V0cHV0LSR7c2VsZWN0ZWRDb21tYW5kLnRpbWVzdGFtcH0tJHtpbnN0YW5jZS5pbnN0YW5jZUlkfWBcblx0XHRcdFx0XHR9KSk7XG5cdFx0XHRcdGlmICh0ZXh0Q29udGVudCkge1xuXHRcdFx0XHRcdGF3YWl0IGVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7XG5cdFx0XHRcdFx0XHRyZXNvdXJjZTogdGV4dENvbnRlbnQudXJpXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0YXdhaXQgaW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oc2hvd1J1blJlY2VudFF1aWNrUGljaywgaW5zdGFuY2UsIHRlcm1pbmFsSW5SdW5Db21tYW5kUGlja2VyLCB0eXBlLCBmaWx0ZXJNb2RlLCB2YWx1ZSk7XG5cdH0pKTtcblx0ZGlzcG9zYWJsZXMuYWRkKHF1aWNrUGljay5vbkRpZFRyaWdnZXJTZXBhcmF0b3JCdXR0b24oYXN5bmMgZSA9PiB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBvcGVuUmVzb3VyY2VCdXR0b25zLmZpbmQob3BlblJlc291cmNlQnV0dG9uID0+IGUuYnV0dG9uID09PSBvcGVuUmVzb3VyY2VCdXR0b24pPy5yZXNvdXJjZTtcblx0XHRpZiAocmVzb3VyY2UpIHtcblx0XHRcdGF3YWl0IGVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7XG5cdFx0XHRcdHJlc291cmNlXG5cdFx0XHR9KTtcblx0XHR9XG5cdH0pKTtcblx0ZGlzcG9zYWJsZXMuYWRkKHF1aWNrUGljay5vbkRpZENoYW5nZVZhbHVlKGFzeW5jIHZhbHVlID0+IHtcblx0XHRpZiAoIXZhbHVlKSB7XG5cdFx0XHRhd2FpdCBpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihzaG93UnVuUmVjZW50UXVpY2tQaWNrLCBpbnN0YW5jZSwgdGVybWluYWxJblJ1bkNvbW1hbmRQaWNrZXIsIHR5cGUsIGZpbHRlck1vZGUsIHZhbHVlKTtcblx0XHR9XG5cdH0pKTtcblx0bGV0IHRlcm1pbmFsU2Nyb2xsU3RhdGVTYXZlZCA9IGZhbHNlO1xuXHRmdW5jdGlvbiByZXN0b3JlU2Nyb2xsU3RhdGUoKSB7XG5cdFx0dGVybWluYWxTY3JvbGxTdGF0ZVNhdmVkID0gZmFsc2U7XG5cdFx0aW5zdGFuY2UueHRlcm0/Lm1hcmtUcmFja2VyLnJlc3RvcmVTY3JvbGxTdGF0ZSgpO1xuXHRcdGluc3RhbmNlLnh0ZXJtPy5tYXJrVHJhY2tlci5jbGVhcigpO1xuXHR9XG5cdGRpc3Bvc2FibGVzLmFkZChxdWlja1BpY2sub25EaWRDaGFuZ2VBY3RpdmUoYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHh0ZXJtID0gaW5zdGFuY2UueHRlcm07XG5cdFx0aWYgKCF4dGVybSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBbaXRlbV0gPSBxdWlja1BpY2suYWN0aXZlSXRlbXM7XG5cdFx0aWYgKCFpdGVtKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGZ1bmN0aW9uIGlzSXRlbShvYmo6IHVua25vd24pOiBvYmogaXMgSXRlbSB7XG5cdFx0XHRyZXR1cm4gaXNPYmplY3Qob2JqKSAmJiAncmF3TGFiZWwnIGluIG9iajtcblx0XHR9XG5cdFx0aWYgKGlzSXRlbShpdGVtKSAmJiBpdGVtLmNvbW1hbmQgJiYgaXRlbS5jb21tYW5kLm1hcmtlcikge1xuXHRcdFx0aWYgKCF0ZXJtaW5hbFNjcm9sbFN0YXRlU2F2ZWQpIHtcblx0XHRcdFx0eHRlcm0ubWFya1RyYWNrZXIuc2F2ZVNjcm9sbFN0YXRlKCk7XG5cdFx0XHRcdHRlcm1pbmFsU2Nyb2xsU3RhdGVTYXZlZCA9IHRydWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBwcm9tcHRSb3dDb3VudCA9IGl0ZW0uY29tbWFuZC5nZXRQcm9tcHRSb3dDb3VudCgpO1xuXHRcdFx0Y29uc3QgY29tbWFuZFJvd0NvdW50ID0gaXRlbS5jb21tYW5kLmdldENvbW1hbmRSb3dDb3VudCgpO1xuXHRcdFx0eHRlcm0ubWFya1RyYWNrZXIucmV2ZWFsUmFuZ2Uoe1xuXHRcdFx0XHRzdGFydDoge1xuXHRcdFx0XHRcdHg6IDEsXG5cdFx0XHRcdFx0eTogaXRlbS5jb21tYW5kLm1hcmtlci5saW5lIC0gKHByb21wdFJvd0NvdW50IC0gMSkgKyAxXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGVuZDoge1xuXHRcdFx0XHRcdHg6IGluc3RhbmNlLmNvbHMsXG5cdFx0XHRcdFx0eTogaXRlbS5jb21tYW5kLm1hcmtlci5saW5lICsgKGNvbW1hbmRSb3dDb3VudCAtIDEpICsgMVxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmVzdG9yZVNjcm9sbFN0YXRlKCk7XG5cdFx0fVxuXHR9KSk7XG5cdGRpc3Bvc2FibGVzLmFkZChxdWlja1BpY2sub25EaWRBY2NlcHQoYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IHF1aWNrUGljay5hY3RpdmVJdGVtc1swXTtcblx0XHRsZXQgdGV4dDogc3RyaW5nO1xuXHRcdGlmICh0eXBlID09PSAnY3dkJykge1xuXHRcdFx0dGV4dCA9IGBjZCAke2F3YWl0IGluc3RhbmNlLnByZXBhcmVQYXRoRm9yU2hlbGwocmVzdWx0LnJhd0xhYmVsKX1gO1xuXHRcdH0gZWxzZSB7IC8vIGNvbW1hbmRcblx0XHRcdHRleHQgPSByZXN1bHQucmF3TGFiZWw7XG5cdFx0fVxuXHRcdHF1aWNrUGljay5oaWRlKCk7XG5cdFx0dGVybWluYWxTY3JvbGxTdGF0ZVNhdmVkID0gZmFsc2U7XG5cdFx0aW5zdGFuY2UueHRlcm0/Lm1hcmtUcmFja2VyLmNsZWFyKCk7XG5cdFx0aW5zdGFuY2Uuc2Nyb2xsVG9Cb3R0b20oKTtcblx0XHRpbnN0YW5jZS5ydW5Db21tYW5kKHRleHQsICFxdWlja1BpY2sua2V5TW9kcy5hbHQpO1xuXHRcdGlmIChxdWlja1BpY2sua2V5TW9kcy5hbHQpIHtcblx0XHRcdGluc3RhbmNlLmZvY3VzKCk7XG5cdFx0fVxuXHR9KSk7XG5cdGRpc3Bvc2FibGVzLmFkZChxdWlja1BpY2sub25EaWRIaWRlKCgpID0+IHJlc3RvcmVTY3JvbGxTdGF0ZSgpKSk7XG5cdGlmICh2YWx1ZSkge1xuXHRcdHF1aWNrUGljay52YWx1ZSA9IHZhbHVlO1xuXHR9XG5cdHJldHVybiBuZXcgUHJvbWlzZTx2b2lkPihyID0+IHtcblx0XHR0ZXJtaW5hbEluUnVuQ29tbWFuZFBpY2tlci5zZXQodHJ1ZSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHNob3dXaXRoUGlubmVkSXRlbXMoc3RvcmFnZVNlcnZpY2UsIHJ1blJlY2VudFN0b3JhZ2VLZXksIHF1aWNrUGljaywgdHJ1ZSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChxdWlja1BpY2sub25EaWRIaWRlKCgpID0+IHtcblx0XHRcdHRlcm1pbmFsSW5SdW5Db21tYW5kUGlja2VyLnNldChmYWxzZSk7XG5cdFx0XHRhY2Nlc3NpYmxlVmlld1NlcnZpY2Uuc2hvd0xhc3RQcm92aWRlcihBY2Nlc3NpYmxlVmlld1Byb3ZpZGVySWQuVGVybWluYWwpO1xuXHRcdFx0cigpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdH0pKTtcblx0fSk7XG59XG5cbmNsYXNzIFRlcm1pbmFsT3V0cHV0UHJvdmlkZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVRleHRNb2RlbENvbnRlbnRQcm92aWRlciB7XG5cdHN0YXRpYyBzY2hlbWUgPSAnVEVSTUlOQUxfT1VUUFVUJztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVRleHRNb2RlbFNlcnZpY2UgdGV4dE1vZGVsUmVzb2x2ZXJTZXJ2aWNlOiBJVGV4dE1vZGVsU2VydmljZSxcblx0XHRASU1vZGVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9tb2RlbFNlcnZpY2U6IElNb2RlbFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGV4dE1vZGVsUmVzb2x2ZXJTZXJ2aWNlLnJlZ2lzdGVyVGV4dE1vZGVsQ29udGVudFByb3ZpZGVyKFRlcm1pbmFsT3V0cHV0UHJvdmlkZXIuc2NoZW1lLCB0aGlzKSk7XG5cdH1cblxuXHRhc3luYyBwcm92aWRlVGV4dENvbnRlbnQocmVzb3VyY2U6IFVSSSk6IFByb21pc2U8SVRleHRNb2RlbCB8IG51bGw+IHtcblx0XHRjb25zdCBleGlzdGluZyA9IHRoaXMuX21vZGVsU2VydmljZS5nZXRNb2RlbChyZXNvdXJjZSk7XG5cdFx0aWYgKGV4aXN0aW5nICYmICFleGlzdGluZy5pc0Rpc3Bvc2VkKCkpIHtcblx0XHRcdHJldHVybiBleGlzdGluZztcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5fbW9kZWxTZXJ2aWNlLmNyZWF0ZU1vZGVsKHJlc291cmNlLmZyYWdtZW50LCBudWxsLCByZXNvdXJjZSwgZmFsc2UpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztB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Q0FBQztBQUNGLGNBQVksSUFBSSxVQUFVLFlBQVksWUFBWTtBQUNqRCxVQUFNLFNBQVMsVUFBVSxZQUFZLENBQUM7QUFDdEMsUUFBSTtBQUNKLFFBQUksU0FBUyxPQUFPO0FBQ25CLGFBQU8sTUFBTSxNQUFNLFNBQVMsb0JBQW9CLE9BQU8sUUFBUSxDQUFDO0FBQUEsSUFDakUsT0FBTztBQUNOLGFBQU8sT0FBTztBQUFBLElBQ2Y7QUFDQSxjQUFVLEtBQUs7QUFDZiwrQkFBMkI7QUFDM0IsYUFBUyxPQUFPLFlBQVksTUFBTTtBQUNsQyxhQUFTLGVBQWU7QUFDeEIsYUFBUyxXQUFXLE1BQU0sQ0FBQyxVQUFVLFFBQVEsR0FBRztBQUNoRCxRQUFJLFVBQVUsUUFBUSxLQUFLO0FBQzFCLGVBQVMsTUFBTTtBQUFBLElBQ2hCO0FBQUEsRUFDRCxDQUFDLENBQUM7QUFDRixjQUFZLElBQUksVUFBVSxVQUFVLE1BQU0sbUJBQW1CLENBQUMsQ0FBQztBQUMvRCxNQUFJLE9BQU87QUFDVixjQUFVLFFBQVE7QUFBQSxFQUNuQjtBQUNBLFNBQU8sSUFBSSxRQUFjLE9BQUs7QUFDN0IsK0JBQTJCLElBQUksSUFBSTtBQUNuQyxnQkFBWSxJQUFJLG9CQUFvQixnQkFBZ0IscUJBQXFCLFdBQVcsSUFBSSxDQUFDO0FBQ3pGLGdCQUFZLElBQUksVUFBVSxVQUFVLE1BQU07QUFDekMsaUNBQTJCLElBQUksS0FBSztBQUNwQyw0QkFBc0IsaUJBQWlCLHlCQUF5QixRQUFRO0FBQ3hFLFFBQUU7QUFDRixrQkFBWSxRQUFRO0FBQUEsSUFDckIsQ0FBQyxDQUFDO0FBQUEsRUFDSCxDQUFDO0FBQ0Y7QUFFQSxJQUFNLHlCQUFOLGNBQXFDLFdBQWdEO0FBQUEsRUFHcEYsWUFDb0IsMEJBQ2EsZUFDL0I7QUFDRCxVQUFNO0FBRjBCO0FBR2hDLFNBQUssVUFBVSx5QkFBeUIsaUNBQWlDLHVCQUF1QixRQUFRLElBQUksQ0FBQztBQUFBLEVBQzlHO0FBQUEsRUFFQSxNQUFNLG1CQUFtQixVQUEyQztBQUNuRSxVQUFNLFdBQVcsS0FBSyxjQUFjLFNBQVMsUUFBUTtBQUNyRCxRQUFJLFlBQVksQ0FBQyxTQUFTLFdBQVcsR0FBRztBQUN2QyxhQUFPO0FBQUEsSUFDUjtBQUVBLFdBQU8sS0FBSyxjQUFjLFlBQVksU0FBUyxVQUFVLE1BQU0sVUFBVSxLQUFLO0FBQUEsRUFDL0U7QUFDRDtBQW5CTSx1QkFDRSxTQUFTO0FBRFgseUJBQU47QUFBQSxFQUlHO0FBQUEsRUFDQTtBQUFBLEdBTEc7IiwKICAibmFtZXMiOiBbImZvcm1hdExhYmVsIiwgInZhbHVlIl0KfQo=
