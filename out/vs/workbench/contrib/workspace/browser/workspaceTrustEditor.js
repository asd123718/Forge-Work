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
import { $, addDisposableListener, addStandardDisposableListener, append, clearNode, EventHelper, EventType, isAncestorOfActiveElement } from "../../../../base/browser/dom.js";
import { ActionBar } from "../../../../base/browser/ui/actionbar/actionbar.js";
import { ButtonBar } from "../../../../base/browser/ui/button/button.js";
import { InputBox, MessageType } from "../../../../base/browser/ui/inputbox/inputBox.js";
import { DomScrollableElement } from "../../../../base/browser/ui/scrollbar/scrollableElement.js";
import { Action } from "../../../../base/common/actions.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { debounce } from "../../../../base/common/decorators.js";
import { Emitter } from "../../../../base/common/event.js";
import { KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import { normalizeDriveLetter } from "../../../../base/common/labels.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { parseLinkedText } from "../../../../base/common/linkedText.js";
import { Schemas } from "../../../../base/common/network.js";
import { ScrollbarVisibility } from "../../../../base/common/scrollable.js";
import { URI } from "../../../../base/common/uri.js";
import { localize } from "../../../../nls.js";
import { ConfigurationScope, Extensions } from "../../../../platform/configuration/common/configurationRegistry.js";
import { IContextViewService } from "../../../../platform/contextview/browser/contextView.js";
import { IFileDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { WorkbenchTable } from "../../../../platform/list/browser/listService.js";
import { Link } from "../../../../platform/opener/browser/link.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { isVirtualResource, isVirtualWorkspace } from "../../../../platform/workspace/common/virtualWorkspace.js";
import { IStorageService } from "../../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { asCssVariable, buttonBackground, buttonSecondaryBackground, editorErrorForeground } from "../../../../platform/theme/common/colorRegistry.js";
import { IWorkspaceContextService, WorkbenchState } from "../../../../platform/workspace/common/workspace.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { IWorkspaceTrustManagementService } from "../../../../platform/workspace/common/workspaceTrust.js";
import { EditorPane } from "../../../browser/parts/editor/editorPane.js";
import { debugIconStartForeground } from "../../debug/browser/debugColors.js";
import { IExtensionsWorkbenchService, LIST_WORKSPACE_UNSUPPORTED_EXTENSIONS_COMMAND_ID } from "../../extensions/common/extensions.js";
import { APPLICATION_SCOPES, IWorkbenchConfigurationService } from "../../../services/configuration/common/configuration.js";
import { IExtensionManifestPropertiesService } from "../../../services/extensions/common/extensionManifestPropertiesService.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { getExtensionDependencies } from "../../../../platform/extensionManagement/common/extensionManagementUtil.js";
import { EnablementState, IWorkbenchExtensionEnablementService } from "../../../services/extensionManagement/common/extensionManagement.js";
import { posix, win32 } from "../../../../base/common/path.js";
import { hasDriveLetter, toSlashes } from "../../../../base/common/extpath.js";
import { StandardKeyboardEvent } from "../../../../base/browser/keyboardEvent.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { registerIcon } from "../../../../platform/theme/common/iconRegistry.js";
import { defaultButtonStyles, defaultInputBoxStyles } from "../../../../platform/theme/browser/defaultStyles.js";
import { isMacintosh } from "../../../../base/common/platform.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
const shieldIcon = registerIcon("workspace-trust-banner", Codicon.shield, localize("shieldIcon", "Icon for workspace trust ion the banner."));
const checkListIcon = registerIcon("workspace-trust-editor-check", Codicon.check, localize("checkListIcon", "Icon for the checkmark in the workspace trust editor."));
const xListIcon = registerIcon("workspace-trust-editor-cross", Codicon.x, localize("xListIcon", "Icon for the cross in the workspace trust editor."));
const folderPickerIcon = registerIcon("workspace-trust-editor-folder-picker", Codicon.folder, localize("folderPickerIcon", "Icon for the pick folder icon in the workspace trust editor."));
const editIcon = registerIcon("workspace-trust-editor-edit-folder", Codicon.edit, localize("editIcon", "Icon for the edit folder icon in the workspace trust editor."));
const removeIcon = registerIcon("workspace-trust-editor-remove-folder", Codicon.close, localize("removeIcon", "Icon for the remove folder icon in the workspace trust editor."));
let WorkspaceTrustedUrisTable = class extends Disposable {
  constructor(container, instantiationService, workspaceService, workspaceTrustManagementService, uriService, labelService, fileDialogService) {
    super();
    this.container = container;
    this.instantiationService = instantiationService;
    this.workspaceService = workspaceService;
    this.workspaceTrustManagementService = workspaceTrustManagementService;
    this.uriService = uriService;
    this.labelService = labelService;
    this.fileDialogService = fileDialogService;
    this._onDidAcceptEdit = this._register(new Emitter());
    this.onDidAcceptEdit = this._onDidAcceptEdit.event;
    this._onDidRejectEdit = this._register(new Emitter());
    this.onDidRejectEdit = this._onDidRejectEdit.event;
    this._onEdit = this._register(new Emitter());
    this.onEdit = this._onEdit.event;
    this._onDelete = this._register(new Emitter());
    this.onDelete = this._onDelete.event;
    this.descriptionElement = container.appendChild($(".workspace-trusted-folders-description"));
    const tableElement = container.appendChild($(".trusted-uris-table"));
    const addButtonBarElement = container.appendChild($(".trusted-uris-button-bar"));
    this.table = this.instantiationService.createInstance(
      WorkbenchTable,
      "WorkspaceTrust",
      tableElement,
      new TrustedUriTableVirtualDelegate(),
      [
        {
          label: localize("hostColumnLabel", "Host"),
          tooltip: "",
          weight: 1,
          templateId: TrustedUriHostColumnRenderer.TEMPLATE_ID,
          project(row) {
            return row;
          }
        },
        {
          label: localize("pathColumnLabel", "Path"),
          tooltip: "",
          weight: 8,
          templateId: TrustedUriPathColumnRenderer.TEMPLATE_ID,
          project(row) {
            return row;
          }
        },
        {
          label: "",
          tooltip: "",
          weight: 1,
          minimumWidth: 75,
          maximumWidth: 75,
          templateId: TrustedUriActionsColumnRenderer.TEMPLATE_ID,
          project(row) {
            return row;
          }
        }
      ],
      [
        this.instantiationService.createInstance(TrustedUriHostColumnRenderer),
        this.instantiationService.createInstance(TrustedUriPathColumnRenderer, this),
        this.instantiationService.createInstance(TrustedUriActionsColumnRenderer, this, this.currentWorkspaceUri)
      ],
      {
        horizontalScrolling: false,
        alwaysConsumeMouseWheel: false,
        openOnSingleClick: false,
        multipleSelectionSupport: false,
        accessibilityProvider: {
          getAriaLabel: (item) => {
            const hostLabel = getHostLabel(this.labelService, item);
            if (hostLabel === void 0 || hostLabel.length === 0) {
              return localize("trustedFolderAriaLabel", "{0}, trusted", this.labelService.getUriLabel(item.uri));
            }
            return localize("trustedFolderWithHostAriaLabel", "{0} on {1}, trusted", this.labelService.getUriLabel(item.uri), hostLabel);
          },
          getWidgetAriaLabel: () => localize("trustedFoldersAndWorkspaces", "Trusted Folders & Workspaces")
        },
        identityProvider: {
          getId(element) {
            return element.uri.toString();
          }
        }
      }
    );
    this._register(this.table.onDidOpen((item) => {
      if (item && item.element && !item.browserEvent?.defaultPrevented) {
        this.edit(item.element, true);
      }
    }));
    const buttonBar = this._register(new ButtonBar(addButtonBarElement));
    const addButton = this._register(buttonBar.addButton({ title: localize("addButton", "Add Folder"), ...defaultButtonStyles }));
    addButton.label = localize("addButton", "Add Folder");
    this._register(addButton.onDidClick(async () => {
      const uri = await this.fileDialogService.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        defaultUri: this.currentWorkspaceUri,
        openLabel: localize("trustUri", "Trust Folder"),
        title: localize("selectTrustedUri", "Select Folder To Trust")
      });
      if (uri) {
        this.workspaceTrustManagementService.setUrisTrust(uri, true);
      }
    }));
    this._register(this.workspaceTrustManagementService.onDidChangeTrustedFolders(() => {
      this.updateTable();
    }));
  }
  getIndexOfTrustedUriEntry(item) {
    const index = this.trustedUriEntries.indexOf(item);
    if (index === -1) {
      for (let i = 0; i < this.trustedUriEntries.length; i++) {
        if (this.trustedUriEntries[i].uri === item.uri) {
          return i;
        }
      }
    }
    return index;
  }
  selectTrustedUriEntry(item, focus = true) {
    const index = this.getIndexOfTrustedUriEntry(item);
    if (index !== -1) {
      if (focus) {
        this.table.domFocus();
        this.table.setFocus([index]);
      }
      this.table.setSelection([index]);
    }
  }
  get currentWorkspaceUri() {
    return this.workspaceService.getWorkspace().folders[0]?.uri || URI.file("/");
  }
  get trustedUriEntries() {
    const currentWorkspace = this.workspaceService.getWorkspace();
    const currentWorkspaceUris = currentWorkspace.folders.map((folder) => folder.uri);
    if (currentWorkspace.configuration) {
      currentWorkspaceUris.push(currentWorkspace.configuration);
    }
    const entries = this.workspaceTrustManagementService.getTrustedUris().map((uri) => {
      let relatedToCurrentWorkspace = false;
      for (const workspaceUri of currentWorkspaceUris) {
        relatedToCurrentWorkspace = relatedToCurrentWorkspace || this.uriService.extUri.isEqualOrParent(workspaceUri, uri);
      }
      return {
        uri,
        parentOfWorkspaceItem: relatedToCurrentWorkspace
      };
    });
    const sortedEntries = entries.sort((a, b) => {
      if (a.uri.scheme !== b.uri.scheme) {
        if (a.uri.scheme === Schemas.file) {
          return -1;
        }
        if (b.uri.scheme === Schemas.file) {
          return 1;
        }
      }
      const aIsWorkspace = a.uri.path.endsWith(".code-workspace");
      const bIsWorkspace = b.uri.path.endsWith(".code-workspace");
      if (aIsWorkspace !== bIsWorkspace) {
        if (aIsWorkspace) {
          return 1;
        }
        if (bIsWorkspace) {
          return -1;
        }
      }
      return a.uri.fsPath.localeCompare(b.uri.fsPath);
    });
    return sortedEntries;
  }
  layout() {
    this.table.layout(this.trustedUriEntries.length * TrustedUriTableVirtualDelegate.ROW_HEIGHT + TrustedUriTableVirtualDelegate.HEADER_ROW_HEIGHT, void 0);
  }
  updateTable() {
    const entries = this.trustedUriEntries;
    this.container.classList.toggle("empty", entries.length === 0);
    this.descriptionElement.innerText = entries.length ? localize("trustedFoldersDescription", "You trust the following folders, their subfolders, and workspace files.") : localize("noTrustedFoldersDescriptions", "You haven't trusted any folders or workspace files yet.");
    this.table.splice(0, Number.POSITIVE_INFINITY, this.trustedUriEntries);
    this.layout();
  }
  validateUri(path, item) {
    if (!item) {
      return null;
    }
    if (item.uri.scheme === "vscode-vfs") {
      const segments = path.split(posix.sep).filter((s) => s.length);
      if (segments.length === 0 && path.startsWith(posix.sep)) {
        return {
          type: MessageType.WARNING,
          content: localize({ key: "trustAll", comment: ["The {0} will be a host name where repositories are hosted."] }, "You will trust all repositories on {0}.", getHostLabel(this.labelService, item))
        };
      }
      if (segments.length === 1) {
        return {
          type: MessageType.WARNING,
          content: localize({ key: "trustOrg", comment: ["The {0} will be an organization or user name.", "The {1} will be a host name where repositories are hosted."] }, "You will trust all repositories and forks under '{0}' on {1}.", segments[0], getHostLabel(this.labelService, item))
        };
      }
      if (segments.length > 2) {
        return {
          type: MessageType.ERROR,
          content: localize("invalidTrust", "You cannot trust individual folders within a repository.", path)
        };
      }
    }
    return null;
  }
  acceptEdit(item, uri) {
    const trustedFolders = this.workspaceTrustManagementService.getTrustedUris();
    const index = trustedFolders.findIndex((u) => this.uriService.extUri.isEqual(u, item.uri));
    if (index >= trustedFolders.length || index === -1) {
      trustedFolders.push(uri);
    } else {
      trustedFolders[index] = uri;
    }
    this.workspaceTrustManagementService.setTrustedUris(trustedFolders);
    this._onDidAcceptEdit.fire(item);
  }
  rejectEdit(item) {
    this._onDidRejectEdit.fire(item);
  }
  async delete(item) {
    this.table.focusNext();
    await this.workspaceTrustManagementService.setUrisTrust([item.uri], false);
    if (this.table.getFocus().length === 0) {
      this.table.focusLast();
    }
    this._onDelete.fire(item);
    this.table.domFocus();
  }
  async edit(item, usePickerIfPossible) {
    const canUseOpenDialog = item.uri.scheme === Schemas.file || item.uri.scheme === this.currentWorkspaceUri.scheme && this.uriService.extUri.isEqualAuthority(this.currentWorkspaceUri.authority, item.uri.authority) && !isVirtualResource(item.uri);
    if (canUseOpenDialog && usePickerIfPossible) {
      const uri = await this.fileDialogService.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        defaultUri: item.uri,
        openLabel: localize("trustUri", "Trust Folder"),
        title: localize("selectTrustedUri", "Select Folder To Trust")
      });
      if (uri) {
        this.acceptEdit(item, uri[0]);
      } else {
        this.rejectEdit(item);
      }
    } else {
      this.selectTrustedUriEntry(item);
      this._onEdit.fire(item);
    }
  }
};
WorkspaceTrustedUrisTable = __decorateClass([
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, IWorkspaceContextService),
  __decorateParam(3, IWorkspaceTrustManagementService),
  __decorateParam(4, IUriIdentityService),
  __decorateParam(5, ILabelService),
  __decorateParam(6, IFileDialogService)
], WorkspaceTrustedUrisTable);
const _TrustedUriTableVirtualDelegate = class _TrustedUriTableVirtualDelegate {
  constructor() {
    this.headerRowHeight = _TrustedUriTableVirtualDelegate.HEADER_ROW_HEIGHT;
  }
  getHeight(item) {
    return _TrustedUriTableVirtualDelegate.ROW_HEIGHT;
  }
};
_TrustedUriTableVirtualDelegate.HEADER_ROW_HEIGHT = 30;
_TrustedUriTableVirtualDelegate.ROW_HEIGHT = 24;
let TrustedUriTableVirtualDelegate = _TrustedUriTableVirtualDelegate;
let TrustedUriActionsColumnRenderer = class {
  constructor(table, currentWorkspaceUri, uriService) {
    this.table = table;
    this.currentWorkspaceUri = currentWorkspaceUri;
    this.uriService = uriService;
    this.templateId = TrustedUriActionsColumnRenderer.TEMPLATE_ID;
  }
  renderTemplate(container) {
    const element = container.appendChild($(".actions"));
    const actionBar = new ActionBar(element);
    return { actionBar };
  }
  renderElement(item, index, templateData) {
    templateData.actionBar.clear();
    const canUseOpenDialog = item.uri.scheme === Schemas.file || item.uri.scheme === this.currentWorkspaceUri.scheme && this.uriService.extUri.isEqualAuthority(this.currentWorkspaceUri.authority, item.uri.authority) && !isVirtualResource(item.uri);
    const actions = [];
    if (canUseOpenDialog) {
      actions.push(this.createPickerAction(item));
    }
    actions.push(this.createEditAction(item));
    actions.push(this.createDeleteAction(item));
    templateData.actionBar.push(actions, { icon: true });
  }
  createEditAction(item) {
    return {
      label: "",
      class: ThemeIcon.asClassName(editIcon),
      enabled: true,
      id: "editTrustedUri",
      tooltip: localize("editTrustedUri", "Edit Path"),
      run: () => {
        this.table.edit(item, false);
      }
    };
  }
  createPickerAction(item) {
    return {
      label: "",
      class: ThemeIcon.asClassName(folderPickerIcon),
      enabled: true,
      id: "pickerTrustedUri",
      tooltip: localize("pickerTrustedUri", "Open File Picker"),
      run: () => {
        this.table.edit(item, true);
      }
    };
  }
  createDeleteAction(item) {
    return {
      label: "",
      class: ThemeIcon.asClassName(removeIcon),
      enabled: true,
      id: "deleteTrustedUri",
      tooltip: localize("deleteTrustedUri", "Delete Path"),
      run: async () => {
        await this.table.delete(item);
      }
    };
  }
  disposeTemplate(templateData) {
    templateData.actionBar.dispose();
  }
};
TrustedUriActionsColumnRenderer.TEMPLATE_ID = "actions";
TrustedUriActionsColumnRenderer = __decorateClass([
  __decorateParam(2, IUriIdentityService)
], TrustedUriActionsColumnRenderer);
let TrustedUriPathColumnRenderer = class {
  constructor(table, contextViewService) {
    this.table = table;
    this.contextViewService = contextViewService;
    this.templateId = TrustedUriPathColumnRenderer.TEMPLATE_ID;
  }
  renderTemplate(container) {
    const element = container.appendChild($(".path"));
    const pathLabel = element.appendChild($("div.path-label"));
    const pathInput = new InputBox(element, this.contextViewService, {
      validationOptions: {
        validation: (value) => this.table.validateUri(value, this.currentItem)
      },
      inputBoxStyles: defaultInputBoxStyles
    });
    const disposables = new DisposableStore();
    const renderDisposables = disposables.add(new DisposableStore());
    return {
      element,
      pathLabel,
      pathInput,
      disposables,
      renderDisposables
    };
  }
  renderElement(item, index, templateData) {
    templateData.renderDisposables.clear();
    this.currentItem = item;
    templateData.renderDisposables.add(this.table.onEdit(async (e) => {
      if (item === e) {
        templateData.element.classList.add("input-mode");
        templateData.pathInput.focus();
        templateData.pathInput.select();
        templateData.element.parentElement.style.paddingLeft = "0px";
      }
    }));
    templateData.renderDisposables.add(addDisposableListener(templateData.pathInput.element, EventType.DBLCLICK, (e) => {
      EventHelper.stop(e);
    }));
    const hideInputBox = () => {
      templateData.element.classList.remove("input-mode");
      templateData.element.parentElement.style.paddingLeft = "5px";
    };
    const accept = () => {
      hideInputBox();
      const pathToUse = templateData.pathInput.value;
      const uri = hasDriveLetter(pathToUse) ? item.uri.with({ path: posix.sep + toSlashes(pathToUse) }) : item.uri.with({ path: pathToUse });
      templateData.pathLabel.innerText = this.formatPath(uri);
      if (uri) {
        this.table.acceptEdit(item, uri);
      }
    };
    const reject = () => {
      hideInputBox();
      templateData.pathInput.value = stringValue;
      this.table.rejectEdit(item);
    };
    templateData.renderDisposables.add(addStandardDisposableListener(templateData.pathInput.inputElement, EventType.KEY_DOWN, (e) => {
      let handled = false;
      if (e.equals(KeyCode.Enter)) {
        accept();
        handled = true;
      } else if (e.equals(KeyCode.Escape)) {
        reject();
        handled = true;
      }
      if (handled) {
        e.preventDefault();
        e.stopPropagation();
      }
    }));
    templateData.renderDisposables.add(addDisposableListener(templateData.pathInput.inputElement, EventType.BLUR, () => {
      reject();
    }));
    const stringValue = this.formatPath(item.uri);
    templateData.pathInput.value = stringValue;
    templateData.pathLabel.innerText = stringValue;
    templateData.element.classList.toggle("current-workspace-parent", item.parentOfWorkspaceItem);
  }
  disposeTemplate(templateData) {
    templateData.disposables.dispose();
    templateData.renderDisposables.dispose();
  }
  formatPath(uri) {
    if (uri.scheme === Schemas.file) {
      return normalizeDriveLetter(uri.fsPath);
    }
    if (uri.path.startsWith(posix.sep)) {
      const pathWithoutLeadingSeparator = uri.path.substring(1);
      const isWindowsPath = hasDriveLetter(pathWithoutLeadingSeparator, true);
      if (isWindowsPath) {
        return normalizeDriveLetter(win32.normalize(pathWithoutLeadingSeparator), true);
      }
    }
    return uri.path;
  }
};
TrustedUriPathColumnRenderer.TEMPLATE_ID = "path";
TrustedUriPathColumnRenderer = __decorateClass([
  __decorateParam(1, IContextViewService)
], TrustedUriPathColumnRenderer);
function getHostLabel(labelService, item) {
  return item.uri.authority ? labelService.getHostLabel(item.uri.scheme, item.uri.authority) : localize("localAuthority", "Local");
}
let TrustedUriHostColumnRenderer = class {
  constructor(labelService) {
    this.labelService = labelService;
    this.templateId = TrustedUriHostColumnRenderer.TEMPLATE_ID;
  }
  renderTemplate(container) {
    const disposables = new DisposableStore();
    const renderDisposables = disposables.add(new DisposableStore());
    const element = container.appendChild($(".host"));
    const hostContainer = element.appendChild($("div.host-label"));
    const buttonBarContainer = element.appendChild($("div.button-bar"));
    return {
      element,
      hostContainer,
      buttonBarContainer,
      disposables,
      renderDisposables
    };
  }
  renderElement(item, index, templateData) {
    templateData.renderDisposables.clear();
    templateData.renderDisposables.add({ dispose: () => {
      clearNode(templateData.buttonBarContainer);
    } });
    templateData.hostContainer.innerText = getHostLabel(this.labelService, item);
    templateData.element.classList.toggle("current-workspace-parent", item.parentOfWorkspaceItem);
    templateData.hostContainer.style.display = "";
    templateData.buttonBarContainer.style.display = "none";
  }
  disposeTemplate(templateData) {
    templateData.disposables.dispose();
  }
};
TrustedUriHostColumnRenderer.TEMPLATE_ID = "host";
TrustedUriHostColumnRenderer = __decorateClass([
  __decorateParam(0, ILabelService)
], TrustedUriHostColumnRenderer);
let WorkspaceTrustEditor = class extends EditorPane {
  constructor(group, telemetryService, themeService, storageService, workspaceService, extensionWorkbenchService, extensionManifestPropertiesService, instantiationService, workspaceTrustManagementService, configurationService, extensionEnablementService, productService, keybindingService) {
    super(WorkspaceTrustEditor.ID, group, telemetryService, themeService, storageService);
    this.workspaceService = workspaceService;
    this.extensionWorkbenchService = extensionWorkbenchService;
    this.extensionManifestPropertiesService = extensionManifestPropertiesService;
    this.instantiationService = instantiationService;
    this.workspaceTrustManagementService = workspaceTrustManagementService;
    this.configurationService = configurationService;
    this.extensionEnablementService = extensionEnablementService;
    this.productService = productService;
    this.keybindingService = keybindingService;
    this.rendering = false;
    this.rerenderDisposables = this._register(new DisposableStore());
    this.layoutParticipants = [];
  }
  createEditor(parent) {
    this.rootElement = append(parent, $(".workspace-trust-editor", { tabindex: "0" }));
    this.createHeaderElement(this.rootElement);
    const scrollableContent = $(".workspace-trust-editor-body");
    this.bodyScrollBar = this._register(new DomScrollableElement(scrollableContent, {
      horizontal: ScrollbarVisibility.Hidden,
      vertical: ScrollbarVisibility.Auto
    }));
    append(this.rootElement, this.bodyScrollBar.getDomNode());
    this.createAffectedFeaturesElement(scrollableContent);
    this.createConfigurationElement(scrollableContent);
    this.rootElement.style.setProperty("--workspace-trust-selected-color", asCssVariable(buttonBackground));
    this.rootElement.style.setProperty("--workspace-trust-unselected-color", asCssVariable(buttonSecondaryBackground));
    this.rootElement.style.setProperty("--workspace-trust-check-color", asCssVariable(debugIconStartForeground));
    this.rootElement.style.setProperty("--workspace-trust-x-color", asCssVariable(editorErrorForeground));
    this._register(addDisposableListener(this.rootElement, EventType.KEY_DOWN, (e) => {
      const event = new StandardKeyboardEvent(e);
      if (event.equals(KeyCode.UpArrow) || event.equals(KeyCode.DownArrow)) {
        const navOrder = [this.headerContainer, this.trustedContainer, this.untrustedContainer, this.configurationContainer];
        const currentIndex = navOrder.findIndex((element) => {
          return isAncestorOfActiveElement(element);
        });
        let newIndex = currentIndex;
        if (event.equals(KeyCode.DownArrow)) {
          newIndex++;
        } else if (event.equals(KeyCode.UpArrow)) {
          newIndex = Math.max(0, newIndex);
          newIndex--;
        }
        newIndex += navOrder.length;
        newIndex %= navOrder.length;
        navOrder[newIndex].focus();
      } else if (event.equals(KeyCode.Escape)) {
        this.rootElement.focus();
      } else if (event.equals(KeyMod.CtrlCmd | KeyCode.Enter)) {
        if (this.workspaceTrustManagementService.canSetWorkspaceTrust()) {
          this.workspaceTrustManagementService.setWorkspaceTrust(!this.workspaceTrustManagementService.isWorkspaceTrusted());
        }
      }
    }));
  }
  focus() {
    super.focus();
    this.rootElement.focus();
  }
  async setInput(input, options, context, token) {
    await super.setInput(input, options, context, token);
    if (token.isCancellationRequested) {
      return;
    }
    await this.workspaceTrustManagementService.workspaceTrustInitialized;
    this.registerListeners();
    await this.render();
  }
  registerListeners() {
    this._register(this.extensionWorkbenchService.onChange(() => this.render()));
    this._register(this.configurationService.onDidChangeRestrictedSettings(() => this.render()));
    this._register(this.workspaceTrustManagementService.onDidChangeTrust(() => this.render()));
    this._register(this.workspaceTrustManagementService.onDidChangeTrustedFolders(() => this.render()));
  }
  getHeaderContainerClass(trusted) {
    if (trusted) {
      return "workspace-trust-header workspace-trust-trusted";
    }
    return "workspace-trust-header workspace-trust-untrusted";
  }
  getHeaderTitleText(trusted) {
    if (trusted) {
      if (this.workspaceTrustManagementService.isWorkspaceTrustForced()) {
        return localize("trustedUnsettableWindow", "This window is trusted");
      }
      switch (this.workspaceService.getWorkbenchState()) {
        case WorkbenchState.EMPTY:
          return localize("trustedHeaderWindow", "You trust this window");
        case WorkbenchState.FOLDER:
          return localize("trustedHeaderFolder", "You trust this folder");
        case WorkbenchState.WORKSPACE:
          return localize("trustedHeaderWorkspace", "You trust this workspace");
      }
    }
    return localize("untrustedHeader", "You are in Restricted Mode");
  }
  getHeaderTitleIconClassNames(trusted) {
    return ThemeIcon.asClassNameArray(shieldIcon);
  }
  getFeaturesHeaderText(trusted) {
    let title = "";
    let subTitle = "";
    switch (this.workspaceService.getWorkbenchState()) {
      case WorkbenchState.EMPTY: {
        title = trusted ? localize("trustedWindow", "In a Trusted Window") : localize("untrustedWorkspace", "In Restricted Mode");
        subTitle = trusted ? localize("trustedWindowSubtitle", "You trust the authors of the files in the current window. All features are enabled:") : localize("untrustedWindowSubtitle", "You do not trust the authors of the files in the current window. The following features are disabled:");
        break;
      }
      case WorkbenchState.FOLDER: {
        title = trusted ? localize("trustedFolder", "In a Trusted Folder") : localize("untrustedWorkspace", "In Restricted Mode");
        subTitle = trusted ? localize("trustedFolderSubtitle", "You trust the authors of the files in the current folder. All features are enabled:") : localize("untrustedFolderSubtitle", "You do not trust the authors of the files in the current folder. The following features are disabled:");
        break;
      }
      case WorkbenchState.WORKSPACE: {
        title = trusted ? localize("trustedWorkspace", "In a Trusted Workspace") : localize("untrustedWorkspace", "In Restricted Mode");
        subTitle = trusted ? localize("trustedWorkspaceSubtitle", "You trust the authors of the files in the current workspace. All features are enabled:") : localize("untrustedWorkspaceSubtitle", "You do not trust the authors of the files in the current workspace. The following features are disabled:");
        break;
      }
    }
    return [title, subTitle];
  }
  async render() {
    if (this._store.isDisposed) {
      return;
    }
    if (this.rendering) {
      return;
    }
    this.rendering = true;
    this.rerenderDisposables.clear();
    const isWorkspaceTrusted = this.workspaceTrustManagementService.isWorkspaceTrusted();
    this.rootElement.classList.toggle("trusted", isWorkspaceTrusted);
    this.rootElement.classList.toggle("untrusted", !isWorkspaceTrusted);
    this.headerTitleText.innerText = this.getHeaderTitleText(isWorkspaceTrusted);
    this.headerTitleIcon.className = "workspace-trust-title-icon";
    this.headerTitleIcon.classList.add(...this.getHeaderTitleIconClassNames(isWorkspaceTrusted));
    this.headerDescription.innerText = "";
    const headerDescriptionText = append(this.headerDescription, $("div"));
    headerDescriptionText.innerText = isWorkspaceTrusted ? localize("trustedDescription", "All features are enabled because trust has been granted to the workspace.") : localize("untrustedDescription", "{0} is in a restricted mode intended for safe code browsing.", this.productService.nameShort);
    const headerDescriptionActions = append(this.headerDescription, $("div"));
    const headerDescriptionActionsText = localize({ key: "workspaceTrustEditorHeaderActions", comment: ["Please ensure the markdown link syntax is not broken up with whitespace [text block](link block)"] }, "[Configure your settings]({0}) or [learn more](https://aka.ms/vscode-workspace-trust).", `command:workbench.trust.configure`);
    for (const node of parseLinkedText(headerDescriptionActionsText).nodes) {
      if (typeof node === "string") {
        append(headerDescriptionActions, document.createTextNode(node));
      } else {
        this.rerenderDisposables.add(this.instantiationService.createInstance(Link, headerDescriptionActions, { ...node, tabIndex: -1 }, {}));
      }
    }
    this.headerContainer.className = this.getHeaderContainerClass(isWorkspaceTrusted);
    this.rootElement.setAttribute("aria-label", `${localize("root element label", "Manage Workspace Trust")}:  ${this.headerContainer.innerText}`);
    const restrictedSettings = this.configurationService.restrictedSettings;
    const configurationRegistry = Registry.as(Extensions.Configuration);
    const settingsRequiringTrustedWorkspaceCount = restrictedSettings.default.filter((key) => {
      const property = configurationRegistry.getConfigurationProperties()[key];
      if (property.scope && (APPLICATION_SCOPES.includes(property.scope) || property.scope === ConfigurationScope.MACHINE)) {
        return false;
      }
      if (property.deprecationMessage || property.markdownDeprecationMessage) {
        if (restrictedSettings.workspace?.includes(key)) {
          return true;
        }
        if (restrictedSettings.workspaceFolder) {
          for (const workspaceFolderSettings of restrictedSettings.workspaceFolder.values()) {
            if (workspaceFolderSettings.includes(key)) {
              return true;
            }
          }
        }
        return false;
      }
      return true;
    }).length;
    this.renderAffectedFeatures(settingsRequiringTrustedWorkspaceCount, this.getExtensionCount());
    this.workspaceTrustedUrisTable.updateTable();
    this.bodyScrollBar.getDomNode().style.height = `calc(100% - ${this.headerContainer.clientHeight}px)`;
    this.bodyScrollBar.scanDomNode();
    this.rendering = false;
  }
  getExtensionCount() {
    const set = /* @__PURE__ */ new Set();
    const inVirtualWorkspace = isVirtualWorkspace(this.workspaceService.getWorkspace());
    const localExtensions = this.extensionWorkbenchService.local.filter((ext) => ext.local).map((ext) => ext.local);
    for (const extension of localExtensions) {
      const enablementState = this.extensionEnablementService.getEnablementState(extension);
      if (enablementState !== EnablementState.EnabledGlobally && enablementState !== EnablementState.EnabledWorkspace && enablementState !== EnablementState.DisabledByTrustRequirement && enablementState !== EnablementState.DisabledByExtensionDependency) {
        continue;
      }
      if (inVirtualWorkspace && this.extensionManifestPropertiesService.getExtensionVirtualWorkspaceSupportType(extension.manifest) === false) {
        continue;
      }
      if (this.extensionManifestPropertiesService.getExtensionUntrustedWorkspaceSupportType(extension.manifest) !== true) {
        set.add(extension.identifier.id);
        continue;
      }
      const dependencies = getExtensionDependencies(localExtensions, extension);
      if (dependencies.some((ext) => this.extensionManifestPropertiesService.getExtensionUntrustedWorkspaceSupportType(ext.manifest) === false)) {
        set.add(extension.identifier.id);
      }
    }
    return set.size;
  }
  createHeaderElement(parent) {
    this.headerContainer = append(parent, $(".workspace-trust-header", { tabIndex: "0" }));
    this.headerTitleContainer = append(this.headerContainer, $(".workspace-trust-title"));
    this.headerTitleIcon = append(this.headerTitleContainer, $(".workspace-trust-title-icon"));
    this.headerTitleText = append(this.headerTitleContainer, $(".workspace-trust-title-text"));
    this.headerDescription = append(this.headerContainer, $(".workspace-trust-description"));
  }
  createConfigurationElement(parent) {
    this.configurationContainer = append(parent, $(".workspace-trust-settings", { tabIndex: "0" }));
    const configurationTitle = append(this.configurationContainer, $(".workspace-trusted-folders-title"));
    configurationTitle.innerText = localize("trustedFoldersAndWorkspaces", "Trusted Folders & Workspaces");
    this.workspaceTrustedUrisTable = this._register(this.instantiationService.createInstance(WorkspaceTrustedUrisTable, this.configurationContainer));
  }
  createAffectedFeaturesElement(parent) {
    this.affectedFeaturesContainer = append(parent, $(".workspace-trust-features"));
    this.trustedContainer = append(this.affectedFeaturesContainer, $(".workspace-trust-limitations.trusted", { tabIndex: "0" }));
    this.untrustedContainer = append(this.affectedFeaturesContainer, $(".workspace-trust-limitations.untrusted", { tabIndex: "0" }));
  }
  async renderAffectedFeatures(numSettings, numExtensions) {
    clearNode(this.trustedContainer);
    clearNode(this.untrustedContainer);
    const [trustedTitle, trustedSubTitle] = this.getFeaturesHeaderText(true);
    this.renderLimitationsHeaderElement(this.trustedContainer, trustedTitle, trustedSubTitle);
    const trustedContainerItems = this.workspaceService.getWorkbenchState() === WorkbenchState.EMPTY ? [
      localize("trustedTasks", "Tasks are allowed to run"),
      localize("trustedDebugging", "Debugging is enabled"),
      localize("trustedExtensions", "All enabled extensions are activated")
    ] : [
      localize("trustedTasks", "Tasks are allowed to run"),
      localize("trustedDebugging", "Debugging is enabled"),
      localize("trustedSettings", "All workspace settings are applied"),
      localize("trustedExtensions", "All enabled extensions are activated")
    ];
    this.renderLimitationsListElement(this.trustedContainer, trustedContainerItems, ThemeIcon.asClassNameArray(checkListIcon));
    const [untrustedTitle, untrustedSubTitle] = this.getFeaturesHeaderText(false);
    this.renderLimitationsHeaderElement(this.untrustedContainer, untrustedTitle, untrustedSubTitle);
    const untrustedContainerItems = this.workspaceService.getWorkbenchState() === WorkbenchState.EMPTY ? [
      localize("untrustedTasks", "Tasks are not allowed to run"),
      localize("untrustedDebugging", "Debugging is disabled"),
      fixBadLocalizedLinks(localize({ key: "untrustedExtensions", comment: ["Please ensure the markdown link syntax is not broken up with whitespace [text block](link block)"] }, "[{0} extensions]({1}) are disabled or have limited functionality", numExtensions, `command:${LIST_WORKSPACE_UNSUPPORTED_EXTENSIONS_COMMAND_ID}`))
    ] : [
      localize("untrustedTasks", "Tasks are not allowed to run"),
      localize("untrustedDebugging", "Debugging is disabled"),
      fixBadLocalizedLinks(numSettings ? localize({ key: "untrustedSettings", comment: ["Please ensure the markdown link syntax is not broken up with whitespace [text block](link block)"] }, "[{0} workspace settings]({1}) are not applied", numSettings, "command:settings.filterUntrusted") : localize("no untrustedSettings", "Workspace settings requiring trust are not applied")),
      fixBadLocalizedLinks(localize({ key: "untrustedExtensions", comment: ["Please ensure the markdown link syntax is not broken up with whitespace [text block](link block)"] }, "[{0} extensions]({1}) are disabled or have limited functionality", numExtensions, `command:${LIST_WORKSPACE_UNSUPPORTED_EXTENSIONS_COMMAND_ID}`))
    ];
    this.renderLimitationsListElement(this.untrustedContainer, untrustedContainerItems, ThemeIcon.asClassNameArray(xListIcon));
    if (this.workspaceTrustManagementService.isWorkspaceTrusted()) {
      if (this.workspaceTrustManagementService.canSetWorkspaceTrust()) {
        this.addDontTrustButtonToElement(this.untrustedContainer);
      } else {
        this.addTrustedTextToElement(this.untrustedContainer);
      }
    } else {
      if (this.workspaceTrustManagementService.canSetWorkspaceTrust()) {
        this.addTrustButtonToElement(this.trustedContainer);
      }
    }
  }
  createButtonRow(parent, buttonInfo, enabled) {
    const buttonRow = append(parent, $(".workspace-trust-buttons-row"));
    const buttonContainer = append(buttonRow, $(".workspace-trust-buttons"));
    const buttonBar = this.rerenderDisposables.add(new ButtonBar(buttonContainer));
    for (const { action, keybinding } of buttonInfo) {
      const button = buttonBar.addButtonWithDescription(defaultButtonStyles);
      button.label = action.label;
      button.enabled = enabled !== void 0 ? enabled : action.enabled;
      button.description = keybinding.getLabel();
      button.element.ariaLabel = action.label + ", " + localize("keyboardShortcut", "Keyboard Shortcut: {0}", keybinding.getAriaLabel());
      this.rerenderDisposables.add(button.onDidClick((e) => {
        if (e) {
          EventHelper.stop(e, true);
        }
        action.run();
      }));
    }
  }
  addTrustButtonToElement(parent) {
    const trustAction = this.rerenderDisposables.add(new Action("workspace.trust.button.action.grant", localize("trustButton", "Trust"), void 0, true, async () => {
      await this.workspaceTrustManagementService.setWorkspaceTrust(true);
    }));
    const trustActions = [{ action: trustAction, keybinding: this.keybindingService.resolveUserBinding(isMacintosh ? "Cmd+Enter" : "Ctrl+Enter")[0] }];
    this.createButtonRow(parent, trustActions);
  }
  addDontTrustButtonToElement(parent) {
    this.createButtonRow(parent, [{
      action: this.rerenderDisposables.add(new Action("workspace.trust.button.action.deny", localize("dontTrustButton", "Don't Trust"), void 0, true, async () => {
        await this.workspaceTrustManagementService.setWorkspaceTrust(false);
      })),
      keybinding: this.keybindingService.resolveUserBinding(isMacintosh ? "Cmd+Enter" : "Ctrl+Enter")[0]
    }]);
  }
  addTrustedTextToElement(parent) {
    if (this.workspaceService.getWorkbenchState() === WorkbenchState.EMPTY) {
      return;
    }
    const textElement = append(parent, $(".workspace-trust-untrusted-description"));
    if (!this.workspaceTrustManagementService.isWorkspaceTrustForced()) {
      textElement.innerText = this.workspaceService.getWorkbenchState() === WorkbenchState.WORKSPACE ? localize("untrustedWorkspaceReason", "This workspace is trusted via the bolded entries in the trusted folders below.") : localize("untrustedFolderReason", "This folder is trusted via the bolded entries in the trusted folders below.");
    } else {
      textElement.innerText = localize("trustedForcedReason", "This window is trusted by nature of the workspace that is opened.");
    }
  }
  renderLimitationsHeaderElement(parent, headerText, subtitleText) {
    const limitationsHeaderContainer = append(parent, $(".workspace-trust-limitations-header"));
    const titleElement = append(limitationsHeaderContainer, $(".workspace-trust-limitations-title"));
    const textElement = append(titleElement, $(".workspace-trust-limitations-title-text"));
    const subtitleElement = append(limitationsHeaderContainer, $(".workspace-trust-limitations-subtitle"));
    textElement.innerText = headerText;
    subtitleElement.innerText = subtitleText;
  }
  renderLimitationsListElement(parent, limitations, iconClassNames) {
    const listContainer = append(parent, $(".workspace-trust-limitations-list-container"));
    const limitationsList = append(listContainer, $("ul"));
    for (const limitation of limitations) {
      const limitationListItem = append(limitationsList, $("li"));
      const icon = append(limitationListItem, $(".list-item-icon"));
      const text = append(limitationListItem, $(".list-item-text"));
      icon.classList.add(...iconClassNames);
      const linkedText = parseLinkedText(limitation);
      for (const node of linkedText.nodes) {
        if (typeof node === "string") {
          append(text, document.createTextNode(node));
        } else {
          this.rerenderDisposables.add(this.instantiationService.createInstance(Link, text, { ...node, tabIndex: -1 }, {}));
        }
      }
    }
  }
  layout(dimension) {
    if (!this.isVisible()) {
      return;
    }
    this.workspaceTrustedUrisTable.layout();
    this.layoutParticipants.forEach((participant) => {
      participant.layout();
    });
    this.bodyScrollBar.scanDomNode();
  }
};
WorkspaceTrustEditor.ID = "workbench.editor.workspaceTrust";
__decorateClass([
  debounce(100)
], WorkspaceTrustEditor.prototype, "render", 1);
WorkspaceTrustEditor = __decorateClass([
  __decorateParam(1, ITelemetryService),
  __decorateParam(2, IThemeService),
  __decorateParam(3, IStorageService),
  __decorateParam(4, IWorkspaceContextService),
  __decorateParam(5, IExtensionsWorkbenchService),
  __decorateParam(6, IExtensionManifestPropertiesService),
  __decorateParam(7, IInstantiationService),
  __decorateParam(8, IWorkspaceTrustManagementService),
  __decorateParam(9, IWorkbenchConfigurationService),
  __decorateParam(10, IWorkbenchExtensionEnablementService),
  __decorateParam(11, IProductService),
  __decorateParam(12, IKeybindingService)
], WorkspaceTrustEditor);
function fixBadLocalizedLinks(badString) {
  const regex = /(.*)\[(.+)\]\s*\((.+)\)(.*)/;
  return badString.replace(regex, "$1[$2]($3)$4");
}
export {
  WorkspaceTrustEditor,
  shieldIcon
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHdvcmtzcGFjZVxcYnJvd3Nlclxcd29ya3NwYWNlVHJ1c3RFZGl0b3IudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyAkLCBhZGREaXNwb3NhYmxlTGlzdGVuZXIsIGFkZFN0YW5kYXJkRGlzcG9zYWJsZUxpc3RlbmVyLCBhcHBlbmQsIGNsZWFyTm9kZSwgRGltZW5zaW9uLCBFdmVudEhlbHBlciwgRXZlbnRUeXBlLCBpc0FuY2VzdG9yT2ZBY3RpdmVFbGVtZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBBY3Rpb25CYXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYWN0aW9uYmFyL2FjdGlvbmJhci5qcyc7XG5pbXBvcnQgeyBCdXR0b25CYXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYnV0dG9uL2J1dHRvbi5qcyc7XG5pbXBvcnQgeyBJTWVzc2FnZSwgSW5wdXRCb3gsIE1lc3NhZ2VUeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2lucHV0Ym94L2lucHV0Qm94LmpzJztcbmltcG9ydCB7IERvbVNjcm9sbGFibGVFbGVtZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3Njcm9sbGJhci9zY3JvbGxhYmxlRWxlbWVudC5qcyc7XG5pbXBvcnQgeyBJVGFibGVSZW5kZXJlciwgSVRhYmxlVmlydHVhbERlbGVnYXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3RhYmxlL3RhYmxlLmpzJztcbmltcG9ydCB7IEFjdGlvbiwgSUFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IGRlYm91bmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZGVjb3JhdG9ycy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IEtleUNvZGUsIEtleU1vZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IG5vcm1hbGl6ZURyaXZlTGV0dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGFiZWxzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBwYXJzZUxpbmtlZFRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saW5rZWRUZXh0LmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IFNjcm9sbGJhclZpc2liaWxpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zY3JvbGxhYmxlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBDb25maWd1cmF0aW9uU2NvcGUsIEV4dGVuc2lvbnMsIElDb25maWd1cmF0aW9uUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRWaWV3U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dFZpZXcuanMnO1xuaW1wb3J0IHsgSUZpbGVEaWFsb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGlhbG9ncy9jb21tb24vZGlhbG9ncy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElMYWJlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sYWJlbC9jb21tb24vbGFiZWwuanMnO1xuaW1wb3J0IHsgV29ya2JlbmNoVGFibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9saXN0L2Jyb3dzZXIvbGlzdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgTGluayB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL29wZW5lci9icm93c2VyL2xpbmsuanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgaXNWaXJ0dWFsUmVzb3VyY2UsIGlzVmlydHVhbFdvcmtzcGFjZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vdmlydHVhbFdvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgYXNDc3NWYXJpYWJsZSwgYnV0dG9uQmFja2dyb3VuZCwgYnV0dG9uU2Vjb25kYXJ5QmFja2dyb3VuZCwgZWRpdG9yRXJyb3JGb3JlZ3JvdW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2NvbG9yUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLCBXb3JrYmVuY2hTdGF0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IElUaGVtZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlVHJ1c3QuanMnO1xuaW1wb3J0IHsgRWRpdG9yUGFuZSB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvcGFydHMvZWRpdG9yL2VkaXRvclBhbmUuanMnO1xuaW1wb3J0IHsgSUVkaXRvck9wZW5Db250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBkZWJ1Z0ljb25TdGFydEZvcmVncm91bmQgfSBmcm9tICcuLi8uLi9kZWJ1Zy9icm93c2VyL2RlYnVnQ29sb3JzLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSwgTElTVF9XT1JLU1BBQ0VfVU5TVVBQT1JURURfRVhURU5TSU9OU19DT01NQU5EX0lEIH0gZnJvbSAnLi4vLi4vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBBUFBMSUNBVElPTl9TQ09QRVMsIElXb3JrYmVuY2hDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvbk1hbmlmZXN0UHJvcGVydGllc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25NYW5pZmVzdFByb3BlcnRpZXNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElVcmlJZGVudGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91cmlJZGVudGl0eS9jb21tb24vdXJpSWRlbnRpdHkuanMnO1xuaW1wb3J0IHsgV29ya3NwYWNlVHJ1c3RFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3dvcmtzcGFjZXMvYnJvd3Nlci93b3Jrc3BhY2VUcnVzdEVkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IElFZGl0b3JPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZWRpdG9yL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgZ2V0RXh0ZW5zaW9uRGVwZW5kZW5jaWVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9uTWFuYWdlbWVudC9jb21tb24vZXh0ZW5zaW9uTWFuYWdlbWVudFV0aWwuanMnO1xuaW1wb3J0IHsgRW5hYmxlbWVudFN0YXRlLCBJV29ya2JlbmNoRXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25NYW5hZ2VtZW50L2NvbW1vbi9leHRlbnNpb25NYW5hZ2VtZW50LmpzJztcbmltcG9ydCB7IHBvc2l4LCB3aW4zMiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuaW1wb3J0IHsgaGFzRHJpdmVMZXR0ZXIsIHRvU2xhc2hlcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V4dHBhdGguanMnO1xuaW1wb3J0IHsgU3RhbmRhcmRLZXlib2FyZEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2tleWJvYXJkRXZlbnQuanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgcmVnaXN0ZXJJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2ljb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBkZWZhdWx0QnV0dG9uU3R5bGVzLCBkZWZhdWx0SW5wdXRCb3hTdHlsZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9icm93c2VyL2RlZmF1bHRTdHlsZXMuanMnO1xuaW1wb3J0IHsgaXNNYWNpbnRvc2ggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBJS2V5YmluZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nLmpzJztcbmltcG9ydCB7IFJlc29sdmVkS2V5YmluZGluZyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleWJpbmRpbmdzLmpzJztcbmltcG9ydCB7IElFZGl0b3JHcm91cCB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yR3JvdXBzU2VydmljZS5qcyc7XG5cbmV4cG9ydCBjb25zdCBzaGllbGRJY29uID0gcmVnaXN0ZXJJY29uKCd3b3Jrc3BhY2UtdHJ1c3QtYmFubmVyJywgQ29kaWNvbi5zaGllbGQsIGxvY2FsaXplKCdzaGllbGRJY29uJywgJ0ljb24gZm9yIHdvcmtzcGFjZSB0cnVzdCBpb24gdGhlIGJhbm5lci4nKSk7XG5cbmNvbnN0IGNoZWNrTGlzdEljb24gPSByZWdpc3Rlckljb24oJ3dvcmtzcGFjZS10cnVzdC1lZGl0b3ItY2hlY2snLCBDb2RpY29uLmNoZWNrLCBsb2NhbGl6ZSgnY2hlY2tMaXN0SWNvbicsICdJY29uIGZvciB0aGUgY2hlY2ttYXJrIGluIHRoZSB3b3Jrc3BhY2UgdHJ1c3QgZWRpdG9yLicpKTtcbmNvbnN0IHhMaXN0SWNvbiA9IHJlZ2lzdGVySWNvbignd29ya3NwYWNlLXRydXN0LWVkaXRvci1jcm9zcycsIENvZGljb24ueCwgbG9jYWxpemUoJ3hMaXN0SWNvbicsICdJY29uIGZvciB0aGUgY3Jvc3MgaW4gdGhlIHdvcmtzcGFjZSB0cnVzdCBlZGl0b3IuJykpO1xuY29uc3QgZm9sZGVyUGlja2VySWNvbiA9IHJlZ2lzdGVySWNvbignd29ya3NwYWNlLXRydXN0LWVkaXRvci1mb2xkZXItcGlja2VyJywgQ29kaWNvbi5mb2xkZXIsIGxvY2FsaXplKCdmb2xkZXJQaWNrZXJJY29uJywgJ0ljb24gZm9yIHRoZSBwaWNrIGZvbGRlciBpY29uIGluIHRoZSB3b3Jrc3BhY2UgdHJ1c3QgZWRpdG9yLicpKTtcbmNvbnN0IGVkaXRJY29uID0gcmVnaXN0ZXJJY29uKCd3b3Jrc3BhY2UtdHJ1c3QtZWRpdG9yLWVkaXQtZm9sZGVyJywgQ29kaWNvbi5lZGl0LCBsb2NhbGl6ZSgnZWRpdEljb24nLCAnSWNvbiBmb3IgdGhlIGVkaXQgZm9sZGVyIGljb24gaW4gdGhlIHdvcmtzcGFjZSB0cnVzdCBlZGl0b3IuJykpO1xuY29uc3QgcmVtb3ZlSWNvbiA9IHJlZ2lzdGVySWNvbignd29ya3NwYWNlLXRydXN0LWVkaXRvci1yZW1vdmUtZm9sZGVyJywgQ29kaWNvbi5jbG9zZSwgbG9jYWxpemUoJ3JlbW92ZUljb24nLCAnSWNvbiBmb3IgdGhlIHJlbW92ZSBmb2xkZXIgaWNvbiBpbiB0aGUgd29ya3NwYWNlIHRydXN0IGVkaXRvci4nKSk7XG5cbmludGVyZmFjZSBJVHJ1c3RlZFVyaUl0ZW0ge1xuXHRwYXJlbnRPZldvcmtzcGFjZUl0ZW06IGJvb2xlYW47XG5cdHVyaTogVVJJO1xufVxuXG5jbGFzcyBXb3Jrc3BhY2VUcnVzdGVkVXJpc1RhYmxlIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQWNjZXB0RWRpdDogRW1pdHRlcjxJVHJ1c3RlZFVyaUl0ZW0+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVRydXN0ZWRVcmlJdGVtPigpKTtcblx0cmVhZG9ubHkgb25EaWRBY2NlcHRFZGl0OiBFdmVudDxJVHJ1c3RlZFVyaUl0ZW0+ID0gdGhpcy5fb25EaWRBY2NlcHRFZGl0LmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkUmVqZWN0RWRpdDogRW1pdHRlcjxJVHJ1c3RlZFVyaUl0ZW0+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVRydXN0ZWRVcmlJdGVtPigpKTtcblx0cmVhZG9ubHkgb25EaWRSZWplY3RFZGl0OiBFdmVudDxJVHJ1c3RlZFVyaUl0ZW0+ID0gdGhpcy5fb25EaWRSZWplY3RFZGl0LmV2ZW50O1xuXG5cdHByaXZhdGUgX29uRWRpdDogRW1pdHRlcjxJVHJ1c3RlZFVyaUl0ZW0+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVRydXN0ZWRVcmlJdGVtPigpKTtcblx0cmVhZG9ubHkgb25FZGl0OiBFdmVudDxJVHJ1c3RlZFVyaUl0ZW0+ID0gdGhpcy5fb25FZGl0LmV2ZW50O1xuXG5cdHByaXZhdGUgX29uRGVsZXRlOiBFbWl0dGVyPElUcnVzdGVkVXJpSXRlbT4gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJVHJ1c3RlZFVyaUl0ZW0+KCkpO1xuXHRyZWFkb25seSBvbkRlbGV0ZTogRXZlbnQ8SVRydXN0ZWRVcmlJdGVtPiA9IHRoaXMuX29uRGVsZXRlLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgdGFibGU6IFdvcmtiZW5jaFRhYmxlPElUcnVzdGVkVXJpSXRlbT47XG5cblx0cHJpdmF0ZSByZWFkb25seSBkZXNjcmlwdGlvbkVsZW1lbnQ6IEhUTUxFbGVtZW50O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgY29udGFpbmVyOiBIVE1MRWxlbWVudCxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgd29ya3NwYWNlU2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2U6IElXb3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlLFxuXHRcdEBJVXJpSWRlbnRpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXJpU2VydmljZTogSVVyaUlkZW50aXR5U2VydmljZSxcblx0XHRASUxhYmVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxhYmVsU2VydmljZTogSUxhYmVsU2VydmljZSxcblx0XHRASUZpbGVEaWFsb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZmlsZURpYWxvZ1NlcnZpY2U6IElGaWxlRGlhbG9nU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5kZXNjcmlwdGlvbkVsZW1lbnQgPSBjb250YWluZXIuYXBwZW5kQ2hpbGQoJCgnLndvcmtzcGFjZS10cnVzdGVkLWZvbGRlcnMtZGVzY3JpcHRpb24nKSk7XG5cdFx0Y29uc3QgdGFibGVFbGVtZW50ID0gY29udGFpbmVyLmFwcGVuZENoaWxkKCQoJy50cnVzdGVkLXVyaXMtdGFibGUnKSk7XG5cdFx0Y29uc3QgYWRkQnV0dG9uQmFyRWxlbWVudCA9IGNvbnRhaW5lci5hcHBlbmRDaGlsZCgkKCcudHJ1c3RlZC11cmlzLWJ1dHRvbi1iYXInKSk7XG5cblx0XHR0aGlzLnRhYmxlID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFdvcmtiZW5jaFRhYmxlLFxuXHRcdFx0J1dvcmtzcGFjZVRydXN0Jyxcblx0XHRcdHRhYmxlRWxlbWVudCxcblx0XHRcdG5ldyBUcnVzdGVkVXJpVGFibGVWaXJ0dWFsRGVsZWdhdGUoKSxcblx0XHRcdFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnaG9zdENvbHVtbkxhYmVsJywgXCJIb3N0XCIpLFxuXHRcdFx0XHRcdHRvb2x0aXA6ICcnLFxuXHRcdFx0XHRcdHdlaWdodDogMSxcblx0XHRcdFx0XHR0ZW1wbGF0ZUlkOiBUcnVzdGVkVXJpSG9zdENvbHVtblJlbmRlcmVyLlRFTVBMQVRFX0lELFxuXHRcdFx0XHRcdHByb2plY3Qocm93OiBJVHJ1c3RlZFVyaUl0ZW0pOiBJVHJ1c3RlZFVyaUl0ZW0geyByZXR1cm4gcm93OyB9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ3BhdGhDb2x1bW5MYWJlbCcsIFwiUGF0aFwiKSxcblx0XHRcdFx0XHR0b29sdGlwOiAnJyxcblx0XHRcdFx0XHR3ZWlnaHQ6IDgsXG5cdFx0XHRcdFx0dGVtcGxhdGVJZDogVHJ1c3RlZFVyaVBhdGhDb2x1bW5SZW5kZXJlci5URU1QTEFURV9JRCxcblx0XHRcdFx0XHRwcm9qZWN0KHJvdzogSVRydXN0ZWRVcmlJdGVtKTogSVRydXN0ZWRVcmlJdGVtIHsgcmV0dXJuIHJvdzsgfVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0bGFiZWw6ICcnLFxuXHRcdFx0XHRcdHRvb2x0aXA6ICcnLFxuXHRcdFx0XHRcdHdlaWdodDogMSxcblx0XHRcdFx0XHRtaW5pbXVtV2lkdGg6IDc1LFxuXHRcdFx0XHRcdG1heGltdW1XaWR0aDogNzUsXG5cdFx0XHRcdFx0dGVtcGxhdGVJZDogVHJ1c3RlZFVyaUFjdGlvbnNDb2x1bW5SZW5kZXJlci5URU1QTEFURV9JRCxcblx0XHRcdFx0XHRwcm9qZWN0KHJvdzogSVRydXN0ZWRVcmlJdGVtKTogSVRydXN0ZWRVcmlJdGVtIHsgcmV0dXJuIHJvdzsgfVxuXHRcdFx0XHR9LFxuXHRcdFx0XSxcblx0XHRcdFtcblx0XHRcdFx0dGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUcnVzdGVkVXJpSG9zdENvbHVtblJlbmRlcmVyKSxcblx0XHRcdFx0dGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUcnVzdGVkVXJpUGF0aENvbHVtblJlbmRlcmVyLCB0aGlzKSxcblx0XHRcdFx0dGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUcnVzdGVkVXJpQWN0aW9uc0NvbHVtblJlbmRlcmVyLCB0aGlzLCB0aGlzLmN1cnJlbnRXb3Jrc3BhY2VVcmkpLFxuXHRcdFx0XSxcblx0XHRcdHtcblx0XHRcdFx0aG9yaXpvbnRhbFNjcm9sbGluZzogZmFsc2UsXG5cdFx0XHRcdGFsd2F5c0NvbnN1bWVNb3VzZVdoZWVsOiBmYWxzZSxcblx0XHRcdFx0b3Blbk9uU2luZ2xlQ2xpY2s6IGZhbHNlLFxuXHRcdFx0XHRtdWx0aXBsZVNlbGVjdGlvblN1cHBvcnQ6IGZhbHNlLFxuXHRcdFx0XHRhY2Nlc3NpYmlsaXR5UHJvdmlkZXI6IHtcblx0XHRcdFx0XHRnZXRBcmlhTGFiZWw6IChpdGVtOiBJVHJ1c3RlZFVyaUl0ZW0pID0+IHtcblx0XHRcdFx0XHRcdGNvbnN0IGhvc3RMYWJlbCA9IGdldEhvc3RMYWJlbCh0aGlzLmxhYmVsU2VydmljZSwgaXRlbSk7XG5cdFx0XHRcdFx0XHRpZiAoaG9zdExhYmVsID09PSB1bmRlZmluZWQgfHwgaG9zdExhYmVsLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gbG9jYWxpemUoJ3RydXN0ZWRGb2xkZXJBcmlhTGFiZWwnLCBcInswfSwgdHJ1c3RlZFwiLCB0aGlzLmxhYmVsU2VydmljZS5nZXRVcmlMYWJlbChpdGVtLnVyaSkpO1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRyZXR1cm4gbG9jYWxpemUoJ3RydXN0ZWRGb2xkZXJXaXRoSG9zdEFyaWFMYWJlbCcsIFwiezB9IG9uIHsxfSwgdHJ1c3RlZFwiLCB0aGlzLmxhYmVsU2VydmljZS5nZXRVcmlMYWJlbChpdGVtLnVyaSksIGhvc3RMYWJlbCk7XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRnZXRXaWRnZXRBcmlhTGFiZWw6ICgpID0+IGxvY2FsaXplKCd0cnVzdGVkRm9sZGVyc0FuZFdvcmtzcGFjZXMnLCBcIlRydXN0ZWQgRm9sZGVycyAmIFdvcmtzcGFjZXNcIilcblx0XHRcdFx0fSxcblx0XHRcdFx0aWRlbnRpdHlQcm92aWRlcjoge1xuXHRcdFx0XHRcdGdldElkKGVsZW1lbnQ6IElUcnVzdGVkVXJpSXRlbSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIGVsZW1lbnQudXJpLnRvU3RyaW5nKCk7XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdCkgYXMgV29ya2JlbmNoVGFibGU8SVRydXN0ZWRVcmlJdGVtPjtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudGFibGUub25EaWRPcGVuKGl0ZW0gPT4ge1xuXHRcdFx0Ly8gZGVmYXVsdCBwcmV2ZW50ZWQgd2hlbiBpbnB1dCBib3ggaXMgZG91YmxlIGNsaWNrZWQgIzEyNTA1MlxuXHRcdFx0aWYgKGl0ZW0gJiYgaXRlbS5lbGVtZW50ICYmICFpdGVtLmJyb3dzZXJFdmVudD8uZGVmYXVsdFByZXZlbnRlZCkge1xuXHRcdFx0XHR0aGlzLmVkaXQoaXRlbS5lbGVtZW50LCB0cnVlKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRjb25zdCBidXR0b25CYXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgQnV0dG9uQmFyKGFkZEJ1dHRvbkJhckVsZW1lbnQpKTtcblx0XHRjb25zdCBhZGRCdXR0b24gPSB0aGlzLl9yZWdpc3RlcihidXR0b25CYXIuYWRkQnV0dG9uKHsgdGl0bGU6IGxvY2FsaXplKCdhZGRCdXR0b24nLCBcIkFkZCBGb2xkZXJcIiksIC4uLmRlZmF1bHRCdXR0b25TdHlsZXMgfSkpO1xuXHRcdGFkZEJ1dHRvbi5sYWJlbCA9IGxvY2FsaXplKCdhZGRCdXR0b24nLCBcIkFkZCBGb2xkZXJcIik7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihhZGRCdXR0b24ub25EaWRDbGljayhhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB1cmkgPSBhd2FpdCB0aGlzLmZpbGVEaWFsb2dTZXJ2aWNlLnNob3dPcGVuRGlhbG9nKHtcblx0XHRcdFx0Y2FuU2VsZWN0RmlsZXM6IGZhbHNlLFxuXHRcdFx0XHRjYW5TZWxlY3RGb2xkZXJzOiB0cnVlLFxuXHRcdFx0XHRjYW5TZWxlY3RNYW55OiBmYWxzZSxcblx0XHRcdFx0ZGVmYXVsdFVyaTogdGhpcy5jdXJyZW50V29ya3NwYWNlVXJpLFxuXHRcdFx0XHRvcGVuTGFiZWw6IGxvY2FsaXplKCd0cnVzdFVyaScsIFwiVHJ1c3QgRm9sZGVyXCIpLFxuXHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ3NlbGVjdFRydXN0ZWRVcmknLCBcIlNlbGVjdCBGb2xkZXIgVG8gVHJ1c3RcIilcblx0XHRcdH0pO1xuXG5cdFx0XHRpZiAodXJpKSB7XG5cdFx0XHRcdHRoaXMud29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZS5zZXRVcmlzVHJ1c3QodXJpLCB0cnVlKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLndvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2Uub25EaWRDaGFuZ2VUcnVzdGVkRm9sZGVycygoKSA9PiB7XG5cdFx0XHR0aGlzLnVwZGF0ZVRhYmxlKCk7XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRJbmRleE9mVHJ1c3RlZFVyaUVudHJ5KGl0ZW06IElUcnVzdGVkVXJpSXRlbSk6IG51bWJlciB7XG5cdFx0Y29uc3QgaW5kZXggPSB0aGlzLnRydXN0ZWRVcmlFbnRyaWVzLmluZGV4T2YoaXRlbSk7XG5cdFx0aWYgKGluZGV4ID09PSAtMSkge1xuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLnRydXN0ZWRVcmlFbnRyaWVzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdGlmICh0aGlzLnRydXN0ZWRVcmlFbnRyaWVzW2ldLnVyaSA9PT0gaXRlbS51cmkpIHtcblx0XHRcdFx0XHRyZXR1cm4gaTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBpbmRleDtcblx0fVxuXG5cdHByaXZhdGUgc2VsZWN0VHJ1c3RlZFVyaUVudHJ5KGl0ZW06IElUcnVzdGVkVXJpSXRlbSwgZm9jdXM6IGJvb2xlYW4gPSB0cnVlKTogdm9pZCB7XG5cdFx0Y29uc3QgaW5kZXggPSB0aGlzLmdldEluZGV4T2ZUcnVzdGVkVXJpRW50cnkoaXRlbSk7XG5cdFx0aWYgKGluZGV4ICE9PSAtMSkge1xuXHRcdFx0aWYgKGZvY3VzKSB7XG5cdFx0XHRcdHRoaXMudGFibGUuZG9tRm9jdXMoKTtcblx0XHRcdFx0dGhpcy50YWJsZS5zZXRGb2N1cyhbaW5kZXhdKTtcblx0XHRcdH1cblx0XHRcdHRoaXMudGFibGUuc2V0U2VsZWN0aW9uKFtpbmRleF0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZ2V0IGN1cnJlbnRXb3Jrc3BhY2VVcmkoKTogVVJJIHtcblx0XHRyZXR1cm4gdGhpcy53b3Jrc3BhY2VTZXJ2aWNlLmdldFdvcmtzcGFjZSgpLmZvbGRlcnNbMF0/LnVyaSB8fCBVUkkuZmlsZSgnLycpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXQgdHJ1c3RlZFVyaUVudHJpZXMoKTogSVRydXN0ZWRVcmlJdGVtW10ge1xuXHRcdGNvbnN0IGN1cnJlbnRXb3Jrc3BhY2UgPSB0aGlzLndvcmtzcGFjZVNlcnZpY2UuZ2V0V29ya3NwYWNlKCk7XG5cdFx0Y29uc3QgY3VycmVudFdvcmtzcGFjZVVyaXMgPSBjdXJyZW50V29ya3NwYWNlLmZvbGRlcnMubWFwKGZvbGRlciA9PiBmb2xkZXIudXJpKTtcblx0XHRpZiAoY3VycmVudFdvcmtzcGFjZS5jb25maWd1cmF0aW9uKSB7XG5cdFx0XHRjdXJyZW50V29ya3NwYWNlVXJpcy5wdXNoKGN1cnJlbnRXb3Jrc3BhY2UuY29uZmlndXJhdGlvbik7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZW50cmllcyA9IHRoaXMud29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZS5nZXRUcnVzdGVkVXJpcygpLm1hcCh1cmkgPT4ge1xuXG5cdFx0XHRsZXQgcmVsYXRlZFRvQ3VycmVudFdvcmtzcGFjZSA9IGZhbHNlO1xuXHRcdFx0Zm9yIChjb25zdCB3b3Jrc3BhY2VVcmkgb2YgY3VycmVudFdvcmtzcGFjZVVyaXMpIHtcblx0XHRcdFx0cmVsYXRlZFRvQ3VycmVudFdvcmtzcGFjZSA9IHJlbGF0ZWRUb0N1cnJlbnRXb3Jrc3BhY2UgfHwgdGhpcy51cmlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsT3JQYXJlbnQod29ya3NwYWNlVXJpLCB1cmkpO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHR1cmksXG5cdFx0XHRcdHBhcmVudE9mV29ya3NwYWNlSXRlbTogcmVsYXRlZFRvQ3VycmVudFdvcmtzcGFjZVxuXHRcdFx0fTtcblx0XHR9KTtcblxuXHRcdC8vIFNvcnQgZW50cmllc1xuXHRcdGNvbnN0IHNvcnRlZEVudHJpZXMgPSBlbnRyaWVzLnNvcnQoKGEsIGIpID0+IHtcblx0XHRcdGlmIChhLnVyaS5zY2hlbWUgIT09IGIudXJpLnNjaGVtZSkge1xuXHRcdFx0XHRpZiAoYS51cmkuc2NoZW1lID09PSBTY2hlbWFzLmZpbGUpIHtcblx0XHRcdFx0XHRyZXR1cm4gLTE7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoYi51cmkuc2NoZW1lID09PSBTY2hlbWFzLmZpbGUpIHtcblx0XHRcdFx0XHRyZXR1cm4gMTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBhSXNXb3Jrc3BhY2UgPSBhLnVyaS5wYXRoLmVuZHNXaXRoKCcuY29kZS13b3Jrc3BhY2UnKTtcblx0XHRcdGNvbnN0IGJJc1dvcmtzcGFjZSA9IGIudXJpLnBhdGguZW5kc1dpdGgoJy5jb2RlLXdvcmtzcGFjZScpO1xuXG5cdFx0XHRpZiAoYUlzV29ya3NwYWNlICE9PSBiSXNXb3Jrc3BhY2UpIHtcblx0XHRcdFx0aWYgKGFJc1dvcmtzcGFjZSkge1xuXHRcdFx0XHRcdHJldHVybiAxO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKGJJc1dvcmtzcGFjZSkge1xuXHRcdFx0XHRcdHJldHVybiAtMTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gYS51cmkuZnNQYXRoLmxvY2FsZUNvbXBhcmUoYi51cmkuZnNQYXRoKTtcblx0XHR9KTtcblxuXHRcdHJldHVybiBzb3J0ZWRFbnRyaWVzO1xuXHR9XG5cblx0bGF5b3V0KCk6IHZvaWQge1xuXHRcdHRoaXMudGFibGUubGF5b3V0KCh0aGlzLnRydXN0ZWRVcmlFbnRyaWVzLmxlbmd0aCAqIFRydXN0ZWRVcmlUYWJsZVZpcnR1YWxEZWxlZ2F0ZS5ST1dfSEVJR0hUKSArIFRydXN0ZWRVcmlUYWJsZVZpcnR1YWxEZWxlZ2F0ZS5IRUFERVJfUk9XX0hFSUdIVCwgdW5kZWZpbmVkKTtcblx0fVxuXG5cdHVwZGF0ZVRhYmxlKCk6IHZvaWQge1xuXHRcdGNvbnN0IGVudHJpZXMgPSB0aGlzLnRydXN0ZWRVcmlFbnRyaWVzO1xuXHRcdHRoaXMuY29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ2VtcHR5JywgZW50cmllcy5sZW5ndGggPT09IDApO1xuXG5cdFx0dGhpcy5kZXNjcmlwdGlvbkVsZW1lbnQuaW5uZXJUZXh0ID0gZW50cmllcy5sZW5ndGggP1xuXHRcdFx0bG9jYWxpemUoJ3RydXN0ZWRGb2xkZXJzRGVzY3JpcHRpb24nLCBcIllvdSB0cnVzdCB0aGUgZm9sbG93aW5nIGZvbGRlcnMsIHRoZWlyIHN1YmZvbGRlcnMsIGFuZCB3b3Jrc3BhY2UgZmlsZXMuXCIpIDpcblx0XHRcdGxvY2FsaXplKCdub1RydXN0ZWRGb2xkZXJzRGVzY3JpcHRpb25zJywgXCJZb3UgaGF2ZW4ndCB0cnVzdGVkIGFueSBmb2xkZXJzIG9yIHdvcmtzcGFjZSBmaWxlcyB5ZXQuXCIpO1xuXG5cdFx0dGhpcy50YWJsZS5zcGxpY2UoMCwgTnVtYmVyLlBPU0lUSVZFX0lORklOSVRZLCB0aGlzLnRydXN0ZWRVcmlFbnRyaWVzKTtcblx0XHR0aGlzLmxheW91dCgpO1xuXHR9XG5cblx0dmFsaWRhdGVVcmkocGF0aDogc3RyaW5nLCBpdGVtPzogSVRydXN0ZWRVcmlJdGVtKTogSU1lc3NhZ2UgfCBudWxsIHtcblx0XHRpZiAoIWl0ZW0pIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdGlmIChpdGVtLnVyaS5zY2hlbWUgPT09ICd2c2NvZGUtdmZzJykge1xuXHRcdFx0Y29uc3Qgc2VnbWVudHMgPSBwYXRoLnNwbGl0KHBvc2l4LnNlcCkuZmlsdGVyKHMgPT4gcy5sZW5ndGgpO1xuXHRcdFx0aWYgKHNlZ21lbnRzLmxlbmd0aCA9PT0gMCAmJiBwYXRoLnN0YXJ0c1dpdGgocG9zaXguc2VwKSkge1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdHR5cGU6IE1lc3NhZ2VUeXBlLldBUk5JTkcsXG5cdFx0XHRcdFx0Y29udGVudDogbG9jYWxpemUoeyBrZXk6ICd0cnVzdEFsbCcsIGNvbW1lbnQ6IFsnVGhlIHswfSB3aWxsIGJlIGEgaG9zdCBuYW1lIHdoZXJlIHJlcG9zaXRvcmllcyBhcmUgaG9zdGVkLiddIH0sIFwiWW91IHdpbGwgdHJ1c3QgYWxsIHJlcG9zaXRvcmllcyBvbiB7MH0uXCIsIGdldEhvc3RMYWJlbCh0aGlzLmxhYmVsU2VydmljZSwgaXRlbSkpXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cblx0XHRcdGlmIChzZWdtZW50cy5sZW5ndGggPT09IDEpIHtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHR0eXBlOiBNZXNzYWdlVHlwZS5XQVJOSU5HLFxuXHRcdFx0XHRcdGNvbnRlbnQ6IGxvY2FsaXplKHsga2V5OiAndHJ1c3RPcmcnLCBjb21tZW50OiBbJ1RoZSB7MH0gd2lsbCBiZSBhbiBvcmdhbml6YXRpb24gb3IgdXNlciBuYW1lLicsICdUaGUgezF9IHdpbGwgYmUgYSBob3N0IG5hbWUgd2hlcmUgcmVwb3NpdG9yaWVzIGFyZSBob3N0ZWQuJ10gfSwgXCJZb3Ugd2lsbCB0cnVzdCBhbGwgcmVwb3NpdG9yaWVzIGFuZCBmb3JrcyB1bmRlciAnezB9JyBvbiB7MX0uXCIsIHNlZ21lbnRzWzBdLCBnZXRIb3N0TGFiZWwodGhpcy5sYWJlbFNlcnZpY2UsIGl0ZW0pKVxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoc2VnbWVudHMubGVuZ3RoID4gMikge1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdHR5cGU6IE1lc3NhZ2VUeXBlLkVSUk9SLFxuXHRcdFx0XHRcdGNvbnRlbnQ6IGxvY2FsaXplKCdpbnZhbGlkVHJ1c3QnLCBcIllvdSBjYW5ub3QgdHJ1c3QgaW5kaXZpZHVhbCBmb2xkZXJzIHdpdGhpbiBhIHJlcG9zaXRvcnkuXCIsIHBhdGgpXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHRhY2NlcHRFZGl0KGl0ZW06IElUcnVzdGVkVXJpSXRlbSwgdXJpOiBVUkkpIHtcblx0XHRjb25zdCB0cnVzdGVkRm9sZGVycyA9IHRoaXMud29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZS5nZXRUcnVzdGVkVXJpcygpO1xuXHRcdGNvbnN0IGluZGV4ID0gdHJ1c3RlZEZvbGRlcnMuZmluZEluZGV4KHUgPT4gdGhpcy51cmlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsKHUsIGl0ZW0udXJpKSk7XG5cblx0XHRpZiAoaW5kZXggPj0gdHJ1c3RlZEZvbGRlcnMubGVuZ3RoIHx8IGluZGV4ID09PSAtMSkge1xuXHRcdFx0dHJ1c3RlZEZvbGRlcnMucHVzaCh1cmkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0cnVzdGVkRm9sZGVyc1tpbmRleF0gPSB1cmk7XG5cdFx0fVxuXG5cdFx0dGhpcy53b3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlLnNldFRydXN0ZWRVcmlzKHRydXN0ZWRGb2xkZXJzKTtcblx0XHR0aGlzLl9vbkRpZEFjY2VwdEVkaXQuZmlyZShpdGVtKTtcblx0fVxuXG5cdHJlamVjdEVkaXQoaXRlbTogSVRydXN0ZWRVcmlJdGVtKSB7XG5cdFx0dGhpcy5fb25EaWRSZWplY3RFZGl0LmZpcmUoaXRlbSk7XG5cdH1cblxuXHRhc3luYyBkZWxldGUoaXRlbTogSVRydXN0ZWRVcmlJdGVtKSB7XG5cdFx0dGhpcy50YWJsZS5mb2N1c05leHQoKTtcblx0XHRhd2FpdCB0aGlzLndvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2Uuc2V0VXJpc1RydXN0KFtpdGVtLnVyaV0sIGZhbHNlKTtcblxuXHRcdGlmICh0aGlzLnRhYmxlLmdldEZvY3VzKCkubGVuZ3RoID09PSAwKSB7XG5cdFx0XHR0aGlzLnRhYmxlLmZvY3VzTGFzdCgpO1xuXHRcdH1cblx0XHR0aGlzLl9vbkRlbGV0ZS5maXJlKGl0ZW0pO1xuXHRcdHRoaXMudGFibGUuZG9tRm9jdXMoKTtcblx0fVxuXG5cdGFzeW5jIGVkaXQoaXRlbTogSVRydXN0ZWRVcmlJdGVtLCB1c2VQaWNrZXJJZlBvc3NpYmxlPzogYm9vbGVhbikge1xuXHRcdGNvbnN0IGNhblVzZU9wZW5EaWFsb2cgPSBpdGVtLnVyaS5zY2hlbWUgPT09IFNjaGVtYXMuZmlsZSB8fFxuXHRcdFx0KFxuXHRcdFx0XHRpdGVtLnVyaS5zY2hlbWUgPT09IHRoaXMuY3VycmVudFdvcmtzcGFjZVVyaS5zY2hlbWUgJiZcblx0XHRcdFx0dGhpcy51cmlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsQXV0aG9yaXR5KHRoaXMuY3VycmVudFdvcmtzcGFjZVVyaS5hdXRob3JpdHksIGl0ZW0udXJpLmF1dGhvcml0eSkgJiZcblx0XHRcdFx0IWlzVmlydHVhbFJlc291cmNlKGl0ZW0udXJpKVxuXHRcdFx0KTtcblx0XHRpZiAoY2FuVXNlT3BlbkRpYWxvZyAmJiB1c2VQaWNrZXJJZlBvc3NpYmxlKSB7XG5cdFx0XHRjb25zdCB1cmkgPSBhd2FpdCB0aGlzLmZpbGVEaWFsb2dTZXJ2aWNlLnNob3dPcGVuRGlhbG9nKHtcblx0XHRcdFx0Y2FuU2VsZWN0RmlsZXM6IGZhbHNlLFxuXHRcdFx0XHRjYW5TZWxlY3RGb2xkZXJzOiB0cnVlLFxuXHRcdFx0XHRjYW5TZWxlY3RNYW55OiBmYWxzZSxcblx0XHRcdFx0ZGVmYXVsdFVyaTogaXRlbS51cmksXG5cdFx0XHRcdG9wZW5MYWJlbDogbG9jYWxpemUoJ3RydXN0VXJpJywgXCJUcnVzdCBGb2xkZXJcIiksXG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnc2VsZWN0VHJ1c3RlZFVyaScsIFwiU2VsZWN0IEZvbGRlciBUbyBUcnVzdFwiKVxuXHRcdFx0fSk7XG5cblx0XHRcdGlmICh1cmkpIHtcblx0XHRcdFx0dGhpcy5hY2NlcHRFZGl0KGl0ZW0sIHVyaVswXSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLnJlamVjdEVkaXQoaXRlbSk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuc2VsZWN0VHJ1c3RlZFVyaUVudHJ5KGl0ZW0pO1xuXHRcdFx0dGhpcy5fb25FZGl0LmZpcmUoaXRlbSk7XG5cdFx0fVxuXHR9XG59XG5cbmNsYXNzIFRydXN0ZWRVcmlUYWJsZVZpcnR1YWxEZWxlZ2F0ZSBpbXBsZW1lbnRzIElUYWJsZVZpcnR1YWxEZWxlZ2F0ZTxJVHJ1c3RlZFVyaUl0ZW0+IHtcblx0c3RhdGljIHJlYWRvbmx5IEhFQURFUl9ST1dfSEVJR0hUID0gMzA7XG5cdHN0YXRpYyByZWFkb25seSBST1dfSEVJR0hUID0gMjQ7XG5cdHJlYWRvbmx5IGhlYWRlclJvd0hlaWdodCA9IFRydXN0ZWRVcmlUYWJsZVZpcnR1YWxEZWxlZ2F0ZS5IRUFERVJfUk9XX0hFSUdIVDtcblx0Z2V0SGVpZ2h0KGl0ZW06IElUcnVzdGVkVXJpSXRlbSkge1xuXHRcdHJldHVybiBUcnVzdGVkVXJpVGFibGVWaXJ0dWFsRGVsZWdhdGUuUk9XX0hFSUdIVDtcblx0fVxufVxuXG5pbnRlcmZhY2UgSUFjdGlvbnNDb2x1bW5UZW1wbGF0ZURhdGEge1xuXHRyZWFkb25seSBhY3Rpb25CYXI6IEFjdGlvbkJhcjtcbn1cblxuY2xhc3MgVHJ1c3RlZFVyaUFjdGlvbnNDb2x1bW5SZW5kZXJlciBpbXBsZW1lbnRzIElUYWJsZVJlbmRlcmVyPElUcnVzdGVkVXJpSXRlbSwgSUFjdGlvbnNDb2x1bW5UZW1wbGF0ZURhdGE+IHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgVEVNUExBVEVfSUQgPSAnYWN0aW9ucyc7XG5cblx0cmVhZG9ubHkgdGVtcGxhdGVJZDogc3RyaW5nID0gVHJ1c3RlZFVyaUFjdGlvbnNDb2x1bW5SZW5kZXJlci5URU1QTEFURV9JRDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IHRhYmxlOiBXb3Jrc3BhY2VUcnVzdGVkVXJpc1RhYmxlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgY3VycmVudFdvcmtzcGFjZVVyaTogVVJJLFxuXHRcdEBJVXJpSWRlbnRpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXJpU2VydmljZTogSVVyaUlkZW50aXR5U2VydmljZSkgeyB9XG5cblx0cmVuZGVyVGVtcGxhdGUoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IElBY3Rpb25zQ29sdW1uVGVtcGxhdGVEYXRhIHtcblx0XHRjb25zdCBlbGVtZW50ID0gY29udGFpbmVyLmFwcGVuZENoaWxkKCQoJy5hY3Rpb25zJykpO1xuXHRcdGNvbnN0IGFjdGlvbkJhciA9IG5ldyBBY3Rpb25CYXIoZWxlbWVudCk7XG5cdFx0cmV0dXJuIHsgYWN0aW9uQmFyIH07XG5cdH1cblxuXHRyZW5kZXJFbGVtZW50KGl0ZW06IElUcnVzdGVkVXJpSXRlbSwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBJQWN0aW9uc0NvbHVtblRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS5hY3Rpb25CYXIuY2xlYXIoKTtcblxuXHRcdGNvbnN0IGNhblVzZU9wZW5EaWFsb2cgPSBpdGVtLnVyaS5zY2hlbWUgPT09IFNjaGVtYXMuZmlsZSB8fFxuXHRcdFx0KFxuXHRcdFx0XHRpdGVtLnVyaS5zY2hlbWUgPT09IHRoaXMuY3VycmVudFdvcmtzcGFjZVVyaS5zY2hlbWUgJiZcblx0XHRcdFx0dGhpcy51cmlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsQXV0aG9yaXR5KHRoaXMuY3VycmVudFdvcmtzcGFjZVVyaS5hdXRob3JpdHksIGl0ZW0udXJpLmF1dGhvcml0eSkgJiZcblx0XHRcdFx0IWlzVmlydHVhbFJlc291cmNlKGl0ZW0udXJpKVxuXHRcdFx0KTtcblxuXHRcdGNvbnN0IGFjdGlvbnM6IElBY3Rpb25bXSA9IFtdO1xuXHRcdGlmIChjYW5Vc2VPcGVuRGlhbG9nKSB7XG5cdFx0XHRhY3Rpb25zLnB1c2godGhpcy5jcmVhdGVQaWNrZXJBY3Rpb24oaXRlbSkpO1xuXHRcdH1cblx0XHRhY3Rpb25zLnB1c2godGhpcy5jcmVhdGVFZGl0QWN0aW9uKGl0ZW0pKTtcblx0XHRhY3Rpb25zLnB1c2godGhpcy5jcmVhdGVEZWxldGVBY3Rpb24oaXRlbSkpO1xuXHRcdHRlbXBsYXRlRGF0YS5hY3Rpb25CYXIucHVzaChhY3Rpb25zLCB7IGljb246IHRydWUgfSk7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZUVkaXRBY3Rpb24oaXRlbTogSVRydXN0ZWRVcmlJdGVtKTogSUFjdGlvbiB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGxhYmVsOiAnJyxcblx0XHRcdGNsYXNzOiBUaGVtZUljb24uYXNDbGFzc05hbWUoZWRpdEljb24pLFxuXHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdGlkOiAnZWRpdFRydXN0ZWRVcmknLFxuXHRcdFx0dG9vbHRpcDogbG9jYWxpemUoJ2VkaXRUcnVzdGVkVXJpJywgXCJFZGl0IFBhdGhcIiksXG5cdFx0XHRydW46ICgpID0+IHtcblx0XHRcdFx0dGhpcy50YWJsZS5lZGl0KGl0ZW0sIGZhbHNlKTtcblx0XHRcdH1cblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVQaWNrZXJBY3Rpb24oaXRlbTogSVRydXN0ZWRVcmlJdGVtKTogSUFjdGlvbiB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGxhYmVsOiAnJyxcblx0XHRcdGNsYXNzOiBUaGVtZUljb24uYXNDbGFzc05hbWUoZm9sZGVyUGlja2VySWNvbiksXG5cdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0aWQ6ICdwaWNrZXJUcnVzdGVkVXJpJyxcblx0XHRcdHRvb2x0aXA6IGxvY2FsaXplKCdwaWNrZXJUcnVzdGVkVXJpJywgXCJPcGVuIEZpbGUgUGlja2VyXCIpLFxuXHRcdFx0cnVuOiAoKSA9PiB7XG5cdFx0XHRcdHRoaXMudGFibGUuZWRpdChpdGVtLCB0cnVlKTtcblx0XHRcdH1cblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVEZWxldGVBY3Rpb24oaXRlbTogSVRydXN0ZWRVcmlJdGVtKTogSUFjdGlvbiB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGxhYmVsOiAnJyxcblx0XHRcdGNsYXNzOiBUaGVtZUljb24uYXNDbGFzc05hbWUocmVtb3ZlSWNvbiksXG5cdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0aWQ6ICdkZWxldGVUcnVzdGVkVXJpJyxcblx0XHRcdHRvb2x0aXA6IGxvY2FsaXplKCdkZWxldGVUcnVzdGVkVXJpJywgXCJEZWxldGUgUGF0aFwiKSxcblx0XHRcdHJ1bjogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRhd2FpdCB0aGlzLnRhYmxlLmRlbGV0ZShpdGVtKTtcblx0XHRcdH1cblx0XHR9O1xuXHR9XG5cblx0ZGlzcG9zZVRlbXBsYXRlKHRlbXBsYXRlRGF0YTogSUFjdGlvbnNDb2x1bW5UZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEuYWN0aW9uQmFyLmRpc3Bvc2UoKTtcblx0fVxuXG59XG5cbmludGVyZmFjZSBJVHJ1c3RlZFVyaVBhdGhDb2x1bW5UZW1wbGF0ZURhdGEge1xuXHRlbGVtZW50OiBIVE1MRWxlbWVudDtcblx0cGF0aExhYmVsOiBIVE1MRWxlbWVudDtcblx0cGF0aElucHV0OiBJbnB1dEJveDtcblx0cmVuZGVyRGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcblx0ZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcbn1cblxuY2xhc3MgVHJ1c3RlZFVyaVBhdGhDb2x1bW5SZW5kZXJlciBpbXBsZW1lbnRzIElUYWJsZVJlbmRlcmVyPElUcnVzdGVkVXJpSXRlbSwgSVRydXN0ZWRVcmlQYXRoQ29sdW1uVGVtcGxhdGVEYXRhPiB7XG5cdHN0YXRpYyByZWFkb25seSBURU1QTEFURV9JRCA9ICdwYXRoJztcblxuXHRyZWFkb25seSB0ZW1wbGF0ZUlkOiBzdHJpbmcgPSBUcnVzdGVkVXJpUGF0aENvbHVtblJlbmRlcmVyLlRFTVBMQVRFX0lEO1xuXHRwcml2YXRlIGN1cnJlbnRJdGVtPzogSVRydXN0ZWRVcmlJdGVtO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgdGFibGU6IFdvcmtzcGFjZVRydXN0ZWRVcmlzVGFibGUsXG5cdFx0QElDb250ZXh0Vmlld1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0Vmlld1NlcnZpY2U6IElDb250ZXh0Vmlld1NlcnZpY2Vcblx0KSB7XG5cdH1cblxuXHRyZW5kZXJUZW1wbGF0ZShjb250YWluZXI6IEhUTUxFbGVtZW50KTogSVRydXN0ZWRVcmlQYXRoQ29sdW1uVGVtcGxhdGVEYXRhIHtcblx0XHRjb25zdCBlbGVtZW50ID0gY29udGFpbmVyLmFwcGVuZENoaWxkKCQoJy5wYXRoJykpO1xuXHRcdGNvbnN0IHBhdGhMYWJlbCA9IGVsZW1lbnQuYXBwZW5kQ2hpbGQoJCgnZGl2LnBhdGgtbGFiZWwnKSk7XG5cblx0XHRjb25zdCBwYXRoSW5wdXQgPSBuZXcgSW5wdXRCb3goZWxlbWVudCwgdGhpcy5jb250ZXh0Vmlld1NlcnZpY2UsIHtcblx0XHRcdHZhbGlkYXRpb25PcHRpb25zOiB7XG5cdFx0XHRcdHZhbGlkYXRpb246IHZhbHVlID0+IHRoaXMudGFibGUudmFsaWRhdGVVcmkodmFsdWUsIHRoaXMuY3VycmVudEl0ZW0pXG5cdFx0XHR9LFxuXHRcdFx0aW5wdXRCb3hTdHlsZXM6IGRlZmF1bHRJbnB1dEJveFN0eWxlc1xuXHRcdH0pO1xuXG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgcmVuZGVyRGlzcG9zYWJsZXMgPSBkaXNwb3NhYmxlcy5hZGQobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRlbGVtZW50LFxuXHRcdFx0cGF0aExhYmVsLFxuXHRcdFx0cGF0aElucHV0LFxuXHRcdFx0ZGlzcG9zYWJsZXMsXG5cdFx0XHRyZW5kZXJEaXNwb3NhYmxlc1xuXHRcdH07XG5cdH1cblxuXHRyZW5kZXJFbGVtZW50KGl0ZW06IElUcnVzdGVkVXJpSXRlbSwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBJVHJ1c3RlZFVyaVBhdGhDb2x1bW5UZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEucmVuZGVyRGlzcG9zYWJsZXMuY2xlYXIoKTtcblxuXHRcdHRoaXMuY3VycmVudEl0ZW0gPSBpdGVtO1xuXHRcdHRlbXBsYXRlRGF0YS5yZW5kZXJEaXNwb3NhYmxlcy5hZGQodGhpcy50YWJsZS5vbkVkaXQoYXN5bmMgKGUpID0+IHtcblx0XHRcdGlmIChpdGVtID09PSBlKSB7XG5cdFx0XHRcdHRlbXBsYXRlRGF0YS5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2lucHV0LW1vZGUnKTtcblx0XHRcdFx0dGVtcGxhdGVEYXRhLnBhdGhJbnB1dC5mb2N1cygpO1xuXHRcdFx0XHR0ZW1wbGF0ZURhdGEucGF0aElucHV0LnNlbGVjdCgpO1xuXHRcdFx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudC5wYXJlbnRFbGVtZW50IS5zdHlsZS5wYWRkaW5nTGVmdCA9ICcwcHgnO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIHN0b3AgZG91YmxlIGNsaWNrIGFjdGlvbiBmcm9tIHJlLXJlbmRlcmluZyB0aGUgZWxlbWVudCBvbiB0aGUgdGFibGUgIzEyNTA1MlxuXHRcdHRlbXBsYXRlRGF0YS5yZW5kZXJEaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRlbXBsYXRlRGF0YS5wYXRoSW5wdXQuZWxlbWVudCwgRXZlbnRUeXBlLkRCTENMSUNLLCBlID0+IHtcblx0XHRcdEV2ZW50SGVscGVyLnN0b3AoZSk7XG5cdFx0fSkpO1xuXG5cblx0XHRjb25zdCBoaWRlSW5wdXRCb3ggPSAoKSA9PiB7XG5cdFx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudC5jbGFzc0xpc3QucmVtb3ZlKCdpbnB1dC1tb2RlJyk7XG5cdFx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudC5wYXJlbnRFbGVtZW50IS5zdHlsZS5wYWRkaW5nTGVmdCA9ICc1cHgnO1xuXHRcdH07XG5cblx0XHRjb25zdCBhY2NlcHQgPSAoKSA9PiB7XG5cdFx0XHRoaWRlSW5wdXRCb3goKTtcblxuXHRcdFx0Y29uc3QgcGF0aFRvVXNlID0gdGVtcGxhdGVEYXRhLnBhdGhJbnB1dC52YWx1ZTtcblx0XHRcdGNvbnN0IHVyaSA9IGhhc0RyaXZlTGV0dGVyKHBhdGhUb1VzZSkgPyBpdGVtLnVyaS53aXRoKHsgcGF0aDogcG9zaXguc2VwICsgdG9TbGFzaGVzKHBhdGhUb1VzZSkgfSkgOiBpdGVtLnVyaS53aXRoKHsgcGF0aDogcGF0aFRvVXNlIH0pO1xuXHRcdFx0dGVtcGxhdGVEYXRhLnBhdGhMYWJlbC5pbm5lclRleHQgPSB0aGlzLmZvcm1hdFBhdGgodXJpKTtcblxuXHRcdFx0aWYgKHVyaSkge1xuXHRcdFx0XHR0aGlzLnRhYmxlLmFjY2VwdEVkaXQoaXRlbSwgdXJpKTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0Y29uc3QgcmVqZWN0ID0gKCkgPT4ge1xuXHRcdFx0aGlkZUlucHV0Qm94KCk7XG5cdFx0XHR0ZW1wbGF0ZURhdGEucGF0aElucHV0LnZhbHVlID0gc3RyaW5nVmFsdWU7XG5cdFx0XHR0aGlzLnRhYmxlLnJlamVjdEVkaXQoaXRlbSk7XG5cdFx0fTtcblxuXHRcdHRlbXBsYXRlRGF0YS5yZW5kZXJEaXNwb3NhYmxlcy5hZGQoYWRkU3RhbmRhcmREaXNwb3NhYmxlTGlzdGVuZXIodGVtcGxhdGVEYXRhLnBhdGhJbnB1dC5pbnB1dEVsZW1lbnQsIEV2ZW50VHlwZS5LRVlfRE9XTiwgZSA9PiB7XG5cdFx0XHRsZXQgaGFuZGxlZCA9IGZhbHNlO1xuXHRcdFx0aWYgKGUuZXF1YWxzKEtleUNvZGUuRW50ZXIpKSB7XG5cdFx0XHRcdGFjY2VwdCgpO1xuXHRcdFx0XHRoYW5kbGVkID0gdHJ1ZTtcblx0XHRcdH0gZWxzZSBpZiAoZS5lcXVhbHMoS2V5Q29kZS5Fc2NhcGUpKSB7XG5cdFx0XHRcdHJlamVjdCgpO1xuXHRcdFx0XHRoYW5kbGVkID0gdHJ1ZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGhhbmRsZWQpIHtcblx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0ZW1wbGF0ZURhdGEucmVuZGVyRGlzcG9zYWJsZXMuYWRkKChhZGREaXNwb3NhYmxlTGlzdGVuZXIodGVtcGxhdGVEYXRhLnBhdGhJbnB1dC5pbnB1dEVsZW1lbnQsIEV2ZW50VHlwZS5CTFVSLCAoKSA9PiB7XG5cdFx0XHRyZWplY3QoKTtcblx0XHR9KSkpO1xuXG5cdFx0Y29uc3Qgc3RyaW5nVmFsdWUgPSB0aGlzLmZvcm1hdFBhdGgoaXRlbS51cmkpO1xuXHRcdHRlbXBsYXRlRGF0YS5wYXRoSW5wdXQudmFsdWUgPSBzdHJpbmdWYWx1ZTtcblx0XHR0ZW1wbGF0ZURhdGEucGF0aExhYmVsLmlubmVyVGV4dCA9IHN0cmluZ1ZhbHVlO1xuXHRcdHRlbXBsYXRlRGF0YS5lbGVtZW50LmNsYXNzTGlzdC50b2dnbGUoJ2N1cnJlbnQtd29ya3NwYWNlLXBhcmVudCcsIGl0ZW0ucGFyZW50T2ZXb3Jrc3BhY2VJdGVtKTtcblx0fVxuXG5cdGRpc3Bvc2VUZW1wbGF0ZSh0ZW1wbGF0ZURhdGE6IElUcnVzdGVkVXJpUGF0aENvbHVtblRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS5kaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0dGVtcGxhdGVEYXRhLnJlbmRlckRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fVxuXG5cdHByaXZhdGUgZm9ybWF0UGF0aCh1cmk6IFVSSSk6IHN0cmluZyB7XG5cdFx0aWYgKHVyaS5zY2hlbWUgPT09IFNjaGVtYXMuZmlsZSkge1xuXHRcdFx0cmV0dXJuIG5vcm1hbGl6ZURyaXZlTGV0dGVyKHVyaS5mc1BhdGgpO1xuXHRcdH1cblxuXHRcdC8vIElmIHRoZSBwYXRoIGlzIG5vdCBhIGZpbGUgdXJpLCBidXQgcG9pbnRzIHRvIGEgd2luZG93cyByZW1vdGUsIHdlIHNob3VsZCBjcmVhdGUgd2luZG93cyBmcyBwYXRoXG5cdFx0Ly8gZS5nLiAvYzovdXNlci9kaXJlY3RvcnkgPT4gQzpcXHVzZXJcXGRpcmVjdG9yeVxuXHRcdGlmICh1cmkucGF0aC5zdGFydHNXaXRoKHBvc2l4LnNlcCkpIHtcblx0XHRcdGNvbnN0IHBhdGhXaXRob3V0TGVhZGluZ1NlcGFyYXRvciA9IHVyaS5wYXRoLnN1YnN0cmluZygxKTtcblx0XHRcdGNvbnN0IGlzV2luZG93c1BhdGggPSBoYXNEcml2ZUxldHRlcihwYXRoV2l0aG91dExlYWRpbmdTZXBhcmF0b3IsIHRydWUpO1xuXHRcdFx0aWYgKGlzV2luZG93c1BhdGgpIHtcblx0XHRcdFx0cmV0dXJuIG5vcm1hbGl6ZURyaXZlTGV0dGVyKHdpbjMyLm5vcm1hbGl6ZShwYXRoV2l0aG91dExlYWRpbmdTZXBhcmF0b3IpLCB0cnVlKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gdXJpLnBhdGg7XG5cdH1cblxufVxuXG5cbmludGVyZmFjZSBJVHJ1c3RlZFVyaUhvc3RDb2x1bW5UZW1wbGF0ZURhdGEge1xuXHRlbGVtZW50OiBIVE1MRWxlbWVudDtcblx0aG9zdENvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cdGJ1dHRvbkJhckNvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cdGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmU7XG5cdHJlbmRlckRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmU7XG59XG5cbmZ1bmN0aW9uIGdldEhvc3RMYWJlbChsYWJlbFNlcnZpY2U6IElMYWJlbFNlcnZpY2UsIGl0ZW06IElUcnVzdGVkVXJpSXRlbSk6IHN0cmluZyB7XG5cdHJldHVybiBpdGVtLnVyaS5hdXRob3JpdHkgPyBsYWJlbFNlcnZpY2UuZ2V0SG9zdExhYmVsKGl0ZW0udXJpLnNjaGVtZSwgaXRlbS51cmkuYXV0aG9yaXR5KSA6IGxvY2FsaXplKCdsb2NhbEF1dGhvcml0eScsIFwiTG9jYWxcIik7XG59XG5cbmNsYXNzIFRydXN0ZWRVcmlIb3N0Q29sdW1uUmVuZGVyZXIgaW1wbGVtZW50cyBJVGFibGVSZW5kZXJlcjxJVHJ1c3RlZFVyaUl0ZW0sIElUcnVzdGVkVXJpSG9zdENvbHVtblRlbXBsYXRlRGF0YT4ge1xuXHRzdGF0aWMgcmVhZG9ubHkgVEVNUExBVEVfSUQgPSAnaG9zdCc7XG5cblx0cmVhZG9ubHkgdGVtcGxhdGVJZDogc3RyaW5nID0gVHJ1c3RlZFVyaUhvc3RDb2x1bW5SZW5kZXJlci5URU1QTEFURV9JRDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUxhYmVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxhYmVsU2VydmljZTogSUxhYmVsU2VydmljZSxcblx0KSB7IH1cblxuXHRyZW5kZXJUZW1wbGF0ZShjb250YWluZXI6IEhUTUxFbGVtZW50KTogSVRydXN0ZWRVcmlIb3N0Q29sdW1uVGVtcGxhdGVEYXRhIHtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCByZW5kZXJEaXNwb3NhYmxlcyA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXG5cdFx0Y29uc3QgZWxlbWVudCA9IGNvbnRhaW5lci5hcHBlbmRDaGlsZCgkKCcuaG9zdCcpKTtcblx0XHRjb25zdCBob3N0Q29udGFpbmVyID0gZWxlbWVudC5hcHBlbmRDaGlsZCgkKCdkaXYuaG9zdC1sYWJlbCcpKTtcblx0XHRjb25zdCBidXR0b25CYXJDb250YWluZXIgPSBlbGVtZW50LmFwcGVuZENoaWxkKCQoJ2Rpdi5idXR0b24tYmFyJykpO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGVsZW1lbnQsXG5cdFx0XHRob3N0Q29udGFpbmVyLFxuXHRcdFx0YnV0dG9uQmFyQ29udGFpbmVyLFxuXHRcdFx0ZGlzcG9zYWJsZXMsXG5cdFx0XHRyZW5kZXJEaXNwb3NhYmxlc1xuXHRcdH07XG5cdH1cblxuXHRyZW5kZXJFbGVtZW50KGl0ZW06IElUcnVzdGVkVXJpSXRlbSwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBJVHJ1c3RlZFVyaUhvc3RDb2x1bW5UZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEucmVuZGVyRGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHR0ZW1wbGF0ZURhdGEucmVuZGVyRGlzcG9zYWJsZXMuYWRkKHsgZGlzcG9zZTogKCkgPT4geyBjbGVhck5vZGUodGVtcGxhdGVEYXRhLmJ1dHRvbkJhckNvbnRhaW5lcik7IH0gfSk7XG5cblx0XHR0ZW1wbGF0ZURhdGEuaG9zdENvbnRhaW5lci5pbm5lclRleHQgPSBnZXRIb3N0TGFiZWwodGhpcy5sYWJlbFNlcnZpY2UsIGl0ZW0pO1xuXHRcdHRlbXBsYXRlRGF0YS5lbGVtZW50LmNsYXNzTGlzdC50b2dnbGUoJ2N1cnJlbnQtd29ya3NwYWNlLXBhcmVudCcsIGl0ZW0ucGFyZW50T2ZXb3Jrc3BhY2VJdGVtKTtcblxuXHRcdHRlbXBsYXRlRGF0YS5ob3N0Q29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSAnJztcblx0XHR0ZW1wbGF0ZURhdGEuYnV0dG9uQmFyQ29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdH1cblxuXHRkaXNwb3NlVGVtcGxhdGUodGVtcGxhdGVEYXRhOiBJVHJ1c3RlZFVyaUhvc3RDb2x1bW5UZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEuZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9XG5cbn1cblxuZXhwb3J0IGNsYXNzIFdvcmtzcGFjZVRydXN0RWRpdG9yIGV4dGVuZHMgRWRpdG9yUGFuZSB7XG5cdHN0YXRpYyByZWFkb25seSBJRDogc3RyaW5nID0gJ3dvcmtiZW5jaC5lZGl0b3Iud29ya3NwYWNlVHJ1c3QnO1xuXHRwcml2YXRlIHJvb3RFbGVtZW50ITogSFRNTEVsZW1lbnQ7XG5cblx0Ly8gSGVhZGVyIFNlY3Rpb25cblx0cHJpdmF0ZSBoZWFkZXJDb250YWluZXIhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBoZWFkZXJUaXRsZUNvbnRhaW5lciE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIGhlYWRlclRpdGxlSWNvbiE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIGhlYWRlclRpdGxlVGV4dCE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIGhlYWRlckRlc2NyaXB0aW9uITogSFRNTEVsZW1lbnQ7XG5cblx0cHJpdmF0ZSBib2R5U2Nyb2xsQmFyITogRG9tU2Nyb2xsYWJsZUVsZW1lbnQ7XG5cblx0Ly8gQWZmZWN0ZWQgRmVhdHVyZXMgU2VjdGlvblxuXHRwcml2YXRlIGFmZmVjdGVkRmVhdHVyZXNDb250YWluZXIhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSB0cnVzdGVkQ29udGFpbmVyITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgdW50cnVzdGVkQ29udGFpbmVyITogSFRNTEVsZW1lbnQ7XG5cblx0Ly8gU2V0dGluZ3MgU2VjdGlvblxuXHRwcml2YXRlIGNvbmZpZ3VyYXRpb25Db250YWluZXIhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSB3b3Jrc3BhY2VUcnVzdGVkVXJpc1RhYmxlITogV29ya3NwYWNlVHJ1c3RlZFVyaXNUYWJsZTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRncm91cDogSUVkaXRvckdyb3VwLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3b3Jrc3BhY2VTZXJ2aWNlOiBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbldvcmtiZW5jaFNlcnZpY2U6IElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSxcblx0XHRASUV4dGVuc2lvbk1hbmlmZXN0UHJvcGVydGllc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25NYW5pZmVzdFByb3BlcnRpZXNTZXJ2aWNlOiBJRXh0ZW5zaW9uTWFuaWZlc3RQcm9wZXJ0aWVzU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASVdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3b3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlOiBJV29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZSxcblx0XHRASVdvcmtiZW5jaENvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElXb3JrYmVuY2hDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVdvcmtiZW5jaEV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2U6IElXb3JrYmVuY2hFeHRlbnNpb25FbmFibGVtZW50U2VydmljZSxcblx0XHRASVByb2R1Y3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSxcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkga2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0KSB7IHN1cGVyKFdvcmtzcGFjZVRydXN0RWRpdG9yLklELCBncm91cCwgdGVsZW1ldHJ5U2VydmljZSwgdGhlbWVTZXJ2aWNlLCBzdG9yYWdlU2VydmljZSk7IH1cblxuXHRwcm90ZWN0ZWQgY3JlYXRlRWRpdG9yKHBhcmVudDogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHR0aGlzLnJvb3RFbGVtZW50ID0gYXBwZW5kKHBhcmVudCwgJCgnLndvcmtzcGFjZS10cnVzdC1lZGl0b3InLCB7IHRhYmluZGV4OiAnMCcgfSkpO1xuXG5cdFx0dGhpcy5jcmVhdGVIZWFkZXJFbGVtZW50KHRoaXMucm9vdEVsZW1lbnQpO1xuXG5cdFx0Y29uc3Qgc2Nyb2xsYWJsZUNvbnRlbnQgPSAkKCcud29ya3NwYWNlLXRydXN0LWVkaXRvci1ib2R5Jyk7XG5cdFx0dGhpcy5ib2R5U2Nyb2xsQmFyID0gdGhpcy5fcmVnaXN0ZXIobmV3IERvbVNjcm9sbGFibGVFbGVtZW50KHNjcm9sbGFibGVDb250ZW50LCB7XG5cdFx0XHRob3Jpem9udGFsOiBTY3JvbGxiYXJWaXNpYmlsaXR5LkhpZGRlbixcblx0XHRcdHZlcnRpY2FsOiBTY3JvbGxiYXJWaXNpYmlsaXR5LkF1dG8sXG5cdFx0fSkpO1xuXG5cdFx0YXBwZW5kKHRoaXMucm9vdEVsZW1lbnQsIHRoaXMuYm9keVNjcm9sbEJhci5nZXREb21Ob2RlKCkpO1xuXG5cdFx0dGhpcy5jcmVhdGVBZmZlY3RlZEZlYXR1cmVzRWxlbWVudChzY3JvbGxhYmxlQ29udGVudCk7XG5cdFx0dGhpcy5jcmVhdGVDb25maWd1cmF0aW9uRWxlbWVudChzY3JvbGxhYmxlQ29udGVudCk7XG5cblx0XHR0aGlzLnJvb3RFbGVtZW50LnN0eWxlLnNldFByb3BlcnR5KCctLXdvcmtzcGFjZS10cnVzdC1zZWxlY3RlZC1jb2xvcicsIGFzQ3NzVmFyaWFibGUoYnV0dG9uQmFja2dyb3VuZCkpO1xuXHRcdHRoaXMucm9vdEVsZW1lbnQuc3R5bGUuc2V0UHJvcGVydHkoJy0td29ya3NwYWNlLXRydXN0LXVuc2VsZWN0ZWQtY29sb3InLCBhc0Nzc1ZhcmlhYmxlKGJ1dHRvblNlY29uZGFyeUJhY2tncm91bmQpKTtcblx0XHR0aGlzLnJvb3RFbGVtZW50LnN0eWxlLnNldFByb3BlcnR5KCctLXdvcmtzcGFjZS10cnVzdC1jaGVjay1jb2xvcicsIGFzQ3NzVmFyaWFibGUoZGVidWdJY29uU3RhcnRGb3JlZ3JvdW5kKSk7XG5cdFx0dGhpcy5yb290RWxlbWVudC5zdHlsZS5zZXRQcm9wZXJ0eSgnLS13b3Jrc3BhY2UtdHJ1c3QteC1jb2xvcicsIGFzQ3NzVmFyaWFibGUoZWRpdG9yRXJyb3JGb3JlZ3JvdW5kKSk7XG5cblx0XHQvLyBOYXZpZ2F0ZSBwYWdlIHdpdGgga2V5Ym9hcmRcblx0XHR0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5yb290RWxlbWVudCwgRXZlbnRUeXBlLktFWV9ET1dOLCBlID0+IHtcblx0XHRcdGNvbnN0IGV2ZW50ID0gbmV3IFN0YW5kYXJkS2V5Ym9hcmRFdmVudChlKTtcblxuXHRcdFx0aWYgKGV2ZW50LmVxdWFscyhLZXlDb2RlLlVwQXJyb3cpIHx8IGV2ZW50LmVxdWFscyhLZXlDb2RlLkRvd25BcnJvdykpIHtcblx0XHRcdFx0Y29uc3QgbmF2T3JkZXIgPSBbdGhpcy5oZWFkZXJDb250YWluZXIsIHRoaXMudHJ1c3RlZENvbnRhaW5lciwgdGhpcy51bnRydXN0ZWRDb250YWluZXIsIHRoaXMuY29uZmlndXJhdGlvbkNvbnRhaW5lcl07XG5cdFx0XHRcdGNvbnN0IGN1cnJlbnRJbmRleCA9IG5hdk9yZGVyLmZpbmRJbmRleChlbGVtZW50ID0+IHtcblx0XHRcdFx0XHRyZXR1cm4gaXNBbmNlc3Rvck9mQWN0aXZlRWxlbWVudChlbGVtZW50KTtcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0bGV0IG5ld0luZGV4ID0gY3VycmVudEluZGV4O1xuXHRcdFx0XHRpZiAoZXZlbnQuZXF1YWxzKEtleUNvZGUuRG93bkFycm93KSkge1xuXHRcdFx0XHRcdG5ld0luZGV4Kys7XG5cdFx0XHRcdH0gZWxzZSBpZiAoZXZlbnQuZXF1YWxzKEtleUNvZGUuVXBBcnJvdykpIHtcblx0XHRcdFx0XHRuZXdJbmRleCA9IE1hdGgubWF4KDAsIG5ld0luZGV4KTtcblx0XHRcdFx0XHRuZXdJbmRleC0tO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0bmV3SW5kZXggKz0gbmF2T3JkZXIubGVuZ3RoO1xuXHRcdFx0XHRuZXdJbmRleCAlPSBuYXZPcmRlci5sZW5ndGg7XG5cblx0XHRcdFx0bmF2T3JkZXJbbmV3SW5kZXhdLmZvY3VzKCk7XG5cdFx0XHR9IGVsc2UgaWYgKGV2ZW50LmVxdWFscyhLZXlDb2RlLkVzY2FwZSkpIHtcblx0XHRcdFx0dGhpcy5yb290RWxlbWVudC5mb2N1cygpO1xuXHRcdFx0fSBlbHNlIGlmIChldmVudC5lcXVhbHMoS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLkVudGVyKSkge1xuXHRcdFx0XHRpZiAodGhpcy53b3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlLmNhblNldFdvcmtzcGFjZVRydXN0KCkpIHtcblx0XHRcdFx0XHR0aGlzLndvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2Uuc2V0V29ya3NwYWNlVHJ1c3QoIXRoaXMud29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZS5pc1dvcmtzcGFjZVRydXN0ZWQoKSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRvdmVycmlkZSBmb2N1cygpIHtcblx0XHRzdXBlci5mb2N1cygpO1xuXG5cdFx0dGhpcy5yb290RWxlbWVudC5mb2N1cygpO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgc2V0SW5wdXQoaW5wdXQ6IFdvcmtzcGFjZVRydXN0RWRpdG9ySW5wdXQsIG9wdGlvbnM6IElFZGl0b3JPcHRpb25zIHwgdW5kZWZpbmVkLCBjb250ZXh0OiBJRWRpdG9yT3BlbkNvbnRleHQsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8dm9pZD4ge1xuXG5cdFx0YXdhaXQgc3VwZXIuc2V0SW5wdXQoaW5wdXQsIG9wdGlvbnMsIGNvbnRleHQsIHRva2VuKTtcblx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHsgcmV0dXJuOyB9XG5cblx0XHRhd2FpdCB0aGlzLndvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2Uud29ya3NwYWNlVHJ1c3RJbml0aWFsaXplZDtcblx0XHR0aGlzLnJlZ2lzdGVyTGlzdGVuZXJzKCk7XG5cdFx0YXdhaXQgdGhpcy5yZW5kZXIoKTtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJMaXN0ZW5lcnMoKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5leHRlbnNpb25Xb3JrYmVuY2hTZXJ2aWNlLm9uQ2hhbmdlKCgpID0+IHRoaXMucmVuZGVyKCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlUmVzdHJpY3RlZFNldHRpbmdzKCgpID0+IHRoaXMucmVuZGVyKCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLndvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2Uub25EaWRDaGFuZ2VUcnVzdCgoKSA9PiB0aGlzLnJlbmRlcigpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy53b3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlLm9uRGlkQ2hhbmdlVHJ1c3RlZEZvbGRlcnMoKCkgPT4gdGhpcy5yZW5kZXIoKSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRIZWFkZXJDb250YWluZXJDbGFzcyh0cnVzdGVkOiBib29sZWFuKTogc3RyaW5nIHtcblx0XHRpZiAodHJ1c3RlZCkge1xuXHRcdFx0cmV0dXJuICd3b3Jrc3BhY2UtdHJ1c3QtaGVhZGVyIHdvcmtzcGFjZS10cnVzdC10cnVzdGVkJztcblx0XHR9XG5cblx0XHRyZXR1cm4gJ3dvcmtzcGFjZS10cnVzdC1oZWFkZXIgd29ya3NwYWNlLXRydXN0LXVudHJ1c3RlZCc7XG5cdH1cblxuXHRwcml2YXRlIGdldEhlYWRlclRpdGxlVGV4dCh0cnVzdGVkOiBib29sZWFuKTogc3RyaW5nIHtcblx0XHRpZiAodHJ1c3RlZCkge1xuXHRcdFx0aWYgKHRoaXMud29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZS5pc1dvcmtzcGFjZVRydXN0Rm9yY2VkKCkpIHtcblx0XHRcdFx0cmV0dXJuIGxvY2FsaXplKCd0cnVzdGVkVW5zZXR0YWJsZVdpbmRvdycsIFwiVGhpcyB3aW5kb3cgaXMgdHJ1c3RlZFwiKTtcblx0XHRcdH1cblxuXHRcdFx0c3dpdGNoICh0aGlzLndvcmtzcGFjZVNlcnZpY2UuZ2V0V29ya2JlbmNoU3RhdGUoKSkge1xuXHRcdFx0XHRjYXNlIFdvcmtiZW5jaFN0YXRlLkVNUFRZOlxuXHRcdFx0XHRcdHJldHVybiBsb2NhbGl6ZSgndHJ1c3RlZEhlYWRlcldpbmRvdycsIFwiWW91IHRydXN0IHRoaXMgd2luZG93XCIpO1xuXHRcdFx0XHRjYXNlIFdvcmtiZW5jaFN0YXRlLkZPTERFUjpcblx0XHRcdFx0XHRyZXR1cm4gbG9jYWxpemUoJ3RydXN0ZWRIZWFkZXJGb2xkZXInLCBcIllvdSB0cnVzdCB0aGlzIGZvbGRlclwiKTtcblx0XHRcdFx0Y2FzZSBXb3JrYmVuY2hTdGF0ZS5XT1JLU1BBQ0U6XG5cdFx0XHRcdFx0cmV0dXJuIGxvY2FsaXplKCd0cnVzdGVkSGVhZGVyV29ya3NwYWNlJywgXCJZb3UgdHJ1c3QgdGhpcyB3b3Jrc3BhY2VcIik7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGxvY2FsaXplKCd1bnRydXN0ZWRIZWFkZXInLCBcIllvdSBhcmUgaW4gUmVzdHJpY3RlZCBNb2RlXCIpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRIZWFkZXJUaXRsZUljb25DbGFzc05hbWVzKHRydXN0ZWQ6IGJvb2xlYW4pOiBzdHJpbmdbXSB7XG5cdFx0cmV0dXJuIFRoZW1lSWNvbi5hc0NsYXNzTmFtZUFycmF5KHNoaWVsZEljb24pO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRGZWF0dXJlc0hlYWRlclRleHQodHJ1c3RlZDogYm9vbGVhbik6IFtzdHJpbmcsIHN0cmluZ10ge1xuXHRcdGxldCB0aXRsZTogc3RyaW5nID0gJyc7XG5cdFx0bGV0IHN1YlRpdGxlOiBzdHJpbmcgPSAnJztcblxuXHRcdHN3aXRjaCAodGhpcy53b3Jrc3BhY2VTZXJ2aWNlLmdldFdvcmtiZW5jaFN0YXRlKCkpIHtcblx0XHRcdGNhc2UgV29ya2JlbmNoU3RhdGUuRU1QVFk6IHtcblx0XHRcdFx0dGl0bGUgPSB0cnVzdGVkID8gbG9jYWxpemUoJ3RydXN0ZWRXaW5kb3cnLCBcIkluIGEgVHJ1c3RlZCBXaW5kb3dcIikgOiBsb2NhbGl6ZSgndW50cnVzdGVkV29ya3NwYWNlJywgXCJJbiBSZXN0cmljdGVkIE1vZGVcIik7XG5cdFx0XHRcdHN1YlRpdGxlID0gdHJ1c3RlZCA/IGxvY2FsaXplKCd0cnVzdGVkV2luZG93U3VidGl0bGUnLCBcIllvdSB0cnVzdCB0aGUgYXV0aG9ycyBvZiB0aGUgZmlsZXMgaW4gdGhlIGN1cnJlbnQgd2luZG93LiBBbGwgZmVhdHVyZXMgYXJlIGVuYWJsZWQ6XCIpIDpcblx0XHRcdFx0XHRsb2NhbGl6ZSgndW50cnVzdGVkV2luZG93U3VidGl0bGUnLCBcIllvdSBkbyBub3QgdHJ1c3QgdGhlIGF1dGhvcnMgb2YgdGhlIGZpbGVzIGluIHRoZSBjdXJyZW50IHdpbmRvdy4gVGhlIGZvbGxvd2luZyBmZWF0dXJlcyBhcmUgZGlzYWJsZWQ6XCIpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGNhc2UgV29ya2JlbmNoU3RhdGUuRk9MREVSOiB7XG5cdFx0XHRcdHRpdGxlID0gdHJ1c3RlZCA/IGxvY2FsaXplKCd0cnVzdGVkRm9sZGVyJywgXCJJbiBhIFRydXN0ZWQgRm9sZGVyXCIpIDogbG9jYWxpemUoJ3VudHJ1c3RlZFdvcmtzcGFjZScsIFwiSW4gUmVzdHJpY3RlZCBNb2RlXCIpO1xuXHRcdFx0XHRzdWJUaXRsZSA9IHRydXN0ZWQgPyBsb2NhbGl6ZSgndHJ1c3RlZEZvbGRlclN1YnRpdGxlJywgXCJZb3UgdHJ1c3QgdGhlIGF1dGhvcnMgb2YgdGhlIGZpbGVzIGluIHRoZSBjdXJyZW50IGZvbGRlci4gQWxsIGZlYXR1cmVzIGFyZSBlbmFibGVkOlwiKSA6XG5cdFx0XHRcdFx0bG9jYWxpemUoJ3VudHJ1c3RlZEZvbGRlclN1YnRpdGxlJywgXCJZb3UgZG8gbm90IHRydXN0IHRoZSBhdXRob3JzIG9mIHRoZSBmaWxlcyBpbiB0aGUgY3VycmVudCBmb2xkZXIuIFRoZSBmb2xsb3dpbmcgZmVhdHVyZXMgYXJlIGRpc2FibGVkOlwiKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRjYXNlIFdvcmtiZW5jaFN0YXRlLldPUktTUEFDRToge1xuXHRcdFx0XHR0aXRsZSA9IHRydXN0ZWQgPyBsb2NhbGl6ZSgndHJ1c3RlZFdvcmtzcGFjZScsIFwiSW4gYSBUcnVzdGVkIFdvcmtzcGFjZVwiKSA6IGxvY2FsaXplKCd1bnRydXN0ZWRXb3Jrc3BhY2UnLCBcIkluIFJlc3RyaWN0ZWQgTW9kZVwiKTtcblx0XHRcdFx0c3ViVGl0bGUgPSB0cnVzdGVkID8gbG9jYWxpemUoJ3RydXN0ZWRXb3Jrc3BhY2VTdWJ0aXRsZScsIFwiWW91IHRydXN0IHRoZSBhdXRob3JzIG9mIHRoZSBmaWxlcyBpbiB0aGUgY3VycmVudCB3b3Jrc3BhY2UuIEFsbCBmZWF0dXJlcyBhcmUgZW5hYmxlZDpcIikgOlxuXHRcdFx0XHRcdGxvY2FsaXplKCd1bnRydXN0ZWRXb3Jrc3BhY2VTdWJ0aXRsZScsIFwiWW91IGRvIG5vdCB0cnVzdCB0aGUgYXV0aG9ycyBvZiB0aGUgZmlsZXMgaW4gdGhlIGN1cnJlbnQgd29ya3NwYWNlLiBUaGUgZm9sbG93aW5nIGZlYXR1cmVzIGFyZSBkaXNhYmxlZDpcIik7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBbdGl0bGUsIHN1YlRpdGxlXTtcblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyaW5nID0gZmFsc2U7XG5cdHByaXZhdGUgcmVhZG9ubHkgcmVyZW5kZXJEaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0QGRlYm91bmNlKDEwMClcblx0cHJpdmF0ZSBhc3luYyByZW5kZXIoKSB7XG5cdFx0Ly8gVGhlIGRlYm91bmNlZCByZW5kZXIgY2FuIGZpcmUgYWZ0ZXIgdGhlIGVkaXRvciBwYW5lIChhbmQgaXRzIHNjb3BlZFxuXHRcdC8vIGluc3RhbnRpYXRpb24gc2VydmljZSkgaGFzIGJlZW4gZGlzcG9zZWQuIEJhaWwgb3V0IHNvIHdlIG5ldmVyIGNhbGxcblx0XHQvLyBjcmVhdGVJbnN0YW5jZSBvbiBhIGRpc3Bvc2VkIEluc3RhbnRpYXRpb25TZXJ2aWNlLlxuXHRcdGlmICh0aGlzLl9zdG9yZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMucmVuZGVyaW5nKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5yZW5kZXJpbmcgPSB0cnVlO1xuXHRcdHRoaXMucmVyZW5kZXJEaXNwb3NhYmxlcy5jbGVhcigpO1xuXG5cdFx0Y29uc3QgaXNXb3Jrc3BhY2VUcnVzdGVkID0gdGhpcy53b3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlLmlzV29ya3NwYWNlVHJ1c3RlZCgpO1xuXHRcdHRoaXMucm9vdEVsZW1lbnQuY2xhc3NMaXN0LnRvZ2dsZSgndHJ1c3RlZCcsIGlzV29ya3NwYWNlVHJ1c3RlZCk7XG5cdFx0dGhpcy5yb290RWxlbWVudC5jbGFzc0xpc3QudG9nZ2xlKCd1bnRydXN0ZWQnLCAhaXNXb3Jrc3BhY2VUcnVzdGVkKTtcblxuXHRcdC8vIEhlYWRlciBTZWN0aW9uXG5cdFx0dGhpcy5oZWFkZXJUaXRsZVRleHQuaW5uZXJUZXh0ID0gdGhpcy5nZXRIZWFkZXJUaXRsZVRleHQoaXNXb3Jrc3BhY2VUcnVzdGVkKTtcblx0XHR0aGlzLmhlYWRlclRpdGxlSWNvbi5jbGFzc05hbWUgPSAnd29ya3NwYWNlLXRydXN0LXRpdGxlLWljb24nO1xuXHRcdHRoaXMuaGVhZGVyVGl0bGVJY29uLmNsYXNzTGlzdC5hZGQoLi4udGhpcy5nZXRIZWFkZXJUaXRsZUljb25DbGFzc05hbWVzKGlzV29ya3NwYWNlVHJ1c3RlZCkpO1xuXHRcdHRoaXMuaGVhZGVyRGVzY3JpcHRpb24uaW5uZXJUZXh0ID0gJyc7XG5cblx0XHRjb25zdCBoZWFkZXJEZXNjcmlwdGlvblRleHQgPSBhcHBlbmQodGhpcy5oZWFkZXJEZXNjcmlwdGlvbiwgJCgnZGl2JykpO1xuXHRcdGhlYWRlckRlc2NyaXB0aW9uVGV4dC5pbm5lclRleHQgPSBpc1dvcmtzcGFjZVRydXN0ZWQgP1xuXHRcdFx0bG9jYWxpemUoJ3RydXN0ZWREZXNjcmlwdGlvbicsIFwiQWxsIGZlYXR1cmVzIGFyZSBlbmFibGVkIGJlY2F1c2UgdHJ1c3QgaGFzIGJlZW4gZ3JhbnRlZCB0byB0aGUgd29ya3NwYWNlLlwiKSA6XG5cdFx0XHRsb2NhbGl6ZSgndW50cnVzdGVkRGVzY3JpcHRpb24nLCBcInswfSBpcyBpbiBhIHJlc3RyaWN0ZWQgbW9kZSBpbnRlbmRlZCBmb3Igc2FmZSBjb2RlIGJyb3dzaW5nLlwiLCB0aGlzLnByb2R1Y3RTZXJ2aWNlLm5hbWVTaG9ydCk7XG5cblx0XHRjb25zdCBoZWFkZXJEZXNjcmlwdGlvbkFjdGlvbnMgPSBhcHBlbmQodGhpcy5oZWFkZXJEZXNjcmlwdGlvbiwgJCgnZGl2JykpO1xuXHRcdGNvbnN0IGhlYWRlckRlc2NyaXB0aW9uQWN0aW9uc1RleHQgPSBsb2NhbGl6ZSh7IGtleTogJ3dvcmtzcGFjZVRydXN0RWRpdG9ySGVhZGVyQWN0aW9ucycsIGNvbW1lbnQ6IFsnUGxlYXNlIGVuc3VyZSB0aGUgbWFya2Rvd24gbGluayBzeW50YXggaXMgbm90IGJyb2tlbiB1cCB3aXRoIHdoaXRlc3BhY2UgW3RleHQgYmxvY2tdKGxpbmsgYmxvY2spJ10gfSwgXCJbQ29uZmlndXJlIHlvdXIgc2V0dGluZ3NdKHswfSkgb3IgW2xlYXJuIG1vcmVdKGh0dHBzOi8vYWthLm1zL3ZzY29kZS13b3Jrc3BhY2UtdHJ1c3QpLlwiLCBgY29tbWFuZDp3b3JrYmVuY2gudHJ1c3QuY29uZmlndXJlYCk7XG5cdFx0Zm9yIChjb25zdCBub2RlIG9mIHBhcnNlTGlua2VkVGV4dChoZWFkZXJEZXNjcmlwdGlvbkFjdGlvbnNUZXh0KS5ub2Rlcykge1xuXHRcdFx0aWYgKHR5cGVvZiBub2RlID09PSAnc3RyaW5nJykge1xuXHRcdFx0XHRhcHBlbmQoaGVhZGVyRGVzY3JpcHRpb25BY3Rpb25zLCBkb2N1bWVudC5jcmVhdGVUZXh0Tm9kZShub2RlKSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLnJlcmVuZGVyRGlzcG9zYWJsZXMuYWRkKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTGluaywgaGVhZGVyRGVzY3JpcHRpb25BY3Rpb25zLCB7IC4uLm5vZGUsIHRhYkluZGV4OiAtMSB9LCB7fSkpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMuaGVhZGVyQ29udGFpbmVyLmNsYXNzTmFtZSA9IHRoaXMuZ2V0SGVhZGVyQ29udGFpbmVyQ2xhc3MoaXNXb3Jrc3BhY2VUcnVzdGVkKTtcblx0XHR0aGlzLnJvb3RFbGVtZW50LnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIGAke2xvY2FsaXplKCdyb290IGVsZW1lbnQgbGFiZWwnLCBcIk1hbmFnZSBXb3Jrc3BhY2UgVHJ1c3RcIil9OiAgJHt0aGlzLmhlYWRlckNvbnRhaW5lci5pbm5lclRleHR9YCk7XG5cblx0XHQvLyBTZXR0aW5nc1xuXHRcdGNvbnN0IHJlc3RyaWN0ZWRTZXR0aW5ncyA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UucmVzdHJpY3RlZFNldHRpbmdzO1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25SZWdpc3RyeSA9IFJlZ2lzdHJ5LmFzPElDb25maWd1cmF0aW9uUmVnaXN0cnk+KEV4dGVuc2lvbnMuQ29uZmlndXJhdGlvbik7XG5cdFx0Y29uc3Qgc2V0dGluZ3NSZXF1aXJpbmdUcnVzdGVkV29ya3NwYWNlQ291bnQgPSByZXN0cmljdGVkU2V0dGluZ3MuZGVmYXVsdC5maWx0ZXIoa2V5ID0+IHtcblx0XHRcdGNvbnN0IHByb3BlcnR5ID0gY29uZmlndXJhdGlvblJlZ2lzdHJ5LmdldENvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzKClba2V5XTtcblxuXHRcdFx0Ly8gY2Fubm90IGJlIGNvbmZpZ3VyZWQgaW4gd29ya3NwYWNlXG5cdFx0XHRpZiAocHJvcGVydHkuc2NvcGUgJiYgKEFQUExJQ0FUSU9OX1NDT1BFUy5pbmNsdWRlcyhwcm9wZXJ0eS5zY29wZSkgfHwgcHJvcGVydHkuc2NvcGUgPT09IENvbmZpZ3VyYXRpb25TY29wZS5NQUNISU5FKSkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cblx0XHRcdC8vIElmIGRlcHJlY2F0ZWQgaW5jbHVkZSBvbmx5IHRob3NlIGNvbmZpZ3VyZWQgaW4gdGhlIHdvcmtzcGFjZVxuXHRcdFx0aWYgKHByb3BlcnR5LmRlcHJlY2F0aW9uTWVzc2FnZSB8fCBwcm9wZXJ0eS5tYXJrZG93bkRlcHJlY2F0aW9uTWVzc2FnZSkge1xuXHRcdFx0XHRpZiAocmVzdHJpY3RlZFNldHRpbmdzLndvcmtzcGFjZT8uaW5jbHVkZXMoa2V5KSkge1xuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChyZXN0cmljdGVkU2V0dGluZ3Mud29ya3NwYWNlRm9sZGVyKSB7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCB3b3Jrc3BhY2VGb2xkZXJTZXR0aW5ncyBvZiByZXN0cmljdGVkU2V0dGluZ3Mud29ya3NwYWNlRm9sZGVyLnZhbHVlcygpKSB7XG5cdFx0XHRcdFx0XHRpZiAod29ya3NwYWNlRm9sZGVyU2V0dGluZ3MuaW5jbHVkZXMoa2V5KSkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9KS5sZW5ndGg7XG5cblx0XHQvLyBGZWF0dXJlcyBMaXN0XG5cdFx0dGhpcy5yZW5kZXJBZmZlY3RlZEZlYXR1cmVzKHNldHRpbmdzUmVxdWlyaW5nVHJ1c3RlZFdvcmtzcGFjZUNvdW50LCB0aGlzLmdldEV4dGVuc2lvbkNvdW50KCkpO1xuXG5cdFx0Ly8gQ29uZmlndXJhdGlvbiBUcmVlXG5cdFx0dGhpcy53b3Jrc3BhY2VUcnVzdGVkVXJpc1RhYmxlLnVwZGF0ZVRhYmxlKCk7XG5cblx0XHR0aGlzLmJvZHlTY3JvbGxCYXIuZ2V0RG9tTm9kZSgpLnN0eWxlLmhlaWdodCA9IGBjYWxjKDEwMCUgLSAke3RoaXMuaGVhZGVyQ29udGFpbmVyLmNsaWVudEhlaWdodH1weClgO1xuXHRcdHRoaXMuYm9keVNjcm9sbEJhci5zY2FuRG9tTm9kZSgpO1xuXHRcdHRoaXMucmVuZGVyaW5nID0gZmFsc2U7XG5cdH1cblxuXHRwcml2YXRlIGdldEV4dGVuc2lvbkNvdW50KCk6IG51bWJlciB7XG5cdFx0Y29uc3Qgc2V0ID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cblx0XHRjb25zdCBpblZpcnR1YWxXb3Jrc3BhY2UgPSBpc1ZpcnR1YWxXb3Jrc3BhY2UodGhpcy53b3Jrc3BhY2VTZXJ2aWNlLmdldFdvcmtzcGFjZSgpKTtcblx0XHRjb25zdCBsb2NhbEV4dGVuc2lvbnMgPSB0aGlzLmV4dGVuc2lvbldvcmtiZW5jaFNlcnZpY2UubG9jYWwuZmlsdGVyKGV4dCA9PiBleHQubG9jYWwpLm1hcChleHQgPT4gZXh0LmxvY2FsISk7XG5cblx0XHRmb3IgKGNvbnN0IGV4dGVuc2lvbiBvZiBsb2NhbEV4dGVuc2lvbnMpIHtcblx0XHRcdGNvbnN0IGVuYWJsZW1lbnRTdGF0ZSA9IHRoaXMuZXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UuZ2V0RW5hYmxlbWVudFN0YXRlKGV4dGVuc2lvbik7XG5cdFx0XHRpZiAoZW5hYmxlbWVudFN0YXRlICE9PSBFbmFibGVtZW50U3RhdGUuRW5hYmxlZEdsb2JhbGx5ICYmIGVuYWJsZW1lbnRTdGF0ZSAhPT0gRW5hYmxlbWVudFN0YXRlLkVuYWJsZWRXb3Jrc3BhY2UgJiZcblx0XHRcdFx0ZW5hYmxlbWVudFN0YXRlICE9PSBFbmFibGVtZW50U3RhdGUuRGlzYWJsZWRCeVRydXN0UmVxdWlyZW1lbnQgJiYgZW5hYmxlbWVudFN0YXRlICE9PSBFbmFibGVtZW50U3RhdGUuRGlzYWJsZWRCeUV4dGVuc2lvbkRlcGVuZGVuY3kpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChpblZpcnR1YWxXb3Jrc3BhY2UgJiYgdGhpcy5leHRlbnNpb25NYW5pZmVzdFByb3BlcnRpZXNTZXJ2aWNlLmdldEV4dGVuc2lvblZpcnR1YWxXb3Jrc3BhY2VTdXBwb3J0VHlwZShleHRlbnNpb24ubWFuaWZlc3QpID09PSBmYWxzZSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHRoaXMuZXh0ZW5zaW9uTWFuaWZlc3RQcm9wZXJ0aWVzU2VydmljZS5nZXRFeHRlbnNpb25VbnRydXN0ZWRXb3Jrc3BhY2VTdXBwb3J0VHlwZShleHRlbnNpb24ubWFuaWZlc3QpICE9PSB0cnVlKSB7XG5cdFx0XHRcdHNldC5hZGQoZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQpO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgZGVwZW5kZW5jaWVzID0gZ2V0RXh0ZW5zaW9uRGVwZW5kZW5jaWVzKGxvY2FsRXh0ZW5zaW9ucywgZXh0ZW5zaW9uKTtcblx0XHRcdGlmIChkZXBlbmRlbmNpZXMuc29tZShleHQgPT4gdGhpcy5leHRlbnNpb25NYW5pZmVzdFByb3BlcnRpZXNTZXJ2aWNlLmdldEV4dGVuc2lvblVudHJ1c3RlZFdvcmtzcGFjZVN1cHBvcnRUeXBlKGV4dC5tYW5pZmVzdCkgPT09IGZhbHNlKSkge1xuXHRcdFx0XHRzZXQuYWRkKGV4dGVuc2lvbi5pZGVudGlmaWVyLmlkKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gc2V0LnNpemU7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZUhlYWRlckVsZW1lbnQocGFyZW50OiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHRoaXMuaGVhZGVyQ29udGFpbmVyID0gYXBwZW5kKHBhcmVudCwgJCgnLndvcmtzcGFjZS10cnVzdC1oZWFkZXInLCB7IHRhYkluZGV4OiAnMCcgfSkpO1xuXHRcdHRoaXMuaGVhZGVyVGl0bGVDb250YWluZXIgPSBhcHBlbmQodGhpcy5oZWFkZXJDb250YWluZXIsICQoJy53b3Jrc3BhY2UtdHJ1c3QtdGl0bGUnKSk7XG5cdFx0dGhpcy5oZWFkZXJUaXRsZUljb24gPSBhcHBlbmQodGhpcy5oZWFkZXJUaXRsZUNvbnRhaW5lciwgJCgnLndvcmtzcGFjZS10cnVzdC10aXRsZS1pY29uJykpO1xuXHRcdHRoaXMuaGVhZGVyVGl0bGVUZXh0ID0gYXBwZW5kKHRoaXMuaGVhZGVyVGl0bGVDb250YWluZXIsICQoJy53b3Jrc3BhY2UtdHJ1c3QtdGl0bGUtdGV4dCcpKTtcblx0XHR0aGlzLmhlYWRlckRlc2NyaXB0aW9uID0gYXBwZW5kKHRoaXMuaGVhZGVyQ29udGFpbmVyLCAkKCcud29ya3NwYWNlLXRydXN0LWRlc2NyaXB0aW9uJykpO1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVDb25maWd1cmF0aW9uRWxlbWVudChwYXJlbnQ6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0dGhpcy5jb25maWd1cmF0aW9uQ29udGFpbmVyID0gYXBwZW5kKHBhcmVudCwgJCgnLndvcmtzcGFjZS10cnVzdC1zZXR0aW5ncycsIHsgdGFiSW5kZXg6ICcwJyB9KSk7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblRpdGxlID0gYXBwZW5kKHRoaXMuY29uZmlndXJhdGlvbkNvbnRhaW5lciwgJCgnLndvcmtzcGFjZS10cnVzdGVkLWZvbGRlcnMtdGl0bGUnKSk7XG5cdFx0Y29uZmlndXJhdGlvblRpdGxlLmlubmVyVGV4dCA9IGxvY2FsaXplKCd0cnVzdGVkRm9sZGVyc0FuZFdvcmtzcGFjZXMnLCBcIlRydXN0ZWQgRm9sZGVycyAmIFdvcmtzcGFjZXNcIik7XG5cblx0XHR0aGlzLndvcmtzcGFjZVRydXN0ZWRVcmlzVGFibGUgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFdvcmtzcGFjZVRydXN0ZWRVcmlzVGFibGUsIHRoaXMuY29uZmlndXJhdGlvbkNvbnRhaW5lcikpO1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVBZmZlY3RlZEZlYXR1cmVzRWxlbWVudChwYXJlbnQ6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0dGhpcy5hZmZlY3RlZEZlYXR1cmVzQ29udGFpbmVyID0gYXBwZW5kKHBhcmVudCwgJCgnLndvcmtzcGFjZS10cnVzdC1mZWF0dXJlcycpKTtcblx0XHR0aGlzLnRydXN0ZWRDb250YWluZXIgPSBhcHBlbmQodGhpcy5hZmZlY3RlZEZlYXR1cmVzQ29udGFpbmVyLCAkKCcud29ya3NwYWNlLXRydXN0LWxpbWl0YXRpb25zLnRydXN0ZWQnLCB7IHRhYkluZGV4OiAnMCcgfSkpO1xuXHRcdHRoaXMudW50cnVzdGVkQ29udGFpbmVyID0gYXBwZW5kKHRoaXMuYWZmZWN0ZWRGZWF0dXJlc0NvbnRhaW5lciwgJCgnLndvcmtzcGFjZS10cnVzdC1saW1pdGF0aW9ucy51bnRydXN0ZWQnLCB7IHRhYkluZGV4OiAnMCcgfSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyByZW5kZXJBZmZlY3RlZEZlYXR1cmVzKG51bVNldHRpbmdzOiBudW1iZXIsIG51bUV4dGVuc2lvbnM6IG51bWJlcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNsZWFyTm9kZSh0aGlzLnRydXN0ZWRDb250YWluZXIpO1xuXHRcdGNsZWFyTm9kZSh0aGlzLnVudHJ1c3RlZENvbnRhaW5lcik7XG5cblx0XHQvLyBUcnVzdGVkIGZlYXR1cmVzXG5cdFx0Y29uc3QgW3RydXN0ZWRUaXRsZSwgdHJ1c3RlZFN1YlRpdGxlXSA9IHRoaXMuZ2V0RmVhdHVyZXNIZWFkZXJUZXh0KHRydWUpO1xuXG5cdFx0dGhpcy5yZW5kZXJMaW1pdGF0aW9uc0hlYWRlckVsZW1lbnQodGhpcy50cnVzdGVkQ29udGFpbmVyLCB0cnVzdGVkVGl0bGUsIHRydXN0ZWRTdWJUaXRsZSk7XG5cdFx0Y29uc3QgdHJ1c3RlZENvbnRhaW5lckl0ZW1zID0gdGhpcy53b3Jrc3BhY2VTZXJ2aWNlLmdldFdvcmtiZW5jaFN0YXRlKCkgPT09IFdvcmtiZW5jaFN0YXRlLkVNUFRZID9cblx0XHRcdFtcblx0XHRcdFx0bG9jYWxpemUoJ3RydXN0ZWRUYXNrcycsIFwiVGFza3MgYXJlIGFsbG93ZWQgdG8gcnVuXCIpLFxuXHRcdFx0XHRsb2NhbGl6ZSgndHJ1c3RlZERlYnVnZ2luZycsIFwiRGVidWdnaW5nIGlzIGVuYWJsZWRcIiksXG5cdFx0XHRcdGxvY2FsaXplKCd0cnVzdGVkRXh0ZW5zaW9ucycsIFwiQWxsIGVuYWJsZWQgZXh0ZW5zaW9ucyBhcmUgYWN0aXZhdGVkXCIpXG5cdFx0XHRdIDpcblx0XHRcdFtcblx0XHRcdFx0bG9jYWxpemUoJ3RydXN0ZWRUYXNrcycsIFwiVGFza3MgYXJlIGFsbG93ZWQgdG8gcnVuXCIpLFxuXHRcdFx0XHRsb2NhbGl6ZSgndHJ1c3RlZERlYnVnZ2luZycsIFwiRGVidWdnaW5nIGlzIGVuYWJsZWRcIiksXG5cdFx0XHRcdGxvY2FsaXplKCd0cnVzdGVkU2V0dGluZ3MnLCBcIkFsbCB3b3Jrc3BhY2Ugc2V0dGluZ3MgYXJlIGFwcGxpZWRcIiksXG5cdFx0XHRcdGxvY2FsaXplKCd0cnVzdGVkRXh0ZW5zaW9ucycsIFwiQWxsIGVuYWJsZWQgZXh0ZW5zaW9ucyBhcmUgYWN0aXZhdGVkXCIpXG5cdFx0XHRdO1xuXHRcdHRoaXMucmVuZGVyTGltaXRhdGlvbnNMaXN0RWxlbWVudCh0aGlzLnRydXN0ZWRDb250YWluZXIsIHRydXN0ZWRDb250YWluZXJJdGVtcywgVGhlbWVJY29uLmFzQ2xhc3NOYW1lQXJyYXkoY2hlY2tMaXN0SWNvbikpO1xuXG5cdFx0Ly8gUmVzdHJpY3RlZCBNb2RlIGZlYXR1cmVzXG5cdFx0Y29uc3QgW3VudHJ1c3RlZFRpdGxlLCB1bnRydXN0ZWRTdWJUaXRsZV0gPSB0aGlzLmdldEZlYXR1cmVzSGVhZGVyVGV4dChmYWxzZSk7XG5cblx0XHR0aGlzLnJlbmRlckxpbWl0YXRpb25zSGVhZGVyRWxlbWVudCh0aGlzLnVudHJ1c3RlZENvbnRhaW5lciwgdW50cnVzdGVkVGl0bGUsIHVudHJ1c3RlZFN1YlRpdGxlKTtcblx0XHRjb25zdCB1bnRydXN0ZWRDb250YWluZXJJdGVtcyA9IHRoaXMud29ya3NwYWNlU2VydmljZS5nZXRXb3JrYmVuY2hTdGF0ZSgpID09PSBXb3JrYmVuY2hTdGF0ZS5FTVBUWSA/XG5cdFx0XHRbXG5cdFx0XHRcdGxvY2FsaXplKCd1bnRydXN0ZWRUYXNrcycsIFwiVGFza3MgYXJlIG5vdCBhbGxvd2VkIHRvIHJ1blwiKSxcblx0XHRcdFx0bG9jYWxpemUoJ3VudHJ1c3RlZERlYnVnZ2luZycsIFwiRGVidWdnaW5nIGlzIGRpc2FibGVkXCIpLFxuXHRcdFx0XHRmaXhCYWRMb2NhbGl6ZWRMaW5rcyhsb2NhbGl6ZSh7IGtleTogJ3VudHJ1c3RlZEV4dGVuc2lvbnMnLCBjb21tZW50OiBbJ1BsZWFzZSBlbnN1cmUgdGhlIG1hcmtkb3duIGxpbmsgc3ludGF4IGlzIG5vdCBicm9rZW4gdXAgd2l0aCB3aGl0ZXNwYWNlIFt0ZXh0IGJsb2NrXShsaW5rIGJsb2NrKSddIH0sIFwiW3swfSBleHRlbnNpb25zXSh7MX0pIGFyZSBkaXNhYmxlZCBvciBoYXZlIGxpbWl0ZWQgZnVuY3Rpb25hbGl0eVwiLCBudW1FeHRlbnNpb25zLCBgY29tbWFuZDoke0xJU1RfV09SS1NQQUNFX1VOU1VQUE9SVEVEX0VYVEVOU0lPTlNfQ09NTUFORF9JRH1gKSlcblx0XHRcdF0gOlxuXHRcdFx0W1xuXHRcdFx0XHRsb2NhbGl6ZSgndW50cnVzdGVkVGFza3MnLCBcIlRhc2tzIGFyZSBub3QgYWxsb3dlZCB0byBydW5cIiksXG5cdFx0XHRcdGxvY2FsaXplKCd1bnRydXN0ZWREZWJ1Z2dpbmcnLCBcIkRlYnVnZ2luZyBpcyBkaXNhYmxlZFwiKSxcblx0XHRcdFx0Zml4QmFkTG9jYWxpemVkTGlua3MobnVtU2V0dGluZ3MgPyBsb2NhbGl6ZSh7IGtleTogJ3VudHJ1c3RlZFNldHRpbmdzJywgY29tbWVudDogWydQbGVhc2UgZW5zdXJlIHRoZSBtYXJrZG93biBsaW5rIHN5bnRheCBpcyBub3QgYnJva2VuIHVwIHdpdGggd2hpdGVzcGFjZSBbdGV4dCBibG9ja10obGluayBibG9jayknXSB9LCBcIlt7MH0gd29ya3NwYWNlIHNldHRpbmdzXSh7MX0pIGFyZSBub3QgYXBwbGllZFwiLCBudW1TZXR0aW5ncywgJ2NvbW1hbmQ6c2V0dGluZ3MuZmlsdGVyVW50cnVzdGVkJykgOiBsb2NhbGl6ZSgnbm8gdW50cnVzdGVkU2V0dGluZ3MnLCBcIldvcmtzcGFjZSBzZXR0aW5ncyByZXF1aXJpbmcgdHJ1c3QgYXJlIG5vdCBhcHBsaWVkXCIpKSxcblx0XHRcdFx0Zml4QmFkTG9jYWxpemVkTGlua3MobG9jYWxpemUoeyBrZXk6ICd1bnRydXN0ZWRFeHRlbnNpb25zJywgY29tbWVudDogWydQbGVhc2UgZW5zdXJlIHRoZSBtYXJrZG93biBsaW5rIHN5bnRheCBpcyBub3QgYnJva2VuIHVwIHdpdGggd2hpdGVzcGFjZSBbdGV4dCBibG9ja10obGluayBibG9jayknXSB9LCBcIlt7MH0gZXh0ZW5zaW9uc10oezF9KSBhcmUgZGlzYWJsZWQgb3IgaGF2ZSBsaW1pdGVkIGZ1bmN0aW9uYWxpdHlcIiwgbnVtRXh0ZW5zaW9ucywgYGNvbW1hbmQ6JHtMSVNUX1dPUktTUEFDRV9VTlNVUFBPUlRFRF9FWFRFTlNJT05TX0NPTU1BTkRfSUR9YCkpXG5cdFx0XHRdO1xuXHRcdHRoaXMucmVuZGVyTGltaXRhdGlvbnNMaXN0RWxlbWVudCh0aGlzLnVudHJ1c3RlZENvbnRhaW5lciwgdW50cnVzdGVkQ29udGFpbmVySXRlbXMsIFRoZW1lSWNvbi5hc0NsYXNzTmFtZUFycmF5KHhMaXN0SWNvbikpO1xuXG5cdFx0aWYgKHRoaXMud29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZS5pc1dvcmtzcGFjZVRydXN0ZWQoKSkge1xuXHRcdFx0aWYgKHRoaXMud29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZS5jYW5TZXRXb3Jrc3BhY2VUcnVzdCgpKSB7XG5cdFx0XHRcdHRoaXMuYWRkRG9udFRydXN0QnV0dG9uVG9FbGVtZW50KHRoaXMudW50cnVzdGVkQ29udGFpbmVyKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuYWRkVHJ1c3RlZFRleHRUb0VsZW1lbnQodGhpcy51bnRydXN0ZWRDb250YWluZXIpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRpZiAodGhpcy53b3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlLmNhblNldFdvcmtzcGFjZVRydXN0KCkpIHtcblx0XHRcdFx0dGhpcy5hZGRUcnVzdEJ1dHRvblRvRWxlbWVudCh0aGlzLnRydXN0ZWRDb250YWluZXIpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlQnV0dG9uUm93KHBhcmVudDogSFRNTEVsZW1lbnQsIGJ1dHRvbkluZm86IHsgYWN0aW9uOiBBY3Rpb247IGtleWJpbmRpbmc6IFJlc29sdmVkS2V5YmluZGluZyB9W10sIGVuYWJsZWQ/OiBib29sZWFuKTogdm9pZCB7XG5cdFx0Y29uc3QgYnV0dG9uUm93ID0gYXBwZW5kKHBhcmVudCwgJCgnLndvcmtzcGFjZS10cnVzdC1idXR0b25zLXJvdycpKTtcblx0XHRjb25zdCBidXR0b25Db250YWluZXIgPSBhcHBlbmQoYnV0dG9uUm93LCAkKCcud29ya3NwYWNlLXRydXN0LWJ1dHRvbnMnKSk7XG5cdFx0Y29uc3QgYnV0dG9uQmFyID0gdGhpcy5yZXJlbmRlckRpc3Bvc2FibGVzLmFkZChuZXcgQnV0dG9uQmFyKGJ1dHRvbkNvbnRhaW5lcikpO1xuXG5cdFx0Zm9yIChjb25zdCB7IGFjdGlvbiwga2V5YmluZGluZyB9IG9mIGJ1dHRvbkluZm8pIHtcblx0XHRcdGNvbnN0IGJ1dHRvbiA9IGJ1dHRvbkJhci5hZGRCdXR0b25XaXRoRGVzY3JpcHRpb24oZGVmYXVsdEJ1dHRvblN0eWxlcyk7XG5cblx0XHRcdGJ1dHRvbi5sYWJlbCA9IGFjdGlvbi5sYWJlbDtcblx0XHRcdGJ1dHRvbi5lbmFibGVkID0gZW5hYmxlZCAhPT0gdW5kZWZpbmVkID8gZW5hYmxlZCA6IGFjdGlvbi5lbmFibGVkO1xuXHRcdFx0YnV0dG9uLmRlc2NyaXB0aW9uID0ga2V5YmluZGluZy5nZXRMYWJlbCgpITtcblx0XHRcdGJ1dHRvbi5lbGVtZW50LmFyaWFMYWJlbCA9IGFjdGlvbi5sYWJlbCArICcsICcgKyBsb2NhbGl6ZSgna2V5Ym9hcmRTaG9ydGN1dCcsIFwiS2V5Ym9hcmQgU2hvcnRjdXQ6IHswfVwiLCBrZXliaW5kaW5nLmdldEFyaWFMYWJlbCgpISk7XG5cblx0XHRcdHRoaXMucmVyZW5kZXJEaXNwb3NhYmxlcy5hZGQoYnV0dG9uLm9uRGlkQ2xpY2soZSA9PiB7XG5cdFx0XHRcdGlmIChlKSB7XG5cdFx0XHRcdFx0RXZlbnRIZWxwZXIuc3RvcChlLCB0cnVlKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGFjdGlvbi5ydW4oKTtcblx0XHRcdH0pKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFkZFRydXN0QnV0dG9uVG9FbGVtZW50KHBhcmVudDogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRjb25zdCB0cnVzdEFjdGlvbiA9IHRoaXMucmVyZW5kZXJEaXNwb3NhYmxlcy5hZGQobmV3IEFjdGlvbignd29ya3NwYWNlLnRydXN0LmJ1dHRvbi5hY3Rpb24uZ3JhbnQnLCBsb2NhbGl6ZSgndHJ1c3RCdXR0b24nLCBcIlRydXN0XCIpLCB1bmRlZmluZWQsIHRydWUsIGFzeW5jICgpID0+IHtcblx0XHRcdGF3YWl0IHRoaXMud29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZS5zZXRXb3Jrc3BhY2VUcnVzdCh0cnVlKTtcblx0XHR9KSk7XG5cblx0XHRjb25zdCB0cnVzdEFjdGlvbnMgPSBbeyBhY3Rpb246IHRydXN0QWN0aW9uLCBrZXliaW5kaW5nOiB0aGlzLmtleWJpbmRpbmdTZXJ2aWNlLnJlc29sdmVVc2VyQmluZGluZyhpc01hY2ludG9zaCA/ICdDbWQrRW50ZXInIDogJ0N0cmwrRW50ZXInKVswXSB9XTtcblxuXHRcdHRoaXMuY3JlYXRlQnV0dG9uUm93KHBhcmVudCwgdHJ1c3RBY3Rpb25zKTtcblx0fVxuXG5cdHByaXZhdGUgYWRkRG9udFRydXN0QnV0dG9uVG9FbGVtZW50KHBhcmVudDogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHR0aGlzLmNyZWF0ZUJ1dHRvblJvdyhwYXJlbnQsIFt7XG5cdFx0XHRhY3Rpb246IHRoaXMucmVyZW5kZXJEaXNwb3NhYmxlcy5hZGQobmV3IEFjdGlvbignd29ya3NwYWNlLnRydXN0LmJ1dHRvbi5hY3Rpb24uZGVueScsIGxvY2FsaXplKCdkb250VHJ1c3RCdXR0b24nLCBcIkRvbid0IFRydXN0XCIpLCB1bmRlZmluZWQsIHRydWUsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0YXdhaXQgdGhpcy53b3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlLnNldFdvcmtzcGFjZVRydXN0KGZhbHNlKTtcblx0XHRcdH0pKSxcblx0XHRcdGtleWJpbmRpbmc6IHRoaXMua2V5YmluZGluZ1NlcnZpY2UucmVzb2x2ZVVzZXJCaW5kaW5nKGlzTWFjaW50b3NoID8gJ0NtZCtFbnRlcicgOiAnQ3RybCtFbnRlcicpWzBdXG5cdFx0fV0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhZGRUcnVzdGVkVGV4dFRvRWxlbWVudChwYXJlbnQ6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0aWYgKHRoaXMud29ya3NwYWNlU2VydmljZS5nZXRXb3JrYmVuY2hTdGF0ZSgpID09PSBXb3JrYmVuY2hTdGF0ZS5FTVBUWSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHRleHRFbGVtZW50ID0gYXBwZW5kKHBhcmVudCwgJCgnLndvcmtzcGFjZS10cnVzdC11bnRydXN0ZWQtZGVzY3JpcHRpb24nKSk7XG5cdFx0aWYgKCF0aGlzLndvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UuaXNXb3Jrc3BhY2VUcnVzdEZvcmNlZCgpKSB7XG5cdFx0XHR0ZXh0RWxlbWVudC5pbm5lclRleHQgPSB0aGlzLndvcmtzcGFjZVNlcnZpY2UuZ2V0V29ya2JlbmNoU3RhdGUoKSA9PT0gV29ya2JlbmNoU3RhdGUuV09SS1NQQUNFID8gbG9jYWxpemUoJ3VudHJ1c3RlZFdvcmtzcGFjZVJlYXNvbicsIFwiVGhpcyB3b3Jrc3BhY2UgaXMgdHJ1c3RlZCB2aWEgdGhlIGJvbGRlZCBlbnRyaWVzIGluIHRoZSB0cnVzdGVkIGZvbGRlcnMgYmVsb3cuXCIpIDogbG9jYWxpemUoJ3VudHJ1c3RlZEZvbGRlclJlYXNvbicsIFwiVGhpcyBmb2xkZXIgaXMgdHJ1c3RlZCB2aWEgdGhlIGJvbGRlZCBlbnRyaWVzIGluIHRoZSB0cnVzdGVkIGZvbGRlcnMgYmVsb3cuXCIpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0ZXh0RWxlbWVudC5pbm5lclRleHQgPSBsb2NhbGl6ZSgndHJ1c3RlZEZvcmNlZFJlYXNvbicsIFwiVGhpcyB3aW5kb3cgaXMgdHJ1c3RlZCBieSBuYXR1cmUgb2YgdGhlIHdvcmtzcGFjZSB0aGF0IGlzIG9wZW5lZC5cIik7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJMaW1pdGF0aW9uc0hlYWRlckVsZW1lbnQocGFyZW50OiBIVE1MRWxlbWVudCwgaGVhZGVyVGV4dDogc3RyaW5nLCBzdWJ0aXRsZVRleHQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IGxpbWl0YXRpb25zSGVhZGVyQ29udGFpbmVyID0gYXBwZW5kKHBhcmVudCwgJCgnLndvcmtzcGFjZS10cnVzdC1saW1pdGF0aW9ucy1oZWFkZXInKSk7XG5cdFx0Y29uc3QgdGl0bGVFbGVtZW50ID0gYXBwZW5kKGxpbWl0YXRpb25zSGVhZGVyQ29udGFpbmVyLCAkKCcud29ya3NwYWNlLXRydXN0LWxpbWl0YXRpb25zLXRpdGxlJykpO1xuXHRcdGNvbnN0IHRleHRFbGVtZW50ID0gYXBwZW5kKHRpdGxlRWxlbWVudCwgJCgnLndvcmtzcGFjZS10cnVzdC1saW1pdGF0aW9ucy10aXRsZS10ZXh0JykpO1xuXHRcdGNvbnN0IHN1YnRpdGxlRWxlbWVudCA9IGFwcGVuZChsaW1pdGF0aW9uc0hlYWRlckNvbnRhaW5lciwgJCgnLndvcmtzcGFjZS10cnVzdC1saW1pdGF0aW9ucy1zdWJ0aXRsZScpKTtcblxuXHRcdHRleHRFbGVtZW50LmlubmVyVGV4dCA9IGhlYWRlclRleHQ7XG5cdFx0c3VidGl0bGVFbGVtZW50LmlubmVyVGV4dCA9IHN1YnRpdGxlVGV4dDtcblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyTGltaXRhdGlvbnNMaXN0RWxlbWVudChwYXJlbnQ6IEhUTUxFbGVtZW50LCBsaW1pdGF0aW9uczogc3RyaW5nW10sIGljb25DbGFzc05hbWVzOiBzdHJpbmdbXSk6IHZvaWQge1xuXHRcdGNvbnN0IGxpc3RDb250YWluZXIgPSBhcHBlbmQocGFyZW50LCAkKCcud29ya3NwYWNlLXRydXN0LWxpbWl0YXRpb25zLWxpc3QtY29udGFpbmVyJykpO1xuXHRcdGNvbnN0IGxpbWl0YXRpb25zTGlzdCA9IGFwcGVuZChsaXN0Q29udGFpbmVyLCAkKCd1bCcpKTtcblx0XHRmb3IgKGNvbnN0IGxpbWl0YXRpb24gb2YgbGltaXRhdGlvbnMpIHtcblx0XHRcdGNvbnN0IGxpbWl0YXRpb25MaXN0SXRlbSA9IGFwcGVuZChsaW1pdGF0aW9uc0xpc3QsICQoJ2xpJykpO1xuXHRcdFx0Y29uc3QgaWNvbiA9IGFwcGVuZChsaW1pdGF0aW9uTGlzdEl0ZW0sICQoJy5saXN0LWl0ZW0taWNvbicpKTtcblx0XHRcdGNvbnN0IHRleHQgPSBhcHBlbmQobGltaXRhdGlvbkxpc3RJdGVtLCAkKCcubGlzdC1pdGVtLXRleHQnKSk7XG5cblx0XHRcdGljb24uY2xhc3NMaXN0LmFkZCguLi5pY29uQ2xhc3NOYW1lcyk7XG5cblx0XHRcdGNvbnN0IGxpbmtlZFRleHQgPSBwYXJzZUxpbmtlZFRleHQobGltaXRhdGlvbik7XG5cdFx0XHRmb3IgKGNvbnN0IG5vZGUgb2YgbGlua2VkVGV4dC5ub2Rlcykge1xuXHRcdFx0XHRpZiAodHlwZW9mIG5vZGUgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdFx0YXBwZW5kKHRleHQsIGRvY3VtZW50LmNyZWF0ZVRleHROb2RlKG5vZGUpKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLnJlcmVuZGVyRGlzcG9zYWJsZXMuYWRkKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTGluaywgdGV4dCwgeyAuLi5ub2RlLCB0YWJJbmRleDogLTEgfSwge30pKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgbGF5b3V0UGFydGljaXBhbnRzOiB7IGxheW91dDogKCkgPT4gdm9pZCB9W10gPSBbXTtcblx0bGF5b3V0KGRpbWVuc2lvbjogRGltZW5zaW9uKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmlzVmlzaWJsZSgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy53b3Jrc3BhY2VUcnVzdGVkVXJpc1RhYmxlLmxheW91dCgpO1xuXG5cdFx0dGhpcy5sYXlvdXRQYXJ0aWNpcGFudHMuZm9yRWFjaChwYXJ0aWNpcGFudCA9PiB7XG5cdFx0XHRwYXJ0aWNpcGFudC5sYXlvdXQoKTtcblx0XHR9KTtcblxuXHRcdHRoaXMuYm9keVNjcm9sbEJhci5zY2FuRG9tTm9kZSgpO1xuXHR9XG59XG5cbi8vIEhpZ2hseSBzY29wZWQgZml4IGZvciAjMTI2NjE0XG5mdW5jdGlvbiBmaXhCYWRMb2NhbGl6ZWRMaW5rcyhiYWRTdHJpbmc6IHN0cmluZyk6IHN0cmluZyB7XG5cdGNvbnN0IHJlZ2V4ID0gLyguKilcXFsoLispXFxdXFxzKlxcKCguKylcXCkoLiopLzsgLy8gbWFya2Rvd24gbGluayBtYXRjaCB3aXRoIHNwYWNlc1xuXHRyZXR1cm4gYmFkU3RyaW5nLnJlcGxhY2UocmVnZXgsICckMVskMl0oJDMp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
