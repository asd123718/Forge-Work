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
import "./media/extensionsViewlet.css";
import { localize, localize2 } from "../../../../nls.js";
import { timeout, Delayer } from "../../../../base/common/async.js";
import { isCancellationError } from "../../../../base/common/errors.js";
import { createErrorWithActions } from "../../../../base/common/errorMessage.js";
import { Disposable, DisposableStore, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { Event } from "../../../../base/common/event.js";
import { Action } from "../../../../base/common/actions.js";
import { append, $, Dimension, hide, show, DragAndDropObserver, trackFocus, addDisposableListener, EventType, clearNode } from "../../../../base/browser/dom.js";
import { renderMarkdown, renderAsPlaintext } from "../../../../base/browser/markdownRenderer.js";
import { isMarkdownString } from "../../../../base/common/htmlContent.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IExtensionService } from "../../../services/extensions/common/extensions.js";
import { IExtensionsWorkbenchService, VIEWLET_ID, CloseExtensionDetailsOnViewChangeKey, INSTALL_EXTENSION_FROM_VSIX_COMMAND_ID, WORKSPACE_RECOMMENDATIONS_VIEW_ID, AutoCheckUpdatesConfigurationKey, OUTDATED_EXTENSIONS_VIEW_ID, CONTEXT_HAS_GALLERY, extensionsSearchActionsMenu, AutoRestartConfigurationKey, ExtensionRuntimeActionType, SearchMcpServersContext, SearchAgentPluginsContext, DefaultViewsContext, CONTEXT_EXTENSIONS_GALLERY_STATUS } from "../common/extensions.js";
import { InstallLocalExtensionsInRemoteAction, InstallRemoteExtensionsInLocalAction } from "./extensionsActions.js";
import { IExtensionManagementService } from "../../../../platform/extensionManagement/common/extensionManagement.js";
import { IWorkbenchExtensionEnablementService, IExtensionManagementServerService } from "../../../services/extensionManagement/common/extensionManagement.js";
import { ExtensionsInput } from "../common/extensionsInput.js";
import { ExtensionsListView, EnabledExtensionsView, DisabledExtensionsView, RecommendedExtensionsView, WorkspaceRecommendedExtensionsView, ServerInstalledExtensionsView, DefaultRecommendedExtensionsView, UntrustedWorkspaceUnsupportedExtensionsView, UntrustedWorkspacePartiallySupportedExtensionsView, VirtualWorkspaceUnsupportedExtensionsView, VirtualWorkspacePartiallySupportedExtensionsView, DefaultPopularExtensionsView, DeprecatedExtensionsView, SearchMarketplaceExtensionsView, RecentlyUpdatedExtensionsView, OutdatedExtensionsView, StaticQueryExtensionsView, NONE_CATEGORY, AbstractExtensionsListView } from "./extensionsViews.js";
import { IProgressService, ProgressLocation } from "../../../../platform/progress/common/progress.js";
import { IEditorGroupsService } from "../../../services/editor/common/editorGroupsService.js";
import Severity from "../../../../base/common/severity.js";
import { IActivityService, NumberBadge, WarningBadge } from "../../../services/activity/common/activity.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { Extensions, IViewDescriptorService, ViewContainerLocation } from "../../../common/views.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { IContextKeyService, ContextKeyExpr, RawContextKey } from "../../../../platform/contextkey/common/contextkey.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { INotificationService, NotificationPriority } from "../../../../platform/notification/common/notification.js";
import { IHostService } from "../../../services/host/browser/host.js";
import { IWorkbenchLayoutService } from "../../../services/layout/browser/layoutService.js";
import { ViewPaneContainer } from "../../../browser/parts/views/viewPaneContainer.js";
import { ViewPane } from "../../../browser/parts/views/viewPane.js";
import { Query } from "../common/extensionQuery.js";
import { SuggestEnabledInput } from "../../codeEditor/browser/suggestEnabledInput/suggestEnabledInput.js";
import { alert } from "../../../../base/browser/ui/aria/aria.js";
import { EXTENSION_CATEGORIES } from "../../../../platform/extensions/common/extensions.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { SyncDescriptor } from "../../../../platform/instantiation/common/descriptors.js";
import { IPreferencesService } from "../../../services/preferences/common/preferences.js";
import { SIDE_BAR_DRAG_AND_DROP_BACKGROUND } from "../../../common/theme.js";
import { VirtualWorkspaceContext, WorkbenchStateContext } from "../../../common/contextkeys.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { installLocalInRemoteIcon } from "./extensionsIcons.js";
import { registerAction2, Action2, MenuId } from "../../../../platform/actions/common/actions.js";
import { IPaneCompositePartService } from "../../../services/panecomposite/browser/panecomposite.js";
import { coalesce } from "../../../../base/common/arrays.js";
import { extractEditorsAndFilesDropData } from "../../../../platform/dnd/browser/dnd.js";
import { extname } from "../../../../base/common/resources.js";
import { registerNavigableContainer } from "../../../browser/actions/widgetNavigationCommands.js";
import { MenuWorkbenchToolBar } from "../../../../platform/actions/browser/toolbar.js";
import { createActionViewItem } from "../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { SeverityIcon } from "../../../../base/browser/ui/severityIcon/severityIcon.js";
import { StandardKeyboardEvent } from "../../../../base/browser/keyboardEvent.js";
import { KeyCode } from "../../../../base/common/keyCodes.js";
import { IExtensionGalleryManifestService, ExtensionGalleryManifestStatus } from "../../../../platform/extensionManagement/common/extensionGalleryManifest.js";
import { URI } from "../../../../base/common/uri.js";
import { DEFAULT_ACCOUNT_SIGN_IN_COMMAND } from "../../../services/accounts/browser/defaultAccount.js";
const ExtensionsSortByContext = new RawContextKey("extensionsSortByValue", "");
const SearchMarketplaceExtensionsContext = new RawContextKey("searchMarketplaceExtensions", false);
const SearchHasTextContext = new RawContextKey("extensionSearchHasText", false);
const InstalledExtensionsContext = new RawContextKey("installedExtensions", false);
const SearchInstalledExtensionsContext = new RawContextKey("searchInstalledExtensions", false);
const SearchRecentlyUpdatedExtensionsContext = new RawContextKey("searchRecentlyUpdatedExtensions", false);
const SearchExtensionUpdatesContext = new RawContextKey("searchExtensionUpdates", false);
const SearchOutdatedExtensionsContext = new RawContextKey("searchOutdatedExtensions", false);
const SearchEnabledExtensionsContext = new RawContextKey("searchEnabledExtensions", false);
const SearchDisabledExtensionsContext = new RawContextKey("searchDisabledExtensions", false);
const HasInstalledExtensionsContext = new RawContextKey("hasInstalledExtensions", true);
const BuiltInExtensionsContext = new RawContextKey("builtInExtensions", false);
const SearchBuiltInExtensionsContext = new RawContextKey("searchBuiltInExtensions", false);
const SearchUnsupportedWorkspaceExtensionsContext = new RawContextKey("searchUnsupportedWorkspaceExtensions", false);
const SearchDeprecatedExtensionsContext = new RawContextKey("searchDeprecatedExtensions", false);
const SearchRestartRequiredExtensionsContext = new RawContextKey("searchRestartRequiredExtensions", false);
const RecommendedExtensionsContext = new RawContextKey("recommendedExtensions", false);
const SortByUpdateDateContext = new RawContextKey("sortByUpdateDate", false);
const ExtensionsSearchValueContext = new RawContextKey("extensionsSearchValue", "");
const REMOTE_CATEGORY = localize2({ key: "remote", comment: ["Remote as in remote machine"] }, "Remote");
let ExtensionsViewletViewsContribution = class extends Disposable {
  constructor(extensionManagementServerService, labelService, contextKeyService) {
    super();
    this.extensionManagementServerService = extensionManagementServerService;
    this.labelService = labelService;
    this.contextKeyService = contextKeyService;
    this.container = Registry.as(Extensions.ViewContainersRegistry).get(VIEWLET_ID);
    this.registerViews();
  }
  registerViews() {
    const viewDescriptors = [];
    viewDescriptors.push(...this.createDefaultExtensionsViewDescriptors());
    viewDescriptors.push(...this.createSearchExtensionsViewDescriptors());
    viewDescriptors.push(...this.createRecommendedExtensionsViewDescriptors());
    viewDescriptors.push(...this.createBuiltinExtensionsViewDescriptors());
    viewDescriptors.push(...this.createUnsupportedWorkspaceExtensionsViewDescriptors());
    viewDescriptors.push(...this.createOtherLocalFilteredExtensionsViewDescriptors());
    viewDescriptors.push({
      id: "workbench.views.extensions.marketplaceAccess",
      name: localize2("marketPlace", "Marketplace"),
      ctorDescriptor: new SyncDescriptor(class extends ViewPane {
        shouldShowWelcome() {
          return true;
        }
      }),
      when: ContextKeyExpr.and(
        ContextKeyExpr.or(
          ContextKeyExpr.has("searchMarketplaceExtensions"),
          ContextKeyExpr.and(DefaultViewsContext)
        ),
        ContextKeyExpr.or(CONTEXT_EXTENSIONS_GALLERY_STATUS.isEqualTo(ExtensionGalleryManifestStatus.RequiresSignIn), CONTEXT_EXTENSIONS_GALLERY_STATUS.isEqualTo(ExtensionGalleryManifestStatus.AccessDenied))
      ),
      order: -1
    });
    const viewRegistry = Registry.as(Extensions.ViewsRegistry);
    viewRegistry.registerViews(viewDescriptors, this.container);
    viewRegistry.registerViewWelcomeContent("workbench.views.extensions.marketplaceAccess", {
      content: localize("sign in", "[Sign in to access Extensions Marketplace]({0})", `command:${DEFAULT_ACCOUNT_SIGN_IN_COMMAND}`),
      when: CONTEXT_EXTENSIONS_GALLERY_STATUS.isEqualTo(ExtensionGalleryManifestStatus.RequiresSignIn)
    });
    viewRegistry.registerViewWelcomeContent("workbench.views.extensions.marketplaceAccess", {
      content: localize("access denied", "Your account does not have access to the Extensions Marketplace. Please contact your administrator."),
      when: CONTEXT_EXTENSIONS_GALLERY_STATUS.isEqualTo(ExtensionGalleryManifestStatus.AccessDenied)
    });
  }
  createDefaultExtensionsViewDescriptors() {
    const viewDescriptors = [];
    const servers = [];
    if (this.extensionManagementServerService.localExtensionManagementServer) {
      servers.push(this.extensionManagementServerService.localExtensionManagementServer);
    }
    if (this.extensionManagementServerService.remoteExtensionManagementServer) {
      servers.push(this.extensionManagementServerService.remoteExtensionManagementServer);
    }
    if (this.extensionManagementServerService.webExtensionManagementServer) {
      servers.push(this.extensionManagementServerService.webExtensionManagementServer);
    }
    const getViewName = (viewTitle, server) => {
      return servers.length > 1 ? `${server.label} - ${viewTitle}` : viewTitle;
    };
    let installedWebExtensionsContextChangeEvent = Event.None;
    if (this.extensionManagementServerService.webExtensionManagementServer && this.extensionManagementServerService.remoteExtensionManagementServer) {
      const interestingContextKeys = /* @__PURE__ */ new Set();
      interestingContextKeys.add("hasInstalledWebExtensions");
      installedWebExtensionsContextChangeEvent = Event.filter(this.contextKeyService.onDidChangeContext, (e) => e.affectsSome(interestingContextKeys));
    }
    const serverLabelChangeEvent = Event.any(this.labelService.onDidChangeFormatters, installedWebExtensionsContextChangeEvent);
    for (const server of servers) {
      const getInstalledViewName = () => getViewName(localize("installed", "Installed"), server);
      const onDidChangeTitle = Event.map(serverLabelChangeEvent, () => getInstalledViewName());
      const id = servers.length > 1 ? `workbench.views.extensions.${server.id}.installed` : `workbench.views.extensions.installed`;
      viewDescriptors.push({
        id,
        get name() {
          return {
            value: getInstalledViewName(),
            original: getViewName("Installed", server)
          };
        },
        weight: 100,
        order: 1,
        when: ContextKeyExpr.and(DefaultViewsContext),
        ctorDescriptor: new SyncDescriptor(ServerInstalledExtensionsView, [{ server, flexibleHeight: true, onDidChangeTitle }]),
        /* Installed extensions views shall not be allowed to hidden when there are more than one server */
        canToggleVisibility: servers.length === 1
      });
      if (server === this.extensionManagementServerService.remoteExtensionManagementServer && this.extensionManagementServerService.localExtensionManagementServer) {
        this._register(registerAction2(class InstallLocalExtensionsInRemoteAction2 extends Action2 {
          constructor() {
            super({
              id: "workbench.extensions.installLocalExtensions",
              get title() {
                return localize2("select and install local extensions", "Install Local Extensions in '{0}'...", server.label);
              },
              category: REMOTE_CATEGORY,
              icon: installLocalInRemoteIcon,
              f1: true,
              menu: {
                id: MenuId.ViewTitle,
                when: ContextKeyExpr.equals("view", id),
                group: "navigation"
              }
            });
          }
          run(accessor) {
            return accessor.get(IInstantiationService).createInstance(InstallLocalExtensionsInRemoteAction).run();
          }
        }));
      }
    }
    if (this.extensionManagementServerService.localExtensionManagementServer && this.extensionManagementServerService.remoteExtensionManagementServer) {
      this._register(registerAction2(class InstallRemoteExtensionsInLocalAction2 extends Action2 {
        constructor() {
          super({
            id: "workbench.extensions.actions.installLocalExtensionsInRemote",
            title: localize2("install remote in local", "Install Remote Extensions Locally..."),
            category: REMOTE_CATEGORY,
            f1: true
          });
        }
        run(accessor) {
          return accessor.get(IInstantiationService).createInstance(InstallRemoteExtensionsInLocalAction, "workbench.extensions.actions.installLocalExtensionsInRemote").run();
        }
      }));
    }
    viewDescriptors.push({
      id: "workbench.views.extensions.popular",
      name: localize2("popularExtensions", "Popular"),
      ctorDescriptor: new SyncDescriptor(DefaultPopularExtensionsView, [{ hideBadge: true }]),
      when: ContextKeyExpr.and(DefaultViewsContext, ContextKeyExpr.not("hasInstalledExtensions"), CONTEXT_HAS_GALLERY),
      weight: 60,
      order: 2,
      canToggleVisibility: false
    });
    viewDescriptors.push({
      id: "extensions.recommendedList",
      name: localize2("recommendedExtensions", "Recommended"),
      ctorDescriptor: new SyncDescriptor(DefaultRecommendedExtensionsView, [{ flexibleHeight: true }]),
      when: ContextKeyExpr.and(DefaultViewsContext, SortByUpdateDateContext.negate(), ContextKeyExpr.not("config.extensions.showRecommendationsOnlyOnDemand"), CONTEXT_HAS_GALLERY),
      weight: 40,
      order: 3,
      canToggleVisibility: true
    });
    if (servers.length === 1) {
      viewDescriptors.push({
        id: "workbench.views.extensions.enabled",
        name: localize2("enabledExtensions", "Enabled"),
        ctorDescriptor: new SyncDescriptor(EnabledExtensionsView, [{}]),
        when: ContextKeyExpr.and(DefaultViewsContext, ContextKeyExpr.has("hasInstalledExtensions")),
        hideByDefault: true,
        weight: 40,
        order: 4,
        canToggleVisibility: true
      });
      viewDescriptors.push({
        id: "workbench.views.extensions.disabled",
        name: localize2("disabledExtensions", "Disabled"),
        ctorDescriptor: new SyncDescriptor(DisabledExtensionsView, [{}]),
        when: ContextKeyExpr.and(DefaultViewsContext, ContextKeyExpr.has("hasInstalledExtensions")),
        hideByDefault: true,
        weight: 10,
        order: 5,
        canToggleVisibility: true
      });
    }
    return viewDescriptors;
  }
  createSearchExtensionsViewDescriptors() {
    const viewDescriptors = [];
    viewDescriptors.push({
      id: "workbench.views.extensions.marketplace",
      name: localize2("marketPlace", "Marketplace"),
      ctorDescriptor: new SyncDescriptor(SearchMarketplaceExtensionsView, [{}]),
      when: ContextKeyExpr.and(ContextKeyExpr.has("searchMarketplaceExtensions"), CONTEXT_HAS_GALLERY)
    });
    viewDescriptors.push({
      id: "workbench.views.extensions.searchInstalled",
      name: localize2("installed", "Installed"),
      ctorDescriptor: new SyncDescriptor(ExtensionsListView, [{}]),
      when: ContextKeyExpr.or(ContextKeyExpr.has("searchInstalledExtensions"), ContextKeyExpr.has("installedExtensions"))
    });
    viewDescriptors.push({
      id: "workbench.views.extensions.searchRecentlyUpdated",
      name: localize2("recently updated", "Recently Updated"),
      ctorDescriptor: new SyncDescriptor(RecentlyUpdatedExtensionsView, [{}]),
      when: ContextKeyExpr.or(SearchExtensionUpdatesContext, ContextKeyExpr.has("searchRecentlyUpdatedExtensions")),
      order: 2
    });
    viewDescriptors.push({
      id: "workbench.views.extensions.searchEnabled",
      name: localize2("enabled", "Enabled"),
      ctorDescriptor: new SyncDescriptor(ExtensionsListView, [{}]),
      when: ContextKeyExpr.and(ContextKeyExpr.has("searchEnabledExtensions"))
    });
    viewDescriptors.push({
      id: "workbench.views.extensions.searchDisabled",
      name: localize2("disabled", "Disabled"),
      ctorDescriptor: new SyncDescriptor(ExtensionsListView, [{}]),
      when: ContextKeyExpr.and(ContextKeyExpr.has("searchDisabledExtensions"))
    });
    viewDescriptors.push({
      id: OUTDATED_EXTENSIONS_VIEW_ID,
      name: localize2("availableUpdates", "Available Updates"),
      ctorDescriptor: new SyncDescriptor(OutdatedExtensionsView, [{}]),
      when: ContextKeyExpr.or(SearchExtensionUpdatesContext, ContextKeyExpr.has("searchOutdatedExtensions")),
      order: 1
    });
    viewDescriptors.push({
      id: "workbench.views.extensions.searchBuiltin",
      name: localize2("builtin", "Builtin"),
      ctorDescriptor: new SyncDescriptor(ExtensionsListView, [{}]),
      when: ContextKeyExpr.and(ContextKeyExpr.has("searchBuiltInExtensions"))
    });
    viewDescriptors.push({
      id: "workbench.views.extensions.searchWorkspaceUnsupported",
      name: localize2("workspaceUnsupported", "Workspace Unsupported"),
      ctorDescriptor: new SyncDescriptor(ExtensionsListView, [{}]),
      when: ContextKeyExpr.and(ContextKeyExpr.has("searchWorkspaceUnsupportedExtensions"))
    });
    return viewDescriptors;
  }
  createRecommendedExtensionsViewDescriptors() {
    const viewDescriptors = [];
    viewDescriptors.push({
      id: WORKSPACE_RECOMMENDATIONS_VIEW_ID,
      name: localize2("workspaceRecommendedExtensions", "Workspace Recommendations"),
      ctorDescriptor: new SyncDescriptor(WorkspaceRecommendedExtensionsView, [{}]),
      when: ContextKeyExpr.and(ContextKeyExpr.has("recommendedExtensions"), WorkbenchStateContext.notEqualsTo("empty")),
      order: 1
    });
    viewDescriptors.push({
      id: "workbench.views.extensions.otherRecommendations",
      name: localize2("otherRecommendedExtensions", "Other Recommendations"),
      ctorDescriptor: new SyncDescriptor(RecommendedExtensionsView, [{}]),
      when: ContextKeyExpr.has("recommendedExtensions"),
      order: 2
    });
    return viewDescriptors;
  }
  createBuiltinExtensionsViewDescriptors() {
    const viewDescriptors = [];
    const configuredCategories = ["themes", "programming languages"];
    const otherCategories = EXTENSION_CATEGORIES.filter((c) => !configuredCategories.includes(c.toLowerCase()));
    otherCategories.push(NONE_CATEGORY);
    const otherCategoriesQuery = `${otherCategories.map((c) => `category:"${c}"`).join(" ")} ${configuredCategories.map((c) => `category:"-${c}"`).join(" ")}`;
    viewDescriptors.push({
      id: "workbench.views.extensions.builtinFeatureExtensions",
      name: localize2("builtinFeatureExtensions", "Features"),
      ctorDescriptor: new SyncDescriptor(StaticQueryExtensionsView, [{ query: `@builtin ${otherCategoriesQuery}` }]),
      when: ContextKeyExpr.has("builtInExtensions")
    });
    viewDescriptors.push({
      id: "workbench.views.extensions.builtinThemeExtensions",
      name: localize2("builtInThemesExtensions", "Themes"),
      ctorDescriptor: new SyncDescriptor(StaticQueryExtensionsView, [{ query: `@builtin category:themes` }]),
      when: ContextKeyExpr.has("builtInExtensions")
    });
    viewDescriptors.push({
      id: "workbench.views.extensions.builtinProgrammingLanguageExtensions",
      name: localize2("builtinProgrammingLanguageExtensions", "Programming Languages"),
      ctorDescriptor: new SyncDescriptor(StaticQueryExtensionsView, [{ query: `@builtin category:"programming languages"` }]),
      when: ContextKeyExpr.has("builtInExtensions")
    });
    return viewDescriptors;
  }
  createUnsupportedWorkspaceExtensionsViewDescriptors() {
    const viewDescriptors = [];
    viewDescriptors.push({
      id: "workbench.views.extensions.untrustedUnsupportedExtensions",
      name: localize2("untrustedUnsupportedExtensions", "Disabled in Restricted Mode"),
      ctorDescriptor: new SyncDescriptor(UntrustedWorkspaceUnsupportedExtensionsView, [{}]),
      when: ContextKeyExpr.and(SearchUnsupportedWorkspaceExtensionsContext)
    });
    viewDescriptors.push({
      id: "workbench.views.extensions.untrustedPartiallySupportedExtensions",
      name: localize2("untrustedPartiallySupportedExtensions", "Limited in Restricted Mode"),
      ctorDescriptor: new SyncDescriptor(UntrustedWorkspacePartiallySupportedExtensionsView, [{}]),
      when: ContextKeyExpr.and(SearchUnsupportedWorkspaceExtensionsContext)
    });
    viewDescriptors.push({
      id: "workbench.views.extensions.virtualUnsupportedExtensions",
      name: localize2("virtualUnsupportedExtensions", "Disabled in Virtual Workspaces"),
      ctorDescriptor: new SyncDescriptor(VirtualWorkspaceUnsupportedExtensionsView, [{}]),
      when: ContextKeyExpr.and(VirtualWorkspaceContext, SearchUnsupportedWorkspaceExtensionsContext)
    });
    viewDescriptors.push({
      id: "workbench.views.extensions.virtualPartiallySupportedExtensions",
      name: localize2("virtualPartiallySupportedExtensions", "Limited in Virtual Workspaces"),
      ctorDescriptor: new SyncDescriptor(VirtualWorkspacePartiallySupportedExtensionsView, [{}]),
      when: ContextKeyExpr.and(VirtualWorkspaceContext, SearchUnsupportedWorkspaceExtensionsContext)
    });
    return viewDescriptors;
  }
  createOtherLocalFilteredExtensionsViewDescriptors() {
    const viewDescriptors = [];
    viewDescriptors.push({
      id: "workbench.views.extensions.deprecatedExtensions",
      name: localize2("deprecated", "Deprecated"),
      ctorDescriptor: new SyncDescriptor(DeprecatedExtensionsView, [{}]),
      when: ContextKeyExpr.and(SearchDeprecatedExtensionsContext)
    });
    viewDescriptors.push({
      id: "workbench.views.extensions.restartRequired",
      name: localize2("restart required", "Restart Required"),
      ctorDescriptor: new SyncDescriptor(ExtensionsListView, [{}]),
      when: ContextKeyExpr.and(SearchRestartRequiredExtensionsContext)
    });
    return viewDescriptors;
  }
};
ExtensionsViewletViewsContribution = __decorateClass([
  __decorateParam(0, IExtensionManagementServerService),
  __decorateParam(1, ILabelService),
  __decorateParam(2, IContextKeyService)
], ExtensionsViewletViewsContribution);
let ExtensionsViewPaneContainer = class extends ViewPaneContainer {
  constructor(layoutService, telemetryService, progressService, instantiationService, editorGroupService, extensionGalleryManifestService, extensionsWorkbenchService, extensionManagementServerService, notificationService, paneCompositeService, themeService, configurationService, storageService, contextService, contextKeyService, contextMenuService, extensionService, viewDescriptorService, preferencesService, commandService, logService, openerService) {
    super(VIEWLET_ID, { mergeViewWithContainerWhenSingleView: true }, instantiationService, configurationService, layoutService, contextMenuService, telemetryService, extensionService, themeService, storageService, contextService, viewDescriptorService, logService);
    this.progressService = progressService;
    this.editorGroupService = editorGroupService;
    this.extensionsWorkbenchService = extensionsWorkbenchService;
    this.extensionManagementServerService = extensionManagementServerService;
    this.notificationService = notificationService;
    this.paneCompositeService = paneCompositeService;
    this.contextKeyService = contextKeyService;
    this.preferencesService = preferencesService;
    this.commandService = commandService;
    this.openerService = openerService;
    this.extensionGalleryManifest = null;
    this.notificationDisposables = this._register(new MutableDisposable());
    this.searchDelayer = this._register(new Delayer(500));
    this.extensionsSearchValueContextKey = ExtensionsSearchValueContext.bindTo(contextKeyService);
    this.defaultViewsContextKey = DefaultViewsContext.bindTo(contextKeyService);
    this.sortByContextKey = ExtensionsSortByContext.bindTo(contextKeyService);
    this.searchMarketplaceExtensionsContextKey = SearchMarketplaceExtensionsContext.bindTo(contextKeyService);
    this.searchMcpServersContextKey = SearchMcpServersContext.bindTo(contextKeyService);
    this.searchAgentPluginsContextKey = SearchAgentPluginsContext.bindTo(contextKeyService);
    this.searchHasTextContextKey = SearchHasTextContext.bindTo(contextKeyService);
    this.sortByUpdateDateContextKey = SortByUpdateDateContext.bindTo(contextKeyService);
    this.installedExtensionsContextKey = InstalledExtensionsContext.bindTo(contextKeyService);
    this.searchInstalledExtensionsContextKey = SearchInstalledExtensionsContext.bindTo(contextKeyService);
    this.searchRecentlyUpdatedExtensionsContextKey = SearchRecentlyUpdatedExtensionsContext.bindTo(contextKeyService);
    this.searchExtensionUpdatesContextKey = SearchExtensionUpdatesContext.bindTo(contextKeyService);
    this.searchWorkspaceUnsupportedExtensionsContextKey = SearchUnsupportedWorkspaceExtensionsContext.bindTo(contextKeyService);
    this.searchDeprecatedExtensionsContextKey = SearchDeprecatedExtensionsContext.bindTo(contextKeyService);
    this.searchRestartRequiredExtensionsContextKey = SearchRestartRequiredExtensionsContext.bindTo(contextKeyService);
    this.searchOutdatedExtensionsContextKey = SearchOutdatedExtensionsContext.bindTo(contextKeyService);
    this.searchEnabledExtensionsContextKey = SearchEnabledExtensionsContext.bindTo(contextKeyService);
    this.searchDisabledExtensionsContextKey = SearchDisabledExtensionsContext.bindTo(contextKeyService);
    this.hasInstalledExtensionsContextKey = HasInstalledExtensionsContext.bindTo(contextKeyService);
    this.builtInExtensionsContextKey = BuiltInExtensionsContext.bindTo(contextKeyService);
    this.searchBuiltInExtensionsContextKey = SearchBuiltInExtensionsContext.bindTo(contextKeyService);
    this.recommendedExtensionsContextKey = RecommendedExtensionsContext.bindTo(contextKeyService);
    this._register(this.paneCompositeService.onDidPaneCompositeOpen((e) => {
      if (e.viewContainerLocation === ViewContainerLocation.Sidebar) {
        this.onViewletOpen(e.composite);
      }
    }, this));
    this._register(extensionsWorkbenchService.onReset(() => this.refresh()));
    this.searchViewletState = this.getMemento(StorageScope.WORKSPACE, StorageTarget.MACHINE);
    extensionGalleryManifestService.getExtensionGalleryManifest().then((galleryManifest) => {
      this.extensionGalleryManifest = galleryManifest;
      this._register(extensionGalleryManifestService.onDidChangeExtensionGalleryManifest((galleryManifest2) => {
        this.extensionGalleryManifest = galleryManifest2;
        this.refresh();
      }));
    });
  }
  get searchValue() {
    return this.searchBox?.getValue();
  }
  create(parent) {
    parent.classList.add("extensions-viewlet");
    this.root = parent;
    const overlay = append(this.root, $(".overlay"));
    const overlayBackgroundColor = this.getColor(SIDE_BAR_DRAG_AND_DROP_BACKGROUND) ?? "";
    overlay.style.backgroundColor = overlayBackgroundColor;
    hide(overlay);
    this.header = append(this.root, $(".header"));
    const placeholder = localize("searchExtensions", "Search Extensions in Marketplace");
    const searchValue = this.searchViewletState["query.value"] ? this.searchViewletState["query.value"] : "";
    const searchContainer = append(this.header, $(".extensions-search-container"));
    this.searchBox = this._register(this.instantiationService.createInstance(SuggestEnabledInput, `${VIEWLET_ID}.searchbox`, searchContainer, {
      triggerCharacters: ["@"],
      sortKey: (item) => {
        if (item.indexOf(":") === -1) {
          return "a";
        } else if (/ext:/.test(item) || /id:/.test(item) || /tag:/.test(item)) {
          return "b";
        } else if (/sort:/.test(item)) {
          return "c";
        } else {
          return "d";
        }
      },
      provideResults: (query) => Query.suggestions(query, this.extensionGalleryManifest)
    }, placeholder, "extensions:searchinput", { placeholderText: placeholder, value: searchValue }));
    this.notificationContainer = append(this.header, $(".notification-container.hidden", { "tabindex": "0" }));
    this.renderNotificaiton();
    this._register(this.extensionsWorkbenchService.onDidChangeExtensionsNotification(() => this.renderNotificaiton()));
    this.updateInstalledExtensionsContexts();
    if (this.searchBox.getValue()) {
      this.triggerSearch();
    }
    this._register(this.searchBox.onInputDidChange(() => {
      this.sortByContextKey.set(Query.parse(this.searchBox?.getValue() ?? "").sortBy);
      this.triggerSearch();
    }, this));
    this._register(this.searchBox.onShouldFocusResults(() => this.focusListView(), this));
    const controlElement = append(searchContainer, $(".extensions-search-actions-container"));
    this._register(this.instantiationService.createInstance(MenuWorkbenchToolBar, controlElement, extensionsSearchActionsMenu, {
      toolbarOptions: {
        primaryGroup: () => true
      },
      actionViewItemProvider: (action, options) => createActionViewItem(this.instantiationService, action, options)
    }));
    this._register(new DragAndDropObserver(this.root, {
      onDragEnter: (e) => {
        if (this.isSupportedDragElement(e)) {
          show(overlay);
        }
      },
      onDragLeave: (e) => {
        if (this.isSupportedDragElement(e)) {
          hide(overlay);
        }
      },
      onDragOver: (e) => {
        if (this.isSupportedDragElement(e)) {
          e.dataTransfer.dropEffect = "copy";
        }
      },
      onDrop: async (e) => {
        if (this.isSupportedDragElement(e)) {
          hide(overlay);
          const vsixs = coalesce((await this.instantiationService.invokeFunction((accessor) => extractEditorsAndFilesDropData(accessor, e))).map((editor) => editor.resource && extname(editor.resource) === ".vsix" ? editor.resource : void 0));
          if (vsixs.length > 0) {
            try {
              await this.commandService.executeCommand(INSTALL_EXTENSION_FROM_VSIX_COMMAND_ID, vsixs);
            } catch (err) {
              this.notificationService.error(err);
            }
          }
        }
      }
    }));
    super.create(append(this.root, $(".extensions")));
    const focusTracker = this._register(trackFocus(this.root));
    const isSearchBoxFocused = () => this.searchBox?.inputWidget.hasWidgetFocus();
    this._register(registerNavigableContainer({
      name: "extensionsView",
      focusNotifiers: [focusTracker],
      focusNextWidget: () => {
        if (isSearchBoxFocused()) {
          this.focusListView();
        }
      },
      focusPreviousWidget: () => {
        if (!isSearchBoxFocused()) {
          this.searchBox?.focus();
        }
      }
    }));
  }
  focus() {
    super.focus();
    this.searchBox?.focus();
  }
  layout(dimension) {
    this._dimension = dimension;
    if (this.root) {
      this.root.classList.toggle("narrow", dimension.width <= 250);
      this.root.classList.toggle("mini", dimension.width <= 200);
    }
    this.searchBox?.layout(new Dimension(dimension.width - 34 - /*padding*/
    8 - 24 * 2, 20));
    const searchBoxHeight = 20 + 21;
    const headerHeight = this.header && !!this.notificationContainer?.childNodes.length ? this.notificationContainer.clientHeight + searchBoxHeight + 10 : searchBoxHeight;
    this.header.style.height = `${headerHeight}px`;
    super.layout(new Dimension(dimension.width, dimension.height - headerHeight));
  }
  getOptimalWidth() {
    return 400;
  }
  search(value) {
    if (this.searchBox && this.searchBox.getValue() !== value) {
      this.searchBox.setValue(value);
    }
  }
  async refresh() {
    await this.updateInstalledExtensionsContexts();
    this.doSearch(true);
    if (this.configurationService.getValue(AutoCheckUpdatesConfigurationKey)) {
      this.extensionsWorkbenchService.checkForUpdates();
    }
  }
  renderNotificaiton() {
    if (!this.notificationContainer) {
      return;
    }
    clearNode(this.notificationContainer);
    this.notificationDisposables.value = new DisposableStore();
    const status = this.extensionsWorkbenchService.getExtensionsNotification();
    const query = status?.query ?? status?.extensions.map((extension) => `@id:${extension.identifier.id}`).join(" ");
    if (status && (query === this.searchBox?.getValue() || !this.searchMarketplaceExtensionsContextKey.get())) {
      const messagePlainText = isMarkdownString(status.message) ? renderAsPlaintext(status.message) : status.message;
      this.notificationContainer.setAttribute("aria-label", messagePlainText);
      this.notificationContainer.classList.remove("hidden");
      const messageContainer = append(this.notificationContainer, $(".message-container"));
      append(messageContainer, $("span")).className = SeverityIcon.className(status.severity);
      const messageText = append(messageContainer, $("span.message-text"));
      const messageElement = append(messageText, $("span.message"));
      if (isMarkdownString(status.message)) {
        const isTrusted = status.message.isTrusted;
        const allowCommands = typeof isTrusted === "object" ? isTrusted.enabledCommands : !!isTrusted;
        this.notificationDisposables.value.add(renderMarkdown(status.message, {
          actionHandler: (link) => {
            this.openerService.open(link, { allowCommands });
          }
        }, messageElement));
      } else {
        messageElement.textContent = status.message;
      }
      if (status.extensions.length) {
        const showAction = append(
          messageText,
          $("span.message-text-action", {
            "tabindex": "0",
            "role": "button",
            "aria-label": `${messagePlainText}. ${localize("click show", "Click to Show")}`
          }, localize("show", "Show"))
        );
        this.notificationDisposables.value.add(addDisposableListener(showAction, EventType.CLICK, () => this.search(query ?? "")));
        this.notificationDisposables.value.add(addDisposableListener(showAction, EventType.KEY_DOWN, (e) => {
          const standardKeyboardEvent = new StandardKeyboardEvent(e);
          if (standardKeyboardEvent.keyCode === KeyCode.Enter || standardKeyboardEvent.keyCode === KeyCode.Space) {
            this.search(query ?? "");
          }
          standardKeyboardEvent.stopPropagation();
        }));
      }
      const actionsContainer = append(this.notificationContainer, $(".notification-actions"));
      if (status.action) {
        const actionButton = append(
          actionsContainer,
          $("span.message-action-button", {
            "tabindex": "0",
            "role": "button",
            "aria-label": status.action.label
          }, status.action.label)
        );
        this.notificationDisposables.value.add(addDisposableListener(actionButton, EventType.CLICK, () => {
          Promise.resolve(status.action.run()).catch((error) => this.notificationService.error(error));
        }));
        this.notificationDisposables.value.add(addDisposableListener(actionButton, EventType.KEY_DOWN, (e) => {
          const standardKeyboardEvent = new StandardKeyboardEvent(e);
          if (standardKeyboardEvent.keyCode === KeyCode.Enter || standardKeyboardEvent.keyCode === KeyCode.Space) {
            Promise.resolve(status.action.run()).catch((error) => this.notificationService.error(error));
          }
          standardKeyboardEvent.stopPropagation();
        }));
      }
      const dismiss = status.dismiss;
      if (dismiss) {
        const dismissLabel = localize("dismiss notification", "Dismiss");
        const dismissButton = append(
          actionsContainer,
          $("span.dismiss-action.codicon.codicon-close", {
            "tabindex": "0",
            "role": "button",
            "aria-label": dismissLabel,
            "title": dismissLabel
          })
        );
        this.notificationDisposables.value.add(addDisposableListener(dismissButton, EventType.CLICK, () => dismiss()));
        this.notificationDisposables.value.add(addDisposableListener(dismissButton, EventType.KEY_DOWN, (e) => {
          const standardKeyboardEvent = new StandardKeyboardEvent(e);
          if (standardKeyboardEvent.keyCode === KeyCode.Enter || standardKeyboardEvent.keyCode === KeyCode.Space) {
            dismiss();
          }
          standardKeyboardEvent.stopPropagation();
        }));
      }
    } else {
      this.notificationContainer.removeAttribute("aria-label");
      this.notificationContainer.classList.add("hidden");
      if (this.searchBox && ExtensionsListView.isRestartRequiredQuery(this.searchBox.getValue())) {
        this.search("");
      }
    }
    if (this._dimension) {
      this.layout(this._dimension);
    }
  }
  async updateInstalledExtensionsContexts() {
    const result = await this.extensionsWorkbenchService.queryLocal();
    this.hasInstalledExtensionsContextKey.set(result.some((r) => !r.isBuiltin));
  }
  triggerSearch() {
    this.searchDelayer.trigger(() => this.doSearch(), this.searchBox && this.searchBox.getValue() ? 500 : 0).then(void 0, (err) => this.onError(err));
  }
  normalizedQuery() {
    return this.searchBox ? this.searchBox.getValue().trim().replace(/@category/g, "category").replace(/@tag:/g, "tag:").replace(/@ext:/g, "ext:").replace(/@featured/g, "featured").replace(/@popular/g, this.extensionManagementServerService.webExtensionManagementServer && !this.extensionManagementServerService.localExtensionManagementServer && !this.extensionManagementServerService.remoteExtensionManagementServer ? "@web" : "@popular") : "";
  }
  saveState() {
    const value = this.searchBox ? this.searchBox.getValue() : "";
    if (ExtensionsListView.isLocalExtensionsQuery(value)) {
      this.searchViewletState["query.value"] = value;
    } else {
      this.searchViewletState["query.value"] = "";
    }
    super.saveState();
  }
  doSearch(refresh) {
    const value = this.normalizedQuery();
    this.contextKeyService.bufferChangeEvents(() => {
      const isRecommendedExtensionsQuery = ExtensionsListView.isRecommendedExtensionsQuery(value);
      this.searchHasTextContextKey.set(value.trim() !== "");
      this.extensionsSearchValueContextKey.set(value);
      this.installedExtensionsContextKey.set(ExtensionsListView.isInstalledExtensionsQuery(value));
      this.searchInstalledExtensionsContextKey.set(ExtensionsListView.isSearchInstalledExtensionsQuery(value));
      this.searchRecentlyUpdatedExtensionsContextKey.set(ExtensionsListView.isSearchRecentlyUpdatedQuery(value) && !ExtensionsListView.isSearchExtensionUpdatesQuery(value));
      this.searchOutdatedExtensionsContextKey.set(ExtensionsListView.isOutdatedExtensionsQuery(value) && !ExtensionsListView.isSearchExtensionUpdatesQuery(value));
      this.searchExtensionUpdatesContextKey.set(ExtensionsListView.isSearchExtensionUpdatesQuery(value));
      this.searchEnabledExtensionsContextKey.set(ExtensionsListView.isEnabledExtensionsQuery(value));
      this.searchDisabledExtensionsContextKey.set(ExtensionsListView.isDisabledExtensionsQuery(value));
      this.searchBuiltInExtensionsContextKey.set(ExtensionsListView.isSearchBuiltInExtensionsQuery(value));
      this.searchWorkspaceUnsupportedExtensionsContextKey.set(ExtensionsListView.isSearchWorkspaceUnsupportedExtensionsQuery(value));
      this.searchDeprecatedExtensionsContextKey.set(ExtensionsListView.isSearchDeprecatedExtensionsQuery(value));
      this.searchRestartRequiredExtensionsContextKey.set(ExtensionsListView.isRestartRequiredQuery(value));
      this.builtInExtensionsContextKey.set(ExtensionsListView.isBuiltInExtensionsQuery(value));
      this.recommendedExtensionsContextKey.set(isRecommendedExtensionsQuery);
      this.searchMcpServersContextKey.set(!!value && /@mcp\s?.*/i.test(value));
      this.searchAgentPluginsContextKey.set(!!value && /@agentPlugins\s?.*/i.test(value));
      this.searchMarketplaceExtensionsContextKey.set(!!value && !ExtensionsListView.isLocalExtensionsQuery(value) && !isRecommendedExtensionsQuery && !this.searchMcpServersContextKey.get() && !this.searchAgentPluginsContextKey.get());
      this.sortByUpdateDateContextKey.set(ExtensionsListView.isSortUpdateDateQuery(value));
      this.defaultViewsContextKey.set(!value || ExtensionsListView.isSortInstalledExtensionsQuery(value));
    });
    this.renderNotificaiton();
    return this.showExtensionsViews(this.panes);
  }
  onDidAddViewDescriptors(added) {
    const addedViews = super.onDidAddViewDescriptors(added);
    this.showExtensionsViews(addedViews);
    return addedViews;
  }
  async showExtensionsViews(views) {
    await this.progress(Promise.all(views.map(async (view) => {
      if (view instanceof AbstractExtensionsListView) {
        const model = await view.show(this.normalizedQuery());
        this.alertSearchResult(model.length, view.id);
      }
    })));
  }
  alertSearchResult(count, viewId) {
    const view = this.viewContainerModel.visibleViewDescriptors.find((view2) => view2.id === viewId);
    switch (count) {
      case 0:
        break;
      case 1:
        if (view) {
          alert(localize("extensionFoundInSection", "1 extension found in the {0} section.", view.name.value));
        } else {
          alert(localize("extensionFound", "1 extension found."));
        }
        break;
      default:
        if (view) {
          alert(localize("extensionsFoundInSection", "{0} extensions found in the {1} section.", count, view.name.value));
        } else {
          alert(localize("extensionsFound", "{0} extensions found.", count));
        }
        break;
    }
  }
  getFirstExpandedPane() {
    for (const pane of this.panes) {
      if (pane.isExpanded() && pane instanceof ExtensionsListView) {
        return pane;
      }
    }
    return void 0;
  }
  focusListView() {
    const pane = this.getFirstExpandedPane();
    if (pane && pane.count() > 0) {
      pane.focus();
    }
  }
  onViewletOpen(viewlet) {
    if (!viewlet || viewlet.getId() === VIEWLET_ID) {
      return;
    }
    if (this.configurationService.getValue(CloseExtensionDetailsOnViewChangeKey)) {
      const promises = this.editorGroupService.groups.map((group) => {
        const editors = group.editors.filter((input) => input instanceof ExtensionsInput);
        return group.closeEditors(editors);
      });
      Promise.all(promises);
    }
  }
  progress(promise) {
    return this.progressService.withProgress({ location: ProgressLocation.Extensions }, () => promise);
  }
  onError(err) {
    if (isCancellationError(err)) {
      return;
    }
    const message = err && err.message || "";
    if (/ECONNREFUSED/.test(message)) {
      const error = createErrorWithActions(localize("suggestProxyError", "Marketplace returned 'ECONNREFUSED'. Please check the 'http.proxy' setting."), [
        new Action("open user settings", localize("open user settings", "Open User Settings"), void 0, true, () => this.preferencesService.openUserSettings())
      ]);
      this.notificationService.error(error);
      return;
    }
    this.notificationService.error(err);
  }
  isSupportedDragElement(e) {
    if (e.dataTransfer) {
      const typesLowerCase = e.dataTransfer.types.map((t) => t.toLocaleLowerCase());
      return typesLowerCase.indexOf("files") !== -1;
    }
    return false;
  }
};
ExtensionsViewPaneContainer = __decorateClass([
  __decorateParam(0, IWorkbenchLayoutService),
  __decorateParam(1, ITelemetryService),
  __decorateParam(2, IProgressService),
  __decorateParam(3, IInstantiationService),
  __decorateParam(4, IEditorGroupsService),
  __decorateParam(5, IExtensionGalleryManifestService),
  __decorateParam(6, IExtensionsWorkbenchService),
  __decorateParam(7, IExtensionManagementServerService),
  __decorateParam(8, INotificationService),
  __decorateParam(9, IPaneCompositePartService),
  __decorateParam(10, IThemeService),
  __decorateParam(11, IConfigurationService),
  __decorateParam(12, IStorageService),
  __decorateParam(13, IWorkspaceContextService),
  __decorateParam(14, IContextKeyService),
  __decorateParam(15, IContextMenuService),
  __decorateParam(16, IExtensionService),
  __decorateParam(17, IViewDescriptorService),
  __decorateParam(18, IPreferencesService),
  __decorateParam(19, ICommandService),
  __decorateParam(20, ILogService),
  __decorateParam(21, IOpenerService)
], ExtensionsViewPaneContainer);
let StatusUpdater = class extends Disposable {
  constructor(activityService, extensionsWorkbenchService, extensionEnablementService, configurationService) {
    super();
    this.activityService = activityService;
    this.extensionsWorkbenchService = extensionsWorkbenchService;
    this.extensionEnablementService = extensionEnablementService;
    this.configurationService = configurationService;
    this.badgeHandle = this._register(new MutableDisposable());
    this.onServiceChange();
    this._register(Event.any(Event.debounce(extensionsWorkbenchService.onChange, () => void 0, 100, void 0, void 0, void 0, this._store), extensionsWorkbenchService.onDidChangeExtensionsNotification)(this.onServiceChange, this));
  }
  onServiceChange() {
    this.badgeHandle.clear();
    let badge;
    const extensionsNotification = this.extensionsWorkbenchService.getExtensionsNotification();
    if (extensionsNotification && extensionsNotification.severity === Severity.Warning) {
      badge = new WarningBadge(() => isMarkdownString(extensionsNotification.message) ? renderAsPlaintext(extensionsNotification.message) : extensionsNotification.message);
    }
    if (!badge) {
      const actionRequired = this.configurationService.getValue(AutoRestartConfigurationKey) === true ? [] : this.extensionsWorkbenchService.installed.filter((e) => e.runtimeState !== void 0);
      const outdated = this.extensionsWorkbenchService.outdated.reduce((r, e) => r + (this.extensionEnablementService.isEnabled(e.local) && !actionRequired.includes(e) && !this.extensionsWorkbenchService.isAutoUpdateDelayed(e) ? 1 : 0), 0);
      const newBadgeNumber = outdated + actionRequired.length;
      if (newBadgeNumber > 0) {
        let msg = "";
        if (outdated) {
          msg += outdated === 1 ? localize("extensionToUpdate", "{0} requires update", outdated) : localize("extensionsToUpdate", "{0} require update", outdated);
        }
        if (outdated > 0 && actionRequired.length > 0) {
          msg += ", ";
        }
        if (actionRequired.length) {
          msg += actionRequired.length === 1 ? localize("extensionToReload", "{0} requires restart", actionRequired.length) : localize("extensionsToReload", "{0} require restart", actionRequired.length);
        }
        badge = new NumberBadge(newBadgeNumber, () => msg);
      }
    }
    if (badge) {
      this.badgeHandle.value = this.activityService.showViewContainerActivity(VIEWLET_ID, { badge });
    }
  }
};
StatusUpdater = __decorateClass([
  __decorateParam(0, IActivityService),
  __decorateParam(1, IExtensionsWorkbenchService),
  __decorateParam(2, IWorkbenchExtensionEnablementService),
  __decorateParam(3, IConfigurationService)
], StatusUpdater);
let MaliciousExtensionChecker = class {
  constructor(extensionsManagementService, extensionsWorkbenchService, hostService, logService, notificationService, commandService) {
    this.extensionsManagementService = extensionsManagementService;
    this.extensionsWorkbenchService = extensionsWorkbenchService;
    this.hostService = hostService;
    this.logService = logService;
    this.notificationService = notificationService;
    this.commandService = commandService;
    this.loopCheckForMaliciousExtensions();
  }
  loopCheckForMaliciousExtensions() {
    this.checkForMaliciousExtensions().then(() => timeout(1e3 * 60 * 5)).then(() => this.loopCheckForMaliciousExtensions());
  }
  async checkForMaliciousExtensions() {
    try {
      const maliciousExtensions = [];
      let shouldRestartExtensions = false;
      let shouldReloadWindow = false;
      for (const extension of this.extensionsWorkbenchService.installed) {
        if (extension.isMalicious && extension.local) {
          maliciousExtensions.push([extension.local, extension.maliciousInfoLink]);
          shouldRestartExtensions = shouldRestartExtensions || extension.runtimeState?.action === ExtensionRuntimeActionType.RestartExtensions;
          shouldReloadWindow = shouldReloadWindow || extension.runtimeState?.action === ExtensionRuntimeActionType.ReloadWindow;
        }
      }
      if (maliciousExtensions.length) {
        await this.extensionsManagementService.uninstallExtensions(maliciousExtensions.map((e) => ({ extension: e[0], options: { remove: true } })));
        for (const [extension, link] of maliciousExtensions) {
          const buttons = [];
          if (shouldRestartExtensions || shouldReloadWindow) {
            buttons.push({
              label: shouldRestartExtensions ? localize("restartNow", "Restart Extensions") : localize("reloadNow", "Reload Now"),
              run: () => shouldRestartExtensions ? this.extensionsWorkbenchService.updateRunningExtensions() : this.hostService.reload()
            });
          }
          if (link) {
            buttons.push({
              label: localize("learnMore", "Learn More"),
              run: () => this.commandService.executeCommand("vscode.open", URI.parse(link))
            });
          }
          this.notificationService.prompt(
            Severity.Warning,
            localize("malicious warning", "The extension '{0}' was found to be problematic and has been uninstalled", extension.manifest.displayName || extension.identifier.id),
            buttons,
            {
              sticky: true,
              priority: NotificationPriority.URGENT
            }
          );
        }
      }
    } catch (err) {
      this.logService.error(err);
    }
  }
};
MaliciousExtensionChecker = __decorateClass([
  __decorateParam(0, IExtensionManagementService),
  __decorateParam(1, IExtensionsWorkbenchService),
  __decorateParam(2, IHostService),
  __decorateParam(3, ILogService),
  __decorateParam(4, INotificationService),
  __decorateParam(5, ICommandService)
], MaliciousExtensionChecker);
let ExtensionMarketplaceStatusUpdater = class extends Disposable {
  constructor(activityService, extensionGalleryManifestService) {
    super();
    this.activityService = activityService;
    this.extensionGalleryManifestService = extensionGalleryManifestService;
    this.badgeHandle = this._register(new MutableDisposable());
    this.accountBadgeDisposable = this._register(new MutableDisposable());
    this.updateBadge();
    this._register(this.extensionGalleryManifestService.onDidChangeExtensionGalleryManifestStatus(() => this.updateBadge()));
  }
  async updateBadge() {
    this.badgeHandle.clear();
    const status = this.extensionGalleryManifestService.extensionGalleryManifestStatus;
    let badge;
    switch (status) {
      case ExtensionGalleryManifestStatus.RequiresSignIn:
        badge = new NumberBadge(1, () => localize("signInRequired", "Sign in required to access marketplace"));
        break;
      case ExtensionGalleryManifestStatus.AccessDenied:
        badge = new WarningBadge(() => localize("accessDenied", "Access denied to marketplace"));
        break;
    }
    if (badge) {
      this.badgeHandle.value = this.activityService.showViewContainerActivity(VIEWLET_ID, { badge });
    }
    this.accountBadgeDisposable.clear();
    if (status === ExtensionGalleryManifestStatus.RequiresSignIn) {
      const badge2 = new NumberBadge(1, () => localize("sign in enterprise marketplace", "Sign in to access Marketplace"));
      this.accountBadgeDisposable.value = this.activityService.showAccountsActivity({ badge: badge2 });
    }
  }
};
ExtensionMarketplaceStatusUpdater = __decorateClass([
  __decorateParam(0, IActivityService),
  __decorateParam(1, IExtensionGalleryManifestService)
], ExtensionMarketplaceStatusUpdater);
export {
  BuiltInExtensionsContext,
  ExtensionMarketplaceStatusUpdater,
  ExtensionsSearchValueContext,
  ExtensionsSortByContext,
  ExtensionsViewPaneContainer,
  ExtensionsViewletViewsContribution,
  MaliciousExtensionChecker,
  RecommendedExtensionsContext,
  SearchHasTextContext,
  SearchMarketplaceExtensionsContext,
  StatusUpdater
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGV4dGVuc2lvbnNcXGJyb3dzZXJcXGV4dGVuc2lvbnNWaWV3bGV0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICcuL21lZGlhL2V4dGVuc2lvbnNWaWV3bGV0LmNzcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSwgbG9jYWxpemUyIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IHRpbWVvdXQsIERlbGF5ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBpc0NhbmNlbGxhdGlvbkVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IGNyZWF0ZUVycm9yV2l0aEFjdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvck1lc3NhZ2UuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgTXV0YWJsZURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IGFwcGVuZCwgJCwgRGltZW5zaW9uLCBoaWRlLCBzaG93LCBEcmFnQW5kRHJvcE9ic2VydmVyLCB0cmFja0ZvY3VzLCBhZGREaXNwb3NhYmxlTGlzdGVuZXIsIEV2ZW50VHlwZSwgY2xlYXJOb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyByZW5kZXJNYXJrZG93biwgcmVuZGVyQXNQbGFpbnRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvbWFya2Rvd25SZW5kZXJlci5qcyc7XG5pbXBvcnQgeyBpc01hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgSU9wZW5lclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9vcGVuZXIvY29tbW9uL29wZW5lci5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSwgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSwgSUV4dGVuc2lvbnNWaWV3UGFuZUNvbnRhaW5lciwgVklFV0xFVF9JRCwgQ2xvc2VFeHRlbnNpb25EZXRhaWxzT25WaWV3Q2hhbmdlS2V5LCBJTlNUQUxMX0VYVEVOU0lPTl9GUk9NX1ZTSVhfQ09NTUFORF9JRCwgV09SS1NQQUNFX1JFQ09NTUVOREFUSU9OU19WSUVXX0lELCBBdXRvQ2hlY2tVcGRhdGVzQ29uZmlndXJhdGlvbktleSwgT1VUREFURURfRVhURU5TSU9OU19WSUVXX0lELCBDT05URVhUX0hBU19HQUxMRVJZLCBleHRlbnNpb25zU2VhcmNoQWN0aW9uc01lbnUsIEF1dG9SZXN0YXJ0Q29uZmlndXJhdGlvbktleSwgRXh0ZW5zaW9uUnVudGltZUFjdGlvblR5cGUsIFNlYXJjaE1jcFNlcnZlcnNDb250ZXh0LCBTZWFyY2hBZ2VudFBsdWdpbnNDb250ZXh0LCBEZWZhdWx0Vmlld3NDb250ZXh0LCBDT05URVhUX0VYVEVOU0lPTlNfR0FMTEVSWV9TVEFUVVMgfSBmcm9tICcuLi9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJbnN0YWxsTG9jYWxFeHRlbnNpb25zSW5SZW1vdGVBY3Rpb24sIEluc3RhbGxSZW1vdGVFeHRlbnNpb25zSW5Mb2NhbEFjdGlvbiB9IGZyb20gJy4vZXh0ZW5zaW9uc0FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLCBJTG9jYWxFeHRlbnNpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25NYW5hZ2VtZW50L2NvbW1vbi9leHRlbnNpb25NYW5hZ2VtZW50LmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hFeHRlbnNpb25FbmFibGVtZW50U2VydmljZSwgSUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLCBJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlciB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbk1hbmFnZW1lbnQvY29tbW9uL2V4dGVuc2lvbk1hbmFnZW1lbnQuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uc0lucHV0IH0gZnJvbSAnLi4vY29tbW9uL2V4dGVuc2lvbnNJbnB1dC5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25zTGlzdFZpZXcsIEVuYWJsZWRFeHRlbnNpb25zVmlldywgRGlzYWJsZWRFeHRlbnNpb25zVmlldywgUmVjb21tZW5kZWRFeHRlbnNpb25zVmlldywgV29ya3NwYWNlUmVjb21tZW5kZWRFeHRlbnNpb25zVmlldywgU2VydmVySW5zdGFsbGVkRXh0ZW5zaW9uc1ZpZXcsIERlZmF1bHRSZWNvbW1lbmRlZEV4dGVuc2lvbnNWaWV3LCBVbnRydXN0ZWRXb3Jrc3BhY2VVbnN1cHBvcnRlZEV4dGVuc2lvbnNWaWV3LCBVbnRydXN0ZWRXb3Jrc3BhY2VQYXJ0aWFsbHlTdXBwb3J0ZWRFeHRlbnNpb25zVmlldywgVmlydHVhbFdvcmtzcGFjZVVuc3VwcG9ydGVkRXh0ZW5zaW9uc1ZpZXcsIFZpcnR1YWxXb3Jrc3BhY2VQYXJ0aWFsbHlTdXBwb3J0ZWRFeHRlbnNpb25zVmlldywgRGVmYXVsdFBvcHVsYXJFeHRlbnNpb25zVmlldywgRGVwcmVjYXRlZEV4dGVuc2lvbnNWaWV3LCBTZWFyY2hNYXJrZXRwbGFjZUV4dGVuc2lvbnNWaWV3LCBSZWNlbnRseVVwZGF0ZWRFeHRlbnNpb25zVmlldywgT3V0ZGF0ZWRFeHRlbnNpb25zVmlldywgU3RhdGljUXVlcnlFeHRlbnNpb25zVmlldywgTk9ORV9DQVRFR09SWSwgQWJzdHJhY3RFeHRlbnNpb25zTGlzdFZpZXcgfSBmcm9tICcuL2V4dGVuc2lvbnNWaWV3cy5qcyc7XG5pbXBvcnQgeyBJUHJvZ3Jlc3NTZXJ2aWNlLCBQcm9ncmVzc0xvY2F0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZ3Jlc3MvY29tbW9uL3Byb2dyZXNzLmpzJztcbmltcG9ydCB7IElFZGl0b3JHcm91cHNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JHcm91cHNTZXJ2aWNlLmpzJztcbmltcG9ydCBTZXZlcml0eSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zZXZlcml0eS5qcyc7XG5pbXBvcnQgeyBJQWN0aXZpdHlTZXJ2aWNlLCBJQmFkZ2UsIE51bWJlckJhZGdlLCBXYXJuaW5nQmFkZ2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9hY3Rpdml0eS9jb21tb24vYWN0aXZpdHkuanMnO1xuaW1wb3J0IHsgSVRoZW1lU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJVmlld3NSZWdpc3RyeSwgSVZpZXdEZXNjcmlwdG9yLCBFeHRlbnNpb25zLCBWaWV3Q29udGFpbmVyLCBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlLCBJQWRkZWRWaWV3RGVzY3JpcHRvclJlZiwgVmlld0NvbnRhaW5lckxvY2F0aW9uLCBJVmlld0NvbnRhaW5lcnNSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi92aWV3cy5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXlTZXJ2aWNlLCBDb250ZXh0S2V5RXhwciwgUmF3Q29udGV4dEtleSwgSUNvbnRleHRLZXkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElDb250ZXh0TWVudVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UsIElQcm9tcHRDaG9pY2UsIE5vdGlmaWNhdGlvblByaW9yaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgSUhvc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvaG9zdC9icm93c2VyL2hvc3QuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaExheW91dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9sYXlvdXQvYnJvd3Nlci9sYXlvdXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFZpZXdQYW5lQ29udGFpbmVyIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9wYXJ0cy92aWV3cy92aWV3UGFuZUNvbnRhaW5lci5qcyc7XG5pbXBvcnQgeyBWaWV3UGFuZSB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvcGFydHMvdmlld3Mvdmlld1BhbmUuanMnO1xuaW1wb3J0IHsgUXVlcnkgfSBmcm9tICcuLi9jb21tb24vZXh0ZW5zaW9uUXVlcnkuanMnO1xuaW1wb3J0IHsgU3VnZ2VzdEVuYWJsZWRJbnB1dCB9IGZyb20gJy4uLy4uL2NvZGVFZGl0b3IvYnJvd3Nlci9zdWdnZXN0RW5hYmxlZElucHV0L3N1Z2dlc3RFbmFibGVkSW5wdXQuanMnO1xuaW1wb3J0IHsgYWxlcnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYXJpYS9hcmlhLmpzJztcbmltcG9ydCB7IEVYVEVOU0lPTl9DQVRFR09SSUVTIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlZ2lzdHJ5L2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBJTGFiZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGFiZWwvY29tbW9uL2xhYmVsLmpzJztcbmltcG9ydCB7IFN5bmNEZXNjcmlwdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vZGVzY3JpcHRvcnMuanMnO1xuaW1wb3J0IHsgSVByZWZlcmVuY2VzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3ByZWZlcmVuY2VzL2NvbW1vbi9wcmVmZXJlbmNlcy5qcyc7XG5pbXBvcnQgeyBTSURFX0JBUl9EUkFHX0FORF9EUk9QX0JBQ0tHUk9VTkQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdGhlbWUuanMnO1xuaW1wb3J0IHsgVmlydHVhbFdvcmtzcGFjZUNvbnRleHQsIFdvcmtiZW5jaFN0YXRlQ29udGV4dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250ZXh0a2V5cy5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgaW5zdGFsbExvY2FsSW5SZW1vdGVJY29uIH0gZnJvbSAnLi9leHRlbnNpb25zSWNvbnMuanMnO1xuaW1wb3J0IHsgcmVnaXN0ZXJBY3Rpb24yLCBBY3Rpb24yLCBNZW51SWQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElQYW5lQ29tcG9zaXRlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3BhbmVjb21wb3NpdGUuanMnO1xuaW1wb3J0IHsgSVBhbmVDb21wb3NpdGVQYXJ0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3BhbmVjb21wb3NpdGUvYnJvd3Nlci9wYW5lY29tcG9zaXRlLmpzJztcbmltcG9ydCB7IGNvYWxlc2NlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IGV4dHJhY3RFZGl0b3JzQW5kRmlsZXNEcm9wRGF0YSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RuZC9icm93c2VyL2RuZC5qcyc7XG5pbXBvcnQgeyBleHRuYW1lIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IElMb2NhbGl6ZWRTdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb24vY29tbW9uL2FjdGlvbi5qcyc7XG5pbXBvcnQgeyByZWdpc3Rlck5hdmlnYWJsZUNvbnRhaW5lciB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvYWN0aW9ucy93aWRnZXROYXZpZ2F0aW9uQ29tbWFuZHMuanMnO1xuaW1wb3J0IHsgTWVudVdvcmtiZW5jaFRvb2xCYXIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2Jyb3dzZXIvdG9vbGJhci5qcyc7XG5pbXBvcnQgeyBjcmVhdGVBY3Rpb25WaWV3SXRlbSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvYnJvd3Nlci9tZW51RW50cnlBY3Rpb25WaWV3SXRlbS5qcyc7XG5pbXBvcnQgeyBTZXZlcml0eUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvc2V2ZXJpdHlJY29uL3NldmVyaXR5SWNvbi5qcyc7XG5pbXBvcnQgeyBTdGFuZGFyZEtleWJvYXJkRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIva2V5Ym9hcmRFdmVudC5qcyc7XG5pbXBvcnQgeyBLZXlDb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdCwgSUV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdFNlcnZpY2UsIEV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdFN0YXR1cyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbk1hbmFnZW1lbnQvY29tbW9uL2V4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdC5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgREVGQVVMVF9BQ0NPVU5UX1NJR05fSU5fQ09NTUFORCB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2FjY291bnRzL2Jyb3dzZXIvZGVmYXVsdEFjY291bnQuanMnO1xuXG5leHBvcnQgY29uc3QgRXh0ZW5zaW9uc1NvcnRCeUNvbnRleHQgPSBuZXcgUmF3Q29udGV4dEtleTxzdHJpbmc+KCdleHRlbnNpb25zU29ydEJ5VmFsdWUnLCAnJyk7XG5leHBvcnQgY29uc3QgU2VhcmNoTWFya2V0cGxhY2VFeHRlbnNpb25zQ29udGV4dCA9IG5ldyBSYXdDb250ZXh0S2V5PGJvb2xlYW4+KCdzZWFyY2hNYXJrZXRwbGFjZUV4dGVuc2lvbnMnLCBmYWxzZSk7XG5leHBvcnQgY29uc3QgU2VhcmNoSGFzVGV4dENvbnRleHQgPSBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPignZXh0ZW5zaW9uU2VhcmNoSGFzVGV4dCcsIGZhbHNlKTtcbmNvbnN0IEluc3RhbGxlZEV4dGVuc2lvbnNDb250ZXh0ID0gbmV3IFJhd0NvbnRleHRLZXk8Ym9vbGVhbj4oJ2luc3RhbGxlZEV4dGVuc2lvbnMnLCBmYWxzZSk7XG5jb25zdCBTZWFyY2hJbnN0YWxsZWRFeHRlbnNpb25zQ29udGV4dCA9IG5ldyBSYXdDb250ZXh0S2V5PGJvb2xlYW4+KCdzZWFyY2hJbnN0YWxsZWRFeHRlbnNpb25zJywgZmFsc2UpO1xuY29uc3QgU2VhcmNoUmVjZW50bHlVcGRhdGVkRXh0ZW5zaW9uc0NvbnRleHQgPSBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPignc2VhcmNoUmVjZW50bHlVcGRhdGVkRXh0ZW5zaW9ucycsIGZhbHNlKTtcbmNvbnN0IFNlYXJjaEV4dGVuc2lvblVwZGF0ZXNDb250ZXh0ID0gbmV3IFJhd0NvbnRleHRLZXk8Ym9vbGVhbj4oJ3NlYXJjaEV4dGVuc2lvblVwZGF0ZXMnLCBmYWxzZSk7XG5jb25zdCBTZWFyY2hPdXRkYXRlZEV4dGVuc2lvbnNDb250ZXh0ID0gbmV3IFJhd0NvbnRleHRLZXk8Ym9vbGVhbj4oJ3NlYXJjaE91dGRhdGVkRXh0ZW5zaW9ucycsIGZhbHNlKTtcbmNvbnN0IFNlYXJjaEVuYWJsZWRFeHRlbnNpb25zQ29udGV4dCA9IG5ldyBSYXdDb250ZXh0S2V5PGJvb2xlYW4+KCdzZWFyY2hFbmFibGVkRXh0ZW5zaW9ucycsIGZhbHNlKTtcbmNvbnN0IFNlYXJjaERpc2FibGVkRXh0ZW5zaW9uc0NvbnRleHQgPSBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPignc2VhcmNoRGlzYWJsZWRFeHRlbnNpb25zJywgZmFsc2UpO1xuY29uc3QgSGFzSW5zdGFsbGVkRXh0ZW5zaW9uc0NvbnRleHQgPSBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPignaGFzSW5zdGFsbGVkRXh0ZW5zaW9ucycsIHRydWUpO1xuZXhwb3J0IGNvbnN0IEJ1aWx0SW5FeHRlbnNpb25zQ29udGV4dCA9IG5ldyBSYXdDb250ZXh0S2V5PGJvb2xlYW4+KCdidWlsdEluRXh0ZW5zaW9ucycsIGZhbHNlKTtcbmNvbnN0IFNlYXJjaEJ1aWx0SW5FeHRlbnNpb25zQ29udGV4dCA9IG5ldyBSYXdDb250ZXh0S2V5PGJvb2xlYW4+KCdzZWFyY2hCdWlsdEluRXh0ZW5zaW9ucycsIGZhbHNlKTtcbmNvbnN0IFNlYXJjaFVuc3VwcG9ydGVkV29ya3NwYWNlRXh0ZW5zaW9uc0NvbnRleHQgPSBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPignc2VhcmNoVW5zdXBwb3J0ZWRXb3Jrc3BhY2VFeHRlbnNpb25zJywgZmFsc2UpO1xuY29uc3QgU2VhcmNoRGVwcmVjYXRlZEV4dGVuc2lvbnNDb250ZXh0ID0gbmV3IFJhd0NvbnRleHRLZXk8Ym9vbGVhbj4oJ3NlYXJjaERlcHJlY2F0ZWRFeHRlbnNpb25zJywgZmFsc2UpO1xuY29uc3QgU2VhcmNoUmVzdGFydFJlcXVpcmVkRXh0ZW5zaW9uc0NvbnRleHQgPSBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPignc2VhcmNoUmVzdGFydFJlcXVpcmVkRXh0ZW5zaW9ucycsIGZhbHNlKTtcbmV4cG9ydCBjb25zdCBSZWNvbW1lbmRlZEV4dGVuc2lvbnNDb250ZXh0ID0gbmV3IFJhd0NvbnRleHRLZXk8Ym9vbGVhbj4oJ3JlY29tbWVuZGVkRXh0ZW5zaW9ucycsIGZhbHNlKTtcbmNvbnN0IFNvcnRCeVVwZGF0ZURhdGVDb250ZXh0ID0gbmV3IFJhd0NvbnRleHRLZXk8Ym9vbGVhbj4oJ3NvcnRCeVVwZGF0ZURhdGUnLCBmYWxzZSk7XG5leHBvcnQgY29uc3QgRXh0ZW5zaW9uc1NlYXJjaFZhbHVlQ29udGV4dCA9IG5ldyBSYXdDb250ZXh0S2V5PHN0cmluZz4oJ2V4dGVuc2lvbnNTZWFyY2hWYWx1ZScsICcnKTtcblxuY29uc3QgUkVNT1RFX0NBVEVHT1JZOiBJTG9jYWxpemVkU3RyaW5nID0gbG9jYWxpemUyKHsga2V5OiAncmVtb3RlJywgY29tbWVudDogWydSZW1vdGUgYXMgaW4gcmVtb3RlIG1hY2hpbmUnXSB9LCBcIlJlbW90ZVwiKTtcblxuaW50ZXJmYWNlIElFeHRlbnNpb25zVmlld2xldFN0YXRlIHtcblx0J3F1ZXJ5LnZhbHVlJz86IHN0cmluZztcbn1cblxuZXhwb3J0IGNsYXNzIEV4dGVuc2lvbnNWaWV3bGV0Vmlld3NDb250cmlidXRpb24gZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBjb250YWluZXI6IFZpZXdDb250YWluZXI7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlOiBJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UsXG5cdFx0QElMYWJlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYWJlbFNlcnZpY2U6IElMYWJlbFNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuY29udGFpbmVyID0gUmVnaXN0cnkuYXM8SVZpZXdDb250YWluZXJzUmVnaXN0cnk+KEV4dGVuc2lvbnMuVmlld0NvbnRhaW5lcnNSZWdpc3RyeSkuZ2V0KFZJRVdMRVRfSUQpITtcblx0XHR0aGlzLnJlZ2lzdGVyVmlld3MoKTtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJWaWV3cygpOiB2b2lkIHtcblx0XHRjb25zdCB2aWV3RGVzY3JpcHRvcnM6IElWaWV3RGVzY3JpcHRvcltdID0gW107XG5cblx0XHQvKiBEZWZhdWx0IHZpZXdzICovXG5cdFx0dmlld0Rlc2NyaXB0b3JzLnB1c2goLi4udGhpcy5jcmVhdGVEZWZhdWx0RXh0ZW5zaW9uc1ZpZXdEZXNjcmlwdG9ycygpKTtcblxuXHRcdC8qIFNlYXJjaCB2aWV3cyAqL1xuXHRcdHZpZXdEZXNjcmlwdG9ycy5wdXNoKC4uLnRoaXMuY3JlYXRlU2VhcmNoRXh0ZW5zaW9uc1ZpZXdEZXNjcmlwdG9ycygpKTtcblxuXHRcdC8qIFJlY29tbWVuZGF0aW9ucyB2aWV3cyAqL1xuXHRcdHZpZXdEZXNjcmlwdG9ycy5wdXNoKC4uLnRoaXMuY3JlYXRlUmVjb21tZW5kZWRFeHRlbnNpb25zVmlld0Rlc2NyaXB0b3JzKCkpO1xuXG5cdFx0LyogQnVpbHQtaW4gZXh0ZW5zaW9ucyB2aWV3cyAqL1xuXHRcdHZpZXdEZXNjcmlwdG9ycy5wdXNoKC4uLnRoaXMuY3JlYXRlQnVpbHRpbkV4dGVuc2lvbnNWaWV3RGVzY3JpcHRvcnMoKSk7XG5cblx0XHQvKiBUcnVzdCBSZXF1aXJlZCBleHRlbnNpb25zIHZpZXdzICovXG5cdFx0dmlld0Rlc2NyaXB0b3JzLnB1c2goLi4udGhpcy5jcmVhdGVVbnN1cHBvcnRlZFdvcmtzcGFjZUV4dGVuc2lvbnNWaWV3RGVzY3JpcHRvcnMoKSk7XG5cblx0XHQvKiBPdGhlciBMb2NhbCBGaWx0ZXJlZCBleHRlbnNpb25zIHZpZXdzICovXG5cdFx0dmlld0Rlc2NyaXB0b3JzLnB1c2goLi4udGhpcy5jcmVhdGVPdGhlckxvY2FsRmlsdGVyZWRFeHRlbnNpb25zVmlld0Rlc2NyaXB0b3JzKCkpO1xuXG5cblx0XHR2aWV3RGVzY3JpcHRvcnMucHVzaCh7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC52aWV3cy5leHRlbnNpb25zLm1hcmtldHBsYWNlQWNjZXNzJyxcblx0XHRcdG5hbWU6IGxvY2FsaXplMignbWFya2V0UGxhY2UnLCBcIk1hcmtldHBsYWNlXCIpLFxuXHRcdFx0Y3RvckRlc2NyaXB0b3I6IG5ldyBTeW5jRGVzY3JpcHRvcihjbGFzcyBleHRlbmRzIFZpZXdQYW5lIHtcblx0XHRcdFx0cHVibGljIG92ZXJyaWRlIHNob3VsZFNob3dXZWxjb21lKCkge1xuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSxcblx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0Q29udGV4dEtleUV4cHIub3IoXG5cdFx0XHRcdFx0Q29udGV4dEtleUV4cHIuaGFzKCdzZWFyY2hNYXJrZXRwbGFjZUV4dGVuc2lvbnMnKSwgQ29udGV4dEtleUV4cHIuYW5kKERlZmF1bHRWaWV3c0NvbnRleHQpXG5cdFx0XHRcdCksXG5cdFx0XHRcdENvbnRleHRLZXlFeHByLm9yKENPTlRFWFRfRVhURU5TSU9OU19HQUxMRVJZX1NUQVRVUy5pc0VxdWFsVG8oRXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0U3RhdHVzLlJlcXVpcmVzU2lnbkluKSwgQ09OVEVYVF9FWFRFTlNJT05TX0dBTExFUllfU1RBVFVTLmlzRXF1YWxUbyhFeHRlbnNpb25HYWxsZXJ5TWFuaWZlc3RTdGF0dXMuQWNjZXNzRGVuaWVkKSlcblx0XHRcdCksXG5cdFx0XHRvcmRlcjogLTEsXG5cdFx0fSk7XG5cblx0XHRjb25zdCB2aWV3UmVnaXN0cnkgPSBSZWdpc3RyeS5hczxJVmlld3NSZWdpc3RyeT4oRXh0ZW5zaW9ucy5WaWV3c1JlZ2lzdHJ5KTtcblx0XHR2aWV3UmVnaXN0cnkucmVnaXN0ZXJWaWV3cyh2aWV3RGVzY3JpcHRvcnMsIHRoaXMuY29udGFpbmVyKTtcblxuXHRcdHZpZXdSZWdpc3RyeS5yZWdpc3RlclZpZXdXZWxjb21lQ29udGVudCgnd29ya2JlbmNoLnZpZXdzLmV4dGVuc2lvbnMubWFya2V0cGxhY2VBY2Nlc3MnLCB7XG5cdFx0XHRjb250ZW50OiBsb2NhbGl6ZSgnc2lnbiBpbicsIFwiW1NpZ24gaW4gdG8gYWNjZXNzIEV4dGVuc2lvbnMgTWFya2V0cGxhY2VdKHswfSlcIiwgYGNvbW1hbmQ6JHtERUZBVUxUX0FDQ09VTlRfU0lHTl9JTl9DT01NQU5EfWApLFxuXHRcdFx0d2hlbjogQ09OVEVYVF9FWFRFTlNJT05TX0dBTExFUllfU1RBVFVTLmlzRXF1YWxUbyhFeHRlbnNpb25HYWxsZXJ5TWFuaWZlc3RTdGF0dXMuUmVxdWlyZXNTaWduSW4pXG5cdFx0fSk7XG5cblx0XHR2aWV3UmVnaXN0cnkucmVnaXN0ZXJWaWV3V2VsY29tZUNvbnRlbnQoJ3dvcmtiZW5jaC52aWV3cy5leHRlbnNpb25zLm1hcmtldHBsYWNlQWNjZXNzJywge1xuXHRcdFx0Y29udGVudDogbG9jYWxpemUoJ2FjY2VzcyBkZW5pZWQnLCBcIllvdXIgYWNjb3VudCBkb2VzIG5vdCBoYXZlIGFjY2VzcyB0byB0aGUgRXh0ZW5zaW9ucyBNYXJrZXRwbGFjZS4gUGxlYXNlIGNvbnRhY3QgeW91ciBhZG1pbmlzdHJhdG9yLlwiKSxcblx0XHRcdHdoZW46IENPTlRFWFRfRVhURU5TSU9OU19HQUxMRVJZX1NUQVRVUy5pc0VxdWFsVG8oRXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0U3RhdHVzLkFjY2Vzc0RlbmllZClcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlRGVmYXVsdEV4dGVuc2lvbnNWaWV3RGVzY3JpcHRvcnMoKTogSVZpZXdEZXNjcmlwdG9yW10ge1xuXHRcdGNvbnN0IHZpZXdEZXNjcmlwdG9yczogSVZpZXdEZXNjcmlwdG9yW10gPSBbXTtcblxuXHRcdC8qXG5cdFx0ICogRGVmYXVsdCBpbnN0YWxsZWQgZXh0ZW5zaW9ucyB2aWV3cyAtIFNob3dzIGFsbCB1c2VyIGluc3RhbGxlZCBleHRlbnNpb25zLlxuXHRcdCAqL1xuXHRcdGNvbnN0IHNlcnZlcnM6IElFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyW10gPSBbXTtcblx0XHRpZiAodGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS5sb2NhbEV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIpIHtcblx0XHRcdHNlcnZlcnMucHVzaCh0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLmxvY2FsRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlcik7XG5cdFx0fVxuXHRcdGlmICh0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLnJlbW90ZUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIpIHtcblx0XHRcdHNlcnZlcnMucHVzaCh0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLnJlbW90ZUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIpO1xuXHRcdH1cblx0XHRpZiAodGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS53ZWJFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyKSB7XG5cdFx0XHRzZXJ2ZXJzLnB1c2godGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS53ZWJFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyKTtcblx0XHR9XG5cdFx0Y29uc3QgZ2V0Vmlld05hbWUgPSAodmlld1RpdGxlOiBzdHJpbmcsIHNlcnZlcjogSUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIpOiBzdHJpbmcgPT4ge1xuXHRcdFx0cmV0dXJuIHNlcnZlcnMubGVuZ3RoID4gMSA/IGAke3NlcnZlci5sYWJlbH0gLSAke3ZpZXdUaXRsZX1gIDogdmlld1RpdGxlO1xuXHRcdH07XG5cdFx0bGV0IGluc3RhbGxlZFdlYkV4dGVuc2lvbnNDb250ZXh0Q2hhbmdlRXZlbnQgPSBFdmVudC5Ob25lO1xuXHRcdGlmICh0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLndlYkV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIgJiYgdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS5yZW1vdGVFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyKSB7XG5cdFx0XHRjb25zdCBpbnRlcmVzdGluZ0NvbnRleHRLZXlzID0gbmV3IFNldCgpO1xuXHRcdFx0aW50ZXJlc3RpbmdDb250ZXh0S2V5cy5hZGQoJ2hhc0luc3RhbGxlZFdlYkV4dGVuc2lvbnMnKTtcblx0XHRcdGluc3RhbGxlZFdlYkV4dGVuc2lvbnNDb250ZXh0Q2hhbmdlRXZlbnQgPSBFdmVudC5maWx0ZXIodGhpcy5jb250ZXh0S2V5U2VydmljZS5vbkRpZENoYW5nZUNvbnRleHQsIGUgPT4gZS5hZmZlY3RzU29tZShpbnRlcmVzdGluZ0NvbnRleHRLZXlzKSk7XG5cdFx0fVxuXHRcdGNvbnN0IHNlcnZlckxhYmVsQ2hhbmdlRXZlbnQgPSBFdmVudC5hbnkodGhpcy5sYWJlbFNlcnZpY2Uub25EaWRDaGFuZ2VGb3JtYXR0ZXJzLCBpbnN0YWxsZWRXZWJFeHRlbnNpb25zQ29udGV4dENoYW5nZUV2ZW50KTtcblx0XHRmb3IgKGNvbnN0IHNlcnZlciBvZiBzZXJ2ZXJzKSB7XG5cdFx0XHRjb25zdCBnZXRJbnN0YWxsZWRWaWV3TmFtZSA9ICgpOiBzdHJpbmcgPT4gZ2V0Vmlld05hbWUobG9jYWxpemUoJ2luc3RhbGxlZCcsIFwiSW5zdGFsbGVkXCIpLCBzZXJ2ZXIpO1xuXHRcdFx0Y29uc3Qgb25EaWRDaGFuZ2VUaXRsZSA9IEV2ZW50Lm1hcDx2b2lkLCBzdHJpbmc+KHNlcnZlckxhYmVsQ2hhbmdlRXZlbnQsICgpID0+IGdldEluc3RhbGxlZFZpZXdOYW1lKCkpO1xuXHRcdFx0Y29uc3QgaWQgPSBzZXJ2ZXJzLmxlbmd0aCA+IDEgPyBgd29ya2JlbmNoLnZpZXdzLmV4dGVuc2lvbnMuJHtzZXJ2ZXIuaWR9Lmluc3RhbGxlZGAgOiBgd29ya2JlbmNoLnZpZXdzLmV4dGVuc2lvbnMuaW5zdGFsbGVkYDtcblx0XHRcdC8qIEluc3RhbGxlZCBleHRlbnNpb25zIHZpZXcgKi9cblx0XHRcdHZpZXdEZXNjcmlwdG9ycy5wdXNoKHtcblx0XHRcdFx0aWQsXG5cdFx0XHRcdGdldCBuYW1lKCkge1xuXHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHR2YWx1ZTogZ2V0SW5zdGFsbGVkVmlld05hbWUoKSxcblx0XHRcdFx0XHRcdG9yaWdpbmFsOiBnZXRWaWV3TmFtZSgnSW5zdGFsbGVkJywgc2VydmVyKVxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHdlaWdodDogMTAwLFxuXHRcdFx0XHRvcmRlcjogMSxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKERlZmF1bHRWaWV3c0NvbnRleHQpLFxuXHRcdFx0XHRjdG9yRGVzY3JpcHRvcjogbmV3IFN5bmNEZXNjcmlwdG9yKFNlcnZlckluc3RhbGxlZEV4dGVuc2lvbnNWaWV3LCBbeyBzZXJ2ZXIsIGZsZXhpYmxlSGVpZ2h0OiB0cnVlLCBvbkRpZENoYW5nZVRpdGxlIH1dKSxcblx0XHRcdFx0LyogSW5zdGFsbGVkIGV4dGVuc2lvbnMgdmlld3Mgc2hhbGwgbm90IGJlIGFsbG93ZWQgdG8gaGlkZGVuIHdoZW4gdGhlcmUgYXJlIG1vcmUgdGhhbiBvbmUgc2VydmVyICovXG5cdFx0XHRcdGNhblRvZ2dsZVZpc2liaWxpdHk6IHNlcnZlcnMubGVuZ3RoID09PSAxXG5cdFx0XHR9KTtcblxuXHRcdFx0aWYgKHNlcnZlciA9PT0gdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS5yZW1vdGVFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyICYmIHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UubG9jYWxFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyKSB7XG5cdFx0XHRcdHRoaXMuX3JlZ2lzdGVyKHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBJbnN0YWxsTG9jYWxFeHRlbnNpb25zSW5SZW1vdGVBY3Rpb24yIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0XHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0XHRcdGlkOiAnd29ya2JlbmNoLmV4dGVuc2lvbnMuaW5zdGFsbExvY2FsRXh0ZW5zaW9ucycsXG5cdFx0XHRcdFx0XHRcdGdldCB0aXRsZSgpIHtcblx0XHRcdFx0XHRcdFx0XHRyZXR1cm4gbG9jYWxpemUyKCdzZWxlY3QgYW5kIGluc3RhbGwgbG9jYWwgZXh0ZW5zaW9ucycsIFwiSW5zdGFsbCBMb2NhbCBFeHRlbnNpb25zIGluICd7MH0nLi4uXCIsIHNlcnZlci5sYWJlbCk7XG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdGNhdGVnb3J5OiBSRU1PVEVfQ0FURUdPUlksXG5cdFx0XHRcdFx0XHRcdGljb246IGluc3RhbGxMb2NhbEluUmVtb3RlSWNvbixcblx0XHRcdFx0XHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRcdFx0XHRcdG1lbnU6IHtcblx0XHRcdFx0XHRcdFx0XHRpZDogTWVudUlkLlZpZXdUaXRsZSxcblx0XHRcdFx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5lcXVhbHMoJ3ZpZXcnLCBpZCksXG5cdFx0XHRcdFx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0XHRcdFx0cmV0dXJuIGFjY2Vzc29yLmdldChJSW5zdGFudGlhdGlvblNlcnZpY2UpLmNyZWF0ZUluc3RhbmNlKEluc3RhbGxMb2NhbEV4dGVuc2lvbnNJblJlbW90ZUFjdGlvbikucnVuKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UubG9jYWxFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyICYmIHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UucmVtb3RlRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlcikge1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIocmVnaXN0ZXJBY3Rpb24yKGNsYXNzIEluc3RhbGxSZW1vdGVFeHRlbnNpb25zSW5Mb2NhbEFjdGlvbjIgZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRcdFx0aWQ6ICd3b3JrYmVuY2guZXh0ZW5zaW9ucy5hY3Rpb25zLmluc3RhbGxMb2NhbEV4dGVuc2lvbnNJblJlbW90ZScsXG5cdFx0XHRcdFx0XHR0aXRsZTogbG9jYWxpemUyKCdpbnN0YWxsIHJlbW90ZSBpbiBsb2NhbCcsICdJbnN0YWxsIFJlbW90ZSBFeHRlbnNpb25zIExvY2FsbHkuLi4nKSxcblx0XHRcdFx0XHRcdGNhdGVnb3J5OiBSRU1PVEVfQ0FURUdPUlksXG5cdFx0XHRcdFx0XHRmMTogdHJ1ZVxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0XHRcdHJldHVybiBhY2Nlc3Nvci5nZXQoSUluc3RhbnRpYXRpb25TZXJ2aWNlKS5jcmVhdGVJbnN0YW5jZShJbnN0YWxsUmVtb3RlRXh0ZW5zaW9uc0luTG9jYWxBY3Rpb24sICd3b3JrYmVuY2guZXh0ZW5zaW9ucy5hY3Rpb25zLmluc3RhbGxMb2NhbEV4dGVuc2lvbnNJblJlbW90ZScpLnJ1bigpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fVxuXG5cdFx0Lypcblx0XHQgKiBEZWZhdWx0IHBvcHVsYXIgZXh0ZW5zaW9ucyB2aWV3XG5cdFx0ICogU2VwYXJhdGUgdmlldyBmb3IgcG9wdWxhciBleHRlbnNpb25zIHJlcXVpcmVkIGFzIHdlIG5lZWQgdG8gc2hvdyBwb3B1bGFyIGFuZCByZWNvbW1lbmRlZCBzZWN0aW9uc1xuXHRcdCAqIGluIHRoZSBkZWZhdWx0IHZpZXcgd2hlbiB0aGVyZSBpcyBubyBzZWFyY2ggdGV4dCwgYW5kIHVzZXIgaGFzIG5vIGluc3RhbGxlZCBleHRlbnNpb25zLlxuXHRcdCAqL1xuXHRcdHZpZXdEZXNjcmlwdG9ycy5wdXNoKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLnZpZXdzLmV4dGVuc2lvbnMucG9wdWxhcicsXG5cdFx0XHRuYW1lOiBsb2NhbGl6ZTIoJ3BvcHVsYXJFeHRlbnNpb25zJywgXCJQb3B1bGFyXCIpLFxuXHRcdFx0Y3RvckRlc2NyaXB0b3I6IG5ldyBTeW5jRGVzY3JpcHRvcihEZWZhdWx0UG9wdWxhckV4dGVuc2lvbnNWaWV3LCBbeyBoaWRlQmFkZ2U6IHRydWUgfV0pLFxuXHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKERlZmF1bHRWaWV3c0NvbnRleHQsIENvbnRleHRLZXlFeHByLm5vdCgnaGFzSW5zdGFsbGVkRXh0ZW5zaW9ucycpLCBDT05URVhUX0hBU19HQUxMRVJZKSxcblx0XHRcdHdlaWdodDogNjAsXG5cdFx0XHRvcmRlcjogMixcblx0XHRcdGNhblRvZ2dsZVZpc2liaWxpdHk6IGZhbHNlXG5cdFx0fSk7XG5cblx0XHQvKlxuXHRcdCAqIERlZmF1bHQgcmVjb21tZW5kZWQgZXh0ZW5zaW9ucyB2aWV3XG5cdFx0ICogV2hlbiB1c2VyIGhhcyBpbnN0YWxsZWQgZXh0ZW5zaW9ucywgdGhpcyBpcyBzaG93biBhbG9uZyB3aXRoIHRoZSB2aWV3cyBmb3IgZW5hYmxlZCAmIGRpc2FibGVkIGV4dGVuc2lvbnNcblx0XHQgKiBXaGVuIHVzZXIgaGFzIG5vIGluc3RhbGxlZCBleHRlbnNpb25zLCB0aGlzIGlzIHNob3duIGFsb25nIHdpdGggdGhlIHZpZXcgZm9yIHBvcHVsYXIgZXh0ZW5zaW9uc1xuXHRcdCAqL1xuXHRcdHZpZXdEZXNjcmlwdG9ycy5wdXNoKHtcblx0XHRcdGlkOiAnZXh0ZW5zaW9ucy5yZWNvbW1lbmRlZExpc3QnLFxuXHRcdFx0bmFtZTogbG9jYWxpemUyKCdyZWNvbW1lbmRlZEV4dGVuc2lvbnMnLCBcIlJlY29tbWVuZGVkXCIpLFxuXHRcdFx0Y3RvckRlc2NyaXB0b3I6IG5ldyBTeW5jRGVzY3JpcHRvcihEZWZhdWx0UmVjb21tZW5kZWRFeHRlbnNpb25zVmlldywgW3sgZmxleGlibGVIZWlnaHQ6IHRydWUgfV0pLFxuXHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKERlZmF1bHRWaWV3c0NvbnRleHQsIFNvcnRCeVVwZGF0ZURhdGVDb250ZXh0Lm5lZ2F0ZSgpLCBDb250ZXh0S2V5RXhwci5ub3QoJ2NvbmZpZy5leHRlbnNpb25zLnNob3dSZWNvbW1lbmRhdGlvbnNPbmx5T25EZW1hbmQnKSwgQ09OVEVYVF9IQVNfR0FMTEVSWSksXG5cdFx0XHR3ZWlnaHQ6IDQwLFxuXHRcdFx0b3JkZXI6IDMsXG5cdFx0XHRjYW5Ub2dnbGVWaXNpYmlsaXR5OiB0cnVlXG5cdFx0fSk7XG5cblx0XHQvKiBJbnN0YWxsZWQgdmlld3Mgc2hhbGwgYmUgZGVmYXVsdCBpbiBtdWx0aSBzZXJ2ZXIgd2luZG93ICAqL1xuXHRcdGlmIChzZXJ2ZXJzLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0Lypcblx0XHRcdCAqIERlZmF1bHQgZW5hYmxlZCBleHRlbnNpb25zIHZpZXcgLSBTaG93cyBhbGwgdXNlciBpbnN0YWxsZWQgZW5hYmxlZCBleHRlbnNpb25zLlxuXHRcdFx0ICogSGlkZGVuIGJ5IGRlZmF1bHRcblx0XHRcdCAqL1xuXHRcdFx0dmlld0Rlc2NyaXB0b3JzLnB1c2goe1xuXHRcdFx0XHRpZDogJ3dvcmtiZW5jaC52aWV3cy5leHRlbnNpb25zLmVuYWJsZWQnLFxuXHRcdFx0XHRuYW1lOiBsb2NhbGl6ZTIoJ2VuYWJsZWRFeHRlbnNpb25zJywgXCJFbmFibGVkXCIpLFxuXHRcdFx0XHRjdG9yRGVzY3JpcHRvcjogbmV3IFN5bmNEZXNjcmlwdG9yKEVuYWJsZWRFeHRlbnNpb25zVmlldywgW3t9XSksXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChEZWZhdWx0Vmlld3NDb250ZXh0LCBDb250ZXh0S2V5RXhwci5oYXMoJ2hhc0luc3RhbGxlZEV4dGVuc2lvbnMnKSksXG5cdFx0XHRcdGhpZGVCeURlZmF1bHQ6IHRydWUsXG5cdFx0XHRcdHdlaWdodDogNDAsXG5cdFx0XHRcdG9yZGVyOiA0LFxuXHRcdFx0XHRjYW5Ub2dnbGVWaXNpYmlsaXR5OiB0cnVlXG5cdFx0XHR9KTtcblxuXHRcdFx0Lypcblx0XHRcdCAqIERlZmF1bHQgZGlzYWJsZWQgZXh0ZW5zaW9ucyB2aWV3IC0gU2hvd3MgYWxsIGRpc2FibGVkIGV4dGVuc2lvbnMuXG5cdFx0XHQgKiBIaWRkZW4gYnkgZGVmYXVsdFxuXHRcdFx0ICovXG5cdFx0XHR2aWV3RGVzY3JpcHRvcnMucHVzaCh7XG5cdFx0XHRcdGlkOiAnd29ya2JlbmNoLnZpZXdzLmV4dGVuc2lvbnMuZGlzYWJsZWQnLFxuXHRcdFx0XHRuYW1lOiBsb2NhbGl6ZTIoJ2Rpc2FibGVkRXh0ZW5zaW9ucycsIFwiRGlzYWJsZWRcIiksXG5cdFx0XHRcdGN0b3JEZXNjcmlwdG9yOiBuZXcgU3luY0Rlc2NyaXB0b3IoRGlzYWJsZWRFeHRlbnNpb25zVmlldywgW3t9XSksXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChEZWZhdWx0Vmlld3NDb250ZXh0LCBDb250ZXh0S2V5RXhwci5oYXMoJ2hhc0luc3RhbGxlZEV4dGVuc2lvbnMnKSksXG5cdFx0XHRcdGhpZGVCeURlZmF1bHQ6IHRydWUsXG5cdFx0XHRcdHdlaWdodDogMTAsXG5cdFx0XHRcdG9yZGVyOiA1LFxuXHRcdFx0XHRjYW5Ub2dnbGVWaXNpYmlsaXR5OiB0cnVlXG5cdFx0XHR9KTtcblxuXHRcdH1cblxuXHRcdHJldHVybiB2aWV3RGVzY3JpcHRvcnM7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZVNlYXJjaEV4dGVuc2lvbnNWaWV3RGVzY3JpcHRvcnMoKTogSVZpZXdEZXNjcmlwdG9yW10ge1xuXHRcdGNvbnN0IHZpZXdEZXNjcmlwdG9yczogSVZpZXdEZXNjcmlwdG9yW10gPSBbXTtcblxuXHRcdC8qXG5cdFx0ICogVmlldyB1c2VkIGZvciBzZWFyY2hpbmcgTWFya2V0cGxhY2Vcblx0XHQgKi9cblx0XHR2aWV3RGVzY3JpcHRvcnMucHVzaCh7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC52aWV3cy5leHRlbnNpb25zLm1hcmtldHBsYWNlJyxcblx0XHRcdG5hbWU6IGxvY2FsaXplMignbWFya2V0UGxhY2UnLCBcIk1hcmtldHBsYWNlXCIpLFxuXHRcdFx0Y3RvckRlc2NyaXB0b3I6IG5ldyBTeW5jRGVzY3JpcHRvcihTZWFyY2hNYXJrZXRwbGFjZUV4dGVuc2lvbnNWaWV3LCBbe31dKSxcblx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDb250ZXh0S2V5RXhwci5oYXMoJ3NlYXJjaE1hcmtldHBsYWNlRXh0ZW5zaW9ucycpLCBDT05URVhUX0hBU19HQUxMRVJZKVxuXHRcdH0pO1xuXG5cdFx0Lypcblx0XHQgKiBWaWV3IHVzZWQgZm9yIHNlYXJjaGluZyBhbGwgaW5zdGFsbGVkIGV4dGVuc2lvbnNcblx0XHQgKi9cblx0XHR2aWV3RGVzY3JpcHRvcnMucHVzaCh7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC52aWV3cy5leHRlbnNpb25zLnNlYXJjaEluc3RhbGxlZCcsXG5cdFx0XHRuYW1lOiBsb2NhbGl6ZTIoJ2luc3RhbGxlZCcsIFwiSW5zdGFsbGVkXCIpLFxuXHRcdFx0Y3RvckRlc2NyaXB0b3I6IG5ldyBTeW5jRGVzY3JpcHRvcihFeHRlbnNpb25zTGlzdFZpZXcsIFt7fV0pLFxuXHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIub3IoQ29udGV4dEtleUV4cHIuaGFzKCdzZWFyY2hJbnN0YWxsZWRFeHRlbnNpb25zJyksIENvbnRleHRLZXlFeHByLmhhcygnaW5zdGFsbGVkRXh0ZW5zaW9ucycpKSxcblx0XHR9KTtcblxuXHRcdC8qXG5cdFx0ICogVmlldyB1c2VkIGZvciBzZWFyY2hpbmcgcmVjZW50bHkgdXBkYXRlZCBleHRlbnNpb25zXG5cdFx0ICovXG5cdFx0dmlld0Rlc2NyaXB0b3JzLnB1c2goe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2gudmlld3MuZXh0ZW5zaW9ucy5zZWFyY2hSZWNlbnRseVVwZGF0ZWQnLFxuXHRcdFx0bmFtZTogbG9jYWxpemUyKCdyZWNlbnRseSB1cGRhdGVkJywgXCJSZWNlbnRseSBVcGRhdGVkXCIpLFxuXHRcdFx0Y3RvckRlc2NyaXB0b3I6IG5ldyBTeW5jRGVzY3JpcHRvcihSZWNlbnRseVVwZGF0ZWRFeHRlbnNpb25zVmlldywgW3t9XSksXG5cdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5vcihTZWFyY2hFeHRlbnNpb25VcGRhdGVzQ29udGV4dCwgQ29udGV4dEtleUV4cHIuaGFzKCdzZWFyY2hSZWNlbnRseVVwZGF0ZWRFeHRlbnNpb25zJykpLFxuXHRcdFx0b3JkZXI6IDIsXG5cdFx0fSk7XG5cblx0XHQvKlxuXHRcdCAqIFZpZXcgdXNlZCBmb3Igc2VhcmNoaW5nIGVuYWJsZWQgZXh0ZW5zaW9uc1xuXHRcdCAqL1xuXHRcdHZpZXdEZXNjcmlwdG9ycy5wdXNoKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLnZpZXdzLmV4dGVuc2lvbnMuc2VhcmNoRW5hYmxlZCcsXG5cdFx0XHRuYW1lOiBsb2NhbGl6ZTIoJ2VuYWJsZWQnLCBcIkVuYWJsZWRcIiksXG5cdFx0XHRjdG9yRGVzY3JpcHRvcjogbmV3IFN5bmNEZXNjcmlwdG9yKEV4dGVuc2lvbnNMaXN0VmlldywgW3t9XSksXG5cdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ29udGV4dEtleUV4cHIuaGFzKCdzZWFyY2hFbmFibGVkRXh0ZW5zaW9ucycpKSxcblx0XHR9KTtcblxuXHRcdC8qXG5cdFx0ICogVmlldyB1c2VkIGZvciBzZWFyY2hpbmcgZGlzYWJsZWQgZXh0ZW5zaW9uc1xuXHRcdCAqL1xuXHRcdHZpZXdEZXNjcmlwdG9ycy5wdXNoKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLnZpZXdzLmV4dGVuc2lvbnMuc2VhcmNoRGlzYWJsZWQnLFxuXHRcdFx0bmFtZTogbG9jYWxpemUyKCdkaXNhYmxlZCcsIFwiRGlzYWJsZWRcIiksXG5cdFx0XHRjdG9yRGVzY3JpcHRvcjogbmV3IFN5bmNEZXNjcmlwdG9yKEV4dGVuc2lvbnNMaXN0VmlldywgW3t9XSksXG5cdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ29udGV4dEtleUV4cHIuaGFzKCdzZWFyY2hEaXNhYmxlZEV4dGVuc2lvbnMnKSksXG5cdFx0fSk7XG5cblx0XHQvKlxuXHRcdCAqIFZpZXcgdXNlZCBmb3Igc2VhcmNoaW5nIG91dGRhdGVkIGV4dGVuc2lvbnNcblx0XHQgKi9cblx0XHR2aWV3RGVzY3JpcHRvcnMucHVzaCh7XG5cdFx0XHRpZDogT1VUREFURURfRVhURU5TSU9OU19WSUVXX0lELFxuXHRcdFx0bmFtZTogbG9jYWxpemUyKCdhdmFpbGFibGVVcGRhdGVzJywgXCJBdmFpbGFibGUgVXBkYXRlc1wiKSxcblx0XHRcdGN0b3JEZXNjcmlwdG9yOiBuZXcgU3luY0Rlc2NyaXB0b3IoT3V0ZGF0ZWRFeHRlbnNpb25zVmlldywgW3t9XSksXG5cdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5vcihTZWFyY2hFeHRlbnNpb25VcGRhdGVzQ29udGV4dCwgQ29udGV4dEtleUV4cHIuaGFzKCdzZWFyY2hPdXRkYXRlZEV4dGVuc2lvbnMnKSksXG5cdFx0XHRvcmRlcjogMSxcblx0XHR9KTtcblxuXHRcdC8qXG5cdFx0ICogVmlldyB1c2VkIGZvciBzZWFyY2hpbmcgYnVpbHRpbiBleHRlbnNpb25zXG5cdFx0ICovXG5cdFx0dmlld0Rlc2NyaXB0b3JzLnB1c2goe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2gudmlld3MuZXh0ZW5zaW9ucy5zZWFyY2hCdWlsdGluJyxcblx0XHRcdG5hbWU6IGxvY2FsaXplMignYnVpbHRpbicsIFwiQnVpbHRpblwiKSxcblx0XHRcdGN0b3JEZXNjcmlwdG9yOiBuZXcgU3luY0Rlc2NyaXB0b3IoRXh0ZW5zaW9uc0xpc3RWaWV3LCBbe31dKSxcblx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDb250ZXh0S2V5RXhwci5oYXMoJ3NlYXJjaEJ1aWx0SW5FeHRlbnNpb25zJykpLFxuXHRcdH0pO1xuXG5cdFx0Lypcblx0XHQgKiBWaWV3IHVzZWQgZm9yIHNlYXJjaGluZyB3b3Jrc3BhY2UgdW5zdXBwb3J0ZWQgZXh0ZW5zaW9uc1xuXHRcdCAqL1xuXHRcdHZpZXdEZXNjcmlwdG9ycy5wdXNoKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLnZpZXdzLmV4dGVuc2lvbnMuc2VhcmNoV29ya3NwYWNlVW5zdXBwb3J0ZWQnLFxuXHRcdFx0bmFtZTogbG9jYWxpemUyKCd3b3Jrc3BhY2VVbnN1cHBvcnRlZCcsIFwiV29ya3NwYWNlIFVuc3VwcG9ydGVkXCIpLFxuXHRcdFx0Y3RvckRlc2NyaXB0b3I6IG5ldyBTeW5jRGVzY3JpcHRvcihFeHRlbnNpb25zTGlzdFZpZXcsIFt7fV0pLFxuXHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENvbnRleHRLZXlFeHByLmhhcygnc2VhcmNoV29ya3NwYWNlVW5zdXBwb3J0ZWRFeHRlbnNpb25zJykpLFxuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIHZpZXdEZXNjcmlwdG9ycztcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlUmVjb21tZW5kZWRFeHRlbnNpb25zVmlld0Rlc2NyaXB0b3JzKCk6IElWaWV3RGVzY3JpcHRvcltdIHtcblx0XHRjb25zdCB2aWV3RGVzY3JpcHRvcnM6IElWaWV3RGVzY3JpcHRvcltdID0gW107XG5cblx0XHR2aWV3RGVzY3JpcHRvcnMucHVzaCh7XG5cdFx0XHRpZDogV09SS1NQQUNFX1JFQ09NTUVOREFUSU9OU19WSUVXX0lELFxuXHRcdFx0bmFtZTogbG9jYWxpemUyKCd3b3Jrc3BhY2VSZWNvbW1lbmRlZEV4dGVuc2lvbnMnLCBcIldvcmtzcGFjZSBSZWNvbW1lbmRhdGlvbnNcIiksXG5cdFx0XHRjdG9yRGVzY3JpcHRvcjogbmV3IFN5bmNEZXNjcmlwdG9yKFdvcmtzcGFjZVJlY29tbWVuZGVkRXh0ZW5zaW9uc1ZpZXcsIFt7fV0pLFxuXHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENvbnRleHRLZXlFeHByLmhhcygncmVjb21tZW5kZWRFeHRlbnNpb25zJyksIFdvcmtiZW5jaFN0YXRlQ29udGV4dC5ub3RFcXVhbHNUbygnZW1wdHknKSksXG5cdFx0XHRvcmRlcjogMVxuXHRcdH0pO1xuXG5cdFx0dmlld0Rlc2NyaXB0b3JzLnB1c2goe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2gudmlld3MuZXh0ZW5zaW9ucy5vdGhlclJlY29tbWVuZGF0aW9ucycsXG5cdFx0XHRuYW1lOiBsb2NhbGl6ZTIoJ290aGVyUmVjb21tZW5kZWRFeHRlbnNpb25zJywgXCJPdGhlciBSZWNvbW1lbmRhdGlvbnNcIiksXG5cdFx0XHRjdG9yRGVzY3JpcHRvcjogbmV3IFN5bmNEZXNjcmlwdG9yKFJlY29tbWVuZGVkRXh0ZW5zaW9uc1ZpZXcsIFt7fV0pLFxuXHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuaGFzKCdyZWNvbW1lbmRlZEV4dGVuc2lvbnMnKSxcblx0XHRcdG9yZGVyOiAyXG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gdmlld0Rlc2NyaXB0b3JzO1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVCdWlsdGluRXh0ZW5zaW9uc1ZpZXdEZXNjcmlwdG9ycygpOiBJVmlld0Rlc2NyaXB0b3JbXSB7XG5cdFx0Y29uc3Qgdmlld0Rlc2NyaXB0b3JzOiBJVmlld0Rlc2NyaXB0b3JbXSA9IFtdO1xuXG5cdFx0Y29uc3QgY29uZmlndXJlZENhdGVnb3JpZXMgPSBbJ3RoZW1lcycsICdwcm9ncmFtbWluZyBsYW5ndWFnZXMnXTtcblx0XHRjb25zdCBvdGhlckNhdGVnb3JpZXMgPSBFWFRFTlNJT05fQ0FURUdPUklFUy5maWx0ZXIoYyA9PiAhY29uZmlndXJlZENhdGVnb3JpZXMuaW5jbHVkZXMoYy50b0xvd2VyQ2FzZSgpKSk7XG5cdFx0b3RoZXJDYXRlZ29yaWVzLnB1c2goTk9ORV9DQVRFR09SWSk7XG5cdFx0Y29uc3Qgb3RoZXJDYXRlZ29yaWVzUXVlcnkgPSBgJHtvdGhlckNhdGVnb3JpZXMubWFwKGMgPT4gYGNhdGVnb3J5OlwiJHtjfVwiYCkuam9pbignICcpfSAke2NvbmZpZ3VyZWRDYXRlZ29yaWVzLm1hcChjID0+IGBjYXRlZ29yeTpcIi0ke2N9XCJgKS5qb2luKCcgJyl9YDtcblx0XHR2aWV3RGVzY3JpcHRvcnMucHVzaCh7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC52aWV3cy5leHRlbnNpb25zLmJ1aWx0aW5GZWF0dXJlRXh0ZW5zaW9ucycsXG5cdFx0XHRuYW1lOiBsb2NhbGl6ZTIoJ2J1aWx0aW5GZWF0dXJlRXh0ZW5zaW9ucycsIFwiRmVhdHVyZXNcIiksXG5cdFx0XHRjdG9yRGVzY3JpcHRvcjogbmV3IFN5bmNEZXNjcmlwdG9yKFN0YXRpY1F1ZXJ5RXh0ZW5zaW9uc1ZpZXcsIFt7IHF1ZXJ5OiBgQGJ1aWx0aW4gJHtvdGhlckNhdGVnb3JpZXNRdWVyeX1gIH1dKSxcblx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmhhcygnYnVpbHRJbkV4dGVuc2lvbnMnKSxcblx0XHR9KTtcblxuXHRcdHZpZXdEZXNjcmlwdG9ycy5wdXNoKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLnZpZXdzLmV4dGVuc2lvbnMuYnVpbHRpblRoZW1lRXh0ZW5zaW9ucycsXG5cdFx0XHRuYW1lOiBsb2NhbGl6ZTIoJ2J1aWx0SW5UaGVtZXNFeHRlbnNpb25zJywgXCJUaGVtZXNcIiksXG5cdFx0XHRjdG9yRGVzY3JpcHRvcjogbmV3IFN5bmNEZXNjcmlwdG9yKFN0YXRpY1F1ZXJ5RXh0ZW5zaW9uc1ZpZXcsIFt7IHF1ZXJ5OiBgQGJ1aWx0aW4gY2F0ZWdvcnk6dGhlbWVzYCB9XSksXG5cdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5oYXMoJ2J1aWx0SW5FeHRlbnNpb25zJyksXG5cdFx0fSk7XG5cblx0XHR2aWV3RGVzY3JpcHRvcnMucHVzaCh7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC52aWV3cy5leHRlbnNpb25zLmJ1aWx0aW5Qcm9ncmFtbWluZ0xhbmd1YWdlRXh0ZW5zaW9ucycsXG5cdFx0XHRuYW1lOiBsb2NhbGl6ZTIoJ2J1aWx0aW5Qcm9ncmFtbWluZ0xhbmd1YWdlRXh0ZW5zaW9ucycsIFwiUHJvZ3JhbW1pbmcgTGFuZ3VhZ2VzXCIpLFxuXHRcdFx0Y3RvckRlc2NyaXB0b3I6IG5ldyBTeW5jRGVzY3JpcHRvcihTdGF0aWNRdWVyeUV4dGVuc2lvbnNWaWV3LCBbeyBxdWVyeTogYEBidWlsdGluIGNhdGVnb3J5OlwicHJvZ3JhbW1pbmcgbGFuZ3VhZ2VzXCJgIH1dKSxcblx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmhhcygnYnVpbHRJbkV4dGVuc2lvbnMnKSxcblx0XHR9KTtcblxuXHRcdHJldHVybiB2aWV3RGVzY3JpcHRvcnM7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZVVuc3VwcG9ydGVkV29ya3NwYWNlRXh0ZW5zaW9uc1ZpZXdEZXNjcmlwdG9ycygpOiBJVmlld0Rlc2NyaXB0b3JbXSB7XG5cdFx0Y29uc3Qgdmlld0Rlc2NyaXB0b3JzOiBJVmlld0Rlc2NyaXB0b3JbXSA9IFtdO1xuXG5cdFx0dmlld0Rlc2NyaXB0b3JzLnB1c2goe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2gudmlld3MuZXh0ZW5zaW9ucy51bnRydXN0ZWRVbnN1cHBvcnRlZEV4dGVuc2lvbnMnLFxuXHRcdFx0bmFtZTogbG9jYWxpemUyKCd1bnRydXN0ZWRVbnN1cHBvcnRlZEV4dGVuc2lvbnMnLCBcIkRpc2FibGVkIGluIFJlc3RyaWN0ZWQgTW9kZVwiKSxcblx0XHRcdGN0b3JEZXNjcmlwdG9yOiBuZXcgU3luY0Rlc2NyaXB0b3IoVW50cnVzdGVkV29ya3NwYWNlVW5zdXBwb3J0ZWRFeHRlbnNpb25zVmlldywgW3t9XSksXG5cdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoU2VhcmNoVW5zdXBwb3J0ZWRXb3Jrc3BhY2VFeHRlbnNpb25zQ29udGV4dCksXG5cdFx0fSk7XG5cblx0XHR2aWV3RGVzY3JpcHRvcnMucHVzaCh7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC52aWV3cy5leHRlbnNpb25zLnVudHJ1c3RlZFBhcnRpYWxseVN1cHBvcnRlZEV4dGVuc2lvbnMnLFxuXHRcdFx0bmFtZTogbG9jYWxpemUyKCd1bnRydXN0ZWRQYXJ0aWFsbHlTdXBwb3J0ZWRFeHRlbnNpb25zJywgXCJMaW1pdGVkIGluIFJlc3RyaWN0ZWQgTW9kZVwiKSxcblx0XHRcdGN0b3JEZXNjcmlwdG9yOiBuZXcgU3luY0Rlc2NyaXB0b3IoVW50cnVzdGVkV29ya3NwYWNlUGFydGlhbGx5U3VwcG9ydGVkRXh0ZW5zaW9uc1ZpZXcsIFt7fV0pLFxuXHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFNlYXJjaFVuc3VwcG9ydGVkV29ya3NwYWNlRXh0ZW5zaW9uc0NvbnRleHQpLFxuXHRcdH0pO1xuXG5cdFx0dmlld0Rlc2NyaXB0b3JzLnB1c2goe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2gudmlld3MuZXh0ZW5zaW9ucy52aXJ0dWFsVW5zdXBwb3J0ZWRFeHRlbnNpb25zJyxcblx0XHRcdG5hbWU6IGxvY2FsaXplMigndmlydHVhbFVuc3VwcG9ydGVkRXh0ZW5zaW9ucycsIFwiRGlzYWJsZWQgaW4gVmlydHVhbCBXb3Jrc3BhY2VzXCIpLFxuXHRcdFx0Y3RvckRlc2NyaXB0b3I6IG5ldyBTeW5jRGVzY3JpcHRvcihWaXJ0dWFsV29ya3NwYWNlVW5zdXBwb3J0ZWRFeHRlbnNpb25zVmlldywgW3t9XSksXG5cdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoVmlydHVhbFdvcmtzcGFjZUNvbnRleHQsIFNlYXJjaFVuc3VwcG9ydGVkV29ya3NwYWNlRXh0ZW5zaW9uc0NvbnRleHQpLFxuXHRcdH0pO1xuXG5cdFx0dmlld0Rlc2NyaXB0b3JzLnB1c2goe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2gudmlld3MuZXh0ZW5zaW9ucy52aXJ0dWFsUGFydGlhbGx5U3VwcG9ydGVkRXh0ZW5zaW9ucycsXG5cdFx0XHRuYW1lOiBsb2NhbGl6ZTIoJ3ZpcnR1YWxQYXJ0aWFsbHlTdXBwb3J0ZWRFeHRlbnNpb25zJywgXCJMaW1pdGVkIGluIFZpcnR1YWwgV29ya3NwYWNlc1wiKSxcblx0XHRcdGN0b3JEZXNjcmlwdG9yOiBuZXcgU3luY0Rlc2NyaXB0b3IoVmlydHVhbFdvcmtzcGFjZVBhcnRpYWxseVN1cHBvcnRlZEV4dGVuc2lvbnNWaWV3LCBbe31dKSxcblx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChWaXJ0dWFsV29ya3NwYWNlQ29udGV4dCwgU2VhcmNoVW5zdXBwb3J0ZWRXb3Jrc3BhY2VFeHRlbnNpb25zQ29udGV4dCksXG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gdmlld0Rlc2NyaXB0b3JzO1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVPdGhlckxvY2FsRmlsdGVyZWRFeHRlbnNpb25zVmlld0Rlc2NyaXB0b3JzKCk6IElWaWV3RGVzY3JpcHRvcltdIHtcblx0XHRjb25zdCB2aWV3RGVzY3JpcHRvcnM6IElWaWV3RGVzY3JpcHRvcltdID0gW107XG5cblx0XHR2aWV3RGVzY3JpcHRvcnMucHVzaCh7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC52aWV3cy5leHRlbnNpb25zLmRlcHJlY2F0ZWRFeHRlbnNpb25zJyxcblx0XHRcdG5hbWU6IGxvY2FsaXplMignZGVwcmVjYXRlZCcsIFwiRGVwcmVjYXRlZFwiKSxcblx0XHRcdGN0b3JEZXNjcmlwdG9yOiBuZXcgU3luY0Rlc2NyaXB0b3IoRGVwcmVjYXRlZEV4dGVuc2lvbnNWaWV3LCBbe31dKSxcblx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChTZWFyY2hEZXByZWNhdGVkRXh0ZW5zaW9uc0NvbnRleHQpLFxuXHRcdH0pO1xuXG5cdFx0dmlld0Rlc2NyaXB0b3JzLnB1c2goe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2gudmlld3MuZXh0ZW5zaW9ucy5yZXN0YXJ0UmVxdWlyZWQnLFxuXHRcdFx0bmFtZTogbG9jYWxpemUyKCdyZXN0YXJ0IHJlcXVpcmVkJywgXCJSZXN0YXJ0IFJlcXVpcmVkXCIpLFxuXHRcdFx0Y3RvckRlc2NyaXB0b3I6IG5ldyBTeW5jRGVzY3JpcHRvcihFeHRlbnNpb25zTGlzdFZpZXcsIFt7fV0pLFxuXHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFNlYXJjaFJlc3RhcnRSZXF1aXJlZEV4dGVuc2lvbnNDb250ZXh0KSxcblx0XHR9KTtcblxuXHRcdHJldHVybiB2aWV3RGVzY3JpcHRvcnM7XG5cdH1cblxufVxuXG5leHBvcnQgY2xhc3MgRXh0ZW5zaW9uc1ZpZXdQYW5lQ29udGFpbmVyIGV4dGVuZHMgVmlld1BhbmVDb250YWluZXI8SUV4dGVuc2lvbnNWaWV3bGV0U3RhdGU+IGltcGxlbWVudHMgSUV4dGVuc2lvbnNWaWV3UGFuZUNvbnRhaW5lciB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25zU2VhcmNoVmFsdWVDb250ZXh0S2V5OiBJQ29udGV4dEtleTxzdHJpbmc+O1xuXHRwcml2YXRlIHJlYWRvbmx5IGRlZmF1bHRWaWV3c0NvbnRleHRLZXk6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIHJlYWRvbmx5IHNvcnRCeUNvbnRleHRLZXk6IElDb250ZXh0S2V5PHN0cmluZz47XG5cdHByaXZhdGUgcmVhZG9ubHkgc2VhcmNoTWFya2V0cGxhY2VFeHRlbnNpb25zQ29udGV4dEtleTogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgcmVhZG9ubHkgc2VhcmNoTWNwU2VydmVyc0NvbnRleHRLZXk6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIHJlYWRvbmx5IHNlYXJjaEFnZW50UGx1Z2luc0NvbnRleHRLZXk6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIHJlYWRvbmx5IHNlYXJjaEhhc1RleHRDb250ZXh0S2V5OiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSByZWFkb25seSBzb3J0QnlVcGRhdGVEYXRlQ29udGV4dEtleTogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgcmVhZG9ubHkgaW5zdGFsbGVkRXh0ZW5zaW9uc0NvbnRleHRLZXk6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIHJlYWRvbmx5IHNlYXJjaEluc3RhbGxlZEV4dGVuc2lvbnNDb250ZXh0S2V5OiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSByZWFkb25seSBzZWFyY2hSZWNlbnRseVVwZGF0ZWRFeHRlbnNpb25zQ29udGV4dEtleTogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgcmVhZG9ubHkgc2VhcmNoRXh0ZW5zaW9uVXBkYXRlc0NvbnRleHRLZXk6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIHJlYWRvbmx5IHNlYXJjaE91dGRhdGVkRXh0ZW5zaW9uc0NvbnRleHRLZXk6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIHJlYWRvbmx5IHNlYXJjaEVuYWJsZWRFeHRlbnNpb25zQ29udGV4dEtleTogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgcmVhZG9ubHkgc2VhcmNoRGlzYWJsZWRFeHRlbnNpb25zQ29udGV4dEtleTogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgcmVhZG9ubHkgaGFzSW5zdGFsbGVkRXh0ZW5zaW9uc0NvbnRleHRLZXk6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIHJlYWRvbmx5IGJ1aWx0SW5FeHRlbnNpb25zQ29udGV4dEtleTogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgcmVhZG9ubHkgc2VhcmNoQnVpbHRJbkV4dGVuc2lvbnNDb250ZXh0S2V5OiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSByZWFkb25seSBzZWFyY2hXb3Jrc3BhY2VVbnN1cHBvcnRlZEV4dGVuc2lvbnNDb250ZXh0S2V5OiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSByZWFkb25seSBzZWFyY2hEZXByZWNhdGVkRXh0ZW5zaW9uc0NvbnRleHRLZXk6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIHJlYWRvbmx5IHNlYXJjaFJlc3RhcnRSZXF1aXJlZEV4dGVuc2lvbnNDb250ZXh0S2V5OiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSByZWFkb25seSByZWNvbW1lbmRlZEV4dGVuc2lvbnNDb250ZXh0S2V5OiBJQ29udGV4dEtleTxib29sZWFuPjtcblxuXHRwcml2YXRlIHNlYXJjaERlbGF5ZXI6IERlbGF5ZXI8dm9pZD47XG5cdHByaXZhdGUgcm9vdDogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgaGVhZGVyOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBzZWFyY2hCb3g6IFN1Z2dlc3RFbmFibGVkSW5wdXQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgbm90aWZpY2F0aW9uQ29udGFpbmVyOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBzZWFyY2hWaWV3bGV0U3RhdGU6IElFeHRlbnNpb25zVmlld2xldFN0YXRlO1xuXHRwcml2YXRlIGV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdDogSUV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdCB8IG51bGwgPSBudWxsO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJV29ya2JlbmNoTGF5b3V0U2VydmljZSBsYXlvdXRTZXJ2aWNlOiBJV29ya2JlbmNoTGF5b3V0U2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElQcm9ncmVzc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwcm9ncmVzc1NlcnZpY2U6IElQcm9ncmVzc1NlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJRWRpdG9yR3JvdXBzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVkaXRvckdyb3VwU2VydmljZTogSUVkaXRvckdyb3Vwc1NlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25HYWxsZXJ5TWFuaWZlc3RTZXJ2aWNlIGV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdFNlcnZpY2U6IElFeHRlbnNpb25HYWxsZXJ5TWFuaWZlc3RTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25zV29ya2JlbmNoU2VydmljZTogSUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZTogSUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLFxuXHRcdEBJTm90aWZpY2F0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG5vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdEBJUGFuZUNvbXBvc2l0ZVBhcnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcGFuZUNvbXBvc2l0ZVNlcnZpY2U6IElQYW5lQ29tcG9zaXRlUGFydFNlcnZpY2UsXG5cdFx0QElUaGVtZVNlcnZpY2UgdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSBjb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIGNvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0XHRASUV4dGVuc2lvblNlcnZpY2UgZXh0ZW5zaW9uU2VydmljZTogSUV4dGVuc2lvblNlcnZpY2UsXG5cdFx0QElWaWV3RGVzY3JpcHRvclNlcnZpY2Ugdmlld0Rlc2NyaXB0b3JTZXJ2aWNlOiBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlLFxuXHRcdEBJUHJlZmVyZW5jZXNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcHJlZmVyZW5jZXNTZXJ2aWNlOiBJUHJlZmVyZW5jZXNTZXJ2aWNlLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASU9wZW5lclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBvcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoVklFV0xFVF9JRCwgeyBtZXJnZVZpZXdXaXRoQ29udGFpbmVyV2hlblNpbmdsZVZpZXc6IHRydWUgfSwgaW5zdGFudGlhdGlvblNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBsYXlvdXRTZXJ2aWNlLCBjb250ZXh0TWVudVNlcnZpY2UsIHRlbGVtZXRyeVNlcnZpY2UsIGV4dGVuc2lvblNlcnZpY2UsIHRoZW1lU2VydmljZSwgc3RvcmFnZVNlcnZpY2UsIGNvbnRleHRTZXJ2aWNlLCB2aWV3RGVzY3JpcHRvclNlcnZpY2UsIGxvZ1NlcnZpY2UpO1xuXG5cdFx0dGhpcy5zZWFyY2hEZWxheWVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IERlbGF5ZXIoNTAwKSk7XG5cdFx0dGhpcy5leHRlbnNpb25zU2VhcmNoVmFsdWVDb250ZXh0S2V5ID0gRXh0ZW5zaW9uc1NlYXJjaFZhbHVlQ29udGV4dC5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuZGVmYXVsdFZpZXdzQ29udGV4dEtleSA9IERlZmF1bHRWaWV3c0NvbnRleHQuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLnNvcnRCeUNvbnRleHRLZXkgPSBFeHRlbnNpb25zU29ydEJ5Q29udGV4dC5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuc2VhcmNoTWFya2V0cGxhY2VFeHRlbnNpb25zQ29udGV4dEtleSA9IFNlYXJjaE1hcmtldHBsYWNlRXh0ZW5zaW9uc0NvbnRleHQuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLnNlYXJjaE1jcFNlcnZlcnNDb250ZXh0S2V5ID0gU2VhcmNoTWNwU2VydmVyc0NvbnRleHQuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLnNlYXJjaEFnZW50UGx1Z2luc0NvbnRleHRLZXkgPSBTZWFyY2hBZ2VudFBsdWdpbnNDb250ZXh0LmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5zZWFyY2hIYXNUZXh0Q29udGV4dEtleSA9IFNlYXJjaEhhc1RleHRDb250ZXh0LmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5zb3J0QnlVcGRhdGVEYXRlQ29udGV4dEtleSA9IFNvcnRCeVVwZGF0ZURhdGVDb250ZXh0LmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5pbnN0YWxsZWRFeHRlbnNpb25zQ29udGV4dEtleSA9IEluc3RhbGxlZEV4dGVuc2lvbnNDb250ZXh0LmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5zZWFyY2hJbnN0YWxsZWRFeHRlbnNpb25zQ29udGV4dEtleSA9IFNlYXJjaEluc3RhbGxlZEV4dGVuc2lvbnNDb250ZXh0LmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5zZWFyY2hSZWNlbnRseVVwZGF0ZWRFeHRlbnNpb25zQ29udGV4dEtleSA9IFNlYXJjaFJlY2VudGx5VXBkYXRlZEV4dGVuc2lvbnNDb250ZXh0LmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5zZWFyY2hFeHRlbnNpb25VcGRhdGVzQ29udGV4dEtleSA9IFNlYXJjaEV4dGVuc2lvblVwZGF0ZXNDb250ZXh0LmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5zZWFyY2hXb3Jrc3BhY2VVbnN1cHBvcnRlZEV4dGVuc2lvbnNDb250ZXh0S2V5ID0gU2VhcmNoVW5zdXBwb3J0ZWRXb3Jrc3BhY2VFeHRlbnNpb25zQ29udGV4dC5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuc2VhcmNoRGVwcmVjYXRlZEV4dGVuc2lvbnNDb250ZXh0S2V5ID0gU2VhcmNoRGVwcmVjYXRlZEV4dGVuc2lvbnNDb250ZXh0LmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5zZWFyY2hSZXN0YXJ0UmVxdWlyZWRFeHRlbnNpb25zQ29udGV4dEtleSA9IFNlYXJjaFJlc3RhcnRSZXF1aXJlZEV4dGVuc2lvbnNDb250ZXh0LmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5zZWFyY2hPdXRkYXRlZEV4dGVuc2lvbnNDb250ZXh0S2V5ID0gU2VhcmNoT3V0ZGF0ZWRFeHRlbnNpb25zQ29udGV4dC5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuc2VhcmNoRW5hYmxlZEV4dGVuc2lvbnNDb250ZXh0S2V5ID0gU2VhcmNoRW5hYmxlZEV4dGVuc2lvbnNDb250ZXh0LmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5zZWFyY2hEaXNhYmxlZEV4dGVuc2lvbnNDb250ZXh0S2V5ID0gU2VhcmNoRGlzYWJsZWRFeHRlbnNpb25zQ29udGV4dC5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuaGFzSW5zdGFsbGVkRXh0ZW5zaW9uc0NvbnRleHRLZXkgPSBIYXNJbnN0YWxsZWRFeHRlbnNpb25zQ29udGV4dC5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuYnVpbHRJbkV4dGVuc2lvbnNDb250ZXh0S2V5ID0gQnVpbHRJbkV4dGVuc2lvbnNDb250ZXh0LmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5zZWFyY2hCdWlsdEluRXh0ZW5zaW9uc0NvbnRleHRLZXkgPSBTZWFyY2hCdWlsdEluRXh0ZW5zaW9uc0NvbnRleHQuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLnJlY29tbWVuZGVkRXh0ZW5zaW9uc0NvbnRleHRLZXkgPSBSZWNvbW1lbmRlZEV4dGVuc2lvbnNDb250ZXh0LmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5wYW5lQ29tcG9zaXRlU2VydmljZS5vbkRpZFBhbmVDb21wb3NpdGVPcGVuKGUgPT4geyBpZiAoZS52aWV3Q29udGFpbmVyTG9jYXRpb24gPT09IFZpZXdDb250YWluZXJMb2NhdGlvbi5TaWRlYmFyKSB7IHRoaXMub25WaWV3bGV0T3BlbihlLmNvbXBvc2l0ZSk7IH0gfSwgdGhpcykpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLm9uUmVzZXQoKCkgPT4gdGhpcy5yZWZyZXNoKCkpKTtcblx0XHR0aGlzLnNlYXJjaFZpZXdsZXRTdGF0ZSA9IHRoaXMuZ2V0TWVtZW50byhTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXG5cdFx0ZXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0U2VydmljZS5nZXRFeHRlbnNpb25HYWxsZXJ5TWFuaWZlc3QoKVxuXHRcdFx0LnRoZW4oZ2FsbGVyeU1hbmlmZXN0ID0+IHtcblx0XHRcdFx0dGhpcy5leHRlbnNpb25HYWxsZXJ5TWFuaWZlc3QgPSBnYWxsZXJ5TWFuaWZlc3Q7XG5cdFx0XHRcdHRoaXMuX3JlZ2lzdGVyKGV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdFNlcnZpY2Uub25EaWRDaGFuZ2VFeHRlbnNpb25HYWxsZXJ5TWFuaWZlc3QoZ2FsbGVyeU1hbmlmZXN0ID0+IHtcblx0XHRcdFx0XHR0aGlzLmV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdCA9IGdhbGxlcnlNYW5pZmVzdDtcblx0XHRcdFx0XHR0aGlzLnJlZnJlc2goKTtcblx0XHRcdFx0fSkpO1xuXHRcdFx0fSk7XG5cdH1cblxuXHRnZXQgc2VhcmNoVmFsdWUoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5zZWFyY2hCb3g/LmdldFZhbHVlKCk7XG5cdH1cblxuXHRvdmVycmlkZSBjcmVhdGUocGFyZW50OiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHBhcmVudC5jbGFzc0xpc3QuYWRkKCdleHRlbnNpb25zLXZpZXdsZXQnKTtcblx0XHR0aGlzLnJvb3QgPSBwYXJlbnQ7XG5cblx0XHRjb25zdCBvdmVybGF5ID0gYXBwZW5kKHRoaXMucm9vdCwgJCgnLm92ZXJsYXknKSk7XG5cdFx0Y29uc3Qgb3ZlcmxheUJhY2tncm91bmRDb2xvciA9IHRoaXMuZ2V0Q29sb3IoU0lERV9CQVJfRFJBR19BTkRfRFJPUF9CQUNLR1JPVU5EKSA/PyAnJztcblx0XHRvdmVybGF5LnN0eWxlLmJhY2tncm91bmRDb2xvciA9IG92ZXJsYXlCYWNrZ3JvdW5kQ29sb3I7XG5cdFx0aGlkZShvdmVybGF5KTtcblxuXHRcdHRoaXMuaGVhZGVyID0gYXBwZW5kKHRoaXMucm9vdCwgJCgnLmhlYWRlcicpKTtcblx0XHRjb25zdCBwbGFjZWhvbGRlciA9IGxvY2FsaXplKCdzZWFyY2hFeHRlbnNpb25zJywgXCJTZWFyY2ggRXh0ZW5zaW9ucyBpbiBNYXJrZXRwbGFjZVwiKTtcblxuXHRcdGNvbnN0IHNlYXJjaFZhbHVlID0gdGhpcy5zZWFyY2hWaWV3bGV0U3RhdGVbJ3F1ZXJ5LnZhbHVlJ10gPyB0aGlzLnNlYXJjaFZpZXdsZXRTdGF0ZVsncXVlcnkudmFsdWUnXSA6ICcnO1xuXG5cdFx0Y29uc3Qgc2VhcmNoQ29udGFpbmVyID0gYXBwZW5kKHRoaXMuaGVhZGVyLCAkKCcuZXh0ZW5zaW9ucy1zZWFyY2gtY29udGFpbmVyJykpO1xuXG5cdFx0dGhpcy5zZWFyY2hCb3ggPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFN1Z2dlc3RFbmFibGVkSW5wdXQsIGAke1ZJRVdMRVRfSUR9LnNlYXJjaGJveGAsIHNlYXJjaENvbnRhaW5lciwge1xuXHRcdFx0dHJpZ2dlckNoYXJhY3RlcnM6IFsnQCddLFxuXHRcdFx0c29ydEtleTogKGl0ZW06IHN0cmluZykgPT4ge1xuXHRcdFx0XHRpZiAoaXRlbS5pbmRleE9mKCc6JykgPT09IC0xKSB7IHJldHVybiAnYSc7IH1cblx0XHRcdFx0ZWxzZSBpZiAoL2V4dDovLnRlc3QoaXRlbSkgfHwgL2lkOi8udGVzdChpdGVtKSB8fCAvdGFnOi8udGVzdChpdGVtKSkgeyByZXR1cm4gJ2InOyB9XG5cdFx0XHRcdGVsc2UgaWYgKC9zb3J0Oi8udGVzdChpdGVtKSkgeyByZXR1cm4gJ2MnOyB9XG5cdFx0XHRcdGVsc2UgeyByZXR1cm4gJ2QnOyB9XG5cdFx0XHR9LFxuXHRcdFx0cHJvdmlkZVJlc3VsdHM6IChxdWVyeTogc3RyaW5nKSA9PiBRdWVyeS5zdWdnZXN0aW9ucyhxdWVyeSwgdGhpcy5leHRlbnNpb25HYWxsZXJ5TWFuaWZlc3QpXG5cdFx0fSwgcGxhY2Vob2xkZXIsICdleHRlbnNpb25zOnNlYXJjaGlucHV0JywgeyBwbGFjZWhvbGRlclRleHQ6IHBsYWNlaG9sZGVyLCB2YWx1ZTogc2VhcmNoVmFsdWUgfSkpO1xuXG5cdFx0dGhpcy5ub3RpZmljYXRpb25Db250YWluZXIgPSBhcHBlbmQodGhpcy5oZWFkZXIsICQoJy5ub3RpZmljYXRpb24tY29udGFpbmVyLmhpZGRlbicsIHsgJ3RhYmluZGV4JzogJzAnIH0pKTtcblx0XHR0aGlzLnJlbmRlck5vdGlmaWNhaXRvbigpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2Uub25EaWRDaGFuZ2VFeHRlbnNpb25zTm90aWZpY2F0aW9uKCgpID0+IHRoaXMucmVuZGVyTm90aWZpY2FpdG9uKCkpKTtcblxuXHRcdHRoaXMudXBkYXRlSW5zdGFsbGVkRXh0ZW5zaW9uc0NvbnRleHRzKCk7XG5cdFx0aWYgKHRoaXMuc2VhcmNoQm94LmdldFZhbHVlKCkpIHtcblx0XHRcdHRoaXMudHJpZ2dlclNlYXJjaCgpO1xuXHRcdH1cblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuc2VhcmNoQm94Lm9uSW5wdXREaWRDaGFuZ2UoKCkgPT4ge1xuXHRcdFx0dGhpcy5zb3J0QnlDb250ZXh0S2V5LnNldChRdWVyeS5wYXJzZSh0aGlzLnNlYXJjaEJveD8uZ2V0VmFsdWUoKSA/PyAnJykuc29ydEJ5KTtcblx0XHRcdHRoaXMudHJpZ2dlclNlYXJjaCgpO1xuXHRcdH0sIHRoaXMpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuc2VhcmNoQm94Lm9uU2hvdWxkRm9jdXNSZXN1bHRzKCgpID0+IHRoaXMuZm9jdXNMaXN0VmlldygpLCB0aGlzKSk7XG5cblx0XHRjb25zdCBjb250cm9sRWxlbWVudCA9IGFwcGVuZChzZWFyY2hDb250YWluZXIsICQoJy5leHRlbnNpb25zLXNlYXJjaC1hY3Rpb25zLWNvbnRhaW5lcicpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1lbnVXb3JrYmVuY2hUb29sQmFyLCBjb250cm9sRWxlbWVudCwgZXh0ZW5zaW9uc1NlYXJjaEFjdGlvbnNNZW51LCB7XG5cdFx0XHR0b29sYmFyT3B0aW9uczoge1xuXHRcdFx0XHRwcmltYXJ5R3JvdXA6ICgpID0+IHRydWUsXG5cdFx0XHR9LFxuXHRcdFx0YWN0aW9uVmlld0l0ZW1Qcm92aWRlcjogKGFjdGlvbiwgb3B0aW9ucykgPT4gY3JlYXRlQWN0aW9uVmlld0l0ZW0odGhpcy5pbnN0YW50aWF0aW9uU2VydmljZSwgYWN0aW9uLCBvcHRpb25zKVxuXHRcdH0pKTtcblxuXHRcdC8vIFJlZ2lzdGVyIERyYWdBbmREcm9wIHN1cHBvcnRcblx0XHR0aGlzLl9yZWdpc3RlcihuZXcgRHJhZ0FuZERyb3BPYnNlcnZlcih0aGlzLnJvb3QsIHtcblx0XHRcdG9uRHJhZ0VudGVyOiAoZTogRHJhZ0V2ZW50KSA9PiB7XG5cdFx0XHRcdGlmICh0aGlzLmlzU3VwcG9ydGVkRHJhZ0VsZW1lbnQoZSkpIHtcblx0XHRcdFx0XHRzaG93KG92ZXJsYXkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0b25EcmFnTGVhdmU6IChlOiBEcmFnRXZlbnQpID0+IHtcblx0XHRcdFx0aWYgKHRoaXMuaXNTdXBwb3J0ZWREcmFnRWxlbWVudChlKSkge1xuXHRcdFx0XHRcdGhpZGUob3ZlcmxheSk7XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHRvbkRyYWdPdmVyOiAoZTogRHJhZ0V2ZW50KSA9PiB7XG5cdFx0XHRcdGlmICh0aGlzLmlzU3VwcG9ydGVkRHJhZ0VsZW1lbnQoZSkpIHtcblx0XHRcdFx0XHRlLmRhdGFUcmFuc2ZlciEuZHJvcEVmZmVjdCA9ICdjb3B5Jztcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdG9uRHJvcDogYXN5bmMgKGU6IERyYWdFdmVudCkgPT4ge1xuXHRcdFx0XHRpZiAodGhpcy5pc1N1cHBvcnRlZERyYWdFbGVtZW50KGUpKSB7XG5cdFx0XHRcdFx0aGlkZShvdmVybGF5KTtcblxuXHRcdFx0XHRcdGNvbnN0IHZzaXhzID0gY29hbGVzY2UoKGF3YWl0IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oYWNjZXNzb3IgPT4gZXh0cmFjdEVkaXRvcnNBbmRGaWxlc0Ryb3BEYXRhKGFjY2Vzc29yLCBlKSkpXG5cdFx0XHRcdFx0XHQubWFwKGVkaXRvciA9PiBlZGl0b3IucmVzb3VyY2UgJiYgZXh0bmFtZShlZGl0b3IucmVzb3VyY2UpID09PSAnLnZzaXgnID8gZWRpdG9yLnJlc291cmNlIDogdW5kZWZpbmVkKSk7XG5cblx0XHRcdFx0XHRpZiAodnNpeHMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdFx0Ly8gQXR0ZW1wdCB0byBpbnN0YWxsIHRoZSBleHRlbnNpb24ocylcblx0XHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChJTlNUQUxMX0VYVEVOU0lPTl9GUk9NX1ZTSVhfQ09NTUFORF9JRCwgdnNpeHMpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0Y2F0Y2ggKGVycikge1xuXHRcdFx0XHRcdFx0XHR0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2UuZXJyb3IoZXJyKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRzdXBlci5jcmVhdGUoYXBwZW5kKHRoaXMucm9vdCwgJCgnLmV4dGVuc2lvbnMnKSkpO1xuXG5cdFx0Y29uc3QgZm9jdXNUcmFja2VyID0gdGhpcy5fcmVnaXN0ZXIodHJhY2tGb2N1cyh0aGlzLnJvb3QpKTtcblx0XHRjb25zdCBpc1NlYXJjaEJveEZvY3VzZWQgPSAoKSA9PiB0aGlzLnNlYXJjaEJveD8uaW5wdXRXaWRnZXQuaGFzV2lkZ2V0Rm9jdXMoKTtcblx0XHR0aGlzLl9yZWdpc3RlcihyZWdpc3Rlck5hdmlnYWJsZUNvbnRhaW5lcih7XG5cdFx0XHRuYW1lOiAnZXh0ZW5zaW9uc1ZpZXcnLFxuXHRcdFx0Zm9jdXNOb3RpZmllcnM6IFtmb2N1c1RyYWNrZXJdLFxuXHRcdFx0Zm9jdXNOZXh0V2lkZ2V0OiAoKSA9PiB7XG5cdFx0XHRcdGlmIChpc1NlYXJjaEJveEZvY3VzZWQoKSkge1xuXHRcdFx0XHRcdHRoaXMuZm9jdXNMaXN0VmlldygpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0Zm9jdXNQcmV2aW91c1dpZGdldDogKCkgPT4ge1xuXHRcdFx0XHRpZiAoIWlzU2VhcmNoQm94Rm9jdXNlZCgpKSB7XG5cdFx0XHRcdFx0dGhpcy5zZWFyY2hCb3g/LmZvY3VzKCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRvdmVycmlkZSBmb2N1cygpOiB2b2lkIHtcblx0XHRzdXBlci5mb2N1cygpO1xuXHRcdHRoaXMuc2VhcmNoQm94Py5mb2N1cygpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZGltZW5zaW9uOiBEaW1lbnNpb24gfCB1bmRlZmluZWQ7XG5cdG92ZXJyaWRlIGxheW91dChkaW1lbnNpb246IERpbWVuc2lvbik6IHZvaWQge1xuXHRcdHRoaXMuX2RpbWVuc2lvbiA9IGRpbWVuc2lvbjtcblx0XHRpZiAodGhpcy5yb290KSB7XG5cdFx0XHR0aGlzLnJvb3QuY2xhc3NMaXN0LnRvZ2dsZSgnbmFycm93JywgZGltZW5zaW9uLndpZHRoIDw9IDI1MCk7XG5cdFx0XHR0aGlzLnJvb3QuY2xhc3NMaXN0LnRvZ2dsZSgnbWluaScsIGRpbWVuc2lvbi53aWR0aCA8PSAyMDApO1xuXHRcdH1cblx0XHR0aGlzLnNlYXJjaEJveD8ubGF5b3V0KG5ldyBEaW1lbnNpb24oZGltZW5zaW9uLndpZHRoIC0gMzQgLSAvKnBhZGRpbmcqLzggLSAoMjQgKiAyKSwgMjApKTtcblx0XHRjb25zdCBzZWFyY2hCb3hIZWlnaHQgPSAyMCArIDIxIC8qbWFyZ2luKi87XG5cdFx0Y29uc3QgaGVhZGVySGVpZ2h0ID0gdGhpcy5oZWFkZXIgJiYgISF0aGlzLm5vdGlmaWNhdGlvbkNvbnRhaW5lcj8uY2hpbGROb2Rlcy5sZW5ndGggPyB0aGlzLm5vdGlmaWNhdGlvbkNvbnRhaW5lci5jbGllbnRIZWlnaHQgKyBzZWFyY2hCb3hIZWlnaHQgKyAxMCAvKm1hcmdpbiovIDogc2VhcmNoQm94SGVpZ2h0O1xuXHRcdHRoaXMuaGVhZGVyIS5zdHlsZS5oZWlnaHQgPSBgJHtoZWFkZXJIZWlnaHR9cHhgO1xuXHRcdHN1cGVyLmxheW91dChuZXcgRGltZW5zaW9uKGRpbWVuc2lvbi53aWR0aCwgZGltZW5zaW9uLmhlaWdodCAtIGhlYWRlckhlaWdodCkpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZ2V0T3B0aW1hbFdpZHRoKCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIDQwMDtcblx0fVxuXG5cdHNlYXJjaCh2YWx1ZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuc2VhcmNoQm94ICYmIHRoaXMuc2VhcmNoQm94LmdldFZhbHVlKCkgIT09IHZhbHVlKSB7XG5cdFx0XHR0aGlzLnNlYXJjaEJveC5zZXRWYWx1ZSh2YWx1ZSk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgcmVmcmVzaCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLnVwZGF0ZUluc3RhbGxlZEV4dGVuc2lvbnNDb250ZXh0cygpO1xuXHRcdHRoaXMuZG9TZWFyY2godHJ1ZSk7XG5cdFx0aWYgKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoQXV0b0NoZWNrVXBkYXRlc0NvbmZpZ3VyYXRpb25LZXkpKSB7XG5cdFx0XHR0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLmNoZWNrRm9yVXBkYXRlcygpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgbm90aWZpY2F0aW9uRGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8RGlzcG9zYWJsZVN0b3JlPigpKTtcblx0cHJpdmF0ZSByZW5kZXJOb3RpZmljYWl0b24oKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLm5vdGlmaWNhdGlvbkNvbnRhaW5lcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNsZWFyTm9kZSh0aGlzLm5vdGlmaWNhdGlvbkNvbnRhaW5lcik7XG5cdFx0dGhpcy5ub3RpZmljYXRpb25EaXNwb3NhYmxlcy52YWx1ZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBzdGF0dXMgPSB0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLmdldEV4dGVuc2lvbnNOb3RpZmljYXRpb24oKTtcblx0XHRjb25zdCBxdWVyeSA9IHN0YXR1cz8ucXVlcnkgPz8gc3RhdHVzPy5leHRlbnNpb25zLm1hcChleHRlbnNpb24gPT4gYEBpZDoke2V4dGVuc2lvbi5pZGVudGlmaWVyLmlkfWApLmpvaW4oJyAnKTtcblx0XHRpZiAoc3RhdHVzICYmIChxdWVyeSA9PT0gdGhpcy5zZWFyY2hCb3g/LmdldFZhbHVlKCkgfHwgIXRoaXMuc2VhcmNoTWFya2V0cGxhY2VFeHRlbnNpb25zQ29udGV4dEtleS5nZXQoKSkpIHtcblx0XHRcdGNvbnN0IG1lc3NhZ2VQbGFpblRleHQgPSBpc01hcmtkb3duU3RyaW5nKHN0YXR1cy5tZXNzYWdlKSA/IHJlbmRlckFzUGxhaW50ZXh0KHN0YXR1cy5tZXNzYWdlKSA6IHN0YXR1cy5tZXNzYWdlO1xuXHRcdFx0dGhpcy5ub3RpZmljYXRpb25Db250YWluZXIuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgbWVzc2FnZVBsYWluVGV4dCk7XG5cdFx0XHR0aGlzLm5vdGlmaWNhdGlvbkNvbnRhaW5lci5jbGFzc0xpc3QucmVtb3ZlKCdoaWRkZW4nKTtcblx0XHRcdGNvbnN0IG1lc3NhZ2VDb250YWluZXIgPSBhcHBlbmQodGhpcy5ub3RpZmljYXRpb25Db250YWluZXIsICQoJy5tZXNzYWdlLWNvbnRhaW5lcicpKTtcblx0XHRcdGFwcGVuZChtZXNzYWdlQ29udGFpbmVyLCAkKCdzcGFuJykpLmNsYXNzTmFtZSA9IFNldmVyaXR5SWNvbi5jbGFzc05hbWUoc3RhdHVzLnNldmVyaXR5KTtcblx0XHRcdGNvbnN0IG1lc3NhZ2VUZXh0ID0gYXBwZW5kKG1lc3NhZ2VDb250YWluZXIsICQoJ3NwYW4ubWVzc2FnZS10ZXh0JykpO1xuXHRcdFx0Y29uc3QgbWVzc2FnZUVsZW1lbnQgPSBhcHBlbmQobWVzc2FnZVRleHQsICQoJ3NwYW4ubWVzc2FnZScpKTtcblx0XHRcdGlmIChpc01hcmtkb3duU3RyaW5nKHN0YXR1cy5tZXNzYWdlKSkge1xuXHRcdFx0XHRjb25zdCBpc1RydXN0ZWQgPSBzdGF0dXMubWVzc2FnZS5pc1RydXN0ZWQ7XG5cdFx0XHRcdGNvbnN0IGFsbG93Q29tbWFuZHMgPSB0eXBlb2YgaXNUcnVzdGVkID09PSAnb2JqZWN0JyA/IGlzVHJ1c3RlZC5lbmFibGVkQ29tbWFuZHMgOiAhIWlzVHJ1c3RlZDtcblx0XHRcdFx0dGhpcy5ub3RpZmljYXRpb25EaXNwb3NhYmxlcy52YWx1ZS5hZGQocmVuZGVyTWFya2Rvd24oc3RhdHVzLm1lc3NhZ2UsIHtcblx0XHRcdFx0XHRhY3Rpb25IYW5kbGVyOiBsaW5rID0+IHsgdGhpcy5vcGVuZXJTZXJ2aWNlLm9wZW4obGluaywgeyBhbGxvd0NvbW1hbmRzIH0pOyB9LFxuXHRcdFx0XHR9LCBtZXNzYWdlRWxlbWVudCkpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0bWVzc2FnZUVsZW1lbnQudGV4dENvbnRlbnQgPSBzdGF0dXMubWVzc2FnZTtcblx0XHRcdH1cblx0XHRcdGlmIChzdGF0dXMuZXh0ZW5zaW9ucy5sZW5ndGgpIHtcblx0XHRcdFx0Y29uc3Qgc2hvd0FjdGlvbiA9IGFwcGVuZChtZXNzYWdlVGV4dCxcblx0XHRcdFx0XHQkKCdzcGFuLm1lc3NhZ2UtdGV4dC1hY3Rpb24nLCB7XG5cdFx0XHRcdFx0XHQndGFiaW5kZXgnOiAnMCcsXG5cdFx0XHRcdFx0XHQncm9sZSc6ICdidXR0b24nLFxuXHRcdFx0XHRcdFx0J2FyaWEtbGFiZWwnOiBgJHttZXNzYWdlUGxhaW5UZXh0fS4gJHtsb2NhbGl6ZSgnY2xpY2sgc2hvdycsIFwiQ2xpY2sgdG8gU2hvd1wiKX1gXG5cdFx0XHRcdFx0fSwgbG9jYWxpemUoJ3Nob3cnLCBcIlNob3dcIikpKTtcblx0XHRcdFx0dGhpcy5ub3RpZmljYXRpb25EaXNwb3NhYmxlcy52YWx1ZS5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHNob3dBY3Rpb24sIEV2ZW50VHlwZS5DTElDSywgKCkgPT4gdGhpcy5zZWFyY2gocXVlcnkgPz8gJycpKSk7XG5cdFx0XHRcdHRoaXMubm90aWZpY2F0aW9uRGlzcG9zYWJsZXMudmFsdWUuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihzaG93QWN0aW9uLCBFdmVudFR5cGUuS0VZX0RPV04sIChlOiBLZXlib2FyZEV2ZW50KSA9PiB7XG5cdFx0XHRcdFx0Y29uc3Qgc3RhbmRhcmRLZXlib2FyZEV2ZW50ID0gbmV3IFN0YW5kYXJkS2V5Ym9hcmRFdmVudChlKTtcblx0XHRcdFx0XHRpZiAoc3RhbmRhcmRLZXlib2FyZEV2ZW50LmtleUNvZGUgPT09IEtleUNvZGUuRW50ZXIgfHwgc3RhbmRhcmRLZXlib2FyZEV2ZW50LmtleUNvZGUgPT09IEtleUNvZGUuU3BhY2UpIHtcblx0XHRcdFx0XHRcdHRoaXMuc2VhcmNoKHF1ZXJ5ID8/ICcnKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0c3RhbmRhcmRLZXlib2FyZEV2ZW50LnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0XHR9KSk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBhY3Rpb25zQ29udGFpbmVyID0gYXBwZW5kKHRoaXMubm90aWZpY2F0aW9uQ29udGFpbmVyLCAkKCcubm90aWZpY2F0aW9uLWFjdGlvbnMnKSk7XG5cdFx0XHRpZiAoc3RhdHVzLmFjdGlvbikge1xuXHRcdFx0XHRjb25zdCBhY3Rpb25CdXR0b24gPSBhcHBlbmQoYWN0aW9uc0NvbnRhaW5lcixcblx0XHRcdFx0XHQkKCdzcGFuLm1lc3NhZ2UtYWN0aW9uLWJ1dHRvbicsIHtcblx0XHRcdFx0XHRcdCd0YWJpbmRleCc6ICcwJyxcblx0XHRcdFx0XHRcdCdyb2xlJzogJ2J1dHRvbicsXG5cdFx0XHRcdFx0XHQnYXJpYS1sYWJlbCc6IHN0YXR1cy5hY3Rpb24ubGFiZWwsXG5cdFx0XHRcdFx0fSwgc3RhdHVzLmFjdGlvbi5sYWJlbCkpO1xuXHRcdFx0XHR0aGlzLm5vdGlmaWNhdGlvbkRpc3Bvc2FibGVzLnZhbHVlLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIoYWN0aW9uQnV0dG9uLCBFdmVudFR5cGUuQ0xJQ0ssICgpID0+IHtcblx0XHRcdFx0XHRQcm9taXNlLnJlc29sdmUoc3RhdHVzLmFjdGlvbiEucnVuKCkpLmNhdGNoKGVycm9yID0+IHRoaXMubm90aWZpY2F0aW9uU2VydmljZS5lcnJvcihlcnJvcikpO1xuXHRcdFx0XHR9KSk7XG5cdFx0XHRcdHRoaXMubm90aWZpY2F0aW9uRGlzcG9zYWJsZXMudmFsdWUuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihhY3Rpb25CdXR0b24sIEV2ZW50VHlwZS5LRVlfRE9XTiwgKGU6IEtleWJvYXJkRXZlbnQpID0+IHtcblx0XHRcdFx0XHRjb25zdCBzdGFuZGFyZEtleWJvYXJkRXZlbnQgPSBuZXcgU3RhbmRhcmRLZXlib2FyZEV2ZW50KGUpO1xuXHRcdFx0XHRcdGlmIChzdGFuZGFyZEtleWJvYXJkRXZlbnQua2V5Q29kZSA9PT0gS2V5Q29kZS5FbnRlciB8fCBzdGFuZGFyZEtleWJvYXJkRXZlbnQua2V5Q29kZSA9PT0gS2V5Q29kZS5TcGFjZSkge1xuXHRcdFx0XHRcdFx0UHJvbWlzZS5yZXNvbHZlKHN0YXR1cy5hY3Rpb24hLnJ1bigpKS5jYXRjaChlcnJvciA9PiB0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2UuZXJyb3IoZXJyb3IpKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0c3RhbmRhcmRLZXlib2FyZEV2ZW50LnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0XHR9KSk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBkaXNtaXNzID0gc3RhdHVzLmRpc21pc3M7XG5cdFx0XHRpZiAoZGlzbWlzcykge1xuXHRcdFx0XHRjb25zdCBkaXNtaXNzTGFiZWwgPSBsb2NhbGl6ZSgnZGlzbWlzcyBub3RpZmljYXRpb24nLCBcIkRpc21pc3NcIik7XG5cdFx0XHRcdGNvbnN0IGRpc21pc3NCdXR0b24gPSBhcHBlbmQoYWN0aW9uc0NvbnRhaW5lcixcblx0XHRcdFx0XHQkKCdzcGFuLmRpc21pc3MtYWN0aW9uLmNvZGljb24uY29kaWNvbi1jbG9zZScsIHtcblx0XHRcdFx0XHRcdCd0YWJpbmRleCc6ICcwJyxcblx0XHRcdFx0XHRcdCdyb2xlJzogJ2J1dHRvbicsXG5cdFx0XHRcdFx0XHQnYXJpYS1sYWJlbCc6IGRpc21pc3NMYWJlbCxcblx0XHRcdFx0XHRcdCd0aXRsZSc6IGRpc21pc3NMYWJlbCxcblx0XHRcdFx0XHR9KSk7XG5cdFx0XHRcdHRoaXMubm90aWZpY2F0aW9uRGlzcG9zYWJsZXMudmFsdWUuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihkaXNtaXNzQnV0dG9uLCBFdmVudFR5cGUuQ0xJQ0ssICgpID0+IGRpc21pc3MoKSkpO1xuXHRcdFx0XHR0aGlzLm5vdGlmaWNhdGlvbkRpc3Bvc2FibGVzLnZhbHVlLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIoZGlzbWlzc0J1dHRvbiwgRXZlbnRUeXBlLktFWV9ET1dOLCAoZTogS2V5Ym9hcmRFdmVudCkgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IHN0YW5kYXJkS2V5Ym9hcmRFdmVudCA9IG5ldyBTdGFuZGFyZEtleWJvYXJkRXZlbnQoZSk7XG5cdFx0XHRcdFx0aWYgKHN0YW5kYXJkS2V5Ym9hcmRFdmVudC5rZXlDb2RlID09PSBLZXlDb2RlLkVudGVyIHx8IHN0YW5kYXJkS2V5Ym9hcmRFdmVudC5rZXlDb2RlID09PSBLZXlDb2RlLlNwYWNlKSB7XG5cdFx0XHRcdFx0XHRkaXNtaXNzKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHN0YW5kYXJkS2V5Ym9hcmRFdmVudC5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdFx0fSkpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLm5vdGlmaWNhdGlvbkNvbnRhaW5lci5yZW1vdmVBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnKTtcblx0XHRcdHRoaXMubm90aWZpY2F0aW9uQ29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ2hpZGRlbicpO1xuXHRcdFx0aWYgKHRoaXMuc2VhcmNoQm94ICYmIEV4dGVuc2lvbnNMaXN0Vmlldy5pc1Jlc3RhcnRSZXF1aXJlZFF1ZXJ5KHRoaXMuc2VhcmNoQm94LmdldFZhbHVlKCkpKSB7XG5cdFx0XHRcdHRoaXMuc2VhcmNoKCcnKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAodGhpcy5fZGltZW5zaW9uKSB7XG5cdFx0XHR0aGlzLmxheW91dCh0aGlzLl9kaW1lbnNpb24pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgdXBkYXRlSW5zdGFsbGVkRXh0ZW5zaW9uc0NvbnRleHRzKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UucXVlcnlMb2NhbCgpO1xuXHRcdHRoaXMuaGFzSW5zdGFsbGVkRXh0ZW5zaW9uc0NvbnRleHRLZXkuc2V0KHJlc3VsdC5zb21lKHIgPT4gIXIuaXNCdWlsdGluKSk7XG5cdH1cblxuXHRwcml2YXRlIHRyaWdnZXJTZWFyY2goKTogdm9pZCB7XG5cdFx0dGhpcy5zZWFyY2hEZWxheWVyLnRyaWdnZXIoKCkgPT4gdGhpcy5kb1NlYXJjaCgpLCB0aGlzLnNlYXJjaEJveCAmJiB0aGlzLnNlYXJjaEJveC5nZXRWYWx1ZSgpID8gNTAwIDogMCkudGhlbih1bmRlZmluZWQsIGVyciA9PiB0aGlzLm9uRXJyb3IoZXJyKSk7XG5cdH1cblxuXHRwcml2YXRlIG5vcm1hbGl6ZWRRdWVyeSgpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLnNlYXJjaEJveFxuXHRcdFx0PyB0aGlzLnNlYXJjaEJveC5nZXRWYWx1ZSgpXG5cdFx0XHRcdC50cmltKClcblx0XHRcdFx0LnJlcGxhY2UoL0BjYXRlZ29yeS9nLCAnY2F0ZWdvcnknKVxuXHRcdFx0XHQucmVwbGFjZSgvQHRhZzovZywgJ3RhZzonKVxuXHRcdFx0XHQucmVwbGFjZSgvQGV4dDovZywgJ2V4dDonKVxuXHRcdFx0XHQucmVwbGFjZSgvQGZlYXR1cmVkL2csICdmZWF0dXJlZCcpXG5cdFx0XHRcdC5yZXBsYWNlKC9AcG9wdWxhci9nLCB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLndlYkV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIgJiYgIXRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UubG9jYWxFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyICYmICF0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLnJlbW90ZUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIgPyAnQHdlYicgOiAnQHBvcHVsYXInKVxuXHRcdFx0OiAnJztcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBzYXZlU3RhdGUoKTogdm9pZCB7XG5cdFx0Y29uc3QgdmFsdWUgPSB0aGlzLnNlYXJjaEJveCA/IHRoaXMuc2VhcmNoQm94LmdldFZhbHVlKCkgOiAnJztcblx0XHRpZiAoRXh0ZW5zaW9uc0xpc3RWaWV3LmlzTG9jYWxFeHRlbnNpb25zUXVlcnkodmFsdWUpKSB7XG5cdFx0XHR0aGlzLnNlYXJjaFZpZXdsZXRTdGF0ZVsncXVlcnkudmFsdWUnXSA9IHZhbHVlO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnNlYXJjaFZpZXdsZXRTdGF0ZVsncXVlcnkudmFsdWUnXSA9ICcnO1xuXHRcdH1cblx0XHRzdXBlci5zYXZlU3RhdGUoKTtcblx0fVxuXG5cdHByaXZhdGUgZG9TZWFyY2gocmVmcmVzaD86IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB2YWx1ZSA9IHRoaXMubm9ybWFsaXplZFF1ZXJ5KCk7XG5cdFx0dGhpcy5jb250ZXh0S2V5U2VydmljZS5idWZmZXJDaGFuZ2VFdmVudHMoKCkgPT4ge1xuXHRcdFx0Y29uc3QgaXNSZWNvbW1lbmRlZEV4dGVuc2lvbnNRdWVyeSA9IEV4dGVuc2lvbnNMaXN0Vmlldy5pc1JlY29tbWVuZGVkRXh0ZW5zaW9uc1F1ZXJ5KHZhbHVlKTtcblx0XHRcdHRoaXMuc2VhcmNoSGFzVGV4dENvbnRleHRLZXkuc2V0KHZhbHVlLnRyaW0oKSAhPT0gJycpO1xuXHRcdFx0dGhpcy5leHRlbnNpb25zU2VhcmNoVmFsdWVDb250ZXh0S2V5LnNldCh2YWx1ZSk7XG5cdFx0XHR0aGlzLmluc3RhbGxlZEV4dGVuc2lvbnNDb250ZXh0S2V5LnNldChFeHRlbnNpb25zTGlzdFZpZXcuaXNJbnN0YWxsZWRFeHRlbnNpb25zUXVlcnkodmFsdWUpKTtcblx0XHRcdHRoaXMuc2VhcmNoSW5zdGFsbGVkRXh0ZW5zaW9uc0NvbnRleHRLZXkuc2V0KEV4dGVuc2lvbnNMaXN0Vmlldy5pc1NlYXJjaEluc3RhbGxlZEV4dGVuc2lvbnNRdWVyeSh2YWx1ZSkpO1xuXHRcdFx0dGhpcy5zZWFyY2hSZWNlbnRseVVwZGF0ZWRFeHRlbnNpb25zQ29udGV4dEtleS5zZXQoRXh0ZW5zaW9uc0xpc3RWaWV3LmlzU2VhcmNoUmVjZW50bHlVcGRhdGVkUXVlcnkodmFsdWUpICYmICFFeHRlbnNpb25zTGlzdFZpZXcuaXNTZWFyY2hFeHRlbnNpb25VcGRhdGVzUXVlcnkodmFsdWUpKTtcblx0XHRcdHRoaXMuc2VhcmNoT3V0ZGF0ZWRFeHRlbnNpb25zQ29udGV4dEtleS5zZXQoRXh0ZW5zaW9uc0xpc3RWaWV3LmlzT3V0ZGF0ZWRFeHRlbnNpb25zUXVlcnkodmFsdWUpICYmICFFeHRlbnNpb25zTGlzdFZpZXcuaXNTZWFyY2hFeHRlbnNpb25VcGRhdGVzUXVlcnkodmFsdWUpKTtcblx0XHRcdHRoaXMuc2VhcmNoRXh0ZW5zaW9uVXBkYXRlc0NvbnRleHRLZXkuc2V0KEV4dGVuc2lvbnNMaXN0Vmlldy5pc1NlYXJjaEV4dGVuc2lvblVwZGF0ZXNRdWVyeSh2YWx1ZSkpO1xuXHRcdFx0dGhpcy5zZWFyY2hFbmFibGVkRXh0ZW5zaW9uc0NvbnRleHRLZXkuc2V0KEV4dGVuc2lvbnNMaXN0Vmlldy5pc0VuYWJsZWRFeHRlbnNpb25zUXVlcnkodmFsdWUpKTtcblx0XHRcdHRoaXMuc2VhcmNoRGlzYWJsZWRFeHRlbnNpb25zQ29udGV4dEtleS5zZXQoRXh0ZW5zaW9uc0xpc3RWaWV3LmlzRGlzYWJsZWRFeHRlbnNpb25zUXVlcnkodmFsdWUpKTtcblx0XHRcdHRoaXMuc2VhcmNoQnVpbHRJbkV4dGVuc2lvbnNDb250ZXh0S2V5LnNldChFeHRlbnNpb25zTGlzdFZpZXcuaXNTZWFyY2hCdWlsdEluRXh0ZW5zaW9uc1F1ZXJ5KHZhbHVlKSk7XG5cdFx0XHR0aGlzLnNlYXJjaFdvcmtzcGFjZVVuc3VwcG9ydGVkRXh0ZW5zaW9uc0NvbnRleHRLZXkuc2V0KEV4dGVuc2lvbnNMaXN0Vmlldy5pc1NlYXJjaFdvcmtzcGFjZVVuc3VwcG9ydGVkRXh0ZW5zaW9uc1F1ZXJ5KHZhbHVlKSk7XG5cdFx0XHR0aGlzLnNlYXJjaERlcHJlY2F0ZWRFeHRlbnNpb25zQ29udGV4dEtleS5zZXQoRXh0ZW5zaW9uc0xpc3RWaWV3LmlzU2VhcmNoRGVwcmVjYXRlZEV4dGVuc2lvbnNRdWVyeSh2YWx1ZSkpO1xuXHRcdFx0dGhpcy5zZWFyY2hSZXN0YXJ0UmVxdWlyZWRFeHRlbnNpb25zQ29udGV4dEtleS5zZXQoRXh0ZW5zaW9uc0xpc3RWaWV3LmlzUmVzdGFydFJlcXVpcmVkUXVlcnkodmFsdWUpKTtcblx0XHRcdHRoaXMuYnVpbHRJbkV4dGVuc2lvbnNDb250ZXh0S2V5LnNldChFeHRlbnNpb25zTGlzdFZpZXcuaXNCdWlsdEluRXh0ZW5zaW9uc1F1ZXJ5KHZhbHVlKSk7XG5cdFx0XHR0aGlzLnJlY29tbWVuZGVkRXh0ZW5zaW9uc0NvbnRleHRLZXkuc2V0KGlzUmVjb21tZW5kZWRFeHRlbnNpb25zUXVlcnkpO1xuXHRcdFx0dGhpcy5zZWFyY2hNY3BTZXJ2ZXJzQ29udGV4dEtleS5zZXQoISF2YWx1ZSAmJiAvQG1jcFxccz8uKi9pLnRlc3QodmFsdWUpKTtcblx0XHRcdHRoaXMuc2VhcmNoQWdlbnRQbHVnaW5zQ29udGV4dEtleS5zZXQoISF2YWx1ZSAmJiAvQGFnZW50UGx1Z2luc1xccz8uKi9pLnRlc3QodmFsdWUpKTtcblx0XHRcdHRoaXMuc2VhcmNoTWFya2V0cGxhY2VFeHRlbnNpb25zQ29udGV4dEtleS5zZXQoISF2YWx1ZSAmJiAhRXh0ZW5zaW9uc0xpc3RWaWV3LmlzTG9jYWxFeHRlbnNpb25zUXVlcnkodmFsdWUpICYmICFpc1JlY29tbWVuZGVkRXh0ZW5zaW9uc1F1ZXJ5ICYmICF0aGlzLnNlYXJjaE1jcFNlcnZlcnNDb250ZXh0S2V5LmdldCgpICYmICF0aGlzLnNlYXJjaEFnZW50UGx1Z2luc0NvbnRleHRLZXkuZ2V0KCkpO1xuXHRcdFx0dGhpcy5zb3J0QnlVcGRhdGVEYXRlQ29udGV4dEtleS5zZXQoRXh0ZW5zaW9uc0xpc3RWaWV3LmlzU29ydFVwZGF0ZURhdGVRdWVyeSh2YWx1ZSkpO1xuXHRcdFx0dGhpcy5kZWZhdWx0Vmlld3NDb250ZXh0S2V5LnNldCghdmFsdWUgfHwgRXh0ZW5zaW9uc0xpc3RWaWV3LmlzU29ydEluc3RhbGxlZEV4dGVuc2lvbnNRdWVyeSh2YWx1ZSkpO1xuXHRcdH0pO1xuXG5cdFx0dGhpcy5yZW5kZXJOb3RpZmljYWl0b24oKTtcblxuXHRcdHJldHVybiB0aGlzLnNob3dFeHRlbnNpb25zVmlld3ModGhpcy5wYW5lcyk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgb25EaWRBZGRWaWV3RGVzY3JpcHRvcnMoYWRkZWQ6IElBZGRlZFZpZXdEZXNjcmlwdG9yUmVmW10pOiBWaWV3UGFuZVtdIHtcblx0XHRjb25zdCBhZGRlZFZpZXdzID0gc3VwZXIub25EaWRBZGRWaWV3RGVzY3JpcHRvcnMoYWRkZWQpO1xuXHRcdHRoaXMuc2hvd0V4dGVuc2lvbnNWaWV3cyhhZGRlZFZpZXdzKTtcblx0XHRyZXR1cm4gYWRkZWRWaWV3cztcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgc2hvd0V4dGVuc2lvbnNWaWV3cyh2aWV3czogVmlld1BhbmVbXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMucHJvZ3Jlc3MoUHJvbWlzZS5hbGwodmlld3MubWFwKGFzeW5jIHZpZXcgPT4ge1xuXHRcdFx0aWYgKHZpZXcgaW5zdGFuY2VvZiBBYnN0cmFjdEV4dGVuc2lvbnNMaXN0Vmlldykge1xuXHRcdFx0XHRjb25zdCBtb2RlbCA9IGF3YWl0IHZpZXcuc2hvdyh0aGlzLm5vcm1hbGl6ZWRRdWVyeSgpKTtcblx0XHRcdFx0dGhpcy5hbGVydFNlYXJjaFJlc3VsdChtb2RlbC5sZW5ndGgsIHZpZXcuaWQpO1xuXHRcdFx0fVxuXHRcdH0pKSk7XG5cdH1cblxuXHRwcml2YXRlIGFsZXJ0U2VhcmNoUmVzdWx0KGNvdW50OiBudW1iZXIsIHZpZXdJZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgdmlldyA9IHRoaXMudmlld0NvbnRhaW5lck1vZGVsLnZpc2libGVWaWV3RGVzY3JpcHRvcnMuZmluZCh2aWV3ID0+IHZpZXcuaWQgPT09IHZpZXdJZCk7XG5cdFx0c3dpdGNoIChjb3VudCkge1xuXHRcdFx0Y2FzZSAwOlxuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgMTpcblx0XHRcdFx0aWYgKHZpZXcpIHtcblx0XHRcdFx0XHRhbGVydChsb2NhbGl6ZSgnZXh0ZW5zaW9uRm91bmRJblNlY3Rpb24nLCBcIjEgZXh0ZW5zaW9uIGZvdW5kIGluIHRoZSB7MH0gc2VjdGlvbi5cIiwgdmlldy5uYW1lLnZhbHVlKSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0YWxlcnQobG9jYWxpemUoJ2V4dGVuc2lvbkZvdW5kJywgXCIxIGV4dGVuc2lvbiBmb3VuZC5cIikpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0aWYgKHZpZXcpIHtcblx0XHRcdFx0XHRhbGVydChsb2NhbGl6ZSgnZXh0ZW5zaW9uc0ZvdW5kSW5TZWN0aW9uJywgXCJ7MH0gZXh0ZW5zaW9ucyBmb3VuZCBpbiB0aGUgezF9IHNlY3Rpb24uXCIsIGNvdW50LCB2aWV3Lm5hbWUudmFsdWUpKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRhbGVydChsb2NhbGl6ZSgnZXh0ZW5zaW9uc0ZvdW5kJywgXCJ7MH0gZXh0ZW5zaW9ucyBmb3VuZC5cIiwgY291bnQpKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRicmVhaztcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGdldEZpcnN0RXhwYW5kZWRQYW5lKCk6IEV4dGVuc2lvbnNMaXN0VmlldyB8IHVuZGVmaW5lZCB7XG5cdFx0Zm9yIChjb25zdCBwYW5lIG9mIHRoaXMucGFuZXMpIHtcblx0XHRcdGlmIChwYW5lLmlzRXhwYW5kZWQoKSAmJiBwYW5lIGluc3RhbmNlb2YgRXh0ZW5zaW9uc0xpc3RWaWV3KSB7XG5cdFx0XHRcdHJldHVybiBwYW5lO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBmb2N1c0xpc3RWaWV3KCk6IHZvaWQge1xuXHRcdGNvbnN0IHBhbmUgPSB0aGlzLmdldEZpcnN0RXhwYW5kZWRQYW5lKCk7XG5cdFx0aWYgKHBhbmUgJiYgcGFuZS5jb3VudCgpID4gMCkge1xuXHRcdFx0cGFuZS5mb2N1cygpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgb25WaWV3bGV0T3Blbih2aWV3bGV0OiBJUGFuZUNvbXBvc2l0ZSk6IHZvaWQge1xuXHRcdGlmICghdmlld2xldCB8fCB2aWV3bGV0LmdldElkKCkgPT09IFZJRVdMRVRfSUQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihDbG9zZUV4dGVuc2lvbkRldGFpbHNPblZpZXdDaGFuZ2VLZXkpKSB7XG5cdFx0XHRjb25zdCBwcm9taXNlcyA9IHRoaXMuZWRpdG9yR3JvdXBTZXJ2aWNlLmdyb3Vwcy5tYXAoZ3JvdXAgPT4ge1xuXHRcdFx0XHRjb25zdCBlZGl0b3JzID0gZ3JvdXAuZWRpdG9ycy5maWx0ZXIoaW5wdXQgPT4gaW5wdXQgaW5zdGFuY2VvZiBFeHRlbnNpb25zSW5wdXQpO1xuXG5cdFx0XHRcdHJldHVybiBncm91cC5jbG9zZUVkaXRvcnMoZWRpdG9ycyk7XG5cdFx0XHR9KTtcblxuXHRcdFx0UHJvbWlzZS5hbGwocHJvbWlzZXMpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcHJvZ3Jlc3M8VD4ocHJvbWlzZTogUHJvbWlzZTxUPik6IFByb21pc2U8VD4ge1xuXHRcdHJldHVybiB0aGlzLnByb2dyZXNzU2VydmljZS53aXRoUHJvZ3Jlc3MoeyBsb2NhdGlvbjogUHJvZ3Jlc3NMb2NhdGlvbi5FeHRlbnNpb25zIH0sICgpID0+IHByb21pc2UpO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkVycm9yKGVycjogRXJyb3IpOiB2b2lkIHtcblx0XHRpZiAoaXNDYW5jZWxsYXRpb25FcnJvcihlcnIpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgbWVzc2FnZSA9IGVyciAmJiBlcnIubWVzc2FnZSB8fCAnJztcblxuXHRcdGlmICgvRUNPTk5SRUZVU0VELy50ZXN0KG1lc3NhZ2UpKSB7XG5cdFx0XHRjb25zdCBlcnJvciA9IGNyZWF0ZUVycm9yV2l0aEFjdGlvbnMobG9jYWxpemUoJ3N1Z2dlc3RQcm94eUVycm9yJywgXCJNYXJrZXRwbGFjZSByZXR1cm5lZCAnRUNPTk5SRUZVU0VEJy4gUGxlYXNlIGNoZWNrIHRoZSAnaHR0cC5wcm94eScgc2V0dGluZy5cIiksIFtcblx0XHRcdFx0bmV3IEFjdGlvbignb3BlbiB1c2VyIHNldHRpbmdzJywgbG9jYWxpemUoJ29wZW4gdXNlciBzZXR0aW5ncycsIFwiT3BlbiBVc2VyIFNldHRpbmdzXCIpLCB1bmRlZmluZWQsIHRydWUsICgpID0+IHRoaXMucHJlZmVyZW5jZXNTZXJ2aWNlLm9wZW5Vc2VyU2V0dGluZ3MoKSlcblx0XHRcdF0pO1xuXG5cdFx0XHR0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2UuZXJyb3IoZXJyb3IpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMubm90aWZpY2F0aW9uU2VydmljZS5lcnJvcihlcnIpO1xuXHR9XG5cblx0cHJpdmF0ZSBpc1N1cHBvcnRlZERyYWdFbGVtZW50KGU6IERyYWdFdmVudCk6IGJvb2xlYW4ge1xuXHRcdGlmIChlLmRhdGFUcmFuc2Zlcikge1xuXHRcdFx0Y29uc3QgdHlwZXNMb3dlckNhc2UgPSBlLmRhdGFUcmFuc2Zlci50eXBlcy5tYXAodCA9PiB0LnRvTG9jYWxlTG93ZXJDYXNlKCkpO1xuXHRcdFx0cmV0dXJuIHR5cGVzTG93ZXJDYXNlLmluZGV4T2YoJ2ZpbGVzJykgIT09IC0xO1xuXHRcdH1cblxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgU3RhdHVzVXBkYXRlciBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGJhZGdlSGFuZGxlID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQWN0aXZpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgYWN0aXZpdHlTZXJ2aWNlOiBJQWN0aXZpdHlTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25zV29ya2JlbmNoU2VydmljZTogSUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoRXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25FbmFibGVtZW50U2VydmljZTogSVdvcmtiZW5jaEV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5vblNlcnZpY2VDaGFuZ2UoKTtcblx0XHR0aGlzLl9yZWdpc3RlcihFdmVudC5hbnkoRXZlbnQuZGVib3VuY2UoZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2Uub25DaGFuZ2UsICgpID0+IHVuZGVmaW5lZCwgMTAwLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB0aGlzLl9zdG9yZSksIGV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLm9uRGlkQ2hhbmdlRXh0ZW5zaW9uc05vdGlmaWNhdGlvbikodGhpcy5vblNlcnZpY2VDaGFuZ2UsIHRoaXMpKTtcblx0fVxuXG5cdHByaXZhdGUgb25TZXJ2aWNlQ2hhbmdlKCk6IHZvaWQge1xuXHRcdHRoaXMuYmFkZ2VIYW5kbGUuY2xlYXIoKTtcblx0XHRsZXQgYmFkZ2U6IElCYWRnZSB8IHVuZGVmaW5lZDtcblxuXHRcdGNvbnN0IGV4dGVuc2lvbnNOb3RpZmljYXRpb24gPSB0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLmdldEV4dGVuc2lvbnNOb3RpZmljYXRpb24oKTtcblx0XHRpZiAoZXh0ZW5zaW9uc05vdGlmaWNhdGlvbiAmJiBleHRlbnNpb25zTm90aWZpY2F0aW9uLnNldmVyaXR5ID09PSBTZXZlcml0eS5XYXJuaW5nKSB7XG5cdFx0XHRiYWRnZSA9IG5ldyBXYXJuaW5nQmFkZ2UoKCkgPT4gaXNNYXJrZG93blN0cmluZyhleHRlbnNpb25zTm90aWZpY2F0aW9uLm1lc3NhZ2UpID8gcmVuZGVyQXNQbGFpbnRleHQoZXh0ZW5zaW9uc05vdGlmaWNhdGlvbi5tZXNzYWdlKSA6IGV4dGVuc2lvbnNOb3RpZmljYXRpb24ubWVzc2FnZSk7XG5cdFx0fVxuXG5cdFx0aWYgKCFiYWRnZSkge1xuXHRcdFx0Y29uc3QgYWN0aW9uUmVxdWlyZWQgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKEF1dG9SZXN0YXJ0Q29uZmlndXJhdGlvbktleSkgPT09IHRydWUgPyBbXSA6IHRoaXMuZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UuaW5zdGFsbGVkLmZpbHRlcihlID0+IGUucnVudGltZVN0YXRlICE9PSB1bmRlZmluZWQpO1xuXHRcdFx0Y29uc3Qgb3V0ZGF0ZWQgPSB0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLm91dGRhdGVkLnJlZHVjZSgociwgZSkgPT4gciArICh0aGlzLmV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlLmlzRW5hYmxlZChlLmxvY2FsISkgJiYgIWFjdGlvblJlcXVpcmVkLmluY2x1ZGVzKGUpICYmICF0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLmlzQXV0b1VwZGF0ZURlbGF5ZWQoZSkgPyAxIDogMCksIDApO1xuXHRcdFx0Y29uc3QgbmV3QmFkZ2VOdW1iZXIgPSBvdXRkYXRlZCArIGFjdGlvblJlcXVpcmVkLmxlbmd0aDtcblx0XHRcdGlmIChuZXdCYWRnZU51bWJlciA+IDApIHtcblx0XHRcdFx0bGV0IG1zZyA9ICcnO1xuXHRcdFx0XHRpZiAob3V0ZGF0ZWQpIHtcblx0XHRcdFx0XHRtc2cgKz0gb3V0ZGF0ZWQgPT09IDEgPyBsb2NhbGl6ZSgnZXh0ZW5zaW9uVG9VcGRhdGUnLCAnezB9IHJlcXVpcmVzIHVwZGF0ZScsIG91dGRhdGVkKSA6IGxvY2FsaXplKCdleHRlbnNpb25zVG9VcGRhdGUnLCAnezB9IHJlcXVpcmUgdXBkYXRlJywgb3V0ZGF0ZWQpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChvdXRkYXRlZCA+IDAgJiYgYWN0aW9uUmVxdWlyZWQubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdG1zZyArPSAnLCAnO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChhY3Rpb25SZXF1aXJlZC5sZW5ndGgpIHtcblx0XHRcdFx0XHRtc2cgKz0gYWN0aW9uUmVxdWlyZWQubGVuZ3RoID09PSAxID8gbG9jYWxpemUoJ2V4dGVuc2lvblRvUmVsb2FkJywgJ3swfSByZXF1aXJlcyByZXN0YXJ0JywgYWN0aW9uUmVxdWlyZWQubGVuZ3RoKSA6IGxvY2FsaXplKCdleHRlbnNpb25zVG9SZWxvYWQnLCAnezB9IHJlcXVpcmUgcmVzdGFydCcsIGFjdGlvblJlcXVpcmVkLmxlbmd0aCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0YmFkZ2UgPSBuZXcgTnVtYmVyQmFkZ2UobmV3QmFkZ2VOdW1iZXIsICgpID0+IG1zZyk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKGJhZGdlKSB7XG5cdFx0XHR0aGlzLmJhZGdlSGFuZGxlLnZhbHVlID0gdGhpcy5hY3Rpdml0eVNlcnZpY2Uuc2hvd1ZpZXdDb250YWluZXJBY3Rpdml0eShWSUVXTEVUX0lELCB7IGJhZGdlIH0pO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgY2xhc3MgTWFsaWNpb3VzRXh0ZW5zaW9uQ2hlY2tlciBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25zTWFuYWdlbWVudFNlcnZpY2U6IElFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSxcblx0XHRASUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2U6IElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSxcblx0XHRASUhvc3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaG9zdFNlcnZpY2U6IElIb3N0U2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASU5vdGlmaWNhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0XHRASUNvbW1hbmRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0KSB7XG5cdFx0dGhpcy5sb29wQ2hlY2tGb3JNYWxpY2lvdXNFeHRlbnNpb25zKCk7XG5cdH1cblxuXHRwcml2YXRlIGxvb3BDaGVja0Zvck1hbGljaW91c0V4dGVuc2lvbnMoKTogdm9pZCB7XG5cdFx0dGhpcy5jaGVja0Zvck1hbGljaW91c0V4dGVuc2lvbnMoKVxuXHRcdFx0LnRoZW4oKCkgPT4gdGltZW91dCgxMDAwICogNjAgKiA1KSkgLy8gZXZlcnkgZml2ZSBtaW51dGVzXG5cdFx0XHQudGhlbigoKSA9PiB0aGlzLmxvb3BDaGVja0Zvck1hbGljaW91c0V4dGVuc2lvbnMoKSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGNoZWNrRm9yTWFsaWNpb3VzRXh0ZW5zaW9ucygpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgbWFsaWNpb3VzRXh0ZW5zaW9uczogW0lMb2NhbEV4dGVuc2lvbiwgc3RyaW5nIHwgdW5kZWZpbmVkXVtdID0gW107XG5cdFx0XHRsZXQgc2hvdWxkUmVzdGFydEV4dGVuc2lvbnMgPSBmYWxzZTtcblx0XHRcdGxldCBzaG91bGRSZWxvYWRXaW5kb3cgPSBmYWxzZTtcblx0XHRcdGZvciAoY29uc3QgZXh0ZW5zaW9uIG9mIHRoaXMuZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UuaW5zdGFsbGVkKSB7XG5cdFx0XHRcdGlmIChleHRlbnNpb24uaXNNYWxpY2lvdXMgJiYgZXh0ZW5zaW9uLmxvY2FsKSB7XG5cdFx0XHRcdFx0bWFsaWNpb3VzRXh0ZW5zaW9ucy5wdXNoKFtleHRlbnNpb24ubG9jYWwsIGV4dGVuc2lvbi5tYWxpY2lvdXNJbmZvTGlua10pO1xuXHRcdFx0XHRcdHNob3VsZFJlc3RhcnRFeHRlbnNpb25zID0gc2hvdWxkUmVzdGFydEV4dGVuc2lvbnMgfHwgZXh0ZW5zaW9uLnJ1bnRpbWVTdGF0ZT8uYWN0aW9uID09PSBFeHRlbnNpb25SdW50aW1lQWN0aW9uVHlwZS5SZXN0YXJ0RXh0ZW5zaW9ucztcblx0XHRcdFx0XHRzaG91bGRSZWxvYWRXaW5kb3cgPSBzaG91bGRSZWxvYWRXaW5kb3cgfHwgZXh0ZW5zaW9uLnJ1bnRpbWVTdGF0ZT8uYWN0aW9uID09PSBFeHRlbnNpb25SdW50aW1lQWN0aW9uVHlwZS5SZWxvYWRXaW5kb3c7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGlmIChtYWxpY2lvdXNFeHRlbnNpb25zLmxlbmd0aCkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLmV4dGVuc2lvbnNNYW5hZ2VtZW50U2VydmljZS51bmluc3RhbGxFeHRlbnNpb25zKG1hbGljaW91c0V4dGVuc2lvbnMubWFwKGUgPT4gKHsgZXh0ZW5zaW9uOiBlWzBdLCBvcHRpb25zOiB7IHJlbW92ZTogdHJ1ZSB9IH0pKSk7XG5cdFx0XHRcdGZvciAoY29uc3QgW2V4dGVuc2lvbiwgbGlua10gb2YgbWFsaWNpb3VzRXh0ZW5zaW9ucykge1xuXHRcdFx0XHRcdGNvbnN0IGJ1dHRvbnM6IElQcm9tcHRDaG9pY2VbXSA9IFtdO1xuXHRcdFx0XHRcdGlmIChzaG91bGRSZXN0YXJ0RXh0ZW5zaW9ucyB8fCBzaG91bGRSZWxvYWRXaW5kb3cpIHtcblx0XHRcdFx0XHRcdGJ1dHRvbnMucHVzaCh7XG5cdFx0XHRcdFx0XHRcdGxhYmVsOiBzaG91bGRSZXN0YXJ0RXh0ZW5zaW9ucyA/IGxvY2FsaXplKCdyZXN0YXJ0Tm93JywgXCJSZXN0YXJ0IEV4dGVuc2lvbnNcIikgOiBsb2NhbGl6ZSgncmVsb2FkTm93JywgXCJSZWxvYWQgTm93XCIpLFxuXHRcdFx0XHRcdFx0XHRydW46ICgpID0+IHNob3VsZFJlc3RhcnRFeHRlbnNpb25zID8gdGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS51cGRhdGVSdW5uaW5nRXh0ZW5zaW9ucygpIDogdGhpcy5ob3N0U2VydmljZS5yZWxvYWQoKVxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmIChsaW5rKSB7XG5cdFx0XHRcdFx0XHRidXR0b25zLnB1c2goe1xuXHRcdFx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2xlYXJuTW9yZScsIFwiTGVhcm4gTW9yZVwiKSxcblx0XHRcdFx0XHRcdFx0cnVuOiAoKSA9PiB0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKCd2c2NvZGUub3BlbicsIFVSSS5wYXJzZShsaW5rKSlcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHR0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2UucHJvbXB0KFxuXHRcdFx0XHRcdFx0U2V2ZXJpdHkuV2FybmluZyxcblx0XHRcdFx0XHRcdGxvY2FsaXplKCdtYWxpY2lvdXMgd2FybmluZycsIFwiVGhlIGV4dGVuc2lvbiAnezB9JyB3YXMgZm91bmQgdG8gYmUgcHJvYmxlbWF0aWMgYW5kIGhhcyBiZWVuIHVuaW5zdGFsbGVkXCIsIGV4dGVuc2lvbi5tYW5pZmVzdC5kaXNwbGF5TmFtZSB8fCBleHRlbnNpb24uaWRlbnRpZmllci5pZCksXG5cdFx0XHRcdFx0XHRidXR0b25zLFxuXHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRzdGlja3k6IHRydWUsXG5cdFx0XHRcdFx0XHRcdHByaW9yaXR5OiBOb3RpZmljYXRpb25Qcmlvcml0eS5VUkdFTlRcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihlcnIpO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgY2xhc3MgRXh0ZW5zaW9uTWFya2V0cGxhY2VTdGF0dXNVcGRhdGVyIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgYmFkZ2VIYW5kbGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgYWNjb3VudEJhZGdlRGlzcG9zYWJsZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUFjdGl2aXR5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGFjdGl2aXR5U2VydmljZTogSUFjdGl2aXR5U2VydmljZSxcblx0XHRASUV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25HYWxsZXJ5TWFuaWZlc3RTZXJ2aWNlOiBJRXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0U2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMudXBkYXRlQmFkZ2UoKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdFNlcnZpY2Uub25EaWRDaGFuZ2VFeHRlbnNpb25HYWxsZXJ5TWFuaWZlc3RTdGF0dXMoKCkgPT4gdGhpcy51cGRhdGVCYWRnZSgpKSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHVwZGF0ZUJhZGdlKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuYmFkZ2VIYW5kbGUuY2xlYXIoKTtcblxuXHRcdGNvbnN0IHN0YXR1cyA9IHRoaXMuZXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0U2VydmljZS5leHRlbnNpb25HYWxsZXJ5TWFuaWZlc3RTdGF0dXM7XG5cdFx0bGV0IGJhZGdlOiBJQmFkZ2UgfCB1bmRlZmluZWQ7XG5cblx0XHRzd2l0Y2ggKHN0YXR1cykge1xuXHRcdFx0Y2FzZSBFeHRlbnNpb25HYWxsZXJ5TWFuaWZlc3RTdGF0dXMuUmVxdWlyZXNTaWduSW46XG5cdFx0XHRcdGJhZGdlID0gbmV3IE51bWJlckJhZGdlKDEsICgpID0+IGxvY2FsaXplKCdzaWduSW5SZXF1aXJlZCcsIFwiU2lnbiBpbiByZXF1aXJlZCB0byBhY2Nlc3MgbWFya2V0cGxhY2VcIikpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgRXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0U3RhdHVzLkFjY2Vzc0RlbmllZDpcblx0XHRcdFx0YmFkZ2UgPSBuZXcgV2FybmluZ0JhZGdlKCgpID0+IGxvY2FsaXplKCdhY2Nlc3NEZW5pZWQnLCBcIkFjY2VzcyBkZW5pZWQgdG8gbWFya2V0cGxhY2VcIikpO1xuXHRcdFx0XHRicmVhaztcblx0XHR9XG5cblx0XHRpZiAoYmFkZ2UpIHtcblx0XHRcdHRoaXMuYmFkZ2VIYW5kbGUudmFsdWUgPSB0aGlzLmFjdGl2aXR5U2VydmljZS5zaG93Vmlld0NvbnRhaW5lckFjdGl2aXR5KFZJRVdMRVRfSUQsIHsgYmFkZ2UgfSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5hY2NvdW50QmFkZ2VEaXNwb3NhYmxlLmNsZWFyKCk7XG5cdFx0aWYgKHN0YXR1cyA9PT0gRXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0U3RhdHVzLlJlcXVpcmVzU2lnbkluKSB7XG5cdFx0XHRjb25zdCBiYWRnZSA9IG5ldyBOdW1iZXJCYWRnZSgxLCAoKSA9PiBsb2NhbGl6ZSgnc2lnbiBpbiBlbnRlcnByaXNlIG1hcmtldHBsYWNlJywgXCJTaWduIGluIHRvIGFjY2VzcyBNYXJrZXRwbGFjZVwiKSk7XG5cdFx0XHR0aGlzLmFjY291bnRCYWRnZURpc3Bvc2FibGUudmFsdWUgPSB0aGlzLmFjdGl2aXR5U2VydmljZS5zaG93QWNjb3VudHNBY3Rpdml0eSh7IGJhZGdlIH0pO1xuXHRcdH1cblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxPQUFPO0FBQ1AsU0FBUyxVQUFVLGlCQUFpQjtBQUNwQyxTQUFTLFNBQVMsZUFBZTtBQUNqQyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLDhCQUE4QjtBQUV2QyxTQUFTLFlBQVksaUJBQWlCLHlCQUF5QjtBQUMvRCxTQUFTLGFBQWE7QUFDdEIsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsUUFBUSxHQUFHLFdBQVcsTUFBTSxNQUFNLHFCQUFxQixZQUFZLHVCQUF1QixXQUFXLGlCQUFpQjtBQUMvSCxTQUFTLGdCQUFnQix5QkFBeUI7QUFDbEQsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyw2QkFBK0M7QUFDeEQsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyw2QkFBMkQsWUFBWSxzQ0FBc0Msd0NBQXdDLG1DQUFtQyxrQ0FBa0MsNkJBQTZCLHFCQUFxQiw2QkFBNkIsNkJBQTZCLDRCQUE0Qix5QkFBeUIsMkJBQTJCLHFCQUFxQix5Q0FBeUM7QUFDN2QsU0FBUyxzQ0FBc0MsNENBQTRDO0FBQzNGLFNBQVMsbUNBQW9EO0FBQzdELFNBQVMsc0NBQXNDLHlDQUFxRTtBQUNwSCxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLG9CQUFvQix1QkFBdUIsd0JBQXdCLDJCQUEyQixvQ0FBb0MsK0JBQStCLGtDQUFrQyw2Q0FBNkMsb0RBQW9ELDJDQUEyQyxrREFBa0QsOEJBQThCLDBCQUEwQixpQ0FBaUMsK0JBQStCLHdCQUF3QiwyQkFBMkIsZUFBZSxrQ0FBa0M7QUFDdG1CLFNBQVMsa0JBQWtCLHdC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
