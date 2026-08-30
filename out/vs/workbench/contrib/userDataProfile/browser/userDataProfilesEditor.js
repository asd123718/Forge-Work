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
import "./media/userDataProfilesEditor.css";
import { $, addDisposableListener, append, clearNode, Dimension, EventHelper, EventType, trackFocus } from "../../../../base/browser/dom.js";
import { Action, Separator, SubmenuAction, toAction } from "../../../../base/common/actions.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { localize } from "../../../../nls.js";
import { IContextMenuService, IContextViewService } from "../../../../platform/contextview/browser/contextView.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IStorageService } from "../../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { IUserDataProfilesService, ProfileResourceType } from "../../../../platform/userDataProfile/common/userDataProfile.js";
import { EditorPane } from "../../../browser/parts/editor/editorPane.js";
import { EditorInputCapabilities } from "../../../common/editor.js";
import { EditorInput } from "../../../common/editor/editorInput.js";
import { defaultUserDataProfileIcon, IUserDataProfileManagementService, IUserDataProfileService, PROFILE_FILTER } from "../../../services/userDataProfile/common/userDataProfile.js";
import { Orientation, Sizing, SplitView } from "../../../../base/browser/ui/splitview/splitview.js";
import { Button, ButtonBar, ButtonWithDropdown } from "../../../../base/browser/ui/button/button.js";
import { defaultButtonStyles, defaultCheckboxStyles, defaultInputBoxStyles, defaultSelectBoxStyles, getInputBoxStyle, getListStyles } from "../../../../platform/theme/browser/defaultStyles.js";
import { editorBackground, foreground, registerColor } from "../../../../platform/theme/common/colorRegistry.js";
import { PANEL_BORDER } from "../../../common/theme.js";
import { WorkbenchAsyncDataTree, WorkbenchList, WorkbenchTable } from "../../../../platform/list/browser/listService.js";
import { CachedListVirtualDelegate } from "../../../../base/browser/ui/list/list.js";
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { InputBox, MessageType } from "../../../../base/browser/ui/inputbox/inputBox.js";
import { Checkbox } from "../../../../base/browser/ui/toggle/toggle.js";
import { DEFAULT_ICON, ICONS } from "../../../services/userDataProfile/common/userDataProfileIcons.js";
import { WorkbenchIconSelectBox } from "../../../services/userDataProfile/browser/iconSelectBox.js";
import { StandardKeyboardEvent } from "../../../../base/browser/keyboardEvent.js";
import { KeyCode } from "../../../../base/common/keyCodes.js";
import { IHoverService, WorkbenchHoverDelegate } from "../../../../platform/hover/browser/hover.js";
import { HoverPosition } from "../../../../base/browser/ui/hover/hoverWidget.js";
import { SelectBox, SeparatorSelectOption } from "../../../../base/browser/ui/selectBox/selectBox.js";
import { URI } from "../../../../base/common/uri.js";
import { IEditorProgressService } from "../../../../platform/progress/common/progress.js";
import { isString, isUndefined } from "../../../../base/common/types.js";
import { basename } from "../../../../base/common/resources.js";
import { RenderIndentGuides } from "../../../../base/browser/ui/tree/abstractTree.js";
import { DEFAULT_LABELS_CONTAINER, ResourceLabels } from "../../../browser/labels.js";
import { IFileDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { AbstractUserDataProfileElement, isProfileResourceChildElement, isProfileResourceTypeElement, NewProfileElement, UserDataProfileElement, UserDataProfilesEditorModel } from "./userDataProfilesEditorModel.js";
import { WorkbenchToolBar } from "../../../../platform/actions/browser/toolbar.js";
import { createInstantHoverDelegate, getDefaultHoverDelegate } from "../../../../base/browser/ui/hover/hoverDelegateFactory.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { Radio } from "../../../../base/browser/ui/radio/radio.js";
import { MarkdownString } from "../../../../base/common/htmlContent.js";
import { settingsTextInputBorder } from "../../preferences/common/settingsEditorColorRegistry.js";
import { renderMarkdown } from "../../../../base/browser/markdownRenderer.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { Schemas } from "../../../../base/common/network.js";
import { posix, win32 } from "../../../../base/common/path.js";
import { hasDriveLetter } from "../../../../base/common/extpath.js";
import { normalizeDriveLetter } from "../../../../base/common/labels.js";
import { ActionBar } from "../../../../base/browser/ui/actionbar/actionbar.js";
import { registerIcon } from "../../../../platform/theme/common/iconRegistry.js";
import { DropdownMenuActionViewItem } from "../../../../base/browser/ui/dropdown/dropdownActionViewItem.js";
import { IEnvironmentService } from "../../../../platform/environment/common/environment.js";
const editIcon = registerIcon("profiles-editor-edit-folder", Codicon.edit, localize("editIcon", "Icon for the edit folder icon in the profiles editor."));
const removeIcon = registerIcon("profiles-editor-remove-folder", Codicon.close, localize("removeIcon", "Icon for the remove folder icon in the profiles editor."));
const profilesSashBorder = registerColor("profiles.sashBorder", PANEL_BORDER, localize("profilesSashBorder", "The color of the Profiles editor splitview sash border."));
const listStyles = getListStyles({
  listActiveSelectionBackground: editorBackground,
  listActiveSelectionForeground: foreground,
  listFocusAndSelectionBackground: editorBackground,
  listFocusAndSelectionForeground: foreground,
  listFocusBackground: editorBackground,
  listFocusForeground: foreground,
  listHoverForeground: foreground,
  listHoverBackground: editorBackground,
  listHoverOutline: editorBackground,
  listFocusOutline: editorBackground,
  listInactiveSelectionBackground: editorBackground,
  listInactiveSelectionForeground: foreground,
  listInactiveFocusBackground: editorBackground,
  listInactiveFocusOutline: editorBackground,
  treeIndentGuidesStroke: void 0,
  treeInactiveIndentGuidesStroke: void 0,
  tableOddRowsBackgroundColor: editorBackground
});
let UserDataProfilesEditor = class extends EditorPane {
  constructor(group, telemetryService, themeService, storageService, quickInputService, fileDialogService, contextMenuService, instantiationService) {
    super(UserDataProfilesEditor.ID, group, telemetryService, themeService, storageService);
    this.quickInputService = quickInputService;
    this.fileDialogService = fileDialogService;
    this.contextMenuService = contextMenuService;
    this.instantiationService = instantiationService;
    this.templates = [];
  }
  layout(dimension, position) {
    if (this.container && this.splitView) {
      const height = dimension.height - 20;
      this.splitView.layout(this.container?.clientWidth, height);
      this.splitView.el.style.height = `${height}px`;
    }
  }
  createEditor(parent) {
    this.container = append(parent, $(".profiles-editor"));
    const sidebarView = append(this.container, $(".sidebar-view"));
    const sidebarContainer = append(sidebarView, $(".sidebar-container"));
    const contentsView = append(this.container, $(".contents-view"));
    const contentsContainer = append(contentsView, $(".contents-container"));
    this.profileWidget = this._register(this.instantiationService.createInstance(ProfileWidget, contentsContainer));
    this.splitView = new SplitView(this.container, {
      orientation: Orientation.HORIZONTAL,
      proportionalLayout: true
    });
    this.renderSidebar(sidebarContainer);
    this.splitView.addView({
      onDidChange: Event.None,
      element: sidebarView,
      minimumSize: 200,
      maximumSize: 350,
      layout: (width, _, height) => {
        sidebarView.style.width = `${width}px`;
        if (height && this.profilesList) {
          const listHeight = height - 40 - 15;
          this.profilesList.getHTMLElement().style.height = `${listHeight}px`;
          this.profilesList.layout(listHeight, width);
        }
      }
    }, 300, void 0, true);
    this.splitView.addView({
      onDidChange: Event.None,
      element: contentsView,
      minimumSize: 550,
      maximumSize: Number.POSITIVE_INFINITY,
      layout: (width, _, height) => {
        contentsView.style.width = `${width}px`;
        if (height) {
          this.profileWidget?.layout(new Dimension(width, height));
        }
      }
    }, Sizing.Distribute, void 0, true);
    this.registerListeners();
    this.updateStyles();
  }
  updateStyles() {
    const borderColor = this.theme.getColor(profilesSashBorder);
    this.splitView?.style({ separatorBorder: borderColor });
  }
  renderSidebar(parent) {
    this.renderNewProfileButton(append(parent, $(".new-profile-button")));
    const renderer = this.instantiationService.createInstance(ProfileElementRenderer);
    const delegate = new ProfileElementDelegate();
    this.profilesList = this._register(this.instantiationService.createInstance(
      WorkbenchList,
      "ProfilesList",
      append(parent, $(".profiles-list")),
      delegate,
      [renderer],
      {
        multipleSelectionSupport: false,
        setRowLineHeight: false,
        horizontalScrolling: false,
        accessibilityProvider: {
          getAriaLabel(profileElement) {
            return profileElement?.name ?? "";
          },
          getWidgetAriaLabel() {
            return localize("profiles", "Profiles");
          }
        },
        openOnSingleClick: true,
        identityProvider: {
          getId(e) {
            if (e instanceof UserDataProfileElement) {
              return e.profile.id;
            }
            return e.name;
          }
        },
        alwaysConsumeMouseWheel: false
      }
    ));
  }
  renderNewProfileButton(parent) {
    const button = this._register(new ButtonWithDropdown(parent, {
      actions: {
        getActions: () => {
          const actions = [];
          if (this.templates.length) {
            actions.push(new SubmenuAction("from.template", localize("from template", "From Template"), this.getCreateFromTemplateActions()));
            actions.push(new Separator());
          }
          actions.push(toAction({
            id: "importProfile",
            label: localize("importProfile", "Import Profile..."),
            run: () => this.importProfile()
          }));
          return actions;
        }
      },
      addPrimaryActionToDropdown: false,
      contextMenuProvider: this.contextMenuService,
      supportIcons: true,
      ...defaultButtonStyles
    }));
    button.label = localize("newProfile", "New Profile");
    this._register(button.onDidClick((e) => this.createNewProfile()));
  }
  getCreateFromTemplateActions() {
    return this.templates.map((template) => toAction({
      id: `template:${template.url}`,
      label: template.name,
      run: () => this.createNewProfile(URI.parse(template.url))
    }));
  }
  registerListeners() {
    if (this.profilesList) {
      this._register(this.profilesList.onDidChangeSelection((e) => {
        const [element] = e.elements;
        if (element instanceof AbstractUserDataProfileElement) {
          this.profileWidget?.render(element);
        }
      }));
      this._register(this.profilesList.onContextMenu((e) => {
        const actions = [];
        if (!e.element) {
          actions.push(...this.getTreeContextMenuActions());
        }
        if (e.element instanceof AbstractUserDataProfileElement) {
          actions.push(...e.element.actions[1]);
        }
        if (actions.length) {
          this.contextMenuService.showContextMenu({
            getAnchor: () => e.anchor,
            getActions: () => actions,
            getActionsContext: () => e.element
          });
        }
      }));
      this._register(this.profilesList.onMouseDblClick((e) => {
        if (!e.element) {
          this.createNewProfile();
        }
      }));
    }
  }
  getTreeContextMenuActions() {
    const actions = [];
    actions.push(toAction({
      id: "newProfile",
      label: localize("newProfile", "New Profile"),
      run: () => this.createNewProfile()
    }));
    const templateActions = this.getCreateFromTemplateActions();
    if (templateActions.length) {
      actions.push(new SubmenuAction("from.template", localize("new from template", "New Profile From Template"), templateActions));
    }
    actions.push(new Separator());
    actions.push(toAction({
      id: "importProfile",
      label: localize("importProfile", "Import Profile..."),
      run: () => this.importProfile()
    }));
    return actions;
  }
  async importProfile() {
    const disposables = new DisposableStore();
    const quickPick = disposables.add(this.quickInputService.createQuickPick());
    const updateQuickPickItems = (value) => {
      const quickPickItems = [];
      if (value) {
        quickPickItems.push({ label: quickPick.value, description: localize("import from url", "Import from URL") });
      }
      quickPickItems.push({ label: localize("import from file", "Select File...") });
      quickPick.items = quickPickItems;
    };
    quickPick.title = localize("import profile quick pick title", "Import from Profile Template...");
    quickPick.placeholder = localize("import profile placeholder", "Provide Profile Template URL");
    quickPick.ignoreFocusOut = true;
    disposables.add(quickPick.onDidChangeValue(updateQuickPickItems));
    updateQuickPickItems();
    quickPick.matchOnLabel = false;
    quickPick.matchOnDescription = false;
    disposables.add(quickPick.onDidAccept(async () => {
      quickPick.hide();
      const selectedItem = quickPick.selectedItems[0];
      if (!selectedItem) {
        return;
      }
      const url = selectedItem.label === quickPick.value ? URI.parse(quickPick.value) : await this.getProfileUriFromFileSystem();
      if (url) {
        this.createNewProfile(url);
      }
    }));
    disposables.add(quickPick.onDidHide(() => disposables.dispose()));
    quickPick.show();
  }
  async createNewProfile(copyFrom) {
    await this.model?.createNewProfile(copyFrom);
  }
  selectProfile(profile) {
    const index = this.model?.profiles.findIndex((p) => p instanceof UserDataProfileElement && p.profile.id === profile.id);
    if (index !== void 0 && index >= 0) {
      this.profilesList?.setSelection([index]);
    }
  }
  async getProfileUriFromFileSystem() {
    const profileLocation = await this.fileDialogService.showOpenDialog({
      canSelectFolders: false,
      canSelectFiles: true,
      canSelectMany: false,
      filters: PROFILE_FILTER,
      title: localize("import profile dialog", "Select Profile Template File")
    });
    if (!profileLocation) {
      return null;
    }
    return profileLocation[0];
  }
  async setInput(input, options, context, token) {
    await super.setInput(input, options, context, token);
    this.model = await input.resolve();
    this.model.getTemplates().then((templates) => {
      this.templates = templates;
      if (this.profileWidget) {
        this.profileWidget.templates = templates;
      }
    });
    this.updateProfilesList();
    this._register(this.model.onDidChange((element) => this.updateProfilesList(element)));
  }
  focus() {
    super.focus();
    this.profilesList?.domFocus();
  }
  updateProfilesList(elementToSelect) {
    if (!this.model) {
      return;
    }
    const currentSelectionIndex = this.profilesList?.getSelection()?.[0];
    const currentSelection = currentSelectionIndex !== void 0 ? this.profilesList?.element(currentSelectionIndex) : void 0;
    this.profilesList?.splice(0, this.profilesList.length, this.model.profiles);
    if (elementToSelect) {
      this.profilesList?.setSelection([this.model.profiles.indexOf(elementToSelect)]);
    } else if (currentSelection) {
      if (!this.model.profiles.includes(currentSelection)) {
        const elementToSelect2 = this.model.profiles.find((profile) => profile.name === currentSelection.name) ?? this.model.profiles[0];
        if (elementToSelect2) {
          this.profilesList?.setSelection([this.model.profiles.indexOf(elementToSelect2)]);
        }
      }
    } else {
      const elementToSelect2 = this.model.profiles.find((profile) => profile.active) ?? this.model.profiles[0];
      if (elementToSelect2) {
        this.profilesList?.setSelection([this.model.profiles.indexOf(elementToSelect2)]);
      }
    }
  }
};
UserDataProfilesEditor.ID = "workbench.editor.userDataProfiles";
UserDataProfilesEditor = __decorateClass([
  __decorateParam(1, ITelemetryService),
  __decorateParam(2, IThemeService),
  __decorateParam(3, IStorageService),
  __decorateParam(4, IQuickInputService),
  __decorateParam(5, IFileDialogService),
  __decorateParam(6, IContextMenuService),
  __decorateParam(7, IInstantiationService)
], UserDataProfilesEditor);
class ProfileElementDelegate {
  getHeight(element) {
    return 22;
  }
  getTemplateId() {
    return "profileListElement";
  }
}
let ProfileElementRenderer = class {
  constructor(instantiationService) {
    this.instantiationService = instantiationService;
    this.templateId = "profileListElement";
  }
  renderTemplate(container) {
    const disposables = new DisposableStore();
    const elementDisposables = new DisposableStore();
    container.classList.add("profile-list-item");
    const icon = append(container, $(".profile-list-item-icon"));
    const label = append(container, $(".profile-list-item-label"));
    const dirty = append(container, $(`span${ThemeIcon.asCSSSelector(Codicon.circleFilled)}`));
    const description = append(container, $(".profile-list-item-description"));
    append(description, $(`span${ThemeIcon.asCSSSelector(Codicon.check)}`), $("span", void 0, localize("activeProfile", "Active")));
    const actionsContainer = append(container, $(".profile-tree-item-actions-container"));
    const actionBar = disposables.add(this.instantiationService.createInstance(
      WorkbenchToolBar,
      actionsContainer,
      {
        hoverDelegate: disposables.add(createInstantHoverDelegate()),
        highlightToggledItems: true
      }
    ));
    return { label, icon, dirty, description, actionBar, disposables, elementDisposables };
  }
  renderElement(element, index, templateData) {
    templateData.elementDisposables.clear();
    templateData.label.textContent = element.name;
    templateData.label.classList.toggle("new-profile", element instanceof NewProfileElement);
    templateData.icon.className = ThemeIcon.asClassName(element.icon ? ThemeIcon.fromId(element.icon) : DEFAULT_ICON);
    templateData.dirty.classList.toggle("hide", !(element instanceof NewProfileElement));
    templateData.description.classList.toggle("hide", !element.active);
    templateData.elementDisposables.add(element.onDidChange((e) => {
      if (e.name) {
        templateData.label.textContent = element.name;
      }
      if (e.icon) {
        if (element.icon) {
          templateData.icon.className = ThemeIcon.asClassName(ThemeIcon.fromId(element.icon));
        } else {
          templateData.icon.className = "hide";
        }
      }
      if (e.active) {
        templateData.description.classList.toggle("hide", !element.active);
      }
    }));
    const setActions = () => templateData.actionBar.setActions(element.actions[0].filter((a) => a.enabled), element.actions[1].filter((a) => a.enabled));
    setActions();
    const events = [];
    for (const action of element.actions.flat()) {
      if (action instanceof Action) {
        events.push(action.onDidChange);
      }
    }
    templateData.elementDisposables.add(Event.any(...events)((e) => {
      if (e.enabled !== void 0) {
        setActions();
      }
    }));
  }
  disposeElement(element, index, templateData) {
    templateData.elementDisposables.clear();
  }
  disposeTemplate(templateData) {
    templateData.disposables.dispose();
    templateData.elementDisposables.dispose();
  }
};
ProfileElementRenderer = __decorateClass([
  __decorateParam(0, IInstantiationService)
], ProfileElementRenderer);
let ProfileWidget = class extends Disposable {
  constructor(parent, editorProgressService, instantiationService) {
    super();
    this.editorProgressService = editorProgressService;
    this.instantiationService = instantiationService;
    this._profileElement = this._register(new MutableDisposable());
    this.layoutParticipants = [];
    const header = append(parent, $(".profile-header"));
    const title = append(header, $(".profile-title-container"));
    this.profileTitle = append(title, $(".profile-title"));
    this.builtInLabel = append(title, $(".profile-built-in-label", void 0, localize("builtIn", "Built-in")));
    this.builtInLabel.classList.add("hide");
    const body = append(parent, $(".profile-body"));
    const delegate = new ProfileTreeDelegate();
    const contentsRenderer = this._register(this.instantiationService.createInstance(ContentsProfileRenderer));
    const associationsRenderer = this._register(this.instantiationService.createInstance(ProfileWorkspacesRenderer));
    this.layoutParticipants.push(associationsRenderer);
    this.copyFromProfileRenderer = this._register(this.instantiationService.createInstance(CopyFromProfileRenderer));
    this.profileTreeContainer = append(body, $(".profile-tree"));
    this.profileTree = this._register(this.instantiationService.createInstance(
      WorkbenchAsyncDataTree,
      "ProfileEditor-Tree",
      this.profileTreeContainer,
      delegate,
      [
        this._register(this.instantiationService.createInstance(ProfileNameRenderer)),
        this._register(this.instantiationService.createInstance(ProfileIconRenderer)),
        this._register(this.instantiationService.createInstance(UseForCurrentWindowPropertyRenderer)),
        this._register(this.instantiationService.createInstance(UseAsDefaultProfileRenderer)),
        this.copyFromProfileRenderer,
        contentsRenderer,
        associationsRenderer
      ],
      this.instantiationService.createInstance(ProfileTreeDataSource),
      {
        multipleSelectionSupport: false,
        horizontalScrolling: false,
        accessibilityProvider: {
          getAriaLabel(element) {
            return element?.element ?? "";
          },
          getWidgetAriaLabel() {
            return "";
          }
        },
        identityProvider: {
          getId(element) {
            return element.element;
          }
        },
        expandOnlyOnTwistieClick: true,
        renderIndentGuides: RenderIndentGuides.None,
        enableStickyScroll: false,
        openOnSingleClick: false,
        setRowLineHeight: false,
        supportDynamicHeights: true,
        alwaysConsumeMouseWheel: false
      }
    ));
    this.profileTree.style(listStyles);
    this._register(contentsRenderer.onDidChangeContentHeight((e) => this.profileTree.updateElementHeight(e, void 0)));
    this._register(associationsRenderer.onDidChangeContentHeight((e) => this.profileTree.updateElementHeight(e, void 0)));
    this._register(contentsRenderer.onDidChangeSelection((e) => {
      if (e.selected) {
        this.profileTree.setFocus([]);
        this.profileTree.setSelection([]);
      }
    }));
    this._register(this.profileTree.onDidChangeContentHeight((e) => {
      if (this.dimension) {
        this.layout(this.dimension);
      }
    }));
    this._register(this.profileTree.onDidChangeSelection((e) => {
      if (e.elements.length) {
        contentsRenderer.clearSelection();
      }
    }));
    this.buttonContainer = append(body, $(".profile-row-container.profile-button-container"));
  }
  set templates(templates) {
    this.copyFromProfileRenderer.setTemplates(templates);
    this.profileTree.rerender();
  }
  layout(dimension) {
    this.dimension = dimension;
    const treeContentHeight = this.profileTree.contentHeight;
    const height = Math.min(treeContentHeight, dimension.height - (this._profileElement.value?.element instanceof NewProfileElement ? 116 : 54));
    this.profileTreeContainer.style.height = `${height}px`;
    this.profileTree.layout(height, dimension.width);
    for (const participant of this.layoutParticipants) {
      participant.layout();
    }
  }
  render(profileElement) {
    if (this._profileElement.value?.element === profileElement) {
      return;
    }
    if (this._profileElement.value?.element instanceof UserDataProfileElement) {
      this._profileElement.value.element.reset();
    }
    this.profileTree.setInput(profileElement);
    const disposables = new DisposableStore();
    this._profileElement.value = { element: profileElement, dispose: () => disposables.dispose() };
    this.profileTitle.textContent = profileElement.name;
    this.builtInLabel.classList.toggle("hide", !(profileElement instanceof UserDataProfileElement && profileElement.profile.isDefault));
    disposables.add(profileElement.onDidChange((e) => {
      if (e.name) {
        this.profileTitle.textContent = profileElement.name;
      }
    }));
    const [primaryTitleButtons, secondatyTitleButtons] = profileElement.titleButtons;
    if (primaryTitleButtons?.length || secondatyTitleButtons?.length) {
      this.buttonContainer.classList.remove("hide");
      if (secondatyTitleButtons?.length) {
        for (const action of secondatyTitleButtons) {
          const button = disposables.add(new Button(this.buttonContainer, {
            ...defaultButtonStyles,
            secondary: true
          }));
          button.label = action.label;
          button.enabled = action.enabled;
          disposables.add(button.onDidClick(() => this.editorProgressService.showWhile(action.run())));
          disposables.add(action.onDidChange((e) => {
            if (!isUndefined(e.enabled)) {
              button.enabled = action.enabled;
            }
            if (!isUndefined(e.label)) {
              button.label = action.label;
            }
          }));
        }
      }
      if (primaryTitleButtons?.length) {
        for (const action of primaryTitleButtons) {
          const button = disposables.add(new Button(this.buttonContainer, {
            ...defaultButtonStyles
          }));
          button.label = action.label;
          button.enabled = action.enabled;
          disposables.add(button.onDidClick(() => this.editorProgressService.showWhile(action.run())));
          disposables.add(action.onDidChange((e) => {
            if (!isUndefined(e.enabled)) {
              button.enabled = action.enabled;
            }
            if (!isUndefined(e.label)) {
              button.label = action.label;
            }
          }));
          disposables.add(profileElement.onDidChange((e) => {
            if (e.message) {
              button.setTitle(profileElement.message ?? action.label);
              button.element.classList.toggle("error", !!profileElement.message);
            }
          }));
        }
      }
    } else {
      this.buttonContainer.classList.add("hide");
    }
    if (profileElement instanceof NewProfileElement) {
      this.profileTree.focusFirst();
    }
    if (this.dimension) {
      this.layout(this.dimension);
    }
  }
};
ProfileWidget = __decorateClass([
  __decorateParam(1, IEditorProgressService),
  __decorateParam(2, IInstantiationService)
], ProfileWidget);
class ProfileTreeDelegate extends CachedListVirtualDelegate {
  getTemplateId({ element }) {
    return element;
  }
  hasDynamicHeight({ element }) {
    return element === "contents" || element === "workspaces";
  }
  estimateHeight({ element, root }) {
    switch (element) {
      case "name":
        return 72;
      case "icon":
        return 68;
      case "copyFrom":
        return 90;
      case "useForCurrent":
      case "useAsDefault":
        return 68;
      case "contents":
        return 258;
      case "workspaces":
        return (root.workspaces ? root.workspaces.length * 24 + 30 : 0) + 112;
    }
  }
}
class ProfileTreeDataSource {
  hasChildren(element) {
    return element instanceof AbstractUserDataProfileElement;
  }
  async getChildren(element) {
    if (element instanceof AbstractUserDataProfileElement) {
      const children = [];
      if (element instanceof NewProfileElement) {
        children.push({ element: "name", root: element });
        children.push({ element: "icon", root: element });
        children.push({ element: "copyFrom", root: element });
        children.push({ element: "contents", root: element });
      } else if (element instanceof UserDataProfileElement) {
        if (!element.profile.isDefault) {
          children.push({ element: "name", root: element });
          children.push({ element: "icon", root: element });
        }
        children.push({ element: "useAsDefault", root: element });
        children.push({ element: "contents", root: element });
        children.push({ element: "workspaces", root: element });
      }
      return children;
    }
    return [];
  }
}
class ProfileContentTreeElementDelegate {
  getTemplateId(element) {
    if (!element.element.resourceType) {
      return ProfileResourceChildTreeItemRenderer.TEMPLATE_ID;
    }
    if (element.root instanceof NewProfileElement) {
      return NewProfileResourceTreeRenderer.TEMPLATE_ID;
    }
    return ExistingProfileResourceTreeRenderer.TEMPLATE_ID;
  }
  getHeight(element) {
    return 24;
  }
}
let ProfileResourceTreeDataSource = class {
  constructor(editorProgressService) {
    this.editorProgressService = editorProgressService;
  }
  hasChildren(element) {
    if (element instanceof AbstractUserDataProfileElement) {
      return true;
    }
    if (element.element.resourceType) {
      if (element.element.resourceType !== ProfileResourceType.Extensions && element.element.resourceType !== ProfileResourceType.Snippets) {
        return false;
      }
      if (element.root instanceof NewProfileElement) {
        const resourceType = element.element.resourceType;
        if (element.root.getFlag(resourceType)) {
          return true;
        }
        if (!element.root.hasResource(resourceType)) {
          return false;
        }
        if (element.root.copyFrom === void 0) {
          return false;
        }
        if (!element.root.getCopyFlag(resourceType)) {
          return false;
        }
      }
      return true;
    }
    return false;
  }
  async getChildren(element) {
    if (element instanceof AbstractUserDataProfileElement) {
      const children = await element.getChildren();
      return children.map((e) => ({ element: e, root: element }));
    }
    if (element.element.resourceType) {
      const progressRunner = this.editorProgressService.show(true, 500);
      try {
        const extensions = await element.root.getChildren(element.element.resourceType);
        return extensions.map((e) => ({ element: e, root: element.root }));
      } finally {
        progressRunner.done();
      }
    }
    return [];
  }
};
ProfileResourceTreeDataSource = __decorateClass([
  __decorateParam(0, IEditorProgressService)
], ProfileResourceTreeDataSource);
class AbstractProfileResourceTreeRenderer extends Disposable {
  getResourceTypeTitle(resourceType) {
    switch (resourceType) {
      case ProfileResourceType.Settings:
        return localize("settings", "Settings");
      case ProfileResourceType.Keybindings:
        return localize("keybindings", "Keyboard Shortcuts");
      case ProfileResourceType.Snippets:
        return localize("snippets", "Snippets");
      case ProfileResourceType.Tasks:
        return localize("tasks", "Tasks");
      case ProfileResourceType.Mcp:
        return localize("mcp", "MCP Servers");
      case ProfileResourceType.Extensions:
        return localize("extensions", "Extensions");
    }
    return "";
  }
  disposeElement(element, index, templateData) {
    templateData.elementDisposables.clear();
  }
  disposeTemplate(templateData) {
    templateData.disposables.dispose();
  }
}
class ProfilePropertyRenderer extends AbstractProfileResourceTreeRenderer {
  renderElement({ element }, index, templateData) {
    templateData.elementDisposables.clear();
    templateData.element = element;
  }
}
let ProfileNameRenderer = class extends ProfilePropertyRenderer {
  constructor(userDataProfilesService, contextViewService) {
    super();
    this.userDataProfilesService = userDataProfilesService;
    this.contextViewService = contextViewService;
    this.templateId = "name";
  }
  renderTemplate(parent) {
    const disposables = new DisposableStore();
    const elementDisposables = disposables.add(new DisposableStore());
    let profileElement;
    const nameContainer = append(parent, $(".profile-row-container"));
    append(nameContainer, $(".profile-label-element", void 0, localize("name", "Name")));
    const nameInput = disposables.add(new InputBox(
      nameContainer,
      this.contextViewService,
      {
        inputBoxStyles: getInputBoxStyle({
          inputBorder: settingsTextInputBorder
        }),
        ariaLabel: localize("profileName", "Profile Name"),
        placeholder: localize("profileName", "Profile Name"),
        validationOptions: {
          validation: (value) => {
            if (!value) {
              return {
                content: localize("name required", "Profile name is required and must be a non-empty value."),
                type: MessageType.WARNING
              };
            }
            if (profileElement?.root.disabled) {
              return null;
            }
            if (!profileElement?.root.shouldValidateName()) {
              return null;
            }
            const initialName = profileElement?.root.getInitialName();
            value = value.trim();
            if (initialName !== value && this.userDataProfilesService.profiles.some((p) => !p.isInternal && p.name === value)) {
              return {
                content: localize("profileExists", "Profile with name {0} already exists.", value),
                type: MessageType.WARNING
              };
            }
            return null;
          }
        }
      }
    ));
    disposables.add(nameInput.onDidChange((value) => {
      if (profileElement && value) {
        profileElement.root.name = value;
      }
    }));
    const focusTracker = disposables.add(trackFocus(nameInput.inputElement));
    disposables.add(focusTracker.onDidBlur(() => {
      if (profileElement && !nameInput.value) {
        nameInput.value = profileElement.root.name;
      }
    }));
    const renderName = (profileElement2) => {
      nameInput.value = profileElement2.root.name;
      nameInput.validate();
      const isSystemProfile = profileElement2.root instanceof UserDataProfileElement && profileElement2.root.profile.isDefault;
      if (profileElement2.root.disabled || isSystemProfile) {
        nameInput.disable();
      } else {
        nameInput.enable();
      }
      if (isSystemProfile) {
        nameInput.setTooltip(localize("defaultProfileName", "Name cannot be changed for the built in profiles"));
      } else {
        nameInput.setTooltip(localize("profileName", "Profile Name"));
      }
    };
    return {
      set element(element) {
        profileElement = element;
        renderName(profileElement);
        elementDisposables.add(profileElement.root.onDidChange((e) => {
          if (e.name || e.disabled) {
            renderName(element);
          }
          if (e.profile) {
            nameInput.validate();
          }
        }));
      },
      disposables,
      elementDisposables
    };
  }
};
ProfileNameRenderer = __decorateClass([
  __decorateParam(0, IUserDataProfilesService),
  __decorateParam(1, IContextViewService)
], ProfileNameRenderer);
let ProfileIconRenderer = class extends ProfilePropertyRenderer {
  constructor(instantiationService, hoverService) {
    super();
    this.instantiationService = instantiationService;
    this.hoverService = hoverService;
    this.templateId = "icon";
    this.hoverDelegate = getDefaultHoverDelegate("element");
  }
  renderTemplate(parent) {
    const disposables = new DisposableStore();
    const elementDisposables = disposables.add(new DisposableStore());
    let profileElement;
    const iconContainer = append(parent, $(".profile-row-container"));
    append(iconContainer, $(".profile-label-element", void 0, localize("icon-label", "Icon")));
    const iconValueContainer = append(iconContainer, $(".profile-icon-container"));
    const iconElement = append(iconValueContainer, $(`${ThemeIcon.asCSSSelector(DEFAULT_ICON)}`, { "tabindex": "0", "role": "button", "aria-label": localize("icon", "Profile Icon") }));
    const iconHover = disposables.add(this.hoverService.setupManagedHover(this.hoverDelegate, iconElement, ""));
    const iconSelectBox = disposables.add(this.instantiationService.createInstance(WorkbenchIconSelectBox, { icons: ICONS, inputBoxStyles: defaultInputBoxStyles }));
    let hoverWidget;
    const showIconSelectBox = () => {
      if (profileElement?.root instanceof UserDataProfileElement && profileElement.root.profile.isDefault) {
        return;
      }
      if (profileElement?.root.disabled) {
        return;
      }
      if (profileElement?.root instanceof UserDataProfileElement && profileElement.root.profile.isDefault) {
        return;
      }
      iconSelectBox.clearInput();
      hoverWidget = this.hoverService.showInstantHover({
        content: iconSelectBox.domNode,
        target: iconElement,
        position: {
          hoverPosition: HoverPosition.BELOW
        },
        persistence: {
          sticky: true
        },
        appearance: {
          showPointer: true
        }
      }, true);
      if (hoverWidget) {
        iconSelectBox.layout(new Dimension(486, 292));
        iconSelectBox.focus();
      }
    };
    disposables.add(addDisposableListener(iconElement, EventType.CLICK, (e) => {
      EventHelper.stop(e, true);
      showIconSelectBox();
    }));
    disposables.add(addDisposableListener(iconElement, EventType.KEY_DOWN, (e) => {
      const event = new StandardKeyboardEvent(e);
      if (event.equals(KeyCode.Enter) || event.equals(KeyCode.Space)) {
        EventHelper.stop(event, true);
        showIconSelectBox();
      }
    }));
    disposables.add(addDisposableListener(iconSelectBox.domNode, EventType.KEY_DOWN, (e) => {
      const event = new StandardKeyboardEvent(e);
      if (event.equals(KeyCode.Escape)) {
        EventHelper.stop(event, true);
        hoverWidget?.dispose();
        iconElement.focus();
      }
    }));
    disposables.add(iconSelectBox.onDidSelect((selectedIcon) => {
      hoverWidget?.dispose();
      iconElement.focus();
      if (profileElement) {
        profileElement.root.icon = selectedIcon.id;
      }
    }));
    append(iconValueContainer, $(".profile-description-element", void 0, localize("icon-description", "Profile icon to be shown in the activity bar")));
    const renderIcon = (profileElement2) => {
      if (profileElement2?.root instanceof UserDataProfileElement && profileElement2.root.profile.isDefault) {
        iconValueContainer.classList.add("disabled");
        iconHover.update(localize("defaultProfileIcon", "Icon cannot be changed for the default profile"));
      } else {
        iconHover.update(localize("changeIcon", "Click to change icon"));
        iconValueContainer.classList.remove("disabled");
      }
      if (profileElement2.root.icon) {
        iconElement.className = ThemeIcon.asClassName(ThemeIcon.fromId(profileElement2.root.icon));
      } else {
        iconElement.className = ThemeIcon.asClassName(ThemeIcon.fromId(DEFAULT_ICON.id));
      }
    };
    return {
      set element(element) {
        profileElement = element;
        renderIcon(profileElement);
        elementDisposables.add(profileElement.root.onDidChange((e) => {
          if (e.icon) {
            renderIcon(element);
          }
        }));
      },
      disposables,
      elementDisposables
    };
  }
};
ProfileIconRenderer = __decorateClass([
  __decorateParam(0, IInstantiationService),
  __decorateParam(1, IHoverService)
], ProfileIconRenderer);
let UseForCurrentWindowPropertyRenderer = class extends ProfilePropertyRenderer {
  constructor(userDataProfileService) {
    super();
    this.userDataProfileService = userDataProfileService;
    this.templateId = "useForCurrent";
  }
  renderTemplate(parent) {
    const disposables = new DisposableStore();
    const elementDisposables = disposables.add(new DisposableStore());
    let profileElement;
    const useForCurrentWindowContainer = append(parent, $(".profile-row-container"));
    append(useForCurrentWindowContainer, $(".profile-label-element", void 0, localize("use for curren window", "Use for Current Window")));
    const useForCurrentWindowValueContainer = append(useForCurrentWindowContainer, $(".profile-use-for-current-container"));
    const useForCurrentWindowTitle = localize("enable for current window", "Use this profile for the current window");
    const useForCurrentWindowCheckbox = disposables.add(new Checkbox(useForCurrentWindowTitle, false, defaultCheckboxStyles));
    append(useForCurrentWindowValueContainer, useForCurrentWindowCheckbox.domNode);
    const useForCurrentWindowLabel = append(useForCurrentWindowValueContainer, $(".profile-description-element", void 0, useForCurrentWindowTitle));
    disposables.add(useForCurrentWindowCheckbox.onChange(() => {
      if (profileElement?.root instanceof UserDataProfileElement) {
        profileElement.root.toggleCurrentWindowProfile();
      }
    }));
    disposables.add(addDisposableListener(useForCurrentWindowLabel, EventType.CLICK, () => {
      if (profileElement?.root instanceof UserDataProfileElement) {
        profileElement.root.toggleCurrentWindowProfile();
      }
    }));
    const renderUseCurrentProfile = (profileElement2) => {
      useForCurrentWindowCheckbox.checked = profileElement2.root instanceof UserDataProfileElement && this.userDataProfileService.currentProfile.id === profileElement2.root.profile.id;
      if (useForCurrentWindowCheckbox.checked && this.userDataProfileService.currentProfile.isDefault) {
        useForCurrentWindowCheckbox.disable();
      } else {
        useForCurrentWindowCheckbox.enable();
      }
    };
    const that = this;
    return {
      set element(element) {
        profileElement = element;
        renderUseCurrentProfile(profileElement);
        elementDisposables.add(that.userDataProfileService.onDidChangeCurrentProfile((e) => {
          renderUseCurrentProfile(element);
        }));
      },
      disposables,
      elementDisposables
    };
  }
};
UseForCurrentWindowPropertyRenderer = __decorateClass([
  __decorateParam(0, IUserDataProfileService)
], UseForCurrentWindowPropertyRenderer);
class UseAsDefaultProfileRenderer extends ProfilePropertyRenderer {
  constructor() {
    super(...arguments);
    this.templateId = "useAsDefault";
  }
  renderTemplate(parent) {
    const disposables = new DisposableStore();
    const elementDisposables = disposables.add(new DisposableStore());
    let profileElement;
    const useAsDefaultProfileContainer = append(parent, $(".profile-row-container"));
    append(useAsDefaultProfileContainer, $(".profile-label-element", void 0, localize("use for new windows", "Use for New Windows")));
    const useAsDefaultProfileValueContainer = append(useAsDefaultProfileContainer, $(".profile-use-as-default-container"));
    const useAsDefaultProfileTitle = localize("enable for new windows", "Use this profile as the default for new windows");
    const useAsDefaultProfileCheckbox = disposables.add(new Checkbox(useAsDefaultProfileTitle, false, defaultCheckboxStyles));
    append(useAsDefaultProfileValueContainer, useAsDefaultProfileCheckbox.domNode);
    const useAsDefaultProfileLabel = append(useAsDefaultProfileValueContainer, $(".profile-description-element", void 0, useAsDefaultProfileTitle));
    disposables.add(useAsDefaultProfileCheckbox.onChange(() => {
      if (profileElement?.root instanceof UserDataProfileElement) {
        profileElement.root.toggleNewWindowProfile();
      }
    }));
    disposables.add(addDisposableListener(useAsDefaultProfileLabel, EventType.CLICK, () => {
      if (profileElement?.root instanceof UserDataProfileElement) {
        profileElement.root.toggleNewWindowProfile();
      }
    }));
    const renderUseAsDefault = (profileElement2) => {
      useAsDefaultProfileCheckbox.checked = profileElement2.root instanceof UserDataProfileElement && profileElement2.root.isNewWindowProfile;
    };
    return {
      set element(element) {
        profileElement = element;
        renderUseAsDefault(profileElement);
        elementDisposables.add(profileElement.root.onDidChange((e) => {
          if (e.newWindowProfile) {
            renderUseAsDefault(element);
          }
        }));
      },
      disposables,
      elementDisposables
    };
  }
}
let CopyFromProfileRenderer = class extends ProfilePropertyRenderer {
  constructor(userDataProfilesService, instantiationService, uriIdentityService, contextViewService) {
    super();
    this.userDataProfilesService = userDataProfilesService;
    this.instantiationService = instantiationService;
    this.uriIdentityService = uriIdentityService;
    this.contextViewService = contextViewService;
    this.templateId = "copyFrom";
    this.templates = [];
  }
  renderTemplate(parent) {
    const disposables = new DisposableStore();
    const elementDisposables = disposables.add(new DisposableStore());
    let profileElement;
    const copyFromContainer = append(parent, $(".profile-row-container.profile-copy-from-container"));
    append(copyFromContainer, $(".profile-label-element", void 0, localize("create from", "Copy from")));
    append(copyFromContainer, $(".profile-description-element", void 0, localize("copy from description", "Select the profile source from which you want to copy contents")));
    const copyFromSelectBox = disposables.add(this.instantiationService.createInstance(
      SelectBox,
      [],
      0,
      this.contextViewService,
      defaultSelectBoxStyles,
      {
        useCustomDrawn: true,
        ariaLabel: localize("copy profile from", "Copy profile from")
      }
    ));
    copyFromSelectBox.render(append(copyFromContainer, $(".profile-select-container")));
    const render = (profileElement2, copyFromOptions) => {
      copyFromSelectBox.setOptions(copyFromOptions);
      const id = profileElement2.copyFrom instanceof URI ? profileElement2.copyFrom.toString() : profileElement2.copyFrom?.id;
      const index = id ? copyFromOptions.findIndex((option) => option.id === id) : 0;
      copyFromSelectBox.select(index);
    };
    const that = this;
    return {
      set element(element) {
        profileElement = element;
        if (profileElement.root instanceof NewProfileElement) {
          const newProfileElement = profileElement.root;
          let copyFromOptions = that.getCopyFromOptions(newProfileElement);
          render(newProfileElement, copyFromOptions);
          copyFromSelectBox.setEnabled(!newProfileElement.previewProfile && !newProfileElement.disabled);
          elementDisposables.add(profileElement.root.onDidChange((e) => {
            if (e.copyFrom || e.copyFromInfo) {
              copyFromOptions = that.getCopyFromOptions(newProfileElement);
              render(newProfileElement, copyFromOptions);
            }
            if (e.preview || e.disabled) {
              copyFromSelectBox.setEnabled(!newProfileElement.previewProfile && !newProfileElement.disabled);
            }
          }));
          elementDisposables.add(copyFromSelectBox.onDidSelect((option) => {
            newProfileElement.copyFrom = copyFromOptions[option.index].source;
          }));
        }
      },
      disposables,
      elementDisposables
    };
  }
  setTemplates(templates) {
    this.templates = templates;
  }
  getCopyFromOptions(profileElement) {
    const copyFromOptions = [];
    copyFromOptions.push({ text: localize("empty profile", "None") });
    for (const [copyFromTemplate, name] of profileElement.copyFromTemplates) {
      if (!this.templates.some((template) => this.uriIdentityService.extUri.isEqual(URI.parse(template.url), copyFromTemplate))) {
        copyFromOptions.push({ text: `${name} (${basename(copyFromTemplate)})`, id: copyFromTemplate.toString(), source: copyFromTemplate });
      }
    }
    if (this.templates.length) {
      copyFromOptions.push({ ...SeparatorSelectOption, decoratorRight: localize("from templates", "Profile Templates") });
      for (const template of this.templates) {
        copyFromOptions.push({ text: template.name, id: template.url, source: URI.parse(template.url) });
      }
    }
    copyFromOptions.push({ ...SeparatorSelectOption, decoratorRight: localize("from existing profiles", "Existing Profiles") });
    for (const profile of this.userDataProfilesService.profiles) {
      if (!profile.isInternal) {
        copyFromOptions.push({ text: profile.name, id: profile.id, source: profile });
      }
    }
    return copyFromOptions;
  }
};
CopyFromProfileRenderer = __decorateClass([
  __decorateParam(0, IUserDataProfilesService),
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, IUriIdentityService),
  __decorateParam(3, IContextViewService)
], CopyFromProfileRenderer);
let ContentsProfileRenderer = class extends ProfilePropertyRenderer {
  constructor(userDataProfilesService, contextMenuService, instantiationService) {
    super();
    this.userDataProfilesService = userDataProfilesService;
    this.contextMenuService = contextMenuService;
    this.instantiationService = instantiationService;
    this.templateId = "contents";
    this._onDidChangeContentHeight = this._register(new Emitter());
    this.onDidChangeContentHeight = this._onDidChangeContentHeight.event;
    this._onDidChangeSelection = this._register(new Emitter());
    this.onDidChangeSelection = this._onDidChangeSelection.event;
  }
  renderTemplate(parent) {
    const disposables = new DisposableStore();
    const elementDisposables = disposables.add(new DisposableStore());
    let profileElement;
    const configureRowContainer = append(parent, $(".profile-row-container"));
    append(configureRowContainer, $(".profile-label-element", void 0, localize("contents", "Contents")));
    const contentsDescriptionElement = append(configureRowContainer, $(".profile-description-element"));
    const contentsTreeHeader = append(configureRowContainer, $(".profile-content-tree-header"));
    const optionsLabel = $(".options-header", void 0, $("span", void 0, localize("options", "Source")));
    append(
      contentsTreeHeader,
      $(""),
      $("", void 0, localize("contents", "Contents")),
      optionsLabel,
      $("")
    );
    const delegate = new ProfileContentTreeElementDelegate();
    const profilesContentTree = this.profilesContentTree = disposables.add(this.instantiationService.createInstance(
      WorkbenchAsyncDataTree,
      "ProfileEditor-ContentsTree",
      append(configureRowContainer, $(".profile-content-tree.file-icon-themable-tree.show-file-icons")),
      delegate,
      [
        this.instantiationService.createInstance(ExistingProfileResourceTreeRenderer),
        this.instantiationService.createInstance(NewProfileResourceTreeRenderer),
        this.instantiationService.createInstance(ProfileResourceChildTreeItemRenderer)
      ],
      this.instantiationService.createInstance(ProfileResourceTreeDataSource),
      {
        multipleSelectionSupport: false,
        horizontalScrolling: false,
        accessibilityProvider: {
          getAriaLabel(element) {
            if ((element?.element).resourceType) {
              return (element?.element).resourceType;
            }
            if ((element?.element).label) {
              return (element?.element).label;
            }
            return "";
          },
          getWidgetAriaLabel() {
            return "";
          }
        },
        identityProvider: {
          getId(element) {
            if (element?.element.handle) {
              return element.element.handle;
            }
            return "";
          }
        },
        expandOnlyOnTwistieClick: true,
        renderIndentGuides: RenderIndentGuides.None,
        enableStickyScroll: false,
        openOnSingleClick: false,
        alwaysConsumeMouseWheel: false
      }
    ));
    this.profilesContentTree.style(listStyles);
    disposables.add(toDisposable(() => this.profilesContentTree = void 0));
    disposables.add(this.profilesContentTree.onDidChangeContentHeight((height) => {
      this.profilesContentTree?.layout(height);
      if (profileElement) {
        this._onDidChangeContentHeight.fire(profileElement);
      }
    }));
    disposables.add(this.profilesContentTree.onDidChangeSelection(((e) => {
      if (profileElement) {
        this._onDidChangeSelection.fire({ element: profileElement, selected: !!e.elements.length });
      }
    })));
    disposables.add(this.profilesContentTree.onDidOpen(async (e) => {
      if (!e.browserEvent) {
        return;
      }
      if (e.element?.element.openAction) {
        await e.element.element.openAction.run();
      }
    }));
    disposables.add(this.profilesContentTree.onContextMenu(async (e) => {
      if (!e.element?.element.actions?.contextMenu?.length) {
        return;
      }
      this.contextMenuService.showContextMenu({
        getAnchor: () => e.anchor,
        getActions: () => e.element?.element?.actions?.contextMenu ?? [],
        getActionsContext: () => e.element
      });
    }));
    const updateDescription = (element) => {
      clearNode(contentsDescriptionElement);
      const markdown = new MarkdownString();
      if (element.root instanceof UserDataProfileElement && element.root.profile.isDefault) {
        markdown.appendMarkdown(localize("default profile contents description", "Browse contents of this profile\n"));
      } else {
        markdown.appendMarkdown(localize("contents source description", "Configure source of contents for this profile\n"));
        if (element.root instanceof NewProfileElement) {
          const copyFromName = element.root.getCopyFromName();
          const optionName = copyFromName === this.userDataProfilesService.defaultProfile.name ? localize("copy from default", "{0} (Copy)", copyFromName) : copyFromName;
          if (optionName) {
            markdown.appendMarkdown(localize("copy info", "- *{0}:* Copy contents from the {1} profile\n", optionName, copyFromName));
          }
          markdown.appendMarkdown(localize("default info", "- *Default:* Use contents from the Default profile\n")).appendMarkdown(localize("none info", "- *None:* Create empty contents\n"));
        }
      }
      append(contentsDescriptionElement, elementDisposables.add(renderMarkdown(markdown)).element);
    };
    const that = this;
    return {
      set element(element) {
        profileElement = element;
        updateDescription(element);
        if (element.root instanceof NewProfileElement) {
          contentsTreeHeader.classList.remove("default-profile");
        } else if (element.root instanceof UserDataProfileElement) {
          contentsTreeHeader.classList.toggle("default-profile", element.root.profile.isDefault);
        }
        profilesContentTree.setInput(profileElement.root);
        elementDisposables.add(profileElement.root.onDidChange((e) => {
          if (e.copyFrom || e.copyFlags || e.flags || e.extensions || e.snippets || e.preview) {
            profilesContentTree.updateChildren(element.root);
          }
          if (e.copyFromInfo) {
            updateDescription(element);
            that._onDidChangeContentHeight.fire(element);
          }
        }));
      },
      disposables,
      elementDisposables
    };
  }
  clearSelection() {
    if (this.profilesContentTree) {
      this.profilesContentTree.setSelection([]);
      this.profilesContentTree.setFocus([]);
    }
  }
};
ContentsProfileRenderer = __decorateClass([
  __decorateParam(0, IUserDataProfilesService),
  __decorateParam(1, IContextMenuService),
  __decorateParam(2, IInstantiationService)
], ContentsProfileRenderer);
let ProfileWorkspacesRenderer = class extends ProfilePropertyRenderer {
  constructor(labelService, uriIdentityService, fileDialogService, instantiationService) {
    super();
    this.labelService = labelService;
    this.uriIdentityService = uriIdentityService;
    this.fileDialogService = fileDialogService;
    this.instantiationService = instantiationService;
    this.templateId = "workspaces";
    this._onDidChangeContentHeight = this._register(new Emitter());
    this.onDidChangeContentHeight = this._onDidChangeContentHeight.event;
    this._onDidChangeSelection = this._register(new Emitter());
    this.onDidChangeSelection = this._onDidChangeSelection.event;
  }
  renderTemplate(parent) {
    const disposables = new DisposableStore();
    const elementDisposables = disposables.add(new DisposableStore());
    let profileElement;
    const profileWorkspacesRowContainer = append(parent, $(".profile-row-container"));
    append(profileWorkspacesRowContainer, $(".profile-label-element", void 0, localize("folders_workspaces", "Folders & Workspaces")));
    const profileWorkspacesDescriptionElement = append(profileWorkspacesRowContainer, $(".profile-description-element"));
    const workspacesTableContainer = append(profileWorkspacesRowContainer, $(".profile-associations-table"));
    const table = this.workspacesTable = disposables.add(this.instantiationService.createInstance(
      WorkbenchTable,
      "ProfileEditor-AssociationsTable",
      workspacesTableContainer,
      new class {
        constructor() {
          this.headerRowHeight = 30;
        }
        getHeight() {
          return 24;
        }
      }(),
      [
        {
          label: "",
          tooltip: "",
          weight: 1,
          minimumWidth: 30,
          maximumWidth: 30,
          templateId: WorkspaceUriEmptyColumnRenderer.TEMPLATE_ID,
          project(row) {
            return row;
          }
        },
        {
          label: localize("hostColumnLabel", "Host"),
          tooltip: "",
          weight: 2,
          templateId: WorkspaceUriHostColumnRenderer.TEMPLATE_ID,
          project(row) {
            return row;
          }
        },
        {
          label: localize("pathColumnLabel", "Path"),
          tooltip: "",
          weight: 7,
          templateId: WorkspaceUriPathColumnRenderer.TEMPLATE_ID,
          project(row) {
            return row;
          }
        },
        {
          label: "",
          tooltip: "",
          weight: 1,
          minimumWidth: 84,
          maximumWidth: 84,
          templateId: WorkspaceUriActionsColumnRenderer.TEMPLATE_ID,
          project(row) {
            return row;
          }
        }
      ],
      [
        new WorkspaceUriEmptyColumnRenderer(),
        this.instantiationService.createInstance(WorkspaceUriHostColumnRenderer),
        this.instantiationService.createInstance(WorkspaceUriPathColumnRenderer),
        this.instantiationService.createInstance(WorkspaceUriActionsColumnRenderer)
      ],
      {
        horizontalScrolling: false,
        alwaysConsumeMouseWheel: false,
        openOnSingleClick: false,
        multipleSelectionSupport: false,
        accessibilityProvider: {
          getAriaLabel: (item) => {
            const hostLabel = getHostLabel(this.labelService, item.workspace);
            if (hostLabel === void 0 || hostLabel.length === 0) {
              return localize("trustedFolderAriaLabel", "{0}, trusted", this.labelService.getUriLabel(item.workspace));
            }
            return localize("trustedFolderWithHostAriaLabel", "{0} on {1}, trusted", this.labelService.getUriLabel(item.workspace), hostLabel);
          },
          getWidgetAriaLabel: () => localize("trustedFoldersAndWorkspaces", "Trusted Folders & Workspaces")
        },
        identityProvider: {
          getId(element) {
            return element.workspace.toString();
          }
        }
      }
    ));
    this.workspacesTable.style(listStyles);
    disposables.add(toDisposable(() => this.workspacesTable = void 0));
    disposables.add(this.workspacesTable.onDidChangeSelection(((e) => {
      if (profileElement) {
        this._onDidChangeSelection.fire({ element: profileElement, selected: !!e.elements.length });
      }
    })));
    const addButtonBarElement = append(profileWorkspacesRowContainer, $(".profile-workspaces-button-container"));
    const buttonBar = disposables.add(new ButtonBar(addButtonBarElement));
    const addButton = this._register(buttonBar.addButton({ title: localize("addButton", "Add Folder"), ...defaultButtonStyles }));
    addButton.label = localize("addButton", "Add Folder");
    disposables.add(addButton.onDidClick(async () => {
      const uris = await this.fileDialogService.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: true,
        openLabel: localize("addFolder", "Add Folder"),
        title: localize("addFolderTitle", "Select Folders To Add")
      });
      if (uris) {
        if (profileElement?.root instanceof UserDataProfileElement) {
          profileElement.root.updateWorkspaces(uris, []);
        }
      }
    }));
    disposables.add(table.onDidOpen((item) => {
      if (item?.element) {
        item.element.profileElement.openWorkspace(item.element.workspace);
      }
    }));
    const updateTable = () => {
      if (profileElement?.root instanceof UserDataProfileElement && profileElement.root.workspaces?.length) {
        profileWorkspacesDescriptionElement.textContent = localize("folders_workspaces_description", "Following folders and workspaces are using this profile");
        workspacesTableContainer.classList.remove("hide");
        table.splice(
          0,
          table.length,
          profileElement.root.workspaces.map((workspace) => ({ workspace, profileElement: profileElement.root })).sort((a, b) => this.uriIdentityService.extUri.compare(a.workspace, b.workspace))
        );
        this.layout();
      } else {
        profileWorkspacesDescriptionElement.textContent = localize("no_folder_description", "No folders or workspaces are using this profile");
        workspacesTableContainer.classList.add("hide");
      }
    };
    const that = this;
    return {
      set element(element) {
        profileElement = element;
        if (element.root instanceof UserDataProfileElement) {
          updateTable();
        }
        elementDisposables.add(profileElement.root.onDidChange((e) => {
          if (profileElement && e.workspaces) {
            updateTable();
            that._onDidChangeContentHeight.fire(profileElement);
          }
        }));
      },
      disposables,
      elementDisposables
    };
  }
  layout() {
    if (this.workspacesTable) {
      this.workspacesTable.layout(this.workspacesTable.length * 24 + 30, void 0);
    }
  }
  clearSelection() {
    if (this.workspacesTable) {
      this.workspacesTable.setSelection([]);
      this.workspacesTable.setFocus([]);
    }
  }
};
ProfileWorkspacesRenderer = __decorateClass([
  __decorateParam(0, ILabelService),
  __decorateParam(1, IUriIdentityService),
  __decorateParam(2, IFileDialogService),
  __decorateParam(3, IInstantiationService)
], ProfileWorkspacesRenderer);
let ExistingProfileResourceTreeRenderer = class extends AbstractProfileResourceTreeRenderer {
  constructor(instantiationService) {
    super();
    this.instantiationService = instantiationService;
    this.templateId = ExistingProfileResourceTreeRenderer.TEMPLATE_ID;
  }
  renderTemplate(parent) {
    const disposables = new DisposableStore();
    const container = append(parent, $(".profile-tree-item-container.existing-profile-resource-type-container"));
    const label = append(container, $(".profile-resource-type-label"));
    const radio = disposables.add(new Radio({ items: [] }));
    append(append(container, $(".profile-resource-options-container")), radio.domNode);
    const actionsContainer = append(container, $(".profile-resource-actions-container"));
    const actionBar = disposables.add(this.instantiationService.createInstance(
      WorkbenchToolBar,
      actionsContainer,
      {
        hoverDelegate: disposables.add(createInstantHoverDelegate()),
        highlightToggledItems: true
      }
    ));
    return { label, radio, actionBar, disposables, elementDisposables: disposables.add(new DisposableStore()) };
  }
  renderElement({ element: profileResourceTreeElement }, index, templateData) {
    templateData.elementDisposables.clear();
    const { element, root } = profileResourceTreeElement;
    if (!(root instanceof UserDataProfileElement)) {
      throw new Error("ExistingProfileResourceTreeRenderer can only render existing profile element");
    }
    if (isString(element) || !isProfileResourceTypeElement(element)) {
      throw new Error("Invalid profile resource element");
    }
    const updateRadioItems = () => {
      templateData.radio.setItems([
        {
          text: localize("default", "Default"),
          tooltip: localize("default description", "Use {0} from the Default profile", resourceTypeTitle),
          isActive: root.getFlag(element.resourceType)
        },
        {
          text: root.name,
          tooltip: localize("current description", "Use {0} from the {1} profile", resourceTypeTitle, root.name),
          isActive: !root.getFlag(element.resourceType)
        }
      ]);
    };
    const resourceTypeTitle = this.getResourceTypeTitle(element.resourceType);
    templateData.label.textContent = resourceTypeTitle;
    if (root instanceof UserDataProfileElement && root.profile.isDefault) {
      templateData.radio.domNode.classList.add("hide");
    } else {
      templateData.radio.domNode.classList.remove("hide");
      updateRadioItems();
      templateData.elementDisposables.add(root.onDidChange((e) => {
        if (e.name) {
          updateRadioItems();
        }
      }));
      templateData.elementDisposables.add(templateData.radio.onDidSelect((index2) => root.setFlag(element.resourceType, index2 === 0)));
    }
    const actions = [];
    if (element.openAction) {
      actions.push(element.openAction);
    }
    if (element.actions?.primary) {
      actions.push(...element.actions.primary);
    }
    templateData.actionBar.setActions(actions);
  }
};
ExistingProfileResourceTreeRenderer.TEMPLATE_ID = "ExistingProfileResourceTemplate";
ExistingProfileResourceTreeRenderer = __decorateClass([
  __decorateParam(0, IInstantiationService)
], ExistingProfileResourceTreeRenderer);
let NewProfileResourceTreeRenderer = class extends AbstractProfileResourceTreeRenderer {
  constructor(userDataProfilesService, instantiationService) {
    super();
    this.userDataProfilesService = userDataProfilesService;
    this.instantiationService = instantiationService;
    this.templateId = NewProfileResourceTreeRenderer.TEMPLATE_ID;
  }
  renderTemplate(parent) {
    const disposables = new DisposableStore();
    const container = append(parent, $(".profile-tree-item-container.new-profile-resource-type-container"));
    const labelContainer = append(container, $(".profile-resource-type-label-container"));
    const label = append(labelContainer, $("span.profile-resource-type-label"));
    const radio = disposables.add(new Radio({ items: [] }));
    append(append(container, $(".profile-resource-options-container")), radio.domNode);
    const actionsContainer = append(container, $(".profile-resource-actions-container"));
    const actionBar = disposables.add(this.instantiationService.createInstance(
      WorkbenchToolBar,
      actionsContainer,
      {
        hoverDelegate: disposables.add(createInstantHoverDelegate()),
        highlightToggledItems: true
      }
    ));
    return { label, radio, actionBar, disposables, elementDisposables: disposables.add(new DisposableStore()) };
  }
  renderElement({ element: profileResourceTreeElement }, index, templateData) {
    templateData.elementDisposables.clear();
    const { element, root } = profileResourceTreeElement;
    if (!(root instanceof NewProfileElement)) {
      throw new Error("NewProfileResourceTreeRenderer can only render new profile element");
    }
    if (isString(element) || !isProfileResourceTypeElement(element)) {
      throw new Error("Invalid profile resource element");
    }
    const resourceTypeTitle = this.getResourceTypeTitle(element.resourceType);
    templateData.label.textContent = resourceTypeTitle;
    const renderRadioItems = () => {
      const options = [
        {
          text: localize("default", "Default"),
          tooltip: localize("default description", "Use {0} from the Default profile", resourceTypeTitle)
        },
        {
          text: localize("none", "None"),
          tooltip: localize("none description", "Create empty {0}", resourceTypeTitle)
        }
      ];
      const copyFromName = root.getCopyFromName();
      const name = copyFromName === this.userDataProfilesService.defaultProfile.name ? localize("copy from default", "{0} (Copy)", copyFromName) : copyFromName;
      if (root.copyFrom && name) {
        templateData.radio.setItems([
          {
            text: name,
            tooltip: name ? localize("copy from profile description", "Copy {0} from the {1} profile", resourceTypeTitle, name) : localize("copy description", "Copy")
          },
          ...options
        ]);
        templateData.radio.setActiveItem(root.getCopyFlag(element.resourceType) ? 0 : root.getFlag(element.resourceType) ? 1 : 2);
      } else {
        templateData.radio.setItems(options);
        templateData.radio.setActiveItem(root.getFlag(element.resourceType) ? 0 : 1);
      }
    };
    if (root.copyFrom) {
      templateData.elementDisposables.add(templateData.radio.onDidSelect((index2) => {
        root.setFlag(element.resourceType, index2 === 1);
        root.setCopyFlag(element.resourceType, index2 === 0);
      }));
    } else {
      templateData.elementDisposables.add(templateData.radio.onDidSelect((index2) => {
        root.setFlag(element.resourceType, index2 === 0);
      }));
    }
    renderRadioItems();
    templateData.radio.setEnabled(!root.disabled && !root.previewProfile);
    templateData.elementDisposables.add(root.onDidChange((e) => {
      if (e.disabled || e.preview) {
        templateData.radio.setEnabled(!root.disabled && !root.previewProfile);
      }
      if (e.copyFrom || e.copyFromInfo) {
        renderRadioItems();
      }
    }));
    const actions = [];
    if (element.openAction) {
      actions.push(element.openAction);
    }
    if (element.actions?.primary) {
      actions.push(...element.actions.primary);
    }
    templateData.actionBar.setActions(actions);
  }
};
NewProfileResourceTreeRenderer.TEMPLATE_ID = "NewProfileResourceTemplate";
NewProfileResourceTreeRenderer = __decorateClass([
  __decorateParam(0, IUserDataProfilesService),
  __decorateParam(1, IInstantiationService)
], NewProfileResourceTreeRenderer);
let ProfileResourceChildTreeItemRenderer = class extends AbstractProfileResourceTreeRenderer {
  constructor(instantiationService) {
    super();
    this.instantiationService = instantiationService;
    this.templateId = ProfileResourceChildTreeItemRenderer.TEMPLATE_ID;
    this.labels = instantiationService.createInstance(ResourceLabels, DEFAULT_LABELS_CONTAINER);
    this.hoverDelegate = this._register(instantiationService.createInstance(WorkbenchHoverDelegate, "mouse", void 0, {}));
  }
  renderTemplate(parent) {
    const disposables = new DisposableStore();
    const container = append(parent, $(".profile-tree-item-container.profile-resource-child-container"));
    const checkbox = disposables.add(new Checkbox("", false, defaultCheckboxStyles));
    append(container, checkbox.domNode);
    const resourceLabel = disposables.add(this.labels.create(container, { hoverDelegate: this.hoverDelegate }));
    const actionsContainer = append(container, $(".profile-resource-actions-container"));
    const actionBar = disposables.add(this.instantiationService.createInstance(
      WorkbenchToolBar,
      actionsContainer,
      {
        hoverDelegate: disposables.add(createInstantHoverDelegate()),
        highlightToggledItems: true
      }
    ));
    return { checkbox, resourceLabel, actionBar, disposables, elementDisposables: disposables.add(new DisposableStore()) };
  }
  renderElement({ element: profileResourceTreeElement }, index, templateData) {
    templateData.elementDisposables.clear();
    const { element } = profileResourceTreeElement;
    if (isString(element) || !isProfileResourceChildElement(element)) {
      throw new Error("Invalid profile resource element");
    }
    if (element.checkbox) {
      templateData.checkbox.domNode.setAttribute("tabindex", "0");
      templateData.checkbox.domNode.classList.remove("hide");
      templateData.checkbox.checked = element.checkbox.isChecked;
      templateData.checkbox.domNode.ariaLabel = element.checkbox.accessibilityInformation?.label ?? "";
      if (element.checkbox.accessibilityInformation?.role) {
        templateData.checkbox.domNode.role = element.checkbox.accessibilityInformation.role;
      }
    } else {
      templateData.checkbox.domNode.removeAttribute("tabindex");
      templateData.checkbox.domNode.classList.add("hide");
    }
    templateData.resourceLabel.setResource(
      {
        name: element.resource ? basename(element.resource) : element.label,
        description: element.description,
        resource: element.resource
      },
      {
        forceLabel: true,
        icon: element.icon,
        hideIcon: !element.resource && !element.icon
      }
    );
    const actions = [];
    if (element.openAction) {
      actions.push(element.openAction);
    }
    if (element.actions?.primary) {
      actions.push(...element.actions.primary);
    }
    templateData.actionBar.setActions(actions);
  }
};
ProfileResourceChildTreeItemRenderer.TEMPLATE_ID = "ProfileResourceChildTreeItemTemplate";
ProfileResourceChildTreeItemRenderer = __decorateClass([
  __decorateParam(0, IInstantiationService)
], ProfileResourceChildTreeItemRenderer);
const _WorkspaceUriEmptyColumnRenderer = class _WorkspaceUriEmptyColumnRenderer {
  constructor() {
    this.templateId = _WorkspaceUriEmptyColumnRenderer.TEMPLATE_ID;
  }
  renderTemplate(container) {
    return {};
  }
  renderElement(item, index, templateData) {
  }
  disposeTemplate() {
  }
};
_WorkspaceUriEmptyColumnRenderer.TEMPLATE_ID = "empty";
let WorkspaceUriEmptyColumnRenderer = _WorkspaceUriEmptyColumnRenderer;
let WorkspaceUriHostColumnRenderer = class {
  constructor(uriIdentityService, labelService) {
    this.uriIdentityService = uriIdentityService;
    this.labelService = labelService;
    this.templateId = WorkspaceUriHostColumnRenderer.TEMPLATE_ID;
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
    templateData.hostContainer.innerText = getHostLabel(this.labelService, item.workspace);
    templateData.element.classList.toggle("current-workspace", this.uriIdentityService.extUri.isEqual(item.workspace, item.profileElement.getCurrentWorkspace()));
    templateData.hostContainer.style.display = "";
    templateData.buttonBarContainer.style.display = "none";
  }
  disposeTemplate(templateData) {
    templateData.disposables.dispose();
  }
};
WorkspaceUriHostColumnRenderer.TEMPLATE_ID = "host";
WorkspaceUriHostColumnRenderer = __decorateClass([
  __decorateParam(0, IUriIdentityService),
  __decorateParam(1, ILabelService)
], WorkspaceUriHostColumnRenderer);
let WorkspaceUriPathColumnRenderer = class {
  constructor(uriIdentityService, hoverService) {
    this.uriIdentityService = uriIdentityService;
    this.hoverService = hoverService;
    this.templateId = WorkspaceUriPathColumnRenderer.TEMPLATE_ID;
    this.hoverDelegate = getDefaultHoverDelegate("mouse");
  }
  renderTemplate(container) {
    const disposables = new DisposableStore();
    const element = container.appendChild($(".path"));
    const pathLabel = element.appendChild($("div.path-label"));
    const pathHover = disposables.add(this.hoverService.setupManagedHover(this.hoverDelegate, pathLabel, ""));
    const renderDisposables = disposables.add(new DisposableStore());
    return {
      element,
      pathLabel,
      pathHover,
      disposables,
      renderDisposables
    };
  }
  renderElement(item, index, templateData) {
    templateData.renderDisposables.clear();
    const stringValue = this.formatPath(item.workspace);
    templateData.pathLabel.innerText = stringValue;
    templateData.element.classList.toggle("current-workspace", this.uriIdentityService.extUri.isEqual(item.workspace, item.profileElement.getCurrentWorkspace()));
    templateData.pathHover.update(stringValue);
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
WorkspaceUriPathColumnRenderer.TEMPLATE_ID = "path";
WorkspaceUriPathColumnRenderer = __decorateClass([
  __decorateParam(0, IUriIdentityService),
  __decorateParam(1, IHoverService)
], WorkspaceUriPathColumnRenderer);
let ChangeProfileAction = class {
  constructor(item, userDataProfilesService, uriIdentityService, environmentService) {
    this.item = item;
    this.userDataProfilesService = userDataProfilesService;
    this.id = "changeProfile";
    this.label = "Change Profile";
    this.class = ThemeIcon.asClassName(editIcon);
    this.tooltip = localize("change profile", "Change Profile");
    this.checked = false;
    this.enabled = !uriIdentityService.extUri.isEqual(item.workspace, environmentService.agentSessionsWorkspace);
  }
  run() {
  }
  getSwitchProfileActions() {
    return this.userDataProfilesService.profiles.filter((profile) => !profile.isInternal).sort((a, b) => a.isDefault ? -1 : b.isDefault ? 1 : a.name.localeCompare(b.name)).map((profile) => ({
      id: `switchProfileTo${profile.id}`,
      label: profile.name,
      class: void 0,
      enabled: true,
      checked: profile.id === this.item.profileElement.profile.id,
      tooltip: "",
      run: () => {
        if (profile.id === this.item.profileElement.profile.id) {
          return;
        }
        this.userDataProfilesService.updateProfile(profile, { workspaces: [...profile.workspaces ?? [], this.item.workspace] });
      }
    }));
  }
};
ChangeProfileAction = __decorateClass([
  __decorateParam(1, IUserDataProfilesService),
  __decorateParam(2, IUriIdentityService),
  __decorateParam(3, IEnvironmentService)
], ChangeProfileAction);
let WorkspaceUriActionsColumnRenderer = class {
  constructor(userDataProfilesService, userDataProfileManagementService, contextMenuService, uriIdentityService, environmentService) {
    this.userDataProfilesService = userDataProfilesService;
    this.userDataProfileManagementService = userDataProfileManagementService;
    this.contextMenuService = contextMenuService;
    this.uriIdentityService = uriIdentityService;
    this.environmentService = environmentService;
    this.templateId = WorkspaceUriActionsColumnRenderer.TEMPLATE_ID;
  }
  renderTemplate(container) {
    const disposables = new DisposableStore();
    const element = container.appendChild($(".profile-workspaces-actions-container"));
    const hoverDelegate = disposables.add(createInstantHoverDelegate());
    const actionBar = disposables.add(new ActionBar(element, {
      hoverDelegate,
      actionViewItemProvider: (action) => {
        if (action instanceof ChangeProfileAction) {
          return new DropdownMenuActionViewItem(action, { getActions: () => action.getSwitchProfileActions() }, this.contextMenuService, {
            classNames: action.class,
            hoverDelegate
          });
        }
        return void 0;
      }
    }));
    return { actionBar, disposables };
  }
  renderElement(item, index, templateData) {
    templateData.actionBar.clear();
    const actions = [];
    actions.push(this.createOpenAction(item));
    actions.push(new ChangeProfileAction(item, this.userDataProfilesService, this.uriIdentityService, this.environmentService));
    actions.push(this.createDeleteAction(item));
    templateData.actionBar.push(actions, { icon: true });
  }
  createOpenAction(item) {
    return {
      label: "",
      class: ThemeIcon.asClassName(Codicon.window),
      enabled: !this.uriIdentityService.extUri.isEqual(item.workspace, item.profileElement.getCurrentWorkspace()),
      id: "openWorkspace",
      tooltip: localize("open", "Open in New Window"),
      run: () => item.profileElement.openWorkspace(item.workspace)
    };
  }
  createDeleteAction(item) {
    const isAgentSessionsWorkspace = this.uriIdentityService.extUri.isEqual(item.workspace, this.environmentService.agentSessionsWorkspace);
    return {
      label: "",
      class: ThemeIcon.asClassName(removeIcon),
      enabled: this.userDataProfileManagementService.getDefaultProfileToUse().id !== item.profileElement.profile.id && !isAgentSessionsWorkspace,
      id: "deleteTrustedUri",
      tooltip: localize("deleteTrustedUri", "Delete Path"),
      run: () => item.profileElement.updateWorkspaces([], [item.workspace])
    };
  }
  disposeTemplate(templateData) {
    templateData.disposables.dispose();
  }
};
WorkspaceUriActionsColumnRenderer.TEMPLATE_ID = "actions";
WorkspaceUriActionsColumnRenderer = __decorateClass([
  __decorateParam(0, IUserDataProfilesService),
  __decorateParam(1, IUserDataProfileManagementService),
  __decorateParam(2, IContextMenuService),
  __decorateParam(3, IUriIdentityService),
  __decorateParam(4, IEnvironmentService)
], WorkspaceUriActionsColumnRenderer);
function getHostLabel(labelService, workspaceUri) {
  return workspaceUri.authority ? labelService.getHostLabel(workspaceUri.scheme, workspaceUri.authority) : localize("localAuthority", "Local");
}
let UserDataProfilesEditorInput = class extends EditorInput {
  constructor(instantiationService) {
    super();
    this.instantiationService = instantiationService;
    this.resource = void 0;
    this._dirty = false;
    this.model = UserDataProfilesEditorModel.getInstance(this.instantiationService);
    this._register(this.model.onDidChange((e) => this.dirty = this.model.profiles.some((profile) => profile instanceof NewProfileElement)));
  }
  get dirty() {
    return this._dirty;
  }
  set dirty(dirty) {
    if (this._dirty !== dirty) {
      this._dirty = dirty;
      this._onDidChangeDirty.fire();
    }
  }
  get capabilities() {
    return EditorInputCapabilities.RequiresModal;
  }
  get typeId() {
    return UserDataProfilesEditorInput.ID;
  }
  getName() {
    return localize("userDataProfiles", "Profiles");
  }
  getIcon() {
    return defaultUserDataProfileIcon;
  }
  async resolve() {
    await this.model.resolve();
    return this.model;
  }
  isDirty() {
    return this.dirty;
  }
  async save() {
    await this.model.saveNewProfile();
    return this;
  }
  async revert() {
    this.model.revert();
  }
  matches(otherInput) {
    return otherInput instanceof UserDataProfilesEditorInput;
  }
  dispose() {
    for (const profile of this.model.profiles) {
      if (profile instanceof UserDataProfileElement) {
        profile.reset();
      }
    }
    super.dispose();
  }
};
UserDataProfilesEditorInput.ID = "workbench.input.userDataProfiles";
UserDataProfilesEditorInput = __decorateClass([
  __decorateParam(0, IInstantiationService)
], UserDataProfilesEditorInput);
class UserDataProfilesEditorInputSerializer {
  canSerialize(editorInput) {
    return true;
  }
  serialize(editorInput) {
    return "";
  }
  deserialize(instantiationService) {
    return instantiationService.createInstance(UserDataProfilesEditorInput);
  }
}
export {
  UserDataProfilesEditor,
  UserDataProfilesEditorInput,
  UserDataProfilesEditorInputSerializer,
  profilesSashBorder
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHVzZXJEYXRhUHJvZmlsZVxcYnJvd3NlclxcdXNlckRhdGFQcm9maWxlc0VkaXRvci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAnLi9tZWRpYS91c2VyRGF0YVByb2ZpbGVzRWRpdG9yLmNzcyc7XG5pbXBvcnQgeyAkLCBhZGREaXNwb3NhYmxlTGlzdGVuZXIsIGFwcGVuZCwgY2xlYXJOb2RlLCBEaW1lbnNpb24sIEV2ZW50SGVscGVyLCBFdmVudFR5cGUsIElEb21Qb3NpdGlvbiwgdHJhY2tGb2N1cyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgQWN0aW9uLCBJQWN0aW9uLCBJQWN0aW9uQ2hhbmdlRXZlbnQsIFNlcGFyYXRvciwgU3VibWVudUFjdGlvbiwgdG9BY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElDb250ZXh0TWVudVNlcnZpY2UsIElDb250ZXh0Vmlld1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IElUaGVtZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElVc2VyRGF0YVByb2ZpbGUsIElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSwgUHJvZmlsZVJlc291cmNlVHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VzZXJEYXRhUHJvZmlsZS9jb21tb24vdXNlckRhdGFQcm9maWxlLmpzJztcbmltcG9ydCB7IEVkaXRvclBhbmUgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3BhcnRzL2VkaXRvci9lZGl0b3JQYW5lLmpzJztcbmltcG9ydCB7IEVkaXRvcklucHV0Q2FwYWJpbGl0aWVzLCBJRWRpdG9yT3BlbkNvbnRleHQsIElFZGl0b3JTZXJpYWxpemVyLCBJVW50eXBlZEVkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IvZWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgSVVzZXJEYXRhUHJvZmlsZXNFZGl0b3IgfSBmcm9tICcuLi9jb21tb24vdXNlckRhdGFQcm9maWxlLmpzJztcbmltcG9ydCB7IElFZGl0b3JHcm91cCB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yR3JvdXBzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBkZWZhdWx0VXNlckRhdGFQcm9maWxlSWNvbiwgSVByb2ZpbGVUZW1wbGF0ZUluZm8sIElVc2VyRGF0YVByb2ZpbGVNYW5hZ2VtZW50U2VydmljZSwgSVVzZXJEYXRhUHJvZmlsZVNlcnZpY2UsIFBST0ZJTEVfRklMVEVSIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvdXNlckRhdGFQcm9maWxlL2NvbW1vbi91c2VyRGF0YVByb2ZpbGUuanMnO1xuaW1wb3J0IHsgT3JpZW50YXRpb24sIFNpemluZywgU3BsaXRWaWV3IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3NwbGl0dmlldy9zcGxpdHZpZXcuanMnO1xuaW1wb3J0IHsgQnV0dG9uLCBCdXR0b25CYXIsIEJ1dHRvbldpdGhEcm9wZG93biB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9idXR0b24vYnV0dG9uLmpzJztcbmltcG9ydCB7IGRlZmF1bHRCdXR0b25TdHlsZXMsIGRlZmF1bHRDaGVja2JveFN0eWxlcywgZGVmYXVsdElucHV0Qm94U3R5bGVzLCBkZWZhdWx0U2VsZWN0Qm94U3R5bGVzLCBnZXRJbnB1dEJveFN0eWxlLCBnZXRMaXN0U3R5bGVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvYnJvd3Nlci9kZWZhdWx0U3R5bGVzLmpzJztcbmltcG9ydCB7IGVkaXRvckJhY2tncm91bmQsIGZvcmVncm91bmQsIHJlZ2lzdGVyQ29sb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vY29sb3JSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBQQU5FTF9CT1JERVIgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdGhlbWUuanMnO1xuaW1wb3J0IHsgV29ya2JlbmNoQXN5bmNEYXRhVHJlZSwgV29ya2JlbmNoTGlzdCwgV29ya2JlbmNoVGFibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9saXN0L2Jyb3dzZXIvbGlzdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2FjaGVkTGlzdFZpcnR1YWxEZWxlZ2F0ZSwgSUxpc3RSZW5kZXJlciwgSUxpc3RWaXJ0dWFsRGVsZWdhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvbGlzdC9saXN0LmpzJztcbmltcG9ydCB7IElBc3luY0RhdGFTb3VyY2UsIElUcmVlTm9kZSwgSVRyZWVSZW5kZXJlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS90cmVlL3RyZWUuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgSUVkaXRvck9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9lZGl0b3IvY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlLCBNdXRhYmxlRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElucHV0Qm94LCBNZXNzYWdlVHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9pbnB1dGJveC9pbnB1dEJveC5qcyc7XG5pbXBvcnQgeyBDaGVja2JveCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS90b2dnbGUvdG9nZ2xlLmpzJztcbmltcG9ydCB7IERFRkFVTFRfSUNPTiwgSUNPTlMgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy91c2VyRGF0YVByb2ZpbGUvY29tbW9uL3VzZXJEYXRhUHJvZmlsZUljb25zLmpzJztcbmltcG9ydCB7IFdvcmtiZW5jaEljb25TZWxlY3RCb3ggfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy91c2VyRGF0YVByb2ZpbGUvYnJvd3Nlci9pY29uU2VsZWN0Qm94LmpzJztcbmltcG9ydCB7IFN0YW5kYXJkS2V5Ym9hcmRFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9rZXlib2FyZEV2ZW50LmpzJztcbmltcG9ydCB7IEtleUNvZGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyBJSG92ZXJTZXJ2aWNlLCBXb3JrYmVuY2hIb3ZlckRlbGVnYXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBIb3ZlclBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2hvdmVyL2hvdmVyV2lkZ2V0LmpzJztcbmltcG9ydCB7IElIb3ZlcldpZGdldCwgSU1hbmFnZWRIb3ZlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9ob3Zlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBJU2VsZWN0T3B0aW9uSXRlbSwgU2VsZWN0Qm94LCBTZXBhcmF0b3JTZWxlY3RPcHRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvc2VsZWN0Qm94L3NlbGVjdEJveC5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSUVkaXRvclByb2dyZXNzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2dyZXNzL2NvbW1vbi9wcm9ncmVzcy5qcyc7XG5pbXBvcnQgeyBpc1N0cmluZywgaXNVbmRlZmluZWQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBiYXNlbmFtZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBSZW5kZXJJbmRlbnRHdWlkZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdHJlZS9hYnN0cmFjdFRyZWUuanMnO1xuaW1wb3J0IHsgREVGQVVMVF9MQUJFTFNfQ09OVEFJTkVSLCBJUmVzb3VyY2VMYWJlbCwgUmVzb3VyY2VMYWJlbHMgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2xhYmVscy5qcyc7XG5pbXBvcnQgeyBJSG92ZXJEZWxlZ2F0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9ob3Zlci9ob3ZlckRlbGVnYXRlLmpzJztcbmltcG9ydCB7IElGaWxlRGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgSVF1aWNrSW5wdXRTZXJ2aWNlLCBJUXVpY2tQaWNrSXRlbSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3F1aWNraW5wdXQvY29tbW9uL3F1aWNrSW5wdXQuanMnO1xuaW1wb3J0IHsgQWJzdHJhY3RVc2VyRGF0YVByb2ZpbGVFbGVtZW50LCBpc1Byb2ZpbGVSZXNvdXJjZUNoaWxkRWxlbWVudCwgaXNQcm9maWxlUmVzb3VyY2VUeXBlRWxlbWVudCwgSVByb2ZpbGVDaGlsZEVsZW1lbnQsIElQcm9maWxlUmVzb3VyY2VUeXBlQ2hpbGRFbGVtZW50LCBJUHJvZmlsZVJlc291cmNlVHlwZUVsZW1lbnQsIE5ld1Byb2ZpbGVFbGVtZW50LCBVc2VyRGF0YVByb2ZpbGVFbGVtZW50LCBVc2VyRGF0YVByb2ZpbGVzRWRpdG9yTW9kZWwgfSBmcm9tICcuL3VzZXJEYXRhUHJvZmlsZXNFZGl0b3JNb2RlbC5qcyc7XG5pbXBvcnQgeyBXb3JrYmVuY2hUb29sQmFyIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL3Rvb2xiYXIuanMnO1xuaW1wb3J0IHsgY3JlYXRlSW5zdGFudEhvdmVyRGVsZWdhdGUsIGdldERlZmF1bHRIb3ZlckRlbGVnYXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2hvdmVyL2hvdmVyRGVsZWdhdGVGYWN0b3J5LmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBSYWRpbyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9yYWRpby9yYWRpby5qcyc7XG5pbXBvcnQgeyBNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IHNldHRpbmdzVGV4dElucHV0Qm9yZGVyIH0gZnJvbSAnLi4vLi4vcHJlZmVyZW5jZXMvY29tbW9uL3NldHRpbmdzRWRpdG9yQ29sb3JSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyByZW5kZXJNYXJrZG93biB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9tYXJrZG93blJlbmRlcmVyLmpzJztcbmltcG9ydCB7IElVcmlJZGVudGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91cmlJZGVudGl0eS9jb21tb24vdXJpSWRlbnRpdHkuanMnO1xuaW1wb3J0IHsgSVRhYmxlUmVuZGVyZXIsIElUYWJsZVZpcnR1YWxEZWxlZ2F0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS90YWJsZS90YWJsZS5qcyc7XG5pbXBvcnQgeyBJTGFiZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGFiZWwvY29tbW9uL2xhYmVsLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IHBvc2l4LCB3aW4zMiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuaW1wb3J0IHsgaGFzRHJpdmVMZXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9leHRwYXRoLmpzJztcbmltcG9ydCB7IG5vcm1hbGl6ZURyaXZlTGV0dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGFiZWxzLmpzJztcbmltcG9ydCB7IEFjdGlvbkJhciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hY3Rpb25iYXIvYWN0aW9uYmFyLmpzJztcbmltcG9ydCB7IHJlZ2lzdGVySWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9pY29uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgRHJvcGRvd25NZW51QWN0aW9uVmlld0l0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvZHJvcGRvd24vZHJvcGRvd25BY3Rpb25WaWV3SXRlbS5qcyc7XG5pbXBvcnQgeyBJRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50LmpzJztcblxuY29uc3QgZWRpdEljb24gPSByZWdpc3Rlckljb24oJ3Byb2ZpbGVzLWVkaXRvci1lZGl0LWZvbGRlcicsIENvZGljb24uZWRpdCwgbG9jYWxpemUoJ2VkaXRJY29uJywgJ0ljb24gZm9yIHRoZSBlZGl0IGZvbGRlciBpY29uIGluIHRoZSBwcm9maWxlcyBlZGl0b3IuJykpO1xuY29uc3QgcmVtb3ZlSWNvbiA9IHJlZ2lzdGVySWNvbigncHJvZmlsZXMtZWRpdG9yLXJlbW92ZS1mb2xkZXInLCBDb2RpY29uLmNsb3NlLCBsb2NhbGl6ZSgncmVtb3ZlSWNvbicsICdJY29uIGZvciB0aGUgcmVtb3ZlIGZvbGRlciBpY29uIGluIHRoZSBwcm9maWxlcyBlZGl0b3IuJykpO1xuXG5leHBvcnQgY29uc3QgcHJvZmlsZXNTYXNoQm9yZGVyID0gcmVnaXN0ZXJDb2xvcigncHJvZmlsZXMuc2FzaEJvcmRlcicsIFBBTkVMX0JPUkRFUiwgbG9jYWxpemUoJ3Byb2ZpbGVzU2FzaEJvcmRlcicsIFwiVGhlIGNvbG9yIG9mIHRoZSBQcm9maWxlcyBlZGl0b3Igc3BsaXR2aWV3IHNhc2ggYm9yZGVyLlwiKSk7XG5cbmNvbnN0IGxpc3RTdHlsZXMgPSBnZXRMaXN0U3R5bGVzKHtcblx0bGlzdEFjdGl2ZVNlbGVjdGlvbkJhY2tncm91bmQ6IGVkaXRvckJhY2tncm91bmQsXG5cdGxpc3RBY3RpdmVTZWxlY3Rpb25Gb3JlZ3JvdW5kOiBmb3JlZ3JvdW5kLFxuXHRsaXN0Rm9jdXNBbmRTZWxlY3Rpb25CYWNrZ3JvdW5kOiBlZGl0b3JCYWNrZ3JvdW5kLFxuXHRsaXN0Rm9jdXNBbmRTZWxlY3Rpb25Gb3JlZ3JvdW5kOiBmb3JlZ3JvdW5kLFxuXHRsaXN0Rm9jdXNCYWNrZ3JvdW5kOiBlZGl0b3JCYWNrZ3JvdW5kLFxuXHRsaXN0Rm9jdXNGb3JlZ3JvdW5kOiBmb3JlZ3JvdW5kLFxuXHRsaXN0SG92ZXJGb3JlZ3JvdW5kOiBmb3JlZ3JvdW5kLFxuXHRsaXN0SG92ZXJCYWNrZ3JvdW5kOiBlZGl0b3JCYWNrZ3JvdW5kLFxuXHRsaXN0SG92ZXJPdXRsaW5lOiBlZGl0b3JCYWNrZ3JvdW5kLFxuXHRsaXN0Rm9jdXNPdXRsaW5lOiBlZGl0b3JCYWNrZ3JvdW5kLFxuXHRsaXN0SW5hY3RpdmVTZWxlY3Rpb25CYWNrZ3JvdW5kOiBlZGl0b3JCYWNrZ3JvdW5kLFxuXHRsaXN0SW5hY3RpdmVTZWxlY3Rpb25Gb3JlZ3JvdW5kOiBmb3JlZ3JvdW5kLFxuXHRsaXN0SW5hY3RpdmVGb2N1c0JhY2tncm91bmQ6IGVkaXRvckJhY2tncm91bmQsXG5cdGxpc3RJbmFjdGl2ZUZvY3VzT3V0bGluZTogZWRpdG9yQmFja2dyb3VuZCxcblx0dHJlZUluZGVudEd1aWRlc1N0cm9rZTogdW5kZWZpbmVkLFxuXHR0cmVlSW5hY3RpdmVJbmRlbnRHdWlkZXNTdHJva2U6IHVuZGVmaW5lZCxcblx0dGFibGVPZGRSb3dzQmFja2dyb3VuZENvbG9yOiBlZGl0b3JCYWNrZ3JvdW5kLFxufSk7XG5cbmV4cG9ydCBjbGFzcyBVc2VyRGF0YVByb2ZpbGVzRWRpdG9yIGV4dGVuZHMgRWRpdG9yUGFuZSBpbXBsZW1lbnRzIElVc2VyRGF0YVByb2ZpbGVzRWRpdG9yIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQ6IHN0cmluZyA9ICd3b3JrYmVuY2guZWRpdG9yLnVzZXJEYXRhUHJvZmlsZXMnO1xuXG5cdHByaXZhdGUgY29udGFpbmVyOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBzcGxpdFZpZXc6IFNwbGl0VmlldzxudW1iZXI+IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHByb2ZpbGVzTGlzdDogV29ya2JlbmNoTGlzdDxBYnN0cmFjdFVzZXJEYXRhUHJvZmlsZUVsZW1lbnQ+IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHByb2ZpbGVXaWRnZXQ6IFByb2ZpbGVXaWRnZXQgfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSBtb2RlbDogVXNlckRhdGFQcm9maWxlc0VkaXRvck1vZGVsIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHRlbXBsYXRlczogcmVhZG9ubHkgSVByb2ZpbGVUZW1wbGF0ZUluZm9bXSA9IFtdO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGdyb3VwOiBJRWRpdG9yR3JvdXAsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHRlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElRdWlja0lucHV0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHF1aWNrSW5wdXRTZXJ2aWNlOiBJUXVpY2tJbnB1dFNlcnZpY2UsXG5cdFx0QElGaWxlRGlhbG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGZpbGVEaWFsb2dTZXJ2aWNlOiBJRmlsZURpYWxvZ1NlcnZpY2UsXG5cdFx0QElDb250ZXh0TWVudVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKFVzZXJEYXRhUHJvZmlsZXNFZGl0b3IuSUQsIGdyb3VwLCB0ZWxlbWV0cnlTZXJ2aWNlLCB0aGVtZVNlcnZpY2UsIHN0b3JhZ2VTZXJ2aWNlKTtcblx0fVxuXG5cdGxheW91dChkaW1lbnNpb246IERpbWVuc2lvbiwgcG9zaXRpb24/OiBJRG9tUG9zaXRpb24gfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5jb250YWluZXIgJiYgdGhpcy5zcGxpdFZpZXcpIHtcblx0XHRcdGNvbnN0IGhlaWdodCA9IGRpbWVuc2lvbi5oZWlnaHQgLSAyMDtcblx0XHRcdHRoaXMuc3BsaXRWaWV3LmxheW91dCh0aGlzLmNvbnRhaW5lcj8uY2xpZW50V2lkdGgsIGhlaWdodCk7XG5cdFx0XHR0aGlzLnNwbGl0Vmlldy5lbC5zdHlsZS5oZWlnaHQgPSBgJHtoZWlnaHR9cHhgO1xuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBjcmVhdGVFZGl0b3IocGFyZW50OiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHRoaXMuY29udGFpbmVyID0gYXBwZW5kKHBhcmVudCwgJCgnLnByb2ZpbGVzLWVkaXRvcicpKTtcblxuXHRcdGNvbnN0IHNpZGViYXJWaWV3ID0gYXBwZW5kKHRoaXMuY29udGFpbmVyLCAkKCcuc2lkZWJhci12aWV3JykpO1xuXHRcdGNvbnN0IHNpZGViYXJDb250YWluZXIgPSBhcHBlbmQoc2lkZWJhclZpZXcsICQoJy5zaWRlYmFyLWNvbnRhaW5lcicpKTtcblxuXHRcdGNvbnN0IGNvbnRlbnRzVmlldyA9IGFwcGVuZCh0aGlzLmNvbnRhaW5lciwgJCgnLmNvbnRlbnRzLXZpZXcnKSk7XG5cdFx0Y29uc3QgY29udGVudHNDb250YWluZXIgPSBhcHBlbmQoY29udGVudHNWaWV3LCAkKCcuY29udGVudHMtY29udGFpbmVyJykpO1xuXHRcdHRoaXMucHJvZmlsZVdpZGdldCA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUHJvZmlsZVdpZGdldCwgY29udGVudHNDb250YWluZXIpKTtcblxuXHRcdHRoaXMuc3BsaXRWaWV3ID0gbmV3IFNwbGl0Vmlldyh0aGlzLmNvbnRhaW5lciwge1xuXHRcdFx0b3JpZW50YXRpb246IE9yaWVudGF0aW9uLkhPUklaT05UQUwsXG5cdFx0XHRwcm9wb3J0aW9uYWxMYXlvdXQ6IHRydWVcblx0XHR9KTtcblxuXHRcdHRoaXMucmVuZGVyU2lkZWJhcihzaWRlYmFyQ29udGFpbmVyKTtcblx0XHR0aGlzLnNwbGl0Vmlldy5hZGRWaWV3KHtcblx0XHRcdG9uRGlkQ2hhbmdlOiBFdmVudC5Ob25lLFxuXHRcdFx0ZWxlbWVudDogc2lkZWJhclZpZXcsXG5cdFx0XHRtaW5pbXVtU2l6ZTogMjAwLFxuXHRcdFx0bWF4aW11bVNpemU6IDM1MCxcblx0XHRcdGxheW91dDogKHdpZHRoLCBfLCBoZWlnaHQpID0+IHtcblx0XHRcdFx0c2lkZWJhclZpZXcuc3R5bGUud2lkdGggPSBgJHt3aWR0aH1weGA7XG5cdFx0XHRcdGlmIChoZWlnaHQgJiYgdGhpcy5wcm9maWxlc0xpc3QpIHtcblx0XHRcdFx0XHRjb25zdCBsaXN0SGVpZ2h0ID0gaGVpZ2h0IC0gNDAgLyogbmV3IHByb2ZpbGUgYnV0dG9uICovIC0gMTUgLyogbWFyZ2luVG9wICovO1xuXHRcdFx0XHRcdHRoaXMucHJvZmlsZXNMaXN0LmdldEhUTUxFbGVtZW50KCkuc3R5bGUuaGVpZ2h0ID0gYCR7bGlzdEhlaWdodH1weGA7XG5cdFx0XHRcdFx0dGhpcy5wcm9maWxlc0xpc3QubGF5b3V0KGxpc3RIZWlnaHQsIHdpZHRoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0sIDMwMCwgdW5kZWZpbmVkLCB0cnVlKTtcblx0XHR0aGlzLnNwbGl0Vmlldy5hZGRWaWV3KHtcblx0XHRcdG9uRGlkQ2hhbmdlOiBFdmVudC5Ob25lLFxuXHRcdFx0ZWxlbWVudDogY29udGVudHNWaWV3LFxuXHRcdFx0bWluaW11bVNpemU6IDU1MCxcblx0XHRcdG1heGltdW1TaXplOiBOdW1iZXIuUE9TSVRJVkVfSU5GSU5JVFksXG5cdFx0XHRsYXlvdXQ6ICh3aWR0aCwgXywgaGVpZ2h0KSA9PiB7XG5cdFx0XHRcdGNvbnRlbnRzVmlldy5zdHlsZS53aWR0aCA9IGAke3dpZHRofXB4YDtcblx0XHRcdFx0aWYgKGhlaWdodCkge1xuXHRcdFx0XHRcdHRoaXMucHJvZmlsZVdpZGdldD8ubGF5b3V0KG5ldyBEaW1lbnNpb24od2lkdGgsIGhlaWdodCkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSwgU2l6aW5nLkRpc3RyaWJ1dGUsIHVuZGVmaW5lZCwgdHJ1ZSk7XG5cblx0XHR0aGlzLnJlZ2lzdGVyTGlzdGVuZXJzKCk7XG5cdFx0dGhpcy51cGRhdGVTdHlsZXMoKTtcblx0fVxuXG5cdG92ZXJyaWRlIHVwZGF0ZVN0eWxlcygpOiB2b2lkIHtcblx0XHRjb25zdCBib3JkZXJDb2xvciA9IHRoaXMudGhlbWUuZ2V0Q29sb3IocHJvZmlsZXNTYXNoQm9yZGVyKSE7XG5cdFx0dGhpcy5zcGxpdFZpZXc/LnN0eWxlKHsgc2VwYXJhdG9yQm9yZGVyOiBib3JkZXJDb2xvciB9KTtcblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyU2lkZWJhcihwYXJlbnQ6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0Ly8gcmVuZGVyIE5ldyBQcm9maWxlIEJ1dHRvblxuXHRcdHRoaXMucmVuZGVyTmV3UHJvZmlsZUJ1dHRvbihhcHBlbmQocGFyZW50LCAkKCcubmV3LXByb2ZpbGUtYnV0dG9uJykpKTtcblxuXHRcdC8vIHJlbmRlciBwcm9maWxlcyBsaXN0XG5cdFx0Y29uc3QgcmVuZGVyZXIgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFByb2ZpbGVFbGVtZW50UmVuZGVyZXIpO1xuXHRcdGNvbnN0IGRlbGVnYXRlID0gbmV3IFByb2ZpbGVFbGVtZW50RGVsZWdhdGUoKTtcblx0XHR0aGlzLnByb2ZpbGVzTGlzdCA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoV29ya2JlbmNoTGlzdDxBYnN0cmFjdFVzZXJEYXRhUHJvZmlsZUVsZW1lbnQ+LCAnUHJvZmlsZXNMaXN0Jyxcblx0XHRcdGFwcGVuZChwYXJlbnQsICQoJy5wcm9maWxlcy1saXN0JykpLFxuXHRcdFx0ZGVsZWdhdGUsXG5cdFx0XHRbcmVuZGVyZXJdLFxuXHRcdFx0e1xuXHRcdFx0XHRtdWx0aXBsZVNlbGVjdGlvblN1cHBvcnQ6IGZhbHNlLFxuXHRcdFx0XHRzZXRSb3dMaW5lSGVpZ2h0OiBmYWxzZSxcblx0XHRcdFx0aG9yaXpvbnRhbFNjcm9sbGluZzogZmFsc2UsXG5cdFx0XHRcdGFjY2Vzc2liaWxpdHlQcm92aWRlcjoge1xuXHRcdFx0XHRcdGdldEFyaWFMYWJlbChwcm9maWxlRWxlbWVudDogQWJzdHJhY3RVc2VyRGF0YVByb2ZpbGVFbGVtZW50IHwgbnVsbCk6IHN0cmluZyB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gcHJvZmlsZUVsZW1lbnQ/Lm5hbWUgPz8gJyc7XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRnZXRXaWRnZXRBcmlhTGFiZWwoKTogc3RyaW5nIHtcblx0XHRcdFx0XHRcdHJldHVybiBsb2NhbGl6ZSgncHJvZmlsZXMnLCBcIlByb2ZpbGVzXCIpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdFx0b3Blbk9uU2luZ2xlQ2xpY2s6IHRydWUsXG5cdFx0XHRcdGlkZW50aXR5UHJvdmlkZXI6IHtcblx0XHRcdFx0XHRnZXRJZChlKSB7XG5cdFx0XHRcdFx0XHRpZiAoZSBpbnN0YW5jZW9mIFVzZXJEYXRhUHJvZmlsZUVsZW1lbnQpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIGUucHJvZmlsZS5pZDtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdHJldHVybiBlLm5hbWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRhbHdheXNDb25zdW1lTW91c2VXaGVlbDogZmFsc2UsXG5cdFx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlck5ld1Byb2ZpbGVCdXR0b24ocGFyZW50OiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdGNvbnN0IGJ1dHRvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBCdXR0b25XaXRoRHJvcGRvd24ocGFyZW50LCB7XG5cdFx0XHRhY3Rpb25zOiB7XG5cdFx0XHRcdGdldEFjdGlvbnM6ICgpID0+IHtcblx0XHRcdFx0XHRjb25zdCBhY3Rpb25zOiBJQWN0aW9uW10gPSBbXTtcblx0XHRcdFx0XHRpZiAodGhpcy50ZW1wbGF0ZXMubGVuZ3RoKSB7XG5cdFx0XHRcdFx0XHRhY3Rpb25zLnB1c2gobmV3IFN1Ym1lbnVBY3Rpb24oJ2Zyb20udGVtcGxhdGUnLCBsb2NhbGl6ZSgnZnJvbSB0ZW1wbGF0ZScsIFwiRnJvbSBUZW1wbGF0ZVwiKSwgdGhpcy5nZXRDcmVhdGVGcm9tVGVtcGxhdGVBY3Rpb25zKCkpKTtcblx0XHRcdFx0XHRcdGFjdGlvbnMucHVzaChuZXcgU2VwYXJhdG9yKCkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRhY3Rpb25zLnB1c2godG9BY3Rpb24oe1xuXHRcdFx0XHRcdFx0aWQ6ICdpbXBvcnRQcm9maWxlJyxcblx0XHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnaW1wb3J0UHJvZmlsZScsIFwiSW1wb3J0IFByb2ZpbGUuLi5cIiksXG5cdFx0XHRcdFx0XHRydW46ICgpID0+IHRoaXMuaW1wb3J0UHJvZmlsZSgpXG5cdFx0XHRcdFx0fSkpO1xuXHRcdFx0XHRcdHJldHVybiBhY3Rpb25zO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0YWRkUHJpbWFyeUFjdGlvblRvRHJvcGRvd246IGZhbHNlLFxuXHRcdFx0Y29udGV4dE1lbnVQcm92aWRlcjogdGhpcy5jb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0XHRzdXBwb3J0SWNvbnM6IHRydWUsXG5cdFx0XHQuLi5kZWZhdWx0QnV0dG9uU3R5bGVzXG5cdFx0fSkpO1xuXHRcdGJ1dHRvbi5sYWJlbCA9IGxvY2FsaXplKCduZXdQcm9maWxlJywgXCJOZXcgUHJvZmlsZVwiKTtcblx0XHR0aGlzLl9yZWdpc3RlcihidXR0b24ub25EaWRDbGljayhlID0+IHRoaXMuY3JlYXRlTmV3UHJvZmlsZSgpKSk7XG5cdH1cblxuXHRwcml2YXRlIGdldENyZWF0ZUZyb21UZW1wbGF0ZUFjdGlvbnMoKTogSUFjdGlvbltdIHtcblx0XHRyZXR1cm4gdGhpcy50ZW1wbGF0ZXMubWFwKHRlbXBsYXRlID0+XG5cdFx0XHR0b0FjdGlvbih7XG5cdFx0XHRcdGlkOiBgdGVtcGxhdGU6JHt0ZW1wbGF0ZS51cmx9YCxcblx0XHRcdFx0bGFiZWw6IHRlbXBsYXRlLm5hbWUsXG5cdFx0XHRcdHJ1bjogKCkgPT4gdGhpcy5jcmVhdGVOZXdQcm9maWxlKFVSSS5wYXJzZSh0ZW1wbGF0ZS51cmwpKVxuXHRcdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3Rlckxpc3RlbmVycygpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5wcm9maWxlc0xpc3QpIHtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMucHJvZmlsZXNMaXN0Lm9uRGlkQ2hhbmdlU2VsZWN0aW9uKGUgPT4ge1xuXHRcdFx0XHRjb25zdCBbZWxlbWVudF0gPSBlLmVsZW1lbnRzO1xuXHRcdFx0XHRpZiAoZWxlbWVudCBpbnN0YW5jZW9mIEFic3RyYWN0VXNlckRhdGFQcm9maWxlRWxlbWVudCkge1xuXHRcdFx0XHRcdHRoaXMucHJvZmlsZVdpZGdldD8ucmVuZGVyKGVsZW1lbnQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnByb2ZpbGVzTGlzdC5vbkNvbnRleHRNZW51KGUgPT4ge1xuXHRcdFx0XHRjb25zdCBhY3Rpb25zOiBJQWN0aW9uW10gPSBbXTtcblx0XHRcdFx0aWYgKCFlLmVsZW1lbnQpIHtcblx0XHRcdFx0XHRhY3Rpb25zLnB1c2goLi4udGhpcy5nZXRUcmVlQ29udGV4dE1lbnVBY3Rpb25zKCkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChlLmVsZW1lbnQgaW5zdGFuY2VvZiBBYnN0cmFjdFVzZXJEYXRhUHJvZmlsZUVsZW1lbnQpIHtcblx0XHRcdFx0XHRhY3Rpb25zLnB1c2goLi4uZS5lbGVtZW50LmFjdGlvbnNbMV0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChhY3Rpb25zLmxlbmd0aCkge1xuXHRcdFx0XHRcdHRoaXMuY29udGV4dE1lbnVTZXJ2aWNlLnNob3dDb250ZXh0TWVudSh7XG5cdFx0XHRcdFx0XHRnZXRBbmNob3I6ICgpID0+IGUuYW5jaG9yLFxuXHRcdFx0XHRcdFx0Z2V0QWN0aW9uczogKCkgPT4gYWN0aW9ucyxcblx0XHRcdFx0XHRcdGdldEFjdGlvbnNDb250ZXh0OiAoKSA9PiBlLmVsZW1lbnRcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5wcm9maWxlc0xpc3Qub25Nb3VzZURibENsaWNrKGUgPT4ge1xuXHRcdFx0XHRpZiAoIWUuZWxlbWVudCkge1xuXHRcdFx0XHRcdHRoaXMuY3JlYXRlTmV3UHJvZmlsZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXRUcmVlQ29udGV4dE1lbnVBY3Rpb25zKCk6IElBY3Rpb25bXSB7XG5cdFx0Y29uc3QgYWN0aW9uczogSUFjdGlvbltdID0gW107XG5cdFx0YWN0aW9ucy5wdXNoKHRvQWN0aW9uKHtcblx0XHRcdGlkOiAnbmV3UHJvZmlsZScsXG5cdFx0XHRsYWJlbDogbG9jYWxpemUoJ25ld1Byb2ZpbGUnLCBcIk5ldyBQcm9maWxlXCIpLFxuXHRcdFx0cnVuOiAoKSA9PiB0aGlzLmNyZWF0ZU5ld1Byb2ZpbGUoKVxuXHRcdH0pKTtcblx0XHRjb25zdCB0ZW1wbGF0ZUFjdGlvbnMgPSB0aGlzLmdldENyZWF0ZUZyb21UZW1wbGF0ZUFjdGlvbnMoKTtcblx0XHRpZiAodGVtcGxhdGVBY3Rpb25zLmxlbmd0aCkge1xuXHRcdFx0YWN0aW9ucy5wdXNoKG5ldyBTdWJtZW51QWN0aW9uKCdmcm9tLnRlbXBsYXRlJywgbG9jYWxpemUoJ25ldyBmcm9tIHRlbXBsYXRlJywgXCJOZXcgUHJvZmlsZSBGcm9tIFRlbXBsYXRlXCIpLCB0ZW1wbGF0ZUFjdGlvbnMpKTtcblx0XHR9XG5cdFx0YWN0aW9ucy5wdXNoKG5ldyBTZXBhcmF0b3IoKSk7XG5cdFx0YWN0aW9ucy5wdXNoKHRvQWN0aW9uKHtcblx0XHRcdGlkOiAnaW1wb3J0UHJvZmlsZScsXG5cdFx0XHRsYWJlbDogbG9jYWxpemUoJ2ltcG9ydFByb2ZpbGUnLCBcIkltcG9ydCBQcm9maWxlLi4uXCIpLFxuXHRcdFx0cnVuOiAoKSA9PiB0aGlzLmltcG9ydFByb2ZpbGUoKVxuXHRcdH0pKTtcblx0XHRyZXR1cm4gYWN0aW9ucztcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgaW1wb3J0UHJvZmlsZSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBxdWlja1BpY2sgPSBkaXNwb3NhYmxlcy5hZGQodGhpcy5xdWlja0lucHV0U2VydmljZS5jcmVhdGVRdWlja1BpY2soKSk7XG5cblx0XHRjb25zdCB1cGRhdGVRdWlja1BpY2tJdGVtcyA9ICh2YWx1ZT86IHN0cmluZykgPT4ge1xuXHRcdFx0Y29uc3QgcXVpY2tQaWNrSXRlbXM6IElRdWlja1BpY2tJdGVtW10gPSBbXTtcblx0XHRcdGlmICh2YWx1ZSkge1xuXHRcdFx0XHRxdWlja1BpY2tJdGVtcy5wdXNoKHsgbGFiZWw6IHF1aWNrUGljay52YWx1ZSwgZGVzY3JpcHRpb246IGxvY2FsaXplKCdpbXBvcnQgZnJvbSB1cmwnLCBcIkltcG9ydCBmcm9tIFVSTFwiKSB9KTtcblx0XHRcdH1cblx0XHRcdHF1aWNrUGlja0l0ZW1zLnB1c2goeyBsYWJlbDogbG9jYWxpemUoJ2ltcG9ydCBmcm9tIGZpbGUnLCBcIlNlbGVjdCBGaWxlLi4uXCIpIH0pO1xuXHRcdFx0cXVpY2tQaWNrLml0ZW1zID0gcXVpY2tQaWNrSXRlbXM7XG5cdFx0fTtcblxuXHRcdHF1aWNrUGljay50aXRsZSA9IGxvY2FsaXplKCdpbXBvcnQgcHJvZmlsZSBxdWljayBwaWNrIHRpdGxlJywgXCJJbXBvcnQgZnJvbSBQcm9maWxlIFRlbXBsYXRlLi4uXCIpO1xuXHRcdHF1aWNrUGljay5wbGFjZWhvbGRlciA9IGxvY2FsaXplKCdpbXBvcnQgcHJvZmlsZSBwbGFjZWhvbGRlcicsIFwiUHJvdmlkZSBQcm9maWxlIFRlbXBsYXRlIFVSTFwiKTtcblx0XHRxdWlja1BpY2suaWdub3JlRm9jdXNPdXQgPSB0cnVlO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChxdWlja1BpY2sub25EaWRDaGFuZ2VWYWx1ZSh1cGRhdGVRdWlja1BpY2tJdGVtcykpO1xuXHRcdHVwZGF0ZVF1aWNrUGlja0l0ZW1zKCk7XG5cdFx0cXVpY2tQaWNrLm1hdGNoT25MYWJlbCA9IGZhbHNlO1xuXHRcdHF1aWNrUGljay5tYXRjaE9uRGVzY3JpcHRpb24gPSBmYWxzZTtcblx0XHRkaXNwb3NhYmxlcy5hZGQocXVpY2tQaWNrLm9uRGlkQWNjZXB0KGFzeW5jICgpID0+IHtcblx0XHRcdHF1aWNrUGljay5oaWRlKCk7XG5cdFx0XHRjb25zdCBzZWxlY3RlZEl0ZW0gPSBxdWlja1BpY2suc2VsZWN0ZWRJdGVtc1swXTtcblx0XHRcdGlmICghc2VsZWN0ZWRJdGVtKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHVybCA9IHNlbGVjdGVkSXRlbS5sYWJlbCA9PT0gcXVpY2tQaWNrLnZhbHVlID8gVVJJLnBhcnNlKHF1aWNrUGljay52YWx1ZSkgOiBhd2FpdCB0aGlzLmdldFByb2ZpbGVVcmlGcm9tRmlsZVN5c3RlbSgpO1xuXHRcdFx0aWYgKHVybCkge1xuXHRcdFx0XHR0aGlzLmNyZWF0ZU5ld1Byb2ZpbGUodXJsKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHF1aWNrUGljay5vbkRpZEhpZGUoKCkgPT4gZGlzcG9zYWJsZXMuZGlzcG9zZSgpKSk7XG5cdFx0cXVpY2tQaWNrLnNob3coKTtcblx0fVxuXG5cdGFzeW5jIGNyZWF0ZU5ld1Byb2ZpbGUoY29weUZyb20/OiBVUkkgfCBJVXNlckRhdGFQcm9maWxlKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5tb2RlbD8uY3JlYXRlTmV3UHJvZmlsZShjb3B5RnJvbSk7XG5cdH1cblxuXHRzZWxlY3RQcm9maWxlKHByb2ZpbGU6IElVc2VyRGF0YVByb2ZpbGUpOiB2b2lkIHtcblx0XHRjb25zdCBpbmRleCA9IHRoaXMubW9kZWw/LnByb2ZpbGVzLmZpbmRJbmRleChwID0+IHAgaW5zdGFuY2VvZiBVc2VyRGF0YVByb2ZpbGVFbGVtZW50ICYmIHAucHJvZmlsZS5pZCA9PT0gcHJvZmlsZS5pZCk7XG5cdFx0aWYgKGluZGV4ICE9PSB1bmRlZmluZWQgJiYgaW5kZXggPj0gMCkge1xuXHRcdFx0dGhpcy5wcm9maWxlc0xpc3Q/LnNldFNlbGVjdGlvbihbaW5kZXhdKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGdldFByb2ZpbGVVcmlGcm9tRmlsZVN5c3RlbSgpOiBQcm9taXNlPFVSSSB8IG51bGw+IHtcblx0XHRjb25zdCBwcm9maWxlTG9jYXRpb24gPSBhd2FpdCB0aGlzLmZpbGVEaWFsb2dTZXJ2aWNlLnNob3dPcGVuRGlhbG9nKHtcblx0XHRcdGNhblNlbGVjdEZvbGRlcnM6IGZhbHNlLFxuXHRcdFx0Y2FuU2VsZWN0RmlsZXM6IHRydWUsXG5cdFx0XHRjYW5TZWxlY3RNYW55OiBmYWxzZSxcblx0XHRcdGZpbHRlcnM6IFBST0ZJTEVfRklMVEVSLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdpbXBvcnQgcHJvZmlsZSBkaWFsb2cnLCBcIlNlbGVjdCBQcm9maWxlIFRlbXBsYXRlIEZpbGVcIiksXG5cdFx0fSk7XG5cdFx0aWYgKCFwcm9maWxlTG9jYXRpb24pIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblx0XHRyZXR1cm4gcHJvZmlsZUxvY2F0aW9uWzBdO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgc2V0SW5wdXQoaW5wdXQ6IFVzZXJEYXRhUHJvZmlsZXNFZGl0b3JJbnB1dCwgb3B0aW9uczogSUVkaXRvck9wdGlvbnMgfCB1bmRlZmluZWQsIGNvbnRleHQ6IElFZGl0b3JPcGVuQ29udGV4dCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgc3VwZXIuc2V0SW5wdXQoaW5wdXQsIG9wdGlvbnMsIGNvbnRleHQsIHRva2VuKTtcblx0XHR0aGlzLm1vZGVsID0gYXdhaXQgaW5wdXQucmVzb2x2ZSgpO1xuXHRcdHRoaXMubW9kZWwuZ2V0VGVtcGxhdGVzKCkudGhlbih0ZW1wbGF0ZXMgPT4ge1xuXHRcdFx0dGhpcy50ZW1wbGF0ZXMgPSB0ZW1wbGF0ZXM7XG5cdFx0XHRpZiAodGhpcy5wcm9maWxlV2lkZ2V0KSB7XG5cdFx0XHRcdHRoaXMucHJvZmlsZVdpZGdldC50ZW1wbGF0ZXMgPSB0ZW1wbGF0ZXM7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0dGhpcy51cGRhdGVQcm9maWxlc0xpc3QoKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm1vZGVsLm9uRGlkQ2hhbmdlKGVsZW1lbnQgPT5cblx0XHRcdHRoaXMudXBkYXRlUHJvZmlsZXNMaXN0KGVsZW1lbnQpKSk7XG5cdH1cblxuXHRvdmVycmlkZSBmb2N1cygpOiB2b2lkIHtcblx0XHRzdXBlci5mb2N1cygpO1xuXHRcdHRoaXMucHJvZmlsZXNMaXN0Py5kb21Gb2N1cygpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVQcm9maWxlc0xpc3QoZWxlbWVudFRvU2VsZWN0PzogQWJzdHJhY3RVc2VyRGF0YVByb2ZpbGVFbGVtZW50KTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLm1vZGVsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGN1cnJlbnRTZWxlY3Rpb25JbmRleCA9IHRoaXMucHJvZmlsZXNMaXN0Py5nZXRTZWxlY3Rpb24oKT8uWzBdO1xuXHRcdGNvbnN0IGN1cnJlbnRTZWxlY3Rpb24gPSBjdXJyZW50U2VsZWN0aW9uSW5kZXggIT09IHVuZGVmaW5lZCA/IHRoaXMucHJvZmlsZXNMaXN0Py5lbGVtZW50KGN1cnJlbnRTZWxlY3Rpb25JbmRleCkgOiB1bmRlZmluZWQ7XG5cdFx0dGhpcy5wcm9maWxlc0xpc3Q/LnNwbGljZSgwLCB0aGlzLnByb2ZpbGVzTGlzdC5sZW5ndGgsIHRoaXMubW9kZWwucHJvZmlsZXMpO1xuXG5cdFx0aWYgKGVsZW1lbnRUb1NlbGVjdCkge1xuXHRcdFx0dGhpcy5wcm9maWxlc0xpc3Q/LnNldFNlbGVjdGlvbihbdGhpcy5tb2RlbC5wcm9maWxlcy5pbmRleE9mKGVsZW1lbnRUb1NlbGVjdCldKTtcblx0XHR9IGVsc2UgaWYgKGN1cnJlbnRTZWxlY3Rpb24pIHtcblx0XHRcdGlmICghdGhpcy5tb2RlbC5wcm9maWxlcy5pbmNsdWRlcyhjdXJyZW50U2VsZWN0aW9uKSkge1xuXHRcdFx0XHRjb25zdCBlbGVtZW50VG9TZWxlY3QgPSB0aGlzLm1vZGVsLnByb2ZpbGVzLmZpbmQocHJvZmlsZSA9PiBwcm9maWxlLm5hbWUgPT09IGN1cnJlbnRTZWxlY3Rpb24ubmFtZSkgPz8gdGhpcy5tb2RlbC5wcm9maWxlc1swXTtcblx0XHRcdFx0aWYgKGVsZW1lbnRUb1NlbGVjdCkge1xuXHRcdFx0XHRcdHRoaXMucHJvZmlsZXNMaXN0Py5zZXRTZWxlY3Rpb24oW3RoaXMubW9kZWwucHJvZmlsZXMuaW5kZXhPZihlbGVtZW50VG9TZWxlY3QpXSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgZWxlbWVudFRvU2VsZWN0ID0gdGhpcy5tb2RlbC5wcm9maWxlcy5maW5kKHByb2ZpbGUgPT4gcHJvZmlsZS5hY3RpdmUpID8/IHRoaXMubW9kZWwucHJvZmlsZXNbMF07XG5cdFx0XHRpZiAoZWxlbWVudFRvU2VsZWN0KSB7XG5cdFx0XHRcdHRoaXMucHJvZmlsZXNMaXN0Py5zZXRTZWxlY3Rpb24oW3RoaXMubW9kZWwucHJvZmlsZXMuaW5kZXhPZihlbGVtZW50VG9TZWxlY3QpXSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cbn1cblxuaW50ZXJmYWNlIElQcm9maWxlRWxlbWVudFRlbXBsYXRlRGF0YSB7XG5cdHJlYWRvbmx5IGljb246IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSBsYWJlbDogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IGRpcnR5OiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgZGVzY3JpcHRpb246IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSBhY3Rpb25CYXI6IFdvcmtiZW5jaFRvb2xCYXI7XG5cdHJlYWRvbmx5IGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmU7XG5cdHJlYWRvbmx5IGVsZW1lbnREaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlO1xufVxuXG5jbGFzcyBQcm9maWxlRWxlbWVudERlbGVnYXRlIGltcGxlbWVudHMgSUxpc3RWaXJ0dWFsRGVsZWdhdGU8QWJzdHJhY3RVc2VyRGF0YVByb2ZpbGVFbGVtZW50PiB7XG5cdGdldEhlaWdodChlbGVtZW50OiBBYnN0cmFjdFVzZXJEYXRhUHJvZmlsZUVsZW1lbnQpIHtcblx0XHRyZXR1cm4gMjI7XG5cdH1cblx0Z2V0VGVtcGxhdGVJZCgpIHsgcmV0dXJuICdwcm9maWxlTGlzdEVsZW1lbnQnOyB9XG59XG5cbmNsYXNzIFByb2ZpbGVFbGVtZW50UmVuZGVyZXIgaW1wbGVtZW50cyBJTGlzdFJlbmRlcmVyPEFic3RyYWN0VXNlckRhdGFQcm9maWxlRWxlbWVudCwgSVByb2ZpbGVFbGVtZW50VGVtcGxhdGVEYXRhPiB7XG5cblx0cmVhZG9ubHkgdGVtcGxhdGVJZCA9ICdwcm9maWxlTGlzdEVsZW1lbnQnO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHQpIHsgfVxuXG5cdHJlbmRlclRlbXBsYXRlKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBJUHJvZmlsZUVsZW1lbnRUZW1wbGF0ZURhdGEge1xuXG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgZWxlbWVudERpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0Y29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ3Byb2ZpbGUtbGlzdC1pdGVtJyk7XG5cdFx0Y29uc3QgaWNvbiA9IGFwcGVuZChjb250YWluZXIsICQoJy5wcm9maWxlLWxpc3QtaXRlbS1pY29uJykpO1xuXHRcdGNvbnN0IGxhYmVsID0gYXBwZW5kKGNvbnRhaW5lciwgJCgnLnByb2ZpbGUtbGlzdC1pdGVtLWxhYmVsJykpO1xuXHRcdGNvbnN0IGRpcnR5ID0gYXBwZW5kKGNvbnRhaW5lciwgJChgc3BhbiR7VGhlbWVJY29uLmFzQ1NTU2VsZWN0b3IoQ29kaWNvbi5jaXJjbGVGaWxsZWQpfWApKTtcblx0XHRjb25zdCBkZXNjcmlwdGlvbiA9IGFwcGVuZChjb250YWluZXIsICQoJy5wcm9maWxlLWxpc3QtaXRlbS1kZXNjcmlwdGlvbicpKTtcblx0XHRhcHBlbmQoZGVzY3JpcHRpb24sICQoYHNwYW4ke1RoZW1lSWNvbi5hc0NTU1NlbGVjdG9yKENvZGljb24uY2hlY2spfWApLCAkKCdzcGFuJywgdW5kZWZpbmVkLCBsb2NhbGl6ZSgnYWN0aXZlUHJvZmlsZScsIFwiQWN0aXZlXCIpKSk7XG5cblx0XHRjb25zdCBhY3Rpb25zQ29udGFpbmVyID0gYXBwZW5kKGNvbnRhaW5lciwgJCgnLnByb2ZpbGUtdHJlZS1pdGVtLWFjdGlvbnMtY29udGFpbmVyJykpO1xuXHRcdGNvbnN0IGFjdGlvbkJhciA9IGRpc3Bvc2FibGVzLmFkZCh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFdvcmtiZW5jaFRvb2xCYXIsXG5cdFx0XHRhY3Rpb25zQ29udGFpbmVyLFxuXHRcdFx0e1xuXHRcdFx0XHRob3ZlckRlbGVnYXRlOiBkaXNwb3NhYmxlcy5hZGQoY3JlYXRlSW5zdGFudEhvdmVyRGVsZWdhdGUoKSksXG5cdFx0XHRcdGhpZ2hsaWdodFRvZ2dsZWRJdGVtczogdHJ1ZVxuXHRcdFx0fVxuXHRcdCkpO1xuXG5cdFx0cmV0dXJuIHsgbGFiZWwsIGljb24sIGRpcnR5LCBkZXNjcmlwdGlvbiwgYWN0aW9uQmFyLCBkaXNwb3NhYmxlcywgZWxlbWVudERpc3Bvc2FibGVzIH07XG5cdH1cblxuXHRyZW5kZXJFbGVtZW50KGVsZW1lbnQ6IEFic3RyYWN0VXNlckRhdGFQcm9maWxlRWxlbWVudCwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBJUHJvZmlsZUVsZW1lbnRUZW1wbGF0ZURhdGEpIHtcblx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudERpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0dGVtcGxhdGVEYXRhLmxhYmVsLnRleHRDb250ZW50ID0gZWxlbWVudC5uYW1lO1xuXHRcdHRlbXBsYXRlRGF0YS5sYWJlbC5jbGFzc0xpc3QudG9nZ2xlKCduZXctcHJvZmlsZScsIGVsZW1lbnQgaW5zdGFuY2VvZiBOZXdQcm9maWxlRWxlbWVudCk7XG5cdFx0dGVtcGxhdGVEYXRhLmljb24uY2xhc3NOYW1lID0gVGhlbWVJY29uLmFzQ2xhc3NOYW1lKGVsZW1lbnQuaWNvbiA/IFRoZW1lSWNvbi5mcm9tSWQoZWxlbWVudC5pY29uKSA6IERFRkFVTFRfSUNPTik7XG5cdFx0dGVtcGxhdGVEYXRhLmRpcnR5LmNsYXNzTGlzdC50b2dnbGUoJ2hpZGUnLCAhKGVsZW1lbnQgaW5zdGFuY2VvZiBOZXdQcm9maWxlRWxlbWVudCkpO1xuXHRcdHRlbXBsYXRlRGF0YS5kZXNjcmlwdGlvbi5jbGFzc0xpc3QudG9nZ2xlKCdoaWRlJywgIWVsZW1lbnQuYWN0aXZlKTtcblx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudERpc3Bvc2FibGVzLmFkZChlbGVtZW50Lm9uRGlkQ2hhbmdlKGUgPT4ge1xuXHRcdFx0aWYgKGUubmFtZSkge1xuXHRcdFx0XHR0ZW1wbGF0ZURhdGEubGFiZWwudGV4dENvbnRlbnQgPSBlbGVtZW50Lm5hbWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAoZS5pY29uKSB7XG5cdFx0XHRcdGlmIChlbGVtZW50Lmljb24pIHtcblx0XHRcdFx0XHR0ZW1wbGF0ZURhdGEuaWNvbi5jbGFzc05hbWUgPSBUaGVtZUljb24uYXNDbGFzc05hbWUoVGhlbWVJY29uLmZyb21JZChlbGVtZW50Lmljb24pKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0ZW1wbGF0ZURhdGEuaWNvbi5jbGFzc05hbWUgPSAnaGlkZSc7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGlmIChlLmFjdGl2ZSkge1xuXHRcdFx0XHR0ZW1wbGF0ZURhdGEuZGVzY3JpcHRpb24uY2xhc3NMaXN0LnRvZ2dsZSgnaGlkZScsICFlbGVtZW50LmFjdGl2ZSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdGNvbnN0IHNldEFjdGlvbnMgPSAoKSA9PiB0ZW1wbGF0ZURhdGEuYWN0aW9uQmFyLnNldEFjdGlvbnMoZWxlbWVudC5hY3Rpb25zWzBdLmZpbHRlcihhID0+IGEuZW5hYmxlZCksIGVsZW1lbnQuYWN0aW9uc1sxXS5maWx0ZXIoYSA9PiBhLmVuYWJsZWQpKTtcblx0XHRzZXRBY3Rpb25zKCk7XG5cdFx0Y29uc3QgZXZlbnRzOiBFdmVudDxJQWN0aW9uQ2hhbmdlRXZlbnQ+W10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGFjdGlvbiBvZiBlbGVtZW50LmFjdGlvbnMuZmxhdCgpKSB7XG5cdFx0XHRpZiAoYWN0aW9uIGluc3RhbmNlb2YgQWN0aW9uKSB7XG5cdFx0XHRcdGV2ZW50cy5wdXNoKGFjdGlvbi5vbkRpZENoYW5nZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRlbXBsYXRlRGF0YS5lbGVtZW50RGlzcG9zYWJsZXMuYWRkKEV2ZW50LmFueSguLi5ldmVudHMpKGUgPT4ge1xuXHRcdFx0aWYgKGUuZW5hYmxlZCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHNldEFjdGlvbnMoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0fVxuXG5cdGRpc3Bvc2VFbGVtZW50KGVsZW1lbnQ6IEFic3RyYWN0VXNlckRhdGFQcm9maWxlRWxlbWVudCwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBJUHJvZmlsZUVsZW1lbnRUZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudERpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdH1cblxuXHRkaXNwb3NlVGVtcGxhdGUodGVtcGxhdGVEYXRhOiBJUHJvZmlsZUVsZW1lbnRUZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEuZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdHRlbXBsYXRlRGF0YS5lbGVtZW50RGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9XG59XG5cbmNsYXNzIFByb2ZpbGVXaWRnZXQgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IHByb2ZpbGVUaXRsZTogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgYnVpbHRJbkxhYmVsOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBwcm9maWxlVHJlZUNvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgYnV0dG9uQ29udGFpbmVyOiBIVE1MRWxlbWVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IHByb2ZpbGVUcmVlOiBXb3JrYmVuY2hBc3luY0RhdGFUcmVlPEFic3RyYWN0VXNlckRhdGFQcm9maWxlRWxlbWVudCwgUHJvZmlsZVRyZWVFbGVtZW50Pjtcblx0cHJpdmF0ZSByZWFkb25seSBjb3B5RnJvbVByb2ZpbGVSZW5kZXJlcjogQ29weUZyb21Qcm9maWxlUmVuZGVyZXI7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Byb2ZpbGVFbGVtZW50ID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPHsgZWxlbWVudDogQWJzdHJhY3RVc2VyRGF0YVByb2ZpbGVFbGVtZW50IH0gJiBJRGlzcG9zYWJsZT4oKSk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBsYXlvdXRQYXJ0aWNpcGFudHM6IHsgbGF5b3V0OiAoKSA9PiB2b2lkIH1bXSA9IFtdO1xuXG5cdHB1YmxpYyBzZXQgdGVtcGxhdGVzKHRlbXBsYXRlczogcmVhZG9ubHkgSVByb2ZpbGVUZW1wbGF0ZUluZm9bXSkge1xuXHRcdHRoaXMuY29weUZyb21Qcm9maWxlUmVuZGVyZXIuc2V0VGVtcGxhdGVzKHRlbXBsYXRlcyk7XG5cdFx0dGhpcy5wcm9maWxlVHJlZS5yZXJlbmRlcigpO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cGFyZW50OiBIVE1MRWxlbWVudCxcblx0XHRASUVkaXRvclByb2dyZXNzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVkaXRvclByb2dyZXNzU2VydmljZTogSUVkaXRvclByb2dyZXNzU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdGNvbnN0IGhlYWRlciA9IGFwcGVuZChwYXJlbnQsICQoJy5wcm9maWxlLWhlYWRlcicpKTtcblx0XHRjb25zdCB0aXRsZSA9IGFwcGVuZChoZWFkZXIsICQoJy5wcm9maWxlLXRpdGxlLWNvbnRhaW5lcicpKTtcblx0XHR0aGlzLnByb2ZpbGVUaXRsZSA9IGFwcGVuZCh0aXRsZSwgJCgnLnByb2ZpbGUtdGl0bGUnKSk7XG5cdFx0dGhpcy5idWlsdEluTGFiZWwgPSBhcHBlbmQodGl0bGUsICQoJy5wcm9maWxlLWJ1aWx0LWluLWxhYmVsJywgdW5kZWZpbmVkLCBsb2NhbGl6ZSgnYnVpbHRJbicsIFwiQnVpbHQtaW5cIikpKTtcblx0XHR0aGlzLmJ1aWx0SW5MYWJlbC5jbGFzc0xpc3QuYWRkKCdoaWRlJyk7XG5cblx0XHRjb25zdCBib2R5ID0gYXBwZW5kKHBhcmVudCwgJCgnLnByb2ZpbGUtYm9keScpKTtcblxuXHRcdGNvbnN0IGRlbGVnYXRlID0gbmV3IFByb2ZpbGVUcmVlRGVsZWdhdGUoKTtcblx0XHRjb25zdCBjb250ZW50c1JlbmRlcmVyID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDb250ZW50c1Byb2ZpbGVSZW5kZXJlcikpO1xuXHRcdGNvbnN0IGFzc29jaWF0aW9uc1JlbmRlcmVyID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShQcm9maWxlV29ya3NwYWNlc1JlbmRlcmVyKSk7XG5cdFx0dGhpcy5sYXlvdXRQYXJ0aWNpcGFudHMucHVzaChhc3NvY2lhdGlvbnNSZW5kZXJlcik7XG5cdFx0dGhpcy5jb3B5RnJvbVByb2ZpbGVSZW5kZXJlciA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ29weUZyb21Qcm9maWxlUmVuZGVyZXIpKTtcblx0XHR0aGlzLnByb2ZpbGVUcmVlQ29udGFpbmVyID0gYXBwZW5kKGJvZHksICQoJy5wcm9maWxlLXRyZWUnKSk7XG5cdFx0dGhpcy5wcm9maWxlVHJlZSA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoV29ya2JlbmNoQXN5bmNEYXRhVHJlZTxBYnN0cmFjdFVzZXJEYXRhUHJvZmlsZUVsZW1lbnQsIFByb2ZpbGVUcmVlRWxlbWVudD4sXG5cdFx0XHQnUHJvZmlsZUVkaXRvci1UcmVlJyxcblx0XHRcdHRoaXMucHJvZmlsZVRyZWVDb250YWluZXIsXG5cdFx0XHRkZWxlZ2F0ZSxcblx0XHRcdFtcblx0XHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShQcm9maWxlTmFtZVJlbmRlcmVyKSksXG5cdFx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUHJvZmlsZUljb25SZW5kZXJlcikpLFxuXHRcdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFVzZUZvckN1cnJlbnRXaW5kb3dQcm9wZXJ0eVJlbmRlcmVyKSksXG5cdFx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVXNlQXNEZWZhdWx0UHJvZmlsZVJlbmRlcmVyKSksXG5cdFx0XHRcdHRoaXMuY29weUZyb21Qcm9maWxlUmVuZGVyZXIsXG5cdFx0XHRcdGNvbnRlbnRzUmVuZGVyZXIsXG5cdFx0XHRcdGFzc29jaWF0aW9uc1JlbmRlcmVyLFxuXHRcdFx0XSxcblx0XHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUHJvZmlsZVRyZWVEYXRhU291cmNlKSxcblx0XHRcdHtcblx0XHRcdFx0bXVsdGlwbGVTZWxlY3Rpb25TdXBwb3J0OiBmYWxzZSxcblx0XHRcdFx0aG9yaXpvbnRhbFNjcm9sbGluZzogZmFsc2UsXG5cdFx0XHRcdGFjY2Vzc2liaWxpdHlQcm92aWRlcjoge1xuXHRcdFx0XHRcdGdldEFyaWFMYWJlbChlbGVtZW50OiBQcm9maWxlVHJlZUVsZW1lbnQgfCBudWxsKTogc3RyaW5nIHtcblx0XHRcdFx0XHRcdHJldHVybiBlbGVtZW50Py5lbGVtZW50ID8/ICcnO1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0Z2V0V2lkZ2V0QXJpYUxhYmVsKCk6IHN0cmluZyB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gJyc7XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSxcblx0XHRcdFx0aWRlbnRpdHlQcm92aWRlcjoge1xuXHRcdFx0XHRcdGdldElkKGVsZW1lbnQpIHtcblx0XHRcdFx0XHRcdHJldHVybiBlbGVtZW50LmVsZW1lbnQ7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRleHBhbmRPbmx5T25Ud2lzdGllQ2xpY2s6IHRydWUsXG5cdFx0XHRcdHJlbmRlckluZGVudEd1aWRlczogUmVuZGVySW5kZW50R3VpZGVzLk5vbmUsXG5cdFx0XHRcdGVuYWJsZVN0aWNreVNjcm9sbDogZmFsc2UsXG5cdFx0XHRcdG9wZW5PblNpbmdsZUNsaWNrOiBmYWxzZSxcblx0XHRcdFx0c2V0Um93TGluZUhlaWdodDogZmFsc2UsXG5cdFx0XHRcdHN1cHBvcnREeW5hbWljSGVpZ2h0czogdHJ1ZSxcblx0XHRcdFx0YWx3YXlzQ29uc3VtZU1vdXNlV2hlZWw6IGZhbHNlLFxuXHRcdFx0fSkpO1xuXG5cdFx0dGhpcy5wcm9maWxlVHJlZS5zdHlsZShsaXN0U3R5bGVzKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGNvbnRlbnRzUmVuZGVyZXIub25EaWRDaGFuZ2VDb250ZW50SGVpZ2h0KChlKSA9PiB0aGlzLnByb2ZpbGVUcmVlLnVwZGF0ZUVsZW1lbnRIZWlnaHQoZSwgdW5kZWZpbmVkKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGFzc29jaWF0aW9uc1JlbmRlcmVyLm9uRGlkQ2hhbmdlQ29udGVudEhlaWdodCgoZSkgPT4gdGhpcy5wcm9maWxlVHJlZS51cGRhdGVFbGVtZW50SGVpZ2h0KGUsIHVuZGVmaW5lZCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihjb250ZW50c1JlbmRlcmVyLm9uRGlkQ2hhbmdlU2VsZWN0aW9uKChlKSA9PiB7XG5cdFx0XHRpZiAoZS5zZWxlY3RlZCkge1xuXHRcdFx0XHR0aGlzLnByb2ZpbGVUcmVlLnNldEZvY3VzKFtdKTtcblx0XHRcdFx0dGhpcy5wcm9maWxlVHJlZS5zZXRTZWxlY3Rpb24oW10pO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMucHJvZmlsZVRyZWUub25EaWRDaGFuZ2VDb250ZW50SGVpZ2h0KChlKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5kaW1lbnNpb24pIHtcblx0XHRcdFx0dGhpcy5sYXlvdXQodGhpcy5kaW1lbnNpb24pO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMucHJvZmlsZVRyZWUub25EaWRDaGFuZ2VTZWxlY3Rpb24oKGUpID0+IHtcblx0XHRcdGlmIChlLmVsZW1lbnRzLmxlbmd0aCkge1xuXHRcdFx0XHRjb250ZW50c1JlbmRlcmVyLmNsZWFyU2VsZWN0aW9uKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5idXR0b25Db250YWluZXIgPSBhcHBlbmQoYm9keSwgJCgnLnByb2ZpbGUtcm93LWNvbnRhaW5lci5wcm9maWxlLWJ1dHRvbi1jb250YWluZXInKSk7XG5cdH1cblxuXHRwcml2YXRlIGRpbWVuc2lvbjogRGltZW5zaW9uIHwgdW5kZWZpbmVkO1xuXHRsYXlvdXQoZGltZW5zaW9uOiBEaW1lbnNpb24pOiB2b2lkIHtcblx0XHR0aGlzLmRpbWVuc2lvbiA9IGRpbWVuc2lvbjtcblx0XHRjb25zdCB0cmVlQ29udGVudEhlaWdodCA9IHRoaXMucHJvZmlsZVRyZWUuY29udGVudEhlaWdodDtcblx0XHRjb25zdCBoZWlnaHQgPSBNYXRoLm1pbih0cmVlQ29udGVudEhlaWdodCwgZGltZW5zaW9uLmhlaWdodCAtICh0aGlzLl9wcm9maWxlRWxlbWVudC52YWx1ZT8uZWxlbWVudCBpbnN0YW5jZW9mIE5ld1Byb2ZpbGVFbGVtZW50ID8gMTE2IDogNTQpKTtcblx0XHR0aGlzLnByb2ZpbGVUcmVlQ29udGFpbmVyLnN0eWxlLmhlaWdodCA9IGAke2hlaWdodH1weGA7XG5cdFx0dGhpcy5wcm9maWxlVHJlZS5sYXlvdXQoaGVpZ2h0LCBkaW1lbnNpb24ud2lkdGgpO1xuXHRcdGZvciAoY29uc3QgcGFydGljaXBhbnQgb2YgdGhpcy5sYXlvdXRQYXJ0aWNpcGFudHMpIHtcblx0XHRcdHBhcnRpY2lwYW50LmxheW91dCgpO1xuXHRcdH1cblx0fVxuXG5cdHJlbmRlcihwcm9maWxlRWxlbWVudDogQWJzdHJhY3RVc2VyRGF0YVByb2ZpbGVFbGVtZW50KTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3Byb2ZpbGVFbGVtZW50LnZhbHVlPy5lbGVtZW50ID09PSBwcm9maWxlRWxlbWVudCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9wcm9maWxlRWxlbWVudC52YWx1ZT8uZWxlbWVudCBpbnN0YW5jZW9mIFVzZXJEYXRhUHJvZmlsZUVsZW1lbnQpIHtcblx0XHRcdHRoaXMuX3Byb2ZpbGVFbGVtZW50LnZhbHVlLmVsZW1lbnQucmVzZXQoKTtcblx0XHR9XG5cdFx0dGhpcy5wcm9maWxlVHJlZS5zZXRJbnB1dChwcm9maWxlRWxlbWVudCk7XG5cblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHR0aGlzLl9wcm9maWxlRWxlbWVudC52YWx1ZSA9IHsgZWxlbWVudDogcHJvZmlsZUVsZW1lbnQsIGRpc3Bvc2U6ICgpID0+IGRpc3Bvc2FibGVzLmRpc3Bvc2UoKSB9O1xuXG5cdFx0dGhpcy5wcm9maWxlVGl0bGUudGV4dENvbnRlbnQgPSBwcm9maWxlRWxlbWVudC5uYW1lO1xuXHRcdHRoaXMuYnVpbHRJbkxhYmVsLmNsYXNzTGlzdC50b2dnbGUoJ2hpZGUnLCAhKHByb2ZpbGVFbGVtZW50IGluc3RhbmNlb2YgVXNlckRhdGFQcm9maWxlRWxlbWVudCAmJiBwcm9maWxlRWxlbWVudC5wcm9maWxlLmlzRGVmYXVsdCkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChwcm9maWxlRWxlbWVudC5vbkRpZENoYW5nZShlID0+IHtcblx0XHRcdGlmIChlLm5hbWUpIHtcblx0XHRcdFx0dGhpcy5wcm9maWxlVGl0bGUudGV4dENvbnRlbnQgPSBwcm9maWxlRWxlbWVudC5uYW1lO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IFtwcmltYXJ5VGl0bGVCdXR0b25zLCBzZWNvbmRhdHlUaXRsZUJ1dHRvbnNdID0gcHJvZmlsZUVsZW1lbnQudGl0bGVCdXR0b25zO1xuXHRcdGlmIChwcmltYXJ5VGl0bGVCdXR0b25zPy5sZW5ndGggfHwgc2Vjb25kYXR5VGl0bGVCdXR0b25zPy5sZW5ndGgpIHtcblx0XHRcdHRoaXMuYnV0dG9uQ29udGFpbmVyLmNsYXNzTGlzdC5yZW1vdmUoJ2hpZGUnKTtcblxuXHRcdFx0aWYgKHNlY29uZGF0eVRpdGxlQnV0dG9ucz8ubGVuZ3RoKSB7XG5cdFx0XHRcdGZvciAoY29uc3QgYWN0aW9uIG9mIHNlY29uZGF0eVRpdGxlQnV0dG9ucykge1xuXHRcdFx0XHRcdGNvbnN0IGJ1dHRvbiA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQnV0dG9uKHRoaXMuYnV0dG9uQ29udGFpbmVyLCB7XG5cdFx0XHRcdFx0XHQuLi5kZWZhdWx0QnV0dG9uU3R5bGVzLFxuXHRcdFx0XHRcdFx0c2Vjb25kYXJ5OiB0cnVlXG5cdFx0XHRcdFx0fSkpO1xuXHRcdFx0XHRcdGJ1dHRvbi5sYWJlbCA9IGFjdGlvbi5sYWJlbDtcblx0XHRcdFx0XHRidXR0b24uZW5hYmxlZCA9IGFjdGlvbi5lbmFibGVkO1xuXHRcdFx0XHRcdGRpc3Bvc2FibGVzLmFkZChidXR0b24ub25EaWRDbGljaygoKSA9PiB0aGlzLmVkaXRvclByb2dyZXNzU2VydmljZS5zaG93V2hpbGUoYWN0aW9uLnJ1bigpKSkpO1xuXHRcdFx0XHRcdGRpc3Bvc2FibGVzLmFkZChhY3Rpb24ub25EaWRDaGFuZ2UoKGUpID0+IHtcblx0XHRcdFx0XHRcdGlmICghaXNVbmRlZmluZWQoZS5lbmFibGVkKSkge1xuXHRcdFx0XHRcdFx0XHRidXR0b24uZW5hYmxlZCA9IGFjdGlvbi5lbmFibGVkO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0aWYgKCFpc1VuZGVmaW5lZChlLmxhYmVsKSkge1xuXHRcdFx0XHRcdFx0XHRidXR0b24ubGFiZWwgPSBhY3Rpb24ubGFiZWw7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGlmIChwcmltYXJ5VGl0bGVCdXR0b25zPy5sZW5ndGgpIHtcblx0XHRcdFx0Zm9yIChjb25zdCBhY3Rpb24gb2YgcHJpbWFyeVRpdGxlQnV0dG9ucykge1xuXHRcdFx0XHRcdGNvbnN0IGJ1dHRvbiA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQnV0dG9uKHRoaXMuYnV0dG9uQ29udGFpbmVyLCB7XG5cdFx0XHRcdFx0XHQuLi5kZWZhdWx0QnV0dG9uU3R5bGVzXG5cdFx0XHRcdFx0fSkpO1xuXHRcdFx0XHRcdGJ1dHRvbi5sYWJlbCA9IGFjdGlvbi5sYWJlbDtcblx0XHRcdFx0XHRidXR0b24uZW5hYmxlZCA9IGFjdGlvbi5lbmFibGVkO1xuXHRcdFx0XHRcdGRpc3Bvc2FibGVzLmFkZChidXR0b24ub25EaWRDbGljaygoKSA9PiB0aGlzLmVkaXRvclByb2dyZXNzU2VydmljZS5zaG93V2hpbGUoYWN0aW9uLnJ1bigpKSkpO1xuXHRcdFx0XHRcdGRpc3Bvc2FibGVzLmFkZChhY3Rpb24ub25EaWRDaGFuZ2UoKGUpID0+IHtcblx0XHRcdFx0XHRcdGlmICghaXNVbmRlZmluZWQoZS5lbmFibGVkKSkge1xuXHRcdFx0XHRcdFx0XHRidXR0b24uZW5hYmxlZCA9IGFjdGlvbi5lbmFibGVkO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0aWYgKCFpc1VuZGVmaW5lZChlLmxhYmVsKSkge1xuXHRcdFx0XHRcdFx0XHRidXR0b24ubGFiZWwgPSBhY3Rpb24ubGFiZWw7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSkpO1xuXHRcdFx0XHRcdGRpc3Bvc2FibGVzLmFkZChwcm9maWxlRWxlbWVudC5vbkRpZENoYW5nZShlID0+IHtcblx0XHRcdFx0XHRcdGlmIChlLm1lc3NhZ2UpIHtcblx0XHRcdFx0XHRcdFx0YnV0dG9uLnNldFRpdGxlKHByb2ZpbGVFbGVtZW50Lm1lc3NhZ2UgPz8gYWN0aW9uLmxhYmVsKTtcblx0XHRcdFx0XHRcdFx0YnV0dG9uLmVsZW1lbnQuY2xhc3NMaXN0LnRvZ2dsZSgnZXJyb3InLCAhIXByb2ZpbGVFbGVtZW50Lm1lc3NhZ2UpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0pKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuYnV0dG9uQ29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ2hpZGUnKTtcblx0XHR9XG5cblx0XHRpZiAocHJvZmlsZUVsZW1lbnQgaW5zdGFuY2VvZiBOZXdQcm9maWxlRWxlbWVudCkge1xuXHRcdFx0dGhpcy5wcm9maWxlVHJlZS5mb2N1c0ZpcnN0KCk7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuZGltZW5zaW9uKSB7XG5cdFx0XHR0aGlzLmxheW91dCh0aGlzLmRpbWVuc2lvbik7XG5cdFx0fVxuXHR9XG5cbn1cblxudHlwZSBQcm9maWxlUHJvcGVydHkgPSAnbmFtZScgfCAnaWNvbicgfCAnY29weUZyb20nIHwgJ3VzZUZvckN1cnJlbnQnIHwgJ3VzZUFzRGVmYXVsdCcgfCAnY29udGVudHMnIHwgJ3dvcmtzcGFjZXMnO1xuXG5pbnRlcmZhY2UgUHJvZmlsZVRyZWVFbGVtZW50IHtcblx0ZWxlbWVudDogUHJvZmlsZVByb3BlcnR5O1xuXHRyb290OiBBYnN0cmFjdFVzZXJEYXRhUHJvZmlsZUVsZW1lbnQ7XG59XG5cbmNsYXNzIFByb2ZpbGVUcmVlRGVsZWdhdGUgZXh0ZW5kcyBDYWNoZWRMaXN0VmlydHVhbERlbGVnYXRlPFByb2ZpbGVUcmVlRWxlbWVudD4ge1xuXG5cdGdldFRlbXBsYXRlSWQoeyBlbGVtZW50IH06IFByb2ZpbGVUcmVlRWxlbWVudCkge1xuXHRcdHJldHVybiBlbGVtZW50O1xuXHR9XG5cblx0aGFzRHluYW1pY0hlaWdodCh7IGVsZW1lbnQgfTogUHJvZmlsZVRyZWVFbGVtZW50KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIGVsZW1lbnQgPT09ICdjb250ZW50cycgfHwgZWxlbWVudCA9PT0gJ3dvcmtzcGFjZXMnO1xuXHR9XG5cblx0cHJvdGVjdGVkIGVzdGltYXRlSGVpZ2h0KHsgZWxlbWVudCwgcm9vdCB9OiBQcm9maWxlVHJlZUVsZW1lbnQpOiBudW1iZXIge1xuXHRcdHN3aXRjaCAoZWxlbWVudCkge1xuXHRcdFx0Y2FzZSAnbmFtZSc6XG5cdFx0XHRcdHJldHVybiA3Mjtcblx0XHRcdGNhc2UgJ2ljb24nOlxuXHRcdFx0XHRyZXR1cm4gNjg7XG5cdFx0XHRjYXNlICdjb3B5RnJvbSc6XG5cdFx0XHRcdHJldHVybiA5MDtcblx0XHRcdGNhc2UgJ3VzZUZvckN1cnJlbnQnOlxuXHRcdFx0Y2FzZSAndXNlQXNEZWZhdWx0Jzpcblx0XHRcdFx0cmV0dXJuIDY4O1xuXHRcdFx0Y2FzZSAnY29udGVudHMnOlxuXHRcdFx0XHRyZXR1cm4gMjU4O1xuXHRcdFx0Y2FzZSAnd29ya3NwYWNlcyc6XG5cdFx0XHRcdHJldHVybiAocm9vdC53b3Jrc3BhY2VzID8gKHJvb3Qud29ya3NwYWNlcy5sZW5ndGggKiAyNCkgKyAzMCA6IDApICsgMTEyO1xuXHRcdH1cblx0fVxufVxuXG5jbGFzcyBQcm9maWxlVHJlZURhdGFTb3VyY2UgaW1wbGVtZW50cyBJQXN5bmNEYXRhU291cmNlPEFic3RyYWN0VXNlckRhdGFQcm9maWxlRWxlbWVudCwgUHJvZmlsZVRyZWVFbGVtZW50PiB7XG5cblx0aGFzQ2hpbGRyZW4oZWxlbWVudDogQWJzdHJhY3RVc2VyRGF0YVByb2ZpbGVFbGVtZW50IHwgUHJvZmlsZVRyZWVFbGVtZW50KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIGVsZW1lbnQgaW5zdGFuY2VvZiBBYnN0cmFjdFVzZXJEYXRhUHJvZmlsZUVsZW1lbnQ7XG5cdH1cblxuXHRhc3luYyBnZXRDaGlsZHJlbihlbGVtZW50OiBBYnN0cmFjdFVzZXJEYXRhUHJvZmlsZUVsZW1lbnQgfCBQcm9maWxlVHJlZUVsZW1lbnQpOiBQcm9taXNlPFByb2ZpbGVUcmVlRWxlbWVudFtdPiB7XG5cdFx0aWYgKGVsZW1lbnQgaW5zdGFuY2VvZiBBYnN0cmFjdFVzZXJEYXRhUHJvZmlsZUVsZW1lbnQpIHtcblx0XHRcdGNvbnN0IGNoaWxkcmVuOiBQcm9maWxlVHJlZUVsZW1lbnRbXSA9IFtdO1xuXHRcdFx0aWYgKGVsZW1lbnQgaW5zdGFuY2VvZiBOZXdQcm9maWxlRWxlbWVudCkge1xuXHRcdFx0XHRjaGlsZHJlbi5wdXNoKHsgZWxlbWVudDogJ25hbWUnLCByb290OiBlbGVtZW50IH0pO1xuXHRcdFx0XHRjaGlsZHJlbi5wdXNoKHsgZWxlbWVudDogJ2ljb24nLCByb290OiBlbGVtZW50IH0pO1xuXHRcdFx0XHRjaGlsZHJlbi5wdXNoKHsgZWxlbWVudDogJ2NvcHlGcm9tJywgcm9vdDogZWxlbWVudCB9KTtcblx0XHRcdFx0Y2hpbGRyZW4ucHVzaCh7IGVsZW1lbnQ6ICdjb250ZW50cycsIHJvb3Q6IGVsZW1lbnQgfSk7XG5cdFx0XHR9IGVsc2UgaWYgKGVsZW1lbnQgaW5zdGFuY2VvZiBVc2VyRGF0YVByb2ZpbGVFbGVtZW50KSB7XG5cdFx0XHRcdGlmICghZWxlbWVudC5wcm9maWxlLmlzRGVmYXVsdCkge1xuXHRcdFx0XHRcdGNoaWxkcmVuLnB1c2goeyBlbGVtZW50OiAnbmFtZScsIHJvb3Q6IGVsZW1lbnQgfSk7XG5cdFx0XHRcdFx0Y2hpbGRyZW4ucHVzaCh7IGVsZW1lbnQ6ICdpY29uJywgcm9vdDogZWxlbWVudCB9KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjaGlsZHJlbi5wdXNoKHsgZWxlbWVudDogJ3VzZUFzRGVmYXVsdCcsIHJvb3Q6IGVsZW1lbnQgfSk7XG5cdFx0XHRcdGNoaWxkcmVuLnB1c2goeyBlbGVtZW50OiAnY29udGVudHMnLCByb290OiBlbGVtZW50IH0pO1xuXHRcdFx0XHRjaGlsZHJlbi5wdXNoKHsgZWxlbWVudDogJ3dvcmtzcGFjZXMnLCByb290OiBlbGVtZW50IH0pO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGNoaWxkcmVuO1xuXHRcdH1cblx0XHRyZXR1cm4gW107XG5cdH1cbn1cblxuaW50ZXJmYWNlIFByb2ZpbGVDb250ZW50VHJlZUVsZW1lbnQge1xuXHRlbGVtZW50OiBJUHJvZmlsZUNoaWxkRWxlbWVudDtcblx0cm9vdDogQWJzdHJhY3RVc2VyRGF0YVByb2ZpbGVFbGVtZW50O1xufVxuXG5jbGFzcyBQcm9maWxlQ29udGVudFRyZWVFbGVtZW50RGVsZWdhdGUgaW1wbGVtZW50cyBJTGlzdFZpcnR1YWxEZWxlZ2F0ZTxQcm9maWxlQ29udGVudFRyZWVFbGVtZW50PiB7XG5cblx0Z2V0VGVtcGxhdGVJZChlbGVtZW50OiBQcm9maWxlQ29udGVudFRyZWVFbGVtZW50KSB7XG5cdFx0aWYgKCEoPElQcm9maWxlUmVzb3VyY2VUeXBlRWxlbWVudD5lbGVtZW50LmVsZW1lbnQpLnJlc291cmNlVHlwZSkge1xuXHRcdFx0cmV0dXJuIFByb2ZpbGVSZXNvdXJjZUNoaWxkVHJlZUl0ZW1SZW5kZXJlci5URU1QTEFURV9JRDtcblx0XHR9XG5cdFx0aWYgKGVsZW1lbnQucm9vdCBpbnN0YW5jZW9mIE5ld1Byb2ZpbGVFbGVtZW50KSB7XG5cdFx0XHRyZXR1cm4gTmV3UHJvZmlsZVJlc291cmNlVHJlZVJlbmRlcmVyLlRFTVBMQVRFX0lEO1xuXHRcdH1cblx0XHRyZXR1cm4gRXhpc3RpbmdQcm9maWxlUmVzb3VyY2VUcmVlUmVuZGVyZXIuVEVNUExBVEVfSUQ7XG5cdH1cblxuXHRnZXRIZWlnaHQoZWxlbWVudDogUHJvZmlsZUNvbnRlbnRUcmVlRWxlbWVudCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIDI0O1xuXHR9XG59XG5cbmNsYXNzIFByb2ZpbGVSZXNvdXJjZVRyZWVEYXRhU291cmNlIGltcGxlbWVudHMgSUFzeW5jRGF0YVNvdXJjZTxBYnN0cmFjdFVzZXJEYXRhUHJvZmlsZUVsZW1lbnQsIFByb2ZpbGVDb250ZW50VHJlZUVsZW1lbnQ+IHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUVkaXRvclByb2dyZXNzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVkaXRvclByb2dyZXNzU2VydmljZTogSUVkaXRvclByb2dyZXNzU2VydmljZSxcblx0KSB7IH1cblxuXHRoYXNDaGlsZHJlbihlbGVtZW50OiBBYnN0cmFjdFVzZXJEYXRhUHJvZmlsZUVsZW1lbnQgfCBQcm9maWxlQ29udGVudFRyZWVFbGVtZW50KTogYm9vbGVhbiB7XG5cdFx0aWYgKGVsZW1lbnQgaW5zdGFuY2VvZiBBYnN0cmFjdFVzZXJEYXRhUHJvZmlsZUVsZW1lbnQpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRpZiAoKDxJUHJvZmlsZVJlc291cmNlVHlwZUVsZW1lbnQ+ZWxlbWVudC5lbGVtZW50KS5yZXNvdXJjZVR5cGUpIHtcblx0XHRcdGlmICgoPElQcm9maWxlUmVzb3VyY2VUeXBlRWxlbWVudD5lbGVtZW50LmVsZW1lbnQpLnJlc291cmNlVHlwZSAhPT0gUHJvZmlsZVJlc291cmNlVHlwZS5FeHRlbnNpb25zICYmICg8SVByb2ZpbGVSZXNvdXJjZVR5cGVFbGVtZW50PmVsZW1lbnQuZWxlbWVudCkucmVzb3VyY2VUeXBlICE9PSBQcm9maWxlUmVzb3VyY2VUeXBlLlNuaXBwZXRzKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHRcdGlmIChlbGVtZW50LnJvb3QgaW5zdGFuY2VvZiBOZXdQcm9maWxlRWxlbWVudCkge1xuXHRcdFx0XHRjb25zdCByZXNvdXJjZVR5cGUgPSAoPElQcm9maWxlUmVzb3VyY2VUeXBlRWxlbWVudD5lbGVtZW50LmVsZW1lbnQpLnJlc291cmNlVHlwZTtcblx0XHRcdFx0aWYgKGVsZW1lbnQucm9vdC5nZXRGbGFnKHJlc291cmNlVHlwZSkpIHtcblx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoIWVsZW1lbnQucm9vdC5oYXNSZXNvdXJjZShyZXNvdXJjZVR5cGUpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChlbGVtZW50LnJvb3QuY29weUZyb20gPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoIWVsZW1lbnQucm9vdC5nZXRDb3B5RmxhZyhyZXNvdXJjZVR5cGUpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0YXN5bmMgZ2V0Q2hpbGRyZW4oZWxlbWVudDogQWJzdHJhY3RVc2VyRGF0YVByb2ZpbGVFbGVtZW50IHwgUHJvZmlsZUNvbnRlbnRUcmVlRWxlbWVudCk6IFByb21pc2U8UHJvZmlsZUNvbnRlbnRUcmVlRWxlbWVudFtdPiB7XG5cdFx0aWYgKGVsZW1lbnQgaW5zdGFuY2VvZiBBYnN0cmFjdFVzZXJEYXRhUHJvZmlsZUVsZW1lbnQpIHtcblx0XHRcdGNvbnN0IGNoaWxkcmVuID0gYXdhaXQgZWxlbWVudC5nZXRDaGlsZHJlbigpO1xuXHRcdFx0cmV0dXJuIGNoaWxkcmVuLm1hcChlID0+ICh7IGVsZW1lbnQ6IGUsIHJvb3Q6IGVsZW1lbnQgfSkpO1xuXHRcdH1cblx0XHRpZiAoKDxJUHJvZmlsZVJlc291cmNlVHlwZUVsZW1lbnQ+ZWxlbWVudC5lbGVtZW50KS5yZXNvdXJjZVR5cGUpIHtcblx0XHRcdGNvbnN0IHByb2dyZXNzUnVubmVyID0gdGhpcy5lZGl0b3JQcm9ncmVzc1NlcnZpY2Uuc2hvdyh0cnVlLCA1MDApO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgZXh0ZW5zaW9ucyA9IGF3YWl0IGVsZW1lbnQucm9vdC5nZXRDaGlsZHJlbigoPElQcm9maWxlUmVzb3VyY2VUeXBlRWxlbWVudD5lbGVtZW50LmVsZW1lbnQpLnJlc291cmNlVHlwZSk7XG5cdFx0XHRcdHJldHVybiBleHRlbnNpb25zLm1hcChlID0+ICh7IGVsZW1lbnQ6IGUsIHJvb3Q6IGVsZW1lbnQucm9vdCB9KSk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRwcm9ncmVzc1J1bm5lci5kb25lKCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBbXTtcblx0fVxufVxuXG5pbnRlcmZhY2UgSVByb2ZpbGVSZW5kZXJlclRlbXBsYXRlIHtcblx0cmVhZG9ubHkgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcblx0cmVhZG9ubHkgZWxlbWVudERpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmU7XG59XG5cbmludGVyZmFjZSBJRXhpc3RpbmdQcm9maWxlUmVzb3VyY2VUZW1wbGF0ZURhdGEgZXh0ZW5kcyBJUHJvZmlsZVJlbmRlcmVyVGVtcGxhdGUge1xuXHRyZWFkb25seSBsYWJlbDogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IHJhZGlvOiBSYWRpbztcblx0cmVhZG9ubHkgYWN0aW9uQmFyOiBXb3JrYmVuY2hUb29sQmFyO1xufVxuXG5pbnRlcmZhY2UgSU5ld1Byb2ZpbGVSZXNvdXJjZVRlbXBsYXRlRGF0YSBleHRlbmRzIElQcm9maWxlUmVuZGVyZXJUZW1wbGF0ZSB7XG5cdHJlYWRvbmx5IGxhYmVsOiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgcmFkaW86IFJhZGlvO1xuXHRyZWFkb25seSBhY3Rpb25CYXI6IFdvcmtiZW5jaFRvb2xCYXI7XG59XG5cbmludGVyZmFjZSBJUHJvZmlsZVJlc291cmNlQ2hpbGRUcmVlSXRlbVRlbXBsYXRlRGF0YSBleHRlbmRzIElQcm9maWxlUmVuZGVyZXJUZW1wbGF0ZSB7XG5cdHJlYWRvbmx5IGFjdGlvbkJhcjogV29ya2JlbmNoVG9vbEJhcjtcblx0cmVhZG9ubHkgY2hlY2tib3g6IENoZWNrYm94O1xuXHRyZWFkb25seSByZXNvdXJjZUxhYmVsOiBJUmVzb3VyY2VMYWJlbDtcbn1cblxuaW50ZXJmYWNlIElQcm9maWxlUHJvcGVydHlSZW5kZXJlclRlbXBsYXRlIGV4dGVuZHMgSVByb2ZpbGVSZW5kZXJlclRlbXBsYXRlIHtcblx0ZWxlbWVudDogUHJvZmlsZVRyZWVFbGVtZW50O1xufVxuXG5jbGFzcyBBYnN0cmFjdFByb2ZpbGVSZXNvdXJjZVRyZWVSZW5kZXJlciBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByb3RlY3RlZCBnZXRSZXNvdXJjZVR5cGVUaXRsZShyZXNvdXJjZVR5cGU6IFByb2ZpbGVSZXNvdXJjZVR5cGUpOiBzdHJpbmcge1xuXHRcdHN3aXRjaCAocmVzb3VyY2VUeXBlKSB7XG5cdFx0XHRjYXNlIFByb2ZpbGVSZXNvdXJjZVR5cGUuU2V0dGluZ3M6XG5cdFx0XHRcdHJldHVybiBsb2NhbGl6ZSgnc2V0dGluZ3MnLCBcIlNldHRpbmdzXCIpO1xuXHRcdFx0Y2FzZSBQcm9maWxlUmVzb3VyY2VUeXBlLktleWJpbmRpbmdzOlxuXHRcdFx0XHRyZXR1cm4gbG9jYWxpemUoJ2tleWJpbmRpbmdzJywgXCJLZXlib2FyZCBTaG9ydGN1dHNcIik7XG5cdFx0XHRjYXNlIFByb2ZpbGVSZXNvdXJjZVR5cGUuU25pcHBldHM6XG5cdFx0XHRcdHJldHVybiBsb2NhbGl6ZSgnc25pcHBldHMnLCBcIlNuaXBwZXRzXCIpO1xuXHRcdFx0Y2FzZSBQcm9maWxlUmVzb3VyY2VUeXBlLlRhc2tzOlxuXHRcdFx0XHRyZXR1cm4gbG9jYWxpemUoJ3Rhc2tzJywgXCJUYXNrc1wiKTtcblx0XHRcdGNhc2UgUHJvZmlsZVJlc291cmNlVHlwZS5NY3A6XG5cdFx0XHRcdHJldHVybiBsb2NhbGl6ZSgnbWNwJywgXCJNQ1AgU2VydmVyc1wiKTtcblx0XHRcdGNhc2UgUHJvZmlsZVJlc291cmNlVHlwZS5FeHRlbnNpb25zOlxuXHRcdFx0XHRyZXR1cm4gbG9jYWxpemUoJ2V4dGVuc2lvbnMnLCBcIkV4dGVuc2lvbnNcIik7XG5cdFx0fVxuXHRcdHJldHVybiAnJztcblx0fVxuXG5cdGRpc3Bvc2VFbGVtZW50KGVsZW1lbnQ6IElUcmVlTm9kZTxQcm9maWxlQ29udGVudFRyZWVFbGVtZW50IHwgUHJvZmlsZVRyZWVFbGVtZW50LCB2b2lkPiwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBJUHJvZmlsZVJlbmRlcmVyVGVtcGxhdGUpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudERpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdH1cblxuXHRkaXNwb3NlVGVtcGxhdGUodGVtcGxhdGVEYXRhOiBJUHJvZmlsZVJlbmRlcmVyVGVtcGxhdGUpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEuZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9XG59XG5cbmFic3RyYWN0IGNsYXNzIFByb2ZpbGVQcm9wZXJ0eVJlbmRlcmVyIGV4dGVuZHMgQWJzdHJhY3RQcm9maWxlUmVzb3VyY2VUcmVlUmVuZGVyZXIgaW1wbGVtZW50cyBJVHJlZVJlbmRlcmVyPFByb2ZpbGVUcmVlRWxlbWVudCwgdm9pZCwgSVByb2ZpbGVQcm9wZXJ0eVJlbmRlcmVyVGVtcGxhdGU+IHtcblxuXHRhYnN0cmFjdCB0ZW1wbGF0ZUlkOiBQcm9maWxlUHJvcGVydHk7XG5cdGFic3RyYWN0IHJlbmRlclRlbXBsYXRlKHBhcmVudDogSFRNTEVsZW1lbnQpOiBJUHJvZmlsZVByb3BlcnR5UmVuZGVyZXJUZW1wbGF0ZTtcblxuXHRyZW5kZXJFbGVtZW50KHsgZWxlbWVudCB9OiBJVHJlZU5vZGU8UHJvZmlsZVRyZWVFbGVtZW50LCB2b2lkPiwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBJUHJvZmlsZVByb3BlcnR5UmVuZGVyZXJUZW1wbGF0ZSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS5lbGVtZW50RGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudCA9IGVsZW1lbnQ7XG5cdH1cblxufVxuXG5jbGFzcyBQcm9maWxlTmFtZVJlbmRlcmVyIGV4dGVuZHMgUHJvZmlsZVByb3BlcnR5UmVuZGVyZXIge1xuXG5cdHJlYWRvbmx5IHRlbXBsYXRlSWQ6IFByb2ZpbGVQcm9wZXJ0eSA9ICduYW1lJztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXNlckRhdGFQcm9maWxlc1NlcnZpY2U6IElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSxcblx0XHRASUNvbnRleHRWaWV3U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRWaWV3U2VydmljZTogSUNvbnRleHRWaWV3U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdHJlbmRlclRlbXBsYXRlKHBhcmVudDogSFRNTEVsZW1lbnQpOiBJUHJvZmlsZVByb3BlcnR5UmVuZGVyZXJUZW1wbGF0ZSB7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgZWxlbWVudERpc3Bvc2FibGVzID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdFx0bGV0IHByb2ZpbGVFbGVtZW50OiBQcm9maWxlVHJlZUVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cblx0XHRjb25zdCBuYW1lQ29udGFpbmVyID0gYXBwZW5kKHBhcmVudCwgJCgnLnByb2ZpbGUtcm93LWNvbnRhaW5lcicpKTtcblx0XHRhcHBlbmQobmFtZUNvbnRhaW5lciwgJCgnLnByb2ZpbGUtbGFiZWwtZWxlbWVudCcsIHVuZGVmaW5lZCwgbG9jYWxpemUoJ25hbWUnLCBcIk5hbWVcIikpKTtcblx0XHRjb25zdCBuYW1lSW5wdXQgPSBkaXNwb3NhYmxlcy5hZGQobmV3IElucHV0Qm94KFxuXHRcdFx0bmFtZUNvbnRhaW5lcixcblx0XHRcdHRoaXMuY29udGV4dFZpZXdTZXJ2aWNlLFxuXHRcdFx0e1xuXHRcdFx0XHRpbnB1dEJveFN0eWxlczogZ2V0SW5wdXRCb3hTdHlsZSh7XG5cdFx0XHRcdFx0aW5wdXRCb3JkZXI6IHNldHRpbmdzVGV4dElucHV0Qm9yZGVyXG5cdFx0XHRcdH0pLFxuXHRcdFx0XHRhcmlhTGFiZWw6IGxvY2FsaXplKCdwcm9maWxlTmFtZScsIFwiUHJvZmlsZSBOYW1lXCIpLFxuXHRcdFx0XHRwbGFjZWhvbGRlcjogbG9jYWxpemUoJ3Byb2ZpbGVOYW1lJywgXCJQcm9maWxlIE5hbWVcIiksXG5cdFx0XHRcdHZhbGlkYXRpb25PcHRpb25zOiB7XG5cdFx0XHRcdFx0dmFsaWRhdGlvbjogKHZhbHVlKSA9PiB7XG5cdFx0XHRcdFx0XHRpZiAoIXZhbHVlKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRcdFx0Y29udGVudDogbG9jYWxpemUoJ25hbWUgcmVxdWlyZWQnLCBcIlByb2ZpbGUgbmFtZSBpcyByZXF1aXJlZCBhbmQgbXVzdCBiZSBhIG5vbi1lbXB0eSB2YWx1ZS5cIiksXG5cdFx0XHRcdFx0XHRcdFx0dHlwZTogTWVzc2FnZVR5cGUuV0FSTklOR1xuXHRcdFx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0aWYgKHByb2ZpbGVFbGVtZW50Py5yb290LmRpc2FibGVkKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0aWYgKCFwcm9maWxlRWxlbWVudD8ucm9vdC5zaG91bGRWYWxpZGF0ZU5hbWUoKSkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGNvbnN0IGluaXRpYWxOYW1lID0gcHJvZmlsZUVsZW1lbnQ/LnJvb3QuZ2V0SW5pdGlhbE5hbWUoKTtcblx0XHRcdFx0XHRcdHZhbHVlID0gdmFsdWUudHJpbSgpO1xuXHRcdFx0XHRcdFx0aWYgKGluaXRpYWxOYW1lICE9PSB2YWx1ZSAmJiB0aGlzLnVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLnByb2ZpbGVzLnNvbWUocCA9PiAhcC5pc0ludGVybmFsICYmIHAubmFtZSA9PT0gdmFsdWUpKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRcdFx0Y29udGVudDogbG9jYWxpemUoJ3Byb2ZpbGVFeGlzdHMnLCBcIlByb2ZpbGUgd2l0aCBuYW1lIHswfSBhbHJlYWR5IGV4aXN0cy5cIiwgdmFsdWUpLFxuXHRcdFx0XHRcdFx0XHRcdHR5cGU6IE1lc3NhZ2VUeXBlLldBUk5JTkdcblx0XHRcdFx0XHRcdFx0fTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdCkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChuYW1lSW5wdXQub25EaWRDaGFuZ2UodmFsdWUgPT4ge1xuXHRcdFx0aWYgKHByb2ZpbGVFbGVtZW50ICYmIHZhbHVlKSB7XG5cdFx0XHRcdHByb2ZpbGVFbGVtZW50LnJvb3QubmFtZSA9IHZhbHVlO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHRjb25zdCBmb2N1c1RyYWNrZXIgPSBkaXNwb3NhYmxlcy5hZGQodHJhY2tGb2N1cyhuYW1lSW5wdXQuaW5wdXRFbGVtZW50KSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGZvY3VzVHJhY2tlci5vbkRpZEJsdXIoKCkgPT4ge1xuXHRcdFx0aWYgKHByb2ZpbGVFbGVtZW50ICYmICFuYW1lSW5wdXQudmFsdWUpIHtcblx0XHRcdFx0bmFtZUlucHV0LnZhbHVlID0gcHJvZmlsZUVsZW1lbnQucm9vdC5uYW1lO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IHJlbmRlck5hbWUgPSAocHJvZmlsZUVsZW1lbnQ6IFByb2ZpbGVUcmVlRWxlbWVudCkgPT4ge1xuXHRcdFx0bmFtZUlucHV0LnZhbHVlID0gcHJvZmlsZUVsZW1lbnQucm9vdC5uYW1lO1xuXHRcdFx0bmFtZUlucHV0LnZhbGlkYXRlKCk7XG5cdFx0XHRjb25zdCBpc1N5c3RlbVByb2ZpbGUgPSBwcm9maWxlRWxlbWVudC5yb290IGluc3RhbmNlb2YgVXNlckRhdGFQcm9maWxlRWxlbWVudCAmJiAocHJvZmlsZUVsZW1lbnQucm9vdC5wcm9maWxlLmlzRGVmYXVsdCk7XG5cdFx0XHRpZiAocHJvZmlsZUVsZW1lbnQucm9vdC5kaXNhYmxlZCB8fCBpc1N5c3RlbVByb2ZpbGUpIHtcblx0XHRcdFx0bmFtZUlucHV0LmRpc2FibGUoKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdG5hbWVJbnB1dC5lbmFibGUoKTtcblx0XHRcdH1cblx0XHRcdGlmIChpc1N5c3RlbVByb2ZpbGUpIHtcblx0XHRcdFx0bmFtZUlucHV0LnNldFRvb2x0aXAobG9jYWxpemUoJ2RlZmF1bHRQcm9maWxlTmFtZScsIFwiTmFtZSBjYW5ub3QgYmUgY2hhbmdlZCBmb3IgdGhlIGJ1aWx0IGluIHByb2ZpbGVzXCIpKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdG5hbWVJbnB1dC5zZXRUb29sdGlwKGxvY2FsaXplKCdwcm9maWxlTmFtZScsIFwiUHJvZmlsZSBOYW1lXCIpKTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdHNldCBlbGVtZW50KGVsZW1lbnQ6IFByb2ZpbGVUcmVlRWxlbWVudCkge1xuXHRcdFx0XHRwcm9maWxlRWxlbWVudCA9IGVsZW1lbnQ7XG5cdFx0XHRcdHJlbmRlck5hbWUocHJvZmlsZUVsZW1lbnQpO1xuXHRcdFx0XHRlbGVtZW50RGlzcG9zYWJsZXMuYWRkKHByb2ZpbGVFbGVtZW50LnJvb3Qub25EaWRDaGFuZ2UoZSA9PiB7XG5cdFx0XHRcdFx0aWYgKGUubmFtZSB8fCBlLmRpc2FibGVkKSB7XG5cdFx0XHRcdFx0XHRyZW5kZXJOYW1lKGVsZW1lbnQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoZS5wcm9maWxlKSB7XG5cdFx0XHRcdFx0XHRuYW1lSW5wdXQudmFsaWRhdGUoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pKTtcblx0XHRcdH0sXG5cdFx0XHRkaXNwb3NhYmxlcyxcblx0XHRcdGVsZW1lbnREaXNwb3NhYmxlc1xuXHRcdH07XG5cdH1cblxufVxuXG5jbGFzcyBQcm9maWxlSWNvblJlbmRlcmVyIGV4dGVuZHMgUHJvZmlsZVByb3BlcnR5UmVuZGVyZXIge1xuXG5cdHJlYWRvbmx5IHRlbXBsYXRlSWQ6IFByb2ZpbGVQcm9wZXJ0eSA9ICdpY29uJztcblx0cHJpdmF0ZSByZWFkb25seSBob3ZlckRlbGVnYXRlOiBJSG92ZXJEZWxlZ2F0ZTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUhvdmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLmhvdmVyRGVsZWdhdGUgPSBnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSgnZWxlbWVudCcpO1xuXHR9XG5cblx0cmVuZGVyVGVtcGxhdGUocGFyZW50OiBIVE1MRWxlbWVudCk6IElQcm9maWxlUHJvcGVydHlSZW5kZXJlclRlbXBsYXRlIHtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBlbGVtZW50RGlzcG9zYWJsZXMgPSBkaXNwb3NhYmxlcy5hZGQobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0XHRsZXQgcHJvZmlsZUVsZW1lbnQ6IFByb2ZpbGVUcmVlRWxlbWVudCB8IHVuZGVmaW5lZDtcblxuXHRcdGNvbnN0IGljb25Db250YWluZXIgPSBhcHBlbmQocGFyZW50LCAkKCcucHJvZmlsZS1yb3ctY29udGFpbmVyJykpO1xuXHRcdGFwcGVuZChpY29uQ29udGFpbmVyLCAkKCcucHJvZmlsZS1sYWJlbC1lbGVtZW50JywgdW5kZWZpbmVkLCBsb2NhbGl6ZSgnaWNvbi1sYWJlbCcsIFwiSWNvblwiKSkpO1xuXHRcdGNvbnN0IGljb25WYWx1ZUNvbnRhaW5lciA9IGFwcGVuZChpY29uQ29udGFpbmVyLCAkKCcucHJvZmlsZS1pY29uLWNvbnRhaW5lcicpKTtcblx0XHRjb25zdCBpY29uRWxlbWVudCA9IGFwcGVuZChpY29uVmFsdWVDb250YWluZXIsICQoYCR7VGhlbWVJY29uLmFzQ1NTU2VsZWN0b3IoREVGQVVMVF9JQ09OKX1gLCB7ICd0YWJpbmRleCc6ICcwJywgJ3JvbGUnOiAnYnV0dG9uJywgJ2FyaWEtbGFiZWwnOiBsb2NhbGl6ZSgnaWNvbicsIFwiUHJvZmlsZSBJY29uXCIpIH0pKTtcblx0XHRjb25zdCBpY29uSG92ZXIgPSBkaXNwb3NhYmxlcy5hZGQodGhpcy5ob3ZlclNlcnZpY2Uuc2V0dXBNYW5hZ2VkSG92ZXIodGhpcy5ob3ZlckRlbGVnYXRlLCBpY29uRWxlbWVudCwgJycpKTtcblxuXHRcdGNvbnN0IGljb25TZWxlY3RCb3ggPSBkaXNwb3NhYmxlcy5hZGQodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShXb3JrYmVuY2hJY29uU2VsZWN0Qm94LCB7IGljb25zOiBJQ09OUywgaW5wdXRCb3hTdHlsZXM6IGRlZmF1bHRJbnB1dEJveFN0eWxlcyB9KSk7XG5cdFx0bGV0IGhvdmVyV2lkZ2V0OiBJSG92ZXJXaWRnZXQgfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3Qgc2hvd0ljb25TZWxlY3RCb3ggPSAoKSA9PiB7XG5cdFx0XHRpZiAocHJvZmlsZUVsZW1lbnQ/LnJvb3QgaW5zdGFuY2VvZiBVc2VyRGF0YVByb2ZpbGVFbGVtZW50ICYmIHByb2ZpbGVFbGVtZW50LnJvb3QucHJvZmlsZS5pc0RlZmF1bHQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHByb2ZpbGVFbGVtZW50Py5yb290LmRpc2FibGVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGlmIChwcm9maWxlRWxlbWVudD8ucm9vdCBpbnN0YW5jZW9mIFVzZXJEYXRhUHJvZmlsZUVsZW1lbnQgJiYgcHJvZmlsZUVsZW1lbnQucm9vdC5wcm9maWxlLmlzRGVmYXVsdCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRpY29uU2VsZWN0Qm94LmNsZWFySW5wdXQoKTtcblx0XHRcdGhvdmVyV2lkZ2V0ID0gdGhpcy5ob3ZlclNlcnZpY2Uuc2hvd0luc3RhbnRIb3Zlcih7XG5cdFx0XHRcdGNvbnRlbnQ6IGljb25TZWxlY3RCb3guZG9tTm9kZSxcblx0XHRcdFx0dGFyZ2V0OiBpY29uRWxlbWVudCxcblx0XHRcdFx0cG9zaXRpb246IHtcblx0XHRcdFx0XHRob3ZlclBvc2l0aW9uOiBIb3ZlclBvc2l0aW9uLkJFTE9XLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRwZXJzaXN0ZW5jZToge1xuXHRcdFx0XHRcdHN0aWNreTogdHJ1ZSxcblx0XHRcdFx0fSxcblx0XHRcdFx0YXBwZWFyYW5jZToge1xuXHRcdFx0XHRcdHNob3dQb2ludGVyOiB0cnVlLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSwgdHJ1ZSk7XG5cblx0XHRcdGlmIChob3ZlcldpZGdldCkge1xuXHRcdFx0XHRpY29uU2VsZWN0Qm94LmxheW91dChuZXcgRGltZW5zaW9uKDQ4NiwgMjkyKSk7XG5cdFx0XHRcdGljb25TZWxlY3RCb3guZm9jdXMoKTtcblx0XHRcdH1cblx0XHR9O1xuXHRcdGRpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIoaWNvbkVsZW1lbnQsIEV2ZW50VHlwZS5DTElDSywgKGU6IE1vdXNlRXZlbnQpID0+IHtcblx0XHRcdEV2ZW50SGVscGVyLnN0b3AoZSwgdHJ1ZSk7XG5cdFx0XHRzaG93SWNvblNlbGVjdEJveCgpO1xuXHRcdH0pKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGljb25FbGVtZW50LCBFdmVudFR5cGUuS0VZX0RPV04sIGUgPT4ge1xuXHRcdFx0Y29uc3QgZXZlbnQgPSBuZXcgU3RhbmRhcmRLZXlib2FyZEV2ZW50KGUpO1xuXHRcdFx0aWYgKGV2ZW50LmVxdWFscyhLZXlDb2RlLkVudGVyKSB8fCBldmVudC5lcXVhbHMoS2V5Q29kZS5TcGFjZSkpIHtcblx0XHRcdFx0RXZlbnRIZWxwZXIuc3RvcChldmVudCwgdHJ1ZSk7XG5cdFx0XHRcdHNob3dJY29uU2VsZWN0Qm94KCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIoaWNvblNlbGVjdEJveC5kb21Ob2RlLCBFdmVudFR5cGUuS0VZX0RPV04sIGUgPT4ge1xuXHRcdFx0Y29uc3QgZXZlbnQgPSBuZXcgU3RhbmRhcmRLZXlib2FyZEV2ZW50KGUpO1xuXHRcdFx0aWYgKGV2ZW50LmVxdWFscyhLZXlDb2RlLkVzY2FwZSkpIHtcblx0XHRcdFx0RXZlbnRIZWxwZXIuc3RvcChldmVudCwgdHJ1ZSk7XG5cdFx0XHRcdGhvdmVyV2lkZ2V0Py5kaXNwb3NlKCk7XG5cdFx0XHRcdGljb25FbGVtZW50LmZvY3VzKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChpY29uU2VsZWN0Qm94Lm9uRGlkU2VsZWN0KHNlbGVjdGVkSWNvbiA9PiB7XG5cdFx0XHRob3ZlcldpZGdldD8uZGlzcG9zZSgpO1xuXHRcdFx0aWNvbkVsZW1lbnQuZm9jdXMoKTtcblx0XHRcdGlmIChwcm9maWxlRWxlbWVudCkge1xuXHRcdFx0XHRwcm9maWxlRWxlbWVudC5yb290Lmljb24gPSBzZWxlY3RlZEljb24uaWQ7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0YXBwZW5kKGljb25WYWx1ZUNvbnRhaW5lciwgJCgnLnByb2ZpbGUtZGVzY3JpcHRpb24tZWxlbWVudCcsIHVuZGVmaW5lZCwgbG9jYWxpemUoJ2ljb24tZGVzY3JpcHRpb24nLCBcIlByb2ZpbGUgaWNvbiB0byBiZSBzaG93biBpbiB0aGUgYWN0aXZpdHkgYmFyXCIpKSk7XG5cblx0XHRjb25zdCByZW5kZXJJY29uID0gKHByb2ZpbGVFbGVtZW50OiBQcm9maWxlVHJlZUVsZW1lbnQpID0+IHtcblx0XHRcdGlmIChwcm9maWxlRWxlbWVudD8ucm9vdCBpbnN0YW5jZW9mIFVzZXJEYXRhUHJvZmlsZUVsZW1lbnQgJiYgcHJvZmlsZUVsZW1lbnQucm9vdC5wcm9maWxlLmlzRGVmYXVsdCkge1xuXHRcdFx0XHRpY29uVmFsdWVDb250YWluZXIuY2xhc3NMaXN0LmFkZCgnZGlzYWJsZWQnKTtcblx0XHRcdFx0aWNvbkhvdmVyLnVwZGF0ZShsb2NhbGl6ZSgnZGVmYXVsdFByb2ZpbGVJY29uJywgXCJJY29uIGNhbm5vdCBiZSBjaGFuZ2VkIGZvciB0aGUgZGVmYXVsdCBwcm9maWxlXCIpKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGljb25Ib3Zlci51cGRhdGUobG9jYWxpemUoJ2NoYW5nZUljb24nLCBcIkNsaWNrIHRvIGNoYW5nZSBpY29uXCIpKTtcblx0XHRcdFx0aWNvblZhbHVlQ29udGFpbmVyLmNsYXNzTGlzdC5yZW1vdmUoJ2Rpc2FibGVkJyk7XG5cdFx0XHR9XG5cdFx0XHRpZiAocHJvZmlsZUVsZW1lbnQucm9vdC5pY29uKSB7XG5cdFx0XHRcdGljb25FbGVtZW50LmNsYXNzTmFtZSA9IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShUaGVtZUljb24uZnJvbUlkKHByb2ZpbGVFbGVtZW50LnJvb3QuaWNvbikpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0aWNvbkVsZW1lbnQuY2xhc3NOYW1lID0gVGhlbWVJY29uLmFzQ2xhc3NOYW1lKFRoZW1lSWNvbi5mcm9tSWQoREVGQVVMVF9JQ09OLmlkKSk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRzZXQgZWxlbWVudChlbGVtZW50OiBQcm9maWxlVHJlZUVsZW1lbnQpIHtcblx0XHRcdFx0cHJvZmlsZUVsZW1lbnQgPSBlbGVtZW50O1xuXHRcdFx0XHRyZW5kZXJJY29uKHByb2ZpbGVFbGVtZW50KTtcblx0XHRcdFx0ZWxlbWVudERpc3Bvc2FibGVzLmFkZChwcm9maWxlRWxlbWVudC5yb290Lm9uRGlkQ2hhbmdlKGUgPT4ge1xuXHRcdFx0XHRcdGlmIChlLmljb24pIHtcblx0XHRcdFx0XHRcdHJlbmRlckljb24oZWxlbWVudCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KSk7XG5cdFx0XHR9LFxuXHRcdFx0ZGlzcG9zYWJsZXMsXG5cdFx0XHRlbGVtZW50RGlzcG9zYWJsZXNcblx0XHR9O1xuXHR9XG59XG5cbmNsYXNzIFVzZUZvckN1cnJlbnRXaW5kb3dQcm9wZXJ0eVJlbmRlcmVyIGV4dGVuZHMgUHJvZmlsZVByb3BlcnR5UmVuZGVyZXIge1xuXG5cdHJlYWRvbmx5IHRlbXBsYXRlSWQ6IFByb2ZpbGVQcm9wZXJ0eSA9ICd1c2VGb3JDdXJyZW50JztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVVzZXJEYXRhUHJvZmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1c2VyRGF0YVByb2ZpbGVTZXJ2aWNlOiBJVXNlckRhdGFQcm9maWxlU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdHJlbmRlclRlbXBsYXRlKHBhcmVudDogSFRNTEVsZW1lbnQpOiBJUHJvZmlsZVByb3BlcnR5UmVuZGVyZXJUZW1wbGF0ZSB7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgZWxlbWVudERpc3Bvc2FibGVzID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdFx0bGV0IHByb2ZpbGVFbGVtZW50OiBQcm9maWxlVHJlZUVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cblx0XHRjb25zdCB1c2VGb3JDdXJyZW50V2luZG93Q29udGFpbmVyID0gYXBwZW5kKHBhcmVudCwgJCgnLnByb2ZpbGUtcm93LWNvbnRhaW5lcicpKTtcblx0XHRhcHBlbmQodXNlRm9yQ3VycmVudFdpbmRvd0NvbnRhaW5lciwgJCgnLnByb2ZpbGUtbGFiZWwtZWxlbWVudCcsIHVuZGVmaW5lZCwgbG9jYWxpemUoJ3VzZSBmb3IgY3VycmVuIHdpbmRvdycsIFwiVXNlIGZvciBDdXJyZW50IFdpbmRvd1wiKSkpO1xuXHRcdGNvbnN0IHVzZUZvckN1cnJlbnRXaW5kb3dWYWx1ZUNvbnRhaW5lciA9IGFwcGVuZCh1c2VGb3JDdXJyZW50V2luZG93Q29udGFpbmVyLCAkKCcucHJvZmlsZS11c2UtZm9yLWN1cnJlbnQtY29udGFpbmVyJykpO1xuXHRcdGNvbnN0IHVzZUZvckN1cnJlbnRXaW5kb3dUaXRsZSA9IGxvY2FsaXplKCdlbmFibGUgZm9yIGN1cnJlbnQgd2luZG93JywgXCJVc2UgdGhpcyBwcm9maWxlIGZvciB0aGUgY3VycmVudCB3aW5kb3dcIik7XG5cdFx0Y29uc3QgdXNlRm9yQ3VycmVudFdpbmRvd0NoZWNrYm94ID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBDaGVja2JveCh1c2VGb3JDdXJyZW50V2luZG93VGl0bGUsIGZhbHNlLCBkZWZhdWx0Q2hlY2tib3hTdHlsZXMpKTtcblx0XHRhcHBlbmQodXNlRm9yQ3VycmVudFdpbmRvd1ZhbHVlQ29udGFpbmVyLCB1c2VGb3JDdXJyZW50V2luZG93Q2hlY2tib3guZG9tTm9kZSk7XG5cdFx0Y29uc3QgdXNlRm9yQ3VycmVudFdpbmRvd0xhYmVsID0gYXBwZW5kKHVzZUZvckN1cnJlbnRXaW5kb3dWYWx1ZUNvbnRhaW5lciwgJCgnLnByb2ZpbGUtZGVzY3JpcHRpb24tZWxlbWVudCcsIHVuZGVmaW5lZCwgdXNlRm9yQ3VycmVudFdpbmRvd1RpdGxlKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHVzZUZvckN1cnJlbnRXaW5kb3dDaGVja2JveC5vbkNoYW5nZSgoKSA9PiB7XG5cdFx0XHRpZiAocHJvZmlsZUVsZW1lbnQ/LnJvb3QgaW5zdGFuY2VvZiBVc2VyRGF0YVByb2ZpbGVFbGVtZW50KSB7XG5cdFx0XHRcdHByb2ZpbGVFbGVtZW50LnJvb3QudG9nZ2xlQ3VycmVudFdpbmRvd1Byb2ZpbGUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih1c2VGb3JDdXJyZW50V2luZG93TGFiZWwsIEV2ZW50VHlwZS5DTElDSywgKCkgPT4ge1xuXHRcdFx0aWYgKHByb2ZpbGVFbGVtZW50Py5yb290IGluc3RhbmNlb2YgVXNlckRhdGFQcm9maWxlRWxlbWVudCkge1xuXHRcdFx0XHRwcm9maWxlRWxlbWVudC5yb290LnRvZ2dsZUN1cnJlbnRXaW5kb3dQcm9maWxlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgcmVuZGVyVXNlQ3VycmVudFByb2ZpbGUgPSAocHJvZmlsZUVsZW1lbnQ6IFByb2ZpbGVUcmVlRWxlbWVudCkgPT4ge1xuXHRcdFx0dXNlRm9yQ3VycmVudFdpbmRvd0NoZWNrYm94LmNoZWNrZWQgPSBwcm9maWxlRWxlbWVudC5yb290IGluc3RhbmNlb2YgVXNlckRhdGFQcm9maWxlRWxlbWVudCAmJiB0aGlzLnVzZXJEYXRhUHJvZmlsZVNlcnZpY2UuY3VycmVudFByb2ZpbGUuaWQgPT09IHByb2ZpbGVFbGVtZW50LnJvb3QucHJvZmlsZS5pZDtcblx0XHRcdGlmICh1c2VGb3JDdXJyZW50V2luZG93Q2hlY2tib3guY2hlY2tlZCAmJiB0aGlzLnVzZXJEYXRhUHJvZmlsZVNlcnZpY2UuY3VycmVudFByb2ZpbGUuaXNEZWZhdWx0KSB7XG5cdFx0XHRcdHVzZUZvckN1cnJlbnRXaW5kb3dDaGVja2JveC5kaXNhYmxlKCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR1c2VGb3JDdXJyZW50V2luZG93Q2hlY2tib3guZW5hYmxlKCk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGNvbnN0IHRoYXQgPSB0aGlzO1xuXHRcdHJldHVybiB7XG5cdFx0XHRzZXQgZWxlbWVudChlbGVtZW50OiBQcm9maWxlVHJlZUVsZW1lbnQpIHtcblx0XHRcdFx0cHJvZmlsZUVsZW1lbnQgPSBlbGVtZW50O1xuXHRcdFx0XHRyZW5kZXJVc2VDdXJyZW50UHJvZmlsZShwcm9maWxlRWxlbWVudCk7XG5cdFx0XHRcdGVsZW1lbnREaXNwb3NhYmxlcy5hZGQodGhhdC51c2VyRGF0YVByb2ZpbGVTZXJ2aWNlLm9uRGlkQ2hhbmdlQ3VycmVudFByb2ZpbGUoZSA9PiB7XG5cdFx0XHRcdFx0cmVuZGVyVXNlQ3VycmVudFByb2ZpbGUoZWxlbWVudCk7XG5cdFx0XHRcdH0pKTtcblx0XHRcdH0sXG5cdFx0XHRkaXNwb3NhYmxlcyxcblx0XHRcdGVsZW1lbnREaXNwb3NhYmxlc1xuXHRcdH07XG5cdH1cbn1cblxuY2xhc3MgVXNlQXNEZWZhdWx0UHJvZmlsZVJlbmRlcmVyIGV4dGVuZHMgUHJvZmlsZVByb3BlcnR5UmVuZGVyZXIge1xuXG5cdHJlYWRvbmx5IHRlbXBsYXRlSWQ6IFByb2ZpbGVQcm9wZXJ0eSA9ICd1c2VBc0RlZmF1bHQnO1xuXG5cdHJlbmRlclRlbXBsYXRlKHBhcmVudDogSFRNTEVsZW1lbnQpOiBJUHJvZmlsZVByb3BlcnR5UmVuZGVyZXJUZW1wbGF0ZSB7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgZWxlbWVudERpc3Bvc2FibGVzID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdFx0bGV0IHByb2ZpbGVFbGVtZW50OiBQcm9maWxlVHJlZUVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cblx0XHRjb25zdCB1c2VBc0RlZmF1bHRQcm9maWxlQ29udGFpbmVyID0gYXBwZW5kKHBhcmVudCwgJCgnLnByb2ZpbGUtcm93LWNvbnRhaW5lcicpKTtcblx0XHRhcHBlbmQodXNlQXNEZWZhdWx0UHJvZmlsZUNvbnRhaW5lciwgJCgnLnByb2ZpbGUtbGFiZWwtZWxlbWVudCcsIHVuZGVmaW5lZCwgbG9jYWxpemUoJ3VzZSBmb3IgbmV3IHdpbmRvd3MnLCBcIlVzZSBmb3IgTmV3IFdpbmRvd3NcIikpKTtcblx0XHRjb25zdCB1c2VBc0RlZmF1bHRQcm9maWxlVmFsdWVDb250YWluZXIgPSBhcHBlbmQodXNlQXNEZWZhdWx0UHJvZmlsZUNvbnRhaW5lciwgJCgnLnByb2ZpbGUtdXNlLWFzLWRlZmF1bHQtY29udGFpbmVyJykpO1xuXHRcdGNvbnN0IHVzZUFzRGVmYXVsdFByb2ZpbGVUaXRsZSA9IGxvY2FsaXplKCdlbmFibGUgZm9yIG5ldyB3aW5kb3dzJywgXCJVc2UgdGhpcyBwcm9maWxlIGFzIHRoZSBkZWZhdWx0IGZvciBuZXcgd2luZG93c1wiKTtcblx0XHRjb25zdCB1c2VBc0RlZmF1bHRQcm9maWxlQ2hlY2tib3ggPSBkaXNwb3NhYmxlcy5hZGQobmV3IENoZWNrYm94KHVzZUFzRGVmYXVsdFByb2ZpbGVUaXRsZSwgZmFsc2UsIGRlZmF1bHRDaGVja2JveFN0eWxlcykpO1xuXHRcdGFwcGVuZCh1c2VBc0RlZmF1bHRQcm9maWxlVmFsdWVDb250YWluZXIsIHVzZUFzRGVmYXVsdFByb2ZpbGVDaGVja2JveC5kb21Ob2RlKTtcblx0XHRjb25zdCB1c2VBc0RlZmF1bHRQcm9maWxlTGFiZWwgPSBhcHBlbmQodXNlQXNEZWZhdWx0UHJvZmlsZVZhbHVlQ29udGFpbmVyLCAkKCcucHJvZmlsZS1kZXNjcmlwdGlvbi1lbGVtZW50JywgdW5kZWZpbmVkLCB1c2VBc0RlZmF1bHRQcm9maWxlVGl0bGUpKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodXNlQXNEZWZhdWx0UHJvZmlsZUNoZWNrYm94Lm9uQ2hhbmdlKCgpID0+IHtcblx0XHRcdGlmIChwcm9maWxlRWxlbWVudD8ucm9vdCBpbnN0YW5jZW9mIFVzZXJEYXRhUHJvZmlsZUVsZW1lbnQpIHtcblx0XHRcdFx0cHJvZmlsZUVsZW1lbnQucm9vdC50b2dnbGVOZXdXaW5kb3dQcm9maWxlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIodXNlQXNEZWZhdWx0UHJvZmlsZUxhYmVsLCBFdmVudFR5cGUuQ0xJQ0ssICgpID0+IHtcblx0XHRcdGlmIChwcm9maWxlRWxlbWVudD8ucm9vdCBpbnN0YW5jZW9mIFVzZXJEYXRhUHJvZmlsZUVsZW1lbnQpIHtcblx0XHRcdFx0cHJvZmlsZUVsZW1lbnQucm9vdC50b2dnbGVOZXdXaW5kb3dQcm9maWxlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgcmVuZGVyVXNlQXNEZWZhdWx0ID0gKHByb2ZpbGVFbGVtZW50OiBQcm9maWxlVHJlZUVsZW1lbnQpID0+IHtcblx0XHRcdHVzZUFzRGVmYXVsdFByb2ZpbGVDaGVja2JveC5jaGVja2VkID0gcHJvZmlsZUVsZW1lbnQucm9vdCBpbnN0YW5jZW9mIFVzZXJEYXRhUHJvZmlsZUVsZW1lbnQgJiYgcHJvZmlsZUVsZW1lbnQucm9vdC5pc05ld1dpbmRvd1Byb2ZpbGU7XG5cdFx0fTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRzZXQgZWxlbWVudChlbGVtZW50OiBQcm9maWxlVHJlZUVsZW1lbnQpIHtcblx0XHRcdFx0cHJvZmlsZUVsZW1lbnQgPSBlbGVtZW50O1xuXHRcdFx0XHRyZW5kZXJVc2VBc0RlZmF1bHQocHJvZmlsZUVsZW1lbnQpO1xuXHRcdFx0XHRlbGVtZW50RGlzcG9zYWJsZXMuYWRkKHByb2ZpbGVFbGVtZW50LnJvb3Qub25EaWRDaGFuZ2UoZSA9PiB7XG5cdFx0XHRcdFx0aWYgKGUubmV3V2luZG93UHJvZmlsZSkge1xuXHRcdFx0XHRcdFx0cmVuZGVyVXNlQXNEZWZhdWx0KGVsZW1lbnQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSkpO1xuXHRcdFx0fSxcblx0XHRcdGRpc3Bvc2FibGVzLFxuXHRcdFx0ZWxlbWVudERpc3Bvc2FibGVzXG5cdFx0fTtcblx0fVxufVxuXG5jbGFzcyBDb3B5RnJvbVByb2ZpbGVSZW5kZXJlciBleHRlbmRzIFByb2ZpbGVQcm9wZXJ0eVJlbmRlcmVyIHtcblxuXHRyZWFkb25seSB0ZW1wbGF0ZUlkOiBQcm9maWxlUHJvcGVydHkgPSAnY29weUZyb20nO1xuXG5cdHByaXZhdGUgdGVtcGxhdGVzOiByZWFkb25seSBJUHJvZmlsZVRlbXBsYXRlSW5mb1tdID0gW107XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlOiBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElVcmlJZGVudGl0eVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1cmlJZGVudGl0eVNlcnZpY2U6IElVcmlJZGVudGl0eVNlcnZpY2UsXG5cdFx0QElDb250ZXh0Vmlld1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0Vmlld1NlcnZpY2U6IElDb250ZXh0Vmlld1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHRyZW5kZXJUZW1wbGF0ZShwYXJlbnQ6IEhUTUxFbGVtZW50KTogSVByb2ZpbGVQcm9wZXJ0eVJlbmRlcmVyVGVtcGxhdGUge1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IGVsZW1lbnREaXNwb3NhYmxlcyA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRcdGxldCBwcm9maWxlRWxlbWVudDogUHJvZmlsZVRyZWVFbGVtZW50IHwgdW5kZWZpbmVkO1xuXG5cdFx0Y29uc3QgY29weUZyb21Db250YWluZXIgPSBhcHBlbmQocGFyZW50LCAkKCcucHJvZmlsZS1yb3ctY29udGFpbmVyLnByb2ZpbGUtY29weS1mcm9tLWNvbnRhaW5lcicpKTtcblx0XHRhcHBlbmQoY29weUZyb21Db250YWluZXIsICQoJy5wcm9maWxlLWxhYmVsLWVsZW1lbnQnLCB1bmRlZmluZWQsIGxvY2FsaXplKCdjcmVhdGUgZnJvbScsIFwiQ29weSBmcm9tXCIpKSk7XG5cdFx0YXBwZW5kKGNvcHlGcm9tQ29udGFpbmVyLCAkKCcucHJvZmlsZS1kZXNjcmlwdGlvbi1lbGVtZW50JywgdW5kZWZpbmVkLCBsb2NhbGl6ZSgnY29weSBmcm9tIGRlc2NyaXB0aW9uJywgXCJTZWxlY3QgdGhlIHByb2ZpbGUgc291cmNlIGZyb20gd2hpY2ggeW91IHdhbnQgdG8gY29weSBjb250ZW50c1wiKSkpO1xuXHRcdGNvbnN0IGNvcHlGcm9tU2VsZWN0Qm94ID0gZGlzcG9zYWJsZXMuYWRkKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2VsZWN0Qm94LFxuXHRcdFx0W10sXG5cdFx0XHQwLFxuXHRcdFx0dGhpcy5jb250ZXh0Vmlld1NlcnZpY2UsXG5cdFx0XHRkZWZhdWx0U2VsZWN0Qm94U3R5bGVzLFxuXHRcdFx0e1xuXHRcdFx0XHR1c2VDdXN0b21EcmF3bjogdHJ1ZSxcblx0XHRcdFx0YXJpYUxhYmVsOiBsb2NhbGl6ZSgnY29weSBwcm9maWxlIGZyb20nLCBcIkNvcHkgcHJvZmlsZSBmcm9tXCIpLFxuXHRcdFx0fVxuXHRcdCkpO1xuXHRcdGNvcHlGcm9tU2VsZWN0Qm94LnJlbmRlcihhcHBlbmQoY29weUZyb21Db250YWluZXIsICQoJy5wcm9maWxlLXNlbGVjdC1jb250YWluZXInKSkpO1xuXG5cdFx0Y29uc3QgcmVuZGVyID0gKHByb2ZpbGVFbGVtZW50OiBOZXdQcm9maWxlRWxlbWVudCwgY29weUZyb21PcHRpb25zOiAoSVNlbGVjdE9wdGlvbkl0ZW0gJiB7IGlkPzogc3RyaW5nOyBzb3VyY2U/OiBJVXNlckRhdGFQcm9maWxlIHwgVVJJIH0pW10pID0+IHtcblx0XHRcdGNvcHlGcm9tU2VsZWN0Qm94LnNldE9wdGlvbnMoY29weUZyb21PcHRpb25zKTtcblx0XHRcdGNvbnN0IGlkID0gcHJvZmlsZUVsZW1lbnQuY29weUZyb20gaW5zdGFuY2VvZiBVUkkgPyBwcm9maWxlRWxlbWVudC5jb3B5RnJvbS50b1N0cmluZygpIDogcHJvZmlsZUVsZW1lbnQuY29weUZyb20/LmlkO1xuXHRcdFx0Y29uc3QgaW5kZXggPSBpZFxuXHRcdFx0XHQ/IGNvcHlGcm9tT3B0aW9ucy5maW5kSW5kZXgob3B0aW9uID0+IG9wdGlvbi5pZCA9PT0gaWQpXG5cdFx0XHRcdDogMDtcblx0XHRcdGNvcHlGcm9tU2VsZWN0Qm94LnNlbGVjdChpbmRleCk7XG5cdFx0fTtcblxuXHRcdGNvbnN0IHRoYXQgPSB0aGlzO1xuXHRcdHJldHVybiB7XG5cdFx0XHRzZXQgZWxlbWVudChlbGVtZW50OiBQcm9maWxlVHJlZUVsZW1lbnQpIHtcblx0XHRcdFx0cHJvZmlsZUVsZW1lbnQgPSBlbGVtZW50O1xuXHRcdFx0XHRpZiAocHJvZmlsZUVsZW1lbnQucm9vdCBpbnN0YW5jZW9mIE5ld1Byb2ZpbGVFbGVtZW50KSB7XG5cdFx0XHRcdFx0Y29uc3QgbmV3UHJvZmlsZUVsZW1lbnQgPSBwcm9maWxlRWxlbWVudC5yb290O1xuXHRcdFx0XHRcdGxldCBjb3B5RnJvbU9wdGlvbnMgPSB0aGF0LmdldENvcHlGcm9tT3B0aW9ucyhuZXdQcm9maWxlRWxlbWVudCk7XG5cdFx0XHRcdFx0cmVuZGVyKG5ld1Byb2ZpbGVFbGVtZW50LCBjb3B5RnJvbU9wdGlvbnMpO1xuXHRcdFx0XHRcdGNvcHlGcm9tU2VsZWN0Qm94LnNldEVuYWJsZWQoIW5ld1Byb2ZpbGVFbGVtZW50LnByZXZpZXdQcm9maWxlICYmICFuZXdQcm9maWxlRWxlbWVudC5kaXNhYmxlZCk7XG5cdFx0XHRcdFx0ZWxlbWVudERpc3Bvc2FibGVzLmFkZChwcm9maWxlRWxlbWVudC5yb290Lm9uRGlkQ2hhbmdlKGUgPT4ge1xuXHRcdFx0XHRcdFx0aWYgKGUuY29weUZyb20gfHwgZS5jb3B5RnJvbUluZm8pIHtcblx0XHRcdFx0XHRcdFx0Y29weUZyb21PcHRpb25zID0gdGhhdC5nZXRDb3B5RnJvbU9wdGlvbnMobmV3UHJvZmlsZUVsZW1lbnQpO1xuXHRcdFx0XHRcdFx0XHRyZW5kZXIobmV3UHJvZmlsZUVsZW1lbnQsIGNvcHlGcm9tT3B0aW9ucyk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRpZiAoZS5wcmV2aWV3IHx8IGUuZGlzYWJsZWQpIHtcblx0XHRcdFx0XHRcdFx0Y29weUZyb21TZWxlY3RCb3guc2V0RW5hYmxlZCghbmV3UHJvZmlsZUVsZW1lbnQucHJldmlld1Byb2ZpbGUgJiYgIW5ld1Byb2ZpbGVFbGVtZW50LmRpc2FibGVkKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9KSk7XG5cdFx0XHRcdFx0ZWxlbWVudERpc3Bvc2FibGVzLmFkZChjb3B5RnJvbVNlbGVjdEJveC5vbkRpZFNlbGVjdChvcHRpb24gPT4ge1xuXHRcdFx0XHRcdFx0bmV3UHJvZmlsZUVsZW1lbnQuY29weUZyb20gPSBjb3B5RnJvbU9wdGlvbnNbb3B0aW9uLmluZGV4XS5zb3VyY2U7XG5cdFx0XHRcdFx0fSkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0ZGlzcG9zYWJsZXMsXG5cdFx0XHRlbGVtZW50RGlzcG9zYWJsZXNcblx0XHR9O1xuXHR9XG5cblx0c2V0VGVtcGxhdGVzKHRlbXBsYXRlczogcmVhZG9ubHkgSVByb2ZpbGVUZW1wbGF0ZUluZm9bXSk6IHZvaWQge1xuXHRcdHRoaXMudGVtcGxhdGVzID0gdGVtcGxhdGVzO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRDb3B5RnJvbU9wdGlvbnMocHJvZmlsZUVsZW1lbnQ6IE5ld1Byb2ZpbGVFbGVtZW50KTogKElTZWxlY3RPcHRpb25JdGVtICYgeyBpZD86IHN0cmluZzsgc291cmNlPzogSVVzZXJEYXRhUHJvZmlsZSB8IFVSSSB9KVtdIHtcblx0XHRjb25zdCBjb3B5RnJvbU9wdGlvbnM6IChJU2VsZWN0T3B0aW9uSXRlbSAmIHsgaWQ/OiBzdHJpbmc7IHNvdXJjZT86IElVc2VyRGF0YVByb2ZpbGUgfCBVUkkgfSlbXSA9IFtdO1xuXG5cdFx0Y29weUZyb21PcHRpb25zLnB1c2goeyB0ZXh0OiBsb2NhbGl6ZSgnZW1wdHkgcHJvZmlsZScsIFwiTm9uZVwiKSB9KTtcblx0XHRmb3IgKGNvbnN0IFtjb3B5RnJvbVRlbXBsYXRlLCBuYW1lXSBvZiBwcm9maWxlRWxlbWVudC5jb3B5RnJvbVRlbXBsYXRlcykge1xuXHRcdFx0aWYgKCF0aGlzLnRlbXBsYXRlcy5zb21lKHRlbXBsYXRlID0+IHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsKFVSSS5wYXJzZSh0ZW1wbGF0ZS51cmwpLCBjb3B5RnJvbVRlbXBsYXRlKSkpIHtcblx0XHRcdFx0Y29weUZyb21PcHRpb25zLnB1c2goeyB0ZXh0OiBgJHtuYW1lfSAoJHtiYXNlbmFtZShjb3B5RnJvbVRlbXBsYXRlKX0pYCwgaWQ6IGNvcHlGcm9tVGVtcGxhdGUudG9TdHJpbmcoKSwgc291cmNlOiBjb3B5RnJvbVRlbXBsYXRlIH0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICh0aGlzLnRlbXBsYXRlcy5sZW5ndGgpIHtcblx0XHRcdGNvcHlGcm9tT3B0aW9ucy5wdXNoKHsgLi4uU2VwYXJhdG9yU2VsZWN0T3B0aW9uLCBkZWNvcmF0b3JSaWdodDogbG9jYWxpemUoJ2Zyb20gdGVtcGxhdGVzJywgXCJQcm9maWxlIFRlbXBsYXRlc1wiKSB9KTtcblx0XHRcdGZvciAoY29uc3QgdGVtcGxhdGUgb2YgdGhpcy50ZW1wbGF0ZXMpIHtcblx0XHRcdFx0Y29weUZyb21PcHRpb25zLnB1c2goeyB0ZXh0OiB0ZW1wbGF0ZS5uYW1lLCBpZDogdGVtcGxhdGUudXJsLCBzb3VyY2U6IFVSSS5wYXJzZSh0ZW1wbGF0ZS51cmwpIH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRjb3B5RnJvbU9wdGlvbnMucHVzaCh7IC4uLlNlcGFyYXRvclNlbGVjdE9wdGlvbiwgZGVjb3JhdG9yUmlnaHQ6IGxvY2FsaXplKCdmcm9tIGV4aXN0aW5nIHByb2ZpbGVzJywgXCJFeGlzdGluZyBQcm9maWxlc1wiKSB9KTtcblx0XHRmb3IgKGNvbnN0IHByb2ZpbGUgb2YgdGhpcy51c2VyRGF0YVByb2ZpbGVzU2VydmljZS5wcm9maWxlcykge1xuXHRcdFx0aWYgKCFwcm9maWxlLmlzSW50ZXJuYWwpIHtcblx0XHRcdFx0Y29weUZyb21PcHRpb25zLnB1c2goeyB0ZXh0OiBwcm9maWxlLm5hbWUsIGlkOiBwcm9maWxlLmlkLCBzb3VyY2U6IHByb2ZpbGUgfSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBjb3B5RnJvbU9wdGlvbnM7XG5cdH1cbn1cblxuY2xhc3MgQ29udGVudHNQcm9maWxlUmVuZGVyZXIgZXh0ZW5kcyBQcm9maWxlUHJvcGVydHlSZW5kZXJlciB7XG5cblx0cmVhZG9ubHkgdGVtcGxhdGVJZDogUHJvZmlsZVByb3BlcnR5ID0gJ2NvbnRlbnRzJztcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUNvbnRlbnRIZWlnaHQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxQcm9maWxlVHJlZUVsZW1lbnQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUNvbnRlbnRIZWlnaHQgPSB0aGlzLl9vbkRpZENoYW5nZUNvbnRlbnRIZWlnaHQuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VTZWxlY3Rpb24gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx7IGVsZW1lbnQ6IFByb2ZpbGVUcmVlRWxlbWVudDsgc2VsZWN0ZWQ6IGJvb2xlYW4gfT4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlU2VsZWN0aW9uID0gdGhpcy5fb25EaWRDaGFuZ2VTZWxlY3Rpb24uZXZlbnQ7XG5cblx0cHJpdmF0ZSBwcm9maWxlc0NvbnRlbnRUcmVlOiBXb3JrYmVuY2hBc3luY0RhdGFUcmVlPEFic3RyYWN0VXNlckRhdGFQcm9maWxlRWxlbWVudCwgUHJvZmlsZUNvbnRlbnRUcmVlRWxlbWVudD4gfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlOiBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UsXG5cdFx0QElDb250ZXh0TWVudVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHRyZW5kZXJUZW1wbGF0ZShwYXJlbnQ6IEhUTUxFbGVtZW50KTogSVByb2ZpbGVQcm9wZXJ0eVJlbmRlcmVyVGVtcGxhdGUge1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IGVsZW1lbnREaXNwb3NhYmxlcyA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRcdGxldCBwcm9maWxlRWxlbWVudDogUHJvZmlsZVRyZWVFbGVtZW50IHwgdW5kZWZpbmVkO1xuXG5cdFx0Y29uc3QgY29uZmlndXJlUm93Q29udGFpbmVyID0gYXBwZW5kKHBhcmVudCwgJCgnLnByb2ZpbGUtcm93LWNvbnRhaW5lcicpKTtcblx0XHRhcHBlbmQoY29uZmlndXJlUm93Q29udGFpbmVyLCAkKCcucHJvZmlsZS1sYWJlbC1lbGVtZW50JywgdW5kZWZpbmVkLCBsb2NhbGl6ZSgnY29udGVudHMnLCBcIkNvbnRlbnRzXCIpKSk7XG5cdFx0Y29uc3QgY29udGVudHNEZXNjcmlwdGlvbkVsZW1lbnQgPSBhcHBlbmQoY29uZmlndXJlUm93Q29udGFpbmVyLCAkKCcucHJvZmlsZS1kZXNjcmlwdGlvbi1lbGVtZW50JykpO1xuXHRcdGNvbnN0IGNvbnRlbnRzVHJlZUhlYWRlciA9IGFwcGVuZChjb25maWd1cmVSb3dDb250YWluZXIsICQoJy5wcm9maWxlLWNvbnRlbnQtdHJlZS1oZWFkZXInKSk7XG5cdFx0Y29uc3Qgb3B0aW9uc0xhYmVsID0gJCgnLm9wdGlvbnMtaGVhZGVyJywgdW5kZWZpbmVkLCAkKCdzcGFuJywgdW5kZWZpbmVkLCBsb2NhbGl6ZSgnb3B0aW9ucycsIFwiU291cmNlXCIpKSk7XG5cdFx0YXBwZW5kKGNvbnRlbnRzVHJlZUhlYWRlcixcblx0XHRcdCQoJycpLFxuXHRcdFx0JCgnJywgdW5kZWZpbmVkLCBsb2NhbGl6ZSgnY29udGVudHMnLCBcIkNvbnRlbnRzXCIpKSxcblx0XHRcdG9wdGlvbnNMYWJlbCxcblx0XHRcdCQoJycpLFxuXHRcdCk7XG5cblx0XHRjb25zdCBkZWxlZ2F0ZSA9IG5ldyBQcm9maWxlQ29udGVudFRyZWVFbGVtZW50RGVsZWdhdGUoKTtcblx0XHRjb25zdCBwcm9maWxlc0NvbnRlbnRUcmVlID0gdGhpcy5wcm9maWxlc0NvbnRlbnRUcmVlID0gZGlzcG9zYWJsZXMuYWRkKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoV29ya2JlbmNoQXN5bmNEYXRhVHJlZTxBYnN0cmFjdFVzZXJEYXRhUHJvZmlsZUVsZW1lbnQsIFByb2ZpbGVDb250ZW50VHJlZUVsZW1lbnQ+LFxuXHRcdFx0J1Byb2ZpbGVFZGl0b3ItQ29udGVudHNUcmVlJyxcblx0XHRcdGFwcGVuZChjb25maWd1cmVSb3dDb250YWluZXIsICQoJy5wcm9maWxlLWNvbnRlbnQtdHJlZS5maWxlLWljb24tdGhlbWFibGUtdHJlZS5zaG93LWZpbGUtaWNvbnMnKSksXG5cdFx0XHRkZWxlZ2F0ZSxcblx0XHRcdFtcblx0XHRcdFx0dGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShFeGlzdGluZ1Byb2ZpbGVSZXNvdXJjZVRyZWVSZW5kZXJlciksXG5cdFx0XHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTmV3UHJvZmlsZVJlc291cmNlVHJlZVJlbmRlcmVyKSxcblx0XHRcdFx0dGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShQcm9maWxlUmVzb3VyY2VDaGlsZFRyZWVJdGVtUmVuZGVyZXIpLFxuXHRcdFx0XSxcblx0XHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUHJvZmlsZVJlc291cmNlVHJlZURhdGFTb3VyY2UpLFxuXHRcdFx0e1xuXHRcdFx0XHRtdWx0aXBsZVNlbGVjdGlvblN1cHBvcnQ6IGZhbHNlLFxuXHRcdFx0XHRob3Jpem9udGFsU2Nyb2xsaW5nOiBmYWxzZSxcblx0XHRcdFx0YWNjZXNzaWJpbGl0eVByb3ZpZGVyOiB7XG5cdFx0XHRcdFx0Z2V0QXJpYUxhYmVsKGVsZW1lbnQ6IFByb2ZpbGVDb250ZW50VHJlZUVsZW1lbnQgfCBudWxsKTogc3RyaW5nIHtcblx0XHRcdFx0XHRcdGlmICgoPElQcm9maWxlUmVzb3VyY2VUeXBlRWxlbWVudD5lbGVtZW50Py5lbGVtZW50KS5yZXNvdXJjZVR5cGUpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuICg8SVByb2ZpbGVSZXNvdXJjZVR5cGVFbGVtZW50PmVsZW1lbnQ/LmVsZW1lbnQpLnJlc291cmNlVHlwZTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGlmICgoPElQcm9maWxlUmVzb3VyY2VUeXBlQ2hpbGRFbGVtZW50PmVsZW1lbnQ/LmVsZW1lbnQpLmxhYmVsKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiAoPElQcm9maWxlUmVzb3VyY2VUeXBlQ2hpbGRFbGVtZW50PmVsZW1lbnQ/LmVsZW1lbnQpLmxhYmVsO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0cmV0dXJuICcnO1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0Z2V0V2lkZ2V0QXJpYUxhYmVsKCk6IHN0cmluZyB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gJyc7XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSxcblx0XHRcdFx0aWRlbnRpdHlQcm92aWRlcjoge1xuXHRcdFx0XHRcdGdldElkKGVsZW1lbnQpIHtcblx0XHRcdFx0XHRcdGlmIChlbGVtZW50Py5lbGVtZW50LmhhbmRsZSkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gZWxlbWVudC5lbGVtZW50LmhhbmRsZTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdHJldHVybiAnJztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGV4cGFuZE9ubHlPblR3aXN0aWVDbGljazogdHJ1ZSxcblx0XHRcdFx0cmVuZGVySW5kZW50R3VpZGVzOiBSZW5kZXJJbmRlbnRHdWlkZXMuTm9uZSxcblx0XHRcdFx0ZW5hYmxlU3RpY2t5U2Nyb2xsOiBmYWxzZSxcblx0XHRcdFx0b3Blbk9uU2luZ2xlQ2xpY2s6IGZhbHNlLFxuXHRcdFx0XHRhbHdheXNDb25zdW1lTW91c2VXaGVlbDogZmFsc2UsXG5cdFx0XHR9KSk7XG5cblx0XHR0aGlzLnByb2ZpbGVzQ29udGVudFRyZWUuc3R5bGUobGlzdFN0eWxlcyk7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHRoaXMucHJvZmlsZXNDb250ZW50VHJlZSA9IHVuZGVmaW5lZCkpO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRoaXMucHJvZmlsZXNDb250ZW50VHJlZS5vbkRpZENoYW5nZUNvbnRlbnRIZWlnaHQoaGVpZ2h0ID0+IHtcblx0XHRcdHRoaXMucHJvZmlsZXNDb250ZW50VHJlZT8ubGF5b3V0KGhlaWdodCk7XG5cdFx0XHRpZiAocHJvZmlsZUVsZW1lbnQpIHtcblx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VDb250ZW50SGVpZ2h0LmZpcmUocHJvZmlsZUVsZW1lbnQpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZCh0aGlzLnByb2ZpbGVzQ29udGVudFRyZWUub25EaWRDaGFuZ2VTZWxlY3Rpb24oKGUgPT4ge1xuXHRcdFx0aWYgKHByb2ZpbGVFbGVtZW50KSB7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlU2VsZWN0aW9uLmZpcmUoeyBlbGVtZW50OiBwcm9maWxlRWxlbWVudCwgc2VsZWN0ZWQ6ICEhZS5lbGVtZW50cy5sZW5ndGggfSk7XG5cdFx0XHR9XG5cdFx0fSkpKTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZCh0aGlzLnByb2ZpbGVzQ29udGVudFRyZWUub25EaWRPcGVuKGFzeW5jIChlKSA9PiB7XG5cdFx0XHRpZiAoIWUuYnJvd3NlckV2ZW50KSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGlmIChlLmVsZW1lbnQ/LmVsZW1lbnQub3BlbkFjdGlvbikge1xuXHRcdFx0XHRhd2FpdCBlLmVsZW1lbnQuZWxlbWVudC5vcGVuQWN0aW9uLnJ1bigpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZCh0aGlzLnByb2ZpbGVzQ29udGVudFRyZWUub25Db250ZXh0TWVudShhc3luYyAoZSkgPT4ge1xuXHRcdFx0aWYgKCFlLmVsZW1lbnQ/LmVsZW1lbnQuYWN0aW9ucz8uY29udGV4dE1lbnU/Lmxlbmd0aCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmNvbnRleHRNZW51U2VydmljZS5zaG93Q29udGV4dE1lbnUoe1xuXHRcdFx0XHRnZXRBbmNob3I6ICgpID0+IGUuYW5jaG9yLFxuXHRcdFx0XHRnZXRBY3Rpb25zOiAoKSA9PiBlLmVsZW1lbnQ/LmVsZW1lbnQ/LmFjdGlvbnM/LmNvbnRleHRNZW51ID8/IFtdLFxuXHRcdFx0XHRnZXRBY3Rpb25zQ29udGV4dDogKCkgPT4gZS5lbGVtZW50XG5cdFx0XHR9KTtcblx0XHR9KSk7XG5cblx0XHRjb25zdCB1cGRhdGVEZXNjcmlwdGlvbiA9IChlbGVtZW50OiBQcm9maWxlVHJlZUVsZW1lbnQpID0+IHtcblx0XHRcdGNsZWFyTm9kZShjb250ZW50c0Rlc2NyaXB0aW9uRWxlbWVudCk7XG5cblx0XHRcdGNvbnN0IG1hcmtkb3duID0gbmV3IE1hcmtkb3duU3RyaW5nKCk7XG5cdFx0XHRpZiAoZWxlbWVudC5yb290IGluc3RhbmNlb2YgVXNlckRhdGFQcm9maWxlRWxlbWVudCAmJiBlbGVtZW50LnJvb3QucHJvZmlsZS5pc0RlZmF1bHQpIHtcblx0XHRcdFx0bWFya2Rvd24uYXBwZW5kTWFya2Rvd24obG9jYWxpemUoJ2RlZmF1bHQgcHJvZmlsZSBjb250ZW50cyBkZXNjcmlwdGlvbicsIFwiQnJvd3NlIGNvbnRlbnRzIG9mIHRoaXMgcHJvZmlsZVxcblwiKSk7XG5cdFx0XHR9XG5cblx0XHRcdGVsc2Uge1xuXHRcdFx0XHRtYXJrZG93bi5hcHBlbmRNYXJrZG93bihsb2NhbGl6ZSgnY29udGVudHMgc291cmNlIGRlc2NyaXB0aW9uJywgXCJDb25maWd1cmUgc291cmNlIG9mIGNvbnRlbnRzIGZvciB0aGlzIHByb2ZpbGVcXG5cIikpO1xuXHRcdFx0XHRpZiAoZWxlbWVudC5yb290IGluc3RhbmNlb2YgTmV3UHJvZmlsZUVsZW1lbnQpIHtcblx0XHRcdFx0XHRjb25zdCBjb3B5RnJvbU5hbWUgPSBlbGVtZW50LnJvb3QuZ2V0Q29weUZyb21OYW1lKCk7XG5cdFx0XHRcdFx0Y29uc3Qgb3B0aW9uTmFtZSA9IGNvcHlGcm9tTmFtZSA9PT0gdGhpcy51c2VyRGF0YVByb2ZpbGVzU2VydmljZS5kZWZhdWx0UHJvZmlsZS5uYW1lXG5cdFx0XHRcdFx0XHQ/IGxvY2FsaXplKCdjb3B5IGZyb20gZGVmYXVsdCcsIFwiezB9IChDb3B5KVwiLCBjb3B5RnJvbU5hbWUpXG5cdFx0XHRcdFx0XHQ6IGNvcHlGcm9tTmFtZTtcblx0XHRcdFx0XHRpZiAob3B0aW9uTmFtZSkge1xuXHRcdFx0XHRcdFx0bWFya2Rvd25cblx0XHRcdFx0XHRcdFx0LmFwcGVuZE1hcmtkb3duKGxvY2FsaXplKCdjb3B5IGluZm8nLCBcIi0gKnswfToqIENvcHkgY29udGVudHMgZnJvbSB0aGUgezF9IHByb2ZpbGVcXG5cIiwgb3B0aW9uTmFtZSwgY29weUZyb21OYW1lKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdG1hcmtkb3duXG5cdFx0XHRcdFx0XHQuYXBwZW5kTWFya2Rvd24obG9jYWxpemUoJ2RlZmF1bHQgaW5mbycsIFwiLSAqRGVmYXVsdDoqIFVzZSBjb250ZW50cyBmcm9tIHRoZSBEZWZhdWx0IHByb2ZpbGVcXG5cIikpXG5cdFx0XHRcdFx0XHQuYXBwZW5kTWFya2Rvd24obG9jYWxpemUoJ25vbmUgaW5mbycsIFwiLSAqTm9uZToqIENyZWF0ZSBlbXB0eSBjb250ZW50c1xcblwiKSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0YXBwZW5kKGNvbnRlbnRzRGVzY3JpcHRpb25FbGVtZW50LCBlbGVtZW50RGlzcG9zYWJsZXMuYWRkKHJlbmRlck1hcmtkb3duKG1hcmtkb3duKSkuZWxlbWVudCk7XG5cdFx0fTtcblxuXHRcdGNvbnN0IHRoYXQgPSB0aGlzO1xuXHRcdHJldHVybiB7XG5cdFx0XHRzZXQgZWxlbWVudChlbGVtZW50OiBQcm9maWxlVHJlZUVsZW1lbnQpIHtcblx0XHRcdFx0cHJvZmlsZUVsZW1lbnQgPSBlbGVtZW50O1xuXHRcdFx0XHR1cGRhdGVEZXNjcmlwdGlvbihlbGVtZW50KTtcblx0XHRcdFx0aWYgKGVsZW1lbnQucm9vdCBpbnN0YW5jZW9mIE5ld1Byb2ZpbGVFbGVtZW50KSB7XG5cdFx0XHRcdFx0Y29udGVudHNUcmVlSGVhZGVyLmNsYXNzTGlzdC5yZW1vdmUoJ2RlZmF1bHQtcHJvZmlsZScpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKGVsZW1lbnQucm9vdCBpbnN0YW5jZW9mIFVzZXJEYXRhUHJvZmlsZUVsZW1lbnQpIHtcblx0XHRcdFx0XHRjb250ZW50c1RyZWVIZWFkZXIuY2xhc3NMaXN0LnRvZ2dsZSgnZGVmYXVsdC1wcm9maWxlJywgZWxlbWVudC5yb290LnByb2ZpbGUuaXNEZWZhdWx0KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRwcm9maWxlc0NvbnRlbnRUcmVlLnNldElucHV0KHByb2ZpbGVFbGVtZW50LnJvb3QpO1xuXHRcdFx0XHRlbGVtZW50RGlzcG9zYWJsZXMuYWRkKHByb2ZpbGVFbGVtZW50LnJvb3Qub25EaWRDaGFuZ2UoZSA9PiB7XG5cdFx0XHRcdFx0aWYgKGUuY29weUZyb20gfHwgZS5jb3B5RmxhZ3MgfHwgZS5mbGFncyB8fCBlLmV4dGVuc2lvbnMgfHwgZS5zbmlwcGV0cyB8fCBlLnByZXZpZXcpIHtcblx0XHRcdFx0XHRcdHByb2ZpbGVzQ29udGVudFRyZWUudXBkYXRlQ2hpbGRyZW4oZWxlbWVudC5yb290KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKGUuY29weUZyb21JbmZvKSB7XG5cdFx0XHRcdFx0XHR1cGRhdGVEZXNjcmlwdGlvbihlbGVtZW50KTtcblx0XHRcdFx0XHRcdHRoYXQuX29uRGlkQ2hhbmdlQ29udGVudEhlaWdodC5maXJlKGVsZW1lbnQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSkpO1xuXHRcdFx0fSxcblx0XHRcdGRpc3Bvc2FibGVzLFxuXHRcdFx0ZWxlbWVudERpc3Bvc2FibGVzXG5cdFx0fTtcblx0fVxuXG5cdGNsZWFyU2VsZWN0aW9uKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLnByb2ZpbGVzQ29udGVudFRyZWUpIHtcblx0XHRcdHRoaXMucHJvZmlsZXNDb250ZW50VHJlZS5zZXRTZWxlY3Rpb24oW10pO1xuXHRcdFx0dGhpcy5wcm9maWxlc0NvbnRlbnRUcmVlLnNldEZvY3VzKFtdKTtcblx0XHR9XG5cdH1cbn1cblxuaW50ZXJmYWNlIFdvcmtzcGFjZVRhYmxlRWxlbWVudCB7XG5cdHJlYWRvbmx5IHdvcmtzcGFjZTogVVJJO1xuXHRyZWFkb25seSBwcm9maWxlRWxlbWVudDogVXNlckRhdGFQcm9maWxlRWxlbWVudDtcbn1cblxuY2xhc3MgUHJvZmlsZVdvcmtzcGFjZXNSZW5kZXJlciBleHRlbmRzIFByb2ZpbGVQcm9wZXJ0eVJlbmRlcmVyIHtcblxuXHRyZWFkb25seSB0ZW1wbGF0ZUlkOiBQcm9maWxlUHJvcGVydHkgPSAnd29ya3NwYWNlcyc7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VDb250ZW50SGVpZ2h0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8UHJvZmlsZVRyZWVFbGVtZW50PigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VDb250ZW50SGVpZ2h0ID0gdGhpcy5fb25EaWRDaGFuZ2VDb250ZW50SGVpZ2h0LmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlU2VsZWN0aW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8eyBlbGVtZW50OiBQcm9maWxlVHJlZUVsZW1lbnQ7IHNlbGVjdGVkOiBib29sZWFuIH0+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVNlbGVjdGlvbiA9IHRoaXMuX29uRGlkQ2hhbmdlU2VsZWN0aW9uLmV2ZW50O1xuXG5cdHByaXZhdGUgd29ya3NwYWNlc1RhYmxlOiBXb3JrYmVuY2hUYWJsZTxXb3Jrc3BhY2VUYWJsZUVsZW1lbnQ+IHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJTGFiZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGFiZWxTZXJ2aWNlOiBJTGFiZWxTZXJ2aWNlLFxuXHRcdEBJVXJpSWRlbnRpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXJpSWRlbnRpdHlTZXJ2aWNlOiBJVXJpSWRlbnRpdHlTZXJ2aWNlLFxuXHRcdEBJRmlsZURpYWxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBmaWxlRGlhbG9nU2VydmljZTogSUZpbGVEaWFsb2dTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0cmVuZGVyVGVtcGxhdGUocGFyZW50OiBIVE1MRWxlbWVudCk6IElQcm9maWxlUHJvcGVydHlSZW5kZXJlclRlbXBsYXRlIHtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBlbGVtZW50RGlzcG9zYWJsZXMgPSBkaXNwb3NhYmxlcy5hZGQobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0XHRsZXQgcHJvZmlsZUVsZW1lbnQ6IFByb2ZpbGVUcmVlRWxlbWVudCB8IHVuZGVmaW5lZDtcblxuXHRcdGNvbnN0IHByb2ZpbGVXb3Jrc3BhY2VzUm93Q29udGFpbmVyID0gYXBwZW5kKHBhcmVudCwgJCgnLnByb2ZpbGUtcm93LWNvbnRhaW5lcicpKTtcblx0XHRhcHBlbmQocHJvZmlsZVdvcmtzcGFjZXNSb3dDb250YWluZXIsICQoJy5wcm9maWxlLWxhYmVsLWVsZW1lbnQnLCB1bmRlZmluZWQsIGxvY2FsaXplKCdmb2xkZXJzX3dvcmtzcGFjZXMnLCBcIkZvbGRlcnMgJiBXb3Jrc3BhY2VzXCIpKSk7XG5cdFx0Y29uc3QgcHJvZmlsZVdvcmtzcGFjZXNEZXNjcmlwdGlvbkVsZW1lbnQgPSBhcHBlbmQocHJvZmlsZVdvcmtzcGFjZXNSb3dDb250YWluZXIsICQoJy5wcm9maWxlLWRlc2NyaXB0aW9uLWVsZW1lbnQnKSk7XG5cblx0XHRjb25zdCB3b3Jrc3BhY2VzVGFibGVDb250YWluZXIgPSBhcHBlbmQocHJvZmlsZVdvcmtzcGFjZXNSb3dDb250YWluZXIsICQoJy5wcm9maWxlLWFzc29jaWF0aW9ucy10YWJsZScpKTtcblx0XHRjb25zdCB0YWJsZSA9IHRoaXMud29ya3NwYWNlc1RhYmxlID0gZGlzcG9zYWJsZXMuYWRkKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoV29ya2JlbmNoVGFibGU8V29ya3NwYWNlVGFibGVFbGVtZW50Pixcblx0XHRcdCdQcm9maWxlRWRpdG9yLUFzc29jaWF0aW9uc1RhYmxlJyxcblx0XHRcdHdvcmtzcGFjZXNUYWJsZUNvbnRhaW5lcixcblx0XHRcdG5ldyBjbGFzcyBpbXBsZW1lbnRzIElUYWJsZVZpcnR1YWxEZWxlZ2F0ZTxVUkk+IHtcblx0XHRcdFx0cmVhZG9ubHkgaGVhZGVyUm93SGVpZ2h0ID0gMzA7XG5cdFx0XHRcdGdldEhlaWdodCgpIHsgcmV0dXJuIDI0OyB9XG5cdFx0XHR9LFxuXHRcdFx0W1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0bGFiZWw6ICcnLFxuXHRcdFx0XHRcdHRvb2x0aXA6ICcnLFxuXHRcdFx0XHRcdHdlaWdodDogMSxcblx0XHRcdFx0XHRtaW5pbXVtV2lkdGg6IDMwLFxuXHRcdFx0XHRcdG1heGltdW1XaWR0aDogMzAsXG5cdFx0XHRcdFx0dGVtcGxhdGVJZDogV29ya3NwYWNlVXJpRW1wdHlDb2x1bW5SZW5kZXJlci5URU1QTEFURV9JRCxcblx0XHRcdFx0XHRwcm9qZWN0KHJvdzogV29ya3NwYWNlVGFibGVFbGVtZW50KTogV29ya3NwYWNlVGFibGVFbGVtZW50IHsgcmV0dXJuIHJvdzsgfSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnaG9zdENvbHVtbkxhYmVsJywgXCJIb3N0XCIpLFxuXHRcdFx0XHRcdHRvb2x0aXA6ICcnLFxuXHRcdFx0XHRcdHdlaWdodDogMixcblx0XHRcdFx0XHR0ZW1wbGF0ZUlkOiBXb3Jrc3BhY2VVcmlIb3N0Q29sdW1uUmVuZGVyZXIuVEVNUExBVEVfSUQsXG5cdFx0XHRcdFx0cHJvamVjdChyb3c6IFdvcmtzcGFjZVRhYmxlRWxlbWVudCk6IFdvcmtzcGFjZVRhYmxlRWxlbWVudCB7IHJldHVybiByb3c7IH0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ3BhdGhDb2x1bW5MYWJlbCcsIFwiUGF0aFwiKSxcblx0XHRcdFx0XHR0b29sdGlwOiAnJyxcblx0XHRcdFx0XHR3ZWlnaHQ6IDcsXG5cdFx0XHRcdFx0dGVtcGxhdGVJZDogV29ya3NwYWNlVXJpUGF0aENvbHVtblJlbmRlcmVyLlRFTVBMQVRFX0lELFxuXHRcdFx0XHRcdHByb2plY3Qocm93OiBXb3Jrc3BhY2VUYWJsZUVsZW1lbnQpOiBXb3Jrc3BhY2VUYWJsZUVsZW1lbnQgeyByZXR1cm4gcm93OyB9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRsYWJlbDogJycsXG5cdFx0XHRcdFx0dG9vbHRpcDogJycsXG5cdFx0XHRcdFx0d2VpZ2h0OiAxLFxuXHRcdFx0XHRcdG1pbmltdW1XaWR0aDogODQsXG5cdFx0XHRcdFx0bWF4aW11bVdpZHRoOiA4NCxcblx0XHRcdFx0XHR0ZW1wbGF0ZUlkOiBXb3Jrc3BhY2VVcmlBY3Rpb25zQ29sdW1uUmVuZGVyZXIuVEVNUExBVEVfSUQsXG5cdFx0XHRcdFx0cHJvamVjdChyb3c6IFdvcmtzcGFjZVRhYmxlRWxlbWVudCk6IFdvcmtzcGFjZVRhYmxlRWxlbWVudCB7IHJldHVybiByb3c7IH1cblx0XHRcdFx0fSxcblx0XHRcdF0sXG5cdFx0XHRbXG5cdFx0XHRcdG5ldyBXb3Jrc3BhY2VVcmlFbXB0eUNvbHVtblJlbmRlcmVyKCksXG5cdFx0XHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoV29ya3NwYWNlVXJpSG9zdENvbHVtblJlbmRlcmVyKSxcblx0XHRcdFx0dGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShXb3Jrc3BhY2VVcmlQYXRoQ29sdW1uUmVuZGVyZXIpLFxuXHRcdFx0XHR0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFdvcmtzcGFjZVVyaUFjdGlvbnNDb2x1bW5SZW5kZXJlciksXG5cdFx0XHRdLFxuXHRcdFx0e1xuXHRcdFx0XHRob3Jpem9udGFsU2Nyb2xsaW5nOiBmYWxzZSxcblx0XHRcdFx0YWx3YXlzQ29uc3VtZU1vdXNlV2hlZWw6IGZhbHNlLFxuXHRcdFx0XHRvcGVuT25TaW5nbGVDbGljazogZmFsc2UsXG5cdFx0XHRcdG11bHRpcGxlU2VsZWN0aW9uU3VwcG9ydDogZmFsc2UsXG5cdFx0XHRcdGFjY2Vzc2liaWxpdHlQcm92aWRlcjoge1xuXHRcdFx0XHRcdGdldEFyaWFMYWJlbDogKGl0ZW06IFdvcmtzcGFjZVRhYmxlRWxlbWVudCkgPT4ge1xuXHRcdFx0XHRcdFx0Y29uc3QgaG9zdExhYmVsID0gZ2V0SG9zdExhYmVsKHRoaXMubGFiZWxTZXJ2aWNlLCBpdGVtLndvcmtzcGFjZSk7XG5cdFx0XHRcdFx0XHRpZiAoaG9zdExhYmVsID09PSB1bmRlZmluZWQgfHwgaG9zdExhYmVsLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gbG9jYWxpemUoJ3RydXN0ZWRGb2xkZXJBcmlhTGFiZWwnLCBcInswfSwgdHJ1c3RlZFwiLCB0aGlzLmxhYmVsU2VydmljZS5nZXRVcmlMYWJlbChpdGVtLndvcmtzcGFjZSkpO1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRyZXR1cm4gbG9jYWxpemUoJ3RydXN0ZWRGb2xkZXJXaXRoSG9zdEFyaWFMYWJlbCcsIFwiezB9IG9uIHsxfSwgdHJ1c3RlZFwiLCB0aGlzLmxhYmVsU2VydmljZS5nZXRVcmlMYWJlbChpdGVtLndvcmtzcGFjZSksIGhvc3RMYWJlbCk7XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRnZXRXaWRnZXRBcmlhTGFiZWw6ICgpID0+IGxvY2FsaXplKCd0cnVzdGVkRm9sZGVyc0FuZFdvcmtzcGFjZXMnLCBcIlRydXN0ZWQgRm9sZGVycyAmIFdvcmtzcGFjZXNcIilcblx0XHRcdFx0fSxcblx0XHRcdFx0aWRlbnRpdHlQcm92aWRlcjoge1xuXHRcdFx0XHRcdGdldElkKGVsZW1lbnQ6IFdvcmtzcGFjZVRhYmxlRWxlbWVudCkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIGVsZW1lbnQud29ya3NwYWNlLnRvU3RyaW5nKCk7XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdHRoaXMud29ya3NwYWNlc1RhYmxlLnN0eWxlKGxpc3RTdHlsZXMpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gdGhpcy53b3Jrc3BhY2VzVGFibGUgPSB1bmRlZmluZWQpKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodGhpcy53b3Jrc3BhY2VzVGFibGUub25EaWRDaGFuZ2VTZWxlY3Rpb24oKGUgPT4ge1xuXHRcdFx0aWYgKHByb2ZpbGVFbGVtZW50KSB7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlU2VsZWN0aW9uLmZpcmUoeyBlbGVtZW50OiBwcm9maWxlRWxlbWVudCwgc2VsZWN0ZWQ6ICEhZS5lbGVtZW50cy5sZW5ndGggfSk7XG5cdFx0XHR9XG5cdFx0fSkpKTtcblxuXHRcdGNvbnN0IGFkZEJ1dHRvbkJhckVsZW1lbnQgPSBhcHBlbmQocHJvZmlsZVdvcmtzcGFjZXNSb3dDb250YWluZXIsICQoJy5wcm9maWxlLXdvcmtzcGFjZXMtYnV0dG9uLWNvbnRhaW5lcicpKTtcblx0XHRjb25zdCBidXR0b25CYXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEJ1dHRvbkJhcihhZGRCdXR0b25CYXJFbGVtZW50KSk7XG5cdFx0Y29uc3QgYWRkQnV0dG9uID0gdGhpcy5fcmVnaXN0ZXIoYnV0dG9uQmFyLmFkZEJ1dHRvbih7IHRpdGxlOiBsb2NhbGl6ZSgnYWRkQnV0dG9uJywgXCJBZGQgRm9sZGVyXCIpLCAuLi5kZWZhdWx0QnV0dG9uU3R5bGVzIH0pKTtcblx0XHRhZGRCdXR0b24ubGFiZWwgPSBsb2NhbGl6ZSgnYWRkQnV0dG9uJywgXCJBZGQgRm9sZGVyXCIpO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGFkZEJ1dHRvbi5vbkRpZENsaWNrKGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHVyaXMgPSBhd2FpdCB0aGlzLmZpbGVEaWFsb2dTZXJ2aWNlLnNob3dPcGVuRGlhbG9nKHtcblx0XHRcdFx0Y2FuU2VsZWN0RmlsZXM6IGZhbHNlLFxuXHRcdFx0XHRjYW5TZWxlY3RGb2xkZXJzOiB0cnVlLFxuXHRcdFx0XHRjYW5TZWxlY3RNYW55OiB0cnVlLFxuXHRcdFx0XHRvcGVuTGFiZWw6IGxvY2FsaXplKCdhZGRGb2xkZXInLCBcIkFkZCBGb2xkZXJcIiksXG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnYWRkRm9sZGVyVGl0bGUnLCBcIlNlbGVjdCBGb2xkZXJzIFRvIEFkZFwiKVxuXHRcdFx0fSk7XG5cdFx0XHRpZiAodXJpcykge1xuXHRcdFx0XHRpZiAocHJvZmlsZUVsZW1lbnQ/LnJvb3QgaW5zdGFuY2VvZiBVc2VyRGF0YVByb2ZpbGVFbGVtZW50KSB7XG5cdFx0XHRcdFx0cHJvZmlsZUVsZW1lbnQucm9vdC51cGRhdGVXb3Jrc3BhY2VzKHVyaXMsIFtdKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZCh0YWJsZS5vbkRpZE9wZW4oaXRlbSA9PiB7XG5cdFx0XHRpZiAoaXRlbT8uZWxlbWVudCkge1xuXHRcdFx0XHRpdGVtLmVsZW1lbnQucHJvZmlsZUVsZW1lbnQub3BlbldvcmtzcGFjZShpdGVtLmVsZW1lbnQud29ya3NwYWNlKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRjb25zdCB1cGRhdGVUYWJsZSA9ICgpID0+IHtcblx0XHRcdGlmIChwcm9maWxlRWxlbWVudD8ucm9vdCBpbnN0YW5jZW9mIFVzZXJEYXRhUHJvZmlsZUVsZW1lbnQgJiYgcHJvZmlsZUVsZW1lbnQucm9vdC53b3Jrc3BhY2VzPy5sZW5ndGgpIHtcblx0XHRcdFx0cHJvZmlsZVdvcmtzcGFjZXNEZXNjcmlwdGlvbkVsZW1lbnQudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnZm9sZGVyc193b3Jrc3BhY2VzX2Rlc2NyaXB0aW9uJywgXCJGb2xsb3dpbmcgZm9sZGVycyBhbmQgd29ya3NwYWNlcyBhcmUgdXNpbmcgdGhpcyBwcm9maWxlXCIpO1xuXHRcdFx0XHR3b3Jrc3BhY2VzVGFibGVDb250YWluZXIuY2xhc3NMaXN0LnJlbW92ZSgnaGlkZScpO1xuXHRcdFx0XHR0YWJsZS5zcGxpY2UoMCwgdGFibGUubGVuZ3RoLCBwcm9maWxlRWxlbWVudC5yb290LndvcmtzcGFjZXNcblx0XHRcdFx0XHQubWFwKHdvcmtzcGFjZSA9PiAoeyB3b3Jrc3BhY2UsIHByb2ZpbGVFbGVtZW50OiA8VXNlckRhdGFQcm9maWxlRWxlbWVudD5wcm9maWxlRWxlbWVudCEucm9vdCB9KSlcblx0XHRcdFx0XHQuc29ydCgoYSwgYikgPT4gdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmNvbXBhcmUoYS53b3Jrc3BhY2UsIGIud29ya3NwYWNlKSlcblx0XHRcdFx0KTtcblx0XHRcdFx0dGhpcy5sYXlvdXQoKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHByb2ZpbGVXb3Jrc3BhY2VzRGVzY3JpcHRpb25FbGVtZW50LnRleHRDb250ZW50ID0gbG9jYWxpemUoJ25vX2ZvbGRlcl9kZXNjcmlwdGlvbicsIFwiTm8gZm9sZGVycyBvciB3b3Jrc3BhY2VzIGFyZSB1c2luZyB0aGlzIHByb2ZpbGVcIik7XG5cdFx0XHRcdHdvcmtzcGFjZXNUYWJsZUNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdoaWRlJyk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGNvbnN0IHRoYXQgPSB0aGlzO1xuXHRcdHJldHVybiB7XG5cdFx0XHRzZXQgZWxlbWVudChlbGVtZW50OiBQcm9maWxlVHJlZUVsZW1lbnQpIHtcblx0XHRcdFx0cHJvZmlsZUVsZW1lbnQgPSBlbGVtZW50O1xuXHRcdFx0XHRpZiAoZWxlbWVudC5yb290IGluc3RhbmNlb2YgVXNlckRhdGFQcm9maWxlRWxlbWVudCkge1xuXHRcdFx0XHRcdHVwZGF0ZVRhYmxlKCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0ZWxlbWVudERpc3Bvc2FibGVzLmFkZChwcm9maWxlRWxlbWVudC5yb290Lm9uRGlkQ2hhbmdlKGUgPT4ge1xuXHRcdFx0XHRcdGlmIChwcm9maWxlRWxlbWVudCAmJiBlLndvcmtzcGFjZXMpIHtcblx0XHRcdFx0XHRcdHVwZGF0ZVRhYmxlKCk7XG5cdFx0XHRcdFx0XHR0aGF0Ll9vbkRpZENoYW5nZUNvbnRlbnRIZWlnaHQuZmlyZShwcm9maWxlRWxlbWVudCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KSk7XG5cdFx0XHR9LFxuXHRcdFx0ZGlzcG9zYWJsZXMsXG5cdFx0XHRlbGVtZW50RGlzcG9zYWJsZXNcblx0XHR9O1xuXHR9XG5cblx0bGF5b3V0KCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLndvcmtzcGFjZXNUYWJsZSkge1xuXHRcdFx0dGhpcy53b3Jrc3BhY2VzVGFibGUubGF5b3V0KCh0aGlzLndvcmtzcGFjZXNUYWJsZS5sZW5ndGggKiAyNCkgKyAzMCwgdW5kZWZpbmVkKTtcblx0XHR9XG5cdH1cblxuXHRjbGVhclNlbGVjdGlvbigpOiB2b2lkIHtcblx0XHRpZiAodGhpcy53b3Jrc3BhY2VzVGFibGUpIHtcblx0XHRcdHRoaXMud29ya3NwYWNlc1RhYmxlLnNldFNlbGVjdGlvbihbXSk7XG5cdFx0XHR0aGlzLndvcmtzcGFjZXNUYWJsZS5zZXRGb2N1cyhbXSk7XG5cdFx0fVxuXHR9XG59XG5cbmNsYXNzIEV4aXN0aW5nUHJvZmlsZVJlc291cmNlVHJlZVJlbmRlcmVyIGV4dGVuZHMgQWJzdHJhY3RQcm9maWxlUmVzb3VyY2VUcmVlUmVuZGVyZXIgaW1wbGVtZW50cyBJVHJlZVJlbmRlcmVyPFByb2ZpbGVDb250ZW50VHJlZUVsZW1lbnQsIHZvaWQsIElFeGlzdGluZ1Byb2ZpbGVSZXNvdXJjZVRlbXBsYXRlRGF0YT4ge1xuXG5cdHN0YXRpYyByZWFkb25seSBURU1QTEFURV9JRCA9ICdFeGlzdGluZ1Byb2ZpbGVSZXNvdXJjZVRlbXBsYXRlJztcblxuXHRyZWFkb25seSB0ZW1wbGF0ZUlkID0gRXhpc3RpbmdQcm9maWxlUmVzb3VyY2VUcmVlUmVuZGVyZXIuVEVNUExBVEVfSUQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHRyZW5kZXJUZW1wbGF0ZShwYXJlbnQ6IEhUTUxFbGVtZW50KTogSUV4aXN0aW5nUHJvZmlsZVJlc291cmNlVGVtcGxhdGVEYXRhIHtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBjb250YWluZXIgPSBhcHBlbmQocGFyZW50LCAkKCcucHJvZmlsZS10cmVlLWl0ZW0tY29udGFpbmVyLmV4aXN0aW5nLXByb2ZpbGUtcmVzb3VyY2UtdHlwZS1jb250YWluZXInKSk7XG5cdFx0Y29uc3QgbGFiZWwgPSBhcHBlbmQoY29udGFpbmVyLCAkKCcucHJvZmlsZS1yZXNvdXJjZS10eXBlLWxhYmVsJykpO1xuXG5cdFx0Y29uc3QgcmFkaW8gPSBkaXNwb3NhYmxlcy5hZGQobmV3IFJhZGlvKHsgaXRlbXM6IFtdIH0pKTtcblx0XHRhcHBlbmQoYXBwZW5kKGNvbnRhaW5lciwgJCgnLnByb2ZpbGUtcmVzb3VyY2Utb3B0aW9ucy1jb250YWluZXInKSksIHJhZGlvLmRvbU5vZGUpO1xuXG5cdFx0Y29uc3QgYWN0aW9uc0NvbnRhaW5lciA9IGFwcGVuZChjb250YWluZXIsICQoJy5wcm9maWxlLXJlc291cmNlLWFjdGlvbnMtY29udGFpbmVyJykpO1xuXHRcdGNvbnN0IGFjdGlvbkJhciA9IGRpc3Bvc2FibGVzLmFkZCh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFdvcmtiZW5jaFRvb2xCYXIsXG5cdFx0XHRhY3Rpb25zQ29udGFpbmVyLFxuXHRcdFx0e1xuXHRcdFx0XHRob3ZlckRlbGVnYXRlOiBkaXNwb3NhYmxlcy5hZGQoY3JlYXRlSW5zdGFudEhvdmVyRGVsZWdhdGUoKSksXG5cdFx0XHRcdGhpZ2hsaWdodFRvZ2dsZWRJdGVtczogdHJ1ZVxuXHRcdFx0fVxuXHRcdCkpO1xuXG5cdFx0cmV0dXJuIHsgbGFiZWwsIHJhZGlvLCBhY3Rpb25CYXIsIGRpc3Bvc2FibGVzLCBlbGVtZW50RGlzcG9zYWJsZXM6IGRpc3Bvc2FibGVzLmFkZChuZXcgRGlzcG9zYWJsZVN0b3JlKCkpIH07XG5cdH1cblxuXHRyZW5kZXJFbGVtZW50KHsgZWxlbWVudDogcHJvZmlsZVJlc291cmNlVHJlZUVsZW1lbnQgfTogSVRyZWVOb2RlPFByb2ZpbGVDb250ZW50VHJlZUVsZW1lbnQsIHZvaWQ+LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElFeGlzdGluZ1Byb2ZpbGVSZXNvdXJjZVRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS5lbGVtZW50RGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHRjb25zdCB7IGVsZW1lbnQsIHJvb3QgfSA9IHByb2ZpbGVSZXNvdXJjZVRyZWVFbGVtZW50O1xuXHRcdGlmICghKHJvb3QgaW5zdGFuY2VvZiBVc2VyRGF0YVByb2ZpbGVFbGVtZW50KSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdFeGlzdGluZ1Byb2ZpbGVSZXNvdXJjZVRyZWVSZW5kZXJlciBjYW4gb25seSByZW5kZXIgZXhpc3RpbmcgcHJvZmlsZSBlbGVtZW50Jyk7XG5cdFx0fVxuXHRcdGlmIChpc1N0cmluZyhlbGVtZW50KSB8fCAhaXNQcm9maWxlUmVzb3VyY2VUeXBlRWxlbWVudChlbGVtZW50KSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIHByb2ZpbGUgcmVzb3VyY2UgZWxlbWVudCcpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHVwZGF0ZVJhZGlvSXRlbXMgPSAoKSA9PiB7XG5cdFx0XHR0ZW1wbGF0ZURhdGEucmFkaW8uc2V0SXRlbXMoW3tcblx0XHRcdFx0dGV4dDogbG9jYWxpemUoJ2RlZmF1bHQnLCBcIkRlZmF1bHRcIiksXG5cdFx0XHRcdHRvb2x0aXA6IGxvY2FsaXplKCdkZWZhdWx0IGRlc2NyaXB0aW9uJywgXCJVc2UgezB9IGZyb20gdGhlIERlZmF1bHQgcHJvZmlsZVwiLCByZXNvdXJjZVR5cGVUaXRsZSksXG5cdFx0XHRcdGlzQWN0aXZlOiByb290LmdldEZsYWcoZWxlbWVudC5yZXNvdXJjZVR5cGUpXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHR0ZXh0OiByb290Lm5hbWUsXG5cdFx0XHRcdHRvb2x0aXA6IGxvY2FsaXplKCdjdXJyZW50IGRlc2NyaXB0aW9uJywgXCJVc2UgezB9IGZyb20gdGhlIHsxfSBwcm9maWxlXCIsIHJlc291cmNlVHlwZVRpdGxlLCByb290Lm5hbWUpLFxuXHRcdFx0XHRpc0FjdGl2ZTogIXJvb3QuZ2V0RmxhZyhlbGVtZW50LnJlc291cmNlVHlwZSlcblx0XHRcdH1dKTtcblx0XHR9O1xuXG5cdFx0Y29uc3QgcmVzb3VyY2VUeXBlVGl0bGUgPSB0aGlzLmdldFJlc291cmNlVHlwZVRpdGxlKGVsZW1lbnQucmVzb3VyY2VUeXBlKTtcblx0XHR0ZW1wbGF0ZURhdGEubGFiZWwudGV4dENvbnRlbnQgPSByZXNvdXJjZVR5cGVUaXRsZTtcblxuXHRcdGlmIChyb290IGluc3RhbmNlb2YgVXNlckRhdGFQcm9maWxlRWxlbWVudCAmJiByb290LnByb2ZpbGUuaXNEZWZhdWx0KSB7XG5cdFx0XHR0ZW1wbGF0ZURhdGEucmFkaW8uZG9tTm9kZS5jbGFzc0xpc3QuYWRkKCdoaWRlJyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRlbXBsYXRlRGF0YS5yYWRpby5kb21Ob2RlLmNsYXNzTGlzdC5yZW1vdmUoJ2hpZGUnKTtcblx0XHRcdHVwZGF0ZVJhZGlvSXRlbXMoKTtcblx0XHRcdHRlbXBsYXRlRGF0YS5lbGVtZW50RGlzcG9zYWJsZXMuYWRkKHJvb3Qub25EaWRDaGFuZ2UoZSA9PiB7XG5cdFx0XHRcdGlmIChlLm5hbWUpIHtcblx0XHRcdFx0XHR1cGRhdGVSYWRpb0l0ZW1zKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHRcdHRlbXBsYXRlRGF0YS5lbGVtZW50RGlzcG9zYWJsZXMuYWRkKHRlbXBsYXRlRGF0YS5yYWRpby5vbkRpZFNlbGVjdCgoaW5kZXgpID0+IHJvb3Quc2V0RmxhZyhlbGVtZW50LnJlc291cmNlVHlwZSwgaW5kZXggPT09IDApKSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgYWN0aW9uczogSUFjdGlvbltdID0gW107XG5cdFx0aWYgKGVsZW1lbnQub3BlbkFjdGlvbikge1xuXHRcdFx0YWN0aW9ucy5wdXNoKGVsZW1lbnQub3BlbkFjdGlvbik7XG5cdFx0fVxuXHRcdGlmIChlbGVtZW50LmFjdGlvbnM/LnByaW1hcnkpIHtcblx0XHRcdGFjdGlvbnMucHVzaCguLi5lbGVtZW50LmFjdGlvbnMucHJpbWFyeSk7XG5cdFx0fVxuXHRcdHRlbXBsYXRlRGF0YS5hY3Rpb25CYXIuc2V0QWN0aW9ucyhhY3Rpb25zKTtcblx0fVxuXG59XG5cbmNsYXNzIE5ld1Byb2ZpbGVSZXNvdXJjZVRyZWVSZW5kZXJlciBleHRlbmRzIEFic3RyYWN0UHJvZmlsZVJlc291cmNlVHJlZVJlbmRlcmVyIGltcGxlbWVudHMgSVRyZWVSZW5kZXJlcjxQcm9maWxlQ29udGVudFRyZWVFbGVtZW50LCB2b2lkLCBJTmV3UHJvZmlsZVJlc291cmNlVGVtcGxhdGVEYXRhPiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IFRFTVBMQVRFX0lEID0gJ05ld1Byb2ZpbGVSZXNvdXJjZVRlbXBsYXRlJztcblxuXHRyZWFkb25seSB0ZW1wbGF0ZUlkID0gTmV3UHJvZmlsZVJlc291cmNlVHJlZVJlbmRlcmVyLlRFTVBMQVRFX0lEO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1c2VyRGF0YVByb2ZpbGVzU2VydmljZTogSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0cmVuZGVyVGVtcGxhdGUocGFyZW50OiBIVE1MRWxlbWVudCk6IElOZXdQcm9maWxlUmVzb3VyY2VUZW1wbGF0ZURhdGEge1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IGNvbnRhaW5lciA9IGFwcGVuZChwYXJlbnQsICQoJy5wcm9maWxlLXRyZWUtaXRlbS1jb250YWluZXIubmV3LXByb2ZpbGUtcmVzb3VyY2UtdHlwZS1jb250YWluZXInKSk7XG5cdFx0Y29uc3QgbGFiZWxDb250YWluZXIgPSBhcHBlbmQoY29udGFpbmVyLCAkKCcucHJvZmlsZS1yZXNvdXJjZS10eXBlLWxhYmVsLWNvbnRhaW5lcicpKTtcblx0XHRjb25zdCBsYWJlbCA9IGFwcGVuZChsYWJlbENvbnRhaW5lciwgJCgnc3Bhbi5wcm9maWxlLXJlc291cmNlLXR5cGUtbGFiZWwnKSk7XG5cblx0XHRjb25zdCByYWRpbyA9IGRpc3Bvc2FibGVzLmFkZChuZXcgUmFkaW8oeyBpdGVtczogW10gfSkpO1xuXHRcdGFwcGVuZChhcHBlbmQoY29udGFpbmVyLCAkKCcucHJvZmlsZS1yZXNvdXJjZS1vcHRpb25zLWNvbnRhaW5lcicpKSwgcmFkaW8uZG9tTm9kZSk7XG5cblx0XHRjb25zdCBhY3Rpb25zQ29udGFpbmVyID0gYXBwZW5kKGNvbnRhaW5lciwgJCgnLnByb2ZpbGUtcmVzb3VyY2UtYWN0aW9ucy1jb250YWluZXInKSk7XG5cdFx0Y29uc3QgYWN0aW9uQmFyID0gZGlzcG9zYWJsZXMuYWRkKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoV29ya2JlbmNoVG9vbEJhcixcblx0XHRcdGFjdGlvbnNDb250YWluZXIsXG5cdFx0XHR7XG5cdFx0XHRcdGhvdmVyRGVsZWdhdGU6IGRpc3Bvc2FibGVzLmFkZChjcmVhdGVJbnN0YW50SG92ZXJEZWxlZ2F0ZSgpKSxcblx0XHRcdFx0aGlnaGxpZ2h0VG9nZ2xlZEl0ZW1zOiB0cnVlXG5cdFx0XHR9XG5cdFx0KSk7XG5cblx0XHRyZXR1cm4geyBsYWJlbCwgcmFkaW8sIGFjdGlvbkJhciwgZGlzcG9zYWJsZXMsIGVsZW1lbnREaXNwb3NhYmxlczogZGlzcG9zYWJsZXMuYWRkKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSkgfTtcblx0fVxuXG5cdHJlbmRlckVsZW1lbnQoeyBlbGVtZW50OiBwcm9maWxlUmVzb3VyY2VUcmVlRWxlbWVudCB9OiBJVHJlZU5vZGU8UHJvZmlsZUNvbnRlbnRUcmVlRWxlbWVudCwgdm9pZD4sIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSU5ld1Byb2ZpbGVSZXNvdXJjZVRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS5lbGVtZW50RGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHRjb25zdCB7IGVsZW1lbnQsIHJvb3QgfSA9IHByb2ZpbGVSZXNvdXJjZVRyZWVFbGVtZW50O1xuXHRcdGlmICghKHJvb3QgaW5zdGFuY2VvZiBOZXdQcm9maWxlRWxlbWVudCkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignTmV3UHJvZmlsZVJlc291cmNlVHJlZVJlbmRlcmVyIGNhbiBvbmx5IHJlbmRlciBuZXcgcHJvZmlsZSBlbGVtZW50Jyk7XG5cdFx0fVxuXHRcdGlmIChpc1N0cmluZyhlbGVtZW50KSB8fCAhaXNQcm9maWxlUmVzb3VyY2VUeXBlRWxlbWVudChlbGVtZW50KSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIHByb2ZpbGUgcmVzb3VyY2UgZWxlbWVudCcpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlc291cmNlVHlwZVRpdGxlID0gdGhpcy5nZXRSZXNvdXJjZVR5cGVUaXRsZShlbGVtZW50LnJlc291cmNlVHlwZSk7XG5cdFx0dGVtcGxhdGVEYXRhLmxhYmVsLnRleHRDb250ZW50ID0gcmVzb3VyY2VUeXBlVGl0bGU7XG5cblx0XHRjb25zdCByZW5kZXJSYWRpb0l0ZW1zID0gKCkgPT4ge1xuXHRcdFx0Y29uc3Qgb3B0aW9ucyA9IFt7XG5cdFx0XHRcdHRleHQ6IGxvY2FsaXplKCdkZWZhdWx0JywgXCJEZWZhdWx0XCIpLFxuXHRcdFx0XHR0b29sdGlwOiBsb2NhbGl6ZSgnZGVmYXVsdCBkZXNjcmlwdGlvbicsIFwiVXNlIHswfSBmcm9tIHRoZSBEZWZhdWx0IHByb2ZpbGVcIiwgcmVzb3VyY2VUeXBlVGl0bGUpLFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0dGV4dDogbG9jYWxpemUoJ25vbmUnLCBcIk5vbmVcIiksXG5cdFx0XHRcdHRvb2x0aXA6IGxvY2FsaXplKCdub25lIGRlc2NyaXB0aW9uJywgXCJDcmVhdGUgZW1wdHkgezB9XCIsIHJlc291cmNlVHlwZVRpdGxlKVxuXHRcdFx0fV07XG5cdFx0XHRjb25zdCBjb3B5RnJvbU5hbWUgPSByb290LmdldENvcHlGcm9tTmFtZSgpO1xuXHRcdFx0Y29uc3QgbmFtZSA9IGNvcHlGcm9tTmFtZSA9PT0gdGhpcy51c2VyRGF0YVByb2ZpbGVzU2VydmljZS5kZWZhdWx0UHJvZmlsZS5uYW1lXG5cdFx0XHRcdD8gbG9jYWxpemUoJ2NvcHkgZnJvbSBkZWZhdWx0JywgXCJ7MH0gKENvcHkpXCIsIGNvcHlGcm9tTmFtZSlcblx0XHRcdFx0OiBjb3B5RnJvbU5hbWU7XG5cdFx0XHRpZiAocm9vdC5jb3B5RnJvbSAmJiBuYW1lKSB7XG5cdFx0XHRcdHRlbXBsYXRlRGF0YS5yYWRpby5zZXRJdGVtcyhbXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0dGV4dDogbmFtZSxcblx0XHRcdFx0XHRcdHRvb2x0aXA6IG5hbWUgPyBsb2NhbGl6ZSgnY29weSBmcm9tIHByb2ZpbGUgZGVzY3JpcHRpb24nLCBcIkNvcHkgezB9IGZyb20gdGhlIHsxfSBwcm9maWxlXCIsIHJlc291cmNlVHlwZVRpdGxlLCBuYW1lKSA6IGxvY2FsaXplKCdjb3B5IGRlc2NyaXB0aW9uJywgXCJDb3B5XCIpLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0Li4ub3B0aW9uc1xuXHRcdFx0XHRdKTtcblx0XHRcdFx0dGVtcGxhdGVEYXRhLnJhZGlvLnNldEFjdGl2ZUl0ZW0ocm9vdC5nZXRDb3B5RmxhZyhlbGVtZW50LnJlc291cmNlVHlwZSkgPyAwIDogcm9vdC5nZXRGbGFnKGVsZW1lbnQucmVzb3VyY2VUeXBlKSA/IDEgOiAyKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRlbXBsYXRlRGF0YS5yYWRpby5zZXRJdGVtcyhvcHRpb25zKTtcblx0XHRcdFx0dGVtcGxhdGVEYXRhLnJhZGlvLnNldEFjdGl2ZUl0ZW0ocm9vdC5nZXRGbGFnKGVsZW1lbnQucmVzb3VyY2VUeXBlKSA/IDAgOiAxKTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0aWYgKHJvb3QuY29weUZyb20pIHtcblx0XHRcdHRlbXBsYXRlRGF0YS5lbGVtZW50RGlzcG9zYWJsZXMuYWRkKHRlbXBsYXRlRGF0YS5yYWRpby5vbkRpZFNlbGVjdChpbmRleCA9PiB7XG5cdFx0XHRcdHJvb3Quc2V0RmxhZyhlbGVtZW50LnJlc291cmNlVHlwZSwgaW5kZXggPT09IDEpO1xuXHRcdFx0XHRyb290LnNldENvcHlGbGFnKGVsZW1lbnQucmVzb3VyY2VUeXBlLCBpbmRleCA9PT0gMCk7XG5cdFx0XHR9KSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRlbXBsYXRlRGF0YS5lbGVtZW50RGlzcG9zYWJsZXMuYWRkKHRlbXBsYXRlRGF0YS5yYWRpby5vbkRpZFNlbGVjdChpbmRleCA9PiB7XG5cdFx0XHRcdHJvb3Quc2V0RmxhZyhlbGVtZW50LnJlc291cmNlVHlwZSwgaW5kZXggPT09IDApO1xuXHRcdFx0fSkpO1xuXHRcdH1cblxuXHRcdHJlbmRlclJhZGlvSXRlbXMoKTtcblx0XHR0ZW1wbGF0ZURhdGEucmFkaW8uc2V0RW5hYmxlZCghcm9vdC5kaXNhYmxlZCAmJiAhcm9vdC5wcmV2aWV3UHJvZmlsZSk7XG5cdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnREaXNwb3NhYmxlcy5hZGQocm9vdC5vbkRpZENoYW5nZShlID0+IHtcblx0XHRcdGlmIChlLmRpc2FibGVkIHx8IGUucHJldmlldykge1xuXHRcdFx0XHR0ZW1wbGF0ZURhdGEucmFkaW8uc2V0RW5hYmxlZCghcm9vdC5kaXNhYmxlZCAmJiAhcm9vdC5wcmV2aWV3UHJvZmlsZSk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoZS5jb3B5RnJvbSB8fCBlLmNvcHlGcm9tSW5mbykge1xuXHRcdFx0XHRyZW5kZXJSYWRpb0l0ZW1zKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdGNvbnN0IGFjdGlvbnM6IElBY3Rpb25bXSA9IFtdO1xuXHRcdGlmIChlbGVtZW50Lm9wZW5BY3Rpb24pIHtcblx0XHRcdGFjdGlvbnMucHVzaChlbGVtZW50Lm9wZW5BY3Rpb24pO1xuXHRcdH1cblx0XHRpZiAoZWxlbWVudC5hY3Rpb25zPy5wcmltYXJ5KSB7XG5cdFx0XHRhY3Rpb25zLnB1c2goLi4uZWxlbWVudC5hY3Rpb25zLnByaW1hcnkpO1xuXHRcdH1cblx0XHR0ZW1wbGF0ZURhdGEuYWN0aW9uQmFyLnNldEFjdGlvbnMoYWN0aW9ucyk7XG5cdH1cbn1cblxuY2xhc3MgUHJvZmlsZVJlc291cmNlQ2hpbGRUcmVlSXRlbVJlbmRlcmVyIGV4dGVuZHMgQWJzdHJhY3RQcm9maWxlUmVzb3VyY2VUcmVlUmVuZGVyZXIgaW1wbGVtZW50cyBJVHJlZVJlbmRlcmVyPFByb2ZpbGVDb250ZW50VHJlZUVsZW1lbnQsIHZvaWQsIElQcm9maWxlUmVzb3VyY2VDaGlsZFRyZWVJdGVtVGVtcGxhdGVEYXRhPiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IFRFTVBMQVRFX0lEID0gJ1Byb2ZpbGVSZXNvdXJjZUNoaWxkVHJlZUl0ZW1UZW1wbGF0ZSc7XG5cblx0cmVhZG9ubHkgdGVtcGxhdGVJZCA9IFByb2ZpbGVSZXNvdXJjZUNoaWxkVHJlZUl0ZW1SZW5kZXJlci5URU1QTEFURV9JRDtcblx0cHJpdmF0ZSByZWFkb25seSBsYWJlbHM6IFJlc291cmNlTGFiZWxzO1xuXHRwcml2YXRlIHJlYWRvbmx5IGhvdmVyRGVsZWdhdGU6IElIb3ZlckRlbGVnYXRlO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMubGFiZWxzID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUmVzb3VyY2VMYWJlbHMsIERFRkFVTFRfTEFCRUxTX0NPTlRBSU5FUik7XG5cdFx0dGhpcy5ob3ZlckRlbGVnYXRlID0gdGhpcy5fcmVnaXN0ZXIoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoV29ya2JlbmNoSG92ZXJEZWxlZ2F0ZSwgJ21vdXNlJywgdW5kZWZpbmVkLCB7fSkpO1xuXHR9XG5cblx0cmVuZGVyVGVtcGxhdGUocGFyZW50OiBIVE1MRWxlbWVudCk6IElQcm9maWxlUmVzb3VyY2VDaGlsZFRyZWVJdGVtVGVtcGxhdGVEYXRhIHtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBjb250YWluZXIgPSBhcHBlbmQocGFyZW50LCAkKCcucHJvZmlsZS10cmVlLWl0ZW0tY29udGFpbmVyLnByb2ZpbGUtcmVzb3VyY2UtY2hpbGQtY29udGFpbmVyJykpO1xuXHRcdGNvbnN0IGNoZWNrYm94ID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBDaGVja2JveCgnJywgZmFsc2UsIGRlZmF1bHRDaGVja2JveFN0eWxlcykpO1xuXHRcdGFwcGVuZChjb250YWluZXIsIGNoZWNrYm94LmRvbU5vZGUpO1xuXHRcdGNvbnN0IHJlc291cmNlTGFiZWwgPSBkaXNwb3NhYmxlcy5hZGQodGhpcy5sYWJlbHMuY3JlYXRlKGNvbnRhaW5lciwgeyBob3ZlckRlbGVnYXRlOiB0aGlzLmhvdmVyRGVsZWdhdGUgfSkpO1xuXG5cdFx0Y29uc3QgYWN0aW9uc0NvbnRhaW5lciA9IGFwcGVuZChjb250YWluZXIsICQoJy5wcm9maWxlLXJlc291cmNlLWFjdGlvbnMtY29udGFpbmVyJykpO1xuXHRcdGNvbnN0IGFjdGlvbkJhciA9IGRpc3Bvc2FibGVzLmFkZCh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFdvcmtiZW5jaFRvb2xCYXIsXG5cdFx0XHRhY3Rpb25zQ29udGFpbmVyLFxuXHRcdFx0e1xuXHRcdFx0XHRob3ZlckRlbGVnYXRlOiBkaXNwb3NhYmxlcy5hZGQoY3JlYXRlSW5zdGFudEhvdmVyRGVsZWdhdGUoKSksXG5cdFx0XHRcdGhpZ2hsaWdodFRvZ2dsZWRJdGVtczogdHJ1ZVxuXHRcdFx0fVxuXHRcdCkpO1xuXG5cdFx0cmV0dXJuIHsgY2hlY2tib3gsIHJlc291cmNlTGFiZWwsIGFjdGlvbkJhciwgZGlzcG9zYWJsZXMsIGVsZW1lbnREaXNwb3NhYmxlczogZGlzcG9zYWJsZXMuYWRkKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSkgfTtcblx0fVxuXG5cdHJlbmRlckVsZW1lbnQoeyBlbGVtZW50OiBwcm9maWxlUmVzb3VyY2VUcmVlRWxlbWVudCB9OiBJVHJlZU5vZGU8UHJvZmlsZUNvbnRlbnRUcmVlRWxlbWVudCwgdm9pZD4sIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSVByb2ZpbGVSZXNvdXJjZUNoaWxkVHJlZUl0ZW1UZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudERpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0Y29uc3QgeyBlbGVtZW50IH0gPSBwcm9maWxlUmVzb3VyY2VUcmVlRWxlbWVudDtcblxuXHRcdGlmIChpc1N0cmluZyhlbGVtZW50KSB8fCAhaXNQcm9maWxlUmVzb3VyY2VDaGlsZEVsZW1lbnQoZWxlbWVudCkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignSW52YWxpZCBwcm9maWxlIHJlc291cmNlIGVsZW1lbnQnKTtcblx0XHR9XG5cblx0XHRpZiAoZWxlbWVudC5jaGVja2JveCkge1xuXHRcdFx0dGVtcGxhdGVEYXRhLmNoZWNrYm94LmRvbU5vZGUuc2V0QXR0cmlidXRlKCd0YWJpbmRleCcsICcwJyk7XG5cdFx0XHR0ZW1wbGF0ZURhdGEuY2hlY2tib3guZG9tTm9kZS5jbGFzc0xpc3QucmVtb3ZlKCdoaWRlJyk7XG5cdFx0XHR0ZW1wbGF0ZURhdGEuY2hlY2tib3guY2hlY2tlZCA9IGVsZW1lbnQuY2hlY2tib3guaXNDaGVja2VkO1xuXHRcdFx0dGVtcGxhdGVEYXRhLmNoZWNrYm94LmRvbU5vZGUuYXJpYUxhYmVsID0gZWxlbWVudC5jaGVja2JveC5hY2Nlc3NpYmlsaXR5SW5mb3JtYXRpb24/LmxhYmVsID8/ICcnO1xuXHRcdFx0aWYgKGVsZW1lbnQuY2hlY2tib3guYWNjZXNzaWJpbGl0eUluZm9ybWF0aW9uPy5yb2xlKSB7XG5cdFx0XHRcdHRlbXBsYXRlRGF0YS5jaGVja2JveC5kb21Ob2RlLnJvbGUgPSBlbGVtZW50LmNoZWNrYm94LmFjY2Vzc2liaWxpdHlJbmZvcm1hdGlvbi5yb2xlO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHR0ZW1wbGF0ZURhdGEuY2hlY2tib3guZG9tTm9kZS5yZW1vdmVBdHRyaWJ1dGUoJ3RhYmluZGV4Jyk7XG5cdFx0XHR0ZW1wbGF0ZURhdGEuY2hlY2tib3guZG9tTm9kZS5jbGFzc0xpc3QuYWRkKCdoaWRlJyk7XG5cdFx0fVxuXG5cdFx0dGVtcGxhdGVEYXRhLnJlc291cmNlTGFiZWwuc2V0UmVzb3VyY2UoXG5cdFx0XHR7XG5cdFx0XHRcdG5hbWU6IGVsZW1lbnQucmVzb3VyY2UgPyBiYXNlbmFtZShlbGVtZW50LnJlc291cmNlKSA6IGVsZW1lbnQubGFiZWwsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBlbGVtZW50LmRlc2NyaXB0aW9uLFxuXHRcdFx0XHRyZXNvdXJjZTogZWxlbWVudC5yZXNvdXJjZVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0Zm9yY2VMYWJlbDogdHJ1ZSxcblx0XHRcdFx0aWNvbjogZWxlbWVudC5pY29uLFxuXHRcdFx0XHRoaWRlSWNvbjogIWVsZW1lbnQucmVzb3VyY2UgJiYgIWVsZW1lbnQuaWNvbixcblx0XHRcdH0pO1xuXHRcdGNvbnN0IGFjdGlvbnM6IElBY3Rpb25bXSA9IFtdO1xuXHRcdGlmIChlbGVtZW50Lm9wZW5BY3Rpb24pIHtcblx0XHRcdGFjdGlvbnMucHVzaChlbGVtZW50Lm9wZW5BY3Rpb24pO1xuXHRcdH1cblx0XHRpZiAoZWxlbWVudC5hY3Rpb25zPy5wcmltYXJ5KSB7XG5cdFx0XHRhY3Rpb25zLnB1c2goLi4uZWxlbWVudC5hY3Rpb25zLnByaW1hcnkpO1xuXHRcdH1cblx0XHR0ZW1wbGF0ZURhdGEuYWN0aW9uQmFyLnNldEFjdGlvbnMoYWN0aW9ucyk7XG5cdH1cblxufVxuXG5jbGFzcyBXb3Jrc3BhY2VVcmlFbXB0eUNvbHVtblJlbmRlcmVyIGltcGxlbWVudHMgSVRhYmxlUmVuZGVyZXI8V29ya3NwYWNlVGFibGVFbGVtZW50LCB7fT4ge1xuXHRzdGF0aWMgcmVhZG9ubHkgVEVNUExBVEVfSUQgPSAnZW1wdHknO1xuXG5cdHJlYWRvbmx5IHRlbXBsYXRlSWQ6IHN0cmluZyA9IFdvcmtzcGFjZVVyaUVtcHR5Q29sdW1uUmVuZGVyZXIuVEVNUExBVEVfSUQ7XG5cblx0cmVuZGVyVGVtcGxhdGUoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHt9IHtcblx0XHRyZXR1cm4ge307XG5cdH1cblxuXHRyZW5kZXJFbGVtZW50KGl0ZW06IFdvcmtzcGFjZVRhYmxlRWxlbWVudCwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiB7fSk6IHZvaWQge1xuXHR9XG5cblx0ZGlzcG9zZVRlbXBsYXRlKCk6IHZvaWQge1xuXHR9XG5cbn1cblxuaW50ZXJmYWNlIElXb3Jrc3BhY2VVcmlIb3N0Q29sdW1uVGVtcGxhdGVEYXRhIHtcblx0ZWxlbWVudDogSFRNTEVsZW1lbnQ7XG5cdGhvc3RDb250YWluZXI6IEhUTUxFbGVtZW50O1xuXHRidXR0b25CYXJDb250YWluZXI6IEhUTUxFbGVtZW50O1xuXHRkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlO1xuXHRyZW5kZXJEaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlO1xufVxuXG5jbGFzcyBXb3Jrc3BhY2VVcmlIb3N0Q29sdW1uUmVuZGVyZXIgaW1wbGVtZW50cyBJVGFibGVSZW5kZXJlcjxXb3Jrc3BhY2VUYWJsZUVsZW1lbnQsIElXb3Jrc3BhY2VVcmlIb3N0Q29sdW1uVGVtcGxhdGVEYXRhPiB7XG5cdHN0YXRpYyByZWFkb25seSBURU1QTEFURV9JRCA9ICdob3N0JztcblxuXHRyZWFkb25seSB0ZW1wbGF0ZUlkOiBzdHJpbmcgPSBXb3Jrc3BhY2VVcmlIb3N0Q29sdW1uUmVuZGVyZXIuVEVNUExBVEVfSUQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElVcmlJZGVudGl0eVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1cmlJZGVudGl0eVNlcnZpY2U6IElVcmlJZGVudGl0eVNlcnZpY2UsXG5cdFx0QElMYWJlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYWJlbFNlcnZpY2U6IElMYWJlbFNlcnZpY2UsXG5cdCkgeyB9XG5cblx0cmVuZGVyVGVtcGxhdGUoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IElXb3Jrc3BhY2VVcmlIb3N0Q29sdW1uVGVtcGxhdGVEYXRhIHtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCByZW5kZXJEaXNwb3NhYmxlcyA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXG5cdFx0Y29uc3QgZWxlbWVudCA9IGNvbnRhaW5lci5hcHBlbmRDaGlsZCgkKCcuaG9zdCcpKTtcblx0XHRjb25zdCBob3N0Q29udGFpbmVyID0gZWxlbWVudC5hcHBlbmRDaGlsZCgkKCdkaXYuaG9zdC1sYWJlbCcpKTtcblx0XHRjb25zdCBidXR0b25CYXJDb250YWluZXIgPSBlbGVtZW50LmFwcGVuZENoaWxkKCQoJ2Rpdi5idXR0b24tYmFyJykpO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGVsZW1lbnQsXG5cdFx0XHRob3N0Q29udGFpbmVyLFxuXHRcdFx0YnV0dG9uQmFyQ29udGFpbmVyLFxuXHRcdFx0ZGlzcG9zYWJsZXMsXG5cdFx0XHRyZW5kZXJEaXNwb3NhYmxlc1xuXHRcdH07XG5cdH1cblxuXHRyZW5kZXJFbGVtZW50KGl0ZW06IFdvcmtzcGFjZVRhYmxlRWxlbWVudCwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBJV29ya3NwYWNlVXJpSG9zdENvbHVtblRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS5yZW5kZXJEaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdHRlbXBsYXRlRGF0YS5yZW5kZXJEaXNwb3NhYmxlcy5hZGQoeyBkaXNwb3NlOiAoKSA9PiB7IGNsZWFyTm9kZSh0ZW1wbGF0ZURhdGEuYnV0dG9uQmFyQ29udGFpbmVyKTsgfSB9KTtcblxuXHRcdHRlbXBsYXRlRGF0YS5ob3N0Q29udGFpbmVyLmlubmVyVGV4dCA9IGdldEhvc3RMYWJlbCh0aGlzLmxhYmVsU2VydmljZSwgaXRlbS53b3Jrc3BhY2UpO1xuXHRcdHRlbXBsYXRlRGF0YS5lbGVtZW50LmNsYXNzTGlzdC50b2dnbGUoJ2N1cnJlbnQtd29ya3NwYWNlJywgdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlzRXF1YWwoaXRlbS53b3Jrc3BhY2UsIGl0ZW0ucHJvZmlsZUVsZW1lbnQuZ2V0Q3VycmVudFdvcmtzcGFjZSgpKSk7XG5cblx0XHR0ZW1wbGF0ZURhdGEuaG9zdENvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gJyc7XG5cdFx0dGVtcGxhdGVEYXRhLmJ1dHRvbkJhckNvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHR9XG5cblx0ZGlzcG9zZVRlbXBsYXRlKHRlbXBsYXRlRGF0YTogSVdvcmtzcGFjZVVyaUhvc3RDb2x1bW5UZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEuZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9XG5cbn1cblxuaW50ZXJmYWNlIElXb3Jrc3BhY2VVcmlQYXRoQ29sdW1uVGVtcGxhdGVEYXRhIHtcblx0ZWxlbWVudDogSFRNTEVsZW1lbnQ7XG5cdHBhdGhMYWJlbDogSFRNTEVsZW1lbnQ7XG5cdHBhdGhIb3ZlcjogSU1hbmFnZWRIb3Zlcjtcblx0cmVuZGVyRGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcblx0ZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcbn1cblxuY2xhc3MgV29ya3NwYWNlVXJpUGF0aENvbHVtblJlbmRlcmVyIGltcGxlbWVudHMgSVRhYmxlUmVuZGVyZXI8V29ya3NwYWNlVGFibGVFbGVtZW50LCBJV29ya3NwYWNlVXJpUGF0aENvbHVtblRlbXBsYXRlRGF0YT4ge1xuXHRzdGF0aWMgcmVhZG9ubHkgVEVNUExBVEVfSUQgPSAncGF0aCc7XG5cblx0cmVhZG9ubHkgdGVtcGxhdGVJZDogc3RyaW5nID0gV29ya3NwYWNlVXJpUGF0aENvbHVtblJlbmRlcmVyLlRFTVBMQVRFX0lEO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgaG92ZXJEZWxlZ2F0ZTogSUhvdmVyRGVsZWdhdGU7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElVcmlJZGVudGl0eVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1cmlJZGVudGl0eVNlcnZpY2U6IElVcmlJZGVudGl0eVNlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdCkge1xuXHRcdHRoaXMuaG92ZXJEZWxlZ2F0ZSA9IGdldERlZmF1bHRIb3ZlckRlbGVnYXRlKCdtb3VzZScpO1xuXHR9XG5cblx0cmVuZGVyVGVtcGxhdGUoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IElXb3Jrc3BhY2VVcmlQYXRoQ29sdW1uVGVtcGxhdGVEYXRhIHtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBlbGVtZW50ID0gY29udGFpbmVyLmFwcGVuZENoaWxkKCQoJy5wYXRoJykpO1xuXHRcdGNvbnN0IHBhdGhMYWJlbCA9IGVsZW1lbnQuYXBwZW5kQ2hpbGQoJCgnZGl2LnBhdGgtbGFiZWwnKSk7XG5cdFx0Y29uc3QgcGF0aEhvdmVyID0gZGlzcG9zYWJsZXMuYWRkKHRoaXMuaG92ZXJTZXJ2aWNlLnNldHVwTWFuYWdlZEhvdmVyKHRoaXMuaG92ZXJEZWxlZ2F0ZSwgcGF0aExhYmVsLCAnJykpO1xuXHRcdGNvbnN0IHJlbmRlckRpc3Bvc2FibGVzID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0ZWxlbWVudCxcblx0XHRcdHBhdGhMYWJlbCxcblx0XHRcdHBhdGhIb3Zlcixcblx0XHRcdGRpc3Bvc2FibGVzLFxuXHRcdFx0cmVuZGVyRGlzcG9zYWJsZXNcblx0XHR9O1xuXHR9XG5cblx0cmVuZGVyRWxlbWVudChpdGVtOiBXb3Jrc3BhY2VUYWJsZUVsZW1lbnQsIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSVdvcmtzcGFjZVVyaVBhdGhDb2x1bW5UZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEucmVuZGVyRGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHRjb25zdCBzdHJpbmdWYWx1ZSA9IHRoaXMuZm9ybWF0UGF0aChpdGVtLndvcmtzcGFjZSk7XG5cdFx0dGVtcGxhdGVEYXRhLnBhdGhMYWJlbC5pbm5lclRleHQgPSBzdHJpbmdWYWx1ZTtcblx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudC5jbGFzc0xpc3QudG9nZ2xlKCdjdXJyZW50LXdvcmtzcGFjZScsIHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsKGl0ZW0ud29ya3NwYWNlLCBpdGVtLnByb2ZpbGVFbGVtZW50LmdldEN1cnJlbnRXb3Jrc3BhY2UoKSkpO1xuXHRcdHRlbXBsYXRlRGF0YS5wYXRoSG92ZXIudXBkYXRlKHN0cmluZ1ZhbHVlKTtcblx0fVxuXG5cdGRpc3Bvc2VUZW1wbGF0ZSh0ZW1wbGF0ZURhdGE6IElXb3Jrc3BhY2VVcmlQYXRoQ29sdW1uVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLmRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHR0ZW1wbGF0ZURhdGEucmVuZGVyRGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBmb3JtYXRQYXRoKHVyaTogVVJJKTogc3RyaW5nIHtcblx0XHRpZiAodXJpLnNjaGVtZSA9PT0gU2NoZW1hcy5maWxlKSB7XG5cdFx0XHRyZXR1cm4gbm9ybWFsaXplRHJpdmVMZXR0ZXIodXJpLmZzUGF0aCk7XG5cdFx0fVxuXG5cdFx0Ly8gSWYgdGhlIHBhdGggaXMgbm90IGEgZmlsZSB1cmksIGJ1dCBwb2ludHMgdG8gYSB3aW5kb3dzIHJlbW90ZSwgd2Ugc2hvdWxkIGNyZWF0ZSB3aW5kb3dzIGZzIHBhdGhcblx0XHQvLyBlLmcuIC9jOi91c2VyL2RpcmVjdG9yeSA9PiBDOlxcdXNlclxcZGlyZWN0b3J5XG5cdFx0aWYgKHVyaS5wYXRoLnN0YXJ0c1dpdGgocG9zaXguc2VwKSkge1xuXHRcdFx0Y29uc3QgcGF0aFdpdGhvdXRMZWFkaW5nU2VwYXJhdG9yID0gdXJpLnBhdGguc3Vic3RyaW5nKDEpO1xuXHRcdFx0Y29uc3QgaXNXaW5kb3dzUGF0aCA9IGhhc0RyaXZlTGV0dGVyKHBhdGhXaXRob3V0TGVhZGluZ1NlcGFyYXRvciwgdHJ1ZSk7XG5cdFx0XHRpZiAoaXNXaW5kb3dzUGF0aCkge1xuXHRcdFx0XHRyZXR1cm4gbm9ybWFsaXplRHJpdmVMZXR0ZXIod2luMzIubm9ybWFsaXplKHBhdGhXaXRob3V0TGVhZGluZ1NlcGFyYXRvciksIHRydWUpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB1cmkucGF0aDtcblx0fVxuXG59XG5cbmludGVyZmFjZSBJQWN0aW9uc0NvbHVtblRlbXBsYXRlRGF0YSB7XG5cdHJlYWRvbmx5IGFjdGlvbkJhcjogQWN0aW9uQmFyO1xuXHRyZWFkb25seSBkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlO1xufVxuXG5jbGFzcyBDaGFuZ2VQcm9maWxlQWN0aW9uIGltcGxlbWVudHMgSUFjdGlvbiB7XG5cblx0cmVhZG9ubHkgaWQgPSAnY2hhbmdlUHJvZmlsZSc7XG5cdHJlYWRvbmx5IGxhYmVsID0gJ0NoYW5nZSBQcm9maWxlJztcblx0cmVhZG9ubHkgY2xhc3MgPSBUaGVtZUljb24uYXNDbGFzc05hbWUoZWRpdEljb24pO1xuXHRyZWFkb25seSBlbmFibGVkOiBib29sZWFuO1xuXHRyZWFkb25seSB0b29sdGlwID0gbG9jYWxpemUoJ2NoYW5nZSBwcm9maWxlJywgXCJDaGFuZ2UgUHJvZmlsZVwiKTtcblx0cmVhZG9ubHkgY2hlY2tlZCA9IGZhbHNlO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgaXRlbTogV29ya3NwYWNlVGFibGVFbGVtZW50LFxuXHRcdEBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1c2VyRGF0YVByb2ZpbGVzU2VydmljZTogSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLFxuXHRcdEBJVXJpSWRlbnRpdHlTZXJ2aWNlIHVyaUlkZW50aXR5U2VydmljZTogSVVyaUlkZW50aXR5U2VydmljZSxcblx0XHRASUVudmlyb25tZW50U2VydmljZSBlbnZpcm9ubWVudFNlcnZpY2U6IElFbnZpcm9ubWVudFNlcnZpY2UsXG5cdCkge1xuXHRcdHRoaXMuZW5hYmxlZCA9ICF1cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlzRXF1YWwoaXRlbS53b3Jrc3BhY2UsIGVudmlyb25tZW50U2VydmljZS5hZ2VudFNlc3Npb25zV29ya3NwYWNlKTtcblx0fVxuXG5cdHJ1bigpOiB2b2lkIHsgfVxuXG5cdGdldFN3aXRjaFByb2ZpbGVBY3Rpb25zKCk6IElBY3Rpb25bXSB7XG5cdFx0cmV0dXJuIHRoaXMudXNlckRhdGFQcm9maWxlc1NlcnZpY2UucHJvZmlsZXNcblx0XHRcdC5maWx0ZXIocHJvZmlsZSA9PiAhcHJvZmlsZS5pc0ludGVybmFsKVxuXHRcdFx0LnNvcnQoKGEsIGIpID0+IGEuaXNEZWZhdWx0ID8gLTEgOiBiLmlzRGVmYXVsdCA/IDEgOiBhLm5hbWUubG9jYWxlQ29tcGFyZShiLm5hbWUpKVxuXHRcdFx0Lm1hcDxJQWN0aW9uPihwcm9maWxlID0+ICh7XG5cdFx0XHRcdGlkOiBgc3dpdGNoUHJvZmlsZVRvJHtwcm9maWxlLmlkfWAsXG5cdFx0XHRcdGxhYmVsOiBwcm9maWxlLm5hbWUsXG5cdFx0XHRcdGNsYXNzOiB1bmRlZmluZWQsXG5cdFx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdGNoZWNrZWQ6IHByb2ZpbGUuaWQgPT09IHRoaXMuaXRlbS5wcm9maWxlRWxlbWVudC5wcm9maWxlLmlkLFxuXHRcdFx0XHR0b29sdGlwOiAnJyxcblx0XHRcdFx0cnVuOiAoKSA9PiB7XG5cdFx0XHRcdFx0aWYgKHByb2ZpbGUuaWQgPT09IHRoaXMuaXRlbS5wcm9maWxlRWxlbWVudC5wcm9maWxlLmlkKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHRoaXMudXNlckRhdGFQcm9maWxlc1NlcnZpY2UudXBkYXRlUHJvZmlsZShwcm9maWxlLCB7IHdvcmtzcGFjZXM6IFsuLi4ocHJvZmlsZS53b3Jrc3BhY2VzID8/IFtdKSwgdGhpcy5pdGVtLndvcmtzcGFjZV0gfSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0fVxufVxuXG5jbGFzcyBXb3Jrc3BhY2VVcmlBY3Rpb25zQ29sdW1uUmVuZGVyZXIgaW1wbGVtZW50cyBJVGFibGVSZW5kZXJlcjxXb3Jrc3BhY2VUYWJsZUVsZW1lbnQsIElBY3Rpb25zQ29sdW1uVGVtcGxhdGVEYXRhPiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IFRFTVBMQVRFX0lEID0gJ2FjdGlvbnMnO1xuXG5cdHJlYWRvbmx5IHRlbXBsYXRlSWQ6IHN0cmluZyA9IFdvcmtzcGFjZVVyaUFjdGlvbnNDb2x1bW5SZW5kZXJlci5URU1QTEFURV9JRDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXNlckRhdGFQcm9maWxlc1NlcnZpY2U6IElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSxcblx0XHRASVVzZXJEYXRhUHJvZmlsZU1hbmFnZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXNlckRhdGFQcm9maWxlTWFuYWdlbWVudFNlcnZpY2U6IElVc2VyRGF0YVByb2ZpbGVNYW5hZ2VtZW50U2VydmljZSxcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0XHRASVVyaUlkZW50aXR5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVyaUlkZW50aXR5U2VydmljZTogSVVyaUlkZW50aXR5U2VydmljZSxcblx0XHRASUVudmlyb25tZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVudmlyb25tZW50U2VydmljZTogSUVudmlyb25tZW50U2VydmljZSxcblx0KSB7XG5cdH1cblxuXHRyZW5kZXJUZW1wbGF0ZShjb250YWluZXI6IEhUTUxFbGVtZW50KTogSUFjdGlvbnNDb2x1bW5UZW1wbGF0ZURhdGEge1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IGVsZW1lbnQgPSBjb250YWluZXIuYXBwZW5kQ2hpbGQoJCgnLnByb2ZpbGUtd29ya3NwYWNlcy1hY3Rpb25zLWNvbnRhaW5lcicpKTtcblx0XHRjb25zdCBob3ZlckRlbGVnYXRlID0gZGlzcG9zYWJsZXMuYWRkKGNyZWF0ZUluc3RhbnRIb3ZlckRlbGVnYXRlKCkpO1xuXHRcdGNvbnN0IGFjdGlvbkJhciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWN0aW9uQmFyKGVsZW1lbnQsIHtcblx0XHRcdGhvdmVyRGVsZWdhdGUsXG5cdFx0XHRhY3Rpb25WaWV3SXRlbVByb3ZpZGVyOiAoYWN0aW9uKSA9PiB7XG5cdFx0XHRcdGlmIChhY3Rpb24gaW5zdGFuY2VvZiBDaGFuZ2VQcm9maWxlQWN0aW9uKSB7XG5cdFx0XHRcdFx0cmV0dXJuIG5ldyBEcm9wZG93bk1lbnVBY3Rpb25WaWV3SXRlbShhY3Rpb24sIHsgZ2V0QWN0aW9uczogKCkgPT4gYWN0aW9uLmdldFN3aXRjaFByb2ZpbGVBY3Rpb25zKCkgfSwgdGhpcy5jb250ZXh0TWVudVNlcnZpY2UsIHtcblx0XHRcdFx0XHRcdGNsYXNzTmFtZXM6IGFjdGlvbi5jbGFzcyxcblx0XHRcdFx0XHRcdGhvdmVyRGVsZWdhdGUsXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0cmV0dXJuIHsgYWN0aW9uQmFyLCBkaXNwb3NhYmxlcyB9O1xuXHR9XG5cblx0cmVuZGVyRWxlbWVudChpdGVtOiBXb3Jrc3BhY2VUYWJsZUVsZW1lbnQsIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSUFjdGlvbnNDb2x1bW5UZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEuYWN0aW9uQmFyLmNsZWFyKCk7XG5cdFx0Y29uc3QgYWN0aW9uczogSUFjdGlvbltdID0gW107XG5cdFx0YWN0aW9ucy5wdXNoKHRoaXMuY3JlYXRlT3BlbkFjdGlvbihpdGVtKSk7XG5cdFx0YWN0aW9ucy5wdXNoKG5ldyBDaGFuZ2VQcm9maWxlQWN0aW9uKGl0ZW0sIHRoaXMudXNlckRhdGFQcm9maWxlc1NlcnZpY2UsIHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLCB0aGlzLmVudmlyb25tZW50U2VydmljZSkpO1xuXHRcdGFjdGlvbnMucHVzaCh0aGlzLmNyZWF0ZURlbGV0ZUFjdGlvbihpdGVtKSk7XG5cdFx0dGVtcGxhdGVEYXRhLmFjdGlvbkJhci5wdXNoKGFjdGlvbnMsIHsgaWNvbjogdHJ1ZSB9KTtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlT3BlbkFjdGlvbihpdGVtOiBXb3Jrc3BhY2VUYWJsZUVsZW1lbnQpOiBJQWN0aW9uIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0bGFiZWw6ICcnLFxuXHRcdFx0Y2xhc3M6IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShDb2RpY29uLndpbmRvdyksXG5cdFx0XHRlbmFibGVkOiAhdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlzRXF1YWwoaXRlbS53b3Jrc3BhY2UsIGl0ZW0ucHJvZmlsZUVsZW1lbnQuZ2V0Q3VycmVudFdvcmtzcGFjZSgpKSxcblx0XHRcdGlkOiAnb3BlbldvcmtzcGFjZScsXG5cdFx0XHR0b29sdGlwOiBsb2NhbGl6ZSgnb3BlbicsIFwiT3BlbiBpbiBOZXcgV2luZG93XCIpLFxuXHRcdFx0cnVuOiAoKSA9PiBpdGVtLnByb2ZpbGVFbGVtZW50Lm9wZW5Xb3Jrc3BhY2UoaXRlbS53b3Jrc3BhY2UpXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlRGVsZXRlQWN0aW9uKGl0ZW06IFdvcmtzcGFjZVRhYmxlRWxlbWVudCk6IElBY3Rpb24ge1xuXHRcdGNvbnN0IGlzQWdlbnRTZXNzaW9uc1dvcmtzcGFjZSA9IHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsKGl0ZW0ud29ya3NwYWNlLCB0aGlzLmVudmlyb25tZW50U2VydmljZS5hZ2VudFNlc3Npb25zV29ya3NwYWNlKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0bGFiZWw6ICcnLFxuXHRcdFx0Y2xhc3M6IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShyZW1vdmVJY29uKSxcblx0XHRcdGVuYWJsZWQ6IHRoaXMudXNlckRhdGFQcm9maWxlTWFuYWdlbWVudFNlcnZpY2UuZ2V0RGVmYXVsdFByb2ZpbGVUb1VzZSgpLmlkICE9PSBpdGVtLnByb2ZpbGVFbGVtZW50LnByb2ZpbGUuaWQgJiYgIWlzQWdlbnRTZXNzaW9uc1dvcmtzcGFjZSxcblx0XHRcdGlkOiAnZGVsZXRlVHJ1c3RlZFVyaScsXG5cdFx0XHR0b29sdGlwOiBsb2NhbGl6ZSgnZGVsZXRlVHJ1c3RlZFVyaScsIFwiRGVsZXRlIFBhdGhcIiksXG5cdFx0XHRydW46ICgpID0+IGl0ZW0ucHJvZmlsZUVsZW1lbnQudXBkYXRlV29ya3NwYWNlcyhbXSwgW2l0ZW0ud29ya3NwYWNlXSlcblx0XHR9O1xuXHR9XG5cblx0ZGlzcG9zZVRlbXBsYXRlKHRlbXBsYXRlRGF0YTogSUFjdGlvbnNDb2x1bW5UZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEuZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9XG5cbn1cblxuZnVuY3Rpb24gZ2V0SG9zdExhYmVsKGxhYmVsU2VydmljZTogSUxhYmVsU2VydmljZSwgd29ya3NwYWNlVXJpOiBVUkkpOiBzdHJpbmcge1xuXHRyZXR1cm4gd29ya3NwYWNlVXJpLmF1dGhvcml0eSA/IGxhYmVsU2VydmljZS5nZXRIb3N0TGFiZWwod29ya3NwYWNlVXJpLnNjaGVtZSwgd29ya3NwYWNlVXJpLmF1dGhvcml0eSkgOiBsb2NhbGl6ZSgnbG9jYWxBdXRob3JpdHknLCBcIkxvY2FsXCIpO1xufVxuXG5leHBvcnQgY2xhc3MgVXNlckRhdGFQcm9maWxlc0VkaXRvcklucHV0IGV4dGVuZHMgRWRpdG9ySW5wdXQge1xuXHRzdGF0aWMgcmVhZG9ubHkgSUQ6IHN0cmluZyA9ICd3b3JrYmVuY2guaW5wdXQudXNlckRhdGFQcm9maWxlcyc7XG5cdHJlYWRvbmx5IHJlc291cmNlID0gdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgbW9kZWw6IFVzZXJEYXRhUHJvZmlsZXNFZGl0b3JNb2RlbDtcblxuXHRwcml2YXRlIF9kaXJ0eTogYm9vbGVhbiA9IGZhbHNlO1xuXHRnZXQgZGlydHkoKTogYm9vbGVhbiB7IHJldHVybiB0aGlzLl9kaXJ0eTsgfVxuXHRzZXQgZGlydHkoZGlydHk6IGJvb2xlYW4pIHtcblx0XHRpZiAodGhpcy5fZGlydHkgIT09IGRpcnR5KSB7XG5cdFx0XHR0aGlzLl9kaXJ0eSA9IGRpcnR5O1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VEaXJ0eS5maXJlKCk7XG5cdFx0fVxuXHR9XG5cblx0b3ZlcnJpZGUgZ2V0IGNhcGFiaWxpdGllcygpOiBFZGl0b3JJbnB1dENhcGFiaWxpdGllcyB7XG5cdFx0cmV0dXJuIEVkaXRvcklucHV0Q2FwYWJpbGl0aWVzLlJlcXVpcmVzTW9kYWw7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLm1vZGVsID0gVXNlckRhdGFQcm9maWxlc0VkaXRvck1vZGVsLmdldEluc3RhbmNlKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMubW9kZWwub25EaWRDaGFuZ2UoZSA9PiB0aGlzLmRpcnR5ID0gdGhpcy5tb2RlbC5wcm9maWxlcy5zb21lKHByb2ZpbGUgPT4gcHJvZmlsZSBpbnN0YW5jZW9mIE5ld1Byb2ZpbGVFbGVtZW50KSkpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZ2V0IHR5cGVJZCgpOiBzdHJpbmcgeyByZXR1cm4gVXNlckRhdGFQcm9maWxlc0VkaXRvcklucHV0LklEOyB9XG5cdG92ZXJyaWRlIGdldE5hbWUoKTogc3RyaW5nIHsgcmV0dXJuIGxvY2FsaXplKCd1c2VyRGF0YVByb2ZpbGVzJywgXCJQcm9maWxlc1wiKTsgfVxuXHRvdmVycmlkZSBnZXRJY29uKCk6IFRoZW1lSWNvbiB8IHVuZGVmaW5lZCB7IHJldHVybiBkZWZhdWx0VXNlckRhdGFQcm9maWxlSWNvbjsgfVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJlc29sdmUoKTogUHJvbWlzZTxVc2VyRGF0YVByb2ZpbGVzRWRpdG9yTW9kZWw+IHtcblx0XHRhd2FpdCB0aGlzLm1vZGVsLnJlc29sdmUoKTtcblx0XHRyZXR1cm4gdGhpcy5tb2RlbDtcblx0fVxuXG5cdG92ZXJyaWRlIGlzRGlydHkoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuZGlydHk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBzYXZlKCk6IFByb21pc2U8RWRpdG9ySW5wdXQ+IHtcblx0XHRhd2FpdCB0aGlzLm1vZGVsLnNhdmVOZXdQcm9maWxlKCk7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyByZXZlcnQoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5tb2RlbC5yZXZlcnQoKTtcblx0fVxuXG5cdG92ZXJyaWRlIG1hdGNoZXMob3RoZXJJbnB1dDogRWRpdG9ySW5wdXQgfCBJVW50eXBlZEVkaXRvcklucHV0KTogYm9vbGVhbiB7IHJldHVybiBvdGhlcklucHV0IGluc3RhbmNlb2YgVXNlckRhdGFQcm9maWxlc0VkaXRvcklucHV0OyB9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IHByb2ZpbGUgb2YgdGhpcy5tb2RlbC5wcm9maWxlcykge1xuXHRcdFx0aWYgKHByb2ZpbGUgaW5zdGFuY2VvZiBVc2VyRGF0YVByb2ZpbGVFbGVtZW50KSB7XG5cdFx0XHRcdHByb2ZpbGUucmVzZXQoKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBVc2VyRGF0YVByb2ZpbGVzRWRpdG9ySW5wdXRTZXJpYWxpemVyIGltcGxlbWVudHMgSUVkaXRvclNlcmlhbGl6ZXIge1xuXHRjYW5TZXJpYWxpemUoZWRpdG9ySW5wdXQ6IEVkaXRvcklucHV0KTogYm9vbGVhbiB7IHJldHVybiB0cnVlOyB9XG5cdHNlcmlhbGl6ZShlZGl0b3JJbnB1dDogRWRpdG9ySW5wdXQpOiBzdHJpbmcgeyByZXR1cm4gJyc7IH1cblx0ZGVzZXJpYWxpemUoaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSk6IEVkaXRvcklucHV0IHsgcmV0dXJuIGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFVzZXJEYXRhUHJvZmlsZXNFZGl0b3JJbnB1dCk7IH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsT0FBTztBQUNQLFNBQVMsR0FBRyx1QkFBdUIsUUFBUSxXQUFXLFdBQVcsYUFBYSxXQUF5QixrQkFBa0I7QUFDekgsU0FBUyxRQUFxQyxXQUFXLGVBQWUsZ0JBQWdCO0FBQ3hGLFNBQVMsU0FBUyxhQUFhO0FBQy9CLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMscUJBQXFCLDJCQUEyQjtBQUN6RCxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLHFCQUFxQjtBQUM5QixTQUEyQiwwQkFBMEIsMkJBQTJCO0FBQ2hGLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsK0JBQTJGO0FBQ3BHLFNBQVMsbUJBQW1CO0FBRzVCLFNBQVMsNEJBQWtELG1DQUFtQyx5QkFBeUIsc0JBQXNCO0FBQzdJLFNBQVMsYUFBYSxRQUFRLGlCQUFpQjtBQUMvQyxTQUFTLFFBQVEsV0FBVywwQkFBMEI7QUFDdEQsU0FBUyxxQkFBcUIsdUJBQXVCLHVCQUF1Qix3QkFBd0Isa0JBQWtCLHFCQUFxQjtBQUMzSSxTQUFTLGtCQUFrQixZQUFZLHFCQUFxQjtBQUM1RCxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLHdCQUF3QixlQUFlLHNCQUFzQjtBQUN0RSxTQUFTLGlDQUFzRTtBQUkvRSxTQUFTLFlBQVksaUJBQThCLG1C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O0FBQUEsRUFDUjtBQUFBLEVBRUEsTUFBZSxTQUF3QjtBQUN0QyxTQUFLLE1BQU0sT0FBTztBQUFBLEVBQ25CO0FBQUEsRUFFUyxRQUFRLFlBQXdEO0FBQUUsV0FBTyxzQkFBc0I7QUFBQSxFQUE2QjtBQUFBLEVBRTVILFVBQWdCO0FBQ3hCLGVBQVcsV0FBVyxLQUFLLE1BQU0sVUFBVTtBQUMxQyxVQUFJLG1CQUFtQix3QkFBd0I7QUFDOUMsZ0JBQVEsTUFBTTtBQUFBLE1BQ2Y7QUFBQSxJQUNEO0FBQ0EsVUFBTSxRQUFRO0FBQUEsRUFDZjtBQUNEO0FBM0RhLDRCQUNJLEtBQWE7QUFEakIsOEJBQU47QUFBQSxFQW9CSjtBQUFBLEdBcEJVO0FBNkROLE1BQU0sc0NBQW1FO0FBQUEsRUFDL0UsYUFBYSxhQUFtQztBQUFFLFdBQU87QUFBQSxFQUFNO0FBQUEsRUFDL0QsVUFBVSxhQUFrQztBQUFFLFdBQU87QUFBQSxFQUFJO0FBQUEsRUFDekQsWUFBWSxzQkFBMEQ7QUFBRSxXQUFPLHFCQUFxQixlQUFlLDJCQUEyQjtBQUFBLEVBQUc7QUFDbEo7IiwKICAibmFtZXMiOiBbImVsZW1lbnRUb1NlbGVjdCIsICJwcm9maWxlRWxlbWVudCIsICJpbmRleCJdCn0K
