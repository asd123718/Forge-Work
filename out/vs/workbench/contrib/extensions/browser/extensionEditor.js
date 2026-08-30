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
import { $, append, hide, setParentFlowTo, show } from "../../../../base/browser/dom.js";
import { ActionBar } from "../../../../base/browser/ui/actionbar/actionbar.js";
import { getDefaultHoverDelegate } from "../../../../base/browser/ui/hover/hoverDelegateFactory.js";
import { DomScrollableElement } from "../../../../base/browser/ui/scrollbar/scrollableElement.js";
import { CheckboxActionViewItem } from "../../../../base/browser/ui/toggle/toggle.js";
import { Action } from "../../../../base/common/actions.js";
import * as arrays from "../../../../base/common/arrays.js";
import { Cache } from "../../../../base/common/cache.js";
import { CancellationToken, CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { isCancellationError } from "../../../../base/common/errors.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import { Disposable, DisposableStore, MutableDisposable, dispose, toDisposable } from "../../../../base/common/lifecycle.js";
import { Schemas, matchesScheme } from "../../../../base/common/network.js";
import { isNative } from "../../../../base/common/platform.js";
import { isUndefined } from "../../../../base/common/types.js";
import { URI } from "../../../../base/common/uri.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import "./media/extensionEditor.css";
import { EditorContextKeys } from "../../../../editor/common/editorContextKeys.js";
import { TokenizationRegistry } from "../../../../editor/common/languages.js";
import { ILanguageService } from "../../../../editor/common/languages/language.js";
import { generateTokensCSSForColorMap } from "../../../../editor/common/languages/supports/tokenization.js";
import { localize } from "../../../../nls.js";
import { Action2, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { ContextKeyExpr, IContextKeyService, RawContextKey } from "../../../../platform/contextkey/common/contextkey.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { computeSize, FilterType, IExtensionGalleryService } from "../../../../platform/extensionManagement/common/extensionManagement.js";
import { areSameExtensions } from "../../../../platform/extensionManagement/common/extensionManagementUtil.js";
import { ExtensionType } from "../../../../platform/extensions/common/extensions.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { IStorageService } from "../../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { defaultCheckboxStyles } from "../../../../platform/theme/browser/defaultStyles.js";
import { buttonForeground, buttonHoverBackground, editorBackground, textLinkActiveForeground, textLinkForeground } from "../../../../platform/theme/common/colorRegistry.js";
import { IThemeService, registerThemingParticipant } from "../../../../platform/theme/common/themeService.js";
import { EditorPane } from "../../../browser/parts/editor/editorPane.js";
import { ExtensionFeaturesTab } from "./extensionFeaturesTab.js";
import {
  ButtonWithDropDownExtensionAction,
  ClearLanguageAction,
  DisableDropDownAction,
  EnableDropDownAction,
  ButtonWithDropdownExtensionActionViewItem,
  DropDownExtensionAction,
  ExtensionEditorManageExtensionAction,
  ExtensionStatusAction,
  ExtensionStatusLabelAction,
  InstallAnotherVersionAction,
  InstallDropdownAction,
  InstallingLabelAction,
  LocalInstallAction,
  MigrateDeprecatedExtensionAction,
  ExtensionRuntimeStateAction,
  RemoteInstallAction,
  SetColorThemeAction,
  SetFileIconThemeAction,
  SetLanguageAction,
  SetProductIconThemeAction,
  ToggleAutoUpdateForExtensionAction,
  UninstallAction,
  UpdateAction,
  WebInstallAction,
  TogglePreReleaseExtensionAction
} from "./extensionsActions.js";
import { Delegate } from "./extensionsList.js";
import { ExtensionData, ExtensionsGridView, ExtensionsTree, getExtensions } from "./extensionsViewer.js";
import { ExtensionRecommendationWidget, ExtensionStatusWidget, ExtensionWidget, InstallCountWidget, RatingsWidget, RemoteBadgeWidget, SponsorWidget, PublisherWidget, onClick, ExtensionKindIndicatorWidget, ExtensionIconWidget } from "./extensionsWidgets.js";
import { ExtensionContainers, ExtensionEditorTab, ExtensionState, IExtensionsWorkbenchService } from "../common/extensions.js";
import { DEFAULT_MARKDOWN_STYLES, renderMarkdownDocument } from "../../markdown/browser/markdownDocumentRenderer.js";
import { IWebviewService, KEYBINDING_CONTEXT_WEBVIEW_FIND_WIDGET_FOCUSED } from "../../webview/browser/webview.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { IExtensionRecommendationsService } from "../../../services/extensionRecommendations/common/extensionRecommendations.js";
import { IExtensionService } from "../../../services/extensions/common/extensions.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { ByteSize, IFileService } from "../../../../platform/files/common/files.js";
import { IUserDataProfilesService } from "../../../../platform/userDataProfile/common/userDataProfile.js";
import { IRemoteAgentService } from "../../../services/remote/common/remoteAgentService.js";
import { IExtensionGalleryManifestService } from "../../../../platform/extensionManagement/common/extensionGalleryManifest.js";
import { ShowCurrentReleaseNotesActionId } from "../../update/common/update.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { fromNow } from "../../../../base/common/date.js";
class NavBar extends Disposable {
  constructor(container) {
    super();
    this._onChange = this._register(new Emitter());
    this.onChange = this._onChange.event;
    this._currentId = null;
    const element = append(container, $(".navbar"));
    this.actions = [];
    this.actionbar = this._register(new ActionBar(element));
  }
  get currentId() {
    return this._currentId;
  }
  push(id, label, tooltip) {
    const action = new Action(id, label, void 0, true, () => this.update(id, true));
    action.tooltip = tooltip;
    this.actions.push(action);
    this.actionbar.push(action);
    if (this.actions.length === 1) {
      this.update(id);
    }
  }
  clear() {
    this.actions = dispose(this.actions);
    this.actionbar.clear();
  }
  switch(id) {
    const action = this.actions.find((action2) => action2.id === id);
    if (action) {
      action.run();
      return true;
    }
    return false;
  }
  update(id, focus) {
    this._currentId = id;
    this._onChange.fire({ id, focus: !!focus });
    this.actions.forEach((a) => a.checked = a.id === id);
  }
  dispose() {
    this.clear();
    super.dispose();
  }
}
var WebviewIndex = /* @__PURE__ */ ((WebviewIndex2) => {
  WebviewIndex2[WebviewIndex2["Readme"] = 0] = "Readme";
  WebviewIndex2[WebviewIndex2["Changelog"] = 1] = "Changelog";
  return WebviewIndex2;
})(WebviewIndex || {});
const CONTEXT_SHOW_PRE_RELEASE_VERSION = new RawContextKey("showPreReleaseVersion", false);
class ExtensionWithDifferentGalleryVersionWidget extends ExtensionWidget {
  constructor() {
    super(...arguments);
    this._gallery = null;
  }
  get gallery() {
    return this._gallery;
  }
  set gallery(gallery) {
    if (this.extension && gallery && !areSameExtensions(this.extension.identifier, gallery.identifier)) {
      return;
    }
    this._gallery = gallery;
    this.update();
  }
}
class VersionWidget extends ExtensionWithDifferentGalleryVersionWidget {
  constructor(container, hoverService) {
    super();
    this.element = append(container, $("code.version", void 0, "pre-release"));
    this._register(hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), this.element, localize("extension version", "Extension Version")));
    this.render();
  }
  render() {
    if (this.extension?.preRelease) {
      show(this.element);
    } else {
      hide(this.element);
    }
  }
}
let ExtensionEditor = class extends EditorPane {
  constructor(group, telemetryService, instantiationService, extensionsWorkbenchService, extensionGalleryService, themeService, notificationService, openerService, extensionRecommendationsService, storageService, extensionService, webviewService, languageService, contextMenuService, contextKeyService, hoverService) {
    super(ExtensionEditor.ID, group, telemetryService, themeService, storageService);
    this.instantiationService = instantiationService;
    this.extensionsWorkbenchService = extensionsWorkbenchService;
    this.extensionGalleryService = extensionGalleryService;
    this.notificationService = notificationService;
    this.openerService = openerService;
    this.extensionRecommendationsService = extensionRecommendationsService;
    this.extensionService = extensionService;
    this.webviewService = webviewService;
    this.languageService = languageService;
    this.contextMenuService = contextMenuService;
    this.contextKeyService = contextKeyService;
    this.hoverService = hoverService;
    this._scopedContextKeyService = this._register(new MutableDisposable());
    // Some action bar items use a webview whose vertical scroll position we track in this map
    this.initialScrollProgress = /* @__PURE__ */ new Map();
    // Spot when an ExtensionEditor instance gets reused for a different extension, in which case the vertical scroll positions must be zeroed
    this.currentIdentifier = "";
    this.layoutParticipants = [];
    this.contentDisposables = this._register(new DisposableStore());
    this.transientDisposables = this._register(new DisposableStore());
    this.activeElement = null;
    this.extensionReadme = null;
    this.extensionChangelog = null;
    this.extensionManifest = null;
  }
  get scopedContextKeyService() {
    return this._scopedContextKeyService.value;
  }
  createEditor(parent) {
    const root = append(parent, $(".extension-editor"));
    this._scopedContextKeyService.value = this.contextKeyService.createScoped(root);
    this._scopedContextKeyService.value.createKey("inExtensionEditor", true);
    this.showPreReleaseVersionContextKey = CONTEXT_SHOW_PRE_RELEASE_VERSION.bindTo(this._scopedContextKeyService.value);
    root.tabIndex = 0;
    root.style.outline = "none";
    root.setAttribute("role", "document");
    const header = append(root, $(".header"));
    const iconContainer = append(header, $(".icon-container"));
    const iconWidget = this.instantiationService.createInstance(ExtensionIconWidget, iconContainer);
    const remoteBadge = this.instantiationService.createInstance(RemoteBadgeWidget, iconContainer, true);
    const details = append(header, $(".details"));
    const title = append(details, $(".title"));
    const name = append(title, $("span.name.clickable", { role: "heading", tabIndex: 0 }));
    this._register(this.hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), name, localize("name", "Extension name")));
    const versionWidget = new VersionWidget(title, this.hoverService);
    const preview = append(title, $("span.preview"));
    this._register(this.hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), preview, localize("preview", "Preview")));
    preview.textContent = localize("preview", "Preview");
    const builtin = append(title, $("span.builtin"));
    builtin.textContent = localize("builtin", "Built-in");
    const subtitle = append(details, $(".subtitle"));
    const subTitleEntryContainers = [];
    const publisherContainer = append(subtitle, $(".subtitle-entry"));
    subTitleEntryContainers.push(publisherContainer);
    const publisherWidget = this.instantiationService.createInstance(PublisherWidget, publisherContainer, false);
    const extensionKindContainer = append(subtitle, $(".subtitle-entry"));
    subTitleEntryContainers.push(extensionKindContainer);
    const extensionKindWidget = this.instantiationService.createInstance(ExtensionKindIndicatorWidget, extensionKindContainer, false);
    const installCountContainer = append(subtitle, $(".subtitle-entry"));
    subTitleEntryContainers.push(installCountContainer);
    const installCountWidget = this.instantiationService.createInstance(InstallCountWidget, installCountContainer, false);
    const ratingsContainer = append(subtitle, $(".subtitle-entry"));
    subTitleEntryContainers.push(ratingsContainer);
    const ratingsWidget = this.instantiationService.createInstance(RatingsWidget, ratingsContainer, false);
    const sponsorContainer = append(subtitle, $(".subtitle-entry"));
    subTitleEntryContainers.push(sponsorContainer);
    const sponsorWidget = this.instantiationService.createInstance(SponsorWidget, sponsorContainer);
    const widgets = [
      iconWidget,
      remoteBadge,
      versionWidget,
      publisherWidget,
      extensionKindWidget,
      installCountWidget,
      ratingsWidget,
      sponsorWidget
    ];
    const description = append(details, $(".description"));
    const installAction = this.instantiationService.createInstance(InstallDropdownAction);
    const actions = [
      this.instantiationService.createInstance(ExtensionRuntimeStateAction),
      this.instantiationService.createInstance(ExtensionStatusLabelAction),
      this.instantiationService.createInstance(UpdateAction, true),
      this.instantiationService.createInstance(SetColorThemeAction),
      this.instantiationService.createInstance(SetFileIconThemeAction),
      this.instantiationService.createInstance(SetProductIconThemeAction),
      this.instantiationService.createInstance(SetLanguageAction),
      this.instantiationService.createInstance(ClearLanguageAction),
      this.instantiationService.createInstance(EnableDropDownAction),
      this.instantiationService.createInstance(TogglePreReleaseExtensionAction),
      this.instantiationService.createInstance(DisableDropDownAction),
      this.instantiationService.createInstance(RemoteInstallAction, false),
      this.instantiationService.createInstance(LocalInstallAction),
      this.instantiationService.createInstance(WebInstallAction),
      installAction,
      this.instantiationService.createInstance(InstallingLabelAction),
      this.instantiationService.createInstance(ButtonWithDropDownExtensionAction, "extensions.uninstall", UninstallAction.UninstallClass, [
        [
          this.instantiationService.createInstance(MigrateDeprecatedExtensionAction, false),
          this.instantiationService.createInstance(UninstallAction),
          this.instantiationService.createInstance(InstallAnotherVersionAction, null, true)
        ]
      ]),
      this.instantiationService.createInstance(ToggleAutoUpdateForExtensionAction),
      new ExtensionEditorManageExtensionAction(this.scopedContextKeyService || this.contextKeyService, this.instantiationService)
    ];
    const actionsAndStatusContainer = append(details, $(".actions-status-container"));
    const extensionActionBar = this._register(new ActionBar(actionsAndStatusContainer, {
      actionViewItemProvider: (action, options) => {
        if (action instanceof DropDownExtensionAction) {
          return action.createActionViewItem(options);
        }
        if (action instanceof ButtonWithDropDownExtensionAction) {
          return new ButtonWithDropdownExtensionActionViewItem(
            action,
            {
              ...options,
              icon: true,
              label: true,
              menuActionsOrProvider: { getActions: () => action.menuActions },
              menuActionClassNames: action.menuActionClassNames
            },
            this.contextMenuService
          );
        }
        if (action instanceof ToggleAutoUpdateForExtensionAction) {
          return new CheckboxActionViewItem(void 0, action, { ...options, icon: true, label: true, checkboxStyles: defaultCheckboxStyles });
        }
        return void 0;
      },
      focusOnlyEnabledItems: true
    }));
    extensionActionBar.push(actions, { icon: true, label: true });
    extensionActionBar.setFocusable(true);
    this._register(Event.any(...actions.map((a) => Event.filter(a.onDidChange, (e) => e.enabled !== void 0)))(() => {
      extensionActionBar.setFocusable(false);
      extensionActionBar.setFocusable(true);
    }));
    const otherExtensionContainers = [];
    const extensionStatusAction = this.instantiationService.createInstance(ExtensionStatusAction);
    const extensionStatusWidget = this._register(this.instantiationService.createInstance(ExtensionStatusWidget, append(actionsAndStatusContainer, $(".status")), extensionStatusAction));
    otherExtensionContainers.push(extensionStatusAction, new class extends ExtensionWidget {
      render() {
        actionsAndStatusContainer.classList.toggle("list-layout", this.extension?.state === ExtensionState.Installed);
      }
    }());
    const recommendationWidget = this.instantiationService.createInstance(ExtensionRecommendationWidget, append(details, $(".recommendation")));
    widgets.push(recommendationWidget);
    this._register(Event.any(extensionStatusWidget.onDidRender, recommendationWidget.onDidRender)(() => {
      if (this.dimension) {
        this.layout(this.dimension);
      }
    }));
    const extensionContainers = this.instantiationService.createInstance(ExtensionContainers, [...actions, ...widgets, ...otherExtensionContainers]);
    for (const disposable of [...actions, ...widgets, ...otherExtensionContainers, extensionContainers]) {
      this._register(disposable);
    }
    const onError = Event.chain(
      extensionActionBar.onDidRun,
      ($2) => $2.map(({ error }) => error).filter((error) => !!error)
    );
    this._register(onError(this.onError, this));
    const body = append(root, $(".body"));
    const navbar = this._register(new NavBar(body));
    const content = append(body, $(".content"));
    content.id = generateUuid();
    this.template = {
      builtin,
      content,
      description,
      header,
      name,
      navbar,
      preview,
      actionsAndStatusContainer,
      extensionActionBar,
      set extension(extension) {
        extensionContainers.extension = extension;
        let lastNonEmptySubtitleEntryContainer;
        for (const subTitleEntryElement of subTitleEntryContainers) {
          subTitleEntryElement.classList.remove("last-non-empty");
          if (subTitleEntryElement.children.length > 0) {
            lastNonEmptySubtitleEntryContainer = subTitleEntryElement;
          }
        }
        if (lastNonEmptySubtitleEntryContainer) {
          lastNonEmptySubtitleEntryContainer.classList.add("last-non-empty");
        }
      },
      set gallery(gallery) {
        versionWidget.gallery = gallery;
      },
      set manifest(manifest) {
        installAction.manifest = manifest;
      }
    };
  }
  async setInput(input, options, context, token) {
    await super.setInput(input, options, context, token);
    this.updatePreReleaseVersionContext();
    if (this.template) {
      await this.render(input.extension, this.template, !!options?.preserveFocus);
    }
  }
  setOptions(options) {
    const currentOptions = this.options;
    super.setOptions(options);
    this.updatePreReleaseVersionContext();
    if (this.input && this.template && currentOptions?.showPreReleaseVersion !== options?.showPreReleaseVersion) {
      this.render(this.input.extension, this.template, !!options?.preserveFocus);
      return;
    }
    if (options?.tab) {
      this.template?.navbar.switch(options.tab);
    }
  }
  updatePreReleaseVersionContext() {
    let showPreReleaseVersion = this.options?.showPreReleaseVersion;
    if (isUndefined(showPreReleaseVersion)) {
      showPreReleaseVersion = !!this.input.extension.gallery?.properties.isPreReleaseVersion;
    }
    this.showPreReleaseVersionContextKey?.set(showPreReleaseVersion);
  }
  async openTab(tab) {
    if (!this.input || !this.template) {
      return;
    }
    if (this.template.navbar.switch(tab)) {
      return;
    }
    if (tab === ExtensionEditorTab.ExtensionPack) {
      this.template.navbar.switch(ExtensionEditorTab.Readme);
    }
  }
  async getGalleryVersionToShow(extension, preRelease) {
    if (extension.resourceExtension) {
      return null;
    }
    if (extension.local?.source === "resource") {
      return null;
    }
    if (isUndefined(preRelease)) {
      return null;
    }
    if (preRelease === extension.gallery?.properties.isPreReleaseVersion) {
      return null;
    }
    if (preRelease && !extension.hasPreReleaseVersion) {
      return null;
    }
    if (!preRelease && !extension.hasReleaseVersion) {
      return null;
    }
    return (await this.extensionGalleryService.getExtensions([{ ...extension.identifier, preRelease, hasPreRelease: extension.hasPreReleaseVersion }], CancellationToken.None))[0] || null;
  }
  async render(extension, template, preserveFocus) {
    this.activeElement = null;
    this.transientDisposables.clear();
    const token = this.transientDisposables.add(new CancellationTokenSource()).token;
    const gallery = await this.getGalleryVersionToShow(extension, this.options?.showPreReleaseVersion);
    if (token.isCancellationRequested) {
      return;
    }
    this.extensionReadme = new Cache(() => gallery ? this.extensionGalleryService.getReadme(gallery, token) : extension.getReadme(token));
    this.extensionChangelog = new Cache(() => gallery ? this.extensionGalleryService.getChangelog(gallery, token) : extension.getChangelog(token));
    this.extensionManifest = new Cache(() => gallery ? this.extensionGalleryService.getManifest(gallery, token) : extension.getManifest(token));
    template.extension = extension;
    template.gallery = gallery;
    template.manifest = null;
    template.name.textContent = extension.displayName;
    template.name.classList.toggle("clickable", !!extension.url);
    template.name.classList.toggle("deprecated", !!extension.deprecationInfo);
    template.preview.style.display = extension.preview ? "inherit" : "none";
    template.builtin.style.display = extension.isBuiltin ? "inherit" : "none";
    template.description.textContent = extension.description;
    if (extension.url) {
      this.transientDisposables.add(onClick(template.name, () => this.openerService.open(URI.parse(extension.url))));
    }
    const manifest = await this.extensionManifest.get().promise;
    if (token.isCancellationRequested) {
      return;
    }
    if (manifest) {
      template.manifest = manifest;
    }
    this.renderNavbar(extension, manifest, template, preserveFocus);
    const extRecommendations = this.extensionRecommendationsService.getAllRecommendationsWithReason();
    let recommendationsData = {};
    if (extRecommendations[extension.identifier.id.toLowerCase()]) {
      recommendationsData = { recommendationReason: extRecommendations[extension.identifier.id.toLowerCase()].reasonId };
    }
    this.telemetryService.publicLog("extensionGallery:openExtension", { ...extension.telemetryData, ...recommendationsData });
  }
  renderNavbar(extension, manifest, template, preserveFocus) {
    template.content.innerText = "";
    template.navbar.clear();
    if (this.currentIdentifier !== extension.identifier.id) {
      this.initialScrollProgress.clear();
      this.currentIdentifier = extension.identifier.id;
    }
    template.navbar.push(ExtensionEditorTab.Readme, localize("details", "Details"), localize("detailstooltip", "Extension details, rendered from the extension's 'README.md' file"));
    if (manifest) {
      template.navbar.push(ExtensionEditorTab.Features, localize("features", "Features"), localize("featurestooltip", "Lists features contributed by this extension"));
    }
    if (extension.hasChangelog()) {
      template.navbar.push(ExtensionEditorTab.Changelog, localize("changelog", "Changelog"), localize("changelogtooltip", "Extension update history, rendered from the extension's 'CHANGELOG.md' file"));
    }
    if (extension.dependencies.length) {
      template.navbar.push(ExtensionEditorTab.Dependencies, localize("dependencies", "Dependencies"), localize("dependenciestooltip", "Lists extensions this extension depends on"));
    }
    if (manifest && manifest.extensionPack?.length && !this.shallRenderAsExtensionPack(manifest)) {
      template.navbar.push(ExtensionEditorTab.ExtensionPack, localize("extensionpack", "Extension Pack"), localize("extensionpacktooltip", "Lists extensions those will be installed together with this extension"));
    }
    if (this.options?.tab) {
      template.navbar.switch(this.options.tab);
    }
    if (template.navbar.currentId) {
      this.onNavbarChange(extension, { id: template.navbar.currentId, focus: !preserveFocus }, template);
    }
    template.navbar.onChange((e) => this.onNavbarChange(extension, e, template), this, this.transientDisposables);
  }
  clearInput() {
    this.contentDisposables.clear();
    this.transientDisposables.clear();
    super.clearInput();
  }
  focus() {
    super.focus();
    this.activeElement?.focus();
  }
  showFind() {
    this.activeWebview?.showFind();
  }
  runFindAction(previous) {
    this.activeWebview?.runFindAction(previous);
  }
  get activeWebview() {
    if (!this.activeElement || !this.activeElement.runFindAction) {
      return void 0;
    }
    return this.activeElement;
  }
  onNavbarChange(extension, { id, focus }, template) {
    this.contentDisposables.clear();
    template.content.innerText = "";
    this.activeElement = null;
    if (id) {
      const cts = new CancellationTokenSource();
      this.contentDisposables.add(toDisposable(() => cts.dispose(true)));
      this.open(id, extension, template, cts.token).then((activeElement) => {
        if (cts.token.isCancellationRequested) {
          return;
        }
        this.activeElement = activeElement;
        if (focus) {
          this.focus();
        }
      });
    }
  }
  open(id, extension, template, token) {
    const details = append(template.content, $(".details"));
    const contentContainer = append(details, $(".content-container"));
    const additionalDetailsContainer = append(details, $(".additional-details-container"));
    const layout = () => details.classList.toggle("narrow", this.dimension && this.dimension.width < 500);
    layout();
    this.contentDisposables.add(toDisposable(arrays.insert(this.layoutParticipants, { layout })));
    this.renderAdditionalDetails(additionalDetailsContainer, extension);
    switch (id) {
      case ExtensionEditorTab.Readme:
        return this.openDetails(extension, contentContainer, token);
      case ExtensionEditorTab.Features:
        return this.openFeatures(extension, contentContainer, token);
      case ExtensionEditorTab.Changelog:
        return this.openChangelog(extension, contentContainer, token);
      case ExtensionEditorTab.Dependencies:
        return this.openExtensionDependencies(extension, contentContainer, token);
      case ExtensionEditorTab.ExtensionPack:
        return this.openExtensionPack(extension, contentContainer, token);
    }
    return Promise.resolve(null);
  }
  async openMarkdown(extension, cacheResult, noContentCopy, container, webviewIndex, title, token) {
    try {
      const body = await this.renderMarkdown(extension, cacheResult, container, token);
      if (token.isCancellationRequested) {
        return Promise.resolve(null);
      }
      const webview = this.contentDisposables.add(this.webviewService.createWebviewOverlay({
        title,
        options: {
          enableFindWidget: true,
          tryRestoreScrollPosition: true,
          disableServiceWorker: true
        },
        contentOptions: {},
        extension: void 0
      }));
      webview.initialScrollProgress = this.initialScrollProgress.get(webviewIndex) || 0;
      webview.claim(this, this.window, this.scopedContextKeyService);
      setParentFlowTo(webview.container, container);
      webview.setAnchorElement(container);
      webview.setHtml(body);
      webview.claim(this, this.window, void 0);
      this.contentDisposables.add(webview.onDidFocus(() => this._onDidFocus?.fire()));
      this.contentDisposables.add(webview.onDidScroll(() => this.initialScrollProgress.set(webviewIndex, webview.initialScrollProgress)));
      let isDisposed = false;
      this.contentDisposables.add(toDisposable(() => {
        isDisposed = true;
      }));
      this.contentDisposables.add(this.themeService.onDidColorThemeChange(async () => {
        const body2 = await this.renderMarkdown(extension, cacheResult, container);
        if (!isDisposed) {
          webview.setHtml(body2);
        }
      }));
      this.contentDisposables.add(webview.onDidClickLink((link) => {
        if (!link) {
          return;
        }
        if (matchesScheme(link, Schemas.http) || matchesScheme(link, Schemas.https) || matchesScheme(link, Schemas.mailto)) {
          this.openerService.open(link);
        } else if (matchesScheme(link, Schemas.command) && extension.type === ExtensionType.System) {
          this.openerService.open(link, {
            allowCommands: [
              ShowCurrentReleaseNotesActionId
            ]
          });
        }
      }));
      return webview;
    } catch (e) {
      const p = append(container, $("p.nocontent"));
      p.textContent = noContentCopy;
      return p;
    }
  }
  async renderMarkdown(extension, cacheResult, container, token) {
    const contents = await this.loadContents(() => cacheResult, container);
    if (token?.isCancellationRequested) {
      return "";
    }
    const allowedLinkProtocols = [Schemas.http, Schemas.https, Schemas.mailto];
    const content = await renderMarkdownDocument(contents, this.extensionService, this.languageService, {
      sanitizerConfig: {
        allowedLinkProtocols: {
          override: extension.type === ExtensionType.System ? [...allowedLinkProtocols, Schemas.command] : allowedLinkProtocols
        }
      }
    }, token);
    if (token?.isCancellationRequested) {
      return "";
    }
    return this.renderBody(content);
  }
  renderBody(body) {
    const nonce = generateUuid();
    const colorMap = TokenizationRegistry.getColorMap();
    const css = colorMap ? generateTokensCSSForColorMap(colorMap) : "";
    return `<!DOCTYPE html>
		<html>
			<head>
				<meta http-equiv="Content-type" content="text/html;charset=UTF-8">
				<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; media-src https:; script-src 'none'; style-src 'nonce-${nonce}';">
				<style nonce="${nonce}">
					${DEFAULT_MARKDOWN_STYLES}

					/* prevent scroll-to-top button from blocking the body text */
					body {
						padding-bottom: 75px;
					}

					#scroll-to-top {
						position: fixed;
						width: 32px;
						height: 32px;
						right: 25px;
						bottom: 25px;
						background-color: var(--vscode-button-secondaryBackground);
						border-color: var(--vscode-button-border);
						border-radius: 50%;
						cursor: pointer;
						box-shadow: 1px 1px 1px rgba(0,0,0,.25);
						outline: none;
						display: flex;
						justify-content: center;
						align-items: center;
					}

					#scroll-to-top:hover {
						background-color: var(--vscode-button-secondaryHoverBackground);
						box-shadow: 2px 2px 2px rgba(0,0,0,.25);
					}

					body.vscode-high-contrast #scroll-to-top {
						border-width: 2px;
						border-style: solid;
						box-shadow: none;
					}

					#scroll-to-top span.icon::before {
						content: "";
						display: block;
						background: var(--vscode-button-secondaryForeground);
						/* Chevron up icon */
						webkit-mask-image: url('data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0idXRmLTgiPz4KPCEtLSBHZW5lcmF0b3I6IEFkb2JlIElsbHVzdHJhdG9yIDE5LjIuMCwgU1ZHIEV4cG9ydCBQbHVnLUluIC4gU1ZHIFZlcnNpb246IDYuMDAgQnVpbGQgMCkgIC0tPgo8c3ZnIHZlcnNpb249IjEuMSIgaWQ9IkxheWVyXzEiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIgeG1sbnM6eGxpbms9Imh0dHA6Ly93d3cudzMub3JnLzE5OTkveGxpbmsiIHg9IjBweCIgeT0iMHB4IgoJIHZpZXdCb3g9IjAgMCAxNiAxNiIgc3R5bGU9ImVuYWJsZS1iYWNrZ3JvdW5kOm5ldyAwIDAgMTYgMTY7IiB4bWw6c3BhY2U9InByZXNlcnZlIj4KPHN0eWxlIHR5cGU9InRleHQvY3NzIj4KCS5zdDB7ZmlsbDojRkZGRkZGO30KCS5zdDF7ZmlsbDpub25lO30KPC9zdHlsZT4KPHRpdGxlPnVwY2hldnJvbjwvdGl0bGU+CjxwYXRoIGNsYXNzPSJzdDAiIGQ9Ik04LDUuMWwtNy4zLDcuM0wwLDExLjZsOC04bDgsOGwtMC43LDAuN0w4LDUuMXoiLz4KPHJlY3QgY2xhc3M9InN0MSIgd2lkdGg9IjE2IiBoZWlnaHQ9IjE2Ii8+Cjwvc3ZnPgo=');
						-webkit-mask-image: url('data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0idXRmLTgiPz4KPCEtLSBHZW5lcmF0b3I6IEFkb2JlIElsbHVzdHJhdG9yIDE5LjIuMCwgU1ZHIEV4cG9ydCBQbHVnLUluIC4gU1ZHIFZlcnNpb246IDYuMDAgQnVpbGQgMCkgIC0tPgo8c3ZnIHZlcnNpb249IjEuMSIgaWQ9IkxheWVyXzEiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIgeG1sbnM6eGxpbms9Imh0dHA6Ly93d3cudzMub3JnLzE5OTkveGxpbmsiIHg9IjBweCIgeT0iMHB4IgoJIHZpZXdCb3g9IjAgMCAxNiAxNiIgc3R5bGU9ImVuYWJsZS1iYWNrZ3JvdW5kOm5ldyAwIDAgMTYgMTY7IiB4bWw6c3BhY2U9InByZXNlcnZlIj4KPHN0eWxlIHR5cGU9InRleHQvY3NzIj4KCS5zdDB7ZmlsbDojRkZGRkZGO30KCS5zdDF7ZmlsbDpub25lO30KPC9zdHlsZT4KPHRpdGxlPnVwY2hldnJvbjwvdGl0bGU+CjxwYXRoIGNsYXNzPSJzdDAiIGQ9Ik04LDUuMWwtNy4zLDcuM0wwLDExLjZsOC04bDgsOGwtMC43LDAuN0w4LDUuMXoiLz4KPHJlY3QgY2xhc3M9InN0MSIgd2lkdGg9IjE2IiBoZWlnaHQ9IjE2Ii8+Cjwvc3ZnPgo=');
						width: 16px;
						height: 16px;
					}
					${css}
				</style>
			</head>
			<body>
				<a id="scroll-to-top" role="button" aria-label="scroll to top" href="#"><span class="icon"></span></a>
				${body}
			</body>
		</html>`;
  }
  async openDetails(extension, contentContainer, token) {
    let activeElement = null;
    const manifest = await this.extensionManifest.get().promise;
    if (manifest && manifest.extensionPack?.length && this.shallRenderAsExtensionPack(manifest)) {
      activeElement = await this.openExtensionPackReadme(extension, manifest, contentContainer, token);
    } else {
      activeElement = await this.openMarkdown(extension, this.extensionReadme.get(), localize("noReadme", "No README available."), contentContainer, 0 /* Readme */, localize("Readme title", "Readme"), token);
    }
    return activeElement;
  }
  shallRenderAsExtensionPack(manifest) {
    return !!manifest.categories?.some((category) => category.toLowerCase() === "extension packs");
  }
  async openExtensionPackReadme(extension, manifest, container, token) {
    if (token.isCancellationRequested) {
      return Promise.resolve(null);
    }
    const extensionPackReadme = append(container, $("div", { class: "extension-pack-readme" }));
    extensionPackReadme.style.margin = "0 auto";
    extensionPackReadme.style.maxWidth = "882px";
    const extensionPack = append(extensionPackReadme, $("div", { class: "extension-pack" }));
    const packCount = manifest.extensionPack.length;
    const headerHeight = 37;
    const contentMinHeight = 200;
    const layout = () => {
      extensionPackReadme.classList.remove("one-row", "two-rows", "three-rows", "more-rows");
      const availableHeight = container.clientHeight;
      const availableForPack = Math.max(availableHeight - headerHeight - contentMinHeight, 0);
      let rowClass = "one-row";
      if (availableForPack >= 302 && packCount > 6) {
        rowClass = "more-rows";
      } else if (availableForPack >= 282 && packCount > 4) {
        rowClass = "three-rows";
      } else if (availableForPack >= 200 && packCount > 2) {
        rowClass = "two-rows";
      } else {
        rowClass = "one-row";
      }
      extensionPackReadme.classList.add(rowClass);
    };
    layout();
    this.contentDisposables.add(toDisposable(arrays.insert(this.layoutParticipants, { layout })));
    const extensionPackHeader = append(extensionPack, $("div.header"));
    extensionPackHeader.textContent = localize("extension pack", "Extension Pack ({0})", manifest.extensionPack.length);
    const extensionPackContent = append(extensionPack, $("div", { class: "extension-pack-content" }));
    extensionPackContent.setAttribute("tabindex", "0");
    const readmeContent = append(extensionPackReadme, $("div.readme-content"));
    await Promise.all([
      this.renderExtensionPack(manifest, extensionPackContent, token),
      this.openMarkdown(extension, this.extensionReadme.get(), localize("noReadme", "No README available."), readmeContent, 0 /* Readme */, localize("Readme title", "Readme"), token)
    ]);
    return { focus: () => extensionPackContent.focus() };
  }
  renderAdditionalDetails(container, extension) {
    const content = $("div", { class: "additional-details-content", tabindex: "0" });
    const scrollableContent = new DomScrollableElement(content, {});
    const layout = () => scrollableContent.scanDomNode();
    const removeLayoutParticipant = arrays.insert(this.layoutParticipants, { layout });
    this.contentDisposables.add(toDisposable(removeLayoutParticipant));
    this.contentDisposables.add(scrollableContent);
    this.contentDisposables.add(this.instantiationService.createInstance(AdditionalDetailsWidget, content, extension));
    append(container, scrollableContent.getDomNode());
    scrollableContent.scanDomNode();
  }
  async openChangelog(extension, contentContainer, token) {
    const activeElement = await this.openMarkdown(extension, this.extensionChangelog.get(), localize("noChangelog", "No Changelog available."), contentContainer, 1 /* Changelog */, localize("Changelog title", "Changelog"), token);
    return activeElement;
  }
  async openFeatures(extension, contentContainer, token) {
    const manifest = await this.loadContents(() => this.extensionManifest.get(), contentContainer);
    if (token.isCancellationRequested) {
      return null;
    }
    if (!manifest) {
      return null;
    }
    const extensionFeaturesTab = this.contentDisposables.add(this.instantiationService.createInstance(ExtensionFeaturesTab, manifest, this.options?.feature));
    const featureLayout = () => extensionFeaturesTab.layout(contentContainer.clientHeight, contentContainer.clientWidth);
    const removeLayoutParticipant = arrays.insert(this.layoutParticipants, { layout: featureLayout });
    this.contentDisposables.add(toDisposable(removeLayoutParticipant));
    append(contentContainer, extensionFeaturesTab.domNode);
    featureLayout();
    return extensionFeaturesTab.domNode;
  }
  openExtensionDependencies(extension, contentContainer, token) {
    if (token.isCancellationRequested) {
      return Promise.resolve(null);
    }
    if (arrays.isFalsyOrEmpty(extension.dependencies)) {
      append(contentContainer, $("p.nocontent")).textContent = localize("noDependencies", "No Dependencies");
      return Promise.resolve(contentContainer);
    }
    const content = $("div", { class: "subcontent" });
    const scrollableContent = new DomScrollableElement(content, {});
    append(contentContainer, scrollableContent.getDomNode());
    this.contentDisposables.add(scrollableContent);
    const dependenciesTree = this.instantiationService.createInstance(
      ExtensionsTree,
      new ExtensionData(extension, null, (extension2) => extension2.dependencies || [], this.extensionsWorkbenchService),
      content,
      {
        listBackground: editorBackground
      }
    );
    const depLayout = () => {
      scrollableContent.scanDomNode();
      const scrollDimensions = scrollableContent.getScrollDimensions();
      dependenciesTree.layout(scrollDimensions.height);
    };
    const removeLayoutParticipant = arrays.insert(this.layoutParticipants, { layout: depLayout });
    this.contentDisposables.add(toDisposable(removeLayoutParticipant));
    this.contentDisposables.add(dependenciesTree);
    depLayout();
    return Promise.resolve({ focus() {
      dependenciesTree.domFocus();
    } });
  }
  async openExtensionPack(extension, contentContainer, token) {
    if (token.isCancellationRequested) {
      return Promise.resolve(null);
    }
    const manifest = await this.loadContents(() => this.extensionManifest.get(), contentContainer);
    if (token.isCancellationRequested) {
      return null;
    }
    if (!manifest) {
      return null;
    }
    return this.renderExtensionPack(manifest, contentContainer, token);
  }
  async renderExtensionPack(manifest, parent, token) {
    if (token.isCancellationRequested) {
      return null;
    }
    const content = $("div", { class: "subcontent" });
    const scrollableContent = new DomScrollableElement(content, { useShadows: false });
    append(parent, scrollableContent.getDomNode());
    const extensionsGridView = this.instantiationService.createInstance(ExtensionsGridView, content, new Delegate());
    const extensions = await getExtensions(manifest.extensionPack, this.extensionsWorkbenchService);
    extensionsGridView.setExtensions(extensions);
    scrollableContent.scanDomNode();
    this.contentDisposables.add(scrollableContent);
    this.contentDisposables.add(extensionsGridView);
    this.contentDisposables.add(toDisposable(arrays.insert(this.layoutParticipants, { layout: () => scrollableContent.scanDomNode() })));
    return content;
  }
  loadContents(loadingTask, container) {
    container.classList.add("loading");
    const result = this.contentDisposables.add(loadingTask());
    const onDone = () => container.classList.remove("loading");
    result.promise.then(onDone, onDone);
    return result.promise;
  }
  layout(dimension) {
    this.dimension = dimension;
    this.layoutParticipants.forEach((p) => p.layout());
  }
  onError(err) {
    if (isCancellationError(err)) {
      return;
    }
    this.notificationService.error(err);
  }
};
ExtensionEditor.ID = "workbench.editor.extension";
ExtensionEditor = __decorateClass([
  __decorateParam(1, ITelemetryService),
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, IExtensionsWorkbenchService),
  __decorateParam(4, IExtensionGalleryService),
  __decorateParam(5, IThemeService),
  __decorateParam(6, INotificationService),
  __decorateParam(7, IOpenerService),
  __decorateParam(8, IExtensionRecommendationsService),
  __decorateParam(9, IStorageService),
  __decorateParam(10, IExtensionService),
  __decorateParam(11, IWebviewService),
  __decorateParam(12, ILanguageService),
  __decorateParam(13, IContextMenuService),
  __decorateParam(14, IContextKeyService),
  __decorateParam(15, IHoverService)
], ExtensionEditor);
let AdditionalDetailsWidget = class extends Disposable {
  constructor(container, extension, hoverService, openerService, userDataProfilesService, remoteAgentService, fileService, uriIdentityService, extensionsWorkbenchService, extensionGalleryManifestService) {
    super();
    this.container = container;
    this.hoverService = hoverService;
    this.openerService = openerService;
    this.userDataProfilesService = userDataProfilesService;
    this.remoteAgentService = remoteAgentService;
    this.fileService = fileService;
    this.uriIdentityService = uriIdentityService;
    this.extensionsWorkbenchService = extensionsWorkbenchService;
    this.extensionGalleryManifestService = extensionGalleryManifestService;
    this.disposables = this._register(new DisposableStore());
    this.render(extension);
    this._register(this.extensionsWorkbenchService.onChange((e) => {
      if (e && areSameExtensions(e.identifier, extension.identifier) && e.server === extension.server) {
        this.render(e);
      }
    }));
  }
  render(extension) {
    this.container.innerText = "";
    this.disposables.clear();
    if (extension.local) {
      this.renderInstallInfo(this.container, extension.local);
    }
    if (extension.gallery) {
      this.renderMarketplaceInfo(this.container, extension);
    }
    this.renderCategories(this.container, extension);
    this.renderExtensionResources(this.container, extension);
  }
  renderCategories(container, extension) {
    if (extension.categories.length) {
      const categoriesContainer = append(container, $(".categories-container.additional-details-element"));
      append(categoriesContainer, $(".additional-details-title", void 0, localize("categories", "Categories")));
      const categoriesElement = append(categoriesContainer, $(".categories"));
      this.extensionGalleryManifestService.getExtensionGalleryManifest().then((manifest) => {
        const hasCategoryFilter = manifest?.capabilities.extensionQuery.filtering?.some(({ name }) => name === FilterType.Category);
        for (const category of extension.categories) {
          const categoryElement = append(categoriesElement, $("span.category", { tabindex: "0" }, category));
          if (hasCategoryFilter) {
            categoryElement.classList.add("clickable");
            this.disposables.add(onClick(categoryElement, () => this.extensionsWorkbenchService.openSearch(`@category:"${category}"`)));
          }
        }
      });
    }
  }
  renderExtensionResources(container, extension) {
    const resources = [];
    if (extension.repository) {
      try {
        resources.push([localize("repository", "Repository"), ThemeIcon.fromId(Codicon.repo.id), URI.parse(extension.repository)]);
      } catch (error) {
      }
    }
    if (extension.supportUrl) {
      try {
        resources.push([localize("issues", "Issues"), ThemeIcon.fromId(Codicon.issues.id), URI.parse(extension.supportUrl)]);
      } catch (error) {
      }
    }
    if (extension.licenseUrl) {
      try {
        resources.push([localize("license", "License"), ThemeIcon.fromId(Codicon.linkExternal.id), URI.parse(extension.licenseUrl)]);
      } catch (error) {
      }
    }
    if (extension.publisherUrl) {
      resources.push([extension.publisherDisplayName, ThemeIcon.fromId(Codicon.linkExternal.id), extension.publisherUrl]);
    }
    if (extension.url) {
      resources.push([localize("Marketplace", "Marketplace"), ThemeIcon.fromId(Codicon.linkExternal.id), URI.parse(extension.url)]);
    }
    if (resources.length || extension.publisherSponsorLink) {
      const extensionResourcesContainer = append(container, $(".resources-container.additional-details-element"));
      append(extensionResourcesContainer, $(".additional-details-title", void 0, localize("resources", "Resources")));
      const resourcesElement = append(extensionResourcesContainer, $(".resources"));
      for (const [label, icon, uri] of resources) {
        const resourceElement = append(resourcesElement, $(".resource"));
        append(resourceElement, $(ThemeIcon.asCSSSelector(icon)));
        append(resourceElement, $("a", { tabindex: "0" }, label));
        this.disposables.add(onClick(resourceElement, () => this.openerService.open(uri)));
        this.disposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), resourceElement, uri.toString()));
      }
    }
  }
  renderInstallInfo(container, extension) {
    const installInfoContainer = append(container, $(".more-info-container.additional-details-element"));
    append(installInfoContainer, $(".additional-details-title", void 0, localize("Install Info", "Installation")));
    const installInfo = append(installInfoContainer, $(".more-info"));
    append(
      installInfo,
      $(
        ".more-info-entry",
        void 0,
        $("div.more-info-entry-name", void 0, localize("id", "Identifier")),
        $("code", void 0, extension.identifier.id)
      )
    );
    if (extension.type !== ExtensionType.System) {
      append(
        installInfo,
        $(
          ".more-info-entry",
          void 0,
          $("div.more-info-entry-name", void 0, localize("Version", "Version")),
          $("code", void 0, extension.manifest.version)
        )
      );
    }
    if (extension.installedTimestamp) {
      append(
        installInfo,
        $(
          ".more-info-entry",
          void 0,
          $("div.more-info-entry-name", void 0, localize("last updated", "Last Updated")),
          $("div", {
            "title": new Date(extension.installedTimestamp).toString()
          }, fromNow(extension.installedTimestamp, true, true, true))
        )
      );
    }
    if (!extension.isBuiltin && extension.source !== "gallery") {
      const element = $("div", void 0, extension.source === "vsix" ? localize("vsix", "VSIX") : localize("other", "Local"));
      append(
        installInfo,
        $(
          ".more-info-entry",
          void 0,
          $("div.more-info-entry-name", void 0, localize("source", "Source")),
          element
        )
      );
      if (isNative && extension.source === "resource" && extension.location.scheme === Schemas.file) {
        element.classList.add("link");
        element.tabIndex = 0;
        element.setAttribute("role", "link");
        element.title = extension.location.fsPath;
        this.disposables.add(onClick(element, () => this.openerService.open(extension.location, { openExternal: true })));
      }
    }
    if (extension.size) {
      const element = $("div", void 0, ByteSize.formatSize(extension.size));
      append(
        installInfo,
        $(
          ".more-info-entry",
          void 0,
          $("div.more-info-entry-name", { title: localize("size when installed", "Size when installed") }, localize("size", "Size")),
          element
        )
      );
      if (isNative && extension.location.scheme === Schemas.file) {
        element.classList.add("link");
        element.tabIndex = 0;
        element.setAttribute("role", "link");
        element.title = extension.location.fsPath;
        this.disposables.add(onClick(element, () => this.openerService.open(extension.location, { openExternal: true })));
      }
    }
    this.getCacheLocation(extension).then((cacheLocation) => {
      if (!cacheLocation) {
        return;
      }
      computeSize(cacheLocation, this.fileService).then((cacheSize) => {
        if (!cacheSize) {
          return;
        }
        const element = $("div", void 0, ByteSize.formatSize(cacheSize));
        append(
          installInfo,
          $(
            ".more-info-entry",
            void 0,
            $("div.more-info-entry-name", { title: localize("disk space used", "Cache size") }, localize("cache size", "Cache")),
            element
          )
        );
        if (isNative && extension.location.scheme === Schemas.file) {
          element.classList.add("link");
          element.tabIndex = 0;
          element.setAttribute("role", "link");
          element.title = cacheLocation.fsPath;
          this.disposables.add(onClick(element, () => this.openerService.open(cacheLocation.with({ scheme: Schemas.file }), { openExternal: true })));
        }
      });
    });
  }
  async getCacheLocation(extension) {
    let extensionCacheLocation = this.uriIdentityService.extUri.joinPath(this.userDataProfilesService.defaultProfile.globalStorageHome, extension.identifier.id.toLowerCase());
    if (extension.location.scheme === Schemas.vscodeRemote) {
      const environment = await this.remoteAgentService.getEnvironment();
      if (!environment) {
        return void 0;
      }
      extensionCacheLocation = this.uriIdentityService.extUri.joinPath(environment.globalStorageHome, extension.identifier.id.toLowerCase());
    }
    return extensionCacheLocation;
  }
  renderMarketplaceInfo(container, extension) {
    const gallery = extension.gallery;
    const moreInfoContainer = append(container, $(".more-info-container.additional-details-element"));
    append(moreInfoContainer, $(".additional-details-title", void 0, localize("Marketplace Info", "Marketplace")));
    const moreInfo = append(moreInfoContainer, $(".more-info"));
    if (gallery) {
      if (!extension.local) {
        append(
          moreInfo,
          $(
            ".more-info-entry",
            void 0,
            $("div.more-info-entry-name", void 0, localize("id", "Identifier")),
            $("code", void 0, extension.identifier.id)
          )
        );
        append(
          moreInfo,
          $(
            ".more-info-entry",
            void 0,
            $("div.more-info-entry-name", void 0, localize("Version", "Version")),
            $("code", void 0, gallery.version)
          )
        );
      }
      append(
        moreInfo,
        $(
          ".more-info-entry",
          void 0,
          $("div.more-info-entry-name", void 0, localize("published", "Published")),
          $("div", {
            "title": new Date(gallery.releaseDate).toString()
          }, fromNow(gallery.releaseDate, true, true, true))
        ),
        $(
          ".more-info-entry",
          void 0,
          $("div.more-info-entry-name", void 0, localize("last released", "Last Released")),
          $("div", {
            "title": new Date(gallery.lastUpdated).toString()
          }, fromNow(gallery.lastUpdated, true, true, true))
        )
      );
    }
  }
};
AdditionalDetailsWidget = __decorateClass([
  __decorateParam(2, IHoverService),
  __decorateParam(3, IOpenerService),
  __decorateParam(4, IUserDataProfilesService),
  __decorateParam(5, IRemoteAgentService),
  __decorateParam(6, IFileService),
  __decorateParam(7, IUriIdentityService),
  __decorateParam(8, IExtensionsWorkbenchService),
  __decorateParam(9, IExtensionGalleryManifestService)
], AdditionalDetailsWidget);
const contextKeyExpr = ContextKeyExpr.and(ContextKeyExpr.equals("activeEditor", ExtensionEditor.ID), EditorContextKeys.focus.toNegated());
registerAction2(class ShowExtensionEditorFindAction extends Action2 {
  constructor() {
    super({
      id: "editor.action.extensioneditor.showfind",
      title: localize("find", "Find"),
      keybinding: {
        when: contextKeyExpr,
        weight: KeybindingWeight.EditorContrib,
        primary: KeyMod.CtrlCmd | KeyCode.KeyF
      }
    });
  }
  run(accessor) {
    const extensionEditor = getExtensionEditor(accessor);
    extensionEditor?.showFind();
  }
});
registerAction2(class StartExtensionEditorFindNextAction extends Action2 {
  constructor() {
    super({
      id: "editor.action.extensioneditor.findNext",
      title: localize("find next", "Find Next"),
      keybinding: {
        when: ContextKeyExpr.and(
          contextKeyExpr,
          KEYBINDING_CONTEXT_WEBVIEW_FIND_WIDGET_FOCUSED
        ),
        primary: KeyCode.Enter,
        weight: KeybindingWeight.EditorContrib
      }
    });
  }
  run(accessor) {
    const extensionEditor = getExtensionEditor(accessor);
    extensionEditor?.runFindAction(false);
  }
});
registerAction2(class StartExtensionEditorFindPreviousAction extends Action2 {
  constructor() {
    super({
      id: "editor.action.extensioneditor.findPrevious",
      title: localize("find previous", "Find Previous"),
      keybinding: {
        when: ContextKeyExpr.and(
          contextKeyExpr,
          KEYBINDING_CONTEXT_WEBVIEW_FIND_WIDGET_FOCUSED
        ),
        primary: KeyMod.Shift | KeyCode.Enter,
        weight: KeybindingWeight.EditorContrib
      }
    });
  }
  run(accessor) {
    const extensionEditor = getExtensionEditor(accessor);
    extensionEditor?.runFindAction(true);
  }
});
registerThemingParticipant((theme, collector) => {
  const link = theme.getColor(textLinkForeground);
  if (link) {
    collector.addRule(`.monaco-workbench .extension-editor .content .details .additional-details-container .resources-container a.resource { color: ${link}; }`);
    collector.addRule(`.monaco-workbench .extension-editor .content .feature-contributions a { color: ${link}; }`);
  }
  const activeLink = theme.getColor(textLinkActiveForeground);
  if (activeLink) {
    collector.addRule(`.monaco-workbench .extension-editor .content .details .additional-details-container .resources-container a.resource:hover,
			.monaco-workbench .extension-editor .content .details .additional-details-container .resources-container a.resource:active { color: ${activeLink}; }`);
    collector.addRule(`.monaco-workbench .extension-editor .content .feature-contributions a:hover,
			.monaco-workbench .extension-editor .content .feature-contributions a:active { color: ${activeLink}; }`);
  }
  const buttonHoverBackgroundColor = theme.getColor(buttonHoverBackground);
  if (buttonHoverBackgroundColor) {
    collector.addRule(`.monaco-workbench .extension-editor .content > .details > .additional-details-container .categories-container > .categories > .category.clickable:hover { background-color: ${buttonHoverBackgroundColor}; border-color: ${buttonHoverBackgroundColor}; }`);
  }
  const buttonForegroundColor = theme.getColor(buttonForeground);
  if (buttonForegroundColor) {
    collector.addRule(`.monaco-workbench .extension-editor .content > .details > .additional-details-container .categories-container > .categories > .category.clickable:hover { color: ${buttonForegroundColor}; }`);
  }
});
function getExtensionEditor(accessor) {
  const activeEditorPane = accessor.get(IEditorService).activeEditorPane;
  if (activeEditorPane instanceof ExtensionEditor) {
    return activeEditorPane;
  }
  return null;
}
export {
  ExtensionEditor
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGV4dGVuc2lvbnNcXGJyb3dzZXJcXGV4dGVuc2lvbkVkaXRvci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7ICQsIERpbWVuc2lvbiwgYXBwZW5kLCBoaWRlLCBzZXRQYXJlbnRGbG93VG8sIHNob3cgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IEFjdGlvbkJhciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hY3Rpb25iYXIvYWN0aW9uYmFyLmpzJztcbmltcG9ydCB7IGdldERlZmF1bHRIb3ZlckRlbGVnYXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2hvdmVyL2hvdmVyRGVsZWdhdGVGYWN0b3J5LmpzJztcbmltcG9ydCB7IERvbVNjcm9sbGFibGVFbGVtZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3Njcm9sbGJhci9zY3JvbGxhYmxlRWxlbWVudC5qcyc7XG5pbXBvcnQgeyBDaGVja2JveEFjdGlvblZpZXdJdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3RvZ2dsZS90b2dnbGUuanMnO1xuaW1wb3J0IHsgQWN0aW9uLCBJQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgKiBhcyBhcnJheXMgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IENhY2hlLCBDYWNoZVJlc3VsdCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhY2hlLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuLCBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBpc0NhbmNlbGxhdGlvbkVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgS2V5Q29kZSwgS2V5TW9kIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBNdXRhYmxlRGlzcG9zYWJsZSwgZGlzcG9zZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFNjaGVtYXMsIG1hdGNoZXNTY2hlbWUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IGlzTmF0aXZlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgaXNVbmRlZmluZWQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVVdWlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXVpZC5qcyc7XG5pbXBvcnQgJy4vbWVkaWEvZXh0ZW5zaW9uRWRpdG9yLmNzcyc7XG5pbXBvcnQgeyBFZGl0b3JDb250ZXh0S2V5cyB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vZWRpdG9yQ29udGV4dEtleXMuanMnO1xuaW1wb3J0IHsgVG9rZW5pemF0aW9uUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2UuanMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVUb2tlbnNDU1NGb3JDb2xvck1hcCB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzL3N1cHBvcnRzL3Rva2VuaXphdGlvbi5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBBY3Rpb24yLCByZWdpc3RlckFjdGlvbjIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByLCBJQ29udGV4dEtleSwgSUNvbnRleHRLZXlTZXJ2aWNlLCBJU2NvcGVkQ29udGV4dEtleVNlcnZpY2UsIFJhd0NvbnRleHRLZXkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElDb250ZXh0TWVudVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IGNvbXB1dGVTaXplLCBGaWx0ZXJUeXBlLCBJRXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2UsIElHYWxsZXJ5RXh0ZW5zaW9uLCBJTG9jYWxFeHRlbnNpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25NYW5hZ2VtZW50L2NvbW1vbi9leHRlbnNpb25NYW5hZ2VtZW50LmpzJztcbmltcG9ydCB7IGFyZVNhbWVFeHRlbnNpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9uTWFuYWdlbWVudC9jb21tb24vZXh0ZW5zaW9uTWFuYWdlbWVudFV0aWwuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uVHlwZSwgSUV4dGVuc2lvbk1hbmlmZXN0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UsIFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IEtleWJpbmRpbmdXZWlnaHQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nc1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgSU9wZW5lclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9vcGVuZXIvY29tbW9uL29wZW5lci5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgZGVmYXVsdENoZWNrYm94U3R5bGVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvYnJvd3Nlci9kZWZhdWx0U3R5bGVzLmpzJztcbmltcG9ydCB7IGJ1dHRvbkZvcmVncm91bmQsIGJ1dHRvbkhvdmVyQmFja2dyb3VuZCwgZWRpdG9yQmFja2dyb3VuZCwgdGV4dExpbmtBY3RpdmVGb3JlZ3JvdW5kLCB0ZXh0TGlua0ZvcmVncm91bmQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vY29sb3JSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJQ29sb3JUaGVtZSwgSUNzc1N0eWxlQ29sbGVjdG9yLCBJVGhlbWVTZXJ2aWNlLCByZWdpc3RlclRoZW1pbmdQYXJ0aWNpcGFudCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRWRpdG9yUGFuZSB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvcGFydHMvZWRpdG9yL2VkaXRvclBhbmUuanMnO1xuaW1wb3J0IHsgSUVkaXRvck9wZW5Db250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25GZWF0dXJlc1RhYiB9IGZyb20gJy4vZXh0ZW5zaW9uRmVhdHVyZXNUYWIuanMnO1xuaW1wb3J0IHtcblx0QnV0dG9uV2l0aERyb3BEb3duRXh0ZW5zaW9uQWN0aW9uLFxuXHRDbGVhckxhbmd1YWdlQWN0aW9uLFxuXHREaXNhYmxlRHJvcERvd25BY3Rpb24sXG5cdEVuYWJsZURyb3BEb3duQWN0aW9uLFxuXHRCdXR0b25XaXRoRHJvcGRvd25FeHRlbnNpb25BY3Rpb25WaWV3SXRlbSwgRHJvcERvd25FeHRlbnNpb25BY3Rpb24sXG5cdEV4dGVuc2lvbkVkaXRvck1hbmFnZUV4dGVuc2lvbkFjdGlvbixcblx0RXh0ZW5zaW9uU3RhdHVzQWN0aW9uLFxuXHRFeHRlbnNpb25TdGF0dXNMYWJlbEFjdGlvbixcblx0SW5zdGFsbEFub3RoZXJWZXJzaW9uQWN0aW9uLFxuXHRJbnN0YWxsRHJvcGRvd25BY3Rpb24sIEluc3RhbGxpbmdMYWJlbEFjdGlvbixcblx0TG9jYWxJbnN0YWxsQWN0aW9uLFxuXHRNaWdyYXRlRGVwcmVjYXRlZEV4dGVuc2lvbkFjdGlvbixcblx0RXh0ZW5zaW9uUnVudGltZVN0YXRlQWN0aW9uLFxuXHRSZW1vdGVJbnN0YWxsQWN0aW9uLFxuXHRTZXRDb2xvclRoZW1lQWN0aW9uLFxuXHRTZXRGaWxlSWNvblRoZW1lQWN0aW9uLFxuXHRTZXRMYW5ndWFnZUFjdGlvbixcblx0U2V0UHJvZHVjdEljb25UaGVtZUFjdGlvbixcblx0VG9nZ2xlQXV0b1VwZGF0ZUZvckV4dGVuc2lvbkFjdGlvbixcblx0VW5pbnN0YWxsQWN0aW9uLFxuXHRVcGRhdGVBY3Rpb24sXG5cdFdlYkluc3RhbGxBY3Rpb24sXG5cdFRvZ2dsZVByZVJlbGVhc2VFeHRlbnNpb25BY3Rpb24sXG59IGZyb20gJy4vZXh0ZW5zaW9uc0FjdGlvbnMuanMnO1xuaW1wb3J0IHsgRGVsZWdhdGUgfSBmcm9tICcuL2V4dGVuc2lvbnNMaXN0LmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbkRhdGEsIEV4dGVuc2lvbnNHcmlkVmlldywgRXh0ZW5zaW9uc1RyZWUsIGdldEV4dGVuc2lvbnMgfSBmcm9tICcuL2V4dGVuc2lvbnNWaWV3ZXIuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uUmVjb21tZW5kYXRpb25XaWRnZXQsIEV4dGVuc2lvblN0YXR1c1dpZGdldCwgRXh0ZW5zaW9uV2lkZ2V0LCBJbnN0YWxsQ291bnRXaWRnZXQsIFJhdGluZ3NXaWRnZXQsIFJlbW90ZUJhZGdlV2lkZ2V0LCBTcG9uc29yV2lkZ2V0LCBQdWJsaXNoZXJXaWRnZXQsIG9uQ2xpY2ssIEV4dGVuc2lvbktpbmRJbmRpY2F0b3JXaWRnZXQsIEV4dGVuc2lvbkljb25XaWRnZXQgfSBmcm9tICcuL2V4dGVuc2lvbnNXaWRnZXRzLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbkNvbnRhaW5lcnMsIEV4dGVuc2lvbkVkaXRvclRhYiwgRXh0ZW5zaW9uU3RhdGUsIElFeHRlbnNpb24sIElFeHRlbnNpb25Db250YWluZXIsIElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbnNJbnB1dCwgSUV4dGVuc2lvbkVkaXRvck9wdGlvbnMgfSBmcm9tICcuLi9jb21tb24vZXh0ZW5zaW9uc0lucHV0LmpzJztcbmltcG9ydCB7IERFRkFVTFRfTUFSS0RPV05fU1RZTEVTLCByZW5kZXJNYXJrZG93bkRvY3VtZW50IH0gZnJvbSAnLi4vLi4vbWFya2Rvd24vYnJvd3Nlci9tYXJrZG93bkRvY3VtZW50UmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgSVdlYnZpZXcsIElXZWJ2aWV3U2VydmljZSwgS0VZQklORElOR19DT05URVhUX1dFQlZJRVdfRklORF9XSURHRVRfRk9DVVNFRCB9IGZyb20gJy4uLy4uL3dlYnZpZXcvYnJvd3Nlci93ZWJ2aWV3LmpzJztcbmltcG9ydCB7IElFZGl0b3JHcm91cCB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yR3JvdXBzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uUmVjb21tZW5kYXRpb25zU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvblJlY29tbWVuZGF0aW9ucy9jb21tb24vZXh0ZW5zaW9uUmVjb21tZW5kYXRpb25zLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJVXJpSWRlbnRpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXJpSWRlbnRpdHkvY29tbW9uL3VyaUlkZW50aXR5LmpzJztcbmltcG9ydCB7IElIb3ZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ob3Zlci9icm93c2VyL2hvdmVyLmpzJztcbmltcG9ydCB7IEJ5dGVTaXplLCBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXNlckRhdGFQcm9maWxlL2NvbW1vbi91c2VyRGF0YVByb2ZpbGUuanMnO1xuaW1wb3J0IHsgSVJlbW90ZUFnZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3JlbW90ZS9jb21tb24vcmVtb3RlQWdlbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25HYWxsZXJ5TWFuaWZlc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9uTWFuYWdlbWVudC9jb21tb24vZXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0LmpzJztcbmltcG9ydCB7IFNob3dDdXJyZW50UmVsZWFzZU5vdGVzQWN0aW9uSWQgfSBmcm9tICcuLi8uLi91cGRhdGUvY29tbW9uL3VwZGF0ZS5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IGZyb21Ob3cgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9kYXRlLmpzJztcblxuY2xhc3MgTmF2QmFyIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25DaGFuZ2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx7IGlkOiBzdHJpbmcgfCBudWxsOyBmb2N1czogYm9vbGVhbiB9PigpKTtcblx0cmVhZG9ubHkgb25DaGFuZ2UgPSB0aGlzLl9vbkNoYW5nZS5ldmVudDtcblxuXHRwcml2YXRlIF9jdXJyZW50SWQ6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuXHRnZXQgY3VycmVudElkKCk6IHN0cmluZyB8IG51bGwgeyByZXR1cm4gdGhpcy5fY3VycmVudElkOyB9XG5cblx0cHJpdmF0ZSBhY3Rpb25zOiBBY3Rpb25bXTtcblx0cHJpdmF0ZSBhY3Rpb25iYXI6IEFjdGlvbkJhcjtcblxuXHRjb25zdHJ1Y3Rvcihjb250YWluZXI6IEhUTUxFbGVtZW50KSB7XG5cdFx0c3VwZXIoKTtcblx0XHRjb25zdCBlbGVtZW50ID0gYXBwZW5kKGNvbnRhaW5lciwgJCgnLm5hdmJhcicpKTtcblx0XHR0aGlzLmFjdGlvbnMgPSBbXTtcblx0XHR0aGlzLmFjdGlvbmJhciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBBY3Rpb25CYXIoZWxlbWVudCkpO1xuXHR9XG5cblx0cHVzaChpZDogc3RyaW5nLCBsYWJlbDogc3RyaW5nLCB0b29sdGlwOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBhY3Rpb24gPSBuZXcgQWN0aW9uKGlkLCBsYWJlbCwgdW5kZWZpbmVkLCB0cnVlLCAoKSA9PiB0aGlzLnVwZGF0ZShpZCwgdHJ1ZSkpO1xuXG5cdFx0YWN0aW9uLnRvb2x0aXAgPSB0b29sdGlwO1xuXG5cdFx0dGhpcy5hY3Rpb25zLnB1c2goYWN0aW9uKTtcblx0XHR0aGlzLmFjdGlvbmJhci5wdXNoKGFjdGlvbik7XG5cblx0XHRpZiAodGhpcy5hY3Rpb25zLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0dGhpcy51cGRhdGUoaWQpO1xuXHRcdH1cblx0fVxuXG5cdGNsZWFyKCk6IHZvaWQge1xuXHRcdHRoaXMuYWN0aW9ucyA9IGRpc3Bvc2UodGhpcy5hY3Rpb25zKTtcblx0XHR0aGlzLmFjdGlvbmJhci5jbGVhcigpO1xuXHR9XG5cblx0c3dpdGNoKGlkOiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRjb25zdCBhY3Rpb24gPSB0aGlzLmFjdGlvbnMuZmluZChhY3Rpb24gPT4gYWN0aW9uLmlkID09PSBpZCk7XG5cdFx0aWYgKGFjdGlvbikge1xuXHRcdFx0YWN0aW9uLnJ1bigpO1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlKGlkOiBzdHJpbmcsIGZvY3VzPzogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMuX2N1cnJlbnRJZCA9IGlkO1xuXHRcdHRoaXMuX29uQ2hhbmdlLmZpcmUoeyBpZCwgZm9jdXM6ICEhZm9jdXMgfSk7XG5cdFx0dGhpcy5hY3Rpb25zLmZvckVhY2goYSA9PiBhLmNoZWNrZWQgPSBhLmlkID09PSBpZCk7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuY2xlYXIoKTtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cbn1cblxuaW50ZXJmYWNlIElMYXlvdXRQYXJ0aWNpcGFudCB7XG5cdGxheW91dCgpOiB2b2lkO1xufVxuXG5pbnRlcmZhY2UgSUFjdGl2ZUVsZW1lbnQge1xuXHRmb2N1cygpOiB2b2lkO1xufVxuXG5pbnRlcmZhY2UgSUV4dGVuc2lvbkVkaXRvclRlbXBsYXRlIHtcblx0bmFtZTogSFRNTEVsZW1lbnQ7XG5cdHByZXZpZXc6IEhUTUxFbGVtZW50O1xuXHRidWlsdGluOiBIVE1MRWxlbWVudDtcblx0ZGVzY3JpcHRpb246IEhUTUxFbGVtZW50O1xuXHRhY3Rpb25zQW5kU3RhdHVzQ29udGFpbmVyOiBIVE1MRWxlbWVudDtcblx0ZXh0ZW5zaW9uQWN0aW9uQmFyOiBBY3Rpb25CYXI7XG5cdG5hdmJhcjogTmF2QmFyO1xuXHRjb250ZW50OiBIVE1MRWxlbWVudDtcblx0aGVhZGVyOiBIVE1MRWxlbWVudDtcblx0ZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uO1xuXHRnYWxsZXJ5OiBJR2FsbGVyeUV4dGVuc2lvbiB8IG51bGw7XG5cdG1hbmlmZXN0OiBJRXh0ZW5zaW9uTWFuaWZlc3QgfCBudWxsO1xufVxuXG5jb25zdCBlbnVtIFdlYnZpZXdJbmRleCB7XG5cdFJlYWRtZSxcblx0Q2hhbmdlbG9nXG59XG5cbmNvbnN0IENPTlRFWFRfU0hPV19QUkVfUkVMRUFTRV9WRVJTSU9OID0gbmV3IFJhd0NvbnRleHRLZXk8Ym9vbGVhbj4oJ3Nob3dQcmVSZWxlYXNlVmVyc2lvbicsIGZhbHNlKTtcblxuYWJzdHJhY3QgY2xhc3MgRXh0ZW5zaW9uV2l0aERpZmZlcmVudEdhbGxlcnlWZXJzaW9uV2lkZ2V0IGV4dGVuZHMgRXh0ZW5zaW9uV2lkZ2V0IHtcblx0cHJpdmF0ZSBfZ2FsbGVyeTogSUdhbGxlcnlFeHRlbnNpb24gfCBudWxsID0gbnVsbDtcblx0Z2V0IGdhbGxlcnkoKTogSUdhbGxlcnlFeHRlbnNpb24gfCBudWxsIHsgcmV0dXJuIHRoaXMuX2dhbGxlcnk7IH1cblx0c2V0IGdhbGxlcnkoZ2FsbGVyeTogSUdhbGxlcnlFeHRlbnNpb24gfCBudWxsKSB7XG5cdFx0aWYgKHRoaXMuZXh0ZW5zaW9uICYmIGdhbGxlcnkgJiYgIWFyZVNhbWVFeHRlbnNpb25zKHRoaXMuZXh0ZW5zaW9uLmlkZW50aWZpZXIsIGdhbGxlcnkuaWRlbnRpZmllcikpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fZ2FsbGVyeSA9IGdhbGxlcnk7XG5cdFx0dGhpcy51cGRhdGUoKTtcblx0fVxufVxuXG5jbGFzcyBWZXJzaW9uV2lkZ2V0IGV4dGVuZHMgRXh0ZW5zaW9uV2l0aERpZmZlcmVudEdhbGxlcnlWZXJzaW9uV2lkZ2V0IHtcblx0cHJpdmF0ZSByZWFkb25seSBlbGVtZW50OiBIVE1MRWxlbWVudDtcblx0Y29uc3RydWN0b3IoXG5cdFx0Y29udGFpbmVyOiBIVE1MRWxlbWVudCxcblx0XHRob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLmVsZW1lbnQgPSBhcHBlbmQoY29udGFpbmVyLCAkKCdjb2RlLnZlcnNpb24nLCB1bmRlZmluZWQsICdwcmUtcmVsZWFzZScpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihob3ZlclNlcnZpY2Uuc2V0dXBNYW5hZ2VkSG92ZXIoZ2V0RGVmYXVsdEhvdmVyRGVsZWdhdGUoJ21vdXNlJyksIHRoaXMuZWxlbWVudCwgbG9jYWxpemUoJ2V4dGVuc2lvbiB2ZXJzaW9uJywgXCJFeHRlbnNpb24gVmVyc2lvblwiKSkpO1xuXHRcdHRoaXMucmVuZGVyKCk7XG5cdH1cblx0cmVuZGVyKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmV4dGVuc2lvbj8ucHJlUmVsZWFzZSkge1xuXHRcdFx0c2hvdyh0aGlzLmVsZW1lbnQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRoaWRlKHRoaXMuZWxlbWVudCk7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBFeHRlbnNpb25FZGl0b3IgZXh0ZW5kcyBFZGl0b3JQYW5lIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQ6IHN0cmluZyA9ICd3b3JrYmVuY2guZWRpdG9yLmV4dGVuc2lvbic7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfc2NvcGVkQ29udGV4dEtleVNlcnZpY2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8SVNjb3BlZENvbnRleHRLZXlTZXJ2aWNlPigpKTtcblx0cHJpdmF0ZSB0ZW1wbGF0ZTogSUV4dGVuc2lvbkVkaXRvclRlbXBsYXRlIHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgZXh0ZW5zaW9uUmVhZG1lOiBDYWNoZTxzdHJpbmc+IHwgbnVsbDtcblx0cHJpdmF0ZSBleHRlbnNpb25DaGFuZ2Vsb2c6IENhY2hlPHN0cmluZz4gfCBudWxsO1xuXHRwcml2YXRlIGV4dGVuc2lvbk1hbmlmZXN0OiBDYWNoZTxJRXh0ZW5zaW9uTWFuaWZlc3QgfCBudWxsPiB8IG51bGw7XG5cblx0Ly8gU29tZSBhY3Rpb24gYmFyIGl0ZW1zIHVzZSBhIHdlYnZpZXcgd2hvc2UgdmVydGljYWwgc2Nyb2xsIHBvc2l0aW9uIHdlIHRyYWNrIGluIHRoaXMgbWFwXG5cdHByaXZhdGUgaW5pdGlhbFNjcm9sbFByb2dyZXNzOiBNYXA8V2Vidmlld0luZGV4LCBudW1iZXI+ID0gbmV3IE1hcCgpO1xuXG5cdC8vIFNwb3Qgd2hlbiBhbiBFeHRlbnNpb25FZGl0b3IgaW5zdGFuY2UgZ2V0cyByZXVzZWQgZm9yIGEgZGlmZmVyZW50IGV4dGVuc2lvbiwgaW4gd2hpY2ggY2FzZSB0aGUgdmVydGljYWwgc2Nyb2xsIHBvc2l0aW9ucyBtdXN0IGJlIHplcm9lZFxuXHRwcml2YXRlIGN1cnJlbnRJZGVudGlmaWVyOiBzdHJpbmcgPSAnJztcblxuXHRwcml2YXRlIGxheW91dFBhcnRpY2lwYW50czogSUxheW91dFBhcnRpY2lwYW50W10gPSBbXTtcblx0cHJpdmF0ZSByZWFkb25seSBjb250ZW50RGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IHRyYW5zaWVudERpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0cHJpdmF0ZSBhY3RpdmVFbGVtZW50OiBJQWN0aXZlRWxlbWVudCB8IG51bGwgPSBudWxsO1xuXHRwcml2YXRlIGRpbWVuc2lvbjogRGltZW5zaW9uIHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgc2hvd1ByZVJlbGVhc2VWZXJzaW9uQ29udGV4dEtleTogSUNvbnRleHRLZXk8Ym9vbGVhbj4gfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0Z3JvdXA6IElFZGl0b3JHcm91cCxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlOiBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25HYWxsZXJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlOiBJRXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2UsXG5cdFx0QElUaGVtZVNlcnZpY2UgdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHRcdEBJTm90aWZpY2F0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG5vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdEBJT3BlbmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG9wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uUmVjb21tZW5kYXRpb25zU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvblJlY29tbWVuZGF0aW9uc1NlcnZpY2U6IElFeHRlbnNpb25SZWNvbW1lbmRhdGlvbnNTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2Ugc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASUV4dGVuc2lvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25TZXJ2aWNlOiBJRXh0ZW5zaW9uU2VydmljZSxcblx0XHRASVdlYnZpZXdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgd2Vidmlld1NlcnZpY2U6IElXZWJ2aWV3U2VydmljZSxcblx0XHRASUxhbmd1YWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxhbmd1YWdlU2VydmljZTogSUxhbmd1YWdlU2VydmljZSxcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUhvdmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoRXh0ZW5zaW9uRWRpdG9yLklELCBncm91cCwgdGVsZW1ldHJ5U2VydmljZSwgdGhlbWVTZXJ2aWNlLCBzdG9yYWdlU2VydmljZSk7XG5cdFx0dGhpcy5leHRlbnNpb25SZWFkbWUgPSBudWxsO1xuXHRcdHRoaXMuZXh0ZW5zaW9uQ2hhbmdlbG9nID0gbnVsbDtcblx0XHR0aGlzLmV4dGVuc2lvbk1hbmlmZXN0ID0gbnVsbDtcblx0fVxuXG5cdG92ZXJyaWRlIGdldCBzY29wZWRDb250ZXh0S2V5U2VydmljZSgpOiBJQ29udGV4dEtleVNlcnZpY2UgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9zY29wZWRDb250ZXh0S2V5U2VydmljZS52YWx1ZTtcblx0fVxuXG5cdHByb3RlY3RlZCBjcmVhdGVFZGl0b3IocGFyZW50OiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdGNvbnN0IHJvb3QgPSBhcHBlbmQocGFyZW50LCAkKCcuZXh0ZW5zaW9uLWVkaXRvcicpKTtcblx0XHR0aGlzLl9zY29wZWRDb250ZXh0S2V5U2VydmljZS52YWx1ZSA9IHRoaXMuY29udGV4dEtleVNlcnZpY2UuY3JlYXRlU2NvcGVkKHJvb3QpO1xuXHRcdHRoaXMuX3Njb3BlZENvbnRleHRLZXlTZXJ2aWNlLnZhbHVlLmNyZWF0ZUtleSgnaW5FeHRlbnNpb25FZGl0b3InLCB0cnVlKTtcblx0XHR0aGlzLnNob3dQcmVSZWxlYXNlVmVyc2lvbkNvbnRleHRLZXkgPSBDT05URVhUX1NIT1dfUFJFX1JFTEVBU0VfVkVSU0lPTi5iaW5kVG8odGhpcy5fc2NvcGVkQ29udGV4dEtleVNlcnZpY2UudmFsdWUpO1xuXG5cdFx0cm9vdC50YWJJbmRleCA9IDA7IC8vIHRoaXMgaXMgcmVxdWlyZWQgZm9yIHRoZSBmb2N1cyB0cmFja2VyIG9uIHRoZSBlZGl0b3Jcblx0XHRyb290LnN0eWxlLm91dGxpbmUgPSAnbm9uZSc7XG5cdFx0cm9vdC5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAnZG9jdW1lbnQnKTtcblx0XHRjb25zdCBoZWFkZXIgPSBhcHBlbmQocm9vdCwgJCgnLmhlYWRlcicpKTtcblxuXHRcdGNvbnN0IGljb25Db250YWluZXIgPSBhcHBlbmQoaGVhZGVyLCAkKCcuaWNvbi1jb250YWluZXInKSk7XG5cdFx0Y29uc3QgaWNvbldpZGdldCA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRXh0ZW5zaW9uSWNvbldpZGdldCwgaWNvbkNvbnRhaW5lcik7XG5cdFx0Y29uc3QgcmVtb3RlQmFkZ2UgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFJlbW90ZUJhZGdlV2lkZ2V0LCBpY29uQ29udGFpbmVyLCB0cnVlKTtcblxuXHRcdGNvbnN0IGRldGFpbHMgPSBhcHBlbmQoaGVhZGVyLCAkKCcuZGV0YWlscycpKTtcblx0XHRjb25zdCB0aXRsZSA9IGFwcGVuZChkZXRhaWxzLCAkKCcudGl0bGUnKSk7XG5cdFx0Y29uc3QgbmFtZSA9IGFwcGVuZCh0aXRsZSwgJCgnc3Bhbi5uYW1lLmNsaWNrYWJsZScsIHsgcm9sZTogJ2hlYWRpbmcnLCB0YWJJbmRleDogMCB9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5ob3ZlclNlcnZpY2Uuc2V0dXBNYW5hZ2VkSG92ZXIoZ2V0RGVmYXVsdEhvdmVyRGVsZWdhdGUoJ21vdXNlJyksIG5hbWUsIGxvY2FsaXplKCduYW1lJywgXCJFeHRlbnNpb24gbmFtZVwiKSkpO1xuXHRcdGNvbnN0IHZlcnNpb25XaWRnZXQgPSBuZXcgVmVyc2lvbldpZGdldCh0aXRsZSwgdGhpcy5ob3ZlclNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgcHJldmlldyA9IGFwcGVuZCh0aXRsZSwgJCgnc3Bhbi5wcmV2aWV3JykpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuaG92ZXJTZXJ2aWNlLnNldHVwTWFuYWdlZEhvdmVyKGdldERlZmF1bHRIb3ZlckRlbGVnYXRlKCdtb3VzZScpLCBwcmV2aWV3LCBsb2NhbGl6ZSgncHJldmlldycsIFwiUHJldmlld1wiKSkpO1xuXHRcdHByZXZpZXcudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgncHJldmlldycsIFwiUHJldmlld1wiKTtcblxuXHRcdGNvbnN0IGJ1aWx0aW4gPSBhcHBlbmQodGl0bGUsICQoJ3NwYW4uYnVpbHRpbicpKTtcblx0XHRidWlsdGluLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ2J1aWx0aW4nLCBcIkJ1aWx0LWluXCIpO1xuXG5cdFx0Y29uc3Qgc3VidGl0bGUgPSBhcHBlbmQoZGV0YWlscywgJCgnLnN1YnRpdGxlJykpO1xuXHRcdGNvbnN0IHN1YlRpdGxlRW50cnlDb250YWluZXJzOiBIVE1MRWxlbWVudFtdID0gW107XG5cblx0XHRjb25zdCBwdWJsaXNoZXJDb250YWluZXIgPSBhcHBlbmQoc3VidGl0bGUsICQoJy5zdWJ0aXRsZS1lbnRyeScpKTtcblx0XHRzdWJUaXRsZUVudHJ5Q29udGFpbmVycy5wdXNoKHB1Ymxpc2hlckNvbnRhaW5lcik7XG5cdFx0Y29uc3QgcHVibGlzaGVyV2lkZ2V0ID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShQdWJsaXNoZXJXaWRnZXQsIHB1Ymxpc2hlckNvbnRhaW5lciwgZmFsc2UpO1xuXG5cdFx0Y29uc3QgZXh0ZW5zaW9uS2luZENvbnRhaW5lciA9IGFwcGVuZChzdWJ0aXRsZSwgJCgnLnN1YnRpdGxlLWVudHJ5JykpO1xuXHRcdHN1YlRpdGxlRW50cnlDb250YWluZXJzLnB1c2goZXh0ZW5zaW9uS2luZENvbnRhaW5lcik7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uS2luZFdpZGdldCA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRXh0ZW5zaW9uS2luZEluZGljYXRvcldpZGdldCwgZXh0ZW5zaW9uS2luZENvbnRhaW5lciwgZmFsc2UpO1xuXG5cdFx0Y29uc3QgaW5zdGFsbENvdW50Q29udGFpbmVyID0gYXBwZW5kKHN1YnRpdGxlLCAkKCcuc3VidGl0bGUtZW50cnknKSk7XG5cdFx0c3ViVGl0bGVFbnRyeUNvbnRhaW5lcnMucHVzaChpbnN0YWxsQ291bnRDb250YWluZXIpO1xuXHRcdGNvbnN0IGluc3RhbGxDb3VudFdpZGdldCA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoSW5zdGFsbENvdW50V2lkZ2V0LCBpbnN0YWxsQ291bnRDb250YWluZXIsIGZhbHNlKTtcblxuXHRcdGNvbnN0IHJhdGluZ3NDb250YWluZXIgPSBhcHBlbmQoc3VidGl0bGUsICQoJy5zdWJ0aXRsZS1lbnRyeScpKTtcblx0XHRzdWJUaXRsZUVudHJ5Q29udGFpbmVycy5wdXNoKHJhdGluZ3NDb250YWluZXIpO1xuXHRcdGNvbnN0IHJhdGluZ3NXaWRnZXQgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFJhdGluZ3NXaWRnZXQsIHJhdGluZ3NDb250YWluZXIsIGZhbHNlKTtcblxuXHRcdGNvbnN0IHNwb25zb3JDb250YWluZXIgPSBhcHBlbmQoc3VidGl0bGUsICQoJy5zdWJ0aXRsZS1lbnRyeScpKTtcblx0XHRzdWJUaXRsZUVudHJ5Q29udGFpbmVycy5wdXNoKHNwb25zb3JDb250YWluZXIpO1xuXHRcdGNvbnN0IHNwb25zb3JXaWRnZXQgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNwb25zb3JXaWRnZXQsIHNwb25zb3JDb250YWluZXIpO1xuXG5cdFx0Y29uc3Qgd2lkZ2V0czogRXh0ZW5zaW9uV2lkZ2V0W10gPSBbXG5cdFx0XHRpY29uV2lkZ2V0LFxuXHRcdFx0cmVtb3RlQmFkZ2UsXG5cdFx0XHR2ZXJzaW9uV2lkZ2V0LFxuXHRcdFx0cHVibGlzaGVyV2lkZ2V0LFxuXHRcdFx0ZXh0ZW5zaW9uS2luZFdpZGdldCxcblx0XHRcdGluc3RhbGxDb3VudFdpZGdldCxcblx0XHRcdHJhdGluZ3NXaWRnZXQsXG5cdFx0XHRzcG9uc29yV2lkZ2V0LFxuXHRcdF07XG5cblx0XHRjb25zdCBkZXNjcmlwdGlvbiA9IGFwcGVuZChkZXRhaWxzLCAkKCcuZGVzY3JpcHRpb24nKSk7XG5cblx0XHRjb25zdCBpbnN0YWxsQWN0aW9uID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShJbnN0YWxsRHJvcGRvd25BY3Rpb24pO1xuXHRcdGNvbnN0IGFjdGlvbnMgPSBbXG5cdFx0XHR0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEV4dGVuc2lvblJ1bnRpbWVTdGF0ZUFjdGlvbiksXG5cdFx0XHR0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEV4dGVuc2lvblN0YXR1c0xhYmVsQWN0aW9uKSxcblx0XHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVXBkYXRlQWN0aW9uLCB0cnVlKSxcblx0XHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2V0Q29sb3JUaGVtZUFjdGlvbiksXG5cdFx0XHR0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNldEZpbGVJY29uVGhlbWVBY3Rpb24pLFxuXHRcdFx0dGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZXRQcm9kdWN0SWNvblRoZW1lQWN0aW9uKSxcblx0XHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2V0TGFuZ3VhZ2VBY3Rpb24pLFxuXHRcdFx0dGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDbGVhckxhbmd1YWdlQWN0aW9uKSxcblxuXHRcdFx0dGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShFbmFibGVEcm9wRG93bkFjdGlvbiksXG5cdFx0XHR0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRvZ2dsZVByZVJlbGVhc2VFeHRlbnNpb25BY3Rpb24pLFxuXHRcdFx0dGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShEaXNhYmxlRHJvcERvd25BY3Rpb24pLFxuXHRcdFx0dGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShSZW1vdGVJbnN0YWxsQWN0aW9uLCBmYWxzZSksXG5cdFx0XHR0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKExvY2FsSW5zdGFsbEFjdGlvbiksXG5cdFx0XHR0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFdlYkluc3RhbGxBY3Rpb24pLFxuXHRcdFx0aW5zdGFsbEFjdGlvbixcblx0XHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoSW5zdGFsbGluZ0xhYmVsQWN0aW9uKSxcblx0XHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQnV0dG9uV2l0aERyb3BEb3duRXh0ZW5zaW9uQWN0aW9uLCAnZXh0ZW5zaW9ucy51bmluc3RhbGwnLCBVbmluc3RhbGxBY3Rpb24uVW5pbnN0YWxsQ2xhc3MsIFtcblx0XHRcdFx0W1xuXHRcdFx0XHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTWlncmF0ZURlcHJlY2F0ZWRFeHRlbnNpb25BY3Rpb24sIGZhbHNlKSxcblx0XHRcdFx0XHR0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFVuaW5zdGFsbEFjdGlvbiksXG5cdFx0XHRcdFx0dGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShJbnN0YWxsQW5vdGhlclZlcnNpb25BY3Rpb24sIG51bGwsIHRydWUpLFxuXHRcdFx0XHRdXG5cdFx0XHRdKSxcblx0XHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVG9nZ2xlQXV0b1VwZGF0ZUZvckV4dGVuc2lvbkFjdGlvbiksXG5cdFx0XHRuZXcgRXh0ZW5zaW9uRWRpdG9yTWFuYWdlRXh0ZW5zaW9uQWN0aW9uKHRoaXMuc2NvcGVkQ29udGV4dEtleVNlcnZpY2UgfHwgdGhpcy5jb250ZXh0S2V5U2VydmljZSwgdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZSksXG5cdFx0XTtcblxuXHRcdGNvbnN0IGFjdGlvbnNBbmRTdGF0dXNDb250YWluZXIgPSBhcHBlbmQoZGV0YWlscywgJCgnLmFjdGlvbnMtc3RhdHVzLWNvbnRhaW5lcicpKTtcblx0XHRjb25zdCBleHRlbnNpb25BY3Rpb25CYXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgQWN0aW9uQmFyKGFjdGlvbnNBbmRTdGF0dXNDb250YWluZXIsIHtcblx0XHRcdGFjdGlvblZpZXdJdGVtUHJvdmlkZXI6IChhY3Rpb246IElBY3Rpb24sIG9wdGlvbnMpID0+IHtcblx0XHRcdFx0aWYgKGFjdGlvbiBpbnN0YW5jZW9mIERyb3BEb3duRXh0ZW5zaW9uQWN0aW9uKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGFjdGlvbi5jcmVhdGVBY3Rpb25WaWV3SXRlbShvcHRpb25zKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoYWN0aW9uIGluc3RhbmNlb2YgQnV0dG9uV2l0aERyb3BEb3duRXh0ZW5zaW9uQWN0aW9uKSB7XG5cdFx0XHRcdFx0cmV0dXJuIG5ldyBCdXR0b25XaXRoRHJvcGRvd25FeHRlbnNpb25BY3Rpb25WaWV3SXRlbShcblx0XHRcdFx0XHRcdGFjdGlvbixcblx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0Li4ub3B0aW9ucyxcblx0XHRcdFx0XHRcdFx0aWNvbjogdHJ1ZSxcblx0XHRcdFx0XHRcdFx0bGFiZWw6IHRydWUsXG5cdFx0XHRcdFx0XHRcdG1lbnVBY3Rpb25zT3JQcm92aWRlcjogeyBnZXRBY3Rpb25zOiAoKSA9PiBhY3Rpb24ubWVudUFjdGlvbnMgfSxcblx0XHRcdFx0XHRcdFx0bWVudUFjdGlvbkNsYXNzTmFtZXM6IGFjdGlvbi5tZW51QWN0aW9uQ2xhc3NOYW1lc1xuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdHRoaXMuY29udGV4dE1lbnVTZXJ2aWNlKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoYWN0aW9uIGluc3RhbmNlb2YgVG9nZ2xlQXV0b1VwZGF0ZUZvckV4dGVuc2lvbkFjdGlvbikge1xuXHRcdFx0XHRcdHJldHVybiBuZXcgQ2hlY2tib3hBY3Rpb25WaWV3SXRlbSh1bmRlZmluZWQsIGFjdGlvbiwgeyAuLi5vcHRpb25zLCBpY29uOiB0cnVlLCBsYWJlbDogdHJ1ZSwgY2hlY2tib3hTdHlsZXM6IGRlZmF1bHRDaGVja2JveFN0eWxlcyB9KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fSxcblx0XHRcdGZvY3VzT25seUVuYWJsZWRJdGVtczogdHJ1ZVxuXHRcdH0pKTtcblxuXHRcdGV4dGVuc2lvbkFjdGlvbkJhci5wdXNoKGFjdGlvbnMsIHsgaWNvbjogdHJ1ZSwgbGFiZWw6IHRydWUgfSk7XG5cdFx0ZXh0ZW5zaW9uQWN0aW9uQmFyLnNldEZvY3VzYWJsZSh0cnVlKTtcblx0XHQvLyB1cGRhdGUgZm9jdXNhYmxlIGVsZW1lbnRzIHdoZW4gdGhlIGVuYWJsZW1lbnQgb2YgYW4gYWN0aW9uIGNoYW5nZXNcblx0XHR0aGlzLl9yZWdpc3RlcihFdmVudC5hbnkoLi4uYWN0aW9ucy5tYXAoYSA9PiBFdmVudC5maWx0ZXIoYS5vbkRpZENoYW5nZSwgZSA9PiBlLmVuYWJsZWQgIT09IHVuZGVmaW5lZCkpKSgoKSA9PiB7XG5cdFx0XHRleHRlbnNpb25BY3Rpb25CYXIuc2V0Rm9jdXNhYmxlKGZhbHNlKTtcblx0XHRcdGV4dGVuc2lvbkFjdGlvbkJhci5zZXRGb2N1c2FibGUodHJ1ZSk7XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3Qgb3RoZXJFeHRlbnNpb25Db250YWluZXJzOiBJRXh0ZW5zaW9uQ29udGFpbmVyW10gPSBbXTtcblx0XHRjb25zdCBleHRlbnNpb25TdGF0dXNBY3Rpb24gPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEV4dGVuc2lvblN0YXR1c0FjdGlvbik7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uU3RhdHVzV2lkZ2V0ID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShFeHRlbnNpb25TdGF0dXNXaWRnZXQsIGFwcGVuZChhY3Rpb25zQW5kU3RhdHVzQ29udGFpbmVyLCAkKCcuc3RhdHVzJykpLCBleHRlbnNpb25TdGF0dXNBY3Rpb24pKTtcblxuXHRcdG90aGVyRXh0ZW5zaW9uQ29udGFpbmVycy5wdXNoKGV4dGVuc2lvblN0YXR1c0FjdGlvbiwgbmV3IGNsYXNzIGV4dGVuZHMgRXh0ZW5zaW9uV2lkZ2V0IHtcblx0XHRcdHJlbmRlcigpIHtcblx0XHRcdFx0YWN0aW9uc0FuZFN0YXR1c0NvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdsaXN0LWxheW91dCcsIHRoaXMuZXh0ZW5zaW9uPy5zdGF0ZSA9PT0gRXh0ZW5zaW9uU3RhdGUuSW5zdGFsbGVkKTtcblx0XHRcdH1cblx0XHR9KCkpO1xuXG5cdFx0Y29uc3QgcmVjb21tZW5kYXRpb25XaWRnZXQgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEV4dGVuc2lvblJlY29tbWVuZGF0aW9uV2lkZ2V0LCBhcHBlbmQoZGV0YWlscywgJCgnLnJlY29tbWVuZGF0aW9uJykpKTtcblx0XHR3aWRnZXRzLnB1c2gocmVjb21tZW5kYXRpb25XaWRnZXQpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoRXZlbnQuYW55KGV4dGVuc2lvblN0YXR1c1dpZGdldC5vbkRpZFJlbmRlciwgcmVjb21tZW5kYXRpb25XaWRnZXQub25EaWRSZW5kZXIpKCgpID0+IHtcblx0XHRcdGlmICh0aGlzLmRpbWVuc2lvbikge1xuXHRcdFx0XHR0aGlzLmxheW91dCh0aGlzLmRpbWVuc2lvbik7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgZXh0ZW5zaW9uQ29udGFpbmVyczogRXh0ZW5zaW9uQ29udGFpbmVycyA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRXh0ZW5zaW9uQ29udGFpbmVycywgWy4uLmFjdGlvbnMsIC4uLndpZGdldHMsIC4uLm90aGVyRXh0ZW5zaW9uQ29udGFpbmVyc10pO1xuXHRcdGZvciAoY29uc3QgZGlzcG9zYWJsZSBvZiBbLi4uYWN0aW9ucywgLi4ud2lkZ2V0cywgLi4ub3RoZXJFeHRlbnNpb25Db250YWluZXJzLCBleHRlbnNpb25Db250YWluZXJzXSkge1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoZGlzcG9zYWJsZSk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgb25FcnJvciA9IEV2ZW50LmNoYWluKGV4dGVuc2lvbkFjdGlvbkJhci5vbkRpZFJ1biwgJCA9PlxuXHRcdFx0JC5tYXAoKHsgZXJyb3IgfSkgPT4gZXJyb3IpXG5cdFx0XHRcdC5maWx0ZXIoZXJyb3IgPT4gISFlcnJvcilcblx0XHQpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIob25FcnJvcih0aGlzLm9uRXJyb3IsIHRoaXMpKTtcblxuXHRcdGNvbnN0IGJvZHkgPSBhcHBlbmQocm9vdCwgJCgnLmJvZHknKSk7XG5cdFx0Y29uc3QgbmF2YmFyID0gdGhpcy5fcmVnaXN0ZXIobmV3IE5hdkJhcihib2R5KSk7XG5cblx0XHRjb25zdCBjb250ZW50ID0gYXBwZW5kKGJvZHksICQoJy5jb250ZW50JykpO1xuXHRcdGNvbnRlbnQuaWQgPSBnZW5lcmF0ZVV1aWQoKTsgLy8gQW4gaWQgaXMgbmVlZGVkIGZvciB0aGUgd2VidmlldyBwYXJlbnQgZmxvdyB0b1xuXG5cdFx0dGhpcy50ZW1wbGF0ZSA9IHtcblx0XHRcdGJ1aWx0aW4sXG5cdFx0XHRjb250ZW50LFxuXHRcdFx0ZGVzY3JpcHRpb24sXG5cdFx0XHRoZWFkZXIsXG5cdFx0XHRuYW1lLFxuXHRcdFx0bmF2YmFyLFxuXHRcdFx0cHJldmlldyxcblx0XHRcdGFjdGlvbnNBbmRTdGF0dXNDb250YWluZXIsXG5cdFx0XHRleHRlbnNpb25BY3Rpb25CYXIsXG5cdFx0XHRzZXQgZXh0ZW5zaW9uKGV4dGVuc2lvbjogSUV4dGVuc2lvbikge1xuXHRcdFx0XHRleHRlbnNpb25Db250YWluZXJzLmV4dGVuc2lvbiA9IGV4dGVuc2lvbjtcblx0XHRcdFx0bGV0IGxhc3ROb25FbXB0eVN1YnRpdGxlRW50cnlDb250YWluZXI7XG5cdFx0XHRcdGZvciAoY29uc3Qgc3ViVGl0bGVFbnRyeUVsZW1lbnQgb2Ygc3ViVGl0bGVFbnRyeUNvbnRhaW5lcnMpIHtcblx0XHRcdFx0XHRzdWJUaXRsZUVudHJ5RWxlbWVudC5jbGFzc0xpc3QucmVtb3ZlKCdsYXN0LW5vbi1lbXB0eScpO1xuXHRcdFx0XHRcdGlmIChzdWJUaXRsZUVudHJ5RWxlbWVudC5jaGlsZHJlbi5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0XHRsYXN0Tm9uRW1wdHlTdWJ0aXRsZUVudHJ5Q29udGFpbmVyID0gc3ViVGl0bGVFbnRyeUVsZW1lbnQ7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChsYXN0Tm9uRW1wdHlTdWJ0aXRsZUVudHJ5Q29udGFpbmVyKSB7XG5cdFx0XHRcdFx0bGFzdE5vbkVtcHR5U3VidGl0bGVFbnRyeUNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdsYXN0LW5vbi1lbXB0eScpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0c2V0IGdhbGxlcnkoZ2FsbGVyeTogSUdhbGxlcnlFeHRlbnNpb24gfCBudWxsKSB7XG5cdFx0XHRcdHZlcnNpb25XaWRnZXQuZ2FsbGVyeSA9IGdhbGxlcnk7XG5cdFx0XHR9LFxuXHRcdFx0c2V0IG1hbmlmZXN0KG1hbmlmZXN0OiBJRXh0ZW5zaW9uTWFuaWZlc3QgfCBudWxsKSB7XG5cdFx0XHRcdGluc3RhbGxBY3Rpb24ubWFuaWZlc3QgPSBtYW5pZmVzdDtcblx0XHRcdH1cblx0XHR9O1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgc2V0SW5wdXQoaW5wdXQ6IEV4dGVuc2lvbnNJbnB1dCwgb3B0aW9uczogSUV4dGVuc2lvbkVkaXRvck9wdGlvbnMgfCB1bmRlZmluZWQsIGNvbnRleHQ6IElFZGl0b3JPcGVuQ29udGV4dCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgc3VwZXIuc2V0SW5wdXQoaW5wdXQsIG9wdGlvbnMsIGNvbnRleHQsIHRva2VuKTtcblx0XHR0aGlzLnVwZGF0ZVByZVJlbGVhc2VWZXJzaW9uQ29udGV4dCgpO1xuXHRcdGlmICh0aGlzLnRlbXBsYXRlKSB7XG5cdFx0XHRhd2FpdCB0aGlzLnJlbmRlcihpbnB1dC5leHRlbnNpb24sIHRoaXMudGVtcGxhdGUsICEhb3B0aW9ucz8ucHJlc2VydmVGb2N1cyk7XG5cdFx0fVxuXHR9XG5cblx0b3ZlcnJpZGUgc2V0T3B0aW9ucyhvcHRpb25zOiBJRXh0ZW5zaW9uRWRpdG9yT3B0aW9ucyB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGNvbnN0IGN1cnJlbnRPcHRpb25zOiBJRXh0ZW5zaW9uRWRpdG9yT3B0aW9ucyB8IHVuZGVmaW5lZCA9IHRoaXMub3B0aW9ucztcblx0XHRzdXBlci5zZXRPcHRpb25zKG9wdGlvbnMpO1xuXHRcdHRoaXMudXBkYXRlUHJlUmVsZWFzZVZlcnNpb25Db250ZXh0KCk7XG5cblx0XHRpZiAodGhpcy5pbnB1dCAmJiB0aGlzLnRlbXBsYXRlICYmIGN1cnJlbnRPcHRpb25zPy5zaG93UHJlUmVsZWFzZVZlcnNpb24gIT09IG9wdGlvbnM/LnNob3dQcmVSZWxlYXNlVmVyc2lvbikge1xuXHRcdFx0dGhpcy5yZW5kZXIoKHRoaXMuaW5wdXQgYXMgRXh0ZW5zaW9uc0lucHV0KS5leHRlbnNpb24sIHRoaXMudGVtcGxhdGUsICEhb3B0aW9ucz8ucHJlc2VydmVGb2N1cyk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKG9wdGlvbnM/LnRhYikge1xuXHRcdFx0dGhpcy50ZW1wbGF0ZT8ubmF2YmFyLnN3aXRjaChvcHRpb25zLnRhYik7XG5cdFx0fVxuXG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZVByZVJlbGVhc2VWZXJzaW9uQ29udGV4dCgpOiB2b2lkIHtcblx0XHRsZXQgc2hvd1ByZVJlbGVhc2VWZXJzaW9uID0gKDxJRXh0ZW5zaW9uRWRpdG9yT3B0aW9ucyB8IHVuZGVmaW5lZD50aGlzLm9wdGlvbnMpPy5zaG93UHJlUmVsZWFzZVZlcnNpb247XG5cdFx0aWYgKGlzVW5kZWZpbmVkKHNob3dQcmVSZWxlYXNlVmVyc2lvbikpIHtcblx0XHRcdHNob3dQcmVSZWxlYXNlVmVyc2lvbiA9ICEhKDxFeHRlbnNpb25zSW5wdXQ+dGhpcy5pbnB1dCkuZXh0ZW5zaW9uLmdhbGxlcnk/LnByb3BlcnRpZXMuaXNQcmVSZWxlYXNlVmVyc2lvbjtcblx0XHR9XG5cdFx0dGhpcy5zaG93UHJlUmVsZWFzZVZlcnNpb25Db250ZXh0S2V5Py5zZXQoc2hvd1ByZVJlbGVhc2VWZXJzaW9uKTtcblx0fVxuXG5cdGFzeW5jIG9wZW5UYWIodGFiOiBFeHRlbnNpb25FZGl0b3JUYWIpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIXRoaXMuaW5wdXQgfHwgIXRoaXMudGVtcGxhdGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKHRoaXMudGVtcGxhdGUubmF2YmFyLnN3aXRjaCh0YWIpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdC8vIEZhbGxiYWNrIHRvIFJlYWRtZSB0YWIgaWYgRXh0ZW5zaW9uUGFjayB0YWIgZG9lcyBub3QgZXhpc3Rcblx0XHRpZiAodGFiID09PSBFeHRlbnNpb25FZGl0b3JUYWIuRXh0ZW5zaW9uUGFjaykge1xuXHRcdFx0dGhpcy50ZW1wbGF0ZS5uYXZiYXIuc3dpdGNoKEV4dGVuc2lvbkVkaXRvclRhYi5SZWFkbWUpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZ2V0R2FsbGVyeVZlcnNpb25Ub1Nob3coZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uLCBwcmVSZWxlYXNlPzogYm9vbGVhbik6IFByb21pc2U8SUdhbGxlcnlFeHRlbnNpb24gfCBudWxsPiB7XG5cdFx0aWYgKGV4dGVuc2lvbi5yZXNvdXJjZUV4dGVuc2lvbikge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHRcdGlmIChleHRlbnNpb24ubG9jYWw/LnNvdXJjZSA9PT0gJ3Jlc291cmNlJykge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHRcdGlmIChpc1VuZGVmaW5lZChwcmVSZWxlYXNlKSkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHRcdGlmIChwcmVSZWxlYXNlID09PSBleHRlbnNpb24uZ2FsbGVyeT8ucHJvcGVydGllcy5pc1ByZVJlbGVhc2VWZXJzaW9uKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0aWYgKHByZVJlbGVhc2UgJiYgIWV4dGVuc2lvbi5oYXNQcmVSZWxlYXNlVmVyc2lvbikge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHRcdGlmICghcHJlUmVsZWFzZSAmJiAhZXh0ZW5zaW9uLmhhc1JlbGVhc2VWZXJzaW9uKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0cmV0dXJuIChhd2FpdCB0aGlzLmV4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlLmdldEV4dGVuc2lvbnMoW3sgLi4uZXh0ZW5zaW9uLmlkZW50aWZpZXIsIHByZVJlbGVhc2UsIGhhc1ByZVJlbGVhc2U6IGV4dGVuc2lvbi5oYXNQcmVSZWxlYXNlVmVyc2lvbiB9XSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSkpWzBdIHx8IG51bGw7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHJlbmRlcihleHRlbnNpb246IElFeHRlbnNpb24sIHRlbXBsYXRlOiBJRXh0ZW5zaW9uRWRpdG9yVGVtcGxhdGUsIHByZXNlcnZlRm9jdXM6IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLmFjdGl2ZUVsZW1lbnQgPSBudWxsO1xuXHRcdHRoaXMudHJhbnNpZW50RGlzcG9zYWJsZXMuY2xlYXIoKTtcblxuXHRcdGNvbnN0IHRva2VuID0gdGhpcy50cmFuc2llbnREaXNwb3NhYmxlcy5hZGQobmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCkpLnRva2VuO1xuXG5cdFx0Y29uc3QgZ2FsbGVyeSA9IGF3YWl0IHRoaXMuZ2V0R2FsbGVyeVZlcnNpb25Ub1Nob3coZXh0ZW5zaW9uLCAodGhpcy5vcHRpb25zIGFzIElFeHRlbnNpb25FZGl0b3JPcHRpb25zKT8uc2hvd1ByZVJlbGVhc2VWZXJzaW9uKTtcblx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLmV4dGVuc2lvblJlYWRtZSA9IG5ldyBDYWNoZSgoKSA9PiBnYWxsZXJ5ID8gdGhpcy5leHRlbnNpb25HYWxsZXJ5U2VydmljZS5nZXRSZWFkbWUoZ2FsbGVyeSwgdG9rZW4pIDogZXh0ZW5zaW9uLmdldFJlYWRtZSh0b2tlbikpO1xuXHRcdHRoaXMuZXh0ZW5zaW9uQ2hhbmdlbG9nID0gbmV3IENhY2hlKCgpID0+IGdhbGxlcnkgPyB0aGlzLmV4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlLmdldENoYW5nZWxvZyhnYWxsZXJ5LCB0b2tlbikgOiBleHRlbnNpb24uZ2V0Q2hhbmdlbG9nKHRva2VuKSk7XG5cdFx0dGhpcy5leHRlbnNpb25NYW5pZmVzdCA9IG5ldyBDYWNoZSgoKSA9PiBnYWxsZXJ5ID8gdGhpcy5leHRlbnNpb25HYWxsZXJ5U2VydmljZS5nZXRNYW5pZmVzdChnYWxsZXJ5LCB0b2tlbikgOiBleHRlbnNpb24uZ2V0TWFuaWZlc3QodG9rZW4pKTtcblxuXHRcdHRlbXBsYXRlLmV4dGVuc2lvbiA9IGV4dGVuc2lvbjtcblx0XHR0ZW1wbGF0ZS5nYWxsZXJ5ID0gZ2FsbGVyeTtcblx0XHR0ZW1wbGF0ZS5tYW5pZmVzdCA9IG51bGw7XG5cblx0XHR0ZW1wbGF0ZS5uYW1lLnRleHRDb250ZW50ID0gZXh0ZW5zaW9uLmRpc3BsYXlOYW1lO1xuXHRcdHRlbXBsYXRlLm5hbWUuY2xhc3NMaXN0LnRvZ2dsZSgnY2xpY2thYmxlJywgISFleHRlbnNpb24udXJsKTtcblx0XHR0ZW1wbGF0ZS5uYW1lLmNsYXNzTGlzdC50b2dnbGUoJ2RlcHJlY2F0ZWQnLCAhIWV4dGVuc2lvbi5kZXByZWNhdGlvbkluZm8pO1xuXHRcdHRlbXBsYXRlLnByZXZpZXcuc3R5bGUuZGlzcGxheSA9IGV4dGVuc2lvbi5wcmV2aWV3ID8gJ2luaGVyaXQnIDogJ25vbmUnO1xuXHRcdHRlbXBsYXRlLmJ1aWx0aW4uc3R5bGUuZGlzcGxheSA9IGV4dGVuc2lvbi5pc0J1aWx0aW4gPyAnaW5oZXJpdCcgOiAnbm9uZSc7XG5cblx0XHR0ZW1wbGF0ZS5kZXNjcmlwdGlvbi50ZXh0Q29udGVudCA9IGV4dGVuc2lvbi5kZXNjcmlwdGlvbjtcblxuXHRcdGlmIChleHRlbnNpb24udXJsKSB7XG5cdFx0XHR0aGlzLnRyYW5zaWVudERpc3Bvc2FibGVzLmFkZChvbkNsaWNrKHRlbXBsYXRlLm5hbWUsICgpID0+IHRoaXMub3BlbmVyU2VydmljZS5vcGVuKFVSSS5wYXJzZShleHRlbnNpb24udXJsISkpKSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbWFuaWZlc3QgPSBhd2FpdCB0aGlzLmV4dGVuc2lvbk1hbmlmZXN0LmdldCgpLnByb21pc2U7XG5cdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKG1hbmlmZXN0KSB7XG5cdFx0XHR0ZW1wbGF0ZS5tYW5pZmVzdCA9IG1hbmlmZXN0O1xuXHRcdH1cblxuXHRcdHRoaXMucmVuZGVyTmF2YmFyKGV4dGVuc2lvbiwgbWFuaWZlc3QsIHRlbXBsYXRlLCBwcmVzZXJ2ZUZvY3VzKTtcblxuXHRcdC8vIHJlcG9ydCB0ZWxlbWV0cnlcblx0XHRjb25zdCBleHRSZWNvbW1lbmRhdGlvbnMgPSB0aGlzLmV4dGVuc2lvblJlY29tbWVuZGF0aW9uc1NlcnZpY2UuZ2V0QWxsUmVjb21tZW5kYXRpb25zV2l0aFJlYXNvbigpO1xuXHRcdGxldCByZWNvbW1lbmRhdGlvbnNEYXRhID0ge307XG5cdFx0aWYgKGV4dFJlY29tbWVuZGF0aW9uc1tleHRlbnNpb24uaWRlbnRpZmllci5pZC50b0xvd2VyQ2FzZSgpXSkge1xuXHRcdFx0cmVjb21tZW5kYXRpb25zRGF0YSA9IHsgcmVjb21tZW5kYXRpb25SZWFzb246IGV4dFJlY29tbWVuZGF0aW9uc1tleHRlbnNpb24uaWRlbnRpZmllci5pZC50b0xvd2VyQ2FzZSgpXS5yZWFzb25JZCB9O1xuXHRcdH1cblx0XHQvKiBfX0dEUFJfX1xuXHRcdFwiZXh0ZW5zaW9uR2FsbGVyeTpvcGVuRXh0ZW5zaW9uXCIgOiB7XG5cdFx0XHRcIm93bmVyXCI6IFwic2FuZHkwODFcIixcblx0XHRcdFwicmVjb21tZW5kYXRpb25SZWFzb25cIjogeyBcImNsYXNzaWZpY2F0aW9uXCI6IFwiU3lzdGVtTWV0YURhdGFcIiwgXCJwdXJwb3NlXCI6IFwiRmVhdHVyZUluc2lnaHRcIiwgXCJpc01lYXN1cmVtZW50XCI6IHRydWUgfSxcblx0XHRcdFwiJHtpbmNsdWRlfVwiOiBbXG5cdFx0XHRcdFwiJHtHYWxsZXJ5RXh0ZW5zaW9uVGVsZW1ldHJ5RGF0YX1cIlxuXHRcdFx0XVxuXHRcdH1cblx0XHQqL1xuXHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2coJ2V4dGVuc2lvbkdhbGxlcnk6b3BlbkV4dGVuc2lvbicsIHsgLi4uZXh0ZW5zaW9uLnRlbGVtZXRyeURhdGEsIC4uLnJlY29tbWVuZGF0aW9uc0RhdGEgfSk7XG5cblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyTmF2YmFyKGV4dGVuc2lvbjogSUV4dGVuc2lvbiwgbWFuaWZlc3Q6IElFeHRlbnNpb25NYW5pZmVzdCB8IG51bGwsIHRlbXBsYXRlOiBJRXh0ZW5zaW9uRWRpdG9yVGVtcGxhdGUsIHByZXNlcnZlRm9jdXM6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZS5jb250ZW50LmlubmVyVGV4dCA9ICcnO1xuXHRcdHRlbXBsYXRlLm5hdmJhci5jbGVhcigpO1xuXG5cdFx0aWYgKHRoaXMuY3VycmVudElkZW50aWZpZXIgIT09IGV4dGVuc2lvbi5pZGVudGlmaWVyLmlkKSB7XG5cdFx0XHR0aGlzLmluaXRpYWxTY3JvbGxQcm9ncmVzcy5jbGVhcigpO1xuXHRcdFx0dGhpcy5jdXJyZW50SWRlbnRpZmllciA9IGV4dGVuc2lvbi5pZGVudGlmaWVyLmlkO1xuXHRcdH1cblxuXHRcdHRlbXBsYXRlLm5hdmJhci5wdXNoKEV4dGVuc2lvbkVkaXRvclRhYi5SZWFkbWUsIGxvY2FsaXplKCdkZXRhaWxzJywgXCJEZXRhaWxzXCIpLCBsb2NhbGl6ZSgnZGV0YWlsc3Rvb2x0aXAnLCBcIkV4dGVuc2lvbiBkZXRhaWxzLCByZW5kZXJlZCBmcm9tIHRoZSBleHRlbnNpb24ncyAnUkVBRE1FLm1kJyBmaWxlXCIpKTtcblx0XHRpZiAobWFuaWZlc3QpIHtcblx0XHRcdHRlbXBsYXRlLm5hdmJhci5wdXNoKEV4dGVuc2lvbkVkaXRvclRhYi5GZWF0dXJlcywgbG9jYWxpemUoJ2ZlYXR1cmVzJywgXCJGZWF0dXJlc1wiKSwgbG9jYWxpemUoJ2ZlYXR1cmVzdG9vbHRpcCcsIFwiTGlzdHMgZmVhdHVyZXMgY29udHJpYnV0ZWQgYnkgdGhpcyBleHRlbnNpb25cIikpO1xuXHRcdH1cblx0XHRpZiAoZXh0ZW5zaW9uLmhhc0NoYW5nZWxvZygpKSB7XG5cdFx0XHR0ZW1wbGF0ZS5uYXZiYXIucHVzaChFeHRlbnNpb25FZGl0b3JUYWIuQ2hhbmdlbG9nLCBsb2NhbGl6ZSgnY2hhbmdlbG9nJywgXCJDaGFuZ2Vsb2dcIiksIGxvY2FsaXplKCdjaGFuZ2Vsb2d0b29sdGlwJywgXCJFeHRlbnNpb24gdXBkYXRlIGhpc3RvcnksIHJlbmRlcmVkIGZyb20gdGhlIGV4dGVuc2lvbidzICdDSEFOR0VMT0cubWQnIGZpbGVcIikpO1xuXHRcdH1cblx0XHRpZiAoZXh0ZW5zaW9uLmRlcGVuZGVuY2llcy5sZW5ndGgpIHtcblx0XHRcdHRlbXBsYXRlLm5hdmJhci5wdXNoKEV4dGVuc2lvbkVkaXRvclRhYi5EZXBlbmRlbmNpZXMsIGxvY2FsaXplKCdkZXBlbmRlbmNpZXMnLCBcIkRlcGVuZGVuY2llc1wiKSwgbG9jYWxpemUoJ2RlcGVuZGVuY2llc3Rvb2x0aXAnLCBcIkxpc3RzIGV4dGVuc2lvbnMgdGhpcyBleHRlbnNpb24gZGVwZW5kcyBvblwiKSk7XG5cdFx0fVxuXHRcdGlmIChtYW5pZmVzdCAmJiBtYW5pZmVzdC5leHRlbnNpb25QYWNrPy5sZW5ndGggJiYgIXRoaXMuc2hhbGxSZW5kZXJBc0V4dGVuc2lvblBhY2sobWFuaWZlc3QpKSB7XG5cdFx0XHR0ZW1wbGF0ZS5uYXZiYXIucHVzaChFeHRlbnNpb25FZGl0b3JUYWIuRXh0ZW5zaW9uUGFjaywgbG9jYWxpemUoJ2V4dGVuc2lvbnBhY2snLCBcIkV4dGVuc2lvbiBQYWNrXCIpLCBsb2NhbGl6ZSgnZXh0ZW5zaW9ucGFja3Rvb2x0aXAnLCBcIkxpc3RzIGV4dGVuc2lvbnMgdGhvc2Ugd2lsbCBiZSBpbnN0YWxsZWQgdG9nZXRoZXIgd2l0aCB0aGlzIGV4dGVuc2lvblwiKSk7XG5cdFx0fVxuXG5cdFx0aWYgKCg8SUV4dGVuc2lvbkVkaXRvck9wdGlvbnMgfCB1bmRlZmluZWQ+dGhpcy5vcHRpb25zKT8udGFiKSB7XG5cdFx0XHR0ZW1wbGF0ZS5uYXZiYXIuc3dpdGNoKCg8SUV4dGVuc2lvbkVkaXRvck9wdGlvbnM+dGhpcy5vcHRpb25zKS50YWIhKTtcblx0XHR9XG5cdFx0aWYgKHRlbXBsYXRlLm5hdmJhci5jdXJyZW50SWQpIHtcblx0XHRcdHRoaXMub25OYXZiYXJDaGFuZ2UoZXh0ZW5zaW9uLCB7IGlkOiB0ZW1wbGF0ZS5uYXZiYXIuY3VycmVudElkLCBmb2N1czogIXByZXNlcnZlRm9jdXMgfSwgdGVtcGxhdGUpO1xuXHRcdH1cblx0XHR0ZW1wbGF0ZS5uYXZiYXIub25DaGFuZ2UoZSA9PiB0aGlzLm9uTmF2YmFyQ2hhbmdlKGV4dGVuc2lvbiwgZSwgdGVtcGxhdGUpLCB0aGlzLCB0aGlzLnRyYW5zaWVudERpc3Bvc2FibGVzKTtcblx0fVxuXG5cdG92ZXJyaWRlIGNsZWFySW5wdXQoKTogdm9pZCB7XG5cdFx0dGhpcy5jb250ZW50RGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHR0aGlzLnRyYW5zaWVudERpc3Bvc2FibGVzLmNsZWFyKCk7XG5cblx0XHRzdXBlci5jbGVhcklucHV0KCk7XG5cdH1cblxuXHRvdmVycmlkZSBmb2N1cygpOiB2b2lkIHtcblx0XHRzdXBlci5mb2N1cygpO1xuXHRcdHRoaXMuYWN0aXZlRWxlbWVudD8uZm9jdXMoKTtcblx0fVxuXG5cdHNob3dGaW5kKCk6IHZvaWQge1xuXHRcdHRoaXMuYWN0aXZlV2Vidmlldz8uc2hvd0ZpbmQoKTtcblx0fVxuXG5cdHJ1bkZpbmRBY3Rpb24ocHJldmlvdXM6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLmFjdGl2ZVdlYnZpZXc/LnJ1bkZpbmRBY3Rpb24ocHJldmlvdXMpO1xuXHR9XG5cblx0cHVibGljIGdldCBhY3RpdmVXZWJ2aWV3KCk6IElXZWJ2aWV3IHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIXRoaXMuYWN0aXZlRWxlbWVudCB8fCAhKHRoaXMuYWN0aXZlRWxlbWVudCBhcyBJV2VidmlldykucnVuRmluZEFjdGlvbikge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuYWN0aXZlRWxlbWVudCBhcyBJV2Vidmlldztcblx0fVxuXG5cdHByaXZhdGUgb25OYXZiYXJDaGFuZ2UoZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uLCB7IGlkLCBmb2N1cyB9OiB7IGlkOiBzdHJpbmcgfCBudWxsOyBmb2N1czogYm9vbGVhbiB9LCB0ZW1wbGF0ZTogSUV4dGVuc2lvbkVkaXRvclRlbXBsYXRlKTogdm9pZCB7XG5cdFx0dGhpcy5jb250ZW50RGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHR0ZW1wbGF0ZS5jb250ZW50LmlubmVyVGV4dCA9ICcnO1xuXHRcdHRoaXMuYWN0aXZlRWxlbWVudCA9IG51bGw7XG5cdFx0aWYgKGlkKSB7XG5cdFx0XHRjb25zdCBjdHMgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0XHRcdHRoaXMuY29udGVudERpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gY3RzLmRpc3Bvc2UodHJ1ZSkpKTtcblx0XHRcdHRoaXMub3BlbihpZCwgZXh0ZW5zaW9uLCB0ZW1wbGF0ZSwgY3RzLnRva2VuKVxuXHRcdFx0XHQudGhlbihhY3RpdmVFbGVtZW50ID0+IHtcblx0XHRcdFx0XHRpZiAoY3RzLnRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHRoaXMuYWN0aXZlRWxlbWVudCA9IGFjdGl2ZUVsZW1lbnQ7XG5cdFx0XHRcdFx0aWYgKGZvY3VzKSB7XG5cdFx0XHRcdFx0XHR0aGlzLmZvY3VzKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIG9wZW4oaWQ6IHN0cmluZywgZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uLCB0ZW1wbGF0ZTogSUV4dGVuc2lvbkVkaXRvclRlbXBsYXRlLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElBY3RpdmVFbGVtZW50IHwgbnVsbD4ge1xuXHRcdC8vIFNldHVwIGNvbW1vbiBjb250YWluZXIgc3RydWN0dXJlIGZvciBhbGwgdGFic1xuXHRcdGNvbnN0IGRldGFpbHMgPSBhcHBlbmQodGVtcGxhdGUuY29udGVudCwgJCgnLmRldGFpbHMnKSk7XG5cdFx0Y29uc3QgY29udGVudENvbnRhaW5lciA9IGFwcGVuZChkZXRhaWxzLCAkKCcuY29udGVudC1jb250YWluZXInKSk7XG5cdFx0Y29uc3QgYWRkaXRpb25hbERldGFpbHNDb250YWluZXIgPSBhcHBlbmQoZGV0YWlscywgJCgnLmFkZGl0aW9uYWwtZGV0YWlscy1jb250YWluZXInKSk7XG5cblx0XHRjb25zdCBsYXlvdXQgPSAoKSA9PiBkZXRhaWxzLmNsYXNzTGlzdC50b2dnbGUoJ25hcnJvdycsIHRoaXMuZGltZW5zaW9uICYmIHRoaXMuZGltZW5zaW9uLndpZHRoIDwgNTAwKTtcblx0XHRsYXlvdXQoKTtcblx0XHR0aGlzLmNvbnRlbnREaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKGFycmF5cy5pbnNlcnQodGhpcy5sYXlvdXRQYXJ0aWNpcGFudHMsIHsgbGF5b3V0IH0pKSk7XG5cblx0XHQvLyBSZW5kZXIgYWRkaXRpb25hbCBkZXRhaWxzIHN5bmNocm9ub3VzbHkgdG8gYXZvaWQgZmxpY2tlclxuXHRcdHRoaXMucmVuZGVyQWRkaXRpb25hbERldGFpbHMoYWRkaXRpb25hbERldGFpbHNDb250YWluZXIsIGV4dGVuc2lvbik7XG5cblx0XHRzd2l0Y2ggKGlkKSB7XG5cdFx0XHRjYXNlIEV4dGVuc2lvbkVkaXRvclRhYi5SZWFkbWU6IHJldHVybiB0aGlzLm9wZW5EZXRhaWxzKGV4dGVuc2lvbiwgY29udGVudENvbnRhaW5lciwgdG9rZW4pO1xuXHRcdFx0Y2FzZSBFeHRlbnNpb25FZGl0b3JUYWIuRmVhdHVyZXM6IHJldHVybiB0aGlzLm9wZW5GZWF0dXJlcyhleHRlbnNpb24sIGNvbnRlbnRDb250YWluZXIsIHRva2VuKTtcblx0XHRcdGNhc2UgRXh0ZW5zaW9uRWRpdG9yVGFiLkNoYW5nZWxvZzogcmV0dXJuIHRoaXMub3BlbkNoYW5nZWxvZyhleHRlbnNpb24sIGNvbnRlbnRDb250YWluZXIsIHRva2VuKTtcblx0XHRcdGNhc2UgRXh0ZW5zaW9uRWRpdG9yVGFiLkRlcGVuZGVuY2llczogcmV0dXJuIHRoaXMub3BlbkV4dGVuc2lvbkRlcGVuZGVuY2llcyhleHRlbnNpb24sIGNvbnRlbnRDb250YWluZXIsIHRva2VuKTtcblx0XHRcdGNhc2UgRXh0ZW5zaW9uRWRpdG9yVGFiLkV4dGVuc2lvblBhY2s6IHJldHVybiB0aGlzLm9wZW5FeHRlbnNpb25QYWNrKGV4dGVuc2lvbiwgY29udGVudENvbnRhaW5lciwgdG9rZW4pO1xuXHRcdH1cblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKG51bGwpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBvcGVuTWFya2Rvd24oZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uLCBjYWNoZVJlc3VsdDogQ2FjaGVSZXN1bHQ8c3RyaW5nPiwgbm9Db250ZW50Q29weTogc3RyaW5nLCBjb250YWluZXI6IEhUTUxFbGVtZW50LCB3ZWJ2aWV3SW5kZXg6IFdlYnZpZXdJbmRleCwgdGl0bGU6IHN0cmluZywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJQWN0aXZlRWxlbWVudCB8IG51bGw+IHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgYm9keSA9IGF3YWl0IHRoaXMucmVuZGVyTWFya2Rvd24oZXh0ZW5zaW9uLCBjYWNoZVJlc3VsdCwgY29udGFpbmVyLCB0b2tlbik7XG5cdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShudWxsKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgd2VidmlldyA9IHRoaXMuY29udGVudERpc3Bvc2FibGVzLmFkZCh0aGlzLndlYnZpZXdTZXJ2aWNlLmNyZWF0ZVdlYnZpZXdPdmVybGF5KHtcblx0XHRcdFx0dGl0bGUsXG5cdFx0XHRcdG9wdGlvbnM6IHtcblx0XHRcdFx0XHRlbmFibGVGaW5kV2lkZ2V0OiB0cnVlLFxuXHRcdFx0XHRcdHRyeVJlc3RvcmVTY3JvbGxQb3NpdGlvbjogdHJ1ZSxcblx0XHRcdFx0XHRkaXNhYmxlU2VydmljZVdvcmtlcjogdHJ1ZSxcblx0XHRcdFx0fSxcblx0XHRcdFx0Y29udGVudE9wdGlvbnM6IHt9LFxuXHRcdFx0XHRleHRlbnNpb246IHVuZGVmaW5lZCxcblx0XHRcdH0pKTtcblxuXHRcdFx0d2Vidmlldy5pbml0aWFsU2Nyb2xsUHJvZ3Jlc3MgPSB0aGlzLmluaXRpYWxTY3JvbGxQcm9ncmVzcy5nZXQod2Vidmlld0luZGV4KSB8fCAwO1xuXG5cdFx0XHR3ZWJ2aWV3LmNsYWltKHRoaXMsIHRoaXMud2luZG93LCB0aGlzLnNjb3BlZENvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRcdHNldFBhcmVudEZsb3dUbyh3ZWJ2aWV3LmNvbnRhaW5lciwgY29udGFpbmVyKTtcblx0XHRcdHdlYnZpZXcuc2V0QW5jaG9yRWxlbWVudChjb250YWluZXIpO1xuXG5cdFx0XHR3ZWJ2aWV3LnNldEh0bWwoYm9keSk7XG5cdFx0XHR3ZWJ2aWV3LmNsYWltKHRoaXMsIHRoaXMud2luZG93LCB1bmRlZmluZWQpO1xuXG5cdFx0XHR0aGlzLmNvbnRlbnREaXNwb3NhYmxlcy5hZGQod2Vidmlldy5vbkRpZEZvY3VzKCgpID0+IHRoaXMuX29uRGlkRm9jdXM/LmZpcmUoKSkpO1xuXG5cdFx0XHR0aGlzLmNvbnRlbnREaXNwb3NhYmxlcy5hZGQod2Vidmlldy5vbkRpZFNjcm9sbCgoKSA9PiB0aGlzLmluaXRpYWxTY3JvbGxQcm9ncmVzcy5zZXQod2Vidmlld0luZGV4LCB3ZWJ2aWV3LmluaXRpYWxTY3JvbGxQcm9ncmVzcykpKTtcblxuXHRcdFx0bGV0IGlzRGlzcG9zZWQgPSBmYWxzZTtcblx0XHRcdHRoaXMuY29udGVudERpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4geyBpc0Rpc3Bvc2VkID0gdHJ1ZTsgfSkpO1xuXG5cdFx0XHR0aGlzLmNvbnRlbnREaXNwb3NhYmxlcy5hZGQodGhpcy50aGVtZVNlcnZpY2Uub25EaWRDb2xvclRoZW1lQ2hhbmdlKGFzeW5jICgpID0+IHtcblx0XHRcdFx0Ly8gUmVuZGVyIGFnYWluIHNpbmNlIHN5bnRheCBoaWdobGlnaHRpbmcgb2YgY29kZSBibG9ja3MgbWF5IGhhdmUgY2hhbmdlZFxuXHRcdFx0XHRjb25zdCBib2R5ID0gYXdhaXQgdGhpcy5yZW5kZXJNYXJrZG93bihleHRlbnNpb24sIGNhY2hlUmVzdWx0LCBjb250YWluZXIpO1xuXHRcdFx0XHRpZiAoIWlzRGlzcG9zZWQpIHsgLy8gTWFrZSBzdXJlIHdlIHdlcmVuJ3QgZGlzcG9zZWQgb2YgaW4gdGhlIG1lYW50aW1lXG5cdFx0XHRcdFx0d2Vidmlldy5zZXRIdG1sKGJvZHkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cblx0XHRcdHRoaXMuY29udGVudERpc3Bvc2FibGVzLmFkZCh3ZWJ2aWV3Lm9uRGlkQ2xpY2tMaW5rKGxpbmsgPT4ge1xuXHRcdFx0XHRpZiAoIWxpbmspIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0Ly8gT25seSBhbGxvdyBsaW5rcyB3aXRoIHNwZWNpZmljIHNjaGVtZXNcblx0XHRcdFx0aWYgKG1hdGNoZXNTY2hlbWUobGluaywgU2NoZW1hcy5odHRwKSB8fCBtYXRjaGVzU2NoZW1lKGxpbmssIFNjaGVtYXMuaHR0cHMpIHx8IG1hdGNoZXNTY2hlbWUobGluaywgU2NoZW1hcy5tYWlsdG8pKSB7XG5cdFx0XHRcdFx0dGhpcy5vcGVuZXJTZXJ2aWNlLm9wZW4obGluayk7XG5cdFx0XHRcdH0gZWxzZSBpZiAobWF0Y2hlc1NjaGVtZShsaW5rLCBTY2hlbWFzLmNvbW1hbmQpICYmIGV4dGVuc2lvbi50eXBlID09PSBFeHRlbnNpb25UeXBlLlN5c3RlbSkge1xuXHRcdFx0XHRcdHRoaXMub3BlbmVyU2VydmljZS5vcGVuKGxpbmssIHtcblx0XHRcdFx0XHRcdGFsbG93Q29tbWFuZHM6IFtcblx0XHRcdFx0XHRcdFx0U2hvd0N1cnJlbnRSZWxlYXNlTm90ZXNBY3Rpb25JZFxuXHRcdFx0XHRcdFx0XVxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cblx0XHRcdHJldHVybiB3ZWJ2aWV3O1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdGNvbnN0IHAgPSBhcHBlbmQoY29udGFpbmVyLCAkKCdwLm5vY29udGVudCcpKTtcblx0XHRcdHAudGV4dENvbnRlbnQgPSBub0NvbnRlbnRDb3B5O1xuXHRcdFx0cmV0dXJuIHA7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyByZW5kZXJNYXJrZG93bihleHRlbnNpb246IElFeHRlbnNpb24sIGNhY2hlUmVzdWx0OiBDYWNoZVJlc3VsdDxzdHJpbmc+LCBjb250YWluZXI6IEhUTUxFbGVtZW50LCB0b2tlbj86IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRjb25zdCBjb250ZW50cyA9IGF3YWl0IHRoaXMubG9hZENvbnRlbnRzKCgpID0+IGNhY2hlUmVzdWx0LCBjb250YWluZXIpO1xuXHRcdGlmICh0b2tlbj8uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHJldHVybiAnJztcblx0XHR9XG5cblx0XHRjb25zdCBhbGxvd2VkTGlua1Byb3RvY29scyA9IFtTY2hlbWFzLmh0dHAsIFNjaGVtYXMuaHR0cHMsIFNjaGVtYXMubWFpbHRvXTtcblx0XHRjb25zdCBjb250ZW50ID0gYXdhaXQgcmVuZGVyTWFya2Rvd25Eb2N1bWVudChjb250ZW50cywgdGhpcy5leHRlbnNpb25TZXJ2aWNlLCB0aGlzLmxhbmd1YWdlU2VydmljZSwge1xuXHRcdFx0c2FuaXRpemVyQ29uZmlnOiB7XG5cdFx0XHRcdGFsbG93ZWRMaW5rUHJvdG9jb2xzOiB7XG5cdFx0XHRcdFx0b3ZlcnJpZGU6IGV4dGVuc2lvbi50eXBlID09PSBFeHRlbnNpb25UeXBlLlN5c3RlbVxuXHRcdFx0XHRcdFx0PyBbLi4uYWxsb3dlZExpbmtQcm90b2NvbHMsIFNjaGVtYXMuY29tbWFuZF1cblx0XHRcdFx0XHRcdDogYWxsb3dlZExpbmtQcm90b2NvbHNcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0sIHRva2VuKTtcblx0XHRpZiAodG9rZW4/LmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRyZXR1cm4gJyc7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMucmVuZGVyQm9keShjb250ZW50KTtcblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyQm9keShib2R5OiBUcnVzdGVkSFRNTCk6IHN0cmluZyB7XG5cdFx0Y29uc3Qgbm9uY2UgPSBnZW5lcmF0ZVV1aWQoKTtcblx0XHRjb25zdCBjb2xvck1hcCA9IFRva2VuaXphdGlvblJlZ2lzdHJ5LmdldENvbG9yTWFwKCk7XG5cdFx0Y29uc3QgY3NzID0gY29sb3JNYXAgPyBnZW5lcmF0ZVRva2Vuc0NTU0ZvckNvbG9yTWFwKGNvbG9yTWFwKSA6ICcnO1xuXHRcdHJldHVybiBgPCFET0NUWVBFIGh0bWw+XG5cdFx0PGh0bWw+XG5cdFx0XHQ8aGVhZD5cblx0XHRcdFx0PG1ldGEgaHR0cC1lcXVpdj1cIkNvbnRlbnQtdHlwZVwiIGNvbnRlbnQ9XCJ0ZXh0L2h0bWw7Y2hhcnNldD1VVEYtOFwiPlxuXHRcdFx0XHQ8bWV0YSBodHRwLWVxdWl2PVwiQ29udGVudC1TZWN1cml0eS1Qb2xpY3lcIiBjb250ZW50PVwiZGVmYXVsdC1zcmMgJ25vbmUnOyBpbWctc3JjIGh0dHBzOiBkYXRhOjsgbWVkaWEtc3JjIGh0dHBzOjsgc2NyaXB0LXNyYyAnbm9uZSc7IHN0eWxlLXNyYyAnbm9uY2UtJHtub25jZX0nO1wiPlxuXHRcdFx0XHQ8c3R5bGUgbm9uY2U9XCIke25vbmNlfVwiPlxuXHRcdFx0XHRcdCR7REVGQVVMVF9NQVJLRE9XTl9TVFlMRVN9XG5cblx0XHRcdFx0XHQvKiBwcmV2ZW50IHNjcm9sbC10by10b3AgYnV0dG9uIGZyb20gYmxvY2tpbmcgdGhlIGJvZHkgdGV4dCAqL1xuXHRcdFx0XHRcdGJvZHkge1xuXHRcdFx0XHRcdFx0cGFkZGluZy1ib3R0b206IDc1cHg7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0I3Njcm9sbC10by10b3Age1xuXHRcdFx0XHRcdFx0cG9zaXRpb246IGZpeGVkO1xuXHRcdFx0XHRcdFx0d2lkdGg6IDMycHg7XG5cdFx0XHRcdFx0XHRoZWlnaHQ6IDMycHg7XG5cdFx0XHRcdFx0XHRyaWdodDogMjVweDtcblx0XHRcdFx0XHRcdGJvdHRvbTogMjVweDtcblx0XHRcdFx0XHRcdGJhY2tncm91bmQtY29sb3I6IHZhcigtLXZzY29kZS1idXR0b24tc2Vjb25kYXJ5QmFja2dyb3VuZCk7XG5cdFx0XHRcdFx0XHRib3JkZXItY29sb3I6IHZhcigtLXZzY29kZS1idXR0b24tYm9yZGVyKTtcblx0XHRcdFx0XHRcdGJvcmRlci1yYWRpdXM6IDUwJTtcblx0XHRcdFx0XHRcdGN1cnNvcjogcG9pbnRlcjtcblx0XHRcdFx0XHRcdGJveC1zaGFkb3c6IDFweCAxcHggMXB4IHJnYmEoMCwwLDAsLjI1KTtcblx0XHRcdFx0XHRcdG91dGxpbmU6IG5vbmU7XG5cdFx0XHRcdFx0XHRkaXNwbGF5OiBmbGV4O1xuXHRcdFx0XHRcdFx0anVzdGlmeS1jb250ZW50OiBjZW50ZXI7XG5cdFx0XHRcdFx0XHRhbGlnbi1pdGVtczogY2VudGVyO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdCNzY3JvbGwtdG8tdG9wOmhvdmVyIHtcblx0XHRcdFx0XHRcdGJhY2tncm91bmQtY29sb3I6IHZhcigtLXZzY29kZS1idXR0b24tc2Vjb25kYXJ5SG92ZXJCYWNrZ3JvdW5kKTtcblx0XHRcdFx0XHRcdGJveC1zaGFkb3c6IDJweCAycHggMnB4IHJnYmEoMCwwLDAsLjI1KTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRib2R5LnZzY29kZS1oaWdoLWNvbnRyYXN0ICNzY3JvbGwtdG8tdG9wIHtcblx0XHRcdFx0XHRcdGJvcmRlci13aWR0aDogMnB4O1xuXHRcdFx0XHRcdFx0Ym9yZGVyLXN0eWxlOiBzb2xpZDtcblx0XHRcdFx0XHRcdGJveC1zaGFkb3c6IG5vbmU7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0I3Njcm9sbC10by10b3Agc3Bhbi5pY29uOjpiZWZvcmUge1xuXHRcdFx0XHRcdFx0Y29udGVudDogXCJcIjtcblx0XHRcdFx0XHRcdGRpc3BsYXk6IGJsb2NrO1xuXHRcdFx0XHRcdFx0YmFja2dyb3VuZDogdmFyKC0tdnNjb2RlLWJ1dHRvbi1zZWNvbmRhcnlGb3JlZ3JvdW5kKTtcblx0XHRcdFx0XHRcdC8qIENoZXZyb24gdXAgaWNvbiAqL1xuXHRcdFx0XHRcdFx0d2Via2l0LW1hc2staW1hZ2U6IHVybCgnZGF0YTppbWFnZS9zdmcreG1sO2Jhc2U2NCxQRDk0Yld3Z2RtVnljMmx2YmowaU1TNHdJaUJsYm1OdlpHbHVaejBpZFhSbUxUZ2lQejRLUENFdExTQkhaVzVsY21GMGIzSTZJRUZrYjJKbElFbHNiSFZ6ZEhKaGRHOXlJREU1TGpJdU1Dd2dVMVpISUVWNGNHOXlkQ0JRYkhWbkxVbHVJQzRnVTFaSElGWmxjbk5wYjI0NklEWXVNREFnUW5WcGJHUWdNQ2tnSUMwdFBnbzhjM1puSUhabGNuTnBiMjQ5SWpFdU1TSWdhV1E5SWt4aGVXVnlYekVpSUhodGJHNXpQU0pvZEhSd09pOHZkM2QzTG5jekxtOXlaeTh5TURBd0wzTjJaeUlnZUcxc2JuTTZlR3hwYm1zOUltaDBkSEE2THk5M2QzY3Vkek11YjNKbkx6RTVPVGt2ZUd4cGJtc2lJSGc5SWpCd2VDSWdlVDBpTUhCNElnb0pJSFpwWlhkQ2IzZzlJakFnTUNBeE5pQXhOaUlnYzNSNWJHVTlJbVZ1WVdKc1pTMWlZV05yWjNKdmRXNWtPbTVsZHlBd0lEQWdNVFlnTVRZN0lpQjRiV3c2YzNCaFkyVTlJbkJ5WlhObGNuWmxJajRLUEhOMGVXeGxJSFI1Y0dVOUluUmxlSFF2WTNOeklqNEtDUzV6ZERCN1ptbHNiRG9qUmtaR1JrWkdPMzBLQ1M1emRERjdabWxzYkRwdWIyNWxPMzBLUEM5emRIbHNaVDRLUEhScGRHeGxQblZ3WTJobGRuSnZiand2ZEdsMGJHVStDanh3WVhSb0lHTnNZWE56UFNKemREQWlJR1E5SWswNExEVXVNV3d0Tnk0ekxEY3VNMHd3TERFeExqWnNPQzA0YkRnc09Hd3RNQzQzTERBdU4wdzRMRFV1TVhvaUx6NEtQSEpsWTNRZ1kyeGhjM005SW5OME1TSWdkMmxrZEdnOUlqRTJJaUJvWldsbmFIUTlJakUySWk4K0Nqd3ZjM1puUGdvPScpO1xuXHRcdFx0XHRcdFx0LXdlYmtpdC1tYXNrLWltYWdlOiB1cmwoJ2RhdGE6aW1hZ2Uvc3ZnK3htbDtiYXNlNjQsUEQ5NGJXd2dkbVZ5YzJsdmJqMGlNUzR3SWlCbGJtTnZaR2x1WnowaWRYUm1MVGdpUHo0S1BDRXRMU0JIWlc1bGNtRjBiM0k2SUVGa2IySmxJRWxzYkhWemRISmhkRzl5SURFNUxqSXVNQ3dnVTFaSElFVjRjRzl5ZENCUWJIVm5MVWx1SUM0Z1UxWkhJRlpsY25OcGIyNDZJRFl1TURBZ1FuVnBiR1FnTUNrZ0lDMHRQZ284YzNabklIWmxjbk5wYjI0OUlqRXVNU0lnYVdROUlreGhlV1Z5WHpFaUlIaHRiRzV6UFNKb2RIUndPaTh2ZDNkM0xuY3pMbTl5Wnk4eU1EQXdMM04yWnlJZ2VHMXNibk02ZUd4cGJtczlJbWgwZEhBNkx5OTNkM2N1ZHpNdWIzSm5MekU1T1RrdmVHeHBibXNpSUhnOUlqQndlQ0lnZVQwaU1IQjRJZ29KSUhacFpYZENiM2c5SWpBZ01DQXhOaUF4TmlJZ2MzUjViR1U5SW1WdVlXSnNaUzFpWVdOclozSnZkVzVrT201bGR5QXdJREFnTVRZZ01UWTdJaUI0Yld3NmMzQmhZMlU5SW5CeVpYTmxjblpsSWo0S1BITjBlV3hsSUhSNWNHVTlJblJsZUhRdlkzTnpJajRLQ1M1emREQjdabWxzYkRvalJrWkdSa1pHTzMwS0NTNXpkREY3Wm1sc2JEcHViMjVsTzMwS1BDOXpkSGxzWlQ0S1BIUnBkR3hsUG5Wd1kyaGxkbkp2Ymp3dmRHbDBiR1UrQ2p4d1lYUm9JR05zWVhOelBTSnpkREFpSUdROUlrMDRMRFV1TVd3dE55NHpMRGN1TTB3d0xERXhMalpzT0MwNGJEZ3NPR3d0TUM0M0xEQXVOMHc0TERVdU1Yb2lMejRLUEhKbFkzUWdZMnhoYzNNOUluTjBNU0lnZDJsa2RHZzlJakUySWlCb1pXbG5hSFE5SWpFMklpOCtDand2YzNablBnbz0nKTtcblx0XHRcdFx0XHRcdHdpZHRoOiAxNnB4O1xuXHRcdFx0XHRcdFx0aGVpZ2h0OiAxNnB4O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHQke2Nzc31cblx0XHRcdFx0PC9zdHlsZT5cblx0XHRcdDwvaGVhZD5cblx0XHRcdDxib2R5PlxuXHRcdFx0XHQ8YSBpZD1cInNjcm9sbC10by10b3BcIiByb2xlPVwiYnV0dG9uXCIgYXJpYS1sYWJlbD1cInNjcm9sbCB0byB0b3BcIiBocmVmPVwiI1wiPjxzcGFuIGNsYXNzPVwiaWNvblwiPjwvc3Bhbj48L2E+XG5cdFx0XHRcdCR7Ym9keX1cblx0XHRcdDwvYm9keT5cblx0XHQ8L2h0bWw+YDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgb3BlbkRldGFpbHMoZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uLCBjb250ZW50Q29udGFpbmVyOiBIVE1MRWxlbWVudCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJQWN0aXZlRWxlbWVudCB8IG51bGw+IHtcblx0XHRsZXQgYWN0aXZlRWxlbWVudDogSUFjdGl2ZUVsZW1lbnQgfCBudWxsID0gbnVsbDtcblx0XHRjb25zdCBtYW5pZmVzdCA9IGF3YWl0IHRoaXMuZXh0ZW5zaW9uTWFuaWZlc3QhLmdldCgpLnByb21pc2U7XG5cdFx0aWYgKG1hbmlmZXN0ICYmIG1hbmlmZXN0LmV4dGVuc2lvblBhY2s/Lmxlbmd0aCAmJiB0aGlzLnNoYWxsUmVuZGVyQXNFeHRlbnNpb25QYWNrKG1hbmlmZXN0KSkge1xuXHRcdFx0YWN0aXZlRWxlbWVudCA9IGF3YWl0IHRoaXMub3BlbkV4dGVuc2lvblBhY2tSZWFkbWUoZXh0ZW5zaW9uLCBtYW5pZmVzdCwgY29udGVudENvbnRhaW5lciwgdG9rZW4pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRhY3RpdmVFbGVtZW50ID0gYXdhaXQgdGhpcy5vcGVuTWFya2Rvd24oZXh0ZW5zaW9uLCB0aGlzLmV4dGVuc2lvblJlYWRtZSEuZ2V0KCksIGxvY2FsaXplKCdub1JlYWRtZScsIFwiTm8gUkVBRE1FIGF2YWlsYWJsZS5cIiksIGNvbnRlbnRDb250YWluZXIsIFdlYnZpZXdJbmRleC5SZWFkbWUsIGxvY2FsaXplKCdSZWFkbWUgdGl0bGUnLCBcIlJlYWRtZVwiKSwgdG9rZW4pO1xuXHRcdH1cblxuXHRcdHJldHVybiBhY3RpdmVFbGVtZW50O1xuXHR9XG5cblx0cHJpdmF0ZSBzaGFsbFJlbmRlckFzRXh0ZW5zaW9uUGFjayhtYW5pZmVzdDogSUV4dGVuc2lvbk1hbmlmZXN0KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICEhKG1hbmlmZXN0LmNhdGVnb3JpZXM/LnNvbWUoY2F0ZWdvcnkgPT4gY2F0ZWdvcnkudG9Mb3dlckNhc2UoKSA9PT0gJ2V4dGVuc2lvbiBwYWNrcycpKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgb3BlbkV4dGVuc2lvblBhY2tSZWFkbWUoZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uLCBtYW5pZmVzdDogSUV4dGVuc2lvbk1hbmlmZXN0LCBjb250YWluZXI6IEhUTUxFbGVtZW50LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElBY3RpdmVFbGVtZW50IHwgbnVsbD4ge1xuXHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShudWxsKTtcblx0XHR9XG5cblx0XHRjb25zdCBleHRlbnNpb25QYWNrUmVhZG1lID0gYXBwZW5kKGNvbnRhaW5lciwgJCgnZGl2JywgeyBjbGFzczogJ2V4dGVuc2lvbi1wYWNrLXJlYWRtZScgfSkpO1xuXHRcdGV4dGVuc2lvblBhY2tSZWFkbWUuc3R5bGUubWFyZ2luID0gJzAgYXV0byc7XG5cdFx0ZXh0ZW5zaW9uUGFja1JlYWRtZS5zdHlsZS5tYXhXaWR0aCA9ICc4ODJweCc7XG5cblx0XHRjb25zdCBleHRlbnNpb25QYWNrID0gYXBwZW5kKGV4dGVuc2lvblBhY2tSZWFkbWUsICQoJ2RpdicsIHsgY2xhc3M6ICdleHRlbnNpb24tcGFjaycgfSkpO1xuXG5cdFx0Y29uc3QgcGFja0NvdW50ID0gbWFuaWZlc3QuZXh0ZW5zaW9uUGFjayEubGVuZ3RoO1xuXHRcdGNvbnN0IGhlYWRlckhlaWdodCA9IDM3OyAvLyBuYXZiYXIgaGVpZ2h0XG5cdFx0Y29uc3QgY29udGVudE1pbkhlaWdodCA9IDIwMDsgLy8gbWluaW11bSBoZWlnaHQgZm9yIHJlYWRtZSBjb250ZW50XG5cblx0XHRjb25zdCBsYXlvdXQgPSAoKSA9PiB7XG5cdFx0XHRleHRlbnNpb25QYWNrUmVhZG1lLmNsYXNzTGlzdC5yZW1vdmUoJ29uZS1yb3cnLCAndHdvLXJvd3MnLCAndGhyZWUtcm93cycsICdtb3JlLXJvd3MnKTtcblx0XHRcdGNvbnN0IGF2YWlsYWJsZUhlaWdodCA9IGNvbnRhaW5lci5jbGllbnRIZWlnaHQ7XG5cdFx0XHRjb25zdCBhdmFpbGFibGVGb3JQYWNrID0gTWF0aC5tYXgoYXZhaWxhYmxlSGVpZ2h0IC0gaGVhZGVySGVpZ2h0IC0gY29udGVudE1pbkhlaWdodCwgMCk7XG5cdFx0XHRsZXQgcm93Q2xhc3MgPSAnb25lLXJvdyc7XG5cdFx0XHRpZiAoYXZhaWxhYmxlRm9yUGFjayA+PSAzMDIgJiYgcGFja0NvdW50ID4gNikge1xuXHRcdFx0XHRyb3dDbGFzcyA9ICdtb3JlLXJvd3MnO1xuXHRcdFx0fSBlbHNlIGlmIChhdmFpbGFibGVGb3JQYWNrID49IDI4MiAmJiBwYWNrQ291bnQgPiA0KSB7XG5cdFx0XHRcdHJvd0NsYXNzID0gJ3RocmVlLXJvd3MnO1xuXHRcdFx0fSBlbHNlIGlmIChhdmFpbGFibGVGb3JQYWNrID49IDIwMCAmJiBwYWNrQ291bnQgPiAyKSB7XG5cdFx0XHRcdHJvd0NsYXNzID0gJ3R3by1yb3dzJztcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJvd0NsYXNzID0gJ29uZS1yb3cnO1xuXHRcdFx0fVxuXHRcdFx0ZXh0ZW5zaW9uUGFja1JlYWRtZS5jbGFzc0xpc3QuYWRkKHJvd0NsYXNzKTtcblx0XHR9O1xuXG5cdFx0bGF5b3V0KCk7XG5cdFx0dGhpcy5jb250ZW50RGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZShhcnJheXMuaW5zZXJ0KHRoaXMubGF5b3V0UGFydGljaXBhbnRzLCB7IGxheW91dCB9KSkpO1xuXG5cdFx0Y29uc3QgZXh0ZW5zaW9uUGFja0hlYWRlciA9IGFwcGVuZChleHRlbnNpb25QYWNrLCAkKCdkaXYuaGVhZGVyJykpO1xuXHRcdGV4dGVuc2lvblBhY2tIZWFkZXIudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnZXh0ZW5zaW9uIHBhY2snLCBcIkV4dGVuc2lvbiBQYWNrICh7MH0pXCIsIG1hbmlmZXN0LmV4dGVuc2lvblBhY2shLmxlbmd0aCk7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uUGFja0NvbnRlbnQgPSBhcHBlbmQoZXh0ZW5zaW9uUGFjaywgJCgnZGl2JywgeyBjbGFzczogJ2V4dGVuc2lvbi1wYWNrLWNvbnRlbnQnIH0pKTtcblx0XHRleHRlbnNpb25QYWNrQ29udGVudC5zZXRBdHRyaWJ1dGUoJ3RhYmluZGV4JywgJzAnKTtcblx0XHRjb25zdCByZWFkbWVDb250ZW50ID0gYXBwZW5kKGV4dGVuc2lvblBhY2tSZWFkbWUsICQoJ2Rpdi5yZWFkbWUtY29udGVudCcpKTtcblxuXHRcdGF3YWl0IFByb21pc2UuYWxsKFtcblx0XHRcdHRoaXMucmVuZGVyRXh0ZW5zaW9uUGFjayhtYW5pZmVzdCwgZXh0ZW5zaW9uUGFja0NvbnRlbnQsIHRva2VuKSxcblx0XHRcdHRoaXMub3Blbk1hcmtkb3duKGV4dGVuc2lvbiwgdGhpcy5leHRlbnNpb25SZWFkbWUhLmdldCgpLCBsb2NhbGl6ZSgnbm9SZWFkbWUnLCBcIk5vIFJFQURNRSBhdmFpbGFibGUuXCIpLCByZWFkbWVDb250ZW50LCBXZWJ2aWV3SW5kZXguUmVhZG1lLCBsb2NhbGl6ZSgnUmVhZG1lIHRpdGxlJywgXCJSZWFkbWVcIiksIHRva2VuKSxcblx0XHRdKTtcblxuXHRcdHJldHVybiB7IGZvY3VzOiAoKSA9PiBleHRlbnNpb25QYWNrQ29udGVudC5mb2N1cygpIH07XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlckFkZGl0aW9uYWxEZXRhaWxzKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIGV4dGVuc2lvbjogSUV4dGVuc2lvbik6IHZvaWQge1xuXHRcdGNvbnN0IGNvbnRlbnQgPSAkKCdkaXYnLCB7IGNsYXNzOiAnYWRkaXRpb25hbC1kZXRhaWxzLWNvbnRlbnQnLCB0YWJpbmRleDogJzAnIH0pO1xuXHRcdGNvbnN0IHNjcm9sbGFibGVDb250ZW50ID0gbmV3IERvbVNjcm9sbGFibGVFbGVtZW50KGNvbnRlbnQsIHt9KTtcblx0XHRjb25zdCBsYXlvdXQgPSAoKSA9PiBzY3JvbGxhYmxlQ29udGVudC5zY2FuRG9tTm9kZSgpO1xuXHRcdGNvbnN0IHJlbW92ZUxheW91dFBhcnRpY2lwYW50ID0gYXJyYXlzLmluc2VydCh0aGlzLmxheW91dFBhcnRpY2lwYW50cywgeyBsYXlvdXQgfSk7XG5cdFx0dGhpcy5jb250ZW50RGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZShyZW1vdmVMYXlvdXRQYXJ0aWNpcGFudCkpO1xuXHRcdHRoaXMuY29udGVudERpc3Bvc2FibGVzLmFkZChzY3JvbGxhYmxlQ29udGVudCk7XG5cblx0XHR0aGlzLmNvbnRlbnREaXNwb3NhYmxlcy5hZGQodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBZGRpdGlvbmFsRGV0YWlsc1dpZGdldCwgY29udGVudCwgZXh0ZW5zaW9uKSk7XG5cblx0XHRhcHBlbmQoY29udGFpbmVyLCBzY3JvbGxhYmxlQ29udGVudC5nZXREb21Ob2RlKCkpO1xuXHRcdHNjcm9sbGFibGVDb250ZW50LnNjYW5Eb21Ob2RlKCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIG9wZW5DaGFuZ2Vsb2coZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uLCBjb250ZW50Q29udGFpbmVyOiBIVE1MRWxlbWVudCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJQWN0aXZlRWxlbWVudCB8IG51bGw+IHtcblx0XHRjb25zdCBhY3RpdmVFbGVtZW50ID0gYXdhaXQgdGhpcy5vcGVuTWFya2Rvd24oZXh0ZW5zaW9uLCB0aGlzLmV4dGVuc2lvbkNoYW5nZWxvZyEuZ2V0KCksIGxvY2FsaXplKCdub0NoYW5nZWxvZycsIFwiTm8gQ2hhbmdlbG9nIGF2YWlsYWJsZS5cIiksIGNvbnRlbnRDb250YWluZXIsIFdlYnZpZXdJbmRleC5DaGFuZ2Vsb2csIGxvY2FsaXplKCdDaGFuZ2Vsb2cgdGl0bGUnLCBcIkNoYW5nZWxvZ1wiKSwgdG9rZW4pO1xuXG5cdFx0cmV0dXJuIGFjdGl2ZUVsZW1lbnQ7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIG9wZW5GZWF0dXJlcyhleHRlbnNpb246IElFeHRlbnNpb24sIGNvbnRlbnRDb250YWluZXI6IEhUTUxFbGVtZW50LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElBY3RpdmVFbGVtZW50IHwgbnVsbD4ge1xuXHRcdGNvbnN0IG1hbmlmZXN0ID0gYXdhaXQgdGhpcy5sb2FkQ29udGVudHMoKCkgPT4gdGhpcy5leHRlbnNpb25NYW5pZmVzdCEuZ2V0KCksIGNvbnRlbnRDb250YWluZXIpO1xuXHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHRcdGlmICghbWFuaWZlc3QpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdGNvbnN0IGV4dGVuc2lvbkZlYXR1cmVzVGFiID0gdGhpcy5jb250ZW50RGlzcG9zYWJsZXMuYWRkKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRXh0ZW5zaW9uRmVhdHVyZXNUYWIsIG1hbmlmZXN0LCAoPElFeHRlbnNpb25FZGl0b3JPcHRpb25zIHwgdW5kZWZpbmVkPnRoaXMub3B0aW9ucyk/LmZlYXR1cmUpKTtcblx0XHRjb25zdCBmZWF0dXJlTGF5b3V0ID0gKCkgPT4gZXh0ZW5zaW9uRmVhdHVyZXNUYWIubGF5b3V0KGNvbnRlbnRDb250YWluZXIuY2xpZW50SGVpZ2h0LCBjb250ZW50Q29udGFpbmVyLmNsaWVudFdpZHRoKTtcblx0XHRjb25zdCByZW1vdmVMYXlvdXRQYXJ0aWNpcGFudCA9IGFycmF5cy5pbnNlcnQodGhpcy5sYXlvdXRQYXJ0aWNpcGFudHMsIHsgbGF5b3V0OiBmZWF0dXJlTGF5b3V0IH0pO1xuXHRcdHRoaXMuY29udGVudERpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUocmVtb3ZlTGF5b3V0UGFydGljaXBhbnQpKTtcblx0XHRhcHBlbmQoY29udGVudENvbnRhaW5lciwgZXh0ZW5zaW9uRmVhdHVyZXNUYWIuZG9tTm9kZSk7XG5cdFx0ZmVhdHVyZUxheW91dCgpO1xuXG5cdFx0cmV0dXJuIGV4dGVuc2lvbkZlYXR1cmVzVGFiLmRvbU5vZGU7XG5cdH1cblxuXHRwcml2YXRlIG9wZW5FeHRlbnNpb25EZXBlbmRlbmNpZXMoZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uLCBjb250ZW50Q29udGFpbmVyOiBIVE1MRWxlbWVudCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJQWN0aXZlRWxlbWVudCB8IG51bGw+IHtcblx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUobnVsbCk7XG5cdFx0fVxuXG5cdFx0aWYgKGFycmF5cy5pc0ZhbHN5T3JFbXB0eShleHRlbnNpb24uZGVwZW5kZW5jaWVzKSkge1xuXHRcdFx0YXBwZW5kKGNvbnRlbnRDb250YWluZXIsICQoJ3Aubm9jb250ZW50JykpLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ25vRGVwZW5kZW5jaWVzJywgXCJObyBEZXBlbmRlbmNpZXNcIik7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKGNvbnRlbnRDb250YWluZXIpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNvbnRlbnQgPSAkKCdkaXYnLCB7IGNsYXNzOiAnc3ViY29udGVudCcgfSk7XG5cdFx0Y29uc3Qgc2Nyb2xsYWJsZUNvbnRlbnQgPSBuZXcgRG9tU2Nyb2xsYWJsZUVsZW1lbnQoY29udGVudCwge30pO1xuXHRcdGFwcGVuZChjb250ZW50Q29udGFpbmVyLCBzY3JvbGxhYmxlQ29udGVudC5nZXREb21Ob2RlKCkpO1xuXHRcdHRoaXMuY29udGVudERpc3Bvc2FibGVzLmFkZChzY3JvbGxhYmxlQ29udGVudCk7XG5cblx0XHRjb25zdCBkZXBlbmRlbmNpZXNUcmVlID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShFeHRlbnNpb25zVHJlZSxcblx0XHRcdG5ldyBFeHRlbnNpb25EYXRhKGV4dGVuc2lvbiwgbnVsbCwgZXh0ZW5zaW9uID0+IGV4dGVuc2lvbi5kZXBlbmRlbmNpZXMgfHwgW10sIHRoaXMuZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UpLCBjb250ZW50LFxuXHRcdFx0e1xuXHRcdFx0XHRsaXN0QmFja2dyb3VuZDogZWRpdG9yQmFja2dyb3VuZFxuXHRcdFx0fSk7XG5cdFx0Y29uc3QgZGVwTGF5b3V0ID0gKCkgPT4ge1xuXHRcdFx0c2Nyb2xsYWJsZUNvbnRlbnQuc2NhbkRvbU5vZGUoKTtcblx0XHRcdGNvbnN0IHNjcm9sbERpbWVuc2lvbnMgPSBzY3JvbGxhYmxlQ29udGVudC5nZXRTY3JvbGxEaW1lbnNpb25zKCk7XG5cdFx0XHRkZXBlbmRlbmNpZXNUcmVlLmxheW91dChzY3JvbGxEaW1lbnNpb25zLmhlaWdodCk7XG5cdFx0fTtcblx0XHRjb25zdCByZW1vdmVMYXlvdXRQYXJ0aWNpcGFudCA9IGFycmF5cy5pbnNlcnQodGhpcy5sYXlvdXRQYXJ0aWNpcGFudHMsIHsgbGF5b3V0OiBkZXBMYXlvdXQgfSk7XG5cdFx0dGhpcy5jb250ZW50RGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZShyZW1vdmVMYXlvdXRQYXJ0aWNpcGFudCkpO1xuXG5cdFx0dGhpcy5jb250ZW50RGlzcG9zYWJsZXMuYWRkKGRlcGVuZGVuY2llc1RyZWUpO1xuXHRcdGRlcExheW91dCgpO1xuXG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh7IGZvY3VzKCkgeyBkZXBlbmRlbmNpZXNUcmVlLmRvbUZvY3VzKCk7IH0gfSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIG9wZW5FeHRlbnNpb25QYWNrKGV4dGVuc2lvbjogSUV4dGVuc2lvbiwgY29udGVudENvbnRhaW5lcjogSFRNTEVsZW1lbnQsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SUFjdGl2ZUVsZW1lbnQgfCBudWxsPiB7XG5cdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKG51bGwpO1xuXHRcdH1cblxuXHRcdGNvbnN0IG1hbmlmZXN0ID0gYXdhaXQgdGhpcy5sb2FkQ29udGVudHMoKCkgPT4gdGhpcy5leHRlbnNpb25NYW5pZmVzdCEuZ2V0KCksIGNvbnRlbnRDb250YWluZXIpO1xuXHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHRcdGlmICghbWFuaWZlc3QpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLnJlbmRlckV4dGVuc2lvblBhY2sobWFuaWZlc3QsIGNvbnRlbnRDb250YWluZXIsIHRva2VuKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcmVuZGVyRXh0ZW5zaW9uUGFjayhtYW5pZmVzdDogSUV4dGVuc2lvbk1hbmlmZXN0LCBwYXJlbnQ6IEhUTUxFbGVtZW50LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElBY3RpdmVFbGVtZW50IHwgbnVsbD4ge1xuXHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29udGVudCA9ICQoJ2RpdicsIHsgY2xhc3M6ICdzdWJjb250ZW50JyB9KTtcblx0XHRjb25zdCBzY3JvbGxhYmxlQ29udGVudCA9IG5ldyBEb21TY3JvbGxhYmxlRWxlbWVudChjb250ZW50LCB7IHVzZVNoYWRvd3M6IGZhbHNlIH0pO1xuXHRcdGFwcGVuZChwYXJlbnQsIHNjcm9sbGFibGVDb250ZW50LmdldERvbU5vZGUoKSk7XG5cblx0XHRjb25zdCBleHRlbnNpb25zR3JpZFZpZXcgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEV4dGVuc2lvbnNHcmlkVmlldywgY29udGVudCwgbmV3IERlbGVnYXRlKCkpO1xuXHRcdGNvbnN0IGV4dGVuc2lvbnM6IElFeHRlbnNpb25bXSA9IGF3YWl0IGdldEV4dGVuc2lvbnMobWFuaWZlc3QuZXh0ZW5zaW9uUGFjayEsIHRoaXMuZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UpO1xuXHRcdGV4dGVuc2lvbnNHcmlkVmlldy5zZXRFeHRlbnNpb25zKGV4dGVuc2lvbnMpO1xuXHRcdHNjcm9sbGFibGVDb250ZW50LnNjYW5Eb21Ob2RlKCk7XG5cblx0XHR0aGlzLmNvbnRlbnREaXNwb3NhYmxlcy5hZGQoc2Nyb2xsYWJsZUNvbnRlbnQpO1xuXHRcdHRoaXMuY29udGVudERpc3Bvc2FibGVzLmFkZChleHRlbnNpb25zR3JpZFZpZXcpO1xuXHRcdHRoaXMuY29udGVudERpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoYXJyYXlzLmluc2VydCh0aGlzLmxheW91dFBhcnRpY2lwYW50cywgeyBsYXlvdXQ6ICgpID0+IHNjcm9sbGFibGVDb250ZW50LnNjYW5Eb21Ob2RlKCkgfSkpKTtcblxuXHRcdHJldHVybiBjb250ZW50O1xuXHR9XG5cblx0cHJpdmF0ZSBsb2FkQ29udGVudHM8VD4obG9hZGluZ1Rhc2s6ICgpID0+IENhY2hlUmVzdWx0PFQ+LCBjb250YWluZXI6IEhUTUxFbGVtZW50KTogUHJvbWlzZTxUPiB7XG5cdFx0Y29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ2xvYWRpbmcnKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IHRoaXMuY29udGVudERpc3Bvc2FibGVzLmFkZChsb2FkaW5nVGFzaygpKTtcblx0XHRjb25zdCBvbkRvbmUgPSAoKSA9PiBjb250YWluZXIuY2xhc3NMaXN0LnJlbW92ZSgnbG9hZGluZycpO1xuXHRcdHJlc3VsdC5wcm9taXNlLnRoZW4ob25Eb25lLCBvbkRvbmUpO1xuXG5cdFx0cmV0dXJuIHJlc3VsdC5wcm9taXNlO1xuXHR9XG5cblx0bGF5b3V0KGRpbWVuc2lvbjogRGltZW5zaW9uKTogdm9pZCB7XG5cdFx0dGhpcy5kaW1lbnNpb24gPSBkaW1lbnNpb247XG5cdFx0dGhpcy5sYXlvdXRQYXJ0aWNpcGFudHMuZm9yRWFjaChwID0+IHAubGF5b3V0KCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkVycm9yKGVycjogYW55KTogdm9pZCB7XG5cdFx0aWYgKGlzQ2FuY2VsbGF0aW9uRXJyb3IoZXJyKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMubm90aWZpY2F0aW9uU2VydmljZS5lcnJvcihlcnIpO1xuXHR9XG59XG5cbmNsYXNzIEFkZGl0aW9uYWxEZXRhaWxzV2lkZ2V0IGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBkaXNwb3NhYmxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBjb250YWluZXI6IEhUTUxFbGVtZW50LFxuXHRcdGV4dGVuc2lvbjogSUV4dGVuc2lvbixcblx0XHRASUhvdmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0XHRASU9wZW5lclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBvcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZSxcblx0XHRASVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXNlckRhdGFQcm9maWxlc1NlcnZpY2U6IElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSxcblx0XHRASVJlbW90ZUFnZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHJlbW90ZUFnZW50U2VydmljZTogSVJlbW90ZUFnZW50U2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASVVyaUlkZW50aXR5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVyaUlkZW50aXR5U2VydmljZTogSVVyaUlkZW50aXR5U2VydmljZSxcblx0XHRASUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2U6IElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSxcblx0XHRASUV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25HYWxsZXJ5TWFuaWZlc3RTZXJ2aWNlOiBJRXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLnJlbmRlcihleHRlbnNpb24pO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2Uub25DaGFuZ2UoZSA9PiB7XG5cdFx0XHRpZiAoZSAmJiBhcmVTYW1lRXh0ZW5zaW9ucyhlLmlkZW50aWZpZXIsIGV4dGVuc2lvbi5pZGVudGlmaWVyKSAmJiBlLnNlcnZlciA9PT0gZXh0ZW5zaW9uLnNlcnZlcikge1xuXHRcdFx0XHR0aGlzLnJlbmRlcihlKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlcihleHRlbnNpb246IElFeHRlbnNpb24pOiB2b2lkIHtcblx0XHR0aGlzLmNvbnRhaW5lci5pbm5lclRleHQgPSAnJztcblx0XHR0aGlzLmRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cblx0XHRpZiAoZXh0ZW5zaW9uLmxvY2FsKSB7XG5cdFx0XHR0aGlzLnJlbmRlckluc3RhbGxJbmZvKHRoaXMuY29udGFpbmVyLCBleHRlbnNpb24ubG9jYWwpO1xuXHRcdH1cblx0XHRpZiAoZXh0ZW5zaW9uLmdhbGxlcnkpIHtcblx0XHRcdHRoaXMucmVuZGVyTWFya2V0cGxhY2VJbmZvKHRoaXMuY29udGFpbmVyLCBleHRlbnNpb24pO1xuXHRcdH1cblx0XHR0aGlzLnJlbmRlckNhdGVnb3JpZXModGhpcy5jb250YWluZXIsIGV4dGVuc2lvbik7XG5cdFx0dGhpcy5yZW5kZXJFeHRlbnNpb25SZXNvdXJjZXModGhpcy5jb250YWluZXIsIGV4dGVuc2lvbik7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlckNhdGVnb3JpZXMoY29udGFpbmVyOiBIVE1MRWxlbWVudCwgZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uKTogdm9pZCB7XG5cdFx0aWYgKGV4dGVuc2lvbi5jYXRlZ29yaWVzLmxlbmd0aCkge1xuXHRcdFx0Y29uc3QgY2F0ZWdvcmllc0NvbnRhaW5lciA9IGFwcGVuZChjb250YWluZXIsICQoJy5jYXRlZ29yaWVzLWNvbnRhaW5lci5hZGRpdGlvbmFsLWRldGFpbHMtZWxlbWVudCcpKTtcblx0XHRcdGFwcGVuZChjYXRlZ29yaWVzQ29udGFpbmVyLCAkKCcuYWRkaXRpb25hbC1kZXRhaWxzLXRpdGxlJywgdW5kZWZpbmVkLCBsb2NhbGl6ZSgnY2F0ZWdvcmllcycsIFwiQ2F0ZWdvcmllc1wiKSkpO1xuXHRcdFx0Y29uc3QgY2F0ZWdvcmllc0VsZW1lbnQgPSBhcHBlbmQoY2F0ZWdvcmllc0NvbnRhaW5lciwgJCgnLmNhdGVnb3JpZXMnKSk7XG5cdFx0XHR0aGlzLmV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdFNlcnZpY2UuZ2V0RXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0KClcblx0XHRcdFx0LnRoZW4obWFuaWZlc3QgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IGhhc0NhdGVnb3J5RmlsdGVyID0gbWFuaWZlc3Q/LmNhcGFiaWxpdGllcy5leHRlbnNpb25RdWVyeS5maWx0ZXJpbmc/LnNvbWUoKHsgbmFtZSB9KSA9PiBuYW1lID09PSBGaWx0ZXJUeXBlLkNhdGVnb3J5KTtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IGNhdGVnb3J5IG9mIGV4dGVuc2lvbi5jYXRlZ29yaWVzKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBjYXRlZ29yeUVsZW1lbnQgPSBhcHBlbmQoY2F0ZWdvcmllc0VsZW1lbnQsICQoJ3NwYW4uY2F0ZWdvcnknLCB7IHRhYmluZGV4OiAnMCcgfSwgY2F0ZWdvcnkpKTtcblx0XHRcdFx0XHRcdGlmIChoYXNDYXRlZ29yeUZpbHRlcikge1xuXHRcdFx0XHRcdFx0XHRjYXRlZ29yeUVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnY2xpY2thYmxlJyk7XG5cdFx0XHRcdFx0XHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKG9uQ2xpY2soY2F0ZWdvcnlFbGVtZW50LCAoKSA9PiB0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLm9wZW5TZWFyY2goYEBjYXRlZ29yeTpcIiR7Y2F0ZWdvcnl9XCJgKSkpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJFeHRlbnNpb25SZXNvdXJjZXMoY29udGFpbmVyOiBIVE1MRWxlbWVudCwgZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uKTogdm9pZCB7XG5cdFx0Y29uc3QgcmVzb3VyY2VzOiBbc3RyaW5nLCBUaGVtZUljb24sIFVSSV1bXSA9IFtdO1xuXHRcdGlmIChleHRlbnNpb24ucmVwb3NpdG9yeSkge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0cmVzb3VyY2VzLnB1c2goW2xvY2FsaXplKCdyZXBvc2l0b3J5JywgXCJSZXBvc2l0b3J5XCIpLCBUaGVtZUljb24uZnJvbUlkKENvZGljb24ucmVwby5pZCksIFVSSS5wYXJzZShleHRlbnNpb24ucmVwb3NpdG9yeSldKTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7LyogSWdub3JlICovIH1cblx0XHR9XG5cdFx0aWYgKGV4dGVuc2lvbi5zdXBwb3J0VXJsKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRyZXNvdXJjZXMucHVzaChbbG9jYWxpemUoJ2lzc3VlcycsIFwiSXNzdWVzXCIpLCBUaGVtZUljb24uZnJvbUlkKENvZGljb24uaXNzdWVzLmlkKSwgVVJJLnBhcnNlKGV4dGVuc2lvbi5zdXBwb3J0VXJsKV0pO1xuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHsvKiBJZ25vcmUgKi8gfVxuXHRcdH1cblx0XHRpZiAoZXh0ZW5zaW9uLmxpY2Vuc2VVcmwpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHJlc291cmNlcy5wdXNoKFtsb2NhbGl6ZSgnbGljZW5zZScsIFwiTGljZW5zZVwiKSwgVGhlbWVJY29uLmZyb21JZChDb2RpY29uLmxpbmtFeHRlcm5hbC5pZCksIFVSSS5wYXJzZShleHRlbnNpb24ubGljZW5zZVVybCldKTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7LyogSWdub3JlICovIH1cblx0XHR9XG5cdFx0aWYgKGV4dGVuc2lvbi5wdWJsaXNoZXJVcmwpIHtcblx0XHRcdHJlc291cmNlcy5wdXNoKFtleHRlbnNpb24ucHVibGlzaGVyRGlzcGxheU5hbWUsIFRoZW1lSWNvbi5mcm9tSWQoQ29kaWNvbi5saW5rRXh0ZXJuYWwuaWQpLCBleHRlbnNpb24ucHVibGlzaGVyVXJsXSk7XG5cdFx0fVxuXHRcdGlmIChleHRlbnNpb24udXJsKSB7XG5cdFx0XHRyZXNvdXJjZXMucHVzaChbbG9jYWxpemUoJ01hcmtldHBsYWNlJywgXCJNYXJrZXRwbGFjZVwiKSwgVGhlbWVJY29uLmZyb21JZChDb2RpY29uLmxpbmtFeHRlcm5hbC5pZCksIFVSSS5wYXJzZShleHRlbnNpb24udXJsKV0pO1xuXHRcdH1cblx0XHRpZiAocmVzb3VyY2VzLmxlbmd0aCB8fCBleHRlbnNpb24ucHVibGlzaGVyU3BvbnNvckxpbmspIHtcblx0XHRcdGNvbnN0IGV4dGVuc2lvblJlc291cmNlc0NvbnRhaW5lciA9IGFwcGVuZChjb250YWluZXIsICQoJy5yZXNvdXJjZXMtY29udGFpbmVyLmFkZGl0aW9uYWwtZGV0YWlscy1lbGVtZW50JykpO1xuXHRcdFx0YXBwZW5kKGV4dGVuc2lvblJlc291cmNlc0NvbnRhaW5lciwgJCgnLmFkZGl0aW9uYWwtZGV0YWlscy10aXRsZScsIHVuZGVmaW5lZCwgbG9jYWxpemUoJ3Jlc291cmNlcycsIFwiUmVzb3VyY2VzXCIpKSk7XG5cdFx0XHRjb25zdCByZXNvdXJjZXNFbGVtZW50ID0gYXBwZW5kKGV4dGVuc2lvblJlc291cmNlc0NvbnRhaW5lciwgJCgnLnJlc291cmNlcycpKTtcblx0XHRcdGZvciAoY29uc3QgW2xhYmVsLCBpY29uLCB1cmldIG9mIHJlc291cmNlcykge1xuXHRcdFx0XHRjb25zdCByZXNvdXJjZUVsZW1lbnQgPSBhcHBlbmQocmVzb3VyY2VzRWxlbWVudCwgJCgnLnJlc291cmNlJykpO1xuXHRcdFx0XHRhcHBlbmQocmVzb3VyY2VFbGVtZW50LCAkKFRoZW1lSWNvbi5hc0NTU1NlbGVjdG9yKGljb24pKSk7XG5cdFx0XHRcdGFwcGVuZChyZXNvdXJjZUVsZW1lbnQsICQoJ2EnLCB7IHRhYmluZGV4OiAnMCcgfSwgbGFiZWwpKTtcblx0XHRcdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQob25DbGljayhyZXNvdXJjZUVsZW1lbnQsICgpID0+IHRoaXMub3BlbmVyU2VydmljZS5vcGVuKHVyaSkpKTtcblx0XHRcdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQodGhpcy5ob3ZlclNlcnZpY2Uuc2V0dXBNYW5hZ2VkSG92ZXIoZ2V0RGVmYXVsdEhvdmVyRGVsZWdhdGUoJ21vdXNlJyksIHJlc291cmNlRWxlbWVudCwgdXJpLnRvU3RyaW5nKCkpKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlckluc3RhbGxJbmZvKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIGV4dGVuc2lvbjogSUxvY2FsRXh0ZW5zaW9uKTogdm9pZCB7XG5cdFx0Y29uc3QgaW5zdGFsbEluZm9Db250YWluZXIgPSBhcHBlbmQoY29udGFpbmVyLCAkKCcubW9yZS1pbmZvLWNvbnRhaW5lci5hZGRpdGlvbmFsLWRldGFpbHMtZWxlbWVudCcpKTtcblx0XHRhcHBlbmQoaW5zdGFsbEluZm9Db250YWluZXIsICQoJy5hZGRpdGlvbmFsLWRldGFpbHMtdGl0bGUnLCB1bmRlZmluZWQsIGxvY2FsaXplKCdJbnN0YWxsIEluZm8nLCBcIkluc3RhbGxhdGlvblwiKSkpO1xuXHRcdGNvbnN0IGluc3RhbGxJbmZvID0gYXBwZW5kKGluc3RhbGxJbmZvQ29udGFpbmVyLCAkKCcubW9yZS1pbmZvJykpO1xuXHRcdGFwcGVuZChpbnN0YWxsSW5mbyxcblx0XHRcdCQoJy5tb3JlLWluZm8tZW50cnknLCB1bmRlZmluZWQsXG5cdFx0XHRcdCQoJ2Rpdi5tb3JlLWluZm8tZW50cnktbmFtZScsIHVuZGVmaW5lZCwgbG9jYWxpemUoJ2lkJywgXCJJZGVudGlmaWVyXCIpKSxcblx0XHRcdFx0JCgnY29kZScsIHVuZGVmaW5lZCwgZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQpXG5cdFx0XHQpKTtcblx0XHRpZiAoZXh0ZW5zaW9uLnR5cGUgIT09IEV4dGVuc2lvblR5cGUuU3lzdGVtKSB7XG5cdFx0XHRhcHBlbmQoaW5zdGFsbEluZm8sXG5cdFx0XHRcdCQoJy5tb3JlLWluZm8tZW50cnknLCB1bmRlZmluZWQsXG5cdFx0XHRcdFx0JCgnZGl2Lm1vcmUtaW5mby1lbnRyeS1uYW1lJywgdW5kZWZpbmVkLCBsb2NhbGl6ZSgnVmVyc2lvbicsIFwiVmVyc2lvblwiKSksXG5cdFx0XHRcdFx0JCgnY29kZScsIHVuZGVmaW5lZCwgZXh0ZW5zaW9uLm1hbmlmZXN0LnZlcnNpb24pXG5cdFx0XHRcdClcblx0XHRcdCk7XG5cdFx0fVxuXHRcdGlmIChleHRlbnNpb24uaW5zdGFsbGVkVGltZXN0YW1wKSB7XG5cdFx0XHRhcHBlbmQoaW5zdGFsbEluZm8sXG5cdFx0XHRcdCQoJy5tb3JlLWluZm8tZW50cnknLCB1bmRlZmluZWQsXG5cdFx0XHRcdFx0JCgnZGl2Lm1vcmUtaW5mby1lbnRyeS1uYW1lJywgdW5kZWZpbmVkLCBsb2NhbGl6ZSgnbGFzdCB1cGRhdGVkJywgXCJMYXN0IFVwZGF0ZWRcIikpLFxuXHRcdFx0XHRcdCQoJ2RpdicsIHtcblx0XHRcdFx0XHRcdCd0aXRsZSc6IG5ldyBEYXRlKGV4dGVuc2lvbi5pbnN0YWxsZWRUaW1lc3RhbXApLnRvU3RyaW5nKClcblx0XHRcdFx0XHR9LCBmcm9tTm93KGV4dGVuc2lvbi5pbnN0YWxsZWRUaW1lc3RhbXAsIHRydWUsIHRydWUsIHRydWUpKVxuXHRcdFx0XHQpXG5cdFx0XHQpO1xuXHRcdH1cblx0XHRpZiAoIWV4dGVuc2lvbi5pc0J1aWx0aW4gJiYgZXh0ZW5zaW9uLnNvdXJjZSAhPT0gJ2dhbGxlcnknKSB7XG5cdFx0XHRjb25zdCBlbGVtZW50ID0gJCgnZGl2JywgdW5kZWZpbmVkLCBleHRlbnNpb24uc291cmNlID09PSAndnNpeCcgPyBsb2NhbGl6ZSgndnNpeCcsIFwiVlNJWFwiKSA6IGxvY2FsaXplKCdvdGhlcicsIFwiTG9jYWxcIikpO1xuXHRcdFx0YXBwZW5kKGluc3RhbGxJbmZvLFxuXHRcdFx0XHQkKCcubW9yZS1pbmZvLWVudHJ5JywgdW5kZWZpbmVkLFxuXHRcdFx0XHRcdCQoJ2Rpdi5tb3JlLWluZm8tZW50cnktbmFtZScsIHVuZGVmaW5lZCwgbG9jYWxpemUoJ3NvdXJjZScsIFwiU291cmNlXCIpKSxcblx0XHRcdFx0XHRlbGVtZW50XG5cdFx0XHRcdClcblx0XHRcdCk7XG5cdFx0XHRpZiAoaXNOYXRpdmUgJiYgZXh0ZW5zaW9uLnNvdXJjZSA9PT0gJ3Jlc291cmNlJyAmJiBleHRlbnNpb24ubG9jYXRpb24uc2NoZW1lID09PSBTY2hlbWFzLmZpbGUpIHtcblx0XHRcdFx0ZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdsaW5rJyk7XG5cdFx0XHRcdGVsZW1lbnQudGFiSW5kZXggPSAwO1xuXHRcdFx0XHRlbGVtZW50LnNldEF0dHJpYnV0ZSgncm9sZScsICdsaW5rJyk7XG5cdFx0XHRcdGVsZW1lbnQudGl0bGUgPSBleHRlbnNpb24ubG9jYXRpb24uZnNQYXRoO1xuXHRcdFx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZChvbkNsaWNrKGVsZW1lbnQsICgpID0+IHRoaXMub3BlbmVyU2VydmljZS5vcGVuKGV4dGVuc2lvbi5sb2NhdGlvbiwgeyBvcGVuRXh0ZXJuYWw6IHRydWUgfSkpKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKGV4dGVuc2lvbi5zaXplKSB7XG5cdFx0XHRjb25zdCBlbGVtZW50ID0gJCgnZGl2JywgdW5kZWZpbmVkLCBCeXRlU2l6ZS5mb3JtYXRTaXplKGV4dGVuc2lvbi5zaXplKSk7XG5cdFx0XHRhcHBlbmQoaW5zdGFsbEluZm8sXG5cdFx0XHRcdCQoJy5tb3JlLWluZm8tZW50cnknLCB1bmRlZmluZWQsXG5cdFx0XHRcdFx0JCgnZGl2Lm1vcmUtaW5mby1lbnRyeS1uYW1lJywgeyB0aXRsZTogbG9jYWxpemUoJ3NpemUgd2hlbiBpbnN0YWxsZWQnLCBcIlNpemUgd2hlbiBpbnN0YWxsZWRcIikgfSwgbG9jYWxpemUoJ3NpemUnLCBcIlNpemVcIikpLFxuXHRcdFx0XHRcdGVsZW1lbnRcblx0XHRcdFx0KVxuXHRcdFx0KTtcblx0XHRcdGlmIChpc05hdGl2ZSAmJiBleHRlbnNpb24ubG9jYXRpb24uc2NoZW1lID09PSBTY2hlbWFzLmZpbGUpIHtcblx0XHRcdFx0ZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdsaW5rJyk7XG5cdFx0XHRcdGVsZW1lbnQudGFiSW5kZXggPSAwO1xuXHRcdFx0XHRlbGVtZW50LnNldEF0dHJpYnV0ZSgncm9sZScsICdsaW5rJyk7XG5cdFx0XHRcdGVsZW1lbnQudGl0bGUgPSBleHRlbnNpb24ubG9jYXRpb24uZnNQYXRoO1xuXHRcdFx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZChvbkNsaWNrKGVsZW1lbnQsICgpID0+IHRoaXMub3BlbmVyU2VydmljZS5vcGVuKGV4dGVuc2lvbi5sb2NhdGlvbiwgeyBvcGVuRXh0ZXJuYWw6IHRydWUgfSkpKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5nZXRDYWNoZUxvY2F0aW9uKGV4dGVuc2lvbikudGhlbihjYWNoZUxvY2F0aW9uID0+IHtcblx0XHRcdGlmICghY2FjaGVMb2NhdGlvbikge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb21wdXRlU2l6ZShjYWNoZUxvY2F0aW9uLCB0aGlzLmZpbGVTZXJ2aWNlKS50aGVuKGNhY2hlU2l6ZSA9PiB7XG5cdFx0XHRcdGlmICghY2FjaGVTaXplKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGVsZW1lbnQgPSAkKCdkaXYnLCB1bmRlZmluZWQsIEJ5dGVTaXplLmZvcm1hdFNpemUoY2FjaGVTaXplKSk7XG5cdFx0XHRcdGFwcGVuZChpbnN0YWxsSW5mbyxcblx0XHRcdFx0XHQkKCcubW9yZS1pbmZvLWVudHJ5JywgdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0JCgnZGl2Lm1vcmUtaW5mby1lbnRyeS1uYW1lJywgeyB0aXRsZTogbG9jYWxpemUoJ2Rpc2sgc3BhY2UgdXNlZCcsIFwiQ2FjaGUgc2l6ZVwiKSB9LCBsb2NhbGl6ZSgnY2FjaGUgc2l6ZScsIFwiQ2FjaGVcIikpLFxuXHRcdFx0XHRcdFx0ZWxlbWVudClcblx0XHRcdFx0KTtcblx0XHRcdFx0aWYgKGlzTmF0aXZlICYmIGV4dGVuc2lvbi5sb2NhdGlvbi5zY2hlbWUgPT09IFNjaGVtYXMuZmlsZSkge1xuXHRcdFx0XHRcdGVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnbGluaycpO1xuXHRcdFx0XHRcdGVsZW1lbnQudGFiSW5kZXggPSAwO1xuXHRcdFx0XHRcdGVsZW1lbnQuc2V0QXR0cmlidXRlKCdyb2xlJywgJ2xpbmsnKTtcblx0XHRcdFx0XHRlbGVtZW50LnRpdGxlID0gY2FjaGVMb2NhdGlvbi5mc1BhdGg7XG5cdFx0XHRcdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQob25DbGljayhlbGVtZW50LCAoKSA9PiB0aGlzLm9wZW5lclNlcnZpY2Uub3BlbihjYWNoZUxvY2F0aW9uLndpdGgoeyBzY2hlbWU6IFNjaGVtYXMuZmlsZSB9KSwgeyBvcGVuRXh0ZXJuYWw6IHRydWUgfSkpKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGdldENhY2hlTG9jYXRpb24oZXh0ZW5zaW9uOiBJTG9jYWxFeHRlbnNpb24pOiBQcm9taXNlPFVSSSB8IHVuZGVmaW5lZD4ge1xuXHRcdGxldCBleHRlbnNpb25DYWNoZUxvY2F0aW9uID0gdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmpvaW5QYXRoKHRoaXMudXNlckRhdGFQcm9maWxlc1NlcnZpY2UuZGVmYXVsdFByb2ZpbGUuZ2xvYmFsU3RvcmFnZUhvbWUsIGV4dGVuc2lvbi5pZGVudGlmaWVyLmlkLnRvTG93ZXJDYXNlKCkpO1xuXHRcdGlmIChleHRlbnNpb24ubG9jYXRpb24uc2NoZW1lID09PSBTY2hlbWFzLnZzY29kZVJlbW90ZSkge1xuXHRcdFx0Y29uc3QgZW52aXJvbm1lbnQgPSBhd2FpdCB0aGlzLnJlbW90ZUFnZW50U2VydmljZS5nZXRFbnZpcm9ubWVudCgpO1xuXHRcdFx0aWYgKCFlbnZpcm9ubWVudCkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0ZXh0ZW5zaW9uQ2FjaGVMb2NhdGlvbiA9IHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5qb2luUGF0aChlbnZpcm9ubWVudC5nbG9iYWxTdG9yYWdlSG9tZSwgZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQudG9Mb3dlckNhc2UoKSk7XG5cdFx0fVxuXHRcdHJldHVybiBleHRlbnNpb25DYWNoZUxvY2F0aW9uO1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJNYXJrZXRwbGFjZUluZm8oY29udGFpbmVyOiBIVE1MRWxlbWVudCwgZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uKTogdm9pZCB7XG5cdFx0Y29uc3QgZ2FsbGVyeSA9IGV4dGVuc2lvbi5nYWxsZXJ5O1xuXHRcdGNvbnN0IG1vcmVJbmZvQ29udGFpbmVyID0gYXBwZW5kKGNvbnRhaW5lciwgJCgnLm1vcmUtaW5mby1jb250YWluZXIuYWRkaXRpb25hbC1kZXRhaWxzLWVsZW1lbnQnKSk7XG5cdFx0YXBwZW5kKG1vcmVJbmZvQ29udGFpbmVyLCAkKCcuYWRkaXRpb25hbC1kZXRhaWxzLXRpdGxlJywgdW5kZWZpbmVkLCBsb2NhbGl6ZSgnTWFya2V0cGxhY2UgSW5mbycsIFwiTWFya2V0cGxhY2VcIikpKTtcblx0XHRjb25zdCBtb3JlSW5mbyA9IGFwcGVuZChtb3JlSW5mb0NvbnRhaW5lciwgJCgnLm1vcmUtaW5mbycpKTtcblx0XHRpZiAoZ2FsbGVyeSkge1xuXHRcdFx0aWYgKCFleHRlbnNpb24ubG9jYWwpIHtcblx0XHRcdFx0YXBwZW5kKG1vcmVJbmZvLFxuXHRcdFx0XHRcdCQoJy5tb3JlLWluZm8tZW50cnknLCB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHQkKCdkaXYubW9yZS1pbmZvLWVudHJ5LW5hbWUnLCB1bmRlZmluZWQsIGxvY2FsaXplKCdpZCcsIFwiSWRlbnRpZmllclwiKSksXG5cdFx0XHRcdFx0XHQkKCdjb2RlJywgdW5kZWZpbmVkLCBleHRlbnNpb24uaWRlbnRpZmllci5pZClcblx0XHRcdFx0XHQpKTtcblx0XHRcdFx0YXBwZW5kKG1vcmVJbmZvLFxuXHRcdFx0XHRcdCQoJy5tb3JlLWluZm8tZW50cnknLCB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHQkKCdkaXYubW9yZS1pbmZvLWVudHJ5LW5hbWUnLCB1bmRlZmluZWQsIGxvY2FsaXplKCdWZXJzaW9uJywgXCJWZXJzaW9uXCIpKSxcblx0XHRcdFx0XHRcdCQoJ2NvZGUnLCB1bmRlZmluZWQsIGdhbGxlcnkudmVyc2lvbilcblx0XHRcdFx0XHQpXG5cdFx0XHRcdCk7XG5cdFx0XHR9XG5cdFx0XHRhcHBlbmQobW9yZUluZm8sXG5cdFx0XHRcdCQoJy5tb3JlLWluZm8tZW50cnknLCB1bmRlZmluZWQsXG5cdFx0XHRcdFx0JCgnZGl2Lm1vcmUtaW5mby1lbnRyeS1uYW1lJywgdW5kZWZpbmVkLCBsb2NhbGl6ZSgncHVibGlzaGVkJywgXCJQdWJsaXNoZWRcIikpLFxuXHRcdFx0XHRcdCQoJ2RpdicsIHtcblx0XHRcdFx0XHRcdCd0aXRsZSc6IG5ldyBEYXRlKGdhbGxlcnkucmVsZWFzZURhdGUpLnRvU3RyaW5nKClcblx0XHRcdFx0XHR9LCBmcm9tTm93KGdhbGxlcnkucmVsZWFzZURhdGUsIHRydWUsIHRydWUsIHRydWUpKVxuXHRcdFx0XHQpLFxuXHRcdFx0XHQkKCcubW9yZS1pbmZvLWVudHJ5JywgdW5kZWZpbmVkLFxuXHRcdFx0XHRcdCQoJ2Rpdi5tb3JlLWluZm8tZW50cnktbmFtZScsIHVuZGVmaW5lZCwgbG9jYWxpemUoJ2xhc3QgcmVsZWFzZWQnLCBcIkxhc3QgUmVsZWFzZWRcIikpLFxuXHRcdFx0XHRcdCQoJ2RpdicsIHtcblx0XHRcdFx0XHRcdCd0aXRsZSc6IG5ldyBEYXRlKGdhbGxlcnkubGFzdFVwZGF0ZWQpLnRvU3RyaW5nKClcblx0XHRcdFx0XHR9LCBmcm9tTm93KGdhbGxlcnkubGFzdFVwZGF0ZWQsIHRydWUsIHRydWUsIHRydWUpKVxuXHRcdFx0XHQpXG5cdFx0XHQpO1xuXHRcdH1cblx0fVxufVxuXG5jb25zdCBjb250ZXh0S2V5RXhwciA9IENvbnRleHRLZXlFeHByLmFuZChDb250ZXh0S2V5RXhwci5lcXVhbHMoJ2FjdGl2ZUVkaXRvcicsIEV4dGVuc2lvbkVkaXRvci5JRCksIEVkaXRvckNvbnRleHRLZXlzLmZvY3VzLnRvTmVnYXRlZCgpKTtcbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBTaG93RXh0ZW5zaW9uRWRpdG9yRmluZEFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ2VkaXRvci5hY3Rpb24uZXh0ZW5zaW9uZWRpdG9yLnNob3dmaW5kJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnZmluZCcsIFwiRmluZFwiKSxcblx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0d2hlbjogY29udGV4dEtleUV4cHIsXG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5FZGl0b3JDb250cmliLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5Rixcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiB2b2lkIHtcblx0XHRjb25zdCBleHRlbnNpb25FZGl0b3IgPSBnZXRFeHRlbnNpb25FZGl0b3IoYWNjZXNzb3IpO1xuXHRcdGV4dGVuc2lvbkVkaXRvcj8uc2hvd0ZpbmQoKTtcblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBTdGFydEV4dGVuc2lvbkVkaXRvckZpbmROZXh0QWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnZWRpdG9yLmFjdGlvbi5leHRlbnNpb25lZGl0b3IuZmluZE5leHQnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdmaW5kIG5leHQnLCBcIkZpbmQgTmV4dFwiKSxcblx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdGNvbnRleHRLZXlFeHByLFxuXHRcdFx0XHRcdEtFWUJJTkRJTkdfQ09OVEVYVF9XRUJWSUVXX0ZJTkRfV0lER0VUX0ZPQ1VTRUQpLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlDb2RlLkVudGVyLFxuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuRWRpdG9yQ29udHJpYlxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IHZvaWQge1xuXHRcdGNvbnN0IGV4dGVuc2lvbkVkaXRvciA9IGdldEV4dGVuc2lvbkVkaXRvcihhY2Nlc3Nvcik7XG5cdFx0ZXh0ZW5zaW9uRWRpdG9yPy5ydW5GaW5kQWN0aW9uKGZhbHNlKTtcblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBTdGFydEV4dGVuc2lvbkVkaXRvckZpbmRQcmV2aW91c0FjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ2VkaXRvci5hY3Rpb24uZXh0ZW5zaW9uZWRpdG9yLmZpbmRQcmV2aW91cycsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ2ZpbmQgcHJldmlvdXMnLCBcIkZpbmQgUHJldmlvdXNcIiksXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0XHRjb250ZXh0S2V5RXhwcixcblx0XHRcdFx0XHRLRVlCSU5ESU5HX0NPTlRFWFRfV0VCVklFV19GSU5EX1dJREdFVF9GT0NVU0VEKSxcblx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5FbnRlcixcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWJcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiB2b2lkIHtcblx0XHRjb25zdCBleHRlbnNpb25FZGl0b3IgPSBnZXRFeHRlbnNpb25FZGl0b3IoYWNjZXNzb3IpO1xuXHRcdGV4dGVuc2lvbkVkaXRvcj8ucnVuRmluZEFjdGlvbih0cnVlKTtcblx0fVxufSk7XG5cbnJlZ2lzdGVyVGhlbWluZ1BhcnRpY2lwYW50KCh0aGVtZTogSUNvbG9yVGhlbWUsIGNvbGxlY3RvcjogSUNzc1N0eWxlQ29sbGVjdG9yKSA9PiB7XG5cblx0Y29uc3QgbGluayA9IHRoZW1lLmdldENvbG9yKHRleHRMaW5rRm9yZWdyb3VuZCk7XG5cdGlmIChsaW5rKSB7XG5cdFx0Y29sbGVjdG9yLmFkZFJ1bGUoYC5tb25hY28td29ya2JlbmNoIC5leHRlbnNpb24tZWRpdG9yIC5jb250ZW50IC5kZXRhaWxzIC5hZGRpdGlvbmFsLWRldGFpbHMtY29udGFpbmVyIC5yZXNvdXJjZXMtY29udGFpbmVyIGEucmVzb3VyY2UgeyBjb2xvcjogJHtsaW5rfTsgfWApO1xuXHRcdGNvbGxlY3Rvci5hZGRSdWxlKGAubW9uYWNvLXdvcmtiZW5jaCAuZXh0ZW5zaW9uLWVkaXRvciAuY29udGVudCAuZmVhdHVyZS1jb250cmlidXRpb25zIGEgeyBjb2xvcjogJHtsaW5rfTsgfWApO1xuXHR9XG5cblx0Y29uc3QgYWN0aXZlTGluayA9IHRoZW1lLmdldENvbG9yKHRleHRMaW5rQWN0aXZlRm9yZWdyb3VuZCk7XG5cdGlmIChhY3RpdmVMaW5rKSB7XG5cdFx0Y29sbGVjdG9yLmFkZFJ1bGUoYC5tb25hY28td29ya2JlbmNoIC5leHRlbnNpb24tZWRpdG9yIC5jb250ZW50IC5kZXRhaWxzIC5hZGRpdGlvbmFsLWRldGFpbHMtY29udGFpbmVyIC5yZXNvdXJjZXMtY29udGFpbmVyIGEucmVzb3VyY2U6aG92ZXIsXG5cdFx0XHQubW9uYWNvLXdvcmtiZW5jaCAuZXh0ZW5zaW9uLWVkaXRvciAuY29udGVudCAuZGV0YWlscyAuYWRkaXRpb25hbC1kZXRhaWxzLWNvbnRhaW5lciAucmVzb3VyY2VzLWNvbnRhaW5lciBhLnJlc291cmNlOmFjdGl2ZSB7IGNvbG9yOiAke2FjdGl2ZUxpbmt9OyB9YCk7XG5cdFx0Y29sbGVjdG9yLmFkZFJ1bGUoYC5tb25hY28td29ya2JlbmNoIC5leHRlbnNpb24tZWRpdG9yIC5jb250ZW50IC5mZWF0dXJlLWNvbnRyaWJ1dGlvbnMgYTpob3Zlcixcblx0XHRcdC5tb25hY28td29ya2JlbmNoIC5leHRlbnNpb24tZWRpdG9yIC5jb250ZW50IC5mZWF0dXJlLWNvbnRyaWJ1dGlvbnMgYTphY3RpdmUgeyBjb2xvcjogJHthY3RpdmVMaW5rfTsgfWApO1xuXHR9XG5cblx0Y29uc3QgYnV0dG9uSG92ZXJCYWNrZ3JvdW5kQ29sb3IgPSB0aGVtZS5nZXRDb2xvcihidXR0b25Ib3ZlckJhY2tncm91bmQpO1xuXHRpZiAoYnV0dG9uSG92ZXJCYWNrZ3JvdW5kQ29sb3IpIHtcblx0XHRjb2xsZWN0b3IuYWRkUnVsZShgLm1vbmFjby13b3JrYmVuY2ggLmV4dGVuc2lvbi1lZGl0b3IgLmNvbnRlbnQgPiAuZGV0YWlscyA+IC5hZGRpdGlvbmFsLWRldGFpbHMtY29udGFpbmVyIC5jYXRlZ29yaWVzLWNvbnRhaW5lciA+IC5jYXRlZ29yaWVzID4gLmNhdGVnb3J5LmNsaWNrYWJsZTpob3ZlciB7IGJhY2tncm91bmQtY29sb3I6ICR7YnV0dG9uSG92ZXJCYWNrZ3JvdW5kQ29sb3J9OyBib3JkZXItY29sb3I6ICR7YnV0dG9uSG92ZXJCYWNrZ3JvdW5kQ29sb3J9OyB9YCk7XG5cdH1cblxuXHRjb25zdCBidXR0b25Gb3JlZ3JvdW5kQ29sb3IgPSB0aGVtZS5nZXRDb2xvcihidXR0b25Gb3JlZ3JvdW5kKTtcblx0aWYgKGJ1dHRvbkZvcmVncm91bmRDb2xvcikge1xuXHRcdGNvbGxlY3Rvci5hZGRSdWxlKGAubW9uYWNvLXdvcmtiZW5jaCAuZXh0ZW5zaW9uLWVkaXRvciAuY29udGVudCA+IC5kZXRhaWxzID4gLmFkZGl0aW9uYWwtZGV0YWlscy1jb250YWluZXIgLmNhdGVnb3JpZXMtY29udGFpbmVyID4gLmNhdGVnb3JpZXMgPiAuY2F0ZWdvcnkuY2xpY2thYmxlOmhvdmVyIHsgY29sb3I6ICR7YnV0dG9uRm9yZWdyb3VuZENvbG9yfTsgfWApO1xuXHR9XG5cbn0pO1xuXG5mdW5jdGlvbiBnZXRFeHRlbnNpb25FZGl0b3IoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBFeHRlbnNpb25FZGl0b3IgfCBudWxsIHtcblx0Y29uc3QgYWN0aXZlRWRpdG9yUGFuZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSkuYWN0aXZlRWRpdG9yUGFuZTtcblx0aWYgKGFjdGl2ZUVkaXRvclBhbmUgaW5zdGFuY2VvZiBFeHRlbnNpb25FZGl0b3IpIHtcblx0XHRyZXR1cm4gYWN0aXZlRWRpdG9yUGFuZTtcblx0fVxuXHRyZXR1cm4gbnVsbDtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxHQUFjLFFBQVEsTUFBTSxpQkFBaUIsWUFBWTtBQUNsRSxTQUFTLGlCQUFpQjtBQUMxQixTQUFTLCtCQUErQjtBQUN4QyxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLGNBQXVCO0FBQ2hDLFlBQVksWUFBWTtBQUN4QixTQUFTLGFBQTBCO0FBQ25DLFNBQVMsbUJBQW1CLCtCQUErQjtBQUMzRCxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLFNBQVMsYUFBYTtBQUMvQixTQUFTLFNBQVMsY0FBYztBQUNoQyxTQUFTLFlBQVksaUJBQWlCLG1CQUFtQixTQUFTLG9CQUFvQjtBQUN0RixTQUFTLFNBQVMscUJBQXFCO0FBQ3ZDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsV0FBVztBQUNwQixTQUFTLG9CQUFvQjtBQUM3QixPQUFPO0FBQ1AsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxvQ0FBb0M7QUFDN0MsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxTQUFTLHVCQUF1QjtBQUN6QyxTQUFTLGdCQUE2QixvQkFBOEMscUJBQXFCO0FBQ3pHLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsYUFBYSxZQUFZ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Q0QsQ0FBQztBQUVELDJCQUEyQixDQUFDLE9BQW9CLGNBQWtDO0FBRWpGLFFBQU0sT0FBTyxNQUFNLFNBQVMsa0JBQWtCO0FBQzlDLE1BQUksTUFBTTtBQUNULGNBQVUsUUFBUSxnSUFBZ0ksSUFBSSxLQUFLO0FBQzNKLGNBQVUsUUFBUSxrRkFBa0YsSUFBSSxLQUFLO0FBQUEsRUFDOUc7QUFFQSxRQUFNLGFBQWEsTUFBTSxTQUFTLHdCQUF3QjtBQUMxRCxNQUFJLFlBQVk7QUFDZixjQUFVLFFBQVE7QUFBQSx5SUFDcUgsVUFBVSxLQUFLO0FBQ3RKLGNBQVUsUUFBUTtBQUFBLDJGQUN1RSxVQUFVLEtBQUs7QUFBQSxFQUN6RztBQUVBLFFBQU0sNkJBQTZCLE1BQU0sU0FBUyxxQkFBcUI7QUFDdkUsTUFBSSw0QkFBNEI7QUFDL0IsY0FBVSxRQUFRLCtLQUErSywwQkFBMEIsbUJBQW1CLDBCQUEwQixLQUFLO0FBQUEsRUFDOVE7QUFFQSxRQUFNLHdCQUF3QixNQUFNLFNBQVMsZ0JBQWdCO0FBQzdELE1BQUksdUJBQXVCO0FBQzFCLGNBQVUsUUFBUSxvS0FBb0sscUJBQXFCLEtBQUs7QUFBQSxFQUNqTjtBQUVELENBQUM7QUFFRCxTQUFTLG1CQUFtQixVQUFvRDtBQUMvRSxRQUFNLG1CQUFtQixTQUFTLElBQUksY0FBYyxFQUFFO0FBQ3RELE1BQUksNEJBQTRCLGlCQUFpQjtBQUNoRCxXQUFPO0FBQUEsRUFDUjtBQUNBLFNBQU87QUFDUjsiLAogICJuYW1lcyI6IFsiYWN0aW9uIiwgIldlYnZpZXdJbmRleCIsICIkIiwgImJvZHkiLCAiZXh0ZW5zaW9uIl0KfQo=
