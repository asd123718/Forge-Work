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
import "./media/projectBarPart.css";
import { Part } from "../../../workbench/browser/part.js";
import { IWorkbenchLayoutService, Position } from "../../../workbench/services/layout/browser/layoutService.js";
import { IThemeService } from "../../../platform/theme/common/themeService.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../platform/storage/common/storage.js";
import { IWorkspaceContextService } from "../../../platform/workspace/common/workspace.js";
import { IHoverService } from "../../../platform/hover/browser/hover.js";
import { DisposableStore, MutableDisposable } from "../../../base/common/lifecycle.js";
import { $, addDisposableListener, append, clearNode, Dimension, EventType, getActiveDocument, getWindow } from "../../../base/browser/dom.js";
import { Emitter } from "../../../base/common/event.js";
import { ACTIVITY_BAR_BACKGROUND, ACTIVITY_BAR_BADGE_BACKGROUND, ACTIVITY_BAR_BADGE_FOREGROUND, ACTIVITY_BAR_BORDER, ACTIVITY_BAR_FOREGROUND, ACTIVITY_BAR_INACTIVE_FOREGROUND } from "../../../workbench/common/theme.js";
import { contrastBorder } from "../../../platform/theme/common/colorRegistry.js";
import { assertReturnsDefined } from "../../../base/common/types.js";
import { ThemeIcon } from "../../../base/common/themables.js";
import { Codicon } from "../../../base/common/codicons.js";
import { codiconsLibrary } from "../../../base/common/codiconsLibrary.js";
import { Lazy } from "../../../base/common/lazy.js";
import { HoverPosition } from "../../../base/browser/ui/hover/hoverWidget.js";
import { GlobalCompositeBar } from "../../../workbench/browser/parts/globalCompositeBar.js";
import { IInstantiationService } from "../../../platform/instantiation/common/instantiation.js";
import { Action, Separator } from "../../../base/common/actions.js";
import { URI } from "../../../base/common/uri.js";
import { IFileDialogService } from "../../../platform/dialogs/common/dialogs.js";
import { IPathService } from "../../../workbench/services/path/common/pathService.js";
import { IWorkspaceEditingService } from "../../../workbench/services/workspaces/common/workspaceEditing.js";
import { ILabelService } from "../../../platform/label/common/label.js";
import { basename } from "../../../base/common/resources.js";
import { IContextMenuService } from "../../../platform/contextview/browser/contextView.js";
import { StandardMouseEvent } from "../../../base/browser/mouseEvent.js";
import { IQuickInputService } from "../../../platform/quickinput/common/quickInput.js";
import { getIconRegistry } from "../../../platform/theme/common/iconRegistry.js";
import { defaultInputBoxStyles } from "../../../platform/theme/browser/defaultStyles.js";
import { WorkbenchIconSelectBox } from "../../../workbench/services/userDataProfile/browser/iconSelectBox.js";
import { localize } from "../../../nls.js";
import { AgenticParts } from "./parts.js";
const HOVER_GROUP_ID = "projectbar";
const PROJECT_BAR_FOLDERS_KEY = "workbench.agentsession.projectbar.folders";
const icons = new Lazy(() => {
  const iconDefinitions = getIconRegistry().getIcons();
  const includedChars = /* @__PURE__ */ new Set();
  const dedupedIcons = iconDefinitions.filter((e) => {
    if (e.id === codiconsLibrary.blank.id) {
      return false;
    }
    if (ThemeIcon.isThemeIcon(e.defaults)) {
      return false;
    }
    if (includedChars.has(e.defaults.fontCharacter)) {
      return false;
    }
    includedChars.add(e.defaults.fontCharacter);
    return true;
  });
  return dedupedIcons;
});
let ProjectBarPart = class extends Part {
  constructor(layoutService, themeService, storageService, workspaceContextService, fileDialogService, pathService, workspaceEditingService, labelService, hoverService, contextMenuService, quickInputService, instantiationService) {
    super(AgenticParts.PROJECTBAR_PART, { hasTitle: false }, themeService, storageService, layoutService);
    this.storageService = storageService;
    this.workspaceContextService = workspaceContextService;
    this.fileDialogService = fileDialogService;
    this.pathService = pathService;
    this.workspaceEditingService = workspaceEditingService;
    this.labelService = labelService;
    this.hoverService = hoverService;
    this.contextMenuService = contextMenuService;
    this.quickInputService = quickInputService;
    this.instantiationService = instantiationService;
    //#region IView
    this.minimumWidth = 48;
    this.maximumWidth = 48;
    this.minimumHeight = 0;
    this.maximumHeight = Number.POSITIVE_INFINITY;
    this.entries = [];
    this.workspaceEntryDisposables = this._register(new MutableDisposable());
    this._onDidSelectWorkspace = this._register(new Emitter());
    this.onDidSelectWorkspace = this._onDidSelectWorkspace.event;
    this.globalCompositeBar = this._register(instantiationService.createInstance(
      GlobalCompositeBar,
      () => this.getContextMenuActions(),
      (theme) => ({
        activeForegroundColor: theme.getColor(ACTIVITY_BAR_FOREGROUND),
        inactiveForegroundColor: theme.getColor(ACTIVITY_BAR_INACTIVE_FOREGROUND),
        badgeBackground: theme.getColor(ACTIVITY_BAR_BADGE_BACKGROUND),
        badgeForeground: theme.getColor(ACTIVITY_BAR_BADGE_FOREGROUND),
        activeBackgroundColor: void 0,
        inactiveBackgroundColor: void 0,
        activeBorderBottomColor: void 0
      }),
      {
        position: () => this.layoutService.getSideBarPosition() === Position.LEFT ? HoverPosition.RIGHT : HoverPosition.LEFT
      }
    ));
    this.loadEntriesFromStorage();
  }
  getContextMenuActions() {
    return this.globalCompositeBar.getContextMenuActions();
  }
  loadEntriesFromStorage() {
    const raw = this.storageService.get(PROJECT_BAR_FOLDERS_KEY, StorageScope.WORKSPACE);
    if (raw) {
      try {
        const data = JSON.parse(raw);
        this.entries = data.map((item) => {
          if (typeof item === "string") {
            const uri = URI.parse(item);
            return { uri, name: basename(uri), displayType: "letter" };
          } else {
            const uri = URI.parse(item.uri);
            return {
              uri,
              name: basename(uri),
              displayType: item.displayType ?? "letter",
              iconId: item.iconId
            };
          }
        });
      } catch {
        this.entries = [];
      }
    } else {
      this.entries = [];
    }
    const currentFolders = this.workspaceContextService.getWorkspace().folders;
    this._selectedFolderUri = currentFolders.length > 0 ? currentFolders[0].uri : void 0;
  }
  saveEntriesToStorage() {
    const data = this.entries.map((e) => ({
      uri: e.uri.toString(),
      displayType: e.displayType,
      iconId: e.iconId
    }));
    this.storageService.store(PROJECT_BAR_FOLDERS_KEY, JSON.stringify(data), StorageScope.WORKSPACE, StorageTarget.MACHINE);
  }
  addFolderEntry(uri) {
    if (this.entries.some((e) => e.uri.toString() === uri.toString())) {
      return;
    }
    this.entries.push({ uri, name: basename(uri), displayType: "letter" });
    this.saveEntriesToStorage();
    this._selectedFolderUri = uri;
    this.saveEntriesToStorage();
    this.applySelectedFolder();
    this._onDidSelectWorkspace.fire(this._selectedFolderUri);
    this.renderContent();
  }
  async applySelectedFolder() {
    if (!this._selectedFolderUri) {
      return;
    }
    const currentFolders = this.workspaceContextService.getWorkspace().folders;
    const foldersToRemove = currentFolders.map((f) => f.uri);
    await this.workspaceEditingService.updateFolders(
      0,
      foldersToRemove.length,
      [{ uri: this._selectedFolderUri }]
    );
  }
  createContentArea(parent) {
    this.element = parent;
    this.content = append(this.element, $(".content"));
    this.actionsContainer = append(this.content, $(".actions-container"));
    this.renderContent();
    this.globalCompositeBar.create(this.content);
    return this.content;
  }
  renderContent() {
    if (!this.actionsContainer) {
      return;
    }
    clearNode(this.actionsContainer);
    this.workspaceEntryDisposables.value = new DisposableStore();
    this.createAddFolderButton(this.actionsContainer);
    this.createWorkspaceEntries(this.actionsContainer);
  }
  createAddFolderButton(container) {
    this.addFolderButton = append(container, $(".action-item.add-folder"));
    const actionLabel = append(this.addFolderButton, $("span.action-label"));
    actionLabel.classList.add(...ThemeIcon.asClassNameArray(Codicon.add));
    this.workspaceEntryDisposables.value?.add(
      this.hoverService.setupDelayedHover(
        this.addFolderButton,
        {
          appearance: { showPointer: true },
          position: { hoverPosition: HoverPosition.RIGHT },
          content: "Add Folder to Project"
        },
        { groupId: HOVER_GROUP_ID }
      )
    );
    this.workspaceEntryDisposables.value?.add(
      addDisposableListener(this.addFolderButton, EventType.CLICK, () => {
        this.pickAndAddFolder();
      })
    );
    this.addFolderButton.setAttribute("tabindex", "0");
    this.addFolderButton.setAttribute("role", "button");
    this.addFolderButton.setAttribute("aria-label", "Add Folder to Project");
    this.workspaceEntryDisposables.value?.add(
      addDisposableListener(this.addFolderButton, EventType.KEY_DOWN, (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          this.pickAndAddFolder();
        }
      })
    );
  }
  async pickAndAddFolder() {
    const folders = await this.fileDialogService.showOpenDialog({
      openLabel: "Add",
      title: "Add Folder to Project",
      canSelectFolders: true,
      canSelectMany: false,
      defaultUri: await this.fileDialogService.defaultFolderPath(),
      availableFileSystems: [this.pathService.defaultUriScheme]
    });
    if (folders?.length) {
      this.addFolderEntry(folders[0]);
    }
  }
  createWorkspaceEntries(container) {
    for (let i = 0; i < this.entries.length; i++) {
      this.createWorkspaceEntry(container, this.entries[i], i);
    }
    if (this.entries.length > 0 && this._selectedFolderUri) {
      this._onDidSelectWorkspace.fire(this._selectedFolderUri);
    }
  }
  createWorkspaceEntry(container, entry, index) {
    const entryDisposables = this.workspaceEntryDisposables.value;
    const entryElement = append(container, $(".action-item.workspace-entry"));
    const actionLabel = append(entryElement, $("span.action-label.workspace-icon"));
    append(entryElement, $("span.active-item-indicator"));
    const folderName = entry.name;
    if (entry.displayType === "icon" && entry.iconId) {
      const icon = ThemeIcon.fromId(entry.iconId);
      actionLabel.classList.add(...ThemeIcon.asClassNameArray(icon));
      actionLabel.classList.add("codicon-icon");
      actionLabel.textContent = "";
    } else {
      const firstLetter = folderName.charAt(0).toUpperCase();
      actionLabel.textContent = firstLetter;
    }
    const isSelected = this._selectedFolderUri?.toString() === entry.uri.toString();
    if (isSelected) {
      entryElement.classList.add("checked");
    }
    const folderPath = this.labelService.getUriLabel(entry.uri, { relative: false });
    entryDisposables.add(
      this.hoverService.setupDelayedHover(
        entryElement,
        {
          appearance: { showPointer: true },
          position: { hoverPosition: HoverPosition.RIGHT },
          content: folderPath
        },
        { groupId: HOVER_GROUP_ID }
      )
    );
    entryDisposables.add(
      addDisposableListener(entryElement, EventType.CLICK, () => {
        this.selectWorkspace(index);
      })
    );
    entryElement.setAttribute("tabindex", "0");
    entryElement.setAttribute("role", "button");
    entryElement.setAttribute("aria-label", folderName);
    entryElement.setAttribute("aria-pressed", isSelected ? "true" : "false");
    entryDisposables.add(
      addDisposableListener(entryElement, EventType.KEY_DOWN, (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          this.selectWorkspace(index);
        }
      })
    );
    entryDisposables.add(
      addDisposableListener(entryElement, EventType.CONTEXT_MENU, (e) => {
        e.preventDefault();
        e.stopPropagation();
        const event = new StandardMouseEvent(getWindow(entryElement), e);
        this.contextMenuService.showContextMenu({
          getAnchor: () => event,
          getActions: () => [
            new Action("projectbar.customize", localize("projectbar.customize", "Customize"), void 0, true, () => this.showCustomizeQuickPick(index)),
            new Separator(),
            new Action("projectbar.removeFolder", localize("projectbar.removeFolder", "Remove Folder"), void 0, true, () => this.removeFolderEntry(index))
          ]
        });
      })
    );
  }
  selectWorkspace(index) {
    if (index < 0 || index >= this.entries.length) {
      return;
    }
    const entry = this.entries[index];
    if (this._selectedFolderUri?.toString() === entry.uri.toString()) {
      return;
    }
    this._selectedFolderUri = entry.uri;
    this.saveEntriesToStorage();
    this.renderContent();
    this.applySelectedFolder();
    this._onDidSelectWorkspace.fire(this._selectedFolderUri);
  }
  removeFolderEntry(index) {
    if (index < 0 || index >= this.entries.length) {
      return;
    }
    const removedUri = this.entries[index].uri;
    this.entries.splice(index, 1);
    this.saveEntriesToStorage();
    if (this._selectedFolderUri?.toString() === removedUri.toString()) {
      if (this.entries.length > 0) {
        this._selectedFolderUri = this.entries[0].uri;
        this.applySelectedFolder();
        this._onDidSelectWorkspace.fire(this._selectedFolderUri);
      } else {
        this._selectedFolderUri = void 0;
        this._onDidSelectWorkspace.fire(void 0);
      }
    }
    this.renderContent();
  }
  async showCustomizeQuickPick(index) {
    if (index < 0 || index >= this.entries.length) {
      return;
    }
    const entry = this.entries[index];
    const items = [
      {
        customType: "letter",
        label: localize("projectbar.customize.letter", "Letter"),
        description: localize("projectbar.customize.letter.description", "Show the first letter of the workspace name")
      },
      {
        customType: "icon",
        label: localize("projectbar.customize.icon", "Icon"),
        description: localize("projectbar.customize.icon.description", "Choose a codicon to represent the workspace")
      }
    ];
    const picked = await this.quickInputService.pick(items, {
      placeHolder: localize("projectbar.customize.placeholder", "Choose how to display the workspace in the project bar"),
      title: localize("projectbar.customize.title", "Customize Workspace Appearance")
    });
    if (!picked) {
      return;
    }
    if (picked.customType === "letter") {
      entry.displayType = "letter";
      entry.iconId = void 0;
      this.saveEntriesToStorage();
      this.renderContent();
    } else if (picked.customType === "icon") {
      const icon = await this.pickIcon();
      if (icon) {
        entry.displayType = "icon";
        entry.iconId = icon.id;
        this.saveEntriesToStorage();
        this.renderContent();
      }
    }
  }
  async pickIcon() {
    const iconSelectBox = this.instantiationService.createInstance(WorkbenchIconSelectBox, {
      icons: icons.value,
      inputBoxStyles: defaultInputBoxStyles
    });
    const dimension = new Dimension(486, 260);
    return new Promise((resolve) => {
      const disposables = new DisposableStore();
      disposables.add(iconSelectBox.onDidSelect((e) => {
        resolve(e);
        disposables.dispose();
        iconSelectBox.dispose();
      }));
      iconSelectBox.clearInput();
      const body = getActiveDocument().body;
      const bodyRect = body.getBoundingClientRect();
      const hoverWidget = this.hoverService.showInstantHover({
        content: iconSelectBox.domNode,
        target: {
          targetElements: [body],
          x: bodyRect.left + (bodyRect.width - dimension.width) / 2,
          y: bodyRect.top + this.layoutService.activeContainerOffset.top
        },
        position: {
          hoverPosition: HoverPosition.BELOW
        },
        persistence: {
          sticky: true
        }
      }, true);
      if (hoverWidget) {
        disposables.add(hoverWidget);
      }
      iconSelectBox.layout(dimension);
      iconSelectBox.focus();
    });
  }
  get selectedWorkspaceFolder() {
    return this._selectedFolderUri;
  }
  updateStyles() {
    super.updateStyles();
    const container = assertReturnsDefined(this.getContainer());
    const background = this.getColor(ACTIVITY_BAR_BACKGROUND) || "";
    container.style.backgroundColor = background;
    const borderColor = this.getColor(ACTIVITY_BAR_BORDER) || this.getColor(contrastBorder) || "";
    container.classList.toggle("bordered", !!borderColor);
    container.style.borderColor = borderColor ? borderColor : "";
  }
  focus() {
    this.addFolderButton?.focus();
  }
  focusGlobalCompositeBar() {
    this.globalCompositeBar.focus();
  }
  layout(width, height) {
    super.layout(width, height, 0, 0);
  }
  toJSON() {
    return {
      type: AgenticParts.PROJECTBAR_PART
    };
  }
};
ProjectBarPart.ACTION_HEIGHT = 48;
ProjectBarPart = __decorateClass([
  __decorateParam(0, IWorkbenchLayoutService),
  __decorateParam(1, IThemeService),
  __decorateParam(2, IStorageService),
  __decorateParam(3, IWorkspaceContextService),
  __decorateParam(4, IFileDialogService),
  __decorateParam(5, IPathService),
  __decorateParam(6, IWorkspaceEditingService),
  __decorateParam(7, ILabelService),
  __decorateParam(8, IHoverService),
  __decorateParam(9, IContextMenuService),
  __decorateParam(10, IQuickInputService),
  __decorateParam(11, IInstantiationService)
], ProjectBarPart);
export {
  ProjectBarPart
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcYnJvd3NlclxccGFydHNcXHByb2plY3RCYXJQYXJ0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICcuL21lZGlhL3Byb2plY3RCYXJQYXJ0LmNzcyc7XG5pbXBvcnQgeyBQYXJ0IH0gZnJvbSAnLi4vLi4vLi4vd29ya2JlbmNoL2Jyb3dzZXIvcGFydC5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoTGF5b3V0U2VydmljZSwgUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi93b3JrYmVuY2gvc2VydmljZXMvbGF5b3V0L2Jyb3dzZXIvbGF5b3V0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ29sb3JUaGVtZSwgSVRoZW1lU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IElIb3ZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9ob3Zlci9icm93c2VyL2hvdmVyLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSwgTXV0YWJsZURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgJCwgYWRkRGlzcG9zYWJsZUxpc3RlbmVyLCBhcHBlbmQsIGNsZWFyTm9kZSwgRGltZW5zaW9uLCBFdmVudFR5cGUsIGdldEFjdGl2ZURvY3VtZW50LCBnZXRXaW5kb3cgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgQUNUSVZJVFlfQkFSX0JBQ0tHUk9VTkQsIEFDVElWSVRZX0JBUl9CQURHRV9CQUNLR1JPVU5ELCBBQ1RJVklUWV9CQVJfQkFER0VfRk9SRUdST1VORCwgQUNUSVZJVFlfQkFSX0JPUkRFUiwgQUNUSVZJVFlfQkFSX0ZPUkVHUk9VTkQsIEFDVElWSVRZX0JBUl9JTkFDVElWRV9GT1JFR1JPVU5EIH0gZnJvbSAnLi4vLi4vLi4vd29ya2JlbmNoL2NvbW1vbi90aGVtZS5qcyc7XG5pbXBvcnQgeyBjb250cmFzdEJvcmRlciB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9jb2xvclJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IGFzc2VydFJldHVybnNEZWZpbmVkIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBjb2RpY29uc0xpYnJhcnkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29uc0xpYnJhcnkuanMnO1xuaW1wb3J0IHsgTGF6eSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xhenkuanMnO1xuaW1wb3J0IHsgSG92ZXJQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9ob3Zlci9ob3ZlcldpZGdldC5qcyc7XG5pbXBvcnQgeyBHbG9iYWxDb21wb3NpdGVCYXIgfSBmcm9tICcuLi8uLi8uLi93b3JrYmVuY2gvYnJvd3Nlci9wYXJ0cy9nbG9iYWxDb21wb3NpdGVCYXIuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uLCBBY3Rpb24sIFNlcGFyYXRvciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElGaWxlRGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgSVBhdGhTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vd29ya2JlbmNoL3NlcnZpY2VzL3BhdGgvY29tbW9uL3BhdGhTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VFZGl0aW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3dvcmtiZW5jaC9zZXJ2aWNlcy93b3Jrc3BhY2VzL2NvbW1vbi93b3Jrc3BhY2VFZGl0aW5nLmpzJztcbmltcG9ydCB7IElMYWJlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9sYWJlbC9jb21tb24vbGFiZWwuanMnO1xuaW1wb3J0IHsgYmFzZW5hbWUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRNZW51U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dFZpZXcuanMnO1xuaW1wb3J0IHsgU3RhbmRhcmRNb3VzZUV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL21vdXNlRXZlbnQuanMnO1xuaW1wb3J0IHsgSVF1aWNrSW5wdXRTZXJ2aWNlLCBJUXVpY2tQaWNrSXRlbSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3F1aWNraW5wdXQvY29tbW9uL3F1aWNrSW5wdXQuanMnO1xuaW1wb3J0IHsgZ2V0SWNvblJlZ2lzdHJ5LCBJY29uQ29udHJpYnV0aW9uIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2ljb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBkZWZhdWx0SW5wdXRCb3hTdHlsZXMgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9icm93c2VyL2RlZmF1bHRTdHlsZXMuanMnO1xuaW1wb3J0IHsgV29ya2JlbmNoSWNvblNlbGVjdEJveCB9IGZyb20gJy4uLy4uLy4uL3dvcmtiZW5jaC9zZXJ2aWNlcy91c2VyRGF0YVByb2ZpbGUvYnJvd3Nlci9pY29uU2VsZWN0Qm94LmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IEFnZW50aWNQYXJ0cyB9IGZyb20gJy4vcGFydHMuanMnO1xuXG5jb25zdCBIT1ZFUl9HUk9VUF9JRCA9ICdwcm9qZWN0YmFyJztcbmNvbnN0IFBST0pFQ1RfQkFSX0ZPTERFUlNfS0VZID0gJ3dvcmtiZW5jaC5hZ2VudHNlc3Npb24ucHJvamVjdGJhci5mb2xkZXJzJztcblxudHlwZSBQcm9qZWN0QmFyRW50cnlEaXNwbGF5VHlwZSA9ICdsZXR0ZXInIHwgJ2ljb24nO1xuXG5pbnRlcmZhY2UgSVByb2plY3RCYXJFbnRyeURhdGEge1xuXHRyZWFkb25seSB1cmk6IHN0cmluZztcblx0cmVhZG9ubHkgZGlzcGxheVR5cGU/OiBQcm9qZWN0QmFyRW50cnlEaXNwbGF5VHlwZTtcblx0cmVhZG9ubHkgaWNvbklkPzogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgSVByb2plY3RCYXJFbnRyeSB7XG5cdHJlYWRvbmx5IHVyaTogVVJJO1xuXHRyZWFkb25seSBuYW1lOiBzdHJpbmc7XG5cdGRpc3BsYXlUeXBlOiBQcm9qZWN0QmFyRW50cnlEaXNwbGF5VHlwZTtcblx0aWNvbklkPzogc3RyaW5nO1xufVxuXG5jb25zdCBpY29ucyA9IG5ldyBMYXp5PEljb25Db250cmlidXRpb25bXT4oKCkgPT4ge1xuXHRjb25zdCBpY29uRGVmaW5pdGlvbnMgPSBnZXRJY29uUmVnaXN0cnkoKS5nZXRJY29ucygpO1xuXHRjb25zdCBpbmNsdWRlZENoYXJzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdGNvbnN0IGRlZHVwZWRJY29ucyA9IGljb25EZWZpbml0aW9ucy5maWx0ZXIoZSA9PiB7XG5cdFx0aWYgKGUuaWQgPT09IGNvZGljb25zTGlicmFyeS5ibGFuay5pZCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRpZiAoVGhlbWVJY29uLmlzVGhlbWVJY29uKGUuZGVmYXVsdHMpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGlmIChpbmNsdWRlZENoYXJzLmhhcyhlLmRlZmF1bHRzLmZvbnRDaGFyYWN0ZXIpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGluY2x1ZGVkQ2hhcnMuYWRkKGUuZGVmYXVsdHMuZm9udENoYXJhY3Rlcik7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH0pO1xuXHRyZXR1cm4gZGVkdXBlZEljb25zO1xufSk7XG5cbi8qKlxuICogUHJvamVjdEJhclBhcnQgZGlzcGxheXMgcHJvamVjdCBmb2xkZXIgZW50cmllcyBzdG9yZWQgaW4gd29ya3NwYWNlIHN0b3JhZ2UgYW5kIGFsbG93cyBzZWxlY3Rpb24gYmV0d2VlbiB0aGVtLlxuICogV2hlbiBhIGZvbGRlciBpcyBzZWxlY3RlZCwgdGhlIHdvcmtzcGFjZSBlZGl0aW5nIHNlcnZpY2UgaXMgdXNlZCB0byByZXBsYWNlIHRoZSBjdXJyZW50IHdvcmtzcGFjZSBmb2xkZXJcbiAqIHdpdGggdGhlIHNlbGVjdGVkIG9uZS4gSXQgaXMgcG9zaXRpb25lZCB0byB0aGUgbGVmdCBvZiB0aGUgc2lkZWJhciBhbmQgaGFzIHRoZSBzYW1lIHZpc3VhbCBzdHlsZSBhcyB0aGUgYWN0aXZpdHkgYmFyLlxuICogQWxzbyBpbmNsdWRlcyBnbG9iYWwgYWN0aXZpdGllcyAoYWNjb3VudHMsIHNldHRpbmdzKSBhdCB0aGUgYm90dG9tLlxuICovXG5leHBvcnQgY2xhc3MgUHJvamVjdEJhclBhcnQgZXh0ZW5kcyBQYXJ0IHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgQUNUSU9OX0hFSUdIVCA9IDQ4O1xuXG5cdC8vI3JlZ2lvbiBJVmlld1xuXG5cdHJlYWRvbmx5IG1pbmltdW1XaWR0aDogbnVtYmVyID0gNDg7XG5cdHJlYWRvbmx5IG1heGltdW1XaWR0aDogbnVtYmVyID0gNDg7XG5cdHJlYWRvbmx5IG1pbmltdW1IZWlnaHQ6IG51bWJlciA9IDA7XG5cdHJlYWRvbmx5IG1heGltdW1IZWlnaHQ6IG51bWJlciA9IE51bWJlci5QT1NJVElWRV9JTkZJTklUWTtcblxuXHQvLyNlbmRyZWdpb25cblxuXHRwcml2YXRlIGNvbnRlbnQ6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGFjdGlvbnNDb250YWluZXI6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGFkZEZvbGRlckJ1dHRvbjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgZW50cmllczogSVByb2plY3RCYXJFbnRyeVtdID0gW107XG5cdHByaXZhdGUgX3NlbGVjdGVkRm9sZGVyVXJpOiBVUkkgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgZ2xvYmFsQ29tcG9zaXRlQmFyOiBHbG9iYWxDb21wb3NpdGVCYXI7XG5cblx0cHJpdmF0ZSByZWFkb25seSB3b3Jrc3BhY2VFbnRyeURpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPERpc3Bvc2FibGVTdG9yZT4oKSk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRTZWxlY3RXb3Jrc3BhY2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxVUkkgfCB1bmRlZmluZWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZFNlbGVjdFdvcmtzcGFjZTogRXZlbnQ8VVJJIHwgdW5kZWZpbmVkPiA9IHRoaXMuX29uRGlkU2VsZWN0V29ya3NwYWNlLmV2ZW50O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJV29ya2JlbmNoTGF5b3V0U2VydmljZSBsYXlvdXRTZXJ2aWNlOiBJV29ya2JlbmNoTGF5b3V0U2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlOiBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsXG5cdFx0QElGaWxlRGlhbG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGZpbGVEaWFsb2dTZXJ2aWNlOiBJRmlsZURpYWxvZ1NlcnZpY2UsXG5cdFx0QElQYXRoU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHBhdGhTZXJ2aWNlOiBJUGF0aFNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VFZGl0aW5nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHdvcmtzcGFjZUVkaXRpbmdTZXJ2aWNlOiBJV29ya3NwYWNlRWRpdGluZ1NlcnZpY2UsXG5cdFx0QElMYWJlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYWJlbFNlcnZpY2U6IElMYWJlbFNlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdFx0QElDb250ZXh0TWVudVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0QElRdWlja0lucHV0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHF1aWNrSW5wdXRTZXJ2aWNlOiBJUXVpY2tJbnB1dFNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKEFnZW50aWNQYXJ0cy5QUk9KRUNUQkFSX1BBUlQsIHsgaGFzVGl0bGU6IGZhbHNlIH0sIHRoZW1lU2VydmljZSwgc3RvcmFnZVNlcnZpY2UsIGxheW91dFNlcnZpY2UpO1xuXG5cdFx0Ly8gQ3JlYXRlIHRoZSBnbG9iYWwgY29tcG9zaXRlIGJhciBmb3IgYWNjb3VudHMgYW5kIHNldHRpbmdzIGF0IHRoZSBib3R0b21cblx0XHR0aGlzLmdsb2JhbENvbXBvc2l0ZUJhciA9IHRoaXMuX3JlZ2lzdGVyKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0R2xvYmFsQ29tcG9zaXRlQmFyLFxuXHRcdFx0KCkgPT4gdGhpcy5nZXRDb250ZXh0TWVudUFjdGlvbnMoKSxcblx0XHRcdCh0aGVtZTogSUNvbG9yVGhlbWUpID0+ICh7XG5cdFx0XHRcdGFjdGl2ZUZvcmVncm91bmRDb2xvcjogdGhlbWUuZ2V0Q29sb3IoQUNUSVZJVFlfQkFSX0ZPUkVHUk9VTkQpLFxuXHRcdFx0XHRpbmFjdGl2ZUZvcmVncm91bmRDb2xvcjogdGhlbWUuZ2V0Q29sb3IoQUNUSVZJVFlfQkFSX0lOQUNUSVZFX0ZPUkVHUk9VTkQpLFxuXHRcdFx0XHRiYWRnZUJhY2tncm91bmQ6IHRoZW1lLmdldENvbG9yKEFDVElWSVRZX0JBUl9CQURHRV9CQUNLR1JPVU5EKSxcblx0XHRcdFx0YmFkZ2VGb3JlZ3JvdW5kOiB0aGVtZS5nZXRDb2xvcihBQ1RJVklUWV9CQVJfQkFER0VfRk9SRUdST1VORCksXG5cdFx0XHRcdGFjdGl2ZUJhY2tncm91bmRDb2xvcjogdW5kZWZpbmVkLFxuXHRcdFx0XHRpbmFjdGl2ZUJhY2tncm91bmRDb2xvcjogdW5kZWZpbmVkLFxuXHRcdFx0XHRhY3RpdmVCb3JkZXJCb3R0b21Db2xvcjogdW5kZWZpbmVkLFxuXHRcdFx0fSksXG5cdFx0XHR7XG5cdFx0XHRcdHBvc2l0aW9uOiAoKSA9PiB0aGlzLmxheW91dFNlcnZpY2UuZ2V0U2lkZUJhclBvc2l0aW9uKCkgPT09IFBvc2l0aW9uLkxFRlQgPyBIb3ZlclBvc2l0aW9uLlJJR0hUIDogSG92ZXJQb3NpdGlvbi5MRUZULFxuXHRcdFx0fVxuXHRcdCkpO1xuXG5cdFx0Ly8gTG9hZCBlbnRyaWVzIGZyb20gc3RvcmFnZVxuXHRcdHRoaXMubG9hZEVudHJpZXNGcm9tU3RvcmFnZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRDb250ZXh0TWVudUFjdGlvbnMoKTogSUFjdGlvbltdIHtcblx0XHRyZXR1cm4gdGhpcy5nbG9iYWxDb21wb3NpdGVCYXIuZ2V0Q29udGV4dE1lbnVBY3Rpb25zKCk7XG5cdH1cblxuXHRwcml2YXRlIGxvYWRFbnRyaWVzRnJvbVN0b3JhZ2UoKTogdm9pZCB7XG5cdFx0Y29uc3QgcmF3ID0gdGhpcy5zdG9yYWdlU2VydmljZS5nZXQoUFJPSkVDVF9CQVJfRk9MREVSU19LRVksIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UpO1xuXHRcdGlmIChyYXcpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IGRhdGE6IChzdHJpbmcgfCBJUHJvamVjdEJhckVudHJ5RGF0YSlbXSA9IEpTT04ucGFyc2UocmF3KTtcblx0XHRcdFx0dGhpcy5lbnRyaWVzID0gZGF0YS5tYXAoaXRlbSA9PiB7XG5cdFx0XHRcdFx0Ly8gU3VwcG9ydCBsZWdhY3kgZm9ybWF0IChqdXN0IFVSSXMgYXMgc3RyaW5ncykgYW5kIG5ldyBmb3JtYXQgKG9iamVjdHMgd2l0aCBkaXNwbGF5IHNldHRpbmdzKVxuXHRcdFx0XHRcdGlmICh0eXBlb2YgaXRlbSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0XHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZShpdGVtKTtcblx0XHRcdFx0XHRcdHJldHVybiB7IHVyaSwgbmFtZTogYmFzZW5hbWUodXJpKSwgZGlzcGxheVR5cGU6ICdsZXR0ZXInIGFzIFByb2plY3RCYXJFbnRyeURpc3BsYXlUeXBlIH07XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZShpdGVtLnVyaSk7XG5cdFx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0XHR1cmksXG5cdFx0XHRcdFx0XHRcdG5hbWU6IGJhc2VuYW1lKHVyaSksXG5cdFx0XHRcdFx0XHRcdGRpc3BsYXlUeXBlOiBpdGVtLmRpc3BsYXlUeXBlID8/ICdsZXR0ZXInLFxuXHRcdFx0XHRcdFx0XHRpY29uSWQ6IGl0ZW0uaWNvbklkXG5cdFx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0dGhpcy5lbnRyaWVzID0gW107XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuZW50cmllcyA9IFtdO1xuXHRcdH1cblxuXHRcdC8vIFRoZSBzZWxlY3RlZCBmb2xkZXIgaXMgYWx3YXlzIHRoZSBmaXJzdCB3b3Jrc3BhY2UgZm9sZGVyXG5cdFx0Y29uc3QgY3VycmVudEZvbGRlcnMgPSB0aGlzLndvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpLmZvbGRlcnM7XG5cdFx0dGhpcy5fc2VsZWN0ZWRGb2xkZXJVcmkgPSBjdXJyZW50Rm9sZGVycy5sZW5ndGggPiAwID8gY3VycmVudEZvbGRlcnNbMF0udXJpIDogdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBzYXZlRW50cmllc1RvU3RvcmFnZSgpOiB2b2lkIHtcblx0XHRjb25zdCBkYXRhOiBJUHJvamVjdEJhckVudHJ5RGF0YVtdID0gdGhpcy5lbnRyaWVzLm1hcChlID0+ICh7XG5cdFx0XHR1cmk6IGUudXJpLnRvU3RyaW5nKCksXG5cdFx0XHRkaXNwbGF5VHlwZTogZS5kaXNwbGF5VHlwZSxcblx0XHRcdGljb25JZDogZS5pY29uSWRcblx0XHR9KSk7XG5cdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZShQUk9KRUNUX0JBUl9GT0xERVJTX0tFWSwgSlNPTi5zdHJpbmdpZnkoZGF0YSksIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdH1cblxuXHRwcml2YXRlIGFkZEZvbGRlckVudHJ5KHVyaTogVVJJKTogdm9pZCB7XG5cdFx0Ly8gRG9uJ3QgYWRkIGR1cGxpY2F0ZXNcblx0XHRpZiAodGhpcy5lbnRyaWVzLnNvbWUoZSA9PiBlLnVyaS50b1N0cmluZygpID09PSB1cmkudG9TdHJpbmcoKSkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLmVudHJpZXMucHVzaCh7IHVyaSwgbmFtZTogYmFzZW5hbWUodXJpKSwgZGlzcGxheVR5cGU6ICdsZXR0ZXInIH0pO1xuXHRcdHRoaXMuc2F2ZUVudHJpZXNUb1N0b3JhZ2UoKTtcblxuXHRcdC8vIFNlbGVjdCB0aGUgbmV3bHkgYWRkZWQgZm9sZGVyXG5cdFx0dGhpcy5fc2VsZWN0ZWRGb2xkZXJVcmkgPSB1cmk7XG5cdFx0dGhpcy5zYXZlRW50cmllc1RvU3RvcmFnZSgpO1xuXHRcdHRoaXMuYXBwbHlTZWxlY3RlZEZvbGRlcigpO1xuXHRcdHRoaXMuX29uRGlkU2VsZWN0V29ya3NwYWNlLmZpcmUodGhpcy5fc2VsZWN0ZWRGb2xkZXJVcmkpO1xuXG5cdFx0dGhpcy5yZW5kZXJDb250ZW50KCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGFwcGx5U2VsZWN0ZWRGb2xkZXIoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLl9zZWxlY3RlZEZvbGRlclVyaSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGN1cnJlbnRGb2xkZXJzID0gdGhpcy53b3Jrc3BhY2VDb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2UoKS5mb2xkZXJzO1xuXHRcdGNvbnN0IGZvbGRlcnNUb1JlbW92ZSA9IGN1cnJlbnRGb2xkZXJzLm1hcChmID0+IGYudXJpKTtcblxuXHRcdC8vIFJlbW92ZSBleGlzdGluZyB3b3Jrc3BhY2UgZm9sZGVycyBhbmQgYWRkIHRoZSBzZWxlY3RlZCBvbmVcblx0XHRhd2FpdCB0aGlzLndvcmtzcGFjZUVkaXRpbmdTZXJ2aWNlLnVwZGF0ZUZvbGRlcnMoXG5cdFx0XHQwLFxuXHRcdFx0Zm9sZGVyc1RvUmVtb3ZlLmxlbmd0aCxcblx0XHRcdFt7IHVyaTogdGhpcy5fc2VsZWN0ZWRGb2xkZXJVcmkgfV1cblx0XHQpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGNyZWF0ZUNvbnRlbnRBcmVhKHBhcmVudDogSFRNTEVsZW1lbnQpOiBIVE1MRWxlbWVudCB7XG5cdFx0dGhpcy5lbGVtZW50ID0gcGFyZW50O1xuXHRcdHRoaXMuY29udGVudCA9IGFwcGVuZCh0aGlzLmVsZW1lbnQsICQoJy5jb250ZW50JykpO1xuXG5cdFx0Ly8gQ3JlYXRlIGFjdGlvbnMgY29udGFpbmVyIGZvciB3b3Jrc3BhY2UgZm9sZGVycyBhbmQgYWRkIGJ1dHRvblxuXHRcdHRoaXMuYWN0aW9uc0NvbnRhaW5lciA9IGFwcGVuZCh0aGlzLmNvbnRlbnQsICQoJy5hY3Rpb25zLWNvbnRhaW5lcicpKTtcblxuXHRcdC8vIENyZWF0ZSB0aGUgVUkgZm9yIHdvcmtzcGFjZSBmb2xkZXJzXG5cdFx0dGhpcy5yZW5kZXJDb250ZW50KCk7XG5cblx0XHQvLyBDcmVhdGUgZ2xvYmFsIGNvbXBvc2l0ZSBiYXIgYXQgdGhlIGJvdHRvbSAoYWNjb3VudHMsIHNldHRpbmdzKVxuXHRcdHRoaXMuZ2xvYmFsQ29tcG9zaXRlQmFyLmNyZWF0ZSh0aGlzLmNvbnRlbnQpO1xuXG5cdFx0cmV0dXJuIHRoaXMuY29udGVudDtcblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyQ29udGVudCgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuYWN0aW9uc0NvbnRhaW5lcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIENsZWFyIGV4aXN0aW5nIGNvbnRlbnRcblx0XHRjbGVhck5vZGUodGhpcy5hY3Rpb25zQ29udGFpbmVyKTtcblx0XHR0aGlzLndvcmtzcGFjZUVudHJ5RGlzcG9zYWJsZXMudmFsdWUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHQvLyBDcmVhdGUgYWRkIGZvbGRlciBidXR0b25cblx0XHR0aGlzLmNyZWF0ZUFkZEZvbGRlckJ1dHRvbih0aGlzLmFjdGlvbnNDb250YWluZXIpO1xuXG5cdFx0Ly8gQ3JlYXRlIHdvcmtzcGFjZSBmb2xkZXIgZW50cmllc1xuXHRcdHRoaXMuY3JlYXRlV29ya3NwYWNlRW50cmllcyh0aGlzLmFjdGlvbnNDb250YWluZXIpO1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVBZGRGb2xkZXJCdXR0b24oY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHRoaXMuYWRkRm9sZGVyQnV0dG9uID0gYXBwZW5kKGNvbnRhaW5lciwgJCgnLmFjdGlvbi1pdGVtLmFkZC1mb2xkZXInKSk7XG5cdFx0Y29uc3QgYWN0aW9uTGFiZWwgPSBhcHBlbmQodGhpcy5hZGRGb2xkZXJCdXR0b24sICQoJ3NwYW4uYWN0aW9uLWxhYmVsJykpO1xuXG5cdFx0Ly8gQWRkIHRoZSBwbHVzIGljb24gdXNpbmcgY29kaWNvblxuXHRcdGFjdGlvbkxhYmVsLmNsYXNzTGlzdC5hZGQoLi4uVGhlbWVJY29uLmFzQ2xhc3NOYW1lQXJyYXkoQ29kaWNvbi5hZGQpKTtcblxuXHRcdC8vIEFkZCBob3ZlciB0b29sdGlwXG5cdFx0dGhpcy53b3Jrc3BhY2VFbnRyeURpc3Bvc2FibGVzLnZhbHVlPy5hZGQoXG5cdFx0XHR0aGlzLmhvdmVyU2VydmljZS5zZXR1cERlbGF5ZWRIb3Zlcihcblx0XHRcdFx0dGhpcy5hZGRGb2xkZXJCdXR0b24sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRhcHBlYXJhbmNlOiB7IHNob3dQb2ludGVyOiB0cnVlIH0sXG5cdFx0XHRcdFx0cG9zaXRpb246IHsgaG92ZXJQb3NpdGlvbjogSG92ZXJQb3NpdGlvbi5SSUdIVCB9LFxuXHRcdFx0XHRcdGNvbnRlbnQ6ICdBZGQgRm9sZGVyIHRvIFByb2plY3QnXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHsgZ3JvdXBJZDogSE9WRVJfR1JPVVBfSUQgfVxuXHRcdFx0KVxuXHRcdCk7XG5cblx0XHQvLyBDbGljayBoYW5kbGVyIHRvIGFkZCBmb2xkZXJcblx0XHR0aGlzLndvcmtzcGFjZUVudHJ5RGlzcG9zYWJsZXMudmFsdWU/LmFkZChcblx0XHRcdGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLmFkZEZvbGRlckJ1dHRvbiwgRXZlbnRUeXBlLkNMSUNLLCAoKSA9PiB7XG5cdFx0XHRcdHRoaXMucGlja0FuZEFkZEZvbGRlcigpO1xuXHRcdFx0fSlcblx0XHQpO1xuXG5cdFx0Ly8gS2V5Ym9hcmQgc3VwcG9ydFxuXHRcdHRoaXMuYWRkRm9sZGVyQnV0dG9uLnNldEF0dHJpYnV0ZSgndGFiaW5kZXgnLCAnMCcpO1xuXHRcdHRoaXMuYWRkRm9sZGVyQnV0dG9uLnNldEF0dHJpYnV0ZSgncm9sZScsICdidXR0b24nKTtcblx0XHR0aGlzLmFkZEZvbGRlckJ1dHRvbi5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCAnQWRkIEZvbGRlciB0byBQcm9qZWN0Jyk7XG5cdFx0dGhpcy53b3Jrc3BhY2VFbnRyeURpc3Bvc2FibGVzLnZhbHVlPy5hZGQoXG5cdFx0XHRhZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5hZGRGb2xkZXJCdXR0b24sIEV2ZW50VHlwZS5LRVlfRE9XTiwgKGU6IEtleWJvYXJkRXZlbnQpID0+IHtcblx0XHRcdFx0aWYgKGUua2V5ID09PSAnRW50ZXInIHx8IGUua2V5ID09PSAnICcpIHtcblx0XHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdFx0dGhpcy5waWNrQW5kQWRkRm9sZGVyKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pXG5cdFx0KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcGlja0FuZEFkZEZvbGRlcigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBmb2xkZXJzID0gYXdhaXQgdGhpcy5maWxlRGlhbG9nU2VydmljZS5zaG93T3BlbkRpYWxvZyh7XG5cdFx0XHRvcGVuTGFiZWw6ICdBZGQnLFxuXHRcdFx0dGl0bGU6ICdBZGQgRm9sZGVyIHRvIFByb2plY3QnLFxuXHRcdFx0Y2FuU2VsZWN0Rm9sZGVyczogdHJ1ZSxcblx0XHRcdGNhblNlbGVjdE1hbnk6IGZhbHNlLFxuXHRcdFx0ZGVmYXVsdFVyaTogYXdhaXQgdGhpcy5maWxlRGlhbG9nU2VydmljZS5kZWZhdWx0Rm9sZGVyUGF0aCgpLFxuXHRcdFx0YXZhaWxhYmxlRmlsZVN5c3RlbXM6IFt0aGlzLnBhdGhTZXJ2aWNlLmRlZmF1bHRVcmlTY2hlbWVdXG5cdFx0fSk7XG5cblx0XHRpZiAoZm9sZGVycz8ubGVuZ3RoKSB7XG5cdFx0XHR0aGlzLmFkZEZvbGRlckVudHJ5KGZvbGRlcnNbMF0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlV29ya3NwYWNlRW50cmllcyhjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLmVudHJpZXMubGVuZ3RoOyBpKyspIHtcblx0XHRcdHRoaXMuY3JlYXRlV29ya3NwYWNlRW50cnkoY29udGFpbmVyLCB0aGlzLmVudHJpZXNbaV0sIGkpO1xuXHRcdH1cblxuXHRcdC8vIEF1dG8tc2VsZWN0IGZpcnN0IGVudHJ5IGlmIGF2YWlsYWJsZSBhbmQgbm9uZSBzZWxlY3RlZFxuXHRcdGlmICh0aGlzLmVudHJpZXMubGVuZ3RoID4gMCAmJiB0aGlzLl9zZWxlY3RlZEZvbGRlclVyaSkge1xuXHRcdFx0dGhpcy5fb25EaWRTZWxlY3RXb3Jrc3BhY2UuZmlyZSh0aGlzLl9zZWxlY3RlZEZvbGRlclVyaSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVXb3Jrc3BhY2VFbnRyeShjb250YWluZXI6IEhUTUxFbGVtZW50LCBlbnRyeTogSVByb2plY3RCYXJFbnRyeSwgaW5kZXg6IG51bWJlcik6IHZvaWQge1xuXHRcdGNvbnN0IGVudHJ5RGlzcG9zYWJsZXMgPSB0aGlzLndvcmtzcGFjZUVudHJ5RGlzcG9zYWJsZXMudmFsdWUhO1xuXG5cdFx0Y29uc3QgZW50cnlFbGVtZW50ID0gYXBwZW5kKGNvbnRhaW5lciwgJCgnLmFjdGlvbi1pdGVtLndvcmtzcGFjZS1lbnRyeScpKTtcblx0XHRjb25zdCBhY3Rpb25MYWJlbCA9IGFwcGVuZChlbnRyeUVsZW1lbnQsICQoJ3NwYW4uYWN0aW9uLWxhYmVsLndvcmtzcGFjZS1pY29uJykpO1xuXHRcdGFwcGVuZChlbnRyeUVsZW1lbnQsICQoJ3NwYW4uYWN0aXZlLWl0ZW0taW5kaWNhdG9yJykpO1xuXG5cdFx0Ly8gUmVuZGVyIGJhc2VkIG9uIGRpc3BsYXkgdHlwZVxuXHRcdGNvbnN0IGZvbGRlck5hbWUgPSBlbnRyeS5uYW1lO1xuXHRcdGlmIChlbnRyeS5kaXNwbGF5VHlwZSA9PT0gJ2ljb24nICYmIGVudHJ5Lmljb25JZCkge1xuXHRcdFx0Ly8gUmVuZGVyIGNvZGljb25cblx0XHRcdGNvbnN0IGljb24gPSBUaGVtZUljb24uZnJvbUlkKGVudHJ5Lmljb25JZCk7XG5cdFx0XHRhY3Rpb25MYWJlbC5jbGFzc0xpc3QuYWRkKC4uLlRoZW1lSWNvbi5hc0NsYXNzTmFtZUFycmF5KGljb24pKTtcblx0XHRcdGFjdGlvbkxhYmVsLmNsYXNzTGlzdC5hZGQoJ2NvZGljb24taWNvbicpO1xuXHRcdFx0YWN0aW9uTGFiZWwudGV4dENvbnRlbnQgPSAnJztcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gRGVmYXVsdDogcmVuZGVyIGZpcnN0IGxldHRlciBvZiBmb2xkZXIgbmFtZVxuXHRcdFx0Y29uc3QgZmlyc3RMZXR0ZXIgPSBmb2xkZXJOYW1lLmNoYXJBdCgwKS50b1VwcGVyQ2FzZSgpO1xuXHRcdFx0YWN0aW9uTGFiZWwudGV4dENvbnRlbnQgPSBmaXJzdExldHRlcjtcblx0XHR9XG5cblx0XHQvLyBTZXQgc2VsZWN0ZWQgc3RhdGVcblx0XHRjb25zdCBpc1NlbGVjdGVkID0gdGhpcy5fc2VsZWN0ZWRGb2xkZXJVcmk/LnRvU3RyaW5nKCkgPT09IGVudHJ5LnVyaS50b1N0cmluZygpO1xuXHRcdGlmIChpc1NlbGVjdGVkKSB7XG5cdFx0XHRlbnRyeUVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnY2hlY2tlZCcpO1xuXHRcdH1cblxuXHRcdC8vIEJ1aWxkIGhvdmVyIGNvbnRlbnQgd2l0aCBmdWxsIHBhdGhcblx0XHRjb25zdCBmb2xkZXJQYXRoID0gdGhpcy5sYWJlbFNlcnZpY2UuZ2V0VXJpTGFiZWwoZW50cnkudXJpLCB7IHJlbGF0aXZlOiBmYWxzZSB9KTtcblxuXHRcdC8vIEFkZCBob3ZlciB0b29sdGlwIHdpdGggZm9sZGVyIG5hbWVcblx0XHRlbnRyeURpc3Bvc2FibGVzLmFkZChcblx0XHRcdHRoaXMuaG92ZXJTZXJ2aWNlLnNldHVwRGVsYXllZEhvdmVyKFxuXHRcdFx0XHRlbnRyeUVsZW1lbnQsXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRhcHBlYXJhbmNlOiB7IHNob3dQb2ludGVyOiB0cnVlIH0sXG5cdFx0XHRcdFx0cG9zaXRpb246IHsgaG92ZXJQb3NpdGlvbjogSG92ZXJQb3NpdGlvbi5SSUdIVCB9LFxuXHRcdFx0XHRcdGNvbnRlbnQ6IGZvbGRlclBhdGhcblx0XHRcdFx0fSxcblx0XHRcdFx0eyBncm91cElkOiBIT1ZFUl9HUk9VUF9JRCB9XG5cdFx0XHQpXG5cdFx0KTtcblxuXHRcdC8vIENsaWNrIGhhbmRsZXIgdG8gc2VsZWN0IHdvcmtzcGFjZVxuXHRcdGVudHJ5RGlzcG9zYWJsZXMuYWRkKFxuXHRcdFx0YWRkRGlzcG9zYWJsZUxpc3RlbmVyKGVudHJ5RWxlbWVudCwgRXZlbnRUeXBlLkNMSUNLLCAoKSA9PiB7XG5cdFx0XHRcdHRoaXMuc2VsZWN0V29ya3NwYWNlKGluZGV4KTtcblx0XHRcdH0pXG5cdFx0KTtcblxuXHRcdC8vIEtleWJvYXJkIHN1cHBvcnRcblx0XHRlbnRyeUVsZW1lbnQuc2V0QXR0cmlidXRlKCd0YWJpbmRleCcsICcwJyk7XG5cdFx0ZW50cnlFbGVtZW50LnNldEF0dHJpYnV0ZSgncm9sZScsICdidXR0b24nKTtcblx0XHRlbnRyeUVsZW1lbnQuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgZm9sZGVyTmFtZSk7XG5cdFx0ZW50cnlFbGVtZW50LnNldEF0dHJpYnV0ZSgnYXJpYS1wcmVzc2VkJywgaXNTZWxlY3RlZCA/ICd0cnVlJyA6ICdmYWxzZScpO1xuXHRcdGVudHJ5RGlzcG9zYWJsZXMuYWRkKFxuXHRcdFx0YWRkRGlzcG9zYWJsZUxpc3RlbmVyKGVudHJ5RWxlbWVudCwgRXZlbnRUeXBlLktFWV9ET1dOLCAoZTogS2V5Ym9hcmRFdmVudCkgPT4ge1xuXHRcdFx0XHRpZiAoZS5rZXkgPT09ICdFbnRlcicgfHwgZS5rZXkgPT09ICcgJykge1xuXHRcdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0XHR0aGlzLnNlbGVjdFdvcmtzcGFjZShpbmRleCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pXG5cdFx0KTtcblxuXHRcdC8vIENvbnRleHQgbWVudSB3aXRoIGN1c3RvbWl6ZSBhbmQgcmVtb3ZlIGFjdGlvbnNcblx0XHRlbnRyeURpc3Bvc2FibGVzLmFkZChcblx0XHRcdGFkZERpc3Bvc2FibGVMaXN0ZW5lcihlbnRyeUVsZW1lbnQsIEV2ZW50VHlwZS5DT05URVhUX01FTlUsIChlOiBNb3VzZUV2ZW50KSA9PiB7XG5cdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdFx0Y29uc3QgZXZlbnQgPSBuZXcgU3RhbmRhcmRNb3VzZUV2ZW50KGdldFdpbmRvdyhlbnRyeUVsZW1lbnQpLCBlKTtcblx0XHRcdFx0dGhpcy5jb250ZXh0TWVudVNlcnZpY2Uuc2hvd0NvbnRleHRNZW51KHtcblx0XHRcdFx0XHRnZXRBbmNob3I6ICgpID0+IGV2ZW50LFxuXHRcdFx0XHRcdGdldEFjdGlvbnM6ICgpID0+IFtcblx0XHRcdFx0XHRcdG5ldyBBY3Rpb24oJ3Byb2plY3RiYXIuY3VzdG9taXplJywgbG9jYWxpemUoJ3Byb2plY3RiYXIuY3VzdG9taXplJywgXCJDdXN0b21pemVcIiksIHVuZGVmaW5lZCwgdHJ1ZSwgKCkgPT4gdGhpcy5zaG93Q3VzdG9taXplUXVpY2tQaWNrKGluZGV4KSksXG5cdFx0XHRcdFx0XHRuZXcgU2VwYXJhdG9yKCksXG5cdFx0XHRcdFx0XHRuZXcgQWN0aW9uKCdwcm9qZWN0YmFyLnJlbW92ZUZvbGRlcicsIGxvY2FsaXplKCdwcm9qZWN0YmFyLnJlbW92ZUZvbGRlcicsIFwiUmVtb3ZlIEZvbGRlclwiKSwgdW5kZWZpbmVkLCB0cnVlLCAoKSA9PiB0aGlzLnJlbW92ZUZvbGRlckVudHJ5KGluZGV4KSlcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSlcblx0XHQpO1xuXHR9XG5cblx0cHJpdmF0ZSBzZWxlY3RXb3Jrc3BhY2UoaW5kZXg6IG51bWJlcik6IHZvaWQge1xuXHRcdGlmIChpbmRleCA8IDAgfHwgaW5kZXggPj0gdGhpcy5lbnRyaWVzLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGVudHJ5ID0gdGhpcy5lbnRyaWVzW2luZGV4XTtcblx0XHRpZiAodGhpcy5fc2VsZWN0ZWRGb2xkZXJVcmk/LnRvU3RyaW5nKCkgPT09IGVudHJ5LnVyaS50b1N0cmluZygpKSB7XG5cdFx0XHRyZXR1cm47IC8vIEFscmVhZHkgc2VsZWN0ZWRcblx0XHR9XG5cblx0XHR0aGlzLl9zZWxlY3RlZEZvbGRlclVyaSA9IGVudHJ5LnVyaTtcblx0XHR0aGlzLnNhdmVFbnRyaWVzVG9TdG9yYWdlKCk7XG5cblx0XHQvLyBSZS1yZW5kZXIgdG8gdXBkYXRlIHZpc3VhbCBzdGF0ZVxuXHRcdHRoaXMucmVuZGVyQ29udGVudCgpO1xuXG5cdFx0Ly8gQXBwbHkgdGhlIHNlbGVjdGVkIGZvbGRlciBhcyB0aGUgd29ya3NwYWNlIGZvbGRlclxuXHRcdHRoaXMuYXBwbHlTZWxlY3RlZEZvbGRlcigpO1xuXG5cdFx0Ly8gRmlyZSBzZWxlY3Rpb24gZXZlbnRcblx0XHR0aGlzLl9vbkRpZFNlbGVjdFdvcmtzcGFjZS5maXJlKHRoaXMuX3NlbGVjdGVkRm9sZGVyVXJpKTtcblx0fVxuXG5cdHByaXZhdGUgcmVtb3ZlRm9sZGVyRW50cnkoaW5kZXg6IG51bWJlcik6IHZvaWQge1xuXHRcdGlmIChpbmRleCA8IDAgfHwgaW5kZXggPj0gdGhpcy5lbnRyaWVzLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlbW92ZWRVcmkgPSB0aGlzLmVudHJpZXNbaW5kZXhdLnVyaTtcblx0XHR0aGlzLmVudHJpZXMuc3BsaWNlKGluZGV4LCAxKTtcblx0XHR0aGlzLnNhdmVFbnRyaWVzVG9TdG9yYWdlKCk7XG5cblx0XHQvLyBJZiB0aGUgcmVtb3ZlZCBlbnRyeSB3YXMgdGhlIHNlbGVjdGVkIG9uZSwgc2VsZWN0IHRoZSBmaXJzdCByZW1haW5pbmcgZW50cnlcblx0XHRpZiAodGhpcy5fc2VsZWN0ZWRGb2xkZXJVcmk/LnRvU3RyaW5nKCkgPT09IHJlbW92ZWRVcmkudG9TdHJpbmcoKSkge1xuXHRcdFx0aWYgKHRoaXMuZW50cmllcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdHRoaXMuX3NlbGVjdGVkRm9sZGVyVXJpID0gdGhpcy5lbnRyaWVzWzBdLnVyaTtcblx0XHRcdFx0dGhpcy5hcHBseVNlbGVjdGVkRm9sZGVyKCk7XG5cdFx0XHRcdHRoaXMuX29uRGlkU2VsZWN0V29ya3NwYWNlLmZpcmUodGhpcy5fc2VsZWN0ZWRGb2xkZXJVcmkpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fc2VsZWN0ZWRGb2xkZXJVcmkgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdHRoaXMuX29uRGlkU2VsZWN0V29ya3NwYWNlLmZpcmUodW5kZWZpbmVkKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLnJlbmRlckNvbnRlbnQoKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgc2hvd0N1c3RvbWl6ZVF1aWNrUGljayhpbmRleDogbnVtYmVyKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKGluZGV4IDwgMCB8fCBpbmRleCA+PSB0aGlzLmVudHJpZXMubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZW50cnkgPSB0aGlzLmVudHJpZXNbaW5kZXhdO1xuXG5cdFx0aW50ZXJmYWNlIElDdXN0b21pemVRdWlja1BpY2tJdGVtIGV4dGVuZHMgSVF1aWNrUGlja0l0ZW0ge1xuXHRcdFx0Y3VzdG9tVHlwZTogJ2xldHRlcicgfCAnaWNvbic7XG5cdFx0fVxuXG5cdFx0Y29uc3QgaXRlbXM6IElDdXN0b21pemVRdWlja1BpY2tJdGVtW10gPSBbXG5cdFx0XHR7XG5cdFx0XHRcdGN1c3RvbVR5cGU6ICdsZXR0ZXInLFxuXHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ3Byb2plY3RiYXIuY3VzdG9taXplLmxldHRlcicsIFwiTGV0dGVyXCIpLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Byb2plY3RiYXIuY3VzdG9taXplLmxldHRlci5kZXNjcmlwdGlvbicsIFwiU2hvdyB0aGUgZmlyc3QgbGV0dGVyIG9mIHRoZSB3b3Jrc3BhY2UgbmFtZVwiKVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0Y3VzdG9tVHlwZTogJ2ljb24nLFxuXHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ3Byb2plY3RiYXIuY3VzdG9taXplLmljb24nLCBcIkljb25cIiksXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgncHJvamVjdGJhci5jdXN0b21pemUuaWNvbi5kZXNjcmlwdGlvbicsIFwiQ2hvb3NlIGEgY29kaWNvbiB0byByZXByZXNlbnQgdGhlIHdvcmtzcGFjZVwiKVxuXHRcdFx0fVxuXHRcdF07XG5cblx0XHRjb25zdCBwaWNrZWQgPSBhd2FpdCB0aGlzLnF1aWNrSW5wdXRTZXJ2aWNlLnBpY2soaXRlbXMsIHtcblx0XHRcdHBsYWNlSG9sZGVyOiBsb2NhbGl6ZSgncHJvamVjdGJhci5jdXN0b21pemUucGxhY2Vob2xkZXInLCBcIkNob29zZSBob3cgdG8gZGlzcGxheSB0aGUgd29ya3NwYWNlIGluIHRoZSBwcm9qZWN0IGJhclwiKSxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgncHJvamVjdGJhci5jdXN0b21pemUudGl0bGUnLCBcIkN1c3RvbWl6ZSBXb3Jrc3BhY2UgQXBwZWFyYW5jZVwiKVxuXHRcdH0pO1xuXG5cdFx0aWYgKCFwaWNrZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAocGlja2VkLmN1c3RvbVR5cGUgPT09ICdsZXR0ZXInKSB7XG5cdFx0XHRlbnRyeS5kaXNwbGF5VHlwZSA9ICdsZXR0ZXInO1xuXHRcdFx0ZW50cnkuaWNvbklkID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy5zYXZlRW50cmllc1RvU3RvcmFnZSgpO1xuXHRcdFx0dGhpcy5yZW5kZXJDb250ZW50KCk7XG5cdFx0fSBlbHNlIGlmIChwaWNrZWQuY3VzdG9tVHlwZSA9PT0gJ2ljb24nKSB7XG5cdFx0XHRjb25zdCBpY29uID0gYXdhaXQgdGhpcy5waWNrSWNvbigpO1xuXHRcdFx0aWYgKGljb24pIHtcblx0XHRcdFx0ZW50cnkuZGlzcGxheVR5cGUgPSAnaWNvbic7XG5cdFx0XHRcdGVudHJ5Lmljb25JZCA9IGljb24uaWQ7XG5cdFx0XHRcdHRoaXMuc2F2ZUVudHJpZXNUb1N0b3JhZ2UoKTtcblx0XHRcdFx0dGhpcy5yZW5kZXJDb250ZW50KCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBwaWNrSWNvbigpOiBQcm9taXNlPFRoZW1lSWNvbiB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IGljb25TZWxlY3RCb3ggPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFdvcmtiZW5jaEljb25TZWxlY3RCb3gsIHtcblx0XHRcdGljb25zOiBpY29ucy52YWx1ZSxcblx0XHRcdGlucHV0Qm94U3R5bGVzOiBkZWZhdWx0SW5wdXRCb3hTdHlsZXNcblx0XHR9KTtcblxuXHRcdGNvbnN0IGRpbWVuc2lvbiA9IG5ldyBEaW1lbnNpb24oNDg2LCAyNjApO1xuXHRcdHJldHVybiBuZXcgUHJvbWlzZTxUaGVtZUljb24gfCB1bmRlZmluZWQ+KHJlc29sdmUgPT4ge1xuXHRcdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHRcdGRpc3Bvc2FibGVzLmFkZChpY29uU2VsZWN0Qm94Lm9uRGlkU2VsZWN0KGUgPT4ge1xuXHRcdFx0XHRyZXNvbHZlKGUpO1xuXHRcdFx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0XHRcdGljb25TZWxlY3RCb3guZGlzcG9zZSgpO1xuXHRcdFx0fSkpO1xuXG5cdFx0XHRpY29uU2VsZWN0Qm94LmNsZWFySW5wdXQoKTtcblx0XHRcdGNvbnN0IGJvZHkgPSBnZXRBY3RpdmVEb2N1bWVudCgpLmJvZHk7XG5cdFx0XHRjb25zdCBib2R5UmVjdCA9IGJvZHkuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG5cdFx0XHRjb25zdCBob3ZlcldpZGdldCA9IHRoaXMuaG92ZXJTZXJ2aWNlLnNob3dJbnN0YW50SG92ZXIoe1xuXHRcdFx0XHRjb250ZW50OiBpY29uU2VsZWN0Qm94LmRvbU5vZGUsXG5cdFx0XHRcdHRhcmdldDoge1xuXHRcdFx0XHRcdHRhcmdldEVsZW1lbnRzOiBbYm9keV0sXG5cdFx0XHRcdFx0eDogYm9keVJlY3QubGVmdCArIChib2R5UmVjdC53aWR0aCAtIGRpbWVuc2lvbi53aWR0aCkgLyAyLFxuXHRcdFx0XHRcdHk6IGJvZHlSZWN0LnRvcCArIHRoaXMubGF5b3V0U2VydmljZS5hY3RpdmVDb250YWluZXJPZmZzZXQudG9wXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHBvc2l0aW9uOiB7XG5cdFx0XHRcdFx0aG92ZXJQb3NpdGlvbjogSG92ZXJQb3NpdGlvbi5CRUxPVyxcblx0XHRcdFx0fSxcblx0XHRcdFx0cGVyc2lzdGVuY2U6IHtcblx0XHRcdFx0XHRzdGlja3k6IHRydWUsXG5cdFx0XHRcdH0sXG5cdFx0XHR9LCB0cnVlKTtcblxuXHRcdFx0aWYgKGhvdmVyV2lkZ2V0KSB7XG5cdFx0XHRcdGRpc3Bvc2FibGVzLmFkZChob3ZlcldpZGdldCk7XG5cdFx0XHR9XG5cblx0XHRcdGljb25TZWxlY3RCb3gubGF5b3V0KGRpbWVuc2lvbik7XG5cdFx0XHRpY29uU2VsZWN0Qm94LmZvY3VzKCk7XG5cdFx0fSk7XG5cdH1cblxuXHRnZXQgc2VsZWN0ZWRXb3Jrc3BhY2VGb2xkZXIoKTogVVJJIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fc2VsZWN0ZWRGb2xkZXJVcmk7XG5cdH1cblxuXHRvdmVycmlkZSB1cGRhdGVTdHlsZXMoKTogdm9pZCB7XG5cdFx0c3VwZXIudXBkYXRlU3R5bGVzKCk7XG5cblx0XHRjb25zdCBjb250YWluZXIgPSBhc3NlcnRSZXR1cm5zRGVmaW5lZCh0aGlzLmdldENvbnRhaW5lcigpKTtcblx0XHRjb25zdCBiYWNrZ3JvdW5kID0gdGhpcy5nZXRDb2xvcihBQ1RJVklUWV9CQVJfQkFDS0dST1VORCkgfHwgJyc7XG5cdFx0Y29udGFpbmVyLnN0eWxlLmJhY2tncm91bmRDb2xvciA9IGJhY2tncm91bmQ7XG5cblx0XHRjb25zdCBib3JkZXJDb2xvciA9IHRoaXMuZ2V0Q29sb3IoQUNUSVZJVFlfQkFSX0JPUkRFUikgfHwgdGhpcy5nZXRDb2xvcihjb250cmFzdEJvcmRlcikgfHwgJyc7XG5cdFx0Y29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ2JvcmRlcmVkJywgISFib3JkZXJDb2xvcik7XG5cdFx0Y29udGFpbmVyLnN0eWxlLmJvcmRlckNvbG9yID0gYm9yZGVyQ29sb3IgPyBib3JkZXJDb2xvciA6ICcnO1xuXHR9XG5cblx0Zm9jdXMoKTogdm9pZCB7XG5cdFx0Ly8gRm9jdXMgdGhlIGFkZCBmb2xkZXIgYnV0dG9uIChmaXJzdCBmb2N1c2FibGUgZWxlbWVudClcblx0XHR0aGlzLmFkZEZvbGRlckJ1dHRvbj8uZm9jdXMoKTtcblx0fVxuXG5cdGZvY3VzR2xvYmFsQ29tcG9zaXRlQmFyKCk6IHZvaWQge1xuXHRcdHRoaXMuZ2xvYmFsQ29tcG9zaXRlQmFyLmZvY3VzKCk7XG5cdH1cblxuXHRvdmVycmlkZSBsYXlvdXQod2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIpOiB2b2lkIHtcblx0XHRzdXBlci5sYXlvdXQod2lkdGgsIGhlaWdodCwgMCwgMCk7XG5cblx0XHQvLyBUaGUgZ2xvYmFsIGNvbXBvc2l0ZSBiYXIgdGFrZXMgc29tZSBoZWlnaHQgYXQgdGhlIGJvdHRvbVxuXHRcdC8vIFRoZSBhY3Rpb25zIGNvbnRhaW5lciB3aWxsIHRha2UgdGhlIHJlbWFpbmluZyBzcGFjZSBkdWUgdG8gQ1NTIGZsZXggbGF5b3V0XG5cdH1cblxuXHR0b0pTT04oKTogb2JqZWN0IHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0dHlwZTogQWdlbnRpY1BhcnRzLlBST0pFQ1RCQVJfUEFSVFxuXHRcdH07XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FB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
