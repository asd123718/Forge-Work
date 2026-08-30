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
import { groupBy } from "../../../../../base/common/arrays.js";
import { createCancelablePromise } from "../../../../../base/common/async.js";
import { CancellationToken } from "../../../../../base/common/cancellation.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { Event } from "../../../../../base/common/event.js";
import { DisposableStore } from "../../../../../base/common/lifecycle.js";
import { MarshalledId } from "../../../../../base/common/marshallingIds.js";
import { uppercaseFirstLetter } from "../../../../../base/common/strings.js";
import { localize } from "../../../../../nls.js";
import { ICommandService } from "../../../../../platform/commands/common/commands.js";
import { ILabelService } from "../../../../../platform/label/common/label.js";
import { ILogService } from "../../../../../platform/log/common/log.js";
import { IProductService } from "../../../../../platform/product/common/productService.js";
import { ProgressLocation } from "../../../../../platform/progress/common/progress.js";
import { IQuickInputService } from "../../../../../platform/quickinput/common/quickInput.js";
import { ThemeIcon } from "../../../../../base/common/themables.js";
import { IExtensionsWorkbenchService } from "../../../extensions/common/extensions.js";
import { JUPYTER_EXTENSION_ID, KERNEL_RECOMMENDATIONS } from "../notebookBrowser.js";
import { executingStateIcon, selectKernelIcon } from "../notebookIcons.js";
import { INotebookKernelHistoryService, INotebookKernelService } from "../../common/notebookKernelService.js";
import { IExtensionService } from "../../../../services/extensions/common/extensions.js";
import { URI } from "../../../../../base/common/uri.js";
import { IOpenerService } from "../../../../../platform/opener/common/opener.js";
import { SELECT_KERNEL_ID } from "../controller/coreActions.js";
import { EnablementState, IExtensionManagementServerService } from "../../../../services/extensionManagement/common/extensionManagement.js";
import { areSameExtensions } from "../../../../../platform/extensionManagement/common/extensionManagementUtil.js";
function isKernelPick(item) {
  return "kernel" in item;
}
function isGroupedKernelsPick(item) {
  return "kernels" in item;
}
function isSourcePick(item) {
  return "action" in item;
}
function isInstallExtensionPick(item) {
  return item.id === "installSuggested" && "extensionIds" in item;
}
function isSearchMarketplacePick(item) {
  return item.id === "install";
}
function isKernelSourceQuickPickItem(item) {
  return "command" in item;
}
function supportAutoRun(item) {
  return "autoRun" in item && !!item.autoRun;
}
const KERNEL_PICKER_UPDATE_DEBOUNCE = 200;
function toKernelQuickPick(kernel, selected) {
  const res = {
    kernel,
    picked: kernel.id === selected?.id,
    label: kernel.label,
    description: kernel.description,
    detail: kernel.detail
  };
  if (kernel.id === selected?.id) {
    if (!res.description) {
      res.description = localize("current1", "Currently Selected");
    } else {
      res.description = localize("current2", "{0} - Currently Selected", res.description);
    }
  }
  return res;
}
class KernelPickerStrategyBase {
  constructor(_notebookKernelService, _productService, _quickInputService, _labelService, _logService, _extensionWorkbenchService, _extensionService, _commandService, _extensionManagementServerService) {
    this._notebookKernelService = _notebookKernelService;
    this._productService = _productService;
    this._quickInputService = _quickInputService;
    this._labelService = _labelService;
    this._logService = _logService;
    this._extensionWorkbenchService = _extensionWorkbenchService;
    this._extensionService = _extensionService;
    this._commandService = _commandService;
    this._extensionManagementServerService = _extensionManagementServerService;
  }
  async showQuickPick(editor, wantedId, skipAutoRun) {
    const notebook = editor.textModel;
    const scopedContextKeyService = editor.scopedContextKeyService;
    const matchResult = this._getMatchingResult(notebook);
    const { selected, all } = matchResult;
    let newKernel;
    if (wantedId) {
      for (const candidate of all) {
        if (candidate.id === wantedId) {
          newKernel = candidate;
          break;
        }
      }
      if (!newKernel) {
        this._logService.warn(`wanted kernel DOES NOT EXIST, wanted: ${wantedId}, all: ${all.map((k) => k.id)}`);
        return false;
      }
    }
    if (newKernel) {
      this._selecteKernel(notebook, newKernel);
      return true;
    }
    const localDisposableStore = new DisposableStore();
    const quickPick = localDisposableStore.add(this._quickInputService.createQuickPick({ useSeparators: true }));
    const quickPickItems = this._getKernelPickerQuickPickItems(notebook, matchResult, this._notebookKernelService, scopedContextKeyService);
    if (quickPickItems.length === 1 && supportAutoRun(quickPickItems[0]) && !skipAutoRun) {
      const picked = await this._handleQuickPick(editor, quickPickItems[0], quickPickItems);
      localDisposableStore.dispose();
      return picked;
    }
    quickPick.items = quickPickItems;
    quickPick.canSelectMany = false;
    quickPick.placeholder = selected ? localize("prompt.placeholder.change", "Change kernel for '{0}'", this._labelService.getUriLabel(notebook.uri, { relative: true })) : localize("prompt.placeholder.select", "Select kernel for '{0}'", this._labelService.getUriLabel(notebook.uri, { relative: true }));
    quickPick.busy = this._notebookKernelService.getKernelDetectionTasks(notebook).length > 0;
    const kernelDetectionTaskListener = this._notebookKernelService.onDidChangeKernelDetectionTasks(() => {
      quickPick.busy = this._notebookKernelService.getKernelDetectionTasks(notebook).length > 0;
    });
    const extensionRecommendataionPromise = quickPickItems.length === 0 ? createCancelablePromise((token) => this._showInstallKernelExtensionRecommendation(notebook, quickPick, this._extensionWorkbenchService, token)) : void 0;
    const kernelChangeEventListener = Event.debounce(
      Event.any(
        this._notebookKernelService.onDidChangeSourceActions,
        this._notebookKernelService.onDidAddKernel,
        this._notebookKernelService.onDidRemoveKernel,
        this._notebookKernelService.onDidChangeNotebookAffinity
      ),
      (last, _current) => last,
      KERNEL_PICKER_UPDATE_DEBOUNCE
    )(async () => {
      quickPick.busy = false;
      extensionRecommendataionPromise?.cancel();
      const currentActiveItems = quickPick.activeItems;
      const matchResult2 = this._getMatchingResult(notebook);
      const quickPickItems2 = this._getKernelPickerQuickPickItems(notebook, matchResult2, this._notebookKernelService, scopedContextKeyService);
      quickPick.keepScrollPosition = true;
      const activeItems = [];
      for (const item of currentActiveItems) {
        if (isKernelPick(item)) {
          const kernelId = item.kernel.id;
          const sameItem = quickPickItems2.find((pi) => isKernelPick(pi) && pi.kernel.id === kernelId);
          if (sameItem) {
            activeItems.push(sameItem);
          }
        } else if (isSourcePick(item)) {
          const sameItem = quickPickItems2.find((pi) => isSourcePick(pi) && pi.action.action.id === item.action.action.id);
          if (sameItem) {
            activeItems.push(sameItem);
          }
        }
      }
      quickPick.items = quickPickItems2;
      quickPick.activeItems = activeItems;
    }, this);
    const pick = await new Promise((resolve, reject) => {
      localDisposableStore.add(quickPick.onDidAccept(() => {
        const item = quickPick.selectedItems[0];
        if (item) {
          resolve({ selected: item, items: quickPick.items });
        } else {
          resolve({ selected: void 0, items: quickPick.items });
        }
        quickPick.hide();
      }));
      localDisposableStore.add(quickPick.onDidHide(() => {
        kernelDetectionTaskListener.dispose();
        kernelChangeEventListener.dispose();
        quickPick.dispose();
        resolve({ selected: void 0, items: quickPick.items });
      }));
      quickPick.show();
    });
    localDisposableStore.dispose();
    if (pick.selected) {
      return await this._handleQuickPick(editor, pick.selected, pick.items);
    }
    return false;
  }
  _getMatchingResult(notebook) {
    return this._notebookKernelService.getMatchingKernel(notebook);
  }
  async _handleQuickPick(editor, pick, quickPickItems) {
    if (isKernelPick(pick)) {
      const newKernel = pick.kernel;
      this._selecteKernel(editor.textModel, newKernel);
      return true;
    }
    if (isSearchMarketplacePick(pick)) {
      await this._showKernelExtension(
        this._extensionWorkbenchService,
        this._extensionService,
        this._extensionManagementServerService,
        editor.textModel.viewType,
        []
      );
    } else if (isInstallExtensionPick(pick)) {
      await this._showKernelExtension(
        this._extensionWorkbenchService,
        this._extensionService,
        this._extensionManagementServerService,
        editor.textModel.viewType,
        pick.extensionIds,
        this._productService.quality !== "stable"
      );
    } else if (isSourcePick(pick)) {
      pick.action.runAction();
    }
    return true;
  }
  _selecteKernel(notebook, kernel) {
    this._notebookKernelService.selectKernelForNotebook(kernel, notebook);
  }
  async _showKernelExtension(extensionWorkbenchService, extensionService, extensionManagementServerService, viewType, extIds, isInsiders) {
    const extensionsToInstall = [];
    const extensionsToInstallOnRemote = [];
    const extensionsToEnable = [];
    for (const extId of extIds) {
      const extension = (await extensionWorkbenchService.getExtensions([{ id: extId }], CancellationToken.None))[0];
      if (extension.enablementState === EnablementState.DisabledGlobally || extension.enablementState === EnablementState.DisabledWorkspace || extension.enablementState === EnablementState.DisabledByEnvironment) {
        extensionsToEnable.push(extension);
      } else if (!extensionWorkbenchService.installed.some((e) => areSameExtensions(e.identifier, extension.identifier))) {
        const canInstall = await extensionWorkbenchService.canInstall(extension);
        if (canInstall === true) {
          extensionsToInstall.push(extension);
        }
      } else if (extensionManagementServerService.remoteExtensionManagementServer) {
        if (extensionWorkbenchService.installed.some((e) => areSameExtensions(e.identifier, extension.identifier) && e.server === extensionManagementServerService.remoteExtensionManagementServer)) {
          continue;
        } else {
          const canInstall = await extensionWorkbenchService.canInstall(extension);
          if (canInstall) {
            extensionsToInstallOnRemote.push(extension);
          }
        }
      }
    }
    if (extensionsToInstall.length || extensionsToEnable.length || extensionsToInstallOnRemote.length) {
      await Promise.all([...extensionsToInstall.map(async (extension) => {
        await extensionWorkbenchService.install(
          extension,
          {
            installPreReleaseVersion: isInsiders ?? false,
            context: { skipWalkthrough: true }
          },
          ProgressLocation.Notification
        );
      }), ...extensionsToEnable.map(async (extension) => {
        switch (extension.enablementState) {
          case EnablementState.DisabledWorkspace:
            await extensionWorkbenchService.setEnablement([extension], EnablementState.EnabledWorkspace);
            return;
          case EnablementState.DisabledGlobally:
            await extensionWorkbenchService.setEnablement([extension], EnablementState.EnabledGlobally);
            return;
          case EnablementState.DisabledByEnvironment:
            await extensionWorkbenchService.setEnablement([extension], EnablementState.EnabledByEnvironment);
            return;
          default:
            break;
        }
      }), ...extensionsToInstallOnRemote.map(async (extension) => {
        await extensionWorkbenchService.installInServer(extension, this._extensionManagementServerService.remoteExtensionManagementServer);
      })]);
      await extensionService.activateByEvent(`onNotebook:${viewType}`);
      return;
    }
    const pascalCased = viewType.split(/[^a-z0-9]/ig).map(uppercaseFirstLetter).join("");
    await extensionWorkbenchService.openSearch(`@tag:notebookKernel${pascalCased}`);
  }
  async _showInstallKernelExtensionRecommendation(notebookTextModel, quickPick, extensionWorkbenchService, token) {
    quickPick.busy = true;
    const newQuickPickItems = await this._getKernelRecommendationsQuickPickItems(notebookTextModel, extensionWorkbenchService);
    quickPick.busy = false;
    if (token.isCancellationRequested) {
      return;
    }
    if (newQuickPickItems && quickPick.items.length === 0) {
      quickPick.items = newQuickPickItems;
    }
  }
  async _getKernelRecommendationsQuickPickItems(notebookTextModel, extensionWorkbenchService) {
    const quickPickItems = [];
    const language = this.getSuggestedLanguage(notebookTextModel);
    const suggestedExtension = language ? this.getSuggestedKernelFromLanguage(notebookTextModel.viewType, language) : void 0;
    if (suggestedExtension) {
      await extensionWorkbenchService.queryLocal();
      const extensions = extensionWorkbenchService.installed.filter(
        (e) => (e.enablementState === EnablementState.EnabledByEnvironment || e.enablementState === EnablementState.EnabledGlobally || e.enablementState === EnablementState.EnabledWorkspace) && suggestedExtension.extensionIds.includes(e.identifier.id)
      );
      if (extensions.length === suggestedExtension.extensionIds.length) {
        return void 0;
      }
      quickPickItems.push({
        id: "installSuggested",
        description: suggestedExtension.displayName ?? suggestedExtension.extensionIds.join(", "),
        label: `$(${Codicon.lightbulb.id}) ` + localize("installSuggestedKernel", "Install/Enable suggested extensions"),
        extensionIds: suggestedExtension.extensionIds
      });
    }
    quickPickItems.push({
      id: "install",
      label: localize("searchForKernels", "Browse marketplace for kernel extensions")
    });
    return quickPickItems;
  }
  /**
   * Examine the most common language in the notebook
   * @param notebookTextModel The notebook text model
   * @returns What the suggested language is for the notebook. Used for kernal installing
   */
  getSuggestedLanguage(notebookTextModel) {
    const metaData = notebookTextModel.metadata;
    const language_info = metaData?.metadata?.language_info;
    let suggestedKernelLanguage = language_info?.name;
    if (!suggestedKernelLanguage) {
      const cellLanguages = notebookTextModel.cells.map((cell) => cell.language).filter((language) => language !== "markdown");
      if (cellLanguages.length > 1) {
        const firstLanguage = cellLanguages[0];
        if (cellLanguages.every((language) => language === firstLanguage)) {
          suggestedKernelLanguage = firstLanguage;
        }
      }
    }
    return suggestedKernelLanguage;
  }
  /**
   * Given a language and notebook view type suggest a kernel for installation
   * @param language The language to find a suggested kernel extension for
   * @returns A recommednation object for the recommended extension, else undefined
   */
  getSuggestedKernelFromLanguage(viewType, language) {
    const recommendation = KERNEL_RECOMMENDATIONS.get(viewType)?.get(language);
    return recommendation;
  }
}
let KernelPickerMRUStrategy = class extends KernelPickerStrategyBase {
  constructor(_notebookKernelService, _productService, _quickInputService, _labelService, _logService, _extensionWorkbenchService, _extensionService, _extensionManagementServerService, _commandService, _notebookKernelHistoryService, _openerService) {
    super(
      _notebookKernelService,
      _productService,
      _quickInputService,
      _labelService,
      _logService,
      _extensionWorkbenchService,
      _extensionService,
      _commandService,
      _extensionManagementServerService
    );
    this._notebookKernelHistoryService = _notebookKernelHistoryService;
    this._openerService = _openerService;
  }
  _getKernelPickerQuickPickItems(notebookTextModel, matchResult, notebookKernelService, scopedContextKeyService) {
    const quickPickItems = [];
    if (matchResult.selected) {
      const kernelItem = toKernelQuickPick(matchResult.selected, matchResult.selected);
      quickPickItems.push(kernelItem);
    }
    matchResult.suggestions.filter((kernel) => kernel.id !== matchResult.selected?.id).map((kernel) => toKernelQuickPick(kernel, matchResult.selected)).forEach((kernel) => {
      quickPickItems.push(kernel);
    });
    const shouldAutoRun = quickPickItems.length === 0;
    if (quickPickItems.length > 0) {
      quickPickItems.push({
        type: "separator"
      });
    }
    quickPickItems.push({
      id: "selectAnother",
      label: localize("selectAnotherKernel.more", "Select Another Kernel..."),
      autoRun: shouldAutoRun
    });
    return quickPickItems;
  }
  _selecteKernel(notebook, kernel) {
    const currentInfo = this._notebookKernelService.getMatchingKernel(notebook);
    if (currentInfo.selected) {
      this._notebookKernelHistoryService.addMostRecentKernel(currentInfo.selected);
    }
    super._selecteKernel(notebook, kernel);
    this._notebookKernelHistoryService.addMostRecentKernel(kernel);
  }
  _getMatchingResult(notebook) {
    const { selected, all } = this._notebookKernelHistoryService.getKernels(notebook);
    const matchingResult = this._notebookKernelService.getMatchingKernel(notebook);
    return {
      selected,
      all: matchingResult.all,
      suggestions: all,
      hidden: []
    };
  }
  async _handleQuickPick(editor, pick, items) {
    if (pick.id === "selectAnother") {
      return this.displaySelectAnotherQuickPick(editor, items.length === 1 && items[0] === pick);
    }
    return super._handleQuickPick(editor, pick, items);
  }
  async displaySelectAnotherQuickPick(editor, kernelListEmpty) {
    const notebook = editor.textModel;
    const disposables = new DisposableStore();
    const quickPick = disposables.add(this._quickInputService.createQuickPick({ useSeparators: true }));
    const quickPickItem = await new Promise((resolve) => {
      quickPick.title = kernelListEmpty ? localize("select", "Select Kernel") : localize("selectAnotherKernel", "Select Another Kernel");
      quickPick.placeholder = localize("selectKernel.placeholder", "Type to choose a kernel source");
      quickPick.busy = true;
      quickPick.buttons = [this._quickInputService.backButton];
      quickPick.show();
      disposables.add(quickPick.onDidTriggerButton((button) => {
        if (button === this._quickInputService.backButton) {
          resolve(button);
        }
      }));
      disposables.add(quickPick.onDidTriggerItemButton(async (e) => {
        if (isKernelSourceQuickPickItem(e.item) && e.item.documentation !== void 0) {
          const uri = URI.isUri(e.item.documentation) ? URI.parse(e.item.documentation) : await this._commandService.executeCommand(e.item.documentation);
          if (uri) {
            void this._openerService.open(uri, { openExternal: true });
          }
        }
      }));
      disposables.add(quickPick.onDidAccept(async () => {
        resolve(quickPick.selectedItems[0]);
      }));
      disposables.add(quickPick.onDidHide(() => {
        resolve(void 0);
      }));
      this._calculdateKernelSources(editor).then((quickPickItems) => {
        quickPick.items = quickPickItems;
        if (quickPick.items.length > 0) {
          quickPick.busy = false;
        }
      });
      disposables.add(Event.debounce(
        Event.any(
          this._notebookKernelService.onDidChangeSourceActions,
          this._notebookKernelService.onDidAddKernel,
          this._notebookKernelService.onDidRemoveKernel
        ),
        (last, _current) => last,
        KERNEL_PICKER_UPDATE_DEBOUNCE
      )(async () => {
        quickPick.busy = true;
        const quickPickItems = await this._calculdateKernelSources(editor);
        quickPick.items = quickPickItems;
        quickPick.busy = false;
      }));
    });
    quickPick.hide();
    disposables.dispose();
    if (quickPickItem === this._quickInputService.backButton) {
      return this.showQuickPick(editor, void 0, true);
    }
    if (quickPickItem) {
      const selectedKernelPickItem = quickPickItem;
      if (isKernelSourceQuickPickItem(selectedKernelPickItem)) {
        try {
          const selectedKernelId = await this._executeCommand(notebook, selectedKernelPickItem.command);
          if (selectedKernelId) {
            const { all } = await this._getMatchingResult(notebook);
            const kernel = all.find((kernel2) => kernel2.id === `ms-toolsai.jupyter/${selectedKernelId}`);
            if (kernel) {
              await this._selecteKernel(notebook, kernel);
              return true;
            }
            return true;
          } else {
            return this.displaySelectAnotherQuickPick(editor, false);
          }
        } catch (ex) {
          return false;
        }
      } else if (isKernelPick(selectedKernelPickItem)) {
        await this._selecteKernel(notebook, selectedKernelPickItem.kernel);
        return true;
      } else if (isGroupedKernelsPick(selectedKernelPickItem)) {
        await this._selectOneKernel(notebook, selectedKernelPickItem.label, selectedKernelPickItem.kernels);
        return true;
      } else if (isSourcePick(selectedKernelPickItem)) {
        try {
          await selectedKernelPickItem.action.runAction();
          return true;
        } catch (ex) {
          return false;
        }
      } else if (isSearchMarketplacePick(selectedKernelPickItem)) {
        await this._showKernelExtension(
          this._extensionWorkbenchService,
          this._extensionService,
          this._extensionManagementServerService,
          editor.textModel.viewType,
          []
        );
        return true;
      } else if (isInstallExtensionPick(selectedKernelPickItem)) {
        await this._showKernelExtension(
          this._extensionWorkbenchService,
          this._extensionService,
          this._extensionManagementServerService,
          editor.textModel.viewType,
          selectedKernelPickItem.extensionIds,
          this._productService.quality !== "stable"
        );
        return this.displaySelectAnotherQuickPick(editor, false);
      }
    }
    return false;
  }
  async _calculdateKernelSources(editor) {
    const notebook = editor.textModel;
    const sourceActionCommands = this._notebookKernelService.getSourceActions(notebook, editor.scopedContextKeyService);
    const actions = await this._notebookKernelService.getKernelSourceActions2(notebook);
    const matchResult = this._getMatchingResult(notebook);
    if (sourceActionCommands.length === 0 && matchResult.all.length === 0 && actions.length === 0) {
      return await this._getKernelRecommendationsQuickPickItems(notebook, this._extensionWorkbenchService) ?? [];
    }
    const others = matchResult.all.filter((item) => item.extension.value !== JUPYTER_EXTENSION_ID);
    const quickPickItems = [];
    for (const group of groupBy(others, (a, b) => a.extension.value === b.extension.value ? 0 : 1)) {
      const extension = this._extensionService.extensions.find((extension2) => extension2.identifier.value === group[0].extension.value);
      const source = extension?.displayName ?? extension?.description ?? group[0].extension.value;
      if (group.length > 1) {
        quickPickItems.push({
          label: source,
          kernels: group
        });
      } else {
        quickPickItems.push({
          label: group[0].label,
          kernel: group[0]
        });
      }
    }
    const validActions = actions.filter((action) => action.command);
    quickPickItems.push(...validActions.map((action) => {
      const buttons = action.documentation ? [{
        iconClass: ThemeIcon.asClassName(Codicon.info),
        tooltip: localize("learnMoreTooltip", "Learn More")
      }] : [];
      return {
        id: typeof action.command === "string" ? action.command : action.command.id,
        label: action.label,
        description: action.description,
        command: action.command,
        documentation: action.documentation,
        buttons
      };
    }));
    for (const sourceAction of sourceActionCommands) {
      const res = {
        action: sourceAction,
        picked: false,
        label: sourceAction.action.label,
        tooltip: sourceAction.action.tooltip
      };
      quickPickItems.push(res);
    }
    return quickPickItems;
  }
  async _selectOneKernel(notebook, source, kernels) {
    const quickPickItems = kernels.map((kernel) => toKernelQuickPick(kernel, void 0));
    const localDisposableStore = new DisposableStore();
    const quickPick = localDisposableStore.add(this._quickInputService.createQuickPick({ useSeparators: true }));
    quickPick.items = quickPickItems;
    quickPick.canSelectMany = false;
    quickPick.title = localize("selectKernelFromExtension", "Select Kernel from {0}", source);
    localDisposableStore.add(quickPick.onDidAccept(async () => {
      if (quickPick.selectedItems && quickPick.selectedItems.length > 0 && isKernelPick(quickPick.selectedItems[0])) {
        await this._selecteKernel(notebook, quickPick.selectedItems[0].kernel);
      }
      quickPick.hide();
      quickPick.dispose();
    }));
    localDisposableStore.add(quickPick.onDidHide(() => {
      localDisposableStore.dispose();
    }));
    quickPick.show();
  }
  async _executeCommand(notebook, command) {
    const id = typeof command === "string" ? command : command.id;
    const args = typeof command === "string" ? [] : command.arguments ?? [];
    if (typeof command === "string" || !command.arguments || !Array.isArray(command.arguments) || command.arguments.length === 0) {
      args.unshift({
        uri: notebook.uri,
        $mid: MarshalledId.NotebookActionContext
      });
    }
    if (typeof command === "string") {
      return this._commandService.executeCommand(id);
    } else {
      return this._commandService.executeCommand(id, ...args);
    }
  }
  static updateKernelStatusAction(notebook, action, notebookKernelService, notebookKernelHistoryService) {
    const detectionTasks = notebookKernelService.getKernelDetectionTasks(notebook);
    if (detectionTasks.length) {
      const info = notebookKernelService.getMatchingKernel(notebook);
      action.enabled = true;
      action.class = ThemeIcon.asClassName(ThemeIcon.modify(executingStateIcon, "spin"));
      if (info.selected) {
        action.label = info.selected.label;
        const kernelInfo = info.selected.description ?? info.selected.detail;
        action.tooltip = kernelInfo ? localize("kernels.selectedKernelAndKernelDetectionRunning", "Selected Kernel: {0} (Kernel Detection Tasks Running)", kernelInfo) : localize("kernels.detecting", "Detecting Kernels");
      } else {
        action.label = localize("kernels.detecting", "Detecting Kernels");
      }
      return;
    }
    const runningActions = notebookKernelService.getRunningSourceActions(notebook);
    const updateActionFromSourceAction = (sourceAction, running) => {
      const sAction = sourceAction.action;
      action.class = running ? ThemeIcon.asClassName(ThemeIcon.modify(executingStateIcon, "spin")) : ThemeIcon.asClassName(selectKernelIcon);
      action.label = sAction.label;
      action.enabled = true;
    };
    if (runningActions.length) {
      return updateActionFromSourceAction(runningActions[0], true);
    }
    const { selected } = notebookKernelHistoryService.getKernels(notebook);
    if (selected) {
      action.label = selected.label;
      action.class = ThemeIcon.asClassName(selectKernelIcon);
      action.tooltip = selected.description ?? selected.detail ?? "";
    } else {
      action.label = localize("select", "Select Kernel");
      action.class = ThemeIcon.asClassName(selectKernelIcon);
      action.tooltip = "";
    }
  }
  static async resolveKernel(notebook, notebookKernelService, notebookKernelHistoryService, commandService) {
    const alreadySelected = notebookKernelHistoryService.getKernels(notebook);
    if (alreadySelected.selected) {
      return alreadySelected.selected;
    }
    await commandService.executeCommand(SELECT_KERNEL_ID);
    const { selected } = notebookKernelHistoryService.getKernels(notebook);
    return selected;
  }
};
KernelPickerMRUStrategy = __decorateClass([
  __decorateParam(0, INotebookKernelService),
  __decorateParam(1, IProductService),
  __decorateParam(2, IQuickInputService),
  __decorateParam(3, ILabelService),
  __decorateParam(4, ILogService),
  __decorateParam(5, IExtensionsWorkbenchService),
  __decorateParam(6, IExtensionService),
  __decorateParam(7, IExtensionManagementServerService),
  __decorateParam(8, ICommandService),
  __decorateParam(9, INotebookKernelHistoryService),
  __decorateParam(10, IOpenerService)
], KernelPickerMRUStrategy);
export {
  KernelPickerMRUStrategy
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG5vdGVib29rXFxicm93c2VyXFx2aWV3UGFydHNcXG5vdGVib29rS2VybmVsUXVpY2tQaWNrU3RyYXRlZ3kudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBJQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBncm91cEJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IGNyZWF0ZUNhbmNlbGFibGVQcm9taXNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IE1hcnNoYWxsZWRJZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcnNoYWxsaW5nSWRzLmpzJztcbmltcG9ydCB7IHVwcGVyY2FzZUZpcnN0TGV0dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBDb21tYW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUxhYmVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xhYmVsL2NvbW1vbi9sYWJlbC5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFByb2dyZXNzTG9jYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9ncmVzcy9jb21tb24vcHJvZ3Jlc3MuanMnO1xuaW1wb3J0IHsgSVF1aWNrSW5wdXRCdXR0b24sIElRdWlja0lucHV0U2VydmljZSwgSVF1aWNrUGljaywgSVF1aWNrUGlja0l0ZW0sIFF1aWNrUGlja0lucHV0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcXVpY2tpbnB1dC9jb21tb24vcXVpY2tJbnB1dC5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvbiwgSUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJQWN0aXZlTm90ZWJvb2tFZGl0b3IsIElOb3RlYm9va0V4dGVuc2lvblJlY29tbWVuZGF0aW9uLCBKVVBZVEVSX0VYVEVOU0lPTl9JRCwgS0VSTkVMX1JFQ09NTUVOREFUSU9OUyB9IGZyb20gJy4uL25vdGVib29rQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBOb3RlYm9va0VkaXRvcldpZGdldCB9IGZyb20gJy4uL25vdGVib29rRWRpdG9yV2lkZ2V0LmpzJztcbmltcG9ydCB7IGV4ZWN1dGluZ1N0YXRlSWNvbiwgc2VsZWN0S2VybmVsSWNvbiB9IGZyb20gJy4uL25vdGVib29rSWNvbnMuanMnO1xuaW1wb3J0IHsgTm90ZWJvb2tUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi9jb21tb24vbW9kZWwvbm90ZWJvb2tUZXh0TW9kZWwuanMnO1xuaW1wb3J0IHsgSU5vdGVib29rS2VybmVsLCBJTm90ZWJvb2tLZXJuZWxIaXN0b3J5U2VydmljZSwgSU5vdGVib29rS2VybmVsTWF0Y2hSZXN1bHQsIElOb3RlYm9va0tlcm5lbFNlcnZpY2UsIElTb3VyY2VBY3Rpb24gfSBmcm9tICcuLi8uLi9jb21tb24vbm90ZWJvb2tLZXJuZWxTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSU9wZW5lclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9vcGVuZXIvY29tbW9uL29wZW5lci5qcyc7XG5pbXBvcnQgeyBJTm90ZWJvb2tUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi9jb21tb24vbm90ZWJvb2tDb21tb24uanMnO1xuaW1wb3J0IHsgU0VMRUNUX0tFUk5FTF9JRCB9IGZyb20gJy4uL2NvbnRyb2xsZXIvY29yZUFjdGlvbnMuanMnO1xuaW1wb3J0IHsgRW5hYmxlbWVudFN0YXRlLCBJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25NYW5hZ2VtZW50L2NvbW1vbi9leHRlbnNpb25NYW5hZ2VtZW50LmpzJztcbmltcG9ydCB7IGFyZVNhbWVFeHRlbnNpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9uTWFuYWdlbWVudC9jb21tb24vZXh0ZW5zaW9uTWFuYWdlbWVudFV0aWwuanMnO1xuXG50eXBlIEtlcm5lbFBpY2sgPSBJUXVpY2tQaWNrSXRlbSAmIHsga2VybmVsOiBJTm90ZWJvb2tLZXJuZWwgfTtcbmZ1bmN0aW9uIGlzS2VybmVsUGljayhpdGVtOiBRdWlja1BpY2tJbnB1dDxJUXVpY2tQaWNrSXRlbT4pOiBpdGVtIGlzIEtlcm5lbFBpY2sge1xuXHRyZXR1cm4gJ2tlcm5lbCcgaW4gaXRlbTtcbn1cbnR5cGUgR3JvdXBlZEtlcm5lbHNQaWNrID0gSVF1aWNrUGlja0l0ZW0gJiB7IGtlcm5lbHM6IElOb3RlYm9va0tlcm5lbFtdOyBzb3VyY2U6IHN0cmluZyB9O1xuZnVuY3Rpb24gaXNHcm91cGVkS2VybmVsc1BpY2soaXRlbTogUXVpY2tQaWNrSW5wdXQ8SVF1aWNrUGlja0l0ZW0+KTogaXRlbSBpcyBHcm91cGVkS2VybmVsc1BpY2sge1xuXHRyZXR1cm4gJ2tlcm5lbHMnIGluIGl0ZW07XG59XG50eXBlIFNvdXJjZVBpY2sgPSBJUXVpY2tQaWNrSXRlbSAmIHsgYWN0aW9uOiBJU291cmNlQWN0aW9uIH07XG5mdW5jdGlvbiBpc1NvdXJjZVBpY2soaXRlbTogUXVpY2tQaWNrSW5wdXQ8SVF1aWNrUGlja0l0ZW0+KTogaXRlbSBpcyBTb3VyY2VQaWNrIHtcblx0cmV0dXJuICdhY3Rpb24nIGluIGl0ZW07XG59XG50eXBlIEluc3RhbGxFeHRlbnNpb25QaWNrID0gSVF1aWNrUGlja0l0ZW0gJiB7IGV4dGVuc2lvbklkczogc3RyaW5nW10gfTtcbmZ1bmN0aW9uIGlzSW5zdGFsbEV4dGVuc2lvblBpY2soaXRlbTogUXVpY2tQaWNrSW5wdXQ8SVF1aWNrUGlja0l0ZW0+KTogaXRlbSBpcyBJbnN0YWxsRXh0ZW5zaW9uUGljayB7XG5cdHJldHVybiBpdGVtLmlkID09PSAnaW5zdGFsbFN1Z2dlc3RlZCcgJiYgJ2V4dGVuc2lvbklkcycgaW4gaXRlbTtcbn1cbnR5cGUgU2VhcmNoTWFya2V0cGxhY2VQaWNrID0gSVF1aWNrUGlja0l0ZW0gJiB7IGlkOiAnaW5zdGFsbCcgfTtcbmZ1bmN0aW9uIGlzU2VhcmNoTWFya2V0cGxhY2VQaWNrKGl0ZW06IFF1aWNrUGlja0lucHV0PElRdWlja1BpY2tJdGVtPik6IGl0ZW0gaXMgU2VhcmNoTWFya2V0cGxhY2VQaWNrIHtcblx0cmV0dXJuIGl0ZW0uaWQgPT09ICdpbnN0YWxsJztcbn1cblxudHlwZSBLZXJuZWxTb3VyY2VRdWlja1BpY2tJdGVtID0gSVF1aWNrUGlja0l0ZW0gJiB7IGNvbW1hbmQ6IENvbW1hbmQ7IGRvY3VtZW50YXRpb24/OiBzdHJpbmcgfTtcbmZ1bmN0aW9uIGlzS2VybmVsU291cmNlUXVpY2tQaWNrSXRlbShpdGVtOiBJUXVpY2tQaWNrSXRlbSk6IGl0ZW0gaXMgS2VybmVsU291cmNlUXVpY2tQaWNrSXRlbSB7XG5cdHJldHVybiAnY29tbWFuZCcgaW4gaXRlbTtcbn1cblxuZnVuY3Rpb24gc3VwcG9ydEF1dG9SdW4oaXRlbTogUXVpY2tQaWNrSW5wdXQ8SVF1aWNrUGlja0l0ZW0+KTogaXRlbSBpcyBJUXVpY2tQaWNrSXRlbSB7XG5cdHJldHVybiAnYXV0b1J1bicgaW4gaXRlbSAmJiAhIWl0ZW0uYXV0b1J1bjtcbn1cbnR5cGUgS2VybmVsUXVpY2tQaWNrSXRlbSA9IChJUXVpY2tQaWNrSXRlbSAmIHsgYXV0b1J1bj86IGJvb2xlYW4gfSkgfCBTZWFyY2hNYXJrZXRwbGFjZVBpY2sgfCBJbnN0YWxsRXh0ZW5zaW9uUGljayB8IEtlcm5lbFBpY2sgfCBHcm91cGVkS2VybmVsc1BpY2sgfCBTb3VyY2VQaWNrIHwgS2VybmVsU291cmNlUXVpY2tQaWNrSXRlbTtcbmNvbnN0IEtFUk5FTF9QSUNLRVJfVVBEQVRFX0RFQk9VTkNFID0gMjAwO1xuXG5leHBvcnQgdHlwZSBLZXJuZWxRdWlja1BpY2tDb250ZXh0ID1cblx0eyBpZDogc3RyaW5nOyBleHRlbnNpb246IHN0cmluZyB9IHxcblx0eyBub3RlYm9va0VkaXRvcklkOiBzdHJpbmcgfSB8XG5cdHsgaWQ6IHN0cmluZzsgZXh0ZW5zaW9uOiBzdHJpbmc7IG5vdGVib29rRWRpdG9ySWQ6IHN0cmluZyB9IHxcblx0eyB1aT86IGJvb2xlYW47IG5vdGVib29rRWRpdG9yPzogTm90ZWJvb2tFZGl0b3JXaWRnZXQ7IHNraXBJZkFscmVhZHlTZWxlY3RlZD86IGJvb2xlYW4gfTtcblxuZXhwb3J0IGludGVyZmFjZSBJS2VybmVsUGlja2VyU3RyYXRlZ3kge1xuXHRzaG93UXVpY2tQaWNrKGVkaXRvcjogSUFjdGl2ZU5vdGVib29rRWRpdG9yLCB3YW50ZWRLZXJuZWxJZD86IHN0cmluZyk6IFByb21pc2U8Ym9vbGVhbj47XG59XG5cbmZ1bmN0aW9uIHRvS2VybmVsUXVpY2tQaWNrKGtlcm5lbDogSU5vdGVib29rS2VybmVsLCBzZWxlY3RlZDogSU5vdGVib29rS2VybmVsIHwgdW5kZWZpbmVkKSB7XG5cdGNvbnN0IHJlczogS2VybmVsUGljayA9IHtcblx0XHRrZXJuZWwsXG5cdFx0cGlja2VkOiBrZXJuZWwuaWQgPT09IHNlbGVjdGVkPy5pZCxcblx0XHRsYWJlbDoga2VybmVsLmxhYmVsLFxuXHRcdGRlc2NyaXB0aW9uOiBrZXJuZWwuZGVzY3JpcHRpb24sXG5cdFx0ZGV0YWlsOiBrZXJuZWwuZGV0YWlsXG5cdH07XG5cdGlmIChrZXJuZWwuaWQgPT09IHNlbGVjdGVkPy5pZCkge1xuXHRcdGlmICghcmVzLmRlc2NyaXB0aW9uKSB7XG5cdFx0XHRyZXMuZGVzY3JpcHRpb24gPSBsb2NhbGl6ZSgnY3VycmVudDEnLCBcIkN1cnJlbnRseSBTZWxlY3RlZFwiKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmVzLmRlc2NyaXB0aW9uID0gbG9jYWxpemUoJ2N1cnJlbnQyJywgXCJ7MH0gLSBDdXJyZW50bHkgU2VsZWN0ZWRcIiwgcmVzLmRlc2NyaXB0aW9uKTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIHJlcztcbn1cblxuXG5hYnN0cmFjdCBjbGFzcyBLZXJuZWxQaWNrZXJTdHJhdGVneUJhc2UgaW1wbGVtZW50cyBJS2VybmVsUGlja2VyU3RyYXRlZ3kge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcm90ZWN0ZWQgcmVhZG9ubHkgX25vdGVib29rS2VybmVsU2VydmljZTogSU5vdGVib29rS2VybmVsU2VydmljZSxcblx0XHRwcm90ZWN0ZWQgcmVhZG9ubHkgX3Byb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UsXG5cdFx0cHJvdGVjdGVkIHJlYWRvbmx5IF9xdWlja0lucHV0U2VydmljZTogSVF1aWNrSW5wdXRTZXJ2aWNlLFxuXHRcdHByb3RlY3RlZCByZWFkb25seSBfbGFiZWxTZXJ2aWNlOiBJTGFiZWxTZXJ2aWNlLFxuXHRcdHByb3RlY3RlZCByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0cHJvdGVjdGVkIHJlYWRvbmx5IF9leHRlbnNpb25Xb3JrYmVuY2hTZXJ2aWNlOiBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UsXG5cdFx0cHJvdGVjdGVkIHJlYWRvbmx5IF9leHRlbnNpb25TZXJ2aWNlOiBJRXh0ZW5zaW9uU2VydmljZSxcblx0XHRwcm90ZWN0ZWQgcmVhZG9ubHkgX2NvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0cHJvdGVjdGVkIHJlYWRvbmx5IF9leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZTogSUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlXG5cdCkgeyB9XG5cblx0YXN5bmMgc2hvd1F1aWNrUGljayhlZGl0b3I6IElBY3RpdmVOb3RlYm9va0VkaXRvciwgd2FudGVkSWQ/OiBzdHJpbmcsIHNraXBBdXRvUnVuPzogYm9vbGVhbik6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGNvbnN0IG5vdGVib29rID0gZWRpdG9yLnRleHRNb2RlbDtcblx0XHRjb25zdCBzY29wZWRDb250ZXh0S2V5U2VydmljZSA9IGVkaXRvci5zY29wZWRDb250ZXh0S2V5U2VydmljZTtcblx0XHRjb25zdCBtYXRjaFJlc3VsdCA9IHRoaXMuX2dldE1hdGNoaW5nUmVzdWx0KG5vdGVib29rKTtcblx0XHRjb25zdCB7IHNlbGVjdGVkLCBhbGwgfSA9IG1hdGNoUmVzdWx0O1xuXG5cdFx0bGV0IG5ld0tlcm5lbDogSU5vdGVib29rS2VybmVsIHwgdW5kZWZpbmVkO1xuXHRcdGlmICh3YW50ZWRJZCkge1xuXHRcdFx0Zm9yIChjb25zdCBjYW5kaWRhdGUgb2YgYWxsKSB7XG5cdFx0XHRcdGlmIChjYW5kaWRhdGUuaWQgPT09IHdhbnRlZElkKSB7XG5cdFx0XHRcdFx0bmV3S2VybmVsID0gY2FuZGlkYXRlO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAoIW5ld0tlcm5lbCkge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYHdhbnRlZCBrZXJuZWwgRE9FUyBOT1QgRVhJU1QsIHdhbnRlZDogJHt3YW50ZWRJZH0sIGFsbDogJHthbGwubWFwKGsgPT4gay5pZCl9YCk7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAobmV3S2VybmVsKSB7XG5cdFx0XHR0aGlzLl9zZWxlY3RlS2VybmVsKG5vdGVib29rLCBuZXdLZXJuZWwpO1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cblx0XHRjb25zdCBsb2NhbERpc3Bvc2FibGVTdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBxdWlja1BpY2sgPSBsb2NhbERpc3Bvc2FibGVTdG9yZS5hZGQodGhpcy5fcXVpY2tJbnB1dFNlcnZpY2UuY3JlYXRlUXVpY2tQaWNrPEtlcm5lbFF1aWNrUGlja0l0ZW0+KHsgdXNlU2VwYXJhdG9yczogdHJ1ZSB9KSk7XG5cdFx0Y29uc3QgcXVpY2tQaWNrSXRlbXMgPSB0aGlzLl9nZXRLZXJuZWxQaWNrZXJRdWlja1BpY2tJdGVtcyhub3RlYm9vaywgbWF0Y2hSZXN1bHQsIHRoaXMuX25vdGVib29rS2VybmVsU2VydmljZSwgc2NvcGVkQ29udGV4dEtleVNlcnZpY2UpO1xuXG5cdFx0aWYgKHF1aWNrUGlja0l0ZW1zLmxlbmd0aCA9PT0gMSAmJiBzdXBwb3J0QXV0b1J1bihxdWlja1BpY2tJdGVtc1swXSkgJiYgIXNraXBBdXRvUnVuKSB7XG5cdFx0XHRjb25zdCBwaWNrZWQgPSBhd2FpdCB0aGlzLl9oYW5kbGVRdWlja1BpY2soZWRpdG9yLCBxdWlja1BpY2tJdGVtc1swXSwgcXVpY2tQaWNrSXRlbXMgYXMgS2VybmVsUXVpY2tQaWNrSXRlbVtdKTtcblx0XHRcdGxvY2FsRGlzcG9zYWJsZVN0b3JlLmRpc3Bvc2UoKTtcblx0XHRcdHJldHVybiBwaWNrZWQ7XG5cdFx0fVxuXG5cdFx0cXVpY2tQaWNrLml0ZW1zID0gcXVpY2tQaWNrSXRlbXM7XG5cdFx0cXVpY2tQaWNrLmNhblNlbGVjdE1hbnkgPSBmYWxzZTtcblx0XHRxdWlja1BpY2sucGxhY2Vob2xkZXIgPSBzZWxlY3RlZFxuXHRcdFx0PyBsb2NhbGl6ZSgncHJvbXB0LnBsYWNlaG9sZGVyLmNoYW5nZScsIFwiQ2hhbmdlIGtlcm5lbCBmb3IgJ3swfSdcIiwgdGhpcy5fbGFiZWxTZXJ2aWNlLmdldFVyaUxhYmVsKG5vdGVib29rLnVyaSwgeyByZWxhdGl2ZTogdHJ1ZSB9KSlcblx0XHRcdDogbG9jYWxpemUoJ3Byb21wdC5wbGFjZWhvbGRlci5zZWxlY3QnLCBcIlNlbGVjdCBrZXJuZWwgZm9yICd7MH0nXCIsIHRoaXMuX2xhYmVsU2VydmljZS5nZXRVcmlMYWJlbChub3RlYm9vay51cmksIHsgcmVsYXRpdmU6IHRydWUgfSkpO1xuXG5cdFx0cXVpY2tQaWNrLmJ1c3kgPSB0aGlzLl9ub3RlYm9va0tlcm5lbFNlcnZpY2UuZ2V0S2VybmVsRGV0ZWN0aW9uVGFza3Mobm90ZWJvb2spLmxlbmd0aCA+IDA7XG5cblx0XHRjb25zdCBrZXJuZWxEZXRlY3Rpb25UYXNrTGlzdGVuZXIgPSB0aGlzLl9ub3RlYm9va0tlcm5lbFNlcnZpY2Uub25EaWRDaGFuZ2VLZXJuZWxEZXRlY3Rpb25UYXNrcygoKSA9PiB7XG5cdFx0XHRxdWlja1BpY2suYnVzeSA9IHRoaXMuX25vdGVib29rS2VybmVsU2VydmljZS5nZXRLZXJuZWxEZXRlY3Rpb25UYXNrcyhub3RlYm9vaykubGVuZ3RoID4gMDtcblx0XHR9KTtcblxuXHRcdC8vIHJ1biBleHRlbnNpb24gcmVjb21tZW5kYXRhaW9uIHRhc2sgaWYgcXVpY2tQaWNrSXRlbXMgaXMgZW1wdHlcblx0XHRjb25zdCBleHRlbnNpb25SZWNvbW1lbmRhdGFpb25Qcm9taXNlID0gcXVpY2tQaWNrSXRlbXMubGVuZ3RoID09PSAwXG5cdFx0XHQ/IGNyZWF0ZUNhbmNlbGFibGVQcm9taXNlKHRva2VuID0+IHRoaXMuX3Nob3dJbnN0YWxsS2VybmVsRXh0ZW5zaW9uUmVjb21tZW5kYXRpb24obm90ZWJvb2ssIHF1aWNrUGljaywgdGhpcy5fZXh0ZW5zaW9uV29ya2JlbmNoU2VydmljZSwgdG9rZW4pKVxuXHRcdFx0OiB1bmRlZmluZWQ7XG5cblx0XHRjb25zdCBrZXJuZWxDaGFuZ2VFdmVudExpc3RlbmVyID0gRXZlbnQuZGVib3VuY2U8dm9pZCwgdm9pZD4oXG5cdFx0XHRFdmVudC5hbnkoXG5cdFx0XHRcdHRoaXMuX25vdGVib29rS2VybmVsU2VydmljZS5vbkRpZENoYW5nZVNvdXJjZUFjdGlvbnMsXG5cdFx0XHRcdHRoaXMuX25vdGVib29rS2VybmVsU2VydmljZS5vbkRpZEFkZEtlcm5lbCxcblx0XHRcdFx0dGhpcy5fbm90ZWJvb2tLZXJuZWxTZXJ2aWNlLm9uRGlkUmVtb3ZlS2VybmVsLFxuXHRcdFx0XHR0aGlzLl9ub3RlYm9va0tlcm5lbFNlcnZpY2Uub25EaWRDaGFuZ2VOb3RlYm9va0FmZmluaXR5XG5cdFx0XHQpLFxuXHRcdFx0KGxhc3QsIF9jdXJyZW50KSA9PiBsYXN0LFxuXHRcdFx0S0VSTkVMX1BJQ0tFUl9VUERBVEVfREVCT1VOQ0Vcblx0XHQpKGFzeW5jICgpID0+IHtcblx0XHRcdC8vIHJlc2V0IHF1aWNrIHBpY2sgcHJvZ3Jlc3Ncblx0XHRcdHF1aWNrUGljay5idXN5ID0gZmFsc2U7XG5cdFx0XHRleHRlbnNpb25SZWNvbW1lbmRhdGFpb25Qcm9taXNlPy5jYW5jZWwoKTtcblxuXHRcdFx0Y29uc3QgY3VycmVudEFjdGl2ZUl0ZW1zID0gcXVpY2tQaWNrLmFjdGl2ZUl0ZW1zO1xuXHRcdFx0Y29uc3QgbWF0Y2hSZXN1bHQgPSB0aGlzLl9nZXRNYXRjaGluZ1Jlc3VsdChub3RlYm9vayk7XG5cdFx0XHRjb25zdCBxdWlja1BpY2tJdGVtcyA9IHRoaXMuX2dldEtlcm5lbFBpY2tlclF1aWNrUGlja0l0ZW1zKG5vdGVib29rLCBtYXRjaFJlc3VsdCwgdGhpcy5fbm90ZWJvb2tLZXJuZWxTZXJ2aWNlLCBzY29wZWRDb250ZXh0S2V5U2VydmljZSk7XG5cdFx0XHRxdWlja1BpY2sua2VlcFNjcm9sbFBvc2l0aW9uID0gdHJ1ZTtcblxuXHRcdFx0Ly8gcmVjYWxjdWF0ZSBhY3RpdmUgaXRlbXNcblx0XHRcdGNvbnN0IGFjdGl2ZUl0ZW1zOiBLZXJuZWxRdWlja1BpY2tJdGVtW10gPSBbXTtcblx0XHRcdGZvciAoY29uc3QgaXRlbSBvZiBjdXJyZW50QWN0aXZlSXRlbXMpIHtcblx0XHRcdFx0aWYgKGlzS2VybmVsUGljayhpdGVtKSkge1xuXHRcdFx0XHRcdGNvbnN0IGtlcm5lbElkID0gaXRlbS5rZXJuZWwuaWQ7XG5cdFx0XHRcdFx0Y29uc3Qgc2FtZUl0ZW0gPSBxdWlja1BpY2tJdGVtcy5maW5kKHBpID0+IGlzS2VybmVsUGljayhwaSkgJiYgcGkua2VybmVsLmlkID09PSBrZXJuZWxJZCkgYXMgS2VybmVsUGljayB8IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRpZiAoc2FtZUl0ZW0pIHtcblx0XHRcdFx0XHRcdGFjdGl2ZUl0ZW1zLnB1c2goc2FtZUl0ZW0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBlbHNlIGlmIChpc1NvdXJjZVBpY2soaXRlbSkpIHtcblx0XHRcdFx0XHRjb25zdCBzYW1lSXRlbSA9IHF1aWNrUGlja0l0ZW1zLmZpbmQocGkgPT4gaXNTb3VyY2VQaWNrKHBpKSAmJiBwaS5hY3Rpb24uYWN0aW9uLmlkID09PSBpdGVtLmFjdGlvbi5hY3Rpb24uaWQpIGFzIFNvdXJjZVBpY2sgfCB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0aWYgKHNhbWVJdGVtKSB7XG5cdFx0XHRcdFx0XHRhY3RpdmVJdGVtcy5wdXNoKHNhbWVJdGVtKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0cXVpY2tQaWNrLml0ZW1zID0gcXVpY2tQaWNrSXRlbXM7XG5cdFx0XHRxdWlja1BpY2suYWN0aXZlSXRlbXMgPSBhY3RpdmVJdGVtcztcblx0XHR9LCB0aGlzKTtcblxuXHRcdGNvbnN0IHBpY2sgPSBhd2FpdCBuZXcgUHJvbWlzZTx7IHNlbGVjdGVkOiBLZXJuZWxRdWlja1BpY2tJdGVtIHwgdW5kZWZpbmVkOyBpdGVtczogS2VybmVsUXVpY2tQaWNrSXRlbVtdIH0+KChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRcdGxvY2FsRGlzcG9zYWJsZVN0b3JlLmFkZChxdWlja1BpY2sub25EaWRBY2NlcHQoKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBpdGVtID0gcXVpY2tQaWNrLnNlbGVjdGVkSXRlbXNbMF07XG5cdFx0XHRcdGlmIChpdGVtKSB7XG5cdFx0XHRcdFx0cmVzb2x2ZSh7IHNlbGVjdGVkOiBpdGVtLCBpdGVtczogcXVpY2tQaWNrLml0ZW1zIGFzIEtlcm5lbFF1aWNrUGlja0l0ZW1bXSB9KTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRyZXNvbHZlKHsgc2VsZWN0ZWQ6IHVuZGVmaW5lZCwgaXRlbXM6IHF1aWNrUGljay5pdGVtcyBhcyBLZXJuZWxRdWlja1BpY2tJdGVtW10gfSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRxdWlja1BpY2suaGlkZSgpO1xuXHRcdFx0fSkpO1xuXG5cdFx0XHRsb2NhbERpc3Bvc2FibGVTdG9yZS5hZGQocXVpY2tQaWNrLm9uRGlkSGlkZSgoKSA9PiB7XG5cdFx0XHRcdGtlcm5lbERldGVjdGlvblRhc2tMaXN0ZW5lci5kaXNwb3NlKCk7XG5cdFx0XHRcdGtlcm5lbENoYW5nZUV2ZW50TGlzdGVuZXIuZGlzcG9zZSgpO1xuXHRcdFx0XHRxdWlja1BpY2suZGlzcG9zZSgpO1xuXHRcdFx0XHRyZXNvbHZlKHsgc2VsZWN0ZWQ6IHVuZGVmaW5lZCwgaXRlbXM6IHF1aWNrUGljay5pdGVtcyBhcyBLZXJuZWxRdWlja1BpY2tJdGVtW10gfSk7XG5cdFx0XHR9KSk7XG5cdFx0XHRxdWlja1BpY2suc2hvdygpO1xuXHRcdH0pO1xuXG5cdFx0bG9jYWxEaXNwb3NhYmxlU3RvcmUuZGlzcG9zZSgpO1xuXG5cdFx0aWYgKHBpY2suc2VsZWN0ZWQpIHtcblx0XHRcdHJldHVybiBhd2FpdCB0aGlzLl9oYW5kbGVRdWlja1BpY2soZWRpdG9yLCBwaWNrLnNlbGVjdGVkLCBwaWNrLml0ZW1zKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwcm90ZWN0ZWQgX2dldE1hdGNoaW5nUmVzdWx0KG5vdGVib29rOiBOb3RlYm9va1RleHRNb2RlbCkge1xuXHRcdHJldHVybiB0aGlzLl9ub3RlYm9va0tlcm5lbFNlcnZpY2UuZ2V0TWF0Y2hpbmdLZXJuZWwobm90ZWJvb2spO1xuXHR9XG5cblx0cHJvdGVjdGVkIGFic3RyYWN0IF9nZXRLZXJuZWxQaWNrZXJRdWlja1BpY2tJdGVtcyhcblx0XHRub3RlYm9va1RleHRNb2RlbDogTm90ZWJvb2tUZXh0TW9kZWwsXG5cdFx0bWF0Y2hSZXN1bHQ6IElOb3RlYm9va0tlcm5lbE1hdGNoUmVzdWx0LFxuXHRcdG5vdGVib29rS2VybmVsU2VydmljZTogSU5vdGVib29rS2VybmVsU2VydmljZSxcblx0XHRzY29wZWRDb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlXG5cdCk6IFF1aWNrUGlja0lucHV0PEtlcm5lbFF1aWNrUGlja0l0ZW0+W107XG5cblx0cHJvdGVjdGVkIGFzeW5jIF9oYW5kbGVRdWlja1BpY2soZWRpdG9yOiBJQWN0aXZlTm90ZWJvb2tFZGl0b3IsIHBpY2s6IEtlcm5lbFF1aWNrUGlja0l0ZW0sIHF1aWNrUGlja0l0ZW1zOiBLZXJuZWxRdWlja1BpY2tJdGVtW10pOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRpZiAoaXNLZXJuZWxQaWNrKHBpY2spKSB7XG5cdFx0XHRjb25zdCBuZXdLZXJuZWwgPSBwaWNrLmtlcm5lbDtcblx0XHRcdHRoaXMuX3NlbGVjdGVLZXJuZWwoZWRpdG9yLnRleHRNb2RlbCwgbmV3S2VybmVsKTtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdC8vIGFjdGlvbnNcblx0XHRpZiAoaXNTZWFyY2hNYXJrZXRwbGFjZVBpY2socGljaykpIHtcblx0XHRcdGF3YWl0IHRoaXMuX3Nob3dLZXJuZWxFeHRlbnNpb24oXG5cdFx0XHRcdHRoaXMuX2V4dGVuc2lvbldvcmtiZW5jaFNlcnZpY2UsXG5cdFx0XHRcdHRoaXMuX2V4dGVuc2lvblNlcnZpY2UsXG5cdFx0XHRcdHRoaXMuX2V4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLFxuXHRcdFx0XHRlZGl0b3IudGV4dE1vZGVsLnZpZXdUeXBlLFxuXHRcdFx0XHRbXVxuXHRcdFx0KTtcblx0XHRcdC8vIHN1Z2dlc3RlZEV4dGVuc2lvbiBtdXN0IGJlIGRlZmluZWQgZm9yIHRoaXMgb3B0aW9uIHRvIGJlIHNob3duLCBidXQgc3RpbGwgY2hlY2sgdG8gbWFrZSBUUyBoYXBweVxuXHRcdH0gZWxzZSBpZiAoaXNJbnN0YWxsRXh0ZW5zaW9uUGljayhwaWNrKSkge1xuXHRcdFx0YXdhaXQgdGhpcy5fc2hvd0tlcm5lbEV4dGVuc2lvbihcblx0XHRcdFx0dGhpcy5fZXh0ZW5zaW9uV29ya2JlbmNoU2VydmljZSxcblx0XHRcdFx0dGhpcy5fZXh0ZW5zaW9uU2VydmljZSxcblx0XHRcdFx0dGhpcy5fZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UsXG5cdFx0XHRcdGVkaXRvci50ZXh0TW9kZWwudmlld1R5cGUsXG5cdFx0XHRcdHBpY2suZXh0ZW5zaW9uSWRzLFxuXHRcdFx0XHR0aGlzLl9wcm9kdWN0U2VydmljZS5xdWFsaXR5ICE9PSAnc3RhYmxlJ1xuXHRcdFx0KTtcblx0XHR9IGVsc2UgaWYgKGlzU291cmNlUGljayhwaWNrKSkge1xuXHRcdFx0Ly8gc2VsZWN0ZWQgZXhwbGljaWx0eSwgaXQgc2hvdWxkIHRyaWdnZXIgdGhlIGV4ZWN1dGlvbj9cblx0XHRcdHBpY2suYWN0aW9uLnJ1bkFjdGlvbigpO1xuXHRcdH1cblxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9zZWxlY3RlS2VybmVsKG5vdGVib29rOiBOb3RlYm9va1RleHRNb2RlbCwga2VybmVsOiBJTm90ZWJvb2tLZXJuZWwpIHtcblx0XHR0aGlzLl9ub3RlYm9va0tlcm5lbFNlcnZpY2Uuc2VsZWN0S2VybmVsRm9yTm90ZWJvb2soa2VybmVsLCBub3RlYm9vayk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgYXN5bmMgX3Nob3dLZXJuZWxFeHRlbnNpb24oXG5cdFx0ZXh0ZW5zaW9uV29ya2JlbmNoU2VydmljZTogSUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLFxuXHRcdGV4dGVuc2lvblNlcnZpY2U6IElFeHRlbnNpb25TZXJ2aWNlLFxuXHRcdGV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlOiBJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UsXG5cdFx0dmlld1R5cGU6IHN0cmluZyxcblx0XHRleHRJZHM6IHN0cmluZ1tdLFxuXHRcdGlzSW5zaWRlcnM/OiBib29sZWFuXG5cdCkge1xuXHRcdC8vIElmIGV4dGVuc2lvbiBpZCBpcyBwcm92aWRlZCBhdHRlbXB0IHRvIGluc3RhbGwgdGhlIGV4dGVuc2lvbiBhcyB0aGUgdXNlciBoYXMgcmVxdWVzdGVkIHRoZSBzdWdnZXN0ZWQgb25lcyBiZSBpbnN0YWxsZWRcblx0XHRjb25zdCBleHRlbnNpb25zVG9JbnN0YWxsOiBJRXh0ZW5zaW9uW10gPSBbXTtcblx0XHRjb25zdCBleHRlbnNpb25zVG9JbnN0YWxsT25SZW1vdGU6IElFeHRlbnNpb25bXSA9IFtdO1xuXHRcdGNvbnN0IGV4dGVuc2lvbnNUb0VuYWJsZTogSUV4dGVuc2lvbltdID0gW107XG5cblx0XHRmb3IgKGNvbnN0IGV4dElkIG9mIGV4dElkcykge1xuXHRcdFx0Y29uc3QgZXh0ZW5zaW9uID0gKGF3YWl0IGV4dGVuc2lvbldvcmtiZW5jaFNlcnZpY2UuZ2V0RXh0ZW5zaW9ucyhbeyBpZDogZXh0SWQgfV0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpKVswXTtcblx0XHRcdGlmIChleHRlbnNpb24uZW5hYmxlbWVudFN0YXRlID09PSBFbmFibGVtZW50U3RhdGUuRGlzYWJsZWRHbG9iYWxseSB8fCBleHRlbnNpb24uZW5hYmxlbWVudFN0YXRlID09PSBFbmFibGVtZW50U3RhdGUuRGlzYWJsZWRXb3Jrc3BhY2UgfHwgZXh0ZW5zaW9uLmVuYWJsZW1lbnRTdGF0ZSA9PT0gRW5hYmxlbWVudFN0YXRlLkRpc2FibGVkQnlFbnZpcm9ubWVudCkge1xuXHRcdFx0XHRleHRlbnNpb25zVG9FbmFibGUucHVzaChleHRlbnNpb24pO1xuXHRcdFx0fSBlbHNlIGlmICghZXh0ZW5zaW9uV29ya2JlbmNoU2VydmljZS5pbnN0YWxsZWQuc29tZShlID0+IGFyZVNhbWVFeHRlbnNpb25zKGUuaWRlbnRpZmllciwgZXh0ZW5zaW9uLmlkZW50aWZpZXIpKSkge1xuXHRcdFx0XHQvLyBJbnN0YWxsIHRoaXMgZXh0ZW5zaW9uIG9ubHkgaWYgaXQgaGFzbid0IGFscmVhZHkgYmVlbiBpbnN0YWxsZWQuXG5cdFx0XHRcdGNvbnN0IGNhbkluc3RhbGwgPSBhd2FpdCBleHRlbnNpb25Xb3JrYmVuY2hTZXJ2aWNlLmNhbkluc3RhbGwoZXh0ZW5zaW9uKTtcblx0XHRcdFx0aWYgKGNhbkluc3RhbGwgPT09IHRydWUpIHtcblx0XHRcdFx0XHRleHRlbnNpb25zVG9JbnN0YWxsLnB1c2goZXh0ZW5zaW9uKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIGlmIChleHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS5yZW1vdGVFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyKSB7XG5cdFx0XHRcdC8vIGFscmVhZHkgaW5zdGFsbGVkLCBjaGVjayBpZiBpdCBzaG91bGQgYmUgaW5zdGFsbGVkIG9uIHJlbW90ZSBzaW5jZSB3ZSBhcmUgbm90IGdldHRpbmcgYW55IGtlcm5lbHMgb3Iga2VybmVsIHByb3ZpZGVycy5cblx0XHRcdFx0aWYgKGV4dGVuc2lvbldvcmtiZW5jaFNlcnZpY2UuaW5zdGFsbGVkLnNvbWUoZSA9PiBhcmVTYW1lRXh0ZW5zaW9ucyhlLmlkZW50aWZpZXIsIGV4dGVuc2lvbi5pZGVudGlmaWVyKSAmJiBlLnNlcnZlciA9PT0gZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UucmVtb3RlRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlcikpIHtcblx0XHRcdFx0XHQvLyBleHRlbnNpb24gZXhpc3RzIG9uIHJlbW90ZSBzZXJ2ZXIuIHNob3VsZCBub3QgaGFwcGVuXG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Ly8gZXh0ZW5zaW9uIGRvZXNuJ3QgZXhpc3Qgb24gcmVtb3RlIHNlcnZlclxuXHRcdFx0XHRcdGNvbnN0IGNhbkluc3RhbGwgPSBhd2FpdCBleHRlbnNpb25Xb3JrYmVuY2hTZXJ2aWNlLmNhbkluc3RhbGwoZXh0ZW5zaW9uKTtcblx0XHRcdFx0XHRpZiAoY2FuSW5zdGFsbCkge1xuXHRcdFx0XHRcdFx0ZXh0ZW5zaW9uc1RvSW5zdGFsbE9uUmVtb3RlLnB1c2goZXh0ZW5zaW9uKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoZXh0ZW5zaW9uc1RvSW5zdGFsbC5sZW5ndGggfHwgZXh0ZW5zaW9uc1RvRW5hYmxlLmxlbmd0aCB8fCBleHRlbnNpb25zVG9JbnN0YWxsT25SZW1vdGUubGVuZ3RoKSB7XG5cdFx0XHRhd2FpdCBQcm9taXNlLmFsbChbLi4uZXh0ZW5zaW9uc1RvSW5zdGFsbC5tYXAoYXN5bmMgZXh0ZW5zaW9uID0+IHtcblx0XHRcdFx0YXdhaXQgZXh0ZW5zaW9uV29ya2JlbmNoU2VydmljZS5pbnN0YWxsKFxuXHRcdFx0XHRcdGV4dGVuc2lvbixcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRpbnN0YWxsUHJlUmVsZWFzZVZlcnNpb246IGlzSW5zaWRlcnMgPz8gZmFsc2UsXG5cdFx0XHRcdFx0XHRjb250ZXh0OiB7IHNraXBXYWxrdGhyb3VnaDogdHJ1ZSB9LFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0UHJvZ3Jlc3NMb2NhdGlvbi5Ob3RpZmljYXRpb25cblx0XHRcdFx0KTtcblx0XHRcdH0pLCAuLi5leHRlbnNpb25zVG9FbmFibGUubWFwKGFzeW5jIGV4dGVuc2lvbiA9PiB7XG5cdFx0XHRcdHN3aXRjaCAoZXh0ZW5zaW9uLmVuYWJsZW1lbnRTdGF0ZSkge1xuXHRcdFx0XHRcdGNhc2UgRW5hYmxlbWVudFN0YXRlLkRpc2FibGVkV29ya3NwYWNlOlxuXHRcdFx0XHRcdFx0YXdhaXQgZXh0ZW5zaW9uV29ya2JlbmNoU2VydmljZS5zZXRFbmFibGVtZW50KFtleHRlbnNpb25dLCBFbmFibGVtZW50U3RhdGUuRW5hYmxlZFdvcmtzcGFjZSk7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0Y2FzZSBFbmFibGVtZW50U3RhdGUuRGlzYWJsZWRHbG9iYWxseTpcblx0XHRcdFx0XHRcdGF3YWl0IGV4dGVuc2lvbldvcmtiZW5jaFNlcnZpY2Uuc2V0RW5hYmxlbWVudChbZXh0ZW5zaW9uXSwgRW5hYmxlbWVudFN0YXRlLkVuYWJsZWRHbG9iYWxseSk7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0Y2FzZSBFbmFibGVtZW50U3RhdGUuRGlzYWJsZWRCeUVudmlyb25tZW50OlxuXHRcdFx0XHRcdFx0YXdhaXQgZXh0ZW5zaW9uV29ya2JlbmNoU2VydmljZS5zZXRFbmFibGVtZW50KFtleHRlbnNpb25dLCBFbmFibGVtZW50U3RhdGUuRW5hYmxlZEJ5RW52aXJvbm1lbnQpO1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fSksIC4uLmV4dGVuc2lvbnNUb0luc3RhbGxPblJlbW90ZS5tYXAoYXN5bmMgZXh0ZW5zaW9uID0+IHtcblx0XHRcdFx0YXdhaXQgZXh0ZW5zaW9uV29ya2JlbmNoU2VydmljZS5pbnN0YWxsSW5TZXJ2ZXIoZXh0ZW5zaW9uLCB0aGlzLl9leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS5yZW1vdGVFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyISk7XG5cdFx0XHR9KV0pO1xuXG5cdFx0XHRhd2FpdCBleHRlbnNpb25TZXJ2aWNlLmFjdGl2YXRlQnlFdmVudChgb25Ob3RlYm9vazoke3ZpZXdUeXBlfWApO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHBhc2NhbENhc2VkID0gdmlld1R5cGUuc3BsaXQoL1teYS16MC05XS9pZykubWFwKHVwcGVyY2FzZUZpcnN0TGV0dGVyKS5qb2luKCcnKTtcblx0XHRhd2FpdCBleHRlbnNpb25Xb3JrYmVuY2hTZXJ2aWNlLm9wZW5TZWFyY2goYEB0YWc6bm90ZWJvb2tLZXJuZWwke3Bhc2NhbENhc2VkfWApO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfc2hvd0luc3RhbGxLZXJuZWxFeHRlbnNpb25SZWNvbW1lbmRhdGlvbihcblx0XHRub3RlYm9va1RleHRNb2RlbDogTm90ZWJvb2tUZXh0TW9kZWwsXG5cdFx0cXVpY2tQaWNrOiBJUXVpY2tQaWNrPEtlcm5lbFF1aWNrUGlja0l0ZW0sIHsgdXNlU2VwYXJhdG9yczogdHJ1ZSB9Pixcblx0XHRleHRlbnNpb25Xb3JrYmVuY2hTZXJ2aWNlOiBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UsXG5cdFx0dG9rZW46IENhbmNlbGxhdGlvblRva2VuXG5cdCkge1xuXHRcdHF1aWNrUGljay5idXN5ID0gdHJ1ZTtcblxuXHRcdGNvbnN0IG5ld1F1aWNrUGlja0l0ZW1zID0gYXdhaXQgdGhpcy5fZ2V0S2VybmVsUmVjb21tZW5kYXRpb25zUXVpY2tQaWNrSXRlbXMobm90ZWJvb2tUZXh0TW9kZWwsIGV4dGVuc2lvbldvcmtiZW5jaFNlcnZpY2UpO1xuXHRcdHF1aWNrUGljay5idXN5ID0gZmFsc2U7XG5cblx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAobmV3UXVpY2tQaWNrSXRlbXMgJiYgcXVpY2tQaWNrLml0ZW1zLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cXVpY2tQaWNrLml0ZW1zID0gbmV3UXVpY2tQaWNrSXRlbXM7XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIGFzeW5jIF9nZXRLZXJuZWxSZWNvbW1lbmRhdGlvbnNRdWlja1BpY2tJdGVtcyhcblx0XHRub3RlYm9va1RleHRNb2RlbDogTm90ZWJvb2tUZXh0TW9kZWwsXG5cdFx0ZXh0ZW5zaW9uV29ya2JlbmNoU2VydmljZTogSUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLFxuXHQpOiBQcm9taXNlPFF1aWNrUGlja0lucHV0PFNlYXJjaE1hcmtldHBsYWNlUGljayB8IEluc3RhbGxFeHRlbnNpb25QaWNrPltdIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgcXVpY2tQaWNrSXRlbXM6IFF1aWNrUGlja0lucHV0PFNlYXJjaE1hcmtldHBsYWNlUGljayB8IEluc3RhbGxFeHRlbnNpb25QaWNrPltdID0gW107XG5cblx0XHRjb25zdCBsYW5ndWFnZSA9IHRoaXMuZ2V0U3VnZ2VzdGVkTGFuZ3VhZ2Uobm90ZWJvb2tUZXh0TW9kZWwpO1xuXHRcdGNvbnN0IHN1Z2dlc3RlZEV4dGVuc2lvbjogSU5vdGVib29rRXh0ZW5zaW9uUmVjb21tZW5kYXRpb24gfCB1bmRlZmluZWQgPSBsYW5ndWFnZSA/IHRoaXMuZ2V0U3VnZ2VzdGVkS2VybmVsRnJvbUxhbmd1YWdlKG5vdGVib29rVGV4dE1vZGVsLnZpZXdUeXBlLCBsYW5ndWFnZSkgOiB1bmRlZmluZWQ7XG5cdFx0aWYgKHN1Z2dlc3RlZEV4dGVuc2lvbikge1xuXHRcdFx0YXdhaXQgZXh0ZW5zaW9uV29ya2JlbmNoU2VydmljZS5xdWVyeUxvY2FsKCk7XG5cblx0XHRcdGNvbnN0IGV4dGVuc2lvbnMgPSBleHRlbnNpb25Xb3JrYmVuY2hTZXJ2aWNlLmluc3RhbGxlZC5maWx0ZXIoZSA9PlxuXHRcdFx0XHQoZS5lbmFibGVtZW50U3RhdGUgPT09IEVuYWJsZW1lbnRTdGF0ZS5FbmFibGVkQnlFbnZpcm9ubWVudCB8fCBlLmVuYWJsZW1lbnRTdGF0ZSA9PT0gRW5hYmxlbWVudFN0YXRlLkVuYWJsZWRHbG9iYWxseSB8fCBlLmVuYWJsZW1lbnRTdGF0ZSA9PT0gRW5hYmxlbWVudFN0YXRlLkVuYWJsZWRXb3Jrc3BhY2UpXG5cdFx0XHRcdCYmIHN1Z2dlc3RlZEV4dGVuc2lvbi5leHRlbnNpb25JZHMuaW5jbHVkZXMoZS5pZGVudGlmaWVyLmlkKVxuXHRcdFx0KTtcblxuXHRcdFx0aWYgKGV4dGVuc2lvbnMubGVuZ3RoID09PSBzdWdnZXN0ZWRFeHRlbnNpb24uZXh0ZW5zaW9uSWRzLmxlbmd0aCkge1xuXHRcdFx0XHQvLyBpdCdzIGluc3RhbGxlZCBidXQgbWlnaHQgYmUgZGV0ZWN0aW5nIGtlcm5lbHNcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblxuXHRcdFx0Ly8gV2UgaGF2ZSBhIHN1Z2dlc3RlZCBrZXJuZWwsIHNob3cgYW4gb3B0aW9uIHRvIGluc3RhbGwgaXRcblx0XHRcdHF1aWNrUGlja0l0ZW1zLnB1c2goe1xuXHRcdFx0XHRpZDogJ2luc3RhbGxTdWdnZXN0ZWQnLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogc3VnZ2VzdGVkRXh0ZW5zaW9uLmRpc3BsYXlOYW1lID8/IHN1Z2dlc3RlZEV4dGVuc2lvbi5leHRlbnNpb25JZHMuam9pbignLCAnKSxcblx0XHRcdFx0bGFiZWw6IGAkKCR7Q29kaWNvbi5saWdodGJ1bGIuaWR9KSBgICsgbG9jYWxpemUoJ2luc3RhbGxTdWdnZXN0ZWRLZXJuZWwnLCAnSW5zdGFsbC9FbmFibGUgc3VnZ2VzdGVkIGV4dGVuc2lvbnMnKSxcblx0XHRcdFx0ZXh0ZW5zaW9uSWRzOiBzdWdnZXN0ZWRFeHRlbnNpb24uZXh0ZW5zaW9uSWRzXG5cdFx0XHR9IHNhdGlzZmllcyBJbnN0YWxsRXh0ZW5zaW9uUGljayk7XG5cdFx0fVxuXHRcdC8vIHRoZXJlIGlzIG5vIGtlcm5lbCwgc2hvdyB0aGUgaW5zdGFsbCBmcm9tIG1hcmtldHBsYWNlXG5cdFx0cXVpY2tQaWNrSXRlbXMucHVzaCh7XG5cdFx0XHRpZDogJ2luc3RhbGwnLFxuXHRcdFx0bGFiZWw6IGxvY2FsaXplKCdzZWFyY2hGb3JLZXJuZWxzJywgXCJCcm93c2UgbWFya2V0cGxhY2UgZm9yIGtlcm5lbCBleHRlbnNpb25zXCIpLFxuXHRcdH0gc2F0aXNmaWVzIFNlYXJjaE1hcmtldHBsYWNlUGljayk7XG5cblx0XHRyZXR1cm4gcXVpY2tQaWNrSXRlbXM7XG5cdH1cblxuXHQvKipcblx0ICogRXhhbWluZSB0aGUgbW9zdCBjb21tb24gbGFuZ3VhZ2UgaW4gdGhlIG5vdGVib29rXG5cdCAqIEBwYXJhbSBub3RlYm9va1RleHRNb2RlbCBUaGUgbm90ZWJvb2sgdGV4dCBtb2RlbFxuXHQgKiBAcmV0dXJucyBXaGF0IHRoZSBzdWdnZXN0ZWQgbGFuZ3VhZ2UgaXMgZm9yIHRoZSBub3RlYm9vay4gVXNlZCBmb3Iga2VybmFsIGluc3RhbGxpbmdcblx0ICovXG5cdHByaXZhdGUgZ2V0U3VnZ2VzdGVkTGFuZ3VhZ2Uobm90ZWJvb2tUZXh0TW9kZWw6IE5vdGVib29rVGV4dE1vZGVsKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBtZXRhRGF0YSA9IG5vdGVib29rVGV4dE1vZGVsLm1ldGFkYXRhO1xuXHRcdGNvbnN0IGxhbmd1YWdlX2luZm8gPSAobWV0YURhdGE/Lm1ldGFkYXRhIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+KT8ubGFuZ3VhZ2VfaW5mbyBhcyBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+IHwgdW5kZWZpbmVkO1xuXHRcdGxldCBzdWdnZXN0ZWRLZXJuZWxMYW5ndWFnZTogc3RyaW5nIHwgdW5kZWZpbmVkID0gbGFuZ3VhZ2VfaW5mbz8ubmFtZTtcblx0XHQvLyBUT0RPIGhvdyBkbyB3ZSBzdWdnZXN0IG11bHRpIGxhbmd1YWdlIG5vdGVib29rcz9cblx0XHRpZiAoIXN1Z2dlc3RlZEtlcm5lbExhbmd1YWdlKSB7XG5cdFx0XHRjb25zdCBjZWxsTGFuZ3VhZ2VzID0gbm90ZWJvb2tUZXh0TW9kZWwuY2VsbHMubWFwKGNlbGwgPT4gY2VsbC5sYW5ndWFnZSkuZmlsdGVyKGxhbmd1YWdlID0+IGxhbmd1YWdlICE9PSAnbWFya2Rvd24nKTtcblx0XHRcdC8vIENoZWNrIGlmIGNlbGwgbGFuZ3VhZ2VzIGlzIGFsbCB0aGUgc2FtZVxuXHRcdFx0aWYgKGNlbGxMYW5ndWFnZXMubGVuZ3RoID4gMSkge1xuXHRcdFx0XHRjb25zdCBmaXJzdExhbmd1YWdlID0gY2VsbExhbmd1YWdlc1swXTtcblx0XHRcdFx0aWYgKGNlbGxMYW5ndWFnZXMuZXZlcnkobGFuZ3VhZ2UgPT4gbGFuZ3VhZ2UgPT09IGZpcnN0TGFuZ3VhZ2UpKSB7XG5cdFx0XHRcdFx0c3VnZ2VzdGVkS2VybmVsTGFuZ3VhZ2UgPSBmaXJzdExhbmd1YWdlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBzdWdnZXN0ZWRLZXJuZWxMYW5ndWFnZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBHaXZlbiBhIGxhbmd1YWdlIGFuZCBub3RlYm9vayB2aWV3IHR5cGUgc3VnZ2VzdCBhIGtlcm5lbCBmb3IgaW5zdGFsbGF0aW9uXG5cdCAqIEBwYXJhbSBsYW5ndWFnZSBUaGUgbGFuZ3VhZ2UgdG8gZmluZCBhIHN1Z2dlc3RlZCBrZXJuZWwgZXh0ZW5zaW9uIGZvclxuXHQgKiBAcmV0dXJucyBBIHJlY29tbWVkbmF0aW9uIG9iamVjdCBmb3IgdGhlIHJlY29tbWVuZGVkIGV4dGVuc2lvbiwgZWxzZSB1bmRlZmluZWRcblx0ICovXG5cdHByaXZhdGUgZ2V0U3VnZ2VzdGVkS2VybmVsRnJvbUxhbmd1YWdlKHZpZXdUeXBlOiBzdHJpbmcsIGxhbmd1YWdlOiBzdHJpbmcpOiBJTm90ZWJvb2tFeHRlbnNpb25SZWNvbW1lbmRhdGlvbiB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgcmVjb21tZW5kYXRpb24gPSBLRVJORUxfUkVDT01NRU5EQVRJT05TLmdldCh2aWV3VHlwZSk/LmdldChsYW5ndWFnZSk7XG5cdFx0cmV0dXJuIHJlY29tbWVuZGF0aW9uO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBLZXJuZWxQaWNrZXJNUlVTdHJhdGVneSBleHRlbmRzIEtlcm5lbFBpY2tlclN0cmF0ZWd5QmFzZSB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJTm90ZWJvb2tLZXJuZWxTZXJ2aWNlIF9ub3RlYm9va0tlcm5lbFNlcnZpY2U6IElOb3RlYm9va0tlcm5lbFNlcnZpY2UsXG5cdFx0QElQcm9kdWN0U2VydmljZSBfcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSxcblx0XHRASVF1aWNrSW5wdXRTZXJ2aWNlIF9xdWlja0lucHV0U2VydmljZTogSVF1aWNrSW5wdXRTZXJ2aWNlLFxuXHRcdEBJTGFiZWxTZXJ2aWNlIF9sYWJlbFNlcnZpY2U6IElMYWJlbFNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlIF9leHRlbnNpb25Xb3JrYmVuY2hTZXJ2aWNlOiBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25TZXJ2aWNlIF9leHRlbnNpb25TZXJ2aWNlOiBJRXh0ZW5zaW9uU2VydmljZSxcblx0XHRASUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlIF9leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZTogSUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgX2NvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0QElOb3RlYm9va0tlcm5lbEhpc3RvcnlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX25vdGVib29rS2VybmVsSGlzdG9yeVNlcnZpY2U6IElOb3RlYm9va0tlcm5lbEhpc3RvcnlTZXJ2aWNlLFxuXHRcdEBJT3BlbmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9vcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZVxuXG5cdCkge1xuXHRcdHN1cGVyKFxuXHRcdFx0X25vdGVib29rS2VybmVsU2VydmljZSxcblx0XHRcdF9wcm9kdWN0U2VydmljZSxcblx0XHRcdF9xdWlja0lucHV0U2VydmljZSxcblx0XHRcdF9sYWJlbFNlcnZpY2UsXG5cdFx0XHRfbG9nU2VydmljZSxcblx0XHRcdF9leHRlbnNpb25Xb3JrYmVuY2hTZXJ2aWNlLFxuXHRcdFx0X2V4dGVuc2lvblNlcnZpY2UsXG5cdFx0XHRfY29tbWFuZFNlcnZpY2UsXG5cdFx0XHRfZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UsXG5cdFx0KTtcblx0fVxuXG5cdHByb3RlY3RlZCBfZ2V0S2VybmVsUGlja2VyUXVpY2tQaWNrSXRlbXMobm90ZWJvb2tUZXh0TW9kZWw6IE5vdGVib29rVGV4dE1vZGVsLCBtYXRjaFJlc3VsdDogSU5vdGVib29rS2VybmVsTWF0Y2hSZXN1bHQsIG5vdGVib29rS2VybmVsU2VydmljZTogSU5vdGVib29rS2VybmVsU2VydmljZSwgc2NvcGVkQ29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSk6IFF1aWNrUGlja0lucHV0PEtlcm5lbFF1aWNrUGlja0l0ZW0+W10ge1xuXHRcdGNvbnN0IHF1aWNrUGlja0l0ZW1zOiBRdWlja1BpY2tJbnB1dDxLZXJuZWxRdWlja1BpY2tJdGVtPltdID0gW107XG5cblx0XHRpZiAobWF0Y2hSZXN1bHQuc2VsZWN0ZWQpIHtcblx0XHRcdGNvbnN0IGtlcm5lbEl0ZW0gPSB0b0tlcm5lbFF1aWNrUGljayhtYXRjaFJlc3VsdC5zZWxlY3RlZCwgbWF0Y2hSZXN1bHQuc2VsZWN0ZWQpO1xuXHRcdFx0cXVpY2tQaWNrSXRlbXMucHVzaChrZXJuZWxJdGVtKTtcblx0XHR9XG5cblx0XHRtYXRjaFJlc3VsdC5zdWdnZXN0aW9ucy5maWx0ZXIoa2VybmVsID0+IGtlcm5lbC5pZCAhPT0gbWF0Y2hSZXN1bHQuc2VsZWN0ZWQ/LmlkKS5tYXAoa2VybmVsID0+IHRvS2VybmVsUXVpY2tQaWNrKGtlcm5lbCwgbWF0Y2hSZXN1bHQuc2VsZWN0ZWQpKVxuXHRcdFx0LmZvckVhY2goa2VybmVsID0+IHtcblx0XHRcdFx0cXVpY2tQaWNrSXRlbXMucHVzaChrZXJuZWwpO1xuXHRcdFx0fSk7XG5cblx0XHRjb25zdCBzaG91bGRBdXRvUnVuID0gcXVpY2tQaWNrSXRlbXMubGVuZ3RoID09PSAwO1xuXG5cdFx0aWYgKHF1aWNrUGlja0l0ZW1zLmxlbmd0aCA+IDApIHtcblx0XHRcdHF1aWNrUGlja0l0ZW1zLnB1c2goe1xuXHRcdFx0XHR0eXBlOiAnc2VwYXJhdG9yJ1xuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0Ly8gc2VsZWN0IGFub3RoZXIga2VybmVsIHF1aWNrIHBpY2tcblx0XHRxdWlja1BpY2tJdGVtcy5wdXNoKHtcblx0XHRcdGlkOiAnc2VsZWN0QW5vdGhlcicsXG5cdFx0XHRsYWJlbDogbG9jYWxpemUoJ3NlbGVjdEFub3RoZXJLZXJuZWwubW9yZScsIFwiU2VsZWN0IEFub3RoZXIgS2VybmVsLi4uXCIpLFxuXHRcdFx0YXV0b1J1bjogc2hvdWxkQXV0b1J1blxuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIHF1aWNrUGlja0l0ZW1zO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIF9zZWxlY3RlS2VybmVsKG5vdGVib29rOiBOb3RlYm9va1RleHRNb2RlbCwga2VybmVsOiBJTm90ZWJvb2tLZXJuZWwpOiB2b2lkIHtcblx0XHRjb25zdCBjdXJyZW50SW5mbyA9IHRoaXMuX25vdGVib29rS2VybmVsU2VydmljZS5nZXRNYXRjaGluZ0tlcm5lbChub3RlYm9vayk7XG5cdFx0aWYgKGN1cnJlbnRJbmZvLnNlbGVjdGVkKSB7XG5cdFx0XHQvLyB0aGVyZSBpcyBhbHJlYWR5IGEgc2VsZWN0ZWQga2VybmVsXG5cdFx0XHR0aGlzLl9ub3RlYm9va0tlcm5lbEhpc3RvcnlTZXJ2aWNlLmFkZE1vc3RSZWNlbnRLZXJuZWwoY3VycmVudEluZm8uc2VsZWN0ZWQpO1xuXHRcdH1cblx0XHRzdXBlci5fc2VsZWN0ZUtlcm5lbChub3RlYm9vaywga2VybmVsKTtcblx0XHR0aGlzLl9ub3RlYm9va0tlcm5lbEhpc3RvcnlTZXJ2aWNlLmFkZE1vc3RSZWNlbnRLZXJuZWwoa2VybmVsKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBfZ2V0TWF0Y2hpbmdSZXN1bHQobm90ZWJvb2s6IE5vdGVib29rVGV4dE1vZGVsKTogSU5vdGVib29rS2VybmVsTWF0Y2hSZXN1bHQge1xuXHRcdGNvbnN0IHsgc2VsZWN0ZWQsIGFsbCB9ID0gdGhpcy5fbm90ZWJvb2tLZXJuZWxIaXN0b3J5U2VydmljZS5nZXRLZXJuZWxzKG5vdGVib29rKTtcblx0XHRjb25zdCBtYXRjaGluZ1Jlc3VsdCA9IHRoaXMuX25vdGVib29rS2VybmVsU2VydmljZS5nZXRNYXRjaGluZ0tlcm5lbChub3RlYm9vayk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHNlbGVjdGVkOiBzZWxlY3RlZCxcblx0XHRcdGFsbDogbWF0Y2hpbmdSZXN1bHQuYWxsLFxuXHRcdFx0c3VnZ2VzdGlvbnM6IGFsbCxcblx0XHRcdGhpZGRlbjogW11cblx0XHR9O1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGFzeW5jIF9oYW5kbGVRdWlja1BpY2soZWRpdG9yOiBJQWN0aXZlTm90ZWJvb2tFZGl0b3IsIHBpY2s6IEtlcm5lbFF1aWNrUGlja0l0ZW0sIGl0ZW1zOiBLZXJuZWxRdWlja1BpY2tJdGVtW10pOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRpZiAocGljay5pZCA9PT0gJ3NlbGVjdEFub3RoZXInKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5kaXNwbGF5U2VsZWN0QW5vdGhlclF1aWNrUGljayhlZGl0b3IsIGl0ZW1zLmxlbmd0aCA9PT0gMSAmJiBpdGVtc1swXSA9PT0gcGljayk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHN1cGVyLl9oYW5kbGVRdWlja1BpY2soZWRpdG9yLCBwaWNrLCBpdGVtcyk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRpc3BsYXlTZWxlY3RBbm90aGVyUXVpY2tQaWNrKGVkaXRvcjogSUFjdGl2ZU5vdGVib29rRWRpdG9yLCBrZXJuZWxMaXN0RW1wdHk6IGJvb2xlYW4pOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRjb25zdCBub3RlYm9vazogTm90ZWJvb2tUZXh0TW9kZWwgPSBlZGl0b3IudGV4dE1vZGVsO1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IHF1aWNrUGljayA9IGRpc3Bvc2FibGVzLmFkZCh0aGlzLl9xdWlja0lucHV0U2VydmljZS5jcmVhdGVRdWlja1BpY2s8S2VybmVsUXVpY2tQaWNrSXRlbT4oeyB1c2VTZXBhcmF0b3JzOiB0cnVlIH0pKTtcblx0XHRjb25zdCBxdWlja1BpY2tJdGVtID0gYXdhaXQgbmV3IFByb21pc2U8S2VybmVsUXVpY2tQaWNrSXRlbSB8IElRdWlja0lucHV0QnV0dG9uIHwgdW5kZWZpbmVkPihyZXNvbHZlID0+IHtcblx0XHRcdC8vIHNlbGVjdCBmcm9tIGtlcm5lbCBzb3VyY2VzXG5cdFx0XHRxdWlja1BpY2sudGl0bGUgPSBrZXJuZWxMaXN0RW1wdHkgPyBsb2NhbGl6ZSgnc2VsZWN0JywgXCJTZWxlY3QgS2VybmVsXCIpIDogbG9jYWxpemUoJ3NlbGVjdEFub3RoZXJLZXJuZWwnLCBcIlNlbGVjdCBBbm90aGVyIEtlcm5lbFwiKTtcblx0XHRcdHF1aWNrUGljay5wbGFjZWhvbGRlciA9IGxvY2FsaXplKCdzZWxlY3RLZXJuZWwucGxhY2Vob2xkZXInLCBcIlR5cGUgdG8gY2hvb3NlIGEga2VybmVsIHNvdXJjZVwiKTtcblx0XHRcdHF1aWNrUGljay5idXN5ID0gdHJ1ZTtcblx0XHRcdHF1aWNrUGljay5idXR0b25zID0gW3RoaXMuX3F1aWNrSW5wdXRTZXJ2aWNlLmJhY2tCdXR0b25dO1xuXHRcdFx0cXVpY2tQaWNrLnNob3coKTtcblxuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHF1aWNrUGljay5vbkRpZFRyaWdnZXJCdXR0b24oYnV0dG9uID0+IHtcblx0XHRcdFx0aWYgKGJ1dHRvbiA9PT0gdGhpcy5fcXVpY2tJbnB1dFNlcnZpY2UuYmFja0J1dHRvbikge1xuXHRcdFx0XHRcdHJlc29sdmUoYnV0dG9uKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHF1aWNrUGljay5vbkRpZFRyaWdnZXJJdGVtQnV0dG9uKGFzeW5jIChlKSA9PiB7XG5cdFx0XHRcdGlmIChpc0tlcm5lbFNvdXJjZVF1aWNrUGlja0l0ZW0oZS5pdGVtKSAmJiBlLml0ZW0uZG9jdW1lbnRhdGlvbiAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0Y29uc3QgdXJpID0gVVJJLmlzVXJpKGUuaXRlbS5kb2N1bWVudGF0aW9uKSA/IFVSSS5wYXJzZShlLml0ZW0uZG9jdW1lbnRhdGlvbikgOiBhd2FpdCB0aGlzLl9jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZDxVUkk+KGUuaXRlbS5kb2N1bWVudGF0aW9uKTtcblx0XHRcdFx0XHRpZiAodXJpKSB7XG5cdFx0XHRcdFx0XHR2b2lkIHRoaXMuX29wZW5lclNlcnZpY2Uub3Blbih1cmksIHsgb3BlbkV4dGVybmFsOiB0cnVlIH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHF1aWNrUGljay5vbkRpZEFjY2VwdChhc3luYyAoKSA9PiB7XG5cdFx0XHRcdHJlc29sdmUocXVpY2tQaWNrLnNlbGVjdGVkSXRlbXNbMF0pO1xuXHRcdFx0fSkpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHF1aWNrUGljay5vbkRpZEhpZGUoKCkgPT4ge1xuXHRcdFx0XHRyZXNvbHZlKHVuZGVmaW5lZCk7XG5cdFx0XHR9KSk7XG5cblx0XHRcdHRoaXMuX2NhbGN1bGRhdGVLZXJuZWxTb3VyY2VzKGVkaXRvcikudGhlbihxdWlja1BpY2tJdGVtcyA9PiB7XG5cdFx0XHRcdHF1aWNrUGljay5pdGVtcyA9IHF1aWNrUGlja0l0ZW1zO1xuXHRcdFx0XHRpZiAocXVpY2tQaWNrLml0ZW1zLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHRxdWlja1BpY2suYnVzeSA9IGZhbHNlO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblxuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKEV2ZW50LmRlYm91bmNlPHZvaWQsIHZvaWQ+KFxuXHRcdFx0XHRFdmVudC5hbnkoXG5cdFx0XHRcdFx0dGhpcy5fbm90ZWJvb2tLZXJuZWxTZXJ2aWNlLm9uRGlkQ2hhbmdlU291cmNlQWN0aW9ucyxcblx0XHRcdFx0XHR0aGlzLl9ub3RlYm9va0tlcm5lbFNlcnZpY2Uub25EaWRBZGRLZXJuZWwsXG5cdFx0XHRcdFx0dGhpcy5fbm90ZWJvb2tLZXJuZWxTZXJ2aWNlLm9uRGlkUmVtb3ZlS2VybmVsXG5cdFx0XHRcdCksXG5cdFx0XHRcdChsYXN0LCBfY3VycmVudCkgPT4gbGFzdCxcblx0XHRcdFx0S0VSTkVMX1BJQ0tFUl9VUERBVEVfREVCT1VOQ0Vcblx0XHRcdCkoYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRxdWlja1BpY2suYnVzeSA9IHRydWU7XG5cdFx0XHRcdGNvbnN0IHF1aWNrUGlja0l0ZW1zID0gYXdhaXQgdGhpcy5fY2FsY3VsZGF0ZUtlcm5lbFNvdXJjZXMoZWRpdG9yKTtcblx0XHRcdFx0cXVpY2tQaWNrLml0ZW1zID0gcXVpY2tQaWNrSXRlbXM7XG5cdFx0XHRcdHF1aWNrUGljay5idXN5ID0gZmFsc2U7XG5cdFx0XHR9KSk7XG5cdFx0fSk7XG5cblx0XHRxdWlja1BpY2suaGlkZSgpO1xuXHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblxuXHRcdGlmIChxdWlja1BpY2tJdGVtID09PSB0aGlzLl9xdWlja0lucHV0U2VydmljZS5iYWNrQnV0dG9uKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5zaG93UXVpY2tQaWNrKGVkaXRvciwgdW5kZWZpbmVkLCB0cnVlKTtcblx0XHR9XG5cblx0XHRpZiAocXVpY2tQaWNrSXRlbSkge1xuXHRcdFx0Y29uc3Qgc2VsZWN0ZWRLZXJuZWxQaWNrSXRlbSA9IHF1aWNrUGlja0l0ZW0gYXMgS2VybmVsUXVpY2tQaWNrSXRlbTtcblx0XHRcdGlmIChpc0tlcm5lbFNvdXJjZVF1aWNrUGlja0l0ZW0oc2VsZWN0ZWRLZXJuZWxQaWNrSXRlbSkpIHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRjb25zdCBzZWxlY3RlZEtlcm5lbElkID0gYXdhaXQgdGhpcy5fZXhlY3V0ZUNvbW1hbmQ8c3RyaW5nPihub3RlYm9vaywgc2VsZWN0ZWRLZXJuZWxQaWNrSXRlbS5jb21tYW5kKTtcblx0XHRcdFx0XHRpZiAoc2VsZWN0ZWRLZXJuZWxJZCkge1xuXHRcdFx0XHRcdFx0Y29uc3QgeyBhbGwgfSA9IGF3YWl0IHRoaXMuX2dldE1hdGNoaW5nUmVzdWx0KG5vdGVib29rKTtcblx0XHRcdFx0XHRcdGNvbnN0IGtlcm5lbCA9IGFsbC5maW5kKGtlcm5lbCA9PiBrZXJuZWwuaWQgPT09IGBtcy10b29sc2FpLmp1cHl0ZXIvJHtzZWxlY3RlZEtlcm5lbElkfWApO1xuXHRcdFx0XHRcdFx0aWYgKGtlcm5lbCkge1xuXHRcdFx0XHRcdFx0XHRhd2FpdCB0aGlzLl9zZWxlY3RlS2VybmVsKG5vdGVib29rLCBrZXJuZWwpO1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gdGhpcy5kaXNwbGF5U2VsZWN0QW5vdGhlclF1aWNrUGljayhlZGl0b3IsIGZhbHNlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gY2F0Y2ggKGV4KSB7XG5cdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2UgaWYgKGlzS2VybmVsUGljayhzZWxlY3RlZEtlcm5lbFBpY2tJdGVtKSkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLl9zZWxlY3RlS2VybmVsKG5vdGVib29rLCBzZWxlY3RlZEtlcm5lbFBpY2tJdGVtLmtlcm5lbCk7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fSBlbHNlIGlmIChpc0dyb3VwZWRLZXJuZWxzUGljayhzZWxlY3RlZEtlcm5lbFBpY2tJdGVtKSkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLl9zZWxlY3RPbmVLZXJuZWwobm90ZWJvb2ssIHNlbGVjdGVkS2VybmVsUGlja0l0ZW0ubGFiZWwsIHNlbGVjdGVkS2VybmVsUGlja0l0ZW0ua2VybmVscyk7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fSBlbHNlIGlmIChpc1NvdXJjZVBpY2soc2VsZWN0ZWRLZXJuZWxQaWNrSXRlbSkpIHtcblx0XHRcdFx0Ly8gc2VsZWN0ZWQgZXhwbGljaWx0eSwgaXQgc2hvdWxkIHRyaWdnZXIgdGhlIGV4ZWN1dGlvbj9cblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRhd2FpdCBzZWxlY3RlZEtlcm5lbFBpY2tJdGVtLmFjdGlvbi5ydW5BY3Rpb24oKTtcblx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0fSBjYXRjaCAoZXgpIHtcblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSBpZiAoaXNTZWFyY2hNYXJrZXRwbGFjZVBpY2soc2VsZWN0ZWRLZXJuZWxQaWNrSXRlbSkpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5fc2hvd0tlcm5lbEV4dGVuc2lvbihcblx0XHRcdFx0XHR0aGlzLl9leHRlbnNpb25Xb3JrYmVuY2hTZXJ2aWNlLFxuXHRcdFx0XHRcdHRoaXMuX2V4dGVuc2lvblNlcnZpY2UsXG5cdFx0XHRcdFx0dGhpcy5fZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UsXG5cdFx0XHRcdFx0ZWRpdG9yLnRleHRNb2RlbC52aWV3VHlwZSxcblx0XHRcdFx0XHRbXVxuXHRcdFx0XHQpO1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH0gZWxzZSBpZiAoaXNJbnN0YWxsRXh0ZW5zaW9uUGljayhzZWxlY3RlZEtlcm5lbFBpY2tJdGVtKSkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLl9zaG93S2VybmVsRXh0ZW5zaW9uKFxuXHRcdFx0XHRcdHRoaXMuX2V4dGVuc2lvbldvcmtiZW5jaFNlcnZpY2UsXG5cdFx0XHRcdFx0dGhpcy5fZXh0ZW5zaW9uU2VydmljZSxcblx0XHRcdFx0XHR0aGlzLl9leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZSxcblx0XHRcdFx0XHRlZGl0b3IudGV4dE1vZGVsLnZpZXdUeXBlLFxuXHRcdFx0XHRcdHNlbGVjdGVkS2VybmVsUGlja0l0ZW0uZXh0ZW5zaW9uSWRzLFxuXHRcdFx0XHRcdHRoaXMuX3Byb2R1Y3RTZXJ2aWNlLnF1YWxpdHkgIT09ICdzdGFibGUnXG5cdFx0XHRcdCk7XG5cdFx0XHRcdHJldHVybiB0aGlzLmRpc3BsYXlTZWxlY3RBbm90aGVyUXVpY2tQaWNrKGVkaXRvciwgZmFsc2UpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2NhbGN1bGRhdGVLZXJuZWxTb3VyY2VzKGVkaXRvcjogSUFjdGl2ZU5vdGVib29rRWRpdG9yKSB7XG5cdFx0Y29uc3Qgbm90ZWJvb2s6IE5vdGVib29rVGV4dE1vZGVsID0gZWRpdG9yLnRleHRNb2RlbDtcblxuXHRcdGNvbnN0IHNvdXJjZUFjdGlvbkNvbW1hbmRzID0gdGhpcy5fbm90ZWJvb2tLZXJuZWxTZXJ2aWNlLmdldFNvdXJjZUFjdGlvbnMobm90ZWJvb2ssIGVkaXRvci5zY29wZWRDb250ZXh0S2V5U2VydmljZSk7XG5cdFx0Y29uc3QgYWN0aW9ucyA9IGF3YWl0IHRoaXMuX25vdGVib29rS2VybmVsU2VydmljZS5nZXRLZXJuZWxTb3VyY2VBY3Rpb25zMihub3RlYm9vayk7XG5cdFx0Y29uc3QgbWF0Y2hSZXN1bHQgPSB0aGlzLl9nZXRNYXRjaGluZ1Jlc3VsdChub3RlYm9vayk7XG5cblx0XHRpZiAoc291cmNlQWN0aW9uQ29tbWFuZHMubGVuZ3RoID09PSAwICYmIG1hdGNoUmVzdWx0LmFsbC5sZW5ndGggPT09IDAgJiYgYWN0aW9ucy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiBhd2FpdCB0aGlzLl9nZXRLZXJuZWxSZWNvbW1lbmRhdGlvbnNRdWlja1BpY2tJdGVtcyhub3RlYm9vaywgdGhpcy5fZXh0ZW5zaW9uV29ya2JlbmNoU2VydmljZSkgPz8gW107XG5cdFx0fVxuXG5cdFx0Y29uc3Qgb3RoZXJzID0gbWF0Y2hSZXN1bHQuYWxsLmZpbHRlcihpdGVtID0+IGl0ZW0uZXh0ZW5zaW9uLnZhbHVlICE9PSBKVVBZVEVSX0VYVEVOU0lPTl9JRCk7XG5cdFx0Y29uc3QgcXVpY2tQaWNrSXRlbXM6IFF1aWNrUGlja0lucHV0PEtlcm5lbFF1aWNrUGlja0l0ZW0+W10gPSBbXTtcblxuXHRcdC8vIGdyb3VwIGNvbnRyb2xsZXJzIGJ5IGV4dGVuc2lvblxuXHRcdGZvciAoY29uc3QgZ3JvdXAgb2YgZ3JvdXBCeShvdGhlcnMsIChhLCBiKSA9PiBhLmV4dGVuc2lvbi52YWx1ZSA9PT0gYi5leHRlbnNpb24udmFsdWUgPyAwIDogMSkpIHtcblx0XHRcdGNvbnN0IGV4dGVuc2lvbiA9IHRoaXMuX2V4dGVuc2lvblNlcnZpY2UuZXh0ZW5zaW9ucy5maW5kKGV4dGVuc2lvbiA9PiBleHRlbnNpb24uaWRlbnRpZmllci52YWx1ZSA9PT0gZ3JvdXBbMF0uZXh0ZW5zaW9uLnZhbHVlKTtcblx0XHRcdGNvbnN0IHNvdXJjZSA9IGV4dGVuc2lvbj8uZGlzcGxheU5hbWUgPz8gZXh0ZW5zaW9uPy5kZXNjcmlwdGlvbiA/PyBncm91cFswXS5leHRlbnNpb24udmFsdWU7XG5cdFx0XHRpZiAoZ3JvdXAubGVuZ3RoID4gMSkge1xuXHRcdFx0XHRxdWlja1BpY2tJdGVtcy5wdXNoKHtcblx0XHRcdFx0XHRsYWJlbDogc291cmNlLFxuXHRcdFx0XHRcdGtlcm5lbHM6IGdyb3VwXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cXVpY2tQaWNrSXRlbXMucHVzaCh7XG5cdFx0XHRcdFx0bGFiZWw6IGdyb3VwWzBdLmxhYmVsLFxuXHRcdFx0XHRcdGtlcm5lbDogZ3JvdXBbMF1cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgdmFsaWRBY3Rpb25zID0gYWN0aW9ucy5maWx0ZXIoYWN0aW9uID0+IGFjdGlvbi5jb21tYW5kKTtcblxuXHRcdHF1aWNrUGlja0l0ZW1zLnB1c2goLi4udmFsaWRBY3Rpb25zLm1hcChhY3Rpb24gPT4ge1xuXHRcdFx0Y29uc3QgYnV0dG9ucyA9IGFjdGlvbi5kb2N1bWVudGF0aW9uID8gW3tcblx0XHRcdFx0aWNvbkNsYXNzOiBUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi5pbmZvKSxcblx0XHRcdFx0dG9vbHRpcDogbG9jYWxpemUoJ2xlYXJuTW9yZVRvb2x0aXAnLCAnTGVhcm4gTW9yZScpLFxuXHRcdFx0fV0gOiBbXTtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGlkOiB0eXBlb2YgYWN0aW9uLmNvbW1hbmQhID09PSAnc3RyaW5nJyA/IGFjdGlvbi5jb21tYW5kIDogYWN0aW9uLmNvbW1hbmQhLmlkLFxuXHRcdFx0XHRsYWJlbDogYWN0aW9uLmxhYmVsLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogYWN0aW9uLmRlc2NyaXB0aW9uLFxuXHRcdFx0XHRjb21tYW5kOiBhY3Rpb24uY29tbWFuZCxcblx0XHRcdFx0ZG9jdW1lbnRhdGlvbjogYWN0aW9uLmRvY3VtZW50YXRpb24sXG5cdFx0XHRcdGJ1dHRvbnNcblx0XHRcdH07XG5cdFx0fSkpO1xuXG5cdFx0Zm9yIChjb25zdCBzb3VyY2VBY3Rpb24gb2Ygc291cmNlQWN0aW9uQ29tbWFuZHMpIHtcblx0XHRcdGNvbnN0IHJlczogU291cmNlUGljayA9IHtcblx0XHRcdFx0YWN0aW9uOiBzb3VyY2VBY3Rpb24sXG5cdFx0XHRcdHBpY2tlZDogZmFsc2UsXG5cdFx0XHRcdGxhYmVsOiBzb3VyY2VBY3Rpb24uYWN0aW9uLmxhYmVsLFxuXHRcdFx0XHR0b29sdGlwOiBzb3VyY2VBY3Rpb24uYWN0aW9uLnRvb2x0aXBcblx0XHRcdH07XG5cblx0XHRcdHF1aWNrUGlja0l0ZW1zLnB1c2gocmVzKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gcXVpY2tQaWNrSXRlbXM7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9zZWxlY3RPbmVLZXJuZWwobm90ZWJvb2s6IE5vdGVib29rVGV4dE1vZGVsLCBzb3VyY2U6IHN0cmluZywga2VybmVsczogSU5vdGVib29rS2VybmVsW10pIHtcblx0XHRjb25zdCBxdWlja1BpY2tJdGVtczogUXVpY2tQaWNrSW5wdXQ8S2VybmVsUGljaz5bXSA9IGtlcm5lbHMubWFwKGtlcm5lbCA9PiB0b0tlcm5lbFF1aWNrUGljayhrZXJuZWwsIHVuZGVmaW5lZCkpO1xuXHRcdGNvbnN0IGxvY2FsRGlzcG9zYWJsZVN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IHF1aWNrUGljayA9IGxvY2FsRGlzcG9zYWJsZVN0b3JlLmFkZCh0aGlzLl9xdWlja0lucHV0U2VydmljZS5jcmVhdGVRdWlja1BpY2s8S2VybmVsUXVpY2tQaWNrSXRlbT4oeyB1c2VTZXBhcmF0b3JzOiB0cnVlIH0pKTtcblx0XHRxdWlja1BpY2suaXRlbXMgPSBxdWlja1BpY2tJdGVtcztcblx0XHRxdWlja1BpY2suY2FuU2VsZWN0TWFueSA9IGZhbHNlO1xuXG5cdFx0cXVpY2tQaWNrLnRpdGxlID0gbG9jYWxpemUoJ3NlbGVjdEtlcm5lbEZyb21FeHRlbnNpb24nLCBcIlNlbGVjdCBLZXJuZWwgZnJvbSB7MH1cIiwgc291cmNlKTtcblxuXHRcdGxvY2FsRGlzcG9zYWJsZVN0b3JlLmFkZChxdWlja1BpY2sub25EaWRBY2NlcHQoYXN5bmMgKCkgPT4ge1xuXHRcdFx0aWYgKHF1aWNrUGljay5zZWxlY3RlZEl0ZW1zICYmIHF1aWNrUGljay5zZWxlY3RlZEl0ZW1zLmxlbmd0aCA+IDAgJiYgaXNLZXJuZWxQaWNrKHF1aWNrUGljay5zZWxlY3RlZEl0ZW1zWzBdKSkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLl9zZWxlY3RlS2VybmVsKG5vdGVib29rLCBxdWlja1BpY2suc2VsZWN0ZWRJdGVtc1swXS5rZXJuZWwpO1xuXHRcdFx0fVxuXG5cdFx0XHRxdWlja1BpY2suaGlkZSgpO1xuXHRcdFx0cXVpY2tQaWNrLmRpc3Bvc2UoKTtcblx0XHR9KSk7XG5cblx0XHRsb2NhbERpc3Bvc2FibGVTdG9yZS5hZGQocXVpY2tQaWNrLm9uRGlkSGlkZSgoKSA9PiB7XG5cdFx0XHRsb2NhbERpc3Bvc2FibGVTdG9yZS5kaXNwb3NlKCk7XG5cdFx0fSkpO1xuXG5cdFx0cXVpY2tQaWNrLnNob3coKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2V4ZWN1dGVDb21tYW5kPFQ+KG5vdGVib29rOiBOb3RlYm9va1RleHRNb2RlbCwgY29tbWFuZDogc3RyaW5nIHwgQ29tbWFuZCk6IFByb21pc2U8VCB8IHVuZGVmaW5lZCB8IHZvaWQ+IHtcblx0XHRjb25zdCBpZCA9IHR5cGVvZiBjb21tYW5kID09PSAnc3RyaW5nJyA/IGNvbW1hbmQgOiBjb21tYW5kLmlkO1xuXHRcdGNvbnN0IGFyZ3MgPSB0eXBlb2YgY29tbWFuZCA9PT0gJ3N0cmluZycgPyBbXSA6IGNvbW1hbmQuYXJndW1lbnRzID8/IFtdO1xuXG5cdFx0aWYgKHR5cGVvZiBjb21tYW5kID09PSAnc3RyaW5nJyB8fCAhY29tbWFuZC5hcmd1bWVudHMgfHwgIUFycmF5LmlzQXJyYXkoY29tbWFuZC5hcmd1bWVudHMpIHx8IGNvbW1hbmQuYXJndW1lbnRzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0YXJncy51bnNoaWZ0KHtcblx0XHRcdFx0dXJpOiBub3RlYm9vay51cmksXG5cdFx0XHRcdCRtaWQ6IE1hcnNoYWxsZWRJZC5Ob3RlYm9va0FjdGlvbkNvbnRleHRcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdGlmICh0eXBlb2YgY29tbWFuZCA9PT0gJ3N0cmluZycpIHtcblx0XHRcdHJldHVybiB0aGlzLl9jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChpZCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiB0aGlzLl9jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChpZCwgLi4uYXJncyk7XG5cdFx0fVxuXHR9XG5cblx0c3RhdGljIHVwZGF0ZUtlcm5lbFN0YXR1c0FjdGlvbihub3RlYm9vazogTm90ZWJvb2tUZXh0TW9kZWwsIGFjdGlvbjogSUFjdGlvbiwgbm90ZWJvb2tLZXJuZWxTZXJ2aWNlOiBJTm90ZWJvb2tLZXJuZWxTZXJ2aWNlLCBub3RlYm9va0tlcm5lbEhpc3RvcnlTZXJ2aWNlOiBJTm90ZWJvb2tLZXJuZWxIaXN0b3J5U2VydmljZSkge1xuXHRcdGNvbnN0IGRldGVjdGlvblRhc2tzID0gbm90ZWJvb2tLZXJuZWxTZXJ2aWNlLmdldEtlcm5lbERldGVjdGlvblRhc2tzKG5vdGVib29rKTtcblx0XHRpZiAoZGV0ZWN0aW9uVGFza3MubGVuZ3RoKSB7XG5cdFx0XHRjb25zdCBpbmZvID0gbm90ZWJvb2tLZXJuZWxTZXJ2aWNlLmdldE1hdGNoaW5nS2VybmVsKG5vdGVib29rKTtcblx0XHRcdGFjdGlvbi5lbmFibGVkID0gdHJ1ZTtcblx0XHRcdGFjdGlvbi5jbGFzcyA9IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShUaGVtZUljb24ubW9kaWZ5KGV4ZWN1dGluZ1N0YXRlSWNvbiwgJ3NwaW4nKSk7XG5cblx0XHRcdGlmIChpbmZvLnNlbGVjdGVkKSB7XG5cdFx0XHRcdGFjdGlvbi5sYWJlbCA9IGluZm8uc2VsZWN0ZWQubGFiZWw7XG5cdFx0XHRcdGNvbnN0IGtlcm5lbEluZm8gPSBpbmZvLnNlbGVjdGVkLmRlc2NyaXB0aW9uID8/IGluZm8uc2VsZWN0ZWQuZGV0YWlsO1xuXHRcdFx0XHRhY3Rpb24udG9vbHRpcCA9IGtlcm5lbEluZm9cblx0XHRcdFx0XHQ/IGxvY2FsaXplKCdrZXJuZWxzLnNlbGVjdGVkS2VybmVsQW5kS2VybmVsRGV0ZWN0aW9uUnVubmluZycsIFwiU2VsZWN0ZWQgS2VybmVsOiB7MH0gKEtlcm5lbCBEZXRlY3Rpb24gVGFza3MgUnVubmluZylcIiwga2VybmVsSW5mbylcblx0XHRcdFx0XHQ6IGxvY2FsaXplKCdrZXJuZWxzLmRldGVjdGluZycsIFwiRGV0ZWN0aW5nIEtlcm5lbHNcIik7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRhY3Rpb24ubGFiZWwgPSBsb2NhbGl6ZSgna2VybmVscy5kZXRlY3RpbmcnLCBcIkRldGVjdGluZyBLZXJuZWxzXCIpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJ1bm5pbmdBY3Rpb25zID0gbm90ZWJvb2tLZXJuZWxTZXJ2aWNlLmdldFJ1bm5pbmdTb3VyY2VBY3Rpb25zKG5vdGVib29rKTtcblxuXHRcdGNvbnN0IHVwZGF0ZUFjdGlvbkZyb21Tb3VyY2VBY3Rpb24gPSAoc291cmNlQWN0aW9uOiBJU291cmNlQWN0aW9uLCBydW5uaW5nOiBib29sZWFuKSA9PiB7XG5cdFx0XHRjb25zdCBzQWN0aW9uID0gc291cmNlQWN0aW9uLmFjdGlvbjtcblx0XHRcdGFjdGlvbi5jbGFzcyA9IHJ1bm5pbmcgPyBUaGVtZUljb24uYXNDbGFzc05hbWUoVGhlbWVJY29uLm1vZGlmeShleGVjdXRpbmdTdGF0ZUljb24sICdzcGluJykpIDogVGhlbWVJY29uLmFzQ2xhc3NOYW1lKHNlbGVjdEtlcm5lbEljb24pO1xuXHRcdFx0YWN0aW9uLmxhYmVsID0gc0FjdGlvbi5sYWJlbDtcblx0XHRcdGFjdGlvbi5lbmFibGVkID0gdHJ1ZTtcblx0XHR9O1xuXG5cdFx0aWYgKHJ1bm5pbmdBY3Rpb25zLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIHVwZGF0ZUFjdGlvbkZyb21Tb3VyY2VBY3Rpb24ocnVubmluZ0FjdGlvbnNbMF0gLyoqIFRPRE8gaGFuZGxlIG11bHRpcGxlIGFjdGlvbnMgc3RhdGUgKi8sIHRydWUpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHsgc2VsZWN0ZWQgfSA9IG5vdGVib29rS2VybmVsSGlzdG9yeVNlcnZpY2UuZ2V0S2VybmVscyhub3RlYm9vayk7XG5cblx0XHRpZiAoc2VsZWN0ZWQpIHtcblx0XHRcdGFjdGlvbi5sYWJlbCA9IHNlbGVjdGVkLmxhYmVsO1xuXHRcdFx0YWN0aW9uLmNsYXNzID0gVGhlbWVJY29uLmFzQ2xhc3NOYW1lKHNlbGVjdEtlcm5lbEljb24pO1xuXHRcdFx0YWN0aW9uLnRvb2x0aXAgPSBzZWxlY3RlZC5kZXNjcmlwdGlvbiA/PyBzZWxlY3RlZC5kZXRhaWwgPz8gJyc7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGFjdGlvbi5sYWJlbCA9IGxvY2FsaXplKCdzZWxlY3QnLCBcIlNlbGVjdCBLZXJuZWxcIik7XG5cdFx0XHRhY3Rpb24uY2xhc3MgPSBUaGVtZUljb24uYXNDbGFzc05hbWUoc2VsZWN0S2VybmVsSWNvbik7XG5cdFx0XHRhY3Rpb24udG9vbHRpcCA9ICcnO1xuXHRcdH1cblx0fVxuXG5cdHN0YXRpYyBhc3luYyByZXNvbHZlS2VybmVsKG5vdGVib29rOiBJTm90ZWJvb2tUZXh0TW9kZWwsIG5vdGVib29rS2VybmVsU2VydmljZTogSU5vdGVib29rS2VybmVsU2VydmljZSwgbm90ZWJvb2tLZXJuZWxIaXN0b3J5U2VydmljZTogSU5vdGVib29rS2VybmVsSGlzdG9yeVNlcnZpY2UsIGNvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UpOiBQcm9taXNlPElOb3RlYm9va0tlcm5lbCB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IGFscmVhZHlTZWxlY3RlZCA9IG5vdGVib29rS2VybmVsSGlzdG9yeVNlcnZpY2UuZ2V0S2VybmVscyhub3RlYm9vayk7XG5cblx0XHRpZiAoYWxyZWFkeVNlbGVjdGVkLnNlbGVjdGVkKSB7XG5cdFx0XHRyZXR1cm4gYWxyZWFkeVNlbGVjdGVkLnNlbGVjdGVkO1xuXHRcdH1cblxuXHRcdGF3YWl0IGNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKFNFTEVDVF9LRVJORUxfSUQpO1xuXHRcdGNvbnN0IHsgc2VsZWN0ZWQgfSA9IG5vdGVib29rS2VybmVsSGlzdG9yeVNlcnZpY2UuZ2V0S2VybmVscyhub3RlYm9vayk7XG5cdFx0cmV0dXJuIHNlbGVjdGVkO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQU1BLFNBQVMsZUFBZTtBQUN4QixTQUFTLCtCQUErQjtBQUN4QyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsNEJBQTRCO0FBRXJDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsdUJBQXVCO0FBRWhDLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQTRCLDBCQUFzRTtBQUNsRyxTQUFTLGlCQUFpQjtBQUMxQixTQUFxQixtQ0FBbUM7QUFDeEQsU0FBa0Usc0JBQXNCLDhCQUE4QjtBQUV0SCxTQUFTLG9CQUFvQix3QkFBd0I7QUFFckQsU0FBMEIsK0JBQTJELDhCQUE2QztBQUNsSSxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLFdBQVc7QUFDcEIsU0FBUyxzQkFBc0I7QUFFL0IsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxpQkFBaUIseUNBQXlDO0FBQ25FLFNBQVMseUJBQXlCO0FBR2xDLFNBQVMsYUFBYSxNQUEwRDtBQUMvRSxTQUFPLFlBQVk7QUFDcEI7QUFFQSxTQUFTLHFCQUFxQixNQUFrRTtBQUMvRixTQUFPLGFBQWE7QUFDckI7QUFFQSxTQUFTLGFBQWEsTUFBMEQ7QUFDL0UsU0FBTyxZQUFZO0FBQ3BCO0FBRUEsU0FBUyx1QkFBdUIsTUFBb0U7QUFDbkcsU0FBTyxLQUFLLE9BQU8sc0JBQXNCLGtCQUFrQjtBQUM1RDtBQUVBLFNBQVMsd0JBQXdCLE1BQXFFO0FBQ3JHLFNBQU8sS0FBSyxPQUFPO0FBQ3BCO0FBR0EsU0FBUyw0QkFBNEIsTUFBeUQ7QUFDN0Ys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RCxhQUFPLFVBQVU7QUFBQSxJQUNsQjtBQUFBLEVBQ0Q7QUFBQSxFQUVBLGFBQWEsY0FBYyxVQUE4Qix1QkFBK0MsOEJBQTZELGdCQUF1RTtBQUMzTyxVQUFNLGtCQUFrQiw2QkFBNkIsV0FBVyxRQUFRO0FBRXhFLFFBQUksZ0JBQWdCLFVBQVU7QUFDN0IsYUFBTyxnQkFBZ0I7QUFBQSxJQUN4QjtBQUVBLFVBQU0sZUFBZSxlQUFlLGdCQUFnQjtBQUNwRCxVQUFNLEVBQUUsU0FBUyxJQUFJLDZCQUE2QixXQUFXLFFBQVE7QUFDckUsV0FBTztBQUFBLEVBQ1I7QUFDRDtBQWpYYSwwQkFBTjtBQUFBLEVBRUo7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FaVTsiLAogICJuYW1lcyI6IFsibWF0Y2hSZXN1bHQiLCAicXVpY2tQaWNrSXRlbXMiLCAia2VybmVsIiwgImV4dGVuc2lvbiJdCn0K
